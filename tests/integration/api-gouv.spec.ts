// @req REQ-INT-020
// @req REQ-INT-021
// @req REQ-QA-028
/**
 * INT-T09 — le client de l'API publique de recherche d'entreprises, contre un TIERS SIMULÉ PAR UN
 * SERVEUR HTTP LOCAL (127.0.0.1) : le vrai `fetch`, la vraie socket, les vrais en-têtes. Aucun
 * appel ne sort de la machine. Le contrat contre l'API réelle est le job nocturne
 * (`derive-nocturne.ts`), pas ce fichier.
 *
 * CE QUE CHAQUE BLOC JUGE, ET PAR QUEL ACTE.
 *   — REQ-QA-028 : ≥ 20 fixtures enregistrées, datées, qui nomment leur producteur réel et la fiche
 *     tiers ; le schéma Zod les accepte TOUTES et refuse une forme dérivée ; le disjoncteur ouvre, et
 *     ouvert il ne laisse partir aucune requête ; le débit global est ≤ 5 par seconde.
 *   — REQ-INT-020 : la requête est minimale (`minimal=true&include=siege,dirigeants`) ; 429, délai
 *     dépassé, 5xx rendent la saisie manuelle, jamais une erreur ; `Retry-After` est respecté, en
 *     secondes comme en date HTTP ; le cache répond 24 h, pas une milliseconde de plus.
 *   — REQ-INT-021 : la fiche persistable porte EXACTEMENT les champs que le texte de l'exigence
 *     énumère — la liste est LUE dans `docs/requirements.json`, pas recopiée — ; un champ en trop
 *     est refusé ; des dirigeants, seulement une empreinte normalisée et la qualité ;
 *     `statut_diffusion` est respecté à l'affichage.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import {
  COMPTEURS,
  magasinDepuis,
  sujetDepuisEmpreinte,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
} from '../../src/server/securite/rate-limit';

const partage = vi.hoisted(() => ({ magasin: null as unknown }));
vi.mock('../../src/server/securite/rate-limit', async (original) => {
  const m = await original<typeof import('../../src/server/securite/rate-limit')>();
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
  ficheEntreprise,
  type DependancesDuMandataire,
} from '../../src/server/integrations/recherche-entreprises/autocompletion';
import { limiteurDuRegistre } from '../../src/server/integrations/recherche-entreprises/limiteur';
import {
  clientDuTiers,
  lireRetryAfter,
} from '../../src/server/integrations/recherche-entreprises/tiers';
import { creerDisjoncteur } from '../../src/server/integrations/recherche-entreprises/disjoncteur';
import {
  empreinteurDeDirigeants,
  normaliserNomDeDirigeant,
  projeter,
} from '../../src/server/integrations/recherche-entreprises/projection';
import {
  schemaFicheEntreprise,
  schemaReponseDuTiers,
} from '../../src/server/integrations/recherche-entreprises/schemas';
import {
  PARAMETRES,
  urlDeRecherche,
} from '../../src/server/integrations/recherche-entreprises/parametres';
import {
  lireFixtures,
  type FixtureEnregistree,
} from '../../src/server/integrations/recherche-entreprises/fixtures';
import type { CacheDeProjections } from '../../src/server/integrations/recherche-entreprises/cache';
import {
  comparerFormes,
  formesDe,
} from '../../src/server/integrations/recherche-entreprises/derive-nocturne';

// ── Le tiers simulé ─────────────────────────────────────────────────────────────────────────────

type Reponse = {
  statut: number;
  corps?: unknown;
  entetes?: Record<string, string>;
  muet?: boolean;
};

let serveur: Server;
let base = '';
let repondre: (url: URL) => Reponse = () => ({ statut: 500 });
const recues: URL[] = [];
const muettes: ServerResponse[] = [];

beforeAll(async () => {
  serveur = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    recues.push(url);
    const r = repondre(url);
    if (r.muet === true) {
      muettes.push(res);
      return;
    }
    res.writeHead(r.statut, { 'content-type': 'application/json', ...(r.entetes ?? {}) });
    res.end(JSON.stringify(r.corps ?? {}));
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const r of muettes) r.destroy();
  await new Promise<void>((ok) => serveur.close(() => ok()));
});

// ── Aides ───────────────────────────────────────────────────────────────────────────────────────

const INSTANT = Date.UTC(2026, 8, 19, 10, 0, 0);
const APPELANT = {
  identite: sujetDepuisEmpreinte('a'.repeat(64)),
  adresse: sujetDepuisEmpreinte('b'.repeat(64)),
};
const CLE_DE_TEST = 'cle-de-test-des-empreintes-de-dirigeants-0123456789';

function magasinEnMemoire(): MagasinDeCompteurs {
  const journaux = new Map<string, number[]>();
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite) => {
    const vivants = (journaux.get(cle) ?? []).filter((s) => s > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push(maintenantMs);
    journaux.set(cle, vivants);
    return { admis, compte: vivants.length, plusAncienMs: vivants[0] ?? null };
  };
  return magasinDepuis(consommer);
}

function cacheEnMemoire(): CacheDeProjections {
  const m = new Map<string, { valeur: unknown; expireA: number }>();
  let maintenant = () => 0;
  const c: CacheDeProjections & { horloge(h: () => number): void } = {
    lire: async (cle) => {
      const e = m.get(cle);
      return (
        e === undefined || e.expireA <= maintenant() ? null : structuredClone(e.valeur)
      ) as never;
    },
    ecrire: async (cle, valeur, ttlSecondes) => {
      m.set(cle, { valeur: structuredClone(valeur), expireA: maintenant() + ttlSecondes * 1000 });
    },
    horloge: (h) => {
      maintenant = h;
    },
  };
  return c;
}

function banc(delaiMs: number = PARAMETRES.delaiAttenteMs.valeur) {
  let maintenant = INSTANT;
  const horloge = { maintenant: () => maintenant };
  const cache = cacheEnMemoire() as CacheDeProjections & { horloge(h: () => number): void };
  cache.horloge(() => maintenant);
  const deps: DependancesDuMandataire = {
    horloge,
    tiers: clientDuTiers({ fetch, urlDeBase: base, delaiMs }),
    cache,
    limiteur: limiteurDuRegistre,
    disjoncteur: creerDisjoncteur(),
    empreindre: empreinteurDeDirigeants(CLE_DE_TEST),
    journaliser: () => undefined,
  };
  return {
    deps,
    avancer: (ms: number) => {
      maintenant += ms;
    },
  };
}

let FIXTURES: FixtureEnregistree[] = [];
const avecResultats = (): FixtureEnregistree =>
  FIXTURES.find((f) => (f.reponse as { results: unknown[] }).results.length > 0)!;

beforeEach(() => {
  recues.length = 0;
  partage.magasin = magasinEnMemoire();
  FIXTURES = lireFixtures();
});
afterEach(() => {
  partage.magasin = null;
});

// ── REQ-QA-028 : les fixtures enregistrées, le schéma ──────────────────────────────────────────

describe('REQ-QA-028 — le client est validé par schéma contre ≥ 20 fixtures enregistrées et datées', () => {
  it('REQ-QA-028 — au moins 20 cas, chacun nomme son producteur réel, sa date, la fiche tiers', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FIXTURES.map((f) => f.cas)).size).toBe(FIXTURES.length);
    for (const f of FIXTURES) {
      expect(f.Source, f.fichier).toMatch(
        /^GET https:\/\/recherche-entreprises\.api\.gouv\.fr\/search\?/
      );
      expect(f.Source, f.fichier).toMatch(/enregistré le \d{4}-\d{2}-\d{2}T/);
      expect(f['Confronte-a'], f.fichier).toMatch(
        /^docs\/tiers\/recherche-entreprises\.md#2-source-officielle/
      );
      expect(f.enregistreLe, f.fichier).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      // La requête enregistrée est celle que la production enverrait : mêmes paramètres, dérivés.
      expect(f.url, f.fichier).toBe(
        decodeURIComponent(
          urlDeRecherche(f.requete.q, 'https://recherche-entreprises.api.gouv.fr').href
        )
      );
    }
  });

  it('REQ-QA-028 — le schéma Zod accepte chacune des fixtures enregistrées', () => {
    for (const f of FIXTURES) {
      const lu = schemaReponseDuTiers.safeParse(f.reponse);
      expect(
        lu.success,
        `${f.fichier} : ${lu.success ? '' : JSON.stringify(lu.error.issues[0])}`
      ).toBe(true);
    }
  });

  it('REQ-QA-028 — une dérive de forme est refusée, et le chemin du champ est dit', () => {
    const r = structuredClone(avecResultats().reponse) as { results: Record<string, unknown>[] };
    delete r.results[0]!.siege;
    const lu = schemaReponseDuTiers.safeParse(r);
    expect(lu.success).toBe(false);
    if (!lu.success) expect(lu.error.issues[0]!.path).toEqual(['results', 0, 'siege']);
    const r2 = structuredClone(avecResultats().reponse) as { results: Record<string, unknown>[] };
    r2.results[0]!.siren = 552032534;
    expect(schemaReponseDuTiers.safeParse(r2).success).toBe(false);
  });

  it('REQ-QA-028 — le jeu couvre les cas qui comptent : sans résultat, numéro direct, association, dirigeant personne morale', () => {
    const reponses = FIXTURES.map((f) => schemaReponseDuTiers.parse(f.reponse));
    expect(reponses.some((r) => r.results.length === 0)).toBe(true);
    expect(FIXTURES.some((f) => /^\d{9}$/.test(f.requete.q))).toBe(true);
    expect(FIXTURES.some((f) => /^\d{14}$/.test(f.requete.q))).toBe(true);
    const resultats = reponses.flatMap((r) => r.results);
    expect(resultats.some((r) => r.nature_juridique?.startsWith('92'))).toBe(true);
    expect(
      resultats.some((r) => r.dirigeants.some((d) => d.type_dirigeant === 'personne morale'))
    ).toBe(true);
    expect(resultats.some((r) => r.etat_administratif !== 'A')).toBe(true);
  });
});

describe('REQ-QA-028 — le contrat nocturne signale toute dérive de forme', () => {
  it('REQ-QA-028 — rejoué sur les fixtures elles-mêmes, le contrat ne voit aucune dérive', () => {
    const formes = formesDe(FIXTURES.map((f) => f.reponse));
    expect(comparerFormes(formes, formes)).toEqual([]);
    expect([...formes.keys()].sort()).toEqual([
      'dirigeant personne morale',
      'dirigeant personne physique',
      'reponse',
      'resultat',
      'siege',
    ]);
  });

  it('REQ-QA-028 — une clé disparue et une clé apparue chez le tiers sont NOMMÉES', () => {
    const vivantes = FIXTURES.map(
      (f) => structuredClone(f.reponse) as { results: Record<string, unknown>[] }
    );
    for (const r of vivantes.flatMap((v) => v.results)) {
      delete r.categorie_entreprise;
      r.date_de_naissance_du_fondateur = '1968-02';
    }
    expect(comparerFormes(formesDe(FIXTURES.map((f) => f.reponse)), formesDe(vivantes))).toEqual([
      '[forme] resultat : clé(s) apparue(s) date_de_naissance_du_fondateur',
      '[forme] resultat : clé(s) disparue(s) categorie_entreprise',
    ]);
  });
});

// ── REQ-INT-020 : la requête, les pannes, Retry-After ───────────────────────────────────────────

describe('REQ-INT-020 — mandataire serveur : requête minimale, pannes traversées, Retry-After', () => {
  it('REQ-INT-020 — la requête sortante est minimale : `minimal=true&include=siege,dirigeants`, la saisie seule', async () => {
    const f = avecResultats();
    repondre = () => ({ statut: 200, corps: f.reponse });
    const { deps } = banc();
    const r = await autocompleterEntreprise({ q: `  ${f.requete.q}  ` }, APPELANT, deps);
    expect(r.mode).toBe('autocompletion');
    expect(recues).toHaveLength(1);
    const p = recues[0]!.searchParams;
    expect(p.get('minimal')).toBe('true');
    expect(p.get('include')).toBe('siege,dirigeants');
    expect(p.get('q')).toBe(f.requete.q);
    expect([...p.keys()].sort()).toEqual(['include', 'minimal', 'page', 'per_page', 'q']);
  });

  it('REQ-INT-020 — 429 : saisie manuelle, pas une erreur ; Retry-After (secondes) tient le disjoncteur ouvert', async () => {
    repondre = () => ({ statut: 429, corps: {}, entetes: { 'retry-after': '7' } });
    const { deps, avancer } = banc();
    expect(await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).toEqual({
      mode: 'saisie_manuelle',
      motif: 'refus_exces',
    });
    repondre = () => ({ statut: 200, corps: avecResultats().reponse });
    avancer(6_999);
    expect(await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).toEqual({
      mode: 'saisie_manuelle',
      motif: 'disjoncteur_ouvert',
    });
    expect(recues).toHaveLength(1);
    avancer(1);
    expect((await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).mode).toBe(
      'autocompletion'
    );
    expect(recues).toHaveLength(2);
  });

  it('REQ-INT-020 — Retry-After se lit en secondes ET en date HTTP ; illisible, il ne vaut rien', () => {
    expect(lireRetryAfter('7', INSTANT)).toBe(7_000);
    expect(lireRetryAfter(new Date(INSTANT + 12_000).toUTCString(), INSTANT)).toBe(12_000);
    expect(lireRetryAfter('demain', INSTANT)).toBeNull();
    expect(lireRetryAfter(null, INSTANT)).toBeNull();
    expect(lireRetryAfter('-3', INSTANT)).toBeNull();
  });

  it('REQ-INT-020 — 5xx : saisie manuelle', async () => {
    repondre = () => ({ statut: 502, corps: {} });
    const { deps } = banc();
    expect(await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).toEqual({
      mode: 'saisie_manuelle',
      motif: 'erreur_serveur',
    });
  });

  it('REQ-INT-020 — délai dépassé (un tiers qui accepte et se tait) : saisie manuelle, sans attendre', async () => {
    repondre = () => ({ statut: 200, muet: true });
    const { deps } = banc(150);
    const debut = performance.now();
    expect(await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).toEqual({
      mode: 'saisie_manuelle',
      motif: 'delai_depasse',
    });
    expect(performance.now() - debut).toBeLessThan(2_000);
  });

  it('REQ-INT-020 — une réponse 200 hors schéma est refusée, pas « complétée »', async () => {
    repondre = () => ({ statut: 200, corps: { results: [{ siren: 'pas-un-siren' }] } });
    const { deps } = banc();
    expect(await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps)).toEqual({
      mode: 'saisie_manuelle',
      motif: 'reponse_illisible',
    });
  });

  it('REQ-INT-020 — cache de 24 h : la même saisie ne repart pas au tiers, et repart à 24 h', async () => {
    repondre = () => ({ statut: 200, corps: avecResultats().reponse });
    const { deps, avancer } = banc();
    await autocompleterEntreprise({ q: 'Danone' }, APPELANT, deps);
    avancer(PARAMETRES.cacheSecondes.valeur * 1000 - 1);
    await autocompleterEntreprise({ q: '  danone ' }, APPELANT, deps);
    expect(recues).toHaveLength(1);
    avancer(1);
    await autocompleterEntreprise({ q: 'danone' }, APPELANT, deps);
    expect(recues).toHaveLength(2);
    expect(PARAMETRES.cacheSecondes.valeur).toBe(86_400);
  });
});

// ── REQ-QA-028 : le disjoncteur et le débit ─────────────────────────────────────────────────────

describe('REQ-QA-028 — disjoncteur et limite de débit ≤ 5 req/s', () => {
  it('REQ-QA-028 — des échecs répétés OUVRENT le disjoncteur ; ouvert, aucune requête ne part ; il se referme sur un essai réussi', async () => {
    repondre = () => ({ statut: 503, corps: {} });
    const { deps, avancer } = banc();
    const seuil = PARAMETRES.disjoncteurSeuilEchecs.valeur;
    for (let i = 0; i < seuil; i++) {
      await autocompleterEntreprise({ q: `danone ${i}` }, APPELANT, deps);
    }
    expect(recues).toHaveLength(seuil);
    const r = await autocompleterEntreprise({ q: 'michelin' }, APPELANT, deps);
    expect(r).toEqual({ mode: 'saisie_manuelle', motif: 'disjoncteur_ouvert' });
    expect(recues).toHaveLength(seuil);
    // À l'échéance, UN essai part (demi-ouvert) ; réussi, le disjoncteur se referme.
    avancer(PARAMETRES.disjoncteurPauseMs.valeur);
    repondre = () => ({ statut: 200, corps: avecResultats().reponse });
    expect((await autocompleterEntreprise({ q: 'michelin' }, APPELANT, deps)).mode).toBe(
      'autocompletion'
    );
    expect((await autocompleterEntreprise({ q: 'lvmh' }, APPELANT, deps)).mode).toBe(
      'autocompletion'
    );
    expect(recues).toHaveLength(seuil + 2);
  });

  it('REQ-QA-028 — six requêtes dans la même seconde : cinq partent, la sixième est refusée sans réseau', async () => {
    repondre = () => ({ statut: 200, corps: avecResultats().reponse });
    const { deps, avancer } = banc();
    const issues: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await autocompleterEntreprise(
        { q: `entreprise ${i}` },
        { identite: sujetDepuisEmpreinte(String(i).repeat(64)), adresse: APPELANT.adresse },
        deps
      );
      issues.push(r.mode === 'saisie_manuelle' ? r.motif : r.mode);
      avancer(100);
    }
    expect(issues).toEqual([
      'autocompletion',
      'autocompletion',
      'autocompletion',
      'autocompletion',
      'autocompletion',
      'debit_global',
    ]);
    expect(recues).toHaveLength(5);
    expect(COMPTEURS['depot:entreprise-global'].limite).toBeLessThanOrEqual(5);
  });
});

// ── REQ-INT-021 : ce qui est persisté ───────────────────────────────────────────────────────────

/** Les champs que REQ-INT-021 énumère, LUS dans son texte : la liste entre « persiste » et « ; ». */
function champsDeLExigence(): string[] {
  const exigences = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  const texte = exigences.exigences.find((e) => e.id === 'REQ-INT-021')!.texte;
  const liste = /persiste `([^`]+)`/.exec(texte)![1]!;
  return liste
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/(\w+)\.\{([^}]*)\}/g, (_, p: string, s: string) =>
      s
        .split(',')
        .map((x) => `${p}.${x.trim()}`)
        .join(',')
    )
    .split(',')
    .map((x) => x.trim());
}

function cheminsDe(v: Record<string, unknown>, prefixe = ''): string[] {
  return Object.entries(v).flatMap(([k, x]) =>
    typeof x === 'object' && x !== null && !Array.isArray(x)
      ? cheminsDe(x as Record<string, unknown>, `${prefixe}${k}.`)
      : [`${prefixe}${k}`]
  );
}

describe('REQ-INT-021 — la fiche persistée : exactement les champs énumérés', () => {
  const empreindre = empreinteurDeDirigeants(CLE_DE_TEST);

  it('REQ-INT-021 — pour chaque résultat de chaque fixture, la fiche porte exactement les champs de l’exigence, plus les dirigeants', () => {
    const attendus = [...champsDeLExigence(), 'dirigeants'].sort();
    expect(attendus).toContain('siege.code_postal');
    let vus = 0;
    for (const f of FIXTURES) {
      for (const fiche of projeter(schemaReponseDuTiers.parse(f.reponse), empreindre).fiches) {
        expect(cheminsDe(fiche).sort(), f.fichier).toEqual(attendus);
        for (const d of fiche.dirigeants)
          expect(Object.keys(d).sort()).toEqual(['empreinte', 'qualite']);
        vus += 1;
      }
    }
    expect(vus).toBeGreaterThan(20);
  });

  it('REQ-INT-021 — un champ en trop est REFUSÉ par le schéma de la fiche, à la racine comme au siège et chez un dirigeant', () => {
    const fiche = projeter(schemaReponseDuTiers.parse(avecResultats().reponse), empreindre)
      .fiches[0]!;
    expect(schemaFicheEntreprise.safeParse(fiche).success).toBe(true);
    expect(schemaFicheEntreprise.safeParse({ ...fiche, adresse: 'x' }).success).toBe(false);
    expect(
      schemaFicheEntreprise.safeParse({ ...fiche, siege: { ...fiche.siege, adresse: 'x' } }).success
    ).toBe(false);
    expect(
      schemaFicheEntreprise.safeParse({
        ...fiche,
        dirigeants: [
          { empreinte: 'a'.repeat(64), qualite: 'Président', annee_de_naissance: '1968' },
        ],
      }).success
    ).toBe(false);
  });

  it('REQ-INT-021 — l’empreinte d’un dirigeant est normalisée (casse, accents, espaces) et ne recopie pas le nom', () => {
    expect(normaliserNomDeDirigeant('  Lefèvre ', 'Jean-Émile  Marie')).toBe(
      normaliserNomDeDirigeant('LEFEVRE', 'JEAN EMILE MARIE')
    );
    const e = empreindre(normaliserNomDeDirigeant('LEFEVRE', 'JEAN EMILE MARIE'));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toBe(
      empreinteurDeDirigeants(`${CLE_DE_TEST}-autre`)(
        normaliserNomDeDirigeant('LEFEVRE', 'JEAN EMILE MARIE')
      )
    );
  });

  it('REQ-INT-021 — `statut_diffusion` partiel : la suggestion n’affiche ni code postal ni commune', () => {
    const reponse = schemaReponseDuTiers.parse(avecResultats().reponse);
    const diffusible = projeter(reponse, empreindre).suggestions[0]!;
    expect(diffusible.commune).not.toBeNull();
    const partielle = structuredClone(reponse);
    partielle.results[0]!.statut_diffusion = 'P';
    expect(projeter(partielle, empreindre).suggestions[0]).toMatchObject({
      codePostal: null,
      commune: null,
    });
    const siegePartiel = structuredClone(reponse);
    siegePartiel.results[0]!.siege.statut_diffusion_etablissement = 'P';
    expect(projeter(siegePartiel, empreindre).suggestions[0]).toMatchObject({
      codePostal: null,
      commune: null,
    });
  });

  it('REQ-INT-021 — la fiche d’un SIREN choisi se lit dans le cache de la recherche, sans nouvel appel', async () => {
    const f = avecResultats();
    repondre = () => ({ statut: 200, corps: f.reponse });
    const { deps } = banc();
    await autocompleterEntreprise({ q: f.requete.q }, APPELANT, deps);
    const siren = schemaReponseDuTiers.parse(f.reponse).results[0]!.siren;
    const r = await ficheEntreprise(siren, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fiche.siren).toBe(siren);
    expect(recues).toHaveLength(1);
  });

  it('REQ-INT-021 — tiers coupé, la fiche d’un SIREN inconnu rend la marque `entreprise_a_verifier`, jamais une erreur', async () => {
    repondre = () => ({ statut: 503, corps: {} });
    const { deps } = banc();
    expect(await ficheEntreprise('552032534', deps)).toEqual({
      ok: false,
      motif: 'erreur_serveur',
      marque: 'entreprise_a_verifier',
    });
  });
});
