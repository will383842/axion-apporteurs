/**
 * SEC-71 — le RENOUVELLEMENT de l'accès d'un apporteur, après sa révocation par la console (contrat v2,
 * art. 3.8). La révocation a mis en file, dans SA transaction, la notification `acces_renouvele` liée à
 * son événement ; ce passage la porte, en TROIS TEMPS (sécurité, #474, 6034536145, condition 1) :
 *   (i) une transaction COURTE : la notification VERROUILLÉE (`FOR UPDATE SKIP LOCKED`), toujours à
 *       faire (aucun courriel non échoué ne la porte) et non supplantée (aucune `acces_renouvele` du même
 *       apporteur avec un `evenement_id` plus grand : A02 et la sécurité, 6034725998, 6034553279) ;
 *       l'apporteur toujours dans un statut du geste (sinon rien ne part, SEC-70) ; le motif lu dans
 *       l'événement ; les liens actifs annulés, et l'EMPREINTE du lien neuf insérée, par l'émetteur
 *       unique des liens (`lienDuRenouvellement`) ;
 *  (ii) HORS transaction, l'envoi : le LIEN d'abord, puis l'AVIS, et AUCUN avis si le lien n'est pas
 *       parti (juriste, 6034554456) ;
 * (iii) chaque courriel consigné par l'émetteur unique ; seul l'AVIS porte la notification (index
 *       `courriels_envoyes_un_par_notification`, A02, 6034725998).
 * Le jeton et le code n'existent qu'EN MÉMOIRE, le temps de l'envoi : ni la notification, ni le journal,
 * ni une ligne de courriel, ni un log ne les portent (condition 4). Un arrêt entre (i) et (iii) laisse la
 * notification à faire : le passage suivant tire un lien NEUF, qui annule l'ancien, jamais renvoyé. Le
 * lanceur sérialise le passage (A02, 6034725998).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, StatutCourriel } from '@prisma/client';
import { domaines } from '../../config/entite';
import { horlogeSysteme } from '../../lib/horloge';
import { CONNEXION } from '../../content/micro-copy/espace/vocabulaire';
import {
  CORPS_DU_RENOUVELLEMENT,
  RENOUVELLEMENT_AVANT_SIGNATURE,
  TEXTES_DES_NOTIFICATIONS,
} from '../../content/micro-copy/courriels/notifications';
import { MOTIFS_REVOCATION_ACCES } from '../../domain/evenement/charges';
import { MODELE_APPORTEUR } from '../auth/lien-magique-depot';
import { lienDuRenouvellement } from '../auth/lien-magique';
import { configurationDuLien, corpsDuCourriel } from '../auth/lien-magique-production';
import { CLE_DU_RENOUVELLEMENT, STATUTS_DU_GESTE } from '../console/acces-apporteur';
import { lireLaChargeDUnFait } from '../evenement/journal';
import {
  configurationDeLEmetteur,
  depotDesCourriels,
  emettre,
  type DemandeDEnvoi,
} from '../integrations/zeptomail/emetteur';
import { relaisZeptomail } from '../integrations/zeptomail/relais';
import { composerLeCourriel, type TexteRendu } from '../notifications/envoyer';
import { CHAMPS_PII, clesPii, decryptPii, type ClesPii } from '../securite/pii';

/** Une notification de renouvellement, telle que le lot la lit. */
export type NotificationDuRenouvellement = {
  readonly id: string;
  readonly apporteurId: string;
  readonly evenementId: string;
};

type Motif = (typeof MOTIFS_REVOCATION_ACCES)[number];

/** Les statuts d'AVANT la signature : ni attribution ni commission (juriste, 6034733889, f). */
const AVANT_SIGNATURE: readonly string[] = ['kyc_en_cours', 'pret_a_signer'];

/** Ce que (i) prépare pour l'envoi : l'adresse et les deux courriels, EN MÉMOIRE seulement. */
export type EnvoisPrepares = {
  readonly a: string;
  readonly lien: { readonly sujet: string; readonly corps: string };
  readonly avis: { readonly sujet: string; readonly corps: string };
};

export type PortsDuRenouvellement = {
  lireLot(take: number): Promise<NotificationDuRenouvellement[]>;
  /** (i) La transaction courte ; `null` si la notification n'est plus à porter. */
  preparer(n: NotificationDuRenouvellement): Promise<EnvoisPrepares | null>;
  /** (ii) et (iii) : un courriel par l'émetteur unique, HORS transaction, consigné. */
  envoyer(demande: DemandeDEnvoi): Promise<StatutCourriel>;
};

export type BilanDuRenouvellement = {
  lus: number;
  renouveles: number;
  caducs: number;
  liensNonPartis: number;
  avisNonPartis: number;
};

/** Le lot borné que porte un passage. */
export const RENOUVELLEMENTS_PAR_PASSAGE = 50;

/** L'avis du motif, avec la phrase du dossier d'inscription AVANT la signature, et son appel. */
export function avisDuRenouvellement(motif: Motif, statut: string): TexteRendu {
  const corps = CORPS_DU_RENOUVELLEMENT[motif];
  const { remplacee, par } = RENOUVELLEMENT_AVANT_SIGNATURE;
  if (AVANT_SIGNATURE.includes(statut) && !corps.endsWith(remplacee))
    throw new Error('avis_du_renouvellement : la phrase à remplacer a changé');
  const t = TEXTES_DES_NOTIFICATIONS.acces_renouvele;
  return {
    titre: t.titre,
    appel: t.appel,
    corps: AVANT_SIGNATURE.includes(statut) ? corps.slice(0, -remplacee.length) + par : corps,
  };
}

/** Le passage : le lien d'abord, l'avis ensuite, et jamais l'avis seul. */
export async function renouvelerLesAcces(
  p: PortsDuRenouvellement,
  take: number = RENOUVELLEMENTS_PAR_PASSAGE
): Promise<BilanDuRenouvellement> {
  const bilan: BilanDuRenouvellement = {
    lus: 0,
    renouveles: 0,
    caducs: 0,
    liensNonPartis: 0,
    avisNonPartis: 0,
  };
  for (const n of await p.lireLot(take)) {
    bilan.lus += 1;
    const prepares = await p.preparer(n);
    if (prepares === null) {
      bilan.caducs += 1;
      continue;
    }
    const lien = await p.envoyer({
      gabarit: 'lien_magique',
      a: prepares.a,
      sujet: prepares.lien.sujet,
      corps: prepares.lien.corps,
      apporteurId: n.apporteurId,
    });
    if (lien !== 'envoye') {
      bilan.liensNonPartis += 1;
      continue;
    }
    const avis = await p.envoyer({
      gabarit: CLE_DU_RENOUVELLEMENT,
      a: prepares.a,
      sujet: prepares.avis.sujet,
      corps: prepares.avis.corps,
      apporteurId: n.apporteurId,
      notificationEspaceId: n.id,
    });
    if (avis === 'envoye') bilan.renouveles += 1;
    else bilan.avisNonPartis += 1;
  }
  return bilan;
}

// ── les ports du processus ────────────────────────────────────────────────────────────────────────

/** Le motif fermé de la révocation, lu dans SON événement ; `null` si l'événement n'est pas le bon. */
async function motifDeLaRevocation(
  tx: Prisma.TransactionClient,
  evenementId: string
): Promise<Motif | null> {
  const fait = await lireLaChargeDUnFait(tx, evenementId);
  if (fait?.type !== 'apporteur_acces_revoque') return null;
  const motif = (fait.charge as { motif?: unknown } | null)?.motif;
  return (MOTIFS_REVOCATION_ACCES as readonly unknown[]).includes(motif) ? (motif as Motif) : null;
}

/** L'adresse stockée de l'apporteur, déchiffrée dans la transaction ; jamais consignée ni journalisée. */
async function adresseStockee(
  tx: Prisma.TransactionClient,
  apporteurId: string,
  cles: ClesPii
): Promise<string | null> {
  const a = await tx.apporteur.findUnique({
    where: { id: apporteurId },
    select: { emailChiffre: true },
  });
  if (a?.emailChiffre == null) return null;
  return decryptPii(
    { modele: MODELE_APPORTEUR, champ: CHAMPS_PII.email.chiffre, id: apporteurId },
    a.emailChiffre,
    cles
  );
}

export function portsDuRenouvellement(
  prisma: PrismaClient,
  env: Readonly<Record<string, string | undefined>>,
  maintenant: () => Date = () => new Date(horlogeSysteme.maintenant())
): PortsDuRenouvellement {
  const cles = clesPii(env);
  const statuts = [...STATUTS_DU_GESTE];
  return {
    lireLot: async (take) => {
      const lignes = await prisma.$queryRaw<
        { id: string; apporteur_id: string; evenement_id: bigint }[]
      >`
        SELECT n.id::text AS id, n.apporteur_id::text AS apporteur_id, n.evenement_id
        FROM notifications_espace n
        JOIN apporteurs a ON a.id = n.apporteur_id
        WHERE n.cle = ${CLE_DU_RENOUVELLEMENT}
          AND n.evenement_id IS NOT NULL
          AND a.statut::text = ANY(${statuts})
          AND NOT EXISTS (
            SELECT 1 FROM courriels_envoyes c
            WHERE c.notification_espace_id = n.id AND c.statut <> 'echec'
          )
          AND NOT EXISTS (
            SELECT 1 FROM notifications_espace m
            WHERE m.cle = n.cle AND m.apporteur_id = n.apporteur_id
              AND m.evenement_id > n.evenement_id
          )
        ORDER BY n.cree_at ASC, n.id ASC
        LIMIT ${take}`;
      return lignes.map((l) => ({
        id: l.id,
        apporteurId: l.apporteur_id,
        evenementId: l.evenement_id.toString(),
      }));
    },
    preparer: (n) =>
      prisma.$transaction(async (tx) => {
        const pris = await tx.$queryRaw<{ statut: string }[]>`
          SELECT a.statut::text AS statut FROM notifications_espace n
          JOIN apporteurs a ON a.id = n.apporteur_id
          WHERE n.id = ${n.id}::uuid
            AND NOT EXISTS (
              SELECT 1 FROM courriels_envoyes c
              WHERE c.notification_espace_id = n.id AND c.statut <> 'echec'
            )
            AND NOT EXISTS (
              SELECT 1 FROM notifications_espace m
              WHERE m.cle = n.cle AND m.apporteur_id = n.apporteur_id
                AND m.evenement_id > n.evenement_id
            )
          FOR UPDATE OF n SKIP LOCKED`;
        const statut = pris[0]?.statut;
        if (statut === undefined || !statuts.includes(statut as (typeof statuts)[number]))
          return null;
        const motif = await motifDeLaRevocation(tx, n.evenementId);
        if (motif === null) return null;
        const a = await adresseStockee(tx, n.apporteurId, cles);
        if (a === null) return null;
        const instant = maintenant();
        const { ligne, message } = lienDuRenouvellement(
          n.apporteurId,
          instant,
          configurationDuLien(env)
        );
        await tx.lienMagique.updateMany({
          where: { apporteurId: n.apporteurId, consommeAt: null, annuleAt: null },
          data: { annuleAt: instant },
        });
        await tx.lienMagique.create({ data: ligne });
        return {
          a,
          lien: {
            sujet: CONNEXION.courriel.sujet,
            corps: corpsDuCourriel(message.url, message.code),
          },
          avis: composerLeCourriel(
            CLE_DU_RENOUVELLEMENT,
            avisDuRenouvellement(motif, statut),
            new URL(`https://${domaines().servi}`)
          ),
        };
      }),
    envoyer: async (demande) =>
      (
        await emettre(demande, {
          configuration: configurationDeLEmetteur(env, domaines().envoi),
          relais: relaisZeptomail({ url: env.ZEPTOMAIL_API_URL, jeton: env.ZEPTOMAIL_SEND_TOKEN }),
          cles,
          nouvelId: randomUUID,
          maintenant,
          depot: depotDesCourriels(prisma),
        })
      ).statut,
  };
}
