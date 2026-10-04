// @req REQ-SEC-003
// @req REQ-SEC-004
/**
 * `revocation.spec.ts` — la session de l'espace apporteur rendue RÉVOCABLE (SEC-04), sans base :
 * le noyau (`src/server/auth/session.ts`) est jugé sur un dépôt EN MÉMOIRE qui relit son état à
 * chaque appel, l'adaptateur Prisma sur un faux client qui enregistre ses arguments, et l'action
 * de consommation du lien avec Next simulé à ses frontières. Les témoins qui prouvent ce que la
 * BASE tient (déclencheurs, CHECK) vivent dans `tests/integration/sessions-revocables.spec.ts`.
 *
 * CE QU'IL PROUVE.
 *   1. Le cookie posé à l'ouverture porte le préfixe `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`,
 *      `Path=/`, aucun domaine, et une durée de 30 jours (REQ-SEC-003).
 *   2. TÉMOIN À DEUX FACES : une session ouverte, puis `sessionVersion` incrémentée, ne franchit plus
 *      la requête SUIVANTE ; sans incrémentation, elle passe. Aucune horloge n'avance entre les deux.
 *   3. Une suspension ne coupe rien : la requête suivante passe encore (REQ-SEC-032, REQ-SEC-019).
 *   4. Chaque motif de refus est nommé : session absente, inconnue, de clé périmée, révoquée,
 *      expirée, de version périmée, d'apporteur au statut fermé.
 *   5. TÉMOIN À DEUX FACES sur le relèvement (REQ-SEC-004) : une modification de coordonnée
 *      bancaire tentée avec un lien consommé depuis plus de 10 minutes est refusée et nomme le
 *      motif ; la même avec un lien frais passe. Le relèvement est celui de la session courante.
 *   6. Une session s'énumère sans son empreinte, et ne se révoque que par son apporteur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { empreinteDeSession } from '../../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import {
  COOKIE_DE_SESSION,
  MOTIFS_DE_REFUS,
  depotDeSessions,
  exigerSession,
  exigerSessionRelevee,
  jugerSession,
  listerSessions,
  revoquerPourMotifDeSecurite,
  revoquerSession,
  type DepotDeSessions,
  type LigneDeSession,
  type PortsDeSession,
  type SessionListee,
  type VerdictDeSession,
} from '../../../src/server/auth/session';

// ── Next simulé à ses frontières, pour l'action de consommation ──────────────────────────────────

const espions = vi.hoisted(() => ({
  cookies: [] as Array<{ nom: string; valeur: string; attributs: unknown }>,
  redirections: [] as string[],
  issue: 'ouverte' as 'ouverte' | 'lien_invalide',
}));

vi.mock('next/server', () => ({ after: () => undefined }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
  cookies: async () => ({
    set: (nom: string, valeur: string, attributs: unknown) =>
      espions.cookies.push({ nom, valeur, attributs }),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    espions.redirections.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('../../../src/server/auth/lien-magique', async (original) => ({
  ...(await original<typeof import('../../../src/server/auth/lien-magique')>()),
  consommerLien: async () =>
    espions.issue === 'ouverte'
      ? { etat: 'ouverte', jetonSession: JETON_OUVERT }
      : { etat: 'lien_invalide' },
}));

const JETON_OUVERT = 'S'.repeat(43);
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const valeur = (n: string) => `temoin-sec04-revocation-${n.toLowerCase()}-`.padEnd(48, '0');

beforeEach(() => {
  espions.cookies.length = 0;
  espions.redirections.length = 0;
  for (const n of NOMS_DES_SECRETS) vi.stubEnv(n, valeur(n));
  vi.stubEnv('PII_ENCRYPTION_KEY', CLE_HEX);
  vi.stubEnv('NOTIFY_SINK', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REQ-SEC-003 — le cookie de session', () => {
  it('REQ-SEC-003 : le cookie posé à l’ouverture est `__Host-`, HttpOnly, Secure, SameSite=Lax, Path=/, sans domaine, 30 jours', async () => {
    espions.issue = 'ouverte';
    const { consommerUnLienDeConnexion } =
      await import('../../../src/app/(espace)/connexion/actions');
    await expect(consommerUnLienDeConnexion('J'.repeat(43))).rejects.toThrow('NEXT_REDIRECT');
    expect(espions.cookies).toEqual([
      {
        nom: '__Host-partners-session',
        valeur: JETON_OUVERT,
        attributs: {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        },
      },
    ]);
    // Le cookie est posé AVANT la redirection, et l'URL ne porte pas le jeton de session.
    // JUR-T57 (lentille sécurité) : sans base lisible pour l'acceptation, la connexion ne mène JAMAIS
    // à l'issue habituelle de l'espace, mais à son état d'indisponibilité. Ce banc n'a pas de base.
    expect(espions.redirections).toEqual(['/connexion?etat=indisponible']);
    expect(COOKIE_DE_SESSION.nom.startsWith('__Host-')).toBe(true);
    expect(COOKIE_DE_SESSION.attributs).not.toHaveProperty('domain');
  });

  it('REQ-SEC-003 : un lien invalide ne pose AUCUN cookie', async () => {
    espions.issue = 'lien_invalide';
    const { consommerUnLienDeConnexion } =
      await import('../../../src/app/(espace)/connexion/actions');
    await expect(consommerUnLienDeConnexion('J'.repeat(43))).rejects.toThrow('NEXT_REDIRECT');
    expect(espions.cookies).toEqual([]);
    expect(espions.redirections).toEqual(['/connexion?issue=lien_invalide']);
  });

  it('REQ-SEC-003 : la durée du cookie est celle de la session, lue à la source unique des durées', () => {
    expect(COOKIE_DE_SESSION.attributs.maxAge * 1000).toBe(DUREES_AUTH.sessionMs.valeur);
  });
});

// ── le dépôt en mémoire : il relit son état à CHAQUE appel ───────────────────────────────────────

const SECRET = 'temoin-sec04-secret-de-session-'.padEnd(64, '7');
const KID = kidDe(SECRET);
const T0 = new Date(Date.UTC(2026, 8, 26, 8, 0, 0));
const MINUTE = 60 * 1000;

type SessionStockee = {
  id: string;
  apporteurId: string;
  tokenHash: string;
  kid: string;
  creeAt: Date;
  expireAt: Date;
  revoqueAt: Date | null;
  derniereVueAt: Date | null;
  sessionVersion: number;
  lienConsommeAt: Date | null;
};

type Monde = {
  apporteurs: Map<string, { statut: string; sessionVersion: number }>;
  sessions: SessionStockee[];
  vues: Array<{ id: string; maintenant: Date }>;
};

function monde(): Monde {
  return { apporteurs: new Map(), sessions: [], vues: [] };
}

function poserApporteur(m: Monde, id: string, statut: string): void {
  m.apporteurs.set(id, { statut, sessionVersion: 0 });
}

/** Ouvre une session comme la base le fait : la version de l'apporteur est COPIÉE à l'ouverture. */
function ouvrir(
  m: Monde,
  s: { id: string; apporteurId: string; jeton: string; consommeAt: Date; kid: string }
): void {
  const a = m.apporteurs.get(s.apporteurId);
  if (!a) throw new Error('apporteur absent du monde');
  m.sessions.push({
    id: s.id,
    apporteurId: s.apporteurId,
    tokenHash: empreinteDeSession(s.jeton, SECRET),
    kid: s.kid,
    creeAt: s.consommeAt,
    expireAt: new Date(s.consommeAt.getTime() + DUREES_AUTH.sessionMs.valeur),
    revoqueAt: null,
    derniereVueAt: null,
    sessionVersion: a.sessionVersion,
    lienConsommeAt: s.consommeAt,
  });
}

function depotEnMemoire(m: Monde): DepotDeSessions {
  return {
    async lire(tokenHash) {
      const s = m.sessions.find((x) => x.tokenHash === tokenHash);
      if (!s) return null;
      const a = m.apporteurs.get(s.apporteurId);
      if (!a) return null;
      return {
        id: s.id,
        apporteurId: s.apporteurId,
        kid: s.kid,
        expireAt: s.expireAt,
        revoqueAt: s.revoqueAt,
        sessionVersion: s.sessionVersion,
        apporteur: { statut: a.statut, sessionVersion: a.sessionVersion },
        lienMagique: { consommeAt: s.lienConsommeAt },
      };
    },
    async marquerVue(id, maintenant) {
      m.vues.push({ id, maintenant });
    },
    async lister(apporteurId) {
      return m.sessions
        .filter((s) => s.apporteurId === apporteurId)
        .map(({ id, creeAt, expireAt, revoqueAt, derniereVueAt }) => ({
          id,
          creeAt,
          expireAt,
          revoqueAt,
          derniereVueAt,
        }));
    },
    async revoquer(id, apporteurId, maintenant) {
      const s = m.sessions.find(
        (x) => x.id === id && x.apporteurId === apporteurId && x.revoqueAt === null
      );
      if (!s) return 0;
      s.revoqueAt = maintenant;
      return 1;
    },
    async incrementerVersion(apporteurId) {
      const a = m.apporteurs.get(apporteurId);
      if (a) a.sessionVersion += 1;
    },
  };
}

function ports(m: Monde, maintenant: Date): PortsDeSession {
  return {
    maintenant: () => maintenant,
    depot: depotEnMemoire(m),
    configuration: { secret: SECRET, kid: KID },
  };
}

const JETON_A = 'A'.repeat(43);
const JETON_B = 'B'.repeat(43);

/** Un monde à un apporteur `signe` et une session ouverte à T0 par un lien consommé à T0. */
function mondeOuvert(): Monde {
  const m = monde();
  poserApporteur(m, 'apporteur-a', 'signe');
  ouvrir(m, {
    id: 'session-a',
    apporteurId: 'apporteur-a',
    jeton: JETON_A,
    consommeAt: T0,
    kid: KID,
  });
  return m;
}

const refus = (v: VerdictDeSession) => (v.ok ? 'acceptee' : v.motif);

describe('REQ-SEC-003 — la vérification à chaque requête', () => {
  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — sessionVersion incrémentée : la requête SUIVANTE est refusée ; sans incrément, elle passe', async () => {
    const maintenant = new Date(T0.getTime() + MINUTE);
    // Face 1 : incrément entre deux requêtes, à la même heure.
    const m1 = mondeOuvert();
    expect(refus(await exigerSession(JETON_A, ports(m1, maintenant)))).toBe('acceptee');
    await revoquerPourMotifDeSecurite('apporteur-a', ports(m1, maintenant));
    expect(refus(await exigerSession(JETON_A, ports(m1, maintenant)))).toBe('version_perimee');
    // Face 2 : aucune incrémentation, même séquence, la seconde requête passe.
    const m2 = mondeOuvert();
    expect(refus(await exigerSession(JETON_A, ports(m2, maintenant)))).toBe('acceptee');
    expect(refus(await exigerSession(JETON_A, ports(m2, maintenant)))).toBe('acceptee');
  });

  it('REQ-SEC-003 : la vérification relit le dépôt à chaque appel, avec les MÊMES ports (aucune mémoire entre deux requêtes)', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    expect(refus(await exigerSession(JETON_A, p))).toBe('acceptee');
    m.apporteurs.get('apporteur-a')!.sessionVersion += 1;
    expect(refus(await exigerSession(JETON_A, p))).toBe('version_perimee');
  });

  it('REQ-SEC-003 : une SUSPENSION posée après l’ouverture ne coupe rien — la requête suivante passe encore', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    expect(refus(await exigerSession(JETON_A, p))).toBe('acceptee');
    m.apporteurs.get('apporteur-a')!.statut = 'suspendu';
    const v = await exigerSession(JETON_A, p);
    // SEC-43 : la session porte son niveau d'accès — la suspension garde l'ouverture PLEINE.
    expect(v).toEqual({
      ok: true,
      session: {
        id: 'session-a',
        apporteurId: 'apporteur-a',
        lienConsommeAt: T0,
        niveau: 'plein',
        statut: 'suspendu',
      },
    });
  });

  it('REQ-SEC-003 : une session rouverte APRÈS l’incrément porte la nouvelle version et passe', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    await revoquerPourMotifDeSecurite('apporteur-a', p);
    ouvrir(m, {
      id: 'session-b',
      apporteurId: 'apporteur-a',
      jeton: JETON_B,
      consommeAt: T0,
      kid: KID,
    });
    expect(refus(await exigerSession(JETON_A, p))).toBe('version_perimee');
    expect(refus(await exigerSession(JETON_B, p))).toBe('acceptee');
  });

  it('REQ-SEC-003 : sans cookie, la session est absente ; un jeton inconnu est inconnu', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    expect(refus(await exigerSession(undefined, p))).toBe('absente');
    expect(refus(await exigerSession('', p))).toBe('absente');
    expect(refus(await exigerSession(JETON_B, p))).toBe('inconnue');
  });

  it('REQ-SEC-003 : la ligne est cherchée par l’empreinte HMAC du jeton sous le secret des sessions', async () => {
    const m = mondeOuvert();
    const lus: string[] = [];
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    const depot = p.depot;
    const espion: PortsDeSession = {
      ...p,
      depot: { ...depot, lire: (h) => (lus.push(h), depot.lire(h)) },
    };
    await exigerSession(JETON_A, espion);
    expect(lus).toEqual([empreinteDeSession(JETON_A, SECRET)]);
  });

  it('REQ-SEC-003 : la dernière vue est écrite pour une session acceptée, et pour elle seule', async () => {
    const m = mondeOuvert();
    const maintenant = new Date(T0.getTime() + 3 * MINUTE);
    await exigerSession(JETON_A, ports(m, maintenant));
    expect(m.vues).toEqual([{ id: 'session-a', maintenant }]);
    await revoquerPourMotifDeSecurite('apporteur-a', ports(m, maintenant));
    await exigerSession(JETON_A, ports(m, maintenant));
    await exigerSession(JETON_B, ports(m, maintenant));
    await exigerSession(undefined, ports(m, maintenant));
    expect(m.vues).toHaveLength(1);
  });

  it('REQ-SEC-003 : le vecteur figé de l’empreinte de session (partners/ADR-0013, décision 14)', () => {
    expect(empreinteDeSession('A'.repeat(43), 'secret-de-session-fige')).toBe(
      '170071ee22e287ed0a1a5c21a2f689f0e67da1a7316d77ec6b8760d53c0b92c7'
    );
  });
});

// ── le juge pur : chaque motif, dans son ordre ───────────────────────────────────────────────────

function ligne(l: {
  kid: string;
  revoqueAt: Date | null;
  expireAt: Date;
  sessionVersion: number;
  versionApporteur: number;
  statut: string;
}): LigneDeSession {
  return {
    id: 'session-x',
    apporteurId: 'apporteur-x',
    kid: l.kid,
    expireAt: l.expireAt,
    revoqueAt: l.revoqueAt,
    sessionVersion: l.sessionVersion,
    apporteur: { statut: l.statut, sessionVersion: l.versionApporteur },
    lienMagique: { consommeAt: T0 },
  };
}

const APRES = new Date(T0.getTime() + DUREES_AUTH.sessionMs.valeur);
const saine = {
  kid: KID,
  revoqueAt: null,
  expireAt: APRES,
  sessionVersion: 2,
  versionApporteur: 2,
  statut: 'signe',
};

describe('REQ-SEC-003 — le juge de session nomme chaque refus', () => {
  it('REQ-SEC-003 : les motifs forment une liste fermée', () => {
    expect([...MOTIFS_DE_REFUS]).toEqual([
      'absente',
      'inconnue',
      'cle_perimee',
      'revoquee',
      'expiree',
      'version_perimee',
      'statut_ferme',
      'releve_requis',
      'hors_ouverture_limitee',
      // SEC-19 : un résilié en lecture tente une écriture.
      'lecture_seule',
    ]);
  });

  it('REQ-SEC-003 : une session saine passe, et le verdict ne porte que l’identité de la session et son niveau d’accès', () => {
    expect(jugerSession(ligne(saine), T0, KID)).toEqual({
      ok: true,
      session: {
        id: 'session-x',
        apporteurId: 'apporteur-x',
        lienConsommeAt: T0,
        niveau: 'plein',
        statut: 'signe',
      },
    });
  });

  it('REQ-SEC-003 : aucune ligne → inconnue', () => {
    expect(refus(jugerSession(null, T0, KID))).toBe('inconnue');
  });

  it('REQ-SEC-003 : kid d’une autre clé → cle_perimee', () => {
    expect(refus(jugerSession(ligne({ ...saine, kid: 'deadbeef' }), T0, KID))).toBe('cle_perimee');
  });

  it('REQ-SEC-003 : révoquée → revoquee, même si tout le reste est sain', () => {
    expect(refus(jugerSession(ligne({ ...saine, revoqueAt: T0 }), T0, KID))).toBe('revoquee');
  });

  it('REQ-SEC-003 : échéance atteinte → expiree ; une milliseconde avant, elle passe', () => {
    const echeance = new Date(T0.getTime() + MINUTE);
    const l = ligne({ ...saine, expireAt: echeance });
    expect(refus(jugerSession(l, echeance, KID))).toBe('expiree');
    expect(refus(jugerSession(l, new Date(echeance.getTime() + 1), KID))).toBe('expiree');
    expect(refus(jugerSession(l, new Date(echeance.getTime() - 1), KID))).toBe('acceptee');
  });

  it('REQ-SEC-003 : version de la session différente de celle de l’apporteur → version_perimee, dans les deux sens', () => {
    expect(refus(jugerSession(ligne({ ...saine, versionApporteur: 3 }), T0, KID))).toBe(
      'version_perimee'
    );
    expect(refus(jugerSession(ligne({ ...saine, sessionVersion: 3 }), T0, KID))).toBe(
      'version_perimee'
    );
  });

  it('REQ-SEC-003 : statut qui n’ouvre pas l’espace → statut_ferme ; `suspendu` passe', () => {
    expect(refus(jugerSession(ligne({ ...saine, statut: 'resilie' }), T0, KID))).toBe(
      'statut_ferme'
    );
    expect(refus(jugerSession(ligne({ ...saine, statut: 'candidat' }), T0, KID))).toBe(
      'statut_ferme'
    );
    expect(refus(jugerSession(ligne({ ...saine, statut: 'suspendu' }), T0, KID))).toBe('acceptee');
  });

  it('REQ-SEC-003 : l’ordre des motifs — une ligne fautive partout nomme le PREMIER, un motif du milieu n’efface pas le suivant', () => {
    const fautive = {
      kid: 'deadbeef',
      revoqueAt: T0,
      expireAt: T0,
      sessionVersion: 1,
      versionApporteur: 2,
      statut: 'resilie',
    };
    expect(refus(jugerSession(ligne(fautive), T0, KID))).toBe('cle_perimee');
    expect(refus(jugerSession(ligne({ ...fautive, kid: KID }), T0, KID))).toBe('revoquee');
    expect(refus(jugerSession(ligne({ ...fautive, kid: KID, revoqueAt: null }), T0, KID))).toBe(
      'expiree'
    );
    expect(
      refus(
        jugerSession(ligne({ ...fautive, kid: KID, revoqueAt: null, expireAt: APRES }), T0, KID)
      )
    ).toBe('version_perimee');
    expect(
      refus(
        jugerSession(
          ligne({ ...fautive, kid: KID, revoqueAt: null, expireAt: APRES, sessionVersion: 2 }),
          T0,
          KID
        )
      )
    ).toBe('statut_ferme');
  });
});

// ── le relèvement ────────────────────────────────────────────────────────────────────────────────

/**
 * L'ACTION DE BAC : « modifier la coordonnée bancaire ». Aucune action réelle de ce genre n'existe
 * encore ; celle-ci fait ce que toute action réelle devra faire — exiger une session RELEVÉE avant
 * d'écrire, et nommer le motif quand elle refuse.
 */
async function modifierCoordonneeBancaire(
  jeton: string | undefined,
  p: PortsDeSession,
  ecrites: string[]
): Promise<{ ok: true } | { ok: false; motif: string }> {
  const v = await exigerSessionRelevee(jeton, p);
  if (!v.ok) return { ok: false, motif: v.motif };
  ecrites.push(v.session.apporteurId);
  return { ok: true };
}

describe('REQ-SEC-004 — le relèvement porte sur l’action', () => {
  it('REQ-SEC-004 : TÉMOIN À DEUX FACES — lien consommé il y a 11 min : refusé, motif nommé ; lien frais (9 min) : passe', async () => {
    const m = mondeOuvert();
    const ecrites: string[] = [];
    const tard = new Date(T0.getTime() + 11 * MINUTE);
    expect(await modifierCoordonneeBancaire(JETON_A, ports(m, tard), ecrites)).toEqual({
      ok: false,
      motif: 'releve_requis',
    });
    expect(ecrites).toEqual([]);
    const frais = new Date(T0.getTime() + 9 * MINUTE);
    expect(await modifierCoordonneeBancaire(JETON_A, ports(m, frais), ecrites)).toEqual({
      ok: true,
    });
    expect(ecrites).toEqual(['apporteur-a']);
  });

  it('REQ-SEC-004 : la borne — « moins de 10 minutes » : 10 min pile est refusé, 10 min moins 1 ms passe', async () => {
    const m = mondeOuvert();
    const dix = DUREES_AUTH.releveMs.valeur;
    expect(refus(await exigerSessionRelevee(JETON_A, ports(m, new Date(T0.getTime() + dix))))).toBe(
      'releve_requis'
    );
    expect(
      refus(await exigerSessionRelevee(JETON_A, ports(m, new Date(T0.getTime() + dix - 1))))
    ).toBe('acceptee');
  });

  it('REQ-SEC-004 : la durée du relèvement est de 10 minutes, à la source unique des durées', () => {
    expect(DUREES_AUTH.releveMs).toEqual({
      valeur: 10 * MINUTE,
      source: 'REQ-SEC-004',
      verifieLe: '2026-09-26',
    });
  });

  it('REQ-SEC-004 : le relèvement est celui de la session COURANTE — un lien frais consommé sur une autre session ne relève pas celle-ci', async () => {
    const m = mondeOuvert();
    const plusTard = new Date(T0.getTime() + 30 * MINUTE);
    ouvrir(m, {
      id: 'session-b',
      apporteurId: 'apporteur-a',
      jeton: JETON_B,
      consommeAt: new Date(plusTard.getTime() - MINUTE),
      kid: KID,
    });
    expect(refus(await exigerSessionRelevee(JETON_A, ports(m, plusTard)))).toBe('releve_requis');
    expect(refus(await exigerSessionRelevee(JETON_B, ports(m, plusTard)))).toBe('acceptee');
  });

  it('REQ-SEC-004 : une session refusée l’est pour son propre motif, avant tout relèvement', async () => {
    const m = mondeOuvert();
    const frais = new Date(T0.getTime() + MINUTE);
    await revoquerPourMotifDeSecurite('apporteur-a', ports(m, frais));
    expect(refus(await exigerSessionRelevee(JETON_A, ports(m, frais)))).toBe('version_perimee');
    expect(refus(await exigerSessionRelevee(undefined, ports(m, frais)))).toBe('absente');
  });

  it('REQ-SEC-004 : un lien sans date de consommation ne relève rien', async () => {
    const m = mondeOuvert();
    m.sessions[0]!.lienConsommeAt = null;
    expect(refus(await exigerSessionRelevee(JETON_A, ports(m, T0)))).toBe('releve_requis');
  });
});

// ── énumérer et révoquer ─────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-003 — une session s’énumère, donc se révoque', () => {
  it('REQ-SEC-003 : révoquer SA session — refusée à la requête suivante', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    expect(await revoquerSession('session-a', 'apporteur-a', p)).toBe('revoquee');
    expect(refus(await exigerSession(JETON_A, p))).toBe('revoquee');
  });

  it('REQ-SEC-003 : la session d’un AUTRE apporteur ne se révoque pas, et reste valide', async () => {
    const m = mondeOuvert();
    poserApporteur(m, 'apporteur-b', 'signe');
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    expect(await revoquerSession('session-a', 'apporteur-b', p)).toBe('introuvable');
    expect(refus(await exigerSession(JETON_A, p))).toBe('acceptee');
  });

  it('REQ-SEC-003 : révoquer deux fois rend `introuvable` la seconde fois', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    await revoquerSession('session-a', 'apporteur-a', p);
    expect(await revoquerSession('session-a', 'apporteur-a', p)).toBe('introuvable');
  });

  it('REQ-SEC-003 : la liste rend les sessions de l’apporteur, sans empreinte ni kid', async () => {
    const m = mondeOuvert();
    const p = ports(m, new Date(T0.getTime() + MINUTE));
    const liste: SessionListee[] = await listerSessions('apporteur-a', p);
    expect(liste).toEqual([
      {
        id: 'session-a',
        creeAt: T0,
        expireAt: new Date(T0.getTime() + DUREES_AUTH.sessionMs.valeur),
        revoqueAt: null,
        derniereVueAt: null,
      },
    ]);
    expect(await listerSessions('apporteur-inconnu', p)).toEqual([]);
  });
});

// ── l'adaptateur Prisma, sur un faux client ──────────────────────────────────────────────────────

type Appel = { delegue: string; methode: string; args: unknown };

function fauxClient(reponses: Record<string, unknown>) {
  const appels: Appel[] = [];
  const delegue = (nom: string) =>
    new Proxy(
      {},
      {
        get: (_c, methode: string) => async (args: unknown) => {
          appels.push({ delegue: nom, methode, args });
          return reponses[`${nom}.${methode}`];
        },
      }
    );
  const client = { sessionEspace: delegue('sessionEspace'), apporteur: delegue('apporteur') };
  return { prisma: client as unknown as PrismaClient, appels };
}

describe('REQ-SEC-003 — l’adaptateur Prisma des sessions', () => {
  it('REQ-SEC-003 : la lecture cherche par empreinte et lit la version ET le statut de l’apporteur, et la consommation du lien', async () => {
    const rendue = { id: 'session-a' };
    const { prisma, appels } = fauxClient({ 'sessionEspace.findUnique': rendue });
    expect(await depotDeSessions(prisma).lire('h'.repeat(64))).toBe(rendue);
    expect(appels).toEqual([
      {
        delegue: 'sessionEspace',
        methode: 'findUnique',
        args: {
          where: { tokenHash: 'h'.repeat(64) },
          select: {
            id: true,
            apporteurId: true,
            kid: true,
            expireAt: true,
            revoqueAt: true,
            sessionVersion: true,
            // SEC-19 : les droits en cours d'un résilié, relus avec le statut à chaque requête.
            apporteur: {
              select: {
                statut: true,
                sessionVersion: true,
                attributions: {
                  where: { statut: 'figee_resiliation' },
                  select: { id: true },
                  take: 1,
                },
              },
            },
            lienMagique: { select: { consommeAt: true } },
          },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : la lecture rend `null` quand la ligne manque', async () => {
    const { prisma } = fauxClient({ 'sessionEspace.findUnique': null });
    expect(await depotDeSessions(prisma).lire('h'.repeat(64))).toBeNull();
  });

  it('REQ-SEC-003 : la dernière vue s’écrit sur CETTE session seule', async () => {
    const { prisma, appels } = fauxClient({ 'sessionEspace.updateMany': { count: 1 } });
    await depotDeSessions(prisma).marquerVue('session-a', T0);
    expect(appels).toEqual([
      {
        delegue: 'sessionEspace',
        methode: 'updateMany',
        args: { where: { id: 'session-a' }, data: { derniereVueAt: T0 } },
      },
    ]);
  });

  it('REQ-SEC-003 : la révocation ne touche que la session NON révoquée de CET apporteur, et rend le compte', async () => {
    const { prisma, appels } = fauxClient({ 'sessionEspace.updateMany': { count: 7 } });
    expect(await depotDeSessions(prisma).revoquer('session-a', 'apporteur-a', T0)).toBe(7);
    expect(appels).toEqual([
      {
        delegue: 'sessionEspace',
        methode: 'updateMany',
        args: {
          where: { id: 'session-a', apporteurId: 'apporteur-a', revoqueAt: null },
          data: { revoqueAt: T0 },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : l’énumération est bornée à l’apporteur, la plus récente d’abord, sans empreinte ni kid', async () => {
    const rendue = [{ id: 'session-a' }];
    const { prisma, appels } = fauxClient({ 'sessionEspace.findMany': rendue });
    expect(await depotDeSessions(prisma).lister('apporteur-a')).toBe(rendue);
    expect(appels).toEqual([
      {
        delegue: 'sessionEspace',
        methode: 'findMany',
        args: {
          where: { apporteurId: 'apporteur-a' },
          orderBy: { creeAt: 'desc' },
          select: { id: true, creeAt: true, expireAt: true, revoqueAt: true, derniereVueAt: true },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : la révocation pour motif de sécurité incrémente de UN la version de CET apporteur', async () => {
    const { prisma, appels } = fauxClient({ 'apporteur.update': {} });
    await depotDeSessions(prisma).incrementerVersion('apporteur-a');
    expect(appels).toEqual([
      {
        delegue: 'apporteur',
        methode: 'update',
        args: { where: { id: 'apporteur-a' }, data: { sessionVersion: { increment: 1 } } },
      },
    ]);
  });
});
