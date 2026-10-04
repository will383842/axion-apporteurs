// @req REQ-SEC-058
/**
 * `gels-journal-acces.spec.ts` — le module du gel du journal des accès (SEC-61), EN PROCESSUS, sur un
 * faux client : le droit relu en base, la portée vérifiée, la référence refusée avant toute écriture,
 * l'écriture exacte du gel et de sa levée, les motifs de refus, et la charge exacte de l'événement —
 * sans aucun identifiant d'employé ni de cible. La base réelle (CHECK, garde, filet) est jugée par
 * `tests/integration/gel-journal-acces-console.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteRecherche, ErreurPii } from '../../../src/server/securite/pii';
import {
  ErreurGelJournal,
  leverUnGel,
  poserUnGel,
  type ActeurDuGel,
} from '../../../src/server/console/gels-journal-acces';
import { ajouterEvenement } from '../../../src/server/evenement/journal';

vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-gel-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});

const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const DEPUIS = new Date('2026-01-01T00:00:00.000Z');
const ADMIN: ActeurDuGel = { id: '0190f0f0-0000-7000-8000-00000000000a', role: 'admin' };
const AUTRE = '0190f0f0-0000-7000-8000-00000000000b';
const VISE = '0190f0f0-0000-7000-8000-00000000000c';
const CIBLE = '0190f0f0-0000-7000-8000-00000000000d';
const GEL = '0190f0f0-0000-7000-8000-00000000000e';

type Lu = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;
type Gel = {
  id: string;
  motif: 'incident' | 'litige';
  reference: string;
  utilisateurViseId: string | null;
  cibleId: string | null;
  poseParId: string;
  leveAt: Date | null;
};

/** Un faux client : l'acteur relu, l'utilisateur visé, le gel, l'autre admin, et ce qui est écrit. */
function univers(
  o: {
    acteur?: Lu;
    vise?: boolean;
    gel?: Gel | null;
    autreAdmin?: boolean | 'en_attente';
    leves?: number;
  } = {}
) {
  const appels: { quoi: string; args: unknown }[] = [];
  const acteurLu: Lu =
    o.acteur === undefined ? { role: 'admin', desactiveAt: null, valideAt: DEPUIS } : o.acteur;
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: { where: { id: string } }) => {
        appels.push({ quoi: 'utilisateurConsole.findUnique', args: a });
        if (a.where.id === ADMIN.id) return acteurLu;
        return o.vise === false ? null : { id: a.where.id };
      },
      findMany: async (a: unknown) => {
        appels.push({ quoi: 'utilisateurConsole.findMany', args: a });
        if (o.autreAdmin === 'en_attente') return [{ id: AUTRE, valideAt: null }];
        return o.autreAdmin ? [{ id: AUTRE, valideAt: DEPUIS }] : [];
      },
    },
    journalAccesConsoleGel: {
      create: async (a: unknown) => {
        appels.push({ quoi: 'gel.create', args: a });
        return a;
      },
      findUnique: async (a: unknown) => {
        appels.push({ quoi: 'gel.findUnique', args: a });
        return o.gel === undefined ? null : o.gel;
      },
      updateMany: async (a: unknown) => {
        appels.push({ quoi: 'gel.updateMany', args: a });
        return { count: o.leves ?? 1 };
      },
    },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels };
}

const gelOuvert = (extra: Partial<Gel> = {}): Gel => ({
  id: GEL,
  motif: 'litige',
  reference: 'LIT-0042',
  utilisateurViseId: VISE,
  cibleId: null,
  poseParId: AUTRE,
  leveAt: null,
  ...extra,
});

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurGelJournal) return e.motif;
    throw e;
  }
  throw new Error('aucun refus');
}

const evenement = () => vi.mocked(ajouterEvenement);

beforeEach(() => {
  evenement().mockReset();
});

describe('REQ-SEC-058 — poser un gel', () => {
  const poser = (
    u: ReturnType<typeof univers>,
    extra: Partial<Parameters<typeof poserUnGel>[1]> = {}
  ) =>
    poserUnGel(
      u.client,
      {
        acteur: ADMIN,
        portee: { type: 'utilisateur', utilisateurId: VISE },
        motif: 'incident',
        reference: '  inc-0042 ',
        depuis: DEPUIS,
        maintenant: MAINTENANT,
        ...extra,
      },
      CLES
    );

  it('REQ-SEC-058 : TÉMOIN — le gel s’écrit exactement, référence normalisée, puis son événement SANS aucun identifiant', async () => {
    const u = univers();
    const { id } = await poser(u);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const creation = u.appels.find((a) => a.quoi === 'gel.create')!.args;
    expect(creation).toEqual({
      data: {
        id,
        motif: 'incident',
        reference: 'INC-0042',
        utilisateurViseId: VISE,
        cibleId: null,
        depuis: DEPUIS,
        jusquA: null,
        poseParId: ADMIN.id,
        poseAt: MAINTENANT,
      },
    });
    expect(evenement()).toHaveBeenCalledTimes(1);
    expect(evenement().mock.calls[0]![1]).toEqual({
      type: 'journal_acces_gel_modifie',
      agregat: 'journal_acces_gel',
      agregatId: id,
      survenuAt: MAINTENANT,
      charge: {
        geste: 'poser',
        motif: 'incident',
        portee: { type: 'utilisateur' },
        referenceEmpreinte: empreinteRecherche('reference_gel', 'INC-0042', CLES),
        acteur: { par: 'utilisateur_console' },
      },
    });
    const texte = JSON.stringify(evenement().mock.calls[0]![1].charge);
    for (const interdit of [ADMIN.id, VISE, 'INC-0042']) expect(texte).not.toContain(interdit);
  });

  it('REQ-SEC-058 : une portée CIBLE ne lit aucun utilisateur et pose la cible seule ; jusqu’à est gardé', async () => {
    const u = univers({ vise: false });
    const jusquA = new Date('2027-01-01T00:00:00.000Z');
    await poser(u, { portee: { type: 'cible', cibleId: CIBLE }, jusquA, motif: 'litige' });
    const creation = u.appels.find((a) => a.quoi === 'gel.create')!.args as {
      data: Record<string, unknown>;
    };
    expect(creation.data).toMatchObject({
      utilisateurViseId: null,
      cibleId: CIBLE,
      jusquA,
      motif: 'litige',
    });
    expect(evenement().mock.calls[0]![1].charge).toMatchObject({ portee: { type: 'cible' } });
    // Une seule lecture d'utilisateur : l'acteur.
    expect(u.appels.filter((a) => a.quoi === 'utilisateurConsole.findUnique')).toHaveLength(1);
  });

  it('REQ-SEC-058 : TÉMOIN — un utilisateur visé introuvable est refusé, rien n’est écrit', async () => {
    const u = univers({ vise: false });
    expect(await motif(poser(u))).toBe('introuvable');
    expect(u.appels.map((a) => a.quoi)).not.toContain('gel.create');
    expect(evenement()).not.toHaveBeenCalled();
  });

  it('REQ-SEC-058 : TÉMOIN — une référence hors forme est refusée AVANT toute transaction', async () => {
    const u = univers();
    await expect(poser(u, { reference: 'nom prénom' })).rejects.toBeInstanceOf(ErreurPii);
    expect(u.appels).toEqual([]);
  });

  it('REQ-SEC-058 : TÉMOIN — un rôle non nommé est refusé sans lire la base ; le droit est RELU en base', async () => {
    const u = univers();
    expect(await motif(poser(u, { acteur: { id: ADMIN.id, role: 'comptable' } }))).toBe(
      'droit_absent'
    );
    expect(u.appels.map((a) => a.quoi)).toEqual(['$transaction']);
    for (const acteur of [
      null,
      { role: 'admin', desactiveAt: MAINTENANT, valideAt: DEPUIS },
      { role: 'admin', desactiveAt: null, valideAt: null },
      { role: 'lecteur', desactiveAt: null, valideAt: null },
    ]) {
      const v = univers({ acteur });
      expect(await motif(poser(v)), JSON.stringify(acteur)).toBe('droit_absent');
      expect(v.appels.map((a) => a.quoi)).not.toContain('gel.create');
    }
    const w = univers();
    await poser(w);
    expect(w.appels.find((a) => a.quoi === 'utilisateurConsole.findUnique')!.args).toEqual({
      where: { id: ADMIN.id },
      select: { role: true, desactiveAt: true, valideAt: true },
    });
  });
});

describe('REQ-SEC-058 — lever un gel', () => {
  const lever = (u: ReturnType<typeof univers>, acteur: ActeurDuGel = ADMIN) =>
    leverUnGel(u.client, { acteur, gelId: GEL, maintenant: MAINTENANT }, CLES);

  it('REQ-SEC-058 : TÉMOIN — la levée s’écrit une fois, puis son événement, la portée et la référence en empreinte', async () => {
    const u = univers({ gel: gelOuvert() });
    await lever(u);
    expect(u.appels.find((a) => a.quoi === 'gel.updateMany')!.args).toEqual({
      where: { id: GEL, leveAt: null },
      data: { leveParId: ADMIN.id, leveAt: MAINTENANT },
    });
    expect(evenement().mock.calls[0]![1]).toEqual({
      type: 'journal_acces_gel_modifie',
      agregat: 'journal_acces_gel',
      agregatId: GEL,
      survenuAt: MAINTENANT,
      charge: {
        geste: 'lever',
        motif: 'litige',
        portee: { type: 'utilisateur' },
        referenceEmpreinte: empreinteRecherche('reference_gel', 'LIT-0042', CLES),
        acteur: { par: 'utilisateur_console' },
      },
    });
  });

  it('REQ-SEC-058 : la levée d’un gel sur une cible dit la portée « cible »', async () => {
    const u = univers({ gel: gelOuvert({ utilisateurViseId: null, cibleId: CIBLE }) });
    await lever(u);
    expect(evenement().mock.calls[0]![1].charge).toMatchObject({ portee: { type: 'cible' } });
  });

  it('REQ-SEC-058 : TÉMOIN — introuvable, déjà levé, ou levé entre-temps : refusés, sans événement', async () => {
    expect(await motif(lever(univers({ gel: null })))).toBe('introuvable');
    expect(await motif(lever(univers({ gel: gelOuvert({ leveAt: DEPUIS }) })))).toBe('deja_leve');
    expect(await motif(lever(univers({ gel: gelOuvert(), leves: 0 })))).toBe('deja_leve');
    expect(evenement()).not.toHaveBeenCalled();
  });

  it('REQ-SEC-058 : TÉMOIN — l’auteur ou la personne visée ne lève pas ; sans autre administrateur validé, échec fermé', async () => {
    const auteur = univers({ gel: gelOuvert({ poseParId: ADMIN.id }), autreAdmin: true });
    expect(await motif(lever(auteur))).toBe('leveur_interdit');
    expect(auteur.appels.find((a) => a.quoi === 'utilisateurConsole.findMany')!.args).toEqual({
      where: { role: 'admin', desactiveAt: null, id: { notIn: [ADMIN.id, VISE] } },
      select: { id: true, valideAt: true },
    });
    const vise = univers({ gel: gelOuvert({ utilisateurViseId: ADMIN.id }), autreAdmin: true });
    expect(await motif(lever(vise))).toBe('leveur_interdit');
    const seul = univers({ gel: gelOuvert({ poseParId: ADMIN.id }), autreAdmin: false });
    expect(await motif(lever(seul))).toBe('aucun_autre_administrateur');
    // Un autre administrateur EN ATTENTE ne compte pas : personne ne peut lever.
    const enAttente = univers({
      gel: gelOuvert({ poseParId: ADMIN.id }),
      autreAdmin: 'en_attente',
    });
    expect(await motif(lever(enAttente))).toBe('aucun_autre_administrateur');
    for (const u of [auteur, vise, seul])
      expect(u.appels.map((a) => a.quoi)).not.toContain('gel.updateMany');
    expect(evenement()).not.toHaveBeenCalled();
  });

  it('REQ-SEC-058 : TÉMOIN — un rôle non nommé, ou un admin en attente, ne lève pas', async () => {
    expect(
      await motif(lever(univers({ gel: gelOuvert() }), { id: ADMIN.id, role: 'qualifieur' }))
    ).toBe('droit_absent');
    expect(
      await motif(
        lever(
          univers({
            gel: gelOuvert(),
            acteur: { role: 'admin', desactiveAt: null, valideAt: null },
          })
        )
      )
    ).toBe('droit_absent');
  });

  it('REQ-SEC-058 : l’erreur se nomme et porte son motif', () => {
    const e = new ErreurGelJournal('deja_leve');
    expect(e.name).toBe('ErreurGelJournal');
    expect(e.message).toBe('gel_journal_acces : deja_leve');
    expect(e.motif).toBe('deja_leve');
  });
});
