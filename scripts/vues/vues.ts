/**
 * vues.ts — LES VUES DÉRIVÉES COMMITÉES DU DÉPÔT, nommées une fois (GOV-101, REQ-GOV-032).
 *
 * POURQUOI UNE LISTE. Deux lecteurs en ont besoin, et ils divergeraient s'ils la tapaient chacun :
 *
 *   — `scripts/vues/fusion.ts` (`pnpm vues:fusion`) : un conflit de fusion qui ne porte QUE sur
 *     ces fichiers se résout en les RÉGÉNÉRANT, dans cet ordre ;
 *   — `scripts/lot/revues.ts` (`empreinteDuPatch`) : l'empreinte du diff propre à une PR les
 *     EXCLUT, parce qu'une vue change dès que `main` change sa source — c'est ce qui périmait un
 *     accord rendu sur un patch identique. L'exclusion ne relâche rien : chaque vue a son
 *     VÉRIFICATEUR en porte A, qui rougit si elle n'est pas le rendu exact de sa source, et sa
 *     source, elle, est dans l'empreinte.
 *
 * ⚠️ LIMITE DÉCLARÉE — `docs/PLAN-STATE.md` N'EST PAS COMPARÉ OCTET PAR OCTET. Son vérificateur
 * exempte ce que le générateur a LU SUR LA FORGE (le sha de `main`, la file des PR, « Prochain
 * pas ») : une falsification écrite à la main dans ces zones, après l'accord, survit donc à
 * l'empreinte. Ce que cela ouvre est borné : ces zones portent déjà, par construction, du texte que
 * la forge contrôle — le titre de n'importe quelle PR, sur un dépôt public —, et le vérificateur y
 * refuse tout ce qui sortirait de la zone au rendu (`horsDeSaZone`, `scripts/plan-state/build.ts`).
 * Les six autres vues sont comparées entières par leur vérificateur. Le remède complet est de sortir
 * PLAN-STATE des PR (`partners/ADR-0022`, « Reste à faire »).
 *
 * L'ORDRE EST CELUI DU RENDU : `docs/PLAN-STATE.md` en DERNIER, il lit le journal, le backlog et
 * la traçabilité (même règle que `scripts/prevol.ts`).
 *
 * CE QUI N'EST PAS ICI, ET POURQUOI : les fiches `.claude/agents/*.md` ne sont dérivées qu'en
 * PARTIE (un bloc généré au milieu d'une prose écrite à la main) — les exclure de l'empreinte
 * laisserait survivre un accord à une réécriture de cette prose.
 */

/** Une vue : le fichier commité, la commande qui l'écrit, la commande qui le compare sans écrire. */
export type Vue = { chemin: string; rendu: string; verificateur: string };

export const VUES_DERIVEES: readonly Vue[] = [
  {
    chemin: 'docs/TRACABILITE.md',
    rendu: 'pnpm gov:trace:render',
    verificateur: 'pnpm gov:trace:verifier',
  },
  {
    chemin: 'docs/TASKS.md',
    rendu: 'pnpm gov:tasks:render',
    verificateur: 'pnpm gov:tasks:verifie-rendu',
  },
  {
    chemin: 'docs/REQUIREMENTS.md',
    rendu: 'pnpm gov:requirements:render',
    verificateur: 'pnpm gov:requirements:verifie-rendu',
  },
  {
    chemin: 'docs/paths-proposes.json',
    rendu: 'pnpm lot:paths',
    verificateur: 'pnpm lot:paths:check',
  },
  {
    chemin: 'docs/GATES.md',
    rendu: 'pnpm gov:gates-derivees:render',
    verificateur: 'pnpm gov:gates-derivees',
  },
  { chemin: 'docs/adr/INDEX.md', rendu: 'pnpm adr:index', verificateur: 'pnpm adr:index:verifier' },
  {
    chemin: 'docs/PLAN-STATE.md',
    rendu: 'pnpm plan-state:build',
    verificateur: 'pnpm plan-state:verifier',
  },
];

/** Le chemin est-il celui d'une vue dérivée ? Égalité exacte : aucun préfixe, aucune casse. */
export function estUneVueDerivee(chemin: string): boolean {
  return VUES_DERIVEES.some((v) => v.chemin === chemin);
}
