// @req REQ-INT-012
// @no-red-first: la fiche est déjà sur main ; le rouge est montré sur une copie privée d'un terme (2e it)
/**
 * Le témoin de la fiche du tiers axion-ia (`docs/tiers/axionia.md`) : ce qu'elle doit dire, et que
 * l'acceptance nomme — la relecture par `after_sequence`, le rejeu `rejouerEvenement`, et QUI les
 * déclenche. Ces trois faits vivent au §1 de la fiche ; la qualification de la sous-traitance, au §7
 * (« même responsable de traitement », correction de l'exactitude sur la PR 657).
 *
 * Le jugement est PUR (`fautesDeLaFiche`) : il porte sur le texte reçu, pour se juger aussi sur une
 * copie cassée d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const FICHE = 'docs/tiers/axionia.md';

/** Le texte d'une rubrique `## <n>.`, jusqu'à la rubrique suivante ; vide si elle manque. */
function rubrique(fiche: string, numero: number): string {
  const lignes = fiche.split(/\r?\n/);
  const i = lignes.findIndex((l) => l.startsWith(`## ${numero}.`));
  if (i < 0) return '';
  const suite = lignes.slice(i + 1);
  const j = suite.findIndex((l) => l.startsWith('## '));
  return (j < 0 ? suite : suite.slice(0, j)).join('\n');
}

/** Ce qui manque à la fiche, nommé ; vide si elle dit tout. */
function fautesDeLaFiche(fiche: string): string[] {
  const fautes: string[] = [];
  const un = rubrique(fiche, 1);
  if (!un.includes('after_sequence')) fautes.push('§1 : la relecture par after_sequence');
  if (!un.includes('rejouerEvenement')) fautes.push('§1 : le rejeu rejouerEvenement');
  if (!/Qui les déclenche/.test(un) || !un.includes('reconciliation_axionia'))
    fautes.push('§1 : qui les déclenche (la tâche reconciliation_axionia)');
  const sept = rubrique(fiche, 7);
  if (!/Sous-traitance[^\n]*même responsable de traitement/.test(sept))
    fautes.push('§7 : la sous-traitance sans objet, même responsable de traitement');
  return fautes;
}

const REELLE = readFileSync(FICHE, 'utf8');

describe('REQ-INT-012 — la fiche du tiers axion-ia dit la relecture, le rejeu, et qui les déclenche', () => {
  it('REQ-INT-012 : la fiche réelle dit les trois faits au §1, et la sous-traitance au §7', () => {
    expect(fautesDeLaFiche(REELLE)).toEqual([]);
  });

  it('REQ-INT-012 : TÉMOINS — chaque fait retiré d’un geste rougit, nommé', () => {
    const retire = (avant: string, apres: string) =>
      fautesDeLaFiche(REELLE.split(avant).join(apres));
    expect(retire('after_sequence', 'après')).toContain('§1 : la relecture par after_sequence');
    expect(retire('rejouerEvenement', 'rejouer')).toContain('§1 : le rejeu rejouerEvenement');
    expect(retire('reconciliation_axionia', 'la tâche')).toContain(
      '§1 : qui les déclenche (la tâche reconciliation_axionia)'
    );
    expect(retire('même responsable de traitement', 'sous-traitant')).toContain(
      '§7 : la sous-traitance sans objet, même responsable de traitement'
    );
    expect(fautesDeLaFiche('# vide\n')).toHaveLength(4);
  });
});
