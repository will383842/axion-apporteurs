/**
 * La forge, lue UNE fois par run de tests — QA-T63 (REQ-GOV-006, REQ-QA-013). `globalSetup` de
 * `vitest.config.ts` (dont `vitest.mutation.config.ts` hérite).
 *
 * POURQUOI. Chaque témoin qui lance `gov:etat` sur l'état réel relisait la forge — PR ouvertes,
 * PR fusionnées, issues ouvertes —, et une dizaine de portes A ensemble épuisaient la limite d'API
 * de l'installation (« GraphQL: API rate limit already exceeded », #404, #397, #385, 2026-10-02).
 *
 * CE QU'IL FAIT. Il lit les lectures de la porte A (`gov:etat`, `gov:trace`) une fois, écrit l'instantané dans un
 * dossier TEMPORAIRE du système (jamais dans l'arbre, jamais commité), et pose `GOV_ETAT_FORGE` :
 * les processus fils l'héritent, et `gov:etat` relit l'instantané au lieu de la forge. Le dossier
 * est supprimé à la fin du run.
 *
 * CE QU'IL NE FAIT PAS.
 *   — Une lecture échoue (pas de `gh`, pas de réseau, bac à sable de mutation) : il ne pose RIEN,
 *     et `gov:etat` lit la forge comme avant — échec fermé, jamais un vert sur une forge non lue.
 *   — `GOV_ETAT_GH` posé (un faux `gh`) ou `GOV_ETAT_FORGE` déjà posée (un vitest lancé par un
 *     test, comme `gov:trace` le fait) : il ne lit rien — l'instantané du run parent fait foi.
 *   — Hors vitest (la porte A, `pnpm gov:etat` à la main), il ne tourne pas : rien ne change.
 *   — `GOV_FORGE` posée (QA-T64 : `pnpm test` dans la porte A, après `forge:instantane`) : il ne
 *     lit rien — l'instantané de la porte fait foi, et la forge n'est pas relue.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LECTURES_DE_LA_PORTE_A } from '../scripts/gates/forge-instantane';

/**
 * Les lectures de la porte A (`gov:etat` et `gov:trace`), mot pour mot : la clé de l'instantané.
 * UNE liste, tenue par `scripts/gates/forge-instantane.ts` (QA-T64) : le run de tests et la porte A
 * figent les mêmes lectures.
 */
export const LECTURES_DE_LA_FORGE = LECTURES_DE_LA_PORTE_A;

export type Lire = (args: readonly string[]) => string;

/**
 * L'instantané : une sortie par lecture, indexée par ses arguments joints. Chaque lecture est faite
 * UNE fois. Une seule qui échoue, ou qui ne rend pas du JSON, et il n'y a pas d'instantané (`null`) :
 * un instantané partiel ferait échouer `gov:etat` sur ce qu'il n'a pas lu.
 */
export function figerLaForge(lire: Lire): Record<string, string> | null {
  const instantane: Record<string, string> = {};
  for (const args of LECTURES_DE_LA_FORGE) {
    try {
      const sortie = lire(args);
      JSON.parse(sortie);
      instantane[args.join(' ')] = sortie;
    } catch {
      return null;
    }
  }
  return instantane;
}

const lireLaForge: Lire = (args) =>
  execFileSync('gh', [...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/**
 * Pose l'instantané, et rend de quoi le retirer. Rien n'est lu ni posé :
 *   — `GOV_ETAT_GH`, `GOV_ETAT_FORGE` ou `GOV_FORGE` déjà posée (banc d'attaque, vitest lancé par
 *     un test, ou la porte A) ;
 *   — en mode `vitest list` (que `gov:trace` lance) : il collecte, il n'exécute aucun test, et la
 *     forge lue pour rien serait une lecture de plus qu'avant.
 */
export function preparer(lire: Lire, argv: readonly string[]): (() => void) | undefined {
  if (process.env['GOV_ETAT_GH'] || process.env['GOV_ETAT_FORGE'] || process.env['GOV_FORGE'])
    return undefined;
  if (argv.includes('list')) return undefined;
  const instantane = figerLaForge(lire);
  if (instantane === null) return undefined;
  const dossier = mkdtempSync(join(tmpdir(), 'axion-forge-'));
  const chemin = join(dossier, 'forge.json');
  writeFileSync(chemin, JSON.stringify(instantane));
  process.env['GOV_ETAT_FORGE'] = chemin;
  return () => {
    rmSync(dossier, { recursive: true, force: true });
    delete process.env['GOV_ETAT_FORGE'];
  };
}

/**
 * Le point d'entrée de vitest. SANS paramètre injectable : vitest appelle un `globalSetup` en lui
 * passant le PROJET — un `setup(lire = …)` l'aurait pris pour le lecteur, et l'instantané n'aurait
 * jamais été posé (vu le 2026-10-02 : `GOV_ETAT_FORGE` absente d'un run réel).
 */
export default function setup(): (() => void) | undefined {
  return preparer(lireLaForge, process.argv);
}
