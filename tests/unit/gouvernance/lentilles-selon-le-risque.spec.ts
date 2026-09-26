// @req REQ-GOV-011
/**
 * lentilles-selon-le-risque.spec.ts — la relecture d'une PR se proportionne à son RISQUE
 * (GOV-077, levier 3 de Will du 2026-09-18, REQ-GOV-011).
 *
 * LA DÉCISION. Une PR de risque ORDINAIRE se relit par deux lentilles, `exactitude` et `securite`
 * (qui garde son veto). Une PR de risque ÉLEVÉ garde les quatre : `exactitude`, `securite`,
 * `simplicite` ou `schema`, et `mutation`. Jusqu'ici `lentillesExigees()` exigeait les quatre EN DUR.
 *
 * ⚠️ GOV-097 (décision de Will du 2026-09-25, `partners/ADR-0021`) a changé la FRONTIÈRE : l'élevé
 * est désormais réservé à l'argent, à la sécurité et aux données, et à la sécurité du processus
 * (garde des revues, CI, racine). Les témoins de ce fichier qui reposaient sur l'ancienne liste
 * blanche (zones `gouvernance`/`qualite`, chemins `docs/`/`scripts/`/`tests/`) sont réécrits sur la
 * nouvelle règle ; la nouvelle a son propre fichier,
 * `quatre-lentilles-pour-l-argent-la-securite-et-les-donnees.spec.ts`.
 *
 * LA FAUTE QUE CE FICHIER GARDE N'EXISTE PAS AVANT LE CORRECTIF — elle est ce que le correctif
 * PEUT introduire : une PR qui porte une tâche sensible et passe avec deux lentilles. La règle
 * échoue donc FERMÉ : ORDINAIRE seulement si TOUT est prouvé, ÉLEVÉ dès qu'un seul fait manque.
 *
 * TOUS LES TÉMOINS PASSENT PAR LE COMPORTEMENT (`risqueDeLaPr`, `lentillesExigees`, `lireRevues`,
 * `fautesDesRevues`, `jugerCaseRevues`) et par le registre RÉEL `docs/tasks.json` — jamais par la
 * lecture d'une orthographe dans un fichier source. Le seul témoin qui lit des sources est celui du
 * graphe d'imports (cas 7), et il y lit une STRUCTURE (qui importe qui), pas un symbole.
 *
 * ⚠️ L'API neuve se prend par ESPACE DE NOMS : un export absent y vaut `undefined`, et chaque témoin
 * rougit alors sur son propre appel au lieu de faire tomber le chargement du fichier entier.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { posix } from 'node:path';

import * as LECTEUR from '../../../scripts/lot/revues';
import * as COMPOSEUR from '../../../scripts/lot/corps-de-pr';
import { cheminsDeLaTache } from '../../../scripts/lot/chemins-de-tache';
import { LIVREE } from '../../../scripts/lot/avancement';

type TacheBrute = {
  id: string;
  zone?: string | null;
  sensible?: string[] | null;
  schema?: boolean;
  pr?: number | null;
  paths?: string[];
  tests?: Record<string, string[]> | null;
  repo?: string;
  statut?: string;
};

/** Le registre RÉEL, relu à chaque cas : une copie par témoin, jamais une mutation partagée. */
function registre(): TacheBrute[] {
  return (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: TacheBrute[] }).taches;
}

function tache(taches: TacheBrute[], id: string): TacheBrute {
  const t = taches.find((x) => x.id === id);
  if (t === undefined) throw new Error(`docs/tasks.json ne porte plus la tâche ${id}`);
  return t;
}

/** Les chemins qu'une tâche déclare (`paths` ∪ `tests{}`), par le lecteur unique du dépôt. */
function cheminsDe(t: TacheBrute): string[] {
  return cheminsDeLaTache({ ...t, paths: t.paths ?? [] });
}

/** Les chemins que QA-T01 déclare, tels quels — `.github/workflows/ci.yml` compris. */
const CHEMINS_QA_T01 = cheminsDe(tache(registre(), 'QA-T01'));
/** Le fichier de CI que QA-T01 déclare : il gouverne les gates, il fait monter le risque. */
const CI_DE_QA_T01 = CHEMINS_QA_T01.filter((f) => f.startsWith('.github/'));
/**
 * Les fichiers de configuration À LA RACINE que QA-T01 déclare (`vitest.config.ts`) : ils gouvernent
 * la chaîne de contrôle, ils font monter le risque (décision de l'orchestrateur du 2026-09-18).
 */
const RACINE_DE_QA_T01 = CHEMINS_QA_T01.filter((f) => !f.includes('/'));
/**
 * Une tâche qui élèverait à elle seule une PR — ORACLE écrit ici depuis la règle de la charte §6,
 * pas depuis le code : `sensible` non vide ou absent, `schema: true`, zone `argent`/`securite`,
 * absente ou inconnue du schéma du registre.
 */
function tacheHaute(t: TacheBrute, zonesConnues: readonly string[]): boolean {
  return !(
    typeof t.zone === 'string' &&
    t.zone !== 'argent' &&
    t.zone !== 'securite' &&
    zonesConnues.includes(t.zone) &&
    Array.isArray(t.sensible) &&
    t.sensible.length === 0 &&
    t.schema !== true
  );
}
const ZONES_CONNUES = (
  JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
    $defs: { tache: { properties: { zone: { enum: string[] } } } };
  }
).$defs.tache.properties.zone.enum;
/**
 * LA SENSIBILITÉ SUIT LE FICHIER DU CODE PRODUIT (GOV-097, refus `securite` du 2026-09-25) —
 * oracle : un fichier sous `src/` qu'une tâche haute du registre déclare, égal ou sous un
 * répertoire déclaré.
 */
const DECLARES_PAR_LES_TACHES_HAUTES = registre()
  .filter((t) => tacheHaute(t, ZONES_CONNUES))
  .flatMap((t) => cheminsDe(t));
function declareParUneTacheHaute(x: string): boolean {
  return (
    x.startsWith('src/') &&
    DECLARES_PAR_LES_TACHES_HAUTES.some((c) => c === x || (c.endsWith('/') && x.startsWith(c)))
  );
}
/**
 * La PR ordinaire de référence : les chemins de QA-T01 HORS `.github/` et hors de la racine
 * (décisions de l'orchestrateur du 2026-09-18 sur GOV-077). Dérivés du registre (RM-03), jamais tapés.
 */
const FICHIERS_QA_T01 = CHEMINS_QA_T01.filter(
  (f) => !CI_DE_QA_T01.includes(f) && !RACINE_DE_QA_T01.includes(f)
);

/**
 * LE GRAPHE RÉEL DE LA GARDE, recalculé ICI, indépendamment de `cheminsDeLaGardeDesRevues()` :
 * depuis les trois racines, toute importation relative, suivie de proche en proche.
 */
function fermetureDesImports(): Set<string> {
  const racines = [
    'scripts/gates/gov-pr.ts',
    'scripts/lot/revues.ts',
    'scripts/lot/corps-de-pr.ts',
  ];
  const vus = new Set<string>();
  const resoudre = (depuis: string, specifiant: string): string => {
    const base = posix.normalize(posix.join(posix.dirname(depuis), specifiant));
    for (const c of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`]) {
      try {
        if (statSync(c).isFile()) return c;
      } catch {
        // absent : candidat suivant
      }
    }
    throw new Error(`${depuis} importe ${specifiant}, introuvable`);
  };
  const pile = [...racines];
  while (pile.length > 0) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(
      /(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g
    )) {
      pile.push(resoudre(f, m[1]!));
    }
  }
  return vus;
}

const TETE = '41bc8140b9ea436be809676538dd65cb2263a5bc';
const avis = (entete: string, verdict: 'accepte' | 'refuse' = 'accepte') => ({
  user: { login: 'will383842' },
  author_association: 'OWNER',
  state: 'COMMENTED',
  commit_id: TETE,
  body: `${entete}\nVerdict: ${verdict}`,
});
const DEUX_ACCORDS = [avis('A09 · exactitude'), avis('A09 · securite')];

/** Une PR synthétique, lue sur la tête ET sur la base réelles, sauf ce que le cas fait varier. */
function risque(p: {
  titre: string | null;
  pr?: number | null;
  taches?: TacheBrute[];
  tachesBase?: TacheBrute[] | null;
  fichiers?: string[];
  labels?: string[];
  liste?: LECTEUR.ListeDesFichiers | null;
}) {
  return LECTEUR.risqueDeLaPr({
    titre: p.titre,
    pr: p.pr ?? null,
    taches: p.taches ?? registre(),
    tachesBase: p.tachesBase === undefined ? registre() : p.tachesBase,
    fichiers: p.fichiers ?? FICHIERS_QA_T01,
    labels: p.labels ?? [],
    // Les listes de ces témoins sont FOURNIES entières ; la complétude d'une liste de la forge a
    // son propre témoin (cas 6 octies).
    liste: p.liste === undefined ? { source: 'complete' } : p.liste,
  });
}

describe('REQ-GOV-011 — cas 0 : la PR ORDINAIRE existe, et deux lentilles de revue lui suffisent', () => {
  it('REQ-GOV-011 · une PR QA-T01 réduite à ses fichiers hors .github/ et hors racine (qualite, sensible vide) est de risque ordinaire', () => {
    // ⚠️ La vraie PR QA-T01 touche `.github/workflows/ci.yml` et `vitest.config.ts` : elle est
    // ÉLEVÉE. Ce témoin porte sur QA-T01 SANS ces fichiers — c'est ce qu'il prouve, rien de plus.
    const r = risque({ titre: 'feat(QA-T01): aucune gate en continue-on-error' });
    expect(r.niveau, r.raisons.join(' ; ')).toBe('ordinaire');
    expect(r.schema).toBe(false);
    expect(r.raisons.join(' ; ')).toContain('QA-T01');
    expect([...LECTEUR.lentillesExigees(r).toutes]).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 · sur cette PR, deux revues exactitude et securite acceptées ne laissent aucune lentille manquante', () => {
    const r = risque({ titre: 'feat(QA-T01): x' });
    const lecture = LECTEUR.lireRevues({
      revues: DEUX_ACCORDS,
      risque: r,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(lecture.manquantes).toEqual([]);
    expect(lecture.coche).toBe(true);
    expect(lecture.detail).toContain('les 2 lentilles');
  });

  it('REQ-GOV-011 · une tâche CRÉÉE par la PR (absente de la base) est jugée sur la tête seule', () => {
    const tete = [...registre(), { id: 'ZZ-NEUVE', zone: 'qualite', sensible: [], schema: false }];
    const r = risque({ titre: 'feat(ZZ-NEUVE): x', taches: tete, fichiers: ['docs/x.md'] });
    expect(r.niveau, r.raisons.join(' ; ')).toBe('ordinaire');
  });
});

describe('REQ-GOV-011 — cas 1 : plusieurs tâches sur la PR, la sensible AU MILIEU', () => {
  const IDS = ['QA-T01', 'DM-01', 'GOV-039'];
  /**
   * Les tâches de la PR fictive sont FIXÉES à `schema: false`. Ce témoin porte sur la SENSIBILITÉ au
   * milieu de la liste, pas sur le label `schema` : lu tel quel dans le registre réel, le drapeau de
   * DM-01 (passé `true` par GOV-102, partners/ADR-0022) remplaçait la troisième lentille
   * `simplicite` par `schema`, et un attendu qui ne parle pas de schéma rougissait. Le risque élevé,
   * lui, vient toujours du registre réel (`sensible` de DM-01) : c'est ce qui reste gardé.
   */
  function avecPr(ids: string[]): TacheBrute[] {
    return registre().map((t) => (ids.includes(t.id) ? { ...t, pr: 9999, schema: false } : t));
  }

  it('REQ-GOV-011 · l’ordre du registre met DM-01 (rgpd) entre QA-T01 et GOV-039 — mesuré, pas supposé', () => {
    const T = registre();
    const indices = IDS.map((id) => T.findIndex((t) => t.id === id));
    console.log(
      `cas 1 — indices au registre : ${IDS.map((id, i) => `${id}@${indices[i]}`).join(', ')}`
    );
    expect(indices[0]!).toBeLessThan(indices[1]!);
    expect(indices[1]!).toBeLessThan(indices[2]!);
    expect(tache(T, 'DM-01').sensible).toContain('rgpd');
    const surLaPr = LECTEUR.tachesDeLaPr(avecPr(IDS), 9999, 'QA-T01').map((t) => t.id);
    expect(surLaPr).toEqual(IDS);
  });

  it('REQ-GOV-011 · la PR est ÉLEVÉE, la raison nomme DM-01, et deux revues suffisent depuis GOV-101', () => {
    // Jusqu'au 2026-09-26, ces deux revues laissaient `simplicite` et `mutation` manquantes. La
    // décision de Will (`W16`, `partners/ADR-0024`) : deux lentilles partout. Le risque reste
    // ÉLEVÉ et se dit — c'est ce que `securite` lit —, il ne compte plus de lentille.
    const T = avecPr(IDS);
    const r = risque({ titre: 'feat(QA-T01): x', pr: 9999, taches: T, tachesBase: T });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('DM-01');
    const lecture = LECTEUR.lireRevues({
      revues: DEUX_ACCORDS,
      risque: r,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(lecture.manquantes).toEqual([]);
    expect(LECTEUR.fautesDesRevues(lecture, { tacheSensible: true })).toEqual([]);
    expect(lecture.detail).toContain('DM-01');
  });

  it('REQ-GOV-011 · CONTRE-TÉMOIN : la même PR SANS la tâche sensible sort sans aucune faute de revue', () => {
    const T = avecPr(['QA-T01', 'GOV-039']);
    const r = risque({ titre: 'feat(QA-T01): x', pr: 9999, taches: T, tachesBase: T });
    expect(r.niveau, r.raisons.join(' ; ')).toBe('ordinaire');
    const lecture = LECTEUR.lireRevues({
      revues: DEUX_ACCORDS,
      risque: r,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(LECTEUR.fautesDesRevues(lecture, { tacheSensible: false })).toEqual([]);
  });
});

describe('REQ-GOV-011 — cas 2 à 5 : ce que la PR porte comme tâche décide seul du risque', () => {
  /** Des fichiers de la PR qui ne font JAMAIS monter le risque : seul le champ varie. */
  const NEUTRES = ['docs/journal/2026-09.md'];

  it('REQ-GOV-011 · cas 2 : une PR SEC-01 (zone securite, sensible VIDE) est élevée — la zone compte seule', () => {
    const T = registre();
    expect(tache(T, 'SEC-01').sensible).toEqual([]);
    const r = risque({ titre: 'feat(SEC-01): x', fichiers: NEUTRES });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('securite');
  });

  it('REQ-GOV-011 · cas 3 : une PR INT-T13 (zone integration, sensible vide) est ORDINAIRE depuis GOV-097 — la limite déclarée de partners/ADR-0021', () => {
    // Avant GOV-097, la zone `integration` l'élevait seule. La décision du 2026-09-25 réserve les
    // quatre lentilles à l'argent, à la sécurité et aux données, et les données se lisent par
    // `sensible` : une tâche de données à `sensible: []` passe donc à deux lentilles. C'est la
    // limite que l'ADR nomme, et dont le remède est au registre (`rgpd`), pas dans le code.
    expect(tache(registre(), 'INT-T13').zone).toBe('integration');
    expect(tache(registre(), 'INT-T13').sensible).toEqual([]);
    const r = risque({ titre: 'feat(INT-T13): x', fichiers: NEUTRES });
    expect(r.niveau, r.raisons.join(' ; ')).toBe('ordinaire');
  });

  it('REQ-GOV-011 · cas 4 : un champ `sensible` ABSENT ou une `zone` ABSENTE rendent la PR élevée', () => {
    for (const champ of ['sensible', 'zone'] as const) {
      const T = registre().map((t) => {
        if (t.id !== 'QA-T01') return t;
        const copie: TacheBrute = { ...t };
        delete copie[champ];
        return copie;
      });
      const r = risque({ titre: 'feat(QA-T01): x', taches: T, tachesBase: T, fichiers: NEUTRES });
      expect(r.niveau, `champ ${champ} absent`).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(champ);
    }
  });

  it('REQ-GOV-011 · cas 4 bis : `sensible: null` n’est pas un tableau vide — la PR reste élevée', () => {
    const T = registre().map((t) => (t.id === 'QA-T01' ? { ...t, sensible: null } : t));
    const r = risque({ titre: 'feat(QA-T01): x', taches: T, tachesBase: T, fichiers: NEUTRES });
    expect(r.niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · cas 5 : une tâche DÉCLASSÉE sur la tête mais pas sur la base reste élevée, raison « base »', () => {
    const tete = registre().map((t) =>
      t.id === 'DM-01' ? { ...t, zone: 'gouvernance', sensible: [], schema: false } : t
    );
    const r = risque({
      titre: 'feat(DM-01): x',
      taches: tete,
      tachesBase: registre(),
      fichiers: NEUTRES,
    });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('base');
    // Contre-épreuve : la tête seule, si la base la confirmait, serait ordinaire.
    expect(
      risque({ titre: 'feat(DM-01): x', taches: tete, tachesBase: tete, fichiers: NEUTRES }).niveau
    ).toBe('ordinaire');
  });

  it('REQ-GOV-011 · cas 5 bis : un registre de base ILLISIBLE rend la PR élevée', () => {
    const r = risque({ titre: 'feat(QA-T01): x', tachesBase: null });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('base');
  });
});

describe('REQ-GOV-011 — cas 6 à 8 : ce que la PR TOUCHE décide aussi du risque', () => {
  it('REQ-GOV-011 · cas 6 : un fichier de code produit AU MILIEU du diff rend la PR élevée, et il est nommé', () => {
    for (const intrus of ['src/server/securite/pii.ts', 'config/exemptions-corps-publie.json']) {
      const r = risque({
        titre: 'feat(QA-T01): x',
        fichiers: ['docs/journal/2026-09.md', intrus, 'tests/unit/x.spec.ts'],
      });
      expect(r.niveau, intrus).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(intrus);
    }
  });

  it('REQ-GOV-011 · cas 6 ter : un fichier de CI (.github/) au MILIEU du diff rend la PR élevée — deux lentilles depuis GOV-101', () => {
    // Une PR qui affaiblit la CI ou la propriété des chemins est exactement celle qu'on ne relit
    // pas à deux lentilles. Le fichier vient des `paths` RÉELS de QA-T01, glissé au milieu.
    expect(CI_DE_QA_T01, 'QA-T01 ne déclare plus de fichier de CI').toContain(
      '.github/workflows/ci.yml'
    );
    const milieu = Math.floor(FICHIERS_QA_T01.length / 2);
    const avecCi = [
      ...FICHIERS_QA_T01.slice(0, milieu),
      '.github/workflows/ci.yml',
      ...FICHIERS_QA_T01.slice(milieu),
    ];
    expect(avecCi.indexOf('.github/workflows/ci.yml')).toBeGreaterThan(0);
    expect(avecCi.indexOf('.github/workflows/ci.yml')).toBeLessThan(avecCi.length - 1);
    const r = risque({ titre: 'feat(QA-T01): x', fichiers: avecCi });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('.github/workflows/ci.yml');
    expect([...LECTEUR.lentillesExigees(r).toutes]).toEqual(['exactitude', 'securite']);
    // CONTRE-TÉMOIN : la même PR sans ce fichier est ordinaire.
    const sans = risque({ titre: 'feat(QA-T01): x', fichiers: FICHIERS_QA_T01 });
    expect(sans.niveau, sans.raisons.join(' ; ')).toBe('ordinaire');
  });

  it('REQ-GOV-011 · cas 6 quater : un fichier de configuration à la RACINE au milieu du diff rend la PR élevée', () => {
    expect(RACINE_DE_QA_T01, 'QA-T01 ne déclare plus de fichier racine').toContain(
      'vitest.config.ts'
    );
    const milieu = Math.floor(FICHIERS_QA_T01.length / 2);
    for (const racine of ['package.json', 'pnpm-lock.yaml', ...RACINE_DE_QA_T01]) {
      const fichiers = [
        ...FICHIERS_QA_T01.slice(0, milieu),
        racine,
        ...FICHIERS_QA_T01.slice(milieu),
      ];
      const r = risque({ titre: 'feat(QA-T01): x', fichiers });
      expect(r.niveau, racine).toBe('eleve');
      expect(r.raisons.join(' ; ')).toContain(racine);
    }
    // Décision (g) de l'orchestrateur : SANS exception `*.md` — `CLAUDE.md` et `AGENTS.md` sont les
    // instructions que chaque agent charge, relecteurs compris.
    for (const racine of ['CLAUDE.md', 'AGENTS.md', 'README.md']) {
      const fichiers = [
        ...FICHIERS_QA_T01.slice(0, milieu),
        racine,
        ...FICHIERS_QA_T01.slice(milieu),
      ];
      expect(risque({ titre: 'feat(QA-T01): x', fichiers }).niveau, racine).toBe('eleve');
    }
  });

  it('REQ-GOV-011 · cas 6 quinquies : un fichier RENOMMÉ compte par sa source ET sa destination (forge)', () => {
    // La forme servie par `GET /repos/{o}/{r}/pulls/{n}/files` : un renommage porte `filename` (la
    // destination) et `previous_filename` (la source). Le fichier renommé est AU MILIEU.
    const entrees = [
      { filename: FICHIERS_QA_T01[0]!, status: 'modified' },
      {
        filename: 'docs/archive/ci.yml',
        previous_filename: '.github/workflows/ci.yml',
        status: 'renamed',
      },
      { filename: FICHIERS_QA_T01[1]!, status: 'modified' },
    ];
    // Le défaut, verbatim : lire `filename` seul rend la PR ordinaire.
    expect(
      risque({ titre: 'feat(QA-T01): x', fichiers: entrees.map((e) => e.filename) }).niveau
    ).toBe('ordinaire');
    const fichiers = LECTEUR.cheminsTouches(entrees);
    expect(fichiers).toContain('.github/workflows/ci.yml');
    expect(fichiers).toContain('docs/archive/ci.yml');
    const r = risque({ titre: 'feat(QA-T01): x', fichiers });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('.github/workflows/ci.yml');
  });

  it('REQ-GOV-011 · cas 6 sexies : un schéma RENOMMÉ hors de prisma/ ou de packages/contracts/ reste élevé, et exige la lentille schema', () => {
    // Les chemins de schéma DÉRIVÉS de la charte §7, chacun renommé vers `docs/`, AU MILIEU.
    for (const racineDeSchema of LECTEUR.cheminsSchema()) {
      const source = `${racineDeSchema}schema.prisma`;
      const entrees = [
        { filename: FICHIERS_QA_T01[0]!, status: 'modified' },
        { filename: 'docs/archive/schema.prisma', previous_filename: source, status: 'renamed' },
        { filename: FICHIERS_QA_T01[1]!, status: 'modified' },
      ];
      expect(
        risque({ titre: 'feat(QA-T01): x', fichiers: entrees.map((e) => e.filename) }).schema
      ).toBe(false); // le défaut, verbatim : la destination seule ne dit rien du schéma
      const r = risque({ titre: 'feat(QA-T01): x', fichiers: LECTEUR.cheminsTouches(entrees) });
      expect(r.niveau, source).toBe('eleve');
      expect(r.schema, source).toBe(true);
      expect([...LECTEUR.lentillesExigees(r).sansMutation]).toContain('schema');
    }
  });

  it('REQ-GOV-011 · cas 6 septies : le diff LOCAL (git --name-status -z) rend aussi la source d’un renommage', () => {
    // La forme de `git diff --name-status -z` : un statut, puis un chemin — ou DEUX pour un
    // renommage ou une copie (`R100`, `C075`) —, chaque champ terminé par un octet NUL.
    const Z = String.fromCharCode(0);
    const sortie =
      [
        'M',
        FICHIERS_QA_T01[0],
        'R100',
        '.github/workflows/ci.yml',
        'docs/archive/ci.yml',
        'C080',
        'prisma/schema.prisma',
        'docs/copie.prisma',
        'A',
        FICHIERS_QA_T01[1],
      ].join(Z) + Z;
    const fichiers = LECTEUR.cheminsTouches(LECTEUR.entreesDuDiff(sortie));
    for (const f of [
      FICHIERS_QA_T01[0]!,
      '.github/workflows/ci.yml',
      'docs/archive/ci.yml',
      'prisma/schema.prisma',
      'docs/copie.prisma',
      FICHIERS_QA_T01[1]!,
    ]) {
      expect(fichiers, f).toContain(f);
    }
    expect(risque({ titre: 'feat(QA-T01): x', fichiers }).niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · cas 6 nonies : un chemin NON ASCII du diff local est lu tel quel — prisma/ exige schema, docs/ reste ordinaire', () => {
    // Sans `-z`, git cite un chemin non ASCII entre guillemets et en octal (`"prisma/\303\251.sql"`) :
    // il ne commence plus par `prisma/`, et la lentille `schema` n'était plus exigée.
    const Z = String.fromCharCode(0);
    const nul = (champs: string[]) => champs.join(Z) + Z;
    const milieu = (chemin: string) =>
      nul(['M', FICHIERS_QA_T01[0]!, 'A', chemin, 'M', FICHIERS_QA_T01[1]!]);
    const schema = risque({
      titre: 'feat(QA-T01): x',
      fichiers: LECTEUR.cheminsTouches(LECTEUR.entreesDuDiff(milieu('prisma/é.sql'))),
    });
    expect(schema.niveau).toBe('eleve');
    expect(schema.schema).toBe(true);
    const doc = risque({
      titre: 'feat(QA-T01): x',
      fichiers: LECTEUR.cheminsTouches(LECTEUR.entreesDuDiff(milieu('docs/é.md'))),
    });
    expect(doc.niveau, doc.raisons.join(' ; ')).toBe('ordinaire');
  });

  it('REQ-GOV-011 · cas 6 octies : une liste de fichiers de la forge INCOMPLÈTE rend la PR élevée', () => {
    // `GET /pulls/{n}/files` plafonne sans erreur : une liste plus courte que `changed_files`, ou un
    // `changed_files` au plafond, laisse des fichiers INVISIBLES. Trois entrées de l'API (dont un
    // renommage : source et destination comptent pour UNE entrée).
    const entrees = [
      { filename: FICHIERS_QA_T01[0]! },
      { filename: 'docs/b.md', previous_filename: 'docs/a.md', status: 'renamed' },
      { filename: FICHIERS_QA_T01[1]! },
    ];
    const fichiers = LECTEUR.cheminsTouches(entrees);
    const avec = (annoncees: number | null, lues = entrees.length) =>
      risque({ titre: 'feat(QA-T01): x', fichiers, liste: { source: 'forge', lues, annoncees } });
    // CONTRE-TÉMOIN : la liste est complète.
    expect(avec(3).niveau, avec(3).raisons.join(' ; ')).toBe('ordinaire');
    // Tronquée : une entrée de moins que ce que la PR annonce.
    const tronquee = avec(4);
    expect(tronquee.niveau).toBe('eleve');
    expect(tronquee.raisons.join(' ; ')).toContain('incompl');
    // Au plafond de la forge, même « complète » : rien ne dit qu'il n'y en avait pas davantage.
    expect(
      avec(LECTEUR.PLAFOND_DES_FICHIERS_DE_LA_FORGE, LECTEUR.PLAFOND_DES_FICHIERS_DE_LA_FORGE)
        .niveau
    ).toBe('eleve');
    // Compte illisible ; liste de complétude absente ; source inconnue.
    expect(avec(null).niveau).toBe('eleve');
    expect(risque({ titre: 'feat(QA-T01): x', fichiers, liste: null }).niveau).toBe('eleve');
    // Une source que le type ne connaît pas — lue comme la forge la servirait, sans la retaper.
    const inconnue = JSON.parse('{"source":"inconnue"}') as LECTEUR.ListeDesFichiers;
    expect(risque({ titre: 'feat(QA-T01): x', fichiers, liste: inconnue }).niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · cas 7 bis : la garde des revues est la FERMETURE TRANSITIVE de ses imports — un module importé indirectement est élevé', () => {
    // Le graphe RÉEL, recalculé ici indépendamment (`fermetureDesImports`).
    const vus = fermetureDesImports();
    // Ce que la dette nomme : deux modules que la gate EXÉCUTE sans être des racines.
    expect(vus).toContain('scripts/lot/avancement.ts');
    expect(vus).toContain('scripts/lot/chemins-de-tache.ts');
    const garde = new Set(LECTEUR.cheminsDeLaGardeDesRevues());
    for (const f of [...vus, LECTEUR.CHEMIN_CHARTE, LECTEUR.CHEMIN_AGENTS]) {
      expect(garde, `${f} manque à la garde des revues`).toContain(f);
      const r = risque({
        titre: 'feat(QA-T01): x',
        fichiers: ['docs/journal/2026-09.md', f, 'tests/unit/x.spec.ts'],
      });
      expect(r.niveau, f).toBe('eleve');
    }
  });

  it('REQ-GOV-011 · cas 7 : un fichier de la garde des revues au milieu du diff rend la PR élevée', () => {
    const r = risque({
      titre: 'feat(QA-T01): x',
      fichiers: ['docs/journal/2026-09.md', 'scripts/lot/corps-de-pr.ts', 'tests/unit/x.spec.ts'],
    });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('scripts/lot/corps-de-pr.ts');
  });

  it('REQ-GOV-011 · cas 7 : la garde des revues est DÉRIVÉE du graphe d’imports — tout importeur de revues.ts y figure', () => {
    // Une boucle sur la constante elle-même survivrait à sa troncature : c'est le GRAPHE qui dit
    // ce qu'elle doit contenir. Tout fichier de `scripts/` qui importe `scripts/lot/revues.ts`,
    // le module lui-même, et les deux documents qu'il LIT (charte, registre des postes).
    const importeurs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = posix.join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|mjs|js)$/.test(nom)) {
          const source = readFileSync(chemin, 'utf8');
          for (const m of source.matchAll(/from\s+'(\.[^']+)'/g)) {
            const cible = posix.normalize(posix.join(posix.dirname(chemin), m[1]!));
            if (cible === 'scripts/lot/revues') importeurs.push(chemin);
          }
        }
      }
    };
    parcourir('scripts');
    expect(
      importeurs.length,
      'plus aucun importeur : le témoin ne mesure plus rien'
    ).toBeGreaterThan(0);
    const attendu = new Set([
      'scripts/lot/revues.ts',
      ...importeurs,
      LECTEUR.CHEMIN_CHARTE,
      LECTEUR.CHEMIN_AGENTS,
    ]);
    const garde = new Set(LECTEUR.cheminsDeLaGardeDesRevues());
    for (const f of attendu) expect(garde, `${f} manque à la garde des revues`).toContain(f);
    // Et chacun, glissé AU MILIEU d'un diff ordinaire, fait monter le risque.
    for (const f of attendu) {
      const r = risque({
        titre: 'feat(QA-T01): x',
        fichiers: ['docs/journal/2026-09.md', f, 'tests/unit/x.spec.ts'],
      });
      expect(r.niveau, f).toBe('eleve');
    }
  });

  it('REQ-GOV-011 · cas 8 : un diff VIDE, une tâche INCONNUE, un label `schema` rendent la PR élevée', () => {
    expect(risque({ titre: 'feat(QA-T01): x', fichiers: [] }).niveau).toBe('eleve');
    expect(risque({ titre: 'feat(ZZZ-999): x' }).niveau).toBe('eleve');
    expect(risque({ titre: null }).niveau).toBe('eleve');
    const r = risque({ titre: 'feat(QA-T01): x', labels: ['schema'] });
    expect(r.niveau).toBe('eleve');
    expect(r.schema).toBe(true);
    const l = [...LECTEUR.lentillesExigees(r).toutes];
    expect(l).toContain('schema');
    expect(l).not.toContain('simplicite');
  });

  it('REQ-GOV-011 · cas 8 bis : un fichier de schéma (prisma/) rend la PR élevée ET exige la lentille schema', () => {
    const r = risque({
      titre: 'feat(QA-T01): x',
      fichiers: [...FICHIERS_QA_T01, 'prisma/schema.prisma'],
    });
    expect(r.niveau).toBe('eleve');
    expect(r.schema).toBe(true);
    expect([...LECTEUR.lentillesExigees(r).sansMutation]).toEqual([
      'exactitude',
      'securite',
      'schema',
    ]);
  });
});

describe('REQ-GOV-011 — témoins manquants relevés par la lentille mutation (PR 64)', () => {
  const NEUTRES = ['docs/journal/2026-09.md'];

  it('REQ-GOV-011 · une tâche de gouvernance ou de qualité à `sensible` NON vide rend la PR élevée, et c’est sa seule raison', () => {
    for (const id of ['GOV-059', 'QA-T08']) {
      const t = tache(registre(), id);
      expect(['gouvernance', 'qualite'], id).toContain(t.zone);
      expect((t.sensible ?? []).length, id).toBeGreaterThan(0);
      const r = risque({ titre: `feat(${id}): x`, fichiers: NEUTRES });
      expect(r.niveau, id).toBe('eleve');
      expect(r.raisons).toEqual([
        `${id} sur la tête : sensible [${t.sensible!.join(', ')}]`,
        `${id} sur la base : sensible [${t.sensible!.join(', ')}]`,
      ]);
    }
  });

  it('REQ-GOV-011 · une tâche `schema: true` en zone ordinaire (QA-T04) rend la PR élevée et exige la lentille schema', () => {
    const t = tache(registre(), 'QA-T04');
    expect(t.zone).toBe('qualite');
    expect(t.sensible).toEqual([]);
    expect(t.schema).toBe(true);
    const r = risque({ titre: 'feat(QA-T04): x', fichiers: NEUTRES });
    expect(r.niveau).toBe('eleve');
    expect(r.schema).toBe(true);
    expect([...LECTEUR.lentillesExigees(r).sansMutation]).toEqual([
      'exactitude',
      'securite',
      'schema',
    ]);
    expect(r.raisons.join(' ; ')).toContain('schema: true');
  });

  it('REQ-GOV-011 · `tachesDeLaBase` lit le registre de la RÉFÉRENCE donnée, pas celui de HEAD', () => {
    // 809a746 (PR 53) : GOV-077 n'y était revendiquée par personne. Sur la tête de cette PR, elle
    // l'est par A05 — la même tâche, lue à deux références, doit donc différer.
    const base = LECTEUR.tachesDeLaBase('809a746a4b40a8dcc02b0842486388c377c733dd');
    expect(
      base,
      'le commit 809a746 est introuvable : l’historique est-il complet ?'
    ).not.toBeNull();
    const aLaBase = base!.find((t) => t.id === 'GOV-077') as TacheBrute & { owner?: string | null };
    const aLaTete = tache(registre(), 'GOV-077') as TacheBrute & { owner?: string | null };
    expect(aLaTete.owner).toBe('A05');
    expect(aLaBase.owner ?? null).toBeNull();
  });

  it('REQ-GOV-011 · `tachesDeLaBase` échoue en `null` — jamais en liste vide —, et la PR est alors élevée', () => {
    for (const ref of ['refs/heads/zz-inexistante-gov-077', '-x', '']) {
      expect(LECTEUR.tachesDeLaBase(ref), ref).toBeNull();
    }
    const r = risque({
      titre: 'feat(QA-T01): x',
      tachesBase: LECTEUR.tachesDeLaBase('refs/heads/zz-inexistante-gov-077') as
        TacheBrute[] | null,
    });
    expect(r.niveau).toBe('eleve');
  });

  it('REQ-GOV-011 · le composeur du corps de PR lit un fichier RENOMMÉ par sa source ET sa destination', () => {
    const { fichiers, liste } = COMPOSEUR.fichiersDeLaForge(
      [
        { filename: FICHIERS_QA_T01[0]! },
        {
          filename: 'docs/archive/ci.yml',
          previous_filename: '.github/workflows/ci.yml',
          status: 'renamed',
        },
        { filename: FICHIERS_QA_T01[1]! },
      ],
      3
    );
    expect(fichiers).toContain('.github/workflows/ci.yml');
    expect(fichiers).toContain('docs/archive/ci.yml');
    expect(liste).toEqual({ source: 'forge', lues: 3, annoncees: 3 });
    expect(risque({ titre: 'feat(QA-T01): x', fichiers, liste }).niveau).toBe('eleve');
    // Un compte annoncé illisible ne fabrique pas une liste complète.
    expect(COMPOSEUR.fichiersDeLaForge([], undefined).liste).toEqual({
      source: 'forge',
      lues: 0,
      annoncees: null,
    });
  });
});

describe('REQ-GOV-011 — cas 9 : toute tâche du registre réel est classée, les deux classes existent', () => {
  it('REQ-GOV-011 · chaque tâche, en PR synthétique à une tâche, est classée ; ordinaire et élevé sont comptés', () => {
    const T = registre();
    let ordinaires = 0;
    let eleves = 0;
    for (const t of T) {
      const r = risque({ titre: `feat(${t.id}): x`, fichiers: cheminsDe(t) });
      if (r.niveau === 'ordinaire') ordinaires++;
      else if (r.niveau === 'eleve') eleves++;
      else throw new Error(`${t.id} : niveau inconnu ${String(r.niveau)}`);
    }
    console.log(`cas 9 — ${T.length} tâches : ${ordinaires} ordinaire(s), ${eleves} élevée(s)`);
    // Le compte que l'ADR et le journal citent, IMPRIMÉ ici plutôt que recopié : les tâches
    // `partners` non livrées de la TÊTE.
    const vivantes = T.filter((t) => t.repo === 'partners' && !LIVREE.has(t.statut ?? ''));
    const ordinairesVivantes = vivantes.filter(
      (t) => risque({ titre: `feat(${t.id}): x`, fichiers: cheminsDe(t) }).niveau === 'ordinaire'
    ).length;
    console.log(
      `cas 9 — tâches partners non livrées : ${ordinairesVivantes} ordinaire(s) sur ${vivantes.length}`
    );
    expect(ordinaires + eleves).toBe(T.length);
    // Une fonction qui rendrait TOUJOURS élevé passerait cas 1 à cas 8 : elle rougit ici.
    expect(ordinaires).toBeGreaterThan(0);
    expect(eleves).toBeGreaterThan(0);

    // LES COMPTES SONT ASSERTÉS, PAS SEULEMENT IMPRIMÉS (lentille `mutation`, PR 64) : un ORACLE
    // indépendant, écrit ici à partir de la règle de la charte §6 et non du code, doit trouver
    // EXACTEMENT les mêmes tâches ordinaires. Ses listes sont tapées exprès : leur divergence
    // d'avec `scripts/lot/revues.ts` est le signal que ce témoin existe pour donner.
    // Réécrit par GOV-097 sur la règle du 2026-09-25 : l'élevé se cherche, par signaux.
    const garde = new Set([
      ...fermetureDesImports(),
      'docs/CHARTE-AGENTS.md',
      'docs/agents.json',
      'scripts/lot/tasks.schema.json',
    ]);
    const zonesConnues = (
      JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
        $defs: { tache: { properties: { zone: { enum: string[] } } } };
      }
    ).$defs.tache.properties.zone.enum;
    const MOTS_SENSIBLES = new Set([
      'commissions',
      'attributions',
      'auth',
      'espace',
      '(espace)',
      'commission',
      'attribution',
      'argent',
      'grille',
      'securite',
      'acces',
      'roles',
      'proxy',
      'env',
      'webhooks',
      'donnees-personnelles',
      'pii',
      'session',
      'sessions',
      'crypto',
      'chiffrement',
      'cloisonnement',
      'middleware',
    ]);
    const enZoneSensible = (x: string): boolean => {
      const s = x.toLowerCase().split('/');
      const dernier = s.pop()!;
      return [...s, dernier, dernier.replace(/\..*$/, '')].some((m) => MOTS_SENSIBLES.has(m));
    };
    const duProcessus = (x: string): boolean =>
      !x.includes('/') || x.startsWith('.') || x.startsWith('config/') || garde.has(x);
    const oracle = (t: TacheBrute): boolean => {
      const f = cheminsDe(t);
      return (
        !tacheHaute(t, zonesConnues) &&
        f.length > 0 &&
        f.every(
          (x) =>
            !enZoneSensible(x) &&
            !duProcessus(x) &&
            !declareParUneTacheHaute(x) &&
            !x.startsWith('prisma/') &&
            !x.startsWith('packages/contracts/')
        )
      );
    };
    const parLeCode = (liste: TacheBrute[]) =>
      liste
        .filter(
          (t) =>
            risque({ titre: `feat(${t.id}): x`, fichiers: cheminsDe(t) }).niveau === 'ordinaire'
        )
        .map((t) => t.id);
    expect(parLeCode(T)).toEqual(T.filter(oracle).map((t) => t.id));
    expect(ordinaires).toBe(T.filter(oracle).length);
    expect(ordinairesVivantes).toBe(vivantes.filter(oracle).length);
    expect(ordinairesVivantes).toBeGreaterThan(0);
  });

  it('REQ-GOV-011 · seules les zones argent et securite de l’enum rendent la PR élevée à sensible vide (GOV-097)', () => {
    const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as {
      $defs: { tache: { properties: { zone: { enum: string[] } } } };
    };
    const zones = schema.$defs.tache.properties.zone.enum;
    expect(zones.length).toBeGreaterThan(2);
    for (const zone of zones) {
      const T = [...registre(), { id: 'ZZ-SYNTH', zone, sensible: [], schema: false }];
      const r = risque({
        titre: 'feat(ZZ-SYNTH): x',
        taches: T,
        tachesBase: T,
        fichiers: ['docs/x.md'],
      });
      const attendu = zone === 'argent' || zone === 'securite' ? 'eleve' : 'ordinaire';
      expect(r.niveau, `zone ${zone}`).toBe(attendu);
    }
  });
});

describe('REQ-GOV-011 — cas 10 : le composeur du corps de PR juge la case des revues par le MÊME risque', () => {
  const revuesDeuxAccords = DEUX_ACCORDS;

  it('REQ-GOV-011 · la PR à tâche sensible au milieu, deux revues acceptées : la case se COCHE depuis GOV-101, et le risque nomme DM-01', () => {
    const T = registre().map((t) =>
      ['QA-T01', 'DM-01', 'GOV-039'].includes(t.id) ? { ...t, pr: 9999 } : t
    );
    const c = COMPOSEUR.jugerCaseRevues({
      titre: 'feat(QA-T01): x',
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
      liste: { source: 'complete' },
      labels: [],
      revues: revuesDeuxAccords,
      taches: T,
      tachesBase: T,
      tete: TETE,
      auteurPoste: 'A05',
      auteurCompte: 'will383842',
    });
    expect(c.marque, c.detail).toBe('[x]');
    expect(c.detail).toContain('DM-01');
    expect(c.detail).toContain('élevé');
  });

  it('REQ-GOV-011 · la PR ordinaire, résolue par son SEUL titre, deux revues acceptées : la case se coche', () => {
    // Seul le TITRE rattache la tâche à la PR 9999 : aucun champ `pr` du registre ne la porte. Un
    // composeur qui passerait `null` pour le titre n'aurait aucune tâche, donc un risque élevé, donc
    // une case qui ne se cocherait jamais — et le levier 2 mourrait en silence.
    // La tâche est CHOISIE dans le registre vivant, jamais nommée : le nom figé ici (QA-T01) cassait
    // ce témoin dès la clôture de la tâche (`pr: 59`). Plancher : il en reste au moins une.
    const ordinaires = registre().filter(
      (t) =>
        (t.pr ?? null) === null &&
        ['gouvernance', 'qualite'].includes(t.zone ?? '') &&
        Array.isArray(t.sensible) &&
        t.sensible.length === 0 &&
        t.schema !== true
    );
    expect(ordinaires.length, 'aucune tâche ordinaire sans `pr` au registre').toBeGreaterThan(0);
    const choisie = ordinaires[0]!;
    expect(LECTEUR.tachesDeLaPr(registre(), 9999, null)).toEqual([]);
    const c = COMPOSEUR.jugerCaseRevues({
      titre: `feat(${choisie.id}): x`,
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
      liste: { source: 'complete' },
      labels: [],
      revues: revuesDeuxAccords,
      taches: registre(),
      tachesBase: registre(),
      tete: TETE,
      auteurPoste: 'A05',
      auteurCompte: 'will383842',
    });
    expect(c.marque, c.detail).toBe('[x]');
    expect(c.detail).toContain('2 lentilles');
    expect(c.detail).toContain('ordinaire');
  });

  it('REQ-GOV-011 · sans registre de base, la PR est ÉLEVÉE et le dit — et deux revues la cochent depuis GOV-101', () => {
    const c = COMPOSEUR.jugerCaseRevues({
      titre: 'feat(QA-T01): x',
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
      liste: { source: 'complete' },
      labels: [],
      revues: revuesDeuxAccords,
      taches: registre(),
      tachesBase: null,
      tete: TETE,
      auteurPoste: 'A05',
      auteurCompte: 'will383842',
    });
    expect(c.marque, c.detail).toBe('[x]');
    expect(c.detail).toContain('registre de base illisible');
  });
});

describe('REQ-GOV-011 — cas 11 : deux lentilles partout, et l’architecte dès que le schéma n’est pas PROUVÉ absent', () => {
  it('REQ-GOV-011 · `niveau` inconnu : exactitude, securite — le niveau ne compte plus de lentille', () => {
    const l = LECTEUR.lentillesExigees({ niveau: 'inconnu' as never, schema: false, raisons: [] });
    expect([...l.toutes]).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 · les deux niveaux, contenu ET cardinal ; `schema` non faux appelle l’architecte', () => {
    const ordinaire = LECTEUR.lentillesExigees({ niveau: 'ordinaire', schema: false, raisons: [] });
    expect([...ordinaire.toutes]).toEqual(['exactitude', 'securite']);
    expect(ordinaire.toutes.length).toBe(2);
    const eleve = LECTEUR.lentillesExigees({ niveau: 'eleve', schema: false, raisons: [] });
    expect([...eleve.toutes]).toEqual(['exactitude', 'securite']);
    expect(eleve.toutes.length).toBe(2);
    // La branche courte se PROUVE : `schema === false`. Toute autre valeur exige l'architecte.
    const incoherent = LECTEUR.lentillesExigees({ niveau: 'ordinaire', schema: true, raisons: [] });
    expect([...incoherent.toutes]).toEqual(['exactitude', 'securite', 'schema']);
    const imprevu = LECTEUR.lentillesExigees({
      niveau: 'eleve',
      schema: 'peut-etre' as never,
      raisons: [],
    });
    expect([...imprevu.toutes]).toEqual(['exactitude', 'securite', 'schema']);
  });
});
