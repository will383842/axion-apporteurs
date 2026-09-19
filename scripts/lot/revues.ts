/**
 * revues.ts — LE lecteur des revues d'une PR (REQ-GOV-010, REQ-GOV-011).
 *
 * POURQUOI CE FICHIER EXISTE. Il y avait DEUX lectures des revues, et elles ne lisaient pas la même
 * chose (RM-01, RM-04) : `scripts/gates/gov-pr.ts` filtrait l'état, exigeait une ligne `Verdict:`
 * et classait le dernier verdict par couple `poste·lentille` ; `scripts/lot/corps-de-pr.ts`, qui
 * COCHE la case de DoD « Relecteur ≠ auteur » du corps publié, ne lisait de chaque revue que
 * `body` et `commit_id`.
 *
 * QUATRE FAIBLESSES MESURÉES LE 2026-09-05 SUR `41bc814`, toutes dans le sens PERMISSIF —
 * c'est-à-dire qu'elles cochent une case qui devrait rester vide. Le dépôt est PUBLIC (W13) :
 * n'importe quel compte peut poser une revue de type commentaire.
 *
 *   1. AUCUNE AUTHENTIFICATION. `user.login`, `author_association` et `state` sont servis par la
 *      MÊME réponse et étaient ignorés — `state` était même déclaré dans le type et jamais
 *      consulté. Rejoué à l'identique sur les revues réelles : quatre avis forgés par un compte
 *      tiers cochaient la case ; un vrai « Verdict: refuse » de `securite` sur la tête, suivi d'un
 *      avis forgé, voyait son VETO EFFACÉ ; les quatre mêmes avis en état `DISMISSED` — donc
 *      retirés — cochaient aussi.
 *   2. `^A\d{2}` ACCEPTAIT `A99` : le numéro de poste n'était confronté à rien.
 *   3. LE DISCRIMINANT `schema` ÉTAIT PLUS FAIBLE QUE CELUI DE LA GATE QU'IL SUPPLÉE — un label
 *      posé à la main, là où la garde lit les FICHIERS de la PR. Une PR touchant `prisma/**` sans
 *      le label publiait « les 4 lentilles ont accepté » alors que la revue bloquante `schema`
 *      n'avait été demandée par personne.
 *   4. LA CLÉ DU « DERNIER VERDICT » DIVERGEAIT : par `lentille` seule d'un côté, par
 *      `poste·lentille` de l'autre. Un refus d'A02 sur `schema` suivi d'un accord d'un AUTRE poste
 *      sur la même lentille se cochait.
 *
 * LE REMÈDE N'EST PAS D'ALIGNER LA SECONDE LECTURE SUR LA PREMIÈRE : deux copies divergent
 * toujours, et celle qui est lue n'est jamais celle qui a été corrigée. C'est un lecteur UNIQUE,
 * importé par la garde ET par le composeur du corps. `scripts/lot/` est déjà importé par
 * `scripts/gates/` (`avancement.ts`, `registre-decisions.ts`) : c'est là qu'il vit.
 *
 * CE QUE CE LECTEUR TIENT POUR VRAI, ET POURQUOI :
 *
 *   a. UNE REVUE NE COMPTE QUE SI SON AUTEUR A LE DROIT DE JUGER. Le droit se lit sur
 *      `author_association`, servi par l'interface elle-même. Un compte sans lien avec le dépôt
 *      peut écrire ; il ne peut pas décider.
 *   b. UN ÉTAT RETIRÉ N'EST PAS UN AVIS. `DISMISSED` et `PENDING` ne sont pas des verdicts rendus.
 *   c. LE CODE DE POSTE EST CONFRONTÉ AU REGISTRE DES POSTES (`docs/agents.json`), jamais à une
 *      forme. Un code qui n'existe pas ne tient aucune lentille.
 *   d. LE DERNIER VERDICT PRIME, PAR COUPLE `poste·lentille` — et pas par lentille seule. Un poste
 *      qui relit et accepte efface SON refus ; il n'efface pas celui d'un autre. Sans la première
 *      moitié la garde redeviendrait insatisfiable (le piège de la PR 27) ; sans la seconde, un
 *      accord de complaisance effacerait un veto.
 *   e. LE SIGNAL `schema` EST LE PLUS STRICT DES TROIS DISPONIBLES : les fichiers de la PR, le
 *      champ `schema` des tâches qu'elle porte, le label. Le label seul est le plus faible — il se
 *      pose et s'oublie à la main.
 *   e-bis. UNE CITATION NE PORTE PAS LA DÉCISION. Une décision est une ligne qui ne dit QUE la
 *      décision, au ras de la marge ; et deux décisions qui se contredisent n'en font aucune.
 *      Voir `MOTIF_LIGNE_VERDICT` : c'est la sixième faiblesse permissive, mesurée sur `650ea10`.
 *   e-ter. LE LECTEUR EST UNIQUE, SON ENTRÉE AUSSI. `tachesDeLaPr()` est la seule dérivation de
 *      l'ensemble des tâches d'une PR ; les deux appelants la consomment. Septième faiblesse.
 *   f. « RELECTEUR ≠ AUTEUR » EST MESURÉE AU NIVEAU OÙ ELLE EST DÉFINIE : le POSTE
 *      (`docs/CHARTE-AGENTS.md` §6 — « le code du champ `Auteur:` n'apparaît jamais dans
 *      `Relecteur:` »). Au niveau des COMPTES GitHub, ce dépôt n'en a qu'un (W13) : la propriété
 *      n'y est pas mesurable, et le lecteur le DIT au lieu de le supposer. On ne coche jamais ce
 *      qu'on ne mesure pas.
 *
 * SOURCE DE LA FORME LUE. `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`, enregistrée le
 * 2026-09-05 dans `tests/fixtures/github/revues-pr-31.json` (RM-03).
 * Confronte-a: docs/tiers/github.md#2-source-officielle — non confrontée : la rubrique 2 de la
 * fiche est vide à ce jour, et la fiche prescrit elle-même cette mention. Ce que signifient
 * vraiment les valeurs d'`author_association` — un LIEN avec le dépôt, pas un DROIT d'écriture —
 * est écrit sur `ASSOCIATIONS_HABILITEES` ci-dessous, avec le signal plus fort qui existe et son
 * coût. L'arbitrage de le câbler ou non appartient à `A01` (§8 de la fiche du tiers).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const CHEMIN_AGENTS = 'docs/agents.json';
export const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';

/** L'état d'une revue rendue, nommé une fois — les fixtures le citent au lieu de le retaper. */
export const ETAT_APPROUVE = 'APPROVED';
export const ETAT_COMMENTE = 'COMMENTED';

/**
 * CE QUI COMPTE COMME UNE REVUE RENDUE. `APPROVED` serait le bon état — c'est celui que
 * l'interface protège. Mais ce dépôt n'a QU'UN compte (W13), et l'interface refuse une
 * approbation venant de l'auteur de la PR : « Can not approve your own pull request ». Exiger
 * `APPROVED` rendait la garde INSATISFIABLE, et une gate que personne ne peut satisfaire est une
 * étape qu'on apprend à sauter. On accepte donc les deux, et on exige EN ÉCHANGE ce qu'un état ne
 * dit pas : une ligne `Verdict:`.
 *
 * `DISMISSED` n'y est pas, et c'est le témoin (1c) : un avis retiré cochait la case.
 */
export const ETATS_RENDUS: ReadonlySet<string> = new Set([ETAT_APPROUVE, ETAT_COMMENTE]);

/**
 * QUI A LE DROIT DE JUGER — ET CE QUE CE FILTRE NE PROUVE PAS.
 *
 * ⚠️ LE COMMENTAIRE QUI TENAIT ICI ÉTAIT INEXACT, et son inexactitude allait dans le sens
 * permissif. Il affirmait que ces trois valeurs sont « les trois valeurs d'une personne ayant un
 * droit d'ÉCRITURE sur le dépôt ». Elles ne le sont pas :
 *
 *   — `COLLABORATOR` est servi dès qu'un compte a un accès DIRECT au dépôt, permission `read`
 *     comprise. Un lecteur invité le porte ;
 *   — `MEMBER` est servi dès l'APPARTENANCE à l'organisation propriétaire, quelle que soit la
 *     permission de ce membre sur ce dépôt-ci — y compris aucune ;
 *   — `OWNER` seul implique réellement le pouvoir d'écrire.
 *
 * `author_association` mesure donc un LIEN, pas un DROIT. Sans effet mesurable aujourd'hui : ce
 * dépôt n'a qu'un collaborateur, propriétaire et admin (W13). Mais un lecteur invité — le geste
 * le plus banal qu'on puisse faire sur un dépôt — obtiendrait par ce filtre le pouvoir d'effacer
 * un veto de `securite`. C'est la marche à ne pas oublier le jour où on invite quelqu'un.
 *
 * LE SIGNAL PLUS FORT EXISTE, ET IL N'EST PAS CÂBLÉ ICI : la permission EFFECTIVE, par
 * `GET /repos/{owner}/{repo}/collaborators/{login}/permission` → `admin | write | read | none`.
 * Il coûte un appel réseau PAR COMPTE distinct, et ce lecteur doit rester DÉTERMINISTE : il est
 * appelé par une garde bloquante et par le composeur du corps de PR, tous deux exécutés hors
 * ligne dans les tests. Le câbler ferait dépendre un verdict de gouvernance de la joignabilité de
 * l'interface, c'est-à-dire ferait passer une garde au vert quand le réseau tombe — ou la ferait
 * rougir pour une raison qui n'est pas la faute qu'elle cherche. L'arbitrage appartient à A01,
 * pas à ce module ; ce commentaire est la dette, écrite.
 *
 * Tout le reste — `NONE`, `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `MANNEQUIN` — écrit sans
 * décider, et c'est ce que ce filtre attrape réellement : un compte SANS AUCUN LIEN avec le dépôt.
 */
export const ASSOCIATIONS_HABILITEES: ReadonlySet<string> = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
]);

/** Les lentilles, nommées une fois (docs/CHARTE-AGENTS.md §6). */
export const LENTILLE_SIMPLICITE = 'simplicite';
export const LENTILLE_SCHEMA = 'schema';
export const LENTILLE_MUTATION = 'mutation';
const DEUX_PREMIERES = ['exactitude', 'securite'];

/**
 * LA LIGNE QUI TRANCHE — ET UNE CITATION N'EN EST PAS UNE.
 *
 * 🔴 LE DÉFAUT, MESURÉ LE 2026-09-05 SUR `650ea10`. Le motif était `/^Verdict\s*:\s*(accepte|
 * refuse)\b/im`, et il était lu par `MOTIF_VERDICT.exec(r.corps)` : la PREMIÈRE occurrence, dans
 * TOUT le corps, en multiligne. Un avis d'un compte habilité qui relate le tour précédent en
 * clair, puis conclut par un refus, était retenu comme `accepte`. Sens PERMISSIF : un veto effacé
 * par une pratique éditoriale banale — les 23 revues réelles de la PR 31 citent constamment les
 * verdicts précédents, et c'est ce qu'on demande aux relecteurs de faire.
 *
 * Ce qui les sauvait, c'est que leurs citations sont en milieu de ligne ou en blockquote, donc
 * hors de portée du `^`. La protection reposait donc sur un caractère d'ÉDITION que rien ne
 * documentait comme portant une décision de sécurité. Elle est écrite ici, et elle a deux étages.
 *
 * ── ÉTAGE 1 : UNE DÉCISION EST UNE LIGNE QUI NE DIT QUE LA DÉCISION ──────────────────────────
 * Au ras de la marge, rien devant, rien derrière. C'est la forme que prennent les 23 revues
 * réelles, sans exception (mesuré : ligne 2 ou 4, seule sur sa ligne). Une citation en
 * blockquote (`> Verdict: …`), indentée, ou noyée dans sa prose (`Verdict: accepte, disait le
 * tour 6 — moi je refuse`) n'est PAS une décision. Le `\b` de l'ancien motif laissait passer la
 * troisième forme ; `[ \t]*$` la refuse.
 *
 * ── ÉTAGE 2 : DEUX DÉCISIONS QUI SE CONTREDISENT N'EN FONT AUCUNE ────────────────────────────
 * Parce que l'étage 1 ne suffit pas : un relecteur qui COLLE la revue précédente verbatim pose sa
 * citation au ras de la marge, elle aussi. On ne choisit donc ni la première (le défaut d'hier)
 * ni la dernière (qu'une citation en pied de message porterait tout autant) : quand les lignes de
 * décision ne disent pas la même chose, l'avis NE COMPTE POUR RIEN, et la lecture le dit
 * bruyamment. Un relecteur ambigu REPOSTE ; il n'est pas deviné.
 *
 * Répéter le MÊME verdict n'est pas se contredire : un avis qui le pose en tête et en pied compte,
 * sans quoi la garde deviendrait capricieuse — et une gate capricieuse s'apprend à se sauter.
 *
 * ── CE QU'ON NE FAIT PAS, ET POURQUOI ────────────────────────────────────────────────────────
 * On n'analyse PAS le Markdown : une citation dans un bloc de code clôturé est au ras de la marge
 * et compte donc comme une ligne de décision — donc contredit, donc invalide l'avis. C'est
 * délibéré. Un analyseur de Markdown dans un chemin de décision de sécurité est une surface plus
 * grande que le coût de reposter un avis, et le sens de l'erreur est ici CONSERVATEUR : un avis
 * qui ne compte pas ne fournit aucun accord, donc la lentille manque, donc la case reste vide.
 */
export const MOTIF_LIGNE_VERDICT = /^Verdict[ \t]*:[ \t]*(accepte|refuse)[ \t]*$/;

/** Ce qu'une lecture de verdict peut rendre : une décision, ou la raison de n'en rendre aucune. */
export type LectureVerdict =
  | { verdict: 'accepte' | 'refuse'; lignes: number }
  | { motif: 'sans_verdict' | 'verdict_ambigu'; valeurs: ('accepte' | 'refuse')[] };

/**
 * LE VERDICT D'UN AVIS, ou la raison pour laquelle il n'en rend aucun. Voir `MOTIF_LIGNE_VERDICT`
 * ci-dessus pour la règle et pour le défaut dont elle sort.
 */
export function verdictDeLaRevue(corps: string): LectureVerdict {
  const valeurs: ('accepte' | 'refuse')[] = [];
  for (const brute of corps.split('\n')) {
    // Les fins de ligne de Windows ne changent pas une décision : `\r` n'est pas un caractère
    // d'écriture, et le laisser rendrait la ligne « non seule sur sa ligne » pour rien.
    const m = MOTIF_LIGNE_VERDICT.exec(brute.replace(/\r$/, ''));
    if (m) valeurs.push(m[1] as 'accepte' | 'refuse');
  }
  if (valeurs.length === 0) return { motif: 'sans_verdict', valeurs: [] };
  const distinctes = [...new Set(valeurs)].sort();
  if (distinctes.length > 1) return { motif: 'verdict_ambigu', valeurs: distinctes };
  return { verdict: distinctes[0]!, lignes: valeurs.length };
}

/** L'en-tête d'une revue : « A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). */
const MOTIF_ENTETE = /^\s*(A\d{2})\s*[·\-–]\s*([a-zA-Zéè]+)/;

/** La forme servie par `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`. */
export type RevueBrute = {
  id?: number;
  user?: { login?: string | null } | null;
  author_association?: string | null;
  state?: string | null;
  commit_id?: string | null;
  submitted_at?: string | null;
  body?: string | null;
};

export type Revue = {
  compte: string;
  association: string;
  etat: string;
  corps: string;
  commit: string;
};

export type MotifEcart =
  | 'etat_ecarte'
  | 'auteur_non_habilite'
  | 'sans_verdict'
  | 'verdict_ambigu'
  | 'sans_lentille'
  | 'poste_inconnu';

export type Verdict = {
  code: string;
  lentille: string;
  verdict: 'accepte' | 'refuse';
  commit: string;
  compte: string;
};

export type Lecture = {
  /** Les revues qui ont le droit de compter, et qui tranchent. */
  retenues: Revue[];
  ecartees: { revue: Revue; motif: MotifEcart }[];
  /** Le DERNIER verdict de chaque couple `poste·lentille`. */
  verdicts: Verdict[];
  /** Les lentilles EXIGÉES par le risque de la PR (`lentillesExigees`). */
  exigees: string[];
  /** Les lentilles exigées sans aucun accord retenu. */
  manquantes: string[];
  refusees: Verdict[];
  /** Les accords rendus sur une autre tête que celle qui sera fusionnée (pas 5 du protocole). */
  perimees: Verdict[];
  /** Les accords portés par le poste qui signe `Auteur:`. */
  auteurSeRelit: Verdict[];
  /** Vrai si au moins une revue retenue vient d'un compte ≠ de celui de l'auteur de la PR. */
  comptesDistinctsDeLAuteur: boolean;
  coche: boolean;
  raisons: string[];
  detail: string;
};

export type Entree = {
  revues: RevueBrute[];
  /**
   * LE LECTEUR REÇOIT LE SIGNAL, PAS LA LISTE — et c'est une défense, pas un détail de signature.
   *
   * La lentille `mutation` a fait survivre sur `41bc814` un mutant type-propre : la liste des
   * lentilles exigées TRONQUÉE à `['exactitude']` dans le composeur. `tsc` sortait 0, la suite
   * était verte à 387/387, et le corps publiait « les 1 lentilles (exactitude) ont accepté »
   * PENDANT QUE `securite` REFUSAIT. Une phrase qui a l'air dérivée et qui est fausse est pire
   * qu'un compteur tapé à la main : personne ne la met en doute.
   *
   * Un appelant ne peut donc pas transmettre un SOUS-ENSEMBLE : il transmet le RISQUE de la PR —
   * rendu par `risqueDeLaPr()`, la seule dérivation — et c'est `lentillesExigees()`, une seule
   * fonction testée sur son contenu ET sur son cardinal, qui décide de la liste. Le signal était
   * un booléen `schema` jusqu'à GOV-077 ; il porte désormais le niveau de risque, `schema` compris.
   */
  risque: Risque;
  /** Le sha de tête : le diff approuvé doit être le diff fusionné. */
  tete: string | null;
  /** Le code de poste lu sur la ligne `Auteur:` du corps de la PR. */
  auteurPoste: string | null;
  /** Le compte GitHub qui a ouvert la PR, s'il est connu. */
  auteurCompte?: string | null;
  /** Les codes de poste connus. Par défaut : `docs/agents.json`. */
  codes?: ReadonlySet<string>;
};

let codesEnCache: ReadonlySet<string> | null = null;

/** Les codes de poste, DÉRIVÉS du registre des postes — jamais une forme, jamais une liste. */
export function codesDePoste(chemin: string = CHEMIN_AGENTS): ReadonlySet<string> {
  if (chemin === CHEMIN_AGENTS && codesEnCache !== null) return codesEnCache;
  const doc = JSON.parse(readFileSync(chemin, 'utf8')) as { postes: { code: string }[] };
  const codes = new Set(doc.postes.map((p) => p.code));
  if (chemin === CHEMIN_AGENTS) codesEnCache = codes;
  return codes;
}

/**
 * Les chemins dont la modification exige la lentille `schema`, DÉRIVÉS de la §7 de la charte —
 * la même source que celle qui fait exiger le label. Ils étaient recopiés dans la garde (RM-01).
 */
export function cheminsSchema(charte: string = readFileSync(CHEMIN_CHARTE, 'utf8')): string[] {
  const debut = charte.indexOf('## 7.');
  const fin = charte.indexOf('## 8.');
  const section = debut < 0 ? '' : charte.slice(debut, fin < 0 ? undefined : fin);
  for (const ligne of section.split('\n')) {
    if (!ligne.startsWith('|')) continue;
    const cellules = ligne
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cellules.length < 4) continue;
    if (cellules[2]!.replace(/`/g, '').trim() !== LENTILLE_SCHEMA) continue;
    const chemins = cellules[0]!
      .split(',')
      .map((c) =>
        c
          .replace(/`/g, '')
          .replace(/\(.*\)/g, '')
          .replace(/\*\*/g, '')
          .trim()
      )
      .filter(Boolean);
    if (chemins.length > 0) return chemins;
  }
  throw new Error(
    `${CHEMIN_CHARTE} §7 ne déclare plus de ligne portant le label « ${LENTILLE_SCHEMA} » : ` +
      `les chemins de schéma ne peuvent pas en être dérivés, et aucune liste ne les remplace ici (RM-01).`
  );
}

/** Un chemin réservé est touché par la PR ? (préfixe de répertoire, ou fichier exact) */
export function touche(chemin: string, fichiers: readonly string[]): boolean {
  const c = chemin.replace(/\/$/, '');
  return fichiers.some((f) => f === chemin || f === c || f.startsWith(c + '/'));
}

/**
 * LE DISCRIMINANT `schema`, ET LE PLUS STRICT GAGNE. Trois signaux, du plus fort au plus faible :
 * les FICHIERS de la PR, le champ `schema` des tâches qu'elle porte, le label. Le label seul était
 * la lecture du composeur : il se pose à la main, donc il s'oublie à la main.
 */
export function toucheSchema(entree: {
  fichiers: readonly string[];
  labels: readonly string[];
  tachesSchema: boolean;
  charte?: string;
}): boolean {
  if (entree.tachesSchema) return true;
  if (entree.labels.includes(LENTILLE_SCHEMA)) return true;
  return cheminsSchema(entree.charte).some((c) => touche(c, entree.fichiers));
}

/**
 * Ce qu'une tâche doit dire pour qu'on sache si elle est de cette PR, si elle touche au schéma, et
 * de quel RISQUE elle est. `sensible` et `zone` peuvent manquer ou valoir `null` dans une lecture
 * brute : c'est justement ce que `risqueDeLaPr()` doit voir, et qu'une projection `?? []` taisait.
 */
export type TacheDeLaPr = {
  id: string;
  pr?: number | null;
  schema?: boolean;
  sensible?: readonly string[] | null;
  zone?: string | null;
};

/**
 * Les deux têtes coïncident-elles ? La forge peut rapporter une tête PÉRIMÉE — mesuré le
 * 2026-09-05, quelques secondes après un `git push` — et l'erreur va dans le sens PERMISSIF :
 * des accords rendus sur la tête précédente sont alors comptés COURANTS.
 *
 * ⚠️ ELLE VIT ICI, dans le module PARTAGÉ, et non chez l'un des deux appelants. La première
 * version la posait sur le composeur — qui DÉCRIT — et pas sur la garde — qui AUTORISE. Le veto
 * de la lentille `securite` au 10e tour : c'est la garde qui décide d'une fusion, et c'est elle
 * qui lisait la tête sans jamais la confronter. Même asymétrie entre deux frères que celle qu'on
 * venait de fermer entre les deux `--render`, reproduite un cran plus haut le même jour.
 */
export function tetesConcordent(locale: string, forge: string): boolean {
  return locale.trim().length > 0 && locale.trim() === forge.trim();
}

/**
 * CE QU'ON DEMANDE À LA CONFRONTATION, ET POURQUOI CE N'EST PAS LA MÊME QUESTION AUX DEUX MOMENTS.
 *
 * 🔴 LA FAUTE QUE CE TYPE FERME, mesurée par la lentille `schema` au 12e tour. La version
 * précédente jugeait les DEUX moments par une **égalité de chaînes**. Avant fusion c'est juste :
 * « le diff approuvé est le diff fusionné » EST une égalité. **Après fusion, la propriété que le
 * pas 8 atteste est une ANCESTRALITÉ** — « la fusion a atteint la base » — et l'égalité n'en est
 * qu'un cas particulier : celui où rien n'a été fusionné depuis. Mesuré :
 *
 *     PR #29, mergeCommit ab5caf5 :  git merge-base --is-ancestor ab5caf5 origin/main  ->  0
 *     la meme PR, par la gate      :  « l'atterrissage n'est pas atteste »              ->  1
 *
 * **La PR #29 a bel et bien atterri, et la gate disait le contraire.** L'égalité n'est vraie que
 * dans la fenêtre séparant une fusion de la suivante ; hors d'elle, fausse **pour toujours**.
 * *J'avais corrigé la gate insatisfiable pour la PR la plus récente et l'avais laissée
 * insatisfiable pour toutes les autres : elle n'avait pas disparu, elle avait changé de famille.*
 *
 * ⚠️ Et j'employais la BONNE relation au même moment, ailleurs : l'outil qui écrit
 * `docs/lots/<lot>/resultat.json` vérifie l'atterrissage par `merge-base --is-ancestor`. *Se
 * servir de la bonne relation dans un outil et de la mauvaise dans la garde, à une heure
 * d'intervalle, c'est ce à quoi ressemble une faute de conception : jamais à de l'ignorance.*
 *
 * 🔴 POURQUOI C'EST UNE UNION DISCRIMINÉE et non deux paramètres. La lentille `schema`, même tour :
 * avec `(locale, attendue, moment)`, l'appel `jugerLesTetes(HEAD, mergeCommit, 'avant-fusion')`
 * reste **exprimable** — le mauvais appariement compile. Le dépôt s'est donné le standard inverse
 * au 6e tour, sur `lireRevues` : *on ne teste pas ce qui ne se dit pas.* Les champs portent donc
 * des noms différents par moment, et le mauvais appariement ne compile plus.
 */
export type DemandeDeConcordance =
  | { moment: 'avant-fusion'; teteLocale: string; teteForge: string }
  | { moment: 'apres-fusion'; mergeCommit: string; base: string; estAncetre: boolean };

export interface VerdictDeTete {
  readonly concordent: boolean;
  /** Vide si la propriété tient. Sinon le refus, prêt à imprimer, ligne par ligne. */
  readonly message: readonly string[];
}

/**
 * PURE, et exercée sur ses DEUX branches — la lentille `schema` avait mesuré que la branche
 * d'après-fusion n'était exécutée par AUCUN test : `jugerLesTetes` n'était importée par aucun
 * spec, et le lancement réel passait toujours par la branche concordante. **Le refus n'avait
 * jamais été vu rougir** (RM-02).
 */
export function jugerLesTetes(d: DemandeDeConcordance): VerdictDeTete {
  if (d.moment === 'avant-fusion') {
    if (tetesConcordent(d.teteLocale, d.teteForge)) return { concordent: true, message: [] };
    const l = d.teteLocale.trim().slice(0, 7) || '(aucune)';
    const f = d.teteForge.trim().slice(0, 7) || '(aucune)';
    return {
      concordent: false,
      message: [
        `❌ la forge rapporte la tête ${f} alors que l'arbre local est sur ${l}. Les verdicts de ` +
          `revue seraient jugés PÉRIMÉS ou COURANTS par rapport à un diff qui n'est pas celui ` +
          `qu'on fusionnera.`,
        `   Si tu viens de pousser, la forge est simplement en retard : relance dans quelques ` +
          `secondes. Sinon, pousse d'abord.`,
      ],
    };
  }

  // Après fusion : ANCESTRALITÉ. Une `mergeCommit` absente refuse — le sens reste FERMÉ.
  const sha = d.mergeCommit.trim();
  if (sha.length > 0 && d.estAncetre) return { concordent: true, message: [] };

  const s = sha.slice(0, 7) || '(aucun)';
  return {
    concordent: false,
    message: [
      sha.length === 0
        ? `❌ la forge ne rapporte AUCUN commit de fusion pour cette PR : elle n'est pas fusionnée, ` +
          `et le pas 8 n'a rien à attester.`
        : `❌ le commit de fusion ${s} n'est pas dans \`${d.base}\` : la fusion n'a pas ATTERRI. ` +
          `Le pas 8 porte sur ce qui est arrivé dans la base, pas sur ce que la forge a accepté.`,
      `   Lance \`git fetch origin\`, puis vérifie \`git merge-base --is-ancestor ${s} ${d.base}\`. ` +
        `⚠️ La base peut avoir AVANCÉ depuis : ce pas ne demande pas qu'elle soit ÉGALE au commit ` +
        `de fusion, seulement qu'elle le CONTIENNE.`,
    ],
  };
}

/**
 * LA MESURE, séparée de la DÉCISION — pour que la décision reste pure et testable sur ses deux
 * branches sans jamais lancer `git`. Elle échoue FERMÉ : toute erreur (ref absente, dépôt absent,
 * sha inconnu) rend `false`, donc un refus, jamais une permission.
 */
export function estAncetreDe(sha: string, ref: string): boolean {
  if (!/^[0-9a-f]{7,40}$/.test(sha.trim())) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha.trim(), ref], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * L'ENSEMBLE DES TÂCHES D'UNE PR — UNE SEULE DÉRIVATION, POUR LES DEUX APPELANTS.
 *
 * 🔴 LE DÉFAUT, MESURÉ LE 2026-09-05 SUR LES DONNÉES RÉELLES DE LA PR 31. Le lecteur des revues
 * était devenu unique ; son ENTRÉE ne l'était pas. Les deux appelants composaient chacun le sien :
 *
 *     gov-pr.ts      `taches.find(t => t.id === <la tâche du TITRE>)`   → GOV-024 → false
 *     corps-de-pr.ts `taches.filter(t => t.pr === 31).some(t.schema)`   → GOV-006 → true
 *
 * Les deux ne concordaient sur cette PR-là que par accident : `prisma/schema.prisma` était au diff
 * ET le label `schema` posé, si bien que les deux autres signaux de `toucheSchema()` couvraient
 * l'écart. Retire l'un des deux, et la garde BLOQUANTE exige moins que le corps publié n'affiche.
 * Un lecteur unique nourri par deux sources divergentes n'est unique que sur le papier.
 *
 * CE QUI EST TRANCHÉ : L'UNION — les tâches portant `pr: <n>`, PLUS celle que le titre nomme.
 * Ni l'une ni l'autre seule :
 *
 *   — le TITRE seul ne nomme qu'UNE tâche par convention, alors qu'une PR de lot en porte neuf ;
 *     la PR 31 en est la preuve, sa tâche `schema` n'est pas celle du titre ;
 *   — les TÂCHES `pr: <n>` seules laissent un trou mesuré : la grande majorité des tâches du backlog (181 sur 209 au 2026-09-05 ; c'était 179 sur 207 la veille, et l'écart vient du commit qui a écrit cette phrase — il créait deux tâches) du backlog portent
 *     `pr: null`, dont une vingtaine à `schema: true` (compté à la main le 2026-09-05 : la mesure du jour donne 20, une première rédaction disait douze — la conclusion tient *a fortiori*, mais un nombre écrit ici vieillit à chaque composition de lot, et il ne sert qu'à donner un ordre de grandeur). Une PR ouverte AVANT que `docs/tasks.json` ne porte
 *     son numéro aurait un ensemble VIDE, et la garde n'exigerait pas `schema` pour une tâche qui
 *     l'est. C'est sur ce point que je contredis la lentille, qui proposait ce dénominateur seul.
 *
 * ET LA PROPRIÉTÉ QUI INTERDIT LE RETOUR DU DÉFAUT EST LA MONOTONIE, pas la concordance du jour :
 * l'ensemble ne peut que GROSSIR quand on donne un renseignement de plus. L'appelant qui en sait
 * le plus — la garde, qui lit le titre — obtient donc toujours un SUR-ENSEMBLE de celui du
 * composeur, et « la garde exige moins que le corps n'affiche » devient impossible par
 * construction. Le composeur, lui, passe `null` : il décrit ce que la PR DÉCLARE porter, et c'est
 * exactement ce que `LISTE_SUR_LA_PR` et `COUVRE` doivent dire.
 */
export function tachesDeLaPr<T extends TacheDeLaPr>(
  taches: readonly T[],
  pr: number | null,
  idDuTitre: string | null
): T[] {
  return taches.filter(
    (t) => (pr !== null && t.pr === pr) || (idDuTitre !== null && t.id === idDuTitre)
  );
}

/** Cette PR touche-t-elle au schéma PAR SES TÂCHES ? Un des trois signaux de `toucheSchema()`. */
export function tachesSchemaDeLaPr<T extends TacheDeLaPr>(
  taches: readonly T[],
  pr: number | null,
  idDuTitre: string | null
): boolean {
  return tachesDeLaPr(taches, pr, idDuTitre).some((t) => t.schema === true);
}

// ── LE RISQUE D'UNE PR, ET LES LENTILLES QU'IL EXIGE (GOV-077, levier 3 du 2026-09-18) ────────

/**
 * LA RELECTURE SE PROPORTIONNE AU RISQUE — décision de Will du 2026-09-18 (`docs/CHARTE-AGENTS.md`
 * §6, `partners/ADR-0012`). Jusqu'ici `lentillesExigees()` exigeait EN DUR quatre lentilles sur
 * toute PR, y compris sur une PR qui ne touche que la documentation d'une tâche de qualité.
 *
 * LA RÈGLE ÉCHOUE FERMÉ : l'ORDINAIRE se PROUVE, l'ÉLEVÉ est le DÉFAUT. Une PR n'est ordinaire que
 * si TOUTES ces conditions sont établies ; il suffit d'un fait manquant pour qu'elle soit élevée :
 *
 *   1. au moins une tâche résolue (`tachesDeLaPr`, titre ∪ champ `pr`) ;
 *   2. le registre de BASE lisible ;
 *   3. chaque tâche résolue, lue sur la TÊTE et sur la BASE, est en zone `gouvernance` ou
 *      `qualite`, porte `sensible` PRÉSENT et VIDE, et `schema` qui n'est pas `true` — la plus
 *      haute l'emporte (`.some`, jamais la première ni la dernière) ;
 *   4. aucun label `schema` ;
 *   5. un diff NON VIDE dont chaque fichier est sous `docs/`, `scripts/`, `tests/`, ou est un
 *      document `*.md` à la racine, et n'appartient pas à la garde des revues. Un fichier RENOMMÉ
 *      ou COPIÉ compte par sa source ET sa destination (`cheminsTouches`).
 *
 * ⚠️ `.github/` N'Y EST PAS, et c'est une décision (orchestrateur, 2026-09-18, sur GOV-077) : les
 * workflows et `CODEOWNERS` gouvernent les gates et la propriété des chemins. Une PR qui affaiblit
 * la CI est exactement celle qu'on ne relit pas à deux lentilles. Conséquence assumée : une tâche
 * qui touche `.github/workflows/ci.yml` (QA-T01) se relit en élevé.
 *
 * ⚠️ LA RACINE N'Y EST PAS NON PLUS, SAUF SES DOCUMENTS `*.md` (même décision, sur la dette 5 de la
 * lentille `securite`) : `package.json`, `pnpm-lock.yaml`, `vitest.config.*`, `eslint.config.*`,
 * `tsconfig*.json`, `.npmrc`, `.gitattributes`… gouvernent la chaîne de contrôle. Les énumérer
 * laisserait passer le prochain ; la règle fermée est « toute la racine, sauf les documents ».
 *
 * POURQUOI DES LISTES BLANCHES. Une liste noire de zones (« argent, securite ») laisse passer tout
 * le reste : mesuré le 2026-09-18, huit tâches vivantes manipulent des données personnelles avec
 * `sensible: []` (INT-T09, INT-T10, INT-T11, INT-T13, JUR-T09, UX-P1-07, UX-P3-03, EXT-T05), et
 * aucune n'est en zone `gouvernance` ou `qualite`. De même pour les chemins : un dossier neuf,
 * `config/exemptions-corps-publie.json` ou `.claude/settings.json` tombent en élevé sans que
 * personne ait eu à penser à eux.
 */
export const ZONES_A_RISQUE_ORDINAIRE: readonly string[] = ['gouvernance', 'qualite'];
export const CHEMINS_A_RISQUE_ORDINAIRE: readonly string[] = ['docs/', 'scripts/', 'tests/'];

/**
 * LA GARDE DES REVUES ELLE-MÊME est toujours de risque élevé, même sous `scripts/` ou `docs/` :
 * sinon une PR ordinaire, relue par deux lentilles, pourrait affaiblir la règle qui décide combien
 * de lentilles relisent toutes les autres. Le module, ses deux importeurs, et les deux documents
 * qu'il lit. Cette liste n'est pas tapée au hasard : `lentilles-selon-le-risque.spec.ts` la
 * confronte au GRAPHE D'IMPORTS de `scripts/`, et un importeur non déclaré la fait rougir.
 */
export const CHEMINS_DE_LA_GARDE_DES_REVUES: readonly string[] = [
  'scripts/lot/revues.ts',
  'scripts/gates/gov-pr.ts',
  'scripts/lot/corps-de-pr.ts',
  CHEMIN_CHARTE,
  CHEMIN_AGENTS,
];

export const CHEMIN_TACHES = 'docs/tasks.json';

/** Le risque d'une PR : son niveau, le signal `schema`, et les RAISONS, prêtes à imprimer. */
export type Risque = {
  niveau: 'eleve' | 'ordinaire';
  schema: boolean;
  raisons: readonly string[];
};

/**
 * LE TITRE D'UNE PR : `<type>(<ID-TÂCHE>): <titre>` (`docs/CONVENTIONS.md` §5). Écrit UNE fois :
 * la garde le lit pour juger le titre, le composeur du corps pour résoudre la tâche du risque.
 */
export const MOTIF_TITRE_DE_PR = /^([a-z]+)\(([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)\):\s+\S/;

/** L'identifiant de tâche que nomme un titre de PR, ou `null`. */
export function idDuTitre(titre: string | null): string | null {
  if (titre === null) return null;
  return MOTIF_TITRE_DE_PR.exec(titre)?.[2] ?? null;
}

/**
 * LE REGISTRE DES TÂCHES TEL QU'IL EST SUR LA BASE de la PR (`git show <ref>:docs/tasks.json`).
 * Sans lui, une PR réécrirait la `zone` ou viderait le `sensible` de sa propre tâche — chaque PR
 * écrit `docs/tasks.json` — et se relirait en ordinaire. Toute erreur rend `null`, jamais une
 * liste vide : l'absence est un fait que `risqueDeLaPr()` convertit en ÉLEVÉ.
 */
export function tachesDeLaBase(ref: string): TacheDeLaPr[] | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) return null;
  try {
    const doc = JSON.parse(
      execFileSync('git', ['show', `${ref}:${CHEMIN_TACHES}`], {
        encoding: 'utf8',
        maxBuffer: 64e6,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ) as { taches?: unknown };
    return Array.isArray(doc.taches) ? (doc.taches as TacheDeLaPr[]) : null;
  } catch {
    return null;
  }
}

/** Pourquoi une tâche n'est pas ordinaire — `null` si elle l'est. Un champ absent n'est RIEN prouvé. */
function tacheNonOrdinaire(t: TacheDeLaPr): string | null {
  const ecarts: string[] = [];
  if (typeof t.zone !== 'string') ecarts.push('champ `zone` absent');
  else if (!ZONES_A_RISQUE_ORDINAIRE.includes(t.zone)) ecarts.push(`zone ${t.zone}`);
  if (!Array.isArray(t.sensible)) ecarts.push('champ `sensible` absent');
  else if (t.sensible.length > 0) ecarts.push(`sensible [${t.sensible.join(', ')}]`);
  if (t.schema === true) ecarts.push('schema: true');
  return ecarts.length === 0 ? null : ecarts.join(', ');
}

/** Un fichier hors code produit : un document `*.md` à la racine, ou sous l'un des préfixes admis. */
function cheminOrdinaire(f: string): boolean {
  return (
    (!f.includes('/') && f.endsWith('.md')) ||
    CHEMINS_A_RISQUE_ORDINAIRE.some((p) => f.startsWith(p))
  );
}

/**
 * Un fichier touché par une PR, sous la forme de `GET /repos/{o}/{r}/pulls/{n}/files` : un
 * renommage porte la destination dans `filename` et la SOURCE dans `previous_filename`.
 */
export type EntreeDeFichier = {
  filename: string;
  previous_filename?: string | null;
  status?: string;
};

/**
 * LES CHEMINS QU'UNE PR TOUCHE — L'UNIQUE EXTRACTION, pour `gov:pr` (forge et diff local) ET pour
 * le composeur du corps (GOV-077, refus bloquant de `securite` du 2026-09-19).
 *
 * 🔴 LE DÉFAUT : un fichier renommé n'était jugé que par sa destination. Les deux appelants ne
 * lisaient que `filename`, et le diff local `git diff --name-only`, qui ne rend que le nouveau
 * chemin. Le risque, le label `schema` et les labels des chemins réservés se jugeaient donc sur un
 * chemin qui n'est pas celui que la PR retire. La source et la destination sont TOUTES DEUX
 * touchées : les deux entrent, et le plus haut risque l'emporte.
 */
export function cheminsTouches(entrees: readonly EntreeDeFichier[]): string[] {
  const chemins = new Set<string>();
  for (const e of entrees) {
    if (e.filename) chemins.add(e.filename);
    if (e.previous_filename) chemins.add(e.previous_filename);
  }
  return [...chemins];
}

/**
 * La sortie de `git diff --name-status`, lue dans la forme de la forge. Une ligne = un statut puis
 * un chemin, ou DEUX pour un renommage ou une copie (`R100`, `C075`) : la source puis la destination.
 */
export function entreesDuDiff(sortie: string): EntreeDeFichier[] {
  const entrees: EntreeDeFichier[] = [];
  for (const ligne of sortie.split('\n')) {
    const colonnes = ligne.replace(/\r$/, '').split('\t');
    if (colonnes.length < 2) continue;
    const chemins = colonnes.slice(1).filter(Boolean);
    const destination = chemins[chemins.length - 1];
    if (destination === undefined) continue;
    entrees.push({
      filename: destination,
      previous_filename: chemins.length > 1 ? chemins[0] : null,
      status: colonnes[0],
    });
  }
  return entrees;
}

export type EntreeDuRisque = {
  /** Le titre de la PR : il résout la tâche que le champ `pr` du registre ne porte pas encore. */
  titre: string | null;
  pr: number | null;
  /** Le registre de la TÊTE. */
  taches: readonly TacheDeLaPr[];
  /** Le registre de la BASE — `null` s'il est illisible, et c'est un risque élevé. */
  tachesBase: readonly TacheDeLaPr[] | null;
  fichiers: readonly string[];
  labels: readonly string[];
  charte?: string;
};

/**
 * LE RISQUE D'UNE PR — LA SEULE DÉRIVATION, appelée par `scripts/gates/gov-pr.ts` ET par
 * `scripts/lot/corps-de-pr.ts`. Voir `ZONES_A_RISQUE_ORDINAIRE` pour la règle et ses mesures.
 *
 * MONOTONIE : un renseignement de plus — une tâche, un fichier, la base — ne peut que faire MONTER
 * le risque. Les tâches résolues sont l'UNION de celles de la tête et de celles de la base.
 * LIMITE DÉCLARÉE : une tâche absente de la base (créée par la PR) n'est jugée que sur la tête ;
 * créer une tâche passe par `verser-tache` et le label `role:gardien-spec`.
 */
export function risqueDeLaPr(e: EntreeDuRisque): Risque {
  const raisons: string[] = [];
  const id = idDuTitre(e.titre);
  const ids = [
    ...new Set(
      [...tachesDeLaPr(e.taches, e.pr, id), ...tachesDeLaPr(e.tachesBase ?? [], e.pr, id)].map(
        (t) => t.id
      )
    ),
  ];
  if (ids.length === 0) {
    raisons.push('aucune tâche résolue (ni par le titre, ni par le champ `pr`)');
  }
  if (e.tachesBase === null) raisons.push('registre de base illisible');

  let tachesSchema = false;
  const prouvees: string[] = [];
  for (const idT of ids) {
    const surLaTete = e.taches.find((t) => t.id === idT);
    const surLaBase = e.tachesBase?.find((t) => t.id === idT);
    const versions: [string, TacheDeLaPr | undefined][] = [
      ['tête', surLaTete],
      ['base', surLaBase],
    ];
    let ordinaire = true;
    for (const [ou, t] of versions) {
      if (t === undefined) continue;
      if (t.schema === true) tachesSchema = true;
      const ecart = tacheNonOrdinaire(t);
      if (ecart !== null) {
        ordinaire = false;
        raisons.push(`${idT} sur la ${ou} : ${ecart}`);
      }
    }
    const t = surLaTete ?? surLaBase;
    if (ordinaire && t !== undefined) prouvees.push(`${idT} (${String(t.zone)}, sensible vide)`);
  }

  if (e.labels.includes(LENTILLE_SCHEMA)) raisons.push('label `schema` posé');
  if (e.fichiers.length === 0) raisons.push('diff vide ou illisible');
  const produit = e.fichiers.filter((f) => !cheminOrdinaire(f));
  if (produit.length > 0) {
    raisons.push(
      `fichier(s) hors ${CHEMINS_A_RISQUE_ORDINAIRE.join(', ')} et documents .md de la racine : ` +
        produit.join(', ')
    );
  }
  const garde = e.fichiers.filter((f) => CHEMINS_DE_LA_GARDE_DES_REVUES.includes(f));
  if (garde.length > 0) raisons.push(`fichier(s) de la garde des revues : ${garde.join(', ')}`);

  const schema = toucheSchema({
    fichiers: e.fichiers,
    labels: e.labels,
    tachesSchema,
    charte: e.charte,
  });
  if (raisons.length > 0 || schema) {
    if (raisons.length === 0) raisons.push('la PR touche au schéma');
    return { niveau: 'eleve', schema, raisons };
  }
  return {
    niveau: 'ordinaire',
    schema: false,
    raisons: [prouvees.join(', '), `${e.fichiers.length} fichier(s) hors code produit`],
  };
}

/**
 * LES LENTILLES EXIGÉES, DÉRIVÉES DU RISQUE. Élevé : `exactitude`, `securite`, `simplicite` — que
 * A02 REMPLACE par `schema` sur une PR de schéma (charte §6) — et `mutation`. Ordinaire :
 * `exactitude` et `securite`, dont le refus bloque à lui seul.
 *
 * ⚠️ LA BRANCHE COURTE SE PROUVE, LA LONGUE EST LE DÉFAUT : on teste `=== 'ordinaire'` et
 * `schema === false`, jamais `=== 'eleve'`. Une valeur imprévue rend donc les quatre lentilles.
 */
export function lentillesExigees(risque: Risque): {
  sansMutation: readonly string[];
  toutes: readonly string[];
} {
  if (risque.niveau === 'ordinaire' && risque.schema === false) {
    return { sansMutation: [...DEUX_PREMIERES], toutes: [...DEUX_PREMIERES] };
  }
  const sansMutation = [
    ...DEUX_PREMIERES,
    risque.schema === true ? LENTILLE_SCHEMA : LENTILLE_SIMPLICITE,
  ];
  return { sansMutation, toutes: [...sansMutation, LENTILLE_MUTATION] };
}

/** Une ligne qui NOMME le risque et ses raisons — la garde l'imprime, le composeur la publie. */
export function direLeRisque(risque: Risque): string {
  const exigees = lentillesExigees(risque).toutes;
  return (
    `risque ${risque.niveau === 'ordinaire' ? 'ordinaire' : 'élevé'} ` +
    `(${exigees.length} lentilles exigées : ${exigees.join(', ')}) — ${risque.raisons.join(' ; ')}`
  );
}

function normaliser(brute: RevueBrute): Revue {
  return {
    compte: brute.user?.login ?? '',
    association: (brute.author_association ?? '').toUpperCase(),
    etat: (brute.state ?? '').toUpperCase(),
    corps: brute.body ?? '',
    commit: brute.commit_id ?? '',
  };
}

/** La lentille d'une revue : son en-tête, et son code CONFRONTÉ au registre des postes. */
export function lentilleDeLaRevue(
  corps: string,
  codes: ReadonlySet<string>
): { code: string; lentille: string } | { motif: 'sans_lentille' | 'poste_inconnu' } {
  const m = MOTIF_ENTETE.exec(corps.split('\n')[0] ?? '');
  if (!m) return { motif: 'sans_lentille' };
  if (!codes.has(m[1]!)) return { motif: 'poste_inconnu' };
  return { code: m[1]!, lentille: m[2]!.toLowerCase() };
}

export function lireRevues(entree: Entree): Lecture {
  const codes = entree.codes ?? codesDePoste();
  const exigees = [...lentillesExigees(entree.risque).toutes];
  const retenues: Revue[] = [];
  const ecartees: { revue: Revue; motif: MotifEcart }[] = [];
  /** Les avis qui portent des décisions contradictoires : ils ne comptent pas, et on le DIT. */
  const ambigus: { revue: Revue; valeurs: ('accepte' | 'refuse')[] }[] = [];
  const dernierPar = new Map<string, Verdict>();

  for (const brute of entree.revues) {
    const r = normaliser(brute);
    if (!ETATS_RENDUS.has(r.etat)) {
      ecartees.push({ revue: r, motif: 'etat_ecarte' });
      continue;
    }
    if (!ASSOCIATIONS_HABILITEES.has(r.association)) {
      ecartees.push({ revue: r, motif: 'auteur_non_habilite' });
      continue;
    }
    const v = verdictDeLaRevue(r.corps);
    if ('motif' in v) {
      ecartees.push({ revue: r, motif: v.motif });
      if (v.motif === 'verdict_ambigu') ambigus.push({ revue: r, valeurs: v.valeurs });
      continue;
    }
    const l = lentilleDeLaRevue(r.corps, codes);
    if ('motif' in l) {
      ecartees.push({ revue: r, motif: l.motif });
      continue;
    }
    retenues.push(r);
    // Le DERNIER verdict prime, par couple `poste·lentille` : un poste efface son propre refus en
    // relisant, jamais celui d'un autre.
    dernierPar.set(`${l.code}·${l.lentille}`, {
      code: l.code,
      lentille: l.lentille,
      verdict: v.verdict,
      commit: r.commit,
      compte: r.compte,
    });
  }

  const verdicts = [...dernierPar.values()];
  const accords = verdicts.filter((x) => x.verdict === 'accepte');
  const manquantes = exigees.filter((l) => !accords.some((x) => x.lentille === l));
  const refusees = verdicts.filter((x) => x.verdict === 'refuse');
  const perimees =
    entree.tete === null || entree.tete === ''
      ? []
      : accords.filter((x) => exigees.includes(x.lentille) && x.commit !== entree.tete);
  const auteurSeRelit =
    entree.auteurPoste === null ? [] : accords.filter((x) => x.code === entree.auteurPoste);
  const comptesDistinctsDeLAuteur =
    entree.auteurCompte === null || entree.auteurCompte === undefined
      ? false
      : retenues.some((r) => r.compte !== '' && r.compte !== entree.auteurCompte);

  const tete7 = (entree.tete ?? '').slice(0, 7);
  const raisons: string[] = [];
  if (entree.tete === null || entree.tete === '') {
    raisons.push('tête de la PR inconnue : la péremption des avis n’est pas mesurable');
  }
  if (entree.auteurPoste === null) {
    raisons.push('`Auteur:` illisible dans le corps : « Relecteur ≠ auteur » n’est pas mesurable');
  }
  if (manquantes.length > 0) raisons.push(`manquante(s) : ${manquantes.join(', ')}`);
  if (refusees.length > 0) {
    raisons.push(`en refus : ${refusees.map((x) => `${x.code} · ${x.lentille}`).join(', ')}`);
  }
  if (perimees.length > 0) {
    raisons.push(
      `périmée(s) sur une autre tête que ${tete7} : ` +
        perimees.map((x) => `${x.lentille} (jugé ${x.commit.slice(0, 7)})`).join(', ')
    );
  }
  if (auteurSeRelit.length > 0) {
    raisons.push(
      `l’auteur ${entree.auteurPoste} rend lui-même : ${auteurSeRelit.map((x) => x.lentille).join(', ')}`
    );
  }
  /**
   * L'AMBIGUÏTÉ SE DIT UNE PAR UNE, PAS EN COMPTEUR. Un « 1 verdict_ambigu » noyé dans le total
   * des avis écartés ne dit pas au relecteur quoi refaire — et c'est justement lui, et lui seul,
   * qui peut lever l'ambiguïté. La raison NOMME donc la revue (sa ligne d'en-tête) et les valeurs
   * qui se contredisent, et elle dit le geste : reposter.
   */
  for (const a of ambigus) {
    const entete =
      (a.revue.corps.split('\n')[0] ?? '').trim() || `(sans en-tête, ${a.revue.compte})`;
    raisons.push(
      `avis AMBIGU, qui ne compte pour rien : « ${entete} » porte des lignes « Verdict: » qui ne ` +
        `disent pas la même chose (${a.valeurs.join(', ')}). Une citation ne porte pas la décision : ` +
        `reposte un avis à UN seul verdict, on ne devine pas lequel des deux est le tien.`
    );
  }
  if (ecartees.length > 0) {
    const parMotif = new Map<MotifEcart, number>();
    for (const e of ecartees) parMotif.set(e.motif, (parMotif.get(e.motif) ?? 0) + 1);
    raisons.push(
      `avis écarté(s) : ${[...parMotif.entries()].map(([m, n]) => `${n} ${m}`).join(', ')}`
    );
  }

  const coche =
    entree.tete !== null &&
    entree.tete !== '' &&
    entree.auteurPoste !== null &&
    manquantes.length === 0 &&
    refusees.length === 0 &&
    perimees.length === 0 &&
    auteurSeRelit.length === 0;

  const detail = coche
    ? `les ${exigees.length} lentilles (${exigees.join(', ')}) ont accepté sur ${tete7} — ` +
      `${direLeRisque(entree.risque)} — « Relecteur ≠ auteur » vérifiée au niveau du poste (${entree.auteurPoste} ne rend aucun de ces avis, ` +
      `charte §6)` +
      (comptesDistinctsDeLAuteur
        ? ''
        : `, et NON au niveau des comptes GitHub : toutes les revues retenues viennent du compte de ` +
          `l’auteur, ce dépôt n’en a qu’un (W13)`)
    : [direLeRisque(entree.risque), ...raisons].join(' · ');

  return {
    retenues,
    ecartees,
    verdicts,
    exigees,
    manquantes,
    refusees,
    perimees,
    auteurSeRelit,
    comptesDistinctsDeLAuteur,
    coche,
    raisons,
    detail,
  };
}

/** Les familles de faute que la lecture des revues peut rendre — `gov:pr` les déclare. */
export type FauteDeRevue = {
  famille: 'aucune_revue' | 'lentille_en_refus' | 'lentilles_manquantes';
  message: string;
};

/**
 * AUCUNE REVUE N'EST PAS « TOUTES LES REVUES REFUSENT » (GOV-077).
 *
 * 🔴 LE DÉFAUT, MESURÉ À `809a746`. `gov:pr --pr <n>` imprimait « Vues : (aucune) » dans les DEUX
 * cas — aucune revue lue, et toutes les revues lues en refus — parce que la ligne ne listait que
 * les ACCORDS. Deux états opposés rendus identiques : le second, le plus grave, devenait
 * invisible derrière le premier. Désormais :
 *
 *   — aucune revue retenue → la famille `aucune_revue`, et elle seule : ce n'est pas un refus,
 *     c'est une absence, et le geste qui la répare n'est pas le même ;
 *   — des revues retenues → `lentille_en_refus` pour chaque refus, et la ligne des lentilles
 *     manquantes NOMME les accords ET les refus.
 *
 * LE MESSAGE DE VETO DIT LA RÈGLE ÉCRITE. Il citait REQ-GOV-011, qui ne parle pas de veto. La
 * charte §6 l'écrit désormais (décision de Will du 2026-09-18) : sur TOUTE PR, le refus de
 * `securite` bloque à lui seul ; sur une tâche `sensible` SEULEMENT, un scénario d'attaque est
 * exigé (REQ-GOV-011). Un refus d'une lentille NON exigée bloque aussi : on n'est pas obligé de la
 * demander, on ne peut pas l'ignorer une fois rendue — `refusees` n'est filtré par rien.
 */
export function fautesDesRevues(
  lecture: Lecture,
  contexte: { tacheSensible: boolean }
): FauteDeRevue[] {
  const fautes: FauteDeRevue[] = [];
  if (lecture.retenues.length === 0) {
    fautes.push({
      famille: 'aucune_revue',
      message:
        `Revues — AUCUNE revue retenue sur cette PR (${lecture.ecartees.length} avis écarté(s)) : ` +
        `les lentilles exigées (${lecture.exigees.join(', ')}) n'ont été rendues par personne. Ce ` +
        `n'est pas un refus, c'est une absence. Une revue se poste par \`gh pr review --comment\`, ` +
        `jamais en commentaire d’issue.`,
    });
    return fautes;
  }
  for (const v of lecture.refusees) {
    fautes.push({
      famille: 'lentille_en_refus',
      message:
        `Revues — ${v.code} · ${v.lentille} rend « Verdict: refuse », et c'est son DERNIER mot. ` +
        `A04 ne fusionne pas sur un refus` +
        (v.lentille === 'securite'
          ? ` — et le refus de securite bloque à lui seul (charte §6, décision de Will du ` +
            `2026-09-18)` +
            (contexte.tacheSensible
              ? ` ; tâche sensible : scénario d’attaque exigé (REQ-GOV-011)`
              : '')
          : '') +
        '.',
    });
  }
  const accords = lecture.verdicts.filter((x) => x.verdict === 'accepte');
  const nommer = (liste: Verdict[], vide: string) =>
    liste.map((x) => `${x.code} ${x.lentille}`).join(' / ') || vide;
  const manquantes = lecture.manquantes.filter((l) => l !== LENTILLE_MUTATION);
  if (manquantes.length > 0) {
    fautes.push({
      famille: 'lentilles_manquantes',
      message:
        `Revues — lentille(s) manquante(s) : ${manquantes.join(', ')}. Chaque revue s'ouvre par ` +
        `« A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). Vues — accords : ` +
        `${nommer(accords, '(aucun)')} ; refus : ${nommer(lecture.refusees, '(aucun)')}.`,
    });
  }
  if (lecture.manquantes.includes(LENTILLE_MUTATION)) {
    fautes.push({
      famille: 'lentilles_manquantes',
      message:
        `Revues — aucun avis « mutation » : A10 n'a pas dit que les gardes introduites avaient été ` +
        `vues rougir sur une mutation réelle (RM-02).`,
    });
  }
  return fautes;
}

/** La forme servie par `GET /repos/{owner}/{repo}/issues/{n}/comments`. */
export type CommentaireBrut = {
  id?: number;
  user?: { login?: string | null } | null;
  author_association?: string | null;
  created_at?: string | null;
  body?: string | null;
};

/**
 * LES AVIS POSTÉS AU MAUVAIS ENDROIT — DITS, JAMAIS COMPTÉS (GOV-077).
 *
 * Mesuré le 2026-09-14 sur la PR 41 : ses avis de lentille étaient des COMMENTAIRES D'ISSUE, et elle
 * ne portait aucune revue. Ils comptaient pour rien — c'est juste : un commentaire d'issue n'a ni
 * `state` ni `commit_id`, donc ni péremption ni retrait mesurables — mais RIEN ne le disait. Un
 * commentaire dont la première ligne a la forme d'un en-tête de revue est donc NOMMÉ, avec le
 * geste qui le répare. Même doctrine que les avis écartés : le dépôt est public, en faire une faute
 * rendrait la garde rouge pour un geste qui n'appartient pas au projet.
 */
export function avisHorsCanal(commentaires: readonly CommentaireBrut[] | null): string[] {
  if (commentaires === null) return [];
  const dits: string[] = [];
  for (const c of commentaires) {
    const entete = ((c.body ?? '').split('\n')[0] ?? '').replace(/\r$/, '').trim();
    if (!MOTIF_ENTETE.test(entete)) continue;
    dits.push(
      `avis « ${entete} » posté en commentaire d’issue (compte « ${c.user?.login ?? '?'} ») : il ne ` +
        `compte pour rien — reposte-le par \`gh pr review --comment\`.`
    );
  }
  return dits;
}

/**
 * LE LECTEUR HÉRITÉ — celui de `caseRevues()` AVANT le correctif. Il est conservé ici comme
 * FIXTURE DE LA RÉGRESSION, et il n'est JAMAIS consulté pour juger quoi que ce soit : il sert aux
 * témoins de `tests/unit/gouvernance/revues-lecteur-unique.spec.ts` à montrer, sur les revues
 * réelles, ce que l'ancienne lecture cochait. Sans lui, « la garde a rougi » serait une
 * affirmation ; avec lui, c'est une mesure qui se rejoue à chaque suite (RM-02).
 *
 * Il ne lit ni `state`, ni `author_association`, ni `user.login` ; son motif d'en-tête accepte
 * n'importe quel numéro de poste ; sa clé est la lentille seule ; son discriminant `schema` est le
 * label. Ne rien y corriger : c'est le défaut, verbatim.
 */
export function lireRevuesHerite(entree: {
  revues: RevueBrute[];
  labels: readonly string[];
  tete: string;
}): { marque: string; detail: string } {
  const lentilles = [
    ...(entree.labels.includes('schema')
      ? ['exactitude', 'securite', 'schema']
      : ['exactitude', 'securite', 'simplicite']),
    'mutation',
  ];
  const dernier = new Map<string, { verdict: string; commit: string }>();
  for (const r of entree.revues) {
    const l = lentilles.find((x) =>
      new RegExp(`^A\\d{2}\\s*·\\s*${x}\\b`, 'im').test(r.body ?? '')
    );
    const v = /^Verdict\s*:\s*(accepte|refuse)\b/im.exec(r.body ?? '');
    if (!l || !v) continue;
    dernier.set(l, { verdict: v[1]!.toLowerCase(), commit: r.commit_id ?? '' });
  }
  const manquantes = lentilles.filter((l) => !dernier.has(l));
  const refusees = [...dernier.entries()].filter(([, d]) => d.verdict === 'refuse').map(([l]) => l);
  const perimees = [...dernier.entries()]
    .filter(([, d]) => d.verdict === 'accepte' && d.commit !== entree.tete)
    .map(([l, d]) => `${l} (jugé ${d.commit.slice(0, 7)})`);
  if (manquantes.length || refusees.length || perimees.length) {
    return {
      marque: '[ ]',
      detail: [
        manquantes.length ? `manquante(s) : ${manquantes.join(', ')}` : '',
        refusees.length ? `en refus : ${refusees.join(', ')}` : '',
        perimees.length ? `périmée(s) : ${perimees.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }
  return { marque: '[x]', detail: `les ${lentilles.length} lentilles ont accepté` };
}
