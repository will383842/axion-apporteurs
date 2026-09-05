/**
 * gov-entite.ts — la garde du registre d'entité `config/entite.json`.
 * (CPL-T01, `partners/ADR-0009`, REQ-CPL-001 à 004, REQ-CPL-017, REQ-CPL-018, REQ-GOV-031)
 *
 * USAGE : pnpm gov:entite           juge le dépôt réel (registre + décisions + fichiers suivis)
 *         pnpm gov:entite:prove     un témoin par famille sur un univers de FIXTURE, plus les
 *                                   contre-témoins verts
 *
 * ELLE TIENT DEUX SENS, ET C'EST TOUT SON OBJET.
 *
 *   → Le sens qu'on attend : elle refuse la MISE EN SERVICE tant qu'un champ vaut `A-RENSEIGNER`.
 *     Ce refus-là n'est pas dans ce fichier, il est dans `exigerEntiteRenseignee` — parce qu'il
 *     doit s'exercer À L'EXÉCUTION, au moment où une valeur quitte le dépôt, et jamais au build.
 *     Les phases 0 à 3 se codent et se prouvent contre la sentinelle : si cette garde faisait
 *     rougir la CI aujourd'hui, la tâche serait ratée (point 4 de l'acceptation de CPL-T01).
 *
 *   → Le sens qu'on oublie : elle refuse TOUT AUTANT qu'une coordonnée bancaire réelle soit
 *     COMMITÉE. Le dépôt `will383842/axion-apporteurs` est PUBLIC (REQ-GOV-031, décision W13). Un
 *     IBAN débiteur poussé une fois y reste lisible pour toujours — forks, caches, archives — y
 *     compris après un passage en privé. Dans le dépôt, `banqueDebitrice` ne prend QUE la
 *     sentinelle. Une garde qui ne tiendrait que le premier sens laisserait le vrai IBAN entrer à
 *     la première session pressée, et le mal serait irréversible.
 *
 * ET ELLE REFUSE AUSSI LES EXEMPLES PLAUSIBLES. Ni `FR7612345678901234567890123`, ni
 * `FR12123456789`, ni `123456789`. C'est la raison la plus fine du dossier : un numéro d'exemple
 * oublié dans un document signé ne se distingue pas d'une vraie valeur. La sentinelle est un mot
 * français en majuscules précisément pour qu'on ne puisse pas la prendre pour une valeur.
 *
 * CE QU'ELLE NE RECOPIE PAS (RM-01). Aucune valeur du monde réel n'est écrite ici. Le régime de
 * chaque champ — arrêté, en attente, secret — se DÉRIVE de la ligne qui l'arbitre : la ligne `W1`,
 * `W3`, `W4` ou `HYP-W2` de `docs/DECISIONS.md`, ou la ligne de l'exigence dans
 * `docs/REQUIREMENTS.md`. Retirer la marque de clôture d'une décision remet ses champs à la
 * sentinelle, sans qu'une ligne de code bouge. C'est la façon dont a été réglée une divergence
 * relevée en livrant CPL-T01 : `partners/ADR-0009` décrit `W1`, `W3` et `W4` comme non tranchées,
 * quand `docs/DECISIONS.md` les porte tranchées le 2026-09-03. On ne choisit pas entre deux
 * documents : on lit celui qui fait registre, à chaque exécution.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne touche pas au dépôt : registre, textes de décision,
 * textes d'exigence et fichiers sont INJECTÉS. Sans quoi la preuve verdirait ou rougirait au gré
 * des fichiers présents le jour où elle tourne.
 *
 * INVARIANT DU CONTRE-TÉMOIN (LEC-13, RM-02). Un univers conforme laisse la garde verte. Sans lui,
 * une garde qui rougit toujours finit désarmée — c'est ce qui est arrivé à la gate Lighthouse
 * d'axionia, qui a mesuré le runner au lieu du site pendant des mois.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import {
  CHAMPS,
  POINTS_DE_SORTIE,
  SENTINELLE,
  estSentinelle,
  registreDuDepot,
  valeur,
  type Registre,
} from '../../src/config/entite';

const CHEMIN_REGISTRE = 'config/entite.json';
const CHEMIN_DECISIONS = 'docs/DECISIONS.md';
const CHEMIN_EXIGENCES = 'docs/REQUIREMENTS.md';

export type Fichier = { chemin: string; contenu: string };

export type Univers = {
  registre: Registre;
  /** Le texte de `docs/DECISIONS.md` — la garde y relit W1, W3, W4 et HYP-W2. */
  decisions: string;
  /** Le texte de `docs/REQUIREMENTS.md` — la garde y relit REQ-CPL-004 et REQ-CPL-018. */
  exigences: string;
  /** Les fichiers suivis par git, hors exemptions : c'est là qu'une valeur peut fuir. */
  fichiers: Fichier[];
};

export type Faute = { famille: string; message: string };

export const FAMILLES = [
  'champ_absent',
  'champ_vide',
  'secret_commite',
  'exemple_plausible',
  'sentinelle_sur_decision_arretee',
  'valeur_sans_decision',
  'divergence_avec_la_source',
  'source_illisible',
  'valeur_recopiee',
  'coordonnee_en_clair',
  'point_de_sortie_sans_refus',
];

/**
 * CE QUI EST EXEMPTÉ, ET DE QUOI EXACTEMENT — la distinction que la première version n'avait pas.
 *
 * 🔴 CE QUE CETTE LISTE FAISAIT AVANT (veto de la lentille `securite`, 2026-09-05). Elle était
 * appliquée dans `lireUnivers()` par un `continue` qui écartait le fichier AVANT de l'ajouter à
 * l'univers : le fichier n'était donc examiné par AUCUNE famille, l'IBAN compris. Or deux des
 * cinq motifs visent `docs/` — dont `docs/DECISIONS.md`, qui est très exactement le fichier où
 * l'arbitrage de la banque réceptrice sera écrit, et où le registre annonce déjà « reste l'IBAN
 * débiteur, à poser en secret ». Le seul fichier du dépôt où cette phrase existe était l'un des
 * deux seuls que la garde ne regardait pas. Dépôt PUBLIC, écriture irréversible.
 *
 * LA DISTINCTION JUSTE N'EST PAS « CE FICHIER EST-IL REGARDÉ ? » MAIS « DE QUOI EST-IL EXEMPT ? ».
 * Le motif d'origine — « citer n'est pas se servir » — ne vaut que pour les valeurs PUBLIQUES :
 * un registre a le droit de NOMMER le SIREN qu'il arrête. Il ne vaut pour aucun SECRET : aucun
 * document n'a de raison légitime de porter un IBAN en clair, et surtout pas celui qui explique
 * qu'il ne faut pas le faire.
 *
 * Chaque entrée déclare donc `exemptDe`, et le type n'admet que DEUX valeurs :
 *   — `'recopie'` : le fichier peut porter une valeur PUBLIQUE du registre (SIREN, SIRET, TVA)
 *     sans que ce soit une recopie fautive. C'est le régime de `docs/DECISIONS.md` et de l'ADR :
 *     ils nomment ce qu'ils arrêtent, et ils ne sont PAS exempts de `coordonnee_en_clair`.
 *   — `'coordonnee'` : le fichier peut porter une coordonnée. Réservé aux DEUX fichiers qui
 *     doivent contenir les témoins de cette garde — la garde elle-même et son banc d'essai —
 *     parce qu'un document qui explique la règle doit pouvoir écrire son contre-exemple.
 *
 * Élargir une exemption exige donc d'élargir ce type, ce qui se voit en revue. Et `'coordonnee'`
 * implique `'recopie'` : un fichier autorisé à PORTER la valeur peut a fortiori la répéter.
 */
export type FamilleExemptable = 'recopie' | 'coordonnee';

export const EXEMPTS: { motif: RegExp; exemptDe: FamilleExemptable; raison: string }[] = [
  {
    motif: /^config\/entite\.json$/,
    exemptDe: 'recopie',
    raison:
      "le registre est la SOURCE : il porte legitimement son SIREN, son SIRET et sa TVA, et il ne se recopie pas lui-meme. Il n'est PLUS exempt de coordonnee_en_clair — il l'a ete jusqu'au 2026-09-05, et la raison ecrite alors (« ses champs sont juges un par un plus haut ») etait FAUSSE : les 17 champs non secrets n'etaient confrontes a aucune forme, si bien qu'un IBAN ecrit dans banqueReceptrice.espaceDeTest — le champ ou l'on colle un RIB, dans le meme bloc bancaire que banqueDebitrice.iban — restait invisible. L'exemption en bloc contournait QUATRE faux positifs legitimes, elle ne decidait rien sur l'IBAN",
  },
  { motif: /^scripts\/gates\/gov-entite\.ts$/, exemptDe: 'coordonnee', raison: 'la garde porte ses propres témoins, qui doivent avoir la forme de ce qu’elle refuse' },
  {
    motif: /^tests\/unit\/gouvernance\/entite-registre\.spec\.ts$/,
    exemptDe: 'coordonnee',
    raison:
      "le banc d'essai de cette garde, au même titre que la garde elle-même : ses témoins DOIVENT avoir la forme de ce qu'elle refuse — un IBAN à clé valide, un BIC, le SIREN du registre. Ajouté le 2026-09-05, quand les témoins du second tour de la lentille securite ont fait rougir la garde sur son propre banc d'essai. C'est le prix, assumé et borné à UN fichier nommé, de la règle « un document qui explique la règle doit pouvoir écrire son contre-exemple » — la même que gov:identifiants a déjà payée",
  },
  { motif: /^docs\/DECISIONS\.md$/, exemptDe: 'recopie', raison: 'le registre des décisions NOMME la valeur PUBLIQUE qu’il arrête — c’est son travail. Il n’est PAS exempt de `coordonnee_en_clair` : c’est le fichier le plus exposé du dépôt, celui où l’arbitrage de la banque sera écrit' },
  { motif: /^docs\/adr\/0009-valeurs-du-monde-reel\.md$/, exemptDe: 'recopie', raison: 'l’ADR qui fonde cette garde cite les formes d’exemple qu’elle interdit' },
  { motif: /^pnpm-lock\.yaml$/, exemptDe: 'coordonnee', raison: 'empreintes de paquets, aucune prose' },
];

/**
 * Les extensions balayées. `prisma` et `example` ont été ajoutées le 2026-09-05 : la lentille
 * `securite` a relevé que `prisma/schema.prisma` — introduit par ce lot même — et
 * `.env.example` — que `.gitignore` dé-exclut exprès pour qu'il soit suivi — passaient tous
 * deux au travers. Un secret ne choisit pas son extension.
 */
const EXTENSIONS_BALAYEES = /\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|sql|prisma|example|txt|csv|xml|env)$/;

/** Les fichiers suivis SANS extension qu'il faut lire quand même (`CODEOWNERS`, `Dockerfile`…). */
const SANS_EXTENSION_BALAYES = /(^|\/)(CODEOWNERS|Dockerfile|Procfile|\.env[^/]*)$/;

/**
 * CE FICHIER EST-IL REGARDÉ ? Fonction PURE et EXPORTÉE, et ce n'est pas un rangement.
 *
 * 🔴 Tant que cette décision vivait en ligne dans `lireUnivers()`, elle n'était exercée par AUCUN
 * témoin : `--prove` INJECTE son univers et ne passe jamais par la lecture du disque. La lentille
 * `mutation` l'a mesuré — remplacer `EXTENSIONS_BALAYEES` par un motif qui ne reconnaît rien, ou
 * `EXEMPTS` par un attrape-tout, laissait `gov:entite` ET son `--prove` VERTS tous les deux. Les
 * deux listes qui décident de CE QUI EST REGARDÉ étaient le seul endroit non gardé de la garde.
 * Extraites ici, elles ont des témoins (`--prove`, famille `filtre_trop_large`) et un test.
 */
export function estBalaye(chemin: string): boolean {
  return EXTENSIONS_BALAYEES.test(chemin) || SANS_EXTENSION_BALAYES.test(chemin);
}

/** Ce fichier est-il exempt de CETTE famille ? Aucun fichier n'est exempt d'un SECRET. */
export function estExemptDe(chemin: string, famille: FamilleExemptable): boolean {
  // `coordonnee` est la plus large des deux et implique `recopie` : un fichier autorisé à PORTER
  // la valeur est a fortiori autorisé à la répéter. L'inverse est faux, et c'est tout l'objet de
  // la distinction — `docs/DECISIONS.md` peut NOMMER le SIREN qu'il arrête, il ne peut pas
  // porter un IBAN.
  return EXEMPTS.some(
    (e) => e.motif.test(chemin) && (e.exemptDe === famille || e.exemptDe === 'coordonnee')
  );
}

/**
 * Un fichier de CODE : celui qui doit LIRE la valeur, jamais la porter. Les fichiers de `docs/`
 * en sont exclus — ce sont de la prose et des registres, ils citent. Cette frontière est la même
 * que celle de `gov:identifiants`, et elle est ce qui empêche la garde de devenir intenable :
 * exiger d'une spécification qu'elle ne nomme jamais le SIREN de l'entité rendrait le dossier
 * illisible sans rien protéger.
 */
function estCode(chemin: string): boolean {
  return /\.(ts|tsx|js|mjs|cjs|sql|ya?ml|json)$/.test(chemin) && !chemin.startsWith('docs/');
}

// ── Lecture des sources d'autorité ────────────────────────────────────────────────────────────

/** Minuscules, sans emphase ni ponctuation typographique, espaces normalisés. */
export function normaliser(texte: string): string {
  return texte
    .replace(/[*`«»"]/g, ' ')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * La ligne qui fait autorité pour un identifiant — ligne de tableau de `docs/DECISIONS.md`
 * (`| **W1** ✅ … |`) ou ligne d'exigence de `docs/REQUIREMENTS.md` (`- **REQ-CPL-004** — …`).
 * Rend la chaîne vide si elle n'existe pas : ne pas avoir pu lire n'est jamais un vert, c'est la
 * famille `source_illisible`.
 */
export function ligneSource(texte: string, id: string): string {
  for (const ligne of texte.split('\n')) {
    if (premiereCellule(ligne) === id) return ligne;
    const exigence = /^\s*-\s*\*\*(REQ-[A-Z]+-\d+)\*\*/.exec(ligne);
    if (exigence !== null && exigence[1] === id) return ligne;
  }
  return '';
}

/** `| **W1** ✅ *tranchée 2026-09-03* | …` → `W1`. Le premier jeton, hors emphase. */
function premiereCellule(ligne: string): string {
  if (!ligne.startsWith('|')) return '';
  const cellule = ligne.slice(1).split('|')[0] ?? '';
  return (cellule.replace(/[*`]/g, '').trim().split(/\s+/)[0] ?? '').trim();
}

/**
 * Une décision est-elle ARRÊTÉE ? La réponse se lit, elle ne se tape pas.
 *   — sous `## 2. Hypothèses par défaut — le code avance`, OUI par construction : une hypothèse de
 *     cette section EST la valeur que le code applique aujourd'hui ;
 *   — ailleurs dans `docs/DECISIONS.md`, seulement si la ligne porte la marque de clôture ✅ ;
 *   — dans `docs/REQUIREMENTS.md`, OUI dès que l'exigence est écrite : une exigence au registre
 *     est arrêtée par définition.
 */
function arretee(texte: string, id: string, source: 'decisions' | 'exigences'): boolean {
  const ligne = ligneSource(texte, id);
  if (ligne === '') return false;
  if (source === 'exigences') return true;
  if (sectionDe(texte, ligne).startsWith('2.')) return true;
  return ligne.includes('✅');
}

/** Le titre de la section `## …` sous laquelle vit une ligne. */
function sectionDe(texte: string, ligne: string): string {
  let courante = '';
  for (const l of texte.split('\n')) {
    const titre = /^##\s+(.*)$/.exec(l);
    if (titre !== null) courante = titre[1]!.trim();
    if (l === ligne) return courante;
  }
  return courante;
}

// ── Formes refusées ───────────────────────────────────────────────────────────────────────────

/**
 * Une valeur d'EXEMPLE : chiffres répétés (`FR99999999999`), ou suite monotone longue
 * (`123456789`, `FR7612345678901234567890123`). Le détecteur est générique, pas une liste : une
 * liste d'exemples connus laisserait passer le suivant.
 */
export function estExemplePlausible(v: string): boolean {
  const chiffres = v.replace(/\D/g, '');
  if (chiffres.length < 6) return false;
  if (/(\d)\1{5,}/.test(chiffres)) return true;
  let croissante = 1;
  let decroissante = 1;
  for (let i = 1; i < chiffres.length; i += 1) {
    const a = Number(chiffres[i - 1]);
    const b = Number(chiffres[i]);
    croissante = b === a + 1 ? croissante + 1 : 1;
    decroissante = b === a - 1 ? decroissante + 1 : 1;
    if (croissante >= 8 || decroissante >= 8) return true;
  }
  return false;
}

/**
 * Le code PAYS ISO qui ouvre un IBAN et qui occupe les 5ᵉ et 6ᵉ caractères d'un BIC.
 * Déclaré AVANT les deux formes qui s'en servent : un `const` référencé plus haut que sa
 * déclaration lève à l'exécution, et la garde ne serait pas « fausse », elle serait MORTE.
 */
const PAYS_ISO =
  '(?:AD|AE|AT|BE|BG|CH|CY|CZ|DE|DK|EE|ES|FI|FR|GB|GI|GR|HR|HU|IE|IS|IT|LI|LT|LU|LV|MC|MT|NL|NO|PL|PT|RO|SE|SI|SK|SM|VA|US|CA|JP|CN|MA|TN|DZ|SN|CI)';

/**
 * Un IBAN : un code PAYS, deux chiffres de contrôle, puis 11 à 30 caractères alphanumériques.
 *
 * ⚠️ LA CASSE, COMME LES ESPACES. La forme n'acceptait que les MAJUSCULES : `fr7630006000…`
 * passait partout, `docs/` compris, et `PARTNERS_IBAN_DEBITEUR=<iban minuscule>` dans
 * `.env.example` aussi. La question de la casse avait été posée et tranchée pour le BIC, jamais
 * reportée ici — c'est le défaut typique d'une correction qui s'arrête au cas qui l'a motivée.
 * Un IBAN se copie tel qu'il est affiché, et un relevé n'impose pas la casse.
 *
 * ⚠️ ET LE CODE PAYS EST CE QUI REND LA CASSE TENABLE. Sans lui, accepter les minuscules a fait
 * reconnaître n'importe quel identifiant hexadécimal de 24 caractères —
 * `FC294892B7AA455D2398C4B6`, dans une fixture suivie depuis la PR #28 — et la garde a rougi sur
 * un dépôt PROPRE. Un faux positif dans une garde de publication coûte aussi cher qu'un faux
 * négatif : c'est lui qui la fait désarmer.
 *
 * La valeur est remontée en MAJUSCULES avant d'être signalée, pour qu'un même compte écrit de
 * deux façons ne compte pas deux fois.
 */
const FORME_IBAN = new RegExp(
  `\\b(${PAYS_ISO}\\d{2}(?:[ ]?[A-Za-z0-9]{4}){2,7}(?:[ ]?[A-Za-z0-9]{1,4})?)\\b`,
  'gi'
);

/**
 * LA CLÉ DE CONTRÔLE — ce qui distingue un IBAN d'une chaîne qui lui ressemble.
 *
 * Le code pays a fermé `FC29…`, mais pas `DE72D8B01D…` ni `AE77F99D…` : `DE` et `AE` SONT des
 * codes pays, et ces deux-là sont des identifiants hexadécimaux d'une fixture suivie. Empiler des
 * heuristiques de forme ne ferme jamais cette classe — il y aura toujours un identifiant dont les
 * deux premières lettres font un pays.
 *
 * La norme, elle, tranche : un IBAN porte deux chiffres de contrôle, et le nombre obtenu en
 * déplaçant ses quatre premiers caractères à la fin puis en remplaçant chaque lettre par son rang
 * (A = 10 … Z = 35) vaut 1 modulo 97. Aucune des chaînes qui nous gênaient ne le vérifie ; le
 * témoin de la garde et les IBAN réels le vérifient tous.
 *
 * CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ : un IBAN mal recopié n'est plus vu. C'est acceptable —
 * un IBAN dont la clé est fausse n'autorise aucun prélèvement, il n'est pas la fuite qu'on
 * craint. Un IBAN copié depuis un relevé, lui, est toujours valide.
 */
export function cleIbanValide(valeur: string): boolean {
  const s = valeur.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 15 || s.length > 34) return false;
  const reorganise = s.slice(4) + s.slice(0, 4);
  let reste = 0;
  for (const c of reorganise) {
    const chiffres = /[0-9]/.test(c) ? c : (c.charCodeAt(0) - 55).toString();
    for (const d of chiffres) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}
/** Un numéro de TVA intracommunautaire français. */
const FORME_TVA_FR = /\b(FR[0-9A-Z]{2}\d{9})\b/g;
/**
 * Un BIC, reconnu à son MOT-CLÉ. `config/entite.json` déclare `bic` secret au même titre que
 * l'IBAN, et aucune forme ne le cherchait : la lentille `securite` a écrit un BIC en clair hors
 * registre et la garde est restée verte. Le mot-clé est exigé — huit lettres majuscules nues sont
 * trop souvent autre chose (un identifiant, une constante, un acronyme), et une forme nue aurait
 * produit un bruit qui aurait fait désarmer la garde.
 */
// ⚠️ PAS DE DRAPEAU `i`. Une première version portait `/gi`, et le drapeau s'appliquait aussi
// à la VALEUR : `[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}` reconnaissait alors n'importe quel mot de huit
// lettres minuscules. Mesuré sur ce dépôt : « confront », « ceptrice », « variante » — de la
// prose ordinaire, à vingt-quatre caractères d'un « BIC » écrit juste avant. Le mot-clé doit
// donc tolérer les deux casses SANS que la valeur les tolère, d'où la classe explicite.
// Le mot-clé se borne sur un NON-ALPHANUMÉRIQUE et non sur `\\b` : `PARTNERS_BIC_DEBITEUR=…`
// ne correspondait pas, le tiret bas étant un caractère de mot — or c'est le nom que
// `src/config/entite.ts` donne à la variable, dans un fichier que ce lot vient d'ajouter au
// balayage. La valeur est cherchée AVANT comme APRÈS le mot-clé, et sur la ligne suivante : un
// RIB collé met l'étiquette sur une ligne et la valeur sur la suivante.
// ⚠️ LE CODE PAYS NE SUFFIT PAS, et `DOCUSEAL` le prouve : `DOCU` + `SE` + `AL`, où `SE` EST la
// Suède. Un discriminant qu'on n'éprouve pas contre le cas qui l'a motivé ne discrimine rien —
// je l'ai posé pour fermer ce faux positif précis, et il ne le fermait pas.
// Ce qui sépare « BIC : BNPAFRPPXXX » de « Le BIC arrive avec DOCUSEAL plus tard », ce n'est pas
// la VALEUR, c'est ce qu'il y a ENTRE : un délimiteur de valeur d'un côté (`=`, `:`, guillemet,
// fin de ligne), des MOTS de l'autre. Une valeur se donne après un délimiteur ; la prose, non.
// Le mot-clé tolère `PARTNERS_BIC_DEBITEUR=…` — le tiret bas est un caractère de mot, donc `\b`
// ne le bornait pas, or c'est le nom que `src/config/entite.ts` donne à la variable.
// Le séparateur est un GROUPE, pas un caractère : entre l'étiquette et la valeur on trouve en
// pratique ` = "`, ` :`, `":` ou une fin de ligne. Une première version n'acceptait qu'UN
// délimiteur, et `PARTNERS_BIC_DEBITEUR = "BNPAFRPPXXX"` lui échappait sur le guillemet — le cas
// même que ce correctif visait. Un séparateur écrit pour un exemple ne couvre que cet exemple.
// 🔴 UNE RÉGRESSION, ET ELLE PORTAIT SUR LES FORMATS MÊMES QUE CE LOT AJOUTE AU BALAYAGE.
// La première version commençait par `[ \t]*[=:]`, si bien que `"bic": "BNPAFRPPXXX"` lui
// échappait : en JSON, le guillemet FERMANT de la clé s'intercale entre le mot-clé et le
// deux-points. La forme rougissait à `5bcbe22` et ne rougissait plus après mon correctif — j'ai
// fermé un faux positif de prose en ouvrant un faux négatif sur du JSON, du XML (`<BICFI>`, la
// balise réelle d'un `pain.001`) et du CSV, c'est-à-dire sur les fichiers bancaires.
// Le mot-clé peut donc être suivi de caractères de mot (`BICFI`), d'un guillemet fermant, puis
// d'un délimiteur pris au sens large : `:`  `=`  `,`  `>` ou une fin de ligne.
//
// ⚠️ CE QUI RESTE DEHORS, ET QUI EST ÉCRIT PLUTÔT QUE TU : un BIC en prose SANS délimiteur —
// « Le BIC est BNPAFRPP. » — n'est pas vu. C'est le prix du contre-témoin `DOCUSEAL` : accepter
// la prose sans délimiteur fait rougir tout mot de huit lettres proche d'un « BIC », et une garde
// qui rougit sur du français ordinaire se fait désarmer dans la semaine.
const SEPARATEUR_DE_VALEUR =
  '(?:["\'`]?[ \\t]*[=:,>][ \\t\\n]*|[ \\t]*\\n[ \\t]*)["\'`]?[ \\t]*';
const FORME_BIC = new RegExp(
  `[Bb][Ii][Cc][A-Za-z0-9_-]{0,24}?${SEPARATEUR_DE_VALEUR}([A-Z]{4}${PAYS_ISO}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)(?![A-Za-z0-9])`,
  'g'
);

/** Un SIREN ou un SIRET, reconnu à son mot-clé : neuf chiffres nus sont trop souvent autre chose. */
const FORME_SIREN = /\bsire[tn]\b[^\n]{0,24}?\b(\d{9,14})\b/gi;

/**
 * Une coordonnée en clair dans un fichier — et les DEUX exclusions que le contrôle assume.
 *
 * (1) TOUS LES NUMÉROS NE SE VALENT PAS. Un IBAN est un secret : divulgué, il ne se reprend pas,
 *     et il autorise un prélèvement. Un SIREN, un SIRET et un numéro de TVA sont, eux, des données
 *     PUBLIQUES — n'importe qui les lit au répertoire des entreprises. Les traiter à l'identique
 *     aurait rendu la garde intenable : `docs/DECISIONS.md` porte le SIREN de l'entité parce que
 *     c'est son travail de l'arrêter, et une spécification a le droit de le citer. L'IBAN est donc
 *     refusé PARTOUT ; le SIREN, le SIRET et la TVA ne le sont que dans un fichier de CODE, où ils
 *     doivent être LUS et non portés (RM-01, famille `valeur_recopiee` pour les nôtres).
 * (2) UNE VALEUR D'APPARENCE ÉVIDENTE D'EXEMPLE (`123456789`, `000000000`) n'est pas une fuite :
 *     c'est un bouchon de test, et les fichiers de test en portent légitimement. Le danger de
 *     l'exemple est ailleurs — dans un document SIGNÉ — et c'est le registre qui le refuse
 *     (`exemple_plausible`). Sans cette exclusion, la garde rougirait sur son propre fichier de
 *     test, et on l'aurait désarmée la semaine suivante.
 */
/**
 * Les espaces NORMALISÉS avant toute recherche. `FORME_IBAN` sépare ses groupes par une espace
 * ASCII littérale ; un IBAN collé avec des espaces insécables — ce que produit un copier-coller
 * depuis un relevé bancaire ou un traitement de texte, c'est-à-dire le cas le plus probable —
 * ne correspondait à rien et passait. Mesuré par la lentille `securite` le 2026-09-05.
 */
function normaliserEspaces(t: string): string {
  return t.replace(/[   -   　‑-]/g, ' ');
}

/** Un fichier de TEST a le droit de porter un bouchon : c'est le seul endroit où il en a le droit. */
function estFichierDeTest(chemin: string): boolean {
  return /(^|\/)tests?\//.test(chemin) || /\.(spec|test)\.[cm]?tsx?$/.test(chemin);
}

/**
 * LE REGISTRE EST LA SOURCE, ET C'EST TOUT CE QU'IL A LE DROIT DE PORTER.
 *
 * Il porte légitimement son SIREN, son SIRET et sa TVA — ce sont SES valeurs, publiques, et c'est
 * son travail de les arrêter. Il n'a en revanche AUCUNE raison de porter une coordonnée bancaire
 * ailleurs que dans ses deux champs secrets, où `secret_commite` la juge champ par champ. Un IBAN
 * qui apparaît dans un troisième champ n'est pas une valeur du registre : c'est une fuite.
 *
 * 🔴 CETTE FONCTION A PORTÉ UNE INDULGENCE, ET ELLE NE PROTÉGEAIT RIEN.
 * Elle rendait `true` sur `estExemplePlausible(valeur)`, pour laisser le registre documenter les
 * formes d'exemple qu'il interdit. Or je venais de bannir cette indulgence de tout le dépôt —
 * « une heuristique d'indulgence appliquée hors de son domaine ouvre une porte » — et je la
 * réintroduisais pour le seul fichier qu'on ouvre avec un RIB en main.
 *
 * La lentille `securite` l'a démontré par CONSTRUCTION, pas par argument : un IBAN à clé mod-97
 * VALIDE et à compte zéro-padé, posé dans `banqueReceptrice.espaceDeTest`, restait invisible ici
 * alors que le MÊME IBAN rougissait dans `docs/DECISIONS.md` et dans `.env.example`. Et la clause
 * ne servait à rien : les deux exemples que le registre documente — `FR7612345678901234567890123`
 * et `FR12123456789` — ont une clé mod-97 FAUSSE, donc `cleIbanValide` les écarte déjà en amont.
 * Retirée, l'arbre reste vert, `--prove` reste vert, et le trou se ferme.
 *
 * 🔑 Une clause qui ne protège aucun cas réel n'est pas neutre : elle coûte exactement la fuite
 * qu'elle laisse passer. Et elle est née d'un réflexe — préserver un comportement qu'on venait de
 * juger dangereux ailleurs, parce qu'ici il « semblait » nécessaire, sans le vérifier.
 */
function coordonneeLegitimeAuRegistre(_valeur: string, formeEstIban: boolean): boolean {
  return !formeEstIban;
}

function coordonneesDe(contenu: string, dansDuCode: boolean, chemin = ''): string[] {
  const trouvees: string[] = [];
  const texte = normaliserEspaces(contenu);
  const formes = dansDuCode
    ? [FORME_IBAN, FORME_BIC, FORME_TVA_FR, FORME_SIREN]
    : [FORME_IBAN, FORME_BIC];
  const tolereUnBouchon = estFichierDeTest(chemin);
  for (const forme of formes) {
    forme.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = forme.exec(texte)) !== null) {
      const brut = (m[1] ?? '').replace(/\s/g, '');
      if (forme === FORME_IBAN) {
        const chiffres = brut.replace(/\D/g, '').length;
        if (brut.length < 15 || brut.length > 34 || chiffres < 10) continue;
        // La clé de contrôle, et non une heuristique de plus : c'est elle qui sépare un IBAN
        // d'un identifiant hexadécimal dont les deux premières lettres font un code pays.
        if (!cleIbanValide(brut)) continue;
      }
      // 🔴 L'EXCUSE « ÇA RESSEMBLE À UN EXEMPLE » NE VAUT QUE DANS UN FICHIER DE TEST.
      // Elle s'appliquait partout, et `estExemplePlausible` rend `true` dès SIX chiffres
      // identiques consécutifs — or un IBAN français réel porte très souvent un numéro de
      // compte zéro-padé. La lentille `securite` a produit trois IBAN réels de cette forme :
      // la garde les a tous laissés passer. Une heuristique d'indulgence appliquée hors de son
      // domaine ne fait pas taire du bruit, elle ouvre une porte.
      if (tolereUnBouchon && estExemplePlausible(brut)) continue;
      // Le registre lui-meme : il porte SES valeurs publiques et les exemples qu'il documente,
      // jamais une coordonnee bancaire hors de ses deux champs secrets.
      if (chemin === CHEMIN_REGISTRE && coordonneeLegitimeAuRegistre(brut, forme === FORME_IBAN)) continue;
      trouvees.push(forme === FORME_IBAN ? brut.toUpperCase() : brut);
    }
  }
  return [...new Set(trouvees)];
}

// ── Le contrôle ───────────────────────────────────────────────────────────────────────────────

export function controler(u: Univers): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

  for (const champ of CHAMPS) {
    const v = valeur(u.registre, champ.cle);

    if (v === undefined) {
      ajouter(
        'champ_absent',
        `\`${CHEMIN_REGISTRE}\` → \`${champ.cle}\` (${champ.libelle}) est ABSENT. Un champ absent ` +
          `n'est pas une valeur vide : il est invisible, et personne ne saura qu'il manquait. ` +
          `Écris-y \`${SENTINELLE}\`.`
      );
      continue;
    }
    if (v.trim() === '') {
      ajouter(
        'champ_vide',
        `\`${champ.cle}\` (${champ.libelle}) est une chaîne VIDE. \`partners/ADR-0009\` l'interdit ` +
          `au même titre que \`null\` : seule \`${SENTINELLE}\` se voit et se cherche.`
      );
      continue;
    }

    if (champ.secret) {
      if (!estSentinelle(v)) {
        ajouter(
          'secret_commite',
          `\`${champ.cle}\` (${champ.libelle}) porte une valeur autre que la sentinelle. Ce dépôt ` +
            `est PUBLIC (REQ-GOV-031, décision W13) : ce qui y entre reste lisible pour toujours, ` +
            `forks et caches compris, y compris après un passage en privé. Remets \`${SENTINELLE}\` ` +
            `et pose la valeur dans \`${champ.env}\`. Si elle a déjà été poussée, elle est à ` +
            `considérer comme divulguée : c'est la coordonnée qu'il faut changer, pas le commit.`
        );
      }
      continue;
    }

    if (champ.identifiant && !estSentinelle(v) && estExemplePlausible(v)) {
      ajouter(
        'exemple_plausible',
        `\`${champ.cle}\` (${champ.libelle}) vaut « ${v} », qui a la forme d'un EXEMPLE. C'est le ` +
          `seul remplissage interdit : un numéro d'exemple oublié dans un document signé ne se ` +
          `distingue pas d'une vraie valeur. Écris la valeur réelle, ou \`${SENTINELLE}\`.`
      );
    }

    if (champ.ancre === null) continue;

    const texte = champ.ancre.source === 'decisions' ? u.decisions : u.exigences;
    const chemin = champ.ancre.source === 'decisions' ? CHEMIN_DECISIONS : CHEMIN_EXIGENCES;
    const ligne = ligneSource(texte, champ.ancre.id);

    if (ligne === '') {
      ajouter(
        'source_illisible',
        `\`${champ.cle}\` dit tenir sa valeur de \`${champ.ancre.id}\`, introuvable dans ` +
          `\`${chemin}\`. La garde ne sait plus ce qu'elle attend : ne pas avoir pu lire n'est ` +
          `jamais un vert.`
      );
      continue;
    }

    const estArretee = arretee(texte, champ.ancre.id, champ.ancre.source);

    if (estArretee && estSentinelle(v)) {
      ajouter(
        'sentinelle_sur_decision_arretee',
        `\`${champ.cle}\` (${champ.libelle}) vaut ${SENTINELLE} alors que \`${champ.ancre.id}\` ` +
          `est ARRÊTÉE dans \`${chemin}\`. Une décision prise et non reportée dans le registre est ` +
          `une décision qui sera reprise à zéro : reporte la valeur.`
      );
    } else if (!estArretee && !estSentinelle(v)) {
      ajouter(
        'valeur_sans_decision',
        `\`${champ.cle}\` (${champ.libelle}) porte une valeur alors que \`${champ.ancre.id}\` n'est ` +
          `PAS arrêtée dans \`${chemin}\`. Le registre affirmerait ce que personne n'a tranché. ` +
          `Remets \`${SENTINELLE}\`, ou fais trancher la décision.`
      );
    } else if (estArretee && !normaliser(ligne).includes(normaliser(v))) {
      ajouter(
        'divergence_avec_la_source',
        `\`${champ.cle}\` vaut « ${v} », qui ne se retrouve pas dans la ligne \`${champ.ancre.id}\` ` +
          `de \`${chemin}\`. Deux copies divergent toujours, et celle qui est lue n'est jamais ` +
          `celle qui a été corrigée (RM-01) : aligne le registre sur la décision, ou la décision ` +
          `sur le registre — mais pas les deux à la fois.`
      );
    }
  }

  // ── Ce qui fuit dans les fichiers ───────────────────────────────────────────────────────────
  const identifiants = CHAMPS.filter((c) => c.identifiant)
    .map((c) => ({ champ: c, v: valeur(u.registre, c.cle) }))
    .filter((x): x is { champ: (typeof CHAMPS)[number]; v: string } => typeof x.v === 'string')
    .filter((x) => !estSentinelle(x.v) && x.v.length >= 6);

  for (const fichier of u.fichiers) {
    const code = estCode(fichier.chemin);
    // L'exemption ne porte QUE sur la recopie d'une valeur PUBLIQUE. Elle ne dispense d'aucune
    // recherche de secret : c'est la correction du veto de la lentille `securite` (2026-09-05).
    const exemptDeRecopie = estExemptDe(fichier.chemin, 'recopie');
    if (code && !exemptDeRecopie) {
      for (const { champ, v } of identifiants) {
        if (fichier.contenu.includes(v)) {
          ajouter(
            'valeur_recopiee',
            `${fichier.chemin} — \`${champ.cle}\` (${champ.libelle}) est RECOPIÉE ici. Une seule ` +
              `source (RM-01) : \`import { entiteContractante } from 'src/config/entite'\`. C'est ` +
              `cette lecture, et rien d'autre, qui fait que le SIREN du contrat, celui du mandat ` +
              `et celui du virement sont le même octet (REQ-CPL-001).`
          );
        }
      }
    }

    const exemptDeCoordonnee = estExemptDe(fichier.chemin, 'coordonnee');
    for (const coordonnee of exemptDeCoordonnee ? [] : coordonneesDe(fichier.contenu, code, fichier.chemin)) {
      ajouter(
        'coordonnee_en_clair',
        `${fichier.chemin} — coordonnée en clair « ${coordonnee} ». Ces valeurs vivent dans ` +
          `\`${CHEMIN_REGISTRE}\` ou dans une variable d'environnement, jamais dans un fichier ` +
          `versionné d'un dépôt PUBLIC (REQ-GOV-031).`
      );
    }

    for (const point of POINTS_DE_SORTIE) {
      if (!new RegExp(point.motifChemin).test(fichier.chemin)) continue;
      if (fichier.contenu.includes('exigerEntiteRenseignee')) continue;
      ajouter(
        'point_de_sortie_sans_refus',
        `${fichier.chemin} — ce fichier a le nom d'un point de sortie (« ${point.libelle} ») et ` +
          `n'appelle pas \`exigerEntiteRenseignee('${point.id}')\`. Sans cet appel, un contrat, un ` +
          `mandat, un virement ou une déclaration peut partir avec \`${SENTINELLE}\` imprimé ` +
          `dessus. Les champs que ce point exige sont déclarés dans \`src/config/entite.ts\`.`
      );
    }
  }

  return fautes;
}

// ── L'univers réel ────────────────────────────────────────────────────────────────────────────

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function lireUnivers(): Univers {
  const fichiers: Fichier[] = [];
  for (const chemin of fichiersSuivis()) {
    // Le fichier n'est PLUS écarté ici : il entre dans l'univers, et c'est `controler()` qui
    // décide famille par famille. Un `continue` à cet endroit rendait le fichier invisible à
    // TOUTES les familles, `coordonnee_en_clair` comprise — c'est ce que la lentille `securite`
    // a mis en veto le 2026-09-05.
    if (!estBalaye(chemin) || !existsSync(chemin)) continue;
    fichiers.push({ chemin, contenu: readFileSync(chemin, 'utf8') });
  }
  return {
    registre: registreDuDepot(),
    decisions: readFileSync(CHEMIN_DECISIONS, 'utf8'),
    exigences: readFileSync(CHEMIN_EXIGENCES, 'utf8'),
    fichiers,
  };
}

// ── L'univers de FIXTURE — aucune valeur du dépôt (RM-11) ─────────────────────────────────────

/**
 * Un IBAN de la documentation bancaire, jamais celui d'AXION IA SAS. Il sert de témoin aux deux
 * familles qui ont besoin d'une forme réelle (`secret_commite`, `coordonnee_en_clair`) : une garde
 * qu'on n'aurait vue rougir que sur `A-RENSEIGNER` ne prouverait rien du cas qui compte.
 */
export const IBAN_TEMOIN = 'FR1420041010050500013M02606';

const DECISIONS_TEMOIN = [
  '## 1. Sans valeur par défaut possible — bloquent le code',
  '',
  '| Id | Décision | Pourquoi aucune hypothèse | Phase bloquée | Propriétaire |',
  '| --- | --- | --- | --- | --- |',
  '| **W1** ✅ *tranchée* | Entité qui signe et qui paie | **SOCIETE TEMOIN SAS** — SIREN `204070311`, SIRET `20407031100017`, TVA `FR44204070311`, 7 rue du Temoin, 38000 Ville | — | −1 |',
  '| **W3** ✅ *tranchée* | Domaine servi et domaine d’envoi | **`temoin.exemple.test`** pour l’espace | migration | −1 |',
  '| **W4** ✅ *tranchée* | Têtes de réseau | **Un porteur = une personne**, qui peut exercer via une structure | — | −1 |',
  '',
  '## 2. Hypothèses par défaut — le code avance',
  '',
  '| Id | Décision | Hypothèse appliquée | Réversibilité | Phase | À trancher avant | Tranchée |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| HYP-W2 | Banque réceptrice du SEPA | Générateur `pain.001.001.03` générique + **remise manuelle avec identifiant de bout en bout** | paramètre | 2 | armement | — |',
].join('\n');

const EXIGENCES_TEMOIN = [
  '- **REQ-CPL-004** — Résidence fiscale temoin obligatoire en V1 : le KYC refuse un établissement hors périmètre.',
  '- **REQ-CPL-018** — ADR « mono-tenant en V1, aucune colonne tenant ».',
].join('\n');

const REGISTRE_TEMOIN: Registre = {
  version: 1,
  entite: {
    denomination: 'SOCIETE TEMOIN SAS',
    formeJuridique: 'SAS',
    siren: '204070311',
    siret: '20407031100017',
    tvaIntracommunautaire: 'FR44204070311',
    siege: '7 rue du Temoin, 38000 Ville',
  },
  domaines: { servi: 'temoin.exemple.test', envoi: SENTINELLE },
  perimetre: {
    modeleTetesDeReseau: 'Un porteur = une personne',
    residenceFiscaleExigee: 'temoin',
    tenance: 'mono-tenant',
  },
  banqueDebitrice: { iban: SENTINELLE, bic: SENTINELLE },
  banqueReceptrice: {
    versionPain001: 'pain.001.001.03',
    modeDeRemise: 'remise manuelle avec identifiant de bout en bout',
    bic: SENTINELLE,
    jeuDeCaracteres: SENTINELLE,
    espaceDeTest: SENTINELLE,
    formatReleveCsv: SENTINELLE,
  },
};

/**
 * L'univers CONFORME — le contre-témoin qui porte tout le reste. Il décrit l'état exact que le
 * dépôt doit avoir : les décisions arrêtées reportées, les secrets à la sentinelle, ce que la
 * banque n'a pas encore dit à la sentinelle. C'est là que se joue la distinction qui a failli
 * rendre cette garde intenable — « complet POUR LE DÉPÔT » n'est pas « complet POUR LA MISE EN
 * SERVICE ». Les confondre aurait rendu la garde rouge à vie.
 */
export const UNIVERS_CONFORME: Univers = {
  registre: REGISTRE_TEMOIN,
  decisions: DECISIONS_TEMOIN,
  exigences: EXIGENCES_TEMOIN,
  fichiers: [
    { chemin: 'src/apporteur/profil.ts', contenu: "import { entiteContractante } from '../config/entite';\n" },
    { chemin: 'docs/spec/note.md', contenu: 'La société est immatriculée sous le SIREN 204070311.\n' },
  ],
};

function muter(mutation: (u: Univers) => void): Univers {
  const copie = structuredClone(UNIVERS_CONFORME);
  mutation(copie);
  return copie;
}

function prouver(): number {
  const TEMOINS: { famille: string; univers: Univers }[] = [
    {
      famille: 'champ_absent',
      univers: muter((u) => {
        delete (u.registre.entite as Partial<Registre['entite']>).siren;
      }),
    },
    { famille: 'champ_vide', univers: muter((u) => { u.registre.entite.siren = '   '; }) },
    {
      // Le témoin qui compte : le dépôt est public, et c'est ce cas-là qui est irréversible.
      famille: 'secret_commite',
      univers: muter((u) => { u.registre.banqueDebitrice.iban = IBAN_TEMOIN; }),
    },
    { famille: 'exemple_plausible', univers: muter((u) => { u.registre.entite.siren = '123456789'; }) },
    {
      famille: 'sentinelle_sur_decision_arretee',
      univers: muter((u) => { u.registre.entite.siren = SENTINELLE; }),
    },
    {
      // Une décision ROUVERTE : le régime est dérivé, donc la sentinelle redevient obligatoire.
      famille: 'valeur_sans_decision',
      univers: muter((u) => { u.decisions = u.decisions.split('✅').join('⏳'); }),
    },
    {
      famille: 'divergence_avec_la_source',
      univers: muter((u) => { u.registre.entite.siren = '204070312'; }),
    },
    {
      famille: 'source_illisible',
      univers: muter((u) => {
        u.decisions = u.decisions
          .split('\n')
          .filter((l) => !l.startsWith('| **W1**'))
          .join('\n');
      }),
    },
    {
      famille: 'valeur_recopiee',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'src/facturation/entete.ts',
          contenu: `export const SIREN_EMETTEUR = '${REGISTRE_TEMOIN.entite.siren}';\n`,
        });
      }),
    },
    {
      famille: 'coordonnee_en_clair',
      univers: muter((u) => {
        u.fichiers.push({ chemin: 'docs/note-de-travail.md', contenu: `Virement depuis ${IBAN_TEMOIN}.\n` });
      }),
    },
    {
      famille: 'point_de_sortie_sans_refus',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'src/sortie/mandat-autofacturation.ts',
          contenu: 'export function emettreMandat() { return "sans garde"; }\n',
        });
      }),
    },
  ];

  const CONTRE_TEMOINS: { quoi: string; univers: Univers }[] = [
    { quoi: 'un registre conforme, secrets à la sentinelle', univers: UNIVERS_CONFORME },
    {
      quoi: 'une note de spécification qui CITE le SIREN — citer n’est pas se servir',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'docs/spec/entite.md',
          contenu: `L’entité contractante porte le SIREN ${REGISTRE_TEMOIN.entite.siren}.\n`,
        });
      }),
    },
    {
      quoi: 'un point de sortie qui APPELLE le refus',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'src/sortie/mandat-autofacturation.ts',
          contenu:
            "import { exigerEntiteRenseignee } from '../config/entite';\n" +
            "export function emettreMandat() { exigerEntiteRenseignee('mandat-autofacturation'); }\n",
        });
      }),
    },
    {
      quoi: 'un bouchon de test d’apparence évidente d’exemple',
      univers: muter((u) => {
        u.fichiers.push({ chemin: 'tests/unit/x.spec.ts', contenu: "const siren = '000000000';\n" });
      }),
    },
    {
      quoi: 'une empreinte hexadécimale, qui ressemble à un IBAN sans en être un',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'packages/contracts.sha256',
          contenu: 'AB12CDEF3456789012345678901234567890ABCD\n',
        });
      }),
    },
    {
      quoi: 'un champ sans ancre, rempli le jour où la banque répond',
      univers: muter((u) => { u.registre.banqueReceptrice.bic = 'CMCIFR2A'; }),
    },
    {
      quoi: 'le sous-domaine d’envoi, encore à la sentinelle, ne bloque rien',
      univers: muter((u) => { u.registre.domaines.envoi = SENTINELLE; }),
    },
  ];

  for (const t of TEMOINS) {
    const f = controler(t.univers);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). La règle ne couvre pas ce qu'elle prétend couvrir.`
      );
      return 1;
    }
  }

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.univers);
    if (f.length > 0) {
      console.error(
        `❌ Faux positif : « ${c.quoi} » a fait rougir « ${f[0]!.famille} ». La règle est trop large.\n` +
          `   ${f[0]!.message}`
      );
      return 1;
    }
  }

  const sansTemoin = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  if (sansTemoin.length > 0) {
    console.error(
      `❌ ${sansTemoin.length} famille(s) sans témoin qui rougit : ${sansTemoin.join(', ')}.\n` +
        `   Une règle jamais vue rougir ne garde rien.`
    );
    return 1;
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts, dont l'univers conforme.`);
  return 0;
}

// ── ligne de commande ─────────────────────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement (leçon de `gov-depot.ts`).
const APPELE_DIRECTEMENT = /gov-entite\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    process.exit(prouver());
  } else {
    const univers = lireUnivers();
    const fautes = controler(univers);
    if (fautes.length > 0) {
      console.error(`❌ gov:entite — ${fautes.length} défaut(s) du registre d'entité :\n`);
      fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
      if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
      console.error(
        `\nCe dépôt est PUBLIC : une coordonnée bancaire poussée une fois y reste lisible pour ` +
          `toujours. La sentinelle \`${SENTINELLE}\` est la seule valeur que ces champs y prennent.`
      );
      process.exit(1);
    }

    const secrets = CHAMPS.filter((c) => c.secret);
    const attente = CHAMPS.filter(
      (c) => !c.secret && estSentinelle(valeur(univers.registre, c.cle) ?? '')
    );
    const arretes = CHAMPS.length - secrets.length - attente.length;
    console.log(
      `✅ gov:entite — \`${CHEMIN_REGISTRE}\` conforme : ${CHAMPS.length} champs, ` +
        `${arretes} arrêté(s) et attesté(s) par leur ligne de décision, ${attente.length} à la ` +
        `sentinelle, ${secrets.length} secret(s) qui ne prennent jamais d'autre valeur ici. ` +
        `${univers.fichiers.length} fichier(s) suivi(s) balayé(s) : aucune coordonnée en clair, ` +
        `aucune valeur recopiée, aucun point de sortie sans refus.`
    );
    console.log(
      `   ⚠️ Cette garde n'AUTORISE pas la mise en service pour autant : ` +
        `\`exigerEntiteRenseignee\` refuse encore les points de sortie dont un champ vaut ` +
        `${SENTINELLE}, et c'est voulu — les phases 0 à 3 se codent contre la sentinelle ` +
        `(\`partners/ADR-0009\`).`
    );
    process.exit(0);
  }
}
