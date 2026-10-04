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
import type { Prisma, PrismaClient } from '@prisma/client';
import { finDeLaFenetreDeRedeclaration } from '../../domain/attribution/fenetre-redeclaration';
import { TAILLES_DE_LOT } from '../../domain/seuils/ssot';
import type { MotifDeNonRendu } from '../attribution/notifications';
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
  ): Promise<{ sujet: string; corps: string } | { nonRendue: MotifDeNonRendu }>;
  /** L'envoi par l'émetteur unique, et sa ligne de courriel, liée à la notification. */
  envoyer(n: NotificationAEnvoyer, texte: { sujet: string; corps: string }): Promise<IssueDeLEnvoi>;
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
type Bilan = {
  envoyees: number;
  echecs: number;
  retenues: number;
  sautees: number;
  nonRendues: number;
  /** Le motif fermé de chaque non-rendu, dans l'ordre du lot : sans contenu, il se lit au battement. */
  motifsNonRendus: MotifDeNonRendu[];
};

export async function envoyerLesNotificationsDeLEspace(p: PortsDuPassage): Promise<Bilan> {
  const bilan: Bilan = {
    envoyees: 0,
    echecs: 0,
    retenues: 0,
    sautees: 0,
    nonRendues: 0,
    motifsNonRendus: [],
  };
  const lot = await p.lireLot(TAILLES_DE_LOT.NOTIFICATIONS_ENVOI_LOT.valeur);
  for (const n of lot) {
    const issue = await p.dansUneTransaction(async (g) => {
      if (!(await g.verrouiller(n))) return 'sautee' as const;
      const texte = await g.rendre(n, p.maintenant());
      if ('nonRendue' in texte) {
        bilan.motifsNonRendus.push(texte.nonRendue);
        return 'nonRendue' as const;
      }
      const envoi = await g.envoyer(n, texte);
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
] as const;

/** Ce que le passage ne sait pas faire seul : l'heure, le rendu du texte, l'envoi par l'émetteur. */
export type GestesExternes = {
  maintenant(): Date;
  rendre(
    tx: Prisma.TransactionClient,
    n: NotificationAEnvoyer,
    envoyeLe: Date
  ): Promise<{ sujet: string; corps: string } | { nonRendue: MotifDeNonRendu }>;
  envoyer(
    tx: Prisma.TransactionClient,
    n: NotificationAEnvoyer,
    texte: { sujet: string; corps: string }
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
          envoyer: (n, texte) => externes.envoyer(tx, n, texte),
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
  dependances: Omit<DependancesDeLEmetteur, 'depot'>,
  adresseDe: (tx: Prisma.TransactionClient, n: NotificationAEnvoyer) => Promise<string>
): GestesExternes['envoyer'] {
  return async (tx, n, texte) => {
    const ligne = await emettre(
      {
        gabarit: n.cle,
        a: await adresseDe(tx, n),
        sujet: texte.sujet,
        corps: texte.corps,
        apporteurId: n.apporteurId,
        notificationEspaceId: n.id,
      },
      { ...dependances, depot: depotDesCourriels(tx) }
    );
    return { statut: ligne.statut, envoyeAt: ligne.envoyeAt };
  };
}
