/**
 * identifiant-de-lot.ts — d'où vient le NUMÉRO d'un lot (GOV-029, REQ-GOV-033).
 *
 * POURQUOI CE FICHIER EXISTE. `scripts/lot/composer.ts` tirait le numéro du prochain lot de
 * `readdirSync('docs/lots')`. Ce dossier est EXCLU du dépôt (`.gitignore` l. 67) : dans un arbre
 * neuf — worktree fraîchement créé, clone, machine de CI — il n'existe pas. Le maximum d'un
 * ensemble vide vaut 0, et le composeur repart à `L-1-01`, identifiant déjà porté par sept tâches
 * `fusionnee` de `docs/tasks.json`.
 *
 * Mesuré le 2026-09-05, dans un worktree neuf : `pnpm lot:composer -- --phase -1 --repo partners`
 * a imprimé « Lot L-1-01 : 7 tâche(s) » pour sept tâches dont aucune n'appartient au L-1-01
 * historique. `pnpm lot:cloture -- --lot L-1-01` aurait ensuite écrit `lot: "L-1-01"` sur les
 * nouvelles, et le lot historique en aurait compté quatorze, venues de deux lots différents.
 * Rien ne l'aurait vu : `t.lot` est une chaîne libre, qu'aucun schéma ne confronte à quoi que ce
 * soit. Le seul symptôme aurait été une vue par lot devenue fausse — c'est-à-dire rien, jusqu'au
 * jour où quelqu'un s'en sert pour décider.
 *
 * ⚠️ LE COMMENTAIRE DU CODE DÉCRIVAIT DÉJÀ LA PANNE, ET NE LA FERMAIT PAS :
 *
 *     « Le numéro se DÉDUIT du plus grand déjà posé, jamais d'un COMPTAGE : un dossier supprimé,
 *       archivé ou non commité faisait retomber sur un identifiant déjà utilisé, et écrasait le
 *       lot.json précédent. »
 *
 * L'auteur avait nommé le cas exact — « un dossier non commité » — et n'en avait corrigé que la
 * moitié : le COMPTAGE est devenu un MAXIMUM, ce qui ferme les trous de numérotation, mais la
 * SOURCE est restée le dossier ignoré, ce qui laisse ouvert le cas décrit. Un commentaire juste
 * qui nomme un défaut ne le corrige pas, et il rassure d'autant plus qu'il est juste.
 *
 * LA RÈGLE. Le numéro se dérive de l'UNION de deux sources, parce qu'aucune des deux ne suffit :
 *
 *   — `docs/lots/` porte les lots COMPOSÉS mais pas encore clos. Ces lots-là n'ont pas encore
 *     écrit leur nom dans le backlog : le backlog seul les oublierait, et deux sessions
 *     simultanées composeraient le même identifiant.
 *   — `docs/tasks.json` porte les lots CLOS, par le champ `lot` de chaque tâche. C'est la seule
 *     des deux qui soit SUIVIE par git, donc la seule qui survive à un arbre neuf ou à un
 *     `git clean`.
 *
 * Ce module est PUR et ne lit rien : il reçoit les deux listes. C'est ce qui permet à
 * `tests/unit/gouvernance/lot-identifiant-unique.spec.ts` d'avoir un témoin PAR SOURCE — un test
 * qui lirait le disque ne saurait pas distinguer « les deux sources sont lues » de « l'une des
 * deux suffisait ce jour-là ».
 */

/** Le préfixe des lots d'une phase : `L-1-`, `L0-`, `L1-`… La phase peut être négative. */
export function prefixeDePhase(phase: number): string {
  return `L${phase}-`;
}

/**
 * Les identifiants de lot déjà écrits dans le backlog. Une tâche sans `lot` n'en porte pas ; les
 * doublons sont écrasés par l'ensemble — sept tâches d'un même lot n'en font qu'un.
 */
export function lotsDuBacklog(taches: readonly { lot?: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const t of taches) if (typeof t.lot === 'string' && t.lot.length > 0) out.add(t.lot);
  return out;
}

/**
 * Le prochain identifiant libre pour `phase`, dérivé de l'union du dossier et du backlog.
 *
 * Un nom hors nomenclature (`gov-amorcage`, `archives`) est ignoré : ces lots existent — les trois
 * premiers du dépôt s'appellent ainsi — mais ils ne portent aucun numéro de phase, donc ils ne
 * décalent aucune séquence. Un identifiant d'une AUTRE phase est ignoré lui aussi : `L0-09` ne dit
 * rien de la phase −1, et les confondre ferait sauter huit numéros.
 */
export function prochainIdentifiantDeLot(
  phase: number,
  dossiers: readonly string[],
  lotsConnus: readonly string[]
): string {
  const prefixe = prefixeDePhase(phase);
  const numeros: number[] = [];

  for (const nom of [...dossiers, ...lotsConnus]) {
    if (!nom.startsWith(prefixe)) continue;
    const reste = nom.slice(prefixe.length);
    // `L-1-` est aussi le préfixe de rien d'autre, mais `L1-` l'est de `L1-02` ET de `L1-abc` :
    // on n'accepte qu'une suite de chiffres, sinon `Number('abc')` rendrait NaN, que `Math.max`
    // propagerait à tout le calcul — et le lot suivant s'appellerait `LNaN`.
    if (!/^\d+$/.test(reste)) continue;
    numeros.push(Number(reste));
  }

  const seq = Math.max(0, ...numeros) + 1;
  return `${prefixe}${String(seq).padStart(2, '0')}`;
}
