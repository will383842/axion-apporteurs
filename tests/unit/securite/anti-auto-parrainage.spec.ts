// @req REQ-ARG-012
// @req REQ-SEC-031
/**
 * SEC-18 — l'anti auto-parrainage, EN PROCESSUS (la base réelle :
 * `tests/integration/anti-auto-parrainage.spec.ts`).
 *
 * CE QU'IL PROUVE :
 *   1. LE CŒUR PUR : les empreintes du filleul et du parrain (courriel, téléphone, IBAN, SIREN) se
 *      comparent famille par famille, et un filleul qui est son propre parrain est nommé `identite` ;
 *      une empreinte absente ne correspond jamais à une autre absente ;
 *   2. À DEUX FACES : une correspondance ouvre UNE anomalie `auto_parrainage` sur le filleul ; aucune
 *      correspondance n'écrit rien ; une anomalie déjà ouverte n'est pas doublée ;
 *   3. LES DEUX MOMENTS : à la candidature parrainée, et au changement de RIB, dans les deux sens —
 *      l'apporteur comme filleul de son parrain, et comme parrain de ses filleuls ;
 *   4. LES DEUX RÉPONSES : nommée côté console, NEUTRE côté espace (la même, qu'il y ait correspondance
 *      ou non) ; le journal ne porte que le moment et les familles, aucune donnée de personne.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  FAMILLES_D_EMPREINTE,
  REPONSE_ESPACE,
  controlerALaCandidature,
  controlerAuChangementDeRib,
  correspondances,
  reponseEspace,
  verdictConsole,
  type EmpreintesDUnApporteur,
  type LigneDuJournal,
} from '../../../src/server/parrainage/anti-auto-parrainage';

const H = (c: string) => c.repeat(64);

function empreintes(
  id: string,
  e: Partial<Omit<EmpreintesDUnApporteur, 'id'>> = {}
): EmpreintesDUnApporteur {
  return { id, emailHash: null, phoneHash: null, ibans: [], sirens: [], ...e };
}

describe('REQ-ARG-012 — le cœur pur compare les empreintes du filleul et du parrain', () => {
  it('REQ-ARG-012 : les familles sont une liste fermée, dans cet ordre', () => {
    expect([...FAMILLES_D_EMPREINTE]).toEqual([
      'identite',
      'courriel',
      'telephone',
      'iban',
      'siren',
    ]);
  });

  it('REQ-ARG-012 : chaque famille correspond seule, et deux identités distinctes sans rien de commun ne correspondent pas', () => {
    const p = empreintes('p', {
      emailHash: H('a'),
      phoneHash: H('b'),
      ibans: [H('c')],
      sirens: ['552100554'],
    });
    expect(correspondances(empreintes('f'), p)).toEqual([]);
    expect(correspondances(empreintes('f', { emailHash: H('a') }), p)).toEqual(['courriel']);
    expect(correspondances(empreintes('f', { phoneHash: H('b') }), p)).toEqual(['telephone']);
    expect(correspondances(empreintes('f', { ibans: [H('9'), H('c')] }), p)).toEqual(['iban']);
    expect(correspondances(empreintes('f', { sirens: ['732829320', '552100554'] }), p)).toEqual([
      'siren',
    ]);
    expect(
      correspondances(
        empreintes('f', {
          emailHash: H('a'),
          phoneHash: H('b'),
          ibans: [H('c')],
          sirens: ['552100554'],
        }),
        p
      )
    ).toEqual(['courriel', 'telephone', 'iban', 'siren']);
  });

  it('REQ-ARG-012 : le filleul qui est son propre parrain est nommé identite, même sans empreinte', () => {
    expect(correspondances(empreintes('x'), empreintes('x'))).toEqual(['identite']);
  });

  it('REQ-ARG-012 : une empreinte absente ne correspond jamais à une autre absente', () => {
    expect(correspondances(empreintes('f'), empreintes('p'))).toEqual([]);
  });
});

// ── une base simulée qui enregistre chaque appel ───────────────────────────────────────────────

interface Ligne {
  id: string;
  codeParrainage: string;
  parrainCodeCapture: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  ibans: string[];
  sirens: string[];
}

function baseSimulee(lignes: Ligne[], anomaliesOuvertes: string[] = []) {
  const appels: { quoi: string; args: unknown }[] = [];
  const creees: unknown[] = [];
  const versLecture = (l: Ligne) => ({
    id: l.id,
    codeParrainage: l.codeParrainage,
    parrainCodeCapture: l.parrainCodeCapture,
    emailHash: l.emailHash,
    phoneHash: l.phoneHash,
    piecesKyc: l.ibans.map((ibanHash) => ({ ibanHash })),
    identitesFacturation: l.sirens.map((siren) => ({ siren })),
  });
  const apporteur = {
    findUnique: async (args: { where: { id?: string; codeParrainage?: string } }) => {
      appels.push({ quoi: 'apporteur.findUnique', args });
      const l = lignes.find((x) =>
        args.where.id !== undefined
          ? x.id === args.where.id
          : x.codeParrainage === args.where.codeParrainage
      );
      return l === undefined ? null : versLecture(l);
    },
    findMany: async (args: unknown) => {
      appels.push({ quoi: 'apporteur.findMany', args });
      const contient = (args as { where: { parrainCodeCapture: { contains: string } } }).where
        .parrainCodeCapture.contains;
      return lignes
        .filter((x) => x.parrainCodeCapture?.toUpperCase().includes(contient.toUpperCase()))
        .map(versLecture);
    },
  };
  const anomalie = {
    findFirst: async (args: { where: { apporteurId: string } }) => {
      appels.push({ quoi: 'anomalie.findFirst', args });
      return anomaliesOuvertes.includes(args.where.apporteurId) ? { id: 'deja' } : null;
    },
    create: async (args: unknown) => {
      appels.push({ quoi: 'anomalie.create', args });
      creees.push(args);
      return { id: 'neuve' };
    },
  };
  const prisma = {
    apporteur,
    anomalie,
    $transaction: async <T>(f: (tx: unknown) => Promise<T>) => f({ apporteur, anomalie }),
  };
  return { prisma: prisma as unknown as PrismaClient, appels, creees };
}

const PARRAIN: Ligne = {
  id: 'parrain',
  codeParrainage: 'AXABCDEF',
  parrainCodeCapture: null,
  emailHash: H('a'),
  phoneHash: H('b'),
  ibans: [H('c')],
  sirens: ['552100554'],
};

function filleul(e: Partial<Ligne> = {}): Ligne {
  return {
    id: 'filleul',
    codeParrainage: 'AXZZZZZZ',
    parrainCodeCapture: 'AXABCDEF',
    emailHash: H('1'),
    phoneHash: H('2'),
    ibans: [H('3')],
    sirens: ['732829320'],
    ...e,
  };
}

const ANOMALIE_ATTENDUE = {
  data: { type: 'auto_parrainage', apporteurId: 'filleul', score: null },
};

describe('REQ-SEC-031 — à la candidature parrainée, une correspondance ouvre UNE anomalie', () => {
  it('REQ-SEC-031 : TÉMOIN À DEUX FACES — même téléphone : une anomalie auto_parrainage sur le filleul ; aucune correspondance : rien n’est écrit', async () => {
    const meme = baseSimulee([PARRAIN, filleul({ phoneHash: H('b') })]);
    const journal: LigneDuJournal[] = [];
    const r = await controlerALaCandidature(meme.prisma, 'filleul', (l) => journal.push(l));
    expect(r).toEqual({ correspondances: ['telephone'], anomalieOuverte: true });
    expect(meme.creees).toEqual([ANOMALIE_ATTENDUE]);
    expect(journal).toEqual([
      {
        signal: 'auto_parrainage_soupconne',
        moment: 'candidature',
        correspondances: ['telephone'],
      },
    ]);

    const distinct = baseSimulee([PARRAIN, filleul()]);
    const journalVide: LigneDuJournal[] = [];
    expect(
      await controlerALaCandidature(distinct.prisma, 'filleul', (l) => journalVide.push(l))
    ).toEqual({ correspondances: [], anomalieOuverte: false });
    expect(distinct.creees).toEqual([]);
    expect(journalVide).toEqual([]);
  });

  it('REQ-SEC-031 : le parrain se retrouve par le code capturé, sous sa forme canonique', async () => {
    const b = baseSimulee([
      PARRAIN,
      filleul({ parrainCodeCapture: '  axabcdef ', emailHash: H('a') }),
    ]);
    expect(await controlerALaCandidature(b.prisma, 'filleul')).toEqual({
      correspondances: ['courriel'],
      anomalieOuverte: true,
    });
    expect(b.appels).toContainEqual({
      quoi: 'apporteur.findUnique',
      args: expect.objectContaining({ where: { codeParrainage: 'AXABCDEF' } }),
    });
  });

  it('REQ-SEC-031 : sans parrain (aucun code, code mal formé, code inconnu, filleul inconnu), rien n’est écrit', async () => {
    for (const capture of [null, 'pas-un-code', 'AXQQQQQQ']) {
      const b = baseSimulee([PARRAIN, filleul({ parrainCodeCapture: capture, emailHash: H('a') })]);
      expect(await controlerALaCandidature(b.prisma, 'filleul'), String(capture)).toEqual({
        correspondances: [],
        anomalieOuverte: false,
      });
      expect(b.creees).toEqual([]);
    }
    const b = baseSimulee([PARRAIN]);
    expect(await controlerALaCandidature(b.prisma, 'inconnu')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
  });

  it('REQ-SEC-031 : une anomalie auto_parrainage déjà OUVERTE sur le filleul n’est pas doublée', async () => {
    const b = baseSimulee([PARRAIN, filleul({ ibans: [H('c')] })], ['filleul']);
    expect(await controlerALaCandidature(b.prisma, 'filleul')).toEqual({
      correspondances: ['iban'],
      anomalieOuverte: false,
    });
    expect(b.creees).toEqual([]);
    expect(b.appels).toContainEqual({
      quoi: 'anomalie.findFirst',
      args: {
        where: { type: 'auto_parrainage', apporteurId: 'filleul', statut: 'ouverte' },
        select: { id: true },
      },
    });
  });

  it('REQ-SEC-031 : les empreintes se lisent sur les pièces RIB non remplacées et les identités de facturation en cours', async () => {
    const b = baseSimulee([PARRAIN, filleul()]);
    await controlerALaCandidature(b.prisma, 'filleul');
    const lecture = b.appels.find((a) => a.quoi === 'apporteur.findUnique');
    expect(lecture?.args).toEqual({
      where: { id: 'filleul' },
      select: {
        id: true,
        codeParrainage: true,
        parrainCodeCapture: true,
        emailHash: true,
        phoneHash: true,
        piecesKyc: {
          where: { type: 'rib', remplaceeAt: null, ibanHash: { not: null } },
          select: { ibanHash: true },
        },
        identitesFacturation: { where: { finAt: null }, select: { siren: true } },
      },
    });
  });
});

describe('REQ-SEC-031 — au changement de RIB, dans les deux sens', () => {
  it('REQ-SEC-031 : le filleul qui saisit l’IBAN de son parrain ouvre une anomalie sur lui', async () => {
    const b = baseSimulee([PARRAIN, filleul({ ibans: [H('c')] })]);
    const journal: LigneDuJournal[] = [];
    expect(await controlerAuChangementDeRib(b.prisma, 'filleul', (l) => journal.push(l))).toEqual({
      correspondances: ['iban'],
      anomalieOuverte: true,
    });
    expect(b.creees).toEqual([ANOMALIE_ATTENDUE]);
    expect(journal).toEqual([
      { signal: 'auto_parrainage_soupconne', moment: 'rib', correspondances: ['iban'] },
    ]);
  });

  it('REQ-SEC-031 : le PARRAIN qui saisit l’IBAN d’un de ses filleuls ouvre l’anomalie sur ce filleul, et sur lui seul', async () => {
    const autre: Ligne = { ...filleul(), id: 'autre-filleul', ibans: [H('7')] };
    const vise = filleul({ ibans: [H('c')] });
    const b = baseSimulee([PARRAIN, vise, autre]);
    expect(await controlerAuChangementDeRib(b.prisma, 'parrain')).toEqual({
      correspondances: ['iban'],
      anomalieOuverte: true,
    });
    expect(b.creees).toEqual([ANOMALIE_ATTENDUE]);
  });

  it('REQ-SEC-031 : un apporteur sans parrain ni filleul, ou sans correspondance, n’écrit rien', async () => {
    const seul = baseSimulee([{ ...PARRAIN }]);
    expect(await controlerAuChangementDeRib(seul.prisma, 'parrain')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    const distinct = baseSimulee([PARRAIN, filleul()]);
    expect(await controlerAuChangementDeRib(distinct.prisma, 'filleul')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    expect(await controlerAuChangementDeRib(distinct.prisma, 'parrain')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    expect(distinct.creees).toEqual([]);
    expect(await controlerAuChangementDeRib(distinct.prisma, 'inconnu')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
  });

  it('REQ-SEC-031 : les filleuls se cherchent par le code du parrain, et seul le code canonique exact retient', async () => {
    const proche = { ...filleul(), id: 'proche', parrainCodeCapture: 'AXABCDEFG', ibans: [H('c')] };
    const b = baseSimulee([PARRAIN, proche]);
    expect(await controlerAuChangementDeRib(b.prisma, 'parrain')).toEqual({
      correspondances: [],
      anomalieOuverte: false,
    });
    expect(b.appels).toContainEqual({
      quoi: 'apporteur.findMany',
      args: expect.objectContaining({
        where: { parrainCodeCapture: { contains: 'AXABCDEF', mode: 'insensitive' } },
      }),
    });
  });
});

describe('REQ-ARG-012 — refus nommé côté console, réponse neutre côté espace', () => {
  it('REQ-ARG-012 : la console nomme le refus et ses familles ; sans correspondance, aucun refus', () => {
    expect(
      verdictConsole({ correspondances: ['courriel', 'iban'], anomalieOuverte: true })
    ).toEqual({
      verdict: 'auto_parrainage',
      correspondances: ['courriel', 'iban'],
    });
    expect(verdictConsole({ correspondances: [], anomalieOuverte: false })).toEqual({
      verdict: 'aucun',
    });
  });

  it('REQ-ARG-012 : l’espace reçoit la MÊME réponse, figée, qu’il y ait correspondance ou non', () => {
    expect(reponseEspace({ correspondances: ['telephone'], anomalieOuverte: true })).toBe(
      REPONSE_ESPACE
    );
    expect(reponseEspace({ correspondances: [], anomalieOuverte: false })).toBe(REPONSE_ESPACE);
    expect(Object.isFrozen(REPONSE_ESPACE)).toBe(true);
    expect(JSON.stringify(REPONSE_ESPACE)).not.toMatch(/parrain|courriel|telephone|iban|siren/i);
  });
});
