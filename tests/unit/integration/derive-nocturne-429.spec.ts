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
import { describe, it, expect } from 'vitest';
import {
  mesurer,
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
    expect(appels.filter((u) => u === URL_CIBLE).length).toBeGreaterThan(1);
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
