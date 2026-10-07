// @req REQ-GOV-027
/**
 * gel-de-la-phase-1.spec.ts — GOV-150 : le gel de la phase 1 (décision de Williams du 2026-10-05,
 * #319, 5988252245, point 1). Une tâche de phase 1 absente de `config/gel-phase-1.json` est NEUVE :
 * elle ne reste en phase 1 que si elle touche l'argent, la sécurité ou une obligation légale
 * (`sensible` non vide, zone juridique ou sécurité). Deux faces, et la liste réelle du dépôt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { horsDuGel, lireGel } from '../../../scripts/gates/gov-tasks';

type T = Parameters<typeof horsDuGel>[0][number];
const tache = (id: string, champs: Record<string, unknown> = {}): T =>
  ({ id, phase: 1, zone: 'espace', sensible: [], statut: 'a_faire', ...champs }) as unknown as T;
const GELEES = new Set(['UX-P1-01']);

describe('REQ-GOV-027 — GOV-150 : la phase 1 est gelée', () => {
  it('REQ-GOV-027 — une tâche NEUVE de phase 1 sans argent, sécurité ni légal rougit `gel_phase_1`', () => {
    const f = horsDuGel([tache('UX-P1-99')], GELEES);
    expect(f.map((x) => x.famille)).toEqual(['gel_phase_1']);
    expect(f[0]!.message).toContain('5988252245');
  });

  it('REQ-GOV-027 — une tâche neuve qui porte un `sensible`, ou de la zone juridique ou sécurité, reste en phase 1', () => {
    expect(horsDuGel([tache('DM-99', { sensible: ['argent'] })], GELEES)).toEqual([]);
    expect(horsDuGel([tache('JUR-T99', { zone: 'juridique' })], GELEES)).toEqual([]);
    expect(horsDuGel([tache('SEC-99', { zone: 'securite' })], GELEES)).toEqual([]);
  });

  it('REQ-GOV-027 — une tâche gelée, une tâche de phase 2 ou une tâche livrée ne sont pas jugées', () => {
    expect(horsDuGel([tache('UX-P1-01')], GELEES)).toEqual([]);
    expect(horsDuGel([tache('UX-P2-99', { phase: 2 })], GELEES)).toEqual([]);
    expect(horsDuGel([tache('UX-P1-98', { statut: 'fusionnee' })], GELEES)).toEqual([]);
  });

  it('REQ-GOV-027 — la liste du gel est lue au dépôt, et chaque tâche de phase 1 du registre y figure ou est hors du gel', () => {
    const gelees = lireGel('config/gel-phase-1.json');
    expect(gelees.size).toBeGreaterThan(0);
    const taches = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: T[] }).taches;
    expect(horsDuGel(taches, gelees)).toEqual([]);
  });
});
