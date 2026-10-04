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
 *       vérifiée ; la confirmation a lieu À LA CONSOMMATION du lien ou du code, dans sa transaction,
 *       sur l'appareil qui consomme — la garde ne confirme jamais, et une session fraîche présentée
 *       depuis un autre appareil est refusée (note de la lentille sécurité sur 4913c6a3 : un cookie
 *       de session volé ne doit faire connaître aucun appareil) ;
 *   (4) en échec fermé : une empreinte illisible compte comme un appareil inconnu ;
 *   (5) nouvel appareil → confirmation exigée, puis l'appareil est connu ; purge à l'échéance.
 * Les secrets sont factices, tirés pour ce fichier.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHmac, hkdfSync } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { kidDe } from '../../../src/lib/env';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import {
  consommerLien,
  empreinteDeSession,
  empreinteDuCode,
  tirerJeton,
  verifierLeCode,
  type PortsDeConsommation,
  type PortsDuCode,
  type TransactionDeConsommation,
  type TransactionDuCode,
} from '../../../src/server/auth/lien-magique';
import {
  sessionRelevee,
  type LigneDeSession,
  type PortsDeSession,
  type SessionOuverte,
} from '../../../src/server/auth/session';
import {
  COOKIE_D_APPAREIL,
  cleDesAppareils,
  confirmerALaConsommation,
  depotDAppareils,
  empreinteDAppareil,
  exigerAppareilConfirme,
  jugerAppareil,
  tirerIdentifiantDAppareil,
  type AppareilVu,
  type AvisDAppareil,
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

/** Les ports de la garde ; `ordre` note la suite des écritures. */
function ports(l: LigneDeSession | null, connu: boolean) {
  const ordre: string[] = [];
  const depot = {
    reconnaitre: vi.fn(async () => (connu ? 1 : 0)),
    confirmer: vi.fn(async () => {
      ordre.push('confirmer');
    }),
  } satisfies DepotDAppareils;
  const p: PortsDAppareil = { session: portsDeSession(l), depot, cle: CLE };
  return { p, depot, ordre };
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

describe('REQ-SEC-003 — SEC-55 (2) : la garde refuse tout appareil inconnu ; elle ne confirme jamais', () => {
  it('REQ-SEC-003 : une session refusée est rendue telle quelle ; l’appareil n’est pas même lu', async () => {
    const { p, depot } = ports(ligne(T), false);
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
  });

  it('REQ-SEC-003 : un appareil CONNU passe ; il est reconnu pour CE compte, sous CETTE clé, vu depuis moins d’une session', async () => {
    const { p, depot } = ports(ligne(new Date(T.getTime() - 3 * 60 * 60 * 1000)), true);
    const verdict = await exigerAppareilConfirme(JETON, IDENTIFIANT, p);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.session.apporteurId).toBe(APPORTEUR);
    expect(depot.reconnaitre).toHaveBeenCalledTimes(1);
    expect(depot.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
    expect(depot.confirmer).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : un appareil INCONNU est refusé (`appareil_inconnu`), quelle que soit l’ancienneté de la session ; rien n’est écrit', async () => {
    for (const consommeAt of [
      new Date(T.getTime() - RELEVE_MS),
      new Date(T.getTime() - 2 * 24 * 60 * 60 * 1000),
      null,
    ]) {
      const { p, depot } = ports(ligne(consommeAt), false);
      expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
      expect(depot.confirmer).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : TÉMOIN DE LA LENTILLE SÉCURITÉ — une session FRAÎCHE (lien consommé il y a moins de dix minutes), présentée depuis un AUTRE appareil, est refusée et rien n’est confirmé : un cookie de session volé ne fait connaître aucun appareil', async () => {
    for (const age of [0, 1, RELEVE_MS - 1]) {
      const { p, depot } = ports(ligne(new Date(T.getTime() - age)), false);
      expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.confirmer).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : (4) échec fermé — un identifiant illisible est un appareil inconnu, que rien ne lit ni n’écrit', async () => {
    for (const illisible of [undefined, '', 'abc', `${IDENTIFIANT} `, ['x'], 7]) {
      const { p, depot } = ports(ligne(T), true);
      expect(await exigerAppareilConfirme(JETON, illisible, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.reconnaitre).not.toHaveBeenCalled();
      expect(depot.confirmer).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : le verdict ne porte ni l’identifiant ni l’empreinte de l’appareil', async () => {
    const connu = await exigerAppareilConfirme(JETON, IDENTIFIANT, ports(ligne(T), true).p);
    const refuseFrais = await exigerAppareilConfirme(JETON, IDENTIFIANT, ports(ligne(T), false).p);
    const refuseAncien = await exigerAppareilConfirme(
      JETON,
      IDENTIFIANT,
      ports(ligne(new Date(0)), false).p
    );
    for (const v of [connu, refuseFrais, refuseAncien]) {
      const texte = JSON.stringify(v);
      expect(texte).not.toContain(IDENTIFIANT);
      expect(texte).not.toContain(EMPREINTE);
    }
  });
});

describe('REQ-SEC-003 — SEC-55 dans une action de l’espace : après `actionEspace` (SEC-53)', () => {
  const session = (consommeAt: Date | null): SessionOuverte => ({
    id: 'session-x',
    apporteurId: APPORTEUR,
    lienConsommeAt: consommeAt,
    niveau: 'plein',
    statut: 'signe',
  });

  it('REQ-SEC-003 : `jugerAppareil` juge la session DÉJÀ acceptée, sans la relire : connu, il passe ; inconnu, frais ou ancien, refusé, et rien n’est confirmé', async () => {
    const connu = ports(ligne(T), true);
    expect(await jugerAppareil(session(new Date(0)), IDENTIFIANT, connu.p)).toEqual({ ok: true });
    expect(connu.p.session.depot.lire).not.toHaveBeenCalled();

    for (const consommeAt of [T, new Date(0)]) {
      const inconnu = ports(ligne(T), false);
      expect(await jugerAppareil(session(consommeAt), IDENTIFIANT, inconnu.p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(await jugerAppareil(session(consommeAt), undefined, inconnu.p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(inconnu.depot.confirmer).not.toHaveBeenCalled();
      expect(inconnu.p.session.depot.lire).not.toHaveBeenCalled();
    }
  });
});

// ── la confirmation, à la CONSOMMATION du lien ou du code, sur l'appareil qui consomme ──────────

/** Un dépôt d'appareils EN MÉMOIRE, qui note la suite des écritures et des avis dans `ordre`. */
function depotEnMemoire(ordre: string[], connus: string[] = []) {
  const vus = new Set(connus);
  return {
    reconnaitre: vi.fn(async (a: AppareilVu, _maintenant: Date, _vuApres: Date) =>
      vus.has(a.empreinte) ? 1 : 0
    ),
    confirmer: vi.fn(async (a: AppareilVu, _maintenant: Date) => {
      ordre.push('confirmer');
      vus.add(a.empreinte);
    }),
  } satisfies DepotDAppareils;
}

const SECRET_DES_LIENS = 'temoin-sec55-secret-des-liens-'.padEnd(64, '0');
const CONFIGURATION_DU_LIEN = {
  secret: SECRET_DES_LIENS,
  kid: kidDe(SECRET_DES_LIENS),
  urlPublique: 'https://partners.example.org',
  session: { secret: SECRET_DES_SESSIONS, kid: KID_DES_SESSIONS },
};
const LIEN = { id: 'lien-x', apporteurId: APPORTEUR, kid: CONFIGURATION_DU_LIEN.kid };

/** Une transaction de consommation en mémoire ; `enTransaction` dit si l'appel a lieu DEDANS. */
function consommation(o: { connus?: string[]; aviser?: (avis: AvisDAppareil) => Promise<void> }) {
  const ordre: string[] = [];
  let enTransaction = false;
  const appareils = depotEnMemoire(ordre, o.connus);
  const dansLaTransaction: string[] = [];
  const tx: TransactionDeConsommation = {
    consommer: vi.fn(async () => 1),
    lireLien: vi.fn(async () => LIEN),
    statutApporteur: vi.fn(async () => 'signe'),
    ouvrirSession: vi.fn(async () => {
      ordre.push('ouvrirSession');
    }),
    appareils: {
      reconnaitre: async (...a) => {
        if (enTransaction) dansLaTransaction.push('reconnaitre');
        return appareils.reconnaitre(...a);
      },
      confirmer: async (...a) => {
        if (enTransaction) dansLaTransaction.push('confirmer');
        return appareils.confirmer(...a);
      },
    },
  };
  const aviser = vi.fn(
    o.aviser ??
      (async () => {
        ordre.push('aviser');
      })
  );
  const p: PortsDeConsommation = {
    maintenant: () => T,
    configuration: CONFIGURATION_DU_LIEN,
    transaction: async (travail) => {
      enTransaction = true;
      try {
        return await travail(tx);
      } finally {
        enTransaction = false;
      }
    },
    appareils: { aviser },
  };
  return { p, tx, aviser, appareils, ordre, dansLaTransaction };
}

/** Une transaction du code en mémoire : le bon code consomme le lien et ouvre la session. */
function verificationDuCode(o: { connus?: string[] } = {}) {
  const ordre: string[] = [];
  const appareils = depotEnMemoire(ordre, o.connus);
  const tx: TransactionDuCode = {
    lienActifDe: vi.fn(async () => LIEN),
    compterEssai: vi.fn(async () => ({
      codeHash: empreinteDuCode(CODE, CONFIGURATION_DU_LIEN.secret),
      tentatives: 1,
    })),
    annulerLien: vi.fn(async () => undefined),
    consommerParId: vi.fn(async () => 1),
    statutApporteur: vi.fn(async () => 'signe'),
    ouvrirSession: vi.fn(async () => {
      ordre.push('ouvrirSession');
    }),
    appareils,
  };
  const aviser = vi.fn(async () => {
    ordre.push('aviser');
  });
  const permis = async () => ({ autorise: true, panne: false });
  const p: PortsDuCode = {
    maintenant: () => T,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => '0123456789abcdef',
    compterAdresseCode: permis,
    compterCourrielCode: permis,
    transaction: (travail) => travail(tx),
    signaler: () => undefined,
    configuration: CONFIGURATION_DU_LIEN,
    appareils: { aviser },
  };
  return { p, tx, aviser, appareils, ordre };
}

const CODE = '042137';
const EMPREINTE_D_ATTENTE = 'ab'.repeat(32);
const FORME_IDENTIFIANT = /^[A-Za-z0-9_-]{43}$/;

describe('REQ-SEC-003 — SEC-55 (2) : l’appareil se confirme à la CONSOMMATION du lien ou du code, sur l’appareil qui consomme', () => {
  it('REQ-SEC-003 : un appareil NEUF pour ce compte — dans la transaction de la consommation : la session, PUIS l’avis, PUIS la confirmation ; l’identifiant lu est rendu à poser', async () => {
    const c = consommation({});
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'confirme' },
    });
    expect(c.ordre).toEqual(['ouvrirSession', 'aviser', 'confirmer']);
    expect(c.dansLaTransaction).toEqual(['reconnaitre', 'confirmer']);
    expect(c.appareils.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
    expect(c.appareils.confirmer).toHaveBeenCalledWith(APPAREIL, T);
    // L'avis ne porte que le compte et l'instant : rien de l'appareil.
    expect(c.aviser).toHaveBeenCalledWith({ apporteurId: APPORTEUR, confirmeAt: T });
  });

  it('REQ-SEC-003 : un appareil DÉJÀ CONNU de ce compte — reconnu, sa vue avance ; ni avis ni nouvelle confirmation', async () => {
    const c = consommation({ connus: [EMPREINTE] });
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'connu' },
    });
    expect(c.aviser).not.toHaveBeenCalled();
    expect(c.appareils.confirmer).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : sans identifiant, ou hors forme — un identifiant NEUF est tiré, confirmé avec son avis, et rendu à poser ; jamais le hors-forme', async () => {
    for (const lu of [undefined, null, '', 'abc', `${IDENTIFIANT}=`, ['x']]) {
      const c = consommation({});
      const r = await consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: lu }, c.p);
      expect(r.etat).toBe('ouverte');
      const appareil = r.etat === 'ouverte' ? r.appareil : undefined;
      expect(appareil?.issue).toBe('confirme');
      expect(appareil?.identifiant).toMatch(FORME_IDENTIFIANT);
      expect(appareil?.identifiant).not.toBe(lu);
      expect(c.appareils.confirmer).toHaveBeenCalledWith(
        {
          apporteurId: APPORTEUR,
          empreinte: empreinteDAppareil(appareil?.identifiant, CLE.secret),
          kid: CLE.kid,
        },
        T
      );
      expect(c.ordre).toEqual(['ouvrirSession', 'aviser', 'confirmer']);
    }
  });

  it('REQ-SEC-003 : un avis qui échoue laisse l’appareil INCONNU — la session s’ouvre, rien n’est confirmé, l’issue le dit', async () => {
    const c = consommation({
      aviser: async () => {
        throw new Error('envoi_impossible');
      },
    });
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'avis_echoue' },
    });
    expect(c.appareils.confirmer).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : un lien invalide ou déjà utilisé ne lit ni n’écrit aucun appareil, et n’envoie aucun avis', async () => {
    const c = consommation({});
    (c.tx.consommer as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toEqual({ etat: 'lien_invalide' });
    expect(c.appareils.reconnaitre).not.toHaveBeenCalled();
    expect(c.appareils.confirmer).not.toHaveBeenCalled();
    expect(c.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : sans le port des appareils, la consommation est celle d’avant — aucune lecture, aucune écriture, aucun champ d’appareil', async () => {
    const c = consommation({});
    const { appareils: _absent, ...sansAppareils } = c.p;
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      sansAppareils
    );
    expect(r.etat).toBe('ouverte');
    expect(Object.keys(r).sort()).toEqual(['etat', 'jetonSession']);
    expect(c.appareils.reconnaitre).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : le port branché sans dépôt dans la transaction est une faute de câblage, qui échoue fort', async () => {
    const c = consommation({});
    delete (c.tx as { appareils?: unknown }).appareils;
    await expect(
      consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT }, c.p)
    ).rejects.toThrow('depot_des_appareils_absent');
  });

  it('REQ-SEC-003 : le CODE (SEC-54) confirme l’appareil comme le clic — session, avis, confirmation, dans la transaction du code', async () => {
    const neuf = verificationDuCode();
    const r = await verifierLeCode(
      {
        emailHash: EMPREINTE_D_ATTENTE,
        code: CODE,
        entetes: new Headers(),
        identifiantAppareil: IDENTIFIANT,
      },
      neuf.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'confirme' },
    });
    expect(neuf.ordre).toEqual(['ouvrirSession', 'aviser', 'confirmer']);
    expect(neuf.aviser).toHaveBeenCalledWith({ apporteurId: APPORTEUR, confirmeAt: T });

    const connu = verificationDuCode({ connus: [EMPREINTE] });
    const r2 = await verifierLeCode(
      {
        emailHash: EMPREINTE_D_ATTENTE,
        code: CODE,
        entetes: new Headers(),
        identifiantAppareil: IDENTIFIANT,
      },
      connu.p
    );
    expect(r2).toMatchObject({ etat: 'ouverte', appareil: { issue: 'connu' } });
    expect(connu.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : un code refusé ne lit ni n’écrit aucun appareil', async () => {
    const c = verificationDuCode();
    const r = await verifierLeCode(
      {
        emailHash: EMPREINTE_D_ATTENTE,
        code: '999999',
        entetes: new Headers(),
        identifiantAppareil: IDENTIFIANT,
      },
      c.p
    );
    expect(r).toEqual({ etat: 'code_refuse' });
    expect(c.appareils.reconnaitre).not.toHaveBeenCalled();
    expect(c.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : TÉMOIN DE LA LENTILLE SÉCURITÉ, de bout en bout — session fraîche + autre appareil : refusé, rien de confirmé ; le lien consommé sur CET appareil le rend connu, avec l’avis ; la garde le laisse alors passer', async () => {
    const ordre: string[] = [];
    const depot = depotEnMemoire(ordre);
    const garde: PortsDAppareil = { session: portsDeSession(ligne(T)), depot, cle: CLE };
    expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, garde)).toEqual({
      ok: false,
      motif: 'appareil_inconnu',
    });
    expect(depot.confirmer).not.toHaveBeenCalled();

    const c = consommation({});
    c.tx.appareils = depot;
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({ etat: 'ouverte', appareil: { issue: 'confirme' } });
    expect(c.aviser).toHaveBeenCalledTimes(1);

    expect((await exigerAppareilConfirme(JETON, IDENTIFIANT, garde)).ok).toBe(true);
  });

  it('REQ-SEC-003 : `confirmerALaConsommation` rend l’identifiant à poser et l’issue, rien de l’empreinte', async () => {
    const ordre: string[] = [];
    const r = await confirmerALaConsommation(APPORTEUR, IDENTIFIANT, {
      depot: depotEnMemoire(ordre),
      cle: CLE,
      aviser: async () => undefined,
      maintenant: T,
    });
    expect(r).toEqual({ identifiant: IDENTIFIANT, issue: 'confirme' });
    expect(JSON.stringify(r)).not.toContain(EMPREINTE);
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
