/**
 * `src/domain/registre/registre-decisions.ts` — la lecture PURE de `docs/DECISIONS.md` (GOV-027,
 * REQ-GOV-015, REQ-GOV-021). LE lecteur du registre : `scripts/lot/registre-decisions.ts` le
 * réexporte pour la garde et le composeur, et `src/domain/contrat/decisions.ts` (JUR-T01) le lit
 * pour les ancrages du gabarit. Il vit sous `src/domain` parce que le domaine est PUR (aucune I/O,
 * docs/CONVENTIONS.md §3) et ne peut pas importer `scripts/` ; le chargement depuis le disque reste
 * côté scripts. Un QUATRIÈME lecteur est né sous `src/domain/contrat/` (PR #92) : il divergeait
 * (« ✅ *Tranchée le 2026-09-30* » y rendait `null`), et `registre-lecteur-unique.spec.ts` balaie
 * désormais `src/domain` pour qu'il ne revienne pas.
 *
 * Le récit du défaut d'origine et ce que ce lecteur tient pour vrai sont écrits en tête de
 * `scripts/lot/registre-decisions.ts`.
 */

/**
 * Les quatre familles d'identifiants du registre : `HYP-*`, `DEC-*`, `W<n>`, `EXT-<n>[a]`.
 * Ce motif est la SEULE définition de « à quoi ressemble un identifiant de décision » ; il était
 * écrit deux fois, sous deux formes incompatibles (RM-01).
 */
export const MOTIF_IDENTIFIANT = /^((?:HYP|DEC|W|EXT)-?[A-Z0-9][A-Za-z0-9-]*)/;

/** Une date d'arbitrage : `2026-09-03`. La seule marque lisible par une machine (préambule du registre). */
const MOTIF_DATE = /(\d{4}-\d{2}-\d{2})/;

export type Motif = 'decision_bloquante_non_tranchee' | 'decision_sans_hypothese';

export type Decision = {
  /** L'identifiant CANONIQUE, tel qu'il est écrit en première cellule. */
  id: string;
  /** 1 = « sans valeur par défaut possible » · 2 = « hypothèse par défaut posée ». */
  section: 1 | 2;
  /** Date ISO de l'arbitrage de Will, ou `null`. */
  trancheeLe: string | null;
  /** Numéro de ligne (1-based) — ce qu'on cite à qui doit corriger le registre. */
  ligne: number;
  /** La ligne de tableau telle qu'elle est écrite — les ancrages du gabarit (JUR-T01) la lisent. */
  brute: string;
  /**
   * La colonne « Réversibilité » de la §2 (tableau à sept colonnes), décor retiré — `paramètre`,
   * `migration`, `avenant`, `—` —, lue comme `gov:hypotheses` la lit ; `null` en §1, qui n'a
   * pas cette colonne. C'est la CATÉGORIE de la ligne, jamais un mot de sa prose.
   */
  reversibilite: string | null;
};

export interface Registre {
  /** alias cité → identifiant canonique (§0). */
  readonly alias: ReadonlyMap<string, string>;
  /** identifiant canonique → décision (§1 et §2, lignes de TABLEAU seulement). */
  readonly parId: ReadonlyMap<string, Decision>;
  /** Tous les identifiants qu'une tâche peut légitimement citer : canoniques ∪ alias. */
  readonly declarees: ReadonlySet<string>;
  canonique(id: string): string;
  decision(id: string): Decision | null;
  estDeclaree(id: string): boolean;
  /** Déclarée en §1 et non datée : aucune tâche qui la cite n'est composable. */
  estBloquante(id: string): boolean;
  /** Déclarée, et pas bloquante : le code peut avancer dessus. */
  estCodable(id: string): boolean;
  /** Pourquoi cette décision empêche de coder — ou `null` si elle ne l'empêche pas. */
  motif(id: string): Motif | null;
}

/** Les cellules d'une ligne de tableau markdown, bords vides retirés. */
function cellules(ligne: string): string[] {
  const brut = ligne.trim();
  if (!brut.startsWith('|')) return [];
  const parts = brut.split('|');
  parts.shift();
  if (parts[parts.length - 1]?.trim() === '') parts.pop();
  return parts.map((c) => c.trim());
}

/** Le décor markdown d'une cellule : gras, accents graves, espaces. Il ne porte aucun sens. */
function nu(cellule: string): string {
  return cellule.replace(/[*`]/g, '').trim();
}

/**
 * Lit le registre. Fonction PURE : elle prend le texte, jamais un chemin — de sorte que les
 * témoins et contre-témoins des tests portent sur des registres FEINTS, sans toucher au dépôt.
 */
export function lireRegistre(texte: string): Registre {
  const alias = new Map<string, string>();
  const parId = new Map<string, Decision>();

  let section = -1;
  const lignes = texte.split('\n');

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;

    const titre = /^## (\d+)\./.exec(ligne);
    if (titre) {
      section = Number(titre[1]);
      continue;
    }
    if (section !== 0 && section !== 1 && section !== 2) continue;

    const cs = cellules(ligne);
    if (cs.length === 0) continue;

    const premiere = nu(cs[0] ?? '');
    const m = MOTIF_IDENTIFIANT.exec(premiere);
    if (!m || !m[1]) continue; // en-tête, séparateur, ou ligne dont la première cellule est en prose
    const id = m[1];

    if (section === 0) {
      // §0 : « Identifiant cité | Canonique | Où la correspondance est écrite »
      const cible = MOTIF_IDENTIFIANT.exec(nu(cs[1] ?? ''));
      if (cible && cible[1]) alias.set(id, cible[1]);
      continue;
    }

    // §1 et §2 : la DATE d'arbitrage se lit à deux endroits, et un seul suffit.
    //   — §1 : le marqueur `✅ *tranchée 2026-09-03*` dans la première cellule ;
    //   — §2 : la colonne `Tranchée`, dernière du tableau.
    const marqueurPremiere = /tranch/i.test(premiere) ? MOTIF_DATE.exec(premiere) : null;
    const derniere = nu(cs[cs.length - 1] ?? '');
    const marqueurDerniere =
      cs.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(derniere) ? [derniere, derniere] : null;
    const trancheeLe = marqueurPremiere?.[1] ?? marqueurDerniere?.[1] ?? null;

    const reversibilite = section === 2 && cs.length === 7 ? nu(cs[3] ?? '') : null;

    parId.set(id, {
      id,
      section: section as 1 | 2,
      trancheeLe,
      ligne: i + 1,
      brute: ligne,
      reversibilite,
    });
  }

  const declarees = new Set<string>([...parId.keys(), ...alias.keys()]);

  const canonique = (id: string): string => alias.get(id) ?? id;
  const decision = (id: string): Decision | null => parId.get(canonique(id)) ?? null;
  const estDeclaree = (id: string): boolean => declarees.has(id);
  const estBloquante = (id: string): boolean => {
    const d = decision(id);
    return d !== null && d.section === 1 && d.trancheeLe === null;
  };
  const estCodable = (id: string): boolean =>
    estDeclaree(id) && decision(id) !== null && !estBloquante(id);
  const motif = (id: string): Motif | null => {
    if (estBloquante(id)) return 'decision_bloquante_non_tranchee';
    if (!estCodable(id)) return 'decision_sans_hypothese';
    return null;
  };

  return {
    alias,
    parId,
    declarees,
    canonique,
    decision,
    estDeclaree,
    estBloquante,
    estCodable,
    motif,
  };
}
