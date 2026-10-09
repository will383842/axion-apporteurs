/**
 * jur-aucune-progression.ts — aucun composant de l'espace nommé ni typé comme une PROGRESSION vers
 * un seuil (JUR-T26, REQ-JUR-035). Registre : `jur:aucune-progression`.
 *
 * USAGE : pnpm jur:aucune-progression          juge l'espace du dépôt ; sort 1 sur faute
 *         pnpm jur:aucune-progression:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. « Encore 2 pour atteindre… », une barre vers le palier suivant, un « reste à faire » :
 * c'est un objectif chiffré (premier des douze motifs de la charte relationnelle). Le palier est un
 * seuil de vérification prioritaire, jamais un objectif (REQ-JUR-032) ; l'espace n'affiche jamais ce
 * qui manque pour l'étape suivante. La garde le tient dans le CODE, avant tout écran : un composant
 * qu'on appelle `ProgressToNextTier` finit par afficher une progression.
 *
 * CE QU'ELLE LIT (arbre syntaxique TypeScript), dans le périmètre de l'espace partagé avec
 * `jur:aucun-agregat-reseau` : chaque IDENTIFIANT du fichier — composant, fonction, variable, type,
 * propriété, balise —, découpé en segments ; et les éléments JSX `<progress>`, `<meter>` et tout
 * attribut `role="progressbar"`.
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `nom_de_progression`      un identifiant qui contient l'un des noms de `NOMS_DE_PROGRESSION`
 *   `element_de_progression`  un élément ou un rôle ARIA de progression
 *   `source_illisible`        un fichier que TypeScript ne lit pas sans diagnostic
 *
 * LA LISTE DES NOMS. Les six de REQ-JUR-035 — `progress`, `remaining`, `toGoal`, `nextTier`,
 * `objectif`, `restant` —, que `tests/unit/juridique/charte-relationnelle.spec.ts` relit au registre
 * et exige couverts, plus leurs formes voisines (`progression`, `goal`, les accords de `restant`) et
 * les deux tournures françaises du même motif (`reste à faire`, `prochain palier`, `palier suivant`).
 * Un nom est une SUITE de segments : `nextTier` rougit, `tier` seul non.
 *
 * LIMITES DÉCLARÉES. Elle lit des noms et des balises : une progression dessinée sous des noms neutres
 * (`<div style={{ width: '40%' }}>` nommé `Bandeau`) lui échappe — la gate lexicale et la revue du
 * juriste (`jur:revue-apporteur-facing`) tiennent le texte et l'écran.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesNoms` est pure, les fichiers sont INJECTÉS.
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';
import { estDeLEspace, lireSource, segments, type FichierVu } from './jur-aucun-agregat-reseau';

export const ID_REGISTRE = 'jur:aucune-progression';

export const FAMILLES = [
  'nom_de_progression',
  'element_de_progression',
  'source_illisible',
] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

/** Les noms de progression, chacun une SUITE de segments (voir l'en-tête). */
export const NOMS_DE_PROGRESSION: readonly (readonly string[])[] = [
  ['progress'],
  ['progression'],
  ['progressbar'],
  ['remaining'],
  ['to', 'goal'],
  ['goal'],
  ['goals'],
  ['next', 'tier'],
  ['objectif'],
  ['objectifs'],
  ['restant'],
  ['restante'],
  ['restants'],
  ['restantes'],
  ['reste', 'a', 'faire'],
  ['prochain', 'palier'],
  ['palier', 'suivant'],
];
/** Les éléments HTML d'une jauge. */
const ELEMENTS: ReadonlySet<string> = new Set(['progress', 'meter']);

/** Le nom de progression contenu dans ces segments, ou `null`. */
export function progressionDuNom(nom: string): string | null {
  const s = segments(nom);
  for (const suite of NOMS_DE_PROGRESSION) {
    for (let i = 0; i + suite.length <= s.length; i += 1) {
      if (suite.every((x, k) => s[i + k] === x)) return suite.join(' ');
    }
  }
  return null;
}

/** Une balise HTML (`<progress>`) est jugée comme ÉLÉMENT, pas une seconde fois comme nom. */
function estBaliseIntrinseque(n: ts.Node): boolean {
  const p = n.parent;
  return (
    p !== undefined &&
    (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
    p.tagName === n &&
    /^[a-z]/.test(n.getText())
  );
}

export interface Jugement {
  fautes: Faute[];
  fichiers: number;
  noms: number;
}

/** Le jugement de l'espace : pur, les fichiers sont injectés. */
export function jugerLesNoms(fichiers: readonly FichierVu[]): Jugement {
  const j: Jugement = { fautes: [], fichiers: 0, noms: 0 };
  for (const f of fichiers) {
    if (!estDeLEspace(f.chemin)) continue;
    j.fichiers += 1;
    const lu = lireSource(f);
    if (!('statements' in lu)) {
      j.fautes.push({ famille: 'source_illisible', message: lu.message });
      continue;
    }
    const ligne = (n: ts.Node) => lu.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const dejaVus = new Set<string>();
    const visiter = (n: ts.Node): void => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const balise = n.tagName.getText(lu);
        if (ELEMENTS.has(balise)) {
          j.fautes.push({
            famille: 'element_de_progression',
            message: `${f.chemin}:${ligne(n)} — l'élément <${balise}> dessine une jauge vers un seuil (REQ-JUR-035).`,
          });
        }
      }
      if (
        ts.isJsxAttribute(n) &&
        n.name.getText(lu) === 'role' &&
        n.initializer !== undefined &&
        ts.isStringLiteral(n.initializer) &&
        n.initializer.text === 'progressbar'
      ) {
        j.fautes.push({
          famille: 'element_de_progression',
          message: `${f.chemin}:${ligne(n)} — role="progressbar" : une jauge vers un seuil (REQ-JUR-035).`,
        });
      }
      if ((ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) && !estBaliseIntrinseque(n)) {
        j.noms += 1;
        const nom = n.text;
        const progression = progressionDuNom(nom);
        // Un même identifiant répété dans un fichier ne fait qu'une faute : c'est un seul nom.
        if (progression !== null && !dejaVus.has(nom)) {
          dejaVus.add(nom);
          j.fautes.push({
            famille: 'nom_de_progression',
            message:
              `${f.chemin}:${ligne(n)} — « ${nom} » nomme une progression (${progression}) : ` +
              `l'espace n'affiche jamais ce qui manque pour l'étape suivante (REQ-JUR-035, REQ-JUR-032).`,
          });
        }
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
    famille: 'nom_de_progression',
    quoi: 'la fixtureRouge du registre : un composant témoin ProgressToNextTier',
    fichiers: [ESPACE('export function ProgressToNextTier() { return null; }')],
  },
  {
    famille: 'nom_de_progression',
    quoi: 'un « reste à faire » en variable',
    fichiers: [ESPACE('export const resteAFaire = 2;')],
  },
  {
    famille: 'element_de_progression',
    quoi: 'une balise <progress>',
    fichiers: [ESPACE('export function B() { return <progress value={2} max={5} />; }')],
  },
  {
    famille: 'element_de_progression',
    quoi: 'un role="progressbar"',
    fichiers: [ESPACE('export function B() { return <div role="progressbar" />; }')],
  },
  {
    famille: 'source_illisible',
    quoi: 'un fichier tronqué',
    fichiers: [ESPACE('export function B( {')],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'des noms voisins : affichage progressif, restaurer, palier seul',
    fichiers: [
      ESPACE(
        'export const affichageProgressif = 1; export function restaurer() {} export const palier = 5;'
      ),
    ],
  },
  {
    quoi: 'une jauge dans la console, hors de l’espace',
    fichiers: [
      {
        chemin: 'src/app/(console)/console/pilotage/page.tsx',
        source: 'export function ProgressToNextTier() { return <progress />; }',
      },
    ],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = jugerLesNoms(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesNoms(c.fichiers).fautes;
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
  const j = jugerLesNoms(
    chemins.map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
  );
  const compte = `${j.fichiers} fichier(s) de l’espace lu(s), ${j.noms} nom(s) confronté(s) à ${NOMS_DE_PROGRESSION.length} noms de progression`;
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
      `✅ ${ID_REGISTRE} — ${compte} : aucun nom ni élément de progression.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-aucune-progression(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
