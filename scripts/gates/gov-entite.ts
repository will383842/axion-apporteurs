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
import { createHash } from 'node:crypto';
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
 *   — `'coordonnee'` : le fichier peut porter une coordonnée. TROIS entrées le portent, et il
 *     faut les nommer toutes les trois — annoncer une surface d'exemption plus ÉTROITE que le
 *     code est, dans une garde de publication, le sens dangereux de l'erreur :
 *       · `scripts/gates/gov-entite.ts` et `tests/unit/gouvernance/entite-registre.spec.ts`,
 *         parce qu'un document qui explique la règle doit pouvoir écrire son contre-exemple ;
 *       · `pnpm-lock.yaml`, empreintes de paquets, aucune prose — exemption de commodité dont
 *         la raison écrite parle de faux positifs et non de secrets, et qui est donc la plus
 *         discutable des trois.
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
 * Extraites ici, elles ont un TEST — `tests/unit/gouvernance/entite-registre.spec.ts`, cinq
 * CINQ CAS, dont un CONTRE-TÉMOIN — « un fichier binaire ou d'image n'est pas balayé », sans
 * lequel la liste d'extensions pourrait être remplacée par un attrape-tout sans qu'un test tombe.
 * Les deux mutations ci-dessus y tombent (7 et 3 échecs).
 *
 * ⚠️ Elles n'ont PAS de famille dans `--prove`, et une première rédaction de ce paragraphe en
 * annonçait une, `filtre_trop_large`, qui n'existe nulle part : `FAMILLES` en porte onze, aucune
 * de ce nom. La phrase rouvrait donc EN PROSE le trou que l'extraction venait de fermer — annoncer
 * une preuve qu'on n'a pas est précisément ce qui fait qu'on ne la cherche plus. Le test suffit ;
 * l'annonce, non.
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
 * CE QUE ÇA COÛTE, ET QUI EST ASSUMÉ : un IBAN dont la clé est fausse n'est plus vu. Une faute de
 * frappe n'autorise aucun prélèvement, et un IBAN copié depuis un relevé est toujours valide.
 *
 * ⚠️ MAIS LE RÉSIDU RÉEL N'EST PAS LA FAUTE DE FRAPPE, C'EST L'IBAN PARTIELLEMENT MASQUÉ.
 * `FR76 3000 6000 01•• •••• •••0 189` a une clé fausse, donc il passe — et il divulgue pourtant
 * encore la banque, le guichet et l'essentiel du numéro de compte. Une personne qui masque quatre
 * caractères avant de coller un RIB dans un ticket **croira s'être protégée**, et cette garde ne
 * la contredira pas. C'est une limite ASSUMÉE, pas un oubli : la couvrir demanderait de renoncer
 * à la clé, donc de rougir sur un dépôt propre — ce qui fait désarmer la garde. Elle est écrite
 * ici ET dans le `verifie` de la gate, parce que ces deux textes ont deux lecteurs différents :
 * celui qui voudra « renforcer » la forme dans six mois, et celui qui décidera de ne PAS
 * re-vérifier en lisant le registre.
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
// ⚠️ CE QUI RESTE DEHORS, ET LA PREMIÈRE RÉDACTION DE CE PARAGRAPHE ÉTAIT PLUS ÉTROITE QUE LE RÉEL.
// J'avais écrit « un BIC en prose SANS délimiteur n'est pas vu ». C'est vrai et insuffisant : la
// règle exacte est que **le délimiteur doit être ADJACENT au mot-clé**. Restent donc verts, AVEC
// un délimiteur : « BIC de la banque : X », « Le BIC du bénéficiaire est : X », une cellule de
// tableau « | BIC | X | », « BIC : BNPA FRPP XXX » (valeur espacée), « SWIFT : X » (l'autre nom
// du BIC), et la casse minuscule de la valeur.
// C'est le prix du contre-témoin `DOCUSEAL` : élargir la fenêtre entre le mot-clé et la valeur
// fait rougir tout mot de huit lettres proche d'un « BIC », et une garde qui rougit sur du
// français ordinaire se fait désarmer dans la semaine.
// 🔑 Un résidu écrit plus étroit que le réel est une sur-annonce : il rassure exactement là où il
// ne protège pas. Le dire large est le seul moyen que le prochain lecteur le mette en doute.
// ⚠️ TROISIÈME RÉGLAGE DE CETTE FORME, ET LES DEUX PREMIERS ONT COÛTÉ.
// (1) `[=:]` seul ratait le JSON, où le guillemet fermant de la clé s'intercale.
// (2) Y ajouter `,` et `>` a fermé le JSON et le XML, et OUVERT des faux positifs sur du français
//     ordinaire : « Le BIC, DOCUSEAL et le reste. » et « BIC > DOCUSEAL » rougissaient — or
//     `DOCUSEAL` est l'identifiant d'un point de sortie déclaré, donc une phrase que quelqu'un
//     écrira. Et le `\b` de gauche manquait : `iambic:` rougissait aussi.
//     🔑 Le remède d'un rouge injuste est toujours le même : on retire la garde. Un faux positif
//     dans une garde de publication est donc un défaut de SÉCURITÉ, pas de confort.
//
// Le réglage juste sépare les deux mondes au lieu de les mélanger dans une classe de caractères :
//   — le monde BALISÉ (`<BIC>`, `<BICFI>`) a sa propre alternative, où le `>` est structurel ;
//   — le monde CLÉ-VALEUR (`=`, `:`) garde le sien, guillemet fermant admis.
// La virgule est RETIRÉE : un CSV réel nomme ses colonnes en en-tête et porte ses valeurs sur une
// autre ligne, donc le mot-clé n'y est jamais adjacent à sa valeur — elle n'achetait rien et
// coûtait la phrase ci-dessus. Un relevé réel porte de toute façon l'IBAN à côté du BIC.
const BALISE_BIC = '<[A-Za-z]{0,8}[Bb][Ii][Cc][A-Za-z]{0,8}>[ \\t\\n]*';
const CLE_VALEUR_BIC =
  '(?<![A-Za-z])[Bb][Ii][Cc][A-Za-z0-9_-]{0,24}?(?:["\'`]?[ \\t]*[=:][ \\t\\n]*|[ \\t]*\\n[ \\t]*)["\'`]?[ \\t]*';
const FORME_BIC = new RegExp(
  `(?:${BALISE_BIC}|${CLE_VALEUR_BIC})([A-Z]{4}${PAYS_ISO}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)(?![A-Za-z0-9])`,
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
/**
 * LES FORMES QUE LA GARDE NEUTRALISE, EXPORTÉES — parce qu'une substitution sans témoin n'est
 * gardée par rien. La lentille `securite` a muté cette fonction en `return t;` le 2026-09-05 et
 * a mesuré : `gov:entite` → 0, `gov:entite:prove` → 0, aucune occurrence de `00A0` dans le banc
 * d'essai. La normalisation MARCHAIT ; rien ne la tenait. Un refactor l'aurait retirée sans qu'une
 * seule étape de Gate A change de couleur.
 *
 * 🔑 Le remède n'est pas d'écrire la liste des caractères une seconde fois dans le test — deux
 * copies divergent toujours (RM-01), et celle qui garde n'est jamais celle qu'on a corrigée. La
 * classe est donc la SOURCE, exportée, et `caracteresNeutralises()` l'ÉNUMÈRE : un caractère
 * ajouté ici gagne son témoin sans qu'une ligne de test bouge, et un caractère retiré fait tomber
 * le sien.
 */
export const SEPARATEURS_NEUTRALISES = /[   -   　‑-]/g;

/**
 * Les caractères que `normaliserEspaces` ramène à une espace ASCII, ÉNUMÉRÉS depuis la classe
 * elle-même. Le balayage porte sur le plan multilingue de base : toutes les familles d'espaces et
 * de tirets typographiques y vivent, et un balayage des 17 plans coûterait une seconde pour ne
 * rien trouver de plus.
 *
 * ⚠️ TÉMOIN POSITIF EXIGÉ. Une liste VIDE et une liste juste sont indiscernables pour un test qui
 * ne ferait que boucler dessus : zéro cas exécuté se lit exactement comme zéro cas en échec.
 * `--prove` refuse donc une liste vide, et le banc d'essai vérifie qu'elle contient l'espace
 * insécable — la forme d'un copier-coller de RIB, c'est-à-dire le geste par défaut de la personne
 * qui posera la vraie valeur d'AXION en phase 2 — et qu'elle ne contient PAS l'espace ASCII, sans
 * quoi la classe serait devenue un attrape-tout.
 */
export function caracteresNeutralises(): string[] {
  const forme = new RegExp(SEPARATEURS_NEUTRALISES.source);
  const trouves: string[] = [];
  for (let point = 0; point < 0x10000; point += 1) {
    const c = String.fromCodePoint(point);
    if (forme.test(c)) trouves.push(c);
  }
  return trouves;
}

/**
 * Un IBAN COMPACT réécrit avec un séparateur entre ses groupes de quatre — la forme exacte d'un
 * RIB collé depuis un relevé, un traitement de texte ou un courriel. Ce n'est PAS une valeur :
 * c'est une transformation, et son entrée vient de l'appelant (RM-01).
 *
 * 🔴 ELLE A PORTÉ `iban.replace(/s/g, '')` — **la lettre `s`**, pas les blancs ; l'antislash
 * manquait, et sa docstring annonçait pourtant « collé depuis un relevé ». Mesuré le 2026-09-05 :
 * une entrée déjà espacée ressortait inchangée puis regroupée n'importe comment, et un IBAN
 * espagnol ou suisse écrit en minuscules perdait son `s`.
 *
 * 🔑 ET LA QUESTION VENAIT AVANT « comment normaliser » : aucun appelant ne lui passe une entrée
 * espacée. La substitution n'avait aucun témoin parce qu'elle n'avait aucun usage. La réponse
 * n'est donc pas de réparer la regex, c'est de retirer la réparation — **une fonction qui
 * « complète » une fixture VÉRIFIE, elle ne fabrique pas** (RM-03).
 */
export function ibanAvecSeparateur(iban: string, separateur: string): string {
  if (!/^[A-Za-z0-9]+$/.test(iban)) {
    throw new Error(
      `ibanAvecSeparateur attend un IBAN COMPACT — lettres et chiffres, aucun séparateur — et ` +
        `a reçu « ${iban} ». Insérer un séparateur dans une chaîne qui en porte déjà produit une ` +
        `forme qui n'est plus un IBAN, et une réparation silencieuse ferait passer le défaut pour ` +
        `un succès : passe la forme compacte (RM-03).`
    );
  }
  return (iban.match(/.{1,4}/g) ?? []).join(separateur);
}

function normaliserEspaces(t: string): string {
  return t.replace(SEPARATEURS_NEUTRALISES, ' ');
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

export function coordonneesDe(contenu: string, dansDuCode: boolean, chemin = ''): string[] {
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

// ── LE CORPS PUBLIÉ DE LA PR ──────────────────────────────────────────────────────────────────

/**
 * CE QUE LE DÉPÔT GARDAIT, ET CE QU'IL NE GARDAIT PAS.
 *
 * `docs/pr/31.tpl.md` est un fichier suivi : la garde le balaie, et l'IBAN y est masqué. Mais le
 * gabarit n'existe que pour produire UN artefact — le corps de la PR publié sur une forge dont ce
 * dépôt est PUBLIC — et cet artefact-là n'était lu par rien : `pr:corps` figure dans les scripts,
 * dans aucun workflow, et `docs/gates.json` ne portait aucune entrée pour lui.
 *
 * 🔴 CE QUE LA LENTILLE `securite` A MESURÉ SUR LA PR #31, le 2026-09-05. GitHub conserve
 * l'historique d'édition d'un corps de PR (`userContentEdits`, lisible en GraphQL par n'importe
 * qui). Le corps y avait été rendu plusieurs fois ; certaines de ces éditions portaient la forme
 * masquée, et d'autres un IBAN à clé mod-97 VRAIE, toujours lisible aujourd'hui. Masquer le corps
 * courant n'a pas dépublié les précédents.
 *
 * ⚠️ AUCUN TOTAL N'EST ÉCRIT ICI, ET C'EST LA RÈGLE QUE CE FICHIER SERT : le corps est REGÉNÉRÉ à
 * chaque tour de revue, donc tout total tapé est périmé le jour où on l'écrit — celui-ci l'était.
 * Le nombre qui a un sens est celui des éditions PORTANT une coordonnée, et il se compte dans
 * `config/exemptions-corps-publie.json`, sa source unique (RM-01). Le total, lui, s'imprime : la
 * garde le dit à chaque exécution (« lu : … révision(s) d'édition »).
 *
 * ATTÉNUATION, ET ELLE NE CHANGE RIEN À CE QU'IL FAUT CONSTRUIRE : cette valeur-là était la SONDE
 * d'un relecteur, pas la coordonnée d'AXION — il n'y a rien à révoquer. Ce qui manquait, et que
 * ces lignes ajoutent, c'est la garde qui empêchera le prochain, en phase 2, quand la valeur sera
 * réelle et l'écriture irréversible.
 *
 * CE QU'ELLE GARDE, ET LA FORMULATION EST ÉTROITE À DESSEIN : « le corps publié ne contient aucune
 * coordonnée ». PAS « le corps publié est égal au rendu local ». Le rendu de `pr:corps` n'est pas
 * déterministe — `caseRevues()` lit la forge en direct — donc une égalité octet à octet rougirait
 * sur un corps parfaitement propre, et une garde qui rougit à tort se fait désarmer dans la
 * semaine. On garde la PROPRIÉTÉ, pas l'identité.
 *
 * ET C'EST LE MÊME `coordonneesDe` QUE LES FICHIERS SUIVIS. Un second détecteur en ferait deux qui
 * divergeraient (RM-01/RM-07) : la casse, les espaces insécables, la clé mod-97 et l'exclusion du
 * SIREN — public, qu'un corps de PR a le droit de nommer — sont réglés à un seul endroit. Le corps
 * est jugé comme de la PROSE (`dansDuCode = false`) : un IBAN et un BIC y sont refusés, un SIREN
 * ne l'est pas.
 */

// ── LES EXEMPTIONS DE RÉVISION — UNE DETTE QU'ON NE PEUT PAS REMBOURSER SE DÉCLARE ────────────

/**
 * POURQUOI CE REGISTRE EXISTE, ET POURQUOI IL A FAILLI NE PAS EXISTER.
 *
 * L'historique d'édition d'un corps de PR est IMMUABLE : GitHub sert `userContentEdits` à
 * quiconque le demande, et aucune édition ultérieure ne dépublie une révision. La PR #31 porte
 * donc, pour toujours, les éditions DÉCLARÉES au registre — leur compte s'y lit, il ne se retape
 * pas ici. Câbler le mode en ligne en étape bloquante rendait cette PR-là — et toute PR de sa
 * pile — INFUSIONNABLE.
 *
 * 🔴 LA PREMIÈRE RÉPONSE A ÉTÉ LA MAUVAISE, ET C'EST MOI QUI L'AI PROPOSÉE. Elle consistait à ne
 * câbler que la preuve hors ligne et à laisser le mode en ligne « à lancer avant fusion ». Écrite
 * noir sur blanc, elle se reconnaît : **une garde qui ne tourne que quand quelqu'un y pense ne
 * tourne pas.** Le dépôt voisin connaît le même motif sous une autre forme — toutes ses gates de
 * budget portent `continue-on-error: true`, aucune PR qui alourdit le bundle n'a jamais rougi, et
 * pendant des mois les revues ont écrit « le risque est couvert par la gate ». Une gate qui ne
 * bloque pas produit une FAUSSE SÉCURITÉ, qui est pire que pas de gate du tout.
 *
 * 🔑 LA TROISIÈME VOIE : rendre l'EXCEPTION explicite plutôt que l'ABSENCE de garde. Ce qui ne
 * peut pas être corrigé se déclare — nommé, daté, borné, motivé, avec un propriétaire — et la
 * garde reste bloquante pour tout le reste. Une dette qu'on ne peut pas rembourser se déclare ;
 * elle ne se contourne pas.
 *
 * CE QUI EST BORNÉ, ET À QUEL GRAIN. Une exemption ne couvre pas une PR : elle couvre UNE
 * RÉVISION PRÉCISE d'une PR précise, portant UNE coordonnée précise. Trois clés doivent
 * concorder — `pr`, `revision` (l'horodatage exact), `empreinte`. Exempter « la PR #31 » aurait
 * absous d'avance toute révision future de cette PR, c'est-à-dire tout ce qui reste à écrire.
 *
 * ⚠️ CE QU'UNE EXEMPTION N'EST JAMAIS. Elle ne s'applique PAS au corps COURANT : celui-là
 * s'édite, donc il n'y a rien à excuser. Et elle ne s'applique jamais à une coordonnée RÉELLE :
 * une valeur réellement publiée est divulguée, et le remède est de la CHANGER, pas de l'inscrire
 * ici. Le seul motif recevable est qu'il n'y ait rien à révoquer — une valeur fabriquée.
 *
 * L'EMPREINTE, ET JAMAIS LA VALEUR. Ce registre est suivi dans un dépôt PUBLIC : y écrire la
 * coordonnée serait commettre exactement la faute qu'il documente. On y écrit un SHA-256 complet
 * de la valeur normalisée. Complet, et non tronqué : seize caractères hexadécimaux se collisionnent
 * en 2³² essais, ce qui laisserait absoudre une AUTRE coordonnée que celle qu'on a examinée.
 * Résidu assumé : une empreinte est un oracle de vérification pour qui aurait déjà la valeur en
 * main — ce qui est sans objet ici, puisque le seul motif recevable est une valeur fabriquée.
 */
export type Exemption = {
  /** Le numéro de la PR. Une exemption ne traverse jamais une PR. */
  pr: number;
  /** L'horodatage EXACT de la révision, tel que `userContentEdits` le rend. */
  revision: string;
  /** SHA-256 complet de la coordonnée normalisée. JAMAIS la valeur. */
  empreinte: string;
  /** La date à laquelle l'exemption a été déclarée — une exception sans date ne se relit pas. */
  declaree: string;
  /** Qui la déclare. Une exception sans propriétaire n'est réclamée par personne. */
  par: string;
  /** Pourquoi il n'y a rien à révoquer. C'est le seul motif recevable. */
  motif: string;
  /**
   * `true` quand l'exemption ne se refermera JAMAIS — l'historique d'édition est immuable. Le
   * champ existe pour que le lecteur sache qu'il ne s'agit pas d'un report : il n'y a pas de date
   * à laquelle cette ligne pourra être retirée, et prétendre le contraire serait un mensonge de
   * plus dans un registre qui existe pour dire la vérité sur ce qui ne peut pas être réparé.
   */
  definitive: boolean;
};

const CHEMIN_EXEMPTIONS = 'config/exemptions-corps-publie.json';

/** L'empreinte d'une coordonnée : SHA-256 complet de la valeur telle que la garde la remonte. */
export function empreinteDe(coordonnee: string): string {
  return createHash('sha256').update(coordonnee, 'utf8').digest('hex');
}

/**
 * LA STRUCTURE DU REGISTRE, JUGÉE INDÉPENDAMMENT DE TOUTE PR. Une exemption mal formée est plus
 * dangereuse qu'une exemption absente : elle a l'air d'une décision prise. Un motif vide, un
 * horodatage qui n'est pas celui d'une révision, une empreinte tronquée — chacun rend la ligne
 * illisible pour le prochain, donc irrelisable, donc permanente sans que personne ne l'ait voulue.
 */
export function controlerRegistreExemptions(exemptions: Exemption[]): Faute[] {
  const fautes: Faute[] = [];
  const vues = new Set<string>();
  for (const [i, e] of exemptions.entries()) {
    const ou = `\`${CHEMIN_EXEMPTIONS}\` #${i + 1}`;
    const manques: string[] = [];
    if (!Number.isInteger(e.pr) || e.pr <= 0) manques.push('`pr` doit être un numéro de PR');
    if (typeof e.revision !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.revision)) {
      manques.push("`revision` doit être l'horodatage ISO EXACT rendu par `userContentEdits`");
    }
    if (typeof e.empreinte !== 'string' || !/^[0-9a-f]{64}$/.test(e.empreinte)) {
      manques.push('`empreinte` doit être un SHA-256 COMPLET en minuscules — tronquée, elle se collisionne');
    }
    if (typeof e.declaree !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.declaree)) {
      manques.push('`declaree` doit porter la date de déclaration');
    }
    if (typeof e.par !== 'string' || e.par.trim() === '') manques.push('`par` doit nommer qui déclare');
    if (typeof e.motif !== 'string' || e.motif.trim().length < 40) {
      manques.push('`motif` doit dire POURQUOI il n’y a rien à révoquer — une ligne, pas un mot');
    }
    if (typeof e.definitive !== 'boolean') manques.push('`definitive` doit dire si l’exemption se refermera');
    if (manques.length > 0) {
      fautes.push({
        famille: 'exemption_malformee',
        message:
          `${ou} — ${manques.join(' ; ')}. Une exemption mal formée est PIRE qu'une exemption ` +
          `absente : elle a l'air d'une décision prise, donc plus personne ne la relit.`,
      });
      continue;
    }
    const cle = `${e.pr}@${e.revision}@${e.empreinte}`;
    if (vues.has(cle)) {
      fautes.push({
        famille: 'exemption_malformee',
        message: `${ou} — cette exemption est déjà déclarée. Deux lignes pour une exception : on ne saura pas laquelle retirer.`,
      });
    }
    vues.add(cle);
  }
  return fautes;
}

/** Le registre du dépôt. ABSENT = aucune exemption, et c'est le bon défaut : rien n'est absous. */
export function exemptionsDuDepot(): Exemption[] {
  if (!existsSync(CHEMIN_EXEMPTIONS)) return [];
  const j = JSON.parse(readFileSync(CHEMIN_EXEMPTIONS, 'utf8')) as { exemptions?: unknown };
  return Array.isArray(j.exemptions) ? (j.exemptions as Exemption[]) : [];
}

/**
 * Un texte publié sur la forge, avec ce qui permet de le retrouver.
 *
 * ⚠️ `horodatage` est SÉPARÉ de `origine`, et ce n'est pas un doublon. Une exemption s'apparie
 * sur l'horodatage EXACT rendu par `userContentEdits` ; l'apparier sur `origine`, qui est une
 * phrase destinée à un humain, ferait dépendre une décision de sécurité de la façon dont un
 * message est rédigé. Le jour où quelqu'un reformule « révision du … », toutes les exemptions
 * cesseraient de s'apparier — et le verdict serait rouge, pas vert, mais pour la mauvaise raison.
 */
export type CorpsPublie = { origine: string; horodatage: string | null; texte: string; revision: boolean };

/**
 * CE QUE LA LECTURE A RENDU — et le refus, explicite, de confondre « rien trouvé » avec « rien lu ».
 * La forme est une union : il n'existe pas d'état où l'on aurait à la fois un motif d'échec et un
 * corps. Un `try/catch` qui rendrait un tableau vide en cas d'erreur produirait un vert, et c'est
 * exactement le défaut que cette garde existe pour ne pas avoir.
 */
export type LectureDuCorps =
  | {
      lu: true;
      pr: number;
      corps: CorpsPublie[];
      revisionsLues: number;
      revisionsAnnoncees: number;
      /**
       * VRAI quand on a CESSÉ de lire avant la fin — borne de pagination atteinte, ou curseur
       * qui n'avance pas. 🔴 Ce champ manquait, et son absence a laissé survivre un mutant le
       * 2026-09-05 : `inacheve` était calculé par `paginerEditions`, retourné, asserté par
       * trois témoins — et JAMAIS consommé par le verdict. L'écart annoncé/lu portait donc
       * seul toute la propriété, et il suffisait de relire `totalCount` à chaque page pour le
       * faire disparaître.
       *
       * 🔑 LES DEUX NE SONT PAS REDONDANTS. L'écart annoncé/lu dépend d'un nombre que la
       * FORGE contrôle ; celui-ci est notre PROPRE observation, tirée de notre propre flot.
       * Faire reposer une propriété de sécurité sur la seule honnêteté du serveur distant,
       * quand on dispose de sa propre mesure, ne se défend pas.
       */
      lectureInachevee: boolean;
    }
  | { lu: false; motif: string };

export const FAMILLES_CORPS_PUBLIE = [
  'coordonnee_dans_le_corps_courant',
  'coordonnee_dans_une_revision',
  'lecture_impossible',
  'revisions_non_lues',
  // Les deux familles qui empêchent l'exemption de devenir une passoire. Sans elles, le registre
  // serait un blanc-seing : la première refuse une ligne illisible, la seconde refuse une ligne
  // qui n'absout plus rien de ce qu'elle prétendait absoudre.
  'exemption_malformee',
  'exemption_sans_objet',
];

/** 0 conforme · 1 défaut CONSTATÉ · 2 INDÉTERMINÉ — la garde n'a pas pu lire ce qu'elle juge. */
export type Verdict = { code: 0 | 1 | 2; fautes: Faute[] };

/**
 * LE JUGEMENT, PUR ET INJECTÉ (RM-11). Aucun appel réseau ici : la preuve doit tenir hors ligne,
 * sans quoi elle verdirait ou rougirait au gré de ce que la forge répond le jour où elle tourne.
 *
 * TROIS CODES DE SORTIE, comme `gov:depot-visibilite`, et pour la même raison. Le sens de
 * défaillance est FERMÉ, et il est choisi :
 *   — `gh` absent, non authentifié, hors ligne, réponse illisible → 2, jamais 0. Une garde qui
 *     rendrait vert parce qu'elle n'a pas pu lire ferait croire à une vérification qui n'a pas eu
 *     lieu — c'est le défaut de la gate Lighthouse d'axionia, verte pendant des mois sur le runner.
 *   — pourquoi 2 et non 1 : un rouge qu'on ne peut pas corriger se fait désarmer. « Je n'ai pas pu
 *     lire » se répare en donnant un jeton, « il y a une coordonnée » se répare en changeant la
 *     coordonnée. Deux remèdes différents méritent deux couleurs différentes.
 *   — une révision ANNONCÉE et non lue (pagination, `diff` nul) est traitée comme une lecture
 *     manquée, pas comme une révision propre : c'est la même règle appliquée au détail.
 */
export function jugerCorpsPublie(lecture: LectureDuCorps, exemptions: Exemption[] = []): Verdict {
  const fautes: Faute[] = [...controlerRegistreExemptions(exemptions)];
  /** Les exemptions RÉELLEMENT servies : ce qui reste est sans objet, donc rouge. */
  const servies = new Set<Exemption>();

  if (!lecture.lu) {
    fautes.push({
      famille: 'lecture_impossible',
      message:
        `Le corps publié n'a PAS pu être lu : ${lecture.motif}. Ce dépôt est PUBLIC ` +
        `(REQ-GOV-031) et le corps d'une PR y est un artefact publié au même titre qu'un fichier ` +
        `suivi. Une garde qui rendrait vert ici ferait croire à un contrôle qui n'a pas eu lieu : ` +
        `elle rend INDÉTERMINÉ (2). Donne-lui un \`gh\` authentifié (\`GH_TOKEN\`), ou relance-la ` +
        `depuis un poste qui atteint la forge.`,
    });
    // Une lecture manquée ne juge AUCUNE exemption : on ne sait pas ce qu'elles couvrent. Les
    // déclarer sans objet ici transformerait une panne de réseau en dette imaginaire.
    return { code: 2, fautes };
  }

  // CE QUE NOUS AVONS OBSERVÉ NOUS-MÊMES, et qui ne dépend d'aucun nombre servi par la forge.
  // Deux chemins mènent ici, et ils ont le même sens : on a arrêté de lire avant la fin.
  if (lecture.lectureInachevee) {
    fautes.push({
      famille: 'revisions_non_lues',
      message:
        `La lecture s'est ARRÊTÉE avant la fin : la borne de ${PAGES_MAX * EDITIONS_PAR_PAGE} ` +
        `révision(s) a été atteinte, ou la forge a servi un curseur qui n'avançait plus. Ce n'est ` +
        `PAS un écart de comptage — c'est notre propre flot qui le dit, et il ne dépend d'aucun ` +
        `nombre servi par la forge. Les révisions non atteintes ne sont pas réputées propres : ` +
        `INDÉTERMINÉ (2). Relève \`PAGES_MAX\` dans \`scripts/gates/gov-entite.ts\` si une PR dépasse ` +
        `réellement cette borne ; si le curseur n'avance pas, c'est la forge qu'il faut relancer.`,
    });
  }

  if (lecture.revisionsAnnoncees > lecture.revisionsLues) {
    fautes.push({
      famille: 'revisions_non_lues',
      message:
        `La forge annonce ${lecture.revisionsAnnoncees} révision(s) du corps et ${lecture.revisionsLues} ` +
        `ont été lues. Les révisions non lues ne sont PAS réputées propres : le défaut mesuré sur la ` +
        `PR #31 vivait dans des révisions, pas dans le corps courant. La requête EST paginée ` +
        `(${EDITIONS_PAR_PAGE} par page, ${PAGES_MAX} pages au plus) ; il reste donc DEUX causes, et ` +
        `elles n'ont pas le même remède. (a) Une révision servie sans \`diff\` ou sans \`editedAt\` : la ` +
        `forge n'en donne ni le texte ni l'horodatage, et sans horodatage aucune exemption ne peut ` +
        `s'y apparier — rien à corriger dans ce dépôt, relance la garde. (b) La borne de ` +
        `${PAGES_MAX * EDITIONS_PAR_PAGE} révision(s) atteinte, ce que le nombre lu rend visible : relève ` +
        `\`PAGES_MAX\` dans \`scripts/gates/gov-entite.ts\`. Elle existe pour qu'un curseur qui n'avance ` +
        `pas ne fasse pas tourner la CI sans fin, pas pour limiter ce qui est examiné.`,
    });
  }

  for (const c of lecture.corps) {
    for (const coordonnee of coordonneesDe(c.texte, false)) {
      const empreinte = empreinteDe(coordonnee);
      // L'exemption ne vaut QUE pour une révision : le corps courant s'édite, il n'y a rien à
      // excuser. Et elle exige les TROIS clés — PR, horodatage exact, empreinte. Exempter « la
      // PR #31 » absoudrait d'avance toute révision future, c'est-à-dire tout ce qui reste à
      // écrire.
      const couverte = c.revision
        ? exemptions.find(
            (e) => e.pr === lecture.pr && e.revision === c.horodatage && e.empreinte === empreinte
          )
        : undefined;
      if (couverte !== undefined) {
        servies.add(couverte);
        continue;
      }
      fautes.push({
        famille: c.revision ? 'coordonnee_dans_une_revision' : 'coordonnee_dans_le_corps_courant',
        message:
          `${c.origine} — coordonnée en clair « ${coordonnee} » (empreinte ${empreinte}). ` +
          (c.revision
            ? `C'est une RÉVISION : la corriger est impossible, GitHub sert l'historique d'édition ` +
              `d'un corps de PR à quiconque le demande. La coordonnée est à considérer comme ` +
              `DIVULGUÉE — c'est elle qu'il faut changer, pas le texte. Si et SEULEMENT SI elle est ` +
              `FABRIQUÉE et qu'il n'y a rien à révoquer, déclare-la dans \`${CHEMIN_EXEMPTIONS}\` ` +
              `avec pr=${lecture.pr}, revision="${c.horodatage}", empreinte ci-dessus et un motif. ` +
              `⚠️ N'inscris JAMAIS ici une coordonnée réelle : le remède est de la CHANGER.`
            : `Retire-la du corps : ces valeurs vivent dans \`${CHEMIN_REGISTRE}\` ou dans une ` +
              `variable d'environnement, jamais dans un artefact publié. ⚠️ L'éditer ne suffira ` +
              `PAS si elle a déjà été publiée une fois : l'historique d'édition la sert encore. ` +
              `Le corps COURANT n'est jamais exemptable : il s'édite.`),
      });
    }
  }

  // CE QUI EMPÊCHE L'EXEMPTION DE DEVENIR UN BLANC-SEING. Une exemption de CETTE PR qui n'a servi
  // à rien n'absout plus ce qu'elle prétendait absoudre : ou bien elle vise une révision qui
  // n'existe pas, ou bien le contenu de la révision ne porte plus cette coordonnée-là. Dans les
  // deux cas, la ligne est une autorisation ouverte sur un texte qu'on n'a pas examiné — c'est
  // exactement ce qu'on refuse. Elle ROUGIT, elle n'absout pas.
  // ⚠️ Le contrôle n'a de sens que si TOUTES les révisions ont été lues : sur une lecture
  // partielle, une exemption « sans objet » peut simplement viser une révision non paginée.
  if (lecture.revisionsAnnoncees <= lecture.revisionsLues) {
    for (const e of exemptions) {
      if (e.pr !== lecture.pr || servies.has(e)) continue;
      fautes.push({
        famille: 'exemption_sans_objet',
        message:
          `\`${CHEMIN_EXEMPTIONS}\` — l'exemption PR #${e.pr} / révision ${e.revision} / empreinte ` +
          `${e.empreinte.slice(0, 12)}… n'a RIEN absous : aucune révision lue ne porte cette ` +
          `coordonnée à cet horodatage. Ou la révision n'existe pas, ou son contenu a changé de ` +
          `sens. Une exemption qui ne correspond plus à ce qu'elle couvrait est une autorisation ` +
          `ouverte sur un texte que personne n'a examiné : retire-la, ou redéclare-la sur ce que ` +
          `la garde signale aujourd'hui.`,
      });
    }
  }

  // Un défaut CONSTATÉ prime sur un indéterminé : on a lu, et ce qu'on a lu est fautif.
  const constate = fautes.some(
    (f) => f.famille.startsWith('coordonnee_') || f.famille.startsWith('exemption_')
  );
  if (constate) return { code: 1, fautes };
  return { code: fautes.length > 0 ? 2 : 0, fautes };
}

/** Combien d'exemptions de cette PR ont RÉELLEMENT servi — le chiffre qui rend l'exception visible. */
export function exemptionsServies(lecture: LectureDuCorps, exemptions: Exemption[]): Exemption[] {
  if (!lecture.lu) return [];
  const servies: Exemption[] = [];
  for (const c of lecture.corps) {
    if (!c.revision) continue;
    for (const coordonnee of coordonneesDe(c.texte, false)) {
      const e = exemptions.find(
        (x) =>
          x.pr === lecture.pr && x.revision === c.horodatage && x.empreinte === empreinteDe(coordonnee)
      );
      if (e !== undefined && !servies.includes(e)) servies.push(e);
    }
  }
  return servies;
}

/**
 * ── LA PAGINATION DES RÉVISIONS — ET POURQUOI SON ABSENCE ÉTAIT UNE GATE INSATISFIABLE ────────
 *
 * 🔴 CE QUE LA LENTILLE `securite` A MESURÉ le 2026-09-05 : la requête demandait
 * `userContentEdits(first: 100)` alors que `totalCount` compte TOUTES les éditions. Au-delà de
 * cent, `revisionsAnnoncees > revisionsLues`, donc `revisions_non_lues`, donc le code 2, donc
 * l'échec de Gate A — **sans aucun remède** : aucune exemption ne couvre cette famille (leur
 * appariement exige une coordonnée DANS une révision), et l'historique d'édition ne se dé-publie
 * pas. Le réessai ×3 ne protège de rien non plus : la réponse est STABLE et incomplète, pas
 * intermittente.
 *
 * ET CENT EST À PORTÉE : le corps d'une PR est REGÉNÉRÉ à chaque tour de revue, si bien que le
 * mécanisme qui produit les révisions est le mécanisme même de la revue.
 *
 * 🔑 CE QUE LA PAGINATION CHANGE : elle ne transforme pas un rouge en vert, elle transforme un
 * verdict SANS remède en verdict AVEC remède. Une coordonnée en deuxième page rendait 2 (« je
 * n'ai pas tout lu », rien à faire) ; elle rend maintenant 1, nommée et datée, donc changeable
 * ou déclarable. C'est la différence entre une gate qu'on répare et une gate qu'on saute.
 */
export const EDITIONS_PAR_PAGE = 100;

/**
 * LA BORNE DURE, ET ELLE RESTE NÉCESSAIRE — on dit laquelle et pourquoi. Une boucle non bornée
 * contre une API distante ne rend jamais la main le jour où la forge sert un curseur qui n'avance
 * pas, ou renomme un champ de `pageInfo`. Une CI qui tourne sans fin est indiscernable d'une CI
 * en panne, sauf qu'elle consomme le créneau de fusion (RM-09) au lieu de rendre une couleur.
 *
 * Le nombre est haut À DESSEIN : deux ordres de grandeur au-dessus de ce qu'une PR atteint. Et
 * il est REMÉDIABLE — le message de `revisions_non_lues` le nomme, nomme son fichier, et dit
 * qu'on le relève. Une borne muette serait le défaut qu'on vient de fermer, réintroduit un cran
 * plus bas.
 */
export const PAGES_MAX = 20;

/** Un nœud d'édition tel que la forge le sert : rien n'y est réputé présent ni typé. */
export type NoeudEdition = { editedAt?: unknown; diff?: unknown };

/** UNE page de la connexion `userContentEdits`, ramenée à ce dont la boucle a besoin. */
export type PageDEditions = {
  totalCount: number;
  noeuds: NoeudEdition[];
  encore: boolean;
  curseur: string | null;
};

export type EditionsLues = {
  annoncees: number;
  noeuds: NoeudEdition[];
  pages: number;
  /** Vrai quand on a CESSÉ de lire avant la fin : borne atteinte, ou curseur qui n'avance pas. */
  inacheve: boolean;
};

/**
 * LA REQUÊTE, ET SES TAILLES SONT DÉRIVÉES (RM-01). Retaper `first: 100` ici ferait compter à la
 * boucle autre chose que ce que la requête demande, et les deux divergeraient sans bruit.
 * `$a` est nullable : la première page l'omet, GraphQL lit alors `null`.
 */
export const REQUETE_EDITIONS =
  'query($o:String!,$r:String!,$n:Int!,$a:String){repository(owner:$o,name:$r){pullRequest(number:$n){' +
  `userContentEdits(first:${EDITIONS_PAR_PAGE},after:$a){totalCount ` +
  'pageInfo{hasNextPage endCursor} nodes{editedAt diff}}}}}';

/**
 * LA BOUCLE, PURE ET INJECTÉE (RM-11), pour la même raison que `jugerCorpsPublie` : la lecture
 * réelle passe par le réseau, et une preuve qui dépend de ce que la forge répond le jour où elle
 * tourne ne prouve rien. Ce qui est injecté ici, c'est « donne-moi la page qui suit ce curseur ».
 */
export function paginerEditions(lirePage: (apres: string | null) => PageDEditions): EditionsLues {
  const noeuds: NoeudEdition[] = [];
  let annoncees = 0;
  let curseur: string | null = null;
  let pages = 0;
  let inacheve = false;
  for (;;) {
    const page = lirePage(curseur);
    pages += 1;
    // `totalCount` est celui de la CONNEXION, pas de la page : on le prend une fois. Le relire à
    // chaque tour ferait dépendre l'écart annoncé/lu de la dernière page servie.
    if (pages === 1) annoncees = page.totalCount;
    noeuds.push(...page.noeuds);
    if (!page.encore) break;
    // UN CURSEUR QUI N'AVANCE PAS relit la même page indéfiniment, et aucune borne exprimée en
    // NOMBRE DE RÉVISIONS ne l'attraperait — on en accumulerait sans fin. On s'arrête, et l'écart
    // annoncé/lu fait tomber le verdict en INDÉTERMINÉ plutôt qu'en vert.
    if (page.curseur === null || page.curseur === curseur) {
      inacheve = true;
      break;
    }
    if (pages >= PAGES_MAX) {
      inacheve = true;
      break;
    }
    curseur = page.curseur;
  }
  return { annoncees, noeuds, pages, inacheve };
}

/**
 * CE QUE LA LECTURE DEVIENT — le corps courant, puis une entrée par révision RÉELLEMENT lue.
 * Extraite de `lireUneFois` pour que le banc d'essai exerce la MÊME mise en forme que la lecture
 * réelle : deux assemblages divergeraient, et c'est celui du test qui resterait vert (RM-01).
 */
export function assemblerLecture(
  numero: string,
  corpsCourant: string,
  editions: { annoncees: number; noeuds: NoeudEdition[]; inacheve: boolean }
): LectureDuCorps {
  const corps: CorpsPublie[] = [
    { origine: `PR #${numero} — corps courant`, horodatage: null, texte: corpsCourant, revision: false },
  ];
  let lues = 0;
  for (const n of editions.noeuds) {
    // Un `diff` nul n'est pas une révision propre : c'est une révision qu'on n'a PAS lue. Elle
    // reste comptée dans `annoncees`, et l'écart fait tomber le verdict en INDÉTERMINÉ.
    // Un horodatage nul aussi : sans lui, aucune exemption ne peut s'apparier à cette révision,
    // donc on ne peut ni l'absoudre ni prétendre l'avoir examinée.
    if (typeof n.diff !== 'string' || typeof n.editedAt !== 'string') continue;
    lues += 1;
    corps.push({
      origine: `PR #${numero} — révision du ${n.editedAt}`,
      horodatage: n.editedAt,
      texte: n.diff,
      revision: true,
    });
  }
  return {
    lu: true,
    pr: Number(numero),
    corps,
    revisionsLues: lues,
    revisionsAnnoncees: editions.annoncees,
    lectureInachevee: editions.inacheve,
  };
}

/**
 * LA LECTURE RÉELLE — deux appels, et ils ne se remplacent pas l'un l'autre.
 *   — `gh pr view <n> --json body` : le corps COURANT, la commande que la revue a nommée ;
 *   — `gh api graphql … userContentEdits` : les RÉVISIONS, seul endroit où vivait le défaut mesuré.
 * Toute erreur remonte en `{ lu: false }`. Aucun `catch` ne rend ici de tableau vide.
 */
/**
 * COMBIEN DE FOIS ON RÉESSAIE AVANT DE DÉCLARER QU'ON N'A PAS PU LIRE, et pourquoi ce nombre
 * existe. Le verdict 2 fait ÉCHOUER la CI (voir l'en-tête du mode en ligne). Il faut donc que 2
 * signifie « je ne PEUX pas lire », et non « je n'ai pas pu lire à cet instant » : sans réessai,
 * un incident réseau d'une seconde rendrait rouge une PR qui n'a rien fait, et une garde qui
 * rougit à tort se fait retirer — c'est le mécanisme même qu'on cherche à éviter.
 * Le réessai transforme une intermittence en LATENCE, jamais en couleur.
 */
const ESSAIS_DE_LECTURE = 3;

/**
 * CE QUI EXECUTE `gh`, ET POURQUOI C'EST UN PARAMETRE — 🔴 le mutant qui interdisait la fusion
 * le 2026-09-05. Mutation : en cas d'echec, rendre `{ lu: true, corps: [] }`. Resultat : banc
 * d'essai ENTIEREMENT vert, `--prove` a 0, et le mode en ligne imprimant un ✅ sur une PR
 * ILLISIBLE. `jugerCorpsPublie` etait couvert par une trentaine de cas ; la fonction ou le sens
 * de defaillance est CHOISI ne l'etait par aucun, parce qu'elle passait par le reseau.
 *
 * 🔑 La couverture du PUR ne dit rien de l'IMPUR qui l'alimente. On injecte donc l'appel
 * exterieur, exactement comme `paginerEditions` injecte sa page : la preuve tient hors ligne.
 */
export type ExecuteurGh = (args: string[]) => string;

export const GH_REEL: ExecuteurGh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * AUCUN DEFAUT SUR CE QUE LE TEST FAIT VARIER (RM-11) : ni `essais` ni `gh` n'ont de valeur
 * par defaut. Un defaut sur `gh` reintroduirait tout le probleme — un cas qui l'omettrait
 * repartirait sur le reseau sans que rien ne le dise, et redeviendrait vert pour la mauvaise
 * raison. La ligne de commande, elle, passe `ESSAIS_DE_LECTURE` et `GH_REEL` explicitement.
 */
export function lireCorpsPublie(
  numero: string,
  essais: number,
  gh: ExecuteurGh
): LectureDuCorps {
  let derniere: LectureDuCorps = { lu: false, motif: 'aucune tentative' };
  for (let n = 1; n <= Math.max(1, essais); n += 1) {
    derniere = lireUneFois(numero, gh);
    if (derniere.lu) {
      console.log(`   lecture obtenue à la tentative ${n}/${Math.max(1, essais)}.`);
      return derniere;
    }
  }
  return {
    lu: false,
    motif: `${(derniere as { motif: string }).motif} (après ${Math.max(1, essais)} tentative(s))`,
  };
}

export function lireUneFois(numero: string, gh: ExecuteurGh): LectureDuCorps {
  let corpsCourant: string;
  try {
    const brut = gh(['pr', 'view', numero, '--json', 'body']);
    const j = JSON.parse(brut) as { body?: unknown };
    if (typeof j.body !== 'string') {
      return {
        lu: false,
        motif: `\`gh pr view ${numero} --json body\` n'a pas rendu de champ \`body\` textuel`,
      };
    }
    corpsCourant = j.body;
  } catch (e) {
    return {
      lu: false,
      motif: `\`gh pr view ${numero} --json body\` a échoué : ${(e as Error).message.trim()}`,
    };
  }

  let depot: string;
  try {
    const j = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])) as { nameWithOwner?: unknown };
    if (typeof j.nameWithOwner !== 'string') return { lu: false, motif: 'dépôt illisible' };
    depot = j.nameWithOwner;
  } catch (e) {
    return {
      lu: false,
      motif: `\`gh repo view --json nameWithOwner\` a échoué : ${(e as Error).message.trim()}`,
    };
  }
  const [proprietaire, nom] = depot.split('/');
  if (proprietaire === undefined || nom === undefined || nom === '') {
    return { lu: false, motif: `dépôt illisible : « ${depot} »` };
  }

  /**
   * UNE page, telle que `gh` la rend. Elle LÈVE en cas d'erreur : le `catch` de l'appelant la
   * transforme en `{ lu: false }`. Aucun repli sur un tableau vide ici — ce serait un vert
   * produit par une lecture qui n'a pas eu lieu, c'est-à-dire le défaut que cette garde existe
   * pour empêcher.
   */
  const lirePage = (apres: string | null): PageDEditions => {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${REQUETE_EDITIONS}`,
      '-F',
      `o=${proprietaire}`,
      '-F',
      `r=${nom}`,
      '-F',
      `n=${numero}`,
    ];
    // `-f` et non `-F` : un curseur est OPAQUE et doit partir en chaîne. `-F` type sa valeur, et
    // un curseur qui ressemblerait à un nombre partirait en `Int` — la forge refuserait la
    // requête, et l'échec ressemblerait à une panne d'authentification.
    if (apres !== null) args.push('-f', `a=${apres}`);
    const j = JSON.parse(gh(args)) as {
      data?: {
        repository?: {
          pullRequest?: {
            userContentEdits?: {
              totalCount?: unknown;
              pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
              nodes?: unknown;
            };
          };
        };
      };
    };
    const edits = j.data?.repository?.pullRequest?.userContentEdits;
    if (edits === undefined || typeof edits.totalCount !== 'number' || !Array.isArray(edits.nodes)) {
      throw new Error("la requête GraphQL n'a pas rendu `userContentEdits`");
    }
    // `pageInfo` ABSENT n'est PAS « il n'y a plus rien » : c'est un champ qu'on n'a pas lu. On
    // annonce donc une suite sans curseur, ce que `paginerEditions` compte comme inachevé — et
    // l'écart annoncé/lu rend INDÉTERMINÉ. Le sens de défaillance est le même partout ici.
    const info = edits.pageInfo;
    const encore = info === undefined ? true : info.hasNextPage === true;
    const curseur = typeof info?.endCursor === 'string' ? info.endCursor : null;
    return {
      totalCount: edits.totalCount,
      noeuds: edits.nodes as NoeudEdition[],
      encore,
      curseur: encore ? curseur : null,
    };
  };

  let editions: EditionsLues;
  try {
    editions = paginerEditions(lirePage);
  } catch (e) {
    return {
      lu: false,
      motif: `\`gh api graphql … userContentEdits\` a échoué : ${(e as Error).message.trim()}`,
    };
  }

  return assemblerLecture(numero, corpsCourant, editions);
}

/**
 * LA PREUVE, HORS LIGNE. Un témoin par famille, des contre-témoins verts, et un témoin POSITIF de
 * la sonde elle-même : la forme masquée que produit le gabarit reste VERTE, sans quoi la garde
 * rougirait sur le corps qu'elle est censée bénir et se ferait retirer dans la semaine.
 */
function prouverCorpsPublie(): number {
  const HORODATAGE = '2026-01-02T03:04:05Z';
  const PR_TEMOIN = 4242;
  const corps = (texte: string, revision = false): LectureDuCorps => ({
    lu: true,
    pr: PR_TEMOIN,
    corps: [{ origine: 'témoin', horodatage: revision ? HORODATAGE : null, texte, revision }],
    revisionsLues: revision ? 1 : 0,
    revisionsAnnoncees: revision ? 1 : 0,
    // La forge a rendu la main d'elle-même : ce n'est PAS une lecture interrompue. Les
    // témoins qui rougissent le font sur l'écart annoncé/lu, et lui seul (RM-11).
    lectureInachevee: false,
  });
  /**
   * Une exemption BIEN formée pour le témoin donné — construite, jamais recopiée.
   *
   * 🔴 ELLE A PORTÉ DES DÉFAUTS — `sur = HORODATAGE, pr = PR_TEMOIN` — et c'est le fait
   * d'instrument que la lentille `mutation` a rendu le 2026-09-05 : les mutations qui
   * retirent la clé d'HORODATAGE ou la clé d'EMPREINTE de l'appariement **mouraient dans
   * `pnpm test` et SURVIVAIENT ici**. Cause : aucun témoin de ce banc ne différait
   * SEULEMENT par l'horodatage, ni SEULEMENT par l'empreinte. Le témoin « révision NON
   * exemptée » avait l'air de couvrir le cas ; il discriminait en réalité sur l'empreinte.
   *
   * 🔑 **Un témoin qui bouge pour deux raisons ne discrimine rien** (RM-11). Les trois clés
   * sont donc écrites à chaque appel, et trois témoins ci-dessous n'en changent QU'UNE.
   */
  const exemptionPour = (valeur: string, sur: string, pr: number): Exemption => ({
    pr,
    revision: sur,
    empreinte: empreinteDe(valeur),
    declaree: '2026-01-02',
    par: 'témoin de `--corps-publie --prove`',
    motif:
      "témoin de la preuve hors ligne : cette valeur est construite à chaque exécution, elle n'a " +
      'jamais été publiée nulle part, et il n’y a donc rien à révoquer.',
    definitive: true,
  });

  // La forme MASQUÉE que rend le gabarit : CONSTRUITE, jamais recopiée, et sa clé mod-97 est
  // fausse par construction. C'est le contre-témoin qui empêche la garde d'être intenable.
  const MASQUE = 'FR76' + 'X'.repeat(23);

  const TEMOINS: { famille: string; lecture: LectureDuCorps; exemptions?: Exemption[]; attendu: 1 | 2 }[] = [
    { famille: 'coordonnee_dans_le_corps_courant', lecture: corps(`IBAN : ${IBAN_TEMOIN}`), attendu: 1 },
    {
      // Le geste par défaut de qui colle un RIB : les espaces d'un traitement de texte. Le même
      // caractère que le banc d'essai de `normaliserEspaces` — UNE seule normalisation pour les
      // fichiers suivis et pour le corps publié, sans quoi les deux divergeraient (RM-01).
      famille: 'coordonnee_dans_le_corps_courant',
      lecture: corps(`IBAN : ${ibanAvecSeparateur(IBAN_TEMOIN, ' ')}`),
      attendu: 1,
    },
    {
      // LE DÉFAUT MESURÉ SUR LA PR #31 : corps courant PROPRE, révision qui porte la valeur.
      famille: 'coordonnee_dans_une_revision',
      lecture: {
        lu: true,
        pr: PR_TEMOIN,
        corps: [
          { origine: 'témoin — corps courant', horodatage: null, texte: `IBAN : ${MASQUE}`, revision: false },
          {
            origine: 'témoin — révision',
            horodatage: HORODATAGE,
            texte: `-IBAN : ${IBAN_TEMOIN}\n+IBAN : ${MASQUE}`,
            revision: true,
          },
        ],
        revisionsLues: 1,
        revisionsAnnoncees: 1,
        lectureInachevee: false,
      },
      attendu: 1,
    },
    {
      // UNE EXEMPTION QUI N'ABSOUT PLUS RIEN. C'est le contre-témoin qui compte le plus : sans
      // lui, une ligne du registre resterait valable sur une révision dont le contenu a changé
      // de sens, c'est-à-dire une autorisation ouverte sur un texte que personne n'a examiné.
      famille: 'exemption_sans_objet',
      lecture: corps('aucune coordonnée dans cette révision', true),
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN)],
      attendu: 1,
    },
    {
      // UNE LIGNE ILLISIBLE. Une exemption sans motif a l'air d'une décision prise, donc plus
      // personne ne la relit — et elle devient permanente sans que quiconque l'ait voulu.
      famille: 'exemption_malformee',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [{ ...exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN), motif: '' }],
      attendu: 1,
    },
    {
      // UNE EMPREINTE TRONQUÉE. Seize caractères hexadécimaux se collisionnent en 2^32 essais :
      // la ligne absoudrait alors une AUTRE coordonnée que celle qu'on a examinée.
      famille: 'exemption_malformee',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [{ ...exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN), empreinte: empreinteDe(IBAN_TEMOIN).slice(0, 16) }],
      attendu: 1,
    },
    {
      // LE TÉMOIN QUI EMPÊCHE L'EXEMPTION D'ÊTRE UNE PASSOIRE : une révision NON exemptée qui
      // porte une coordonnée rougit MÊME sur une PR qui a par ailleurs des révisions exemptées.
      famille: 'coordonnee_dans_une_revision',
      lecture: {
        lu: true,
        pr: PR_TEMOIN,
        corps: [
          { origine: 'témoin — corps courant', horodatage: null, texte: `IBAN : ${MASQUE}`, revision: false },
          { origine: 'témoin — révision exemptée', horodatage: HORODATAGE, texte: `IBAN : ${IBAN_TEMOIN}`, revision: true },
          {
            origine: 'témoin — révision NON exemptée',
            horodatage: '2026-01-02T09:09:09Z',
            texte: `IBAN : ${IBANS_TEMOINS_ETRANGERS.DE}`,
            revision: true,
          },
        ],
        revisionsLues: 2,
        revisionsAnnoncees: 2,
        lectureInachevee: false,
      },
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN)],
      attendu: 1,
    },
    {
      // LE CORPS COURANT N'EST JAMAIS EXEMPTABLE : il s'édite, donc il n'y a rien à excuser.
      // Une exemption qui le couvrirait serait une permission de publier.
      famille: 'coordonnee_dans_le_corps_courant',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`),
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN)],
      attendu: 1,
    },
    {
      // LES TROIS CLÉS, UNE PAR UNE — et chacune change SEULE. C'est ce qui manquait : une
      // exemption qui ne diffère QUE par l'HORODATAGE n'absout pas. Sans ce cas, retirer la clé
      // d'horodatage de l'appariement laissait ce banc entièrement vert.
      famille: 'coordonnee_dans_une_revision',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [exemptionPour(IBAN_TEMOIN, '2026-01-02T09:09:09Z', PR_TEMOIN)],
      attendu: 1,
    },
    {
      // … QUE par l'EMPREINTE : même PR, même horodatage, une AUTRE coordonnée déclarée.
      famille: 'coordonnee_dans_une_revision',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [exemptionPour(IBANS_TEMOINS_ETRANGERS.DE!, HORODATAGE, PR_TEMOIN)],
      attendu: 1,
    },
    {
      // … QUE par la PR. Exempter une révision d'une AUTRE PR n'absout rien ici : sinon une
      // ligne écrite pour une PR fermée couvrirait tout ce qui reste à écrire.
      famille: 'coordonnee_dans_une_revision',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN + 1)],
      attendu: 1,
    },
    {
      // UNE EMPREINTE TRONQUÉE N'ABSOUT PAS. Ce qui était gardé, c'est la forme STOCKÉE ; la
      // forme COMPARÉE ne l'était pas. Une comparaison par préfixe couvrirait la coordonnée tout
      // en déclarant la ligne malformée — et le verdict resterait 1, donc indiscernable. La
      // famille exigée ici est `coordonnee_dans_une_revision`, pas `exemption_malformee` : c'est
      // la moitié qui manquait.
      famille: 'coordonnee_dans_une_revision',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [
        {
          ...exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN),
          empreinte: empreinteDe(IBAN_TEMOIN).slice(0, 16),
        },
      ],
      attendu: 1,
    },
    { famille: 'lecture_impossible', lecture: { lu: false, motif: 'gh introuvable (témoin)' }, attendu: 2 },
    {
      // UNE LECTURE MANQUÉE NE JUGE AUCUNE EXEMPTION. Sans cette règle, une panne de réseau
      // transformerait toutes les exemptions en dettes imaginaires, et le verdict passerait de
      // « je n'ai pas pu lire » à « ton registre est faux » — deux diagnostics opposés.
      famille: 'lecture_impossible',
      lecture: { lu: false, motif: 'réseau injoignable (témoin)' },
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN)],
      attendu: 2,
    },
    {
      famille: 'revisions_non_lues',
      lecture: {
        lu: true,
        pr: PR_TEMOIN,
        corps: [{ origine: 'témoin', horodatage: null, texte: 'aucune coordonnée ici', revision: false }],
        revisionsLues: 1,
        revisionsAnnoncees: 4,
        // FAUX à dessein : ce témoin doit rougir sur l'ÉCART, pas sur l'interruption.
        // Deux causes actives d'un coup, et il ne discriminerait plus ni l'une ni l'autre.
        lectureInachevee: false,
      },
      attendu: 2,
    },
  ];

  const CONTRE_TEMOINS: { quoi: string; lecture: LectureDuCorps; exemptions?: Exemption[] }[] = [
    { quoi: 'un corps vide, sans révision', lecture: corps('') },
    {
      // LE CONTRE-TÉMOIN DE L'EXEMPTION ELLE-MÊME. Sans lui, la garde serait insatisfiable sur
      // toute PR dont l'historique est déjà pollué — et une gate insatisfiable, on apprend à la
      // sauter. C'est ce qui rend la troisième voie tenable : l'exception est explicite, donc
      // elle peut être verte SANS que la garde cesse de bloquer le reste.
      quoi: 'une révision DÉCLARÉE, dont l’exemption s’apparie sur les TROIS clés',
      lecture: corps(`IBAN : ${IBAN_TEMOIN}`, true),
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN)],
    },
    {
      // Une exemption d'une AUTRE PR n'absout rien ici, et ne compte pas non plus comme sans
      // objet : elle n'a simplement pas été examinée. Sans cette borne, le registre entier
      // rougirait à chaque PR, ce qui reviendrait à interdire d'en tenir un.
      quoi: 'une exemption d’une AUTRE PR : elle ne traverse pas, et elle ne rougit pas ici',
      lecture: corps('rien à signaler'),
      exemptions: [exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN + 1)],
    },
    {
      quoi: 'la forme MASQUÉE que rend le gabarit — la garde ne rougit pas sur ce qu’elle bénit',
      lecture: corps(`IBAN débiteur : ${MASQUE}`),
    },
    {
      quoi: 'un corps qui NOMME le SIREN de l’entité — public, et citer n’est pas se servir',
      lecture: corps(
        `Entité : ${REGISTRE_TEMOIN.entite.denomination}, SIREN ${REGISTRE_TEMOIN.entite.siren}.`
      ),
    },
    {
      quoi: 'une révision qui ne porte que de la prose typographiée — insécables et tirets compris',
      lecture: corps(
        'Le mandat est signé ; le délai est de 30 jours — dossier AXP‑2026‑001.',
        true
      ),
    },
  ];

  const caracteres = caracteresNeutralises();
  if (caracteres.length === 0) {
    console.error(
      '❌ `SEPARATEURS_NEUTRALISES` ne reconnaît AUCUN caractère : les témoins qui en dépendent ' +
        "exécuteraient zéro cas, et zéro cas exécuté se lit exactement comme zéro cas en échec."
    );
    return 1;
  }

  for (const t of TEMOINS) {
    const v = jugerCorpsPublie(t.lecture, t.exemptions ?? []);
    if (!v.fautes.some((f) => f.famille === t.famille) || v.code !== t.attendu) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a pas rendu ce qu'il devait : code ${v.code} ` +
          `(attendu ${t.attendu}), familles [${v.fautes.map((f) => f.famille).join(', ') || '—'}].`
      );
      return 1;
    }
  }

  for (const c of CONTRE_TEMOINS) {
    const v = jugerCorpsPublie(c.lecture, c.exemptions ?? []);
    if (v.code !== 0) {
      console.error(
        `❌ Faux positif : « ${c.quoi} » a rendu ${v.code} sur « ${v.fautes[0]?.famille} ».\n` +
          `   ${v.fautes[0]?.message ?? ''}`
      );
      return 1;
    }
  }

  // ── CE QUE LE VERT AFFICHE : `exemptionsServies` apparie sur les TROIS clés ────────────────
  // 🔴 MUTANT DU 2026-09-05 : la réduire à `exemptions.find((x) => x.pr === lecture.pr)`. Aucun
  // témoin ne rougissait. C'est le registre en passoire par la porte d'à côté — la liste que ce
  // vert imprime est celle qu'un humain relit pour savoir sur quoi la dette repose.
  {
    const lue = corps(`IBAN : ${IBAN_TEMOIN}`, true);
    const bonne = exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN);
    // TROIS leurres, un par clé, chacun ne différant que par LA SIENNE, et placés AVANT la bonne.
    // 🔴 LE TROISIÈME MANQUAIT : les deux d'origine étaient tous deux « de la MÊME PR », si bien
    // que retirer la clé `pr` de l'appariement ne faisait rougir aucun témoin. Deux clés sur
    // trois étaient mesurées, la troisième n'était que dans le titre.
    const leurres = [
      exemptionPour(IBAN_TEMOIN, HORODATAGE, PR_TEMOIN + 1),
      exemptionPour(IBANS_TEMOINS_ETRANGERS.DE!, HORODATAGE, PR_TEMOIN),
      exemptionPour(IBAN_TEMOIN, '2026-01-02T09:09:09Z', PR_TEMOIN),
    ];
    const servies = exemptionsServies(lue, [...leurres, bonne]);
    // Et le TÉMOIN POSITIF : sur la bonne ligne seule, elle la rend. Sans lui, une fonction qui
    // rendrait toujours `[]` passerait le cas ci-dessus.
    const seule = exemptionsServies(lue, [bonne]);
    if (servies.length !== 1 || servies[0] !== bonne || seule.length !== 1) {
      console.error(
        `❌ \`exemptionsServies\` n'apparie pas sur les TROIS clés : ${servies.length} ligne(s) ` +
          `servie(s) parmi trois candidates de la MÊME PR, dont deux qui ne couvrent pas cette ` +
          `coordonnée-là. Le vert afficherait une dette qui n'est pas celle sur laquelle il repose.`
      );
      return 1;
    }
  }

  const sansTemoin = FAMILLES_CORPS_PUBLIE.filter((f) => !TEMOINS.some((t) => t.famille === f));
  if (sansTemoin.length > 0) {
    console.error(
      `❌ ${sansTemoin.length} famille(s) sans témoin qui rougit : ${sansTemoin.join(', ')}.\n` +
        `   Une règle jamais vue rougir ne garde rien.`
    );
    return 1;
  }

  // ── LA PAGINATION, ÉPROUVÉE HORS LIGNE ──────────────────────────────────────────────────────
  // Elle vit ICI et pas seulement dans le banc d'essai : c'est `--corps-publie --prove` qui est
  // l'étape de Gate A, et un témoin qui ne tient que `pnpm test` ne garde pas la CI.
  {
    const horodatage = (n: number): string =>
      `2026-01-02T03:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z`;
    const RANG_FAUTIF = EDITIONS_PAR_PAGE + 20;
    const TOTAL = EDITIONS_PAR_PAGE + 50;
    const textes = Array.from({ length: TOTAL }, (_, i) =>
      i === RANG_FAUTIF ? `IBAN : ${IBAN_TEMOIN}` : `révision ${i}`
    );
    // 🔴 CE QUE CETTE FORGE NE SAVAIT PAS FAIRE, et qui a laissé survivre un mutant sérieux le
    // 2026-09-05 : elle servait un `totalCount` CONSTANT. Relire ce compte à CHAQUE page au lieu
    // de le prendre une fois donnait alors exactement le même résultat, ici comme dans le banc
    // d'essai — alors que la mutation supprime la seule chose qui transformait une lecture
    // partielle en code 2. Ce que la forge ANNONCE est donc un paramètre, et ce qu'elle SERT en
    // est distinct : c'est précisément leur écart qui se juge.
    const forge =
      (annonce: (debut: number, total: number) => number, servies: number) =>
      (apres: string | null): PageDEditions => {
        const debut = apres === null ? 0 : Number(apres);
        const tranche = textes.slice(debut, Math.min(debut + EDITIONS_PAR_PAGE, servies));
        const suivant = debut + tranche.length;
        const reste = suivant < servies;
        return {
          totalCount: annonce(debut, textes.length),
          noeuds: tranche.map((texte, i) => ({ editedAt: horodatage(debut + i), diff: texte })),
          encore: reste,
          curseur: reste ? String(suivant) : null,
        };
      };
    const ANNONCE_STABLE = (_debut: number, total: number): number => total;
    const ANNONCE_DECROISSANTE = (debut: number, total: number): number => total - debut;
    const lirePage = forge(ANNONCE_STABLE, textes.length);

    // UNE SEULE PAGE — ce que la requête demandait avant ce correctif : un 2 SANS remède, où la
    // coordonnée n'est même pas nommée.
    const page1 = lirePage(null);
    const tronquee = jugerCorpsPublie(
      assemblerLecture(String(PR_TEMOIN), 'propre', {
        annoncees: page1.totalCount,
        noeuds: page1.noeuds,
        // La forge n'a pas été interrompue : c'est l'appelant qui n'a demandé qu'une page.
        // L'écart annoncé/lu reste donc la seule cause, et c'est celle qu'on mesure ici.
        inacheve: false,
      })
    );
    if (
      tronquee.code !== 2 ||
      !tronquee.fautes.every((f) => f.famille === 'revisions_non_lues') ||
      tronquee.fautes.some((f) => f.message.includes(IBAN_TEMOIN))
    ) {
      console.error(
        `❌ Le témoin de la lecture TRONQUÉE n'a pas rendu ce qu'il devait : code ${tronquee.code} ` +
          `(attendu 2), familles [${tronquee.fautes.map((f) => f.famille).join(', ') || '—'}].`
      );
      return 1;
    }

    // TOUTES LES PAGES — la coordonnée est LUE, donc NOMMÉE, donc remédiable.
    const complet = paginerEditions(lirePage);
    const juge = jugerCorpsPublie(assemblerLecture(String(PR_TEMOIN), 'propre', complet));
    if (
      complet.noeuds.length !== TOTAL ||
      complet.inacheve ||
      juge.code !== 1 ||
      !juge.fautes.some(
        (f) => f.famille === 'coordonnee_dans_une_revision' && f.message.includes(horodatage(RANG_FAUTIF))
      )
    ) {
      console.error(
        `❌ La pagination n'a pas rendu ce qu'elle devait : ${complet.noeuds.length}/${TOTAL} ` +
          `révision(s) lue(s), inachevé=${complet.inacheve}, code ${juge.code} (attendu 1).`
      );
      return 1;
    }

    // LE COMPTE ANNONCÉ EST CELUI DE LA PREMIÈRE PAGE — il se prend UNE fois. Le relire à chaque
    // tour fait dépendre l'écart annoncé/lu de la DERNIÈRE réponse, c'est-à-dire de la partie
    // qu'on vient justement de lire : l'écart s'annule alors tout seul. C'est le contrôle qui se
    // supprime lui-même, et c'est le mutant qui a survécu au tour précédent.
    const variable = paginerEditions(forge(ANNONCE_DECROISSANTE, textes.length));
    if (
      variable.annoncees !== textes.length ||
      ANNONCE_DECROISSANTE(EDITIONS_PAR_PAGE, textes.length) === textes.length
    ) {
      console.error(
        `❌ Le compte annoncé n'est pas celui de la PREMIÈRE page : ${variable.annoncees} au lieu ` +
          `de ${textes.length}. Une forge dont le compte varie est la seule qui distingue « lu une ` +
          `fois » de « relu à chaque page » — sans elle, ce banc ne mesure pas cette dimension.`
      );
      return 1;
    }

    // UNE FORGE QUI SERT MOINS QU'ELLE N'ANNONCE, sans jamais être interrompue : `inacheve` est
    // FAUX, et l'écart annoncé/lu est la SEULE chose qui reste. La coordonnée vit dans la part
    // jamais servie — un vert ici voudrait dire « rien à signaler » sur un texte que personne
    // n'a lu.
    const avare = paginerEditions(forge(ANNONCE_DECROISSANTE, EDITIONS_PAR_PAGE));
    const jugeAvare = jugerCorpsPublie(assemblerLecture(String(PR_TEMOIN), 'propre', avare));
    if (avare.inacheve || jugeAvare.code !== 2) {
      console.error(
        `❌ Une forge qui sert ${avare.noeuds.length} révision(s) sur ${avare.annoncees} annoncée(s) ` +
          `a rendu ${jugeAvare.code} (attendu 2), inachevé=${avare.inacheve} (attendu false).`
      );
      return 1;
    }

    // `inacheve` EST CONSOMMÉ PAR LE VERDICT, et pas seulement retourné. Une valeur calculée,
    // assertée et jamais lue est un contrôle qui existe pour le lecteur et pas pour la machine.
    // Les deux moitiés : sans écart NI interruption c'est vert ; le MÊME compte, interrompu, rend
    // 2 — aucun écart annoncé/lu ne peut donc l'expliquer.
    const noeudsPropres: NoeudEdition[] = [{ editedAt: horodatage(1), diff: 'propre' }];
    const complete = jugerCorpsPublie(
      assemblerLecture(String(PR_TEMOIN), 'propre', {
        annoncees: 1,
        noeuds: noeudsPropres,
        inacheve: false,
      })
    );
    const interrompue = jugerCorpsPublie(
      assemblerLecture(String(PR_TEMOIN), 'propre', {
        annoncees: 1,
        noeuds: noeudsPropres,
        inacheve: true,
      })
    );
    if (complete.code !== 0 || interrompue.code !== 2) {
      console.error(
        `❌ \`lectureInachevee\` n'est pas consommé par le verdict : lecture complète ${complete.code} ` +
          `(attendu 0), MÊME lecture interrompue ${interrompue.code} (attendu 2). Une lecture qui ` +
          `s'est arrêtée avant la fin n'est pas une lecture propre, quel que soit le compte servi.`
      );
      return 1;
    }

    // LA BORNE DURE — elle s'arrête, et son message NOMME le remède. Une borne muette serait le
    // défaut qu'on vient de fermer, réintroduit un cran plus bas.
    let rang = 0;
    const sansFin = (): PageDEditions => {
      rang += EDITIONS_PAR_PAGE;
      return {
        totalCount: Number.MAX_SAFE_INTEGER,
        noeuds: Array.from({ length: EDITIONS_PAR_PAGE }, (_, i) => ({
          editedAt: horodatage(rang + i),
          diff: 'propre',
        })),
        encore: true,
        curseur: String(rang),
      };
    };
    const borne = paginerEditions(sansFin);
    const jugeBorne = jugerCorpsPublie(assemblerLecture(String(PR_TEMOIN), 'propre', borne));
    if (
      borne.pages !== PAGES_MAX ||
      !borne.inacheve ||
      jugeBorne.code !== 2 ||
      !jugeBorne.fautes.some((f) => f.message.includes('PAGES_MAX'))
    ) {
      console.error(
        `❌ La borne de pagination n'a pas rendu ce qu'elle devait : ${borne.pages} page(s) ` +
          `(attendu ${PAGES_MAX}), inachevé=${borne.inacheve}, code ${jugeBorne.code} (attendu 2).`
      );
      return 1;
    }

    // UN CURSEUR QUI N'AVANCE PAS — aucune borne exprimée en nombre de révisions ne l'attraperait,
    // et une boucle qui ne rend jamais la main ne rend aucune couleur : elle prend le créneau.
    const fige = paginerEditions(() => ({
      totalCount: 400,
      noeuds: [{ editedAt: horodatage(1), diff: 'propre' }],
      encore: true,
      curseur: 'CURSEUR-QUI-NE-BOUGE-PAS',
    }));
    if (fige.pages !== 2 || !fige.inacheve) {
      console.error(
        `❌ Un curseur qui n'avance pas n'a pas été reconnu : ${fige.pages} page(s), ` +
          `inachevé=${fige.inacheve}.`
      );
      return 1;
    }
  }

  // ── LE SENS DE DÉFAILLANCE DE LA LECTURE, ÉPROUVÉ HORS LIGNE ────────────────────────────────
  // 🔴 Le mutant du 2026-09-05 : `lireCorpsPublie` rendant `{ lu: true, corps: [] }` en cas
  // d'échec. Banc d'essai entièrement vert, `--prove` à 0, et un ✅ imprimé sur une PR ILLISIBLE.
  // `jugerCorpsPublie` est pur et couvert ; la fonction qui CHOISIT le sens de défaillance ne
  // l'était pas, parce qu'elle passait par le réseau. Elle prend son `gh` en paramètre, et ces
  // témoins-ci vivent dans `--prove` : un mutant peut mourir dans `pnpm test` et survivre ici.
  {
    const DEPOT = 'exemple/depot-de-papier';
    const HORO_LECTURE = '2026-01-02T03:04:05Z';
    type GhDePapier = {
      corps: unknown;
      depot: unknown;
      editions: NoeudEdition[];
      total: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null } | undefined;
      tombeSur: 'pr' | 'repo' | 'graphql' | null;
    };
    const ghDePapier =
      (o: GhDePapier): ExecuteurGh =>
      (args: string[]): string => {
        const quoi = args[0] === 'pr' ? 'pr' : args[0] === 'repo' ? 'repo' : 'graphql';
        if (o.tombeSur === quoi) throw new Error(`gh ${quoi} : panne de papier`);
        if (quoi === 'pr') return JSON.stringify({ body: o.corps });
        if (quoi === 'repo') return JSON.stringify({ nameWithOwner: o.depot });
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                userContentEdits: { totalCount: o.total, pageInfo: o.pageInfo, nodes: o.editions },
              },
            },
          },
        });
      };
    // AUCUN DÉFAUT sur ce que ces témoins font varier (RM-11) : chaque champ est écrit.
    const SAIN: GhDePapier = {
      corps: 'un corps de PR parfaitement propre',
      depot: DEPOT,
      editions: [{ editedAt: HORO_LECTURE, diff: 'une révision propre' }],
      total: 1,
      pageInfo: { hasNextPage: false, endCursor: null },
      tombeSur: null,
    };

    // LE TÉMOIN POSITIF D'ABORD : sans lui, tout ce qui suit passerait sur une lecture qui ne lit
    // jamais rien. Dix « je n'ai pas pu » ne prouvent pas qu'on sache lire une fois.
    const saine = lireUneFois(String(PR_TEMOIN), ghDePapier(SAIN));
    if (!saine.lu || saine.revisionsLues !== 1 || jugerCorpsPublie(saine).code !== 0) {
      console.error(
        `❌ La lecture d'un \`gh\` SAIN n'a pas rendu ce qu'elle devait : lu=${saine.lu}. ` +
          `Sans ce témoin positif, les témoins de panne ci-dessous ne mesurent rien.`
      );
      return 1;
    }

    const PANNES: { quoi: string; o: GhDePapier }[] = [
      { quoi: '`gh pr view` tombe', o: { ...SAIN, tombeSur: 'pr' } },
      { quoi: '`gh repo view` tombe', o: { ...SAIN, tombeSur: 'repo' } },
      { quoi: 'la requête GraphQL tombe', o: { ...SAIN, tombeSur: 'graphql' } },
      { quoi: "le corps n'est pas textuel", o: { ...SAIN, corps: undefined } },
      { quoi: 'le dépôt est illisible', o: { ...SAIN, depot: undefined } },
      { quoi: '`userContentEdits` manque', o: { ...SAIN, total: undefined as unknown as number } },
    ];
    for (const p of PANNES) {
      const lue = lireUneFois(String(PR_TEMOIN), ghDePapier(p.o));
      const v = jugerCorpsPublie(lue);
      if (lue.lu || v.code !== 2) {
        console.error(
          `❌ « ${p.quoi} » a rendu lu=${lue.lu}, code ${v.code} (attendu lu=false, code 2). ` +
            `Une lecture qui échoue et se déclare LUE rend la garde verte sur une PR illisible.`
        );
        return 1;
      }
    }

    // LE RÉESSAI : une INTERMITTENCE devient de la latence, jamais une couleur — et une panne
    // STABLE reste `lu: false`. Sans le premier, la garde serait capricieuse et on la retirerait ;
    // sans le second, le réessai effacerait la distinction qu'il existe pour préserver.
    let tentatives = 0;
    const capricieux: ExecuteurGh = (args) => {
      if (args[0] === 'pr') {
        tentatives += 1;
        if (tentatives < ESSAIS_DE_LECTURE) throw new Error('réseau injoignable (témoin)');
      }
      return ghDePapier(SAIN)(args);
    };
    const reprise = lireCorpsPublie(String(PR_TEMOIN), ESSAIS_DE_LECTURE, capricieux);
    const stable = lireCorpsPublie(
      String(PR_TEMOIN),
      ESSAIS_DE_LECTURE,
      ghDePapier({ ...SAIN, tombeSur: 'pr' })
    );
    if (!reprise.lu || tentatives !== ESSAIS_DE_LECTURE || stable.lu) {
      console.error(
        `❌ Le réessai n'a pas rendu ce qu'il devait : reprise lu=${reprise.lu} en ${tentatives} ` +
          `tentative(s), panne stable lu=${stable.lu} (attendu false).`
      );
      return 1;
    }
  }

  console.log(
    `✅ Les ${FAMILLES_CORPS_PUBLIE.length} familles du corps publié rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${FAMILLES_CORPS_PUBLIE.map((f) => '• ' + f).join('\n   ')}`);
  console.log(
    `   La LECTURE elle-même est éprouvée hors ligne : un \`gh\` de papier qui TOMBE rend ` +
      `toujours \`lu: false\`, donc 2 — jamais un corps vide qui passerait pour propre. Le ` +
      `réessai reprend une intermittence ; une panne STABLE reste \`lu: false\`.`
  );
  console.log(
    `   Les révisions sont PAGINÉES : ${EDITIONS_PAR_PAGE} par page, ${PAGES_MAX} page(s) au plus, ` +
      `soit ${PAGES_MAX * EDITIONS_PAR_PAGE} révision(s). Une coordonnée servie APRÈS la première ` +
      `page est lue, nommée et datée — donc remédiable — au lieu de rendre un INDÉTERMINÉ sans remède.`
  );
  console.log(
    `   ${CONTRE_TEMOINS.length} contre-témoins restent verts, dont la forme masquée du gabarit.\n` +
      `   ${caracteres.length} forme(s) d'espace ou de tiret sont neutralisées avant toute recherche.\n` +
      `   Une révision DÉCLARÉE au registre reste verte ; une révision NON déclarée rougit sur la ` +
      `MÊME PR ; une exemption qui n'absout plus rien rougit aussi.`
  );
  return 0;
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

/**
 * DES IBAN NON FRANÇAIS — ET C'EST LA CAUSE COMMUNE DE QUATRE MUTANTS SURVIVANTS.
 *
 * 🔴 CE QUE LA LENTILLE `mutation` A MESURÉ SUR CE FICHIER le 2026-09-05 : réduire `PAYS_ISO` à
 * `(?:FR)` faisait passer un IBAN allemand et un IBAN espagnol de 1 faute à 0, la gate rendait 0,
 * `--prove` rendait 0, et le banc d'essai restait entièrement vert. Même mesure en neutralisant
 * `FORME_TVA_FR` et `FORME_SIREN`. Trois constantes de détection, aucun témoin.
 *
 * 🔑 LE DÉFAUT N'ÉTAIT PAS DANS LES TROIS CONSTANTES, IL ÉTAIT DANS LA FIXTURE : **tous les
 * témoins d'IBAN de ce dépôt étaient français.** `cleIbanValide` résiste aux deux sens de
 * mutation, et sa solidité MASQUAIT le fait que tout ce qui l'entoure n'était exercé par rien.
 * Une fixture mono-cas ne prouve jamais la généralité de ce qu'elle traverse.
 *
 * Un apporteur peut être établi hors de France : REQ-CPL-004 exige une résidence fiscale dans le
 * périmètre, pas un compte français. L'IBAN qu'on collera sera donc allemand, espagnol, belge —
 * et c'est exactement la classe de valeurs que la garde ne voyait pas.
 *
 * CE QUE CES CONSTANTES NE SONT PAS. Elles ne DÉRIVENT PAS `PAYS_ISO` et ne prétendent pas la
 * couvrir : la liste est tapée à la main, 47 entrées dont 7 qui n'émettent aucun IBAN et 51 pays
 * émetteurs omis, et c'est l'objet de la tâche GOV-036. Ce qui est livré ici, c'est le TÉMOIN QUI
 * ROUGIT QUAND LA LISTE RÉTRÉCIT — ce qui manquait pour que GOV-036 soit gardée plutôt que promise.
 * Ce sont des IBAN de documentation bancaire, à clé mod-97 valide, jamais un compte réel.
 */
export const IBANS_TEMOINS_ETRANGERS: Record<string, string> = {
  DE: 'DE89370400440532013000',
  ES: 'ES9121000418450200051332',
  BE: 'BE68539007547034',
  IT: 'IT60X0542811101000000123456',
  NL: 'NL91ABNA0417164300',
  PT: 'PT50000201231234567890154',
  CH: 'CH9300762011623852957',
};

/**
 * UNE TVA ET UN SIREN DE TIERS — les deux familles de coordonnées qui n'avaient AUCUN témoin.
 *
 * Ni l'un ni l'autre n'est une valeur du monde réel : ils sont SYNTHÉTIQUES, de forme valide, et
 * choisis pour n'être ni monotones ni répétitifs — sans quoi `estExemplePlausible` les écarterait
 * et le témoin ne prouverait rien du contrôle qu'il prétend exercer.
 *
 * ⚠️ ILS NE SONT REFUSÉS QUE DANS UN FICHIER DE CODE, et c'est la frontière que la garde tient
 * depuis le premier jour : un SIREN, un SIRET et une TVA sont PUBLICS — n'importe qui les lit au
 * répertoire des entreprises — donc une spécification a le droit de les citer. Dans du CODE, ils
 * doivent être LUS et non portés. Les contre-témoins verts sont donc aussi importants que les
 * témoins rouges : sans eux, on rendrait le dossier illisible sans rien protéger.
 */
export const TVA_TEMOIN_TIERS = 'FR47738294615';
export const SIREN_TEMOIN_TIERS = '738294615';

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

  // ── UN TÉMOIN PAR FORME QUE `normaliserEspaces` NEUTRALISE ─────────────────────────────────
  //
  // 🔴 CE QUI ÉTAIT MESURÉ, ET POURQUOI CE N'EST PAS COSMÉTIQUE. Muté en `return t;`, le
  // `normaliserEspaces` du 2026-09-05 laissait `gov:entite` ET `gov:entite:prove` à 0, et le banc
  // d'essai ne portait aucune occurrence de `00A0`. La normalisation marchait ; RIEN ne la tenait.
  //
  // Or l'IBAN à espaces INSÉCABLES n'est pas un cas d'école : c'est la forme d'un copier-coller de
  // RIB — un relevé bancaire, un traitement de texte, un courriel — donc le geste PAR DÉFAUT de la
  // personne qui posera la vraie valeur d'AXION en phase 2. La famille a été signalée au premier
  // tour de la lentille `securite`, fermée au second, et gardée par rien entre les deux.
  //
  // 🔑 La liste des caractères n'est PAS retapée ici : elle est ÉNUMÉRÉE depuis la classe qui sert
  // à `normaliserEspaces` (RM-01). Un caractère ajouté à la classe gagne son témoin sans qu'une
  // ligne bouge ; un caractère retiré perd le sien, et la famille reste couverte par les autres —
  // c'est pourquoi le banc d'essai, lui, assertie la PRÉSENCE de l'espace insécable.
  // ── UN TÉMOIN PAR FAMILLE DE COORDONNÉE QUE LA GARDE PRÉTEND VOIR ─────────────────────────
  //
  // Sans eux, `PAYS_ISO`, `FORME_TVA_FR` et `FORME_SIREN` se neutralisent une par une sans que
  // `gov:entite:prove` change de couleur — mesuré par la lentille `mutation` le 2026-09-05.
  // Ils vivent ICI et non dans le seul banc d'essai, parce que c'est `--prove` qui est l'étape
  // de Gate A : un témoin qui ne tient que `pnpm test` ne garde pas la CI.
  for (const [pays, iban] of Object.entries(IBANS_TEMOINS_ETRANGERS)) {
    TEMOINS.push({
      famille: 'coordonnee_en_clair',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: `docs/rib-${pays.toLowerCase()}.md`,
          contenu: `Le compte du porteur est ${iban}.\n`,
        });
      }),
    });
  }
  TEMOINS.push({
    // La TVA d'un TIERS, dans du CODE : elle doit être lue, jamais portée.
    famille: 'coordonnee_en_clair',
    univers: muter((u) => {
      u.fichiers.push({
        chemin: 'src/facturation/fournisseur.ts',
        contenu: `export const TVA_FOURNISSEUR = '${TVA_TEMOIN_TIERS}';\n`,
      });
    }),
  });
  TEMOINS.push({
    // Le SIREN d'un TIERS, dans du CODE. Le mot-clé est exigé : neuf chiffres nus sont trop
    // souvent autre chose, et une forme nue produirait le bruit qui fait désarmer une garde.
    famille: 'coordonnee_en_clair',
    univers: muter((u) => {
      u.fichiers.push({
        chemin: 'src/apporteur/structure.ts',
        contenu: `export const structure = { siren: '${SIREN_TEMOIN_TIERS}' };\n`,
      });
    }),
  });

  const FORMES_NEUTRALISEES = caracteresNeutralises();
  if (FORMES_NEUTRALISEES.length === 0) {
    console.error(
      '❌ `SEPARATEURS_NEUTRALISES` ne reconnaît AUCUN caractère : la boucle ci-dessous ' +
        "exécuterait zéro témoin, et zéro témoin exécuté se lit exactement comme zéro échec."
    );
    return 1;
  }
  for (const forme of FORMES_NEUTRALISEES) {
    TEMOINS.push({
      famille: 'coordonnee_en_clair',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'docs/rib-colle.md',
          contenu: `Virement depuis ${ibanAvecSeparateur(IBAN_TEMOIN, forme)}.\n`,
        });
      }),
    });
  }

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
      quoi: 'une spécification qui CITE la TVA et le SIREN d’un tiers — publics, et citer n’est pas se servir',
      univers: muter((u) => {
        u.fichiers.push({
          chemin: 'docs/spec/tiers.md',
          contenu: `Le fournisseur porte la TVA ${TVA_TEMOIN_TIERS} et le SIREN ${SIREN_TEMOIN_TIERS}.\n`,
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
  console.log(
    `   ${FORMES_NEUTRALISEES.length} forme(s) d'espace ou de tiret sont ramenées à une espace ASCII ` +
      `avant toute recherche, et chacune a son témoin : un IBAN collé depuis un RIB rougit.`
  );
  console.log(
    `   ${Object.keys(IBANS_TEMOINS_ETRANGERS).length} IBAN NON français rougissent aussi ` +
      `(${Object.keys(IBANS_TEMOINS_ETRANGERS).join(', ')}) : une fixture mono-pays ne prouve rien ` +
      `de \`PAYS_ISO\`. Une TVA et un SIREN de TIERS rougissent dans du CODE, et restent verts en prose.`
  );
  return 0;
}

/**
 * LE NUMÉRO DE PR QUAND LA CI L'A EN MAIN. Sans cette lecture, l'étape de CI devrait recopier
 * ${{ github.event.pull_request.number }} dans une commande — une valeur de plus à maintenir à
 * deux endroits (RM-01), et un oubli qui rendrait la garde muette au lieu de rouge.
 * Rend `undefined` — jamais une valeur inventée — si l'événement n'en porte pas : c'est alors le
 * refus explicite du mode en ligne, pas un vert.
 */
export function numeroDePrDeLEvenement(): string | undefined {
  const chemin = process.env.GITHUB_EVENT_PATH;
  if (chemin === undefined || chemin === '' || !existsSync(chemin)) return undefined;
  try {
    const ev = JSON.parse(readFileSync(chemin, 'utf8')) as { pull_request?: { number?: unknown } };
    const n = ev.pull_request?.number;
    return typeof n === 'number' && Number.isInteger(n) ? String(n) : undefined;
  } catch {
    return undefined;
  }
}

// ── ligne de commande ─────────────────────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par son test. Sans ce test d'entrée, l'import déclencherait le
// contrôle et son `process.exit`, et la suite mourrait au chargement (leçon de `gov-depot.ts`).
const APPELE_DIRECTEMENT = /gov-entite\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const iCorps = process.argv.indexOf('--corps-publie');
  if (iCorps >= 0 && !process.argv.includes('--prove')) {
    // ── LE MODE EN LIGNE, ET IL EST BLOQUANT ────────────────────────────────────────────────
    //
    // 🔴 UNE PREMIÈRE VERSION DE CE BLOC PORTAIT LE COMMENTAIRE INVERSE : « il n'entre PAS dans
    // Gate A, il se lance à la main avant fusion ». C'était un adoucissement déguisé, et il se
    // reconnaît à une phrase : une garde qui ne tourne que quand quelqu'un y pense ne tourne pas.
    // Le dépôt voisin en donne la version longue — toutes ses gates de budget portent
    // `continue-on-error: true`, aucune PR qui alourdit le bundle n'a jamais rougi, et les revues
    // ont écrit pendant des mois « le risque est couvert par la gate ». Une gate qui ne bloque
    // pas produit une fausse sécurité, qui est pire que pas de gate du tout.
    //
    // CE QUE FAIT GATE A D'UN 2, ET C'EST TRANCHÉ : **elle ÉCHOUE.** Trois raisons, dans l'ordre.
    //   1. Le vert produit par une lecture qui n'a pas eu lieu est EXACTEMENT le défaut que cette
    //      garde existe pour empêcher. L'admettre au niveau de la CI le réintroduit d'un cran
    //      plus haut, là où personne ne le regarde.
    //   2. « Laisser passer un 2 en le signalant » n'a pas de mécanisme. Un avertissement dans un
    //      journal de job n'est lu par personne, et un 2 permanent devient invisible en une
    //      semaine : c'est `continue-on-error` réinventé par la porte de derrière. La seule chose
    //      qui garantit qu'un 2 se remarque, c'est qu'il BLOQUE.
    //   3. ⚠️ CETTE RAISON A ÉTÉ RÉFUTÉE. Elle disait : « il n'existe pas d'état durable légitime
    //      où la CI d'un dépôt PUBLIC ne peut pas lire le corps de ses propres PR ». C'est FAUX, la
    //      lentille `securite` l'a montré au 7e tour : la requête n'était pas paginée, et au-delà
    //      de cent révisions le 2 était SANS REMÈDE. C'est fermé — mais ce fichier se contredit
    //      encore lui-même ailleurs : une révision servie sans `diff` ni `editedAt` ne peut
    //      s'apparier à aucune exemption, et le message dit alors « rien à corriger dans ce dépôt ».
    //      CE QUI RESTE JUSTE, ET QUI SUFFIT : un 2 durable est TOUJOURS quelque chose
    //      qu'un humain doit voir — permission retirée, `gh` absent, champ renommé, ou révision
    //      que la forge ne sert pas. Aucun de ces états ne doit passer pour un vert.
    //      La conclusion tient ; son ancienne démonstration ne tenait pas. ⚠️ ET J'AI ANNONCÉ CETTE
    //      CORRECTION FAITE AU TOUR 8 ALORS QU'ELLE NE L'ÉTAIT PAS : le bloc vivait dans un script
    //      préparé que j'ai REMPLACÉ par une version plus complète, laquelle l'a omis. Le script
    //      remplaçant a rendu « 7 mutations ✅ » — un succès qui ne mentionnait pas ce qu'il ne
    //      faisait plus. La lentille a comparé le diff au lieu de me croire.
    //
    // CE QUI EMPÊCHE UN 2 D'INTERMITTENCE : `lireCorpsPublie` RÉESSAIE. Un incident réseau d'une
    // seconde devient de la latence, jamais une couleur. C'est ce qui rend « 2 = échec » tenable
    // sans rendre la garde capricieuse — et une garde capricieuse, on la retire.
    //
    // ET CE QUI EMPÊCHE LA GARDE D'ÊTRE INSATISFIABLE : le registre des exemptions. L'historique
    // d'édition est immuable ; sans lui, une PR dont l'historique est déjà pollué ne pourrait
    // JAMAIS redevenir verte, et une gate insatisfiable, on apprend à la sauter.
    const numero = process.argv[iCorps + 1] ?? numeroDePrDeLEvenement();
    if (numero === undefined || !/^\d+$/.test(numero)) {
      console.error(
        '❌ gov:entite --corps-publie attend un NUMÉRO de PR, en argument ou dans l’événement ' +
          'GitHub (`GITHUB_EVENT_PATH`). Rien n’a été lu : verdict INDÉTERMINÉ (2). Une garde ' +
          'qui ne sait pas ce qu’elle juge ne rend jamais vert.'
      );
      process.exit(2);
    }

    let exemptions: Exemption[] = [];
    try {
      exemptions = exemptionsDuDepot();
    } catch (e) {
      // Un registre illisible n'absout rien ET n'est pas un vert : on ne sait plus ce qui est
      // déclaré. Le sens de défaillance est le même partout dans ce fichier.
      console.error(
        `❌ gov:entite --corps-publie — \`${CHEMIN_EXEMPTIONS}\` est illisible : ` +
          `${(e as Error).message.trim()}. INDÉTERMINÉ (2).`
      );
      process.exit(2);
    }

    const lecture = lireCorpsPublie(numero, ESSAIS_DE_LECTURE, GH_REEL);
    const verdict = jugerCorpsPublie(lecture, exemptions);

    // TÉMOIN POSITIF, IMPRIMÉ DANS LES TROIS CAS. Un « aucune coordonnée » sans volumétrie est
    // indiscernable d'une sonde qui ne mesure rien : dix zéros veulent dire « absent » ou « je ne
    // regarde pas », et rien ne les sépare. On dit donc TOUJOURS ce qui a été lu.
    if (lecture.lu) {
      const courant = lecture.corps.find((c) => !c.revision);
      console.log(
        `   lu : corps courant ${courant?.texte.length ?? 0} octet(s), ` +
          `${lecture.revisionsLues}/${lecture.revisionsAnnoncees} révision(s) d'édition, ` +
          `${lecture.corps.reduce((n, c) => n + c.texte.length, 0)} octet(s) au total.`
      );
    }

    if (verdict.code === 0) {
      const servies = exemptionsServies(lecture, exemptions);
      console.log(
        `✅ gov:entite --corps-publie ${numero} — le corps PUBLIÉ et son historique d'édition ne ` +
          `portent aucune coordonnée bancaire NON DÉCLARÉE, jugés par le MÊME \`coordonneesDe\` ` +
          `que les fichiers suivis.`
      );
      // L'EXCEPTION EST ÉCRITE DANS LE VERT, et ce n'est pas de la décoration. Une exemption
      // invisible est une exemption qu'on ne relit jamais : elle redevient, en quelques semaines,
      // exactement l'absence de garde qu'elle remplace. Ici, un vert qui repose sur une exception
      // le DIT, avec sa date, son propriétaire et son motif.
      if (servies.length > 0) {
        console.log(
          `   ⚠️ ${servies.length} révision(s) EXEMPTÉE(S) — ce vert repose sur une dette DÉCLARÉE, ` +
            `pas sur une absence de défaut. L'historique d'édition est immuable : ces lignes ne se ` +
            `referment jamais (\`${CHEMIN_EXEMPTIONS}\`).`
        );
        for (const e of servies) {
          console.log(
            `      • PR #${e.pr}, révision ${e.revision}, empreinte ${e.empreinte.slice(0, 12)}… — ` +
              `déclarée le ${e.declaree} par ${e.par}${e.definitive ? ' (DÉFINITIVE)' : ''}\n` +
              `        ${e.motif}`
          );
        }
      }
      process.exit(0);
    }
    const gravite = verdict.code === 1 ? 'défaut CONSTATÉ' : 'INDÉTERMINÉ';
    console.error(`❌ gov:entite --corps-publie ${numero} — ${gravite} (${verdict.fautes.length}) :\n`);
    verdict.fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    if (verdict.fautes.length > 25) console.error(`   … et ${verdict.fautes.length - 25} autre(s).`);
    process.exit(verdict.code);
  }

  if (iCorps >= 0) {
    process.exit(prouverCorpsPublie());
  }

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
