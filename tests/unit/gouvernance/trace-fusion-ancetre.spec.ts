// @req REQ-QA-014
/**
 * GOV-144 — `gov:trace` ne confronte une PR fusionnée au registre du disque QUE si son commit de
 * fusion est un ANCÊTRE de HEAD (REQ-QA-014).
 *
 * LE DÉFAUT MESURÉ. Le maillon « PR → exigence » lisait toutes les PR fusionnées de la forge, y
 * compris celles fusionnées APRÈS la base d'une branche. Une PR qui inscrivait une exigence neuve
 * au registre (sur `main`) rendait rouges toutes les PR en retard sur `main` : leur disque ne
 * porte pas encore l'exigence que la PR fusionnée déclare couvrir. Mesuré le 2026-10-03 sur la
 * porte A d'une PR en cours, après une fusion qui citait une exigence de son propre rattrapage.
 *
 * LA RÈGLE, TROIS FACES (précision de la lentille sécurité) : la place d'un commit de fusion se lit
 * sur le GRAPHE (`git merge-base --is-ancestor`, classement partagé de `scripts/lib/classer-la-fusion.ts`) :
 *   — ANCÊTRE de HEAD : la PR est jugée, comme avant ;
 *   — code 1, hors de l'arbre testé : la PR est IGNORÉE et NOMMÉE, jamais un rouge ;
 *   — tout autre code (objet absent, clone superficiel) : ÉCHEC FERMÉ, rouge nommé ; un commit
 *     illisible n'est jamais tenu pour « non ancêtre ».
 * Une PR dont la forge ne rend pas de commit de fusion reste JUGÉE (échec fermé, pas d'exemption).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executerGit } from '../../../scripts/lib/classer-la-fusion';
import {
  controler,
  placerLesPr,
  universFixture,
  type PullRequest,
} from '../../../scripts/gates/gov-trace';

const DOSSIER = mkdtempSync(join(tmpdir(), 'gov-144-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));

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

/** Un dépôt : une base (HEAD), et un commit d'une AUTRE ligne d'histoire, présent mais hors de l'arbre. */
const depot = join(DOSSIER, 'depot');
execFileSync('git', ['init', '-q', depot]);
writeFileSync(join(depot, 'a.txt'), 'a');
git(depot, 'add', '-A');
git(depot, 'commit', '-q', '-m', 'base');
const ANCETRE = git(depot, 'rev-parse', 'HEAD');
git(depot, 'checkout', '-q', '-b', 'cote');
writeFileSync(join(depot, 'b.txt'), 'b');
git(depot, 'add', '-A');
git(depot, 'commit', '-q', '-m', 'une fusion postérieure à la base');
const HORS_ARBRE = git(depot, 'rev-parse', 'HEAD');
git(depot, 'checkout', '-q', ANCETRE);
const INEXISTANT = 'f'.repeat(40);
const DANS_LE_DEPOT = executerGit(depot);

/** Une PR au gabarit qui déclare couvrir une exigence ABSENTE du registre de la fixture. */
const prFautive = (numero: number): PullRequest => ({
  numero,
  gabarit: true,
  couvre: ['REQ-ZZZ-999'],
});

/** L'univers de la preuve, avec les PR données, placées sur le graphe du dépôt du banc. */
function juger(pr: PullRequest[], fusions: ReadonlyMap<number, string | null>) {
  const u = universFixture();
  const placees = placerLesPr(pr, fusions, DANS_LE_DEPOT);
  u.pr = placees.jugees;
  u.prHorsArbre = placees.horsArbre;
  u.prIntrouvables = placees.introuvables;
  return { u, placees, fautes: controler(u) };
}

const familles = (fautes: { famille: string }[]) => fautes.map((f) => f.famille);

describe('REQ-QA-014 — gov:trace ne juge que les PR dont la fusion est un ancêtre de HEAD (GOV-144)', () => {
  it('REQ-QA-014 : face 1 — une PR dont le commit de fusion est ANCÊTRE de HEAD est jugée : son exigence inconnue rougit', () => {
    const { placees, fautes } = juger([prFautive(10)], new Map([[10, ANCETRE]]));
    expect(placees.jugees.map((p) => p.numero)).toEqual([10]);
    expect(familles(fautes)).toContain('pr_couvre_req_inconnue');
  });

  it('REQ-QA-014 : face 2 — TÉMOIN — une PR fusionnée HORS de l’arbre testé (code 1) est ignorée et NOMMÉE, jamais un rouge', () => {
    const { placees, fautes } = juger([prFautive(11)], new Map([[11, HORS_ARBRE]]));
    expect(placees.jugees).toEqual([]);
    expect(placees.horsArbre).toEqual([{ numero: 11, oid: HORS_ARBRE }]);
    expect(familles(fautes)).not.toContain('pr_couvre_req_inconnue');
    expect(familles(fautes)).not.toContain('pr_fusion_introuvable');
  });

  it('REQ-QA-014 : face 3 — TÉMOIN — un commit de fusion INEXISTANT dans le clone rougit (échec fermé, jamais « non ancêtre »)', () => {
    const { placees, fautes } = juger([prFautive(12)], new Map([[12, INEXISTANT]]));
    expect(placees.introuvables).toEqual([{ numero: 12, oid: INEXISTANT }]);
    expect(familles(fautes)).toContain('pr_fusion_introuvable');
    const message = fautes.find((f) => f.famille === 'pr_fusion_introuvable')!.message;
    expect(message).toContain('12');
    expect(message).toContain(INEXISTANT);
  });

  it('REQ-QA-014 : une PR sans commit de fusion lisible sur la forge reste JUGÉE (aucune exemption par défaut)', () => {
    const { placees, fautes } = juger([prFautive(13)], new Map([[13, null]]));
    expect(placees.jugees.map((p) => p.numero)).toEqual([13]);
    expect(familles(fautes)).toContain('pr_couvre_req_inconnue');
    const absente = juger([prFautive(14)], new Map());
    expect(absente.placees.jugees.map((p) => p.numero)).toEqual([14]);
  });

  it('REQ-QA-014 : contre-témoin — les trois places se trient ensemble, chaque PR à la sienne', () => {
    const { placees } = juger(
      [prFautive(20), prFautive(21), prFautive(22)],
      new Map([
        [20, ANCETRE],
        [21, HORS_ARBRE],
        [22, INEXISTANT],
      ])
    );
    expect(placees.jugees.map((p) => p.numero)).toEqual([20]);
    expect(placees.horsArbre.map((p) => p.numero)).toEqual([21]);
    expect(placees.introuvables.map((p) => p.numero)).toEqual([22]);
  });

  it('REQ-QA-014 : TÉMOIN — dans un clone SUPERFICIEL, aucune place n’est sûre : toute PR à commit connu rougit, nommée', () => {
    const source = join(DOSSIER, 'source');
    execFileSync('git', ['init', '-q', source]);
    for (const n of ['un', 'deux', 'trois']) {
      writeFileSync(join(source, `${n}.txt`), n);
      git(source, 'add', '-A');
      git(source, 'commit', '-q', '-m', n);
    }
    const premier = git(source, 'rev-list', '--max-parents=0', 'HEAD');
    const superficiel = join(DOSSIER, 'superficiel');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${source}`, superficiel]);
    const placees = placerLesPr(
      [prFautive(30)],
      new Map([[30, premier]]),
      executerGit(superficiel)
    );
    expect(placees.jugees).toEqual([]);
    expect(placees.horsArbre).toEqual([]);
    expect(placees.introuvables).toEqual([{ numero: 30, oid: premier }]);
  });
});
