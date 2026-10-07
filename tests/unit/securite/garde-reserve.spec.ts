// @req REQ-SEC-042
/**
 * SEC-51 — la GARDE UNIQUE de la réserve : la console ne démarche aucune entreprise réservée par un
 * apporteur. La garde juge des FAITS (les actes de l'apporteur et leurs exemptions), lus par un port ; ce spec juge la règle, l'échec fermé et le refus non révélateur.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CODE_ENTREPRISE_RESERVEE,
  EntrepriseReservee,
  cleDuVerrouDuSiren,
  exigerHorsReserve,
  jugerLaReserve,
  portSousVerrou,
  type FaitsDeReserve,
  type RefusDeReserve,
} from '../../../src/server/demarchage/garde-reserve';
import { naturesDeDemarchage } from '../../../src/server/demarchage/actions-classees';
import { REFUS_DE_LA_CONSOLE } from '../../../src/content/micro-copy/console/refus';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';

const MAINTENANT = new Date('2026-10-03T10:00:00.000Z');
const JOURS = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;
const avant = (ms: number) => new Date(MAINTENANT.getTime() - ms);
const ACTION = 'tache:contacts_purger' as const;
const LIBRE: FaitsDeReserve = { actes: [] };

describe('REQ-SEC-042 — la réserve après un acte de l’apporteur', () => {
  it('REQ-SEC-042 : TÉMOIN — un acte de moins de RESERVE_APRES_ACTE_APPORTEUR_JOURS réserve l’entreprise : le démarchage est refusé', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
    };
    expect(jugerLaReserve(faits, 'demarchage', MAINTENANT)).toEqual({
      permis: false,
      code: CODE_ENTREPRISE_RESERVEE,
    });
  });

  it('REQ-SEC-042 : TÉMOIN — la réserve ÉCHUE laisse passer : à l’échéance exacte, l’action passe ; une milliseconde avant, refusée', () => {
    const echeance = JOURS * MS_PAR_JOUR;
    const pile = { actes: [{ at: avant(echeance), exempte: false }] };
    const juste = {
      actes: [{ at: avant(echeance - 1), exempte: false }],
    };
    expect(jugerLaReserve(pile, 'demarchage', MAINTENANT)).toEqual({ permis: true });
    expect(jugerLaReserve(juste, 'demarchage', MAINTENANT).permis).toBe(false);
  });

  it('REQ-SEC-042 : un acte EXEMPTÉ (entreprise déjà connue de la Société, ou occupée à la date de l’acte) ne réserve rien', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: true }],
    };
    expect(jugerLaReserve(faits, 'demarchage', MAINTENANT)).toEqual({ permis: true });
  });

  it('REQ-SEC-042 : TÉMOIN — sans acte non exempté, aucune réserve : une entreprise déclarée ou attribuée reste démarchable (contrat v2, art. 3.5)', () => {
    expect(jugerLaReserve({ actes: [] }, 'demarchage', MAINTENANT)).toEqual({ permis: true });
  });

  it('REQ-SEC-042 : TÉMOIN — la VÉRIFICATION (l’appel de confirmation) n’est pas du démarchage : elle passe pendant la réserve', () => {
    const faits = {
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
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
          { siren: '123456789', action: ACTION, nature: 'demarchage' },
          MAINTENANT
        );
      } catch (e) {
        return e as EntrepriseReservee;
      }
      throw new Error('aucun refus');
    };
    const parActe = await refus({
      actes: [{ at: avant(MS_PAR_JOUR), exempte: false }],
    });
    const parConfirmation = await refus({
      actes: [{ at: avant(2 * MS_PAR_JOUR), exempte: false }],
    });
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
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
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
      exigerHorsReserve(
        ports,
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).resolves.toBeUndefined();
    await expect(
      exigerHorsReserve(
        ports,
        { siren: '123456789', action: ACTION, nature: 'verification' },
        MAINTENANT
      )
    ).resolves.toBeUndefined();
    expect(lu).toBe(1);
  });

  it('REQ-SEC-042 : l’écran affiche un message GÉNÉRIQUE de la micro-copie, sans apporteur, cause ni date', () => {
    expect(REFUS_DE_LA_CONSOLE[CODE_ENTREPRISE_RESERVEE]).toBe(
      'Entreprise indisponible pour un démarchage'
    );
  });
});

describe('REQ-SEC-042 — le refus est journalisé sous les identifiants seuls', () => {
  const reservee: FaitsDeReserve = { actes: [{ at: avant(MS_PAR_JOUR), exempte: false }] };

  it('REQ-SEC-042 : TÉMOIN — un refus écrit UNE ligne : le SIREN et l’action, ni la cause, ni l’apporteur, ni la date', async () => {
    const lignes: RefusDeReserve[] = [];
    const ports = {
      lireLesFaits: async () => reservee,
      journaliser: (l: RefusDeReserve) => void lignes.push(l),
    };
    await expect(
      exigerHorsReserve(
        ports,
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toBeInstanceOf(EntrepriseReservee);
    expect(lignes).toEqual([
      {
        signal: 'demarchage_refuse',
        code: CODE_ENTREPRISE_RESERVEE,
        siren: '123456789',
        action: ACTION,
      },
    ]);
    expect(Object.keys(lignes[0]!).sort()).toEqual(['action', 'code', 'signal', 'siren']);
  });

  it('REQ-SEC-042 : TÉMOIN — l’échec fermé est journalisé sous la même ligne, et un passage n’écrit rien', async () => {
    const lignes: RefusDeReserve[] = [];
    const journaliser = (l: RefusDeReserve) => void lignes.push(l);
    await expect(
      exigerHorsReserve(
        {
          lireLesFaits: async () => {
            throw new Error('base injoignable');
          },
          journaliser,
        },
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
    await exigerHorsReserve(
      { lireLesFaits: async () => LIBRE, journaliser },
      { siren: '123456789', action: ACTION, nature: 'demarchage' },
      MAINTENANT
    );
    expect(lignes.map((l) => l.code)).toEqual([CODE_ENTREPRISE_RESERVEE]);
  });

  it('REQ-SEC-042 : un journal qui échoue ne change pas le verdict : le refus reste le même', async () => {
    await expect(
      exigerHorsReserve(
        {
          lireLesFaits: async () => reservee,
          journaliser: async () => {
            throw new Error('journal injoignable');
          },
        },
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : TÉMOIN — le verrou du SIREN de la garde est celui que le dépôt prend : une seule clé, deux sources', () => {
    const depot = readFileSync('src/server/depot/deposer.ts', 'utf8');
    expect(depot).toContain('verrou-du-depot.siren.${siren}');
    expect(cleDuVerrouDuSiren('123456789')).toBe('verrou-du-depot.siren.123456789');
  });
});

describe('REQ-SEC-042 — le refus est une erreur nommée, et le journal est facultatif', () => {
  it('REQ-SEC-042 : le refus porte son nom et son code, et rien d’autre', () => {
    const e = new EntrepriseReservee();
    expect(e.name).toBe('EntrepriseReservee');
    expect(e.code).toBe(CODE_ENTREPRISE_RESERVEE);
    expect(e.message).toBe(CODE_ENTREPRISE_RESERVEE);
  });

  it('REQ-SEC-042 : sans port de journal, la garde refuse quand même, sous le même code', async () => {
    await expect(
      exigerHorsReserve(
        { lireLesFaits: async () => ({ actes: [{ at: avant(MS_PAR_JOUR), exempte: false }] }) },
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toMatchObject({ name: 'EntrepriseReservee', code: CODE_ENTREPRISE_RESERVEE });
  });

  it('REQ-SEC-042 : la liste des actions de démarchage se dérive de son classement', () => {
    expect(
      naturesDeDemarchage({
        'action:a': 'demarchage',
        'action:b': 'sans_contact',
        'action:c': 'verification',
        'tache:d': 'demarchage',
      })
    ).toEqual(['action:a', 'tache:d']);
  });
});

describe('REQ-SEC-042 — le port de production lit les actes, avec leur exemption, sous le verrou du SIREN', () => {
  const A = new Date('2026-10-02T10:00:00.000Z');
  const B = new Date('2026-10-01T10:00:00.000Z');
  const C = new Date('2026-09-30T10:00:00.000Z');

  /** Un client de transaction factice : ce que les trois tables rendent, et l'ordre des appels. */
  function fausseTransaction(
    lignes: {
      verifications?: { resultat: string; verifieeAt: Date }[];
      refuses?: { motif: string; refuseAt: Date }[];
      enAttente?: { deposeeAt: Date }[];
    } = {}
  ) {
    const appels: string[] = [];
    const executeRaw = vi.fn(async (_chaines: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push(`verrou:${String(valeurs[0])}`);
      return 1;
    });
    const tx = {
      $executeRaw: executeRaw,
      verification: {
        findMany: vi.fn(async (q: unknown) => {
          appels.push('verifications');
          expect(q).toEqual({
            where: { siren: '123456789', apporteurId: { not: null } },
            select: { resultat: true, verifieeAt: true },
          });
          return lignes.verifications ?? [];
        }),
      },
      depotRefuse: {
        findMany: vi.fn(async (q: unknown) => {
          appels.push('refuses');
          expect(q).toEqual({
            where: { siren: '123456789' },
            select: { motif: true, refuseAt: true },
          });
          return lignes.refuses ?? [];
        }),
      },
      attribution: {
        findMany: vi.fn(async (q: unknown) => {
          appels.push('en_attente');
          expect(q).toEqual({
            where: { siren: '123456789', apporteurId: { not: null }, statut: 'en_attente' },
            select: { deposeeAt: true },
          });
          return lignes.enAttente ?? [];
        }),
      },
    };
    return { tx, appels, executeRaw };
  }

  it('REQ-SEC-042 : TÉMOIN — le verrou du SIREN est pris AVANT toute lecture, sous la clé du dépôt', async () => {
    const { tx, appels } = fausseTransaction();
    const faits = await portSousVerrou(tx as never).lireLesFaits('123456789');
    expect(faits).toEqual({ actes: [] });
    expect(appels[0]).toBe(`verrou:${cleDuVerrouDuSiren('123456789')}`);
    expect(appels.slice(1).sort()).toEqual(['en_attente', 'refuses', 'verifications']);
  });

  it('REQ-SEC-042 : TÉMOIN — une vérification réserve, sauf si l’entreprise est suivie, cliente ou sur la liste de la Société', async () => {
    const resultats = ['libre', 'fermee', 'suivie', 'cliente', 'liste_noire'];
    const { tx } = fausseTransaction({
      verifications: resultats.map((resultat) => ({ resultat, verifieeAt: A })),
    });
    const { actes } = await portSousVerrou(tx as never).lireLesFaits('123456789');
    expect(actes).toEqual([
      { at: A, exempte: false },
      { at: A, exempte: false },
      { at: A, exempte: true },
      { at: A, exempte: true },
      { at: A, exempte: true },
    ]);
  });

  it('REQ-SEC-042 : TÉMOIN — un dépôt refusé réserve, sauf pour une antériorité de la Société ou une entreprise occupée', async () => {
    const motifs = [
      'insincerite',
      'etablissement_cesse',
      'entreprise_hors_perimetre',
      'opposition_demarchage',
      'anteriorite_client',
      'anteriorite_devis',
      'file_complete',
    ];
    const { tx } = fausseTransaction({
      refuses: motifs.map((motif) => ({ motif, refuseAt: B })),
    });
    const { actes } = await portSousVerrou(tx as never).lireLesFaits('123456789');
    expect(actes.map((a) => a.exempte)).toEqual([false, false, false, false, true, true, true]);
    expect(actes.every((a) => a.at === B)).toBe(true);
  });

  it('REQ-SEC-042 : TÉMOIN — un dépôt en attente est un acte non exempté, daté de son dépôt', async () => {
    const { tx } = fausseTransaction({ enAttente: [{ deposeeAt: C }] });
    const { actes } = await portSousVerrou(tx as never).lireLesFaits('123456789');
    expect(actes).toEqual([{ at: C, exempte: false }]);
  });

  it('REQ-SEC-042 : le port rend aussi le journal de l’appelant, tel quel', () => {
    const journaliser = vi.fn();
    expect(portSousVerrou(fausseTransaction().tx as never, journaliser).journaliser).toBe(
      journaliser
    );
    expect(portSousVerrou(fausseTransaction().tx as never).journaliser).toBeUndefined();
  });

  it('REQ-SEC-042 : TÉMOIN — de bout en bout : la garde, sur ce port, refuse pour un acte non exempté et passe pour un exempté', async () => {
    const refus = fausseTransaction({ verifications: [{ resultat: 'libre', verifieeAt: A }] });
    await expect(
      exigerHorsReserve(
        portSousVerrou(refus.tx as never),
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).rejects.toMatchObject({ code: CODE_ENTREPRISE_RESERVEE });
    const passe = fausseTransaction({ verifications: [{ resultat: 'cliente', verifieeAt: A }] });
    await expect(
      exigerHorsReserve(
        portSousVerrou(passe.tx as never),
        { siren: '123456789', action: ACTION, nature: 'demarchage' },
        MAINTENANT
      )
    ).resolves.toBeUndefined();
  });
});
