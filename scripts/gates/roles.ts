/**
 * roles.ts — la garde AST des rôles de la console (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 * Registre : `securite:roles`, alias `G-SEC-ROLES` et `GATE-UX-ROLES`. La commande porte l'identifiant du registre,
 * et le verdict l'imprime en le lisant (`ID_REGISTRE`, partners/ADR-0018 : un nom, une garde).
 *
 * USAGE : pnpm securite:roles       juge la console du dépôt ; sort 1 sur faute, en la nommant
 *         pnpm securite:roles:prove un témoin par famille et par forme d'export, des contre-témoins verts
 *
 * CE QU'ELLE TIENT. La liste des actions et des routes de la console est DÉRIVÉE DU DISQUE, jamais
 * déclarée : tout fichier suivi sous `src/app/(console)/` et `src/server/console/`, en TypeScript
 * comme en JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`) — ses sites
 * se dérivent des SEULS exports ES, et un fichier écrit en CommonJS est une faute (plus bas).
 * LISTE BLANCHE DES FICHIERS. Next sert comme route, dans N'IMPORTE QUEL segment, d'autres
 * fichiers que `page.*` et `route.*` : les fichiers de métadonnées (`icon`, `apple-icon`,
 * `opengraph-image`, `twitter-image`, `sitemap`, et à la racine `robots`, `manifest`), dont
 * l'export par défaut devient un GET servi. Sous `ROUTAGE_DE_LA_CONSOLE` (`src/app/(console)/`),
 * la garde n'admet donc que les noms de fichier qu'elle sait juger, `FICHIERS_ADMIS_SOUS_LE_ROUTAGE`
 * — `page`, `route` (des sites), `layout`, `template`, `default`, `loading`, `error`, `not-found`,
 * avec les extensions lues. Tout AUTRE fichier de code sous ce répertoire qui n'est pas dans un
 * dossier privé de Next (un segment `_nom`, que Next ne route pas) est `export_non_jugeable`,
 * motif `MOTIF_FICHIER_NON_ADMIS` : les fichiers de métadonnées comme tout nom spécial que Next
 * ajouterait demain. PRIX ASSUMÉ : le code utilitaire, et un module d'actions, se rangent hors de
 * `src/app` (`src/server/console/`) ou dans un dossier privé (`_prive/`). Dans un fichier admis,
 * les générateurs de Next (`GENERATEURS_REFUSES` : `generateMetadata`, `generateViewport`,
 * `generateStaticParams`, `generateImageMetadata`, `generateSitemaps`) s'exécutent par requête ou
 * au build, hors de la page gardée, et peuvent mettre une donnée protégée dans le `<head>` : aucune
 * règle ne sait les juger, ils sont `export_non_jugeable`, motif `MOTIF_GENERATEUR`, sous leur nom
 * exporté. PRIX ASSUMÉ : les métadonnées de la console sont STATIQUES (`export const metadata`).
 * LISTE BLANCHE DES FORMES. La garde juge les formes d'export par LISTE BLANCHE, jamais par liste noire :
 * `FORMES_D_EXPORT_ADMISES` énumère les seules formes dont elle sait dériver les sites et juger le
 * corps — `export function M` et `export async function M`, `export const M = …`, `export { x }`
 * et `export { x as M }` de liaisons locales, les exports de type (`export type …`,
 * `export interface`, `export type { … }`, `export { type X }`), `export default` hors d'un
 * fichier de route, `export class` nommée dans un module qui n'est ni une route ni `'use server'`.
 * Toute AUTRE instruction d'export de premier niveau, dans tout fichier du périmètre — `export =`
 * (Next le compile en `module.exports` et le sert), `export *`, `export * as`, un réexport
 * `export { … } from`, `export import X = …`, `export default` dans une route, `export let`,
 * `export declare`, `export enum`, `export namespace`, `export as namespace`, et toute forme que
 * la liste ne connaît pas — est `export_non_jugeable`, motif `MOTIF_HORS_LISTE_BLANCHE`, avec sa
 * ligne. Une forme nouvelle est refusée tant qu'on ne l'a pas ajoutée, témoin à l'appui.
 * Chacune est confrontée à LA matrice (`src/server/roles/matrice.ts`) :
 *   — une ACTION est TOUTE valeur exportée d'un module `'use server'` par une forme admise
 *     (déclaration, `export { f }` avec ou sans alias, `export const` quel que soit
 *     l'initialiseur, déstructuration — un site par nom lié —, `export default`), ou toute
 *     fonction ou méthode qui porte elle-même la directive. Elle appelle
 *     `requireRole('action:<nom>', …)` ;
 *   — une PAGE (`page.tsx`, `page.js`…) appelle `requireRole('ecran:<nom>', …)` dans sa fonction
 *     exportée par défaut ; une ROUTE (`route.ts`, `route.js`…) l'appelle dans chacune de ses
 *     méthodes HTTP exportées par une forme admise, alias et déstructuration compris ;
 *   — LA PORTE est le `requireRole` IMPORTÉ de `src/server/roles/require-role`
 *     (`MODULE_DE_LA_PORTE`, chemin relatif résolu depuis le fichier, extension indifférente),
 *     nommément, par alias ou par espace de noms (`import * as r` puis `r.requireRole(…)`), déclaré
 *     UNE fois dans le fichier et jamais réassigné. Un homonyme local, un `requireRole` importé
 *     d'ailleurs, un paramètre ou une variable qui le masque (n'importe où dans le fichier, sans
 *     analyse de portée), `x.requireRole(…)` sur un objet quelconque, `r['requireRole'](…)` ne
 *     gardent pas : le site est `action_sans_requireRole` ou `route_sans_requireRole` ;
 *   — le droit est un LITTÉRAL, présent dans la matrice. Un droit absent de la matrice fait rougir
 *     la garde en NOMMANT l'action : c'est le défaut = refus appliqué au disque, avant qu'il le soit
 *     à l'exécution.
 * ÉCHEC FERMÉ. Un site dont le CORPS ne s'établit pas dans le fichier — ni une fonction, ni le nom
 * d'une fonction locale établie : un appel d'enveloppe, un import, un réexport, une constante, une
 * déstructuration, une page sans export par défaut reconnu — est une faute nommée, jamais un
 * silence, et jamais jugé sur le fichier entier. Ne S'ÉTABLISSENT que la déclaration de fonction
 * et la `const`, chacune déclarée une fois et jamais réassignée : une liaison `let`/`var`, ou tout
 * nom réassigné dans le module (fonction comprise), rend le site non jugeable — Next sert la
 * valeur de FIN de module, que l'initialiseur ne dit pas. Un `var` de portée module est relevé où
 * qu'il soit hors d'une fonction (bloc, `if`, `try`, boucle, `for (var … of …)`, `switch`,
 * étiquette) : liaison de valeur, réassignable, donc non jugeable. Un export n'est écarté comme
 * type que s'il est MARQUÉ `type` (`export type { … }` ou `export { type X }`) : un `export { X }`
 * non marqué dont le nom n'a pas de valeur établie est `export_non_jugeable`. PRIX ASSUMÉ : un
 * réexport de type doit s'écrire `export type`.
 * MODULE COMMONJS. Next charge un fichier de route sans export ES par `require` et sert ce qu'il
 * range dans `exports` : la garde, qui ne dérive ses sites que des exports ES, n'y verrait AUCUN
 * site. Sans chercher à juger le CommonJS, tout fichier du périmètre (action, route, page, mais
 * aussi `layout.*` et module de serveur) qui nomme l'objet des exports ou une voie qui y mène est
 * `export_non_jugeable`, motif « module CommonJS », chaque nom cité avec sa ligne : les
 * identifiants `exports`, `module`, `require`, `eval` (l'`eval` direct voit la portée de
 * l'enveloppe) et les internes du bundler (`__webpack_…`, `__turbopack_…`), MÊME LIÉS
 * LOCALEMENT, hors position de nom de propriété (`o.module`, `{ exports: 1 }`) ; `this` et
 * `arguments` qu'aucune RÉGION LIANTE n'enferme (dans l'enveloppe, l'objet des exports et ses
 * arguments) — seuls le corps ou les paramètres d'une fonction non fléchée, l'initialiseur d'une
 * propriété de classe et un bloc `static` les lient ; un nom calculé de membre, un décorateur,
 * une clause `extends` s'évaluent dans la portée qui les entoure ; toute instruction `with`. PRIX ASSUMÉ : une variable locale nommée `exports` ou
 * `module` se renomme.
 * Le vert imprime les fichiers lus, les sites confrontés, et les couples droit-rôle confrontés à la
 * ligne de la matrice RÔLE PAR RÔLE (ouverts, fermés). Le « périmètre vide » ne se dit que si AUCUN
 * fichier n'est lu.
 *
 * SEPT FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `action_sans_requireRole`  une action de console qui n'appelle pas la porte importée
 *   `route_sans_requireRole`   une page ou une méthode de route qui ne l'appelle pas
 *   `droit_non_litteral`       un droit qui n'est pas une chaîne littérale : il ne se confronte pas
 *   `droit_de_mauvais_genre`   une action qui invoque un droit `ecran:`, une page un droit `action:`
 *   `droit_hors_matrice`       un droit absent de la matrice — l'action ou la route est nommée
 *   `export_non_jugeable`      un site dont le corps ne s'établit pas dans le fichier, une
 *                              forme d'export hors liste blanche, un fichier qui nomme
 *                              l'objet des exports CommonJS, un fichier non admis sous le
 *                              routage de la console, ou un générateur de Next qui y est exporté
 *   `source_illisible`         un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle voit la PRÉSENCE de l'appel et son droit, pas que le verdict est honoré :
 * une action qui appelle `requireRole` puis ignore le refus lui échappe, comme un `requireRole`
 * présent dans une fermeture jamais appelée ou dans un paramètre par défaut (l'appel est DANS le
 * corps, sans être exécuté à chaque requête) — c'est la relecture qui les tient, et `requireRole`
 * rend un verdict qu'on ne peut pas lire comme un succès sans son `ok`. Elle ne suit pas un appel
 * délégué à une fonction voisine : l'appel doit être DANS l'action (RM-07 — une garde extraite se
 * perd avec son appelant). De la porte, elle vérifie le CHEMIN du module importé, pas ce que ce
 * module exporte. ÉVALUATION DYNAMIQUE DE CODE : hors de l'`eval` direct, refusé, le code évalué
 * à l'exécution — `Function` ou `new Function`, l'`eval` indirect (`(0, eval)(…)` est refusé par
 * son nom, pas `globalThis['ev' + 'al']`), `vm`, un minuteur à chaîne — et toute mutation des
 * exports d'un module par une voie d'exécution (cache de modules du bundler atteint par un
 * global) lui échappent : elle lit la syntaxe, pas l'exécution ; ce code s'exécute en portée
 * globale, sans les liaisons de l'enveloppe, et c'est la relecture qui le tient. Parmi les huit
 * fichiers admis sous le routage, seuls `page.*` et `route.*` sont des SITES : `layout.*`,
 * `template.*`, `default.*` (route parallèle), `loading.*`, `error.*`, `not-found.*` sont admis
 * sans site jugé — une page se garde elle-même, et le RENDU d'un `default.*` ou d'un `layout.*` qui
 * lirait une donnée protégée lui échappe (leurs générateurs, eux, sont refusés). Une `const` de
 * premier niveau (`metadata` compris) s'évalue au chargement du module, sans requête : ce qu'elle
 * lirait lui échappe aussi. Un fichier qui n'est pas du code (`icon.png`, `opengraph-image.jpg`) est
 * hors du périmètre : un contenu figé au commit, que la relecture tient. Hors de
 * `src/app/(console)/` et de `src/server/console/`, elle ne juge rien.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLaConsole` et `rendreLeVerdict` sont pures : fichiers,
 * matrice et rôles sont INJECTÉS, sans défaut. `--prove` ne lit rien du dépôt.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { MATRICE_DES_ROLES, ROLES_CONSOLE, ROLES_PAR_DROIT } from '../../src/server/roles/matrice';

/** L'identifiant du registre : c'est aussi la commande, et le nom que le verdict imprime. */
export const ID_REGISTRE = 'securite:roles';

export const FAMILLES = [
  'action_sans_requireRole',
  'route_sans_requireRole',
  'droit_non_litteral',
  'droit_de_mauvais_genre',
  'droit_hors_matrice',
  'export_non_jugeable',
  'source_illisible',
] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
export interface FichierDeConsole {
  readonly chemin: string;
  readonly source: string;
}
export type Matrice = Readonly<Record<string, readonly string[]>>;
export interface Jugement {
  fautes: Faute[];
  fichiers: number;
  actions: number;
  routes: number;
  /** Les chemins des fichiers de console lus. */
  lus: string[];
  /** Les sites confrontés, chacun nommé : `<chemin> — action « x »`. */
  sites: string[];
  /** Les couples droit-rôle confrontés à la ligne de la matrice : ouverts + fermés. */
  couples: number;
  couplesOuverts: number;
  couplesFermes: number;
}

/** Le périmètre : la console de l'application et ses modules de serveur. */
export const PERIMETRE: readonly RegExp[] = [
  /^src\/app\/\(console\)\/.+\.(?:[jt]sx?|[mc][jt]s)$/,
  /^src\/server\/console\/.+\.(?:[jt]sx?|[mc][jt]s)$/,
];
/** Le répertoire de routage de la console : Next sert comme route ce qui s'y trouve. */
export const ROUTAGE_DE_LA_CONSOLE = 'src/app/(console)/';
/**
 * LA LISTE BLANCHE DES FICHIERS sous le routage de la console : les seuls noms (sans extension)
 * que la garde sait juger. `page` et `route` sont des sites ; les six autres rendent un composant
 * sans valeur servie hors d'une page. Tout AUTRE fichier de code sous `ROUTAGE_DE_LA_CONSOLE`, hors
 * d'un dossier privé de Next (`_nom`), est `export_non_jugeable`, `MOTIF_FICHIER_NON_ADMIS` : les
 * fichiers de métadonnées (`icon`, `apple-icon`, `opengraph-image`, `twitter-image`, `sitemap`,
 * `robots`, `manifest`), dont Next sert l'export par défaut comme un GET, et tout nom spécial futur.
 */
export const FICHIERS_ADMIS_SOUS_LE_ROUTAGE = [
  'page',
  'route',
  'layout',
  'template',
  'default',
  'loading',
  'error',
  'not-found',
] as const;
export const MOTIF_FICHIER_NON_ADMIS =
  'fichier non admis sous le routage de la console : Next peut le servir';
/**
 * Les générateurs de Next qu'un fichier de routage peut exporter : ils s'exécutent par requête ou
 * au build, hors de toute page gardée, et peuvent mettre une donnée protégée dans le `<head>` ou
 * dans une URL. Aucune règle ne sait les juger : sous le routage de la console, ils sont refusés.
 */
export const GENERATEURS_REFUSES = [
  'generateMetadata',
  'generateViewport',
  'generateStaticParams',
  'generateImageMetadata',
  'generateSitemaps',
] as const;
export const MOTIF_GENERATEUR =
  'générateur de Next refusé sous le routage de la console : il tourne par requête ou au build, ' +
  'hors de requireRole, et peut mettre une donnée protégée dans le head';

/**
 * Où se trouve un fichier par rapport au routage de la console : `hors` (pas sous le routage),
 * `prive` (sous un dossier privé de Next, `_nom`, que Next ne route pas), `admis` (un des huit noms
 * de `FICHIERS_ADMIS_SOUS_LE_ROUTAGE`), `non_admis` (tout le reste : Next peut le servir).
 */
function placeSousLeRoutage(chemin: string): 'hors' | 'prive' | 'admis' | 'non_admis' {
  if (!chemin.startsWith(ROUTAGE_DE_LA_CONSOLE)) return 'hors';
  const segments = chemin.slice(ROUTAGE_DE_LA_CONSOLE.length).split('/');
  const base = segments.pop() ?? '';
  if (segments.some((s) => s.startsWith('_'))) return 'prive';
  const nom = base.replace(EXTENSION, '');
  return (FICHIERS_ADMIS_SOUS_LE_ROUTAGE as readonly string[]).includes(nom)
    ? 'admis'
    : 'non_admis';
}

/** Une page ou une route : TypeScript comme JavaScript (Next compile un `page.js`, un `route.js`). */
const EST_UNE_PAGE = /^page\.(?:[jt]sx?|[mc][jt]s)$/;
const EST_UNE_ROUTE = /^route\.(?:[jt]sx?|[mc][jt]s)$/;
const METHODES_HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const NOM_DE_LA_PORTE = 'requireRole';
/**
 * Le module canonique de la porte, chemin du dépôt sans extension : seul le `requireRole` IMPORTÉ
 * de ce module, par un chemin relatif qui ne remonte pas au-delà de la racine du dépôt, garde un
 * site. Sa présence sur le disque est vérifiée par la spécification.
 */
export const MODULE_DE_LA_PORTE = 'src/server/roles/require-role';
const EXTENSION = /\.(?:[jt]sx?|[mc][jt]s)$/;
/** Le nom exporté d'un `export * from '…'` : il peut porter n'importe quel nom, méthodes HTTP comprises. */
const TOUT = '*';

type Genre = 'action' | 'ecran' | 'route';
interface Site {
  nom: string;
  genre: Genre;
  /** Le corps jugé ; `null` quand il ne s'établit pas dans le fichier — c'est une faute. */
  corps: ts.Node | null;
  /** Pourquoi le corps ne s'établit pas, quand il ne s'établit pas. */
  forme: string;
}

const estDansLePerimetre = (chemin: string): boolean => PERIMETRE.some((r) => r.test(chemin));

/** Les directives en tête d'une liste d'instructions : `'use server'`, `'use client'`… */
function directives(instructions: ts.NodeArray<ts.Statement>): string[] {
  const vues: string[] = [];
  for (const i of instructions) {
    if (!ts.isExpressionStatement(i) || !ts.isStringLiteral(i.expression)) break;
    vues.push(i.expression.text);
  }
  return vues;
}

const modificateurs = (n: ts.Node): readonly ts.ModifierLike[] =>
  ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : [];
const exporte = (n: ts.Node): boolean =>
  modificateurs(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const parDefaut = (n: ts.Node): boolean =>
  modificateurs(n).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

type Fonction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
const estFonction = (n: ts.Node | undefined): n is Fonction =>
  n !== undefined &&
  (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n));

/** Une valeur exportée : son nom exporté, sa fonction si elle s'établit dans le fichier. */
interface Export {
  /** Le nom EXPORTÉ : `default`, `GET`, `*`… */
  nom: string;
  /** Le nom qu'imprime le message : celui de la fonction pour un export par défaut nommé. */
  libelle: string;
  fn: Fonction | null;
  /** La forme de l'export, dite quand la fonction ne s'établit pas. */
  forme: string;
  /** L'instruction de premier niveau qui porte l'export : la liste blanche la juge. */
  origine?: ts.Statement;
}

/** Les identifiants qu'un motif de liaison lie : `a`, `{ a, b: { c }, d = 1, ...e }`, `[f, , g]`. */
function nomsLies(n: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(n)) return [n];
  const noms: ts.Identifier[] = [];
  for (const e of n.elements) if (!ts.isOmittedExpression(e)) noms.push(...nomsLies(e.name));
  return noms;
}

/**
 * Les noms RÉASSIGNÉS quelque part dans le module : cible d'une affectation (simple, composée ou
 * par déstructuration), d'un `++`/`--`, d'une boucle `for (x of …)`. Sans analyse de portée : un
 * homonyme réassigné dans une fonction imbriquée suffit — échec fermé, jamais un silence.
 */
function nomsReassignes(source: ts.SourceFile): Set<string> {
  const vus = new Set<string>();
  const cible = (e: ts.Node): void => {
    if (ts.isIdentifier(e)) vus.add(e.text);
    else if (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isSpreadElement(e) ||
      ts.isSpreadAssignment(e)
    ) {
      cible(e.expression);
    } else if (ts.isArrayLiteralExpression(e)) e.elements.forEach(cible);
    else if (ts.isObjectLiteralExpression(e)) {
      for (const p of e.properties) {
        if (ts.isShorthandPropertyAssignment(p)) vus.add(p.name.text);
        else if (ts.isPropertyAssignment(p)) cible(p.initializer);
        else if (ts.isSpreadAssignment(p)) cible(p.expression);
      }
    } else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      cible(e.left); // une valeur par défaut dans un motif d'affectation : `[a = 1] = …`
    }
  };
  const visiter = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      cible(n.left);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      cible(n.operand);
    } else if (
      (ts.isForInStatement(n) || ts.isForOfStatement(n)) &&
      !ts.isVariableDeclarationList(n.initializer)
    ) {
      cible(n.initializer);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return vus;
}

/**
 * Les noms que lie un `var` de PORTÉE MODULE placé hors du premier niveau : dans un bloc, un `if`,
 * un `try`, une boucle (`for (var … of …)` compris), un `switch`, une étiquette. Le parcours
 * descend partout SAUF dans une fonction, une classe ou un espace de noms — ce sont eux qui
 * ferment la portée d'un `var`. Les `var` du premier niveau sont relevés par l'appelant.
 */
function varsDePorteeModule(source: ts.SourceFile): ts.Identifier[] {
  const noms: ts.Identifier[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isFunctionLike(n) || ts.isClassLike(n) || ts.isModuleDeclaration(n)) return;
    if (ts.isVariableDeclarationList(n) && (n.flags & ts.NodeFlags.BlockScoped) === 0) {
      for (const d of n.declarations) noms.push(...nomsLies(d.name));
    }
    ts.forEachChild(n, visiter);
  };
  for (const i of source.statements) if (!ts.isVariableStatement(i)) visiter(i);
  return noms;
}

/** Une liste de déclarations `const` — ni `let`, ni `var`, ni `using`. */
const estConst = (l: ts.VariableDeclarationList): boolean =>
  (l.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const;

const declare = (n: ts.Node): boolean =>
  modificateurs(n).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
/** Le nom qu'un spécificateur d'export publie : identifiant ou chaîne (`export { x as "GET" }`). */
const nomPublie = (s: ts.ExportSpecifier): string => s.name.text;
/** Une clause `{ … }` dont CHAQUE élément est marqué `type` : effacée à la compilation. */
const toutEstType = (i: ts.ExportDeclaration): boolean =>
  i.exportClause !== undefined &&
  ts.isNamedExports(i.exportClause) &&
  i.exportClause.elements.length > 0 &&
  i.exportClause.elements.every((s) => s.isTypeOnly);

/** Où se trouve l'instruction : un fichier de route (`route.ts`, `route.js`…), un module « use server ». */
export interface ContexteDExport {
  readonly route: boolean;
  readonly serveur: boolean;
}

/** Une forme d'export que la garde sait juger : ce qu'elle admet, et comment elle le reconnaît. */
export interface FormeAdmise {
  readonly forme: string;
  readonly admet: (i: ts.Statement, contexte: ContexteDExport) => boolean;
}

/**
 * LA LISTE BLANCHE DES FORMES D'EXPORT d'un fichier de la console. Une instruction de premier
 * niveau qui exporte (modificateur `export`, `export default`, `export =`, `export { … }`,
 * `export *`, `export as namespace`…) n'est admise que si UNE de ces formes la reconnaît : ce
 * sont les seules dont la garde sait dériver les sites et juger le corps. TOUT le reste — y
 * compris une forme que TypeScript ajouterait demain — est `export_non_jugeable`, motif « forme
 * d'export non admise dans un fichier de la console ». La garde ne ferme pas les formes une par
 * une : elle n'ouvre que celles-ci.
 */
export const FORMES_D_EXPORT_ADMISES: readonly FormeAdmise[] = [
  {
    forme: '`export function M(…) { … }` / `export async function M(…) { … }` — fonction nommée',
    admet: (i) =>
      ts.isFunctionDeclaration(i) &&
      exporte(i) &&
      !parDefaut(i) &&
      !declare(i) &&
      i.name !== undefined,
  },
  {
    forme:
      '`export const M = …` — constante initialisée (le site se juge sur sa valeur établie ; ' +
      'une déstructuration est un site par nom lié)',
    admet: (i) =>
      ts.isVariableStatement(i) &&
      exporte(i) &&
      !declare(i) &&
      estConst(i.declarationList) &&
      i.declarationList.declarations.every((d) => d.initializer !== undefined),
  },
  {
    forme:
      '`export { x }` / `export { x as M }` — liaisons LOCALES, sans `from` (jamais `as default` ' +
      'dans une route)',
    admet: (i, { route }) =>
      ts.isExportDeclaration(i) &&
      !i.isTypeOnly &&
      i.moduleSpecifier === undefined &&
      i.exportClause !== undefined &&
      ts.isNamedExports(i.exportClause) &&
      !(route && i.exportClause.elements.some((s) => !s.isTypeOnly && nomPublie(s) === 'default')),
  },
  {
    forme:
      'un type : `export type X = …`, `export interface I`, `export type { … }` (avec ou sans ' +
      '`from`), `export { type X }` dont chaque élément est marqué `type` — effacé à la compilation',
    admet: (i) =>
      ((ts.isTypeAliasDeclaration(i) || ts.isInterfaceDeclaration(i)) &&
        exporte(i) &&
        !declare(i)) ||
      (ts.isExportDeclaration(i) && (i.isTypeOnly || toutEstType(i))),
  },
  {
    forme:
      '`export default function …` / `export default <expression>` — hors d’un fichier de route ' +
      '(la page se juge sur sa valeur établie)',
    admet: (i, { route }) =>
      !route &&
      ((ts.isFunctionDeclaration(i) && exporte(i) && parDefaut(i) && !declare(i)) ||
        (ts.isExportAssignment(i) && !i.isExportEquals)),
  },
  {
    forme:
      '`export class C { … }` — classe nommée, dans un module de console qui n’est ni une route ' +
      'ni un module « use server » (aucune de ses valeurs n’est servie ; ses méthodes « use server » ' +
      'sont jugées comme actions)',
    admet: (i, { route, serveur }) =>
      !route &&
      !serveur &&
      ts.isClassDeclaration(i) &&
      exporte(i) &&
      !parDefaut(i) &&
      !declare(i) &&
      i.name !== undefined,
  },
];

/** Le motif d'une instruction d'export qu'aucune forme admise ne reconnaît. */
export const MOTIF_HORS_LISTE_BLANCHE = 'forme d’export non admise dans un fichier de la console';

/** Une instruction de premier niveau qui EXPORTE, sous quelque forme que ce soit. */
const exporteQuelqueChose = (i: ts.Statement): boolean =>
  ts.isExportAssignment(i) ||
  ts.isExportDeclaration(i) ||
  ts.isNamespaceExportDeclaration(i) ||
  exporte(i);

/** Les instructions d'export qu'AUCUNE forme de la liste blanche ne reconnaît. */
function exportsNonAdmis(chemin: string, source: ts.SourceFile): ts.Statement[] {
  const contexte: ContexteDExport = {
    route: EST_UNE_ROUTE.test(chemin.slice(chemin.lastIndexOf('/') + 1)),
    serveur: directives(source.statements).includes('use server'),
  };
  return source.statements.filter(
    (i) => exporteQuelqueChose(i) && !FORMES_D_EXPORT_ADMISES.some((f) => f.admet(i, contexte))
  );
}

/**
 * TOUTES les valeurs exportées d'un module, quelle que soit leur forme. Un type ne s'exporte pas
 * comme valeur : il n'est écarté que s'il est MARQUÉ `type` (`export type { … }`, `{ type X }`) ;
 * un export non marqué d'un nom sans valeur établie est rendu non jugeable, jamais sauté.
 * Tout le reste est rendu, avec sa fonction quand elle s'établit dans le fichier, `null` sinon.
 *
 * Ce qui S'ÉTABLIT : une déclaration de fonction, ou une `const` dont l'initialiseur est une
 * fonction ou le nom d'une liaison établie — chacune déclarée une seule fois et jamais réassignée.
 * Une liaison `let`/`var`, ou tout nom réassigné, ne s'établit pas : Next sert la valeur de FIN de
 * module, et l'initialiseur n'en dit rien.
 */
function exportsDuModule(source: ts.SourceFile): Export[] {
  // Les liaisons de premier niveau qui peuvent s'établir : la déclaration de fonction, ou
  // l'initialiseur d'une `const`. Toute liaison VALEUR est comptée, pour les redéclarations et
  // pour distinguer un type d'une valeur homonyme.
  const etablissables = new Map<string, ts.Node | undefined>();
  const reassignables = new Set<string>(nomsReassignes(source));
  const declarations = new Map<string, number>();
  const types = new Set<string>();
  const valeurLiee = (n: ts.Identifier): void => {
    declarations.set(n.text, (declarations.get(n.text) ?? 0) + 1);
  };
  for (const i of source.statements) {
    if (ts.isFunctionDeclaration(i) && i.name) {
      if (!i.body) continue; // une signature de surcharge : l'implémentation suit
      valeurLiee(i.name);
      etablissables.set(i.name.text, i);
    } else if (ts.isVariableStatement(i)) {
      const constante = estConst(i.declarationList);
      for (const d of i.declarationList.declarations) {
        for (const n of nomsLies(d.name)) {
          valeurLiee(n);
          if (!constante) reassignables.add(n.text);
        }
        if (constante && ts.isIdentifier(d.name)) etablissables.set(d.name.text, d.initializer);
      }
    } else if (
      (ts.isClassDeclaration(i) || ts.isEnumDeclaration(i) || ts.isModuleDeclaration(i)) &&
      i.name &&
      ts.isIdentifier(i.name)
    ) {
      valeurLiee(i.name);
    } else if (ts.isImportDeclaration(i) && i.importClause) {
      const c = i.importClause;
      const lier = (n: ts.Identifier, typeSeul: boolean): void =>
        typeSeul ? void types.add(n.text) : valeurLiee(n);
      if (c.name) lier(c.name, c.isTypeOnly);
      const b = c.namedBindings;
      if (b && ts.isNamespaceImport(b)) lier(b.name, c.isTypeOnly);
      else if (b) for (const e of b.elements) lier(e.name, c.isTypeOnly || e.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(i)) {
      if (i.isTypeOnly) types.add(i.name.text);
      else valeurLiee(i.name);
    } else if (ts.isTypeAliasDeclaration(i) || ts.isInterfaceDeclaration(i)) {
      types.add(i.name.text);
    }
  }
  // Un `var` hors du premier niveau a la portée du module : une liaison de VALEUR, réassignable.
  for (const n of varsDePorteeModule(source)) {
    valeurLiee(n);
    reassignables.add(n.text);
  }
  const REASSIGNABLE = (nom: string) =>
    `« ${nom} » est une liaison réassignable (let, var ou nom réassigné dans le module) : Next ` +
    `sert sa valeur de fin de module, pas son initialiseur`;
  const REDECLAREE = (nom: string) => `« ${nom} » est déclaré plus d’une fois dans le module`;
  const TYPE_NON_MARQUE = (nom: string) =>
    `« ${nom} » n’a aucune valeur établie dans le module, et l’export n’est pas marqué \`type\` : ` +
    `un export de type s’écrit \`export type { ${nom} }\` ou \`export { type ${nom} }\``;
  const NON_LOCALE = 'la valeur n’est ni une fonction ni le nom d’une fonction locale établie';
  /** Pourquoi un nom ne s'établit pas ; `null` s'il peut s'établir. */
  const obstacle = (nom: string): string | null =>
    reassignables.has(nom)
      ? REASSIGNABLE(nom)
      : (declarations.get(nom) ?? 0) > 1
        ? REDECLAREE(nom)
        : null;
  /** La fonction que désigne un nom local, en suivant `const a = b` — ou le motif qui l'empêche. */
  const resoudre = (nom: string, vus = new Set<string>()): Fonction | string => {
    if (vus.has(nom)) return NON_LOCALE;
    vus.add(nom);
    const o = obstacle(nom);
    if (o !== null) return o;
    const v = etablissables.get(nom);
    if (estFonction(v)) return v;
    if (v !== undefined && ts.isIdentifier(v)) return resoudre(v.text, vus);
    return NON_LOCALE;
  };
  const valeur = (e: ts.Expression): Fonction | string =>
    estFonction(e) ? e : ts.isIdentifier(e) ? resoudre(e.text) : NON_LOCALE;
  /** Un export rendu : sa fonction si elle s'établit, sinon sa forme ET le motif. */
  const rendu = (nom: string, libelle: string, r: Fonction | string, forme: string): Export =>
    typeof r === 'string'
      ? { nom, libelle, fn: null, forme: `${forme} : ${r}` }
      : { nom, libelle, fn: r, forme: '' };

  const vues: Export[] = [];
  for (const i of source.statements) {
    const avant = vues.length;
    if (ts.isFunctionDeclaration(i) && exporte(i)) {
      if (!i.body) continue; // une signature de surcharge : l'implémentation suit
      const nom = parDefaut(i) ? 'default' : (i.name?.text ?? 'default');
      const libelle = i.name?.text ?? 'default';
      const o = i.name ? obstacle(i.name.text) : null;
      vues.push(rendu(nom, libelle, o ?? i, 'fonction exportée'));
    } else if (ts.isVariableStatement(i) && exporte(i)) {
      const constante = estConst(i.declarationList);
      for (const d of i.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) {
          // Un motif : un site PAR NOM LIÉ, dont la valeur n'est pas une fonction locale établie.
          for (const n of nomsLies(d.name)) {
            vues.push(
              rendu(n.text, n.text, NON_LOCALE, `déstructuration exportée, « ${n.text} » y est lié`)
            );
          }
          continue;
        }
        const nom = d.name.text;
        const r = !constante
          ? REASSIGNABLE(nom)
          : (obstacle(nom) ?? (d.initializer ? valeur(d.initializer) : NON_LOCALE));
        vues.push(rendu(nom, nom, r, constante ? 'constante exportée' : 'liaison exportée'));
      }
    } else if (
      (ts.isClassDeclaration(i) || ts.isEnumDeclaration(i) || ts.isModuleDeclaration(i)) &&
      exporte(i)
    ) {
      const nom = parDefaut(i) ? 'default' : (i.name?.getText(source) ?? 'default');
      const genre = ts.isClassDeclaration(i)
        ? 'classe'
        : ts.isEnumDeclaration(i)
          ? 'enum'
          : 'espace de noms';
      vues.push({
        nom,
        libelle: i.name?.getText(source) ?? nom,
        fn: null,
        forme: `${genre} exportée`,
      });
    } else if (ts.isImportEqualsDeclaration(i) && exporte(i) && !i.isTypeOnly) {
      const nom = i.name.text;
      vues.push({ nom, libelle: nom, fn: null, forme: '`export import … =` (un import exporté)' });
    } else if (ts.isExportAssignment(i)) {
      const e = i.expression;
      const libelle = ts.isIdentifier(e) ? e.text : 'default';
      vues.push(
        i.isExportEquals
          ? { nom: 'export =', libelle, fn: null, forme: '`export =`' }
          : rendu('default', libelle, valeur(e), 'export par défaut')
      );
    } else if (ts.isExportDeclaration(i) && !i.isTypeOnly) {
      const depuis =
        i.moduleSpecifier && ts.isStringLiteral(i.moduleSpecifier)
          ? i.moduleSpecifier.text
          : i.moduleSpecifier?.getText(source);
      const clause = i.exportClause;
      if (clause === undefined) {
        vues.push({
          nom: TOUT,
          libelle: TOUT,
          fn: null,
          forme: `\`export *\` depuis « ${depuis} »`,
        });
      } else if (ts.isNamespaceExport(clause)) {
        const nom = clause.name.text;
        vues.push({ nom, libelle: nom, fn: null, forme: `\`export * as\` depuis « ${depuis} »` });
      } else {
        for (const s of clause.elements) {
          if (s.isTypeOnly) continue;
          const nom = s.name.text;
          const local = (s.propertyName ?? s.name).text;
          if (depuis !== undefined) {
            vues.push({ nom, libelle: nom, fn: null, forme: `réexport depuis « ${depuis} »` });
            continue;
          }
          // Jamais écarté comme type : seul `export type { … }` ou `{ type X }` marque un type.
          const r =
            types.has(local) && !declarations.has(local) ? TYPE_NON_MARQUE(local) : resoudre(local);
          vues.push(
            rendu(nom, nom, r, `\`export { ${local}${local === nom ? '' : ` as ${nom}`} }\``)
          );
        }
      }
    }
    for (let k = avant; k < vues.length; k++) vues[k]!.origine = i;
  }
  return vues;
}

/**
 * Les fonctions — et les méthodes d'objet ou de classe — qui portent ELLES-MÊMES la directive
 * `'use server'`, où qu'elles soient.
 */
function actionsEnLigne(source: ts.SourceFile): Site[] {
  const vues: Site[] = [];
  const visiter = (n: ts.Node): void => {
    if ((estFonction(n) || ts.isMethodDeclaration(n)) && n.body && ts.isBlock(n.body)) {
      if (directives(n.body.statements).includes('use server')) {
        const parent = n.parent;
        const nom =
          (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name
            ? n.name.getText(source)
            : ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
              ? parent.name.text
              : '(anonyme)';
        vues.push({ nom, genre: 'action', corps: n, forme: '' });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return vues;
}

/**
 * Les sites d'un fichier de console : ses actions, sa page, ses méthodes de route. Un export
 * porté par une instruction hors liste blanche (`refusees`), ou un générateur refusé sous le
 * routage (`ecartes`, par nom exporté), n'est pas un site : il a déjà sa faute, une seule.
 */
function sitesDuFichier(
  chemin: string,
  source: ts.SourceFile,
  refusees: ReadonlySet<ts.Statement>,
  ecartes: ReadonlySet<string>
): Site[] {
  const base = chemin.slice(chemin.lastIndexOf('/') + 1);
  const tous = exportsDuModule(source);
  const exports = tous.filter(
    (e) => (e.origine === undefined || !refusees.has(e.origine)) && !ecartes.has(e.nom)
  );
  const site = (e: Export, genre: Genre): Site => ({
    nom: e.libelle,
    genre,
    corps: e.fn,
    forme: e.forme,
  });
  const sites: Site[] = [];
  if (directives(source.statements).includes('use server')) {
    for (const e of exports) sites.push(site(e, 'action'));
  }
  if (EST_UNE_PAGE.test(base)) {
    const page = exports.find((e) => e.nom === 'default');
    if (page) sites.push(site(page, 'ecran'));
    else if (!tous.some((e) => e.nom === 'default')) {
      sites.push({ nom: 'default', genre: 'ecran', corps: null, forme: 'aucun export par défaut' });
    }
  }
  if (EST_UNE_ROUTE.test(base)) {
    for (const e of exports.filter((x) => METHODES_HTTP.has(x.nom) || x.nom === TOUT)) {
      sites.push(site(e, 'route'));
    }
  }
  const dejaVus = new Set<ts.Node | null>(sites.map((s) => s.corps).filter((c) => c !== null));
  for (const s of actionsEnLigne(source)) if (!dejaVus.has(s.corps)) sites.push(s);
  return sites;
}

/** Chaque nom que DÉCLARE le fichier, où que ce soit (paramètres et portées imbriquées compris). */
function nomsDeclares(source: ts.SourceFile): Map<string, number> {
  const vus = new Map<string, number>();
  const compter = (n: ts.Node | undefined): void => {
    if (n !== undefined && ts.isIdentifier(n)) vus.set(n.text, (vus.get(n.text) ?? 0) + 1);
  };
  const visiter = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) ||
      ts.isParameter(n) ||
      ts.isBindingElement(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isClassDeclaration(n) ||
      ts.isClassExpression(n) ||
      ts.isEnumDeclaration(n) ||
      ts.isModuleDeclaration(n) ||
      ts.isImportEqualsDeclaration(n) ||
      ts.isImportClause(n) ||
      ts.isNamespaceImport(n) ||
      ts.isImportSpecifier(n)
    ) {
      compter(n.name);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return vus;
}

/** La porte telle que le fichier la lie : ses noms importés, ses espaces de noms importés. */
interface Porte {
  noms: Set<string>;
  espaces: Set<string>;
}

/**
 * La porte d'un fichier : `requireRole` importé du module canonique, nommément (alias admis) ou
 * par espace de noms (`import * as r` puis `r.requireRole(…)`). Un nom de porte déclaré une
 * seconde fois n'importe où dans le fichier (homonyme, paramètre ou variable qui le masque) ou
 * réassigné n'est PAS la porte — échec fermé, sans analyse de portée.
 */
function porteDuFichier(chemin: string, source: ts.SourceFile): Porte {
  const dossier = chemin.slice(0, chemin.lastIndexOf('/'));
  const canonique = (specifieur: string): boolean => {
    if (!specifieur.startsWith('.')) return false;
    const parties: string[] = [];
    for (const p of `${dossier}/${specifieur}`.split('/')) {
      if (p === '..') {
        // Remonter au-delà de la racine du dépôt mène HORS du dépôt : ce n'est pas la porte.
        if (parties.length === 0) return false;
        parties.pop();
      } else if (p !== '.' && p !== '') parties.push(p);
    }
    return parties.join('/').replace(EXTENSION, '') === MODULE_DE_LA_PORTE;
  };
  const porte: Porte = { noms: new Set(), espaces: new Set() };
  for (const i of source.statements) {
    if (!ts.isImportDeclaration(i) || !ts.isStringLiteral(i.moduleSpecifier)) continue;
    const c = i.importClause;
    if (!c || c.isTypeOnly || !canonique(i.moduleSpecifier.text)) continue;
    const b = c.namedBindings;
    if (b && ts.isNamespaceImport(b)) porte.espaces.add(b.name.text);
    else if (b) {
      for (const e of b.elements) {
        if (!e.isTypeOnly && (e.propertyName ?? e.name).text === NOM_DE_LA_PORTE) {
          porte.noms.add(e.name.text);
        }
      }
    }
  }
  const declares = nomsDeclares(source);
  const reassignes = nomsReassignes(source);
  for (const lot of [porte.noms, porte.espaces]) {
    for (const nom of [...lot]) {
      if ((declares.get(nom) ?? 0) !== 1 || reassignes.has(nom)) lot.delete(nom);
    }
  }
  return porte;
}

/**
 * Le premier appel de LA porte dans un corps : `requireRole(…)` importé du module canonique, ou
 * `r.requireRole(…)` sur son espace de noms importé. Un homonyme local, un import d'ailleurs, un
 * objet quelconque ne sont pas la porte.
 */
function premierAppel(corps: ts.Node, porte: Porte): ts.CallExpression | null {
  let trouve: ts.CallExpression | null = null;
  const visiter = (n: ts.Node): void => {
    if (trouve) return;
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const estLaPorte = ts.isIdentifier(c)
        ? porte.noms.has(c.text)
        : ts.isPropertyAccessExpression(c) &&
          ts.isIdentifier(c.expression) &&
          porte.espaces.has(c.expression.text) &&
          c.name.text === NOM_DE_LA_PORTE;
      if (estLaPorte) {
        trouve = n;
        return;
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(corps);
  return trouve;
}

/** Les noms CommonJS : l'objet des exports, et ce qui y mène depuis la portée du module. */
const NOMS_COMMONJS = new Set(['exports', 'module', 'require', 'eval']);
const INTERNE_DU_BUNDLER = /^__(?:webpack|turbopack)_/;

/** Un identifiant en position de NOM DE PROPRIÉTÉ ou d'étiquette : ce n'est pas une référence. */
function estUnNomDePropriete(id: ts.Identifier): boolean {
  const p = id.parent;
  return (
    ((ts.isPropertyAccessExpression(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isEnumMember(p) ||
      ts.isJsxAttribute(p) ||
      ts.isMetaProperty(p) ||
      ts.isNamespaceExport(p)) &&
      p.name === id) ||
    (ts.isQualifiedName(p) && p.right === id) ||
    (ts.isBindingElement(p) && p.propertyName === id) ||
    (ts.isImportSpecifier(p) && p.propertyName === id) ||
    ts.isExportSpecifier(p) ||
    ((ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) && p.label === id) ||
    ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
      p.tagName === id)
  );
}

/**
 * `enfant`, fils direct de `parent`, est-il dans une RÉGION QUI LIE `this` et `arguments` ?
 * Une seule liste, fermée : le corps ou un paramètre d'une fonction non fléchée (déclaration,
 * expression, méthode, accesseur, constructeur), l'initialiseur d'une propriété de classe, le
 * corps d'un bloc `static {}`. Tout le reste d'un tel nœud — son nom (calculé ou non), ses
 * modificateurs et décorateurs, ses paramètres de type, son type de retour — s'évalue dans la
 * portée qui l'entoure, et n'est donc PAS une frontière.
 */
function lieThis(enfant: ts.Node, parent: ts.Node): boolean {
  if (
    ts.isFunctionDeclaration(parent) ||
    ts.isFunctionExpression(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isConstructorDeclaration(parent)
  ) {
    return (
      (parent.body !== undefined && parent.body === enfant) ||
      (ts.isParameter(enfant) && parent.parameters.includes(enfant))
    );
  }
  if (ts.isPropertyDeclaration(parent)) {
    return parent.initializer !== undefined && parent.initializer === enfant;
  }
  if (ts.isClassStaticBlockDeclaration(parent)) return parent.body === enfant;
  return false;
}

/**
 * `this` (ou `arguments`) au nœud `n` est-il lié par une région qui le lie, et non par la portée
 * du module ? On remonte les parents ; une frontière ne compte que si le chemin passe DANS sa
 * région liante (`lieThis`). Un décorateur s'évalue dans la portée qui entoure la classe qu'il
 * décore (classe, membre ou paramètre) : on saute à cette classe. Arrivé au fichier sans
 * frontière : portée du module — dans l'enveloppe CommonJS, l'objet des exports.
 */
function lieParUneRegion(n: ts.Node): boolean {
  let enfant: ts.Node = n;
  let parent: ts.Node | undefined = n.parent;
  while (parent !== undefined) {
    if (ts.isDecorator(enfant)) {
      let classe: ts.Node | undefined = parent;
      while (classe !== undefined && !ts.isClassLike(classe)) classe = classe.parent;
      if (classe === undefined) return false; // décorateur hors classe : échec fermé
      enfant = classe;
      parent = classe.parent;
      continue;
    }
    if (lieThis(enfant, parent)) return true;
    enfant = parent;
    parent = parent.parent;
  }
  return false;
}

/**
 * Ce qui, dans un fichier, nomme l'objet des exports CommonJS ou y mène : `exports`, `module`,
 * `require`, `eval` direct, un interne du bundler (`__webpack_…`, `__turbopack_…`) — même liés
 * localement —, `this` ou `arguments` qu'aucune région liante n'enferme (`lieParUneRegion` : dans
 * l'enveloppe CommonJS, c'est l'objet des exports et les arguments de l'enveloppe — y compris
 * dans un nom calculé de membre, un décorateur, une clause `extends`), une instruction `with`.
 * Chaque occurrence, avec sa ligne.
 */
function formesCommonJS(source: ts.SourceFile): string[] {
  const vues: string[] = [];
  const ligne = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
  const visiter = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const nom = n.text;
      const interdit =
        NOMS_COMMONJS.has(nom) ||
        INTERNE_DU_BUNDLER.test(nom) ||
        (nom === 'arguments' && !lieParUneRegion(n));
      if (interdit && !estUnNomDePropriete(n)) vues.push(`« ${nom} » ligne ${ligne(n)}`);
      return;
    }
    if (n.kind === ts.SyntaxKind.ThisKeyword && !lieParUneRegion(n)) {
      vues.push(`« this » hors d’une fonction ligne ${ligne(n)}`);
    }
    if (ts.isWithStatement(n)) vues.push(`« with » ligne ${ligne(n)}`);
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return vues;
}

function droitLitteral(appel: ts.CallExpression): string | null {
  const a = appel.arguments[0];
  return a !== undefined && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))
    ? a.text
    : null;
}

const GENRE_ATTENDU: Record<Genre, readonly string[]> = {
  action: ['action:'],
  ecran: ['ecran:'],
  route: ['action:', 'ecran:'],
};
const MOT_DU_GENRE: Record<Genre, string> = { action: 'action', ecran: 'page', route: 'méthode' };

/** Le jugement de la console : pur, tout est injecté. */
export function jugerLaConsole(
  fichiers: readonly FichierDeConsole[],
  matrice: Matrice,
  roles: readonly string[]
): Jugement {
  const j: Jugement = {
    fautes: [],
    fichiers: 0,
    actions: 0,
    routes: 0,
    lus: [],
    sites: [],
    couples: 0,
    couplesOuverts: 0,
    couplesFermes: 0,
  };
  const faute = (famille: Famille, message: string) => j.fautes.push({ famille, message });
  for (const f of fichiers) {
    if (!estDansLePerimetre(f.chemin)) continue;
    j.fichiers += 1;
    j.lus.push(f.chemin);
    const source = ts.createSourceFile(f.chemin, f.source, ts.ScriptTarget.Latest, true);
    const diagnostics = Reflect.get(source, 'parseDiagnostics') as readonly unknown[];
    if (diagnostics.length > 0) {
      faute(
        'source_illisible',
        `${f.chemin} — ${diagnostics.length} diagnostic(s) d'analyse : un fichier qu'on ne lit ` +
          `pas ne se juge pas, et il n'est pas sauté.`
      );
      continue;
    }
    const place = placeSousLeRoutage(f.chemin);
    if (place === 'non_admis') {
      faute(
        'export_non_jugeable',
        `${f.chemin} — ${MOTIF_FICHIER_NON_ADMIS}. Sous ${ROUTAGE_DE_LA_CONSOLE}, la garde ` +
          `n'admet que les fichiers qu'elle sait juger (FICHIERS_ADMIS_SOUS_LE_ROUTAGE : ` +
          `${FICHIERS_ADMIS_SOUS_LE_ROUTAGE.join(', ')}) : Next sert comme route l'export par ` +
          `défaut d'un fichier de métadonnées (icon, opengraph-image, sitemap…) de tout segment, ` +
          `sans ${NOM_DE_LA_PORTE}. Le code utilitaire se range hors de src/app ou dans un ` +
          `dossier privé (_nom) — échec fermé (REQ-SEC-023).`
      );
    }
    const commonjs = formesCommonJS(source);
    if (commonjs.length > 0) {
      faute(
        'export_non_jugeable',
        `${f.chemin} — module CommonJS : une route ou une action de la console s'écrit en exports ` +
          `ES. Le fichier nomme ${commonjs.join(', ')} : l'objet des exports CommonJS ou une voie ` +
          `qui y mène. La garde ne dérive ses sites que des exports ES ; ces noms sont refusés ` +
          `même liés localement — échec fermé (REQ-SEC-023).`
      );
    }
    const refusees = exportsNonAdmis(f.chemin, source);
    for (const i of refusees) {
      const ligne = source.getLineAndCharacterOfPosition(i.getStart(source)).line + 1;
      const texte = i.getText(source).replace(/\s+/g, ' ');
      const extrait = texte.length > 80 ? `${texte.slice(0, 79)}…` : texte;
      faute(
        'export_non_jugeable',
        `${f.chemin} — ${MOTIF_HORS_LISTE_BLANCHE}, ligne ${ligne} : ` +
          `« ${extrait} ». La garde juge par LISTE BLANCHE (FORMES_D_EXPORT_ADMISES) : une forme ` +
          `qu'elle ne sait pas juger peut publier une méthode ou une action que Next servirait ` +
          `sans ${NOM_DE_LA_PORTE} — échec fermé (REQ-SEC-023).`
      );
    }
    // Un générateur de Next exporté par un fichier de routage admis : refusé, sous son nom.
    const generateurs =
      place === 'admis'
        ? exportsDuModule(source).filter(
            (e) =>
              (GENERATEURS_REFUSES as readonly string[]).includes(e.nom) &&
              (e.origine === undefined || !refusees.includes(e.origine))
          )
        : [];
    for (const e of generateurs) {
      const debut = e.origine?.getStart(source) ?? 0;
      const ligne = source.getLineAndCharacterOfPosition(debut).line + 1;
      faute(
        'export_non_jugeable',
        `${f.chemin} — « ${e.nom} », ligne ${ligne} : ${MOTIF_GENERATEUR}. Aucune règle de la ` +
          `garde ne sait le juger (GENERATEURS_REFUSES) : la console écrit un \`metadata\` ou un ` +
          `\`viewport\` statique — échec fermé (REQ-SEC-023).`
      );
    }
    const porte = porteDuFichier(f.chemin, source);
    const ecartes = new Set(generateurs.map((e) => e.nom));
    for (const site of sitesDuFichier(f.chemin, source, new Set(refusees), ecartes)) {
      if (site.genre === 'action') j.actions += 1;
      else j.routes += 1;
      const ou = `${f.chemin} — ${MOT_DU_GENRE[site.genre]} « ${site.nom} »`;
      j.sites.push(ou);
      if (site.corps === null) {
        faute(
          'export_non_jugeable',
          `${ou} : ${site.forme}. Son corps ne s'établit pas dans le fichier, la garde ne peut pas ` +
            `y voir ${NOM_DE_LA_PORTE} — échec fermé : écris-la comme une fonction locale qui ` +
            `l'appelle (REQ-SEC-023, RM-07).`
        );
        continue;
      }
      const appel = premierAppel(site.corps, porte);
      if (appel === null) {
        faute(
          site.genre === 'action' ? 'action_sans_requireRole' : 'route_sans_requireRole',
          `${ou} n'appelle pas ${NOM_DE_LA_PORTE} importé de ${MODULE_DE_LA_PORTE} (un homonyme ` +
            `local, un import d'ailleurs, un nom masqué ou un objet quelconque ne gardent pas) : ` +
            `chaque action et chaque route de la console passe par la porte, et le défaut est le ` +
            `refus (REQ-SEC-023, RM-05).`
        );
        continue;
      }
      const droit = droitLitteral(appel);
      if (droit === null) {
        faute(
          'droit_non_litteral',
          `${ou} appelle ${NOM_DE_LA_PORTE} avec un droit qui n'est pas une chaîne littérale : ` +
            `il ne se confronte pas à la matrice.`
        );
        continue;
      }
      if (!GENRE_ATTENDU[site.genre].some((p) => droit.startsWith(p))) {
        faute(
          'droit_de_mauvais_genre',
          `${ou} invoque « ${droit} », alors qu'elle attend un droit ` +
            `${GENRE_ATTENDU[site.genre].join(' ou ')}…`
        );
        continue;
      }
      if (!Object.hasOwn(matrice, droit)) {
        faute(
          'droit_hors_matrice',
          `${ou} invoque « ${droit} », absent de la matrice (src/server/roles/matrice.ts) : ` +
            `déclare-le avec les rôles qui l'ont, sinon il est refusé à tous.`
        );
        continue;
      }
      // Le droit est déclaré : chaque rôle est confronté, UN PAR UN, à sa ligne de la matrice.
      const ligne = matrice[droit]!;
      for (const role of roles) {
        if (ligne.includes(role)) j.couplesOuverts += 1;
        else j.couplesFermes += 1;
        j.couples += 1;
      }
    }
  }
  return j;
}

/** Le verdict imprimé d'un jugement : pur. `droits` et `nbRoles` décrivent la matrice confrontée. */
export function rendreLeVerdict(
  j: Jugement,
  droits: number,
  nbRoles: number
): { code: 0 | 1; lignes: string[] } {
  const compte =
    `${j.fichiers} fichier(s) de console lu(s), ${j.actions} action(s) et ${j.routes} route(s) ` +
    `confrontée(s) à la matrice (${droits} droit(s) × ${nbRoles} rôles), ` +
    `${j.couples} couple(s) écran-rôle confronté(s) rôle par rôle ` +
    `(${j.couplesOuverts} ouvert(s), ${j.couplesFermes} fermé(s))`;
  if (j.fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${j.fautes.length} faute(s) ; ${compte} :`,
        ...j.fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ],
    };
  }
  const lignes = [`✅ ${ID_REGISTRE} — ${compte} ; aucune action ni route sans requireRole.`];
  if (j.fichiers === 0) {
    lignes.push(
      '   Périmètre vide, et c’est dit : aucun fichier suivi sous src/app/(console)/ ni ' +
        'src/server/console/. La tâche UX-P1-12 ouvre le premier écran ; que la garde MESURE se ' +
        `prouve par « pnpm ${ID_REGISTRE}:prove », pas par ce zéro.`
    );
    return { code: 0, lignes };
  }
  lignes.push('   Fichiers lus :', ...j.lus.map((c) => `     ${c}`));
  if (j.sites.length === 0) {
    lignes.push(
      `   Aucun site : les ${j.fichiers} fichier(s) lu(s) n’exportent ni action, ni page, ni ` +
        'méthode de route.'
    );
  } else {
    lignes.push('   Sites confrontés :', ...j.sites.map((s) => `     ${s}`));
  }
  return { code: 0, lignes };
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const MATRICE_TEMOIN: Matrice = {
  'action:lever_gel': ['admin'],
  'ecran:tableau': ['admin', 'lecteur'],
};
const ROLES_TEMOIN = ['admin', 'qualifieur', 'comptable', 'lecteur'];
/** L'import de la porte depuis `src/app/(console)/console/<x>/` (un module d'actions : `_gel/`, dossier privé). */
const IMPORT_PORTE = "import { requireRole } from '../../../../server/roles/require-role';";
const ACTION = (corps: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/_gel/actions.ts',
  source: `'use server';\n${IMPORT_PORTE}\nexport async function leverLeGel() {\n${corps}\n}\n`,
});
const SERVEUR = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/_gel/actions.ts',
  source: `'use server';\n${IMPORT_PORTE}\n${source}\n`,
});
const ROUTE = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/export/route.ts',
  source: `${IMPORT_PORTE}\n${source}\n`,
});
/** Un nom calculé qui pose `GET` sur le `this` de la portée où il s'évalue. */
const FUITE_PAR_THIS = "(this.GET = async () => new Response('x'), 'm')";
const PAGE = (corps: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/tableau/page.tsx',
  source: `${IMPORT_PORTE}\nexport default async function Page() {\n${corps}\n  return null;\n}\n`,
});
const PAGE_BRUTE = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/tableau/page.tsx',
  source: `${IMPORT_PORTE}\n${source}\n`,
});
const GARDE_ACTION = "  await requireRole('action:lever_gel', j, p);";
const GARDE_ECRAN = "  await requireRole('ecran:tableau', j, p);";

const TEMOINS: {
  famille: Famille;
  quoi: string;
  fichiers: FichierDeConsole[];
  /** Un extrait que le message doit porter, quand la famille seule ne dit pas le chemin. */
  motif?: string;
}[] = [
  {
    famille: 'action_sans_requireRole',
    quoi: 'la fixtureRouge du registre : une Server Action sans requireRole',
    fichiers: [ACTION('  return 1;')],
  },
  {
    famille: 'action_sans_requireRole',
    quoi: 'forme `export { f }` : une fonction locale exportée par liste, sans requireRole',
    fichiers: [SERVEUR('async function leverLeGel() {\n  return 1;\n}\nexport { leverLeGel };')],
  },
  {
    famille: 'action_sans_requireRole',
    quoi: 'forme `export { f as g }` : un alias, sans requireRole',
    fichiers: [SERVEUR('const f = async () => 1;\nexport { f as lever };')],
  },
  { famille: 'route_sans_requireRole', quoi: 'une page sans requireRole', fichiers: [PAGE('')] },
  {
    famille: 'route_sans_requireRole',
    quoi: 'forme `export { traiter as GET, traiter as POST }` d’un route.ts, sans requireRole',
    fichiers: [
      ROUTE(
        'async function traiter() {\n  return 1;\n}\nexport { traiter as GET, traiter as POST };'
      ),
    ],
  },
  {
    famille: 'route_sans_requireRole',
    quoi: 'forme `export const GET = traiter` (un nom de fonction locale), sans requireRole',
    fichiers: [ROUTE('async function traiter() {\n  return 1;\n}\nexport const GET = traiter;')],
  },
  {
    famille: 'droit_non_litteral',
    quoi: 'un droit passé par une variable',
    fichiers: [ACTION('  await requireRole(droit, j, p);')],
  },
  {
    famille: 'droit_de_mauvais_genre',
    quoi: 'une action qui invoque un droit d’écran',
    fichiers: [ACTION("  await requireRole('ecran:tableau', j, p);")],
  },
  {
    famille: 'droit_hors_matrice',
    quoi: 'une action ajoutée sans entrée dans la matrice',
    fichiers: [ACTION("  await requireRole('action:geler_tout', j, p);")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export const x = enveloppe(async () => …)`, requireRole DANS l’enveloppe',
    fichiers: [
      SERVEUR(`export const approuverLot = avecJournal(async () => {\n${GARDE_ACTION}\n});`),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export const GET = handler` d’un route.ts, handler importé',
    fichiers: [ROUTE("import { handler } from './autre';\nexport const GET = handler;")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export const LIMITE = 3` d’un module « use server »',
    fichiers: [SERVEUR('export const LIMITE = 3;')],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export { f } from` : un réexport dans un module « use server »',
    fichiers: [SERVEUR("export { leverLeGel } from './autre';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export { GET } from` : un réexport de méthode dans un route.ts',
    fichiers: [ROUTE("export { GET } from './autre';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export *` dans un module « use server »',
    fichiers: [SERVEUR("export * from './autre';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export *` dans un route.ts',
    fichiers: [ROUTE("export * from './autre';")],
  },
  // ── la LISTE BLANCHE : toute forme d'export que la garde ne sait pas juger est refusée ──────
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export =` dans un route.ts (Next la compile en module.exports : servie 200)',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE("export = { GET: async () => new Response('x') };")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export * from` dans un route.ts, hors liste blanche',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE("export * from './h';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export { GET } from` dans un route.ts, hors liste blanche',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE("export { GET } from './h';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'un réexport non HTTP (`export { aide } from`) dans un route.ts, hors liste blanche',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE("export { aide } from './h';")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export default` dans un route.ts',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE("export default async () => new Response('x');")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export enum` dans un route.ts',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE('export enum E {\n  A,\n}')],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export namespace` dans un route.ts',
    motif: MOTIF_HORS_LISTE_BLANCHE,
    fichiers: [ROUTE('export namespace N {\n  export const GET = 1;\n}')],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'forme `export default enveloppe(Page)` d’une page, requireRole ailleurs dans le fichier',
    fichiers: [
      PAGE_BRUTE(
        `async function garde() {\n${GARDE_ECRAN}\n}\n` +
          'function Page() {\n  return null;\n}\nexport default avecGarde(Page);'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'une page sans export par défaut, requireRole ailleurs dans le fichier',
    fichiers: [PAGE_BRUTE(`async function garde() {\n${GARDE_ECRAN}\n}`)],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'liaison réassignée : un `let` gardé à l’initialiseur, réassigné, exporté par alias d’un route.ts',
    fichiers: [
      ROUTE(
        `import { handler } from './h';\nlet traiter = async () => {\n${GARDE_ECRAN}\n};\n` +
          'traiter = handler;\nexport { traiter as GET };'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'liaison réassignée : un `export let` gardé à l’initialiseur, réassigné, d’un module « use server »',
    fichiers: [
      SERVEUR(
        `import { impl } from './h';\nexport let voirIban = async () => {\n${GARDE_ACTION}\n};\n` +
          'voirIban = impl;'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'liaison réassignée dans une chaîne `const a = b` d’un route.ts',
    fichiers: [
      ROUTE(
        `import { handler } from './h';\nlet b = async () => {\n${GARDE_ECRAN}\n};\n` +
          'b = handler;\nconst a = b;\nexport const GET = a;'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'type homonyme d’un import : `export { X }` d’un route.ts',
    fichiers: [ROUTE("import { GET } from './h';\ntype GET = never;\nexport { GET };")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'type homonyme d’un import : `export { x as GET }` d’un route.ts',
    fichiers: [
      ROUTE("import { handler } from './h';\ntype handler = never;\nexport { handler as GET };"),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'type homonyme d’un `var` de bloc de premier niveau (portée module) : `export { x as GET }` d’un route.ts',
    fichiers: [
      ROUTE(
        "import { impl } from './h';\ntype handler = never;\n{\n  var handler = impl;\n}\n" +
          'export { handler as GET };'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'type homonyme d’un `for (var … of …)` de premier niveau : `export { x as DELETE }` d’un route.ts',
    fichiers: [
      ROUTE(
        "import { impl } from './h';\ntype handler = never;\nfor (var handler of [impl]) {\n}\n" +
          'export { handler as DELETE };'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'export non marqué `type` d’un nom sans valeur (`type T …; export { T }`) d’un module « use server »',
    fichiers: [SERVEUR('type T = string;\nexport { T };')],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'liaison `let` gardée, JAMAIS réassignée, exportée par alias d’un route.ts',
    fichiers: [
      ROUTE(`let traiter = async () => {\n${GARDE_ECRAN}\n};\nexport { traiter as GET };`),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'déclaration de fonction gardée, réassignée à un import, exportée par alias d’un route.ts',
    fichiers: [
      ROUTE(
        `import { handler } from './h';\nasync function traiter() {\n${GARDE_ECRAN}\n}\n` +
          'traiter = handler;\nexport { traiter as GET };'
      ),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'déstructuration d’objet exportée d’un route.ts : un site par nom lié',
    fichiers: [ROUTE("import { handlers } from './auth';\nexport const { GET, POST } = handlers;")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'déstructuration de tableau exportée d’un route.ts',
    fichiers: [ROUTE("export const [GET] = [async () => new Response('x')];")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'import-equals exporté (`export import X = …`) d’un route.ts',
    fichiers: [ROUTE("import * as h from './h';\nexport import GET = h.handler;")],
  },
  {
    famille: 'route_sans_requireRole',
    quoi: 'un route.js (JavaScript) sans requireRole',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/export/route.js',
        source: 'export async function GET() {\n  return 1;\n}\n',
      },
    ],
  },
  {
    famille: 'action_sans_requireRole',
    quoi: 'une méthode d’objet qui porte « use server », sans requireRole',
    fichiers: [
      {
        chemin: 'src/server/console/aide.ts',
        source:
          "export const o = {\n  async lever() {\n    'use server';\n    return 1;\n  },\n};\n",
      },
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'module CommonJS : `exports.GET =` d’un route.ts (aucun export ES, aucun site)',
    fichiers: [ROUTE("exports.GET = async () => new Response('x');")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: 'module CommonJS : `module.exports = { GET }` d’un route.js',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/w7/route.js',
        source: "module.exports = { GET: async () => new Response('x') };\n",
      },
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: "module CommonJS : `Object.defineProperty(exports, 'GET', …)` d’un route.ts",
    fichiers: [
      ROUTE("Object.defineProperty(exports, 'GET', { value: async () => new Response('x') });"),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: "module CommonJS : `exports['POST'] =` d’un route.ts",
    fichiers: [ROUTE("exports['POST'] = async () => new Response('x');")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans le nom calculé d’une méthode de classe (portée du module) d’un route.js',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/w7/route.js',
        source: `class C {\n  [${FUITE_PAR_THIS}]() {}\n}\n`,
      },
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans le nom calculé d’un accesseur `get` d’un route.ts',
    fichiers: [ROUTE(`class C {\n  get [${FUITE_PAR_THIS}]() {\n    return 1;\n  }\n}`)],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans le nom calculé d’un accesseur `set` d’un route.ts',
    fichiers: [ROUTE(`class C {\n  set [${FUITE_PAR_THIS}](v) {}\n}`)],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans le nom calculé d’une propriété statique d’un route.ts',
    fichiers: [ROUTE(`class C {\n  static [${FUITE_PAR_THIS}] = 1;\n}`)],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans le nom calculé d’une méthode de littéral d’objet d’un route.ts',
    fichiers: [ROUTE(`const o = {\n  [${FUITE_PAR_THIS}]() {},\n};`)],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans un décorateur de classe d’un route.ts',
    fichiers: [ROUTE("@((this.GET = async () => new Response('x'), (c) => c))\nclass C {}")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans un décorateur de méthode d’un route.ts',
    fichiers: [
      ROUTE("class C {\n  @((this.GET = async () => new Response('x'), (m) => m))\n  m() {}\n}"),
    ],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`this` dans la clause `extends` d’un route.ts',
    fichiers: [ROUTE("class C extends (this.GET = async () => new Response('x'), Object) {}")],
  },
  {
    famille: 'export_non_jugeable',
    quoi: '`arguments` dans le nom calculé d’une méthode de classe d’un route.ts',
    fichiers: [
      ROUTE("class C {\n  [(arguments[0].GET = async () => new Response('x'), 'm')]() {}\n}"),
    ],
  },
  {
    famille: 'route_sans_requireRole',
    quoi: 'un import de la porte dont le chemin remonte au-delà de la racine du dépôt',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/export/route.ts',
        source:
          "import { requireRole } from '../../../../../../src/server/roles/require-role';\n" +
          `export async function GET() {\n${GARDE_ECRAN}\n}\n`,
      },
    ],
  },
  {
    famille: 'route_sans_requireRole',
    quoi: 'un `requireRole` homonyme défini dans le fichier : il ne garde pas',
    fichiers: [
      ROUTE(
        'async function requireRole() {\n  return { ok: true };\n}\n' +
          `export async function GET() {\n${GARDE_ECRAN}\n}`
      ),
    ],
  },
  {
    famille: 'route_sans_requireRole',
    quoi: '`x.requireRole(…)` sur un objet qui n’est pas le module des rôles',
    fichiers: [
      ROUTE(
        'const x = { requireRole: async () => ({ ok: true }) };\n' +
          "export async function GET() {\n  await x.requireRole('ecran:tableau', j, p);\n}"
      ),
    ],
  },
  // ── la liste blanche des FICHIERS : Next sert les fichiers de métadonnées de tout segment ────
  ...['icon.tsx', 'opengraph-image.tsx', 'sitemap.ts', 'apple-icon.tsx', 'utils.ts'].map((nom) => ({
    famille: 'export_non_jugeable' as const,
    quoi: `un ${nom} sous le routage de la console, export par défaut qui lit une donnée protégée`,
    motif: 'fichier non admis sous le routage de la console : Next peut le servir',
    fichiers: [
      {
        chemin: `src/app/(console)/console/fiches/[id]/${nom}`,
        source:
          "import { lireFiche } from '../../../../../server/console/fiches';\n" +
          'export default async function F({ params }) {\n' +
          '  return new Response(JSON.stringify(await lireFiche(params.id)));\n}\n',
      },
    ],
  })),
  {
    famille: 'export_non_jugeable',
    quoi: '`generateMetadata` dans une page gardée de la console, qui lit une donnée protégée',
    motif: '« generateMetadata »',
    fichiers: [
      PAGE_BRUTE(
        `export default async function Page() {\n${GARDE_ECRAN}\n  return null;\n}\n` +
          "export async function generateMetadata() {\n  return { title: String(await lireFiche('x')) };\n}"
      ),
    ],
  },
  {
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    fichiers: [ACTION('  await requireRole(')],
  },
];

const CONTRE_TEMOINS: { quoi: string; fichiers: FichierDeConsole[] }[] = [
  {
    quoi: 'une action et une page qui invoquent un droit déclaré',
    fichiers: [ACTION(GARDE_ACTION), PAGE(GARDE_ECRAN)],
  },
  {
    quoi: 'un module de console sans « use server » (une aide, pas une action)',
    fichiers: [{ chemin: 'src/server/console/aide.ts', source: 'export async function a() {}\n' }],
  },
  {
    quoi: 'forme `export { f }` avec requireRole',
    fichiers: [
      SERVEUR(`async function leverLeGel() {\n${GARDE_ACTION}\n}\nexport { leverLeGel };`),
    ],
  },
  {
    quoi: 'forme `export { f as g }` avec requireRole',
    fichiers: [SERVEUR(`const f = async () => {\n${GARDE_ACTION}\n};\nexport { f as lever };`)],
  },
  {
    quoi: 'forme `export { traiter as GET, traiter as POST }` avec requireRole',
    fichiers: [
      ROUTE(
        `async function traiter() {\n${GARDE_ECRAN}\n}\nexport { traiter as GET, traiter as POST };`
      ),
    ],
  },
  {
    quoi: 'forme `export const GET = traiter` avec requireRole',
    fichiers: [ROUTE(`async function traiter() {\n${GARDE_ECRAN}\n}\nexport const GET = traiter;`)],
  },
  {
    quoi: 'forme `export const x = async () => …` avec requireRole (la fléchée, pas l’enveloppe)',
    fichiers: [SERVEUR(`export const approuverLot = async () => {\n${GARDE_ACTION}\n};`)],
  },
  {
    quoi: 'forme `export { Page as default }` d’une page avec requireRole',
    fichiers: [
      PAGE_BRUTE(
        `async function Page() {\n${GARDE_ECRAN}\n  return null;\n}\nexport { Page as default };`
      ),
    ],
  },
  {
    quoi: 'un type exporté d’un module « use server » (effacé : pas une valeur)',
    fichiers: [SERVEUR('export type T = string;\ntype U = 1;\nexport type { U };')],
  },
  {
    quoi:
      'les formes de la liste blanche telles que la console les écrit : configuration de segment, ' +
      'méthodes gardées, types, `export type { … } from`, layout et page d’erreur par défaut',
    fichiers: [
      ROUTE(
        "export const dynamic = 'force-dynamic';\n" +
          `export async function GET() {\n${GARDE_ECRAN}\n}\n` +
          `export function POST() {\n${GARDE_ECRAN}\n}\n` +
          'export type T = string;\nexport interface I {\n  a: 1;\n}\n' +
          "export type { U } from './types';"
      ),
      {
        chemin: 'src/app/(console)/console/layout.tsx',
        source:
          'export const metadata = { title: "Console" };\n' +
          'export default function Layout() {\n  return null;\n}\n',
      },
      {
        chemin: 'src/app/(console)/console/error.tsx',
        source: "'use client';\nexport default function Erreur() {\n  return null;\n}\n",
      },
    ],
  },
  {
    quoi: 'une chaîne de `const` gardée, jamais réassignée, à côté d’un import',
    fichiers: [
      ROUTE(
        `import { handler } from './h';\nconst b = async () => {\n${GARDE_ECRAN}\n};\n` +
          'const a = b;\nexport const GET = a;\nexport { b as POST };'
      ),
    ],
  },
  {
    quoi: 'un `export type { X }` explicite, homonyme d’un import : un type, pas une valeur',
    fichiers: [ROUTE("import { GET } from './h';\ntype GET = never;\nexport type { GET };")],
  },
  {
    quoi: 'un `export type { T }` réel, et une `const` gardée à côté d’un `var` homonyme enfermé dans une fonction',
    fichiers: [
      SERVEUR('type T = string;\nexport type { T };\nexport { type T as U };'),
      ROUTE(
        `const traiter = async () => {\n${GARDE_ECRAN}\n};\n` +
          'function aide() {\n  {\n    var traiter = 2;\n  }\n  return traiter;\n}\n' +
          'export { traiter as GET };'
      ),
    ],
  },
  {
    quoi: 'un route.js gardé, une méthode de classe « use server » gardée',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/export/route.js',
        source: `${IMPORT_PORTE}\nexport async function GET() {\n${GARDE_ECRAN}\n}\n`,
      },
      {
        chemin: 'src/server/console/aide.ts',
        source:
          "import { requireRole } from '../roles/require-role';\n" +
          `export class C {\n  async lever() {\n    'use server';\n${GARDE_ACTION}\n  }\n}\n`,
      },
    ],
  },
  {
    quoi:
      '`this` dans une région qui le lie : corps de méthode, de constructeur, d’accesseur, ' +
      'paramètres, bloc `static`, initialiseur non calculé, nom calculé sous une fonction',
    fichiers: [
      ROUTE(
        'class C {\n  x = this;\n  static y = this;\n  static {\n    this.z = 1;\n  }\n' +
          '  constructor() {\n    this.a = 1;\n  }\n  m(a = this) {\n    return [a, this, arguments];\n  }\n' +
          '  get g() {\n    return this;\n  }\n}\n' +
          'function f() {\n  return class {\n    [this.k]() {}\n  };\n}\n' +
          `export async function GET() {\n${GARDE_ECRAN}\n}`
      ),
    ],
  },
  {
    quoi: 'une route en exports ES qui importe la porte par espace de noms et l’appelle',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/export/route.ts',
        source:
          "import * as roles from '../../../../server/roles/require-role.ts';\n" +
          "export async function GET() {\n  await roles.requireRole('ecran:tableau', j, p);\n}\n",
      },
    ],
  },
  {
    quoi: 'un fichier utilitaire sous un dossier privé de Next (`_prive/`) de la console',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/fiches/_prive/format.ts',
        source:
          'export function formater(x) {\n  return x;\n}\n' +
          'export default function F() {\n  return null;\n}\n',
      },
    ],
  },
  {
    quoi:
      'les huit noms de fichier admis sous le routage de la console : page et route gardées, ' +
      'layout, template, default, loading, error, not-found',
    fichiers: [
      PAGE(GARDE_ECRAN),
      ROUTE(`export async function GET() {\n${GARDE_ECRAN}\n}`),
      ...['layout', 'template', 'default', 'loading', 'error', 'not-found'].map((nom) => ({
        chemin: `src/app/(console)/console/tableau/${nom}.tsx`,
        source: 'export default function Composant() {\n  return null;\n}\n',
      })),
    ],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const fautes = jugerLaConsole(t.fichiers, MATRICE_TEMOIN, ROLES_TEMOIN).fautes;
    const rougit = fautes.some(
      (f) => f.famille === t.famille && (t.motif === undefined || f.message.includes(t.motif))
    );
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLaConsole(c.fichiers, MATRICE_TEMOIN, ROLES_TEMOIN).fautes;
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
    for (const f of fautes) lignes.push(`   [${f.famille}] ${f.message}`);
  }
  const couvertes = new Set(TEMOINS.map((t) => t.famille));
  const orphelines = FAMILLES.filter((f) => !couvertes.has(f));
  ok &&= orphelines.length === 0;
  for (const f of orphelines) lignes.push(`❌ famille sans témoin : ${f}`);
  lignes.unshift(
    ok
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent sur leurs ${TEMOINS.length} ` +
          `témoins, ${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

// ── le dépôt ─────────────────────────────────────────────────────────────────────────────────────

function juger(): { code: 0 | 1; lignes: string[] } {
  const chemins = fichiersSuivisOuRefus(ID_REGISTRE).filter(estDansLePerimetre);
  const fichiers = chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }));
  const j = jugerLaConsole(fichiers, ROLES_PAR_DROIT, ROLES_CONSOLE);
  return rendreLeVerdict(j, Object.keys(MATRICE_DES_ROLES).length, ROLES_CONSOLE.length);
}

/** Importé par sa spécification autant que lancé en script : l'import ne doit rien lire ni sortir. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]roles(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
