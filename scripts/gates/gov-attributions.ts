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
 *     dont le TITRE ne nomme que ce lot, reste attestée. Seul le titre atteste : une ligne entière
 *     « ## PR #<n> — AAAA-MM-JJ — <titre> », la coupe et le titre que `gov-etat.ts` lit. Le journal est lu
 *     sous une LISTE D'AUTORISATION (`HORS_ASCII_ADMIS`, `JOURNAL_REFUSE`) : ce qui pourrait afficher un titre
 *     que la garde ne lit pas, ou replier un titre qu'elle lit, la fait REFUSER en nommant fichier et ligne ;
 *   — le titre RÉEL d'une entrée, réécrit VISIBLEMENT (un autre lot, ou plus aucun), est lu tel qu'il est
 *     réécrit : le journal est la source. Seules les entrées figées de `DETTE_LOT_JOURNAL` confrontent un
 *     titre à sa mesure antérieure ;
 *   — un caractère typographique hors de `HORS_ASCII_ADMIS` (apostrophe `’`, `≤`, emoji) écrit dans le
 *     journal fait refuser la garde, même là où il ne change rien au rendu : un faux rouge nommé, pas un trou ;
 *   — `docs/journal/README.md` est lu sous la MÊME liste d'autorisation que le reste du journal : il porte
 *     le PLANCHER, et ce nombre exempte des tâches. Sa seule ligne qui y échappe est CELLE DU PLANCHER, et
 *     elle est jugée plus strictement : `MOTIF_LIGNE_DE_PLANCHER` exige qu'elle ne porte QUE le plancher
 *     (un point final toléré). Aucun conteneur n'est énuméré — une énumération a été essayée et mesurée
 *     fuyante sur quatre formes qu'elle n'avait pas (une ligne vide qui referme un bloc HTML, un titre de
 *     lien, un texte alternatif, et une cellule de tableau au-delà des colonnes, que GitHub JETTE).
 *     Ce qu'il en coûte, et qui est un FAUX ROUGE NOMMÉ, jamais un trou : le plancher écrit dans un bloc de
 *     code clôturé ou indenté est REFUSÉ alors que le rendu l'afficherait, il ne peut pas s'écrire au fil
 *     d'une phrase, et le mode d'emploi paie le style du journal (pas de citation `>`, pas de clôture, pas
 *     de continuation indentée, gabarit en span) ;
 *   — ce que la garde ne tient toujours PAS sur ce fichier : elle n'y lit QUE le plancher. Une entrée de
 *     journal écrite dans le README — un titre « ## PR #<n> — … » que le rendu affiche — n'atteste aucun
 *     lot ici, alors que `gov-etat.ts` la compterait pour une entrée. L'écart est fail-closed (il n'exempte
 *     rien), il n'est pas fermé ;
 *   — la liste d'autorisation DICTE le style du journal, et le prix est payé par l'auteur de la PROCHAINE
 *     entrée : aucune ligne faite de seuls signes de bloc (`---`, `+++`, `***`, `___`, `- - -` — filet,
 *     soulignement, en-tête YAML ou TOML : autant de conteneurs dont le rendu ne montre pas les lignes),
 *     et aucun titre dont le texte s'ouvre par « PR » et un numéro sans être le titre d'entrée EXACT ;
 *   — un fichier suivi de `scripts/` ou `tests/` qui porte un octet NUL (UTF-16, binaire) n'est pas lu :
 *     il fait REFUSER la garde, et aucune déclaration ne l'en exempte. Le dépôt n'en porte aucun ;
 *   — un fichier non UTF-8 SANS octet NUL (Latin-1) est lu avec remplacement : ses identifiants ASCII
 *     sont vus, ses caractères accentués ne le sont pas, et rien ne le signale.
 *
 * ✅ LIVRABLES (5) ET (6) DE L'ACCEPTANCE DE GOV-037 — SORTIS D'ICI, ET FERMÉS AILLEURS. Ils ont été
 * portés à GOV-056 par décision de Will le 2026-09-16 (les laisser ici rendait GOV-037 INFERMABLE,
 * qui est le défaut même qu'elle décrivait), et GOV-056 les livre. Le pointeur reste écrit ICI :
 * sans lui, ce fichier annoncerait un manque que plus rien ne porte.
 *   — (5) la détection de collision de lots lit désormais `paths` ET `tests{}` — la règle vit dans
 *     `scripts/lot/chemins-de-tache.ts` (`retenirSansCollision()`, `collisionEntre()`), que
 *     `scripts/lot/composer.ts` APPELLE ; la convention des deux champs y est déclarée, et la
 *     divergence du jour est DÉRIVÉE et imprimée à chaque composition.
 *   — (6) les fichiers TOUCHÉS par une PR sont confrontés aux `paths` de ses tâches par
 *     `scripts/gates/gov-pr.ts` (famille `fichier_hors_paths_des_taches`), là où la PR est DÉJÀ lue :
 *     une seconde lecture de la forge serait une seconde source. Ce binaire-ci juge le dépôt, pas un
 *     diff, et c'est pourquoi la garde ne vit pas ici.
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
 * portent le fichier, FIGÉ avec son nombre d'occurrences.
 *
 * 🔑 `ou` PORTE TOUT CE QUE LE SITE JUGÉ PORTE, Y COMPRIS LE FICHIER JUGÉ. Pour un en-tête : le fichier. Pour
 * `docs/gates.json`, le site tel que `siteDansGates` le compose et que l'exemption l'imprime —
 * `docs/gates.json:<gate> (<script>)` pour la relation garde <-> tâche, `docs/gates.json:<gate>.<champ> (<script>)`
 * pour une mention. Repointer le script d'une gate figée change le site : la dette ne s'applique plus.
 */
export type DetteGabaritLivree = { tache: string; lieu: 'gate' | 'mention'; ou: string; n: number };

/**
 * Une tâche dont le TITRE de l'entrée de journal de sa PR n'atteste pas le lot, figée avec ce lot, cette PR
 * et les lots que ce titre nommait À LA MESURE (`lotsDuTitre`, dans l'ordre du titre). Un titre réécrit qui
 * nomme d'autres lots n'est plus la prémisse figée : la dette ne s'applique plus.
 */
export type DetteLot = { tache: string; lot: string; pr: number; lotsDuTitre: string[] };

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
  dette:
    'identifiant qui ne résout pas, déclaré comme attribution FAUSSE hors des paths de cette tâche',
  gate_paths_non_resolus:
    'garde attribuée à une tâche NON LIVRÉE dont CHAQUE path est un gabarit (« pas encore connu ») : réciprocité ni vraie ni fausse',
  gate_paths_en_partie_gabarit:
    'garde attribuée à une tâche NON LIVRÉE dont aucun path RÉEL ne porte le script, et qui garde un gabarit (« le reste n’est pas encore connu ») : réciprocité ni vraie ni fausse',
  mention_paths_non_resolus:
    'tâche NON LIVRÉE nommée hors de ses paths, dont CHAQUE path est un gabarit : propriété ni vraie ni fausse',
  mention_paths_en_partie_gabarit:
    'tâche NON LIVRÉE nommée dans un fichier qu’aucun de ses paths RÉELS ne porte, et qui garde un gabarit : propriété ni vraie ni fausse',
  dette_gabarit_livree_gate:
    'garde attribuée à une tâche LIVRÉE qui garde un path gabarit et dont les paths ne portent pas le script : « pas encore connu » n’est plus vrai — dette de docs/tasks.json FIGÉE site par site, script de la gate compris (DETTE_GABARIT_LIVREE), tout site neuf rougit',
  dette_gabarit_livree_mention:
    'tâche LIVRÉE à path gabarit nommée dans un fichier que ses paths ne portent pas : « pas encore connu » n’est plus vrai — dette FIGÉE site — fichier jugé compris — et occurrences (DETTE_GABARIT_LIVREE), toute occurrence neuve rougit',
  dette_lot_journal:
    'lot que le TITRE de l’entrée de journal de sa PR n’atteste pas (titre sans lot, ou qui en nomme plusieurs) — dette FIGÉE tâche par tâche avec les lots du titre mesuré (DETTE_LOT_JOURNAL), toute tâche neuve ou tout titre qui nomme d’autres lots rougit',
  lot_sans_pr:
    'lot écrit sans PR : docs/journal/ indexe ses entrées par PR, rien ne peut l’attester',
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
  return [
    ...(t.paths ?? []),
    ...Object.values(t.tests ?? {})
      .flat()
      .map(sansAncre),
  ];
}

/**
 * Le SITE d'une attribution lue dans `docs/gates.json` : le lieu (`docs/gates.json:<gate>`, ou une chaîne
 * `docs/gates.json:<gate>.<champ>`) ET le fichier contre lequel elle est jugée, le script de la gate. Écrit
 * une fois : l'exemption l'imprime, et la dette figée s'apparie sur lui (`DETTE_GABARIT_LIVREE`).
 */
function siteDansGates(ou: string, script: string): string {
  return `${ou} (${script})`;
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
 * LA GRAMMAIRE D'UNE ENTRÉE, telle que `gov-etat.ts` la lit — et `plan-state/build.ts`, à l'identique : ils
 * COUPENT chaque fichier du journal sur `COUPE_ETAT`, puis prennent pour titre de chaque bloc la PREMIÈRE
 * ligne où `TITRE_ETAT` trouve « PR #<n> — AAAA-MM-JJ — <titre> ». N'IMPORTE QUELLE ligne du bloc (drapeau
 * `m`), date EXIGÉE. Ces modules ne s'importent pas (ils sortent du processus) : `attributions-resolvent.spec.ts`
 * extrait leurs deux expressions, SOURCE ET DRAPEAUX, exige l'égalité avec celles-ci, et rejoue leur lecture.
 */
export const COUPE_ETAT = /^## /m;
export const TITRE_ETAT = /^PR #(\d+) — (\d{4}-\d{2}-\d{2}) — (.*)$/m;

/**
 * L'ANCRE d'une entrée de journal, DÉRIVÉE de la coupe et du titre de gov:etat (RM-01) : `## PR #`.
 *
 * 🔑 CE N'EST PAS UNE RÉFÉRENCE DE PR, C'EST UN TITRE DE SECTION. Un message qui dit au lecteur
 * « l'entrée « … » du journal ne nomme pas ce lot » doit citer LA CHAÎNE QUI EST DANS LE FICHIER.
 * La référence de la PR d'une TÂCHE, elle, ne se compose jamais à la main : `referencePr()` en est
 * le seul auteur. Les deux cohabitent dans le même message et ce ne sont pas les mêmes objets.
 */
export const ANCRE_JOURNAL =
  COUPE_ETAT.source.slice(1) + TITRE_ETAT.source.slice(1, TITRE_ETAT.source.indexOf('('));

/** L'ancre de l'entrée d'UNE PR, telle qu'elle est écrite dans `docs/journal/`. */
function ancreDeJournal(pr: number | string): string {
  return `${ANCRE_JOURNAL}${pr}`;
}

/** Le titre d'une entrée : une ligne ENTIÈRE, la coupe de gov:etat puis son titre, date comprise. */
const MOTIF_TITRE = new RegExp('^' + COUPE_ETAT.source.slice(1) + TITRE_ETAT.source.slice(1));

/**
 * 🔑 LA LISTE D'AUTORISATION DU JOURNAL — ses caractères. Les formes de Markdown qui AFFICHENT un titre sont
 * en nombre ouvert (échappement, entité, emphase, caractère invisible, espace insécable, conteneur, fin de
 * ligne nue…) : la garde ne les énumère pas. Elle admet l'ASCII imprimable et les caractères ci-dessous,
 * mesurés sur `docs/journal/2026-09.md` le 2026-09-15 (les lettres françaises avec leurs capitales), et
 * REFUSE tout autre caractère. En élargir la liste se lit dans le diff : le spec la fige.
 */
export const HORS_ASCII_ADMIS = 'àâäæçéèêëîïôöùûüÿœÀÂÄÆÇÉÈÊËÎÏÔÖÙÛÜŸŒᵉ«»—−→↔§·⚠';
/** Le sélecteur de présentation emoji, invisible : admis seulement juste après `⚠`, qu'il ne fait que styler. */
const SELECTEUR_EMOJI = String.fromCodePoint(0xfe0f);

/** Un caractère — UN point de code — que le journal peut porter. */
export function caractereAdmis(c: string): boolean {
  return (c >= ' ' && c <= '~') || HORS_ASCII_ADMIS.includes(c);
}

/** Le premier caractère refusé d'une ligne, nommé par son point de code ; `false` s'il n'y en a aucun. */
function caractereRefuse(ligne: string): string | false {
  let avant = '';
  for (const c of ligne) {
    if (!caractereAdmis(c) && !(c === SELECTEUR_EMOJI && avant === '⚠')) {
      return `U+${(c.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}`;
    }
    avant = c;
  }
  return false;
}

/**
 * Un span de code d'UNE ligne : une suite d'accents graves, refermée par la suivante de MÊME longueur
 * (CommonMark). Hors de lui, le texte est lu ; en lui, tout s'affiche tel quel. Un accent grave qui reste
 * après le retrait des spans n'est refermé par rien sur sa ligne : la garde le refuse (règle de structure),
 * donc aucun span ne franchit une ligne — et un span qui s'ouvrirait au MILIEU d'une suite en laisse le
 * début hors span, refusé de même : l'ouverture n'a pas à regarder derrière elle.
 */
const SPAN = /(`+)(?!`).*?(?<!`)\1(?!`)/g;
const horsSpans = (ligne: string): string => ligne.replace(SPAN, '\n');
const spansColles = (ligne: string): boolean =>
  [...ligne.matchAll(SPAN)].some(
    (m) =>
      (ligne[(m.index as number) - 1] ?? ' ') !== ' ' ||
      (ligne[(m.index as number) + m[0].length] ?? ' ') !== ' '
  );

/**
 * Une ligne faite de SEULS signes de bloc : soulignement de titre, filet, ou délimiteur d'un en-tête
 * (front matter). Une seule définition : la liste d'autorisation du journal la refuse OÙ QU'ELLE SOIT,
 * et le juge du plancher s'en sert pour reconnaître l'en-tête qui replierait la ligne du plancher.
 */
const signesDeBloc = (ligne: string): boolean => /^[-=+*_ ]+$/.test(ligne) && /[-=+*_]/.test(ligne);

/**
 * 🔑 LA LISTE D'AUTORISATION DU JOURNAL — ses lignes. Ce qui suit est REFUSÉ, en nommant le fichier, la ligne
 * et la règle ; tout le reste est lu. Le but : l'ensemble des lignes que le RENDU affiche comme titre
 * d'entrée, celui que gov:etat lit, et celui que la garde lit sont LE MÊME. Le titre d'entrée exact
 * s'affiche toujours en titre (rien ne peut le replier : ni HTML, ni bloc de code, ni conteneur) ; aucune
 * autre ligne ne peut afficher un titre « PR #<n> » ni être lue comme tel.
 *
 * Elle lit TOUT fichier suivi de `docs/journal/`, README compris : le mode d'emploi porte le plancher, et
 * un plancher que le rendu n'affiche pas exempterait des tâches en silence. Ce que la liste coûte au style
 * se paie donc aussi là, et c'est le prix d'une seule mécanique plutôt que d'une énumération de conteneurs.
 */
const JOURNAL_REFUSE: readonly {
  quoi: string;
  /** Ce que la ligne porte de refusé, pour le nommer ; `false` si elle est admise. */
  porte: (ligne: string) => string | false;
}[] = [
  {
    quoi: 'un caractère hors de la liste d’autorisation (ASCII imprimable, HORS_ASCII_ADMIS) : invisible, espace insécable, tabulation ou fin de ligne nue, il change ce que le rendu affiche sans que le texte le montre',
    porte: (l) => caractereRefuse(l),
  },
  {
    quoi: 'hors d’un span de code, un caractère qui change la structure rendue ou cache du texte : `<` `>` `&` `\\` `[` (lien, image, note), ou un accent grave que rien ne referme sur la ligne',
    porte: (l) => /[<>&\\[`]/.exec(horsSpans(l))?.[0] ?? false,
  },
  {
    quoi: 'un début de ligne qui ouvre un bloc que la garde ne lit pas : une espace (code indenté, continuation de liste) ou `~~~` (bloc de code)',
    porte: (l) => /^(?: |~~~)/.exec(l)?.[0] ?? false,
  },
  {
    quoi: `un titre qui n’est pas un titre d’entrée « ${ANCRE_JOURNAL}<n> — AAAA-MM-JJ — <titre> » et porte un \`#\` : le rendu l’affiche, ni gov:etat ni la garde ne le lisent`,
    porte: (l) =>
      /^#{1,6}(?: |$)/.test(l) && !MOTIF_TITRE.test(l) && l.replace(/^#+/, '').includes('#')
        ? '#'
        : false,
  },
  {
    quoi: `un titre dont le texte s’ouvre par « PR » et un numéro sans être un titre d’entrée « ${ANCRE_JOURNAL}<n> — AAAA-MM-JJ — <titre> » : le rendu l’affiche comme l’entrée d’une PR, ni gov:etat ni la garde ne le lisent`,
    porte: (l) => (/^#{1,6} +PR[ #]*[0-9]/.test(l) && !MOTIF_TITRE.test(l) ? 'PR' : false),
  },
  {
    quoi: 'hors d’un span de code, un `#` suivi d’une espace ou de la fin de ligne, ailleurs qu’en tête de ligne : un titre dans une liste ou une note, ou une séquence fermante',
    porte: (l) => (/#(?= |$)/.test(horsSpans(l).replace(/^#+/, '')) ? '#' : false),
  },
  {
    quoi: 'une ligne où gov:etat lit un titre d’entrée (« PR #<n> — AAAA-MM-JJ — » en tête de ligne, n’importe où dans le bloc) sans qu’elle soit écrite en titre',
    porte: (l) => (TITRE_ETAT.test(l) ? 'PR #' : false),
  },
  {
    quoi: 'un titre d’entrée qui ne s’affiche pas tel qu’il s’écrit : hors span, un délimiteur d’emphase (`*` `_` `~`), ou un span de code collé au texte qui l’entoure',
    porte: (l) =>
      MOTIF_TITRE.test(l)
        ? (/[*_~]/.exec(horsSpans(l))?.[0] ?? (spansColles(l) ? '`' : false))
        : false,
  },
  {
    quoi:
      'une ligne faite de seuls signes de bloc (`-` `=` `+` `*` `_`, espaces comprises) — OÙ QU’ELLE SOIT : ' +
      'elle souligne la ligne du dessus en titre, coupe le texte en filet, ou OUVRE UN EN-TÊTE (front matter) ' +
      'que le rendu replie en tableau clé/valeur et dont les lignes — titre d’entrée ou commentaire `#` compris — ' +
      'ne s’affichent nulle part, tandis que la garde les lit comme les autres',
    porte: (l) => (signesDeBloc(l) ? l : false),
  },
];

/**
 * Les entrées du journal, indexées par numéro de PR. Le TITRE fait partie de l'entrée. Deux titres de la même
 * PR ne se remplacent pas : ils forment UN titre, où les lots de chacun comptent.
 */
export function entreesDeJournal(journal: string): Map<string, string> {
  const par = new Map<string, string[]>();
  let courant: string | null = null;
  for (const ligne of journal.split('\n')) {
    const m = MOTIF_TITRE.exec(ligne);
    if (m) {
      courant = m[1] as string;
      const deja = par.get(courant);
      if (deja) deja[0] = `${deja[0]} ${ligne}`;
      else par.set(courant, [ligne]);
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
    else if (Array.isArray(v))
      for (let i = v.length - 1; i >= 0; i--) pile.push([v[i], `${ou}[${i}]`]);
    else if (v !== null && typeof v === 'object') {
      for (const [cle, x] of Object.entries(v).reverse())
        pile.push([x, `${ou}.${cle}`], [cle, `${ou}.${cle} (nom de clé)`]);
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
    const site = siteDansGates(`docs/gates.json:${g.id}`, chemin);
    const dette = s.dettesGate.find(
      (d) => d.gate === g.id && d.tache === g.tache && d.script === chemin
    );
    if (dette) {
      dettesGateVues.add(dette);
      exempter('dette_gate', t.id, site, dette.raison);
      continue;
    }
    if (aUnGabarit(t) && pasEncoreLivree(t)) {
      exempter(
        pathsReels(t).length === 0 ? 'gate_paths_non_resolus' : 'gate_paths_en_partie_gabarit',
        t.id,
        site,
        pathsDe(t)
      );
      continue;
    }
    if (aUnGabarit(t) && figee('gate', t.id, site)) {
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
      exempter(
        'lot_sans_pr',
        t.id,
        `lot « ${t.lot} »`,
        'aucune PR écrite : aucune entrée de journal ne peut l’attester'
      );
      continue;
    }
    const repo = t.repo ?? DEPOT_LOCAL;
    // La PR de la TÂCHE se compose par son seul auteur ; l'ANCRE du journal se dérive de sa source.
    const ref = referencePr({
      id: t.id,
      repo,
      statut: t.statut ?? 'a_faire',
      pr: t.pr,
      attestation: t.attestation ?? null,
    });
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
      exempter(
        'lot_sous_plancher',
        t.id,
        `lot « ${t.lot} », ${ref}`,
        `plancher du journal : > ${s.plancherJournal}`
      );
      continue;
    }
    // La dette ne vaut que pour le titre MESURÉ au gel : les mêmes lots, dans le même ordre.
    const dette =
      entree === undefined
        ? undefined
        : s.dettesLot.find(
            (d) =>
              d.tache === t.id &&
              d.lot === t.lot &&
              d.pr === t.pr &&
              d.lotsDuTitre.join('\n') === lotsDuTitre.join('\n')
          );
    if (dette) {
      dettesLotVues.add(dette);
      exempter(
        'dette_lot_journal',
        t.id,
        `lot « ${t.lot} », ${ref}`,
        `lots du titre de « ${ancre} » : ${lotsDuTitre.join(', ') || '(aucun)'}`
      );
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
      `DETTE_LOT_JOURNAL déclare « ${d.tache} » -> lot « ${d.lot} », PR ${d.pr}, lots du titre figés : ${d.lotsDuTitre.join(', ') || '(aucun)'}, ` +
        `qui n'est PLUS mesurée : la tâche a changé de lot ou de PR, le titre de l'entrée nomme d'autres lots, ` +
        `ou il l'atteste maintenant. Retire ou corrige l'entrée.`
    );
  }

  // ── (4) tout identifiant de tâche NOMMÉ doit RÉSOUDRE, et désigner une tâche à qui le fichier appartient ──
  const motif = motifIdentifiant(s.taches);
  const citationsVues = new Set<Citation>();
  const declaree = (ou: string, id: string, admises: readonly NatureDeclaree[]) =>
    s.citations.find((c) => c.ou === ou && c.id === id && admises.includes(c.nature));

  /**
   * @param ou           la clé sous laquelle une déclaration se range (fichier, ou chaîne de gates.json)
   * @param figeeSous    la clé d'une dette `DETTE_GABARIT_LIVREE` : le site, fichier jugé compris
   * @param fichier      le fichier dont la tâche nommée doit être propriétaire
   * @param proprietaire la tâche déjà confrontée à ce fichier par la relation (1), qui ne se juge pas deux fois
   */
  const examiner = (
    ou: string,
    figeeSous: string,
    fichier: string,
    texte: string,
    situer: string,
    proprietaire?: string
  ) => {
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
        exempter(
          pathsReels(t).length === 0
            ? 'mention_paths_non_resolus'
            : 'mention_paths_en_partie_gabarit',
          m,
          situer,
          pathsDe(t)
        );
        continue;
      }
      if (aUnGabarit(t) && figee('mention', m, figeeSous)) {
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
    e.lignes.forEach((ligne, i) =>
      examiner(e.fichier, e.fichier, e.fichier, ligne, `${e.fichier}:${i + 1}`)
    );
  }
  // Chaque chaîne ET chaque nom de clé d'une entrée, à toute profondeur, PAS le seul champ `tache` : sur
  // `gov:plan-state` le champ `tache` n'a jamais bougé pendant que les identifiants changeaient dans la
  // prose de `verifie`. Le texte a été lu sans clé dupliquée (`cleDupliquee`) : ce qui est jugé est ce qui est écrit.
  for (const g of s.gates) {
    const script = sansAncre(g.script);
    for (const [ou, texte] of chainesDe(g, `docs/gates.json:${g.id}`)) {
      const site = siteDansGates(ou, script);
      examiner(ou, site, script, texte, site, g.tache);
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
  // UX-P0-01 nomme sa VOISINE pour dire ce qui n'est PAS dans son périmètre. Retirer le nom rendrait
  // la phrase inutilisable : un lecteur saurait qu'une chose est exclue, sans savoir qui la porte.
  {
    ou: 'docs/gates.json:GATE-UX-EXHAUSTIVITE.verifie',
    id: 'UX-P0-01b',
    nature: 'contexte',
    raison:
      'la garde d’exhaustivité de UX-P0-01 nomme UX-P0-01b pour EXCLURE de son périmètre les ' +
      'libellés d’états d’attribution, qui ne peuvent être écrits qu’une fois les états livrés. ' +
      'Le fichier cité appartient à UX-P0-01 ; UX-P0-01b est nommée comme voisine, jamais comme ' +
      'propriétaire.',
  },
  // ⚠️ LA NÉGATION QUI PROTÈGE. `gov:tasks` interdit les identifiants SCINDÉS et les NOMME pour
  // dire lesquels. Une garde qui ferait rougir cette phrase forcerait à retirer la défense elle-même.
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'INT-T01',
    nature: 'citation',
    raison:
      'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont INT-T01a et INT-T01b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'GOV-017',
    nature: 'citation',
    raison:
      'la garde NOMME la forme scindée qu’elle interdit ; les vraies tâches sont GOV-017a et GOV-017b.',
  },
  {
    ou: 'scripts/gates/gov-tasks.ts',
    id: 'EXT-T02',
    nature: 'citation',
    raison:
      'la garde NOMME la forme scindée qu’elle interdit ; EXT-T02a et EXT-T02b existent, EXT-T02 non.',
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
    raison:
      'le registre décrit la forme scindée que gov:tasks interdit ; GOV-017a et GOV-017b existent.',
  },
  {
    ou: 'docs/gates.json:gov:tasks.verifie',
    id: 'EXT-T02',
    nature: 'citation',
    raison:
      'le registre décrit la forme scindée que gov:tasks interdit ; EXT-T02a et EXT-T02b existent.',
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
    raison:
      'historique : la tâche qui a TROUVÉ le défaut que ce fichier ferme, pas celle qui le porte.',
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
    raison:
      'historique : la garde de traçabilité de cette tâche a trouvé le défaut que ce test tient.',
  },
  {
    ou: 'tests/unit/gouvernance/autonomie.spec.ts',
    id: 'GOV-012',
    nature: 'contexte',
    raison:
      'renvoie à la tâche qui porte la protection de branche dont ce test décrit le contournement.',
  },
  {
    ou: 'tests/unit/gouvernance/corps-de-pr-couvre.spec.ts',
    id: 'GOV-036',
    nature: 'contexte',
    raison:
      'exemple cité : gov-entite.ts désigne cette tâche, et c’est le cas que le test illustre.',
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
    raison:
      'la prose date les seuils de la première mesure faite par cette tâche ; la gate est à une autre.',
  },
  {
    ou: 'scripts/gates/gov-check.ts',
    id: 'GOV-000',
    nature: 'contexte',
    raison:
      'historique : l’en-tête raconte que la tâche d’amorçage déclarait l’entrée gov:check du registre ' +
      'sans que son script existe ; le fichier appartient à la tâche qui l’a livré.',
  },
];

/**
 * ⛔ LES TÂCHES LIVRÉES QUI GARDENT UN PATH GABARIT — DETTE NOMINATIVE, FIGÉE. Treize tâches `fusionnee`
 * (GOV-000, GOV-001, GOV-002, GOV-003, GOV-004, GOV-005, GOV-007, GOV-009, GOV-015, GOV-017a, GOV-017b,
 * INT-T01b, QA-T00) ont gardé le path d'amorçage `<dossier>/<id>` : leurs paths n'ont jamais été renseignés.
 * Pour elles « pas encore connu » est faux, et leurs 54 attributions mesurées au 2026-09-15 ne sont ni
 * prouvées ni réfutées. Réparer, c'est écrire leurs paths dans `docs/tasks.json`, en écriture réservée :
 * elles sont donc FIGÉES ici, site par site — le site porte le fichier jugé : le script de la gate pour
 * `docs/gates.json` —, avec leur nombre d'occurrences, imprimées et comptées sous `dette_gabarit_livree_*`.
 * Toute attribution NEUVE à l'une d'elles rougit, y compris une gate figée repointée vers un autre script ; une entrée qui ne mesure plus
 * ses occurrences rougit en `dette_perimee`. **On ne l'étend pas pour faire passer un site neuf** : c'est
 * exactement la faute que ce registre existe pour refuser.
 */
export const DETTE_GABARIT_LIVREE: DetteGabaritLivree[] = [
  { tache: 'GOV-000', lieu: 'gate', ou: 'docs/gates.json:gate-a (.github/workflows/ci.yml)', n: 1 },
  {
    tache: 'GOV-000',
    lieu: 'gate',
    ou: 'docs/gates.json:gate-deploiement (scripts/gates/deploy-verify.ts)',
    n: 1,
  },
  {
    tache: 'GOV-000',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:autonomie (scripts/gates/gov-autonomie.ts)',
    n: 1,
  },
  {
    tache: 'GOV-000',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:check (scripts/gates/gov-check.ts)',
    n: 1,
  },
  {
    tache: 'GOV-000',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:publication (scripts/gates/gov-publication.ts)',
    n: 1,
  },
  {
    tache: 'GOV-000',
    lieu: 'gate',
    ou: 'docs/gates.json:notify-sink-hors-prod (scripts/gates/hook-env.js)',
    n: 1,
  },
  {
    tache: 'GOV-001',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:requirements (scripts/gates/gov-requirements.ts)',
    n: 1,
  },
  {
    tache: 'GOV-002',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:preseance (scripts/gates/gov-preseance.ts)',
    n: 1,
  },
  {
    tache: 'GOV-003',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:identifiants (scripts/gates/gov-identifiants.ts)',
    n: 1,
  },
  {
    tache: 'GOV-004',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:sonde (scripts/gates/gov-sonde.ts)',
    n: 1,
  },
  {
    tache: 'GOV-005',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:hypotheses (scripts/gates/gov-hypotheses.ts)',
    n: 1,
  },
  { tache: 'GOV-007', lieu: 'gate', ou: 'docs/gates.json:gov:pr (scripts/gates/gov-pr.ts)', n: 1 },
  {
    tache: 'GOV-009',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:adr (scripts/gates/gov-adr.ts)',
    n: 1,
  },
  {
    tache: 'GOV-017a',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:tasks (scripts/gates/gov-tasks.ts)',
    n: 1,
  },
  {
    tache: 'QA-T00',
    lieu: 'gate',
    ou: 'docs/gates.json:gate-nightly (.github/workflows/nightly.yml)',
    n: 1,
  },
  {
    tache: 'QA-T00',
    lieu: 'gate',
    ou: 'docs/gates.json:gates:prouvees (scripts/gates/gates-prouvees.ts)',
    n: 1,
  },
  {
    tache: 'QA-T00',
    lieu: 'gate',
    ou: 'docs/gates.json:gov:gates-derivees (scripts/gates/gates-derivees.ts)',
    n: 1,
  },
  {
    tache: 'GOV-000',
    lieu: 'mention',
    ou: 'docs/gates.json:gov:inventaire.verifie (scripts/gates/gov-inventaire.ts)',
    n: 1,
  },
  { tache: 'GOV-000', lieu: 'mention', ou: 'scripts/gates/gov-autonomie.ts', n: 1 },
  { tache: 'GOV-001', lieu: 'mention', ou: 'scripts/gates/gov-requirements.ts', n: 1 },
  { tache: 'GOV-001', lieu: 'mention', ou: 'tests/unit/gouvernance/glossaire-enums.spec.ts', n: 1 },
  { tache: 'GOV-002', lieu: 'mention', ou: 'scripts/gates/gov-preseance.ts', n: 2 },
  // 🔧 2026-09-17, GOV-056 (4b) — QUATRE SITES RETIRÉS, PARCE QU'ILS SONT RÉSOLUS, ET C'EST LA GARDE
  // QUI L'A DIT. `dette_perimee` a rougi en nommant chacun d'eux : « la tâche déclare maintenant ce
  // fichier ». Leur `tests{}` promettait `preseance.spec.ts`, `affirmations-verifiees.spec.ts`,
  // `adr-index-derive.spec.ts`, `fiches-tiers.spec.ts` — un NOM NU, qui ne résout aucun fichier du
  // dépôt : les quatre spécifications passaient pour portées par personne, et les quatre mentions
  // pour orphelines. Les promesses portent désormais le chemin complet (`outils/reecrire-champ.mjs`),
  // et les sites se referment d'eux-mêmes.
  //   - GOV-002 · tests/unit/gouvernance/preseance.spec.ts            (n: 2)
  //   - GOV-004 · tests/unit/gouvernance/affirmations-verifiees.spec.ts (n: 1)
  //   - GOV-009 · tests/unit/gouvernance/adr-index-derive.spec.ts     (n: 1)
  //   - GOV-015 · tests/unit/gouvernance/fiches-tiers.spec.ts         (n: 1)
  // ⚠️ `tests/unit/gouvernance/fiches-tiers.controles.ts` RESTE figé : ce n'est pas une
  // spécification, aucune promesse ne le nomme, et rien ne l'a résolu. Retirer une entrée parce que
  // sa VOISINE s'est refermée serait exactement la dette qu'on prétend faire baisser.
  { tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/gov-identifiants.ts', n: 1 },
  { tache: 'GOV-003', lieu: 'mention', ou: 'scripts/gates/gov-tasks.ts', n: 1 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'scripts/gates/gov-inventaire.ts', n: 1 },
  { tache: 'GOV-004', lieu: 'mention', ou: 'scripts/gates/gov-sonde.ts', n: 2 },
  {
    tache: 'GOV-004',
    lieu: 'mention',
    ou: 'tests/unit/gouvernance/inventaire-prouve.spec.ts',
    n: 1,
  },
  { tache: 'GOV-005', lieu: 'mention', ou: 'scripts/gates/gov-hypotheses.ts', n: 1 },
  { tache: 'GOV-007', lieu: 'mention', ou: 'scripts/gates/gov-pr.ts', n: 1 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'scripts/adr/index.ts', n: 1 },
  { tache: 'GOV-009', lieu: 'mention', ou: 'scripts/gates/gov-adr.ts', n: 1 },
  {
    tache: 'GOV-009',
    lieu: 'mention',
    ou: 'tests/unit/gouvernance/adr-assertion-existe.spec.ts',
    n: 2,
  },
  {
    tache: 'GOV-015',
    lieu: 'mention',
    ou: 'tests/unit/gouvernance/fiches-tiers.controles.ts',
    n: 1,
  },
  { tache: 'GOV-017a', lieu: 'mention', ou: 'scripts/gates/gov-tasks.ts', n: 1 },
  { tache: 'GOV-017a', lieu: 'mention', ou: 'scripts/lot/tasks.schema.json', n: 1 },
  {
    tache: 'GOV-017b',
    lieu: 'mention',
    ou: 'docs/gates.json:gov:tasks.verifie (scripts/gates/gov-tasks.ts)',
    n: 1,
  },
  { tache: 'GOV-017b', lieu: 'mention', ou: 'scripts/lot/paths-proposes.ts', n: 1 },
  { tache: 'GOV-017b', lieu: 'mention', ou: 'tests/unit/gouvernance/regles-maison.spec.ts', n: 1 },
  { tache: 'INT-T01b', lieu: 'mention', ou: 'scripts/lot/attestation.ts', n: 2 },
  {
    tache: 'INT-T01b',
    lieu: 'mention',
    ou: 'tests/fixtures/axionia/enveloppes-provisoires.json',
    n: 2,
  },
  {
    tache: 'INT-T01b',
    lieu: 'mention',
    ou: 'tests/unit/gouvernance/attestation-inter-depot.spec.ts',
    n: 2,
  },
  { tache: 'QA-T00', lieu: 'mention', ou: 'scripts/gates/gates-derivees.ts', n: 1 },
  { tache: 'QA-T00', lieu: 'mention', ou: 'scripts/gates/gates-prouvees.ts', n: 1 },
];

/**
 * ⛔ LES LOTS QUE LE TITRE DE LEUR ENTRÉE N'ATTESTE PAS — DETTE NOMINATIVE, FIGÉE. Mesurés au 2026-09-15 :
 *   — PR #31 : le titre nomme TROIS lots (`L-1-04`, `L-1-05`, `L-1-06`) ; ses neuf tâches portent `L-1-04`,
 *     et rien dans le titre ne dit lequel est le leur ;
 *   — PR #33 : le titre ne nomme AUCUN lot ; ses quatre tâches portent `L-1-05`, que seul le corps cite.
 * Réécrire le journal ou le registre n'appartient pas à cette tâche. Une tâche NEUVE dans ce cas rougit, et
 * un titre réécrit pour nommer d'autres lots aussi : chaque entrée fige les lots que le titre nommait.
 */
export const DETTE_LOT_JOURNAL: DetteLot[] = [
  ...[
    'GOV-006',
    'GOV-013',
    'CPL-T01',
    'GOV-024',
    'GOV-025',
    'GOV-026',
    'GOV-027',
    'GOV-029',
    'GOV-032',
  ].map((tache) => ({
    tache,
    lot: 'L-1-04',
    pr: 31,
    lotsDuTitre: ['L-1-04', 'L-1-05', 'L-1-06'],
  })),
  ...['GOV-014', 'GOV-019', 'GOV-028', 'GOV-038'].map((tache) => ({
    tache,
    lot: 'L-1-05',
    pr: 33,
    lotsDuTitre: [],
  })),
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
 * exemple — elle fait refuser cette garde : elle ne choisit pas laquelle fait foi. Écrite UNE seule
 * fois, mais dans un conteneur que le rendu n'affiche pas, la LIGNE QUI OUVRE ce conteneur fait
 * refuser la liste d'autorisation, qui lit ce README comme tout autre fichier du journal.
 */
const MOTIF_PLANCHER = /Plancher\s*:\s*le journal couvre les PR de numéro \*\*> (\d+)\*\*/g;

/**
 * 🔑 CE QUI CACHERAIT LE PLANCHER — AUCUNE ÉNUMÉRATION DE CONTENEURS. DEUX RÈGLES, TOUTES DEUX DÉRIVÉES.
 *
 * Le plancher est L'INTERRUPTEUR du journal : le nombre qu'il porte EXEMPTE des tâches de toute
 * attestation de lot (`lot_sous_plancher`). Une passe a essayé d'énumérer les conteneurs que le rendu
 * n'affiche pas ; la liste a été mesurée fuyante sur QUATRE formes qu'elle n'avait pas (une ligne vide
 * referme le bloc HTML qu'elle savait voir ; une définition de lien dont le titre est à la ligne
 * suivante ; un titre de lien ou un texte alternatif ; et une CELLULE DE TABLEAU au-delà des colonnes
 * déclarées, que GitHub ne replie pas — il la JETTE). La famille des formes qui replient, avalent ou
 * jettent du texte est OUVERTE (`:382`) : on ne l'énumère pas. À la place :
 *
 *   (1) `docs/journal/README.md` est un fichier de `docs/journal/` comme les autres, et il est lu
 *       comme les autres — `JOURNAL_REFUSE`, ligne par ligne. Tout conteneur qui s'OUVRE à une autre
 *       ligne y est nommé au caractère qui l'ouvre (`<`, `[`, accent grave non refermé, ligne de
 *       seuls signes de bloc, début indenté), qu'une ligne vide le sépare du plancher ou non ;
 *   (2) LA LIGNE DU PLANCHER NE PORTE QUE LE PLANCHER (`MOTIF_LIGNE_DE_PLANCHER`). Elle ne passe pas
 *       sous la liste d'autorisation : elle est jugée par une règle PLUS STRICTE, et entièrement
 *       DÉRIVÉE du motif que `gov-etat.ts` lit. Rien ne peut donc l'entourer, la découper en cellules
 *       ni la mettre en infobulle — et le `>` de `**> 27**`, que la règle de structure refuserait, est
 *       admis parce qu'il est DANS le motif, pas parce qu'on l'a autorisé.
 */

/**
 * La ligne du plancher, ENTIÈRE : le motif, un point final facultatif, et rien d'autre. Ce qui reste
 * autour — une cellule de tableau, un titre de lien, un texte alternatif, un commentaire, une balise —
 * fait REFUSER. La seule liberté laissée à l'auteur est le nombre, et c'est le sujet.
 */
const MOTIF_LIGNE_DE_PLANCHER = new RegExp(`^${MOTIF_PLANCHER.source}\\.?$`);

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
const CHAINE: Forme = {
  ok: (v) => typeof v === 'string' && v.length > 0,
  attendu: 'une chaîne non vide',
};
const CHAINES: Forme = {
  ok: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  attendu: 'un tableau de chaînes',
};
const ENTIER: Forme = { ok: (v) => Number.isInteger(v), attendu: 'un entier' };
const OBJET: Forme = {
  ok: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  attendu: 'un objet',
};
const DICTIONNAIRE: Forme = {
  ok: (v) => OBJET.ok(v) && Object.values(v as object).every(CHAINES.ok),
  attendu: 'un objet de tableaux de chaînes',
};
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
      throw new SourceIllisible(
        `${chemin} n'est pas un fichier SUIVI par git : la garde ne lit pas ce que le dépôt ne porte pas.`
      );
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
      throw new SourceIllisible(
        `${chemin} porte un octet NUL : ce n'est pas du texte UTF-8 (UTF-16, binaire), aucun identifiant n'y serait vu.`
      );
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
    const valeur =
      doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>)[cle] : undefined;
    if (!Array.isArray(valeur)) {
      throw new SourceIllisible(
        `${chemin} ne porte pas de tableau « ${cle} » : un registre renommé n'est pas un registre vide.`
      );
    }
    valeur.forEach((entree, i) => {
      if (!OBJET.ok(entree))
        throw new SourceIllisible(`${chemin} — ${cle}[${i}] n'est pas un objet.`);
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

  // TOUT fichier de journal SUIVI est lu sous la liste d'autorisation, le README COMPRIS : c'est la
  // seule mécanique. Les ENTRÉES, elles, ne se lisent que dans les autres fichiers — le README est un
  // mode d'emploi, et une entrée qu'il porterait attesterait un lot sans jamais avoir été écrite par
  // une PR (`gov-etat.ts` la lirait, lui : l'écart est fail-closed, il n'exempte rien).
  const journaux = suivis.filter((f) => f.startsWith('docs/journal/') && f.endsWith('.md'));
  const fichiersDEntrees = journaux.filter((f) => f !== README_JOURNAL);
  if (fichiersDEntrees.length === 0) {
    throw new SourceIllisible(
      `aucun fichier de journal SUIVI sous docs/journal/ : l'attestation des lots n'aurait aucune source.`
    );
  }
  const texteDuReadme = texte(README_JOURNAL);
  const planchers = [...texteDuReadme.matchAll(MOTIF_PLANCHER)];
  if (planchers.length !== 1) {
    throw new SourceIllisible(
      planchers.length === 0
        ? `le plancher du journal est introuvable dans ${README_JOURNAL} (forme attendue : « Plancher : le journal couvre les PR de numéro **> <n>** »).`
        : `le plancher du journal est écrit ${planchers.length} fois dans ${README_JOURNAL} (${planchers.map((p) => `> ${p[1]}`).join(', ')}) : ` +
            `la garde ne choisit pas laquelle fait foi, et une ligne invisible au rendu en fait partie peut-être.`
    );
  }
  const plancher = planchers[0] as RegExpExecArray;
  // La ligne où le plancher est écrit, dans le README : la seule que la liste d'autorisation ne juge
  // pas — parce qu'une règle plus stricte la juge, et qu'elle est dérivée du même motif.
  const ligneDuPlancher = texteDuReadme.slice(0, plancher.index).split('\n').length - 1;
  const textesDeJournal = new Map<string, string>();
  for (const f of journaux) {
    const lignes = (f === README_JOURNAL ? texteDuReadme : texte(f)).split('\n');
    lignes.forEach((ligne, i) => {
      if (f === README_JOURNAL && i === ligneDuPlancher) {
        if (MOTIF_LIGNE_DE_PLANCHER.test(ligne)) return;
        throw new SourceIllisible(
          `${f}:${i + 1} — la ligne du plancher (« > ${plancher[1]} ») porte autre chose que le plancher : ` +
            `« ${ligne.slice(0, 80)} ». Ce nombre EXEMPTE des tâches de toute attestation de lot, et ce qui entoure ` +
            `le plancher sur sa ligne peut le retirer du rendu sans rien retirer du texte — GitHub JETTE une cellule ` +
            `de tableau au-delà des colonnes déclarées, met un titre de lien en infobulle, avale un commentaire. ` +
            `La ligne du plancher ne porte donc QUE le plancher.`
        );
      }
      for (const regle of JOURNAL_REFUSE) {
        const porte = regle.porte(ligne);
        if (porte === false) continue;
        throw new SourceIllisible(
          `${f}:${i + 1} porte ${regle.quoi} — ici ${JSON.stringify(porte)}, dans « ${ligne.slice(0, 80)} ». ` +
            (f === README_JOURNAL
              ? `Ce fichier porte le PLANCHER (« > ${plancher[1]} »), qui EXEMPTE des tâches de toute attestation de lot : ` +
                `le dépôt publié doit l'AFFICHER là où la garde le lit.`
              : `La garde refuse plutôt que de deviner lequel, du rendu ou d'elle, lit juste.`)
        );
      }
    });
    textesDeJournal.set(f, lignes.join('\n'));
  }

  return {
    taches: tableau<Tache>('docs/tasks.json', 'taches'),
    gates: tableau<Gate>('docs/gates.json', 'gates'),
    postes: tableau<Poste>('docs/agents.json', 'postes'),
    journal: fichiersDEntrees.map((f) => textesDeJournal.get(f) as string).join('\n'),
    plancherJournal: Number(plancher[1]),
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
    lignes.push(
      `   ${nature.startsWith('dette') ? '⛔' : '·'} ${nature} (${siennes.length}) — ${SENS[nature]}`
    );
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
  const lignes = [
    `❌ gov:attributions — ${fautes.length} attribution(s) rompue(s) (REQ-GOV-021, REQ-GOV-003) :\n`,
  ];
  fautes.forEach((f) => lignes.push(`   [${f.famille}] ${f.message}`));
  lignes.push(
    `\nUne attribution fausse envoie le lecteur suivant chercher dans un fichier que personne n'a touché.`
  );
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
const T_GABARIT: Tache = {
  ...T_RESOLUE,
  id: 'GOV-003',
  paths: ['docs/gouvernance/GOV-003'],
  statut: 'a_faire',
};
const T_GABARIT_BIS: Tache = { ...T_GABARIT, id: 'GOV-004', paths: ['docs/gouvernance/GOV-004'] };
/** Une tâche NON LIVRÉE aux paths MIXTES : un path réel qui ne porte pas le fichier jugé, et un gabarit. */
const T_MIXTE: Tache = {
  ...T_GABARIT,
  id: 'GOV-007',
  paths: ['docs/gouvernance/GOV-007', 'prisma/schema.prisma'],
};
/** Les mêmes, LIVRÉES : « pas encore connu » est faux, leur attribution est jugée. */
const T_LIVREE_GABARIT: Tache = { ...T_GABARIT, statut: 'fusionnee' };
const T_LIVREE_MIXTE: Tache = { ...T_MIXTE, statut: 'fusionnee' };
const JOURNAL = '## PR #31 — 2026-09-10 — feat(GOV-024): lot L-1-04\n\n**Fait.** Neuf tâches.\n';
const JOURNAL_MULTI =
  '## PR #31 — 2026-09-05 — feat(GOV-024): lots L-1-04, L-1-05 et L-1-06\n\n**Fait.** Neuf tâches.\n';
const GATE_GABARIT = {
  id: 'gov:identifiants',
  script: 'scripts/gates/gov-identifiants.ts',
  tache: 'GOV-003',
};
/** Le site de `GATE_GABARIT` tel que l'analyse le compose : la clé sous laquelle sa dette se fige. */
const SITE_GATE_GABARIT = siteDansGates(`docs/gates.json:${GATE_GABARIT.id}`, GATE_GABARIT.script);
/** Une gate de GOV-101 (réciproque) dont la prose nomme GOV-003, et le site de cette mention, script compris. */
const GATE_PROSE = {
  id: 'g',
  script: 'scripts/gates/autre.ts',
  tache: 'GOV-101',
  verifie: 'étendue par GOV-003',
};
const SITE_PROSE = siteDansGates(`docs/gates.json:${GATE_PROSE.id}.verifie`, GATE_PROSE.script);
/** Les lots que nomme le titre de `JOURNAL_MULTI`, figés comme la dette de lot les fige. */
const LOTS_MULTI = ['L-1-04', 'L-1-05', 'L-1-06'];
const RAISON = 'une raison qui dit pourquoi, relisible par la session suivante';
const DEPOT_ETRANGER = Object.keys(DEPOTS).find(
  (r) => r !== DEPOT_LOCAL && DEPOTS[r] !== null
) as string;
const entete = (lignes: string[], fichier = 'scripts/gates/porte.ts'): Entete[] => [
  { fichier, lignes },
];
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
    sources: {
      taches: [T_RESOLUE],
      gates: [{ id: 'porte', script: 'scripts/gates/porte.tsx', tache: 'GOV-100' }],
    },
    nomme: ['scripts/gates/porte.tsx'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une NOUVELLE non-réciprocité, à côté d’une dette déclarée, rougit quand même',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII, { id: 'nouvelle', script: 'scripts/gates/nouvelle.ts', tache: 'GOV-100' }],
      dettesGate: [
        {
          gate: 'detectPii',
          tache: 'GOV-100',
          script: 'scripts/gates/detect-pii.ts',
          raison: RAISON,
        },
      ],
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
      referencePr({
        id: 'GOV-100',
        repo: DEPOT_LOCAL,
        statut: 'fusionnee',
        pr: 31,
        attestation: null,
      }) as string,
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
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 28 }],
      journal: JOURNAL,
      plancherJournal: 27,
    },
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
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-9-98', pr: 31 }],
      journal: `${JOURNAL}Le corps cite aussi L-9-98.\n`,
    },
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
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31, lotsDuTitre: LOTS_MULTI }],
    },
    nomme: ['L-1-06'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une dette de lot figée sur les lots d’un titre n’absout plus quand le titre, réécrit, nomme un AUTRE lot',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }],
      journal: JOURNAL_MULTI.replace('lots L-1-04, L-1-05 et L-1-06', 'lot L-1-06'),
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31, lotsDuTitre: LOTS_MULTI }],
    },
    nomme: ['L-1-04', ancreDeJournal(31), 'ne nomme pas'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'un titre à DEUX espaces n’est pas une entrée — `gov:etat` ne le lit pas non plus',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 32 }],
      journal: `${JOURNAL}${ancreDeJournal(32).replace(' ', '  ')} — lot L-9-99\n`,
    },
    nomme: ['L-9-99', ancreDeJournal(32), 'aucune entrée'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'un SECOND titre visible de la même PR ne remplace pas le premier : leurs lots comptent ensemble',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 31 }],
      journal: `${JOURNAL}\n${ancreDeJournal(31)} — 2026-09-11 — lot L-9-99\n`,
    },
    nomme: ['L-9-99', 'plusieurs lots'],
  },
  {
    famille: 'lot_non_atteste',
    quoi: 'une dette de lot figée sur un titre SANS lot n’absout plus quand le titre, réécrit, en nomme un AUTRE : les lots se comparent entiers, jamais par préfixe',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-05', pr: 33 }],
      journal: `${ancreDeJournal(33)} — 2026-09-12 — chore(GOV-014): lot L-1-04\n`,
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-05', pr: 33, lotsDuTitre: [] }],
    },
    nomme: ['L-1-05', ancreDeJournal(33), 'ne nomme pas'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de lot figée qui ne mesure plus rien (le titre atteste maintenant le lot)',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 31 }],
      journal: JOURNAL,
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31, lotsDuTitre: LOTS_MULTI }],
    },
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
    sources: {
      taches: [T_LIVREE_MIXTE],
      gates: [{ id: 'gov:pr', script: 'scripts/gates/gov-pr.ts', tache: 'GOV-007' }],
    },
    nomme: ['gov:pr', 'GOV-007', 'DETTE_GABARIT_LIVREE'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une dette figée en MENTION n’absout pas la relation garde <-> tâche du même lieu',
    sources: {
      taches: [T_LIVREE_GABARIT],
      gates: [GATE_GABARIT],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: SITE_GATE_GABARIT, n: 1 }],
    },
    nomme: ['gov:identifiants'],
  },
  {
    famille: 'gate_non_reciproque',
    quoi: 'une dette de gate figée n’absout pas la MÊME gate repointée vers un AUTRE script : le site porte le script',
    sources: {
      taches: [T_LIVREE_GABARIT],
      gates: [{ ...GATE_GABARIT, script: 'scripts/gates/gov-pr.ts' }],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'gate', ou: SITE_GATE_GABARIT, n: 1 }],
    },
    nomme: ['gov:identifiants', 'scripts/gates/gov-pr.ts', 'DETTE_GABARIT_LIVREE'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'une dette figée sur une chaîne de docs/gates.json n’absout pas la même mention quand la gate est repointée vers un AUTRE script',
    sources: {
      taches: [
        { ...T_VOISINE, paths: ['scripts/gates/autre.ts', 'scripts/gates/porte.ts'] },
        T_LIVREE_GABARIT,
      ],
      gates: [{ ...GATE_PROSE, script: 'scripts/gates/porte.ts' }],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: SITE_PROSE, n: 1 }],
    },
    nomme: [
      'docs/gates.json:g.verifie',
      'scripts/gates/porte.ts',
      'GOV-003',
      'DETTE_GABARIT_LIVREE',
    ],
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
    sources: {
      taches: [T_RESOLUE, { ...T_GABARIT, statut: undefined }],
      entetes: entete(['// étendue par GOV-003']),
    },
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
      gates: [
        {
          id: 'gov:plan-state',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          verifie: 'la lacune que GOV-033 porte',
        },
      ],
    },
    nomme: ['docs/gates.json:gov:plan-state.verifie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un élément d’un TABLEAU d’une entrée de docs/gates.json est lu (`alias`)',
    sources: {
      taches: [T_RESOLUE],
      gates: [
        {
          id: 'g',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          alias: ['gov:g', 'GOV-033'],
        },
      ],
    },
    nomme: ['docs/gates.json:g.alias[1]', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une chaîne d’un OBJET imbriqué dans une entrée de docs/gates.json est lue',
    sources: {
      taches: [T_RESOLUE],
      gates: [
        {
          id: 'g',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          preuveRouge: { sortie: 'la lacune de GOV-033' },
        },
      ],
    },
    nomme: ['docs/gates.json:g.preuveRouge.sortie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une chaîne d’un OBJET posé DANS un TABLEAU est lue',
    sources: {
      taches: [T_RESOLUE],
      gates: [
        {
          id: 'g',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          exemples: [{ sortie: 'la lacune de GOV-033' }],
        },
      ],
    },
    nomme: ['docs/gates.json:g.exemples[0].sortie', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un élément d’un TABLEAU posé DANS un OBJET est lu',
    sources: {
      taches: [T_RESOLUE],
      gates: [
        {
          id: 'g',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          preuveRouge: { lignes: ['rien', 'GOV-033'] },
        },
      ],
    },
    nomme: ['docs/gates.json:g.preuveRouge.lignes[1]', 'GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'un identifiant écrit comme NOM DE CLÉ d’une entrée de docs/gates.json est lu',
    sources: {
      taches: [T_RESOLUE],
      gates: [
        { id: 'g', script: 'scripts/gates/porte.ts', tache: 'GOV-100', 'GOV-033': 'porté ici' },
      ],
    },
    nomme: ['docs/gates.json:g.GOV-033 (nom de clé)'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN fichier n’absout pas le même identifiant dans un AUTRE',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [
        { ou: 'scripts/gates/gov-tasks.ts', id: 'GOV-017', nature: 'citation', raison: RAISON },
      ],
    },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-017'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une citation déclarée pour UN identifiant n’absout pas un AUTRE identifiant du même fichier',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017 et GOV-033']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: RAISON },
      ],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_non_resolue',
    quoi: 'une déclaration « contexte » n’absout pas un identifiant qui ne résout pas',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-033']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'contexte', raison: RAISON },
      ],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'un en-tête nomme une tâche qui EXISTE et à qui le fichier n’appartient pas',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      entetes: entete(['// arbitrage porté par GOV-101']),
    },
    nomme: ['scripts/gates/porte.ts:1', 'GOV-101'],
  },
  {
    famille: 'mention_hors_paths',
    quoi: 'la prose d’une gate nomme une tâche qui existe et à qui le script n’appartient pas',
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      gates: [
        {
          id: 'g',
          script: 'scripts/gates/porte.ts',
          tache: 'GOV-100',
          verifie: 'portée par GOV-101',
        },
      ],
    },
    nomme: ['docs/gates.json:g.verifie', 'GOV-101'],
  },
  // Une déclaration qui vise un identifiant QUI NE RÉSOUT PAS n'absout pas une tâche résolue hors de ses paths.
  ...(['citation', 'reservation', 'dette'] as const).map((nature): Temoin => ({
    famille: 'mention_hors_paths',
    quoi: `une déclaration « ${nature} » n’absout pas une tâche RÉSOLUE nommée hors de ses paths`,
    sources: {
      taches: [T_RESOLUE, T_VOISINE],
      entetes: entete(['// GOV-101']),
      citations: [{ ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature, raison: RAISON }],
    },
    nomme: ['GOV-101'],
  })),
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont l’identifiant s’est mis à résoudre — le backlog a bougé',
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'GOV-033' }],
      entetes: entete(['// GOV-033']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'reservation', raison: RAISON },
      ],
    },
    nomme: ['GOV-033', 'RÉSOUT maintenant'],
  },
  {
    famille: 'citation_perimee',
    quoi: 'une citation déclarée dont le site ne porte plus l’identifiant',
    sources: {
      entetes: entete(['// plus rien ici']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-033', nature: 'citation', raison: RAISON },
      ],
    },
    nomme: ['GOV-033'],
  },
  {
    famille: 'dette_perimee',
    quoi: 'une dette de réciprocité déclarée mais réparée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['scripts/gates/detect-pii.ts'] }],
      gates: [PII],
      dettesGate: [
        {
          gate: 'detectPii',
          tache: 'GOV-100',
          script: 'scripts/gates/detect-pii.ts',
          raison: RAISON,
        },
      ],
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
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: ' '.repeat(25) },
      ],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'le renvoi « idem. » n’est pas une raison',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-017', nature: 'citation', raison: 'idem.' },
      ],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une raison d’UN caractère sous le minimum est refusée',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-017']),
      citations: [
        {
          ou: 'scripts/gates/porte.ts',
          id: 'GOV-017',
          nature: 'citation',
          raison: 'r'.repeat(RAISON_MINIMALE - 1),
        },
      ],
    },
    nomme: ['GOV-017'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une dette de réciprocité sans raison est refusée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII],
      dettesGate: [
        { gate: 'detectPii', tache: 'GOV-100', script: 'scripts/gates/detect-pii.ts', raison: '' },
      ],
    },
    nomme: ['detectPii'],
  },
  {
    famille: 'declaration_sans_raison',
    quoi: 'une dette de réciprocité dont la raison est faite de blancs est refusée',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [PII],
      dettesGate: [
        {
          gate: 'detectPii',
          tache: 'GOV-100',
          script: 'scripts/gates/detect-pii.ts',
          raison: ' '.repeat(25),
        },
      ],
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
      taches: [
        {
          ...T_RESOLUE,
          tests: { 'REQ-GOV-900': ['tests/integration/index-partiel.spec.ts#un cas'] },
        },
      ],
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
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'gate', ou: SITE_GATE_GABARIT, n: 1 }],
    },
    exemptions: ['dette_gabarit_livree_gate'],
  },
  {
    quoi: 'une chaîne de docs/gates.json nomme une tâche LIVRÉE aux paths gabarit, figée sous son site, script de la gate compris',
    sources: {
      taches: [T_VOISINE, T_LIVREE_GABARIT],
      gates: [GATE_PROSE],
      dettesGabarit: [{ tache: 'GOV-003', lieu: 'mention', ou: SITE_PROSE, n: 1 }],
    },
    exemptions: ['dette_gabarit_livree_mention'],
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
      dettesLot: [{ tache: 'GOV-100', lot: 'L-1-04', pr: 31, lotsDuTitre: LOTS_MULTI }],
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
    exemptions: [
      'mention_paths_non_resolus',
      'mention_paths_non_resolus',
      'mention_paths_non_resolus',
      'mention_paths_non_resolus',
    ],
  },
  {
    quoi: 'une tâche VOISINE déclare la même garde sans en être porteuse',
    sources: {
      taches: [
        { ...T_RESOLUE, id: 'GOV-003', paths: ['scripts/gates/gov-identifiants.ts'] },
        { ...T_RESOLUE, id: 'GOV-025', paths: ['scripts/gates/gov-identifiants.ts'] },
      ],
      gates: [
        { id: 'gov:identifiants', script: 'scripts/gates/gov-identifiants.ts', tache: 'GOV-003' },
      ],
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
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-1-04', pr: 27 }],
      journal: JOURNAL,
      plancherJournal: 27,
    },
    exemptions: ['lot_sous_plancher'],
  },
  {
    quoi: 'une tâche livrée dans un AUTRE dépôt ne se confronte pas au journal d’ici — exemptée en le disant',
    sources: {
      taches: [{ ...T_RESOLUE, lot: 'L-9-99', pr: 998, repo: DEPOT_ETRANGER }],
      journal: JOURNAL,
    },
    exemptions: ['autre_depot'],
  },
  {
    quoi: 'LA NÉGATION QUI PROTÈGE : la garde qui NOMME la forme scindée qu’elle interdit (raison AU minimum)',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// aucun identifiant scindé (`GOV-017`)'], 'scripts/gates/gov-tasks.ts'),
      citations: [
        {
          ou: 'scripts/gates/gov-tasks.ts',
          id: 'GOV-017',
          nature: 'citation',
          raison: 'r'.repeat(RAISON_MINIMALE),
        },
      ],
    },
    exemptions: ['citation'],
  },
  {
    quoi: 'un identifiant RÉSERVÉ, déclaré comme tel',
    sources: {
      taches: [T_RESOLUE],
      entetes: entete(['// GOV-034 : réservé']),
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-034', nature: 'reservation', raison: RAISON },
      ],
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
      citations: [
        { ou: 'scripts/gates/porte.ts', id: 'GOV-101', nature: 'contexte', raison: RAISON },
      ],
    },
    exemptions: ['contexte'],
  },
  {
    quoi: 'un identifiant qui RÉSOUT et dont le fichier est dans ses paths',
    sources: { taches: [T_RESOLUE], entetes: entete(['// porte.ts (GOV-100)']) },
  },
  {
    quoi: 'un identifiant d’EXIGENCE n’est pas un identifiant de tâche (REQ-GOV-003, REQ-DM-003)',
    sources: {
      taches: [{ ...T_RESOLUE, id: 'DM-01' }],
      entetes: entete(['// porte REQ-GOV-003 et REQ-DM-003']),
    },
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
    sources: {
      taches: [T_RESOLUE, { ...T_RESOLUE, id: 'DM-01' }],
      entetes: entete(['// DM-03-Z']),
    },
  },
  {
    quoi: 'une dette déclarée et toujours mesurée, dont la prose nomme son porteur : une seule exemption',
    sources: {
      taches: [{ ...T_RESOLUE, paths: ['packages/contracts/'] }],
      gates: [{ ...PII, verifie: 'porté par GOV-100' }],
      dettesGate: [
        {
          gate: 'detectPii',
          tache: 'GOV-100',
          script: 'scripts/gates/detect-pii.ts',
          raison: RAISON,
        },
      ],
    },
    exemptions: ['dette_gate'],
  },
];

// ── la preuve du CHARGEMENT : un journal que le rendu et la garde liraient autrement est refusé ─
//
// `analyser` ne voit jamais ces journaux : `chargerSources` les refuse avant. Chaque cas est chargé sur
// des registres vides, par le lecteur injecté ; `nomme` est ce que le refus doit porter, `[]` : il est LU.

/**
 * Un journal posé seul, à côté de registres vides. `fichiers` ajoute d'autres fichiers SUIVIS du journal ;
 * `plancher` est celui du README (0 par défaut) ; `nomme` est ce que le refus doit porter, `[]` : il est LU.
 */
type CasDeJournal = {
  quoi: string;
  journal: string;
  nomme: string[];
  fichiers?: Record<string, string>;
  plancher?: number;
  /** Le README ENTIER, quand c'est le plancher lui-même qu'on éprouve ; sinon, la seule ligne visible. */
  readme?: string;
};
const JOURNAL_DE_PREUVE = 'docs/journal/2026-09.md';
/** Un titre d'entrée EXACT, pour une PR que `JOURNAL` ne porte pas : chaque panne le déforme d'une seule façon. */
const P32 = `${ancreDeJournal(32)} — 2026-09-11 — lot L-9-99`;
const [NBSP, ZWSP, RC, TAB, SEP_LIGNE, SELECTEUR] = [0xa0, 0x200b, 0x0d, 0x09, 0x2028, 0xfe0f].map(
  (cp) => String.fromCodePoint(cp)
);
const ligne5 = `${JOURNAL_DE_PREUVE}:5`;
/** La ligne du plancher, au nombre donné, telle que le README la porte. Écrite UNE fois, ici. */
const lignePlancher = (n: number): string =>
  `Plancher : le journal couvre les PR de numéro **> ${n}**`;
/** Les mots par lesquels chaque règle de `JOURNAL_REFUSE` se nomme. */
const [CARACTERE, STRUCTURE, DEBUT, TITRE_AUTRE, FAUX_PR, DIESE, LU_PAR_ETAT, AFFICHE, BLOC] = [
  'liste d’autorisation',
  'change la structure rendue',
  'un début de ligne',
  'n’est pas un titre d’entrée',
  's’ouvre par « PR » et un numéro',
  'ailleurs qu’en tête de ligne',
  'gov:etat lit un titre',
  'ne s’affiche pas tel qu’il s’écrit',
  'de seuls signes de bloc',
];
const JOURNAUX_REFUSES: CasDeJournal[] = [
  // ── un caractère hors de la liste d'autorisation ──
  {
    quoi: 'F3 : une espace INSÉCABLE entre « PR » et « # » — le rendu affiche le même titre',
    journal: `${JOURNAL}\n${P32.replace('R #', `R${NBSP}#`)}\n`,
    nomme: [ligne5, CARACTERE, 'U+00A0'],
  },
  {
    quoi: 'F3 : une espace de largeur nulle dans « PR »',
    journal: `${JOURNAL}\n${P32.replace('PR', `P${ZWSP}R`)}\n`,
    nomme: [ligne5, CARACTERE, 'U+200B'],
  },
  {
    quoi: 'F3 (c) : `<span></span>`, un retour chariot NU, puis un titre sur la même ligne — gov:etat le lit',
    journal: `${JOURNAL}<span></span>${RC}${P32}\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:4`, CARACTERE, 'U+000D'],
  },
  {
    quoi: 'un séparateur de ligne Unicode, que `^` en mode `m` lit comme une fin de ligne',
    journal: `${JOURNAL}Texte.${SEP_LIGNE}${P32}\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:4`, CARACTERE, 'U+2028'],
  },
  {
    quoi: 'une tabulation entre les dièses et « PR »',
    journal: `${JOURNAL}\n${P32.replace('## ', `##${TAB}`)}\n`,
    nomme: [ligne5, CARACTERE, 'U+0009'],
  },
  {
    quoi: 'un sélecteur emoji qui ne suit pas `⚠` : un caractère invisible',
    journal: `${JOURNAL}\n${P32.replace('PR', `P${SELECTEUR}R`)}\n`,
    nomme: [ligne5, CARACTERE, 'U+FE0F'],
  },
  // ── hors span, un caractère de structure ──
  {
    quoi: 'deux spans sur la ligne, un `<h2>` ENTRE eux : il est hors span (un span se referme au PREMIER accent grave de même longueur)',
    journal: `${JOURNAL}\n\`x\` <h2>${P32.slice(3)}</h2> \`y\`\n`,
    nomme: [ligne5, STRUCTURE, '"<"'],
  },
  {
    quoi: 'trois accents graves que rien ne referme, un `<h2>`, puis un accent grave seul : un span ouvert DANS la suite en laisse le début hors span',
    journal: `${JOURNAL}\n\`\`\` <h2>${P32.slice(3)}</h2> \`\n`,
    nomme: [ligne5, STRUCTURE, '"`"'],
  },
  {
    quoi: 'deux accents graves que rien ne referme, un `<h2>`, puis un accent grave seul : une suite s’ouvre ENTIÈRE',
    journal: `${JOURNAL}\n\`\` <h2>${P32.slice(3)}</h2> \`\n`,
    nomme: [ligne5, STRUCTURE, '"`"'],
  },
  {
    quoi: 'F3 (exactitude) : le titre écrit en `<h2>` — affiché, ni lu ni refusé sur 8fb190e',
    journal: `${JOURNAL}\n<h2>${P32.slice(3)}</h2>\n\n<details>\n${ancreDeJournal(32)} — 2026-09-11 — lot L-9-98\n</details>\n`,
    nomme: [ligne5, STRUCTURE, '"<"'],
  },
  {
    quoi: 'F3 : « PR&#32;# » — une entité',
    journal: `${JOURNAL}\n${P32.replace('R #', 'R&#32;#')}\n`,
    nomme: [ligne5, STRUCTURE, '"&"'],
  },
  {
    quoi: 'F3 : « PR \\# » — un échappement, rendu en titre identique',
    journal: `${JOURNAL}\n${P32.replace('#32', '\\#32')}\n`,
    nomme: [ligne5, STRUCTURE, '"\\\\"'],
  },
  {
    quoi: 'F3 : « > ## PR # » — un titre dans une citation',
    journal: `${JOURNAL}\n> ${P32}\n`,
    nomme: [ligne5, STRUCTURE, '">"'],
  },
  {
    quoi: 'un lien vide dans un titre d’entrée : `[](L-9-98)` cache au rendu le lot que la garde lit',
    journal: `${JOURNAL}\n${ancreDeJournal(32)} — 2026-09-11 — lot [](L-9-98)\n`,
    nomme: [ligne5, STRUCTURE, '"["'],
  },
  {
    quoi: 'F3 : un faux titre replié dans un bloc de code clôturé par accents graves',
    journal: `${JOURNAL}\n\`\`\`\n${P32}\n\`\`\`\n`,
    nomme: [ligne5, STRUCTURE, '"`"'],
  },
  {
    quoi: 'passe précédente : un titre caché dans un commentaire HTML fermé',
    journal: `${JOURNAL}<!--\n${P32}\n-->\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:4`, STRUCTURE],
  },
  {
    quoi: 'passe précédente : un titre caché dans un commentaire HTML jamais fermé',
    journal: `${JOURNAL}<!--\n${P32}\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:4`, STRUCTURE],
  },
  // ── un début de ligne qui ouvre un bloc ──
  {
    quoi: 'un titre de PR précédé d’une espace',
    journal: `${JOURNAL}\n ${P32}\n`,
    nomme: [ligne5, DEBUT, '" "'],
  },
  {
    quoi: 'F3 : un faux titre replié dans un bloc de code clôturé par `~~~`',
    journal: `${JOURNAL}\n~~~\n${P32}\n~~~\n`,
    nomme: [ligne5, DEBUT, '"~~~"'],
  },
  // ── un titre qui n'est pas un titre d'entrée et porte un `#` ──
  {
    quoi: 'F2 (e8v3) : un titre ajouté à deux espaces, le titre réel encadré par `<!--` et `-->` entre accents graves',
    journal: `${P32.replace(' ', '  ')}\n\nIl s'ouvre par \`<!--\`.\n\n${JOURNAL}\nIl se ferme par \`-->\`.\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:1`, TITRE_AUTRE],
  },
  {
    quoi: 'F2 : deux espaces entre « PR » et « # »',
    journal: `${JOURNAL}\n${P32.replace('R #', 'R  #')}\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  {
    quoi: 'mutation (drapeau i retiré) : « ## pr # » en minuscules',
    journal: `${JOURNAL}\n${P32.replace('PR', 'pr')}\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  {
    quoi: 'mutation (jointure stricte) : « ## PR#32 », collé',
    journal: `${JOURNAL}\n${P32.replace('R #', 'R#')}\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  {
    quoi: 'F3 : « ## **PR** # » — l’emphase, rendue en titre',
    journal: `${JOURNAL}\n${P32.replace('PR', '**PR**')}\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  {
    quoi: 'un titre de PR à trois dièses',
    journal: `${JOURNAL}\n#${P32}\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  {
    quoi: 'un titre de PR sans date : le rendu l’affiche, gov:etat ne le lit pas',
    journal: `${JOURNAL}\n${ancreDeJournal(32)} lot L-9-99\n`,
    nomme: [ligne5, TITRE_AUTRE],
  },
  // ── un `#` de titre ailleurs qu'en tête de ligne ──
  {
    quoi: 'F3 : « - ## PR # » — un titre dans un élément de liste',
    journal: `${JOURNAL}\n- ${P32}\n`,
    nomme: [ligne5, DIESE],
  },
  {
    quoi: 'un titre dans un élément de liste ORDONNÉE',
    journal: `${JOURNAL}\n1. ${P32}\n`,
    nomme: [ligne5, DIESE],
  },
  {
    quoi: 'un titre d’entrée suivi d’une séquence fermante « ## »',
    journal: `${JOURNAL}\n${P32} ##\n`,
    nomme: [ligne5, DIESE],
  },
  // ── une ligne que gov:etat lit comme titre ──
  {
    quoi: 'simplicite : une ligne « PR #<n> — date — » sous un titre de section, que gov:etat prend pour une entrée',
    journal: `${JOURNAL}\n## Rectificatif\n\n${P32.slice(3)}\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:7`, LU_PAR_ETAT],
  },
  // ── un titre d'entrée qui ne s'affiche pas tel qu'il s'écrit ──
  {
    quoi: 'une emphase `**` collée à un lot du titre : « L-9-99**8** » s’affiche L-9-998, la garde lit L-9-99',
    journal: `${JOURNAL}\n${P32}**8**\n`,
    nomme: [ligne5, AFFICHE, '"*"'],
  },
  {
    quoi: 'une emphase `_` dans un titre d’entrée',
    journal: `${JOURNAL}\n${P32}_8_\n`,
    nomme: [ligne5, AFFICHE, '"_"'],
  },
  {
    quoi: 'un barré `~` dans un titre d’entrée',
    journal: `${JOURNAL}\n${P32} ~~L-9-98~~\n`,
    nomme: [ligne5, AFFICHE, '"~"'],
  },
  {
    quoi: 'un span de code PRÉCÉDÉ d’un lot du titre, sans espace : « L-9-99`8` »',
    journal: `${JOURNAL}\n${P32}\`8\`\n`,
    nomme: [ligne5, AFFICHE, '"`"'],
  },
  {
    quoi: 'un span de code SUIVI de texte, sans espace : « `L-9-9`8 »',
    journal: `${JOURNAL}\n${ancreDeJournal(32)} — 2026-09-11 — lot \`L-9-9\`8\n`,
    nomme: [ligne5, AFFICHE, '"`"'],
  },
  // ── un titre que le rendu affiche comme une entrée, et que personne ne lit ──
  {
    quoi: 'securite (dette 4) : « # PR 32 — date — … », le titre d’entrée privé du croisillon de son numéro',
    journal: `${JOURNAL}\n# ${P32.slice(3).replace('PR #', 'PR ')}\n`,
    nomme: [ligne5, FAUX_PR],
  },
  {
    quoi: 'le même sans date, à six dièses : le rendu l’affiche encore comme l’entrée d’une PR',
    journal: `${JOURNAL}\n###### PR 32 lot L-9-99\n`,
    nomme: [ligne5, FAUX_PR],
  },
  // ── une ligne de seuls signes de bloc : soulignement, filet, EN-TÊTE (front matter) ──
  {
    quoi: 'un titre souligné `---`',
    journal: `${JOURNAL}\nUn titre souligné\n---\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:6`, BLOC],
  },
  {
    quoi: 'un titre souligné `===`',
    journal: `${JOURNAL}\nUn titre souligné\n===\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:6`, BLOC],
  },
  {
    quoi: 'F4 (securite) : un en-tête YAML replie un titre d’entrée — le rendu n’en montre qu’un tableau clé/valeur',
    journal: `---\ntitre: journal du lot L-9-99\n${P32}\n\n---\n\n${JOURNAL}`,
    nomme: [`${JOURNAL_DE_PREUVE}:1`, BLOC, '"---"'],
  },
  {
    quoi: 'F4 : le même en-tête, avec un COMMENTAIRE YAML (`# …`) que le rendu n’affiche nulle part',
    journal: `---\ntitre: journal du lot L-9-99\n# le lot, rectifie\n${P32}\n\n---\n\n${JOURNAL}`,
    nomme: [`${JOURNAL_DE_PREUVE}:1`, BLOC, '"---"'],
  },
  {
    quoi: 'F4 : un en-tête TOML `+++`, qui n’a même pas besoin d’une ligne vide pour se refermer',
    journal: `+++\ntitre = "journal du lot L-9-99"\n${P32}\n+++\n\n${JOURNAL}`,
    nomme: [`${JOURNAL_DE_PREUVE}:1`, BLOC, '"+++"'],
  },
  {
    quoi: 'F4 : l’en-tête dans un fichier de journal NEUF — la garde lit TOUT journal suivi',
    journal: JOURNAL,
    fichiers: {
      'docs/journal/2026-10.md': `---\ntitre: journal du lot L-9-99\n${P32}\n\n---\n\n# Journal — octobre 2026\n`,
    },
    nomme: ['docs/journal/2026-10.md:1', BLOC, '"---"'],
  },
  {
    quoi: 'un filet `- - -` espacé : trois signes et des espaces, que le rendu ne montre pas comme une ligne',
    journal: `${JOURNAL}\nUn titre souligné\n- - -\n`,
    nomme: [`${JOURNAL_DE_PREUVE}:6`, BLOC, '"- - -"'],
  },
  {
    quoi: 'un filet `***`, puis `___` : les deux autres graphies de la coupure',
    journal: `${JOURNAL}\n***\n___\n`,
    nomme: [ligne5, BLOC, '"***"'],
  },
  // ── la portée de l'exception dérivée : le README, et lui seul ──
  {
    quoi: 'mutation (exception appliquée partout) : la PHRASE du plancher écrite dans un fichier d’ENTRÉES — son `>` hors span est refusé comme n’importe quel autre, l’exception ne vaut que là où le plancher se lit',
    journal: `${JOURNAL}\n${lignePlancher(9)}\n`,
    nomme: [ligne5, STRUCTURE, '">"'],
  },
  // ── la portée : chaque fichier de journal, sous le plancher comme au-dessus ──
  {
    quoi: 'mutation (refus au premier fichier) : la panne dans un SECOND fichier suivi du journal',
    journal: JOURNAL,
    fichiers: { 'docs/journal/2026-10.md': `# Journal — octobre 2026\n\n- ${P32}\n` },
    nomme: ['docs/journal/2026-10.md:3', DIESE],
  },
  {
    quoi: 'mutation (refus au-dessus du plancher) : la panne dans une entrée SOUS le plancher',
    journal: `${JOURNAL}\n- ${P32}\n`,
    plancher: 99,
    nomme: [ligne5, DIESE],
  },
];
const JOURNAUX_LUS: CasDeJournal[] = [
  {
    quoi: 'un journal réel : spans de code porteurs de `<`, `<!--`, `\\`, `## PR #` et `---`, lignes qui COMMENCENT par « PR # » ou « **Fait.** », liste, emphase en prose, titre de section, lettres et signes admis',
    journal:
      `# Journal — septembre 2026\n\n${JOURNAL}\n` +
      `Le jeton #\`45\` est lu, et \`a\`\` b\` est UN span.\n` +
      `Un nom \`<x>\` et \`:<chemin>\`, \`a -> b\`, \`<!--\` puis \`-->\`, \`\\#\` et \`## PR #99\`, \`\` \` \`\`.\n` +
      `Un en-tête s'ouvre par \`---\` et un filet s'écrit \`***\` : entre accents graves, ils sont du texte.\n` +
      `PR #41, elle en nomme trois : #36, #41 et #44.\n**Fait.** La PR #41 est lue.\n- La PR #41, en liste.\n\n` +
      `⚠${SELECTEUR} **Choix.** À la 3ᵉ passe, « œ », É, ç — −1 → 2 ↔ 3, § 4 · fin — un tiret seul, - , en prose.\n\n## Autre section\n\n` +
      `${P32}, \`partners/ADR-0007\` sur la branche\n`,
    nomme: [],
  },
];

const L9 = lignePlancher(9);
const ligneReadme = (n: number) => `${README_JOURNAL}:${n}`;
/** Les mots par lesquels la règle de la LIGNE du plancher se nomme. */
const PLANCHER_SEUL = 'porte autre chose que le plancher';

/**
 * F5/F6 — le plancher écrit UNE SEULE FOIS, dans un conteneur que le rendu n'affiche pas. Le journal,
 * lui, est intact : c'est l'INTERRUPTEUR qu'on cache, et le nombre caché (9) exempterait des entrées que
 * le plancher visible atteste. AUCUN de ces cas n'est reconnu comme conteneur — il n'y a que deux règles :
 * la ligne qui OUVRE est nommée par la liste d'autorisation (qu'une ligne vide la sépare du plancher ou
 * non : la panne de simplicite `5220172093`), et la LIGNE DU PLANCHER ne porte que le plancher (les quatre
 * formes de securite `5220321404`, dont la cellule de tableau que GitHub ne replie pas mais JETTE).
 */
const PLANCHERS_REFUSES: CasDeJournal[] = [
  {
    quoi: 'F5 : le plancher, UNE seule fois, dans un commentaire HTML d’une ligne — GitHub ne le rend pas',
    journal: JOURNAL,
    readme: `# Le journal\n\n## Plancher\n\n<!-- ${L9} -->\n`,
    nomme: [ligneReadme(5), PLANCHER_SEUL],
  },
  {
    quoi: 'F5 : le commentaire HTML ouvert à la ligne d’AVANT, derrière du texte — la ligne du plancher, elle, est nue',
    journal: JOURNAL,
    readme: `# Le journal\n\nTexte <!--\n${L9}\n-->\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'F5 : le plancher dans un en-tête (front matter), que le rendu replie en tableau clé/valeur',
    journal: JOURNAL,
    readme: `---\ntitre: le journal\n${L9}\n---\n\n# Le journal\n`,
    nomme: [ligneReadme(1), BLOC, '"---"'],
  },
  {
    quoi: 'mutation (en-tête JAMAIS refermé) : le rendu replie tout, la garde lirait tout',
    journal: JOURNAL,
    readme: `+++\ntitre = "le journal"\n${L9}\n`,
    nomme: [ligneReadme(1), BLOC, '"+++"'],
  },
  {
    quoi: 'F5 : le plancher dans un bloc HTML brut, ouvert par une balise à la ligne d’avant',
    journal: JOURNAL,
    readme: `# Le journal\n\n<div hidden>\n${L9}\n</div>\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'simplicite (5220172093) : le MÊME bloc HTML, une LIGNE VIDE après la balise — le bloc se ferme au rendu, la section reste repliée, et l’énumération de conteneurs le lisait',
    journal: JOURNAL,
    readme: `# Le journal\n\n<div hidden>\n\n${L9}\n\n</div>\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'simplicite : une section `<details><summary>` REPLIÉE par GitHub, le plancher derrière une ligne vide',
    journal: JOURNAL,
    readme: `# Le journal\n\n<details><summary>Reglages</summary>\n\n${L9}\n\n</details>\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'simplicite : le bloc HTML, une ligne vide, et le plancher à la FIN d’un paragraphe — la balise n’est plus le début de son bloc',
    journal: JOURNAL,
    readme: `# Le journal\n\n<div hidden>\n\nNote interne.\n${L9}\n\n</div>\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'F5 : une balise sur la ligne du plancher, dans un paragraphe qui, lui, ne s’ouvre pas par « < »',
    journal: JOURNAL,
    readme: `# Le journal\n\nUn paragraphe.\n${L9} <span hidden>caché</span>\n`,
    nomme: [ligneReadme(4), PLANCHER_SEUL],
  },
  {
    quoi: 'F5 : le plancher en définition de lien-référence — du Markdown que le rendu n’affiche nulle part',
    journal: JOURNAL,
    readme: `# Le journal\n\n[plancher]: # "${L9}"\n`,
    nomme: [ligneReadme(3), PLANCHER_SEUL],
  },
  {
    quoi: 'F6 (securite 5220321404) : le plancher en TROISIÈME CELLULE d’un tableau à deux colonnes — GitHub ne la replie pas, il la JETTE : elle est absente du HTML rendu',
    journal: JOURNAL,
    readme: `# Le journal\n\n| cle | valeur |\n| --- | --- |\n| plancher | voir ci-dessous | ${L9} |\n`,
    nomme: [ligneReadme(5), PLANCHER_SEUL],
  },
  {
    quoi: 'F6 : le plancher en TITRE de lien — le rendu en fait une infobulle, jamais le corps de la page',
    journal: JOURNAL,
    readme: `# Le journal\n\n[Le plancher](https://example.invalid "${L9}")\n`,
    nomme: [ligneReadme(3), PLANCHER_SEUL],
  },
  {
    quoi: 'F6 : le plancher en TEXTE ALTERNATIF d’une image — l’image s’affiche, le nombre non',
    journal: JOURNAL,
    readme: `# Le journal\n\n![${L9}](plancher.png)\n`,
    nomme: [ligneReadme(3), PLANCHER_SEUL],
  },
  {
    quoi: 'F6 : le plancher dans une section `<details>` sans `<summary>`, isolée par des lignes vides — repliée au rendu, dans l’esprit de la règle comme dans sa lettre',
    journal: JOURNAL,
    readme: `# Le journal\n\n<details>\n\n${L9}\n\n</details>\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"<"'],
  },
  {
    quoi: 'mutation (5220256065) : la définition de lien-référence dont le TITRE est à la ligne SUIVANTE — la ligne du plancher n’a plus ni « [ » ni balise, seulement deux espaces de continuation',
    journal: JOURNAL,
    readme: `# Le journal\n\n[plancher]: #\n  "${L9}."\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"["'],
  },
  {
    quoi: 'la même ligne de continuation, l’étiquette ôtée : DEUX règles indépendantes la portent — la ligne du plancher, jugée seule, porte des guillemets et deux espaces qui ne sont pas le plancher',
    journal: JOURNAL,
    readme: `# Le journal\n\nUn paragraphe.\n  "${L9}."\n`,
    nomme: [ligneReadme(4), PLANCHER_SEUL],
  },
  {
    quoi: 'le plancher dans un bloc de code INDENTÉ, que le rendu affiche en code mais que gov:etat lit comme le plancher',
    journal: JOURNAL,
    readme: `# Le journal\n\nUn exemple :\n\n    ${L9}\n`,
    nomme: [ligneReadme(5), PLANCHER_SEUL],
  },
  {
    quoi: 'CE QUE LA SEULE MÉCANIQUE COÛTE : le plancher dans un bloc de code clôturé est REFUSÉ alors que le rendu l’affiche — un faux rouge NOMMÉ, jamais un trou',
    journal: JOURNAL,
    readme: `# Le journal\n\n\`\`\`\n${lignePlancher(0)}\n\`\`\`\n`,
    nomme: [ligneReadme(3), STRUCTURE, '"`"'],
  },
];

/** Le plancher que le rendu AFFICHE : la garde le lit, quelle que soit sa mise en page. */
const PLANCHERS_LUS: CasDeJournal[] = [
  {
    quoi: 'un README réel : le plancher en texte, et plus bas des spans qui portent `<`, `<!--`, `[` et `---`',
    journal: JOURNAL,
    readme:
      `# Le journal\n\n## Plancher\n\n${lignePlancher(0)}.\n\n` +
      `Un nom \`<x>\`, un \`<!--\` et un \`[lien]:\` entre accents graves, un filet \`---\` : du texte.\n`,
    nomme: [],
  },
  {
    quoi: 'le `>` de « **> n** », que la règle de structure refuserait partout ailleurs, est admis parce qu’il est DANS le motif — avec ou sans le point final',
    journal: JOURNAL,
    readme: `# Le journal\n\n${lignePlancher(0)}\n\nUne phrase qui suit.\n`,
    nomme: [],
  },
];

/** Le refus que lève `chargerSources` sur un journal posé seul, à côté de registres vides ; `null` s'il est lu. */
function chargerJournal(c: CasDeJournal): Error | null {
  const fichiers: Record<string, string> = {
    'docs/tasks.json': '{ "taches": [] }',
    'docs/gates.json': '{ "gates": [] }',
    'docs/agents.json': '{ "postes": [] }',
    [README_JOURNAL]: c.readme ?? `${lignePlancher(c.plancher ?? 0)}\n`,
    [JOURNAL_DE_PREUVE]: c.journal,
    ...c.fichiers,
  };
  try {
    chargerSources(Object.keys(fichiers), (f) => new TextEncoder().encode(fichiers[f] ?? ''));
    return null;
  } catch (e) {
    return e as Error;
  }
}

/**
 * `null` si la règle de caractère admet EXACTEMENT l'ASCII imprimable et `HORS_ASCII_ADMIS` — chaque point de
 * code, de 0 à U+10FFFF, est présenté — et si la liste ne porte ni doublon ni caractère ASCII ; sinon, pourquoi.
 * Ce qui fige la liste ELLE-MÊME est dans le spec : l'élargir se voit dans deux fichiers.
 */
function listeDAutorisationFidele(): string | null {
  const hors = [...HORS_ASCII_ADMIS];
  if (
    new Set(hors).size !== hors.length ||
    hors.some((c) => (c.codePointAt(0) as number) <= 0x7e)
  ) {
    return '❌ HORS_ASCII_ADMIS porte un doublon ou un caractère ASCII : la liste ne dit plus ce qu’elle admet.';
  }
  let admis = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) if (caractereAdmis(String.fromCodePoint(cp))) admis++;
  const declares = 0x7e - 0x20 + 1 + hors.length;
  return admis === declares
    ? null
    : `❌ caractereAdmis admet ${admis} point(s) de code, sa liste en déclare ${declares} : la règle admet autre chose que sa liste.`;
}

/** `null` si le journal est refusé en NOMMANT ce qu'il annonce (`nomme` non vide), ou LU (`nomme` vide) ; sinon, pourquoi. */
function jugerJournal(c: CasDeJournal): string | null {
  const refus = chargerJournal(c);
  if (c.nomme.length === 0) {
    return refus === null
      ? null
      : `❌ Faux positif : le journal « ${c.quoi} » fait refuser la garde.\n   ${refus.message}`;
  }
  if (!(refus instanceof SourceIllisible))
    return `❌ Le journal « ${c.quoi} » n'a PAS fait refuser la garde${refus ? ` (${refus.name})` : ''}.`;
  const muets = c.nomme.filter((n) => !refus.message.includes(n));
  return muets.length === 0
    ? null
    : `❌ Le journal « ${c.quoi} » fait refuser sans NOMMER : ${muets.join(', ')}.\n   ${refus.message}`;
}

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
      (autres.length > 0
        ? ` — il a rougi par ${autres.join(', ')}, qui n'est pas sa famille.`
        : '.')
    );
  }
  const muets = t.nomme.filter((n) => !siennes.some((f) => f.message.includes(n)));
  if (muets.length > 0)
    return `❌ Le témoin « ${t.quoi} » rougit sans NOMMER : ${muets.join(', ')}.`;
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
  if (rendu(verdict).code !== 0)
    return `❌ « ${c.quoi} » ne rougit sur aucune famille, et le verdict RENDU sort en échec.`;
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
  const triomphant: Rendu = (v) => ({
    ...rendre(v),
    lignes: ['✅ gov:attributions — succès', ...rendre(v).lignes],
  });
  const bruyant: Rendu = (v) => ({ ...rendre(v), code: 1 });
  for (const t of TEMOINS) {
    const { fautes } = analyser(completer(t.sources));
    const produites = new Set(fautes.map((f) => f.famille));
    const etrangere = FAMILLES.find((f) => !produites.has(f));
    if (etrangere && jugerTemoin({ ...t, famille: etrangere }) === null) {
      acceptes.push(
        `jugerTemoin accepte « ${t.quoi} » rattaché à « ${etrangere} », qu'il ne fait pas rougir`
      );
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
      acceptes.push(
        `jugerTemoin accepte « ${t.quoi} » annonçant « ${emprunte} », que seul le message d'une autre famille porte`
      );
    }
    if (jugerTemoin(t, muet) === null)
      acceptes.push(`jugerTemoin accepte « ${t.quoi} » dont le verdict rendu sort 0`);
    if (jugerTemoin(t, triomphant) === null)
      acceptes.push(
        `jugerTemoin accepte « ${t.quoi} » dont le verdict rendu imprime une bannière de succès`
      );
    // Rendu MUET : le faux positif doit être vu par le juge lui-même, pas seulement par le code de sortie.
    if (jugerContreTemoin({ quoi: t.quoi, sources: t.sources }, muet) === null) {
      acceptes.push(
        `jugerContreTemoin accepte le témoin « ${t.quoi} », qui rougit, dès que son verdict rendu sort 0`
      );
    }
  }
  for (const c of CONTRE_TEMOINS) {
    const annoncees = c.exemptions ?? [];
    if (jugerContreTemoin(c, bruyant) === null)
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » dont le verdict rendu sort en échec`);
    if (jugerContreTemoin({ ...c, exemptions: [...annoncees, NATURES[0]] }) === null) {
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » annonçant une exemption de PLUS`);
    }
    if (annoncees.length === 0) continue;
    if (jugerContreTemoin({ ...c, exemptions: annoncees.slice(1) }) === null) {
      acceptes.push(`jugerContreTemoin accepte « ${c.quoi} » annonçant une exemption de MOINS`);
    }
    const autre = NATURES.find((n) => n !== annoncees[0]) as Nature;
    if (jugerContreTemoin({ ...c, exemptions: [autre, ...annoncees.slice(1)] }) === null) {
      acceptes.push(
        `jugerContreTemoin accepte « ${c.quoi} » annonçant autant d’exemptions, dont une « ${autre} » qu’il ne rend pas`
      );
    }
  }
  // Un journal refusé présenté comme LU, un journal refusé annonçant un nom que son refus ne porte pas,
  // un journal lu présenté comme REFUSÉ : le juge du chargement doit refuser les trois.
  for (const c of [...JOURNAUX_REFUSES, ...PLANCHERS_REFUSES]) {
    if (jugerJournal({ ...c, nomme: [] }) === null)
      acceptes.push(`jugerJournal accepte comme LU le journal refusé « ${c.quoi} »`);
    if (jugerJournal({ ...c, nomme: [...c.nomme, ABSENT] }) === null)
      acceptes.push(
        `jugerJournal accepte « ${c.quoi} » annonçant un nom que le refus ne porte pas`
      );
  }
  for (const c of [...JOURNAUX_LUS, ...PLANCHERS_LUS]) {
    if (jugerJournal({ ...c, nomme: [JOURNAL_DE_PREUVE] }) === null)
      acceptes.push(`jugerJournal accepte comme REFUSÉ le journal lu « ${c.quoi} »`);
  }
  return acceptes;
}

export function prouver(): { code: number; lignes: string[] } {
  for (const t of TEMOINS) {
    const r = jugerTemoin(t);
    if (r)
      return {
        code: 1,
        lignes: [r, '   Le témoin est faux, ou la règle ne couvre pas ce qu’elle prétend couvrir.'],
      };
  }
  for (const c of CONTRE_TEMOINS) {
    const r = jugerContreTemoin(c);
    if (r) return { code: 1, lignes: [r] };
  }
  for (const c of [...JOURNAUX_REFUSES, ...JOURNAUX_LUS, ...PLANCHERS_REFUSES, ...PLANCHERS_LUS]) {
    const r = jugerJournal(c);
    if (r) return { code: 1, lignes: [r] };
  }
  const liste = listeDAutorisationFidele();
  if (liste) return { code: 1, lignes: [liste] };
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
  const sansContre = NATURES.filter(
    (n) => !CONTRE_TEMOINS.some((c) => (c.exemptions ?? []).includes(n))
  );
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
        `exactement leurs exemptions (les ${NATURES.length} natures sont chacune rendues) ; les ${JOURNAUX_REFUSES.length} journaux ` +
        `que le rendu lirait autrement sont refusés en se nommant, ${JOURNAUX_LUS.length} contre-témoin(s) de journal sont lus, ` +
        `les ${PLANCHERS_REFUSES.length} planchers que le rendu n'afficherait pas là où la garde les lit sont refusés en nommant la ligne — celle qui OUVRE, ou celle du plancher ` +
        `(${PLANCHERS_LUS.length} contre-témoins de plancher sont lus), ` +
        `et la règle de caractère admet exactement sa liste d'autorisation (l'ASCII imprimable et ${[...HORS_ASCII_ADMIS].length} autres).`,
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
