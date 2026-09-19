// @req REQ-DM-003
/**
 * `src/domain/attribution/etats.ts` — ce que le domaine FAIT de `ETATS_OCCUPANTS` : la clause
 * `IN (…)` de l'index unique partiel, générée depuis la constante, et le prédicat `occupe()`.
 *
 * L'égalité de la constante au texte de REQ-DM-003 est tenue ailleurs (`pnpm partners:schema:enums`,
 * famille `etats_occupants_divergents`). Ici, on juge les deux fonctions qui la PROJETTENT : une
 * clause qui perdrait un état, ou un prédicat qui en accepterait un huitième, laisseraient deux
 * attributions vivantes sur un même SIREN sans qu'aucune liste ne diverge.
 *
 * Les états NON occupants ne sont pas tapés ici (RM-06) : ils se DÉRIVENT de l'enum fermé de
 * REQ-DM-006, lu dans `docs/requirements.json`, moins la constante.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ETATS_OCCUPANTS,
  clauseEtatsOccupants,
  occupe,
} from '../../../src/domain/attribution/etats';

/** L'enum fermé des statuts d'attribution, tel que REQ-DM-006 l'écrit entre accolades. */
function statutsDAttribution(): string[] {
  const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  const texte = registre.exigences.find((e) => e.id === 'REQ-DM-006')?.texte ?? '';
  const enumere = /\{([^}]*)\}/.exec(texte)?.[1] ?? '';
  return enumere
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

describe('REQ-DM-003 — la clause de l’index et le prédicat se DÉRIVENT de `ETATS_OCCUPANTS`', () => {
  it('REQ-DM-003 — la clause `IN (…)` porte chaque état occupant, cité, une fois, dans l’ordre de la constante', () => {
    const clause = clauseEtatsOccupants();
    expect(clause.split(', ')).toEqual(ETATS_OCCUPANTS.map((e) => `'${e}'`));
  });

  it('REQ-DM-003 — `occupe()` est vrai pour chaque état occupant', () => {
    expect(ETATS_OCCUPANTS.filter((e) => !occupe(e))).toEqual([]);
  });

  it('REQ-DM-003 — `occupe()` est faux pour chaque statut de REQ-DM-006 hors de la constante, et pour une variante de casse', () => {
    const statuts = statutsDAttribution();
    const libres = statuts.filter((s) => !(ETATS_OCCUPANTS as readonly string[]).includes(s));
    // Planchers : une lecture qui ne trouve plus l'enum rendrait `[]`, et ce test serait vert.
    expect(statuts.length).toBeGreaterThan(ETATS_OCCUPANTS.length);
    expect(libres.length).toBeGreaterThan(0);
    expect(libres.filter((s) => occupe(s))).toEqual([]);
    expect(occupe(ETATS_OCCUPANTS[0].toUpperCase())).toBe(false);
    expect(occupe('')).toBe(false);
  });
});
