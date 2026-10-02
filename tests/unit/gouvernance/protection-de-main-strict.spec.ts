// @req REQ-GOV-014
/**
 * QA-T55 (REQ-GOV-014) — la protection de `main` exige des branches À JOUR avant fusion.
 *
 * Sans `required_status_checks.strict`, une PR verte sur une base PÉRIMÉE fusionne : l'état fusionné
 * n'a jamais été testé, et le déploiement le publie. Le réglage est posé sur la forge (décision D6 de
 * Williams, 2026-10-01) ; `gov:depot-visibilite` le CONSTATE, elle ne le pose pas. Ce fichier juge la
 * famille `strict_absent` sur la vue conforme ET sur une vue cassée d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  controler,
  FAMILLES,
  VUE_CONFORME,
  type Protection,
  type Vue,
} from '../../../scripts/gates/gov-depot';

const protection = (): Protection => structuredClone(VUE_CONFORME.protection as Protection);
const avec = (p: Protection): Vue => ({ ...VUE_CONFORME, protection: p });
const strictAbsent = (v: Vue) => controler(v).filter((f) => f.famille === 'strict_absent');

describe('REQ-GOV-014 — la protection de main exige des branches à jour avant fusion', () => {
  it('REQ-GOV-014 : la vue conforme (strict posé) ne porte aucune faute strict_absent', () => {
    expect(controler(VUE_CONFORME)).toEqual([]);
  });

  it('REQ-GOV-014 : TÉMOIN — strict à false est refusé, en rouge, et nommé', () => {
    const p = protection();
    p.required_status_checks = { ...p.required_status_checks, strict: false };
    const f = strictAbsent(avec(p));
    expect(f).toHaveLength(1);
    expect(f[0]!.gravite).toBe('rouge');
    expect(f[0]!.message).toMatch(/à jour/i);
  });

  it('REQ-GOV-014 : TÉMOIN — strict absent, ou aucun check requis du tout, est refusé aussi', () => {
    const p = protection();
    const sansStrict = { ...p.required_status_checks };
    delete sansStrict.strict;
    expect(strictAbsent(avec({ ...p, required_status_checks: sansStrict }))).toHaveLength(1);
    expect(strictAbsent(avec({ ...p, required_status_checks: null }))).toHaveLength(1);
  });

  it('REQ-GOV-014 : une protection non lue reste INDÉTERMINÉE, jamais un strict_absent inventé', () => {
    expect(strictAbsent({ ...VUE_CONFORME, protection: null })).toEqual([]);
  });

  it('REQ-GOV-014 : la famille est déclarée, et --prove la fait rougir sur son témoin', () => {
    expect(FAMILLES).toContain('strict_absent');
    const r = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/gov-depot.ts', '--prove'],
      { encoding: 'utf8' }
    );
    expect([r.status, r.stdout]).toEqual([0, expect.stringContaining('• strict_absent')]);
  }, 60_000);
});
