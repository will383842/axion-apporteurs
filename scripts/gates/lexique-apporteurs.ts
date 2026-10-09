/**
 * lexique-apporteurs.ts — la garde du lexique interdit (GOV-013 ; REQ-GOV-017, durcie par
 * REQ-JUR-037). Registre : `GATE-JUR-TEXTES-APPORTEURS`, alias `GATE-UX-JARGON` et `gov:lexique`.
 *
 * USAGE : pnpm gov:lexique           (juge le dépôt réel ; sort 1 sur faute, en la nommant)
 *         pnpm gov:lexique:prove     (un témoin par famille, les positions limites, les contrôles
 *                                     positifs et les contre-témoins verts — sur une FIXTURE)
 *
 * CE QU'ELLE TIENT. REQ-GOV-017 : « le lexique interdit est absent de `prisma/**`, `messages/**`,
 * `src/**\/*.tsx`, des templates email et des ADR de Partners, hors liste d'exceptions justifiées
 * ligne à ligne ». REQ-JUR-037 la durcit sur tout ce qu'un apporteur voit ou reçoit. La liste
 * elle-même n'est PAS ici : elle est IMPORTÉE de `src/domain/lexique/lexique-interdit.ts`, comme
 * `docs/gates.json` l'exige — « jamais recopiée dans la gate ni dans GATES.md » (RM-01). Cette
 * gate n'apporte que la LECTURE du dépôt et la distinction des tournures.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI FAIT TOUT LE TRAVAIL : LA TOURNURE, PAS LE MOT.
 *
 * Ce dépôt existe pour que les trois pouvoirs que la charte relationnelle interdit de réunir ne
 * se rencontrent jamais dans une phrase, et la phrase qui l'en tient s'écrit AVEC les mots
 * interdits, sous forme de négation. Celle-ci est réelle, elle est dans l'ADR « valeurs du monde
 * réel » — écrit dans un lot voisin, pas encore dans ce dépôt :
 *
 *     « Elle est neutre au regard de la […], et c'est ce qui permet de la retenir :
 *       elle n'institue aucun mandat, aucun objectif, aucun quota, aucun compte rendu
 *       d'activité. »
 *
 * Une garde qui rougirait là-dessus obligerait à RETIRER la phrase qui protège : elle produirait
 * exactement le risque qu'elle prétend écarter. Une garde qui pousse à supprimer sa propre raison
 * d'être est une garde ratée. Quatre tournures sont donc exemptées, et une seule est refusée :
 *
 *   REFUSÉ — l'usage PRESCRIPTIF ou ÉVALUATIF : « objectif du mois », « votre quota »,
 *            « classement des apporteurs », « nos commerciaux », « vous devez déposer ».
 *
 *   EXEMPTÉ — (1) DÉNÉGATION : un marqueur de négation ou de prohibition déclaré par la SSOT
 *                 (`aucun`, `ni`, `sans`, `ne`, `n'`, `pas`, `jamais`, `interdit`, `banni`…) situé
 *                 en amont du terme, dans le MÊME segment de phrase et à moins de
 *                 `FENETRE_DENEGATION` caractères. « aucun objectif », « ni quota ni classement »,
 *                 « ne fixe aucun objectif », « ce n'est pas un objectif ».
 *             (2) CITATION, dans les fichiers de PROSE seulement (`.md`) : le terme entre « … »,
 *                 " … " ou accents graves CITE le mot au lieu de s'en servir. L'exemption ne vaut
 *                 pas pour le code ni la micro-copy : là, une chaîne entre guillemets est
 *                 précisément ce que l'apporteur lira — la `fixtureRouge` du registre est un
 *                 « libellé factice `objectif du mois` dans micro-copy ».
 *             (3) PORTEUR : la SSOT, cette gate et son test ont le droit d'écrire les termes.
 *             (4) EXCEPTION DÉCLARÉE, chemin par chemin et forme par forme, justifiée et datée
 *                 dans `EXCEPTIONS_DECLAREES` — « ligne à ligne », dit l'exigence.
 *
 * Les segments de phrase se coupent sur `. ; : ! ? — |` : la barre verticale parce qu'une cellule
 * de tableau Markdown n'est pas la voisine de la suivante, et qu'un « aucun » dans la colonne de
 * gauche n'exempte rien dans celle de droite.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX PIÈGES, MESURÉS SUR CE DÉPÔT, QUE CE FICHIER ÉVITE EXPRÈS.
 *
 *   — LES POSITIONS LIMITES. `gov:identifiants` est aveugle en fin de phrase : sa lookahead
 *     `(?![A-Za-z0-9_.-])` inclut le point, de sorte qu'une étiquette collée à un point final
 *     n'est pas vue, et ses propres témoins évitent tous cette position. La garde reste verte sur
 *     le texte qu'elle condamne. Ici, les bornes de mot ne contiennent QUE des caractères de mot
 *     (lettres accentuées comprises) : ni point, ni virgule, ni parenthèse, ni astérisque, ni
 *     barre. Et `--prove` exerce huit positions — début de ligne, fin de phrase collée au point,
 *     avant une virgule, avant une parenthèse fermante, en gras, en cellule de tableau, en tête
 *     de liste, en titre.
 *   — UN PÉRIMÈTRE VIDE QUI REND « ✅ ». La plupart des dossiers de REQ-GOV-017 n'existent pas
 *     encore (phase −1). La gate imprime donc ce qu'elle a balayé, motif par motif, et REFUSE
 *     qu'un motif marqué `attendu` soit vide : `docs/adr/**` et `prisma/**` ont des cibles
 *     aujourd'hui ; s'ils n'en ont plus, ce n'est pas un succès, c'est une garde débranchée.
 *
 * CE QU'ELLE NE LIT PAS. Les fichiers que git ne suit pas. `git ls-files` est la seule source :
 * un fichier non suivi n'est lu par AUCUNE garde de ce dépôt, et le message final le dit — le jour
 * où `docs/REPRISE-SESSION.md` est entré dans le dépôt, six identifiants nus qui y dormaient
 * depuis des sessions ont rougi d'un coup, sans qu'aucun ait été écrit ce jour-là.
 *
 * CE QU'ELLE ÉVALUE DANS LA JSX (GOV-109). Une expression entre accolades n'est pas reconnue sur
 * une liste de formes : elle est ÉVALUÉE par l'AST de TypeScript, dans la sémantique de
 * JavaScript, et rendue comme React la rend (`valeursPossibles`, `affichage`). Sont constants :
 * les littéraux (chaîne, nombre, booléen, `null`, `undefined`, `void`), les gabarits dont chaque
 * substitution est constante, `+`, les unaires `-` `+` `!`, `&&` `||` `??` dont la gauche est
 * constante, le ternaire, les tableaux (React rend les éléments bout à bout, rien pour `null`,
 * `undefined` et les booléens), les parenthèses et les annotations de type, et les constantes
 * locales `const X = …` du même fichier. Un ternaire dont la condition est INCONNUE mais dont les
 * deux branches sont constantes a deux affichages possibles : la ligne est rendue une fois pour
 * chacun, et CHACUN est jugé — la négation écrite dans une branche n'exempte pas l'autre. Les
 * affichages de plusieurs expressions d'une MÊME ligne rendue se COMBINENT : toutes leurs
 * combinaisons sont rendues (refus de la lentille `exactitude`, PR #267 : deux ternaires voisins
 * portant chacun une moitié d'un terme).
 *   ⚠️ LIMITES DÉCLARÉES. Ce qui n'est pas constant n'est PAS jugé : il reste écrit, et sépare.
 *   Donc : une valeur venue d'ailleurs que du fichier ou de l'expression elle-même, une liaison
 *   ambiguë, une condition inconnue devant un opérande seul, un ternaire dont une branche est
 *   inconnue, un tableau étalé, et une expression ou une ligne aux affichages trop nombreux
 *   (au-delà d'un plafond, une ligne n'est plus jugée qu'affichage par affichage). Ce qu'un
 *   composant fait de ses enfants n'est pas lu non plus. Seul un test du rendu à l'exécution
 *   jugerait ces cas.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne touche pas au dépôt et ne le lit pas : la vue est
 * INJECTÉE. Une preuve qui lirait les fichiers réels verdirait ou rougirait au gré de ce que le
 * dépôt contient le jour où elle tourne, et ne dirait plus rien de la garde.
 */

import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import {
  LEXIQUE_INTERDIT,
  LISTE_NOIRE_GABARIT,
  MARQUEURS_DE_DENEGATION,
  FENETRE_DENEGATION,
  PORTEURS_DU_LEXIQUE,
  EXCEPTIONS_DECLAREES,
  TERMES_CANONIQUES,
  famillesPourPortee,
  toutesLesFormes,
  type ExceptionLexicale,
  type FamilleInterdite,
  type PorteeLexicale,
} from '../../src/domain/lexique/lexique-interdit';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { restreindreALaPr } from './fichiers-de-la-pr';

// ── le périmètre (REQ-GOV-017 pour `depot`, REQ-JUR-037 pour `apporteur`) ─────

export type Motif = {
  readonly nom: string;
  readonly reg: RegExp;
  readonly portee: PorteeLexicale;
  /** `true` si ce motif DOIT avoir des cibles aujourd'hui : zéro fichier y est une faute. */
  readonly attendu: boolean;
  readonly req: string;
};

/**
 * Les courriels adressés au CONTACT rencontré, jamais à l'apporteur — liste NOMINATIVE (arbitrage de
 * la coordination, 2026-10-02). Chacun déclare `DESTINATAIRE = 'contact'`, ce que le témoin
 * `tests/unit/micro-copy/confirmation-par-courriel.spec.ts` exige. Un fichier absent d'ici est jugé
 * en portée apporteur.
 */
export const COURRIELS_AU_CONTACT = [
  'information-article-14.ts',
  'confirmation-contact.ts',
] as const;

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const MOTIFS: readonly Motif[] = [
  {
    nom: 'prisma/**',
    reg: /^prisma\/.+\.(prisma|sql|ts)$/,
    portee: 'depot',
    attendu: true,
    req: 'REQ-GOV-017',
  },
  // La micro-copy est lue par l'apporteur : elle relève de la portée la plus stricte.
  {
    nom: 'messages/**',
    reg: /^messages\/.+\.json$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-GOV-017',
  },
  {
    nom: 'src/**/*.tsx',
    reg: /^src\/.+\.tsx$/,
    portee: 'depot',
    attendu: false,
    req: 'REQ-GOV-017',
  },
  {
    nom: 'src/app/(espace)/**',
    reg: /^src\/app\/\(espace\)\/.+\.(tsx|ts|md|mdx|json)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-JUR-037',
  },
  // JUR-T26 : les composants de l'espace, rendus dans ses pages — ce qu'ils écrivent, l'apporteur le lit.
  {
    nom: 'src/components/espace/**',
    reg: /^src\/components\/espace\/.+\.(tsx|ts)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-JUR-037',
  },
  // JUR-T26 : les RESSOURCES DIFFUSÉES (kit, FAQ, documents de présentation), que REQ-JUR-036 et
  // REQ-JUR-037 nomment et qu'aucun motif ne couvrait. Aucune n'existe encore : elles naissent avec
  // « Ressources » (UX-P3-02), et tombent sous la portée la plus stricte dès leur premier fichier.
  {
    nom: 'ressources diffusées',
    reg: /^(src\/content\/|public\/)?ressources\/.+\.(md|mdx|html|txt|json|tsx|ts)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-JUR-037',
  },
  {
    nom: 'gabarits e-mail',
    reg: /^(src\/)?emails\/.+\.(tsx|ts|html|mjml|md|json)$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-GOV-017',
  },
  {
    nom: 'micro-copy/**',
    reg: /^micro-copy\/.+$/,
    portee: 'apporteur',
    attendu: false,
    req: 'REQ-JUR-037',
  },
  // La micro-copie SSOT de l'espace (UX-P0-01) : lue par l'apporteur, donc la portée la plus
  // stricte — REQ-UX-003 la vise en toutes lettres (« liste noire testée sur tous les fichiers de
  // micro-copy »). ATTENDUE : si elle ne balaie plus rien, c'est la garde qui est débranchée.
  {
    nom: 'src/content/micro-copy/espace/**',
    reg: /^src\/content\/micro-copy\/espace\/.+\.(ts|json)$/,
    portee: 'apporteur',
    attendu: true,
    req: 'REQ-UX-003',
  },
  // Celle de la console : lue par Axion-IA seul, elle relève de la seule portée du dépôt.
  {
    nom: 'src/content/micro-copy/console/**',
    reg: /^src\/content\/micro-copy\/console\/.+\.(ts|json)$/,
    portee: 'depot',
    attendu: true,
    req: 'REQ-GOV-017',
  },
  // W20 (UX-P1-41) : les courriels et la page publique. Aucun motif ne les couvrait (trou relevé par
  // A07, rattrapage 45). Arbitrage de la coordination, sur la recommandation d'A07 (2026-10-02) :
  // `courriels/**` est en portée apporteur PAR DÉFAUT ; seuls les fichiers NOMMÉS dans
  // `COURRIELS_AU_CONTACT`, adressés au contact et jamais à l'apporteur, relèvent du dépôt. Comme la
  // portée la plus large l'emporte (`porteeDuFichier`), le motif par défaut les EXCLUT nommément.
  {
    nom: 'src/content/micro-copy/courriels/**',
    reg: new RegExp(
      `^src/content/micro-copy/courriels/(?!(?:${COURRIELS_AU_CONTACT.map(echapper).join('|')})$).+\\.(ts|json)$`
    ),
    portee: 'apporteur',
    // Aucun courriel à l'apporteur n'est encore sur main : le premier (les notifications,
    // UX-P1-10) le rendra attendu.
    attendu: false,
    req: 'REQ-JUR-012',
  },
  {
    nom: 'courriels au contact',
    reg: new RegExp(
      `^src/content/micro-copy/courriels/(?:${COURRIELS_AU_CONTACT.map(echapper).join('|')})$`
    ),
    portee: 'depot',
    attendu: true,
    req: 'REQ-JUR-012',
  },
  {
    nom: 'src/content/micro-copy/public/**',
    reg: /^src\/content\/micro-copy\/public\/.+\.(ts|json)$/,
    portee: 'apporteur',
    attendu: true,
    req: 'REQ-JUR-012',
  },
  {
    nom: 'docs/adr/**',
    reg: /^docs\/adr\/.+\.md$/,
    portee: 'depot',
    attendu: true,
    req: 'REQ-GOV-017',
  },
];

/**
 * LE GABARIT DE CONTRAT (JUR-T01, acceptation point 3). Il n'entre dans AUCUNE portée du lexique :
 * le contrat écrit « relation commerciale » et « agence commerciale », et le lexique le forcerait
 * à réécrire des clauses figées (décision `W11`). Il reçoit à la place sa propre liste noire,
 * ABSOLUE, importée de la SSOT (`LISTE_NOIRE_GABARIT`) : aucune dénégation, aucune citation ne
 * l'exempte — seulement les chaînes verbatim que la SSOT nomme.
 */
export const MOTIF_GABARIT = {
  nom: 'docs/contrat/**',
  reg: /^docs\/contrat\/.+\.md$/,
  attendu: true,
  req: 'REQ-JUR-003',
} as const;

/**
 * La portée d'un fichier : la plus STRICTE de celles des motifs qui le prennent, ou `null` s'il
 * est hors périmètre. `apporteur` l'emporte sur `depot`, parce qu'elle contient ses familles.
 */
export function porteeDuFichier(chemin: string): PorteeLexicale | null {
  const pris = MOTIFS.filter((m) => m.reg.test(chemin));
  if (pris.length === 0) return null;
  return pris.some((m) => m.portee === 'apporteur') ? 'apporteur' : 'depot';
}

// ── la mécanique des tournures ───────────────────────────────────────────────

/**
 * Les caractères qui font un MOT, accents et ligatures compris — et rien d'autre. Ni le point, ni
 * la virgule, ni la parenthèse, ni l'astérisque du gras, ni la barre d'un tableau : c'est ce qui
 * rend la garde sensible à toutes les positions, y compris celles où sa cousine est aveugle.
 */
const CAR_MOT = 'A-Za-zÀ-ÖØ-öø-ÿŒœ0-9_';

/** Ce qui coupe un segment de phrase — la barre verticale sépare deux cellules de tableau. */
const SEPARATEURS_DE_SEGMENT = /[.;:!?|—]/;

/** Le motif d'une forme : bornée par des caractères de mot, insensible à la casse et à l'apostrophe. */
export function motifDeLaForme(forme: string): RegExp {
  const echappee = forme
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/'/g, "['’]")
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![${CAR_MOT}])(${echappee})(?![${CAR_MOT}])`, 'giu');
}

/** Les marqueurs de dénégation, compilés une fois. `n'` n'a pas de borne à droite : il s'élide. */
const MARQUEURS = new RegExp(
  '(?<![' +
    CAR_MOT +
    '])(?:' +
    MARQUEURS_DE_DENEGATION.map((m) =>
      m.endsWith("'") ? m.slice(0, -1) + "['’]" : m + '(?![' + CAR_MOT + '])'
    ).join('|') +
    ')',
  'iu'
);

/** Vrai si le terme qui suit ce préfixe est nié : marqueur dans le même segment, à portée de vue. */
export function estDenegation(prefixe: string): boolean {
  const segments = prefixe.split(SEPARATEURS_DE_SEGMENT);
  const segment = segments[segments.length - 1] ?? '';
  return MARQUEURS.test(segment.slice(-FENETRE_DENEGATION));
}

/** Les intervalles cités d'une ligne de PROSE : « … », " … " et accents graves. */
export function zonesCitees(ligne: string): [number, number][] {
  const zones: [number, number][] = [];
  for (const reg of [/«[^»]*»/g, /"[^"]*"/g, /`[^`]*`/g]) {
    for (const m of ligne.matchAll(reg)) zones.push([m.index, m.index + m[0].length]);
  }
  return zones;
}

// ── le rendu : la forme que le lecteur VOIT, et non la source (GOV-071) ──────

/**
 * 🔴 LE DÉFAUT. Cette garde et `gov:identifiants` cherchaient leurs termes dans la SOURCE brute.
 * Or ce que l'apporteur lit, c'est le RENDU. Une mise en forme tapée à la main AU MILIEU d'un mot
 * coupe le mot dans la source et le laisse entier à l'écran : `com**m**ercial` s'affiche
 * « commercial » (une lettre en gras), et les deux gardes, qui voyaient deux fragments, rendaient
 * « ✅ ». Le terme interdit sortait donc sous les yeux du lecteur, garde verte — et c'est le
 * vocabulaire dont un mot mal placé pèse dans un faisceau d'indices.
 *
 * LA MESURE. Chaque ligne est RENDUE avant d'être découpée en mots, par `lignesRendues` seule, que
 * `gov-identifiants.ts` importe : les deux gardes ne peuvent plus découper différemment (RM-01).
 * Le rendu EFFACE ce qui, collé entre deux lettres ou chiffres, ne s'affiche pas :
 *   — partout : les caractères invisibles (Unicode `Default_Ignorable_Code_Point` : trait d'union
 *     conditionnel, espaces de largeur nulle, joncteurs, marque d'ordre…), les entités HTML qui
 *     rendent une lettre, un chiffre ou un invisible (`&#101;`, `&shy;`, `&eacute;`), les balises
 *     EN LIGNE sans attribut (`<b>`, `<span>`…) et les commentaires HTML collés dans un mot ;
 *   — en Markdown (`.md`, `.mdx`) : l'emphase et le barré (`*`, `**`, `***`, `~`, `~~`) ;
 *   — en JSX (`.tsx`, `.jsx`) et en Markdown : la STRUCTURE, rendue par l'arbre (GOV-106, plus
 *     bas : `retouchesJsx`, `retouchesMarkdown`), et non plus par des expressions régulières.
 *
 * CE QU'IL NE REND PAS, EXPRÈS. En Markdown, un bloc de code et un code en ligne s'affichent TELS
 * QUELS : leur contenu n'est pas rendu (seuls les invisibles y sont effacés, puisqu'ils ne se
 * voient pas davantage). C'est ce qui laisse une documentation écrire son contre-exemple entre
 * accents graves — `com**m**ercial` y reste des astérisques, et le lecteur les voit.
 *
 * CE QU'IL NE COUVRE PAS, ET QUI EST DIT. Hors de l'arbre (chaîne de code, JSON, e-mail), une
 * balise AVEC attributs n'est pas effacée. Dans l'arbre, elle l'est, et ses attributs passent en
 * TRAÎNE de ligne (GOV-106) : un `title`, un `aria-label` restent lus. La concaténation de chaînes
 * hors JSX (`'com' + 'mercial'` dans du code) n'est pas un rendu : elle n'est pas couverte. Le
 * suivi des blocs clôturés est une bascule, sans appariement de longueur de clôture.
 *
 * Le rendu garde une ligne pour une ligne : le numéro qu'une garde nomme est celui de la source,
 * celle où le mot recollé COMMENCE (GOV-106 : une retouche qui efface un saut de ligne rend ce
 * saut en fin de ligne, voir `appliquerRetouches`).
 */
const LETTRE_OU_CHIFFRE = '\\p{L}\\p{N}';
const INVISIBLES = /\p{Default_Ignorable_Code_Point}/gu;
const EST_RENDU_EN_MOT = /^[\p{L}\p{N}_\p{Default_Ignorable_Code_Point}]$/u;

/**
 * Les entités NOMMÉES qu'on décode : les invisibles, les ligatures, et les lettres accentuées
 * DÉRIVÉES de leur décomposition (`é` = `e` + aigu, donc `eacute`) plutôt que recopiées en table.
 */
const SUFFIXE_DE_MARQUE: Record<string, string> = {
  '̀': 'grave',
  '́': 'acute',
  '̂': 'circ',
  '̈': 'uml',
  '̧': 'cedil',
};
const ENTITES_NOMMEES: ReadonlyMap<string, string> = new Map([
  ['shy', '­'],
  ['zwj', '‍'],
  ['zwnj', '‌'],
  ['ZeroWidthSpace', '​'],
  ['NoBreak', '⁠'],
  ['oelig', 'œ'],
  ['OElig', 'Œ'],
  ['aelig', 'æ'],
  ['AElig', 'Æ'],
  ['szlig', 'ß'],
  ...Array.from({ length: 0x180 - 0xc0 }, (_, k) => String.fromCodePoint(0xc0 + k)).flatMap(
    (c): [string, string][] => {
      const d = c.normalize('NFD');
      const suffixe = d.length === 2 ? SUFFIXE_DE_MARQUE[d[1]!] : undefined;
      return suffixe === undefined ? [] : [[d[0]! + suffixe, c]];
    }
  ),
]);

/** Une entité ne se décode que si elle rend une lettre, un chiffre ou un invisible : ailleurs, elle SÉPARE. */
function decoderEntites(s: string): string {
  return s.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z]+));/g,
    (m: string, dec?: string, hex?: string, nom?: string) => {
      const point =
        dec !== undefined ? Number(dec) : hex !== undefined ? parseInt(hex, 16) : undefined;
      const c =
        point === undefined
          ? ENTITES_NOMMEES.get(nom ?? '')
          : point <= 0x10ffff
            ? String.fromCodePoint(point)
            : undefined;
      return c !== undefined && EST_RENDU_EN_MOT.test(c) ? c : m;
    }
  );
}

/**
 * Les balises EN LIGNE seulement. Une balise de bloc (`<dt>`, `<p>`, `<div>`, `<br>`…) passe à la
 * ligne au rendu : elle SÉPARE les mots, et l'effacer en fabriquerait un. Mesuré sur ce dépôt :
 * sans cette liste, `<dt>Employeur</dt><dt>Matricule</dt>` — une fixture de la charte — se
 * rendait « EmployeurMatricule ».
 */
const BALISES_EN_LIGNE = [
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'mark',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
];
const BALISE_EN_LIGNE_OU_COMMENTAIRE = `<\\/?(?:${BALISES_EN_LIGNE.join('|')})\\s*\\/?>|<!--.*?-->`;
const EMPHASE_MARKDOWN = '\\*{1,3}|~{1,2}';

/**
 * Ce qui s'efface ENTRE deux lettres ou chiffres — et seulement là : ailleurs, la mise en forme
 * ne colle rien. La lettre de gauche ne doit pas suivre une barre oblique inverse : dans du code,
 * `\n` est un saut de ligne, pas la lettre « n » (mesuré : `\n<details>` d'un gabarit de test).
 * GOV-106 : ce passage ne rend plus la structure de la JSX ni du Markdown — l'arbre s'en charge.
 * Il reste pour ce qu'aucun arbre ne lit ici : le HTML tapé dans une chaîne de code, un JSON, un
 * gabarit d'e-mail.
 */
function effacablesPour(chemin: string): RegExp {
  const formes = [BALISE_EN_LIGNE_OU_COMMENTAIRE];
  if (/\.mdx?$/.test(chemin)) formes.push(EMPHASE_MARKDOWN);
  return new RegExp(
    `(?<=(?<!\\\\)[${LETTRE_OU_CHIFFRE}])(?:${formes.join('|')})+(?=[${LETTRE_OU_CHIFFRE}])`,
    'giu'
  );
}

/** Rend un fragment jusqu'au point fixe : une entité décodée peut coller une lettre à une balise. */
function rendreFragment(fragment: string, effacables: RegExp): string {
  let avant: string;
  let s = fragment;
  do {
    avant = s;
    s = decoderEntites(s).replace(INVISIBLES, '').replace(effacables, '');
  } while (s !== avant);
  return s;
}

/**
 * Les morceaux d'une ligne Markdown, `[texte, estDuCode]`. Un code en ligne s'ouvre sur une suite
 * d'accents graves et se ferme sur une suite de MÊME longueur ; sans fermeture, ce sont des
 * accents graves littéraux, et le texte reste rendu.
 */
function morceauxMarkdown(ligne: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  let debutTexte = 0;
  let i = 0;
  while (i < ligne.length) {
    if (ligne[i] !== '`') {
      i++;
      continue;
    }
    let n = 0;
    while (ligne[i + n] === '`') n++;
    let j = i + n;
    let fin = -1;
    while (j < ligne.length) {
      if (ligne[j] !== '`') {
        j++;
        continue;
      }
      let m = 0;
      while (ligne[j + m] === '`') m++;
      if (m === n) {
        fin = j;
        break;
      }
      j += m;
    }
    if (fin === -1) {
      i += n;
      continue;
    }
    out.push([ligne.slice(debutTexte, i), false], [ligne.slice(i, fin + n), true]);
    i = debutTexte = fin + n;
  }
  out.push([ligne.slice(debutTexte), false]);
  return out;
}

// ── GOV-106 : la STRUCTURE se rend par l'arbre, et non par des expressions régulières ──────

/**
 * 🔴 LE DÉFAUT. GOV-071 rendait la structure par expressions régulières, ligne à ligne : ce
 * qu'elles ne décrivaient pas restait dans la ligne et SÉPARAIT le mot, alors que l'écran le
 * recollait. Toute construction que le rendu efface ou remplace — une expression JSX constante,
 * un fragment, un composant, une balise à attributs, un lien Markdown, une balise coupée sur deux
 * lignes — laissait passer un terme que l'apporteur lit entier.
 *
 * LA MESURE. La structure se lit dans l'ARBRE : la JSX par l'AST du compilateur TypeScript (déjà
 * une dépendance du dépôt), le Markdown par son arbre EN LIGNE (paragraphe par paragraphe : code
 * en ligne, liens, balises, commentaires). L'arbre produit des RETOUCHES de la source ;
 * `appliquerRetouches` les pose en gardant une ligne pour une ligne. Le passage caractère par
 * caractère (`rendreFragment` : entités, invisibles, emphase) vient APRÈS, sur la ligne retouchée.
 */
type Retouche = {
  debut: number;
  fin: number;
  /** Ce que l'écran affiche à la place. Jamais de saut de ligne. */
  par: string;
  /** Ce qui QUITTE l'écran mais reste LU par la garde : attributs d'une balise effacée, cible d'un lien. */
  traine?: string;
  /**
   * GOV-109 — les AUTRES affichages possibles, quand une condition inconnue choisit entre des
   * branches constantes : la ligne est rendue une fois par affichage, et chacune est jugée.
   */
  variantes?: string[];
};

/**
 * Les délimiteurs de citation (`zonesCitees`) et de code en ligne ne passent pas dans la traîne :
 * un guillemet de traîne pourrait s'apparier à un guillemet orphelin de la ligne, et faire d'un
 * terme rendu une « citation » exemptée.
 */
const traineLisible = (s: string): string =>
  s
    .replace(/["`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Pose les retouches, une ligne pour une ligne. Les sauts de ligne qu'une retouche efface sont
 * rendus au PREMIER saut de ligne conservé qui la suit : le mot recollé reste sur la ligne source
 * où il commence, et les lignes d'après gardent leur numéro (vides s'il le faut). La traîne est
 * ajoutée en fin de cette même ligne, séparée par une espace. Deux retouches qui se chevauchent :
 * la première gagne, la seconde est ignorée — elle ne peut rien recoller de plus.
 */
function appliquerRetouches(
  source: string,
  retouches: Retouche[],
  lignes?: Map<Retouche, number>
): string {
  const triees = [...retouches].sort((x, y) => x.debut - y.debut || x.fin - y.fin);
  let out = '';
  let sauts = 0;
  let pos = 0;
  let enAttente = 0;
  let traine: string[] = [];
  const clore = (): string =>
    (traine.length > 0 ? ' ' + traine.join(' ') : '') + '\n'.repeat(enAttente);
  const copier = (jusque: number): void => {
    for (let k = pos; k < jusque; k++) {
      const c = source[k]!;
      if (c !== '\n') {
        out += c;
        continue;
      }
      out += (traine.length > 0 ? ' ' + traine.join(' ') : '') + '\n' + '\n'.repeat(enAttente);
      sauts += 1 + enAttente;
      enAttente = 0;
      traine = [];
    }
    pos = jusque;
  };
  for (const r of triees) {
    if (r.debut < pos) continue;
    copier(r.debut);
    lignes?.set(r, sauts);
    out += r.par.replace(/\r?\n/g, ' ');
    enAttente += source.slice(r.debut, r.fin).split('\n').length - 1;
    const t = r.traine === undefined ? '' : traineLisible(r.traine);
    if (t !== '') traine.push(t);
    pos = r.fin;
  }
  copier(source.length);
  return out + clore();
}

/**
 * GOV-109 — une valeur CONSTANTE de JavaScript, telle que l'expression la produit sans exécution.
 * Un tableau est une valeur : React en rend les éléments bout à bout.
 */
type Valeur = string | number | boolean | null | undefined | readonly Valeur[];
type Primitive = Exclude<Valeur, readonly Valeur[]>;

/**
 * Le plafond des valeurs POSSIBLES d'une expression (une condition inconnue donne deux branches,
 * et deux conditions dans une même concaténation, quatre). Au-delà, l'expression n'est pas jugée :
 * ⚠️ LIMITE DÉCLARÉE dans l'en-tête.
 */
const MAX_VALEURS_POSSIBLES = 16;

/**
 * Les constantes nommées d'un fichier : `const X = …`, résolues quand le nom n'est lié qu'UNE fois
 * dans le fichier (aucun paramètre, aucune autre variable, aucun import du même nom). Un nom lié
 * deux fois pourrait désigner l'autre liaison à l'endroit du rendu : il n'est pas résolu.
 */
type Contexte = { constantes: ReadonlyMap<string, ts.Expression>; enCours: Set<string> };

const SANS_CONTEXTE = (): Contexte => ({ constantes: new Map(), enCours: new Set() });

function constantesDuFichier(sf: ts.SourceFile): Contexte {
  const liaisons = new Map<string, number>();
  const lier = (nom: ts.BindingName | undefined): void => {
    if (nom === undefined) return;
    if (ts.isIdentifier(nom)) {
      liaisons.set(nom.text, (liaisons.get(nom.text) ?? 0) + 1);
      return;
    }
    for (const el of nom.elements) if (!ts.isOmittedExpression(el)) lier(el.name);
  };
  const candidates = new Map<string, ts.Expression>();
  const visiter = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n)) {
      lier(n.name);
      const liste = n.parent;
      if (
        ts.isIdentifier(n.name) &&
        n.initializer !== undefined &&
        ts.isVariableDeclarationList(liste) &&
        (liste.flags & ts.NodeFlags.Const) !== 0
      ) {
        candidates.set(n.name.text, n.initializer);
      }
    } else if (ts.isParameter(n)) {
      lier(n.name);
    } else if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isClassDeclaration(n) ||
      ts.isClassExpression(n) ||
      ts.isEnumDeclaration(n) ||
      ts.isImportEqualsDeclaration(n) ||
      ts.isImportClause(n) ||
      ts.isImportSpecifier(n) ||
      ts.isNamespaceImport(n)
    ) {
      const nom = n.name;
      if (nom !== undefined && ts.isIdentifier(nom)) lier(nom);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  const constantes = new Map<string, ts.Expression>();
  for (const [nom, init] of candidates) if (liaisons.get(nom) === 1) constantes.set(nom, init);
  return { constantes, enCours: new Set() };
}

/** `String(v)` de JavaScript, tableaux compris (`[1, [2, null]]` → « 1,2, »). */
function enChaine(v: Valeur): string {
  if (Array.isArray(v)) {
    return v.map((x: Valeur) => (x === null || x === undefined ? '' : enChaine(x))).join(',');
  }
  return String(v);
}

const primitive = (v: Valeur): Primitive => (Array.isArray(v) ? enChaine(v) : (v as Primitive));

const vrai = (v: Valeur): boolean => Array.isArray(v) || Boolean(v);

/** Le produit de listes de valeurs possibles, ou `undefined` au-delà du plafond. */
function produit(listes: readonly (readonly Valeur[])[]): Valeur[][] | undefined {
  let acc: Valeur[][] = [[]];
  for (const l of listes) {
    const suivant: Valeur[][] = [];
    for (const a of acc) for (const v of l) suivant.push([...a, v]);
    if (suivant.length > MAX_VALEURS_POSSIBLES) return undefined;
    acc = suivant;
  }
  return acc;
}

/** Des listes de valeurs possibles, bout à bout, ou `undefined` si l'une manque ou au-delà du plafond. */
function union(...listes: (readonly Valeur[] | undefined)[]): Valeur[] | undefined {
  const out: Valeur[] = [];
  for (const l of listes) {
    if (l === undefined) return undefined;
    out.push(...l);
  }
  return out.length > MAX_VALEURS_POSSIBLES ? undefined : out;
}

/**
 * Les valeurs POSSIBLES d'une expression, toutes constantes, dans la sémantique de JavaScript ;
 * `undefined` dès qu'une seule ne l'est pas. Une seule valeur, sauf là où une condition inconnue
 * choisit entre deux branches constantes : les deux sont alors possibles, et les deux se jugent.
 */
function valeursPossibles(e: ts.Expression, ctx: Contexte): Valeur[] | undefined {
  if (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    return valeursPossibles(e.expression, ctx);
  }
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isNumericLiteral(e)) return [Number(e.text)];
  if (e.kind === ts.SyntaxKind.NullKeyword) return [null];
  if (e.kind === ts.SyntaxKind.TrueKeyword) return [true];
  if (e.kind === ts.SyntaxKind.FalseKeyword) return [false];
  if (ts.isVoidExpression(e)) return [undefined];
  if (ts.isIdentifier(e)) {
    if (e.text === 'undefined') return [undefined];
    const init = ctx.constantes.get(e.text);
    if (init === undefined || ctx.enCours.has(e.text)) return undefined;
    ctx.enCours.add(e.text);
    try {
      return valeursPossibles(init, ctx);
    } finally {
      ctx.enCours.delete(e.text);
    }
  }
  if (ts.isPrefixUnaryExpression(e)) {
    const vs = valeursPossibles(e.operand, ctx);
    if (vs === undefined) return undefined;
    if (e.operator === ts.SyntaxKind.MinusToken) return vs.map((v) => -Number(primitive(v)));
    if (e.operator === ts.SyntaxKind.PlusToken) return vs.map((v) => Number(primitive(v)));
    if (e.operator === ts.SyntaxKind.ExclamationToken) return vs.map((v) => !vrai(v));
    return undefined;
  }
  if (ts.isTemplateExpression(e)) {
    const listes: Valeur[][] = [];
    for (const s of e.templateSpans) {
      const l = valeursPossibles(s.expression, ctx);
      if (l === undefined) return undefined;
      listes.push(l);
    }
    return produit(listes)?.map(
      (vs) =>
        e.head.text + vs.map((v, k) => enChaine(v) + e.templateSpans[k]!.literal.text).join('')
    );
  }
  if (ts.isArrayLiteralExpression(e)) {
    const listes: Valeur[][] = [];
    for (const el of e.elements) {
      if (ts.isSpreadElement(el)) return undefined;
      if (ts.isOmittedExpression(el)) {
        listes.push([undefined]);
        continue;
      }
      const l = valeursPossibles(el, ctx);
      if (l === undefined) return undefined;
      listes.push(l);
    }
    return produit(listes);
  }
  if (ts.isConditionalExpression(e)) {
    const conditions = valeursPossibles(e.condition, ctx);
    if (conditions !== undefined && conditions.every(vrai))
      return valeursPossibles(e.whenTrue, ctx);
    if (conditions !== undefined && !conditions.some(vrai))
      return valeursPossibles(e.whenFalse, ctx);
    // Condition inconnue (ou tantôt vraie, tantôt fausse) : les DEUX branches se rendent.
    return union(valeursPossibles(e.whenTrue, ctx), valeursPossibles(e.whenFalse, ctx));
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const gauches = valeursPossibles(e.left, ctx);
      if (gauches === undefined) return undefined;
      const prendDroite = (g: Valeur): boolean =>
        op === ts.SyntaxKind.AmpersandAmpersandToken
          ? vrai(g)
          : op === ts.SyntaxKind.BarBarToken
            ? !vrai(g)
            : g === null || g === undefined;
      const restent = gauches.filter((g) => !prendDroite(g));
      if (restent.length === gauches.length) return restent;
      return union(restent, valeursPossibles(e.right, ctx));
    }
    if (op === ts.SyntaxKind.PlusToken) {
      const g = valeursPossibles(e.left, ctx);
      const d = valeursPossibles(e.right, ctx);
      if (g === undefined || d === undefined) return undefined;
      return produit([g, d])?.map(([a, b]) => {
        const x = primitive(a);
        const y = primitive(b);
        return typeof x === 'string' || typeof y === 'string'
          ? String(x) + String(y)
          : Number(x) + Number(y);
      });
    }
  }
  return undefined;
}

/** Ce que React AFFICHE d'une valeur : rien pour `null`, `undefined` et les booléens ; un tableau, bout à bout. */
function affichage(v: Valeur): string {
  if (Array.isArray(v)) return v.map((x: Valeur) => affichage(x)).join('');
  return v === null || v === undefined || typeof v === 'boolean' ? '' : String(v);
}

/** Les affichages POSSIBLES d'une expression constante, sans doublon ; `undefined` si elle ne l'est pas. */
function affichagesPossibles(e: ts.Expression, ctx: Contexte): string[] | undefined {
  const vs = valeursPossibles(e, ctx);
  return vs === undefined ? undefined : [...new Set(vs.map(affichage))];
}
const EST_EN_LIGNE: ReadonlySet<string> = new Set(BALISES_EN_LIGNE);

/**
 * Une balise JSX qui se rend EN LIGNE, donc transparente : une balise HTML de la liste en ligne,
 * ou un COMPOSANT (nom capitalisé ou qualifié). ⚠️ LIMITE DÉCLARÉE : ce qu'un composant rend n'est
 * pas lu ; il est supposé rendre ses enfants en ligne, là où ils sont écrits — c'est le cas des
 * composants de traduction et de mise en forme, et c'est le sens qui ne laisse rien passer.
 */
function estEnLigneJsx(nom: ts.JsxTagNameExpression): boolean {
  const texte = nom.getText();
  if (/^[a-z][a-z0-9]*$/.test(texte)) return EST_EN_LIGNE.has(texte);
  return /^[A-Z_$]/.test(texte) || texte.includes('.');
}

/**
 * La mise au propre du texte JSX (la règle du compilateur JSX) : un blanc qui contient un saut de
 * ligne, en TÊTE ou en QUEUE d'un texte, disparaît — il colle le texte à son voisin. Un saut de
 * ligne intérieur devient une espace : il sépare déjà dans la source, rien n'est à retoucher.
 * La retouche n'est posée que du côté d'un voisin TRANSPARENT : contre une balise de bloc, qui
 * sépare de toute façon, elle ne recollerait rien et ne ferait que remonter des lignes.
 */
function retouchesDuTexteJsx(
  t: ts.JsxText,
  source: string,
  r: Retouche[],
  avant: boolean,
  apres: boolean
): void {
  const brut = source.slice(t.pos, t.end);
  if (!brut.includes('\n')) return;
  if (/^\s*$/.test(brut)) {
    if (avant && apres) r.push({ debut: t.pos, fin: t.end, par: '' });
    return;
  }
  const tete = /^[^\S\n]*\n\s*/.exec(brut)?.[0];
  if (avant && tete !== undefined) r.push({ debut: t.pos, fin: t.pos + tete.length, par: '' });
  const queue = /\s*\n[^\S\n]*$/.exec(brut)?.[0];
  if (apres && queue !== undefined) r.push({ debut: t.end - queue.length, fin: t.end, par: '' });
}

/** Le nom d'une balise HTML en ligne, en minuscules comme la JSX l'exige d'une balise native. */
const estBaliseEnLigne = (nom: string): boolean =>
  /^[a-z][a-z0-9]*$/.test(nom) && EST_EN_LIGNE.has(nom);

/** L'expression d'une accolade, sans parenthèses. */
function sansParentheses(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x)) x = x.expression;
  return x;
}

/**
 * Les retouches d'un fichier JSX, lues dans l'AST. Chaque ENFANT d'un élément ou d'un fragment est
 * rendu : le texte (mis au propre), l'expression constante (sa valeur évaluée, GOV-109 ; ses
 * affichages possibles quand une condition inconnue choisit entre des branches constantes),
 * l'expression vide ou commentaire seul (rien), l'élément JSX entre accolades, et les balises des
 * éléments en ligne et des fragments (effacées, attributs en traîne). Une balise de BLOC reste :
 * elle sépare. ⚠️ LIMITE DÉCLARÉE (en-tête) : une expression dont la valeur n'est pas constante
 * n'est pas inventée — elle reste écrite, et sépare ; seul un test du rendu à l'exécution la
 * jugerait.
 */
function retouchesJsx(chemin: string, contenu: string): Retouche[] {
  const sf = ts.createSourceFile(
    chemin,
    contenu,
    ts.ScriptTarget.Latest,
    true,
    /\.jsx$/.test(chemin) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  );
  const ctx = constantesDuFichier(sf);
  const r: Retouche[] = [];
  const effacer = (n: ts.Node, traine?: string): void => {
    r.push({ debut: n.getStart(sf), fin: n.end, par: '', ...(traine ? { traine } : {}) });
  };
  const attributsDe = (o: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | undefined =>
    o.attributes.properties.length > 0 ? o.attributes.getText(sf) : undefined;

  /** Un enfant dont le rendu COLLE à ses voisins : texte, valeur, fragment, balise en ligne. */
  const transparent = (c: ts.JsxChild): boolean => {
    if (ts.isJsxText(c) || ts.isJsxFragment(c)) return true;
    if (ts.isJsxElement(c)) return estEnLigneJsx(c.openingElement.tagName);
    if (ts.isJsxSelfClosingElement(c)) return estBaliseEnLigne(c.tagName.getText(sf));
    if (c.expression === undefined || affichagesPossibles(c.expression, ctx) !== undefined)
      return true;
    const x = sansParentheses(c.expression);
    return ts.isJsxElement(x) || ts.isJsxFragment(x) || ts.isJsxSelfClosingElement(x);
  };

  const enfants = (liste: readonly ts.JsxChild[], parentTransparent: boolean): void => {
    liste.forEach((c, k) => {
      const avant = k > 0 ? transparent(liste[k - 1]!) : parentTransparent;
      const apres = k < liste.length - 1 ? transparent(liste[k + 1]!) : parentTransparent;
      enfant(c, avant, apres);
    });
  };

  const enfant = (c: ts.JsxChild, avant: boolean, apres: boolean): void => {
    if (ts.isJsxText(c)) {
      retouchesDuTexteJsx(c, contenu, r, avant, apres);
      return;
    }
    if (ts.isJsxExpression(c)) {
      if (c.expression === undefined) {
        // Vide ou commentaire seul : rien à l'écran. Un commentaire n'est effacé que COLLÉ entre
        // deux voisins qui se rendent — son texte en traîne ; ailleurs, il reste lu à sa ligne.
        const interieur = contenu.slice(c.getStart(sf) + 1, c.end - 1);
        if (interieur.trim() === '') effacer(c);
        else if (avant && apres) effacer(c, interieur);
        return;
      }
      const vus = affichagesPossibles(c.expression, ctx);
      if (vus !== undefined) {
        const [par = '', ...variantes] = vus;
        r.push({
          debut: c.getStart(sf),
          fin: c.end,
          par,
          ...(variantes.length > 0 ? { variantes } : {}),
        });
        return;
      }
      const x = sansParentheses(c.expression);
      if (ts.isJsxElement(x) || ts.isJsxFragment(x) || ts.isJsxSelfClosingElement(x)) {
        r.push({ debut: c.getStart(sf), fin: x.getStart(sf), par: '' });
        r.push({ debut: x.end, fin: c.end, par: '' });
        enfant(x, avant, apres);
        return;
      }
      visiter(c.expression);
      return;
    }
    if (ts.isJsxFragment(c)) {
      effacer(c.openingFragment);
      effacer(c.closingFragment);
      enfants(c.children, true);
      return;
    }
    if (ts.isJsxSelfClosingElement(c)) {
      // Un composant auto-fermant rend ce qu'on ne lit pas : il reste, et sépare.
      if (estBaliseEnLigne(c.tagName.getText(sf))) effacer(c, attributsDe(c));
      else ts.forEachChild(c, visiter);
      return;
    }
    if (ts.isJsxElement(c)) {
      const enLigne = estEnLigneJsx(c.openingElement.tagName);
      if (enLigne) {
        effacer(c.openingElement, attributsDe(c.openingElement));
        effacer(c.closingElement);
      } else {
        ts.forEachChild(c.openingElement, visiter);
      }
      enfants(c.children, enLigne);
    }
  };

  /** Une racine JSX garde ses propres balises (elles touchent du code, pas du texte) ; ses enfants se rendent. */
  const visiter = (n: ts.Node): void => {
    if (ts.isJsxElement(n)) {
      ts.forEachChild(n.openingElement, visiter);
      enfants(n.children, false);
      return;
    }
    if (ts.isJsxFragment(n)) {
      enfants(n.children, false);
      return;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return r;
}

/** La fin d'une suite d'accents graves ouverte en `i` : la suite de MÊME longueur, ou -1. */
function finDuCodeEnLigne(s: string, i: number, borne: number): number {
  let n = 0;
  while (s[i + n] === '`') n++;
  for (let j = i + n; j < borne;) {
    if (s[j] !== '`') {
      j++;
      continue;
    }
    let m = 0;
    while (s[j + m] === '`') m++;
    if (m === n) return j + m;
    j += m;
  }
  return -1;
}

/** Le délimiteur fermant apparié à celui ouvert en `i` (profondeur, échappements, code en ligne), ou -1. */
function fermant(s: string, i: number, borne: number, ouvre: string, ferme: string): number {
  let profondeur = 0;
  for (let j = i; j < borne; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '`') {
      const f = finDuCodeEnLigne(s, j, borne);
      if (f !== -1) j = f - 1;
      continue;
    }
    if (c === ouvre) profondeur++;
    else if (c === ferme && --profondeur === 0) return j;
  }
  return -1;
}

/** Une balise HTML en ligne (ou un commentaire), attributs et sauts de ligne compris. */
const BALISE_HTML =
  /<\/?([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;

const COLLE_A_UN_MOT = /^[\p{L}\p{N}]$/u;

const etiquetteDeReference = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Les retouches d'un Markdown, lues dans son arbre EN LIGNE, paragraphe par paragraphe (hors blocs
 * clôturés) — un paragraphe entier, parce qu'une balise ou un lien peut s'y couper sur plusieurs
 * lignes. Le code en ligne n'est PAS rendu : il s'affiche tel quel, et c'est lui qui laisse une
 * documentation écrire son contre-exemple. Rendus : le lien (`[texte](cible)`, `[texte][ref]`,
 * `[ref]` défini) → son texte, la cible en traîne ; la balise HTML en ligne → effacée, attributs
 * en traîne ; le commentaire HTML collé dans un mot → rien, son contenu en traîne (ailleurs, il
 * reste lu à sa ligne) ; en `.mdx`, l'expression constante entre accolades →
 * sa valeur, et le composant → transparent. Une image reste : elle ne rend pas son texte.
 * ⚠️ LIMITES DÉCLARÉES : pas de bloc de code indenté, pas de HTML de bloc multi-paragraphe, pas
 * d'appariement de longueur des clôtures — comme GOV-071.
 */
function retouchesMarkdown(contenu: string, mdx: boolean): Retouche[] {
  const r: Retouche[] = [];
  const definies = new Set<string>();
  for (const m of contenu.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*\S/gm)) {
    definies.add(etiquetteDeReference(m[1]!));
  }

  const paragraphes: [number, number][] = [];
  let offset = 0;
  let dansUnBloc = false;
  let debut = -1;
  for (const ligne of contenu.split('\n')) {
    const cloture = /^\s{0,3}(```|~~~)/.test(ligne);
    if (cloture || dansUnBloc || ligne.trim() === '') {
      if (debut !== -1) paragraphes.push([debut, offset - 1]);
      debut = -1;
      if (cloture) dansUnBloc = !dansUnBloc;
    } else if (debut === -1) {
      debut = offset;
    }
    offset += ligne.length + 1;
  }
  if (debut !== -1) paragraphes.push([debut, contenu.length]);

  for (const [a, b] of paragraphes) {
    const sauts = new Map<number, number>();
    for (let i = a; i < b;) {
      const saut = sauts.get(i);
      if (saut !== undefined) {
        i = saut;
        continue;
      }
      const c = contenu[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        const f = finDuCodeEnLigne(contenu, i, b);
        if (f !== -1) {
          i = f;
          continue;
        }
        while (contenu[i] === '`') i++;
        continue;
      }
      if (c === '<') {
        if (contenu.startsWith('<!--', i)) {
          const f = contenu.indexOf('-->', i + 4);
          if (f !== -1 && f + 3 <= b) {
            // Un commentaire ne s'efface que COLLÉ dans un mot, son contenu en traîne : ailleurs,
            // il reste où il est, et la garde continue de le lire à sa ligne.
            const colle = COLLE_A_UN_MOT.test(contenu[i - 1] ?? '');
            if (colle && COLLE_A_UN_MOT.test(contenu[f + 3] ?? '')) {
              r.push({ debut: i, fin: f + 3, par: '', traine: contenu.slice(i + 4, f) });
            }
            i = f + 3;
            continue;
          }
        }
        BALISE_HTML.lastIndex = i;
        const m = BALISE_HTML.exec(contenu);
        if (m !== null && m.index + m[0].length <= b) {
          const nom = m[1]!;
          const enLigne = EST_EN_LIGNE.has(nom.toLowerCase()) || (mdx && /^[A-Z]/.test(nom));
          if (enLigne) {
            const attributs = (m[2] ?? '').trim();
            r.push({
              debut: i,
              fin: i + m[0].length,
              par: '',
              ...(attributs !== '' ? { traine: m[0] } : {}),
            });
          }
          i += m[0].length;
          continue;
        }
        i++;
        continue;
      }
      if (c === '!' && contenu[i + 1] === '[') {
        // Une image : son texte ne s'affiche pas en ligne. Elle reste, et sépare.
        i += 2;
        continue;
      }
      if (c === '[') {
        const f = fermant(contenu, i, b, '[', ']');
        if (f !== -1) {
          let finLien = -1;
          if (contenu[f + 1] === '(') {
            const p = fermant(contenu, f + 1, b, '(', ')');
            if (p !== -1) finLien = p + 1;
          } else if (contenu[f + 1] === '[') {
            const p = fermant(contenu, f + 1, b, '[', ']');
            if (p !== -1) finLien = p + 1;
          } else if (definies.has(etiquetteDeReference(contenu.slice(i + 1, f)))) {
            finLien = f + 1;
          }
          if (finLien !== -1) {
            r.push({ debut: i, fin: i + 1, par: '' });
            r.push({ debut: f, fin: finLien, par: '', traine: contenu.slice(f + 1, finLien) });
            sauts.set(f, finLien);
          }
        }
        i++;
        continue;
      }
      if (mdx && c === '{') {
        const f = fermant(contenu, i, b, '{', '}');
        if (f !== -1) {
          const v = constanteDeSource(contenu.slice(i + 1, f));
          if (v !== undefined) r.push({ debut: i, fin: f + 1, par: v });
          i = f + 1;
          continue;
        }
      }
      i++;
    }
  }
  return r;
}

/** L'affichage d'une expression MDX : vide ou commentaire seul → rien ; constante → sa valeur. */
function constanteDeSource(expression: string): string | undefined {
  if (expression.replace(/\/\*[\s\S]*?\*\//g, '').trim() === '') return '';
  const sf = ts.createSourceFile(
    'x.tsx',
    `(${expression}\n)`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );
  const [instruction] = sf.statements;
  if (sf.statements.length !== 1 || instruction === undefined) return undefined;
  if (!ts.isExpressionStatement(instruction)) return undefined;
  const vus = affichagesPossibles(instruction.expression, SANS_CONTEXTE());
  return vus?.length === 1 ? vus[0] : undefined;
}

/**
 * LE rendu d'un fichier, ligne pour ligne — la seule découpe des deux gardes. `chemin` décide de
 * ce qui se rend : c'est l'extension qui dit si `**` est une emphase ou une multiplication.
 * GOV-106 : la structure d'abord, par l'arbre (JSX ou Markdown), puis les caractères.
 */
export function lignesRendues(chemin: string, contenu: string): string[] {
  const markdown = /\.mdx?$/.test(chemin);
  const retouches = markdown
    ? retouchesMarkdown(contenu, /\.mdx$/.test(chemin))
    : /\.(tsx|jsx)$/.test(chemin)
      ? retouchesJsx(chemin, contenu)
      : [];
  const effacables = effacablesPour(chemin);
  const rendre = (choisies: Retouche[]): string[] => {
    const rendu = choisies.length > 0 ? appliquerRetouches(contenu, choisies) : contenu;
    let dansUnBloc = false;
    return rendu.split('\n').map((ligne) => {
      if (markdown && /^\s{0,3}(```|~~~)/.test(ligne)) {
        dansUnBloc = !dansUnBloc;
        return ligne.replace(INVISIBLES, '');
      }
      if (dansUnBloc) return ligne.replace(INVISIBLES, '');
      if (!markdown) return rendreFragment(ligne, effacables);
      return morceauxMarkdown(ligne)
        .map(([t, code]) => (code ? t.replace(INVISIBLES, '') : rendreFragment(t, effacables)))
        .join('');
    });
  };
  // GOV-109 : une retouche à plusieurs affichages possibles (une condition inconnue entre des
  // branches constantes) fait rendre le fichier une fois par affichage ; la ligne rendue les porte
  // tous, séparés par une barre — un SÉPARATEUR DE SEGMENT : la négation d'une variante n'exempte
  // pas l'autre. Les retouches d'une MÊME ligne rendue se combinent : leurs affichages sont pris en
  // PRODUIT (refus de la lentille `exactitude`, PR #267 : deux ternaires voisins portant chacun une
  // moitié d'un terme ne rendaient que les paires de même rang). Au-delà du plafond, une ligne
  // retombe sur un affichage par rendu : ⚠️ LIMITE DÉCLARÉE dans l'en-tête.
  const multiples = retouches.filter((r) => (r.variantes?.length ?? 0) > 0);
  if (multiples.length === 0) return rendre(retouches);
  const ligneDe = new Map<Retouche, number>();
  appliquerRetouches(contenu, retouches, ligneDe);
  const parLigne = new Map<number, Retouche[]>();
  for (const r of multiples) {
    const l = ligneDe.get(r) ?? -1;
    parLigne.set(l, [...(parLigne.get(l) ?? []), r]);
  }
  /** Pour chaque ligne : la liste des combinaisons (un affichage par retouche de la ligne). */
  const combinaisons = [...parLigne.values()].map((groupe) => {
    const affichages = groupe.map((r) => [r.par, ...(r.variantes ?? [])]);
    const tout = produit(affichages);
    if (tout !== undefined) return { groupe, choix: tout as unknown as string[][] };
    const tours = Math.max(...affichages.map((x) => x.length));
    return {
      groupe,
      choix: Array.from({ length: tours }, (_, k) =>
        affichages.map((x) => x[Math.min(k, x.length - 1)]!)
      ),
    };
  });
  const tours = Math.max(1, ...combinaisons.map((c) => c.choix.length));
  const rendus = Array.from({ length: tours }, (_, k) => {
    const par = new Map<Retouche, string>();
    for (const { groupe, choix } of combinaisons) {
      const c = choix[Math.min(k, choix.length - 1)]!;
      groupe.forEach((r, i) => par.set(r, c[i]!));
    }
    return rendre(retouches.map((r) => (par.has(r) ? { ...r, par: par.get(r)! } : r)));
  });
  return rendus[0]!.map((_, i) => [...new Set(rendus.map((l) => l[i]!))].join(' | '));
}

// ── la vue et le contrôle ────────────────────────────────────────────────────

export type FichierVu = { chemin: string; contenu: string };
export type CompteMotif = { motif: string; nombre: number; attendu: boolean };
export type Vue = {
  fichiers: FichierVu[];
  comptes: CompteMotif[];
  exceptions: readonly ExceptionLexicale[];
};

export type Faute = { famille: string; message: string };
export type GenreExemption = 'denegation' | 'citation' | 'porteur' | 'exception' | 'chaine_nommee';
export type Exemption = { genre: GenreExemption; chemin: string; ligne: number; forme: string };
export type Rapport = { fautes: Faute[]; exemptions: Exemption[]; occurrences: number };

/** Les familles que `--prove` doit couvrir : celles du lexique, plus les deux structurelles. */
export const FAMILLES_STRUCTURELLES = [
  {
    nom: 'perimetre_vide',
    explication:
      "un motif qui devait avoir des cibles n'en a plus : la garde ne balaie rien et rend « ✅ ».",
  },
  {
    nom: 'exception_sans_justification',
    explication:
      'une exception posée sans justification, sans référence, sans date, ou sur une forme inconnue.',
  },
] as const;

export const FAMILLES: { nom: string; explication: string }[] = [
  ...LEXIQUE_INTERDIT.map((f) => ({ nom: f.nom, explication: `${f.portee} — ${f.pourquoi}.` })),
  {
    nom: LISTE_NOIRE_GABARIT.nom,
    explication: `${MOTIF_GABARIT.nom}, absolue — ${LISTE_NOIRE_GABARIT.pourquoi}.`,
  },
  ...FAMILLES_STRUCTURELLES.map((f) => ({ nom: f.nom, explication: f.explication })),
];

const FORMES_CONNUES = new Set(toutesLesFormes());

function messageDeFaute(
  chemin: string,
  n: number,
  ligne: string,
  index: number,
  vu: string,
  famille: FamilleInterdite
): string {
  const debut = Math.max(0, index - 36);
  const extrait = ligne.slice(debut, index + vu.length + 36).trim();
  const remplacement = famille.aDireALaPlace
    ? ` Le terme à écrire est « ${famille.aDireALaPlace} ».`
    : '';
  const canoniques =
    famille.nom === 'droit_social'
      ? ` Les trois noms canoniques sont : ${Object.values(TERMES_CANONIQUES).join(', ')}.`
      : '';
  return (
    `${chemin}:${n} — usage prescriptif de « ${vu} » [${famille.nom}, ${famille.reqs.join(' ')}]. ` +
    `Tournure vue : « ${extrait} ». Pourquoi c'est refusé : ${famille.pourquoi}.${remplacement}${canoniques} ` +
    `Si l'usage est dénégatif, écris-le comme tel (« aucun objectif », « ni quota ni classement ») : ` +
    `la garde laisse passer la négation, c'est elle qui protège. Sinon, déclare une exception ` +
    `justifiée ligne à ligne dans EXCEPTIONS_DECLAREES (REQ-GOV-017).`
  );
}

/** Le contrôle d'un fichier — le seul endroit où une tournure est jugée. */
export function analyserFichier(f: FichierVu, exceptions: readonly ExceptionLexicale[]): Rapport {
  const porteur = (PORTEURS_DU_LEXIQUE as readonly string[]).includes(f.chemin);
  const portee = porteeDuFichier(f.chemin);
  if (!porteur && portee === null) return { fautes: [], exemptions: [], occurrences: 0 };

  // Un porteur est jugé sur TOUTES les familles : c'est ce qui permet de vérifier que son
  // exemption sert vraiment, au lieu de le voir vert parce qu'il est hors périmètre.
  const familles = famillesPourPortee(portee ?? 'apporteur');
  const prose = /\.md$/.test(f.chemin);

  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  let occurrences = 0;

  // GOV-071 : le terme se cherche dans ce que le lecteur VOIT, pas dans la source.
  lignesRendues(f.chemin, f.contenu).forEach((ligne, i) => {
    const citees = prose ? zonesCitees(ligne) : [];
    for (const famille of familles) {
      for (const forme of famille.formes) {
        const reg = motifDeLaForme(forme);
        let m: RegExpExecArray | null;
        while ((m = reg.exec(ligne)) !== null) {
          occurrences += 1;
          const index = m.index;
          const genre: GenreExemption | null = porteur
            ? 'porteur'
            : exceptions.some((e) => e.chemin === f.chemin && e.forme === forme)
              ? 'exception'
              : citees.some(([a, b]) => index >= a && index < b)
                ? 'citation'
                : estDenegation(ligne.slice(0, index))
                  ? 'denegation'
                  : null;
          if (genre !== null) {
            exemptions.push({ genre, chemin: f.chemin, ligne: i + 1, forme });
            continue;
          }
          fautes.push({
            famille: famille.nom,
            message: messageDeFaute(f.chemin, i + 1, ligne, index, m[1] ?? forme, famille),
          });
        }
      }
    }
  });

  return { fautes, exemptions, occurrences };
}

const apostrophe = (s: string): string => s.replace(/’/g, "'");

/**
 * Le contrôle d'un fichier du gabarit de contrat : la liste noire, ABSOLUE. Une occurrence n'est
 * exemptée que si elle tombe DANS l'une des chaînes verbatim que la SSOT nomme pour sa forme.
 */
export function analyserGabarit(f: FichierVu): Rapport {
  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  let occurrences = 0;
  // GOV-071 : la liste noire du gabarit se juge, elle aussi, sur le rendu.
  lignesRendues(f.chemin, f.contenu).forEach((brute, i) => {
    const ligne = apostrophe(brute);
    for (const forme of LISTE_NOIRE_GABARIT.formes) {
      const reg = motifDeLaForme(forme);
      let m: RegExpExecArray | null;
      while ((m = reg.exec(ligne)) !== null) {
        occurrences += 1;
        const debut = m.index;
        const nommee = LISTE_NOIRE_GABARIT.chainesNommees.some((c) => {
          if (c.forme !== forme) return false;
          const texte = apostrophe(c.texte);
          for (let j = ligne.indexOf(texte); j !== -1; j = ligne.indexOf(texte, j + 1)) {
            if (debut >= j && debut < j + texte.length) return true;
          }
          return false;
        });
        if (nommee) {
          exemptions.push({ genre: 'chaine_nommee', chemin: f.chemin, ligne: i + 1, forme });
          continue;
        }
        fautes.push({
          famille: LISTE_NOIRE_GABARIT.nom,
          message:
            `${f.chemin}:${i + 1} — « ${m[1] ?? forme} » dans le gabarit de contrat ` +
            `[${LISTE_NOIRE_GABARIT.nom}, ${LISTE_NOIRE_GABARIT.reqs.join(' ')}]. La liste noire du ` +
            `gabarit est ABSOLUE : ni la négation ni la citation ne l'exemptent. Pourquoi : ` +
            `${LISTE_NOIRE_GABARIT.pourquoi}.`,
        });
      }
    }
  });
  return { fautes, exemptions, occurrences };
}

export function controler(vue: Vue): Rapport {
  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  let occurrences = 0;

  // Les exceptions se jugent AVANT le texte : une exception molle ouvre un trou permanent.
  for (const e of vue.exceptions) {
    const manques: string[] = [];
    if (e.justification.trim().length < 20) manques.push('une justification en une phrase');
    if (e.reference.trim() === '') manques.push('une référence qualifiée (RM-12)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.poseeLe)) manques.push('une date AAAA-MM-JJ');
    if (!FORMES_CONNUES.has(e.forme))
      manques.push(`une forme connue de la SSOT (« ${e.forme} » ne l'est pas)`);
    if (manques.length > 0) {
      fautes.push({
        famille: 'exception_sans_justification',
        message:
          `EXCEPTIONS_DECLAREES — l'exception sur « ${e.forme} » dans ${e.chemin} n'a pas ` +
          `${manques.join(', ni ')}. REQ-GOV-017 exige des exceptions « justifiées ligne à ligne » : ` +
          `sans justification, ce n'est pas une exception, c'est un trou que personne ne rouvrira.`,
      });
    }
  }

  for (const c of vue.comptes) {
    if (c.attendu && c.nombre === 0) {
      fautes.push({
        famille: 'perimetre_vide',
        message:
          `${c.motif} — aucun fichier balayé, alors que ce motif doit en avoir. Une garde qui ne ` +
          `lit rien rend « ✅ » sans rien garder. Vérifie que les fichiers sont SUIVIS par git ` +
          `(« git ls-files » est la seule source) ou corrige le motif dans MOTIFS.`,
      });
    }
  }

  for (const f of vue.fichiers) {
    const r = MOTIF_GABARIT.reg.test(f.chemin)
      ? analyserGabarit(f)
      : analyserFichier(f, vue.exceptions);
    fautes.push(...r.fautes);
    exemptions.push(...r.exemptions);
    occurrences += r.occurrences;
  }

  return { fautes, exemptions, occurrences };
}

// ── la vue du dépôt (fichiers SUIVIS par git, et rien d'autre) ────────────────

/**
 * 🔴 Le périmètre vient désormais d’UNE source unique qui REFUSE au lieu de rendre `[]`.
 * Cette fonction portait un `try/catch { return [] }` — recopié à l’identique dans CINQ gardes —
 * et rendait la garde d’argent VERTE sur ZÉRO fichier dans un dépôt sans `.git`, dépôt PUBLIC.
 * La mesure est dans `scripts/lot/fichiers-suivis.ts`.
 */
export function fichiersSuivis(): string[] {
  return fichiersSuivisOuRefus('gov:lexique');
}

export function vueDuDepot(): Vue {
  const suivis = fichiersSuivis();
  const retenus = suivis.filter(
    (c) =>
      (porteeDuFichier(c) !== null ||
        MOTIF_GABARIT.reg.test(c) ||
        (PORTEURS_DU_LEXIQUE as readonly string[]).includes(c)) &&
      existsSync(c)
  );
  return {
    fichiers: retenus.map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') })),
    comptes: [...MOTIFS, MOTIF_GABARIT].map((m) => ({
      motif: m.nom,
      nombre: suivis.filter((c) => m.reg.test(c)).length,
      attendu: m.attendu,
    })),
    exceptions: EXCEPTIONS_DECLAREES,
  };
}

// ── la fixture de la preuve (RM-11 : elle ne lit rien du dépôt) ───────────────

/** Des comptes conformes : chaque motif attendu a une cible. La preuve ne juge que le texte. */
const COMPTES_CONFORMES: CompteMotif[] = [...MOTIFS, MOTIF_GABARIT].map((m) => ({
  motif: m.nom,
  nombre: m.attendu ? 1 : 0,
  attendu: m.attendu,
}));

/**
 * Une vue de FIXTURE : des comptes conformes, et le texte qu'on veut juger. Exportée parce que
 * `tests/unit/gouvernance/lexique.spec.ts` en a besoin, et qu'un test qui reconstruirait la vue
 * à sa façon jugerait autre chose que la gate (RM-01).
 */
export function vueDeFixture(
  fichiers: FichierVu[],
  exceptions: readonly ExceptionLexicale[] = []
): Vue {
  return { fichiers, comptes: COMPTES_CONFORMES, exceptions };
}

const vue = vueDeFixture;

export const ADR = (contenu: string): FichierVu => ({ chemin: 'docs/adr/9999-temoin.md', contenu });
export const ESPACE = (contenu: string): FichierVu => ({
  chemin: 'src/app/(espace)/tableau.tsx',
  contenu,
});
export const MICRO = (contenu: string): FichierVu => ({
  chemin: 'micro-copy/espace.json',
  contenu,
});
export const COURRIEL = (contenu: string): FichierVu => ({
  chemin: 'emails/apporteur/message.tsx',
  contenu,
});
export const CONTRAT = (contenu: string): FichierVu => ({
  chemin: 'docs/contrat/CONTRAT-APPORTEUR-V1.md',
  contenu,
});

/** L'article 19 du gabarit, VERBATIM : les deux seules chaînes où « renonciation » a sa place. */
const ARTICLE_19 = LISTE_NOIRE_GABARIT.chainesNommees.map((c) => c.texte).join('\n\n');

/**
 * La phrase de l'ADR « valeurs du monde réel », VERBATIM. C'est le contre-témoin le plus
 * important du fichier : si elle rougit, la garde force à retirer la phrase qui protège — celle
 * qui dit que les trois pouvoirs ne sont pas réunis.
 *
 * ⚠️ L'ADR EST DÉSIGNÉ PAR SON TITRE, ET PAS PAR SON NUMÉRO. Il est écrit dans un lot voisin et
 * n'est pas encore dans ce dépôt : `gov:adr`, famille `reference_sans_cible`, refuse — à juste
 * titre — une référence qualifiée qui ne résout pas, et sept d'entre elles ont fait rougir cette
 * garde-là avant d'être retirées d'ici. Quand l'ADR aura atterri sur `main`, ces mentions
 * pourront redevenir des références qualifiées ; jusque-là, une référence morte serait pire
 * qu'un titre.
 *
 * ⚠️ UN MOT Y EST NEUTRALISÉ, ET C'EST VOULU. Le premier membre de phrase de l'ADR NOMME le
 * risque juridique ; REQ-GOV-031 (dépôt PUBLIC, décision W13) refuse ce mot dans tout fichier
 * suivi hors `docs/contrat/**`, et `gov:publication` le fait rougir. Il est donc remplacé par
 * « […] ». Ce membre de phrase ne porte AUCUN terme du lexique : son retrait ne change rien à ce
 * que cette garde-ci juge — les quatre « aucun » sont intacts, et ce sont eux qui sont éprouvés.
 */
export const PHRASE_VALEURS_DU_MONDE_REEL =
  "Elle est neutre au regard de la […], et c'est ce qui permet de la retenir : elle " +
  "n'institue aucun mandat, aucun objectif, aucun quota, aucun compte rendu d'activité.";

/** Un extrait FIDÈLE de la SSOT : elle écrit les termes en clair, c'est son travail. */
const EXTRAIT_SSOT = [
  "    formes: ['commercial', 'commerciale', 'commerciaux', 'commerciales'],",
  "    formes: ['objectif', 'objectifs'],",
  "    formes: ['quota', 'quotas'],",
  "    formes: ['classement', 'classements'],",
].join('\n');

/** Un témoin par famille du lexique, chacun dans un fichier de sa portée. */
const TEMOINS: { famille: string; quoi: string; vue: () => Vue }[] = [
  {
    famille: 'commercial',
    quoi: 'un ADR qui parle des commerciaux du réseau',
    vue: () => vue([ADR('Le tableau de bord des commerciaux affiche le chiffre du mois.')]),
  },
  {
    famille: 'objectif',
    quoi: 'la fixtureRouge du registre : un libellé « objectif du mois » en micro-copy',
    vue: () => vue([MICRO('{ "entete": "objectif du mois" }')]),
  },
  {
    famille: 'quota',
    quoi: 'un quota trimestriel annoncé dans un ADR',
    vue: () => vue([ADR('Chaque apporteur reçoit un quota trimestriel.')]),
  },
  {
    famille: 'classement',
    quoi: 'un classement des apporteurs',
    vue: () => vue([ADR('Le classement des apporteurs est publié chaque lundi.')]),
  },
  {
    famille: 'palmares',
    quoi: 'un rang et un niveau restitués dans l’espace',
    vue: () => vue([ESPACE('<p>Vous êtes au rang 3 du niveau argent</p>')]),
  },
  {
    famille: 'mesure_de_performance',
    quoi: 'un taux de transformation restitué à celui qu’on mesure',
    vue: () => vue([MICRO('{ "resume": "Votre taux de transformation ce trimestre" }')]),
  },
  {
    famille: 'injonction',
    quoi: 'un e-mail qui donne une consigne de méthode',
    vue: () => vue([COURRIEL('<p>Vous devez déposer une affaire avant le 30.</p>')]),
  },
  {
    famille: 'subordination',
    quoi: 'un manager et un avertissement',
    vue: () => vue([COURRIEL('<p>Votre manager vous a adressé un avertissement.</p>')]),
  },
  {
    famille: 'droit_social',
    quoi: 'un document mensuel intitulé comme un document de paie',
    vue: () => vue([COURRIEL('<h1>Votre bulletin de commission du mois de mars</h1>')]),
  },
  {
    famille: 'jargon_interne',
    quoi: 'le mot du schéma dans la micro-copie de l’espace (REQ-UX-003)',
    vue: () =>
      vue([
        {
          chemin: 'src/content/micro-copy/espace/temoin.ts',
          contenu: "  titre: 'Votre attribution court jusqu’au {dateFin}',",
        },
      ]),
  },
  // JUR-T13 (REQ-JUR-012, REQ-JUR-013) — les trois familles de la charte relationnelle, texte d'A07.
  {
    famille: 'challenge',
    quoi: 'un challenge entre apporteurs annoncé dans l’espace (REQ-JUR-012)',
    vue: () => vue([MICRO('{ "bandeau": "Le challenge d’octobre est lancé" }')]),
  },
  {
    famille: 'formation_exigee',
    quoi: 'un webinaire présenté comme une condition, dans un courriel (REQ-JUR-013)',
    vue: () => vue([COURRIEL('<p>Votre webinaire requis a lieu jeudi.</p>')]),
  },
  {
    famille: 'inactivite_sanctionnee',
    quoi: 'une conséquence attachée à l’inactivité de l’apporteur (REQ-JUR-039)',
    vue: () => vue([ESPACE('<p>Votre compte suspendu sera rouvert sur demande.</p>')]),
  },
  {
    famille: LISTE_NOIRE_GABARIT.nom,
    quoi: "un art. 11.3 « amélioré » qui renonce à l'indemnité de clientèle",
    vue: () =>
      vue([CONTRAT("**11.3** L'Apporteur renonce à l'indemnité de clientèle (L.134-12).")]),
  },
  {
    famille: 'perimetre_vide',
    quoi: 'un motif attendu qui ne balaie plus rien',
    vue: () => ({
      fichiers: [],
      comptes: [...MOTIFS, MOTIF_GABARIT].map((m) => ({
        motif: m.nom,
        nombre: 0,
        attendu: m.attendu,
      })),
      exceptions: [],
    }),
  },
  {
    famille: 'exception_sans_justification',
    quoi: 'une exception posée sans phrase, sans référence et sans date',
    vue: () =>
      vue(
        [],
        [
          {
            chemin: 'docs/adr/9999-temoin.md',
            forme: 'objectif',
            justification: 'ok',
            reference: '',
            poseeLe: 'hier',
          },
        ]
      ),
  },
];

/**
 * LES POSITIONS LIMITES — la leçon de `gov:identifiants`, qui reste verte sur le texte qu'elle
 * condamne parce que ses témoins n'éprouvent que le milieu d'une phrase. Chacune de ces huit
 * lignes DOIT rougir.
 */
export const TEMOINS_POSITIONS: { position: string; ligne: string }[] = [
  { position: 'début de ligne', ligne: 'objectif du mois : cinq dossiers' },
  { position: 'fin de phrase, collé au point', ligne: 'Le tableau affiche votre objectif.' },
  { position: 'avant une virgule', ligne: 'Le tableau affiche votre objectif, puis le solde' },
  {
    position: 'avant une parenthèse fermante',
    ligne: 'Le tableau affiche le solde (et votre objectif)',
  },
  { position: 'en gras', ligne: 'Le tableau affiche **objectif du mois** en tête' },
  { position: 'cellule de tableau Markdown', ligne: '| Colonne | objectif du mois | 12 |' },
  { position: 'tête de liste', ligne: '- objectif du mois' },
  { position: 'titre', ligne: '## Objectif du mois' },
];

/**
 * LES CONTRÔLES POSITIFS — un vert ne vaut que si l'on sait que la sonde MESURE. Chacune de ces
 * vues est la MUTATION d'un contre-témoin vert, et doit rougir : sans eux, « aucune faute »
 * pourrait vouloir dire « je n'ai rien regardé ».
 */
const CONTROLES_POSITIFS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi:
      "la phrase de l'ADR « valeurs du monde réel » privée de ses négations — le même texte, " +
      'sans ce qui protège',
    vue: () =>
      vue([
        ADR(
          'Elle est neutre au regard de la […] : elle institue un mandat, un objectif ' +
            'du mois, un quota trimestriel.'
        ),
      ]),
  },
  {
    quoi: "le texte de la SSOT déplacé hors de ses porteurs — c'est bien l'exemption qui le sauvait",
    vue: () => vue([{ chemin: 'docs/adr/9998-copie.md', contenu: EXTRAIT_SSOT }]),
  },
  {
    quoi: "un fichier hors périmètre ramené dans le périmètre — c'est bien la portée qui le sauvait",
    vue: () => vue([ADR('Le classement des apporteurs sera publié.')]),
  },
  {
    quoi: "la phrase de l'art. 19 retouchée d'un mot : l'exemption est VERBATIM, pas « l'article 19 »",
    vue: () =>
      vue([
        CONTRAT(
          "Le fait de ne pas se prévaloir d'une stipulation ne vaut jamais renonciation à s'en prévaloir."
        ),
      ]),
  },
  {
    quoi: 'une renonciation NIÉE dans le gabarit : la liste noire ne connaît pas la dénégation',
    vue: () => vue([CONTRAT("**11.3** L'Apporteur ne renonce à aucune indemnité.")]),
  },
  {
    quoi: 'une citation devenue un libellé : les guillemets ne sauvent pas la micro-copy',
    vue: () => vue([MICRO('{ "entete": "« objectif du mois »" }')]),
  },
];

/**
 * LES CONTRE-TÉMOINS — ils comptent autant que les témoins. `minimumExemptions` interdit le vert
 * muet : un contre-témoin qui ne produit AUCUNE occurrence ne prouve rien, il ne fait que ne rien
 * contenir.
 */
const CONTRE_TEMOINS: {
  quoi: string;
  vue: () => Vue;
  genre: GenreExemption | null;
  minimumExemptions: number;
}[] = [
  {
    quoi: "l'ADR « valeurs du monde réel », VERBATIM — « aucun objectif, aucun quota »",
    vue: () => vue([ADR(PHRASE_VALEURS_DU_MONDE_REEL)]),
    genre: 'denegation',
    minimumExemptions: 2,
  },
  {
    quoi: 'une négation « ni … ni … »',
    vue: () => vue([ADR('Le contrat ne connaît ni quota ni classement ni objectif.')]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: 'une dénégation verbale : « ne fixe aucun objectif »',
    vue: () => vue([ADR('La Société ne fixe aucun objectif et ne mesure aucun quota.')]),
    genre: 'denegation',
    minimumExemptions: 2,
  },
  {
    quoi: "une définition par la négative : « ce n'est pas un objectif »",
    vue: () => vue([ADR("Le seuil de versement n'est pas un objectif.")]),
    genre: 'denegation',
    minimumExemptions: 1,
  },
  {
    quoi: 'une CITATION entre guillemets, dans de la prose',
    vue: () => vue([ADR('Le mot « classement » figure au registre du vocabulaire fermé.')]),
    genre: 'citation',
    minimumExemptions: 1,
  },
  {
    quoi: 'une citation entre accents graves, dans de la prose',
    vue: () => vue([ADR('La famille `objectif` couvre deux formes fléchies.')]),
    genre: 'citation',
    minimumExemptions: 1,
  },
  {
    quoi: 'le texte de la SSOT elle-même, à son chemin réel',
    vue: () => vue([{ chemin: PORTEURS_DU_LEXIQUE[0], contenu: EXTRAIT_SSOT }]),
    genre: 'porteur',
    minimumExemptions: 4,
  },
  {
    quoi: "l'espace qui dénie tout palmarès : « aucun classement, aucun rang, aucun niveau »",
    vue: () =>
      vue([ESPACE("<p>L'espace n'affiche aucun classement, aucun rang, aucun niveau.</p>")]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: 'le relevé de commissions qui se démarque du vocabulaire de la paie',
    vue: () =>
      vue([
        COURRIEL(
          "Le relevé de commissions n'est pas un bulletin de paie : il ne porte ni brut, ni net à payer."
        ),
      ]),
    genre: 'denegation',
    minimumExemptions: 3,
  },
  {
    quoi: "l'article 19 du gabarit, VERBATIM — titre et phrase",
    vue: () => vue([CONTRAT(ARTICLE_19)]),
    genre: 'chaine_nommee',
    minimumExemptions: 2,
  },
  {
    quoi: 'une exception déclarée, justifiée, référencée et datée',
    vue: () =>
      vue(
        [ADR('Le classement des apporteurs, hérité du document source, est cité tel quel.')],
        [
          {
            chemin: 'docs/adr/9999-temoin.md',
            forme: 'classement',
            justification:
              "citation littérale du document d'origine, conservée pour la traçabilité",
            reference: 'REQ-GOV-017',
            poseeLe: '2026-09-05',
          },
        ]
      ),
    genre: 'exception',
    minimumExemptions: 1,
  },
];

/**
 * Les contre-témoins qui doivent rester verts SANS produire d'exemption : ils prouvent que la
 * garde ne mord pas sur des mots qui CONTIENNENT une forme, ni hors de son périmètre.
 */
const CONTRE_TEMOINS_MUETS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi: 'des mots qui contiennent une forme sans en être une (topologie, brutale, primeur)',
    vue: () =>
      vue([ESPACE('<p>La topologie du réseau, une rupture brutale, un primeur imprimé.</p>')]),
  },
  {
    quoi: 'un fichier hors périmètre : le registre des exigences ÉCRIT les mots interdits',
    vue: () =>
      vue([
        { chemin: 'docs/REQUIREMENTS.md', contenu: 'objectif du mois, quota de vente, classement' },
      ]),
  },
  {
    quoi: 'un ADR interne qui emploie « niveau » — mot courant, refusé seulement côté apporteur',
    vue: () => vue([ADR('Le stub est décidé au niveau du singleton, pas au niveau de la page.')]),
  },
];

// ── exécution ────────────────────────────────────────────────────────────────

/**
 * Le fichier est IMPORTÉ par `tests/unit/gouvernance/lexique.spec.ts` autant qu'il est lancé en
 * ligne de commande. Sans cette garde, l'import exécuterait le contrôle et son `process.exit(0)` :
 * « process.exit unexpectedly called with "0" », et pas un seul test collecté. Même parade que
 * `schema-enums.ts` et `gov-depot.ts`.
 */
const APPELE_DIRECTEMENT = /lexique-apporteurs\.ts$/.test(process.argv[1] ?? '');

function echouer(message: string): never {
  console.error(message);
  process.exit(1);
}

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = FAMILLES.map((f) => f.nom).filter(
      (n) => !TEMOINS.some((t) => t.famille === n)
    );
    if (sansTemoin.length > 0) {
      echouer(
        `❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}. Une famille sans témoin n'est pas prouvée.`
      );
    }

    for (const t of TEMOINS) {
      const rougies = controler(t.vue()).fautes.map((f) => f.famille);
      if (!rougies.includes(t.famille)) {
        echouer(
          `❌ Le témoin de « ${t.famille} » (${t.quoi}) n'a PAS fait rougir sa famille ` +
            `(rougies : ${rougies.join(', ') || 'aucune'}).`
        );
      }
    }

    for (const p of TEMOINS_POSITIONS) {
      const r = controler(vue([ADR(p.ligne)]));
      if (r.fautes.length === 0) {
        echouer(
          `❌ Position « ${p.position} » NON couverte : « ${p.ligne} » n'a rien fait rougir. ` +
            `C'est exactement le défaut de gov:identifiants — une garde verte sur le texte qu'elle condamne.`
        );
      }
    }

    for (const c of CONTROLES_POSITIFS) {
      if (controler(c.vue()).fautes.length === 0) {
        echouer(
          `❌ Contrôle positif muet : « ${c.quoi} » aurait dû rougir. Un contre-témoin vert ne ` +
            `prouve rien tant qu'on n'a pas montré que la sonde MESURE.`
        );
      }
    }

    for (const c of CONTRE_TEMOINS) {
      const r = controler(c.vue());
      if (r.fautes.length > 0) {
        echouer(
          `❌ Faux positif sur « ${c.quoi} » : la garde est trop large, et elle forcerait à retirer ` +
            `le texte qui protège.\n   ${r.fautes[0]!.message}`
        );
      }
      const duGenre = r.exemptions.filter((e) => c.genre === null || e.genre === c.genre);
      if (duGenre.length < c.minimumExemptions) {
        echouer(
          `❌ Vert MUET sur « ${c.quoi} » : ${duGenre.length} exemption(s) « ${c.genre} » pour ` +
            `${c.minimumExemptions} attendue(s). Le vert ne vient donc pas de la tournure, mais de ce ` +
            `que la garde n'a rien vu — indiscernable d'une sonde débranchée.`
        );
      }
    }

    for (const c of CONTRE_TEMOINS_MUETS) {
      const r = controler(c.vue());
      if (r.fautes.length > 0) {
        echouer(`❌ Faux positif sur « ${c.quoi} ».\n   ${r.fautes[0]!.message}`);
      }
    }

    console.log(
      `✅ gov:lexique — ${FAMILLES.length} familles rougissent chacune sur son témoin, ` +
        `${TEMOINS_POSITIONS.length} positions limites rougissent, ` +
        `${CONTROLES_POSITIFS.length} contrôles positifs rougissent, ` +
        `${CONTRE_TEMOINS.length + CONTRE_TEMOINS_MUETS.length} contre-témoins restent verts ` +
        `(dont la phrase de l'ADR « valeurs du monde réel », verbatim) — preuve faite.`
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  const vueComplete = vueDuDepot();
  // GOV-160 : sur une PR, seuls les fichiers de la PR sont jugés ; les comptes de motifs restent
  // mesurés sur tout le dépôt suivi.
  const retenus = new Set(restreindreALaPr(vueComplete.fichiers.map((f) => f.chemin)));
  const vueReelle = {
    ...vueComplete,
    fichiers: vueComplete.fichiers.filter((f) => retenus.has(f.chemin)),
  };
  const rapport = controler(vueReelle);
  const detail = vueReelle.comptes
    .map((c) => `${c.motif} : ${c.nombre}${c.attendu ? ' (attendu)' : ''}`)
    .join(' · ');

  if (rapport.fautes.length === 0) {
    const parGenre = (g: GenreExemption): number =>
      rapport.exemptions.filter((e) => e.genre === g).length;
    console.log(
      `✅ gov:lexique — ${vueReelle.fichiers.length} fichier(s) balayé(s) sur ${MOTIFS.length + 1} motifs ` +
        `[${detail}] ; ${LEXIQUE_INTERDIT.length} familles et ${FORMES_CONNUES.size} formes appliquées, ` +
        `plus la liste noire du gabarit (${LISTE_NOIRE_GABARIT.formes.length} formes, absolue) ; ` +
        `${rapport.occurrences} occurrence(s) vue(s), dont ${rapport.exemptions.length} exemptée(s) ` +
        `(dénégation : ${parGenre('denegation')}, citation : ${parGenre('citation')}, ` +
        `porteur : ${parGenre('porteur')}, exception : ${parGenre('exception')}, ` +
        `chaîne nommée : ${parGenre('chaine_nommee')}) ; aucun usage prescriptif.`
    );
    console.log(
      `   Seuls les fichiers SUIVIS par git sont lus : un fichier non suivi n'est lu par aucune garde.`
    );
    // Zéro occurrence admet DEUX lectures — « le périmètre n'en porte aucune » et « je ne mesure
    // rien ». Le décompte des motifs ci-dessus règle la première ; `--prove` règle la seconde, et
    // c'est pour cela qu'elle est une étape de CI à part entière, jamais un simple commentaire.
    if (rapport.occurrences === 0) {
      console.log(
        `   Aucune occurrence dans ce périmètre : que la garde MESURE se prouve par ` +
          `« pnpm gov:lexique:prove », pas par ce zéro.`
      );
    }
    process.exit(0);
  }

  console.error(
    `❌ gov:lexique — ${rapport.fautes.length} usage(s) du lexique interdit (REQ-GOV-017, REQ-JUR-037) ` +
      `sur ${vueReelle.fichiers.length} fichier(s) balayé(s) [${detail}] :\n`
  );
  rapport.fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
  if (rapport.fautes.length > 25) console.error(`   … et ${rapport.fautes.length - 25} autre(s).`);
  process.exit(1);
}
