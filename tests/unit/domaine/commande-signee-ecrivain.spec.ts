// @req REQ-DM-006
/**
 * DM-73 — l'écrivain de la commande signée et la désignation de son bénéficiaire, sur un client de
 * transaction SIMULÉ (la base réelle est au témoin `tests/integration/commande-sur-provisoire.spec.ts`).
 * Ce banc juge, à la valeur près, les refus nommés, l'ordre des faits, les requêtes et la lecture du
 * journal par son lecteur réservé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ajouterMoisParis, effetsDeTransition } from '../../../src/domain/attribution/machine';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  finDuContratAvecPreavis,
  finDuContratDeLaSortie,
} from '../../../src/domain/apporteur/effets-de-la-fin';
import { minuitDeParisDuJour } from '../../../src/domain/apporteur/resiliation';

const journalSimule = vi.hoisted(() => ({
  ajouterEvenement: vi.fn(async () => ({ id: '1', selfHash: 'x' })),
  dernieresTransitionsSurLeSiren: vi.fn(),
}));
vi.mock('../../../src/server/evenement/journal', () => journalSimule);

const ID = '0190f3a0-0000-7000-8000-0000000000a1';
const APPORTEUR = '0190f3a0-0000-7000-8000-0000000000b1';
const AUTRE = '0190f3a0-0000-7000-8000-0000000000b2';
const DEPOT = new Date('2026-10-01T08:00:00.000Z');
const SIGNE = new Date('2026-10-05T09:30:00.000Z');
const MAINTENANT = new Date('2026-10-07T14:00:00.000Z');
const SYSTEME = { par: 'systeme' } as const;

async function ecrivain() {
  return import('../../../src/server/attribution/transitionner');
}

/** Un client de transaction sur UNE ligne : le verrou la rend, `update` la modifie. */
function txSimule(statut: string, apporteurId: string | null = APPORTEUR) {
  const ligne = {
    statut,
    apporteur_id: apporteurId,
    lien_interet_declare: false,
    premier_contact_at: null,
    peremption_suspendue_at: null,
    confirmee_at: null as Date | null,
    fenetre_fin_at: null as Date | null,
    peremption_at: null,
  };
  const mises: { statut: string; confirmeeAt: Date | null; fenetreFinAt: Date | null }[] = [];
  const tx = {
    $queryRaw: async () => [{ ...ligne }],
    attribution: {
      update: async (arg: { data: (typeof mises)[number] }) => {
        mises.push(arg.data);
        ligne.statut = arg.data.statut;
        ligne.confirmee_at = arg.data.confirmeeAt;
        ligne.fenetre_fin_at = arg.data.fenetreFinAt;
        return {};
      },
      findUniqueOrThrow: async () => ({ deposeeAt: DEPOT }),
      findUnique: async () => null,
    },
    notificationEspace: { create: async () => ({}) },
  };
  return { tx: tx as never, mises };
}

const transitionsEcrites = () =>
  journalSimule.ajouterEvenement.mock.calls.map(
    (c) => (c as unknown as [unknown, { charge: { transition: string } }])[1].charge.transition
  );

async function refusDe(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string };
  }
  throw new Error('aucun refus');
}

beforeEach(() => {
  journalSimule.ajouterEvenement.mockClear();
  journalSimule.dernieresTransitionsSurLeSiren.mockReset();
});

describe('REQ-DM-006 — DM-73 : l’écrivain de la commande signée', () => {
  it('REQ-DM-006 : la confirmation par la commande ouvre la fenêtre de la SIGNATURE', () => {
    const t = effetsDeTransition(
      {
        premierContactAt: null,
        peremptionSuspendueAt: null,
        confirmeeAt: null,
        fenetreFinAt: null,
        peremptionAt: null,
      },
      'confirmee_par_la_commande',
      'active',
      MAINTENANT.getTime(),
      SIGNE.getTime()
    );
    expect(t.confirmeeAt).toBe(SIGNE.getTime());
    expect(t.fenetreFinAt).toBe(ajouterMoisParis(SIGNE.getTime(), SEUILS.FENETRE_MOIS.valeur));
  });

  it('REQ-DM-006 : sur une provisoire — confirmee_par_la_commande puis devis_signe, datés de la signature', async () => {
    const { tx, mises } = txSimule('provisoire');
    const { enregistrerLaCommandeSignee } = await ecrivain();
    const r = await enregistrerLaCommandeSignee(tx, {
      attributionId: ID,
      apporteurId: APPORTEUR,
      signeLe: SIGNE,
      acteur: SYSTEME,
      maintenant: MAINTENANT,
    });
    expect(r).toStrictEqual({ de: 'provisoire', vers: 'signee' });
    expect(transitionsEcrites()).toStrictEqual(['confirmee_par_la_commande', 'devis_signe']);
    expect(mises.map((m) => m.statut)).toStrictEqual(['active', 'signee']);
    expect(mises[0]!.confirmeeAt).toStrictEqual(SIGNE);
  });

  it('REQ-DM-006 : ailleurs, devis_signe seul ; une signature à l’instant du dépôt est admise', async () => {
    const { tx, mises } = txSimule('active');
    const { enregistrerLaCommandeSignee } = await ecrivain();
    const r = await enregistrerLaCommandeSignee(tx, {
      attributionId: ID,
      apporteurId: APPORTEUR,
      signeLe: DEPOT,
      acteur: SYSTEME,
      maintenant: MAINTENANT,
    });
    expect(r).toStrictEqual({ de: 'active', vers: 'signee' });
    expect(transitionsEcrites()).toStrictEqual(['devis_signe']);
    expect(mises).toHaveLength(1);
  });

  it('REQ-DM-006 : cloisonnement — un autre apporteur est refusé, nommé, sans écriture', async () => {
    const { tx, mises } = txSimule('provisoire');
    const { enregistrerLaCommandeSignee } = await ecrivain();
    const e = await refusDe(
      enregistrerLaCommandeSignee(tx, {
        attributionId: ID,
        apporteurId: AUTRE,
        signeLe: SIGNE,
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('porteur_refuse');
    expect(e.message).toBe(
      "porteur_refuse : commande signée : l'attribution n'est pas celle de cet apporteur"
    );
    expect(mises).toHaveLength(0);
    expect(transitionsEcrites()).toStrictEqual([]);
  });

  it('REQ-DM-006 : une commande signée avant le dépôt est refusée, nommée, sans écriture', async () => {
    const { tx, mises } = txSimule('provisoire');
    const { enregistrerLaCommandeSignee } = await ecrivain();
    const e = await refusDe(
      enregistrerLaCommandeSignee(tx, {
        attributionId: ID,
        apporteurId: APPORTEUR,
        signeLe: new Date(DEPOT.getTime() - 1),
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    expect(e.message).toBe(
      "commande_anterieure_a_l_occupation : commande signée avant le dépôt : elle ne profite pas à l'occupant suivant"
    );
    expect(mises).toHaveLength(0);
  });

  it('REQ-DM-006 : le conseiller (apporteur nul) ne confirme pas par la commande', async () => {
    const { tx, mises } = txSimule('provisoire', null);
    const { enregistrerLaCommandeSignee } = await ecrivain();
    const e = await refusDe(
      enregistrerLaCommandeSignee(tx, {
        attributionId: ID,
        apporteurId: null,
        signeLe: SIGNE,
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('refusee_au_porteur');
    expect(mises).toHaveLength(0);
  });

  it('REQ-DM-006 : la date de signature va avec confirmee_par_la_commande, et elle seule', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const sans = await refusDe(
      transitionnerUneAttribution(txSimule('provisoire').tx, {
        attributionId: ID,
        transition: 'confirmee_par_la_commande',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    expect(sans.message).toBe(
      'motif_incoherent : confirmee_par_la_commande : la date de signature est exigée pour confirmee_par_la_commande, et pour elle seule'
    );
    const avec = await refusDe(
      transitionnerUneAttribution(txSimule('provisoire').tx, {
        attributionId: ID,
        transition: 'confirmee',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
        confirmeeLe: SIGNE,
      })
    );
    expect(avec.code).toBe('motif_incoherent');
  });
});

describe('REQ-DM-006 — DM-73 : la désignation du bénéficiaire d’une commande', () => {
  const SIREN = '732829320';
  const FIN = new Date('2026-10-08T10:00:00.000Z');
  const SUIVANT = new Date(FIN.getTime() + 60_000);

  function txDeLecture(
    lignes: { id: string; apporteurId: string | null; statut: string; deposeeAt: Date }[],
    dateEffet: Date | null = null
  ) {
    const requetes: unknown[] = [];
    const tx = {
      attribution: {
        findMany: async (q: unknown) => {
          requetes.push(q);
          return lignes;
        },
      },
      decisionDeContrat: {
        findFirst: async (q: unknown) => {
          requetes.push(q);
          return dateEffet === null ? null : { dateEffet };
        },
      },
    };
    return { tx: tx as never, requetes };
  }

  const A = { id: 'a', apporteurId: APPORTEUR, statut: 'annulee', deposeeAt: DEPOT };
  const B = { id: 'b', apporteurId: AUTRE, statut: 'provisoire', deposeeAt: SUIVANT };

  it('REQ-DM-006 : la commande signée avant la fin va au résilié ; les requêtes sont celles du SIREN', async () => {
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([
      { attributionId: 'a', transition: 'fin_de_contrat', survenuAt: FIN },
    ]);
    const { tx, requetes } = txDeLecture([A, B]);
    const { attributionDUneCommandeSignee } = await ecrivain();
    expect(await attributionDUneCommandeSignee(tx, { siren: SIREN, signeLe: SIGNE })).toStrictEqual(
      {
        attributionId: 'a',
        apporteurId: APPORTEUR,
      }
    );
    expect(journalSimule.dernieresTransitionsSurLeSiren).toHaveBeenCalledWith(tx, SIREN);
    expect(requetes).toStrictEqual([
      {
        where: { siren: SIREN, statut: { not: 'en_attente' } },
        select: { id: true, apporteurId: true, statut: true, deposeeAt: true },
      },
      {
        where: { apporteurId: APPORTEUR, geste: 'resiliation' },
        orderBy: { creeAt: 'desc' },
        select: { dateEffet: true },
      },
    ]);
  });

  it('REQ-DM-006 : signée après la fin, elle va à l’occupant suivant ; avant son dépôt, à personne', async () => {
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([
      { attributionId: 'a', transition: 'fin_de_contrat', survenuAt: FIN },
    ]);
    const { attributionDUneCommandeSignee } = await ecrivain();
    expect(
      await attributionDUneCommandeSignee(txDeLecture([A, B]).tx, {
        siren: SIREN,
        signeLe: SUIVANT,
      })
    ).toStrictEqual({ attributionId: 'b', apporteurId: AUTRE });
    expect(
      await attributionDUneCommandeSignee(txDeLecture([A, B]).tx, { siren: SIREN, signeLe: FIN })
    ).toBeNull();
  });

  it('REQ-DM-006 : une attribution figée est sortie à sa fin ; une finie sans fait n’a droit à rien', async () => {
    const figee = { ...A, statut: 'figee_resiliation' };
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([
      { attributionId: 'a', transition: 'figee', survenuAt: FIN },
    ]);
    const { attributionDUneCommandeSignee } = await ecrivain();
    expect(
      await attributionDUneCommandeSignee(txDeLecture([figee]).tx, { siren: SIREN, signeLe: SIGNE })
    ).toStrictEqual({ attributionId: 'a', apporteurId: APPORTEUR });
    expect(
      await attributionDUneCommandeSignee(txDeLecture([figee]).tx, {
        siren: SIREN,
        signeLe: SUIVANT,
      })
    ).toBeNull();
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([]);
    expect(
      await attributionDUneCommandeSignee(txDeLecture([A]).tx, { siren: SIREN, signeLe: SIGNE })
    ).toBeNull();
  });

  it('REQ-DM-006 : après l’antériorité, aucun droit, et la résiliation n’est pas lue', async () => {
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([
      { attributionId: 'a', transition: 'anteriorite_etablie', survenuAt: FIN },
    ]);
    const { tx, requetes } = txDeLecture([A]);
    const { attributionDUneCommandeSignee } = await ecrivain();
    expect(await attributionDUneCommandeSignee(tx, { siren: SIREN, signeLe: SIGNE })).toBeNull();
    expect(requetes).toHaveLength(1);
  });

  it('REQ-DM-006 : un passage planifié tardif ne prolonge pas le contrat : la fin est celle du préavis', async () => {
    const jour = new Date('2026-10-08T00:00:00.000Z');
    const fin = finDuContratAvecPreavis(minuitDeParisDuJour('2026-10-08'));
    const passage = new Date(fin + 3_600_000);
    journalSimule.dernieresTransitionsSurLeSiren.mockResolvedValue([
      { attributionId: 'a', transition: 'fin_de_contrat', survenuAt: passage },
    ]);
    const { attributionDUneCommandeSignee } = await ecrivain();
    expect(
      finDuContratDeLaSortie({
        sortieAt: passage.getTime(),
        jourDEffet: minuitDeParisDuJour('2026-10-08'),
      })
    ).toBe(fin);
    expect(
      await attributionDUneCommandeSignee(txDeLecture([A], jour).tx, {
        siren: SIREN,
        signeLe: new Date(fin),
      })
    ).toBeNull();
    expect(
      await attributionDUneCommandeSignee(txDeLecture([A], jour).tx, {
        siren: SIREN,
        signeLe: new Date(fin - 1),
      })
    ).toStrictEqual({ attributionId: 'a', apporteurId: APPORTEUR });
  });
});

describe('REQ-DM-006 — DM-73 : le lecteur réservé du journal', () => {
  const vrai = () =>
    vi.importActual<typeof import('../../../src/server/evenement/journal')>(
      '../../../src/server/evenement/journal'
    );
  const charge = {
    de: 'provisoire',
    vers: 'annulee',
    transition: 'fin_de_contrat',
    acteur: { par: 'systeme' },
    lienInteret: 'non_declare',
  };

  it('REQ-DM-006 : il rend la transition et l’instant, jamais la charge, par une requête paramétrée', async () => {
    const appels: { sql: string; valeurs: unknown[] }[] = [];
    const le = new Date('2026-10-08T10:00:00.000Z');
    const client = {
      $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
        appels.push({ sql: gabarit.join('$').replace(/\s+/g, ' ').trim(), valeurs });
        return [{ id: 'a', survenu_at: le, charge }];
      },
    };
    const { dernieresTransitionsSurLeSiren } = await vrai();
    expect(await dernieresTransitionsSurLeSiren(client as never, '732829320')).toStrictEqual([
      { attributionId: 'a', transition: 'fin_de_contrat', survenuAt: le },
    ]);
    expect(appels).toStrictEqual([
      {
        sql:
          'SELECT a.id::text AS id, d.survenu_at, d.charge FROM attributions a JOIN LATERAL ( ' +
          "SELECT e.survenu_at, e.charge FROM evenements e WHERE e.type = 'attribution_etat_modifie' " +
          "AND e.agregat = 'attribution' AND e.agregat_id = a.id ORDER BY e.id DESC LIMIT 1 ) d ON true " +
          "WHERE a.siren = $ AND a.statut::text <> 'en_attente'",
        valeurs: ['732829320'],
      },
    ]);
  });

  it('REQ-DM-006 : une charge hors schéma LÈVE : la désignation échoue fermée', async () => {
    const client = {
      $queryRaw: async () => [{ id: 'a', survenu_at: new Date(), charge: { transition: 'x' } }],
    };
    const { dernieresTransitionsSurLeSiren } = await vrai();
    await expect(dernieresTransitionsSurLeSiren(client as never, '732829320')).rejects.toThrow(
      'lecture_du_journal_refusee : charge hors schéma'
    );
  });
});
