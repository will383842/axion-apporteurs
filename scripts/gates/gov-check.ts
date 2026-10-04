/**
 * gov-check.ts — la garde des TERMES INTERDITS (GOV-030 ; REQ-DM-003, REQ-INT-004).
 *
 * USAGE : pnpm gov:termes-interdits          (juge le dépôt réel ; sort 1 sur faute)
 *         pnpm gov:termes-interdits:prove    (chaque témoin ROUGE, chaque contre-témoin VERT, sur
 *                                             une FIXTURE)
 *
 * ⚠️ CETTE GARDE S'EST APPELÉE `gov:check` AU REGISTRE — nom que GOV-000 y avait inscrit des mois
 * avant que ce script existe —, ET CE NOM DÉSIGNAIT AUSSI une CHAÎNE de dix-sept gardes dans
 * `package.json` qui ne la contenait pas. Elle imprimait `gov:check` dans son
 * rouge : un développeur a lu ce rouge, lancé la chaîne, obtenu dix-sept verts, et conclu à un aléa
 * de CI — pendant qu'un synonyme interdit montait jusqu'à une PR. `partners/ADR-0018` a retiré le
 * nom des DEUX côtés : l'entrée du registre porte `gov:termes-interdits`, qui EST la commande, et
 * tout ce que cette garde imprime en DÉRIVE (`ID_REGISTRE`). Un nom ambigu se retire, il ne se
 * réattribue pas : `pnpm gov:check` n'existe plus et échoue bruyamment au lieu de rendre des verts.
 *
 * ── CE QU'ELLE TIENT, ET D'OÙ CHAQUE VALEUR EST LUE (RM-01) ─────────────────────────────────
 *
 *   • `terme_axionia_invalide` — les modèles qu'axionia n'a pas (AFF-01 à AFF-03), LUS dans
 *     REQ-INT-004 (« aucun événement ne référence … ») et dans le glossaire (« des modèles
 *     supprimés d'axionia »).
 *   • `evenement_hors_nomenclature` — un nom d'événement refusé par le glossaire, là où
 *     REQ-INT-004 impose le français.
 *   • `evenement_litteral_hors_contrat` — un nom VALIDE (LU dans REQ-INT-004) écrit à la main hors
 *     de `packages/contracts`.
 *   • `synonyme_interdit_du_glossaire` — LU dans `docs/GLOSSAIRE.md` (`docs/PRESEANCE.md` §2).
 *   • `contenu_illisible` — un fichier sous une racine que la garde ne lit pas EN ENTIER (octet
 *     NUL, UTF-8 invalide, octets refusés par le disque) : « non lu » n'est pas « propre ».
 *   • `fin_de_ligne_non_lf` — un fichier sous une racine, ou une source, qu'un consommateur couperait
 *     sur d'autres lignes que la garde (voir l'exemption de citation, plus bas).
 *   • `source_illisible` (refus nommés, `REFUS_DE_CONCLURE`) et `perimetre_vide` — le refus de
 *     rendre un verdict qu'on n'a pas mesuré.
 *
 * Les listes littérales d'états occupants ne sont PAS ici : `partners/ADR-0011` en fait la seule
 * implémentation de `partners:schema:enums`. La sortie imprime les racines de cette garde que la
 * portée de cette famille ne couvre pas, DÉRIVÉES de `dansLaPorteeDesEtats` (`schema-enums.ts`).
 *
 * ── LE PÉRIMÈTRE, ET CE QUI EST RÉELLEMENT EXAMINÉ ──────────────────────────────────────────
 *
 * La vue porte TOUS les fichiers suivis, EN OCTETS — ceux du BLOB de l'index, pas du disque : un vert
 * local certifie alors ce que la CI extrait. Les racines sont LUES dans l'en-tête de
 * `docs/GLOSSAIRE.md`, plus `packages/contracts/` (seul endroit où un nom d'événement s'écrit :
 * sans cette racine, son exemption n'aurait aucun contre-témoin atteignable). `perimetreDeLaVue`
 * range chaque suivi sous une racine ou « hors périmètre ». `examiner` décode chaque fichier rangé,
 * quelle que soit son extension, et rend ce qu'il a RÉELLEMENT parcouru : chemin, racine, et, calculés
 * sur les lignes parcourues, octets et empreinte du texte. Les comptes imprimés viennent de là, pas de
 * la partition.
 *
 * ── L'EXEMPTION DE CITATION SE LIT SUR LA GRAMMAIRE ET LA POSITION ───────────────────────────
 *
 * CITER N'EST PAS SE SERVIR : un ADR doit pouvoir écrire le contre-exemple qu'il écarte.
 *
 * La POSITION se juge ligne par ligne, et une ligne est ce que LF termine (CRLF compris : son CR reste
 * en fin de ligne). Un consommateur qui coupe AILLEURS — CR seul pour PostgreSQL, Prisma et CommonMark,
 * U+2028 et U+2029 pour ECMAScript — verrait un commentaire ou une citation s'arrêter là où la garde
 * les prolonge : ce texte est REFUSÉ (`fin_de_ligne_non_lf`, règle `finDeLigneEtrangere` de
 * `schema-enums.ts`) avant tout calcul d'exemption. Le texte est découpé UNE fois, et les zones se
 * calculent sur ces lignes-là.
 *
 * La GRAMMAIRE est lue sur la DERNIÈRE extension du nom — ni l'avant-dernière, ni celle d'un dossier.
 * Seules les extensions de `GRAMMAIRES_QUI_CITENT` accordent une exemption — le registre les énumère,
 * la preuve confronte les deux — et chacune a un témoin de CHAQUE côté de sa frontière. La découpe est
 * UNE fonction, `decouper`, qui reconnaît les constructions VALIDES de chaque langage :
 *   — `.md` (prose, CommonMark) : les blocs d'abord — bloc clôturé (accents graves ou tildes, refermé
 *     par une clôture de même caractère, au moins aussi longue, sans info), titre, tableau, code
 *     indenté, paragraphe —, puis les spans de code DANS un paragraphe ou un titre : une suite de N
 *     accents graves se referme sur une suite d'exactement N, sur autant de lignes que le paragraphe
 *     en porte, jamais au-delà ; un accent grave échappé n'ouvre rien. Plus les guillemets français,
 *     sur leur ligne. Le guillemet droit ne cite pas ;
 *   — `.sql` (PostgreSQL) : les spans d'accents graves DANS un commentaire (deux tirets, bloc
 *     barre-étoile IMBRIQUÉ) ; les chaînes (apostrophes, `E'…'`, à dollars) et les identifiants entre
 *     guillemets sont reconnus pour qu'un marqueur de commentaire qu'ils portent n'ouvre RIEN ;
 *   — `.prisma` : les spans d'accents graves DANS un commentaire (double ou triple barre) ; une chaîne
 *     entre guillemets est reconnue, et le `//` d'une URL qu'elle porte n'ouvre rien.
 * Une construction jamais refermée n'est pas traversée : le fichier est refusé en la NOMMANT avec sa
 * ligne (`contenu_illisible`), et jugé SANS aucune exemption. La sortie imprime le compte des zones
 * réellement découpées. Toute autre extension — code, JSON, YAML, et toute extension non nommée —
 * n'exempte RIEN.
 *
 * ── LA PREUVE : SA POPULATION VIENT DU REGISTRE, SA DÉCISION EST UNE FONCTION PURE ───────────
 *
 * Le champ `verifie` de l'entrée `gov:termes-interdits` énumère les familles, les refus, les extensions qui
 * citent et l'identifiant de CHAQUE témoin. `decisionDeLaPreuve` confronte le code à cette
 * population dans les deux sens, n'accorde une clé qu'au témoin qui MORD (sa famille et son refus),
 * et rend le code de sortie ; `decisionDeLaGarde` fait de même pour le dépôt. La ligne de commande
 * n'imprime que ce qu'elles rendent. RM-11 : `--prove` ne juge que des vues INJECTÉES ; il ne lit du
 * dépôt que la déclaration de ce qu'il doit prouver.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entreesSuiviesOuRefus } from '../lot/fichiers-suivis';
import { blobsDe } from './gov-entite';
import {
  texteDeLaReq,
  RACINES_CODE,
  dansLaPorteeDesEtats,
  finDeLigneEtrangere,
} from './schema-enums';
import { TYPES_EVENEMENT } from '../../packages/contracts/events';

// ── le vocabulaire de la garde ───────────────────────────────────────────────

/**
 * Un fichier suivi, EN OCTETS — ceux du BLOB que l'index associe à son chemin ; `erreur` quand l'index
 * n'en rend pas (sous-module, entrée en conflit).
 */
type FichierVu = { chemin: string; octets: Uint8Array } | { chemin: string; erreur: string };
/** `refus` ne vaut que pour `source_illisible` : il NOMME lequel des refus a parlé. */
type Faute = { famille: string; message: string; refus?: RefusDeConclure };
/**
 * Ce que `examiner` a RÉELLEMENT parcouru : la racine qui l'a rangé, et, calculés sur les lignes
 * parcourues, les octets et l'EMPREINTE sha256 du texte — une taille égale ne dit rien d'octets remplacés.
 * `zones` : ce que la grammaire y a découpé, absent pour un fichier sans grammaire qui cite.
 */
type Examine = {
  chemin: string;
  racine: string;
  octets: number;
  empreinte: string;
  zones: Zone[] | undefined;
};

export type Vue = {
  /** Le texte de REQ-INT-004 — source des onze types valides et des modèles refusés. */
  reqInt004: string;
  /** `docs/GLOSSAIRE.md` — source primaire des synonymes interdits (`docs/PRESEANCE.md` §2). */
  glossaire: string;
  /** Les noms d'événements que `packages/contracts` publie. */
  typesDuContrat: readonly string[];
  /** Les racines jugées, LUES dans l'en-tête du glossaire. Vide = source illisible, pas « tout ». */
  racines: string[];
  /** TOUS les fichiers suivis. Le périmètre en est une partition (`perimetreDeLaVue`). */
  fichiers: FichierVu[];
};

export const FAMILLES: { nom: string; explication: string }[] = [
  {
    nom: 'source_illisible',
    explication:
      'une des sources (REQ-INT-004, le glossaire, le paquet de contrats) ne rend plus ce que la ' +
      'garde compare : elle ne sait plus à quoi confronter le dépôt. Chaque refus est nommé.',
  },
  {
    nom: 'perimetre_vide',
    explication:
      "aucun fichier à balayer : « 0 fichier » n'est pas « aucun défaut », c'est « je n'ai rien lu ».",
  },
  {
    nom: 'contenu_illisible',
    explication:
      'un fichier sous une racine que la garde ne lit pas en entier (octet NUL, UTF-8 invalide, ' +
      "octets que l'index ne rend pas), ou dont sa grammaire ne referme pas une construction (chaîne, " +
      "commentaire, chaîne à dollars) — NOMMÉE avec sa ligne : « non lu » n'est pas « propre ».",
  },
  {
    nom: 'fin_de_ligne_non_lf',
    explication:
      "un fichier sous une racine, ou une source, porte une fin de ligne autre que LF ou CRLF qu'un " +
      'consommateur coupe (CR seul, U+2028, U+2029) : un commentaire ou une citation y couvrirait la ligne suivante.',
  },
  {
    nom: 'terme_axionia_invalide',
    explication:
      "un modèle que le dossier de spécification prête à axionia et qui n'y existe pas (AFF-01 à AFF-03).",
  },
  {
    nom: 'evenement_hors_nomenclature',
    explication:
      "un nom d'événement que REQ-INT-004 ne nomme pas, là où l'exigence impose le français.",
  },
  {
    nom: 'evenement_litteral_hors_contrat',
    explication:
      "un nom d'événement VALIDE écrit à la main hors de `packages/contracts` : il doit être importé.",
  },
  {
    nom: 'synonyme_interdit_du_glossaire',
    explication: 'un terme que `docs/GLOSSAIRE.md` déclare interdit sans condition (REQ-GOV-016).',
  },
];

/**
 * Les refus de conclure de `source_illisible`, confrontés au registre comme `FAMILLES`. Le type
 * interdit d'émettre un refus sans l'inscrire ici — et l'inscrire ici l'expose à la confrontation.
 */
const REFUS_DE_CONCLURE = [
  'req_int_004_muette',
  'contrat_sans_evenement',
  'contrat_et_exigence_divergents',
  'glossaire_sans_synonyme',
  'racines_illisibles',
] as const;
type RefusDeConclure = (typeof REFUS_DE_CONCLURE)[number];

/** Le paquet de contrats — seul endroit où un nom d'événement s'écrit littéralement. */
const RACINE_CONTRATS = 'packages/contracts/';

/** Le glossaire : source des synonymes et des racines. */
const CHEMIN_GLOSSAIRE = 'docs/GLOSSAIRE.md';

/** L'entrée de registre qui déclare la population que `--prove` doit couvrir. */
const CHEMIN_REGISTRE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'gates.json'
);
export const ID_REGISTRE = 'gov:termes-interdits';

/** Un fichier suivi dont le contenu est ce texte, encodé en UTF-8 — la forme des fixtures. */
export function fichierTexte(chemin: string, texte: string): FichierVu {
  return { chemin, octets: new TextEncoder().encode(texte) };
}

// ── lectures pures : chaque liste vient de sa source ─────────────────────────

/** Les jetons entre accents graves d'un texte, dans l'ordre. */
function jetonsCites(texte: string): string[] {
  return [...texte.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
}

const FORME_EVENEMENT = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const FORME_MODELE = /^[A-Z][A-Za-z0-9]*$/;
const FORME_IDENTIFIANT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Les types d'événements valides, LUS dans REQ-INT-004. Vide = source illisible. */
export function typesEvenementDeLaReq(texte: string): string[] {
  return [...new Set(jetonsCites(texte).filter((j) => FORME_EVENEMENT.test(j)))];
}

/**
 * LES RACINES QUE LA GARDE JUGE, lues dans l'en-tête de `docs/GLOSSAIRE.md` : « tout synonyme
 * interdit trouvé dans `prisma/**`, `src/**`, `messages/**`, `docs/adr/**` → rouge
 * (`gov:termes-interdits`) ».
 * Les séparateurs admettent `>` et les fins de ligne : la clause est écrite en citation Markdown.
 */
export function racinesDuGlossaire(glossaire: string): string[] {
  const clause = /synonyme interdit trouv[ée]\s+dans[\s>]+((?:`[^`\n]+`[,\s>]*)+)/.exec(glossaire);
  if (!clause) return [];
  return jetonsCites(clause[1]!).map((r) => r.replace(/\*+$/, ''));
}

/**
 * Les modèles d'axionia que rien ne doit référencer. Deux sources, réunies :
 *   — REQ-INT-004, clause « aucun événement ne référence `Invoice` ni `Refund` » ;
 *   — `docs/GLOSSAIRE.md`, clause « … — des modèles supprimés d'axionia ».
 */
export function modelesRefusesDAxionia(reqInt004: string, glossaire: string): string[] {
  const trouves: string[] = [];
  const clauseReq = /ne\s+r[ée]f[ée]rence\s+((?:`[^`]+`(?:\s*(?:,|ni|et)\s*)?)+)/i.exec(reqInt004);
  if (clauseReq) trouves.push(...jetonsCites(clauseReq[1]!));
  const clauseGlossaire =
    /((?:`[^`\n]+`[,\s]*)+)[—–-]\s*des mod[èe]les supprim[ée]s d'axionia/.exec(glossaire);
  if (clauseGlossaire) trouves.push(...jetonsCites(clauseGlossaire[1]!));
  return [...new Set(trouves.filter((j) => FORME_MODELE.test(j)))];
}

type SynonymeInterdit = {
  terme: string;
  /** Faux quand le glossaire assortit l'interdit d'une CONDITION que la garde ne sait pas juger. */
  exerce: boolean;
  motif: string;
};

const MARQUEUR_SYNONYMES = /synonymes?\s+interdits?\s*(?:\*\*)?\s*:/i;

/**
 * Les synonymes interdits, LUS dans `docs/GLOSSAIRE.md`.
 *
 * Le glossaire écrit sous le même marqueur un interdit SEC (`inactif`, `churn`) et un interdit
 * SOUS CONDITION (`actif` en colonne) : ce qui SUIT le jeton tranche. Un délimiteur (`,` `;` `.`
 * `)` `|`) ou la fin du bloc = interdit sec ; de la prose = condition, que la garde n'exerce pas
 * et qu'elle IMPRIME. Les parenthèses sont des notes ; un terme introduit par `→` est le canonique
 * de remplacement, retiré de la liste.
 */
export function synonymesDuGlossaire(glossaire: string): SynonymeInterdit[] {
  const lignes = glossaire.split('\n');
  const out: SynonymeInterdit[] = [];
  const canoniques = new Set<string>();

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;
    const m = MARQUEUR_SYNONYMES.exec(ligne);
    if (!m) continue;

    // Le bloc : la suite de la ligne, puis le même paragraphe. Une cellule de tableau s'arrête à
    // sa barre.
    let bloc = ligne.slice(m.index + m[0].length);
    if (ligne.trim().startsWith('|')) {
      bloc = bloc.split('|')[0]!;
    } else {
      for (let j = i + 1; j < lignes.length; j++) {
        const suivante = lignes[j]!;
        if (suivante.trim() === '' || /^[#>|]/.test(suivante.trim())) break;
        bloc += '\n' + suivante;
      }
    }
    // Une phrase nouvelle n'est plus la liste.
    const finDePhrase = /\.\s+[A-ZÀ-Þ]/.exec(bloc);
    if (finDePhrase) bloc = bloc.slice(0, finDePhrase.index);

    for (const cible of bloc.matchAll(/→\s*`([^`\n]+)`/g)) canoniques.add(cible[1]!);

    const sansNotes = bloc.replace(/\([^)]*\)/g, '');
    for (const jeton of sansNotes.matchAll(/`([^`\n]+)`/g)) {
      const suite = sansNotes.slice(jeton.index + jeton[0].length);
      const exerce = suite.trim() === '' || /^\s*[,;.)|]/.test(suite);
      out.push({
        terme: jeton[1]!,
        exerce,
        motif: exerce
          ? `interdit sec, docs/GLOSSAIRE.md:${i + 1}`
          : `interdit SOUS CONDITION («${suite.split(/[,;.\n]/)[0]!.trim()}»), ` +
            `docs/GLOSSAIRE.md:${i + 1} — la garde ne l'exerce pas`,
      });
    }
  }

  return out.filter((s) => !canoniques.has(s.terme));
}

// ── LA GRAMMAIRE : une découpe, trois langages, écrite ICI seulement ─────────

type Grammaire = 'sans_exemption' | 'prose' | 'sql' | 'prisma';

/** Les SEULES extensions qui accordent une exemption. Toute autre n'exempte rien. */
const GRAMMAIRES_QUI_CITENT = new Map<string, Grammaire>([
  ['md', 'prose'],
  ['sql', 'sql'],
  ['prisma', 'prisma'],
]);

/** Les extensions qui citent, telles que la table les porte : le registre les énumère, la sortie les imprime. */
export const EXTENSIONS_QUI_CITENT: readonly string[] = [...GRAMMAIRES_QUI_CITENT.keys()];

function grammaireDuFichier(chemin: string): Grammaire {
  const extension = /\.([^./]+)$/.exec(chemin)?.[1];
  return (extension !== undefined && GRAMMAIRES_QUI_CITENT.get(extension)) || 'sans_exemption';
}

/** Les natures de zone, dans l'ordre où la sortie les imprime. */
export const NATURES_DE_ZONE = [
  'commentaire',
  'chaine',
  'bloc_de_code',
  'span_de_code',
  'guillemets',
] as const;
export type NatureDeZone = (typeof NATURES_DE_ZONE)[number];

/** Une zone RECONNUE, en positions du texte entier : [debut, fin). */
export type Zone = { nature: NatureDeZone; construction: string; debut: number; fin: number };

/**
 * Ce que la grammaire a découpé : ses zones, les intervalles qu'une citation EXEMPTE, et la construction
 * qu'elle n'a pas su refermer. Une construction non reconnue n'est jamais traversée : `exemptes` est
 * alors VIDE — le fichier est jugé comme du code —, et l'appelant le refuse en la NOMMANT.
 */
export type Decoupe = {
  zones: Zone[];
  exemptes: [number, number][];
  nonReconnue: { construction: string; ligne: number } | undefined;
};

/**
 * Une construction d'un langage de CODE (SQL, Prisma). `ouvre` ne porte aucun groupe capturant : les
 * motifs sont réunis en UN seul, dont le groupe dit laquelle a ouvert. `ferme` : la fin de ligne, ou le
 * texte qui referme (calculé sur l'ouvrante, pour la balise d'une chaîne à dollars).
 */
type Construction = {
  nom: string;
  nature: 'commentaire' | 'chaine';
  ouvre: RegExp;
  ferme: 'fin_de_ligne' | ((ouvrante: string) => string);
  /** `double` : la fermante doublée s'échappe ; `barre` : la barre oblique inverse échappe ; les deux. */
  echappe?: 'double' | 'barre' | 'barre_et_double';
  /** PostgreSQL imbrique ses commentaires de bloc. */
  imbrique?: true;
  /** Une chaîne Prisma ne franchit pas sa ligne. */
  surUneLigne?: true;
};

const MEME = (ouvrante: string): string => ouvrante;
const BARRE = String.fromCharCode(92);

/**
 * PostgreSQL : deux commentaires (le bloc s'imbrique), quatre littéraux. Une construction non listée —
 * un accent grave, par exemple — n'est pas une construction du langage : son texte est du CODE, jugé.
 * L'ordre compte : la chaîne échappée `E'…'` avant l'apostrophe, qui l'ouvrirait autrement.
 */
const CONSTRUCTIONS_SQL: Construction[] = [
  { nom: 'commentaire de ligne', nature: 'commentaire', ouvre: /--/, ferme: 'fin_de_ligne' },
  {
    nom: 'commentaire de bloc',
    nature: 'commentaire',
    ouvre: /\/\*/,
    ferme: () => '*/',
    imbrique: true,
  },
  {
    nom: "chaîne échappée E'…'",
    nature: 'chaine',
    ouvre: /(?<![\w$])[Ee]'/,
    ferme: () => "'",
    echappe: 'barre_et_double',
  },
  {
    nom: 'chaîne à dollars',
    nature: 'chaine',
    ouvre: /(?<![\w$])\$(?:[A-Za-z_\u0080-￿][\w\u0080-￿]*)?\$/,
    ferme: MEME,
  },
  {
    nom: 'identifiant entre guillemets',
    nature: 'chaine',
    ouvre: /"/,
    ferme: () => '"',
    echappe: 'double',
  },
  {
    nom: 'chaîne entre apostrophes',
    nature: 'chaine',
    ouvre: /'/,
    ferme: () => "'",
    echappe: 'double',
  },
];

/** Prisma : un commentaire (double ou triple barre), une chaîne entre guillemets qui ne franchit pas sa ligne. */
const CONSTRUCTIONS_PRISMA: Construction[] = [
  { nom: 'commentaire de ligne', nature: 'commentaire', ouvre: /\/\//, ferme: 'fin_de_ligne' },
  {
    nom: 'chaîne entre guillemets',
    nature: 'chaine',
    ouvre: /"/,
    ferme: () => '"',
    echappe: 'barre',
    surUneLigne: true,
  },
];

/** Le numéro (à partir de 1) de la ligne qui porte la position `p`. */
function ligneDe(texte: string, p: number): number {
  let n = 1;
  for (let i = texte.indexOf(LF); i !== -1 && i < p; i = texte.indexOf(LF, i + 1)) n++;
  return n;
}

/** La fin d'une construction ouverte en `debut` par `ouvrante`, ou `undefined` si elle n'est jamais refermée. */
function finDeConstruction(
  texte: string,
  debut: number,
  ouvrante: string,
  c: Construction
): number | undefined {
  const apres = debut + ouvrante.length;
  if (c.ferme === 'fin_de_ligne') {
    const fin = texte.indexOf(LF, apres);
    return fin === -1 ? texte.length : fin;
  }
  const fermante = c.ferme(ouvrante);
  if (c.imbrique) {
    let profondeur = 1;
    let j = apres;
    let ouvre = texte.indexOf(ouvrante, j);
    for (;;) {
      const ferme = texte.indexOf(fermante, j);
      if (ferme === -1) return undefined;
      if (ouvre !== -1 && ouvre < ferme) {
        profondeur++;
        j = ouvre + ouvrante.length;
        ouvre = texte.indexOf(ouvrante, j);
        continue;
      }
      profondeur--;
      j = ferme + fermante.length;
      if (profondeur === 0) return j;
      if (ouvre !== -1 && ouvre < j) ouvre = texte.indexOf(ouvrante, j);
    }
  }
  for (let j = apres; j < texte.length; j++) {
    const car = texte[j]!;
    if (car === LF && c.surUneLigne) return undefined;
    if (car === BARRE && c.echappe !== undefined && c.echappe !== 'double') {
      j++;
      continue;
    }
    if (!texte.startsWith(fermante, j)) continue;
    const doublee = texte.startsWith(fermante, j + fermante.length);
    if (doublee && (c.echappe === 'double' || c.echappe === 'barre_et_double')) {
      j += fermante.length * 2 - 1;
      continue;
    }
    return j + fermante.length;
  }
  return undefined;
}

/** Les spans d'accents graves d'un commentaire, ligne par ligne : c'est là, et là seulement, qu'un code cite. */
function citationsDansUnCommentaire(texte: string, zone: Zone): [number, number][] {
  const morceau = texte.slice(zone.debut, zone.fin);
  return [...morceau.matchAll(/`[^`\n]*`/g)].map((m): [number, number] => [
    zone.debut + m.index,
    zone.debut + m.index + m[0].length,
  ]);
}

/** SQL et Prisma : un seul balayage, qui saute de construction en construction. */
function decouperDuCode(texte: string, constructions: Construction[]): Decoupe {
  const ouvrantes = new RegExp(constructions.map((c) => `(${c.ouvre.source})`).join('|'), 'g');
  const zones: Zone[] = [];
  let i = 0;
  for (;;) {
    ouvrantes.lastIndex = i;
    const m = ouvrantes.exec(texte);
    if (m === null) break;
    const c = constructions[m.slice(1).findIndex((g) => g !== undefined)]!;
    const fin = finDeConstruction(texte, m.index, m[0], c);
    if (fin === undefined) {
      return {
        zones,
        exemptes: [],
        nonReconnue: { construction: c.nom, ligne: ligneDe(texte, m.index) },
      };
    }
    zones.push({ nature: c.nature, construction: c.nom, debut: m.index, fin });
    i = fin;
  }
  const exemptes = zones
    .filter((z) => z.nature === 'commentaire')
    .flatMap((z) => citationsDansUnCommentaire(texte, z));
  return { zones, exemptes, nonReconnue: undefined };
}

// Les blocs de la prose, au sens de CommonMark (et des tableaux GFM). Chaque motif se lit sur la ligne
// privée de ses marqueurs de citation Markdown.
const MARQUEURS_DE_CITATION = /^(?: {0,3}> ?)+/;
const LIGNE_VIDE = /^[ \t]*\r?$/;
const OUVRE_UN_BLOC = /^ {0,3}(`{3,}|~{3,})([^\r]*)\r?$/;
const FERME_UN_BLOC = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/;
const TITRE_ATX = /^ {0,3}#{1,6}(?:[ \t]|\r?$)/;
const RUPTURE = /^ {0,3}(?:(?:[-*_])(?:[ \t]*[-*_]){2,}|=+)[ \t]*\r?$/;
const DEBUT_D_ITEM = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|\r?$)/;
const CODE_INDENTE = /^(?: {4}|\t)/;
const SEPARATEUR_DE_TABLEAU = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*\r?$/;
const RANGEE_DE_TABLEAU = /^[ \t]*\|/;

/**
 * Les spans de code d'un paragraphe, au sens de CommonMark : une suite de N accents graves ne se
 * referme que sur une suite d'EXACTEMENT N ; sans fermante dans le paragraphe, elle est du texte et la
 * lecture reprend juste après elle. Un accent grave échappé par une barre oblique inverse n'ouvre rien.
 * Linéaire : les fermantes candidates sont rangées par longueur, et chaque curseur ne recule jamais.
 */
function spansDuParagraphe(texte: string, debut: number, fin: number, zones: Zone[]): void {
  const suites: { pos: number; long: number; echappee: boolean }[] = [];
  const motif = /`+/g;
  motif.lastIndex = debut;
  for (let m = motif.exec(texte); m !== null && m.index < fin; m = motif.exec(texte)) {
    let barres = 0;
    while (m.index - barres - 1 >= debut && texte[m.index - barres - 1] === BARRE) barres++;
    suites.push({ pos: m.index, long: m[0].length, echappee: barres % 2 === 1 });
  }
  const parLongueur = new Map<number, number[]>();
  suites.forEach((s, k) => {
    const deCetteLongueur = parLongueur.get(s.long);
    if (deCetteLongueur === undefined) parLongueur.set(s.long, [k]);
    else deCetteLongueur.push(k);
  });
  const curseurs = new Map<number, number>();
  for (let k = 0; k < suites.length; k++) {
    const s = suites[k]!;
    const long = s.echappee ? s.long - 1 : s.long;
    const candidates = parLongueur.get(long) ?? [];
    let c = curseurs.get(long) ?? 0;
    while (c < candidates.length && candidates[c]! <= k) c++;
    curseurs.set(long, c);
    if (long === 0 || c === candidates.length) continue;
    const j = candidates[c]!;
    const fermante = suites[j]!;
    zones.push({
      nature: 'span_de_code',
      construction: 'span de code',
      debut: s.echappee ? s.pos + 1 : s.pos,
      fin: fermante.pos + fermante.long,
    });
    k = j;
  }
}

/**
 * La prose : les blocs d'abord (bloc de code clôturé, titre, tableau, code indenté, paragraphe), puis
 * les spans de code DANS chaque paragraphe ou titre — un span ne franchit jamais la frontière d'un bloc —,
 * puis les guillemets français, sur leur ligne. Un bloc clôturé jamais refermé se prolonge jusqu'à la
 * fin du document au rendu : la garde n'y exempte RIEN, et n'y cherche plus de span.
 */
function decouperLaProse(texte: string): Decoupe {
  const lignes = texte.split(LF);
  const debuts: number[] = [];
  let position = 0;
  for (const l of lignes) {
    debuts.push(position);
    position += l.length + 1;
  }
  const finDe = (i: number): number => debuts[i]! + lignes[i]!.length;
  const zones: Zone[] = [];

  let paragraphe: number[] = [];
  let enTableau = false;
  const clore = (): void => {
    if (paragraphe.length > 0)
      spansDuParagraphe(texte, debuts[paragraphe[0]!]!, finDe(paragraphe.at(-1)!), zones);
    paragraphe = [];
  };
  const seule = (i: number): void => spansDuParagraphe(texte, debuts[i]!, finDe(i), zones);

  for (let i = 0; i < lignes.length; i++) {
    const brute = lignes[i]!;
    const ligne = brute.replace(MARQUEURS_DE_CITATION, '');
    const citee = ligne.length !== brute.length;

    const ouvre = OUVRE_UN_BLOC.exec(ligne);
    if (ouvre && !(ouvre[1]![0] === '`' && ouvre[2]!.includes('`'))) {
      clore();
      enTableau = false;
      const clotureAttendue = ouvre[1]!;
      let j = i + 1;
      for (; j < lignes.length; j++) {
        const f = FERME_UN_BLOC.exec(lignes[j]!.replace(MARQUEURS_DE_CITATION, ''));
        if (f && f[1]![0] === clotureAttendue[0] && f[1]!.length >= clotureAttendue.length) break;
      }
      if (j === lignes.length) break;
      zones.push({
        nature: 'bloc_de_code',
        construction: 'bloc de code clôturé',
        debut: debuts[i]!,
        fin: finDe(j),
      });
      i = j;
      continue;
    }
    if (LIGNE_VIDE.test(ligne)) {
      clore();
      enTableau = false;
      continue;
    }
    if (SEPARATEUR_DE_TABLEAU.test(ligne)) {
      // La rangée d'en-tête est la ligne qui précède : elle quitte le paragraphe.
      const entete = paragraphe.pop();
      clore();
      if (entete !== undefined) seule(entete);
      seule(i);
      enTableau = true;
      continue;
    }
    if (
      enTableau ||
      RANGEE_DE_TABLEAU.test(ligne) ||
      TITRE_ATX.test(ligne) ||
      RUPTURE.test(ligne)
    ) {
      clore();
      seule(i);
      continue;
    }
    if (paragraphe.length === 0 && CODE_INDENTE.test(ligne)) continue;
    const precedente = paragraphe.at(-1);
    const precedenteCitee =
      precedente !== undefined && MARQUEURS_DE_CITATION.test(lignes[precedente]!);
    if (DEBUT_D_ITEM.test(ligne) || (precedente !== undefined && precedenteCitee !== citee))
      clore();
    paragraphe.push(i);
  }
  clore();

  for (const m of texte.matchAll(/«[^»\n]*»/g)) {
    zones.push({
      nature: 'guillemets',
      construction: 'guillemets français',
      debut: m.index,
      fin: m.index + m[0].length,
    });
  }
  return {
    zones,
    exemptes: zones.map((z): [number, number] => [z.debut, z.fin]),
    nonReconnue: undefined,
  };
}

/**
 * LA DÉCOUPE d'un fichier, selon la grammaire de sa DERNIÈRE extension. Toute zone qu'une exemption
 * de citation touche vient d'ici, et de nulle part ailleurs.
 */
export function decouper(chemin: string, texte: string): Decoupe {
  const grammaire = grammaireDuFichier(chemin);
  if (grammaire === 'prose') return decouperLaProse(texte);
  if (grammaire === 'sql') return decouperDuCode(texte, CONSTRUCTIONS_SQL);
  if (grammaire === 'prisma') return decouperDuCode(texte, CONSTRUCTIONS_PRISMA);
  return { zones: [], exemptes: [], nonReconnue: undefined };
}

// ── le périmètre ─────────────────────────────────────────────────────────────

type Perimetre = {
  /** Les racines du glossaire, plus le paquet de contrats. */
  racines: string[];
  /** Chaque fichier est rangé sous la PREMIÈRE racine qui le contient : c'est une partition. */
  parRacine: { racine: string; lus: FichierVu[] }[];
  lus: FichierVu[];
  horsPerimetre: FichierVu[];
};

/** LA définition du périmètre : ce qu'`examiner` doit parcourir, et ce qui est hors périmètre. */
export function perimetreDeLaVue(vue: Vue): Perimetre {
  const racines = [...vue.racines, RACINE_CONTRATS];
  const parRacine = racines.map((racine) => ({ racine, lus: [] as FichierVu[] }));
  const horsPerimetre: FichierVu[] = [];
  for (const fichier of vue.fichiers) {
    const rang = parRacine.find((r) => fichier.chemin.startsWith(r.racine));
    if (rang) rang.lus.push(fichier);
    else horsPerimetre.push(fichier);
  }
  return { racines, parRacine, lus: parRacine.flatMap((r) => r.lus), horsPerimetre };
}

// ── la lecture EN ENTIER, et sur les lignes du consommateur ──────────────────

/** Posés par leur code : écrits dans ce fichier, ils le couperaient lui-même. */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** Le refus d'un texte que la garde découperait sur d'autres lignes que son consommateur (`finDeLigneEtrangere`). */
function refusDeFinDeLigne(ou: string, fin: { ligne: number; code: string }): Faute {
  return {
    famille: 'fin_de_ligne_non_lf',
    message:
      `${ou}:${fin.ligne} — fin de ligne ${fin.code}, que cette garde ne coupe pas et qu'un consommateur coupe : ` +
      "un commentaire ou une citation y couvrirait la ligne suivante, et l'exemption mentirait. Écris LF (ou CRLF).",
  };
}

/** `ignoreBOM` : la marque d'ordre est GARDÉE dans le texte, pour que ses octets soient recomptés. */
const DECODEUR = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Le texte d'un fichier lu EN ENTIER, ou la raison pour laquelle il ne l'est pas. */
function lireEnEntier(fichier: FichierVu): { texte: string } | { raison: string } {
  if ('erreur' in fichier)
    return { raison: `l'index n'en rend pas les octets (${fichier.erreur})` };
  if (fichier.octets.includes(0)) return { raison: 'octet NUL — UTF-16 ou binaire' };
  try {
    return { texte: DECODEUR.decode(fichier.octets) };
  } catch {
    return { raison: 'UTF-8 invalide' };
  }
}

// ── le contrôle ──────────────────────────────────────────────────────────────

/** Un motif de mot entier, à bornes alphanumériques : le point n'est pas une borne. */
function motifDuTerme(terme: string): RegExp {
  const echappe = terme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${echappe}(?![A-Za-z0-9_])`, 'g');
}

type Regle = { famille: string; terme: string; motif: RegExp; conseil: string };

function reglesDeLaVue(vue: Vue): { regles: Regle[]; typesValides: string[] } {
  const typesValides = typesEvenementDeLaReq(vue.reqInt004);
  const synonymes = synonymesDuGlossaire(vue.glossaire);
  const modeles = modelesRefusesDAxionia(vue.reqInt004, vue.glossaire);

  const regles: Regle[] = [];

  for (const modele of modeles) {
    regles.push({
      famille: 'terme_axionia_invalide',
      terme: modele,
      motif: motifDuTerme(modele),
      conseil:
        `\`${modele}\` n'existe pas dans axionia (docs/AFFIRMATIONS-AXIONIA.md, AFF-01 à AFF-03). ` +
        'Nomme le modèle réel — la facture est `FactureFormation`, le remboursement une valeur de `PaymentType`.',
    });
  }

  // Les noms d'événements REFUSÉS par le glossaire.
  const refusesDuGlossaire = synonymes.filter((s) => s.exerce && FORME_EVENEMENT.test(s.terme));
  for (const s of refusesDuGlossaire) {
    regles.push({
      famille: 'evenement_hors_nomenclature',
      terme: s.terme,
      motif: motifDuTerme(s.terme),
      conseil:
        `\`${s.terme}\` est un synonyme interdit du glossaire (${s.motif}). REQ-INT-004 impose ` +
        `des noms français : ${typesValides.join(', ')}.`,
    });
  }

  // Les noms VALIDES, écrits à la main hors du paquet de contrats.
  for (const type of typesValides) {
    regles.push({
      famille: 'evenement_litteral_hors_contrat',
      terme: type,
      motif: motifDuTerme(type),
      conseil:
        `\`${type}\` est un nom d'événement du contrat. Importe-le de \`${RACINE_CONTRATS}events\` ` +
        "(`TYPES_EVENEMENT`) : un nom recopié ne suit jamais le contrat, et l'empreinte ne le voit pas.",
    });
  }

  // Les synonymes qui ne sont ni des événements ni des modèles refusés.
  const dejaCouverts = new Set([...modeles, ...refusesDuGlossaire.map((s) => s.terme)]);
  for (const s of synonymes) {
    if (!s.exerce || dejaCouverts.has(s.terme) || !FORME_IDENTIFIANT.test(s.terme)) continue;
    regles.push({
      famille: 'synonyme_interdit_du_glossaire',
      terme: s.terme,
      motif: motifDuTerme(s.terme),
      conseil: `\`${s.terme}\` est un synonyme interdit (${s.motif}). Le terme canonique est au glossaire.`,
    });
  }

  return { regles, typesValides };
}

/**
 * Le contrôle, et ce qu'il a RÉELLEMENT examiné. PUR : il ne lit rien, il ne juge que la vue qu'on
 * lui donne. Un fichier examiné l'a été EN ENTIER : ses octets sont recomptés sur les lignes
 * parcourues, et c'est ce compte que la sortie imprime.
 */
export function examiner(vue: Vue): { fautes: Faute[]; examines: Examine[] } {
  const fautes: Faute[] = [];
  const examines: Examine[] = [];
  const { regles, typesValides } = reglesDeLaVue(vue);

  // ── les sources, d'abord : une garde qui ne sait plus à quoi comparer ne conclut pas ──
  if (typesValides.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      refus: 'req_int_004_muette',
      message:
        "REQ-INT-004 ne rend plus aucun nom d'événement : la garde ne sait plus lesquels sont " +
        'valides, et laisserait donc tout passer. Le texte de l’exigence est la source.',
    });
  }
  if (vue.typesDuContrat.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      refus: 'contrat_sans_evenement',
      message:
        '`packages/contracts` ne publie plus aucun nom d’événement : la garde ne peut plus dire ' +
        'ce qui est « littéral hors contrat ».',
    });
  }
  const manquants = typesValides.filter((t) => !vue.typesDuContrat.includes(t));
  if (manquants.length > 0) {
    fautes.push({
      famille: 'source_illisible',
      refus: 'contrat_et_exigence_divergents',
      message:
        `Le paquet de contrats ne porte pas ${manquants.join(', ')}, que REQ-INT-004 nomme. ` +
        'Les deux sources ont divergé : la garde condamnerait l’une au nom de l’autre.',
    });
  }
  if (synonymesDuGlossaire(vue.glossaire).length === 0) {
    fautes.push({
      famille: 'source_illisible',
      refus: 'glossaire_sans_synonyme',
      message:
        '`docs/GLOSSAIRE.md` ne rend plus aucun synonyme interdit. `docs/PRESEANCE.md` §2 en fait ' +
        'la source primaire sur ce point : sans elle, la famille est vide et toujours verte.',
    });
  }
  if (vue.racines.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      refus: 'racines_illisibles',
      message:
        "l'en-tête de `docs/GLOSSAIRE.md` ne donne plus les racines où la garde cherche. Sans " +
        'périmètre lu, elle jugerait tout ou rien — et « rien » est un vert qui ment.',
    });
  }

  for (const [source, texte] of [
    ['REQ-INT-004', vue.reqInt004],
    ['docs/GLOSSAIRE.md', vue.glossaire],
  ] as const) {
    const fin = finDeLigneEtrangere(texte);
    if (fin !== undefined) fautes.push(refusDeFinDeLigne(source, fin));
  }

  // ── le périmètre ──────────────────────────────────────────────────────────
  const { racines, parRacine, lus } = perimetreDeLaVue(vue);
  if (lus.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        `aucun fichier à balayer dans ${racines.join(', ')}. « 0 fichier » et « aucun défaut » ` +
        'sont deux phrases différentes, et une seule autorise à conclure.',
    });
    return { fautes, examines };
  }

  for (const { racine, lus: fichiers } of parRacine) {
    for (const fichier of fichiers) {
      const lecture = lireEnEntier(fichier);
      if ('raison' in lecture) {
        fautes.push({
          famille: 'contenu_illisible',
          message:
            `${fichier.chemin} — ${lecture.raison}. La garde ne l'a pas lu en entier, et « non lu » ` +
            "n'est pas « propre » : réencode-le en UTF-8, ou sors-le des racines (arbitrage du `gardien-spec`).",
        });
        continue;
      }
      const fin = finDeLigneEtrangere(lecture.texte);
      if (fin !== undefined) {
        fautes.push(refusDeFinDeLigne(fichier.chemin, fin));
        continue;
      }
      const decoupe = decouper(fichier.chemin, lecture.texte);
      if (decoupe.nonReconnue !== undefined) {
        fautes.push({
          famille: 'contenu_illisible',
          message:
            `${fichier.chemin}:${decoupe.nonReconnue.ligne} — construction non reconnue : ` +
            `${decoupe.nonReconnue.construction} ouverte ici et jamais refermée. La garde ne découpe pas ` +
            "ce qu'elle ne reconnaît pas : ce fichier est jugé SANS aucune exemption de citation.",
        });
      }
      const { exemptes } = decoupe;
      const dansLeContrat = fichier.chemin.startsWith(RACINE_CONTRATS);
      let octets = 0;
      let debutDeLigne = 0;
      const empreinte = createHash('sha256');

      lecture.texte.split(LF).forEach((ligne, i) => {
        if (i > 0) {
          octets += 1;
          empreinte.update(LF);
        }
        octets += Buffer.byteLength(ligne, 'utf8');
        empreinte.update(ligne);
        const origine = debutDeLigne;
        debutDeLigne += ligne.length + 1;
        const cite = (index: number): boolean =>
          exemptes.some(([a, b]) => origine + index >= a && origine + index < b);

        for (const regle of regles) {
          if (regle.famille === 'evenement_litteral_hors_contrat' && dansLeContrat) continue;
          regle.motif.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = regle.motif.exec(ligne)) !== null) {
            if (cite(m.index)) continue;
            fautes.push({
              famille: regle.famille,
              message: `${fichier.chemin}:${i + 1} — « ${regle.terme} ». ${regle.conseil}`,
            });
          }
        }
      });
      examines.push({
        chemin: fichier.chemin,
        racine,
        octets,
        empreinte: empreinte.digest('hex'),
        zones: grammaireDuFichier(fichier.chemin) === 'sans_exemption' ? undefined : decoupe.zones,
      });
    }
  }

  return { fautes, examines };
}

/** Les fautes seules — ce que `--prove` juge. */
export function controler(vue: Vue): Faute[] {
  return examiner(vue).fautes;
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

/** Le mode d'index d'un sous-module : son objet est un commit d'un AUTRE dépôt, jamais un blob. */
const MODE_SOUS_MODULE = '160000';

/**
 * La vue du dépôt : TOUS les fichiers suivis, en octets, sans filtre. Le périmètre d'abord, et dans
 * cet ordre : lancée hors de la racine, la garde refuse en NOMMANT `perimetre_illisible` au lieu de
 * mourir sur un `ENOENT` de `docs/GLOSSAIRE.md`.
 *
 * LES OCTETS SONT CEUX DU BLOB que l'index associe à chaque chemin, demandé par son empreinte
 * (`blobsDe`, la lecture de `gov:entite`, importée et non recopiée) — jamais le disque. Un fichier
 * déclaré inchangé dans l'index (`--assume-unchanged`, `--skip-worktree`) porte un disque propre et
 * un blob fautif : lu sur le disque, il sortait vert en local et rouge en CI, qui extrait le blob. Un
 * sous-module et une entrée en conflit n'ont pas de blob à rendre : ils gardent leur erreur, et sous
 * une racine `examiner` les refuse en les nommant.
 */
export function vueDuDepot(): Vue {
  const entrees = entreesSuiviesOuRefus(ID_REGISTRE);
  const sansBlob = new Map<string, string>();
  for (const e of entrees) {
    if (e.mode === MODE_SOUS_MODULE) sansBlob.set(e.chemin, `sous-module, mode ${e.mode}`);
    else if (e.etage !== '0') sansBlob.set(e.chemin, `entrée en conflit, étage ${e.etage}`);
  }
  const blobs = blobsDe(entrees.filter((e) => !sansBlob.has(e.chemin)));
  const fichiers = [...new Set(entrees.map((e) => e.chemin))].map((chemin): FichierVu => {
    const erreur = sansBlob.get(chemin);
    return erreur === undefined ? { chemin, octets: blobs.get(chemin)! } : { chemin, erreur };
  });
  const glossaire =
    blobs.get(CHEMIN_GLOSSAIRE)?.toString('utf8') ?? readFileSync(CHEMIN_GLOSSAIRE, 'utf8');
  return {
    reqInt004: texteDeLaReq('REQ-INT-004'),
    glossaire,
    typesDuContrat: [...TYPES_EVENEMENT],
    racines: racinesDuGlossaire(glossaire),
    fichiers,
  };
}

// ── la population de la preuve, LUE dans le registre ─────────────────────────

type Population = { familles: string[]; refus: string[]; citent: string[]; temoins: string[] };

/**
 * La population que `--prove` doit couvrir, LUE dans le champ `verifie` de l'entrée du registre :
 * familles, refus de conclure, extensions qui citent, et l'identifiant de chaque témoin. Une liste
 * muette est un REFUS.
 */
export function populationDuRegistre(texte: string): Population {
  const registre = JSON.parse(texte) as { gates?: { id: string; verifie?: string }[] };
  const entrees = (registre.gates ?? []).filter((g) => g.id === ID_REGISTRE);
  if (entrees.length !== 1) {
    throw new Error(
      `docs/gates.json porte ${entrees.length} entrée(s) « ${ID_REGISTRE} » — il en faut exactement une.`
    );
  }
  const verifie = entrees[0]!.verifie ?? '';
  const liste = (etiquette: RegExp, quoi: string): string[] => {
    const m = etiquette.exec(verifie);
    const noms = (m?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));
    if (noms.length === 0) {
      throw new Error(
        `le champ « verifie » de « ${ID_REGISTRE} » ne nomme aucun(e) ${quoi}. La population de ` +
          '--prove se lit LÀ, et nulle part ailleurs : un registre muet est un refus.'
      );
    }
    return noms;
  };
  return {
    familles: liste(/familles\s*:\s*([a-z0-9_,\s]+?)\s*(?:;|$)/, 'famille'),
    refus: liste(/refus de conclure\s*:\s*([a-z0-9_,\s]+?)\s*(?:;|$)/, 'refus de conclure'),
    citent: liste(/extensions qui citent\s*:\s*([a-z0-9_,\s]+?)\s*(?:;|$)/, 'extension qui cite'),
    temoins: liste(/temoins\s*:\s*([a-z0-9_,\s]+?)\s*(?:;|$)/, 'témoin'),
  };
}

/** La clé de couverture d'un refus : la famille, ou `famille/refus` quand un refus est nommé. */
export function cleDeCouverture(famille: string, refus?: string): string {
  return refus === undefined ? famille : `${famille}/${refus}`;
}

// ── la fixture de la preuve (RM-11 : le VERDICT ne lit rien du dépôt) ────────

/** Même liste de types que REQ-INT-004 : `termes-interdits.spec.ts` l'assère par ÉGALITÉ. */
const REQ_INT_004_FIXTURE =
  "Les types d'événements sont : `client.cree`, `client.mis_a_jour`, `devis.signe`, " +
  '`facture.emise`, `avoir.emis`, `paiement.recu`, `paiement.rembourse`, `candidature.recue`, ' +
  '`financement.mis_a_jour`, `facture.annulee`, `client.fusionne`, `devis.emis`, `financement.etape` — nommés sur les modèles ' +
  'réels (Client, Devis, FactureFormation, Payment, Submission, DossierPayeur) ; aucun événement ne ' +
  'référence `Invoice` ni `Refund`.';

/**
 * Les TOURNURES de `docs/GLOSSAIRE.md` que la garde doit savoir lire, au plus court. Ses racines et
 * ses modèles refusés sont assérés ÉGAUX à ceux du glossaire réel par `termes-interdits.spec.ts`.
 *
 * §5 porte DEUX blocs de synonymes, et c'est voulu : le glossaire réel en porte deux depuis le
 * 2026-09-22. Le premier est SEC — trois champs d'enveloppe dont le registre ne réclame le jeton
 * pour aucun autre rôle. Le second est SOUS CONDITION — `eventId` et `eventType`, que le même §5
 * épelle comme les colonnes de `EvenementRecu` (REQ-DM-036, tâche SEC-06), et `schemaVersion`, que
 * REQ-QA-007 réclame : un jeton attribué AUSSI à un autre rôle ne peut pas porter un interdit sec.
 * La table de réception, au-dessus, épelle ces colonnes : elle est ici pour que le contre-témoin de
 * la colonne Prisma soit jugé contre un glossaire qui la prescrit réellement.
 */
const GLOSSAIRE_FIXTURE = [
  '# Glossaire — Axion Partners',
  '',
  '> Gate `glossaire-enums.spec.ts` : tout synonyme interdit trouvé dans `prisma/**`, `src/**`,',
  '> `messages/**`, `docs/adr/**` → rouge (`gov:termes-interdits`).',
  '',
  '## 1. Attribution',
  '',
  '`ON attributions(siren) WHERE statut IN (…)`. Synonymes interdits : `ETATS_ACTIFS`, une',
  '« attribution vivante » sans renvoi à la constante.',
  '',
  '## 2. Apporteur',
  '',
  'Synonymes interdits : `actif` en colonne, `inactif`, `churn`, `isActive`.',
  '',
  '## 5. Événements',
  '',
  'Table de réception : `{source enum {axionia, docuseal}, eventId unique par source,',
  'eventType, payloadHash}` (REQ-DM-036).',
  '',
  'Synonymes interdits : `occurredAt`, `emittedAt`, `subjectRef` ; `payment.received`,',
  '`refund.issued`, `invoice.issued`, `devis.signed`, `client.created` ; `Invoice`, `Refund`,',
  "`PaymentScheduleProfile` — des modèles supprimés d'axionia qu'aucun événement ne référence.",
  '',
  "Synonymes interdits : `eventId` dans l'enveloppe de fil, `eventType` dans l'enveloppe de fil,",
  "`schemaVersion` dans l'enveloppe de fil — trois jetons que le registre attribue AUSSI à un autre",
  "rôle, donc trois interdits que la garde n'exerce pas et qu'elle imprime.",
  '',
  '## 7. Rôles console',
  '',
  'Identifiant **unique** : `qualifieur`. Synonyme interdit : `qualificateur` (encore présent dans',
  'REQ-SEC-023), `reviewer`.',
  '',
].join('\n');

export const VUE_CONFORME: Vue = {
  reqInt004: REQ_INT_004_FIXTURE,
  glossaire: GLOSSAIRE_FIXTURE,
  // TAPÉE, et non dérivée de la fixture : dérivée, `contrat_et_exigence_divergents` ne serait plus
  // jamais exerçable. Assérée ÉGALE à `TYPES_EVENEMENT` par `termes-interdits.spec.ts`.
  typesDuContrat: [
    'client.cree',
    'client.mis_a_jour',
    'devis.signe',
    'facture.emise',
    'avoir.emis',
    'paiement.recu',
    'paiement.rembourse',
    'candidature.recue',
    'financement.mis_a_jour',
    'facture.annulee',
    'client.fusionne',
    'devis.emis',
    'financement.etape',
  ],
  racines: racinesDuGlossaire(GLOSSAIRE_FIXTURE),
  fichiers: [fichierTexte('src/config/fixture.ts', 'export const rien = true;\n')],
};

const avecFichierVu = (fichier: FichierVu): Vue => ({
  ...VUE_CONFORME,
  fichiers: [...VUE_CONFORME.fichiers, fichier],
});
const avec = (chemin: string, contenu: string): Vue => avecFichierVu(fichierTexte(chemin, contenu));

/** L'accent grave, posé par son code : l'écrire dans un littéral de ce fichier le fermerait. */
const AG = String.fromCharCode(96);
/** Les marqueurs d'un commentaire de bloc SQL, posés en deux morceaux dans les fixtures. */
const OUVRE_BLOC_SQL = '/' + '*';
const FERME_BLOC_SQL = '*' + '/';

export type Temoin = {
  /** L'identifiant que `docs/gates.json` énumère : supprimer ce témoin découvre SA clé. */
  id: string;
  famille: string;
  refus?: RefusDeConclure;
  quoi: string;
  vue: () => Vue;
};

/** Un témoin par famille, par refus, et par frontière d'exemption, côté où elle NE vaut PAS. */
export const TEMOINS: Temoin[] = [
  {
    id: 'req_int_004_muette',
    famille: 'source_illisible',
    refus: 'req_int_004_muette',
    quoi: "REQ-INT-004 ne nomme plus aucun type d'événement",
    vue: () => ({ ...VUE_CONFORME, reqInt004: "Les types d'événements sont nommés ailleurs." }),
  },
  {
    id: 'contrat_sans_evenement',
    famille: 'source_illisible',
    refus: 'contrat_sans_evenement',
    quoi: 'le paquet de contrats ne publie plus aucun nom',
    vue: () => ({ ...VUE_CONFORME, typesDuContrat: [] }),
  },
  {
    id: 'contrat_et_exigence_divergents',
    famille: 'source_illisible',
    refus: 'contrat_et_exigence_divergents',
    quoi: "le contrat a perdu dix des onze noms que l'exigence nomme",
    vue: () => ({ ...VUE_CONFORME, typesDuContrat: ['client.cree'] }),
  },
  {
    id: 'glossaire_sans_synonyme',
    famille: 'source_illisible',
    refus: 'glossaire_sans_synonyme',
    quoi: 'le glossaire ne porte plus le marqueur des synonymes interdits',
    vue: () => ({
      ...VUE_CONFORME,
      glossaire: GLOSSAIRE_FIXTURE.replace(/Synonymes? interdits? :/g, 'Termes écartés :'),
    }),
  },
  {
    id: 'racines_illisibles',
    famille: 'source_illisible',
    refus: 'racines_illisibles',
    quoi: "l'en-tête du glossaire ne donne plus les racines à balayer",
    vue: () => ({ ...VUE_CONFORME, racines: [] }),
  },
  {
    id: 'perimetre_vide',
    famille: 'perimetre_vide',
    quoi: 'aucun fichier à balayer',
    vue: () => ({ ...VUE_CONFORME, fichiers: [] }),
  },
  {
    id: 'contenu_octet_nul',
    famille: 'contenu_illisible',
    quoi: 'un texte UTF-16 sans marque d’ordre sous une racine : ses octets NUL sont de l’UTF-8 valide',
    vue: () =>
      avecFichierVu({
        chemin: 'src/content/page.txt',
        octets: Uint8Array.from(
          [...'le producteur emet payment.received'].flatMap((c) => [c.charCodeAt(0), 0])
        ),
      }),
  },
  {
    id: 'contenu_utf8_invalide',
    famille: 'contenu_illisible',
    quoi: 'un octet hors UTF-8, sans octet NUL, sous une racine',
    vue: () =>
      avecFichierVu({
        chemin: 'docs/adr/9995-latin1.md',
        octets: Uint8Array.of(0x72, 0xe9, 0x73, 0x75, 0x6d, 0xe9),
      }),
  },
  {
    id: 'contenu_refuse_par_le_disque',
    famille: 'contenu_illisible',
    quoi: 'un suivi dont le disque refuse les octets — un sous-module est un dossier',
    vue: () => avecFichierVu({ chemin: 'src/sous-module', erreur: 'EISDIR' }),
  },
  {
    id: 'fin_de_ligne_cr_seul',
    famille: 'fin_de_ligne_non_lf',
    quoi: "en `.sql`, un CR seul : PostgreSQL y termine le commentaire, et l'instruction qui suit serait couverte",
    vue: () =>
      avec(
        'prisma/migrations/0005_cr/migration.sql',
        [
          `-- ouvre ${AG}`,
          "UPDATE evenements SET type = 'payment.received';",
          `-- ferme ${AG}`,
        ].join(CR)
      ),
  },
  {
    id: 'fin_de_ligne_separateur_unicode',
    famille: 'fin_de_ligne_non_lf',
    quoi: 'un séparateur de ligne Unicode, qu’ECMAScript coupe',
    vue: () =>
      avec(
        'src/server/separateur.ts',
        `// note${String.fromCharCode(0x2028)}export const rien = true;`
      ),
  },
  {
    id: 'fin_de_ligne_dans_une_source',
    famille: 'fin_de_ligne_non_lf',
    quoi: 'le glossaire, source des synonymes et des racines, porte un CR seul',
    vue: () => ({ ...VUE_CONFORME, glossaire: `${GLOSSAIRE_FIXTURE}${CR}suite` }),
  },
  {
    id: 'modele_dans_le_code',
    famille: 'terme_axionia_invalide',
    quoi: 'un modèle refusé référencé dans du code',
    vue: () => avec('src/server/facture.ts', 'const f: Invoice = await lire(id);'),
  },
  {
    id: 'modele_en_qualification_pointee',
    famille: 'terme_axionia_invalide',
    quoi: 'le même modèle derrière un point : le point ne borne pas le mot',
    vue: () => avec('src/server/lecture.ts', 'const f = await prisma.Invoice.findMany();'),
  },
  {
    id: 'modele_dans_le_paquet_de_contrats',
    famille: 'terme_axionia_invalide',
    quoi: "le paquet de contrats est LU, et son exemption ne vaut que pour les noms d'événements",
    vue: () => avec('packages/contracts/facture.ts', 'export type Source = Invoice;'),
  },
  {
    id: 'anglais_dans_un_adr',
    famille: 'evenement_hors_nomenclature',
    quoi: 'la fixture rouge du registre : un nom anglais hors citation dans un ADR',
    vue: () =>
      avec('docs/adr/0011-temoin.md', 'le producteur emet payment.received a la signature'),
  },
  {
    id: 'json_guillemet_droit',
    famille: 'evenement_hors_nomenclature',
    quoi: 'du JSON de `messages/` : le guillemet droit y délimite une valeur',
    vue: () => avec('messages/fr.json', '{ "journal": { "titre": "payment.received" } }'),
  },
  {
    id: 'prose_guillemet_droit',
    famille: 'evenement_hors_nomenclature',
    quoi: 'en prose, le guillemet droit ne cite pas',
    vue: () =>
      avec('docs/adr/9996-guillemets.md', 'le producteur emet "payment.received" a la signature'),
  },
  {
    id: 'prose_accent_grave_pendant',
    famille: 'evenement_hors_nomenclature',
    quoi: 'en prose, un accent grave refermé trois lignes plus bas ne cite pas la fin de sa ligne',
    vue: () =>
      avec(
        'docs/adr/9998-span.md',
        [
          `une coquille ouvre un accent grave ${AG}ici, puis le producteur emet payment.received`,
          '',
          '',
          `et un autre accent grave ${AG} apparait`,
        ].join('\n')
      ),
  },
  {
    id: 'prose_cloture_impaire',
    famille: 'terme_axionia_invalide',
    quoi: "en prose, une clôture de bloc jamais refermée n'amnistie pas la suite",
    vue: () =>
      avec(
        'docs/adr/9997-cloture.md',
        [`${AG.repeat(3)}ts`, 'const f: Invoice = lire();', '', 'la suite du document'].join('\n')
      ),
  },
  {
    id: 'gabarit_de_chaine',
    famille: 'evenement_hors_nomenclature',
    quoi: 'en code, les accents graves délimitent un gabarit de chaîne et ne citent rien',
    vue: () => avec('src/server/emetteur.ts', `const sujet = ${AG}payment.received${AG};`),
  },
  {
    id: 'extension_sans_grammaire',
    famille: 'evenement_hors_nomenclature',
    quoi: "une extension sans grammaire nommée, sous une racine, est LUE et n'exempte rien",
    vue: () => avec('src/content/page.mdx', `le producteur emet ${AG}payment.received${AG}`),
  },
  {
    id: 'extension_composee',
    famille: 'evenement_hors_nomenclature',
    quoi: "l'exemption se lit sur la DERNIÈRE extension du nom : `.md.ts` est du code",
    vue: () => avec('src/modeles/modele.md.ts', `const sujet = ${AG}payment.received${AG};`),
  },
  {
    id: 'dossier_a_point',
    famille: 'evenement_hors_nomenclature',
    quoi: "le point d'un DOSSIER n'est pas une extension : sous `v1.md/`, un `.ts` reste du code",
    vue: () => avec('src/v1.md/emetteur.ts', `const sujet = ${AG}payment.received${AG};`),
  },
  {
    id: 'sql_accent_grave_hors_commentaire',
    famille: 'evenement_hors_nomenclature',
    quoi: "en `.sql`, l'accent grave hors commentaire ne cite rien — même juste après un bloc refermé",
    vue: () =>
      avec(
        'prisma/migrations/0003_appat/migration.sql',
        `-- le glossaire refuse ${AG}payment.received${AG} : ce commentaire PORTE la règle\n` +
          `${OUVRE_BLOC_SQL} et ce bloc aussi, sur deux lignes :\n` +
          `${AG}payment.received${AG} ${FERME_BLOC_SQL} UPDATE evenements SET type = ${AG}payment.received${AG};`
      ),
  },
  {
    id: 'sql_terme_nu_en_commentaire',
    famille: 'evenement_hors_nomenclature',
    quoi: "en `.sql`, un commentaire n'exempte que ses accents graves, pas un terme nu",
    vue: () =>
      avec(
        'prisma/migrations/0004_note/migration.sql',
        '-- le producteur emet payment.received\nALTER TABLE evenements ADD COLUMN type text;'
      ),
  },
  {
    id: 'prisma_accent_grave_hors_commentaire',
    famille: 'terme_axionia_invalide',
    quoi: "en `.prisma`, l'accent grave hors commentaire ne cite rien",
    vue: () =>
      avec(
        'prisma/appat.prisma',
        `/// REQ-INT-004 refuse ${AG}Invoice${AG} : ce commentaire PORTE la règle\n` +
          'model Facture {\n' +
          '  id     String @id\n' +
          `  source String @default(${AG}Invoice${AG})\n` +
          '}\n'
      ),
  },
  {
    id: 'prisma_terme_nu_en_commentaire',
    famille: 'terme_axionia_invalide',
    quoi: "en `.prisma`, un commentaire n'exempte que ses accents graves, pas un terme nu",
    vue: () =>
      avec(
        'prisma/appat-nu.prisma',
        '/// le modele Invoice\nmodel Facture {\n  id String @id\n}\n'
      ),
  },
  {
    id: 'litteral_hors_contrat',
    famille: 'evenement_litteral_hors_contrat',
    quoi: 'un nom VALIDE recopié hors du paquet de contrats',
    vue: () => avec('src/server/journal.ts', "if (type === 'paiement.recu') return;"),
  },
  {
    id: 'synonyme_exerce',
    famille: 'synonyme_interdit_du_glossaire',
    quoi: '`qualificateur` employé comme un rôle',
    vue: () => avec('src/server/roles.ts', "const role = 'qualificateur';"),
  },
  {
    // LA FACE ROUGE DE L'ARBITRAGE DU 2026-09-22 (GOV-088, docs/GLOSSAIRE.md §5). Sa face verte est
    // le contre-témoin de la colonne Prisma de `EvenementRecu`, plus bas : l'une ne vaut que par
    // l'autre. `occurredAt` est un champ d'enveloppe (REQ-INT-003) dont AUCUNE autre exigence ne
    // réclame le jeton — c'est ce qui lui laisse un interdit SEC là où `eventId` n'en porte plus.
    id: 'enveloppe_camelcase_hors_contrat',
    famille: 'synonyme_interdit_du_glossaire',
    quoi: "un champ d'enveloppe en camelCase dont le registre ne réclame le jeton pour rien d'autre",
    vue: () =>
      avec('src/server/integrations/emetteur.ts', 'const enveloppe = { occurredAt: quand };'),
  },
];

type ContreTemoin = { quoi: string; vue: () => Vue };

/**
 * Ce que la garde ne doit PAS faire rougir : le côté de chaque frontière d'exemption où elle VAUT,
 * chacun atteignable dans le périmètre.
 */
export const CONTRE_TEMOINS: ContreTemoin[] = [
  {
    quoi: 'la vue conforme, sans témoin ajouté',
    vue: () => VUE_CONFORME,
  },
  {
    quoi: 'un ADR qui EXPLIQUE la règle et cite ses contre-exemples entre accents graves',
    vue: () =>
      avec(
        'docs/adr/0008-contrat-evenements.md',
        [
          'Synonymes interdits : `ETATS_ACTIFS`, et « attribution vivante » sans renvoi.',
          'des noms comme « payment.received », `invoice.issued`, `devis.signed` sont refusés',
          'les modèles `Invoice` et `Refund` ont disparu du schéma voisin',
          'le rôle est `qualifieur` ; `qualificateur` est un synonyme interdit',
          'la liste fermée est `client.cree`, `devis.signe`, `paiement.recu`',
          '```text',
          'le contre-exemple, en bloc : le producteur emettait refund.issued et lisait Refund',
          '```',
        ].join('\n')
      ),
  },
  {
    quoi: 'une citation à cheval sur DEUX lignes, comme le glossaire en porte une',
    vue: () =>
      avec(
        'docs/adr/0011-reception.md',
        'la table de réception est `{source, eventId unique par source,\neventType, payloadHash}`.'
      ),
  },
  {
    quoi: 'CRLF est une fin de ligne : un ADR écrit ainsi est lu, et ses citations restent exemptées',
    vue: () =>
      avec(
        'docs/adr/0012-crlf.md',
        [
          'les noms `invoice.issued` et `devis.signed` sont refusés',
          'le modèle `Invoice` a disparu',
          '',
        ].join(CR + LF)
      ),
  },
  {
    quoi: 'une extension qui cite, DERNIÈRE du nom composé, exempte sa citation : `.ts.md` est de la prose',
    vue: () =>
      avec('docs/adr/9993-note.ts.md', `le producteur emettait ${AG}payment.received${AG}`),
  },
  {
    quoi: "un commentaire de schéma Prisma qui NOMME l'interdit — la forme de `prisma/schema.prisma`",
    vue: () =>
      avec(
        'prisma/schema.prisma',
        `/// Le glossaire nomme ${AG}qualificateur${AG} comme synonyme interdit du rôle console.\n` +
          'model Role {\n' +
          '  id  String @id\n' +
          '  nom String\n' +
          '}\n'
      ),
  },
  {
    quoi: "un commentaire de migration qui NOMME l'interdit",
    vue: () =>
      avec(
        'prisma/migrations/0001_note/migration.sql',
        `-- REQ-INT-004 écarte ${AG}payment.received${AG} au profit de ${AG}paiement.recu${AG}.\n` +
          `${OUVRE_BLOC_SQL} note de migration, sur deux lignes :\n` +
          `le modèle ${AG}Invoice${AG} n'existe pas dans axionia ${FERME_BLOC_SQL}\n` +
          'ALTER TABLE evenements ADD COLUMN type text;'
      ),
  },
  {
    quoi: 'un commentaire SQL IMBRIQUÉ cite encore après la fermeture de son niveau intérieur',
    vue: () =>
      avec(
        'prisma/migrations/0006_imbrique/migration.sql',
        `${OUVRE_BLOC_SQL} niveau 1 ${OUVRE_BLOC_SQL} niveau 2 ${FERME_BLOC_SQL} ` +
          `le modèle ${AG}Invoice${AG} ${FERME_BLOC_SQL}\nSELECT 1;`
      ),
  },
  {
    quoi: 'une chaîne SQL qui porte deux tirets ne commente rien : le commentaire qui la suit cite',
    vue: () =>
      avec(
        'prisma/migrations/0007_chaine/migration.sql',
        `INSERT INTO t VALUES ('-- rien'); -- ${AG}payment.received${AG} est refusé`
      ),
  },
  {
    quoi: "un span de prose sur TROIS lignes d'un même paragraphe",
    vue: () =>
      avec(
        'docs/adr/9992-trois-lignes.md',
        `la table porte ${AG}{source,\neventId,\npayment.received}${AG} en entier`
      ),
  },
  {
    quoi: 'un fichier HORS des racines que le glossaire nomme — la garde ne l’a pas lu, et le dit',
    vue: () => avec('docs/REQUIREMENTS.md', 'REQ-DM-036 — WebhookRecu {source, eventId, …}'),
  },
  {
    quoi: 'un binaire HORS des racines : la garde ne le juge pas, le compte « hors périmètre » le porte',
    vue: () =>
      avecFichierVu({
        chemin: 'public/logo.png',
        octets: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x00, 0x00),
      }),
  },
  {
    quoi: 'un fichier UTF-8 AVEC marque d’ordre sous une racine : c’est du texte, lu en entier',
    vue: () =>
      avecFichierVu({
        chemin: 'src/avec-bom.ts',
        octets: Uint8Array.from([
          0xef,
          0xbb,
          0xbf,
          ...new TextEncoder().encode('export const rien = true;\n'),
        ]),
      }),
  },
  {
    quoi: 'le paquet de contrats, seul endroit où un nom d’événement s’écrit',
    vue: () => avec('packages/contracts/events.ts', "export const T = ['paiement.recu'] as const;"),
  },
  {
    quoi: 'un synonyme interdit SOUS CONDITION (`actif` en colonne) : la garde ne l’exerce pas',
    vue: () => avec('src/domain/apporteur/derive.ts', 'const actif = depots.some(estConfirme);'),
  },
  {
    quoi: 'le terme canonique que le glossaire prescrit',
    vue: () => avec('src/server/roles.ts', "const role = 'qualifieur';"),
  },
  {
    // LA FACE VERTE DE L'ARBITRAGE DU 2026-09-22 (docs/GLOSSAIRE.md §5). Ni commentaire ni accent
    // grave : ce fichier est vert parce que l'interdit est ÉTROIT, jamais parce qu'on l'a exempté.
    // C'est la colonne que SEC-06 écrira, dans la casse que `docs/CONVENTIONS.md` §1 impose au
    // stockage. Sa face rouge — un champ d'enveloppe en camelCase — est tenue par
    // `termes-interdits.spec.ts`, qui juge les deux faces contre le glossaire RÉEL.
    quoi: "la colonne Prisma de `EvenementRecu`, telle que REQ-DM-036 et §5 du glossaire l'épellent",
    vue: () =>
      avec(
        'prisma/schema.prisma',
        'model EvenementRecu {\n' + '  eventId   String @unique\n' + '  eventType String\n' + '}\n'
      ),
  },
];

// ── la preuve et le verdict : des FONCTIONS PURES ────────────────────────────

type RapportDePreuve = {
  /** Les clés couvertes — nourries par le témoin qui MORD, jamais par une faute incidente. */
  couvertes: Set<string>;
  /** Les témoins qui ne mordent plus : le témoin est faux, ou la règle ne couvre plus son cas. */
  sansMorsure: Temoin[];
};

/** Un témoin MORD s'il produit une faute de SA famille et, s'il en nomme un, de SON refus. */
export function eprouver(temoins: readonly Temoin[]): RapportDePreuve {
  const couvertes = new Set<string>();
  const sansMorsure: Temoin[] = [];
  for (const t of temoins) {
    const fautes = controler(t.vue());
    const mord = fautes.some(
      (f) => f.famille === t.famille && (t.refus === undefined || f.refus === t.refus)
    );
    if (mord) {
      couvertes.add(t.famille);
      couvertes.add(cleDeCouverture(t.famille, t.refus));
      couvertes.add(t.id);
    } else sansMorsure.push(t);
  }
  return { couvertes, sansMorsure };
}

/** Ce que le CODE déclare et prouve : confronté, liste par liste, à la population du registre. */
type CodeDeLaPreuve = {
  familles: readonly string[];
  refus: readonly string[];
  citent: readonly string[];
  temoins: readonly Temoin[];
};

type EntreesDeLaPreuve = CodeDeLaPreuve & {
  contreTemoins: readonly ContreTemoin[];
  /** Le texte de `docs/gates.json`, ou l'erreur de sa lecture. */
  registre: string | Error;
};

/** Les entrées de `--prove`, UNE fois : la ligne de commande et la spec passent par ici. */
export function entreesDeLaPreuve(registre: string | Error): EntreesDeLaPreuve {
  return {
    temoins: TEMOINS,
    contreTemoins: CONTRE_TEMOINS,
    registre,
    familles: FAMILLES.map((f) => f.nom),
    refus: REFUS_DE_CONCLURE,
    citent: EXTENSIONS_QUI_CITENT,
  };
}

type Ecarts = {
  /** Ce que le code DÉCLARE et ce que le registre ÉNUMÈRE ne sont pas le même ensemble. */
  divergences: string[];
  /** Les témoins dont la famille ou le refus n'est pas au registre. */
  orphelins: string[];
  /** Les clés du registre qu'aucun témoin QUI MORD ne couvre. */
  manque: string[];
};

/**
 * LES ÉCARTS ENTRE LA POPULATION DU REGISTRE ET CE QUE LE CODE DÉCLARE ET PROUVE, dans les deux sens.
 * `rapport` : l'épreuve des témoins, quand l'appelant l'a déjà faite — un témoin ne s'éprouve qu'UNE
 * fois par décision.
 */
export function ecartsDePopulation(
  population: Population,
  code: CodeDeLaPreuve,
  rapport: RapportDePreuve = eprouver(code.temoins)
): Ecarts {
  const divergences: string[] = [];
  const confronter = (
    quoi: string,
    duCode: readonly string[],
    registre: readonly string[]
  ): void => {
    const codeSeul = duCode.filter((n) => !registre.includes(n));
    const registreSeul = registre.filter((n) => !duCode.includes(n));
    const doubles = duCode.filter((n, i) => duCode.indexOf(n) !== i);
    if (codeSeul.length + registreSeul.length + doubles.length === 0) return;
    divergences.push(
      `${quoi} : le code et docs/gates.json ont divergé — dans le code seulement : ` +
        `${codeSeul.join(', ') || 'rien'} ; au registre seulement : ${registreSeul.join(', ') || 'rien'}` +
        `${doubles.length > 0 ? ` ; en double dans le code : ${doubles.join(', ')}` : ''}.`
    );
  };
  confronter('familles', code.familles, population.familles);
  confronter('refus de conclure', code.refus, population.refus);
  confronter('extensions qui citent', code.citent, population.citent);
  confronter(
    'témoins',
    code.temoins.map((t) => t.id),
    population.temoins
  );

  const orphelins = code.temoins
    .filter(
      (t) =>
        !population.familles.includes(t.famille) ||
        (t.refus !== undefined && !population.refus.includes(t.refus))
    )
    .map((t) => `« ${t.quoi} » (${cleDeCouverture(t.famille, t.refus)})`);

  const manque = [
    ...population.familles,
    ...population.refus.map((r) => cleDeCouverture('source_illisible', r)),
    ...population.temoins,
  ].filter((cle) => !rapport.couvertes.has(cle));

  return { divergences, orphelins, manque };
}

type Decision = { code: 0 | 1; lignes: string[] };

/** La population du registre, ou la phrase qui dit pourquoi elle est illisible. */
function populationOuRefus(registre: string | Error): Population | string {
  try {
    if (registre instanceof Error) throw registre;
    return populationDuRegistre(registre);
  } catch (e) {
    return `la population attendue est ILLISIBLE dans docs/gates.json : ${(e as Error).message}`;
  }
}

/** LA DÉCISION DE `--prove`. La ligne de commande n'en fait qu'imprimer les lignes et sortir du code. */
export function decisionDeLaPreuve(entrees: EntreesDeLaPreuve): Decision {
  const refus: string[] = [];
  const echec = (): Decision => ({ code: 1, lignes: refus.map((r) => `❌ ${r}`) });
  const rapport = eprouver(entrees.temoins);

  for (const t of rapport.sansMorsure) {
    refus.push(
      `Le témoin « ${t.quoi} » (${t.id}) n'a PAS fait rougir « ${cleDeCouverture(t.famille, t.refus)} ». ` +
        "Le témoin est faux, ou la règle ne couvre pas ce qu'elle prétend couvrir."
    );
  }
  for (const c of entrees.contreTemoins) {
    const fautes = controler(c.vue());
    if (fautes.length > 0) {
      refus.push(
        `Faux positif : « ${c.quoi} » a fait rougir « ${fautes[0]!.famille} ».\n   ${fautes[0]!.message}`
      );
    }
  }

  const population = populationOuRefus(entrees.registre);
  if (typeof population === 'string') {
    refus.push(population);
    return echec();
  }
  const ecarts = ecartsDePopulation(population, entrees, rapport);
  refus.push(...ecarts.divergences);
  if (ecarts.orphelins.length > 0) {
    refus.push(
      `${ecarts.orphelins.length} témoin(s) dont la famille ou le refus n'est pas au registre : ` +
        `${ecarts.orphelins.join(', ')}.`
    );
  }
  if (ecarts.manque.length > 0) {
    refus.push(
      `${ecarts.manque.length} entrée(s) de la population du registre sans témoin qui rougit : ` +
        `${ecarts.manque.join(', ')}. Une règle jamais vue rougir ne garde rien.`
    );
  }

  if (refus.length > 0) return echec();
  return {
    code: 0,
    lignes: [
      `✅ ${ID_REGISTRE} — les ${population.familles.length} familles, les ${population.refus.length} refus ` +
        `et les ${population.temoins.length} témoins que docs/gates.json énumère rougissent chacun ; ` +
        `ses ${population.citent.length} extensions qui citent sont celles de la table ; ` +
        `les ${entrees.contreTemoins.length} contre-témoins restent verts.`,
      ...FAMILLES.map((f) => `   • ${f.nom} — ${f.explication}`),
    ],
  };
}

/** Le nombre de fautes que la sortie imprime ; au-delà, elle les COMPTE. */
export const FAUTES_IMPRIMEES = 30;

/** Les zones que la grammaire a réellement découpées dans les fichiers examinés, par nature. */
function ligneDesZones(examines: readonly Examine[]): string {
  const aGrammaire = examines.flatMap((e) => (e.zones === undefined ? [] : [e.zones]));
  const zones = aGrammaire.flat();
  const parNature = NATURES_DE_ZONE.map(
    (n) => `${n.replace(/_/g, ' ')} ${zones.filter((z) => z.nature === n).length}`
  );
  return (
    `   Zones découpées : ${zones.length} zone(s) dans ${aGrammaire.length} fichier(s) à grammaire — ` +
    `${parNature.join(', ')}. Une citation n'exempte que dans une zone que la grammaire a reconnue.`
  );
}

/** LE VERDICT SUR UNE VUE, et tout ce qui s'imprime avec lui — les comptes viennent de ce qui a été EXAMINÉ. */
export function decisionDeLaGarde(vue: Vue): Decision {
  const { fautes, examines } = examiner(vue);
  const perimetre = perimetreDeLaVue(vue);
  const parRacine = perimetre.racines.map((racine) => {
    const lus = examines.filter((e) => e.racine === racine);
    return { racine, n: lus.length, octets: lus.reduce((somme, e) => somme + e.octets, 0) };
  });
  const vides = parRacine.filter((r) => r.n === 0).map((r) => r.racine);
  const refuses = perimetre.lus.length - examines.length;
  const synonymes = synonymesDuGlossaire(vue.glossaire);
  const exerces = synonymes.filter((s) => s.exerce);
  const conditionnels = synonymes.filter((s) => !s.exerce);
  const modeles = modelesRefusesDAxionia(vue.reqInt004, vue.glossaire);
  const gardesAilleurs = conditionnels.filter((s) => modeles.includes(s.terme));
  const horsFamille = perimetre.racines.filter((r) => !dansLaPorteeDesEtats(r));

  const lignes: string[] =
    fautes.length === 0
      ? [`✅ ${ID_REGISTRE} — aucun terme interdit dans les fichiers lus.`]
      : [
          `❌ ${ID_REGISTRE} — ${fautes.length} faute(s) :`,
          '',
          ...fautes.slice(0, FAUTES_IMPRIMEES).map((f) => `   [${f.famille}] ${f.message}`),
          ...(fautes.length > FAUTES_IMPRIMEES
            ? [`   … et ${fautes.length - FAUTES_IMPRIMEES} autre(s).`]
            : []),
          '',
        ];

  lignes.push(
    `   Périmètre : ${examines.length} fichier(s) lu(s) en entier sur ${vue.fichiers.length} suivi(s) — ` +
      parRacine.map((r) => `${r.racine} ${r.n} (${r.octets} octets)`).join(', ') +
      (refuses > 0 ? ` ; ${refuses} refusé(s) sans être jugé(s)` : '') +
      `. Toute extension est lue ; seules ${EXTENSIONS_QUI_CITENT.map((e) => `.${e}`).join(', ')} ` +
      'accordent une exemption de citation, lue sur la dernière extension du nom.',
    ligneDesZones(examines)
  );
  if (vides.length > 0) {
    lignes.push(
      `   ⚠️ Racine(s) VIDE(S) : ${vides.join(', ')} — rien n'y a été lu. Le jour où elles se ` +
        "remplissent sans que ce compte bouge, c'est la garde qui est débranchée."
    );
  }
  lignes.push(
    `   Hors périmètre : ${perimetre.horsPerimetre.length} fichier(s) suivi(s) — les racines sont LUES ` +
      "dans l'en-tête de `docs/GLOSSAIRE.md` ; les élargir est un arbitrage du `gardien-spec`.",
    '   Hors famille : les listes littérales d’états occupants relèvent de `partners:schema:enums` ' +
      `(\`partners/ADR-0011\`), qui lit tout fichier suivi sous ${RACINES_CODE.map((r) => `${r}/`).join(', ')}. ` +
      `Racine(s) de cette garde hors de cette portée : ${horsFamille.join(', ') || 'aucune'} — ` +
      "aucune garde n'y tient cette famille.",
    `   Sources : ${typesEvenementDeLaReq(vue.reqInt004).length} type(s) d'événement (REQ-INT-004), ` +
      `${modeles.length} modèle(s) refusé(s) d'axionia, ` +
      `${exerces.length} synonyme(s) interdit(s) exercé(s) (docs/GLOSSAIRE.md).`
  );
  if (conditionnels.length > 0) {
    lignes.push(
      `   ⚠️ ${conditionnels.length} synonyme(s) NON exercé(s) comme synonyme, parce que le glossaire ` +
        `les assortit d'une condition que la garde ne sait pas juger : ${conditionnels.map((s) => s.terme).join(', ')}.` +
        (gardesAilleurs.length > 0
          ? ` ${gardesAilleurs.map((s) => s.terme).join(', ')} reste(nt) gardé(s) par ` +
            '`terme_axionia_invalide`, le glossaire le nommant aussi comme modèle supprimé.'
          : '') +
        ' Les autres ne sont gardés par rien.'
    );
  }

  return { code: fautes.length === 0 ? 0 : 1, lignes };
}

// ── ligne de commande ────────────────────────────────────────────────────────
// GARDÉE : ce module est IMPORTÉ par son test, et l'import ne doit ni juger ni sortir. Le chemin
// invoqué est comparé à CE module, extension comprise ou non.

const sansExtension = (chemin: string): string => chemin.replace(/\.ts$/, '').toLowerCase();
const APPELE_DIRECTEMENT =
  process.argv[1] !== undefined &&
  sansExtension(resolve(process.argv[1])) === sansExtension(fileURLToPath(import.meta.url));

function lireLeRegistre(): string | Error {
  try {
    return readFileSync(CHEMIN_REGISTRE, 'utf8');
  } catch (e) {
    return e as Error;
  }
}

if (APPELE_DIRECTEMENT) {
  const decision = process.argv.includes('--prove')
    ? decisionDeLaPreuve(entreesDeLaPreuve(lireLeRegistre()))
    : decisionDeLaGarde(vueDuDepot());
  (decision.code === 0 ? console.log : console.error)(decision.lignes.join('\n'));
  process.exit(decision.code);
}
