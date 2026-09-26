// @req REQ-DM-035
// @req REQ-QA-035
/**
 * `apporteur-score-fige.spec.ts` — DM-06 : le score de candidature est calculé UNE fois, par le
 * producteur, et transporté FIGÉ. Partners ne le recalcule jamais.
 *
 * PARITÉ sur la fixture du producteur réel (`tests/fixtures/axionia/candidature-recue.json`) : le
 * total, les parts et la version du barème sortent du snapshot égaux, à la valeur près, à ce que
 * le producteur a émis.
 *
 * TÉMOIN : une charge dont les parts NE font PAS le total garde le total émis. Un code qui
 * recalculerait — même « pour vérifier » — le trahirait ici.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { snapshotDeCandidature } from '../../../src/domain/apporteur/snapshot-candidature';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/axionia/candidature-recue.json', 'utf8')
) as { evenement: { payload: Record<string, unknown> } };
const PAYLOAD = FIXTURE.evenement.payload;

describe('REQ-QA-035 — parité du score sur la fixture du producteur réel', () => {
  it('REQ-QA-035 : total, parts et version du barème sont ceux du producteur, à l’identique', () => {
    const { snapshot } = snapshotDeCandidature(PAYLOAD);
    expect(snapshot.scoreInitial).toBe(PAYLOAD.scoreInitial);
    expect(snapshot.scorePartsJson).toStrictEqual(PAYLOAD.scorePartsJson);
    expect(snapshot.scoreBaremeVersion).toBe(PAYLOAD.scoreBaremeVersion);
    expect(JSON.stringify(snapshot.scorePartsJson)).toBe(JSON.stringify(PAYLOAD.scorePartsJson));
  });

  it('REQ-DM-035 : TÉMOIN — des parts qui ne font pas le total laissent le total ÉMIS intact', () => {
    const parts = { ...(PAYLOAD.scorePartsJson as Record<string, number>), carnet: 0 };
    const { snapshot } = snapshotDeCandidature({ ...PAYLOAD, scorePartsJson: parts });
    expect(snapshot.scoreInitial).toBe(PAYLOAD.scoreInitial);
    expect(Object.values(parts).reduce((s, v) => s + v, 0)).not.toBe(PAYLOAD.scoreInitial);
  });

  it('REQ-DM-035 : un score non entier est refusé, jamais arrondi', () => {
    expect(() => snapshotDeCandidature({ ...PAYLOAD, scoreInitial: 71.5 })).toThrow(/scoreInitial/);
  });

  it('REQ-QA-035 : aucun module suivi sous src/ ne porte de barème de score (SCORE_POIDS)', () => {
    const suivis = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f));
    expect(suivis.filter((f) => /SCORE_POIDS|calculerScore/.test(readFileSync(f, 'utf8')))).toEqual(
      []
    );
  });
});
