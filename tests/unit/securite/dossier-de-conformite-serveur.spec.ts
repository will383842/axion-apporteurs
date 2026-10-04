// @req REQ-DM-027
// @req REQ-SEC-023
/**
 * Le dossier de conformité côté serveur (CPL-T07), EN PROCESSUS : les gestes de `dossier.ts` sur un
 * faux client (le journal est un espion), et les actions de l'écran avec des doubles de Next et du
 * juge des rôles. La base réelle (index des pièces courantes, déclencheurs) est jugée par
 * `tests/integration/dossier-de-conformite.spec.ts` ; ce témoin-ci existe pour que la passe de
 * mutation juge ces modules, puisqu'elle ne charge pas l'intégration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const h = vi.hoisted(() => {
  class Redirection extends Error {
    constructor(readonly vers: string) {
      super(`redirection ${vers}`);
    }
  }
  const MAINTENANT = 1_803_031_200_000;
  return {
    Redirection,
    MAINTENANT,
    D: { prisma: { nom: 'prisma' }, env: {}, horloge: { maintenant: () => MAINTENANT } },
    jeton: { valeur: 'JETON' as string | undefined },
  };
});

vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) =>
      nom === 'session_console' && h.jeton.valeur !== undefined
        ? { value: h.jeton.valeur }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((vers: string) => {
    throw new h.Redirection(vers);
  }),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('../../../src/server/roles/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('../../../src/server/auth/lien-magique-production', () => ({
  COOKIE_DE_SESSION_CONSOLE: { nom: 'session_console' },
  dependancesDuProcessus: vi.fn(() => h.D),
  portsDeRoleConsole: vi.fn(() => ({ ports: 'console' })),
}));
vi.mock('../../../src/server/conformite/dossier', async (original) => {
  const vrai = await original<typeof import('../../../src/server/conformite/dossier')>();
  return {
    ...vrai,
    verifierUnePiece: vi.fn(),
    ouvrirLeKyc: vi.fn(),
    validerLeKyc: vi.fn(),
    // Les gestes RÉELS, pour les témoins du dossier.
    reels: {
      verifierUnePiece: vrai.verifierUnePiece,
      ouvrirLeKyc: vrai.ouvrirLeKyc,
      validerLeKyc: vrai.validerLeKyc,
      lireLeDossier: vrai.lireLeDossier,
    },
  };
});

import { ajouterEvenement } from '../../../src/server/evenement/journal';
import { requireRole, type MotifDeRefusConsole } from '../../../src/server/roles/require-role';
import * as Dossier from '../../../src/server/conformite/dossier';
import {
  ouvrirLeDossier,
  validerLeDossier,
  verifierLaPiece,
} from '../../../src/server/console/conformite/actions';

const R = (
  Dossier as unknown as {
    reels: Pick<
      typeof Dossier,
      'verifierUnePiece' | 'ouvrirLeKyc' | 'validerLeKyc' | 'lireLeDossier'
    >;
  }
).reels;
const { ErreurDossierDeConformite } = Dossier;
const MAINTENANT = new Date(h.MAINTENANT);
const QUALIFIEUR = { id: '0190f0f0-0000-7000-8000-0000000000b1', role: 'qualifieur' as const };
const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' as const };
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000e1';
const PIECE = '0190f0f0-0000-7000-8000-0000000000f1';
const AUTRE = '0190f0f0-0000-7000-8000-0000000000f2';

type Piece = {
  id: string;
  apporteurId: string;
  type: 'siret' | 'tva' | 'rib' | 'identite' | 'vigilance' | 'rc_pro';
  statut: 'manquante' | 'a_verifier' | 'valide' | 'perimee' | 'refusee';
  expireAt: Date | null;
  remplaceeAt: Date | null;
  verifieeAt: Date | null;
};
const piece = (o: Partial<Piece>): Piece => ({
  id: PIECE,
  apporteurId: APPORTEUR,
  type: 'siret',
  statut: 'a_verifier',
  expireAt: null,
  remplaceeAt: null,
  verifieeAt: null,
  ...o,
});

/** Un faux client : les pièces, l'apporteur, l'identité de facturation, et ce qui est écrit. */
function univers(
  o: {
    pieces?: Piece[];
    courante?: boolean;
    ecrites?: number;
    statut?: string | null;
    avancees?: number;
    regimeTva?: 'assujetti' | 'franchise_293b' | null;
  } = {}
) {
  const appels: { quoi: string; args: unknown }[] = [];
  const pieces = o.pieces ?? [];
  const tx = {
    pieceKyc: {
      findUnique: async (a: { where: { id: string } }) => {
        appels.push({ quoi: 'piece.findUnique', args: a });
        return pieces.find((p) => p.id === a.where.id) ?? null;
      },
      findFirst: async (a: unknown) => {
        appels.push({ quoi: 'piece.findFirst', args: a });
        return o.courante ? { id: AUTRE } : null;
      },
      findMany: async () => pieces,
      update: async (a: unknown) => {
        appels.push({ quoi: 'piece.update', args: a });
        return a;
      },
      updateMany: async (a: unknown) => {
        appels.push({ quoi: 'piece.updateMany', args: a });
        return { count: o.ecrites ?? 1 };
      },
    },
    apporteur: {
      findUnique: async (a: unknown) => {
        appels.push({ quoi: 'apporteur.findUnique', args: a });
        return o.statut === null || o.statut === undefined
          ? null
          : { id: APPORTEUR, statut: o.statut };
      },
      updateMany: async (a: unknown) => {
        appels.push({ quoi: 'apporteur.updateMany', args: a });
        return { count: o.avancees ?? 1 };
      },
    },
    identiteFacturation: {
      findFirst: async (a: unknown) => {
        appels.push({ quoi: 'identite.findFirst', args: a });
        return o.regimeTva ? { siren: '552100554', regimeTva: o.regimeTva } : null;
      },
    },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  const ecrit = (quoi: string) => appels.filter((a) => a.quoi === quoi).map((a) => a.args);
  return { client, appels, ecrit };
}

const evenement = () => vi.mocked(ajouterEvenement);

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurDossierDeConformite)
      return e.manquantes.length ? `${e.motif}:${e.manquantes.join(',')}` : e.motif;
    throw e;
  }
  throw new Error('aucun refus');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.jeton.valeur = 'JETON';
});

describe('REQ-DM-027 — vérifier une pièce', () => {
  const verifier = (
    u: ReturnType<typeof univers>,
    verdict: Dossier.VerdictDePiece,
    acteur: Dossier.ActeurDuDossier = QUALIFIEUR
  ) => R.verifierUnePiece(u.client, { acteur, pieceId: PIECE, verdict, maintenant: MAINTENANT });

  it('REQ-DM-027 : TÉMOIN — valider : la pièce lue par son identifiant, écrite VALIDE à l’instant, l’événement exact ; aucune ancienne à écarter', async () => {
    const u = univers({ pieces: [piece({})] });
    await verifier(u, { decision: 'valider' });
    expect(u.ecrit('piece.findUnique')).toEqual([
      {
        where: { id: PIECE },
        select: { id: true, apporteurId: true, type: true, statut: true, expireAt: true },
      },
    ]);
    expect(u.ecrit('piece.findFirst')).toEqual([
      {
        where: {
          apporteurId: APPORTEUR,
          type: 'siret',
          remplaceeAt: null,
          statut: { not: 'a_verifier' },
          id: { not: PIECE },
        },
        select: { id: true },
      },
    ]);
    expect(u.ecrit('piece.update')).toEqual([]);
    expect(u.ecrit('piece.updateMany')).toEqual([
      {
        where: { id: PIECE, statut: 'a_verifier' },
        data: { statut: 'valide', verifieeAt: MAINTENANT },
      },
    ]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([
      {
        type: 'piece_kyc_statut_modifie',
        agregat: 'piece_kyc',
        agregatId: PIECE,
        survenuAt: MAINTENANT,
        charge: {
          de: 'a_verifier',
          vers: 'valide',
          type: 'siret',
          acteur: { par: 'utilisateur_console', id: QUALIFIEUR.id },
        },
      },
    ]);
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — à côté d’une courante : valider écarte l’ANCIENNE, refuser écarte la REFUSÉE', async () => {
    const v = univers({ pieces: [piece({})], courante: true });
    await verifier(v, { decision: 'valider' });
    expect(v.ecrit('piece.update')).toEqual([
      { where: { id: AUTRE }, data: { remplaceeAt: MAINTENANT } },
    ]);
    const r = univers({ pieces: [piece({})], courante: true });
    await verifier(r, { decision: 'refuser', motif: 'illisible' });
    expect(r.ecrit('piece.update')).toEqual([]);
    expect(r.ecrit('piece.updateMany')).toEqual([
      {
        where: { id: PIECE, statut: 'a_verifier' },
        data: { statut: 'refusee', verifieeAt: MAINTENANT, remplaceeAt: MAINTENANT },
      },
    ]);
    expect(evenement().mock.calls.at(-1)![1].charge).toEqual({
      de: 'a_verifier',
      vers: 'refusee',
      type: 'siret',
      motifRefus: 'illisible',
      acteur: { par: 'utilisateur_console', id: QUALIFIEUR.id },
    });
    // Sans courante, la refusée reste la courante.
    const s = univers({ pieces: [piece({})] });
    await verifier(s, { decision: 'refuser', motif: 'perimee' });
    expect(s.ecrit('piece.updateMany')[0]).toEqual({
      where: { id: PIECE, statut: 'a_verifier' },
      data: { statut: 'refusee', verifieeAt: MAINTENANT },
    });
  });

  it('REQ-DM-027 : TÉMOIN — les refus nommés, sans écriture ni événement', async () => {
    const cas: [Parameters<typeof univers>[0], Dossier.VerdictDePiece, string][] = [
      [{ pieces: [] }, { decision: 'valider' }, 'introuvable'],
      [{ pieces: [piece({ type: 'rib' })] }, { decision: 'valider' }, 'rib_hors_de_ce_geste'],
      [
        { pieces: [piece({ type: 'rib' })] },
        { decision: 'refuser', motif: 'illisible' },
        'rib_hors_de_ce_geste',
      ],
      [{ pieces: [piece({ statut: 'valide' })] }, { decision: 'valider' }, 'piece_pas_a_verifier'],
      [{ pieces: [piece({})], ecrites: 0 }, { decision: 'valider' }, 'piece_pas_a_verifier'],
      [{ pieces: [piece({ type: 'rc_pro' })] }, { decision: 'valider' }, 'echeance_passee'],
      [
        { pieces: [piece({ type: 'rc_pro', expireAt: MAINTENANT })] },
        { decision: 'valider' },
        'echeance_passee',
      ],
      [
        { pieces: [piece({ type: 'vigilance', expireAt: new Date(h.MAINTENANT - 1) })] },
        { decision: 'valider' },
        'echeance_passee',
      ],
    ];
    for (const [o, verdict, attendu] of cas) {
      const u = univers(o);
      expect(await motif(verifier(u, verdict)), attendu).toBe(attendu);
    }
    expect(evenement()).not.toHaveBeenCalled();
    // Une RC pro à jour se valide ; une pièce échue se REFUSE (le refus ne regarde pas l'échéance).
    const ajour = univers({
      pieces: [piece({ type: 'rc_pro', expireAt: new Date(h.MAINTENANT + 1) })],
    });
    await verifier(ajour, { decision: 'valider' });
    const echue = univers({ pieces: [piece({ type: 'rc_pro' })] });
    await verifier(echue, { decision: 'refuser', motif: 'perimee' });
    expect(evenement()).toHaveBeenCalledTimes(2);
    // Le droit est demandé avant toute transaction.
    const lecteur = univers({ pieces: [piece({})] });
    expect(
      await motif(
        verifier(lecteur, { decision: 'valider' }, { id: QUALIFIEUR.id, role: 'lecteur' })
      )
    ).toBe('droit_absent');
    expect(lecteur.appels).toEqual([]);
  });

  it('REQ-DM-027 : l’erreur se nomme, et nomme les pièces manquantes', () => {
    expect(new ErreurDossierDeConformite('introuvable').message).toBe(
      'dossier_de_conformite : introuvable'
    );
    const e = new ErreurDossierDeConformite('pieces_manquantes', ['siret', 'rc_pro']);
    expect([e.name, e.message, e.motif, e.manquantes]).toEqual([
      'ErreurDossierDeConformite',
      'dossier_de_conformite : pieces_manquantes (siret, rc_pro)',
      'pieces_manquantes',
      ['siret', 'rc_pro'],
    ]);
  });
});

describe('REQ-DM-027 — ouvrir et valider le dossier', () => {
  it('REQ-DM-027 : TÉMOIN À DEUX FACES — ouvrir : retenu passe à kyc_en_cours, écrit sous condition du statut lu, avec l’événement ; un autre statut est refusé', async () => {
    const u = univers({ statut: 'retenu' });
    await R.ouvrirLeKyc(u.client, {
      acteur: ADMIN,
      apporteurId: APPORTEUR,
      maintenant: MAINTENANT,
    });
    expect(u.ecrit('apporteur.findUnique')).toEqual([
      { where: { id: APPORTEUR }, select: { statut: true } },
    ]);
    expect(u.ecrit('apporteur.updateMany')).toEqual([
      { where: { id: APPORTEUR, statut: 'retenu' }, data: { statut: 'kyc_en_cours' } },
    ]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([
      {
        type: 'apporteur_statut_modifie',
        agregat: 'apporteur',
        agregatId: APPORTEUR,
        survenuAt: MAINTENANT,
        charge: {
          de: 'retenu',
          vers: 'kyc_en_cours',
          transition: 'ouvrir_kyc',
          acteur: { par: 'utilisateur_console', id: ADMIN.id },
        },
      },
    ]);
    const ouvrir = (o: Parameters<typeof univers>[0], acteur: Dossier.ActeurDuDossier = ADMIN) =>
      motif(
        R.ouvrirLeKyc(univers(o).client, { acteur, apporteurId: APPORTEUR, maintenant: MAINTENANT })
      );
    expect(await ouvrir({ statut: 'candidat' })).toBe('transition_refusee');
    expect(await ouvrir({ statut: 'retenu', avancees: 0 })).toBe('transition_refusee');
    expect(await ouvrir({ statut: null })).toBe('introuvable');
    expect(await ouvrir({ statut: 'retenu' }, QUALIFIEUR)).toBe('droit_absent');
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — valider : les pièces manquantes nommées, rien n’avance ; complet, pret_a_signer', async () => {
    const incomplet = univers({ statut: 'kyc_en_cours', regimeTva: 'assujetti', pieces: [] });
    expect(
      await motif(
        R.validerLeKyc(incomplet.client, {
          acteur: ADMIN,
          apporteurId: APPORTEUR,
          maintenant: MAINTENANT,
        })
      )
    ).toBe('pieces_manquantes:siret,tva,rib,identite,rc_pro');
    expect(incomplet.ecrit('apporteur.updateMany')).toEqual([]);
    expect(incomplet.ecrit('identite.findFirst')).toEqual([
      {
        where: { apporteurId: APPORTEUR, finAt: null },
        orderBy: { debutAt: 'desc' },
        select: { regimeTva: true },
      },
    ]);
    const complet = univers({
      statut: 'kyc_en_cours',
      regimeTva: 'franchise_293b',
      pieces: [
        piece({ type: 'siret', statut: 'valide' }),
        piece({ type: 'identite', statut: 'valide' }),
        piece({ type: 'rc_pro', statut: 'valide', expireAt: new Date(h.MAINTENANT + 1) }),
        piece({ type: 'rib', statut: 'a_verifier' }),
      ],
    });
    await R.validerLeKyc(complet.client, {
      acteur: ADMIN,
      apporteurId: APPORTEUR,
      maintenant: MAINTENANT,
    });
    expect(complet.ecrit('apporteur.updateMany')).toEqual([
      { where: { id: APPORTEUR, statut: 'kyc_en_cours' }, data: { statut: 'pret_a_signer' } },
    ]);
    expect(evenement().mock.calls.at(-1)![1].charge).toMatchObject({
      de: 'kyc_en_cours',
      vers: 'pret_a_signer',
      transition: 'valider_kyc',
    });
    expect(
      await motif(
        R.validerLeKyc(univers({ statut: 'retenu' }).client, {
          acteur: ADMIN,
          apporteurId: APPORTEUR,
          maintenant: MAINTENANT,
        })
      )
    ).toBe('transition_refusee');
  });

  it('REQ-DM-027 : le dossier lu : statut, identité, pièces et manques ; introuvable, null', async () => {
    const u = univers({
      statut: 'kyc_en_cours',
      regimeTva: 'franchise_293b',
      pieces: [piece({ type: 'siret', statut: 'valide' })],
    });
    const d = await R.lireLeDossier(u.client, { apporteurId: APPORTEUR, maintenant: MAINTENANT });
    expect(d).toMatchObject({
      statut: 'kyc_en_cours',
      identite: { siren: '552100554', regimeTva: 'franchise_293b' },
      manques: ['rib', 'identite', 'rc_pro'],
    });
    expect(
      await R.lireLeDossier(univers({ statut: null }).client, {
        apporteurId: APPORTEUR,
        maintenant: MAINTENANT,
      })
    ).toBeNull();
  });
});

describe('REQ-SEC-023 — les actions de l’écran', () => {
  const ECRAN = `/console/apporteurs/${APPORTEUR}/conformite`;
  const formulaire = (champs: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(champs)) f.set(k, v);
    return f;
  };
  async function vers(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      if (e instanceof h.Redirection) return e.vers;
      throw e;
    }
    throw new Error('aucune redirection');
  }
  const admis = (u: Dossier.ActeurDuDossier = ADMIN) =>
    vi.mocked(requireRole).mockResolvedValue({ ok: true, utilisateur: u });
  const refuse = (m: MotifDeRefusConsole) =>
    vi.mocked(requireRole).mockResolvedValue({ ok: false, motif: m });

  const ACTIONS = [
    ['verifierLaPiece', verifierLaPiece, 'action:verifier_piece'],
    ['ouvrirLeDossier', ouvrirLeDossier, 'action:ouvrir_kyc'],
    ['validerLeDossier', validerLeDossier, 'action:valider_kyc'],
  ] as const;

  it.each(ACTIONS)(
    'REQ-SEC-023 : TÉMOIN — %s : son droit avant tout geste ; relèvement → connexion, l’écran en suite ; autre refus → accueil ; apporteur hors forme → accueil',
    async (_nom, agir, droit) => {
      const f = formulaire({ apporteurId: APPORTEUR, pieceId: PIECE, decision: 'valider' });
      refuse('releve_requis');
      expect(await vers(agir(f))).toBe(`/console/connexion?suite=${encodeURIComponent(ECRAN)}`);
      refuse('role_refuse');
      expect(await vers(agir(f))).toBe('/console');
      expect(requireRole).toHaveBeenCalledWith(droit, 'JETON', { ports: 'console' });
      vi.mocked(requireRole).mockClear();
      expect(await vers(agir(formulaire({ apporteurId: 'pas-un-uuid' })))).toBe('/console');
      expect(requireRole).not.toHaveBeenCalled();
      for (const g of [Dossier.verifierUnePiece, Dossier.ouvrirLeKyc, Dossier.validerLeKyc])
        expect(vi.mocked(g)).not.toHaveBeenCalled();
    }
  );

  it('REQ-SEC-023 : TÉMOIN — vérifier : valider ou refuser avec un motif FERMÉ ; tout autre verdict ou une pièce hors forme revient « introuvable » sans geste', async () => {
    admis(QUALIFIEUR);
    expect(
      await vers(
        verifierLaPiece(formulaire({ apporteurId: APPORTEUR, pieceId: PIECE, decision: 'valider' }))
      )
    ).toBe(ECRAN);
    expect(Dossier.verifierUnePiece).toHaveBeenLastCalledWith(h.D.prisma, {
      acteur: QUALIFIEUR,
      pieceId: PIECE,
      verdict: { decision: 'valider' },
      maintenant: MAINTENANT,
    });
    expect(
      await vers(
        verifierLaPiece(
          formulaire({
            apporteurId: APPORTEUR,
            pieceId: PIECE,
            decision: 'refuser',
            motif: 'incomplete',
          })
        )
      )
    ).toBe(ECRAN);
    expect(vi.mocked(Dossier.verifierUnePiece).mock.calls.at(-1)![1].verdict).toEqual({
      decision: 'refuser',
      motif: 'incomplete',
    });
    vi.mocked(Dossier.verifierUnePiece).mockClear();
    const verdictsHorsListe: Record<string, string>[] = [
      { decision: 'refuser', motif: 'autre' },
      { decision: 'refuser' },
      { decision: 'effacer' },
      { decision: 'valider', pieceId: 'pas-un-uuid' },
    ];
    for (const champs of verdictsHorsListe)
      expect(
        await vers(
          verifierLaPiece(formulaire({ apporteurId: APPORTEUR, pieceId: PIECE, ...champs }))
        ),
        JSON.stringify(champs)
      ).toBe(`${ECRAN}?refus=introuvable`);
    expect(Dossier.verifierUnePiece).not.toHaveBeenCalled();
  });

  it('REQ-SEC-023 : TÉMOIN — ouvrir et valider transmettent l’apporteur et l’instant ; un refus de la règle revient avec son motif ; une autre erreur remonte', async () => {
    admis();
    expect(await vers(ouvrirLeDossier(formulaire({ apporteurId: APPORTEUR })))).toBe(ECRAN);
    expect(Dossier.ouvrirLeKyc).toHaveBeenCalledWith(h.D.prisma, {
      acteur: ADMIN,
      apporteurId: APPORTEUR,
      maintenant: MAINTENANT,
    });
    vi.mocked(Dossier.validerLeKyc).mockRejectedValueOnce(
      new ErreurDossierDeConformite('pieces_manquantes', ['rib'])
    );
    expect(await vers(validerLeDossier(formulaire({ apporteurId: APPORTEUR })))).toBe(
      `${ECRAN}?refus=pieces_manquantes`
    );
    expect(Dossier.validerLeKyc).toHaveBeenCalledWith(h.D.prisma, {
      acteur: ADMIN,
      apporteurId: APPORTEUR,
      maintenant: MAINTENANT,
    });
    vi.mocked(Dossier.ouvrirLeKyc).mockRejectedValueOnce(new Error('panne'));
    await expect(ouvrirLeDossier(formulaire({ apporteurId: APPORTEUR }))).rejects.toThrow('panne');
    h.jeton.valeur = undefined;
    refuse('inconnue');
    await vers(ouvrirLeDossier(formulaire({ apporteurId: APPORTEUR })));
    expect(requireRole).toHaveBeenLastCalledWith('action:ouvrir_kyc', undefined, {
      ports: 'console',
    });
  });
});
