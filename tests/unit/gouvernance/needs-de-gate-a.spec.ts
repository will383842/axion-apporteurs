// @req REQ-GOV-014
/**
 * needs-de-gate-a.spec.ts — GOV-151 : `gov:depot-visibilite` lit les `needs:` du check requis.
 * Depuis la PR #579, `gate-a` est le seul check requis et son étape exige `success` de chaque
 * job de ses `needs:` : ces jobs sont couverts. Un job HORS de ses `needs:`, et non requis, reste
 * un rouge `check_requis_absent`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  checksCouvertsParLesRequis,
  checksProduits,
  controler,
  VUE_CONFORME,
} from '../../../scripts/gates/gov-depot';

const familles = (v: typeof VUE_CONFORME): string[] => controler(v).map((f) => f.famille);

describe('REQ-GOV-014 — GOV-151 : un job cité par les needs de gate-a est couvert', () => {
  it('REQ-GOV-014 — needs en ligne et en bloc, nom de check pris au `name:` du job', () => {
    const yml = [
      'jobs:',
      '  a:',
      '    name: Job A',
      '  b:',
      '    runs-on: x',
      '  gate-a:',
      '    needs:',
      '      - a',
      '      - b',
      '  autre:',
      '    needs: [a]',
      '',
    ].join('\n');
    expect([...checksCouvertsParLesRequis(yml, ['gate-a'])].sort()).toEqual(['Job A', 'b']);
    expect([...checksCouvertsParLesRequis(yml, [])]).toEqual([]);
  });

  it('REQ-GOV-014 — la vue conforme (un job dans les needs de gate-a) est verte', () => {
    expect(familles(VUE_CONFORME)).toEqual([]);
  });

  it('REQ-GOV-014 — un job HORS des needs de gate-a, non requis, rougit `check_requis_absent`', () => {
    const v = { ...VUE_CONFORME, ci: VUE_CONFORME.ci + '  hors:\n    runs-on: ubuntu-latest\n' };
    expect(familles(v)).toContain('check_requis_absent');
  });

  it('REQ-GOV-014 — sur le ci.yml du dépôt, chaque job produit est requis ou couvert par gate-a', () => {
    const yml = readFileSync('.github/workflows/ci.yml', 'utf8');
    const couverts = checksCouvertsParLesRequis(yml, ['gate-a']);
    expect(checksProduits(yml).filter((c) => c !== 'gate-a' && !couverts.has(c))).toEqual([]);
  });
});
