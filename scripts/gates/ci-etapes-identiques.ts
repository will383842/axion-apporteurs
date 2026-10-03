/**
 * `pnpm gov:ci-etapes [--base <ref>]` · `pnpm gov:ci-etapes:prove` — le découpage de la porte A en
 * jobs ne perd, ne double ni n'altère AUCUNE étape.
 *
 * POURQUOI. La porte A tient en un job d'environ cent vingt étapes, dont « Tests » prend l'essentiel
 * du temps. La couper en jobs parallèles est un gain de temps ; c'est aussi l'occasion idéale de
 * perdre une garde sans que rien ne rougisse : une étape oubliée dans la copie, une étape jouée deux
 * fois et dont l'une est désarmée, un `if:` glissé au passage. Ce témoin confronte les étapes de la
 * BASE (`origin/main` par défaut) à celles de la TÊTE.
 *
 * LES RÈGLES.
 *  1. Chaque étape de la base SURVIT à l'identique (même contenu, clé par clé, nom compris) dans
 *     EXACTEMENT un job de la tête. Absente : `etape_disparue`. Présente sous le même nom avec un
 *     autre contenu : `etape_alteree`. Présente dans deux jobs : `etape_dupliquee`. Un job à matrice
 *     compte UNE fois : ses éclats exécutent la même étape écrite une fois.
 *  2. Les étapes du SOCLE (récupérer le dépôt, installer pnpm et node, `pnpm install`, les caches)
 *     sont l'installation de chaque job : elles peuvent être répétées, jamais retirées de tous.
 *  3. Une étape qui doit CHANGER pour être découpée (« Tests » devient des éclats et une fusion)
 *     est déclarée dans `TRANSFORMATIONS`, avec les noms qui la remplacent et la raison. Un nom
 *     déclaré absent de la tête : `transformation_sans_cible`.
 *  4. Chaque job de la tête porte la garde de fusion au niveau du job (`merged != true`), sans
 *     quoi un job sauterait sans rouge : `job_sans_garde_de_fusion`.
 *  5. Quand la tête a plusieurs jobs, le job `gate-a` est la porte finale et attend TOUS les
 *     autres (`needs:`) : `porte_finale_incomplete`.
 *
 * CE QU'IL NE JUGE PAS, ET C'EST DIT. Une étape NOUVELLE de la tête est permise (une fusion de
 * rapports, un dépôt d'artefact) et nommée dans la sortie. L'ordre des étapes dans un job n'est pas
 * jugé : `req:check` et les lecteurs de résultats jugent leur propre place.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estObjet, lireYaml } from '../lib/lire-yaml';

export const WORKFLOW = '.github/workflows/ci.yml';
export const PORTE_FINALE = 'gate-a';
export const GARDE_DE_FUSION = 'github.event.pull_request.merged != true';

export type Etape = Readonly<Record<string, unknown>>;
export interface Job {
  readonly nom: string;
  readonly si: string | null;
  readonly attend: readonly string[];
  readonly etapes: readonly Etape[];
}

/** Une étape de la base qui change pour être découpée, et ce qui la remplace dans la tête. */
export interface Transformation {
  readonly vers: readonly string[];
  readonly pourquoi: string;
}

/** Les transformations déclarées. Vide tant que la porte A n'est pas découpée. */
export const TRANSFORMATIONS: Readonly<Record<string, Transformation>> = {};

export type Famille =
  | 'etape_disparue'
  | 'etape_alteree'
  | 'etape_dupliquee'
  | 'transformation_sans_cible'
  | 'job_sans_garde_de_fusion'
  | 'porte_finale_incomplete';

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
    };
  });
}

/** Le juge, pur : la base, la tête et les transformations déclarées donnent les fautes. */
export function jugerLesEtapes(
  base: readonly Job[],
  tete: readonly Job[],
  transformations: Readonly<Record<string, Transformation>> = TRANSFORMATIONS
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
    if (estDuSocle(e)) {
      if (jobs.length === 0) {
        fautes.push({
          famille: 'etape_disparue',
          message: `L'étape du socle « ${nom} » n'est plus dans aucun job.`,
        });
      }
      continue;
    }
    if (jobs.length === 0) {
      const homonymes = parNom.get(nom) ?? [];
      fautes.push(
        homonymes.length > 0
          ? {
              famille: 'etape_alteree',
              message: `« ${nom} » existe dans ${homonymes.join(', ')} avec un autre contenu que dans la base.`,
            }
          : { famille: 'etape_disparue', message: `« ${nom} » n'est plus dans aucun job.` }
      );
    } else if (jobs.length > 1) {
      fautes.push({
        famille: 'etape_dupliquee',
        message: `« ${nom} » est jouée dans ${jobs.length} jobs (${jobs.join(', ')}) : une seule place.`,
      });
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
  if (tete.length > 1) {
    const porte = tete.find((j) => j.nom === PORTE_FINALE);
    const autres = tete.filter((j) => j.nom !== PORTE_FINALE).map((j) => j.nom);
    const manquants =
      porte === undefined ? autres : autres.filter((n) => !porte.attend.includes(n));
    if (porte === undefined || manquants.length > 0) {
      fautes.push({
        famille: 'porte_finale_incomplete',
        message:
          porte === undefined
            ? `Aucun job « ${PORTE_FINALE} » : la porte finale manque.`
            : `« ${PORTE_FINALE} » n'attend pas : ${manquants.join(', ')}.`,
      });
    }
  }
  return fautes;
}

// ── la preuve : chaque famille rougit sur une faute plantée dans la base ──────────────────────

interface Cas {
  readonly famille: Famille;
  readonly planter: (base: readonly Job[]) => {
    tete: Job[];
    transformations?: Record<string, Transformation>;
  };
}

const garde = `\${{ ${GARDE_DE_FUSION} }}`;
const premiereNonSocle = (jobs: readonly Job[]): Etape => {
  const e = jobs.flatMap((j) => j.etapes).find((x) => !estDuSocle(x));
  if (e === undefined) throw new Error('la base ne porte aucune étape hors socle');
  return e;
};
const sans = (jobs: readonly Job[], cible: Etape): Job[] =>
  jobs.map((j) => ({ ...j, etapes: j.etapes.filter((e) => e !== cible) }));

export const CAS_DE_PREUVE: readonly Cas[] = [
  {
    famille: 'etape_disparue',
    planter: (b) => ({ tete: sans(b, premiereNonSocle(b)) }),
  },
  {
    famille: 'etape_alteree',
    planter: (b) => {
      const e = premiereNonSocle(b);
      return {
        tete: b.map((j) => ({
          ...j,
          etapes: j.etapes.map((x) => (x === e ? { ...x, 'continue-on-error': true } : x)),
        })),
      };
    },
  },
  {
    famille: 'etape_dupliquee',
    planter: (b) => {
      const e = premiereNonSocle(b);
      const second: Job = { nom: 'eclat', si: garde, attend: [], etapes: [e] };
      const porte = b.map((j) => ({ ...j, nom: PORTE_FINALE, attend: ['eclat'] }));
      return { tete: [...porte, second] };
    },
  },
  {
    famille: 'transformation_sans_cible',
    planter: (b) => {
      const e = premiereNonSocle(b);
      return {
        tete: sans(b, e),
        transformations: {
          [nomDeLEtape(e)]: { vers: ['une étape qui n’existe pas'], pourquoi: 'preuve' },
        },
      };
    },
  },
  {
    famille: 'job_sans_garde_de_fusion',
    planter: (b) => ({ tete: b.map((j) => ({ ...j, si: null })) }),
  },
  {
    famille: 'porte_finale_incomplete',
    planter: (b) => {
      const e = premiereNonSocle(b);
      const autre: Job = { nom: 'gardes', si: garde, attend: [], etapes: [e] };
      return { tete: [...sans(b, e).map((j) => ({ ...j, nom: PORTE_FINALE })), autre] };
    },
  },
];

export function prouver(base: readonly Job[]): { code: number; lignes: string[] } {
  const lignes: string[] = [];
  let code = 0;
  const temoin = jugerLesEtapes(base, base, {});
  if (temoin.length > 0) {
    code = 1;
    lignes.push(
      `❌ la base jugée contre elle-même rougit : ${temoin.map((f) => f.famille).join(', ')}`
    );
  }
  for (const cas of CAS_DE_PREUVE) {
    const { tete, transformations } = cas.planter(base);
    const familles = jugerLesEtapes(base, tete, transformations ?? {}).map((f) => f.famille);
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
  const ref = i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : 'origin/main';
  const texteBase = execFileSync('git', ['show', `${ref}:${WORKFLOW}`], { encoding: 'utf8' });
  const base = await lire(texteBase);
  if (process.argv.includes('--prove')) {
    const v = prouver(base);
    (v.code === 0 ? console.log : console.error)(v.lignes.join('\n'));
    return v.code;
  }
  const tete = await lire(readFileSync(WORKFLOW, 'utf8'));
  const fautes = jugerLesEtapes(base, tete);
  const etapesBase = base.reduce((n, j) => n + j.etapes.length, 0);
  const etapesTete = tete.reduce((n, j) => n + j.etapes.length, 0);
  if (fautes.length === 0) {
    console.log(
      `✅ gov:ci-etapes — ${etapesBase} étape(s) de ${ref} confrontée(s) aux ${etapesTete} étape(s) de ${tete.length} job(s) de la tête ; ${Object.keys(TRANSFORMATIONS).length} transformation(s) déclarée(s).`
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
