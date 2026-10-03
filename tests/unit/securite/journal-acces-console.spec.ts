// @req REQ-SEC-058
/**
 * SEC-58 — le journal des accès à la console, par identifiants seuls, jugé sans base : un faux client
 * enregistre chaque appel, dans l'ordre. La base réelle (ajout seul par le gabarit commun, CHECK,
 * purge qui vide les identifiants) est jouée par `tests/integration/journal-des-acces-console.spec.ts`.
 *
 * CE QUE CE FICHIER GARDE : la trace est écrite AVANT la lecture, dans la même transaction, et une
 * trace qui échoue ne laisse rien lire (échec fermé) ; une cible inconnue est refusée sans trace ; une
 * connexion réussie se trace sans cible, avec l'empreinte tronquée de l'adresse réseau ; la purge
 * VIDE l'utilisateur, la cible et l'empreinte de l'échu seul, pose sa date, par lots, et s'arrête sur
 * un lot vide ; aucune lecture de coordonnées ne contourne le lecteur unique ; rien ne supprime.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  CibleInconnue,
  journaliserConnexionConsole,
  lireCoordonneesDeLApporteur,
  lireCoordonneesDuContact,
} from '../../../src/server/console/journal-des-acces';
import {
  LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../../src/server/taches/purger-journal-acces-console';
import { clesPii } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const UTILISATEUR = '0190a5c0-0000-7000-8000-000000000001';
const APPORTEUR = '0190a5c0-0000-7000-8000-000000000002';
const ATTRIBUTION = '0190a5c0-0000-7000-8000-000000000003';
const IP_HASH = '0123456789abcdef';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

type Appel = { quoi: string; args: unknown };

/** Un faux client : chaque appel est noté ; `trace` lève si demandé ; les lignes n'ont aucun bloc. */
function fauxClient(o: { cibleExiste?: boolean; traceEchoue?: boolean } = {}) {
  const appels: Appel[] = [];
  const noter = (quoi: string) => async (args: unknown) => {
    appels.push({ quoi, args });
    if (quoi === 'journalAccesConsole.create' && o.traceEchoue) throw new Error('trace refusée');
    if (quoi.endsWith('.findUnique')) {
      const select = (args as { select: Record<string, boolean> }).select;
      if (o.cibleExiste === false) return null;
      return Object.fromEntries(Object.keys(select).map((k) => [k, k === 'id' ? 'x' : null]));
    }
    return {};
  };
  const tx = {
    journalAccesConsole: { create: noter('journalAccesConsole.create') },
    apporteur: { findUnique: noter('apporteur.findUnique') },
    attribution: { findUnique: noter('attribution.findUnique') },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, appels };
}

/** Les champs lus par chaque `findUnique`, dans l'ordre. */
const lectures = (appels: Appel[]) =>
  appels
    .filter((a) => a.quoi.endsWith('.findUnique'))
    .map((a) => Object.keys((a.args as { select: object }).select).sort());

describe('REQ-SEC-058 — la trace d’une lecture de coordonnées précède la lecture', () => {
  it('REQ-SEC-058 : TÉMOIN — apporteur : la cible est vérifiée par son id, la trace est écrite, PUIS les blocs sont lus', async () => {
    const f = fauxClient();
    await lireCoordonneesDeLApporteur(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, ipHash: IP_HASH },
      CLES
    );
    expect(f.appels.map((a) => a.quoi)).toEqual([
      'apporteur.findUnique',
      'journalAccesConsole.create',
      'apporteur.findUnique',
    ]);
    expect(lectures(f.appels)[0]).toEqual(['id']);
    expect(f.appels[1]!.args).toEqual({
      data: expect.objectContaining({
        utilisateurConsoleId: UTILISATEUR,
        nature: 'lecture_coordonnees_apporteur',
        cibleId: APPORTEUR,
        ipHash: IP_HASH,
      }),
    });
  });

  it('REQ-SEC-058 : TÉMOIN — contact : la même suite, sur l’attribution qui le porte', async () => {
    const f = fauxClient();
    await lireCoordonneesDuContact(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, ipHash: null },
      CLES
    );
    expect(f.appels.map((a) => a.quoi)).toEqual([
      'attribution.findUnique',
      'journalAccesConsole.create',
      'attribution.findUnique',
    ]);
    expect(f.appels[1]!.args).toEqual({
      data: expect.objectContaining({
        nature: 'lecture_coordonnees_contact',
        cibleId: ATTRIBUTION,
      }),
    });
  });

  it('REQ-SEC-058 : TÉMOIN — ÉCHEC FERMÉ : une trace qui échoue ne laisse lire aucun bloc', async () => {
    const f = fauxClient({ traceEchoue: true });
    await expect(
      lireCoordonneesDeLApporteur(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, ipHash: null },
        CLES
      )
    ).rejects.toThrow('trace refusée');
    expect(lectures(f.appels)).toEqual([['id']]);
  });

  it('REQ-SEC-058 : TÉMOIN — une cible inconnue est refusée, nommée, et rien n’est tracé', async () => {
    const f = fauxClient({ cibleExiste: false });
    await expect(
      lireCoordonneesDuContact(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, ipHash: null },
        CLES
      )
    ).rejects.toBeInstanceOf(CibleInconnue);
    expect(f.appels.map((a) => a.quoi)).toEqual(['attribution.findUnique']);
  });

  it('REQ-SEC-058 : une connexion réussie se trace sans cible, avec l’empreinte tronquée, et rien d’autre', async () => {
    const f = fauxClient();
    await journaliserConnexionConsole(f.client, {
      utilisateurConsoleId: UTILISATEUR,
      ipHash: IP_HASH,
    });
    expect(f.appels).toHaveLength(1);
    const { data } = f.appels[0]!.args as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      utilisateurConsoleId: UTILISATEUR,
      nature: 'connexion',
      cibleId: null,
      ipHash: IP_HASH,
    });
    expect(Object.keys(data).sort()).toEqual([
      'cibleId',
      'id',
      'ipHash',
      'nature',
      'utilisateurConsoleId',
    ]);
  });
});

// ── la purge ────────────────────────────────────────────────────────────────────────────────────

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');

function fauxClientDePurge(lots: number[], compte: (n: number) => number = (n) => n) {
  const lectures: unknown[] = [];
  const ecritures: { where: unknown; data: unknown }[] = [];
  let rang = 0;
  const client = {
    journalAccesConsole: {
      findMany: async (a: unknown) => {
        lectures.push(a);
        const n = lots[rang] ?? 0;
        rang += 1;
        return Array.from({ length: n }, (_, i) => ({ id: `j-${rang}-${i}` }));
      },
      updateMany: async (a: { where: { id: { in: string[] } }; data: unknown }) => {
        ecritures.push(a);
        return { count: compte(a.where.id.in.length) };
      },
    },
  } as unknown as PrismaClient;
  return { client, lectures, ecritures };
}

describe('REQ-SEC-058 — la purge à l’échéance vide les identifiants, la ligne nue reste', () => {
  it('REQ-SEC-058 : la durée vient de la SSOT des durées : douze mois, décision de Williams', () => {
    expect(SEUILS.JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS).toMatchObject({
      valeur: 12,
      unite: 'mois',
    });
    expect(limiteDuJournalDesAcces(MAINTENANT)).toEqual(new Date('2026-10-03T12:00:00.000Z'));
  });

  it('REQ-SEC-058 : TÉMOIN — chaque lecture vise l’échu NON purgé, ordonnée, bornée au lot', async () => {
    const f = fauxClientDePurge([1]);
    await purgerLeJournalDesAccesConsole(f.client, MAINTENANT);
    expect(f.lectures[0]).toEqual({
      where: { survenuAt: { lt: limiteDuJournalDesAcces(MAINTENANT) }, purgeAt: null },
      select: { id: true },
      orderBy: [{ survenuAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
    });
  });

  it('REQ-SEC-058 : TÉMOIN — la purge VIDE l’utilisateur, la cible et l’empreinte, et pose sa date, en une écriture par lot', async () => {
    const f = fauxClientDePurge([2]);
    await purgerLeJournalDesAccesConsole(f.client, MAINTENANT);
    expect(f.ecritures).toEqual([
      {
        where: { id: { in: ['j-1-0', 'j-1-1'] }, purgeAt: null },
        data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: MAINTENANT },
      },
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — par lots jusqu’à épuisement, la somme est celle de la base, et un lot qui n’enlève rien arrête', async () => {
    const f = fauxClientDePurge([LOT_DE_PURGE_DU_JOURNAL_DES_ACCES, 3]);
    expect(await purgerLeJournalDesAccesConsole(f.client, MAINTENANT)).toEqual({
      purgees: LOT_DE_PURGE_DU_JOURNAL_DES_ACCES + 3,
    });
    const g = fauxClientDePurge([2, 2, 2], () => 0);
    expect(await purgerLeJournalDesAccesConsole(g.client, MAINTENANT)).toEqual({ purgees: 0 });
    expect(g.ecritures).toHaveLength(1);
  });
});

// ── les témoins statiques ───────────────────────────────────────────────────────────────────────

function fichiers(racine: string): string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine).flatMap((n) => {
    const p = join(racine, n).replace(/\\/g, '/');
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe('REQ-SEC-058 — aucune lecture ne contourne la trace, et rien ne supprime', () => {
  it('REQ-SEC-058 : TÉMOIN — sous la console, seul le lecteur unique déchiffre', () => {
    const LECTEUR = 'src/server/console/journal-des-acces.ts';
    const fautifs = [...fichiers('src/server/console'), ...fichiers('src/app/console')]
      .filter((f) => f !== LECTEUR)
      .filter((f) => /\bdecryptPii\b/.test(readFileSync(f, 'utf8')));
    expect(fautifs).toEqual([]);
    expect(readFileSync(LECTEUR, 'utf8')).toMatch(/\bdecryptPii\b/);
  });

  it('REQ-SEC-058 : TÉMOIN — aucun code ne supprime une trace : la purge vide, elle n’efface pas', () => {
    const fautifs = fichiers('src').filter((f) =>
      /journalAccesConsole\.(delete|deleteMany)\b|DELETE FROM\s+"?journal_acces_console/.test(
        readFileSync(f, 'utf8')
      )
    );
    expect(fautifs).toEqual([]);
  });
});
