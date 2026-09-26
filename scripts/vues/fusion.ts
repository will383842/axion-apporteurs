/**
 * `pnpm vues:fusion [--base <ref>]` — fusionner `main` dans la branche d'une PR SANS qu'un conflit
 * de vue dérivée coûte un tour de relecture (GOV-101, REQ-GOV-032).
 *
 * LE DÉFAUT MESURÉ (orchestrateur, 2026-09-26). Chaque fusion sur `main` met les autres PR en
 * conflit sur les vues dérivées commitées — `docs/PLAN-STATE.md` et `docs/TRACABILITE.md` changent
 * à chaque PR. Le conflit se résolvait à la main, puis la tête nouvelle périmait tous les accords.
 * Une vue ne se résout pas : elle se REND depuis sa source fusionnée.
 *
 * CE QUE LA COMMANDE FAIT, dans cet ordre :
 *   1. refuse un arbre de travail non propre (elle ne mélange pas ton travail en cours à une fusion) ;
 *   2. `git fetch` si la base est distante, puis `git merge --no-commit --no-ff <base>` ;
 *   3. conflit sur un fichier qui N'EST PAS une vue (`VUES_DERIVEES`) : `git merge --abort`, le
 *      fichier est NOMMÉ, sortie 1 — ce conflit-là est du code, il se résout à la main ;
 *   4. conflit sur des vues SEULES : chacune reprend le côté de la base (pour ôter les marqueurs),
 *      puis TOUTES les vues sont rendues dans l'ordre, `docs/PLAN-STATE.md` en dernier ;
 *   5. un rendu en échec : `git merge --abort`, sortie 1 — on ne commite pas une vue fausse ;
 *   6. sinon, les vues sont ajoutées et la fusion commitée.
 *
 * CE QUI REND LA COMMANDE UTILE, ET QUI N'EST PAS ICI : `scripts/lot/revues.ts` fait survivre un
 * accord dont le diff propre à la PR (hors vues dérivées) est identique avant et après la fusion
 * (`empreinteDuPatch`). Sans cette règle, une fusion propre périmait encore tous les accords.
 *
 * POURQUOI PAS UN ROBOT QUI RÉGÉNÈRE LES VUES SUR `main`. `partners/ADR-0006` §4 (REQ-GOV-014) :
 * aucun workflow ne pousse sur la branche principale, et `aucun-workflow-ne-pousse-sur-main.spec.ts`
 * le tient. Sortir les vues des PR exigerait d'amender cette règle : c'est une décision de Will,
 * pas de cette commande (`partners/ADR-0022`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VUES_DERIVEES, estUneVueDerivee } from './vues';

export type Issue = { code: 0 | 1; lignes: string[] };

/** Les fichiers en conflit, séparés : les vues (qui se rendent) et le reste (qui arrête). */
export function trierLesConflits(conflits: readonly string[]): {
  vues: string[];
  autres: string[];
} {
  return {
    vues: conflits.filter(estUneVueDerivee),
    autres: conflits.filter((f) => !estUneVueDerivee(f)),
  };
}

/** Rend toutes les vues, dans l'ordre ; s'arrête au premier échec. `true` : toutes rendues. */
export function rendreLesVues(cwd?: string): boolean {
  for (const v of VUES_DERIVEES) {
    process.stdout.write(`──▶ ${v.rendu}\n`);
    const r = spawnSync(v.rendu, { shell: true, stdio: 'inherit', ...(cwd ? { cwd } : {}) });
    if (r.status !== 0) {
      console.error(`❌ vues:fusion — le rendu \`${v.rendu}\` a échoué (${v.chemin}).`);
      return false;
    }
  }
  return true;
}

export type Demande = {
  /** Le dépôt. Absent : le répertoire courant. Le témoin construit un vrai dépôt jetable. */
  cwd?: string;
  /** La référence fusionnée : `origin/main` en usage réel. */
  base: string;
  /** Le rendu des vues — injecté par le témoin, `rendreLesVues` en usage réel. */
  rendre: () => boolean;
};

/** LA FUSION. Toute sortie non nulle laisse l'arbre et la tête EXACTEMENT comme avant. */
export function fusionnerMain(d: Demande): Issue {
  const opts = { encoding: 'utf8' as const, ...(d.cwd ? { cwd: d.cwd } : {}) };
  const git = (...a: string[]): string =>
    execFileSync('git', a, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  const essayer = (...a: string[]): boolean =>
    spawnSync('git', a, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] }).status === 0;
  const lignes: string[] = [];

  if (git('status', '--porcelain').trim() !== '') {
    return {
      code: 1,
      lignes: [
        '❌ vues:fusion — l’arbre de travail n’est pas propre : commite ou retire ton travail en ' +
          'cours avant de fusionner la base (aucune remise, aucun `stash`).',
      ],
    };
  }
  const avant = git('rev-parse', 'HEAD').trim();
  const fusionPropre = essayer('merge', '--no-commit', '--no-ff', d.base);
  // Lu par `git`, jamais par un chemin : dans un worktree, `.git` est un fichier, pas un dossier.
  const enFusion = essayer('rev-parse', '-q', '--verify', 'MERGE_HEAD');
  const abandonner = (motif: string): Issue => {
    if (enFusion) essayer('merge', '--abort');
    else essayer('checkout', '--', '.');
    return { code: 1, lignes: [...lignes, motif] };
  };

  if (!fusionPropre) {
    const conflits = git('diff', '--name-only', '--diff-filter=U', '-z')
      .split('\0')
      .filter((f) => f !== '');
    if (conflits.length === 0) {
      return abandonner(`❌ vues:fusion — \`git merge ${d.base}\` a échoué sans conflit lisible.`);
    }
    const { vues, autres } = trierLesConflits(conflits);
    if (autres.length > 0) {
      return abandonner(
        `❌ vues:fusion — conflit sur ${autres.length} fichier(s) qui ne sont PAS des vues ` +
          `dérivées : ${autres.join(', ')}. Fusion abandonnée ; ce conflit se résout à la main.`
      );
    }
    for (const v of vues) git('checkout', '--theirs', '--', v);
    lignes.push(`   conflit sur ${vues.length} vue(s) seule(s) : ${vues.join(', ')} — rendues.`);
  }

  if (!d.rendre()) {
    return abandonner(
      '❌ vues:fusion — un rendu de vue a échoué : fusion abandonnée, rien commité.'
    );
  }
  const presentes = VUES_DERIVEES.map((v) => v.chemin).filter((c) =>
    existsSync(join(d.cwd ?? '.', c))
  );
  if (presentes.length > 0) git('add', '--', ...presentes);
  const restants = git('diff', '--name-only', '--diff-filter=U').trim();
  if (restants !== '') {
    return abandonner(`❌ vues:fusion — des conflits subsistent après le rendu : ${restants}.`);
  }
  const indexChange = !essayer('diff', '--cached', '--quiet');
  if (enFusion) {
    git('commit', '--no-edit', '-q');
  } else if (indexChange) {
    git('commit', '-q', '-m', `chore(vues): vues dérivées rendues après fusion de ${d.base}`);
  }
  const apres = git('rev-parse', 'HEAD').trim();
  lignes.push(
    apres === avant
      ? `✅ vues:fusion — ${d.base} déjà contenue, vues déjà à jour : rien à commiter.`
      : `✅ vues:fusion — ${d.base} fusionnée et vues rendues : ${avant.slice(0, 7)} → ${apres.slice(0, 7)}. ` +
          'Le diff propre à la PR est inchangé si tu n’as rien résolu à la main : les accords ' +
          'survivent (`empreinteDuPatch`).'
  );
  return { code: 0, lignes };
}

// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni fusionner ni sortir.
const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

if (APPELE_DIRECTEMENT) {
  const i = process.argv.indexOf('--base');
  const base = i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : 'origin/main';
  const distante = /^origin\/(.+)$/.exec(base);
  if (distante) spawnSync('git', ['fetch', 'origin', distante[1]!], { stdio: 'inherit' });
  const issue = fusionnerMain({ base, rendre: () => rendreLesVues() });
  (issue.code === 0 ? console.log : console.error)(issue.lignes.join('\n'));
  process.exit(issue.code);
}
