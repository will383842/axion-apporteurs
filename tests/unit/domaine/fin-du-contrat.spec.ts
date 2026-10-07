// @req REQ-DM-011
// @req REQ-SEC-023
/**
 * DM-63 — les effets de la fin du contrat en phase 1 : les règles PURES, et le geste de la console.
 *
 * CE QU'IL PROUVE, SANS BASE (les effets sur de vraies lignes sont dans
 * `tests/integration/effets-de-la-fin-du-contrat.spec.ts`).
 *   1. L'arrivée de chaque état à la fin du contrat est DÉRIVÉE de la machine : `annulee`, `expiree`
 *      ou `figee_resiliation` selon l'état de départ, et seule la flèche `figee`, depuis `signee` ou
 *      `convertie`, mène à `figee_resiliation`.
 *   2. Le droit d'une commande se rattache à la COMMANDE : signée avant la date d'effet, elle ouvre
 *      droit quelle que soit la date de son encaissement ; signée à la date d'effet ou après, aucun.
 *   3. Le geste de résiliation en console est réservé à un rôle nommé, contrôlé côté serveur : un
 *      autre rôle est refusé, sans effet ; l'acteur journalisé est celui de la SESSION, jamais celui
 *      de la demande.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type EtatAttribution,
} from '../../../src/domain/attribution/machine';
import {
  ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT,
  etatApresFinDuContrat,
  ouvreDroitALaCommission,
  sortieDeFinDeContrat,
} from '../../../src/domain/apporteur/fin-du-contrat';

const A_ANNULER: readonly EtatAttribution[] = ['en_attente', 'provisoire'];
const A_FAIRE_EXPIRER: readonly EtatAttribution[] = ['active', 'rdv_pris', 'proposition'];
const A_FIGER: readonly EtatAttribution[] = ['signee', 'convertie'];

describe('REQ-DM-011 — l’arrivée de chaque état à la fin du contrat', () => {
  it('REQ-DM-011 : TÉMOIN — annulee, expiree ou figee_resiliation selon l’état de départ', () => {
    for (const e of A_ANNULER) expect(etatApresFinDuContrat(e)).toBe('annulee');
    for (const e of A_FAIRE_EXPIRER) expect(etatApresFinDuContrat(e)).toBe('expiree');
    for (const e of A_FIGER) expect(etatApresFinDuContrat(e)).toBe('figee_resiliation');
  });

  it('REQ-DM-011 : TÉMOIN — seule la flèche figee, depuis signee ou convertie, mène à figee_resiliation', () => {
    const quiMenent = ETATS_ATTRIBUTION.flatMap((de) =>
      Object.entries(TRANSITIONS_ATTRIBUTION[de])
        .filter(([, vers]) => vers === 'figee_resiliation')
        .map(([transition]) => `${de}:${transition}`)
    );
    expect(quiMenent.sort()).toStrictEqual(['convertie:figee', 'signee:figee']);
    for (const e of A_FIGER) expect(sortieDeFinDeContrat(e)).toBe('figee');
    for (const e of [...A_ANNULER, ...A_FAIRE_EXPIRER]) {
      expect(sortieDeFinDeContrat(e)).toBe('fin_de_contrat');
    }
  });

  it('REQ-DM-011 : TÉMOIN — la liste à traiter est DÉRIVÉE de la machine, et un état final ou déjà figé n’y est pas', () => {
    expect([...ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT].sort()).toStrictEqual(
      [...A_ANNULER, ...A_FAIRE_EXPIRER, ...A_FIGER].sort()
    );
    for (const e of [
      'figee_resiliation',
      'invalidee',
      'perdue',
      'perimee',
      'expiree',
      'annulee',
    ] as const) {
      expect(sortieDeFinDeContrat(e)).toBeNull();
      expect(etatApresFinDuContrat(e)).toBe(e);
    }
  });
});

describe('REQ-DM-011 — le droit d’une commande à la fin du contrat (art. 12.3)', () => {
  const EFFET = Date.parse('2026-10-07T08:00:00.000Z');

  it('REQ-DM-011 : TÉMOIN — une commande signée AVANT la date d’effet ouvre droit', () => {
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-10-06T21:59:59Z'),
        dateEffet: EFFET,
      })
    ).toBe(true);
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-01-02T10:00:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(true);
  });

  it('REQ-DM-011 : TÉMOIN — une commande signée à la date d’effet ou APRÈS n’ouvre aucun droit', () => {
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-10-07T09:00:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(false);
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-10-08T09:00:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(false);
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2027-03-01T09:00:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(false);
  });

  it('REQ-DM-011 : TÉMOIN — la borne est le jour civil de Paris, non le jour UTC', () => {
    // 2026-10-06 23:30 UTC est le 7 octobre à 01 h 30 à Paris : le jour d'effet, donc sans droit.
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-10-06T23:30:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(false);
    // 2026-10-06 21:30 UTC est le 6 octobre à 23 h 30 à Paris : la veille, donc avec droit.
    expect(
      ouvreDroitALaCommission({
        commandeSigneeAt: Date.parse('2026-10-06T21:30:00Z'),
        dateEffet: EFFET,
      })
    ).toBe(true);
  });

  it('REQ-DM-011 : TÉMOIN — le droit ne lit AUCUNE fenêtre d’attribution ni date d’encaissement : sa signature ne les porte pas', () => {
    // Le droit se rattache à la commande : la fonction n'accepte que sa signature et la date d'effet.
    expect(ouvreDroitALaCommission.length).toBe(1);
    const droit = ouvreDroitALaCommission({
      commandeSigneeAt: Date.parse('2026-05-01T10:00:00Z'),
      dateEffet: EFFET,
    });
    expect(droit).toBe(true);
  });
});

/** Un double : le test ne fabrique que ce que le code lit. */
const double = <T>(x: unknown): T => x as T;

const portsDe = (role: 'admin' | 'comptable' | 'qualifieur' | 'lecteur' | null) => {
  const jetonValide = 'jeton-de-console';
  return {
    jeton: role === null ? undefined : jetonValide,
    ports: {
      maintenant: () => new Date('2026-10-07T08:00:00.000Z'),
      configuration: { secret: 'x'.repeat(48), kid: 'k1' },
      depot: {
        lire: vi.fn(async () =>
          role === null
            ? null
            : {
                kid: 'k1',
                expireAt: new Date('2026-10-08T08:00:00.000Z'),
                revoqueAt: null,
                derniereVueAt: new Date('2026-10-07T07:59:00.000Z'),
                creeAt: new Date('2026-10-07T07:30:00.000Z'),
                sessionVersion: 1,
                utilisateurConsole: {
                  id: '11111111-1111-4111-8111-111111111111',
                  role,
                  desactiveAt: null,
                  sessionVersion: 1,
                  valideAt: new Date('2026-10-01T00:00:00.000Z'),
                },
              }
        ),
      },
    },
  };
};

describe('REQ-SEC-023 — le geste de résiliation en console est réservé à un rôle nommé', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — chaque rôle sauf admin est refusé, sans transaction ouverte ; admin passe, avec SON identifiant pour acteur', async () => {
    const resilierUnApporteur = vi.fn(async (_tx: unknown, _demande: unknown) => ({
      de: 'signe',
      vers: 'resilie',
      jetonsRevoques: 0,
    }));
    vi.resetModules();
    vi.doMock('../../../src/server/apporteur/resiliation', () => ({ resilierUnApporteur }));
    const { resilierDepuisLaConsole } = await import('../../../src/server/apporteur/resilier');
    const transaction = vi.fn(async (travail: (tx: unknown) => unknown) => travail({}));
    const demande = {
      apporteurId: '22222222-2222-4222-8222-222222222222',
      motif: 'ordinaire_apporteur' as const,
      dateReception: new Date('2026-10-07T07:00:00.000Z'),
    };
    for (const role of ['comptable', 'qualifieur', 'lecteur'] as const) {
      const { jeton, ports } = portsDe(role);
      const r = await resilierDepuisLaConsole(
        { role: ports, prisma: double({ $transaction: transaction }), cles: double({}) },
        { ...demande, jeton }
      );
      expect(r).toStrictEqual({ ok: false, motif: 'role_refuse' });
    }
    const { jeton: sansJeton, ports: sansSession } = portsDe(null);
    expect(
      await resilierDepuisLaConsole(
        { role: sansSession, prisma: double({ $transaction: transaction }), cles: double({}) },
        { ...demande, jeton: sansJeton }
      )
    ).toStrictEqual({ ok: false, motif: 'absente' });
    expect(transaction).not.toHaveBeenCalled();
    expect(resilierUnApporteur).not.toHaveBeenCalled();

    const { jeton, ports } = portsDe('admin');
    const r = await resilierDepuisLaConsole(
      { role: ports, prisma: double({ $transaction: transaction }), cles: double({}) },
      // Un acteur glissé dans la demande ne compte pas : l'acteur est celui de la session.
      double({ ...demande, jeton, acteur: { par: 'utilisateur_console', id: 'pirate' } })
    );
    expect(r).toMatchObject({ ok: true, de: 'signe', vers: 'resilie' });
    expect(resilierUnApporteur).toHaveBeenCalledTimes(1);
    expect(resilierUnApporteur.mock.calls[0]![1]).toMatchObject({
      apporteurId: demande.apporteurId,
      motif: 'ordinaire_apporteur',
      acteur: { par: 'utilisateur_console', id: '11111111-1111-4111-8111-111111111111' },
      maintenant: new Date('2026-10-07T08:00:00.000Z'),
    });
    vi.doUnmock('../../../src/server/apporteur/resiliation');
  });
});
