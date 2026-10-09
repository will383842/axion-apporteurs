// @req REQ-JUR-029
/**
 * JUR-T64 — ouvrir et clore un litige sur une décision de contrat (juriste, #703 6041829569 ; forme
 * d'A02, #703 6041868006), jugés EN PROCESSUS sur un double de la transaction :
 *   — deux droits, administrateur seul, sous step-up ; le droit RELU en base dans la transaction ;
 *   — l'ouverture : un motif FERMÉ, refusée si un litige est déjà ouvert, si la décision est
 *     introuvable ou si son texte est effacé ; la ligne et son événement, dans la même transaction ;
 *   — la clôture : un motif FERMÉ, refusée s'il n'y a aucun litige ouvert ; écrite une fois, sous
 *     condition (un litige clos entre-temps n'est pas réécrit) ;
 *   — aucun texte libre, aucune notification à l'apporteur.
 * La base (naissance, ajout seul, index d'un seul ouvert, filet sur la purge) est jugée en base réelle
 * par `tests/integration/gel-litige-decisions-de-contrat.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const journal = vi.hoisted(() => ({ ajouterEvenement: vi.fn() }));
vi.mock('../../../src/server/evenement/journal', () => journal);

import {
  cloreUnLitige,
  ErreurLitige,
  ouvrirUnLitige,
} from '../../../src/server/console/litiges-des-decisions';
import { MATRICE_DES_ROLES } from '../../../src/server/roles/matrice';

const ADMIN = '0190f0c2-0000-7000-8000-0000000000a1';
const DECISION = '0190f0c2-0000-7000-8000-0000000000d1';
const APPORTEUR = '0190f0c2-0000-7000-8000-0000000000e1';
const LITIGE = '0190f0c2-0000-7000-8000-0000000000f1';
const MAINTENANT = new Date('2027-03-14T10:00:00.000Z');
const VALIDE = new Date('2026-09-01T00:00:00.000Z');

type Utilisateur = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

function unDouble(o: {
  utilisateur?: Utilisateur;
  decision?: { apporteurId: string; texteChiffre: Uint8Array | null } | null;
  ouvert?: { id: string } | null;
  clos?: number;
}) {
  const ecritures: string[] = [];
  const tx = {
    utilisateurConsole: {
      findUnique: vi.fn(async () =>
        o.utilisateur === undefined
          ? { role: 'admin', desactiveAt: null, valideAt: VALIDE }
          : o.utilisateur
      ),
    },
    decisionDeContrat: {
      findUnique: vi.fn(async () =>
        o.decision === undefined
          ? { apporteurId: APPORTEUR, texteChiffre: new Uint8Array([1]) }
          : o.decision
      ),
    },
    litigeDecisionDeContrat: {
      findFirst: vi.fn(async () => (o.ouvert === undefined ? null : o.ouvert)),
      create: vi.fn(async (arg: unknown) => {
        ecritures.push('create');
        return arg;
      }),
      updateMany: vi.fn(async () => {
        ecritures.push('update');
        return { count: o.clos ?? 1 };
      }),
    },
  };
  const prisma = { $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)) };
  return { prisma: prisma as never, tx, ecritures };
}

const motifDe = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurLitige) return e.motif;
    throw e;
  }
  return 'aucun refus';
};

const ouvrir = (d: ReturnType<typeof unDouble>, motif = 'mediation' as const) =>
  ouvrirUnLitige(d.prisma, {
    acteur: { id: ADMIN },
    decisionId: DECISION,
    motif,
    maintenant: MAINTENANT,
  });
const clore = (d: ReturnType<typeof unDouble>, motif = 'accord' as const) =>
  cloreUnLitige(d.prisma, {
    acteur: { id: ADMIN },
    decisionId: DECISION,
    motif,
    maintenant: MAINTENANT,
  });

beforeEach(() => {
  journal.ajouterEvenement.mockReset();
  journal.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
});

describe('REQ-JUR-029 — JUR-T64 : les droits du litige', () => {
  it('REQ-JUR-029 : TÉMOIN — ouvrir et clore : l’administrateur seul, sous step-up', () => {
    expect(MATRICE_DES_ROLES['action:ouvrir_litige_decision']).toEqual({
      roles: ['admin'],
      stepUp: true,
    });
    expect(MATRICE_DES_ROLES['action:clore_litige_decision']).toEqual({
      roles: ['admin'],
      stepUp: true,
    });
  });

  const T = new Date('2026-09-01T00:00:00Z');
  it.each([
    ['inconnu', null],
    ['désactivé', { role: 'admin', desactiveAt: T, valideAt: T }],
    ['au rôle retiré', { role: 'qualifieur', desactiveAt: null, valideAt: T }],
    ['administrateur non validé', { role: 'admin', desactiveAt: null, valideAt: null }],
  ] as const)(
    'REQ-JUR-029 : TÉMOIN — un compte %s n’ouvre ni ne clôt, et rien n’est écrit',
    async (_c, utilisateur) => {
      for (const geste of [ouvrir, clore]) {
        const d = unDouble({ utilisateur, ouvert: { id: LITIGE } });
        expect(await motifDe(geste(d))).toBe('droit_absent');
        expect(d.ecritures).toEqual([]);
        expect(journal.ajouterEvenement).not.toHaveBeenCalled();
      }
    }
  );
});

describe('REQ-JUR-029 — JUR-T64 : ouvrir un litige', () => {
  it('REQ-JUR-029 : TÉMOIN — la ligne naît OUVERTE avec son motif et son auteur, et son événement fermé suit, dans la même transaction', async () => {
    const d = unDouble({});
    const r = await ouvrir(d, 'action_en_justice' as never);
    expect(d.tx.litigeDecisionDeContrat.create).toHaveBeenCalledWith({
      data: {
        id: r.litigeId,
        decisionId: DECISION,
        motifOuverture: 'action_en_justice',
        ouvertParId: ADMIN,
      },
      select: { id: true },
    });
    expect(journal.ajouterEvenement).toHaveBeenCalledWith(d.tx, {
      type: 'decision_contrat_litige_modifie',
      agregat: 'apporteur',
      agregatId: APPORTEUR,
      survenuAt: MAINTENANT,
      charge: {
        geste: 'ouvrir',
        litigeId: r.litigeId,
        decisionContratId: DECISION,
        motif: 'action_en_justice',
        acteur: { par: 'utilisateur_console', id: ADMIN },
      },
    });
  });

  it('REQ-JUR-029 : TÉMOIN — un litige DÉJÀ ouvert : refusé, nommé, rien n’est écrit', async () => {
    const d = unDouble({ ouvert: { id: LITIGE } });
    expect(await motifDe(ouvrir(d))).toBe('deja_ouvert');
    expect(d.ecritures).toEqual([]);
  });

  it('REQ-JUR-029 : TÉMOIN — un texte EFFACÉ, ou une décision introuvable : refusé, nommé', async () => {
    expect(
      await motifDe(ouvrir(unDouble({ decision: { apporteurId: APPORTEUR, texteChiffre: null } })))
    ).toBe('texte_efface');
    expect(await motifDe(ouvrir(unDouble({ decision: null })))).toBe('decision_introuvable');
  });

  it('REQ-JUR-029 : un motif hors de la liste FERMÉE est refusé avant toute lecture', async () => {
    const d = unDouble({});
    expect(await motifDe(ouvrir(d, 'accord' as never))).toBe('motif_refuse');
    expect(d.tx.utilisateurConsole.findUnique).not.toHaveBeenCalled();
  });
});

describe('REQ-JUR-029 — JUR-T64 : clore un litige', () => {
  it('REQ-JUR-029 : TÉMOIN — la clôture s’écrit UNE fois, sous condition, avec son motif, sa date et son auteur, et son événement suit', async () => {
    const d = unDouble({ ouvert: { id: LITIGE } });
    expect(await clore(d, 'decision_definitive' as never)).toEqual({
      litigeId: LITIGE,
      closAt: MAINTENANT,
    });
    expect(d.tx.litigeDecisionDeContrat.updateMany).toHaveBeenCalledWith({
      where: { id: LITIGE, closAt: null },
      data: { motifCloture: 'decision_definitive', closAt: MAINTENANT, closParId: ADMIN },
    });
    expect(journal.ajouterEvenement).toHaveBeenCalledWith(d.tx, {
      type: 'decision_contrat_litige_modifie',
      agregat: 'apporteur',
      agregatId: APPORTEUR,
      survenuAt: MAINTENANT,
      charge: {
        geste: 'clore',
        litigeId: LITIGE,
        decisionContratId: DECISION,
        motif: 'decision_definitive',
        acteur: { par: 'utilisateur_console', id: ADMIN },
      },
    });
  });

  it('REQ-JUR-029 : TÉMOIN — aucun litige ouvert : refusé, nommé, rien n’est écrit', async () => {
    const d = unDouble({ ouvert: null });
    expect(await motifDe(clore(d))).toBe('aucun_litige');
    expect(d.ecritures).toEqual([]);
  });

  it('REQ-JUR-029 : TÉMOIN — un litige clos ENTRE-TEMPS n’est pas réécrit, ni journalisé', async () => {
    const d = unDouble({ ouvert: { id: LITIGE }, clos: 0 });
    expect(await motifDe(clore(d))).toBe('aucun_litige');
    expect(journal.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-JUR-029 : un motif d’ouverture à la clôture est refusé avant toute lecture', async () => {
    const d = unDouble({ ouvert: { id: LITIGE } });
    expect(await motifDe(clore(d, 'mediation' as never))).toBe('motif_refuse');
    expect(d.tx.utilisateurConsole.findUnique).not.toHaveBeenCalled();
  });
});
