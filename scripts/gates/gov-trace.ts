/**
 * gov-trace.ts — la matrice de traçabilité REQ → tâche → test → PR, DÉRIVÉE (GOV-011).
 *
 * USAGE : pnpm gov:trace              contrôle les quatre sources et rougit sur les incohérences
 *         pnpm gov:trace --prove      un témoin par famille, des contre-témoins verts (univers de fixture)
 *         pnpm gov:trace --render     écrit `docs/TRACABILITE.md`, la VUE de la matrice
 *         pnpm gov:trace --verifier   n'écrit rien ; sort 1 si la vue commitée diverge de la source
 *         pnpm gov:trace --sources    dit ce que chaque source a rendu, et sort 0 (diagnostic)
 *         …--out <chemin>             travaille sur une autre vue (bancs d'essai des tests)
 *
 * L'EXIGENCE. REQ-GOV-005 demandait cette matrice ; elle est ABSORBÉE par REQ-QA-014, dont le
 * texte fait foi : « Chaque exigence REQ-*-nnn non différée est référencée par ≥ 1 test vert dont
 * le titre `it()` contient son identifiant ET porte l'annotation `@req` en tête du fichier de ce
 * test ; chaque `@req` comme chaque identifiant cité par un titre pointe une REQ qui existe ET dont
 * le texte est EN VIGUEUR ; les corps de PR listent `Couvre: REQ-…` ; `pnpm req:check` dérive la
 * matrice et rougit dans les deux sens d'orphelinat. »
 *
 * `pnpm req:check` EST CETTE GARDE (QA-T03), lancée après `pnpm test` avec les RÉSULTATS de la
 * passe (`--resultats <chemin du rapport JSON de vitest>`) : c'est la seule façon de savoir qu'un
 * test est VERT, et pas seulement écrit. Sans `--resultats`, la garde juge tout le reste et DIT que
 * le vert n'est pas jugé ; des résultats absents, illisibles ou périmés la font rougir, jamais
 * passer (`resultats_illisibles`).
 *
 * LES QUATRE SOURCES, ET CE QU'ON EN CROIT :
 *
 *   1. `docs/requirements.json` — les exigences, leur statut, leurs tâches porteuses.
 *   2. `docs/tasks.json` — les tâches, leurs `reqs[]` et leur `tests{}`.
 *   3. LE DISQUE — les fichiers de test et les titres de leurs `it()`. C'est le seul endroit où
 *      quelque chose EXISTE : `tests{}` ne fait que PROMETTRE. La différence entre les deux est
 *      l'objet de cette garde. Défaut déjà attrapé à la main sur ce dépôt (PR 27, lentille
 *      « exactitude ») : une tâche déclarait couvrir REQ-GOV-027 par un test qui ne parle pas de
 *      cette exigence, et la traçabilité était au vert.
 *   4. LES PR FUSIONNÉES (`gh pr list --state merged`) — leur ligne `Couvre: REQ-…`. Cette source
 *      est FACULTATIVE : sans réseau ni `gh`, la garde le DIT et continue sur les trois autres.
 *      Elle ne rend JAMAIS vert en silence : une gate qui passe parce qu'elle n'a pas pu lire est
 *      pire que pas de gate.
 *
 * LE STATUT « ≥ TESTÉE » N'EXISTE PAS DANS LE REGISTRE. `docs/requirements.json` ne porte que deux
 * statuts — `active` et `absorbee` — et rien qui ressemble à une échelle de maturité. Il est donc
 * DÉRIVÉ de ce que le dépôt sait vraiment : une exigence est **réputée testée** dès qu'une des
 * tâches qui la portent est livrée (`fusionnee` / `deployee` / `verifiee`). Le code n'est pas
 * écrit pour une exigence dont aucune tâche n'a atterri ; lui réclamer un test rendrait la CI
 * définitivement rouge, et une CI toujours rouge ne garde plus rien.
 *
 * CE QUI N'EST PAS DÉTECTABLE, ET QUI N'EST DONC PAS DÉTECTÉ. « Le test est-il HORS SUJET ? » n'a
 * pas de réponse automatique : rien dans un corps de test ne dit ce qu'il prétend démontrer. Une
 * heuristique de ressemblance (mots communs entre le texte de l'exigence et le titre du test)
 * rougirait au hasard, et une famille qui rougit au hasard fait perdre confiance dans les autres.
 * Ce qui EST décidable, et que la famille `req_non_citee_par_son_test` retient, c'est la règle que
 * REQ-QA-014 écrit elle-même : le fichier promis pour REQ-X porte `@req REQ-X` EN TÊTE ET un titre
 * de `it()` qui contient REQ-X — les DEUX formes. La garde acceptait l'une OU l'autre, et lisait
 * `@req` n'importe où dans le fichier (QA-T03). C'est ce défaut-là qui avait été trouvé à la main.
 *
 * POURQUOI LA VUE NE PORTE PAS LA COLONNE « PR ». `docs/TRACABILITE.md` est comparée à sa source
 * par `--verifier`. Si son contenu dépendait d'un appel réseau, `--verifier` mesurerait la
 * disponibilité de `gh`, pas la dérivation de la vue : elle serait rouge chez qui n'a pas de
 * jeton, et verte ailleurs, pour la même arborescence. Le maillon PR est donc contrôlé et
 * IMPRIMÉ, jamais écrit dans la vue.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';
import { DEPOT_LOCAL } from '../lot/attestation';
import {
  annotationsReq,
  fichiersDeTest,
  titresDeTest,
  titresEcrits,
  type AnnotationReq,
} from '../lot/titres-ecrits';

const CHEMIN_REGISTRE = 'docs/requirements.json';
/**
 * `--taches <chemin>` : juger un AUTRE backlog que celui du dépôt (GOV-038).
 *
 * POURQUOI CETTE OPTION EXISTE. `docs/tasks.json` est un fichier RÉSERVÉ que `.claude/settings.json`
 * interdit d'écrire à un développeur. Une session qui PROPOSE une mutation de ce fichier — passer
 * `INT-T01b` à `fusionnee` avec son attestation, par exemple — n'avait donc aucun moyen de savoir
 * si les gardes l'accepteraient : ni l'appliquer, ni la juger. Elle la rendait en texte et
 * l'orchestrateur découvrait le rouge après l'avoir écrite. C'est exactement ce qui est arrivé
 * ici : la mutation proposée faisait rougir DEUX familles que personne n'avait vues venir
 * (`test_promis_absent`, puis `req_sans_test` sur onze exigences). Une proposition qu'on ne peut
 * pas mesurer est une supposition.
 */
const iTaches = process.argv.indexOf('--taches');
const CHEMIN_TACHES =
  iTaches >= 0 ? (process.argv[iTaches + 1] ?? 'docs/tasks.json') : 'docs/tasks.json';
const CHEMIN_VITEST = 'vitest.config.ts';
const VUE_PAR_DEFAUT = 'docs/TRACABILITE.md';
const CHEMIN_GATES = 'docs/gates.json';
/** Ce fichier, tel que `docs/gates.json` le nomme dans le champ `script` de son entrée. */
const CE_SCRIPT = 'scripts/gates/gov-trace.ts';
/**
 * La forme sous laquelle le plancher s'écrit dans le champ `verifie` de cette entrée. ASCII sans
 * accent, comme toute la prose du registre. Une phrase qu'on ne sait plus lire donne
 * `plancher_non_declare` : la garde échoue FERMÉE, jamais ouverte.
 */
const MOTIF_PLANCHER =
  /PLANCHER DECLARE : (\d+) taches confrontees au disque, mesure le (\d{4}-\d{2}-\d{2})/;
const MOTIF_PLANCHER_LISIBLE =
  'PLANCHER DECLARE : <n> taches confrontees au disque, mesure le <AAAA-MM-JJ>';

/** Le motif exact que porte `prIndisponible` quand le mode n'a PAS BESOIN de la source PR. */
const PR_NON_CONSULTEE = 'non consultée par ce mode';

/** Les statuts de tâche qui valent « livrée » — la même liste que `gov:tasks`. */
// L'ensemble « livrée » ne s'écrit plus ici : il se DÉRIVE du barème unique de
// `scripts/lot/avancement.ts`, dont l'exhaustivité est confrontée à l'enum `statut` du schéma.
// Il était recopié dans CINQ fichiers — relevé par la lentille `schema` sur la PR 28, dans la
// PR même qui écrivait la règle l'interdisant (RM-04, `docs/GLOSSAIRE.md` §4 : « deux copies du
// même vocabulaire divergent toujours »). Un dixième statut faisait rougir `gov:inventaire` et
// laissait les cinq copies se taire en se trompant.
const LIVREE = LIVREE_DERIVEE;

// Une garde qui lit un statut ne tourne pas sur un barème incomplet sans le dire.
{
  const ecarts = verifierExhaustivite();
  if (ecarts.length > 0) {
    console.error('❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :');
    ecarts.forEach((e) => console.error('   ' + e));
    process.exit(1);
  }
}

/** Un identifiant d'exigence, tel que `gov:identifiants` l'exige : préfixe, domaine, trois chiffres. */
const MOTIF_REQ = /REQ-[A-Z]{2,4}-\d{3}/g;

// ── les types ────────────────────────────────────────────────────────────────
export type Exigence = {
  id: string;
  statut: string;
  remplaceePar: string | null;
  taches: string[];
  module: number | null;
  etape: number | null;
  phase: number | null;
};
export type Tache = {
  id: string;
  statut: string;
  phase: number;
  reqs: string[];
  tests?: Record<string, string[]>;
  /**
   * Le dépôt de la tâche. Absent = celui-ci (GOV-038) : les fixtures de `--prove` n'ont pas à le
   * porter, et c'est la valeur qui rend le contrôle le plus STRICT — un défaut d'omission ne doit
   * jamais relâcher une garde.
   */
  repo?: string;
};

export type FichierTest = {
  chemin: string;
  /** Vrai si `vitest.config.ts` le fait tourner. Une suite qui ne tourne pas ne garde rien. */
  execute: boolean;
  /** Les titres tels qu'ils sont ÉCRITS (gabarits `${…}` compris). */
  titresStatiques: string[];
  /** Les titres tels qu'ils sont RÉSOLUS par vitest, ou `null` si la résolution a échoué. */
  titresResolus: string[] | null;
  /**
   * POURQUOI ils n'ont pas été résolus, quand `titresResolus` vaut `null` (GOV-082). `undefined` =
   * la résolution n'a pas été demandée pour ce fichier. Les deux causes ne se confondent plus :
   * un énumérateur qui ÉCHOUE se relance, un énumérateur qui rend le VIDE avec le code zéro est
   * STABLE — le relancer ne changera rien, et le dire évite au lecteur de rejouer pour rien.
   */
  motifNonResolus?: MotifNonResolus;
  /** Les exigences citées : annotations `@req` et identifiants dans les titres. */
  reqsCitees: string[];
  /** Les titres des TESTS eux-mêmes (`it`, `test`), sans les `describe` — REQ-QA-014, QA-T03. */
  titresDeTest: string[];
  /** Les annotations `@req`, chacune avec sa ligne et sa place : en tête du fichier ou non. */
  annotations: AnnotationReq[];
};

/** Un test tel que la passe l'a RENDU : son nom (« describe > it »), son titre, son statut. */
export type ResultatTest = { nom: string; titre: string; statut: string };

/** Pourquoi les résultats ne se lisent pas. `perimes` se constate au jugement, contre le disque. */
export const MOTIFS_RESULTATS = ['absents', 'illisibles', 'perimes'] as const;

/**
 * Les RÉSULTATS de la passe de tests (`--resultats`, QA-T03). `non_demandes` : la garde ne juge
 * pas le vert, et le DIT. `absents` / `illisibles` : on les a demandés et on n'a rien pu lire — la
 * garde rougit, elle ne se déclare pas verte sur ce qu'elle n'a pas lu.
 */
export type Resultats =
  | { etat: 'non_demandes' }
  | { etat: 'absents' | 'illisibles'; source: string; detail: string }
  | { etat: 'lus'; source: string; parFichier: Record<string, ResultatTest[]> };

export type PullRequest = { numero: number; gabarit: boolean; couvre: string[] };

/**
 * Le PLANCHER de couverture (GOV-043) : une valeur, une source, une date — RM-10. Aucun littéral
 * ici : la valeur est LUE dans le champ `verifie` de l'entrée de `docs/gates.json` dont le
 * `script` est ce fichier, où elle s'écrit par `reecrire-champ` (registre en `deny`, geste
 * journalisé). `null` = pas de plancher lisible, et la garde le refuse (`plancher_non_declare`).
 */
export type Plancher = { valeur: number; mesureLe: string; source: string };

export type Univers = {
  exigences: Exigence[];
  taches: Tache[];
  fichiers: FichierTest[];
  /** `null` = source PR indisponible. Jamais `[]` : la liste vide voudrait dire « aucune PR ». */
  pr: PullRequest[] | null;
  prIndisponible: string | null;
  plancher: Plancher | null;
  resultats: Resultats;
};

export type Faute = { famille: string; message: string };

export const FAMILLES = [
  'tache_sans_req',
  'test_cite_req_inconnue',
  'annotation_absorbee_sans_renvoi',
  'req_sans_test',
  'test_promis_absent',
  'promesse_ambigue',
  'req_non_citee_par_son_test',
  'test_promis_non_vert',
  'titres_non_resolus',
  'resultats_illisibles',
  'pr_sans_couvre',
  'pr_couvre_req_inconnue',
  'vue_divergente',
  'plancher_non_declare',
  'couverture_sous_plancher',
];

// ── normalisation des titres ─────────────────────────────────────────────────
/**
 * Deux titres se comparent APRÈS neutralisation de ce qui varie sans rien vouloir dire : accents,
 * variantes d'apostrophe et de guillemet, tirets longs, espaces multiples. `docs/tasks.json`
 * écrit « un temoin » là où le fichier écrit « un témoin », et les deux désignent le même `it()` ;
 * l'inverse — figer la casse et les accents — aurait fait rougir la garde sur de la typographie.
 */
export function normaliserTitre(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚‛`´']/g, '')
    .replace(/[“”«»"]/g, '')
    .replace(/[–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Un nom de test RÉSOLU (« `describe` > `it` ») porte-t-il la promesse écrite dans `tests{}` ?
 *
 * La comparaison se fait SEGMENT PAR SEGMENT, dans l'ordre, autour du ` > ` que vitest écrit entre
 * un `describe` et son `it`. Une comparaison de la chaîne entière rougissait sur GOV-003, qui
 * promet « 'gov:identifiants' > sait rougir : 3 témoins et 10 contre-témoins » là où le `describe`
 * s'appelle en réalité « gov:identifiants — citer n'est pas se servir » : le `it()` visé existe,
 * porte le bon nom, et désigner son `describe` par son préfixe suffit à le retrouver. Ce qui doit
 * rester attrapé — et l'est — c'est un SEGMENT qui n'existe nulle part dans le nom réel, comme
 * « ses 11 familles » pour un fichier qui en annonce douze.
 */
export function nomPorteLaPromesse(nomResolu: string, promesse: string): boolean {
  const nom = normaliserTitre(nomResolu);
  let curseur = 0;
  for (const segment of promesse
    .split('>')
    .map((s) => normaliserTitre(s))
    .filter((s) => s.length > 0)) {
    const i = nom.indexOf(segment, curseur);
    if (i < 0) return false;
    curseur = i + segment.length;
  }
  return true;
}

// ── les contrôles ────────────────────────────────────────────────────────────
/**
 * Une exigence est **réputée testée** si une tâche livrée la porte. Voir l'en-tête : le registre
 * ne porte aucune échelle de maturité, celle-ci est dérivée de ce que le backlog sait.
 */
function reputeeTestee(e: Exigence, parTache: Map<string, Tache>): boolean {
  if (e.statut !== 'active') return false;
  return e.taches.some((id) => livreeIci(parTache.get(id)));
}

/**
 * « Livrée » ET « livrée ICI » (GOV-038). Cette garde ne peut affirmer qu'une exigence a un test
 * que si le test peut se trouver sur CE disque. Une exigence dont la seule tâche livrée vit dans
 * `axionia` n'a rien à montrer ici : la réputer testée reviendrait à lui réclamer une preuve que
 * ce dépôt ne peut pas produire, et `req_sans_test` rougirait sur ONZE exigences le jour où
 * `INT-T01b` passe `fusionnee` — pour un travail bien fait et bien testé, dans son dépôt.
 *
 * ⚠️ CE QUE CETTE LIGNE COÛTE, dit plutôt que tu : elle crée un endroit où marquer une tâche
 * `repo: "axionia"` DISPENSE de la preuve de test. Le contrepoids n'est pas dans ce fichier :
 * `gov:tasks` exige désormais de toute tâche livrée hors dépôt une `attestation` portant le SHA
 * ENTIER de son commit de fusion, et `pnpm gov:attestation --en-ligne` le résout contre la forge.
 * `repo` reste écrit par le `gardien-spec`, jamais par un développeur.
 */
function livreeIci(t: Tache | undefined): boolean {
  return t !== undefined && LIVREE.has(t.statut) && (t.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL;
}

/** Le fichier de test que désigne une promesse, ou la raison pour laquelle il n'y en a pas. */
function resoudreFichier(
  chemin: string,
  fichiers: FichierTest[]
): { fichier: FichierTest } | { erreur: 'absent' | 'ambigu'; candidats: string[] } {
  const vise = chemin.replace(/\\/g, '/');
  const exact = fichiers.filter((f) => f.chemin === vise);
  if (exact.length === 1) return { fichier: exact[0]! };
  if (exact.length === 0 && !vise.includes('/')) {
    // 22 valeurs de `tests{}` ne portent AUCUN répertoire (« regles-maison.spec.ts ») : leur
    // répertoire n'est écrit nulle part (`docs/paths-proposes.json`, `testsSansRepertoire`).
    // On les résout par nom de base — et on refuse de choisir si deux fichiers répondent.
    const parNom = fichiers.filter((f) => basename(f.chemin) === vise);
    if (parNom.length === 1) return { fichier: parNom[0]! };
    if (parNom.length > 1) return { erreur: 'ambigu', candidats: parNom.map((f) => f.chemin) };
  }
  if (exact.length > 1) return { erreur: 'ambigu', candidats: exact.map((f) => f.chemin) };
  return { erreur: 'absent', candidats: [] };
}

export function controler(u: Univers): Faute[] {
  return juger(u).fautes;
}

/** Ce que le jugement a confronté : tâches, paires (tâche, exigence), et paires VERTES. */
type Jugement = { fautes: Faute[]; confrontees: Set<string>; paires: number; vertes: number };

/**
 * Le contrôle ET ce qu'il a confronté. Les deux sortent du MÊME passage : le périmètre n'est pas
 * une seconde écriture des règles ci-dessous — une tâche y entre à l'endroit exact où une de ses
 * promesses reçoit un verdict, et nulle part ailleurs (RM-01).
 */
function juger(u: Univers): Jugement {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });
  /** Les tâches dont au moins une promesse de `tests{}` a reçu un verdict contre CE disque. */
  const confrontees = new Set<string>();
  /** Les paires (tâche, exigence active) jugées sur les deux formes, et celles qu'on a vues VERTES. */
  let paires = 0;
  let vertes = 0;

  const parReq = new Map(u.exigences.map((e) => [e.id, e]));
  const parTache = new Map(u.taches.map((t) => [t.id, t]));

  // ── source 2 : une tâche sans exigence ne sait pas ce qu'elle livre ────────
  for (const t of u.taches) {
    if (t.reqs.length === 0) {
      ajouter(
        'tache_sans_req',
        `${t.id} ne cite aucune exigence : rien ne dit ce qu'elle livre, et sa PR ne pourra ` +
          `remplir aucun « Couvre: REQ-… ».`
      );
    }
  }

  // ── source 3 : ce que les tests citent ────────────────────────────────────
  /** REQ → fichiers EXÉCUTÉS qui la citent. Un test que vitest ne lance pas ne couvre rien. */
  const citeePar = new Map<string, string[]>();
  for (const f of u.fichiers) {
    for (const r of new Set(f.reqsCitees)) {
      if (!parReq.has(r)) {
        ajouter(
          'test_cite_req_inconnue',
          `${f.chemin} cite ${r}, qui n'est pas au registre ${CHEMIN_REGISTRE}. ` +
            `Une annotation qui ne résout pas trace vers rien.`
        );
        continue;
      }
      if (!f.execute) continue;
      citeePar.set(r, [...(citeePar.get(r) ?? []), f.chemin]);
    }
  }

  // ── une annotation qui s'adosse à un texte hors vigueur (QA-T03) ──────────────────────────────
  // REQ-QA-014 : « chaque `@req` […] pointe une REQ […] dont le texte est EN VIGUEUR ». La règle
  // est celle que `titres-de-test-resolvent.spec.ts` tient pour les TITRES (GOV-039) : une exigence
  // absorbée garde le droit d'étiqueter, à condition de porter son renvoi vers la survivante que
  // le registre nomme (`remplaceePar`) — ici, sur la MÊME ligne que l'annotation.
  for (const f of u.fichiers) {
    for (const a of f.annotations) {
      const e = parReq.get(a.req);
      if (!e || e.statut !== 'absorbee') continue;
      if (e.remplaceePar && a.texteLigne.includes(e.remplaceePar)) continue;
      ajouter(
        'annotation_absorbee_sans_renvoi',
        `${f.chemin}:${a.ligne} annote \`@req ${a.req}\`, dont le registre déclare le texte REMPLACÉ ` +
          `par ${e.remplaceePar ?? '(rien)'} : l'annotation s'adosse à un texte hors vigueur. Écris ` +
          `« @req ${a.req} → ${e.remplaceePar ?? 'REQ-…'} » sur la même ligne, ou annote la survivante.`
      );
    }
  }

  // ── les résultats de la passe : on les a demandés, on doit pouvoir les lire (QA-T03) ──────────
  // Absents, illisibles, ou PÉRIMÉS — un fichier que la configuration exécute et que les résultats
  // ne portent pas : une passe partielle, ou celle d'un autre arbre. Jamais un vert.
  const res = u.resultats;
  if (res.etat === 'absents' || res.etat === 'illisibles') {
    ajouter(
      'resultats_illisibles',
      `motif ${res.etat} — ${res.source} : ${res.detail}. Le vert des tests n'est PAS jugé, et la ` +
        `garde ne se déclare pas verte sur ce qu'elle n'a pas pu lire.`
    );
  } else if (res.etat === 'lus') {
    const manquants = u.fichiers
      .filter((f) => f.execute && !Object.hasOwn(res.parFichier, f.chemin))
      .map((f) => f.chemin);
    if (manquants.length > 0) {
      ajouter(
        'resultats_illisibles',
        `motif perimes — ${res.source} ne porte pas ${manquants.length} fichier(s) que ` +
          `${CHEMIN_VITEST} exécute : ${manquants.join(', ')}. Ce sont les résultats d'une passe ` +
          `partielle ou d'un autre arbre ; relance \`pnpm test\` en entier.`
      );
    }
  }

  // ── l'orphelinat, premier sens : une exigence livrée que rien ne cite ──────
  const sansTest = new Set<string>();
  for (const e of u.exigences) {
    if (!reputeeTestee(e, parTache)) continue;
    if ((citeePar.get(e.id) ?? []).length > 0) continue;
    sansTest.add(e.id);
    const porteuses = e.taches.filter((id) => LIVREE.has(parTache.get(id)?.statut ?? ''));
    const promis = porteuses.flatMap((id) => Object.values(parTache.get(id)?.tests ?? {}).flat());
    ajouter(
      'req_sans_test',
      `${e.id} est portée par ${porteuses.join(', ')} (livrée) et AUCUN test exécuté ne la cite. ` +
        (promis.length > 0
          ? `Les tests déclarés (${[...new Set(promis.map((p) => p.split('#')[0]!))].join(', ')}) ne ` +
            `portent ni annotation \`@req ${e.id}\` ni son identifiant dans un titre de \`it()\`.`
          : `Aucun test n'est même déclaré.`)
    );
  }

  // ── ce que `tests{}` promet, confronté au disque ───────────────────────────
  for (const t of u.taches) {
    // LE FILTRE DE STATUT NE PORTE PLUS SUR TOUT, et le motif est mesuré.
    //
    // Il écartait toute tâche non livrée, au motif — juste — qu'« une tâche à faire promet un test
    // à venir ». Conséquence trouvée par la lentille « exactitude » sur la PR 28 : les huit tâches
    // du lot L-1-03 étaient encore `a_faire` au moment de leur revue, donc les 33 entrées
    // `tests{}` que ce lot écrivait n'étaient confrontées au disque PAR AUCUNE GARDE. La sortie
    // verte « 22 exigences réputées testées » était vraie et ne disait RIEN de ce que le lot
    // ajoutait — et c'est par ce trou qu'une promesse inventée est passée, dans la tâche même qui
    // livre la garde censée l'attraper.
    //
    // La distinction juste n'est pas le STATUT, c'est l'EXISTENCE DU FICHIER :
    //   — le fichier n'existe pas encore  → toléré tant que la tâche n'est pas livrée ;
    //   — le fichier EXISTE et ne porte pas ce titre → la promesse est FAUSSE, quel que soit le
    //     statut. Elle ne deviendra pas vraie en attendant.
    //
    // ET LE DÉPÔT (GOV-038). La distinction ci-dessus suppose encore une chose : que le fichier
    // promis PUISSE être sur ce disque. Quatorze tâches du backlog vivent dans `axionia`, leurs
    // tests aussi, et `INT-T01b` est la première à avoir été livrée. Le schéma EXIGE `tests` dès
    // `en_cours` ; confronter cette promesse-là au disque de CE dépôt ferait rougir la garde au
    // moment même où on déclare une livraison réelle, et les seules issues seraient de mentir sur
    // le chemin ou de désarmer la garde — le mode d'échec que RM-02 décrit par l'autre bout.
    // L'ignorance n'est pas silencieuse pour autant : `direLesSources()` compte ces tâches et le
    // DIT. Le contrôle qui les couvre est celui du dépôt d'en face, pas celui-ci.
    const livree = LIVREE.has(t.statut);
    const surCeDisque = (t.repo ?? DEPOT_LOCAL) === DEPOT_LOCAL;
    for (const [req, promesses] of Object.entries(t.tests ?? {})) {
      for (const promesse of promesses) {
        const [chemin, ...reste] = promesse.split('#');
        const titre = reste.join('#');
        const r = resoudreFichier(chemin!, u.fichiers);

        if ('erreur' in r) {
          if (r.erreur === 'ambigu') {
            confrontees.add(t.id);
            ajouter(
              'promesse_ambigue',
              `${t.id} promet « ${promesse} » pour ${req} : ${r.candidats.length} fichiers portent ` +
                `ce nom (${r.candidats.join(', ')}). Écris le chemin complet — la garde refuse de choisir.`
            );
          } else if (livree && surCeDisque) {
            // Le fichier n'existe pas : c'est un défaut SEULEMENT si la tâche est livrée ET si son
            // dépôt est celui-ci. Avant la livraison, c'est une promesse de test à venir, et une
            // garde qui la refuserait interdirait d'écrire une acceptance avant son code ; hors de
            // ce dépôt, l'absence ne dit rien — le fichier n'a jamais eu vocation à être ici.
            confrontees.add(t.id);
            ajouter(
              'test_promis_absent',
              `${t.id} promet « ${promesse} » pour ${req} : aucun fichier de test de ce nom sur le disque.`
            );
          }
          continue;
        }

        const f = r.fichier;
        if (!f.execute) {
          if (!livree || !surCeDisque) continue;
          confrontees.add(t.id);
          ajouter(
            'test_promis_absent',
            `${t.id} promet « ${promesse} » pour ${req} : ${f.chemin} existe mais ${CHEMIN_VITEST} ne ` +
              `le fait pas tourner. Une suite qui ne tourne pas ne garde rien.`
          );
          continue;
        }

        /** Le titre promis n'a pas pu être retrouvé : son statut ne se juge pas une seconde fois. */
        let titreIntrouvable = false;
        if (titre.length > 0) {
          confrontees.add(t.id);
          if (f.titresResolus === null) {
            titreIntrouvable = true;
            ajouter(
              'titres_non_resolus',
              `${t.id} promet un titre précis dans ${f.chemin} (« ${titre} ») et les titres de ce ` +
                `fichier n'ont pas pu être résolus : la promesse n'est PAS vérifiée. ` +
                `Le contrôle ne se déclare pas vert sur ce qu'il n'a pas pu lire. ` +
                (f.motifNonResolus === 'vide_incoherent'
                  ? `Cause : l'énumération a rendu une liste VIDE — ou partielle, sous le nombre de ` +
                    `titres que le TEXTE du fichier porte — avec le code zéro. Cette réponse est STABLE — la relancer ne ` +
                    `changera rien. Elle dépend du lanceur par lequel gov:trace est invoquée : ` +
                    `relance-la par \`pnpm gov:trace\`, jamais par le binaire du transpileur seul.`
                  : `Cause : l'énumération a ÉCHOUÉ (code non nul, ou sortie illisible) — souvent ` +
                    `un fichier de test qui ne se charge pas. Lis son erreur de chargement.`)
            );
          } else if (!f.titresResolus.some((x) => nomPorteLaPromesse(x, titre))) {
            titreIntrouvable = true;
            // Jugé pour TOUTE tâche, livrée ou non : le fichier est là, le titre n'y est pas, la
            // promesse est fausse aujourd'hui et le restera. C'est le cas que le filtre de statut
            // laissait passer sur les huit tâches du lot L-1-03.
            ajouter(
              'test_promis_absent',
              `${t.id} promet « ${promesse} » pour ${req} : ${f.chemin} ne contient aucun test dont ` +
                `le nom porte « ${titre} ». Les noms réels sont résolus par vitest, gabarits compris.`
            );
            // Pas de `continue` : un titre périmé et un test hors sujet sont DEUX défauts, et le
            // second reste vrai. GOV-017a cumule les deux sur la même ligne — la promesse nomme un
            // compte de familles qui n'existe plus, ET le fichier ne parle pas de l'exigence.
          }
        }

        // L'orphelinat, second sens : le test promis existe, mais il ne parle pas de l'exigence.
        // Sauté si l'exigence est déjà signalée `req_sans_test` (même cause, deux messages) ou si
        // elle est absorbée (c'est la survivante qui porte la charge de la preuve).
        const e = parReq.get(req);
        if (!e || e.statut !== 'active') continue;
        // Une exigence ACTIVE est jugée — ici, ou déjà par `req_sans_test` (même cause, un seul
        // message). Une exigence absorbée ou inconnue ne l'est pas : une promesse sans titre qui
        // ne porte qu'elle n'a RIEN reçu, et la tâche reste hors du périmètre — c'est dit.
        confrontees.add(t.id);
        if (sansTest.has(req)) continue;
        paires++;

        // LES DEUX FORMES, et non plus l'une OU l'autre (QA-T03) : REQ-QA-014 exige `@req` EN TÊTE
        // du fichier ET l'identifiant dans le titre d'un `it()` — celui du test, pas d'un `describe`.
        const manques: string[] = [];
        if (!f.annotations.some((a) => a.req === req && a.enTete)) {
          const ailleurs = f.annotations.find((a) => a.req === req);
          manques.push(
            ailleurs
              ? `\`@req ${req}\` est écrite ligne ${ailleurs.ligne}, pas en tête du fichier (premier ` +
                  `bloc de commentaires, avant la première instruction)`
              : `ni \`@req ${req}\` en tête du fichier`
          );
        }
        // Le titre du test se lit ÉCRIT, ou RÉSOLU par vitest quand il est un gabarit
        // (`describe.each`) : le dernier segment du nom résolu est le titre du `it()` lui-même.
        if (
          !f.titresDeTest.some((x) => x.includes(req)) &&
          !(f.titresResolus ?? []).some((n) => n.split(' > ').pop()!.includes(req))
        ) {
          manques.push(
            f.titresStatiques.some((x) => x.includes(req))
              ? `aucun titre de \`it()\` ne contient ${req} — un \`describe\` le porte, pas le test lui-même`
              : `aucun titre de \`it()\` ne contient ${req}`
          );
        }
        if (manques.length > 0) {
          ajouter(
            'req_non_citee_par_son_test',
            `${t.id} déclare couvrir ${req} par « ${promesse} », mais ${f.chemin} ne porte pas les ` +
              `deux formes de REQ-QA-014 : ${manques.join(' ; ')}. La traçabilité serait au vert sur ` +
              `un test qui ne parle pas de cette exigence (défaut constaté à la main, PR 27).`
          );
          continue;
        }

        // LE VERT (QA-T03). Sans résultats demandés, il n'est pas jugé — et c'est DIT au résumé.
        // Fichier absent des résultats : déjà nommé `perimes` ; titre promis introuvable : déjà nommé.
        if (res.etat !== 'lus' || titreIntrouvable) continue;
        const rendus = Object.hasOwn(res.parFichier, f.chemin) ? res.parFichier[f.chemin]! : null;
        if (rendus === null) continue;
        // Une promesse `#titre` vise CE test-là : tous les tests qui portent ce nom doivent être
        // verts, et il en faut un. Sans `#`, il suffit d'UN test vert dont le TITRE porte l'exigence.
        const vises =
          titre.length > 0
            ? rendus.filter((x) => nomPorteLaPromesse(x.nom, titre))
            : rendus.filter((x) => x.titre.includes(req));
        const verts = vises.filter((x) => x.statut === 'passed');
        const vert =
          titre.length > 0 ? vises.length > 0 && verts.length === vises.length : verts.length > 0;
        if (vert) {
          vertes++;
          continue;
        }
        const statuts = vises.map((x) => `« ${x.nom} » ${x.statut}`).join(', ');
        ajouter(
          'test_promis_non_vert',
          `${t.id} déclare couvrir ${req} par « ${promesse} » : ` +
            (titre.length > 0
              ? `la promesse vise CE test, et ${res.source} ne le rend pas vert` +
                (vises.length > 0 ? ` (${statuts})` : ` (aucun résultat ne porte ce nom)`)
              : `aucun test de ${f.chemin} titré de ${req} n'est vert dans ${res.source}` +
                (vises.length > 0 ? ` (${statuts})` : ` (aucun résultat titré de ${req})`)) +
            `. Sauté, à faire, en échec ou absent : ne couvre rien.`
        );
      }
    }
  }

  // ── source 4 : les PR fusionnées, si on a pu les lire ──────────────────────
  if (u.pr !== null) {
    for (const pr of u.pr) {
      if (!pr.gabarit) continue; // une PR qui n'utilise pas le gabarit relève de `gov:pr`, pas d'ici
      if (pr.couvre.length === 0) {
        ajouter(
          'pr_sans_couvre',
          `La PR ${pr.numero} suit le gabarit et ne porte aucune ligne « Couvre: REQ-… » : le ` +
            `maillon exigence → PR est rompu pour tout ce qu'elle a livré.`
        );
        continue;
      }
      for (const r of pr.couvre) {
        if (!parReq.has(r)) {
          ajouter(
            'pr_couvre_req_inconnue',
            `La PR ${pr.numero} déclare couvrir ${r}, qui n'est pas au registre ${CHEMIN_REGISTRE}.`
          );
        }
      }
    }
  }

  // ── le plancher de couverture (GOV-043) ───────────────────────────────────
  // Ce contrôle est celui qu'on invoque quand un trou de `lot:cloture` est jugé tolérable : s'il
  // rétrécit, il compense moins, et rien ne le disait. Un filtre de statut a déjà sorti 33
  // promesses de sa vue sans qu'aucun compte ne bouge (PR 28).
  if (u.plancher === null) {
    ajouter(
      'plancher_non_declare',
      `Aucun plancher de couverture lisible (${CHEMIN_GATES}, entrée de script ${CE_SCRIPT}, ` +
        `champ \`verifie\` : « ${MOTIF_PLANCHER_LISIBLE} »). Sans plancher, une couverture qui ` +
        `baisse ne se voit pas — la garde refuse plutôt que de se taire.`
    );
  } else if (confrontees.size < u.plancher.valeur) {
    ajouter(
      'couverture_sous_plancher',
      `périmètre : ${confrontees.size} tâche(s) confrontée(s) à ce disque, sous le plancher ` +
        `déclaré : ${u.plancher.valeur} (${u.plancher.source}, mesuré le ${u.plancher.mesureLe}). ` +
        `Le contrôle compensatoire couvre MOINS qu'il ne couvrait : retrouve la tâche sortie ` +
        `(\`pnpm gov:trace\` nomme le complément), ou abaisse le plancher dans sa source, par ` +
        `\`reecrire-champ\`, avec le motif.`
    );
  }

  return { fautes, confrontees, paires, vertes };
}

/**
 * Le plancher, LU dans `docs/gates.json` (RM-10 : une valeur, une source, une date). `null` si le
 * registre est absent, illisible, s'il ne porte pas exactement une entrée pour ce script, ou si
 * son `verifie` ne dit pas le plancher sous la forme attendue.
 */
export function lirePlancher(texteGates: string | null): Plancher | null {
  if (texteGates === null) return null;
  let doc: { gates?: { id?: string; script?: string; verifie?: string }[] };
  try {
    doc = JSON.parse(texteGates) as typeof doc;
  } catch {
    return null;
  }
  const entrees = (doc.gates ?? []).filter((g) => g.script === CE_SCRIPT);
  if (entrees.length !== 1) return null;
  const m = MOTIF_PLANCHER.exec(entrees[0]!.verifie ?? '');
  if (!m) return null;
  return {
    valeur: Number(m[1]),
    mesureLe: m[2]!,
    source: `${CHEMIN_GATES} › ${entrees[0]!.id ?? '?'}`,
  };
}

// ── le périmètre : ce que la garde a confronté, et ce qu'elle n'a pas regardé ──
/** Pourquoi une tâche est HORS du périmètre. L'ordre est celui où la raison se constate. */
export const MOTIFS_HORS_PERIMETRE = [
  'hors_depot',
  'sans_promesse',
  'promesse_a_venir',
  'promesse_non_jugee',
] as const;
export type MotifHorsPerimetre = (typeof MOTIFS_HORS_PERIMETRE)[number];

export type Perimetre = {
  dedans: string[];
  dehors: Record<MotifHorsPerimetre, string[]>;
};

/**
 * LE PÉRIMÈTRE — les tâches dont au moins une promesse de `tests{}` a reçu un verdict contre ce
 * disque — et son COMPLÉMENT, rangé par raison :
 *
 *   — `hors_depot`         : la tâche vit dans un autre dépôt, ses tests aussi (GOV-038) ;
 *   — `sans_promesse`      : aucun `tests{}` — la garde n'a rien à confronter ;
 *   — `promesse_a_venir`   : aucun fichier promis n'existe encore, et la tâche n'est pas livrée ;
 *   — `promesse_non_jugee` : un fichier promis existe, et pourtant rien n'a été jugé — pas exécuté
 *     par vitest avant la livraison, ou une promesse sans titre qui ne porte qu'une exigence
 *     absorbée (le contrôle ne juge la citation que d'une exigence ACTIVE).
 *
 * Le périmètre sort de `juger()` ; seul le RANGEMENT du complément se calcule ici.
 */
export function perimetre(u: Univers): Perimetre {
  const { confrontees } = juger(u);
  const dehors: Record<MotifHorsPerimetre, string[]> = {
    hors_depot: [],
    sans_promesse: [],
    promesse_a_venir: [],
    promesse_non_jugee: [],
  };
  const dedans: string[] = [];
  for (const t of u.taches) {
    if (confrontees.has(t.id)) {
      dedans.push(t.id);
      continue;
    }
    const promesses = Object.values(t.tests ?? {}).flat();
    if ((t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL) dehors.hors_depot.push(t.id);
    else if (promesses.length === 0) dehors.sans_promesse.push(t.id);
    else if (promesses.every((p) => 'erreur' in resoudreFichier(p.split('#')[0]!, u.fichiers)))
      dehors.promesse_a_venir.push(t.id);
    else dehors.promesse_non_jugee.push(t.id);
  }
  return { dedans, dehors };
}

// ── la vue ───────────────────────────────────────────────────────────────────
/** Une barre verticale dans une cellule casse le tableau : elle s'échappe (CONVENTIONS §1). */
function echapper(v: string): string {
  return v.replace(/\|/g, '\\|');
}

const NB_MODULES = 21;
const NB_ETAPES = 12;

/** Le rendu. Déterministe : deux appels sur le même univers rendent le même octet. */
export function rendreVue(u: Univers): string {
  const parTache = new Map(u.taches.map((t) => [t.id, t]));
  const citeePar = new Map<string, string[]>();
  for (const f of u.fichiers) {
    if (!f.execute) continue;
    for (const r of new Set(f.reqsCitees)) citeePar.set(r, [...(citeePar.get(r) ?? []), f.chemin]);
  }

  const actives = u.exigences
    .filter((e) => e.statut === 'active')
    .sort((a, b) => a.id.localeCompare(b.id));
  const absorbees = u.exigences
    .filter((e) => e.statut === 'absorbee')
    .sort((a, b) => a.id.localeCompare(b.id));
  const etat = (e: Exigence): string => {
    const testee = reputeeTestee(e, parTache);
    const citee = (citeePar.get(e.id) ?? []).length > 0;
    if (testee && citee) return 'couverte';
    if (testee) return 'ORPHELINE';
    if (citee) return 'citee-avant-livraison';
    return 'a-venir';
  };

  const l: string[] = [];
  l.push('# Matrice de traçabilité — Axion Apporteurs');
  l.push('');
  l.push(
    '> ⚠️ **Ce fichier est une VUE. Ses sources sont `docs/requirements.json`, `docs/tasks.json`'
  );
  l.push('> et les fichiers de test présents sur le disque.**');
  l.push(
    '> Regénérée par `pnpm gov:trace --render`, jamais éditée à la main : une correction tapée'
  );
  l.push('> ici disparaît au rendu suivant, et une matrice tenue à la main est fausse le jour où');
  l.push('> quelqu’un oublie de l’ouvrir (RM-01, REQ-GOV-005 → REQ-QA-014).');
  l.push(
    '> `pnpm gov:trace --verifier` rougit si ce fichier diffère de ce que les sources produisent.'
  );
  l.push('>');
  l.push(
    '> **Le maillon PR n’est pas écrit ici.** Il est contrôlé par `pnpm gov:trace`, qui lit les'
  );
  l.push(
    '> corps de PR fusionnées (`Couvre: REQ-…`). Une vue dont le contenu dépendrait d’un appel'
  );
  l.push('> réseau mesurerait la disponibilité de l’outil, pas la dérivation de la vue.');
  l.push('>');
  l.push('> **« Réputée testée » est DÉRIVÉ, pas lu.** Le registre ne porte aucune échelle de');
  l.push('> maturité : une exigence l’est dès qu’une des tâches qui la portent est livrée.');
  l.push('');

  const testees = actives.filter((e) => reputeeTestee(e, parTache));
  const orphelines = testees.filter((e) => (citeePar.get(e.id) ?? []).length === 0);
  const executes = u.fichiers.filter((f) => f.execute);
  l.push(
    `**${actives.length} exigences actives · ${testees.length} réputées testées · ` +
      `${testees.length - orphelines.length} couvertes · ${orphelines.length} orphelines.**`
  );
  l.push('');
  l.push(
    `${u.taches.length} tâches, dont ${u.taches.filter((t) => LIVREE.has(t.statut)).length} livrées · ` +
      `${executes.length} fichiers de test exécutés par \`vitest\` sur ${u.fichiers.length} présents.`
  );
  l.push('');

  l.push('## Exigences réputées testées');
  l.push('');
  l.push('| Exigence | Tâches porteuses | Tests qui la citent | État |');
  l.push('| --- | --- | --- | --- |');
  for (const e of testees) {
    const tests = (citeePar.get(e.id) ?? []).sort();
    l.push(
      `| \`${e.id}\` | ${e.taches.map((t) => `\`${t}\``).join(', ')} | ` +
        `${tests.length > 0 ? tests.map((t) => `\`${echapper(t)}\``).join(', ') : '—'} | ${etat(e)} |`
    );
  }
  l.push('');

  l.push('## Exigences actives dont aucune tâche n’est encore livrée');
  l.push('');
  l.push('| Exigence | Phase | Tâches porteuses | Tests déclarés |');
  l.push('| --- | ---: | --- | --- |');
  for (const e of actives.filter((x) => !reputeeTestee(x, parTache))) {
    const promis = [
      ...new Set(e.taches.flatMap((id) => Object.values(parTache.get(id)?.tests ?? {}).flat())),
    ].sort();
    l.push(
      `| \`${e.id}\` | ${e.phase ?? '—'} | ${e.taches.map((t) => `\`${t}\``).join(', ') || '—'} | ` +
        `${promis.length > 0 ? promis.map((p) => `\`${echapper(p)}\``).join(', ') : '—'} |`
    );
  }
  l.push('');

  l.push('## Exigences absorbées — le texte en vigueur est celui de la survivante');
  l.push('');
  l.push('| Exigence | Remplacée par | Tâches qui la citent encore |');
  l.push('| --- | --- | --- |');
  for (const e of absorbees) {
    l.push(
      `| \`${e.id}\` | \`${e.remplaceePar ?? '—'}\` | ${e.taches.map((t) => `\`${t}\``).join(', ') || '—'} |`
    );
  }
  l.push('');

  l.push('## Couverture des modules et des étapes');
  l.push('');
  l.push(
    'Les 21 modules et les 12 étapes de l’audit de bout en bout, tels que le registre les porte.'
  );
  l.push('');
  l.push('| Module | Exigences | Dont réputées testées |');
  l.push('| ---: | ---: | ---: |');
  for (let m = 1; m <= NB_MODULES; m++) {
    const liste = actives.filter((e) => e.module === m);
    l.push(
      `| ${m} | ${liste.length} | ${liste.filter((e) => reputeeTestee(e, parTache)).length} |`
    );
  }
  l.push('');
  l.push('| Étape | Exigences | Dont réputées testées |');
  l.push('| ---: | ---: | ---: |');
  for (let s = 1; s <= NB_ETAPES; s++) {
    const liste = actives.filter((e) => e.etape === s);
    l.push(
      `| ${s} | ${liste.length} | ${liste.filter((e) => reputeeTestee(e, parTache)).length} |`
    );
  }
  l.push('');

  l.push('## Fichiers de test');
  l.push('');
  l.push('| Fichier | Exécuté par vitest | Exigences citées |');
  l.push('| --- | --- | --- |');
  for (const f of [...u.fichiers].sort((a, b) => a.chemin.localeCompare(b.chemin))) {
    const reqs = [...new Set(f.reqsCitees)].sort();
    l.push(
      `| \`${echapper(f.chemin)}\` | ${f.execute ? 'oui' : 'NON'} | ` +
        `${reqs.length > 0 ? reqs.map((r) => `\`${r}\``).join(', ') : '—'} |`
    );
  }
  l.push('');
  return l.join('\n');
}

/**
 * La comparaison se fait à FINS DE LIGNE NORMALISÉES : un poste Windows dont `core.autocrlf` est
 * armé relit des `\r\n` là où le rendu écrit des `\n`. Sans cela, la garde serait verte en CI et
 * rouge chez tout le monde — elle mesurerait la configuration de git (leçon d'`adr:index`).
 */
export function normaliserFins(t: string): string {
  return t.replace(/\r\n/g, '\n');
}

export function verifierVue(u: Univers, surDisque: string | null, chemin: string): Faute[] {
  if (surDisque === null) {
    return [
      {
        famille: 'vue_divergente',
        message: `${chemin} est absent. Lance \`pnpm gov:trace --render\`.`,
      },
    ];
  }
  if (normaliserFins(surDisque) !== normaliserFins(rendreVue(u))) {
    return [
      {
        famille: 'vue_divergente',
        message:
          `${chemin} diffère de ce que les sources produisent. La matrice est une VUE : corrige la ` +
          `source ou regénère (\`pnpm gov:trace --render\`), n'édite pas la vue.`,
      },
    ];
  }
  return [];
}

// ── lecture du disque ────────────────────────────────────────────────────────
/**
 * L'`include` et l'`exclude` de vitest sont LUS dans `vitest.config.ts`, pas recopiés : le jour où
 * quelqu'un déplace un dossier de tests, une liste recopiée ici déclarerait « exécuté » un fichier
 * que plus rien ne lance. `tests/gov/**` a précisément été ajouté après coup pour cette raison.
 */
function motifsVitest(): { include: string[]; exclude: string[] } {
  const texte = readFileSync(CHEMIN_VITEST, 'utf8');
  const bloc = (cle: string): string[] => {
    const i = texte.indexOf(`${cle}: [`);
    if (i < 0) return [];
    const fin = texte.indexOf(']', i);
    return [...texte.slice(i, fin).matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  };
  const include = bloc('include');
  const exclude = bloc('exclude');
  if (include.length === 0) {
    console.error(`❌ gov:trace — impossible de lire l'\`include\` de ${CHEMIN_VITEST}.`);
    process.exit(1);
  }
  return { include, exclude };
}

/** Un glob minimal : `**` traverse, `*` non, `{a,b}` alterne. Assez pour les motifs de vitest. */
function globVersRegex(motif: string): RegExp {
  let sortie = '';
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i]!;
    if (c === '*') {
      if (motif[i + 1] === '*') {
        sortie += '.*';
        i++;
        if (motif[i + 1] === '/') i++;
      } else sortie += '[^/]*';
    } else if (c === '{') {
      const fin = motif.indexOf('}', i);
      sortie += `(?:${motif
        .slice(i + 1, fin)
        .split(',')
        .join('|')})`;
      i = fin;
    } else if ('.+?^$()[]\\|'.includes(c)) {
      sortie += `\\${c}`;
    } else sortie += c;
  }
  return new RegExp(`^${sortie}$`);
}

/**
 * Les titres ÉCRITS, et les fichiers de test où ils se lisent, viennent de
 * `scripts/lot/titres-ecrits.ts`, et de nulle part ailleurs : ce script a des effets de bord au
 * chargement, donc sa lecture n'était importable par personne, et la spécification de REQ-QA-014
 * en avait écrit une seconde, plus pauvre, sur un périmètre plus étroit (GOV-039, PR 55).
 */
export { titresEcrits };

/** Les exigences qu'un fichier CITE : annotations `@req` et identifiants dans les titres. */
export function reqsCitees(texte: string): string[] {
  const parAnnotation = annotationsReq(texte).map((a) => a.req);
  const parTitre = titresEcrits(texte).flatMap((t) => t.match(MOTIF_REQ) ?? []);
  return [...new Set([...parAnnotation, ...parTitre])];
}

/**
 * Les noms de test RÉSOLUS, par `vitest list`. C'est la seule source qui connaisse les gabarits :
 * `describe.each(GARDES)` avec un titre en `ses ${familles} familles` ne s'évalue pas à la lecture,
 * et c'est exactement là que se cache une promesse périmée (« ses 11 familles » pour un fichier
 * qui en annonce 12).
 */
/** Ce qu'un énumérateur rend pour un lot de fichiers : a-t-il répondu, et avec quoi. */
export type Enumeration = { ok: boolean; entrees: { name: string; file: string }[] };

/** Une façon d'énumérer les cas d'une suite. INJECTABLE, pour que les deux faces se jouent. */
export type Enumerateur = (fichiers: string[]) => Enumeration;

/**
 * L'énumérateur RÉEL : un processus enfant `vitest list --json`.
 *
 * ⚠️ IL PEUT RENDRE LE VIDE AVEC LE CODE ZÉRO, et c'est tout l'objet de GOV-082. Selon le lanceur
 * par lequel `gov:trace` est elle-même invoquée — binaire du transpileur avec chemin explicite,
 * variable d'environnement équivalente, lanceur de paquets —, l'enfant rend soit la liste, soit
 * `[]` avec `status: 0`. Les deux réponses sont bien formées ; une seule dit quelque chose.
 */
export const enumererParVitest: Enumerateur = (fichiers) => {
  const r = spawnSync('npx', ['vitest', 'list', ...fichiers, '--json'], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  const brut = r.stdout ?? '';
  const debut = brut.indexOf('[');
  if (r.status !== 0 || debut < 0) return { ok: false, entrees: [] };
  try {
    return {
      ok: true,
      entrees: JSON.parse(brut.slice(debut)) as { name: string; file: string }[],
    };
  } catch {
    return { ok: false, entrees: [] };
  }
};

/**
 * LE PLANCHER D'UN FICHIER, DÉRIVÉ DE SON TEXTE — jamais tapé (RM-10, RM-01).
 *
 * C'est le nombre d'ouvertures de `it()` / `test()` que le DISQUE porte. Un fichier qui en écrit
 * deux et dont l'énumération rend ZÉRO cas n'a pas été lu : il a été manqué. La valeur ne vit
 * qu'ici, et elle se recompte par la même lecture que `gov:trace` utilise partout ailleurs
 * (`scripts/lot/titres-ecrits.ts`) — une seconde lecture divergerait, et la plus récente serait
 * la plus pauvre.
 */
export function plancherDeTitres(texte: string): number {
  // SANS LES COMMENTAIRES : le plancher est confronté à tout compte inférieur, pas seulement à zéro
  // (motif `mutation` T3, PR 114), et un `it(` cité dans la PROSE d'un en-tête le gonflait — mesuré
  // sur `adr-assertion-existe.spec.ts` : 7 au texte brut, 5 cas réellement énumérés. Un plancher
  // qui dépasse le réel accuse ; il doit rester un plancher.
  const sansCommentaires = texte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return titresDeTest(sansCommentaires).length;
}

/** Pourquoi les titres d'un fichier n'ont pas pu être résolus. Deux causes, et elles diffèrent. */
export const MOTIFS_NON_RESOLUS = ['echec', 'vide_incoherent'] as const;
export type MotifNonResolus = (typeof MOTIFS_NON_RESOLUS)[number];

/** Une cible dont l'énumération a rendu le VIDE alors que le disque porte des titres. */
export type Incoherence = { chemin: string; plancher: number };

/**
 * Les noms de test RÉSOLUS. C'est la seule source qui connaisse les gabarits :
 * `describe.each(GARDES)` avec un titre en `ses ${familles} familles` ne s'évalue pas à la lecture,
 * et c'est exactement là que se cache une promesse périmée (« ses 11 familles » pour un fichier
 * qui en annonce 12).
 *
 * 🔴 TROIS ÉTATS, ET ILS SE NOMMENT (GOV-082). Jusqu'au 2026-09-16 ils se lisaient tous les trois
 * pareil, et le troisième ACCUSAIT :
 *
 *   1. l'énumération a rendu des titres            → `titres` porte la liste ;
 *   2. elle a rendu ZÉRO titre alors que le disque en porte → `incoherents`, jamais `titres` ;
 *   3. elle a échoué (code non nul, sortie illisible)      → `echecs`.
 *
 * Le deuxième état est le défaut : `[]` rangé comme une réponse se lisait « résolu, aucun titre ne
 * correspond », d'où 53 `test_promis_absent` FABRIQUÉES sur un dépôt où rien ne manquait. Une garde
 * qui échoue FERMÉ est pire qu'une garde qui échoue ouvert : elle rend un rouge qui A L'AIR d'un
 * résultat, avec des lignes nominatives, et fait perdre une journée au lecteur suivant.
 *
 * LE PLANCHER EST DÉRIVÉ, JAMAIS TAPÉ : `plancherDe` rend ce que le TEXTE du fichier contient.
 * La garde ne SUPPOSE donc plus que le lanceur répond — elle le VÉRIFIE contre le disque.
 */
export function titresResolus(
  cibles: string[],
  plancherDe: (chemin: string) => number,
  enumerer: Enumerateur = enumererParVitest
): {
  titres: Map<string, string[]>;
  echecs: string[];
  incoherents: Incoherence[];
  enumeres: number;
} {
  const titres = new Map<string, string[]>();
  const echecs: string[] = [];
  const incoherents: Incoherence[] = [];
  if (cibles.length === 0) return { titres, echecs, incoherents, enumeres: 0 };

  /**
   * Range ce qu'une énumération a rendu, puis CONFRONTE le compte au plancher du disque. Une cible
   * dont l'énumération n'a rien rendu alors que son texte porte des titres ne va PAS dans `titres` :
   * elle va dans `incoherents`, et l'appelant la traitera comme non lue.
   */
  const ranger = (entrees: { name: string; file: string }[], attendus: string[]) => {
    const vus = new Map<string, string[]>();
    for (const c of attendus) vus.set(c, []);
    for (const e of entrees) {
      const rel = posix.relative(process.cwd().replace(/\\/g, '/'), e.file.replace(/\\/g, '/'));
      if (!vus.has(rel)) vus.set(rel, []);
      vus.get(rel)!.push(e.name);
    }
    for (const [chemin, liste] of vus) {
      const plancher = plancherDe(chemin);
      // SOUS le plancher, et non seulement à ZÉRO (motif `mutation` T3 sur la PR 114) : un lanceur
      // qui rend UN titre sur deux n'a pas lu le fichier, il l'a entamé — et la liste partielle se
      // lisait comme complète, donc accusait les titres manquants.
      if (liste.length < plancher) {
        incoherents.push({ chemin, plancher });
        continue;
      }
      titres.set(chemin, [...(titres.get(chemin) ?? []), ...liste]);
    }
  };

  const lot = enumerer(cibles);
  if (lot.ok) {
    ranger(lot.entrees, cibles);
  } else {
    // Un seul fichier qui ne se charge pas fait échouer la collecte ENTIÈRE — souvent un fichier
    // qu'un autre agent est en train d'écrire. On retombe alors sur un appel par fichier, pour
    // n'accuser que celui qui pèche.
    for (const c of cibles) {
      const un = enumerer([c]);
      if (un.ok) ranger(un.entrees, [c]);
      else echecs.push(c);
    }
  }
  const enumeres = [...titres.values()].reduce((a, l) => a + l.length, 0);
  return { titres, echecs, incoherents, enumeres };
}

/**
 * `--resultats <chemin>` : le rapport JSON de la passe de tests (QA-T03), écrit par `pnpm test`
 * (`--reporter=json --outputFile.json=…`). `null` = non demandé : la garde ne juge pas le vert.
 */
const iResultats = process.argv.indexOf('--resultats');
const CHEMIN_RESULTATS: string | null =
  iResultats < 0
    ? null
    : (process.argv[iResultats + 1] ?? '').startsWith('--')
      ? ''
      : (process.argv[iResultats + 1] ?? '');

/**
 * Le rapport JSON de vitest, lu tel que la version épinglée l'écrit (mesuré sur 2.1.9) :
 * `testResults[].name` (chemin ABSOLU du fichier), `testResults[].assertionResults[]` avec
 * `ancestorTitles`, `title`, `status` (`passed`, `failed`, `skipped`, `todo`). Une forme qu'on ne
 * reconnaît pas est `illisibles` — jamais « rien à juger ».
 */
export function lireResultats(texte: string | null, source: string, racine: string): Resultats {
  if (texte === null) return { etat: 'absents', source, detail: 'aucun fichier à ce chemin' };
  const illisibles = (detail: string): Resultats => ({ etat: 'illisibles', source, detail });
  let doc: unknown;
  try {
    doc = JSON.parse(texte);
  } catch (e) {
    return illisibles(`JSON illisible (${(e as Error).message})`);
  }
  const entrees = (doc as { testResults?: unknown } | null)?.testResults;
  if (!Array.isArray(entrees)) return illisibles('aucun tableau `testResults`');
  const base = racine.replace(/\\/g, '/');
  const parFichier: Record<string, ResultatTest[]> = {};
  for (const r of entrees as { name?: unknown; assertionResults?: unknown }[]) {
    if (typeof r?.name !== 'string' || !Array.isArray(r.assertionResults)) {
      return illisibles('une entrée de `testResults` sans `name` ni `assertionResults`');
    }
    const chemin = posix.relative(base, r.name.replace(/\\/g, '/'));
    const rendus = (parFichier[chemin] ??= []);
    for (const a of r.assertionResults as {
      title?: unknown;
      status?: unknown;
      ancestorTitles?: unknown;
    }[]) {
      if (
        typeof a?.title !== 'string' ||
        typeof a.status !== 'string' ||
        !Array.isArray(a.ancestorTitles)
      ) {
        return illisibles(`un test de ${chemin} sans \`title\`, \`status\` ni \`ancestorTitles\``);
      }
      rendus.push({
        nom: [...(a.ancestorTitles as string[]), a.title].join(' > '),
        titre: a.title,
        statut: a.status,
      });
    }
  }
  return { etat: 'lus', source, parFichier };
}

function chargerResultats(): Resultats {
  if (CHEMIN_RESULTATS === null) return { etat: 'non_demandes' };
  if (CHEMIN_RESULTATS === '') {
    return { etat: 'absents', source: '--resultats', detail: 'aucun chemin après --resultats' };
  }
  return lireResultats(
    existsSync(CHEMIN_RESULTATS) ? readFileSync(CHEMIN_RESULTATS, 'utf8') : null,
    CHEMIN_RESULTATS,
    process.cwd()
  );
}

/** Les corps de PR fusionnées. Source FACULTATIVE : son absence est dite, jamais tue. */
function lirePr(): { pr: PullRequest[] | null; indisponible: string | null } {
  if (process.env.GOV_TRACE_SANS_PR === '1' || process.argv.includes('--sans-pr')) {
    return { pr: null, indisponible: 'coupée par GOV_TRACE_SANS_PR / --sans-pr' };
  }
  const r = spawnSync(
    'gh',
    ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,body'],
    {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    }
  );
  if (r.error || r.status !== 0) {
    const raison = (r.stderr ?? '').trim().split('\n')[0] ?? String(r.error ?? `code ${r.status}`);
    return { pr: null, indisponible: `\`gh\` n'a rien rendu (${raison || 'sans message'})` };
  }
  try {
    const brut = JSON.parse(r.stdout ?? '[]') as { number: number; body: string | null }[];
    return {
      pr: brut.map((p) => {
        const corps = p.body ?? '';
        return {
          numero: p.number,
          // Le gabarit se reconnaît à ses marqueurs, pas à son titre : `gov:pr` les pose lui-même.
          gabarit: corps.includes('<!-- dod:debut -->') || corps.includes('## Identité'),
          couvre: [
            ...new Set(
              corps
                .split('\n')
                .filter((x) => /^\s*Couvre\s*:/i.test(x))
                .flatMap((x) => x.match(MOTIF_REQ) ?? [])
            ),
          ],
        };
      }),
      indisponible: null,
    };
  } catch (e) {
    return { pr: null, indisponible: `sortie de \`gh\` illisible (${(e as Error).message})` };
  }
}

/**
 * `avecPr` est FAUX pour `--render` et `--verifier`, et ce n'est pas une optimisation : la vue ne
 * porte pas le maillon PR (voir l'en-tête), donc la produire ou la vérifier ne doit dépendre
 * d'AUCUN appel réseau. Le rendre facultatif par construction vaut mieux que le rendre facultatif
 * par convention.
 */
/**
 * Le nombre de titres que l'énumération a RÉELLEMENT rendus, sur la passe en cours (GOV-082).
 * Il est imprimé tel quel : un compteur qu'on n'imprime pas ne prouve rien, et c'est ce compteur
 * qui distingue « j'ai lu, il n'y avait rien » de « je n'ai rien lu ».
 */
let titresEnumeres = 0;

/**
 * LA LECTURE DU DÉPÔT — celle du mode normal. L'énumérateur est injectable pour que le témoin passe
 * par CE branchement et non par la seule fonction pure (motif `mutation` T3/T5 sur la PR 114).
 */
export function chargerUnivers(
  avecPr: boolean,
  enumerer: Enumerateur = enumererParVitest
): Univers {
  for (const f of [CHEMIN_REGISTRE, CHEMIN_TACHES, CHEMIN_VITEST]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:trace — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  const exigences = (JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: Exigence[] })
    .exigences;
  const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] }).taches;

  const { include, exclude } = motifsVitest();
  const inclus = include.map(globVersRegex);
  const exclus = exclude.map(globVersRegex);
  const candidats = fichiersDeTest();

  // Le plancher de chaque fichier, compté sur le texte qu'on lit ICI — une seule lecture (GOV-082).
  const plancherDe = new Map<string, number>();
  const fichiers: FichierTest[] = candidats.map((chemin) => {
    const texte = readFileSync(chemin, 'utf8');
    plancherDe.set(chemin, plancherDeTitres(texte));
    const execute = inclus.some((m) => m.test(chemin)) && !exclus.some((m) => m.test(chemin));
    return {
      chemin,
      execute,
      titresStatiques: titresEcrits(texte),
      titresResolus: null,
      reqsCitees: reqsCitees(texte),
      titresDeTest: titresDeTest(texte),
      annotations: annotationsReq(texte),
    };
  });

  // On ne résout par vitest que ce dont on a besoin : les fichiers qu'une tâche LIVRÉE promet avec
  // un titre précis. Collecter tout le dépôt coûterait une minute et casserait sur le brouillon
  // d'un autre agent, pour une information dont la garde ne se sert pas.
  const parChemin = new Map(fichiers.map((f) => [f.chemin, f]));
  const besoins = new Set<string>();
  for (const t of taches) {
    // PLUS DE FILTRE DE STATUT ICI NON PLUS, et il fallait les deux : le contrôle des titres a été
    // élargi à toute tâche dont le fichier promis EXISTE (voir plus haut), mais la RÉSOLUTION ne
    // portait toujours que sur les tâches livrées. Résultat mesuré : 26 `titres_non_resolus` — la
    // garde disait honnêtement « je n'ai pas pu lire », ce qui vaut mieux qu'un vert, mais ne
    // vérifiait toujours rien. Un contrôle élargi dont la source ne l'est pas ne contrôle pas.
    //
    // Le coût est borné : on ne résout que les fichiers qu'une promesse NOMME avec un `#`, pas
    // tout le dépôt — 19 fichiers aujourd'hui contre 7, quelques secondes.
    for (const promesses of Object.values(t.tests ?? {})) {
      for (const p of promesses) {
        if (!p.includes('#')) continue;
        const r = resoudreFichier(p.split('#')[0]!, fichiers);
        if ('fichier' in r && r.fichier.execute) besoins.add(r.fichier.chemin);
      }
    }
  }
  // LE PLANCHER VIENT DU DISQUE, fichier par fichier : compté par la lecture ci-dessus, pas une
  // valeur tapée ni une seconde lecture. Sans lui, la garde SUPPOSE que le lanceur a répondu (GOV-082).
  const { titres, echecs, incoherents, enumeres } = titresResolus(
    [...besoins].sort(),
    (chemin) => plancherDe.get(chemin) ?? 0,
    enumerer
  );
  titresEnumeres = enumeres;
  for (const [chemin, liste] of titres) {
    const f = parChemin.get(chemin);
    if (f) f.titresResolus = liste;
  }
  for (const e of echecs) {
    const f = parChemin.get(e);
    if (f) {
      f.titresResolus = null;
      f.motifNonResolus = 'echec';
    }
  }
  for (const i of incoherents) {
    const f = parChemin.get(i.chemin);
    if (f) {
      f.titresResolus = null;
      f.motifNonResolus = 'vide_incoherent';
    }
  }

  const { pr, indisponible } = avecPr ? lirePr() : { pr: null, indisponible: PR_NON_CONSULTEE };
  const plancher = lirePlancher(
    existsSync(CHEMIN_GATES) ? readFileSync(CHEMIN_GATES, 'utf8') : null
  );
  return {
    exigences,
    taches,
    fichiers,
    pr,
    prIndisponible: indisponible,
    plancher,
    resultats: chargerResultats(),
  };
}

// ── l'état des sources, toujours imprimé ─────────────────────────────────────
function direLesSources(u: Univers): void {
  const executes = u.fichiers.filter((f) => f.execute);
  const resolus = u.fichiers.filter((f) => f.titresResolus !== null);
  // GOV-082 — LE COMPTE IMPRIMÉ EST CELUI DES TITRES RÉELLEMENT ÉNUMÉRÉS, jamais la longueur d'une
  // liste déclarée : c'est le seul nombre qui distingue « j'ai lu et il n'y avait rien » de
  // « je n'ai rien lu », et le second passait pour le premier.
  console.log(
    `   sources — registre : lu ✓ (${u.exigences.length} exigences) · ` +
      `backlog : lu ✓ (${u.taches.length} tâches) · ` +
      `disque : lu ✓ (${executes.length} fichiers exécutés, ${resolus.length} aux titres résolus, ` +
      `${titresEnumeres} titres énumérés)`
  );
  // GOV-038. Ce qui n'a PAS été confronté au disque, et pourquoi. Une garde qui saute des lignes en
  // silence apprend au lecteur que son vert couvre tout ; celle-ci compte ce qu'elle n'a pas pu
  // lire et le nomme, comme elle le fait déjà pour la source PR juste en dessous.
  const horsDepot = u.taches.filter(
    (t) =>
      (t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL &&
      LIVREE.has(t.statut) &&
      Object.keys(t.tests ?? {}).length > 0
  );
  if (horsDepot.length > 0) {
    console.log(
      `   ⚠️  ${horsDepot.length} tâche(s) livrée(s) HORS de ce dépôt (${horsDepot.map((t) => t.id).join(', ')}) : ` +
        `leurs tests vivent dans leur dépôt et n'ont PAS été confrontés à ce disque. ` +
        `Leur livraison est attestée par un SHA (\`pnpm gov:attestation --en-ligne\` la résout).`
    );
  }
  if (u.pr === null && u.prIndisponible === PR_NON_CONSULTEE) {
    // « Pas consultée » et « pas lisible » ne se confondent PAS. Le premier est une décision de
    // mode, le second est un trou dans le contrôle : les écrire pareil, c'est apprendre au lecteur
    // à ignorer l'avertissement qui compte.
    console.log(`   source PR : non consultée — ce mode ne juge aucune PR.`);
  } else if (u.pr === null) {
    console.log(
      `   ⚠️  source PR : INDISPONIBLE — ${u.prIndisponible}. Le maillon PR n'a PAS été contrôlé.`
    );
  } else {
    console.log(
      `   sources — PR fusionnées : lues ✓ (${u.pr.length}, dont ${u.pr.filter((p) => p.gabarit).length} au gabarit)`
    );
  }
}

/**
 * LE RÉSUMÉ DU PÉRIMÈTRE (GOV-043). Un vert qui ne dit pas ce qu'il a regardé apprend au lecteur
 * qu'il couvre tout : mesuré le 2026-09-09, ce contrôle ne regardait que 48 tâches sur 209 et son
 * résumé n'en disait rien. Il dit désormais combien il en a confronté à ce disque, combien il n'a
 * PAS regardées et pourquoi, et il les NOMME — chiffre par chiffre, liste par liste.
 */
function direLePerimetre(u: Univers): void {
  const p = perimetre(u);
  const dehors = MOTIFS_HORS_PERIMETRE.flatMap((m) => p.dehors[m]);
  const plancher =
    u.plancher === null
      ? `plancher déclaré : AUCUN (${CHEMIN_GATES} ne le dit pas)`
      : `plancher déclaré : ${u.plancher.valeur} (${u.plancher.source}, mesuré le ` +
        `${u.plancher.mesureLe}), marge ${p.dedans.length - u.plancher.valeur}`;
  console.log(
    `   périmètre : ${p.dedans.length} tâche(s) sur ${u.taches.length} confrontée(s) à ce disque ` +
      `par au moins une promesse de \`tests{}\` — ${plancher}`
  );
  console.log(
    `   complément : ${dehors.length} tâche(s) que ce contrôle n'a PAS regardées — ` +
      MOTIFS_HORS_PERIMETRE.map((m) => `${m} ${p.dehors[m].length}`).join(' · ')
  );
  for (const m of MOTIFS_HORS_PERIMETRE) {
    console.log(`      hors périmètre · ${m} (${p.dehors[m].length}) : ${p.dehors[m].join(', ')}`);
  }
  console.log(`      dans le périmètre (${p.dedans.length}) : ${p.dedans.join(', ')}`);
}

/**
 * LES PAIRES (QA-T03). Le vert dit combien de paires (tâche, exigence) il a confrontées aux deux
 * formes de REQ-QA-014, et combien il a vues VERTES — ou qu'il ne l'a PAS jugé, et pourquoi.
 */
function direLesPaires(u: Univers): void {
  const { paires, vertes } = juger(u);
  const tete = `${paires} paire(s) (tâche, exigence) confrontée(s) aux deux formes de REQ-QA-014`;
  const r = u.resultats;
  if (r.etat === 'lus') {
    console.log(`   ${tete} · ${vertes} verte(s) dans ${r.source}`);
  } else if (r.etat === 'non_demandes') {
    console.log(
      `   ⚠️  ${tete} · statut des tests NON JUGÉ : aucun \`--resultats\`. ` +
        `\`pnpm req:check\` le juge, après \`pnpm test\`.`
    );
  } else {
    console.log(`   ⚠️  ${tete} · statut des tests NON JUGÉ : résultats ${r.etat} (${r.source}).`);
  }
}

// ── l'univers de FIXTURE, pour la preuve ─────────────────────────────────────
/**
 * `--prove` ne part PAS de l'état du dépôt, et c'est délibéré (RM-11) : cet état est fautif — c'est
 * le résultat que GOV-011 devait produire — et une preuve qui commence par « le document est déjà
 * fautif, corrige d'abord » ne prouverait plus jamais rien ici. La fixture est minuscule et close.
 */
export function universFixture(): Univers {
  return {
    exigences: [
      {
        id: 'REQ-AAA-001',
        statut: 'active',
        remplaceePar: null,
        taches: ['T-LIVREE'],
        module: 1,
        etape: 1,
        phase: -1,
      },
      {
        id: 'REQ-AAA-002',
        statut: 'active',
        remplaceePar: null,
        taches: ['T-FUTURE'],
        module: 2,
        etape: 2,
        phase: 0,
      },
      {
        id: 'REQ-AAA-003',
        statut: 'absorbee',
        remplaceePar: 'REQ-AAA-001',
        taches: ['T-LIVREE'],
        module: null,
        etape: null,
        phase: -1,
      },
    ],
    taches: [
      {
        id: 'T-LIVREE',
        statut: 'fusionnee',
        phase: -1,
        reqs: ['REQ-AAA-001', 'REQ-AAA-003'],
        tests: {
          'REQ-AAA-001': ['tests/f/a.spec.ts#REQ-AAA-001 : un titre'],
          'REQ-AAA-003': ['a.spec.ts'],
        },
      },
      {
        id: 'T-FUTURE',
        statut: 'a_faire',
        phase: 0,
        reqs: ['REQ-AAA-002'],
        tests: { 'REQ-AAA-002': ['tests/f/pas-encore.spec.ts#un titre a venir'] },
      },
    ],
    fichiers: [
      {
        chemin: 'tests/f/a.spec.ts',
        execute: true,
        titresStatiques: ['REQ-AAA-001 : un titre'],
        titresResolus: ['REQ-AAA-001 : un titre'],
        reqsCitees: ['REQ-AAA-001', 'REQ-AAA-003'],
        titresDeTest: ['REQ-AAA-001 : un titre'],
        annotations: [
          { req: 'REQ-AAA-001', ligne: 1, texteLigne: '// @req REQ-AAA-001', enTete: true },
          {
            req: 'REQ-AAA-003',
            ligne: 2,
            texteLigne: '// @req REQ-AAA-003 → REQ-AAA-001',
            enTete: true,
          },
        ],
      },
      {
        chemin: 'tests/f/b.spec.ts',
        execute: true,
        titresStatiques: ['un autre'],
        titresResolus: ['un autre'],
        reqsCitees: [],
        titresDeTest: ['un autre'],
        annotations: [],
      },
    ],
    pr: [
      { numero: 1, gabarit: true, couvre: ['REQ-AAA-001'] },
      { numero: 2, gabarit: false, couvre: [] },
    ],
    prIndisponible: null,
    // Zéro, et c'est délibéré : les contre-témoins qui sortent T-LIVREE du périmètre (autre dépôt)
    // ne jugent pas le plancher. Les deux cas qui le jugent le POSENT eux-mêmes à la couverture
    // de la base, puis la font descendre — ou monter.
    plancher: { valeur: 0, mesureLe: '2026-09-18', source: 'fixture' },
    // Les résultats d'une passe COMPLÈTE et verte : chaque fichier exécuté y est, chaque test passe.
    resultats: {
      etat: 'lus',
      source: 'fixture',
      parFichier: {
        'tests/f/a.spec.ts': [
          { nom: 'REQ-AAA-001 : un titre', titre: 'REQ-AAA-001 : un titre', statut: 'passed' },
        ],
        'tests/f/b.spec.ts': [{ nom: 'un autre', titre: 'un autre', statut: 'passed' }],
      },
    },
  };
}

const copie = (u: Univers): Univers => JSON.parse(JSON.stringify(u)) as Univers;

/** Les résultats LUS d'un univers de fixture — la preuve n'en mute jamais d'autres. */
function rendusDe(u: Univers): Record<string, ResultatTest[]> {
  if (u.resultats.etat !== 'lus') throw new Error('fixture : résultats non lus');
  return u.resultats.parFichier;
}

// ── ligne de commande ────────────────────────────────────────────────────────
const iOut = process.argv.indexOf('--out');
const CHEMIN_VUE = iOut >= 0 ? (process.argv[iOut + 1] ?? VUE_PAR_DEFAUT) : VUE_PAR_DEFAUT;

/**
 * VRAI quand ce fichier est LANCÉ, faux quand il est IMPORTÉ (GOV-082).
 *
 * 🔴 SANS CE GARDE-FOU, CE MODULE EST INTESTABLE, et le journal de la PR 52 l'avait déjà mesuré
 * ailleurs : « un module de garde importé par sa propre spécification tue le worker `vitest` au
 * premier `process.exit` — la suite entière sort en `no tests` sur le refus
 * `process.exit unexpectedly` du worker ». C'est ce qui s'est produit au premier jet de
 * `une-liste-vide-n-est-pas-une-reponse.spec.ts` : `chargerUnivers` partait à l'import, la garde
 * rougissait sur l'état du dépôt et emportait la suite AVANT le premier `it`.
 *
 * ⚠️ Et une lecture qu'on ne peut pas importer finit RECOPIÉE (`scripts/lot/titres-ecrits.ts` le
 * dit de sa propre histoire). GOV-082 exige que les DEUX faces de l'énumérateur soient jouées :
 * sans import, la seconde face — celle qui rend le vide avec le code zéro — ne se joue pas, et
 * c'est très exactement la face qui n'avait jamais été jouée.
 */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]gov-trace(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT && process.argv.includes('--prove')) {
  const base = universFixture();
  const fautesBase = [...controler(base), ...verifierVue(base, rendreVue(base), 'fixture')];
  if (fautesBase.length > 0) {
    console.error(`❌ La preuve part d'une fixture DÉJÀ fautive (${fautesBase.length}) :`);
    fautesBase.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  /**
   * `cle` et `attendu` (QA-T03) : un témoin NOMMÉ d'une panne du brief, qui doit rougir sur SA
   * famille ET avec SON motif — « la famille apparaît » ne dit pas quelle forme manque.
   */
  const TEMOINS: { famille: string; defaut: () => Faute[]; cle?: string; attendu?: string }[] = [
    {
      famille: 'tache_sans_req',
      defaut: () => {
        const u = copie(base);
        u.taches[1]!.reqs = [];
        return controler(u);
      },
    },
    {
      famille: 'test_cite_req_inconnue',
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.reqsCitees.push('REQ-ZZZ-999');
        return controler(u);
      },
    },
    {
      famille: 'req_sans_test',
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.reqsCitees = ['REQ-AAA-003'];
        return controler(u);
      },
    },
    {
      famille: 'test_promis_absent',
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/jamais-ecrit.spec.ts#un titre'];
        return controler(u);
      },
    },
    // Second témoin de la même famille : le FICHIER existe, c'est le TITRE qui est périmé. Le
    // premier témoin ne prouve rien de ce cas-là, et c'est pourtant lui qu'on rencontre en vrai —
    // « ses 11 familles » promis à un fichier qui en annonce douze.
    {
      famille: 'test_promis_absent',
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#REQ-AAA-001 : ses 11 familles'];
        return controler(u);
      },
    },
    // Le même fichier, promis par son seul nom de base, existe à deux endroits : la garde refuse
    // de choisir plutôt que de valider une promesse au hasard.
    {
      famille: 'promesse_ambigue',
      defaut: () => {
        const u = copie(base);
        u.fichiers.push({ ...u.fichiers[0]!, chemin: 'tests/g/a.spec.ts' });
        return controler(u);
      },
    },
    {
      famille: 'req_non_citee_par_son_test',
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/b.spec.ts'];
        return controler(u);
      },
    },
    {
      famille: 'titres_non_resolus',
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.titresResolus = null;
        return controler(u);
      },
    },
    {
      famille: 'pr_sans_couvre',
      defaut: () => {
        const u = copie(base);
        u.pr![0]!.couvre = [];
        return controler(u);
      },
    },
    {
      famille: 'pr_couvre_req_inconnue',
      defaut: () => {
        const u = copie(base);
        u.pr![0]!.couvre = ['REQ-ZZZ-998'];
        return controler(u);
      },
    },
    {
      famille: 'vue_divergente',
      defaut: () => verifierVue(base, `${rendreVue(base)}\n| ligne tapée à la main |\n`, 'fixture'),
    },
    {
      famille: 'plancher_non_declare',
      defaut: () => {
        const u = copie(base);
        u.plancher = null;
        return controler(u);
      },
    },
    // RM-02 : le plancher est vu rougir en le FRANCHISSANT PAR LE BAS. Il est posé à la couverture
    // de la base, puis une tâche confrontée perd sa promesse et sort du périmètre.
    {
      famille: 'couverture_sous_plancher',
      defaut: () => {
        const u = copie(base);
        u.plancher = { ...u.plancher!, valeur: perimetre(base).dedans.length };
        delete u.taches[0]!.tests;
        return controler(u);
      },
    },
    // ── QA-T03 : les pannes panne-1 à panne-7 du brief, chacune sur sa famille, avec son motif ──────────
    {
      cle: 'panne-1',
      famille: 'test_promis_non_vert',
      attendu: 'skipped',
      // Le ROUGE d'origine : le seul test titré de l'exigence est un `it.skip`. La garde d'avant
      // n'ouvrait aucun résultat — ce test « couvrait ».
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts'];
        rendusDe(u)['tests/f/a.spec.ts']![0]!.statut = 'skipped';
        return controler(u);
      },
    },
    {
      cle: 'panne-2a',
      famille: 'req_non_citee_par_son_test',
      attendu: 'aucun titre de `it()` ne contient REQ-AAA-001',
      // `@req` seul : aucun titre de test ne porte l'identifiant.
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts'];
        u.fichiers[0]!.titresStatiques = ['un titre'];
        u.fichiers[0]!.titresDeTest = ['un titre'];
        // Sans `#`, la promesse ne fait pas résoudre le fichier par vitest : seul l'écrit se lit.
        u.fichiers[0]!.titresResolus = null;
        return controler(u);
      },
    },
    {
      cle: 'panne-2b',
      famille: 'req_non_citee_par_son_test',
      attendu: 'ni `@req REQ-AAA-001` en tête',
      // Le titre seul : aucune annotation `@req`.
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.annotations = u.fichiers[0]!.annotations.filter(
          (a) => a.req !== 'REQ-AAA-001'
        );
        return controler(u);
      },
    },
    {
      cle: 'panne-3',
      famille: 'req_non_citee_par_son_test',
      attendu: 'ligne 40, pas en tête',
      // `@req` écrite ligne 40, après les `import` : pas en tête.
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.annotations[0] = {
          ...u.fichiers[0]!.annotations[0]!,
          ligne: 40,
          enTete: false,
        };
        return controler(u);
      },
    },
    {
      cle: 'panne-4',
      famille: 'annotation_absorbee_sans_renvoi',
      attendu: 'tests/f/a.spec.ts:2 annote `@req REQ-AAA-003`',
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.annotations[1]!.texteLigne = '// @req REQ-AAA-003';
        return controler(u);
      },
    },
    {
      cle: 'panne-5-absents',
      famille: 'resultats_illisibles',
      attendu: 'motif absents',
      defaut: () => {
        const u = copie(base);
        u.resultats = { etat: 'absents', source: 'fixture', detail: 'aucun fichier à ce chemin' };
        return controler(u);
      },
    },
    {
      cle: 'panne-5-illisibles',
      famille: 'resultats_illisibles',
      attendu: 'motif illisibles',
      defaut: () => {
        const u = copie(base);
        u.resultats = { etat: 'illisibles', source: 'fixture', detail: 'JSON tronqué' };
        return controler(u);
      },
    },
    {
      cle: 'panne-5-perimes',
      famille: 'resultats_illisibles',
      attendu: 'motif perimes — fixture ne porte pas 1 fichier(s)',
      // Une passe PARTIELLE : un fichier exécuté manque aux résultats.
      defaut: () => {
        const u = copie(base);
        delete rendusDe(u)['tests/f/b.spec.ts'];
        return controler(u);
      },
    },
    {
      cle: 'panne-6',
      famille: 'test_promis_non_vert',
      attendu: 'la promesse vise CE test',
      // Le test PROMIS par son titre échoue ; un AUTRE test du fichier, titré de l'exigence, passe.
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.titresDeTest.push('REQ-AAA-001 : un autre, vert');
        rendusDe(u)['tests/f/a.spec.ts'] = [
          { nom: 'REQ-AAA-001 : un titre', titre: 'REQ-AAA-001 : un titre', statut: 'failed' },
          {
            nom: 'REQ-AAA-001 : un autre, vert',
            titre: 'REQ-AAA-001 : un autre, vert',
            statut: 'passed',
          },
        ];
        return controler(u);
      },
    },
    {
      cle: 'panne-7',
      famille: 'req_non_citee_par_son_test',
      attendu: 'un `describe` le porte',
      // L'identifiant dans le `describe` seulement.
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts'];
        u.fichiers[0]!.titresStatiques = ['REQ-AAA-001 — le describe', 'un titre'];
        u.fichiers[0]!.titresDeTest = ['un titre'];
        u.fichiers[0]!.titresResolus = null;
        return controler(u);
      },
    },
    {
      cle: 'panne-milieu',
      famille: 'test_promis_non_vert',
      attendu: 'aucun test de tests/f/c.spec.ts',
      // Trois promesses, la paire en échec au MILIEU : ni la première ni la dernière ne décident.
      defaut: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = [
          'tests/f/a.spec.ts',
          'tests/f/c.spec.ts',
          'tests/f/d.spec.ts',
        ];
        for (const [chemin, statut] of [
          ['tests/f/c.spec.ts', 'failed'],
          ['tests/f/d.spec.ts', 'passed'],
        ] as const) {
          u.fichiers.push({ ...copie(base).fichiers[0]!, chemin });
          rendusDe(u)[chemin] = [
            { nom: 'REQ-AAA-001 : un titre', titre: 'REQ-AAA-001 : un titre', statut },
          ];
        }
        return controler(u);
      },
    },
    {
      cle: 'panne-7-resolu',
      famille: 'req_non_citee_par_son_test',
      attendu: 'aucun titre de `it()` ne contient REQ-AAA-001',
      // Le nom RÉSOLU porte l'identifiant — mais dans son segment `describe`, pas dans le dernier.
      defaut: () => {
        const u = copie(base);
        u.fichiers[0]!.titresStatiques = ['REQ-AAA-001 — le describe', 'un titre'];
        u.fichiers[0]!.titresDeTest = ['un titre'];
        u.fichiers[0]!.titresResolus = ['REQ-AAA-001 — le describe > un titre'];
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#un titre'];
        rendusDe(u)['tests/f/a.spec.ts'] = [
          { nom: 'REQ-AAA-001 — le describe > un titre', titre: 'un titre', statut: 'passed' },
        ];
        return controler(u);
      },
    },
  ];

  /**
   * Ce que la garde doit LAISSER PASSER. Un témoin prouve qu'elle sait rougir ; il ne prouve jamais
   * qu'elle ne rougit pas sur du légitime — et c'est là que cette garde-ci pourrait devenir
   * inutilisable, en réclamant un test à des exigences qu'aucune tâche n'a encore livrées.
   */
  const CONTRE_TEMOINS: { nom: string; muter: () => Univers; cle?: string }[] = [
    // ── QA-T03 ──────────────────────────────────────────────────────────────────────────────
    {
      cle: 'renvoi-porte',
      nom: 'une annotation d’exigence absorbée qui porte son renvoi vers la survivante',
      muter: () => {
        const u = copie(base);
        u.fichiers[0]!.annotations[1]!.texteLigne = ' * @req REQ-AAA-003 → REQ-AAA-001 (absorbée)';
        return u;
      },
    },
    {
      cle: 'sans-resultats',
      nom: 'la garde sans `--resultats` : le vert n’est pas jugé, et c’est dit au résumé',
      muter: () => {
        const u = copie(base);
        u.resultats = { etat: 'non_demandes' };
        return u;
      },
    },
    {
      cle: 'saute-et-vert',
      nom: 'un test titré SAUTÉ à côté d’un test titré VERT : la paire sans `#` est verte',
      muter: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts'];
        rendusDe(u)['tests/f/a.spec.ts']!.unshift({
          nom: 'REQ-AAA-001 : sauté',
          titre: 'REQ-AAA-001 : sauté',
          statut: 'skipped',
        });
        return u;
      },
    },
    {
      cle: 'gabarit-resolu',
      nom: 'un titre de `it()` en GABARIT (`describe.each`) : l’identifiant se lit dans le nom résolu',
      muter: () => {
        const u = copie(base);
        u.fichiers[0]!.titresStatiques = ['$nom', '${exigence}sait rougir'];
        u.fichiers[0]!.titresDeTest = ['${exigence}sait rougir'];
        u.fichiers[0]!.titresResolus = ['gov:x > REQ-AAA-001 — sait rougir'];
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#gov:x > sait rougir'];
        rendusDe(u)['tests/f/a.spec.ts'] = [
          {
            nom: 'gov:x > REQ-AAA-001 — sait rougir',
            titre: 'REQ-AAA-001 — sait rougir',
            statut: 'passed',
          },
        ];
        return u;
      },
    },
    // La moitié de RM-02 qu'on oublie : un plancher qui rougirait aussi quand la couverture MONTE
    // serait un compteur d'égalité, pas un plancher. Une tâche sans verdict reçoit une promesse
    // vers un fichier qui cite l'exigence (clé hors de ses `reqs` : c'est une fixture, et
    // `gov:trace` ne juge pas cette réciprocité).
    {
      nom: 'la couverture MONTE au-dessus du plancher déclaré',
      muter: () => {
        const u = copie(base);
        u.plancher = { ...u.plancher!, valeur: perimetre(base).dedans.length };
        u.taches[1]!.tests = { 'REQ-AAA-001': ['tests/f/a.spec.ts'] };
        return u;
      },
    },
    {
      nom: 'une tâche `a_faire` qui promet un test pas encore écrit',
      muter: () => {
        const u = copie(base);
        u.taches[1]!.tests = { 'REQ-AAA-002': ['tests/f/jamais.spec.ts#a venir'] };
        return u;
      },
    },
    // GOV-038. Une tâche LIVRÉE dont le dépôt n'est pas celui-ci : ses tests sont là-bas, sur un
    // disque que cette garde ne voit pas. Sans ce contre-témoin, `INT-T01b` — livrée pour de vrai
    // le 2026-09-05 dans `axionia` — ferait rougir `test_promis_absent` au moment même où on
    // déclare sa livraison, alors que le schéma EXIGE `tests` dès `en_cours` : les seules issues
    // auraient été de mentir sur le chemin, ou de désarmer la garde.
    {
      nom: 'une tâche LIVRÉE dans un autre dépôt : ses tests ne sont pas sur ce disque',
      muter: () => {
        const u = copie(base);
        u.taches[0]!.repo = 'axionia';
        u.taches[0]!.tests!['REQ-AAA-001'] = ['axionia/tests/partners/contrat.spec.ts#payloads'];
        return u;
      },
    },
    // GOV-038, second effet du même fait. « Réputée testée » veut dire « réputée testée ICI » :
    // une exigence dont la SEULE tâche livrée vit ailleurs n'a aucun test à montrer sur ce disque,
    // et le lui réclamer rendrait `req_sans_test` rouge sur onze exigences le jour où `INT-T01b`
    // passe `fusionnee` — pour un travail qui, lui, est bien fait et bien testé, dans son dépôt.
    {
      nom: 'une exigence dont la seule tâche livrée vit dans un autre dépôt',
      muter: () => {
        const u = copie(base);
        u.taches[0]!.repo = 'axionia';
        u.fichiers[0]!.reqsCitees = ['REQ-AAA-003'];
        return u;
      },
    },
    {
      nom: 'une exigence active dont aucune tâche livrée ne la porte',
      muter: () => {
        const u = copie(base);
        u.exigences[1]!.taches = ['T-FUTURE'];
        return u;
      },
    },
    {
      nom: 'une exigence ABSORBÉE que plus aucun test ne cite',
      muter: () => {
        const u = copie(base);
        u.fichiers[0]!.reqsCitees = ['REQ-AAA-001'];
        return u;
      },
    },
    {
      nom: 'une PR hors gabarit sans ligne « Couvre: »',
      muter: () => {
        const u = copie(base);
        u.pr![1]!.couvre = [];
        return u;
      },
    },
    {
      nom: 'un test qui cite une exigence qu’aucune tâche ne lui a promise',
      muter: () => {
        const u = copie(base);
        u.fichiers[1]!.reqsCitees = ['REQ-AAA-002'];
        return u;
      },
    },
    {
      nom: 'la source PR indisponible — les familles PR se taisent, la garde le dit ailleurs',
      muter: () => {
        const u = copie(base);
        u.pr = null;
        u.prIndisponible = 'banc d’essai';
        return u;
      },
    },
    {
      nom: 'un titre promis avec accents et apostrophes contre un titre sans',
      muter: () => {
        const u = copie(base);
        u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#REQ-AAA-001 : un titre'];
        u.fichiers[0]!.titresResolus = ['REQ-AAA-001 : un titré'];
        rendusDe(u)['tests/f/a.spec.ts']![0]!.nom = 'REQ-AAA-001 : un titré';
        return u;
      },
    },
    // Le `describe` désigné par son PRÉFIXE : c'est la forme qu'écrit `docs/tasks.json` pour
    // GOV-003, et le `it()` visé existe bel et bien. Une comparaison de la chaîne entière
    // rougissait ici, sur un couple (fichier, test) parfaitement identifiable.
    {
      nom: 'un `describe` nommé par son préfixe, suivi du `it()` exact',
      muter: () => {
        const u = copie(base);
        u.fichiers[0]!.titresResolus = ["'gov:x' — le detail > REQ-AAA-001 : un titre"];
        u.taches[0]!.tests!['REQ-AAA-001'] = ["tests/f/a.spec.ts#'gov:x' > REQ-AAA-001 : un titre"];
        rendusDe(u)['tests/f/a.spec.ts']![0]!.nom = "'gov:x' — le detail > REQ-AAA-001 : un titre";
        return u;
      },
    },
  ];

  const nommes: string[] = [];
  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.muter());
    if (f.length > 0) {
      console.error(
        `❌ Le contre-témoin « ${c.nom} » a fait rougir la garde alors qu'il est légitime :`
      );
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
    if (c.cle) nommes.push(`   ◦ contre-témoin ${c.cle} — ${c.nom}`);
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = t.defaut();
    if (
      !f.some(
        (x) => x.famille === t.famille && (t.attendu === undefined || x.message.includes(t.attendu))
      )
    ) {
      console.error(
        `❌ Le témoin ${t.cle ?? ''} de « ${t.famille} » n'a PAS fait rougir sa famille` +
          (t.attendu === undefined ? '' : ` avec le motif « ${t.attendu} »`) +
          ` (${f.length} faute(s) : ${f.map((x) => x.famille).join(', ') || 'aucune'}). ` +
          `Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
    if (t.cle) nommes.push(`   ◦ témoin ${t.cle} [${t.famille}] — ${t.attendu ?? ''}`);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(nommes.join('\n'));
  process.exit(0);
}

// ── le corps EXÉCUTABLE, sous le garde-fou d'import (GOV-082) ────────────────
if (LANCE_EN_SCRIPT) {
  const univers = chargerUnivers(
    !process.argv.includes('--render') && !process.argv.includes('--verifier')
  );

  if (process.argv.includes('--sources')) {
    console.log('gov:trace — état des quatre sources :');
    direLesSources(univers);
    direLePerimetre(univers);
    process.exit(0);
  }

  if (process.argv.includes('--render')) {
    // ⚠️ ON CONTRÔLE AVANT D'ÉCRIRE, comme `gov-requirements.ts` le fait déjà.
    //
    // Sans ce refus, cette vue PROPAGE les fautes qu'elle est censée dénoncer : une attribution
    // fausse fait rougir la garde en `vue_divergente`, et le geste que ce rouge PRESCRIT —
    // `pnpm gov:trace --render` — réécrit la matrice avec la fausse attribution dedans, après quoi
    // tout est vert. Mesuré par la lentille `mutation` le 2026-09-05 : un titre légitime
    // relabellisé, puis `--render`, et la matrice inscrit la fausse attribution comme « couverte »
    // sans qu'aucune garde ne rougisse.
    //
    // L'asymétrie entre les deux générateurs frères était le vrai défaut, et elle se voyait à
    // vingt lignes de distance dans deux fichiers voisins.
    const fautesAvantRendu = controler(univers);
    if (fautesAvantRendu.length > 0) {
      console.error(
        `❌ Refus de rendre une matrice dont les sources sont fautives (${fautesAvantRendu.length}). ` +
          'Lance `pnpm gov:trace` : corrige la SOURCE, ne regénère pas la VUE par-dessus.'
      );
      for (const f of fautesAvantRendu.slice(0, 5)) console.error(`   [${f.famille}] ${f.message}`);
      process.exit(1);
    }
    writeFileSync(CHEMIN_VUE, rendreVue(univers));
    // ⚠️ CETTE LIGNE RECOPIAIT LA RÈGLE au lieu de l'appeler — `e.statut === 'active' && e.taches.some(…)`
    // écrit une seconde fois à côté de `reputeeTestee()`. Mesuré le 2026-09-05 en éprouvant la
    // livraison d'`INT-T01b` : la console annonçait « 41 réputées testées » pendant que la VUE
    // qu'elle venait d'écrire en portait 31, dans la même sortie, à deux lignes d'intervalle. Les
    // deux copies avaient divergé au premier raffinement de la règle (RM-01). Elle est APPELÉE.
    const parTacheDuRendu = new Map(univers.taches.map((t) => [t.id, t]));
    const testees = univers.exigences.filter((e) => reputeeTestee(e, parTacheDuRendu));
    console.log(
      `✅ gov:trace — ${CHEMIN_VUE} rendu depuis ${CHEMIN_REGISTRE}, ${CHEMIN_TACHES} et le disque.`
    );
    console.log(
      `   ${univers.exigences.length} exigences, dont ${testees.length} réputées testées.`
    );
    direLesSources(univers);
    process.exit(0);
  }

  if (process.argv.includes('--verifier')) {
    const surDisque = existsSync(CHEMIN_VUE) ? readFileSync(CHEMIN_VUE, 'utf8') : null;
    const fautes = verifierVue(univers, surDisque, CHEMIN_VUE);
    if (fautes.length > 0) {
      console.error(`❌ gov:trace — ${fautes[0]!.message}`);
      process.exit(1);
    }
    console.log(`✅ gov:trace — ${CHEMIN_VUE} est égal à ce que ses sources produisent.`);
    process.exit(0);
  }

  // ── mode normal ──────────────────────────────────────────────────────────────
  const surDisque = existsSync(CHEMIN_VUE) ? readFileSync(CHEMIN_VUE, 'utf8') : null;
  const fautes = [...controler(univers), ...verifierVue(univers, surDisque, CHEMIN_VUE)];

  if (fautes.length === 0) {
    const testees = univers.exigences.filter((e) =>
      reputeeTestee(e, new Map(univers.taches.map((t) => [t.id, t])))
    );
    console.log(
      `✅ gov:trace — la matrice est cohérente : ${testees.length} exigences réputées testées, toutes citées par un test exécuté.`
    );
    direLesSources(univers);
    direLePerimetre(univers);
    direLesPaires(univers);
    process.exit(0);
  }

  const parFamille = new Map<string, Faute[]>();
  for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
  console.error(`❌ gov:trace — ${fautes.length} rupture(s) de traçabilité :\n`);
  for (const famille of FAMILLES) {
    const liste = parFamille.get(famille);
    if (!liste) continue;
    console.error(`   ── ${famille} (${liste.length})`);
    liste.slice(0, 15).forEach((f) => console.error(`      ${f.message}`));
    if (liste.length > 15) console.error(`      … et ${liste.length - 15} autre(s).`);
  }
  console.error('');
  direLesSources(univers);
  direLePerimetre(univers);
  direLesPaires(univers);
  process.exit(1);
}
