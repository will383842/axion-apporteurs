/**
 * Le passage d'envoi des notifications de l'espace (DM-55, REQ-UX-016, REQ-DM-004) — forme d'A02.
 *
 * La notification est écrite DANS la transaction de la transition ; son courriel part APRÈS le
 * commit, par ce passage, une seule fois et rejouable :
 *   — il prend les notifications des clés à canal courriel qui n'ont AUCUN courriel non échoué, par
 *     lots bornés (`TAILLES_DE_LOT.NOTIFICATIONS_ENVOI_LOT`), dans l'ordre d'inscription ;
 *   — chacune dans SA transaction : le verrou (`FOR UPDATE SKIP LOCKED` — deux passages ne prennent
 *     pas la même), le rendu du texte à l'heure de l'envoi, l'envoi et la ligne du courriel (dépôt lié
 *     à la transaction ; l'index `courriels_envoyes_un_par_notification` refuse un second courriel
 *     non échoué), puis la fenêtre, puis le commit ;
 *   — LE DÉLAI COURT DE L'ENVOI EFFECTIF (REQ-UX-016, juriste) : pour `premier_rang_libere`, la
 *     fenêtre de redéclaration est posée à partir de `envoye_at`, une fois (le port ne pose que si elle
 *     est nulle), et finit à minuit, heure de Paris, après le jour envoi + 15 (borne exclusive). Un courriel en échec ou retenu ne pose rien : aucun
 *     délai ne court tant qu'il n'est pas parti.
 * Un plantage entre le relais et le commit n'écrit rien : le passage suivant renvoie. Le doublon
 * possible est un second courriel d'INFORMATION, jamais un délai raccourci.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { domaines } from '../../config/entite';
import { horlogeSysteme } from '../../lib/horloge';
import { lireLesFaitsPourLaNotification } from '../anomalie/justification';
import { rendreDepuisLaBase } from '../attribution/notifications';
import { GESTE_DE_LA_CLE_DU_CONTRAT, rendreUneDecisionDeContrat } from '../apporteur/resiliation';
import { MODELE_APPORTEUR } from '../auth/lien-magique-depot';
import { lireLaChargeDUnFait } from '../evenement/journal';
import { configurationDeLEmetteur } from '../integrations/zeptomail/emetteur';
import { relaisZeptomail } from '../integrations/zeptomail/relais';
import { composerLeCourriel, type CourrielCompose } from '../notifications/envoyer';
import { CHAMPS_PII, clesPii, decryptPii, type ClesPii } from '../securite/pii';
import { finDeLaFenetreDeRedeclaration } from '../../domain/attribution/fenetre-redeclaration';
import { TAILLES_DE_LOT } from '../../domain/seuils/ssot';
import { MOTIFS_DE_NON_RENDU, type MotifDeNonRendu } from '../attribution/notifications';
import type { Alerteur } from '../integrations/telegram/alertes';
import {
  depotDesCourriels,
  emettre,
  type DependancesDeLEmetteur,
} from '../integrations/zeptomail/emetteur';

/** Une notification à porter par courriel, telle que le passage la lit. */
export type NotificationAEnvoyer = {
  id: string;
  cle: string;
  apporteurId: string;
  attributionId: string | null;
  evenementId: string | null;
  /** L'anomalie confirmée qui fonde une `decision_attribution` ; nulle sinon, ou vidée. */
  anomalieId: string | null;
  /** SEC-19 : la décision de contrat d'une `mise_en_demeure` ou d'une `resiliation` ; nulle sinon, ou vidée. */
  decisionContratId: string | null;
};

export type IssueDeLEnvoi = {
  statut: 'envoye' | 'echec' | 'retenu_adresse_supprimee' | 'retenu_dmarc_non_verifie';
  /** L'heure de l'envoi effectif, consignée avec le courriel ; nulle s'il n'est pas parti. */
  envoyeAt: Date | null;
};

/** Les gestes d'une transaction du passage, liés à elle. */
export type GestesDeLaTransaction = {
  /** Le verrou ; faux si la notification est prise ailleurs, ou déjà portée par un courriel non échoué. */
  verrouiller(n: NotificationAEnvoyer): Promise<boolean>;
  /** Le texte, rendu à l'heure de l'envoi ; sinon le motif FERMÉ du non-rendu. */
  rendre(
    n: NotificationAEnvoyer,
    envoyeLe: Date
  ): Promise<CourrielCompose | { nonRendue: MotifDeNonRendu }>;
  /**
   * L'envoi par l'émetteur unique, et sa ligne de courriel, liée à la notification. `envoyeLe` est
   * l'heure DONNÉE au rendu : le courriel la consigne, et la fenêtre en part (juriste).
   */
  envoyer(n: NotificationAEnvoyer, texte: CourrielCompose, envoyeLe: Date): Promise<IssueDeLEnvoi>;
  /** La fenêtre de redéclaration, posée seulement si elle est encore nulle. */
  poserLaFenetre(attributionId: string, finAt: Date): Promise<void>;
};

export type PortsDuPassage = {
  maintenant(): Date;
  lireLot(take: number): Promise<NotificationAEnvoyer[]>;
  dansUneTransaction<T>(fn: (g: GestesDeLaTransaction) => Promise<T>): Promise<T>;
};

/** Les clés dont l'envoi fait courir la fenêtre de redéclaration (art. 3.5 al. 2). */
const CLES_A_FENETRE: ReadonlySet<string> = new Set(['premier_rang_libere']);

/**
 * `nonRendues` : un texte dont un paramètre manque n'envoie rien et se COMPTE — le lanceur rend le
 * bilan, rien n'est tu —, sans bloquer les notifications suivantes du lot.
 */
export type Bilan = {
  envoyees: number;
  echecs: number;
  retenues: number;
  sautees: number;
  nonRendues: number;
} & Partial<Record<`nonRendue_${MotifDeNonRendu}`, number>>;

export async function envoyerLesNotificationsDeLEspace(p: PortsDuPassage): Promise<Bilan> {
  const bilan: Bilan = {
    envoyees: 0,
    echecs: 0,
    retenues: 0,
    sautees: 0,
    nonRendues: 0,
  };
  const lot = await p.lireLot(TAILLES_DE_LOT.NOTIFICATIONS_ENVOI_LOT.valeur);
  for (const n of lot) {
    const issue = await p.dansUneTransaction(async (g) => {
      if (!(await g.verrouiller(n))) return 'sautee' as const;
      // UNE heure par notification, lue une fois : le rendu, l'envoi et la fenêtre la partagent.
      const envoyeLe = p.maintenant();
      const texte = await g.rendre(n, envoyeLe);
      if ('nonRendue' in texte) {
        // Un compteur par motif FERMÉ : le battement nomme le motif, jamais la notification.
        const cle = `nonRendue_${texte.nonRendue}` as const;
        bilan[cle] = (bilan[cle] ?? 0) + 1;
        return 'nonRendue' as const;
      }
      const envoi = await g.envoyer(n, texte, envoyeLe);
      if (envoi.statut !== 'envoye') return envoi.statut === 'echec' ? 'echec' : 'retenue';
      if (CLES_A_FENETRE.has(n.cle) && n.attributionId !== null && envoi.envoyeAt !== null) {
        // La fin, calculée par le domaine : minuit, heure de Paris, après le jour envoi + 15 (exclue).
        const finAt = new Date(finDeLaFenetreDeRedeclaration(envoi.envoyeAt.getTime()));
        await g.poserLaFenetre(n.attributionId, finAt);
      }
      return 'envoyee' as const;
    });
    if (issue === 'sautee') bilan.sautees += 1;
    else if (issue === 'nonRendue') bilan.nonRendues += 1;
    else if (issue === 'echec') bilan.echecs += 1;
    else if (issue === 'retenue') bilan.retenues += 1;
    else bilan.envoyees += 1;
  }
  return bilan;
}

// ── l'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

/**
 * La liste FERMÉE et nommée des clés dont le courriel part par ce passage (condition d'A02). Une clé
 * a un seul chemin d'envoi : le passage, ou `notifier()` en synchrone, jamais les deux — un témoin
 * statique le tient dans les deux sens. DM-25 y ajoutera `attribution_annulee_anteriorite`.
 */
export const CLES_ENVOYEES_PAR_LE_PASSAGE = [
  'decision_attribution',
  'premier_rang_libere',
  // SEC-19 (A02, #703) : les deux notifications du contrat, rendues depuis leur décision ; leur
  // courriel fait courir un délai (la mise en demeure, le préavis), compté de `envoye_at`.
  'mise_en_demeure',
  'resiliation',
  // SEC-15 : la suspension, rendue depuis sa décision ; ses quinze jours courent de la pose.
  'suspension_declarations',
  // DM-25 : l'annulation pour antériorité de la Société, écrite avec son événement par la transition.
  'attribution_annulee_anteriorite',
] as const;

/** Les clés du contrat : leur texte se rend depuis la décision liée, jamais depuis une attribution. */
const CLES_DU_CONTRAT: readonly string[] = Object.keys(GESTE_DE_LA_CLE_DU_CONTRAT);

/** Ce que le passage ne sait pas faire seul : l'heure, le rendu du texte, l'envoi par l'émetteur. */
export type GestesExternes = {
  maintenant(): Date;
  rendre(
    tx: Prisma.TransactionClient,
    n: NotificationAEnvoyer,
    envoyeLe: Date
  ): Promise<CourrielCompose | { nonRendue: MotifDeNonRendu }>;
  envoyer(
    tx: Prisma.TransactionClient,
    n: NotificationAEnvoyer,
    texte: CourrielCompose,
    envoyeLe: Date
  ): Promise<IssueDeLEnvoi>;
};

/**
 * Les ports du passage sur la base. Le lot ne prend que les clés de la liste fermée, et seulement
 * les notifications qui PORTENT leur événement (`evenement_id`, écrit avec la transition ; le CHECK
 * `notifications_espace_machine_a_son_evenement` l'exige déjà pour ces clés).
 */
export function portsDuPassage(prisma: PrismaClient, externes: GestesExternes): PortsDuPassage {
  return {
    maintenant: externes.maintenant,
    lireLot: async (take) => {
      const lignes = await prisma.notificationEspace.findMany({
        where: {
          cle: { in: [...CLES_ENVOYEES_PAR_LE_PASSAGE] },
          evenementId: { not: null },
          courriels: { none: { statut: { not: 'echec' } } },
        },
        orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
        take,
        select: {
          id: true,
          cle: true,
          apporteurId: true,
          attributionId: true,
          evenementId: true,
          anomalieId: true,
          decisionContratId: true,
        },
      });
      return lignes.map((l) => ({
        ...l,
        evenementId: l.evenementId === null ? null : l.evenementId.toString(),
      }));
    },
    dansUneTransaction: (fn) =>
      prisma.$transaction((tx) =>
        fn({
          verrouiller: async (n) => {
            const pris = await tx.$queryRaw<{ id: string }[]>`
              SELECT n.id::text AS id FROM notifications_espace n
              WHERE n.id = ${n.id}::uuid
                AND NOT EXISTS (
                  SELECT 1 FROM courriels_envoyes c
                  WHERE c.notification_espace_id = n.id AND c.statut <> 'echec'
                )
              FOR UPDATE SKIP LOCKED`;
            return pris.length === 1;
          },
          rendre: (n, envoyeLe) => externes.rendre(tx, n, envoyeLe),
          envoyer: (n, texte, envoyeLe) => externes.envoyer(tx, n, texte, envoyeLe),
          poserLaFenetre: async (attributionId, finAt) => {
            await tx.attribution.updateMany({
              where: { id: attributionId, fenetreRedeclarationFinAt: null },
              data: { fenetreRedeclarationFinAt: finAt },
            });
          },
        })
      ),
  };
}

/**
 * Le pont vers l'émetteur unique : le courriel est demandé avec le dépôt LIÉ à la transaction du
 * passage, et sa ligne porte la notification. L'heure rendue est celle de l'envoi effectif, nulle
 * s'il n'est pas parti — retenu ou en échec, aucun délai ne court. L'adresse est lue par l'appelant
 * dans la même transaction ; elle n'est jamais consignée, seule son empreinte l'est.
 */
export function envoyerParLEmetteur(
  dependances: Omit<DependancesDeLEmetteur, 'depot' | 'maintenant'>,
  adresseDe: (tx: Prisma.TransactionClient, n: NotificationAEnvoyer) => Promise<string>
): GestesExternes['envoyer'] {
  return async (tx, n, texte, envoyeLe) => {
    const ligne = await emettre(
      {
        gabarit: n.cle,
        a: await adresseDe(tx, n),
        sujet: texte.sujet,
        corps: texte.corps,
        ...(texte.html === undefined ? {} : { html: texte.html }),
        apporteurId: n.apporteurId,
        notificationEspaceId: n.id,
      },
      // UNE heure : celle du rendu. La demande et l'envoi consignés la portent, même si le relais
      // dure au-delà de minuit — le texte et la fenêtre disent alors la même date.
      { ...dependances, maintenant: () => envoyeLe, depot: depotDesCourriels(tx) }
    );
    return { statut: ligne.statut, envoyeAt: ligne.envoyeAt };
  };
}

// ── le passage du processus, tel que le lanceur l'inscrit ─────────────────────────────────────────

/** L'adresse du destinataire, déchiffrée dans la transaction ; jamais consignée, jamais journalisée. */
async function adresseDuDestinataire(
  tx: Prisma.TransactionClient,
  n: NotificationAEnvoyer,
  cles: ClesPii
): Promise<string> {
  const a = await tx.apporteur.findUnique({
    where: { id: n.apporteurId },
    select: { emailChiffre: true },
  });
  if (a?.emailChiffre == null) {
    throw new Error(`adresse_absente : la notification ${n.id} n'a pas d'adresse de destination`);
  }
  return decryptPii(
    { modele: MODELE_APPORTEUR, champ: CHAMPS_PII.email.chiffre, id: n.apporteurId },
    a.emailChiffre,
    cles
  );
}

/**
 * Le passage du lanceur : l'heure du système, le rendu depuis la base (la charge par l'écrivain unique
 * du journal, les faits par le second lecteur de la justification, la composition de `notifier()`),
 * et l'émetteur unique — son drapeau DMARC décide seul si un courriel part ; fermé, la ligne est
 * `retenu_dmarc_non_verifie` et aucun délai ne court.
 */
export function passageDEnvoiDesNotifications(
  prisma: PrismaClient,
  env: Readonly<Record<string, string | undefined>>
): () => Promise<Awaited<ReturnType<typeof envoyerLesNotificationsDeLEspace>>> {
  return () => {
    const cles = clesPii(env);
    const maintenant = () => new Date(horlogeSysteme.maintenant());
    const urlDeLEspace = new URL(`https://${domaines().servi}`);
    let envoi: GestesExternes['envoyer'] | undefined;
    return envoyerLesNotificationsDeLEspace(
      portsDuPassage(prisma, {
        maintenant,
        rendre: (tx, n, envoyeLe) =>
          CLES_DU_CONTRAT.includes(n.cle)
            ? rendreUneDecisionDeContrat(tx, n, {
                cles,
                composer: (cle, texte) => composerLeCourriel(cle, texte, urlDeLEspace),
              })
            : rendreDepuisLaBase(tx, n, envoyeLe, {
                chargeDuFait: async (t, id) => {
                  const fait = await lireLaChargeDUnFait(t, id);
                  return fait?.type === 'attribution_etat_modifie' ? fait.charge : null;
                },
                faitsDe: (t, q) => lireLesFaitsPourLaNotification(t, q, cles),
                composer: (cle, texte) => composerLeCourriel(cle, texte, urlDeLEspace),
              }),
        // L'émetteur est construit au PREMIER envoi : une configuration absente fait échouer l'envoi,
        // nommée, jamais un passage qui n'a rien à envoyer.
        envoyer: (tx, n, texte, envoyeLe) => {
          envoi ??= envoyerParLEmetteur(
            {
              configuration: configurationDeLEmetteur(env, domaines().envoi),
              relais: relaisZeptomail({
                url: env.ZEPTOMAIL_API_URL,
                jeton: env.ZEPTOMAIL_SEND_TOKEN,
              }),
              cles,
              nouvelId: randomUUID,
            },
            (t, m) => adresseDuDestinataire(t, m, cles)
          );
          return envoi(tx, n, texte, envoyeLe);
        },
      })
    );
  };
}

/**
 * Un non-rendu lève, EN PLUS du compteur au battement, une alerte Telegram par motif présent
 * (arbitrage de la sécurité) : la catégorie `notification_non_rendue`, le motif fermé et son nombre,
 * rien d'autre. Sans canal configuré, le compteur reste seul.
 */
export async function alerterLesNonRendus(
  bilan: Bilan,
  alerteur: Pick<Alerteur, 'alerter'> | null
): Promise<void> {
  if (alerteur === null) return;
  for (const motif of MOTIFS_DE_NON_RENDU) {
    const nombre = bilan[`nonRendue_${motif}`];
    if (nombre === undefined || nombre === 0) continue;
    await alerteur.alerter({
      categorie: 'notification_non_rendue',
      id: randomUUID(),
      nonRendu: { motif, nombre },
    });
  }
}
