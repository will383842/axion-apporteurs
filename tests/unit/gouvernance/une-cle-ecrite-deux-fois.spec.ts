// @req REQ-GOV-001
// @req REQ-GOV-032
/**
 * UNE CLÉ ÉCRITE DEUX FOIS DANS LE REGISTRE DES EXIGENCES (GOV-072).
 *
 * LE DÉFAUT. L'analyse d'un document JSON garde la DERNIÈRE occurrence d'une clé répétée, et
 * aucune garde ne lisait le TEXTE du registre : une exigence pouvait être remplacée en silence
 * par une seconde écriture de la même clé, toutes les gardes restant vertes — elles jugeaient
 * l'objet obtenu, jamais le document lu. Et un registre illisible sortait sur une trace brute.
 *
 * CE QUE CE FICHIER TIENT, À DEUX FACES (RM-02). Un registre de bac d'essai où une clé
 * d'exigence est écrite deux fois fait sortir `gov:requirements` en code non nul, en NOMMANT la
 * clé et ses deux positions ; un registre illisible sort par un refus NOMMÉ ; le registre du
 * dépôt sort en zéro, avec le compte des clés réellement confrontées — compte recalculé ici par
 * une autre voie, jamais tapé.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { lireLeRegistre } from '../../../scripts/gates/gov-requirements';

const GARDE = resolve('scripts/gates/gov-requirements.ts');
const ENTREES = [
  'docs/requirements.json',
  'docs/tasks.json',
  'scripts/lot/requirements.schema.json',
  'docs/REQUIREMENTS-ANNEXE-FUSIONS.md',
] as const;

const BACS: string[] = [];
afterAll(() => {
  for (const b of BACS) rmSync(b, { recursive: true, force: true });
});

function bac(registre: string): string {
  const d = mkdtempSync(join(tmpdir(), 'cle-double-'));
  BACS.push(d);
  for (const f of ENTREES) {
    mkdirSync(join(d, dirname(f)), { recursive: true });
    copyFileSync(f, join(d, f));
  }
  writeFileSync(join(d, 'docs/requirements.json'), registre, 'utf8');
  return d;
}

function lancer(cwd: string): { code: number; sortie: string } {
  try {
    const out = execFileSync('npx', ['tsx', GARDE], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
    return { code: 0, sortie: out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Les clés d'objet d'un document, comptées sur l'objet ANALYSÉ — une autre voie que le texte. */
function clesDe(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((a: number, x) => a + clesDe(x), 0);
  if (v !== null && typeof v === 'object') {
    return Object.entries(v).reduce((a, [, x]) => a + 1 + clesDe(x), 0);
  }
  return 0;
}

describe('REQ-GOV-001 — la lecture du TEXTE refuse une clé écrite deux fois, à toute profondeur', () => {
  it('REQ-GOV-001 — TÉMOIN : la clé répétée est NOMMÉE avec ses deux positions', () => {
    const texte = '{\n  "a": {\n    "b": [\n      { "c": 1,\n        "c": 2 }\n    ]\n  }\n}\n';
    const r = lireLeRegistre(texte);
    expect(r.illisible).toBeNull();
    expect(r.doublons).toEqual([{ cle: 'c', chemin: 'a.b[0]', premiere: '4:9', seconde: '5:9' }]);
  });

  it('REQ-GOV-001 — CONTRE-TÉMOIN : la même clé dans deux objets frères, ou dans une chaîne, ne compte pas', () => {
    const texte = '[{ "id": "x", "t": "{\\"id\\": 1}" }, { "id": "y" }]';
    const r = lireLeRegistre(texte);
    expect(r.illisible).toBeNull();
    expect(r.doublons).toEqual([]);
    expect(r.cles).toBe(3);
  });

  it('REQ-GOV-001 — un texte illisible rend un refus NOMMÉ avec sa position, jamais une exception', () => {
    const r = lireLeRegistre('{\n  "a": 1,\n  "b": \n}');
    expect(r.illisible).toMatch(/ligne 4, colonne 1/);
    expect(r.doublons).toEqual([]);
  });
});

describe('REQ-GOV-032 — TÉMOIN À DEUX FACES : le binaire refuse le bac, accepte le dépôt', () => {
  const REGISTRE = readFileSync('docs/requirements.json', 'utf8');

  it('REQ-GOV-032 — ROUGE : une clé d’exigence écrite deux fois fait sortir en non nul, clé et positions nommées', () => {
    // La seconde écriture de `statut` est posée juste après la première, dans la PREMIÈRE exigence.
    const i = REGISTRE.indexOf('"statut":');
    const finDeLigne = REGISTRE.indexOf('\n', i);
    const ligne = REGISTRE.slice(REGISTRE.lastIndexOf('\n', i) + 1, finDeLigne + 1);
    const fautif = REGISTRE.slice(0, finDeLigne + 1) + ligne + REGISTRE.slice(finDeLigne + 1);
    const l1 = REGISTRE.slice(0, i).split('\n').length;
    const col = i - REGISTRE.lastIndexOf('\n', i);
    const r = lancer(bac(fautif));
    expect(r.code, r.sortie).not.toBe(0);
    expect(r.sortie).toContain('cle_ecrite_deux_fois');
    expect(r.sortie).toContain(`« statut »`);
    expect(r.sortie).toContain(`${l1}:${col}`);
    expect(r.sortie).toContain(`${l1 + 1}:${col}`);
  }, 120_000);

  it('REQ-GOV-032 — ROUGE : un registre illisible sort par un refus NOMMÉ, sans trace brute', () => {
    const r = lancer(bac(REGISTRE.replace('"exigences"', '"exigences" "')));
    expect(r.code, r.sortie).not.toBe(0);
    expect(r.sortie).toContain('registre_illisible');
    expect(r.sortie).not.toMatch(/SyntaxError|\n\s+at /);
  }, 120_000);

  it('REQ-GOV-032 — VERT : le registre du dépôt sort en zéro, avec le compte des clés confrontées', () => {
    const r = lancer(process.cwd());
    expect(r.code, r.sortie).toBe(0);
    const attendu = clesDe(JSON.parse(REGISTRE));
    expect(attendu).toBeGreaterThan(0);
    expect(r.sortie).toContain(`${attendu} clé(s) d’objet confrontée(s) dans le TEXTE`);
  }, 120_000);
});
