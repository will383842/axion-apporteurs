// @req REQ-DM-011
/**
 * DM-63 — les effets de la fin du contrat en phase 1 : les règles PURES, et le geste de la console.
 *
 * CE QU'IL PROUVE, SANS BASE (les effets sur de vraies lignes sont dans
 * `tests/integration/effets-de-la-fin-du-contrat.spec.ts`).
 *   1. L'arrivée de chaque état à la fin du contrat est DÉRIVÉE de la machine : `annulee`, `expiree`
 *      ou `figee_resiliation` selon l'état de départ, et seule la flèche `figee`, depuis `signee` ou
 *      `convertie`, mène à `figee_resiliation`.
 *   2. Le droit d'une commande se rattache à la COMMANDE : signée avant l'INSTANT de fin du contrat,
 *      elle ouvre droit quelle que soit la date de son encaissement ; à cet instant ou après, aucun.
 *   3. Le geste de résiliation en console est réservé à un rôle nommé, contrôlé côté serveur : un
 *      autre rôle est refusé, sans effet ; l'acteur journalisé est celui de la SESSION, jamais celui
 *      de la demande.
 */
import { describe, it, expect, vi } from 'vitest';
import { exigeLeStepUp } from '../../../src/server/roles/matrice';
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type EtatAttribution,
} from '../../../src/domain/attribution/machine';
import {
  ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT,
  etatApresFinDuContrat,
  finDuContratAvecPreavis,
  ouvreDroitALaCommission,
  sortieDeFinDeContrat,
  attributionDeLaCommande,
  finDuContratDeLaSortie,
  laCommandeTardiveOuvreDroit,
} from '../../../src/domain/apporteur/effets-de-la-fin';
import { dateEffetAtteinte, minuitDeParisDuJour } from '../../../src/domain/apporteur/resiliation';

// Un espion TRANSPARENT sur la source unique de l'instant de fin (RM-01) : il rend ce que rend
// l'original, et dit seulement qui l'appelle.
vi.mock('../../../src/domain/apporteur/effets-de-la-fin', async (importOriginal) => {
  const orig =
    await importOriginal<typeof import('../../../src/domain/apporteur/effets-de-la-fin')>();
  return { ...orig, finDuContratAvecPreavis: vi.fn(orig.finDuContratAvecPreavis) };
});

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

describe('REQ-DM-011 — le droit d’une commande à la fin du contrat (art. 11.1 bis et 12.3)', () => {
  const T = (iso: string) => Date.parse(iso);
  const droit = (commandeSigneeAt: string, finDuContrat: number) =>
    ouvreDroitALaCommission({ commandeSigneeAt: T(commandeSigneeAt), finDuContrat });

  it('REQ-DM-011 : TÉMOIN (1) hiver — préavis, jour d’effet le 3 novembre 2026 : la fin est minuit de Paris qui suit', () => {
    const fin = finDuContratAvecPreavis(T('2026-11-03T08:00:00.000Z'));
    expect(fin).toBe(T('2026-11-03T23:00:00.000Z'));
    expect(droit('2026-11-03T22:59:59.999Z', fin)).toBe(true);
    expect(droit('2026-11-03T23:00:00.000Z', fin)).toBe(false);
    expect(droit('2026-11-03T08:00:00.000Z', fin)).toBe(true);
  });

  it('REQ-DM-011 : TÉMOIN (1) été — préavis, jour d’effet le 3 juillet 2026', () => {
    const fin = finDuContratAvecPreavis(T('2026-07-03T08:00:00.000Z'));
    expect(fin).toBe(T('2026-07-03T22:00:00.000Z'));
    expect(droit('2026-07-03T21:59:59.999Z', fin)).toBe(true);
    expect(droit('2026-07-03T22:00:00.000Z', fin)).toBe(false);
  });

  it('REQ-DM-011 : TÉMOIN (2) — fin sans préavis : la fin est l’instant du passage à resilie', () => {
    const fin = T('2026-10-05T14:00:00.000Z');
    expect(droit('2026-10-05T13:59:59.999Z', fin)).toBe(true);
    expect(droit('2026-10-05T14:00:00.000Z', fin)).toBe(false);
    // Une signature connue au jour seulement est posée à minuit de Paris de ce jour.
    expect(droit('2026-10-04T22:00:00.000Z', fin)).toBe(true);
  });

  it('REQ-DM-011 : TÉMOIN — une commande signée bien après la fin n’ouvre aucun droit', () => {
    const fin = finDuContratAvecPreavis(T('2026-10-07T08:00:00.000Z'));
    expect(droit('2026-10-08T09:00:00.000Z', fin)).toBe(false);
    expect(droit('2027-03-01T09:00:00.000Z', fin)).toBe(false);
  });

  it('REQ-DM-011 : TÉMOIN — le droit ne lit AUCUNE fenêtre d’attribution ni date d’encaissement : une signature ancienne ouvre droit tant que la fin n’est pas atteinte, quelle que soit la date d’encaissement', () => {
    expect(droit('2026-05-01T10:00:00.000Z', T('2026-10-07T22:00:00.000Z'))).toBe(true);
  });
});

/** Un double : le test ne fabrique que ce que le code lit. */
const double = <T>(x: unknown): T => x as T;

const portsDe = (
  role: 'admin' | 'comptable' | 'qualifieur' | 'lecteur' | null,
  // Ouverte il y a cinq minutes : dans le délai de relèvement, que le step-up de SEC-66 exige désormais.
  creeAt = new Date('2026-10-07T07:55:00.000Z')
) => {
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
                creeAt,
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

const ID_ADMIN = '11111111-1111-4111-8111-111111111111';
const DEMANDE = {
  apporteurId: '22222222-2222-4222-8222-222222222222',
  motif: 'ordinaire_apporteur' as const,
  dateReception: new Date('2026-10-07T07:00:00.000Z'),
};

type LigneRelue = {
  role: string;
  desactiveAt: Date | null;
  valideAt: Date | null;
} | null;
const ADMIN_ACTIF: LigneRelue = {
  role: 'admin',
  desactiveAt: null,
  valideAt: new Date('2026-10-01T00:00:00.000Z'),
};

/** Le geste, avec une transaction dont la relecture de l'acteur rend `relue` ; rend ce que le code a fait. */
async function jouer(
  role: 'admin' | 'comptable' | 'qualifieur' | 'lecteur' | null,
  relue: LigneRelue,
  creeAt?: Date
) {
  const resilierUnApporteur = vi.fn(async (_tx: unknown, _demande: unknown) => ({
    de: 'signe',
    vers: 'resilie',
    jetonsRevoques: 0,
  }));
  vi.resetModules();
  vi.doMock('../../../src/server/apporteur/resiliation', () => ({ resilierUnApporteur }));
  const { resilierDepuisLaConsole } = await import('../../../src/server/apporteur/resilier');
  const findUnique = vi.fn(async (_a: unknown) => relue);
  const transaction = vi.fn(async (travail: (tx: unknown) => unknown) =>
    travail({ utilisateurConsole: { findUnique } })
  );
  const { jeton, ports } = portsDe(role, creeAt);
  const r = await resilierDepuisLaConsole(
    { role: ports, prisma: double({ $transaction: transaction }), cles: double({}) },
    // Un acteur glissé dans la demande ne compte pas : l'acteur est celui de la session.
    double({ ...DEMANDE, jeton, acteur: { par: 'utilisateur_console', id: 'pirate' } })
  );
  vi.doUnmock('../../../src/server/apporteur/resiliation');
  return { r, resilierUnApporteur, transaction, findUnique };
}

describe('REQ-DM-011 — le geste de résiliation en console est réservé à un rôle nommé', () => {
  it('REQ-DM-011 : TÉMOIN À DEUX FACES — chaque rôle sauf admin est refusé, sans transaction ouverte ; admin passe, avec SON identifiant pour acteur', async () => {
    for (const role of ['comptable', 'qualifieur', 'lecteur'] as const) {
      const j = await jouer(role, ADMIN_ACTIF);
      expect(j.r).toStrictEqual({ ok: false, motif: 'role_refuse' });
      expect(j.transaction).not.toHaveBeenCalled();
      expect(j.resilierUnApporteur).not.toHaveBeenCalled();
    }
    const sans = await jouer(null, ADMIN_ACTIF);
    expect(sans.r).toStrictEqual({ ok: false, motif: 'absente' });
    expect(sans.transaction).not.toHaveBeenCalled();

    const j = await jouer('admin', ADMIN_ACTIF);
    expect(j.r).toMatchObject({ ok: true, de: 'signe', vers: 'resilie' });
    expect(j.resilierUnApporteur).toHaveBeenCalledTimes(1);
    expect(j.resilierUnApporteur.mock.calls[0]![1]).toMatchObject({
      apporteurId: DEMANDE.apporteurId,
      motif: 'ordinaire_apporteur',
      acteur: { par: 'utilisateur_console', id: ID_ADMIN },
      maintenant: new Date('2026-10-07T08:00:00.000Z'),
    });
  });

  it('REQ-DM-011 : TÉMOIN — le droit est REJUGÉ dans la transaction : un administrateur désactivé entre requireRole et la transaction ne résilie rien', async () => {
    const j = await jouer('admin', {
      ...ADMIN_ACTIF!,
      desactiveAt: new Date('2026-10-07T07:59:59.000Z'),
    });
    expect(j.r).toStrictEqual({ ok: false, motif: 'desactive' });
    expect(j.findUnique.mock.calls[0]![0]).toMatchObject({ where: { id: ID_ADMIN } });
    expect(j.resilierUnApporteur).not.toHaveBeenCalled();
  });

  it('REQ-DM-011 : TÉMOIN — la relecture refuse aussi un rôle changé, un administrateur non validé et un compte disparu, sans écriture', async () => {
    const role = await jouer('admin', { ...ADMIN_ACTIF!, role: 'comptable' });
    expect(role.r).toStrictEqual({ ok: false, motif: 'role_refuse' });
    const nonValide = await jouer('admin', { ...ADMIN_ACTIF!, valideAt: null });
    expect(nonValide.r).toStrictEqual({ ok: false, motif: 'admin_en_attente' });
    const disparu = await jouer('admin', null);
    expect(disparu.r).toStrictEqual({ ok: false, motif: 'inconnue' });
    for (const j of [role, nonValide, disparu]) {
      expect(j.resilierUnApporteur).not.toHaveBeenCalled();
    }
  });

  it('REQ-DM-011 : TÉMOIN — le step-up est honoré : une session non relevée reçoit releve_requis, sans effet, le step-up étant posé par SEC-66 sur ce droit', async () => {
    // Ouverte depuis plus que le délai de relèvement (REQ-SEC-004).
    const ancienne = new Date('2026-10-07T06:00:00.000Z');
    const j = await jouer('admin', ADMIN_ACTIF, ancienne);
    // SEC-66 a posé le step-up sur ce droit (condition de la sécurité, #762, 6032378375) : ce témoin est strict.
    expect(exigeLeStepUp('action:resilier_apporteur')).toBe(true);
    expect(j.r).toStrictEqual({ ok: false, motif: 'releve_requis' });
    expect(j.transaction).not.toHaveBeenCalled();
    expect(j.resilierUnApporteur).not.toHaveBeenCalled();
  });
});

// @req REQ-JUR-015
describe('SEC-66 — la FIN du contrat vaut `dateEffetAtteinte` (rattrapage 122, #319, 6038679021)', () => {
  it('REQ-JUR-015 : TÉMOIN — `dateEffetAtteinte` bascule EXACTEMENT à `finDuContratAvecPreavis`, qu’elle appelle (source unique, RM-01), en hiver, en été et aux jours de changement d’heure', () => {
    for (const jour of ['2026-11-03', '2026-07-03', '2026-03-29', '2026-10-25']) {
      const fin = finDuContratAvecPreavis(minuitDeParisDuJour(jour));
      vi.mocked(finDuContratAvecPreavis).mockClear();
      expect(dateEffetAtteinte(jour, fin - 1)).toBe(false);
      expect(dateEffetAtteinte(jour, fin)).toBe(true);
      expect(vi.mocked(finDuContratAvecPreavis)).toHaveBeenCalled();
    }
  });
});

// @req REQ-DM-006
describe('REQ-DM-006 — DM-73 : la commande va à l’occupant de sa date de signature (art. 4.4, 12.3)', () => {
  const DEPOT = Date.UTC(2026, 9, 1, 8);
  const SIGNE = Date.UTC(2026, 9, 5, 9);
  const FIN = Date.UTC(2026, 9, 8, 10);
  const SUIVANT = FIN + 60_000;

  it('REQ-DM-006 : la fin vue de la sortie — l’instant de sortie, borné par la fin avec préavis', () => {
    expect(finDuContratDeLaSortie({ sortieAt: FIN, jourDEffet: null })).toBe(FIN);
    const jour = minuitDeParisDuJour('2026-10-08');
    const tardive = finDuContratAvecPreavis(jour) + 3_600_000;
    expect(finDuContratDeLaSortie({ sortieAt: tardive, jourDEffet: jour })).toBe(
      finDuContratAvecPreavis(jour)
    );
    expect(finDuContratDeLaSortie({ sortieAt: FIN, jourDEffet: jour })).toBe(FIN);
  });

  it('REQ-DM-006 : le droit tardif exige la fin de contrat, l’occupation à la signature et la signature avant la fin', () => {
    const c = { commandeSigneeAt: SIGNE, finDuContrat: FIN, occupeeDepuis: DEPOT };
    expect(laCommandeTardiveOuvreDroit({ ...c, sortie: 'fin_de_contrat' })).toBe(true);
    expect(laCommandeTardiveOuvreDroit({ ...c, sortie: 'fraude_etablie' })).toBe(false);
    expect(
      laCommandeTardiveOuvreDroit({ ...c, occupeeDepuis: SIGNE + 1, sortie: 'fin_de_contrat' })
    ).toBe(false);
    expect(
      laCommandeTardiveOuvreDroit({ ...c, commandeSigneeAt: FIN, sortie: 'fin_de_contrat' })
    ).toBe(false);
  });

  it('REQ-DM-006 : le résilié reçoit la commande signée avant la fin ; l’occupant suivant, jamais', () => {
    const resilie = { attributionId: 'a', occupeeDepuis: DEPOT, finDuContrat: FIN } as const;
    const suivant = {
      attributionId: 'b',
      occupeeDepuis: SUIVANT,
      sortie: null,
      finDuContrat: null,
    };
    expect(
      attributionDeLaCommande(SIGNE, [{ ...resilie, sortie: 'fin_de_contrat' }, suivant])
    ).toBe('a');
    expect(attributionDeLaCommande(SIGNE, [{ ...resilie, sortie: 'figee' }, suivant])).toBe('a');
    expect(
      attributionDeLaCommande(SUIVANT + 1, [{ ...resilie, sortie: 'fin_de_contrat' }, suivant])
    ).toBe('b');
  });

  it('REQ-DM-006 : aucune attribution n’y a droit après l’antériorité, la fraude, ou sans fin connue', () => {
    expect(
      attributionDeLaCommande(SIGNE, [
        {
          attributionId: 'a',
          occupeeDepuis: DEPOT,
          sortie: 'anteriorite_etablie',
          finDuContrat: FIN,
        },
      ])
    ).toBeNull();
    expect(
      attributionDeLaCommande(SIGNE, [
        { attributionId: 'a', occupeeDepuis: DEPOT, sortie: 'perimee', finDuContrat: null },
      ])
    ).toBeNull();
    expect(attributionDeLaCommande(SIGNE, [])).toBeNull();
  });
});
