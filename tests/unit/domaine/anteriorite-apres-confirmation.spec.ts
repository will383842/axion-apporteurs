// @req REQ-DM-043
// @req REQ-JUR-007
/**
 * DM-71 — contrat v2, art. 3.3 : après la confirmation, une attribution ne s'annule plus pour
 * antériorité ; seul un geste HUMAIN, pour erreur d'identification de l'entreprise ou pour fraude de
 * l'apporteur, l'annule (forme d'A02, #806 6039768837 et 6039777605).
 *
 * Ce que le fichier tient, sur la machine et sur la charge du journal :
 *   — `anteriorite_etablie` ne vaut plus que depuis `provisoire` ; chaque état confirmé la refuse ;
 *   — `annulee_erreur_identification` part de chaque état confirmé vers `annulee`, jamais de
 *     `provisoire`, et le conseiller ne la déclenche jamais ;
 *   — la charge porte l'`exception` pour cette transition et elle seule, avec la bonne valeur.
 * La garde en base (`attributions_annulation_apres_confirmation`) est jugée en intégration.
 */
import { describe, it, expect } from 'vitest';
import {
  ETATS_CONFIRMES,
  EXCEPTIONS_ANNULATION,
  EXCEPTION_DE_LA_TRANSITION,
  transitionnerAttribution,
} from '../../../src/domain/attribution/machine';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';

const ADMIN = '0190f0c2-0000-7000-8000-0000000000a1';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'aucun refus';
};

describe('REQ-JUR-007 — l’antériorité n’annule plus après la confirmation (art. 3.3)', () => {
  it('REQ-JUR-007 : les états CONFIRMÉS sont exactement ceux-ci', () => {
    expect([...ETATS_CONFIRMES]).toEqual([
      'active',
      'rdv_pris',
      'proposition',
      'signee',
      'convertie',
      'figee_resiliation',
    ]);
  });

  it.each([
    'active',
    'rdv_pris',
    'proposition',
    'signee',
    'convertie',
    'figee_resiliation',
  ] as const)('REQ-JUR-007 : TÉMOIN — depuis %s, `anteriorite_etablie` est REFUSÉE', (de) => {
    expect(
      code(() =>
        transitionnerAttribution({ de, transition: 'anteriorite_etablie', porteur: 'apporteur' })
      )
    ).toBe('transition_refusee');
  });

  it('REQ-JUR-007 : TÉMOIN à deux faces — depuis `provisoire`, l’antériorité annule toujours', () => {
    expect(
      transitionnerAttribution({
        de: 'provisoire',
        transition: 'anteriorite_etablie',
        porteur: 'apporteur',
      })
    ).toBe('annulee');
  });
});

describe('REQ-JUR-007 — l’exception humaine : l’erreur d’identification de l’entreprise', () => {
  it.each([...ETATS_CONFIRMES])(
    'REQ-JUR-007 : depuis %s, `annulee_erreur_identification` annule',
    (de) => {
      expect(
        transitionnerAttribution({
          de,
          transition: 'annulee_erreur_identification',
          porteur: 'apporteur',
        })
      ).toBe('annulee');
    }
  );

  it('REQ-JUR-007 : TÉMOIN — jamais depuis `provisoire` (l’antériorité y suffit), jamais par un conseiller', () => {
    expect(
      code(() =>
        transitionnerAttribution({
          de: 'provisoire',
          transition: 'annulee_erreur_identification',
          porteur: 'apporteur',
        })
      )
    ).toBe('transition_refusee');
    expect(
      code(() =>
        transitionnerAttribution({
          de: 'active',
          transition: 'annulee_erreur_identification',
          porteur: 'conseiller',
        })
      )
    ).toBe('refusee_au_porteur');
  });
});

describe('REQ-JUR-007 — la charge porte l’exception, pour la transition humaine et elle seule', () => {
  const charge = (o: Record<string, unknown>) =>
    CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse({
      de: 'active',
      vers: 'annulee',
      acteur: { par: 'utilisateur_console', id: ADMIN },
      ...o,
    }).success;

  it('REQ-JUR-007 : la liste FERMÉE des exceptions est celle de l’enum en base', () => {
    expect([...EXCEPTIONS_ANNULATION]).toEqual([
      'erreur_identification',
      'fraude',
      'retablissement_apporteur',
    ]);
    expect(EXCEPTION_DE_LA_TRANSITION.annulee_erreur_identification).toBe('erreur_identification');
  });

  it('REQ-JUR-007 : TÉMOIN — l’exception est EXIGÉE, avec SA valeur ; absente ou fausse, refusée', () => {
    expect(
      charge({ transition: 'annulee_erreur_identification', exception: 'erreur_identification' })
    ).toBe(true);
    expect(charge({ transition: 'annulee_erreur_identification' })).toBe(false);
    expect(charge({ transition: 'annulee_erreur_identification', exception: 'fraude' })).toBe(
      false
    );
  });

  it('REQ-JUR-007 : TÉMOIN — une autre transition ne porte JAMAIS d’exception', () => {
    expect(charge({ transition: 'expiree', vers: 'expiree' })).toBe(true);
    expect(charge({ transition: 'expiree', vers: 'expiree', exception: 'fraude' })).toBe(false);
  });
});

describe('REQ-JUR-007 — l’exception humaine : la fraude de l’apporteur (coordination : DM-71 pose les deux transitions)', () => {
  it.each([...ETATS_CONFIRMES])('REQ-JUR-007 : depuis %s, `fraude_etablie` annule', (de) => {
    expect(
      transitionnerAttribution({ de, transition: 'fraude_etablie', porteur: 'apporteur' })
    ).toBe('annulee');
  });

  it('REQ-JUR-007 : TÉMOIN — jamais depuis `provisoire`, jamais par un conseiller', () => {
    expect(
      code(() =>
        transitionnerAttribution({
          de: 'provisoire',
          transition: 'fraude_etablie',
          porteur: 'apporteur',
        })
      )
    ).toBe('transition_refusee');
    expect(
      code(() =>
        transitionnerAttribution({
          de: 'signee',
          transition: 'fraude_etablie',
          porteur: 'conseiller',
        })
      )
    ).toBe('refusee_au_porteur');
  });

  it('REQ-JUR-007 : la charge de `fraude_etablie` exige l’exception `fraude`, et elle seule', () => {
    expect(EXCEPTION_DE_LA_TRANSITION.fraude_etablie).toBe('fraude');
    const ok = (exception?: string) =>
      CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse({
        de: 'signee',
        vers: 'annulee',
        transition: 'fraude_etablie',
        acteur: { par: 'utilisateur_console', id: ADMIN },
        ...(exception === undefined ? {} : { exception }),
      }).success;
    expect(ok('fraude')).toBe(true);
    expect(ok()).toBe(false);
    expect(ok('erreur_identification')).toBe(false);
  });
});
