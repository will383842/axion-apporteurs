// @req REQ-EXT-020
/**
 * EXT-T07 — la prolongation de l'attribution, en règles PURES (`src/domain/attribution/prolongation.ts`) :
 * contrat v2, art. 3.4 al. 3 ; forme d'A02 (#809 6039970008) ; juriste (#809 6039901134) ; arbitrage de
 * la coordination (#809 6039931639).
 *
 * Aucune durée n'est écrite ici : le terme prolongé, l'ouverture de la liste et la durée du contrat sont
 * lus dans la SSOT, et la durée de l'al. 3 est jugée en lettres par la fonction de la garde des seuils.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONDITIONS_DECIDEES,
  CONDITIONS_PROLONGATION,
  ETATS_A_TERME,
  estUneConditionDecidee,
  issueAuTerme,
  ouvertureDeLaDecision,
  refusDeLaDecision,
  termeProlonge,
  type FaitsDeProlongation,
} from '../../../src/domain/attribution/prolongation';
import { ETATS_ATTRIBUTION, ajouterMoisParis } from '../../../src/domain/attribution/machine';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import { normaliser, unitesDuGabarit } from '../../../src/domain/contrat/gabarit';
import { enLettres } from '../../../scripts/gates/seuils-ssot';

/** Un terme fixe : le 2 novembre 2026, midi à Paris. */
const TERME = Date.parse('2026-11-02T11:00:00.000Z');
const AVANCE = SEUILS.PROLONGATION_DECISION_AVANCE_JOURS.valeur * MS_PAR_JOUR;

const faits = (o: Partial<FaitsDeProlongation> = {}): FaitsDeProlongation => ({
  statut: 'active',
  fenetreFinAt: TERME,
  prolongeeAt: null,
  prolongationRefuseeAt: null,
  ...o,
});

describe('REQ-EXT-020 — les conditions, fermées', () => {
  it('REQ-EXT-020 : TÉMOIN — trois conditions décidées, les noms de la juriste, et la réputée en quatrième', () => {
    expect(CONDITIONS_DECIDEES).toEqual([
      'devis_en_cours',
      'echange_recent',
      'financement_en_instruction',
    ]);
    expect(CONDITIONS_PROLONGATION).toEqual([...CONDITIONS_DECIDEES, 'reputee']);
  });

  it('REQ-EXT-020 : une condition hors liste, ou la réputée, n’est pas une décision de la console', () => {
    for (const c of CONDITIONS_DECIDEES) expect(estUneConditionDecidee(c)).toBe(true);
    for (const c of ['reputee', 'financement_en_cours', '', null, 3])
      expect(estUneConditionDecidee(c)).toBe(false);
  });

  it('REQ-EXT-020 : les états à terme sont des états de la machine, sans doublon', () => {
    for (const e of ETATS_A_TERME) expect(ETATS_ATTRIBUTION).toContain(e);
    expect(new Set(ETATS_A_TERME).size).toBe(ETATS_A_TERME.length);
  });
});

describe('REQ-EXT-020 — le terme prolongé et l’ouverture de la liste, lus dans la SSOT', () => {
  it('REQ-EXT-020 : TÉMOIN — le terme recule de la durée de la SSOT, en mois civils de Paris', () => {
    expect(termeProlonge(TERME)).toBe(
      ajouterMoisParis(TERME, SEUILS.PROLONGATION_DEVIS_MOIS.valeur)
    );
    expect(termeProlonge(TERME)).toBeGreaterThan(TERME);
  });

  it('REQ-EXT-020 : la liste s’ouvre l’avance de la SSOT avant le terme', () => {
    expect(ouvertureDeLaDecision(TERME)).toBe(TERME - AVANCE);
  });

  it('REQ-EXT-020 : TÉMOIN — l’art. 3.4 al. 3 porte la durée de la SSOT, en lettres ou par sa variable', () => {
    const u = unitesDuGabarit(readFileSync('docs/contrat/CONTRAT-APPORTEUR-V1.md', 'utf8'));
    const al3 = normaliser(
      u.get('3.4')!.alineas.find((a) => a.includes('une seule fois et sans démarche')) ?? ''
    );
    const lettres = enLettres(SEUILS.PROLONGATION_DEVIS_MOIS.valeur);
    expect(lettres).not.toBeNull();
    const formes = [
      `prolongée de ${lettres} mois`,
      'prolongée de {{PROLONGATION_DEVIS_MOIS}} mois',
    ];
    expect(
      formes.some((f) => al3.includes(f)),
      al3
    ).toBe(true);
    expect(al3).toContain('une seule fois et sans démarche de l');
  });
});

describe('REQ-EXT-020 — la décision de la console : ouverte dans la liste seulement', () => {
  const DANS_LA_LISTE = TERME - AVANCE;

  it('REQ-EXT-020 : TÉMOIN — ouverte de l’ouverture de la liste jusqu’au terme exclu', () => {
    expect(refusDeLaDecision(faits(), DANS_LA_LISTE)).toBeNull();
    expect(refusDeLaDecision(faits(), TERME - 1)).toBeNull();
  });

  it('REQ-EXT-020 : TÉMOIN — avant la liste, sans terme ou hors des états à terme : sans objet', () => {
    expect(refusDeLaDecision(faits(), DANS_LA_LISTE - 1)).toBe('sans_objet');
    expect(refusDeLaDecision(faits({ fenetreFinAt: null }), DANS_LA_LISTE)).toBe('sans_objet');
    for (const e of ETATS_ATTRIBUTION.filter((x) => !ETATS_A_TERME.includes(x)))
      expect(refusDeLaDecision(faits({ statut: e }), DANS_LA_LISTE), e).toBe('sans_objet');
  });

  it('REQ-EXT-020 : TÉMOIN — au terme, sans décision : le terme est passé (la prolongation est réputée)', () => {
    expect(refusDeLaDecision(faits(), TERME)).toBe('terme_passe');
    expect(refusDeLaDecision(faits(), TERME + MS_PAR_JOUR)).toBe('terme_passe');
  });

  it('REQ-EXT-020 : TÉMOIN — une décision posée, réputée comprise, ne se reprend pas : déjà décidée, avant comme après le terme', () => {
    for (const m of [DANS_LA_LISTE, TERME + MS_PAR_JOUR]) {
      expect(refusDeLaDecision(faits({ prolongeeAt: DANS_LA_LISTE }), m)).toBe('deja_decidee');
      expect(refusDeLaDecision(faits({ prolongationRefuseeAt: DANS_LA_LISTE }), m)).toBe(
        'deja_decidee'
      );
    }
  });
});

describe('REQ-EXT-020 — l’issue au terme, appelée par le passage de DM-13', () => {
  it('REQ-EXT-020 : TÉMOIN — avant le terme, ou sans terme : rien', () => {
    expect(issueAuTerme(faits(), TERME - 1)).toBe('pas_encore');
    expect(issueAuTerme(faits({ fenetreFinAt: null }), TERME)).toBe('pas_encore');
  });

  it('REQ-EXT-020 : TÉMOIN — une condition inconnue au terme ne fait PAS expirer : la prolongation est réputée', () => {
    expect(issueAuTerme(faits(), TERME)).toBe('reputer_prolongee');
  });

  it('REQ-EXT-020 : TÉMOIN — le constat posé avant le terme fait expirer au terme', () => {
    expect(issueAuTerme(faits({ prolongationRefuseeAt: TERME - AVANCE }), TERME)).toBe('expirer');
  });

  it('REQ-EXT-020 : TÉMOIN — une attribution prolongée expire au terme reculé, sans seconde prolongation', () => {
    const recule = termeProlonge(TERME);
    const prolongee = faits({ prolongeeAt: TERME, fenetreFinAt: recule });
    expect(issueAuTerme(prolongee, recule - 1)).toBe('pas_encore');
    expect(issueAuTerme(prolongee, recule)).toBe('expirer');
  });
});
