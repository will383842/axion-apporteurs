/**
 * Le chaînage du journal `Evenement` — DM-01 (REQ-DM-024, partners/ADR-0013 décisions 1 à 3).
 *
 * ALGORITHME `sha256-jcs-v1` (décision 1).
 *   selfHash = hex(SHA-256(UTF-8(prevHash + canonique(enregistrement)))), 64 caractères minuscules,
 *   enregistrement = { agregat, agregatId, charge, survenuAt, type }.
 * TOUTES les colonnes qui portent un sens sont hachées, pas la seule charge : hacher la charge seule
 * laisserait `type` ou `agregatId` réécrits sans que la chaîne le voie. `id` n'est pas haché (il n'a
 * pas de sens, c'est un rang d'insertion). Une colonne ajoutée plus tard est HORS hachage et le dit,
 * ou exige un nouvel algorithme, par ADR.
 *
 * LA GENÈSE (décision 2) est la seule ligne dont `prevHash` vaut 64 zéros. La première migration l'insère
 * avec le `selfHash` calculé ici : les deux copies sont tenues égales par
 * `tests/unit/domaine/journal-chaine.spec.ts`, qui lit le littéral dans `migration.sql`. Elle ancre
 * la chaîne et y inscrit l'algorithme, DANS la chaîne.
 *
 * `verifierChaine()` SUIT LES LIENS DE HASH, jamais l'ordre des `id` : un `id` se réécrit, un lien de
 * hash ne se forge pas. Elle rend la PREMIÈRE faute trouvée, dans un ordre fixe — vide, genèse,
 * intégrité de chaque ligne, maillon orphelin, bifurcation — et nomme la ligne en cause.
 *
 * CE QU'ELLE NE VOIT PAS, dit plutôt que tu : une troncature de la QUEUE (les dernières lignes
 * supprimées) laisse une chaîne intègre et plus courte. Il faut ancrer la tête hors de la base —
 * c'est la vérification périodique du journal, hors de ce module.
 *
 * Domaine pur : `node:crypto` seul, aucune I/O, aucune horloge — `survenuAt` arrive de l'appelant,
 * déjà en ISO-8601 UTC. Les `id` sont des chaînes : pas de `bigint` dans le domaine.
 */
import { createHash } from 'node:crypto';
import { canonique } from './canonique';

/** Le nom de l'algorithme, inscrit dans la charge de la genèse. */
export const ALGORITHME = 'sha256-jcs-v1';

/** Le `prevHash` de la genèse, et d'elle seule. */
export const ZERO = '0'.repeat(64);

/** Ce qui est haché d'une ligne. Les types sont ceux que la base RELIT : le domaine ne les juge pas. */
export type Enregistrement = {
  type: string;
  agregat: string | null;
  agregatId: string | null;
  /** ISO-8601 UTC à la milliseconde (`toISOString()`). */
  survenuAt: string;
  charge: unknown;
};

/** Une ligne du journal telle que relue. */
export type LigneJournal = Enregistrement & { id: string; prevHash: string; selfHash: string };

export type FauteChaine =
  | 'chaine_vide'
  | 'genese_absente'
  | 'genese_multiple'
  | 'hash_altere'
  | 'maillon_orphelin'
  | 'bifurcation';

export type VerdictChaine =
  | { ok: true; maillons: number; tete: string }
  | { ok: false; faute: FauteChaine; id: string | null };

/** Le hash d'un maillon, sur son prédécesseur et son enregistrement canonique. */
export function calculerSelfHash(prevHash: string, e: Enregistrement): string {
  const enregistrement = {
    agregat: e.agregat,
    agregatId: e.agregatId,
    charge: e.charge,
    survenuAt: e.survenuAt,
    type: e.type,
  };
  return createHash('sha256')
    .update(prevHash + canonique(enregistrement), 'utf8')
    .digest('hex');
}

const ENREGISTREMENT_GENESE: Enregistrement = {
  type: 'journal_ouvert',
  agregat: null,
  agregatId: null,
  survenuAt: '2026-09-19T00:00:00.000Z',
  charge: { algorithme: ALGORITHME },
};

/** La genèse : la date est celle du nom de la première migration. */
export const GENESE = {
  ...ENREGISTREMENT_GENESE,
  prevHash: ZERO,
  selfHash: calculerSelfHash(ZERO, ENREGISTREMENT_GENESE),
} as const;

/** Vrai si le `selfHash` stocké est celui du contenu. Une charge non canonicalisable est altérée. */
function integre(l: LigneJournal): boolean {
  try {
    return calculerSelfHash(l.prevHash, l) === l.selfHash;
  } catch {
    return false;
  }
}

const faute = (f: FauteChaine, id: string | null): VerdictChaine => ({ ok: false, faute: f, id });

export function verifierChaine(lignes: readonly LigneJournal[]): VerdictChaine {
  if (lignes.length === 0) return faute('chaine_vide', null);

  const geneses = lignes.filter((l) => l.prevHash === ZERO);
  if (geneses.length === 0) return faute('genese_absente', null);
  if (geneses.length > 1) return faute('genese_multiple', geneses[1]!.id);

  const alteree = lignes.find((l) => !integre(l));
  if (alteree) return faute('hash_altere', alteree.id);

  const hashes = new Set(lignes.map((l) => l.selfHash));
  const orphelin = lignes.find((l) => l.prevHash !== ZERO && !hashes.has(l.prevHash));
  if (orphelin) return faute('maillon_orphelin', orphelin.id);

  const suivant = new Map<string, LigneJournal>();
  for (const l of lignes) {
    if (suivant.has(l.prevHash)) return faute('bifurcation', l.id);
    suivant.set(l.prevHash, l);
  }

  // Ici chaque ligne a UN prédécesseur existant, et chaque prédécesseur UN suivant : partie de la
  // genèse, la marche atteint toutes les lignes (un cycle exigerait une boucle de SHA-256). La borne
  // `maillons < lignes.length` garde la marche finie quoi qu'on lui donne.
  let tete = geneses[0]!;
  let maillons = 1;
  for (
    let l = suivant.get(tete.selfHash);
    l && maillons < lignes.length;
    l = suivant.get(l.selfHash)
  ) {
    tete = l;
    maillons++;
  }
  return { ok: true, maillons, tete: tete.selfHash };
}
