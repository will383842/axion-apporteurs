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
  baseIntrouvableRefusee,
  controler,
  estLeCheckoutDeLaForge,
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

// SECOND BANC — UNE RÉSOLUTION DE FUSION (refus de la lentille `exactitude`, PR #235). Chaque PR
// intègre `main` par une fusion ; un conflit s'y résout DANS le commit de fusion, et `diff-tree` sans
// option n'en rend rien. Ici, la résolution écrit une coordonnée, et le commit suivant la retire.
const BAC2 = mkdtempSync(join(tmpdir(), 'gov-066-fusion-'));
afterAll(() => rmSync(BAC2, { recursive: true, force: true }));
const git2 = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=banc', '-c', 'user.email=banc@exemple.invalid', ...args], {
    cwd: BAC2,
    encoding: 'utf8',
  }).trim();
const ecrire2 = (texte: string) => writeFileSync(join(BAC2, 'vue.md'), texte);
git2('init', '-q', '-b', 'main');
ecrire2('v0\n');
git2('add', '.');
git2('commit', '-q', '-m', 'base');
const BASE2 = git2('rev-parse', 'HEAD');
git2('checkout', '-q', '-b', 'pr');
ecrire2('v-pr\n');
git2('commit', '-q', '-am', 'la PR');
git2('checkout', '-q', 'main');
ecrire2('v-main\n');
git2('commit', '-q', '-am', 'main avance');
git2('checkout', '-q', 'pr');
try {
  git2('merge', '-q', '--no-edit', 'main');
} catch {
  // conflit attendu sur vue.md : il se résout DANS le commit de fusion
}
ecrire2(`v-resolue ${IBAN_TEMOIN}\n`);
git2('add', 'vue.md');
git2('commit', '-q', '--no-edit');
const FUSION = git2('rev-parse', 'HEAD');
ecrire2('v-finale\n');
git2('commit', '-q', '-am', 'propre');

describe('REQ-GOV-031 — la garde d’entité juge chaque commit de la PR, pas seulement la tête (GOV-066)', () => {
  it('REQ-GOV-031 — TÉMOIN : une coordonnée écrite par une RÉSOLUTION DE FUSION puis retirée est lue, et nommée avec le commit de fusion', () => {
    const { fichiers } = fichiersDesCommits(BASE2, 'HEAD', BAC2);
    const deLaFusion = fichiers.filter((f) => f.commit === FUSION);
    expect(deLaFusion.map((f) => f.chemin)).toEqual(['vue.md']);
    expect(deLaFusion[0]!.contenu).toContain(IBAN_TEMOIN);
    const fautes = controler({ ...UNIVERS_CONFORME, fichiersDesCommits: fichiers }).filter(
      (f) => f.famille === 'coordonnee_en_clair'
    );
    expect(fautes).toHaveLength(1);
    expect(fautes[0]!.message).toContain(FUSION.slice(0, 7));
  });

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
    expect(LIMITE_DE_L_HISTORIQUE).toMatch(/push forcé/);
  });

  it('REQ-GOV-031 — TÉMOIN : sur une demande de fusion, une base introuvable est un refus, pas « zéro commit lu »', () => {
    expect(baseIntrouvableRefusee(true, 'pull_request', true)).toBe(true);
    expect(baseIntrouvableRefusee(false, 'pull_request', true)).toBe(false);
    expect(baseIntrouvableRefusee(true, 'push', true)).toBe(false);
    expect(baseIntrouvableRefusee(true, undefined, true)).toBe(false);
    // Un banc d'essai jetable, hors du checkout de la forge, qui hérite de son environnement : pas refusé.
    expect(baseIntrouvableRefusee(true, 'pull_request', false)).toBe(false);
  });

  it('REQ-GOV-031 — TÉMOIN : le refus passe par le canal des fautes (`source_illisible`), jamais par une sortie à part', () => {
    const fautes = controler({ ...UNIVERS_CONFORME, baseIntrouvable: true, baseRequise: true });
    expect(fautes.map((f) => f.famille)).toEqual(['source_illisible']);
    expect(fautes[0]!.message).toMatch(/0 commit lu/);
    // Contre-témoin : base introuvable hors checkout de la forge, ou base trouvée : aucune faute.
    expect(controler({ ...UNIVERS_CONFORME, baseIntrouvable: true })).toEqual([]);
    expect(controler({ ...UNIVERS_CONFORME, baseIntrouvable: false, baseRequise: true })).toEqual(
      []
    );
  });

  it('REQ-GOV-031 — TÉMOIN : seul un banc PROUVÉ sort du checkout de la forge ; l’espace absent ou illisible vaut la forge', () => {
    expect(estLeCheckoutDeLaForge(undefined, BAC)).toBe(true);
    expect(estLeCheckoutDeLaForge('', BAC)).toBe(true);
    expect(estLeCheckoutDeLaForge(join(BAC, 'inexistant'), BAC)).toBe(true);
    expect(estLeCheckoutDeLaForge(BAC, BAC)).toBe(true);
    // Le banc : un dépôt lisible, hors de l'espace de travail lisible.
    expect(estLeCheckoutDeLaForge(BAC2, BAC)).toBe(false);
  });
});
