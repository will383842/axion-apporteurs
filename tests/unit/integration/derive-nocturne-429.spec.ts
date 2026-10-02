// @req REQ-QA-027
/**
 * La sonde nocturne de recherche-entreprises face au 429 — QA-T56 (REQ-QA-027).
 *
 * Le tiers limite son débit. Un 429 n'est pas une dérive de son contrat : c'est un « pas
 * maintenant ». Avant ce témoin, la sonde le comptait comme `[appel] … : statut 429`, et le
 * nightly rougissait pour une limite de débit. La règle jugée ici :
 *   — un 429 avec `Retry-After` → une attente de la durée demandée, puis un rejeu ;
 *   — un 429 persistant → le cas est « non mesuré », jamais « dérive » ;
 *   — tout autre statut reste une dérive (contre-témoin), et les formes ne sont confrontées
 *     qu'aux fixtures des cas MESURÉS : un cas absent ne fait pas « disparaître » de clés.
 * L'appel et l'attente sont injectés : aucun réseau, aucune horloge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mesurer,
  formesDe,
  comparerFormes,
  attenteDemandee,
  rendreLaMesure,
  appelerLeTiers,
  pause,
  type Appeler,
} from '../../../src/server/integrations/recherche-entreprises/derive-nocturne';
import { CAS_ENREGISTRES } from '../../../src/server/integrations/recherche-entreprises/cas-enregistres';
import { lireFixtures } from '../../../src/server/integrations/recherche-entreprises/fixtures';
import {
  PARAMETRES,
  urlDeRecherche,
} from '../../../src/server/integrations/recherche-entreprises/parametres';

const FIXTURES = lireFixtures();
const CIBLE = CAS_ENREGISTRES[0]!;
const URL_CIBLE = urlDeRecherche(CIBLE.q, PARAMETRES.urlDeBase.valeur).href;

/** Le tiers tel que les fixtures l'ont enregistré, sauf pour la cible, servie par `cible`. */
function tiers(cible: (rang: number) => Response): { appeler: Appeler; appels: string[] } {
  const appels: string[] = [];
  const appeler: Appeler = (url) => {
    appels.push(url.href);
    if (url.href === URL_CIBLE)
      return Promise.resolve(cible(appels.filter((u) => u === URL_CIBLE).length));
    const c = CAS_ENREGISTRES.find(
      (x) => urlDeRecherche(x.q, PARAMETRES.urlDeBase.valeur).href === url.href
    );
    const f = FIXTURES.find((x) => x.cas === c?.cas);
    return Promise.resolve(new Response(JSON.stringify(f?.reponse ?? {}), { status: 200 }));
  };
  return { appeler, appels };
}

const servi = () =>
  new Response(JSON.stringify(FIXTURES.find((f) => f.cas === CIBLE.cas)?.reponse ?? {}), {
    status: 200,
  });
const limite = (retryAfter?: string) =>
  new Response('', {
    status: 429,
    headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
  });

describe('REQ-QA-027 — la sonde de recherche-entreprises patiente sur un 429', () => {
  it('REQ-QA-027 : un 429 avec Retry-After attend la durée demandée, rejoue, et ne dérive pas', async () => {
    const attentes: number[] = [];
    const { appeler, appels } = tiers((rang) => (rang === 1 ? limite('2') : servi()));
    const m = await mesurer(CAS_ENREGISTRES, FIXTURES, appeler, (ms) => {
      attentes.push(ms);
      return Promise.resolve();
    });
    expect(m.derives).toEqual([]);
    expect(m.nonMesures).toEqual([]);
    expect(appels.filter((u) => u === URL_CIBLE)).toHaveLength(2);
    expect(attentes).toContain(2_000);
  });

  it('REQ-QA-027 : un 429 persistant rend le cas « non mesuré », jamais « dérive »', async () => {
    const { appeler, appels } = tiers(() => limite('1'));
    const m = await mesurer(CAS_ENREGISTRES, FIXTURES, appeler, () => Promise.resolve());
    expect(m.derives).toEqual([]);
    expect(m.nonMesures).toEqual([CIBLE.cas]);
    expect(appels.filter((u) => u === URL_CIBLE)).toHaveLength(3);
  });

  it('REQ-QA-027 : un Retry-After démesuré est borné, absent ou illisible prend l’attente par défaut', async () => {
    for (const valeur of ['86400', undefined, 'demain']) {
      const attentes: number[] = [];
      const { appeler } = tiers((rang) => (rang === 1 ? limite(valeur) : servi()));
      await mesurer(CAS_ENREGISTRES, FIXTURES, appeler, (ms) => {
        attentes.push(ms);
        return Promise.resolve();
      });
      expect([valeur, Math.max(...attentes) <= 60_000, Math.max(...attentes) > 300]).toEqual([
        valeur,
        true,
        true,
      ]);
    }
  });

  it('REQ-QA-027 : contre-témoin — un 500 reste une dérive nommée', async () => {
    const { appeler } = tiers(() => new Response('', { status: 500 }));
    const m = await mesurer(CAS_ENREGISTRES, FIXTURES, appeler, () => Promise.resolve());
    expect(m.derives).toEqual([`[appel] ${CIBLE.cas} : statut 500`]);
    expect(m.nonMesures).toEqual([]);
  });

  it('REQ-QA-027 : contre-témoin — tous les cas servis comme enregistrés : aucune dérive', async () => {
    const { appeler } = tiers(servi);
    const m = await mesurer(CAS_ENREGISTRES, FIXTURES, appeler, () => Promise.resolve());
    expect(m).toEqual({ derives: [], nonMesures: [] });
  });
});

/**
 * Les pièces de la sonde, chacune jugée seule (passe de mutation de #418) : les formes du tiers, leur
 * comparaison, la patience bornée, le verdict imprimé, l'appel réel et la pause. Aucun réseau : le
 * `fetch` global est remplacé le temps d'un test, et l'horloge est simulée.
 */
describe('REQ-QA-027 — les pièces de la sonde, au caractère près', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('REQ-QA-027 : formesDe réunit les clés par genre — réponse, résultat, siège, dirigeant par type — et ignore ce qui n’est pas un objet', () => {
    const formes = formesDe([
      {
        total: 1,
        results: [
          {
            siren: 'x',
            siege: { commune: 'y' },
            dirigeants: [
              { type_dirigeant: 'personne physique', nom: 'a' },
              { type_dirigeant: 'personne morale', denomination: 'b' },
            ],
          },
          { siren: 'z', siege: null, dirigeants: [] },
          ['pas', 'un', 'objet'],
        ],
      },
      'texte',
      { autre: true },
    ]);
    expect(Object.fromEntries([...formes].map(([g, c]) => [g, [...c].sort()]))).toEqual({
      reponse: ['autre', 'results', 'total'],
      resultat: ['dirigeants', 'siege', 'siren'],
      siege: ['commune'],
      'dirigeant personne physique': ['nom', 'type_dirigeant'],
      'dirigeant personne morale': ['denomination', 'type_dirigeant'],
    });
    expect(formesDe([])).toEqual(new Map());
  });

  it('REQ-QA-027 : comparerFormes nomme chaque clé apparue et disparue, par genre, des deux côtés', () => {
    const avant = new Map([
      ['reponse', new Set(['a', 'b', 'c'])],
      ['siege', new Set(['x'])],
    ]);
    const apres = new Map([
      ['reponse', new Set(['a', 'd', 'e'])],
      ['dirigeant inconnu', new Set(['k'])],
    ]);
    expect(comparerFormes(avant, apres)).toEqual([
      '[forme] reponse : clé(s) apparue(s) d, e',
      '[forme] reponse : clé(s) disparue(s) b, c',
      '[forme] siege : clé(s) disparue(s) x',
      '[forme] dirigeant inconnu : clé(s) apparue(s) k',
    ]);
    expect(comparerFormes(avant, avant)).toEqual([]);
  });

  it('REQ-QA-027 : attenteDemandee — secondes, date HTTP, bornes, et l’attente par défaut', () => {
    const t0 = Date.parse('2026-10-02T10:00:00Z');
    expect(attenteDemandee('2', t0)).toBe(2_000);
    expect(attenteDemandee(' 3 ', t0)).toBe(3_000);
    expect(attenteDemandee('0', t0)).toBe(0);
    expect(attenteDemandee('60', t0)).toBe(60_000);
    expect(attenteDemandee('61', t0)).toBe(60_000);
    expect(attenteDemandee('Fri, 02 Oct 2026 10:00:07 GMT', t0)).toBe(7_000);
    expect(attenteDemandee('Fri, 02 Oct 2026 09:59:00 GMT', t0)).toBe(5_000);
    expect(attenteDemandee('-4', t0)).toBe(5_000);
    expect(attenteDemandee('demain', t0)).toBe(5_000);
    expect(attenteDemandee(null, t0)).toBe(5_000);
    expect(attenteDemandee('', t0)).toBe(5_000);
  });

  it('REQ-QA-027 : une réponse que le schéma refuse est une dérive nommée par son chemin et son code', async () => {
    const m = await mesurer(
      [CIBLE],
      FIXTURES.filter((f) => f.cas === CIBLE.cas),
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ results: 'x', total_results: 1 }), { status: 200 })
        ),
      () => Promise.resolve()
    );
    expect(m.derives[0]).toBe(`[schema] ${CIBLE.cas} : results — invalid_type`);
  });

  it('REQ-QA-027 : un appel qui lève est une dérive nommée par l’erreur, ou « échec » quand ce n’en est pas une', async () => {
    const lever =
      (e: unknown): Appeler =>
      () =>
        Promise.reject(e);
    const vide = FIXTURES.filter((f) => f.cas === CIBLE.cas);
    const attendre = () => Promise.resolve();
    expect((await mesurer([CIBLE], vide, lever(new TypeError('x')), attendre)).derives).toEqual([
      `[appel] ${CIBLE.cas} : TypeError`,
    ]);
    expect((await mesurer([CIBLE], vide, lever('non'), attendre)).derives).toEqual([
      `[appel] ${CIBLE.cas} : échec`,
    ]);
  });

  it('REQ-QA-027 : chaque cas est espacé de 300 ms, et un 429 persistant attend deux fois avant de renoncer', async () => {
    const attentes: number[] = [];
    await mesurer(
      [CIBLE, CIBLE],
      [],
      () => Promise.resolve(limite('1')),
      (ms) => {
        attentes.push(ms);
        return Promise.resolve();
      }
    );
    expect(attentes).toEqual([1_000, 1_000, 300, 1_000, 1_000, 300]);
  });

  it('REQ-QA-027 : rendreLaMesure — un avertissement par cas non mesuré, le compte des mesurés, et 1 sur toute dérive', () => {
    expect(rendreLaMesure({ derives: [], nonMesures: ['a', 'b'] }, 5)).toEqual({
      code: 0,
      sortie:
        '::warning::contrat recherche-entreprises — a non mesuré : 429 après 3 tentatives\n' +
        '::warning::contrat recherche-entreprises — b non mesuré : 429 après 3 tentatives\n' +
        "✅ contrat recherche-entreprises — 3 cas rejoués contre l'API réelle, aucune dérive, 2 non mesuré(s)\n",
    });
    expect(
      rendreLaMesure({ derives: ['[appel] x : statut 500', '[forme] y'], nonMesures: [] }, 5)
    ).toEqual({
      code: 1,
      sortie:
        '❌ contrat recherche-entreprises — 2 dérive(s) :\n  [appel] x : statut 500\n  [forme] y\n',
    });
  });

  it('REQ-QA-027 : l’appel réel demande du JSON, se nomme par l’agent utilisateur, et porte une borne de temps', async () => {
    const vus: { url: unknown; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
      vus.push({ url, init });
      return Promise.resolve(new Response('{}'));
    });
    const url = new URL(URL_CIBLE);
    await appelerLeTiers(url);
    expect(vus).toHaveLength(1);
    expect(vus[0]!.url).toBe(url);
    expect(vus[0]!.init?.headers).toEqual({
      accept: 'application/json',
      'user-agent': PARAMETRES.agentUtilisateur.valeur,
    });
    expect(vus[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('REQ-QA-027 : la pause attend la durée demandée, ni plus tôt', async () => {
    vi.useFakeTimers();
    let finie = false;
    const p = pause(300).then(() => (finie = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(finie).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(finie).toBe(true);
  });
});
