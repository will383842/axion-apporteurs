// @req REQ-GOV-031
/**
 * CE QUE LA FORGE SERT, AU-DELÀ DE LA TÊTE — GOV-066 (REQ-GOV-031).
 *
 * La garde d'entité ne jugeait que l'index de la tête. Sur un dépôt PUBLIC, chaque commit poussé
 * par une PR reste lisible, même après une fusion par écrasement, et réécrire l'historique n'en
 * retire rien. La variante retenue : la garde juge CHAQUE commit de la PR (de la base, point de
 * divergence avec `main`, à la tête), fichier ajouté ou modifié par commit, lu tel qu'il était ;
 * et elle ÉCRIT ce qu'elle ne lit pas (l'historique déjà fusionné, les archives composées par la
 * forge avec les attributs d'export).
 *
 * TÉMOIN À DEUX FACES, dans un dépôt git JETABLE : une coordonnée ajoutée par un commit puis
 * retirée par le suivant laisse une tête propre ; la garde la voit au commit, et le NOMME. Le
 * contre-témoin : sans commit sale, rien ne rougit.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  IBAN_TEMOIN,
  LIMITE_DE_L_HISTORIQUE,
  UNIVERS_CONFORME,
  controler,
  fichiersDesCommits,
} from '../../../scripts/gates/gov-entite';

const BAC = mkdtempSync(join(tmpdir(), 'gov-066-'));
afterAll(() => rmSync(BAC, { recursive: true, force: true }));
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=banc', '-c', 'user.email=banc@exemple.invalid', ...args], {
    cwd: BAC,
    encoding: 'utf8',
  }).trim();

git('init', '-q', '-b', 'main');
writeFileSync(join(BAC, 'LISEZMOI.md'), 'un dépôt de banc\n');
git('add', '.');
git('commit', '-q', '-m', 'base');
const BASE = git('rev-parse', 'HEAD');
// Commit sale : une coordonnée bancaire dans une note.
writeFileSync(join(BAC, 'notes.txt'), `à reporter : ${IBAN_TEMOIN}\n`);
git('add', '.');
git('commit', '-q', '-m', 'sale');
const SALE = git('rev-parse', 'HEAD');
// Commit propre : la note retirée. La tête est propre, le commit précédent ne l'est pas.
unlinkSync(join(BAC, 'notes.txt'));
git('add', '-A');
git('commit', '-q', '-m', 'propre');

describe('REQ-GOV-031 — la garde d’entité juge chaque commit de la PR, pas seulement la tête (GOV-066)', () => {
  it('REQ-GOV-031 — les fichiers de chaque commit sont lus, la tête étant propre', () => {
    const { fichiers, commits } = fichiersDesCommits(BASE, 'HEAD', BAC);
    expect(commits).toBe(2);
    expect(fichiers.map((f) => [f.chemin, f.commit])).toEqual([['notes.txt', SALE]]);
    expect(fichiers[0]!.contenu).toContain(IBAN_TEMOIN);
  });

  it('REQ-GOV-031 — TÉMOIN : une coordonnée présente seulement dans un commit de la PR fait rougir la garde, qui NOMME le commit', () => {
    const { fichiers } = fichiersDesCommits(BASE, 'HEAD', BAC);
    const fautes = controler({ ...UNIVERS_CONFORME, fichiersDesCommits: fichiers }).filter(
      (f) => f.famille === 'coordonnee_en_clair'
    );
    expect(fautes).toHaveLength(1);
    expect(fautes[0]!.message).toContain('notes.txt');
    expect(fautes[0]!.message).toContain(SALE.slice(0, 7));
  });

  it('REQ-GOV-031 — CONTRE-TÉMOIN : sans commit sale, l’univers conforme reste sans faute', () => {
    expect(controler({ ...UNIVERS_CONFORME, fichiersDesCommits: [] })).toEqual([]);
    expect(controler(UNIVERS_CONFORME)).toEqual([]);
  });

  it('REQ-GOV-031 — un fichier identique à la tête n’est pas relu : il est déjà jugé', () => {
    const { fichiers } = fichiersDesCommits(BASE, 'HEAD', BAC);
    expect(fichiers.some((f) => f.chemin === 'LISEZMOI.md')).toBe(false);
  });

  it('REQ-GOV-031 — la limite est ÉCRITE : ce qui n’est pas lu est nommé', () => {
    expect(LIMITE_DE_L_HISTORIQUE).toMatch(/historique déjà fusionné/);
    expect(LIMITE_DE_L_HISTORIQUE).toMatch(/attributs d'export/);
  });
});
