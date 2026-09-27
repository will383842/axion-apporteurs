// @req REQ-GOV-032
/**
 * GOV-055 — comparer un générateur à lui-même ne voit jamais ce qu'il a CESSÉ de produire.
 *
 * LA MESURE QUI OUVRE LA TÂCHE : neutraliser la rubrique `titre('Bloquées')` dans le générateur,
 * rendre, vérifier — « 8 rubrique(s) comparée(s) octet par octet », EXIT 0. La couverture tombe EN
 * SILENCE : le vérificateur compare ce que le générateur PRODUIT à ce qui est sur le DISQUE, et un
 * élément que le générateur cesse de produire disparaît des deux côtés à la fois.
 *
 * LE REMÈDE EST UNE SOURCE EXTÉRIEURE : REQ-GOV-006 énumère les rubriques DUES de la vue, et le
 * vérificateur confronte le rendu à cette liste. Elle n'est écrite ni dans le script qui la vérifie
 * (il se comparerait encore à lui-même) ni ici : ces témoins la LISENT dans `docs/requirements.json`.
 *
 * LA PANNE EST FABRIQUÉE, jamais constatée (RM-02) : le générateur est recopié dans un bac à sable,
 * sa rubrique « Bloquées » neutralisée, et c'est CE générateur-là qui rend puis juge sa propre vue.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLAN = 'scripts/plan-state/build.ts';
const MARQUEUR = 'Ses rubriques dues';

const bac = mkdtempSync(join(tmpdir(), 'couverture-attendue-'));
const forge = join(bac, 'forge.json');
writeFileSync(
  forge,
  JSON.stringify({
    prs: [],
    issues: '[]',
    main: { sha: 'abc1234', date: '2026-01-01T00:00:00+00:00' },
  })
);

function lancer(script: string, cwd: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), script, ...args],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 }
  );
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Rend puis juge la vue avec le générateur donné, dans le répertoire donné. */
function rendreEtJuger(script: string, cwd: string, nom: string): { code: number; sortie: string } {
  const vue = join(bac, nom);
  const rendu = lancer(script, cwd, '--out', vue, '--forge', forge);
  expect(rendu.code, `le rendu a échoué : ${rendu.sortie}`).toBe(0);
  return lancer(script, cwd, '--verifier', '--out', vue, '--forge', forge);
}

/** Le texte de REQ-GOV-006, lu dans la source — jamais recopié. */
function texteDe(chemin: string): string {
  const doc = JSON.parse(readFileSync(chemin, 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  return doc.exigences.find((e) => e.id === 'REQ-GOV-006')?.texte ?? '';
}

/** Les rubriques que REQ-GOV-006 déclare dues, telles qu'un lecteur humain les lit. */
function duesDeclarees(texte: string): string[] {
  const i = texte.indexOf(MARQUEUR);
  if (i < 0) return [];
  const phrase = texte.slice(i).split(/\.(?:\s|$)/)[0] ?? '';
  return [...phrase.matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]!);
}

/** Un registre d'essai : les sources du générateur, copiées. `docs/requirements.json` peut y être modifié. */
function registreDEssai(nom: string): string {
  const racine = join(bac, nom);
  mkdirSync(join(racine, 'docs'), { recursive: true });
  for (const f of ['docs/tasks.json', 'docs/DECISIONS.md', 'docs/requirements.json'])
    copyFileSync(f, join(racine, f));
  for (const dossier of ['docs/adr', 'docs/journal']) {
    mkdirSync(join(racine, dossier), { recursive: true });
    for (const f of readdirSync(dossier))
      if (statSync(join(dossier, f)).isFile())
        copyFileSync(join(dossier, f), join(racine, dossier, f));
  }
  return racine;
}

/**
 * LE GÉNÉRATEUR MUTANT : une copie de `build.ts` dont la rubrique « Bloquées » n'est plus ouverte.
 * Ses lignes tombent dans la rubrique précédente, des DEUX côtés — c'est exactement la panne qu'une
 * comparaison du générateur à lui-même ne peut pas voir. Les imports relatifs sont réécrits vers
 * les modules du dépôt ; le chemin garde la forme `plan-state/build.ts`, que le script exige pour
 * se lancer.
 */
function generateurSansBloquees(): string {
  const source = readFileSync(PLAN, 'utf8');
  const neutralise = source.replace("titre('Bloquées');", 'void 0;');
  expect(neutralise, "le générateur n'ouvre plus « Bloquées » : la mutation ne mord plus").not.toBe(
    source
  );
  const reimporte = neutralise.replace(
    /from '\.\.\/([^']+)'/g,
    (_m, chemin: string) => `from '${pathToFileURL(resolve('scripts', chemin)).href}.ts'`
  );
  const dossier = join(bac, 'mutant', 'plan-state');
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, 'build.ts');
  writeFileSync(chemin, reimporte);
  return chemin;
}

describe('REQ-GOV-032 — la couverture de la vue se confronte à une source EXTÉRIEURE au générateur', () => {
  it('REQ-GOV-032 · (a) la liste des rubriques dues est déclarée dans REQ-GOV-006, pas dans le script', () => {
    const dues = duesDeclarees(texteDe('docs/requirements.json'));
    expect(
      dues.length,
      `REQ-GOV-006 ne déclare aucune rubrique due (« ${MARQUEUR} … ») : la couverture ne se mesure contre rien`
    ).toBeGreaterThan(0);
    expect(dues).toContain('Bloquées');
    expect(dues).toContain('REPRENDRE EN 30 SECONDES');
  });

  it('REQ-GOV-032 · (b) ROUGE — un générateur qui cesse de produire « Bloquées » sort 1 et NOMME la rubrique', () => {
    const { code, sortie } = rendreEtJuger(
      generateurSansBloquees(),
      process.cwd(),
      'PLAN-STATE-sans-bloquees.md'
    );
    expect(code, `la rubrique disparue des deux côtés est restée verte : ${sortie}`).toBe(1);
    expect(sortie).toContain('[rubrique_due_absente]');
    expect(sortie).toContain('« Bloquées »');
  });

  it('REQ-GOV-032 · la liste vient de la SOURCE : une rubrique déclarée due et jamais produite est nommée', () => {
    // Sans ce témoin, une liste recopiée dans le script passerait (b) aussi bien qu'une liste lue.
    const racine = registreDEssai('registre-fantome');
    const chemin = join(racine, 'docs/requirements.json');
    const doc = JSON.parse(readFileSync(chemin, 'utf8')) as {
      exigences: { id: string; texte: string }[];
    };
    const req = doc.exigences.find((e) => e.id === 'REQ-GOV-006')!;
    const i = req.texte.indexOf(MARQUEUR);
    const j = i < 0 ? -1 : req.texte.indexOf('«', i);
    req.texte =
      j < 0
        ? `${req.texte} ${MARQUEUR} : « Rubrique fantôme ».`
        : `${req.texte.slice(0, j)}« Rubrique fantôme », ${req.texte.slice(j)}`;
    writeFileSync(chemin, JSON.stringify(doc, null, 2));
    expect(duesDeclarees(texteDe(chemin))).toContain('Rubrique fantôme');
    const { code, sortie } = rendreEtJuger(resolve(PLAN), racine, 'PLAN-STATE-fantome.md');
    expect(code, `une rubrique due jamais produite est restée verte : ${sortie}`).toBe(1);
    expect(sortie).toContain('[rubrique_due_absente]');
    expect(sortie).toContain('« Rubrique fantôme »');
  });

  it('REQ-GOV-032 · (c) CONTRE-TÉMOIN — le rendu complet reste vert et annonce le compte ATTENDU à côté de l’observé', () => {
    const dues = duesDeclarees(texteDe('docs/requirements.json'));
    const { code, sortie } = rendreEtJuger(resolve(PLAN), process.cwd(), 'PLAN-STATE-complet.md');
    expect(code, `le rendu complet est jugé incomplet : ${sortie}`).toBe(0);
    const m = /(\d+)\/(\d+) rubrique\(s\) DUE\(S\) produite\(s\)/.exec(sortie);
    expect(m, `le vert n'annonce plus la couverture attendue : ${sortie}`).not.toBeNull();
    expect(Number(m![2]), 'le compte attendu est celui que la source déclare').toBe(dues.length);
    expect(Number(m![2])).toBeGreaterThan(0);
    expect(Number(m![1])).toBe(Number(m![2]));
    expect(sortie).toContain('REQ-GOV-006');
  });

  it('REQ-GOV-032 · (d) ROUGE — une source qui ne déclare AUCUNE rubrique due fait échouer le vérificateur, elle ne rend pas « 0/0 » vert', () => {
    // Sans ce témoin, retirer la phrase de REQ-GOV-006 (ou le fichier) éteignait la confrontation :
    // « 0/0 » et un avertissement, EXIT 0. Seul le témoin (a) rougissait — pas la porte.
    const sansMarqueur = registreDEssai('registre-muet');
    const chemin = join(sansMarqueur, 'docs/requirements.json');
    const doc = JSON.parse(readFileSync(chemin, 'utf8')) as {
      exigences: { id: string; texte: string }[];
    };
    const req = doc.exigences.find((e) => e.id === 'REQ-GOV-006')!;
    req.texte = req.texte.split(MARQUEUR).join('Ses rubriques');
    writeFileSync(chemin, JSON.stringify(doc, null, 2));
    expect(duesDeclarees(texteDe(chemin))).toEqual([]);
    const muet = rendreEtJuger(resolve(PLAN), sansMarqueur, 'PLAN-STATE-muet.md');
    expect(muet.code, `une source muette est restée verte : ${muet.sortie}`).toBe(1);
    expect(muet.sortie).toContain('[rubriques_dues_non_declarees]');

    const sansSource = registreDEssai('registre-sans-source');
    rmSync(join(sansSource, 'docs/requirements.json'));
    const absent = rendreEtJuger(resolve(PLAN), sansSource, 'PLAN-STATE-sans-source.md');
    expect(absent.code, `une source absente est restée verte : ${absent.sortie}`).toBe(1);
    expect(absent.sortie).toContain('[rubriques_dues_non_declarees]');
  });
});
