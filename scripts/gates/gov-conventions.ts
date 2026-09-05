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
 *     la seule des trois gardes câblée affichait zéro.
 *   • `perimetre_vide_sans_motif` — le cas d'école à ne PAS reproduire :
 *     `axionia/scripts/check-zod.ts` sort en 0 avec un avertissement quand son répertoire
 *     n'existe pas. Une garde à périmètre vide qui rend « ✅ » ne garde rien. Ici, un périmètre
 *     vide doit porter son MOTIF et nommer la TÂCHE qui l'ouvrira, et cette tâche doit exister au
 *     backlog. C'est la seule chose qui distingue « différée » d'« oubliée ».
 *
 * ── CE QU'ELLE NE FAIT PAS, ET LE DIT ───────────────────────────────────────────────────────
 *
 *   — Elle ne juge pas la présence des étapes de lint et de format dans `ci.yml`, ni les
 *     dépendances de `package.json` : ce sont des fichiers PARTAGÉS, écrits par A01, et un
 *     développeur ne les touche pas. Exiger leur présence rendrait la garde rouge en permanence
 *     pour un manque qu'aucune PR n'a créé (LEC-13). Ce qu'elle exige, c'est la COHÉRENCE : le
 *     jour où une étape de lint arrive, elle est bloquante et son outil est épinglé.
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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

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
}

export interface TacheVue {
  readonly id: string;
  readonly repo: string;
  readonly paths: readonly string[];
}

/** Les périmètres que la garde sait compter. Une union fermée : pas de clé inventée. */
export type ClePerimetre =
  | 'modules-serveur'
  | 'composants-client'
  | 'etapes-lint-ci'
  | 'taches-du-backlog'
  | 'gardes-du-registre';

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
  'perimetre_vide_sans_motif',
] as const;

/** Longueur minimale d'un motif de périmètre vide. Deux mots ne sont pas un motif. */
const MOTIF_MINIMAL = 60;

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
      .filter((l) => l !== '' && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'))[0] ?? ''
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
    const jobNonBloquant = /^ {4}continue-on-error:\s*true/m.test(w.source);
    for (const bloc of etapesDe(w.source)) {
      if (!LANCE_LE_LINT.test(bloc)) continue;
      const outil = /pnpm\s+format/.test(bloc) ? 'prettier' : 'eslint';
      out.push({ workflow: w.chemin, bloc, outil, jobNonBloquant });
    }
  }
  return out;
}

// ── le périmètre, dit et compté ──────────────────────────────────────────────────────────────

export interface PerimetreVu extends Perimetre {
  readonly compte: number;
  readonly unite: string;
}

/** Les gardes que la famille `garde_ecrite_jamais_appelee` regarde réellement. */
function gardesJugeables(vue: Vue): GateVue[] {
  return vue.gates.filter(
    (g) =>
      g.phase <= -1 &&
      g.script.startsWith('scripts/gates/') &&
      vue.fichiersSuivis.includes(g.script)
  );
}

export function perimetresDe(vue: Vue): PerimetreVu[] {
  const compte = (cle: ClePerimetre): { compte: number; unite: string } => {
    switch (cle) {
      case 'modules-serveur':
        return { compte: vue.sources.filter((f) => estUnModuleServeur(f.source)).length, unite: 'module(s)' };
      case 'composants-client':
        return {
          compte: vue.sources.filter((f) => lignesClient(f.source).length > 0).length,
          unite: 'composant(s)',
        };
      case 'etapes-lint-ci':
        return { compte: etapesDeLint(vue).length, unite: 'étape(s)' };
      case 'taches-du-backlog':
        return { compte: vue.taches.length, unite: 'tâche(s)' };
      case 'gardes-du-registre':
        return { compte: gardesJugeables(vue).length, unite: 'garde(s)' };
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
      for (const m of f.source.matchAll(/^\s*export\s*\{[^}]*\}\s*(?:from\s*["'][^"']+["'])?\s*;/gm)) {
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
    if (/continue-on-error:\s*true/.test(e.bloc) || e.jobNonBloquant) {
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
      if (!vue.fichiersSuivis.some((f) => config.test(f))) manque.push(`sa configuration versionnée`);
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
  for (const t of vue.taches) {
    if (t.repo !== 'partners') continue;
    for (const p of t.paths) {
      if (!p.startsWith('axionia/')) continue;
      fautes.push({
        famille: 'isolation_depot',
        message:
          `${t.id} — tâche \`repo: partners\` qui revendique \`${p}\`, un chemin du dépôt ` +
          `voisin. Une tâche écrit dans UN dépôt : le composeur de lots suppose cet invariant ` +
          `pour ne jamais mêler deux dépôts dans un même lot. Le sens inverse est déjà gardé par ` +
          `tests/unit/gouvernance/paths-derives.spec.ts (REQ-GOV-025) ; celui-ci ne l'était pas.`,
      });
    }
  }

  // ── une garde écrite doit être appelée ──
  const appelants = [...vue.workflows.map((w) => w.source), vue.hooks].join('\n');
  for (const g of gardesJugeables(vue)) {
    const noms = [g.id, g.script, ...(g.alias ?? [])];
    if (noms.some((n) => appelants.includes(n))) continue;
    fautes.push({
      famille: 'garde_ecrite_jamais_appelee',
      message:
        `\`${g.id}\` (${g.script}) est écrite et n'est appelée par aucun workflow ni par ` +
        `\`.claude/settings.json\`. Côté axionia, \`qualiopi:isolation-check\` a vécu des mois ` +
        `dans cet état en cumulant 88 violations, pendant que la seule garde câblée affichait ` +
        `zéro. Une garde qu'on ne lance pas ne garde rien — câblez-la, ou retirez son entrée.`,
    });
  }

  // ── le périmètre vide se motive et se reprend ──
  const idsDeTaches = new Set(vue.taches.map((t) => t.id));
  for (const p of perimetresDe(vue)) {
    if (p.compte > 0) continue;
    const manque: string[] = [];
    if (p.motifSiVide.trim().length < MOTIF_MINIMAL) {
      manque.push(`un motif d'au moins ${MOTIF_MINIMAL} caractères (il en fait ${p.motifSiVide.trim().length})`);
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
      '`.github/workflows/ci.yml` et `package.json` sont des fichiers PARTAGÉS que le ' +
      "développeur n'écrit pas : les étapes et les dépendances sont rendues en texte dans la PR " +
      "de GOV-014 et appliquées par A01 en une passe. La garde vérifie leur COHÉRENCE (bloquantes " +
      'et épinglées), jamais leur présence : un contrôle de dette rouge en Gate A bloquerait ' +
      "tout le monde pour un manque qu'aucune PR n'a créé (LEC-13).",
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
    cle: 'gardes-du-registre',
    libelle: 'gardes du registre (phase ≤ -1, script présent sur le disque)',
    motifSiVide:
      'Un registre sans garde jugeable signifierait que `docs/gates.json` ne se lit plus, ou ' +
      "qu'aucun script n'est encore écrit. Ce périmètre n'est jamais censé être vide au socle.",
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

function fichiersSuivis(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
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

  const gates = (JSON.parse(lire('docs/gates.json') || '{"gates":[]}') as { gates: GateVue[] }).gates;
  const taches = (
    JSON.parse(lire('docs/tasks.json') || '{"taches":[]}') as {
      taches: { id: string; repo: string; paths?: string[] }[];
    }
  ).taches.map((t) => ({ id: t.id, repo: t.repo, paths: t.paths ?? [] }));

  return {
    sources,
    workflows,
    hooks: lire('.claude/settings.json'),
    packageJson: lire('package.json'),
    fichiersSuivis: suivis,
    gates,
    taches,
    perimetres: PERIMETRES_DECLARES,
  };
}

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
  scripts: { lint: 'eslint .', 'format:check': 'prettier --check .' },
  devDependencies: { eslint: '^9.36.0', prettier: '^3.6.2' },
});

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
    { id: 'QA-T00', repo: 'partners', paths: ['tests/'] },
    { id: 'QA-T01', repo: 'partners', paths: ['tests/'] },
    { id: 'GOV-017a', repo: 'partners', paths: ['docs/'] },
    { id: 'UX-P0-02', repo: 'partners', paths: ['src/app/UX-P0-02'] },
    { id: 'UX-P1-02', repo: 'partners', paths: ['src/app/UX-P1-02'] },
    { id: 'DM-03-A', repo: 'axionia', paths: ['axionia/DM-03-A'] },
  ],
  perimetres: PERIMETRES_DECLARES,
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
        { chemin: 'src/app/espace/champs.ts', source: '"use server";\n\nexport const CHAMP = "x";\n' },
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
    libelle: 'une action asynchrone exportée d’un module « use server » — le cas normal',
    vue: variante({
      sources: [
        {
          chemin: 'src/app/espace/actions.ts',
          source: '"use server";\n\nexport async function agir() {}\nexport type Entree = { a: string };\n',
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
          source: '// use-client: tri et filtres côté navigateur\n"use client";\n\nexport function T() {}\n',
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
    libelle: 'une gate du registre dont le script n’existe PAS — `gates:prouvees` la nomme, pas nous',
    vue: variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:derivation', phase: -1, script: 'scripts/gates/gov-derivation.ts' },
      ],
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
      workflows: [{ chemin: '.github/workflows/ci.yml', source: 'jobs:\n  gate-a:\n    steps:\n      - run: pnpm test\n' }],
      packageJson: '{}',
      fichiersSuivis: ['package.json'],
      perimetres: PERIMETRES_DECLARES.filter((p) => p.cle !== 'etapes-lint-ci'),
    }),
  },
];

function prouver(): number {
  for (const t of TEMOINS) {
    const familles = controler(t.vue).map((f) => f.famille);
    if (!familles.includes(t.famille)) {
      console.error(`❌ Le témoin « ${t.libelle} » n'a PAS fait rougir ${t.famille}.`);
      console.error(`   Familles obtenues : ${familles.length === 0 ? '(aucune)' : familles.join(', ')}`);
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
  const sansTemoin = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }
  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(
    `   ${TEMOINS.length} témoins rouges, ${CONTRE_TEMOINS.length} contre-témoins verts — dont la vue conforme.`
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

const APPELE_DIRECTEMENT = /gov-conventions\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    process.exit(prouver());
  } else {
    const vue = lireVue();
    direLePerimetre(vue);
    const fautes = controler(vue);
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
}
