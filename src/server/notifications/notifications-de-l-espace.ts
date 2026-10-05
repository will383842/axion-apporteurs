/**
 * Le lecteur des notifications de l'ESPACE (UX-P1-54, REQ-UX-016, REQ-DM-006) — arbitrage de la
 * coordination du 2026-10-04 : un lecteur serveur dédié, qui rend à l'écran des textes DÉJÀ RÉSOLUS
 * et jamais un identifiant d'attribution. La couche cloisonnée (`for-apporteur.ts`) tait
 * `attributionId` ; ce lecteur ne le lève pas : il le lit ici, côté serveur, et ne rend que le texte.
 *
 * CLOISONNEMENT : l'apporteur est celui de la SESSION, passé par l'appelant après `pageEspace` ; il
 * est dans le `where` de la seule lecture, ET l'attribution jointe doit être la sienne — sinon la
 * notification est écartée, comme au rendu du courriel (`apporteur_different`).
 *
 * CE QUI EST RENDU. Les textes canoniques de `TEXTES_DES_NOTIFICATIONS`, par `rendreLaNotification`,
 * jamais un titre d'exemple de la maquette :
 *   — `premier_rang_libere` : par `texteDuPremierRangDansLEspace`, la date limite étant le jour de la
 *     fenêtre POSÉE. Tant que la fenêtre est NULLE, la notification N'APPARAÎT PAS (juriste, option
 *     (a)) : aucun délai ne court avant l'envoi du courriel, et un texte sans date tromperait.
 *   — `mise_en_demeure` et `resiliation` (UX-P1-59, conditions de la sécurité, #726, 5984213408) : rendues DEPUIS LEUR DÉCISION, lue par le lecteur réservé `decisionDeLEspace`,
 *     l'apporteur de la session DANS LE `where`. Les faits passent `faitsPourLEcran` : le même
 *     nettoyage et la même borne qu'à l'envoi, SANS l'échappement HTML du courriel (React échappe à
 *     l'écran). Échec FERMÉ : sans clés, décision absente, autre apporteur, autre geste, autre fait,
 *     faits refusés ou purgés, la notification n'apparaît pas. Rien des faits n'est journalisé ;
 *   — `decision_attribution` n'est PAS affichée (coordination, option (c)) : son motif porterait les
 *     faits d'une anomalie dans l'espace, ce qui demande sa propre relecture ;
 *   — toute autre clé est écartée, sans lever : aucune n'a encore de rendu dans l'espace.
 *
 * AUCUN ÉTAT DE LECTURE : la date de lecture n'est ni lue ni écrite ici (REQ-JUR-039).
 */
import type { PrismaClient } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../domain/seuils/ssot';
import { MODELE_DECISION_DE_CONTRAT } from '../apporteur/resiliation';
import {
  dateEnClair,
  entrepriseDeLaNotification,
  texteDuPremierRangDansLEspace,
} from '../attribution/notifications';
import { CHAMPS_PII, decryptPii, nettoyerUnTexteSaisi, type ClesPii } from '../securite/pii';
import {
  NotificationRefusee,
  parametresDe,
  rendreLaNotification,
  type TexteRendu,
} from './envoyer';
import { GABARITS } from './table-ssot';
import {
  PARAGRAPHE_COMMUN_DE_LA_RESILIATION,
  TEXTES_DES_NOTIFICATIONS,
} from '../../content/micro-copy/courriels/notifications';
import { DECISIONS_PURGEES } from '../../content/micro-copy/espace/notifications';

/** Une notification telle que l'écran la reçoit : des textes déjà rendus, jamais un identifiant d'attribution. */
export type NotificationDeLEspace = {
  readonly id: string;
  readonly titre: string;
  readonly corps: string | null;
  readonly appel: string | null;
  /** La route de l'espace où la notification mène, ou `null` : elle n'est alors pas un lien. */
  readonly route: string | null;
  /** Le jour d'inscription dans l'espace, en clair : il ne fait courir aucun délai. */
  readonly quand: string;
};

/** Ce que le lecteur lit d'une notification et de l'entreprise de son attribution. */
export type LigneDeLEspace = {
  readonly id: string;
  readonly cle: string;
  readonly creeAt: Date;
  readonly attribution: {
    readonly raisonSociale: string | null;
    readonly siren: string;
    readonly fenetreRedeclarationFinAt: Date | null;
  } | null;
};

/** Les clés que l'espace sait rendre ; les autres sont écartées. */
export const CLES_RENDUES_DANS_L_ESPACE = [
  'premier_rang_libere',
  'mise_en_demeure',
  'resiliation',
] as const;

/** Les deux notifications du contrat, rendues depuis leur décision. */
const CLES_DU_CONTRAT: readonly string[] = ['mise_en_demeure', 'resiliation'];

/**
 * {faits} À L'ÉCRAN (sécurité, #726, 5984213408, règle 2) : le même nettoyage et la même borne qu'à
 * l'envoi (`nettoyerUnTexteSaisi`, puis `FAITS_ANOMALIE_CARACTERES_MAX` en POINTS DE CODE ; au-delà,
 * `null`, jamais une troncature), MAIS sans l'échappement HTML du courriel : React échappe à l'écran,
 * et un double échappement afficherait `&amp;`.
 */
export function faitsPourLEcran(brut: string): string | null {
  const propre = nettoyerUnTexteSaisi(brut);
  const longueur = [...propre].length;
  if (longueur === 0 || longueur > FAITS_ANOMALIE_CARACTERES_MAX.valeur) return null;
  return propre;
}

/** Une ligne, rendue pour l'écran ; `null` quand elle ne s'affiche pas. */
export function entreeDeLEspace(l: LigneDeLEspace): NotificationDeLEspace | null {
  if (l.cle !== 'premier_rang_libere' || l.attribution === null) return null;
  let entreprise: string;
  try {
    entreprise = entrepriseDeLaNotification(l.attribution.raisonSociale, l.attribution.siren);
  } catch {
    return null;
  }
  const texte = texteDuPremierRangDansLEspace(entreprise, l.attribution.fenetreRedeclarationFinAt);
  if (texte === null) return null;
  return {
    id: l.id,
    titre: texte.titre,
    corps: texte.corps,
    appel: texte.appel,
    route: GABARITS.premier_rang_libere.route,
    quand: dateEnClair(l.creeAt),
  };
}

/**
 * Le client dont le lecteur a besoin : les notifications de l'espace et, pour les deux notifications
 * du contrat, leur décision.
 */
export type ClientDesNotifications = Pick<PrismaClient, 'notificationEspace' | 'decisionDeContrat'>;

/**
 * Ce que l'appelant fournit en plus, pour les deux notifications du contrat : les clés de
 * déchiffrement des faits d'une décision, et la lecture de la charge d'un fait du journal, par le
 * lecteur délégué de l'écrivain unique (`lireLaChargeDUnFait`). Sans l'un ou l'autre, la notification
 * du contrat qui en a besoin n'apparaît pas.
 */
export type OptionsDuLecteur = {
  readonly cles?: ClesPii;
  readonly lireUnFait?: (id: string) => Promise<{ type: string; charge: unknown } | null>;
};

/** Une notification du contrat, telle que le lecteur la lit. */
type LigneDuContrat = {
  readonly cle: string;
  readonly evenementId: bigint | null;
  readonly decisionContratId: string | null;
};

/**
 * LE LECTEUR RÉSERVÉ de l'espace (sécurité, condition 1) : la décision n'est lue qu'avec l'apporteur
 * de la SESSION dans le `where` — celle d'un autre apporteur n'est jamais lue, donc jamais
 * déchiffrée. Il ne rend que le texte du gabarit de la juriste (`rendreLaNotification`), jamais
 * l'auteur de la décision. Échec FERMÉ : `null` pour tout manque. Rien n'est journalisé.
 */
async function decisionDeLEspace(
  client: ClientDesNotifications,
  apporteurId: string,
  n: LigneDuContrat,
  cles: ClesPii,
  lireUnFait: OptionsDuLecteur['lireUnFait']
): Promise<TexteRendu | null> {
  if (n.decisionContratId === null || n.evenementId === null) return null;
  const d = await client.decisionDeContrat.findFirst({
    where: { id: n.decisionContratId, apporteurId },
    select: {
      geste: true,
      article: true,
      texteChiffre: true,
      dateReception: true,
      dateEffet: true,
      evenementId: true,
      textePurgeAt: true,
    },
  });
  if (d === null || d.geste !== n.cle || d.evenementId !== n.evenementId) return null;
  // Un texte PURGÉ n'est plus lu : la notification reste, avec le texte fermé de la juriste.
  const purge = d.textePurgeAt !== null;
  let faits: string | undefined;
  if (!purge && d.texteChiffre !== null) {
    const clair = decryptPii(
      {
        modele: MODELE_DECISION_DE_CONTRAT,
        champ: CHAMPS_PII.texte.chiffre,
        id: n.decisionContratId,
      },
      d.texteChiffre,
      cles
    );
    const propre = faitsPourLEcran(clair);
    if (propre === null) return null;
    faits = propre;
  }
  try {
    if (d.geste === 'mise_en_demeure') {
      if (d.article === null) return null;
      if (purge) {
        const t = TEXTES_DES_NOTIFICATIONS.mise_en_demeure;
        return {
          titre: t.titre,
          appel: t.appel,
          corps: DECISIONS_PURGEES.mise_en_demeure.replace('{article}', d.article),
        };
      }
      if (faits === undefined) return null;
      return rendreLaNotification('mise_en_demeure', { article: d.article, faits });
    }
    if (lireUnFait === undefined) return null;
    const fait = await lireUnFait(n.evenementId.toString());
    const charge = CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse(fait?.charge);
    if (fait?.type !== 'apporteur_statut_modifie' || !charge.success) return null;
    const motif = charge.data.resiliationMotif;
    if (motif === undefined || d.dateEffet === null || d.dateReception === null) return null;
    if (purge && motif === 'manquement_grave') {
      const t = TEXTES_DES_NOTIFICATIONS.resiliation;
      const paragraphe = DECISIONS_PURGEES.manquement_grave.replace(
        '{dateEffet}',
        dateEnClair(d.dateEffet)
      );
      return {
        titre: t.titre,
        appel: t.appel,
        corps: `${paragraphe} ${PARAGRAPHE_COMMUN_DE_LA_RESILIATION}`,
      };
    }
    const candidats: Record<string, string | undefined> = {
      dateEffet: dateEnClair(d.dateEffet),
      dateReception: dateEnClair(d.dateReception),
      motif: faits,
    };
    const parametres: Record<string, string> = {};
    for (const p of parametresDe('resiliation', motif)) {
      const v = candidats[p];
      if (v === undefined) return null;
      parametres[p] = v;
    }
    return rendreLaNotification('resiliation', parametres, motif);
  } catch (e) {
    if (e instanceof NotificationRefusee) return null;
    throw e;
  }
}

/**
 * Les notifications de l'apporteur DE LA SESSION, les plus récentes d'abord, déjà rendues. Une
 * notification dont l'attribution n'est pas la sienne est écartée.
 */
export async function notificationsDeLEspace(
  client: ClientDesNotifications,
  apporteurId: string,
  options: OptionsDuLecteur = {}
): Promise<NotificationDeLEspace[]> {
  const lignes = await client.notificationEspace.findMany({
    where: { apporteurId, cle: { in: [...CLES_RENDUES_DANS_L_ESPACE] } },
    orderBy: [{ creeAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      cle: true,
      creeAt: true,
      evenementId: true,
      decisionContratId: true,
      attribution: {
        select: {
          apporteurId: true,
          raisonSociale: true,
          siren: true,
          fenetreRedeclarationFinAt: true,
        },
      },
    },
  });
  const rendues: NotificationDeLEspace[] = [];
  for (const { attribution, evenementId, decisionContratId, ...n } of lignes) {
    if (CLES_DU_CONTRAT.includes(n.cle)) {
      if (options.cles === undefined) continue;
      const texte = await decisionDeLEspace(
        client,
        apporteurId,
        { cle: n.cle, evenementId, decisionContratId },
        options.cles,
        options.lireUnFait
      );
      if (texte === null) continue;
      rendues.push({
        id: n.id,
        titre: texte.titre,
        corps: texte.corps,
        appel: texte.appel,
        route: GABARITS[n.cle as 'mise_en_demeure' | 'resiliation'].route,
        quand: dateEnClair(n.creeAt),
      });
      continue;
    }
    if (attribution !== null && attribution.apporteurId !== apporteurId) continue;
    const e = entreeDeLEspace({
      ...n,
      attribution:
        attribution === null
          ? null
          : {
              raisonSociale: attribution.raisonSociale,
              siren: attribution.siren,
              fenetreRedeclarationFinAt: attribution.fenetreRedeclarationFinAt,
            },
    });
    if (e !== null) rendues.push(e);
  }
  return rendues;
}
