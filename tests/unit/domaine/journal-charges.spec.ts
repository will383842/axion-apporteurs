// @req REQ-DM-024
// @req REQ-DM-031
/**
 * `journal-charges.spec.ts` — les charges FERMÉES du journal (`src/domain/evenement/charges.ts`),
 * jugées valeur par valeur : la forme d'une empreinte, les constructeurs de formes, la charge de
 * chaque type, et la purge du contact d'une attribution, réservée au système.
 */
import { describe, it, expect } from 'vitest';
import {
  CHARGES_PAR_TYPE,
  FORMES,
  HASH_HEX_64,
  naissanceDApporteur,
} from '../../../src/domain/evenement/charges';
import { ALGORITHME } from '../../../src/domain/evenement/journal';

const HEX = 'a'.repeat(64);
const INSTANT = '2026-10-02T08:00:00.000Z';
const ID = '01928f6e-0000-7000-8000-000000000001';

describe('REQ-DM-024 — les formes admises dans une charge', () => {
  it('REQ-DM-024 : une empreinte est EXACTEMENT 64 hexadécimaux minuscules, ancrés aux deux bouts', () => {
    expect(HASH_HEX_64.test(HEX)).toBe(true);
    expect(HASH_HEX_64.test(`x${HEX}`)).toBe(false);
    expect(HASH_HEX_64.test(`${HEX}x`)).toBe(false);
    expect(HASH_HEX_64.test('A'.repeat(64))).toBe(false);
    expect(HASH_HEX_64.test('a'.repeat(63))).toBe(false);
  });

  it('REQ-DM-024 : chaque constructeur rend un schéma qui juge sa forme', () => {
    expect(FORMES.empreinte().safeParse(HEX).success).toBe(true);
    expect(FORMES.empreinte().safeParse(`${HEX}0`).success).toBe(false);
    expect(FORMES.montantCents().safeParse(1250).success).toBe(true);
    expect(FORMES.montantCents().safeParse(12.5).success).toBe(false);
    expect(FORMES.horodatage().safeParse(INSTANT).success).toBe(true);
    expect(FORMES.horodatage().safeParse('2 octobre').success).toBe(false);
    expect(FORMES.identifiant().safeParse(ID).success).toBe(true);
  });
});

describe('REQ-DM-024 — une charge par type, fermée', () => {
  it('REQ-DM-024 : les types du journal sont exactement ceux-ci', () => {
    expect(Object.keys(CHARGES_PAR_TYPE).sort()).toEqual([
      'apporteur_statut_modifie',
      'attribution_contact_purge',
      'attribution_etat_modifie',
      'attribution_peremption_suspendue',
      'attribution_porteur_reaffecte',
      'demande_confirmation_etat_modifie',
      'journal_ouvert',
      'piece_kyc_statut_modifie',
    ]);
  });

  it('REQ-DM-024 : la genèse porte l’algorithme, et lui seul', () => {
    const g = CHARGES_PAR_TYPE.journal_ouvert;
    expect(g.safeParse({ algorithme: ALGORITHME }).success).toBe(true);
    expect(g.safeParse({}).success).toBe(false);
    expect(g.safeParse({ algorithme: ALGORITHME, autre: 1 }).success).toBe(false);
  });

  it('REQ-DM-024 : la naissance d’un apporteur passe, et une charge sans acteur ne passe pas', () => {
    const s = CHARGES_PAR_TYPE.apporteur_statut_modifie;
    expect(s.safeParse(naissanceDApporteur({ par: 'systeme' })).success).toBe(true);
    expect(s.safeParse({ de: null, vers: 'candidat', transition: 'creer' }).success).toBe(false);
  });
});

describe('REQ-DM-031 — la purge du contact : l’instant, et le système pour seul acteur', () => {
  const purge = CHARGES_PAR_TYPE.attribution_contact_purge;

  it('REQ-DM-031 : la purge du cron passe', () => {
    expect(purge.safeParse({ purgeAt: INSTANT, acteur: { par: 'systeme' } }).success).toBe(true);
  });

  it('REQ-DM-031 : sans instant, ou avec un instant hors forme, elle est refusée', () => {
    expect(purge.safeParse({ acteur: { par: 'systeme' } }).success).toBe(false);
    expect(purge.safeParse({ purgeAt: 'hier', acteur: { par: 'systeme' } }).success).toBe(false);
  });

  it('REQ-DM-031 : un acteur autre que le système est refusé, motif acteur_systeme_attendu', () => {
    for (const par of ['apporteur', 'utilisateur_console'] as const) {
      const r = purge.safeParse({ purgeAt: INSTANT, acteur: { par, id: ID } });
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => i.message)).toEqual(['acteur_systeme_attendu']);
    }
  });

  it('REQ-DM-031 : la charge est fermée — aucune donnée du contact n’y entre', () => {
    expect(
      purge.safeParse({ purgeAt: INSTANT, acteur: { par: 'systeme' }, nomContact: 'Martin' })
        .success
    ).toBe(false);
  });
});
