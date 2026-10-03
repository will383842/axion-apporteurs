// @req REQ-SEC-003
// @req REQ-UX-048
/**
 * `lien-magique-console.spec.ts` — la connexion de la console par lien et code (SEC-29), sur ports
 * simulés. Le MÊME mécanisme que l'espace, paramétré par la population : une demande, une
 * consommation, une vérification du code, jamais recopiées.
 *
 * CE QU'IL PROUVE :
 *   (1) la demande répond PAREIL pour une adresse inconnue, désactivée ou de l'autre population ;
 *       seul un utilisateur actif de la console reçoit un lien, vers `/console/connexion/<jeton>`,
 *       avec son code dans le même courriel ;
 *   (2) un compte désactivé ne reçoit rien ; désactivé entre l'envoi et le clic, il n'ouvre rien ;
 *   (3) le lien de la console ouvre une session de console ; un lien de l'ESPACE présenté à la
 *       console n'ouvre rien et n'est même pas consommé, et inversement le lien de la console ne
 *       s'ouvre pas à `/connexion` ;
 *   (4) le code de la console : le bon code ouvre, un code faux est refusé, le cinquième échec
 *       annule le lien ;
 *   (5) la session de la console est COURTE : sa durée maximale et son inactivité viennent de
 *       `durees.ts`, plus courtes que la session de l'espace ; `requireRole` refuse une session
 *       inactive, et touche la dernière vue de celle qu'il laisse passer.
 */
import { describe, it, expect } from 'vitest';
import {
  ESSAIS_DU_CODE_MAX,
  consommerLien,
  conditionDeConsommationConsole,
  consommerLienConsole,
  demanderLienConsole,
  empreinteDuCode,
  empreinteDuJeton,
  tirerJeton,
  verifierLeCodeConsole,
  type ConfigurationDuLien,
  type NouveauLienConsole,
  type NouvelleSessionConsole,
  type PortsDeDemandeConsole,
  type PortsDuCodeConsole,
} from '../../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import { jugerAcces } from '../../../src/server/roles/require-role';
import type { PrismaClient } from '@prisma/client';
import {
  ecrituresDeLienConsole,
  lectureDuCompteConsole,
  transactionDeConsommationConsole,
  transactionDuCodeConsole,
} from '../../../src/server/auth/lien-magique-depot';

const MAINTENANT = new Date('2026-10-03T10:00:00.000Z');
const CONFIG: ConfigurationDuLien = {
  secret: 'temoin-secret-des-liens-'.padEnd(48, '0'),
  kid: 'ab12cd34',
  urlPublique: 'https://partners.example.org',
  session: { secret: 'temoin-secret-des-sessions-'.padEnd(48, '0'), kid: 'ef56ab78' },
};
const HASH_ACTIF = 'a1'.repeat(32);
const HASH_DESACTIVE = 'b2'.repeat(32);
const HASH_APPORTEUR = 'c3'.repeat(32);
const HASH_INCONNU = 'd4'.repeat(32);

// ── la demande ───────────────────────────────────────────────────────────────────────────────────

function demande() {
  const liens: NouveauLienConsole[] = [];
  const courriels: { a: string; url: string; code: string }[] = [];
  const travaux: (() => Promise<void>)[] = [];
  const ports: PortsDeDemandeConsole = {
    maintenant: () => MAINTENANT,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => 'r'.repeat(16),
    empreinteCourriel: (saisie) =>
      ({
        'actif@example.org': HASH_ACTIF,
        'desactive@example.org': HASH_DESACTIVE,
        'apporteur@example.org': HASH_APPORTEUR,
        'inconnu@example.org': HASH_INCONNU,
      })[saisie] ?? null,
    compterAdresse: async () => ({ autorise: true, panne: false }),
    compterCourriel: async () => ({ autorise: true, panne: false }),
    planifier: (t) => travaux.push(t),
    configuration: CONFIG,
    emission: {
      trouverUtilisateurConsole: async (h) =>
        h === HASH_ACTIF
          ? { id: 'u-actif', desactiveAt: null }
          : h === HASH_DESACTIVE
            ? { id: 'u-desactive', desactiveAt: new Date('2026-09-01T00:00:00Z') }
            : null,
      adresseStockee: async () => 'actif@example.org',
      annulerLiensActifs: async () => undefined,
      insererLien: async (l) => {
        liens.push(l);
      },
      envoyer: async (m) => {
        courriels.push(m);
      },
      signalerPotDeMiel: async () => undefined,
      signalerEchec: () => undefined,
    },
  };
  const demander = async (saisie: string) => {
    const etat = await demanderLienConsole({ saisie, piege: false, entetes: new Headers() }, ports);
    for (const t of travaux.splice(0)) await t();
    return etat;
  };
  return { demander, liens, courriels };
}

describe('REQ-SEC-003 — (1) et (2) la demande de la console', () => {
  it('REQ-SEC-003 : TÉMOIN — inconnue, désactivée, autre population : la MÊME réponse, et rien n’est émis', async () => {
    for (const saisie of [
      'inconnu@example.org',
      'desactive@example.org',
      'apporteur@example.org',
    ]) {
      const d = demande();
      expect(await d.demander(saisie), saisie).toBe('envoye');
      expect(d.liens, saisie).toEqual([]);
      expect(d.courriels, saisie).toEqual([]);
    }
  });

  it('REQ-SEC-003 : TÉMOIN — un utilisateur actif reçoit un lien de la CONSOLE et son code, dans le même courriel', async () => {
    const d = demande();
    expect(await d.demander('actif@example.org')).toBe('envoye');
    expect(d.liens).toHaveLength(1);
    const [lien] = d.liens;
    expect(lien!.utilisateurConsoleId).toBe('u-actif');
    expect(lien).not.toHaveProperty('apporteurId');
    const [courriel] = d.courriels;
    expect(courriel!.url).toMatch(
      /^https:\/\/partners\.example\.org\/console\/connexion\/[A-Za-z0-9_-]{43}$/
    );
    expect(courriel!.code).toMatch(/^\d{6}$/);
    expect(lien!.codeHash).toBe(empreinteDuCode(courriel!.code, CONFIG.secret));
    expect(lien!.expireAt.getTime() - MAINTENANT.getTime()).toBe(DUREES_AUTH.lienMagiqueMs.valeur);
  });
});

// ── la consommation ──────────────────────────────────────────────────────────────────────────────

interface LienEnBase {
  id: string;
  tokenHash: string;
  apporteurId: string | null;
  utilisateurConsoleId: string | null;
  kid: string;
  codeHash: string | null;
  tentatives: number;
  expireAt: Date;
  consommeAt: Date | null;
  annuleAt: Date | null;
}

function base(o: { population: 'console' | 'espace'; actif?: boolean; code?: string }) {
  const jeton = tirerJeton();
  const lien: LienEnBase = {
    id: 'lien-1',
    tokenHash: empreinteDuJeton(jeton, CONFIG.secret),
    apporteurId: o.population === 'espace' ? 'app-1' : null,
    utilisateurConsoleId: o.population === 'console' ? 'u-actif' : null,
    kid: CONFIG.kid,
    codeHash: empreinteDuCode(o.code ?? '042137', CONFIG.secret),
    tentatives: 0,
    expireAt: new Date(MAINTENANT.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
    consommeAt: null,
    annuleAt: null,
  };
  const sessions: NouvelleSessionConsole[] = [];
  const actif = (t: Date) => !lien.consommeAt && !lien.annuleAt && lien.expireAt > t;
  const utilisateurActif = async (id: string) => id === 'u-actif' && o.actif !== false;
  const tx = {
    async consommer(
      condition: { tokenHash: string; utilisateurConsoleId?: { not: null }; apporteurId?: unknown },
      d: { consommeAt: Date }
    ) {
      if (condition.tokenHash !== lien.tokenHash || !actif(d.consommeAt)) return 0;
      if (condition.utilisateurConsoleId && lien.utilisateurConsoleId === null) return 0;
      lien.consommeAt = d.consommeAt;
      return 1;
    },
    async lireLien() {
      return { id: lien.id, apporteurId: lien.apporteurId, kid: lien.kid };
    },
    async lireLienConsole() {
      return { id: lien.id, utilisateurConsoleId: lien.utilisateurConsoleId, kid: lien.kid };
    },
    async statutApporteur() {
      return 'signe';
    },
    async ouvrirSession() {
      throw new Error('une session de l’espace ne s’ouvre pas ici');
    },
    utilisateurActif,
    async ouvrirSessionConsole(s: NouvelleSessionConsole) {
      sessions.push(s);
    },
    async lienActifDeConsole(emailHash: string, t: Date) {
      return emailHash === HASH_ACTIF && lien.utilisateurConsoleId !== null && actif(t)
        ? { id: lien.id, utilisateurConsoleId: lien.utilisateurConsoleId, kid: lien.kid }
        : null;
    },
    async compterEssai(id: string, t: Date) {
      if (id !== lien.id || !actif(t) || lien.tentatives >= ESSAIS_DU_CODE_MAX) return null;
      lien.tentatives += 1;
      return { codeHash: lien.codeHash, tentatives: lien.tentatives };
    },
    async annulerLien(_id: string, t: Date) {
      lien.annuleAt ??= t;
    },
    async consommerParId(_id: string, t: Date) {
      if (!actif(t)) return 0;
      lien.consommeAt = t;
      return 1;
    },
  };
  const ports = {
    maintenant: () => MAINTENANT,
    configuration: CONFIG,
    transaction: async <T>(travail: (x: typeof tx) => Promise<T>) => travail(tx),
  };
  return { jeton, lien, sessions, ports };
}

describe('REQ-SEC-003 — (3) le lien de la console n’ouvre que la console', () => {
  it('REQ-SEC-003 : TÉMOIN — le lien de la console ouvre une session de CONSOLE, courte', async () => {
    const b = base({ population: 'console' });
    const r = await consommerLienConsole({ jeton: b.jeton, ipHash: null }, b.ports);
    expect(r.etat).toBe('ouverte');
    expect(b.sessions).toHaveLength(1);
    const [s] = b.sessions;
    expect(s!.utilisateurConsoleId).toBe('u-actif');
    expect(s).not.toHaveProperty('apporteurId');
    expect(s!.expireAt.getTime() - MAINTENANT.getTime()).toBe(DUREES_AUTH.sessionConsoleMs.valeur);
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — un lien de l’ESPACE à la console n’ouvre rien et n’est PAS consommé ; un lien de la console à l’espace n’ouvre rien', async () => {
    const espace = base({ population: 'espace' });
    expect(await consommerLienConsole({ jeton: espace.jeton, ipHash: null }, espace.ports)).toEqual(
      {
        etat: 'lien_invalide',
      }
    );
    expect(espace.lien.consommeAt).toBeNull();
    expect(espace.sessions).toEqual([]);
    const console = base({ population: 'console' });
    expect(await consommerLien({ jeton: console.jeton, ipHash: null }, console.ports)).toEqual({
      etat: 'lien_invalide',
    });
    expect(console.sessions).toEqual([]);
  });

  it('REQ-SEC-003 : TÉMOIN — désactivé entre l’envoi et le clic, l’utilisateur n’ouvre rien', async () => {
    const b = base({ population: 'console', actif: false });
    expect(await consommerLienConsole({ jeton: b.jeton, ipHash: null }, b.ports)).toEqual({
      etat: 'lien_invalide',
    });
    expect(b.sessions).toEqual([]);
  });
});

describe('REQ-SEC-003 — (4) le code de la console, par le mécanisme de l’espace', () => {
  const ports = (b: ReturnType<typeof base>): PortsDuCodeConsole => ({
    ...b.ports,
    adresseDuClient: () => '203.0.113.7',
    empreinteAdresseReseau: () => 'r'.repeat(16),
    compterAdresseCode: async () => ({ autorise: true, panne: false }),
    compterCourrielCode: async () => ({ autorise: true, panne: false }),
    signaler: () => undefined,
  });
  const verifier = (b: ReturnType<typeof base>, code: string) =>
    verifierLeCodeConsole({ emailHash: HASH_ACTIF, code, entetes: new Headers() }, ports(b));

  it('REQ-SEC-003 : TÉMOIN — le bon code ouvre une session de console ; un code faux est refusé', async () => {
    const faux = base({ population: 'console' });
    expect(await verifier(faux, '999999')).toEqual({ etat: 'code_refuse' });
    expect(faux.sessions).toEqual([]);
    const bon = base({ population: 'console' });
    expect((await verifier(bon, '042137')).etat).toBe('ouverte');
    expect(bon.sessions[0]!.utilisateurConsoleId).toBe('u-actif');
  });

  it('REQ-SEC-003 : TÉMOIN — au cinquième échec, le lien est annulé, et le bon code ne l’ouvre plus', async () => {
    const b = base({ population: 'console' });
    for (let i = 0; i < ESSAIS_DU_CODE_MAX; i += 1) await verifier(b, '999999');
    expect(b.lien.annuleAt).not.toBeNull();
    expect(await verifier(b, '042137')).toEqual({ etat: 'code_refuse' });
    expect(b.sessions).toEqual([]);
  });
});

describe('REQ-SEC-003 — (5) la session de la console est courte', () => {
  it('REQ-SEC-003 : TÉMOIN — durée maximale et inactivité viennent de durees.ts, plus courtes que l’espace', () => {
    const { sessionConsoleMs, inactiviteConsoleMs, sessionMs } = DUREES_AUTH;
    expect(sessionConsoleMs.valeur).toBeLessThan(sessionMs.valeur);
    expect(inactiviteConsoleMs.valeur).toBeLessThan(sessionConsoleMs.valeur);
    expect(inactiviteConsoleMs.valeur).toBeGreaterThan(0);
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — une session vue il y a plus que l’inactivité est refusée ; juste avant, elle passe', () => {
    const inactivite = DUREES_AUTH.inactiviteConsoleMs.valeur;
    const ligne = (vue: number) => ({
      kid: CONFIG.session.kid,
      expireAt: new Date(MAINTENANT.getTime() + 60_000),
      revoqueAt: null,
      derniereVueAt: new Date(MAINTENANT.getTime() - vue),
      utilisateurConsole: { id: 'u-actif', role: 'admin' as const, desactiveAt: null },
    });
    const droit = 'action:lever_gel';
    expect(jugerAcces(droit, ligne(inactivite), MAINTENANT, CONFIG.session.kid)).toEqual({
      ok: false,
      motif: 'inactive',
    });
    expect(jugerAcces(droit, ligne(inactivite - 1), MAINTENANT, CONFIG.session.kid).ok).toBe(true);
  });
});

// ── les adaptateurs Prisma de la console ─────────────────────────────────────────────────────────

type Appel = { delegue: string; methode: string; args: unknown };

/** Un faux client : chaque délégué enregistre ses appels et rend la réponse prévue. */
function fauxClient(reponses: Record<string, unknown> = {}) {
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
  const client = {
    lienMagique: delegue('lienMagique'),
    sessionEspace: delegue('sessionEspace'),
    utilisateurConsole: delegue('utilisateurConsole'),
    $transaction: async (travail: (tx: unknown) => Promise<unknown>) => travail(client),
  };
  return { prisma: client as unknown as PrismaClient, appels };
}

describe('REQ-SEC-003 — (a) les adaptateurs jugent la population à chaque lecture et écriture', () => {
  it('REQ-SEC-003 : TÉMOIN — le lien actif du code ne se cherche que parmi les liens de la CONSOLE', async () => {
    const { prisma, appels } = fauxClient({
      'lienMagique.findFirst': { id: 'l', utilisateurConsoleId: 'u', kid: 'k' },
    });
    const lu = await transactionDuCodeConsole(prisma)((tx) =>
      tx.lienActifDeConsole('e'.repeat(64), MAINTENANT)
    );
    expect(lu).toEqual({ id: 'l', utilisateurConsoleId: 'u', kid: 'k' });
    expect(appels[0]!.args).toEqual({
      where: {
        utilisateurConsole: { emailHash: 'e'.repeat(64) },
        utilisateurConsoleId: { not: null },
        consommeAt: null,
        annuleAt: null,
        expireAt: { gt: MAINTENANT },
        codeHash: { not: null },
      },
      orderBy: [{ creeAt: 'desc' }, { id: 'desc' }],
      select: { id: true, utilisateurConsoleId: true, kid: true },
    });
    const sansUtilisateur = fauxClient({
      'lienMagique.findFirst': { id: 'l', utilisateurConsoleId: null, kid: 'k' },
    });
    expect(
      await transactionDuCodeConsole(sansUtilisateur.prisma)((tx) =>
        tx.lienActifDeConsole('e'.repeat(64), MAINTENANT)
      )
    ).toBeNull();
  });

  it('REQ-SEC-003 : TÉMOIN — la consommation passe la condition de la console telle quelle ; le « déjà consommé » est de la console', async () => {
    const { prisma, appels } = fauxClient({
      'lienMagique.updateMany': { count: 1 },
      'lienMagique.count': 1,
    });
    const condition = conditionDeConsommationConsole('t'.repeat(64), MAINTENANT);
    expect(condition.utilisateurConsoleId).toEqual({ not: null });
    await transactionDeConsommationConsole(prisma)(async (tx) => {
      await tx.consommer(condition, { consommeAt: MAINTENANT });
      expect(await tx.dejaConsommeConsole!('t'.repeat(64), 'kid')).toBe(true);
    });
    expect(appels).toEqual([
      {
        delegue: 'lienMagique',
        methode: 'updateMany',
        args: { where: condition, data: { consommeAt: MAINTENANT } },
      },
      {
        delegue: 'lienMagique',
        methode: 'count',
        args: {
          where: {
            tokenHash: 't'.repeat(64),
            kid: 'kid',
            utilisateurConsoleId: { not: null },
            consommeAt: { not: null },
          },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : TÉMOIN — un utilisateur introuvable ou désactivé n’est pas actif ; l’annulation ne touche que SES liens', async () => {
    for (const [reponse, attendu] of [
      [null, false],
      [{ desactiveAt: MAINTENANT }, false],
      [{ desactiveAt: null }, true],
    ] as const) {
      const { prisma } = fauxClient({ 'utilisateurConsole.findUnique': reponse });
      expect(await transactionDeConsommationConsole(prisma)((tx) => tx.utilisateurActif('u'))).toBe(
        attendu
      );
    }
    const { prisma, appels } = fauxClient();
    await ecrituresDeLienConsole(prisma).annulerLiensActifs('u', MAINTENANT);
    expect(appels[0]!.args).toEqual({
      where: { utilisateurConsoleId: 'u', consommeAt: null, annuleAt: null },
      data: { annuleAt: MAINTENANT },
    });
  });

  it('REQ-SEC-003 : TÉMOIN — le compte de la console se cherche par l’empreinte du courriel, avec sa désactivation', async () => {
    const { prisma, appels } = fauxClient({
      'utilisateurConsole.findUnique': { id: 'u', desactiveAt: null },
    });
    expect(
      await lectureDuCompteConsole(prisma, {} as never).trouverUtilisateurConsole('e'.repeat(64))
    ).toEqual({ id: 'u', desactiveAt: null });
    expect(appels[0]!.args).toEqual({
      where: { emailHash: 'e'.repeat(64) },
      select: { id: true, desactiveAt: true },
    });
  });
});
