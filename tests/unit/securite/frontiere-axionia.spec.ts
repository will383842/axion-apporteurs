// @req REQ-SEC-012
// @req REQ-INT-014
// @req REQ-QA-030
/**
 * `frontiere-axionia.spec.ts` — la frontière des API qu'axionia appelle, EN PROCESSUS.
 *
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `tests/integration/frontiere.spec.ts`. Le témoin
 * d'intégration charge les routes du disque telles que Next les sert ; le bac à sable de mutation
 * (`vitest.mutation.config.ts`) ne joue pas `tests/integration/`, et `traiterAppel` y sortait « sans
 * couverture ». Or `traiterAppel` reçoit TOUT par sa `Frontiere` (environnement, horloge, débit,
 * lecture, puits) : chaque branche se juge ici, sans serveur, et chaque verdict est lu sur une
 * valeur EXACTE — statut, corps, en-têtes, et la ligne de journal ENTIÈRE, champ par champ.
 *
 * CE QUI N'EST PAS REJUGÉ ICI : que les fichiers de route du disque exportent les sept méthodes et
 * passent par ce chemin — c'est le témoin d'intégration, qui les importe tels que Next les charge.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import type { HorlogeDePlancher } from '../../../src/server/securite/pot-de-miel';
import { limiteNonDeclaree } from '../../../src/server/securite/primitives-de-porte';
import {
  limiter,
  sujetDepuisEmpreinte,
  type VerdictDeLimite,
} from '../../../src/server/securite/rate-limit';

// Un ESPION sur `limiter`, qui délègue au vrai compteur : le témoin du nom de compteur de la
// frontière lit ses arguments, et tous les autres tests gardent le comportement réel.
vi.mock('../../../src/server/securite/rate-limit', async (original) => {
  const vrai = await original<typeof import('../../../src/server/securite/rate-limit')>();
  return { ...vrai, limiter: vi.fn(vrai.limiter) };
});
import {
  CHAMPS_DE_LA_REPONSE,
  METHODES_HTTP,
  PLANCHER_LECTURE_MS,
  RESULTATS_D_APPEL,
  ROUTES_DE_LA_FRONTIERE,
  STATUTS_D_ATTRIBUTION,
  VARIABLE_DE_LA_LISTE,
  empreinteAdresse,
  frontiereDeProduction,
  gestionnaires,
  refus,
  schemaReponseAttribution,
  traiterAppel,
  type Frontiere,
  type LecteurDAttribution,
  type LimiteurDeLaFrontiere,
  type RouteDeLaFrontiere,
} from '../../../src/server/integrations/axionia/api-entrante';
import { lecteurDeProduction } from '../../../src/server/integrations/axionia/attributions-dto';

// ── Les fixtures : chaque dimension variée est EXPLICITE ────────────────────────────────────────

/** Des secrets distincts, dérivés de leur nom : 64 hexadécimaux, donc ≥ 32 octets. */
const SECRETS: Record<string, string> = Object.fromEntries(
  NOMS_DES_SECRETS.map((nom) => [nom, createHash('sha256').update(`unitaire.${nom}`).digest('hex')])
);
const JETON = SECRETS.AXIONIA_API_TOKEN ?? '';
const SEL = SECRETS.IP_HASH_SALT ?? '';
const ADRESSE = '203.0.113.7';
const ADRESSE_BIS = '203.0.113.8';
const ADRESSE_HORS_LISTE = '198.51.100.9';
const ENV_VALIDE: Record<string, string> = {
  NODE_ENV: 'test',
  ...SECRETS,
  AXIONIA_API_ALLOWLIST: `${ADRESSE},${ADRESSE_BIS} , 2001:db8:1:2::10`,
};
const SIREN = '123456789';
const REF = '0f8fad5b-d9cb-469f-a165-70867728950e';
const DEPART = Date.UTC(2026, 8, 30, 12, 0, 0);
const INSTANT = new Date(DEPART).toISOString();
/** Après une lecture : le journal est écrit à la fin du chemin, donc au plancher. */
const AU_PLANCHER = new Date(DEPART + PLANCHER_LECTURE_MS).toISOString();
const a = (ms: number): string => new Date(DEPART + ms).toISOString();
const BASE = 'http://partners.test/api/integrations/axionia';

function requete(
  options: {
    chemin?: string;
    methode?: string;
    adresse?: string | null;
    autorisation?: string | null;
    kid?: string | null;
  } = {}
): Request {
  const entetes = new Headers();
  const adresse = options.adresse === undefined ? ADRESSE : options.adresse;
  const autorisation =
    options.autorisation === undefined ? `Bearer ${JETON}` : options.autorisation;
  const kid = options.kid === undefined ? kidDe(JETON) : options.kid;
  if (adresse !== null) entetes.set('x-forwarded-for', adresse);
  if (autorisation !== null) entetes.set('authorization', autorisation);
  if (kid !== null) entetes.set(ENTETE_KID_AXIONIA, kid);
  return new Request(`${BASE}${options.chemin ?? `/attributions?siren=${SIREN}`}`, {
    method: options.methode ?? 'GET',
    headers: entetes,
  });
}

interface Monde {
  readonly frontiere: Frontiere;
  readonly lignes: string[];
  readonly lectures: string[];
  readonly debits: { sujet: unknown; maintenantMs: number }[];
  maintenant(): number;
}

const ADMIS: VerdictDeLimite = {
  autorise: true,
  restant: 59,
  repriseAt: null,
  panne: false,
  motif: 'admis',
};

function monde(
  options: {
    lire?: LecteurDAttribution;
    debit?: LimiteurDeLaFrontiere;
    environnement?: Record<string, string | undefined>;
    dureeDeLecture?: number;
  } = {}
): Monde {
  let t = DEPART;
  const lignes: string[] = [];
  const lectures: string[] = [];
  const debits: { sujet: unknown; maintenantMs: number }[] = [];
  const horloge: HorlogeDePlancher = {
    maintenantMs: () => t,
    attendre: async (ms: number) => {
      t += ms;
    },
  };
  const lire = options.lire ?? (async () => null);
  return {
    frontiere: {
      environnement: options.environnement ?? ENV_VALIDE,
      horloge,
      debit:
        options.debit ??
        (async (sujet, maintenantMs) => {
          debits.push({ sujet, maintenantMs });
          return ADMIS;
        }),
      lire: async (siren) => {
        lectures.push(siren);
        t += options.dureeDeLecture ?? 0;
        return lire(siren);
      },
      puits: (l) => lignes.push(l),
    },
    lignes,
    lectures,
    debits,
    maintenant: () => t,
  };
}

async function vu(r: Response): Promise<{ statut: number; corps: string; entetes: string[][] }> {
  return { statut: r.status, corps: await r.text(), entetes: [...r.headers.entries()] };
}

const REFUS = { statut: 404, corps: '', entetes: [] };
const IP_HASH = empreinteAdresse(ADRESSE, SEL);

/** La ligne de journal ENTIÈRE attendue : un champ en trop ou en moins la rend fausse. */
function ligne(
  resultat: string,
  autres: { route?: RouteDeLaFrontiere; siren?: string | null; ipHash?: string | null } = {},
  plancherDepasse = false,
  survenuAt = INSTANT
): Record<string, unknown> {
  return {
    signal: 'appel_axionia',
    route: autres.route ?? 'attributions',
    resultat,
    siren: autres.siren === undefined ? SIREN : autres.siren,
    ipHash: autres.ipHash === undefined ? IP_HASH : autres.ipHash,
    survenuAt,
    plancherDepasse,
  };
}

function journal(m: Monde): unknown[] {
  return m.lignes.map((l) => JSON.parse(l) as unknown);
}

// ── Le vocabulaire fermé ────────────────────────────────────────────────────────────────────────

describe('REQ-SEC-012 — le vocabulaire fermé de la frontière', () => {
  it('les méthodes, les routes, les statuts, les résultats et la variable de liste sont exactement ceux-ci', () => {
    expect(METHODES_HTTP).toEqual(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
    expect(ROUTES_DE_LA_FRONTIERE).toEqual(['attributions', 'inconnue']);
    expect(STATUTS_D_ATTRIBUTION).toEqual(['libre', 'attribuee', 'cliente']);
    expect(RESULTATS_D_APPEL).toEqual([
      'configuration_refusee',
      'adresse_hors_liste',
      'jeton_refuse',
      'methode_refusee',
      'route_inconnue',
      'debit_depasse',
      'debit_indisponible',
      'siren_invalide',
      'lecture_indisponible',
      'reponse_non_conforme',
      'libre',
      'attribuee',
      'cliente',
    ]);
    expect(VARIABLE_DE_LA_LISTE).toBe('AXIONIA_API_ALLOWLIST');
    expect(PLANCHER_LECTURE_MS).toBe(150);
    expect(CHAMPS_DE_LA_REPONSE).toEqual(['statut', 'until', 'apporteurRef', 'nomAffichable']);
  });

  it('le refus unique : 404, corps vide, aucun en-tête — un objet neuf à chaque appel', async () => {
    const a = refus();
    const b = refus();
    expect(a).not.toBe(b);
    expect(await vu(a)).toEqual(REFUS);
    expect(a.body).toBeNull();
  });

  it('l’empreinte d’adresse : HMAC-SHA256 sous le sel, domaine `partners.ip.v1`, 16 hexadécimaux — valeur exacte', () => {
    expect(empreinteAdresse('203.0.113.7', 'sel-temoin')).toBe('899bfd16c521060f');
    expect(empreinteAdresse('203.0.113.7', 'autre-sel')).not.toBe('899bfd16c521060f');
    expect(empreinteAdresse('203.0.113.7', 'sel-temoin')).toHaveLength(16);
  });
});

// ── La réponse minimale ─────────────────────────────────────────────────────────────────────────

describe('REQ-INT-014 — la forme de la réponse, jugée par le schéma', () => {
  const juste = {
    statut: 'attribuee',
    until: '2027-03',
    apporteurRef: REF,
    nomAffichable: 'Paul D.',
  };
  it.each([
    ['attribuée, échéance et référence', juste],
    [
      'cliente, sans échéance, le porteur nommé',
      { statut: 'cliente', until: null, apporteurRef: REF, nomAffichable: 'Paul D.' },
    ],
    [
      'cliente, sans échéance, nom illisible (A02)',
      { statut: 'cliente', until: null, apporteurRef: REF, nomAffichable: null },
    ],
    ['attribuée, décembre', { ...juste, until: '2027-12' }],
    ['attribuée, octobre', { ...juste, until: '2027-10' }],
    ['attribuée, janvier', { ...juste, until: '2027-01' }],
    ['libre, nue', { statut: 'libre', until: null, apporteurRef: null, nomAffichable: null }],
    ['attribuée, prénom composé', { ...juste, nomAffichable: 'Jean-Paul D.' }],
    ['attribuée, nom illisible (A02)', { ...juste, nomAffichable: null }],
    ['attribuée, fin pas encore fixée (A02)', { ...juste, until: null }],
  ])('acceptée : %s', (_q, r) => {
    expect(schemaReponseAttribution.safeParse(r).success).toBe(true);
  });
  it.each([
    ['mois 13', { ...juste, until: '2027-13' }],
    ['mois 00', { ...juste, until: '2027-00' }],
    ['mois sur un chiffre', { ...juste, until: '2027-3' }],
    ['préfixe avant l’année', { ...juste, until: 'x2027-03' }],
    ['suffixe après le mois', { ...juste, until: '2027-03x' }],
    ['année sur trois chiffres', { ...juste, until: '027-03' }],
    ['référence qui n’est pas un UUID', { ...juste, apporteurRef: 'Sophie Martin' }],
    ['champ en plus', { ...juste, nom: 'Martin' }],
    [
      'statut hors contrat',
      { statut: 'suivie', until: null, apporteurRef: null, nomAffichable: null },
    ],
    [
      'libre avec une échéance',
      { statut: 'libre', until: '2027-03', apporteurRef: null, nomAffichable: null },
    ],
    [
      'libre avec une référence',
      { statut: 'libre', until: null, apporteurRef: REF, nomAffichable: null },
    ],
    [
      'libre avec un nom',
      { statut: 'libre', until: null, apporteurRef: null, nomAffichable: 'Paul D.' },
    ],
    ['nom affichable absent', { statut: 'attribuee', until: '2027-03', apporteurRef: REF }],
    ['cliente avec une échéance', { ...juste, statut: 'cliente' }],
    [
      'cliente sans référence',
      { statut: 'cliente', until: null, apporteurRef: null, nomAffichable: 'Paul D.' },
    ],
    ['attribuée sans référence', { ...juste, apporteurRef: null }],
    ['le nom entier au lieu de l’initiale', { ...juste, nomAffichable: 'Paul Durand' }],
    ['un prénom seul', { ...juste, nomAffichable: 'Paul' }],
    ['plus de 64 caractères', { ...juste, nomAffichable: `${'A'.repeat(62)} D.` }],
  ])('refusée : %s', (_q, r) => {
    expect(schemaReponseAttribution.safeParse(r).success).toBe(false);
  });
});

// ── Le chemin d'un appel, étape par étape ───────────────────────────────────────────────────────

describe('REQ-SEC-012 — 1. la configuration échoue fermée', () => {
  it.each([
    ['jeu de secrets refusé (jeton absent)', { ...ENV_VALIDE, AXIONIA_API_TOKEN: undefined }],
    [
      'trousseau refusé (clé précédente sans échéance)',
      { ...ENV_VALIDE, AXIONIA_API_TOKEN_PRECEDENT: 'p'.repeat(64) },
    ],
  ])('%s : 404, une ligne sans empreinte, rien n’est lu', async (_q, environnement) => {
    const m = monde({ environnement });
    expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual(REFUS);
    expect(journal(m)).toEqual([ligne('configuration_refusee', { ipHash: null })]);
    expect(m.lectures).toEqual([]);
    expect(m.debits).toEqual([]);
  });

  it.each([
    ['absente', undefined],
    ['vide', ''],
    ['faite d’espaces', '   '],
    ['dont une entrée est illisible', `${ADRESSE}, 10.0.0.300`],
    ['dont une entrée est vide', `${ADRESSE},,${ADRESSE_BIS}`],
  ])(
    'liste d’adresses %s : 404, et l’empreinte de l’appelant est déjà au journal',
    async (_q, liste) => {
      const m = monde({ environnement: { ...ENV_VALIDE, [VARIABLE_DE_LA_LISTE]: liste } });
      expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual(REFUS);
      expect(journal(m)).toEqual([ligne('configuration_refusee')]);
      expect(m.lectures).toEqual([]);
    }
  );
});

describe('REQ-SEC-012 — 2. l’adresse, lue à droite de X-Forwarded-For', () => {
  it('hors liste : 404, l’empreinte au journal est celle de l’adresse reçue', async () => {
    const m = monde();
    const r = await traiterAppel(
      requete({ adresse: ADRESSE_HORS_LISTE }),
      'attributions',
      m.frontiere
    );
    expect(await vu(r)).toEqual(REFUS);
    expect(journal(m)).toEqual([
      ligne('adresse_hors_liste', { ipHash: empreinteAdresse(ADRESSE_HORS_LISTE, SEL) }),
    ]);
  });

  it.each([
    ['absente', null],
    ['illisible', 'pas-une-adresse'],
  ])('%s : 404, empreinte nulle', async (_q, adresse) => {
    const m = monde();
    expect(await vu(await traiterAppel(requete({ adresse }), 'attributions', m.frontiere))).toEqual(
      REFUS
    );
    expect(journal(m)).toEqual([ligne('adresse_hors_liste', { ipHash: null })]);
  });

  it('la liste est découpée et chaque entrée rognée : la 2e adresse et l’IPv6 du même /64 entrent', async () => {
    for (const adresse of [ADRESSE_BIS, '2001:db8:1:2::99']) {
      const m = monde();
      const r = await traiterAppel(requete({ adresse }), 'attributions', m.frontiere);
      expect(r.status, adresse).toBe(200);
    }
  });

  it('seule l’entrée la plus à droite compte : une adresse forgée à gauche ne fait pas entrer', async () => {
    const m = monde();
    const r = await traiterAppel(
      requete({ adresse: `${ADRESSE}, ${ADRESSE_HORS_LISTE}` }),
      'attributions',
      m.frontiere
    );
    expect(r.status).toBe(404);
    expect(journal(m)).toEqual([
      ligne('adresse_hors_liste', { ipHash: empreinteAdresse(ADRESSE_HORS_LISTE, SEL) }),
    ]);
  });
});

describe('REQ-SEC-012, REQ-QA-030 — 3. le jeton, à la clé que désigne le kid', () => {
  it.each([
    ['absent', { autorisation: null }],
    ['sans le schéma Bearer', { autorisation: JETON }],
    ['schéma en minuscules', { autorisation: `bearer ${JETON}` }],
    ['précédé d’un texte', { autorisation: `x Bearer ${JETON}` }],
    ['suivi d’un second mot', { autorisation: `Bearer ${JETON} encore` }],
    ['Bearer seul', { autorisation: 'Bearer ' }],
    ['faux, même longueur', { autorisation: `Bearer ${'0'.repeat(JETON.length)}` }],
    ['bon jeton, sans kid', { kid: null }],
    ['bon jeton, kid inconnu', { kid: '00000000' }],
  ])('%s : 404, et le débit n’est jamais consulté', async (_q, options) => {
    const m = monde();
    expect(await vu(await traiterAppel(requete(options), 'attributions', m.frontiere))).toEqual(
      REFUS
    );
    expect(journal(m)).toEqual([ligne('jeton_refuse')]);
    expect(m.debits).toEqual([]);
  });

  it('le jeton précédent passe sous son kid avant l’échéance, et plus à l’échéance', async () => {
    const PRECEDENT = createHash('sha256').update('unitaire.precedent').digest('hex');
    const environnement = {
      ...ENV_VALIDE,
      AXIONIA_API_TOKEN_PRECEDENT: PRECEDENT,
      AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: new Date(DEPART + 1).toISOString(),
    };
    const avant = monde({ environnement });
    const r = await traiterAppel(
      requete({ autorisation: `Bearer ${PRECEDENT}`, kid: kidDe(PRECEDENT) }),
      'attributions',
      avant.frontiere
    );
    expect(r.status).toBe(200);
    const echu = monde({
      environnement: {
        ...environnement,
        AXIONIA_API_TOKEN_PRECEDENT_ECHEANCE: new Date(DEPART).toISOString(),
      },
    });
    const r2 = await traiterAppel(
      requete({ autorisation: `Bearer ${PRECEDENT}`, kid: kidDe(PRECEDENT) }),
      'attributions',
      echu.frontiere
    );
    expect(r2.status).toBe(404);
  });
});

describe('REQ-SEC-012 — 4. la méthode, puis la route', () => {
  it.each(METHODES_HTTP.filter((m) => m !== 'GET'))(
    '%s authentifié : 404 « methode_refusee », sans débit ni lecture',
    async (methode) => {
      const m = monde();
      expect(
        await vu(await traiterAppel(requete({ methode }), 'attributions', m.frontiere))
      ).toEqual(REFUS);
      expect(journal(m)).toEqual([ligne('methode_refusee')]);
      expect(m.debits).toEqual([]);
    }
  );

  it('GET authentifié sur la route inconnue : 404 « route_inconnue », le journal nomme la route', async () => {
    const m = monde();
    expect(
      await vu(await traiterAppel(requete({ chemin: '/n-existe-pas' }), 'inconnue', m.frontiere))
    ).toEqual(REFUS);
    expect(journal(m)).toEqual([ligne('route_inconnue', { route: 'inconnue', siren: null })]);
    expect(m.debits).toEqual([]);
  });
});

describe('REQ-SEC-012 — 5. le débit, après l’authentification', () => {
  it('le compteur reçoit l’empreinte exacte et l’instant exact', async () => {
    const m = monde();
    await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(m.debits).toEqual([{ sujet: IP_HASH, maintenantMs: DEPART }]);
  });

  it('un compteur qui lève : 503 sans corps, « debit_indisponible », aucune lecture', async () => {
    const m = monde({
      debit: async () => {
        throw new Error('cache injoignable');
      },
    });
    expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual({
      statut: 503,
      corps: '',
      entetes: [],
    });
    expect(journal(m)).toEqual([ligne('debit_indisponible')]);
    expect(m.lectures).toEqual([]);
  });

  it('un compteur en panne : 503, « debit_indisponible » — le débit de production aussi', async () => {
    const m = monde({ debit: limiteNonDeclaree });
    expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual({
      statut: 503,
      corps: '',
      entetes: [],
    });
    expect(journal(m)).toEqual([ligne('debit_indisponible')]);
    expect(m.lectures).toEqual([]);
  });

  it.each([
    ['reprise dans 30 s', DEPART + 30_000, '30'],
    ['reprise dans 1,5 s : arrondi au-dessus', DEPART + 1_500, '2'],
    ['reprise dans 1 ms : au moins 1 s', DEPART + 1, '1'],
    ['reprise déjà passée : au moins 1 s', DEPART - 5_000, '1'],
  ])('limite atteinte, %s : 429, Retry-After %s', async (_q, repriseAt, attendu) => {
    const m = monde({
      debit: async () => ({
        autorise: false,
        restant: 0,
        repriseAt,
        panne: false,
        motif: 'limite_atteinte',
      }),
    });
    expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual({
      statut: 429,
      corps: '',
      entetes: [['retry-after', attendu]],
    });
    expect(journal(m)).toEqual([ligne('debit_depasse')]);
    expect(m.lectures).toEqual([]);
  });

  it('limite atteinte sans instant de reprise : 429 sans Retry-After', async () => {
    const m = monde({
      debit: async () => ({
        autorise: false,
        restant: 0,
        repriseAt: null,
        panne: false,
        motif: 'limite_atteinte',
      }),
    });
    expect(await vu(await traiterAppel(requete(), 'attributions', m.frontiere))).toEqual({
      statut: 429,
      corps: '',
      entetes: [],
    });
  });
});

describe('REQ-INT-014 — 6. le SIREN, puis la lecture au plancher', () => {
  it.each([
    ['huit chiffres', '12345678'],
    ['dix chiffres', '1234567890'],
    ['une lettre à la fin', '12345678a'],
    ['une lettre au début', 'a12345678'],
    ['vide', ''],
  ])(
    'SIREN %s : 400 sans corps, jamais lu, et le journal porte `siren: null`',
    async (_q, brut) => {
      const m = monde();
      const r = await traiterAppel(
        requete({ chemin: `/attributions?siren=${encodeURIComponent(brut)}` }),
        'attributions',
        m.frontiere
      );
      expect(await vu(r)).toEqual({ statut: 400, corps: '', entetes: [] });
      expect(journal(m)).toEqual([ligne('siren_invalide', { siren: null })]);
      expect(m.lectures).toEqual([]);
    }
  );

  it('sans paramètre `siren` : 400, `siren: null`', async () => {
    const m = monde();
    const r = await traiterAppel(requete({ chemin: '/attributions' }), 'attributions', m.frontiere);
    expect(r.status).toBe(400);
    expect(journal(m)).toEqual([ligne('siren_invalide', { siren: null })]);
  });

  it('SIREN inconnu : 200, le corps « libre » EXACT, l’en-tête JSON exact, au plancher', async () => {
    const m = monde();
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(await vu(r)).toEqual({
      statut: 200,
      corps: '{"statut":"libre","until":null,"apporteurRef":null,"nomAffichable":null}',
      entetes: [['content-type', 'application/json; charset=utf-8']],
    });
    expect(m.lectures).toEqual([SIREN]);
    expect(m.maintenant() - DEPART).toBe(PLANCHER_LECTURE_MS);
    expect(journal(m)).toEqual([ligne('libre', {}, false, AU_PLANCHER)]);
  });

  it('SIREN attribué : 200, le corps reconstruit champ par champ, dans l’ordre du contrat', async () => {
    const m = monde({
      lire: async () => ({
        nomAffichable: 'Paul D.',
        apporteurRef: REF,
        until: '2027-03',
        statut: 'attribuee',
      }),
    });
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(await vu(r)).toEqual({
      statut: 200,
      corps: `{"statut":"attribuee","until":"2027-03","apporteurRef":"${REF}","nomAffichable":"Paul D."}`,
      entetes: [['content-type', 'application/json; charset=utf-8']],
    });
    expect(journal(m)).toEqual([ligne('attribuee', {}, false, AU_PLANCHER)]);
  });

  it('SIREN client : le journal porte « cliente »', async () => {
    const m = monde({
      lire: async () => ({
        statut: 'cliente',
        until: null,
        apporteurRef: REF,
        nomAffichable: 'Paul D.',
      }),
    });
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(r.status).toBe(200);
    expect(journal(m)).toEqual([ligne('cliente', {}, false, AU_PLANCHER)]);
  });

  it('une lecture plus lente que le plancher : 200, et `plancherDepasse` au journal', async () => {
    const m = monde({ dureeDeLecture: PLANCHER_LECTURE_MS + 1 });
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(r.status).toBe(200);
    expect(journal(m)).toEqual([ligne('libre', {}, true, a(PLANCHER_LECTURE_MS + 1))]);
  });

  it('une lecture exactement au plancher n’est pas un dépassement', async () => {
    const m = monde({ dureeDeLecture: PLANCHER_LECTURE_MS });
    await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(journal(m)).toEqual([ligne('libre', {}, false, AU_PLANCHER)]);
  });

  it('une lecture qui lève : 503 sans corps au plancher, « lecture_indisponible », le message ne sort pas', async () => {
    const m = monde({
      lire: async () => {
        throw new Error('base indisponible');
      },
    });
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(await vu(r)).toEqual({ statut: 503, corps: '', entetes: [] });
    expect(m.maintenant() - DEPART).toBe(PLANCHER_LECTURE_MS);
    expect(journal(m)).toEqual([ligne('lecture_indisponible', {}, false, AU_PLANCHER)]);
  });

  it.each([
    [
      'un champ de personne en plus',
      {
        statut: 'attribuee',
        until: '2027-03',
        apporteurRef: REF,
        nomAffichable: 'Paul D.',
        nom: 'Martin',
      },
    ],
    [
      'un libre qui porte une référence',
      { statut: 'libre', until: null, apporteurRef: REF, nomAffichable: null },
    ],
    ['une chaîne au lieu d’un objet', 'libre'],
  ])('un lecteur qui rend %s : 503 sans corps, « reponse_non_conforme »', async (_q, lu) => {
    const m = monde({ lire: async () => lu });
    const r = await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(await vu(r)).toEqual({ statut: 503, corps: '', entetes: [] });
    expect(journal(m)).toEqual([ligne('reponse_non_conforme', {}, false, AU_PLANCHER)]);
  });

  it('une réponse non conforme ET lente : le dépassement du plancher est dit', async () => {
    const m = monde({
      lire: async () => ({ statut: 'suivie' }),
      dureeDeLecture: PLANCHER_LECTURE_MS + 5,
    });
    await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(journal(m)).toEqual([
      ligne('reponse_non_conforme', {}, true, a(PLANCHER_LECTURE_MS + 5)),
    ]);
  });

  it('le journal date l’appel à l’instant de l’horloge injectée, à la fin du chemin', async () => {
    const m = monde({ dureeDeLecture: 400 });
    await traiterAppel(requete(), 'attributions', m.frontiere);
    expect(journal(m)).toEqual([ligne('libre', {}, true, a(400))]);
  });
});

// ── La frontière de production et les sept gestionnaires ────────────────────────────────────────

describe('REQ-SEC-012 — la frontière de PRODUCTION', () => {
  let ecrit: string[];
  beforeEach(() => {
    ecrit = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((texte: string | Uint8Array) => {
      ecrit.push(String(texte));
      return true;
    });
    for (const [k, v] of Object.entries(ENV_VALIDE)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('lit l’environnement du processus, à chaque appel', () => {
    expect(frontiereDeProduction().environnement).toBe(process.env);
  });

  it('son horloge est celle du système, et `attendre` attend vraiment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEPART);
    const { horloge } = frontiereDeProduction();
    expect(horloge.maintenantMs()).toBe(DEPART);
    let fini = false;
    const attente = horloge.attendre(50).then(() => {
      fini = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await attente;
    expect(fini).toBe(true);
  });

  it('son débit est le compteur `auth:axionia-ip` du registre (SEC-44) : sans cache, il REFUSE en panne ; sa lecture est celle d’INT-T07-P, qui lève sans ses clés', async () => {
    const f = frontiereDeProduction();
    expect(f.debit).not.toBe(limiteNonDeclaree);
    vi.stubEnv('REDIS_URL', '');
    const verdict = await f.debit(sujetDepuisEmpreinte('0123456789abcdef'), DEPART);
    expect(verdict).toMatchObject({ autorise: false, panne: true, motif: 'cache_indisponible' });
    // La panne est signalée sous le préfixe du compteur, et seulement lui : jamais la clé.
    expect(ecrit.map((e) => JSON.parse(e) as Record<string, unknown>)).toEqual([
      { signal: 'rate_limit_panne', prefixe: 'auth:', motif: 'cache_indisponible' },
    ]);
    expect(f.lire).toBe(lecteurDeProduction);
    // Sans ses clés, la lecture LÈVE (la frontière rend 503) : jamais « libre » par défaut.
    await expect(f.lire(SIREN)).rejects.toThrow();
  });

  it('REQ-SEC-016 : TÉMOIN — son débit appelle EXACTEMENT le compteur `auth:axionia-ip`, avec le sujet et l’instant reçus', async () => {
    vi.stubEnv('REDIS_URL', '');
    const espion = vi.mocked(limiter);
    espion.mockClear();
    const sujet = sujetDepuisEmpreinte('fedcba9876543210');
    await frontiereDeProduction().debit(sujet, DEPART);
    expect(espion).toHaveBeenCalledTimes(1);
    expect(espion.mock.calls[0]).toEqual(['auth:axionia-ip', sujet, DEPART]);
  });

  it('son puits écrit UNE ligne terminée par un saut de ligne sur la sortie d’erreur', () => {
    frontiereDeProduction().puits('{"signal":"x"}');
    expect(ecrit).toEqual(['{"signal":"x"}\n']);
  });

  it('les sept gestionnaires passent tous par le même chemin : GET → 503 (cache du débit absent), les autres → 404', async () => {
    vi.stubEnv('REDIS_URL', '');
    for (const route of ROUTES_DE_LA_FRONTIERE) {
      const g = gestionnaires(route);
      expect(Object.keys(g).sort()).toEqual([...METHODES_HTTP].sort());
      for (const methode of METHODES_HTTP) {
        ecrit.length = 0;
        const r = await g[methode](requete({ methode }));
        const attendu = methode === 'GET' && route === 'attributions' ? 503 : 404;
        expect(r.status, `${route} ${methode}`).toBe(attendu);
        // Une ligne d'APPEL par appel ; la panne du compteur se signale à part, sous son préfixe.
        const appels = ecrit
          .map((e) => JSON.parse(e) as Record<string, unknown>)
          .filter((l) => l.signal === 'appel_axionia');
        expect(appels, `${route} ${methode} : une ligne`).toHaveLength(1);
        const l = appels[0] ?? {};
        expect(l.route, `${route} ${methode}`).toBe(route);
        expect(l.resultat, `${route} ${methode}`).toBe(
          methode !== 'GET'
            ? 'methode_refusee'
            : route === 'attributions'
              ? 'debit_indisponible'
              : 'route_inconnue'
        );
      }
    }
  });
});
