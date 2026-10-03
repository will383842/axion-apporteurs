// @req REQ-CPL-006
/**
 * CPL-T06 — l'étape 3 du cycle : la décision sur une candidature (`retenu`, `vivier`, `refuse`), sa
 * justification, son auteur, sa date ; la présence au webinaire, DÉCLARATIVE et informative.
 *
 * Le domaine est pur : il rend la ligne de décision, le statut d'arrivée de l'apporteur et la charge
 * du changement de statut, jugée par le schéma fermé du type `apporteur_statut_modifie`
 * (`src/domain/evenement/charges.ts`). Les codes de transition sont ceux de la matrice
 * (`TRANSITIONS_APPORTEUR`), jamais recopiés.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  RESULTATS_DECISION_CANDIDATURE,
  TRANSITION_DU_RESULTAT,
  deciderCandidature,
  ErreurDecisionCandidature,
  type ResultatDecisionCandidature,
} from '../../../src/domain/candidature/decision';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';
import {
  ErreurTransitionApporteur,
  TRANSITIONS_APPORTEUR,
} from '../../../src/domain/apporteur/matrice';
import { STATUTS_APPORTEUR, type StatutApporteur } from '../../../src/domain/apporteur/statut';

const AUTEUR = randomUUID();
const DECIDEE_AT = new Date('2026-10-03T09:00:00.000Z');

function demande(
  statutActuel: StatutApporteur,
  resultat: ResultatDecisionCandidature,
  webinaireSuivi: boolean | null
) {
  return {
    statutActuel,
    resultat,
    justification: 'Profil aligné sur le réseau visé.',
    webinaireSuivi,
    auteurId: AUTEUR,
    decideeAt: DECIDEE_AT,
  };
}

describe('REQ-CPL-006 — la décision sur une candidature fait passer l’apporteur par la matrice', () => {
  it.each([
    ['retenu', 'retenir', 'retenu'],
    ['vivier', 'mettre_en_vivier', 'vivier'],
    ['refuse', 'refuser', 'refuse'],
  ] as const)(
    'REQ-CPL-006 : un candidat décidé `%s` passe par la transition `%s` et arrive `%s`',
    (resultat, transition, vers) => {
      const r = deciderCandidature(demande('candidat', resultat, null));
      expect(r.statut).toBe(vers);
      expect(r.chargeStatut).toEqual({
        de: 'candidat',
        vers,
        transition,
        acteur: { par: 'utilisateur_console', id: AUTEUR },
      });
    }
  );

  it('REQ-CPL-006 : les trois résultats sont exactement les trois statuts de décision, et leurs transitions sont des flèches de la matrice depuis `candidat`', () => {
    expect([...RESULTATS_DECISION_CANDIDATURE]).toEqual(['retenu', 'vivier', 'refuse']);
    for (const r of RESULTATS_DECISION_CANDIDATURE) {
      expect(TRANSITIONS_APPORTEUR.candidat[TRANSITION_DU_RESULTAT[r]]).toBe(r);
    }
  });

  it('REQ-CPL-006 : la ligne de décision porte le résultat, la justification, l’auteur, la date et la présence déclarée', () => {
    const r = deciderCandidature(demande('candidat', 'vivier', true));
    expect(r.decision).toEqual({
      resultat: 'vivier',
      justification: 'Profil aligné sur le réseau visé.',
      webinaireSuivi: true,
      auteurId: AUTEUR,
      decideeAt: DECIDEE_AT,
    });
  });

  it('REQ-CPL-006 : la charge du changement de statut est acceptée par le schéma FERMÉ du type `apporteur_statut_modifie`', () => {
    for (const resultat of RESULTATS_DECISION_CANDIDATURE) {
      const { chargeStatut } = deciderCandidature(demande('candidat', resultat, false));
      expect(CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse(chargeStatut).success).toBe(true);
    }
  });

  it('REQ-CPL-006 : depuis le vivier, on peut retenir ou refuser, jamais remettre en vivier', () => {
    expect(deciderCandidature(demande('vivier', 'retenu', null)).statut).toBe('retenu');
    expect(deciderCandidature(demande('vivier', 'refuse', null)).statut).toBe('refuse');
    expect(() => deciderCandidature(demande('vivier', 'vivier', null))).toThrow(
      ErreurTransitionApporteur
    );
  });

  it('REQ-CPL-006 : aucune décision sur un apporteur déjà retenu, refusé, ou plus loin dans le cycle', () => {
    for (const s of STATUTS_APPORTEUR.filter((x) => x !== 'candidat' && x !== 'vivier')) {
      for (const resultat of RESULTATS_DECISION_CANDIDATURE) {
        expect(() => deciderCandidature(demande(s, resultat, null))).toThrow(
          ErreurTransitionApporteur
        );
      }
    }
  });

  it('REQ-CPL-006 : une décision sans justification est refusée — blanche comprise', () => {
    for (const justification of ['', '   ']) {
      expect(() =>
        deciderCandidature({ ...demande('candidat', 'refuse', null), justification })
      ).toThrow(ErreurDecisionCandidature);
    }
  });

  it('REQ-CPL-006 : la présence au webinaire est DÉCLARATIVE — oui, non ou inconnue, la décision et la transition sont les mêmes (REQ-JUR-013)', () => {
    for (const resultat of RESULTATS_DECISION_CANDIDATURE) {
      const [oui, non, inconnue] = [true, false, null].map((w) =>
        deciderCandidature(demande('candidat', resultat, w))
      );
      expect(non!.statut).toBe(oui!.statut);
      expect(inconnue!.statut).toBe(oui!.statut);
      expect(non!.chargeStatut).toEqual(oui!.chargeStatut);
      expect(inconnue!.chargeStatut).toEqual(oui!.chargeStatut);
    }
  });

  it('REQ-CPL-006 : aucun contrat ne part sans `retenu` — dans la matrice, `pret_a_signer` et `signe` ne s’atteignent qu’en passant par `retenu`', () => {
    // Parcours de la matrice depuis `candidat`, `retenu` RETIRÉ du graphe : rien de signable n'est
    // atteignable. Le même parcours avec `retenu` atteint `signe` (contre-témoin).
    const atteignables = (interdit: StatutApporteur | null): Set<StatutApporteur> => {
      const vus = new Set<StatutApporteur>(['candidat']);
      const file: StatutApporteur[] = ['candidat'];
      while (file.length > 0) {
        const s = file.shift()!;
        for (const vers of Object.values(TRANSITIONS_APPORTEUR[s])) {
          if (vers === undefined || vers === interdit || vus.has(vers)) continue;
          vus.add(vers);
          file.push(vers);
        }
      }
      return vus;
    };
    const sansRetenu = atteignables('retenu');
    expect(sansRetenu.has('pret_a_signer')).toBe(false);
    expect(sansRetenu.has('signe')).toBe(false);
    expect(atteignables(null).has('signe')).toBe(true);
  });
});
