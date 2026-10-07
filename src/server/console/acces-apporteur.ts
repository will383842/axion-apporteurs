/**
 * SEC-71 — la révocation de l'accès d'un apporteur par la console (contrat v2, art. 3.8).
 *
 * « La Société peut révoquer et renouveler à tout moment un moyen d'accès pour un motif de sécurité,
 * sans que cela n'affecte les attributions ni les commissions acquises. » Et, sur signalement de
 * l'Apporteur d'un usage qu'il n'a pas autorisé, « la Société révoque l'accès » (juriste, #474,
 * 6034003544).
 *
 * LE GESTE (conditions de la sécurité, #474, 6033889353) : un admin VALIDÉ, sous step-up (le droit
 * porte `stepUp: true` et l'acteur arrive JUGÉ par `requireRole`), son droit RELU dans la transaction.
 * Deux motifs FERMÉS, jugés AVANT toute écriture : `signalement_apporteur` ou `securite` ; aucun texte.
 *
 * DANS UNE TRANSACTION, le statut de l'apporteur VERROUILLÉ (`FOR UPDATE`) :
 *   — un RÉSILIÉ est refusé (`contrat_termine`), sans rien écrire ni envoyer : son accès a pris fin
 *     avec le contrat (art. 12.3 ; juriste, 6034493150, a). Un apporteur en préavis est encore sous
 *     contrat : le geste s'applique ;
 *   — la version de session est incrémentée : toutes ses sessions tombent ;
 *   — ses appareils confirmés sont oubliés : la prochaine connexion redemande l'avis (SEC-55, SEC-62) ;
 *   — son jeton de dépôt et ses liens de connexion non consommés sont révoqués ;
 *   — l'événement `apporteur_acces_revoque` est journalisé à l'instant du GESTE — jamais celui du
 *     signalement, qu'il ne prétend pas porter (juriste, 6034493150, c) — avec le motif et l'acteur ;
 *   — le renouvellement est mis en FILE : la notification `acces_renouvele`, liée à l'événement. Aucun
 *     jeton n'est tiré ici : c'est le passage d'envoi qui tire le lien neuf, le jeton en mémoire
 *     seulement, puis envoie le lien, et l'avis ensuite (sécurité, 6034553279 ; juriste, 6034554456).
 * Rien d'autre n'est écrit : ni attribution, ni déclaration, ni commission, ni autofacture, ni statut ;
 * aucune anomalie, aucun score (art. 3.8 in fine).
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { MOTIFS_REVOCATION_ACCES } from '../../domain/evenement/charges';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';

export type MotifDeRevocation = (typeof MOTIFS_REVOCATION_ACCES)[number];

export type RefusDeRevocation =
  'motif_invalide' | 'droit_absent' | 'apporteur_inconnu' | 'contrat_termine';

export class ErreurRevocationAcces extends Error {
  constructor(readonly motif: RefusDeRevocation) {
    super(`revocation_acces_apporteur : ${motif}`);
    this.name = 'ErreurRevocationAcces';
  }
}

export interface ActeurDeLaRevocation {
  readonly id: string;
  readonly role: ConsoleRole;
}

/** La clé de la notification qui met le renouvellement en file. */
export const CLE_DU_RENOUVELLEMENT = 'acces_renouvele';

type Tx = Prisma.TransactionClient;

const DROIT = 'action:revoquer_acces_apporteur';

/** Un motif de la liste fermée, et lui seul. */
export function estUnMotifDeRevocation(motif: unknown): motif is MotifDeRevocation {
  return (MOTIFS_REVOCATION_ACCES as readonly unknown[]).includes(motif);
}

/** Le droit de l'acteur, RELU en base : admin, actif, validé ; sinon refusé. */
async function exigerUnAdministrateurValide(tx: Tx, acteur: ActeurDeLaRevocation): Promise<void> {
  if (!roleAutorise(DROIT, acteur.role)) throw new ErreurRevocationAcces('droit_absent');
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(DROIT, lu.role)
  )
    throw new ErreurRevocationAcces('droit_absent');
}

/** Le statut de l'apporteur, sa ligne VERROUILLÉE jusqu'au commit ; `null` s'il est inconnu. */
async function statutVerrouille(tx: Tx, apporteurId: string): Promise<string | null> {
  const lignes = await tx.$queryRaw<{ statut: string }[]>`
    SELECT statut::text AS statut FROM apporteurs WHERE id = ${apporteurId}::uuid FOR UPDATE`;
  return lignes[0]?.statut ?? null;
}

/** Ce que la révocation a coupé : des nombres, jamais une identité. */
export type BilanDeLaRevocation = {
  readonly appareilsOublies: number;
  readonly liensAnnules: number;
  readonly jetonsRevoques: number;
};

/** Révoquer l'accès d'un apporteur, et mettre son renouvellement en file. */
export async function revoquerLAccesDUnApporteur(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDeLaRevocation;
    apporteurId: string;
    motif: MotifDeRevocation;
    maintenant: Date;
  }
): Promise<BilanDeLaRevocation> {
  if (!estUnMotifDeRevocation(d.motif)) throw new ErreurRevocationAcces('motif_invalide');
  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur);
    const statut = await statutVerrouille(tx, d.apporteurId);
    if (statut === null) throw new ErreurRevocationAcces('apporteur_inconnu');
    if (statut === 'resilie') throw new ErreurRevocationAcces('contrat_termine');
    await tx.apporteur.update({
      where: { id: d.apporteurId },
      data: { sessionVersion: { increment: 1 } },
    });
    const appareils = await tx.appareilConnu.deleteMany({ where: { apporteurId: d.apporteurId } });
    const jetons = await tx.jetonDepot.updateMany({
      where: { apporteurId: d.apporteurId, revoqueAt: null },
      data: { revoqueAt: d.maintenant },
    });
    const liens = await tx.lienMagique.updateMany({
      where: { apporteurId: d.apporteurId, consommeAt: null, annuleAt: null },
      data: { annuleAt: d.maintenant },
    });
    const fait = await ajouterEvenement(tx, {
      type: 'apporteur_acces_revoque',
      agregat: 'apporteur',
      agregatId: d.apporteurId,
      survenuAt: d.maintenant,
      charge: { motif: d.motif, acteur: { par: 'utilisateur_console', id: d.acteur.id } },
    });
    await tx.notificationEspace.create({
      data: {
        apporteurId: d.apporteurId,
        cle: CLE_DU_RENOUVELLEMENT,
        evenementId: BigInt(fait.id),
      },
    });
    return {
      appareilsOublies: appareils.count,
      liensAnnules: liens.count,
      jetonsRevoques: jetons.count,
    };
  });
}
