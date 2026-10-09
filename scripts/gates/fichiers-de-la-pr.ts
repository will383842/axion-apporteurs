/**
 * fichiers-de-la-pr.ts — le périmètre d'une garde qui ne juge QUE la PR (GOV-160).
 *
 * Décision de Williams (#319, commentaire 6077512137) : sur une PR, une garde de texte ne juge que
 * les fichiers AJOUTÉS ou MODIFIÉS par la PR — un défaut déjà sur main ne bloque pas une PR sans
 * rapport. Sur main (push) ou en local, rien n'est restreint : la garde balaie tout le dépôt suivi.
 * Un diff illisible retombe sur le balayage complet — jamais sur une liste vide (voir
 * `scripts/lot/fichiers-suivis.ts` : « je n'ai rien regardé » n'est pas un vert).
 *
 * Source unique (RM-01) des gardes `gov:publication`, `gov:termes-interdits`, `gov:lexique`,
 * `jur:lexique-social`, `jur:aucun-agregat-reseau`, `jur:aucune-progression`,
 * `jur:copy-indicative-partners` et `jur:grille-chiffree`.
 */
import { execFileSync } from 'node:child_process';

/** Les chemins de `chemins` que la PR ajoute ou modifie ; tous, hors PR ou si le diff est illisible. */
export function restreindreALaPr(chemins: readonly string[]): string[] {
  const base = process.env['GITHUB_BASE_REF'];
  if (process.env['GITHUB_EVENT_NAME'] !== 'pull_request' || !base) return [...chemins];
  let diff: string[];
  try {
    diff = execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'diff',
        '--name-only',
        '--diff-filter=AM',
        `origin/${base}...HEAD`,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return [...chemins];
  }
  const dansLaPr = new Set(diff);
  return chemins.filter((c) => dansLaPr.has(c));
}
