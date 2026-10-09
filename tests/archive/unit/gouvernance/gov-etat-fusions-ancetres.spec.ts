// @req REQ-GOV-006
// @req REQ-GOV-023
/**
 * `gov:etat` NE JUGE QUE LES FUSIONS ANCÊTRES DE L'ARBRE TESTÉ — GOV-141 (REQ-GOV-006, REQ-GOV-023).
 *
 * LE DÉFAUT MESURÉ. Une fusion dont le commit est PRÉSENT dans le clone était toujours jugée, même
 * quand elle n'est pas dans l'arbre testé : une PR en retard sur `main` (décision de Williams du
 * 2026-10-02 : la branche à jour n'est pas exigée) lisait la fusion d'une AUTRE PR, comparait
 * PLAN-STATE à sa date et rougissait. Chaque fusion rougissait les portes A des PR en cours.
 *
 * LA RÈGLE. Chaque fusion lue sur la forge est CLASSÉE (`scripts/lib/classer-la-fusion.ts`) :
 *   - `ancetre` : son commit est un ancêtre de HEAD. Elle est jugée : journal exigé, fraîcheur de
 *     PLAN-STATE comparée à la dernière fusion ancêtre ;
 *   - `hors_arbre` : son commit est dans le clone, mais pas dans l'arbre testé. Nommée et comptée,
 *     jamais un rouge, et sa date n'entre dans aucun jugement ;
 *   - `introuvable` : son commit n'est pas dans le clone. La règle de la porte A s'applique, inchangée
 *     (`la-porte-a-ne-depend-pas-des-autres-pr.spec.ts`).
 * Un clone SUPERFICIEL ne permet aucun de ces jugements : échec nommé, `clone_superficiel`, avec la
 * profondeur à poser.
 *
 * Le banc : la fonction de classement sur un dépôt git temporaire, puis la vraie garde lancée en
 * script avec une forge simulée (`GOV_ETAT_GH`), et enfin dans un clone superficiel de ce dépôt.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  classerLaFusion,
  estUnCloneSuperficiel,
  executerGit,
} from '../../../scripts/lib/classer-la-fusion';

const SCRIPT = 'scripts/gates/gov-etat.ts';
const MAINTENANT = `${new Date().toISOString().slice(0, 10)}T12:00:00Z`;
const DOSSIER = mkdtempSync(join(tmpdir(), 'gov-141-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));
if (/\s/.test(DOSSIER)) throw new Error(`le dossier temporaire porte un espace : ${DOSSIER}`);

/** Une identité de commit factice : le banc ne dépend pas de la configuration du poste. */
const IDENTITE = {
  GIT_AUTHOR_NAME: 'banc',
  GIT_AUTHOR_EMAIL: 'banc@exemple.invalid',
  GIT_COMMITTER_NAME: 'banc',
  GIT_COMMITTER_EMAIL: 'banc@exemple.invalid',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...IDENTITE },
  }).trim();
}

describe('REQ-GOV-006 — la fusion se classe par ancêtre, jamais par date (GOV-141)', () => {
  const depot = join(DOSSIER, 'depot');
  execFileSync('git', ['init', '-q', depot]);
  writeFileSync(join(depot, 'a.txt'), 'a');
  git(depot, 'add', '-A');
  git(depot, 'commit', '-q', '-m', 'base');
  const base = git(depot, 'rev-parse', 'HEAD');
  git(depot, 'checkout', '-q', '-b', 'cote');
  writeFileSync(join(depot, 'b.txt'), 'b');
  git(depot, 'add', '-A');
  git(depot, 'commit', '-q', '-m', 'une autre PR');
  const cote = git(depot, 'rev-parse', 'HEAD');
  git(depot, 'checkout', '-q', base);
  const dans = executerGit(depot);

  it('REQ-GOV-006 : un commit ancêtre de HEAD est `ancetre`', () => {
    expect(classerLaFusion(base, dans)).toBe('ancetre');
  });

  it('REQ-GOV-006 : TÉMOIN — un commit présent dans le clone mais hors de l’arbre testé est `hors_arbre`, même plus récent', () => {
    expect(classerLaFusion(cote, dans)).toBe('hors_arbre');
  });

  it('REQ-GOV-006 : TÉMOIN — un commit absent du clone est `introuvable`', () => {
    expect(classerLaFusion('e'.repeat(40), dans)).toBe('introuvable');
  });

  it('REQ-GOV-006 : un clone complet n’est pas superficiel, un clone `--depth 1` l’est', () => {
    expect(estUnCloneSuperficiel(dans)).toBe(false);
    const superficiel = join(DOSSIER, 'superficiel');
    execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(depot).href, superficiel]);
    expect(estUnCloneSuperficiel(executerGit(superficiel))).toBe(true);
  });
});

// ── la vraie garde, forge simulée ────────────────────────────────────────────

const FAUX_GH = join(DOSSIER, 'faux-gh.cjs');
writeFileSync(
  FAUX_GH,
  `const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync(process.env.GOV_ETAT_FAUX, 'utf8'));
const a = process.argv.slice(2);
const i = a.indexOf('--json');
const champs = i >= 0 ? a[i + 1].split(',') : [];
let liste;
if (a[0] === 'pr' && a.includes('open')) liste = [];
else if (a[0] === 'pr' && a.includes('merged')) liste = f.fusionnees;
else if (a[0] === 'issue' && a.includes('open')) liste = [];
else { console.error('faux gh : appel inattendu ' + a.join(' ')); process.exit(2); }
const vue = liste.map((o) => Object.fromEntries(champs.filter((c) => c in o).map((c) => [c, o[c]])));
process.stdout.write(JSON.stringify(vue));
`
);

let n = 0;
function lancer(
  fusion: { number: number; oid: string },
  cwd = process.cwd()
): { code: number; sortie: string } {
  const fixture = join(DOSSIER, `univers-${n++}.json`);
  writeFileSync(
    fixture,
    JSON.stringify({
      fusionnees: [
        {
          number: fusion.number,
          title: 'chore(GOV-012): une autre PR',
          mergeCommit: { oid: fusion.oid },
          mergedAt: new Date().toISOString(),
        },
      ],
    })
  );
  const r = spawnSync('npx', ['tsx', SCRIPT, '--now', MAINTENANT], {
    cwd,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, GOV_ETAT_GH: `node ${FAUX_GH}`, GOV_ETAT_FAUX: fixture },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe(
  'REQ-GOV-023 — la garde ne juge que les fusions de l’arbre testé (GOV-141)',
  { timeout: 300_000 },
  () => {
    it('REQ-GOV-006 : TÉMOIN — une fusion PRÉSENTE dans le clone et hors de l’arbre testé, plus récente que PLAN-STATE, ne rougit pas : nommée et comptée', () => {
      // Un commit d'aujourd'hui, enfant de HEAD : présent dans ce clone, jamais ancêtre de HEAD.
      // Sans journal et plus récent que PLAN-STATE : jugé, il rougirait deux familles.
      const horsArbre = git(
        process.cwd(),
        'commit-tree',
        'HEAD^{tree}',
        '-p',
        'HEAD',
        '-m',
        'GOV-141 banc'
      );
      const { code, sortie } = lancer({ number: 9902, oid: horsArbre });
      // Les deux messages que la fusion produirait si elle était jugée (familles
      // `pr_fusionnee_sans_journal` et `plan_state_perime`).
      expect(sortie).not.toMatch(/PR #9902 [^\n]*aucune entrée/);
      expect(sortie).not.toMatch(/dernière fusion \(PR #9902\)/);
      expect(sortie).toMatch(/1 fusion\(s\) hors de l’arbre testé/);
      expect(sortie).toContain('#9902');
      expect(code).toBe(0);
    });

    it('REQ-GOV-023 : CONTRE-TÉMOIN — une fusion ANCÊTRE de l’arbre testé, sans journal, rougit en la nommant', () => {
      const { code, sortie } = lancer({
        number: 9903,
        oid: git(process.cwd(), 'rev-parse', 'HEAD'),
      });
      expect(sortie).toContain('── pr_fusionnee_sans_journal');
      expect(sortie).toMatch(/PR #9903 [^\n]*aucune entrée/);
      expect(code).not.toBe(0);
    });

    it('REQ-GOV-006 : TÉMOIN — dans un clone SUPERFICIEL, la garde refuse de juger : `clone_superficiel` nommé, avec la profondeur à poser', () => {
      const superficiel = join(DOSSIER, 'clone-superficiel');
      execFileSync('git', [
        'clone',
        '-q',
        '--depth',
        '1',
        pathToFileURL(resolve(process.cwd())).href,
        superficiel,
      ]);
      symlinkSync(resolve('node_modules'), join(superficiel, 'node_modules'), 'junction');
      // PLAN-STATE est une vue rendue, hors suivi (`pnpm vues:rendre`) : le clone n'en porte pas.
      copyFileSync('docs/PLAN-STATE.md', join(superficiel, 'docs/PLAN-STATE.md'));
      const { code, sortie } = lancer({ number: 9904, oid: 'e'.repeat(40) }, superficiel);
      expect(sortie).toContain('clone_superficiel');
      expect(sortie).toContain('fetch-depth: 0');
      expect(code).not.toBe(0);
    });
  }
);
