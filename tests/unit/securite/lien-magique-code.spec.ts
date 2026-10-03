// @req REQ-SEC-001
// @req REQ-SEC-002
/**
 * `lien-magique-code.spec.ts` — le code à six chiffres du courriel de connexion (SEC-54), sur ports
 * simulés. Le témoin en base (`tests/integration/lien-magique-code.spec.ts`) tient la concurrence
 * et le déclencheur ; celui-ci tient ce que la mutation doit voir.
 *
 * CE QU'IL PROUVE, point par point du cadrage de la lentille sécurité :
 *   (1) LE CODE EST LE LIEN : tiré uniforme sur 000000-999999, posé à l'émission en EMPREINTE
 *       (`partners.code.v1`), envoyé dans le courriel du lien, jamais stocké en clair ;
 *   (3) MÊME RÉPONSE : compte inconnu, aucun lien actif, code faux, lien épuisé ou consommé rendent
 *       la MÊME issue, et une comparaison à temps constant a lieu dans chaque cas ;
 *   (4) TEMPS CONSTANT : `timingSafeEqual` sur les empreintes, jamais le code en clair ;
 *   (5) CINQ ESSAIS : l'essai est compté AVANT la comparaison ; au cinquième échec, le lien est
 *       annulé, et le bon code est ensuite refusé ;
 *   (6) DÉBIT : deux compteurs, l'adresse réseau puis l'adresse saisie ; un refus ou une panne rend
 *       l'issue `debit` (429), en échec fermé ;
 *   (7) RIEN DANS LES JOURNAUX : un motif fermé, sans code, ni adresse, ni empreinte ;
 *   (8) LA SESSION est celle du clic : même écriture, même forme ;
 *   (a) une saisie mal formée est refusée AVANT toute recherche du lien, sans consommer d'essai,
 *       et reste comptée par la limite de débit ;
 *   (b) le code n'a pas de durée propre : il vit et meurt avec son lien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const egaliteConstante = vi.hoisted(() => ({ appels: 0 }));
vi.mock('node:crypto', async (original) => {
  const vrai = await original<typeof import('node:crypto')>();
  return {
    ...vrai,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      egaliteConstante.appels += 1;
      return vrai.timingSafeEqual(a, b);
    },
  };
});

import {
  ESSAIS_DU_CODE_MAX,
  consommerLien,
  tirerJeton,
  type TransactionDeConsommation,
  codeBienForme,
  demanderLien,
  empreinteDeSession,
  empreinteDuCode,
  tirerCode,
  verifierLeCode,
  type ConfigurationDuLien,
  type NouvelleSession,
  type PortsDeDemande,
  type PortsDuCode,
  type ResultatDuCode,
} from '../../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import {
  COOKIE_DATTENTE,
  corpsDuCourriel,
  empreinteDeLaSaisie,
  portsDuCode,
} from '../../../src/server/auth/lien-magique-production';
import { readFileSync } from 'node:fs';
import { creerJournal } from '../../../src/lib/logger';
import { CONNEXION } from '../../../src/content/micro-copy/espace/vocabulaire';
import { CODE_DU_COURRIEL_DE_CONNEXION } from '../../../src/content/micro-copy/courriels/notifications';
import { limiter, sujetDepuisEmpreinte } from '../../../src/server/securite/rate-limit';

// REQ-SEC-002 : un ESPION sur `limiter`, qui délègue au vrai compteur — les témoins des noms de
// compteur lisent ses arguments (comme `lien-magique-production.spec.ts`, QA-T68).
vi.mock('../../../src/server/securite/rate-limit', async (original) => {
  const vrai = await original<typeof import('../../../src/server/securite/rate-limit')>();
  return { ...vrai, limiter: vi.fn(vrai.limiter) };
});

const MAINTENANT = new Date('2026-10-03T10:00:00.000Z');
const CONFIG: ConfigurationDuLien = {
  secret: 'temoin-secret-des-liens-'.padEnd(48, '0'),
  kid: 'ab12cd34',
  urlPublique: 'https://partners.example.org',
  session: { secret: 'temoin-secret-des-sessions-'.padEnd(48, '0'), kid: 'ef56ab78' },
};
const ADRESSE = 'apporteur@example.org';
/** L'empreinte du cookie d'attente : 64 hexadécimaux, jamais une adresse. */
const HASH_ADRESSE = 'a1'.repeat(32);
const HASH_RESEAU = 'r'.repeat(64);

// ── l'univers simulé ─────────────────────────────────────────────────────────────────────────────

interface Lien {
  id: string;
  apporteurId: string;
  kid: string;
  codeHash: string | null;
  tentatives: number;
  creeAt: Date;
  expireAt: Date;
  consommeAt: Date | null;
  annuleAt: Date | null;
}

function univers(o: { compte?: boolean; code?: string; lien?: Partial<Lien> } = {}) {
  const code = o.code ?? '042137';
  const liens: Lien[] =
    o.compte === false
      ? []
      : [
          {
            id: 'lien-1',
            apporteurId: 'app-1',
            kid: CONFIG.kid,
            codeHash: empreinteDuCode(code, CONFIG.secret),
            tentatives: 0,
            creeAt: MAINTENANT,
            expireAt: new Date(MAINTENANT.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
            consommeAt: null,
            annuleAt: null,
            ...o.lien,
          },
        ];
  const sessions: NouvelleSession[] = [];
  const signaux: unknown[] = [];
  const trace: string[] = [];
  const actif = (l: Lien, t: Date) => !l.consommeAt && !l.annuleAt && l.expireAt > t;
  const ports: PortsDuCode = {
    maintenant: () => MAINTENANT,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => HASH_RESEAU,
    compterAdresseCode: vi.fn(async () => ({ autorise: true, panne: false })),
    compterCourrielCode: vi.fn(async () => ({ autorise: true, panne: false })),
    signaler: (motif) => signaux.push(motif),
    configuration: CONFIG,
    transaction: async (travail) =>
      travail({
        async lienActifDe(emailHash, t) {
          trace.push('lienActifDe');
          if (emailHash !== HASH_ADRESSE) return null;
          const l = liens
            .filter((x) => x.apporteurId === 'app-1' && actif(x, t) && x.codeHash !== null)
            .sort((a, b) => b.creeAt.getTime() - a.creeAt.getTime())[0];
          return l ? { id: l.id, apporteurId: l.apporteurId, kid: l.kid } : null;
        },
        async compterEssai(id, t) {
          trace.push('compterEssai');
          const l = liens.find((x) => x.id === id);
          if (!l || !actif(l, t) || l.tentatives >= ESSAIS_DU_CODE_MAX) return null;
          l.tentatives += 1;
          return { codeHash: l.codeHash, tentatives: l.tentatives };
        },
        async annulerLien(id, t) {
          trace.push('annulerLien');
          const l = liens.find((x) => x.id === id)!;
          l.annuleAt ??= t;
        },
        async consommerParId(id, t) {
          trace.push('consommerParId');
          const l = liens.find((x) => x.id === id);
          if (!l || !actif(l, t)) return 0;
          l.consommeAt = t;
          return 1;
        },
        async statutApporteur() {
          return 'signe';
        },
        async ouvrirSession(s) {
          trace.push('ouvrirSession');
          sessions.push(s);
        },
      }),
  };
  return { ports, liens, sessions, signaux, trace, code };
}

/**
 * L'action lit l'empreinte dans le cookie d'attente : une adresse bien formée y a laissé
 * HASH_ADRESSE ; toute autre valeur passe telle quelle, comme un cookie absent ou forgé.
 */
const verifier = (u: ReturnType<typeof univers>, code: string, saisie: string | null = ADRESSE) =>
  verifierLeCode(
    {
      emailHash: saisie !== null && saisie.includes('@') ? HASH_ADRESSE : saisie,
      code,
      entetes: new Headers(),
    },
    u.ports
  );

beforeEach(() => {
  egaliteConstante.appels = 0;
});

// ── (1) et (b) : le code est le lien ─────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — le code est une seconde forme du MÊME lien', () => {
  it('REQ-SEC-001 : TÉMOIN — six chiffres ASCII, zéros de tête compris, tirés sur toute la borne', () => {
    expect(tirerCode(() => 0)).toBe('000000');
    expect(tirerCode(() => 999_999)).toBe('999999');
    expect(tirerCode(() => 4_217)).toBe('004217');
    for (const hors of [-1, 1_000_000, 1.5, Number.NaN])
      expect(() => tirerCode(() => hors)).toThrow(/code_hors_borne/);
    expect(/^[0-9]{6}$/.test(tirerCode())).toBe(true);
  });

  it('REQ-SEC-001 : TÉMOIN — l’empreinte est un HMAC de domaine partners.code.v1, distinct du jeton', () => {
    const attendu = createHmac('sha256', CONFIG.secret)
      .update(`partners.code.v1\u001f123456`)
      .digest('hex');
    expect(empreinteDuCode('123456', CONFIG.secret)).toBe(attendu);
    expect(empreinteDuCode('123456', CONFIG.secret)).not.toBe(
      createHmac('sha256', CONFIG.secret).update(`partners.lien.v1\u001f123456`).digest('hex')
    );
  });

  it('REQ-SEC-001 : TÉMOIN — à l’émission, le lien porte l’EMPREINTE du code, et le courriel porte le code', async () => {
    const inseres: { codeHash: string }[] = [];
    const envoyes: { code: string; url: string }[] = [];
    const travaux: (() => Promise<void>)[] = [];
    const ports = {
      maintenant: () => MAINTENANT,
      adresseDuClient: () => '203.0.113.7',
      empreinteAdresseReseau: () => HASH_RESEAU,
      empreinteCourriel: () => HASH_ADRESSE,
      compterAdresse: async () => ({ autorise: true, panne: false }),
      compterCourriel: async () => ({ autorise: true, panne: false }),
      planifier: (t: () => Promise<void>) => travaux.push(t),
      configuration: CONFIG,
      emission: {
        trouverApporteur: async () => ({ id: 'app-1', statut: 'signe' }),
        adresseStockee: async () => ADRESSE,
        annulerLiensActifs: async () => undefined,
        insererLien: async (l: { codeHash: string }) => void inseres.push(l),
        envoyer: async (m: { code: string; url: string }) => void envoyes.push(m),
        signalerPotDeMiel: async () => undefined,
        signalerEchec: () => undefined,
      },
    } as unknown as PortsDeDemande;
    expect(
      await demanderLien({ saisie: ADRESSE, piege: false, entetes: new Headers() }, ports)
    ).toBe('envoye');
    await travaux[0]!();
    const [envoye] = envoyes;
    expect(envoye!.code).toMatch(/^[0-9]{6}$/);
    expect(inseres[0]!.codeHash).toBe(empreinteDuCode(envoye!.code, CONFIG.secret));
    // Jamais le code en clair dans le dépôt.
    expect(JSON.stringify(inseres)).not.toContain(envoye!.code);
  });

  it('REQ-SEC-001 : TÉMOIN (b) — le code n’a pas de durée propre : un lien expiré refuse le bon code', async () => {
    const u = univers({ lien: { expireAt: new Date(MAINTENANT.getTime() - 1) } });
    expect(await verifier(u, u.code)).toEqual({ etat: 'code_refuse' });
    expect(u.sessions).toEqual([]);
  });
});

// ── le bon code, et (8) la session du clic ──────────────────────────────────────────────────────

describe('REQ-SEC-001 — le bon code ouvre la session du clic, une fois', () => {
  it('REQ-SEC-001 : TÉMOIN — bon code → une session, puis le lien et le code sont inutilisables', async () => {
    const u = univers();
    const r = await verifier(u, u.code);
    expect(r.etat).toBe('ouverte');
    const jeton = (r as Extract<ResultatDuCode, { etat: 'ouverte' }>).jetonSession;
    expect(u.sessions).toEqual([
      {
        apporteurId: 'app-1',
        lienMagiqueId: 'lien-1',
        tokenHash: empreinteDeSession(jeton, CONFIG.session.secret),
        kid: CONFIG.session.kid,
        ipHash: HASH_RESEAU,
        creeAt: MAINTENANT,
        expireAt: new Date(MAINTENANT.getTime() + DUREES_AUTH.sessionMs.valeur),
      },
    ]);
    expect(u.liens[0]!.consommeAt).toEqual(MAINTENANT);
    expect(await verifier(u, u.code)).toEqual({ etat: 'code_refuse' });
    expect(u.sessions).toHaveLength(1);
  });

  it('REQ-SEC-001 : TÉMOIN — l’essai est COMPTÉ avant la comparaison, et la consommation suit', async () => {
    const u = univers();
    await verifier(u, u.code);
    expect(u.trace).toEqual(['lienActifDe', 'compterEssai', 'consommerParId', 'ouvrirSession']);
  });
});

// ── (3) et (4) : même réponse, temps constant ───────────────────────────────────────────────────

describe('REQ-SEC-001 — la même réponse, à temps constant', () => {
  it('REQ-SEC-001 : TÉMOIN — compte inconnu, aucun lien, code faux, épuisé, consommé : réponses IDENTIQUES', async () => {
    const cas: [string, ReturnType<typeof univers>, string][] = [];
    cas.push(['compte inconnu', univers({ compte: false }), '042137']);
    cas.push(['code faux', univers(), '999999']);
    cas.push(['épuisé', univers({ lien: { tentatives: ESSAIS_DU_CODE_MAX } }), '042137']);
    cas.push(['consommé', univers({ lien: { consommeAt: MAINTENANT } }), '042137']);
    cas.push(['annulé', univers({ lien: { annuleAt: MAINTENANT } }), '042137']);
    const reponses = [];
    for (const [nom, u, code] of cas) {
      egaliteConstante.appels = 0;
      const r = await verifier(u, code);
      reponses.push(JSON.stringify(r));
      expect(egaliteConstante.appels, `${nom} : une comparaison à temps constant`).toBe(1);
      expect(u.sessions, nom).toEqual([]);
    }
    expect(new Set(reponses)).toEqual(new Set([JSON.stringify({ etat: 'code_refuse' })]));
  });

  it('REQ-SEC-001 : TÉMOIN — le bon code passe AUSSI par la comparaison à temps constant', async () => {
    const u = univers();
    await verifier(u, u.code);
    expect(egaliteConstante.appels).toBe(1);
  });

  it('REQ-SEC-001 : TÉMOIN (sécurité) — compte inconnu ou lien d’une autre clé : l’essai part AUSSI en base, sans rien compter', async () => {
    for (const u of [univers({ compte: false }), univers({ lien: { kid: 'ffffffff' } })]) {
      expect(await verifier(u, u.code)).toEqual({ etat: 'code_refuse' });
      expect(u.trace).toEqual(['lienActifDe', 'compterEssai']);
      for (const l of u.liens) expect(l.tentatives).toBe(0);
    }
  });
});

// ── (5) : cinq essais ────────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — cinq essais, puis le lien est annulé', () => {
  it('REQ-SEC-001 : TÉMOIN — cinq faux → lien annulé ; le sixième est refusé même avec le bon code', async () => {
    const u = univers();
    for (let i = 0; i < ESSAIS_DU_CODE_MAX; i += 1)
      expect(await verifier(u, '999999')).toEqual({ etat: 'code_refuse' });
    expect(u.liens[0]!.tentatives).toBe(ESSAIS_DU_CODE_MAX);
    expect(u.liens[0]!.annuleAt).toEqual(MAINTENANT);
    expect(u.trace.filter((t) => t === 'annulerLien')).toHaveLength(1);
    expect(await verifier(u, u.code)).toEqual({ etat: 'code_refuse' });
    expect(u.sessions).toEqual([]);
  });

  it('REQ-SEC-001 : TÉMOIN — avant le cinquième échec, le lien reste ouvert', async () => {
    const u = univers();
    for (let i = 0; i < ESSAIS_DU_CODE_MAX - 1; i += 1) await verifier(u, '999999');
    expect(u.liens[0]!.annuleAt).toBeNull();
    expect((await verifier(u, u.code)).etat).toBe('ouverte');
  });
});

// ── (a) : la saisie mal formée ──────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — (a) la saisie mal formée', () => {
  it('REQ-SEC-001 : TÉMOIN — six chiffres ASCII seulement', () => {
    for (const ok of ['000000', '123456', '999999']) expect(codeBienForme(ok)).toBe(true);
    for (const ko of ['', '12345', '1234567', '12345a', ' 123456', '１２３４５６', '12 456'])
      expect(codeBienForme(ko), JSON.stringify(ko)).toBe(false);
  });

  it('REQ-SEC-001 : TÉMOIN — refusée AVANT toute recherche du lien, sans essai, mais comptée par le débit', async () => {
    const u = univers();
    expect(await verifier(u, '12a456')).toEqual({ etat: 'code_refuse' });
    expect(u.trace).toEqual([]);
    expect(u.liens[0]!.tentatives).toBe(0);
    expect(u.ports.compterAdresseCode).toHaveBeenCalledTimes(1);
    expect(u.ports.compterCourrielCode).toHaveBeenCalledTimes(1);
    // Son refus ne dépend pas de l'existence du compte.
    const inconnu = univers({ compte: false });
    expect(await verifier(inconnu, '12a456')).toEqual(await verifier(u, '12a456'));
  });
});

// ── (6) : le débit ───────────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — (6) la limite de débit, en échec fermé', () => {
  it('REQ-SEC-001 : TÉMOIN — l’adresse réseau puis l’adresse saisie, chacune sous son empreinte', async () => {
    const u = univers();
    await verifier(u, u.code);
    expect(u.ports.compterAdresseCode).toHaveBeenCalledWith(HASH_RESEAU, MAINTENANT.getTime());
    expect(u.ports.compterCourrielCode).toHaveBeenCalledWith(HASH_ADRESSE, MAINTENANT.getTime());
  });

  it('REQ-SEC-001 : TÉMOIN — un compteur épuisé ou en panne → « debit », et le lien n’est pas touché', async () => {
    for (const [port, verdict] of [
      ['compterAdresseCode', { autorise: false, panne: false }],
      ['compterAdresseCode', { autorise: false, panne: true }],
      ['compterCourrielCode', { autorise: false, panne: false }],
      ['compterCourrielCode', { autorise: false, panne: true }],
    ] as const) {
      const u = univers();
      (u.ports[port] as ReturnType<typeof vi.fn>).mockResolvedValue(verdict);
      expect(await verifier(u, u.code), `${port} ${JSON.stringify(verdict)}`).toEqual({
        etat: 'debit',
      });
      expect(u.trace).toEqual([]);
      expect(u.signaux).toEqual(['debit']);
    }
  });

  it('REQ-SEC-001 : TÉMOIN — une adresse réseau illisible refuse, en échec fermé', async () => {
    const u = univers();
    u.ports.adresseDuClient = () => null;
    expect(await verifier(u, u.code)).toEqual({ etat: 'debit' });
    expect(u.trace).toEqual([]);
  });

  it('REQ-SEC-001 : TÉMOIN (sécurité) — une adresse saisie HORS FORME ne lit jamais le lien', async () => {
    const u = univers();
    expect(await verifier(u, u.code, 'pas-une-adresse')).toEqual({ etat: 'code_refuse' });
    expect(u.trace).toEqual([]);
    expect(u.liens[0]!.tentatives).toBe(0);
    // Sans empreinte, pas de compteur par adresse : le compteur IP, lui, a été consulté.
    expect(u.ports.compterAdresseCode).toHaveBeenCalledTimes(1);
    expect(u.ports.compterCourrielCode).not.toHaveBeenCalled();
  });

  it('REQ-SEC-001 : TÉMOIN (sécurité) — le compteur IP passe AVANT le contrôle de forme : IP épuisée → debit, même hors forme', async () => {
    const u = univers();
    (u.ports.compterAdresseCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      autorise: false,
      panne: false,
    });
    expect(await verifier(u, '12a456', 'pas-une-adresse')).toEqual({ etat: 'debit' });
    expect(await verifier(u, u.code, 'pas-une-adresse')).toEqual({ etat: 'debit' });
    expect(u.trace).toEqual([]);
  });

  it('REQ-SEC-001 : TÉMOIN (sécurité, condition 1) — compteur épuisé : compte connu ou inconnu, la MÊME réponse, octet pour octet', async () => {
    const reponses: string[] = [];
    for (const compte of [true, false]) {
      const u = univers({ compte });
      (u.ports.compterCourrielCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        autorise: false,
        panne: false,
      });
      reponses.push(JSON.stringify(await verifier(u, u.code)));
      expect(u.trace, `compte ${compte}`).toEqual([]);
    }
    expect(reponses).toEqual([
      JSON.stringify({ etat: 'debit' }),
      JSON.stringify({ etat: 'debit' }),
    ]);
  });

  it('REQ-SEC-001 : TÉMOIN (sécurité, condition 1) — les deux compteurs sont consultés AVANT toute lecture du lien', async () => {
    const u = univers();
    const ordre: string[] = [];
    (u.ports.compterAdresseCode as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      ordre.push('compteur:ip');
      return { autorise: true, panne: false };
    });
    (u.ports.compterCourrielCode as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      ordre.push('compteur:adresse');
      return { autorise: true, panne: false };
    });
    const transaction = u.ports.transaction;
    u.ports.transaction = (travail) => {
      ordre.push('lecture du lien');
      return transaction(travail);
    };
    await verifier(u, u.code);
    expect(ordre).toEqual(['compteur:ip', 'compteur:adresse', 'lecture du lien']);
  });
});

// ── (7) : rien dans les journaux ────────────────────────────────────────────────────────────────

describe('REQ-SEC-001 — (7) un motif fermé, rien de la personne', () => {
  it('REQ-SEC-001 : TÉMOIN — code faux, puis épuisé : deux motifs fermés, sans code ni adresse ni empreinte', async () => {
    const u = univers();
    for (let i = 0; i < ESSAIS_DU_CODE_MAX; i += 1) await verifier(u, '999999');
    expect(u.signaux).toEqual([
      'code_refuse',
      'code_refuse',
      'code_refuse',
      'code_refuse',
      'code_epuise',
    ]);
    const tout = JSON.stringify(u.signaux);
    for (const interdit of [u.code, '999999', ADRESSE, HASH_ADRESSE, HASH_RESEAU])
      expect(tout).not.toContain(interdit);
  });
});

// ── le câblage de production : compteurs, courriel, journal ────────────────────────────────────

const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec54-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
};
const INSTANT = Date.UTC(2026, 9, 3, 10, 0, 0);

function production() {
  const avertissements: string[] = [];
  const ports = portsDuCode({
    env: ENV,
    // La vérification ne touche pas la base dans ces témoins : tout accès lèverait.
    prisma: new Proxy(
      {},
      {
        get: () => {
          throw new Error('base touchée');
        },
      }
    ) as unknown as PrismaClient,
    horloge: horlogeFigee(INSTANT),
    journal: { warn: (m: string) => avertissements.push(m) },
  });
  return { ports, avertissements };
}

describe('REQ-SEC-002 — les deux compteurs de la vérification du code', () => {
  // Des accolades : une fonction RENDUE par beforeEach est un nettoyage, que vitest appellerait.
  beforeEach(() => {
    vi.mocked(limiter).mockClear();
  });

  it('REQ-SEC-002 : TÉMOIN — compterAdresseCode appelle EXACTEMENT `magic:code-ip`, avec le sujet et l’instant reçus', async () => {
    await production().ports.compterAdresseCode('0123456789abcdef', INSTANT);
    expect(vi.mocked(limiter).mock.calls).toEqual([
      ['magic:code-ip', sujetDepuisEmpreinte('0123456789abcdef'), INSTANT],
    ]);
  });

  it('REQ-SEC-002 : TÉMOIN — compterCourrielCode appelle EXACTEMENT `magic:code-courriel`, distinct de la demande de lien', async () => {
    await production().ports.compterCourrielCode('fedcba9876543210', INSTANT);
    expect(vi.mocked(limiter).mock.calls).toEqual([
      ['magic:code-courriel', sujetDepuisEmpreinte('fedcba9876543210'), INSTANT],
    ]);
  });

  it('REQ-SEC-002 : TÉMOIN — chaque compteur épuisé rend la réponse générique, la même pour les deux', async () => {
    const reponses: string[] = [];
    for (const port of ['compterAdresseCode', 'compterCourrielCode'] as const) {
      const u = univers();
      (u.ports[port] as ReturnType<typeof vi.fn>).mockResolvedValue({
        autorise: false,
        panne: false,
      });
      reponses.push(JSON.stringify(await verifier(u, u.code)));
    }
    expect(reponses).toEqual([
      JSON.stringify({ etat: 'debit' }),
      JSON.stringify({ etat: 'debit' }),
    ]);
  });
});

describe('REQ-SEC-001 — le courriel et le journal de production', () => {
  it('REQ-SEC-001 : TÉMOIN — le corps porte l’URL, puis le code SEUL sur sa ligne, entre ses deux phrases', () => {
    const corps = corpsDuCourriel('https://partners.example.org/connexion/JETON', '004217');
    expect(corps.split('\n')).toEqual([
      CONNEXION.courriel.corps,
      '',
      'https://partners.example.org/connexion/JETON',
      '',
      CODE_DU_COURRIEL_DE_CONNEXION.avant,
      '004217',
      CODE_DU_COURRIEL_DE_CONNEXION.apres,
    ]);
  });

  it('REQ-SEC-001 : TÉMOIN — le journal ne reçoit qu’un motif fermé', () => {
    const { ports, avertissements } = production();
    for (const motif of ['code_refuse', 'code_epuise', 'debit'] as const) ports.signaler(motif);
    expect(avertissements).toEqual([
      'lien_magique_code_refuse',
      'lien_magique_code_epuise',
      'lien_magique_debit',
    ]);
  });
});

// ── « déjà utilisé », distinct de « invalide » ──────────────────────────────────────────────────

describe('REQ-SEC-001 — un lien déjà consommé se dit « déjà utilisé »', () => {
  function consommation(dejaConsomme?: (tokenHash: string, kid: string) => Promise<boolean>) {
    const appels: [string, string][] = [];
    const tx: TransactionDeConsommation = {
      consommer: async () => 0,
      lireLien: async () => null,
      statutApporteur: async () => 'signe',
      ouvrirSession: async () => undefined,
      ...(dejaConsomme
        ? {
            dejaConsomme: async (t: string, k: string) => {
              appels.push([t, k]);
              return dejaConsomme(t, k);
            },
          }
        : {}),
    };
    const ports = {
      maintenant: () => MAINTENANT,
      transaction: async <T>(w: (t: typeof tx) => Promise<T>) => w(tx),
      configuration: CONFIG,
    };
    return { ports, appels };
  }

  it('REQ-SEC-001 : TÉMOIN — consommation refusée, lien déjà consommé → deja_utilise, sous la clé courante', async () => {
    const jeton = tirerJeton();
    const c = consommation(async () => true);
    expect(await consommerLien({ jeton, ipHash: null }, c.ports)).toEqual({ etat: 'deja_utilise' });
    expect(c.appels).toHaveLength(1);
    expect(c.appels[0]![1]).toBe(CONFIG.kid);
  });

  it('REQ-SEC-001 : TÉMOIN — consommation refusée, lien non consommé (inconnu, expiré, annulé) → lien_invalide', async () => {
    const c = consommation(async () => false);
    expect(await consommerLien({ jeton: tirerJeton(), ipHash: null }, c.ports)).toEqual({
      etat: 'lien_invalide',
    });
  });

  it('REQ-SEC-001 : TÉMOIN — sans le port, l’échec reste « invalide » ; un jeton mal formé ne lit rien', async () => {
    expect(
      await consommerLien({ jeton: tirerJeton(), ipHash: null }, consommation().ports)
    ).toEqual({
      etat: 'lien_invalide',
    });
    const c = consommation(async () => true);
    expect(await consommerLien({ jeton: 'trop-court', ipHash: null }, c.ports)).toEqual({
      etat: 'lien_invalide',
    });
    expect(c.appels).toEqual([]);
  });
});

// ── le cookie d'attente (lentille sécurité, 2026-10-03) ─────────────────────────────────────────

describe('REQ-SEC-001 — le cookie d’attente du code', () => {
  const ACTIONS = readFileSync('src/app/(espace)/connexion/actions.ts', 'utf8');

  it('REQ-SEC-001 : TÉMOIN — ses attributs exacts : __Host-, HttpOnly, Secure, Path=/, SameSite=Strict, la durée du lien', () => {
    expect(COOKIE_DATTENTE).toEqual({
      nom: '__Host-connexion_code',
      attributs: {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: DUREES_AUTH.lienMagiqueMs.valeur / 1000,
      },
    });
    expect(Object.keys(COOKIE_DATTENTE.attributs)).not.toContain('domain');
  });

  it('REQ-SEC-001 : TÉMOIN — sa valeur est l’EMPREINTE de l’adresse (64 hexadécimaux), jamais l’adresse ; hors forme, rien', () => {
    const e = empreinteDeLaSaisie(ENV, 'Apporteur@Example.org');
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toContain('@');
    expect(e).not.toContain('apporteur');
    // Normalisée comme à l'émission : casse et blancs ne changent pas l'empreinte.
    expect(empreinteDeLaSaisie(ENV, '  apporteur@example.org ')).toBe(e);
    expect(empreinteDeLaSaisie(ENV, 'pas-une-adresse')).toBeNull();
  });

  it('REQ-SEC-001 : TÉMOIN — posé pour TOUTE adresse bien formée, sans dépendre du compte ni de l’issue de la demande', () => {
    const demande = ACTIONS.slice(
      ACTIONS.indexOf('export async function demanderUnLienDeConnexion'),
      ACTIONS.indexOf('export async function changerDAdresse')
    );
    // La seule condition de la pose : l'empreinte bien formée. Ni l'état rendu, ni le compte.
    expect(demande).toMatch(
      /if \(empreinte !== null\)\s*\(await cookies\(\)\)\.set\(COOKIE_DATTENTE\.nom, empreinte, COOKIE_DATTENTE\.attributs\)/
    );
    expect(demande).not.toMatch(/if \(etat/);
    // L'empreinte ne touche pas la base : la même adresse donne le même cookie, compte ou non.
    expect(empreinteDeLaSaisie(ENV, 'inconnu@example.org')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('REQ-SEC-001 : TÉMOIN — cookie absent, ou forgé hors forme : code_refuse, sans lecture du lien ni essai', async () => {
    for (const forge of [
      null,
      'CAFE'.repeat(16),
      'a1'.repeat(31),
      'apporteur@example.org',
      'g'.repeat(64),
    ]) {
      const u = univers();
      expect(
        await verifierLeCode({ emailHash: forge, code: u.code, entetes: new Headers() }, u.ports),
        String(forge)
      ).toEqual({ etat: 'code_refuse' });
      expect(u.trace, String(forge)).toEqual([]);
      expect(u.liens[0]!.tentatives).toBe(0);
      expect(u.ports.compterAdresseCode).toHaveBeenCalledTimes(1);
      expect(u.ports.compterCourrielCode).not.toHaveBeenCalled();
    }
  });

  it('REQ-SEC-001 : TÉMOIN — effacé dans les trois cas : session ouverte, « Changer d’adresse », lien annulé au 5e échec', async () => {
    const efface =
      /\.delete\(\{ name: COOKIE_DATTENTE\.nom, path: COOKIE_DATTENTE\.attributs\.path \}\)/g;
    expect(ACTIONS.match(efface)).toHaveLength(3);
    const ouvrir = ACTIONS.slice(
      ACTIONS.indexOf('async function ouvrirLaConnexion'),
      ACTIONS.indexOf('export async function consommerUnLienDeConnexion')
    );
    expect(ouvrir).toMatch(efface);
    const changer = ACTIONS.slice(
      ACTIONS.indexOf('export async function changerDAdresse'),
      ACTIONS.indexOf('async function ouvrirLaConnexion')
    );
    expect(changer).toMatch(efface);
    expect(ACTIONS).toMatch(/if \(lienAnnule\) pot\.delete\(/);
    // Et le noyau ne signale l'annulation qu'au cinquième échec, une fois.
    const u = univers();
    let annonces = 0;
    u.ports.lienAnnule = () => {
      annonces += 1;
    };
    for (let i = 0; i < ESSAIS_DU_CODE_MAX - 1; i += 1) await verifier(u, '999999');
    expect(annonces).toBe(0);
    await verifier(u, '999999');
    expect(annonces).toBe(1);
  });

  it('REQ-SEC-001 : TÉMOIN — le cookie n’apparaît jamais au journal (rédaction de pino)', () => {
    const lignes: string[] = [];
    const journal = creerJournal({ sortie: { write: (l: string) => (lignes.push(l), true) } });
    const empreinte = 'a1'.repeat(32);
    journal.warn('requete', { headers: { cookie: `${COOKIE_DATTENTE.nom}=${empreinte}` } });
    journal.warn('requete', { cookie: empreinte });
    const tout = lignes.join('\n');
    expect(lignes.length).toBeGreaterThan(0);
    expect(tout).not.toContain(empreinte);
  });
});
