/**
 * classer-la-fusion.ts — la place d'une fusion lue sur la forge par rapport à l'arbre testé
 * (GOV-141, REQ-GOV-006). Lu par `scripts/gates/gov-etat.ts`, jugé par
 * `tests/unit/gouvernance/gov-etat-fusions-ancetres.spec.ts`.
 *
 * Une garde qui juge l'état vivant ne juge que ce que l'arbre testé CONTIENT. Une fusion présente
 * dans le clone sans être un ancêtre de HEAD appartient à une autre ligne d'histoire : la juger
 * faisait rougir chaque PR en retard sur `main` à chaque fusion d'une autre. Le classement se lit
 * sur le GRAPHE (`git merge-base --is-ancestor`), jamais sur une date.
 *
 * Ce module vit hors de la garde parce que la garde s'exécute dès qu'on l'importe : la règle ne
 * serait jugeable qu'à travers un dépôt complet simulé.
 */
import { spawnSync } from 'node:child_process';

/** `ancetre` : jugée · `hors_arbre` : nommée, jamais jugée · `introuvable` : absente du clone. */
export type ClasseDeFusion = 'ancetre' | 'hors_arbre' | 'introuvable';

/** Lance `git` et rend son code de sortie et sa sortie. Injecté pour que le banc choisisse son dépôt. */
export type ExecuterGit = (args: string[]) => { code: number; sortie: string };

/** `git` dans un dossier donné (le dossier courant par défaut), sans shell. */
export function executerGit(cwd?: string): ExecuterGit {
  return (args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { code: r.status ?? -1, sortie: (r.stdout ?? '').trim() };
  };
}

/**
 * La classe d'une fusion. `--is-ancestor` rend 0 (ancêtre), 1 (pas ancêtre), autre chose sur une
 * erreur : l'erreur ne vaut JAMAIS « hors de l'arbre », elle vaut `introuvable` (échec fermé,
 * puisque la garde ne l'exempte qu'à des conditions qu'elle nomme).
 */
export function classerLaFusion(oid: string, git: ExecuterGit): ClasseDeFusion {
  if (git(['cat-file', '-e', `${oid}^{commit}`]).code !== 0) return 'introuvable';
  const { code } = git(['merge-base', '--is-ancestor', oid, 'HEAD']);
  if (code === 0) return 'ancetre';
  if (code === 1) return 'hors_arbre';
  return 'introuvable';
}

/**
 * Un clone superficiel coupe le graphe : un ancêtre réel peut y paraître hors de l'arbre, et un
 * commit présent y manquer. Une réponse illisible vaut « superficiel » (échec fermé).
 */
export function estUnCloneSuperficiel(git: ExecuterGit): boolean {
  return git(['rev-parse', '--is-shallow-repository']).sortie !== 'false';
}
