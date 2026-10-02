/**
 * csp-inline.ts — aucun style en ligne ni HTML injecté sous `src/app/` (SEC-46, écart C13 de la
 * vérification de bout en bout). Registre : `csp:inline`.
 *
 * USAGE : pnpm csp:inline          juge `src/app/` ; sort 1 sur faute
 *         pnpm csp:inline:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. La politique de contenu (`src/server/securite/entetes.ts`) n'admet `style-src` que de
 * la même origine ou sous nonce, sans `'unsafe-inline'`. Un attribut `style={…}` rendu par React est
 * un style EN LIGNE : le navigateur le refuse, en silence, et l'écran perd ce qu'il portait — la
 * cible de 48 px du bouton de `confidentialite/error.tsx` en était la preuve. `dangerouslySetInnerHTML`
 * injecte du HTML que la politique ne voit pas venir. Les deux se refusent là où ils s'écrivent.
 *
 * CE QU'ELLE LIT (arbre syntaxique TypeScript, jamais une expression régulière sur le texte) : dans
 * tout fichier suivi `.tsx` ou `.jsx` sous `src/app/`, chaque attribut JSX nommé `style` ou
 * `dangerouslySetInnerHTML`, et chaque clé d'objet nommée `dangerouslySetInnerHTML` (des props
 * étalées le portent aussi).
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `style_en_ligne`    un attribut JSX `style` ;
 *   `html_injecte`      `dangerouslySetInnerHTML`, en attribut ou en clé d'objet ;
 *   `source_illisible`  un fichier que TypeScript ne lit pas sans diagnostic — sauté, il serait un
 *                       vert qui ment.
 *
 * LIMITES DÉCLARÉES. Elle ne voit pas un style posé par un objet de props étalé sous une clé
 * `style` (`<div {...p} />`), ni un `createElement` écrit à la main, ni ce qui vit hors de
 * `src/app/`. Le témoin de la politique sur le serveur construit (`tests/e2e/espace/csp.spec.ts`)
 * est ce qui les rattrape au rendu.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesSources` est pure, les fichiers sont INJECTÉS.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

export const ID_REGISTRE = 'csp:inline';

export const FAMILLES = ['style_en_ligne', 'html_injecte', 'source_illisible'] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
export interface FichierVu {
  readonly chemin: string;
  readonly source: string;
}

/** Le périmètre : les composants de `src/app/`, là où le rendu s'écrit. */
export function estJuge(chemin: string): boolean {
  return /^src\/app\/.+\.[jt]sx$/.test(chemin);
}

function lireSource(f: FichierVu): ts.SourceFile | Faute {
  const source = ts.createSourceFile(
    f.chemin,
    f.source,
    ts.ScriptTarget.Latest,
    true,
    f.chemin.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  );
  const diagnostics = Reflect.get(source, 'parseDiagnostics') as readonly unknown[];
  return diagnostics.length === 0
    ? source
    : {
        famille: 'source_illisible',
        message: `${f.chemin} — ${diagnostics.length} diagnostic(s) d'analyse : un fichier qu'on ne lit pas ne se juge pas, et il n'est pas sauté.`,
      };
}

function nomDe(n: ts.Node): string | null {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

export interface Jugement {
  fautes: Faute[];
  fichiers: number;
  attributs: number;
}

/** Le jugement : pur, les fichiers sont injectés. */
export function jugerLesSources(fichiers: readonly FichierVu[]): Jugement {
  const fautes: Faute[] = [];
  let attributs = 0;
  for (const f of fichiers) {
    const lu = lireSource(f);
    if (!('statements' in lu)) {
      fautes.push(lu);
      continue;
    }
    const ou = (n: ts.Node) =>
      `${f.chemin}:${lu.getLineAndCharacterOfPosition(n.getStart(lu)).line + 1}`;
    const visiter = (n: ts.Node): void => {
      if (ts.isJsxAttribute(n)) {
        attributs++;
        const nom = nomDe(n.name);
        if (nom === 'style') {
          fautes.push({
            famille: 'style_en_ligne',
            message: `${ou(n)} — attribut « style » : la politique de contenu refuse un style en ligne, l'écran le perdrait en silence. Une classe d'un module CSS le remplace.`,
          });
        } else if (nom === 'dangerouslySetInnerHTML') {
          fautes.push({
            famille: 'html_injecte',
            message: `${ou(n)} — attribut « dangerouslySetInnerHTML » : du HTML injecté échappe à la politique de contenu.`,
          });
        }
      } else if (
        ts.isPropertyAssignment(n) ||
        ts.isShorthandPropertyAssignment(n) ||
        ts.isMethodDeclaration(n)
      ) {
        if (nomDe(n.name) === 'dangerouslySetInnerHTML') {
          fautes.push({
            famille: 'html_injecte',
            message: `${ou(n)} — clé « dangerouslySetInnerHTML » : des props étalées l'injecteraient.`,
          });
        }
      }
      ts.forEachChild(n, visiter);
    };
    visiter(lu);
  }
  return { fautes, fichiers: fichiers.length, attributs };
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────

const APP = (source: string): FichierVu => ({ chemin: 'src/app/(espace)/bac/page.tsx', source });
const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierVu[] }[] = [
  {
    famille: 'style_en_ligne',
    quoi: 'un bouton dont la cible tient à un style en ligne',
    fichiers: [APP("export const B = () => <button style={{ minHeight: '3rem' }}>ok</button>;")],
  },
  {
    famille: 'style_en_ligne',
    quoi: 'un style en ligne passé par une constante',
    fichiers: [APP('const S = { padding: 4 };\nexport const P = () => <main style={S} />;')],
  },
  {
    famille: 'html_injecte',
    quoi: 'du HTML injecté en attribut',
    fichiers: [APP("export const H = () => <div dangerouslySetInnerHTML={{ __html: '<b/>' }} />;")],
  },
  {
    famille: 'html_injecte',
    quoi: 'du HTML injecté par des props étalées',
    fichiers: [
      APP(
        "const p = { dangerouslySetInnerHTML: { __html: 'x' } };\nexport const H = () => <div {...p} />;"
      ),
    ],
  },
  {
    famille: 'source_illisible',
    quoi: 'un composant tronqué',
    fichiers: [APP('export const C = () => <div>')],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'une classe d’un module CSS, et une variable nommée « style » hors JSX',
    fichiers: [
      APP(
        "import s from './p.module.css';\nconst style = 1;\nexport const B = () => <button className={s.bouton}>{style}</button>;"
      ),
    ],
  },
  {
    quoi: 'un style en ligne HORS de src/app/, que le périmètre ne juge pas',
    fichiers: [],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = jugerLesSources(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesSources(c.fichiers).fautes;
    ok &&= fautes.length === 0;
    lignes.push(`${fautes.length === 0 ? '🟢' : '❌ ROUGIT'} contre-témoin : ${c.quoi}`);
  }
  const hors = estJuge('src/components/bac.tsx') || estJuge('scripts/bac.tsx');
  ok &&= !hors && estJuge('src/app/(espace)/bac/page.tsx');
  lignes.push(`${hors ? '❌' : '🟢'} périmètre : src/app/ seul, en .tsx et .jsx`);
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
  const chemins = fichiersSuivisOuRefus(ID_REGISTRE).filter(estJuge);
  const j = jugerLesSources(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const compte = `${j.fichiers} fichier(s) de src/app/ lu(s), ${j.attributs} attribut(s) JSX confronté(s)`;
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
      `✅ ${ID_REGISTRE} — ${compte} : aucun style en ligne, aucun HTML injecté.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]csp-inline(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
