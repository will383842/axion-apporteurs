/**
 * L'écrivain et le lecteur du journal `Evenement` — DM-01 (REQ-DM-024, REQ-DM-041,
 * partners/ADR-0014 décision 3).
 *
 * `ajouterEvenement()` N'ACCEPTE QU'UNE TRANSACTION. REQ-DM-024 exige que toute transition
 * d'agrégat écrive son événement « dans la même transaction » : le type l'impose, un client nu ne
 * compile pas. L'appelant ouvre `prisma.$transaction(async (tx) => …)`, écrit sa transition, puis
 * l'événement — les deux tiennent ou tombent ensemble.
 *
 * LINÉARITÉ (décision 3). Chaîne GLOBALE : l'écrivain prend `pg_advisory_xact_lock` sur une clé fixe, PUIS
 * lit la tête, dans la même transaction. Sous READ COMMITTED (défaut de Postgres et de Prisma), la
 * lecture postérieure au verrou voit le dernier commit : deux écrivains concurrents se suivent au
 * lieu de bifurquer. Si le verrou venait à manquer, `UNIQUE(prev_hash)` fait échouer FERMÉ (23505) —
 * c'est le filet, pas le mécanisme. Le verrou est relâché au commit ou au rollback.
 *
 * CHARGE FERMÉE (REQ-DM-041). La charge traverse le schéma `.strict()` de son type AVANT toute
 * écriture : une clé en trop lève, et rien n'est écrit.
 *
 * Aucun client Prisma n'est créé ici : ce module reçoit celui de l'appelant.
 */
import type { Prisma, PrismaClient, TypeEvenementJournal, AgregatJournal } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { calculerSelfHash, type LigneJournal } from '../../domain/evenement/journal';

/** La clé du verrou consultatif de l'écrivain : une seule chaîne, donc une seule clé. */
const CLE_VERROU = 'evenements';

export type NouvelEvenement = {
  type: TypeEvenementJournal;
  agregat?: AgregatJournal | null;
  agregatId?: string | null;
  /** Fourni par l'appelant (horloge injectée) : rien ici ne lit l'heure. */
  survenuAt: Date;
  charge: unknown;
};

export async function ajouterEvenement(
  tx: Prisma.TransactionClient,
  e: NouvelEvenement
): Promise<{ id: string; selfHash: string }> {
  // Parse AVANT le verrou : une charge refusée ne prend rien et n'écrit rien.
  const charge: Prisma.InputJsonObject = CHARGES_PAR_TYPE[e.type].parse(e.charge);
  const enregistrement = {
    type: e.type,
    agregat: e.agregat ?? null,
    agregatId: e.agregatId ?? null,
    survenuAt: e.survenuAt.toISOString(),
    charge,
  };

  // `$executeRaw`, pas `$queryRaw` : Prisma ne sait pas désérialiser la colonne `void` du résultat.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CLE_VERROU}, 0))`;
  const tete = await tx.evenement.findFirst({
    orderBy: { id: 'desc' },
    select: { selfHash: true },
  });
  if (!tete) {
    throw new Error(
      'journal sans genèse : la table `evenements` est vide, la première migration ne l’a pas ouverte'
    );
  }

  const selfHash = calculerSelfHash(tete.selfHash, enregistrement);
  const cree = await tx.evenement.create({
    data: { ...enregistrement, survenuAt: e.survenuAt, prevHash: tete.selfHash, selfHash },
    select: { id: true },
  });
  return { id: cree.id.toString(), selfHash };
}

/** Le journal entier, dans la forme que `verifierChaine()` lit : ids en chaîne, dates en ISO UTC. */
export async function lireJournal(
  client: PrismaClient | Prisma.TransactionClient
): Promise<LigneJournal[]> {
  const lignes = await client.evenement.findMany({ orderBy: { id: 'asc' } });
  return lignes.map((l) => ({
    id: l.id.toString(),
    type: l.type,
    agregat: l.agregat,
    agregatId: l.agregatId,
    survenuAt: l.survenuAt.toISOString(),
    charge: l.charge,
    prevHash: l.prevHash,
    selfHash: l.selfHash,
  }));
}
