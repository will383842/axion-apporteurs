// @req REQ-DM-009
// @req REQ-DM-010
// @req REQ-SEC-016
/**
 * SEC-12 — la limite de débit du dépôt : TECHNIQUE, identique pour tous, sans compte par apporteur
 * (REQ-DM-009, texte de la juriste du rattrapage 84).
 *
 * CE QU'IL PROUVE (arbitrage de la coordination du 2026-10-04, sécurité et juriste) :
 *   1. DIX DÉPÔTS À LA MAIN, à quinze secondes d'intervalle, passent TOUS — une tentative en erreur
 *      corrigée dans la foulée comprise ;
 *   2. DEUX compteurs, `depot:ip` et `depot:session`, sur une fenêtre DE L'ORDRE DE LA MINUTE, leurs
 *      valeurs lues dans la SSOT ; au-delà de l'un OU de l'autre, la réponse demande de réessayer,
 *      avec l'heure de reprise, et RIEN n'est écrit : le client de base n'est même pas touché ;
 *   3. le compteur de session borne UN déposant qui change d'adresse ; deux déposants derrière la
 *      même adresse ne se gênent pas sous le plafond réseau ; aucun compteur n'est clé sur
 *      l'apporteur — la session est une EMPREINTE (cookie de l'espace, ou jeton du lien privé) ; elle
 *      est OBLIGATOIRE : un dépôt sans session ni jeton est refusé, jamais jugé sur la seule adresse ;
 *   4. LE CAPTCHA (REQ-DM-010) se décide sur un signal TECHNIQUE : le port ne reçoit que l'empreinte
 *      réseau et la réponse au défi, jamais l'apporteur ; présenté, il ne laisse aucune trace ; résolu,
 *      il ne refuse rien ;
 *   5. REQ-SEC-016 : les deux compteurs du dépôt sont confrontés au TEXTE EN VIGUEUR de l'exigence,
 *      jamais à une note [REMPLACÉ …] qui cite l'ancien texte (dette nommée par la sécurité) : la
 *      lecture de la garde `rate-famille` est la même, notes retirées.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exigenceDuCompteur, SENTINELLES_FERMEES } from '../../../scripts/gates/rate-famille';
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
  SessionDeDepotAbsente,
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
    expect(SEUILS.DEPOT_FENETRE_MINUTES.valeur).toBe(1);
    const fenetre = SEUILS.DEPOT_FENETRE_MINUTES.valeur * 60;
    expect(COMPTEURS['depot:ip']).toMatchObject({
      prefixe: 'depot:',
      limite: SEUILS.DEPOT_PAR_IP_PAR_FENETRE.valeur,
      fenetreSecondes: fenetre,
    });
    expect(COMPTEURS['depot:session']).toMatchObject({
      prefixe: 'depot:',
      limite: SEUILS.DEPOT_PAR_SESSION_PAR_FENETRE.valeur,
      fenetreSecondes: fenetre,
    });
    expect(SEUILS.DEPOT_PAR_SESSION_PAR_FENETRE.valeur).toBe(5);
    expect(SEUILS.DEPOT_PAR_IP_PAR_FENETRE.valeur).toBe(10);
    expect(COMPTEURS['depot:ip'].surPanne).toBe('refuser');
    expect(COMPTEURS['depot:session'].surPanne).toBe('refuser');
  });

  it('REQ-DM-009 : dix dépôts à la main, quinze secondes d’écart, passent TOUS — une erreur corrigée dans la foulée comprise', async () => {
    magasinEnMemoire();
    const instants = Array.from({ length: 10 }, (_, i) => T0 + i * 15_000);
    // La troisième tentative est refusée à la saisie, puis corrigée et renvoyée deux secondes après.
    instants.splice(3, 0, T0 + 2 * 15_000 + 2_000);
    for (const t of instants) {
      expect(await controlerLeDebit({ ip: IP, session: SESSION }, t)).toEqual({
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

  it('REQ-DM-009 : sans adresse réseau, la session seule est comptée', async () => {
    const { cles } = magasinEnMemoire();
    await controlerLeDebit({ ip: null, session: SESSION }, T0);
    expect(cles).toEqual([`depot:session:${SESSION}`]);
  });

  it('REQ-DM-009 : face ROUGE — un dépôt sans session ni jeton est refusé, sans débit ni base : jamais jugé sur la seule adresse', async () => {
    const prismaInterdit = new Proxy(
      {},
      {
        get(_c, propriete) {
          throw new Error(`base touchée : ${String(propriete)}`);
        },
      }
    ) as PrismaClient;
    const appels: unknown[] = [];
    const ports = {
      cles: CLES,
      debit: async (sujets: unknown) => {
        appels.push(sujets);
        return { autorise: true, repriseAt: null };
      },
      captcha: async () => 'non_requis' as const,
    } as unknown as PortsDuDepot;
    for (const demande of [
      { canal: 'espace', session: null, jetonDepotId: null, adresseReseau: ADRESSE },
      {
        canal: 'lien_prive',
        session: 'cookie-de-session',
        jetonDepotId: null,
        adresseReseau: ADRESSE,
      },
    ]) {
      await expect(
        deposer(prismaInterdit, demande as unknown as DemandeDeDepot, ports)
      ).rejects.toBeInstanceOf(SessionDeDepotAbsente);
    }
    expect(appels).toEqual([]);
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
    await deposer(Object.create(null) as PrismaClient, demande, ports);
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
      canal: 'espace',
      session: 'cookie-de-session',
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
      {
        canal: 'espace',
        session: 'cookie-de-session',
        adresseReseau: ADRESSE,
        reponseCaptcha: 'reponse-du-defi',
      } as unknown as DemandeDeDepot,
      ports
    );
    expect(appels).toEqual([[EMPREINTE, 'reponse-du-defi']]);
  });
});

/** Le texte d'une exigence, lu dans le registre — jamais recopié ici. */
function texteDe(id: string): string {
  const registre = JSON.parse(
    readFileSync(join(__dirname, '../../../docs/requirements.json'), 'utf8')
  ) as { exigences: { id: string; texte: string }[] };
  const req = registre.exigences.find((r) => r.id === id);
  if (req === undefined) throw new Error(`${id} introuvable dans docs/requirements.json`);
  return req.texte;
}

/** Le texte en vigueur : chaque note entre crochets (le texte REMPLACÉ qu'elle cite) retirée. */
const sansNotes = (texte: string): string => texte.replace(/\[[^\]]*\]/g, '');

/**
 * Vrai si la garde lit le compteur dans le texte EN VIGUEUR : l'ancre s'y trouve, et la lecture de
 * `exigenceDuCompteur` est la même, notes retirées. Une ancre qui ne vit que dans une note, ou dont la
 * conduite n'est trouvée que dans la note, rend faux.
 */
function luHorsDesNotes(texte: string, ancre: string): boolean {
  const lue = exigenceDuCompteur(texte, ancre);
  const enVigueur = exigenceDuCompteur(sansNotes(texte), ancre);
  return enVigueur !== null && JSON.stringify(lue) === JSON.stringify(enVigueur);
}

describe('REQ-SEC-016 — les compteurs du dépôt sont lus dans le texte en vigueur, jamais dans une note [REMPLACÉ …]', () => {
  const compteursDuDepot = Object.entries(COMPTEURS).filter(
    ([nom, c]) =>
      c.prefixe === 'depot:' &&
      c.source === 'REQ-SEC-016' &&
      !(SENTINELLES_FERMEES as readonly string[]).includes(nom)
  );

  it('REQ-SEC-016 : les deux compteurs du dépôt, `depot:ip` et `depot:session`, sont confrontés à REQ-SEC-016', () => {
    expect(compteursDuDepot.map(([nom]) => nom).sort()).toEqual(['depot:ip', 'depot:session']);
  });

  it('REQ-SEC-016 : TÉMOIN — chaque ancre du dépôt est lue dans le texte en vigueur, la même lecture que notes retirées', () => {
    const texte = texteDe('REQ-SEC-016');
    for (const [nom, c] of compteursDuDepot) {
      expect(luHorsDesNotes(texte, c.ancre), `${nom} (ancre « ${c.ancre} »)`).toBe(true);
    }
  });

  it('REQ-SEC-016 : FACE ROUGE — une ancre qui ne vit que dans une note [REMPLACÉ …] n’est pas lue hors des notes', () => {
    const texte =
      'Le dépôt est limité par un compteur de SESSION (`surPanne: refuser`). ' +
      '[Amendée : remplace « limité à 20 / 10 min par hash IP (`surPanne: laisser-passer`) ».]';
    expect(exigenceDuCompteur(texte, 'par hash IP')).not.toBeNull();
    expect(luHorsDesNotes(texte, 'par hash IP')).toBe(false);
    expect(luHorsDesNotes(texte, 'compteur de SESSION')).toBe(true);
  });
});
