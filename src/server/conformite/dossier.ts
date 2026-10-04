/**
 * Le dossier de conformité d'un apporteur, en console (CPL-T07, REQ-DM-027).
 *
 * TROIS GESTES, CHACUN UNE TRANSACTION AVEC SON ÉVÉNEMENT :
 *  — VÉRIFIER une pièce `a_verifier` (`action:verifier_piece`) : la valider, ou la refuser avec UN
 *    motif fermé (`MOTIFS_REFUS_PIECE`), jamais un texte libre ; `piece_kyc_statut_modifie`. Une
 *    pièce à échéance (RC pro, vigilance) ne se valide pas échue. Le RIB n'est PAS vérifié ici : sa
 *    validation, à quatre yeux et sous relèvement, appartient à une tâche dédiée (condition de la
 *    sécurité) ; ce geste le refuse, nommé. Valider une pièce alors qu'une autre est courante ÉCARTE l'ancienne
 *    (`remplacee_at`) ; refuser une pièce alors qu'une autre est courante l'écarte ELLE, dans la même
 *    écriture : l'index `pieces_kyc_une_courante` n'admet qu'une courante (forme d'A02). Ici,
 *    `remplacee_at` signifie donc « écartée du service, par remplacement OU par refus » ;
 *  — OUVRIR le KYC (`retenu` → `kyc_en_cours`) et le VALIDER (`kyc_en_cours` → `pret_a_signer`),
 *    par la matrice des statuts ; `apporteur_statut_modifie`. La validation exige les pièces de
 *    `manquesPourSigner` (selon la juriste) et nomme chaque pièce manquante, jamais un autre motif.
 *
 * Le droit est demandé à la matrice des rôles ; l'action de serveur arrive JUGÉE par `requireRole`.
 * Aucune donnée de personne dans un refus ou un événement ; l'IBAN n'est jamais lu ici.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';
import {
  TYPES_A_ECHEANCE,
  manquesPourSigner,
  type MotifRefusPiece,
  type TypePieceKyc,
} from '../../domain/kyc/pieces';
import { ErreurTransitionApporteur, transitionner } from '../../domain/apporteur/matrice';
import type { StatutApporteur } from '../../domain/apporteur/statut';

export type MotifDuDossier =
  | 'droit_absent'
  | 'introuvable'
  | 'piece_pas_a_verifier'
  | 'rib_hors_de_ce_geste'
  | 'echeance_passee'
  | 'transition_refusee'
  | 'pieces_manquantes';

export class ErreurDossierDeConformite extends Error {
  constructor(
    readonly motif: MotifDuDossier,
    /** Pour `pieces_manquantes` : les pièces qui manquent, nommées. */
    readonly manquantes: readonly TypePieceKyc[] = []
  ) {
    super(
      manquantes.length === 0
        ? `dossier_de_conformite : ${motif}`
        : `dossier_de_conformite : ${motif} (${manquantes.join(', ')})`
    );
    this.name = 'ErreurDossierDeConformite';
  }
}

export interface ActeurDuDossier {
  readonly id: string;
  readonly role: Parameters<typeof roleAutorise>[1];
}

export type VerdictDePiece =
  | { readonly decision: 'valider' }
  | { readonly decision: 'refuser'; readonly motif: MotifRefusPiece };

type Tx = Prisma.TransactionClient;

function exigerLeDroit(acteur: ActeurDuDossier, droit: string): void {
  if (!roleAutorise(droit, acteur.role)) throw new ErreurDossierDeConformite('droit_absent');
}

const parLaConsole = (acteur: ActeurDuDossier) =>
  ({ par: 'utilisateur_console', id: acteur.id }) as const;

/** Valider ou refuser une pièce `a_verifier`. */
export async function verifierUnePiece(
  prisma: PrismaClient,
  d: { acteur: ActeurDuDossier; pieceId: string; verdict: VerdictDePiece; maintenant: Date }
): Promise<void> {
  exigerLeDroit(d.acteur, 'action:verifier_piece');
  await prisma.$transaction(async (tx) => {
    const piece = await tx.pieceKyc.findUnique({
      where: { id: d.pieceId },
      select: { id: true, apporteurId: true, type: true, statut: true, expireAt: true },
    });
    if (piece === null) throw new ErreurDossierDeConformite('introuvable');
    // Condition de la sécurité : aucun RIB ne change de statut par ce geste, ni validé ni refusé.
    if (piece.type === 'rib') throw new ErreurDossierDeConformite('rib_hors_de_ce_geste');
    if (piece.statut !== 'a_verifier') throw new ErreurDossierDeConformite('piece_pas_a_verifier');
    const valider = d.verdict.decision === 'valider';
    if (valider) {
      const aEcheance = (TYPES_A_ECHEANCE as readonly TypePieceKyc[]).includes(piece.type);
      if (aEcheance && (piece.expireAt === null || piece.expireAt <= d.maintenant))
        throw new ErreurDossierDeConformite('echeance_passee');
    }
    const courante = await tx.pieceKyc.findFirst({
      where: {
        apporteurId: piece.apporteurId,
        type: piece.type,
        remplaceeAt: null,
        statut: { not: 'a_verifier' },
        id: { not: piece.id },
      },
      select: { id: true },
    });
    if (valider && courante !== null)
      await tx.pieceKyc.update({
        where: { id: courante.id },
        data: { remplaceeAt: d.maintenant },
      });
    const { count } = await tx.pieceKyc.updateMany({
      where: { id: piece.id, statut: 'a_verifier' },
      data: {
        statut: valider ? 'valide' : 'refusee',
        verifieeAt: d.maintenant,
        // Refusée à côté d'une courante : écartée du service dans la même écriture.
        ...(!valider && courante !== null ? { remplaceeAt: d.maintenant } : {}),
      },
    });
    if (count === 0) throw new ErreurDossierDeConformite('piece_pas_a_verifier');
    await ajouterEvenement(tx, {
      type: 'piece_kyc_statut_modifie',
      agregat: 'piece_kyc',
      agregatId: piece.id,
      survenuAt: d.maintenant,
      charge: {
        de: 'a_verifier',
        vers: valider ? 'valide' : 'refusee',
        type: piece.type,
        ...(d.verdict.decision === 'refuser' ? { motifRefus: d.verdict.motif } : {}),
        acteur: parLaConsole(d.acteur),
      },
    });
  });
}

/** Le statut de l'apporteur, avancé par la matrice des statuts, et son événement. */
async function avancer(
  tx: Tx,
  d: { acteur: ActeurDuDossier; apporteurId: string; maintenant: Date },
  fait: 'ouvrir_kyc' | 'valider_kyc',
  avant?: (de: StatutApporteur) => Promise<void>
): Promise<void> {
  const a = await tx.apporteur.findUnique({
    where: { id: d.apporteurId },
    select: { statut: true },
  });
  if (a === null) throw new ErreurDossierDeConformite('introuvable');
  const de = a.statut as StatutApporteur;
  let vers: StatutApporteur;
  try {
    vers = transitionner({ de, evenementApporteur: fait, motif: null }).statut;
  } catch (e) {
    if (e instanceof ErreurTransitionApporteur)
      throw new ErreurDossierDeConformite('transition_refusee');
    throw e;
  }
  if (avant) await avant(de);
  const { count } = await tx.apporteur.updateMany({
    where: { id: d.apporteurId, statut: de },
    data: { statut: vers },
  });
  if (count === 0) throw new ErreurDossierDeConformite('transition_refusee');
  await ajouterEvenement(tx, {
    type: 'apporteur_statut_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de, vers, transition: fait, acteur: parLaConsole(d.acteur) },
  });
}

/** Ouvrir le KYC d'un apporteur retenu (`retenu` → `kyc_en_cours`). */
export async function ouvrirLeKyc(
  prisma: PrismaClient,
  d: { acteur: ActeurDuDossier; apporteurId: string; maintenant: Date }
): Promise<void> {
  exigerLeDroit(d.acteur, 'action:ouvrir_kyc');
  await prisma.$transaction((tx) => avancer(tx, d, 'ouvrir_kyc'));
}

/** Les pièces et le régime de TVA d'un apporteur, tels que le juge du KYC les lit. */
async function lirePourLeJuge(tx: Tx, apporteurId: string) {
  const [pieces, identite] = await Promise.all([
    tx.pieceKyc.findMany({
      where: { apporteurId },
      select: { type: true, statut: true, expireAt: true, remplaceeAt: true },
    }),
    tx.identiteFacturation.findFirst({
      where: { apporteurId, finAt: null },
      orderBy: { debutAt: 'desc' },
      select: { regimeTva: true },
    }),
  ]);
  return { pieces, regimeTva: identite?.regimeTva ?? null };
}

/**
 * Valider le KYC (`kyc_en_cours` → `pret_a_signer`) : seulement si rien ne manque pour signer ; le
 * refus nomme chaque pièce manquante.
 */
export async function validerLeKyc(
  prisma: PrismaClient,
  d: { acteur: ActeurDuDossier; apporteurId: string; maintenant: Date }
): Promise<void> {
  exigerLeDroit(d.acteur, 'action:valider_kyc');
  await prisma.$transaction((tx) =>
    avancer(tx, d, 'valider_kyc', async () => {
      const { pieces, regimeTva } = await lirePourLeJuge(tx, d.apporteurId);
      const manques = manquesPourSigner(pieces, regimeTva, d.maintenant);
      if (manques.length > 0) throw new ErreurDossierDeConformite('pieces_manquantes', manques);
    })
  );
}

/** Le dossier, lu pour l'écran de la console : identifiants, types, statuts et dates ; jamais l'IBAN. */
export async function lireLeDossier(
  prisma: PrismaClient,
  d: { apporteurId: string; maintenant: Date }
) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.apporteur.findUnique({
      where: { id: d.apporteurId },
      select: { id: true, statut: true },
    });
    if (a === null) return null;
    const [pieces, identite] = await Promise.all([
      tx.pieceKyc.findMany({
        where: { apporteurId: d.apporteurId },
        select: {
          id: true,
          type: true,
          statut: true,
          expireAt: true,
          verifieeAt: true,
          remplaceeAt: true,
        },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      }),
      tx.identiteFacturation.findFirst({
        where: { apporteurId: d.apporteurId, finAt: null },
        orderBy: { debutAt: 'desc' },
        select: { siren: true, regimeTva: true },
      }),
    ]);
    return {
      statut: a.statut as StatutApporteur,
      identite,
      pieces,
      manques: manquesPourSigner(pieces, identite?.regimeTva ?? null, d.maintenant),
    };
  });
}
