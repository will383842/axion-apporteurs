/**
 * composer.ts — compose le prochain lot de tâches. Script PUR : il lit, il n'écrit qu'un fichier de lot.
 *
 * USAGE   : pnpm lot:composer -- --phase <n> --repo <partners|axionia> --max 8 --now <ISO du jour>
 *           (le `--` de pnpm est OBLIGATOIRE : sans lui, pnpm avale les options)
 * ENTRÉES : docs/tasks.json, docs/DECISIONS.md (lu par `./registre-decisions`, le lecteur UNIQUE),
 *           docs/maquettes/VALIDATION.md (gate des écrans), `gh issue list`, `git worktree list`
 * SORTIE  : docs/lots/L<phase>-<seq>/lot.json = { id, phase, repo, taches: Tache[], ecartees: [{id, raison}] }
 *
 * INVARIANTS (les mêmes que la gate `gov:tasks` — au sens fort : le MÊME code les lit, GOV-027)
 *   - éligible = statut a_faire ∧ phase == phase courante ∧ repo == repo demandé ∧ externe == null
 *                ∧ toutes les deps ∈ {fusionnee, deployee, verifiee} ∧ chaque hyp est DÉCLARÉE au
 *                registre ∧ aucune hyp bloquante (déclarée en §1 et non datée) ∧ attempts < 2
 *   - une tâche d'écran (`UX-P1-*`, `UX-P2-*`, `UX-P3-*`) n'est PAS attribuable tant que sa ligne de
 *     docs/maquettes/VALIDATION.md n'est pas validée par Will (colonne « Validé le » ≠ `—`)
 *   - deux tâches d'un lot n'ont JAMAIS de chemin en commun (sinon deux worktrees se marchent dessus)
 *   - tri par longueur de chaîne de dépendances DESCENDANTE : on débloque le chemin critique d'abord
 *   - identifiant de lot SÉQUENTIEL, jamais horodaté (un script rejouable ne dépend pas de l'heure) :
 *     l'heure de référence du balayage est FOURNIE par `--now`, elle n'est jamais lue sur l'horloge
 *   - toute tâche écartée porte une RAISON imprimée : c'est ce que la session remonte à Will
 *
 * BALAYAGE PRÉALABLE (reprise après mort d'un agent, §6.1 du plan)
 *   - toute issue `en_cours` sans commit ni PR depuis > 6 h repasse `a_faire`, attempts++
 *   - attempts >= 2 → `bloquee`, motif « deux tentatives sans livrable »
 *   - `git worktree prune`
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { LIVREE } from './avancement';
import { lireRegistre, tachesRedevenuesEligibles, CHEMIN_REGISTRE } from './registre-decisions';
import { prochainIdentifiantDeLot, lotsDuBacklog } from './identifiant-de-lot';

// La cinquieme copie de l'ensemble « livree », sous un autre nom — c'est ainsi qu'un doublon
// echappe a une recherche. Elle se DERIVE desormais du bareme unique de `./avancement`.
const STATUTS_TERMINES = LIVREE;
const HEURES_AVANT_REPRISE = 6;

interface Tache {
  id: string; titre: string; phase: number; repo: string; zone: string; paths: string[];
  schema: boolean; sensible: string[]; deps: string[]; reqs: string[]; hyp: string[];
  externe: string | null; estimateDays: number;
  // Facultatifs tant que la tâche n'est pas attribuée (cf. le bloc `allOf` de tasks.schema.json).
  acceptance?: string; tests?: Record<string, string[]>;
  statut: string; owner?: string | null; lot?: string | null; branch?: string | null;
  pr?: number | null; attempts?: number; motif?: string | null;
  /** Numéro de l'issue GitHub de la tâche, écrit par `pnpm gov:issues --sync` (GOV-017).
   *  Sans lui, la revendication (`gh issue edit <n>`) n'a aucun `<n>` à citer. */
  issue?: number | null;
}

function arg(nom: string, defaut?: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  // `noUncheckedIndexedAccess` : tester `process.argv[i + 1]` ne narrow PAS un second accès —
  // TypeScript traite les deux indexations comme des expressions distinctes. On passe par une
  // variable, qui elle se narrow.
  const suivant = i >= 0 ? process.argv[i + 1] : undefined;
  if (suivant) return suivant;
  if (defaut !== undefined) return defaut;
  throw new Error(`Argument --${nom} manquant.`);
}

function gh(args: string[]): string {
  try { return execFileSync('gh', args, { encoding: 'utf8' }); } catch { return ''; }
}

/** Longueur de la plus longue chaîne de dépendances partant de cette tâche (mémoïsée). */
function profondeur(id: string, index: Map<string, Tache>, cache = new Map<string, number>()): number {
  if (cache.has(id)) return cache.get(id)!;
  const t = index.get(id);
  if (!t || t.deps.length === 0) { cache.set(id, 0); return 0; }
  cache.set(id, 0); // coupe les cycles éventuels ; la gate `gov:tasks` les refuse par ailleurs
  const d = 1 + Math.max(...t.deps.map((x) => profondeur(x, index, cache)));
  cache.set(id, d);
  return d;
}

// Le signe « − » (U+2212) traîne dans les titres de section des documents : un copier-coller donnait
// `Number('−1') = NaN`, `t.phase !== NaN` toujours vrai, et « Aucune tâche éligible » sans une raison.
const phase = Number(arg('phase').replace('−', '-'));
if (!Number.isInteger(phase)) {
  throw new Error(`--phase doit être un entier (-1, 0, 1, 2, 3) ; reçu : ${arg('phase')}`);
}
const repo = arg('repo', 'partners');
const max = Number(arg('max', '8'));

const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { version: number; taches: Tache[] };
const taches = doc.taches;
const index = new Map(taches.map((t) => [t.id, t]));

// --- décisions : UN SEUL lecteur, partagé avec la garde (GOV-027) ---------------------------------
// Ce bloc portait sa propre lecture du registre : `/\b(HYP|DEC)-[A-Z0-9-]+\b/` appliqué au TEXTE
// BRUT des sections. Elle ne connaissait que deux préfixes sur quatre, n'appliquait aucun alias de
// la §0, et ratissait la prose autant que les tableaux. Mesuré le 2026-09-04 : DIX-NEUF tâches
// écartées pour une raison de décision, dont dix-huit à tort — et la seule décision qui bloque
// vraiment (`EXT-2a`, préfixe `EXT`) passait au travers. Un lecteur faux ne l'est pas « dans le
// sens strict » : il l'est dans les deux sens à la fois.
//
// La lecture vit désormais dans `./registre-decisions`, importée ici ET par `gov-tasks.ts` (RM-01).
const decisionsBrut = readFileSync(CHEMIN_REGISTRE, 'utf8');
const registre = lireRegistre(decisionsBrut);

// --- maquettes : une tâche d'écran n'est pas attribuable sans validation de Will -------------------
// La gate vivait dans un document que personne ne lisait (`maquettes/VALIDATION.md:3-4`). Elle est ici.
const maquettesNonValidees = new Set<string>();
if (existsSync('docs/maquettes/VALIDATION.md')) {
  for (const ligne of readFileSync('docs/maquettes/VALIDATION.md', 'utf8').split('\n')) {
    if (!ligne.trim().startsWith('|')) continue;
    const cellules = ligne.split('|').map((c) => c.trim());
    // Une ligne non validée porte `—` (ou rien) dans sa colonne « Validé le ».
    const valide = cellules.at(-2) ?? '';
    if (valide && valide !== '—' && valide !== '-' && !/^-+$/.test(valide)) continue;
    for (const id of ligne.match(/\bUX-P[123]-[A-Za-z0-9]+\b/g) || []) maquettesNonValidees.add(id);
  }
}

// --- balayage : reprise des tâches abandonnées ----------------------------------------------------
execFileSync('git', ['worktree', 'prune'], { stdio: 'ignore' });
// L'heure vient de l'appelant : un script rejouable ne lit pas l'horloge (invariant en tête de fichier).
const maintenant = Date.parse(arg('now'));
if (Number.isNaN(maintenant)) {
  throw new Error('--now <ISO> requis (le composeur ne lit pas l\'horloge)');
}
const reprises: string[] = [];
for (const t of taches) {
  if (t.statut !== 'en_cours') continue;
  // Le numéro d'issue est PORTÉ par la tâche (`gov:issues --sync`) : la recherche plein texte n'est
  // qu'un repli, et elle rend le mauvais résultat dès que deux identifiants se contiennent (DM-01/DM-011).
  const issue = t.issue != null
    ? gh(['issue', 'view', String(t.issue), '--json', 'number,updatedAt'])
    : gh(['issue', 'list', '--search', t.id, '--json', 'number,updatedAt', '--limit', '1']);
  const brut = issue ? JSON.parse(issue) : null;
  const maj = (Array.isArray(brut) ? brut[0]?.updatedAt : brut?.updatedAt) ?? null;
  const ageH = maj ? (maintenant - Date.parse(maj)) / 3_600_000 : Infinity;
  if (ageH > HEURES_AVANT_REPRISE && !t.pr) {
    t.attempts = (t.attempts ?? 0) + 1;
    if (t.attempts >= 2) { t.statut = 'bloquee'; t.motif = 'deux tentatives sans livrable — revue humaine requise'; }
    else { t.statut = 'a_faire'; t.owner = null; t.branch = null; }
    reprises.push(t.id);
  }
}
if (reprises.length) writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');

// --- éligibilité ----------------------------------------------------------------------------------
const ecartees: { id: string; raison: string }[] = [];
const eligibles = taches.filter((t) => {
  if (t.phase !== phase || t.repo !== repo) return false;
  // Les deux statuts d'attente sont imprimés AVEC leur raison : c'est la seule chose que la session
  // a à remonter à Will quand aucun lot n'est composable. Ils doivent passer AVANT le filtre général.
  if (t.statut === 'attente_externe') { ecartees.push({ id: t.id, raison: `attend ${t.externe ?? 'externe'}` }); return false; }
  if (t.statut === 'bloquee') { ecartees.push({ id: t.id, raison: t.motif ?? 'bloquée' }); return false; }
  if (t.statut !== 'a_faire') return false;
  if ((t.attempts ?? 0) >= 2) { ecartees.push({ id: t.id, raison: 'deux tentatives échouées' }); return false; }
  if (t.externe) { ecartees.push({ id: t.id, raison: `attend ${t.externe}` }); return false; }
  if (maquettesNonValidees.has(t.id)) { ecartees.push({ id: t.id, raison: 'maquette non validée par Will' }); return false; }
  const depsBloquantes = t.deps.filter((d) => !STATUTS_TERMINES.has(index.get(d)?.statut ?? 'inconnu'));
  if (depsBloquantes.length) { ecartees.push({ id: t.id, raison: `dépend de ${depsBloquantes.join(', ')}` }); return false; }
  const nonTranchees = t.hyp.filter((h) => registre.estBloquante(h));
  if (nonTranchees.length) {
    // Le canonique est cité À CÔTÉ de l'identifiant écrit dans la tâche : sans lui, la session qui
    // lit cette raison cherche `DEC-INT-004` dans un registre qui ne le porte qu'en §0.
    const nommees = nonTranchees.map((h) => (registre.canonique(h) === h ? h : `${h} → ${registre.canonique(h)}`));
    ecartees.push({ id: t.id, raison: `décision bloquante non tranchée (§1 du registre) : ${nommees.join(', ')}` });
    return false;
  }
  const sansDecision = t.hyp.filter((h) => !registre.estCodable(h));
  if (sansDecision.length) { ecartees.push({ id: t.id, raison: `décision sans hypothèse : ${sansDecision.join(', ')}` }); return false; }
  return true;
});

// --- sélection gloutonne, chemins disjoints -------------------------------------------------------
eligibles.sort((a, b) => profondeur(b.id, index) - profondeur(a.id, index) || a.id.localeCompare(b.id));
const retenues: Tache[] = [];
const pris = new Set<string>();
for (const t of eligibles) {
  if (retenues.length >= max) break;
  if (t.paths.some((p) => pris.has(p))) { ecartees.push({ id: t.id, raison: 'chemin déjà pris dans ce lot' }); continue; }
  t.paths.forEach((p) => pris.add(p));
  retenues.push(t);
}

// --- écriture du lot ------------------------------------------------------------------------------
mkdirSync('docs/lots', { recursive: true });
// Le numéro se DÉDUIT du plus grand déjà posé, et il le déduit de DEUX sources (GOV-029) :
// `docs/lots/` pour les lots composés mais pas encore clos, et le champ `lot` de `docs/tasks.json`
// pour les lots clos. Ce bloc ne lisait que le dossier — or `.gitignore` l. 67 l'EXCLUT du dépôt :
// dans un arbre neuf il n'existe pas, le maximum d'un ensemble vide vaut 0, et le composeur
// repartait sur `L-1-01`, déjà porté par sept tâches `fusionnee`. Le commentaire d'avant nommait
// pourtant le cas — « un dossier non commité » — et n'en avait corrigé que la moitié.
const id = prochainIdentifiantDeLot(phase, readdirSync('docs/lots'), [...lotsDuBacklog(taches)]);
const chemin = join('docs/lots', id, 'lot.json');
if (existsSync(chemin)) {
  throw new Error(`${chemin} existe déjà : refus d'écraser un lot. Archive-le ou renomme-le avant de recomposer.`);
}
mkdirSync(join('docs/lots', id), { recursive: true });
const lot = { id, phase, repo, taches: retenues, ecartees };
writeFileSync(chemin, JSON.stringify(lot, null, 2) + '\n');

console.log(`Lot ${id} : ${retenues.length} tâche(s) — ${retenues.map((t) => t.id).join(', ') || '(aucune)'}`);
if (reprises.length) console.log(`Reprises après abandon : ${reprises.join(', ')}`);
if (!retenues.length) console.log(`Aucune tâche éligible. Raisons :\n  ${ecartees.map((e) => `${e.id} — ${e.raison}`).join('\n  ')}`);

// --- ce que le lecteur unique a changé, IMPRIMÉ ---------------------------------------------------
// Point 5 de l'acceptation de GOV-027 : « le décompte des tâches redevenues éligibles imprimé, pour
// qu'on voie la différence au lieu de la supposer ». Un correctif dont l'effet n'est pas mesuré est
// un correctif dont on discute — et celui-ci corrige un défaut que personne n'avait vu pendant des
// semaines, précisément parce que le composeur imprimait une raison plausible.
const bloquantesDuRegistre = [...registre.parId.values()].filter((d) => d.section === 1 && d.trancheeLe === null);
console.log(
  `\nRegistre des décisions : ${registre.declarees.size} identifiant(s) déclaré(s) ` +
    `(${registre.parId.size} ligne(s) de tableau + ${registre.alias.size} alias §0) · ` +
    `${bloquantesDuRegistre.length} bloquante(s) : ${bloquantesDuRegistre.map((d) => d.id).join(', ') || 'aucune'}.`
);
const redevenues = tachesRedevenuesEligibles(taches, decisionsBrut);
const ecarteesPourDecision = taches.filter((t) => t.hyp.some((h) => !registre.estCodable(h)));
console.log(
  `Lecteur unique (GOV-027) : ${redevenues.length} tâche(s) que la lecture d'avant écartait pour une ` +
    `raison de décision sont éligibles ; ${ecarteesPourDecision.length} le restent, toutes phases confondues.`
);
if (redevenues.length > 0) {
  console.log(`  ${redevenues.map((e) => `${e.id} (${e.motifHerite} : ${e.decisions.join(', ')})`).join('\n  ')}`);
}
if (ecarteesPourDecision.length > 0) {
  console.log(
    `  encore écartée(s) : ${ecarteesPourDecision
      .map((t) => `${t.id} (${t.hyp.filter((h) => !registre.estCodable(h)).join(', ')})`)
      .join(', ')}`
  );
}
