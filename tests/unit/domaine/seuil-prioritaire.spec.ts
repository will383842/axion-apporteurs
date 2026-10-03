// @req REQ-CPL-026
// @req REQ-DM-010
// @req REQ-JUR-032
/**
 * CPL-T13, corrigée par SEC-56 — la capacité réelle de qualification et le seuil de vérification
 * prioritaire : `src/domain/temps/capacite.ts` et `src/domain/attribution/seuil-prioritaire.ts`.
 *
 * SEC-56 (décision de Williams du 2026-10-03, REQ-DM-010, REQ-JUR-032) : le palier quitte le code.
 * L'ordre des appels de la Société ne dépend que de sa CAPACITÉ restante et d'une SURCHARGE
 * manuelle ; il ne compte rien par apporteur. `palierConfiance` n'existe plus : une entrée qui le
 * porte encore est refusée, nommée. Une surcharge > 0 remplace la capacité, sans plafond.
 * La capacité (REQ-CPL-026) : « jours ouvrés × qualifieurs disponibles, calendrier d'absence ».
 * Les jours ouvrés viennent du calendrier des fériés du module `temps`, jugé par son propre spec
 * (`temps-horloge-et-feries.spec.ts`) : ici, on juge ce que la capacité et le seuil en FONT.
 */
import { describe, it, expect } from 'vitest';
import {
  ErreurSeuilPrioritaire,
  seuilPrioritaire,
} from '../../../src/domain/attribution/seuil-prioritaire';
import { capaciteSurPeriode } from '../../../src/domain/temps/capacite';
import { ErreurTemps } from '../../../src/domain/temps/erreurs';
import { estJourOuvre } from '../../../src/domain/temps/feries';
import type { DateCivile } from '../../../src/domain/temps/calendrier-civil';

// Consommateurs du seuil : DM-09 (dépôt) et UX-P1-07 (file de qualification).

const d = (annee: number, mois: number, jour: number): DateCivile => ({ annee, mois, jour });

function levee<E extends Error>(classe: new (...a: never[]) => E, f: () => unknown): E {
  try {
    f();
  } catch (e) {
    if (e instanceof classe) return e;
    throw e;
  }
  throw new Error('aucune levée');
}

describe('REQ-DM-010 — le seuil de vérification prioritaire ne dépend que de la capacité et de la surcharge', () => {
  it('REQ-DM-010 — sans surcharge (absente ou nulle), le seuil est la capacité restante, quelle qu’elle soit', () => {
    expect(seuilPrioritaire({ capaciteRestante: 3, surchargeManuelle: null })).toBe(3);
    expect(seuilPrioritaire({ capaciteRestante: 9, surchargeManuelle: null })).toBe(9);
    expect(seuilPrioritaire({ capaciteRestante: 3, surchargeManuelle: 0 })).toBe(3);
    expect(seuilPrioritaire({ capaciteRestante: 0, surchargeManuelle: 0 })).toBe(0);
  });

  it('REQ-DM-010 — une surcharge manuelle > 0 remplace la capacité, au-dessus comme au-dessous : jamais un plafond', () => {
    expect(seuilPrioritaire({ capaciteRestante: 3, surchargeManuelle: 1 })).toBe(1);
    expect(seuilPrioritaire({ capaciteRestante: 3, surchargeManuelle: 12 })).toBe(12);
    expect(seuilPrioritaire({ capaciteRestante: 0, surchargeManuelle: 7 })).toBe(7);
  });

  it('REQ-JUR-032 — aucun palier par apporteur : une entrée qui porte encore `palierConfiance` est refusée, nommée', () => {
    const avecPalier = { palierConfiance: 2, capaciteRestante: 9, surchargeManuelle: null };
    const e = levee(ErreurSeuilPrioritaire, () =>
      seuilPrioritaire(avecPalier as unknown as Parameters<typeof seuilPrioritaire>[0])
    );
    expect(e.champ).toBe('palierConfiance');
    expect(e.message).toContain('palierConfiance');
    // Les seuls champs de l'entrée : la capacité et la surcharge — rien par apporteur.
    const entree: Required<Parameters<typeof seuilPrioritaire>[0]> = {
      capaciteRestante: 1,
      surchargeManuelle: null,
    };
    expect(Object.keys(entree).sort()).toEqual(['capaciteRestante', 'surchargeManuelle']);
  });

  it('REQ-DM-010 — une valeur négative ou non entière est refusée par une levée qui nomme le champ', () => {
    const cas: [Parameters<typeof seuilPrioritaire>[0], string][] = [
      [{ capaciteRestante: 3, surchargeManuelle: -1 }, 'surchargeManuelle'],
      [{ capaciteRestante: 3, surchargeManuelle: 2.5 }, 'surchargeManuelle'],
      [{ capaciteRestante: -2, surchargeManuelle: null }, 'capaciteRestante'],
      [{ capaciteRestante: 1.5, surchargeManuelle: null }, 'capaciteRestante'],
      [{ capaciteRestante: Number.NaN, surchargeManuelle: 4 }, 'capaciteRestante'],
    ];
    for (const [entree, champ] of cas) {
      const e = levee(ErreurSeuilPrioritaire, () => seuilPrioritaire(entree));
      expect(e.champ, JSON.stringify(entree)).toBe(champ);
      expect(e.message).toContain(champ);
    }
  });
});

describe('REQ-CPL-026 — la capacité réelle : jours ouvrés × qualifieurs disponibles, calendrier d’absence', () => {
  it('REQ-CPL-026 — mai 2026 : chaque jour ouvré compte les qualifieurs non absents, multipliés par la capacité par qualifieur et par jour', () => {
    // Mai 2026 compte 18 jours ouvrés (jugé dans `temps-horloge-et-feries.spec.ts`). L'absence du
    // lundi 11 au dimanche 17 couvre 4 jours ouvrés (l'Ascension, jeudi 14, n'en est pas un).
    const ouvresDeLAbsence = [11, 12, 13, 14, 15, 16, 17].filter((j) =>
      estJourOuvre(d(2026, 5, j))
    );
    expect(ouvresDeLAbsence).toEqual([11, 12, 13, 15]);
    const capacite = capaciteSurPeriode({
      du: d(2026, 5, 1),
      au: d(2026, 5, 31),
      capaciteParQualifieurEtParJour: 5,
      qualifieurs: [
        { absences: [] },
        { absences: [{ du: d(2026, 5, 11), au: d(2026, 5, 17) }] },
        // Une absence entièrement hors jours ouvrés ne retire rien.
        { absences: [{ du: d(2026, 5, 2), au: d(2026, 5, 3) }] },
      ],
    });
    expect(capacite).toBe((18 * 3 - 4) * 5);
  });

  it('REQ-CPL-026 — une période d’un jour, sans qualifieur, ou d’un jour chômé, vaut ce qu’elle doit', () => {
    const un = (du: DateCivile, au: DateCivile, n: number) =>
      capaciteSurPeriode({
        du,
        au,
        capaciteParQualifieurEtParJour: 4,
        qualifieurs: Array.from({ length: n }, () => ({ absences: [] })),
      });
    expect(un(d(2026, 9, 18), d(2026, 9, 18), 2)).toBe(8);
    expect(un(d(2026, 9, 19), d(2026, 9, 20), 2)).toBe(0);
    expect(un(d(2026, 5, 1), d(2026, 5, 1), 2)).toBe(0);
    expect(un(d(2026, 9, 1), d(2026, 9, 30), 0)).toBe(0);
    // Deux absences d'un même qualifieur qui se chevauchent ne le retirent qu'une fois.
    expect(
      capaciteSurPeriode({
        du: d(2026, 9, 14),
        au: d(2026, 9, 18),
        capaciteParQualifieurEtParJour: 1,
        qualifieurs: [
          {
            absences: [
              { du: d(2026, 9, 14), au: d(2026, 9, 16) },
              { du: d(2026, 9, 15), au: d(2026, 9, 15) },
            ],
          },
        ],
      })
    ).toBe(2);
  });

  it('REQ-CPL-026 — capacité négative ou non entière, période ou absence inversée : levées nommées', () => {
    const base = { du: d(2026, 9, 1), au: d(2026, 9, 30), qualifieurs: [{ absences: [] }] };
    for (const c of [-1, 0.5, Number.NaN]) {
      expect(
        levee(ErreurTemps, () => capaciteSurPeriode({ ...base, capaciteParQualifieurEtParJour: c }))
          .motif
      ).toBe('capacite_invalide');
    }
    expect(
      levee(ErreurTemps, () =>
        capaciteSurPeriode({
          ...base,
          du: d(2026, 9, 2),
          au: d(2026, 9, 1),
          capaciteParQualifieurEtParJour: 1,
        })
      ).motif
    ).toBe('intervalle_inverse');
    expect(
      levee(ErreurTemps, () =>
        capaciteSurPeriode({
          ...base,
          capaciteParQualifieurEtParJour: 1,
          qualifieurs: [{ absences: [{ du: d(2026, 9, 5), au: d(2026, 9, 4) }] }],
        })
      ).motif
    ).toBe('intervalle_inverse');
    expect(
      levee(ErreurTemps, () =>
        capaciteSurPeriode({ ...base, au: d(2026, 9, 31), capaciteParQualifieurEtParJour: 1 })
      ).motif
    ).toBe('date_invalide');
  });

  it('REQ-CPL-026 — le seuil se dérive de la capacité RESTANTE : capacité de la période moins ce qui est déjà engagé', () => {
    const capacite = capaciteSurPeriode({
      du: d(2026, 9, 21),
      au: d(2026, 9, 22),
      capaciteParQualifieurEtParJour: 3,
      qualifieurs: [{ absences: [] }],
    });
    expect(capacite).toBe(6);
    const engages = 4;
    expect(
      seuilPrioritaire({
        capaciteRestante: capacite - engages,
        surchargeManuelle: null,
      })
    ).toBe(2);
  });
});
