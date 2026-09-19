/**
 * L'écrivain et le lecteur du journal `Evenement` — DM-01 (REQ-DM-024, REQ-DM-041,
 * partners/ADR-0015 décisions 3 et 8).
 *
 * `ajouterEvenement()` N'ACCEPTE QU'UNE TRANSACTION. REQ-DM-024 exige que toute transition
 * d'agrégat écrive son événement « dans la même transaction ». DEUX DÉFENSES, et chacune dit ce
 * qu'elle couvre :
 *   — le TYPE (`ClientDeTransaction<T>`) refuse à la compilation l'appel DIRECT avec un client qui
 *     porte `$transaction` (témoin `@ts-expect-error` dans `tests/integration/journal.spec.ts`). Il
 *     ne voit pas un client nu passé par un intermédiaire typé `Prisma.TransactionClient` : ce type
 *     n'est qu'un `Omit<>` du client, et un `PrismaClient` s'y range ;
 *   — le REFUS À L'EXÉCUTION protège tout le reste : un client qui porte encore `$transaction` n'est
 *     pas celui d'une transaction interactive ouverte, et
 *     `ajouterEvenement()` lève avant tout accès à la base.
 *   — un client `$extends` NE COMPILE PAS ici (TS2345 : son client de transaction ne satisfait pas
 *     `Prisma.TransactionClient`) : échec fermé, et aucun témoin ne dit ce que ferait le refus à
 *     l'exécution sur lui — la première tâche qui étend le client le mesurera.
 *
 * LINÉARITÉ (décision 3). Chaîne GLOBALE : l'écrivain prend `pg_advisory_xact_lock` sur une clé fixe,
 * PUIS lit la tête, dans la même transaction. Sous READ COMMITTED (défaut de Postgres et de Prisma),
 * la lecture postérieure au verrou voit le dernier commit : deux écrivains concurrents se suivent au
 * lieu de bifurquer. Si le verrou venait à manquer, `UNIQUE(prev_hash)` fait échouer FERMÉ (23505) —
 * c'est le filet, pas le mécanisme. Le verrou est relâché au commit ou au rollback.
 *
 * CHARGE FERMÉE (REQ-DM-041). La charge traverse le schéma `.strict()` de son type AVANT toute
 * écriture : une clé en trop lève, et rien n'est écrit. Le refus NOMME le chemin et le code de chaque
 * écart, JAMAIS la valeur reçue : la `ZodError` d'origine la recopie (`received: …`), et un appelant
 * qui journalise `error.message` écrirait la donnée personnelle qu'on vient de refuser.
 *
 * `agregatId` est un UUID sous sa forme canonique à tirets, NORMALISÉ en minuscules AVANT le hachage.
 * Postgres rend toujours la forme canonique minuscule : haché sous une autre forme, le maillon serait
 * en `hash_altere` pour toujours, sur une table qu'on ne corrige pas, et masquerait toute altération
 * suivante. Une autre forme (sans tirets, accolades) est refusée.
 *
 * Ce fichier est le SEUL écrivain de la table (`journal:sans-pii`, famille `ecrivain_hors_journal`).
 * Aucun client Prisma n'est créé ici : ce module reçoit celui de l'appelant.
 */
import type { Prisma, PrismaClient, TypeEvenementJournal, AgregatJournal } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { calculerSelfHash, type LigneJournal } from '../../domain/evenement/journal';

/** La clé du verrou consultatif de l'écrivain : une seule chaîne, donc une seule clé. */
const CLE_VERROU = 'evenements';

/** Un UUID sous sa forme canonique à tirets, toute casse. */
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le client d'une transaction OUVERTE : un client qui porte encore `$transaction` est refusé. */
export type ClientDeTransaction<T> = T & ('$transaction' extends keyof T ? never : unknown);

export type NouvelEvenement = {
  type: TypeEvenementJournal;
  agregat?: AgregatJournal | null;
  agregatId?: string | null;
  /** Fourni par l'appelant (horloge injectée) : rien ici ne lit l'heure. */
  survenuAt: Date;
  charge: unknown;
};

/** La charge, parsée par le schéma fermé de son type ; le refus ne porte aucune valeur reçue. */
function chargeFermee(type: TypeEvenementJournal, charge: unknown): Prisma.InputJsonObject {
  const r = CHARGES_PAR_TYPE[type].safeParse(charge);
  if (r.success) return r.data;
  const ecarts = r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} ${i.code}`);
  throw new Error(`charge refusée pour le type ${type} : ${ecarts.join(', ')}`);
}

/** L'identifiant d'agrégat, sous la forme que Postgres rendra : minuscules, à tirets. */
function agregatIdCanonique(agregatId: string | null | undefined): string | null {
  if (agregatId === null || agregatId === undefined) return null;
  if (!UUID_CANONIQUE.test(agregatId)) {
    throw new Error('agregatId refusé : un UUID sous sa forme canonique à tirets est attendu');
  }
  return agregatId.toLowerCase();
}

export async function ajouterEvenement<T extends Prisma.TransactionClient>(
  tx: ClientDeTransaction<T>,
  e: NouvelEvenement
): Promise<{ id: string; selfHash: string }> {
  // Le type ne protège que l'appel direct : un client nu passé par un intermédiaire typé
  // `Prisma.TransactionClient` compile. Ce refus-là tient pour tous les chemins.
  if ('$transaction' in tx) {
    throw new Error(
      'ajouterEvenement exige une transaction ouverte : reçu un client hors transaction'
    );
  }
  // Parse et normalisation AVANT le verrou : un refus ne prend rien et n'écrit rien.
  const charge = chargeFermee(e.type, e.charge);
  const enregistrement = {
    type: e.type,
    agregat: e.agregat ?? null,
    agregatId: agregatIdCanonique(e.agregatId),
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
