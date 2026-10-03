// @req REQ-JUR-065
/**
 * DM-59 (REQ-JUR-065) — les délais d'une demande de droit du contact (RGPD art. 12.3), dans le
 * domaine : la fin du premier mois, l'échéance de la valeur (un mois, ou trois après une
 * prolongation), et la borne de la prolongation, refusée par une erreur NOMMÉE.
 */
import { describe, it, expect } from 'vitest';
import {
  ProlongationHorsDelai,
  echeanceDeLaValeur,
  finDuPremierMois,
  jugerProlongation,
} from '../../../src/domain/droits-contact/delais';
import { SEUILS } from '../../../src/domain/seuils/ssot';

/** 2026-06-15, midi à Paris (heure d'été). */
const RECUE = Date.UTC(2026, 5, 15, 10);

describe('REQ-JUR-065 — les délais de la SSOT', () => {
  it('REQ-JUR-065 : TEST HYP — un mois de réponse, deux de prolongation, en mois civils', () => {
    expect(SEUILS.DROITS_CONTACT_DELAI_REPONSE_MOIS).toMatchObject({ valeur: 1, unite: 'mois' });
    expect(SEUILS.DROITS_CONTACT_PROLONGATION_MOIS).toMatchObject({ valeur: 2, unite: 'mois' });
  });
});

describe('REQ-JUR-065 — l’échéance se dérive, elle ne se stocke pas', () => {
  it('REQ-JUR-065 : la fin du premier mois tombe le même jour du mois suivant, à Paris', () => {
    expect(finDuPremierMois(RECUE)).toBe(Date.UTC(2026, 6, 15, 10));
  });

  it('REQ-JUR-065 : TÉMOIN — sans prolongation, la valeur échoit à un mois', () => {
    expect(echeanceDeLaValeur(RECUE, null)).toBe(Date.UTC(2026, 6, 15, 10));
  });

  it('REQ-JUR-065 : TÉMOIN — avec prolongation, elle échoit à trois mois', () => {
    expect(echeanceDeLaValeur(RECUE, Date.UTC(2026, 5, 20))).toBe(Date.UTC(2026, 8, 15, 10));
  });
});

describe('REQ-JUR-065 — la prolongation se pose dans le premier mois', () => {
  it('REQ-JUR-065 : une milliseconde avant la fin du premier mois, la prolongation passe', () => {
    expect(() => jugerProlongation(RECUE, Date.UTC(2026, 6, 15, 10) - 1)).not.toThrow();
  });

  it.each([
    ['à la fin exacte du premier mois', Date.UTC(2026, 6, 15, 10)],
    ['au-delà', Date.UTC(2026, 7, 1)],
  ])(
    'REQ-JUR-065 : TÉMOIN — %s, la prolongation est refusée par une erreur nommée',
    (_q, quand) => {
      let erreur: unknown;
      try {
        jugerProlongation(RECUE, quand);
      } catch (e) {
        erreur = e;
      }
      expect(erreur).toBeInstanceOf(ProlongationHorsDelai);
      const e = erreur as ProlongationHorsDelai;
      expect(e.name).toBe('ProlongationHorsDelai');
      expect(e.code).toBe('prolongation_hors_delai');
      expect(e.message).toBe(
        'prolongation_hors_delai : une prolongation se pose dans le premier mois (RGPD art. 12.3)'
      );
    }
  );
});
