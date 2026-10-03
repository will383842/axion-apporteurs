// @req REQ-SEC-003
/**
 * SEC-55 — l'appareil inconnu est un signal de sécurité du COMPTE, jamais une anomalie : jugé EN
 * PROCESSUS, sur des doubles. Ce que la base en fait (contraintes, purge, aucune trace ailleurs) est
 * jugé en base réelle par `tests/integration/appareil-inconnu.spec.ts`.
 *
 * LE CADRAGE DE LA LENTILLE SÉCURITÉ, point par point :
 *   (1) l'empreinte est minimale — un HMAC tronqué sous une clé dédiée, jamais l'adresse réseau ni
 *       l'identifiant en clair — et gardée au plus la durée des sessions ;
 *   (2) le SEUL effet est une confirmation renforcée avant l'action sensible, et un avis à l'adresse
 *       vérifiée ;
 *   (4) en échec fermé : une empreinte illisible compte comme un appareil inconnu ;
 *   (5) nouvel appareil → confirmation exigée, puis l'appareil est connu ; purge à l'échéance.
 * Les secrets sont factices, tirés pour ce fichier.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHmac, hkdfSync } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { kidDe } from '../../../src/lib/env';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import { empreinteDeSession, tirerJeton } from '../../../src/server/auth/lien-magique';
import {
  sessionRelevee,
  type LigneDeSession,
  type PortsDeSession,
  type SessionOuverte,
} from '../../../src/server/auth/session';
import {
  COOKIE_D_APPAREIL,
  cleDesAppareils,
  depotDAppareils,
  empreinteDAppareil,
  exigerAppareilConfirme,
  tirerIdentifiantDAppareil,
  type DepotDAppareils,
  type PortsDAppareil,
} from '../../../src/server/auth/appareil';
import { purgerLesAppareils } from '../../../src/server/taches/purger-appareils';
import { inscriptions } from '../../../src/server/taches/inscriptions';
import { TACHES } from '../../../src/server/taches/registre';

const SECRET_DES_SESSIONS = 'temoin-sec55-secret-des-sessions-'.padEnd(64, '0');
const KID_DES_SESSIONS = kidDe(SECRET_DES_SESSIONS);
const CLE = cleDesAppareils(SECRET_DES_SESSIONS);
const T = new Date('2026-10-03T12:00:00.000Z');
const SESSION_MS = DUREES_AUTH.sessionMs.valeur;
const RELEVE_MS = DUREES_AUTH.releveMs.valeur;
/** La limite de vue d'un appareil, écrite en clair : trente jours avant `T`. */
const VU_APRES = new Date('2026-09-03T12:00:00.000Z');
const APPORTEUR = '7c2d8e1a-0b3f-4c5d-8e9f-1a2b3c4d5e6f';
const IDENTIFIANT = 'Zq3x-vT8_bN2mK7pL4wR9sY1uC6eH0jA5dF2gI8oQ3k';

// ── les doubles ──────────────────────────────────────────────────────────────────────────────────

/** Une ligne de session saine, dont le lien a été consommé à `consommeAt`. */
function ligne(consommeAt: Date | null): LigneDeSession {
  return {
    id: 'session-x',
    apporteurId: APPORTEUR,
    kid: KID_DES_SESSIONS,
    expireAt: new Date(T.getTime() + SESSION_MS),
    revoqueAt: null,
    sessionVersion: 3,
    apporteur: { statut: 'signe', sessionVersion: 3 },
    lienMagique: { consommeAt },
  };
}

function portsDeSession(l: LigneDeSession | null): PortsDeSession {
  return {
    maintenant: () => T,
    depot: {
      lire: vi.fn(async () => l),
      marquerVue: vi.fn(async () => undefined),
      lister: vi.fn(async () => []),
      revoquer: vi.fn(async () => 0),
      incrementerVersion: vi.fn(async () => undefined),
    },
    configuration: { secret: SECRET_DES_SESSIONS, kid: KID_DES_SESSIONS },
  };
}

/** Les ports de la garde ; `ordre` note la suite des écritures et des avis. */
function ports(l: LigneDeSession | null, connu: boolean) {
  const ordre: string[] = [];
  const depot = {
    reconnaitre: vi.fn(async () => (connu ? 1 : 0)),
    confirmer: vi.fn(async () => {
      ordre.push('confirmer');
    }),
  } satisfies DepotDAppareils;
  const aviser = vi.fn(async () => {
    ordre.push('aviser');
  });
  const p: PortsDAppareil = { session: portsDeSession(l), depot, cle: CLE, aviser };
  return { p, depot, aviser, ordre };
}

const JETON = tirerJeton();
const EMPREINTE = createHmac('sha256', CLE.secret)
  .update(`partners.appareil.v1\u001f${IDENTIFIANT}`)
  .digest('hex')
  .slice(0, 32);
const APPAREIL = { apporteurId: APPORTEUR, empreinte: EMPREINTE, kid: CLE.kid };

// ── (1) l'empreinte, minimale ────────────────────────────────────────────────────────────────────

describe('REQ-SEC-003 — SEC-55 (1) : l’empreinte de l’appareil est minimale', () => {
  it('REQ-SEC-003 : un HMAC-SHA-256 tronqué à 128 bits, séparé par domaine, sous la clé donnée', () => {
    expect(empreinteDAppareil(IDENTIFIANT, CLE.secret)).toBe(EMPREINTE);
    expect(EMPREINTE).toMatch(/^[0-9a-f]{32}$/);
    expect(
      empreinteDAppareil(IDENTIFIANT, cleDesAppareils('une-autre-cle'.padEnd(64, '1')).secret)
    ).not.toBe(EMPREINTE);
    // Séparée par domaine : ni l'empreinte d'une session, ni un HMAC sans domaine.
    expect(EMPREINTE).not.toBe(empreinteDeSession(IDENTIFIANT, CLE.secret).slice(0, 32));
    expect(EMPREINTE).not.toBe(
      createHmac('sha256', CLE.secret).update(IDENTIFIANT).digest('hex').slice(0, 32)
    );
  });

  it('REQ-SEC-003 : échec fermé — un identifiant absent ou hors forme ne donne AUCUNE empreinte', () => {
    for (const illisible of [
      undefined,
      null,
      '',
      IDENTIFIANT.slice(1),
      `${IDENTIFIANT}a`,
      `${IDENTIFIANT.slice(1)}+`,
      `${IDENTIFIANT.slice(1)} `,
      42,
      { identifiant: IDENTIFIANT },
      // Un tableau dont la forme texte EST un identifiant (deux cookies du même nom, par exemple).
      [IDENTIFIANT],
    ]) {
      expect(empreinteDAppareil(illisible, CLE.secret), String(illisible)).toBeNull();
    }
  });

  it('REQ-SEC-003 : l’identifiant tiré est lisible — 32 octets en base64url —, et deux tirages diffèrent', () => {
    const a = tirerIdentifiantDAppareil();
    const b = tirerIdentifiantDAppareil();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(empreinteDAppareil(a, CLE.secret)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('REQ-SEC-003 : la clé des appareils est DÉDIÉE — dérivée du secret des sessions par HKDF, jamais ce secret —, avec son kid', () => {
    const attendue = Buffer.from(
      hkdfSync('sha256', SECRET_DES_SESSIONS, Buffer.alloc(0), 'partners.appareil.v1', 32)
    ).toString('hex');
    // Calculée DANS le test, jamais reprise de la constante du module, évaluée au chargement.
    expect(cleDesAppareils(SECRET_DES_SESSIONS)).toEqual({
      secret: attendue,
      kid: kidDe(attendue),
    });
    expect(CLE.secret).not.toBe(SECRET_DES_SESSIONS);
    expect(CLE.kid).not.toBe(KID_DES_SESSIONS);
    expect(cleDesAppareils('un-autre-secret'.padEnd(64, '2')).secret).not.toBe(CLE.secret);
  });

  it('REQ-SEC-003 : le cookie de l’appareil est `__Host-`, HttpOnly, Secure, SameSite=Lax, et vit au plus la durée d’une session', () => {
    expect(COOKIE_D_APPAREIL).toEqual({
      nom: '__Host-partners-appareil',
      attributs: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MS / 1000,
      },
    });
  });
});

// ── (2), (4), (5) la garde ───────────────────────────────────────────────────────────────────────

describe('REQ-SEC-003 — SEC-55 (2) : une confirmation renforcée avant toute action sensible', () => {
  it('REQ-SEC-003 : une session refusée est rendue telle quelle ; l’appareil n’est pas même lu', async () => {
    const { p, depot, aviser } = ports(ligne(T), false);
    expect(await exigerAppareilConfirme(undefined, IDENTIFIANT, p)).toEqual({
      ok: false,
      motif: 'absente',
    });
    const inconnue = ports(null, true);
    expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, inconnue.p)).toEqual({
      ok: false,
      motif: 'inconnue',
    });
    for (const d of [depot, inconnue.depot]) {
      expect(d.reconnaitre).not.toHaveBeenCalled();
      expect(d.confirmer).not.toHaveBeenCalled();
    }
    expect(aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : un appareil CONNU passe, sans avis ; il est reconnu pour CE compte, sous CETTE clé, vu depuis moins d’une session', async () => {
    const { p, depot, aviser } = ports(ligne(new Date(T.getTime() - 3 * 60 * 60 * 1000)), true);
    const verdict = await exigerAppareilConfirme(JETON, IDENTIFIANT, p);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.session.apporteurId).toBe(APPORTEUR);
    expect(depot.reconnaitre).toHaveBeenCalledTimes(1);
    expect(depot.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
    expect(depot.confirmer).not.toHaveBeenCalled();
    expect(aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : un appareil INCONNU, sur une session dont le lien a été consommé il y a dix minutes ou plus, est refusé (`appareil_inconnu`) ; rien n’est écrit, aucun avis', async () => {
    for (const consommeAt of [
      new Date(T.getTime() - RELEVE_MS),
      new Date(T.getTime() - 2 * 24 * 60 * 60 * 1000),
      null,
    ]) {
      const { p, depot, aviser } = ports(ligne(consommeAt), false);
      expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
      expect(depot.confirmer).not.toHaveBeenCalled();
      expect(aviser).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : la confirmation renforcée — un lien ou un code consommé sur CET appareil il y a moins de dix minutes : l’avis part à l’adresse vérifiée, PUIS l’appareil devient connu', async () => {
    const { p, depot, aviser, ordre } = ports(ligne(new Date(T.getTime() - RELEVE_MS + 1)), false);
    const verdict = await exigerAppareilConfirme(JETON, IDENTIFIANT, p);
    expect(verdict.ok).toBe(true);
    expect(ordre).toEqual(['aviser', 'confirmer']);
    // L'avis ne porte que le compte et l'instant : rien de l'appareil.
    expect(aviser).toHaveBeenCalledWith({ apporteurId: APPORTEUR, confirmeAt: T });
    expect(depot.confirmer).toHaveBeenCalledWith(APPAREIL, T);
  });

  it('REQ-SEC-003 : un avis qui échoue laisse l’appareil inconnu — l’erreur remonte, rien n’est écrit', async () => {
    const { p, depot, aviser } = ports(ligne(T), false);
    aviser.mockRejectedValueOnce(new Error('envoi_impossible'));
    await expect(exigerAppareilConfirme(JETON, IDENTIFIANT, p)).rejects.toThrow('envoi_impossible');
    expect(depot.confirmer).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : (4) échec fermé — un identifiant illisible est un appareil inconnu, que même une session fraîche ne confirme pas', async () => {
    for (const illisible of [undefined, '', 'abc', `${IDENTIFIANT} `]) {
      const { p, depot, aviser } = ports(ligne(T), true);
      expect(await exigerAppareilConfirme(JETON, illisible, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.reconnaitre).not.toHaveBeenCalled();
      expect(depot.confirmer).not.toHaveBeenCalled();
      expect(aviser).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : le verdict ne porte ni l’identifiant ni l’empreinte de l’appareil', async () => {
    const connu = await exigerAppareilConfirme(JETON, IDENTIFIANT, ports(ligne(T), true).p);
    const confirme = await exigerAppareilConfirme(JETON, IDENTIFIANT, ports(ligne(T), false).p);
    const refuse = await exigerAppareilConfirme(
      JETON,
      IDENTIFIANT,
      ports(ligne(new Date(0)), false).p
    );
    for (const v of [connu, confirme, refuse]) {
      const texte = JSON.stringify(v);
      expect(texte).not.toContain(IDENTIFIANT);
      expect(texte).not.toContain(EMPREINTE);
    }
  });
});

describe('REQ-SEC-003 — le relèvement, une règle et un seul juge', () => {
  const session = (consommeAt: Date | null): SessionOuverte => ({
    id: 'session-x',
    apporteurId: APPORTEUR,
    lienConsommeAt: consommeAt,
    niveau: 'plein',
    statut: 'signe',
  });

  it('REQ-SEC-003 : une session est relevée strictement moins de dix minutes après la consommation de son lien ; sans lien consommé, jamais', () => {
    expect(sessionRelevee(session(T), T)).toBe(true);
    expect(sessionRelevee(session(new Date(T.getTime() - RELEVE_MS + 1)), T)).toBe(true);
    expect(sessionRelevee(session(new Date(T.getTime() - RELEVE_MS)), T)).toBe(false);
    expect(sessionRelevee(session(null), T)).toBe(false);
  });
});

// ── le dépôt et la purge, tels que la base les reçoit ────────────────────────────────────────────

function unDouble() {
  const d = {
    appareilConnu: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 4 })),
    },
  };
  return { d, prisma: d as unknown as PrismaClient };
}

describe('REQ-SEC-003 — le dépôt des appareils, tel que la base le reçoit', () => {
  it('REQ-SEC-003 : reconnaître est UNE écriture conditionnelle — ce compte, cette empreinte, cette clé, vu après la limite — qui fait avancer la dernière vue', async () => {
    const { d, prisma } = unDouble();
    expect(await depotDAppareils(prisma).reconnaitre(APPAREIL, T, VU_APRES)).toBe(1);
    expect(d.appareilConnu.updateMany).toHaveBeenCalledWith({
      where: {
        apporteurId: APPORTEUR,
        empreinte: EMPREINTE,
        kid: CLE.kid,
        derniereVueAt: { gt: VU_APRES },
      },
      data: { derniereVueAt: T },
    });
  });

  it('REQ-SEC-003 : confirmer pose l’appareil, ou le rétablit, confirmé et vu à l’instant', async () => {
    const { d, prisma } = unDouble();
    await depotDAppareils(prisma).confirmer(APPAREIL, T);
    expect(d.appareilConnu.upsert).toHaveBeenCalledWith({
      where: { apporteurId_empreinte_kid: APPAREIL },
      create: { ...APPAREIL, confirmeAt: T, derniereVueAt: T },
      update: { confirmeAt: T, derniereVueAt: T },
    });
  });
});

describe('REQ-SEC-003 — SEC-55 (1) et (5) : la purge, au plus la durée d’une session après la dernière vue', () => {
  it('REQ-SEC-003 : UNE suppression des appareils vus pour la dernière fois il y a une durée de session ou plus ; le passage rend leur nombre', async () => {
    const { d, prisma } = unDouble();
    expect(await purgerLesAppareils(prisma, T)).toEqual({ purges: 4 });
    expect(d.appareilConnu.deleteMany).toHaveBeenCalledTimes(1);
    expect(d.appareilConnu.deleteMany).toHaveBeenCalledWith({
      where: { derniereVueAt: { lte: VU_APRES } },
    });
  });

  it('REQ-SEC-003 : la purge est une tâche du registre, sous son exigence, inscrite au lanceur à l’heure du système', async () => {
    expect(TACHES.appareils_purger).toEqual({ req: 'REQ-SEC-003' });
    const { d, prisma } = unDouble();
    const passage = inscriptions(prisma).appareils_purger;
    expect(typeof passage).toBe('function');
    vi.useFakeTimers({ now: T, toFake: ['Date'] });
    try {
      expect(await passage?.()).toEqual({ purges: 4 });
    } finally {
      vi.useRealTimers();
    }
    expect(d.appareilConnu.deleteMany).toHaveBeenCalledWith({
      where: { derniereVueAt: { lte: VU_APRES } },
    });
  });
});
