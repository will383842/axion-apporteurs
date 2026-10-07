// @req REQ-QA-005
/**
 * QA-T29 — le juge du test de charge léger : cinquante dépôts simultanés sur un même SIREN.
 *
 * Le juge est PUR : il lit des mesures (les lignes, les refus tracés, les demandes, la durée) et rend la
 * liste de ce qui est faux. Le banc en base réelle (`tests/integration/charge-depots-meme-siren.spec.ts`)
 * le nourrit ; ce témoin prouve qu'il rougit sur chaque écart, et qu'il ne rougit pas sur la mesure juste.
 */
import { describe, it, expect } from 'vitest';
import {
  DEPOTS_SIMULTANES,
  DUREE_MAX_MS,
  jugerLaCharge,
  type MesureDeCharge,
} from '../../../scripts/gates/QA-T29/juge-charge';

/** Les places de la file de la fixture : explicites, passées au juge (RM-11). */
const PLACES_DE_LA_FILE = 2;
const T = (i: number) => new Date(Date.UTC(2026, 9, 7, 12, 0, 0, i));

/** La mesure JUSTE : un occupant, la file pleine derrière lui, le reste refusé et tracé. */
function juste(): MesureDeCharge {
  return {
    depots: DEPOTS_SIMULTANES,
    places: PLACES_DE_LA_FILE,
    issues: {
      enregistree: 1,
      en_attente: PLACES_DE_LA_FILE,
      file_complete: DEPOTS_SIMULTANES - 1 - PLACES_DE_LA_FILE,
    },
    echecs: 0,
    lignes: [
      { statut: 'provisoire', rangAttente: null, deposeeAt: T(0) },
      { statut: 'en_attente', rangAttente: 1, deposeeAt: T(1) },
      { statut: 'en_attente', rangAttente: 2, deposeeAt: T(2) },
    ],
    refusFileComplete: DEPOTS_SIMULTANES - 1 - PLACES_DE_LA_FILE,
    demandesDeConfirmation: 1,
    dureeMs: 4_000,
  };
}

describe('REQ-QA-005 — QA-T29 : le juge de la charge', () => {
  it('la mesure juste ne rougit pas', () => {
    expect(jugerLaCharge(juste())).toEqual([]);
  });

  it('cinquante dépôts : le nombre est celui de la tâche', () => {
    expect(DEPOTS_SIMULTANES).toBe(50);
  });

  it('deux occupants sur un SIREN rougissent (l’index partiel n’a pas tenu)', () => {
    const m = juste();
    m.lignes = [{ statut: 'active', rangAttente: null, deposeeAt: T(9) }, ...m.lignes];
    expect(jugerLaCharge(m).join(' ')).toMatch(/occupant/);
  });

  it('aucun occupant rougit', () => {
    const m = juste();
    m.lignes = m.lignes.filter((l) => l.statut !== 'provisoire');
    expect(jugerLaCharge(m).join(' ')).toMatch(/occupant/);
  });

  it('une file qui dépasse ses places, ou des rangs qui se répètent, rougissent', () => {
    const trop = juste();
    trop.lignes = [...trop.lignes, { statut: 'en_attente', rangAttente: 3, deposeeAt: T(3) }];
    expect(jugerLaCharge(trop).join(' ')).toMatch(/file/);
    const doublon = juste();
    doublon.lignes[2] = { statut: 'en_attente', rangAttente: 1, deposeeAt: T(2) };
    expect(jugerLaCharge(doublon).join(' ')).toMatch(/rang/);
  });

  it('un horodatage qui ne croît pas strictement dans l’ordre des rangs rougit', () => {
    const m = juste();
    m.lignes[2] = { statut: 'en_attente', rangAttente: 2, deposeeAt: T(1) };
    expect(jugerLaCharge(m).join(' ')).toMatch(/deposee_at/);
  });

  it('un refus non tracé, ou une demande de confirmation de trop, rougissent', () => {
    const sansTrace = juste();
    sansTrace.refusFileComplete -= 1;
    expect(jugerLaCharge(sansTrace).join(' ')).toMatch(/refus/);
    const deux = juste();
    deux.demandesDeConfirmation = 2;
    expect(jugerLaCharge(deux).join(' ')).toMatch(/demande/);
  });

  it('un dépôt en erreur (verrou, blocage mutuel) rougit, même si le reste est juste', () => {
    const m = juste();
    m.echecs = 1;
    expect(jugerLaCharge(m).join(' ')).toMatch(/échec/);
  });

  it('une issue hors des trois attendues, ou un compte d’issues faux, rougissent', () => {
    const m = juste();
    m.issues = {
      ...m.issues,
      file_complete: (m.issues.file_complete ?? 0) - 1,
      anteriorite_client: 1,
    };
    expect(jugerLaCharge(m).join(' ')).toMatch(/issue/);
  });

  it('une durée au-delà du plafond rougit : « léger » est mesuré, pas affirmé', () => {
    const m = juste();
    m.dureeMs = DUREE_MAX_MS + 1;
    expect(jugerLaCharge(m).join(' ')).toMatch(/durée/);
    m.dureeMs = DUREE_MAX_MS;
    expect(jugerLaCharge(m)).toEqual([]);
  });
});
