/**
 * gov-conventions.ts — les gardes d'axionia retenues pour Partners (GOV-014, REQ-GOV-018,
 * REQ-GOV-029).
 *
 * USAGE : pnpm gov:conventions           (échoue si une convention retenue est violée)
 *         pnpm gov:conventions --prove   (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *
 * ── CE QU'ELLE TIENT, ET POURQUOI CHAQUE FAMILLE EXISTE ─────────────────────────────────────
 *
 * REQ-GOV-029 demande une décision par garde candidate d'axionia. Le registre des décisions est
 * `docs/GARDES-AXIONIA.md` ; ce fichier-ci est l'exécution des décisions « transposer » et
 * « adapter ». Chaque famille porte le défaut réel qui l'a justifiée :
 *
 *   • `use_server_export_interdit` — Next transforme CHAQUE export d'un module `"use server"` en
 *     point d'entrée réseau. Une constante n'en est pas un : le fichier ENTIER cesse de compiler,
 *     et le message rendu désigne la mauvaise cause (« Export X doesn't exist in target module »,
 *     alors que l'export existe). Mesuré côté axionia le 2026-09-01 : `tsc --noEmit` VERT, ESLint
 *     VERT, tests unitaires VERTS, `next build` en échec. Aucun type n'attrape ce défaut.
 *   • `use_server_reexport` — un `export { … }` dans un module `"use server"` devient un point
 *     d'entrée HTTP public, appelable sans cookie et sans session. Deux fuites réelles trouvées
 *     par cette règle côté axionia le 2026-08-19, dont une lecture de table sans garde.
 *   • `use_client_sans_motif` — la directive `"use client"` sans son `// use-client: <raison>` :
 *     une frontière de rendu qu'on franchit sans que personne ait à s'en expliquer.
 *   • `lint_non_bloquant` — LE point de REQ-GOV-018. Une garde privée de son caractère bloquant
 *     est une décoration : côté axionia, toutes les gates PR de budget portent
 *     `continue-on-error: true`, donc aucune PR qui alourdit le bundle n'y rougit — et la
 *     documentation du dépôt a affirmé le contraire pendant des mois.
 *   • `outillage_non_epingle` — une étape qui lance `pnpm lint` sans que l'outil soit épinglé
 *     et configuré ne mesure rien ; elle installe la croyance qu'un lint tourne.
 *   • `isolation_depot` — la moitié RÉCIPROQUE de ce que `tests/unit/gouvernance/paths-derives.spec.ts`
 *     garde déjà. Ce test refuse qu'une tâche `repo: axionia` écrive dans ce dépôt ; personne ne
 *     refusait l'inverse. Une garde à sens unique est le défaut que ce dépôt a déjà payé.
 *   • `garde_ecrite_jamais_appelee` — la leçon d'axionia : `qualiopi:isolation-check` existait
 *     depuis des mois, n'était câblé dans aucun workflow, et cumulait 88 violations pendant que
 *     la seule des trois gardes câblée affichait zéro. « Appelée » veut dire LANCÉE par une commande
 *     atteignable dont le statut compte : une garde citée entre guillemets, court-circuitée (`true ||`),
 *     placée après un `exit`, dans un pipeline ou en arrière-plan n'est pas appelée (refus
 *     d'exactitude sur la PR 175 : la ligne était découpée sans tenir compte des guillemets).
 *   • `perimetre_vide_sans_motif` — le cas d'école à ne PAS reproduire :
 *     `axionia/scripts/check-zod.ts` sort en 0 avec un avertissement quand son répertoire
 *     n'existe pas. Une garde à périmètre vide qui rend « ✅ » ne garde rien. Ici, un périmètre
 *     vide doit porter son MOTIF et nommer la TÂCHE qui l'ouvrira, et cette tâche doit exister au
 *     backlog. C'est la seule chose qui distingue « différée » d'« oubliée ».
 *   • `gate_sans_script`, `passif_sans_script_perime` (GOV-083) — une entrée de `docs/gates.json`
 *     dont le script est absent du disque ne s'exempte plus en silence : elle est TRIÉE (autre dépôt,
 *     promise, fautive), et la fautive est refusée sauf déclaration au passif, une par une.
 *   • `etape_absente`, `etape_non_figee`, `etape_conditionnee`, `etape_toleree`,
 *     `etape_repointee`, `script_repointe`, `porte_a_illisible` (GOV-061) — CHAQUE étape du job de la
 *     porte A est PRÉSENTE, ACTIVE et EFFECTIVE, confrontée à son constat (`PORTE_A_FIGEE`). On
 *     croyait la porte armée ; rien ne le prouvait, et six désarmements passaient sans un rouge.
 *   • `porte_a_alteree`, `etape_en_double` (GOV-061, veto de sécurité sur la PR 175) — l'étape
 *     ENTIÈRE, le job ENTIER et le niveau workflow qui agit sur lui sont confrontés au constat, clé
 *     par clé, sous leur forme canonique. La confrontation ne lisait que quatre clés d'étape et deux
 *     du job : un `shell:` qui rend toujours 0, des `defaults:` de job, un `with: ref:` sur le
 *     checkout désarmaient la porte en exit 0 sans toucher au constat. Toute clé que le constat ne
 *     porte pas, ajoutée, retirée ou modifiée, est désormais une faute NOMMÉE ; deux étapes de même
 *     nom, qu'une table indexée par nom confondait, en sont une autre. Un étage plus bas, la
 *     configuration pnpm/npm de la racine (`.npmrc`, `pnpm-workspace.yaml`, `.pnpmfile.cjs`, clé
 *     `pnpm` de `package.json`) change le shell de chaque `pnpm <script>` : elle est figée ABSENTE.
 *
 * ── CE QU'ELLE NE FAIT PAS, ET LE DIT ───────────────────────────────────────────────────────
 *
 *   — ⚠️ LIMITE DE LA PORTE A, AU PRIX PAYÉ : une faute qui fait SAUTER le job `gate-a` (un `if:`
 *     toujours faux au niveau du job) saute AUSSI l'étape qui lance cette garde, et un job requis
 *     « skipped » laisse fusionner. En CI, cette faute-là n'est donc vue qu'HORS de ce job : au
 *     pré-vol local (`scripts/prevol.ts` joue les étapes sans lire la condition du job) et à la revue.
 *     Aucune garde logée DANS un job ne juge sa propre condition d'exécution ; la fermer en CI
 *     demanderait un second job requis, que ce dépôt n'a pas. Des `on:` qui ne déclenchent plus,
 *     eux, ferment d'eux-mêmes : un check requis qui ne se présente jamais bloque la fusion.
 *   — HORS DU JOB `gate-a`, RIEN NE JUGE QU'UNE ÉTAPE S'EXÉCUTE. Une étape de `nightly.yml` qui lance
 *     une garde est lue comme un appel même si elle porte un `if:` toujours faux, un
 *     `continue-on-error`, ou si son job ne se déclenche jamais : seul le job de la porte A est
 *     confronté à un constat. `garde_ecrite_jamais_appelee` dit « câblée », pas « exécutée ».
 *   — ⚠️ PRIX ASSUMÉ DU LEXER : une ligne qu'il refuse (guillemet non fermé, document en ligne `<<`)
 *     ou qui porte une construction qu'il ne juge pas (`if`, `case`, boucle, fonction, groupe
 *     `{ … }`, `trap`) n'appelle RIEN, même une garde qu'elle lance réellement ; une commande dans
 *     un sous-shell ou une substitution non plus. Échouer fermé, ici, c'est tenir la garde pour NON
 *     appelée : on simplifie la ligne, ou on motive `horsCi`.
 *   — Elle ne voit pas la configuration pnpm/npm HORS du dépôt : le `.npmrc` de l'utilisateur ou
 *     global du coureur, et les variables `npm_config_*` qu'il porterait. Celles qu'un `env:` du
 *     workflow poserait sont figées avec lui ; les autres ne sont pas dans l'arbre qu'elle lit.
 *   — Elle ne fige pas les AUTRES jobs du workflow : ils ne désarment pas `gate-a`, sauf par
 *     `needs:` — et une clé `needs:` ajoutée au job est elle-même une faute (`porte_a_alteree`).
 *   — Elle n'exige d'aucune étape qu'elle EXISTE avant qu'elle soit écrite, ni aucune dépendance de
 *     `package.json` : exiger une présence que personne n'a encore livrée rendrait la garde rouge
 *     en permanence pour un manque qu'aucune PR n'a créé (LEC-13). Ce qu'elle exige, c'est la
 *     COHÉRENCE : une étape de lint est bloquante et son outil épinglé ; une étape de la porte A,
 *     une fois figée à son constat, n'en disparaît plus, ne s'y désarme plus et ne s'y repointe
 *     plus sans que le même diff fige le changement (GOV-061).
 *   — Elle ne suit pas un ré-export à la trace (`export { x } from "./y"`) pour savoir si `x` est
 *     asynchrone : elle refuse le ré-export lui-même, ce qui est plus simple et plus sûr.
 *   — Elle ne juge que le PRÉFIXE d'un chemin de tâche. `tests/fixtures/axionia/` (INT-T01a,
 *     `repo: partners`) est une fixture DE axionia dans CE dépôt : légitime. Une règle écrite
 *     « contient axionia » l'aurait rougie.
 *
 * ── L'INVARIANT DE LA PREUVE ────────────────────────────────────────────────────────────────
 *
 * `controler()` est une fonction PURE d'une vue INJECTÉE. Aucune famille ne dépend de l'état du
 * disque le jour où le test tourne (RM-11), et `--prove` exige un témoin par famille PLUS des
 * contre-témoins verts : sans eux, une règle trop large rougirait sur tout et finirait désarmée
 * (RM-02, LEC-13).
 */

import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import { outilHorsDepot } from '../lot/chemins-de-tache';
import { LIVREE } from '../lot/avancement';
import { existsSync, readFileSync } from 'node:fs';
import { parsers as analyseursYaml } from 'prettier/plugins/yaml';
import { estObjet, lireYaml } from '../lib/lire-yaml';

// ── le vocabulaire des décisions, partagé avec le registre et son test ───────────────────────

/**
 * Les quatre décisions recevables de REQ-GOV-029. L'exigence en nomme trois ; `différer` est la
 * quatrième, et elle n'est recevable qu'accompagnée de la tâche qui reprend la garde — sans quoi
 * c'est un oubli déguisé en décision.
 */
export const DECISIONS_RECEVABLES = ['transposer', 'adapter', 'écarter', 'différer'] as const;

// ── la vue ───────────────────────────────────────────────────────────────────────────────────

export interface Fichier {
  readonly chemin: string;
  readonly source: string;
}

export interface GateVue {
  readonly id: string;
  readonly phase: number;
  readonly script: string;
  readonly alias?: readonly string[];
  /**
   * LE MOTIF d'une garde DÉLIBÉRÉMENT hors CI — la seule réponse admise, avec le câblage, à
   * `garde_ecrite_jamais_appelee` (GOV-044).
   *
   * Toutes les gardes ne peuvent pas vivre en CI, et le dépôt en porte déjà le cas : `gov:attestation`
   * interroge la forge par `gh`, ce qui rendrait la suite non déterministe — GOV-038 l'a laissée hors
   * CI *exprès*, et l'a écrit dans `scripts/lot/attestation.ts`. Tant que ce motif ne vivait nulle part
   * où une garde puisse le lire, il n'y avait que deux issues : inscrire la gate au registre et récolter
   * un rouge permanent qu'on apprend à ignorer, ou ne pas l'inscrire du tout — c'est-à-dire le trou que
   * GOV-044 ferme.
   * ⚠️ Ce n'est PAS un mot de passe : le motif est exigé aussi long que celui d'un périmètre vide
   * (`MOTIF_MINIMAL`), pour la même raison — deux mots ne sont pas une décision.
   */
  readonly horsCi?: string;
  /**
   * La tâche qui PORTE l'entrée au registre (GOV-083). C'est elle, et elle seule, qui peut rendre
   * « promise » une entrée dont le script n'est pas encore écrit : tant qu'elle n'est pas livrée,
   * l'absence du script est un fait attendu ; une fois livrée, c'est une entrée fautive.
   */
  readonly tache?: string | readonly string[];
}

export interface TacheVue {
  readonly id: string;
  readonly repo: string;
  readonly paths: readonly string[];
  /** La phase de la tâche — d'où se DÉRIVE la phase courante (GOV-083). Absente : non comptée. */
  readonly phase?: number;
  /** Le statut — « livrée » se lit dans `LIVREE` (`scripts/lot/avancement.ts`), jamais ici. */
  readonly statut?: string;
}

/** Les périmètres que la garde sait compter. Une union fermée : pas de clé inventée. */
export type ClePerimetre =
  | 'modules-serveur'
  | 'composants-client'
  | 'etapes-lint-ci'
  | 'taches-du-backlog'
  | 'gardes-du-disque';

export interface Perimetre {
  readonly cle: ClePerimetre;
  readonly libelle: string;
  /** Ce qu'on répond quand le périmètre est vide. Moins de 60 caractères n'est pas un motif. */
  readonly motifSiVide: string;
  /** L'identifiant de la tâche qui ouvrira ce périmètre. Il doit exister au backlog. */
  readonly tacheSuccesseur: string;
}

export interface Vue {
  readonly sources: readonly Fichier[];
  readonly workflows: readonly Fichier[];
  /** Le contenu de `.claude/settings.json` — une garde peut être câblée là plutôt qu'en CI. */
  readonly hooks: string;
  readonly packageJson: string;
  readonly fichiersSuivis: readonly string[];
  readonly gates: readonly GateVue[];
  readonly taches: readonly TacheVue[];
  readonly perimetres: readonly Perimetre[];
  /**
   * LE PASSIF DES ENTRÉES FAUTIVES (GOV-083) : l'identifiant d'une entrée de `docs/gates.json` dont le
   * script est introuvable et que sa tâche, livrée, n'écrira plus — avec le MOTIF de sa tolérance.
   * Une entrée déclarée ici ne rougit pas `gate_sans_script` ; une ligne qui ne sert plus rougit
   * `passif_sans_script_perime`. ABSENT = aucun passif : rien n'est toléré.
   */
  readonly passifSansScript?: Readonly<Record<string, string>>;
  /**
   * LE CONSTAT DE LA PORTE A (GOV-061) : ce que ses étapes doivent être. ABSENT = la porte A n'est
   * pas confrontée, et `confronterLaPorteA` le REFUSE (`porte_a_illisible`) plutôt que de verdir.
   */
  readonly porteA?: PorteFigee;
}

export interface Faute {
  readonly famille: string;
  readonly message: string;
}

export const FAMILLES = [
  'use_server_export_interdit',
  'use_server_reexport',
  'use_client_sans_motif',
  'lint_non_bloquant',
  'outillage_non_epingle',
  'isolation_depot',
  'garde_ecrite_jamais_appelee',
  'garde_hors_registre',
  'gate_sans_script',
  'passif_sans_script_perime',
  'etape_absente',
  'etape_non_figee',
  'etape_conditionnee',
  'etape_toleree',
  'etape_repointee',
  'etape_en_double',
  'porte_a_alteree',
  'script_repointe',
  'porte_a_illisible',
  'perimetre_vide_sans_motif',
] as const;

/**
 * Longueur minimale d'un motif — périmètre vide, ou garde délibérément hors CI. Deux mots ne sont
 * pas un motif. UNE seule valeur pour les deux emplois : un second nombre, posé ailleurs, dériverait
 * du premier le jour où quelqu'un l'ajusterait (RM-01).
 */
export const MOTIF_MINIMAL = 60;

// ── lecture des directives ───────────────────────────────────────────────────────────────────

/**
 * La directive doit être la première instruction du fichier pour marquer le MODULE. Une fonction
 * qui porte `"use server"` dans son corps est une action isolée : les autres exports du fichier
 * restent libres, et les refuser serait un faux positif.
 */
function premiereInstruction(source: string): string {
  return (
    source
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) => l !== '' && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*')
      )[0] ?? ''
  );
}

/**
 * ⚠️ LA PREMIÈRE instruction, pas l'une des trois premières.
 *
 * La garde d'axionia dont celle-ci dérive retient les TROIS premières instructions et y cherche la
 * directive avec le drapeau multi-ligne. Le contre-témoin « un `"use server"` DANS le corps d'une
 * fonction ne marque pas le module » l'a fait rougir sur `export const revalider = 3600` d'un
 * fichier dont la troisième instruction était un `"use server"` de fonction. C'est un faux
 * positif, et il porte sur la règle la plus coûteuse du lot : celui qui le reçoit apprend à
 * ignorer la garde. Une directive ne marque le MODULE que si elle est la première instruction.
 */
export function estUnModuleServeur(source: string): boolean {
  return /^["']use server["'];?$/.test(premiereInstruction(source));
}

/** Les lignes qui portent la directive client, avec leur index — la justification est ADJACENTE. */
function lignesClient(source: string): number[] {
  const lignes = source.split('\n');
  const out: number[] = [];
  for (const [i, l] of lignes.entries()) {
    if (/^["']use client["'];?$/.test(l.trim())) out.push(i);
  }
  return out;
}

/**
 * Les exports qu'un module serveur ne peut pas porter. `export type` et `export interface` sont
 * ABSENTS à dessein : effacés à la compilation, ils ne deviennent pas des points d'entrée.
 */
const EXPORTS_INTERDITS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm, 'une constante'],
  [/^export\s+class\s+([A-Za-z0-9_$]+)/gm, 'une classe'],
  [/^export\s+enum\s+([A-Za-z0-9_$]+)/gm, 'une énumération'],
  [/^export\s+(?!async\b)function\s+([A-Za-z0-9_$]+)/gm, 'une fonction non asynchrone'],
];

// ── lecture des workflows ────────────────────────────────────────────────────────────────────

/** Découpe la liste des étapes d'un workflow en blocs, à l'indentation du tiret. */
function etapesDe(contenu: string): string[] {
  const out: string[] = [];
  let courant: string[] | null = null;
  let indent = 0;
  for (const ligne of contenu.split('\n')) {
    const tiret = /^(\s*)-\s/.exec(ligne);
    if (tiret) {
      if (courant) out.push(courant.join('\n'));
      courant = [ligne];
      indent = (tiret[1] ?? '').length;
      continue;
    }
    if (!courant) continue;
    if (ligne.trim() === '') {
      courant.push(ligne);
      continue;
    }
    if (ligne.search(/\S/) > indent) {
      courant.push(ligne);
      continue;
    }
    out.push(courant.join('\n'));
    courant = null;
  }
  if (courant) out.push(courant.join('\n'));
  return out;
}

/**
 * Une tolérance d'échec ÉCRITE, sous toute forme autre que `false` en toutes lettres — une expression
 * `${{ … }}` ou une chaîne tolèrent comme `true` (GOV-061, fait (d)). La première au niveau d'une
 * étape, la seconde au niveau du JOB (quatre espaces), qui désarme toutes ses étapes.
 */
const TOLERANCE_ECRITE = /continue-on-error:[ \t]*(?!false[ \t]*(?:#.*)?$)\S/m;
const TOLERANCE_ECRITE_AU_JOB = /^ {4}continue-on-error:[ \t]*(?!false[ \t]*(?:#.*)?$)\S/m;

const LANCE_LE_LINT = /run:[^\n]*pnpm\s+(?:lint|format)/;

export interface EtapeDeLint {
  readonly workflow: string;
  readonly bloc: string;
  readonly outil: 'eslint' | 'prettier';
  readonly jobNonBloquant: boolean;
}

export function etapesDeLint(vue: Vue): EtapeDeLint[] {
  const out: EtapeDeLint[] = [];
  for (const w of vue.workflows) {
    // `continue-on-error` posé au niveau du JOB (quatre espaces) désarme toutes ses étapes.
    const jobNonBloquant = TOLERANCE_ECRITE_AU_JOB.test(w.source);
    for (const bloc of etapesDe(w.source)) {
      if (!LANCE_LE_LINT.test(bloc)) continue;
      const outil = /pnpm\s+format/.test(bloc) ? 'prettier' : 'eslint';
      out.push({ workflow: w.chemin, bloc, outil, jobNonBloquant });
    }
  }
  return out;
}

// ── la porte A : chaque étape PRÉSENTE, ACTIVE et EFFECTIVE (GOV-061) ─────────────────────────

/**
 * UNE ÉTAPE FIGÉE DE LA PORTE A — ce qu'elle doit être pour mesurer ce qu'on croit qu'elle mesure.
 * `nom` l'identifie comme le pré-vol la nomme (`scripts/prevol.ts`) : son `name:`, sinon son `uses:` ou son `run:`.
 */
export interface EtapeFigee {
  readonly nom: string;
  readonly run?: string;
  readonly uses?: string;
  /** Sa condition `if:`, telle qu'elle s'écrit. ABSENTE = l'étape ne porte aucune condition. */
  readonly si?: string;
  /**
   * TOUTES ses autres clés (`with`, `env`, `shell`, `id`, `working-directory`, `timeout-minutes`…),
   * sous la forme que rend l'analyseur YAML partagé : chaque scalaire est une CHAÎNE. ABSENT = elle
   * n'en porte aucune. `name`, `run`, `uses`, `if` et `continue-on-error` en sont exclues : chacune
   * a sa famille, qui dit mieux ce qui a changé.
   */
  readonly cles?: Readonly<Record<string, unknown>>;
}

/** Les clés d'une étape qu'une famille dédiée juge déjà — les seules que `cles` ne porte pas. */
const CLES_D_ETAPE_JUGEES_A_PART = new Set(['name', 'run', 'uses', 'if', 'continue-on-error']);
/** Les clés du job qu'une famille dédiée juge déjà — les seules que `PorteFigee.cles` ne porte pas. */
const CLES_DE_JOB_JUGEES_A_PART = new Set(['if', 'continue-on-error', 'steps']);
/** La clé du workflow qui porte les jobs : le job de la porte A y est jugé à part. */
const CLES_DE_WORKFLOW_JUGEES_A_PART = new Set(['jobs']);

/**
 * LE CLIQUET DE LA PORTE A. Le job, sa condition, ses étapes, et la définition `package.json` de
 * chaque script qu'une étape lance. Ce n'est pas une seconde source de `ci.yml` : c'est le CONSTAT
 * de ce qu'il porte, confronté à lui à chaque exécution, dans les deux sens — une étape retirée
 * rougit, une étape ajoutée rougit tant qu'elle n'est pas figée ici. Changer la porte A se fait donc
 * en DEUX endroits, dans le même diff, et c'est voulu : le diff de ce constat est ce qu'un relecteur
 * lit pour savoir ce que la porte a gagné ou perdu.
 */
export interface PorteFigee {
  readonly job: string;
  /** La condition du JOB. `null` = aucune. */
  readonly si: string | null;
  /**
   * TOUTES les autres clés du JOB (`runs-on`, `permissions`, et — absentes, donc refusées si on les
   * pose — `defaults`, `env`, `container`, `services`, `strategy`, `needs`, `timeout-minutes`,
   * `outputs`, `concurrency`…), sous leur forme canonique. Hors `if`, `continue-on-error`, `steps`.
   */
  readonly cles: Readonly<Record<string, unknown>>;
  /**
   * TOUTES les clés du WORKFLOW hors `jobs` (`name`, `on`, et — absentes, donc refusées si on les
   * pose — `defaults`, `env`, `permissions`, `concurrency`, `run-name`…) : elles agissent sur le job.
   */
  readonly workflow: Readonly<Record<string, unknown>>;
  readonly etapes: readonly EtapeFigee[];
  readonly scripts: Readonly<Record<string, string>>;
  /**
   * LA CONFIGURATION DU GESTIONNAIRE DE PAQUETS, figée ABSENTE (veto de sécurité (1) sur la PR 175, un
   * étage plus bas que le `shell:` d'une étape). `pnpm <script>` lit, à la racine, des réglages qui
   * changent ce que le script EXÉCUTE sans toucher ni au workflow ni au script : le shell des scripts
   * (`script-shell`), leurs crochets, le code lancé à l'installation. Un fichier SUIVI de cette liste,
   * ou une clé de `package.json` de cette liste, est une faute nommée (`porte_a_alteree`) ; le jour où
   * l'un d'eux devient nécessaire, ce constat devra figer son CONTENU, pas seulement son absence.
   */
  readonly paquet: {
    readonly fichiersAbsents: readonly string[];
    readonly clesAbsentes: readonly string[];
  };
}

/** Ce que la racine ne porte pas : les fichiers et les clés de `package.json` qui configurent pnpm/npm. */
export const CONFIGURATION_DU_PAQUET_ABSENTE: PorteFigee['paquet'] = {
  fichiersAbsents: ['.npmrc', 'pnpm-workspace.yaml', '.pnpmfile.cjs'],
  clesAbsentes: ['pnpm'],
};

/** Le workflow qui porte la porte A. Le seul job requis de ce dépôt y vit. */
export const WORKFLOW_DE_LA_PORTE_A = '.github/workflows/ci.yml';

/**
 * Les valeurs SCALAIRES d'une clé, partout dans un workflow — lues dans l'arbre de l'analyseur YAML
 * qu'embarque Prettier : un commentaire, même s'il cite une commande, n'y est jamais une valeur. Une clé dont la valeur est un objet (le `run:`
 * de `defaults: run: shell:`) n'est pas une commande et n'est pas rendue.
 * ÉCHEC FERMÉ : un fichier que l'analyseur refuse ne rend AUCUNE valeur — rien n'y est appelé.
 */
function valeursDeCle(source: string, cle: string): string[] {
  let racine: unknown;
  try {
    const options = { originalText: source };
    racine = analyseursYaml.yaml.parse(source, options as never);
  } catch {
    return [];
  }
  type Noeud = { type?: string; value?: unknown; children?: unknown[] };
  const scalaire = (n: unknown): string | undefined => {
    const x = n as Noeud | null;
    if (x === null || typeof x !== 'object') return undefined;
    if (typeof x.value === 'string' && x.type !== 'comment') return x.value;
    const enfants = (x.children ?? []).filter((e) => e !== null);
    return enfants.length === 1 &&
      (x.type === 'mappingKey' || x.type === 'mappingValue' || x.type === 'flowMappingValue')
      ? scalaire(enfants[0])
      : undefined;
  };
  const out: string[] = [];
  const pile: unknown[] = [racine];
  while (pile.length > 0) {
    const n = pile.pop() as Noeud | null;
    if (n === null || typeof n !== 'object') continue;
    const enfants = Array.isArray(n.children) ? n.children : [];
    if ((n.type === 'mappingItem' || n.type === 'flowMappingItem') && enfants.length === 2) {
      if (scalaire(enfants[0]) === cle) {
        const v = scalaire(enfants[1]);
        if (v !== undefined) out.push(v);
      }
    }
    pile.push(...enfants);
  }
  return out;
}

/** Ce qu'une commande en position de commande lance : un script de `package.json`, ou un fichier. */
interface Appels {
  scripts: Set<string>;
  fichiers: Set<string>;
}

/**
 * Les mots d'UNE commande simple, lus comme un appel. Reconnus : `pnpm [run|exec] <script>`,
 * `npm run <script>`, `npx`/`pnpm exec` suivis d'une commande, et `tsx`/`node`/`bash`/`sh <fichier>`.
 * Le reste — `echo`, `test`, une affectation seule — n'appelle rien.
 */
function lireUneCommande(mots: readonly string[], a: Appels): void {
  let i = 0;
  while (i < mots.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[i]!)) i++;
  const outil = mots[i];
  const suite = (j: number): number => {
    while (j < mots.length && mots[j]!.startsWith('-')) j++;
    return j;
  };
  if (outil === 'pnpm' || outil === 'npm') {
    let j = suite(i + 1);
    if (mots[j] === 'exec' || mots[j] === 'dlx') return lireUneCommande(mots.slice(j + 1), a);
    if (mots[j] === 'run' || mots[j] === 'run-script') j = suite(j + 1);
    else if (outil === 'npm') return;
    if (mots[j] !== undefined) a.scripts.add(mots[j]!);
  } else if (outil === 'npx') {
    lireUneCommande(mots.slice(suite(i + 1)), a);
  } else if (outil === 'tsx' || outil === 'node' || outil === 'bash' || outil === 'sh') {
    const j = suite(i + 1);
    if (mots[j] !== undefined) a.fichiers.add(mots[j]!);
  }
}

/**
 * CE QUE `package.json` NOMME EN POSITION DE COMMANDE — la sur-approximation, pour la seule question
 * « ce script est-il DÉCLARÉ lancé ? » (`confronterDisqueEtRegistre`). Là, l'échec fermé va dans
 * l'autre sens : un script nommé, même court-circuité, dont le fichier manque est une PERTE ; en
 * compter trop rend fautive une entrée de plus, jamais une de moins. Le découpage ignore donc les
 * guillemets, à dessein. Il ne sert JAMAIS à dire qu'une garde est appelée : c'est `appelsDe`.
 */
function commandesNommees(commande: string): Appels {
  const a: Appels = { scripts: new Set(), fichiers: new Set() };
  const sansGuillemets = (t: string): string => t.replace(/^["']|["']$/g, '');
  for (const segment of commande.split(/\r?\n|&&|\|\||[;|&()]/)) {
    const mots = segment.trim().split(/\s+/).filter(Boolean).map(sansGuillemets);
    if (mots.length > 0) lireUneCommande(mots, a);
  }
  return a;
}

/** Un jeton de la ligne de commande : un MOT (déjà désenveloppé de ses guillemets), ou un OPÉRATEUR. */
type Jeton = { readonly mot: string } | { readonly op: string };

/**
 * LE LEXER SHELL MINIMAL (refus d'exactitude sur la PR 175). Il respecte les guillemets simples et
 * doubles et les échappements, et découpe sur `;`, `&&`, `||`, `|`, `&`, les sauts de ligne et les
 * parenthèses de sous-shell. Une substitution (`$(…)`, accents graves, `<(…)`) et une expansion
 * `${…}` restent DANS leur mot : ce qu'elles contiennent n'est jamais lu comme une commande. Une
 * expression d'Actions `${{ … }}`, remplacée avant que le shell ne voie la ligne, est un mot opaque :
 * son `||` n'est pas un opérateur du shell.
 * ÉCHEC FERMÉ : un guillemet, une substitution ou une expression non fermés, un document en ligne
 * (`<<`), une fin de branche de `case` (`;;`) rendent `null` — la ligne n'est pas lue.
 */
function jetonsShell(commande: string): Jeton[] | null {
  const c = commande;
  const out: Jeton[] = [];
  let mot = '';
  let enMot = false;
  const finir = (): void => {
    if (enMot) out.push({ mot });
    mot = '';
    enMot = false;
  };
  const ajouter = (texte: string): void => {
    mot += texte;
    enMot = true;
  };
  /** L'index qui suit l'accent grave fermant, ou -1. */
  const finAccentGrave = (i: number): number => {
    for (let j = i; j < c.length; j++) {
      if (c[j] === '\\') j++;
      else if (c[j] === '`') return j + 1;
    }
    return -1;
  };
  /** Le texte entre guillemets doubles et l'index qui suit le fermant, ou `null`. */
  const finGuillemets = (i: number): { fin: number; texte: string } | null => {
    let texte = '';
    let j = i;
    while (j < c.length) {
      const x = c[j]!;
      if (x === '"') return { fin: j + 1, texte };
      if (x === '\\') {
        texte += c[j + 1] ?? '';
        j += 2;
        continue;
      }
      let k = j + 1;
      if (x === '$' && (c[j + 1] === '(' || c[j + 1] === '{')) {
        k = finEquilibree(j + 2, c[j + 1]!, c[j + 1] === '(' ? ')' : '}');
      } else if (x === '`') k = finAccentGrave(j + 1);
      if (k < 0) return null;
      texte += c.slice(j, k);
      j = k;
    }
    return null;
  };
  /** L'index qui suit le fermant qui équilibre l'ouvrant déjà lu, guillemets respectés, ou -1. */
  const finEquilibree = (i: number, ouvre: string, ferme: string): number => {
    let profondeur = 1;
    let j = i;
    while (j < c.length) {
      const x = c[j]!;
      if (x === '\\') j += 2;
      else if (x === "'") {
        const k = c.indexOf("'", j + 1);
        if (k < 0) return -1;
        j = k + 1;
      } else if (x === '"') {
        const g = finGuillemets(j + 1);
        if (g === null) return -1;
        j = g.fin;
      } else if (x === '`') {
        const k = finAccentGrave(j + 1);
        if (k < 0) return -1;
        j = k;
      } else {
        if (x === ouvre) profondeur++;
        else if (x === ferme && --profondeur === 0) return j + 1;
        j++;
      }
    }
    return -1;
  };

  let i = 0;
  while (i < c.length) {
    const x = c[i]!;
    const suivant = c[i + 1];
    if (x === ' ' || x === '\t' || (x === '\r' && suivant === '\n')) {
      finir();
      i++;
    } else if (x === '\n') {
      finir();
      out.push({ op: '\n' });
      i++;
    } else if (x === '#' && !enMot) {
      while (i < c.length && c[i] !== '\n') i++;
    } else if (x === '\\') {
      if (suivant === '\n') i += 2;
      else if (suivant === '\r' && c[i + 2] === '\n') i += 3;
      else {
        ajouter(suivant ?? '');
        i += 2;
      }
    } else if (x === "'") {
      const k = c.indexOf("'", i + 1);
      if (k < 0) return null;
      ajouter(c.slice(i + 1, k));
      i = k + 1;
    } else if (x === '"') {
      const g = finGuillemets(i + 1);
      if (g === null) return null;
      ajouter(g.texte);
      i = g.fin;
    } else if (x === '$' && c.startsWith('${{', i)) {
      const k = c.indexOf('}}', i + 3);
      if (k < 0) return null;
      ajouter(c.slice(i, k + 2));
      i = k + 2;
    } else if (
      (x === '$' && (suivant === '(' || suivant === '{')) ||
      (x === '(' && /[<>]$/.test(mot))
    ) {
      const debut = x === '$' ? i + 2 : i + 1;
      const ouvre = x === '$' ? suivant! : '(';
      const k = finEquilibree(debut, ouvre, ouvre === '(' ? ')' : '}');
      if (k < 0) return null;
      ajouter(c.slice(i, k));
      i = k;
    } else if (x === '`') {
      const k = finAccentGrave(i + 1);
      if (k < 0) return null;
      ajouter(c.slice(i, k));
      i = k;
    } else if (x === '<' && suivant === '<') {
      return null;
    } else if (x === '&' && suivant === '&') {
      finir();
      out.push({ op: '&&' });
      i += 2;
    } else if (
      (x === '&' && (suivant === '>' || /[<>]$/.test(mot))) ||
      (x === '|' && />$/.test(mot))
    ) {
      ajouter(x); // une redirection : `&>fichier`, `2>&1`, `>|fichier`
      i++;
    } else if (x === '|') {
      finir();
      out.push({ op: suivant === '|' ? '||' : '|' });
      i += suivant === '|' || suivant === '&' ? 2 : 1;
    } else if (x === ';') {
      if (suivant === ';') return null;
      finir();
      out.push({ op: ';' });
      i++;
    } else if (x === '&' || x === '(' || x === ')') {
      finir();
      out.push({ op: x });
      i++;
    } else {
      ajouter(x);
      i++;
    }
  }
  finir();
  return out;
}

/**
 * Les mots de commande que la lecture ne sait pas JUGER : une condition, une branche, une boucle,
 * une fonction, un groupe entre accolades, un piège. Leur seule présence fait tenir la ligne ENTIÈRE
 * pour n'appelant rien.
 */
const CONSTRUCTIONS_NON_JUGEES = new Set([
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'case',
  'esac',
  'for',
  'while',
  'until',
  'do',
  'done',
  'select',
  'function',
  'coproc',
  'trap',
  '{',
  '}',
]);
/** Les commandes après lesquelles plus rien de la ligne ne s'exécute. */
const FINS_DE_LIGNE = new Set(['exit', 'return', 'exec']);

/**
 * CE QU'UNE LIGNE DE COMMANDE APPELLE VRAIMENT — les scripts `package.json` et les fichiers lancés
 * par une commande ATTEIGNABLE dont le statut compte (GOV-061, fait (a) ; refus d'exactitude sur la
 * PR 175). Une garde citée dans un `name:`, un argument d'`echo` ou une chaîne n'est pas appelée ; une
 * garde qu'on n'atteint pas, ou dont l'échec ne peut pas faire échouer la ligne, non plus. Une
 * commande ne compte que si elle est au niveau de la ligne (hors sous-shell, hors substitution),
 * n'est opérande d'aucun `||` (à droite elle est court-circuitée, à gauche son échec est rattrapé),
 * n'est dans aucun pipeline (le statut d'un pipeline est celui de sa DERNIÈRE commande), n'est pas
 * lancée en arrière-plan (`&`) ni niée (`!`), ne suit aucun `exit`/`return`/`exec` de la ligne, et
 * n'est pas enchaînée par `&&` derrière un `false`, une négation ou un sous-shell.
 * ÉCHEC FERMÉ, PRIX ASSUMÉ : une ligne que le lexer refuse, ou qui porte une construction qu'il ne
 * juge pas (`if`, `case`, boucle, fonction, groupe `{ … }`, `trap`, document en ligne), n'appelle
 * RIEN — même une garde qu'elle lance réellement. Celle-ci est alors tenue pour NON appelée : c'est la
 * ligne qu'il faut simplifier, ou le `horsCi` qu'il faut motiver.
 */
function appelsDe(commande: string): Appels {
  const a: Appels = { scripts: new Set(), fichiers: new Set() };
  const jetons = jetonsShell(commande);
  if (jetons === null) return a;
  interface Commande {
    mots: string[];
    avant: string | null;
    apres: string | null;
    profondeur: number;
  }
  const commandes: Commande[] = [];
  let courante: string[] = [];
  let avant: string | null = null;
  let profondeur = 0;
  for (const j of jetons) {
    if ('mot' in j) {
      courante.push(j.mot);
      continue;
    }
    if (j.op === '(') {
      if (courante.length > 0) return a; // `nom()` : une définition de fonction
      profondeur++;
      continue;
    }
    commandes.push({ mots: courante, avant, apres: j.op, profondeur });
    courante = [];
    if (j.op === ')' && --profondeur < 0) return a;
    avant = j.op;
  }
  commandes.push({ mots: courante, avant, apres: null, profondeur });
  if (profondeur !== 0) return a;
  const premierMot = (mots: readonly string[]): string | undefined =>
    mots.find((m) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(m));
  if (commandes.some((k) => CONSTRUCTIONS_NON_JUGEES.has(premierMot(k.mots) ?? ''))) return a;

  let termine = false;
  let chaineFausse = false;
  for (const k of commandes) {
    if (k.avant === null || k.avant === ';' || k.avant === '\n' || k.avant === '&') {
      chaineFausse = false;
    }
    const premier = premierMot(k.mots);
    const compte =
      !termine &&
      !chaineFausse &&
      k.profondeur === 0 &&
      premier !== '!' &&
      k.apres !== '&' &&
      ![k.avant, k.apres].some((o) => o === '||' || o === '|');
    if (compte && k.mots.length > 0) lireUneCommande(k.mots, a);
    if (premier !== undefined && FINS_DE_LIGNE.has(premier)) termine = true;
    if (premier === 'false' || premier === '!' || k.apres === ')') chaineFausse = true;
  }
  return a;
}

/** Les scripts de `package.json`, lus ; `{}` si le fichier est illisible (rien n'y est défini). */
function scriptsDuPaquet(packageJson: string): Record<string, string> {
  try {
    const pkg = JSON.parse(packageJson || '{}') as { scripts?: unknown };
    if (!estObjet(pkg.scripts)) return {};
    return Object.fromEntries(
      Object.entries(pkg.scripts).filter((e): e is [string, string] => typeof e[1] === 'string')
    );
  } catch {
    return {};
  }
}

/**
 * Ce que les commandes données APPELLENT, suivi à travers `package.json` : `pnpm a` qui vaut
 * `pnpm b && tsx f.ts` appelle `a`, `b` et `f.ts`. Une garde lancée par un script composé est
 * donc vue appelée ; une garde seulement NOMMÉE ne l'est pas.
 */
function appelsSuivis(
  commandes: readonly string[],
  scripts: Readonly<Record<string, string>>,
  lire: (commande: string) => Appels = appelsDe
): Appels {
  const tous: Appels = { scripts: new Set<string>(), fichiers: new Set<string>() };
  const file = [...commandes];
  while (file.length > 0) {
    const a = lire(file.pop()!);
    for (const f of a.fichiers) tous.fichiers.add(f);
    for (const s of a.scripts) {
      if (tous.scripts.has(s)) continue;
      tous.scripts.add(s);
      if (Object.hasOwn(scripts, s)) file.push(scripts[s]!);
    }
  }
  return tous;
}

/** Les commandes des réglages `.claude/settings.json` : toute valeur de clé `command`, à toute profondeur. */
function commandesDesReglages(hooks: string): string[] {
  let racine: unknown;
  try {
    racine = JSON.parse(hooks || '{}');
  } catch {
    return [];
  }
  const out: string[] = [];
  const pile: unknown[] = [racine];
  while (pile.length > 0) {
    const n = pile.pop();
    if (Array.isArray(n)) pile.push(...(n as unknown[]));
    else if (estObjet(n)) {
      for (const [k, v] of Object.entries(n)) {
        if (k === 'command' && typeof v === 'string') out.push(v);
        else pile.push(v);
      }
    }
  }
  return out;
}

/** Le nom d'une étape lue, dans la convention de `EtapeFigee.nom`. */
function nomDEtape(champs: Record<string, unknown>): string {
  const texte = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);
  const uses = texte(champs.uses);
  const run = texte(champs.run);
  return (
    texte(champs.name) ??
    (uses !== undefined ? `uses: ${uses}` : run !== undefined ? `run: ${run}` : '—')
  );
}

/** Une valeur lue de l'arbre YAML, écrite pour un message : une chaîne telle quelle, le reste en JSON. */
function ecrite(v: unknown): string | undefined {
  return typeof v === 'string' ? v : v === undefined ? undefined : JSON.stringify(v);
}

/**
 * La forme CANONIQUE d'une valeur lue de l'arbre YAML : du JSON dont les clés de chaque objet sont
 * triées. YAML n'ordonne pas les clés, et `{ a, b }` écrit en accolades vaut le bloc indenté.
 */
function canonique(v: unknown): string {
  const trie = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(trie)
      : estObjet(x)
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, trie(x[k])])
          )
        : x;
  return JSON.stringify(trie(v)) ?? 'undefined';
}

/**
 * Les clés où ce qu'on LIT diverge de ce qui est FIGÉ — ajoutées, retirées ou modifiées, sous leur
 * forme canonique —, hors celles qu'une famille dédiée juge à part. ÉCHEC FERMÉ : une clé inconnue
 * du constat est une divergence, jamais une clé « sans effet connu ».
 */
function clesDivergentes(
  lu: Record<string, unknown>,
  fige: Readonly<Record<string, unknown>>,
  aPart: ReadonlySet<string>
): { cle: string; lu: string; fige: string }[] {
  const cles = [...new Set([...Object.keys(lu), ...Object.keys(fige)])]
    .filter((c) => !aPart.has(c))
    .sort();
  const forme = (o: Readonly<Record<string, unknown>>, c: string): string =>
    Object.hasOwn(o, c) ? canonique(o[c]) : '(absente)';
  return cles
    .map((cle) => ({ cle, lu: forme(lu, cle), fige: forme(fige, cle) }))
    .filter((d) => d.lu !== d.fige);
}

/**
 * La tolérance d'échec sous sa forme ÉVALUÉE (le fait (d) de GOV-061). La clé `continue-on-error`
 * n'est admise qu'avec la seule valeur qui ne tolère rien, `false` écrit en toutes lettres : une
 * expression (`${{ true }}`, `${{ 1 }}`), une chaîne, ou n'importe quel autre scalaire est une
 * tolérance qu'on ne sait pas évaluer — et ce qu'on ne sait pas évaluer est refusé.
 */
function tolereLEchec(champs: Record<string, unknown>): string | null {
  if (!Object.hasOwn(champs, 'continue-on-error')) return null;
  const v = champs['continue-on-error'];
  return v === 'false' ? null : JSON.stringify(v);
}

export interface ConfrontationDeLaPorteA {
  /** Le nombre d'étapes du job RÉELLEMENT confrontées au constat — le compte que le vert imprime. */
  readonly etapes: number;
  /** Le nombre de scripts de `package.json` confrontés à leur définition figée. */
  readonly scripts: number;
  readonly fautes: readonly Faute[];
}

/**
 * LA DÉFINITION UNIQUE DE « ÉTAPE PRÉSENTE, ACTIVE ET EFFECTIVE » (GOV-061, REQ-QA-013), appliquée
 * à TOUTES les étapes du job de la porte A — et non aux seules étapes qui lancent un script de
 * `scripts/gates/` :
 *   — PRÉSENTE : chaque étape figée est dans le job (`etape_absente`), et le job ne porte aucune
 *     étape que le constat ignore (`etape_non_figee`) ;
 *   — ACTIVE : sa condition `if:` — et celle du job — est celle du constat (`etape_conditionnee`),
 *     et aucune tolérance d'échec, sous aucune forme évaluée, ne la désarme (`etape_toleree`) ;
 *   — EFFECTIVE : elle lance la commande du constat (`etape_repointee`), et le script de
 *     `package.json` que cette commande invoque a la définition du constat (`script_repointe`) ;
 *   — ENTIÈRE : toutes ses AUTRES clés — et toutes celles du job, et celles du workflow hors `jobs`
 *     — sont celles du constat, sous leur forme canonique ; une clé ajoutée, retirée ou modifiée
 *     est refusée en la nommant (`porte_a_alteree`). Un `shell:`, des `defaults:`, un `env:` ou un
 *     `with: ref:` changent ce que la commande EXÉCUTE, ou l'arbre qu'elle mesure, sans changer la
 *     commande : `etape_repointee`, qui ne lit que `run` et `uses`, ne les voit pas ;
 *   — UNIQUE : deux étapes de même nom sont refusées (`etape_en_double`) — la confrontation est
 *     indexée par nom, et la seconde y échappait.
 * Un workflow qu'on ne sait pas lire, ou qui ne porte pas le job, est un refus
 * (`porte_a_illisible`) : on ne déclare pas armée une porte qu'on n'a pas lue.
 */
export async function confronterLaPorteA(vue: Vue): Promise<ConfrontationDeLaPorteA> {
  const fautes: Faute[] = [];
  const illisible = (pourquoi: string): ConfrontationDeLaPorteA => ({
    etapes: 0,
    scripts: 0,
    fautes: [
      {
        famille: 'porte_a_illisible',
        message:
          `\`${WORKFLOW_DE_LA_PORTE_A}\` — ${pourquoi}. On ne déclare pas armée une porte qu'on ` +
          `n'a pas lue : la confrontation ÉCHOUE FERMÉE.`,
      },
    ],
  });
  const figee = vue.porteA;
  if (figee === undefined) return illisible('aucun constat de la porte A n’est fourni à la garde');
  const fichier = vue.workflows.find((w) => w.chemin === WORKFLOW_DE_LA_PORTE_A);
  if (fichier === undefined) return illisible('le fichier n’est pas suivi');
  let workflow: unknown;
  try {
    workflow = await lireYaml(fichier.source);
  } catch (e) {
    return illisible(
      `l'analyseur YAML partagé le refuse (${e instanceof Error ? e.message : String(e)})`
    );
  }
  const jobs = estObjet(workflow) && estObjet(workflow.jobs) ? workflow.jobs : {};
  const job = jobs[figee.job];
  if (!estObjet(job) || !Array.isArray(job.steps)) {
    return illisible(`aucun job \`${figee.job}\` portant une liste d'étapes`);
  }
  const aRetenir =
    'Si le changement est VOULU, fige-le dans `PORTE_A_FIGEE` ' +
    '(`scripts/gates/gov-conventions.ts`), dans le même diff.';

  // ── le JOB lui-même : sa condition et sa tolérance désarment TOUTES ses étapes ──
  const siDuJob = ecrite(job.if) ?? null;
  if (siDuJob !== figee.si) {
    fautes.push({
      famille: 'etape_conditionnee',
      message:
        `le job \`${figee.job}\` porte la condition ${JSON.stringify(siDuJob)} au lieu de ` +
        `${JSON.stringify(figee.si)} : une condition de JOB saute TOUTES ses étapes, et un job ` +
        `sauté se lit « skipped », sans aucun rouge. ${aRetenir}`,
    });
  }
  const toleranceDuJob = tolereLEchec(job);
  if (toleranceDuJob !== null) {
    fautes.push({
      famille: 'etape_toleree',
      message:
        `le job \`${figee.job}\` porte \`continue-on-error: ${toleranceDuJob}\` : toutes ses étapes ` +
        `peuvent échouer sans que la porte rougisse. Seul \`false\` écrit en toutes lettres est admis.`,
    });
  }

  // ── le workflow et le job ENTIERS : toute autre clé change ce que le job exécute ──
  const alterees = (
    ou: string,
    lu: Record<string, unknown>,
    fige: Readonly<Record<string, unknown>>,
    aPart: ReadonlySet<string>
  ): void => {
    for (const d of clesDivergentes(lu, fige, aPart)) {
      fautes.push({
        famille: 'porte_a_alteree',
        message:
          `${ou} porte \`${d.cle}: ${d.lu}\` au lieu de \`${d.cle}: ${d.fige}\`. Une clé que le ` +
          `constat ne porte pas — un \`shell:\` qui rend toujours 0, des \`defaults:\`, un \`env:\`, ` +
          `un \`with: ref:\` qui fait mesurer un autre arbre — désarme sans changer la commande : ` +
          `l'étape, le job et le workflow sont figés ENTIERS. ${aRetenir}`,
      });
    }
  };
  alterees(
    `le workflow \`${WORKFLOW_DE_LA_PORTE_A}\``,
    estObjet(workflow) ? workflow : {},
    figee.workflow,
    CLES_DE_WORKFLOW_JUGEES_A_PART
  );
  alterees(`le job \`${figee.job}\``, job, figee.cles, CLES_DE_JOB_JUGEES_A_PART);

  // ── les étapes, une par une ──
  const lues = job.steps.map((e: unknown) => (estObjet(e) ? e : {}));
  const parNom = new Map(lues.map((e) => [nomDEtape(e), e]));
  const figees = new Map(figee.etapes.map((e) => [e.nom, e]));
  // UNIQUE : deux étapes de même nom se confondraient dans ces tables, et la seconde ne serait
  // jamais confrontée. Le constat lui-même est soumis à la même règle.
  const enDouble = (noms: readonly string[]): string[] =>
    [...new Set(noms.filter((n, i) => noms.indexOf(n) !== i))].sort();
  for (const [ou, noms] of [
    [`le job \`${figee.job}\``, lues.map(nomDEtape)],
    ['le constat `PORTE_A_FIGEE`', figee.etapes.map((e) => e.nom)],
  ] as const) {
    for (const nom of enDouble(noms)) {
      fautes.push({
        famille: 'etape_en_double',
        message:
          `${ou} porte plusieurs étapes nommées « ${nom} ». La confrontation est indexée par nom : ` +
          `une seule serait jugée, et l'autre — n'importe laquelle de ses clés — passerait sans ` +
          `un rouge. Donnez à chaque étape un nom unique. ${aRetenir}`,
      });
    }
  }
  for (const f of figee.etapes) {
    if (parNom.has(f.nom)) continue;
    fautes.push({
      famille: 'etape_absente',
      message:
        `l'étape « ${f.nom} » (\`${f.run ?? f.uses ?? '—'}\`) n'est plus dans le job ` +
        `\`${figee.job}\` — retirée, ou réduite à un commentaire. Ce qu'elle mesurait ne l'est plus ` +
        `nulle part, et rien d'autre ne le dirait. ${aRetenir}`,
    });
  }
  for (const [nom, e] of parNom) {
    const f = figees.get(nom);
    if (f === undefined) {
      fautes.push({
        famille: 'etape_non_figee',
        message:
          `l'étape « ${nom} » du job \`${figee.job}\` n'est pas au constat de la porte A : sans lui, ` +
          `son retrait futur ne rougirait rien. ${aRetenir}`,
      });
      continue;
    }
    const si = ecrite(e.if);
    if (si !== f.si) {
      fautes.push({
        famille: 'etape_conditionnee',
        message:
          `l'étape « ${nom} » porte la condition ${si === undefined ? '(aucune)' : `« ${si} »`} au ` +
          `lieu de ${f.si === undefined ? '(aucune)' : `« ${f.si} »`}. Une condition toujours fausse ` +
          `désarme l'étape sans bruit : elle se lit « skipped ». ${aRetenir}`,
      });
    }
    const tolerance = tolereLEchec(e);
    if (tolerance !== null) {
      fautes.push({
        famille: 'etape_toleree',
        message:
          `l'étape « ${nom} » porte \`continue-on-error: ${tolerance}\`. La valeur est lue sous sa ` +
          `forme ÉVALUÉE : toute autre écriture que \`false\` tolère l'échec, et une étape qui peut ` +
          `échouer sans faire rougir la porte ne garde rien.`,
      });
    }
    for (const cle of ['run', 'uses'] as const) {
      const lu = typeof e[cle] === 'string' ? (e[cle] as string).trim() : undefined;
      if (lu === f[cle]) continue;
      fautes.push({
        famille: 'etape_repointee',
        message:
          `l'étape « ${nom} » porte \`${cle}: ${lu ?? '(absent)'}\` au lieu de ` +
          `\`${f[cle] ?? '(absent)'}\` : elle ne lance plus ce qu'on croit qu'elle mesure — une ` +
          `tolérance écrite dans le shell (\`|| true\`) est une tolérance comme une autre. ${aRetenir}`,
      });
    }
    alterees(`l'étape « ${nom} »`, e, f.cles ?? {}, CLES_D_ETAPE_JUGEES_A_PART);
  }

  // ── les scripts de `package.json` que ces étapes lancent : figés, donc non repointables ──
  let pkg: Record<string, unknown>;
  try {
    const lu: unknown = JSON.parse(vue.packageJson || '{}');
    pkg = estObjet(lu) ? lu : {};
  } catch {
    return illisible(
      '`package.json` est illisible : les scripts que la porte lance n’ont pas de source'
    );
  }
  const scripts: Record<string, unknown> = estObjet(pkg.scripts) ? pkg.scripts : {};

  // ── la configuration pnpm/npm de la racine : elle change ce que `pnpm <script>` exécute ──
  const suivis = new Set(vue.fichiersSuivis);
  const configuration = [
    ...figee.paquet.fichiersAbsents
      .filter((f) => suivis.has(f))
      .map((f) => `le fichier \`${f}\`, suivi à la racine,`),
    ...figee.paquet.clesAbsentes
      .filter((k) => Object.hasOwn(pkg, k))
      .map((k) => `la clé \`${k}\` de \`package.json\``),
  ];
  for (const ou of configuration) {
    fautes.push({
      famille: 'porte_a_alteree',
      message:
        `${ou} configure le gestionnaire de paquets, que le constat fige ABSENT : un ` +
        `\`script-shell\`, un crochet ou un réglage de scripts change ce que CHAQUE ` +
        `\`pnpm <script>\` de la porte exécute, sans toucher ni à l'étape ni au script. ${aRetenir}`,
    });
  }
  for (const [nom, definition] of Object.entries(figee.scripts)) {
    const lue = scripts[nom];
    if (lue === definition) continue;
    fautes.push({
      famille: 'script_repointe',
      message:
        `\`package.json\` — le script \`${nom}\`, lancé par une étape de la porte A, vaut ` +
        `${JSON.stringify(lue ?? null)} au lieu de ${JSON.stringify(definition)}. L'étape garde son ` +
        `nom et sa commande, et ne mesure plus rien : c'est le repointage que seule une suite ` +
        `de tests, ou une nuit déjà rouge, rattrapait. ${aRetenir}`,
    });
  }
  return { etapes: lues.length, scripts: Object.keys(figee.scripts).length, fautes };
}

/** Le décompte de la porte A, RENDU : une confrontation qu'on n'imprime pas ne se relit pas. */
export function lignesDeLaPorteA(c: ConfrontationDeLaPorteA): string[] {
  return [
    `PORTE A — ${c.etapes} étape(s) du job confrontée(s) au constat, chacune présente, active, ` +
      `effective et ENTIÈRE (toutes ses clés), le job et le workflow hors \`jobs\` figés de même ; ` +
      `${c.scripts} script(s) de \`package.json\` confronté(s) à leur définition figée.`,
  ];
}

// ── le périmètre, dit et compté ──────────────────────────────────────────────────────────────

export interface PerimetreVu extends Perimetre {
  readonly compte: number;
  readonly unite: string;
}

/** Le dossier où vivent les gardes de ce dépôt. Le préfixe est écrit UNE fois. */
export const DOSSIER_DES_GARDES = 'scripts/gates/';

// ── comparer un chemin, c'est le normaliser (GOV-051, REQ-GOV-029) ───────────────────────────

/**
 * LA PRIMITIVE UNIQUE DE COMPARAISON DE CHEMINS DE CE FICHIER.
 *
 * « La propriété protégée n'est pas une propriété du CHEMIN, c'est une propriété de la
 * COMPARAISON. » Un `startsWith('axionia/')` brut était défait par cinq familles, chacune jouée de
 * bout en bout le 2026-09-12 : (1) un caractère de la classe C en tête ; (2) un caractère sans
 * glyphe hors de cette classe — remplisseur hangul, braille vide, marque non espaçante ; (3) un
 * homoglyphe ; (4) la casse ; (5) une forme non canonique. Le schéma (GOV-050) ferme (1) et (5)
 * pour ses écrivains ; aucune clause de forme ne ferme (2) ni (3), et deux lentilles ont refusé
 * d'en exiger l'inventaire. La défense est donc ICI, à la lecture, dans cet ordre :
 *
 *   1. la forme de compatibilité (NFKD) : un `ａ` pleine chasse devient `a`, une lettre accentuée
 *      se sépare de sa marque ;
 *   2. on RETIRE ce qui ne s'écrit pas : classe C, marques (`\p{M}`), points de code ignorables par
 *      défaut (`Default_Ignorable_Code_Point`, dont le remplisseur hangul), et les blancs Unicode en
 *      bordure de segment ;
 *   3. la forme canonique : antislash lu comme séparateur, segments vides et `.` retirés, `..`
 *      résolu — un remontant en tête reste un segment `..`, qui ne désigne rien du dépôt. ⚠️ SEULS
 *      LES POINTS ÉCRITS SE RÉSOLVENT : les segments sont découpés sur la forme ÉCRITE, puis
 *      nettoyés un à un. Un segment qui ne devient `.`, `..` ou vide QU'APRÈS les étapes 1 et 2
 *      n'est ni retiré ni résolu : il devient `SEGMENT_INDECIDABLE`, et la comparaison est
 *      indécidable. Nettoyer PUIS résoudre laissait un segment fabriqué par le nettoyage manger le
 *      segment `axionia` — le verdict tombait à `non`, la seule réponse qui laisse passer (veto
 *      sécurité de la PR 158) ;
 *   4. la CASSE EST TRANCHÉE, et tranchée insensible : sur les systèmes de fichiers par défaut de
 *      Windows et de macOS, `AXIONIA/` désigne le même dossier que `axionia/` — les postes des
 *      agents sont des Windows ;
 *   5. ce qui reste hors de l'ASCII imprimable dans un segment comparé est INDÉCIDABLE : un `а`
 *      cyrillique ou un braille vide ne se ramène à rien sans une table de confusables, et une
 *      table serait l'inventaire que deux lentilles ont refusé. La primitive le DIT, et l'appelant
 *      échoue fermé.
 *
 * CE QU'ELLE NE PRÉTEND PAS : rendre la comparaison infaillible. Elle ne décode aucun
 * percent-encodage (le schéma le refuse) et ne suit aucun lien symbolique.
 *
 * ⚠️ LES AUTRES GARDES QUI COMPARENT DES CHEMINS NE PASSENT PAS ENCORE PAR ELLE — comptées, pas
 * tues : `scripts/lot/composer.ts` (collisions par égalité de chaîne, `pris.has`),
 * `scripts/lot/paths-proposes.ts` (le préfixe `axionia/`, deux fois), `scripts/lot/chemins-de-tache.ts`
 * (`declares` / `promis`, par égalité), `scripts/lot/integrer.ts` (égalité et préfixe de dossier),
 * `scripts/lot/revues.ts` (`touche()`, qu'appelle `scripts/gates/gov-pr.ts` pour confronter les
 * fichiers de la PR aux `paths`) et `scripts/gates/gov-attributions.ts` (`estGabarit`). Six
 * fichiers, hors du périmètre de GOV-051. ET DANS CE FICHIER MÊME : `confronterDisqueEtRegistre()`
 * trie la population par la primitive, mais apparie ensuite les entrées du registre aux fichiers
 * suivis par ÉGALITÉ BRUTE (`duDossier.includes(g.script)`, `g.script === f`). Une écriture
 * différente du même script y tombe du côté fermé — la garde écrite sort « hors registre », une
 * faute, et l'entrée est rendue « sans script » —, jamais du côté muet ; elle n'est pas pour autant
 * comparée.
 */
export const DEPOT_VOISIN = 'axionia';

const IMPRIMABLE_ASCII = /^[\x20-\x7e]*$/;

/**
 * Le segment qu'un nettoyage a FABRIQUÉ (étape 3) : il tient la place d'un `.`, d'un `..` ou d'un
 * vide qui n'était pas écrit. Un caractère de la classe C ne survit pas au nettoyage : aucun
 * segment nettoyé ne peut lui être égal.
 */
export const SEGMENT_INDECIDABLE = '\u0000';

const PAS_UN_NOM = new Set(['', '.', '..']);

/** Les étapes 1, 2 et 4 sur UN segment écrit — qui peut, lui, porter une barre de compatibilité. */
function nettoyer(segment: string): string[] {
  return segment
    .normalize('NFKD')
    .replace(/[\p{C}\p{M}\p{Default_Ignorable_Code_Point}]/gu, '')
    .toLowerCase()
    .split(/[\\/]/)
    .map((s) => s.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''));
}

/** Les segments d'un chemin sous sa forme de COMPARAISON (étapes 1 à 4 ci-dessus). */
export function formeDeComparaison(chemin: string): string[] {
  const segments: string[] = [];
  for (const ecrit of chemin.split(/[\\/]/)) {
    for (const s of nettoyer(ecrit)) {
      // Un point, un remontant ou un vide que l'écriture ne portait pas : signalé, jamais résolu.
      if (PAS_UN_NOM.has(s) && s !== ecrit) segments.push(SEGMENT_INDECIDABLE);
      else if (s === '' || s === '.') continue;
      else if (s === '..' && segments.length > 0 && segments[segments.length - 1] !== '..')
        segments.pop();
      else segments.push(s);
    }
  }
  return segments;
}

/**
 * Le chemin désigne-t-il le dossier `dossier` ou ce qui vit dessous ? `indecidable` quand un segment
 * a été FABRIQUÉ par le nettoyage (il peut être un remontant : sa place ne borne rien), ou quand un
 * segment confronté à ceux du dossier porte encore, normalisé, un caractère hors de l'ASCII
 * imprimable — l'appelant échoue fermé.
 */
export function estSousLeDossier(chemin: string, dossier: string): 'oui' | 'non' | 'indecidable' {
  const c = formeDeComparaison(chemin);
  const d = formeDeComparaison(dossier);
  if (d.length === 0) return 'non';
  if (c.includes(SEGMENT_INDECIDABLE)) return 'indecidable';
  if (c.length >= d.length && d.every((s, i) => c[i] === s)) return 'oui';
  // Les segments confrontés à ceux du dossier — TOUS ceux du chemin s'il est plus court : un seul
  // segment illisible peut porter, en lettres qui ressemblent à des barres, le dossier entier.
  return c.slice(0, d.length).some((s) => !IMPRIMABLE_ASCII.test(s)) ? 'indecidable' : 'non';
}
/**
 * L'extension qui fait entrer un fichier suivi dans la population de DÉPART.
 * ⚠️ LIMITE DÉCLARÉE, pas supposée : trois fichiers `.js` suivis vivent sous `scripts/gates/`
 * (`gh-sur.js`, `git-push-sur.js`, `hook-env.js`, mesuré le 2026-09-17), et ils n'entrent pas dans
 * cette population. Les deux premiers sont des enveloppes de sûreté, pas des gardes ; le troisième
 * EST une garde, et il reste jugé sur son câblage parce que le registre le NOMME — voir `jugees`.
 * Les taire serait refaire, une extension plus loin, l'exemption silencieuse que GOV-044 ferme :
 * `confronterDisqueEtRegistre()` les rend donc dans `horsExtension`, et le rendu les imprime.
 */
export const EXTENSION_DES_GARDES = '.ts';

/**
 * LES DEUX POPULATIONS, ET LEUR CONFRONTATION (GOV-044, REQ-GOV-012).
 *
 * ── CE QUI CHANGE, ET POURQUOI ────────────────────────────────────────────────────────────────
 * La population partait du REGISTRE : `vue.gates.filter(g => g.phase <= -1 && …)`. Un script écrit
 * sur le disque et absent de `docs/gates.json` n'était donc jamais confronté à la question de
 * savoir si quelqu'un l'appelle — le trou s'exemptait lui-même, et la garde sortait en ZÉRO.
 * Mesuré le 2026-09-17 sur `7f83007` : 26 fichiers `scripts/gates/*.ts` suivis, DEUX absents du
 * registre (`gov-attestation.ts` et `gov-attributions.ts`), et `pnpm gov:conventions` imprimait
 * « 25 garde(s) » puis « aucune violation ». *Une population dérivée de la présence du correctif ne
 * verra jamais celui qui le PERD.*
 * La population part maintenant du DISQUE, et le registre est ce qu'on lui confronte.
 *
 * ── LA DÉCISION SUR `phase`, ÉCRITE ICI PARCE QU'ELLE NE SE DEVINE PAS ────────────────────────
 * Le filtre `g.phase <= -1` n'est PAS reconduit, et son abandon n'est pas une perte par distraction.
 * Un script n'a pas de phase : en dérivant du disque, ce filtre n'a plus de source. Le recopier
 * serait taper une liste (RM-01) ; le laisser tomber en silence serait laisser entrer des gardes
 * de phase future non câblées.
 * Ce qu'il faisait vraiment, c'était tenir lieu de PROXY pour « cette garde est déjà écrite » — le
 * seul dont on disposait quand on partait du registre. Le disque donne le fait au lieu du proxy :
 * un fichier suivi par git EST écrit. Ce que le filtre protégeait reste donc protégé, et par une
 * meilleure clause — une gate promise à la phase 3 dont le script n'existe pas ne peut pas entrer
 * dans une population tirée des fichiers suivis. Ce qu'il protégeait EN TROP — une garde écrite,
 * suivie, et exemptée de la question par le seul numéro de phase de son entrée — est exactement
 * l'auto-exemption que GOV-044 ferme.
 * MESURE QUI REND LA DÉCISION SÛRE plutôt qu'aveugle, 2026-09-17 : des 26 scripts suivis, UN SEUL
 * porte au registre une entrée de phase supérieure à -1 (`partners:schema:enums`, phase 0) — et il
 * est câblé dans `.github/workflows/ci.yml`. La levée du filtre ne fabrique donc aucun rouge
 * aujourd'hui. Elle en fabriquera un le jour où une garde de phase 0 sera écrite sans être ni
 * câblée ni déclarée hors CI, et ce rouge-là sera JUSTE.
 * Trois témoins gardent ce choix dans
 * `tests/unit/gouvernance/perimetre-des-gardes-derive-du-disque.spec.ts` : phase 0 non câblée
 * (rouge), phase 0 câblée (vert), phase future non écrite (silence).
 */
export interface Confrontation {
  /** Les gardes ÉCRITES : fichiers suivis sous `scripts/gates/` en `.ts`. Le point de DÉPART. */
  readonly surLeDisque: readonly string[];
  /** Les entrées du registre qui nomment une garde présente sur le disque — ce qu'on JUGE. */
  readonly jugees: readonly GateVue[];
  /** Les gardes écrites que le registre ne nomme pas. LE trou que GOV-044 ferme. */
  readonly horsRegistre: readonly string[];
  /**
   * Les entrées du registre sous `scripts/gates/` dont le script n'est pas suivi — le silence que
   * GOV-083 fait parler. Elles se répartissent EXACTEMENT entre `promises` et `fautives`.
   */
  readonly entreesSansScript: readonly GateVue[];
  /** Les fichiers suivis du dossier que l'extension exclut. La LIMITE, nommée. */
  readonly horsExtension: readonly string[];
  /**
   * LES TROIS SOUS-FAMILLES DE L'ENTRÉE SANS SCRIPT (GOV-083), distinguées au lieu de se taire :
   *   — `autreDepot` : le script vit sous `axionia/scripts/gates/`. Sorti du périmètre avec son
   *     MOTIF — ce dépôt ne peut ni lire ni câbler un fichier d'un autre dépôt ;
   *   — `promises` : la phase de l'entrée est FUTURE, ou la tâche qui la porte (`tache`) n'est pas
   *     livrée. Sortie avec sa phase et sa tâche : son absence est un fait attendu ;
   *   — `fautives` : phase courante ou passée, et aucune tâche non livrée ne la porte — ou, quelle
   *     que soit sa phase, un script de `package.json` la LANCE, donc la déclare écrite. Le script
   *     manque là où il est attendu : c'est un REFUS (`gate_sans_script`).
   * ⚠️ « Une autre tâche non livrée cite ce chemin dans ses paths » NE promet PAS : une tâche qui
   * RETOUCHE une garde la déclare, et supprimer la garde passerait alors pour « à venir ».
   */
  readonly autreDepot: readonly GateVue[];
  readonly promises: readonly { gate: GateVue; phase: number; porteur: string | null }[];
  readonly fautives: readonly GateVue[];
  /** Celles des `fautives` qu'un script de `package.json` lance : perdues, pas promises. */
  readonly lanceesParLePaquet: readonly GateVue[];
  /** La phase courante, DÉRIVÉE des tâches — `undefined` si aucune tâche ne la situe. */
  readonly phaseCourante: number | undefined;
}

/**
 * La phase courante : la plus petite phase qui porte encore une tâche non livrée, sinon la
 * dernière. LA MÊME définition que `docs/PLAN-STATE.md` (`scripts/plan-state/build.ts`), sur le
 * même vocabulaire (`LIVREE`). Une tâche sans phase ou sans statut ne situe rien.
 */
export function phaseCouranteDe(taches: readonly TacheVue[]): number | undefined {
  const situees = taches.filter(
    (t): t is TacheVue & { phase: number; statut: string } =>
      typeof t.phase === 'number' && typeof t.statut === 'string'
  );
  const phases = [...new Set(situees.map((t) => t.phase))].sort((a, b) => a - b);
  return (
    phases.find((p) => situees.some((t) => t.phase === p && !LIVREE.has(t.statut))) ?? phases.at(-1)
  );
}

/** Le dossier des gardes de l'AUTRE dépôt, tel qu'une entrée du registre l'écrit. */
const GARDES_DE_L_AUTRE_DEPOT = `${DEPOT_VOISIN}/${DOSSIER_DES_GARDES}`;

export function confronterDisqueEtRegistre(vue: Vue): Confrontation {
  // Par la primitive unique (GOV-051). Une écriture indécidable ENTRE dans la population : une
  // population de gardes à juger échoue fermée en jugeant plus, jamais en taisant.
  const sousLesGardes = (c: string) => estSousLeDossier(c, DOSSIER_DES_GARDES) !== 'non';
  const duDossier = vue.fichiersSuivis.filter(sousLesGardes);
  const surLeDisque = duDossier.filter((f) => f.endsWith(EXTENSION_DES_GARDES));
  const duRegistre = vue.gates.filter((g) => sousLesGardes(g.script));
  const entreesSansScript = duRegistre.filter((g) => !duDossier.includes(g.script));
  const phaseCourante = phaseCouranteDe(vue.taches);
  const statutDe = new Map(vue.taches.map((t) => [t.id, t.statut]));
  const promises: { gate: GateVue; phase: number; porteur: string | null }[] = [];
  const fautives: GateVue[] = [];
  // UN SCRIPT QUE `package.json` LANCE EST DÉCLARÉ ÉCRIT : son absence est une PERTE, pas une
  // promesse, quelle que soit la phase et quel que soit le statut de sa tâche. Mesuré sur la PR 175 :
  // `scripts/gates/migrations-additive.ts`, lancé par la porte A, retiré de l'index, sortait en zéro
  // rangé parmi les promesses, parce que sa tâche porteuse n'est pas livrée.
  const lances = appelsSuivis(
    Object.values(scriptsDuPaquet(vue.packageJson)),
    {},
    commandesNommees
  ).fichiers;
  const lanceesParLePaquet: GateVue[] = [];
  for (const g of entreesSansScript) {
    if (lances.has(g.script)) {
      fautives.push(g);
      lanceesParLePaquet.push(g);
      continue;
    }
    // ÉCHEC FERMÉ : sans phase courante, rien ne peut être dit « futur ».
    if (phaseCourante !== undefined && g.phase > phaseCourante) {
      promises.push({ gate: g, phase: g.phase, porteur: null });
      continue;
    }
    const porteurs = typeof g.tache === 'string' ? [g.tache] : [...(g.tache ?? [])];
    const porteur = porteurs.find((id) => {
      const statut = statutDe.get(id);
      return typeof statut === 'string' && !LIVREE.has(statut);
    });
    if (porteur !== undefined) promises.push({ gate: g, phase: g.phase, porteur });
    else fautives.push(g);
  }
  return {
    surLeDisque,
    horsExtension: duDossier.filter((f) => !f.endsWith(EXTENSION_DES_GARDES)),
    // Une entrée dont le script est SUIVI est jugée, quelle que soit son extension : `hook-env.js`
    // est une garde que le registre nomme et que `.claude/settings.json` câble. La dérivation du
    // disque ÉTEND la population, elle ne doit en retirer personne.
    jugees: duRegistre.filter((g) => duDossier.includes(g.script)),
    entreesSansScript,
    horsRegistre: surLeDisque.filter((f) => !duRegistre.some((g) => g.script === f)),
    // Une écriture indécidable n'est PAS sortie du périmètre : elle reste où elle tombe.
    autreDepot: vue.gates.filter(
      (g) => estSousLeDossier(g.script, GARDES_DE_L_AUTRE_DEPOT) === 'oui'
    ),
    promises,
    fautives,
    lanceesParLePaquet,
    phaseCourante,
  };
}

export function perimetresDe(vue: Vue): PerimetreVu[] {
  const compte = (cle: ClePerimetre): { compte: number; unite: string } => {
    switch (cle) {
      case 'modules-serveur':
        return {
          compte: vue.sources.filter((f) => estUnModuleServeur(f.source)).length,
          unite: 'module(s)',
        };
      case 'composants-client':
        return {
          compte: vue.sources.filter((f) => lignesClient(f.source).length > 0).length,
          unite: 'composant(s)',
        };
      case 'etapes-lint-ci':
        return { compte: etapesDeLint(vue).length, unite: 'étape(s)' };
      case 'taches-du-backlog':
        return { compte: vue.taches.length, unite: 'tâche(s)' };
      case 'gardes-du-disque':
        return {
          compte: confronterDisqueEtRegistre(vue).surLeDisque.length,
          unite: 'garde(s) écrite(s)',
        };
    }
  };
  return vue.perimetres.map((p) => ({ ...p, ...compte(p.cle) }));
}

// ── le contrôle ──────────────────────────────────────────────────────────────────────────────

export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];

  // ── les directives de frontière (gardes transposées d'axionia) ──
  for (const f of vue.sources) {
    if (estUnModuleServeur(f.source)) {
      for (const [motif, quoi] of EXPORTS_INTERDITS) {
        motif.lastIndex = 0;
        for (const m of f.source.matchAll(motif)) {
          fautes.push({
            famille: 'use_server_export_interdit',
            message:
              `${f.chemin} — un module « use server » exporte ${quoi} : « ${m[1] ?? '?'} ». Next ` +
              `refuse ces exports et le fichier ENTIER cesse de compiler. Déplacez la ` +
              `déclaration dans un module ordinaire et importez-la ici. ⚠️ Le message du build ` +
              `désigne la mauvaise cause (« Export … doesn't exist in target module ») : ne ` +
              `cherchez pas une faute d'import.`,
          });
        }
      }
      for (const m of f.source.matchAll(
        /^\s*export\s*\{[^}]*\}\s*(?:from\s*["'][^"']+["'])?\s*;/gm
      )) {
        fautes.push({
          famille: 'use_server_reexport',
          message:
            `${f.chemin} — ré-export dans un module « use server » : ` +
            `${(m[0] ?? '').replace(/\s+/g, ' ').trim()}. Chaque nom ré-exporté devient un point ` +
            `d'entrée HTTP public, appelable sans cookie et sans session. Importez depuis la ` +
            `source, ou écrivez une action nommée et gardée.`,
        });
      }
    }
    for (const i of lignesClient(f.source)) {
      const lignes = f.source.split('\n');
      const avant = (lignes[i - 1] ?? '').trim();
      const apres = (lignes[i + 1] ?? '').trim();
      if (!avant.includes('// use-client:') && !apres.includes('// use-client:')) {
        fautes.push({
          famille: 'use_client_sans_motif',
          message:
            `${f.chemin}:${i + 1} — directive « use client » sans justification. Collez un ` +
            `commentaire \`// use-client: <raison>\` juste avant ou juste après : franchir la ` +
            `frontière de rendu est une décision, elle s'explique en une ligne.`,
        });
      }
    }
  }

  // ── lint et format BLOQUANTS (REQ-GOV-018) ──
  const lint = etapesDeLint(vue);
  for (const e of lint) {
    if (TOLERANCE_ECRITE.test(e.bloc) || e.jobNonBloquant) {
      fautes.push({
        famille: 'lint_non_bloquant',
        message:
          `${e.workflow} — une étape qui lance le lint ou le format porte ` +
          `\`continue-on-error\`. REQ-GOV-018 dit « bloquants ». Une gate qui ne bloque rien ne ` +
          `garde rien : côté axionia, toutes les gates PR de budget portent ce drapeau, aucune ` +
          `PR qui alourdit le bundle n'y rougit, et la documentation a affirmé le contraire ` +
          `pendant des mois. Retirez le drapeau, ou retirez l'étape.`,
      });
    }
  }
  if (lint.length > 0) {
    const pkg = JSON.parse(vue.packageJson || '{}') as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const exige: ReadonlyArray<readonly [string, string, RegExp]> = [
      ['eslint', 'lint', /^eslint\.config\.(m?js|cjs|ts)$/],
      ['prettier', 'format:check', /^\.prettierrc(\.json|\.js|\.cjs)?$/],
    ];
    for (const [outil, script, config] of exige) {
      if (!lint.some((e) => e.outil === outil)) continue;
      const manque: string[] = [];
      if (!pkg.devDependencies?.[outil]) manque.push(`\`${outil}\` dans devDependencies`);
      if (!pkg.scripts?.[script]) manque.push(`le script \`${script}\``);
      if (!vue.fichiersSuivis.some((f) => config.test(f)))
        manque.push(`sa configuration versionnée`);
      if (manque.length > 0) {
        fautes.push({
          famille: 'outillage_non_epingle',
          message:
            `La CI lance ${outil}, mais il manque ${manque.join(', ')}. Un outil de format non ` +
            `épinglé et non configuré ne mesure rien de stable : il installe la croyance qu'un ` +
            `lint tourne. REQ-GOV-018 exige Prettier et ESLint VERSIONNÉS.`,
        });
      }
    }
  }

  // ── isolation des deux dépôts, sens Partners → axionia ──
  // La comparaison passe par `estSousLeDossier` (GOV-051) : un `startsWith` brut était défait par
  // cinq familles d'écriture du même chemin. Ce qu'elle ne sait pas comparer, elle le REFUSE.
  for (const t of vue.taches) {
    if (t.repo !== 'partners') continue;
    for (const p of t.paths) {
      const verdict = estSousLeDossier(p, DEPOT_VOISIN);
      if (verdict === 'non') continue;
      fautes.push({
        famille: 'isolation_depot',
        message:
          `${t.id} — tâche \`repo: partners\` qui revendique ${JSON.stringify(p)}, ` +
          (verdict === 'oui'
            ? `un chemin du dépôt voisin (forme comparée : \`${formeDeComparaison(p).join('/')}\`). `
            : `un chemin dont un segment porte, une fois normalisé, un caractère hors de ` +
              `l'ASCII imprimable, ou ne devient un point, un remontant ou un vide qu'après ` +
              `normalisation : la comparaison à \`${DEPOT_VOISIN}/\` est INDÉCIDABLE (un ` +
              `homoglyphe est une lettre ordinaire), et elle échoue fermée. `) +
          `Une tâche écrit dans UN dépôt : le composeur de lots suppose cet invariant ` +
          `pour ne jamais mêler deux dépôts dans un même lot. Le sens inverse est déjà gardé par ` +
          `tests/unit/gouvernance/paths-derives.spec.ts (REQ-GOV-025) ; celui-ci ne l'était pas.`,
      });
    }
  }

  // ── une garde écrite est INSCRITE, et elle est APPELÉE ──
  const confrontation = confronterDisqueEtRegistre(vue);
  for (const chemin of confrontation.horsRegistre) {
    fautes.push({
      famille: 'garde_hors_registre',
      message:
        `${chemin} est une garde écrite et suivie par git, et \`docs/gates.json\` ne la nomme ` +
        `nulle part. Tant qu'elle n'y est pas, PERSONNE ne lui demande jamais si quelqu'un ` +
        `l'appelle : le trou s'exempte lui-même, et cette garde-ci sortait en zéro pendant que ` +
        `deux gardes réelles y vivaient (mesure du 2026-09-17). Inscrivez son entrée au registre ` +
        `par ${outilHorsDepot('ajouter-entree.mjs')}, le seul verbe qui CRÉE une entrée ` +
        // ⚠️ Ces deux-ci sont NOMMÉS, pas prescrits : ils REFUSENT une entrée absente. Ils restent
        // en nom nu, et c'est le témoin qui l'exige — `perimetre-des-gardes-derive-du-disque.spec.ts`
        // distingue le verbe PRESCRIT (qualifié, donc résolvable) de ceux qu'on cite pour dire de ne
        // PAS les prendre. Les qualifier tous les trois rendrait ce témoin incapable de les séparer.
        '(`reecrire-champ` et `poser-champ` refusent une entrée absente) — ou retirez le fichier.',
    });
  }
  // ── une entrée du registre sans script : triée, et la fautive REFUSÉE (GOV-083) ──
  const passif = vue.passifSansScript ?? {};
  const motifDuPassif = (id: string): string =>
    Object.hasOwn(passif, id) ? (passif[id] ?? '').trim() : '';
  for (const g of confrontation.fautives) {
    const motif = motifDuPassif(g.id);
    if (motif.length >= MOTIF_MINIMAL) continue;
    const pourquoi = confrontation.lanceesParLePaquet.includes(g)
      ? `Un script de \`package.json\` le LANCE : il est déclaré écrit, et sa tâche, livrée ou non, ` +
        `ne le promet plus — il a été PERDU (retiré de l'index, renommé), pas encore à écrire`
      : `Phase courante : ${confrontation.phaseCourante ?? 'INDÉTERMINÉE'} — l'entrée n'est ` +
        `pas d'une phase future, et aucune tâche non livrée ne la porte (champ \`tache\` : ` +
        `${JSON.stringify(g.tache ?? null)}). Ce script n'existera donc jamais sous ce nom`;
    fautes.push({
      famille: 'gate_sans_script',
      message:
        `\`${g.id}\` (phase ${g.phase}) nomme \`${g.script}\`, introuvable parmi les fichiers ` +
        `suivis. ${pourquoi} : ` +
        `l'entrée est FAUTIVE, et c'est le silence que GOV-083 ferme — une garde qui ne voit pas ` +
        `ce qui manque la déclare conforme. Corrigez l'entrée (le script réel), rattachez-la à la ` +
        `tâche qui l'écrira, ou retirez-la${
          motif.length > 0
            ? ` ; son passif déclaré tient en ${motif.length} caractère(s), il en faut ${MOTIF_MINIMAL}`
            : ''
        }.`,
    });
  }
  const fautivesParId = new Set(confrontation.fautives.map((g) => g.id));
  for (const id of Object.keys(passif)) {
    if (fautivesParId.has(id)) continue;
    fautes.push({
      famille: 'passif_sans_script_perime',
      message:
        `Le passif des entrées sans script déclare \`${id}\`, qui n'est plus une entrée fautive — ` +
        `son script est suivi, sa tâche la porte encore, ou l'entrée a quitté le registre. Une ` +
        `tolérance qui ne sert plus absoudrait la PROCHAINE entrée de ce nom sans que personne l'ait ` +
        `examinée : retirez la ligne de \`PASSIF_SANS_SCRIPT\`.`,
    });
  }

  // EN POSITION DE COMMANDE (GOV-061, fait (a)) : une garde citée dans un commentaire, un `name:`
  // ou un `echo` n'est pas appelée. Seuls comptent les `run:` des workflows et les `command` des
  // réglages, lus par un analyseur puis par le lexer shell d'`appelsDe` — guillemets respectés, et
  // seulement les commandes ATTEIGNABLES dont le statut compte —, et ce qu'ils lancent à travers
  // `package.json`.
  const appels = appelsSuivis(
    [
      ...vue.workflows.flatMap((w) => valeursDeCle(w.source, 'run')),
      ...commandesDesReglages(vue.hooks),
    ],
    scriptsDuPaquet(vue.packageJson)
  );
  for (const g of confrontation.jugees) {
    const noms = [g.id, g.script, ...(g.alias ?? [])];
    if (noms.some((n) => appels.scripts.has(n) || appels.fichiers.has(n))) continue;
    const motif = (g.horsCi ?? '').trim();
    if (motif.length >= MOTIF_MINIMAL) continue;
    fautes.push({
      famille: 'garde_ecrite_jamais_appelee',
      message:
        `\`${g.id}\` (${g.script}) est écrite et n'est appelée par aucun workflow ni par ` +
        `\`.claude/settings.json\`. Côté axionia, \`qualiopi:isolation-check\` a vécu des mois ` +
        `dans cet état en cumulant 88 violations, pendant que la seule garde câblée affichait ` +
        `zéro. Une garde qu'on ne lance pas ne garde rien — câblez-la, retirez son entrée, ou, si ` +
        `son exécution hors CI est une DÉCISION, écrivez-la dans le champ \`horsCi\` de son ` +
        `entrée : il y faut au moins ${MOTIF_MINIMAL} caractères (il en fait ${motif.length}), ` +
        `parce qu'un champ qu'on remplit d'un mot est un mot de passe, pas une décision.`,
    });
  }

  // ── le périmètre vide se motive et se reprend ──
  const idsDeTaches = new Set(vue.taches.map((t) => t.id));
  for (const p of perimetresDe(vue)) {
    if (p.compte > 0) continue;
    const manque: string[] = [];
    if (p.motifSiVide.trim().length < MOTIF_MINIMAL) {
      manque.push(
        `un motif d'au moins ${MOTIF_MINIMAL} caractères (il en fait ${p.motifSiVide.trim().length})`
      );
    }
    if (!idsDeTaches.has(p.tacheSuccesseur)) {
      manque.push(`une tâche successeur connue du backlog (« ${p.tacheSuccesseur} » n'y est pas)`);
    }
    if (manque.length > 0) {
      fautes.push({
        famille: 'perimetre_vide_sans_motif',
        message:
          `Périmètre « ${p.libelle} » : 0 élément balayé, et il manque ${manque.join(' et ')}. ` +
          `Une garde à périmètre vide qui rend « ✅ » ne garde rien — c'est exactement ce que ` +
          `fait \`axionia/scripts/check-zod.ts\`, qui sort en 0 avec un avertissement quand son ` +
          `répertoire n'existe pas. Un périmètre vide se DIT, se motive, et nomme qui l'ouvrira.`,
      });
    }
  }

  return fautes;
}

// ── les périmètres déclarés pour CE dépôt ────────────────────────────────────────────────────

export const PERIMETRES_DECLARES: readonly Perimetre[] = [
  {
    cle: 'modules-serveur',
    libelle: 'modules « use server »',
    motifSiVide:
      "Partners n'a pas encore de dossier `src/` : aucune Server Action n'existe, donc la garde " +
      'balaie zéro fichier et ne prouve rien sur le dépôt. Elle est écrite et prouvée sur vues ' +
      "injectées dès maintenant parce que le défaut qu'elle attrape est invisible pour `tsc`, " +
      "pour ESLint et pour les tests unitaires : il n'apparaît qu'au build.",
    tacheSuccesseur: 'UX-P1-02',
  },
  {
    cle: 'composants-client',
    libelle: 'composants « use client »',
    motifSiVide:
      "Aucun composant n'est encore écrit dans ce dépôt. La règle est fixée par " +
      '`docs/CONVENTIONS.md` avant la première ligne de rendu, pour que le premier composant ' +
      "naisse déjà justifié plutôt qu'on ait à rattraper une centaine de directives ensuite.",
    tacheSuccesseur: 'UX-P0-02',
  },
  {
    cle: 'etapes-lint-ci',
    libelle: 'étapes de lint et de format en CI',
    motifSiVide:
      "CE PÉRIMÈTRE N'EST PLUS VIDE depuis GOV-031 (2026-09-14) : `ci.yml` porte les deux " +
      'étapes `pnpm lint` et `pnpm format:check`, sans `continue-on-error`. Le voir retomber à ' +
      'zéro ne voudrait donc plus dire « pas encore livré » mais « RETIRÉ » — ce motif est là ' +
      "pour que le jour où il se lira, on sache qu'il décrit une RÉGRESSION. La garde vérifie " +
      'la COHÉRENCE (bloquantes et épinglées) ; la PRÉSENCE, elle, est exigée par le dernier ' +
      'bloc de `tests/unit/gouvernance/gardes-transposees.spec.ts`, et la tâche successeur ' +
      'reste celle qui étend le refus à tout job de gate en phase 0.',
    tacheSuccesseur: 'QA-T01',
  },
  {
    cle: 'taches-du-backlog',
    libelle: 'tâches du backlog relues pour l’isolation des deux dépôts',
    motifSiVide:
      'Un backlog vide signifierait que `docs/tasks.json` ne se lit plus : la garde le dirait ' +
      "plutôt que de verdir. Ce périmètre n'est jamais censé être vide.",
    tacheSuccesseur: 'GOV-017a',
  },
  {
    cle: 'gardes-du-disque',
    libelle: 'gardes ÉCRITES (fichiers `scripts/gates/*.ts` suivis par git)',
    motifSiVide:
      'Un dossier de gardes vide signifierait que `git ls-files` ne se lit plus, ou ' +
      "qu'aucune garde n'est encore écrite. Ce périmètre n'est jamais censé être vide au socle, " +
      'et un zéro ici se lirait « aucune garde en faute » : exactement le silence que GOV-044 ferme.',
    tacheSuccesseur: 'QA-T00',
  },
];

// ── la vue réelle ────────────────────────────────────────────────────────────────────────────

/**
 * Les fichiers que la garde ne lit PAS comme du code : elle-même et son test. Tous deux portent
 * les directives en toutes lettres, dans des motifs et des témoins. Sans cette exemption, la
 * garde rougirait sur sa propre documentation — c'est la faute que `gov:identifiants` a payée
 * cinq fois.
 */
const EXEMPTS = [
  /^scripts\/gates\/gov-conventions\.ts$/,
  /^tests\//,
  /\.(spec|test)\.tsx?$/,
  /^docs\//,
];

/**
 * 🔴 RECONCILIATION : cette garde est arrivee de `gov-038` avec le patron que la PR #31 a ferme
 * pour les CINQ autres — `try/catch { return [] }` sur `git ls-files`. Elle N'EST PAS ENTREE EN
 * CONFLIT : un fichier ajoute d'UN SEUL cote ne se confronte a rien, et la chaine l'appelle
 * desormais dans sa chaine bloquante.
 * *Le merge ne protege que ce que les DEUX branches ont touche. Un correctif qu'une branche n'a
 * pas vu passer rentre par la porte qu'aucune garde ne surveille.*
 */
function fichiersSuivis(): string[] {
  return fichiersSuivisOuRefus('gov:conventions');
}

function lire(chemin: string): string {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
}

export function lireVue(): Vue {
  const suivis = fichiersSuivis();
  const sources = suivis
    .filter((f) => /\.tsx?$/.test(f) && !EXEMPTS.some((r) => r.test(f)) && existsSync(f))
    .map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }));
  const workflows = suivis
    .filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f) && existsSync(f))
    .map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }));

  const gates = (JSON.parse(lire('docs/gates.json') || '{"gates":[]}') as { gates: GateVue[] })
    .gates;
  const taches = (
    JSON.parse(lire('docs/tasks.json') || '{"taches":[]}') as {
      taches: { id: string; repo: string; paths?: string[]; phase?: number; statut?: string }[];
    }
  ).taches.map((t) => ({
    id: t.id,
    repo: t.repo,
    paths: t.paths ?? [],
    phase: t.phase,
    statut: t.statut,
  }));

  return {
    sources,
    workflows,
    hooks: lire('.claude/settings.json'),
    packageJson: lire('package.json'),
    fichiersSuivis: suivis,
    gates,
    taches,
    perimetres: PERIMETRES_DECLARES,
    passifSansScript: PASSIF_SANS_SCRIPT,
    porteA: PORTE_A_FIGEE,
  };
}

/**
 * LE PASSIF DES ENTRÉES FAUTIVES DU REGISTRE (GOV-083), mesuré le 2026-09-27 : cinq entrées de
 * phase -1 dont la tâche est LIVRÉE et dont le script n'a jamais été écrit sous ce nom. Chacune se
 * corrige dans `docs/gates.json`, dont l'écrivain est le gardien de la spécification — pas un
 * développeur (`docs/CONVENTIONS.md` §8). Elles sont déclarées ici UNE PAR UNE, avec leur motif,
 * plutôt que tues : une entrée fautive NEUVE rougit `gate_sans_script`, et une ligne qui ne sert
 * plus rougit `passif_sans_script_perime`.
 */
/**
 * LE CONSTAT DE LA PORTE A (GOV-061), relevé sur `.github/workflows/ci.yml` et `package.json` le
 * 2026-09-27. Il se RELÈVE, il ne se tape pas : l'analyseur YAML partagé lit le job, et chaque ligne
 * ci-dessous est ce qu'il rend. Une étape ajoutée, retirée, conditionnée, tolérée ou repointée fait
 * rougir la garde jusqu'à ce que ce constat la porte — dans le même diff que `ci.yml`. Il fige
 * l'étape ENTIÈRE, le job ENTIER et le workflow hors `jobs` : une clé ajoutée, retirée ou modifiée
 * rougit `porte_a_alteree`.
 */
/** Le jeton que cinq étapes reçoivent pour lire la forge — une valeur, écrite une fois (RM-01). */
const JETON_DE_LA_FORGE = { env: { GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' } } as const;

export const PORTE_A_FIGEE: PorteFigee = {
  job: 'gate-a',
  si: '${{ github.event.pull_request.merged != true }}',
  cles: {
    'runs-on': 'ubuntu-latest',
    permissions: { contents: 'read', 'pull-requests': 'read' },
  },
  workflow: {
    name: 'Gate A',
    on: {
      push: { branches: ['main'] },
      pull_request: {
        types: ['opened', 'synchronize', 'reopened', 'edited', 'labeled', 'unlabeled'],
      },
    },
  },
  etapes: [
    {
      nom: 'uses: actions/checkout@v4',
      uses: 'actions/checkout@v4',
      cles: { with: { 'fetch-depth': '0' } },
    },
    { nom: 'uses: pnpm/action-setup@v4', uses: 'pnpm/action-setup@v4' },
    {
      nom: 'uses: actions/setup-node@v4',
      uses: 'actions/setup-node@v4',
      cles: { with: { 'node-version': '22', cache: 'pnpm' } },
    },
    { nom: 'run: pnpm install --frozen-lockfile', run: 'pnpm install --frozen-lockfile' },
    { nom: 'Regle de publication (depot public)', run: 'pnpm gov:publication' },
    { nom: 'La garde de publication sait rougir', run: 'pnpm gov:publication:prove' },
    { nom: 'Identifiants qualifies', run: 'pnpm gov:identifiants' },
    { nom: 'La garde des identifiants sait rougir', run: 'pnpm gov:identifiants:prove' },
    { nom: 'Coherence du backlog', run: 'pnpm gov:tasks' },
    { nom: 'La garde du backlog sait rougir', run: 'pnpm gov:tasks:prove' },
    { nom: 'La vue du backlog est egale a sa source', run: 'pnpm gov:tasks:verifie-rendu' },
    { nom: 'Registre des exigences', run: 'pnpm gov:requirements' },
    { nom: 'La garde du registre sait rougir', run: 'pnpm gov:requirements:prove' },
    {
      nom: 'La vue des exigences est egale a sa source',
      run: 'pnpm gov:requirements:verifie-rendu',
    },
    { nom: 'Registre des decisions', run: 'pnpm gov:hypotheses' },
    { nom: 'La garde des decisions sait rougir', run: 'pnpm gov:hypotheses:prove' },
    { nom: 'Table de preseance', run: 'pnpm gov:preseance' },
    { nom: 'La garde de preseance sait rougir', run: 'pnpm gov:preseance:prove' },
    { nom: 'Affirmations verifiees sur axionia', run: 'pnpm gov:sonde' },
    { nom: 'La sonde sait rougir', run: 'pnpm gov:sonde:prove' },
    { nom: 'ADR — index derive et gabarit', run: 'pnpm gov:adr' },
    { nom: 'La garde des ADR sait rougir', run: 'pnpm gov:adr:prove' },
    { nom: 'Matrice d autonomie des agents et garde des pushes', run: 'pnpm gov:autonomie' },
    { nom: 'La garde d autonomie sait rougir', run: 'pnpm gov:autonomie:prove' },
    { nom: 'Gabarit de PR, CODEOWNERS et charte des agents', run: 'pnpm gov:pr' },
    { nom: 'Inventaire prouve — tout etat >= code porte une preuve', run: 'pnpm gov:inventaire' },
    { nom: 'La garde de l inventaire sait rougir', run: 'pnpm gov:inventaire:prove' },
    { nom: 'Fiches de role derivees de docs/agents.json', run: 'pnpm gov:agents' },
    { nom: 'La garde des fiches sait rougir', run: 'pnpm gov:agents:prove' },
    { nom: 'Les fiches sur le disque sont egales a leur source', run: 'pnpm gov:agents:verifier' },
    { nom: 'Registre d entite — sentinelle tenue dans les deux sens', run: 'pnpm gov:entite' },
    { nom: 'La garde du registre d entite sait rougir', run: 'pnpm gov:entite:prove' },
    {
      nom: 'Le corps PUBLIE de la PR ne porte aucune coordonnee',
      run: 'pnpm gov:entite:corps',
      si: "github.event_name == 'pull_request'",
      cles: JETON_DE_LA_FORGE,
    },
    { nom: 'La garde du corps publie sait rougir', run: 'pnpm gov:entite:corps:prove' },
    { nom: 'La garde du depot sait rougir', run: 'pnpm gov:depot-visibilite:prove' },
    {
      nom: 'Matrice de tracabilite REQ vers tache vers test vers PR',
      run: 'pnpm gov:trace',
      cles: JETON_DE_LA_FORGE,
    },
    { nom: 'La matrice de tracabilite sait rougir', run: 'pnpm gov:trace:prove' },
    { nom: 'La vue de tracabilite est derivee de ses sources', run: 'pnpm gov:trace:verifier' },
    { nom: 'La vue de l etat vivant est egale a sa source', run: 'pnpm plan-state:verifier' },
    {
      nom: 'Attributions — garde, poste, lot et identifiants nommes confrontes a leurs sources',
      run: 'pnpm gov:attributions',
    },
    {
      nom: 'La garde des attributions sait rougir, et laisse passer la citation legitime',
      run: 'pnpm gov:attributions:prove',
    },
    {
      nom: 'contracts:hash — le contrat est derive, et son empreinte le tient',
      run: 'pnpm contracts:hash',
    },
    { nom: 'La garde de PR sait rougir', run: 'pnpm gov:pr:prove' },
    { nom: 'Vue GATES.md derivee du registre', run: 'pnpm gov:gates-derivees' },
    { nom: 'Le decompte des gardes sait rougir', run: 'pnpm gates:prouvees:prove' },
    { nom: 'Les paths derives sont a jour', run: 'pnpm lot:paths:check' },
    { nom: 'Vocabulaire — enums, glossaire et etats occupants', run: 'pnpm partners:schema:enums' },
    { nom: 'La garde du vocabulaire sait rougir', run: 'pnpm partners:schema:enums:prove' },
    { nom: 'Centimes — aucun flottant, montants en Cents', run: 'pnpm partners:schema:cents' },
    { nom: 'La garde des centimes sait rougir', run: 'pnpm partners:schema:cents:prove' },
    { nom: 'Migrations additives', run: 'pnpm partners:migrations:additive' },
    { nom: 'La garde des migrations sait rougir', run: 'pnpm partners:migrations:additive:prove' },
    {
      nom: 'Termes interdits — nomenclature, modeles d axionia et synonymes',
      run: 'pnpm gov:termes-interdits',
    },
    { nom: 'La garde des termes interdits sait rougir', run: 'pnpm gov:termes-interdits:prove' },
    {
      nom: 'Lexique interdit — aucun usage prescriptif dans le perimetre de REQ-GOV-017',
      run: 'pnpm gov:lexique',
    },
    {
      nom: 'La garde du lexique sait rougir, et laisse passer la negation qui protege',
      run: 'pnpm gov:lexique:prove',
    },
    {
      nom: 'Grille du contrat — aucun forfait, bareme ou pourcentage sans chiffre dans l annexe 1',
      run: 'pnpm jur:grille-chiffree',
    },
    { nom: 'La garde de la grille chiffree sait rougir', run: 'pnpm jur:grille-chiffree:prove' },
    {
      nom: "Maquettes — aucune tache d'ecran attribuee sans validation de Will",
      run: 'pnpm gov:maquettes-validees',
    },
    {
      nom: 'La garde des maquettes sait rougir, y compris sur une ligne du milieu du tableau',
      run: 'pnpm gov:maquettes-validees:prove',
    },
    {
      nom: 'Micro-copie — chaque issue et chaque ecran ont leur texte, aucun libelle en dur',
      run: 'pnpm ux:exhaustivite',
    },
    {
      nom: "La garde de la micro-copie sait rougir, en nommant la valeur, l'ecran ou le fichier",
      run: 'pnpm ux:exhaustivite:prove',
    },
    { nom: 'Budgets de performance derives de REQ-GOV-028', run: 'pnpm perf:budgets' },
    { nom: 'La garde des budgets sait rougir', run: 'pnpm perf:budgets:prove' },
    {
      nom: 'Les budgets sur le disque sont le rendu de leur exigence',
      run: 'pnpm perf:budgets:verifier',
    },
    {
      nom: 'Compteurs de debit — conduite sur panne declaree et executee, famille close',
      run: 'pnpm securite:rate-famille',
    },
    { nom: 'La garde des compteurs de debit sait rougir', run: 'pnpm securite:rate-famille:prove' },
    { nom: 'Conventions et gardes transposees d axionia', run: 'pnpm gov:conventions' },
    { nom: 'La garde des conventions sait rougir', run: 'pnpm gov:conventions:prove' },
    { nom: 'Journal sans donnee personnelle', run: 'pnpm journal:sans-pii' },
    { nom: 'La garde du journal sait rougir', run: 'pnpm journal:sans-pii:prove' },
    {
      nom: 'Donnees personnelles chiffrees, schema et chemins d ecriture',
      run: 'pnpm securite:schema-pii',
    },
    { nom: 'La garde des donnees personnelles sait rougir', run: 'pnpm securite:schema-pii:prove' },
    { nom: 'Lint', run: 'pnpm lint' },
    { nom: 'Format', run: 'pnpm format:check' },
    { nom: 'Typecheck', run: 'pnpm typecheck' },
    {
      nom: 'red-first — les tests nouveaux de la PR rougissent contre sa base',
      run: 'pnpm red-first',
      si: "github.event_name == 'pull_request'",
    },
    { nom: 'La garde red-first sait rougir', run: 'pnpm red-first:prove' },
    { nom: 'Harnais de l adaptateur MCP', run: 'pnpm harnais-mcp' },
    { nom: 'Navigateurs des passes d accessibilite', run: 'pnpm a11y:navigateurs' },
    { nom: 'Tests', run: 'pnpm test', cles: JETON_DE_LA_FORGE },
    {
      nom: 'req:check — chaque paire (tache, REQ) a son test annote et VERT',
      run: 'pnpm req:check',
      cles: JETON_DE_LA_FORGE,
    },
    { nom: 'Le lecteur du rapport de mutation sait rougir', run: 'pnpm mutation:prove' },
    {
      nom: 'Mutation des fichiers de la PR — Stryker en bac a sable, survivants nommes',
      run: 'pnpm mutation:pr',
    },
    {
      nom: 'Etat vivant — fraicheur, verrou d owner, journal',
      run: 'pnpm gov:etat --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
      cles: JETON_DE_LA_FORGE,
    },
    { nom: 'La garde de l etat vivant sait rougir', run: 'pnpm gov:etat:prove' },
  ],
  scripts: {
    'gov:publication': 'tsx scripts/gates/gov-publication.ts',
    'gov:publication:prove': 'tsx scripts/gates/gov-publication.ts --prove',
    'gov:identifiants': 'tsx scripts/gates/gov-identifiants.ts',
    'gov:identifiants:prove': 'tsx scripts/gates/gov-identifiants.ts --prove',
    'gov:tasks': 'tsx scripts/gates/gov-tasks.ts',
    'gov:tasks:prove': 'tsx scripts/gates/gov-tasks.ts --prove',
    'gov:tasks:verifie-rendu': 'tsx scripts/gates/gov-tasks.ts --verifie-rendu',
    'gov:requirements': 'tsx scripts/gates/gov-requirements.ts',
    'gov:requirements:prove': 'tsx scripts/gates/gov-requirements.ts --prove',
    'gov:requirements:verifie-rendu': 'tsx scripts/gates/gov-requirements.ts --verifie-rendu',
    'gov:hypotheses': 'tsx scripts/gates/gov-hypotheses.ts',
    'gov:hypotheses:prove': 'tsx scripts/gates/gov-hypotheses.ts --prove',
    'gov:preseance': 'tsx scripts/gates/gov-preseance.ts',
    'gov:preseance:prove': 'tsx scripts/gates/gov-preseance.ts --prove',
    'gov:sonde': 'tsx scripts/gates/gov-sonde.ts',
    'gov:sonde:prove': 'tsx scripts/gates/gov-sonde.ts --prove',
    'gov:adr': 'tsx scripts/gates/gov-adr.ts',
    'gov:adr:prove': 'tsx scripts/gates/gov-adr.ts --prove',
    'gov:autonomie': 'tsx scripts/gates/gov-autonomie.ts',
    'gov:autonomie:prove': 'tsx scripts/gates/gov-autonomie.ts --prove',
    'gov:pr': 'tsx scripts/gates/gov-pr.ts',
    'gov:inventaire': 'tsx scripts/gates/gov-inventaire.ts',
    'gov:inventaire:prove': 'tsx scripts/gates/gov-inventaire.ts --prove',
    'gov:agents': 'tsx scripts/gates/gov-agents.ts',
    'gov:agents:prove': 'tsx scripts/gates/gov-agents.ts --prove',
    'gov:agents:verifier': 'tsx scripts/agents/generer.ts --verifier',
    'gov:entite': 'tsx scripts/gates/gov-entite.ts',
    'gov:entite:prove': 'tsx scripts/gates/gov-entite.ts --prove',
    'gov:entite:corps': 'tsx scripts/gates/gov-entite.ts --corps-publie',
    'gov:entite:corps:prove': 'tsx scripts/gates/gov-entite.ts --corps-publie --prove',
    'gov:depot-visibilite:prove': 'tsx scripts/gates/gov-depot.ts --prove',
    'gov:trace': 'tsx scripts/gates/gov-trace.ts',
    'gov:trace:prove': 'tsx scripts/gates/gov-trace.ts --prove',
    'gov:trace:verifier': 'tsx scripts/gates/gov-trace.ts --verifier',
    'plan-state:verifier': 'tsx scripts/plan-state/build.ts --verifier',
    'gov:attributions': 'tsx scripts/gates/gov-attributions.ts',
    'gov:attributions:prove': 'tsx scripts/gates/gov-attributions.ts --prove',
    'contracts:hash': 'tsx scripts/contracts/export.ts --verifier',
    'gov:pr:prove': 'tsx scripts/gates/gov-pr.ts --prove',
    'gov:gates-derivees': 'tsx scripts/gates/gates-derivees.ts',
    'gates:prouvees:prove': 'tsx scripts/gates/gates-prouvees.ts --prove',
    'lot:paths:check': 'tsx scripts/lot/paths-proposes.ts --check',
    'partners:schema:enums': 'tsx scripts/gates/schema-enums.ts',
    'partners:schema:enums:prove': 'tsx scripts/gates/schema-enums.ts --prove',
    'partners:schema:cents': 'tsx scripts/gates/schema-cents.ts',
    'partners:schema:cents:prove': 'tsx scripts/gates/schema-cents.ts --prove',
    'partners:migrations:additive': 'tsx scripts/gates/migrations-additive.ts',
    'partners:migrations:additive:prove': 'tsx scripts/gates/migrations-additive.ts --prove',
    'gov:termes-interdits': 'tsx scripts/gates/gov-check.ts',
    'gov:termes-interdits:prove': 'tsx scripts/gates/gov-check.ts --prove',
    'gov:lexique': 'tsx scripts/gates/lexique-apporteurs.ts',
    'gov:lexique:prove': 'tsx scripts/gates/lexique-apporteurs.ts --prove',
    'jur:grille-chiffree': 'tsx scripts/gates/jur-grille-chiffree.ts',
    'jur:grille-chiffree:prove': 'tsx scripts/gates/jur-grille-chiffree.ts --prove',
    'gov:maquettes-validees': 'tsx scripts/gates/maquettes-validees.ts',
    'gov:maquettes-validees:prove': 'tsx scripts/gates/maquettes-validees.ts --prove',
    'ux:exhaustivite': 'tsx scripts/gates/ux-exhaustivite.ts',
    'ux:exhaustivite:prove': 'tsx scripts/gates/ux-exhaustivite.ts --prove',
    'perf:budgets': 'tsx scripts/gates/perf-budgets.ts',
    'perf:budgets:prove': 'tsx scripts/gates/perf-budgets.ts --prove',
    'perf:budgets:verifier': 'tsx scripts/gates/perf-budgets.ts --verifier',
    'securite:rate-famille': 'tsx scripts/gates/rate-famille.ts',
    'securite:rate-famille:prove': 'tsx scripts/gates/rate-famille.ts --prove',
    'gov:conventions': 'tsx scripts/gates/gov-conventions.ts',
    'gov:conventions:prove': 'tsx scripts/gates/gov-conventions.ts --prove',
    'journal:sans-pii': 'tsx scripts/gates/journal-sans-pii.ts',
    'journal:sans-pii:prove': 'tsx scripts/gates/journal-sans-pii.ts --prove',
    'securite:schema-pii': 'tsx scripts/gates/schema-pii.ts',
    'securite:schema-pii:prove': 'tsx scripts/gates/schema-pii.ts --prove',
    lint: 'eslint . --max-warnings 0',
    'format:check': 'prettier --check .',
    typecheck: 'tsc --noEmit',
    'red-first': 'tsx scripts/gates/red-first.ts',
    'red-first:prove': 'tsx scripts/gates/red-first.ts --prove',
    'harnais-mcp': 'tsx scripts/gates/harnais-mcp.ts',
    'a11y:navigateurs': 'playwright install --with-deps chromium webkit',
    test: 'vitest run --coverage --reporter=default --reporter=json --outputFile.json=test-results/vitest.json',
    'req:check': 'tsx scripts/gates/gov-trace.ts --resultats test-results/vitest.json',
    'mutation:prove': 'tsx scripts/mutation/rapport.ts --prove',
    'mutation:pr': 'tsx scripts/mutation/pr.ts',
    'gov:etat': 'tsx scripts/gates/gov-etat.ts',
    'gov:etat:prove': 'tsx scripts/gates/gov-etat.ts --prove',
  },
  paquet: CONFIGURATION_DU_PAQUET_ABSENTE,
};

export const PASSIF_SANS_SCRIPT: Readonly<Record<string, string>> = {
  detectPii:
    'tâche porteuse livrée ; la tâche du harnais MCP, livrée elle aussi, déclarait ce chemin dans ' +
    'ses paths sans l’écrire : le nom ne désigne rien sur le disque, entrée à corriger au registre.',
  'gov:contrat':
    'l’empreinte du contrat est tenue par `pnpm contracts:hash` (`scripts/contracts/export.ts ' +
    '--verifier`, câblé en porte A) ; ce nom de script n’a jamais existé : entrée à re-pointer.',
  'gate-deploiement':
    'tâche porteuse livrée ; le script de vérification d’atterrissage est déclaré par une tâche ' +
    'de phase 0 non livrée, mais l’entrée reste attribuée à la tâche du socle : à ré-attribuer.',
  'gov:derivation':
    'garde DIFFÉRÉE par écrit (`docs/GARDES-AXIONIA.md` §2) et reprise par la tâche de la grille, ' +
    'qui déclare ce chemin ; son attribution d’origine est exigée par `gardes-transposees.spec.ts`.',
  'fixtures:source':
    'tâche porteuse livrée sans ce script, et aucune tâche du backlog ne le déclare : l’en-tête ' +
    '`Source:` des fixtures n’est tenu par aucun script — entrée à corriger ou à rattacher.',
};

// ── la preuve ────────────────────────────────────────────────────────────────────────────────

/**
 * Le workflow de référence des vues injectées. EXPORTÉ : le test en dérive ses propres témoins par
 * une seule substitution, au lieu de réécrire un workflow entier — un témoin qui change deux choses
 * à la fois ne prouve aucune des deux (RM-11). C'est exactement ce qui est arrivé en écrivant ce
 * fichier : un témoin de `lint_non_bloquant` qui remplaçait tout le workflow faisait disparaître
 * l'appel à `pnpm gov:conventions` et rougissait AUSSI sur `garde_ecrite_jamais_appelee`.
 */
export const CI_CONFORME =
  'name: Gate A\njobs:\n  gate-a:\n    steps:\n' +
  '      - name: Lint\n        run: pnpm lint\n' +
  '      - name: Format\n        run: pnpm format:check\n' +
  '      - name: Conventions transposees\n        run: pnpm gov:conventions\n';

const PKG_CONFORME = JSON.stringify({
  scripts: {
    lint: 'eslint .',
    'format:check': 'prettier --check .',
    'gov:conventions': 'tsx scripts/gates/gov-conventions.ts',
  },
  devDependencies: { eslint: '^9.36.0', prettier: '^3.6.2' },
});

/** Le constat de la porte A de la vue de référence : les trois étapes de `CI_CONFORME`, figées. */
export const PORTE_CONFORME: PorteFigee = {
  job: 'gate-a',
  si: null,
  cles: {},
  workflow: { name: 'Gate A' },
  etapes: [
    { nom: 'Lint', run: 'pnpm lint' },
    { nom: 'Format', run: 'pnpm format:check' },
    { nom: 'Conventions transposees', run: 'pnpm gov:conventions' },
  ],
  scripts: {
    lint: 'eslint .',
    'format:check': 'prettier --check .',
    'gov:conventions': 'tsx scripts/gates/gov-conventions.ts',
  },
  paquet: CONFIGURATION_DU_PAQUET_ABSENTE,
};

/**
 * La vue de référence. Elle est CONFORME de bout en bout : chaque témoin en dérive par une seule
 * variation, et le fait qu'elle-même soit verte est le contre-témoin sans lequel aucun rouge de
 * ce fichier ne prouverait quoi que ce soit.
 */
export const VUE_CONFORME: Vue = {
  sources: [
    {
      chemin: 'src/app/espace/depot/actions.ts',
      source:
        '"use server";\n\nimport { schemaDeDepot } from "./schema";\n\n' +
        'export async function deposerUneEntreprise(entree: unknown) {\n' +
        '  const donnees = schemaDeDepot.parse(entree);\n  return donnees;\n}\n',
    },
    {
      chemin: 'src/app/espace/depot/Formulaire.tsx',
      source:
        '"use client";\n// use-client: saisie contrôlée et autocomplétion sous 300 ms\n\n' +
        'export function Formulaire() {\n  return null;\n}\n',
    },
    {
      chemin: 'src/domain/attribution/etats.ts',
      source: 'export const ETATS_OCCUPANTS = [] as const;\n',
    },
  ],
  workflows: [{ chemin: '.github/workflows/ci.yml', source: CI_CONFORME }],
  hooks: '{"hooks":{}}',
  packageJson: PKG_CONFORME,
  fichiersSuivis: [
    'eslint.config.mjs',
    '.prettierrc.json',
    'scripts/gates/gov-conventions.ts',
    'package.json',
  ],
  gates: [{ id: 'gov:conventions', phase: -1, script: 'scripts/gates/gov-conventions.ts' }],
  taches: [
    { id: 'QA-T00', repo: 'partners', paths: ['tests/'], phase: -1, statut: 'fusionnee' },
    { id: 'QA-T01', repo: 'partners', paths: ['tests/'], phase: 0, statut: 'a_faire' },
    { id: 'GOV-017a', repo: 'partners', paths: ['docs/'], phase: -1, statut: 'fusionnee' },
    { id: 'UX-P0-02', repo: 'partners', paths: ['src/app/UX-P0-02'], phase: 0, statut: 'a_faire' },
    { id: 'UX-P1-02', repo: 'partners', paths: ['src/app/UX-P1-02'], phase: 1, statut: 'a_faire' },
    { id: 'DM-03-A', repo: 'axionia', paths: ['axionia/DM-03-A'], phase: 0, statut: 'a_faire' },
  ],
  perimetres: PERIMETRES_DECLARES,
  porteA: PORTE_CONFORME,
};

function variante(patch: Partial<Vue>): Vue {
  return { ...VUE_CONFORME, ...patch };
}

const TEMOINS: ReadonlyArray<{ famille: string; libelle: string; vue: Vue }> = [
  {
    famille: 'use_server_export_interdit',
    libelle: 'une constante exportée d’un module « use server »',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/espace/champs.ts',
          source: '"use server";\n\nexport const CHAMP = "x";\n',
        },
      ],
    }),
  },
  {
    famille: 'use_server_reexport',
    libelle: 'un ré-export, donc un point d’entrée HTTP public',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/espace/reexport.ts',
          source: '"use server";\n\nexport { lister } from "./lecture";\n',
        },
      ],
    }),
  },
  {
    famille: 'use_client_sans_motif',
    libelle: 'une directive « use client » sans justification collée',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        { chemin: 'src/app/Carte.tsx', source: '"use client";\n\nexport function Carte() {}\n' },
      ],
    }),
  },
  {
    famille: 'lint_non_bloquant',
    libelle: 'une étape de lint qui porte `continue-on-error`',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            '        run: pnpm lint\n',
            '        run: pnpm lint\n        continue-on-error: true\n'
          ),
        },
      ],
    }),
  },
  {
    famille: 'lint_non_bloquant',
    libelle: 'un `continue-on-error` posé au niveau du JOB désarme aussi ses étapes',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace('  gate-a:\n', '  gate-a:\n    continue-on-error: true\n'),
        },
      ],
    }),
  },
  {
    famille: 'outillage_non_epingle',
    libelle: 'la CI lance le lint, l’outil n’est pas dans devDependencies',
    vue: variante({
      packageJson: JSON.stringify({
        scripts: { lint: 'eslint .', 'format:check': 'prettier --check .' },
        devDependencies: { tsx: '^4.19.2' },
      }),
    }),
  },
  {
    famille: 'outillage_non_epingle',
    libelle: 'l’outil est épinglé mais sa configuration n’est pas versionnée',
    vue: variante({ fichiersSuivis: ['package.json'] }),
  },
  {
    famille: 'isolation_depot',
    libelle: 'une tâche `repo: partners` revendique un chemin sous `axionia/`',
    vue: variante({
      taches: [
        ...VUE_CONFORME.taches,
        { id: 'UX-P9-99', repo: 'partners', paths: ['axionia/src/content/tarifs.ts'] },
      ],
    }),
  },
  {
    famille: 'garde_ecrite_jamais_appelee',
    libelle: 'un script de garde qu’aucun workflow n’appelle',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:fantome', phase: -1, script: 'scripts/gates/gov-fantome.ts' },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-fantome.ts'],
    }),
  },
  {
    famille: 'garde_ecrite_jamais_appelee',
    libelle: 'une garde dont le seul « appel » est CITÉ entre guillemets, après un `;`',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            'run: pnpm gov:conventions\n',
            'run: echo "nuit sautee; pnpm gov:conventions"\n'
          ),
        },
      ],
    }),
  },
  {
    famille: 'garde_ecrite_jamais_appelee',
    libelle: 'une garde dont le seul appel est COURT-CIRCUITÉ à droite de `true ||`',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            'run: pnpm gov:conventions\n',
            'run: true || pnpm gov:conventions\n'
          ),
        },
      ],
    }),
  },
  {
    famille: 'garde_hors_registre',
    libelle: 'une garde ÉCRITE et suivie que `docs/gates.json` ne nomme nulle part',
    vue: variante({
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-orpheline.ts'],
    }),
  },
  {
    famille: 'gate_sans_script',
    libelle:
      'une entrée de la phase courante dont le script est introuvable et que sa tâche, livrée, ne porte plus',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        {
          id: 'gov:jamais-ecrite',
          phase: 0,
          script: 'scripts/gates/gov-jamais-ecrite.ts',
          tache: 'QA-T00',
        },
      ],
    }),
  },
  {
    famille: 'passif_sans_script_perime',
    libelle: 'un passif d’entrée sans script qui ne désigne plus aucune entrée fautive',
    vue: variante({
      passifSansScript: {
        'gov:disparue':
          'témoin : une ligne de passif dont l’entrée a quitté le registre, et qui absoudrait la prochaine.',
      },
    }),
  },
  {
    famille: 'garde_ecrite_jamais_appelee',
    libelle:
      'une garde hors CI dont le `horsCi` tient en deux mots — un mot de passe, pas un motif',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        {
          id: 'gov:en-ligne',
          phase: -1,
          script: 'scripts/gates/gov-en-ligne.ts',
          horsCi: 'hors CI',
        },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-en-ligne.ts'],
    }),
  },
  {
    famille: 'perimetre_vide_sans_motif',
    libelle: 'un périmètre à zéro élément dont le motif tient en deux mots',
    vue: variante({
      sources: [],
      perimetres: [
        {
          cle: 'modules-serveur',
          libelle: 'modules « use server »',
          motifSiVide: 'pas encore',
          tacheSuccesseur: 'UX-P1-02',
        },
      ],
    }),
  },
  {
    famille: 'perimetre_vide_sans_motif',
    libelle: 'un périmètre vide dont la tâche successeur n’existe pas au backlog',
    vue: variante({
      sources: [],
      perimetres: [
        {
          cle: 'modules-serveur',
          libelle: 'modules « use server »',
          motifSiVide: PERIMETRES_DECLARES[0]!.motifSiVide,
          tacheSuccesseur: 'ZZ-T99',
        },
      ],
    }),
  },
];

const CONTRE_TEMOINS: ReadonlyArray<{ libelle: string; vue: Vue }> = [
  { libelle: 'la vue conforme', vue: VUE_CONFORME },
  {
    libelle: 'deux appels enchaînés par `&&`, dont une expression d’Actions qui porte un `||`',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            'run: pnpm gov:conventions\n',
            "run: pnpm format:check && pnpm gov:conventions --x ${{ inputs.x || 'a' }}\n"
          ),
        },
      ],
    }),
  },
  {
    libelle: 'une action asynchrone exportée d’un module « use server » — le cas normal',
    vue: variante({
      sources: [
        {
          chemin: 'src/app/espace/actions.ts',
          source:
            '"use server";\n\nexport async function agir() {}\nexport type Entree = { a: string };\n',
        },
        ...VUE_CONFORME.sources,
      ],
    }),
  },
  {
    libelle: 'une constante exportée d’un module ORDINAIRE (sans directive)',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        { chemin: 'src/domain/seuils.ts', source: 'export const PLAFOND = 12;\n' },
      ],
    }),
  },
  {
    libelle: 'un `"use server"` DANS le corps d’une fonction ne marque pas le module',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/page.tsx',
          source:
            'export const revalider = 3600;\n\nasync function agir() {\n  "use server";\n}\n' +
            'export default function Page() { return agir; }\n',
        },
      ],
    }),
  },
  {
    libelle: 'la justification `// use-client:` placée AVANT la directive',
    vue: variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/Table.tsx',
          source:
            '// use-client: tri et filtres côté navigateur\n"use client";\n\nexport function T() {}\n',
        },
      ],
    }),
  },
  {
    libelle: '`tests/fixtures/axionia/` dans une tâche `repo: partners` — le préfixe seul décide',
    vue: variante({
      taches: [
        ...VUE_CONFORME.taches,
        { id: 'INT-T01a', repo: 'partners', paths: ['tests/fixtures/axionia/'] },
      ],
    }),
  },
  {
    libelle: 'une tâche `repo: axionia` avec des chemins préfixés — c’est sa forme normale',
    vue: variante({
      taches: [
        ...VUE_CONFORME.taches,
        { id: 'INT-T02', repo: 'axionia', paths: ['axionia/INT-T02'] },
      ],
    }),
  },
  {
    libelle: 'une garde câblée par `.claude/settings.json` plutôt que par un workflow',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'notify-sink-hors-prod', phase: -1, script: 'scripts/gates/hook-env.js' },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/hook-env.js'],
      hooks: '{"hooks":{"PreToolUse":[{"command":"node scripts/gates/hook-env.js"}]}}',
    }),
  },
  {
    libelle: 'une garde citée sous son ALIAS dans le workflow',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        {
          id: 'req:check',
          phase: -1,
          script: 'scripts/gates/gov-trace.ts',
          alias: ['gov:conventions'],
        },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-trace.ts'],
    }),
  },
  {
    libelle: 'une gate sans script PROMISE à une phase future — sortie avec sa phase, sans rougir',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'partners:rgpd:export-complet', phase: 3, script: 'scripts/gates/rgpd-export.ts' },
      ],
    }),
  },
  {
    libelle: 'une gate sans script de la phase courante dont la tâche porteuse n’est PAS livrée',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:a-venir', phase: 0, script: 'scripts/gates/gov-a-venir.ts', tache: 'QA-T01' },
      ],
    }),
  },
  {
    libelle: 'une gate qui désigne l’AUTRE dépôt — sortie du périmètre avec son motif',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'inertie', phase: 0, script: 'axionia/scripts/gates/inertie.ts' },
      ],
    }),
  },
  {
    libelle: 'une entrée fautive DÉCLARÉE au passif, avec son motif — la seule tolérance admise',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:derivation', phase: -1, script: 'scripts/gates/gov-derivation.ts' },
      ],
      passifSansScript: { 'gov:derivation': PASSIF_SANS_SCRIPT['gov:derivation']! },
    }),
  },
  {
    libelle:
      'une garde de phase 0 écrite, suivie et CÂBLÉE — la levée du filtre de phase ne ment pas',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'partners:schema:enums', phase: 0, script: 'scripts/gates/schema-enums.ts' },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/schema-enums.ts'],
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            '      - name: Conventions transposees\n',
            '      - name: Enums\n        run: pnpm partners:schema:enums\n' +
              '      - name: Conventions transposees\n'
          ),
        },
      ],
    }),
  },
  {
    libelle: 'une garde hors CI dont le motif est ÉCRIT — la seule autre réponse admise',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        {
          id: 'gov:en-ligne',
          phase: -1,
          script: 'scripts/gates/gov-en-ligne.ts',
          horsCi:
            'Ce contrôle interroge la forge par `gh` : le câbler en CI rendrait la suite non ' +
            'déterministe. Il se lance à la main avant une fusion (décision GOV-038).',
        },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-en-ligne.ts'],
    }),
  },
  {
    libelle: 'un périmètre vide, motivé, et repris par une tâche du backlog',
    vue: variante({
      sources: [],
      perimetres: [
        {
          cle: 'modules-serveur',
          libelle: 'modules « use server »',
          motifSiVide: PERIMETRES_DECLARES[0]!.motifSiVide,
          tacheSuccesseur: 'UX-P1-02',
        },
      ],
    }),
  },
  {
    libelle: 'aucune étape de lint en CI : rien à juger, et surtout pas un rouge de dette',
    vue: variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: 'jobs:\n  gate-a:\n    steps:\n      - run: pnpm test\n',
        },
      ],
      packageJson: '{}',
      fichiersSuivis: ['package.json'],
      // Aucune garde au registre : ce contre-témoin juge le LINT absent, pas une entrée sans script.
      gates: [],
      perimetres: PERIMETRES_DECLARES.filter((p) => p.cle !== 'etapes-lint-ci'),
    }),
  },
];

/**
 * LES TÉMOINS DE LA PORTE A (GOV-061) : chacun désarme `CI_CONFORME` ou `PKG_CONFORME` d'UNE façon,
 * et la confrontation doit nommer la famille. Les contre-témoins prouvent qu'un commentaire ajouté
 * ne change rien, et que la vue de référence passe.
 */
const CI_EN = (de: string, par: string): Vue =>
  variante({
    workflows: [{ chemin: '.github/workflows/ci.yml', source: CI_CONFORME.replace(de, par) }],
  });
const TEMOINS_PORTE_A: ReadonlyArray<{ famille: string; libelle: string; vue: Vue }> = [
  {
    famille: 'etape_absente',
    libelle: 'une étape figée retirée du job',
    vue: CI_EN('      - name: Format\n        run: pnpm format:check\n', ''),
  },
  {
    famille: 'etape_absente',
    libelle: 'une étape figée réduite à un commentaire',
    vue: CI_EN(
      '      - name: Format\n        run: pnpm format:check\n',
      '      # - name: Format\n      #   run: pnpm format:check\n'
    ),
  },
  {
    famille: 'etape_non_figee',
    libelle: 'une étape ajoutée au job sans être figée',
    vue: CI_EN(
      '      - name: Lint\n',
      '      - name: Nouvelle\n        run: pnpm nouvelle\n      - name: Lint\n'
    ),
  },
  {
    famille: 'etape_conditionnee',
    libelle: 'une étape désarmée par une condition toujours fausse',
    vue: CI_EN('      - name: Format\n', '      - name: Format\n        if: ${{ false }}\n'),
  },
  {
    famille: 'etape_conditionnee',
    libelle: 'le JOB désarmé par une condition',
    vue: CI_EN('  gate-a:\n', "  gate-a:\n    if: github.event_name == 'jamais'\n"),
  },
  {
    famille: 'etape_toleree',
    libelle: 'une tolérance d’échec sous forme évaluée sur une étape qui n’est pas un lint',
    vue: CI_EN(
      '        run: pnpm gov:conventions\n',
      '        run: pnpm gov:conventions\n        continue-on-error: ${{ true }}\n'
    ),
  },
  {
    famille: 'etape_repointee',
    libelle: 'une étape dont la commande tolère l’échec dans le shell',
    vue: CI_EN(
      '        run: pnpm gov:conventions\n',
      '        run: pnpm gov:conventions || true\n'
    ),
  },
  {
    famille: 'porte_a_alteree',
    libelle: 'une clé `shell:` hors constat sur une étape, qui rend toujours 0',
    vue: CI_EN(
      '        run: pnpm lint\n',
      "        run: pnpm lint\n        shell: sh -c 'exit 0' {0}\n"
    ),
  },
  {
    famille: 'porte_a_alteree',
    libelle: 'des `defaults:` posés sur le JOB, qui désarment toutes ses étapes',
    vue: CI_EN(
      '  gate-a:\n',
      "  gate-a:\n    defaults:\n      run:\n        shell: sh -c 'exit 0' {0}\n"
    ),
  },
  {
    famille: 'porte_a_alteree',
    libelle: 'un `env:` posé au niveau du WORKFLOW',
    vue: CI_EN('name: Gate A\n', 'name: Gate A\nenv:\n  CI: "false"\n'),
  },
  {
    famille: 'etape_en_double',
    libelle: 'deux étapes de même nom, dont la seconde échappait à la confrontation',
    vue: CI_EN(
      '      - name: Format\n        run: pnpm format:check\n',
      '      - name: Format\n        run: pnpm format:check\n'.repeat(2)
    ),
  },
  {
    famille: 'script_repointe',
    libelle: 'le script `package.json` d’une étape repointé',
    vue: variante({
      packageJson: JSON.stringify({
        ...(JSON.parse(PKG_CONFORME) as Record<string, unknown>),
        scripts: {
          lint: 'eslint .',
          'format:check': 'prettier --check .',
          'gov:conventions': 'echo ok',
        },
      }),
    }),
  },
  {
    famille: 'porte_a_illisible',
    libelle: 'une vue sans constat de la porte A',
    vue: variante({ porteA: undefined }),
  },
  {
    famille: 'porte_a_alteree',
    libelle: 'un `.npmrc` suivi à la racine, qui peut changer le shell de chaque `pnpm <script>`',
    vue: variante({ fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, '.npmrc'] }),
  },
];

const CONTRE_TEMOINS_PORTE_A: ReadonlyArray<{ libelle: string; vue: Vue }> = [
  { libelle: 'la vue conforme', vue: VUE_CONFORME },
  {
    libelle: 'un commentaire ajouté au job, qui cite une commande',
    vue: CI_EN(
      '      - name: Format\n',
      '      # pnpm gov:fantome — cité, jamais lancé\n      - name: Format\n'
    ),
  },
  {
    libelle: '`continue-on-error: false` écrit en toutes lettres',
    vue: CI_EN(
      '        run: pnpm lint\n',
      '        run: pnpm lint\n        continue-on-error: false\n'
    ),
  },
];

async function prouver(): Promise<number> {
  for (const t of TEMOINS_PORTE_A) {
    const familles = (await confronterLaPorteA(t.vue)).fautes.map((f) => f.famille);
    if (!familles.includes(t.famille)) {
      console.error(
        `❌ Le témoin de la porte A « ${t.libelle} » n'a PAS fait rougir ${t.famille}.`
      );
      console.error(
        `   Familles obtenues : ${familles.length === 0 ? '(aucune)' : familles.join(', ')}`
      );
      return 1;
    }
  }
  for (const c of CONTRE_TEMOINS_PORTE_A) {
    const fautes = [...controler(c.vue), ...(await confronterLaPorteA(c.vue)).fautes];
    if (fautes.length > 0) {
      console.error(`❌ Faux positif de la porte A : « ${c.libelle} » a rougi.`);
      console.error(`   ${fautes[0]!.famille} — ${fautes[0]!.message}`);
      return 1;
    }
  }
  for (const t of TEMOINS) {
    const familles = controler(t.vue).map((f) => f.famille);
    if (!familles.includes(t.famille)) {
      console.error(`❌ Le témoin « ${t.libelle} » n'a PAS fait rougir ${t.famille}.`);
      console.error(
        `   Familles obtenues : ${familles.length === 0 ? '(aucune)' : familles.join(', ')}`
      );
      return 1;
    }
  }
  for (const c of CONTRE_TEMOINS) {
    const fautes = controler(c.vue);
    if (fautes.length > 0) {
      console.error(`❌ Faux positif : « ${c.libelle} » a rougi. La garde est trop large.`);
      console.error(`   ${fautes[0]!.famille} — ${fautes[0]!.message}`);
      return 1;
    }
  }
  const sansTemoin = FAMILLES.filter(
    (f) => !TEMOINS.some((t) => t.famille === f) && !TEMOINS_PORTE_A.some((t) => t.famille === f)
  );
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }
  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(
    `   ${TEMOINS.length + TEMOINS_PORTE_A.length} témoins rouges, ` +
      `${CONTRE_TEMOINS.length + CONTRE_TEMOINS_PORTE_A.length} contre-témoins verts — dont la vue conforme.`
  );
  return 0;
}

// ── rendu ────────────────────────────────────────────────────────────────────────────────────

function direLePerimetre(vue: Vue): void {
  console.log('PÉRIMÈTRE BALAYÉ — une garde qui ne dit pas ce qu’elle a lu ne prouve rien :');
  for (const p of perimetresDe(vue)) {
    if (p.compte > 0) {
      console.log(`   • ${p.libelle} : ${p.compte} ${p.unite}`);
      continue;
    }
    console.log(
      `   • ${p.libelle} : 0 ${p.unite} — VIDE, reprise par ${p.tacheSuccesseur}.\n` +
        `     Motif : ${p.motifSiVide}`
    );
  }
}

/**
 * LE DÉCOMPTE DES DEUX POPULATIONS, RENDU (GOV-044, livrable 2). Fonction PURE : le rendu se juge
 * sur ce qu'il PRODUIT, pas sur ce qu'il épelle, et `direLeDisqueEtLeRegistre()` n'en est que
 * l'imprimeur. Un compte qu'on calcule sans l'imprimer ne se relit pas — c'est cette absence-là qui
 * a laissé `qualiopi:isolation-check` cumuler 88 violations en silence.
 */
export function lignesDeConfrontation(vue: Vue): string[] {
  const c = confronterDisqueEtRegistre(vue);
  const lignes = [
    'DISQUE ↔ REGISTRE — la population part du disque, le registre est ce qu’on lui confronte :',
    `   • gardes ÉCRITES (\`${DOSSIER_DES_GARDES}*${EXTENSION_DES_GARDES}\` suivies par git) : ${c.surLeDisque.length}`,
    `   • entrées de \`docs/gates.json\` qui en nomment une, donc JUGÉES sur leur câblage : ${c.jugees.length}`,
    `   • gardes écrites que le registre ne nomme PAS : ${c.horsRegistre.length}`,
  ];
  if (c.horsRegistre.length > 0) {
    lignes.push(`     ${c.horsRegistre.join('\n     ')}`);
  }
  const passif = vue.passifSansScript ?? {};
  const declarees = c.fautives.filter((g) => Object.hasOwn(passif, g.id)).length;
  lignes.push(
    `   • entrées sous \`${DOSSIER_DES_GARDES}\` dont le script n'est pas suivi ici, donc HORS ` +
      `périmètre : ${c.entreesSansScript.length} — réparties ci-dessous, aucune ne se tait :`,
    `     ↳ promises (phase future, ou tâche porteuse non livrée) : ${c.promises.length}`,
    `     ↳ fautives (phase ${c.phaseCourante ?? '?'} ou antérieure sans tâche non livrée, ou lancées par \`package.json\`) : ` +
      `${c.fautives.length} — dont ${declarees} déclarée(s) au passif, une par une avec son motif`
  );
  for (const g of c.fautives) {
    lignes.push(`       ${g.id} — ${g.script} — ${(passif[g.id] ?? 'NON DÉCLARÉE').trim()}`);
  }
  lignes.push(
    `   • entrées qui désignent l'autre dépôt (\`${GARDES_DE_L_AUTRE_DEPOT}\`), sorties du ` +
      `périmètre : ${c.autreDepot.length} — ce dépôt ne lit ni ne câble un fichier qui n'est pas le sien`
  );
  if (c.horsExtension.length > 0) {
    lignes.push(
      `   • fichiers suivis du dossier que l'extension exclut de la population de départ : ` +
        `${c.horsExtension.length} — ${c.horsExtension.join(', ')}. Ceux que le registre NOMME ` +
        `restent jugés sur leur câblage ; les autres sont hors de cette garde, et c'est dit.`
    );
  }
  return lignes;
}

function direLeDisqueEtLeRegistre(vue: Vue): void {
  for (const l of lignesDeConfrontation(vue)) console.log(l);
}

const APPELE_DIRECTEMENT = /gov-conventions\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  void (async () => {
    if (process.argv.includes('--prove')) {
      process.exit(await prouver());
    } else {
      const vue = lireVue();
      direLePerimetre(vue);
      direLeDisqueEtLeRegistre(vue);
      const porte = await confronterLaPorteA(vue);
      for (const l of lignesDeLaPorteA(porte)) console.log(l);
      const fautes = [...controler(vue), ...porte.fautes];
      if (fautes.length === 0) {
        console.log(
          `✅ gov:conventions — ${FAMILLES.length} familles vérifiées (REQ-GOV-018, REQ-GOV-029), ` +
            `aucune violation.`
        );
        process.exit(0);
      }
      console.error(`\n❌ gov:conventions — ${fautes.length} violation(s) :\n`);
      fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}\n`));
      if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
      process.exit(1);
    }
  })();
}
