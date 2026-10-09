// @req REQ-ARG-012
// @req REQ-SEC-031
/**
 * SEC-18 — l'anti auto-parrainage, EN PROCESSUS (la base réelle :
 * `tests/integration/anti-auto-parrainage.spec.ts`).
 *
 * CE QU'IL PROUVE :
 *   1. LE CŒUR PUR : les empreintes du filleul et du parrain (courriel, téléphone, IBAN, SIREN) se
 *      comparent famille par famille ; un filleul qui est son propre parrain est nommé `identite` ;
 *      une empreinte absente ne correspond jamais à rien ;
 *   2. LA LECTURE SEULE : à la candidature et au RIB (dans les deux sens), le module rend des
 *      soupçons sur le FILLEUL, et n'a accès à rien d'autre qu'aux apporteurs — il n'écrit rien ;
 *   3. LA TÂCHE DIFFÉRÉE (forme d'A02) : elle lit au journal les naissances de candidatures et de
 *      pièces RIB depuis son curseur, ouvre l'anomalie par une instruction idempotente dans sa propre
 *      transaction, journalise l'ouverture SEULEMENT si une ligne est rendue, et respecte sa cadence ;
 *   4. LES DEUX RÉPONSES : nommée côté console, NEUTRE côté espace.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  FAMILLES_D_EMPREINTE,
  REPONSE_ESPACE,
  correspondances,
  famillesDe,
  soupconsALaCandidature,
  soupconsAuChangementDeRib,
  verdictConsole,
  type EmpreintesDUnApporteur,
  type LigneDuJournal,
} from '../../../src/server/parrainage/anti-auto-parrainage';
import {
  TACHE_AUTO_PARRAINAGE,
  ouvrirLesAnomaliesDAutoParrainage,
  ouvrirUneAnomalie,
  precedentDuBattement,
} from '../../../src/server/taches/ouvrir-anomalies-auto-parrainage';
import { TACHES } from '../../../src/server/taches/registre';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const H = (c: string) => c.repeat(64);
const T0 = new Date('2026-10-03T08:00:00.000Z');
const ID_ANOMALIE = '55555555-5555-4555-8555-555555555555';

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

  it('REQ-ARG-012 : chaque famille correspond seule, et deux identités sans rien de commun ne correspondent pas', () => {
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

  it('REQ-ARG-012 : une empreinte absente ne correspond jamais à une autre absente, ni à une présente', () => {
    expect(correspondances(empreintes('f'), empreintes('p'))).toEqual([]);
    expect(correspondances(empreintes('f', { emailHash: H('a') }), empreintes('p'))).toEqual([]);
    expect(correspondances(empreintes('f'), empreintes('p', { phoneHash: H('b') }))).toEqual([]);
  });

  it('REQ-ARG-012 : les familles de plusieurs soupçons se réunissent, sans doublon, dans l’ordre', () => {
    expect(
      famillesDe([
        { filleulId: 'a', correspondances: ['siren', 'courriel'] },
        { filleulId: 'b', correspondances: ['courriel', 'iban'] },
      ])
    ).toEqual(['courriel', 'iban', 'siren']);
    expect(famillesDe([])).toEqual([]);
  });
});

// ── une base simulée, en lecture seule, qui enregistre chaque appel ────────────────────────────

interface Ligne {
  id: string;
  codeParrainage: string;
  parrainCodeCapture: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  ibans: (string | null)[];
  sirens: string[];
}

function apporteursSimules(lignes: Ligne[]) {
  const appels: { quoi: string; args: unknown }[] = [];
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
    findUnique: async (args: { where: { id?: string; codeParrainage?: string | null } }) => {
      appels.push({ quoi: 'apporteur.findUnique', args });
      // Comme Prisma : une clé unique nulle est une requête invalide, jamais « aucun résultat ».
      if (args.where.id === undefined && typeof args.where.codeParrainage !== 'string') {
        throw new Error('findUnique sans clé');
      }
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
  // Le module ne reçoit QUE les apporteurs : aucune autre table, aucune écriture possible.
  return { client: { apporteur } as unknown as PrismaClient, apporteur, appels };
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

describe('REQ-SEC-031 — à la candidature parrainée, le module lit et juge, sans rien écrire', () => {
  it('REQ-SEC-031 : TÉMOIN À DEUX FACES — même téléphone : un soupçon sur le filleul ; aucune correspondance : aucun', async () => {
    const meme = apporteursSimules([PARRAIN, filleul({ phoneHash: H('b') })]);
    expect(await soupconsALaCandidature(meme.client, 'filleul')).toEqual([
      { filleulId: 'filleul', correspondances: ['telephone'] },
    ]);
    const distinct = apporteursSimules([PARRAIN, filleul()]);
    expect(await soupconsALaCandidature(distinct.client, 'filleul')).toEqual([]);
    // Lecture seule : seuls des appels de lecture des apporteurs.
    for (const a of [...meme.appels, ...distinct.appels])
      expect(a.quoi).toMatch(/^apporteur\.find/);
  });

  it('REQ-SEC-031 : le parrain se retrouve par le code capturé, sous sa forme canonique', async () => {
    const b = apporteursSimules([
      PARRAIN,
      filleul({ parrainCodeCapture: '  axabcdef ', emailHash: H('a') }),
    ]);
    expect(await soupconsALaCandidature(b.client, 'filleul')).toEqual([
      { filleulId: 'filleul', correspondances: ['courriel'] },
    ]);
    expect(b.appels).toContainEqual({
      quoi: 'apporteur.findUnique',
      args: expect.objectContaining({ where: { codeParrainage: 'AXABCDEF' } }),
    });
  });

  it('REQ-SEC-031 : sans parrain (aucun code, code mal formé, code inconnu, filleul inconnu), aucun soupçon', async () => {
    for (const capture of [null, 'pas-un-code', 'AXQQQQQQ']) {
      const b = apporteursSimules([
        PARRAIN,
        filleul({ parrainCodeCapture: capture, emailHash: H('a') }),
      ]);
      expect(await soupconsALaCandidature(b.client, 'filleul'), String(capture)).toEqual([]);
    }
    expect(await soupconsALaCandidature(apporteursSimules([PARRAIN]).client, 'inconnu')).toEqual(
      []
    );
  });

  it('REQ-SEC-031 : une pièce RIB lue sans empreinte ne compte pas, même face à une autre sans empreinte', async () => {
    const b = apporteursSimules([{ ...PARRAIN, ibans: [null] }, filleul({ ibans: [null] })]);
    expect(await soupconsALaCandidature(b.client, 'filleul')).toEqual([]);
  });

  it('REQ-SEC-031 : les empreintes se lisent sur les pièces RIB non remplacées et les identités de facturation en cours', async () => {
    const b = apporteursSimules([PARRAIN, filleul()]);
    await soupconsALaCandidature(b.client, 'filleul');
    expect(b.appels.find((a) => a.quoi === 'apporteur.findUnique')?.args).toEqual({
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

describe('REQ-SEC-031 — au changement de RIB, dans les deux sens, toujours sur le filleul', () => {
  it('REQ-SEC-031 : le filleul qui saisit l’IBAN de son parrain est soupçonné', async () => {
    const b = apporteursSimules([PARRAIN, filleul({ ibans: [H('c')] })]);
    expect(await soupconsAuChangementDeRib(b.client, 'filleul')).toEqual([
      { filleulId: 'filleul', correspondances: ['iban'] },
    ]);
  });

  it('REQ-SEC-031 : le PARRAIN qui saisit l’IBAN d’un de ses filleuls rend le soupçon sur ce filleul, et sur lui seul', async () => {
    const autre: Ligne = { ...filleul(), id: 'autre-filleul', ibans: [H('7')] };
    const b = apporteursSimules([PARRAIN, filleul({ ibans: [H('c')] }), autre]);
    expect(await soupconsAuChangementDeRib(b.client, 'parrain')).toEqual([
      { filleulId: 'filleul', correspondances: ['iban'] },
    ]);
  });

  it('REQ-SEC-031 : un apporteur sans parrain ni filleul, sans correspondance, ou inconnu : aucun soupçon', async () => {
    expect(await soupconsAuChangementDeRib(apporteursSimules([PARRAIN]).client, 'parrain')).toEqual(
      []
    );
    const distinct = apporteursSimules([PARRAIN, filleul()]);
    expect(await soupconsAuChangementDeRib(distinct.client, 'filleul')).toEqual([]);
    expect(await soupconsAuChangementDeRib(distinct.client, 'parrain')).toEqual([]);
    expect(await soupconsAuChangementDeRib(distinct.client, 'inconnu')).toEqual([]);
  });

  it('REQ-SEC-031 : les filleuls se cherchent par le code du parrain, et seul le code canonique exact retient', async () => {
    const proche = {
      ...filleul(),
      id: 'proche',
      parrainCodeCapture: 'AXABCDEFG',
      ibans: [H('c')],
    };
    const b = apporteursSimules([PARRAIN, proche]);
    expect(await soupconsAuChangementDeRib(b.client, 'parrain')).toEqual([]);
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
    expect(verdictConsole(['courriel', 'iban'])).toEqual({
      verdict: 'auto_parrainage',
      correspondances: ['courriel', 'iban'],
    });
    expect(verdictConsole([])).toEqual({ verdict: 'aucun' });
  });

  it('REQ-ARG-012 : l’espace reçoit une réponse FIGÉE, qui ne dit rien de ce qui a été comparé', () => {
    expect(Object.isFrozen(REPONSE_ESPACE)).toBe(true);
    expect(JSON.stringify(REPONSE_ESPACE)).not.toMatch(/parrain|courriel|telephone|iban|siren/i);
  });
});

// ── la tâche différée, sur une base simulée qui enregistre chaque appel ────────────────────────

interface Evt {
  id: number;
  type: string;
  agregatId: string | null;
  charge: unknown;
  survenuAt?: Date;
}

function baseDeLaTache(o: {
  lignes: Ligne[];
  evenements: Evt[];
  pieces?: Record<string, string>;
  conflit?: boolean;
}) {
  const a = apporteursSimules(o.lignes);
  const ecrits: { quoi: string; args: unknown }[] = [];
  const lectures: unknown[] = [];
  const tx = {
    $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      ecrits.push({ quoi: 'insert', args: { sql: gabarit.join('?'), valeurs } });
      return o.conflit === true ? [] : [{ id: ID_ANOMALIE }];
    },
  };
  const prisma = {
    apporteur: a.apporteur,
    pieceKyc: {
      findUnique: async (args: { where: { id: string } }) => {
        lectures.push(args);
        const apporteurId = o.pieces?.[args.where.id];
        return apporteurId === undefined ? null : { apporteurId };
      },
    },
    $transaction: async <T>(f: (t: unknown) => Promise<T>) => f(tx),
  };
  const journalises: unknown[] = [];
  const traces: LigneDuJournal[] = [];
  const lireJournal = async () => {
    lectures.push('journal');
    return o.evenements.map((e) => ({
      id: String(e.id),
      type: e.type,
      agregat: 'x',
      agregatId: e.agregatId,
      survenuAt: (e.survenuAt ?? T0).toISOString(),
      charge: e.charge,
      prevHash: '',
      selfHash: '',
    }));
  };
  const ports = (precedent: { curseur: number; passeAtMs: number } | null = null) => ({
    maintenant: () => T0,
    precedent: async () => precedent,
    lireJournal,
    journal: (l: LigneDuJournal) => traces.push(l),
    journaliser: async (t: unknown, e: unknown) => {
      expect(t).toBe(tx);
      journalises.push(e);
    },
  });
  return {
    prisma: prisma as unknown as PrismaClient,
    ecrits,
    lectures,
    journalises,
    traces,
    ports,
  };
}

const NAISSANCE_CANDIDATURE: Evt = {
  id: 10,
  type: 'apporteur_statut_modifie',
  agregatId: 'filleul',
  charge: { de: null, vers: 'candidat', transition: 'creer' },
};

const OUVERTURE_JOURNALISEE = {
  type: 'anomalie_statut_modifie',
  agregat: 'anomalie',
  agregatId: ID_ANOMALIE,
  survenuAt: T0,
  charge: { de: null, vers: 'ouverte', acteur: { par: 'systeme' } },
};

describe('REQ-SEC-031 — la tâche différée ouvre l’anomalie, une fois, journalisée', () => {
  it('REQ-SEC-031 : la tâche est au registre, sous l’exigence qui l’impose ; cadence et fenêtre sont dans la SSOT', () => {
    expect(TACHES[TACHE_AUTO_PARRAINAGE]).toEqual({ req: 'REQ-SEC-031' });
    expect(SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.unite).toBe('minutes');
    expect(SEUILS.AUTO_PARRAINAGE_FENETRE_JOURS.unite).toBe('jours');
  });

  it('REQ-SEC-031 : TÉMOIN À DEUX FACES — une naissance de candidature soupçonnée ouvre UNE anomalie par l’instruction idempotente, et journalise l’ouverture', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b') })],
      evenements: [NAISSANCE_CANDIDATURE],
    });
    expect(await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports())).toEqual({
      curseur: 10,
      passeAtMs: T0.getTime(),
      naissancesLues: 1,
      ouvertes: 1,
    });
    expect(b.ecrits).toHaveLength(1);
    const insert = b.ecrits[0]!.args as { sql: string; valeurs: unknown[] };
    expect(insert.sql).toContain('INSERT INTO "anomalies"');
    expect(insert.sql).toContain(
      `ON CONFLICT ("apporteur_id") WHERE "type" = 'auto_parrainage' AND "statut" = 'ouverte'`
    );
    expect(insert.sql).toContain('DO NOTHING');
    expect(insert.valeurs[1]).toBe('filleul');
    expect(b.journalises).toEqual([OUVERTURE_JOURNALISEE]);
    expect(b.traces).toEqual([
      {
        signal: 'auto_parrainage_soupconne',
        moment: 'candidature',
        correspondances: ['telephone'],
      },
    ]);

    // Contre-témoin : un filleul distinct. Rien n'est écrit, rien n'est journalisé.
    const distinct = baseDeLaTache({
      lignes: [PARRAIN, filleul()],
      evenements: [NAISSANCE_CANDIDATURE],
    });
    expect(
      (await ouvrirLesAnomaliesDAutoParrainage(distinct.prisma, distinct.ports())).ouvertes
    ).toBe(0);
    expect(distinct.ecrits).toEqual([]);
    expect(distinct.journalises).toEqual([]);
    expect(distinct.traces).toEqual([]);
  });

  it('REQ-SEC-031 : en CONFLIT (une anomalie déjà ouverte), aucune ligne rendue : aucun événement', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b') })],
      evenements: [NAISSANCE_CANDIDATURE],
      conflit: true,
    });
    expect((await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports())).ouvertes).toBe(0);
    expect(b.journalises).toEqual([]);
    expect(await ouvrirUneAnomalie(b.prisma, 'filleul', b.ports())).toBe(false);
  });

  it('REQ-SEC-031 : une naissance de pièce RIB se juge au changement de RIB, sur l’apporteur de la pièce', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ ibans: [H('c')] })],
      evenements: [
        {
          id: 20,
          type: 'piece_kyc_statut_modifie',
          agregatId: 'piece-1',
          charge: { de: null, vers: 'a_verifier', type: 'rib', acteur: { par: 'apporteur' } },
        },
      ],
      pieces: { 'piece-1': 'filleul' },
    });
    expect(await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports())).toEqual({
      curseur: 20,
      passeAtMs: T0.getTime(),
      naissancesLues: 1,
      ouvertes: 1,
    });
    expect(b.traces).toEqual([
      { signal: 'auto_parrainage_soupconne', moment: 'rib', correspondances: ['iban'] },
    ]);
    expect(b.lectures).toContainEqual({
      where: { id: 'piece-1' },
      select: { apporteurId: true },
    });
  });

  it('REQ-SEC-031 : sans port de trace, la tâche ouvre et journalise quand même', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b') })],
      evenements: [NAISSANCE_CANDIDATURE],
    });
    const complets = b.ports();
    const ports = {
      maintenant: complets.maintenant,
      precedent: complets.precedent,
      lireJournal: complets.lireJournal,
      journaliser: complets.journaliser,
    };
    expect((await ouvrirLesAnomaliesDAutoParrainage(b.prisma, ports)).ouvertes).toBe(1);
    expect(b.journalises).toEqual([OUVERTURE_JOURNALISEE]);
  });

  it('REQ-SEC-031 : ce qui n’est pas une naissance utile avance le curseur sans rien juger', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b'), ibans: [H('c')] })],
      evenements: [
        { ...NAISSANCE_CANDIDATURE, id: 31, charge: { de: 'candidat', vers: 'retenu' } },
        { ...NAISSANCE_CANDIDATURE, id: 32, agregatId: null },
        { ...NAISSANCE_CANDIDATURE, id: 33, charge: null },
        {
          id: 34,
          type: 'piece_kyc_statut_modifie',
          agregatId: 'piece-1',
          charge: { de: null, vers: 'a_verifier', type: 'identite' },
        },
        {
          id: 35,
          type: 'piece_kyc_statut_modifie',
          agregatId: 'piece-inconnue',
          charge: { de: null, vers: 'a_verifier', type: 'rib' },
        },
      ],
      pieces: { 'piece-1': 'filleul' },
    });
    expect(await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports())).toEqual({
      curseur: 35,
      passeAtMs: T0.getTime(),
      naissancesLues: 1,
      ouvertes: 0,
    });
    expect(b.ecrits).toEqual([]);
  });

  it('REQ-SEC-031 : seuls les faits NOUVEAUX se jugent — au-delà du curseur, des deux types, dans la fenêtre de la SSOT', async () => {
    const fenetreMs = SEUILS.AUTO_PARRAINAGE_FENETRE_JOURS.valeur * 86_400_000;
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b') })],
      evenements: [
        { ...NAISSANCE_CANDIDATURE, id: 42 },
        { ...NAISSANCE_CANDIDATURE, id: 43, type: 'attribution_statut_modifie' },
        { ...NAISSANCE_CANDIDATURE, id: 44, survenuAt: new Date(T0.getTime() - fenetreMs - 1) },
        { ...NAISSANCE_CANDIDATURE, id: 45, survenuAt: new Date(T0.getTime() - fenetreMs) },
      ],
    });
    const avant = T0.getTime() - 2 * SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * 60_000;
    expect(
      await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports({ curseur: 42, passeAtMs: avant }))
    ).toEqual({ curseur: 45, passeAtMs: T0.getTime(), naissancesLues: 1, ouvertes: 1 });
    expect(b.lectures.filter((l) => l === 'journal')).toHaveLength(1);
  });

  it('REQ-SEC-031 : TÉMOIN — après une levée, sans fait nouveau, rien ne se rouvre : le passage suivant repart du curseur rendu', async () => {
    const b = baseDeLaTache({
      lignes: [PARRAIN, filleul({ phoneHash: H('b') })],
      evenements: [NAISSANCE_CANDIDATURE],
    });
    const premier = await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports());
    expect(premier.ouvertes).toBe(1);
    // La console lève l'anomalie : rien ne l'empêche plus, côté base, d'en ouvrir une autre.
    const suivant = T0.getTime() + SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * 60_000;
    expect(
      await ouvrirLesAnomaliesDAutoParrainage(b.prisma, {
        ...b.ports({ curseur: premier.curseur, passeAtMs: T0.getTime() }),
        maintenant: () => new Date(suivant),
      })
    ).toEqual({ curseur: 10, passeAtMs: suivant, naissancesLues: 0, ouvertes: 0 });
    expect(b.ecrits).toHaveLength(1);
  });

  it('REQ-SEC-031 : avant sa cadence, le passage rend le MÊME curseur et ne lit rien', async () => {
    const b = baseDeLaTache({ lignes: [PARRAIN], evenements: [NAISSANCE_CANDIDATURE] });
    const recent = T0.getTime() - (SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * 60_000 - 1);
    expect(
      await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports({ curseur: 7, passeAtMs: recent }))
    ).toEqual({ curseur: 7, passeAtMs: recent, naissancesLues: 0, ouvertes: 0 });
    expect(b.lectures).toEqual([]);
    // À la cadence exacte, il lit.
    const pile = T0.getTime() - SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * 60_000;
    expect(
      (await ouvrirLesAnomaliesDAutoParrainage(b.prisma, b.ports({ curseur: 7, passeAtMs: pile })))
        .curseur
    ).toBe(10);
  });

  it('REQ-SEC-031 : sans port de lecture, le journal se lit par son module, `lireJournalParLots`', async () => {
    const findMany = vi.fn(async () => []);
    const b = baseDeLaTache({ lignes: [PARRAIN], evenements: [] });
    const { lireJournal: _ignore, ...sansLecteur } = b.ports();
    void _ignore;
    const prisma = { ...(b.prisma as object), evenement: { findMany } } as unknown as PrismaClient;
    expect(await ouvrirLesAnomaliesDAutoParrainage(prisma, sansLecteur)).toEqual({
      curseur: 0,
      passeAtMs: T0.getTime(),
      naissancesLues: 0,
      ouvertes: 0,
    });
    expect(findMany).toHaveBeenCalledWith({ where: {}, orderBy: { id: 'asc' }, take: 1000 });
  });

  it('REQ-SEC-031 : le précédent passage se relit au battement de la tâche ; une forme inattendue vaut un premier passage', async () => {
    const lire = (compteurs: unknown) =>
      precedentDuBattement({
        battement: {
          findUnique: async (args: unknown) => {
            expect(args).toEqual({
              where: { tache: 'auto_parrainage_ouvrir' },
              select: { compteurs: true },
            });
            return compteurs === undefined ? null : { compteurs };
          },
        },
      } as unknown as PrismaClient)();
    expect(await lire({ curseur: 12, passeAtMs: 99, ouvertes: 1 })).toEqual({
      curseur: 12,
      passeAtMs: 99,
    });
    for (const c of [undefined, null, [], 'x', { curseur: '12', passeAtMs: 99 }, { curseur: 12 }]) {
      expect(await lire(c), JSON.stringify(c)).toBeNull();
    }
  });
});
