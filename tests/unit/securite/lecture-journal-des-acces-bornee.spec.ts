// @req REQ-SEC-058
/**
 * La lecture du journal des accès à la console est BORNÉE et PAGINÉE par curseur (sécurité, #707,
 * commentaire 5981305490) : une constante en SSOT, avec sa source ; un keyset sur
 * `(survenuAt desc, id desc)`, jamais un décalage ; un curseur opaque, validé à l'entrée ; la ligne
 * `lecture_journal_acces` écrite AVANT chaque page, dans la même transaction.
 *
 * Le faux client applique lui-même la clause `where` que la fonction lui passe, sur un journal en
 * mémoire trié comme la base : un keyset faux rend des trous ou des doublons, que la traversée voit.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PARAMETRES } from '../../../src/domain/seuils/ssot';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii } from '../../../src/server/securite/pii';
import {
  CurseurDuJournalIllisible,
  lireLeJournalDesAcces,
  type TraceDAcces,
} from '../../../src/server/console/journal-des-acces';

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-journal-borne-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});
const LECTEUR = '0190f0f0-0000-7000-8000-0000000000a1';
const CIBLE = '0190f0f0-0000-7000-8000-0000000000c1';
const AUTRE = '0190f0f0-0000-7000-8000-0000000000c2';
const VALIDE = new Date('2026-01-01T00:00:00.000Z');
const BORNE = (): number => PARAMETRES.JOURNAL_DES_ACCES_PAGE_MAX.valeur;

type Ligne = TraceDAcces & { utilisateurConsoleId: string };

/** L'ordre de la base : `survenuAt desc`, puis `id desc`. */
const avant = (a: Ligne, b: Ligne): number =>
  b.survenuAt.getTime() - a.survenuAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

type Comparaison = { lt?: Date | string };
type Clause = {
  utilisateurConsoleId: string;
  OR?: { survenuAt: Date | Comparaison; id?: Comparaison }[];
};

/** Juge UNE ligne contre une clause `where` de la forme que la lecture écrit — rien de plus. */
function satisfait(l: Ligne, w: Clause): boolean {
  if (Object.keys(w).some((k) => k !== 'utilisateurConsoleId' && k !== 'OR'))
    throw new Error(`clause inattendue : ${JSON.stringify(w)}`);
  if (l.utilisateurConsoleId !== w.utilisateurConsoleId) return false;
  if (w.OR === undefined) return true;
  return w.OR.some((o) => {
    const s = o.survenuAt;
    const t = l.survenuAt.getTime();
    const surS = s instanceof Date ? t === s.getTime() : s.lt instanceof Date && t < s.lt.getTime();
    const surId = o.id === undefined ? true : typeof o.id.lt === 'string' && l.id < o.id.lt;
    return surS && surId;
  });
}

/** Un journal en mémoire : `n` traces de la cible, dont des égalités sur `survenuAt`, et du bruit. */
function journal(n: number): Ligne[] {
  const lignes: Ligne[] = [];
  for (let k = 0; k < n; k += 1) {
    // Trois traces par milliseconde : le départage par `id` est indispensable.
    const survenuAt = new Date(VALIDE.getTime() + Math.floor(k / 3));
    lignes.push({
      id: randomUUID(),
      nature: 'connexion',
      cibleId: null,
      survenuAt,
      utilisateurConsoleId: CIBLE,
    });
    lignes.push({
      id: randomUUID(),
      nature: 'connexion',
      cibleId: null,
      survenuAt,
      utilisateurConsoleId: AUTRE,
    });
  }
  return lignes.sort(avant);
}

type Appel = { quoi: string; args: unknown };

function univers(lignes: Ligne[]) {
  const appels: Appel[] = [];
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: { where: { id: string } }) => {
        appels.push({ quoi: 'utilisateur.findUnique', args: a });
        return a.where.id === LECTEUR
          ? { role: 'admin', desactiveAt: null, valideAt: VALIDE }
          : { id: a.where.id };
      },
    },
    journalAccesConsole: {
      create: async (a: unknown) => {
        appels.push({ quoi: 'journal.create', args: a });
        return a;
      },
      findMany: async (a: { where: Clause; take?: number; skip?: number; orderBy: unknown }) => {
        appels.push({ quoi: 'journal.findMany', args: a });
        const rendues = lignes.filter((l) => satisfait(l, a.where));
        return (a.take === undefined ? rendues : rendues.slice(0, a.take)).map(
          ({ utilisateurConsoleId: _u, ...t }) => t
        );
      },
    },
  };
  let transactions = 0;
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels, transactions: () => transactions };
}

const lirePage = (u: ReturnType<typeof univers>, curseur?: string | null, cible = CIBLE) =>
  lireLeJournalDesAcces(
    u.client,
    { lecteurId: LECTEUR, utilisateurConsoleId: cible, adresse: null, curseur },
    CLES
  );

describe('REQ-SEC-058 — la borne de la lecture du journal des accès vit en SSOT', () => {
  it('REQ-SEC-058 : TÉMOIN — la borne est une constante de la SSOT, entière et positive, avec sa source et sa date', () => {
    const p = PARAMETRES.JOURNAL_DES_ACCES_PAGE_MAX;
    expect(Number.isInteger(p.valeur) && p.valeur > 0).toBe(true);
    expect(p.unite).toBe('traces');
    // La source, MOT POUR MOT de la sécurité (#563, commentaire 5987408790) : un PLAFOND du serveur.
    expect(p.valeur).toBe(50);
    expect(p.source).toBe(
      'SEC-67 ; sécurité, #707, commentaire 5981305490 ; valeur : sécurité, #563'
    );
    expect(p.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('REQ-SEC-058 — une page ne dépasse jamais la borne, et la suivante reprend exactement après', () => {
  it('REQ-SEC-058 : TÉMOIN — une page ne dépasse jamais la borne : `take` est la borne SSOT, sans décalage, dans l’ordre (survenuAt desc, id desc)', async () => {
    const u = univers(journal(BORNE() * 2 + 1));
    const page = await lirePage(u);
    expect(page.traces).toHaveLength(BORNE());
    const lecture = u.appels.find((a) => a.quoi === 'journal.findMany')!.args as Record<
      string,
      unknown
    >;
    expect(lecture['take']).toBe(BORNE());
    expect(lecture).not.toHaveProperty('skip');
    expect(lecture).not.toHaveProperty('cursor');
    expect(lecture['orderBy']).toEqual([{ survenuAt: 'desc' }, { id: 'desc' }]);
    expect(lecture['select']).toEqual({ id: true, nature: true, cibleId: true, survenuAt: true });
  });

  it('REQ-SEC-058 : TÉMOIN — la page suivante reprend EXACTEMENT après la dernière ligne rendue : la traversée rend tout le journal de la cible, une fois, dans l’ordre, malgré les égalités de date', async () => {
    const lignes = journal(BORNE() * 3 + 2);
    const u = univers(lignes);
    const vues: TraceDAcces[] = [];
    let curseur: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof lirePage>> = await lirePage(u, curseur);
      expect(page.traces.length).toBeLessThanOrEqual(BORNE());
      vues.push(...page.traces);
      curseur = page.suivant;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (curseur !== null);
    const attendues = lignes
      .filter((l) => l.utilisateurConsoleId === CIBLE)
      .map(({ utilisateurConsoleId: _u, ...t }) => t);
    expect(vues).toEqual(attendues);
    expect(new Set(vues.map((t) => t.id)).size).toBe(vues.length);
  });

  it('REQ-SEC-058 : une page qui n’est pas pleine est la dernière : `suivant` est nul ; un journal vide rend une page vide', async () => {
    const court = await lirePage(univers(journal(BORNE() - 1)));
    expect([court.traces.length, court.suivant]).toEqual([BORNE() - 1, null]);
    const vide = await lirePage(univers([]));
    expect(vide).toEqual({ traces: [], suivant: null });
  });

  it('REQ-SEC-058 : TÉMOIN — chaque page écrit SA ligne `lecture_journal_acces` AVANT de lire, dans la même transaction', async () => {
    const u = univers(journal(BORNE() + 1));
    const premiere = await lirePage(u);
    await lirePage(u, premiere.suivant);
    expect(u.transactions()).toBe(2);
    const ordre = u.appels.map((a) => a.quoi);
    expect(ordre).toEqual([
      'utilisateur.findUnique',
      'utilisateur.findUnique',
      'journal.create',
      'journal.findMany',
      'utilisateur.findUnique',
      'utilisateur.findUnique',
      'journal.create',
      'journal.findMany',
    ]);
    const natures = u.appels
      .filter((a) => a.quoi === 'journal.create')
      .map((a) => (a.args as { data: { nature: string; cibleId: string } }).data);
    expect(natures).toEqual([
      expect.objectContaining({ nature: 'lecture_journal_acces', cibleId: CIBLE }),
      expect.objectContaining({ nature: 'lecture_journal_acces', cibleId: CIBLE }),
    ]);
  });
});

describe('REQ-SEC-058 — une page vide se trace comme une autre', () => {
  it('REQ-SEC-058 : TÉMOIN — une page VIDE écrit sa ligne `lecture_journal_acces` avant de lire : au bout d’un journal plein à la borne, et sur un journal vide', async () => {
    const plein = univers(journal(BORNE()));
    const premiere = await lirePage(plein);
    expect(premiere.suivant).not.toBeNull();
    const vide = await lirePage(plein, premiere.suivant);
    expect(vide).toEqual({ traces: [], suivant: null });
    expect(plein.appels.slice(4).map((a) => a.quoi)).toEqual([
      'utilisateur.findUnique',
      'utilisateur.findUnique',
      'journal.create',
      'journal.findMany',
    ]);
    const neuf = univers([]);
    await lirePage(neuf);
    expect(neuf.appels.map((a) => a.quoi)).toEqual([
      'utilisateur.findUnique',
      'utilisateur.findUnique',
      'journal.create',
      'journal.findMany',
    ]);
  });
});

describe('REQ-SEC-058 — le curseur est opaque, et validé à l’entrée', () => {
  it('REQ-SEC-058 : le curseur rendu est opaque : ni la date, ni l’identifiant de la trace ne s’y lisent en clair', async () => {
    const u = univers(journal(BORNE() + 1));
    const page = await lirePage(u);
    const derniere = page.traces.at(-1)!;
    expect(page.suivant).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(page.suivant).not.toContain(derniere.id);
    expect(page.suivant).not.toContain(derniere.survenuAt.toISOString());
  });

  it('REQ-SEC-058 : TÉMOIN — un curseur forgé ou illisible est refusé SANS RIEN LIRE, ni rien écrire', async () => {
    const valide = (await lirePage(univers(journal(BORNE() + 1)))).suivant!;
    const charge = (o: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
    const decode = JSON.parse(Buffer.from(valide, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const forges: [string, string][] = [
      ['vide', ''],
      ['hors alphabet', valide + '='],
      ['pas du JSON', Buffer.from('pas du json', 'utf8').toString('base64url')],
      ['un tableau', charge([] as unknown as Record<string, unknown>)],
      ['autre version', charge({ ...decode, v: 'j0' })],
      ['autre cible', charge({ ...decode, u: AUTRE })],
      ['identifiant qui n’est pas un UUID', charge({ ...decode, i: '1 OR 1=1' })],
      ['date illisible', charge({ ...decode, s: 'hier' })],
      ['date non canonique', charge({ ...decode, s: '2026-01-01' })],
      ['champ en trop', charge({ ...decode, skip: 10 })],
      ['champ manquant', charge({ v: decode['v'], u: decode['u'], s: decode['s'] })],
      ['trop long', 'A'.repeat(1024)],
    ];
    for (const [nom, curseur] of forges) {
      const u = univers(journal(BORNE() + 1));
      const e = await lirePage(u, curseur).catch((x: unknown) => x);
      expect(e, nom).toBeInstanceOf(CurseurDuJournalIllisible);
      expect(u.transactions(), nom).toBe(0);
      expect(u.appels, nom).toEqual([]);
    }
    const e = new CurseurDuJournalIllisible();
    expect([e.name, e.message]).toEqual([
      'CurseurDuJournalIllisible',
      'curseur du journal des accès illisible',
    ]);
  });

  it('REQ-SEC-058 : contre-témoin — le curseur rendu pour une cible est accepté pour cette cible', async () => {
    const u = univers(journal(BORNE() + 1));
    const page = await lirePage(u);
    await expect(lirePage(u, page.suivant)).resolves.toMatchObject({ suivant: null });
  });
});

describe('REQ-SEC-058 — aucun décalage dans le module', () => {
  it('REQ-SEC-058 : TÉMOIN — la lecture du journal n’emploie ni `skip`, ni `offset`, ni le curseur natif de Prisma', () => {
    const source = readFileSync('src/server/console/journal-des-acces.ts', 'utf8');
    const lecture = source.slice(source.indexOf('export async function lireLeJournalDesAcces'));
    expect(lecture.length).toBeGreaterThan(0);
    expect(lecture).not.toMatch(/\bskip\s*:/);
    expect(lecture).not.toMatch(/\boffset\b/i);
    expect(lecture).not.toMatch(/\bcursor\s*:/);
  });
});
