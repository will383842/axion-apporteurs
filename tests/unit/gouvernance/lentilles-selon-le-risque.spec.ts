// @req REQ-GOV-011
/**
 * lentilles-selon-le-risque.spec.ts — la relecture d'une PR se proportionne à son RISQUE
 * (GOV-077, levier 3 de Will du 2026-09-18, REQ-GOV-011).
 *
 * LA DÉCISION. Une PR de risque ORDINAIRE — gouvernance ou qualité, aucune donnée sensible, aucun
 * code produit — se relit par deux lentilles, `exactitude` et `securite` (qui garde son veto). Une
 * PR de risque ÉLEVÉ garde les quatre : `exactitude`, `securite`, `simplicite` ou `schema`, et
 * `mutation`. Jusqu'ici `lentillesExigees()` exigeait les quatre EN DUR.
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
 * La PR ordinaire de référence : les chemins de QA-T01 HORS `.github/` et hors de la racine
 * (décisions de l'orchestrateur du 2026-09-18 sur GOV-077). Dérivés du registre (RM-03), jamais tapés.
 */
const FICHIERS_QA_T01 = CHEMINS_QA_T01.filter(
  (f) => !CI_DE_QA_T01.includes(f) && !RACINE_DE_QA_T01.includes(f)
);

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
}) {
  return LECTEUR.risqueDeLaPr({
    titre: p.titre,
    pr: p.pr ?? null,
    taches: p.taches ?? registre(),
    tachesBase: p.tachesBase === undefined ? registre() : p.tachesBase,
    fichiers: p.fichiers ?? FICHIERS_QA_T01,
    labels: p.labels ?? [],
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
  function avecPr(ids: string[]): TacheBrute[] {
    return registre().map((t) => (ids.includes(t.id) ? { ...t, pr: 9999 } : t));
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

  it('REQ-GOV-011 · la PR est ÉLEVÉE, la raison nomme DM-01, et deux revues laissent simplicite et mutation manquantes', () => {
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
    expect(lecture.manquantes).toEqual(['simplicite', 'mutation']);
    const familles = LECTEUR.fautesDesRevues(lecture, { tacheSensible: true }).map(
      (f) => f.famille
    );
    expect(familles).toContain('lentilles_manquantes');
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

  it('REQ-GOV-011 · cas 3 : une PR INT-T13 (contacts à qualifier, sensible vide) est élevée par sa zone', () => {
    expect(tache(registre(), 'INT-T13').sensible).toEqual([]);
    const r = risque({ titre: 'feat(INT-T13): x', fichiers: NEUTRES });
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ; ')).toContain('INT-T13');
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

  it('REQ-GOV-011 · cas 6 ter : un fichier de CI (.github/) au MILIEU du diff rend la PR élevée, quatre lentilles de revue', () => {
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
    expect([...LECTEUR.lentillesExigees(r).toutes]).toEqual([
      'exactitude',
      'securite',
      'simplicite',
      'mutation',
    ]);
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
    // CONTRE-TÉMOIN : un document de la racine ne gouverne rien.
    const doc = risque({ titre: 'feat(QA-T01): x', fichiers: [...FICHIERS_QA_T01, 'README.md'] });
    expect(doc.niveau, doc.raisons.join(' ; ')).toBe('ordinaire');
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

  it('REQ-GOV-011 · cas 6 septies : le diff LOCAL (git --name-status) rend aussi la source d’un renommage', () => {
    // La forme de `git diff --name-status` : une colonne de statut, puis un chemin — ou DEUX pour un
    // renommage ou une copie (`R100`, `C075`). Tabulations, telles que git les écrit.
    const T = String.fromCharCode(9);
    const sortie = [
      `M${T}${FICHIERS_QA_T01[0]}`,
      `R100${T}.github/workflows/ci.yml${T}docs/archive/ci.yml`,
      `C080${T}prisma/schema.prisma${T}docs/copie.prisma`,
      `A${T}${FICHIERS_QA_T01[1]}`,
      '',
    ].join(String.fromCharCode(10));
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
    expect(new Set(LECTEUR.CHEMINS_DE_LA_GARDE_DES_REVUES)).toEqual(attendu);
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
  });

  it('REQ-GOV-011 · chaque zone de l’enum hors gouvernance et qualite rend la PR élevée, même sensible vide', () => {
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
      const attendu = zone === 'gouvernance' || zone === 'qualite' ? 'ordinaire' : 'eleve';
      expect(r.niveau, `zone ${zone}`).toBe(attendu);
    }
  });
});

describe('REQ-GOV-011 — cas 10 : le composeur du corps de PR juge la case des revues par le MÊME risque', () => {
  const revuesDeuxAccords = DEUX_ACCORDS;

  it('REQ-GOV-011 · la PR à tâche sensible au milieu, deux revues acceptées : la case reste VIDE et nomme DM-01', () => {
    const T = registre().map((t) =>
      ['QA-T01', 'DM-01', 'GOV-039'].includes(t.id) ? { ...t, pr: 9999 } : t
    );
    const c = COMPOSEUR.jugerCaseRevues({
      titre: 'feat(QA-T01): x',
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
      labels: [],
      revues: revuesDeuxAccords,
      taches: T,
      tachesBase: T,
      tete: TETE,
      auteurPoste: 'A05',
      auteurCompte: 'will383842',
    });
    expect(c.marque).toBe('[ ]');
    expect(c.detail).toContain('DM-01');
  });

  it('REQ-GOV-011 · la PR ordinaire, résolue par son SEUL titre, deux revues acceptées : la case se coche', () => {
    // QA-T01 porte `pr: null` au registre : seul le TITRE la rattache à la PR 9999. Un composeur
    // qui passerait `null` pour le titre n'aurait aucune tâche, donc un risque élevé, donc une
    // case qui ne se cocherait jamais — et le levier 2 mourrait en silence.
    expect(tache(registre(), 'QA-T01').pr ?? null).toBeNull();
    const c = COMPOSEUR.jugerCaseRevues({
      titre: 'feat(QA-T01): x',
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
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

  it('REQ-GOV-011 · sans registre de base, le composeur ne coche pas la case d’une PR ordinaire', () => {
    const c = COMPOSEUR.jugerCaseRevues({
      titre: 'feat(QA-T01): x',
      pr: 9999,
      fichiers: FICHIERS_QA_T01,
      labels: [],
      revues: revuesDeuxAccords,
      taches: registre(),
      tachesBase: null,
      tete: TETE,
      auteurPoste: 'A05',
      auteurCompte: 'will383842',
    });
    expect(c.marque).toBe('[ ]');
  });
});

describe('REQ-GOV-011 — cas 11 : une valeur de risque imprévue exige les quatre lentilles de revue', () => {
  it('REQ-GOV-011 · `niveau` inconnu : exactitude, securite, simplicite, mutation', () => {
    const l = LECTEUR.lentillesExigees({ niveau: 'inconnu' as never, schema: false, raisons: [] });
    expect([...l.toutes]).toEqual(['exactitude', 'securite', 'simplicite', 'mutation']);
  });

  it('REQ-GOV-011 · les deux niveaux, contenu ET cardinal', () => {
    const ordinaire = LECTEUR.lentillesExigees({ niveau: 'ordinaire', schema: false, raisons: [] });
    expect([...ordinaire.toutes]).toEqual(['exactitude', 'securite']);
    expect(ordinaire.toutes.length).toBe(2);
    const eleve = LECTEUR.lentillesExigees({ niveau: 'eleve', schema: false, raisons: [] });
    expect([...eleve.toutes]).toEqual(['exactitude', 'securite', 'simplicite', 'mutation']);
    expect(eleve.toutes.length).toBe(4);
    // `ordinaire` avec `schema: true` est un état incohérent : il ne raccourcit rien.
    const incoherent = LECTEUR.lentillesExigees({ niveau: 'ordinaire', schema: true, raisons: [] });
    expect([...incoherent.toutes]).toEqual(['exactitude', 'securite', 'schema', 'mutation']);
  });
});
