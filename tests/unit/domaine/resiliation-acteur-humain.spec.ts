// @req REQ-JUR-042
// @req REQ-DM-011
// @req REQ-SEC-032
// @req REQ-SEC-003
// @req REQ-SEC-005
/**
 * SEC-19 — la résiliation et ce qu'elle ne peut JAMAIS être : une sanction de l'inactivité.
 *
 * REQ-JUR-042 (verrou produit, arrêté par Will le 2026-09-03) : aucun motif de résiliation ne nomme
 * l'inactivité, la dormance, l'activité ni l'absence de dépôt — ni en liste, ni en texte libre. Le
 * cliquet de l'enum lui-même (égal à REQ-DM-011 et au schéma) vit dans
 * `apporteur-matrice-et-statuts.spec.ts` ; ce fichier tient le verrou lexical, avec son contre-témoin.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MOTIFS_RESILIATION } from '../../../src/domain/apporteur/statut';

/** Les formes d'un motif d'inactivité, en minuscules et sans accents. */
const INACTIVITE = /inactiv|dormant|dormance|activite|absence|sans_depot|aucun_depot|silence/;

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const motifsDInactivite = (motifs: readonly string[]) =>
  motifs.filter((m) => INACTIVITE.test(sansAccents(m)));

describe('REQ-JUR-042 — aucun motif de résiliation ne nomme l’inactivité', () => {
  it('REQ-JUR-042 : TÉMOIN — les motifs de résiliation sont exactement les quatre de REQ-DM-011, aucun d’inactivité', () => {
    expect([...MOTIFS_RESILIATION]).toEqual([
      'ordinaire_apporteur',
      'ordinaire_axion',
      'manquement_grave',
      'fin_de_plein_droit',
    ]);
    expect(motifsDInactivite(MOTIFS_RESILIATION)).toEqual([]);
  });

  it('REQ-JUR-042 : contre-témoin — un motif d’inactivité, quelle que soit sa forme, est NOMMÉ', () => {
    expect(
      motifsDInactivite([
        'manquement_grave',
        'inactivite_prolongee',
        'apporteur_dormant',
        'absence_de_depot',
        'Inactivité',
      ])
    ).toEqual(['inactivite_prolongee', 'apporteur_dormant', 'absence_de_depot', 'Inactivité']);
  });
});

/**
 * Le CŒUR de la transaction de résiliation, en processus (client simulé) : le verrou de la ligne,
 * la matrice, le statut et son motif, l'incrément de `sessionVersion`, l'événement par l'écrivain
 * unique, la révocation des jetons — et un acteur HUMAIN seulement (garde GATE-JUR-ACTEUR-HUMAIN).
 */
const journalSimule = vi.hoisted(() => ({ ajouterEvenement: vi.fn() }));
vi.mock('../../../src/server/evenement/journal', () => journalSimule);

const ID = '0190f0a0-0000-7000-8000-0000000000a1';
const MAINTENANT = new Date('2027-03-01T09:00:00.000Z');
const CONSOLE = { par: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-0000000000c1' } as const;

function txSimule(statutInitial: string) {
  let statut = statutInitial;
  const ordre: string[] = [];
  const mises: unknown[] = [];
  const revocations: unknown[] = [];
  const tx = {
    $queryRaw: async () => {
      ordre.push('verrou');
      return [{ statut }];
    },
    apporteur: {
      update: async (q: { data: { statut?: string } }) => {
        ordre.push('apporteur.update');
        mises.push(q);
        if (q.data.statut) statut = q.data.statut;
        return {};
      },
    },
    jetonDepot: {
      updateMany: async (q: unknown) => {
        ordre.push('jetons');
        revocations.push(q);
        return { count: 1 };
      },
    },
  };
  return { tx: tx as never, ordre, mises, revocations };
}

async function refusDe(p: Promise<unknown>): Promise<{ code: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code: string };
  }
  throw new Error('aucun refus');
}

describe('REQ-SEC-032 — la transaction de résiliation : statut, sessions, journal, jetons', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
  });

  it('REQ-SEC-032 : TÉMOIN — signe → resilie, motif posé, sessionVersion incrémentée, événement écrit, jetons révoqués, dans cet ordre', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe');
    const r = await resilierUnApporteur(t.tx, {
      apporteurId: ID,
      motif: 'ordinaire_axion',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    expect(r).toMatchObject({ de: 'signe', vers: 'resilie' });
    expect(t.mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'resilie',
          resiliationMotif: 'ordinaire_axion',
          sessionVersion: { increment: 1 },
        },
      },
    ]);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![1]).toMatchObject({
      type: 'apporteur_statut_modifie',
      agregat: 'apporteur',
      agregatId: ID,
      survenuAt: MAINTENANT,
      charge: {
        de: 'signe',
        vers: 'resilie',
        transition: 'resilier',
        resiliationMotif: 'ordinaire_axion',
        acteur: CONSOLE,
      },
    });
    expect(t.revocations).toStrictEqual([
      { where: { apporteurId: ID, revoqueAt: null }, data: { revoqueAt: MAINTENANT } },
    ]);
    expect(t.ordre[0]).toBe('verrou');
    expect(t.ordre.indexOf('apporteur.update')).toBeLessThan(t.ordre.indexOf('jetons'));
  });

  it('REQ-SEC-032 : une suspension se résilie aussi ; un statut sans flèche est refusé, et rien n’est écrit', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const depuisSuspendu = txSimule('suspendu');
    await resilierUnApporteur(depuisSuspendu.tx, {
      apporteurId: ID,
      motif: 'manquement_grave',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
    });
    expect(depuisSuspendu.mises).toHaveLength(1);
    const deja = txSimule('resilie');
    const e = await refusDe(
      resilierUnApporteur(deja.tx, {
        apporteurId: ID,
        motif: 'ordinaire_axion',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('transition_refusee');
    expect(deja.mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).toHaveBeenCalledTimes(1);
  });

  it('REQ-JUR-042 : TÉMOIN (acteur humain) — une résiliation par le SYSTÈME est refusée, nommée, et rien n’est écrit', async () => {
    const { resilierUnApporteur } = await import('../../../src/server/apporteur/resiliation');
    const t = txSimule('signe');
    const SYSTEME = { par: 'systeme' };
    const e = await refusDe(
      resilierUnApporteur(t.tx, {
        apporteurId: ID,
        motif: 'ordinaire_axion',
        acteur: SYSTEME as never,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('acteur_non_humain');
    expect(t.ordre).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });
});
