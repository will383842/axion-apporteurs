// @req REQ-SEC-002
// @req REQ-SEC-016
/**
 * `lien-magique-compteurs.spec.ts` — les COMPTEURS du câblage de production (SEC-03), jugés par
 * leur effet : `portsDeDemande` tel que l'action serveur le construit, `limiter` du registre tel
 * quel. Seul le MAGASIN change, à la frontière du module du registre : un magasin en mémoire (même
 * algorithme que le script du cache), ou un magasin en panne. Le câblage n'est pas remplacé.
 *
 * CE QU'IL PROUVE (survivants de la relecture de mutation, revue 5324263876) :
 *   — chaque port compte sous SON nom de registre (`magic:ip`, `magic:courriel`), lu dans la clé
 *     écrite au magasin ;
 *   — chaque port refuse à sa limite + 1, lue au registre, et un compteur épuisé n'épuise pas
 *     l'autre ;
 *   — une panne se distingue d'un refus : `panne: true` d'un côté, `panne: false` de l'autre ;
 *   — le champ piège est SIGNALÉ, après la réponse, sans l'adresse ni le courriel ;
 *   — l'empreinte d'adresse réseau d'une requête n'est jamais l'adresse.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { horlogeFigee } from '../../../src/domain/temps/horloge';
import { clesPii, empreinteAdresseReseau } from '../../../src/server/securite/pii';
import {
  COMPTEURS,
  magasinDepuis,
  magasinEnPanne,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
} from '../../../src/server/securite/rate-limit';
import { demanderLien } from '../../../src/server/auth/lien-magique';
import {
  empreinteReseauDeLaRequete,
  portsDeDemande,
  type DependancesDuLien,
} from '../../../src/server/auth/lien-magique-production';

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

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec03-compteurs-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const INSTANT = Date.UTC(2026, 8, 26, 8, 0, 0);

let cles: string[] = [];
function magasinEnMemoire(): MagasinDeCompteurs {
  const journaux = new Map<string, number[]>();
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite) => {
    cles.push(cle);
    const vivants = (journaux.get(cle) ?? []).filter((s) => s > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push(maintenantMs);
    journaux.set(cle, vivants);
    return { admis, compte: vivants.length, plusAncienMs: vivants[0] ?? null };
  };
  return magasinDepuis(consommer);
}

const LIMITE = (nom: 'magic:ip' | 'magic:courriel'): number => {
  const { limite } = COMPTEURS[nom];
  if (typeof limite !== 'number') throw new Error(`${nom} : limite hors dépôt`);
  return limite;
};

function dependances() {
  const planifies: Array<() => Promise<void>> = [];
  const avertissements: string[] = [];
  const d: DependancesDuLien = {
    env: ENV,
    prisma: new Proxy(
      {},
      {
        get: () => {
          throw new Error('base touchée');
        },
      }
    ) as unknown as PrismaClient,
    horloge: horlogeFigee(INSTANT),
    planifier: (travail) => planifies.push(travail),
    envoi: { envoyer: async () => undefined },
    journal: { warn: (m: string) => avertissements.push(m) },
  };
  return { d, planifies, avertissements };
}

const SUJET_A = 'a'.repeat(16);
const SUJET_B = 'b'.repeat(64);

beforeEach(() => {
  cles = [];
  frontiere.magasin = magasinEnMemoire();
});

describe('REQ-SEC-002 — chaque compteur du câblage, sous son nom, à sa limite', () => {
  it('REQ-SEC-002 : compterAdresse compte sous `magic:ip` et refuse à la limite + 1 du registre', async () => {
    const p = portsDeDemande(dependances().d);
    const verdicts = [];
    for (let i = 0; i <= LIMITE('magic:ip'); i += 1)
      verdicts.push(await p.compterAdresse(SUJET_A, INSTANT));
    expect(verdicts.slice(0, LIMITE('magic:ip')).every((v) => v.autorise)).toBe(true);
    expect(verdicts[LIMITE('magic:ip')]).toMatchObject({ autorise: false, panne: false });
    expect(new Set(cles)).toEqual(new Set([`magic:ip:${SUJET_A}`]));
  });

  it('REQ-SEC-002 : compterCourriel compte sous `magic:courriel` et refuse à la limite + 1 du registre', async () => {
    const p = portsDeDemande(dependances().d);
    const verdicts = [];
    for (let i = 0; i <= LIMITE('magic:courriel'); i += 1) {
      verdicts.push(await p.compterCourriel(SUJET_B, INSTANT));
    }
    expect(verdicts.slice(0, LIMITE('magic:courriel')).every((v) => v.autorise)).toBe(true);
    expect(verdicts[LIMITE('magic:courriel')]).toMatchObject({ autorise: false, panne: false });
    expect(new Set(cles)).toEqual(new Set([`magic:courriel:${SUJET_B}`]));
  });

  it('REQ-SEC-002 : un compteur épuisé n’épuise pas l’autre', async () => {
    const p = portsDeDemande(dependances().d);
    for (let i = 0; i <= LIMITE('magic:ip'); i += 1) await p.compterAdresse(SUJET_A, INSTANT);
    expect((await p.compterAdresse(SUJET_A, INSTANT)).autorise).toBe(false);
    expect((await p.compterCourriel(SUJET_A, INSTANT)).autorise).toBe(true);
  });

  it('REQ-SEC-016 : une panne du magasin se distingue d’un refus, pour chacun des deux compteurs', async () => {
    frontiere.magasin = magasinEnPanne();
    const p = portsDeDemande(dependances().d);
    expect(await p.compterAdresse(SUJET_A, INSTANT)).toMatchObject({
      autorise: false,
      panne: true,
    });
    expect(await p.compterCourriel(SUJET_B, INSTANT)).toMatchObject({
      autorise: false,
      panne: true,
    });
  });

  it('REQ-SEC-002 : la demande câblée devient `suspendu` au-delà de la limite par courriel, et pas avant', async () => {
    const { d } = dependances();
    const etats = [];
    for (let i = 0; i <= LIMITE('magic:courriel'); i += 1) {
      etats.push(
        await demanderLien(
          {
            saisie: 'limite@example.org',
            piege: false,
            entetes: new Headers({ 'x-forwarded-for': `192.0.2.${i + 1}` }),
          },
          portsDeDemande(d)
        )
      );
    }
    expect(etats.slice(0, LIMITE('magic:courriel')).every((e) => e === 'envoye')).toBe(true);
    expect(etats[LIMITE('magic:courriel')]).toBe('suspendu');
  });
});

describe('REQ-SEC-002 — le champ piège, câblé', () => {
  let ecrit: string[] = [];
  beforeEach(() => {
    ecrit = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((x: string | Uint8Array) => {
      ecrit.push(String(x));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('REQ-SEC-002 : même réponse ; après elle, un signalement sans adresse ni courriel, et le compte n’est pas lu', async () => {
    const { d, planifies, avertissements } = dependances();
    const etat = await demanderLien(
      {
        saisie: 'robot@example.org',
        piege: true,
        entetes: new Headers({ 'x-forwarded-for': '203.0.113.9' }),
      },
      portsDeDemande(d)
    );
    expect(etat).toBe('envoye');
    expect(ecrit).toEqual([]);
    for (const t of planifies) await t();
    expect(avertissements).toEqual([]);
    const lignes = ecrit.filter((l) => l.includes('pot_de_miel'));
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? '{}')).toMatchObject({
      signal: 'pot_de_miel',
      formulaire: 'connexion',
      adresseHash: empreinteAdresseReseau('203.0.113.9', clesPii(ENV)),
    });
    expect(lignes[0]).not.toContain('203.0.113.9');
    expect(lignes[0]).not.toContain('robot');
  });
});

describe('REQ-SEC-001 — l’empreinte réseau de la requête n’est jamais l’adresse', () => {
  it('REQ-SEC-001 : seize hexadécimaux, ceux de la couche des données personnelles', () => {
    const cles = clesPii(ENV);
    const h = empreinteReseauDeLaRequete(new Headers({ 'x-forwarded-for': '203.0.113.7' }), cles);
    expect(h).toBe(empreinteAdresseReseau('203.0.113.7', cles));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(empreinteReseauDeLaRequete(new Headers(), cles)).toBeNull();
  });
});
