/**
 * reprise.ts — écrit `docs/lots/REPRISE.md`, l'état de reprise du chantier.
 *
 * USAGE : pnpm reprise
 *
 * POURQUOI. Une session peut se fermer sans prévenir. `claude --continue` restaure la conversation,
 * mais pas la RÉPONSE à « où en est-on, qu'est-ce qui tourne, que faut-il taper maintenant ». Ce
 * fichier la donne, et il est **dérivé** : il se régénère depuis `docs/tasks.json`, git et GitHub.
 * Un état de reprise tenu à la main ment au premier oubli — c'est la même raison qui a fait de
 * `TASKS.md` une vue générée.
 *
 * CE QU'IL NE FAIT PAS. Il n'invente aucun récit. La partie narrative — ce qu'une session a décidé et
 * pourquoi — vit dans `docs/lots/REPRISE-NOTES.md`, écrit à la main, et il est recopié tel quel.
 * S'il est absent, le fichier le dit au lieu de faire semblant.
 *
 * Le fichier produit est sous `docs/lots/`, qui est dans `.gitignore` : c'est un état de session,
 * pas un livrable du dépôt public.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SORTIE = 'docs/lots/REPRISE.md';
const NOTES = 'docs/lots/REPRISE-NOTES.md';
const LIVREE = new Set(['fusionnee', 'deployee', 'verifiee']);

type Tache = {
  id: string; titre: string; phase: number; statut: string; estimateDays: number;
  deps: string[]; issue: number | null; externe: string | null; owner?: string | null; pr?: number | null;
};

function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };
const T = doc.taches;
const parId = new Map(T.map((t) => [t.id, t]));
const livrees = new Set(T.filter((t) => LIVREE.has(t.statut)).map((t) => t.id));

const jTotal = T.reduce((a, t) => a + t.estimateDays, 0);
const jFaits = T.filter((t) => LIVREE.has(t.statut)).reduce((a, t) => a + t.estimateDays, 0);

const PHASES: Record<number, string> = {
  [-1]: 'Gouvernance', 0: 'Socle technique', 1: 'Opérationnel', 2: 'Argent', 3: 'Pilotage et conformité',
};

/** La phase courante : la plus basse qui porte encore une tâche non livrée. */
const phaseCourante = [-1, 0, 1, 2, 3].find((p) => T.some((t) => t.phase === p && !LIVREE.has(t.statut))) ?? 3;

/** Éligible = à faire, phase courante, dépendances toutes livrées, pas d'attente externe. */
const eligibles = T.filter(
  (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.externe === null && t.deps.every((d) => livrees.has(d))
);
const bloquees = T.filter(
  (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.deps.some((d) => !livrees.has(d))
);
const attente = T.filter((t) => t.statut === 'attente_externe');
const enCours = T.filter((t) => t.statut === 'en_cours' || t.statut === 'en_revue');

/** Les lots ouverts sur le disque : un dossier `docs/lots/L*` sans `resultat.json` est en cours. */
const lots: string[] = [];
if (existsSync('docs/lots')) {
  for (const d of readdirSync('docs/lots')) {
    const p = join('docs/lots', d);
    if (!statSync(p).isDirectory()) continue;
    const fini = existsSync(join(p, 'resultat.json'));
    lots.push(`${d} — ${fini ? 'clôturé (resultat.json présent)' : '**ouvert**, pas de resultat.json'}`);
  }
}

const sha = sh('git', ['rev-parse', '--short', 'HEAD']);
const branche = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const propre = sh('git', ['status', '--porcelain']);
const dernier = sh('git', ['log', '-1', '--format=%s']);
const prs = sh('gh', ['pr', 'list', '--json', 'number,title,mergeStateStatus', '--limit', '20']);

const l: string[] = [];
const w = (s = '') => l.push(s);

w('# Où on en est — Axion Apporteurs');
w();
w('> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm reprise` depuis `docs/tasks.json`, git et GitHub.');
w('> Ne pas l’éditer à la main : la partie narrative se met dans `docs/lots/REPRISE-NOTES.md`,');
w('> qui est recopié tel quel plus bas.');
w();
w('## Reprendre la conversation');
w();
w('```');
w('claude --continue     # reprend la dernière session de ce dossier');
w('claude --resume       # propose la liste des sessions');
w('```');
w();
w('Les transcrits vivent dans `~/.claude/projects/C--Users-willi-Documents-Projets-Axion-IA/`.');
w('⚠️ La compétence `/lot` et les 15 fiches de rôle n’existent que si la session est lancée **depuis');
w('ce dépôt** : `cd C:\\Users\\willi\\Documents\\Projets\\axion-apporteurs` avant de lancer `claude`.');
w();
w('## L’état, en chiffres');
w();
w('| | |');
w('| --- | --- |');
w(`| Avancement | **${((100 * jFaits) / jTotal).toFixed(1)} %** — ${jFaits.toFixed(2)} j livrés sur ${jTotal.toFixed(2)} |`);
w(`| Tâches | ${livrees.size} livrées sur ${T.length} |`);
w(`| Phase courante | ${phaseCourante} — ${PHASES[phaseCourante]} |`);
w(`| \`main\` | \`${sha}\` — ${dernier} |`);
w(`| Branche locale | \`${branche}\`${propre ? ' — ⚠️ **arbre de travail non propre**' : ' — arbre propre'} |`);
w();
w('| Phase | Tâches | Livrées | Jours | Faits |');
w('| --- | ---: | ---: | ---: | ---: |');
for (const p of [-1, 0, 1, 2, 3]) {
  const liste = T.filter((t) => t.phase === p);
  if (liste.length === 0) continue;
  const f = liste.filter((t) => LIVREE.has(t.statut));
  w(`| ${p} — ${PHASES[p]} | ${liste.length} | ${f.length} | ${liste.reduce((a, t) => a + t.estimateDays, 0).toFixed(2)} | ${f.reduce((a, t) => a + t.estimateDays, 0).toFixed(2)} |`);
}
w();

w('## Ce qu’il faut taper pour repartir');
w();
w('```bash');
w('pnpm install                       # si le dépôt vient d’être cloné');
// Pas de compte écrit ici : `gov:check` en enchaîne six depuis GOV-004, et un nombre recopié
// dans une vue dérivée redevient faux à la garde suivante sans que rien ne le signale.
w('pnpm gov:check                     # les gardes de gouvernance, d’un coup');
w('pnpm plan-state:build              # régénère PLAN-STATE, dont le chemin critique');
w(`pnpm lot:composer -- --phase ${phaseCourante} --repo partners --max 8 --now <AAAA-MM-JJ>`);
w('```');
w();
if (enCours.length > 0) {
  w('⚠️ **Des tâches sont déclarées en cours.** Une revendication expire sans commit ni PR depuis 6 h ;');
  w('le composeur les remet alors à `a_faire`. Vérifier avant de recomposer :');
  w();
  for (const t of enCours) w(`- \`${t.id}\` — ${t.statut}${t.owner ? ` (${t.owner})` : ''}${t.pr ? `, PR #${t.pr}` : ''}`);
  w();
}
if (lots.length > 0) {
  w('### Lots sur le disque');
  w();
  for (const x of lots) w(`- ${x}`);
  w();
  w('Un lot **ouvert** se clôture par `pnpm lot:cloture -- --lot <id> --owner <Axx>`, après avoir écrit');
  w('le rendu du workflow dans `docs/lots/<id>/resultat.json`. C’est le SEUL écrivain de statut.');
  w();
}

w(`## Éligible maintenant — ${eligibles.length} tâche(s)`);
w();
if (eligibles.length === 0) {
  w('Aucune. Si la phase n’est pas finie, c’est que tout est bloqué par une dépendance ou une attente.');
} else {
  w('| Tâche | Issue | Jours | Titre |');
  w('| --- | ---: | ---: | --- |');
  for (const t of eligibles) w(`| \`${t.id}\` | ${t.issue ? `#${t.issue}` : '—'} | ${t.estimateDays} | ${t.titre.replace(/\|/g, '\\|').slice(0, 80)} |`);
}
w();
w(`## Bloqué par une dépendance — ${bloquees.length} tâche(s)`);
w();
for (const t of bloquees) {
  const manque = t.deps.filter((d) => !livrees.has(d));
  w(`- \`${t.id}\` attend ${manque.map((d) => `\`${d}\`${parId.has(d) ? ` (${parId.get(d)!.statut})` : ''}`).join(', ')}`);
}
w();
w(`## Attend une personne — ${attente.length} tâche(s)`);
w();
for (const t of attente) w(`- \`${t.id}\` — **${t.externe}** — ${t.titre.slice(0, 90)}`);
w();

if (prs) {
  try {
    const liste = JSON.parse(prs) as { number: number; title: string; mergeStateStatus: string }[];
    w(`## PR ouvertes — ${liste.length}`);
    w();
    for (const p of liste) w(`- #${p.number} \`${p.mergeStateStatus}\` — ${p.title.slice(0, 90)}`);
    w();
  } catch {
    /* gh absent ou non authentifié : on n'écrit rien plutôt qu'une liste fausse */
  }
}

w('## Le narratif de la session');
w();
if (existsSync(NOTES)) {
  w(readFileSync(NOTES, 'utf8').trim());
} else {
  w(`_Aucun \`${NOTES}\`._ Y écrire, à la main : ce que la session a décidé et pourquoi, ce qui tourne`);
  w('en arrière-plan, et ce qui restait à faire. Rien de tout cela n’est dérivable de l’état du dépôt.');
}
w();

mkdirSync('docs/lots', { recursive: true });
writeFileSync(SORTIE, l.join('\n') + '\n');
console.log(
  `✅ ${SORTIE} régénéré — ${((100 * jFaits) / jTotal).toFixed(1)} % · phase ${phaseCourante} · ` +
    `${eligibles.length} éligible(s), ${bloquees.length} bloquée(s), ${attente.length} en attente.`
);
