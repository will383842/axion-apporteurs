/**
 * forge-instantane.ts — `forge:instantane` (QA-T64 ; REQ-GOV-006, REQ-QA-013) : la forge lue UNE fois
 * par porte A.
 *
 * USAGE (en tête du job gate-a) : npx tsx scripts/gates/forge-instantane.ts
 *
 * LE DÉFAUT MESURÉ. Une porte A lisait la forge plusieurs fois, et souvent les MÊMES listes : les
 * trois de `gov:etat` (PR ouvertes, PR fusionnées, issues ouvertes) relues par `pnpm test`
 * (`tests/setup-forge.ts`) puis par `gov:etat` lui-même, et les PR fusionnées avec leur corps par
 * `gov:trace`. Une dizaine de portes A ensemble épuisaient la limite d'API.
 *
 * CE QUE FAIT L'ÉTAPE. Elle fait chaque lecture de `LECTURES_DE_LA_PORTE_A` UNE fois, écrit
 * l'instantané (une sortie de `gh` par lecture, indexée par ses arguments joints) dans `RUNNER_TEMP`,
 * et pose `GOV_FORGE` pour les étapes suivantes du job (`GITHUB_ENV`). `gov:etat`, `gov:pr`,
 * `gov:trace` et `tests/setup-forge.ts` le lisent par `lireDansLInstantane`.
 *
 * LES RÈGLES, toutes en échec FERMÉ et NOMMÉ :
 *   — une lecture qui échoue, ou qui ne rend pas du JSON : pas d'instantané, l'étape échoue ;
 *   — `GOV_FORGE` posé mais absent, illisible, d'une autre forme, ou sans la lecture demandée :
 *     la garde qui le lit échoue — jamais un repli silencieux sur la forge, jamais un vert ;
 *   — PRÉSÉANCE : `GOV_ETAT_GH` posé (un faux `gh`, le banc d'attaque) l'emporte, l'instantané est
 *     ignoré ;
 *   — `GOV_FORGE` est REFUSÉ hors du contexte prévu, la CI (`CI` et `GITHUB_ACTIONS`) ou vitest
 *     (lentille sécurité) : un instantané forgé ne fait jamais passer une porte réelle.
 * RÉSERVE ACCEPTÉE : une revue publiée pendant le job n'est pas vue par ce run ; le rejeu la voit.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** Les lectures de la porte A, mot pour mot celles des gardes : ce sont les clés de l'instantané. */
export const LECTURES_DE_LA_PORTE_A = [
  // `gov:etat` et `tests/setup-forge.ts`
  ['pr', 'list', '--state', 'open', '--json', 'number,title', '--limit', '100'],
  [
    'pr',
    'list',
    '--state',
    'merged',
    '--json',
    'number,title,mergeCommit,mergedAt',
    '--limit',
    '100',
  ],
  ['issue', 'list', '--state', 'open', '--json', 'number,title,labels', '--limit', '200'],
  // `gov:trace`
  ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,body'],
] as const;

export type Lire = (args: readonly string[]) => string;
type Env = Readonly<Record<string, string | undefined>>;

/** La clé d'une lecture dans l'instantané. */
export const cleDeLecture = (args: readonly string[]): string => args.join(' ');

/**
 * L'instantané : chaque lecture faite UNE fois. Une seule qui échoue, ou qui ne rend pas du JSON,
 * et il n'y a pas d'instantané (`null`) : un instantané partiel ferait échouer une garde sur ce qu'il
 * n'a pas lu.
 */
export function figerLesLectures(
  lire: Lire,
  lectures: readonly (readonly string[])[] = LECTURES_DE_LA_PORTE_A
): Record<string, string> | null {
  const instantane: Record<string, string> = {};
  for (const args of lectures) {
    try {
      const sortie = lire(args);
      JSON.parse(sortie);
      instantane[cleDeLecture(args)] = sortie;
    } catch {
      return null;
    }
  }
  return instantane;
}

/** Le contexte où un instantané est admis : la CI, ou un run de vitest. Ailleurs, `null`. */
export function contexteAdmis(env: Env): 'ci' | 'vitest' | null {
  if (env['CI'] === 'true' && env['GITHUB_ACTIONS'] === 'true') return 'ci';
  if (env['VITEST']) return 'vitest';
  return null;
}

/**
 * L'instantané en vigueur, et la variable qui le porte. `GOV_ETAT_GH` l'emporte (aucun) ;
 * `GOV_ETAT_FORGE` (vitest, QA-T63) prime sur `GOV_FORGE` (la porte A).
 */
export function instantaneEnVigueur(
  env: Env
): { variable: 'GOV_ETAT_FORGE' | 'GOV_FORGE'; chemin: string } | undefined {
  if (env['GOV_ETAT_GH']) return undefined;
  if (env['GOV_ETAT_FORGE']) return { variable: 'GOV_ETAT_FORGE', chemin: env['GOV_ETAT_FORGE'] };
  if (env['GOV_FORGE']) return { variable: 'GOV_FORGE', chemin: env['GOV_FORGE'] };
  return undefined;
}

/** Une lecture prise dans l'instantané ; toute défaillance LÈVE, nommée. */
export function lireDansLInstantane(
  instantane: { variable: 'GOV_ETAT_FORGE' | 'GOV_FORGE'; chemin: string },
  args: readonly string[],
  env: Env
): string {
  const { variable, chemin } = instantane;
  const contexte = contexteAdmis(env);
  if (variable === 'GOV_ETAT_FORGE' && contexte !== 'vitest')
    throw new Error(
      `GOV_ETAT_FORGE refusée hors de vitest (${chemin}) : l'instantané ne sert qu'aux témoins, une porte réelle lit la forge`
    );
  if (variable === 'GOV_FORGE' && contexte === null)
    throw new Error(
      `GOV_FORGE refusée hors de la CI et de vitest (${chemin}) : un instantané forgé ne fait pas passer une porte réelle`
    );
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    throw new Error(`instantané de la forge illisible (${chemin}) : ${(e as Error).message}`, {
      cause: e,
    });
  }
  const cle = cleDeLecture(args);
  const lu =
    typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>)[cle] : undefined;
  if (typeof lu !== 'string')
    throw new Error(`instantané de la forge sans la lecture « ${cle} » (${chemin})`);
  return lu;
}

/** L'étape de la porte A : la forge lue une fois, l'instantané écrit, `GOV_FORGE` posé. Rend le refus, ou `null`. */
export function poserLInstantane(lire: Lire, env: Env): string | null {
  const dossier = env['RUNNER_TEMP'];
  const sortieEnv = env['GITHUB_ENV'];
  if (!dossier || !sortieEnv)
    return 'RUNNER_TEMP et GITHUB_ENV sont exigés : cette étape ne tourne que dans la porte A';
  const instantane = figerLesLectures(lire);
  if (instantane === null)
    return 'une lecture de la forge a échoué ou n’a pas rendu de JSON : aucun instantané posé';
  const chemin = join(dossier, 'forge-instantane.json');
  writeFileSync(chemin, JSON.stringify(instantane));
  appendFileSync(sortieEnv, `GOV_FORGE=${chemin}\n`);
  return null;
}

const APPELE_DIRECTEMENT = /forge-instantane\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const lire: Lire = (args) =>
    execFileSync('gh', [...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const refus = poserLInstantane(lire, process.env);
  if (refus !== null) {
    console.error(`❌ forge:instantane — ${refus}`);
    process.exitCode = 1;
  } else {
    console.log(
      `✅ forge:instantane — ${LECTURES_DE_LA_PORTE_A.length} lectures de la forge, une par type, posées pour la porte A (GOV_FORGE).`
    );
  }
}
