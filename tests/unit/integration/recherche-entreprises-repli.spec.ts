// @req REQ-SEC-013
// @req REQ-UX-020
/**
 * INT-T09 — le mandataire de recherche d'entreprises, vu du navigateur : ce qu'il rend, ce qu'il
 * ne rend jamais, et le repli qui fait que le dépôt ne s'arrête pas quand le tiers s'arrête.
 *
 * CE QUE CHAQUE BLOC JUGE, ET PAR QUEL ACTE.
 *   — REQ-SEC-013 : le RENDU (l'objet que le navigateur reçoit) ne porte jamais de dirigeants ni
 *     d'année de naissance, pour chacune des fixtures enregistrées ; le mandataire est limité par
 *     identité (120 par 24 h) et par empreinte d'adresse, par `limiter()` du registre, dont les
 *     compteurs sont déclarés avec leur conduite ; il journalise sans donnée de personne ; la garde
 *     `aucun-annee-de-naissance` sort en non nul sur une réponse de bac qui porte des dirigeants,
 *     puis sur une qui porte une année, en NOMMANT le champ, et en 0 sur le dépôt.
 *   — REQ-UX-020 : témoin à deux faces du repli, constaté sur le rendu ; une raison sociale à
 *     distance de Levenshtein ≤ 2 est proposée, la ville départage ; « je ne trouve pas mon
 *     entreprise » produit `a_rapprocher` et aboutit avec le tiers coupé.
 *
 * CE QUI N'EST PAS PROUVÉ ICI. Le p75 < 300 ms depuis le cache (k6 sur la preview d'une PR) : il
 * n'y a encore ni preview ni route — dette déclarée. Le dépôt lui-même (qui persiste la marque)
 * appartient à sa tâche : ici, on prouve que le repli REND ce qu'il faut pour qu'il aboutisse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Horloge } from '../../../src/domain/temps/horloge';
import {
  COMPTEURS,
  magasinDepuis,
  sujetDepuisEmpreinte,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
} from '../../../src/server/securite/rate-limit';

// Le magasin du registre est remplacé, SOUS LES TESTS, par un magasin en mémoire : c'est le vrai
// `limiteurDuRegistre` (noms littéraux, conduites déclarées) qui est exercé, pas une copie.
const partage = vi.hoisted(() => ({ magasin: null as unknown }));
vi.mock('../../../src/server/securite/rate-limit', async (original) => {
  const m = await original<typeof import('../../../src/server/securite/rate-limit')>();
  return {
    ...m,
    limiter: (
      nom: Parameters<typeof m.limiter>[0],
      sujet: Parameters<typeof m.limiter>[1],
      ms: number
    ) =>
      partage.magasin === null
        ? m.limiter(nom, sujet, ms)
        : m.limiter(nom, sujet, ms, partage.magasin as MagasinDeCompteurs, () => undefined),
  };
});

import {
  autocompleterEntreprise,
  etatDuDisjoncteur,
  type DependancesDuMandataire,
} from '../../../src/server/integrations/recherche-entreprises/autocompletion';
import { limiteurDuRegistre } from '../../../src/server/integrations/recherche-entreprises/limiteur';
import {
  appelantDepuis,
  dependancesDeProduction,
} from '../../../src/server/integrations/recherche-entreprises/production';
import { empreinteAdresse } from '../../../src/server/integrations/axionia/api-entrante';
import { clientDuTiers } from '../../../src/server/integrations/recherche-entreprises/tiers';
import { creerDisjoncteur } from '../../../src/server/integrations/recherche-entreprises/disjoncteur';
import { empreinteurDeDirigeants } from '../../../src/server/integrations/recherche-entreprises/projection';
import { schemaReponseDuTiers } from '../../../src/server/integrations/recherche-entreprises/schemas';
import {
  classerSuggestions,
  distanceDeLevenshtein,
} from '../../../src/server/integrations/recherche-entreprises/classement';
import {
  controlerSaisieManuelle,
  declarerEntrepriseIntrouvable,
  MARQUE_A_RAPPROCHER,
  MARQUE_ENTREPRISE_A_VERIFIER,
} from '../../../src/server/integrations/recherche-entreprises/repli';
import { creerAntiRebond } from '../../../src/server/integrations/recherche-entreprises/anti-rebond';
import { PARAMETRES } from '../../../src/server/integrations/recherche-entreprises/parametres';
import type { CacheDeProjections } from '../../../src/server/integrations/recherche-entreprises/cache';
import type { Suggestion } from '../../../src/server/integrations/recherche-entreprises/schemas';
import {
  lireFixtures,
  type FixtureEnregistree,
} from '../../../src/server/integrations/recherche-entreprises/fixtures';

// ── Aides ───────────────────────────────────────────────────────────────────────────────────────

const INSTANT = Date.UTC(2026, 8, 19, 10, 0, 0);
const IDENTITE = sujetDepuisEmpreinte('a'.repeat(64));
const ADRESSE = sujetDepuisEmpreinte('b'.repeat(64));
const CLE_DE_TEST = 'cle-de-test-des-empreintes-de-dirigeants-0123456789';

/** L'algorithme du script du cache, rejoué en mémoire (même patron que la spec de SEC-10). */
function magasinEnMemoire(): { magasin: MagasinDeCompteurs; cles: string[] } {
  const journaux = new Map<string, number[]>();
  const cles: string[] = [];
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite) => {
    cles.push(cle);
    const vivants = (journaux.get(cle) ?? []).filter((s) => s > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push(maintenantMs);
    journaux.set(cle, vivants);
    return { admis, compte: vivants.length, plusAncienMs: vivants[0] ?? null };
  };
  return { magasin: magasinDepuis(consommer), cles };
}

function cacheEnMemoire(): CacheDeProjections & { taille(): number } {
  const m = new Map<string, unknown>();
  return {
    lire: async (cle) => (m.has(cle) ? structuredClone(m.get(cle)) : null) as never,
    ecrire: async (cle, valeur) => {
      m.set(cle, structuredClone(valeur));
    },
    taille: () => m.size,
  };
}

/** Un tiers simulé au niveau de `fetch` : le client réel lit le statut, les en-têtes, le corps. */
function fetchFactice(
  reponse: () => { statut: number; corps: unknown; entetes?: Record<string, string> }
): typeof fetch & { appels: string[] } {
  const appels: string[] = [];
  const f = (async (url: string | URL) => {
    appels.push(String(url));
    const r = reponse();
    return new Response(JSON.stringify(r.corps), {
      status: r.statut,
      headers: { 'content-type': 'application/json', ...(r.entetes ?? {}) },
    });
  }) as typeof fetch & { appels: string[] };
  f.appels = appels;
  return f;
}

interface Banc {
  deps: DependancesDuMandataire;
  lignes: Record<string, unknown>[];
  horloge: { avancer(ms: number): void } & Horloge;
}

function banc(fetchDuTiers: typeof fetch): Banc {
  let maintenant = INSTANT;
  const horloge = {
    maintenant: () => maintenant,
    avancer: (ms: number) => {
      maintenant += ms;
    },
  };
  const lignes: Record<string, unknown>[] = [];
  return {
    horloge,
    lignes,
    deps: {
      horloge,
      tiers: clientDuTiers({
        fetch: fetchDuTiers,
        urlDeBase: 'http://tiers.invalid',
        delaiMs: PARAMETRES.delaiAttenteMs.valeur,
      }),
      cache: cacheEnMemoire(),
      limiteur: limiteurDuRegistre,
      disjoncteur: creerDisjoncteur(),
      empreindre: empreinteurDeDirigeants(CLE_DE_TEST),
      journaliser: (l) => lignes.push({ ...l }),
    },
  };
}

const APPELANT = { identite: IDENTITE, adresse: ADRESSE };

let FIXTURES: FixtureEnregistree[] = [];

beforeEach(() => {
  partage.magasin = magasinEnMemoire().magasin;
  FIXTURES = lireFixtures();
});
afterEach(() => {
  partage.magasin = null;
});

/** Une fixture enregistrée qui porte au moins un résultat et au moins un dirigeant. */
function fixtureAvecDirigeants(): FixtureEnregistree {
  const f = FIXTURES.find((x) =>
    (x.reponse as { results: { dirigeants: unknown[] }[] }).results.some(
      (r) => r.dirigeants.length > 0
    )
  );
  if (f === undefined) throw new Error('aucune fixture enregistrée ne porte de dirigeant');
  return f;
}

/** Tout nom de clé d'un JSON, à toute profondeur. */
function clesDe(v: unknown, chemin = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => clesDe(x, `${chemin}[${i}]`));
  if (typeof v === 'object' && v !== null) {
    return Object.entries(v).flatMap(([k, x]) => [
      `${chemin}.${k}`,
      ...clesDe(x, `${chemin}.${k}`),
    ]);
  }
  return [];
}

/** Toute valeur feuille d'un JSON, à toute profondeur. */
function feuillesDe(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(feuillesDe);
  if (typeof v === 'object' && v !== null) return Object.values(v).flatMap(feuillesDe);
  return v === null || v === undefined ? [] : [String(v)];
}

// ── REQ-SEC-013 : ce que le navigateur reçoit ───────────────────────────────────────────────────

describe('REQ-SEC-013 — la réponse du mandataire ne porte jamais les dirigeants', () => {
  it('REQ-SEC-013 — pour CHAQUE fixture enregistrée, le rendu n’a ni clé de dirigeant, ni de naissance, ni valeur de personne', async () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
    let dirigeantsVus = 0;
    for (const f of FIXTURES) {
      // Un banc neuf par fixture, compteurs compris : chaque banc repart du même instant.
      partage.magasin = magasinEnMemoire().magasin;
      const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
      const rendu = await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
      expect(rendu.mode, f.fichier).toBe('autocompletion');
      const cles = clesDe(rendu).join(' ');
      expect(cles, f.fichier).not.toMatch(/dirigeant|naissance|prenom|nationalite|qualite/i);
      // Les valeurs de personne du tiers — nom, prénoms, année, mois de naissance — n'y sont pas.
      const personnes = (
        f.reponse as { results: { dirigeants: Record<string, unknown>[] }[] }
      ).results
        .flatMap((r) => r.dirigeants)
        .filter((d) => d.type_dirigeant === 'personne physique');
      dirigeantsVus += personnes.length;
      const interdites = new Set(
        personnes.flatMap((d) =>
          [d.nom, d.prenoms, d.annee_de_naissance, d.date_de_naissance].filter(
            (x): x is string => typeof x === 'string' && x !== ''
          )
        )
      );
      for (const v of feuillesDe(rendu))
        expect(interdites.has(v), `${f.fichier} : ${v}`).toBe(false);
    }
    // Un contrôle qui n'a vu aucun dirigeant n'a rien contrôlé.
    expect(dirigeantsVus).toBeGreaterThan(0);
  });

  it('REQ-SEC-013 — le cache ne garde pas non plus de nom ni d’année : seulement la projection', async () => {
    const f = fixtureAvecDirigeants();
    const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
    const ecrits: unknown[] = [];
    const cache = b.deps.cache;
    b.deps.cache = {
      lire: cache.lire,
      ecrire: async (c, v, t) => {
        ecrits.push(v);
        await cache.ecrire(c, v, t);
      },
    };
    await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    expect(ecrits.length).toBeGreaterThan(0);
    const cles = clesDe(ecrits).join(' ');
    expect(cles).not.toMatch(/naissance|prenom|nationalite/i);
    expect(cles).toMatch(/empreinte/);
  });
});

// ── REQ-SEC-013 : limité par identité et par adresse, par le registre ───────────────────────────

describe('REQ-SEC-013 — limité par identité (120/j) et par empreinte d’adresse, par le registre', () => {
  it('REQ-SEC-013 — les trois compteurs sont au registre SEC-10, chacun avec sa conduite', () => {
    const c = COMPTEURS as Record<string, Record<string, unknown>>;
    expect(c['depot:entreprise-identite']).toMatchObject({
      limite: 120,
      fenetreSecondes: 86_400,
      surPanne: 'refuser',
      source: 'REQ-SEC-013',
    });
    expect(c['depot:entreprise-ip']).toMatchObject({ source: 'REQ-SEC-013' });
    expect(c['depot:entreprise-global']).toMatchObject({
      limite: 5,
      fenetreSecondes: 1,
      surPanne: 'refuser',
      source: 'REQ-INT-020',
    });
  });

  it('REQ-SEC-013 — le 121e appel de la journée bascule en saisie manuelle, le lendemain repasse', async () => {
    const f = fixtureAvecDirigeants();
    const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
    for (let i = 0; i < 120; i++) {
      const r = await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
      expect(r.mode, `appel ${i + 1}`).toBe('autocompletion');
      b.horloge.avancer(60_000);
    }
    const refus = await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    expect(refus).toEqual({ mode: 'saisie_manuelle', motif: 'limite_atteinte' });
    // Une autre identité, même adresse : elle n'est pas punie pour la première.
    const autre = await autocompleterEntreprise(
      { q: f.requete.q },
      { identite: sujetDepuisEmpreinte('c'.repeat(64)), adresse: ADRESSE },
      b.deps
    );
    expect(autre.mode).toBe('autocompletion');
    b.horloge.avancer(24 * 3_600_000);
    expect((await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps)).mode).toBe(
      'autocompletion'
    );
  });

  it('REQ-SEC-013 — le plafond par ADRESSE est atteint en changeant d’identité : l’adresse suivante refuse, une autre passe', async () => {
    const f = fixtureAvecDirigeants();
    const tiers = fetchFactice(() => ({ statut: 200, corps: f.reponse }));
    const b = banc(tiers);
    const limite = COMPTEURS['depot:entreprise-ip'].limite;
    const identite = (i: number) => sujetDepuisEmpreinte(i.toString(16).padStart(64, '0'));
    for (let i = 0; i < limite; i++) {
      const r = await autocompleterEntreprise(
        { q: f.requete.q },
        { identite: identite(i), adresse: ADRESSE },
        b.deps
      );
      if (r.mode !== 'autocompletion') throw new Error(`appel ${i + 1} : ${JSON.stringify(r)}`);
    }
    // Une identité NEUVE, jamais comptée : c'est l'adresse seule qui la refuse.
    expect(
      await autocompleterEntreprise(
        { q: f.requete.q },
        { identite: identite(limite), adresse: ADRESSE },
        b.deps
      )
    ).toEqual({ mode: 'saisie_manuelle', motif: 'limite_atteinte' });
    expect(
      (
        await autocompleterEntreprise(
          { q: f.requete.q },
          { identite: identite(limite), adresse: sujetDepuisEmpreinte('d'.repeat(64)) },
          b.deps
        )
      ).mode
    ).toBe('autocompletion');
  });

  it('REQ-SEC-013 — le cache du registre en panne : l’identité refuse (conduite déclarée), le dépôt ne bloque pas', async () => {
    partage.magasin = magasinDepuis(() => Promise.reject(new Error('cache tombé')));
    const f = fixtureAvecDirigeants();
    const tiers = fetchFactice(() => ({ statut: 200, corps: f.reponse }));
    const b = banc(tiers);
    const r = await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    expect(r).toEqual({ mode: 'saisie_manuelle', motif: 'limiteur_indisponible' });
    expect(tiers.appels).toHaveLength(0);
  });

  it('REQ-SEC-013 — une adresse illisible n’est pas un seau commun : refus fermé, saisie manuelle', async () => {
    const f = fixtureAvecDirigeants();
    const tiers = fetchFactice(() => ({ statut: 200, corps: f.reponse }));
    const b = banc(tiers);
    const r = await autocompleterEntreprise(
      { q: f.requete.q },
      { identite: IDENTITE, adresse: null },
      b.deps
    );
    expect(r).toEqual({ mode: 'saisie_manuelle', motif: 'adresse_illisible' });
    expect(tiers.appels).toHaveLength(0);
  });

  it('REQ-SEC-013 — les sujets des compteurs sont des EMPREINTES : l’adresse lue depuis la droite, jamais en clair', () => {
    const secrets = {
      PII_HASH_KEY: 'cle-des-empreintes-de-test-0123456789abcdef',
      IP_HASH_SALT: 'sel-des-adresses-de-test-0123456789abcdef',
    };
    const entetes = new Headers({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9' });
    const a = appelantDepuis('apporteur-42', entetes, secrets);
    expect(a.identite).toMatch(/^[0-9a-f]{64}$/);
    expect(a.adresse).toMatch(/^[0-9a-f]{16}$/);
    // REQ-SEC-017 : une adresse, UNE empreinte. Le mandataire et la frontiere d'axionia la calculent
    // par la meme fonction, sous le meme sel : le rapprochement par empreinte d'adresse les relie.
    expect(a.adresse).toBe(empreinteAdresse('203.0.113.9', secrets.IP_HASH_SALT));
    // L'élément de DROITE (le dernier mandataire de confiance), jamais celui que le client écrit.
    const droite = appelantDepuis(
      'apporteur-42',
      new Headers({ 'x-forwarded-for': '203.0.113.9' }),
      secrets
    );
    expect(a.adresse).toBe(droite.adresse);
    expect(JSON.stringify(a)).not.toMatch(/203\.0\.113\.9|apporteur-42/);
    expect(appelantDepuis('apporteur-42', new Headers(), secrets).adresse).toBeNull();
    // L'identité est celle de l'apporteur AUTHENTIFIÉ, sous la clé des personnes : deux apporteurs,
    // deux empreintes ; une autre clé, une autre empreinte ; aucun en-tête du client ne la déplace.
    expect(appelantDepuis('apporteur-43', entetes, secrets).identite).not.toBe(a.identite);
    expect(
      appelantDepuis('apporteur-42', entetes, {
        ...secrets,
        PII_HASH_KEY: `${secrets.PII_HASH_KEY}-x`,
      }).identite
    ).not.toBe(a.identite);
    const forge = new Headers(entetes);
    for (const nom of ['x-apporteur', 'x-apporteur-id', 'x-user-id', 'authorization'])
      forge.set(nom, 'apporteur-43');
    expect(appelantDepuis('apporteur-42', forge, secrets).identite).toBe(a.identite);
    // Deux clés, deux usages : la même valeur ne donne pas la même empreinte sous l'autre clé.
    expect(
      appelantDepuis('apporteur-42', entetes, {
        ...secrets,
        IP_HASH_SALT: `${secrets.IP_HASH_SALT}-x`,
      }).adresse
    ).not.toBe(a.adresse);
  });

  it('REQ-SEC-013 — chaque appel est journalisé, sans la saisie, sans l’identité, sans l’adresse', async () => {
    const f = fixtureAvecDirigeants();
    const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
    await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    expect(b.lignes).toEqual([
      expect.objectContaining({
        signal: 'recherche_entreprises',
        issue: 'autocompletion',
        origine: 'tiers',
      }),
      expect.objectContaining({
        signal: 'recherche_entreprises',
        issue: 'autocompletion',
        origine: 'cache',
      }),
    ]);
    const texte = JSON.stringify(b.lignes);
    expect(texte).not.toContain(f.requete.q);
    expect(texte).not.toContain(IDENTITE);
    expect(texte).not.toContain(ADRESSE);
  });
});

// ── REQ-SEC-013 : la garde dédiée, témoin à deux faces ──────────────────────────────────────────

describe('REQ-SEC-013 — la garde « aucune année de naissance » sait rougir, et nomme le champ', () => {
  const GARDE = 'scripts/gates/aucun-annee-de-naissance.ts';
  const lancer = (args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', GARDE, ...args], { encoding: 'utf8' });
  let dossier = '';
  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'garde-naissance-'));
  });
  afterEach(() => {
    rmSync(dossier, { recursive: true, force: true });
  });

  /** Une réponse de bac d'essai DÉRIVÉE du rendu réel d'une fixture, à laquelle on ajoute la faute. */
  async function bac(
    faute: (rendu: Record<string, unknown>, f: FixtureEnregistree) => void
  ): Promise<string> {
    const f = fixtureAvecDirigeants();
    const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
    const rendu = (await autocompleterEntreprise(
      { q: f.requete.q },
      APPELANT,
      b.deps
    )) as unknown as Record<string, unknown>;
    faute(rendu, f);
    const chemin = join(dossier, 'reponse-de-bac.json');
    writeFileSync(chemin, JSON.stringify(rendu));
    return chemin;
  }

  it('REQ-SEC-013 — une réponse de bac portant la liste des dirigeants : sortie non nulle, `dirigeants` nommé', async () => {
    const chemin = await bac((rendu, f) => {
      rendu.dirigeants = (f.reponse as { results: { dirigeants: unknown[] }[] }).results.find(
        (r) => r.dirigeants.length > 0
      )!.dirigeants;
    });
    const r = lancer(['--reponse', chemin]);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/dirigeants/);
  });

  it('REQ-SEC-013 — une réponse de bac portant une année de naissance : sortie non nulle, `annee_de_naissance` nommé', async () => {
    const chemin = await bac((rendu) => {
      const s = (rendu.suggestions as Record<string, unknown>[])[0]!;
      s.annee_de_naissance = '1968';
    });
    const r = lancer(['--reponse', chemin]);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/annee_de_naissance/);
  });

  it('REQ-SEC-013 — les fixtures enregistrées du dépôt : sortie 0, et le compte est dit', () => {
    const r = lancer([]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/(\d+) fixture/);
    expect(Number(/(\d+) fixture/.exec(r.stdout)![1])).toBeGreaterThanOrEqual(20);
  });

  it('REQ-SEC-013 — `--prove` : chaque témoin rougit, le contre-témoin est vert', () => {
    const r = lancer(['--prove']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/dirigeants/);
    expect(r.stdout).toMatch(/annee_de_naissance/);
    // La moitié FICHE de la garde a son témoin, jugé par le chemin du dépôt.
    expect(r.stdout).toMatch(/\(fiche\).*annee_de_naissance/);
  });

  it('REQ-SEC-013 — le MODE DÉPÔT (celui du job nocturne) sort en non nul sur un jeu fautif', () => {
    const source = 'tests/fixtures/recherche-entreprises';
    const fichiers = readdirSync(source).filter((x) => x.endsWith('.json'));
    for (const x of fichiers.slice(0, 19)) copyFileSync(join(source, x), join(dossier, x));
    const r = lancer(['--fixtures', dossier]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/perimetre_vide/);
    // Le même jeu complet, par la même option : vert.
    for (const x of fichiers.slice(19)) copyFileSync(join(source, x), join(dossier, x));
    expect(lancer(['--fixtures', dossier]).status).toBe(0);
  });
});

// ── REQ-UX-020 : le repli, témoin à deux faces sur le rendu ─────────────────────────────────────

describe('REQ-UX-020 — le tiers tombe, le parcours bascule en saisie manuelle ; il répond, l’autocomplétion revient', () => {
  it('REQ-UX-020 — tiers en refus pour excès (429) : le RENDU est la saisie manuelle, pas une erreur', async () => {
    const tiers = fetchFactice(() => ({
      statut: 429,
      corps: { erreur: 'trop' },
      entetes: { 'retry-after': '5' },
    }));
    const b = banc(tiers);
    const rendu = await autocompleterEntreprise({ q: 'danone' }, APPELANT, b.deps);
    expect(rendu).toEqual({ mode: 'saisie_manuelle', motif: 'refus_exces' });
    expect(tiers.appels).toHaveLength(1);
  });

  it('REQ-UX-020 — tiers disponible : le RENDU porte l’autocomplétion et ses suggestions', async () => {
    const f = fixtureAvecDirigeants();
    const b = banc(fetchFactice(() => ({ statut: 200, corps: f.reponse })));
    const rendu = await autocompleterEntreprise({ q: f.requete.q }, APPELANT, b.deps);
    expect(rendu.mode).toBe('autocompletion');
    if (rendu.mode !== 'autocompletion') return;
    expect(rendu.suggestions.length).toBeGreaterThan(0);
    for (const s of rendu.suggestions) expect(s.siren).toMatch(/^\d{9}$/);
  });

  it('REQ-UX-020 — après le 429, le disjoncteur est OUVERT et visible, et plus aucun appel ne part', async () => {
    const tiers = fetchFactice(() => ({ statut: 429, corps: {}, entetes: { 'retry-after': '5' } }));
    const b = banc(tiers);
    await autocompleterEntreprise({ q: 'danone' }, APPELANT, b.deps);
    expect(etatDuDisjoncteur(b.deps)).toMatchObject({
      etat: 'ouvert',
      dernierMotif: 'refus_exces',
    });
    const r = await autocompleterEntreprise({ q: 'michelin' }, APPELANT, b.deps);
    expect(r).toEqual({ mode: 'saisie_manuelle', motif: 'disjoncteur_ouvert' });
    expect(tiers.appels).toHaveLength(1);
  });

  it('REQ-UX-020 — le dépôt aboutit tiers coupé : la saisie manuelle contrôlée rend la marque `entreprise_a_verifier`', async () => {
    const b = banc(fetchFactice(() => ({ statut: 503, corps: {} })));
    const rendu = await autocompleterEntreprise({ q: 'danone' }, APPELANT, b.deps);
    expect(rendu.mode).toBe('saisie_manuelle');
    expect(controlerSaisieManuelle({ numero: '552 032 534' })).toEqual({
      ok: true,
      saisie: { siren: '552032534', siret: null, marque: MARQUE_ENTREPRISE_A_VERIFIER },
    });
    expect(MARQUE_ENTREPRISE_A_VERIFIER).toBe('entreprise_a_verifier');
  });

  it('REQ-UX-020 — un numéro dont la clé de Luhn est fausse est refusé, jamais « complété »', () => {
    expect(controlerSaisieManuelle({ numero: '552032535' })).toEqual({
      ok: false,
      motif: 'cle_invalide',
    });
    expect(controlerSaisieManuelle({ numero: '5520325' })).toEqual({
      ok: false,
      motif: 'format_invalide',
    });
    expect(controlerSaisieManuelle({ numero: '55203253400017' })).toEqual({
      ok: false,
      motif: 'cle_invalide',
    });
    // Un SIRET dont la clé à 14 chiffres est JUSTE, mais dont le SIREN (9 premiers) est faux.
    expect(controlerSaisieManuelle({ numero: '55203253500015' })).toEqual({
      ok: false,
      motif: 'cle_invalide',
    });
  });

  it('REQ-UX-020 — un SIRET valide donne le SIREN ET le SIRET', () => {
    // 732 829 320 00074 : le SIRET d'exemple que l'Insee publie (clé de Luhn vérifiée ci-dessous).
    const r = controlerSaisieManuelle({ numero: '73282932000074' });
    expect(r).toEqual({
      ok: true,
      saisie: { siren: '732829320', siret: '73282932000074', marque: MARQUE_ENTREPRISE_A_VERIFIER },
    });
  });

  it('REQ-UX-020 — « je ne trouve pas mon entreprise » : raison sociale + ville + code postal, SIREN facultatif, état `a_rapprocher`', () => {
    expect(
      declarerEntrepriseIntrouvable({
        raisonSociale: 'Boulangerie du Coin',
        ville: 'Grenoble',
        codePostal: '38000',
      })
    ).toEqual({
      ok: true,
      declaration: {
        raisonSociale: 'Boulangerie du Coin',
        ville: 'Grenoble',
        codePostal: '38000',
        siren: null,
        marque: MARQUE_A_RAPPROCHER,
      },
    });
    expect(MARQUE_A_RAPPROCHER).toBe('a_rapprocher');
    // Un SIREN fourni est contrôlé, pas cru.
    expect(
      declarerEntrepriseIntrouvable({
        raisonSociale: 'X',
        ville: 'Y',
        codePostal: '38000',
        siren: '552032535',
      })
    ).toEqual({ ok: false, motif: 'cle_invalide' });
    // Un SIRET valide donné pour SIREN est REFUSÉ, jamais tronqué en silence.
    expect(
      declarerEntrepriseIntrouvable({
        raisonSociale: 'X',
        ville: 'Y',
        codePostal: '38000',
        siren: '73282932000074',
      })
    ).toEqual({ ok: false, motif: 'format_invalide' });
    expect(
      declarerEntrepriseIntrouvable({ raisonSociale: 'X', ville: 'Y', codePostal: '380' })
    ).toEqual({
      ok: false,
      motif: 'format_invalide',
    });
  });
});

// ── REQ-UX-020 : tolérance aux fautes ───────────────────────────────────────────────────────────

describe('REQ-UX-020 — tolérance aux fautes : Levenshtein ≤ 2, la ville en second critère', () => {
  const s = (siren: string, nom: string, commune: string | null): Suggestion => ({
    siren,
    siret: `${siren}00010`,
    nom,
    codePostal: null,
    commune,
  });

  it('REQ-UX-020 — la distance de Levenshtein est la bonne', () => {
    expect(distanceDeLevenshtein('danone', 'danone')).toBe(0);
    expect(distanceDeLevenshtein('danoen', 'danone')).toBe(2);
    expect(distanceDeLevenshtein('michlin', 'michelin')).toBe(1);
    expect(distanceDeLevenshtein('', 'abc')).toBe(3);
  });

  it('REQ-UX-020 — une raison sociale à distance ≤ 2 de la saisie est PROPOSÉE, et devant les lointaines', () => {
    const r = classerSuggestions('michlin', null, [
      s('111111111', 'SOCIETE DES PNEUS DU CENTRE', 'Paris'),
      s('222222222', 'MICHELIN', 'Clermont-Ferrand'),
    ]);
    expect(r.map((x) => x.nom)).toEqual(['MICHELIN', 'SOCIETE DES PNEUS DU CENTRE']);
  });

  it('REQ-UX-020 — à distance égale, la ville départage ; sans ville, l’ordre du tiers est gardé', () => {
    const candidats = [s('111111111', 'DANONE', 'Paris'), s('222222222', 'DANONE', 'Grenoble')];
    expect(classerSuggestions('danone', 'grenoble', candidats).map((x) => x.commune)).toEqual([
      'Grenoble',
      'Paris',
    ]);
    expect(classerSuggestions('danone', null, candidats).map((x) => x.commune)).toEqual([
      'Paris',
      'Grenoble',
    ]);
  });

  it('REQ-UX-020 — accents et casse ne comptent pas comme des fautes', () => {
    // Brute, la distance compte deux fautes ; normalisée, aucune : SOCIÉTÉ GÉNÉRALE passe devant.
    expect(distanceDeLevenshtein('societe', 'société')).toBe(2);
    const r = classerSuggestions('societe generale', null, [
      s('111111111', 'SOCIETE GENERALI', null),
      s('222222222', 'SOCIÉTÉ GÉNÉRALE', null),
    ]);
    expect(r.map((x) => x.nom)).toEqual(['SOCIÉTÉ GÉNÉRALE', 'SOCIETE GENERALI']);
  });
});

// ── REQ-UX-020 : l'anti-rebond ──────────────────────────────────────────────────────────────────

describe('REQ-UX-020 — anti-rebond de 300 ms', () => {
  it('REQ-UX-020 — une rafale de frappes ne part qu’une fois, 300 ms après la dernière', () => {
    vi.useFakeTimers();
    try {
      const recu: string[] = [];
      const antiRebond = creerAntiRebond((q: string) => recu.push(q));
      antiRebond('dan');
      vi.advanceTimersByTime(200);
      antiRebond('dano');
      vi.advanceTimersByTime(299);
      expect(recu).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(recu).toEqual(['dano']);
      expect(PARAMETRES.antiRebondMs.valeur).toBe(300);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── Le câblage de production : chaque valeur vient de sa source ─────────────────────────────────

describe('REQ-SEC-013 — `dependancesDeProduction` : clés, adresse, délai et cache viennent de leur source', () => {
  const SECRETS = { PII_HASH_KEY: 'cle-des-personnes-de-test-0123456789abcdef' };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('REQ-SEC-013 — les empreintes des dirigeants sont sous la clé des personnes reçue', () => {
    const deps = dependancesDeProduction(SECRETS);
    const texte = 'pp\u001fLEFEVRE\u001fJEAN';
    expect(deps.empreindre(texte)).toBe(empreinteurDeDirigeants(SECRETS.PII_HASH_KEY)(texte));
    expect(
      dependancesDeProduction({ PII_HASH_KEY: 'une-autre-cle-0123456789abcdef' }).empreindre(texte)
    ).not.toBe(deps.empreindre(texte));
  });

  it('REQ-INT-020 — le tiers est joint à l’adresse déclarée, sans aucun appel réseau réel', async () => {
    const f = fixtureAvecDirigeants();
    const faux = fetchFactice(() => ({ statut: 200, corps: f.reponse }));
    vi.stubGlobal('fetch', faux);
    const issue = await dependancesDeProduction(SECRETS).tiers(f.requete.q, INSTANT);
    expect(issue.ok).toBe(true);
    expect(faux.appels).toHaveLength(1);
    expect(new URL(faux.appels[0]!).origin).toBe(PARAMETRES.urlDeBase.valeur);
    if (issue.ok) expect(issue.reponse).toEqual(schemaReponseDuTiers.parse(f.reponse));
  });

  it('REQ-INT-020 — le délai d’attente est celui du réglage : un tiers muet est abandonné à temps', async () => {
    vi.stubGlobal(
      'fetch',
      ((_url: string, init?: RequestInit) =>
        new Promise((_resoudre, rejeter) => {
          init?.signal?.addEventListener('abort', () => rejeter(init.signal?.reason));
        })) as typeof fetch
    );
    const delai = PARAMETRES.delaiAttenteMs.valeur;
    const debut = performance.now();
    const issue = await dependancesDeProduction(SECRETS).tiers('danone', INSTANT);
    const ecoule = performance.now() - debut;
    expect(issue).toEqual({ ok: false, motif: 'delai_depasse', retryAfterMs: null });
    expect(ecoule).toBeGreaterThanOrEqual(delai - 100);
    expect(ecoule).toBeLessThan(delai + 1_500);
  }, 10_000);

  it('REQ-INT-020 — le cache lit `REDIS_URL` dans l’environnement : absente, il échoue sans rien inventer', async () => {
    vi.stubEnv('REDIS_URL', '');
    await expect(dependancesDeProduction(SECRETS).cache.lire('entreprise:v1:test')).rejects.toThrow(
      /REDIS_URL absente/
    );
  });
});
