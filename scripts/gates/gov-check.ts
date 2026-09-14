/**
 * gov-check.ts — la garde des TERMES INTERDITS (GOV-030 ; REQ-DM-003, REQ-INT-004).
 *
 * USAGE : npx tsx scripts/gates/gov-check.ts           (juge le dépôt réel ; sort 1 sur faute)
 *         npx tsx scripts/gates/gov-check.ts --prove   (un témoin ROUGE par famille et par refus,
 *                                                       des contre-témoins VERTS, sur une FIXTURE)
 *
 * ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────────────────────
 *
 * `docs/gates.json` déclare depuis GOV-000 une entrée `gov:check` dont le script — ce fichier —
 * N'EXISTAIT PAS, et aucun autre script ne faisait ce travail. SIX DOCUMENTS du dépôt s'appuyaient
 * dessus, par sept références : `docs/GLOSSAIRE.md`, `docs/CONVENTIONS.md` §2,
 * `docs/REGLES-MAISON.md` (RM-01 et RM-06 — deux affirmations, un seul document),
 * `packages/contracts/events.ts`, REQ-GOV-001 et la vue `docs/GATES.md`. Toutes disaient
 * « `gov:check` rougit sur … » d'une garde qui n'avait jamais tourné.
 *
 * ⚠️ « six DOCUMENTS », et non « six affirmations » : la liste en produit SEPT. La lentille
 * `exactitude` a relevé l'écart — le compte était juste, le nom du compté ne l'était pas.
 *
 * ⚠️ LE NOM DÉSIGNE ENCORE DEUX CHOSES, ET CE FICHIER N'EN TRANCHE QU'UNE.
 * `package.json` déclare sous le même nom `gov:check` une CHAÎNE de seize gardes de gouvernance
 * qu'aucun workflow n'appelle. Le choix entre renommer la chaîne et renommer l'entrée du registre
 * engage un identifiant que six documents citent : l'acceptation de GOV-030 le renvoie
 * explicitement à un ADR, pas à une PR. Ce fichier livre donc la GARDE que le registre décrit.
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
 *   • `synonyme_interdit_du_glossaire` — LUS dans `docs/GLOSSAIRE.md`, dont `docs/PRESEANCE.md`
 *     §2 fait la source primaire sur « un terme et ses synonymes interdits ».
 *   • `source_illisible` / `perimetre_vide` — le refus de rendre un verdict qu'on n'a pas mesuré.
 *     ⚠️ `source_illisible` couvre CINQ refus distincts. La lentille `mutation` en a neutralisé
 *     six, un par un (le sixième — la liste d'états vide — est parti avec sa famille) : QUATRE
 *     sont restés verts, dont TROIS des cinq qui restent ici. Une famille pour cinq refus, c'est
 *     une population plus grossière que ce qu'elle prétend garder. Les refus sont donc DÉCLARÉS
 *     (`REFUS_DE_CONCLURE`), chaque faute nomme le sien, et `--prove` exige un témoin PAR REFUS.
 *     Le NOM de la famille reste `source_illisible` : quatre autres gardes l'emploient
 *     (`gov-depot.ts`, `gov-entite.ts`, `perf-budgets.ts`, `schema-enums.ts`), et une garde qui
 *     renomme pour elle seule un mot de vocabulaire partagé fait diverger ce qu'elle tient.
 *
 * ── ⚠️ LA FAMILLE `liste_litterale_d_etats` N'EST PAS ICI, ET C'EST DÉLIBÉRÉ ─────────────────
 *
 * Elle a existé dans ce fichier, au seuil DEUX, pendant que `scripts/gates/schema-enums.ts`
 * (GOV-006) la portait au seuil TROIS — deux implémentations du même nom de famille, dans le même
 * job `gate-a`, à quatre étapes d'écart, rendant des VERDICTS OPPOSÉS sur la même entrée. La
 * lentille `simplicite` l'a mesuré ; `partners/ADR-0011` tranche : UNE SEULE implémentation,
 * chez GOV-006, au discriminant de COUVERTURE (une ligne qui énumère un sous-ensemble des états
 * occupants, hors de sa source, est rouge — la clause SQL comme la comparaison booléenne).
 *
 * CE QUE LE DÉPLACEMENT COÛTE, DIT À VOIX HAUTE — parce qu'une fusion qui perd une racine en
 * silence est exactement le défaut qu'on vient de fermer. `partners:schema:enums` balaie
 * `src`, `prisma` et `scripts` en `.ts/.tsx/.prisma/.sql`. Les trois racines que cette garde-ci
 * balayait et que l'autre ne balaie PAS sont donc, pour cette famille seulement :
 * `messages/**`, `docs/adr/**` et `packages/contracts/**`. En contrepartie, GOV-006 garde la
 * racine `scripts/`, que cette garde n'a jamais lue et où vivaient les sept seules occurrences du
 * dépôt. Aucune des deux n'est un sur-ensemble de l'autre : l'arbitrage est écrit dans l'ADR, pas
 * déduit ici, et la sortie de cette garde le RÉPÈTE à chaque exécution.
 *
 * ── LE PÉRIMÈTRE, ET POURQUOI IL N'EST PAS « PARTOUT » ──────────────────────────────────────
 *
 * Les racines balayées sont LUES dans l'en-tête de `docs/GLOSSAIRE.md` — `prisma/**`, `src/**`,
 * `messages/**`, `docs/adr/**` —, plus `packages/contracts/**` (le motif est sur `RACINE_CONTRATS`).
 * C'est la seule source du dépôt qui donne un périmètre à cette garde, et `docs/PRESEANCE.md` §2
 * lui donne la primauté sur « un terme et ses synonymes interdits ».
 *
 * Le champ `verifie` de `docs/gates.json` écrivait « partout (code, docs, registre) ». Pris au
 * mot, il fait rougir 78 fois — mesuré avant d'être écarté — et PAS UNE dans ces racines.
 * ⚠️ LA VENTILATION RÉELLE DE CES 78, parce que la première rédaction les disait toutes « dans
 * les registres » et que c'est cette phrase qui porte l'argument du périmètre restreint :
 *   — 44 dans les deux registres : `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` 25, `docs/REQUIREMENTS.md` 19 ;
 *   — 34 AILLEURS : `scripts/gates/gov-sonde.ts` 16,
 *     `tests/unit/gouvernance/affirmations-verifiees.spec.ts` 10, `docs/TASKS.md` 3,
 *     `tests/unit/integration/contrat-hash.spec.ts` 3, `scripts/gates/gov-autonomie.ts` 1,
 *     `tests/unit/gouvernance/registre-lecteur-unique.spec.ts` 1.
 * Les 34 ne CONSIGNENT aucun arbitrage : élargir le périmètre coûterait un vrai correctif, pas
 * une exemption de registre — et l'un d'eux est dans un `.ts`, où aucune exemption de citation ne
 * joue. L'écart est remonté au `gardien-spec`, à qui l'élargissement appartient, et le compte des
 * fichiers laissés dehors est imprimé à chaque exécution.
 *
 * ── L'EXEMPTION DE CITATION SE DÉFINIT PAR LA GRAMMAIRE DU FICHIER ───────────────────────────
 *
 * CITER N'EST PAS SE SERVIR. Les documents qui EXPLIQUENT l'interdit doivent pouvoir écrire son
 * contre-exemple : `docs/GLOSSAIRE.md` énumère les synonymes refusés, et les ADR de `docs/adr/**`
 * — qui sont DANS le périmètre — écrivent les noms anglais pour dire qu'ils sont écartés. Une
 * garde qui rougirait là-dessus obligerait à RETIRER le texte qui la porte — défaut déjà rencontré
 * et corrigé sur `gov:identifiants`, qui rougissait sur cinq occurrences de sa documentation.
 *
 * ⚠️ CE QUI A ÉTÉ CORRIGÉ ICI, ET POURQUOI L'AXE N'EST PAS L'EXTENSION. La première rédaction
 * appliquait `zonesCitees` — une heuristique de PROSE, écrite pour `lexique-apporteurs.ts` — à
 * tout fichier non-`.ts`. Trois évasions mesurées, toutes en sortie zéro sur du contenu interdit :
 *   1. le guillemet DROIT y vaut citation. Or c'est le seul délimiteur de chaîne de JSON :
 *      `messages/**`, une racine que cette garde DÉCLARE balayer, y était aveugle à 100 % PAR
 *      CONSTRUCTION — le compte de fichiers bougeait, et la garde ne lisait rien ;
 *   2. deux accents graves éloignés d'un `.md` blanchissaient TOUT l'intervalle : quatre fautes
 *      effacées par une simple coquille dans un ADR ;
 *   3. en `.sql` et en `.prisma`, tout accent grave exemptait, commentaire ou pas.
 *
 * L'exemption se lit donc désormais sur la GRAMMAIRE du fichier, et sur la POSITION dans le
 * fichier — jamais sur son extension seule :
 *   — `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` : l'accent grave OUVRE un gabarit de chaîne.
 *     AUCUNE exemption ; un terme y est une valeur, pas une citation ;
 *   — `.json` : tout y est une valeur, et le guillemet droit est le délimiteur. AUCUNE exemption ;
 *   — `.md` : de la prose. Les blocs à trois accents graves sont cités en entier S'ILS SE
 *     REFERMENT — une clôture impaire n'ouvre rien, sans quoi une coquille amnistierait toute la
 *     fin du document ; un span
 *     d'accents graves est cité s'il se ferme sur SA ligne ou sur la SUIVANTE — pas au-delà ;
 *     les guillemets français citent aussi. Le guillemet droit, lui, ne cite pas : en Markdown il
 *     n'a aucun rôle syntaxique, et l'admettre rouvre l'évasion n°1 ;
 *   — `.yml`, `.yaml` et toute extension non nommée : AUCUNE exemption. Aucun fichier YAML ne vit
 *     dans les racines, donc une exemption YAML n'aurait AUCUN contre-témoin atteignable — et une
 *     exemption qu'on n'atteint jamais est du code mort qui a l'air de protéger ;
 *   — `.sql`, `.prisma` : l'accent grave n'y délimite rien (Postgres cite ses
 *     identifiants par guillemets doubles, Prisma par rien), donc il CITE — mais SEULEMENT DANS
 *     UN COMMENTAIRE (les deux tirets et le bloc barre-étoile en SQL, la double ou triple barre
 *     en Prisma). Hors
 *     commentaire, aucune raison d'exempter. Mesuré sur le dépôt réel : les
 *     onze lignes à accent grave de `prisma/schema.prisma` sont TOUTES des commentaires triple
 *     barre, dont `:49` qui écrit noir sur blanc que `qualificateur` est un synonyme interdit. Un
 *     discriminant par EXTENSION aurait rougi sur ce commentaire-là, c'est-à-dire sur le texte qui
 *     porte la règle ; le discriminant par POSITION est vert dessus et fermé sur l'appât. Le
 *     contre-témoin `.prisma` de `--prove` tient ce cas, et il est ATTEIGNABLE.
 *
 * ⚠️ POURQUOI LE SPAN D'ACCENTS GRAVES TRAVERSE UNE LIGNE, ET UNE SEULE. `docs/GLOSSAIRE.md` en
 * porte un : la description de `EvenementRecu` cite `{source …, eventId …, eventType, …}` sur deux
 * lignes. Une exemption calculée ligne à ligne aurait rougi sur la seconde moitié d'une citation.
 * Mais un appariement SANS BORNE fait d'une coquille une amnistie générale : la borne est d'UNE
 * continuation. Au-delà, l'accent grave pendant est abandonné et le suivant rouvre un span.
 *
 * ── LA POPULATION DE LA PREUVE VIENT DU REGISTRE, PAS DE CE FICHIER ─────────────────────────
 *
 * `--prove` ne peut pas être sa propre population. La lentille `mutation` a mesuré trois façons de
 * rendre « chaque famille rougit sur son témoin » FAUSSE sans qu'une étape bouge : retirer une
 * entrée de `FAMILLES` (le compte attendu et le compte imprimé bougeaient ENSEMBLE), supprimer un
 * témoin (l'ensemble couvert était nourri par TOUTES les fautes de TOUS les témoins, donc une
 * faute incidente tenait la famille d'un autre), et rendre la boucle inatteignable.
 *
 * Les trois sont fermées ici, et la logique vit dans deux fonctions PURES et exportées
 * (`eprouver`, `ecartsDePopulation`) pour que le contrôle en exerce chaque branche :
 *   — la population attendue est LUE dans le champ `verifie` de l'entrée `gov:check` de
 *     `docs/gates.json`. Elle ne vient plus du module jugé. Un registre muet est un REFUS ;
 *   — `FAMILLES` et `REFUS_DE_CONCLURE` sont CONFRONTÉS à cette population DANS LES DEUX SENS :
 *     retirer une entrée du code seul fait rougir, et retirer une entrée du registre seul rend
 *     ses témoins ORPHELINS, ce qui rougit aussi ;
 *   — l'ensemble couvert n'est nourri QUE par la faute qui porte la famille ET le refus du témoin.
 *     Une faute incidente ne couvre plus rien, et supprimer un témoin découvre SA clé.
 *
 * ⚠️ RM-11, ET CE QU'IL INTERDIT EXACTEMENT. `--prove` ne juge que des vues INJECTÉES : le
 * VERDICT ne dépend d'aucun fichier du dépôt, et c'est cela que RM-11 protège. Ce qu'il lit du
 * dépôt, c'est la DÉCLARATION de ce qu'il doit prouver — le registre —, jamais la matière jugée.
 * Le chemin du registre est résolu depuis ce fichier, pas depuis le répertoire courant, pour que
 * la preuve ne dépende pas non plus d'où on la lance. En contrepartie, une fixture peut décrire
 * une grammaire que la source n'a plus : `termes-interdits.spec.ts` confronte donc, sur le dépôt
 * réel, ce que la fixture dérive et ce que les sources dérivent.
 *
 * ── INVARIANT DU PÉRIMÈTRE ──────────────────────────────────────────────────────────────────
 * « 0 fichier balayé » n'est pas « aucun défaut ». En phase −1, `messages/` est VIDE et `src/`
 * ne porte que trois fichiers : la garde imprime le compte de CHAQUE racine, zéros compris,
 * nomme celles qui sont vides, et REFUSE de conclure quand le périmètre entier est vide.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { texteDeLaReq } from './schema-enums';
import { TYPES_EVENEMENT, TYPES_HORS_CONTRAT_V1 } from '../../packages/contracts/events';

// ── le vocabulaire de la garde ───────────────────────────────────────────────

export type FichierVu = { chemin: string; contenu: string };
/** `refus` ne vaut que pour `source_illisible` : il NOMME lequel des cinq refus a parlé. */
export type Faute = { famille: string; message: string; refus?: RefusDeConclure };

export type Vue = {
  /** Le texte de REQ-INT-004 — source des sept types valides et des modèles refusés. */
  reqInt004: string;
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
      'une des sources (REQ-INT-004, le glossaire, le paquet de contrats) ne rend plus ce que la ' +
      'garde compare : elle ne sait plus à quoi confronter le dépôt. CINQ refus nommés.',
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
    nom: 'synonyme_interdit_du_glossaire',
    explication: "un terme que `docs/GLOSSAIRE.md` déclare interdit sans condition (REQ-GOV-016).",
  },
];

/**
 * Les CINQ refus de conclure de `source_illisible`, DÉCLARÉS comme `FAMILLES` l'est, et confrontés
 * au registre de la même façon. Le type interdit d'émettre un sixième refus sans l'inscrire ici —
 * et l'inscrire ici l'expose à la confrontation : un refus que le registre n'énumère pas rougit.
 */
export const REFUS_DE_CONCLURE = [
  'req_int_004_muette',
  'contrat_sans_evenement',
  'contrat_et_exigence_divergents',
  'glossaire_sans_synonyme',
  'racines_illisibles',
] as const;
export type RefusDeConclure = (typeof REFUS_DE_CONCLURE)[number];

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
 *
 * ⚠️ CETTE RÈGLE A COÛTÉ VINGT-DEUX LIGNES À CE FICHIER. Une liste `PORTEURS` exemptait trois
 * chemins de `scripts/` et `tests/` — c'est-à-dire trois chemins qu'AUCUNE racine ne contient.
 * Mesuré : neutralisée, elle ne changeait rien (même verdict, même compte de fichiers, même
 * `--prove`). Elle a été retirée, et `PORTEURS_DES_ETATS` avec elle. Le critère qui l'aurait tuée
 * avant la revue : TOUTE EXEMPTION DOIT AVOIR UN CONTRE-TÉMOIN ATTEIGNABLE DANS LE PÉRIMÈTRE. Il
 * est appliqué ci-dessous aux trois exemptions qui restent — le contrat, la citation, le synonyme
 * conditionnel — et chacune a le sien dans `CONTRE_TEMOINS`.
 */
const RACINE_CONTRATS = 'packages/contracts/';

const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|sql|prisma)$/;

/** L'entrée de registre qui déclare la population que `--prove` doit couvrir. */
const CHEMIN_REGISTRE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'gates.json'
);
const ID_REGISTRE = 'gov:check';

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
 * qu'il n'est dérivé de personne sur ce point. Le champ `verifie` de `docs/gates.json` est une
 * DESCRIPTION d'entrée de registre, pas une source de périmètre : la ventilation des 78 fautes que
 * « partout » produirait est en tête de fichier, avec ce qu'elle coûterait réellement.
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

// ── l'exemption de citation, par la GRAMMAIRE du fichier ─────────────────────

/**
 * La grammaire d'un fichier, du point de vue de la seule question qui nous occupe : est-ce que
 * quelque chose, ici, peut CITER au lieu de SE SERVIR ?
 *
 *   `code`         — l'accent grave ouvre un gabarit de chaîne. Rien ne cite.
 *   `valeurs`      — JSON : tout est une valeur, le guillemet droit est le délimiteur. Rien ne cite.
 *   `prose`        — Markdown : accents graves, blocs à trois accents, guillemets français.
 *   `commentaire…` — SQL / Prisma : l'accent grave cite, mais seulement DANS un commentaire.
 *
 * Le défaut par défaut est `valeurs`, c'est-à-dire AUCUNE exemption : une extension inconnue ne
 * gagne pas une exemption par omission. C'est le sens qui échoue FERMÉ — et c'est celui du YAML :
 * aucun fichier YAML ne vit dans les racines, donc aucune exemption YAML n'aurait de contre-témoin
 * atteignable.
 */
export type Grammaire = 'code' | 'valeurs' | 'prose' | 'commentaire_sql' | 'commentaire_slash';

export function grammaireDuFichier(chemin: string): Grammaire {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(chemin)) return 'code';
  if (/\.(md|markdown)$/.test(chemin)) return 'prose';
  if (/\.sql$/.test(chemin)) return 'commentaire_sql';
  if (/\.prisma$/.test(chemin)) return 'commentaire_slash';
  return 'valeurs';
}

const OUVRE_BLOC_SQL = '/' + '*';
const FERME_BLOC_SQL = '*' + '/';

/**
 * Les intervalles COMMENTÉS d'une ligne, selon la grammaire. L'objet `etat` porte, d'une ligne à
 * l'autre, le fait qu'un commentaire de bloc SQL est resté ouvert.
 */
function zonesCommentees(
  ligne: string,
  grammaire: Grammaire,
  etat: { dansUnBloc: boolean }
): [number, number][] {
  const zones: [number, number][] = [];
  if (grammaire === 'commentaire_slash') {
    const i = ligne.indexOf('//');
    if (i >= 0) zones.push([i, ligne.length]);
    return zones;
  }
  // SQL : deux tirets jusqu'en fin de ligne, et un bloc qui peut traverser des lignes.
  let c = 0;
  let debutDuBloc = etat.dansUnBloc ? 0 : -1;
  while (c < ligne.length) {
    if (etat.dansUnBloc) {
      const fin = ligne.indexOf(FERME_BLOC_SQL, c);
      if (fin === -1) {
        zones.push([debutDuBloc, ligne.length]);
        return zones;
      }
      etat.dansUnBloc = false;
      zones.push([debutDuBloc, fin + 2]);
      c = fin + 2;
      continue;
    }
    if (ligne.startsWith('--', c)) {
      zones.push([c, ligne.length]);
      return zones;
    }
    if (ligne.startsWith(OUVRE_BLOC_SQL, c)) {
      etat.dansUnBloc = true;
      debutDuBloc = c;
      c += 2;
      continue;
    }
    c++;
  }
  if (etat.dansUnBloc && debutDuBloc >= 0) zones.push([debutDuBloc, ligne.length]);
  return zones;
}

/** Les spans d'accents graves d'une ligne, restreints aux intervalles passés. */
function spansDansZones(ligne: string, zones: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of zones) {
    const morceau = ligne.slice(a, b);
    for (const m of morceau.matchAll(/`[^`\n]*`/g)) {
      out.push([a + m.index, a + m.index + m[0].length]);
    }
  }
  return out;
}

/**
 * LES ZONES EXEMPTÉES, LIGNE PAR LIGNE.
 *
 * Elle remplace l'appel à `zonesCitees` de `lexique-apporteurs.ts` : cette fonction-là est une
 * heuristique de PROSE (elle tient les guillemets français, le guillemet droit et les accents
 * graves), et l'appliquer à du JSON ou à du SQL rendait la garde aveugle par construction. Les
 * trois évasions qu'elle laissait sont décrites en tête de fichier ; les trois ont un témoin.
 */
export function zonesExemptees(chemin: string, contenu: string): [number, number][][] {
  const lignes = contenu.split('\n');
  const grammaire = grammaireDuFichier(chemin);
  if (grammaire === 'code' || grammaire === 'valeurs') return lignes.map(() => []);
  if (grammaire === 'prose') return zonesDeProse(lignes);

  const etat = { dansUnBloc: false };
  return lignes.map((ligne) => spansDansZones(ligne, zonesCommentees(ligne, grammaire, etat)));
}

/**
 * Les zones citées d'un document en PROSE.
 *
 * Les blocs délimités par trois accents graves sont cités EN ENTIER : dans de la prose, un bloc
 * d'exemple est une citation. Ils sont traités à part, sans quoi leurs accents fausseraient
 * l'appariement de tout ce qui suit.
 *
 * ⚠️ LA BORNE D'UNE CONTINUATION. Un accent grave ouvert se ferme sur SA ligne ou sur la SUIVANTE.
 * Au-delà, il est ABANDONNÉ et l'accent rencontré rouvre un span. Sans cette borne, deux accents
 * graves distants de huit lignes blanchissaient tout l'intervalle — mesuré, quatre fautes effacées
 * par une coquille. Avec elle, la citation à cheval du glossaire (deux lignes) reste exemptée.
 *
 * ⚠️ UNE CLÔTURE JAMAIS REFERMÉE N'OUVRE RIEN. CommonMark prolonge un bloc non refermé jusqu'à la
 * fin du document ; le suivre ici ferait d'une coquille l'amnistie de TOUT ce qui suit — la même
 * évasion que les deux accents graves éloignés, en plus large. Les clôtures sont donc appariées
 * d'avance, et la dernière d'un nombre impair est ignorée.
 */
function zonesDeProse(lignes: string[]): [number, number][][] {
  const out: [number, number][][] = lignes.map(() => []);
  const clotures = lignes.flatMap((l, i) => (l.trimStart().startsWith('```') ? [i] : []));
  if (clotures.length % 2 === 1) clotures.pop();
  const estCloture = new Set(clotures);
  let dansUnBloc = false;
  let ouvertureLigne = -1;
  let ouvertureColonne = -1;

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;
    for (const m of ligne.matchAll(/«[^»\n]*»/g)) out[i]!.push([m.index, m.index + m[0].length]);

    if (estCloture.has(i)) {
      dansUnBloc = !dansUnBloc;
      out[i]!.push([0, ligne.length]);
      ouvertureLigne = -1;
      continue;
    }
    if (dansUnBloc) {
      out[i]!.push([0, ligne.length]);
      continue;
    }
    for (let c = 0; c < ligne.length; c++) {
      if (ligne[c] !== '`') continue;
      // La borne : un accent grave pendant depuis plus d'une ligne est ABANDONNÉ.
      if (ouvertureLigne !== -1 && i - ouvertureLigne > 1) ouvertureLigne = -1;
      if (ouvertureLigne === -1) {
        ouvertureLigne = i;
        ouvertureColonne = c;
        continue;
      }
      if (ouvertureLigne === i) {
        out[i]!.push([ouvertureColonne, c + 1]);
      } else {
        out[ouvertureLigne]!.push([ouvertureColonne, lignes[ouvertureLigne]!.length]);
        out[i]!.push([0, c + 1]);
      }
      ouvertureLigne = -1;
    }
  }
  // Un accent grave ouvert et jamais refermé n'exempte RIEN : on ne devine pas une citation.
  return out;
}

// ── le contrôle ──────────────────────────────────────────────────────────────

/**
 * Un motif de mot entier.
 *
 * ⚠️ LE POINT N'EST PLUS DANS LES BORNES. Il y était, et `prisma.Invoice`, `db.Refund`,
 * `axionia.Invoice` échappaient tous à `terme_axionia_invalide` — c'est-à-dire la forme la PLUS
 * probable sous laquelle un modèle supprimé d'axionia apparaîtrait réellement dans `src/**` : un
 * appel de client Prisma. Mesuré par la lentille `mutation` : `prisma.Invoice.findMany()` ne
 * rendait RIEN, quand le même nom seul rougissait. Les bornes sont donc alphanumériques, et la
 * qualification pointée ne protège plus rien.
 */
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

  return { regles, typesValides };
}

/** Le contrôle. PUR : il ne lit rien, il ne juge que la vue qu'on lui donne. */
export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const { regles, typesValides } = reglesDeLaVue(vue);

  // ── les sources, d'abord : une garde qui ne sait plus à quoi comparer ne conclut pas ──
  // Chaque refus porte son NOM, pris dans `REFUS_DE_CONCLURE` : `--prove` en exige un témoin,
  // refus par refus. Trois de ces cinq n'en avaient AUCUN — mesuré par la lentille `mutation`,
  // qui les a neutralisés un à un sans qu'une étape bouge.
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
  if (typesValides.length > 0 && manquants.length > 0) {
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

  for (const fichier of balayes) {
    const zones = zonesExemptees(fichier.chemin, fichier.contenu);
    const dansLeContrat = fichier.chemin.startsWith(RACINE_CONTRATS);

    fichier.contenu.split('\n').forEach((ligne, i) => {
      const citees = zones[i] ?? [];
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
  // ⚠️ LE PÉRIMÈTRE D'ABORD, ET DANS CET ORDRE. Lancée depuis `packages/`, la garde doit REFUSER
  // en NOMMANT `perimetre_illisible`. Si les lectures de sources venaient avant, elle mourrait
  // sur un `ENOENT` de `docs/GLOSSAIRE.md` — un refus correct, mais anonyme, et pour une raison
  // qu'on n'a pas choisie. `refus-de-rendre-et-de-publier.spec.ts` mesure exactement cela sur les
  // gardes qui balaient, et n'en trouve que deux qui refusent pour la bonne raison.
  const fichiers = fichiersSuivisOuRefus('gov:check')
    .filter((chemin) => EXTENSIONS.test(chemin))
    .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') }));
  const glossaire = readFileSync('docs/GLOSSAIRE.md', 'utf8');
  return {
    reqInt004: texteDeLaReq('REQ-INT-004'),
    glossaire,
    typesDuContrat: [...TYPES_EVENEMENT, ...TYPES_HORS_CONTRAT_V1.map((t) => t.type)],
    racines: racinesDuGlossaire(glossaire),
    fichiers,
  };
}

// ── la population de la preuve, LUE dans le registre ─────────────────────────

export type Population = { familles: string[]; refus: string[] };

/**
 * La population que `--prove` doit couvrir, LUE dans le champ `verifie` de l'entrée `gov:check`.
 *
 * Elle ne vient PAS de ce module : une preuve qui déclare elle-même ce qu'elle doit prouver ne
 * prouve que sa propre cohérence. Retirer une entrée de `FAMILLES` déplaçait autrefois le compte
 * ATTENDU en même temps que le compte IMPRIMÉ, et la soustraction restait vide par construction.
 *
 * Un registre qui ne nomme rien est un REFUS, jamais une population vide : c'est le sens qui
 * échoue fermé.
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
  };
}

/** La clé de couverture d'un témoin : la famille, ou le refus nommé quand il y en a un. */
export function cleDeCouverture(famille: string, refus?: string): string {
  return refus === undefined ? famille : `${famille}/${refus}`;
}

// ── ligne de commande ────────────────────────────────────────────────────────
// GARDÉE : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement — vu sur `perf-budgets.ts`
// le 2026-09-05 (« Error: process.exit unexpectedly called with "0" », zéro test exécuté), et vu
// à nouveau ici pendant l'écriture de cette garde.
const APPELE_DIRECTEMENT = /gov-check\.ts$/.test(process.argv[1] ?? '');

// ── la fixture de la preuve (RM-11 : le VERDICT ne lit rien du dépôt) ────────

const REQ_INT_004_FIXTURE =
  "Les types d'événements sont : `client.cree`, `client.mis_a_jour`, `devis.signe`, " +
  '`facture.emise`, `avoir.emis`, `paiement.recu`, `paiement.rembourse` — nommés sur les modèles ' +
  'réels (Client, Devis, FactureFormation, Payment) ; aucun événement ne référence `Invoice` ni `Refund`.';

/**
 * Source des fixtures : la FORME des textes réels — `docs/requirements.json` (REQ-INT-004) et
 * `docs/GLOSSAIRE.md` §1, §2, §5 et §7 — reproduite au plus court. Les valeurs sont celles des
 * sources ; ce qui est fixé ici, c'est la TOURNURE que la garde doit savoir lire.
 */
const GLOSSAIRE_FIXTURE = [
  '# Glossaire — Axion Partners',
  '',
  '> Gate `glossaire-enums.spec.ts` : tout synonyme interdit trouvé dans `prisma/**`, `src/**`,',
  '> `messages/**`, `docs/adr/**` → rouge (`gov:check`).',
  '',
  '## 1. Attribution',
  '',
  "`ON attributions(siren) WHERE statut IN (…)`. Synonymes interdits : `ETATS_ACTIFS`, une",
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
  glossaire: GLOSSAIRE_FIXTURE,
  // ⚠️ TAPÉE là où `racines` est DÉRIVÉE, et la dissymétrie est juste : dériver cette liste de
  // `REQ_INT_004_FIXTURE` rendrait `manquants` vide PAR CONSTRUCTION, et le refus
  // `contrat_et_exigence_divergents` ne serait plus jamais exerçable. Un prédicat ouvert échoue
  // ouvert. C'est un ANCRAGE : sa divergence est le signal, et `termes-interdits.spec.ts` la
  // confronte aux sources réelles.
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

const avec = (chemin: string, contenu: string): Vue => ({
  ...VUE_CONFORME,
  fichiers: [...VUE_CONFORME.fichiers, { chemin, contenu }],
});

/** L'accent grave, posé par son code : l'écrire dans un littéral de ce fichier le fermerait. */
const AG = String.fromCharCode(96);

export type Temoin = { famille: string; refus?: RefusDeConclure; quoi: string; vue: () => Vue };

/**
 * Un témoin par famille ET par refus. Les quatre témoins d'évasion sont ceux que la lentille
 * `mutation` a fabriqués : sans eux, la fermeture de l'exemption de citation serait une
 * affirmation, pas une garde (RM-02).
 */
export const TEMOINS: Temoin[] = [
  {
    famille: 'source_illisible',
    refus: 'req_int_004_muette',
    quoi: "REQ-INT-004 ne nomme plus aucun type d'événement",
    vue: () => ({ ...VUE_CONFORME, reqInt004: "Les types d'événements sont nommés ailleurs." }),
  },
  {
    famille: 'source_illisible',
    refus: 'contrat_sans_evenement',
    quoi: 'le paquet de contrats ne publie plus aucun nom',
    vue: () => ({ ...VUE_CONFORME, typesDuContrat: [] }),
  },
  {
    famille: 'source_illisible',
    refus: 'contrat_et_exigence_divergents',
    quoi: "le contrat a perdu six des sept noms que l'exigence nomme",
    vue: () => ({ ...VUE_CONFORME, typesDuContrat: ['client.cree'] }),
  },
  {
    famille: 'source_illisible',
    refus: 'glossaire_sans_synonyme',
    quoi: 'le glossaire ne porte plus le marqueur des synonymes interdits',
    vue: () => ({
      ...VUE_CONFORME,
      glossaire: GLOSSAIRE_FIXTURE.replace(/Synonymes? interdits? :/g, 'Termes écartés :'),
    }),
  },
  {
    famille: 'source_illisible',
    refus: 'racines_illisibles',
    quoi: "l'en-tête du glossaire ne donne plus les racines à balayer",
    vue: () => ({ ...VUE_CONFORME, racines: [] }),
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
    famille: 'terme_axionia_invalide',
    quoi: 'le même modèle sous sa forme la plus probable : une QUALIFICATION POINTÉE',
    vue: () => avec('src/server/lecture.ts', 'const f = await prisma.Invoice.findMany();'),
  },
  {
    famille: 'evenement_hors_nomenclature',
    quoi: 'la fixture rouge du registre : un nom anglais dans un ADR',
    vue: () => avec('docs/adr/0011-temoin.md', 'le producteur emet payment.received a la signature'),
  },
  {
    famille: 'evenement_hors_nomenclature',
    quoi: 'du JSON de `messages/`, où le guillemet droit est le SEUL délimiteur de chaîne',
    vue: () => avec('messages/fr.json', '{ "journal": { "titre": "payment.received" } }'),
  },
  {
    famille: 'evenement_hors_nomenclature',
    quoi: "un ADR où deux accents graves ÉLOIGNÉS n'amnistient plus l'intervalle",
    vue: () =>
      avec(
        'docs/adr/9998-span.md',
        [
          `une coquille ouvre un accent grave ${AG}ici et ne le referme jamais`,
          '',
          'le producteur emet payment.received a la signature',
          '',
          'huit lignes plus bas, un autre accent grave apparait',
          '',
          '',
          '',
          `le voici ${AG} enfin`,
        ].join('\n')
      ),
  },
  {
    famille: 'evenement_hors_nomenclature',
    quoi: "en `.sql`, l'accent grave HORS COMMENTAIRE ne cite rien — même juste après un bloc refermé",
    vue: () =>
      avec(
        'prisma/migrations/0003_appat/migration.sql',
        `-- le glossaire refuse ${AG}payment.received${AG} : ce commentaire PORTE la règle\n` +
          `${OUVRE_BLOC_SQL} et ce bloc aussi, sur deux lignes :\n` +
          `${AG}payment.received${AG} ${FERME_BLOC_SQL} UPDATE evenements SET type = ${AG}payment.received${AG};`
      ),
  },
  {
    famille: 'terme_axionia_invalide',
    quoi: "un ADR où une clôture de bloc JAMAIS refermée n'amnistie plus la suite du document",
    vue: () =>
      avec(
        'docs/adr/9997-cloture.md',
        [`${AG.repeat(3)}ts`, 'const f: Invoice = lire();', '', 'la suite du document'].join('\n')
      ),
  },
  {
    famille: 'terme_axionia_invalide',
    quoi: "en `.prisma`, l'accent grave HORS COMMENTAIRE ne cite rien",
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
    famille: 'evenement_litteral_hors_contrat',
    quoi: 'un nom VALIDE recopié hors du paquet de contrats',
    vue: () => avec('src/server/journal.ts', "if (type === 'paiement.recu') return;"),
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
 *
 * ⚠️ CHAQUE EXEMPTION A ICI UN CONTRE-TÉMOIN ATTEIGNABLE DANS LE PÉRIMÈTRE. C'est le critère qui
 * aurait tué `PORTEURS` avant la revue : une exemption dont le contre-témoin est hors périmètre
 * est verte parce qu'elle n'est jamais atteinte, pas parce qu'elle fonctionne.
 */
export const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
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
    quoi: "un commentaire de schéma Prisma qui NOMME l'interdit — la forme de `prisma/schema.prisma:49`",
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
    quoi: 'un fichier HORS des racines que le glossaire nomme — la garde ne l’a pas lu, et le dit',
    vue: () => avec('docs/REQUIREMENTS.md', 'REQ-DM-036 — WebhookRecu {source, eventId, …}'),
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
];

export type RapportDePreuve = {
  /** Les clés effectivement couvertes — nourries par la faute qui MATCHE, jamais par une autre. */
  couvertes: Set<string>;
  /** Les témoins qui ne mordent plus : le témoin est faux, ou la règle ne couvre plus son cas. */
  sansMorsure: Temoin[];
};

/**
 * Le banc d'essai, PUR et exporté — pour que `termes-interdits.spec.ts` puisse exercer
 * l'assertion RÉCIPROQUE : retirer un témoin doit DÉCOUVRIR sa clé. C'est ce qui manquait, et
 * c'est ce qui rendait `--prove` vert quand on lui supprimait un témoin : l'ensemble couvert
 * était alimenté par TOUTES les fautes de TOUS les témoins.
 */
export function eprouver(temoins: readonly Temoin[]): RapportDePreuve {
  const couvertes = new Set<string>();
  const sansMorsure: Temoin[] = [];
  for (const t of temoins) {
    const fautes = controler(t.vue());
    const mord = fautes.some(
      (f) => f.famille === t.famille && (t.refus === undefined || f.refus === t.refus)
    );
    if (mord) {
      // Les DEUX clés : la famille, et le refus nommé. Un refus couvert couvre sa famille, mais
      // une famille couverte ne couvre AUCUN de ses autres refus — c'est là qu'était le trou.
      couvertes.add(t.famille);
      couvertes.add(cleDeCouverture(t.famille, t.refus));
    } else sansMorsure.push(t);
  }
  return { couvertes, sansMorsure };
}

export type Ecarts = {
  /** Ce que le code DÉCLARE et ce que le registre ÉNUMÈRE ne sont pas le même ensemble. */
  divergences: string[];
  /** Les témoins dont la clé n'est pas au registre : le registre a rétréci sans le code. */
  orphelins: string[];
  /** Les clés du registre qu'aucun témoin QUI MORD ne couvre. */
  manque: string[];
};

/**
 * LES ÉCARTS ENTRE LA POPULATION DU REGISTRE ET CE QUE LE CODE DÉCLARE ET PROUVE — dans les DEUX
 * sens. PUR et exporté : toute la logique de population vit ici, pour que chacune de ses branches
 * soit exercée par le contrôle au lieu de n'exister que dans la ligne de commande.
 *
 *   — ce que le code déclare (`FAMILLES`, `REFUS_DE_CONCLURE`) égale ce que le registre énumère,
 *     dans les deux sens, et l'écart NOMME ce qui manque de chaque côté ;
 *   — tout témoin porte une clé que le registre énumère : sans cette réciproque, retirer une
 *     entrée du REGISTRE rétrécissait la population en silence, et le témoin restait vert ;
 *   — toute clé du registre est couverte par un témoin qui MORD (`eprouver`), jamais par une
 *     faute incidente d'un autre témoin.
 */
export function ecartsDePopulation(
  population: Population,
  declares: { familles: readonly string[]; refus: readonly string[] },
  temoins: readonly Temoin[]
): Ecarts {
  const divergences: string[] = [];
  const confronter = (quoi: string, code: readonly string[], registre: readonly string[]): void => {
    const codeSeul = code.filter((n) => !registre.includes(n));
    const registreSeul = registre.filter((n) => !code.includes(n));
    if (codeSeul.length + registreSeul.length === 0) return;
    divergences.push(
      `${quoi} : le code et docs/gates.json ont divergé — dans le code seulement : ` +
        `${codeSeul.join(', ') || 'rien'} ; au registre seulement : ${registreSeul.join(', ') || 'rien'}.`
    );
  };
  confronter('familles', declares.familles, population.familles);
  confronter('refus de conclure', declares.refus, population.refus);

  const orphelins = temoins
    .filter(
      (t) =>
        !population.familles.includes(t.famille) ||
        (t.refus !== undefined && !population.refus.includes(t.refus))
    )
    .map((t) => `« ${t.quoi} » (${cleDeCouverture(t.famille, t.refus)})`);

  const { couvertes } = eprouver(temoins);
  const manque = [
    ...population.familles,
    ...population.refus.map((r) => cleDeCouverture('source_illisible', r)),
  ].filter((cle) => !couvertes.has(cle));

  return { divergences, orphelins, manque };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

if (APPELE_DIRECTEMENT && process.argv.includes('--prove')) {
  const rapport = eprouver(TEMOINS);
  if (rapport.sansMorsure.length > 0) {
    for (const t of rapport.sansMorsure) {
      console.error(
        `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir « ${cleDeCouverture(t.famille, t.refus)} ». ` +
          "Le témoin est faux, ou la règle ne couvre pas ce qu'elle prétend couvrir."
      );
    }
    process.exit(1);
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

  // ── LA POPULATION VIENT DU REGISTRE, ET ELLE EST CONFRONTÉE AU CODE ────────
  const refusDeLaPreuve: string[] = [];
  let population: Population = { familles: [], refus: [] };
  try {
    population = populationDuRegistre(readFileSync(CHEMIN_REGISTRE, 'utf8'));
  } catch (e) {
    refusDeLaPreuve.push(
      `la population attendue est ILLISIBLE dans docs/gates.json : ${(e as Error).message}`
    );
  }

  // Un registre illisible a déjà parlé : confronter une population vide ne ferait qu'ajouter du
  // bruit — tous les témoins y seraient « orphelins ».
  if (refusDeLaPreuve.length === 0) {
    const ecarts = ecartsDePopulation(
      population,
      { familles: FAMILLES.map((f) => f.nom), refus: REFUS_DE_CONCLURE },
      TEMOINS
    );
    refusDeLaPreuve.push(...ecarts.divergences);
    if (ecarts.orphelins.length > 0) {
      refusDeLaPreuve.push(
        `${ecarts.orphelins.length} témoin(s) dont la clé n'est pas au registre : ` +
          `${ecarts.orphelins.join(', ')}.\n      Le registre a rétréci sans que le code suive.`
      );
    }
    if (ecarts.manque.length > 0) {
      refusDeLaPreuve.push(
        `${ecarts.manque.length} entrée(s) de la population du registre sans témoin qui rougit : ` +
          `${ecarts.manque.join(', ')}.\n      Une règle jamais vue rougir ne garde rien.`
      );
    }
  }

  if (refusDeLaPreuve.length > 0) {
    refusDeLaPreuve.forEach((r) => console.error(`❌ ${r}`));
    process.exit(1);
  }

  console.log(
    `✅ gov:check — les ${population.familles.length} familles et les ${population.refus.length} ` +
      `refus que docs/gates.json énumère rougissent chacun sur son témoin (${TEMOINS.length} ` +
      `témoins), et les ${CONTRE_TEMOINS.length} contre-témoins restent verts.`
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
  const modeles = modelesRefusesDAxionia(vue.reqInt004, vue.glossaire);
  const gardesAilleurs = conditionnels.filter((s) => modeles.includes(s.terme));

  const perimetre = [
    `   Périmètre : ${balayes} fichier(s) balayé(s) — ` +
      parRacine.map((p) => `${p.racine} ${p.nombre}`).join(', ') +
      '.',
    // « 0 fichier » ne se lit pas comme « aucun défaut » : les racines vides sont NOMMÉES.
    ...(parRacine.some((p) => p.nombre === 0)
      ? [
          `   ⚠️ Racine(s) VIDE(S) : ${parRacine
            .filter((p) => p.nombre === 0)
            .map((p) => p.racine)
            .join(', ')} — rien n'y a été lu. En phase −1, \`src/\` et \`messages/\` sont vides ou ` +
            'presque par construction ; le jour où elles se remplissent sans que ce compte bouge, ' +
            "c'est la garde qui est débranchée.",
        ]
      : []),
    // Ce que la garde NE lit PAS, dit à voix haute : les racines viennent de l'en-tête du
    // glossaire, et le reste des fichiers suivis demeure dehors. Une garde qui tait son angle
    // mort se fait lire comme si elle n'en avait pas.
    `   Hors périmètre : ${horsPerimetre.length} fichier(s) suivi(s) — les racines sont LUES dans ` +
      "l'en-tête de `docs/GLOSSAIRE.md`, à qui `docs/PRESEANCE.md` §2 donne la primauté sur un " +
      'terme et ses synonymes interdits. Élargir ce périmètre est un arbitrage du `gardien-spec`, ' +
      'pas une option de cette garde.',
    // ⚠️ CE QUE CETTE GARDE NE TIENT PLUS. Dit à chaque exécution, parce qu'une famille déplacée
    // en silence est une racine perdue en silence (partners/ADR-0011).
    '   Hors famille : les listes littérales d’états occupants relèvent de `partners:schema:enums` ' +
      '(GOV-006), SEULE implémentation depuis `partners/ADR-0011`. Elle balaie `src`, `prisma` et ' +
      '`scripts` en .ts/.tsx/.prisma/.sql : `messages/`, `docs/adr/` et `packages/contracts/` ne ' +
      'sont donc gardées par PERSONNE sur cette famille-là, et le dire vaut mieux que le taire.',
    `   Sources : ${typesEvenementDeLaReq(vue.reqInt004).length} type(s) d'événement (REQ-INT-004), ` +
      `${modeles.length} modèle(s) refusé(s) d'axionia, ` +
      `${exerces.length} synonyme(s) interdit(s) exercé(s) (docs/GLOSSAIRE.md).`,
    ...(conditionnels.length > 0
      ? [
          `   ⚠️ ${conditionnels.length} synonyme(s) NON exercé(s) comme synonyme, parce que le ` +
            `glossaire les assortit d'une condition que la garde ne sait pas juger : ${conditionnels
              .map((s) => s.terme)
              .join(', ')}.` +
            // ⚠️ « ils ne sont gardés par rien » était FAUX, et le même run le démentait :
            // `PaymentScheduleProfile` est gardé par `terme_axionia_invalide`. Une sortie de CI
            // qui sous-déclare sa garde est l'inverse de l'aveu qu'elle veut être.
            (gardesAilleurs.length > 0
              ? ` ⚠️ ${gardesAilleurs
                  .map((s) => s.terme)
                  .join(', ')} reste(nt) gardé(s) par \`terme_axionia_invalide\` — le glossaire ` +
                'le nomme aussi comme modèle supprimé.'
              : '') +
            ' Les autres ne sont gardés par rien — le dire vaut mieux que le laisser croire.',
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
