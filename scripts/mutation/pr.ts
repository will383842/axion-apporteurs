/**
 * `pnpm mutation:pr [--base <ref>]` — Stryker sur les fichiers mutables d'UNE PR (GOV-101,
 * REQ-QA-002). Appelé par la porte A ; lancé à la main avant d'ouvrir une PR qui touche le code.
 *
 * POURQUOI. Décision de Will du 2026-09-26 (`W16`, `partners/ADR-0022`) : la lentille `mutation`
 * n'est plus une revue d'agent. Un agent qui écrivait « les gardes ont été vues rougir sur une
 * mutation réelle » le DÉCLARAIT ; Stryker le MESURE, et nomme chaque survivant `fichier:ligne`.
 *
 * CE QUI EST MUTÉ (`fichiersAMuter`) : les sources TypeScript de `src/domain/` et de `src/server/`
 * que la PR ajoute ou modifie — pas un test, pas une déclaration de types. Le diff part de la BASE
 * DE FUSION avec `<base>` (défaut : `origin/$GITHUB_BASE_REF` en CI, `origin/main` en local) : sur
 * `push` de `main`, il est vide, et la commande le DIT et sort en 0.
 *
 * CE QUI N'EST PAS MUTÉ, ET EST NOMMÉ : les scripts de garde (`scripts/**`). Leurs témoins lancent
 * la garde en SOUS-PROCESSUS (`npx tsx scripts/gates/…`) : l'instrumentation de Stryker n'y active
 * aucun mutant, chaque mutant y « survivrait », et la porte A rougirait sur un faux. Leur preuve
 * de mutation est leur `--prove`, joué en porte A pour CHAQUE garde (un témoin par famille, vu
 * rougir). Dette nommée dans `partners/ADR-0022` : une passe Stryker sur les fonctions PURES des
 * gardes, jugées en processus.
 *
 * LE BAC À SABLE EST OBLIGATOIRE (`inPlace: false`, écrit en toutes lettres dans la configuration
 * dérivée) : une passe EN PLACE interrompue a laissé 220 fichiers suivis réécrits le 2026-09-25.
 *
 * LA CONFIGURATION EST DÉRIVÉE de `stryker.config.json` (RM-01) : seuil (`thresholds.break`),
 * lanceur, configuration de vitest, parallélisme — tout est hérité. Ne changent que `mutate`, le
 * mode incrémental, le fichier incrémental et le rapport, écrits sous `reports/mutation/` (ignoré).
 *
 * LE VERDICT est celui du lecteur unique du rapport (`scripts/mutation/rapport.ts`, `decider`) :
 * score sous le seuil → 1, survivants NOMMÉS ; rapport absent ou vide → 1. Stryker en échec → 1.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHEMIN_CONFIG, decider, lireSeuil } from './rapport';

export const RACINES_MUTEES: readonly string[] = ['src/domain/', 'src/server/'];
export const RACINE_DES_GARDES = 'scripts/';
export const RAPPORT_DE_LA_PR = 'reports/mutation/pr.json';
export const CONFIG_DE_LA_PR = 'reports/mutation/stryker.pr.config.json';
export const INCREMENTAL_DE_LA_PR = 'reports/mutation/pr-incremental.json';

const MOTIF_DES_GARDES =
  'script de garde : ses témoins la lancent en sous-processus, que Stryker ne voit pas ; sa ' +
  'preuve de mutation est son `--prove`, joué en porte A';

/** Les fichiers de la PR à muter, et ceux qu'on écarte en le disant. */
export function fichiersAMuter(fichiers: readonly string[]): {
  mutes: string[];
  ecartes: { fichier: string; motif: string }[];
} {
  const source = (f: string): boolean =>
    /\.tsx?$/.test(f) && !/\.(spec|test)\.tsx?$/.test(f) && !f.endsWith('.d.ts');
  const mutes = fichiers.filter((f) => RACINES_MUTEES.some((r) => f.startsWith(r)) && source(f));
  const ecartes = fichiers
    .filter((f) => f.startsWith(RACINE_DES_GARDES) && source(f))
    .map((fichier) => ({ fichier, motif: MOTIF_DES_GARDES }));
  return { mutes, ecartes };
}

/** La configuration de la PR, DÉRIVÉE de celle du dépôt : seuls changent la cible et les fichiers. */
export function configDeLaPr(base: Record<string, unknown>, mutes: readonly string[]): object {
  return {
    ...base,
    mutate: [...mutes],
    inPlace: false,
    incremental: true,
    incrementalFile: INCREMENTAL_DE_LA_PR,
    jsonReporter: { fileName: RAPPORT_DE_LA_PR },
  };
}

/**
 * Les fichiers ajoutés ou modifiés par la PR depuis sa base de fusion avec `base`, ou `null`. Le
 * diff va jusqu'à l'ARBRE DE TRAVAIL, pas jusqu'à `HEAD` : lancé à la main avant un commit, il voit
 * ce que Stryker copiera dans son bac à sable. En CI, l'arbre EST le commit. Un fichier neuf non
 * encore suivi par git n'y est pas : `git add` d'abord.
 */
export function fichiersDeLaPr(base: string): string[] | null {
  try {
    const mb = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
    return execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'diff',
        '--name-only',
        '--no-renames',
        '--diff-filter=AM',
        '-z',
        mb,
      ],
      { encoding: 'utf8', maxBuffer: 64e6 }
    )
      .split('\0')
      .filter((f) => f !== '');
  } catch {
    return null;
  }
}

/** La passe entière. Rend le code de sortie et les lignes à imprimer ; ne sort pas. */
export function passer(base: string): { code: 0 | 1; lignes: string[] } {
  const fichiers = fichiersDeLaPr(base);
  if (fichiers === null) {
    return {
      code: 1,
      lignes: [
        `❌ mutation:pr — la base \`${base}\` est introuvable : le diff de la PR n'est pas mesurable.`,
      ],
    };
  }
  const { mutes, ecartes } = fichiersAMuter(fichiers);
  const lignes = ecartes.map((e) => `   · écarté : ${e.fichier} — ${e.motif}`);
  if (mutes.length === 0) {
    return {
      code: 0,
      lignes: [
        `✅ mutation:pr — aucun fichier mutable (${RACINES_MUTEES.join(', ')}) dans les ` +
          `${fichiers.length} fichier(s) de la PR contre ${base} : rien à muter.`,
        ...lignes,
      ],
    };
  }
  const texte = readFileSync(CHEMIN_CONFIG, 'utf8');
  mkdirSync('reports/mutation', { recursive: true });
  writeFileSync(
    CONFIG_DE_LA_PR,
    JSON.stringify(configDeLaPr(JSON.parse(texte) as Record<string, unknown>, mutes), null, 2)
  );
  console.log(
    `mutation:pr — ${mutes.length} fichier(s) muté(s) en bac à sable :\n   ${mutes.join('\n   ')}`
  );
  // Un rapport d'une passe PRÉCÉDENTE serait lu comme celui-ci si Stryker tombait avant d'écrire.
  rmSync(RAPPORT_DE_LA_PR, { force: true });
  const stryker = spawnSync(
    process.execPath,
    ['node_modules/@stryker-mutator/core/bin/stryker.js', 'run', CONFIG_DE_LA_PR],
    { stdio: 'inherit' }
  );
  const rapport = ((): unknown => {
    try {
      return existsSync(RAPPORT_DE_LA_PR)
        ? (JSON.parse(readFileSync(RAPPORT_DE_LA_PR, 'utf8')) as unknown)
        : null;
    } catch {
      return null;
    }
  })();
  const d = decider({ rapport, seuil: lireSeuil(texte) });
  const echec = stryker.status !== 0 || d.code !== 0;
  return {
    code: echec ? 1 : 0,
    lignes: [
      ...d.lignes,
      ...(stryker.status !== 0
        ? [`❌ mutation:pr — Stryker est sorti en ${String(stryker.status)}.`]
        : []),
      ...lignes,
    ],
  };
}

// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni muter ni sortir.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const i = process.argv.indexOf('--base');
  const baseCi = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null;
  const base = i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : (baseCi ?? 'origin/main');
  const issue = passer(base);
  (issue.code === 0 ? console.log : console.error)(issue.lignes.join('\n'));
  process.exit(issue.code);
}
