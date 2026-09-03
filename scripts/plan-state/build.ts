/**
 * build.ts — régénère docs/PLAN-STATE.md. Le fichier est DÉRIVÉ, jamais écrit à la main.
 *
 * USAGE   : pnpm plan-state:build
 * ENTRÉES : docs/tasks.json · docs/DECISIONS.md · `gh pr list` · git
 *           (`docs/tasks.json` porte les statuts, écrits par `pnpm lot:cloture` à la fin de chaque lot ;
 *            ce script n'appelle PAS `gh issue list` — les labels d'issue sont une vue, pas la source)
 * SORTIE  : docs/PLAN-STATE.md (écrasé)
 *
 * POURQUOI : trois textes du plan donnaient trois écrivains différents à ce fichier. Un état partagé
 * entre 40 agents ne peut avoir qu'une source ; ici la source est GitHub, et ce script en est la vue.
 * Le test `plan-state-derive.spec.ts` relance ce script et exige que le fichier commité soit identique.
 *
 * INVARIANT : ce script ne DÉCIDE rien. S'il faut changer un statut, on change l'issue, pas le fichier.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PLAFOND_QUESTIONS = 10;

interface Tache {
  id: string; titre: string; phase: number; repo: string; statut: string;
  deps: string[]; reqs: string[]; hyp: string[]; externe: string | null;
  estimateDays: number; owner?: string | null; branch?: string | null; pr?: number | null;
  attempts?: number; motif?: string | null;
}

const sh = (cmd: string, args: string[]) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); } catch { return ''; }
};

const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };
const taches = doc.taches;
// La frontière §1 / §2 du registre fait foi : le §4 prescrit de DÉPLACER une ligne de la §2 vers la §1
// quand une décision cesse d'avoir un défaut. Ratisser tout le fichier rendait ce déplacement invisible
// et faisait écrire « Aucune question ouverte » sur une décision redevenue bloquante.
const decisions = readFileSync('docs/DECISIONS.md', 'utf8');
const section = (n: number) =>
  decisions.split(new RegExp(`^## ${n}\\.`, 'm'))[1]?.split(new RegExp(`^## ${n + 1}\\.`, 'm'))[0] ?? '';
const ids = (texte: string) => new Set(texte.match(/\b(HYP|DEC)-[A-Z0-9-]+\b/g) || []);
/** §2 = décisions avec une hypothèse par défaut posée. §1 = décisions SANS défaut, bloquantes. */
const posees = ids(section(2));
const bloquantes = ids(section(1));

// Phase courante = la plus petite phase qui porte encore une tâche non terminée.
const TERMINES = new Set(['fusionnee', 'deployee', 'verifiee']);
const phases = [...new Set(taches.map((t) => t.phase))].sort((a, b) => a - b);
const phaseCourante = phases.find((p) => taches.some((t) => t.phase === p && !TERMINES.has(t.statut))) ?? phases.at(-1)!;

const par = (s: string) => taches.filter((t) => t.statut === s);
const enCours = par('en_cours');
const bloquees = par('bloquee');
const attente = par('attente_externe');

// Questions ouvertes = décisions SANS hypothèse posée, citées par une tâche de la phase courante.
const questions = [
  ...new Set(
    taches
      .filter((t) => t.phase === phaseCourante && !TERMINES.has(t.statut))
      .flatMap((t) => [
        ...t.hyp.filter((h) => !posees.has(h)).map((h) => (bloquantes.has(h) ? `${h} — **bloquante (§1 du registre)**` : h)),
        ...(t.externe ? [`externe:${t.externe}`] : []),
      ])
  ),
];

const prs = (() => {
  const brut = sh('gh', ['pr', 'list', '--json', 'number,headRefName,mergeStateStatus,isDraft', '--limit', '50']);
  try { return JSON.parse(brut || '[]'); } catch { return []; }
})();

const shaMain = sh('git', ['rev-parse', '--short', 'origin/main']);
const dateMain = sh('git', ['log', '-1', '--format=%cI', 'origin/main']);
const lignes: string[] = [];

lignes.push('# PLAN-STATE — état vivant d\'Axion Partners');
lignes.push('');
lignes.push('> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les');
lignes.push('> PR GitHub, et git. Ne jamais l\'éditer à la main (`.claude/settings.json` l\'interdit) : modifier l\'issue.');
lignes.push('');
lignes.push(`## Phase courante : ${phaseCourante}`);
lignes.push('');
const restant = taches.filter((t) => t.phase === phaseCourante && !TERMINES.has(t.statut));
const faitPhase = taches.filter((t) => t.phase === phaseCourante && TERMINES.has(t.statut));
lignes.push(`${faitPhase.length}/${faitPhase.length + restant.length} tâches terminées · reste ${restant.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j estimés.`);
lignes.push('');

lignes.push('## Tâches');
lignes.push('');
lignes.push('| Statut | Nombre | Détail |');
lignes.push('| --- | --- | --- |');
for (const s of ['a_faire', 'en_cours', 'en_revue', 'fusionnee', 'deployee', 'verifiee', 'bloquee', 'attente_externe']) {
  const l = par(s);
  const detail = ['en_cours', 'en_revue', 'bloquee', 'attente_externe'].includes(s)
    ? l.map((t) => `${t.id}${t.owner ? ` (${t.owner})` : ''}${t.pr ? ` PR#${t.pr}` : ''}${t.motif ? ` — ${t.motif}` : ''}`).join(' · ')
    : l.length > 12 ? `${l.slice(0, 12).map((t) => t.id).join(', ')} …` : l.map((t) => t.id).join(', ');
  lignes.push(`| \`${s}\` | ${l.length} | ${detail || '—'} |`);
}
lignes.push('');

// ── Chemin critique ─────────────────────────────────────────────────────────
// Le plus long enchainement de taches liees par une dependance, pondere par les jours estimes.
// C'est lui qui donne la duree PLANCHER du projet : elargir la flotte d'agents ne le raccourcit
// pas d'une heure. Une estimation totale de 149 j ne dit rien de la date de fin ; ce chemin, si.
{
  const parId = new Map(taches.map((t) => [t.id, t]));
  const memo = new Map<string, { poids: number; suite: string[] }>();
  const plusLong = (id: string, vus: Set<string>): { poids: number; suite: string[] } => {
    const cache = memo.get(id);
    if (cache) return cache;
    const t = parId.get(id);
    if (!t) return { poids: 0, suite: [] };
    if (vus.has(id)) return { poids: 0, suite: [] }; // garde-fou : gov:tasks garantit l'acyclicite
    vus.add(id);
    let meilleur = { poids: 0, suite: [] as string[] };
    for (const d of t.deps) {
      const r = plusLong(d, vus);
      if (r.poids > meilleur.poids) meilleur = r;
    }
    vus.delete(id);
    const res = { poids: meilleur.poids + t.estimateDays, suite: [...meilleur.suite, id] };
    memo.set(id, res);
    return res;
  };

  let sommet = { poids: 0, suite: [] as string[] };
  for (const t of taches) {
    const r = plusLong(t.id, new Set());
    if (r.poids > sommet.poids) sommet = r;
  }

  lignes.push('## Chemin critique');
  lignes.push('');
  lignes.push(
    `**${sommet.poids.toFixed(2)} j** sur ${sommet.suite.length} taches enchainees — duree PLANCHER du projet. ` +
      `Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.`
  );
  lignes.push('');
  lignes.push(
    sommet.suite
      .map((id) => {
        const t = parId.get(id)!;
        const fait = TERMINES.has(t.statut);
        return `${fait ? '~~' : ''}${id}${fait ? '~~' : ''} (${t.estimateDays} j, ph ${t.phase})`;
      })
      .join(' → ')
  );
  lignes.push('');
  const restantCritique = sommet.suite
    .map((id) => parId.get(id)!)
    .filter((t) => !TERMINES.has(t.statut))
    .reduce((a, t) => a + t.estimateDays, 0);
  lignes.push(`Reste sur ce chemin : **${restantCritique.toFixed(2)} j**.`);
  lignes.push('');
}

if (bloquees.length || attente.length) {
  lignes.push('## Bloquées');
  lignes.push('');
  for (const t of [...bloquees, ...attente]) {
    lignes.push(`- **${t.id}** — ${t.titre} · ${t.motif ?? `attend ${t.externe}`}${(t.attempts ?? 0) > 0 ? ` · ${t.attempts} tentative(s)` : ''}`);
  }
  lignes.push('');
}

lignes.push('## Questions ouvertes pour Will');
lignes.push('');
if (!questions.length) {
  lignes.push('Aucune : toutes les décisions dont la phase courante dépend ont une hypothèse posée dans `docs/DECISIONS.md`.');
} else {
  for (const q of questions) lignes.push(`- ${q}`);
  if (questions.length > PLAFOND_QUESTIONS) {
    lignes.push('');
    lignes.push(`🛑 **${questions.length} questions ouvertes, plafond ${PLAFOND_QUESTIONS} : l'autopilote s'arrête.** Il faut un arbitrage avant de composer un nouveau lot.`);
  }
}
lignes.push('');

lignes.push('## Hypothèses par défaut appliquées');
lignes.push('');
lignes.push(`${posees.size} décisions portent une hypothèse datée dans \`docs/DECISIONS.md\` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.`);
lignes.push('');

lignes.push('## PR ouvertes');
lignes.push('');
if (!prs.length) lignes.push('Aucune.');
else for (const p of prs) lignes.push(`- #${p.number} \`${p.headRefName}\` — ${p.mergeStateStatus}${p.isDraft ? ' (brouillon)' : ''}`);
lignes.push('');

lignes.push('## Dernier atterrissage');
lignes.push('');
lignes.push(`\`origin/main\` = \`${shaMain || '?'}\` (${dateMain || '?'}). Vérifier \`x-partners-build-sha\` avant toute nouvelle fusion.`);
lignes.push('');

lignes.push('## Dette déclarée');
lignes.push('');
const dette = taches.filter((t) => t.statut === 'proposee');
lignes.push(dette.length ? dette.map((t) => `- ${t.id} — ${t.titre}`).join('\n') : 'Aucune tâche `proposee` en attente d\'arbitrage.');
lignes.push('');

writeFileSync('docs/PLAN-STATE.md', lignes.join('\n') + '\n');
console.log(`PLAN-STATE régénéré — phase ${phaseCourante}, ${enCours.length} en cours, ${questions.length} question(s) ouverte(s).`);
if (questions.length > PLAFOND_QUESTIONS) process.exitCode = 1;
