// @req REQ-DM-009
// @req REQ-DM-010
/**
 * SEC-12 — la limite de débit du dépôt : TECHNIQUE, identique pour tous, sans compte par apporteur
 * (REQ-DM-009, texte de la juriste du rattrapage 84).
 *
 * CE QU'IL PROUVE (arbitrage de la coordination du 2026-10-04, sécurité et juriste) :
 *   1. DIX DÉPÔTS À LA MAIN, à intervalle humain, passent tous ;
 *   2. DEUX compteurs, `depot:ip` et `depot:session`, sur une fenêtre DE L'ORDRE DE LA MINUTE, leurs
 *      valeurs lues dans la SSOT ; au-delà de l'un OU de l'autre, la réponse demande de réessayer,
 *      avec l'heure de reprise, et RIEN n'est écrit : le client de base n'est même pas touché ;
 *   3. le compteur de session borne UN déposant qui change d'adresse ; deux déposants derrière la
 *      même adresse ne se gênent pas sous le plafond réseau ; aucun compteur n'est clé sur
 *      l'apporteur — la session est une EMPREINTE (cookie de l'espace, ou jeton du lien privé) ;
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
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import {
  controlerLeDebit,
  deposer,
  empreinteDeSession,
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
const IP_2 = 'fedcba9876543210';
const SESSION = 'aaaaaaaaaaaaaaaa';
const SESSION_2 = 'bbbbbbbbbbbbbbbb';
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

/** Le plafond déclaré d'un compteur du dépôt, tel que le registre le porte. */
function plafond(nom: 'depot:ip' | 'depot:session'): number {
  const { limite } = COMPTEURS[nom];
  if (typeof limite !== 'number') throw new Error(`${nom} : limite hors dépôt`);
  return limite;
}

describe('REQ-DM-009 — une limite technique, jamais un compte par apporteur', () => {
  it('REQ-DM-009 : deux compteurs, réseau et session, sur une fenêtre de l’ordre de la minute, lus dans la SSOT', () => {
    const fenetre = SEUILS.DEPOT_DEBIT_FENETRE_SECONDES.valeur;
    expect(fenetre).toBe(60);
    expect(COMPTEURS['depot:ip']).toMatchObject({
      prefixe: 'depot:',
      limite: SEUILS.DEPOT_DEBIT_IP_PAR_FENETRE.valeur,
      fenetreSecondes: fenetre,
    });
    expect(COMPTEURS['depot:session']).toMatchObject({
      prefixe: 'depot:',
      limite: SEUILS.DEPOT_DEBIT_SESSION_PAR_FENETRE.valeur,
      fenetreSecondes: fenetre,
    });
    expect(COMPTEURS['depot:ip'].surPanne).toBe(COMPTEURS['depot:session'].surPanne);
  });

  it('REQ-DM-009 : dix dépôts à la main, une minute d’écart, passent tous', async () => {
    magasinEnMemoire();
    for (let i = 0; i < 10; i += 1) {
      expect(await controlerLeDebit({ ip: IP, session: SESSION }, T0 + i * MINUTE)).toEqual({
        autorise: true,
        repriseAt: null,
      });
    }
  });

  it('REQ-DM-009 : au-delà du débit, en rafale : « réessayer », avec l’heure de reprise', async () => {
    magasinEnMemoire();
    const sujets = { ip: IP, session: SESSION };
    const n = Math.min(plafond('depot:ip'), plafond('depot:session'));
    for (let i = 0; i < n; i += 1) {
      expect((await controlerLeDebit(sujets, T0 + i)).autorise).toBe(true);
    }
    const refuse = await controlerLeDebit(sujets, T0 + n);
    expect(refuse.autorise).toBe(false);
    expect(refuse.repriseAt).toBeGreaterThan(T0 + n);
  });

  it('REQ-DM-009 : le compteur de session borne un même déposant qui change d’adresse', async () => {
    magasinEnMemoire();
    const ips = Array.from({ length: plafond('depot:session') + 1 }, (_, i) =>
      i.toString(16).padStart(16, '0')
    );
    const verdicts = [];
    for (const [i, ip] of ips.entries()) {
      verdicts.push((await controlerLeDebit({ ip, session: SESSION }, T0 + i)).autorise);
    }
    expect(verdicts.slice(0, -1).every(Boolean)).toBe(true);
    expect(verdicts.at(-1)).toBe(false);
  });

  it('REQ-DM-009 : deux déposants derrière la même adresse ne se gênent pas sous le plafond réseau', async () => {
    magasinEnMemoire();
    const parSession = Math.floor(plafond('depot:ip') / 2);
    expect(parSession).toBeGreaterThan(0);
    for (let i = 0; i < parSession; i += 1) {
      expect((await controlerLeDebit({ ip: IP, session: SESSION }, T0 + 2 * i)).autorise).toBe(
        true
      );
      expect(
        (await controlerLeDebit({ ip: IP, session: SESSION_2 }, T0 + 2 * i + 1)).autorise
      ).toBe(true);
    }
  });

  it('REQ-DM-009 : le plafond réseau joue seul : des sessions toutes neuves derrière une adresse finissent par réessayer', async () => {
    magasinEnMemoire();
    const verdicts = [];
    for (let i = 0; i <= plafond('depot:ip'); i += 1) {
      const session = (0xc000 + i).toString(16).padStart(16, '0');
      verdicts.push((await controlerLeDebit({ ip: IP_2, session }, T0 + i)).autorise);
    }
    expect(verdicts.slice(0, -1).every(Boolean)).toBe(true);
    expect(verdicts.at(-1)).toBe(false);
  });

  it('REQ-DM-009 : les compteurs consommés sont l’empreinte réseau et l’empreinte de session ; aucun compteur par identité', async () => {
    const { cles } = magasinEnMemoire();
    await controlerLeDebit({ ip: IP, session: SESSION }, T0);
    expect(cles).toEqual([`depot:ip:${IP}`, `depot:session:${SESSION}`]);
  });

  it('REQ-DM-009 : un sujet absent n’est pas compté ; sans aucun sujet, rien n’est consommé', async () => {
    const { cles } = magasinEnMemoire();
    await controlerLeDebit({ ip: null, session: SESSION }, T0);
    await controlerLeDebit({ ip: IP, session: null }, T0 + 1);
    expect(await controlerLeDebit({ ip: null, session: null }, T0 + 2)).toEqual({
      autorise: true,
      repriseAt: null,
    });
    expect(cles).toEqual([`depot:session:${SESSION}`, `depot:ip:${IP}`]);
  });

  it('REQ-DM-009 : la session est une empreinte — le cookie de l’espace, le jeton du lien privé, jamais l’apporteur', () => {
    const espace = { canal: 'espace', session: 'cookie-de-session', jetonDepotId: null };
    const lien = { canal: 'lien_prive', session: null, jetonDepotId: 'jeton-1' };
    const e = empreinteDeSession(espace as unknown as DemandeDeDepot, CLES);
    const l = empreinteDeSession(lien as unknown as DemandeDeDepot, CLES);
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(l).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toBe(l);
    expect(empreinteDeSession(espace as unknown as DemandeDeDepot, CLES)).toBe(e);
    expect(
      empreinteDeSession({ ...espace, apporteurId: 'autre' } as unknown as DemandeDeDepot, CLES)
    ).toBe(e);
    expect(
      empreinteDeSession(
        { ...lien, session: 'cookie-de-session' } as unknown as DemandeDeDepot,
        CLES
      )
    ).toBe(l);
    expect(
      empreinteDeSession({ canal: 'espace', session: null } as unknown as DemandeDeDepot, CLES)
    ).toBeNull();
    expect(
      empreinteDeSession(
        { canal: 'lien_prive', jetonDepotId: null } as unknown as DemandeDeDepot,
        CLES
      )
    ).toBeNull();
  });

  it('REQ-DM-009 : le dépôt passe au débit l’empreinte réseau et l’empreinte de session, jamais l’apporteur', async () => {
    const appels: unknown[] = [];
    const ports = {
      cles: CLES,
      debit: async (sujets: unknown) => {
        appels.push(sujets);
        return { autorise: false, repriseAt: T0 };
      },
    } as unknown as PortsDuDepot;
    const demande = {
      apporteurId: '33333333-3333-4333-8333-333333333333',
      canal: 'espace',
      session: 'cookie-de-session',
      jetonDepotId: null,
      adresseReseau: ADRESSE,
    } as unknown as DemandeDeDepot;
    await deposer({} as PrismaClient, demande, ports);
    expect(appels).toEqual([{ ip: EMPREINTE, session: empreinteDeSession(demande, CLES) }]);
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
    const demande = {
      canal: 'espace',
      session: 'cookie-de-session',
      adresseReseau: null,
    } as unknown as DemandeDeDepot;
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
