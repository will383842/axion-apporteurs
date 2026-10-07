// @req REQ-SEC-042
/**
 * SEC-52 — l'accès de la console aux coordonnées du contact d'une entreprise RÉSERVÉE s'écrit au journal
 * chaîné, par identifiants seuls. Jugé sans base : un faux client note chaque appel, dans l'ordre. La base
 * réelle (la chaîne, le verrou du SIREN tenu par une transaction concurrente) est jouée par
 * `tests/integration/acces-coordonnees.spec.ts`.
 *
 * CE QUE CE FICHIER GARDE : un accès pendant la réserve → UN événement, par identifiants seuls ; un accès hors
 * réserve (aucun acte, acte exempté, réserve échue) → aucun ; l'échec du jugement vaut réservé (échec
 * fermé) ; la trace précède la lecture et son échec ne laisse rien lire ; une cible inconnue est refusée sans
 * rien écrire ; et AUCUNE autre voie de la console ne lit les coordonnées du contact (témoin dérivé des
 * fichiers suivis).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { clesPii } from '../../../src/server/securite/pii';
import { CibleInconnue } from '../../../src/server/console/journal-des-acces';
import {
  lireLesCoordonneesDuContactDeLaConsole,
  tracerSiReservee,
} from '../../../src/server/securite/acces-coordonnees';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';

const CONSOLE = '11111111-1111-4111-8111-111111111111';
const ATTRIBUTION = '22222222-2222-4222-8222-222222222222';
const SIREN = '552100554';
const MAINTENANT = new Date('2026-10-07T12:00:00.000Z');
const JOUR = 24 * 60 * 60 * 1000;
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * JOUR);
const DUREE = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur;

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-52-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

type Appel = { quoi: string; args: unknown };
type Options = {
  cibleExiste?: boolean;
  verifications?: Array<{ resultat: string; verifieeAt: Date }>;
  refuses?: Array<{ motif: string; refuseAt: Date }>;
  enAttente?: Array<{ deposeeAt: Date }>;
  lectureDesActesEchoue?: boolean;
  ecritureDeLaTraceEchoue?: boolean;
};

/** Un faux client : chaque appel est noté, dans l'ordre ; les actes de l'apporteur sont ceux qu'on lui donne. */
function fauxClient(o: Options = {}) {
  const appels: Appel[] = [];
  const noter = (quoi: string, rendu: (args: unknown) => unknown) => async (args: unknown) => {
    appels.push({ quoi, args });
    return rendu(args);
  };
  const tx = {
    $executeRaw: async () => {
      appels.push({ quoi: '$executeRaw', args: null });
      return 0;
    },
    attribution: {
      findUnique: noter('attribution.findUnique', (args) => {
        if (o.cibleExiste === false) return null;
        const select = (args as { select: Record<string, boolean> }).select;
        return Object.fromEntries(
          Object.keys(select).map((k) => [k, k === 'siren' ? SIREN : k === 'id' ? 'x' : null])
        );
      }),
      findMany: noter('attribution.findMany', () => {
        if (o.lectureDesActesEchoue) throw new Error('base injoignable');
        return o.enAttente ?? [];
      }),
    },
    verification: { findMany: noter('verification.findMany', () => o.verifications ?? []) },
    depotRefuse: { findMany: noter('depotRefuse.findMany', () => o.refuses ?? []) },
    evenement: {
      findFirst: noter('evenement.findFirst', () => ({ selfHash: '0'.repeat(64) })),
      create: noter('evenement.create', () => {
        if (o.ecritureDeLaTraceEchoue) throw new Error('journal refusé');
        return { id: BigInt(1) };
      }),
    },
    journalAccesConsole: { create: noter('journalAccesConsole.create', () => ({})) },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, tx, appels };
}

const demande = { utilisateurConsoleId: CONSOLE, attributionId: ATTRIBUTION };
const evenements = (appels: Appel[]) => appels.filter((a) => a.quoi === 'evenement.create');

describe('REQ-SEC-042 — un accès pendant la réserve s’écrit au journal, par identifiants seuls', () => {
  it('REQ-SEC-042 : un accès pendant la réserve → UN événement, l’acteur et l’attribution seuls', async () => {
    const f = fauxClient({ verifications: [{ resultat: 'inconnue', verifieeAt: ilYa(2) }] });
    const trace = await tracerSiReservee(f.tx as never, demande, MAINTENANT);
    expect(trace).toBe(true);
    const ecrits = evenements(f.appels);
    expect(ecrits).toHaveLength(1);
    const data = (
      ecrits[0]!.args as {
        data: {
          type: string;
          agregat: string;
          agregatId: string;
          charge: unknown;
          survenuAt: Date;
        };
      }
    ).data;
    expect(data.type).toBe('acces_coordonnees_reservee');
    expect(data.agregat).toBe('attribution');
    expect(data.agregatId).toBe(ATTRIBUTION);
    expect(data.survenuAt).toEqual(MAINTENANT);
    // Par identifiants SEULS : l'acteur de la console, rien d'autre.
    expect(data.charge).toEqual({ acteur: { par: 'utilisateur_console', id: CONSOLE } });
    const serialise = JSON.stringify(data);
    for (const interdit of [SIREN, 'nom', 'email', 'telephone', 'apporteur', 'cause']) {
      expect(serialise, interdit).not.toContain(interdit);
    }
    // Le journal ferme sa charge : l'événement écrit passe le schéma de son type.
    expect(CHARGES_PAR_TYPE.acces_coordonnees_reservee.safeParse(data.charge).success).toBe(true);
  });

  it('REQ-SEC-042 : un dépôt refusé, ou en attente, ouvre la même réserve', async () => {
    const refuse = fauxClient({ refuses: [{ motif: 'deja_declaree', refuseAt: ilYa(3) }] });
    expect(await tracerSiReservee(refuse.tx as never, demande, MAINTENANT)).toBe(true);
    const attente = fauxClient({ enAttente: [{ deposeeAt: ilYa(3) }] });
    expect(await tracerSiReservee(attente.tx as never, demande, MAINTENANT)).toBe(true);
  });

  it('REQ-SEC-042 : un accès hors réserve → AUCUN événement (aucun acte, acte exempté, réserve échue)', async () => {
    const aucun = fauxClient();
    expect(await tracerSiReservee(aucun.tx as never, demande, MAINTENANT)).toBe(false);
    expect(evenements(aucun.appels)).toHaveLength(0);

    for (const resultat of ['suivie', 'cliente', 'liste_noire']) {
      const f = fauxClient({ verifications: [{ resultat, verifieeAt: ilYa(2) }] });
      expect(await tracerSiReservee(f.tx as never, demande, MAINTENANT), resultat).toBe(false);
      expect(evenements(f.appels), resultat).toHaveLength(0);
    }
    for (const motif of ['anteriorite_client', 'anteriorite_devis', 'file_complete']) {
      const f = fauxClient({ refuses: [{ motif, refuseAt: ilYa(2) }] });
      expect(await tracerSiReservee(f.tx as never, demande, MAINTENANT), motif).toBe(false);
      expect(evenements(f.appels), motif).toHaveLength(0);
    }
    const echue = fauxClient({
      verifications: [{ resultat: 'inconnue', verifieeAt: ilYa(DUREE + 1) }],
    });
    expect(await tracerSiReservee(echue.tx as never, demande, MAINTENANT)).toBe(false);
    expect(evenements(echue.appels)).toHaveLength(0);
  });

  it('REQ-SEC-042 : l’échec du jugement vaut RÉSERVÉ (échec fermé) — l’accès est tracé dans le doute', async () => {
    const f = fauxClient({ lectureDesActesEchoue: true });
    expect(await tracerSiReservee(f.tx as never, demande, MAINTENANT)).toBe(true);
    expect(evenements(f.appels)).toHaveLength(1);
  });

  it('REQ-SEC-042 : le verrou du SIREN est pris AVANT la lecture des actes', async () => {
    const f = fauxClient();
    await tracerSiReservee(f.tx as never, demande, MAINTENANT);
    const quoi = f.appels.map((a) => a.quoi);
    expect(quoi.indexOf('$executeRaw')).toBeGreaterThan(-1);
    expect(quoi.indexOf('$executeRaw')).toBeLessThan(quoi.indexOf('verification.findMany'));
  });

  it('REQ-SEC-042 : une cible inconnue est refusée sans rien tracer ni lire', async () => {
    const f = fauxClient({ cibleExiste: false });
    await expect(
      lireLesCoordonneesDuContactDeLaConsole(
        f.client,
        { ...demande, adresse: null },
        CLES,
        MAINTENANT
      )
    ).rejects.toBeInstanceOf(CibleInconnue);
    expect(evenements(f.appels)).toHaveLength(0);
    expect(f.appels.some((a) => a.quoi === 'journalAccesConsole.create')).toBe(false);
  });
});

describe('REQ-SEC-042 — la trace précède la lecture', () => {
  it('REQ-SEC-042 : l’événement est écrit AVANT la lecture des coordonnées', async () => {
    const f = fauxClient({ verifications: [{ resultat: 'inconnue', verifieeAt: ilYa(2) }] });
    await lireLesCoordonneesDuContactDeLaConsole(
      f.client,
      { ...demande, adresse: null },
      CLES,
      MAINTENANT
    );
    const quoi = f.appels.map((a) => a.quoi);
    const evenement = quoi.indexOf('evenement.create');
    const lecture = f.appels.findIndex(
      (a) =>
        a.quoi === 'attribution.findUnique' &&
        'nomContactChiffre' in ((a.args as { select: object }).select as object)
    );
    expect(evenement).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(evenement);
  });

  it('REQ-SEC-042 : une trace qui échoue ne laisse RIEN lire (échec fermé)', async () => {
    const f = fauxClient({
      verifications: [{ resultat: 'inconnue', verifieeAt: ilYa(2) }],
      ecritureDeLaTraceEchoue: true,
    });
    await expect(
      lireLesCoordonneesDuContactDeLaConsole(
        f.client,
        { ...demande, adresse: null },
        CLES,
        MAINTENANT
      )
    ).rejects.toThrow('journal refusé');
    expect(f.appels.some((a) => a.quoi === 'journalAccesConsole.create')).toBe(false);
    expect(
      f.appels.some(
        (a) =>
          a.quoi === 'attribution.findUnique' &&
          'nomContactChiffre' in ((a.args as { select: object }).select as object)
      )
    ).toBe(false);
  });

  it('REQ-SEC-042 : hors réserve, la lecture passe sans événement (la lecture n’est pas du démarchage)', async () => {
    const f = fauxClient();
    await lireLesCoordonneesDuContactDeLaConsole(
      f.client,
      { ...demande, adresse: null },
      CLES,
      MAINTENANT
    );
    expect(evenements(f.appels)).toHaveLength(0);
    // La lecture elle-même reste tracée au journal des accès (SEC-58).
    expect(f.appels.some((a) => a.quoi === 'journalAccesConsole.create')).toBe(true);
  });
});

describe('REQ-SEC-042 — TÉMOIN DU DISQUE : aucune autre voie de la console ne lit les coordonnées du contact', () => {
  const suivis = (): string[] =>
    execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  it('REQ-SEC-042 : seul l’accesseur importe le lecteur des coordonnées du contact', () => {
    const lecteurs = suivis().filter((f) =>
      /\blireCoordonneesDuContact\b/.test(readFileSync(f, 'utf8'))
    );
    expect(lecteurs.sort()).toEqual([
      'src/server/console/journal-des-acces.ts',
      'src/server/securite/acces-coordonnees.ts',
    ]);
  });

  it('REQ-SEC-042 : le témoin rougit sur un appelant neuf (preuve : le motif attrape une voie de la console)', () => {
    const voieClandestine =
      "import { lireCoordonneesDuContact } from '../console/journal-des-acces';";
    expect(/\blireCoordonneesDuContact\b/.test(voieClandestine)).toBe(true);
    expect(/\blireCoordonneesDuContact\b/.test('lireLesCoordonneesDuContactDeLaConsole')).toBe(
      false
    );
  });
});
