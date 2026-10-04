// @req REQ-JUR-062
/**
 * JUR-T50 — art. 7.2 du contrat : la conservation des coordonnées du contact dans l'outil de gestion
 * de la relation client, sans échéance fixée à l'avance et sous le droit d'opposition. Témoin écrit
 * par A05 pour A07, qui n'a pas d'outil d'exécution (charte §6), sur le brief de la juriste.
 *
 * Il juge l'UNITÉ 7.2 du gabarit (`unitesDuGabarit`), sous sa forme comparable (`normaliser`), comme
 * les autres témoins du contrat : la phrase mot pour mot, aucune variable de durée, et aucune variable
 * `CRM_DUREE_PROSPECT_ANS` au registre des variables.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';
import { VARIABLES } from '../../../src/domain/contrat/variables';

const GABARIT = readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8');

/** L'unité 7.2 entière, alinéas joints, sous sa forme comparable. */
function article72(): string {
  const u = unitesDuGabarit(GABARIT).get('7.2');
  expect(u, 'unité 7.2 absente du gabarit').toBeDefined();
  return normaliser(u!.alineas.join(' '));
}

const PHRASE =
  "La Société conserve en outre ces données dans son outil de gestion de la relation client, à des fins de prospection et de gestion de sa relation commerciale avec l'entreprise, aussi longtemps qu'elle poursuit cette activité, sans échéance fixée à l'avance. La personne concernée peut à tout moment s'opposer à la prospection et demander l'effacement de ses données ; la Société les met à jour ou les efface dès qu'elle apprend qu'elles ne sont plus exactes, notamment lorsque la personne n'exerce plus la fonction pour laquelle elles ont été recueillies. L'Apporteur en informe la personne lorsqu'il recueille ses coordonnées.";

describe('REQ-JUR-062 — art. 7.2 : la conservation dans l’outil de relation client', () => {
  it('REQ-JUR-062 : l’art. 7.2 porte la phrase mot pour mot, de la conservation à l’information par l’Apporteur', () => {
    expect(article72()).toContain(normaliser(PHRASE));
  });

  it('REQ-JUR-062 : l’art. 7.2 ne porte aucune variable de durée — ni {{…ANS}} ni {{…MOIS}}', () => {
    const brut = unitesDuGabarit(GABARIT).get('7.2')!.alineas.join(' ');
    expect(brut).not.toMatch(/\{\{[^}]*(?:ANS|MOIS)\s*\}\}/);
  });

  it('REQ-JUR-062 : le registre des variables n’a pas de CRM_DUREE_PROSPECT_ANS', () => {
    expect(Object.hasOwn(VARIABLES, 'CRM_DUREE_PROSPECT_ANS')).toBe(false);
  });
});
