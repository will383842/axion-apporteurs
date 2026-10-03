// @req REQ-DM-033
// @req REQ-DM-034
// @req REQ-DM-043
/**
 * DM-12 — les règles pures des anomalies, des rattachements manuels et des contestations. La base
 * tient les mêmes règles par ses CHECK et ses déclencheurs ; ici, le domaine les nomme avant tout
 * appel.
 */
import { describe, it, expect } from 'vitest';
import {
  AnomalieMalFormee,
  JustificationTropCourte,
  LienPosterieurAuDepot,
  ReferenceDeSourceMalFormee,
  TransitionAnomalieInterdite,
  JUSTIFICATION_CARACTERES_UTILES_MIN,
  caracteresUtiles,
  dateDeLaPiece,
  echeanceDeReponse,
  jugerAnomalie,
  jugerJustification,
  jugerLienAnterieur,
  jugerReferenceDeSource,
  jugerTransitionAnomalie,
} from '../../../src/domain/anomalie/regles';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { localDepuisInstant } from '../../../src/domain/temps/paris';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';

const refus = (f: () => unknown): Error => {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error('aucun refus');
};

describe('REQ-DM-033 — une anomalie : le score n’existe que pour la sincérité', () => {
  it('REQ-DM-033 : TÉMOIN — sincérité avec score : admise ; sincérité sans score : refusée, nommée', () => {
    expect(() => jugerAnomalie({ type: 'sincerite', score: 42 })).not.toThrow();
    const e = refus(() => jugerAnomalie({ type: 'sincerite', score: null }));
    expect(e).toBeInstanceOf(AnomalieMalFormee);
    expect(e.message).toBe('anomalie_mal_formee : score requis pour sincerite');
  });

  it.each(['auto_parrainage'] as const)(
    'REQ-DM-033 : TÉMOIN — %s sans score : admise ; avec score : refusée',
    (type) => {
      expect(() => jugerAnomalie({ type, score: null })).not.toThrow();
      expect(refus(() => jugerAnomalie({ type, score: 3 })).message).toBe(
        `anomalie_mal_formee : aucun score pour ${type}`
      );
    }
  );

  it('REQ-DM-033 : un score non entier est refusé ; l’échelle est tenue par la base', () => {
    expect(refus(() => jugerAnomalie({ type: 'sincerite', score: 4.5 })).message).toBe(
      'anomalie_mal_formee : score entier'
    );
    expect(() => jugerAnomalie({ type: 'sincerite', score: 0 })).not.toThrow();
  });
});

describe('REQ-DM-033 — une anomalie ne quitte « ouverte » qu’une fois, sans retour', () => {
  it.each([
    ['ouverte', 'levee'],
    ['ouverte', 'confirmee'],
  ] as const)('REQ-DM-033 : %s → %s est admise', (de, vers) => {
    expect(() => jugerTransitionAnomalie(de, vers)).not.toThrow();
  });

  it.each([
    ['ouverte', 'ouverte'],
    ['levee', 'ouverte'],
    ['levee', 'confirmee'],
    ['confirmee', 'levee'],
    ['confirmee', 'ouverte'],
  ] as const)('REQ-DM-033 : TÉMOIN — %s → %s est refusée, nommée', (de, vers) => {
    const e = refus(() => jugerTransitionAnomalie(de, vers));
    expect(e).toBeInstanceOf(TransitionAnomalieInterdite);
    expect(e.message).toBe(`transition_anomalie_interdite : ${de} → ${vers}`);
  });
});

describe('REQ-DM-034 — le rattachement manuel : une justification, un lien antérieur au dépôt', () => {
  it('REQ-DM-034 : les caractères utiles ne comptent ni les espaces ni les retours', () => {
    expect(caracteresUtiles('  a b\tc\nd  ')).toBe(4);
    expect(JUSTIFICATION_CARACTERES_UTILES_MIN).toBe(20);
  });

  it('REQ-DM-034 : TÉMOIN — 19 caractères utiles : refusée ; 20 : admise, même entourés d’espaces', () => {
    const e = refus(() => jugerJustification(`  ${'x'.repeat(19)}   `));
    expect(e).toBeInstanceOf(JustificationTropCourte);
    expect(e.message).toBe('justification_trop_courte : 19 caractères utiles sur 20');
    expect(() => jugerJustification(` ${'x'.repeat(10)} ${'y'.repeat(10)} `)).not.toThrow();
  });

  it('REQ-DM-034 : TÉMOIN — un lien de contrôle établi APRÈS le dépôt est refusé ; à la même milliseconde, admis', () => {
    const depot = new Date('2026-10-01T10:00:00.000Z');
    expect(() => jugerLienAnterieur(depot, depot)).not.toThrow();
    expect(() => jugerLienAnterieur(new Date(depot.getTime() - 1), depot)).not.toThrow();
    const e = refus(() => jugerLienAnterieur(new Date(depot.getTime() + 1), depot));
    expect(e).toBeInstanceOf(LienPosterieurAuDepot);
    expect(e.message).toBe('lien_posterieur_au_depot');
  });
});

describe('REQ-DM-043 — l’échéance de réponse d’une contestation : dérivée, jamais stockée', () => {
  it('REQ-DM-043 : l’échéance tombe REPONSE_CONTESTATION_JOURS jours civils plus tard, à la même heure de Paris', () => {
    const recue = Date.parse('2026-03-20T09:30:00.000Z');
    const e = echeanceDeReponse(recue);
    const jours = SEUILS.REPONSE_CONTESTATION_JOURS.valeur;
    expect(localDepuisInstant(e) - localDepuisInstant(recue)).toBe(jours * MS_PAR_JOUR);
  });

  it('REQ-DM-043 : TÉMOIN — à travers le passage à l’heure d’été, l’heure de Paris est gardée (une heure de moins en temps universel)', () => {
    const recue = Date.parse('2026-03-20T09:30:00.000Z');
    const e = echeanceDeReponse(recue);
    expect(e - recue).toBe(
      SEUILS.REPONSE_CONTESTATION_JOURS.valeur * MS_PAR_JOUR - MS_PAR_JOUR / 24
    );
  });
});

describe('REQ-DM-034 — la pièce qui établit le lien : un jour, et une référence courte', () => {
  it('REQ-DM-034 : TÉMOIN — la date de la pièce est le DÉBUT de son jour à Paris, en été comme en hiver', () => {
    expect(new Date(dateDeLaPiece({ annee: 2026, mois: 10, jour: 1 })).toISOString()).toBe(
      '2026-09-30T22:00:00.000Z'
    );
    expect(new Date(dateDeLaPiece({ annee: 2026, mois: 12, jour: 1 })).toISOString()).toBe(
      '2026-11-30T23:00:00.000Z'
    );
  });

  it.each(['KBIS-2019-04-01', 'bodacc/2021/A/123', 'comptes.2024', '7'])(
    'REQ-DM-034 : la référence « %s » est admise',
    (ref) => {
      expect(() => jugerReferenceDeSource(ref)).not.toThrow();
    }
  );

  it.each(['Dupont', 'kbis du 2019', 'x'.repeat(64) + '1', 'kbis_é2019', ''])(
    'REQ-DM-034 : TÉMOIN — la référence « %s » est refusée (pas de chiffre, espace, trop longue, accent, vide)',
    (ref) => {
      const e = refus(() => jugerReferenceDeSource(ref));
      expect(e).toBeInstanceOf(ReferenceDeSourceMalFormee);
      expect(e.message).toBe('reference_de_source_mal_formee');
    }
  );
});
