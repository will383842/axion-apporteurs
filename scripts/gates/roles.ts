/**
 * roles.ts — la garde AST des rôles de la console (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 * Registre : `securite:roles`, alias `G-SEC-ROLES` et `GATE-UX-ROLES`. La commande porte l'identifiant du registre,
 * et le verdict l'imprime en le lisant (`ID_REGISTRE`, partners/ADR-0018 : un nom, une garde).
 *
 * USAGE : pnpm securite:roles       juge la console du dépôt ; sort 1 sur faute, en la nommant
 *         pnpm securite:roles:prove un témoin par famille et par forme d'export, des contre-témoins verts
 *
 * CE QU'ELLE TIENT. La liste des actions et des routes de la console est DÉRIVÉE DU DISQUE, jamais
 * déclarée : tout fichier suivi sous `src/app/(console)/` et `src/server/console/`. Chacune est
 * confrontée à LA matrice (`src/server/roles/matrice.ts`) :
 *   — une ACTION est TOUTE valeur exportée d'un module `'use server'`, sous toute forme
 *     (déclaration, `export { f }` avec ou sans alias, `export const` quel que soit l'initialiseur,
 *     `export default`, `export *`, réexport), ou toute fonction qui porte elle-même la directive.
 *     Elle appelle `requireRole('action:<nom>', …)` ;
 *   — une PAGE (`page.tsx`) appelle `requireRole('ecran:<nom>', …)` dans sa fonction exportée par
 *     défaut ; une ROUTE (`route.ts`) l'appelle dans chacune de ses méthodes HTTP exportées, sous
 *     toute forme, alias compris ;
 *   — le droit est un LITTÉRAL, présent dans la matrice. Un droit absent de la matrice fait rougir
 *     la garde en NOMMANT l'action : c'est le défaut = refus appliqué au disque, avant qu'il le soit
 *     à l'exécution.
 * ÉCHEC FERMÉ. Un site dont le CORPS ne s'établit pas dans le fichier — ni une fonction, ni le nom
 * d'une fonction locale : un appel d'enveloppe, un import, un réexport, une constante, une page sans
 * export par défaut reconnu — est une faute nommée, jamais un silence, et jamais jugé sur le
 * fichier entier.
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
 * une action qui appelle `requireRole` puis ignore le refus lui échappe — c'est la relecture qui la
 * tient, et `requireRole` rend un verdict qu'on ne peut pas lire comme un succès sans son `ok`. Elle
 * ne suit pas un appel délégué à une fonction voisine : l'appel doit être DANS l'action (RM-07 —
 * une garde extraite se perd avec son appelant). Hors de `src/app/(console)/` et de
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
  /^src\/app\/\(console\)\/.+\.tsx?$/,
  /^src\/server\/console\/.+\.tsx?$/,
];
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

/**
 * TOUTES les valeurs exportées d'un module, quelle que soit leur forme. Un type ne s'exporte pas
 * comme valeur : il est écarté. Tout le reste est rendu, avec sa fonction quand elle s'établit
 * dans le fichier, `null` sinon.
 */
function exportsDuModule(source: ts.SourceFile): Export[] {
  // Les valeurs locales de premier niveau : la déclaration de fonction, ou l'initialiseur.
  const locales = new Map<string, ts.Node | undefined>();
  const types = new Set<string>();
  for (const i of source.statements) {
    if (ts.isFunctionDeclaration(i) && i.name && i.body) locales.set(i.name.text, i);
    else if (ts.isVariableStatement(i)) {
      for (const d of i.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) locales.set(d.name.text, d.initializer);
      }
    } else if ((ts.isTypeAliasDeclaration(i) || ts.isInterfaceDeclaration(i)) && i.name) {
      types.add(i.name.text);
    }
  }
  /** La fonction que désigne un nom local, en suivant `const a = b` ; `null` si elle ne s'établit pas. */
  const resoudre = (nom: string, vus = new Set<string>()): Fonction | null => {
    if (vus.has(nom)) return null;
    vus.add(nom);
    const v = locales.get(nom);
    if (estFonction(v)) return v;
    if (v !== undefined && ts.isIdentifier(v)) return resoudre(v.text, vus);
    return null;
  };
  const valeur = (e: ts.Expression): Fonction | null =>
    estFonction(e) ? e : ts.isIdentifier(e) ? resoudre(e.text) : null;
  const NON_LOCALE = 'la valeur n’est ni une fonction ni le nom d’une fonction locale';

  const vues: Export[] = [];
  for (const i of source.statements) {
    if (ts.isFunctionDeclaration(i) && exporte(i)) {
      if (!i.body) continue; // une signature de surcharge : l'implémentation suit
      const defaut = parDefaut(i);
      const nom = defaut ? 'default' : (i.name?.text ?? 'default');
      vues.push({ nom, libelle: i.name?.text ?? 'default', fn: i, forme: '' });
    } else if (ts.isVariableStatement(i) && exporte(i)) {
      for (const d of i.declarationList.declarations) {
        const nom = ts.isIdentifier(d.name) ? d.name.text : d.name.getText(source);
        const fn = ts.isIdentifier(d.name) && d.initializer ? valeur(d.initializer) : null;
        vues.push({
          nom,
          libelle: nom,
          fn,
          forme: ts.isIdentifier(d.name)
            ? `constante exportée dont ${NON_LOCALE}`
            : 'déstructuration exportée',
        });
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
    } else if (ts.isExportAssignment(i)) {
      const e = i.expression;
      const libelle = ts.isIdentifier(e) ? e.text : 'default';
      vues.push({
        nom: i.isExportEquals ? 'export =' : 'default',
        libelle,
        fn: i.isExportEquals ? null : valeur(e),
        forme: i.isExportEquals ? '`export =`' : `export par défaut dont ${NON_LOCALE}`,
      });
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
          if (types.has(local) && !locales.has(local)) continue; // un type, pas une valeur
          vues.push({
            nom,
            libelle: nom,
            fn: resoudre(local),
            forme: `\`export { ${local}${local === nom ? '' : ` as ${nom}`} }\` dont ${NON_LOCALE}`,
          });
        }
      }
    }
  }
  return vues;
}

/** Les fonctions qui portent ELLES-MÊMES la directive `'use server'`, où qu'elles soient. */
function actionsEnLigne(source: ts.SourceFile): Site[] {
  const vues: Site[] = [];
  const visiter = (n: ts.Node): void => {
    if (estFonction(n) && n.body && ts.isBlock(n.body)) {
      if (directives(n.body.statements).includes('use server')) {
        const parent = n.parent;
        const nom =
          ts.isFunctionDeclaration(n) && n.name
            ? n.name.text
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
  if (/^page\.tsx?$/.test(base)) {
    const page = exports.find((e) => e.nom === 'default');
    sites.push(
      page
        ? site(page, 'ecran')
        : { nom: 'default', genre: 'ecran', corps: null, forme: 'aucun export par défaut' }
    );
  }
  if (/^route\.tsx?$/.test(base)) {
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
