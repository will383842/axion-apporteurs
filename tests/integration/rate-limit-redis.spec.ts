// @req REQ-QA-006
// @req REQ-SEC-016
/**
 * QA-T02 — le script de fenêtre glissante du registre de débit, EXÉCUTÉ par un cache réel.
 *
 * POURQUOI CE FICHIER. Les témoins unitaires du registre jouent une COPIE en mémoire de
 * l'algorithme : le script que le cache exécute n'y tourne jamais. Quatre altérations du script
 * (fenêtre qui ne glisse plus, `<=` au lieu de `<`, expiration retirée, ajout AVANT le test de
 * place) y survivaient toutes. Ici, le script livré tourne dans le conteneur Redis du harnais, sous
 * les options de client de la production, et chaque altération fait rougir un test nommé.
 *
 * CE QU'IL JUGE, SUR LE CACHE LUI-MÊME (lu par `redis-cli` dans le conteneur, pas par le module) :
 *   — sous 50 appels concurrents, EXACTEMENT la limite est admise, et un refus n'écrit rien ;
 *   — l'expiration est posée et bornée par la fenêtre, et aucune autre clé n'apparaît ;
 *   — la fenêtre GLISSE à la milliseconde : refus juste avant la sortie, places juste à la sortie ;
 *   — le glissement est partiel : une place par entrée sortie, et la reprise suit la plus ancienne ;
 *   — le magasin PAR DÉFAUT du registre, sur un cache sain, compte et ne se dit pas en panne.
 *
 * L'adresse du cache entre par `vi.stubEnv` : une valeur POSÉE par le test (celle du conteneur),
 * jamais une lecture de l'environnement du poste — la garde statique du harnais le vérifie.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import {
  COMPTEURS,
  OPTIONS_DU_CLIENT,
  creerMagasinRedis,
  limiter,
  sujetDepuisEmpreinte,
  type MagasinRedis,
  type SignalDePanne,
} from '../../src/server/securite/rate-limit';
import { demarrerCache, type Cache } from './harnais';

// Le registre de SEC-10 est la source des limites et des fenêtres : rien n'est retapé ici (RM-01).
const IP = COMPTEURS['magic:ip'];
const COURRIEL = COMPTEURS['magic:courriel'];
const FENETRE_IP = IP.fenetreSecondes * 1000;
const FENETRE_COURRIEL = COURRIEL.fenetreSecondes * 1000;

/** Une heure fixe : le registre ne lit aucune horloge, l'heure est un paramètre. */
const T0 = 1_700_000_000_000;
const CONCURRENTS = 50;

let cache: Cache;
let magasin: MagasinRedis;
const signaux: SignalDePanne[] = [];
const signaler = (s: SignalDePanne) => {
  signaux.push(s);
};

beforeAll(async () => {
  cache = await demarrerCache();
  magasin = creerMagasinRedis(cache.url, OPTIONS_DU_CLIENT);
}, 180_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  magasin?.fermer();
  await cache?.arreter();
}, 180_000);

beforeEach(async () => {
  expect(await cache.commande(['FLUSHALL'])).toBe('OK');
  signaux.length = 0;
});

const sujet = (c: string) => sujetDepuisEmpreinte(c.repeat(64));
const zcard = async (cle: string) => Number(await cache.commande(['ZCARD', cle]));

describe('REQ-QA-006 — le script de fenêtre glissante, exécuté par un Redis réel', () => {
  it('REQ-QA-006 — sous 50 appels concurrents, EXACTEMENT la limite est admise, un refus n’écrit rien, l’expiration est posée', async () => {
    const s = sujet('a');
    const cle = `magic:ip:${s}`;
    const verdicts = await Promise.all(
      Array.from({ length: CONCURRENTS }, () => limiter('magic:ip', s, T0, magasin, signaler))
    );
    expect(verdicts.filter((v) => v.panne)).toEqual([]);
    expect(signaux).toEqual([]);
    expect(verdicts.filter((v) => v.autorise).length).toBe(IP.limite);
    expect(await zcard(cle)).toBe(IP.limite);
    const pttl = Number(await cache.commande(['PTTL', cle]));
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(FENETRE_IP);
    expect(await cache.commande(['KEYS', '*'])).toBe(cle);
    const refus = verdicts.find((v) => !v.autorise)!;
    expect(refus).toMatchObject({
      motif: 'limite_atteinte',
      restant: 0,
      repriseAt: T0 + FENETRE_IP,
    });
  }, 60_000);

  it('REQ-QA-006 — la fenêtre GLISSE à la milliseconde : refus juste avant la sortie, la limite entière juste à la sortie', async () => {
    const s = sujet('b');
    for (let i = 0; i < IP.limite; i++) await limiter('magic:ip', s, T0, magasin, signaler);
    const avant = await limiter('magic:ip', s, T0 + FENETRE_IP - 1, magasin, signaler);
    expect(avant).toMatchObject({ autorise: false, panne: false });
    const aLaSortie = await Promise.all(
      Array.from({ length: IP.limite + 2 }, () =>
        limiter('magic:ip', s, T0 + FENETRE_IP, magasin, signaler)
      )
    );
    expect(aLaSortie.filter((v) => v.autorise).length).toBe(IP.limite);
    expect(await zcard(`magic:ip:${s}`)).toBe(IP.limite);
    expect(signaux).toEqual([]);
  }, 60_000);

  it('REQ-QA-006 — glissement partiel : une place par entrée sortie, et la reprise suit la plus ancienne', async () => {
    const s = sujet('c');
    const t1 = T0 + 10_000_000;
    for (let i = 0; i < COURRIEL.limite; i++) {
      await limiter('magic:courriel', s, t1 + i * 100, magasin, signaler);
    }
    const suivant = await limiter(
      'magic:courriel',
      s,
      t1 + COURRIEL.limite * 100,
      magasin,
      signaler
    );
    expect(suivant.autorise).toBe(false);
    const a = await limiter('magic:courriel', s, t1 + FENETRE_COURRIEL, magasin, signaler);
    const b = await limiter('magic:courriel', s, t1 + FENETRE_COURRIEL, magasin, signaler);
    expect([a.autorise, b.autorise]).toEqual([true, false]);
    expect(b.repriseAt).toBe(t1 + 100 + FENETRE_COURRIEL);
    expect(signaux).toEqual([]);
  }, 60_000);
});

describe('REQ-SEC-016 — le magasin par défaut du registre, sur un cache sain', () => {
  it('REQ-SEC-016 — sans magasin fourni, limiter écrit dans le cache de REDIS_URL et ne se dit pas en panne', async () => {
    vi.stubEnv('REDIS_URL', cache.url);
    const s = sujet('d');
    const premier = await limiter('magic:ip', s, T0);
    expect(premier).toMatchObject({
      autorise: true,
      panne: false,
      motif: 'admis',
      restant: IP.limite - 1,
    });
    const second = await limiter('magic:ip', s, T0 + 1);
    expect(second).toMatchObject({ panne: false, restant: IP.limite - 2 });
    // Le compte vit DANS le cache : une marque de registre prise pour magasin répondrait en panne
    // et n'écrirait rien.
    expect(await zcard(`magic:ip:${s}`)).toBe(2);
  }, 60_000);
});
