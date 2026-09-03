/**
 * issues.ts — synchronise les issues GitHub avec `docs/tasks.json` (GOV-017).
 *
 * USAGE : pnpm gov:issues -- --sync --phase <n> [--repo <partners|axionia>] [--dry]
 *
 * POURQUOI CE SCRIPT EXISTE. Le SKILL §3 revendique une tâche par `gh issue edit ${t.issue}`, le
 * composeur lit `t.issue`, et `tasks.schema.json` le documente comme « écrit par `pnpm gov:issues
 * --sync` ». Ces trois endroits citaient un script qui **n'avait jamais été écrit** : les 197 tâches
 * portaient `issue: null`, et la première session d'autopilote s'arrêtait à la revendication, faute
 * de numéro à citer. Le SKILL interdit explicitement d'en inventer un.
 *
 * CE QU'IL FAIT
 *   — pour chaque tâche de la phase demandée sans numéro d'issue, crée l'issue et écrit son numéro ;
 *   — appariement par le PRÉFIXE du titre (`<ID> — `), jamais par recherche plein texte : deux
 *     tâches peuvent partager des mots, jamais un identifiant ;
 *   — idempotent : relancé, il ne crée rien et se contente de recoller les numéros manquants.
 *
 * CE QU'IL NE FAIT PAS. Il n'écrit aucun statut : `lot:cloture` est le seul écrivain de statut.
 * Il ne ferme aucune issue. Il ne touche pas aux tâches `attente_externe` : une question posée à
 * Will n'est pas un ticket de développement.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHEMIN = 'docs/tasks.json';
const LIVREE = new Set(['fusionnee', 'deployee', 'verifiee']);

type Tache = {
  id: string;
  titre: string;
  phase: number;
  repo: string;
  zone: string;
  sensible: string[];
  schema: boolean;
  reqs: string[];
  deps: string[];
  estimateDays: number;
  statut: string;
  issue: number | null;
  acceptance?: string;
};

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

if (!process.argv.includes('--sync')) {
  console.error('❌ gov:issues attend `--sync`. Usage : pnpm gov:issues -- --sync --phase <n>');
  process.exit(1);
}
if (!existsSync(CHEMIN)) {
  console.error(`❌ ${CHEMIN} est introuvable.`);
  process.exit(1);
}

const sec = arg('phase');
const phase = sec === undefined ? undefined : Number(sec);
if (sec !== undefined && !Number.isInteger(phase)) {
  console.error(`❌ --phase attend un entier (tiret ASCII : -1), reçu « ${sec} ».`);
  process.exit(1);
}
const repo = arg('repo');
const sec2 = process.argv.includes('--dry');

const doc = JSON.parse(readFileSync(CHEMIN, 'utf8')) as { version: number; taches: Tache[] };

/** Les issues déjà ouvertes, indexées par l'identifiant que porte le début de leur titre. */
const existantes = new Map<string, number>();
{
  const brut = gh(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title']);
  const liste = JSON.parse(brut || '[]') as { number: number; title: string }[];
  for (const i of liste) {
    const m = /^([A-Z][A-Za-z0-9-]*)\s+—/.exec(i.title);
    if (m && m[1]) existantes.set(m[1], i.number);
  }
}

const candidates = doc.taches.filter(
  (t) =>
    (phase === undefined || t.phase === phase) &&
    (repo === undefined || t.repo === repo) &&
    // Une question posée à un humain n'est pas un ticket de développement.
    t.statut !== 'attente_externe' &&
    // Une tâche déjà livrée n'a personne à qui être attribuée : une issue ouverte puis
    // refermée aussitôt n'est pas une trace, c'est du bruit dans la file.
    !LIVREE.has(t.statut)
);

let recollees = 0;
let creees = 0;
const journal: string[] = [];

for (const t of candidates) {
  const deja = existantes.get(t.id);
  if (deja !== undefined) {
    if (t.issue !== deja) {
      t.issue = deja;
      recollees++;
      journal.push(`${t.id} → #${deja} (recollée, l'issue existait)`);
    }
    continue;
  }
  if (t.issue !== null) continue; // numéro déjà porté, issue peut-être supprimée : on n'y touche pas

  const corps = [
    `**Phase ${t.phase}** · zone \`${t.zone}\` · \`${t.estimateDays} j\` · dépôt \`${t.repo}\``,
    '',
    t.deps.length ? `**Dépend de** ${t.deps.map((d) => `\`${d}\``).join(', ')}` : '**Aucune dépendance.**',
    '',
    `**Couvre** ${t.reqs.map((r) => `\`${r}\``).join(', ')}`,
    '',
    t.acceptance ? `## Acceptation\n\n${t.acceptance}` : '_Critère d’acceptation à écrire à l’attribution._',
    '',
    '---',
    '',
    `Issue **dérivée** de \`docs/tasks.json\` par \`pnpm gov:issues --sync\`. Le statut vit dans`,
    '`docs/tasks.json` et n’est écrit que par `pnpm lot:cloture` : les labels de cette issue sont une VUE.',
  ].join('\n');

  const labels = [`phase:${t.phase}`, `zone:${t.zone}`];
  if (t.schema) labels.push('schema');
  if (t.sensible.length > 0) labels.push('sensible');

  if (sec2) {
    journal.push(`${t.id} → (à blanc) création avec labels ${labels.join(', ')}`);
    continue;
  }

  // Les labels doivent exister avant d'être posés ; `--label` échoue sinon.
  for (const l of labels) {
    try {
      gh(['label', 'create', l, '--force', '--color', 'BFD4F2', '--description', `dérivé de docs/tasks.json`]);
    } catch {
      /* le label existe déjà : rien à faire */
    }
  }

  const url = gh([
    'issue', 'create',
    '--title', `${t.id} — ${t.titre}`,
    '--body', corps,
    ...labels.flatMap((l) => ['--label', l]),
  ]);
  const m = /\/(\d+)\s*$/.exec(url);
  if (!m || !m[1]) {
    console.error(`❌ ${t.id} : impossible de lire le numéro d'issue dans « ${url} ».`);
    process.exit(1);
  }
  t.issue = Number(m[1]);
  existantes.set(t.id, t.issue);
  creees++;
  journal.push(`${t.id} → #${t.issue} (créée)`);
}

if (!sec2) {
  writeFileSync(CHEMIN, JSON.stringify(doc, null, 2) + '\n');
}

console.log(
  `${sec2 ? '(à blanc) ' : ''}gov:issues — ${candidates.length} tâche(s) examinée(s) · ` +
    `${creees} créée(s) · ${recollees} recollée(s).`
);
for (const l of journal) console.log(`   ${l}`);

const sans = candidates.filter((t) => t.issue === null);
if (sans.length > 0 && !sec2) {
  console.error(`\n❌ ${sans.length} tâche(s) restent sans issue : ${sans.map((t) => t.id).join(', ')}`);
  process.exit(1);
}
