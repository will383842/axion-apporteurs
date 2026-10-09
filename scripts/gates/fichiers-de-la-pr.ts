/**
 * fichiers-de-la-pr.ts — le périmètre d'une garde qui ne juge QUE la PR (GOV-160).
 *
 * Décision de Williams (#319, commentaire 6077512137) : sur une PR, une garde de texte ne juge que
 * les fichiers que la PR AJOUTE, MODIFIE, RENOMME ou COPIE — un défaut déjà sur main ne bloque pas
 * une PR sans rapport. Sur main (push) ou en local, rien n'est restreint : la garde balaie tout le
 * dépôt suivi. Un diff illisible retombe sur le balayage complet — jamais sur une liste vide (voir
 * `scripts/lot/fichiers-suivis.ts` : « je n'ai rien regardé » n'est pas un vert).
 *
 * Un renommage est jugé sur son chemin d'ARRIVÉE et son contenu entier : un fichier renommé qui
 * gagne une ligne interdite ne passe pas sous le filtre (refus des lentilles sur #859, où
 * `--diff-filter=AM` laissait passer les statuts R et C). La garde de PR, elle, lit les DEUX côtés
 * d'un renommage (`cheminsTouches`) : un fichier critique déplacé reste critique.
 *
 * Source unique (RM-01) des gardes `gov:publication`, `gov:termes-interdits`, `gov:lexique`,
 * `jur:lexique-social`, `jur:aucun-agregat-reseau`, `jur:aucune-progression`,
 * `jur:copy-indicative-partners`, `jur:grille-chiffree`, et du diff lu par `gov:pr`.
 */
import { execFileSync } from 'node:child_process';

/** Une ligne de `git diff --name-status` : statut (A, M, D, R, C, T…), départ éventuel, arrivée. */
export type EntreeDuDiff = { statut: string; depart: string | null; arrivee: string };

/** PURE. La sortie de `git diff --name-status` (renommages et copies détectés). */
export function lireLeDiff(sortie: string): EntreeDuDiff[] {
  return sortie
    .split('\n')
    .filter(Boolean)
    .map((ligne) => {
      const [code = '', a = '', b] = ligne.split('\t');
      const statut = code.charAt(0);
      return b === undefined
        ? { statut, depart: null, arrivee: a }
        : { statut, depart: a, arrivee: b };
    });
}

/** PURE. Ce qu'une garde de CONTENU juge : l'arrivée de tout ce qui n'est pas supprimé. */
export function cheminsJuges(entrees: readonly EntreeDuDiff[]): string[] {
  return entrees.filter((e) => e.statut !== 'D').map((e) => e.arrivee);
}

/** PURE. Ce que la garde de PR classe : tous les chemins, départ ET arrivée. */
export function cheminsTouches(entrees: readonly EntreeDuDiff[]): string[] {
  const vus = new Set<string>();
  for (const e of entrees) {
    if (e.depart !== null) vus.add(e.depart);
    vus.add(e.arrivee);
  }
  return [...vus];
}

/** Le diff de la PR, de la base de divergence à la tête. Lève si git ne sait pas le rendre. */
export function diffEntre(base: string, tete: string, cwd?: string): EntreeDuDiff[] {
  return lireLeDiff(
    execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'diff', '--name-status', '-M', '-C', `${base}...${tete}`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  );
}

/** Les chemins que la PR ajoute, modifie, renomme ou copie ; tous hors PR ou si le diff est illisible. */
export function restreindreALaPr(chemins: readonly string[], cwd?: string): string[] {
  const base = process.env['GITHUB_BASE_REF'];
  if (process.env['GITHUB_EVENT_NAME'] !== 'pull_request' || !base) return [...chemins];
  let juges: string[];
  try {
    juges = cheminsJuges(diffEntre(`origin/${base}`, 'HEAD', cwd));
  } catch {
    return [...chemins];
  }
  const dansLaPr = new Set(juges);
  return chemins.filter((c) => dansLaPr.has(c));
}
