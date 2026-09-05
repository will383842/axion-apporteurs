/**
 * registre-decisions.ts — LE lecteur de `docs/DECISIONS.md` (GOV-027, REQ-GOV-015, REQ-GOV-021).
 *
 * POURQUOI CE FICHIER EXISTE. Il y avait DEUX lecteurs du même registre, et ils ne lisaient pas la
 * même chose (RM-04, RM-01). `scripts/gates/gov-tasks.ts` reconnaissait une décision à la PREMIÈRE
 * CELLULE d'une ligne de tableau et acceptait les quatre familles d'identifiants du registre ;
 * `scripts/lot/composer.ts` la cherchait par `/\b(HYP|DEC)-[A-Z0-9-]+\b/` sur le TEXTE BRUT des
 * sections, ne connaissait donc que deux préfixes sur quatre, et n'appliquait aucun alias de la §0.
 * Mesuré le 2026-09-04, trois conséquences, toutes SILENCIEUSES — le composeur imprimait une
 * raison plausible, et personne ne la contestait :
 *
 *   (a) une tâche dont la décision est une DÉCISION DE WILL (`W6`, `W10`…) était écartée pour
 *       « décision sans hypothèse », alors que sa décision est déclarée au registre ;
 *   (b) trois identifiants cités dans une NOTE EN PROSE sous la §1 — une note qui explique
 *       précisément qu'ils ne bloquent PLUS — étaient comptés comme bloquants ;
 *   (c) la §1 était ratissée ENTIÈRE : une décision TRANCHÉE y bloquait encore, alors que le §4 du
 *       registre prescrit de la faire descendre en §2.
 *
 * Le remède n'est pas d'aligner la seconde expression régulière sur la première — deux copies
 * divergent toujours, et celle qui est lue n'est jamais celle qui a été corrigée. C'est un lecteur
 * UNIQUE, importé par la garde et par le composeur. `scripts/lot/` est déjà importé par
 * `scripts/gates/` (`avancement.ts`, le barème des statuts), c'est donc là qu'il vit.
 *
 * CE QUE CE LECTEUR TIENT POUR VRAI, ET POURQUOI :
 *
 *   1. UNE DÉCISION EST DÉCLARÉE PAR LA PREMIÈRE CELLULE D'UNE LIGNE DE TABLEAU. Une mention en
 *      prose ne porte ni hypothèse, ni réversibilité, ni propriétaire : ce n'est pas une décision,
 *      c'est un renvoi. La note sous la §1 en est la preuve vivante — elle cite trois identifiants
 *      pour dire qu'ils ne bloquent plus, et une lecture au fil du texte lui fait dire l'inverse.
 *   2. LA FRONTIÈRE §1/§2 SE LIT SUR LES LIGNES, PAS SUR LES BORNES DU TEXTE. La section courante
 *      est celle du dernier titre `## n.` rencontré ; ce sont les LIGNES DE TABLEAU qui portent des
 *      décisions, jamais les paragraphes entre elles.
 *   3. UNE DÉCISION TRANCHÉE NE BLOQUE PLUS RIEN. Le §4 du registre demande au gardien du spec de
 *      dater la ligne et de la faire descendre en §2 ; tant que le déplacement n'est pas fait, la
 *      DATE fait foi — sans quoi la garde punirait le projet pour un geste d'archivage en retard.
 *      Les deux endroits où la date s'écrit sont lus : la colonne `Tranchée` de la §2, et le
 *      marqueur `✅ *tranchée <date>*` que la §1 porte dans sa première cellule.
 *   4. LES ALIAS DE LA §0 SONT APPLIQUÉS. Le registre le dit lui-même : « ce tableau ne décide
 *      rien, il rend lisible par la machine ce qui ne l'était que par un lecteur attentif ».
 *
 * ⚠️ `docs/DECISIONS.md` est un fichier RÉSERVÉ au `gardien-spec` (`docs/CHARTE-AGENTS.md` §7).
 * Ce module le LIT ; rien ici ne l'écrit, ni ne le corrige, ni ne suppose une ligne absente.
 */

import { readFileSync } from 'node:fs';

export const CHEMIN_REGISTRE = 'docs/DECISIONS.md';

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
    const marqueurDerniere = cs.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(derniere) ? [derniere, derniere] : null;
    const trancheeLe = marqueurPremiere?.[1] ?? marqueurDerniere?.[1] ?? null;

    parId.set(id, { id, section: section as 1 | 2, trancheeLe, ligne: i + 1 });
  }

  const declarees = new Set<string>([...parId.keys(), ...alias.keys()]);

  const canonique = (id: string): string => alias.get(id) ?? id;
  const decision = (id: string): Decision | null => parId.get(canonique(id)) ?? null;
  const estDeclaree = (id: string): boolean => declarees.has(id);
  const estBloquante = (id: string): boolean => {
    const d = decision(id);
    return d !== null && d.section === 1 && d.trancheeLe === null;
  };
  const estCodable = (id: string): boolean => estDeclaree(id) && decision(id) !== null && !estBloquante(id);
  const motif = (id: string): Motif | null => {
    if (estBloquante(id)) return 'decision_bloquante_non_tranchee';
    if (!estCodable(id)) return 'decision_sans_hypothese';
    return null;
  };

  return { alias, parId, declarees, canonique, decision, estDeclaree, estBloquante, estCodable, motif };
}

/** Lit le registre sur le disque. Le chemin est un paramètre pour que les bancs d'essai l'écartent. */
export function chargerRegistre(chemin: string = CHEMIN_REGISTRE): Registre {
  return lireRegistre(readFileSync(chemin, 'utf8'));
}

// ── le lecteur HÉRITÉ ────────────────────────────────────────────────────────
/**
 * ⚠️ CECI N'EST PAS UN SECOND LECTEUR. C'est la FIXTURE du défaut : le code de lecture que
 * `scripts/lot/composer.ts` portait avant GOV-027, conservé mot pour mot. Rien ne le consulte pour
 * juger quoi que ce soit — il sert à deux choses, et à deux seulement :
 *
 *   — aux témoins des tests, qui opposent famille par famille sa lecture à celle du lecteur unique ;
 *   — au décompte que `pnpm lot:composer` IMPRIME, pour qu'on VOIE la différence au lieu de la
 *     supposer. Un correctif dont l'effet n'est pas mesuré est un correctif dont on discute.
 *
 * Le supprimer ferait disparaître la seule preuve que le remède change quelque chose (RM-02).
 */
export interface RegistreHerite {
  estDeclaree(id: string): boolean;
  estBloquante(id: string): boolean;
  estCodable(id: string): boolean;
  motif(id: string): Motif | null;
}

export function lireRegistreHerite(texte: string): RegistreHerite {
  const section = (n: number): string =>
    texte.split(new RegExp(`^## ${n}\\.`, 'm'))[1]?.split(new RegExp(`^## ${n + 1}\\.`, 'm'))[0] ?? '';
  const ids = (t: string): Set<string> => new Set(t.match(/\b(HYP|DEC)-[A-Z0-9-]+\b/g) || []);

  const decisions = ids(section(2));
  const bloquantes = ids(section(1));

  const estBloquante = (id: string): boolean => bloquantes.has(id);
  const estCodable = (id: string): boolean => !bloquantes.has(id) && decisions.has(id);
  return {
    estDeclaree: (id) => decisions.has(id) || bloquantes.has(id),
    estBloquante,
    estCodable,
    motif: (id) => (estBloquante(id) ? 'decision_bloquante_non_tranchee' : estCodable(id) ? null : 'decision_sans_hypothese'),
  };
}

// ── le décompte ──────────────────────────────────────────────────────────────
export type EcartDeLecture = {
  id: string;
  /** La raison que le composeur imprimait AVANT — c'est elle qu'on lisait sans la contester. */
  motifHerite: Motif;
  /** Les identifiants de décision qui portaient cette raison. */
  decisions: string[];
};

/**
 * Les tâches que le lecteur hérité écartait POUR UNE RAISON DE DÉCISION, et que le lecteur unique
 * laisse passer. Ni le statut, ni la phase, ni les dépendances n'entrent ici : cette fonction
 * mesure l'effet du LECTEUR, et rien d'autre. Le composeur applique ses autres filtres par-dessus.
 */
export function tachesRedevenuesEligibles(
  taches: { id: string; hyp: string[] }[],
  texte: string
): EcartDeLecture[] {
  const unique = lireRegistre(texte);
  const herite = lireRegistreHerite(texte);
  const ecarts: EcartDeLecture[] = [];

  for (const t of taches) {
    if (t.hyp.length === 0) continue;

    const bloquantesHeritees = t.hyp.filter((h) => herite.estBloquante(h));
    const sansHypotheseHeritees = t.hyp.filter((h) => !herite.estBloquante(h) && !herite.estCodable(h));
    if (bloquantesHeritees.length === 0 && sansHypotheseHeritees.length === 0) continue;

    // Toujours écartée par le lecteur unique ? Alors elle n'est pas « redevenue » éligible.
    if (t.hyp.some((h) => !unique.estCodable(h))) continue;

    ecarts.push({
      id: t.id,
      motifHerite: bloquantesHeritees.length > 0 ? 'decision_bloquante_non_tranchee' : 'decision_sans_hypothese',
      decisions: [...bloquantesHeritees, ...sansHypotheseHeritees],
    });
  }

  return ecarts;
}
