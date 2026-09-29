// @req REQ-GOV-026
/**
 * UNE TÂCHE AXIONIA SE CLÔT SUR SA BRANCHE — GOV-125 (REQ-GOV-026, partners/ADR-0027).
 *
 * Mesuré le 2026-09-29 : `lot:cloture` refusait deux tâches d'axion-ia livrées (axion-ia #1181 et #1180,
 * branches `feat/partners-…`), famille `branche_hors_motif`, parce que le
 * motif de `branch` ne connaissait que les deux formes de Partners (`t/`, `lot/`). Le motif dépend
 * désormais du dépôt de la tâche : une règle de `$defs.tache.allOf`, lue par la clôture ET par
 * `gov:tasks` (ajv), jamais recopiée.
 *
 * TÉMOIN À DEUX FACES : une tâche axionia livrée par `feat/partners-x` est écrivable ; une tâche de
 * Partners livrée par `feat/x` reste refusée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { motifDeBranche } from '../../../scripts/lot/cloture';

const SCHEMA = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;

/** Le registre minimal d'UNE tâche, validé par le schéma réel, comme `gov:tasks` le fait. */
function valide(repo: string, branch: string | null): boolean {
  const ajv = new (
    Ajv2020 as unknown as new (o: object) => { validate: (s: object, d: unknown) => boolean }
  )({ allErrors: true, strict: false });
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: Record<string, unknown>[];
  };
  const modele = doc.taches.find((t) => t['statut'] === 'fusionnee' && t['repo'] === 'partners')!;
  return ajv.validate(SCHEMA, { ...doc, taches: [{ ...modele, repo, branch }] });
}

describe('REQ-GOV-026 — le motif de branche dépend du dépôt de la tâche (GOV-125)', () => {
  it('REQ-GOV-026 — TÉMOIN : une tâche axionia livrée par une branche d’axion-ia est écrivable', () => {
    const motif = motifDeBranche('axionia');
    for (const b of [
      'feat/partners-dm-03-a-grille',
      'feat/partners-int-t02-outbox',
      'partners/int-t04-devis-signe',
      'jur/t03-copie-apporteur',
      'fix/x',
    ]) {
      expect(motif.test(b), b).toBe(true);
      expect(valide('axionia', b), b).toBe(true);
    }
  });

  it('REQ-GOV-026 — CONTRE-TÉMOIN : une tâche de Partners livrée par feat/x reste refusée', () => {
    const motif = motifDeBranche('partners');
    expect(motif.test('feat/x')).toBe(false);
    expect(valide('partners', 'feat/x')).toBe(false);
    expect(motif.test('t/gov-125')).toBe(true);
    expect(motif.test('lot/L0-12-suffixe')).toBe(true);
    expect(valide('partners', 't/gov-125')).toBe(true);
  });

  it('REQ-GOV-026 — un dépôt absent ou inconnu garde le motif fermé de Partners', () => {
    expect(motifDeBranche(undefined).test('feat/x')).toBe(false);
    expect(motifDeBranche(null).test('feat/x')).toBe(false);
    expect(motifDeBranche('externe').test('feat/x')).toBe(false);
  });

  it('REQ-GOV-026 — une branche d’axion-ia reste une FORME : ni majuscule en tête, ni nom nu, ni espace', () => {
    const motif = motifDeBranche('axionia');
    for (const b of ['Feat/x', 'main', 'feat/', 'feat/ x', '/x', 'feat/-x']) {
      expect(motif.test(b), b).toBe(false);
    }
  });
});
