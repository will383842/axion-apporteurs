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
 * comme en JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`). Chacune est
 * confrontée à LA matrice (`src/server/roles/matrice.ts`) :
 *   — une ACTION est TOUTE valeur exportée d'un module `'use server'`, sous toute forme
 *     (déclaration, `export { f }` avec ou sans alias, `export const` ou `export let` quel que soit
 *     l'initialiseur, déstructuration — un site par nom lié —, `export default`, `export *`,
 *     réexport, `export import X = …`), ou toute fonction ou méthode qui porte elle-même la
 *     directive. Elle appelle `requireRole('action:<nom>', …)` ;
 *   — une PAGE (`page.tsx`, `page.js`…) appelle `requireRole('ecran:<nom>', …)` dans sa fonction
 *     exportée par défaut ; une ROUTE (`route.ts`, `route.js`…) l'appelle dans chacune de ses
 *     méthodes HTTP exportées, sous toute forme, alias et déstructuration compris ;
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
 * Le vert imprime les fichiers lus, les sites confrontés, et les couples droit-rôle confrontés à la
 * ligne de la matrice RÔLE PAR RÔLE (ouverts, fermés). Le « périmètre vide » ne se dit que si AUCUN
 * fichier n'est lu.
 *
 * SEPT FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `action_sans_requireRole`  une action de console qui n'appelle pas `requireRole`
 *   `route_sans_requireRole`   une page ou une méthode de route qui ne l'appelle pas
 *   `droit_non_litteral`       un droit qui n'est pas une chaîne littérale : il ne se confronte pas
 *   `droit_de_mauvais_genre`   une action qui invoque un droit `ecran:`, une page un droit `action:`
 *   `droit_hors_matrice`       un droit absent de la matrice — l'action ou la route est nommée
 *   `export_non_jugeable`      un site dont le corps ne s'établit pas dans le fichier
 *   `source_illisible`         un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle voit la PRÉSENCE de l'appel et son droit, pas que le verdict est honoré :
 * une action qui appelle `requireRole` puis ignore le refus lui échappe, comme un `requireRole`
 * présent dans une fermeture jamais appelée ou dans un paramètre par défaut (l'appel est DANS le
 * corps, sans être exécuté à chaque requête) — c'est la relecture qui les tient, et `requireRole`
 * rend un verdict qu'on ne peut pas lire comme un succès sans son `ok`. Elle ne suit pas un appel délégué à une fonction voisine : l'appel doit être DANS l'action (RM-07 —
 * une garde extraite se perd avec son appelant). Elle tient pour l'appel de la porte tout
 * `x.requireRole(…)`, sur un objet QUELCONQUE : elle ne vérifie pas que `x` est le module de la
 * porte — c'est la relecture qui le tient. Seuls `page.*` et `route.*` sont des sites de routage :
 * `layout.*`, `template.*`, `default.*` (route parallèle), `loading.*`, `error.*`, `not-found.*`
 * ne sont PAS jugés — une page se garde elle-même, et le contenu d'un `default.*` ou d'un `layout.*`
 * qui lirait une donnée protégée lui échappe. Hors de `src/app/(console)/` et de
 * `src/server/console/`, elle ne juge rien.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLaConsole` et `rendreLeVerdict` sont pures : fichiers,
 * matrice et rôles sont INJECTÉS, sans défaut. `--prove` ne lit rien du dépôt.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { MATRICE_DES_ROLES, ROLES_CONSOLE } from '../../src/server/roles/matrice';

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
/** Une page ou une route : TypeScript comme JavaScript (Next compile un `page.js`, un `route.js`). */
const EST_UNE_PAGE = /^page\.(?:[jt]sx?|[mc][jt]s)$/;
const EST_UNE_ROUTE = /^route\.(?:[jt]sx?|[mc][jt]s)$/;
const METHODES_HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const NOM_DE_LA_PORTE = 'requireRole';
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

/** Les sites d'un fichier de console : ses actions, sa page, ses méthodes de route. */
function sitesDuFichier(chemin: string, source: ts.SourceFile): Site[] {
  const base = chemin.slice(chemin.lastIndexOf('/') + 1);
  const exports = exportsDuModule(source);
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
    sites.push(
      page
        ? site(page, 'ecran')
        : { nom: 'default', genre: 'ecran', corps: null, forme: 'aucun export par défaut' }
    );
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

/** Le premier appel de la porte dans un corps : `requireRole(…)` ou `x.requireRole(…)`. */
function premierAppel(corps: ts.Node): ts.CallExpression | null {
  let trouve: ts.CallExpression | null = null;
  const visiter = (n: ts.Node): void => {
    if (trouve) return;
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const nom = ts.isIdentifier(c)
        ? c.text
        : ts.isPropertyAccessExpression(c)
          ? c.name.text
          : null;
      if (nom === NOM_DE_LA_PORTE) {
        trouve = n;
        return;
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(corps);
  return trouve;
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
    for (const site of sitesDuFichier(f.chemin, source)) {
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
      const appel = premierAppel(site.corps);
      if (appel === null) {
        faute(
          site.genre === 'action' ? 'action_sans_requireRole' : 'route_sans_requireRole',
          `${ou} n'appelle pas ${NOM_DE_LA_PORTE} : chaque action et chaque route de la console ` +
            `passe par la porte, et le défaut est le refus (REQ-SEC-023, RM-05).`
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
const ACTION = (corps: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/gel/actions.ts',
  source: `'use server';\nexport async function leverLeGel() {\n${corps}\n}\n`,
});
const SERVEUR = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/gel/actions.ts',
  source: `'use server';\n${source}\n`,
});
const ROUTE = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/export/route.ts',
  source: `${source}\n`,
});
const PAGE = (corps: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/tableau/page.tsx',
  source: `export default async function Page() {\n${corps}\n  return null;\n}\n`,
});
const PAGE_BRUTE = (source: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/tableau/page.tsx',
  source: `${source}\n`,
});
const GARDE_ACTION = "  await requireRole('action:lever_gel', j, p);";
const GARDE_ECRAN = "  await requireRole('ecran:tableau', j, p);";

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierDeConsole[] }[] = [
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
    quoi: 'un type exporté d’un module « use server » (effacé : pas une valeur), et un réexport non HTTP d’un route.ts',
    fichiers: [
      SERVEUR('export type T = string;\ntype U = 1;\nexport type { U };'),
      ROUTE("export { aide } from './autre';"),
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
        source: `export async function GET() {\n${GARDE_ECRAN}\n}\n`,
      },
      {
        chemin: 'src/server/console/aide.ts',
        source: `export class C {\n  async lever() {\n    'use server';\n${GARDE_ACTION}\n  }\n}\n`,
      },
    ],
  },
  {
    quoi: 'une route en exports ES qui importe la porte du module des rôles et l’appelle',
    fichiers: [
      ROUTE(
        "import { requireRole } from '../../../../server/roles/require-role';\n" +
          `export async function GET() {\n${GARDE_ECRAN}\n}`
      ),
    ],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const fautes = jugerLaConsole(t.fichiers, MATRICE_TEMOIN, ROLES_TEMOIN).fautes;
    const rougit = fautes.some((f) => f.famille === t.famille);
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
  const j = jugerLaConsole(fichiers, MATRICE_DES_ROLES, ROLES_CONSOLE);
  return rendreLeVerdict(j, Object.keys(MATRICE_DES_ROLES).length, ROLES_CONSOLE.length);
}

/** Importé par sa spécification autant que lancé en script : l'import ne doit rien lire ni sortir. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]roles(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
