// @req REQ-CPL-009
/**
 * JUR-T35 — AUCUN DÉPÔT RÉEL TANT QUE L'AIPD N'EST PAS SIGNÉE (REQ-CPL-009).
 *
 * REQ-CPL-009 exige l'analyse d'impact SIGNÉE avant le premier dépôt réel ; JUR-T04 l'a livrée et
 * écrit la condition, sans la garder. Arbitrage de la coordination à la revendication (option 1) :
 * la signature a DEUX sources qui doivent concorder — le texte de `docs/rgpd/aipd.md`, qu'une demande
 * de fusion peut modifier, et la variable `AIPD_SIGNEE_LE` de l'environnement GitHub `production`,
 * que seul Williams pose. La garde est jouée par une étape du job `deployer`, avant le déploiement,
 * à partir de la date de mise en service.
 *
 * TÉMOIN À DEUX FACES : AIPD non signée, la mise en service est refusée en nommant la condition ;
 * AIPD signée avec date et signataire, et la variable qui dit la même date, elle est admise. Faces
 * rouges exigées par l'arbitrage : variable absente, deux dates différentes, texte « signée » sans
 * variable. Le message d'échec nomme le GESTE à faire, et n'imprime jamais une valeur.
 *
 * RM-11 : le texte, la variable, le jour et la date de mise en service sont posés explicitement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { juger, signatureDe } from '../../../scripts/gates/aipd-signee';

const NON_SIGNEE = readFileSync('docs/rgpd/aipd.md', 'utf8');
/** Le même document, signé dans la forme que sa section « Signature » prescrit. */
const signee = (date: string, par = 'Will') =>
  NON_SIGNEE.replace(/^État : non signée$/m, `État : signée le ${date} par ${par}`);

const MISE_EN_SERVICE = '2026-12-31';
const AVANT = '2026-12-30';
const APRES = '2026-12-31';

describe('REQ-CPL-009 — la signature se lit dans la section « Signature » de l’AIPD', () => {
  it('REQ-CPL-009 : le document du dépôt est non signé aujourd’hui', () => {
    expect(NON_SIGNEE).toMatch(/^État : non signée$/m);
    expect(signatureDe(NON_SIGNEE)).toBeNull();
  });

  it('REQ-CPL-009 : « signée le AAAA-MM-JJ par <signataire> » se lit, date et signataire', () => {
    expect(signatureDe(signee('2026-12-01'))).toEqual({ date: '2026-12-01', signataire: 'Will' });
  });

  it.each([
    ['sans signataire', 'État : signée le 2026-12-01'],
    ['date illisible', 'État : signée le 1er décembre par Will'],
    ['hors de la ligne État', 'Note : signée le 2026-12-01 par Will'],
  ])('REQ-CPL-009 : une signature %s ne se lit pas', (_nom, ligne) => {
    expect(signatureDe(NON_SIGNEE.replace(/^État : non signée$/m, ligne))).toBeNull();
  });
});

describe('REQ-CPL-009 — TÉMOIN À DEUX FACES : la mise en service des dépôts réels', () => {
  it('REQ-CPL-009 : AIPD non signée, à la mise en service — REFUSÉE, la condition nommée', () => {
    const v = juger({
      texte: NON_SIGNEE,
      variable: undefined,
      jour: APRES,
      miseEnService: MISE_EN_SERVICE,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.famille).toBe('aipd_non_signee');
      expect(v.message).toMatch(/REQ-CPL-009/);
    }
  });

  it('REQ-CPL-009 : AIPD signée, date et signataire, et la variable qui dit la même date — ADMISE', () => {
    expect(
      juger({
        texte: signee('2026-12-01'),
        variable: '2026-12-01',
        jour: APRES,
        miseEnService: MISE_EN_SERVICE,
      })
    ).toEqual({ ok: true });
  });

  it.each([
    ['variable absente, texte signé', signee('2026-12-01'), undefined, 'variable_absente'],
    ['variable vide, texte signé', signee('2026-12-01'), '', 'variable_absente'],
    ['deux dates différentes', signee('2026-12-01'), '2026-12-02', 'dates_discordantes'],
    ['variable posée, texte non signé', NON_SIGNEE, '2026-12-01', 'aipd_non_signee'],
    ['variable illisible', signee('2026-12-01'), '01/12/2026', 'variable_illisible'],
  ])('REQ-CPL-009 : %s — REFUSÉE en « %s »', (_nom, texte, variable, famille) => {
    const v = juger({ texte, variable, jour: APRES, miseEnService: MISE_EN_SERVICE });
    expect(v).toMatchObject({ ok: false, famille });
  });

  it('REQ-CPL-009 : avant la mise en service, la garde n’est pas active — les déploiements de préparation passent', () => {
    expect(
      juger({ texte: NON_SIGNEE, variable: undefined, jour: AVANT, miseEnService: MISE_EN_SERVICE })
    ).toEqual({ ok: true });
  });

  it('REQ-CPL-009 : sans date de mise en service, la garde est active — échec fermé', () => {
    expect(
      juger({ texte: NON_SIGNEE, variable: undefined, jour: AVANT, miseEnService: null })
    ).toMatchObject({ ok: false, famille: 'aipd_non_signee' });
  });
});

describe('REQ-CPL-009 — le message d’échec nomme le geste, jamais une valeur', () => {
  it.each([
    [signee('2026-12-01'), '2026-12-02'],
    [signee('2026-12-01'), '01/12/2026'],
    [signee('2026-12-01'), undefined],
    [NON_SIGNEE, '2026-12-01'],
  ])('REQ-CPL-009 : refus sans écho des dates', (texte, variable) => {
    const v = juger({ texte, variable, jour: APRES, miseEnService: MISE_EN_SERVICE });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.message).toMatch(/AIPD_SIGNEE_LE|docs\/rgpd\/aipd\.md/);
      expect(v.message).not.toMatch(/2026-12-0[12]|01\/12\/2026/);
    }
  });
});
