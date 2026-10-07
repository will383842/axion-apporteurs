/**
 * jur-supports-de-presentation.ts — aucun support de présentation n'est mis à disposition de
 * l'apporteur, et « kit de vente » n'est écrit nulle part (JUR-T30, REQ-JUR-041). Registre :
 * `jur:supports-de-presentation`.
 *
 * USAGE : pnpm jur:supports-de-presentation          juge les fichiers suivis ; sort 1 sur faute
 *         pnpm jur:supports-de-presentation:prove    un témoin par famille, des contre-témoins verts
 *
 * POURQUOI. Aucun droit d'usage du nom, du logo ou de la charte n'est concédé à l'apporteur (l'ancien
 * art. 22 le faisait). Autoriser à PRÉSENTER l'offre est précisément ce qui caractérise la négociation
 * (CJUE C-828/18 ; Cass. com. 2 déc. 2020), et le port du nom crée un mandat apparent (art. 1156
 * C. civ.). L'outil n'en distribue donc aucun : ni logo, ni charte, ni gabarit de signature, ni visuel,
 * ni carte ; les documents sont servis en PDF non modifiable, transmissibles en l'état. Et le contrat
 * ne peut pas nommer « vente » ce que l'art. 1.2 dit n'être pas une vente : l'expression « kit de
 * vente » est bannie, au profit de « documents de présentation » (glossaire).
 *
 * CE QU'ELLE LIT : la liste des fichiers suivis (`git ls-files`), et le TEXTE des fichiers textuels.
 *
 * TROIS FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `kit_de_vente`             l'expression (« kit de vente », « kit-de-vente », `kitDeVente`), dans
 *                              tout fichier textuel suivi, hors des EXEMPTIONS nommées : les textes
 *                              qui CITENT l'interdiction (SSOT du lexique, registres, gardes, témoins)
 *   `support_de_presentation`  dans ce qui est SERVI à l'apporteur (public/, l'espace, ses
 *                              composants, ses ressources), un fichier d'image ou de graphisme, ou
 *                              dont le nom désigne un logo, une charte, une signature, un visuel, une
 *                              carte ou un kit
 *   `document_modifiable`      dans ce même périmètre, un document qui n'est pas un PDF (traitement
 *                              de texte, présentation, tableur)
 *
 * LIMITES DÉCLARÉES. Elle lit des chemins et des textes : un logo servi par une adresse externe, ou
 * un visuel inséré en base, lui échappe ; la relecture et la règle de publication les tiennent.
 *
 * INVARIANT DE LA PREUVE (RM-11). `jugerLesSupports` est pure, les fichiers sont INJECTÉS.
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

export const ID_REGISTRE = 'jur:supports-de-presentation';

export const FAMILLES = ['kit_de_vente', 'support_de_presentation', 'document_modifiable'] as const;
export type Famille = (typeof FAMILLES)[number];
export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}
/** Un fichier suivi : son chemin, et son texte s'il est textuel (`null` sinon). */
export interface FichierVu {
  readonly chemin: string;
  readonly texte: string | null;
}

/**
 * LES EXEMPTIONS NOMMÉES de `kit_de_vente` : les textes qui CITENT l'interdiction pour la tenir. Une
 * exemption neuve n'entre que par décision, avec sa raison.
 */
export const EXEMPTIONS_KIT_DE_VENTE: Readonly<Record<string, string>> = {
  'src/domain/lexique/lexique-interdit.ts': 'la SSOT du lexique, qui porte la liste noire',
  'docs/gates.json': 'le registre des gardes, qui décrit ce que chacune refuse',
  'docs/tasks.json': 'le registre des tâches, dont l’acceptance de JUR-T30',
  'docs/requirements.json': 'le registre des exigences, dont REQ-JUR-041',
  'scripts/gates/jur-copy-indicative.ts': 'la garde de la copie indicative, et son témoin',
  'scripts/gates/jur-supports-de-presentation.ts': 'cette garde, ses motifs et ses témoins',
  'tests/unit/contrat/contract-template-complete.spec.ts': 'le témoin du gabarit de contrat',
  'tests/unit/juridique/gardes-article-2-7.spec.ts': 'le témoin de cette garde',
};

/** L'expression, sous ses formes écrites. */
const KIT_DE_VENTE = /kit[\s_-]*de[\s_-]*vente|kitDeVente/i;

/** Ce qui est SERVI à l'apporteur. */
const PERIMETRE_SERVI: readonly RegExp[] = [
  /^public\//,
  /^src\/app\/\(espace\)\//,
  /^src\/components\/espace\//,
  /^src\/content\/ressources\//,
  /^ressources\//,
];
export const estServi = (chemin: string): boolean => PERIMETRE_SERVI.some((r) => r.test(chemin));

/** Les fichiers d'image ou de graphisme. */
const GRAPHISME = /\.(png|svg|jpe?g|gif|webp|ico|bmp|tiff?|ai|psd|eps|indd|sketch|fig)$/i;
/** Les noms qui désignent un support de présentation. */
const NOM_DE_SUPPORT =
  /(^|[/._-])(logo|logos|charte|signature|signatures|visuel|visuels|carte[-_]?de[-_]?visite|kit|banniere|bandeau)([/._-]|$)/i;
/** Le code de l'application, jugé par ses gardes propres, jamais par son nom. */
const CODE = /.(tsx?|jsx?|mjs|cjs)$/i;
/** Les documents modifiables. */
const MODIFIABLE = /\.(docx?|dotx?|pptx?|potx?|odt|odp|ods|xlsx?|rtf|pages|key|numbers)$/i;

/** Le juge, PUR : les fichiers sont injectés. */
export function jugerLesSupports(fichiers: readonly FichierVu[]): {
  fautes: Faute[];
  fichiers: number;
} {
  const fautes: Faute[] = [];
  for (const { chemin, texte } of fichiers) {
    if (
      texte !== null &&
      KIT_DE_VENTE.test(texte) &&
      EXEMPTIONS_KIT_DE_VENTE[chemin] === undefined
    ) {
      const ligne = texte.split('\n').findIndex((l) => KIT_DE_VENTE.test(l)) + 1;
      fautes.push({
        famille: 'kit_de_vente',
        message: `${chemin}:${ligne} — « kit de vente » : écrire « documents de présentation » (art. 1.2, glossaire).`,
      });
    }
    if (!estServi(chemin)) continue;
    // Un NOM ne juge qu'un fichier qui n'est pas du code : la page de la signature du contrat est légitime.
    if (GRAPHISME.test(chemin) || (NOM_DE_SUPPORT.test(chemin) && !CODE.test(chemin))) {
      fautes.push({
        famille: 'support_de_presentation',
        message: `${chemin} — un support de présentation servi à l'apporteur (logo, charte, signature, visuel, carte) : aucun droit d'usage n'est concédé.`,
      });
    }
    if (MODIFIABLE.test(chemin)) {
      fautes.push({
        famille: 'document_modifiable',
        message: `${chemin} — un document servi à l'apporteur doit être un PDF non modifiable, transmissible en l'état.`,
      });
    }
  }
  return { fautes, fichiers: fichiers.length };
}

// ── la preuve ────────────────────────────────────────────────────────────────────────────────────

const TEMOINS: { famille: Famille; quoi: string; fichiers: FichierVu[] }[] = [
  {
    famille: 'kit_de_vente',
    quoi: 'la fixtureRouge du registre : une ressource de l’espace qui annonce un kit de vente',
    fichiers: [
      {
        chemin: 'src/content/micro-copy/espace/ressources.ts',
        texte: "export const t = 'Téléchargez votre kit de vente.';",
      },
    ],
  },
  {
    famille: 'kit_de_vente',
    quoi: 'l’expression en identifiant, dans une tâche',
    fichiers: [{ chemin: 'src/server/taches/envoyer.ts', texte: 'export const kitDeVente = 1;' }],
  },
  {
    famille: 'support_de_presentation',
    quoi: 'un logo servi par public/',
    fichiers: [{ chemin: 'public/logo-axion.png', texte: null }],
  },
  {
    famille: 'support_de_presentation',
    quoi: 'un gabarit de signature électronique dans les ressources',
    fichiers: [{ chemin: 'src/content/ressources/signature-email.html', texte: '<p>x</p>' }],
  },
  {
    famille: 'document_modifiable',
    quoi: 'une présentation modifiable dans les ressources de l’espace',
    fichiers: [{ chemin: 'ressources/presentation-offre.pptx', texte: null }],
  },
];
const CONTRE_TEMOINS: { quoi: string; fichiers: FichierVu[] }[] = [
  {
    quoi: 'un document de présentation en PDF dans les ressources',
    fichiers: [{ chemin: 'ressources/documents-de-presentation.pdf', texte: null }],
  },
  {
    quoi: 'une exemption nommée qui CITE l’interdiction',
    fichiers: [
      {
        chemin: 'src/domain/lexique/lexique-interdit.ts',
        texte: "export const L = ['kit de vente'];",
      },
    ],
  },
  {
    quoi: 'la page de la signature du contrat, du code de l’espace',
    fichiers: [
      { chemin: 'src/app/(espace)/mon-contrat/signature/page.tsx', texte: 'export default 1;' },
    ],
  },
  {
    quoi: 'un logo de la console, hors de ce qui est servi à l’apporteur',
    fichiers: [{ chemin: 'src/app/(console)/console/logo.svg', texte: null }],
  },
];

function prouver(): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  let ok = true;
  for (const t of TEMOINS) {
    const rougit = jugerLesSupports(t.fichiers).fautes.some((f) => f.famille === t.famille);
    ok &&= rougit;
    lignes.push(`${rougit ? '🔴' : '❌ RESTE VERT'} [${t.famille}] ${t.quoi}`);
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = jugerLesSupports(c.fichiers).fautes;
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

/** Un fichier textuel : ce que la garde lit en texte. Les autres ne sont jugés que par leur chemin. */
const TEXTUEL = /\.(ts|tsx|js|mjs|cjs|json|md|mdx|html|txt|css|ya?ml|sql|prisma)$/i;

function juger(): { code: 0 | 1; lignes: string[] } {
  const chemins = fichiersSuivisOuRefus(ID_REGISTRE);
  const j = jugerLesSupports(
    chemins.map((chemin) => ({
      chemin,
      texte: TEXTUEL.test(chemin) ? readFileSync(chemin, 'utf8') : null,
    }))
  );
  const compte = `${j.fichiers} fichier(s) suivi(s) lu(s)`;
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
      `✅ ${ID_REGISTRE} — ${compte} : aucun support de présentation servi, aucun document modifiable, ` +
        `aucun « kit de vente » hors des ${Object.keys(EXEMPTIONS_KIT_DE_VENTE).length} exemptions nommées.`,
      `   Que la garde MESURE se prouve par « pnpm ${ID_REGISTRE}:prove ».`,
    ],
  };
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]jur-supports-de-presentation(\.ts)?$/.test(
  process.argv[1] ?? ''
);

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : juger();
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
