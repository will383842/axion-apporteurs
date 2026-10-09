// @req REQ-GOV-023
// @req REQ-GOV-024
/**
 * GOV-073 — quatre scripts lisaient une entrée de journal, chacun avec sa propre grammaire.
 *
 * LE DÉFAUT. Deux lecteurs coupaient chaque fichier sur les titres de niveau 2 puis cherchaient le
 * titre d'entrée sur N'IMPORTE QUELLE ligne du bloc ; un troisième coupait sur « PR # » sans exiger
 * la date ; le quatrième avait son propre motif, ligne à ligne, et RETAPAIT le plancher. Le plancher
 * se lisait aussi dans un commentaire masqué du guide. Le seul témoin d'égalité n'était que partiel.
 *
 * CE QUE CE FICHIER GARDE. UNE grammaire exportée, importée par les quatre, et aucun motif local ne
 * subsiste (RM-01). Une entrée à la limite de la forme est lue IDENTIQUEMENT ; une entrée malformée
 * fait sortir les quatre en non nul sous le MÊME nom de refus ; le journal du dépôt les fait sortir
 * en zéro, avec le compte des entrées réellement lues.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  REFUS_JOURNAL,
  entreesDeJournal,
  lireLeJournal,
  plancherDuJournal,
} from '../../../scripts/gates/gov-attributions';
import { CHEMINS_DES_VUES } from '../../../scripts/vues/rendre-apres-fusion';

const RACINE = process.cwd();
const TSX = resolve(RACINE, 'node_modules/tsx/dist/cli.mjs');

/**
 * Les instants injectés — jamais l'horloge. `etat` : le jour de l'entrée la plus récente, pour
 * qu'aucune ne soit « future » ; `lecons` : le jour de la dernière consolidation, pour qu'aucune
 * péremption ne rougisse. Chaque lecteur est jugé sur le journal, pas sur la date du jour.
 */
interface Jours {
  etat: string;
  lecons: string;
}
function jours(): Jours {
  const dates = readdirSync('docs/journal')
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .flatMap((n) => [
      ...readFileSync(join('docs/journal', n), 'utf8').matchAll(
        /^## PR #\d+ — (\d{4}-\d{2}-\d{2}) — /gm
      ),
    ])
    .map((m) => m[1]!)
    .sort();
  return { etat: dates.at(-1)!, lecons: jourDeConsolidation() };
}

/** Les quatre lecteurs, et la commande qui les lance sans rien écrire de suivi. */
const LECTEURS: readonly { script: string; args: (j: Jours) => string[] }[] = [
  {
    script: 'scripts/gates/gov-etat.ts',
    args: (j) => ['--hors-ligne', '--now', `${j.etat}T12:00:00Z`],
  },
  { script: 'scripts/plan-state/build.ts', args: () => ['--verifier'] },
  { script: 'scripts/gates/gov-lecons.ts', args: (j) => ['--now', j.lecons] },
  { script: 'scripts/gates/gov-attributions.ts', args: () => [] },
];

function lancer(cwd: string, script: string, args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, resolve(RACINE, script), ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64e6,
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Le jour de la dernière consolidation des leçons : un `--now` qui ne rend aucune péremption. */
function jourDeConsolidation(): string {
  const m = /<!--\s*consolidation:\s*(\d{4}-\d{2}-\d{2})\s*-->/.exec(
    readFileSync('docs/LECONS.md', 'utf8')
  );
  if (!m) throw new Error('docs/LECONS.md ne porte plus sa date de consolidation');
  return m[1]!;
}

/** Les titres d'entrée du journal réel, recomptés ICI ligne à ligne — jamais par la grammaire jugée. */
function entreesDuDepot(): number {
  return readdirSync('docs/journal')
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .map((n) => readFileSync(join('docs/journal', n), 'utf8'))
    .flatMap((t) => t.split('\n'))
    .filter((l) => /^## PR #\d+ — \d{4}-\d{2}-\d{2} — /.test(l)).length;
}

const ENTREE = (pr: number, suffixe = ''): string =>
  `## PR #${pr} — 2026-09-27 — chore(ZZ-T0${pr}): une entree${suffixe}\n\n` +
  `**Fait.** fait ${pr}.\n\n**Reste.** rien.\n\n**Appris.** appris ${pr}.\n`;

describe('REQ-GOV-024 — UNE grammaire exportée, importée par les quatre lecteurs, aucun motif local', () => {
  it('REQ-GOV-024 — chaque lecteur IMPORTE la grammaire unique, et aucun ne garde de motif de titre ni de plancher', () => {
    // Les motifs d'une grammaire DE JOURNAL : une coupe sur les titres suivie de `.slice(1)`, ou sur
    // « PR # », le titre d'entrée, le plancher. `gov-lecons.ts` coupe aussi `docs/LECONS.md` sur ses
    // titres : ce n'est pas le journal, et ce motif-là n'est pas visé.
    const MOTIFS_LOCAUX = [
      /split\(\/\^## \/m\)\.slice\(1\)/,
      /split\(\/\^## \(\?=PR/,
      /PR #\(\\d\+\)/,
      /Plancher\\s\*:/,
    ];
    for (const { script } of LECTEURS) {
      if (script === 'scripts/gates/gov-attributions.ts') continue;
      const code = readFileSync(script, 'utf8');
      expect(code, `${script} n’importe pas la grammaire`).toMatch(
        /from '\.\.\/(?:gates\/)?gov-attributions'|from '\.\/gov-attributions'/
      );
      for (const m of MOTIFS_LOCAUX)
        expect(code, `${script} garde un motif local ${m}`).not.toMatch(m);
    }
    // Et le quatrième ne porte qu'UNE écriture du plancher : la sienne, exportée.
    const attributions = readFileSync('scripts/gates/gov-attributions.ts', 'utf8');
    expect((attributions.match(/Plancher\\s\*:/g) ?? []).length).toBe(1);
  });
});

describe('REQ-GOV-023 — une entrée à la limite de la forme est lue IDENTIQUEMENT', () => {
  const LIMITE =
    '# Journal — témoin\n\n' +
    // un titre qui porte des espaces en fin de ligne : invisibles au rendu, et au lecteur
    ENTREE(1).replace('une entree\n', 'une entree   \n') +
    '\n## Une section qui n’est pas une entrée\n\nUne ligne qui cite PR #9 au milieu.\n\n' +
    // la dernière entrée, sans fin de ligne finale
    ENTREE(2).trimEnd();

  it('REQ-GOV-023 — la grammaire rend les mêmes entrées, titres rognés, corps borné au titre suivant', () => {
    const { entrees, malformees } = lireLeJournal([{ fichier: 'limite.md', texte: LIMITE }]);
    expect(malformees).toEqual([]);
    expect(entrees.map((e) => [e.pr, e.date, e.titre])).toEqual([
      [1, '2026-09-27', 'chore(ZZ-T01): une entree'],
      [2, '2026-09-27', 'chore(ZZ-T02): une entree'],
    ]);
    // Le corps de l'entrée 1 s'arrête au titre de niveau 2 suivant : la section n'en fait pas partie.
    expect(entrees[0]!.corps).not.toContain('Une ligne qui cite');
  });

  it('REQ-GOV-023 — le quatrième lecteur rend les MÊMES numéros que la grammaire, sur le même texte', () => {
    const { entrees } = lireLeJournal([{ fichier: 'limite.md', texte: LIMITE }]);
    expect([...entreesDeJournal(LIMITE).keys()]).toEqual(entrees.map((e) => String(e.pr)));
  });

  it('REQ-GOV-023 — le plancher écrit AUSSI dans un commentaire MASQUÉ est refusé, jamais choisi : la première occurrence ne fait plus foi', () => {
    // Avant : `gov:etat` prenait la PREMIÈRE occurrence — ici la masquée (> 99) — pendant que
    // `gov:attributions` refusait. Deux verdicts pour un même fichier ; la lecture partagée refuse.
    const readme =
      '# Le journal\n\n<!-- Plancher : le journal couvre les PR de numéro **> 99**. -->\n\n' +
      '## Plancher\n\nPlancher : le journal couvre les PR de numéro **> 27**.\n';
    const lu = plancherDuJournal(readme);
    expect('refus' in lu ? lu.refus : lu.plancher).toMatch(/écrit 2 fois/);
  });

  it('REQ-GOV-023 — le plancher écrit SEULEMENT dans un commentaire masqué est signalé masqué, donc refusé', () => {
    const lu = plancherDuJournal(
      '# Le journal\n\n<!--\nPlancher : le journal couvre les PR de numéro **> 99**.\n-->\n'
    );
    expect('masque' in lu && lu.masque).toBe(true);
    // Le contre-témoin : le même, affiché, ne l'est pas.
    const affiche = plancherDuJournal(
      '# Le journal\n\nPlancher : le journal couvre les PR de numéro **> 99**.\n'
    );
    expect('masque' in affiche && affiche.masque).toBe(false);
  });
});

// ── les quatre binaires, dans une copie de travail ─────────────────────────────────────────────

function copieDeTravail(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gov-073-'));
  // Les vues dérivées ne sont plus suivies par git : `pnpm vues:rendre` les écrit sur le disque,
  // d'où elles sont copiées (`gov:etat` lit `docs/PLAN-STATE.md`).
  const suivis = [
    ...execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean),
    ...CHEMINS_DES_VUES.filter((v) => existsSync(join(RACINE, v))),
  ];
  const utiles = (f: string) =>
    f.startsWith('docs/journal/') ||
    f.startsWith('docs/adr/') ||
    [
      'docs/tasks.json',
      'docs/gates.json',
      'docs/agents.json',
      'docs/DECISIONS.md',
      'docs/PLAN-STATE.md',
      'docs/LECONS.md',
      'docs/REGLES-MAISON.md',
      'scripts/lot/tasks.schema.json',
      'package.json',
    ].includes(f);
  for (const f of suivis.filter(utiles)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(RACINE, f), join(dir, f));
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

describe('REQ-GOV-023 — une entrée malformée fait sortir les QUATRE en non nul, sous le MÊME refus', () => {
  it('REQ-GOV-023 — TÉMOIN À DEUX FACES : sans l’entrée, aucun ne la nomme ; avec elle, les quatre sortent en non nul et nomment le refus', () => {
    const dir = copieDeTravail();
    const jour = jours();
    try {
      for (const l of LECTEURS) {
        const sain = lancer(dir, l.script, l.args(jour));
        expect(sain.sortie, `${l.script} — copie saine`).not.toContain(REFUS_JOURNAL);
      }
      // Un titre RENDU comme celui d'une entrée, écrit autrement : un tiret simple au lieu du
      // tiret cadratin. Le rendu l'affiche en titre ; aucune grammaire ne doit le lire à moitié.
      const fichier = 'docs/journal/2026-09-pr-9999.md';
      writeFileSync(
        join(dir, fichier),
        '## PR #9999 - 2026-09-27 - une entree mal formee\n\n**Fait.** x.\n'
      );
      execFileSync('git', ['add', fichier], { cwd: dir });
      for (const l of LECTEURS) {
        const r = lancer(dir, l.script, l.args(jour));
        expect(r.code, `${l.script}\n${r.sortie.slice(-800)}`).not.toBe(0);
        expect(r.sortie, l.script).toContain(REFUS_JOURNAL);
        expect(r.sortie, l.script).toContain('2026-09-pr-9999.md');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it('REQ-GOV-023 — le journal du dépôt : les quatre sortent en zéro, avec le compte des entrées lues', () => {
    const n = entreesDuDepot();
    expect(n).toBeGreaterThan(0);
    const jour = jours();
    for (const l of LECTEURS) {
      const r = lancer(RACINE, l.script, l.args(jour));
      expect(r.code, `${l.script}\n${r.sortie.slice(-1500)}`).toBe(0);
      expect(r.sortie, l.script).toContain(`journal — ${n} entrée(s) lue(s)`);
    }
  }, 300_000);
});
