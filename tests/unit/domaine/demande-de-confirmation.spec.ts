// @req REQ-DM-060
// @req REQ-SEC-024
/**
 * DM-40 (REQ-DM-060) — la demande de confirmation, dans le domaine : les états fermés, l'échéance
 * d'envoi dérivée de l'horodatage du dépôt et de la SSOT, la fenêtre d'annulation et de correction,
 * et l'écrivain qui refuse une demande pour un conseiller (client simulé, rien d'écrit).
 */
import { describe, it, expect } from 'vitest';
import {
  CorrectionHorsDelai,
  DemandeNonAnnulable,
  ETATS_DEMANDE_CONFIRMATION,
  FORME_EMPREINTE_IP_DU_CLIC,
  echeanceDEnvoi,
  fenetreDeCorrectionOuverte,
  jugerAnnulation,
  jugerCorrection,
} from '../../../src/domain/confirmation/demande';
import { PARAMETRES_HORS_DEPOT_CONFIRMATION, SEUILS } from '../../../src/domain/seuils/ssot';
import { creerLaDemande } from '../../../src/server/confirmation/demandes';

const DEPOT = Date.UTC(2026, 9, 2, 10, 0, 0);
const MINUTE = 60_000;

describe('REQ-DM-060 — les états de la demande, enum fermé', () => {
  it('REQ-DM-060 : exactement dix états, dans cet ordre', () => {
    expect(ETATS_DEMANDE_CONFIRMATION).toEqual([
      'planifiee',
      'annulee',
      'envoyee',
      'retenue',
      'rebond',
      'repondue_oui',
      'repondue_non',
      'clic_non_retenu',
      'opposee',
      'expiree',
    ]);
  });
});

describe('REQ-DM-060 — les paramètres de la SSOT', () => {
  it('REQ-DM-060 : TEST HYP — 15 minutes avant l’envoi, 5 jours ouvrés sans réponse, 2 corrections après rebond', () => {
    expect(SEUILS.DELAI_AVANT_ENVOI_CONFIRMATION_MINUTES).toMatchObject({
      valeur: 15,
      unite: 'minutes',
    });
    expect(SEUILS.CONFIRMATION_SANS_REPONSE_JOURS_OUVRES).toMatchObject({
      valeur: 5,
      unite: 'jours_ouvres',
    });
    expect(SEUILS.CORRECTIONS_ADRESSE_MAX).toMatchObject({ valeur: 2, unite: 'tentatives' });
  });

  it('REQ-DM-060 : le taux d’échantillon et le nombre de premiers dépôts appelés n’ont que leur CLÉ, leur valeur vit hors dépôt', () => {
    expect(Object.keys(PARAMETRES_HORS_DEPOT_CONFIRMATION).sort()).toEqual([
      'CONFIRMATION_PREMIERS_DEPOTS_APPELES',
      'CONFIRMATION_TAUX_ECHANTILLON',
    ]);
    for (const p of Object.values(PARAMETRES_HORS_DEPOT_CONFIRMATION)) {
      expect(p.valeur).toBe('hors-depot');
    }
  });
});

describe('REQ-DM-060 — l’échéance d’envoi et la fenêtre de correction', () => {
  it('REQ-DM-060 : l’envoi est dû quinze minutes après l’horodatage du dépôt', () => {
    expect(echeanceDEnvoi(DEPOT)).toBe(DEPOT + 15 * MINUTE);
  });

  it('REQ-DM-060 : TÉMOIN — la fenêtre est ouverte une milliseconde avant l’échéance, fermée à l’échéance', () => {
    expect(fenetreDeCorrectionOuverte(DEPOT, DEPOT + 15 * MINUTE - 1)).toBe(true);
    expect(fenetreDeCorrectionOuverte(DEPOT, DEPOT + 15 * MINUTE)).toBe(false);
  });

  it('REQ-DM-060 : TÉMOIN — une correction hors de la fenêtre est refusée par une erreur nommée', () => {
    expect(() => jugerCorrection(DEPOT, DEPOT + 14 * MINUTE)).not.toThrow();
    let e: unknown;
    try {
      jugerCorrection(DEPOT, DEPOT + 15 * MINUTE);
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(CorrectionHorsDelai);
    expect((e as CorrectionHorsDelai).code).toBe('correction_hors_delai');
    expect((e as CorrectionHorsDelai).name).toBe('CorrectionHorsDelai');
  });
});

describe('REQ-DM-060 — l’annulation ne vaut que pour une demande planifiée', () => {
  it('REQ-DM-060 : TÉMOIN — planifiee s’annule ; tout autre état est refusé par une erreur nommée', () => {
    expect(() => jugerAnnulation('planifiee')).not.toThrow();
    for (const etat of ETATS_DEMANDE_CONFIRMATION.filter((x) => x !== 'planifiee')) {
      let e: unknown;
      try {
        jugerAnnulation(etat);
      } catch (x) {
        e = x;
      }
      expect(e, etat).toBeInstanceOf(DemandeNonAnnulable);
      expect((e as DemandeNonAnnulable).code).toBe('demande_non_annulable');
      expect((e as DemandeNonAnnulable).message).toBe(`demande_non_annulable : ${etat}`);
    }
  });
});

describe('REQ-SEC-024 — l’empreinte d’IP du clic est tronquée', () => {
  it('REQ-SEC-024 : la forme admise est celle des autres empreintes tronquées, jamais une adresse', () => {
    expect(FORME_EMPREINTE_IP_DU_CLIC.test('0123456789abcdef')).toBe(true);
    for (const x of ['203.0.113.7', '0123456789ABCDEF', '0123456789abcde', '0123456789abcdef0']) {
      expect(FORME_EMPREINTE_IP_DU_CLIC.test(x), x).toBe(false);
    }
  });
});

describe('REQ-DM-060 — l’écrivain refuse un conseiller (HYP-W20-SALARIES)', () => {
  it('REQ-DM-060 : TÉMOIN — une attribution sans apporteur ne reçoit pas de demande, et rien n’est écrit', async () => {
    const ecrit: string[] = [];
    const tx = {
      $queryRaw: async () => [{ apporteur_id: null }],
      demandeConfirmation: {
        create: async () => {
          ecrit.push('demande');
          return { id: 'x' };
        },
      },
    } as never;
    let e: unknown;
    try {
      await creerLaDemande(tx, {
        attributionId: '0190f0a0-0000-7000-8000-000000000001',
        jetonOuiHash: 'a'.repeat(64),
        jetonNonHash: 'b'.repeat(64),
        acteur: { par: 'systeme' },
      });
    } catch (x) {
      e = x;
    }
    expect((e as { code?: string }).code).toBe('demande_pour_un_conseiller');
    expect(ecrit).toEqual([]);
  });
});
