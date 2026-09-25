/**
 * gov-pr.ts — la garde du gabarit de PR et de la charte des agents (GOV-007,
 * REQ-GOV-010 / REQ-GOV-011 / REQ-GOV-012 / REQ-GOV-013).
 *
 * USAGE : pnpm gov:pr                 structure du gabarit, de CODEOWNERS et de la charte ;
 *                                     plus la PR elle-même si GitHub Actions en fournit une
 *         pnpm gov:pr --pr <numero>   tout ce qui précède, REVUES COMPRISES (`GET /pulls/n/reviews`) —
 *                                     c'est la commande que A04 lance AVANT de fusionner
 *         pnpm gov:pr --apres-fusion <n>  la 8ᵉ case en plus : l'atterrissage attesté (après fusion)
 *         pnpm gov:pr --prove         un témoin par famille de règle, des contre-témoins verts
 *
 * CE QU'ELLE TIENT, ET POURQUOI CHAQUE FAMILLE EXISTE.
 *
 *   — les MARQUEURS du gabarit, une occurrence chacun. Un commentaire HTML ne s'imbrique pas :
 *     un en-tête qui écrit les délimiteurs à l'intérieur de lui-même se referme au premier, et
 *     chaque marqueur se retrouve en double. La garde ancre alors sur la mauvaise occurrence et
 *     refuse une PR correctement remplie — ou en accepte une qui ne l'est pas ;
 *   — les HUIT cases entre `dod:debut` et `dod:fin`, et AUCUNE case ailleurs : la règle maison
 *     est un champ, pas une case, sans quoi le compte de REQ-GOV-013 en trouve neuf ;
 *   — `.github/CODEOWNERS` ne nomme AUCUN code de poste : GitHub ne résout pas `@A02`, marque
 *     « Unknown owner » et ignore la règle entière. Un fichier plein de codes de poste est
 *     inopérant, et c'est invisible à l'œil ;
 *   — la charte porte une ligne PAR FICHE de `.claude/agents/`, ni plus ni moins (RM-01) ;
 *   — l'ordinal de la lentille de l'architecte est DÉRIVÉ de sa fiche : si la fiche dit qu'il
 *     REMPLACE la troisième lentille et que la charte en ajoute une quatrième, la vue contredit
 *     sa source, et le compte des avis exigés change sans que personne ne l'ait décidé ;
 *   — sur la PR : le titre, les champs remplis, l'auteur qui n'est pas son propre relecteur, les
 *     huit cases cochées, le bloc ROUGE/VERT dès qu'une garde est introduite, la section Attaque
 *     sur une tâche `sensible`, le label de chaque chemin réservé (§7 de la charte, LU ICI) ;
 *   — avec les revues : les lentilles qu'exige le RISQUE de la PR (`risqueDeLaPr`, GOV-077) —
 *     deux sur une PR ordinaire, trois plus l'avis de mutation sur une PR élevée —, aucune revue
 *     distinguée de « toutes refusent », et l'approbation de A02 sur une PR `schema`.
 *
 * CE QU'ELLE NE PEUT PAS TENIR EN CI, ET QUI EST DIT PLUTÔT QUE CACHÉ. L'événement
 * `pull_request` ne porte AUCUNE revue : elles n'existent pas encore quand la CI tourne. Une
 * gate qui les exigerait serait rouge sur toute PR non relue — donc désarmée en pratique. Les
 * familles de revue ne sont donc évaluées que sous `--pr <numero>`, et la sortie DIT toujours
 * lesquelles ont été évaluées. C'est une dépendance à un geste humain (A04 avant la fusion),
 * pas une garde : `docs/CHARTE-AGENTS.md` §8 l'écrit noir sur blanc.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';
import {
  ETAT_APPROUVE,
  ETAT_COMMENTE,
  MOTIF_TITRE_DE_PR,
  avisHorsCanal,
  cheminsSchema,
  cheminsTouches,
  entreesDuDiff,
  fichierEnZoneSensible,
  OPTIONS_DU_DIFF,
  direLaSurvivance,
  direLeRisque,
  fautesDesRevues,
  lentillesExigees,
  lireRevues,
  resoudreLeLot,
  risqueDeLaPr,
  tachesDeLaBase,
  segmentsNommesTouches,
  ZONES_SENSIBLES,
  touche,
  tachesDeLaPr,
  jugerLesTetes,
  estAncetreDe,
  type CommentaireBrut,
  type DemandeDeConcordance,
  type EntreeDeFichier,
  type ListeDesFichiers,
  type MesuresDeSurvie,
  type RevueBrute,
  type Risque,
  type TacheDeLaPr,
} from '../lot/revues';
// LE lecteur unique des chemins d'une tâche — `paths` ∪ `tests{}`. Le même que celui du composeur :
// la garde du LOT et la garde de la PR ne peuvent plus diverger sur ce qu'une tâche déclare toucher.
import {
  REGISTRES_APPEND_ONLY,
  cheminsDeLaTache,
  cheminsReserves,
  outilHorsDepot,
} from '../lot/chemins-de-tache';

const CHEMIN_GABARIT = '.github/PULL_REQUEST_TEMPLATE.md';
const CHEMIN_CODEOWNERS = '.github/CODEOWNERS';
const CHEMIN_CHARTE = 'docs/CHARTE-AGENTS.md';
const CHEMIN_FICHES = '.claude/agents';
const CHEMIN_FICHE_ARCHITECTE = '.claude/agents/architecte.md';
const CHEMIN_TACHES = 'docs/tasks.json';

/** Les marqueurs d'ancrage du gabarit. Chacun EXACTEMENT une fois. */
const MARQUEURS = [
  'dod:debut',
  'dod:fin',
  'rouge-vert:debut',
  'rouge-vert:fin',
  'attaque:debut',
  'attaque:fin',
  'regle-maison:debut',
  'regle-maison:fin',
];

/**
 * Les champs que le corps d'une PR doit porter, remplis.
 *
 * ⚠️ `Lot:` y figure mais N'EST PAS EXIGÉ REMPLI dans le corps d'une PR (GOV-096) : il est vide
 * sur toute PR à une seule tâche, c'est-à-dire la très grande majorité, et l'exiger rendrait la
 * garde insatisfiable pour tout le monde au profit d'une minorité. Ce que cette liste garde, c'est
 * sa présence dans le GABARIT — un champ qui en disparaît disparaît de toutes les PR suivantes, et
 * plus aucune PR de lot ne saurait déclarer ses tâches.
 */
const CHAMPS = [
  'Auteur:',
  'Relecteur:',
  'Couvre:',
  'Lot:',
  'Rouge constaté par:',
  'Règle maison appliquée:',
];

const NB_CASES = 8;
/** Les avis qui ne comptent pour rien, et POURQUOI — dits en sortie, jamais comptés en fautes. */
const AVIS_ECARTES: string[] = [];
/** Les avis postés en commentaire d'issue (GOV-077) — dits, jamais comptés. */
const AVIS_HORS_CANAL: string[] = [];
/**
 * LES ACCORDS QUI ONT SURVÉCU À LA TÊTE (GOV-095) — dits, et c'est la condition de la permission.
 * Une garde qu'on rend plus permissive doit IMPRIMER chaque fois qu'elle a été permissive : sans
 * cette liste, la survie est invisible, donc inauditable, et personne ne peut la contester.
 */
const ACCORDS_SURVIVANTS: string[] = [];

/**
 * Les lignes que `gov:pr` IMPRIME sur les accords survivants du dernier `controler()` — vide s'il
 * n'y en a aucun. Une seule source pour la sortie et pour son témoin : retirer l'impression ou
 * l'alimentation de la liste fait rougir `accord-survit-au-journal.spec.ts`.
 */
export function lignesDesAccordsSurvivants(): string[] {
  if (ACCORDS_SURVIVANTS.length === 0) return [];
  return [
    `ℹ️  gov:pr — ${ACCORDS_SURVIVANTS.length} accord(s) rendus sur un AUTRE commit que la tête et ` +
      `qui y SURVIVENT (GOV-095) — le delta ne juge aucun code. Conteste-les sans relire le code :`,
    ...ACCORDS_SURVIVANTS.map((e) => `      ${e}`),
  ];
}
/** Le saut de ligne, nomme : les fixtures decoupent des corps de PR. */
const SAUT = String.fromCharCode(10);
const TYPES_DE_TITRE = ['feat', 'fix', 'test', 'docs', 'chore', 'refactor', 'ci', 'perf'];
const ORDINAUX = ['première', 'deuxième', 'troisième', 'quatrième', 'cinquième'];
// Les chemins qui exigent la lentille de schéma ne sont plus RECOPIÉS ici : ils se dérivent du §7
// de la charte, par le lecteur unique — la même source que celle qui fait exiger le label (RM-01).
// Les zones que REQ-GOV-011 place sous revue adversariale documentée (`ZONES_SENSIBLES`) et la
// lecture PAR SEGMENT qui les reconnaît (`segmentsNommesTouches`) vivent dans le lecteur unique
// depuis GOV-097 : le risque d'une PR lit la même lecture, sur sa propre liste (RM-01).
/**
 * L'EMPREINTE D'UNE ENTRÉE DE REGISTRE : un SHA-256 de son JSON à clés ORDONNÉES.
 *
 * Les clés sont triées parce que `JSON.stringify` suit l'ordre d'insertion : deux entrées
 * identiques écrites dans un ordre différent rendraient deux empreintes, et la garde accuserait
 * une réécriture qui n'a pas eu lieu.
 */
export function empreinteDeLEntree(entree: unknown): string | null {
  try {
    const canonique = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(canonique);
      if (v !== null && typeof v === 'object') {
        return Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, canonique((v as Record<string, unknown>)[k])])
        );
      }
      return v;
    };
    return createHash('sha256')
      .update(JSON.stringify(canonique(entree)))
      .digest('hex');
  } catch {
    return null;
  }
}

/**
 * LES TÂCHES SENSIBLES DONT L'ENTRÉE A ÉTÉ RÉÉCRITE entre la BASE et la TÊTE (GOV-078).
 *
 * Sensible sur l'un OU l'autre côté : une PR qui RETIRE le marquage d'une tâche sensible est
 * exactement celle qu'il ne faut pas laisser passer sans scénario. Une empreinte absente d'un côté
 * n'est jamais lue comme « inchangée » — c'est le sens de défaillance FERMÉ.
 *
 * 🔴 ET LA SUPPRESSION EN EST UNE (motif `securite` sur la PR 114). Ne parcourir que la TÊTE ne
 * voyait jamais une entrée sensible RETIRÉE du registre : c'est pourtant la forme la plus forte du
 * retrait de marquage. Une tâche sensible sur la BASE et absente de la TÊTE est rendue ici — telle
 * que la base la porte, avec son marquage — et `supprimee` le dit.
 */
export function tachesReecritesEtSensibles(
  tete: readonly Tache[],
  base: readonly Tache[] | null
): (Tache & { supprimee: boolean })[] {
  if (base === null) return [];
  const parIdBase = new Map(base.map((t) => [t.id, t]));
  const idsTete = new Set(tete.map((t) => t.id));
  const sensible = (t: Tache | undefined): boolean =>
    t !== undefined && (t.sensible === null || t.sensible.length > 0);
  const reecrites = tete.filter((t) => {
    const avant = parIdBase.get(t.id);
    if (avant === undefined) return false; // une tâche VERSÉE n'est pas une tâche RÉÉCRITE
    if (!sensible(t) && !sensible(avant)) return false;
    return t.empreinte === null || avant.empreinte === null || t.empreinte !== avant.empreinte;
  });
  const supprimees = base.filter((t) => !idsTete.has(t.id) && sensible(t));
  return [
    ...reecrites.map((t) => ({ ...t, supprimee: false })),
    ...supprimees.map((t) => ({ ...t, supprimee: true })),
  ];
}

/**
 * CE QUE LE DÉCLENCHEUR PAR ZONE A CONFRONTÉ, en une ligne — imprimée sur TOUTE PR, verte ou rouge
 * (GOV-078, livrable 1 ; motif `exactitude` sur la PR 114). Le déclencheur d'avant est resté mort
 * des semaines parce que son vert était muet ; celui-ci dit sur combien de fichiers et de segments
 * il a porté, contre quelles zones, et ce qui a répondu — ou que rien n'a répondu.
 */
export function direLesZones(fichiers: readonly string[]): string {
  const segments = fichiers.reduce((n, f) => n + Math.max(f.split('/').length - 1, 0), 0);
  const touchees = zonesSensiblesTouchees(fichiers);
  return (
    `déclencheur par zone : ${fichiers.length} fichier(s) lu(s), ${segments} segment(s) de ` +
    `répertoire confronté(s) aux zones ${ZONES_SENSIBLES.join(', ')} → ` +
    (touchees.length === 0
      ? 'aucune zone touchée'
      : `zone(s) touchée(s) : ${touchees.map((z) => `${z.sous}/ (${z.zone})`).join(' · ')}`)
  );
}

/**
 * LES ZONES SENSIBLES RÉELLEMENT TOUCHÉES PAR UNE LISTE DE FICHIERS — écrit à un seul endroit, et
 * ce qu'il a confronté est IMPRIMÉ (GOV-078, livrable 1).
 *
 * Le répertoire rendu est le chemin RÉEL du dépôt, jusqu'au segment qui porte le nom de la zone :
 * la garde nomme donc `src/domain/commissions`, pas `commissions/`.
 */
export function zonesSensiblesTouchees(
  fichiers: readonly string[]
): { zone: string; sous: string }[] {
  // Le dernier segment est le FICHIER : pour la section « Attaque », une zone est un répertoire,
  // jamais un nom de fichier (`docs/commissions-et-prorata.md` ne répond pas).
  return segmentsNommesTouches(fichiers, ZONES_SENSIBLES, { fichierCompris: false });
}
/**
 * LE PÉRIMÈTRE QUE LA FAMILLE `fichier_hors_paths_des_taches` CONFRONTE, ET POURQUOI IL S'ARRÊTE LÀ
 * (GOV-056, livrable 2).
 *
 * Mesure du 2026-09-13 : DIX fichiers sous `scripts/`, `src/` et `tests/` modifiés par la PR 31 ne
 * figuraient dans les `paths` d'AUCUNE tâche, dont `tests/unit/gouvernance/vues-derivees.spec.ts`,
 * promis par DEUX `tests{}`. Personne ne le voyait : `paths` sert à composer les lots, et rien ne
 * confrontait jamais ce qui avait été ÉCRIT à ce qui avait été DÉCLARÉ.
 *
 * ⚠️ LE PÉRIMÈTRE EST LE CODE, ET C'EST UNE DÉCISION, PAS UN OUBLI. Toute PR conforme produit des
 * sous-produits de gouvernance qu'AUCUNE tâche ne peut déclarer sans que la liste devienne absurde :
 * son entrée de journal, `docs/PLAN-STATE.md` régénéré, sa ligne dans `docs/gates.json`, les vues
 * dérivées. Les soumettre à cette famille rendrait la garde INSATISFIABLE — et une gate
 * insatisfiable se fait retirer dans la semaine, ce que ce fichier écrit déjà ailleurs. Ce qu'une
 * tâche promet d'écrire, c'est du code ; c'est donc le code qu'on lui confronte.
 * Le contre-témoin « une PR qui ne touche que des sous-produits de gouvernance » garde CE choix :
 * sans lui, on ne saurait pas si le vert vient de la règle ou de l'absence de règle.
 */
const PERIMETRE_DU_CODE = ['scripts/', 'src/', 'tests/'];
/** Le dossier des workflows et de `CODEOWNERS` — toujours de risque élevé (GOV-077). */
const DOSSIER_CI = '.github/';
/** Ce dont l'introduction impose le bloc ROUGE/VERT (REQ-GOV-012) : un test, une garde, un workflow. */
const INTRODUIT_UNE_GARDE = (f: string) =>
  /\.spec\.ts$/.test(f) || f.startsWith('scripts/gates/') || f.startsWith('.github/workflows/');

export type Pr = {
  /**
   * Le numéro de la PR, quand on le connaît. Il n'est PAS décoratif : c'est lui qui permet de
   * dériver l'ENSEMBLE des tâches de la PR au lieu de la seule tâche que le titre nomme — la
   * divergence d'entrée mesurée le 2026-09-05 (voir `tachesDeLaPr` dans `scripts/lot/revues.ts`).
   */
  numero?: number | null;
  titre: string;
  corps: string;
  labels: string[];
  fichiers: string[];
  /** La réponse de `GET /repos/{owner}/{repo}/pulls/{n}/reviews`, telle que GitHub la sert. */
  revues: RevueBrute[] | null;
  /** Le sha de tête, sous `--pr <n>` seulement : le diff approuvé doit être le diff fusionné. */
  tete?: string | null;
  /**
   * Vrai seulement sous `--apres-fusion <n>`, la commande qu'A04 lance APRES l'atterrissage.
   * C'est le seul moment ou la huitieme case peut etre vraie : elle atteste la fusion.
   */
  apresFusion?: boolean;
  /**
   * Le registre des tâches sur la BASE de la PR (GOV-077). `null` ou absent : illisible, et le
   * risque de la PR est alors ÉLEVÉ. `--prove` le fournit EXPLICITEMENT — jamais de `git` dans une
   * fixture.
   */
  tachesBase?: Tache[] | null;
  /** Les commentaires d'issue de la PR, sous `--pr <n>` : un avis posté là ne compte pour rien. */
  commentaires?: CommentaireBrut[] | null;
  /**
   * D'où vient `fichiers`, et si la liste est COMPLÈTE (GOV-077, second refus de `securite`) :
   * absente ou `null` → complétude inconnue → risque ÉLEVÉ.
   */
  liste?: ListeDesFichiers | null;
  /** Témoins seulement : les mesures de la survie (GOV-095). Absentes en production (vrai `git`). */
  mesures?: MesuresDeSurvie;
};
/**
 * ⚠️ `paths` ET `tests` FONT PARTIE DE LA PROJECTION, et leur absence rendrait la famille
 * `fichier_hors_paths_des_taches` muette — exactement comme l'absence de `pr` a rendu DEUX
 * correctifs inertes (voir `lireDepot()`). Une projection trop pauvre ne fait pas rougir : elle
 * fait taire.
 */
export type Tache = {
  id: string;
  /** `null` si le champ manque : un champ absent n'est pas un tableau vide (GOV-077). */
  sensible: string[] | null;
  zone: string | null;
  schema: boolean;
  pr: number | null;
  paths: string[];
  tests: Record<string, string[]> | null;
  /**
   * L'EMPREINTE DE L'ENTRÉE ENTIÈRE (GOV-078) : de quoi dire qu'une PR a RÉÉCRIT la tâche, sans
   * énumérer les champs qu'elle aurait pu réécrire. La prose — titre, acceptation — n'est pas dans
   * cette projection, et c'est précisément la prose que la PR 46 a réécrite sans que rien ne
   * l'exige. Une projection trop pauvre ne fait pas rougir : elle fait taire.
   *
   * `null` = l'empreinte n'a pas pu être calculée. Elle n'est alors jamais lue comme « inchangée ».
   */
  empreinte: string | null;
  /** `null` si le champ manque — GOV-096 : on ne déduit pas « livrée » d'une absence. */
  statut: string | null;
};
export type Depot = {
  gabarit: string;
  codeowners: string;
  charte: string;
  fiches: string[];
  architecte: string;
  taches: Tache[];
};
/**
 * LA PHASE COURANTE — la plus petite phase qui porte encore une tâche non livrée.
 *
 * Dérivée de `docs/tasks.json`, pas lue dans `docs/PLAN-STATE.md` : PLAN-STATE est lui-même une
 * VUE de ce fichier, et une garde qui lit une vue rougit le jour où quelqu'un oublie de la
 * régénérer — pour une raison qui n'est pas la faute qu'elle cherche (RM-01).
 */
// L'ensemble « livrée » ne s'écrit plus ici : il se DÉRIVE du barème unique de
// `scripts/lot/avancement.ts`, dont l'exhaustivité est confrontée à l'enum `statut` du schéma.
// Il était recopié dans CINQ fichiers — relevé par la lentille `schema` sur la PR 28, dans la
// PR même qui écrivait la règle l'interdisant (RM-04, `docs/GLOSSAIRE.md` §4 : « deux copies du
// même vocabulaire divergent toujours »). Un dixième statut faisait rougir `gov:inventaire` et
// laissait les cinq copies se taire en se trompant.
const LIVREES = LIVREE_DERIVEE;

function phaseCourante(): number {
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { phase: number; statut: string }[];
  };
  const restantes = doc.taches.filter((t) => !LIVREES.has(t.statut)).map((t) => t.phase);
  return restantes.length === 0
    ? Math.max(...doc.taches.map((t) => t.phase))
    : Math.min(...restantes);
}

type Faute = { famille: string; message: string };

const FAMILLES = [
  // structure — toujours évaluées
  'marqueur_hors_norme',
  'dod_hors_bloc',
  'champ_gabarit_absent',
  'codeowners_non_resolvable',
  'charte_poste_manquant',
  'charte_lentille_non_derivee',
  // la PR — évaluées dès qu'une PR est fournie
  'titre_non_conforme',
  'relecteur_est_auteur',
  'dod_incomplete',
  'rouge_vert_absent',
  'attaque_absente',
  'fichier_reserve_sans_label',
  'fichier_hors_paths_des_taches',
  'schema_sans_label',
  // le champ `Lot:` (GOV-096) — trois refus qui le bornent, plus sa forme
  'lot_mal_forme',
  'lot_tache_inconnue',
  'lot_tache_livree',
  // ⚠️ LE NOM EST CELUI QUE `gov:etat` DONNE DÉJÀ À CETTE RÈGLE (REQ-GOV-007), repris et non
  // doublé : une seule règle, un seul nom (`partners/ADR-0011`). Les deux gardes l'observent sur
  // deux populations disjointes — `gov:etat` compare les TITRES des PR ouvertes de la forge, ici
  // on confronte le champ `pr` du registre à la seule PR jugée, sans aucun appel réseau.
  'deux_pr_meme_tache',
  // la PR — évaluées seulement avec les revues (`--pr <numero>`)
  'aucune_revue',
  'lentilles_manquantes',
  'lentille_en_refus',
  'lentille_perimee',
  'dod_atterrissage_non_atteste',
  'phase_gelee',
  'schema_sans_approbation',
  'dod_non_cochee',
];

// ── lecture du gabarit et de la charte ───────────────────────────────────────

function occurrences(texte: string, aiguille: string): number {
  return texte.split(aiguille).length - 1;
}

function bloc(texte: string, nom: string): string | null {
  const ouvre = `<!-- ${nom}:debut -->`;
  const ferme = `<!-- ${nom}:fin -->`;
  const d = texte.indexOf(ouvre);
  const f = texte.indexOf(ferme);
  if (d < 0 || f < 0 || f < d) return null;
  return texte.slice(d + ouvre.length, f);
}

function section(texte: string, debut: string, fin: string): string {
  const d = texte.indexOf(debut);
  if (d < 0) return '';
  const f = texte.indexOf(fin, d + debut.length);
  return texte.slice(d, f < 0 ? undefined : f);
}

/** Une ligne du tableau des postes : `| A01 | \`gardien-spec\` | … |`. */
function postesDeLaCharte(charte: string): { code: string; fiche: string }[] {
  const out: { code: string; fiche: string }[] = [];
  for (const ligne of section(charte, '## 2.', '## 3.').split('\n')) {
    const m = /^\|\s*(A\d{2})\s*\|\s*`([a-z0-9-]+)`\s*\|/.exec(ligne);
    if (m) out.push({ code: m[1]!, fiche: m[2]! });
  }
  return out;
}

function ordinalDeLaLentille(texte: string): string | null {
  const m = new RegExp(`\\b(${ORDINAUX.join('|')})\\s+lentille`, 'i').exec(texte);
  return m ? m[1]!.toLowerCase() : null;
}

// `touche()` et la lecture de l'en-tête d'une revue vivent dans le lecteur unique
// (`scripts/lot/revues.ts`), importé aussi par `scripts/lot/corps-de-pr.ts`. Les réécrire ici
// ferait revenir la seconde lecture que cette PR retire.

// ── le contrôle ──────────────────────────────────────────────────────────────

/**
 * LE RISQUE D'UNE PR, PAR LA SEULE DÉRIVATION (`risqueDeLaPr`, `scripts/lot/revues.ts`). Nommé ici
 * parce que la garde l'appelle à DEUX endroits : pour juger les revues, et pour IMPRIMER le risque
 * avant qu'on lance les lentilles (l'orchestrateur lit cette ligne pour en lancer deux ou quatre).
 */
/**
 * LE CHAMP `Lot:` DU CORPS, CONFRONTÉ AU REGISTRE (GOV-096). Fonction PURE du couple
 * (dépôt, PR) : l'appeler deux fois rend deux fois la même chose, et c'est ce qui permet au
 * contrôle et au calcul du risque de la consommer chacun sans se la passer de main en main.
 */
function lotDeLaPr(
  depot: Depot,
  pr: Pr
): { ids: string[]; refus: { famille: string; message: string }[] } {
  return resoudreLeLot({
    corps: pr.corps,
    numero: pr.numero ?? null,
    taches: depot.taches,
    livrees: LIVREES,
  });
}

function risqueDePr(depot: Depot, pr: Pr): Risque {
  return risqueDeLaPr({
    titre: pr.titre,
    pr: pr.numero ?? null,
    taches: depot.taches,
    tachesBase: pr.tachesBase ?? null,
    liste: pr.liste ?? null,
    fichiers: pr.fichiers,
    labels: pr.labels,
    charte: depot.charte,
    // Une tâche `sensible` ou `schema: true` portée par une AUTRE tâche du lot que celle du titre
    // serait invisible au risque sans cette ligne : la PR se relirait en ordinaire.
    idsDuLot: lotDeLaPr(depot, pr).ids,
  });
}

export function controler(depot: Depot, pr: Pr | null): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });
  // La §7 de la charte est la source ; ces chemins n'existent plus en dur dans ce fichier (RM-01).
  const CHEMINS_SCHEMA = cheminsSchema(depot.charte);
  AVIS_ECARTES.length = 0;
  AVIS_HORS_CANAL.length = 0;
  ACCORDS_SURVIVANTS.length = 0;

  // ---- structure du gabarit -------------------------------------------------
  for (const marqueur of MARQUEURS) {
    const n = occurrences(depot.gabarit, `<!-- ${marqueur} -->`);
    if (n !== 1) {
      ajouter(
        'marqueur_hors_norme',
        `${CHEMIN_GABARIT} — le marqueur « ${marqueur} » apparaît ${n} fois, il en faut exactement une. ` +
          `Les commentaires HTML ne s'imbriquent pas : ne jamais écrire un délimiteur à l'intérieur ` +
          `de l'en-tête, le nommer sans ses délimiteurs.`
      );
    }
  }

  const blocDod = bloc(depot.gabarit, 'dod');
  const casesDedans = blocDod === null ? 0 : occurrences(blocDod, '- [ ]');
  const casesTotal = occurrences(depot.gabarit, '- [ ]') + occurrences(depot.gabarit, '- [x]');
  if (blocDod === null || casesDedans !== NB_CASES) {
    ajouter(
      'dod_hors_bloc',
      `${CHEMIN_GABARIT} — ${casesDedans} case(s) entre les marqueurs dod, il en faut ${NB_CASES} (REQ-GOV-013).`
    );
  } else if (casesTotal !== NB_CASES) {
    ajouter(
      'dod_hors_bloc',
      `${CHEMIN_GABARIT} — ${casesTotal} case(s) à cocher dans le fichier pour ${casesDedans} entre les ` +
        `marqueurs dod : une case hors du bloc fausse le compte. La règle maison est un CHAMP, pas une case.`
    );
  }

  for (const champ of CHAMPS) {
    if (!depot.gabarit.includes(champ)) {
      ajouter(
        'champ_gabarit_absent',
        `${CHEMIN_GABARIT} — le champ « ${champ} » a disparu du gabarit.`
      );
    }
  }

  // ---- CODEOWNERS -----------------------------------------------------------
  const reglesCo: { chemin: string; proprietaires: string[] }[] = [];
  for (const ligne of depot.codeowners.split('\n')) {
    const nue = ligne.trim();
    if (nue.length === 0 || nue.startsWith('#')) continue;
    const [chemin, ...proprietaires] = nue.split(/\s+/);
    if (!chemin) continue;
    reglesCo.push({ chemin, proprietaires });
  }
  for (const r of reglesCo) {
    for (const p of r.proprietaires) {
      if (/^@A\d{2}$/.test(p)) {
        ajouter(
          'codeowners_non_resolvable',
          `${CHEMIN_CODEOWNERS} — « ${p} » sur ${r.chemin} : GitHub ne résout pas un code de poste, ` +
            `marque « Unknown owner » et IGNORE la règle entière. Nomme un compte, et mets le code de ` +
            `poste en commentaire au-dessus du chemin.`
        );
      }
    }
    if (r.proprietaires.length === 0) {
      ajouter(
        'codeowners_non_resolvable',
        `${CHEMIN_CODEOWNERS} — ${r.chemin} n'a aucun propriétaire.`
      );
    }
  }
  for (const exige of CHEMINS_SCHEMA) {
    if (!reglesCo.some((r) => r.chemin.replace(/^\//, '') === exige)) {
      ajouter(
        'codeowners_non_resolvable',
        `${CHEMIN_CODEOWNERS} — aucune règle pour ${exige} : l'acceptation de GOV-007 l'exige.`
      );
    }
  }

  // ---- la charte est dérivée des fiches (RM-01) ------------------------------
  const postes = postesDeLaCharte(depot.charte);
  const codes = new Set<string>();
  for (const p of postes) {
    if (codes.has(p.code))
      ajouter('charte_poste_manquant', `${CHEMIN_CHARTE} — le code ${p.code} est donné deux fois.`);
    codes.add(p.code);
    if (!depot.fiches.includes(p.fiche)) {
      ajouter(
        'charte_poste_manquant',
        `${CHEMIN_CHARTE} — la ligne « ${p.fiche} » ne correspond à aucune fiche de ${CHEMIN_FICHES}/.`
      );
    }
  }
  for (const fiche of depot.fiches) {
    if (!postes.some((p) => p.fiche === fiche)) {
      ajouter(
        'charte_poste_manquant',
        `${CHEMIN_CHARTE} — la fiche ${fiche} n'a aucune ligne au tableau des postes : un poste sans code ` +
          `ne peut être ni auteur, ni relecteur, ni propriétaire d'un chemin réservé.`
      );
    }
  }

  const attendu = ordinalDeLaLentille(depot.architecte);
  if (attendu === null) {
    ajouter(
      'charte_lentille_non_derivee',
      `${CHEMIN_FICHE_ARCHITECTE} ne dit plus quelle lentille l'architecte tient : la charte ne peut plus en dériver.`
    );
  } else {
    const motif = new RegExp(`\\b(${ORDINAUX.join('|')})\\s+lentille`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = motif.exec(depot.charte)) !== null) {
      if (m[1]!.toLowerCase() !== attendu) {
        ajouter(
          'charte_lentille_non_derivee',
          `${CHEMIN_CHARTE} — « ${m[1]} lentille » alors que ${CHEMIN_FICHE_ARCHITECTE} écrit « ${attendu} lentille ». ` +
            `L'architecte REMPLACE une lentille, il n'en ajoute pas une : la vue contredit sa source, et le ` +
            `nombre d'avis exigés change sans que personne ne l'ait décidé.`
        );
      }
    }
  }

  if (pr === null) return fautes;

  // ---- la PR ----------------------------------------------------------------
  // Le motif du titre est écrit UNE fois, dans le lecteur unique : le composeur en a besoin aussi.
  const titre = MOTIF_TITRE_DE_PR.exec(pr.titre);
  const tache = titre ? depot.taches.find((t) => t.id === titre[2]) : undefined;
  if (!titre || !TYPES_DE_TITRE.includes(titre[1]!)) {
    ajouter(
      'titre_non_conforme',
      `Titre « ${pr.titre} » — attendu \`<type>(<ID-TÂCHE>): <titre>\` avec type parmi ` +
        `${TYPES_DE_TITRE.join(', ')} (docs/CONVENTIONS.md §5).`
    );
  } else if (!tache) {
    ajouter(
      'titre_non_conforme',
      `Titre « ${pr.titre} » — ${titre[2]} n'est pas une tâche de ${CHEMIN_TACHES}.`
    );
  }

  // ---- le champ `Lot:` (GOV-096) --------------------------------------------
  // LU AVANT TOUT CE QUI DÉPEND DES TÂCHES DE LA PR : c'est lui qui les résout sur une PR de lot,
  // dont le titre ne peut en nommer qu'une et dont le champ `pr` du registre n'est écrit
  // qu'APRÈS la fusion. Ses trois refus entrent dans les fautes ; ses identifiants RETENUS —
  // ceux-là seuls — élargissent la dérivation unique.
  const lot = lotDeLaPr(depot, pr);
  for (const r of lot.refus) ajouter(r.famille, r.message);

  const auteur = /^Auteur:\s*(A\d{2})\s*$/m.exec(pr.corps);
  const ligneRelecteur = /^Relecteur:\s*(.+)$/m.exec(pr.corps);
  const couvre = /^Couvre:\s*(REQ-[A-Z]+-\d+.*)$/m.exec(pr.corps);
  if (!auteur)
    ajouter(
      'champ_gabarit_absent',
      'Corps de la PR — `Auteur:` absent ou non rempli (attendu : un code `A` suivi de deux chiffres).'
    );
  if (!ligneRelecteur) ajouter('champ_gabarit_absent', 'Corps de la PR — `Relecteur:` absent.');
  if (!couvre)
    ajouter('champ_gabarit_absent', 'Corps de la PR — `Couvre:` ne cite aucune exigence.');

  const lentillesDeclarees: string[] = ligneRelecteur
    ? (ligneRelecteur[1]!.match(/exactitude|securite|simplicite|schema|mutation/g) ?? [])
    : [];
  if (auteur && ligneRelecteur && new RegExp(`\\b${auteur[1]}\\b`).test(ligneRelecteur[1]!)) {
    ajouter(
      'relecteur_est_auteur',
      `Corps de la PR — l'auteur ${auteur[1]} figure dans \`Relecteur:\` (REQ-GOV-011). Un agent ne relit ` +
        `jamais son propre code.`
    );
  }

  const blocDodPr = bloc(pr.corps, 'dod');
  const cochees = blocDodPr === null ? 0 : occurrences(blocDodPr, '- [x]');
  const vides = blocDodPr === null ? 0 : occurrences(blocDodPr, '- [ ]');
  if (blocDodPr === null || cochees + vides !== NB_CASES) {
    ajouter(
      'dod_incomplete',
      `Corps de la PR — ${cochees + vides} case(s) entre les marqueurs dod ; REQ-GOV-013 en exige ` +
        `${NB_CASES}. Le gabarit a été amputé ou les marqueurs sont absents.`
    );
  } else if (pr.revues !== null) {
    // Jugé seulement sous `--pr <numero>` / `--apres-fusion <n>` : les revues n'existent pas à
    // l'événement `pull_request`, et `gate-a` est le check requis de `main`.
    //
    // LA HUITIÈME CASE EST À PART, et c'est un défaut de conception qu'on corrige ici. Elle
    // atteste « Fusionnée par A04 et atterrissage vérifié » : elle ne peut pas être vraie AVANT
    // la fusion. Or `--pr <n>` est précisément la commande d'avant-fusion. L'exiger là ne
    // laissait que deux issues, toutes deux mauvaises : refuser toute PR, ou cocher une
    // attestation fausse. Mesuré : la PR 26 a été fusionnée avec la huitième case vide et
    // ZÉRO revue — la garde n'a jamais été verte, et on a appris à passer outre.
    //
    // Les sept premières se jugent avant la fusion ; la huitième sous `--apres-fusion <n>`.
    // On lit les cases DANS L'ORDRE : un compte de sept ne dit pas LESQUELLES sont cochées.
    const cases = blocDodPr.match(/^- \[[ x]\]/gm) ?? [];
    const avantFusion = cases.slice(0, NB_CASES - 1);
    const videsAvant = avantFusion.filter((c) => c === '- [ ]').length;
    if (videsAvant > 0) {
      ajouter(
        'dod_non_cochee',
        `Corps de la PR — ${videsAvant} case(s) vide(s) parmi les ${NB_CASES - 1} premières entre les ` +
          `marqueurs dod ; REQ-GOV-013 les exige avant la fusion. A04 refuse la PR. ` +
          `(La ${NB_CASES}ᵉ atteste la fusion : elle se contrôle par \`--apres-fusion\`.)`
      );
    }
    if (pr.apresFusion === true && cases[NB_CASES - 1] !== '- [x]') {
      ajouter(
        'dod_atterrissage_non_atteste',
        `Corps de la PR — la ${NB_CASES}ᵉ case « fusionnée par A04 et atterrissage vérifié » n'est ` +
          `pas cochée alors que la PR est fusionnée. Tant qu'elle est vide, personne n'a attesté ` +
          `avoir lu le sha de build : un run vert n'est pas un atterrissage (RM-09).`
      );
    }
  }

  const blocRouge = bloc(pr.corps, 'rouge-vert');
  if (pr.fichiers.some(INTRODUIT_UNE_GARDE)) {
    const rouge = blocRouge === null ? null : /^ROUGE\s*:\s*(.+)$/m.exec(blocRouge);
    const constate =
      blocRouge === null ? null : /^Rouge constaté par:\s*(A\d{2})\s*$/m.exec(blocRouge);
    if (!rouge || rouge[1]!.trim().length < 20 || rouge[1]!.trim().startsWith('(')) {
      ajouter(
        'rouge_vert_absent',
        `Corps de la PR — cette PR introduit une garde (${pr.fichiers.filter(INTRODUIT_UNE_GARDE).join(', ')}) ` +
          `et le bloc ROUGE/VERT est vide ou laissé au gabarit. REQ-GOV-012 et RM-02 : une garde ne vaut ` +
          `que si on l'a vue rougir, et le message se colle verbatim.`
      );
    }
    if (!constate) {
      ajouter(
        'rouge_vert_absent',
        `Corps de la PR — \`Rouge constaté par:\` n'est pas rempli. Si l'auteur n'a pas d'outil ` +
          `d'exécution (A07 n'a pas Bash), c'est A10 qui produit le rouge (docs/CHARTE-AGENTS.md §6).`
      );
    }
  }

  const zonesTouchees = zonesSensiblesTouchees(pr.fichiers);
  const zoneSensible = zonesTouchees.length > 0;
  // L'ENSEMBLE des taches de la PR, pas la seule que le titre nomme. Mesure du 2026-09-05 sur la
  // PR 31 : GOV-024 (titre) porte sensible: [], mais GOV-006 porte ["attribution"] et CPL-T01
  // ["argent","attribution"] — la section Attaque n'etait donc exigee par PERSONNE sur une PR
  // qui porte deux taches sensibles. Meme divergence d'entree que tachesSchema, un champ plus
  // loin : le lecteur etait unique, son entree ne l'etait pas.
  const tachesSensibles = tachesDeLaPr(
    depot.taches,
    pr.numero ?? null,
    titre ? titre[2]! : null,
    lot.ids
  );
  // `sensible: null` — le champ MANQUE — est traité comme sensible : un champ absent ne prouve rien.
  const estSensible = (t: Tache) => t.sensible === null || t.sensible.length > 0;
  // ── LE TROISIÈME DÉCLENCHEUR : la PR qui RÉÉCRIT l'entrée de registre d'une tâche sensible ──
  // Mesure du 2026-09-16 sur la PR 46. `tachesDeLaPr` résout par le numéro que la tâche PORTE ou
  // par l'identifiant du titre. Une PR qui réécrit la PROSE d'une tâche sensible — son texte
  // d'acceptation, son titre, ses champs — ne « porte » donc pas cette tâche : la tâche pointe une
  // autre PR, et le titre nomme autre chose. Le scénario d'attaque n'était exigé par PERSONNE, et
  // c'est exactement ce qui s'est passé : le contenu était propre, aucune garde ne l'exigeait, et
  // le vert ne mesurait rien.
  const reecrites = tachesReecritesEtSensibles(depot.taches, pr.tachesBase ?? null);
  // ÉCHEC FERMÉ : le registre est dans le diff et la base est illisible — on ne peut pas dire ce
  // qui a bougé, donc on ne dit pas que rien n'a bougé.
  const registreOpaque = pr.fichiers.includes(CHEMIN_TACHES) && (pr.tachesBase ?? null) === null;
  const attaqueExigee =
    zoneSensible || tachesSensibles.some(estSensible) || reecrites.length > 0 || registreOpaque;
  if (attaqueExigee) {
    const blocAttaque = (bloc(pr.corps, 'attaque') ?? '').trim();
    if (blocAttaque.length === 0 || /sans objet/i.test(blocAttaque)) {
      // LA SORTIE NOMME LA TÂCHE ET LE MOTIF, et elle les nomme TOUS : une PR peut déclencher par
      // deux chemins à la fois, et n'en afficher qu'un envoie le lecteur corriger la moitié.
      const motifs: string[] = [];
      if (zoneSensible) {
        motifs.push(
          `zone(s) sensible(s) touchée(s) : ${zonesTouchees
            .map((z) => `${z.sous}/ (${z.zone})`)
            .join(' · ')}`
        );
      }
      const portees = tachesSensibles.filter(estSensible);
      if (portees.length > 0) {
        motifs.push(
          `tâche(s) sensible(s) PORTÉE(S) : ${portees
            .map((t) => `${t.id} (${t.sensible?.join(', ') ?? 'champ sensible absent'})`)
            .join(' · ')}`
        );
      }
      if (reecrites.length > 0) {
        motifs.push(
          `entrée(s) de registre RÉÉCRITE(S) sur une tâche sensible : ${reecrites
            .map(
              (t) =>
                `${t.id} (${t.sensible?.join(', ') ?? 'champ sensible absent'}` +
                `${t.supprimee ? ', entrée SUPPRIMÉE du registre' : ''})`
            )
            .join(' · ')}`
        );
      }
      if (registreOpaque) {
        motifs.push(
          `${CHEMIN_TACHES} est dans le diff et son état sur la BASE est illisible : ce qui a été ` +
            `réécrit ne peut pas être établi, et la garde ne déclare pas propre ce qu'elle n'a pas lu`
        );
      }
      ajouter(
        'attaque_absente',
        `Corps de la PR — section « Attaque » exigée (${motifs.join(' ; ')}) et laissée vide. ` +
          `REQ-GOV-011 : scénario joué, résultat, qui l'a joué.`
      );
    }
  }

  for (const reserve of cheminsReserves(depot.charte)) {
    const touches = reserve.chemins.filter((c) => touche(c, pr.fichiers));
    if (touches.length > 0 && !pr.labels.includes(reserve.label)) {
      ajouter(
        'fichier_reserve_sans_label',
        `La PR modifie ${touches.join(', ')} sans le label \`${reserve.label}\` (REQ-GOV-010, ` +
          `docs/CHARTE-AGENTS.md §7). Labels portés : ${pr.labels.join(', ') || '(aucun)'}.`
      );
    }
  }

  // ---- les fichiers de la PR contre les `paths` de ses tâches (GOV-056, livrable 2) ----------
  // `tachesDeLaPr` est le MÊME lecteur que celui de la section Attaque et du discriminant `schema` :
  // l'union des tâches portant `pr: <n>`, de celle que le titre nomme, et de celles que le champ
  // `Lot:` déclare et que le registre a acceptées (GOV-096). On ne relit pas la forge.
  const tachesCitees = tachesDeLaPr(
    depot.taches,
    pr.numero ?? null,
    titre ? titre[2]! : null,
    lot.ids
  );
  const codeTouche = pr.fichiers.filter((f) => PERIMETRE_DU_CODE.some((p) => f.startsWith(p)));
  if (codeTouche.length > 0) {
    // ⚠️ ÉCHEC FERMÉ QUAND AUCUNE TÂCHE NE RÉSOUT. Une PR dont ni le titre ni le champ `pr` du
    // backlog ne désigne une tâche connue n'a AUCUN `paths` à qui se confronter : se taire
    // reviendrait à faire du silence une autorisation, et c'est exactement ce que cette famille
    // existe pour empêcher.
    if (tachesCitees.length === 0) {
      ajouter(
        'fichier_hors_paths_des_taches',
        `La PR modifie ${codeTouche.length} fichier(s) de code (${codeTouche.slice(0, 6).join(', ')}` +
          `${codeTouche.length > 6 ? ', …' : ''}) et ne cite AUCUNE tâche connue de ${CHEMIN_TACHES} : ` +
          `ni son titre ni le champ \`pr\` d'une tâche ne la rattache. Sans tâche, aucun \`paths\` ` +
          `ne peut être confronté — la garde refuse plutôt que de se taire.`
      );
    } else {
      // `paths` ∪ `tests{}` : les deux champs sont lus ENSEMBLE, parce que leur divergence est la
      // CONVENTION (cf. scripts/lot/chemins-de-tache.ts). Un chemin de DOSSIER couvre ce qui vit
      // dessous — `touche()` en sens inverse, le même prédicat que pour les chemins réservés.
      // ⚠️ LE PRÉDICAT N'EST PAS RÉÉCRIT ICI. Il l'était — `f === d || f.startsWith(d.replace(...))`
      // — soit une SECONDE écriture de `touche()`, à deux lignes d'un commentaire qui disait déjà
      // que c'était « le même prédicat que pour les chemins réservés ». Un commentaire qui nomme la
      // source unique ne remplace pas l'appel (RM-01). Et la branche du PRÉFIXE de dossier — une
      // tâche qui déclare `scripts/gates/` couvre ce qui vit dessous — n'était gardée par aucun
      // contre-témoin : la retirer n'aurait fait rougir personne. Elle en a un désormais.
      const declares = [...new Set(tachesCitees.flatMap((t) => cheminsDeLaTache(t)))];
      const orphelins = codeTouche.filter((f) => !declares.some((d) => touche(d, [f])));
      if (orphelins.length > 0) {
        ajouter(
          'fichier_hors_paths_des_taches',
          `La PR modifie ${orphelins.length} fichier(s) de code qu'aucune de ses tâches ne déclare : ` +
            `${orphelins.join(', ')}. Tâche(s) citée(s) : ${tachesCitees.map((t) => t.id).join(', ')} — ` +
            `chemins déclarés (\`paths\` ∪ \`tests{}\`) : ${declares.join(', ') || '(aucun)'}. ` +
            `Mesuré le 2026-09-13 sur la PR 31 : dix fichiers dans ce cas, dont une spécification ` +
            `promise par DEUX \`tests{}\`. ⚠️ SI CETTE PR EST UN LOT, LE REMÈDE N'EST PAS ` +
            `${outilHorsDepot('ajouter-path.mjs')} : déclare les AUTRES tâches du lot dans le champ ` +
            `\`Lot:\` du corps (GOV-096, mesuré sur la PR 114 — ajouter leurs chemins à la tâche du ` +
            `titre écrirait qu'elle touche des fichiers qui appartiennent à d'autres tâches, et la ` +
            `disjonction des lots se calcule sur ces mêmes \`paths\`). Sinon : ajoute le chemin à la ` +
            `tâche par ${outilHorsDepot('ajouter-path.mjs')}, ou sors le fichier du périmètre de cette ` +
            `PR — un fichier écrit hors de ce qu'on a déclaré écrire, c'est un lot dont la ` +
            `disjonction ne veut plus rien dire.`
        );
      }
    }
  }

  // TROIS SIGNAUX, LE PLUS STRICT GAGNE — et c'est le lecteur unique qui les pèse, pour que la
  // garde et le composeur du corps de PR ne puissent plus diverger. Le label seul est le plus
  // faible des trois : il se pose à la main, donc il s'oublie à la main.
  const fichiersDeSchema = CHEMINS_SCHEMA.some((c) => touche(c, pr.fichiers));
  // LE RISQUE DE LA PR (GOV-077) — la seule dérivation, partagée avec le composeur du corps. Son
  // signal `schema` est `toucheSchema()` nourri par l'ENSEMBLE des tâches de la PR, lues sur la
  // tête ET sur la base : le plus strict des trois signaux gagne, comme avant.
  const risque = risqueDePr(depot, pr);
  const schemaExige = risque.schema;
  if (fichiersDeSchema && !pr.labels.includes('schema')) {
    ajouter(
      'schema_sans_label',
      `La PR touche ${CHEMINS_SCHEMA.filter((c) => touche(c, pr.fichiers)).join(', ')} sans le label ` +
        `\`schema\` : sans lui, l'approbation bloquante de A02 n'est demandée par personne ` +
        `(docs/CONVENTIONS.md §5).`
    );
  }

  // REQ-GOV-027 — le périmètre est gelé par phase. Contrôlé AVANT le retour anticipé sur les
  // revues : un label de phase existe dès l'ouverture de la PR, et c'est justement à ce
  // moment-là qu'il faut refuser du travail de la phase suivante, pas après l'avoir relu.
  const labelPhase = pr.labels.map((l) => /^phase:(-?\d+)$/.exec(l)).find((m) => m !== null);
  if (labelPhase) {
    const declaree = Number(labelPhase[1]);
    const courante = phaseCourante();
    if (declaree > courante) {
      ajouter(
        'phase_gelee',
        `La PR porte \`phase:${declaree}\` alors que la phase courante est ${courante}, qui n'est ` +
          `pas close : docs/tasks.json y porte encore des tâches non livrées. REQ-GOV-027 — le ` +
          `périmètre est gelé par phase, et une phase se ferme avant que la suivante ne s'ouvre. ` +
          `Sans ce gel, la phase 1 démarre pendant que la 0 traîne, et les deux restent ouvertes ` +
          `jusqu'à la fin.`
      );
    }
  }

  if (pr.revues === null) return fautes;

  // ---- les revues (seulement sous `--pr <numero>`) ---------------------------
  /**
   * LA LECTURE DES REVUES N'EST PLUS ÉCRITE ICI. Elle est dans `scripts/lot/revues.ts`, importée
   * aussi par `scripts/lot/corps-de-pr.ts` — qui COCHE la case de DoD « Relecteur ≠ auteur » du
   * corps publié. Les deux lectures divergeaient sur quatre points, tous dans le sens permissif :
   * aucune authentification de l'auteur de la revue, un numéro de poste confronté à rien, un
   * discriminant `schema` tiré du seul label, et une clé de « dernier verdict » différente.
   * Le module documente chacun ; ce fichier ne fait plus que lui poser la question.
   */
  const lecture = lireRevues({
    revues: pr.revues,
    risque,
    tete: pr.tete ?? null,
    auteurPoste: auteur ? auteur[1]! : null,
    numero: pr.numero ?? null,
    ...(pr.mesures ?? {}),
  });
  const lues = lecture.verdicts.filter((v) => v.verdict === 'accepte');
  // Les lentilles EXIGÉES par le risque, hors mutation : deux sur une PR ordinaire, trois sinon.
  const exigees = [...lentillesExigees(risque).sansMutation];
  const manquantes = lecture.manquantes.filter((l) => l !== 'mutation');
  // AUCUNE REVUE, REFUS, LENTILLES MANQUANTES — décidés par le lecteur unique (GOV-077) : « aucune
  // revue » et « toutes les revues refusent » ne s'impriment plus de la même façon.
  for (const f of fautesDesRevues(lecture, { tacheSensible: attaqueExigee })) {
    ajouter(f.famille, f.message);
  }
  // LES AVIS ÉCARTÉS SONT DITS, PAS COMPTÉS COMME FAUTES — et cette retenue est délibérée. Le
  // dépôt est PUBLIC : n'importe qui peut poser un commentaire. En faire une faute rendrait la
  // gate rouge pour un geste qui n'appartient pas au projet, sans aucun moyen de l'effacer — une
  // gate insatisfiable est une gate qu'on apprend à sauter. La propriété qui protège n'est pas
  // « un avis étranger rougit », c'est « un avis étranger ne COMPTE pour rien », et elle est
  // tenue par le lecteur. La sortie les nomme pour qu'A04 les voie (`--pr <n>`).
  for (const e of lecture.ecartees) {
    AVIS_ECARTES.push(
      `${e.motif} — compte « ${e.revue.compte || '?'} », association « ${e.revue.association || '?'} », ` +
        `état « ${e.revue.etat || '?'} »`
    );
  }
  // Même doctrine pour un avis posté en COMMENTAIRE D'ISSUE (la PR 41) : dit, pas compté.
  AVIS_HORS_CANAL.push(...avisHorsCanal(pr.commentaires ?? null));
  // LA SURVIE EST DITE AVANT LA PÉREMPTION : c'est la seule sortie qui rende la permission
  // contestable, et elle porte les cinq faits (poste, lentille, les deux sha, les fichiers).
  ACCORDS_SURVIVANTS.push(...lecture.survivantes.map(direLaSurvivance));
  for (const p of lecture.peremptions) {
    ajouter(
      'lentille_perimee',
      `Revues — ${p.verdict.code} · ${p.verdict.lentille} a accepté sur ` +
        `${p.verdict.commit.slice(0, 7)}, qui n'est pas la tête ${(pr.tete ?? '').slice(0, 7)}, et ` +
        `l'accord n'y survit PAS : ${p.motif}. Le diff approuvé n'est pas le diff qui sera fusionné ` +
        `(pas 5 du protocole de fusion). On retourne au pas 2.`
    );
  }
  for (const v of lecture.auteurSeRelit) {
    ajouter(
      'relecteur_est_auteur',
      `Revues — l'auteur ${v.code} rend lui-même la lentille ${v.lentille} sur sa propre PR (REQ-GOV-011).`
    );
  }
  if (lentillesDeclarees.length > 0 && manquantes.length === 0) {
    // la ligne `Relecteur:` et les revues doivent parler des mêmes lentilles — celles qu'EXIGE le
    // risque ; en déclarer davantage est admis (le gabarit en nomme quatre).
    for (const l of exigees) {
      if (!lentillesDeclarees.includes(l)) {
        ajouter(
          'lentilles_manquantes',
          `Corps de la PR — \`Relecteur:\` ne déclare pas la lentille ${l}, que les revues portent.`
        );
      }
    }
  }
  if (schemaExige) {
    const suppleants = auteur && auteur[1] === 'A02' ? ['A12', 'A14'] : ['A02'];
    if (!lues.some((x) => x.lentille === 'schema' && suppleants.includes(x.code))) {
      ajouter(
        'schema_sans_approbation',
        `Revues — PR \`schema\` sans approbation de ${suppleants.join(' ou ')} : l'architecte remplace la ` +
          `troisième lentille et son refus est bloquant (docs/CONVENTIONS.md §5, fiche architecte).`
      );
    }
  }

  return fautes;
}

// ── lecture du dépôt ─────────────────────────────────────────────────────────

/** Une tâche telle que le registre la sert — champs absents compris. */
type TacheBrute = TacheDeLaPr & {
  paths?: string[];
  tests?: Record<string, string[]> | null;
  statut?: string | null;
  // La PROSE n'est pas projetée, mais elle est dans l'empreinte (GOV-078) : elle est déclarée ici
  // pour qu'un témoin puisse la réécrire sans passer par un transtypage.
  titre?: string;
  acceptance?: string | null;
};

/**
 * LA PROJECTION D'UNE TÂCHE, UNE FOIS — pour le registre de la tête comme pour celui de la base
 * (GOV-077). Deux projections divergeraient, et c'est la base qui dit si une PR a déclassé sa
 * propre tâche.
 */
export function projeter(brutes: readonly TacheBrute[]): Tache[];
export function projeter(brutes: readonly TacheBrute[] | null): Tache[] | null;
export function projeter(brutes: readonly TacheBrute[] | null): Tache[] | null {
  if (brutes === null) return null;
  return brutes.map((t) => ({
    id: t.id,
    // ⚠️ PLUS DE `?? []` (GOV-077) : un `sensible` ABSENT devenait un tableau vide, c'est-à-dire
    // la preuve d'une tâche non sensible — un échec OUVERT pour le risque de la PR.
    sensible: Array.isArray(t.sensible) ? [...t.sensible] : null,
    zone: t.zone ?? null,
    schema: t.schema === true,
    pr: t.pr ?? null,
    paths: t.paths ?? [],
    tests: t.tests ?? null,
    empreinte: empreinteDeLEntree(t),
    // ⚠️ `statut` FAIT PARTIE DE LA PROJECTION (GOV-096) : sans lui, le refus « une PR ne rouvre
    // pas une tâche livrée » lirait `undefined` sur chaque tâche et ne tirerait JAMAIS — le même
    // défaut, exactement, que l'absence de `pr` a produit deux fois (voir `lireDepot()`).
    statut: t.statut ?? null,
  }));
}

function lireDepot(): Depot {
  for (const f of [
    CHEMIN_GABARIT,
    CHEMIN_CODEOWNERS,
    CHEMIN_CHARTE,
    CHEMIN_FICHE_ARCHITECTE,
    CHEMIN_TACHES,
  ]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:pr — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  // ⚠️ `pr` FAIT PARTIE DE LA PROJECTION, et son absence a rendu DEUX correctifs inertes.
  // `tachesDeLaPr()` apparie sur `t.pr === <numero>` OU sur l identifiant du titre. Tant que la
  // projection laissait `pr` de cote, la moitie `numero` ne pouvait JAMAIS apparier : la
  // derivation unique se reduisait silencieusement a la seule tache du titre — exactement le
  // defaut qu elle etait censee fermer. Trouve le 2026-09-05 parce qu un temoin neuf refusait de
  // rougir : c est le temoin qui a revele que le correctif ne faisait rien, pas la relecture.
  const taches = projeter(
    (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: TacheBrute[] }).taches
  );
  return {
    gabarit: readFileSync(CHEMIN_GABARIT, 'utf8'),
    codeowners: readFileSync(CHEMIN_CODEOWNERS, 'utf8'),
    charte: readFileSync(CHEMIN_CHARTE, 'utf8'),
    architecte: readFileSync(CHEMIN_FICHE_ARCHITECTE, 'utf8'),
    fiches: readdirSync(CHEMIN_FICHES)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3)),
    taches,
  };
}

/**
 * La PR, lue chez GitHub. La forme des champs vient des commandes, pas d'une invention.
 *
 * ⚠️ LES REVUES SE LISENT SUR L'INTERFACE REST, PAS SUR `gh pr view --json reviews`. Deux raisons,
 * toutes deux mesurées : la vue de l'outil ne sert PAS `commit_id` — sans lui le pas 5 du
 * protocole (« le diff approuvé est le diff fusionné ») n'est pas vérifiable — et
 * `scripts/lot/corps-de-pr.ts` lit déjà `GET /pulls/{n}/reviews`. Deux lectures de deux
 * endpoints différents, c'est exactement la divergence que cette PR retire : une seule source,
 * un seul lecteur.
 */
function prParGh(numero: string, moment: DemandeDeConcordance['moment'] = 'avant-fusion'): Pr {
  const meta = JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'view', numero, '--json', 'title,body,labels,headRefOid,mergeCommit,baseRefName'],
      {
        encoding: 'utf8',
        maxBuffer: 32e6,
      }
    )
  ) as {
    title: string;
    body: string;
    headRefOid: string;
    labels: { name: string }[];
    /** Ne vaut quelque chose qu'une fois la PR fusionnée — d'où le type nullable, qui FORCE
     *  l'appelant à dire ce qu'il fait de l'absence au lieu de la découvrir à l'exécution. */
    mergeCommit: { oid: string } | null;
    baseRefName: string;
  };
  const revues = JSON.parse(
    execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${numero}/reviews`, '--paginate'], {
      encoding: 'utf8',
      maxBuffer: 32e6,
    })
  ) as RevueBrute[];
  // ⚠️ LES FICHIERS SE LISENT PAR L'INTERFACE REST PAGINÉE, PAS PAR `gh pr view --json files`, qui
  // PLAFONNE À 100 (GOV-077). Le risque de la PR se lit sur ses fichiers : un fichier de code
  // produit au 101ᵉ rang serait invisible, et la PR se relirait en ordinaire. C'est la forme que
  // `scripts/lot/corps-de-pr.ts` emploie déjà.
  // Un fichier RENOMMÉ compte par sa source ET sa destination : `cheminsTouches()`, l'extraction
  // unique partagée avec le composeur (refus de `securite`, 2026-09-19).
  const entreesDeFichiers = JSON.parse(
    execFileSync('gh', ['api', '--paginate', `repos/{owner}/{repo}/pulls/${numero}/files`], {
      encoding: 'utf8',
      maxBuffer: 32e6,
    })
  ) as EntreeDeFichier[];
  // ⚠️ ET CETTE LISTE PLAFONNE SANS ERREUR : on la compare au nombre que la PR ANNONCE. Une liste
  // plus courte, ou un compte au plafond, rend la PR élevée (`ListeDesFichiers`).
  const annoncees = Number(
    execFileSync('gh', ['api', `repos/{owner}/{repo}/pulls/${numero}`, '--jq', '.changed_files'], {
      encoding: 'utf8',
    }).trim()
  );
  // Un avis posté en COMMENTAIRE D'ISSUE ne compte pour rien (la PR 41) : on le lit pour le DIRE.
  const commentaires = JSON.parse(
    execFileSync('gh', ['api', '--paginate', `repos/{owner}/{repo}/issues/${numero}/comments`], {
      encoding: 'utf8',
      maxBuffer: 32e6,
    })
  ) as CommentaireBrut[];
  // ⚠️ LA TÊTE QUE LA FORGE RAPPORTE PEUT ÊTRE PÉRIMÉE, ET C'EST ICI QUE ÇA COMPTE LE PLUS.
  //
  // Cette valeur alimente `entree.tete`, dont `scripts/lot/revues.ts` dérive `perimees` puis
  // `coche`. Une tête en retard fait donc compter COURANTS des accords rendus sur le diff
  // PRÉCÉDENT — sur la gate que `docs/CHARTE-AGENTS.md` appelle « le seul moment où les revues
  // existent ». Veto de la lentille `securite` au 10e tour, et il visait juste : la garde avait
  // été posée sur le COMPOSEUR, qui décrit, et pas sur la GATE, qui autorise.
  //
  // On refuse plutôt que de juger un diff qui n'est pas celui qu'on fusionnera.
  //
  // ⚠️ ET POURQUOI CETTE GARDE NE PEUT PAS ROUGIR EN CI, ce qui la rendrait INSATISFIABLE :
  // `prParGh()` n'est appelé que sous `--pr` ou `--apres-fusion`, et le workflow lance
  // `pnpm gov:pr` SANS argument — les familles de revue ne sont donc évaluées qu'à la main,
  // juste avant de fusionner. En CI l'arbre est sur `refs/pull/N/merge`, dont le sha ne peut
  // PAS coïncider avec `headRefOid` : y câbler `--pr` rendrait cette garde impossible à
  // satisfaire, et une gate insatisfiable se fait retirer dans la semaine. Avertissement de la
  // lentille `schema` au 10e tour, vérifié : `pnpm gov:pr` sans argument rend 0 et n'imprime
  // aucun message de tête.
  // ⚠️ CE QU'ON COMPARE N'EST PAS LE MÊME OBJET SELON LE MOMENT — motif BLOQUANT de la lentille
  // `schema` au 11e tour, atteint indépendamment par `securite`. La confrontation vivait ici, dans
  // `prParGh()`, donc elle s'appliquait AUSSI à `--apres-fusion` : après un `--squash
  // --delete-branch`, `headRefOid` et la base diffèrent par construction POUR TOUJOURS, et la
  // branche n'existe plus ni en local ni sur la forge. Le pas 8 était devenu INSATISFIABLE, et son
  // message prescrivait « pousse d'abord » sur une branche supprimée aux deux bouts.
  //
  // Le remède n'est PAS de ne rien contrôler après fusion : le pas 8 atteste un ATTERRISSAGE, donc
  // on compare la base (`origin/<base>`) au `mergeCommit` que la forge rapporte. La propriété
  // devient vraie, vérifiable et satisfiable au lieu d'être supprimée.
  //
  // Et la décision ENTIÈRE — comparaison, message, sens de défaillance — vit dans
  // `jugerLesTetes()`, au module PARTAGÉ : ne partager que le prédicat laissait diverger tout le
  // reste, et c'est précisément ce qui a divergé.
  // ⚠️ CE QU'ON DEMANDE N'EST PAS LA MÊME PROPRIÉTÉ AUX DEUX MOMENTS — lentille `schema`,
  // 12e tour. Avant fusion : une ÉGALITÉ (le diff approuvé est le diff fusionné). Après fusion :
  // une ANCESTRALITÉ (la fusion a atteint la base). Juger le second par une égalité rendait le
  // pas 8 satisfiable pour la SEULE PR la plus récente et faux pour toutes les autres, à jamais.
  // La demande est une union discriminée : le mauvais appariement ne compile plus.
  // ⚠️ LES DEUX OPÉRANDES SONT NOMMÉS UNE FOIS (RM-01). Ils étaient retapés deux fois chacun —
  // relevé par la lentille `schema` au 13e tour : `mergeCommit` en deux endroits, la base en deux
  // autres. Deux écritures de la même valeur finissent par diverger, et ici la divergence
  // s'appellerait « attester un atterrissage sur la mauvaise référence ».
  const refBase = `origin/${meta.baseRefName ?? 'main'}`;
  const shaFusion = meta.mergeCommit?.oid ?? '';
  const demande: DemandeDeConcordance =
    moment === 'apres-fusion'
      ? {
          moment: 'apres-fusion',
          mergeCommit: shaFusion,
          base: refBase,
          // 🔴 CE BOOLÉEN EST LA SEULE ATTESTATION MÉCANIQUE DE L'ATTERRISSAGE — même lentille,
          // même tour. `estAncetre: true` reste EXPRIMABLE ici, et aucun témoin d'effet ne peut le
          // tuer : le seul lancement réel vise une PR qui A atterri, donc `true` y serait juste.
          // C'est un témoin de SOURCE qui garde ce câblage (`tete-de-pr-concorde.spec.ts`), et il
          // est écrit là-bas ce qu'il ne prouve pas.
          estAncetre: estAncetreDe(shaFusion, refBase),
        }
      : {
          moment: 'avant-fusion',
          teteLocale: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }),
          teteForge: meta.headRefOid ?? '',
        };

  const verdictTete = jugerLesTetes(demande);
  if (!verdictTete.concordent) {
    for (const ligne of verdictTete.message) console.error(ligne.replace('❌ ', '❌ gov:pr — '));
    process.exit(1);
  }

  return prDepuisLaForge({
    numero,
    meta,
    entrees: entreesDeFichiers,
    annoncees,
    revues,
    commentaires,
    // Le registre de la BASE — `origin/<base>`, la même référence que le pas 8. Illisible (ref
    // absente en local) → `null` → risque ÉLEVÉ : le sens de défaillance reste fermé.
    tachesBase: projeter(tachesDeLaBase(refBase)),
  });
}

/**
 * LA PARTIE PURE DE `prParGh()` — ce que la garde FAIT des réponses de la forge, séparé de la
 * façon de les obtenir, pour que `--prove` l'exerce sans réseau (lentille `mutation`, PR 64 : les
 * appelants de `cheminsTouches()` n'étaient exercés par rien, et chacun survivait à un retour au
 * seul `filename`).
 */
function prDepuisLaForge(r: {
  numero: string;
  meta: {
    title: string;
    body: string | null;
    headRefOid: string | null;
    labels: { name: string }[];
  };
  entrees: EntreeDeFichier[];
  /** `changed_files` de la PR. */
  annoncees: number;
  revues: RevueBrute[];
  commentaires: CommentaireBrut[];
  tachesBase: Tache[] | null;
}): Pr {
  return {
    numero: Number(r.numero),
    titre: r.meta.title,
    corps: r.meta.body ?? '',
    labels: (r.meta.labels ?? []).map((l) => l.name),
    // Un fichier RENOMMÉ compte par sa source ET sa destination : `cheminsTouches()`, l'extraction
    // unique partagée avec le composeur (refus de `securite`, 2026-09-19).
    fichiers: cheminsTouches(r.entrees),
    revues: r.revues,
    commentaires: r.commentaires,
    tachesBase: r.tachesBase,
    liste: {
      source: 'forge',
      lues: r.entrees.length,
      annoncees: Number.isInteger(r.annoncees) ? r.annoncees : null,
    },
    // ⚠️ Après fusion la branche est SUPPRIMéE : `headRefOid` désigne un objet mort, et c'est
    // pourtant lui dont dérivent `perimees`, `lentille_perimee` et la coche de DoD. La lentille
    // `schema` (12e tour) : deux notions de « tête » dans un même run. On garde `headRefOid`
    // parce que c'est bien la tête SUR LAQUELLE LES REVUES ONT ÉTÉ RENDUES — la bonne référence
    // pour juger leur péremption — et on l'écrit ici pour que personne ne la confonde avec ce que
    // le pas 8 confronte, qui est le `mergeCommit`.
    tete: r.meta.headRefOid ?? null,
  };
}

/** Ce sha désigne-t-il un commit que CE clone peut lire ? Aucune sortie, aucun effet. */
export function objetLisible(sha: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * DEUX CAUSES, DEUX REMÈDES — et le message d'origine accusait la mauvaise.
 *
 * Il prescrivait `fetch-depth: 0` sur `actions/checkout`. Or ce réglage est DÉJÀ posé, sur cette
 * action même, dans `.github/workflows/ci.yml` — vérifié plutôt que supposé —, et l'échec mesuré
 * sur la fusion de la PR 89 ne venait pas de là : la tête de la PR avait été
 * SUPPRIMÉE par `gh pr merge --delete-branch`, et `fetch-depth: 0` ne ramène que les objets
 * ATTEIGNABLES depuis une référence — il n'a jamais pu ramener un commit qui n'en a plus aucune.
 * « Pose `fetch-depth: 0` » envoyait donc réparer ce qui n'est pas cassé, sur une gate déjà rouge.
 * C'est le défaut que le `catch` de `--pr`, plus bas, nomme en toutes lettres : *le sens de
 * défaillance reste fermé ; c'est le DIAGNOSTIC qui ment, et un diagnostic qui ment fait perdre le
 * temps qu'une garde est censée faire gagner.*
 *
 * ⛔ LE MESSAGE D'ORIGINE N'EST PAS REMPLACÉ, ET CE N'EST PAS UN MÉNAGEMENT : il reste VRAI dans son
 * cas. Un clone court (`fetch-depth: 1`, le défaut d'`actions/checkout`) ne contient pas le sha de
 * base, et c'est bien `fetch-depth: 0` qui le répare. Effacer un message juste serait une seconde
 * faute par-dessus la première. La branche manquante est donc AJOUTÉE à côté.
 *
 * Le partage se fait sur la LISIBILITÉ des deux extrémités, et non sur le texte de l'erreur de
 * `git` : ce texte varie avec la version et l'abréviation des sha (« Invalid symmetric difference
 * expression » quand les deux côtés ont la forme d'un sha, « ambiguous argument » sinon), alors que
 * la question « quel objet ce clone sait-il lire ? » a une réponse stable.
 *   — base lisible, tête absente  → la tête a disparu : ce run n'a rien à mesurer ;
 *   — tout le reste (base absente, ou les deux) → le clone est trop court, message d'origine.
 * Le sens de défaillance reste FERMÉ dans les deux cas : `prParEvenement()` sort en 1.
 */
function diagnosticDuDiffImpossible(
  extremites: { base: string; tete: string },
  lisible: (sha: string) => boolean
): string[] {
  if (lisible(extremites.base) && !lisible(extremites.tete)) {
    return [
      `❌ gov:pr — la tête de la PR (${extremites.tete}) n’existe dans AUCUNE référence de ce ` +
        `clone, alors que sa base (${extremites.base}) y est lisible.`,
      `   Ce n’est PAS un défaut de profondeur : \`fetch-depth: 0\` ne ramène que les objets ` +
        `ATTEIGNABLES depuis une référence, et une PR fusionnée avec \`--delete-branch\` n’en a ` +
        `plus aucune. Ne va rien changer à \`actions/checkout\`.`,
      `   Ce job n’a rien à mesurer sur une PR déjà fusionnée : c’est le \`if:\` du job \`gate-a\` ` +
        `(\`.github/workflows/ci.yml\`) qui l’écarte, et le diff fusionné se mesure au run ` +
        `\`push: main\` du même sha.`,
    ];
  }
  return [
    `❌ gov:pr — impossible de lister les fichiers de la PR (\`git diff\`). Le job doit poser ` +
      `\`fetch-depth: 0\` sur actions/checkout, sinon la moitié des familles ne contrôle rien.`,
  ];
}

/** L'événement GitHub Actions : titre, corps, labels. Les revues n'y sont PAS. */
function prParEvenement(): Pr | null {
  const chemin = process.env['GITHUB_EVENT_PATH'];
  if (!chemin || !existsSync(chemin)) return null;
  const ev = JSON.parse(readFileSync(chemin, 'utf8')) as { pull_request?: PrDeLEvenement };
  if (!ev.pull_request) return null;
  let sortieDuDiff = '';
  try {
    // `--name-status -z` et non `--name-only` : ce dernier ne rend que la DESTINATION d'un
    // renommage, et cite entre guillemets un chemin non ASCII. Source et destination passent par
    // l'extraction unique (`entreesDuDiff`, `cheminsTouches`), avec les options qu'elle sait lire.
    sortieDuDiff = execFileSync(
      'git',
      [...OPTIONS_DU_DIFF, `${ev.pull_request.base.sha}...${ev.pull_request.head.sha}`],
      {
        encoding: 'utf8',
        maxBuffer: 64e6,
      }
    );
  } catch {
    for (const ligne of diagnosticDuDiffImpossible(
      { base: ev.pull_request.base.sha, tete: ev.pull_request.head.sha },
      objetLisible
    )) {
      console.error(ligne);
    }
    process.exit(1);
  }
  // La base de l'événement est un sha : `fetch-depth: 0` le rend lisible (voir ci-dessus).
  return prDepuisLEvenement(
    ev.pull_request,
    sortieDuDiff,
    projeter(tachesDeLaBase(ev.pull_request.base.sha))
  );
}

/** La PR telle que l'événement `pull_request` la sert. */
type PrDeLEvenement = {
  number?: number;
  title: string;
  body: string | null;
  labels: { name: string }[];
  base: { sha: string };
  head: { sha: string };
};

/**
 * LA PARTIE PURE DE `prParEvenement()` — même raison que `prDepuisLaForge()` : `--prove` l'exerce
 * sur une sortie de `git diff --name-status -z` fabriquée, sans dépôt.
 */
function prDepuisLEvenement(
  pr: PrDeLEvenement,
  sortieDuDiff: string,
  tachesBase: Tache[] | null
): Pr {
  return {
    numero: pr.number ?? null,
    titre: pr.title,
    corps: pr.body ?? '',
    labels: pr.labels.map((l) => l.name),
    // `--name-status -z` et non `--name-only` : ce dernier ne rend que la DESTINATION d'un
    // renommage. Source et destination passent par l'extraction unique.
    fichiers: cheminsTouches(entreesDuDiff(sortieDuDiff)),
    revues: null,
    // `git diff` sur l'arbre : la liste est complète par construction.
    liste: { source: 'complete' },
    tachesBase,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────

/**
 * La fixture de PR est CONSTRUITE À PARTIR DU GABARIT LIVRÉ (RM-03) : si le gabarit change, la
 * fixture change avec lui. `remplacer` VÉRIFIE que la cible existe au lieu de la fabriquer
 * (RM-11) — un remplissage qui « complète » silencieusement rendrait la preuve fausse le jour où
 * un champ disparaîtrait du gabarit.
 * Source : `.github/PULL_REQUEST_TEMPLATE.md`, livré par GOV-007.
 */
function remplacer(texte: string, cible: string, valeur: string): string {
  if (!texte.includes(cible)) {
    console.error(
      `❌ gov:pr --prove — le gabarit ne contient plus « ${cible} » : la fixture ne peut pas en être dérivée.`
    );
    process.exit(1);
  }
  return texte.split(cible).join(valeur);
}

function remplacerBloc(corps: string, nom: string, contenu: string): string {
  const ouvre = `<!-- ${nom}:debut -->`;
  const ferme = `<!-- ${nom}:fin -->`;
  const d = corps.indexOf(ouvre);
  const f = corps.indexOf(ferme);
  if (d < 0 || f < 0) {
    console.error(`❌ gov:pr --prove — bloc « ${nom} » introuvable dans la fixture.`);
    process.exit(1);
  }
  return corps.slice(0, d + ouvre.length) + `\n${contenu}\n` + corps.slice(f);
}

function corpsRempli(gabarit: string): string {
  let c = gabarit;
  c = remplacer(c, 'Auteur: A__', 'Auteur: A05');
  c = remplacer(
    c,
    'Relecteur: A__ exactitude · A__ securite · A__ simplicite · A__ mutation',
    'Relecteur: A09 exactitude · A09 securite · A09 simplicite · A10 mutation'
  );
  c = remplacer(c, 'Couvre: REQ-___', 'Couvre: REQ-GOV-010, REQ-GOV-011, REQ-GOV-012, REQ-GOV-013');
  c = remplacer(c, '- [ ]', '- [x]');
  c = remplacerBloc(
    c,
    'rouge-vert',
    "ROUGE : FAIL tests/gov/charte-pr.spec.ts > REQ-GOV-013 — Error: ENOENT, open '.github/PULL_REQUEST_TEMPLATE.md'\n" +
      'VERT : 8 cases comptées entre les marqueurs dod, 0 hors du bloc\n' +
      'Rouge constaté par: A05'
  );
  return c;
}

/**
 * VRAI quand ce fichier est LANCÉ, faux quand il est IMPORTÉ (GOV-078).
 *
 * Sans ce garde-fou, la spécification de cette garde ne peut pas l'importer : le corps exécutable
 * partait à l'import, lisait le dépôt et sortait par `process.exit` — ce qui tue le worker
 * `vitest` avant le premier `it`. Une lecture qu'on ne peut pas importer finit recopiée.
 *
 * ⚠️ LES DEUX SÉPARATEURS : `process.argv[1]` porte le chemin natif, et sous Windows il n'y a pas
 * une seule barre oblique dedans.
 */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]gov-pr(\.ts)?$/.test(process.argv[1] ?? '');

// ── le corps EXÉCUTABLE, sous le garde-fou d'import ──────────────────────────
if (LANCE_EN_SCRIPT) {
  // Une garde qui lit un statut ne tourne pas sur un barème incomplet sans le dire.
  // ⚠️ SOUS le garde-fou, et non au chargement du module : `gov-sonde.ts` importe `objetLisible`
  // d'ici, et lancée hors de la racine (le bac de sable de `affirmations-verifiees.spec.ts`) elle
  // mourait sur `ENOENT scripts/lot/tasks.schema.json` — une vérification de CETTE garde.
  {
    const ecarts = verifierExhaustivite();
    if (ecarts.length > 0) {
      console.error('❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :');
      ecarts.forEach((e) => console.error('   ' + e));
      process.exit(1);
    }
  }
  if (process.argv.includes('--prove')) {
    const depot = lireDepot();

    const base = controler(depot, null);
    if (base.length > 0) {
      console.error(
        `❌ La preuve part d'un dépôt DÉJÀ fautif (${base.length}) — corrige d'abord :`
      );
      base.slice(0, 8).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
      process.exit(1);
    }

    const CORPS = corpsRempli(depot.gabarit);

    /**
     * LA FORME D'UNE REVUE DE FIXTURE EST CELLE DU PRODUCTEUR (RM-03). Elle portait auparavant
     * trois champs inventés — `{ auteur, etat, corps }` — qu'aucune interface ne sert, et c'est
     * précisément parce que la fixture était plus PAUVRE que la réponse réelle que trois des quatre
     * champs qui authentifient une revue n'ont jamais été mis à l'épreuve. Source de la forme :
     * `GET /repos/{owner}/{repo}/pulls/{n}/reviews`, capturée dans
     * `tests/fixtures/github/revues-pr-31.json` le 2026-09-05.
     */
    const TETE_TEMOIN = '41bc8140b9ea436be809676538dd65cb2263a5bc';
    const revue = (corps: string, retouche: Partial<RevueBrute> = {}): RevueBrute => ({
      user: { login: 'will383842' },
      author_association: 'OWNER',
      state: ETAT_APPROUVE,
      commit_id: TETE_TEMOIN,
      body: corps,
      ...retouche,
    });
    /** Le premier mot d'un corps de revue — ce qui la désigne dans un témoin. */
    const ouvrePar = (r: RevueBrute, entete: string): boolean => (r.body ?? '').startsWith(entete);

    /**
     * Les chemins qu'une tâche du registre déclare — source des fixtures. On LÈVE si la tâche a
     * disparu : une fixture dérivée d'une tâche absente serait dérivée de rien, et son vert serait
     * l'absence de contrôle déguisée en preuve (RM-11).
     */
    const cheminsDe = (id: string): string[] => {
      const t = depot.taches.find((x) => x.id === id);
      if (!t) {
        throw new Error(
          `gov:pr --prove — la tâche ${id} a disparu de ${CHEMIN_TACHES} : les fixtures ne peuvent ` +
            `plus en dériver leurs fichiers, et un contre-témoin vert ne prouverait plus rien.`
        );
      }
      return cheminsDeLaTache(t);
    };

    const PR_TEMOIN: Pr = {
      // ⚠️ LE TITRE NOMME UNE TÂCHE QUI N'EST PAS `schema`, ET C'EST DÉLIBÉRÉ. Depuis que le
      // discriminant lit AUSSI le champ `schema` de la tâche portée par la PR, une fixture
      // intitulée `feat(GOV-007)` réclamerait la lentille bloquante de l'architecte — GOV-007
      // déclare `prisma/schema.prisma` dans ses `paths`. La PR témoin « ordinaire » doit être
      // ordinaire jusque dans sa tâche : c'est `PR_SCHEMA` qui porte GOV-007, et elle a le label,
      // le fichier et l'avis d'A02. Une fixture qui se contredit prouve la garde par accident.
      titre: 'feat(GOV-011): matrice de traçabilité dérivée',
      corps: CORPS,
      labels: [],
      // ⚠️ LES FICHIERS DE CODE DE LA FIXTURE SE DÉRIVENT DE LA TÂCHE QUE SON TITRE NOMME (RM-03).
      // Ils étaient TAPÉS — `scripts/gates/gov-pr.ts` et `tests/gov/charte-pr.spec.ts` — et GOV-011
      // ne déclare ni l'un ni l'autre : la PR « conforme » de la preuve était elle-même une instance
      // du défaut que GOV-056 ferme, et elle faisait rougir la famille neuve en contre-témoin. Une
      // fixture conforme par accident ne prouve rien ; celle-ci l'est par construction, et elle le
      // reste le jour où les `paths` de GOV-011 changent.
      // ⚠️ `docs/CHARTE-AGENTS.md` APPARTIENT À LA GARDE DES REVUES (GOV-077) : cette PR est donc
      // de risque ÉLEVÉ, et exige quatre lentilles — ce qui garde rouge le témoin `slice(0, 2)` de
      // `lentilles_manquantes`. Élevée par ce fichier-là, pas par sa tâche : `PR_ORDINAIRE`
      // ci-dessous est la PR ordinaire EXPLICITE, et le témoin du cas 1 fait monter le risque par la tâche.
      fichiers: [
        'docs/CHARTE-AGENTS.md',
        '.github/PULL_REQUEST_TEMPLATE.md',
        ...cheminsDe('GOV-011'),
      ],
      // La base de la PR, FOURNIE (jamais de `git` dans une fixture) : ici, le registre du dépôt.
      tachesBase: depot.taches,
      // La liste des fichiers d'une fixture est fournie ENTIÈRE ; la liste tronquée a son témoin.
      liste: { source: 'complete' },
      revues: [
        revue('A09 · exactitude\nVerdict: accepte\nles quatre REQ sont couvertes'),
        revue('A09 · securite\nVerdict: accepte\nrien à signaler'),
        revue('A09 · simplicite\nVerdict: accepte\nle §7 est lu, pas recopié'),
        revue('A10 · mutation\nVerdict: accepte\nmarqueur dupliqué : la garde rougit'),
      ],
      tete: TETE_TEMOIN,
    };
    const copiePr = (p: Pr): Pr => JSON.parse(JSON.stringify(p)) as Pr;
    /** Vide la DERNIÈRE case cochée du corps — la huitième, celle qui atteste l'atterrissage. */
    const videLaDerniereCase = (corps: string): string => {
      const l = corps.split(SAUT);
      for (let i = l.length - 1; i >= 0; i--) {
        const ligne = l[i];
        if (ligne !== undefined && ligne.startsWith('- [x]')) {
          l[i] = ligne.replace('- [x]', '- [ ]');
          break;
        }
      }
      return l.join(SAUT);
    };
    const copieDepot = (): Depot => ({ ...depot, fiches: [...depot.fiches] });

    const PR_SCHEMA: Pr = {
      ...copiePr(PR_TEMOIN),
      titre: 'feat(GOV-007): forme des contrats',
      labels: ['schema'],
      fichiers: ['prisma/schema.prisma'],
      revues: [
        revue('A09 · exactitude\nVerdict: accepte\nok'),
        revue('A09 · securite\nVerdict: accepte\nok'),
        revue('A02 · schema\nVerdict: accepte\nmigration additive, aucune perte'),
        revue('A10 · mutation\nVerdict: accepte\nvue rougir'),
      ],
    };
    PR_SCHEMA.corps = remplacer(
      PR_SCHEMA.corps,
      'Relecteur: A09 exactitude · A09 securite · A09 simplicite · A10 mutation',
      'Relecteur: A09 exactitude · A09 securite · A02 schema · A10 mutation'
    );

    const PR_SENSIBLE: Pr = {
      ...copiePr(PR_TEMOIN),
      // `auth/` est une zone sensible ; le reste vient de la tâche du titre, pour que cette fixture
      // ne rougisse que sur ce qu'elle veut prouver (RM-11 : un témoin ne fait varier qu'une chose).
      fichiers: ['auth/session.ts', ...cheminsDe('GOV-011')],
    };
    PR_SENSIBLE.corps = remplacerBloc(
      PR_SENSIBLE.corps,
      'attaque',
      "scénario : session de l'apporteur A appelée avec l'identifiant de B\nrésultat : 404 identique au 404 d'un identifiant inexistant\njoué par : A13"
    );

    const PR_RESERVE: Pr = {
      ...copiePr(PR_TEMOIN),
      titre: 'chore(GOV-011): compose le lot',
      labels: ['role:gardien-spec'],
      fichiers: ['docs/tasks.json'],
    };

    /**
     * cas 0 — LA PR ORDINAIRE, EXPLICITE (GOV-077). `PR_TEMOIN` ne l'est pas, et PAR ACCIDENT : ses
     * fichiers portent `docs/CHARTE-AGENTS.md`, qui appartient à la garde des revues — donc risque
     * ÉLEVÉ, donc quatre lentilles. Une fixture conforme par accident ne prouve rien : celle-ci est
     * ordinaire par construction — tâche QA-T01, fichiers dérivés de ses `paths`, et la base
     * FOURNIE explicitement (jamais de `git` dans une fixture).
     */
    const PR_ORDINAIRE: Pr = {
      ...copiePr(PR_TEMOIN),
      titre: 'feat(QA-T01): aucune gate en continue-on-error',
      // Ses `paths` HORS `.github/` et hors de la RACINE : un fichier de CI ou de configuration à la
      // racine rend la PR élevée (décisions de l'orchestrateur du 2026-09-18 sur GOV-077) — ce sont
      // les témoins `AU_MILIEU` qui le prouvent.
      fichiers: cheminsDe('QA-T01').filter((f) => !f.startsWith(DOSSIER_CI) && f.includes('/')),
      // ⚠️ LABEL AJOUTÉ PAR GOV-090 — RESSERREMENT ASSUMÉ, PAS UN AJUSTEMENT POUR TAIRE UN ROUGE.
      // `partners/ADR-0019` fait entrer `docs/gates.json` au tableau du §7 : c'est une SOURCE
      // (`docs/GATES.md` en est la vue), `.claude/settings.json` la met déjà en `deny` sur `Write`
      // et `Edit`, et une de ses entrées peut porter `horsCi`, c'est-à-dire DISPENSER une garde de
      // tourner en CI. QA-T01 la déclare dans ses `paths`, donc cette fixture la touche, donc elle
      // doit porter le label — comme le devra toute PR réelle qui verse une entrée de registre.
      // Elle reste ORDINAIRE : `role:gardien-spec` n'entre dans aucun des trois signaux de risque,
      // et les témoins à deux lentilles qui suivent le prouvent.
      labels: ['role:gardien-spec'],
      revues: [
        revue('A09 · exactitude\nVerdict: accepte\nles REQ citees sont couvertes'),
        revue('A09 · securite\nVerdict: accepte\nrien a signaler'),
      ],
    };

    /**
     * cas 6 ter — la PR ordinaire, plus le fichier de CI que QA-T01 DÉCLARE, glissé AU MILIEU de ses
     * fichiers : risque élevé, donc deux lentilles ne suffisent plus.
     */
    const AU_MILIEU = (quoi: string, choisir: (f: string) => boolean): Pr => {
      const p = copiePr(PR_ORDINAIRE);
      const glisses = cheminsDe('QA-T01').filter(choisir);
      if (glisses.length === 0) {
        throw new Error(
          `gov:pr --prove — QA-T01 ne déclare plus de ${quoi} : le témoin ne mesure rien.`
        );
      }
      const m = Math.floor(p.fichiers.length / 2);
      p.fichiers = [...p.fichiers.slice(0, m), ...glisses, ...p.fichiers.slice(m)];
      return p;
    };
    const CI_AU_MILIEU = (): Pr => AU_MILIEU('fichier de CI', (f) => f.startsWith(DOSSIER_CI));
    /** cas 6 quater — un fichier de configuration à la RACINE (`vitest.config.ts`), au milieu. */
    const RACINE_AU_MILIEU = (): Pr => AU_MILIEU('fichier racine', (f) => !f.includes('/'));
    /**
     * cas 6 quinquies — un RENOMMAGE au milieu des fichiers, extrait par `cheminsTouches()`, la même
     * fonction que `prParGh()` : un fichier renommé compte par sa source ET sa destination.
     */
    const RENOMMAGE_AU_MILIEU = (source: string, destination: string): Pr => {
      const p = copiePr(PR_ORDINAIRE);
      const m = Math.floor(p.fichiers.length / 2);
      const entrees: EntreeDeFichier[] = [
        ...p.fichiers.slice(0, m).map((filename) => ({ filename })),
        { filename: destination, previous_filename: source, status: 'renamed' },
        ...p.fichiers.slice(m).map((filename) => ({ filename })),
      ];
      p.fichiers = cheminsTouches(entrees);
      return p;
    };

    /** cas 1 — un numéro de PR que le registre ne porte pas, posé sur les tâches que le cas choisit. */
    const PR_R1 = 9999;
    /**
     * GOV-097 — le dépôt où UNE tâche change de zone (et, s'il le faut, déclare un chemin de plus),
     * sur la tête comme sur la base : seule la zone varie (RM-11).
     */
    const depotAvecZone = (id: string, zone: string, cheminsEnPlus: string[] = []): Depot => {
      const d = copieDepot();
      d.taches = d.taches.map((t) =>
        t.id === id ? { ...t, zone, paths: [...t.paths, ...cheminsEnPlus] } : t
      );
      return d;
    };
    /** Un fichier de code produit hors de toute zone sensible (GOV-097). */
    const CODE_NEUTRE = 'src/app/tableau/page.tsx';

    const depotAvecPr = (ids: string[]): Depot => {
      const d = copieDepot();
      d.taches = d.taches.map((t) => (ids.includes(t.id) ? { ...t, pr: PR_R1 } : t));
      return d;
    };

    // ── GOV-096 : le champ `Lot:` ───────────────────────────────────────────────────────────────
    /**
     * Pose une valeur dans le champ `Lot:` du corps. Comme `remplacer()`, la fonction VÉRIFIE que
     * la cible existe (RM-11) : si le champ disparaissait du gabarit, un témoin silencieusement
     * inopérant vaudrait moins qu'un banc qui refuse. Elle LÈVE au lieu de sortir en 1 : c'est la
     * forme qu'emploient déjà `cheminsDe()` et les autres dérivations de fixture de ce bloc, et
     * ajouter une sortie non nulle de plus à ce fichier serait une ligne de dette au registre des
     * refus (`tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts`) pour rien.
     */
    const poserLeLot = (corps: string, valeur: string): string => {
      if (!/^Lot:.*$/m.test(corps)) {
        throw new Error(
          `gov:pr --prove — le gabarit ne porte plus de champ \`Lot:\` : les témoins de GOV-096 ` +
            `ne peuvent plus en être dérivés.`
        );
      }
      return corps.replace(/^Lot:.*$/m, `Lot: ${valeur}`);
    };

    /**
     * DES TÂCHES DU REGISTRE QUI N'AJOUTENT RIEN D'AUTRE AU VERDICT QUE LEURS CHEMINS (RM-11 : un
     * témoin ne fait varier qu'une chose). Ni `sensible`, ni `schema`, ni livrée, ni déjà rattachée
     * à une PR ; et tous leurs chemins sous le périmètre du CODE, pour qu'aucune ne fasse monter le
     * risque ou réclamer un label par un fichier de CI, de racine ou de schéma.
     */
    const compagnonsDeLot = (combien: number, saufId: string): Tache[] => {
      const eligibles = depot.taches.filter((t) => {
        if (t.id === saufId || t.pr !== null) return false;
        if (t.statut === null || LIVREES.has(t.statut)) return false;
        if (t.schema !== false) return false;
        if (!Array.isArray(t.sensible) || t.sensible.length > 0) return false;
        const chemins = cheminsDeLaTache(t);
        return (
          chemins.length > 0 && chemins.every((c) => PERIMETRE_DU_CODE.some((p) => c.startsWith(p)))
        );
      });
      if (eligibles.length < combien) {
        throw new Error(
          `gov:pr --prove — ${eligibles.length} tâche(s) éligible(s) pour ${combien} compagnon(s) de ` +
            `lot : le témoin de la PR de lot ne mesurerait plus rien.`
        );
      }
      return eligibles.slice(0, combien);
    };

    /**
     * LA PR DE LOT — LE DÉFAUT MESURÉ LE 2026-09-23 SUR LA PR #114, DANS SA PLUS PETITE FORME.
     * Son titre nomme une tâche ; ses fichiers sont ceux de cette tâche PLUS ceux de deux autres
     * tâches du registre. Sans le champ `Lot:`, les deux autres ne résolvent par rien et leurs
     * fichiers sont refusés comme « hors des `paths` des tâches » ; avec lui, la PR est verte.
     * Les deux faces sont livrées ensemble : sans le contre-témoin, on ne saurait pas si le champ
     * RÉSOUT ou s'il a seulement fait taire la famille.
     */
    const PR_DE_LOT = (avecLeChamp: boolean): Pr => {
      const compagnons = compagnonsDeLot(2, 'GOV-011');
      const p = copiePr(PR_TEMOIN);
      p.numero = PR_R1;
      p.fichiers = [...PR_TEMOIN.fichiers, ...compagnons.flatMap((t) => cheminsDeLaTache(t))];
      if (avecLeChamp) p.corps = poserLeLot(p.corps, compagnons.map((t) => t.id).join(', '));
      return p;
    };

    /**
     * LA PR ORDINAIRE, PLUS UNE TÂCHE SENSIBLE DÉCLARÉE PAR SON SEUL `Lot:` — refus d'`exactitude`
     * sur #118 (review 5313211711). L'acceptance (8) de GOV-096 promet que le lot fait MONTER le
     * risque et exiger la section Attaque ; muter `idsDuLot` ou `lot.ids` en `[]` laissait pourtant
     * toute la preuve verte. Ici AUCUN fichier n'est ajouté : ni zone sensible, ni fichier produit,
     * ni tâche du titre sensible. La seule chose qui peut élever cette PR est la tâche du `Lot:`.
     */
    const PR_DE_LOT_SENSIBLE = (): Pr => {
      const sensible = depot.taches.find(
        (t) =>
          t.id !== 'QA-T01' &&
          t.pr === null &&
          t.statut !== null &&
          !LIVREES.has(t.statut) &&
          Array.isArray(t.sensible) &&
          t.sensible.length > 0
      );
      if (sensible === undefined) {
        throw new Error(
          `gov:pr --prove — aucune tâche sensible ouverte au registre : le témoin du lot qui élève ` +
            `le risque ne mesurerait plus rien.`
        );
      }
      const p = copiePr(PR_ORDINAIRE);
      p.corps = poserLeLot(p.corps, sensible.id);
      return p;
    };

    type Temoin = { famille: string; defaut: () => [Depot, Pr | null] };
    const TEMOINS: Temoin[] = [
      // ---- structure
      {
        famille: 'marqueur_hors_norme',
        // Le défaut EXACT du premier jet : l'en-tête écrivait les délimiteurs à l'intérieur de
        // lui-même, ce qui plaçait une seconde occurrence de chaque marqueur avant les vraies.
        defaut: () => [{ ...copieDepot(), gabarit: depot.gabarit + '\n<!-- dod:fin -->\n' }, null],
      },
      {
        famille: 'dod_hors_bloc',
        defaut: () => [
          { ...copieDepot(), gabarit: depot.gabarit + '\n- [ ] Règle maison appliquée\n' },
          null,
        ],
      },
      {
        famille: 'champ_gabarit_absent',
        // `split/join` et non `replace` : le gabarit cite « Couvre: » DEUX fois (le champ et la
        // première case), et n'en retirer qu'une laissait la famille verte — le témoin ne prouvait rien.
        defaut: () => [
          { ...copieDepot(), gabarit: depot.gabarit.split('Couvre:').join('Concerne:') },
          null,
        ],
      },
      {
        famille: 'codeowners_non_resolvable',
        defaut: () => [
          { ...copieDepot(), codeowners: depot.codeowners.replace(/@will383842/g, '@A02') },
          null,
        ],
      },
      {
        famille: 'charte_poste_manquant',
        defaut: () => [
          { ...copieDepot(), charte: depot.charte.replace(/^\| A07 \|.*$/m, '') },
          null,
        ],
      },
      {
        famille: 'charte_lentille_non_derivee',
        defaut: () => [
          {
            ...copieDepot(),
            charte: depot.charte.replace(/troisième lentille/g, 'quatrième lentille'),
          },
          null,
        ],
      },
      // ---- la PR, sans les revues
      {
        famille: 'titre_non_conforme',
        defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), titre: 'charte des agents' }],
      },
      {
        famille: 'relecteur_est_auteur',
        // la fixture rouge de docs/gates.json : « PR témoin où l'auteur s'auto-approuve »
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = p.corps.replace('Auteur: A05', 'Auteur: A09');
          return [copieDepot(), p];
        },
      },
      {
        famille: 'dod_incomplete',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          // une case RETIREE du bloc : le gabarit n'en porte plus huit du tout
          const sansUne = p.corps.split('\n');
          sansUne.splice(
            sansUne.findIndex((l) => l.startsWith('- [')),
            1
          );
          p.corps = sansUne.join('\n');
          return [copieDepot(), p];
        },
      },
      {
        famille: 'rouge_vert_absent',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = remplacerBloc(
            p.corps,
            'rouge-vert',
            'ROUGE : (colle ici le message)\nVERT : ok'
          );
          return [copieDepot(), p];
        },
      },
      {
        famille: 'attaque_absente',
        defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), fichiers: ['auth/session.ts'] }],
      },
      {
        // LA MEME FAMILLE PAR L'AUTRE BRANCHE, et c'est celle qui manquait. Le temoin ci-dessus
        // passe par `zoneSensible` : il resterait ROUGE meme si la condition sur les TACHES
        // disparaissait, donc il ne garde pas le durcissement du 2026-09-05. Ici aucun fichier
        // n'est en zone sensible et la tache du TITRE (GOV-011) ne porte AUCUN `sensible` :
        // seules des taches PORTEES par la PR en portent. Mesure sur la PR 31 : GOV-024 (titre)
        // `sensible: []`, GOV-006 `["attribution"]`, CPL-T01 `["argent","attribution"]` — la
        // section Attaque n'etait donc exigee par PERSONNE sur une PR qui porte deux taches
        // sensibles.
        famille: 'attaque_absente',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.numero = 31;
          p.corps = remplacerBloc(p.corps, 'attaque', '');
          return [copieDepot(), p];
        },
      },
      {
        // GOV-078 (2) — LA MÊME FAMILLE PAR LA RÉÉCRITURE, et par la PROJECTION RÉELLE : seule la
        // prose d'une tâche sensible change entre la base et la tête. Les empreintes sont celles
        // que `projeter()` calcule (motif `mutation`, G10 : une empreinte rendue constante ne
        // voyait plus aucune réécriture, et aucun témoin ne passait par elle).
        famille: 'attaque_absente',
        defaut: () => {
          const brut = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: TacheBrute[] })
            .taches;
          const cible = brut.find((t) => Array.isArray(t.sensible) && t.sensible.length > 0)!;
          const d = copieDepot();
          d.taches = projeter(
            brut.map((t) =>
              t.id === cible.id ? { ...t, acceptance: `${t.acceptance ?? ''} (réécrite)` } : t
            )
          );
          const p = copiePr(PR_TEMOIN);
          p.tachesBase = projeter(brut);
          p.corps = remplacerBloc(p.corps, 'attaque', 'sans objet');
          return [d, p];
        },
      },
      {
        // GOV-078 (2) — et la SUPPRESSION d'une entrée sensible, la forme la plus forte du retrait
        // de marquage (motif `securite` sur la PR 114) : la tête ne la porte plus, la base si.
        famille: 'attaque_absente',
        defaut: () => {
          const cible = depot.taches.find((t) => t.sensible !== null && t.sensible.length > 0)!;
          const d = copieDepot();
          d.taches = depot.taches.filter((t) => t.id !== cible.id);
          const p = copiePr(PR_TEMOIN);
          p.tachesBase = depot.taches;
          p.corps = remplacerBloc(p.corps, 'attaque', 'sans objet');
          return [d, p];
        },
      },
      {
        // GOV-096 (8) — LA MÊME FAMILLE PAR LE `Lot:` : la tâche sensible n'est ni dans le titre, ni
        // liée par `pr`. Seul le champ la fait entrer dans `tachesSensibles`.
        famille: 'attaque_absente',
        defaut: () => {
          const p = PR_DE_LOT_SENSIBLE();
          p.corps = remplacerBloc(p.corps, 'attaque', '');
          return [copieDepot(), p];
        },
      },
      {
        famille: 'fichier_reserve_sans_label',
        defaut: () => [copieDepot(), { ...copiePr(PR_RESERVE), labels: [] }],
      },
      {
        // LA GRAMMAIRE DE LA PREMIÈRE COLONNE, et c'est la garde qui se désarme elle-même —
        // GOV-090, mesuré le 2026-09-22 en écrivant les deux lignes de `partners/ADR-0019`.
        // La virgule sépare les chemins ; une virgule posée DANS une parenthèse explicative
        // coupait la cellule en deux morceaux dont aucun n'était un chemin, et la ligne cessait
        // de garder son fichier SANS QUE RIEN NE ROUGISSE. Le tableau est lu par le script : il a
        // une grammaire, et une grammaire sans témoin se casse à la première écriture.
        // Ce témoin écrit la ligne AVEC la virgule piégée et exige que le chemin reste gardé.
        famille: 'fichier_reserve_sans_label',
        defaut: () => [
          {
            ...copieDepot(),
            charte: depot.charte.replace(
              '| `docs/tasks.json` |',
              '| `docs/tasks.json` (**source** — sa vue est `docs/TASKS.md`, non réservée) |'
            ),
          },
          { ...copiePr(PR_RESERVE), labels: [] },
        ],
      },
      {
        // GOV-056 (2) — LE DÉFAUT MESURÉ, DANS SA PLUS PETITE FORME. La PR 31 a modifié
        // `tests/unit/gouvernance/vues-derivees.spec.ts` — une spécification promise par DEUX
        // `tests{}` — sans qu'aucune tâche citée ne la déclare. On rejoue ce fichier-là.
        famille: 'fichier_hors_paths_des_taches',
        defaut: () => [
          copieDepot(),
          {
            ...copiePr(PR_TEMOIN),
            fichiers: [...PR_TEMOIN.fichiers, 'tests/unit/gouvernance/vues-derivees.spec.ts'],
          },
        ],
      },
      {
        // LA MÊME FAMILLE PAR L'AUTRE BRANCHE, et c'est celle qui décide du SENS DE DÉFAILLANCE :
        // une PR dont aucune tâche ne résout n'a pas de `paths` à confronter. Sans ce témoin, on ne
        // saurait pas si ce cas refuse ou s'il se tait — et se taire ferait du silence une
        // autorisation, sur la seule branche où la garde n'a rien à lire.
        famille: 'fichier_hors_paths_des_taches',
        defaut: () => [
          copieDepot(),
          {
            ...copiePr(PR_TEMOIN),
            titre: 'feat(GOV-999): une tâche que le registre ne connaît pas',
          },
        ],
      },
      {
        // GOV-096 — LE DÉFAUT DE LA PR #114 REJOUÉ : une PR de lot SANS son champ `Lot:`. Les
        // fichiers des tâches compagnes ne sont déclarés par personne, faute de pouvoir résoudre.
        famille: 'fichier_hors_paths_des_taches',
        defaut: () => [copieDepot(), PR_DE_LOT(false)],
      },
      {
        famille: 'schema_sans_label',
        defaut: () => [copieDepot(), { ...copiePr(PR_SCHEMA), labels: [] }],
      },
      // ---- GOV-096 : les trois refus qui bornent le champ `Lot:`, plus sa forme
      {
        // Le SEUL séparateur est la virgule. Un espace entre deux identifiants en fait un seul
        // jeton : la garde le NOMME au lieu de rendre une liste vide avec le code zéro (GOV-082).
        famille: 'lot_mal_forme',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          const deux = compagnonsDeLot(2, 'GOV-011').map((t) => t.id);
          p.corps = poserLeLot(p.corps, deux.join(' '));
          return [copieDepot(), p];
        },
      },
      {
        famille: 'lot_tache_inconnue',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = poserLeLot(p.corps, 'GOV-999');
          return [copieDepot(), p];
        },
      },
      {
        // Une PR ne rouvre pas une tâche LIVRÉE. La tâche se dérive du registre : la taper la
        // rendrait fausse le jour où elle changerait de statut.
        famille: 'lot_tache_livree',
        defaut: () => {
          const livree = depot.taches.find((t) => t.statut !== null && LIVREES.has(t.statut));
          if (!livree) {
            throw new Error(
              `gov:pr --prove — aucune tâche livrée au registre : le témoin de \`lot_tache_livree\` ` +
                `ne mesure rien.`
            );
          }
          const p = copiePr(PR_TEMOIN);
          p.corps = poserLeLot(p.corps, livree.id);
          return [copieDepot(), p];
        },
      },
      {
        // REQ-GOV-007 — deux PR ne se disputent pas une tâche. Ici par le REGISTRE : la tâche
        // déclarée dans `Lot:` porte déjà un `pr`, et ce n'est pas celui de la PR qu'on juge.
        famille: 'deux_pr_meme_tache',
        defaut: () => {
          const autre = compagnonsDeLot(1, 'GOV-011')[0]!;
          const d = depotAvecPr([autre.id]);
          const p = copiePr(PR_TEMOIN);
          p.numero = PR_R1 + 1;
          p.corps = poserLeLot(p.corps, autre.id);
          p.tachesBase = d.taches;
          return [d, p];
        },
      },
      // ---- la PR, revues comprises
      {
        famille: 'dod_non_cochee',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = p.corps.replace('- [x]', '- [ ]');
          return [copieDepot(), p];
        },
      },
      {
        famille: 'lentilles_manquantes',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.slice(0, 2);
          return [copieDepot(), p];
        },
      },
      {
        // GOV-096 (8) — `risqueDeLaPr()` reçoit l'union : la PR ordinaire et ses DEUX lentilles, à
        // laquelle le seul `Lot:` ajoute une tâche sensible, devient ÉLEVÉE et en exige quatre.
        famille: 'lentilles_manquantes',
        defaut: () => [copieDepot(), PR_DE_LOT_SENSIBLE()],
      },
      {
        // Une revue qui REFUSE n'est pas une lentille manquante : la distinguer est ce qui permet
        // à A04 de dire pourquoi il ne fusionne pas.
        famille: 'phase_gelee',
        defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), labels: ['phase:3'] }],
      },
      {
        famille: 'lentille_en_refus',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) =>
            ouvrePar(r, 'A09 · securite')
              ? { ...r, body: 'A09 · securite\nVerdict: refuse\nIDOR non couvert' }
              : r
          );
          return [copieDepot(), p];
        },
      },
      {
        // La huitième case, jugée APRÈS la fusion — le seul moment où elle peut être vraie.
        famille: 'dod_atterrissage_non_atteste',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.apresFusion = true;
          p.corps = videLaDerniereCase(p.corps);
          return [copieDepot(), p];
        },
      },
      {
        // ── LES QUATRE FAIBLESSES FERMÉES PAR LE LECTEUR UNIQUE ──────────────────────────────
        // Chacune était PERMISSIVE : elle laissait compter un avis qui ne devait pas compter.
        // (1) l'auteur d'une revue n'était pas authentifié : dépôt PUBLIC, avis forgé.
        // Aucun avis n'étant RETENU, c'est `aucune_revue` qui parle depuis GOV-077 — une absence,
        // pas une lentille manquante parmi d'autres.
        famille: 'aucune_revue',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({
            ...r,
            author_association: 'NONE',
            user: { login: 'un-tiers' },
          }));
          return [copieDepot(), p];
        },
      },
      {
        // (1c) un avis RETIRÉ (`DISMISSED`) n'est pas un avis.
        famille: 'aucune_revue',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({ ...r, state: 'DISMISSED' }));
          return [copieDepot(), p];
        },
      },
      {
        // (2) le numéro de poste n'était confronté à rien : `A99` tenait une lentille.
        famille: 'aucune_revue',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({
            ...r,
            body: (r.body ?? '').replace(/^A\d\d/, 'A99'),
          }));
          return [copieDepot(), p];
        },
      },
      {
        // (4) la clé du dernier verdict : un refus d'A02 sur `schema` que l'accord d'un AUTRE
        // poste sur la même lentille effaçait.
        famille: 'lentille_en_refus',
        defaut: () => {
          const p = copiePr(PR_SCHEMA);
          p.revues = [
            ...p.revues!.map((r) =>
              ouvrePar(r, 'A02 · schema')
                ? { ...r, body: 'A02 · schema\nVerdict: refuse\nla migration perd une colonne' }
                : r
            ),
            revue('A12 · schema\nVerdict: accepte\nvu de mon côté'),
          ];
          return [copieDepot(), p];
        },
      },
      {
        // Le pas 5 du protocole : un accord rendu sur une AUTRE tête que celle qui sera fusionnée.
        // `gov:pr` en était STRUCTURELLEMENT aveugle — il ne lisait aucun `commit_id`.
        famille: 'lentille_perimee',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({
            ...r,
            commit_id: '0000000000000000000000000000000000000000',
          }));
          return [copieDepot(), p];
        },
      },
      {
        // Le discriminant `schema` lu sur les FICHIERS : une PR qui touche prisma sans le label
        // publiait « les lentilles ont accepté » alors que la revue bloquante n'a jamais eu lieu.
        famille: 'schema_sans_approbation',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.fichiers = ['prisma/schema.prisma', 'tests/gov/charte-pr.spec.ts'];
          return [copieDepot(), p];
        },
      },
      {
        famille: 'schema_sans_approbation',
        defaut: () => {
          const p = copiePr(PR_SCHEMA);
          p.revues = p.revues!.map((r) =>
            ouvrePar(r, 'A02') ? { ...r, body: 'A09 · schema\nVerdict: accepte\nok' } : r
          );
          return [copieDepot(), p];
        },
      },
      {
        // cas 12 (GOV-077) — AUCUNE revue : une absence, nommée par sa propre famille.
        famille: 'aucune_revue',
        defaut: () => [copieDepot(), { ...copiePr(PR_TEMOIN), revues: [] }],
      },
      {
        // cas 12 (GOV-077) — les QUATRE revues refusent : ce n'est pas « aucune revue ». Avant, les
        // deux imprimaient « Vues : (aucune) ».
        famille: 'lentille_en_refus',
        defaut: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({
            ...r,
            body: (r.body ?? '').replace('Verdict: accepte', 'Verdict: refuse'),
          }));
          return [copieDepot(), p];
        },
      },
      {
        // cas 6 ter (GOV-077) — un fichier de CI au milieu d'une PR ordinaire : quatre lentilles.
        famille: 'lentilles_manquantes',
        defaut: () => [copieDepot(), CI_AU_MILIEU()],
      },
      {
        // cas 6 quater (GOV-077) — un fichier de configuration à la racine : quatre lentilles.
        famille: 'lentilles_manquantes',
        defaut: () => [copieDepot(), RACINE_AU_MILIEU()],
      },
      {
        // (GOV-077, second refus de `securite`) — la liste de la FORGE plus courte que ce que la PR
        // annonce : des fichiers invisibles, donc quatre lentilles.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const p = copiePr(PR_ORDINAIRE);
          p.liste = { source: 'forge', lues: p.fichiers.length, annoncees: p.fichiers.length + 1 };
          return [copieDepot(), p];
        },
      },
      {
        // GOV-097 (refus `securite` du 2026-09-25, motif 1) — la PR ordinaire, deux lentilles, qui
        // touche un fichier que SEC-07 (`securite`, `sensible: [auth]`) déclare, et dont le NOM
        // n'est dans aucune zone sensible : la sensibilité suit le fichier, quatre lentilles.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const f = cheminsDe('SEC-07').find(
            (c) => c.startsWith('src/') && !c.endsWith('/') && !fichierEnZoneSensible(c)
          );
          if (f === undefined) {
            throw new Error(
              'gov:pr --prove — SEC-07 ne déclare plus de fichier de code hors zone sensible : le ' +
                'témoin « la sensibilité suit le fichier » ne peut plus en dériver le sien.'
            );
          }
          const p = copiePr(PR_ORDINAIRE);
          p.fichiers = [...p.fichiers, f];
          return [copieDepot(), p];
        },
      },
      {
        // GOV-097 — la PR ordinaire dont la tâche passe en zone `securite`, `sensible` toujours vide :
        // la zone compte seule, quatre lentilles (décision de Will du 2026-09-25, partners/ADR-0021).
        famille: 'lentilles_manquantes',
        defaut: () => {
          const d = depotAvecZone('QA-T01', 'securite');
          return [d, { ...copiePr(PR_ORDINAIRE), tachesBase: d.taches }];
        },
      },
      {
        // cas 6 quinquies (GOV-077) — le fichier de CI RENOMMÉ hors de `.github/` : sa source compte.
        famille: 'lentilles_manquantes',
        defaut: () => [
          copieDepot(),
          RENOMMAGE_AU_MILIEU(`${DOSSIER_CI}workflows/ci.yml`, 'docs/archive/ci.yml'),
        ],
      },
      {
        // cas 6 sexies (GOV-077) — le schéma RENOMMÉ hors de `prisma/` : le label `schema` reste exigé.
        famille: 'schema_sans_label',
        defaut: () => [
          copieDepot(),
          RENOMMAGE_AU_MILIEU(
            `${cheminsSchema(depot.charte)[0]}schema.prisma`,
            'docs/schema.prisma'
          ),
        ],
      },
      {
        // (lentille `mutation`, PR 64, G01) — l'APPELANT forge : un fichier de CI RENOMMÉ vers `docs/`,
        // passé par `prDepuisLaForge()`, la partie pure de `prParGh()`. Sa source compte.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const base = copiePr(PR_ORDINAIRE);
          const m = Math.floor(base.fichiers.length / 2);
          const entrees: EntreeDeFichier[] = [
            ...base.fichiers.slice(0, m).map((filename) => ({ filename })),
            {
              filename: 'docs/archive/ci.yml',
              previous_filename: `${DOSSIER_CI}workflows/ci.yml`,
              status: 'renamed',
            },
            ...base.fichiers.slice(m).map((filename) => ({ filename })),
          ];
          const p = prDepuisLaForge({
            numero: '9998',
            meta: { title: base.titre, body: base.corps, headRefOid: TETE_TEMOIN, labels: [] },
            entrees,
            annoncees: entrees.length,
            revues: base.revues!,
            commentaires: [],
            tachesBase: depot.taches,
          });
          return [copieDepot(), p];
        },
      },
      {
        // (lentille `mutation`, PR 64, G02) — l'APPELANT événement : le même renommage, lu dans une
        // sortie `git diff --name-status -z` par `prDepuisLEvenement()`. Revues ajoutées ensuite :
        // l'événement n'en porte pas, et le risque ne se juge qu'avec elles.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const base = copiePr(PR_ORDINAIRE);
          const Z = String.fromCharCode(0);
          const sortie =
            [
              ...base.fichiers.flatMap((f) => ['M', f]),
              'R100',
              `${DOSSIER_CI}workflows/ci.yml`,
              'docs/archive/ci.yml',
            ].join(Z) + Z;
          const p = prDepuisLEvenement(
            {
              title: base.titre,
              body: base.corps,
              labels: [],
              base: { sha: '0'.repeat(40) },
              head: { sha: TETE_TEMOIN },
            },
            sortie,
            depot.taches
          );
          return [copieDepot(), { ...p, revues: base.revues, tete: TETE_TEMOIN }];
        },
      },
      {
        // (lentille `mutation`, PR 64, G05) — `projeter()` sur un `sensible` ABSENT du registre brut :
        // il reste `null`, donc ÉLEVÉ. Le défaut d'avant (`?? []`) rendait la PR ordinaire.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const brut = (
            JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: TacheBrute[] }
          ).taches.map((t) => {
            if (t.id !== 'QA-T01') return t;
            const copie = { ...t };
            delete copie.sensible;
            return copie;
          });
          const d = copieDepot();
          d.taches = projeter(brut);
          return [d, { ...copiePr(PR_ORDINAIRE), tachesBase: d.taches }];
        },
      },
      {
        // cas 1 (GOV-077) — la PR ordinaire par son titre, mais qui PORTE trois tâches dont la sensible
        // est AU MILIEU du registre (QA-T01, DM-01 `rgpd`, GOV-039). Deux lentilles ne suffisent pas.
        famille: 'lentilles_manquantes',
        defaut: () => {
          const d = depotAvecPr(['QA-T01', 'DM-01', 'GOV-039']);
          return [d, { ...copiePr(PR_ORDINAIRE), numero: PR_R1, tachesBase: d.taches }];
        },
      },
    ];

    const CONTRE_TEMOINS: { quoi: string; cas: () => [Depot, Pr | null] }[] = [
      { quoi: "le dépôt tel qu'il est, sans PR", cas: () => [depot, null] },
      { quoi: 'une PR conforme, revues comprises', cas: () => [depot, PR_TEMOIN] },
      {
        // Le socle des deux témoins de RÉÉCRITURE : la même PR, « sans objet », sur un registre
        // INCHANGÉ, reste verte. Sans lui, ces témoins pourraient rougir par une autre branche du
        // déclencheur, et une empreinte constante survivrait.
        quoi: 'la PR conforme, Attaque « sans objet », registre inchangé',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = remplacerBloc(p.corps, 'attaque', 'sans objet');
          return [depot, p];
        },
      },
      {
        quoi: 'une PR `schema` avec son label et l’approbation de A02',
        cas: () => [depot, PR_SCHEMA],
      },
      {
        quoi: 'une PR sur une zone sensible avec sa section Attaque remplie',
        cas: () => [depot, PR_SENSIBLE],
      },
      {
        quoi: 'une PR sur un chemin réservé avec le label du rôle',
        cas: () => [depot, PR_RESERVE],
      },
      {
        // GOV-056 (2) — LE CONTRE-TÉMOIN QUI GARDE LE CHOIX DE PÉRIMÈTRE, et sans lequel on ne
        // saurait pas si le vert vient de la règle ou de son absence. Toute PR conforme produit ces
        // sous-produits, qu'aucune tâche ne peut déclarer : les soumettre à la famille rendrait la
        // garde insatisfiable. Ils doivent rester VERTS, et c'est ici que ça se prouve.
        quoi: 'une PR qui ne touche que des sous-produits de gouvernance (journal, vue régénérée, registres)',
        cas: () => [
          depot,
          {
            ...copiePr(PR_TEMOIN),
            // `docs/PLAN-STATE.md` et `docs/tasks.json` sont RÉSERVÉS au §7 : ils exigent leur label,
            // et c'est une AUTRE famille. On les porte avec le label, sinon ce contre-témoin
            // prouverait deux choses à la fois et aucune proprement (RM-11).
            labels: ['role:gardien-spec'],
            // Le registre append-only n'est pas RETAPÉ ici : il se dérive de sa seule déclaration.
            fichiers: [
              'docs/journal/2026-09.md',
              'docs/PLAN-STATE.md',
              ...REGISTRES_APPEND_ONLY.map((e) => e.chemin),
              'docs/TRACABILITE.md',
            ],
            // Sans fichier de code, `INTRODUIT_UNE_GARDE` ne s'arme pas : la PR reste verte sur le
            // bloc ROUGE/VERT comme sur la famille neuve, et c'est bien ce qu'on veut montrer.
          },
        ],
      },
      {
        // LE PRÉFIXE DE DOSSIER, ET IL N'ÉTAIT GARDÉ PAR RIEN. Une tâche qui déclare un DOSSIER
        // couvre ce qui vit dessous ; sans ce contre-témoin, retirer cette branche du prédicat
        // laissait la preuve verte, et toute PR touchant un fichier sous un `paths` de dossier se
        // serait mise à rougir sans que personne l'ait voulu. La tâche citée est réécrite en
        // DOSSIER, et le fichier de la PR se dérive d'elle (RM-03) : le vert ne tient pas à un
        // chemin tapé.
        quoi: 'une PR dont le fichier de code vit SOUS un dossier que sa tâche déclare',
        cas: () => {
          const dossier = 'scripts/gates/';
          const d = copieDepot();
          d.taches = d.taches.map((t) =>
            t.id === 'GOV-011' ? { ...t, paths: [dossier], tests: {} } : t
          );
          const p = copiePr(PR_TEMOIN);
          p.fichiers = p.fichiers
            .filter((f) => !PERIMETRE_DU_CODE.some((x) => f.startsWith(x)))
            .concat(`${dossier}gov-trace.ts`);
          return [d, p];
        },
      },
      // 🔻 RETIRÉ LE 2026-09-17 — un contre-témoin qui ne mesurait rien. Il était annoncé comme
      // « l'autre face » de `fichier_hors_paths_des_taches` (« une PR dont chaque fichier de code est
      // déclaré par les `paths` ou les `tests{}` de sa tâche ») et son cas était `[depot,
      // copiePr(PR_TEMOIN)]` : IDENTIQUE en entrées ET en verdict au deuxième de cette liste (« une PR
      // conforme, revues comprises »). Deux fois la même mesure ne fait pas deux mesures — et la PR
      // comptait le doublon pour un gain (« de 12 à 14 »). Ce que la famille garde reste prouvé par
      // son témoin, par la PR conforme, et par le contre-témoin des sous-produits ci-dessus, qui lui
      // garde un vrai choix de périmètre.
      {
        // LE contre-témoin de la scission : la huitième case atteste la fusion et l'atterrissage,
        // elle ne peut pas être cochée à l'événement `pull_request`. En CI (revues absentes) cette
        // PR doit rester VERTE ; sous `--pr <numero>` le témoin de `dod_non_cochee` la fait rougir.
        quoi: 'une PR dont la seule case vide est la huitième, jugée en CI (revues absentes)',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = null;
          p.corps = videLaDerniereCase(p.corps);
          return [depot, p];
        },
      },
      {
        // LE contre-témoin qui manquait, et sans lequel la correction ne vaut rien : la même PR,
        // huitième case vide, jugée AVEC ses revues — c'est-à-dire sous `--pr <n>`, la commande
        // d'avant-fusion. Elle doit rester VERTE : la case atteste une fusion qui n'a pas eu lieu.
        quoi: 'une PR dont la seule case vide est la huitième, jugée AVANT la fusion (--pr)',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = videLaDerniereCase(p.corps);
          return [depot, p];
        },
      },
      {
        // Une PR de la phase COURANTE porte son label et doit passer. Sans ce contre-témoin, une
        // garde qui refuserait tout label `phase:` serait « prouvée » par son seul témoin.
        quoi: 'une PR étiquetée de la phase courante',
        cas: () => [depot, { ...copiePr(PR_TEMOIN), labels: [`phase:${phaseCourante()}`] }],
      },
      {
        // LE CONTRE-TEMOIN DE LA REGLE DU DERNIER MOT : une lentille qui REFUSE, puis relit et
        // ACCEPTE. La PR doit passer. Sans lui, la regle du dernier verdict serait une intention
        // ecrite en commentaire ; avec lui, un refus fige a nouveau la PR des que la regle saute.
        quoi: 'une lentille qui a refuse, puis relu et accepte : son DERNIER mot compte',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          const securite = p.revues!.find((r) => ouvrePar(r, 'A09 · securite'))!;
          p.revues = [
            ...p.revues!.filter((r) => r !== securite),
            { ...securite, body: 'A09 · securite\nVerdict: refuse\nIDOR non couvert' },
            { ...securite, body: 'A09 · securite\nVerdict: accepte\nleve : la garde est posee' },
          ];
          return [depot, p];
        },
      },
      {
        // CONTRE-TÉMOIN DU FILTRE D'IDENTITÉ : `MEMBER` et `COLLABORATOR` jugent aussi. Calé sur
        // le seul `OWNER`, le filtre refuserait EN SILENCE le premier second contributeur.
        quoi: 'une PR relue par un membre et par un collaborateur, et non par le seul propriétaire',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r, i) => ({
            ...r,
            author_association: i % 2 === 0 ? 'MEMBER' : 'COLLABORATOR',
            user: { login: i % 2 === 0 ? 'un-membre' : 'un-collaborateur' },
          }));
          return [depot, p];
        },
      },
      {
        // CONTRE-TÉMOIN DU DISCRIMINANT `schema` : sans fichier de schéma, sans label et sans
        // tâche `schema`, c'est `simplicite` qui est exigée — et la PR témoin la porte.
        quoi: 'une PR sans fichier de schéma, sans label de schéma et sans tâche de schéma',
        cas: () => [depot, copiePr(PR_TEMOIN)],
      },
      {
        // Les quatre lentilles rendues en `COMMENTED` : c'est le seul état que ce dépôt à un
        // compte sait produire, et il doit compter autant qu'un `APPROVED`.
        quoi: 'une PR dont les quatre revues sont des commentaires portant `Verdict: accepte`',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.revues = p.revues!.map((r) => ({ ...r, state: ETAT_COMMENTE }));
          return [depot, p];
        },
      },
      {
        // cas 0 (GOV-077, levier 3 de Will du 2026-09-18) — LA PR ORDINAIRE EXPLICITE. Titre QA-T01
        // (zone `qualite`, `sensible` vide, `schema` faux), fichiers DÉRIVÉS de ses `paths` hors
        // `.github/` et hors de la racine, tous sous `docs/`, `scripts/` ou `tests/` : deux lentilles.
        quoi: 'une PR ORDINAIRE (QA-T01 réduite, hors .github/ et hors racine) relue par exactitude et securite seules, sur la tête',
        cas: () => [depot, PR_ORDINAIRE],
      },
      {
        // L'autre face des renommages : un document renommé DANS `docs/` reste ordinaire. Sans ce
        // contre-témoin, une extraction qui rendrait tout renommage élevé passerait pour la règle.
        quoi: 'la PR ordinaire avec un document renommé à l’intérieur de docs/',
        cas: () => [depot, RENOMMAGE_AU_MILIEU('docs/ancien.md', 'docs/nouveau.md')],
      },
      {
        // GOV-096 — LE CONTRE-TÉMOIN QUI PORTE LA CORRECTION, et l'autre face exacte du témoin
        // `fichier_hors_paths_des_taches` ci-dessus : la MÊME PR de lot, avec son champ `Lot:`
        // rempli. Elle doit être VERTE. Sans lui, on ne saurait pas si le champ RÉSOUT les tâches
        // du lot ou s'il a seulement fait taire la famille.
        quoi: 'une PR de LOT dont le champ `Lot:` déclare les autres tâches qu’elle livre',
        cas: () => [depot, PR_DE_LOT(true)],
      },
      {
        // GOV-096 — LE CONTRE-TÉMOIN DU CAS ORDINAIRE, et il garde le choix qui compte : `Lot:`
        // VIDE laisse le comportement INCHANGÉ. C'est le cas de la très grande majorité des PR ;
        // si le champ vide se mettait à exiger quoi que ce soit, toute PR à une seule tâche
        // rougirait, et une gate que tout le monde doit contourner se fait retirer dans la semaine.
        quoi: 'une PR dont le champ `Lot:` est présent et VIDE : comportement inchangé',
        cas: () => {
          const p = copiePr(PR_TEMOIN);
          p.corps = poserLeLot(p.corps, '');
          return [depot, p];
        },
      },
      {
        // cas 1, l'autre face : la même PR SANS la tâche sensible. Si elle rougissait, le témoin du cas 1
        // rougirait peut-être pour une autre raison que DM-01.
        quoi: 'la PR du cas 1 sans sa tâche sensible (QA-T01 et GOV-039), deux lentilles',
        cas: () => {
          const d = depotAvecPr(['QA-T01', 'GOV-039']);
          return [d, { ...copiePr(PR_ORDINAIRE), numero: PR_R1, tachesBase: d.taches }];
        },
      },
      {
        // GOV-097 — l'autre face du témoin `securite` : une tâche de zone `espace`, `sensible` vide,
        // qui touche du code produit hors des zones sensibles, se relit à DEUX lentilles. Sans ce
        // contre-témoin, une règle qui élèverait encore tout `src/` passerait pour la décision.
        quoi: 'une PR de zone espace, sensible vide, touchant du code produit neutre, deux lentilles',
        cas: () => {
          const d = depotAvecZone('QA-T01', 'espace', [CODE_NEUTRE]);
          const p = copiePr(PR_ORDINAIRE);
          p.fichiers = [...p.fichiers, CODE_NEUTRE];
          return [d, { ...p, tachesBase: d.taches }];
        },
      },
    ];

    for (const c of CONTRE_TEMOINS) {
      const [d, p] = c.cas();
      const f = controler(d, p);
      if (f.length > 0) {
        console.error(`❌ Faux positif : « ${c.quoi} » a rougi. La garde est trop large.`);
        f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
        process.exit(1);
      }
    }

    const prouvees = new Set<string>();
    for (const t of TEMOINS) {
      const [d, p] = t.defaut();
      const f = controler(d, p);
      if (!f.some((x) => x.famille === t.famille)) {
        console.error(
          `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
            `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
        );
        process.exit(1);
      }
      prouvees.add(t.famille);
    }
    // cas 12 (GOV-077) — UN AVIS POSTÉ EN COMMENTAIRE D'ISSUE EST DIT. Ce n'est pas une famille (il ne
    // compte pour rien, il ne rougit pas) : la preuve vérifie donc qu'il est NOMMÉ, sur la capture
    // réelle de la PR 41, une ligne par avis. Un écart ici LÈVE — la preuve ne passe pas en silence.
    {
      const capture = JSON.parse(
        readFileSync('tests/fixtures/github/commentaires-pr-41.json', 'utf8')
      ) as { commentaires: CommentaireBrut[] };
      const attendus = avisHorsCanal(capture.commentaires).length;
      controler(depot, { ...copiePr(PR_TEMOIN), commentaires: capture.commentaires });
      if (attendus === 0 || AVIS_HORS_CANAL.length !== attendus) {
        throw new Error(
          `gov:pr --prove — ${AVIS_HORS_CANAL.length} avis hors canal nommé(s) sur la PR 41 pour ` +
            `${attendus} dans la capture : un avis posté en commentaire d’issue n’est plus dit.`
        );
      }
    }

    const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
    if (sansTemoin.length > 0) {
      console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
      process.exit(1);
    }
    // LE SENS INVERSE, ET IL MANQUAIT. Une famille qu'un témoin fait rougir sans qu'elle soit
    // DÉCLARÉE passait sous le compte : la sortie annonçait « les N familles » en lisant
    // `FAMILLES`, pas ce qui avait réellement été prouvé. `lentille_perimee` est arrivée par là.
    const nonDeclarees = [...prouvees].filter((f) => !FAMILLES.includes(f));
    if (nonDeclarees.length > 0) {
      console.error(
        `❌ Famille(s) prouvée(s) mais NON déclarée(s) dans FAMILLES : ${nonDeclarees.join(', ')}. ` +
          `Le compte annoncé ne serait pas celui des familles réellement contrôlées.`
      );
      process.exit(1);
    }

    console.log(
      `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
    );
    console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
    console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
    process.exit(0);
  }

  // ── mode normal ──────────────────────────────────────────────────────────────

  const depot = lireDepot();
  const iPr = process.argv.indexOf('--pr');
  const iApres = process.argv.indexOf('--apres-fusion');
  let pr: Pr | null = null;
  let portee = 'structure du gabarit, de CODEOWNERS et de la charte';

  if (iPr >= 0 || iApres >= 0) {
    const i = iPr >= 0 ? iPr : iApres;
    const numero = process.argv[i + 1];
    if (!numero || !/^\d+$/.test(numero)) {
      console.error('❌ gov:pr — `--pr` et `--apres-fusion` attendent un numéro de PR.');
      process.exit(1);
    }
    try {
      pr = prParGh(numero, iApres >= 0 ? 'apres-fusion' : 'avant-fusion');
    } catch (e) {
      // ⚠️ CE `catch` COUVRE DEUX COMMANDES, ET LEURS REMÈDES N'ONT RIEN À VOIR. Relevé par la
      // lentille `securite` aux 11e et 12e tours — et le 12e a raison de dire que je l'avais
      // ÉLARGI : `prParGh()` lance maintenant `gh pr view` ET un `git rev-parse`. Attribuer un
      // échec de `git` à `gh pr view` envoie le lecteur vérifier son jeton quand le remède est
      // `git fetch origin`. *Le sens de défaillance reste fermé ; c'est le DIAGNOSTIC qui ment,
      // et un diagnostic qui ment fait perdre le temps qu'une garde est censée faire gagner.*
      const message = (e as Error).message;
      const vientDeGit = /rev-parse|unknown revision|ambiguous argument|not a git repository/i.test(
        message
      );
      console.error(
        vientDeGit
          ? `❌ gov:pr — une commande \`git\` a échoué : ${message}`
          : `❌ gov:pr — \`gh pr view ${numero}\` a échoué : ${message}`
      );
      console.error(
        vientDeGit
          ? '   Remède probable : `git fetch origin` — la référence de base doit exister EN LOCAL.'
          : '   Les familles de revue ne peuvent pas être contrôlées ; la garde refuse plutôt que de passer.'
      );
      process.exit(1);
    }
    if (iApres >= 0 && pr) pr.apresFusion = true;
    portee +=
      `, puis la PR #${numero}, REVUES COMPRISES` +
      (iApres >= 0 ? ', APRÈS FUSION (la 8ᵉ case est exigée)' : '');
  } else {
    pr = prParEvenement();
    if (pr)
      portee += ', puis la PR de l’événement GitHub — SANS les revues, qui n’existent pas encore';
  }

  // LE RISQUE EST IMPRIMÉ DÈS QU'UNE PR EST CONNUE (GOV-077) : c'est cette ligne que l'orchestrateur
  // lit AVANT de lancer les lentilles — deux sur une PR ordinaire, quatre sur une PR élevée.
  if (pr !== null) console.log(`ℹ️  gov:pr — ${direLeRisque(risqueDePr(depot, pr))}.`);
  // GOV-078 (1) — le déclencheur par zone DIT ce qu'il a confronté, vert ou rouge. Imprimé AVANT que
  // les fautes n'existent : aucune condition sur le verdict ne peut plus le taire (survivant
  // `mutation`, PR 114, tour 2 — le témoin de bout en bout ne sait jouer qu'une PR rouge).
  if (pr !== null) console.log(`ℹ️  gov:pr — ${direLesZones(pr.fichiers)}.`);
  const fautes = controler(depot, pr);
  if (AVIS_HORS_CANAL.length > 0) {
    console.log(
      `ℹ️  gov:pr — ${AVIS_HORS_CANAL.length} avis posté(s) en COMMENTAIRE D’ISSUE, qui ne comptent ` +
        `pour aucune lentille :`
    );
    AVIS_HORS_CANAL.forEach((e) => console.log(`      ${e}`));
  }
  if (AVIS_ECARTES.length > 0) {
    console.log(
      `ℹ️  gov:pr — ${AVIS_ECARTES.length} avis ÉCARTÉ(S), qui ne comptent pour aucune lentille :`
    );
    AVIS_ECARTES.forEach((e) => console.log(`      ${e}`));
  }
  lignesDesAccordsSurvivants().forEach((l) => console.log(l));
  if (fautes.length === 0) {
    console.log(`✅ gov:pr — ${portee}.`);
    if (pr === null) {
      console.log(
        '   Aucune PR en contexte : seules les 6 familles de structure ont été évaluées.'
      );
    } else if (pr.revues === null) {
      console.log(
        '   Les 2 familles de REVUE (lentilles, approbation schema) n’ont PAS été évaluées : ' +
          'lance `pnpm gov:pr --pr <numero>` avant de fusionner (docs/CHARTE-AGENTS.md §8).'
      );
    }
    process.exit(0);
  }

  const parFamille = new Map<string, Faute[]>();
  for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
  console.error(`❌ gov:pr — ${fautes.length} défaut(s) :\n`);
  for (const [famille, liste] of parFamille) {
    console.error(`   ── ${famille} (${liste.length})`);
    liste.slice(0, 12).forEach((f) => console.error(`      ${f.message}`));
    if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
  }
  process.exit(1);
}
