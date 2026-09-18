/**
 * titres-ecrits.ts — LA lecture des titres ÉCRITS d'un fichier de spécification. Il n'y en a qu'une.
 *
 * Les titres écrits servent à repérer les identifiants d'exigence cités dans un `it()`, un `test()`
 * ou un `describe()` — un identifiant est un littéral, il est donc lisible sans exécuter le fichier.
 * Ils ne servent PAS à valider une promesse de titre : `describe.each` produit des noms que seul
 * vitest résout (`gov-trace.ts`, `titresResolus`).
 *
 * 🔴 POURQUOI CE FICHIER EXISTE (GOV-039, PR 55). Cette lecture vivait dans `scripts/gates/gov-trace.ts`,
 * un script à effets de bord au chargement : aucune spécification ne pouvait l'importer. La
 * spécification de REQ-QA-014 (`titres-de-test-resolvent.spec.ts`) en avait donc écrit une SECONDE,
 * ligne à ligne, plus pauvre : elle prenait le premier guillemet après `.each(` ou `.skipIf(` pour un
 * titre (« win32 », « aix ») et ratait tout titre écrit à la ligne suivante de son ouverture. Quinze
 * titres à identifiant, dans trois fichiers, n'étaient jamais confrontés au registre — et une
 * exigence absorbée posée dans l'un d'eux passait en exit 0 (refus A09 · simplicite 5246990618 et
 * A09 · securite 5247018537). Deux copies d'une même lecture divergent toujours ; la plus récente
 * était la plus pauvre. `gov:trace` et la spécification lisent désormais CE module.
 *
 * ⚠️ LIMITE CONNUE, mesurée le 2026-09-18 sur les 39 spécifications suivies : l'argument d'une
 * variante est lu par `[^)]*`, donc une ouverture dont l'argument contient lui-même une parenthèse
 * — `it.each(T.filter((t) => …))(` — n'est pas lue. 10 ouvertures sur 941 sont dans ce cas. Les
 * élargir change ce que `gov:trace` compte comme cité : c'est une tâche à part, pas un effet de bord.
 *
 * Aucun effet à l'import : rien n'est lu, rien n'est écrit, rien ne sort.
 */

/** L'ouverture d'un titre : `it`/`test`/`describe`, ses variantes, l'argument éventuel, le titre. */
const OUVERTURE =
  /\b(?:it|test|describe)(?:\.\w+)*(?:\s*\(\s*[^)]*\)\s*)?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

/** Un titre écrit, et l'index où commence son ouverture dans le texte du fichier. */
export type TitreEcrit = { texte: string; debut: number };

/** Les titres écrits d'un fichier, chacun avec la position de son ouverture. */
export function titresEcritsPositionnes(texte: string): TitreEcrit[] {
  return [...texte.matchAll(OUVERTURE)].map((m) => ({ texte: m[2]!, debut: m.index }));
}

/** Les titres écrits d'un fichier. */
export function titresEcrits(texte: string): string[] {
  return titresEcritsPositionnes(texte).map((t) => t.texte);
}
