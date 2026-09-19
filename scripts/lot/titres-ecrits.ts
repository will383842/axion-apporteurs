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
 * LE PÉRIMÈTRE aussi n'existe qu'une fois (refus A09 · exactitude 5247101531) : la spécification ne
 * lisait que les `*.spec.ts` suivis, alors que `gov:trace` — et vitest — lisent aussi `*.test.ts` et
 * les `.tsx`. `fichiersDeTest()` est la liste que `gov:trace` confronte ; la spécification la lit.
 *
 * Aucun effet à l'import : rien n'est lu, rien n'est écrit, rien ne sort.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Les racines où vivent les fichiers de test du dépôt. */
const RACINES_DE_TEST = ['tests', 'src'];

/** Un fichier de test, au sens de vitest : `*.test.ts`, `*.spec.ts`, et leurs variantes `.tsx`. */
export function estUnFichierDeTest(chemin: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(chemin);
}

function listerFichiers(racine: string): string[] {
  if (!existsSync(racine)) return [];
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...listerFichiers(chemin));
    else sortie.push(chemin.replace(/\\/g, '/'));
  }
  return sortie;
}

/**
 * Les fichiers de test du dépôt, lus sur le disque : la liste que `gov:trace` confronte. `racine`
 * n'existe que pour qu'un témoin la fasse lire dans un dépôt jetable (A10 · mutation, PR 55 : sans
 * aucun `*.test.ts` dans le dépôt, un périmètre restreint aux `*.spec.ts` survivait).
 */
export function fichiersDeTest(racine = '.'): string[] {
  return RACINES_DE_TEST.map((r) => (racine === '.' ? r : join(racine, r)))
    .flatMap(listerFichiers)
    .filter(estUnFichierDeTest);
}

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

/**
 * Les titres des TESTS eux-mêmes — `it`, `test` et leurs variantes —, sans les `describe` (QA-T03).
 * REQ-QA-014 exige l'identifiant dans « le titre `it()` » : c'est ce qu'une sortie de test affiche,
 * et un `describe` qui le porte ne dit pas quel test le prouve.
 */
export function titresDeTest(texte: string): string[] {
  return titresEcritsPositionnes(texte)
    .filter((t) => !texte.startsWith('describe', t.debut))
    .map((t) => t.texte);
}

/** Une annotation `@req` : l'exigence, sa ligne (à partir de 1), la ligne entière, et sa place. */
export type AnnotationReq = { req: string; ligne: number; texteLigne: string; enTete: boolean };

/**
 * La fin de l'EN-TÊTE d'un fichier : l'index du premier caractère qui n'est ni un blanc ni un
 * commentaire. REQ-QA-014 veut l'annotation `@req` « en tête du fichier » : l'en-tête est le premier
 * bloc de commentaires, AVANT la première instruction.
 */
function finDeLEnTete(texte: string): number {
  let i = 0;
  while (i < texte.length) {
    if (/\s/.test(texte[i]!)) i++;
    else if (texte.startsWith('//', i)) {
      const n = texte.indexOf('\n', i);
      i = n < 0 ? texte.length : n + 1;
    } else if (texte.startsWith('/*', i)) {
      const n = texte.indexOf('*/', i + 2);
      i = n < 0 ? texte.length : n + 2;
    } else break;
  }
  return i;
}

/** Les annotations `@req` d'un fichier, chacune avec sa ligne et sa place (en tête ou non). */
export function annotationsReq(texte: string): AnnotationReq[] {
  const fin = finDeLEnTete(texte);
  const lignes = texte.split(/\r?\n/);
  return [...texte.matchAll(/@req\s+(REQ-[A-Z]{2,4}-\d{3})/g)].map((m) => {
    const ligne = texte.slice(0, m.index).split('\n').length;
    return { req: m[1]!, ligne, texteLigne: lignes[ligne - 1]!, enTete: m.index < fin };
  });
}
