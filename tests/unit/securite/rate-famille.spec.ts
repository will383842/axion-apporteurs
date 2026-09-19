// @req REQ-SEC-002
// @req REQ-SEC-016
// @req REQ-SEC-035
/**
 * SEC-10 — les compteurs de débit, leur garde de famille, le pot de miel observable.
 *
 * CE QUE CHAQUE BLOC JUGE, ET PAR QUEL ACTE.
 *   — REQ-SEC-016 : le registre porte les valeurs des exigences ; chaque compteur, exécuté contre
 *     un cache qui LÈVE, rend sa conduite déclarée et se dit en panne ; une panne réelle (port
 *     fermé, serveur muet, adresse injoignable) rend son verdict sous la seconde, et les options
 *     par défaut du client ne le font pas ; le sujet d'un compteur est une empreinte ; l'adresse
 *     du client se lit depuis la DROITE, en forme canonique, une IPv6 regroupée par /64 ; la garde
 *     rougit sur chacune de ses familles en NOMMANT le préfixe, et le binaire sort en non nul sur
 *     une copie de travail fautive, en 0 sur le dépôt.
 *   — REQ-SEC-002 : les valeurs et la conduite des deux compteurs du lien magique sont LUES dans
 *     le texte de l'exigence et confrontées au registre.
 *   — REQ-SEC-035 : sur un parcours de bac, le chemin piège et le chemin nominal rendent la même
 *     réponse au même instant ; le piège n'écrit aucune ligne, n'accuse rien, et son signalement
 *     ne porte pas la valeur saisie.
 *
 * CE QUI N'EST PAS PROUVÉ ICI. Le script du cache sur un serveur réel (atomicité sous concurrence,
 * aucun marqueur ajouté au refus) : le magasin en mémoire ci-dessous rejoue l'ALGORITHME, pas le
 * script. Sa preuve sur un cache réel appartient à une spécification d'intégration, qui n'existe
 * pas encore : c'est une dette déclarée, pas une couverture.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  COMPTEURS,
  CONDUITES_SUR_PANNE,
  LIMITE_HORS_DEPOT,
  OPTIONS_DU_CLIENT,
  PREFIXES_DE_FAMILLE,
  conduiteSurPanne,
  creerMagasinRedis,
  magasinDepuis,
  magasinEnPanne,
  limiter,
  sujetDepuisEmpreinte,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
  type NomDeCompteur,
  type SignalDePanne,
  type SujetDeCompteur,
  type VerdictDeLimite,
} from '../../../src/server/securite/rate-limit';
import {
  SAUTS_DE_CONFIANCE,
  adresseDuClient,
} from '../../../src/server/securite/adresse-du-client';
import {
  FORMULAIRES_A_POT_DE_MIEL,
  accuserSiLaLigneExiste,
  evaluerPotDeMiel,
  executerAuPlancher,
  signalerPotDeMiel,
  type SignalDePotDeMiel,
} from '../../../src/server/securite/pot-de-miel';
import {
  CONTRE_TEMOINS,
  FAMILLES,
  TEMOINS,
  analyser,
  cacheQuiLeve,
  exigenceDuCompteur,
  fabriquesDuRegistre,
  sourcesDuDisque,
  universDuDepot,
  type Univers,
} from '../../../scripts/gates/rate-famille';

const NOMS = Object.keys(COMPTEURS) as NomDeCompteur[];
const SUJET = sujetDepuisEmpreinte('0123456789abcdef');

// ── Aides ───────────────────────────────────────────────────────────────────────────────────────

/**
 * L'algorithme du script du cache, rejoué en mémoire : POUR LES TESTS seulement. Le magasin est
 * opaque ; la fonction d'écriture et les clés reçues restent entre les mains du test.
 */
function magasinEnMemoire(): {
  magasin: MagasinDeCompteurs;
  cles: string[];
  consommer: ConsommerDuMagasin;
} {
  const journaux = new Map<string, { score: number; membre: string }[]>();
  const cles: string[] = [];
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite, membre) => {
    cles.push(cle);
    const vivants = (journaux.get(cle) ?? []).filter((e) => e.score > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push({ score: maintenantMs, membre });
    journaux.set(cle, vivants);
    const plusAncien = vivants.reduce<number | null>(
      (m, e) => (m === null || e.score < m ? e.score : m),
      null
    );
    return { admis, compte: vivants.length, plusAncienMs: plusAncien };
  };
  return { magasin: magasinDepuis(consommer), cles, consommer };
}

function capteur(): { signaux: SignalDePanne[]; signaler: (s: SignalDePanne) => void } {
  const signaux: SignalDePanne[] = [];
  return { signaux, signaler: (s) => signaux.push(s) };
}

/** Un port où personne n'écoute : on l'ouvre, on lit son numéro, on le referme. */
async function portFerme(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

/** Un serveur qui accepte la connexion et ne répond jamais : le cache vivant mais muet. */
async function serveurMuet(): Promise<{ port: number; fermer: () => Promise<void> }> {
  const sockets: Socket[] = [];
  const s: Server = createServer((c) => sockets.push(c));
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  return {
    port,
    fermer: async () => {
      sockets.forEach((c) => c.destroy());
      await new Promise<void>((r) => s.close(() => r()));
    },
  };
}

const SUSPENDU = Symbol('suspendu');

/** Le verdict, ou `SUSPENDU` s'il n'est pas venu dans le délai. */
async function sousLeDelai<T>(p: Promise<T>, ms: number): Promise<T | typeof SUSPENDU> {
  let minuterie: NodeJS.Timeout | undefined;
  const delai = new Promise<typeof SUSPENDU>((r) => {
    minuterie = setTimeout(() => r(SUSPENDU), ms);
  });
  try {
    return await Promise.race([p, delai]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** L'environnement de la CI et de la production : ni `VITEST`, ni `NODE_ENV=test`. */
function environnementDeProduction(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  return env;
}

/** Le binaire de la garde, lancé dans `racine` : son code et sa sortie. */
function lancerLaGarde(racine: string, ...args: string[]): { code: number | null; sortie: string } {
  const cli = join(realpathSync('node_modules'), 'tsx', 'dist', 'cli.mjs');
  const r = spawnSync(process.execPath, [cli, 'scripts/gates/rate-famille.ts', ...args], {
    cwd: racine,
    encoding: 'utf8',
    // La garde tourne en CI HORS des tests : ni `VITEST`, ni `NODE_ENV=test`. Lancée avec
    // l'environnement de vitest, elle hériterait d'un droit que la CI ne lui donne pas.
    env: environnementDeProduction(),
  });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * Une COPIE DE TRAVAIL jetable : `src/`, la garde, et un lien vers le `node_modules` réel. Le lien
 * est défait SEUL avant l'effacement : l'effacement ne descend jamais dans le `node_modules` réel.
 */
function garderUneCopie(muter: (registre: string) => string): {
  code: number | null;
  sortie: string;
} {
  const racine = mkdtempSync(join(tmpdir(), 'rf-'));
  const lien = join(racine, 'node_modules');
  try {
    cpSync('src', join(racine, 'src'), { recursive: true });
    mkdirSync(join(racine, 'scripts', 'gates'), { recursive: true });
    cpSync('scripts/gates/rate-famille.ts', join(racine, 'scripts/gates/rate-famille.ts'));
    mkdirSync(join(racine, 'docs'), { recursive: true });
    cpSync('docs/requirements.json', join(racine, 'docs/requirements.json'));
    writeFileSync(join(racine, 'package.json'), readFileSync('package.json', 'utf8'));
    const registre = join(racine, 'src/server/securite/rate-limit.ts');
    const avant = readFileSync(registre, 'utf8');
    const apres = muter(avant);
    expect(apres, 'la mutation n’a rien changé : le témoin ne témoigne de rien').not.toBe(avant);
    mkdirSync(dirname(registre), { recursive: true });
    writeFileSync(registre, apres);
    symlinkSync(realpathSync('node_modules'), lien, 'junction');
    return lancerLaGarde(racine);
  } finally {
    try {
      unlinkSync(lien);
    } catch {
      // Le lien n'a pas été posé : rien à défaire.
    }
    rmSync(racine, { recursive: true, force: true });
  }
}

/** Une substitution UNIQUE et effective : sinon le témoin ne témoigne de rien. */
function substituer(texte: string, avant: string, apres: string): string {
  expect(texte.split(avant).length - 1, `« ${avant} » doit figurer une fois`).toBe(1);
  return texte.replace(avant, apres);
}

// ── REQ-SEC-016 : le registre ───────────────────────────────────────────────────────────────────

describe('REQ-SEC-016 — le registre des compteurs', () => {
  it('REQ-SEC-016 — chaque compteur vit sous l’un des cinq préfixes et déclare sa conduite sur panne', () => {
    expect(NOMS.length).toBeGreaterThan(0);
    expect([...PREFIXES_DE_FAMILLE]).toEqual(['magic:', 'depot:', 'verif:', 'webhook:', 'auth:']);
    for (const nom of NOMS) {
      const d = COMPTEURS[nom];
      expect(nom.startsWith(d.prefixe), nom).toBe(true);
      expect(CONDUITES_SUR_PANNE, nom).toContain(d.surPanne);
      expect(d.source, nom).toMatch(/^REQ-[A-Z]+-\d{3}$/);
      // RM-10 : une valeur, une source, une DATE de vérification — lisible, et pas dans le futur.
      expect(d.verifieLe, nom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${d.verifieLe}T00:00:00Z`).toISOString().slice(0, 10), nom).toBe(
        d.verifieLe
      );
      expect(d.verifieLe <= new Date().toISOString().slice(0, 10), nom).toBe(true);
    }
  });

  it('REQ-SEC-016 — le dépôt : 20 / 10 min par empreinte d’adresse en `laisser-passer`, l’identité en `refuser`', () => {
    expect(COMPTEURS['depot:ip']).toMatchObject({
      prefixe: 'depot:',
      limite: 20,
      fenetreSecondes: 600,
      surPanne: 'laisser-passer',
      source: 'REQ-SEC-016',
    });
    expect(COMPTEURS['depot:identite']).toMatchObject({ prefixe: 'depot:', surPanne: 'refuser' });
  });

  it('REQ-SEC-016 — une conduite absente, glissée par un cast, se lit REFUSER à l’exécution', () => {
    expect(conduiteSurPanne({})).toBe('refuser');
    expect(conduiteSurPanne({ surPanne: 'laisser passer' })).toBe('refuser');
    expect(conduiteSurPanne({ surPanne: 'laisser-passer' })).toBe('laisser-passer');
  });
});

// ── REQ-SEC-016 : le verdict, nominal ───────────────────────────────────────────────────────────

describe('REQ-SEC-016 — le verdict d’un compteur sain', () => {
  it('REQ-SEC-016 — la limite est exacte, un refus n’ajoute rien, la fenêtre glisse', async () => {
    const m = magasinEnMemoire();
    const verdicts: VerdictDeLimite[] = [];
    for (let i = 0; i < 6; i++)
      verdicts.push(await limiter('magic:courriel', SUJET, 1_000 + i, m.magasin));
    expect(verdicts.slice(0, 5).map((v) => v.autorise)).toEqual([true, true, true, true, true]);
    expect(verdicts.map((v) => v.restant)).toEqual([4, 3, 2, 1, 0, 0]);
    expect(verdicts[5]).toEqual({
      autorise: false,
      restant: 0,
      repriseAt: 1_000 + 900_000,
      panne: false,
      motif: 'limite_atteinte',
    });
    // Le refus n'a rien ajouté : à la sortie du PREMIER marqueur, une place, et une seule.
    const apres = 1_000 + 900_000;
    expect((await limiter('magic:courriel', SUJET, apres, m.magasin)).autorise).toBe(true);
    expect((await limiter('magic:courriel', SUJET, apres, m.magasin)).autorise).toBe(false);
  });

  it('REQ-SEC-016 — la clé est `${nom}:${empreinte}`, rien d’autre', async () => {
    const m = magasinEnMemoire();
    await limiter('depot:ip', SUJET, 0, m.magasin);
    expect(m.cles).toEqual([`depot:ip:${SUJET}`]);
  });
});

// ── REQ-SEC-016 : la panne ──────────────────────────────────────────────────────────────────────

describe('REQ-SEC-016 — la panne du cache suit la conduite déclarée, et se dit', () => {
  it('REQ-SEC-016 — contre un cache qui LÈVE, chaque compteur rend sa conduite, `panne: true`', async () => {
    const cache = cacheQuiLeve();
    const { signaux, signaler } = capteur();
    const constates: string[] = [];
    for (const nom of NOMS) {
      const v = await limiter(nom, SUJET, 0, cache.magasin, signaler);
      const d = COMPTEURS[nom];
      expect(v.panne, nom).toBe(true);
      expect(v.autorise, nom).toBe(d.surPanne === 'laisser-passer');
      expect(v.motif, nom).toBe(
        d.limite === LIMITE_HORS_DEPOT ? 'limite_non_configuree' : 'cache_indisponible'
      );
      constates.push(nom);
    }
    expect(constates).toEqual(NOMS);
    // Le cache a été ATTEINT par chaque compteur dont la limite est écrite : pas un vert à vide.
    const chiffres = NOMS.filter((n) => COMPTEURS[n].limite !== LIMITE_HORS_DEPOT);
    expect(chiffres.length).toBeGreaterThan(0);
    expect(cache.appels()).toBe(chiffres.length);
    expect(signaux.map((s) => s.prefixe)).toEqual(NOMS.map((n) => COMPTEURS[n].prefixe));
  });

  it('REQ-SEC-016 — le cache tombe AU MILIEU d’une rafale : les admis restent admis, la suite suit la conduite', async () => {
    const sain = magasinEnMemoire();
    let tombe = false;
    const cache = magasinDepuis((...a) =>
      tombe ? Promise.reject(new Error('coupé')) : sain.consommer(...a)
    );
    const avant = await limiter('magic:ip', SUJET, 0, cache, () => undefined);
    tombe = true;
    const pendant = await limiter('magic:ip', SUJET, 1, cache, () => undefined);
    const depot = await limiter('depot:ip', SUJET, 1, cache, () => undefined);
    expect([avant.autorise, avant.panne]).toEqual([true, false]);
    expect([pendant.autorise, pendant.panne, pendant.motif]).toEqual([
      false,
      true,
      'cache_indisponible',
    ]);
    expect([depot.autorise, depot.panne]).toEqual([true, true]);
  });

  it('REQ-SEC-016 — la panne est signalée sur la sortie d’erreur par son PRÉFIXE seul, jamais la clé', async () => {
    const ecrit: string[] = [];
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation((l) => {
      ecrit.push(String(l));
      return true;
    });
    try {
      await limiter('magic:courriel', SUJET, 0, cacheQuiLeve().magasin);
    } finally {
      espion.mockRestore();
    }
    expect(ecrit).toHaveLength(1);
    expect(JSON.parse(ecrit[0]!)).toEqual({
      evenement: 'rate_limit_panne',
      prefixe: 'magic:',
      motif: 'cache_indisponible',
    });
    expect(ecrit[0]).not.toContain(SUJET);
  });

  it('REQ-SEC-016 — `depot:identite` sans configuration : refus, `panne: true`, `limite_non_configuree`, cache non atteint', async () => {
    const cache = cacheQuiLeve();
    const { signaux, signaler } = capteur();
    const v = await limiter('depot:identite', SUJET, 0, cache.magasin, signaler);
    expect(v).toEqual({
      autorise: false,
      restant: 0,
      repriseAt: null,
      panne: true,
      motif: 'limite_non_configuree',
    });
    expect(cache.appels()).toBe(0);
    expect(signaux).toEqual([{ prefixe: 'depot:', motif: 'limite_non_configuree' }]);
  });

  describe('REQ-SEC-016 — une panne réelle est RAPIDE', () => {
    const aFermer: { fermer: () => void }[] = [];
    afterEach(() => {
      aFermer.splice(0).forEach((m) => m.fermer());
    });

    it('REQ-SEC-016 — port fermé : verdict sous la seconde, deux fois de suite, conduite déclarée', async () => {
      const m = creerMagasinRedis(`redis://127.0.0.1:${await portFerme()}`, OPTIONS_DU_CLIENT);
      aFermer.push(m);
      for (const essai of [1, 2]) {
        const debut = performance.now();
        const v = await sousLeDelai(
          limiter('magic:ip', SUJET, 0, m, () => undefined),
          1_000
        );
        expect(v, `essai ${essai} : aucun verdict sous la seconde`).not.toBe(SUSPENDU);
        expect(performance.now() - debut).toBeLessThan(1_000);
        expect(v).toMatchObject({ autorise: false, panne: true, motif: 'cache_indisponible' });
      }
    });

    it('REQ-SEC-016 — hors des tests, une fabrique de magasin REFUSE de fabriquer ; le magasin en panne du registre, lui, se construit', () => {
      const vitest = process.env.VITEST;
      vi.stubEnv('NODE_ENV', 'production');
      Reflect.deleteProperty(process.env, 'VITEST');
      try {
        expect(() =>
          magasinDepuis(async () => ({ admis: true, compte: 0, plusAncienMs: null }))
        ).toThrow(/^fabrique_hors_tests/);
        expect(() => magasinEnPanne()).not.toThrow();
      } finally {
        vi.unstubAllEnvs();
        if (vitest !== undefined) Reflect.set(process.env, 'VITEST', vitest);
      }
    });

    it('REQ-SEC-016 — hors des tests, la fabrique REFUSE aussi quand le registre est atteint par un chemin assemblé à l’exécution', async () => {
      const chemin = ['..', '..', '..', 'src', 'server', 'securite', 'rate' + '-limit'].join('/');
      const mod: Record<string, (...a: unknown[]) => unknown> = await import(
        /* @vite-ignore */ chemin
      );
      const vitest = process.env.VITEST;
      vi.stubEnv('NODE_ENV', 'production');
      Reflect.deleteProperty(process.env, 'VITEST');
      try {
        expect(() =>
          mod['magasin' + 'Depuis']!(async () => ({ admis: true, compte: 0, plusAncienMs: null }))
        ).toThrow(/^fabrique_hors_tests/);
      } finally {
        vi.unstubAllEnvs();
        if (vitest !== undefined) Reflect.set(process.env, 'VITEST', vitest);
      }
    });

    it('REQ-SEC-016 — le magasin réel n’expose QUE `fermer` : aucune clé libre n’atteint le cache hors de `limiter`', async () => {
      const m = creerMagasinRedis(`redis://127.0.0.1:${await portFerme()}`, OPTIONS_DU_CLIENT);
      aFermer.push(m);
      expect(Object.keys(m)).toEqual(['fermer']);
      const brut = m as unknown as Record<string, unknown>;
      expect(brut.consommer, 'consommer(login: + courriel) reste appelable').toBeUndefined();
    });

    it('REQ-SEC-016 — serveur qui accepte et se tait : verdict sous la seconde', async () => {
      const muet = await serveurMuet();
      const m = creerMagasinRedis(`redis://127.0.0.1:${muet.port}`, OPTIONS_DU_CLIENT);
      try {
        const v = await sousLeDelai(
          limiter('depot:ip', SUJET, 0, m, () => undefined),
          1_000
        );
        expect(v, 'le cache muet a SUSPENDU la requête').not.toBe(SUSPENDU);
        expect(v).toMatchObject({ autorise: true, panne: true, motif: 'cache_indisponible' });
      } finally {
        m.fermer();
        await muet.fermer();
      }
    });

    it('REQ-SEC-016 — adresse injoignable (réseau de documentation) : verdict sous la seconde', async () => {
      const m = creerMagasinRedis('redis://192.0.2.1:6379', OPTIONS_DU_CLIENT);
      aFermer.push(m);
      const v = await sousLeDelai(
        limiter('magic:ip', SUJET, 0, m, () => undefined),
        1_000
      );
      expect(v, 'la connexion injoignable a SUSPENDU la requête').not.toBe(SUSPENDU);
      expect(v).toMatchObject({ autorise: false, panne: true, motif: 'cache_indisponible' });
    });

    it('REQ-SEC-016 — CONTRE-TÉMOIN : avec les options par défaut du client, le port fermé SUSPEND la requête', async () => {
      const m = creerMagasinRedis(`redis://127.0.0.1:${await portFerme()}`, {});
      aFermer.push(m);
      const v = await sousLeDelai(
        limiter('magic:ip', SUJET, 0, m, () => undefined),
        1_000
      );
      expect(v, 'le témoin de délai ne distingue plus les options : il ne mesure rien').toBe(
        SUSPENDU
      );
    });
  });

  it('REQ-SEC-016 — `REDIS_URL` absente : panne sous la conduite, jamais un plantage', async () => {
    vi.stubEnv('REDIS_URL', '');
    try {
      const { signaler } = capteur();
      expect(await limiter('magic:ip', SUJET, 0, undefined, signaler)).toMatchObject({
        autorise: false,
        panne: true,
      });
      expect(await limiter('depot:ip', SUJET, 0, undefined, signaler)).toMatchObject({
        autorise: true,
        panne: true,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('REQ-SEC-016 — `REDIS_URL` mal formée : panne sous la conduite, et la valeur (mot de passe compris) ne sort nulle part', async () => {
    const secret = `S3cret${randomBytes(6).toString('hex')}`;
    const url = `redis://u:${secret}@cache.example.org:abc`;
    let erreur: unknown = null;
    try {
      creerMagasinRedis(url, OPTIONS_DU_CLIENT);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(Error);
    const vu = `${String(erreur)} ${JSON.stringify(erreur)} ${String((erreur as Error).cause)}`;
    expect((erreur as Error).message).toMatch(/^redis_url_illisible/);
    expect(vu).not.toContain(secret);
    vi.stubEnv('REDIS_URL', url);
    const ecrit: string[] = [];
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation((l) => {
      ecrit.push(String(l));
      return true;
    });
    try {
      expect(await limiter('magic:ip', SUJET, 0)).toMatchObject({ autorise: false, panne: true });
      expect(await limiter('depot:ip', SUJET, 0)).toMatchObject({ autorise: true, panne: true });
    } finally {
      espion.mockRestore();
      vi.unstubAllEnvs();
    }
    expect(ecrit.join('')).not.toContain(secret);
  });

  it('REQ-SEC-016 — `REDIS_URL` est lue au PREMIER appel, pas à l’import', async () => {
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${await portFerme()}`);
    try {
      const v = await sousLeDelai(
        limiter('magic:ip', SUJET, 0, undefined, () => undefined),
        1_000
      );
      expect(v).toMatchObject({ autorise: false, panne: true, motif: 'cache_indisponible' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ── REQ-SEC-016 : le sujet est une empreinte ────────────────────────────────────────────────────

describe('REQ-SEC-016 — le sujet d’un compteur est une empreinte, jamais une valeur', () => {
  it.each(['a@example.org', '192.0.2.7', '2001:db8::7', '0123456789ABCDEF', '0123456789abcde', ''])(
    'REQ-SEC-016 — « %s » est refusé, et le refus ne recopie pas la valeur',
    (valeur) => {
      let message = '';
      try {
        sujetDepuisEmpreinte(valeur);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/^sujet_non_empreinte/);
      if (valeur !== '') expect(message).not.toContain(valeur);
    }
  );

  it('REQ-SEC-016 — 16 et 64 hexadécimaux minuscules sont admis', () => {
    expect(sujetDepuisEmpreinte('0123456789abcdef')).toBe('0123456789abcdef');
    expect(sujetDepuisEmpreinte('f'.repeat(64))).toBe('f'.repeat(64));
  });

  it('REQ-SEC-016 — un courriel glissé par un cast n’atteint jamais le cache', async () => {
    const m = magasinEnMemoire();
    await expect(
      limiter('magic:courriel', 'a@example.org' as SujetDeCompteur, 0, m.magasin)
    ).rejects.toThrow(/^sujet_non_empreinte/);
    expect(m.cles).toEqual([]);
  });
});

// ── REQ-SEC-016 : l'adresse du client ───────────────────────────────────────────────────────────

describe('REQ-SEC-016 — l’adresse du client se lit depuis la DROITE de X-Forwarded-For', () => {
  const avec = (xff: string | null) => new Headers(xff === null ? {} : { 'x-forwarded-for': xff });

  it('REQ-SEC-016 — un élément forgé à GAUCHE ne choisit pas l’adresse', () => {
    expect(SAUTS_DE_CONFIANCE).toBe(1);
    expect(adresseDuClient(avec('198.51.100.9, 192.0.2.10'), SAUTS_DE_CONFIANCE)).toBe(
      '192.0.2.10'
    );
    expect(adresseDuClient(avec('198.51.100.9, 198.51.100.8, 2001:db8::1'), 1)).toBe(
      '2001:db8::/64'
    );
    expect(adresseDuClient(avec('198.51.100.9, 192.0.2.10, 192.0.2.11'), 2)).toBe('192.0.2.10');
  });

  it('REQ-SEC-016 — forme CANONIQUE : une IPv4 mappée est l’IPv4, la casse et la compression ne changent pas le sujet', () => {
    const lire = (xff: string) => adresseDuClient(avec(xff), 1);
    expect(lire('::ffff:192.0.2.10')).toBe('192.0.2.10');
    expect(lire('::FFFF:C000:020A')).toBe('192.0.2.10');
    expect(lire('0:0:0:0:0:ffff:192.0.2.10')).toBe(lire('192.0.2.10'));
    expect(lire('2001:DB8::1')).toBe(lire('2001:db8:0:0:0:0:0:1'));
    expect(lire('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::/64');
  });

  it('REQ-SEC-016 — une IPv6 est regroupée par /64 : deux adresses du même /64 sont UN sujet', () => {
    const lire = (xff: string) => adresseDuClient(avec(xff), 1);
    expect(lire('2001:db8:0:0:1::1')).toBe(lire('2001:db8::ffff:ffff:ffff:ffff'));
    expect(lire('2001:db8::1')).toBe('2001:db8::/64');
    expect(lire('2001:db8:0:1::1')).toBe('2001:db8:0:1::/64');
    expect(lire('2001:db8:0:1::1')).not.toBe(lire('2001:db8::1'));
    expect(lire('fe80::1%eth0')).toBeNull();
  });

  it('REQ-SEC-016 — X-Real-IP n’est jamais lu', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.9', 'x-forwarded-for': '192.0.2.10' });
    expect(adresseDuClient(h, 1)).toBe('192.0.2.10');
    expect(adresseDuClient(new Headers({ 'x-real-ip': '198.51.100.9' }), 1)).toBeNull();
  });

  it.each([
    ['en-tête absent', null, 1],
    ['en-tête vide', '', 1],
    ['adresse illisible', 'not-an-ip', 1],
    ['chaîne trop courte', '192.0.2.10', 2],
    ['sauts nuls', '192.0.2.10', 0],
    ['sauts négatifs', '192.0.2.10', -1],
    ['sauts fractionnaires', '198.51.100.9, 192.0.2.10', 1.5],
  ] as const)('REQ-SEC-016 — %s ⇒ null, jamais un seau commun', (_cas, xff, sauts) => {
    expect(adresseDuClient(avec(xff), sauts)).toBeNull();
  });
});

// ── REQ-SEC-016 : la garde ──────────────────────────────────────────────────────────────────────

describe('REQ-SEC-016 — la garde de famille', () => {
  const base = universDuDepot();

  it('REQ-SEC-016 — le dépôt est vert, et le vert dit ce qu’il a confronté', async () => {
    const r = await analyser(base);
    expect(r.fautes).toEqual([]);
    expect(r.confrontes).toHaveLength(NOMS.length);
    expect(r.fichiersLus).toBeGreaterThan(0);
  });

  it('REQ-SEC-016 — `magic:courriel` sans `surPanne` (cast) : `conduite_absente`, le préfixe nommé', async () => {
    const t = TEMOINS.find((x) => x.famille === 'conduite_absente')!;
    const r = await analyser(t.univers(base));
    const f = r.fautes.filter((x) => x.famille === 'conduite_absente');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('`magic:`');
    expect(f[0]!.message).toContain('magic:courriel');
  });

  it('REQ-SEC-016 — une implémentation qui laisse tout passer : `conduite_trahie` sur les compteurs du MILIEU', async () => {
    const t = TEMOINS.find((x) => x.famille === 'conduite_trahie')!;
    const r = await analyser(t.univers(base));
    const trahis = r.fautes.filter((x) => x.famille === 'conduite_trahie').map((x) => x.message);
    expect(trahis.some((m) => m.includes('`magic:ip`'))).toBe(true);
    expect(trahis.some((m) => m.includes('`magic:courriel`'))).toBe(true);
    expect(trahis.some((m) => m.includes('`depot:ip`'))).toBe(false);
  });

  it('REQ-SEC-016 — un verdict qui ne se dit pas en panne est une conduite trahie', async () => {
    const u: Univers = {
      ...base,
      executer: async (nom) => ({ ...(await base.executer(nom)), panne: false }),
    };
    const r = await analyser(u);
    expect(r.fautes.filter((x) => x.famille === 'conduite_trahie')).toHaveLength(NOMS.length);
  });

  it.each(TEMOINS.map((t) => [t.famille, t] as const))(
    'REQ-SEC-016 — témoin de `%s` : la famille rougit et nomme sa cible',
    async (famille, t) => {
      const r = await analyser(t.univers(base));
      const siennes = r.fautes.filter((f) => f.famille === famille);
      expect(siennes.length).toBeGreaterThan(0);
      for (const m of t.nomme)
        expect(
          siennes.some((f) => f.message.includes(m)),
          m
        ).toBe(true);
    }
  );

  it('REQ-SEC-016 — chaque famille a son témoin', () => {
    expect(new Set(TEMOINS.map((t) => t.famille))).toEqual(new Set(FAMILLES));
  });

  it.each(CONTRE_TEMOINS.map((c) => [c.libelle, c] as const))(
    'REQ-SEC-016 — CONTRE-TÉMOIN : %s reste vert',
    async (_l, c) => {
      const r = await analyser({ ...base, fichiers: [...base.fichiers, c.fichier] });
      expect(r.fautes).toEqual([]);
    }
  );

  it('REQ-SEC-016 — un appel sur deux lignes est VU, et un import renommé est refusé', async () => {
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers,
        CONTRE_TEMOINS[0]!.fichier,
        {
          chemin: 'src/server/alias.ts',
          texte: "import { limiter as l } from './securite/rate-limit';\nexport const g = l;\n",
        },
      ],
    });
    expect(r.appelsVus).toBe((await analyser(base)).appelsVus + 1);
    expect(r.fautes.map((f) => f.famille)).toEqual(['nom_dynamique']);
  });

  it('REQ-SEC-016 — un `.tsx` est lu comme du TSX : un appel dans le JSX, après une apostrophe, est VU', async () => {
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers,
        {
          chemin: 'src/app/c.tsx',
          texte:
            "import { limiter } from '../server/securite/rate-limit';\n" +
            "export const C = (n: string, s: any) => <p>l'essai {limiter(n, s, 0)}</p>;\n",
        },
      ],
    });
    expect(r.fautes.map((f) => [f.famille, f.message.split(' — ')[0]])).toEqual([
      ['nom_dynamique', 'src/app/c.tsx:2'],
    ]);
  });

  it('REQ-SEC-016 — préfixe hors registre dans un gabarit, et en majuscules', async () => {
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers,
        { chemin: 'src/a.ts', texte: 'export const k = (x: string) => `verif:${x}`;\n' },
        { chemin: 'src/b.tsx', texte: "export const K = () => <i>{'WEBHOOK:x'}</i>;\n" },
      ],
    });
    expect(r.fautes.map((f) => f.message.split(' — ')[0])).toEqual(['src/a.ts:1', 'src/b.tsx:1']);
  });

  it.each([
    [
      '`limiter.call`',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter.call(null, 'magic:ip', s, 0);\n",
    ],
    [
      '`limiter.apply`',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter.apply(null, ['magic:ip', s, 0]);\n",
    ],
    [
      '`(limiter)(…)`',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => (limiter)('magic:ip', s, 0);\n",
    ],
    ["`x['limiter']`", "export const f = (x: any, s: any) => x['limiter']('magic:ip', s, 0);\n"],
    ['`x.limiter`', "export const f = (x: any, s: any) => x.limiter('magic:ip', s, 0);\n"],
    [
      'alias par variable',
      "import { limiter } from './securite/rate-limit';\nexport const f = limiter;\n",
    ],
    [
      'import d’espace de noms',
      "import * as rl from './securite/rate-limit';\nexport const f = rl;\n",
    ],
    [
      '`require` du registre',
      "const rl = require('./securite/rate-limit');\nexport const f = rl;\n",
    ],
    ['ré-export du registre', "export * from './securite/rate-limit';\n"],
    [
      'chargement dynamique à chemin variable (témoin de la lentille securite)',
      "import { COMPTEURS, sujetDepuisEmpreinte } from '../securite/rate-limit';\n" +
        '\n' +
        "const chemin = '../securite/rate-limit';\n" +
        "const appel = 'limiter';\n" +
        "const fabrique = 'magasinDepuis';\n" +
        '\n' +
        'export async function essai(hex: string) {\n' +
        '  const m = await import(chemin);\n' +
        '  const ouvert = m[fabrique](async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n' +
        '  const nom = Object.keys(COMPTEURS)[0];\n' +
        '  return m[appel](nom, sujetDepuisEmpreinte(hex), 0, ouvert);\n' +
        '}\n',
    ],
    [
      '`require` à chemin variable',
      "const chemin = './securite/rate-limit';\nexport const m = require(chemin);\n",
    ],
    [
      'chemin assemblé à l’exécution (témoin de la lentille mutation)',
      'export async function essai(nom: string, s: any) {\n' +
        "  const mod = await import(['.', 'securite', 'rate' + '-limit'].join('/'));\n" +
        "  const ouvert = mod['magasin' + 'Depuis'](async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n" +
        "  return mod['lim' + 'iter'](nom, s, 0, ouvert);\n" +
        '}\n',
    ],
    [
      'import nommé par une chaîne',
      "import { 'limiter' as compter } from './securite/rate-limit';\nexport const f = compter;\n",
    ],
    [
      'ré-export nommé par une chaîne',
      "export { 'limiter' as compter } from './securite/rate-limit';\n",
    ],
    [
      'export local renommé',
      "import { limiter } from './securite/rate-limit';\nexport { limiter as compter };\n",
    ],
  ])(
    'REQ-SEC-016 — référence indirecte à `limiter` (%s) : `nom_dynamique`, échec fermé',
    async (_l, texte) => {
      const r = await analyser({
        ...base,
        fichiers: [...base.fichiers, { chemin: 'src/server/detour.ts', texte }],
      });
      expect(r.fautes.map((f) => f.famille)).toContain('nom_dynamique');
      expect(r.fautes.every((f) => f.message.startsWith('src/server/detour.ts:'))).toBe(true);
    }
  );

  it('REQ-SEC-016 — CONTRE-TÉMOIN : le CHEMIN du registre écrit comme une donnée n’est pas un chargement', async () => {
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers,
        {
          chemin: 'scripts/lot/liste.ts',
          texte: "export const chemins = ['src/server/securite/rate-limit.ts'];\n",
        },
      ],
    });
    expect(r.fautes).toEqual([]);
  });

  it('REQ-SEC-016 — un préfixe de famille AU MILIEU d’une chaîne ou d’un gabarit est vu', async () => {
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers,
        { chemin: 'src/c.ts', texte: 'export const k = (x: string) => `rl:magic:${x}`;\n' },
        { chemin: 'src/d.ts', texte: 'export const k = (x: string) => `rl:${x}:auth:${x}`;\n' },
      ],
    });
    expect(r.fautes.map((f) => [f.famille, f.message.split(' — ')[0]])).toEqual([
      ['prefixe_hors_registre', 'src/c.ts:1'],
      ['prefixe_hors_registre', 'src/d.ts:1'],
    ]);
  });

  it('REQ-SEC-016 — les fabriques de magasin sont DÉRIVÉES des exports du registre : une troisième est vue', async () => {
    const registre = base.fichiers.find((f) => f.chemin === 'src/server/securite/rate-limit.ts')!;
    expect([...fabriquesDuRegistre(registre.texte)].sort()).toEqual([
      'creerMagasinRedis',
      'magasinDepuis',
      'magasinEnPanne',
    ]);
    const avecUneTroisieme =
      registre.texte +
      '\nexport const autreFabrique = (): MagasinDeCompteurs => magasinDepuis(async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n';
    expect(fabriquesDuRegistre(avecUneTroisieme).has('autreFabrique')).toBe(true);
    const r = await analyser({
      ...base,
      fichiers: [
        ...base.fichiers.filter((f) => f !== registre),
        { chemin: registre.chemin, texte: avecUneTroisieme },
        {
          chemin: 'src/server/detour.ts',
          texte:
            "import { autreFabrique } from './securite/rate-limit';\nexport const m = autreFabrique();\n",
        },
      ],
    });
    expect(r.fautes.map((f) => f.famille)).toContain('magasin_explicite');
    const sansFabrique = await analyser({
      ...base,
      fichiers: base.fichiers.map((f) =>
        f === registre ? { chemin: f.chemin, texte: 'export const rien = 0;\n' } : f
      ),
    });
    expect(sansFabrique.fautes.map((f) => f.famille)).toContain('perimetre_vide');
  });

  it('REQ-SEC-016 — le filtre du DISQUE lit les huit extensions de code, et elles seules', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'rfx-'));
    try {
      const code = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];
      for (const ext of [...code, '.json', '.md', '.txt']) {
        writeFileSync(join(dossier, `cle${ext}`), "export const k = 'depot:x';\n");
      }
      const lus = sourcesDuDisque(dossier);
      expect(lus.map((f) => f.chemin.slice(dossier.length + 1)).sort()).toEqual(
        code.map((ext) => `cle${ext}`).sort()
      );
      const r = await analyser({ ...base, fichiers: [...base.fichiers, ...lus] });
      expect(r.fautes).toHaveLength(code.length);
      expect(r.fautes.every((f) => f.famille === 'prefixe_hors_registre')).toBe(true);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it.each([
    ['sous `scripts/`', 'scripts/lot/voisin.ts'],
    ['à côté du registre', 'src/server/securite/voisin.ts'],
  ])('REQ-SEC-016 — une clé de famille écrite %s est vue', async (_l, chemin) => {
    const r = await analyser({
      ...base,
      fichiers: [...base.fichiers, { chemin, texte: "export const k = 'depot:x';\n" }],
    });
    expect(r.fautes.map((f) => [f.famille, f.message.split(' — ')[0]])).toEqual([
      ['prefixe_hors_registre', `${chemin}:1`],
    ]);
  });

  it.each([
    [
      'un magasin passé en 4e argument',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any, m: any) => limiter('magic:ip', s, 0, m);\n",
    ],
    [
      'un signaleur passé en 5e argument',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter('magic:ip', s, 0, undefined, () => undefined);\n",
    ],
    [
      'un magasin fabriqué à la main',
      "import { magasinDepuis } from './securite/rate-limit';\nexport const m = magasinDepuis(async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n",
    ],
    [
      'un magasin réel construit hors du registre',
      "import { creerMagasinRedis } from './securite/rate-limit';\nexport const m = creerMagasinRedis('redis://cache.example.org', {});\n",
    ],
    [
      'une queue d’arguments étalée',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter('magic:ip', s, ...([Date.now(), undefined, () => {}] as const));\n",
    ],
    [
      'un étalement au milieu des arguments',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter('magic:ip', ...([s] as const), 0);\n",
    ],
    [
      'une fabrique importée sous un nom de chaîne, passée par étalement',
      "import { limiter, 'magasinDepuis' as fabrique } from './securite/rate-limit';\n" +
        'const ouvert = fabrique(async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n' +
        "export const f = (s: any) => limiter('magic:ip', s, ...([0, ouvert] as const));\n",
    ],
    [
      'un appel à DEUX nœuds écrits dont l’étalement porte heure et magasin',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any, m: any) => limiter('magic:ip', ...([s, 0, m] as const));\n",
    ],
    [
      'un étalement seul qui porte un signaleur muet sur `depot:ip`',
      "import { limiter } from './securite/rate-limit';\nexport const f = (s: any) => limiter('depot:ip', ...([s, 0, undefined, () => undefined] as const));\n",
    ],
    [
      'une fabrique ré-exportée sous un nom de chaîne',
      "export { 'creerMagasinRedis' as fabrique } from './securite/rate-limit';\n",
    ],
    [
      'une fabrique importée sous un nom de chaîne, sans appel',
      "import { 'creerMagasinRedis' as fabrique } from './securite/rate-limit';\nexport const g = fabrique;\n",
    ],
  ])('REQ-SEC-016 — hors des tests, %s est refusé : `magasin_explicite`', async (_l, texte) => {
    const r = await analyser({
      ...base,
      fichiers: [...base.fichiers, { chemin: 'src/server/detour.ts', texte }],
    });
    expect(r.fautes.map((f) => f.famille)).toContain('magasin_explicite');
    expect(r.fautes.every((f) => f.message.startsWith('src/server/detour.ts:'))).toBe(true);
  });

  it('REQ-SEC-016 — le périmètre du dépôt lit `src/` ET `scripts/`, sous toutes les extensions de code', () => {
    const chemins = base.fichiers.map((f) => f.chemin);
    expect(chemins.some((c) => c.startsWith('src/'))).toBe(true);
    expect(chemins.some((c) => c.startsWith('scripts/'))).toBe(true);
    expect(chemins.some((c) => c.endsWith('.js'))).toBe(true);
  });

  it('REQ-SEC-016 — une conduite DÉCLARÉE contraire à l’exigence est refusée, préfixe nommé', async () => {
    const registre: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(COMPTEURS));
    registre['magic:courriel']!.surPanne = 'laisser-passer';
    registre['magic:ip']!.limite = 11;
    const r = await analyser({ ...base, registre });
    const ecarts = r.fautes.filter((f) => f.famille === 'ecart_a_l_exigence').map((f) => f.message);
    expect(
      ecarts.some((m) => m.includes('`magic:courriel`') && m.includes('préfixe `magic:`'))
    ).toBe(true);
    expect(ecarts.some((m) => m.includes('`magic:ip`'))).toBe(true);
    expect(ecarts.some((m) => m.includes('`depot:ip`'))).toBe(false);
  });

  it('REQ-SEC-016 — TÉMOIN D’EFFET : une copie de travail sans conduite sur panne fait sortir la garde en non nul, préfixe nommé', () => {
    const r = garderUneCopie((t) =>
      substituer(
        t,
        "    limite: 5,\n    fenetreSecondes: 900,\n    surPanne: 'refuser',\n",
        '    limite: 5,\n    fenetreSecondes: 900,\n'
      )
    );
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).toContain('conduite_absente');
    expect(r.sortie).toContain('préfixe `magic:`');
  });

  it('REQ-SEC-016 — TÉMOIN D’EFFET : une copie de travail qui laisse passer en panne fait sortir la garde en non nul, préfixe nommé', () => {
    const r = garderUneCopie((t) =>
      substituer(
        t,
        "return declaration.surPanne === 'laisser-passer' ? 'laisser-passer' : 'refuser';",
        "return 'laisser-passer';"
      )
    );
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).toContain('conduite_trahie');
    expect(r.sortie).toContain('préfixe `magic:`');
  });

  it('REQ-SEC-016 — le dépôt fait sortir la garde en 0, et le vert imprime les compteurs confrontés', () => {
    const r = lancerLaGarde(process.cwd());
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain(`${NOMS.length} compteurs confrontés`);
    for (const nom of NOMS) expect(r.sortie).toContain(`${nom}→${COMPTEURS[nom].surPanne}`);
    expect(r.sortie).toMatch(
      /[1-9]\d* fichiers de code lus sous `src\/` et `scripts\/` ; \d+ appels `limiter\(` vus/
    );
  });

  it('REQ-SEC-016 — `--prove` : chaque famille rougit sur son témoin, les contre-témoins restent verts', () => {
    const r = lancerLaGarde(process.cwd(), '--prove');
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain(`Les ${FAMILLES.length} familles rougissent`);
  });
});

// ── REQ-SEC-002 : les valeurs de la demande de lien magique ─────────────────────────────────────

describe('REQ-SEC-002 — les compteurs du lien magique portent les valeurs de l’exigence', () => {
  const texte = (id: string): string => {
    const r: { exigences: { id: string; texte: string }[] } = JSON.parse(
      readFileSync('docs/requirements.json', 'utf8')
    );
    return r.exigences.find((e) => e.id === id)!.texte;
  };

  it('REQ-SEC-002 — `magic:ip` 10 / 900 s et `magic:courriel` 5 / 900 s, `refuser` en panne, LUS dans le texte de l’exigence', () => {
    for (const nom of ['magic:ip', 'magic:courriel'] as const) {
      const d = COMPTEURS[nom];
      expect(d.source).toBe('REQ-SEC-002');
      const exigee = exigenceDuCompteur(texte(d.source), d.ancre);
      expect(exigee, nom).not.toBeNull();
      expect(exigee!.surPanne, nom).toBe('refuser');
      expect([d.limite, d.fenetreSecondes, d.surPanne], nom).toEqual([
        exigee!.limite,
        exigee!.fenetreSecondes,
        exigee!.surPanne,
      ]);
    }
    expect(exigenceDuCompteur(texte('REQ-SEC-002'), COMPTEURS['magic:ip'].ancre)).toEqual({
      limite: 10,
      fenetreSecondes: 900,
      surPanne: 'refuser',
    });
  });
});

// ── REQ-SEC-035 : le pot de miel ────────────────────────────────────────────────────────────────

describe('REQ-SEC-035 — le pot de miel observable', () => {
  it('REQ-SEC-035 — un champ non vide est un piège, un champ vide ou absent n’en est pas un', () => {
    expect(evaluerPotDeMiel(undefined)).toEqual({ piege: false });
    expect(evaluerPotDeMiel(null)).toEqual({ piege: false });
    expect(evaluerPotDeMiel('')).toEqual({ piege: false });
    expect(evaluerPotDeMiel('x')).toEqual({ piege: true });
    expect(evaluerPotDeMiel(' ')).toEqual({ piege: true });
  });

  it('REQ-SEC-035 — le signalement porte l’identifiant d’apporteur SANS la valeur saisie, même passée en douce', () => {
    const saisie = randomBytes(12).toString('hex');
    const large = {
      formulaire: 'depot' as const,
      apporteurId: 'app_1',
      adresseHash: 'abcdef0123456789',
      survenuAt: 0,
      valeur: saisie,
      extrait: saisie.slice(0, 4),
    };
    const signal: SignalDePotDeMiel = large;
    const lignes: string[] = [];
    signalerPotDeMiel(signal, (l) => lignes.push(l));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).not.toContain(saisie.slice(0, 4));
    expect(JSON.parse(lignes[0]!)).toEqual({
      evenement: 'pot_de_miel',
      formulaire: 'depot',
      apporteurId: 'app_1',
      adresseHash: 'abcdef0123456789',
      survenuAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('REQ-SEC-035 — le formulaire est une union FERMÉE : un formulaire inconnu ne compile pas, et un cast est refusé', () => {
    expect([...FORMULAIRES_A_POT_DE_MIEL]).toEqual(['connexion', 'depot']);
    // Assertion de TYPE, jugée par `pnpm typecheck` : si le champ redevient une chaîne libre,
    // `Admis` vaut `true` et cette ligne ne compile plus.
    type Admis = 'inconnu' extends SignalDePotDeMiel['formulaire'] ? true : false;
    const inconnuAdmis: Admis = false;
    expect(inconnuAdmis).toBe(false);
    const lignes: string[] = [];
    const force = { formulaire: 'inconnu', survenuAt: 0 } as unknown as SignalDePotDeMiel;
    expect(() => signalerPotDeMiel(force, (l) => lignes.push(l))).toThrow(/^formulaire_inconnu/);
    expect(lignes).toEqual([]);
  });

  it('REQ-SEC-035 — l’accusé n’est émis que si la ligne existe', async () => {
    const envoyes: string[] = [];
    const lignes = new Map([['d1', 'ligne d1']]);
    const lire = async (id: string) => lignes.get(id) ?? null;
    const envoyer = async (l: string) => {
      envoyes.push(l);
    };
    expect(await accuserSiLaLigneExiste('d0', lire, envoyer)).toEqual({ envoye: false });
    expect(await accuserSiLaLigneExiste('d1', lire, envoyer)).toEqual({ envoye: true });
    expect(envoyes).toEqual(['ligne d1']);
  });

  it('REQ-SEC-035 — au plancher : le travail et son absence répondent au même instant ; un dépassement est RAPPORTÉ', async () => {
    const h = horlogeFactice();
    const vide = await executerAuPlancher(200, async () => 'rien', h);
    expect([h.t, vide.depasse]).toEqual([200, false]);
    const t1 = h.t;
    const court = await executerAuPlancher(
      200,
      async () => {
        h.avancer(30);
        return 'fait';
      },
      h
    );
    expect([h.t - t1, court.valeur, court.depasse]).toEqual([200, 'fait', false]);
    const t2 = h.t;
    const long = await executerAuPlancher(
      200,
      async () => {
        h.avancer(250);
        return 'long';
      },
      h
    );
    expect([h.t - t2, long.depasse]).toEqual([250, true]);
    const t3 = h.t;
    await expect(
      executerAuPlancher(
        200,
        async () => {
          h.avancer(10);
          throw new Error('échec');
        },
        h
      )
    ).rejects.toThrow('échec');
    expect(h.t - t3).toBe(200);
  });

  it('REQ-SEC-035 — PARCOURS DE BAC : piège et nominal rendent la même réponse au même instant ; le piège n’écrit rien et n’accuse rien', async () => {
    const saisie = randomBytes(8).toString('hex');
    const nominal = await deposerSurLeBac({ id: 'd1', apporteurId: 'app_1', champ: '' });
    const piege = await deposerSurLeBac({ id: 'd2', apporteurId: 'app_1', champ: saisie });

    expect(piege.reponse).toEqual(nominal.reponse);
    expect(piege.duree).toBe(nominal.duree);

    expect(nominal.base.lignes.has('d1')).toBe(true);
    expect(nominal.base.accuses).toEqual(['d1']);
    expect(nominal.base.signaux).toEqual([]);

    expect(piege.base.lignes.size, 'le chemin piège a ÉCRIT la ligne').toBe(0);
    expect(piege.base.accuses, 'le chemin piège a ACCUSÉ sans ligne').toEqual([]);
    expect(piege.base.signaux).toHaveLength(1);
    expect(piege.base.signaux[0], 'le signalement porte la valeur saisie').not.toContain(saisie);
    expect(JSON.parse(piege.base.signaux[0]!)).toMatchObject({ apporteurId: 'app_1' });
  });
});

// ── Le parcours de bac du pot de miel ───────────────────────────────────────────────────────────

function horlogeFactice() {
  const h = {
    t: 0,
    maintenantMs: () => h.t,
    attendre: async (ms: number) => {
      h.t += ms;
    },
    avancer: (ms: number) => {
      h.t += ms;
    },
  };
  return h;
}

const PLANCHER_DU_BAC = 300;

/** Un dépôt de bac composé des trois primitives : c'est lui que SEC-10 exerce, faute de formulaire. */
async function deposerSurLeBac(entree: { id: string; apporteurId: string; champ: string }) {
  const h = horlogeFactice();
  const base = {
    lignes: new Map<string, string>(),
    accuses: [] as string[],
    signaux: [] as string[],
  };
  const { piege } = evaluerPotDeMiel(entree.champ);
  await executerAuPlancher(
    PLANCHER_DU_BAC,
    async () => {
      if (piege) {
        signalerPotDeMiel(
          { formulaire: 'depot', apporteurId: entree.apporteurId, survenuAt: h.maintenantMs() },
          (l) => base.signaux.push(l)
        );
        return;
      }
      h.avancer(40);
      base.lignes.set(entree.id, entree.apporteurId);
    },
    h
  );
  await accuserSiLaLigneExiste(
    entree.id,
    async (id) => base.lignes.get(id) ?? null,
    async () => {
      base.accuses.push(entree.id);
    }
  );
  return { reponse: { statut: 200, corps: 'Déclaration reçue.' }, duree: h.t, base };
}
