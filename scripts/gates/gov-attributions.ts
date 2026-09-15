/**
 * gov-attributions.ts — LES ATTRIBUTIONS SE CONFRONTENT À LEURS SOURCES (GOV-037, REQ-GOV-021, REQ-GOV-003).
 *
 * USAGE   : pnpm gov:attributions          (sort en échec si une attribution est rompue)
 *           pnpm gov:attributions --prove  (les juges refusent leurs cas faussés ; chaque famille rougit sur
 *                                           son témoin ; chaque contre-témoin rend exactement ses exemptions)
 *
 * POURQUOI : ce dépôt dérive et vérifie ses NOMBRES. Ses ATTRIBUTIONS s'écrivent DEUX FOIS : `gates.json[].tache`
 * et les `paths` de la tâche ; `tasks.json[].owner` et `agents.json` ; `tasks.json[].lot` et `docs/journal/` ;
 * un identifiant de tâche nommé dans un en-tête ou dans `docs/gates.json`, et le backlog. La relation
 * exigence <-> tâche n'est pas jugée ici : `gov:requirements` la tient déjà, dans les deux sens.
 *
 * 🔑 CE QUE LA SORTIE VERTE AFFIRME. Aucune attribution LUE n'est ROMPUE, et chaque attribution lue qu'elle
 * n'a pas pu trancher est une EXEMPTION, imprimée sous la rubrique de sa nature et comptée. Ce qu'elle ne
 * lit pas est écrit plus bas (LIMITES CONNUES) ; ce qu'elle ne sait pas lire (source absente, tronquée, mal
 * formée, à clé dupliquée, porteuse d'un octet NUL) la fait REFUSER en se nommant. *Une exemption tue ment.*
 */

import { readFileSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { referencePr, DEPOTS, DEPOT_LOCAL, type Attestation } from '../lot/attestation';
import { LIVREE } from '../lot/avancement';

/*
 * LIMITES CONNUES — ce que cette garde ne voit pas, écrit plutôt que supposé :
 *   — un identifiant écrit au-delà de la vingtième ligne d'un fichier (le périmètre que l'acceptance fixe) ;
 *   — un identifiant écrit en minuscules, ou dont le tiret n'est pas le tiret ASCII (trait d'union
 *     insécable) : la forme d'une mention se dérive des identifiants réels, tels qu'ils s'écrivent ;
 *   — une attribution qui vit dans une REVUE plutôt que dans un fichier du dépôt ;
 *   — qu'un `it()` soit étiqueté par l'exigence qu'il teste vraiment : « ce titre teste un IBAN »
 *     contre « l'exigence dit mono-tenant » n'est mécanisable par aucune garde ;
 *   — une tâche qui RÉSOUT et POSSÈDE le fichier, mais que la phrase désigne à tort. Rejoué : la prose
 *     de `gov:plan-state` qui cite de nouveau GOV-032 pour la lacune PLAN-STATE reste VERTE, parce que
 *     le `tests{}` de GOV-032 porte `plan-state-frais.spec.ts`, le script de cette gate ; son `tests{}`
 *     vidé, la même mention rougit en `mention_hors_paths`. La garde juge la propriété d'un fichier, pas
 *     le sens d'une phrase ;
 *   — une déclaration se range par SITE et identifiant (un fichier, ou une chaîne de `docs/gates.json`),
 *     pas par occurrence : une mention NEUVE du même identifiant au même site est absoute par la
 *     déclaration existante — le compte monte, et la raison imprimée est celle écrite pour l'autre ;
 *   — aucun cliquet ne borne les exemptions d'une tâche NON LIVRÉE aux paths gabarit : une mention neuve
 *     fait monter le compte, sous sa rubrique, et la sortie reste verte. Pour une tâche LIVRÉE, le
 *     registre `DETTE_GABARIT_LIVREE` fige chaque site ET son nombre d'occurrences : une de plus rougit ;
 *   — le journal n'a pas de grain plus fin que la PR : une tâche ÉTRANGÈRE au lot, livrée par une PR
 *     dont le TITRE ne nomme que ce lot, reste attestée. Seul le titre atteste ; le corps ne compte pas ;
 *   — un fichier suivi de `scripts/` ou `tests/` qui porte un octet NUL (UTF-16, binaire) n'est pas lu :
 *     il fait REFUSER la garde, et aucune déclaration ne l'en exempte. Le dépôt n'en porte aucun ;
 *   — un fichier non UTF-8 SANS octet NUL (Latin-1) est lu avec remplacement : ses identifiants ASCII
 *     sont vus, ses caractères accentués ne le sont pas, et rien ne le signale.
 *
 * ⛔ NON LIVRÉS — LES LIVRABLES (5) ET (6) DE L'ACCEPTANCE. Elle les range sous « À livrer », et AUCUN
 * arbitrage écrit ne les en sort : ce n'est donc pas un choix de périmètre, c'est un manque, et il
 * appartient au gardien de la spécification de le trancher.
 *   — (5) la détection de collision de lots qui lit AUSSI `tests{}` s'écrit dans
 *     `scripts/lot/composer.ts`, que les `paths` de la tâche ne portent pas ; l'acceptance exige en
 *     outre de dire ce qu'on fait des tâches dont `tests{}` et `paths` divergent, et c'est une décision.
 *   — (6) confronter les fichiers TOUCHÉS par une PR aux `paths` de ses tâches exige la liste des
 *     fichiers d'une PR, que ce binaire ne lit pas (il juge le dépôt, pas un diff).
 */

// ── les sources, telles que la garde les lit ──────────────────────────────────
export type Tache = {
  id: string;
  paths?: string[];
  tests?: Record<string, string[]>;
  owner?: string | null;
  lot?: string | null;
  pr?: number | null;
  statut?: string;
  /** Le dépôt de forge. Le registre le renseigne sur chaque tâche ; le défaut (ce dépôt-ci) ne sert
   *  qu'aux fixtures. Un `repo` étranger CHANGE ce que `pr` désigne. */
  repo?: string;
  attestation?: Attestation | null;
};
/** Une entrée du registre des gates : chacune de ses chaînes et chacun de ses noms de clé sont lus, à toute profondeur. */
export type Gate = { id: string; script: string; tache?: string; [champ: string]: unknown };
export type Poste = { code: string };
export type Entete = { fichier: string; lignes: string[] };

/**
 * Les natures qu'une DÉCLARATION peut porter. Un identifiant bien formé qui ne résout pas est de deux
 * natures indiscernables — le relecteur CITE une tâche qu'il croit exister, ou il RÉSERVE le prochain
 * identifiant libre — d'où le choix : **on le REFUSE par défaut, et on exige une déclaration.** Une
 * tâche qui résout, nommée dans un fichier hors de ses `paths`, est refusée pareillement, sauf
 * déclaration qu'elle est nommée comme CONTEXTE et non comme propriétaire.
 *
 *   citation     l'identifiant ne résout pas, et on le cite délibérément (la forme qu'une garde interdit) ;
 *   reservation  l'identifiant ne résout pas encore, et on le réserve ;
 *   dette        l'identifiant ne résout pas : attribution FAUSSE, dans un fichier hors des paths de GOV-037 ;
 *   contexte     la tâche résout, le fichier n'est pas à elle, et on la nomme comme voisine.
 */
const NATURES_DECLAREES = ['citation', 'reservation', 'dette', 'contexte'] as const;
type NatureDeclaree = (typeof NATURES_DECLAREES)[number];

/** Une mention d'identifiant DÉCLARÉE : elle est vue, nommée, COMPTÉE, et ne rougit pas. */
export type Citation = { ou: string; id: string; nature: NatureDeclaree; raison: string };

/** Ce qu'une déclaration peut absoudre : `contexte` vise une tâche qui résout, les autres un identifiant qui ne résout pas. */
const ADMISES: Record<'hors_paths' | 'non_resolue', readonly NatureDeclaree[]> = {
  hors_paths: ['contexte'],
  non_resolue: NATURES_DECLAREES.filter((n) => n !== 'contexte'),
};

/** Une non-réciprocité RÉELLE, connue, que cette tâche ne peut pas réparer (ses sources sont en écriture réservée). */
export type DetteGate = { gate: string; tache: string; script: string; raison: string };

/**
 * Un site où une tâche LIVRÉE qui garde un path gabarit est nommée (ou porte une gate) sans que ses paths
 * portent le fichier, FIGÉ avec son nombre d'occurrences. `ou` : le fichier, la chaîne de `docs/gates.json`
 * (`docs/gates.json:<gate>.<champ>`) pour une mention, `docs/gates.json:<gate>` pour la relation garde <-> tâche.
 */
export type DetteGabaritLivree = { tache: string; lieu: 'gate' | 'mention'; ou: string; n: number };

/** Une tâche dont le TITRE de l'entrée de journal de sa PR n'atteste pas le lot, figée avec ce lot et cette PR. */
export type DetteLot = { tache: string; lot: string; pr: number };

export type Sources = {
  taches: Tache[];
  gates: Gate[];
  postes: Poste[];
  journal: string;
  /** Le journal couvre les PR de numéro STRICTEMENT supérieur — dérivé de `docs/journal/README.md`. */
  plancherJournal: number;
  entetes: Entete[];
  citations: Citation[];
  dettesGate: DetteGate[];
  dettesGabarit: DetteGabaritLivree[];
  dettesLot: DetteLot[];
};

/**
 * Toutes les familles de FAUTE. `--prove` exige qu'un témoin DÉCLARÉ pour chacune la fasse rougir,
 * elle et pas une autre, et que le verdict RENDU sorte en échec. Ajouter une famille sans témoin fait
 * rougir la preuve, donc Gate A.
 */
export const FAMILLES = [
  'gate_tache_inconnue',
  'gate_non_reciproque',
  'owner_hors_registre',
  'lot_non_atteste',
  'mention_non_resolue',
  'mention_hors_paths',
  'citation_perimee',
  'dette_perimee',
  'declaration_sans_raison',
] as const;
export type Famille = (typeof FAMILLES)[number];
export type Faute = { famille: Famille; message: string };

/**
 * Toutes les natures d'EXEMPTION : ce que la garde n'a pas tranché, imprimé et compté à chaque passage.
 *
 * 🔑 UNE NATURE PAR CAUSE, ET UN SEUL SITE D'`exempter` PAR NATURE — les trois natures déclarées hors
 * `contexte` partagent le site des déclarations, qui tient la nature de la déclaration elle-même. Ainsi
 * « chaque nature est rendue par un contre-témoin » (`--prove`) vaut « chaque site d'exemption a été vu
 * s'ouvrir » : une branche qui exempte sans que rien ne la produise rougit la preuve.
 */
const NATURES = [
  'dette_gate',
  'dette',
  'gate_paths_non_resolus',
  'gate_paths_en_partie_gabarit',
  'mention_paths_non_resolus',
  'mention_paths_en_partie_gabarit',
  'dette_gabarit_livree_gate',
  'dette_gabarit_livree_mention',
  'lot_sans_pr',
  'lot_sous_plancher',
  'dette_lot_journal',
  'autre_depot',
  'contexte',
  'citation',
  'reservation',
] as const;
export type Nature = (typeof NATURES)[number];
export type Exemption = { nature: Nature; tache: string; site: string; motif: string };
export type Verdict = { fautes: Faute[]; exemptions: Exemption[] };

const SENS: Record<Nature, string> = {
  dette_gate: 'non-réciprocité garde <-> tâche déclarée, que cette tâche ne peut pas réparer',
  dette: 'identifiant qui ne résout pas, déclaré comme attribution FAUSSE hors des paths de cette tâche',
  gate_paths_non_resolus:
    'garde attribuée à une tâche NON LIVRÉE dont CHAQUE path est un gabarit (« pas encore connu ») : réciprocité ni vraie ni fausse',
  gate_paths_en_partie_gabarit:
    'garde attribuée à une tâche NON LIVRÉE dont aucun path RÉEL ne porte le script, et qui garde un gabarit (« le reste n’est pas encore connu ») : réciprocité ni vraie ni fausse',
  mention_paths_non_resolus:
    'tâche NON LIVRÉE nommée hors de ses paths, dont CHAQUE path est un gabarit : propriété ni vraie ni fausse',
  mention_paths_en_partie_gabarit:
    'tâche NON LIVRÉE nommée dans un fichier qu’aucun de ses paths RÉELS ne porte, et qui garde un gabarit : propriété ni vraie ni fausse',
  dette_gabarit_livree_gate:
    'garde attribuée à une tâche LIVRÉE qui garde un path gabarit et dont les paths ne portent pas le script : « pas encore connu » n’est plus vrai — dette de docs/tasks.json FIGÉE site par site (DETTE_GABARIT_LIVREE), tout site neuf rougit',
  dette_gabarit_livree_mention:
    'tâche LIVRÉE à path gabarit nommée dans un fichier que ses paths ne portent pas : « pas encore connu » n’est plus vrai — dette FIGÉE site et occurrences (DETTE_GABARIT_LIVREE), toute occurrence neuve rougit',
  dette_lot_journal:
    'lot que le TITRE de l’entrée de journal de sa PR n’atteste pas (titre sans lot, ou qui en nomme plusieurs) — dette FIGÉE tâche par tâche (DETTE_LOT_JOURNAL), toute tâche neuve rougit',
  lot_sans_pr: 'lot écrit sans PR : docs/journal/ indexe ses entrées par PR, rien ne peut l’attester',
  lot_sous_plancher: 'lot sans entrée de journal, PR sous le plancher de docs/journal/README.md',
  autre_depot: 'lot d’une tâche d’un autre dépôt : docs/journal/ n’indexe que les PR d’ici',
  contexte: 'tâche nommée comme voisine, hors de ses paths, et déclarée comme telle',
  citation: 'identifiant qui ne résout pas, cité délibérément',
  reservation: 'identifiant qui ne résout pas encore, réservé',
};

/**
 * Une raison plus courte que ceci est refusée. Le seuil ne juge pas le SENS — aucune garde ne le
 * peut — il interdit les deux formes d'une déclaration qui ne dit rien : le vide, et le renvoi
 * (« idem. »), qui cesse de dire quelque chose dès que l'entrée du dessus bouge.
 */
const RAISON_MINIMALE = 20;

/** Le périmètre que l'acceptance fixe pour un en-tête. */
const LIGNES_D_EN_TETE = 20;

// ── outillage : rien de tapé qui puisse se dériver (RM-01) ────────────────────

/** `scripts/x.ts#un-job` et `spec.ts#le nom du it` : seule la partie fichier est un chemin. */
function sansAncre(valeur: string): string {
  const i = valeur.indexOf('#');
  return i === -1 ? valeur : valeur.slice(0, i);
}

/**
 * Un chemin GABARIT : `<dossier>/<l'id de la tâche elle-même>`, écrit par l'amorçage quand les
 * chemins réels ne sont pas encore connus (`docs/gouvernance/GOV-003`, `src/domaine/DM-02`).
 *
 * 🔑 IL DIT « ON NE SAIT PAS ENCORE », PAS « CE N'EST PAS À MOI ». Une garde qui condamnerait ces
 * tâches serait rouge de naissance, donc désarmée dans la semaine (RM-02). Une tâche est d'abord jugée
 * sur ses paths RÉELS ; si aucun ne porte le fichier et qu'elle garde un gabarit, la réciprocité n'est
 * déclarée ni vraie ni fausse — et chaque cas est IMPRIMÉ et COMPTÉ, sous une nature qui dit si la
 * tâche a, ou non, des paths réels. Des paths VIDES ne disent rien de tel : la tâche est jugée.
 *
 * 🔑 « PAS ENCORE CONNU » NE VAUT QUE POUR UNE TÂCHE DONT LE STATUT EST ÉCRIT ET N'EST PAS LIVRÉ. Une
 * tâche livrée n'a plus rien à apprendre : son gabarit est une dette de `docs/tasks.json`, et son
 * attribution est JUGÉE comme celle de toute tâche — sauf les sites figés nominativement, avec leur
 * nombre d'occurrences, dans `DETTE_GABARIT_LIVREE`. Un statut absent n'exempte pas (prédicat fermé).
 */
function estGabarit(t: Tache, chemin: string): boolean {
  return chemin.slice(chemin.lastIndexOf('/') + 1) === t.id;
}

/** Les paths RÉELS d'une tâche : ceux qui ne sont pas un gabarit. */
function pathsReels(t: Tache): string[] {
  return (t.paths ?? []).filter((x) => !estGabarit(t, x));
}

/** La tâche garde au moins un path gabarit : une part de ce qu'elle touche n'est pas encore connue. */
function aUnGabarit(t: Tache): boolean {
  return (t.paths ?? []).some((x) => estGabarit(t, x));
}

/** Le gabarit dit encore « pas encore connu » : le statut est ÉCRIT, et il n'est pas livré (`LIVREE`, source unique). */
function pasEncoreLivree(t: Tache): boolean {
  return t.statut !== undefined && !LIVREE.has(t.statut);
}

/** Ce qu'une faute ajoute quand la tâche jugée est livrée et garde un gabarit : pourquoi elle n'est pas exemptée. */
function gabaritLivre(t: Tache): string {
  return aUnGabarit(t) && !pasEncoreLivree(t)
    ? ` ${t.id} est « ${t.statut ?? '(statut absent)'} » et garde un path gabarit : « pas encore connu » n'est plus vrai, ` +
        `et ce site (ou cette occurrence) n'est pas figé dans DETTE_GABARIT_LIVREE.`
    : '';
}

/** Le motif d'une exemption pour paths gabarit : les paths eux-mêmes, réels et gabarit, que le lecteur peut vérifier. */
function pathsDe(t: Tache): string {
  const gabarits = (t.paths ?? []).filter((x) => estGabarit(t, x));
  return `paths réels : ${pathsReels(t).join(', ') || '(aucun)'} · gabarit : ${gabarits.join(', ')}`;
}

/** La surface qu'une tâche DÉCLARE toucher : ses `paths` et les fichiers de son `tests{}`. */
function surface(t: Tache): string[] {
  return [...(t.paths ?? []), ...Object.values(t.tests ?? {}).flat().map(sansAncre)];
}

/** Un chemin est couvert par une entrée exacte, ou par un préfixe de RÉPERTOIRE déclaré (barre finale). */
function couvre(t: Tache, chemin: string): boolean {
  return surface(t).some((x) => x === chemin || (x.endsWith('/') && chemin.startsWith(x)));
}

/**
 * LA FRONTIÈRE D'UN JETON, écrite une fois pour les identifiants de tâche ET les identifiants de lot.
 *   — rien avant qui prolonge le jeton : sans cela `REQ-DM-003` rend `DM-003`, `G-SEC-ROLES` rend `SEC-ROLES` ;
 *   — rien après non plus, `-` suivi d'un caractère compris : `DM-03-A` n'est pas une mention de `DM-03`,
 *     et `L-1-04` n'atteste pas le lot `L-1-0`.
 */
const AVANT = '(?<![A-Za-z0-9-])';
const APRES = '(?![A-Za-z0-9]|-[A-Za-z0-9])';
const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Le motif d'un identifiant de tâche, **dérivé des identifiants réels** (RM-01) : chaque suite de
 * chiffres devient `[0-9]+`, et on assemble l'alternance. Aucune liste de préfixes n'est tapée.
 *
 * L'alternance n'est pas triée : quand une forme courte est prolongée par un caractère d'identifiant,
 * `APRES` la fait échouer et le moteur essaie l'alternative suivante. Contre-témoins : `DM-03-A` (tâche
 * suffixée qui existe) et `DM-03-Z` (suffixe inconnu).
 */
function motifIdentifiant(taches: Tache[]): RegExp {
  const formes = [...new Set(taches.map((t) => echapper(t.id).replace(/[0-9]+/g, '[0-9]+')))];
  return new RegExp(AVANT + '(?:' + formes.join('|') + ')' + APRES, 'g');
}

/** L'entrée NOMME le lot comme un jeton entier — jamais comme une sous-chaîne d'un lot plus long. */
function nommeLeLot(entree: string, lot: string): boolean {
  return new RegExp(AVANT + echapper(lot) + APRES).test(entree);
}

/**
 * L'ANCRE d'une entrée de journal, écrite UNE seule fois (RM-01).
 *
 * 🔑 CE N'EST PAS UNE RÉFÉRENCE DE PR, C'EST UN TITRE DE SECTION. Un message qui dit au lecteur
 * « l'entrée « … » du journal ne nomme pas ce lot » doit citer LA CHAÎNE QUI EST DANS LE FICHIER.
 * La référence de la PR d'une TÂCHE, elle, ne se compose jamais à la main : `referencePr()` en est
 * le seul auteur. Les deux cohabitent dans le même message et ce ne sont pas les mêmes objets.
 */
const ANCRE_JOURNAL = '## PR #';

/** L'ancre de l'entrée d'UNE PR, telle qu'elle est écrite dans `docs/journal/`. */
function ancreDeJournal(pr: number | string): string {
  return `${ANCRE_JOURNAL}${pr}`;
}

/** Le motif de titre, DÉRIVÉ de l'ancre : espaces souples, numéro capturé. Rien n'est retapé. */
const MOTIF_ANCRE = new RegExp('^' + echapper(ANCRE_JOURNAL).replace(/ /g, '\\s+') + '(\\d+)');

/** Les entrées du journal, indexées par numéro de PR. Le TITRE fait partie de l'entrée. */
export function entreesDeJournal(journal: string): Map<string, string> {
  const par = new Map<string, string[]>();
  let courant: string | null = null;
  for (const ligne of journal.split('\n')) {
    const m = MOTIF_ANCRE.exec(ligne);
    if (m) {
      courant = m[1] as string;
      par.set(courant, [ligne]);
      continue;
    }
    if (courant) (par.get(courant) as string[]).push(ligne);
  }
  return new Map([...par].map(([k, v]) => [k, v.join('\n')]));
}

/**
 * Chaque CHAÎNE d'une valeur et chaque NOM DE CLÉ, à toute profondeur, avec son chemin (`.verifie`,
 * `.alias[1]`, `.exemples[0].sortie`, `.GOV-033 (nom de clé)`). Un nombre, un booléen ou `null` ne portent
 * aucune chaîne. Itératif et dans l'ordre du texte : aucune profondeur d'imbrication ne le fait tomber.
 */
function chainesDe(valeur: unknown, chemin: string): [string, string][] {
  const rendues: [string, string][] = [];
  const pile: [unknown, string][] = [[valeur, chemin]];
  while (pile.length > 0) {
    const [v, ou] = pile.pop() as [unknown, string];
    if (typeof v === 'string') rendues.push([ou, v]);
    else if (Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) pile.push([v[i], `${ou}[${i}]`]);
    else if (v !== null && typeof v === 'object') {
      for (const [cle, x] of Object.entries(v).reverse()) pile.push([x, `${ou}.${cle}`], [cle, `${ou}.${cle} (nom de clé)`]);
    }
  }
  return rendues;
}

// ── l'analyse ─────────────────────────────────────────────────────────────────

export function analyser(s: Sources): Verdict {
  const fautes: Faute[] = [];
  const exemptions: Exemption[] = [];
  // Une faute et une exemption par OCCURRENCE : un identifiant écrit deux fois est lu deux fois.
  const dire = (famille: Famille, message: string) => fautes.push({ famille, message });
  const exempter = (nature: Nature, tache: string, site: string, motif: string) =>
    exemptions.push({ nature, tache, site, motif });

  const parId = new Map(s.taches.map((t) => [t.id, t]));

  // Un site figé absout AU PLUS son nombre d'occurrences : la suivante est jugée.
  const occurrencesFigees = new Map<DetteGabaritLivree, number>();
  const figee = (lieu: DetteGabaritLivree['lieu'], tache: string, ou: string): boolean => {
    const d = s.dettesGabarit.find((x) => x.lieu === lieu && x.tache === tache && x.ou === ou);
    if (!d) return false;
    const vues = (occurrencesFigees.get(d) ?? 0) + 1;
    occurrencesFigees.set(d, vues);
    return vues <= d.n;
  };

  // ── (1) garde <-> tâche ─────────────────────────────────────────────────────
  //
  // ⚠️ CE SENS-LÀ SEULEMENT. La réciproque « une tâche qui déclare un script de garde en est la
  // porteuse » est fausse sur cet arbre, et légitimement : une garde est CRÉÉE par une tâche puis
  // ÉTENDUE par d'autres (`gov-identifiants.ts` est déclarée par plusieurs tâches, le registre n'en
  // nomme qu'une). Le registre nomme le CRÉATEUR ; les `paths` d'une tâche nomment ce qu'elle TOUCHE.
  // Toute gate a un script : le chargement refuse une entrée qui n'en porte pas.
  const dettesGateVues = new Set<DetteGate>();
  for (const g of s.gates) {
    if (!g.tache) continue; // aucune tâche écrite : aucune attribution garde <-> tâche
    const t = parId.get(g.tache);
    if (!t) {
      dire(
        'gate_tache_inconnue',
        `docs/gates.json — la gate « ${g.id} » est attribuée à « ${g.tache} », qui n'est pas une tâche du backlog.`
      );
      continue;
    }
    const chemin = sansAncre(g.script);
    if (couvre(t, chemin)) continue;
    const site = `docs/gates.json:${g.id} (${chemin})`;
    const dette = s.dettesGate.find((d) => d.gate === g.id && d.tache === g.tache && d.script === chemin);
    if (dette) {
      dettesGateVues.add(dette);
      exempter('dette_gate', t.id, site, dette.raison);
      continue;
    }
    if (aUnGabarit(t) && pasEncoreLivree(t)) {
      exempter(pathsReels(t).length === 0 ? 'gate_paths_non_resolus' : 'gate_paths_en_partie_gabarit', t.id, site, pathsDe(t));
      continue;
    }
    if (aUnGabarit(t) && figee('gate', t.id, `docs/gates.json:${g.id}`)) {
      exempter('dette_gabarit_livree_gate', t.id, site, `statut ${t.statut} · ${pathsDe(t)}`);
      continue;
    }
    dire(
      'gate_non_reciproque',
      `docs/gates.json — la gate « ${g.id} » déclare le porteur « ${g.tache} » pour ${chemin}, ` +
        `et ${g.tache} ne déclare ce fichier ni dans ses paths ni dans son tests{}. ` +
        `L'attribution n'est réciproque dans aucun sens.` +
        gabaritLivre(t)
    );
  }
  for (const d of s.dettesGate) {
    if (dettesGateVues.has(d)) continue;
    dire(
      'dette_perimee',
      `DETTE_GATE_NON_RECIPROQUE déclare « ${d.gate} » -> « ${d.tache} » (${d.script}), qui n'est PLUS mesurée. ` +
        `Soit la réciprocité est rétablie et l'entrée doit sortir du registre, soit la gate a disparu. ` +
        `Un registre de dettes qu'on ne vide pas cesse d'être lu.`
    );
  }

  // ── (2) poste <-> tâche ─────────────────────────────────────────────────────
  const codes = new Set(s.postes.map((p) => p.code));
  for (const t of s.taches) {
    if (!t.owner) continue; // pas d'owner : une absence, pas une attribution
    if (codes.has(t.owner)) continue;
    dire(
      'owner_hors_registre',
      `docs/tasks.json — ${t.id}.owner vaut « ${t.owner} », qui n'est pas un poste de docs/agents.json.`
    );
  }

  // ── (3) lot <-> tâche, attesté par le journal ───────────────────────────────
  //
  // 🔑 POURQUOI LE JOURNAL, ET PAS `docs/lots/`. `pnpm lot:cloture` écrit `t.lot = lotId` sur toute
  // tâche présente dans le rendu du workflow, SANS vérifier qu'elle appartenait au lot. La
  // composition qui aurait pu le démentir vit dans `docs/lots/<id>/lot.json`, que `.gitignore`
  // exclut. La seule seconde source qui reste au dépôt est `docs/journal/`.
  //
  // 🔑 TOUT LOT ÉCRIT EST JUGÉ OU EXEMPTÉ. Sans PR, le journal (indexé par PR) ne peut rien attester :
  // exemption `lot_sans_pr`. Pour une tâche d'un AUTRE dépôt, `docs/journal/` n'indexe pas sa PR :
  // exemption `autre_depot`. Sous le plancher de `docs/journal/README.md` (que `gov:etat` lit aussi),
  // l'ABSENCE d'entrée est exemptée ; une entrée EXISTANTE dont le titre n'atteste pas le lot reste une faute.
  //
  // 🔑 SEUL LE TITRE ATTESTE, ET S'IL NE NOMME QUE CE LOT. Le corps d'une entrée raconte, et cite d'autres
  // lots (l'entrée de la PR #31 cite `L-1-01`, lot de la PR #26) ; un titre qui nomme plusieurs lots ne
  // dit pas lequel est celui de la tâche. Les lots se reconnaissent par une forme DÉRIVÉE des lots écrits
  // (RM-01). Les cas existants que cette règle refuse sont figés, tâche par tâche, dans `DETTE_LOT_JOURNAL`.
  const entrees = entreesDeJournal(s.journal);
  const motifLot = motifIdentifiant(s.taches.flatMap((t) => (t.lot ? [{ id: t.lot }] : [])));
  const dettesLotVues = new Set<DetteLot>();
  for (const t of s.taches) {
    if (!t.lot) continue; // aucun lot écrit : aucune attribution de lot
    if (t.pr === null || t.pr === undefined) {
      exempter('lot_sans_pr', t.id, `lot « ${t.lot} »`, 'aucune PR écrite : aucune entrée de journal ne peut l’attester');
      continue;
    }
    const repo = t.repo ?? DEPOT_LOCAL;
    // La PR de la TÂCHE se compose par son seul auteur ; l'ANCRE du journal se dérive de sa source.
    const ref = referencePr({ id: t.id, repo, statut: t.statut ?? 'a_faire', pr: t.pr, attestation: t.attestation ?? null });
    const ancre = ancreDeJournal(t.pr);
    if (repo !== DEPOT_LOCAL) {
      exempter('autre_depot', t.id, `lot « ${t.lot} », ${ref}`, `repo « ${repo} »`);
      continue;
    }
    const entree = entrees.get(String(t.pr));
    const titre = entree === undefined ? '' : (entree.split('\n')[0] as string);
    const lotsDuTitre = [...new Set(titre.match(motifLot) ?? [])];
    if (entree !== undefined && nommeLeLot(titre, t.lot) && lotsDuTitre.length === 1) continue;
    if (entree === undefined && t.pr <= s.plancherJournal) {
      exempter('lot_sous_plancher', t.id, `lot « ${t.lot} », ${ref}`, `plancher du journal : > ${s.plancherJournal}`);
      continue;
    }
    const dette = entree === undefined ? undefined : s.dettesLot.find((d) => d.tache === t.id && d.lot === t.lot && d.pr === t.pr);
    if (dette) {
      dettesLotVues.add(dette);
      exempter('dette_lot_journal', t.id, `lot « ${t.lot} », ${ref}`, `lots du titre de « ${ancre} » : ${lotsDuTitre.join(', ') || '(aucun)'}`);
      continue;
    }
    dire(
      'lot_non_atteste',
      entree === undefined
        ? `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et ${ref}, et docs/journal/ n'a aucune entrée « ${ancre} », ` +
            `au-dessus du plancher (> ${s.plancherJournal}). Rien n'atteste que cette tâche appartenait au lot : lot:cloture écrit le lot sans le vérifier.`
        : nommeLeLot(titre, t.lot)
          ? `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et ${ref}, et le TITRE de l'entrée « ${ancre} » du journal nomme plusieurs lots ` +
              `(${lotsDuTitre.join(', ')}) : il n'atteste aucun d'eux, rien ne dit lequel est celui de ${t.id}.`
          : `docs/tasks.json — ${t.id} porte lot « ${t.lot} » et ${ref}, et le TITRE de l'entrée « ${ancre} » du journal ne nomme pas « ${t.lot} » comme un jeton entier ` +
              `(le corps de l'entrée ne compte pas). Une tâche étrangère au lot, présente dans le rendu, passe fusionnee avec ce lot écrit dans un fichier versionné.`
    );
  }
  for (const d of s.dettesLot) {
    if (dettesLotVues.has(d)) continue;
    dire(
      'dette_perimee',
      `DETTE_LOT_JOURNAL déclare « ${d.tache} » -> lot « ${d.lot} », PR ${d.pr}, qui n'est PLUS mesurée : la tâche a changé de lot ou de PR, ` +
        `ou le titre de l'entrée l'atteste maintenant. Retire l'entrée.`
    );
  }

  // ── (4) tout identifiant de tâche NOMMÉ doit RÉSOUDRE, et désigner une tâche à qui le fichier appartient ──
  const motif = motifIdentifiant(s.taches);
  const citationsVues = new Set<Citation>();
  const declaree = (ou: string, id: string, admises: readonly NatureDeclaree[]) =>
    s.citations.find((c) => c.ou === ou && c.id === id && admises.includes(c.nature));

  /**
   * @param ou           la clé sous laquelle une déclaration se range (fichier, ou chaîne de gates.json)
   * @param fichier      le fichier dont la tâche nommée doit être propriétaire
   * @param proprietaire la tâche déjà confrontée à ce fichier par la relation (1), qui ne se juge pas deux fois
   */
  const examiner = (ou: string, fichier: string, texte: string, situer: string, proprietaire?: string) => {
    for (const m of texte.match(motif) ?? []) {
      const t = parId.get(m);
      if (!t) {
        const c = declaree(ou, m, ADMISES.non_resolue);
        if (c) {
          citationsVues.add(c);
          exempter(c.nature, m, situer, c.raison);
          continue;
        }
        dire(
          'mention_non_resolue',
          `${situer} — « ${m} » a la forme d'un identifiant de tâche et ne RÉSOUT PAS. ` +
            `gov:identifiants juge la forme, jamais la résolution : cette mention envoie le lecteur suivant nulle part. ` +
            `Corrige-la, ou DÉCLARE-la dans CITATIONS_DECLAREES en disant si tu CITES ou si tu RÉSERVES.`
        );
        continue;
      }
      if (m === proprietaire) continue; // confrontée par la relation garde <-> tâche, ci-dessus
      if (couvre(t, fichier)) continue;
      const c = declaree(ou, m, ADMISES.hors_paths);
      if (c) {
        citationsVues.add(c);
        exempter('contexte', m, situer, c.raison);
        continue;
      }
      if (aUnGabarit(t) && pasEncoreLivree(t)) {
        exempter(pathsReels(t).length === 0 ? 'mention_paths_non_resolus' : 'mention_paths_en_partie_gabarit', m, situer, pathsDe(t));
        continue;
      }
      if (aUnGabarit(t) && figee('mention', m, ou)) {
        exempter('dette_gabarit_livree_mention', m, situer, `statut ${t.statut} · ${pathsDe(t)}`);
        continue;
      }
      dire(
        'mention_hors_paths',
        `${situer} — nomme « ${m} », et ${fichier} n'est ni dans les paths ni dans le tests{} de ${m}. ` +
          `Le lecteur suivant ira chercher chez ${m} un fichier qui n'est pas à elle. Corrige le nom, ou ` +
          `DÉCLARE la mention en « contexte » dans CITATIONS_DECLAREES si la tâche est nommée comme voisine.` +
          gabaritLivre(t)
      );
    }
  };

  for (const e of s.entetes) {
    e.lignes.forEach((ligne, i) => examiner(e.fichier, e.fichier, ligne, `${e.fichier}:${i + 1}`));
  }
  // Chaque chaîne ET chaque nom de clé d'une entrée, à toute profondeur, PAS le seul champ `tache` : sur
  // `gov:plan-state` le champ `tache` n'a jamais bougé pendant que les identifiants changeaient dans la
  // prose de `verifie`. Le texte a été lu sans clé dupliquée (`cleDupliquee`) : ce qui est jugé est ce qui est écrit.
  for (const g of s.gates) {
    for (const [ou, texte] of chainesDe(g, `docs/gates.json:${g.id}`)) {
      examiner(ou, sansAncre(g.script), texte, ou, g.tache);
    }
  }

  // 🔑 LA GARDE CONFRONTE À L'ÉTAT COURANT DU BACKLOG, ELLE NE VÉRIFIE PAS UNE FOIS. Une attribution
  // se corrompt aussi quand le BACKLOG bouge — et un registre de déclarations vieillit pareil : une
  // déclaration qui n'a absous aucune mention à ce passage est périmée.
  for (const c of s.citations) {
    if (citationsVues.has(c)) continue;
    dire(
      'citation_perimee',
      parId.has(c.id) && ADMISES.non_resolue.includes(c.nature)
        ? `CITATIONS_DECLAREES — « ${c.id} » est déclaré en ${c.nature} pour ${c.ou}, et il RÉSOUT maintenant : ` +
            `le backlog a bougé sous la déclaration. Retire l'entrée, et vérifie que la phrase dit encore ce qu'elle voulait dire.`
        : `CITATIONS_DECLAREES — « ${c.id} » est déclaré en ${c.nature} pour ${c.ou}, et n'y absout plus aucune mention ` +
            `(le site ne le porte plus, la tâche déclare maintenant ce fichier, ou la nature ne convient pas). Retire ou corrige l'entrée.`
    );
  }

  for (const d of s.dettesGabarit) {
    const vues = occurrencesFigees.get(d) ?? 0;
    if (vues >= d.n) continue;
    dire(
      'dette_perimee',
      `DETTE_GABARIT_LIVREE fige ${d.n} occurrence(s) de « ${d.tache} » (${d.lieu}) sur ${d.ou}, et ${vues} y sont mesurées : ` +
        `la mention a disparu, la tâche déclare maintenant ce fichier, ou son gabarit est résolu. Corrige ou retire l'entrée.`
    );
  }

  // ── (5) une déclaration dit POURQUOI ────────────────────────────────────────
  for (const c of s.citations) {
    if (c.raison.trim().length >= RAISON_MINIMALE) continue;
    dire(
      'declaration_sans_raison',
      `CITATIONS_DECLAREES — « ${c.id} » pour ${c.ou} porte une raison de ${c.raison.trim().length} caractère(s) ` +
        `(minimum ${RAISON_MINIMALE}). Une exemption qui ne dit pas pourquoi ne peut être relue par personne.`
    );
  }
  for (const d of s.dettesGate) {
    if (d.raison.trim().length >= RAISON_MINIMALE) continue;
    dire(
      'declaration_sans_raison',
      `DETTE_GATE_NON_RECIPROQUE — « ${d.gate} » -> « ${d.tache} » porte une raison de ${d.raison.trim().length} ` +
        `caractère(s) (minimum ${RAISON_MINIMALE}).`
    );
  }

  return { fautes, exemptions };
}

// ── les registres : ce qui est DÉCLARÉ est vu, nommé, compté, et ne dort pas ──
//
// Chacun est une ÉGALITÉ D'ENSEMBLES, pas un plafond : une faute nouvelle rougit en se nommant,
// une faute réparée rougit en demandant qu'on retire son entrée (`dette_perimee`, `citation_perimee`).

/**
 * LES NON-RÉCIPROCITÉS RÉELLES, MESURÉES, et que GOV-037 ne peut pas réparer : `docs/gates.json` et
 * `docs/tasks.json` sont en écriture réservée (`docs/PRESEANCE.md`).
 *
 * 🔧 `gov:derivation` : la non-réciprocité y est VOULUE et écrite. La gate est DIFFÉRÉE
 * (`docs/GARDES-AXIONIA.md` §2), son script n'existe pas, et `docs/gates.json` dit lui-même pourquoi
 * l'entrée reste attribuée à son créateur : la ré-attribuer viderait le témoin de
 * `gardes-transposees.spec.ts`. *Une attribution délibérément non réciproque reste une attribution
 * non réciproque : on la DÉCLARE, on ne la corrige pas en cassant ce qui la surveille.*
 */
export const DETTE_GATE_NON_RECIPROQUE: DetteGate[] = [
  {
    gate: 'detectPii',
    tache: 'INT-T01a',
    script: 'scripts/gates/detect-pii.ts',
    raison:
      'INT-T01a est fusionnee et ses paths sont renseignés, mais ne portent pas ce script — qui ' +
      "n'existe pas non plus sur le disque. L'attribution ne tient d'aucun côté.",
  },
  {
    gate: 'gov:contrat',
    tache: 'INT-T01a',
    script: 'scripts/gates/contrat-epingle.ts',
    raison: 'même cas : la gate déclare un porteur que la tâche ne déclare pas en retour.',
  },
  {
    gate: 'fixtures:source',
    tache: 'INT-T01a',
    script: 'scripts/gates/fixtures-source.ts',
    raison: 'même cas : la gate déclare un porteur que la tâche ne déclare pas en retour.',
  },
  {
    gate: 'gov:derivation',
    tache: 'GOV-014',
    script: 'scripts/gates/gov-derivation.ts',
    raison:
      'gate DIFFÉRÉE, et son attribution est VOULUE : le script n’existe pas, GOV-014 ne peut donc ' +
      'pas le déclarer, et le registre écrit noir sur blanc que la ré-attribuer à DM-03-A viderait ' +
      'le témoin de gardes-transposees.spec.ts. Le jour où DM-03-A arme la garde, `dette_perimee` ' +
      'réclamera cette ligne.',
  },
];

/** Les mentions d'identifiants déclarées, chacune vue, nommée, comptée et justifiée. */
export const CITATIONS_DECLAREES: Citation[] = [
  // ⚠️ LA NÉGATION QUI PROTÈGE. `gov:tasks` interdit les identifiants SCINDÉS et les NOMME pour
  // dire lesquels. Une garde qui ferait rougir cette phrase forcerait à retirer la défense elle-même.
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'INT-T01',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont INT-T01a et INT-T01b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'GOV-017',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont GOV-017a et GOV-017b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'EXT-T02',
    nature: 'citation',
    raison: 'la garde NOMME la forme scindée qu’elle interdit ; EXT-T02a et EXT-T02b existent, EXT-T02 non.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'INT-T01',
    nature: 'citation',
    raison: 'le registre décrit ce que gov:tasks interdit, dans les mêmes termes qu’elle.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'GOV-017',
    nature: 'citation',
    raison: 'le registre décrit la forme scindée que gov:tasks interdit ; GOV-017a et GOV-017b existent.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'EXT-T02',
    nature: 'citation',
    raison: 'le registre décrit la forme scindée que gov:tasks interdit ; EXT-T02a et EXT-T02b existent.',
  },
  // ── des attributions FAUSSES, dans des fichiers hors des paths de GOV-037 ──
  {
    ou: 'scripts/lot/issues.ts',
    id: 'GOV-017',
    nature: 'dette',
    raison:
      'en-tête : « synchronise les issues GitHub avec docs/tasks.json (GOV-017) ». GOV-017 ne résout ' +
      'pas ; le fichier appartient à GOV-017a ou GOV-017b. Hors des paths de GOV-037.',
  },
  {
    // Un `.json` sous `scripts/` : lu comme tout fichier suivi, quelle que soit son extension.
    ou: 'scripts/lot/tasks.schema.json',
    id: 'GOV-017',
    nature: 'dette',
    raison:
      '« rendait GOV-017 infaisable » nomme la tâche d’avant la scission ; elle ne résout plus, les ' +
      'vraies sont GOV-017a et GOV-017b. Fichier hors des paths de GOV-037.',
  },
  {
    ou: 'docs/gates.json:gate-nightly.verifie',
    id: 'INT-T08',
    nature: 'dette',
    raison:
      '« reconciliation quotidienne (INT-T08) » : la tâche est INT-T08-A ou INT-T08-P. ' +
      'docs/gates.json est en écriture réservée.',
  },
  // ── des tâches nommées comme VOISINES, hors de leurs paths — l'acceptance le permet explicitement ──
  {
    ou: 'scripts/gates/gh-sur.js',
    id: 'GOV-012',
    nature: 'contexte',
    raison: 'historique : la tâche qui a TROUVÉ le défaut que ce fichier ferme, pas celle qui le porte.',
  },
  {
    ou: 'scripts/gates/gh-sur.js',
    id: 'GOV-008',
    nature: 'contexte',
    raison: 'historique : la seconde tâche qui a trouvé le même défaut, de son côté.',
  },
  {
    ou: 'scripts/lot/corps-de-pr.ts',
    id: 'GOV-035',
    nature: 'contexte',
    raison:
      'l’en-tête RACONTE l’attribution fausse qu’il portait (il nommait cette tâche) et sa correction ; ' +
      'rejouée contre cette garde sans la déclaration, elle rougit en mention_hors_paths.',
  },
  {
    ou: 'scripts/lot/corps-de-pr.ts',
    id: 'GOV-037',
    nature: 'contexte',
    raison: 'renvoie à la tâche qui porte la garde des attributions, comme suite du constat.',
  },
  {
    ou: 'tests/unit/gouvernance/autonomie.spec.ts',
    id: 'GOV-011',
    nature: 'contexte',
    raison: 'historique : la garde de traçabilité de cette tâche a trouvé le défaut que ce test tient.',
  },
  {
    ou: 'tests/unit/gouvernance/autonomie.spec.ts',
    id: 'GOV-012',
    nature: 'contexte',
    raison: 'renvoie à la tâche qui porte la protection de branche dont ce test décrit le contournement.',
  },
  {
    ou: 'tests/unit/gouvernance/corps-de-pr-couvre.spec.ts',
    id: 'GOV-036',
    nature: 'contexte',
    raison: 'exemple cité : gov-entite.ts désigne cette tâche, et c’est le cas que le test illustre.',
  },
  {
    ou: 'tests/unit/gouvernance/tout-check-est-cable.spec.ts',
    id: 'GOV-011',
    nature: 'contexte',
    raison: 'historique : la tâche dont la garde a trouvé la case cochée sans être vraie.',
  },
  {
    ou: 'docs/gates.json:perf:bundle.verifie',
    id: 'GOV-019',
    nature: 'contexte',
    raison: 'la prose date les seuils de la première mesure faite par cette tâche ; la gate est à une autre.',
  },
];

/**
 * ⛔ LES TÂCHES LIVRÉES QUI GARDENT UN PATH GABARIT — DETTE NOMINATIVE, FIGÉE. Treize tâches `fusionnee`
 * (GOV-000, GOV-001, GOV-002, GOV-003, GOV-004, GOV-005, GOV-007, GOV-009, GOV-015, GOV-017a, GOV-017b,
 * INT-T01b, QA-T00) ont gardé le path d'amorçage `<dossier>/<id>` : leurs paths n'ont jamais été renseignés.
 * Pour elles « pas encore connu » est faux, et leurs 54 attributions mesurées au 2026-09-15 ne sont ni
 * prouvées ni réfutées. Réparer, c'est écrire leurs paths dans `docs/tasks.json`, en écriture réservée :
 * elles sont donc FIGÉES ici, site par site, avec leur nombre d'occurrences, imprimées et comptées sous
 * `dette_gabarit_livree_*`. Toute attribution NEUVE à l'une d'elles rougit ; une entrée qui ne mesure plus
 * ses occurrences rougit en `dette_perimee`. **On ne l'étend pas pour faire passer un site neuf** : c'est
 * exactement la faute que ce registre existe pour refuser.
 */
export const DETTE_GABARIT_LIVREE: DetteGabaritLivree[] = [
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gate-a', n: 1 },
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gate-deploiement', n: 1 },
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gov:autonomie', n: 1 },
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gov:check', n: 1 },
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gov:publication', n: 1 },
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:notify-sink-hors-prod', n: 1 },
  { tache: 'GOV-001', lieu: 'gate', ou: 'docs/gates.json:gov:requirements', n: 1 },
  { tache: 'GOV-002', lieu: 'gate', ou: 'docs/gates.json:gov:preseance', n: 1 },
  { tache: 'GOV-003', lieu: 'gate', ou: 'docs/gates.json:gov:identifiants', n: 1 },
  { tache: 'GOV-004', lieu: 'gate', ou: 'docs/gates.json:gov:sonde', n: 1 },
  { tache: 'GOV-005', lieu: 'gate', ou: 'docs/gates.json:gov:hypotheses', n: 1 },
  { tache: 'GOV-007', lieu: 'gate', ou: 'docs/gates.json:gov:pr', n: 1 },
  { tache: 'GOV-009', lieu: 'gate', ou: 'docs/gates.json:gov:adr', n: 1 },
  { tache: 'GOV-017a', lieu: 'gate', ou: 'docs/gates.json:gov:tasks', n: 1 },
  { tache: 'QA-T00', lieu: 'gate', ou: 'docs/gates.json:gate-nightly', n: 1 },
  { tache: 'QA-T00', lieu: 'gate', ou: 'docs/gates.json:gates:prouvees', n: 1 },
  { tache: 'QA-T00', lieu: 'gate', ou: 'docs/gates.json:gov:gates-derivees', n: 1 },
  { tache: 'GOV-000', lieu: 'mention', ou: 'docs/gates.json:gov:inventaire.verifie', n: 1 },
  { tache: 'GOV-000', lieu: 'mention', ou: 'scripts/gates/gov-autonomie.ts', n: 1 },
  { tache: 'GOV-001', lieu: 'mention', ou: 'scripts/gates/gov-requirements.ts', n: 1 },
  { tache: 'GOV-001', lieu: 'mention', ou: 'tests/unit/gouvernance/glossaire-enums.spec.ts', n: 1 },
  { tache: 'GOV-002', lieu: 'mention', ou: 'scripts/gates/gov-preseance.ts', n: 2 },
  { tache: 'GOV-002', lieu: 'mention', ou: 'tests/unit/gouvernance/preseance.spec.ts', n: 2 },
  { tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/gov-identifiants.ts', n: 1 },
  { tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/gov-tasks.ts', n: 1 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'scripts/gates/gov-inventaire.ts', n: 1 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'scripts/gates/gov-sonde.ts', n: 2 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'tests/unit/gouvernance/affirmations-verifiees.spec.ts', n: 1 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'tests/unit/gouvernance/inventaire-prouve.spec.ts', n: 1 },
  { tache: 'GOV-005', lieu: 'mention', ou: 'scripts/gates/gov-hypotheses.ts', n: 1 },
  { tache: 'GOV-007', lieu: 'mention', ou: 'scripts/gates/gov-pr.ts', n: 1 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'scripts/adr/index.ts', n: 1 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'scripts/gates/gov-adr.ts', n: 1 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'tests/unit/gouvernance/adr-assertion-existe.spec.ts', n: 2 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'tests/unit/gouvernance/adr-index-derive.spec.ts', n: 1 },
  { tache: 'GOV-015', lieu: 'mention', ou: 'tests/unit/gouvernance/fiches-tiers.controles.ts', n: 1 },
  { tache: 'GOV-015', lieu: 'mention', ou: 'tests/unit/gouvernance/fiches-tiers.spec.ts', n: 1 },
  { tache: 'GOV-017a', lieu: 'mention', ou: 'scripts/gates/gov-tasks.ts', n: 1 },
  { tache: 'GOV-017a', lieu: 'mention', ou: 'scripts/lot/tasks.schema.json', n: 1 },
  { tache: 'GOV-017b', lieu: 'mention', ou: 'docs/gates.json:gov:tasks.verifie', n: 1 },
  { tache: 'GOV-017b', lieu: 'mention', ou: 'scripts/lot/paths-proposes.ts', n: 1 },
  { tache: 'GOV-017b', lieu: 'mention', ou: 'tests/unit/gouvernance/regles-maison.spec.ts', n: 1 },
  { tache: 'INT-T01b', lieu: 'mention', ou: 'scripts/lot/attestation.ts', n: 2 },
  { tache: 'INT-T01b', lieu: 'mention', ou: 'tests/fixtures/axionia/enveloppes-provisoires.json', n: 2 },
  { tache: 'INT-T01b', lieu: 'mention', ou: 'tests/unit/gouvernance/attestation-inter-depot.spec.ts', n: 2 },
  { tache: 'QA-T00', lieu: 'mention', ou: 'scripts/gates/gates-derivees.ts', n: 1 },
  { tache: 'QA-T00', lieu: 'mention', ou: 'scripts/gates/gates-prouvees.ts', n: 1 },
];

/**
 * ⛔ LES LOTS QUE LE TITRE DE LEUR ENTRÉE N'ATTESTE PAS — DETTE NOMINATIVE, FIGÉE. Mesurés au 2026-09-15 :
 *   — PR #31 : le titre nomme TROIS lots (`L-1-04`, `L-1-05`, `L-1-06`) ; ses neuf tâches portent `L-1-04`,
 *     et rien dans le titre ne dit lequel est le leur ;
 *   — PR #33 : le titre ne nomme AUCUN lot ; ses quatre tâches portent `L-1-05`, que seul le corps cite.
 * Réécrire le journal ou le registre n'appartient pas à cette tâche. Une tâche NEUVE dans ce cas rougit.
 */
export const DETTE_LOT_JOURNAL: DetteLot[] = [
  ...['GOV-006', 'GOV-013', 'CPL-T01', 'GOV-024', 'GOV-025', 'GOV-026', 'GOV-027', 'GOV-029', 'GOV-032'].map((tache) => ({ tache, lot: 'L-1-04', pr: 31 })),
  ...['GOV-014', 'GOV-019', 'GOV-028', 'GOV-038'].map((tache) => ({ tache, lot: 'L-1-05', pr: 33 })),
];

// ── chargement des sources réelles ────────────────────────────────────────────

/** Une source n'a pas pu être lue. Ce n'est pas « rien à signaler » : c'est « je n'ai rien lu ». */
export class SourceIllisible extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'SourceIllisible';
  }
}

const README_JOURNAL = 'docs/journal/README.md';

/**
 * La ligne du plancher, sous la forme que `gov-etat.ts` lit aussi. Ce module ne l'exporte pas (il
 * sort du processus quand il s'exécute) : si la ligne change de forme, les DEUX refusent en se
 * nommant, et aucun ne devine. Écrite plus d'une fois — dans un commentaire invisible au rendu, par
 * exemple — elle fait refuser cette garde : elle ne choisit pas laquelle fait foi.
 */
const MOTIF_PLANCHER = /Plancher\s*:\s*le journal couvre les PR de numéro \*\*> (\d+)\*\*/g;

/**
 * La première clé DUPLIQUÉE d'un texte JSON valide, lue sur le TEXTE. `JSON.parse` garde la dernière
 * occurrence et jette les autres sans erreur, alors que le lecteur du fichier ou du diff lit la première —
 * et une résolution de conflit de fusion qui garde les deux côtés produit exactement ce texte. Les clés
 * se comparent DÉCODÉES : `"id"` et sa forme échappée sont la même clé. Itératif : aucune profondeur
 * d'imbrication ne le fait tomber.
 */
function cleDupliquee(texte: string): { cle: string; ligne: number } | null {
  const objets: (Set<string> | null)[] = [];
  const DEUX_POINTS = /\s*:/y;
  for (const m of texte.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
    const jeton = m[0];
    if (jeton === '{') objets.push(new Set());
    else if (jeton === '[') objets.push(null);
    else if (jeton === '}' || jeton === ']') objets.pop();
    else {
      const cles = objets[objets.length - 1];
      DEUX_POINTS.lastIndex = (m.index as number) + jeton.length;
      if (!cles || !DEUX_POINTS.test(texte)) continue; // une valeur, pas une clé
      const cle = JSON.parse(jeton) as string;
      if (cles.has(cle)) return { cle, ligne: texte.slice(0, m.index).split('\n').length };
      cles.add(cle);
    }
  }
  return null;
}

/**
 * LA FORME DE CHAQUE ENTRÉE, pour chaque champ que l'analyse lit. Une entrée qui ne la respecte pas
 * n'est pas jugée : la garde refuse en nommant le registre, l'entrée et le champ, plutôt que de sortir
 * sur une trace de pile ou de juger une valeur qu'elle ne sait pas lire. `satisfies` tient les clés
 * égales à celles du type : un champ ajouté au type sans sa forme ne compile pas.
 */
type Forme = { ok: (v: unknown) => boolean; attendu: string };
const CHAINE: Forme = { ok: (v) => typeof v === 'string' && v.length > 0, attendu: 'une chaîne non vide' };
const CHAINES: Forme = { ok: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), attendu: 'un tableau de chaînes' };
const ENTIER: Forme = { ok: (v) => Number.isInteger(v), attendu: 'un entier' };
const OBJET: Forme = { ok: (v) => v !== null && typeof v === 'object' && !Array.isArray(v), attendu: 'un objet' };
const DICTIONNAIRE: Forme = { ok: (v) => OBJET.ok(v) && Object.values(v as object).every(CHAINES.ok), attendu: 'un objet de tableaux de chaînes' };
const facultatif = (f: Forme, nul = false): Forme => ({
  ok: (v) => v === undefined || (nul && v === null) || f.ok(v),
  attendu: `${f.attendu}${nul ? ', null' : ''} ou rien`,
});
const FORMES = {
  taches: {
    id: CHAINE,
    paths: facultatif(CHAINES),
    tests: facultatif(DICTIONNAIRE),
    owner: facultatif(CHAINE, true),
    lot: facultatif(CHAINE, true),
    pr: facultatif(ENTIER, true),
    statut: facultatif(CHAINE),
    repo: facultatif(CHAINE),
    attestation: facultatif(OBJET, true),
  } satisfies Record<keyof Tache, Forme>,
  gates: { id: CHAINE, script: CHAINE, tache: facultatif(CHAINE) },
  postes: { code: CHAINE } satisfies Record<keyof Poste, Forme>,
};

const DECODEUR_UTF8 = new TextDecoder('utf-8');

/**
 * Les sources, lues UNIQUEMENT parmi les fichiers SUIVIS : un fichier posé à côté du dépôt n'atteste
 * rien, et un fichier suivi absent de la liste n'est pas remplacé par ce que le disque rend.
 *
 * @param suivis la liste que rend `fichiersSuivisOuRefus` — le périmètre est établi AVANT toute lecture
 * @param lire   le lecteur d'octets ; injecté par les témoins de refus, jamais par la garde
 */
export function chargerSources(
  suivis: readonly string[],
  lire: (chemin: string) => Uint8Array = (chemin) => readFileSync(chemin)
): Sources {
  const suivi = new Set(suivis);
  const texte = (chemin: string): string => {
    if (!suivi.has(chemin)) {
      throw new SourceIllisible(`${chemin} n'est pas un fichier SUIVI par git : la garde ne lit pas ce que le dépôt ne porte pas.`);
    }
    let octets: Uint8Array;
    try {
      octets = lire(chemin);
    } catch (e) {
      throw new SourceIllisible(
        `${chemin} est suivi et n'a pas pu être lu (${(e as Error).message.split('\n')[0]}) : un répertoire ou un sous-module n'est pas un fichier.`
      );
    }
    // Un identifiant ASCII écrit en UTF-16 (avec ou sans BOM) ou en UTF-32 porte des octets NUL : lu en
    // UTF-8, il ne serait jamais vu. Un octet NUL, où qu'il soit, fait donc refuser. Sans NUL, les octets
    // non UTF-8 sont remplacés au décodage et les identifiants ASCII restent lisibles.
    if (octets.includes(0)) {
      throw new SourceIllisible(`${chemin} porte un octet NUL : ce n'est pas du texte UTF-8 (UTF-16, binaire), aucun identifiant n'y serait vu.`);
    }
    return DECODEUR_UTF8.decode(octets);
  };
  const tableau = <T>(chemin: string, cle: keyof typeof FORMES): T[] => {
    const lu = texte(chemin);
    let doc: unknown;
    try {
      doc = JSON.parse(lu);
    } catch (e) {
      throw new SourceIllisible(`${chemin} n'est pas du JSON lisible (${(e as Error).message}).`);
    }
    const double = cleDupliquee(lu);
    if (double) {
      throw new SourceIllisible(
        `${chemin}:${double.ligne} — la clé « ${double.cle} » est écrite deux fois dans le même objet : JSON.parse ` +
          `garderait la dernière, le lecteur du fichier ou du diff lit la première. La garde ne choisit pas.`
      );
    }
    const valeur = doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>)[cle] : undefined;
    if (!Array.isArray(valeur)) {
      throw new SourceIllisible(`${chemin} ne porte pas de tableau « ${cle} » : un registre renommé n'est pas un registre vide.`);
    }
    valeur.forEach((entree, i) => {
      if (!OBJET.ok(entree)) throw new SourceIllisible(`${chemin} — ${cle}[${i}] n'est pas un objet.`);
      for (const [champ, forme] of Object.entries(FORMES[cle] as Record<string, Forme>)) {
        const v = (entree as Record<string, unknown>)[champ];
        if (forme.ok(v)) continue;
        throw new SourceIllisible(
          `${chemin} — ${cle}[${i}].${champ} vaut ${String(JSON.stringify(v)).slice(0, 60)}, attendu : ${forme.attendu}. ` +
            `La garde ne juge pas une entrée qu'elle ne sait pas lire.`
        );
      }
    });
    return valeur as T[];
  };

  const journaux = suivis.filter((f) => f.startsWith('docs/journal/') && f.endsWith('.md') && f !== README_JOURNAL);
  if (journaux.length === 0) {
    throw new SourceIllisible(`aucun fichier de journal SUIVI sous docs/journal/ : l'attestation des lots n'aurait aucune source.`);
  }
  const planchers = [...texte(README_JOURNAL).matchAll(MOTIF_PLANCHER)];
  if (planchers.length !== 1) {
    throw new SourceIllisible(
      planchers.length === 0
        ? `le plancher du journal est introuvable dans ${README_JOURNAL} (forme attendue : « Plancher : le journal couvre les PR de numéro **> <n>** »).`
        : `le plancher du journal est écrit ${planchers.length} fois dans ${README_JOURNAL} (${planchers.map((p) => `> ${p[1]}`).join(', ')}) : ` +
            `la garde ne choisit pas laquelle fait foi, et une ligne invisible au rendu en fait partie peut-être.`
    );
  }

  return {
    taches: tableau<Tache>('docs/tasks.json', 'taches'),
    gates: tableau<Gate>('docs/gates.json', 'gates'),
    postes: tableau<Poste>('docs/agents.json', 'postes'),
    journal: journaux.map(texte).join('\n'),
    plancherJournal: Number((planchers[0] as RegExpExecArray)[1]),
    // TOUT fichier suivi de `scripts/` et `tests/`, quelle que soit son extension : l'acceptance dit
    // « tout fichier suivi », et un filtre d'extension est un périmètre qui s'ampute en silence.
    entetes: suivis
      .filter((f) => f.startsWith('scripts/') || f.startsWith('tests/'))
      .map((f) => ({ fichier: f, lignes: texte(f).split('\n').slice(0, LIGNES_D_EN_TETE) })),
    citations: CITATIONS_DECLAREES,
    dettesGate: DETTE_GATE_NON_RECIPROQUE,
    dettesGabarit: DETTE_GABARIT_LIVREE,
    dettesLot: DETTE_LOT_JOURNAL,
  };
}

// ── le verdict RENDU : une seule fonction, pour la garde et pour la preuve ────

function rendreVert(exemptions: Exemption[]): string[] {
  const lignes = [
    `✅ gov:attributions — aucune attribution rompue (${FAMILLES.length} familles). ` +
      `${exemptions.length} exemption(s), chacune imprimée sous la rubrique de sa nature : une exemption tue serait un vert qui ment.`,
  ];
  for (const nature of NATURES) {
    const siennes = exemptions.filter((e) => e.nature === nature);
    if (siennes.length === 0) continue;
    lignes.push(`   ${nature.startsWith('dette') ? '⛔' : '·'} ${nature} (${siennes.length}) — ${SENS[nature]}`);
    siennes.forEach((e) => lignes.push(`      ${e.tache} — ${e.site} : ${e.motif}`));
  }
  return lignes;
}

/**
 * Le code de sortie et les lignes d'un verdict. `principal` n'en a pas d'autre, et `--prove` le juge sur
 * CHAQUE cas : un témoin dont le verdict rendu sort 0, ou qui imprime une bannière de succès, fait
 * rougir la preuve — quelle que soit sa famille.
 */
function rendre({ fautes, exemptions }: Verdict): { code: number; lignes: string[] } {
  if (fautes.length === 0) return { code: 0, lignes: rendreVert(exemptions) };
  const lignes = [`❌ gov:attributions — ${fautes.length} attribution(s) rompue(s) (REQ-GOV-021, REQ-GOV-003) :\n`];
  fautes.forEach((f) => lignes.push(`   [${f.famille}] ${f.message}`));
  lignes.push(`\nUne attribution fausse envoie le lecteur suivant chercher dans un fichier que personne n'a touché.`);
  return { code: 1, lignes };
}

// ── la preuve : un témoin par famille, un contre-témoin par nature d'exemption ─
//
// INVARIANT, repris de `gov:publication` : `--prove` n'accepte AUCUN décompte. Il exige qu'un témoin
// DÉCLARÉ pour chaque famille la fasse rougir en NOMMANT ce qu'il annonce et que son verdict rendu sorte
// en échec, qu'aucun contre-témoin ne fasse rougir aucune famille, que chaque contre-témoin rende
// EXACTEMENT les exemptions qu'il annonce, occurrence par occurrence — puis que ses juges refusent les
// cas déclarés une fois faussés.

export type Temoin = { famille: Famille; quoi: string; sources: Partial<Sources>; nomme: string[] };
export type ContreTemoin = { quoi: string; sources: Partial<Sources>; exemptions?: Nature[] };

/** Les dimensions absentes d'un cas valent VIDE — jamais une présence fabriquée (le plancher vaut 0 : aucune PR exemptée). */
function completer(p: Partial<Sources>): Sources {
  return {
    taches: p.taches ?? [],
    gates: p.gates ?? [],
    postes: p.postes ?? [],
    journal: p.journal ?? '',
    plancherJournal: p.plancherJournal ?? 0,
    entetes: p.entetes ?? [],
    citations: p.citations ?? [],
    dettesGate: p.dettesGate ?? [],
    dettesGabarit: p.dettesGabarit ?? [],
    dettesLot: p.dettesLot ?? [],
  };
}

const T_RESOLUE: Tache = {
  id: 'GOV-100',
  paths: ['scripts/gates/porte.ts'],
  tests: {},
  owner: null,
  lot: null,
  pr: null,
  statut: 'fusionnee',
};
/** Une voisine RÉSOLUE, propriétaire d'un AUTRE fichier. */
const T_VOISINE: Tache = { ...T_RESOLUE, id: 'GOV-101', paths: ['scripts/gates/autre.ts'] };
/** Des tâches NON LIVRÉES aux paths GABARIT : « pas encore connu » y est vrai. */
const T_GABARIT: Tache = { ...T_RESOLUE, id: 'GOV-003', paths: ['docs/gouvernance/GOV-003'], statut: 'a_faire' };
const T_GABARIT_BIS: Tache = { ...T_GABARIT, id: 'GOV-004', paths: ['docs/gouvernance/GOV-004'] };
/** Une tâche NON LIVRÉE aux paths MIXTES : un path réel qui ne porte pas le fichier jugé, et un gabarit. */
const T_MIXTE: Tache = { ...T_GABARIT, id: 'GOV-007', paths: ['docs/gouvernance/GOV-007', 'prisma/schema.prisma'] };
/** Les mêmes, LIVRÉES : « pas encore connu » est faux, leur attribution est jugée. */
const T_LIVREE_GABARIT: Tache = { ...T_GABARIT, statut: 'fusionnee' };
const T_LIVREE_MIXTE: Tache = { ...T_MIXTE, statut: 'fusionnee' };
const JOURNAL = '## PR #31 — 2026-09-10 — feat(GOV-024): lot L-1-04\n\n**Fait.** Neuf tâches.\n';
const JOURNAL_MULTI = '## PR #31 — 2026-09-05 — feat(GOV-024): lots L-1-04, L-1-05 et L-1-06\n\n**Fait.** Neuf tâches.\n';
const GATE_GABARIT = { id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' };
const RAISON = 'une raison qui dit pourquoi, relisible par la session suivante';
const DEPOT_ETRANGER = Object.keys(DEPOTS).find((r) => r !== DEPOT_LOCAL && DEPOTS[r] !== null) as string;
const entete = (lignes: string[], fichier = 'scripts/gates/porte.ts'): Entete[] => [{ fichier, lignes }];
const PII = { id: 'detectPii', script: 'scripts/gates/detect-pii.ts', tache: 'GOV-100' };

const TEMOINS: Temoin[] = [
  // ── (1) garde <-> tâche ──
  {
    famille: 'gate_tache_inconnue',
    quoi: 'une gate est attribuée à une tâche qui n’existe pas',
    sources: { gates: [{ id: 'gov:zzz', script: 'scripts/gates/zzz.ts', tache: 'GOV-999' }] },
    nomme: ['gov:zzz', 'GOV-999'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une gate déclare un porteur que la tâche ne déclare pas en retour',
    sources: { taches: [T_RESOLUE], gates: [PII] },
    nomme: ['detectPii', 'scripts/gates/detect-pii.ts', 'GOV-100'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une tâche aux paths VIDES n’est pas exemptée : elle ne déclare pas le script en retour',
    sources: { taches: [{ ...T_RESOLUE, paths: [] }], gates: [PII] },
    nomme: ['detectPii'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'un path SANS barre finale ne couvre pas le fichier qui le prolonge (`porte.ts` ne couvre pas `porte.tsx`)',
    sources: { taches: [T_RESOLUE], gates: [{ id: 'porte', script: 'scripts/gates/porte.tsx', tache: 'GOV-100' }] },
    nomme: ['scripts/gates/porte.tsx'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une NOUVELLE non-réciprocité, à côté d’une dette déclarée, rougit quand même',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII, { id: 'nouvelle', script: 'scripts/gates/nouvelle.ts', tache: 'GOV-100' }],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    nomme: ['nouvelle'],
  },
  // ── (2) poste <-> tâche ──
  {
    famille: 'owner_hors_registre',
    quoi: 'un owner absent du registre des agents',
    sources: { taches: [{ ...T_RESOLUE, owner: 'A99' }], postes: [{ code: 'A01' }] },
    nomme: ['GOV-100', 'A99'],
  },
  // ── (3) lot <-> tâche ──
  {
    famille: 'lot_non_atteste',
    quoi: 'une tâche étrangère au lot : l’entrée de sa PR ne nomme pas son lot — le message cite l’ANCRE et la RÉFÉRENCE',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 31 }], journal: JOURNAL },
    nomme: [
      'L-9-99',
      ancreDeJournal(31),
      referencePr({ id: 'GOV-100', repo: DEPOT_LOCAL, statut: 'fusionnee', pr: 31, attestation: null }) as string,
    ],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'un lot PRÉFIXE d’un lot nommé n’est pas attesté (`L-1-0` contre une entrée qui nomme `L-1-04`)',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-0', pr: 31 }], journal: JOURNAL },
    nomme: ['L-1-0'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une PR sans entrée, UN numéro au-dessus du plancher',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 28 }], journal: JOURNAL, plancherJournal: 27 },
    nomme: [ancreDeJournal(28)],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'SOUS le plancher, une entrée EXISTANTE qui ne nomme pas le lot reste une faute',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 27 }],
      journal: '## PR #27 — 2026-09-01 — feat(GOV-100): lot L-1-03\n',
      plancherJournal: 27,
    },
    nomme: ['L-9-99', ancreDeJournal(27)],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'F-LOT : un lot FAUX cité seulement dans le CORPS de l’entrée n’est pas attesté — seul le titre atteste',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-98', pr: 31 }], journal: `${JOURNAL}Le corps cite aussi L-9-98.\n` },
    nomme: ['L-9-98', 'TITRE', 'le corps de l'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'F-LOT : un titre qui nomme PLUSIEURS lots n’atteste aucun d’eux',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-06', pr: 31 }], journal: JOURNAL_MULTI },
    nomme: ['L-1-06', 'plusieurs lots'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une dette de lot figée pour UN lot n’absout pas la même tâche sous un AUTRE lot du même titre',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-06', pr: 31 }],
      journal: JOURNAL_MULTI,
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31 }],
    },
    nomme: ['L-1-06'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de lot figée qui ne mesure plus rien (le titre atteste maintenant le lot)',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }], journal: JOURNAL, dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31 }] },
    nomme: ['DETTE_LOT_JOURNAL', 'GOV-100'],
  },
  // ── (1) et (4) : une tâche LIVRÉE qui garde un gabarit est jugée ──
  {
    famille: 'gate_non_reciproque',
    quoi: 'une gate NEUVE attribuée à une tâche LIVRÉE aux paths gabarit : « pas encore connu » n’est plus vrai',
    sources: { taches: [T_LIVREE_GABARIT], gates: [GATE_GABARIT] },
    nomme: ['gov:identifiants', 'GOV-003', 'fusionnee', 'DETTE_GABARIT_LIVREE'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une gate NEUVE attribuée à une tâche LIVRÉE aux paths MIXTES',
    sources: { taches: [T_LIVREE_MIXTE], gates: [{ id: 'gov:pr', script: 'scripts/gates/gov-pr.ts', tache: 'GOV-007' }] },
    nomme: ['gov:pr', 'GOV-007', 'DETTE_GABARIT_LIVREE'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une dette figée en MENTION n’absout pas la relation garde <-> tâche du même lieu',
    sources: {
      taches: [T_LIVREE_GABARIT],
      gates: [GATE_GABARIT],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: 'docs/gates.json:gov:identifiants', n: 1 }],
    },
    nomme: ['gov:identifiants'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un en-tête NEUF nomme une tâche LIVRÉE aux paths gabarit',
    sources: { taches: [T_RESOLUE, T_LIVREE_GABARIT], entetes: entete(['// étendue par GOV-003']) },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-003', 'DETTE_GABARIT_LIVREE'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un en-tête NEUF nomme une tâche LIVRÉE aux paths MIXTES',
    sources: { taches: [T_RESOLUE, T_LIVREE_MIXTE], entetes: entete(['// portée par GOV-007']) },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-007'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'une dette figée pour UN site n’absout pas la même tâche livrée sur un AUTRE site',
    sources: {
      taches: [T_RESOLUE, T_LIVREE_GABARIT],
      entetes: entete(['// étendue par GOV-003']),
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/autre.ts', n: 1 }],
    },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-003'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'une occurrence DE PLUS que ce que la dette fige, sur le site figé, rougit',
    sources: {
      taches: [T_RESOLUE, T_LIVREE_GABARIT],
      entetes: entete(['// GOV-003', '// GOV-003']),
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/porte.ts', n: 1 }],
    },
    nomme: ['scripts/gates/porte.ts:2', 'GOV-003'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette gabarit figée dont les occurrences ne sont plus toutes mesurées',
    sources: {
      taches: [T_RESOLUE, T_LIVREE_GABARIT],
      entetes: entete(['// GOV-003']),
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/porte.ts', n: 2 }],
    },
    nomme: ['DETTE_GABARIT_LIVREE', 'GOV-003', 'scripts/gates/porte.ts'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un statut ABSENT n’exempte pas un gabarit : le prédicat « pas encore connu » est fermé',
    sources: { taches: [T_RESOLUE, { ...T_GABARIT, statut: undefined }], entetes: entete(['// étendue par GOV-003']) },
    nomme: ['GOV-003', 'statut absent'],
  },
  // ── (4) mentions ──
  {
    famille: 'mention_non_resolue',
    quoi: 'un en-tête nomme un identifiant bien formé qui ne résout pas',
    sources: { taches: [T_RESOLUE], entetes: entete(['/**', ' * arbitrage porté par GOV-033']) },
    nomme: ['scripts/gates/porte.ts:2', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'la PROSE d’une entrée de docs/gates.json est lue, pas seulement son champ tache',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'gov:plan-state', script: 'scripts/gates/porte.ts', tache: 'GOV-100', verifie: 'la lacune que GOV-033 porte' }],
    },
    nomme: ['docs/gates.json:gov:plan-state.verifie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un élément d’un TABLEAU d’une entrée de docs/gates.json est lu (`alias`)',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', alias: ['gov:g', 'GOV-033'] }],
    },
    nomme: ['docs/gates.json:g.alias[1]', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une chaîne d’un OBJET imbriqué dans une entrée de docs/gates.json est lue',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', preuveRouge: { sortie: 'la lacune de GOV-033' } }],
    },
    nomme: ['docs/gates.json:g.preuveRouge.sortie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une chaîne d’un OBJET posé DANS un TABLEAU est lue',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', exemples: [{ sortie: 'la lacune de GOV-033' }] }],
    },
    nomme: ['docs/gates.json:g.exemples[0].sortie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un élément d’un TABLEAU posé DANS un OBJET est lu',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', preuveRouge: { lignes: ['rien', 'GOV-033'] } }],
    },
    nomme: ['docs/gates.json:g.preuveRouge.lignes[1]', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un identifiant écrit comme NOM DE CLÉ d’une entrée de docs/gates.json est lu',
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', 'GOV-033': 'porté ici' }],
    },
    nomme: ['docs/gates.json:g.GOV-033 (nom de clé)'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN fichier n’absout pas le même identifiant dans un AUTRE',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: RAISON }],
    },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-017'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN identifiant n’absout pas un AUTRE identifiant du même fichier',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017 et GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une déclaration « contexte » n’absout pas un identifiant qui ne résout pas',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'contexte', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un en-tête nomme une tâche qui EXISTE et à qui le fichier n’appartient pas',
    sources: { taches: [T_RESOLUE, T_VOISINE], entetes: entete(['// arbitrage porté par GOV-101']) },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-101'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'la prose d’une gate nomme une tâche qui existe et à qui le script n’appartient pas',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      gates: [{ id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', verifie: 'portée par GOV-101' }],
    },
    nomme: ['docs/gates.json:g.verifie', 'GOV-101'],
  },
  // Une déclaration qui vise un identifiant QUI NE RÉSOUT PAS n'absout pas une tâche résolue hors de ses paths.
  ...(['citation', 'reservation', 'dette'] as const).map(
    (nature): Temoin => ({
      famille: 'mention_hors_paths',
      quoi: `une déclaration « ${nature} » n’absout pas une tâche RÉSOLUE nommée hors de ses paths`,
      sources: {
        taches: [T_RESOLUE, T_VOISINE],
        entetes: entete(['// GOV-101']),
        citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature, raison: RAISON }],
      },
      nomme: ['GOV-101'],
    })
  ),
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont l’identifiant s’est mis à résoudre — le backlog a bougé',
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'GOV-033' }],
      entetes: entete(['// GOV-033']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'reservation', raison: RAISON }],
    },
    nomme: ['GOV-033', 'RÉSOUT maintenant'],
  },
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont le site ne porte plus l’identifiant',
    sources: {
      entetes: entete(['// plus rien ici']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'citation', raison: RAISON }],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de réciprocité déclarée mais réparée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }],
      gates: [PII],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    nomme: ['detectPii'],
  },
  // ── (5) raisons ──
  {
    famille: 'declaration_sans_raison',
    quoi: 'une raison faite de blancs est vide',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: ' '.repeat(25) }],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'le renvoi « idem. » n’est pas une raison',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: 'idem.' }],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une raison d’UN caractère sous le minimum est refusée',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: 'r'.repeat(RAISON_MINIMALE - 1) }],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une dette de réciprocité sans raison est refusée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: '' }],
    },
    nomme: ['detectPii'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une dette de réciprocité dont la raison est faite de blancs est refusée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: ' '.repeat(25) }],
    },
    nomme: ['detectPii'],
  },
];

/**
 * Ce que la garde ne doit PAS faire rougir, et les exemptions EXACTES qu'elle doit en rendre, une par
 * occurrence. Une garde qui rougit sur tout ne dit rien de plus qu'une garde qui ne rougit jamais.
 */
const CONTRE_TEMOINS: ContreTemoin[] = [
  {
    quoi: 'une gate déclarée dans les paths de sa tâche',
    sources: { taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }], gates: [PII] },
  },
  {
    quoi: 'une gate déclarée dans le tests{} de sa tâche',
    sources: {
      taches: [{ ...T_RESOLUE, tests: { 'REQ-GOV-900': ['tests/integration/index-partiel.spec.ts#un cas'] } }],
      gates: [{ id: 'idx', script: 'tests/integration/index-partiel.spec.ts', tache: 'GOV-100' }],
    },
  },
  {
    quoi: 'une gate sous un RÉPERTOIRE déclaré, et un #job qui ne compte pas dans la comparaison',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/', '.github/workflows/ci.yml'] }],
      gates: [
        { id: 'c', script: 'packages/contracts/verifier.ts', tache: 'GOV-100' },
        { id: 'gate-a', script: '.github/workflows/ci.yml#gate-a', tache: 'GOV-100' },
      ],
    },
  },
  {
    quoi: 'une gate d’une tâche NON LIVRÉE aux paths GABARIT : ni vraie ni fausse — et exemptée en le disant',
    sources: { taches: [T_GABARIT], gates: [GATE_GABARIT] },
    exemptions: ['gate_paths_non_resolus'],
  },
  {
    quoi: 'une gate d’une tâche LIVRÉE aux paths gabarit, figée dans la dette : exemptée sous la dette, pas sous « pas encore connu »',
    sources: {
      taches: [T_LIVREE_GABARIT],
      gates: [GATE_GABARIT],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'gate', ou: 'docs/gates.json:gov:identifiants', n: 1 }],
    },
    exemptions: ['dette_gabarit_livree_gate'],
  },
  {
    quoi: 'un en-tête nomme DEUX fois une tâche LIVRÉE aux paths gabarit, sur un site figé à deux occurrences',
    sources: {
      taches: [T_RESOLUE, T_LIVREE_MIXTE],
      entetes: entete(['// GOV-007', '// encore GOV-007']),
      dettesGabarit: [{ tache: 'GOV-007', lieu: 'mention', ou: 'scripts/gates/porte.ts', n: 2 }],
    },
    exemptions: ['dette_gabarit_livree_mention', 'dette_gabarit_livree_mention'],
  },
  {
    quoi: 'un titre multi-lots, et la tâche figée dans la dette de lot : exemptée en le disant',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }],
      journal: JOURNAL_MULTI,
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31 }],
    },
    exemptions: ['dette_lot_journal'],
  },
  {
    quoi: 'une gate d’une tâche aux paths MIXTES, dont le path réel ne porte pas le script : exemptée sous sa propre nature',
    sources: {
      taches: [T_MIXTE],
      gates: [{ id: 'gov:pr', script: 'scripts/gates/gov-pr.ts', tache: 'GOV-007' }],
    },
    exemptions: ['gate_paths_en_partie_gabarit'],
  },
  {
    quoi: 'un en-tête nomme une tâche aux paths GABARIT : ni vraie ni fausse, et exemptée en le disant',
    sources: { taches: [T_RESOLUE, T_GABARIT], entetes: entete(['// étendue par GOV-003']) },
    exemptions: ['mention_paths_non_resolus'],
  },
  {
    quoi: 'un en-tête nomme une tâche aux paths MIXTES qu’aucun path réel ne relie au fichier : exemptée sous sa propre nature',
    sources: { taches: [T_RESOLUE, T_MIXTE], entetes: entete(['// portée par GOV-007']) },
    exemptions: ['mention_paths_en_partie_gabarit'],
  },
  {
    quoi: 'une tâche aux paths MIXTES dont le path RÉEL porte le fichier : jugée, et rien d’exempté',
    sources: {
      taches: [{ ...T_MIXTE, paths: ['docs/gouvernance/GOV-007', 'scripts/gates/porte.ts'] }],
      entetes: entete(['// portée par GOV-007']),
      gates: [{ id: 'porte', script: 'scripts/gates/porte.ts', tache: 'GOV-007' }],
    },
  },
  {
    quoi: 'CHAQUE occurrence est une exemption : deux tâches sur un site, la même tâche deux fois sur une ligne, puis sur une autre',
    sources: {
      taches: [T_RESOLUE, T_GABARIT, T_GABARIT_BIS],
      entetes: entete(['// GOV-003 et GOV-004, puis GOV-003', '// GOV-003']),
    },
    exemptions: ['mention_paths_non_resolus', 'mention_paths_non_resolus', 'mention_paths_non_resolus', 'mention_paths_non_resolus'],
  },
  {
    quoi: 'une tâche VOISINE déclare la même garde sans en être porteuse',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'GOV-003', paths: ['scripts/gates/gov-identifiants.ts'] },
        { ...T_RESOLUE, id: 'GOV-025', paths: ['scripts/gates/gov-identifiants.ts'] },
      ],
      gates: [{ id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' }],
    },
  },
  {
    quoi: 'un owner vide : une absence, pas une attribution fausse',
    sources: { taches: [T_RESOLUE], postes: [{ code: 'A01' }] },
  },
  {
    quoi: 'le lot nommé dans le TITRE de l’entrée de journal suffit',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }], journal: JOURNAL },
  },
  {
    quoi: 'un lot écrit SANS PR : aucune entrée de journal ne peut l’attester — exemptée en le disant',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: null }], journal: JOURNAL },
    exemptions: ['lot_sans_pr'],
  },
  {
    quoi: 'une PR sans entrée, AU plancher du journal : exemptée en le disant',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 27 }], journal: JOURNAL, plancherJournal: 27 },
    exemptions: ['lot_sous_plancher'],
  },
  {
    quoi: 'une tâche livrée dans un AUTRE dépôt ne se confronte pas au journal d’ici — exemptée en le disant',
    sources: { taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 998, repo: DEPOT_ETRANGER }], journal: JOURNAL },
    exemptions: ['autre_depot'],
  },
  {
    quoi: 'LA NÉGATION QUI PROTÈGE : la garde qui NOMME la forme scindée qu’elle interdit (raison AU minimum)',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// aucun identifiant scindé (`GOV-017`)'], 'scripts/gates/gov-tasks.ts'),
      citations: [{ ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: 'r'.repeat(RAISON_MINIMALE) }],
    },
    exemptions: ['citation'],
  },
  {
    quoi: 'un identifiant RÉSERVÉ, déclaré comme tel',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-034 : réservé']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-034', nature: 'reservation', raison: RAISON }],
    },
    exemptions: ['reservation'],
  },
  {
    quoi: 'une attribution FAUSSE déclarée en dette : bruyante, pas bloquante',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// synchronise les issues (GOV-017)']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'dette', raison: RAISON }],
    },
    exemptions: ['dette'],
  },
  {
    quoi: 'une tâche voisine nommée comme CONTEXTE, hors de ses paths, et déclarée comme telle',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      entetes: entete(['// défaut trouvé par GOV-101']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature: 'contexte', raison: RAISON }],
    },
    exemptions: ['contexte'],
  },
  {
    quoi: 'un identifiant qui RÉSOUT et dont le fichier est dans ses paths',
    sources: { taches: [T_RESOLUE], entetes: entete(['// porte.ts (GOV-100)']) },
  },
  {
    quoi: 'un identifiant d’EXIGENCE n’est pas un identifiant de tâche (REQ-GOV-003, REQ-DM-003)',
    sources: { taches: [{ ...T_RESOLUE, id: 'DM-01' }], entetes: entete(['// porte REQ-GOV-003 et REQ-DM-003']) },
  },
  {
    quoi: 'un identifiant de GATE n’est pas un identifiant de tâche (G-SEC-ROLES, GATE-JUR-PURGE)',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'SEC-08' },
        { ...T_RESOLUE, id: 'JUR-T02' },
      ],
      entetes: entete(['// G-SEC-ROLES, GATE-JUR-PURGE']),
    },
  },
  {
    quoi: 'un identifiant SUFFIXÉ n’est pas son préfixe (DM-03-A n’est pas une mention de DM-03)',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'DM-03-A' },
        { ...T_RESOLUE, id: 'DM-01' },
      ],
      gates: [{ id: 'partners:grille:check', script: 'scripts/gates/porte.ts', tache: 'DM-03-A' }],
    },
  },
  {
    quoi: 'un suffixe INCONNU ne fait pas une mention de son préfixe (DM-03-Z, sans aucune tâche DM-03-…)',
    sources: { taches: [T_RESOLUE, { ...T_RESOLUE, id: 'DM-01' }], entetes: entete(['// DM-03-Z']) },
  },
  {
    quoi: 'une dette déclarée et toujours mesurée, dont la prose nomme son porteur : une seule exemption',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [{ ...PII, verifie: 'porté par GOV-100' }],
      dettesGate: [{ gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: RAISON }],
    },
    exemptions: ['dette_gate'],
  },
];

/** Ce qui rend un verdict : `rendre` pour la garde ; un rendu faussé, pour éprouver les juges. */
type Rendu = (v: Verdict) => { code: number; lignes: string[] };

/** `null` si le témoin rougit sur SA famille en nommant ce qu'il annonce, et que son verdict RENDU sort en échec ; sinon, pourquoi. */
function jugerTemoin(t: Temoin, rendu: Rendu = rendre): string | null {
  const verdict = analyser(completer(t.sources));
  const siennes = verdict.fautes.filter((f) => f.famille === t.famille);
  if (siennes.length === 0) {
    const autres = [...new Set(verdict.fautes.map((f) => f.famille))];
    return (
      `❌ Le témoin « ${t.quoi} » n'a PAS fait rougir « ${t.famille} »` +
      (autres.length > 0 ? ` — il a rougi par ${autres.join(', ')}, qui n'est pas sa famille.` : '.')
    );
  }
  const muets = t.nomme.filter((n) => !siennes.some((f) => f.message.includes(n)));
  if (muets.length > 0) return `❌ Le témoin « ${t.quoi} » rougit sans NOMMER : ${muets.join(', ')}.`;
  const rendus = rendu(verdict);
  if (rendus.code === 0 || rendus.lignes.some((l) => l.startsWith('✅'))) {
    return `❌ Le témoin « ${t.quoi} » rougit sur « ${t.famille} », et le verdict RENDU sort ${rendus.code} ou imprime une bannière de succès : la garde imprimerait sa faute et rendrait la main en succès.`;
  }
  return null;
}

/** `null` si le contre-témoin reste vert, rend exactement ses exemptions, occurrence par occurrence, et que son verdict RENDU sort 0 ; sinon, pourquoi. */
function jugerContreTemoin(c: ContreTemoin, rendu: Rendu = rendre): string | null {
  const verdict = analyser(completer(c.sources));
  const { fautes, exemptions } = verdict;
  if (fautes.length > 0) {
    return (
      `❌ Faux positif : « ${c.quoi} » a fait rougir « ${fautes[0]?.famille} ».\n   ${fautes[0]?.message}\n` +
      `   Cette attribution est LÉGITIME — la règle est trop large, et une garde trop large est retirée dans la semaine.`
    );
  }
  const rendues = exemptions.map((e) => e.nature).sort();
  const annoncees = [...(c.exemptions ?? [])].sort();
  if (rendues.join(',') !== annoncees.join(',')) {
    return (
      `❌ « ${c.quoi} » rend les exemptions [${rendues.join(', ')}] au lieu de [${annoncees.join(', ')}]. ` +
      `Une exemption ajoutée ou tue change ce que la bannière verte affirme.`
    );
  }
  if (rendu(verdict).code !== 0) return `❌ « ${c.quoi} » ne rougit sur aucune famille, et le verdict RENDU sort en échec.`;
  return null;
}

/**
 * LES JUGES SONT ÉPROUVÉS APRÈS LES CAS. Un juge qui accepte tout rend `--prove` vert sur n'importe quels
 * cas : chaque cas DÉCLARÉ, une fois jugé, lui est présenté FAUSSÉ, et il doit le refuser —
 *   — un témoin rattaché à une famille qu'il ne fait pas rougir ;
 *   — un témoin qui annonce un nom qu'aucun de ses messages ne porte, ou que seul le message d'une AUTRE famille porte ;
 *   — un témoin dont le verdict rendu sort 0, ou imprime une bannière de succès ;
 *   — un témoin présenté comme contre-témoin (il rougit) ;
 *   — un contre-témoin dont le verdict rendu sort en échec ;
 *   — un contre-témoin qui annonce une exemption de PLUS, ou de MOINS, que ce qu'il rend ;
 *   — un contre-témoin qui annonce le MÊME nombre d'exemptions, dont une d'une AUTRE nature.
 * Rend la liste des cas faussés qu'un juge a ACCEPTÉS.
 */
function jugesComplaisants(): string[] {
  const acceptes: string[] = [];
  const ABSENT = 'NOM-QU-AUCUN-MESSAGE-NE-PORTE';
  const muet: Rendu = (v) => ({ ...rendre(v), code: 0 });
  const triomphant: Rendu = (v) => ({ ...rendre(v), lignes: ['✅ gov:attributions — succès', ...rendre(v).lignes] });
  const bruyant: Rendu = (v) => ({ ...rendre(v), code: 1 });
  for (const t of TEMOINS) {
    const { fautes } = analyser(completer(t.sources));
    const produites = new Set(fautes.map((f) => f.famille));
    const etrangere = FAMILLES.find((f) => !produites.has(f));
    if (etrangere && jugerTemoin({ ...t, famille: etrangere }) === null) {
      acceptes.push(`jugerTemoin accepte « ${t.quoi} » rattaché à « ${etrangere} », qu'il ne fait pas rougir`);
    }
    if (jugerTemoin({ ...t, nomme: [...t.nomme, ABSENT] }) === null) {
      acceptes.push(`jugerTemoin accepte « ${t.quoi} » annonçant un nom qu'aucun message ne porte`);
    }
    // Un nom que seul le message d'une AUTRE famille porte : présent quand le témoin fait rougir plusieurs familles.
    const siens = fautes.filter((f) => f.famille === t.famille).map((f) => f.message);
    const emprunte = fautes
      .filter((f) => f.famille !== t.famille)
      .flatMap((f) => f.message.split(/\s+/))
      .find((mot) => mot.length > 3 && !siens.some((m) => m.includes(mot)));
    if (emprunte && jugerTemoin({ ...t, nomme: [...t.nomme, emprunte] }) === null) {
      acceptes.push(`jugerTemoin accepte « ${t.quoi} » annonçant « ${emprunte} », que seul le message d'une autre famille porte`);
    }
    if (jugerTemoin(t, muet) === null) acceptes.push(`jugerTemoin accepte « ${t.quoi} » dont le verdict rendu sort 0`);
    if (jugerTemoin(t, triomphant) === null) acceptes.push(`jugerTemoin accepte « ${t.quoi} » dont le verdict rendu imprime une bannière de succès`);
    // Rendu MUET : le faux positif doit être vu par le juge lui-même, pas seulement par le code de sortie.
    if (jugerContreTemoin({ quoi: t.quoi, sources: t.sources }, muet) === null) {
      acceptes.push(`jugerContreTemoin accepte le témoin « ${t.quoi} », qui rougit, dès que son verdict rendu sort 0`);
    }
  }
  for (const c of CONTRE_TEMOINS) {
    const annoncees = c.exemptions ?? [];
    if (jugerContreTemoin(c, bruyant) === null) acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » dont le verdict rendu sort en échec`);
    if (jugerContreTemoin({ ...c, exemptions: [...annoncees, NATURES[0]] }) === null) {
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » annonçant une exemption de PLUS`);
    }
    if (annoncees.length === 0) continue;
    if (jugerContreTemoin({ ...c, exemptions: annoncees.slice(1) }) === null) {
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » annonçant une exemption de MOINS`);
    }
    const autre = NATURES.find((n) => n !== annoncees[0]) as Nature;
    if (jugerContreTemoin({ ...c, exemptions: [autre, ...annoncees.slice(1)] }) === null) {
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » annonçant autant d’exemptions, dont une « ${autre} » qu’il ne rend pas`);
    }
  }
  return acceptes;
}

export function prouver(): { code: number; lignes: string[] } {
  for (const t of TEMOINS) {
    const r = jugerTemoin(t);
    if (r) return { code: 1, lignes: [r, '   Le témoin est faux, ou la règle ne couvre pas ce qu’elle prétend couvrir.'] };
  }
  for (const c of CONTRE_TEMOINS) {
    const r = jugerContreTemoin(c);
    if (r) return { code: 1, lignes: [r] };
  }
  // Les cas déclarés passent : leurs versions faussées doivent maintenant être REFUSÉES.
  const complaisants = jugesComplaisants();
  if (complaisants.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${complaisants.length} cas faussé(s) ACCEPTÉ(S) par les juges de --prove :`,
        ...complaisants.map((c) => `   • ${c}`),
        '   Un juge qui accepte un cas faussé rendrait la preuve verte sur n’importe quels cas.',
      ],
    };
  }
  const sansTemoin = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  if (sansTemoin.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${sansTemoin.length} famille(s) sans témoin qui rougit : ${sansTemoin.join(', ')}.`,
        '   Une règle jamais vue rougir ne garde rien (RM-02). Ajoute-lui un témoin dans TEMOINS.',
      ],
    };
  }
  const sansContre = NATURES.filter((n) => !CONTRE_TEMOINS.some((c) => (c.exemptions ?? []).includes(n)));
  if (sansContre.length > 0) {
    return {
      code: 1,
      lignes: [
        `❌ ${sansContre.length} nature(s) d'exemption qu'aucun contre-témoin ne rend : ${sansContre.join(', ')}.`,
        '   Une exemption que personne n’a vue s’ouvrir peut s’élargir sans que rien ne le dise.',
      ],
    };
  }
  return {
    code: 0,
    lignes: [
      `✅ gov:attributions — les juges refusent chacun de leurs cas faussés ; les ${FAMILLES.length} familles rougissent ` +
        `chacune sur ses témoins (${TEMOINS.length}) ; les ${CONTRE_TEMOINS.length} contre-témoins restent verts et rendent ` +
        `exactement leurs exemptions (les ${NATURES.length} natures sont chacune rendues).`,
      ...FAMILLES.map((f) => `   • ${f}`),
    ],
  };
}

// ── point d'entrée ────────────────────────────────────────────────────────────
//
// UNE SEULE SORTIE, ET ELLE EST TERMINALE. Le verdict est CALCULÉ, puis rendu par un unique appel
// terminal, tout en bas : il n'existe aucun chemin par lequel la garde imprime un refus et continue.
//
// ⚠️ Cette prose ne cite pas l'appel de sortie : le compteur de `refus-de-rendre-et-de-publier.spec.ts`
// est TEXTUEL, et *un commentaire qui cite le motif qu'une garde compte devient une occurrence de ce motif.*
function principal(): { code: number; lignes: string[] } {
  if (process.argv.includes('--prove')) return prouver();

  // Le périmètre D'ABORD : lancée hors de la racine, c'est son refus nommé qui parle, pas une trace de pile.
  const suivis = fichiersSuivisOuRefus('gov:attributions');
  let sources: Sources;
  try {
    sources = chargerSources(suivis);
  } catch (e) {
    if (!(e instanceof SourceIllisible)) throw e;
    return {
      code: 1,
      lignes: [
        `❌ gov:attributions — [source_illisible] ${e.message}`,
        '   La garde REFUSE plutôt que de juger une source qu’elle n’a pas pu lire.',
      ],
    };
  }
  return rendre(analyser(sources));
}

if (process.argv[1] !== undefined && /gov-attributions[.](ts|js)$/.test(process.argv[1])) {
  const verdict = principal();
  (verdict.code === 0 ? console.log : console.error)(verdict.lignes.join('\n'));
  process.exit(verdict.code);
}
