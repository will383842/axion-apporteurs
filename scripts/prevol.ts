/**
 * prevol.ts — le PRÉ-VOL local, DÉRIVÉ de la porte A (REQ-GOV-018, REQ-GOV-013, RM-01).
 *
 * USAGE : pnpm prevol            rend les vues, balaie les porteurs, puis rejoue la porte A
 *         pnpm prevol --liste    ne joue aucune étape : imprime tout ce qu'il a DÉRIVÉ, et sort en 0
 *
 * POURQUOI CE FICHIER EXISTE. `docs/CONVENTIONS.md` §7 (« les hooks locaux ne font pas foi :
 * husky n'est pas fiable en worktree, le pré-vol est `pnpm prevol` »), `docs/CHARTE-AGENTS.md`,
 * `docs/agents.json` et la fiche `dev-partners` IMPOSENT `pnpm prevol` depuis le socle. Le script
 * n'existait pas et `package.json` ne portait pas l'entrée : chaque agent le redécouvrait seul, et
 * la CI découvrait à sa place — au prix d'un aller-retour de cinq minutes par découverte.
 *
 * ── CE QU'IL EXÉCUTE, ET POURQUOI IL NE LE RECOPIE PAS ──────────────────────────────────────
 *
 * La liste des étapes est LUE dans `.github/workflows/ci.yml`, job `gate-a`, dans son ordre, par
 * l'analyseur YAML partagé du dépôt (`scripts/lib/lire-yaml.ts`) — pas par un découpage maison. Une
 * liste tenue ici en aurait fait une seconde source : le jour où une garde entre en CI, le pré-vol
 * cesserait de la voir, en silence, et rendrait un vert qui ment. Le seul ordre qui vaille est
 * celui de la porte A, y compris son ordre le plus RÉCENT (REQ-QA-013 : lint, format, typecheck,
 * tests et `req:check` passent AVANT
 * `gov:etat`), parce qu'un pré-vol qui mesure dans un autre ordre ne prédit pas ce que la CI rendra.
 *
 * 🔑 ET CE N'EST PAS LA MÊME LISTE QUE LA CHAÎNE `gov:partiel` DE `package.json`. L'acceptation de
 * GOV-047 nomme cette chaîne comme source possible ; la mesure du 2026-09-22 dit de ne pas la
 * suivre. Elle n'enchaîne qu'une PART des gardes que `gate-a` joue — son nom le dit —, et ce
 * qu'elle laisse dehors comprend chaque mode `:prove`, `lint`, `format:check`, `typecheck`,
 * `test`, `req:check`, et `gov:termes-interdits`, qui est BLOQUANTE en CI. Un pré-vol dérivé de la
 * chaîne aurait donc rendu VERT là où la CI rougit — sur la garde même dont le rouge imprimait le
 * nom de l'autre, car `gov:check` a désigné deux choses dans ce dépôt. `partners/ADR-0018`
 * (accepté) a retiré le nom des DEUX côtés : la chaîne s'appelle `gov:partiel`, la garde
 * `gov:termes-interdits`. C'est pour cela que la source est `ci.yml` : c'est le seul endroit où
 * soit écrit ce qui bloque réellement une demande de fusion.
 *
 * ⚠️ AUCUN DES DEUX COMPTES NE S'ÉCRIT ICI, ET C'EST UNE CORRECTION. La première rédaction de ce
 * paragraphe en posait trois — « 17 », « 65 », « 48 absentes » — et deux étaient faux le jour même
 * où ils ont été tapés. Les listes se comptent elles-mêmes : `pnpm prevol --liste` rend celle de
 * `gate-a` avec les étapes écartées et leur motif, `package.json` porte la chaîne. Un total posé à
 * côté d'une liste redevient faux au premier maillon ajouté — c'est exactement ce que la note de
 * `NOM_DU_SCRIPT`, plus bas dans ce fichier, condamne.
 *
 * Trois familles d'étapes de `gate-a` ne sont PAS jouées ici, et chacune est NOMMÉE dans la sortie
 * plutôt que tue :
 *   — celles qui ne sont pas un `run:` (`actions/checkout`, `pnpm/action-setup`, `setup-node`) ;
 *   — `pnpm install --frozen-lockfile` : le worktree est déjà installé, et `docs/CONVENTIONS.md` §7
 *     interdit d'y toucher autrement que depuis le store partagé ;
 *   — toute étape portant un `if:` qui dépend du contexte d'une PR (`gov:entite:corps` juge le corps
 *     PUBLIÉ d'une PR qui n'existe pas encore quand on lance le pré-vol).
 *
 * UNE SEULE SUBSTITUTION DE SHELL EST TOLÉRÉE, et le reste échoue FERMÉ. `gov:etat` reçoit en CI
 * `--now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"`. Cette substitution-là est remplacée par l'instant
 * courant. Tout AUTRE `$` et tout accent grave rougit au lieu d'être deviné : exécuter à l'aveugle
 * la commande qu'on n'a pas comprise est la manière connue de rendre un vert sans mesure. Le
 * filtre n'ÉNUMÈRE pas les formes — il n'en connaissait qu'une, `$(…)`, quand `/bin/sh` en
 * substitue quatre, et les trois autres passaient. Énumérer, c'est en oublier une. Un `run:` de
 * PLUSIEURS lignes échoue fermé de même : la CI le joue sous `bash -e`, le shell local autrement.
 *
 * ── CE QUE LE PRÉ-VOL FAIT EN PLUS, ET QUE LA CI NE PEUT PAS FAIRE ──────────────────────────
 *
 * La CI part d'un clone neuf ; le pré-vol part d'un worktree où les VUES viennent d'être écrites.
 * Il les rend donc d'abord, dans l'ordre, `docs/PLAN-STATE.md` en DERNIER : PLAN-STATE lit le
 * journal, le backlog et la traçabilité, et le rendre en premier le périme aussitôt.
 *
 * Puis il vérifie que ces quatre fichiers-là ne portent aucun RETOUR CHARIOT. La famille générale
 * `fin_de_ligne_non_lf` est déjà tenue par `pnpm gov:termes-interdits`, plus loin dans la liste
 * dérivée — on ne la redouble pas (RM-07). Ce contrôle-ci est BORNÉ aux fichiers que les rendus
 * viennent d'écrire, et il est placé JUSTE APRÈS eux, parce qu'un CRLF pondu par un outil Windows
 * tue d'abord une garde qui lit la vue (`gov:attributions` sort en `[source_illisible]`) et nomme
 * alors la mauvaise cause. Mesuré le 2026-09-21 : 1 132 retours chariot introduits sans être vus.
 * ⚠️ Le compte se lit en HEXADÉCIMAL (`od -An -tx1 | grep -c '^0d$'`) : la lecture en mode
 * caractères annonce des centaines de faux retours chariot sur un fichier sain, parce qu'elle
 * compte les échappements des expressions rationnelles. Ici on lit l'octet, jamais son affichage.
 *
 * ── LE BALAYAGE DES PORTEURS, ET POURQUOI IL S'EXCLUT LUI-MÊME ──────────────────────────────
 *
 * REQ-GOV-013, GOV-047. SEPT fichiers suivis ORDONNENT `pnpm prevol` — six quand la dette a été
 * trouvée, plus `scripts/reprise.ts` que `partners/ADR-0018` a apporté — dont
 * `scripts/lot/lot.workflow.js`, qui l'INJECTE dans le prompt de chaque développeur de lot. Le
 * balayage les confronte aux scripts que `package.json` déclare, DANS LES DEUX SENS : un porteur qui
 * ordonne une commande absente rougit, et le retrait du script rougit chez les sept porteurs d'un
 * coup — avant que le prochain agent ne le découvre à ses frais.
 *
 * 🔑 UNE TÂCHE QUI SE COMPTE ELLE-MÊME FAUSSE SON PROPRE BALAYAGE. `git grep -l prevol` rend aussi
 * `docs/tasks.json` et ses deux vues rendues, qui ne portent la chaîne que parce que GOV-047 y est
 * versée. L'acceptation de la tâche s'est trompée DEUX FOIS sur ce compte pour cette raison. Le
 * balayage écarte donc le backlog et ses vues, il le DIT, et il rend LES DEUX COMPTES — le brut et
 * le retenu. Une exclusion qui n'exclut plus rien (le fichier écarté ne porte plus la chaîne) est
 * PÉRIMÉE et rougit : sinon elle deviendrait un trou muet dans le périmètre.
 *
 * ── UN ROUGE QUI NOMME LA MAUVAISE CAUSE COÛTE PLUS CHER QU'UN ROUGE ABSENT ──────────────────
 *
 * `pnpm test` inclut `tests/integration/**`, qui exige un démon Docker (`partners/ADR-0015`,
 * décision 7 ; `partners/ADR-0001`). Sans démon, le harnais LÈVE en le nommant — mais son rouge
 * s'imprime au milieu de la suite, sous le nom de l'étape « Tests », et se lit comme une régression.
 * Mesuré au premier usage réel de ce script le 2026-09-21 : on part réparer ce qui n'est pas cassé.
 *
 * Le pré-vol sait déjà nommer les étapes qu'il écarte et leur motif ; il fait désormais de même ici.
 * Il sonde le démon AVANT la course (le dire après vingt-cinq minutes ne sert plus à rien), et si le
 * démon est injoignable il ANNOTE l'étape qui lance la suite, dans son rouge, avec la liste des
 * fichiers de banc DÉRIVÉE du disque. Il ne rend PAS vert pour autant : un maillon qu'on n'a pas pu
 * jouer reste un maillon non mesuré.
 *
 * ── SENS DE PANNE ───────────────────────────────────────────────────────────────────────────
 *
 * Aucune commande mesurée ne passe par un tube. Le brouillon de ce script écrivait
 * `if ! pnpm gov:check | tail -25` : le code de sortie d'un pipeline est celui de sa DERNIÈRE
 * commande, donc `tail`, donc 0 — la garde centrale du pré-vol ne pouvait pas rougir. Ici chaque
 * étape est lancée seule et son code de sortie est lu.
 *
 * Un rouge n'interrompt pas la course : la CI s'arrête à la première étape rouge, le pré-vol les
 * rend TOUTES. Un pré-vol qui s'arrête au premier rouge se paie en autant d'allers-retours que de
 * fautes ; celui-ci se paie une fois.
 *
 * Ses sorties non nulles — le compte est au registre, il ne se recopie pas ici — sont déclarées au
 * registre des refus (REQ-GOV-032,
 * `tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts`) et exercées par
 * `tests/unit/gouvernance/prevol-existe-et-refuse.spec.ts`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estObjet, lireYaml } from './lib/lire-yaml';
import { fichiersSuivisOuRefus } from './lot/fichiers-suivis';

export const CI = '.github/workflows/ci.yml';
export const SUBSTITUTION_TOLEREE = '$(date -u +%Y-%m-%dT%H:%M:%SZ)';

/**
 * LE JOB dont les étapes font la porte A — la SEULE chose que ce script ne puisse pas dériver :
 * elle EST l'ancre de la dérivation. Elle est donc CONFRONTÉE à `ci.yml` par
 * `tests/unit/gouvernance/prevol-existe-et-refuse.spec.ts`, et un fichier qui ne la déclare pas
 * fait REFUSER le pré-vol. Prendre « le premier bloc `steps:` venu » est ce qui, mesuré le
 * 2026-09-23, faisait passer l'étape d'un AUTRE job à `spawnSync(…, { shell: true })`.
 */
export const JOB_DE_LA_PORTE_A = 'gate-a';

/**
 * Le nom du script que les porteurs ORDONNENT, et qui est le SUJET de ce balayage. Il n'est pas
 * recopié d'ailleurs : il est confronté à `package.json`. Renommer le script sans toucher aux
 * porteurs fait donc rougir TOUS les porteurs d'un coup, ce qui est exactement ce qu'on veut — et
 * le compte ne s'écrit pas ici : la liste se compte elle-même, un total posé à côté redeviendrait
 * faux au premier porteur ajouté.
 */
export const NOM_DU_SCRIPT = 'prevol';

/** La classe tierce dont la présence SIGNE un fichier de banc : elle exige le démon Docker. */
const MARQUEUR_DE_BANC = 'PostgreSqlContainer';

/** Une étape : son nom tel que la CI l'affiche, et la commande exacte. */
export type Etape = { nom: string; commande: string };
/** Ce qu'on a refusé de jouer, et pourquoi — la sortie le nomme au lieu de le taire. */
export type Ecarte = { nom: string; motif: string };

/**
 * Les rendus, dans l'ordre, avec le fichier que CHACUN écrit. Le fichier n'est pas une copie du
 * nom de la commande : c'est ce que le contrôle de retour chariot doit relire juste après.
 */
export const RENDUS: Etape[] = [
  { nom: 'Vue : traçabilité', commande: 'pnpm gov:trace:render' },
  { nom: 'Vue : backlog', commande: 'pnpm gov:tasks:render' },
  { nom: 'Vue : index des ADR', commande: 'pnpm adr:index' },
  {
    nom: 'Vue : état vivant (EN DERNIER — il lit les trois autres)',
    commande: 'pnpm plan-state:build',
  },
];
export const VUES = [
  'docs/TRACABILITE.md',
  'docs/TASKS.md',
  'docs/adr/INDEX.md',
  'docs/PLAN-STATE.md',
];

/**
 * LE BACKLOG ET SES VUES RENDUES — écartés du balayage, et NOMMÉS.
 *
 * Ces trois fichiers portent la chaîne UNIQUEMENT parce que la tâche GOV-047 y est versée : son id,
 * ses `paths` et son acceptation. Les compter comme porteurs revient à mesurer la tâche au lieu du
 * dépôt, et c'est la faute que les deux rédactions successives de l'acceptation ont commise.
 */
export const BACKLOG_ET_SES_VUES: Ecarte[] = [
  {
    nom: 'docs/tasks.json',
    motif: 'le backlog lui-même — GOV-047 y est versée, avec ses `paths` et son acceptation',
  },
  { nom: 'docs/TASKS.md', motif: 'vue rendue du backlog (`pnpm gov:tasks:render`)' },
  {
    nom: 'docs/paths-proposes.json',
    motif: 'vue rendue des `paths` du backlog (`pnpm lot:paths`)',
  },
];

/**
 * NOMMER N'EST PAS PRESCRIRE — la troisième erreur de mesure, et elle est la mienne.
 *
 * L'acceptation de GOV-047 annonce SIX porteurs ; ils sont SEPT depuis que `partners/ADR-0018` a
 * atterri, et cette liste-là est FIGÉE par le banc — un huitième prescripteur fait rougir avant de
 * s'ajouter en silence. Le seul critère qu'une machine sache appliquer — « le fichier écrit
 * `pnpm <script>` » — en rend DAVANTAGE sur le dépôt réel ; le balayage imprime les deux comptes,
 * et aucun des deux ne se recopie ici : posé à côté d'une liste, il redevient faux au premier
 * porteur ajouté. Ceux en trop ne prescrivent rien à personne, et chacun tombe sous une RACINE,
 * pas sous une liste nominative :
 *
 *   — le script lui-même : son mode d'emploi n'est pas un ordre, il EST la commande ;
 *   — `tests/**` : un test JUGE la commande, il ne l'impose à aucun agent ;
 *   — `docs/journal/**` et sa vue rendue `docs/PLAN-STATE.md` : le récit DATÉ de la dette
 *     (« `pnpm prevol` n'existe pas », entrée de la PR 81). Un récit au passé n'engage personne ;
 *   — `docs/adr/**` : une ADR ENREGISTRE une décision prise. `partners/ADR-0018` nomme la commande
 *     pour dire QUAND elle atterrira, pas pour qu'on la tape. Même famille que le journal.
 *
 * Ces cinq-là restent CONFRONTÉS à `package.json` — retirer le script doit rougir partout où il
 * est nommé. Ils sortent seulement du compte des PRESCRIPTEURS, qui est le compte que REQ-GOV-013
 * rend opposable : celui des fichiers qu'un agent lit pour savoir ce qu'il doit taper.
 */
export const RACINES_DU_RECIT: Ecarte[] = [
  { nom: 'tests/', motif: 'un test JUGE la commande, il ne la prescrit à personne' },
  { nom: 'docs/journal/', motif: 'le récit daté de la dette, au passé' },
  {
    nom: 'docs/adr/',
    motif:
      'une ADR ENREGISTRE une décision prise, au passé : elle nomme la commande pour dire quand ' +
      "elle atterrira, pas pour qu'on la tape — même famille que le journal",
  },
  { nom: 'docs/PLAN-STATE.md', motif: 'vue rendue du journal (`pnpm plan-state:build`)' },
];

// ── le balayage des porteurs ──────────────────────────────────────────────────

/** Un fichier suivi qui ORDONNE une ou plusieurs commandes de la famille du pré-vol. */
export type Porteur = { chemin: string; commandes: string[] };

export type Balayage = {
  /** Compte BRUT : tout fichier suivi qui porte la chaîne, backlog compris. */
  brut: string[];
  /** Les fichiers écartés parce que la tâche y est versée, avec leur motif. */
  ecartes: Ecarte[];
  /** Une exclusion qui n'exclut plus rien : le fichier écarté ne porte plus la chaîne. */
  exclusionsPerimees: string[];
  /** Compte RETENU : le brut moins le backlog et ses vues. */
  retenus: string[];
  /** Ceux des retenus qui NOMMENT `pnpm <script>` : tous confrontés à `package.json`. */
  porteurs: Porteur[];
  /** Ceux des porteurs qui PRESCRIVENT — le compte que REQ-GOV-013 rend opposable. */
  prescripteurs: Porteur[];
  /** Ceux qui nomment sans prescrire : le script, ses tests, le récit. */
  recits: Porteur[];
  /** Un porteur qui ordonne une commande qu'aucun script ne déclare. */
  introuvables: { chemin: string; commande: string }[];
  /** Ce qui fait rougir le balayage. Vide = vert. */
  fautes: string[];
  /** Le résumé, avec LES DEUX COMPTES et les écartés nommés. */
  resume: string;
};

/**
 * Les commandes `pnpm <script>` de la famille du pré-vol qu'un texte ORDONNE.
 *
 * On ne lit pas « le fichier contient la chaîne » : `package.json` la contient parce qu'il la
 * DÉCLARE, ce script parce qu'il l'EST, le journal parce qu'il en raconte la dette. Porter n'est
 * pas ordonner — seule la forme `pnpm <script>` engage un agent à lancer quelque chose.
 */
export function commandesOrdonnees(texte: string): string[] {
  const trouvees = new Set<string>();
  for (const trouve of texte.matchAll(/\bpnpm\s+([A-Za-z0-9:_-]+)/g)) {
    const nom = trouve[1]!;
    if (nom.includes(NOM_DU_SCRIPT)) trouvees.add(nom);
  }
  return [...trouvees].sort();
}

/**
 * Le balayage, PUR : il reçoit le périmètre, un lecteur et les scripts déclarés. Tout est injectable
 * pour que les deux sens soient éprouvables (RM-11) — un porteur qui ordonne l'introuvable, et le
 * retrait du script.
 */
/**
 * Un porteur RACONTE au lieu de prescrire ? La réponse se lit sur les RACINES ci-dessus et sur le
 * chemin du script lui-même — jamais sur une liste nominative, qui recopierait l'acceptation
 * (RM-01) et vieillirait à chaque fichier ajouté.
 */
export function raconteSeulement(chemin: string, soiMeme: string): boolean {
  if (chemin === soiMeme) return true;
  return RACINES_DU_RECIT.some((r) =>
    r.nom.endsWith('/') ? chemin.startsWith(r.nom) : chemin === r.nom
  );
}

export function balayer(
  suivis: string[],
  lire: (chemin: string) => string,
  scriptsDeclares: string[],
  soiMeme: string
): Balayage {
  const porteLaChaine = (chemin: string): boolean => {
    try {
      return lire(chemin).includes(NOM_DU_SCRIPT);
    } catch {
      return false;
    }
  };
  const brut = suivis.filter(porteLaChaine).sort();
  const ecartesParNom = new Set(BACKLOG_ET_SES_VUES.map((e) => e.nom));
  // PÉRIMÉE veut dire : le fichier est bien dans le périmètre et n'y porte PLUS la chaîne. Un
  // fichier absent du périmètre n'est pas une exclusion morte — c'est un dépôt qui ne l'a jamais eu.
  const exclusionsPerimees = BACKLOG_ET_SES_VUES.filter(
    (e) => suivis.includes(e.nom) && !brut.includes(e.nom)
  ).map((e) => e.nom);
  const retenus = brut.filter((f) => !ecartesParNom.has(f));

  const porteurs: Porteur[] = [];
  const introuvables: { chemin: string; commande: string }[] = [];
  for (const chemin of retenus) {
    const commandes = commandesOrdonnees(lire(chemin));
    if (commandes.length === 0) continue;
    porteurs.push({ chemin, commandes });
    for (const commande of commandes) {
      if (!scriptsDeclares.includes(commande)) introuvables.push({ chemin, commande });
    }
  }

  const prescripteurs = porteurs.filter((p) => !raconteSeulement(p.chemin, soiMeme));
  const recits = porteurs.filter((p) => raconteSeulement(p.chemin, soiMeme));

  const fautes: string[] = [];
  for (const { chemin, commande } of introuvables) {
    fautes.push(
      `\`${chemin}\` nomme \`pnpm ${commande}\`, qu'aucun script de \`package.json\` ne déclare : ` +
        'chaque agent qui suit ce fichier lance une commande introuvable.'
    );
  }
  if (prescripteurs.length === 0) {
    fautes.push(
      'AUCUN prescripteur trouvé. Ce n’est pas « rien à signaler » : les fiches de rôle, la charte, ' +
        'les conventions, le prompt et le workflow de lot sont suivis par git, et un balayage qui ' +
        'n’en voit aucun mesure autre chose que sa cible.'
    );
  }
  for (const nom of exclusionsPerimees) {
    fautes.push(
      `\`${nom}\` est écarté du balayage et ne porte plus la chaîne : l'exclusion est PÉRIMÉE, ` +
        'et une exclusion qui n’exclut rien est un trou muet dans le périmètre.'
    );
  }

  const dire = (p: Porteur): string =>
    `       · ${p.chemin} — ${p.commandes.map((c) => `pnpm ${c}`).join(', ')}`;
  const lignes = [
    `${brut.length} fichier(s) suivi(s) portent la chaîne « ${NOM_DU_SCRIPT} » (compte BRUT).`,
    `   − ${BACKLOG_ET_SES_VUES.length} écarté(s) — le backlog et ses vues rendues, qui ne la portent que parce que la tâche y est versée :`,
    ...BACKLOG_ET_SES_VUES.map((e) => `       · ${e.nom} — ${e.motif}`),
    `   = ${retenus.length} retenu(s) (compte APRÈS EXCLUSION), dont ${porteurs.length} nommant une commande — tous confrontés à \`package.json\`.`,
    `   ${prescripteurs.length} PRESCRIPTEUR(S) — ce qu'un agent lit pour savoir quoi taper :`,
    ...prescripteurs.map(dire),
    `   ${recits.length} qui NOMMENT sans prescrire (le script, ses tests, le récit et sa vue) :`,
    ...recits.map(dire),
  ];
  return {
    brut,
    ecartes: BACKLOG_ET_SES_VUES,
    exclusionsPerimees,
    retenus,
    porteurs,
    prescripteurs,
    recits,
    introuvables,
    fautes,
    resume: lignes.join('\n'),
  };
}

// ── le banc d'intégration, et le démon qu'il exige ────────────────────────────

/** Les scripts de `package.json` qui lancent la suite de tests — DÉRIVÉS de leur corps. */
export function scriptsQuiLancentLaSuite(scripts: Record<string, string>): string[] {
  return Object.entries(scripts)
    .filter(([, corps]) => /\bvitest\b/.test(corps))
    .map(([nom]) => nom)
    .sort();
}

/** Les étapes dérivées de `ci.yml` qui lancent l'un de ces scripts. */
export function etapesQuiLancentLaSuite(etapes: Etape[], scriptsDeLaSuite: string[]): Etape[] {
  return etapes.filter((e) =>
    scriptsDeLaSuite.some((nom) => new RegExp(`\\bpnpm\\s+${nom}(?![\\w:-])`).test(e.commande))
  );
}

// ── `pnpm pre-gate` : les étapes RAPIDES de la porte A (GOV-101) ──────────────────────────────

/**
 * 🔴 LE DÉFAUT MESURÉ (orchestrateur, 2026-09-26) : la porte A rougissait APRÈS les relectures — un
 * nom de garde, `perf:budgets`, `red-first`, une vue périmée —, et chaque rouge relançait un tour.
 * `pnpm prevol` rejouait déjà toute la porte A, suite comprise : trop long pour être lancé à chaque
 * fois. `pnpm pre-gate` (`--rapide`) joue les MÊMES étapes, lues dans `ci.yml`, SAUF celles-ci —
 * chacune nommée avec son motif, jamais tue. Les scripts qui lancent la suite (`vitest`) en sont
 * écartés par DÉRIVATION (`scriptsQuiLancentLaSuite`) ; les trois ci-dessous sont DÉCLARÉS, et le
 * témoin exige que chacun soit bien une étape de la porte A : une entrée morte rougit.
 */
export const ETAPES_LENTES: readonly { script: string; motif: string }[] = [
  {
    script: 'req:check',
    motif: 'relit les résultats de `pnpm test`, qui ne tourne pas dans le pré-contrôle rapide',
  },
  {
    script: 'a11y:navigateurs',
    motif: 'télécharge et installe les navigateurs de Playwright, qui ne servent qu’à la suite',
  },
  {
    script: 'mutation:pr',
    motif:
      'lance Stryker sur les fichiers mutables de la PR : étape SÉPARÉE, à lancer avant la PR ' +
      'quand elle touche `src/domain/` ou `src/server/` (`pnpm mutation:pr`)',
  },
];

/** Les étapes de la porte A partagées en RAPIDES (jouées) et LENTES (nommées, avec leur motif). */
export function etapesRapides(
  jouees: Etape[],
  scripts: Record<string, string>
): { rapides: Etape[]; lentes: Ecarte[] } {
  const lance = (e: Etape, nom: string): boolean =>
    new RegExp(`\\bpnpm\\s+${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(
      e.commande
    );
  const suite = scriptsQuiLancentLaSuite(scripts);
  const rapides: Etape[] = [];
  const lentes: Ecarte[] = [];
  for (const e of jouees) {
    const deLaSuite = suite.find((s) => lance(e, s));
    const declaree = ETAPES_LENTES.find((s) => lance(e, s.script));
    if (deLaSuite !== undefined) {
      lentes.push({
        nom: e.nom,
        motif: `lance la suite de tests (\`pnpm ${deLaSuite}\`, dérivé : son script appelle vitest)`,
      });
    } else if (declaree !== undefined) {
      lentes.push({ nom: e.nom, motif: declaree.motif });
    } else {
      rapides.push(e);
    }
  }
  return { rapides, lentes };
}

/**
 * La seule étape de PR que le pré-contrôle SIMULE : `red-first` porte en CI un `if:` de PR, parce
 * que sa base vient de `GITHUB_BASE_REF`. En local, la base est `origin/main` — ce que la porte A
 * lira pour une PR vers `main`.
 */
export const RED_FIRST_SIMULE: Etape = {
  nom: 'red-first — simulé contre origin/main (étape de PR en porte A)',
  commande: 'pnpm red-first --base origin/main',
};

/**
 * Les fichiers de test qui exigent le démon Docker — DÉRIVÉS du disque en deux sauts, jamais listés :
 * le harnais est le fichier suivi de `tests/` qui instancie le conteneur, les fichiers de banc sont
 * les spécifications qui l'importent. Le jour où le harnais déménage, la liste suit.
 */
export function fichiersDeBanc(suivis: string[], lire: (chemin: string) => string): string[] {
  const lireOuVide = (chemin: string): string => {
    try {
      return lire(chemin);
    } catch {
      return '';
    }
  };
  const harnais = new Set(
    suivis.filter(
      (f) => f.startsWith('tests/') && f.endsWith('.ts') && lireOuVide(f).includes(MARQUEUR_DE_BANC)
    )
  );
  const specifications = suivis.filter((f) => /\.(spec|test)\.tsx?$/.test(f));
  const banc = new Set<string>(specifications.filter((f) => harnais.has(f)));
  for (const f of specifications) {
    for (const trouve of lireOuVide(f).matchAll(/from\s+'(\.[^']*)'/g)) {
      const cible = posix.normalize(posix.join(posix.dirname(f), trouve[1]!));
      if (harnais.has(cible) || harnais.has(`${cible}.ts`)) banc.add(f);
    }
  }
  return [...banc].sort();
}

/** Le démon Docker répond-il ? Lancé une fois, avant la course : le dire après ne sert plus. */
export function demonDockerJoignable(): boolean {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true });
  return r.error === undefined && r.status === 0;
}

/**
 * Ce qu'il faut dire d'un rouge venu d'une étape qui lance la suite, quand le démon manque. Rendre
 * `null` quand il n'y a rien à dire : une annotation systématique redevient un bruit qu'on ignore.
 */
export function causeProbable(
  nomDeLEtape: string,
  etapesDeLaSuite: Etape[],
  demonJoignable: boolean,
  banc: string[]
): string | null {
  if (demonJoignable) return null;
  if (!etapesDeLaSuite.some((e) => e.nom === nomDeLEtape)) return null;
  if (banc.length === 0) return null;
  return (
    `⚠️ démon Docker INJOIGNABLE, et ${banc.length} fichier(s) de banc en dépendent ` +
    `(${banc.join(', ')}). Ce rouge-là est une ABSENCE DE BANC, pas un test cassé : la CI, elle, ` +
    'a le démon. Lis le rouge de cette étape en écartant ces fichiers avant de réparer quoi que ce soit.'
  );
}

// ── la lecture de `ci.yml` ────────────────────────────────────────────────────

/**
 * Le job `${JOB_DE_LA_PORTE_A}` de `ci.yml`, découpé en étapes — et des refus plutôt qu'un silence.
 *
 * `ci.yml` est lu par L'analyseur YAML partagé du dépôt (`scripts/lib/lire-yaml.ts`, fondé sur celui
 * que Prettier embarque), jamais par des expressions rationnelles. Le job se trouve par son NOM,
 * `workflow.jobs['${JOB_DE_LA_PORTE_A}'].steps` : il ne peut rendre les étapes d'aucun autre job,
 * il ne déborde sur rien, et il n'a pas d'indentation à supposer.
 *
 * 🔴 CE QUE LE LECTEUR PRÉCÉDENT A FAIT DE FAUX, MESURÉ DANS DES DÉPÔTS JETABLES. Il découpait le
 * texte à coups d'expressions rationnelles, et chaque correction en ajoutait une :
 *   — le 2026-09-23 (lentille `securite`) : le PREMIER bloc `steps:` venu, lu jusqu'à la fin du
 *     fichier, et une séquence à SIX espaces supposée — d'où les étapes d'un AUTRE job passées à
 *     `spawnSync(…, { shell: true })`, et un `ci.yml` valide qui rendait zéro étape puis VERT ;
 *   — le 2026-09-24 (lentille `simplicite`) : un scalaire bloc `run: |` capturé comme la commande
 *     `|`, un commentaire en colonne 0 qui TRONQUAIT la liste en silence (il passait pour la fin
 *     du job), et une ancre posée sur une étape que le lecteur ignorait avant de JOUER l'étape.
 * Un arbre analysé ne pose aucune de ces questions. Ce qui reste à décider se décide ici :
 *   — un fichier que l'analyseur refuse (ancre, alias, étiquette, clé de fusion, clé en double)
 *     REFUSE le pré-vol, avec le motif de l'analyseur ;
 *   — un `run:` de PLUSIEURS lignes REFUSE : la CI le joue sous `bash -e`, `spawnSync(…, { shell:
 *     true })` ne le joue pas ainsi, et deviner l'écart est exactement ce que ce script s'interdit ;
 *   — une dérivation qui rend zéro étape JOUABLE REFUSE. « Je n'ai rien trouvé à jouer » et « tout
 *     est vert » sont deux phrases différentes, et une seule des deux autorise à pousser.
 */
export async function etapesDeLaPorteA(
  texte: string
): Promise<{ jouees: Etape[]; ecartees: Ecarte[] }> {
  let workflow: unknown = null;
  let illisible: string | null = null;
  try {
    workflow = await lireYaml(texte);
  } catch (e) {
    illisible = e instanceof Error ? e.message : String(e);
  }
  const jobs = estObjet(workflow) && estObjet(workflow.jobs) ? workflow.jobs : {};
  const job = jobs[JOB_DE_LA_PORTE_A];
  if (!estObjet(job)) {
    console.error(
      illisible !== null
        ? `❌ prevol — \`${CI}\` : l'analyseur YAML partagé le REFUSE (${illisible}). Une ancre ` +
            `ou un alias ferait porter à une étape une clé écrite ailleurs : on ne devine pas ` +
            `laquelle avant de la passer au shell.`
        : `❌ prevol — \`${CI}\` : aucun job \`${JOB_DE_LA_PORTE_A}\` trouvé. Jouer les étapes du ` +
            `premier job venu reviendrait à mesurer autre chose que la porte A — et à lancer sa ` +
            `commande sur cette machine.`
    );
    process.exit(1);
  }
  // Une clé `steps:` sans valeur est une séquence VIDE, pas une clé absente : elle tombe sur le
  // refus « aucune étape jouable » plus bas, qui dit ce qu'il a lu.
  const etapes = job.steps ?? (Object.hasOwn(job, 'steps') ? [] : undefined);
  if (!Array.isArray(etapes)) {
    console.error(
      `❌ prevol — \`${CI}\` : aucun bloc \`steps:\` de job trouvé. La porte A n'a pas de source.`
    );
    process.exit(1);
  }

  const texteDe = (v: unknown): string | undefined =>
    typeof v === 'string' ? v.trim() : undefined;
  const jouees: Etape[] = [];
  const ecartees: Ecarte[] = [];
  for (const etape of etapes) {
    const champs = estObjet(etape) ? etape : {};
    const run = texteDe(champs.run);
    const uses = texteDe(champs.uses);
    // Une étape de `ci.yml` n'est pas tenue de porter un `name:` : on la désigne alors par ce qui
    // l'identifie vraiment — son `uses:` ou son `run:`. Un tiret ne se retrouve pas dans le fichier.
    const nom =
      texteDe(champs.name) ??
      (uses !== undefined ? `uses: ${uses}` : run !== undefined ? `run: ${run}` : '—');
    if (run === undefined) {
      ecartees.push({ nom, motif: "ce n'est pas un `run:` — GitHub l'exécute, pas le shell" });
      continue;
    }
    if (run.startsWith('pnpm install')) {
      ecartees.push({ nom, motif: 'le worktree est déjà installé (`docs/CONVENTIONS.md` §7)' });
      continue;
    }
    if (Object.hasOwn(champs, 'if')) {
      ecartees.push({
        nom,
        motif: 'porte un `if:` qui dépend du contexte de la PR, absent en local',
      });
      continue;
    }
    const commande = run
      .split(SUBSTITUTION_TOLEREE)
      .join(new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
    // ÉCHEC FERMÉ, ET SANS ÉNUMÉRER LES FORMES. `lancer()` passe cette chaîne à
    // `spawnSync(…, { shell: true })`, c'est-à-dire à `/bin/sh` sous Linux et macOS, où QUATRE
    // écritures substituent : `$(…)`, l'accent grave, `$VAR` et `${…}`. Filtrer sur `$(` seul —
    // ce que faisait une version précédente — en laissait passer trois. On ne liste donc pas ce
    // qu'on refuse : on refuse tout `$` et tout accent grave qui SURVIT au remplacement de la
    // seule substitution tolérée. Énumérer les formes, c'est en oublier une.
    // Et un corps de PLUSIEURS lignes, que le shell local ne joue pas comme `bash -e` en CI.
    const substitution = /[$`]/.test(commande);
    if (substitution || commande.includes('\n')) {
      console.error(
        `❌ prevol — l'étape « ${nom} » porte ${
          substitution
            ? 'une substitution de shell'
            : 'un `run:` de plusieurs lignes, que la CI joue sous `bash -e` et le shell local autrement,'
        } que ce script ne sait pas lire :\n` +
          `   ${run}\n` +
          `   Une seule substitution est tolérée (${SUBSTITUTION_TOLEREE}), et une seule ligne. ` +
          'Ajoute la forme ici plutôt que de la deviner.'
      );
      process.exit(1);
    }
    jouees.push({ nom, commande });
  }
  // 🔑 LE REFUS QUI MANQUAIT. Zéro étape jouable n'est pas un dépôt sain : c'est une dérivation
  // qui n'a rien compris à son fichier. Se taire ici, c'est enchaîner sur « ✅ PRÉ-VOL VERT »
  // après n'avoir mesuré que les quatre rendus locaux.
  if (jouees.length === 0) {
    console.error(
      `❌ prevol — \`${CI}\`, job \`${JOB_DE_LA_PORTE_A}\` : AUCUNE étape jouable dérivée ` +
        `(${etapes.length} étape(s) lue(s), ${ecartees.length} écartée(s)). Sans étape, ce ` +
        `pré-vol ne mesure rien, et son vert se lirait « la porte A ne découvrira rien ».`
    );
    process.exit(1);
  }
  return { jouees, ecartees };
}

/** Une étape, lancée seule : jamais de tube, le code de sortie est celui de la commande. */
function lancer(e: Etape): boolean {
  const debut = Date.now();
  process.stdout.write(`\n──▶ ${e.nom}\n    ${e.commande}\n`);
  const r = spawnSync(e.commande, { shell: true, stdio: 'inherit' });
  const secondes = ((Date.now() - debut) / 1000).toFixed(1);
  const ok = r.status === 0;
  process.stdout.write(`    ${ok ? '✅' : '❌'} ${e.nom} — ${secondes}s\n`);
  return ok;
}

/** Les vues qui portent un RETOUR CHARIOT, lu comme un OCTET (0x0d) et jamais comme un affichage. */
export function retoursChariot(vues: string[] = VUES): string[] {
  return vues.filter((f) => existsSync(f) && readFileSync(f).includes(0x0d));
}

// ── la course ────────────────────────────────────────────────────────────────

const APPELE_DIRECTEMENT = /prevol\.ts$/.test(process.argv[1] ?? '');

/** La course. Asynchrone parce que la lecture de `ci.yml` l'est ; une levée imprévue sort en 1. */
async function courir(): Promise<void> {
  if (!existsSync(CI)) {
    console.error(`❌ prevol — \`${CI}\` est absent : le pré-vol n'a pas de source d'étapes.`);
    process.exit(1);
  }
  const lecture = await etapesDeLaPorteA(readFileSync(CI, 'utf8'));

  const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = paquet.scripts ?? {};
  // `--rapide` (`pnpm pre-gate`, GOV-101) : les étapes lentes sont ÉCARTÉES ET NOMMÉES, comme
  // toute étape non jouée ; `red-first` est simulé contre `origin/main`.
  const partage = process.argv.includes('--rapide') ? etapesRapides(lecture.jouees, scripts) : null;
  const jouees = partage === null ? lecture.jouees : [...partage.rapides, RED_FIRST_SIMULE];
  const ecartees = [...lecture.ecartees, ...(partage?.lentes ?? [])];
  const toutes = [...RENDUS, ...jouees];
  const suivis = fichiersSuivisOuRefus('prevol');
  const lire = (chemin: string): string => readFileSync(chemin, 'utf8');
  // Le chemin de CE fichier, DÉRIVÉ de son module et non tapé : le script ne se prescrit pas à
  // lui-même, et un `scripts/prevol.ts` en dur ici mentirait le jour où il déménage.
  const soiMeme = relative(process.cwd(), fileURLToPath(import.meta.url))
    .split(sep)
    .join('/');
  const balayage = balayer(suivis, lire, Object.keys(scripts), soiMeme);
  const etapesDeLaSuite = etapesQuiLancentLaSuite(jouees, scriptsQuiLancentLaSuite(scripts));
  const banc = fichiersDeBanc(suivis, lire);
  const demon = demonDockerJoignable();

  const direLeBanc = (): void => {
    if (etapesDeLaSuite.length === 0 || banc.length === 0) return;
    if (demon) {
      console.log(
        `\n✅ démon Docker joignable — les ${banc.length} fichier(s) de banc mesureront vraiment.`
      );
      return;
    }
    console.log(
      `\n⚠️  démon Docker INJOIGNABLE. ${etapesDeLaSuite.length} étape(s) lancent la suite ` +
        `(${etapesDeLaSuite.map((e) => e.nom).join(', ')}), et ${banc.length} fichier(s) y exigent ` +
        `une base réelle (${banc.join(', ')}). Leur rouge NE DIRA RIEN de ton code — il dira qu'il ` +
        'manque un banc. Démarre le démon si tu veux mesurer, sinon lis le rouge en les écartant.'
    );
  };

  if (process.argv.includes('--liste')) {
    console.log(
      `prevol — ${toutes.length} étape(s), dont ${RENDUS.length} locale(s) et ${jouees.length} de \`gate-a\` :`
    );
    for (const [i, e] of toutes.entries())
      console.log(`  ${String(i + 1).padStart(3)}. ${e.nom}  —  ${e.commande}`);
    console.log(`\n${ecartees.length} étape(s) de \`gate-a\` NON jouées :`);
    for (const e of ecartees) console.log(`  · ${e.nom} — ${e.motif}`);
    console.log(`\nbalayage des porteurs de \`pnpm ${NOM_DU_SCRIPT}\` (REQ-GOV-013) :`);
    console.log(`  ${balayage.resume}`);
    for (const f of balayage.fautes) console.log(`  ❌ ${f}`);
    direLeBanc();
    process.exit(0);
  }

  const rouges: string[] = [];
  for (const e of RENDUS) if (!lancer(e)) rouges.push(e.nom);

  const crlf = retoursChariot();
  if (crlf.length > 0) {
    rouges.push('Retours chariot dans les vues rendues');
    console.error(
      `\n❌ prevol — retour(s) chariot dans une vue qui vient d'être rendue : ${crlf.join(', ')}.\n` +
        `   Une garde qui lit cette vue sortira en \`[source_illisible]\` et nommera la mauvaise cause.`
    );
  } else {
    console.log(`\n✅ aucune des ${VUES.length} vues rendues ne porte de retour chariot.`);
  }

  console.log(`\n──▶ Balayage des porteurs de \`pnpm ${NOM_DU_SCRIPT}\` (REQ-GOV-013)`);
  console.log(`    ${balayage.resume}`);
  if (balayage.fautes.length === 0) {
    console.log(
      `    ✅ les ${balayage.porteurs.length} fichiers qui la nomment — dont ${balayage.prescripteurs.length} prescripteurs — nomment une commande que \`package.json\` déclare.`
    );
  } else {
    rouges.push('Balayage des porteurs');
    for (const f of balayage.fautes) console.error(`    ❌ ${f}`);
  }

  direLeBanc();

  for (const e of jouees) if (!lancer(e)) rouges.push(e.nom);

  console.log(`\n${'─'.repeat(78)}`);
  console.log(
    `prévol — ${toutes.length} étape(s) jouée(s), ${ecartees.length} écartée(s) et nommée(s) :`
  );
  for (const e of ecartees) console.log(`   · ${e.nom} — ${e.motif}`);
  console.log(`\nbalayage : ${balayage.resume}`);
  if (rouges.length === 0) {
    console.log(
      partage === null
        ? '\n✅ PRÉ-VOL VERT — la porte A ne devrait rien découvrir.'
        : `\n✅ PRÉ-CONTRÔLE RAPIDE VERT — les étapes rapides de la porte A passent. Les ` +
            `${partage.lentes.length} étape(s) lentes nommées ci-dessus n'ont PAS tourné : ce vert ` +
            'ne dit rien de la suite de tests ni de la mutation.'
    );
    process.exit(0);
  }
  console.error(`\n❌ PRÉ-VOL ROUGE — ${rouges.length} étape(s) :`);
  for (const r of rouges) {
    console.error(`   ❌ ${r}`);
    const cause = causeProbable(r, etapesDeLaSuite, demon, banc);
    if (cause !== null) console.error(`      ${cause}`);
  }
  process.exit(1);
}

if (APPELE_DIRECTEMENT) void courir();
