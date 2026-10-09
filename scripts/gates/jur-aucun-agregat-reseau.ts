/**
 * jur-aucun-agregat-reseau.ts — aucun agrégat du RÉSEAU dans ce que l'espace sert à un apporteur
 * (JUR-T26, REQ-JUR-034). Registre : `jur:aucun-agregat-reseau`.
 *
 * USAGE : pnpm jur:aucun-agregat-reseau          juge l'espace du dépôt ; sort 1 sur faute
 *         pnpm jur:aucun-agregat-reseau:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. Un apporteur ne voit que SES données. Une moyenne, une médiane, un rang, un percentile,
 * un total du réseau ou une comparaison le situent parmi les autres : c'est un classement qui ne dit
 * pas son nom, et la décision de Will réserve classements et statistiques à la console. Cette garde
 * le tient là où il naît, dans la FORME des données, avant qu'un écran ne l'affiche.
 *
 * CE QU'ELLE LIT (analyse de l'arbre syntaxique TypeScript, jamais une expression régulière sur le
 * texte) : dans tout fichier suivi de l'espace — `src/app/(espace)/`, `src/server/espace/`,
 * `src/components/espace/` —, le NOM de chaque clé d'un type, d'une interface, d'une classe ou d'un
 * objet littéral, découpé en segments (camelCase, snake_case, sans accents). Et les modules que
 * l'espace importe.
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `agregat_reseau`    une clé dont un segment nomme un agrégat (moyenne, médiane, rang,
 *                       percentile, classement, comparaison…) ou qui associe « réseau » à une
 *                       quantité (total, somme, cumul, nombre, part, volume)
 *   `import_console`    un fichier de l'espace qui importe un module de la console (ses
 *                       statistiques, ses tris) : ce que la console calcule n'entre pas dans l'espace
 *   `source_illisible`  un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LIMITES DÉCLARÉES. Elle lit des NOMS : une valeur agrégée rangée sous une clé neutre (`valeur`,
 * `x`) lui échappe, comme une clé calculée ou une réponse d'API non typée. Ce qui tient la production
 * face à elles est la relecture et la règle d'accès : l'espace ne lit la base que par
 * `forApporteur()` (RM-05). Elle ne juge ni la console, ni les scripts.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesDto` est pure, les fichiers sont INJECTÉS.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';

export const ID_REGISTRE = 'jur:aucun-agregat-reseau';

export const FAMILLES = ['agregat_reseau', 'import_console', 'source_illisible'] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
export interface FichierVu {
  readonly chemin: string;
  readonly source: string;
}

/**
 * L'ESPACE, tel que le code le sert : ses pages et actions, ses modules de serveur, ses composants.
 * Partagé avec `jur:aucune-progression`, qui juge le même périmètre.
 */
export const PERIMETRE_ESPACE: readonly RegExp[] = [
  /^src\/app\/\(espace\)\/.+\.tsx?$/,
  /^src\/server\/espace\/.+\.tsx?$/,
  /^src\/components\/espace\/.+\.tsx?$/,
];
export const estDeLEspace = (chemin: string): boolean =>
  PERIMETRE_ESPACE.some((r) => r.test(chemin));

/** Les segments d'un nom : camelCase, PascalCase, snake_case et kebab-case, en minuscules, sans accent. */
export function segments(nom: string): string[] {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((s) => s !== '')
    .map((s) => s.toLowerCase());
}

/** Un segment qui, seul, nomme un agrégat ou une position parmi les autres. */
const AGREGATS: ReadonlySet<string> = new Set([
  'moyenne',
  'moyennes',
  'mediane',
  'medianes',
  'median',
  'average',
  'mean',
  'rang',
  'rangs',
  'rank',
  'ranking',
  'classement',
  'percentile',
  'centile',
  'quartile',
  'decile',
  'comparaison',
  'comparatif',
  'podium',
]);
/** « Réseau » n'est un agrégat qu'associé à une quantité : la « lettre du réseau » est un texte. */
const QUANTITES: ReadonlySet<string> = new Set([
  'total',
  'somme',
  'cumul',
  'nombre',
  'part',
  'volume',
]);

/** Le motif d'agrégat d'un nom, ou `null` s'il n'en porte pas. */
export function agregatDuNom(nom: string): string | null {
  const s = segments(nom);
  const seul = s.find((x) => AGREGATS.has(x));
  if (seul !== undefined) return seul;
  if (s.includes('reseau')) {
    const q = s.find((x) => QUANTITES.has(x));
    if (q !== undefined) return `${q} du réseau`;
  }
  return null;
}

/** Un module de la console, vu depuis un import de l'espace. */
const MODULE_DE_CONSOLE = /(^|\/)(\(console\)|console)(\/|$)/;

/** Le nom lisible d'une clé : identifiant, chaîne ou nombre ; `null` pour une clé calculée. */
function nomDeCle(nom: ts.PropertyName | undefined): string | null {
  if (nom === undefined) return null;
  if (ts.isIdentifier(nom) || ts.isPrivateIdentifier(nom)) return nom.text;
  if (ts.isStringLiteral(nom) || ts.isNoSubstitutionTemplateLiteral(nom)) return nom.text;
  return null;
}

export function lireSource(f: FichierVu): ts.SourceFile | Faute {
  const genre = f.chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(f.chemin, f.source, ts.ScriptTarget.Latest, true, genre);
  const diagnostics = Reflect.get(source, 'parseDiagnostics') as readonly unknown[];
  return diagnostics.length === 0
    ? source
    : {
        famille: 'source_illisible',
        message: `${f.chemin} — ${diagnostics.length} diagnostic(s) d'analyse : un fichier qu'on ne lit pas ne se juge pas, et il n'est pas sauté.`,
      };
}

export interface Jugement {
  fautes: Faute[];
  fichiers: number;
  cles: number;
}

/** Le jugement de l'espace : pur, les fichiers sont injectés. */
export function jugerLesDto(fichiers: readonly FichierVu[]): Jugement {
  const j: Jugement = { fautes: [], fichiers: 0, cles: 0 };
  for (const f of fichiers) {
    if (!estDeLEspace(f.chemin)) continue;
    j.fichiers += 1;
    const lu = lireSource(f);
    if (!('statements' in lu)) {
      j.fautes.push(lu);
      continue;
    }
    const visiter = (n: ts.Node): void => {
      if (
        ts.isPropertySignature(n) ||
        ts.isPropertyDeclaration(n) ||
        ts.isPropertyAssignment(n) ||
        ts.isShorthandPropertyAssignment(n)
      ) {
        const nom = nomDeCle(n.name);
        if (nom !== null) {
          j.cles += 1;
          const agregat = agregatDuNom(nom);
          if (agregat !== null) {
            const ligne = lu.getLineAndCharacterOfPosition(n.getStart()).line + 1;
            j.fautes.push({
              famille: 'agregat_reseau',
              message:
                `${f.chemin}:${ligne} — la clé « ${nom} » porte un agrégat (${agregat}) : un ` +
                `apporteur ne voit que SES données ; moyennes, rangs et comparaisons restent à la ` +
                `console (REQ-JUR-034).`,
            });
          }
        }
      }
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier !== undefined &&
        ts.isStringLiteral(n.moduleSpecifier) &&
        MODULE_DE_CONSOLE.test(n.moduleSpecifier.text)
      ) {
        j.fautes.push({
          famille: 'import_console',
          message:
            `${f.chemin} — importe « ${n.moduleSpecifier.text} », un module de la console : ce ` +
            `que la console calcule (statistiques, tris) n'entre pas dans l'espace (REQ-JUR-034).`,
        });
      }
      ts.forEachChild(n, visiter);
    };
    visiter(lu);
  }
  return j;
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const ESPACE = (source: string): FichierVu => ({
  chemin: 'src/app/(espace)/tableau/page.tsx',
  source,
});

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierVu[] }[] = [
  {
    famille: 'agregat_reseau',
    quoi: 'la fixtureRouge du registre : un DTO témoin portant moyenneReseau',
    fichiers: [ESPACE('export interface Tableau { mesDepots: number; moyenneReseau: number }')],
  },
  {
    famille: 'agregat_reseau',
    quoi: 'un rang posé dans un objet servi par l’espace',
    fichiers: [ESPACE('export const dto = { rang: 3 };')],
  },
  {
    famille: 'import_console',
    quoi: 'une page de l’espace qui importe les statistiques de la console',
    fichiers: [
      ESPACE("import { s } from '../../../server/console/statistiques';\nexport const a = s;"),
    ],
  },
  {
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    fichiers: [ESPACE('export const a = {')],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'ses propres données, la lettre du réseau et une marge haute',
    fichiers: [ESPACE('export const d = { mesDepots: 3, lettreDuReseau: "x", marginTop: 4 };')],
  },
  {
    quoi: 'un rang dans la console, hors de l’espace',
    fichiers: [
      { chemin: 'src/server/console/statistiques.ts', source: 'export const d = { rang: 1 };' },
    ],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = jugerLesDto(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesDto(c.fichiers).fautes;
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
  }
  const orphelines = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  ok &&= orphelines.length === 0;
  for (const f of orphelines) lignes.push(`❌ famille sans témoin : ${f}`);
  lignes.unshift(
    ok
      ? `✅ ${ID_REGISTRE} — ${FAMILLES.length} familles rougissent sur leurs témoins, ` +
          `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
      : `❌ ${ID_REGISTRE} --prove — la preuve échoue :`
  );
  return { code: ok ? 0 : 1, lignes };
}

function juger(): { code: 0 | 1; lignes: string[] } {
  // GOV-160 : sur une PR, seuls les fichiers de la PR sont jugés.
  const chemins = restreindreALaPr(fichiersSuivisOuRefus(ID_REGISTRE).filter(estDeLEspace));
  const j = jugerLesDto(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const compte = `${j.fichiers} fichier(s) de l’espace lu(s), ${j.cles} clé(s) confrontée(s)`;
  if (j.fautes.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${ID_REGISTRE} — ${j.fautes.length} faute(s) ; ${compte} :`,
        ...j.fautes.map((f) => `   [${f.famille}] ${f.message}`),
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ ${ID_REGISTRE} — ${compte} : aucun agrégat du réseau, aucun import de la console.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-aucun-agregat-reseau(\.ts)?$/.test(
  process.argv[1] ?? ''
);

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
