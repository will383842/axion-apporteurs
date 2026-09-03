/**
 * Les gardes de gouvernance, exercées comme des tests.
 *
 * POURQUOI CE FICHIER EXISTE. Les gardes tournent déjà dans la CI (job `gate-a`). Ce qu'elles ne
 * faisaient pas, c'est PROUVER leur propre capacité à rougir depuis `pnpm test` — et le schéma
 * `tasks.schema.json` exige, pour toute tâche livrée, des `tests` qui la couvrent. Une tâche de
 * gouvernance dont le seul contrôle est une garde n'avait aucun test à déclarer : elle ne pouvait
 * donc jamais passer `fusionnee` sans qu'on écrive un état invalide.
 *
 * Chaque garde est exercée DEUX FOIS :
 *   1. sur l'état du dépôt      → doit sortir 0 ;
 *   2. en mode `--prove`        → doit sortir 0 APRÈS avoir vu rougir chacune de ses familles.
 *
 * Le mode `--prove` échoue lui-même si une famille de règle n'a pas de témoin, ou si un
 * contre-témoin rougit. C'est lui qui porte la preuve ; ce test le rend exécutable ici.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const GARDES = [
  { nom: 'gov:publication', script: 'scripts/gates/gov-publication.ts', familles: 7 },
  { nom: 'gov:tasks', script: 'scripts/gates/gov-tasks.ts', familles: 11 },
  { nom: 'gov:requirements', script: 'scripts/gates/gov-requirements.ts', familles: 11 },
];

describe.each(GARDES)('$nom', ({ script, familles }) => {
  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer(script);
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it(`sait rougir : ses ${familles} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer(script, '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${familles} familles rougissent`);
  });
});

describe('la preuve n’est pas un décompte', () => {
  it('exige un témoin par famille, pas un total de fautes', () => {
    // Le --prove de gov:publication a compté des fautes jusqu'au 2026-09-03 : deux détections de
    // doctrine sur une même ligne suffisaient, et trois familles sur quatre étaient réputées
    // prouvées sans l'avoir jamais été. La sortie doit énumérer les familles, une par une.
    const { sortie } = lancer('scripts/gates/gov-publication.ts', '--prove');
    const lignes = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(lignes.length).toBe(7);
  });
});
