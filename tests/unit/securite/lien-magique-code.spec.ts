// @req REQ-SEC-001
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

const MAINTENANT = new Date('2026-10-03T10:00:00.000Z');
const CONFIG: ConfigurationDuLien = {
  secret: 'temoin-secret-des-liens-'.padEnd(48, '0'),
  kid: 'ab12cd34',
  urlPublique: 'https://partners.example.org',
  session: { secret: 'temoin-secret-des-sessions-'.padEnd(48, '0'), kid: 'ef56ab78' },
};
const ADRESSE = 'apporteur@example.org';
const HASH_ADRESSE = 'h'.repeat(64);
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
    empreinteCourriel: (s) => (s.includes('@') ? HASH_ADRESSE : null),
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

const verifier = (u: ReturnType<typeof univers>, code: string, saisie = ADRESSE) =>
  verifierLeCode({ saisie, code, entetes: new Headers() }, u.ports);

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
