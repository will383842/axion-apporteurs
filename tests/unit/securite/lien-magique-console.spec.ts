// @req REQ-SEC-003
// @req REQ-UX-048
// @req REQ-UX-047
// @req REQ-UX-015
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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import {
  COMPTEURS,
  limiter,
  sujetDepuisEmpreinte,
  type VerdictDeLimite,
} from '../../../src/server/securite/rate-limit';
import { clesPii } from '../../../src/server/securite/pii';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GABARITS,
  estGabaritDeLApporteur,
  type LigneDeNotification,
} from '../../../src/server/notifications/table-ssot';
import { rendreLaNotification } from '../../../src/server/notifications/envoyer';
import { CONNEXION_CONSOLE } from '../../../src/content/micro-copy/console/connexion';
import { ETATS_VIDES_CONSOLE } from '../../../src/content/micro-copy/console/etats-vides';
import {
  EcranArriveeConsole,
  EcranCodeConsole,
  EcranConnexionConsole,
  EcranIssueConsole,
  texteDuRefusDeCodeConsole,
} from '../../../src/app/(connexion-console)/console/connexion/ecran';
import { destinationConsoleBornee } from '../../../src/app/(connexion-console)/console/connexion/destination';
import PageConnexionConsole from '../../../src/app/(connexion-console)/console/connexion/page';
import {
  ESSAIS_DU_CODE_MAX,
  consommerLien,
  conditionDeConsommationConsole,
  consommerLienConsole,
  demanderLienConsole,
  empreinteDeSession,
  empreinteDeSessionConsole,
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
import { COOKIE_DE_SESSION } from '../../../src/server/auth/session';
import {
  COOKIE_DATTENTE,
  COOKIE_DATTENTE_CONSOLE,
  COOKIE_DE_SESSION_CONSOLE,
  corpsDuCourrielConsole,
  effacerUnCookie,
  portsDuCodeConsole,
} from '../../../src/server/auth/lien-magique-production';
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
      // SEC-30 : ouverte à l'instant (le step-up de la levée de gel tient) et à la version de son
      // utilisateur, validé (un admin non validé est en attente).
      creeAt: MAINTENANT,
      sessionVersion: 0,
      utilisateurConsole: {
        id: 'u-actif',
        role: 'admin' as const,
        desactiveAt: null,
        sessionVersion: 0,
        valideAt: MAINTENANT,
      },
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

  // SEC-30 (forme d'A02) : un compte invité non activé à son échéance répond comme un compte
  // désactivé ; l'égalité est refusée, à la milliseconde ; un compte activé ne vieillit plus.
  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — une invitation non activée à l’échéance n’ouvre rien ; une milliseconde avant, elle ouvre ; activée, elle ne vieillit plus', async () => {
    const delai = DUREES_AUTH.invitationConsoleMs.valeur;
    const invite = (ilYA: number, activeeAt: Date | null = null) => ({
      desactiveAt: null,
      inviteeAt: new Date(MAINTENANT.getTime() - ilYA),
      activeeAt,
    });
    for (const [reponse, attendu] of [
      [invite(delai), false],
      [invite(delai - 1), true],
      [invite(delai * 10, MAINTENANT), true],
    ] as const) {
      const { prisma } = fauxClient({ 'utilisateurConsole.findUnique': reponse });
      expect(
        await transactionDeConsommationConsole(prisma)((tx) => tx.utilisateurActif('u', MAINTENANT))
      ).toBe(attendu);
    }
  });

  it('REQ-SEC-003 : TÉMOIN — un utilisateur introuvable ou désactivé n’est pas actif ; l’annulation ne touche que SES liens', async () => {
    for (const [reponse, attendu] of [
      [null, false],
      [{ desactiveAt: MAINTENANT, inviteeAt: null, activeeAt: MAINTENANT }, false],
      [{ desactiveAt: null, inviteeAt: null, activeeAt: MAINTENANT }, true],
    ] as const) {
      const { prisma } = fauxClient({ 'utilisateurConsole.findUnique': reponse });
      expect(
        await transactionDeConsommationConsole(prisma)((tx) => tx.utilisateurActif('u', MAINTENANT))
      ).toBe(attendu);
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
      await lectureDuCompteConsole(prisma, clesPii(ENV_PROD)).trouverUtilisateurConsole(
        'e'.repeat(64)
      )
    ).toEqual({ id: 'u', desactiveAt: null });
    expect(appels[0]!.args).toEqual({
      where: { emailHash: 'e'.repeat(64) },
      select: { id: true, desactiveAt: true },
    });
  });
});

describe('REQ-SEC-003 — (b) les cookies de la console sont DISTINCTS de ceux de l’espace', () => {
  it('REQ-SEC-003 : TÉMOIN — session et attente du code : noms __Host- propres, Secure, HttpOnly, Path=/, SameSite=Strict, la durée de la console', () => {
    expect(COOKIE_DE_SESSION_CONSOLE.nom).toMatch(/^__Host-/);
    expect(COOKIE_DE_SESSION_CONSOLE.nom).not.toBe(COOKIE_DE_SESSION.nom);
    expect(COOKIE_DE_SESSION_CONSOLE.attributs).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: DUREES_AUTH.sessionConsoleMs.valeur / 1000,
    });
    expect(COOKIE_DATTENTE_CONSOLE.nom).toMatch(/^__Host-/);
    expect(COOKIE_DATTENTE_CONSOLE.nom).not.toBe(COOKIE_DATTENTE.nom);
    expect(COOKIE_DATTENTE_CONSOLE.attributs).toEqual(COOKIE_DATTENTE.attributs);
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — le jeton d’une session de l’espace ne se lit pas comme une session de la console, et inversement', () => {
    const jeton = tirerJeton();
    const { secret } = CONFIG.session;
    expect(empreinteDeSessionConsole(jeton, secret)).not.toBe(empreinteDeSession(jeton, secret));
    expect(empreinteDeSessionConsole(jeton, secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('REQ-SEC-003 : TÉMOIN — l’effacement d’un cookie de la console garde ses attributs et pose Max-Age=0', () => {
    const poses: [string, string, Record<string, unknown>][] = [];
    effacerUnCookie({ set: (n, v, a) => poses.push([n, v, a]) }, COOKIE_DATTENTE_CONSOLE);
    expect(poses).toEqual([
      [COOKIE_DATTENTE_CONSOLE.nom, '', { ...COOKIE_DATTENTE_CONSOLE.attributs, maxAge: 0 }],
    ]);
  });
});

describe('REQ-UX-048 — le courriel de la console, ligne de la table des notifications (forme d’A02)', () => {
  const lignes = Object.entries(GABARITS) as [string, LigneDeNotification][];

  it('REQ-UX-048 : TÉMOIN — une ligne de la console n’a que l’e-mail, n’est jamais désactivable, et sa route est déclarée dans la carte de la console', () => {
    const carte = readFileSync('docs/CONSOLE-ROUTES.md', 'utf8');
    const console_ = lignes.filter(([, l]) => l.destinataire === 'utilisateur_console');
    // SEC-30 : l'invitation, la création et la réactivation d'un administrateur rejoignent le lien de la console.
    expect(console_.map(([cle]) => cle).sort()).toEqual([
      'admin_cree',
      'admin_reactive',
      'invitation_console',
      'lien_magique_console',
    ]);
    for (const [cle, l] of console_) {
      expect(cle).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(l.canaux, cle).toEqual(['email']);
      expect(l.desactivable, cle).toBe(false);
      expect(l.notificationObligatoire, cle).toBe(true);
      expect(l.emetteur, cle).toBe(cle === 'lien_magique_console' ? 'SEC-29' : 'SEC-30');
      expect(carte, cle).toContain(`\`${l.route}\``);
    }
    expect(GABARITS.lien_magique_console.actions).toEqual([
      {
        libelle: CONNEXION_CONSOLE.courriel.appel,
        source: 'src/content/micro-copy/console/connexion.ts',
      },
    ]);
  });

  it('REQ-UX-048 : TÉMOIN À DEUX FACES — la règle rougit sur une ligne de la console qui porterait l’espace ou serait désactivable ; les lignes de l’apporteur gardent leur destinataire', () => {
    const fautes = (l: LigneDeNotification) =>
      l.destinataire === 'utilisateur_console' && (l.canaux.includes('espace') || l.desactivable);
    const ligne = GABARITS.lien_magique_console as LigneDeNotification;
    expect(fautes({ ...ligne, canaux: ['email', 'espace'] })).toBe(true);
    expect(fautes({ ...ligne, desactivable: true })).toBe(true);
    expect(fautes(ligne)).toBe(false);
    // Les quatre lignes de la console : le lien, l'invitation, la création et la réactivation.
    expect(lignes.filter(([, l]) => l.destinataire === 'apporteur')).toHaveLength(
      lignes.length - 4
    );
  });
});

describe('REQ-UX-048 — les écrans de la connexion de la console', () => {
  const rien = async (): Promise<void> => undefined;
  const rendu = <P extends object>(e: (props: P) => ReturnType<typeof createElement>, p: P) =>
    renderToStaticMarkup(createElement(e, p));

  it('REQ-UX-048 : TÉMOIN — la demande : l’état vide de la maquette, un champ étiqueté, le piège caché, et la MÊME réponse pour tout compte', () => {
    const h = rendu(EcranConnexionConsole, { etat: null, action: rien });
    const vide = ETATS_VIDES_CONSOLE['connexion-console']!;
    expect(h).toContain(`<h1>${vide.titre}</h1>`);
    expect(h).toContain(`<label for="console-courriel">${CONNEXION_CONSOLE.champCourriel}</label>`);
    expect(h).toContain(vide.action.libelle);
    expect(h).toMatch(/<div hidden="">.*name="site".*<\/div>/s);
    expect(rendu(EcranConnexionConsole, { etat: 'envoye', action: rien })).toContain(
      CONNEXION_CONSOLE.reponses.envoye
    );
  });

  it('REQ-UX-048 REQ-UX-015 : TÉMOIN — le code : un champ numérique, un seul texte pour tout refus, en alerte, puis « Recevoir un nouveau code »', () => {
    const h = rendu(EcranCodeConsole, { refus: null, verifier: rien, changer: rien, suite: null });
    expect(h).toContain(CONNEXION_CONSOLE.envoye.titre);
    expect(h).toMatch(/inputMode="numeric"|inputmode="numeric"/);
    expect(h).toContain(CONNEXION_CONSOLE.code.changer);
    const refuse = rendu(EcranCodeConsole, {
      refus: 'code_refuse',
      verifier: rien,
      changer: rien,
      suite: '/console/apporteurs',
    });
    expect(refuse).toContain(`role="alert">${CONNEXION_CONSOLE.code.refus}`);
    expect(refuse).toContain(`href="/console/connexion">${CONNEXION_CONSOLE.code.nouveauCode}`);
    expect(refuse).toContain('name="suite" value="/console/apporteurs"');
    expect(texteDuRefusDeCodeConsole('debit')).toBe(CONNEXION_CONSOLE.code.debit);
  });

  it('REQ-UX-048 REQ-UX-015 : TÉMOIN — « déjà utilisé » a sa page, distincte d’un lien invalide, sans adresse ni nom ; l’arrivée ne consomme rien', () => {
    const deja = rendu(EcranIssueConsole, { etat: 'deja_utilise' });
    const invalide = rendu(EcranIssueConsole, { etat: 'lien_invalide' });
    expect(deja).toContain(CONNEXION_CONSOLE.dejaUtilise.phrase);
    expect(deja).toContain(`href="/console/connexion">${CONNEXION_CONSOLE.dejaUtilise.action}`);
    expect(deja).not.toBe(invalide);
    expect(deja).not.toMatch(/@/);
    const arrivee = rendu(EcranArriveeConsole, { action: rien });
    expect(arrivee).toContain(`<button type="submit">${CONNEXION_CONSOLE.arriveeAction}</button>`);
  });
});

describe('REQ-SEC-003 — (3) la redirection de la console est BORNÉE à la console', () => {
  it('REQ-SEC-003 : TÉMOIN — un chemin de la console passe, résolu ; tout le reste mène à /console', () => {
    expect(destinationConsoleBornee(null)).toBe('/console');
    expect(destinationConsoleBornee('/console/apporteurs?statut=a#x')).toBe(
      '/console/apporteurs?statut=a#x'
    );
    expect(destinationConsoleBornee('/console/a/../apporteurs')).toBe('/console/apporteurs');
    for (const hostile of [
      '//exemple.invalid/console',
      '/\\exemple.invalid',
      'https://exemple.invalid/console',
      'javascript:alert(1)',
      'console/apporteurs',
      '/mes-entreprises',
      '/api/console',
      '/console/connexion',
      '/console/connexion/' + 'J'.repeat(43),
      '/console/x/../connexion',
      '/console/../api/y',
      '/console/%2e%2e/api',
      '/consoleX',
      '/console/%zz',
      '/console/' + 'a'.repeat(600),
      '',
    ])
      expect(destinationConsoleBornee(hostile), hostile).toBe('/console');
  });
});

// ── le câblage de production : les compteurs de la console (REQ-SEC-062) ─────────────────────────

vi.mock('../../../src/server/securite/rate-limit', async (original) => {
  const vrai = await original<typeof import('../../../src/server/securite/rate-limit')>();
  return { ...vrai, limiter: vi.fn(vrai.limiter) };
});

const ENV_PROD: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec29-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
};
const INSTANT = Date.UTC(2026, 9, 3, 10, 0, 0);
const SANS_BASE = new Proxy(
  {},
  {
    get: () => {
      throw new Error('base touchée');
    },
  }
) as unknown as PrismaClient;

function productionConsole() {
  const avertissements: string[] = [];
  const d = {
    env: ENV_PROD,
    prisma: SANS_BASE,
    horloge: horlogeFigee(INSTANT),
    journal: { warn: (m: string) => avertissements.push(m) },
  };
  return { code: portsDuCodeConsole(d), avertissements };
}

describe('REQ-SEC-062 — la console a ses propres compteurs, nommés à l’épuisement', () => {
  beforeEach(() => {
    vi.mocked(limiter).mockClear();
  });

  it('REQ-SEC-062 : TÉMOIN — le code de la console compte sous SES clés, jamais celles de l’espace', async () => {
    const { code } = productionConsole();
    await code.compterAdresseCode('0123456789abcdef', INSTANT);
    await code.compterCourrielCode('a1'.repeat(32), INSTANT);
    expect(vi.mocked(limiter).mock.calls).toEqual([
      ['magic:console-code-ip', sujetDepuisEmpreinte('0123456789abcdef'), INSTANT],
      ['magic:console-code-courriel', sujetDepuisEmpreinte('a1'.repeat(32)), INSTANT],
    ]);
  });

  it('REQ-SEC-062 : TÉMOIN À DEUX FACES — un compteur ÉPUISÉ est signalé sous sa CLÉ ; un compteur admis ne signale rien', async () => {
    const { code, avertissements } = productionConsole();
    const admis: VerdictDeLimite = {
      autorise: true,
      restant: 1,
      repriseAt: null,
      panne: false,
      motif: 'admis',
    };
    const epuise: VerdictDeLimite = {
      autorise: false,
      restant: 0,
      repriseAt: INSTANT + 60_000,
      panne: false,
      motif: 'limite_atteinte',
    };
    vi.mocked(limiter).mockResolvedValueOnce(admis);
    await code.compterAdresseCode('0123456789abcdef', INSTANT);
    expect(avertissements).toEqual([]);
    vi.mocked(limiter).mockResolvedValueOnce(epuise);
    await code.compterCourrielCode('a1'.repeat(32), INSTANT);
    expect(avertissements).toEqual(['compteur_epuise:console-code-courriel']);
    expect(avertissements.join()).not.toContain('a1a1');
  });

  it('REQ-SEC-062 : les quatre compteurs de la console sont au registre, plus stricts que ceux de l’espace', () => {
    const c = (n: keyof typeof COMPTEURS) => ({
      ...COMPTEURS[n],
      limite: Number(COMPTEURS[n].limite),
    });
    expect(c('magic:console-demande-ip').limite).toBeLessThanOrEqual(c('magic:ip').limite);
    expect(c('magic:console-demande-courriel').limite).toBeLessThan(c('magic:courriel').limite);
    expect(c('magic:console-code-ip').limite).toBeLessThan(c('magic:code-ip').limite);
    expect(c('magic:console-code-courriel').limite).toBeLessThan(c('magic:code-courriel').limite);
    for (const n of [
      'magic:console-demande-ip',
      'magic:console-demande-courriel',
      'magic:console-code-ip',
      'magic:console-code-courriel',
    ] as const) {
      expect(c(n).surPanne, n).toBe('refuser');
      expect(c(n).source, n).toBe('REQ-SEC-062');
    }
  });

  it('REQ-UX-048 : le courriel de la console part sous son gabarit, avec son sujet et sa phrase, l’URL puis le code', () => {
    const corps = corpsDuCourrielConsole(
      'https://partners.example.org/console/connexion/x',
      '042137'
    );
    expect(corps.startsWith(CONNEXION_CONSOLE.courriel.corps)).toBe(true);
    expect(corps).toContain('\n\nhttps://partners.example.org/console/connexion/x\n\n');
    expect(corps).toMatch(/\n042137\n/);
  });
});

// ── le groupe hors de la garde des rôles : la connexion, et elle seule ─────────────────────────

describe('REQ-SEC-003 — le groupe (connexion-console) ne porte que la connexion', () => {
  const RACINE_DU_GROUPE = 'src/app/(connexion-console)';
  const FICHIERS_ADMIS = [
    'layout.tsx',
    'console/connexion/actions.ts',
    'console/connexion/destination.ts',
    'console/connexion/ecran.tsx',
    'console/connexion/page.tsx',
    'console/connexion/[jeton]/page.tsx',
  ];
  /** Les seuls modules qu'un fichier du groupe peut importer : ni la console gardée, ni une lecture métier. */
  const IMPORT_ADMIS =
    /^(?:\.\/[^/]+$|\.\.\/(?:actions|ecran)$|react$|next\/|(?:\.\.\/)+(?:server\/auth\/|server\/securite\/(?:pii|pot-de-miel)$|content\/micro-copy\/))/;

  function fichiersDe(dossier: string, prefixe = ''): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fichiersDe(`${dossier}/${e.name}`, `${prefixe}${e.name}/`)
        : [`${prefixe}${e.name}`]
    );
  }
  const importsDe = (source: string) =>
    [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);

  it('REQ-SEC-003 : TÉMOIN — le groupe ne contient que les fichiers de la connexion, et n’importe ni la console gardée ni une lecture métier', () => {
    expect(fichiersDe(RACINE_DU_GROUPE).sort()).toEqual([...FICHIERS_ADMIS].sort());
    for (const f of FICHIERS_ADMIS) {
      const imports = importsDe(readFileSync(`${RACINE_DU_GROUPE}/${f}`, 'utf8'));
      for (const i of imports) expect(i, `${f} importe ${i}`).toMatch(IMPORT_ADMIS);
      expect(imports.join(), f).not.toMatch(/server\/console|server\/roles|prisma/);
    }
  });

  it('REQ-SEC-003 : CONTRE-TÉMOINS — la règle rougit sur un import de la console gardée ou d’une lecture métier', () => {
    for (const faute of [
      '../../../../server/console/session',
      '../../../../server/apporteurs/lecture',
      '@prisma/client',
    ])
      expect(faute).not.toMatch(IMPORT_ADMIS);
    expect('../../../../server/auth/lien-magique').toMatch(IMPORT_ADMIS);
  });
});

describe('REQ-UX-048 — la page /console/connexion lit l’état et n’accepte que les listes fermées', () => {
  const page = async (q: Record<string, string>) =>
    renderToStaticMarkup(await PageConnexionConsole({ searchParams: Promise.resolve(q) }));

  it('REQ-UX-048 : TÉMOIN — la demande, le code après l’envoi, le refus en alerte, l’issue « déjà utilisé » ; une valeur inconnue ne dit rien', async () => {
    const vide = ETATS_VIDES_CONSOLE['connexion-console']!;
    expect(await page({})).toContain(`<h1>${vide.titre}</h1>`);
    expect(await page({ etat: 'envoye' })).toContain(CONNEXION_CONSOLE.envoye.titre);
    expect(await page({ code: 'code_refuse' })).toContain(CONNEXION_CONSOLE.code.refus);
    expect(await page({ issue: 'deja_utilise' })).toContain(CONNEXION_CONSOLE.dejaUtilise.titre);
    const inconnue = await page({ code: '<script>', issue: 'ouverte' });
    expect(inconnue).not.toContain(CONNEXION_CONSOLE.code.refus);
    expect(inconnue).toContain(`<h1>${vide.titre}</h1>`);
  });

  it('REQ-SEC-003 : TÉMOIN — la suite n’est portée que si elle passe la borne de la console', async () => {
    expect(await page({ suite: '/console/apporteurs' })).toContain(
      'name="suite" value="/console/apporteurs"'
    );
    expect(await page({ suite: '//exemple.invalid' })).not.toContain('name="suite"');
    expect(await page({ suite: '/mes-entreprises' })).not.toContain('name="suite"');
  });
});

describe('REQ-UX-048 — la clé de la console n’est pas une notification de l’apporteur (forme d’A02)', () => {
  it('REQ-UX-048 : TÉMOIN À DEUX FACES — l’envoi des notifications de l’apporteur refuse la clé de la console comme inconnue ; la clé de l’espace passe', () => {
    expect(() => rendreLaNotification('lien_magique_console', {})).toThrow(
      'notification_refusee : cle_inconnue (lien_magique_console)'
    );
    expect(rendreLaNotification('lien_magique', {}).appel).toBe('Ouvrir mon espace');
    expect(estGabaritDeLApporteur('lien_magique_console')).toBe(false);
    expect(estGabaritDeLApporteur('lien_magique')).toBe(true);
  });
});

describe('REQ-UX-047 — le geste principal : le code reçu, puis « Se connecter »', () => {
  const rien = async (): Promise<void> => undefined;
  /** Les éléments qu'on touche : champs visibles et boutons ; les champs cachés n'en sont pas. */
  const interactions = (h: string) =>
    [...h.matchAll(/<(input|button|select|textarea)\b[^>]*>/g)].filter(
      (m) => !/type="hidden"/.test(m[0]) && !/tabindex="-1"|tabIndex="-1"/.test(m[0])
    ).length;

  it('REQ-UX-047 REQ-UX-015 : TÉMOIN — le formulaire du code ne demande que DEUX interactions (le champ et « Se connecter ») ; la demande, deux aussi (l’adresse et « Recevoir mon lien »)', () => {
    const code = renderToStaticMarkup(
      createElement(EcranCodeConsole, { refus: null, verifier: rien, changer: rien, suite: null })
    );
    const formulaireDuCode = code.slice(0, code.indexOf('</form>'));
    expect(interactions(formulaireDuCode)).toBe(2);
    const demande = renderToStaticMarkup(
      createElement(EcranConnexionConsole, { etat: null, action: rien })
    );
    expect(interactions(demande)).toBe(2);
  });
});
