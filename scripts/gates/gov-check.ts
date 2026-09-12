/**
 * gov-check.ts — la garde des TERMES INTERDITS (GOV-030 ; REQ-DM-003, REQ-INT-004).
 *
 * USAGE : npx tsx scripts/gates/gov-check.ts           (juge le dépôt réel ; sort 1 sur faute)
 *         npx tsx scripts/gates/gov-check.ts --prove   (un témoin ROUGE par famille, des
 *                                                       contre-témoins VERTS, sur une FIXTURE)
 *
 * ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────────────────────
 *
 * `docs/gates.json` déclare depuis GOV-000 une entrée `gov:check` dont le script — ce fichier —
 * N'EXISTAIT PAS, et aucun autre script ne faisait ce travail. Six affirmations du dépôt
 * s'appuyaient dessus : `docs/GLOSSAIRE.md`, `docs/CONVENTIONS.md` §2, `docs/REGLES-MAISON.md`
 * (RM-01 et RM-06), `packages/contracts/events.ts`, REQ-GOV-001 et la vue `docs/GATES.md`.
 * Toutes disaient « `gov:check` rougit sur … » d'une garde qui n'avait jamais tourné.
 *
 * ⚠️ LE NOM DÉSIGNE ENCORE DEUX CHOSES, ET CE FICHIER N'EN TRANCHE QU'UNE.
 * `package.json` déclare sous le même nom `gov:check` une CHAÎNE de seize gardes de gouvernance
 * qu'aucun workflow n'appelle. Le choix entre renommer la chaîne et renommer l'entrée du registre
 * engage un identifiant que six documents citent : l'acceptation de GOV-030 le renvoie
 * explicitement à un ADR, pas à une PR. Ce fichier livre donc la GARDE que le registre décrit ;
 * il ne touche ni à `package.json` ni à `docs/gates.json`.
 *
 * ── CE QU'ELLE TIENT, FAMILLE PAR FAMILLE, ET D'OÙ CHAQUE VALEUR EST LUE (RM-01) ────────────
 *
 * Aucune des listes ci-dessous n'est tapée ici. Chacune se LIT dans sa source unique, et le
 * refus de conclure quand la source est muette est une famille à part entière :
 *
 *   • `terme_axionia_invalide` — `Invoice`, `Refund`, `PaymentScheduleProfile` : des modèles que
 *     le dossier de spécification prête à axionia et qui n'y existent pas (`docs/AFFIRMATIONS-
 *     AXIONIA.md`, repères AFF-01 à AFF-03). LUS dans la clause « aucun événement ne référence …»
 *     de REQ-INT-004 et dans la clause « des modèles supprimés d'axionia » du glossaire.
 *   • `evenement_hors_nomenclature` — un nom d'événement que REQ-INT-004 ne nomme pas, là où
 *     l'exigence impose le français (`payment.received`, `invoice.issued`, `devis.signed`…).
 *     LUS : les sept types valides dans REQ-INT-004, les préfixes d'entité dans ces mêmes types
 *     et dans les synonymes interdits du glossaire.
 *   • `evenement_litteral_hors_contrat` — un nom VALIDE, mais écrit à la main hors de
 *     `packages/contracts`. C'est la clause « aucun nom d'événement littéral hors
 *     packages/contracts » du registre, et `packages/contracts/events.ts` la revendique.
 *   • `liste_litterale_d_etats` — DEUX états occupants ou plus entre guillemets sur une même
 *     ligne, hors de leur source. LUS dans REQ-DM-003, par la dérivation de `schema-enums.ts`
 *     (importée, pas recopiée).
 *   • `synonyme_interdit_du_glossaire` — LUS dans `docs/GLOSSAIRE.md`, dont `docs/PRESEANCE.md`
 *     §2 fait la source primaire sur « un terme et ses synonymes interdits ».
 *   • `source_illisible` / `perimetre_vide` — le refus de rendre un verdict qu'on n'a pas mesuré.
 *
 * ⚠️ LE PARTAGE AVEC `partners:schema:enums`, ET POURQUOI IL N'EST PAS UN DOUBLON.
 * `scripts/gates/schema-enums.ts` porte déjà une famille `liste_litterale_d_etats`. Elle balaie
 * le CODE (`src`, `prisma`, `scripts` en `.ts/.prisma/.sql`) et exige TROIS états sur une ligne.
 * Ici le seuil est DEUX, parce que `('provisoire','active')` — l'index à deux états que le
 * registre nomme, et celui qui a réellement été écrit — passe sous un seuil de trois. Les deux
 * gardes se complètent donc sur le seuil ; ce qu'elles ne dupliquent PAS, c'est la liste des sept
 * états : elle est importée de `schema-enums.ts`, qui la lit dans REQ-DM-003.
 *
 * ── LE PÉRIMÈTRE, ET POURQUOI IL N'EST PAS « PARTOUT » ──────────────────────────────────────
 *
 * Les racines balayées sont LUES dans l'en-tête de `docs/GLOSSAIRE.md` — `prisma/**`, `src/**`,
 * `messages/**`, `docs/adr/**` —, plus `packages/contracts/**` (le motif est sur `RACINE_CONTRATS`).
 * C'est la seule source du dépôt qui donne un périmètre à cette garde, et `docs/PRESEANCE.md` §2
 * lui donne la primauté sur « un terme et ses synonymes interdits ».
 *
 * Le champ `verifie` de `docs/gates.json` écrit « partout (code, docs, registre) ». Pris au mot,
 * il fait rougir 78 fois — mesuré avant d'être écarté — et PAS UNE dans ces racines : les 78 sont
 * dans les registres (`docs/REQUIREMENTS.md`, `docs/REQUIREMENTS-ANNEXE-FUSIONS.md`), là où ils
 * CONSIGNENT l'arbitrage qui a écarté le mauvais terme. Ce n'est pas une tolérance silencieuse :
 * le compte des fichiers laissés dehors est imprimé à chaque exécution, et l'écart entre les deux
 * lectures du périmètre est remonté au `gardien-spec`, à qui l'élargissement appartient.
 *
 * ── L'EXEMPTION QUI PROTÈGE LA DOCUMENTATION DE LA RÈGLE ────────────────────────────────────
 *
 * CITER N'EST PAS SE SERVIR. Les documents qui EXPLIQUENT l'interdit doivent pouvoir écrire son
 * contre-exemple : `docs/GLOSSAIRE.md` énumère les synonymes refusés, `docs/REGLES-MAISON.md`
 * cite `('provisoire','active')`, et les ADR de `docs/adr/**` — qui sont DANS le périmètre —
 * écrivent les noms anglais pour dire qu'ils sont écartés. Une garde qui rougirait là-dessus
 * obligerait à RETIRER le texte qui la porte — défaut déjà rencontré et corrigé sur
 * `gov:identifiants`, qui rougissait sur cinq occurrences de sa propre documentation.
 *
 * La ligne se trace sur le RÔLE DE L'ACCENT GRAVE dans le fichier, pas sur le dossier :
 *   — en `.md`, `.json`, `.yml`, `.sql`, `.prisma`, l'accent grave n'est le délimiteur d'AUCUNE
 *     syntaxe : il ne peut que CITER. Le terme entre accents graves est exempté ;
 *   — en `.ts`, `.tsx`, `.js`, `.jsx`, il OUVRE un gabarit de chaîne : `` `payment.received` ``
 *     y est une valeur, pas une citation. Aucune exemption.
 * Les zones citées d'une ligne sont calculées par `zonesCitees` de `lexique-apporteurs.ts` —
 * importée, pas recopiée : c'est la même question, elle a déjà sa réponse dans ce dépôt.
 *
 * ⚠️ UN SPAN D'ACCENTS GRAVES PEUT TRAVERSER UNE FIN DE LIGNE, et `docs/GLOSSAIRE.md` en porte
 * un : la description de `EvenementRecu` cite `{source …, eventId …, eventType, …}` sur deux
 * lignes. Une exemption calculée ligne à ligne aurait rougi sur la seconde moitié d'une citation.
 * `zonesCiteesDuDocument` apparie donc les accents graves À TRAVERS les fins de ligne, et le
 * contre-témoin homonyme de `--prove` tient ce cas.
 *
 * ── INVARIANT DE LA PREUVE (RM-11) ──────────────────────────────────────────────────────────
 * `--prove` n'écrit rien et ne LIT rien du dépôt : la vue est injectée. Une preuve qui lirait les
 * fichiers réels verdirait ou rougirait au gré de ce que le dépôt contient le jour où elle
 * tourne, et ne dirait plus rien de la garde. En contrepartie, une fixture peut décrire une
 * grammaire que la source n'a plus : `termes-interdits.spec.ts` confronte donc, sur le dépôt
 * réel, ce que la fixture dérive et ce que les sources dérivent.
 *
 * ── INVARIANT DU PÉRIMÈTRE ──────────────────────────────────────────────────────────────────
 * « 0 fichier balayé » n'est pas « aucun défaut ». En phase −1, `messages/` est VIDE et `src/`
 * ne porte que trois fichiers : la garde imprime le compte de CHAQUE racine, zéros compris,
 * nomme celles qui sont vides, et REFUSE de conclure quand le périmètre entier est vide.
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { etatsOccupantsDeLaReq, texteDeLaReq } from './schema-enums';
import { zonesCitees } from './lexique-apporteurs';
import { TYPES_EVENEMENT, TYPES_HORS_CONTRAT_V1 } from '../../packages/contracts/events';

// ── le vocabulaire de la garde ───────────────────────────────────────────────

export type FichierVu = { chemin: string; contenu: string };
export type Faute = { famille: string; message: string };

export type Vue = {
  /** Le texte de REQ-INT-004 — source des sept types valides et des modèles refusés. */
  reqInt004: string;
  /** Le texte de REQ-DM-003 — source des sept états occupants (RM-06). */
  reqDm003: string;
  /** `docs/GLOSSAIRE.md` — source primaire des synonymes interdits (`docs/PRESEANCE.md` §2). */
  glossaire: string;
  /** Les noms d'événements que `packages/contracts` publie, contrat v1 et dette nommée. */
  typesDuContrat: readonly string[];
  /** Les racines jugées, LUES dans l'en-tête du glossaire. Vide = source illisible, pas « tout ». */
  racines: string[];
  /** Les fichiers balayés. Une liste vide est un REFUS, jamais un « rien à signaler ». */
  fichiers: FichierVu[];
};

export const FAMILLES: { nom: string; explication: string }[] = [
  {
    nom: 'source_illisible',
    explication:
      "une des sources (REQ-INT-004, REQ-DM-003, le glossaire, le paquet de contrats) ne rend plus " +
      'ce que la garde compare : elle ne sait plus à quoi confronter le dépôt.',
  },
  {
    nom: 'perimetre_vide',
    explication:
      "aucun fichier à balayer : « 0 fichier » n'est pas « aucun défaut », c'est « je n'ai rien lu ».",
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
    nom: 'liste_litterale_d_etats',
    explication:
      "deux états occupants ou plus recopiés sur une ligne, hors de leur source unique (RM-06).",
  },
  {
    nom: 'synonyme_interdit_du_glossaire',
    explication: "un terme que `docs/GLOSSAIRE.md` déclare interdit sans condition (REQ-GOV-016).",
  },
];

/**
 * Les fichiers dont l'OFFICE est de nommer l'interdit. Chacun porte son motif : exempter sans
 * motif, c'est ouvrir un trou que personne ne relira.
 *
 * Le paquet de contrats n'est PAS ici : il est exempté de la seule famille qui le concerne
 * (`evenement_litteral_hors_contrat`), et reste jugé sur toutes les autres.
 */
const PORTEURS: { chemin: string; motif: string }[] = [
  { chemin: 'scripts/gates/gov-check.ts', motif: 'la garde elle-même — elle nomme ce qu’elle refuse' },
  {
    chemin: 'tests/unit/gouvernance/termes-interdits.spec.ts',
    motif: 'le test de la garde — ses témoins SONT les termes interdits',
  },
  {
    chemin: 'tests/unit/gouvernance/glossaire-enums.spec.ts',
    motif:
      'la garde du glossaire (GOV-006) : elle assère que `qualificateur` est nommé interdit, ' +
      'et une assertion `not.toContain` doit écrire le terme qu’elle refuse',
  },
];

/** La source unique des états occupants, et la garde qui les exerce déjà côté code. */
const PORTEURS_DES_ETATS = [
  'src/domain/attribution/etats.ts',
  'scripts/gates/schema-enums.ts',
  'tests/unit/gouvernance/glossaire-enums.spec.ts',
];

/**
 * Le paquet de contrats — seul endroit où un nom d'événement s'écrit littéralement.
 *
 * Il est AJOUTÉ aux racines que le glossaire nomme, et ce n'est pas une extension de confort :
 * `packages/contracts/events.ts` déclare lui-même que « la garde `gov:check` refuse tout nom
 * d'événement littéral hors `packages/contracts` », et REQ-INT-004 exige qu'« aucun événement ne
 * référence `Invoice` ni `Refund` ». Une exception qui n'est jamais atteinte n'est pas une
 * exception, c'est du code mort qui a l'air de protéger : sans cette racine, le contre-témoin
 * « le paquet de contrats a le droit d'écrire un nom d'événement » serait vert parce qu'il est
 * HORS PÉRIMÈTRE, pas parce que l'exemption fonctionne — un témoin qui bouge pour deux raisons.
 */
const RACINE_CONTRATS = 'packages/contracts/';

const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|sql|prisma)$/;
/** Les seules extensions où l'accent grave DÉLIMITE au lieu de citer. */
const EXTENSIONS_OU_L_ACCENT_GRAVE_DELIMITE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ── lectures pures : chaque liste vient de sa source ─────────────────────────

/** Les jetons entre accents graves d'un texte, dans l'ordre. */
function jetonsCites(texte: string): string[] {
  return [...texte.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
}

const FORME_EVENEMENT = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const FORME_MODELE = /^[A-Z][A-Za-z0-9]*$/;
const FORME_IDENTIFIANT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Les types d'événements valides, LUS dans REQ-INT-004. Un tableau vide n'est pas « rien à
 * dire » : c'est une source illisible, et la famille `source_illisible` le dit.
 */
export function typesEvenementDeLaReq(texte: string): string[] {
  return [...new Set(jetonsCites(texte).filter((j) => FORME_EVENEMENT.test(j)))];
}

/**
 * LES RACINES QUE LA GARDE JUGE, lues dans l'en-tête de `docs/GLOSSAIRE.md` :
 *
 *     « tout synonyme interdit trouvé dans `prisma/**`, `src/**`, `messages/**`, `docs/adr/**`
 *       → rouge (`gov:check`) »
 *
 * ⚠️ C'EST LA SEULE SOURCE DU DÉPÔT QUI DONNE UN PÉRIMÈTRE À CETTE GARDE, et `docs/PRESEANCE.md`
 * §2 donne au glossaire la primauté « sur un terme et ses synonymes interdits », en précisant
 * qu'il n'est dérivé de personne sur ce point. Le champ `verifie` de `docs/gates.json` écrit
 * « partout (code, docs, registre) » : c'est une DESCRIPTION d'entrée de registre, pas une source
 * — et prise au mot elle ferait rougir les registres eux-mêmes, là où ils CONSIGNENT l'arbitrage
 * qui a écarté le mauvais terme (`docs/REQUIREMENTS-ANNEXE-FUSIONS.md` cite `('provisoire',
 * 'active')` pour dire que REQ-DM-003 prévaut sur lui). Mesuré avant d'être tranché : 78 fautes
 * sur le périmètre « partout », dont AUCUNE dans les quatre racines que le glossaire nomme.
 *
 * Ce que le périmètre laisse dehors est IMPRIMÉ à chaque exécution : une garde qui rétrécit sans
 * le dire est une garde qu'on croit plus large qu'elle n'est.
 */
export function racinesDuGlossaire(glossaire: string): string[] {
  // ⚠️ Les séparateurs admettent `>` et les fins de ligne : dans le glossaire réel, la clause est
  // écrite en CITATION Markdown et la liste des racines commence à la ligne suivante, derrière un
  // `>`. Un `\s+` seul s'arrêtait au chevron, ne lisait que deux racines sur quatre, et la garde
  // rendait un vert sur un périmètre amputé de moitié — mesuré ici, corrigé ici.
  const clause = /synonyme interdit trouv[ée]\s+dans[\s>]+((?:`[^`\n]+`[,\s>]*)+)/.exec(glossaire);
  if (!clause) return [];
  return jetonsCites(clause[1]!).map((r) => r.replace(/\*+$/, ''));
}

/**
 * Les modèles d'axionia que rien ne doit référencer. Deux sources, réunies :
 *   — REQ-INT-004, clause « aucun événement ne référence `Invoice` ni `Refund` » ;
 *   — `docs/GLOSSAIRE.md`, clause « … — des modèles supprimés d'axionia ».
 * La seconde en nomme un troisième (`PaymentScheduleProfile`, AFF-03) que l'exigence tait.
 */
export function modelesRefusesDAxionia(reqInt004: string, glossaire: string): string[] {
  const trouves: string[] = [];
  const clauseReq = /ne\s+r[ée]f[ée]rence\s+((?:`[^`]+`(?:\s*(?:,|ni|et)\s*)?)+)/i.exec(reqInt004);
  if (clauseReq) trouves.push(...jetonsCites(clauseReq[1]!));
  const clauseGlossaire = /((?:`[^`\n]+`[,\s]*)+)[—–-]\s*des mod[èe]les supprim[ée]s d'axionia/.exec(
    glossaire
  );
  if (clauseGlossaire) trouves.push(...jetonsCites(clauseGlossaire[1]!));
  return [...new Set(trouves.filter((j) => FORME_MODELE.test(j)))];
}

export type SynonymeInterdit = {
  terme: string;
  /** Faux quand le glossaire assortit l'interdit d'une CONDITION que la garde ne sait pas juger. */
  exerce: boolean;
  motif: string;
};

const MARQUEUR_SYNONYMES = /synonymes?\s+interdits?\s*(?:\*\*)?\s*:/i;

/**
 * Les synonymes interdits, LUS dans `docs/GLOSSAIRE.md`.
 *
 * ── CE QUE « EXERCÉ » VEUT DIRE, ET POURQUOI LA DISTINCTION EXISTE ──────────────────────────
 * Le glossaire écrit deux choses différentes sous le même marqueur :
 *
 *     Synonymes interdits : `inactif`, `churn`, `isActive`.        ← inconditionnel
 *     Synonymes interdits : `actif` en colonne, `en_attente` pour une ligne (réservé à …)
 *                                                                  ← conditionnel
 *
 * Le second interdit un CONTEXTE (« en colonne », « pour une ligne »), pas un mot : `actif` est
 * par ailleurs un état dérivé canonique de l'apporteur, et une garde qui rougirait sur toute
 * occurrence d'`actif` interdirait le glossaire lui-même. Le discriminant est ce qui SUIT le
 * jeton dans la liste : un délimiteur (`,` `;` `.` `)` `|`) ou la fin du bloc = l'interdit vaut
 * tel quel ; de la prose = il porte une condition, et la garde ne l'exerce pas — mais elle le
 * DIT, au lieu de laisser croire qu'elle le garde.
 *
 * Les parenthèses sont des NOTES, pas des conditions : `` `qualificateur` (encore présent dans
 * REQ-SEC-023) `` reste un interdit sec. Ce qu'une note introduit par `→` désigne, en revanche,
 * est le terme CANONIQUE de remplacement : il est retiré de la liste, sans quoi la garde
 * refuserait la solution qu'elle prescrit.
 */
export function synonymesDuGlossaire(glossaire: string): SynonymeInterdit[] {
  const lignes = glossaire.split('\n');
  const out: SynonymeInterdit[] = [];
  const canoniques = new Set<string>();

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;
    const m = MARQUEUR_SYNONYMES.exec(ligne);
    if (!m) continue;

    // Le bloc : la suite de la ligne, puis les lignes suivantes tant qu'on reste dans le même
    // paragraphe. Une cellule de tableau s'arrête à sa barre : la colonne voisine n'est pas la
    // suite de la phrase.
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
    // Une phrase nouvelle n'est plus la liste : « … `EventLog` pour cette table. Ne pas
    // confondre avec `evenements` … » — le second jeton n'est pas un interdit.
    const finDePhrase = /\.\s+[A-ZÀ-Þ]/.exec(bloc);
    if (finDePhrase) bloc = bloc.slice(0, finDePhrase.index);

    for (const cible of bloc.matchAll(/→\s*`([^`\n]+)`/g)) canoniques.add(cible[1]!);

    // Les notes entre parenthèses sont neutralisées AVANT de juger ce qui suit chaque jeton :
    // c'est ce qui distingue une note (`qualificateur` (encore présent …)) d'une condition
    // (`actif` en colonne).
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

  // Le terme canonique de remplacement n'est jamais un interdit, où qu'il ait été lu.
  return out.filter((s) => !canoniques.has(s.terme));
}

// ── les zones citées, y compris quand le span traverse une ligne ─────────────

/**
 * Les zones citées de CHAQUE ligne d'un document — « … », " … " et accents graves —, le span
 * d'accents graves étant apparié À TRAVERS les fins de ligne.
 *
 * ⚠️ POURQUOI L'APPARIEMENT NE PEUT PAS ÊTRE LIGNE À LIGNE. `docs/GLOSSAIRE.md` §5 décrit la
 * table de réception par une citation à cheval sur deux lignes : `` `{source …, eventId unique
 * par source,`` puis ``eventType, payloadHash}` ``. Ligne à ligne, aucune des deux moitiés n'a de
 * paire, donc aucune n'est citée — et la garde rougissait sur `eventId` et `eventType` dans le
 * document même qui les déclare interdits. Mesuré par le contre-témoin homonyme de `--prove`.
 *
 * Les blocs délimités par trois accents graves sont cités EN ENTIER : dans de la prose, un bloc
 * d'exemple est une citation. Ils sont traités à part, sans quoi leurs accents fausseraient
 * l'appariement de tout ce qui suit.
 */
export function zonesCiteesDuDocument(contenu: string): [number, number][][] {
  const lignes = contenu.split('\n');
  const out: [number, number][][] = lignes.map((l) => zonesCitees(l));
  let dansUnBloc = false;
  let ouvertureLigne = -1;
  let ouvertureColonne = -1;

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;
    if (ligne.trimStart().startsWith('```')) {
      dansUnBloc = !dansUnBloc;
      out[i]!.push([0, ligne.length]);
      continue;
    }
    if (dansUnBloc) {
      out[i]!.push([0, ligne.length]);
      continue;
    }
    for (let c = 0; c < ligne.length; c++) {
      if (ligne[c] !== '`') continue;
      if (ouvertureLigne === -1) {
        ouvertureLigne = i;
        ouvertureColonne = c;
        continue;
      }
      if (ouvertureLigne === i) {
        out[i]!.push([ouvertureColonne, c + 1]);
      } else {
        out[ouvertureLigne]!.push([ouvertureColonne, lignes[ouvertureLigne]!.length]);
        for (let k = ouvertureLigne + 1; k < i; k++) out[k]!.push([0, lignes[k]!.length]);
        out[i]!.push([0, c + 1]);
      }
      ouvertureLigne = -1;
    }
  }
  // Un accent grave ouvert et jamais refermé n'exempte RIEN : on ne devine pas une citation.
  return out;
}

// ── le contrôle ──────────────────────────────────────────────────────────────

/** Un motif de mot entier, bornes de mot comprises pour un jeton pointé. */
function motifDuTerme(terme: string): RegExp {
  const echappe = terme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_.])${echappe}(?![A-Za-z0-9_.])`, 'g');
}

type Regle = { famille: string; terme: string; motif: RegExp; conseil: string };

function reglesDeLaVue(vue: Vue): { regles: Regle[]; typesValides: string[]; etats: string[] } {
  const typesValides = typesEvenementDeLaReq(vue.reqInt004);
  const etats = etatsOccupantsDeLaReq(vue.reqDm003);
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

  // Les noms d'événements REFUSÉS : ceux que le glossaire nomme, plus tout `entite.verbe` bâti
  // sur une entité du contrat sans être un type valide. Les préfixes se lisent dans les deux
  // sources — jamais tapés ici.
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

  return { regles, typesValides, etats };
}

/** Le contrôle. PUR : il ne lit rien, il ne juge que la vue qu'on lui donne. */
export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const { regles, typesValides, etats } = reglesDeLaVue(vue);

  // ── les sources, d'abord : une garde qui ne sait plus à quoi comparer ne conclut pas ──
  if (typesValides.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        "REQ-INT-004 ne rend plus aucun nom d'événement : la garde ne sait plus lesquels sont " +
        'valides, et laisserait donc tout passer. Le texte de l’exigence est la source.',
    });
  }
  if (etats.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        "REQ-DM-003 ne donne plus la liste des états occupants : la famille `liste_litterale_d_etats` " +
        "n'a plus rien à chercher (dérivation de `schema-enums.ts`).",
    });
  }
  if (vue.typesDuContrat.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        '`packages/contracts` ne publie plus aucun nom d’événement : la garde ne peut plus dire ' +
        'ce qui est « littéral hors contrat ».',
    });
  }
  const manquants = typesValides.filter((t) => !vue.typesDuContrat.includes(t));
  if (typesValides.length > 0 && manquants.length > 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        `Le paquet de contrats ne porte pas ${manquants.join(', ')}, que REQ-INT-004 nomme. ` +
        'Les deux sources ont divergé : la garde condamnerait l’une au nom de l’autre.',
    });
  }
  if (synonymesDuGlossaire(vue.glossaire).length === 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        '`docs/GLOSSAIRE.md` ne rend plus aucun synonyme interdit. `docs/PRESEANCE.md` §2 en fait ' +
        'la source primaire sur ce point : sans elle, la famille est vide et toujours verte.',
    });
  }
  if (vue.racines.length === 0) {
    fautes.push({
      famille: 'source_illisible',
      message:
        "l'en-tête de `docs/GLOSSAIRE.md` ne donne plus les racines où la garde cherche. Sans " +
        'périmètre lu, elle jugerait tout ou rien — et « rien » est un vert qui ment.',
    });
  }

  // ── le périmètre ──────────────────────────────────────────────────────────
  const racines = [...vue.racines, RACINE_CONTRATS];
  const dansLePerimetre = (chemin: string): boolean => racines.some((r) => chemin.startsWith(r));
  const balayes = vue.fichiers.filter((f) => EXTENSIONS.test(f.chemin) && dansLePerimetre(f.chemin));
  if (balayes.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        `aucun fichier à balayer dans ${racines.join(', ')}. « 0 fichier » et « aucun défaut » ` +
        'sont deux phrases différentes, et une seule autorise à conclure.',
    });
    return fautes;
  }

  const quotesEtats =
    etats.length > 0 ? new RegExp(`['"\`]?(${etats.join('|')})['"\`]?`, 'g') : null;
  const quotesEtatsStrictes =
    etats.length > 0 ? new RegExp(`['"\`](${etats.join('|')})['"\`]`, 'g') : null;

  for (const fichier of balayes) {
    if (PORTEURS.some((p) => p.chemin === fichier.chemin)) continue;

    const accentGraveDelimite = EXTENSIONS_OU_L_ACCENT_GRAVE_DELIMITE.test(fichier.chemin);
    const zones = accentGraveDelimite ? null : zonesCiteesDuDocument(fichier.contenu);
    const dansLeContrat = fichier.chemin.startsWith(RACINE_CONTRATS);
    const porteurDesEtats = PORTEURS_DES_ETATS.includes(fichier.chemin);

    fichier.contenu.split('\n').forEach((ligne, i) => {
      const citees = zones?.[i] ?? [];
      const cite = (index: number): boolean => citees.some(([a, b]) => index >= a && index < b);

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

      // RM-06 : deux de ces sept noms entre guillemets sur une même ligne sont une liste.
      // Le seuil est DEUX et non trois : l'index à deux états `('provisoire','active')` est
      // exactement ce que le registre nomme, et c'est celui qui a été écrit en production.
      if (quotesEtatsStrictes === null || quotesEtats === null || porteurDesEtats) return;
      quotesEtatsStrictes.lastIndex = 0;
      const trouves = new Set(
        [...ligne.matchAll(quotesEtatsStrictes)]
          .filter((x) => !cite(x.index))
          .map((x) => x[1]!)
      );
      if (trouves.size >= 2) {
        fautes.push({
          famille: 'liste_litterale_d_etats',
          message:
            `${fichier.chemin}:${i + 1} — liste littérale d'états occupants (${[...trouves].join(', ')}). ` +
            'Importe `ETATS_OCCUPANTS` de `src/domain/attribution/etats.ts` : une liste recopiée ne ' +
            "suit jamais l'exigence, et l'index qui n'en couvrait que deux sur sept n'a rien fait rougir.",
        });
      }
    });
  }

  return fautes;
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

/**
 * La vue du dépôt. Le périmètre vient de `fichiersSuivisOuRefus`, qui REFUSE au lieu de rendre
 * `[]` quand git est muet (une garde d'argent verte sur zéro fichier, dans un dépôt public, est
 * ce qui a fait naître ce fichier partagé). Les fichiers hors des racines du glossaire sont
 * conservés dans la vue : c'est `controler` qui les écarte, pour que le tri soit lui aussi
 * exercé par la preuve au lieu d'être invisible.
 */
export function vueDuDepot(): Vue {
  const glossaire = readFileSync('docs/GLOSSAIRE.md', 'utf8');
  const fichiers = fichiersSuivisOuRefus('gov:check')
    .filter((chemin) => EXTENSIONS.test(chemin))
    .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') }));
  return {
    reqInt004: texteDeLaReq('REQ-INT-004'),
    reqDm003: texteDeLaReq('REQ-DM-003'),
    glossaire,
    typesDuContrat: [...TYPES_EVENEMENT, ...TYPES_HORS_CONTRAT_V1.map((t) => t.type)],
    racines: racinesDuGlossaire(glossaire),
    fichiers,
  };
}

// ── la fixture de la preuve (RM-11 : elle ne lit rien du dépôt) ──────────────

/**
 * Source des fixtures : la FORME des textes réels — `docs/requirements.json` (REQ-INT-004,
 * REQ-DM-003) et `docs/GLOSSAIRE.md` §1, §2, §5 et §7 — reproduite au plus court. Les valeurs
 * sont celles des sources ; ce qui est fixé ici, c'est la TOURNURE que la garde doit savoir lire.
 */
const REQ_INT_004_FIXTURE =
  "Les types d'événements sont : `client.cree`, `client.mis_a_jour`, `devis.signe`, " +
  '`facture.emise`, `avoir.emis`, `paiement.recu`, `paiement.rembourse` — nommés sur les modèles ' +
  'réels (Client, Devis, FactureFormation, Payment) ; aucun événement ne référence `Invoice` ni `Refund`.';

const REQ_DM_003_FIXTURE =
  'Au plus une attribution occupante par SIREN : index unique partiel où ETATS_OCCUPANTS = ' +
  '{provisoire, active, rdv_pris, proposition, signee, convertie, figee_resiliation}, la liste ' +
  'étant une constante unique partagée par le code et la migration.';

const GLOSSAIRE_FIXTURE = [
  '# Glossaire — Axion Partners',
  '',
  '> Gate `glossaire-enums.spec.ts` : tout synonyme interdit trouvé dans `prisma/**`, `src/**`,',
  '> `messages/**`, `docs/adr/**` → rouge (`gov:check`).',
  '',
  '## 1. Attribution',
  '',
  "`ON attributions(siren) WHERE statut IN (…)`. Synonymes interdits : `('provisoire','active')`",
  '(index à 2 états), « attribution vivante » sans renvoi à la constante, `ETATS_ACTIFS`.',
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
  'Synonymes interdits : `eventId`, `eventType`, `schemaVersion` — la forme camelCase des champs',
  "d'enveloppe ; `payment.received`, `refund.issued`, `invoice.issued`, `devis.signed`,",
  '`client.created` ; `Invoice`, `Refund`, `PaymentScheduleProfile` — des modèles supprimés',
  "d'axionia qu'aucun événement ne référence.",
  '',
  '## 7. Rôles console',
  '',
  'Identifiant **unique** : `qualifieur`. Synonyme interdit : `qualificateur` (encore présent dans',
  'REQ-SEC-023), `reviewer`.',
  '',
].join('\n');

export const VUE_CONFORME: Vue = {
  reqInt004: REQ_INT_004_FIXTURE,
  reqDm003: REQ_DM_003_FIXTURE,
  glossaire: GLOSSAIRE_FIXTURE,
  typesDuContrat: [
    'client.cree',
    'client.mis_a_jour',
    'devis.signe',
    'facture.emise',
    'avoir.emis',
    'paiement.recu',
    'paiement.rembourse',
  ],
  // DÉRIVÉE de la fixture, jamais tapée : si la lecture de l'en-tête casse, la vue conforme perd
  // son périmètre et `source_illisible` rougit — la preuve tient donc aussi la dérivation.
  racines: racinesDuGlossaire(GLOSSAIRE_FIXTURE),
  fichiers: [{ chemin: 'src/config/fixture.ts', contenu: 'export const rien = true;\n' }],
};

// ── ligne de commande ────────────────────────────────────────────────────────
// GARDÉE : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement — vu sur `perf-budgets.ts`
// le 2026-09-05 (« Error: process.exit unexpectedly called with "0" », zéro test exécuté), et vu
// à nouveau ici pendant l'écriture de cette garde.
const APPELE_DIRECTEMENT = /gov-check\.ts$/.test(process.argv[1] ?? '');

// ── mode --prove : chaque famille rougit sur son témoin, les contre-témoins restent verts ──

if (APPELE_DIRECTEMENT && process.argv.includes('--prove')) {
  const avec = (chemin: string, contenu: string): Vue => ({
    ...VUE_CONFORME,
    fichiers: [...VUE_CONFORME.fichiers, { chemin, contenu }],
  });

  const TEMOINS: { famille: string; quoi: string; vue: () => Vue }[] = [
    {
      famille: 'source_illisible',
      quoi: "REQ-INT-004 ne nomme plus aucun type d'événement",
      vue: () => ({ ...VUE_CONFORME, reqInt004: "Les types d'événements sont nommés ailleurs." }),
    },
    {
      famille: 'perimetre_vide',
      quoi: 'aucun fichier à balayer',
      vue: () => ({ ...VUE_CONFORME, fichiers: [] }),
    },
    {
      famille: 'terme_axionia_invalide',
      quoi: 'un modèle `Invoice` référencé dans du code',
      vue: () => avec('src/server/facture.ts', 'const f: Invoice = await lire(id);'),
    },
    {
      famille: 'evenement_hors_nomenclature',
      quoi: "la `fixtureRouge` du registre : `payment.received` dans un fichier de docs",
      vue: () => avec('docs/adr/0011-temoin.md', 'le producteur emet payment.received a la signature'),
    },
    {
      famille: 'evenement_litteral_hors_contrat',
      quoi: 'un nom VALIDE recopié hors du paquet de contrats',
      vue: () => avec('src/server/journal.ts', "if (type === 'paiement.recu') return;"),
    },
    {
      famille: 'liste_litterale_d_etats',
      quoi: "l'index à DEUX états que le registre nomme",
      vue: () => avec('prisma/migrations/0001_index/migration.sql', "WHERE statut IN ('provisoire','active')"),
    },
    {
      famille: 'source_illisible',
      quoi: "l'en-tête du glossaire ne donne plus les racines à balayer",
      vue: () => ({ ...VUE_CONFORME, racines: [] }),
    },
    {
      famille: 'synonyme_interdit_du_glossaire',
      quoi: '`qualificateur` employé comme un rôle',
      vue: () => avec('src/server/roles.ts', "const role = 'qualificateur';"),
    },
  ];

  /**
   * Ce que la garde ne doit PAS faire rougir. Une garde qui rougit sur tout ne dit rien de plus
   * qu'une garde qui ne rougit jamais — et celle-ci interdirait sa propre documentation.
   */
  const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
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
            "Synonymes interdits : `('provisoire','active')` (index à 2 états), `ETATS_ACTIFS`.",
            'des noms comme `payment.received`, `invoice.issued`, `devis.signed` sont refusés',
            'les modèles `Invoice` et `Refund` ont disparu du schéma voisin',
            'le rôle est `qualifieur` ; `qualificateur` est un synonyme interdit',
            'la liste fermée est `client.cree`, `devis.signe`, `paiement.recu`',
          ].join('\n')
        ),
    },
    {
      quoi: 'une citation à cheval sur deux lignes, comme le glossaire en porte une',
      vue: () =>
        avec(
          'docs/adr/0011-reception.md',
          'la table de réception est `{source, eventId unique par source,\neventType, payloadHash}`.'
        ),
    },
    {
      quoi: 'un fichier HORS des racines que le glossaire nomme — la garde ne l’a pas lu, et le dit',
      vue: () => avec('docs/REQUIREMENTS.md', 'REQ-DM-036 — WebhookRecu {source, eventId, …}'),
    },
    {
      quoi: 'le paquet de contrats, seul endroit où un nom d’événement s’écrit',
      vue: () => avec('packages/contracts/events.ts', "export const T = ['paiement.recu'] as const;"),
    },
    {
      quoi: 'la source unique des états occupants',
      vue: () =>
        avec('src/domain/attribution/etats.ts', "export const ETATS_OCCUPANTS = ['provisoire', 'active'];"),
    },
    {
      quoi: 'un synonyme interdit SOUS CONDITION (`actif` en colonne) : la garde ne l’exerce pas',
      vue: () => avec('src/domain/apporteur/derive.ts', 'const actif = depots.some(estConfirme);'),
    },
    {
      quoi: 'le terme canonique que le glossaire prescrit',
      vue: () => avec('src/server/roles.ts', "const role = 'qualifieur';"),
    },
  ];

  const rouges = new Set<string>();
  for (const t of TEMOINS) {
    const fautes = controler(t.vue());
    if (!fautes.some((f) => f.famille === t.famille)) {
      console.error(
        `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir la famille « ${t.famille} ». ` +
          `Le témoin est faux, ou la règle ne couvre pas ce qu'elle prétend couvrir.`
      );
      process.exit(1);
    }
    fautes.forEach((f) => rouges.add(f.famille));
  }

  for (const c of CONTRE_TEMOINS) {
    const fautes = controler(c.vue());
    if (fautes.length > 0) {
      console.error(
        `❌ Faux positif : « ${c.quoi} » a fait rougir « ${fautes[0]!.famille} ».\n` +
          `   ${fautes[0]!.message}\n` +
          "   C'est un usage légitime — la règle est trop large, et une garde qui condamne le cas " +
          "normal n'est pas un progrès."
      );
      process.exit(1);
    }
  }

  const sansTemoin = FAMILLES.map((f) => f.nom).filter((f) => !rouges.has(f));
  if (sansTemoin.length > 0) {
    console.error(
      `❌ ${sansTemoin.length} famille(s) de règle sans témoin qui rougit : ${sansTemoin.join(', ')}.\n` +
        '   Une règle jamais vue rougir ne garde rien. Ajoute-lui un témoin dans TEMOINS.'
    );
    process.exit(1);
  }

  console.log(
    `✅ gov:check — les ${FAMILLES.length} familles rougissent chacune sur son témoin, et les ` +
      `${CONTRE_TEMOINS.length} contre-témoins restent verts.`
  );
  console.log(FAMILLES.map((f) => `   • ${f.nom} — ${f.explication}`).join('\n'));
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

if (APPELE_DIRECTEMENT && !process.argv.includes('--prove')) {
  const vue = vueDuDepot();
  const fautes = controler(vue);

  const racines = [...vue.racines, RACINE_CONTRATS];
  const parRacine = racines.map((r) => ({
    racine: r,
    nombre: vue.fichiers.filter((f) => f.chemin.startsWith(r)).length,
  }));
  const balayes = parRacine.reduce((n, p) => n + p.nombre, 0);
  const horsPerimetre = vue.fichiers.filter((f) => !racines.some((r) => f.chemin.startsWith(r)));
  const synonymes = synonymesDuGlossaire(vue.glossaire);
  const exerces = synonymes.filter((s) => s.exerce);
  const conditionnels = synonymes.filter((s) => !s.exerce);

  const perimetre = [
    `   Périmètre : ${balayes} fichier(s) balayé(s) — ` +
      parRacine.map((p) => `${p.racine} ${p.nombre}`).join(', ') + '.',
    // « 0 fichier » ne se lit pas comme « aucun défaut » : les racines vides sont NOMMÉES.
    ...(parRacine.some((p) => p.nombre === 0)
      ? [
          `   ⚠️ Racine(s) VIDE(S) : ${parRacine
            .filter((p) => p.nombre === 0)
            .map((p) => p.racine)
            .join(', ')} — rien n'y a été lu. En phase −1, \`src/\` et \`messages/\` sont vides ou ` +
            "presque par construction ; le jour où elles se remplissent sans que ce compte bouge, " +
            "c'est la garde qui est débranchée.",
        ]
      : []),
    // Ce que la garde NE lit PAS, dit à voix haute : les racines viennent de l'en-tête du
    // glossaire, et 165 fichiers suivis restent dehors. Une garde qui tait son angle mort se
    // fait lire comme si elle n'en avait pas.
    `   Hors périmètre : ${horsPerimetre.length} fichier(s) suivi(s) — les racines sont LUES dans ` +
      "l'en-tête de `docs/GLOSSAIRE.md`, à qui `docs/PRESEANCE.md` §2 donne la primauté sur un " +
      'terme et ses synonymes interdits. Élargir ce périmètre est un arbitrage du `gardien-spec`, ' +
      'pas une option de cette garde.',
    `   Sources : ${typesEvenementDeLaReq(vue.reqInt004).length} type(s) d'événement (REQ-INT-004), ` +
      `${etatsOccupantsDeLaReq(vue.reqDm003).length} état(s) occupant(s) (REQ-DM-003), ` +
      `${exerces.length} synonyme(s) interdit(s) exercé(s) (docs/GLOSSAIRE.md).`,
    ...(conditionnels.length > 0
      ? [
          `   ⚠️ ${conditionnels.length} synonyme(s) NON exercé(s), parce que le glossaire les assortit ` +
            `d'une condition que la garde ne sait pas juger : ${conditionnels
              .map((s) => s.terme)
              .join(', ')}. Ils ne sont gardés par rien — le dire vaut mieux que le laisser croire.`,
        ]
      : []),
  ].join('\n');

  if (fautes.length === 0) {
    console.log('✅ gov:check — aucun terme interdit dans les fichiers suivis.');
    console.log(perimetre);
    process.exit(0);
  }
  console.error(`❌ gov:check — ${fautes.length} terme(s) interdit(s) :\n`);
  fautes.slice(0, 30).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
  if (fautes.length > 30) console.error(`   … et ${fautes.length - 30} autre(s).`);
  console.error('');
  console.error(perimetre);
  process.exit(1);
}
