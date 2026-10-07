// @req REQ-SEC-042
/**
 * SEC-51 — la GARDE UNIQUE de la réserve : la console ne démarche aucune entreprise réservée par un
 * apporteur. La garde juge des FAITS (les actes de l'apporteur et leurs exceptions, la confirmation en
 * cours), lus par un port ; ce spec juge la règle, l'échec fermé et le refus non révélateur.
 */
import { describe, it, expect } from 'vitest';
import {
  CODE_ENTREPRISE_RESERVEE,
  EntrepriseReservee,
  exigerHorsReserve,
  jugerLaReserve,
  type FaitsDeReserve,
} from '../../../src/server/demarchage/garde-reserve';
import { REFUS_DE_LA_CONSOLE } from '../../../src/content/micro-copy/console/refus';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';

const MAINTENANT = new Date('2026-10-03T10:00:00.000Z');
const JOURS = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;
const avant = (ms: number) => new Date(MAINTENANT.getTime() - ms);
const LIBRE: FaitsDeReserve = { actes: [], confirmationEnCours: false };

describe('REQ-SEC-042 — la réserve après un acte de l’apporteur', () => {
  it('REQ-SEC-042 : TÉMOIN — un acte de moins de RESERVE_APRES_ACTE_APPORTEUR_JOURS réserve l’entreprise : le démarchage est refusé', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
      confirmationEnCours: false,
    };
    expect(jugerLaReserve(faits, 'demarchage', MAINTENANT)).toEqual({
      permis: false,
      code: CODE_ENTREPRISE_RESERVEE,
    });
  });

  it('REQ-SEC-042 : TÉMOIN — la réserve ÉCHUE laisse passer : à l’échéance exacte, l’action passe ; une milliseconde avant, refusée', () => {
    const echeance = JOURS * MS_PAR_JOUR;
    const pile = { actes: [{ at: avant(echeance), exempte: false }], confirmationEnCours: false };
    const juste = {
      actes: [{ at: avant(echeance - 1), exempte: false }],
      confirmationEnCours: false,
    };
    expect(jugerLaReserve(pile, 'demarchage', MAINTENANT)).toEqual({ permis: true });
    expect(jugerLaReserve(juste, 'demarchage', MAINTENANT).permis).toBe(false);
  });

  it('REQ-SEC-042 : un acte EXEMPTÉ (entreprise déjà connue de la Société, ou occupée à la date de l’acte) ne réserve rien', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: true }],
      confirmationEnCours: false,
    };
    expect(jugerLaReserve(faits, 'demarchage', MAINTENANT)).toEqual({ permis: true });
  });

  it('REQ-SEC-042 : TÉMOIN — pendant le délai de confirmation, aucun démarchage', () => {
    expect(
      jugerLaReserve({ actes: [], confirmationEnCours: true }, 'demarchage', MAINTENANT)
    ).toEqual({ permis: false, code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : TÉMOIN — la VÉRIFICATION (l’appel de confirmation) n’est pas du démarchage : elle passe pendant la réserve', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
      confirmationEnCours: true,
    };
    expect(jugerLaReserve(faits, 'verification', MAINTENANT)).toEqual({ permis: true });
    expect(jugerLaReserve(LIBRE, 'demarchage', MAINTENANT)).toEqual({ permis: true });
  });
});

describe('REQ-SEC-042 — la garde à l’appel : échec fermé, refus non révélateur', () => {
  it('REQ-SEC-042 : TÉMOIN — le refus est IDENTIQUE pour les deux causes : ni l’apporteur, ni la cause, ni la date de fin', async () => {
    const refus = async (faits: FaitsDeReserve) => {
      try {
        await exigerHorsReserve(
          { lireLesFaits: async () => faits },
          { siren: '123456789', nature: 'demarchage' },
          MAINTENANT
        );
      } catch (e) {
        return e as EntrepriseReservee;
      }
      throw new Error('aucun refus');
    };
    const parActe = await refus({
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
      confirmationEnCours: false,
    });
    const parConfirmation = await refus({ actes: [], confirmationEnCours: true });
    expect(parActe).toBeInstanceOf(EntrepriseReservee);
    expect([parActe.message, parActe.code]).toEqual([
      CODE_ENTREPRISE_RESERVEE,
      CODE_ENTREPRISE_RESERVEE,
    ]);
    expect([parConfirmation.message, parConfirmation.code]).toEqual([
      parActe.message,
      parActe.code,
    ]);
    expect(Object.keys(parActe)).toEqual(Object.keys(parConfirmation));
  });

  it('REQ-SEC-042 : TÉMOIN — ÉCHEC FERMÉ : un état de réserve illisible refuse, sous le MÊME code', async () => {
    await expect(
      exigerHorsReserve(
        {
          lireLesFaits: async () => {
            throw new Error('base injoignable');
          },
        },
        { siren: '123456789', nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : une entreprise libre passe, et une vérification ne lit même pas l’état', async () => {
    let lu = 0;
    const ports = {
      lireLesFaits: async () => {
        lu += 1;
        return LIBRE;
      },
    };
    await expect(
      exigerHorsReserve(ports, { siren: '123456789', nature: 'demarchage' }, MAINTENANT)
    ).resolves.toBeUndefined();
    await expect(
      exigerHorsReserve(ports, { siren: '123456789', nature: 'verification' }, MAINTENANT)
    ).resolves.toBeUndefined();
    expect(lu).toBe(1);
  });

  it('REQ-SEC-042 : l’écran affiche un message GÉNÉRIQUE de la micro-copie, sans apporteur, cause ni date', () => {
    expect(REFUS_DE_LA_CONSOLE[CODE_ENTREPRISE_RESERVEE]).toBe(
      'Entreprise indisponible pour une prise de contact commerciale'
    );
  });
});
