// @req REQ-GOV-006
// @req REQ-GOV-015
// @req REQ-GOV-024
/**
 * GOV-060 — la vue d'état comptait des questions déjà tranchées : un TROISIÈME lecteur du registre.
 *
 * MESURE DU 2026-09-26, rejouée avant d'écrire une ligne : `docs/PLAN-STATE.md` annonçait cinq
 * questions ouvertes pour Will — W9, W6, DEC-INT-002 (« bloquante, §1 du registre »), W12, W11 —
 * que le lecteur unique (`scripts/lot/registre-decisions.ts`) rend TOUTES tranchées le
 * 2026-09-03, DEC-INT-002 étant l'alias de W3. `scripts/plan-state/build.ts` découpait lui-même
 * `docs/DECISIONS.md` par ses titres de section et y ramassait les identifiants à deux préfixes :
 * la lecture que le lecteur unique a retirée du composeur et de `gov:tasks`. `plan-state:verifier` ne pouvait
 * pas le voir — il compare la vue à son générateur, pas le générateur à la source.
 *
 * LE REGISTRE FAIT FOI, LA VUE EST FAUTIVE (RM-01, REQ-GOV-024). Ces témoins exigent :
 *   — que le générateur importe le lecteur unique, et qu'aucun autre chemin de lecture ne subsiste
 *     dans le fichier — la garde NOMME la ligne d'un second lecteur réintroduit ;
 *   — la même tâche, rendue sous deux registres qui ne diffèrent QUE par la date d'arbitrage d'une
 *     décision : tranchée, la question disparaît ; ouverte, elle apparaît.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decouper } from '../../../scripts/plan-state/build';
import { LIVREE } from '../../../scripts/lot/avancement';
import { chargerRegistre } from '../../../scripts/lot/registre-decisions';

const PLAN = 'scripts/plan-state/build.ts';
const RUBRIQUE = 'Questions ouvertes pour Will';

/**
 * LES FORMES D'UN SECOND LECTEUR DU REGISTRE : l'ouverture du fichier lui-même, le découpage de ses
 * sections par leur titre numéroté, et l'expression régulière à deux préfixes que GOV-027 a
 * retirée. Jugées sur le CODE : un commentaire qui raconte le défaut n'est pas un lecteur.
 */
const SECOND_LECTEUR: readonly RegExp[] = [
  /readFileSync\([^)]*DECISIONS\.md/,
  /new RegExp\(`\^## /,
  /\/\^## ?\(\\d/,
  /\(HYP\|DEC\)-\[A-Z0-9-\]\+/,
];

/** Les lignes de CODE d'un source qui relisent le registre pour leur compte : numéro et texte. */
function secondsLecteurs(source: string): { ligne: number; texte: string }[] {
  const out: { ligne: number; texte: string }[] = [];
  let dansUnBloc = false;
  source.split('\n').forEach((brute, k) => {
    let l = brute;
    if (dansUnBloc) {
      const fin = l.indexOf('*/');
      if (fin < 0) return;
      l = l.slice(fin + 2);
      dansUnBloc = false;
    }
    l = l.replace(/\/\*.*?\*\//g, '');
    const debut = l.indexOf('/*');
    if (debut >= 0) {
      dansUnBloc = true;
      l = l.slice(0, debut);
    }
    if (/^\s*\/\//.test(l)) return;
    if (SECOND_LECTEUR.some((re) => re.test(l))) out.push({ ligne: k + 1, texte: brute.trim() });
  });
  return out;
}

const bac = mkdtempSync(join(tmpdir(), 'plan-state-lecteur-unique-'));

/**
 * UN REGISTRE D'ESSAI : les sources du générateur copiées, plus UNE tâche de la phase courante qui
 * cite `W6`. Le texte du registre des décisions est un paramètre : c'est la seule chose que les
 * deux faces du témoin font varier.
 */
function rendreSous(nom: string, decisions: string): string {
  const racine = join(bac, nom);
  mkdirSync(join(racine, 'docs'), { recursive: true });
  writeFileSync(join(racine, 'docs/DECISIONS.md'), decisions);
  for (const dossier of ['docs/adr', 'docs/journal']) {
    mkdirSync(join(racine, dossier), { recursive: true });
    for (const f of readdirSync(dossier))
      if (statSync(join(dossier, f)).isFile())
        copyFileSync(join(dossier, f), join(racine, dossier, f));
  }
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: Record<string, unknown>[];
  };
  const phaseCourante = Math.min(
    ...doc.taches.filter((t) => !LIVREE.has(t.statut as string)).map((t) => t.phase as number)
  );
  doc.taches.push({
    id: 'TEMOIN-HYP',
    titre: 'tâche d’essai — cite une décision de Will',
    phase: phaseCourante,
    repo: 'partners',
    statut: 'a_faire',
    deps: [],
    reqs: [],
    hyp: ['W6'],
    externe: null,
    estimateDays: 0.5,
  });
  writeFileSync(join(racine, 'docs/tasks.json'), JSON.stringify(doc, null, 2));
  const forge = join(racine, 'forge.json');
  writeFileSync(
    forge,
    JSON.stringify({
      prs: [],
      issues: '[]',
      main: { sha: 'abc1234', date: '2026-01-01T00:00:00+00:00' },
    })
  );
  const vue = join(racine, 'PLAN-STATE.md');
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(PLAN), '--out', vue, '--forge', forge],
    { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 }
  );
  expect(r.status, `le rendu a échoué : ${r.stdout}${r.stderr}`).toBe(0);
  return decouper(readFileSync(vue, 'utf8')).find((x) => x.titre === RUBRIQUE)?.corps ?? '';
}

describe('REQ-GOV-015 — la vue d’état lit le registre des décisions par le lecteur UNIQUE', () => {
  it('REQ-GOV-024 · le générateur importe le lecteur unique', () => {
    expect(readFileSync(PLAN, 'utf8')).toContain("from '../lot/registre-decisions'");
  });

  it('REQ-GOV-024 · aucun autre chemin de lecture du registre ne subsiste dans le générateur', () => {
    const fautifs = secondsLecteurs(readFileSync(PLAN, 'utf8'));
    expect(
      fautifs,
      `second(s) lecteur(s) du registre dans ${PLAN} : ${fautifs.map((f) => `ligne ${f.ligne} « ${f.texte} »`).join(' · ')}`
    ).toEqual([]);
  });

  it('REQ-GOV-024 · TÉMOIN — un second lecteur réintroduit est vu, et sa LIGNE est nommée', () => {
    // Sans lui, « aucun second lecteur » serait indiscernable de « la garde ne regarde rien ».
    const source = readFileSync(PLAN, 'utf8').split('\n');
    // Juste après le dernier import : du CODE, jamais le milieu d'un commentaire de bloc.
    const ou = Math.max(...source.map((l, i) => (l.startsWith('import ') ? i : -1))) + 1;
    expect(
      ou,
      'le générateur n’a plus d’import : le témoin ne sait plus où écrire'
    ).toBeGreaterThan(0);
    const avecDoublon = [
      ...source.slice(0, ou),
      "const brut = readFileSync('docs/DECISIONS.md', 'utf8');",
      ...source.slice(ou),
    ].join('\n');
    const fautifs = secondsLecteurs(avecDoublon);
    expect(fautifs.map((f) => f.ligne)).toContain(ou + 1);
    // Et chacune des formes d'avant GOV-060, écrite en CODE, est vue — en commentaire, non.
    for (const forme of [
      "const section = (n: number) => decisions.split(new RegExp(`^## ${n}\\\\.`, 'm'))[1];",
      'const ids = (t: string) => new Set(t.match(/\\b(HYP|DEC)-[A-Z0-9-]+\\b/g) || []);',
    ]) {
      expect(secondsLecteurs(forme), forme).toHaveLength(1);
      expect(secondsLecteurs(`// ${forme}`), `en commentaire : ${forme}`).toHaveLength(0);
    }
  });

  it('REQ-GOV-006 · REQ-GOV-015 · FACE 1 — une décision TRANCHÉE au registre n’est pas une question ouverte', () => {
    const decisions = readFileSync('docs/DECISIONS.md', 'utf8');
    // Le témoin porte sur un fait du registre réel, lu par le lecteur unique — jamais supposé.
    expect(
      chargerRegistre().decision('W6')?.trancheeLe,
      'W6 doit être tranchée au registre'
    ).not.toBeNull();
    const corps = rendreSous('registre-tranche', decisions);
    expect(corps, `la rubrique « ${RUBRIQUE} » n'est pas rendue`).not.toBe('');
    expect(
      corps,
      `W6, tranchée, est encore annoncée comme une question pour Will :\n${corps}`
    ).not.toMatch(/^- W6\b/m);
  });

  it('REQ-GOV-006 · REQ-GOV-015 · FACE 2 — la MÊME décision, rendue ouverte, apparaît — et bloquante', () => {
    const decisions = readFileSync('docs/DECISIONS.md', 'utf8');
    const marque = /^(\| \*\*W6\*\*) ✅ \*tranchée \d{4}-\d{2}-\d{2}\*/m;
    expect(
      marque.test(decisions),
      'la ligne de W6 a changé de forme : le témoin ne mord plus'
    ).toBe(true);
    const corps = rendreSous('registre-ouvert', decisions.replace(marque, '$1'));
    expect(corps, `W6, ouverte en §1, n'apparaît pas comme bloquante :\n${corps}`).toMatch(
      /^- W6 — \*\*bloquante \(§1 du registre\)\*\*$/m
    );
  });
});
