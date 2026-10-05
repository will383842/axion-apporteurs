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
 *   — `decision_attribution` (UX-P1-58) : par `texteDeLaDecisionDansLEspace`, le MÊME gabarit que le
 *     courriel. Son motif est lu dans la charge de SON fait, par la source que l'appelant branche
 *     sur l'écrivain unique du journal (`lireLaChargeDUnFait`) : ce module ne nomme pas sa table ; les
 *     faits d'une anomalie, par le lecteur DÉDIÉ de l'espace (`lireLesFaitsPourLEspace`, sécurité,
 *     #726, 5984281779), dont ce module est le SEUL appelant. Purgés, ils deviennent le texte fermé
 *     de la juriste ; refusés, la notification est écartée. Les faits ne sont jamais consignés.
 *   — toute autre clé est écartée, sans lever : aucune n'a encore de rendu dans l'espace.
 *
 * AUCUN ÉTAT DE LECTURE : la date de lecture n'est ni lue ni écrite ici (REQ-JUR-039).
 */
import type { PrismaClient } from '@prisma/client';
import {
  dateEnClair,
  entrepriseDeLaNotification,
  texteDeLaDecisionDansLEspace,
  texteDuPremierRangDansLEspace,
} from '../attribution/notifications';
import { lireLesFaitsPourLEspace } from '../anomalie/justification';
import type { ClesPii } from '../securite/pii';
import { GABARITS } from './table-ssot';

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
export const CLES_RENDUES_DANS_L_ESPACE = ['premier_rang_libere', 'decision_attribution'] as const;

/** Une ligne `premier_rang_libere`, rendue pour l'écran ; `null` quand elle ne s'affiche pas. */
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
 * Le client dont le lecteur a besoin : les notifications de l'espace ; pour `decision_attribution`,
 * l'anomalie (par le lecteur dédié).
 */
export type ClientDesNotifications = Pick<PrismaClient, 'notificationEspace' | 'anomalie'>;

/**
 * Ce qu'il faut pour rendre `decision_attribution` : la charge d'un fait, lue par l'écrivain unique du
 * journal (branché par l'appelant), et les clés, qui ne servent qu'aux faits d'une anomalie.
 */
export type SourcesDesDecisions = {
  readonly chargeDuFait: (evenementId: string) => Promise<{ type: string; charge: unknown } | null>;
  readonly cles: ClesPii;
};

/**
 * Une ligne `decision_attribution`, rendue pour l'écran ; `null` quand elle ne s'affiche pas. Les
 * faits ne sont lus que pour une anomalie, et seulement avec les clés : sans elles, une décision qui
 * repose sur des faits est écartée, jamais rendue à moitié.
 */
async function decisionDeLEspace(
  client: ClientDesNotifications,
  l: LigneDeLEspace & { evenementId: bigint | null },
  apporteurId: string,
  sources: SourcesDesDecisions | undefined
): Promise<NotificationDeLEspace | null> {
  if (l.attribution === null || l.evenementId === null) return null;
  let entreprise: string;
  try {
    entreprise = entrepriseDeLaNotification(l.attribution.raisonSociale, l.attribution.siren);
  } catch {
    return null;
  }
  if (sources === undefined) return null;
  const fait = await sources.chargeDuFait(String(l.evenementId));
  if (fait === null || fait.type !== 'attribution_etat_modifie') return null;
  const anomalie =
    (fait.charge as { transition?: unknown } | null)?.transition === 'anomalie_confirmee';
  const faits = anomalie
    ? await lireLesFaitsPourLEspace(client, { notificationId: l.id, apporteurId }, sources.cles)
    : null;
  const texte = texteDeLaDecisionDansLEspace(entreprise, fait.charge, faits);
  if (texte === null) return null;
  return {
    id: l.id,
    titre: texte.titre,
    corps: texte.corps,
    appel: texte.appel,
    route: GABARITS.decision_attribution.route,
    quand: dateEnClair(l.creeAt),
  };
}

/**
 * Les notifications de l'apporteur DE LA SESSION, les plus récentes d'abord, déjà rendues. Une
 * notification dont l'attribution n'est pas la sienne est écartée. Sans `sources`, une décision n'est
 * pas rendue : jamais à moitié.
 */
export async function notificationsDeLEspace(
  client: ClientDesNotifications,
  apporteurId: string,
  sources?: SourcesDesDecisions
): Promise<NotificationDeLEspace[]> {
  const lignes = await client.notificationEspace.findMany({
    where: { apporteurId, cle: { in: [...CLES_RENDUES_DANS_L_ESPACE] } },
    orderBy: [{ creeAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      cle: true,
      creeAt: true,
      evenementId: true,
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
  for (const { attribution, ...n } of lignes) {
    if (attribution !== null && attribution.apporteurId !== apporteurId) continue;
    const ligne = {
      ...n,
      attribution:
        attribution === null
          ? null
          : {
              raisonSociale: attribution.raisonSociale,
              siren: attribution.siren,
              fenetreRedeclarationFinAt: attribution.fenetreRedeclarationFinAt,
            },
    };
    const e =
      n.cle === 'decision_attribution'
        ? await decisionDeLEspace(client, ligne, apporteurId, sources)
        : entreeDeLEspace(ligne);
    if (e !== null) rendues.push(e);
  }
  return rendues;
}
