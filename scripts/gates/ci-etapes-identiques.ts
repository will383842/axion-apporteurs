/**
 * `pnpm gov:ci-etapes [--base <ref>]` · `pnpm gov:ci-etapes:prove` — GOV-142 : le découpage de la
 * porte A en jobs ne perd, ne double ni n'altère AUCUNE étape.
 *
 * POURQUOI. La porte A tenait en un job d'environ cent vingt étapes, dont « Tests » prenait l'essentiel
 * du temps. La couper en jobs parallèles est un gain de temps ; c'est aussi l'occasion idéale de
 * perdre une garde sans que rien ne rougisse : une étape oubliée dans la copie, une étape jouée deux
 * fois et dont l'une est désarmée, un `if:` glissé au passage. Ce témoin confronte les étapes de la
 * RÉFÉRENCE — l'« avant » FIGÉ, `scripts/gates/ci-etapes-reference.json` : les étapes du job unique,
 * relevées dans `ci.yml` au commit qu'il nomme — à celles de la TÊTE. Une référence figée, et non
 * `origin/main` : une fois le découpage fusionné, main serait la tête elle-même, et le témoin ne
 * prouverait plus rien. `--base <ref>` confronte à une révision git, pour une lecture ponctuelle.
 *
 * LES RÈGLES.
 *  1. Chaque étape de la base SURVIT à l'identique (même contenu, clé par clé, nom compris) dans
 *     EXACTEMENT un job de la tête. Absente : `etape_disparue`. Présente sous le même nom avec un
 *     autre contenu : `etape_alteree`. Présente dans deux jobs : `etape_dupliquee`.
 *  2. Les étapes du SOCLE (récupérer le dépôt, installer pnpm et node, les caches, `pnpm install`)
 *     et les étapes RÉPÉTABLES nommées dans `REPETABLES`, chacune avec sa raison, se répètent à
 *     l'identique : jamais altérées, jamais retirées de tous les jobs.
 *  3. Une étape qui CHANGE pour être découpée (« Tests » devient des éclats et une fusion) est
 *     déclarée dans `TRANSFORMATIONS`, avec les noms qui la remplacent et la raison. Un nom déclaré
 *     absent de la tête : `transformation_sans_cible`.
 *  4. Chaque job porte la garde de fusion au niveau du job : `job_sans_garde_de_fusion`.
 *  5. Quand la tête a plusieurs jobs : un seul job s'appelle `gate-a`, aucun autre ne s'en approche
 *     (`nom_de_porte_usurpe`) ; il attend TOUS les autres (`porte_finale_incomplete`) et tourne
 *     toujours, `always()` à sa condition (`porte_finale_sans_always`).
 *  6. Les éclats `tests-<i>` sont exactement `tests-1` à `tests-2`, chacun avec `ECLAT: <i>/2`
 *     (`eclat_manquant_ou_double`), et IDENTIQUES hormis ce numéro et le nom de leur blob
 *     (`eclats_divergents`) : un éclat ne dérive pas en silence.
 *  7. LISTE FERMÉE DES AJOUTS (acceptance de GOV-142, point 6) : toute étape de la tête est soit une
 *     étape de la base (identique, ou cible déclarée d'une transformation), soit une étape du socle
 *     (d), soit un ajout NOMMÉ dans `AJOUTS_ADMIS`, avec sa catégorie et la commande (`run`) ou
 *     l'action (`uses`) qu'il doit lancer. Toute autre : `etape_non_admise`. Une étape quelconque
 *     ajoutée à un éclat rougit donc ici, même si la même PR la fige dans `PORTE_A_FIGEE`.
 *
 * CE QU'IL NE JUGE PAS, ET C'EST DIT. L'ordre des étapes dans un job. Et, pour un ajout admis, ses
 * clés autres que `run` et `uses` (`with`, `env`, `id`) : `PORTE_A_FIGEE` les fige, clé par clé.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estObjet, lireYaml } from '../lib/lire-yaml';

export const WORKFLOW = '.github/workflows/ci.yml';
/** L'« avant » figé : les étapes du job unique de la porte A, au commit que le fichier nomme. */
export const REFERENCE = 'scripts/gates/ci-etapes-reference.json';
export const PORTE_FINALE = 'gate-a';
export const GARDE_DE_FUSION = 'github.event.pull_request.merged != true';
export const NOMBRE_D_ECLATS = 2;

export type Etape = Readonly<Record<string, unknown>>;
export interface Job {
  readonly nom: string;
  readonly si: string | null;
  readonly attend: readonly string[];
  readonly etapes: readonly Etape[];
  /** Le job tel que lu, toutes clés : la comparaison des éclats le lit entier. */
  readonly brut: Readonly<Record<string, unknown>>;
}

/** Une étape de la base qui change pour être découpée, et ce qui la remplace dans la tête. */
export interface Transformation {
  readonly vers: readonly string[];
  readonly pourquoi: string;
}

export const TRANSFORMATIONS: Readonly<Record<string, Transformation>> = {
  Tests: {
    vers: [
      'Tests — un eclat de la suite',
      'Tests — fusion des eclats, aux seuils de la configuration',
    ],
    pourquoi:
      'la suite se joue en deux éclats parallèles (`pnpm test:eclat`), puis la fusion juge la ' +
      'couverture aux seuils de la configuration et écrit le rapport de `pnpm test` (`pnpm test:fusion`).',
  },
};

/** Les étapes, hors socle, qu'un job rejoue À L'IDENTIQUE parce qu'il en a besoin, et pourquoi. */
export const REPETABLES: Readonly<Record<string, string>> = {
  'Les vues derivees sont rendues, et le rendu est reproductible':
    'les vues ne sont pas commitées (REQ-GOV-032) : chaque job qui en lit une les rend lui-même.',
  'Navigateurs des passes d accessibilite':
    'chaque éclat peut tirer une passe d’accessibilité, qui pilote un vrai navigateur.',
};

/** Un ajout admis : sa catégorie de la liste fermée, et ce qu'il lance. */
export interface AjoutAdmis {
  readonly categorie: string;
  readonly run?: string;
  readonly uses?: string;
}

const DEPOT = 'actions/upload-artifact@v4';
const RECEPTION = 'actions/download-artifact@v4';
const ECLATS = [1, 2] as const;

/**
 * LA LISTE FERMÉE des étapes que la tête AJOUTE à la base (acceptance de GOV-142, point 6 : (a) la
 * commande de test devenue l'éclat, (b) l'envoi et la réception d'artefacts, (c) la fusion des
 * rapports, (d) les caches — ceux-ci sont du socle —, (e) le calcul et la vérification des
 * empreintes, (f) le contrôle des `needs` du job final), plus le témoin lui-même, que l'acceptance
 * veut appelé depuis le workflow. Un nom absent d'ici, ou une commande autre, rougit.
 */
export const AJOUTS_ADMIS: Readonly<Record<string, AjoutAdmis>> = {
  'Tests — un eclat de la suite': { categorie: '(a) l’éclat', run: 'pnpm test:eclat' },
  'Tests — fusion des eclats, aux seuils de la configuration': {
    categorie: '(c) la fusion des rapports',
    run: 'pnpm test:fusion',
  },
  'Depot de l instantane de la forge': { categorie: '(b) envoi d’artefact', uses: DEPOT },
  'Reception de l instantane de la forge': {
    categorie: '(b) réception d’artefact',
    uses: RECEPTION,
  },
  'Depot du blob de l eclat': { categorie: '(b) envoi d’artefact', uses: DEPOT },
  ...Object.fromEntries(
    ECLATS.map((i) => [
      `Reception du blob de l eclat ${i}`,
      { categorie: '(b) réception d’artefact', uses: RECEPTION },
    ])
  ),
  'Empreinte de l instantane de la forge': {
    categorie: '(e) calcul d’empreinte',
    run: 'pnpm ci:artefact:publier',
  },
  'L instantane de la forge est celui que le job forge a publie': {
    categorie: '(e) vérification d’empreinte',
    run: 'pnpm ci:artefact:verifier',
  },
  'Empreinte du blob de l eclat': {
    categorie: '(e) calcul d’empreinte',
    run: 'pnpm ci:artefact:publier',
  },
  ...Object.fromEntries(
    ECLATS.map((i) => [
      `Le blob de l eclat ${i} est celui que son job a publie`,
      { categorie: '(e) vérification d’empreinte', run: 'pnpm ci:artefact:verifier' },
    ])
  ),
  'Chaque job de la porte A a reussi': {
    categorie: '(f) le contrôle des needs du job final',
    run: 'pnpm ci:porte-finale',
  },
  'Les etapes de la porte A sont celles d avant le decoupage': {
    categorie: '(6) le témoin, appelé depuis le workflow',
    run: 'pnpm gov:ci-etapes',
  },
  'La garde des etapes de la porte A sait rougir': {
    categorie: '(6) la preuve du témoin',
    run: 'pnpm gov:ci-etapes:prove',
  },
  // (7) UNE GARDE NEUVE, NOMMÉE PAR SA TÂCHE — et elle seule. La référence est l'« avant » figé du
  // découpage (GOV-142) : une garde née après lui n'y figure pas, et ne peut entrer que nommée ici,
  // avec sa tâche et sa commande exacte.
  'Le registre suit les fusions': {
    categorie: '(7) garde neuve — GOV-154',
    run: 'pnpm gov:registre-fusions',
  },
  'La garde du registre des fusions sait rougir': {
    categorie: '(7) preuve de la garde neuve — GOV-154',
    run: 'pnpm gov:registre-fusions:prove',
  },
};

export type Famille =
  | 'etape_non_admise'
  | 'etape_disparue'
  | 'etape_alteree'
  | 'etape_dupliquee'
  | 'transformation_sans_cible'
  | 'job_sans_garde_de_fusion'
  | 'porte_finale_incomplete'
  | 'porte_finale_sans_always'
  | 'nom_de_porte_usurpe'
  | 'eclat_manquant_ou_double'
  | 'eclats_divergents'
  | 'concurrence_non_conforme';

export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

const ACTIONS_DU_SOCLE = [
  'actions/checkout@',
  'pnpm/action-setup@',
  'actions/setup-node@',
  'actions/cache@',
] as const;
const COMMANDES_DU_SOCLE = ['pnpm install --frozen-lockfile'] as const;

/** Une étape du socle : l'installation de chaque job, répétable. */
export function estDuSocle(e: Etape): boolean {
  const uses = typeof e.uses === 'string' ? e.uses : null;
  if (uses !== null) return ACTIONS_DU_SOCLE.some((a) => uses.startsWith(a));
  const run = typeof e.run === 'string' ? e.run.trim() : null;
  return run !== null && (COMMANDES_DU_SOCLE as readonly string[]).includes(run);
}

/** Le nom d'une étape : son `name`, sinon ce qu'elle exécute. */
export function nomDeLEtape(e: Etape): string {
  if (typeof e.name === 'string') return e.name;
  if (typeof e.uses === 'string') return `uses: ${e.uses}`;
  return `run: ${String(e.run ?? '').trim()}`;
}

/** La forme canonique d'une valeur : les clés triées, à toute profondeur. */
export function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (estObjet(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Les jobs d'un workflow lu, sous une forme fermée. */
export function lesJobs(workflow: unknown): Job[] {
  if (!estObjet(workflow) || !estObjet(workflow.jobs)) {
    throw new Error('le workflow ne porte aucun `jobs`');
  }
  return Object.entries(workflow.jobs).map(([nom, job]) => {
    if (!estObjet(job) || !Array.isArray(job.steps)) {
      throw new Error(`le job « ${nom} » ne porte aucune liste d'étapes`);
    }
    const besoin = job.needs;
    const attend = Array.isArray(besoin)
      ? besoin.map(String)
      : typeof besoin === 'string'
        ? [besoin]
        : [];
    return {
      nom,
      si: typeof job.if === 'string' ? job.if : null,
      attend,
      etapes: job.steps.map((e, i) => {
        if (!estObjet(e)) throw new Error(`le job « ${nom} », étape ${i}, n'est pas un objet`);
        return e;
      }),
      brut: job,
    };
  });
}

const FORME_D_UN_ECLAT = /^tests-(\d+)$/;

/** L'`ECLAT` que portent les étapes d'un job, toutes valeurs lues. */
function eclatsDuJob(job: Job): string[] {
  return job.etapes.flatMap((e) =>
    estObjet(e.env) && e.env.ECLAT !== undefined ? [String(e.env.ECLAT)] : []
  );
}

/** Un éclat ramené à sa forme commune : son numéro effacé là où il a le droit d'être. */
function formeCommune(job: Job, i: number): string {
  return canonique(job.brut)
    .split(`"ECLAT":"${i}/${NOMBRE_D_ECLATS}"`)
    .join('"ECLAT":"<i>"')
    .split(`blob-${i}-${NOMBRE_D_ECLATS}.json`)
    .join('blob-<i>.json')
    .split(`"blob-${i}"`)
    .join('"blob-<i>"');
}

function jugerLesEclats(tete: readonly Job[]): Faute[] {
  const eclats = tete
    .map((j) => ({ job: j, m: FORME_D_UN_ECLAT.exec(j.nom) }))
    .filter((x): x is { job: Job; m: RegExpExecArray } => x.m !== null);
  if (eclats.length === 0) return [];
  const fautes: Faute[] = [];
  const attendus = Array.from({ length: NOMBRE_D_ECLATS }, (_, i) => `tests-${i + 1}`);
  const presents = eclats.map((x) => x.job.nom);
  const ecarts = [
    ...attendus.filter((n) => !presents.includes(n)).map((n) => `${n} manque`),
    ...presents.filter((n) => !attendus.includes(n)).map((n) => `${n} n'est pas attendu`),
    ...eclats.flatMap(({ job, m }) => {
      const lus = eclatsDuJob(job);
      const voulu = `${m[1]}/${NOMBRE_D_ECLATS}`;
      return lus.length === 1 && lus[0] === voulu
        ? []
        : [`${job.nom} porte ECLAT ${lus.join(', ') || 'absent'}, attendu ${voulu}`];
    }),
  ];
  for (const e of ecarts) fautes.push({ famille: 'eclat_manquant_ou_double', message: e });
  const formes = eclats.map(({ job, m }) => ({
    nom: job.nom,
    forme: formeCommune(job, Number(m[1])),
  }));
  const reference = formes[0]!;
  for (const f of formes.slice(1)) {
    if (f.forme !== reference.forme) {
      fautes.push({
        famille: 'eclats_divergents',
        message: `${f.nom} diffère de ${reference.nom} au-delà de son numéro et de son blob.`,
      });
    }
  }
  return fautes;
}

function jugerLaPorteFinale(tete: readonly Job[]): Faute[] {
  if (tete.length <= 1) return [];
  const fautes: Faute[] = [];
  for (const j of tete) {
    if (j.nom !== PORTE_FINALE && /gate[\s._-]*a/i.test(j.nom)) {
      fautes.push({
        famille: 'nom_de_porte_usurpe',
        message: `Le job « ${j.nom} » s'approche du nom réservé « ${PORTE_FINALE} ».`,
      });
    }
  }
  const porte = tete.find((j) => j.nom === PORTE_FINALE);
  const autres = tete.filter((j) => j.nom !== PORTE_FINALE).map((j) => j.nom);
  const manquants = porte === undefined ? autres : autres.filter((n) => !porte.attend.includes(n));
  if (porte === undefined || manquants.length > 0) {
    fautes.push({
      famille: 'porte_finale_incomplete',
      message:
        porte === undefined
          ? `Aucun job « ${PORTE_FINALE} » : la porte finale manque.`
          : `« ${PORTE_FINALE} » n'attend pas : ${manquants.join(', ')}.`,
    });
  }
  if (porte !== undefined && !(porte.si ?? '').includes('always()')) {
    fautes.push({
      famille: 'porte_finale_sans_always',
      message: `« ${PORTE_FINALE} » sans always() : un job requis en échec la ferait sauter, et un saut requis compte comme réussi.`,
    });
  }
  return fautes;
}

/** Le juge, pur : la base, la tête et les transformations déclarées donnent les fautes. */
export function jugerLesEtapes(
  base: readonly Job[],
  tete: readonly Job[],
  transformations: Readonly<Record<string, Transformation>> = TRANSFORMATIONS,
  repetables: Readonly<Record<string, string>> = REPETABLES,
  ajouts: Readonly<Record<string, AjoutAdmis>> = AJOUTS_ADMIS
): Faute[] {
  const fautes: Faute[] = [];
  const ou = new Map<string, string[]>();
  const parNom = new Map<string, string[]>();
  for (const job of tete) {
    for (const e of job.etapes) {
      const c = canonique(e);
      ou.set(c, [...(ou.get(c) ?? []), job.nom]);
      const n = nomDeLEtape(e);
      parNom.set(n, [...(parNom.get(n) ?? []), job.nom]);
    }
  }
  const vues = new Set<string>();
  for (const e of base.flatMap((j) => j.etapes)) {
    const nom = nomDeLEtape(e);
    const c = canonique(e);
    if (vues.has(c)) continue;
    vues.add(c);
    const t = transformations[nom];
    if (t !== undefined) {
      for (const cible of t.vers) {
        if (!parNom.has(cible)) {
          fautes.push({
            famille: 'transformation_sans_cible',
            message: `« ${nom} » est déclarée transformée en « ${cible} », absente de la tête.`,
          });
        }
      }
      continue;
    }
    const jobs = ou.get(c) ?? [];
    if (jobs.length === 0) {
      const homonymes = parNom.get(nom) ?? [];
      fautes.push(
        homonymes.length > 0
          ? {
              famille: 'etape_alteree',
              message: `« ${nom} » existe dans ${[...new Set(homonymes)].join(', ')} avec un autre contenu que dans la base.`,
            }
          : { famille: 'etape_disparue', message: `« ${nom} » n'est plus dans aucun job.` }
      );
      continue;
    }
    // Une étape altérée dans UN job se lit même quand une copie intacte vit ailleurs.
    const alteres = (parNom.get(nom) ?? []).length - jobs.length;
    if (alteres > 0) {
      fautes.push({
        famille: 'etape_alteree',
        message: `« ${nom} » existe ${alteres} fois avec un autre contenu que dans la base.`,
      });
    }
    if (jobs.length > 1 && !estDuSocle(e) && repetables[nom] === undefined) {
      fautes.push({
        famille: 'etape_dupliquee',
        message: `« ${nom} » est jouée dans ${jobs.length} jobs (${jobs.join(', ')}) : une seule place.`,
      });
    }
  }
  // 7. La liste FERMÉE des ajouts. Une étape de la tête qui porte le NOM d'une étape de la base sans
  // son contenu est déjà nommée `etape_alteree` : elle n'est pas comptée une seconde fois ici.
  const contenusDeLaBase = new Set(base.flatMap((j) => j.etapes).map(canonique));
  const nomsDeLaBase = new Set(base.flatMap((j) => j.etapes).map(nomDeLEtape));
  for (const job of tete) {
    for (const e of job.etapes) {
      const nom = nomDeLEtape(e);
      if (contenusDeLaBase.has(canonique(e)) || estDuSocle(e) || nomsDeLaBase.has(nom)) continue;
      const admis = ajouts[nom];
      if (admis === undefined) {
        fautes.push({
          famille: 'etape_non_admise',
          message: `« ${nom} » (job ${job.nom}) n'est ni une étape de la base, ni du socle, ni un ajout de la liste fermée.`,
        });
        continue;
      }
      const run = typeof e.run === 'string' ? e.run.trim() : undefined;
      const uses = typeof e.uses === 'string' ? e.uses.trim() : undefined;
      if (run !== admis.run || uses !== admis.uses) {
        fautes.push({
          famille: 'etape_non_admise',
          message:
            `« ${nom} » (job ${job.nom}) est un ajout admis, ${admis.categorie}, mais lance ` +
            `« ${run ?? uses ?? '—'} » au lieu de « ${admis.run ?? admis.uses} ».`,
        });
      }
    }
  }
  for (const job of tete) {
    if (job.si === null || !job.si.includes(GARDE_DE_FUSION)) {
      fautes.push({
        famille: 'job_sans_garde_de_fusion',
        message: `Le job « ${job.nom} » ne porte pas « ${GARDE_DE_FUSION} » au niveau du job.`,
      });
    }
  }
  return [...fautes, ...jugerLaPorteFinale(tete), ...jugerLesEclats(tete)];
}

// ── la preuve : chaque famille rougit sur une faute plantée ───────────────────────────────────

interface Plante {
  readonly tete: readonly Job[];
  readonly transformations?: Record<string, Transformation>;
}
interface Cas {
  readonly famille: Famille;
  /** La faute plantée dans la TÊTE (jugée contre la base), qui a plusieurs jobs. */
  readonly planter: (tete: readonly Job[]) => Plante;
}

const etapeJugee = (jobs: readonly Job[]): { job: Job; etape: Etape } => {
  for (const job of jobs) {
    const etape = job.etapes.find(
      // Une étape de la RÉFÉRENCE : un ajout admis retiré n'est pas une étape disparue.
      (x) =>
        !estDuSocle(x) &&
        REPETABLES[nomDeLEtape(x)] === undefined &&
        AJOUTS_ADMIS[nomDeLEtape(x)] === undefined &&
        x.env === undefined
    );
    if (etape !== undefined && !FORME_D_UN_ECLAT.test(job.nom)) return { job, etape };
  }
  throw new Error('la tête ne porte aucune étape jugée hors socle');
};
const remplacerLeJob = (jobs: readonly Job[], nom: string, f: (j: Job) => Job): Job[] =>
  jobs.map((j) => (j.nom === nom ? f(j) : j));
const avecEtapes = (j: Job, etapes: readonly Etape[]): Job => ({
  ...j,
  etapes,
  brut: { ...j.brut, steps: etapes },
});

export const CAS_DE_PREUVE: readonly Cas[] = [
  {
    // Le cas relevé par l'exactitude : une étape quelconque ajoutée à un éclat.
    famille: 'etape_non_admise',
    planter: (t) => ({
      tete: remplacerLeJob(t, 'tests-2', (j) =>
        avecEtapes(j, [...j.etapes, { name: 'Une etape ajoutee', run: 'pnpm lint' }])
      ),
    }),
  },
  {
    // Un NOM admis qui lance autre chose que ce que la liste fermée lui attribue.
    famille: 'etape_non_admise',
    planter: (t) => ({
      tete: remplacerLeJob(t, PORTE_FINALE, (j) =>
        avecEtapes(
          j,
          j.etapes.map((e) =>
            e.name === 'Chaque job de la porte A a reussi' ? { ...e, run: 'pnpm lint' } : e
          )
        )
      ),
    }),
  },
  {
    famille: 'etape_disparue',
    planter: (t) => {
      const { job, etape } = etapeJugee(t);
      return {
        tete: remplacerLeJob(t, job.nom, (j) =>
          avecEtapes(
            j,
            j.etapes.filter((e) => e !== etape)
          )
        ),
      };
    },
  },
  {
    famille: 'etape_alteree',
    planter: (t) => {
      const { job, etape } = etapeJugee(t);
      return {
        tete: remplacerLeJob(t, job.nom, (j) =>
          avecEtapes(
            j,
            j.etapes.map((e) => (e === etape ? { ...e, 'continue-on-error': true } : e))
          )
        ),
      };
    },
  },
  {
    famille: 'etape_dupliquee',
    planter: (t) => {
      const { job, etape } = etapeJugee(t);
      const autre = t.find((j) => j.nom !== job.nom && j.nom !== PORTE_FINALE)!;
      return {
        tete: remplacerLeJob(t, autre.nom, (j) => avecEtapes(j, [...j.etapes, etape])),
      };
    },
  },
  {
    famille: 'transformation_sans_cible',
    planter: (t) => ({
      tete: t,
      transformations: {
        ...TRANSFORMATIONS,
        Tests: { vers: ['une étape qui n’existe pas'], pourquoi: 'preuve' },
      },
    }),
  },
  {
    famille: 'job_sans_garde_de_fusion',
    planter: (t) => ({ tete: remplacerLeJob(t, t[0]!.nom, (j) => ({ ...j, si: null })) }),
  },
  {
    famille: 'porte_finale_incomplete',
    planter: (t) => ({
      tete: remplacerLeJob(t, PORTE_FINALE, (j) => ({ ...j, attend: j.attend.slice(1) })),
    }),
  },
  {
    famille: 'porte_finale_sans_always',
    planter: (t) => ({
      tete: remplacerLeJob(t, PORTE_FINALE, (j) => ({ ...j, si: `\${{ ${GARDE_DE_FUSION} }}` })),
    }),
  },
  {
    famille: 'nom_de_porte_usurpe',
    planter: (t) => {
      const autre = t.find((j) => j.nom !== PORTE_FINALE)!;
      return {
        tete: t.map((j) =>
          j.nom === autre.nom
            ? { ...j, nom: 'gate-a-1' }
            : j.nom === PORTE_FINALE
              ? { ...j, attend: [...j.attend, 'gate-a-1'] }
              : j
        ),
      };
    },
  },
  {
    famille: 'eclat_manquant_ou_double',
    planter: (t) => ({
      tete: remplacerLeJob(t, 'tests-2', (j) =>
        avecEtapes(
          j,
          j.etapes.map((e) =>
            estObjet(e.env) && e.env.ECLAT !== undefined
              ? { ...e, env: { ...e.env, ECLAT: '1/2' } }
              : e
          )
        )
      ),
    }),
  },
  {
    famille: 'eclats_divergents',
    planter: (t) => ({
      tete: remplacerLeJob(t, 'tests-2', (j) => ({
        ...j,
        brut: { ...j.brut, 'timeout-minutes': '5' },
      })),
    }),
  },
];

/**
 * 8. LA CONCURRENCE DU WORKFLOW (lentille sécurité) : un run de la porte A par PR, le plus récent
 * fait foi ; main JAMAIS annulé. La clé de groupe porte le NUMÉRO de la PR sur `pull_request` (jamais
 * `head_ref`, qu'une autre PR peut porter), et le sha sinon ; l'annulation vaut sur `pull_request`
 * seulement. Toute autre forme : `concurrence_non_conforme`.
 */
export const GROUPE_DE_CONCURRENCE =
  "${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.sha }}";
export const ANNULATION_EN_COURS = "${{ github.event_name == 'pull_request' }}";

export function jugerLaConcurrence(concurrence: unknown): Faute[] {
  const faute = (message: string): Faute[] => [{ famille: 'concurrence_non_conforme', message }];
  if (!estObjet(concurrence)) {
    return faute(
      'le workflow ne porte aucune clé `concurrency` : les runs d’une même PR s’empilent.'
    );
  }
  const groupe = concurrence.group;
  const annulation = concurrence['cancel-in-progress'];
  const fautes: Faute[] = [];
  if (groupe !== GROUPE_DE_CONCURRENCE) {
    fautes.push(
      ...faute(
        `le groupe vaut « ${String(groupe)} » au lieu de « ${GROUPE_DE_CONCURRENCE} » : sans le NUMÉRO ` +
          'de la PR, deux PR partagent un groupe ; sans le sha sur main, deux commits de main se ' +
          'disputent le même.'
      )
    );
  }
  if (annulation !== ANNULATION_EN_COURS) {
    fautes.push(
      ...faute(
        `l’annulation vaut « ${String(annulation)} » au lieu de « ${ANNULATION_EN_COURS} » : main ` +
          'ne doit JAMAIS être annulé, et une PR doit l’être.'
      )
    );
  }
  return fautes;
}

/** Les fautes de concurrence plantées dans la preuve, chacune UNE variation de la forme conforme. */
export const CONCURRENCES_FAUTIVES: readonly { quoi: string; concurrence: unknown }[] = [
  { quoi: 'la clé absente', concurrence: undefined },
  {
    quoi: 'la branche de tête au lieu du numéro',
    concurrence: {
      group: '${{ github.workflow }}-${{ github.head_ref || github.sha }}',
      'cancel-in-progress': ANNULATION_EN_COURS,
    },
  },
  {
    quoi: 'l’annulation sur main aussi',
    concurrence: { group: GROUPE_DE_CONCURRENCE, 'cancel-in-progress': 'true' },
  },
];

export function prouver(
  base: readonly Job[],
  tete: readonly Job[],
  concurrence?: unknown
): { code: number; lignes: string[] } {
  const lignes: string[] = [];
  let code = 0;
  if (concurrence !== undefined) {
    const temoin = jugerLaConcurrence(concurrence);
    if (temoin.length > 0) {
      code = 1;
      lignes.push(
        `❌ la concurrence de la tête rougit : ${temoin.map((f) => f.message).join(' ; ')}`
      );
    }
    for (const c of CONCURRENCES_FAUTIVES) {
      if (jugerLaConcurrence(c.concurrence).length > 0) {
        lignes.push(`✅ concurrence_non_conforme : rougit sur ${c.quoi}`);
      } else {
        code = 1;
        lignes.push(`❌ concurrence_non_conforme : ${c.quoi} passe`);
      }
    }
  }
  for (const [quoi, t, transformations] of [
    // Sans transformation : la base ne porte pas les étapes qui remplacent celle qu'on transforme.
    ['la base jugée contre elle-même', base, {}],
    ['la tête jugée contre la base', tete, TRANSFORMATIONS],
  ] as const) {
    const temoin = jugerLesEtapes(base, t, transformations);
    if (temoin.length > 0) {
      code = 1;
      lignes.push(`❌ ${quoi} rougit : ${temoin.map((f) => f.famille).join(', ')}`);
    }
  }
  if (tete.length <= 1) {
    lignes.push('❌ la preuve exige une tête découpée en plusieurs jobs');
    return { code: 1, lignes };
  }
  for (const cas of CAS_DE_PREUVE) {
    const { tete: plantee, transformations } = cas.planter(tete);
    const familles = jugerLesEtapes(base, plantee, transformations ?? TRANSFORMATIONS).map(
      (f) => f.famille
    );
    if (familles.includes(cas.famille)) {
      lignes.push(`✅ ${cas.famille} : rougit sur sa faute plantée`);
    } else {
      code = 1;
      lignes.push(
        `❌ ${cas.famille} : la faute plantée passe (${familles.join(', ') || 'aucune'})`
      );
    }
  }
  return { code, lignes };
}

// ── ligne de commande ─────────────────────────────────────────────────────────────────────────
// GARDÉE : ce module est importé par sa spécification, et l'import ne lance rien.

async function lire(texte: string): Promise<Job[]> {
  return lesJobs(await lireYaml(texte));
}

const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

async function principal(): Promise<number> {
  const i = process.argv.indexOf('--base');
  const revision = i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
  let ref: string;
  let base: Job[];
  if (revision === null) {
    const lu = JSON.parse(readFileSync(REFERENCE, 'utf8')) as { source?: unknown; jobs?: unknown };
    if (typeof lu.source !== 'string') throw new Error(`${REFERENCE} ne nomme pas sa source`);
    ref = lu.source;
    base = lesJobs({ jobs: lu.jobs });
  } else {
    ref = revision;
    base = await lire(
      execFileSync('git', ['show', `${revision}:${WORKFLOW}`], { encoding: 'utf8' })
    );
  }
  const workflowDeLaTete = await lireYaml(readFileSync(WORKFLOW, 'utf8'));
  const tete = lesJobs(workflowDeLaTete);
  const concurrence = estObjet(workflowDeLaTete) ? workflowDeLaTete.concurrency : undefined;
  if (process.argv.includes('--prove')) {
    // La concurrence de la tête, ou le témoin d'une clé absente : jamais « non jugée ».
    const v = prouver(base, tete, concurrence ?? null);
    (v.code === 0 ? console.log : console.error)(v.lignes.join('\n'));
    return v.code;
  }
  const fautes = [...jugerLesEtapes(base, tete), ...jugerLaConcurrence(concurrence)];
  const etapesBase = base.reduce((n, j) => n + j.etapes.length, 0);
  const etapesTete = tete.reduce((n, j) => n + j.etapes.length, 0);
  if (fautes.length === 0) {
    console.log(
      `✅ gov:ci-etapes — ${etapesBase} étape(s) de ${ref} confrontée(s) aux ${etapesTete} étape(s) de ${tete.length} job(s) de la tête ; ${Object.keys(TRANSFORMATIONS).length} transformation(s) et ${Object.keys(REPETABLES).length} répétable(s) déclarée(s).`
    );
    return 0;
  }
  console.error(`❌ gov:ci-etapes — ${fautes.length} faute(s) contre ${ref} :`);
  for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
  return 1;
}

if (APPELE_DIRECTEMENT) {
  principal().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`❌ gov:ci-etapes — workflow illisible : ${(e as Error).message}`);
      process.exit(1);
    }
  );
}
