// @req REQ-QA-013
/**
 * L'analyseur des `if:` de workflow comprend les quatre fonctions de STATUT — QA-T54 (le job
 * `alerter` de `deploy.yml` tourne sur `failure() || cancelled()` de `deployer`).
 *
 * Ce que l'analyseur doit continuer de REFUSER (RM-02) : une autre fonction, une fonction de statut
 * avec un argument. Et ce qu'il doit PROUVER pour REQ-QA-013 : la condition d'`alerter` ne tourne
 * jamais sur une demande de fusion — ouverte ou déjà fusionnée —, quel que soit le statut de ses
 * prérequis.
 */
import { describe, expect, it } from 'vitest';
import {
  PR_FUSIONNEE,
  PR_OUVERTE,
  PUSH_MAIN,
  STATUT,
  evaluerExpression,
  type ContexteGh,
} from './condition-de-job';

const avecStatut = (ctx: ContexteGh, failure: boolean, cancelled: boolean): ContexteGh => ({
  ...ctx,
  [STATUT]: { failure, cancelled },
});

const ALERTER =
  "${{ github.event_name == 'push' && github.ref == 'refs/heads/main' && (failure() || cancelled()) }}";

describe('REQ-QA-013 — les fonctions de statut', () => {
  it('REQ-QA-013 : prérequis réussis (le défaut) — success() vrai, failure() et cancelled() faux, always() vrai', () => {
    expect(evaluerExpression('${{ success() }}', PUSH_MAIN)).toBe(true);
    expect(evaluerExpression('${{ failure() }}', PUSH_MAIN)).toBe(false);
    expect(evaluerExpression('${{ cancelled() }}', PUSH_MAIN)).toBe(false);
    expect(evaluerExpression('${{ always() }}', PUSH_MAIN)).toBe(true);
  });

  it('REQ-QA-013 : un prérequis en échec — failure() vrai, success() faux', () => {
    const ctx = avecStatut(PUSH_MAIN, true, false);
    expect(evaluerExpression('${{ failure() }}', ctx)).toBe(true);
    expect(evaluerExpression('${{ success() }}', ctx)).toBe(false);
  });

  it('REQ-QA-013 : un prérequis annulé — cancelled() vrai, success() faux', () => {
    const ctx = avecStatut(PUSH_MAIN, false, true);
    expect(evaluerExpression('${{ cancelled() }}', ctx)).toBe(true);
    expect(evaluerExpression('${{ success() }}', ctx)).toBe(false);
  });

  it.each([
    ['une autre fonction', '${{ contains(github.ref) }}'],
    ['une fonction de statut avec un argument', "${{ failure('x') }}"],
    ['une fonction inconnue sans argument', '${{ hashFiles() }}'],
  ])('REQ-QA-013 : RM-02 — %s LÈVE toujours', (_quoi, expression) => {
    expect(() => evaluerExpression(expression, PUSH_MAIN)).toThrow(/hors périmètre/);
  });

  it('REQ-QA-013 : le statut ne s’atteint par aucun chemin de contexte', () => {
    expect(() => evaluerExpression('${{ statut }}', avecStatut(PUSH_MAIN, true, false))).toThrow(
      /hors du périmètre/
    );
  });
});

describe('REQ-QA-013 — la condition d’`alerter` ne tourne jamais sur une demande de fusion', () => {
  const STATUTS: [string, boolean, boolean][] = [
    ['prérequis réussis', false, false],
    ['prérequis en échec', true, false],
    ['prérequis annulé', false, true],
  ];

  it.each(STATUTS)('REQ-QA-013 : PR déjà fusionnée, %s — faux', (_s, failure, cancelled) => {
    for (const action of ['edited', 'labeled', 'closed'])
      expect(evaluerExpression(ALERTER, avecStatut(PR_FUSIONNEE(action), failure, cancelled))).toBe(
        false
      );
  });

  it.each(STATUTS)('REQ-QA-013 : PR ouverte, %s — faux', (_s, failure, cancelled) => {
    expect(evaluerExpression(ALERTER, avecStatut(PR_OUVERTE('opened'), failure, cancelled))).toBe(
      false
    );
  });

  it('REQ-QA-013 : push sur main — vrai seulement si deployer échoue ou est annulé', () => {
    expect(evaluerExpression(ALERTER, PUSH_MAIN)).toBe(false);
    expect(evaluerExpression(ALERTER, avecStatut(PUSH_MAIN, true, false))).toBe(true);
    expect(evaluerExpression(ALERTER, avecStatut(PUSH_MAIN, false, true))).toBe(true);
  });
});
