/**
 * roles.ts — la garde AST des rôles de la console (SEC-17, REQ-SEC-023 ; REQ-UX-024 absorbée).
 * Registre : `G-SEC-ROLES`, alias `GATE-UX-ROLES`. La commande porte l'identifiant du registre,
 * et le verdict l'imprime en le lisant (`ID_REGISTRE`, partners/ADR-0018 : un nom, une garde).
 *
 * USAGE : pnpm G-SEC-ROLES          juge la console du dépôt ; sort 1 sur faute, en la nommant
 *         pnpm G-SEC-ROLES:prove    un témoin par famille, et des contre-témoins verts
 *
 * CE QU'ELLE TIENT. La liste des actions et des routes de la console est DÉRIVÉE DU DISQUE, jamais
 * déclarée : tout fichier suivi sous `src/app/(console)/` et `src/server/console/`. Chacune est
 * confrontée à LA matrice (`src/server/roles/matrice.ts`) :
 *   — une ACTION est une fonction exportée d'un module `'use server'`, ou toute fonction qui porte
 *     elle-même la directive. Elle appelle `requireRole('action:<nom>', …)` ;
 *   — une PAGE (`page.tsx`) appelle `requireRole('ecran:<nom>', …)` dans sa fonction exportée par
 *     défaut ; une ROUTE (`route.ts`) l'appelle dans chacune de ses méthodes HTTP exportées ;
 *   — le droit est un LITTÉRAL, présent dans la matrice. Un droit absent de la matrice fait rougir
 *     la garde en NOMMANT l'action : c'est le défaut = refus appliqué au disque, avant qu'il le soit
 *     à l'exécution.
 * Le vert imprime le compte des fichiers lus, des actions et des routes confrontées, et des couples
 * écran-rôle et action-rôle réellement confrontés à la matrice.
 *
 * SIX FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `action_sans_requireRole`  une action de console qui n'appelle pas `requireRole`
 *   `route_sans_requireRole`   une page ou une méthode de route qui ne l'appelle pas
 *   `droit_non_litteral`       un droit qui n'est pas une chaîne littérale : il ne se confronte pas
 *   `droit_de_mauvais_genre`   une action qui invoque un droit `ecran:`, une page un droit `action:`
 *   `droit_hors_matrice`       un droit absent de la matrice — l'action ou la route est nommée
 *   `source_illisible`         un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle voit la PRÉSENCE de l'appel et son droit, pas que le verdict est honoré :
 * une action qui appelle `requireRole` puis ignore le refus lui échappe — c'est la relecture qui la
 * tient, et `requireRole` rend un verdict qu'on ne peut pas lire comme un succès sans son `ok`. Elle
 * ne suit pas un appel délégué à une fonction voisine : l'appel doit être DANS l'action (RM-07 —
 * une garde extraite se perd avec son appelant). Hors de `src/app/(console)/` et de
 * `src/server/console/`, elle ne juge rien.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLaConsole` est pure : fichiers, matrice et rôles sont
 * INJECTÉS, sans défaut. `--prove` ne lit rien du dépôt.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { MATRICE_DES_ROLES, ROLES_CONSOLE } from '../../src/server/roles/matrice';

/** L'identifiant du registre : c'est aussi la commande, et le nom que le verdict imprime. */
export const ID_REGISTRE = 'G-SEC-ROLES';

export const FAMILLES = [
  'action_sans_requireRole',
  'route_sans_requireRole',
  'droit_non_litteral',
  'droit_de_mauvais_genre',
  'droit_hors_matrice',
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
  /** Les couples droit-rôle réellement confrontés à la matrice. */
  couples: number;
}

/** Le périmètre : la console de l'application et ses modules de serveur. */
export const PERIMETRE: readonly RegExp[] = [
  /^src\/app\/\(console\)\/.+\.tsx?$/,
  /^src\/server\/console\/.+\.tsx?$/,
];
const METHODES_HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const NOM_DE_LA_PORTE = 'requireRole';

type Genre = 'action' | 'ecran' | 'route';
interface Site {
  nom: string;
  genre: Genre;
  corps: ts.Node;
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

const exporte = (n: ts.Node): boolean =>
  (ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : []).some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  );
const parDefaut = (n: ts.Node): boolean =>
  (ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : []).some(
    (m) => m.kind === ts.SyntaxKind.DefaultKeyword
  );

type Fonction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
const estFonction = (n: ts.Node | undefined): n is Fonction =>
  n !== undefined &&
  (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n));

/** Les fonctions EXPORTÉES d'un module, avec leur nom : déclarations et constantes fléchées. */
function fonctionsExportees(
  source: ts.SourceFile
): { nom: string; fn: Fonction; defaut: boolean }[] {
  const vues: { nom: string; fn: Fonction; defaut: boolean }[] = [];
  const locales = new Map<string, Fonction>();
  for (const i of source.statements) {
    if (ts.isFunctionDeclaration(i) && i.name) locales.set(i.name.text, i);
  }
  for (const i of source.statements) {
    if (ts.isFunctionDeclaration(i) && exporte(i)) {
      vues.push({ nom: i.name?.text ?? 'default', fn: i, defaut: parDefaut(i) });
    } else if (ts.isVariableStatement(i) && exporte(i)) {
      for (const d of i.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && estFonction(d.initializer)) {
          vues.push({ nom: d.name.text, fn: d.initializer, defaut: false });
        }
      }
    } else if (ts.isExportAssignment(i) && !i.isExportEquals) {
      const e = i.expression;
      const fn = estFonction(e) ? e : ts.isIdentifier(e) ? locales.get(e.text) : undefined;
      if (fn) vues.push({ nom: ts.isIdentifier(e) ? e.text : 'default', fn, defaut: true });
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
        vues.push({ nom, genre: 'action', corps: n });
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
  const exportees = fonctionsExportees(source);
  const sites: Site[] = [];
  if (directives(source.statements).includes('use server')) {
    for (const e of exportees) sites.push({ nom: e.nom, genre: 'action', corps: e.fn });
  }
  if (/^page\.tsx?$/.test(base)) {
    const page = exportees.find((e) => e.defaut);
    sites.push({ nom: page?.nom ?? 'default', genre: 'ecran', corps: page?.fn ?? source });
  }
  if (/^route\.tsx?$/.test(base)) {
    for (const e of exportees.filter((x) => METHODES_HTTP.has(x.nom))) {
      sites.push({ nom: e.nom, genre: 'route', corps: e.fn });
    }
  }
  const dejaVus = new Set(sites.map((s) => s.corps));
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

/** Le jugement de la console : pur, tout est injecté. */
export function jugerLaConsole(
  fichiers: readonly FichierDeConsole[],
  matrice: Matrice,
  roles: readonly string[]
): Jugement {
  const j: Jugement = { fautes: [], fichiers: 0, actions: 0, routes: 0, couples: 0 };
  const faute = (famille: Famille, message: string) => j.fautes.push({ famille, message });
  for (const f of fichiers) {
    if (!estDansLePerimetre(f.chemin)) continue;
    j.fichiers += 1;
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
      const ou = `${f.chemin} — ${site.genre === 'action' ? 'action' : site.genre === 'ecran' ? 'page' : 'méthode'} « ${site.nom} »`;
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
      // Le droit est déclaré : chaque rôle est confronté à sa ligne de la matrice.
      j.couples += roles.length;
    }
  }
  return j;
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
const PAGE = (corps: string): FichierDeConsole => ({
  chemin: 'src/app/(console)/console/tableau/page.tsx',
  source: `export default async function Page() {\n${corps}\n  return null;\n}\n`,
});

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierDeConsole[] }[] = [
  {
    famille: 'action_sans_requireRole',
    quoi: 'la fixtureRouge du registre : une Server Action sans requireRole',
    fichiers: [ACTION('  return 1;')],
  },
  { famille: 'route_sans_requireRole', quoi: 'une page sans requireRole', fichiers: [PAGE('')] },
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
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    fichiers: [ACTION('  await requireRole(')],
  },
];

const CONTRE_TEMOINS: { quoi: string; fichiers: FichierDeConsole[] }[] = [
  {
    quoi: 'une action et une page qui invoquent un droit déclaré',
    fichiers: [
      ACTION("  await requireRole('action:lever_gel', j, p);"),
      PAGE("  await requireRole('ecran:tableau', j, p);"),
    ],
  },
  {
    quoi: 'un module de console sans « use server » (une aide, pas une action)',
    fichiers: [{ chemin: 'src/server/console/aide.ts', source: 'export async function a() {}\n' }],
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
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
          `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

// ── le dépôt ─────────────────────────────────────────────────────────────────────────────────────

function juger(): { code: 0 | 1; lignes: string[] } {
  const chemins = fichiersSuivisOuRefus(ID_REGISTRE).filter(estDansLePerimetre);
  const fichiers = chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }));
  const j = jugerLaConsole(fichiers, MATRICE_DES_ROLES, ROLES_CONSOLE);
  const droits = Object.keys(MATRICE_DES_ROLES).length;
  const compte =
    `${j.fichiers} fichier(s) de console lu(s), ${j.actions} action(s) et ${j.routes} route(s) ` +
    `confrontée(s) à la matrice (${droits} droit(s) × ${ROLES_CONSOLE.length} rôles), ` +
    `${j.couples} couple(s) écran-rôle confronté(s)`;
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
  if (j.actions + j.routes === 0) {
    lignes.push(
      '   Périmètre vide, et c’est dit : la console n’a encore ni écran ni action de serveur ' +
        '(src/app/(console)/ et src/server/console/ ne portent aucun fichier suivi). La tâche ' +
        'UX-P1-12 ouvre le premier écran ; que la garde MESURE se prouve par ' +
        `« pnpm ${ID_REGISTRE}:prove », pas par ce zéro.`
    );
  }
  return { code: 0, lignes };
}

/** Importé par sa spécification autant que lancé en script : l'import ne doit rien lire ni sortir. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]roles(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
