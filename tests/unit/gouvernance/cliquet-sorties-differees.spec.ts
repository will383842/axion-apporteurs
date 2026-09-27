// @req REQ-GOV-012
/**
 * LE CLIQUET VOIT AUSSI LA SORTIE DIFFÉRÉE (GOV-054).
 *
 * LE DÉFAUT MESURÉ. Le cliquet des refus comptait les seuls appels de sortie immédiate. Deux refus
 * écrits en affectation du code de sortie — la forme qui laisse le processus finir d'imprimer —
 * sont entrés dans `scripts/plan-state/build.ts` sans passer devant lui : le compte n'a pas bougé.
 *
 * LES DEUX FORMES SONT LÉGITIMES et ne s'unifient pas : l'une sort tout de suite, l'autre laisse
 * finir. Le défaut était que le cliquet n'en voyait qu'une. Ce fichier fabrique la panne (RM-02) :
 * une affectation non nulle, non déclarée, fait rougir la confrontation en NOMMANT le fichier et
 * l'écart ; l'affectation nulle, contre-témoin, ne compte pas.
 */
import { describe, it, expect } from 'vitest';
import {
  ajoutsNonDeclares,
  compterSorties,
  sortiesNommees,
} from '../../../scripts/gates/registre-des-refus';

// Les formes sont CONSTRUITES : écrites en toutes lettres, elles seraient comptées là où ce
// fichier serait un jour lu par le motif.
const DIFFEREE = (valeur: string) => `${['process', 'exitCode'].join('.')} = ${valeur};`;
const IMMEDIATE = (valeur: string) => `${['process', 'exit'].join('.')}(${valeur});`;

describe('REQ-GOV-012 — le cliquet compte la sortie DIFFÉRÉE comme la sortie immédiate', () => {
  it('REQ-GOV-012 — TÉMOIN ROUGE : une affectation non nulle non déclarée rougit en nommant fichier et écart', () => {
    const base = 'export const a = 1;\n';
    const disque = `${base}if (a) {\n  ${DIFFEREE('1')}\n}\n`;
    expect(compterSorties(disque), 'la sortie différée n’est pas comptée').toBe(1);
    const ajoutes = new Map([['scripts/temoin.ts', compterSorties(disque) - compterSorties(base)]]);
    expect(ajoutsNonDeclares(ajoutes, {})).toEqual([
      'scripts/temoin.ts ajoute 1 sortie(s) non nulle(s) et n’est PAS déclaré',
    ]);
    // Et déclaré au mauvais compte, l'écart est chiffré.
    expect(ajoutsNonDeclares(ajoutes, { 'scripts/temoin.ts': { total: 2 } })).toEqual([
      'scripts/temoin.ts : 1 sortie(s) ajoutée(s), 2 déclarée(s)',
    ]);
  });

  it('REQ-GOV-012 — la sortie différée est NOMMÉE par son affectation, distincte de la sortie immédiate', () => {
    const texte = `function juger(): void {\n  ${DIFFEREE('code')}\n  ${IMMEDIATE('code')}\n}\n`;
    expect(sortiesNommees('scripts/temoin.ts', texte).map((s) => s.nom)).toEqual([
      'juger › ∅ › (= code)',
      'juger › ∅ › (code)',
    ]);
  });

  it('REQ-GOV-012 — CONTRE-TÉMOIN VERT : l’affectation nulle, et la comparaison, ne comptent pas', () => {
    expect(compterSorties(DIFFEREE('0'))).toBe(0);
    expect(compterSorties(`if (${['process', 'exitCode'].join('.')} === 1) {}`)).toBe(0);
    expect(compterSorties(IMMEDIATE('0'))).toBe(0);
    // Le cliquet n'invente rien sur un fichier qui n'ajoute rien.
    expect(ajoutsNonDeclares(new Map(), {})).toEqual([]);
  });
});
