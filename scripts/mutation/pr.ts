/**
 * `pnpm mutation:pr [--base <ref>]` — Stryker sur les fichiers mutables d'UNE PR (GOV-101,
 * REQ-QA-002). Appelé par la porte A ; lancé à la main avant d'ouvrir une PR qui touche le code.
 *
 * POURQUOI. Décision de Will du 2026-09-26 (`W16`, `partners/ADR-0024`) : la lentille `mutation`
 * n'est plus une revue d'agent. Un agent qui écrivait « les gardes ont été vues rougir sur une
 * mutation réelle » le DÉCLARAIT ; Stryker le MESURE, et nomme chaque survivant `fichier:ligne`.
 *
 * CE QUI EST MUTÉ (`fichiersAMuter`) : les sources TypeScript de `src/domain/`, `src/server/` et
 * `src/lib/` que la PR ajoute ou modifie — pas un test, pas une déclaration de types. Le diff
 * part de la BASE DE FUSION avec `<base>` (défaut : `origin/$GITHUB_BASE_REF` en CI, `origin/main` en local) : sur
 * `push` de `main`, il est vide, et la commande le DIT et sort en 0.
 *
 * CE QUI N'EST PAS MUTÉ, ET EST NOMMÉ — JAMAIS TU : le reste de `src/` (voir
 * `MOTIF_DU_RESTE_DU_PRODUIT`), et les scripts de garde (`scripts/**`). Les témoins d'une garde
 * la lancent en SOUS-PROCESSUS (`npx tsx scripts/gates/…`) : l'instrumentation de Stryker n'y active
 * aucun mutant, chaque mutant y « survivrait », et la porte A rougirait sur un faux. Leur preuve
 * de mutation est leur `--prove`, joué en porte A pour CHAQUE garde (un témoin par famille, vu
 * rougir). Dette nommée dans `partners/ADR-0024` : une passe Stryker sur les fonctions PURES des
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

/**
 * LE PÉRIMÈTRE MUTÉ — tranché par `W16` : le code du produit que des tests EN PROCESSUS jugent.
 * `src/lib/` y entre au second tour de relecture (`forme-iban.ts` touche l'argent, `env.ts` la
 * sécurité) ; ses tests unitaires sont dans `vitest.mutation.config.ts`.
 */
export const RACINES_MUTEES: readonly string[] = ['src/domain/', 'src/server/', 'src/lib/'];
export const RACINE_DES_GARDES = 'scripts/';
export const RACINE_DU_PRODUIT = 'src/';
export const RAPPORT_DE_LA_PR = 'reports/mutation/pr.json';
export const CONFIG_DE_LA_PR = 'reports/mutation/stryker.pr.config.json';
export const INCREMENTAL_DE_LA_PR = 'reports/mutation/pr-incremental.json';

const MOTIF_DES_GARDES =
  'script de garde : ses témoins la lancent en sous-processus, que Stryker ne voit pas ; sa ' +
  'preuve de mutation est son `--prove`, joué en porte A';
/**
 * Le reste de `src/` — routes et pages de `src/app/`, `src/proxy.ts`, `src/instrumentation.ts`,
 * `src/config/`, `src/content/` : ce code se juge par le RENDU (Next, navigateur, banc Docker),
 * hors du processus de vitest que Stryker instrumente. Chaque mutant y sortirait « sans
 * couverture » et la porte A rougirait sur un faux. Il est donc ÉCARTÉ, et NOMMÉ : jamais tu.
 */
const MOTIF_DU_RESTE_DU_PRODUIT =
  'code de surface Next (route, page, proxy, instrumentation, configuration, contenu) : ses tests ' +
  'le jugent au rendu ou en navigateur, hors du processus que Stryker instrumente';

const estUnSource = (f: string): boolean =>
  /\.tsx?$/.test(f) && !/\.(spec|test)\.tsx?$/.test(f) && !f.endsWith('.d.ts');

/**
 * Les fichiers de la PR à muter, et ceux qu'on écarte EN LE DISANT. Tout source touché sous `src/`
 * ou `scripts/` tombe dans l'un des deux : aucun n'est sauté en silence (témoin : « tout source
 * touché sous src/ ou scripts/ est soit muté, soit écarté avec motif »).
 */
export function fichiersAMuter(fichiers: readonly string[]): {
  mutes: string[];
  ecartes: { fichier: string; motif: string }[];
} {
  const sources = fichiers.filter(estUnSource);
  const mutes = sources.filter((f) => RACINES_MUTEES.some((r) => f.startsWith(r)));
  const ecartes = sources
    .filter((f) => !mutes.includes(f))
    .flatMap((fichier) =>
      fichier.startsWith(RACINE_DES_GARDES)
        ? [{ fichier, motif: MOTIF_DES_GARDES }]
        : fichier.startsWith(RACINE_DU_PRODUIT)
          ? [{ fichier, motif: MOTIF_DU_RESTE_DU_PRODUIT }]
          : []
    );
  return { mutes, ecartes };
}

/**
 * LES DÉSACTIVATIONS DE STRYKER — `// Stryker disable …` retire des mutants du score SANS qu'aucun
 * survivant ne s'imprime : c'est la porte de sortie silencieuse de la mesure. Dans un fichier que
 * la PR mute, elle fait ÉCHOUER la passe et se nomme `fichier:ligne`. Une exception légitime se
 * déclare alors en revue, pas dans le code.
 */
export function desactivationsDeStryker(
  fichiers: readonly string[],
  lire: (chemin: string) => string
): string[] {
  const trouvees: string[] = [];
  for (const f of fichiers) {
    lire(f)
      .split(/\r\n|\r|\n/)
      .forEach((ligne, i) => {
        if (/Stryker\s+disable/i.test(ligne)) trouvees.push(`${f}:${i + 1}`);
      });
  }
  return trouvees;
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

/**
 * LES MESURES de la passe, injectables pour les témoins de `passer()` — absentes : le vrai `git`,
 * le vrai disque, le vrai Stryker. Ce que le témoin fait varier n'a jamais de défaut chez lui.
 */
export type Mesures = {
  fichiersDeLaPr?: (base: string) => string[] | null;
  lire?: (chemin: string) => string;
  texteConfig?: string;
  /** Lance Stryker sur la configuration écrite ; rend son code de sortie. */
  lancerStryker?: (config: object) => number | null;
  lireRapport?: () => unknown;
};

function lancerLeVraiStryker(config: object): number | null {
  mkdirSync('reports/mutation', { recursive: true });
  writeFileSync(CONFIG_DE_LA_PR, JSON.stringify(config, null, 2));
  // Un rapport d'une passe PRÉCÉDENTE serait lu comme celui-ci si Stryker tombait avant d'écrire.
  rmSync(RAPPORT_DE_LA_PR, { force: true });
  return spawnSync(
    process.execPath,
    ['node_modules/@stryker-mutator/core/bin/stryker.js', 'run', CONFIG_DE_LA_PR],
    { stdio: 'inherit' }
  ).status;
}

function lireLeVraiRapport(): unknown {
  try {
    return existsSync(RAPPORT_DE_LA_PR)
      ? (JSON.parse(readFileSync(RAPPORT_DE_LA_PR, 'utf8')) as unknown)
      : null;
  } catch {
    return null;
  }
}

/** La passe entière. Rend le code de sortie et les lignes à imprimer ; ne sort pas. */
export function passer(base: string, m: Mesures = {}): { code: 0 | 1; lignes: string[] } {
  const fichiers = (m.fichiersDeLaPr ?? fichiersDeLaPr)(base);
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
  const desactivations = desactivationsDeStryker(
    mutes,
    m.lire ?? ((f: string) => readFileSync(f, 'utf8'))
  );
  if (desactivations.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ mutation:pr — ${desactivations.length} désactivation(s) de Stryker dans les fichiers ` +
          `mutés : ${desactivations.join(', ')}. Elles retirent des mutants du score sans en ` +
          `nommer aucun ; une exception se déclare en revue, pas dans le code.`,
        ...lignes,
      ],
    };
  }
  const texte = m.texteConfig ?? readFileSync(CHEMIN_CONFIG, 'utf8');
  const config = configDeLaPr(JSON.parse(texte) as Record<string, unknown>, mutes);
  console.log(
    `mutation:pr — ${mutes.length} fichier(s) muté(s) en bac à sable :\n   ${mutes.join('\n   ')}`
  );
  const sortie = (m.lancerStryker ?? lancerLeVraiStryker)(config);
  const d = decider({ rapport: (m.lireRapport ?? lireLeVraiRapport)(), seuil: lireSeuil(texte) });
  const echec = sortie !== 0 || d.code !== 0;
  return {
    code: echec ? 1 : 0,
    lignes: [
      ...d.lignes,
      ...(sortie !== 0 ? [`❌ mutation:pr — Stryker est sorti en ${String(sortie)}.`] : []),
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
