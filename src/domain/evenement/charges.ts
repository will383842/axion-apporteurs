/**
 * La charge d'un événement du journal est un schéma Zod FERMÉ par type — DM-01 (REQ-DM-041,
 * partners/ADR-0014 décision 4).
 *
 * POURQUOI FERMÉ. Le journal est append-only : la base refuse toute mise à jour (REQ-DM-024). Une
 * donnée personnelle glissée dans une charge ne pourrait donc JAMAIS être effacée — le droit à
 * l'effacement (RGPD art. 17) buterait sur le déclencheur. La seule issue est qu'aucune charge ne
 * porte de donnée personnelle : alors effacer un tiers ne touche jamais `evenements`, et la chaîne
 * reste vérifiable après l'effacement.
 *
 * LA LISTE FERMÉE DES FORMES. Chaque feuille d'une charge est l'une de celles-ci, et rien d'autre :
 *   — identifiant       `z.string().uuid()`                                   → `FORMES.identifiant()`
 *   — empreinte         `z.string().regex(HASH_HEX_64)` — CETTE constante      → `FORMES.empreinte()`
 *   — enum / littéral   `z.enum`, `z.nativeEnum`, `z.literal` d'une chaîne
 *   — montant           `z.number().int()` sur un champ suffixé `Cents`       → `FORMES.montantCents()`
 *   — horodatage        `z.string().datetime()`                               → `FORMES.horodatage()`
 *   — `optional` / `nullable` d'une forme admise ; objet imbriqué `.strict()`.
 * Tout le reste est refusé — `z.string()` nu compris : une chaîne libre peut porter un courriel.
 * C'est `scripts/gates/journal-sans-pii.ts` (`pnpm journal:sans-pii`) qui le vérifie, sur le schéma
 * lui-même, et `ajouterEvenement()` qui l'applique à l'exécution (`parse` strict : rien n'est écrit).
 *
 * LES TYPES NE SONT PAS RECOPIÉS D'UNE SOURCE : `TypeEvenementJournal` est l'enum de
 * `prisma/schema.prisma`. L'union locale ci-dessous n'existe que parce que le domaine est pur (il
 * n'importe pas le client Prisma) ; la garde confronte les clés de `CHARGES_PAR_TYPE` aux valeurs de
 * l'enum lues dans le schéma, DANS LES DEUX SENS.
 */
import { z } from 'zod';
import { ALGORITHME } from './journal';

/** L'empreinte admise : SHA-256 en hexadécimal minuscule. La SEULE expression d'empreinte admise. */
export const HASH_HEX_64 = /^[0-9a-f]{64}$/;

/** Les constructeurs des formes admises — un raccourci, pas une obligation : la garde lit le schéma. */
export const FORMES = {
  identifiant: () => z.string().uuid(),
  empreinte: () => z.string().regex(HASH_HEX_64),
  montantCents: () => z.number().int(),
  horodatage: () => z.string().datetime(),
};

/** Les valeurs de l'enum Prisma `TypeEvenementJournal`, confrontées au schéma par la garde. */
export type TypeEvenementJournal = 'journal_ouvert';

export const CHARGES_PAR_TYPE = {
  /** La genèse : l'algorithme de chaînage, inscrit DANS la chaîne. */
  journal_ouvert: z.object({ algorithme: z.literal(ALGORITHME) }).strict(),
} satisfies Record<TypeEvenementJournal, z.ZodTypeAny>;
