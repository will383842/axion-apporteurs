// @req REQ-SEC-012
// @req REQ-INT-014
/**
 * SEC-07 — la frontière des API qu'axionia appelle : `src/app/api/integrations/axionia/**`.
 *
 * CE QUE CHAQUE BLOC JUGE, ET PAR QUEL ACTE.
 *   — REQ-SEC-012 : CHAQUE route du disque sous la frontière est importée telle que Next la charge,
 *     et confrontée, méthode par méthode, à trois appelants refusés — sans jeton, jeton faux,
 *     adresse hors liste. Les trois rendent le MÊME 404, octet pour octet (statut, corps, en-têtes),
 *     jamais un 401 ni un 405 qui confirmeraient la route. Configuration refusée ou liste d'adresses
 *     absente : même 404, aucun accès. Débit non configuré : 503, jamais 200. Chaque appel écrit
 *     exactement une ligne de journal, qui ne porte ni le jeton, ni l'adresse, ni la chaîne reçue.
 *   — REQ-INT-014 : l'appel autorisé rend 200 et EXACTEMENT les champs que le contrat déclare — le
 *     contrat est LU dans le texte de l'exigence, jamais retapé ici. Un lecteur qui glisse un nom ou
 *     un courriel ne fait rien traverser. Un SIREN inconnu et un SIREN libre rendent les mêmes
 *     octets au même instant, sous une horloge injectée.
 *
 * CE QUI N'EST PAS PROUVÉ ICI. Que la page 404 d'un chemin HORS de la frontière soit identique à ce
 * 404-ci (elle est rendue par Next, en HTML) ; que le mandataire de la plateforme écrive bien
 * `X-Forwarded-For` (sans lui, l'en-tête est écrit par le client et la liste d'adresses tombe — le
 * jeton reste). Ni l'une ni l'autre ne se mesure sans serveur déployé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import type { SujetDeCompteur, VerdictDeLimite } from '../../src/server/securite/rate-limit';
import type { HorlogeDePlancher } from '../../src/server/securite/pot-de-miel';
import {
  CHAMPS_DE_LA_REPONSE,
  METHODES_HTTP,
  PLANCHER_LECTURE_MS,
  STATUTS_D_ATTRIBUTION,
  empreinteAdresse,
  traiterAppel,
  type Frontiere,
  type LecteurDAttribution,
  type LimiteurDeLaFrontiere,
} from '../../src/server/integrations/axionia/api-entrante';

// ── Le contrat, LU dans l'exigence ──────────────────────────────────────────────────────────────

const EXIGENCES: { id: string; texte: string }[] = (() => {
  const brut: unknown = JSON.parse(readFileSync('docs/requirements.json', 'utf8'));
  const liste = Array.isArray(brut)
    ? brut
    : ((brut as { requirements?: unknown[]; exigences?: unknown[] }).requirements ??
      (brut as { exigences?: unknown[] }).exigences ??
      []);
  return liste as { id: string; texte: string }[];
})();

function texteDe(id: string): string {
  const e = EXIGENCES.find((x) => x.id === id);
  if (e === undefined) throw new Error(`${id} introuvable dans docs/requirements.json`);
  return e.texte;
}

/** `{statut: libre|attribuee|cliente, until: 'AAAA-MM'|null, apporteurRef: opaque|null}` */
const CONTRAT = (() => {
  const m = /réponse \*\*minimale\*\* `\{([^}]*)\}`/.exec(texteDe('REQ-INT-014'));
  if (m === null) throw new Error('REQ-INT-014 : la forme de la réponse minimale est illisible');
  const champs = (m[1] ?? '').split(/,\s*/).map((c) => {
    const [nom = '', valeur = ''] = c.split(/:\s*/);
    return { nom: nom.trim(), valeur: valeur.trim() };
  });
  const statut = champs.find((c) => c.nom === 'statut');
  return {
    champs: champs.map((c) => c.nom),
    statuts: (statut?.valeur ?? '').split('|'),
  };
})();

/** Le test de forme : il REFUSE un champ en trop comme un champ manquant. */
function formeExacte(corps: unknown): void {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    throw new Error('forme : un objet est attendu');
  }
  const recus = Object.keys(corps).sort();
  const attendus = [...CONTRAT.champs].sort();
  const enTrop = recus.filter((k) => !attendus.includes(k));
  const manquants = attendus.filter((k) => !recus.includes(k));
  if (enTrop.length > 0 || manquants.length > 0) {
    throw new Error(`forme : en trop [${enTrop.join(', ')}], manquants [${manquants.join(', ')}]`);
  }
}

// ── Les fixtures : chaque dimension variée est EXPLICITE (RM-11) ─────────────────────────────────

/** Neuf secrets distincts, dérivés de leur nom : 64 hexadécimaux, donc ≥ 32 octets. */
const SECRETS: Record<string, string> = Object.fromEntries(
  NOMS_DES_SECRETS.map((nom) => [nom, createHash('sha256').update(`temoin.${nom}`).digest('hex')])
);
const JETON = SECRETS.AXIONIA_API_TOKEN ?? '';
const ADRESSE_AUTORISEE = '203.0.113.7';
const ADRESSE_HORS_LISTE = '198.51.100.9';
const ENV_VALIDE: Record<string, string> = {
  NODE_ENV: 'test',
  ...SECRETS,
  AXIONIA_API_ALLOWLIST: `${ADRESSE_AUTORISEE}, 2001:db8:1:2::10`,
};
const SIREN_LIBRE = '123456789';
const SIREN_INCONNU = '987654321';
const SIREN_ATTRIBUE = '111111111';
const REF = '0f8fad5b-d9cb-469f-a165-70867728950e';
const BASE = 'http://partners.test/api/integrations/axionia';

function requete(
  chemin: string,
  methode: string,
  adresse: string | null,
  autorisation: string | null
): Request {
  const entetes = new Headers();
  if (adresse !== null) entetes.set('x-forwarded-for', adresse);
  if (autorisation !== null) entetes.set('authorization', autorisation);
  return new Request(`${BASE}${chemin}`, { method: methode, headers: entetes });
}

interface HorlogeFactice {
  readonly horloge: HorlogeDePlancher;
  avancer(ms: number): void;
  maintenant(): number;
}

function horlogeFactice(depart: number): HorlogeFactice {
  let t = depart;
  return {
    horloge: {
      maintenantMs: () => t,
      attendre: async (ms: number) => {
        t += ms;
      },
    },
    avancer: (ms) => {
      t += ms;
    },
    maintenant: () => t,
  };
}

const ADMIS: LimiteurDeLaFrontiere = async () => ({
  autorise: true,
  restant: 59,
  repriseAt: null,
  panne: false,
  motif: 'admis',
});

function frontiere(
  lire: LecteurDAttribution,
  limiter: LimiteurDeLaFrontiere,
  h: HorlogeFactice,
  lignes: string[],
  environnement: Record<string, string | undefined>
): Frontiere {
  return { environnement, horloge: h.horloge, debit: limiter, lire, puits: (l) => lignes.push(l) };
}

async function instantane(r: Response): Promise<{
  statut: number;
  corps: string;
  entetes: [string, string][];
}> {
  return { statut: r.status, corps: await r.text(), entetes: [...r.headers.entries()] };
}

// ── Les routes du disque ────────────────────────────────────────────────────────────────────────

const RACINE_DES_ROUTES = 'src/app/api/integrations/axionia';

function routesDuDisque(dossier: string): string[] {
  let entrees: string[];
  try {
    entrees = readdirSync(dossier);
  } catch {
    return [];
  }
  return entrees.flatMap((e) => {
    const chemin = join(dossier, e);
    if (statSync(chemin).isDirectory()) return routesDuDisque(chemin);
    return /^route\.[cm]?[jt]sx?$/.test(e) ? [chemin] : [];
  });
}

type ModuleDeRoute = Record<string, unknown>;

async function charger(chemin: string): Promise<ModuleDeRoute> {
  // Un chemin, pas une URL : l'URL encode les crochets d'un segment dynamique (`%5B`), que
  // le chargeur de Vitest ne résout pas.
  return (await import(resolve(chemin).split('\\').join('/'))) as ModuleDeRoute;
}

function methode(mod: ModuleDeRoute, nom: string): (r: Request) => Promise<Response> {
  const f = mod[nom];
  if (typeof f !== 'function') throw new Error(`méthode ${nom} non exportée`);
  return f as (r: Request) => Promise<Response>;
}

/** Un chemin d'appel réel pour chaque route : un segment dynamique reçoit une valeur neutre. */
function cheminDAppel(fichier: string): string {
  const rel = relative(RACINE_DES_ROUTES, fichier).split(/[\\/]/).slice(0, -1);
  const segments = rel.map((s) => (s.startsWith('[') ? 'segment-temoin' : s));
  return `/${segments.join('/')}?siren=${SIREN_LIBRE}`;
}

// ── REQ-SEC-012 ─────────────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-012 — chaque route de la frontière, telle que Next la charge', () => {
  let ecrit: string[];
  beforeEach(() => {
    ecrit = [];
    for (const [k, v] of Object.entries(ENV_VALIDE)) vi.stubEnv(k, v);
    vi.spyOn(process.stderr, 'write').mockImplementation((l: string | Uint8Array) => {
      ecrit.push(String(l));
      return true;
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('REQ-SEC-012 — sans jeton, jeton faux, adresse hors liste : le MÊME 404 sur chaque méthode de chaque route, jamais 401 ni 405', async () => {
    const fichiers = routesDuDisque(RACINE_DES_ROUTES);
    expect(
      fichiers.length,
      'aucune route sous la frontière : rien n’a été confronté'
    ).toBeGreaterThan(0);
    const refuses = [
      { quoi: 'sans jeton', adresse: ADRESSE_AUTORISEE, autorisation: null },
      {
        quoi: 'jeton faux, même longueur',
        adresse: ADRESSE_AUTORISEE,
        autorisation: `Bearer ${'0'.repeat(JETON.length)}`,
      },
      {
        quoi: 'jeton faux, plus court',
        adresse: ADRESSE_AUTORISEE,
        autorisation: `Bearer ${JETON.slice(0, 31)}`,
      },
      { quoi: 'jeton sans le schéma Bearer', adresse: ADRESSE_AUTORISEE, autorisation: JETON },
      {
        quoi: 'adresse hors liste, BON jeton',
        adresse: ADRESSE_HORS_LISTE,
        autorisation: `Bearer ${JETON}`,
      },
      {
        quoi: 'adresse illisible, BON jeton',
        adresse: 'pas-une-adresse',
        autorisation: `Bearer ${JETON}`,
      },
      { quoi: 'aucune adresse, BON jeton', adresse: null, autorisation: `Bearer ${JETON}` },
    ];
    const vus = new Set<string>();
    let confrontations = 0;
    for (const fichier of fichiers) {
      const mod = await charger(fichier);
      for (const m of METHODES_HTTP) {
        for (const r of refuses) {
          const rep = await methode(
            mod,
            m
          )(requete(cheminDAppel(fichier), m, r.adresse, r.autorisation));
          const vu = await instantane(rep);
          expect(vu.statut, `${fichier} ${m} ${r.quoi}`).toBe(404);
          vus.add(JSON.stringify(vu));
          confrontations += 1;
        }
      }
    }
    expect([...vus], 'les refus se distinguent entre eux').toHaveLength(1);
    expect(JSON.parse([...vus][0] ?? '{}')).toEqual({ statut: 404, corps: '', entetes: [] });
    // Rien de ce qui a été reçu ne ressort : ni le jeton, ni l'adresse.
    const journal = ecrit.join('');
    expect(journal).not.toContain(JETON);
    expect(journal).not.toContain(ADRESSE_HORS_LISTE);
    expect(journal).not.toContain(ADRESSE_AUTORISEE);
    console.log(
      `frontière : ${fichiers.length} route(s) confrontée(s) — ${fichiers.map((f) => f.split('\\').join('/')).join(', ')} — ` +
        `${METHODES_HTTP.length} méthodes × ${refuses.length} refus = ${confrontations} appels, un seul 404`
    );
  });

  it('REQ-SEC-012 — chaque route exporte les sept méthodes : aucune n’est laissée au 405 ni à l’OPTIONS automatique de Next', async () => {
    for (const fichier of routesDuDisque(RACINE_DES_ROUTES)) {
      const mod = await charger(fichier);
      for (const m of METHODES_HTTP) expect(typeof mod[m], `${fichier} ${m}`).toBe('function');
    }
    expect([...METHODES_HTTP].sort()).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ]);
  });

  it('REQ-SEC-012 — appelant autorisé, débit non configuré au registre : 503, jamais 200 ; une ligne de journal par appel', async () => {
    const mod = await charger(join(RACINE_DES_ROUTES, 'attributions', 'route.ts'));
    const rep = await methode(
      mod,
      'GET'
    )(requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`));
    expect(rep.status).toBe(503);
    expect(await rep.text()).toBe('');
    const lignes = ecrit.filter((l) => l.includes('"appel_axionia"'));
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? '{}')).toMatchObject({ resultat: 'debit_indisponible' });
  });

  it('REQ-SEC-012 — un chemin inconnu sous la frontière, appelant autorisé : le même 404', async () => {
    const mod = await charger(join(RACINE_DES_ROUTES, '[...inconnu]', 'route.ts'));
    const rep = await methode(
      mod,
      'GET'
    )(requete('/n-existe-pas', 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`));
    expect(await instantane(rep)).toEqual({ statut: 404, corps: '', entetes: [] });
  });
});

describe('REQ-SEC-012 — la configuration échoue FERMÉE', () => {
  const variantes: { quoi: string; env: Record<string, string | undefined> }[] = [
    { quoi: 'jeton absent', env: { ...ENV_VALIDE, AXIONIA_API_TOKEN: undefined } },
    { quoi: 'jeton de 31 octets', env: { ...ENV_VALIDE, AXIONIA_API_TOKEN: 'j'.repeat(31) } },
    { quoi: 'sel d’adresse absent', env: { ...ENV_VALIDE, IP_HASH_SALT: undefined } },
    { quoi: 'liste d’adresses absente', env: { ...ENV_VALIDE, AXIONIA_API_ALLOWLIST: undefined } },
    { quoi: 'liste d’adresses vide', env: { ...ENV_VALIDE, AXIONIA_API_ALLOWLIST: '' } },
    {
      quoi: 'liste d’adresses dont une entrée est illisible',
      env: { ...ENV_VALIDE, AXIONIA_API_ALLOWLIST: `${ADRESSE_AUTORISEE}, 10.0.0.300` },
    },
  ];
  for (const v of variantes) {
    it(`REQ-SEC-012 — ${v.quoi} : l'appelant qui présente le jeton de l'environnement valide reçoit 404`, async () => {
      const h = horlogeFactice(1_000_000);
      const lignes: string[] = [];
      let lu = 0;
      const rep = await traiterAppel(
        requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
        'attributions',
        frontiere(
          async () => {
            lu += 1;
            return null;
          },
          ADMIS,
          h,
          lignes,
          v.env
        )
      );
      expect(await instantane(rep)).toEqual({ statut: 404, corps: '', entetes: [] });
      expect(lu, 'la lecture ne doit pas avoir lieu').toBe(0);
      expect(lignes).toHaveLength(1);
    });
  }
});

describe('REQ-SEC-012 — le débit : 60 par minute, après l’authentification', () => {
  it('REQ-SEC-012 — le compteur reçoit l’empreinte de l’adresse, jamais l’adresse ; limite atteinte → 429 sans lecture', async () => {
    const h = horlogeFactice(1_000_000);
    const lignes: string[] = [];
    const sujets: SujetDeCompteur[] = [];
    let lu = 0;
    const plein: LimiteurDeLaFrontiere = async (sujet): Promise<VerdictDeLimite> => {
      sujets.push(sujet);
      return {
        autorise: false,
        restant: 0,
        repriseAt: 1_030_000,
        panne: false,
        motif: 'limite_atteinte',
      };
    };
    const rep = await traiterAppel(
      requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
      'attributions',
      frontiere(
        async () => {
          lu += 1;
          return null;
        },
        plein,
        h,
        lignes,
        ENV_VALIDE
      )
    );
    expect(rep.status).toBe(429);
    expect(rep.headers.get('retry-after')).toBe('30');
    expect(lu).toBe(0);
    expect(sujets).toEqual([empreinteAdresse(ADRESSE_AUTORISEE, SECRETS.IP_HASH_SALT ?? '')]);
    expect(sujets[0]).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.parse(lignes[0] ?? '{}')).toMatchObject({ resultat: 'debit_depasse' });
  });

  it('REQ-SEC-012 — un appelant refusé ne consomme pas le débit : il reçoit 404, jamais 429', async () => {
    const h = horlogeFactice(1_000_000);
    let consulte = 0;
    const rep = await traiterAppel(
      requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, null),
      'attributions',
      frontiere(
        async () => null,
        async (s, t) => {
          consulte += 1;
          return ADMIS(s, t);
        },
        h,
        [],
        ENV_VALIDE
      )
    );
    expect(rep.status).toBe(404);
    expect(consulte).toBe(0);
  });

  it('REQ-SEC-012 — l’empreinte d’adresse suit partners/ADR-0013 : HMAC-SHA256 sous le sel, séparée par domaine, 16 hexadécimaux', () => {
    const e = empreinteAdresse(ADRESSE_AUTORISEE, 'sel-temoin');
    expect(e).toMatch(/^[0-9a-f]{16}$/);
    expect(e).not.toBe(empreinteAdresse(ADRESSE_AUTORISEE, 'autre-sel'));
    expect(e).not.toBe(createHash('sha256').update(ADRESSE_AUTORISEE).digest('hex').slice(0, 16));
  });
});

// ── REQ-INT-014 ─────────────────────────────────────────────────────────────────────────────────

describe('REQ-INT-014 — la réponse minimale, et rien d’autre', () => {
  it('REQ-INT-014 — le contrat est lu dans l’exigence, et le code déclare exactement ses champs et ses statuts', () => {
    expect(CONTRAT.champs).toEqual(['statut', 'until', 'apporteurRef']);
    expect([...CHAMPS_DE_LA_REPONSE].sort()).toEqual([...CONTRAT.champs].sort());
    expect([...STATUTS_D_ATTRIBUTION].sort()).toEqual([...CONTRAT.statuts].sort());
  });

  it('REQ-INT-014 — le test de forme refuse un champ en trop et un champ manquant (témoin)', () => {
    const juste = { statut: 'attribuee', until: '2027-03', apporteurRef: REF };
    expect(() => formeExacte(juste)).not.toThrow();
    expect(() => formeExacte({ ...juste, nom: 'Martin' })).toThrow(/en trop \[nom\]/);
    expect(() => formeExacte({ statut: 'libre', until: null })).toThrow(
      /manquants \[apporteurRef\]/
    );
  });

  it('REQ-INT-014 — appel autorisé : 200, exactement les champs du contrat, une ligne de journal (siren, ipHash, résultat)', async () => {
    const h = horlogeFactice(1_000_000);
    const lignes: string[] = [];
    const rep = await traiterAppel(
      requete(`/attributions?siren=${SIREN_ATTRIBUE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
      'attributions',
      frontiere(
        async (siren) =>
          siren === SIREN_ATTRIBUE
            ? { statut: 'attribuee', until: '2027-03', apporteurRef: REF }
            : null,
        ADMIS,
        h,
        lignes,
        ENV_VALIDE
      )
    );
    expect(rep.status).toBe(200);
    expect(rep.headers.get('content-type')).toMatch(/^application\/json/);
    const corps: unknown = await rep.json();
    formeExacte(corps);
    expect(corps).toEqual({ statut: 'attribuee', until: '2027-03', apporteurRef: REF });
    expect(lignes).toHaveLength(1);
    const ligne = JSON.parse(lignes[0] ?? '{}') as Record<string, unknown>;
    expect(Object.keys(ligne).sort()).toEqual(
      ['ipHash', 'plancherDepasse', 'resultat', 'route', 'signal', 'siren', 'survenuAt'].sort()
    );
    expect(ligne).toMatchObject({
      signal: 'appel_axionia',
      route: 'attributions',
      resultat: 'attribuee',
      siren: SIREN_ATTRIBUE,
      ipHash: empreinteAdresse(ADRESSE_AUTORISEE, SECRETS.IP_HASH_SALT ?? ''),
      plancherDepasse: false,
    });
  });

  it('REQ-INT-014 — un lecteur qui glisse nom, prénom et courriel : RIEN ne traverse, la réponse est refusée', async () => {
    const fuites: { quoi: string; lu: Record<string, unknown> }[] = [
      {
        quoi: 'champs de personne en plus',
        lu: {
          statut: 'attribuee',
          until: '2027-03',
          apporteurRef: REF,
          nom: 'Martin',
          prenom: 'Sophie',
          email: 'sophie.martin@example.test',
        },
      },
      {
        quoi: 'un nom à la place de la référence',
        lu: { statut: 'attribuee', until: '2027-03', apporteurRef: 'Sophie Martin' },
      },
      {
        quoi: 'un courriel à la place de la référence',
        lu: { statut: 'attribuee', until: '2027-03', apporteurRef: 'sophie.martin@example.test' },
      },
      {
        quoi: 'un nom dans l’échéance',
        lu: { statut: 'attribuee', until: 'Sophie', apporteurRef: REF },
      },
      {
        quoi: 'un statut hors du contrat',
        lu: { statut: 'suivie', until: null, apporteurRef: null },
      },
      {
        quoi: 'un « libre » qui porte une référence',
        lu: { statut: 'libre', until: null, apporteurRef: REF },
      },
      {
        quoi: 'un « libre » qui porte une échéance',
        lu: { statut: 'libre', until: '2027-03', apporteurRef: null },
      },
    ];
    for (const f of fuites) {
      const lignes: string[] = [];
      const rep = await traiterAppel(
        requete(
          `/attributions?siren=${SIREN_ATTRIBUE}`,
          'GET',
          ADRESSE_AUTORISEE,
          `Bearer ${JETON}`
        ),
        'attributions',
        frontiere(async () => f.lu, ADMIS, horlogeFactice(1_000_000), lignes, ENV_VALIDE)
      );
      const vu = await instantane(rep);
      expect(vu.statut, f.quoi).toBe(503);
      expect(vu.corps, f.quoi).toBe('');
      expect(lignes.join(''), f.quoi).not.toMatch(/Sophie|Martin|example\.test/);
      expect(JSON.parse(lignes[0] ?? '{}'), f.quoi).toMatchObject({
        resultat: 'reponse_non_conforme',
      });
    }
  });

  it('REQ-INT-014 — SIREN inconnu et SIREN libre : mêmes octets, mêmes en-têtes, même instant, quelle que soit la durée de la lecture', async () => {
    const mesurer = async (siren: string, dureeDeLecture: number, lu: unknown) => {
      const h = horlogeFactice(5_000_000);
      const lignes: string[] = [];
      const debut = h.maintenant();
      const rep = await traiterAppel(
        requete(`/attributions?siren=${siren}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
        'attributions',
        frontiere(
          async () => {
            h.avancer(dureeDeLecture);
            return lu;
          },
          ADMIS,
          h,
          lignes,
          ENV_VALIDE
        )
      );
      return { vu: await instantane(rep), duree: h.maintenant() - debut, lignes };
    };
    const inconnu = await mesurer(SIREN_INCONNU, 2, null);
    const libre = await mesurer(SIREN_LIBRE, 37, {
      statut: 'libre',
      until: null,
      apporteurRef: null,
    });
    expect(inconnu.vu.statut).toBe(200);
    expect(inconnu.vu).toEqual(libre.vu);
    expect(JSON.parse(inconnu.vu.corps)).toEqual({
      statut: 'libre',
      until: null,
      apporteurRef: null,
    });
    expect(inconnu.duree).toBe(PLANCHER_LECTURE_MS);
    expect(libre.duree).toBe(PLANCHER_LECTURE_MS);
    // Le journal, lui, ne les distingue pas non plus : le résultat est `libre` des deux côtés.
    expect(JSON.parse(inconnu.lignes[0] ?? '{}')).toMatchObject({ resultat: 'libre' });
    expect(JSON.parse(libre.lignes[0] ?? '{}')).toMatchObject({ resultat: 'libre' });
  });

  it('REQ-INT-014 — une lecture plus lente que le plancher se dit au journal, elle ne se tait pas', async () => {
    const h = horlogeFactice(1_000_000);
    const lignes: string[] = [];
    await traiterAppel(
      requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
      'attributions',
      frontiere(
        async () => {
          h.avancer(PLANCHER_LECTURE_MS + 1);
          return null;
        },
        ADMIS,
        h,
        lignes,
        ENV_VALIDE
      )
    );
    expect(JSON.parse(lignes[0] ?? '{}')).toMatchObject({
      resultat: 'libre',
      plancherDepasse: true,
    });
  });

  it('REQ-INT-014 — une lecture qui lève rend 503 au plancher, jamais « libre »', async () => {
    const h = horlogeFactice(1_000_000);
    const lignes: string[] = [];
    const debut = h.maintenant();
    const rep = await traiterAppel(
      requete(`/attributions?siren=${SIREN_LIBRE}`, 'GET', ADRESSE_AUTORISEE, `Bearer ${JETON}`),
      'attributions',
      frontiere(
        async () => {
          throw new Error(`base indisponible pour ${SIREN_LIBRE}`);
        },
        ADMIS,
        h,
        lignes,
        ENV_VALIDE
      )
    );
    expect(await instantane(rep)).toEqual({ statut: 503, corps: '', entetes: [] });
    expect(h.maintenant() - debut).toBe(PLANCHER_LECTURE_MS);
    expect(lignes.join('')).not.toContain('base indisponible');
    expect(JSON.parse(lignes[0] ?? '{}')).toMatchObject({ resultat: 'lecture_indisponible' });
  });

  it('REQ-INT-014 — un SIREN hors forme : 400 sans lecture, et le journal ne recopie pas la chaîne reçue', async () => {
    for (const brut of ['12345678', '1234567890', '12345678a', `${SIREN_LIBRE}\n{"forge":1}`, '']) {
      const lignes: string[] = [];
      let lu = 0;
      const rep = await traiterAppel(
        requete(
          `/attributions?siren=${encodeURIComponent(brut)}`,
          'GET',
          ADRESSE_AUTORISEE,
          `Bearer ${JETON}`
        ),
        'attributions',
        frontiere(
          async () => {
            lu += 1;
            return null;
          },
          ADMIS,
          horlogeFactice(1),
          lignes,
          ENV_VALIDE
        )
      );
      expect(rep.status, JSON.stringify(brut)).toBe(400);
      expect(lu).toBe(0);
      const ligne = JSON.parse(lignes[0] ?? '{}') as Record<string, unknown>;
      expect(ligne).toMatchObject({ resultat: 'siren_invalide', siren: null });
      expect(lignes[0]).not.toContain('forge');
    }
  });
});
