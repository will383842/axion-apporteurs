/**
 * composer.ts — compose le prochain lot de tâches. Script PUR : il lit, il n'écrit qu'un fichier de lot.
 *
 * USAGE   : pnpm lot:composer -- --phase <n> --repo <partners|axionia> --max 8 --now <ISO du jour>
 *           (le `--` de pnpm est OBLIGATOIRE : sans lui, pnpm avale les options)
 * ENTRÉES : docs/tasks.json, docs/DECISIONS.md (identifiants HYP-/DEC- posés en §2),
 *           docs/maquettes/VALIDATION.md (gate des écrans), `gh issue list`, `git worktree list`
 * SORTIE  : docs/lots/L<phase>-<seq>/lot.json = { id, phase, repo, taches: Tache[], ecartees: [{id, raison}] }
 *
 * INVARIANTS (les mêmes que la gate `gov:tasks`)
 *   - éligible = statut a_faire ∧ phase == phase courante ∧ repo == repo demandé ∧ externe == null
 *                ∧ toutes les deps ∈ {fusionnee, deployee, verifiee} ∧ chaque hyp a une entrée dans la
 *                §2 de DECISIONS.md ∧ aucune hyp en §1 (décision bloquante non tranchée) ∧ attempts < 2
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

const STATUTS_TERMINES = new Set(['fusionnee', 'deployee', 'verifiee']);
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

// --- décisions : la FRONTIÈRE §1 / §2 fait foi ----------------------------------------------------
// Le §4 du registre prescrit au gardien du spec de DÉPLACER une ligne de la §2 vers la §1 quand une
// décision cesse d'avoir un défaut. Ratisser tout le fichier rend ce déplacement invisible : on
// composait des lots sur des décisions redevenues bloquantes.
const decisionsBrut = readFileSync('docs/DECISIONS.md', 'utf8');
const section = (n: number) =>
  decisionsBrut.split(new RegExp(`^## ${n}\\.`, 'm'))[1]?.split(new RegExp(`^## ${n + 1}\\.`, 'm'))[0] ?? '';
const ids = (texte: string) => new Set(texte.match(/\b(HYP|DEC)-[A-Z0-9-]+\b/g) || []);

/** §2 = décisions avec une hypothèse par défaut posée → on peut coder dessus. */
const decisions = ids(section(2));
/** §1 = décisions SANS défaut → aucune tâche qui les cite n'est composable. */
const bloquantes = ids(section(1));

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
  const nonTranchees = t.hyp.filter((h) => bloquantes.has(h));
  if (nonTranchees.length) { ecartees.push({ id: t.id, raison: `décision bloquante non tranchée (§1 du registre) : ${nonTranchees.join(', ')}` }); return false; }
  const sansDecision = t.hyp.filter((h) => !decisions.has(h));
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
const prefixe = `L${phase}-`;
// Le numéro se DÉDUIT du plus grand déjà posé, jamais d'un COMPTAGE : un dossier supprimé, archivé ou
// non commité faisait retomber sur un identifiant déjà utilisé, et écrasait le lot.json précédent.
const seq = Math.max(
  0,
  ...readdirSync('docs/lots')
    .filter((d) => d.startsWith(prefixe))
    .map((d) => Number(d.slice(prefixe.length)) || 0)
) + 1;
const id = `${prefixe}${String(seq).padStart(2, '0')}`;
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
