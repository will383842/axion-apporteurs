// @req REQ-DM-009
// @req REQ-DM-010
/**
 * SEC-12 — la limite de débit du dépôt : TECHNIQUE, identique pour tous, sans compte par apporteur
 * (REQ-DM-009, texte de la juriste du rattrapage 84).
 *
 * CE QU'IL PROUVE :
 *   1. DIX DÉPÔTS À LA MAIN, à intervalle humain, passent tous ;
 *   2. AU-DELÀ DU DÉBIT, la réponse demande de réessayer, avec l'heure de reprise, et RIEN n'est écrit :
 *      le client de base n'est même pas touché ;
 *   3. le seul compteur consommé est celui de l'empreinte réseau — jamais un compteur par identité :
 *      aucun dépôt d'un apporteur n'est compté ;
 *   4. LE CAPTCHA (REQ-DM-010) se décide sur un signal TECHNIQUE : le port ne reçoit que l'empreinte
 *      réseau et la réponse au défi, jamais l'apporteur ; présenté, il ne laisse aucune trace ; résolu,
 *      il ne refuse rien.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  COMPTEURS,
  magasinDepuis,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
} from '../../../src/server/securite/rate-limit';
import { clesPii, empreinteAdresseReseau } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import {
  controlerLeDebit,
  deposer,
  type DemandeDeDepot,
  type PortsDuDepot,
} from '../../../src/server/depot/deposer';

/** Le magasin que `limiter` reçoit : SEUL élément substitué, à la frontière du registre. */
const frontiere = vi.hoisted(() => ({ magasin: undefined as unknown }));
vi.mock('../../../src/server/securite/rate-limit', async (original) => {
  const m = await original<typeof import('../../../src/server/securite/rate-limit')>();
  return {
    ...m,
    limiter: (...args: Parameters<typeof m.limiter>) =>
      m.limiter(
        args[0],
        args[1],
        args[2],
        frontiere.magasin as MagasinDeCompteurs,
        () => undefined
      ),
  };
});

const IP = '0123456789abcdef';
const ADRESSE = '203.0.113.7';
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-12-debit-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});
/** L'empreinte que le dépôt calcule lui-même depuis l'adresse : le port ne voit qu'elle. */
const EMPREINTE = empreinteAdresseReseau(ADRESSE, CLES);
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
const MINUTE = 60_000;

function magasinEnMemoire(): { magasin: MagasinDeCompteurs; cles: string[] } {
  const cles: string[] = [];
  const journaux = new Map<string, number[]>();
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite) => {
    cles.push(cle);
    const vivants = (journaux.get(cle) ?? []).filter((s) => s > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push(maintenantMs);
    journaux.set(cle, vivants);
    return { admis, compte: vivants.length, plusAncienMs: vivants[0] ?? null };
  };
  const magasin = magasinDepuis(consommer);
  frontiere.magasin = magasin;
  return { magasin, cles };
}

const LIMITE = (): number => {
  const { limite } = COMPTEURS['depot:ip'];
  if (typeof limite !== 'number') throw new Error('depot:ip : limite hors dépôt');
  return limite;
};

describe('REQ-DM-009 — une limite technique, jamais un compte par apporteur', () => {
  it('REQ-DM-009 : dix dépôts à la main, une minute d’écart, passent tous', async () => {
    magasinEnMemoire();
    for (let i = 0; i < 10; i += 1) {
      expect(await controlerLeDebit(IP, T0 + i * MINUTE)).toEqual({
        autorise: true,
        repriseAt: null,
      });
    }
  });

  it('REQ-DM-009 : au-delà du débit, en rafale : « réessayer », avec l’heure de reprise', async () => {
    magasinEnMemoire();
    for (let i = 0; i < LIMITE(); i += 1) {
      expect((await controlerLeDebit(IP, T0 + i)).autorise).toBe(true);
    }
    const refuse = await controlerLeDebit(IP, T0 + LIMITE());
    expect(refuse.autorise).toBe(false);
    expect(refuse.repriseAt).toBeGreaterThan(T0 + LIMITE());
  });

  it('REQ-DM-009 : le seul compteur consommé est celui de l’empreinte réseau ; aucun compteur par identité', async () => {
    const { cles } = magasinEnMemoire();
    await controlerLeDebit(IP, T0);
    expect(cles).toEqual([`depot:ip:${IP}`]);
  });

  it('REQ-DM-009 : face ROUGE — au-delà du débit, le dépôt répond « réessayer » sans toucher la base', async () => {
    const prismaInterdit = new Proxy(
      {},
      {
        get(_c, propriete) {
          throw new Error(`base touchée : ${String(propriete)}`);
        },
      }
    ) as PrismaClient;
    const ports = {
      cles: CLES,
      debit: async () => ({ autorise: false, repriseAt: T0 + MINUTE }),
    } as unknown as PortsDuDepot;
    const demande = { adresseReseau: ADRESSE } as unknown as DemandeDeDepot;
    expect(await deposer(prismaInterdit, demande, ports)).toEqual({
      reessayer: true,
      repriseAt: T0 + MINUTE,
    });
  });
});

describe('REQ-DM-010 — le captcha, sur un signal technique seulement', () => {
  const prismaInterdit = new Proxy(
    {},
    {
      get(_c, propriete) {
        throw new Error(`base touchée : ${String(propriete)}`);
      },
    }
  ) as PrismaClient;

  it('REQ-DM-010 : à présenter → issue `captcha`, rien n’est écrit ; le port ne reçoit ni l’apporteur ni ses dépôts', async () => {
    const appels: unknown[][] = [];
    const ports = {
      cles: CLES,
      debit: async () => ({ autorise: true, repriseAt: null }),
      captcha: async (...args: unknown[]) => {
        appels.push(args);
        return 'a_presenter' as const;
      },
    } as unknown as PortsDuDepot;
    const demande = {
      apporteurId: '33333333-3333-4333-8333-333333333333',
      adresseReseau: ADRESSE,
      reponseCaptcha: null,
    } as unknown as DemandeDeDepot;
    expect(await deposer(prismaInterdit, demande, ports)).toEqual({
      issue: 'captcha',
      attributionId: null,
    });
    expect(appels).toEqual([[EMPREINTE, null]]);
  });

  it('REQ-DM-010 : la réponse au défi est transmise telle quelle au port, et lui seul la juge', async () => {
    const appels: unknown[][] = [];
    const ports = {
      cles: CLES,
      debit: async () => ({ autorise: true, repriseAt: null }),
      captcha: async (...args: unknown[]) => {
        appels.push(args);
        return 'a_presenter' as const;
      },
    } as unknown as PortsDuDepot;
    await deposer(
      prismaInterdit,
      { adresseReseau: ADRESSE, reponseCaptcha: 'reponse-du-defi' } as unknown as DemandeDeDepot,
      ports
    );
    expect(appels).toEqual([[EMPREINTE, 'reponse-du-defi']]);
  });
});
