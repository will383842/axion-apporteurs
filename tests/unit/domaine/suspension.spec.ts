// @req REQ-SEC-018
// @req REQ-SEC-019
// @req REQ-JUR-031
/**
 * SEC-15 — la règle PURE de la suspension de vérification, confrontée au contrat v2, art. 3.7 al. 3
 * (le v2 fait foi, décision de Williams du 2026-10-07) : une FACULTÉ, fondée sur deux faits seulement
 * (l'indication de l'entreprise, ou une fabrication établie par une anomalie confirmée par un humain),
 * jamais sur un nombre, un rythme, une heure, un lieu, une zone, un secteur ou une méthode ; quinze
 * jours au plus à compter de la notification, puis levée de plein droit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ETATS_DE_GEL,
  MOTIFS_DE_SUSPENSION,
  ErreurDeSuspension,
  echeanceDeLevee,
  jugerLaLevee,
  jugerLaPose,
  leveeDePleinDroitDue,
} from '../../../src/domain/apporteur/suspension';

const RACINE = join(__dirname, '..', '..', '..');
const ANOMALIE = '0190f0c2-0000-7000-8000-000000000001';
/** 2026-10-07 09:30 à Paris (heure d'été, UTC+2). */
const POSEE = Date.UTC(2026, 9, 7, 7, 30);

const refus = (f: () => void): string => {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurDeSuspension) return e.code;
    throw e;
  }
  return 'aucun refus';
};

describe('REQ-SEC-019 — le gel : trois états, deux motifs', () => {
  it('REQ-SEC-019 : l’enum du gel a TROIS valeurs, et les deux motifs sont celles qui ne sont pas « libre »', () => {
    expect(ETATS_DE_GEL).toEqual(['libre', 'gele_non_confirmation', 'gele_fraude']);
    expect(MOTIFS_DE_SUSPENSION).toEqual(['gele_non_confirmation', 'gele_fraude']);
  });
});

describe('REQ-SEC-018 — la pose : une faculté, sur les seuls faits du v2', () => {
  it('REQ-SEC-018 : TÉMOIN — un apporteur signé et libre peut être suspendu sur l’indication de l’entreprise', () => {
    expect(() =>
      jugerLaPose({
        statut: 'signe',
        etatGel: 'libre',
        faits: { motif: 'gele_non_confirmation', indicationRecueAt: POSEE - 3_600_000 },
      })
    ).not.toThrow();
  });

  it('REQ-SEC-018 : TÉMOIN À DEUX FACES — la fabrication n’est un fait qu’établie par une anomalie CONFIRMÉE par un humain', () => {
    const base = { statut: 'signe' as const, etatGel: 'libre' as const };
    expect(() =>
      jugerLaPose({
        ...base,
        faits: { motif: 'gele_fraude', anomalie: { id: ANOMALIE, confirmeeParUnHumain: true } },
      })
    ).not.toThrow();
    expect(
      refus(() =>
        jugerLaPose({
          ...base,
          faits: {
            motif: 'gele_fraude',
            anomalie: { id: ANOMALIE, confirmeeParUnHumain: false as true },
          },
        })
      )
    ).toBe('anomalie_non_confirmee');
  });

  it('REQ-SEC-018 : TÉMOIN — une suspension déjà posée ne se pose pas une seconde fois, et rien ne se compte', () => {
    expect(
      refus(() =>
        jugerLaPose({
          statut: 'suspendu',
          etatGel: 'gele_non_confirmation',
          faits: { motif: 'gele_non_confirmation', indicationRecueAt: POSEE },
        })
      )
    ).toBe('deja_suspendu');
  });

  it('REQ-SEC-018 : TÉMOIN — seul un apporteur signé se suspend : ni un candidat, ni un résilié', () => {
    for (const statut of ['candidat', 'kyc_en_cours', 'resilie'] as const) {
      expect(
        refus(() =>
          jugerLaPose({
            statut,
            etatGel: 'libre',
            faits: { motif: 'gele_non_confirmation', indicationRecueAt: POSEE },
          })
        ),
        statut
      ).toBe('statut_non_suspendable');
    }
  });

  it('REQ-SEC-018 : une indication datée APRÈS la pose n’en est pas le fait', () => {
    expect(
      refus(() =>
        jugerLaPose(
          {
            statut: 'signe',
            etatGel: 'libre',
            faits: { motif: 'gele_non_confirmation', indicationRecueAt: POSEE + 1 },
          },
          POSEE
        )
      )
    ).toBe('indication_posterieure');
  });
});

describe('REQ-JUR-031 — aucun nombre, rythme, heure, lieu, zone, secteur ni méthode (v2, art. 3.7 al. 3)', () => {
  it('REQ-JUR-031 : TÉMOIN — le type des faits et la règle ne nomment aucun de ces fondements', () => {
    const source = readFileSync(join(RACINE, 'src/domain/apporteur/suspension.ts'), 'utf8');
    const debut = source.indexOf('export type FaitsDeSuspension');
    const fin = source.indexOf(';\n', debut);
    const type = source.slice(debut, fin);
    expect(debut).toBeGreaterThan(-1);
    expect(type).not.toMatch(
      /nombre|compte|rythme|rafale|heure|horaire|lieu|zone|secteur|methode|seuil|bareme|rang/i
    );
  });
});

describe('REQ-SEC-019 — quinze jours au plus, à compter de la notification, puis levée de plein droit', () => {
  it('REQ-SEC-019 : TÉMOIN — l’échéance est la même heure de Paris, quinze jours civils après la pose', () => {
    // 2026-10-22 09:30 à Paris (heure d'été).
    expect(echeanceDeLevee(POSEE)).toBe(Date.UTC(2026, 9, 22, 7, 30));
  });

  it('REQ-SEC-019 : à travers le changement d’heure, l’heure de Paris est gardée', () => {
    // Posée le 2026-10-20 09:30 (heure d'été) ; échue le 2026-11-04 09:30 (heure d'hiver, UTC+1).
    expect(echeanceDeLevee(Date.UTC(2026, 9, 20, 7, 30))).toBe(Date.UTC(2026, 10, 4, 8, 30));
  });

  it('REQ-SEC-019 : TÉMOIN À DEUX FACES — la levée de plein droit est due à l’échéance, pas une milliseconde avant', () => {
    const echeance = echeanceDeLevee(POSEE);
    expect(leveeDePleinDroitDue(POSEE, echeance - 1)).toBe(false);
    expect(leveeDePleinDroitDue(POSEE, echeance)).toBe(true);
  });

  it('REQ-SEC-019 : TÉMOIN — on ne lève qu’une suspension posée, et la levée rend l’apporteur libre', () => {
    expect(jugerLaLevee({ statut: 'suspendu', etatGel: 'gele_fraude' })).toEqual({
      statut: 'signe',
      etatGel: 'libre',
    });
    expect(refus(() => jugerLaLevee({ statut: 'signe', etatGel: 'libre' }))).toBe('non_suspendu');
  });
});
