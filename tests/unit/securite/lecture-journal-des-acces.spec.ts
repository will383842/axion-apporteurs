// @req REQ-SEC-058
/**
 * La lecture du journal des accès à la console (`lireLeJournalDesAcces`), EN PROCESSUS, sur un faux
 * client : le droit du lecteur RELU (rôle, désactivation, validation), la cible vérifiée, la ligne de
 * la lecture écrite AVANT de lire, et la lecture exacte, sans empreinte réseau. La base réelle est
 * jugée par `tests/integration/lecture-journal-acces-console.spec.ts` ; ce témoin-ci existe pour que
 * la passe de mutation juge la fonction, puisqu'elle ne charge pas l'intégration.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, empreinteAdresseReseau } from '../../../src/server/securite/pii';
import {
  CibleInconnue,
  LectureDuJournalRefusee,
  lireLeJournalDesAcces,
} from '../../../src/server/console/journal-des-acces';

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-lecture-journal-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});
const LECTEUR = '0190f0f0-0000-7000-8000-0000000000a1';
const CIBLE = '0190f0f0-0000-7000-8000-0000000000c1';
const ADRESSE = '203.0.113.9';
const VALIDE = new Date('2026-01-01T00:00:00.000Z');

type Lu = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

/** Un faux client : le lecteur relu, la cible, les traces rendues, et l'ordre des appels. */
function univers(o: { lecteur?: Lu; cible?: boolean } = {}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const lecteur: Lu =
    o.lecteur === undefined ? { role: 'admin', desactiveAt: null, valideAt: VALIDE } : o.lecteur;
  const TRACES = [{ id: 't1', nature: 'connexion', cibleId: null, survenuAt: VALIDE }];
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: { where: { id: string } }) => {
        appels.push({ quoi: 'utilisateur.findUnique', args: a });
        if (a.where.id === LECTEUR) return lecteur;
        return o.cible === false ? null : { id: a.where.id };
      },
    },
    journalAccesConsole: {
      create: async (a: unknown) => {
        appels.push({ quoi: 'journal.create', args: a });
        return a;
      },
      findMany: async (a: unknown) => {
        appels.push({ quoi: 'journal.findMany', args: a });
        return TRACES;
      },
    },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, appels, TRACES };
}

const lire = (u: ReturnType<typeof univers>, adresse: string | null = ADRESSE) =>
  lireLeJournalDesAcces(
    u.client,
    { lecteurId: LECTEUR, utilisateurConsoleId: CIBLE, adresse },
    CLES
  );

describe('REQ-SEC-058 — lire le journal des accès, en processus', () => {
  it('REQ-SEC-058 : TÉMOIN — l’admin validé et actif lit : le lecteur relu, la cible vérifiée, SA ligne écrite AVANT la lecture, la lecture exacte', async () => {
    const u = univers();
    const traces = await lire(u);
    expect(traces).toBe(u.TRACES);
    expect(u.appels.map((a) => a.quoi)).toEqual([
      'utilisateur.findUnique',
      'utilisateur.findUnique',
      'journal.create',
      'journal.findMany',
    ]);
    expect(u.appels[0]!.args).toEqual({
      where: { id: LECTEUR },
      select: { role: true, desactiveAt: true, valideAt: true },
    });
    expect(u.appels[1]!.args).toEqual({ where: { id: CIBLE }, select: { id: true } });
    const creation = u.appels[2]!.args as { data: Record<string, unknown> };
    expect(creation.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      utilisateurConsoleId: LECTEUR,
      nature: 'lecture_journal_acces',
      cibleId: CIBLE,
      ipHash: empreinteAdresseReseau(ADRESSE, CLES),
    });
    expect(u.appels[3]!.args).toEqual({
      where: { utilisateurConsoleId: CIBLE },
      select: { id: true, nature: true, cibleId: true, survenuAt: true },
      orderBy: [{ survenuAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('REQ-SEC-058 : sans adresse réseau, la ligne n’a pas d’empreinte', async () => {
    const u = univers();
    await lire(u, null);
    expect((u.appels[2]!.args as { data: { ipHash: unknown } }).data.ipHash).toBeNull();
  });

  it('REQ-SEC-058 : TÉMOIN — un lecteur inconnu, désactivé, EN ATTENTE ou d’un autre rôle est refusé, sans rien écrire ni lire', async () => {
    for (const lecteur of [
      null,
      { role: 'admin', desactiveAt: VALIDE, valideAt: VALIDE },
      { role: 'admin', desactiveAt: null, valideAt: null },
      { role: 'qualifieur', desactiveAt: null, valideAt: null },
      { role: 'comptable', desactiveAt: null, valideAt: null },
      { role: 'lecteur', desactiveAt: null, valideAt: null },
    ]) {
      const u = univers({ lecteur });
      await expect(lire(u), JSON.stringify(lecteur)).rejects.toBeInstanceOf(
        LectureDuJournalRefusee
      );
      expect(u.appels.map((a) => a.quoi)).toEqual(['utilisateur.findUnique']);
    }
    const e = new LectureDuJournalRefusee();
    expect([e.name, e.message]).toEqual([
      'LectureDuJournalRefusee',
      'lecture du journal des accès refusée',
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — une cible inconnue n’écrit rien et ne lit rien', async () => {
    const u = univers({ cible: false });
    const e = await lire(u).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CibleInconnue);
    expect((e as Error).message).toBe('cible inconnue pour lecture_journal_acces');
    expect(u.appels.map((a) => a.quoi)).toEqual([
      'utilisateur.findUnique',
      'utilisateur.findUnique',
    ]);
  });
});
