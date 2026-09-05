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
 * texte fait foi : « Chaque exigence REQ-*-nnn non différée est référencée par ≥ 1 test vert via
 * l'annotation @req ; chaque @req pointe une REQ existante ; la garde rougit dans les deux sens
 * d'orphelinat. » REQ-GOV-005 ajoutait deux choses que REQ-QA-014 ne dit pas et que cette garde
 * tient quand même, parce qu'elles sont vérifiables ici : l'identifiant REQ dans le TITRE du
 * `it()` (une deuxième forme de citation, à côté de `@req`), et le maillon PR (`Couvre: REQ-…`).
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
 * les deux exigences écrivent elles-mêmes : le test promis pour REQ-X doit CITER REQ-X, par
 * `@req` ou par son titre. C'est exactement ce défaut-là qui avait été trouvé à la main.
 *
 * POURQUOI LA VUE NE PORTE PAS LA COLONNE « PR ». `docs/TRACABILITE.md` est comparée à sa source
 * par `--verifier`. Si son contenu dépendait d'un appel réseau, `--verifier` mesurerait la
 * disponibilité de `gh`, pas la dérivation de la vue : elle serait rouge chez qui n'a pas de
 * jeton, et verte ailleurs, pour la même arborescence. Le maillon PR est donc contrôlé et
 * IMPRIMÉ, jamais écrit dans la vue.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';
import { DEPOT_LOCAL } from '../lot/attestation';


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
const CHEMIN_TACHES = iTaches >= 0 ? (process.argv[iTaches + 1] ?? 'docs/tasks.json') : 'docs/tasks.json';
const CHEMIN_VITEST = 'vitest.config.ts';
const VUE_PAR_DEFAUT = 'docs/TRACABILITE.md';

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
    console.error("❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :");
    ecarts.forEach((e) => console.error("   " + e));
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
  id: string; statut: string; phase: number; reqs: string[]; tests?: Record<string, string[]>;
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
  /** Les exigences citées : annotations `@req` et identifiants dans les titres. */
  reqsCitees: string[];
};

export type PullRequest = { numero: number; gabarit: boolean; couvre: string[] };

export type Univers = {
  exigences: Exigence[];
  taches: Tache[];
  fichiers: FichierTest[];
  /** `null` = source PR indisponible. Jamais `[]` : la liste vide voudrait dire « aucune PR ». */
  pr: PullRequest[] | null;
  prIndisponible: string | null;
};

export type Faute = { famille: string; message: string };

export const FAMILLES = [
  'tache_sans_req',
  'test_cite_req_inconnue',
  'req_sans_test',
  'test_promis_absent',
  'promesse_ambigue',
  'req_non_citee_par_son_test',
  'titres_non_resolus',
  'pr_sans_couvre',
  'pr_couvre_req_inconnue',
  'vue_divergente',
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
  for (const segment of promesse.split('>').map((s) => normaliserTitre(s)).filter((s) => s.length > 0)) {
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
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string) => fautes.push({ famille, message });

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
          ajouter(
            'test_promis_absent',
            `${t.id} promet « ${promesse} » pour ${req} : ${f.chemin} existe mais ${CHEMIN_VITEST} ne ` +
              `le fait pas tourner. Une suite qui ne tourne pas ne garde rien.`
          );
          continue;
        }

        if (titre.length > 0) {
          if (f.titresResolus === null) {
            ajouter(
              'titres_non_resolus',
              `${t.id} promet un titre précis dans ${f.chemin} (« ${titre} ») et les titres de ce ` +
                `fichier n'ont pas pu être résolus : la promesse n'est PAS vérifiée. ` +
                `Le contrôle ne se déclare pas vert sur ce qu'il n'a pas pu lire.`
            );
          } else if (!f.titresResolus.some((x) => nomPorteLaPromesse(x, titre))) {
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
        if (!e || e.statut !== 'active' || sansTest.has(req)) continue;
        const citee =
          f.reqsCitees.includes(req) || (titre.length > 0 && titre.includes(req));
        if (!citee) {
          ajouter(
            'req_non_citee_par_son_test',
            `${t.id} déclare couvrir ${req} par « ${promesse} », mais ${f.chemin} ne cite jamais ` +
              `${req} — ni par \`@req\`, ni dans un titre. La traçabilité serait au vert sur un test ` +
              `qui ne parle pas de cette exigence (défaut constaté à la main sur ce dépôt, PR 27).`
          );
        }
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

  return fautes;
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

  const actives = u.exigences.filter((e) => e.statut === 'active').sort((a, b) => a.id.localeCompare(b.id));
  const absorbees = u.exigences.filter((e) => e.statut === 'absorbee').sort((a, b) => a.id.localeCompare(b.id));
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
  l.push('> ⚠️ **Ce fichier est une VUE. Ses sources sont `docs/requirements.json`, `docs/tasks.json`');
  l.push('> et les fichiers de test présents sur le disque.**');
  l.push('> Regénérée par `pnpm gov:trace --render`, jamais éditée à la main : une correction tapée');
  l.push('> ici disparaît au rendu suivant, et une matrice tenue à la main est fausse le jour où');
  l.push('> quelqu’un oublie de l’ouvrir (RM-01, REQ-GOV-005 → REQ-QA-014).');
  l.push('> `pnpm gov:trace --verifier` rougit si ce fichier diffère de ce que les sources produisent.');
  l.push('>');
  l.push('> **Le maillon PR n’est pas écrit ici.** Il est contrôlé par `pnpm gov:trace`, qui lit les');
  l.push('> corps de PR fusionnées (`Couvre: REQ-…`). Une vue dont le contenu dépendrait d’un appel');
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
  l.push('Les 21 modules et les 12 étapes de l’audit de bout en bout, tels que le registre les porte.');
  l.push('');
  l.push('| Module | Exigences | Dont réputées testées |');
  l.push('| ---: | ---: | ---: |');
  for (let m = 1; m <= NB_MODULES; m++) {
    const liste = actives.filter((e) => e.module === m);
    l.push(`| ${m} | ${liste.length} | ${liste.filter((e) => reputeeTestee(e, parTache)).length} |`);
  }
  l.push('');
  l.push('| Étape | Exigences | Dont réputées testées |');
  l.push('| ---: | ---: | ---: |');
  for (let s = 1; s <= NB_ETAPES; s++) {
    const liste = actives.filter((e) => e.etape === s);
    l.push(`| ${s} | ${liste.length} | ${liste.filter((e) => reputeeTestee(e, parTache)).length} |`);
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
    return [{ famille: 'vue_divergente', message: `${chemin} est absent. Lance \`pnpm gov:trace --render\`.` }];
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
      sortie += `(?:${motif.slice(i + 1, fin).split(',').join('|')})`;
      i = fin;
    } else if ('.+?^$()[]\\|'.includes(c)) {
      sortie += `\\${c}`;
    } else sortie += c;
  }
  return new RegExp(`^${sortie}$`);
}

function listerFichiers(racine: string): string[] {
  if (!existsSync(racine)) return [];
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...listerFichiers(chemin));
    else sortie.push(chemin.replace(/\\/g, '/'));
  }
  return sortie;
}

/**
 * Les titres ÉCRITS. Ils servent à repérer les identifiants d'exigence cités dans un `it()` ou un
 * `describe()` — un identifiant est un littéral, il est donc lisible sans exécuter le fichier.
 * Ils ne servent PAS à valider une promesse de titre : `describe.each` produit des noms que seul
 * vitest résout.
 */
export function titresEcrits(texte: string): string[] {
  const motif =
    /\b(?:it|test|describe)(?:\.\w+)*(?:\s*\(\s*[^)]*\)\s*)?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  return [...texte.matchAll(motif)].map((m) => m[2]!);
}

/** Les exigences qu'un fichier CITE : annotations `@req` et identifiants dans les titres. */
export function reqsCitees(texte: string): string[] {
  const parAnnotation = [...texte.matchAll(/@req\s+(REQ-[A-Z]{2,4}-\d{3})/g)].map((m) => m[1]!);
  const parTitre = titresEcrits(texte).flatMap((t) => t.match(MOTIF_REQ) ?? []);
  return [...new Set([...parAnnotation, ...parTitre])];
}

/**
 * Les noms de test RÉSOLUS, par `vitest list`. C'est la seule source qui connaisse les gabarits :
 * `describe.each(GARDES)` avec un titre en `ses ${familles} familles` ne s'évalue pas à la lecture,
 * et c'est exactement là que se cache une promesse périmée (« ses 11 familles » pour un fichier
 * qui en annonce 12).
 */
function titresResolus(cibles: string[]): { titres: Map<string, string[]>; echecs: string[] } {
  const titres = new Map<string, string[]>();
  const echecs: string[] = [];
  if (cibles.length === 0) return { titres, echecs };

  const lancer = (fichiers: string[]): { ok: boolean; entrees: { name: string; file: string }[] } => {
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
      return { ok: true, entrees: JSON.parse(brut.slice(debut)) as { name: string; file: string }[] };
    } catch {
      return { ok: false, entrees: [] };
    }
  };

  const ranger = (entrees: { name: string; file: string }[], attendus: string[]) => {
    for (const c of attendus) titres.set(c, titres.get(c) ?? []);
    for (const e of entrees) {
      const rel = posix.relative(process.cwd().replace(/\\/g, '/'), e.file.replace(/\\/g, '/'));
      if (!titres.has(rel)) titres.set(rel, []);
      titres.get(rel)!.push(e.name);
    }
  };

  const lot = lancer(cibles);
  if (lot.ok) {
    ranger(lot.entrees, cibles);
    return { titres, echecs };
  }
  // Un seul fichier qui ne se charge pas fait échouer la collecte ENTIÈRE — souvent un fichier
  // qu'un autre agent est en train d'écrire. On retombe alors sur un appel par fichier, pour
  // n'accuser que celui qui pèche.
  for (const c of cibles) {
    const un = lancer([c]);
    if (un.ok) ranger(un.entrees, [c]);
    else echecs.push(c);
  }
  return { titres, echecs };
}

/** Les corps de PR fusionnées. Source FACULTATIVE : son absence est dite, jamais tue. */
function lirePr(): { pr: PullRequest[] | null; indisponible: string | null } {
  if (process.env.GOV_TRACE_SANS_PR === '1' || process.argv.includes('--sans-pr')) {
    return { pr: null, indisponible: 'coupée par GOV_TRACE_SANS_PR / --sans-pr' };
  }
  const r = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,body'], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
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
function chargerUnivers(avecPr: boolean): Univers {
  for (const f of [CHEMIN_REGISTRE, CHEMIN_TACHES, CHEMIN_VITEST]) {
    if (!existsSync(f)) {
      console.error(`❌ gov:trace — ${f} est introuvable.`);
      process.exit(1);
    }
  }
  const exigences = (JSON.parse(readFileSync(CHEMIN_REGISTRE, 'utf8')) as { exigences: Exigence[] }).exigences;
  const taches = (JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] }).taches;

  const { include, exclude } = motifsVitest();
  const inclus = include.map(globVersRegex);
  const exclus = exclude.map(globVersRegex);
  const candidats = [...listerFichiers('tests'), ...listerFichiers('src')].filter((c) =>
    /\.(test|spec)\.tsx?$/.test(c)
  );

  const fichiers: FichierTest[] = candidats.map((chemin) => {
    const texte = readFileSync(chemin, 'utf8');
    const execute = inclus.some((m) => m.test(chemin)) && !exclus.some((m) => m.test(chemin));
    return { chemin, execute, titresStatiques: titresEcrits(texte), titresResolus: null, reqsCitees: reqsCitees(texte) };
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
  const { titres, echecs } = titresResolus([...besoins].sort());
  for (const [chemin, liste] of titres) {
    const f = parChemin.get(chemin);
    if (f) f.titresResolus = liste;
  }
  for (const e of echecs) {
    const f = parChemin.get(e);
    if (f) f.titresResolus = null;
  }

  const { pr, indisponible } = avecPr
    ? lirePr()
    : { pr: null, indisponible: PR_NON_CONSULTEE };
  return { exigences, taches, fichiers, pr, prIndisponible: indisponible };
}

// ── l'état des sources, toujours imprimé ─────────────────────────────────────
function direLesSources(u: Univers): void {
  const executes = u.fichiers.filter((f) => f.execute);
  const resolus = u.fichiers.filter((f) => f.titresResolus !== null);
  console.log(
    `   sources — registre : lu ✓ (${u.exigences.length} exigences) · ` +
      `backlog : lu ✓ (${u.taches.length} tâches) · ` +
      `disque : lu ✓ (${executes.length} fichiers exécutés, ${resolus.length} aux titres résolus)`
  );
  // GOV-038. Ce qui n'a PAS été confronté au disque, et pourquoi. Une garde qui saute des lignes en
  // silence apprend au lecteur que son vert couvre tout ; celle-ci compte ce qu'elle n'a pas pu
  // lire et le nomme, comme elle le fait déjà pour la source PR juste en dessous.
  const horsDepot = u.taches.filter(
    (t) => (t.repo ?? DEPOT_LOCAL) !== DEPOT_LOCAL && LIVREE.has(t.statut) && Object.keys(t.tests ?? {}).length > 0
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
    console.log(`   ⚠️  source PR : INDISPONIBLE — ${u.prIndisponible}. Le maillon PR n'a PAS été contrôlé.`);
  } else {
    console.log(`   sources — PR fusionnées : lues ✓ (${u.pr.length}, dont ${u.pr.filter((p) => p.gabarit).length} au gabarit)`);
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
      { id: 'REQ-AAA-001', statut: 'active', remplaceePar: null, taches: ['T-LIVREE'], module: 1, etape: 1, phase: -1 },
      { id: 'REQ-AAA-002', statut: 'active', remplaceePar: null, taches: ['T-FUTURE'], module: 2, etape: 2, phase: 0 },
      { id: 'REQ-AAA-003', statut: 'absorbee', remplaceePar: 'REQ-AAA-001', taches: ['T-LIVREE'], module: null, etape: null, phase: -1 },
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
      },
      { chemin: 'tests/f/b.spec.ts', execute: true, titresStatiques: ['un autre'], titresResolus: ['un autre'], reqsCitees: [] },
    ],
    pr: [
      { numero: 1, gabarit: true, couvre: ['REQ-AAA-001'] },
      { numero: 2, gabarit: false, couvre: [] },
    ],
    prIndisponible: null,
  };
}

const copie = (u: Univers): Univers => JSON.parse(JSON.stringify(u)) as Univers;

// ── ligne de commande ────────────────────────────────────────────────────────
const iOut = process.argv.indexOf('--out');
const CHEMIN_VUE = iOut >= 0 ? (process.argv[iOut + 1] ?? VUE_PAR_DEFAUT) : VUE_PAR_DEFAUT;

if (process.argv.includes('--prove')) {
  const base = universFixture();
  const fautesBase = [...controler(base), ...verifierVue(base, rendreVue(base), 'fixture')];
  if (fautesBase.length > 0) {
    console.error(`❌ La preuve part d'une fixture DÉJÀ fautive (${fautesBase.length}) :`);
    fautesBase.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  const TEMOINS: { famille: string; defaut: () => Faute[] }[] = [
    { famille: 'tache_sans_req', defaut: () => { const u = copie(base); u.taches[1]!.reqs = []; return controler(u); } },
    { famille: 'test_cite_req_inconnue', defaut: () => { const u = copie(base); u.fichiers[0]!.reqsCitees.push('REQ-ZZZ-999'); return controler(u); } },
    { famille: 'req_sans_test', defaut: () => { const u = copie(base); u.fichiers[0]!.reqsCitees = ['REQ-AAA-003']; return controler(u); } },
    { famille: 'test_promis_absent', defaut: () => { const u = copie(base); u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/jamais-ecrit.spec.ts#un titre']; return controler(u); } },
    // Second témoin de la même famille : le FICHIER existe, c'est le TITRE qui est périmé. Le
    // premier témoin ne prouve rien de ce cas-là, et c'est pourtant lui qu'on rencontre en vrai —
    // « ses 11 familles » promis à un fichier qui en annonce douze.
    { famille: 'test_promis_absent', defaut: () => { const u = copie(base); u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#REQ-AAA-001 : ses 11 familles']; return controler(u); } },
    // Le même fichier, promis par son seul nom de base, existe à deux endroits : la garde refuse
    // de choisir plutôt que de valider une promesse au hasard.
    { famille: 'promesse_ambigue', defaut: () => { const u = copie(base); u.fichiers.push({ ...u.fichiers[0]!, chemin: 'tests/g/a.spec.ts' }); return controler(u); } },
    { famille: 'req_non_citee_par_son_test', defaut: () => { const u = copie(base); u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/b.spec.ts']; return controler(u); } },
    { famille: 'titres_non_resolus', defaut: () => { const u = copie(base); u.fichiers[0]!.titresResolus = null; return controler(u); } },
    { famille: 'pr_sans_couvre', defaut: () => { const u = copie(base); u.pr![0]!.couvre = []; return controler(u); } },
    { famille: 'pr_couvre_req_inconnue', defaut: () => { const u = copie(base); u.pr![0]!.couvre = ['REQ-ZZZ-998']; return controler(u); } },
    { famille: 'vue_divergente', defaut: () => verifierVue(base, `${rendreVue(base)}\n| ligne tapée à la main |\n`, 'fixture') },
  ];

  /**
   * Ce que la garde doit LAISSER PASSER. Un témoin prouve qu'elle sait rougir ; il ne prouve jamais
   * qu'elle ne rougit pas sur du légitime — et c'est là que cette garde-ci pourrait devenir
   * inutilisable, en réclamant un test à des exigences qu'aucune tâche n'a encore livrées.
   */
  const CONTRE_TEMOINS: { nom: string; muter: () => Univers }[] = [
    { nom: 'une tâche `a_faire` qui promet un test pas encore écrit', muter: () => { const u = copie(base); u.taches[1]!.tests = { 'REQ-AAA-002': ['tests/f/jamais.spec.ts#a venir'] }; return u; } },
    // GOV-038. Une tâche LIVRÉE dont le dépôt n'est pas celui-ci : ses tests sont là-bas, sur un
    // disque que cette garde ne voit pas. Sans ce contre-témoin, `INT-T01b` — livrée pour de vrai
    // le 2026-09-05 dans `axionia` — ferait rougir `test_promis_absent` au moment même où on
    // déclare sa livraison, alors que le schéma EXIGE `tests` dès `en_cours` : les seules issues
    // auraient été de mentir sur le chemin, ou de désarmer la garde.
    { nom: 'une tâche LIVRÉE dans un autre dépôt : ses tests ne sont pas sur ce disque', muter: () => { const u = copie(base); u.taches[0]!.repo = 'axionia'; u.taches[0]!.tests!['REQ-AAA-001'] = ['axionia/tests/partners/contrat.spec.ts#payloads']; return u; } },
    // GOV-038, second effet du même fait. « Réputée testée » veut dire « réputée testée ICI » :
    // une exigence dont la SEULE tâche livrée vit ailleurs n'a aucun test à montrer sur ce disque,
    // et le lui réclamer rendrait `req_sans_test` rouge sur onze exigences le jour où `INT-T01b`
    // passe `fusionnee` — pour un travail qui, lui, est bien fait et bien testé, dans son dépôt.
    { nom: 'une exigence dont la seule tâche livrée vit dans un autre dépôt', muter: () => { const u = copie(base); u.taches[0]!.repo = 'axionia'; u.fichiers[0]!.reqsCitees = ['REQ-AAA-003']; return u; } },
    { nom: 'une exigence active dont aucune tâche livrée ne la porte', muter: () => { const u = copie(base); u.exigences[1]!.taches = ['T-FUTURE']; return u; } },
    { nom: 'une exigence ABSORBÉE que plus aucun test ne cite', muter: () => { const u = copie(base); u.fichiers[0]!.reqsCitees = ['REQ-AAA-001']; return u; } },
    { nom: 'une PR hors gabarit sans ligne « Couvre: »', muter: () => { const u = copie(base); u.pr![1]!.couvre = []; return u; } },
    { nom: 'un test qui cite une exigence qu’aucune tâche ne lui a promise', muter: () => { const u = copie(base); u.fichiers[1]!.reqsCitees = ['REQ-AAA-002']; return u; } },
    { nom: 'la source PR indisponible — les familles PR se taisent, la garde le dit ailleurs', muter: () => { const u = copie(base); u.pr = null; u.prIndisponible = 'banc d’essai'; return u; } },
    { nom: 'un titre promis avec accents et apostrophes contre un titre sans', muter: () => { const u = copie(base); u.taches[0]!.tests!['REQ-AAA-001'] = ['tests/f/a.spec.ts#REQ-AAA-001 : un titre']; u.fichiers[0]!.titresResolus = ['REQ-AAA-001 : un titré']; return u; } },
    // Le `describe` désigné par son PRÉFIXE : c'est la forme qu'écrit `docs/tasks.json` pour
    // GOV-003, et le `it()` visé existe bel et bien. Une comparaison de la chaîne entière
    // rougissait ici, sur un couple (fichier, test) parfaitement identifiable.
    { nom: 'un `describe` nommé par son préfixe, suivi du `it()` exact', muter: () => { const u = copie(base); u.fichiers[0]!.titresResolus = ["'gov:x' — le detail > REQ-AAA-001 : un titre"]; u.taches[0]!.tests!['REQ-AAA-001'] = ["tests/f/a.spec.ts#'gov:x' > REQ-AAA-001 : un titre"]; return u; } },
  ];

  for (const c of CONTRE_TEMOINS) {
    const f = controler(c.muter());
    if (f.length > 0) {
      console.error(`❌ Le contre-témoin « ${c.nom} » a fait rougir la garde alors qu'il est légitime :`);
      f.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = t.defaut();
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  process.exit(0);
}

const univers = chargerUnivers(!process.argv.includes('--render') && !process.argv.includes('--verifier'));

if (process.argv.includes('--sources')) {
  console.log('gov:trace — état des quatre sources :');
  direLesSources(univers);
  process.exit(0);
}

if (process.argv.includes('--render')) {
  writeFileSync(CHEMIN_VUE, rendreVue(univers));
  // ⚠️ CETTE LIGNE RECOPIAIT LA RÈGLE au lieu de l'appeler — `e.statut === 'active' && e.taches.some(…)`
  // écrit une seconde fois à côté de `reputeeTestee()`. Mesuré le 2026-09-05 en éprouvant la
  // livraison d'`INT-T01b` : la console annonçait « 41 réputées testées » pendant que la VUE
  // qu'elle venait d'écrire en portait 31, dans la même sortie, à deux lignes d'intervalle. Les
  // deux copies avaient divergé au premier raffinement de la règle (RM-01). Elle est APPELÉE.
  const parTacheDuRendu = new Map(univers.taches.map((t) => [t.id, t]));
  const testees = univers.exigences.filter((e) => reputeeTestee(e, parTacheDuRendu));
  console.log(`✅ gov:trace — ${CHEMIN_VUE} rendu depuis ${CHEMIN_REGISTRE}, ${CHEMIN_TACHES} et le disque.`);
  console.log(`   ${univers.exigences.length} exigences, dont ${testees.length} réputées testées.`);
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
  const testees = univers.exigences.filter((e) => reputeeTestee(e, new Map(univers.taches.map((t) => [t.id, t]))));
  console.log(`✅ gov:trace — la matrice est cohérente : ${testees.length} exigences réputées testées, toutes citées par un test exécuté.`);
  direLesSources(univers);
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
process.exit(1);
