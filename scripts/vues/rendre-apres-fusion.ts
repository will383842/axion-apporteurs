/**
 * `pnpm vues:rendre` et `pnpm vues:hors-git` — LES VUES DÉRIVÉES SONT RENDUES À LA VOLÉE, JAMAIS
 * COMMITÉES (GOV-123, REQ-GOV-032, REQ-GOV-006).
 *
 * LE DÉFAUT MESURÉ (2026-09-29). Les sept vues de `VUES_DERIVEES` (`scripts/vues/vues.ts`) étaient
 * commitées. Chaque fusion sur `main` les faisait diverger dans TOUTES les autres PR : conflit,
 * nouvelle tête, porte A relancée, reconfirmations périmées — la PR #230 trois fois le même jour,
 * puis #239, #241 et #242. Une vue n'a rien à fusionner : elle se REND depuis sa source.
 *
 * LA VOIE RETENUE, ET POURQUOI PAS L'AUTRE. Deux voies étaient ouvertes par l'acceptation de
 * GOV-123 : un job après fusion qui commite les vues sur `main`, ou des vues rendues à la volée et
 * non commitées. La première exige un jeton en écriture et un contournement de la protection de
 * `main` (la vérification `gate-a` y est obligatoire), et `partners/ADR-0006` §4 interdit à tout
 * workflow de pousser sur la branche principale. La seconde n'exige rien de tout cela. Décision
 * d'A01 : RENDU À LA VOLÉE. Le nom de ce fichier est celui que la tâche a déclaré dans ses `paths` ;
 * « après fusion » s'y lit au sens large — les vues se rendent sur l'arbre extrait, après toute
 * fusion, et jamais dans un commit.
 *
 * CE QUE FONT LES DEUX COMMANDES :
 *
 *   — `pnpm vues:rendre` rend TOUTES les vues, dans l'ordre de `VUES_DERIVEES` (`docs/PLAN-STATE.md`
 *     en DERNIER), puis les rend une SECONDE fois et compare les octets. Un rendu en échec, une vue
 *     absente après son rendu, ou deux rendus successifs qui diffèrent d'un octet sont un ROUGE qui
 *     NOMME la vue. C'est ce qui rend utiles les vérificateurs qui la suivent en porte A : ils ne
 *     comparent plus une vue commitée à sa source (il n'y en a plus), ils confrontent le rendu du
 *     jour à sa source, et ce rendu est reproductible.
 *   — `pnpm vues:hors-git` refuse un arbre où une vue est SUIVIE par git (une PR qui en rajoute une,
 *     même par `git add -f`) ou n'est plus IGNORÉE par `.gitignore` (celle qui s'apprête à le faire).
 *     Chaque fichier fautif est nommé.
 *
 * ⚠️ LIMITE DÉCLARÉE. `docs/PLAN-STATE.md` lit la forge (`gh pr list`, `gh issue list`,
 * `origin/main`). En porte A, l'étape de rendu ne reçoit AUCUN jeton : les deux lectures échouent
 * de la même façon, et le rendu est reproductible. Sur un poste authentifié, une PR qui change
 * d'état entre les deux rendus fait rougir la comparaison, en nommant la vue : on relance.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { rendreLesVues } from './fusion';
import { VUES_DERIVEES } from './vues';

export type Issue = { code: 0 | 1; lignes: string[] };

/** Les chemins des vues, dans l'ordre du rendu. */
export const CHEMINS_DES_VUES: readonly string[] = VUES_DERIVEES.map((v) => v.chemin);

/**
 * LA GARDE DE L'INDEX. `suivis` : ce que git suit ; `estIgnoree` : ce que `.gitignore` écarte.
 * Une vue suivie, ou une vue que `.gitignore` n'écarte pas, est nommée.
 */
export function jugerHorsGit(
  suivis: readonly string[],
  estIgnoree: (chemin: string) => boolean,
  vues: readonly string[] = CHEMINS_DES_VUES
): Issue {
  const ensemble = new Set(suivis);
  const sousGit = vues.filter((v) => ensemble.has(v));
  const nonIgnorees = vues.filter((v) => !ensemble.has(v) && !estIgnoree(v));
  const lignes: string[] = [];
  for (const v of sousGit) {
    lignes.push(
      `[vue_sous_git] \`${v}\` est SUIVIE par git : une vue dérivée ne se commite plus, elle se ` +
        'rend (`pnpm vues:rendre`). Retire-la de l’index : `git rm --cached -- ' +
        v +
        '`.'
    );
  }
  for (const v of nonIgnorees) {
    lignes.push(
      `[vue_non_ignoree] \`${v}\` n’est pas écartée par \`.gitignore\` : le prochain \`git add\` ` +
        'la remettrait dans une PR.'
    );
  }
  if (lignes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ vues:hors-git — ${sousGit.length} vue(s) sous git, ${nonIgnorees.length} vue(s) non ` +
          'ignorée(s) :',
        ...lignes.map((l) => `   ${l}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ vues:hors-git — les ${vues.length} vues dérivées sont hors de l’index et ignorées : ` +
        vues.join(', ') +
        '.',
    ],
  };
}

export type DemandeDeRendu = {
  /** Rend toutes les vues ; `false` au premier échec (le rendu nomme lui-même la commande). */
  rendre: () => boolean;
  /** Les octets d'une vue, `null` si elle est absente. */
  lire: (chemin: string) => Buffer | null;
  vues?: readonly string[];
};

/** Le premier octet où deux rendus divergent — pour que le rouge dise OÙ, pas seulement QUE. */
function premierEcart(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}

/**
 * LE RENDU REPRODUCTIBLE. Deux rendus complets, puis la comparaison vue par vue, octet par octet.
 * Tout rouge nomme la vue ; aucun n'est tu derrière un « les fichiers diffèrent ».
 */
export function rendreDeuxFois(d: DemandeDeRendu): Issue {
  const vues = d.vues ?? CHEMINS_DES_VUES;
  const lirePasse = (): Map<string, Buffer | null> => new Map(vues.map((v) => [v, d.lire(v)]));

  if (!d.rendre()) {
    return { code: 1, lignes: ['❌ vues:rendre — le premier rendu a échoué (voir ci-dessus).'] };
  }
  const premier = lirePasse();
  const absentes = vues.filter((v) => premier.get(v) === null);
  if (absentes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ vues:rendre — ${absentes.length} vue(s) ABSENTE(S) après leur rendu : ` +
          `${absentes.join(', ')}. Le générateur a rendu 0 sans écrire.`,
      ],
    };
  }
  if (!d.rendre()) {
    return { code: 1, lignes: ['❌ vues:rendre — le second rendu a échoué (voir ci-dessus).'] };
  }
  const second = lirePasse();
  const lignes: string[] = [];
  for (const v of vues) {
    const a = premier.get(v)!;
    const b = second.get(v) ?? null;
    if (b === null) {
      lignes.push(`[rendu_non_reproductible] \`${v}\` a disparu au second rendu.`);
    } else if (!a.equals(b)) {
      lignes.push(
        `[rendu_non_reproductible] \`${v}\` : deux rendus successifs diffèrent dès l’octet ` +
          `${premierEcart(a, b)} (${a.length} puis ${b.length} octets).`
      );
    }
  }
  if (lignes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ vues:rendre — ${lignes.length} vue(s) non reproductible(s) : un rendu qui change d’un ` +
          'passage à l’autre ne peut être confronté à rien.',
        ...lignes.map((l) => `   ${l}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ vues:rendre — ${vues.length} vues rendues deux fois, identiques octet par octet : ` +
        vues.join(', ') +
        '.',
    ],
  };
}

/**
 * LA DATE D'UNE VUE RENDUE (REQ-GOV-006 : « sa date de mise à jour ≥ date de la dernière PR
 * fusionnée »). Une vue rendue à la volée décrit l'arbre extrait : sa date est celle de `HEAD`.
 * Une vue encore commitée (branche antérieure à GOV-123) garde la date de son dernier commit.
 * Une vue ABSENTE du disque n'a pas de date : `null`, et le lecteur le dit.
 */
export function dateDUneVue(
  chemin: string,
  git: (args: string[]) => string | null,
  existe: (chemin: string) => boolean = existsSync
): string | null {
  if (!existe(chemin)) return null;
  // `cat-file -t` rend « blob » quand `HEAD` porte le fichier, et échoue sinon (`null`).
  return git(['cat-file', '-t', `HEAD:${chemin}`]) !== null
    ? git(['log', '-1', '--format=%cI', '--', chemin])
    : git(['log', '-1', '--format=%cI', 'HEAD']);
}

const lireSurLeDisque =
  (racine: string) =>
  (chemin: string): Buffer | null => {
    const p = join(racine, chemin);
    return existsSync(p) ? readFileSync(p) : null;
  };

const ignoreeParGit = (chemin: string): boolean =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', '--', chemin], { stdio: 'ignore' })
    .status === 0;

// GARDÉE : ce module est IMPORTÉ par son test et par `gov-etat.ts` ; l'import ne rend ni ne sort.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const issue = process.argv.includes('--hors-git')
    ? jugerHorsGit(fichiersSuivisOuRefus('vues:hors-git'), ignoreeParGit)
    : rendreDeuxFois({ rendre: () => rendreLesVues(), lire: lireSurLeDisque('.') });
  (issue.code === 0 ? console.log : console.error)(issue.lignes.join('\n'));
  process.exit(issue.code);
}
