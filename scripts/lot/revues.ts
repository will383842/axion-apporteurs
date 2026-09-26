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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';

import { ANCRE_JOURNAL } from '../gates/gov-attributions';
import { cheminsDeLaTache } from './chemins-de-tache';
import { VUES_DERIVEES } from '../vues/vues';

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

/**
 * La lentille de l'architecte, nommée une fois (docs/CHARTE-AGENTS.md §6). Depuis la décision de
 * Will du 2026-09-26 (`W16`, `partners/ADR-0022`), `simplicite` et `mutation` ne sont plus exigées
 * d'aucune PR : la mutation est mesurée par Stryker (`pnpm mutation:pr`), pas par un agent.
 */
export const LENTILLE_SCHEMA = 'schema';

/**
 * LA LENTILLE DONT LA MATIÈRE EST LA PROSE : son accord ne survit à aucune réécriture (GOV-095,
 * voir `accordSurvit` plus bas).
 *
 * 🔴 ELLE EST DÉCLARÉE ICI, ET NON À CÔTÉ DE LA RÈGLE DE SURVIE. Le littéral était écrit DEUX fois
 * — dans `DEUX_PREMIERES` et dans la règle — et la lentille `securite` l'a relevé : renommer l'un
 * faisait cesser l'autre de mordre, dans le sens PERMISSIF. Une seule source, et elle précède ses
 * deux lecteurs : `DEUX_PREMIERES` est évalué au chargement du module, une déclaration plus bas
 * le ferait tomber en zone morte temporelle.
 */
export const LENTILLE_DE_LA_PROSE = 'exactitude';

const DEUX_PREMIERES = [LENTILLE_DE_LA_PROSE, 'securite'];

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

/**
 * ═══ UN ACCORD SURVIT À UN COMMIT QUI NE TOUCHE QUE LE JOURNAL (GOV-095) ══════════════════════
 *
 * 🔴 LE DÉFAUT, LU DANS CE FICHIER MÊME. La péremption comparait `x.commit !== entree.tete` : un
 * accord était lié au SHA DE LA TÊTE, jamais au CODE JUGÉ. Tout commit de plus périmait donc TOUS
 * les accords exigés, quel que soit ce qu'il change.
 *
 * LA MESURE QUI OUVRE LA RÈGLE — à rejouer, pas à recopier. Sur la branche
 * `t/gov-check-homonymie` de la demande de fusion 102, `git diff --name-only 8ef35a3 8891d53` ne
 * rend QUE `docs/journal/2026-09-pr-102.md` : une phrase de prose. Cette tête-là a pourtant périmé
 * les accords de `securite`, de `schema` et de `mutation`, qu'il a fallu refaire sur un code
 * identique au bit près. ⚠️ Ces deux sha ne sont cités par AUCUN témoin : la 102 a été écrasée à
 * la fusion, ses commits de branche ne sont ancêtres de rien, et un clone neuf ne les porte pas.
 *
 * LA RÈGLE, ÉTROITE EXPRÈS. Un accord rendu sur la lentille L au commit C survit à la tête T si,
 * ET SEULEMENT SI :
 *
 *   1. L n'est pas `exactitude` — cette lentille juge la PROSE, c'est sa matière, et son accord
 *      ne survit donc à aucun commit ;
 *   2. ET l'ensemble des fichiers changés entre C et T est VIDE, ou n'est fait que d'ENTRÉES PAR
 *      PR du journal — la forme `docs/journal/AAAA-MM-pr-<n>.md` (`ENTREE_DU_JOURNAL`), et RIEN
 *      d'autre du dossier : ni son mode d'emploi (`CONFIGURATION_DU_DOSSIER` dit pourquoi), ni le
 *      fichier mensuel, ni un fichier de lot ; et cette entrée est celle de LA PR JUGÉE, dont
 *      chaque titre ouvre SON entrée — voir `PrJugee`.
 *
 * ⚠️ C'EST UNE GARDE RENDUE PLUS PERMISSIVE, et c'est l'objection la plus forte qu'on puisse lui
 * opposer. La réponse tient en un point : TOUT CAS AMBIGU ÉCHOUE FERMÉ, et chacun a son témoin
 * dans `tests/unit/gouvernance/accord-survit-au-journal.spec.ts`.
 *
 *   — un diff que `git` ne peut pas calculer (commit inconnu du clone, sha malformé, `git` en
 *     échec) : `null`, donc PÉRIMÉ, et le refus le DIT au lieu de laisser croire à un delta vide ;
 *   — `docs/tasks.json` et `docs/requirements.json` : PÉRIMÉ. Ces fichiers CHANGENT LE
 *     COMPORTEMENT DE CETTE GARDE — `risqueDeLaPr()` y lit `zone`, `sensible`, `schema` et
 *     `paths`. Ce sont des sources, pas de la prose ;
 *   — une vue dérivée (`docs/PLAN-STATE.md`, `docs/TASKS.md`…) : PÉRIMÉ. Si une vue a changé,
 *     sa source a changé ;
 *   — un ADR, `docs/CONVENTIONS.md`, n'importe quel document normatif : PÉRIMÉ ;
 *   — `docs/journal/README.md` : PÉRIMÉ, bien qu'il soit sous le préfixe. Il porte le PLANCHER
 *     dont deux gardes bloquantes dérivent leur nombre — c'est une configuration, pas une entrée ;
 *   — tout AUTRE fichier du dossier qui n'a pas la forme d'une entrée par PR : PÉRIMÉ.
 *
 * 🔑 LE PRÉFIXE DÉSIGNE UNE ENTRÉE, PAS UN DOSSIER, et cette précision-là a coûté une revue :
 * `CONFIGURATION_DU_DOSSIER` porte la mesure et l'attaque.
 *
 * 🔑 ET AUCUN DE CES CAS N'EST ÉNUMÉRÉ DANS LE CODE. La liste blanche est UNE SEULE forme ancrée ;
 * tout le reste périme par construction. Une liste noire de documents normatifs laisserait passer
 * le prochain dossier créé — c'est exactement le raisonnement des listes blanches de
 * `CHEMINS_A_RISQUE_ORDINAIRE`, et il vaut ici à plus forte raison : là-bas un oubli fait relire
 * DAVANTAGE, ici il ferait relire MOINS.
 */

/** Le dossier du journal. Seules ses ENTRÉES PAR PR (`ENTREE_DU_JOURNAL`) ne jugent aucun code. */
export const CHEMIN_DU_JOURNAL = 'docs/journal/';

/**
 * ⛔ LE PRÉFIXE DÉSIGNE UNE ENTRÉE, PAS UN DOSSIER — et la prémisse était fausse d'un fichier.
 *
 * 🔴 LE DÉFAUT, MESURÉ PAR LA LENTILLE `securite` SUR LA TÊTE PRÉCÉDENTE DE CETTE PR. Le dossier
 * `docs/journal/` ne contient pas QUE de la prose : il contient aussi son propre mode d'emploi, et
 * ce mode d'emploi porte la ligne du PLANCHER — le numéro de PR sous lequel aucune tâche n'a
 * besoin d'être attestée. DEUX gardes bloquantes de `gate-a` en DÉRIVENT ce nombre, et rien ne le
 * borne :
 *
 *   — `gov:attributions` (`scripts/gates/gov-attributions.ts`) : le plancher est L'INTERRUPTEUR du
 *     journal, il EXEMPTE des tâches de toute attestation de lot (exemption `lot_sous_plancher`) ;
 *   — `gov:etat` (`scripts/gates/gov-etat.ts`) : sous le plancher, « PR fusionnée sans entrée de
 *     journal » se tait.
 *
 * L'ATTAQUE, DE BOUT EN BOUT. Accords posés au commit C, puis une tête T qui ne change QUE ce
 * nombre — forme toujours valide au regard de la ligne que les deux gardes lisent. Les deux gardes
 * s'éteignent, `securite`, `simplicite`, `schema` et `mutation` SURVIVENT, la case se coche, et le
 * `detail` publié affirme « le delta ne juge aucun code » : une phrase calculée et fausse.
 *
 * LE REMÈDE N'EST PAS UNE LISTE NOIRE. Un premier remède excluait ce seul fichier : il laissait
 * survivre tout le reste du dossier, dont le fichier mensuel que `gov:attributions` lit aussi. Le
 * remède tenu est une LISTE BLANCHE DE FORME (`ENTREE_DU_JOURNAL`) : ce README périme parce qu'il
 * n'a pas la forme d'une entrée, à n'importe quelle profondeur et quelle que soit sa casse — sans
 * qu'aucune ligne du code ne le nomme. Cette constante ne sert plus qu'à le DÉSIGNER aux témoins.
 *
 * ⚠️ CE QUI RESTE À SURVEILLER, ET QUI SE MESURE PAR UNE COMMANDE : si un jour une garde dérive
 * une donnée d'une ENTRÉE par PR autre que son titre d'entrée, la forme ne suffit plus. Rejouer :
 *
 *     git grep -n -e "docs/journal" -- scripts .github src
 */
export const CONFIGURATION_DU_DOSSIER = 'README.md';

/** Un accord survit, ou il périme — et dans les deux cas on sait DIRE pourquoi. */
export type Survie =
  | { survit: true; fichiers: string[] }
  | { survit: false; motif: string; fichiers: string[] | null };

/** Un accord qui a survécu à la tête : les faits qu'un lecteur doit pouvoir contester. */
export type Survivance = {
  code: string;
  lentille: string;
  /** Le commit sur lequel l'accord a été rendu. */
  commit: string;
  /** La tête à laquelle il survit. */
  tete: string;
  /**
   * Les fichiers changés entre les deux. Règle `journal` : tous des entrées par PR du journal, ou
   * aucun. Règle `patch` : ce que la fusion de la base a apporté, hors du diff propre à la PR.
   */
  fichiers: string[];
  /** La règle qui l'a fait survivre (GOV-095 : `journal` ; GOV-101 : `patch`). */
  regle: 'journal' | 'patch';
  /** Règle `patch` : l'empreinte du diff propre à la PR, égale sur les deux têtes. */
  empreinte?: string;
};

/** Un accord périmé, avec le motif et les fichiers qui l'ont périmé (`null` : diff incalculable). */
export type Peremption = {
  verdict: Verdict;
  motif: string;
  fichiers: string[] | null;
};

/**
 * ⛔ LA LISTE BLANCHE EST UNE FORME, PAS UNE EXCLUSION (second tour `securite`, revue 5307855596).
 * Exclure le seul README laissait survivre tout AUTRE fichier du dossier — et `gov:attributions`
 * lit TOUT fichier suivi de `docs/journal/` : le fichier MENSUEL (`2026-09.md`) porte les entrées
 * d'autres PR, qui attestent leurs lots ; un fichier de lot, de données ou un sous-dossier n'est
 * pas l'entrée d'UNE PR. En cas de doute on exclut : seule survit `docs/journal/AAAA-MM-pr-<n>.md`,
 * au premier niveau, casse exacte. Tout le reste périme — y compris ce qui n'existe pas encore.
 *
 * Le motif est ANCRÉ aux deux bouts et DÉRIVÉ de `CHEMIN_DU_JOURNAL` (RM-01) : ni `includes`
 * (`src/docs/journal/…` passerait), ni segment `..`, ni suffixe (`….md.bak`) ne s'y logent.
 */
export const ENTREE_DU_JOURNAL = new RegExp(
  '^' +
    CHEMIN_DU_JOURNAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    String.raw`\d{4}-\d{2}-pr-([1-9]\d*)\.md$`
);

/**
 * La PR jugée, vue par la règle de survie : son NUMÉRO, et de quoi lire une entrée À LA TÊTE.
 *
 * ⛔ TROISIÈME TOUR `securite` : la forme ne suffit pas. `gov:attributions` coupe TOUT fichier du
 * journal sur `COUPE_ETAT` et lit le numéro de chaque titre d'entrée comme l'attestation de CETTE
 * PR-là — elle ne lie pas un titre « PR #N » au fichier `…-pr-N.md`. Deux chemins ouvraient donc
 * l'attestation d'un AUTRE lot sous des accords survivants : réécrire l'entrée d'une autre PR, et
 * ajouter un titre d'une autre PR dans la sienne. D'où deux conditions de plus, toutes deux en
 * échec FERMÉ : le fichier est celui de la PR jugée (`numero` inconnu : rien ne survit), et chaque
 * ligne de titre de niveau ≥ 2 qu'il porte à la tête ouvre SON entrée (`ANCRE_JOURNAL` + numéro,
 * dérivé de la garde qui le lit). Une entrée illisible à la tête (supprimée, `git` en échec) : périmé.
 */
export type PrJugee = {
  numero: number | null;
  lire: (chemin: string) => string | null;
};

/** Le premier défaut d'une entrée au regard de la PR jugée, ou `null` si elle est bien la sienne. */
function defautDEntree(f: string, pr: PrJugee): string | null {
  const m = ENTREE_DU_JOURNAL.exec(f);
  if (m === null) return `${f} n’est pas une entrée par PR de \`${CHEMIN_DU_JOURNAL}\``;
  if (pr.numero === null) return `${f} : le numéro de la PR jugée est inconnu`;
  if (Number(m[1]) !== pr.numero) return `${f} est l’entrée d’une autre PR que la #${pr.numero}`;
  const texte = pr.lire(f);
  if (texte === null) return `${f} est illisible à la tête`;
  const titre = `${ANCRE_JOURNAL}${pr.numero} `;
  // Coupé aussi sur un `\r` SEUL : `gov:etat` le fait, et un titre caché derrière lui passerait
  // sinon pour la suite d'une ligne (dette `securite`, revue 5316791878).
  const intrus = texte.split(/\r\n|\r|\n/).find((l) => /^#{2,}/.test(l) && !l.startsWith(titre));
  return intrus === undefined
    ? null
    : `${f} porte un titre qui n’ouvre pas l’entrée de la #${pr.numero} : « ${intrus} »`;
}

/**
 * LA DÉCISION, PURE — aucun `git`, aucun système de fichiers, chaque branche testable. C'est la
 * même séparation que `estAncetreDe` plus haut : la mesure peut échouer, la règle non.
 */
export function accordSurvit(
  lentille: string,
  fichiers: readonly string[] | null,
  pr: PrJugee
): Survie {
  if (fichiers === null) {
    return {
      survit: false,
      fichiers: null,
      motif:
        'le diff entre le commit jugé et la tête n’a pas pu être mesuré (commit absent de ce ' +
        'clone, sha malformé, ou `git` en échec) : on ne fait pas survivre un accord sur une ' +
        'mesure qu’on n’a pas',
    };
  }
  if (lentille === LENTILLE_DE_LA_PROSE) {
    return {
      survit: false,
      fichiers: [...fichiers],
      motif:
        `la lentille ${LENTILLE_DE_LA_PROSE} juge la prose : c’est sa matière, et son accord ne ` +
        'survit donc à aucun commit, journal compris',
    };
  }
  const dehors = fichiers.map((f) => defautDEntree(f, pr)).filter((d): d is string => d !== null);
  if (dehors.length > 0) {
    return {
      survit: false,
      fichiers: [...fichiers],
      // « hors de `docs/journal/` » serait une phrase calculée et FAUSSE depuis que le mode
      // d'emploi du dossier périme : il est SOUS le préfixe, et il ne juge pas rien. Le motif dit
      // donc ce que la règle mesure vraiment — ce qui n'est pas une ENTRÉE — et le nomme.
      motif:
        `${dehors.length} fichier(s) changé(s) qui ne sont pas l’entrée de la PR jugée : ` +
        dehors.join(' ; '),
    };
  }
  return { survit: true, fichiers: [...fichiers] };
}

/**
 * Le texte d'un fichier À LA TÊTE, par `git show <tete>:<chemin>`. Échoue FERMÉ : toute erreur
 * (fichier supprimé, commit absent, sha malformé) rend `null`, qui périme l'accord.
 *
 * 🔴 SEUL UN FICHIER ORDINAIRE SE LIT (veto `securite`, revue 5316791878). Pour un lien
 * symbolique (mode 120000), `git show` rend la CIBLE du lien, pas le contenu que `gov:etat` et
 * `gov:attributions` lisent en le suivant : une entrée devenue lien vers l'entrée d'une autre PR
 * aurait fait survivre les accords. Le mode de CE SEUL objet est lu par `git cat-file
 * --batch-check=%(objectmode)` — une consultation, pas une énumération de l'arbre : celle-ci
 * n'appartient qu'à `fichiers-suivis.ts` (REQ-CPL-018). Tout autre mode que 100644 (lien,
 * exécutable, sous-module), un objet absent ou un git qui ne connaît pas l'atome rendent `null`.
 */
export function contenuALaTete(tete: string, chemin: string, cwd?: string): string | null {
  const t = tete.trim();
  if (!/^[0-9a-f]{7,40}$/.test(t) || !ENTREE_DU_JOURNAL.test(chemin)) return null;
  try {
    const mode = execFileSync('git', ['cat-file', '--batch-check=%(objectmode)'], {
      encoding: 'utf8',
      input: `${t}:${chemin}\n`,
      stdio: ['pipe', 'pipe', 'ignore'],
      ...(cwd === undefined ? {} : { cwd }),
    });
    if (mode.trim() !== '100644') return null;
    return execFileSync('git', ['show', `${t}:${chemin}`], {
      encoding: 'utf8',
      maxBuffer: 64e6,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(cwd === undefined ? {} : { cwd }),
    });
  } catch {
    return null;
  }
}

/**
 * LA MESURE, séparée de la décision. `git diff --name-only` entre les deux ARBRES : la question
 * n'est pas « que s'est-il passé entre les deux », c'est « le code jugé est-il celui qui sera
 * fusionné ». Elle échoue FERMÉ — toute erreur rend `null`, jamais une liste vide, qui se lirait
 * « rien n'a changé ».
 *
 * ⚠️ `--no-renames` EST DÉLIBÉRÉ, et il ferme DEUX sens, pas un. Avec la détection de renommage —
 * active par défaut depuis git 2.9 — un renommage n'est rendu que par sa DESTINATION :
 *
 *   — un fichier SORTI du journal ne serait rendu que par sa destination hors du journal : la
 *     règle verrait le fichier arriver, jamais partir ;
 *   — et c'est l'autre sens qui MORD VRAIMENT : `docs/CONVENTIONS.md` déplacé VERS
 *     `docs/journal/x.md` ne serait rendu que par `docs/journal/x.md`, donc « entièrement sous le
 *     journal », donc l'accord SURVIVRAIT À LA SUPPRESSION D'UN DOCUMENT NORMATIF.
 *
 * Sans la détection, les DEUX chemins sont rendus dans les deux cas. Témoin : « un RENOMMAGE rend
 * ses DEUX chemins ».
 *
 * `-z` parce que `git` CITE les chemins non-ASCII (`"docs/journal/\303\251.md"`) : un chemin cité
 * ne commencerait plus par le préfixe du journal et se lirait « hors journal » — fermé, donc sans
 * danger, mais pour la mauvaise raison. La forme NUL est la forme brute.
 *
 * `cwd` n'existe que pour le témoin, qui construit un VRAI dépôt git jetable : la mesure ne se
 * prouve pas contre une simulation de `git`. Même précaution que le paramètre `chemin` de
 * `codesDePoste`.
 */
export function fichiersEntre(accord: string, tete: string, cwd?: string): string[] | null {
  const a = accord.trim();
  const t = tete.trim();
  if (!/^[0-9a-f]{7,40}$/.test(a) || !/^[0-9a-f]{7,40}$/.test(t)) return null;
  try {
    const sortie = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', a, t], {
      encoding: 'utf8',
      maxBuffer: 64e6,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(cwd === undefined ? {} : { cwd }),
    });
    return sortie.split('\0').filter((f) => f !== '');
  } catch {
    return null;
  }
}

/**
 * ═══ UN ACCORD SURVIT À UNE FUSION DE LA BASE QUI NE CHANGE PAS LE PATCH (GOV-101) ═════════════
 *
 * 🔴 LE DÉFAUT MESURÉ (orchestrateur, 2026-09-26) : près de la moitié des tours de relecture ne
 * corrigeaient rien. Le premier motif : fusionner `main` dans une PR — pour lever un conflit de vue,
 * ou parce qu'une autre PR a atterri — change la tête, et la règle du journal (ci-dessus) périmait
 * tous les accords, alors que le code que la PR APPORTE n'avait pas bougé d'un octet.
 *
 * LA RÈGLE. Un accord rendu sur C survit à la tête T si l'EMPREINTE DU DIFF PROPRE À LA PR est la
 * même sur les deux : `git patch-id --stable` de `git diff <merge-base(base, X)> X`, pour X = C
 * puis X = T, restreint aux fichiers de la PR HORS VUES DÉRIVÉES (`VUES_DERIVEES`), et complété du
 * résumé des créations, suppressions et changements de mode (`--summary`), que `patch-id` ignore.
 * Le diff part de la BASE DE FUSION : ce que `main` a apporté entre-temps n'y est pas, ce que la PR
 * apporte y est tout entier. La lentille `exactitude` suit la MÊME règle : l'entrée de journal et
 * toute la prose de la PR sont DANS ce diff — un patch identique, c'est une prose identique.
 *
 * CE QUI PÉRIME, PAR CONSTRUCTION ET SANS CAS À ÉNUMÉRER :
 *   — une ligne changée dans un fichier de la PR : le patch change ;
 *   — un conflit résolu en modifiant une ligne de la PR, ou en y reprenant le côté de `main` : le
 *     diff depuis la nouvelle base de fusion n'est plus le même ;
 *   — un changement voisin d'un morceau de la PR (moins de trois lignes) : le CONTEXTE entre dans
 *     l'empreinte. C'est délibéré — sans contexte, DÉPLACER une ligne de garde dans le même fichier
 *     gardait la même empreinte ;
 *   — un mode, une création, une suppression : le résumé entre dans l'empreinte.
 *
 * ÉCHEC FERMÉ : un sha malformé ou absent du clone, une base introuvable, un diff VIDE, `git` en
 * échec rendent `null`, et `null` ne survit jamais. Les vues exclues ne relâchent rien : chacune a
 * son vérificateur en porte A, et sa SOURCE est dans l'empreinte.
 */
export const BASE_DE_L_EMPREINTE = 'origin/main';

export function empreinteDuPatch(
  sha: string,
  o: { base?: string; cwd?: string } = {}
): string | null {
  const t = sha.trim();
  const base = o.base ?? BASE_DE_L_EMPREINTE;
  if (!/^[0-9a-f]{7,40}$/.test(t) || !/^[A-Za-z0-9][A-Za-z0-9._/~^-]*$/.test(base)) return null;
  const opts = {
    encoding: 'utf8' as const,
    maxBuffer: 256e6,
    ...(o.cwd === undefined ? {} : { cwd: o.cwd }),
  };
  const lire = (args: string[], input?: string): string =>
    execFileSync('git', args, {
      ...opts,
      ...(input === undefined ? {} : { input }),
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
    });
  try {
    const mb = lire(['merge-base', base, t]).trim();
    if (!/^[0-9a-f]{40}$/.test(mb)) return null;
    const perimetre = ['--', ':(top)', ...VUES_DERIVEES.map((v) => `:(top,exclude)${v.chemin}`)];
    const options = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-renames',
      '--no-color',
      '--no-ext-diff',
    ];
    const diff = lire([...options, '--binary', mb, t, ...perimetre]);
    if (diff.trim() === '') return null;
    const id = lire(['patch-id', '--stable'], diff).trim().split(/\s+/)[0] ?? '';
    if (!/^[0-9a-f]{40}$/.test(id)) return null;
    const resume = lire([...options, '--summary', mb, t, ...perimetre]);
    return createHash('sha1').update(`${id}\n${resume}`).digest('hex');
  } catch {
    return null;
  }
}

/**
 * LA PHRASE QUI REND UNE SURVIE CONTESTABLE, dérivée une seule fois (RM-01). Une survie
 * silencieuse est invisible, donc inauditable : `gov:pr` l'imprime, et le corps publié la porte.
 * Les cinq faits y sont — le poste, la lentille, les deux sha, et LA LISTE DES FICHIERS — pour
 * qu'un lecteur puisse contester la survie sans relire le code.
 */
export function direLaSurvivance(s: Survivance): string {
  const debut =
    `${s.code} · ${s.lentille} a accepté sur ${s.commit.slice(0, 7)} et SURVIT à la tête ` +
    `${s.tete.slice(0, 7)} : `;
  if (s.regle === 'patch') {
    return (
      debut +
      `le diff propre à la PR est identique sur les deux têtes (empreinte ` +
      `${(s.empreinte ?? '').slice(0, 12)}, vues dérivées exclues) ; les ${s.fichiers.length} ` +
      `fichier(s) qui les séparent viennent de la base fusionnée`
    );
  }
  return (
    debut +
    (s.fichiers.length === 0
      ? 'les deux arbres sont identiques, aucun fichier ne les sépare'
      : // « entièrement sous `docs/journal/` » serait plus large que ce qui a été mesuré : le
        // mode d'emploi et le fichier mensuel y sont aussi, et ils périment. La phrase dit ce qui a
        // été vérifié — des ENTRÉES PAR PR — et les nomme toutes, pour qu'on puisse la contester.
        `le delta n’est fait que d’entrées par PR de \`${CHEMIN_DU_JOURNAL}\` — ${s.fichiers.join(', ')}`)
  );
}

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
  /**
   * Les accords rendus sur une autre tête que celle qui sera fusionnée (pas 5 du protocole) ET
   * qui n'y survivent pas (GOV-095). PROJECTION de `peremptions`, jamais une seconde liste : deux
   * listes de la même chose divergent, et c'est celle qui est lue qui n'a pas été corrigée (RM-01).
   */
  perimees: Verdict[];
  /** Les accords périmés AVEC leur motif et les fichiers qui l'ont causé (GOV-095). */
  peremptions: Peremption[];
  /** Les accords rendus sur une autre tête et qui y SURVIVENT — imprimés, jamais tus (GOV-095). */
  survivantes: Survivance[];
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
  /**
   * LA MESURE DU DELTA entre le commit jugé et la tête (GOV-095) — `fichiersEntre` par défaut,
   * c'est-à-dire le vrai `git` du clone courant. Injectable pour que les témoins fassent varier
   * le delta SEUL, sans construire un dépôt par cas (RM-11 : ce que le test fait varier n'a
   * jamais de valeur par défaut — le témoin le passe toujours).
   */
  fichiersEntre?: (accord: string, tete: string) => string[] | null;
  /**
   * Le NUMÉRO de la PR jugée (GOV-095, troisième tour `securite`) : seule SON entrée du journal
   * laisse survivre un accord. Absent ou `null` : aucune entrée n'est la sienne, rien ne survit.
   */
  numero?: number | null;
  /** Le texte d'un fichier À LA TÊTE — `contenuALaTete` par défaut. Injectable pour les témoins. */
  lireALaTete?: (tete: string, chemin: string) => string | null;
  /**
   * L'EMPREINTE DU DIFF PROPRE À LA PR sur un commit (GOV-101) — `empreinteDuPatch` par défaut,
   * contre `origin/main`. Injectable pour que les témoins fassent varier l'empreinte SEULE.
   */
  empreinteDuPatch?: (sha: string) => string | null;
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
  /**
   * Le statut de la tâche au registre. Ajouté par GOV-096 : le champ `Lot:` est le seul endroit
   * où un identifiant ARBITRAIRE entre dans la dérivation, et une PR ne rouvre pas une tâche déjà
   * LIVRÉE. Absent ou `null` : on ne refuse pas — un champ absent ne prouve pas qu'une tâche est
   * livrée. C'est le seul sens où l'absence puisse être permissive sans ouvrir quoi que ce soit :
   * la tâche reste confrontée aux deux autres refus, l'inconnue et le `pr` divergent.
   */
  statut?: string | null;
  /**
   * Les fichiers que la tâche DÉCLARE (`paths` ∪ `tests{}`, lus par `cheminsDeLaTache()`). Ajoutés
   * par GOV-097 : la sensibilité suit le FICHIER — un fichier déclaré par une tâche sensible élève
   * la PR qui le touche, quelle que soit la tâche de son titre (`fichiersDesTachesAElever`).
   */
  paths?: string[];
  tests?: Record<string, string[]> | null;
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
 *
 * 🔴 TROISIÈME TERME DE L'UNION, GOV-096 — MESURÉ LE 2026-09-23 SUR LA PR #114. Les deux termes
 * ci-dessus ne savent pas lire une PR de LOT, qui est pourtant la forme NORMALE de ce dépôt
 * (`docs/CONVENTIONS.md` §5 : « un lot, une branche, une PR, un commit par tâche »). La PR #114
 * porte six tâches ; son titre ne peut en nommer qu'une, et `t.pr` n'est écrit que par
 * `pnpm lot:cloture`, qui exige `fusion.atterri === true` — donc APRÈS la fusion. Les cinq autres
 * tâches ne résolvent ni par l'un ni par l'autre : `fichier_hors_paths_des_taches` nommait douze
 * fichiers « qu'aucune de ses tâches ne déclare » quand neuf étaient déclarés par ces cinq-là.
 * Aucune PR de lot n'était donc fusionnable, et le lot est la seule forme qui divise le coût du
 * protocole.
 *
 * ⚠️ LE NIVEAU DE CONFIANCE NE CHANGE PAS, et c'est l'argument qu'il faut peser plutôt que
 * l'impression de laxisme. Le TITRE est déjà écrit par l'auteur de la PR, et la garde le croit
 * depuis le premier jour : c'est lui qui résout la tâche dont les `paths` autorisent des fichiers.
 * `Lot:` est exactement aussi fiable — même auteur, même corps de PR, même absence de
 * contreseing —, et il est EXPLICITE et AUDITABLE là où le titre est implicite. Ce qu'on ajoute
 * n'est pas un pouvoir neuf, c'est la même déclaration rendue lisible ; et elle est bornée par
 * trois refus que le titre, lui, n'a jamais eus : un identifiant inconnu du registre, un
 * identifiant déjà livré, un identifiant qui porte un `pr` différent (`resoudreLeLot`).
 */
export function tachesDeLaPr<T extends TacheDeLaPr>(
  taches: readonly T[],
  pr: number | null,
  idDuTitre: string | null,
  idsDuLot: readonly string[] = []
): T[] {
  const duLot = new Set(idsDuLot);
  return taches.filter(
    (t) =>
      (pr !== null && t.pr === pr) || (idDuTitre !== null && t.id === idDuTitre) || duLot.has(t.id)
  );
}

/** Cette PR touche-t-elle au schéma PAR SES TÂCHES ? Un des trois signaux de `toucheSchema()`. */
export function tachesSchemaDeLaPr<T extends TacheDeLaPr>(
  taches: readonly T[],
  pr: number | null,
  idDuTitre: string | null,
  idsDuLot: readonly string[] = []
): boolean {
  return tachesDeLaPr(taches, pr, idDuTitre, idsDuLot).some((t) => t.schema === true);
}

// ── LE CHAMP `Lot:` DU CORPS DE PR (GOV-096) ──────────────────────────────────────────────────

/**
 * LE CHAMP `Lot:` DU GABARIT, section Identité. Une ligne, au ras de la marge, portant les
 * identifiants de tâche séparés par des VIRGULES — ou vide, pour une PR à une seule tâche.
 *
 * Le motif s'arrête à la fin de la ligne et ne mange pas le saut : un champ qui déborderait sur la
 * ligne suivante avalerait le texte libre du corps.
 */
export const MOTIF_LIGNE_LOT = /^Lot:[^\S\r\n]*(.*)$/m;

/**
 * LA FORME D'UN IDENTIFIANT TEL QUE CE CHAMP L'ACCEPTE. Elle ne juge PAS qu'une tâche existe —
 * c'est le registre qui le dit, et lui seul (RM-01) : elle ne fait qu'isoler ce qui est un jeton
 * d'identifiant de ce qui est un séparateur non prévu. `GOV-046 GOV-048` (espace), `GOV-046;` ou
 * `GOV-046 (lot L0-02)` sortent ici, en étant NOMMÉS.
 */
const MOTIF_JETON_DE_LOT = /^[A-Za-z0-9-]+$/;

/** Ce que le champ `Lot:` d'un corps de PR déclare — et ce qui empêche de le lire. */
export type LectureDuLot = {
  /** Le corps porte-t-il la ligne ? Un champ ABSENT n'est pas un champ VIDE. */
  present: boolean;
  /** Les identifiants lus, dans l'ordre du champ. VIDE dès que la forme est refusée. */
  ids: string[];
  /**
   * Ce qui rend le champ illisible, ou `null`. 🔴 IL N'EXISTE PAS DE TROISIÈME ÉTAT : un champ
   * rempli qu'on ne sait pas lire rend une liste vide ET un motif. Rendre la liste vide SEULE
   * serait dire « cette PR ne porte aucun lot » à propos d'une PR qui en déclare un — c'est
   * GOV-082, « une liste vide rendue avec le code zéro n'est pas une réponse ».
   */
  malForme: string | null;
};

/** Lit le champ `Lot:` d'un corps de PR. Aucune I/O, aucun registre : la FORME seulement. */
export function lireLeLot(corps: string): LectureDuLot {
  const m = MOTIF_LIGNE_LOT.exec(corps ?? '');
  if (m === null) return { present: false, ids: [], malForme: null };
  const valeur = (m[1] ?? '').trim();
  if (valeur.length === 0) return { present: true, ids: [], malForme: null };
  const jetons = valeur.split(',').map((j) => j.trim());
  const vides = jetons.filter((j) => j.length === 0).length;
  if (vides > 0) {
    return {
      present: true,
      ids: [],
      malForme:
        `« ${valeur} » — ${vides} séparateur(s) sans identifiant (virgule en trop, en tête ou en ` +
        `fin). La forme attendue est « GOV-046, GOV-048 » : des identifiants de tâche séparés par ` +
        `des virgules, ou un champ vide pour une PR à une seule tâche.`,
    };
  }
  const horsForme = jetons.filter((j) => !MOTIF_JETON_DE_LOT.test(j));
  if (horsForme.length > 0) {
    return {
      present: true,
      ids: [],
      malForme:
        `« ${valeur} » — séparateur inattendu : ${horsForme.map((j) => `« ${j} »`).join(', ')} ` +
        `n'est pas un identifiant de tâche. Le SEUL séparateur est la virgule ; ni l'espace, ni le ` +
        `point-virgule, ni une parenthèse de commentaire ne le remplacent.`,
    };
  }
  return { present: true, ids: jetons, malForme: null };
}

/** Un refus de lecture du champ `Lot:`, nommé par la famille que la garde imprimera. */
export type RefusDuLot = { famille: string; message: string };

/**
 * LE CHAMP `Lot:` CONFRONTÉ AU REGISTRE — et les trois refus qui le bornent (GOV-096).
 *
 * `ids` ne contient QUE ce qui a passé les trois : un identifiant refusé n'élargit rien. Le sens
 * de défaillance reste donc FERMÉ — un `Lot:` douteux ne peut jamais autoriser un fichier de plus.
 *
 * ⚠️ `deux_pr_meme_tache` EST LE NOM QUE `gov:etat` DONNE DÉJÀ À CETTE RÈGLE (REQ-GOV-007,
 * `scripts/gates/gov-etat.ts`), et il est REPRIS ici plutôt que doublé : une seule règle, un seul
 * nom (`partners/ADR-0011`). Les deux gardes l'observent sur deux POPULATIONS que ni l'une ni
 * l'autre ne peut voir à la place de sa jumelle — `gov:etat` compare les TITRES de toutes les PR
 * OUVERTES de la forge ; ici on confronte le champ `pr` du REGISTRE à la PR qu'on est en train de
 * juger, sur une population d'une seule PR et sans aucun appel réseau. Fusionner les deux lectures
 * demanderait à la garde d'une PR de lister la forge, c'est-à-dire d'ouvrir une seconde source là
 * où ce fichier existe pour n'en avoir qu'une.
 */
export function resoudreLeLot<T extends TacheDeLaPr>(e: {
  corps: string;
  /** Le numéro de LA PR jugée — `null` si on ne le connaît pas (événement `pull_request`). */
  numero: number | null;
  taches: readonly T[];
  /** Les statuts qui valent « livrée », DÉRIVÉS du barème unique de `scripts/lot/avancement.ts`. */
  livrees: ReadonlySet<string>;
}): { ids: string[]; refus: RefusDuLot[] } {
  const lu = lireLeLot(e.corps);
  if (lu.malForme !== null) {
    return {
      ids: [],
      refus: [
        {
          famille: 'lot_mal_forme',
          message:
            `Corps de la PR — le champ \`Lot:\` ne se lit pas : ${lu.malForme} Tant qu'il est ` +
            `illisible, les tâches qu'il déclare ne résolvent pas, et leurs \`paths\` n'autorisent ` +
            `rien — la garde refuse plutôt que de rendre une liste vide en silence.`,
        },
      ],
    };
  }
  const refus: RefusDuLot[] = [];
  const ids: string[] = [];
  const vus = new Set<string>();
  for (const id of lu.ids) {
    if (vus.has(id)) continue;
    vus.add(id);
    const t = e.taches.find((x) => x.id === id);
    if (!t) {
      refus.push({
        famille: 'lot_tache_inconnue',
        message:
          `Corps de la PR — le champ \`Lot:\` cite ${id}, qui n'est une tâche d'aucun registre lu. ` +
          `Un identifiant que personne ne connaît ne déclare aucun \`paths\` : la garde le REFUSE ` +
          `au lieu de l'ignorer, faute de quoi une faute de frappe élargirait le lot en silence.`,
      });
      continue;
    }
    if (t.statut != null && e.livrees.has(t.statut)) {
      refus.push({
        famille: 'lot_tache_livree',
        message:
          `Corps de la PR — le champ \`Lot:\` cite ${id}, dont le statut est « ${t.statut} » : elle ` +
          `est déjà livrée. Une PR ne rouvre pas une tâche livrée — si le travail reste à faire, ` +
          `c'est une tâche NEUVE qui se verse (charte A11), pas une livrée qu'on réutilise.`,
      });
      continue;
    }
    if (t.pr != null && e.numero !== null && t.pr !== e.numero) {
      refus.push({
        famille: 'deux_pr_meme_tache',
        message:
          `Corps de la PR — le champ \`Lot:\` cite ${id}, que le registre rattache déjà à la PR ` +
          `#${t.pr}, alors qu'on juge la PR #${e.numero}. Deux PR ne se disputent pas une tâche ` +
          `(REQ-GOV-007) : ou bien le champ \`pr\` du registre est faux, ou bien ce \`Lot:\` ` +
          `revendique le travail d'une autre PR.`,
      });
      continue;
    }
    ids.push(id);
  }
  return { ids, refus };
}

// ── LE RISQUE D'UNE PR (GOV-077, GOV-097) — IL NE COMPTE PLUS DE LENTILLE (GOV-101) ─────────

/**
 * ⚠️ DEPUIS LA DÉCISION DE WILL DU 2026-09-26 (`W16`, `partners/ADR-0022`, GOV-101), LE RISQUE NE
 * COMPTE PLUS DE LENTILLE : deux partout (`lentillesExigees`), plus `schema` sur une PR de schéma.
 * Il reste calculé ici, publié par `direLeRisque`, et c'est son signal `schema` qui appelle
 * l'architecte. Ce qui suit décrit la frontière telle que GOV-097 l'a tracée ; elle ne décide plus
 * que de ce que le relecteur `securite` lit en tête du corps.
 *
 * LA RELECTURE SE PROPORTIONNAIT AU RISQUE — décisions de Will du 2026-09-18 (`partners/ADR-0012`)
 * puis du 2026-09-25 (`partners/ADR-0021`, GOV-097) : quatre lentilles seulement pour l'argent,
 * la sécurité et les données ; deux (`exactitude`, `securite`) pour tout le reste.
 *
 * POURQUOI LA RÈGLE A CHANGÉ. Celle du 2026-09-18 prouvait l'ordinaire par deux listes BLANCHES
 * (zones `gouvernance`/`qualite`, chemins `docs/`/`scripts/`/`tests/`) : toute tâche d'une autre
 * zone, et toute PR qui touchait `src/`, montait à quatre lentilles — et chaque refus fait relire
 * les quatre (le coût mesuré est dans `partners/ADR-0021`, pas ici : un nombre vieillit). La
 * décision retourne la question : on ne prouve plus qu'une PR est ANODINE, on cherche si elle
 * touche l'argent, la sécurité ou les données.
 *
 * LA RÈGLE — ÉLEVÉ SI ET SEULEMENT SI L'UN DE CES SIGNAUX EST PRÉSENT :
 *
 *   1. une tâche de la PR (`tachesDeLaPr`, titre ∪ champ `pr` ∪ `Lot:`), lue sur la TÊTE et sur la
 *      BASE — la plus haute l'emporte —, porte :
 *        — un `sensible` NON VIDE (argent, attribution, auth, espace, rgpd : l'argent, la sécurité
 *          et les données), ou ABSENT : un champ absent ne prouve rien ;
 *        — `schema: true` ;
 *        — une `zone` de `ZONES_A_RISQUE_ELEVE`, ou une `zone` ABSENTE, ou une `zone` que le schéma
 *          du registre ne déclare pas (`zonesDuRegistre`) : une valeur imprévue n'est rien prouvé ;
 *   2. le label `schema`, ou un chemin de schéma (`toucheSchema`, dérivé de la charte §7) ;
 *   3. un fichier dans une zone sensible du code (`fichierEnZoneSensible`), ou un fichier du code
 *      produit (`src/`) qu'une tâche QUELCONQUE du registre, sensible, déclare
 *      (`fichiersDesTachesAElever`) : la sensibilité suit le fichier, pas seulement la tâche du titre ;
 *   4. un fichier du PROCESSUS (`fichierDuProcessus`) : la garde des revues, la CI, un dossier
 *      caché ou un fichier de configuration à la racine, `config/`. Ces fichiers peuvent désarmer
 *      les gardes elles-mêmes : c'est la sécurité du processus, et elle reste à quatre lentilles ;
 *   5. un diff vide, une liste de fichiers incomplète (`listeIncomplete`), aucune tâche résolue,
 *      un registre de base illisible — ÉCHEC FERMÉ : ce qu'on ne sait pas lire n'est pas ordinaire.
 *
 * CE QUI CESSE D'ÉLEVER : une zone autre que l'argent et la sécurité (`espace`, `juridique`,
 * `integration`, `domaine`… avec `sensible: []`), et un fichier de code produit hors des zones
 * sensibles.
 *
 * ⚠️ LIMITE DÉCLARÉE — LES DONNÉES SE LISENT PAR `sensible`, ET LE REGISTRE PEUT MENTIR PAR OMISSION.
 * `partners/ADR-0012` avait mesuré huit tâches vivantes qui manipulent des données personnelles avec
 * `sensible: []` (INT-T09, INT-T10, INT-T11, INT-T13, JUR-T09, UX-P1-07, UX-P3-03, EXT-T05) : la
 * liste blanche de zones les rattrapait, cette règle ne les rattrape que si leurs fichiers tombent
 * dans une zone sensible. Le remède est au registre (`rgpd` sur ces tâches), pas ici :
 * `partners/ADR-0021` le nomme en dette.
 */
export const ZONES_A_RISQUE_ELEVE: readonly string[] = ['argent', 'securite'];

/**
 * LES ZONES SENSIBLES QUE REQ-GOV-011 NOMME pour la section « Attaque » — PAR LEUR NOM, jamais par
 * un préfixe de chemin. Elles vivaient dans `scripts/gates/gov-pr.ts` ; elles vivent ici parce que
 * le risque les lit aussi, et deux copies divergent (RM-01).
 *
 * 🔴 LE DÉCLENCHEUR PAR ZONE A ÉTÉ MORT, mesuré le 2026-09-16 sur la PR 46 : il comparait le DÉBUT
 * du chemin à `commissions/`, `attributions/`, `auth/`, `espace/`, et aucun fichier suivi ne
 * commence par l'un d'eux — le code vit sous `src/`. GOV-078 l'a fait lire par SEGMENT ; la lecture
 * est désormais `segmentsNommesTouches()`, ci-dessous, la même pour l'Attaque et pour le risque.
 */
export const ZONES_SENSIBLES: readonly string[] = ['commissions', 'attributions', 'auth', 'espace'];

/**
 * LES SEGMENTS DE CHEMIN QUI DÉSIGNENT L'ARGENT, LA SÉCURITÉ ET LES DONNÉES dans le code — la liste
 * du RISQUE (GOV-097). Elle DÉRIVE de `ZONES_SENSIBLES` et l'élargit de ce que le code du dépôt et les
 * `paths` du registre nomment pour l'argent (`commission`, `argent`, `grille`), la sécurité
 * (`securite`, `acces`, `roles`, `proxy`, `env`, `webhooks`) et les données (`donnees-personnelles`,
 * `pii`). Lue par `segmentsNommesTouches()` fichier COMPRIS : `src/proxy.ts`, `src/lib/env.ts`.
 *
 * La section « Attaque » garde la liste étroite (`ZONES_SENSIBLES`, répertoires seuls) : l'élargir
 * change ce que REQ-GOV-011 exige, et ce n'est pas la décision de Will du 2026-09-25.
 */
export const SEGMENTS_DES_ZONES_SENSIBLES: readonly string[] = [
  ...ZONES_SENSIBLES,
  'commission',
  'attribution',
  'argent',
  'grille',
  'securite',
  'acces',
  'roles',
  'proxy',
  'env',
  'webhooks',
  'donnees-personnelles',
  'pii',
  // Refus `securite` du 2026-09-25 (motif 1) : les fichiers FUTURS de session, de chiffrement, du
  // cloisonnement de RM-05 et le middleware de Next ressortaient ordinaires par leur seul nom.
  'session',
  'sessions',
  'crypto',
  'chiffrement',
  'cloisonnement',
  'middleware',
];

/**
 * LES DÉCORATIONS DE SEGMENT DU ROUTEUR DE NEXT, en tête : slot `@x`, interceptions `(.)x`,
 * `(..)x`, `(...)x` — répétées, `(..)(..)x` —, attrape-tout `[...x]` et `[[...x]]`, dynamique
 * `[x]`, groupe `(x)`. L'interception passe AVANT le groupe : `(.)` n'ouvre pas un groupe.
 */
const DECORATIONS_DE_TETE = /^(?:@|\(\.{1,3}\)|\[{1,2}(?:\.{3})?|\()+/;
const DECORATIONS_DE_QUEUE = /[)\]]+$/;

/**
 * Un segment de chemin, débarrassé de ce qui l'habille sans le nommer (`DECORATIONS_DE_TETE`, puis
 * les `)` et `]` de queue) ; en minuscules. L'UNIQUE endroit : l'Attaque et le risque le lisent
 * tous deux par `segmentsNommesTouches()`.
 *
 * 🔴 IL NE RETIRAIT QUE `(`/`[` EN TÊTE (refus `securite` du 2026-09-25, motif 2) : `[...auth]`,
 * `[[...auth]]`, `@auth` et `(.)auth` ressortaient ordinaires, et la section « Attaque » ne les
 * voyait pas, alors que `[auth]` était élevé.
 */
export function nuDuSegment(segment: string): string {
  return segment.toLowerCase().replace(DECORATIONS_DE_TETE, '').replace(DECORATIONS_DE_QUEUE, '');
}

/**
 * LA LECTURE PAR SEGMENT — UNE SEULE, pour la section « Attaque » (`zonesSensiblesTouchees`,
 * `scripts/gates/gov-pr.ts`, liste `ZONES_SENSIBLES`) et pour le risque (`fichierEnZoneSensible`,
 * liste `SEGMENTS_DES_ZONES_SENSIBLES`). Un segment répond s'il est, nu, dans `noms`, à n'importe
 * quelle profondeur. `fichierCompris` : le dernier segment — le nom du fichier, avec et sans
 * extension — est-il lu aussi ? Rend le chemin RÉEL jusqu'au segment qui a répondu (`sous`).
 */
export function segmentsNommesTouches(
  fichiers: readonly string[],
  noms: readonly string[],
  { fichierCompris }: { fichierCompris: boolean }
): { zone: string; sous: string }[] {
  const vues = new Map<string, { zone: string; sous: string }>();
  for (const f of fichiers) {
    const segments = f.split('/');
    const dernier = segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
      if (i === dernier && !fichierCompris) continue;
      const nu = nuDuSegment(segments[i]!);
      // Le nom de fichier se lit aussi SANS son extension, redénudé : `[...auth].ts` → `auth`.
      const lus = i === dernier ? [nu, nuDuSegment(nu.replace(/\..*$/, ''))] : [nu];
      const zone = lus.find((l) => noms.includes(l));
      if (zone === undefined) continue;
      const sous = segments.slice(0, i + 1).join('/');
      vues.set(sous, { zone, sous });
    }
  }
  return [...vues.values()].sort((a, b) => a.sous.localeCompare(b.sous));
}

/**
 * LES DOSSIERS DU PROCESSUS, hors racine et hors dossiers cachés (qui le sont tous) : `config/`
 * porte `config/exemptions-corps-publie.json`, le seul fichier du dépôt qui puisse ABSOUDRE un
 * rouge bloquant (charte §7).
 */
export const DOSSIERS_DU_PROCESSUS: readonly string[] = ['config/'];

/** Le schéma du registre des tâches — le risque y lit les zones déclarées, il est donc de la garde. */
export const CHEMIN_SCHEMA_DES_TACHES = 'scripts/lot/tasks.schema.json';

/**
 * LES RACINES DE LA GARDE DES REVUES : le lecteur unique et ses deux appelants.
 */
export const RACINES_DE_LA_GARDE_DES_REVUES: readonly string[] = [
  'scripts/lot/revues.ts',
  'scripts/gates/gov-pr.ts',
  'scripts/lot/corps-de-pr.ts',
];

let gardeEnCache: readonly string[] | null = null;

/**
 * LA GARDE DES REVUES ELLE-MÊME est toujours de risque élevé, même sous `scripts/` ou `docs/` :
 * sinon une PR ordinaire, relue par deux lentilles, pourrait affaiblir la règle qui décide combien
 * de lentilles relisent toutes les autres.
 *
 * 🔴 ELLE ÉTAIT UNE LISTE DE CINQ CHEMINS, ET LA GATE EN EXÉCUTE DAVANTAGE (dette 1 de la lentille
 * `securite`, second tour de la PR 64) : `scripts/lot/avancement.ts` et
 * `scripts/lot/chemins-de-tache.ts` tournent dans `gov:pr`, et une PR qui les modifiait passait
 * ordinaire. La garde est donc la FERMETURE TRANSITIVE des imports relatifs de ses trois racines,
 * DÉRIVÉE du disque à chaque lecture — jamais tapée —, plus les deux documents que la garde lit
 * (la charte, le registre des postes) — plus le schéma du registre des tâches, que le risque lit
 * pour savoir quelles zones existent (GOV-097).
 *
 * ÉCHEC FERMÉ : un import qui ne se résout pas LÈVE. Une garde dont on ne sait pas de quoi elle
 * est faite ne peut pas dire qu'une PR n'y touche pas.
 * LIMITE DÉCLARÉE : les fichiers LUS à l'exécution sans être importés (le gabarit de PR,
 * `CODEOWNERS`) ne sont pas dans le graphe — ils sont sous `.github/`, donc élevés. Le schéma du
 * registre, lu par `avancement.ts` et par `zonesDuRegistre()`, y est ajouté nommément.
 */
export function cheminsDeLaGardeDesRevues(): readonly string[] {
  if (gardeEnCache !== null) return gardeEnCache;
  const MOTIF_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  const resoudre = (depuis: string, specifiant: string): string => {
    const base = posix.normalize(posix.join(posix.dirname(depuis), specifiant));
    for (const c of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    throw new Error(
      `${depuis} importe « ${specifiant} », introuvable : la garde des revues ne peut pas être ` +
        `dérivée, et le risque d'aucune PR ne peut être dit ordinaire.`
    );
  };
  const vus = new Set<string>();
  const pile = [...RACINES_DE_LA_GARDE_DES_REVUES];
  while (pile.length > 0) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(MOTIF_IMPORT)) pile.push(resoudre(f, m[1]!));
  }
  gardeEnCache = [...vus, CHEMIN_CHARTE, CHEMIN_AGENTS, CHEMIN_SCHEMA_DES_TACHES];
  return gardeEnCache;
}

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

let zonesEnCache: readonly string[] | null = null;

/**
 * LES ZONES QUE LE SCHÉMA DU REGISTRE DÉCLARE — lues, jamais tapées (RM-01). Échec FERMÉ : un
 * schéma illisible, ou qui ne porte plus d'énumération de zones, LÈVE — on ne dit pas qu'une zone
 * est ordinaire sans savoir quelles zones existent.
 */
export function zonesDuRegistre(): readonly string[] {
  if (zonesEnCache !== null) return zonesEnCache;
  const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA_DES_TACHES, 'utf8')) as {
    $defs?: { tache?: { properties?: { zone?: { enum?: unknown } } } };
  };
  const zones = schema.$defs?.tache?.properties?.zone?.enum;
  if (!Array.isArray(zones) || zones.length === 0 || !zones.every((z) => typeof z === 'string')) {
    throw new Error(
      `${CHEMIN_SCHEMA_DES_TACHES} ne déclare plus l'énumération des zones : le risque d'aucune ` +
        `PR ne peut être dit ordinaire.`
    );
  }
  zonesEnCache = zones as string[];
  return zonesEnCache;
}

/** Pourquoi une tâche élève le risque — `null` si elle ne l'élève pas. Un champ absent n'est RIEN prouvé. */
function tacheAElever(t: TacheDeLaPr): string | null {
  const ecarts: string[] = [];
  if (typeof t.zone !== 'string') ecarts.push('champ `zone` absent');
  else if (ZONES_A_RISQUE_ELEVE.includes(t.zone)) ecarts.push(`zone ${t.zone}`);
  else if (!zonesDuRegistre().includes(t.zone)) ecarts.push(`zone ${t.zone} inconnue du schéma`);
  if (!Array.isArray(t.sensible)) ecarts.push('champ `sensible` absent');
  else if (t.sensible.length > 0) ecarts.push(`sensible [${t.sensible.join(', ')}]`);
  if (t.schema === true) ecarts.push('schema: true');
  return ecarts.length === 0 ? null : ecarts.join(', ');
}

/** Les racines du CODE PRODUIT, seul lu par `fichiersDesTachesAElever()` (voir sa raison). */
export const RACINES_DU_CODE_PRODUIT: readonly string[] = ['src/'];

/**
 * LES FICHIERS DU DIFF QU'UNE TÂCHE SENSIBLE DÉCLARE — LA SENSIBILITÉ SUIT LE FICHIER (refus
 * `securite` du 2026-09-25, motif 1). Une tâche QUELCONQUE du registre, de la BASE ou de la TÊTE
 * (union, sens fermé : la tête peut RETIRER un chemin d'une tâche sensible, la base le garde), qui
 * élèverait à elle seule une PR (`tacheAElever`) rend élevé tout fichier du diff qu'elle déclare
 * (`cheminsDeLaTache`) : `api-entrante.ts` reste de SEC-07 sous le titre `feat(INT-T11)`.
 *
 * UN FICHIER RÉPOND à un chemin déclaré ÉGAL, ou à un RÉPERTOIRE déclaré (`…/`) qui le contient
 * — l'attrape-tout `[...inconnu]/route.ts` est de SEC-07 par `src/app/api/integrations/axionia/`.
 *
 * ⚠️ SEULS LES FICHIERS DU CODE PRODUIT (`RACINES_DU_CODE_PRODUIT`, `src/`) sont lus ici — décision
 * de l'orchestrateur du 2026-09-25, `partners/ADR-0021`. La décision de Will protège l'argent, la
 * sécurité et les données du PRODUIT ; les scripts de contrôle sont protégés par leurs propres
 * signaux (garde des revues, racine, dossiers cachés, `config/`), `prisma/` et `packages/contracts/`
 * par le signal de schéma. Étendue à `scripts/` et `docs/`, la règle ramenait le gain sous son niveau
 * d'avant GOV-097 (24 tâches ordinaires contre 31), à cause d'étiquettes `sensible` portées par des
 * tâches de gouvernance (GOV-008 `auth` sur `scripts/plan-state/build.ts`). DETTE NOMMÉE : un
 * `scripts/gates/*` hors de la fermeture de la garde reste ordinaire.
 */
export function fichiersDesTachesAElever(
  fichiers: readonly string[],
  registres: readonly { ou: string; taches: readonly TacheDeLaPr[] }[]
): string[] {
  const produit = fichiers.filter((f) => RACINES_DU_CODE_PRODUIT.some((r) => f.startsWith(r)));
  if (produit.length === 0) return [];
  // fichier → « tâche (écart) » → les registres où elle le déclare : une tâche identique sur la
  // base et sur la tête ne s'écrit qu'une fois.
  const vus = new Map<string, Map<string, string[]>>();
  for (const { ou, taches } of registres) {
    for (const t of taches) {
      const ecart = tacheAElever(t);
      if (ecart === null) continue;
      const declares = cheminsDeLaTache({ ...t, paths: t.paths ?? [] });
      for (const f of produit) {
        // LA règle « un chemin déclaré couvre un fichier » est `touche()` : fichier exact, ou
        // répertoire AVEC ou SANS barre finale. La retaper avait perdu le second cas (refus
        // `exactitude` et `simplicite` sur 82ba226 — ~90 tâches déclarent `src/app/X` sans barre).
        if (!declares.some((c) => touche(c, [f]))) continue;
        const parTache = vus.get(f) ?? new Map<string, string[]>();
        const qui = `${t.id} (${ecart})`;
        parTache.set(qui, [...(parTache.get(qui) ?? []), ou]);
        vus.set(f, parTache);
      }
    }
  }
  return [...vus].map(
    ([f, parTache]) =>
      `${f} ← ${[...parTache].map(([qui, ou]) => `${qui} sur la ${ou.join(' et la ')}`).join(', ')}`
  );
}

/** Un fichier de l'argent, de la sécurité ou des données (`SEGMENTS_DES_ZONES_SENSIBLES`). */
export function fichierEnZoneSensible(f: string): boolean {
  return (
    segmentsNommesTouches([f], SEGMENTS_DES_ZONES_SENSIBLES, { fichierCompris: true }).length > 0
  );
}

/**
 * Un fichier du PROCESSUS : à la racine (sans exception, décision (g) de GOV-077 — `package.json`,
 * les configurations d'outils, mais aussi `CLAUDE.md` et `AGENTS.md`, que chaque agent charge), sous
 * un dossier caché (`.github/`, `.claude/`, `.husky/`…), ou sous `DOSSIERS_DU_PROCESSUS`. La garde
 * des revues est jugée à part, par `cheminsDeLaGardeDesRevues()`.
 */
export function fichierDuProcessus(f: string): boolean {
  return (
    !f.includes('/') || f.startsWith('.') || DOSSIERS_DU_PROCESSUS.some((d) => f.startsWith(d))
  );
}

/**
 * LE PLAFOND DE `GET /repos/{o}/{r}/pulls/{n}/files` : 3000 fichiers, au-delà desquels la forge
 * TRONQUE sa réponse SANS erreur (documentation de l'interface REST de GitHub).
 */
export const PLAFOND_DES_FICHIERS_DE_LA_FORGE = 3000;

/**
 * D'OÙ VIENT LA LISTE DES FICHIERS D'UNE PR, et donc si elle est COMPLÈTE.
 *
 *   — `complete` : listée par `git diff` sur l'arbre (mode événement), ou fournie entière par une
 *     fixture. Complète par construction.
 *   — `forge` : lue sur `pulls/{n}/files`. `lues` est le nombre d'ENTRÉES de l'API (un renommage,
 *     source et destination, compte pour une) ; `annoncees` est `changed_files` de la PR.
 *
 * 🔴 LE DÉFAUT, relevé par la lentille `securite` au second tour de la PR 64 : la forge plafonne sa
 * liste sans erreur, et personne ne comparait à `changed_files`. Trois mille documents suivis d'un
 * fichier de configuration donnaient « risque ordinaire ». Une liste incomplète ne prouve rien :
 * elle rend la PR ÉLEVÉE, et `null` (complétude inconnue) aussi.
 */
export type ListeDesFichiers =
  { source: 'complete' } | { source: 'forge'; lues: number; annoncees: number | null };

/** Pourquoi la liste des fichiers n'est PAS prouvée complète — `null` si elle l'est. */
function listeIncomplete(liste: ListeDesFichiers | null): string | null {
  if (liste !== null && liste.source === 'complete') return null;
  if (liste !== null && liste.source === 'forge') {
    const { lues, annoncees } = liste;
    if (
      typeof annoncees === 'number' &&
      annoncees < PLAFOND_DES_FICHIERS_DE_LA_FORGE &&
      lues >= annoncees
    ) {
      return null;
    }
    return (
      `liste des fichiers incomplète : ${lues} entrée(s) lue(s) sur la forge pour ` +
      `${annoncees ?? 'un nombre illisible de'} fichier(s) annoncé(s) (plafond de l'interface : ` +
      `${PLAFOND_DES_FICHIERS_DE_LA_FORGE})`
    );
  }
  return 'liste des fichiers de complétude inconnue';
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

/** Les options de `git diff` que `entreesDuDiff()` sait lire — nommées une fois, pour l'appelant. */
export const OPTIONS_DU_DIFF = ['-c', 'core.quotePath=false', 'diff', '--name-status', '-z'];

/**
 * La sortie de `git diff --name-status -z`, lue dans la forme de la forge. Chaque champ se termine
 * par un octet NUL : un statut, puis un chemin — ou DEUX pour un renommage ou une copie (`R100`,
 * `C075`) : la source puis la destination.
 *
 * 🔴 POURQUOI `-z` (lentille `exactitude`, second tour de la PR 64) : sans lui, git cite un chemin
 * NON ASCII entre guillemets et en octal. `prisma/é.sql` devenait une chaîne qui ne commence plus
 * par `prisma/` : ni la lentille `schema`, ni le label `schema` n'étaient plus exigés.
 */
export function entreesDuDiff(sortie: string): EntreeDeFichier[] {
  const entrees: EntreeDeFichier[] = [];
  const champs = sortie.split(String.fromCharCode(0));
  let i = 0;
  while (i < champs.length) {
    const statut = champs[i] ?? '';
    i++;
    if (statut === '') continue;
    const deux = /^[RC]/.test(statut);
    const source = champs[i];
    const destination = deux ? champs[i + 1] : source;
    i += deux ? 2 : 1;
    if (!destination) continue;
    entrees.push({
      filename: destination,
      previous_filename: deux ? source : null,
      status: statut,
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
  /** D'où vient `fichiers`, et si la liste est complète — `null` : inconnu, donc ÉLEVÉ. */
  liste: ListeDesFichiers | null;
  labels: readonly string[];
  charte?: string;
  /**
   * Les identifiants du champ `Lot:`, DÉJÀ confrontés au registre par `resoudreLeLot()`
   * (GOV-096). Sans eux, une PR de lot verrait le risque de sa SEULE tâche de titre : une tâche
   * `sensible` ou `schema: true` portée par une des autres tâches du lot n'exigerait ni section
   * Attaque ni approbation de l'architecte. La monotonie est préservée — un renseignement de plus
   * ne peut que faire MONTER le risque.
   */
  idsDuLot?: readonly string[];
};

/**
 * LE RISQUE D'UNE PR — LA SEULE DÉRIVATION, appelée par `scripts/gates/gov-pr.ts` ET par
 * `scripts/lot/corps-de-pr.ts`. Voir `ZONES_A_RISQUE_ELEVE` pour la règle et ses limites.
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
      [
        ...tachesDeLaPr(e.taches, e.pr, id, e.idsDuLot ?? []),
        ...tachesDeLaPr(e.tachesBase ?? [], e.pr, id, e.idsDuLot ?? []),
      ].map((t) => t.id)
    ),
  ];
  if (ids.length === 0) {
    raisons.push('aucune tâche résolue (ni par le titre, ni par le champ `pr`, ni par `Lot:`)');
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
      const ecart = tacheAElever(t);
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
  const incomplete = listeIncomplete(e.liste);
  if (incomplete !== null) raisons.push(incomplete);
  const sensibles = e.fichiers.filter(fichierEnZoneSensible);
  if (sensibles.length > 0) {
    raisons.push(`fichier(s) en zone sensible : ${sensibles.join(', ')}`);
  }
  const declares = fichiersDesTachesAElever(e.fichiers, [
    { ou: 'base', taches: e.tachesBase ?? [] },
    { ou: 'tête', taches: e.taches },
  ]);
  if (declares.length > 0) {
    raisons.push(`fichier(s) déclaré(s) par une tâche sensible : ${declares.join(' ; ')}`);
  }
  const processus = e.fichiers.filter(fichierDuProcessus);
  if (processus.length > 0) {
    raisons.push(
      `fichier(s) du processus (racine, dossier caché, ${DOSSIERS_DU_PROCESSUS.join(', ')}) : ` +
        processus.join(', ')
    );
  }
  const chemins = cheminsDeLaGardeDesRevues();
  const garde = e.fichiers.filter((f) => chemins.includes(f));
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
    raisons: [
      prouvees.join(', '),
      `${e.fichiers.length} fichier(s) hors zones sensibles, hors tâches sensibles et hors processus`,
    ],
  };
}

/**
 * LES LENTILLES EXIGÉES — DEUX PARTOUT, décision de Will du 2026-09-26 (`W16`, `partners/ADR-0022`,
 * GOV-101) : `exactitude` et `securite`, dont le refus bloque à lui seul ; plus l'avis `schema` de
 * l'architecte dès que la PR touche au schéma. Le NIVEAU de risque ne compte plus de lentille : il
 * reste calculé et publié (`direLeRisque`), parce qu'il dit au relecteur `securite` où regarder.
 * `simplicite` et `mutation` ne sont plus exigées : la mutation est mesurée par Stryker en porte A
 * (`pnpm mutation:pr`), et un agent qui la déclarait ne la mesurait pas.
 *
 * ⚠️ LA BRANCHE COURTE SE PROUVE, LA LONGUE EST LE DÉFAUT : on teste `schema === false`, jamais
 * `=== true`. Une valeur imprévue exige donc l'architecte.
 *
 * `sansMutation` est conservé pour ses appelants : depuis GOV-101, les deux listes sont égales.
 */
export function lentillesExigees(risque: Risque): {
  sansMutation: readonly string[];
  toutes: readonly string[];
} {
  const exigees =
    risque.schema === false ? [...DEUX_PREMIERES] : [...DEUX_PREMIERES, LENTILLE_SCHEMA];
  return { sansMutation: exigees, toutes: [...exigees] };
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

/**
 * Les deux MESURES de la survie (GOV-095), injectables par un témoin qui traverse la garde ou le
 * composeur ENTIERS. Absentes : le vrai `git` du clone — c'est le seul chemin de production.
 */
export type MesuresDeSurvie = Pick<Entree, 'fichiersEntre' | 'lireALaTete' | 'empreinteDuPatch'>;

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
  /**
   * LA PÉREMPTION JUGE LE CODE, PLUS LE SHA (GOV-095). Un accord rendu sur une autre tête n'est
   * périmé que si le DELTA entre les deux le justifie ; voir `accordSurvit` pour la règle et pour
   * la raison de chaque cas fermé. Le sens d'écriture est celui de la défense : on prouve la
   * SURVIE, et tout le reste tombe dans `peremptions`.
   */
  const peremptions: Peremption[] = [];
  const survivantes: Survivance[] = [];
  if (entree.tete !== null && entree.tete !== '') {
    const tete = entree.tete;
    const mesurer = entree.fichiersEntre ?? fichiersEntre;
    // Un accord par lentille, mais plusieurs peuvent porter le MÊME commit : on ne relance pas
    // `git` pour une réponse déjà obtenue.
    const deja = new Map<string, string[] | null>();
    // L'empreinte d'un commit ne dépend que de lui : mesurée une fois, et seulement si la règle du
    // journal n'a pas suffi — la plupart des lectures n'appellent jamais `git patch-id`.
    const mesurerLEmpreinte = entree.empreinteDuPatch ?? ((sha: string) => empreinteDuPatch(sha));
    const empreintes = new Map<string, string | null>();
    const empreinte = (sha: string): string | null => {
      if (!empreintes.has(sha)) empreintes.set(sha, mesurerLEmpreinte(sha));
      return empreintes.get(sha) ?? null;
    };
    for (const x of accords) {
      if (!exigees.includes(x.lentille) || x.commit === tete) continue;
      if (!deja.has(x.commit)) deja.set(x.commit, mesurer(x.commit, tete));
      const survie = accordSurvit(x.lentille, deja.get(x.commit) ?? null, {
        numero: entree.numero ?? null,
        lire: (f) => (entree.lireALaTete ?? contenuALaTete)(tete, f),
      });
      if (survie.survit) {
        survivantes.push({
          code: x.code,
          lentille: x.lentille,
          commit: x.commit,
          tete,
          fichiers: survie.fichiers,
          regle: 'journal',
        });
        continue;
      }
      // GOV-101 : la seconde chance, et la seule. Le diff PROPRE à la PR est-il le même ?
      const avant = empreinte(x.commit);
      const apres = avant === null ? null : empreinte(tete);
      if (avant !== null && avant === apres) {
        survivantes.push({
          code: x.code,
          lentille: x.lentille,
          commit: x.commit,
          tete,
          fichiers: survie.fichiers ?? [],
          regle: 'patch',
          empreinte: avant,
        });
        continue;
      }
      const pourquoi =
        avant === null
          ? `l’empreinte du diff propre à la PR n’a pas pu être mesurée sur ${x.commit.slice(0, 7)} ` +
            '(commit absent du clone, base introuvable ou diff vide)'
          : apres === null
            ? `l’empreinte du diff propre à la PR n’a pas pu être mesurée sur la tête ${tete.slice(0, 7)}`
            : `le diff propre à la PR a changé (empreinte ${avant.slice(0, 12)} sur ` +
              `${x.commit.slice(0, 7)}, ${apres.slice(0, 12)} sur la tête)`;
      peremptions.push({
        verdict: x,
        motif: `${survie.motif} ; et ${pourquoi}`,
        fichiers: survie.fichiers,
      });
    }
  }
  const perimees = peremptions.map((p) => p.verdict);
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
  /**
   * LA PÉREMPTION DIT SON MOTIF, UNE PAR UNE (GOV-095). « périmée sur une autre tête » ne dit plus
   * rien depuis qu'une autre tête ne suffit PAS à périmer : ce qui manque au relecteur, c'est
   * POURQUOI celle-ci n'a pas survécu — un diff incalculable ne se répare pas comme un
   * `docs/tasks.json` au delta.
   */
  for (const p of peremptions) {
    raisons.push(
      `périmée : ${p.verdict.lentille} (jugé ${p.verdict.commit.slice(0, 7)}, tête ${tete7}) — ` +
        p.motif
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

  /**
   * LA SURVIE SE DIT DANS LES DEUX CAS, ET C'EST TOUT L'ENJEU (GOV-095). Sans cette phrase, le
   * corps publierait « les 4 lentilles ont accepté sur <tête> » alors que trois d'entre elles ont
   * jugé un AUTRE commit : une phrase calculée et fausse est pire qu'un compteur tapé à la main,
   * parce que personne ne la met en doute. Une survie silencieuse est invisible, donc
   * inauditable ; celle-ci se conteste sans relire le code.
   */
  const survie =
    survivantes.length === 0
      ? ''
      : ` — dont ${survivantes.length} accord(s) rendus sur un autre commit, qui SURVIVENT : ` +
        survivantes.map(direLaSurvivance).join(' ; ');

  const detail =
    (coche
      ? `les ${exigees.length} lentilles (${exigees.join(', ')}) ont accepté sur ${tete7} — ` +
        `${direLeRisque(entree.risque)} — « Relecteur ≠ auteur » vérifiée au niveau du poste (${entree.auteurPoste} ne rend aucun de ces avis, ` +
        `charte §6)` +
        (comptesDistinctsDeLAuteur
          ? ''
          : `, et NON au niveau des comptes GitHub : toutes les revues retenues viennent du compte de ` +
            `l’auteur, ce dépôt n’en a qu’un (W13)`)
      : [direLeRisque(entree.risque), ...raisons].join(' · ')) + survie;

  return {
    retenues,
    ecartees,
    verdicts,
    exigees,
    manquantes,
    refusees,
    perimees,
    peremptions,
    survivantes,
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
  if (lecture.manquantes.length > 0) {
    fautes.push({
      famille: 'lentilles_manquantes',
      message:
        `Revues — lentille(s) manquante(s) : ${lecture.manquantes.join(', ')}. Chaque revue ` +
        `s'ouvre par « A<nn> · <lentille> » (docs/CHARTE-AGENTS.md §3). Vues — accords : ` +
        `${nommer(accords, '(aucun)')} ; refus : ${nommer(lecture.refusees, '(aucun)')}.`,
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
