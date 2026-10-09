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
 *       vérifiée ; la confirmation a lieu À LA CONSOMMATION du lien ou du code, sur l'appareil qui
 *       consomme, dans l'ordre de la voie (b) de la lentille sécurité — la consommation se valide,
 *       l'avis part hors de toute transaction, puis une transaction courte rejuge la session et
 *       confirme —, la garde ne confirme jamais, et une session fraîche présentée
 *       depuis un autre appareil est refusée (note de la lentille sécurité sur 4913c6a3 : un cookie
 *       de session volé ne doit faire connaître aucun appareil) ;
 *       L'action de connexion (`src/app/(espace)/connexion/actions.ts`) lit le cookie de l'appareil,
 *       le passe TEL QUEL au noyau, et pose l'identifiant qu'il rend ; elle n'en invente aucun ;
 *   (4) en échec fermé : une empreinte illisible compte comme un appareil inconnu ;
 *   (5) nouvel appareil → confirmation exigée, puis l'appareil est connu ; purge à l'échéance.
 * Les secrets sont factices, tirés pour ce fichier.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extrairePolitique } from '../../../src/domain/rgpd/politique';
import type { PrismaClient, StatutCourriel } from '@prisma/client';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { domaines } from '../../../src/config/entite';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import { clesPii, colonnesPii } from '../../../src/server/securite/pii';
import { TEXTES_DES_NOTIFICATIONS } from '../../../src/content/micro-copy/courriels/notifications';
import type {
  DemandeDEnvoi,
  DependancesDeLEmetteur,
  LigneCourriel,
} from '../../../src/server/integrations/zeptomail/emetteur';
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
  jugerAppareil,
  tirerIdentifiantDAppareil,
  type AppareilVu,
  type AvisDAppareil,
  type DepotDAppareils,
  type PortsDAppareil,
} from '../../../src/server/auth/appareil';
import {
  COOKIE_DATTENTE,
  MODELE_APPORTEUR,
  dateHeureDeLAvis,
  dependancesDuProcessus,
  envoiDesNotifications,
  portsDeConsommation,
  portsDuCode,
  portsDuCodeConsole,
} from '../../../src/server/auth/lien-magique-production';
import { transactionDeConfirmation } from '../../../src/server/auth/lien-magique-depot';
import { purgerLesAppareils } from '../../../src/server/taches/purger-appareils';
import { inscriptions } from '../../../src/server/taches/inscriptions';
import { TACHES } from '../../../src/server/taches/registre';

// ── Next simulé à ses frontières, pour l'action de connexion ─────────────────────────────────────
// Le magasin de cookies ENREGISTRE chaque pose ; le noyau reste le vrai, sauf quand un témoin de
// l'action lui substitue une réponse (`mockResolvedValueOnce`).

const pot = vi.hoisted(() => ({
  valeurs: new Map<string, string>(),
  poses: [] as Array<{ nom: string; valeur: string; attributs: Record<string, unknown> }>,
}));

vi.mock('next/server', () => ({ after: () => undefined }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
  cookies: async () => ({
    get: (nom: string) => {
      const valeur = pot.valeurs.get(nom);
      return valeur === undefined ? undefined : { name: nom, value: valeur };
    },
    set: (nom: string, valeur: string, attributs: Record<string, unknown>) => {
      pot.poses.push({ nom, valeur, attributs });
    },
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('../../../src/server/auth/lien-magique', async (original) => {
  const reel = await original<typeof import('../../../src/server/auth/lien-magique')>();
  return {
    ...reel,
    consommerLien: vi.fn(reel.consommerLien),
    verifierLeCode: vi.fn(reel.verifierLeCode),
  };
});

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
    confirmerSiInconnu: vi.fn(async () => {
      ordre.push('confirmerSiInconnu');
      return 'confirme' as const;
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
      expect(d.confirmerSiInconnu).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : un appareil CONNU passe ; il est reconnu pour CE compte, sous CETTE clé, vu depuis moins d’une session', async () => {
    const { p, depot } = ports(ligne(new Date(T.getTime() - 3 * 60 * 60 * 1000)), true);
    const verdict = await exigerAppareilConfirme(JETON, IDENTIFIANT, p);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.session.apporteurId).toBe(APPORTEUR);
    expect(depot.reconnaitre).toHaveBeenCalledTimes(1);
    expect(depot.reconnaitre).toHaveBeenCalledWith(APPAREIL, T, VU_APRES);
    expect(depot.confirmerSiInconnu).not.toHaveBeenCalled();
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
      expect(depot.confirmerSiInconnu).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : TÉMOIN DE LA LENTILLE SÉCURITÉ — une session FRAÎCHE (lien consommé il y a moins de dix minutes), présentée depuis un AUTRE appareil, est refusée et rien n’est confirmé : un cookie de session volé ne fait connaître aucun appareil', async () => {
    for (const age of [0, 1, RELEVE_MS - 1]) {
      const { p, depot } = ports(ligne(new Date(T.getTime() - age)), false);
      expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, p)).toEqual({
        ok: false,
        motif: 'appareil_inconnu',
      });
      expect(depot.confirmerSiInconnu).not.toHaveBeenCalled();
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
      expect(depot.confirmerSiInconnu).not.toHaveBeenCalled();
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
      expect(inconnu.depot.confirmerSiInconnu).not.toHaveBeenCalled();
      expect(inconnu.p.session.depot.lire).not.toHaveBeenCalled();
    }
  });
});

// ── l'appareil à la CONSOMMATION, voie (b) de la lentille sécurité (#563) ───────────────────────
// (i) la transaction de consommation se valide : le lien est consommé, la session ouverte,
// l'appareil reconnu s'il est connu, NON confirmé sinon ; (ii) l'avis part ensuite, HORS de toute
// transaction ; (iii) seulement s'il est accepté, une transaction COURTE rejuge la session et
// confirme l'appareil, une fois.

/** Un dépôt d'appareils EN MÉMOIRE ; `journal` note la suite des appels. */
function depotEnMemoire(journal: string[], connus: string[] = []) {
  const vus = new Set(connus);
  return {
    reconnaitre: vi.fn(async (a: AppareilVu, _maintenant: Date, _vuApres: Date) =>
      vus.has(a.empreinte) ? 1 : 0
    ),
    confirmerSiInconnu: vi.fn(async (a: AppareilVu, _maintenant: Date, _vuApres: Date) => {
      journal.push('confirmerSiInconnu');
      if (vus.has(a.empreinte)) return 'deja_connu' as const;
      vus.add(a.empreinte);
      return 'confirme' as const;
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
/** L'instant de la confirmation, APRÈS l'avis ; la limite de vue s'y rapporte. */
const T2 = new Date(T.getTime() + 1_500);
const VU_APRES_T2 = new Date(T2.getTime() - SESSION_MS);

/** La session telle que la transaction de confirmation la RELIT : celle que la consommation a ouverte. */
function sessionRelue(
  o: Partial<LigneDeSession> = {},
  lienMagiqueId: string = LIEN.id
): { ligne: LigneDeSession; lienMagiqueId: string } {
  return { ligne: { ...ligne(T), ...o }, lienMagiqueId };
}

type SessionRelue = ReturnType<typeof sessionRelue> | null;

/**
 * Les deux transactions en mémoire : celle de la consommation et celle, courte, de la confirmation.
 * Le journal dit où chaque appel a lieu ; un avis lancé dans une transaction s'y note « DEDANS ».
 */
function harnais(o: {
  connus?: string[];
  aviser?: (avis: AvisDAppareil) => Promise<void>;
  session?: SessionRelue;
}) {
  const journal: string[] = [];
  let ouverte: 'aucune' | 'consommation' | 'confirmation' = 'aucune';
  const appareils = depotEnMemoire(journal, o.connus);
  const depotDeLaConsommation: DepotDAppareils = {
    reconnaitre: async (...a) => {
      journal.push(ouverte === 'consommation' ? 'reconnaitre' : 'reconnaitre HORS');
      return appareils.reconnaitre(...a);
    },
    confirmerSiInconnu: async () => {
      throw new Error('jamais_dans_la_consommation');
    },
  };
  const lireSession = vi.fn(async (_tokenHash: string) =>
    o.session === undefined ? sessionRelue() : o.session
  );
  const aviser = vi.fn(async (avis: AvisDAppareil) => {
    journal.push(ouverte === 'aucune' ? 'aviser' : `aviser DEDANS ${ouverte}`);
    if (o.aviser) await o.aviser(avis);
  });
  const portsDesAppareils = {
    aviser,
    maintenant: () => T2,
    transaction: async <R>(
      travail: (tx: { lireSession: typeof lireSession; appareils: DepotDAppareils }) => Promise<R>
    ): Promise<R> => {
      ouverte = 'confirmation';
      journal.push('confirmation:ouvrir');
      try {
        return await travail({ lireSession, appareils });
      } finally {
        ouverte = 'aucune';
        journal.push('confirmation:valider');
      }
    },
  };
  return {
    journal,
    appareils,
    depotDeLaConsommation,
    lireSession,
    aviser,
    portsDesAppareils,
    enCours: () => ouverte,
    ouvrir: (q: typeof ouverte) => {
      ouverte = q;
    },
  };
}

function consommation(o: Parameters<typeof harnais>[0] = {}) {
  const h = harnais(o);
  const tx: TransactionDeConsommation = {
    consommer: vi.fn(async () => 1),
    lireLien: vi.fn(async () => LIEN),
    statutApporteur: vi.fn(async () => 'signe'),
    ouvrirSession: vi.fn(async () => {
      h.journal.push('ouvrirSession');
    }),
    appareils: h.depotDeLaConsommation,
  };
  const p: PortsDeConsommation = {
    maintenant: () => T,
    configuration: CONFIGURATION_DU_LIEN,
    transaction: async (travail) => {
      h.ouvrir('consommation');
      try {
        return await travail(tx);
      } finally {
        h.ouvrir('aucune');
        h.journal.push('valider');
      }
    },
    appareils: h.portsDesAppareils,
  };
  return { ...h, p, tx };
}

/** Une transaction du code en mémoire : le bon code consomme le lien et ouvre la session. */
function verificationDuCode(o: Parameters<typeof harnais>[0] = {}) {
  const h = harnais(o);
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
      h.journal.push('ouvrirSession');
    }),
    appareils: h.depotDeLaConsommation,
  };
  const permis = async () => ({ autorise: true, panne: false });
  const p: PortsDuCode = {
    maintenant: () => T,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => '0123456789abcdef',
    compterAdresseCode: permis,
    compterCourrielCode: permis,
    transaction: async (travail) => {
      h.ouvrir('consommation');
      try {
        return await travail(tx);
      } finally {
        h.ouvrir('aucune');
        h.journal.push('valider');
      }
    },
    signaler: () => undefined,
    configuration: CONFIGURATION_DU_LIEN,
    appareils: h.portsDesAppareils,
  };
  return { ...h, p, tx };
}

const CODE = '042137';
const EMPREINTE_D_ATTENTE = 'ab'.repeat(32);
const FORME_IDENTIFIANT = /^[A-Za-z0-9_-]{43}$/;
const PARCOURS_NEUF = [
  'ouvrirSession',
  'reconnaitre',
  'valider',
  'aviser',
  'confirmation:ouvrir',
  'confirmerSiInconnu',
  'confirmation:valider',
];

describe('REQ-SEC-003 — l’appareil à la CONSOMMATION, voie (b) de la lentille sécurité : la consommation se valide, PUIS l’avis hors de toute transaction, PUIS une transaction COURTE qui confirme', () => {
  it('REQ-SEC-003 : un appareil NEUF — (i) la session s’ouvre et la consommation se valide, l’appareil NON confirmé ; (ii) l’avis part HORS de toute transaction ; (iii) une transaction courte le confirme', async () => {
    const c = consommation();
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'confirme' },
    });
    expect(c.journal).toEqual(PARCOURS_NEUF);
    // L'avis ne porte que le compte et l'instant de la consommation : rien de l'appareil.
    expect(c.aviser).toHaveBeenCalledWith({ apporteurId: APPORTEUR, confirmeAt: T });
    expect(c.appareils.confirmerSiInconnu).toHaveBeenCalledWith(APPAREIL, T2, VU_APRES_T2);
    // La confirmation relit la session que CETTE consommation a ouverte.
    const jetonSession = r.etat === 'ouverte' ? r.jetonSession : '';
    expect(c.lireSession).toHaveBeenCalledWith(
      empreinteDeSession(jetonSession, SECRET_DES_SESSIONS)
    );
  });

  it('REQ-SEC-003 : TÉMOIN — aucun verrou ni aucune transaction n’est tenu pendant l’appel réseau de l’avis', async () => {
    const c = consommation({
      aviser: async () => {
        expect(c.enCours()).toBe('aucune');
      },
    });
    await consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT }, c.p);
    expect(c.journal.filter((e) => e.startsWith('aviser'))).toEqual(['aviser']);
  });

  it('REQ-SEC-003 : un appareil DÉJÀ CONNU de ce compte — reconnu dans la consommation, sa vue avance ; ni avis ni transaction de confirmation', async () => {
    const c = consommation({ connus: [EMPREINTE] });
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'connu' },
    });
    expect(c.journal).toEqual(['ouvrirSession', 'reconnaitre', 'valider']);
    expect(c.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : sans identifiant, ou hors forme — un identifiant NEUF est tiré, avisé puis confirmé, et rendu à poser ; jamais le hors-forme', async () => {
    for (const lu of [undefined, null, '', 'abc', `${IDENTIFIANT}=`, ['x']]) {
      const c = consommation();
      const r = await consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: lu }, c.p);
      expect(r.etat).toBe('ouverte');
      const appareil = r.etat === 'ouverte' ? r.appareil : undefined;
      expect(appareil?.issue).toBe('confirme');
      expect(appareil?.identifiant).toMatch(FORME_IDENTIFIANT);
      expect(appareil?.identifiant).not.toBe(lu);
      expect(c.appareils.confirmerSiInconnu).toHaveBeenCalledWith(
        {
          apporteurId: APPORTEUR,
          empreinte: empreinteDAppareil(appareil?.identifiant, CLE.secret),
          kid: CLE.kid,
        },
        T2,
        VU_APRES_T2
      );
      expect(c.journal).toEqual(PARCOURS_NEUF);
    }
  });

  it('REQ-SEC-003 : (3) échec fermé — un avis refusé, en échec ou au-delà du délai ne confirme RIEN : `avis_echoue`, la session ouverte, aucune transaction de confirmation', async () => {
    for (const erreur of ['avis_refuse', 'avis_en_echec', 'delai_depasse']) {
      const c = consommation({
        aviser: async () => {
          throw new Error(erreur);
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
      expect(c.journal).toEqual(['ouvrirSession', 'reconnaitre', 'valider', 'aviser']);
      expect(c.appareils.confirmerSiInconnu).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : (3) TÉMOIN — un arrêt du processus entre (i) et (iii) laisse l’appareil NON confirmé : la consommation est validée, l’avis en vol, aucune confirmation', async () => {
    const c = consommation({ aviser: () => new Promise<void>(() => undefined) });
    void consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT }, c.p);
    await vi.waitFor(() => expect(c.aviser).toHaveBeenCalledTimes(1));
    expect(c.journal).toEqual(['ouvrirSession', 'reconnaitre', 'valider', 'aviser']);
    expect(c.lireSession).not.toHaveBeenCalled();
    expect(c.appareils.confirmerSiInconnu).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : (2) la transaction de confirmation REJUGE la session — absente, révoquée, expirée, d’une version périmée, d’un apporteur fermé, d’un autre compte ou d’un autre lien : RIEN n’est confirmé (`non_confirme`)', async () => {
    const cas: SessionRelue[] = [
      null,
      sessionRelue({ revoqueAt: T }),
      sessionRelue({ expireAt: T2 }),
      sessionRelue({ sessionVersion: 2 }),
      sessionRelue({ apporteur: { statut: 'resilie', sessionVersion: 3 } }),
      sessionRelue({ apporteurId: '00000000-0000-4000-8000-000000000000' }),
      sessionRelue({}, 'autre-lien'),
    ];
    for (const session of cas) {
      const c = consommation({ session });
      const r = await consommerLien(
        { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
        c.p
      );
      expect(r).toMatchObject({
        etat: 'ouverte',
        appareil: { identifiant: IDENTIFIANT, issue: 'non_confirme' },
      });
      expect(c.lireSession).toHaveBeenCalledTimes(1);
      expect(c.appareils.confirmerSiInconnu).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-003 : (2) une session que le juge REFUSE (SEC-70 : un résilié, même aux droits en cours) — l’avis part, RIEN n’est confirmé (`non_confirme`) : elle ne fait connaître aucun appareil', async () => {
    const c = consommation({
      session: sessionRelue({
        apporteur: { statut: 'resilie', sessionVersion: 3 },
      }),
    });
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'non_confirme' },
    });
    expect(c.aviser).toHaveBeenCalledTimes(1);
    expect(c.lireSession).toHaveBeenCalledTimes(1);
    expect(c.appareils.confirmerSiInconnu).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : (2) la confirmation est idempotente — un appareil devenu connu entre-temps n’est pas confirmé deux fois, rien n’est réécrit, l’issue dit `connu`', async () => {
    const c = consommation();
    c.appareils.confirmerSiInconnu.mockResolvedValueOnce('deja_connu');
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({
      etat: 'ouverte',
      appareil: { identifiant: IDENTIFIANT, issue: 'connu' },
    });
    expect(c.appareils.confirmerSiInconnu).toHaveBeenCalledTimes(1);
  });

  it('REQ-SEC-003 : un lien invalide ou déjà utilisé ne lit ni n’écrit aucun appareil, et n’envoie aucun avis', async () => {
    const c = consommation();
    (c.tx.consommer as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toEqual({ etat: 'lien_invalide' });
    expect(c.journal).toEqual(['valider']);
    expect(c.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : sans le port des appareils, la consommation est celle d’avant — aucune lecture, aucune écriture, aucun champ d’appareil', async () => {
    const c = consommation();
    const sansAppareils: PortsDeConsommation = { ...c.p };
    delete sansAppareils.appareils;
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      sansAppareils
    );
    expect(r.etat).toBe('ouverte');
    expect(Object.keys(r).sort()).toEqual(['etat', 'jetonSession']);
    expect(c.journal).toEqual(['ouvrirSession', 'valider']);
  });

  it('REQ-SEC-003 : le port branché sans dépôt dans la transaction est une faute de câblage, qui échoue fort', async () => {
    const c = consommation();
    delete (c.tx as { appareils?: unknown }).appareils;
    await expect(
      consommerLien({ jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT }, c.p)
    ).rejects.toThrow('depot_des_appareils_absent');
    expect(c.aviser).not.toHaveBeenCalled();
  });

  it('REQ-SEC-003 : le CODE (SEC-54) suit le même parcours que le clic — consommation validée, avis hors transaction, confirmation courte', async () => {
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
    expect(neuf.journal).toEqual(PARCOURS_NEUF);
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
    const c = consommation();
    const garde: PortsDAppareil = {
      session: portsDeSession(ligne(T)),
      depot: c.appareils,
      cle: CLE,
    };
    expect(await exigerAppareilConfirme(JETON, IDENTIFIANT, garde)).toEqual({
      ok: false,
      motif: 'appareil_inconnu',
    });
    expect(c.appareils.confirmerSiInconnu).not.toHaveBeenCalled();

    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    expect(r).toMatchObject({ etat: 'ouverte', appareil: { issue: 'confirme' } });
    expect(c.aviser).toHaveBeenCalledTimes(1);

    expect((await exigerAppareilConfirme(JETON, IDENTIFIANT, garde)).ok).toBe(true);
  });

  it('REQ-SEC-003 : la consommation rend l’identifiant à poser et l’issue, rien de l’empreinte', async () => {
    const c = consommation();
    const r = await consommerLien(
      { jeton: JETON, ipHash: null, identifiantAppareil: IDENTIFIANT },
      c.p
    );
    const appareil = r.etat === 'ouverte' ? r.appareil : undefined;
    expect(appareil).toEqual({ identifiant: IDENTIFIANT, issue: 'confirme' });
    expect(JSON.stringify(r)).not.toContain(EMPREINTE);
  });
});

// ── le BRANCHEMENT en production : l'avis « nouvel appareil » par `notifier()` (SEC-62) ─────────
// Le port des appareils du clic et du code : l'avis part à l'adresse STOCKÉE, sous la clé de la
// juriste, par la composition unique de `notifier()` ; seul un courriel `envoye` le laisse aboutir —
// tout autre statut, ou un émetteur qui lève, le fait lever, et rien n'est confirmé (`avis_echoue`).

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec62-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const PRODUCTION = { ...ENV, NODE_ENV: 'production', PARTNERS_ENV: 'production' };
const COURRIEL = 'marie@example.org';
const SUJET_DE_L_AVIS = 'Connexion à votre espace depuis un nouvel appareil';
/** 12:20 UTC le 4 octobre 2026 : 14 h 20 à Paris, en heure d'été. */
const CONSOMME_ETE = new Date('2026-10-04T12:20:00.000Z');

/** Les dépendances du lien en production, sur une base simulée qui ne rend que l'adresse stockée. */
function dependancesDeProduction(statut: StatutCourriel | Error = 'envoye') {
  const { emailChiffre } = colonnesPii(
    { modele: MODELE_APPORTEUR, id: APPORTEUR },
    { email: COURRIEL },
    clesPii(ENV)
  );
  const findUnique = vi.fn(async () => ({ emailChiffre }));
  const envoyerCourriel = vi.fn(async (_demande: DemandeDEnvoi): Promise<StatutCourriel> => {
    if (statut instanceof Error) throw statut;
    return statut;
  });
  const d = {
    env: ENV,
    prisma: { apporteur: { findUnique } } as unknown as PrismaClient,
    horloge: horlogeFigee(T.getTime()),
    journal: { warn: vi.fn() },
    envoyerCourriel,
  };
  return { d, findUnique, envoyerCourriel };
}

describe('REQ-SEC-003 — le BRANCHEMENT en production (SEC-62) : l’avis « nouvel appareil » part par `notifier()`, et seul un courriel envoyé laisse confirmer', () => {
  it('REQ-SEC-003 : le clic et le code de l’espace portent le port des appareils — l’avis, l’horloge, la transaction courte ; la console jamais', () => {
    const { d } = dependancesDeProduction();
    for (const p of [portsDeConsommation(d), portsDuCode(d)]) {
      expect(Object.keys(p.appareils ?? {}).sort()).toEqual([
        'aviser',
        'maintenant',
        'transaction',
      ]);
      expect(p.appareils?.maintenant()).toEqual(T);
    }
    expect('appareils' in portsDuCodeConsole(d)).toBe(false);
  });

  it('REQ-SEC-003 : sans émetteur des notifications, aucun port des appareils — la consommation est celle d’avant', () => {
    const { d } = dependancesDeProduction();
    const sans = { env: d.env, prisma: d.prisma, horloge: d.horloge, journal: d.journal };
    expect('appareils' in portsDeConsommation(sans)).toBe(false);
    expect('appareils' in portsDuCode(sans)).toBe(false);
  });

  it('REQ-SEC-003 : l’avis part à l’adresse STOCKÉE, sous la clé `nouvel_appareil`, au texte de la juriste ; il ne dit que l’instant, rien de l’appareil', async () => {
    const { d, findUnique, envoyerCourriel } = dependancesDeProduction();
    await portsDeConsommation(d).appareils?.aviser({
      apporteurId: APPORTEUR,
      confirmeAt: CONSOMME_ETE,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: APPORTEUR },
      select: { emailChiffre: true },
    });
    expect(envoyerCourriel).toHaveBeenCalledTimes(1);
    const demande = envoyerCourriel.mock.calls[0]?.[0];
    expect(demande).toEqual({
      gabarit: 'nouvel_appareil',
      a: COURRIEL,
      sujet: SUJET_DE_L_AVIS,
      corps: [
        TEXTES_DES_NOTIFICATIONS.nouvel_appareil.corps.replace(
          '{dateHeure}',
          '4 octobre 2026 à 14 h 20 (heure de Paris)'
        ),
        `Demander un nouveau lien de connexion : https://${domaines().servi}/connexion`,
      ].join('\n\n'),
      apporteurId: APPORTEUR,
    });
    for (const secret of [IDENTIFIANT, EMPREINTE, CLE.secret]) {
      expect(JSON.stringify(demande)).not.toContain(secret);
    }
  });

  it('REQ-SEC-003 : l’heure dite est l’heure LÉGALE de Paris, à la minute — été, hiver, premier du mois, passage de minuit', async () => {
    const cas: Array<[string, string]> = [
      ['2026-10-04T12:20:00.000Z', 'le 4 octobre 2026 à 14 h 20 (heure de Paris) sur'],
      ['2026-12-01T08:05:00.000Z', 'le 1er décembre 2026 à 9 h 05 (heure de Paris) sur'],
      ['2026-10-04T22:30:59.999Z', 'le 5 octobre 2026 à 0 h 30 (heure de Paris) sur'],
      ['2027-03-28T00:59:00.000Z', 'le 28 mars 2027 à 1 h 59 (heure de Paris) sur'],
      ['2027-03-28T01:00:00.000Z', 'le 28 mars 2027 à 3 h 00 (heure de Paris) sur'],
    ];
    for (const [iso, attendu] of cas) {
      const { d, envoyerCourriel } = dependancesDeProduction();
      await portsDeConsommation(d).appareils?.aviser({
        apporteurId: APPORTEUR,
        confirmeAt: new Date(iso),
      });
      expect(envoyerCourriel.mock.calls[0]?.[0].corps, iso).toContain(attendu);
    }
  });

  it('REQ-SEC-003 : les douze mois en toutes lettres, au jour et à l’heure de Paris (heure d’hiver jusqu’au dernier dimanche de mars, d’été jusqu’au dernier dimanche d’octobre)', () => {
    const mois = [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre',
    ];
    mois.forEach((nom, i) => {
      const heure = i >= 3 && i <= 9 ? 12 : 11;
      expect(dateHeureDeLAvis(new Date(Date.UTC(2027, i, 15, 10, 7)))).toBe(
        `15 ${nom} 2027 à ${heure} h 07 (heure de Paris)`
      );
    });
  });

  it('REQ-SEC-003 : (3) échec fermé — un courriel qui n’est pas `envoye` (en échec, retenu), ou un émetteur qui lève, fait LEVER l’avis : rien ne sera confirmé', async () => {
    const statuts: Array<StatutCourriel | Error> = [
      'echec',
      'retenu_dmarc_non_verifie',
      'retenu_adresse_supprimee',
      new Error('delai_depasse'),
    ];
    for (const statut of statuts) {
      const { d } = dependancesDeProduction(statut);
      await expect(
        portsDeConsommation(d).appareils?.aviser({
          apporteurId: APPORTEUR,
          confirmeAt: CONSOMME_ETE,
        }),
        String(statut)
      ).rejects.toThrow();
    }
  });

  it('REQ-SEC-003 : l’émetteur des notifications du processus — en production, celui des courriels, dont le statut remonte TEL QUEL ; hors production, le puits, qui ne reçoit que le sujet et le corps', async () => {
    const relais = vi.fn(async () => ({ messageId: 'id-relais-sec62' }));
    const lignes: LigneCourriel[] = [];
    const emetteur = (): DependancesDeLEmetteur => ({
      configuration: { expediteur: `contact@${domaines().envoi}`, dmarcVerifie: false },
      relais: { envoyer: relais },
      depot: { estSupprimee: async () => false, consigner: async (l) => void lignes.push(l) },
      cles: clesPii(ENV),
      maintenant: () => T,
      nouvelId: () => '00000000-0000-4000-8000-000000000062',
    });
    const notifier = vi.fn(async () => undefined);
    const fabriques = { emetteur, notifieur: () => ({ notifier }) };
    const demande: DemandeDEnvoi = {
      gabarit: 'nouvel_appareil',
      a: COURRIEL,
      sujet: SUJET_DE_L_AVIS,
      corps: 'le corps rendu',
      apporteurId: APPORTEUR,
    };
    // Production, drapeau DMARC fermé : la ligne est consignée, retenue, le relais n'est pas appelé.
    expect(await envoiDesNotifications(PRODUCTION, fabriques)(demande)).toBe(
      'retenu_dmarc_non_verifie'
    );
    expect(lignes).toHaveLength(1);
    expect(relais).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
    // Hors production : le puits seul.
    expect(await envoiDesNotifications(ENV, fabriques)(demande)).toBe('envoye');
    expect(notifier).toHaveBeenCalledWith({ sujet: SUJET_DE_L_AVIS, corps: 'le corps rendu' });
    expect(lignes).toHaveLength(1);
  });

  it('REQ-SEC-003 : les dépendances du processus portent l’émetteur des notifications : le clic et le code de l’action de connexion avisent', () => {
    const d = dependancesDuProcessus({
      apres: () => undefined,
      env: { ...ENV, NOTIFY_SINK: 'true' },
    });
    expect(typeof d.envoyerCourriel).toBe('function');
    expect(portsDeConsommation(d).appareils).toBeDefined();
    expect(portsDuCode(d).appareils).toBeDefined();
  });
});

// ── le dépôt et la purge, tels que la base les reçoit ────────────────────────────────────────────

function unDouble(o: { frais?: number } = {}) {
  const d = {
    appareilConnu: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => o.frais ?? 0),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 4 })),
    },
  };
  return { d, prisma: d as unknown as PrismaClient };
}

describe('REQ-SEC-003 — la transaction COURTE de confirmation, telle que la base la reçoit', () => {
  function base(ligneLue: Record<string, unknown> | null, figee: { id: string } | null = null) {
    const findUnique = vi.fn(async () => ligneLue);
    const findFirst = vi.fn(async () => figee);
    const tx = {
      sessionEspace: { findUnique },
      attribution: { findFirst },
      appareilConnu: unDouble().d.appareilConnu,
    };
    const $transaction = vi.fn(async (travail: (t: typeof tx) => Promise<unknown>) => travail(tx));
    return {
      findUnique,
      findFirst,
      $transaction,
      prisma: { $transaction } as unknown as PrismaClient,
    };
  }

  it('REQ-SEC-003 : UNE transaction relit la session par l’empreinte de son jeton — ce que juge `jugerSession`, et le lien qui l’a ouverte —, et rend la ligne séparée du lien', async () => {
    const attendue = ligne(T);
    const b = base({ ...attendue, lienMagiqueId: LIEN.id });
    const lue = await transactionDeConfirmation(b.prisma)((tx) => tx.lireSession('empreinte-x'));
    expect(b.$transaction).toHaveBeenCalledTimes(1);
    expect(b.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'empreinte-x' },
      select: {
        id: true,
        apporteurId: true,
        kid: true,
        expireAt: true,
        revoqueAt: true,
        sessionVersion: true,
        lienMagiqueId: true,
        apporteur: { select: { statut: true, sessionVersion: true } },
        lienMagique: { select: { consommeAt: true } },
      },
    });
    expect(lue).toEqual({ ligne: attendue, lienMagiqueId: LIEN.id });
  });

  it('REQ-SEC-003 : SEC-70 — la transaction ne relit PLUS aucun droit en cours : une attribution figée ne change rien à la session lue', async () => {
    const attendue = ligne(T);
    const b = base({ ...attendue, lienMagiqueId: LIEN.id }, { id: 'attribution-figee' });
    const lue = await transactionDeConfirmation(b.prisma)((tx) => tx.lireSession('empreinte-x'));
    expect(b.$transaction).toHaveBeenCalledTimes(1);
    expect(b.findFirst).not.toHaveBeenCalled();
    expect(lue?.ligne.apporteur).toEqual(attendue.apporteur);
  });

  it('REQ-SEC-003 : une session absente se lit `null` ; le dépôt des appareils est celui de la MÊME transaction', async () => {
    const b = base(null);
    expect(await transactionDeConfirmation(b.prisma)((tx) => tx.lireSession('x'))).toBeNull();
    const confirme = await transactionDeConfirmation(b.prisma)((tx) =>
      tx.appareils.confirmerSiInconnu(APPAREIL, T2, VU_APRES_T2)
    );
    expect(confirme).toBe('confirme');
  });
});

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

  it('REQ-SEC-003 : confirmer un appareil INCONNU le pose, ou rétablit une ligne périmée, confirmé et vu à l’instant', async () => {
    const { d, prisma } = unDouble({ frais: 0 });
    expect(await depotDAppareils(prisma).confirmerSiInconnu(APPAREIL, T, VU_APRES)).toBe(
      'confirme'
    );
    expect(d.appareilConnu.count).toHaveBeenCalledWith({
      where: { ...APPAREIL, derniereVueAt: { gt: VU_APRES } },
    });
    expect(d.appareilConnu.upsert).toHaveBeenCalledWith({
      where: { apporteurId_empreinte_kid: APPAREIL },
      create: { ...APPAREIL, confirmeAt: T, derniereVueAt: T },
      update: { confirmeAt: T, derniereVueAt: T },
    });
  });

  it('REQ-SEC-003 : (2) un appareil DÉJÀ connu (vu après la limite) n’est pas confirmé deux fois — RIEN n’est réécrit', async () => {
    const { d, prisma } = unDouble({ frais: 1 });
    expect(await depotDAppareils(prisma).confirmerSiInconnu(APPAREIL, T, VU_APRES)).toBe(
      'deja_connu'
    );
    expect(d.appareilConnu.upsert).not.toHaveBeenCalled();
    expect(d.appareilConnu.updateMany).not.toHaveBeenCalled();
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

// ── le câblage de la connexion : le cookie de l'appareil, lu puis posé ───────────────────────────

describe('REQ-SEC-003 — l’action de connexion lit le cookie de l’appareil, le passe au noyau, et pose celui qu’il rend', () => {
  const actions = () => import('../../../src/app/(espace)/connexion/actions');
  const NEUF = tirerIdentifiantDAppareil();
  const SESSION = 'S'.repeat(43);
  const posesDeLAppareil = () => pot.poses.filter((p) => p.nom === COOKIE_D_APPAREIL.nom);
  const pose = (valeur: string) => ({
    nom: COOKIE_D_APPAREIL.nom,
    valeur,
    attributs: COOKIE_D_APPAREIL.attributs,
  });

  beforeEach(() => {
    pot.valeurs.clear();
    pot.poses.length = 0;
    for (const n of NOMS_DES_SECRETS)
      vi.stubEnv(n, `temoin-sec55-actions-${n.toLowerCase()}-`.padEnd(48, '0'));
    vi.stubEnv(
      'PII_ENCRYPTION_KEY',
      Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('')
    );
    vi.stubEnv('NOTIFY_SINK', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('REQ-SEC-003 : le clic — le cookie lu est passé TEL QUEL à la consommation, et l’identifiant rendu est posé sous `__Host-partners-appareil`, aux attributs du cookie', async () => {
    pot.valeurs.set(COOKIE_D_APPAREIL.nom, IDENTIFIANT);
    vi.mocked(consommerLien).mockResolvedValueOnce({
      etat: 'ouverte',
      jetonSession: SESSION,
      appareil: { identifiant: IDENTIFIANT, issue: 'connu' },
    });
    const { consommerUnLienDeConnexion } = await actions();
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    expect(vi.mocked(consommerLien).mock.lastCall?.[0]).toMatchObject({
      jeton: JETON,
      identifiantAppareil: IDENTIFIANT,
    });
    expect(posesDeLAppareil()).toEqual([pose(IDENTIFIANT)]);
  });

  it('REQ-SEC-003 : sans cookie, l’action n’invente rien — le noyau reçoit l’absence, et c’est l’identifiant NEUF qu’il rend qui est posé', async () => {
    vi.mocked(consommerLien).mockResolvedValueOnce({
      etat: 'ouverte',
      jetonSession: SESSION,
      appareil: { identifiant: NEUF, issue: 'confirme' },
    });
    const { consommerUnLienDeConnexion } = await actions();
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    expect(vi.mocked(consommerLien).mock.lastCall?.[0].identifiantAppareil).toBeUndefined();
    expect(posesDeLAppareil()).toEqual([pose(NEUF)]);
  });

  it('REQ-SEC-003 : un avis échoué pose quand même l’identifiant — l’appareil reste inconnu, et la prochaine consommation sur lui retentera l’avis', async () => {
    vi.mocked(consommerLien).mockResolvedValueOnce({
      etat: 'ouverte',
      jetonSession: SESSION,
      appareil: { identifiant: NEUF, issue: 'avis_echoue' },
    });
    const { consommerUnLienDeConnexion } = await actions();
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    expect(posesDeLAppareil()).toEqual([pose(NEUF)]);
  });

  it('REQ-SEC-003 : un lien refusé, ou une session ouverte sans appareil rendu (port non branché), ne pose AUCUN cookie d’appareil', async () => {
    pot.valeurs.set(COOKIE_D_APPAREIL.nom, IDENTIFIANT);
    const { consommerUnLienDeConnexion } = await actions();
    vi.mocked(consommerLien).mockResolvedValueOnce({ etat: 'lien_invalide' });
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    vi.mocked(consommerLien).mockResolvedValueOnce({ etat: 'ouverte', jetonSession: SESSION });
    await expect(consommerUnLienDeConnexion(JETON)).rejects.toThrow('NEXT_REDIRECT');
    expect(posesDeLAppareil()).toEqual([]);
  });

  it('REQ-SEC-003 : le CODE (SEC-54) — la même lecture et la même pose que le clic', async () => {
    pot.valeurs.set(COOKIE_D_APPAREIL.nom, IDENTIFIANT);
    pot.valeurs.set(COOKIE_DATTENTE.nom, 'e'.repeat(64));
    vi.mocked(verifierLeCode).mockResolvedValueOnce({
      etat: 'ouverte',
      jetonSession: SESSION,
      appareil: { identifiant: NEUF, issue: 'confirme' },
    });
    const formulaire = new FormData();
    formulaire.set('code', CODE);
    const { verifierUnCodeDeConnexion } = await actions();
    await expect(verifierUnCodeDeConnexion(formulaire)).rejects.toThrow('NEXT_REDIRECT');
    expect(vi.mocked(verifierLeCode).mock.lastCall?.[0]).toMatchObject({
      code: CODE,
      identifiantAppareil: IDENTIFIANT,
    });
    expect(posesDeLAppareil()).toEqual([pose(NEUF)]);
  });

  it('REQ-SEC-003 : un code refusé ne pose aucun cookie d’appareil', async () => {
    pot.valeurs.set(COOKIE_DATTENTE.nom, 'e'.repeat(64));
    vi.mocked(verifierLeCode).mockResolvedValueOnce({ etat: 'code_refuse' });
    const formulaire = new FormData();
    formulaire.set('code', CODE);
    const { verifierUnCodeDeConnexion } = await actions();
    await expect(verifierUnCodeDeConnexion(formulaire)).rejects.toThrow('NEXT_REDIRECT');
    expect(posesDeLAppareil()).toEqual([]);
  });
});

describe('REQ-SEC-003 — la politique de l’espace nomme les deux cookies strictement nécessaires (texte de la juriste)', () => {
  const PHRASE =
    "pour sécuriser la connexion à l'espace, deux cookies strictement nécessaires au service demandé sont déposés : l'un, __Host-connexion_code, garde l'empreinte de l'adresse saisie le temps du lien de connexion, pour vérifier le code reçu par courriel ; l'autre, __Host-partners-appareil, porte un identifiant de l'appareil, dont la Société ne garde qu'une empreinte, effacée trente jours après la dernière utilisation de l'appareil ; ils ne servent à aucune autre fin, ne sont lus par aucun tiers et ne demandent pas de consentement (loi Informatique et Libertés, art. 82)";
  const ligneFinalite = (): string[] => {
    const registre = readFileSync('docs/rgpd/registre-article-30.md', 'utf8');
    const ligne = registre
      .split(/\r?\n/)
      .find((l) => l.startsWith('| Finalité | Recevoir la candidature'));
    return (ligne ?? '').split('|').map((c) => c.trim());
  };

  it('REQ-SEC-003 : la Finalité de TRT-APPORTEURS se termine par la phrase de la juriste, MOT POUR MOT, précédée de « ; »', () => {
    expect(ligneFinalite()[2]!.endsWith(`; ${PHRASE}`)).toBe(true);
  });

  it('REQ-SEC-003 : la phrase atteint la politique de l’espace, dans la rubrique Finalité, sans « À compléter » qui la retienne', () => {
    const lue = extrairePolitique(readFileSync('docs/rgpd/registre-article-30.md', 'utf8'));
    expect(lue.ok).toBe(true);
    if (!lue.ok) return;
    const finalite = lue.politique.rubriques.find((r) => r.cle === 'finalite')!;
    const texte = finalite.contenu.map((s) => (s.type === 'texte' ? s.texte : '')).join('');
    expect(texte).toContain(PHRASE);
  });

  it('REQ-SEC-003 : la ligne cite ses sources — SEC-54, SEC-55 et l’art. 82 de la loi Informatique et Libertés', () => {
    expect(ligneFinalite()[3]).toContain('SEC-54 · SEC-55 · loi Informatique et Libertés art. 82');
  });
});
