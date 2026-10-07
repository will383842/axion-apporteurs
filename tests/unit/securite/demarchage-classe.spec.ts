// @req REQ-SEC-042
/**
 * SEC-51 — la liste FERMÉE dans les deux sens (avis de la lentille sécurité, point 4) : chaque action
 * de la console et chaque tâche de fond se déclare « démarchage », « vérification » ou « sans
 * contact ». La confrontation est DÉRIVÉE des sources (la matrice des droits, le registre des
 * tâches) : une action ou une tâche neuve non classée fait rougir, et un classement sans source aussi.
 */
import { describe, it, expect } from 'vitest';
import { MATRICE_DES_ROLES } from '../../../src/server/roles/matrice';
import { TACHES } from '../../../src/server/taches/registre';
import {
  CLASSEMENT_DES_ACTIONS,
  NATURES,
  naturesDeDemarchage,
} from '../../../src/server/demarchage/actions-classees';

const SOURCES = [
  ...Object.keys(MATRICE_DES_ROLES),
  ...Object.keys(TACHES).map((t) => `tache:${t}`),
];

describe('REQ-SEC-042 — chaque action et chaque tâche se déclare', () => {
  it('REQ-SEC-042 : TÉMOIN — le classement couvre EXACTEMENT les actions de la matrice et les tâches du registre', () => {
    expect(Object.keys(CLASSEMENT_DES_ACTIONS).sort()).toEqual([...SOURCES].sort());
  });

  it('REQ-SEC-042 : chaque classement est une nature de la liste fermée', () => {
    expect([...NATURES]).toEqual(['demarchage', 'verification', 'sans_contact']);
    for (const [cle, nature] of Object.entries(CLASSEMENT_DES_ACTIONS)) {
      expect(NATURES, cle).toContain(nature);
    }
  });

  it('REQ-SEC-042 : les actions de démarchage sont celles qui doivent appeler la garde', () => {
    expect(naturesDeDemarchage()).toEqual(
      Object.entries(CLASSEMENT_DES_ACTIONS)
        .filter(([, n]) => n === 'demarchage')
        .map(([c]) => c)
    );
  });
});
