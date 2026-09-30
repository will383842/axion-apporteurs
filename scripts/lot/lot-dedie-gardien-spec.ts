/**
 * LE LOT DÉDIÉ DU GARDIEN-SPEC — GOV-116 (REQ-GOV-010, `partners/ADR-0028`).
 *
 * `docs/CONVENTIONS.md` §8 réserve `docs/DECISIONS.md`, `docs/GLOSSAIRE.md` et `docs/PRESEANCE.md`
 * au `gardien-spec`, « lot dédié avec `--settings` surchargé ». Ce lot n'existait nulle part. Et un
 * fichier passé par `claude --settings` S'AJOUTE aux réglages : il ne lève pas un `deny` de
 * `.claude/settings.json`. Surcharger ne suffit donc pas ; il faut ÉCARTER les réglages du projet
 * (`--setting-sources user`) et porter, dans le fichier du lot, TOUT ce que le projet interdit, sauf
 * les trois fichiers du lot, et ses hooks.
 *
 * Ce fichier ne se tape pas : il se DÉRIVE de `.claude/settings.json` (RM-01), par `--rendre`, et
 * `--verifier` rougit sur la moindre dérive. Qui lance le lot : Williams SEUL, depuis la racine du
 * dépôt (`COMMANDE_DU_LOT`). Aucun agent ne le lance pour lui, aucune session ne se le délègue.
 *
 * USAGE : pnpm lot:gardien-spec              imprime la procédure exacte
 *         pnpm lot:gardien-spec --rendre     écrit config/lot-dedie-gardien-spec.settings.json
 *         pnpm lot:gardien-spec:verifier     rougit si le fichier dérive, ou si une session
 *                                            ordinaire n'est PAS bloquée sur les trois fichiers
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const CHEMIN_REGLAGES_DU_PROJET = '.claude/settings.json';
export const CHEMIN_REGLAGES_DU_LOT = 'config/lot-dedie-gardien-spec.settings.json';

/** Les trois fichiers que le lot ouvre, et eux seuls (`docs/CONVENTIONS.md` §8). */
export const FICHIERS_DU_LOT = [
  'docs/DECISIONS.md',
  'docs/GLOSSAIRE.md',
  'docs/PRESEANCE.md',
] as const;

/** Les règles d'écriture d'un fichier : les deux outils qui écrivent un fichier existant ou neuf. */
export const reglesDEcriture = (f: string): string[] => [`Write(${f})`, `Edit(${f})`];

/** Les six règles que le lot ouvre ; une session ordinaire les porte TOUTES en `deny`. */
export const REGLES_DU_LOT: readonly string[] = FICHIERS_DU_LOT.flatMap(reglesDEcriture);

/** La commande exacte, lancée par Williams SEUL, depuis la racine du dépôt. */
export const COMMANDE_DU_LOT = `claude --setting-sources user --settings ${CHEMIN_REGLAGES_DU_LOT}`;

/**
 * LE CONFINEMENT EST MÉCANIQUE, PAS UNE LISTE (lentille securite sur #262, 2026-09-30).
 * `--setting-sources user` charge aussi `~/.claude/settings.json` : son `defaultMode` (« auto »
 * chez Williams) et ses `allow`, qui S'AJOUTENT à ceux du lot. Un `deny` ne les borne que motif par
 * motif, et `pnpm *`, `npx tsx*`, `node scripts/*` ou `docker compose*` écrivent n'importe quel
 * fichier. Le lot fixe donc son mode, n'autorise sans demander que la LECTURE, refuse les
 * exécuteurs, et un hook `PreToolUse` juge chaque écriture et chaque commande : ce qui n'est ni
 * l'un des trois fichiers ni une commande de la liste est refusé, quelle que soit la règle
 * héritée.
 */
export const MODE_DU_LOT = 'default';

/** Ce que le lot autorise sans demander, en plus des six règles : lire, rien d'autre. */
export const LECTURES_DU_LOT: readonly string[] = [
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
  'Bash(git show*)',
  'Bash(gh pr view*)',
  'Bash(gh pr checks*)',
  'Bash(gh pr diff*)',
  'Bash(gh run view*)',
];

/** Les exécuteurs et les écritures détournées, refusés en plus des interdictions du projet. */
export const DENY_DU_LOT: readonly string[] = [
  'Bash(node:*)',
  'Bash(npx:*)',
  'Bash(pnpm:*)',
  'Bash(npm:*)',
  'Bash(tsx:*)',
  'Bash(docker:*)',
  'Bash(python:*)',
  'Bash(python3:*)',
  'Bash(gh api:*)',
  'Bash(gh pr merge:*)',
  'Bash(git merge:*)',
  'Bash(git rebase:*)',
  'Bash(git reset:*)',
  'Bash(git checkout:*)',
  'Bash(git restore:*)',
];

/** Le hook du lot : lancé par node (types effacés), sans dépendance. */
export const COMMANDE_DE_LA_GARDE =
  'node --no-warnings scripts/lot/lot-dedie-gardien-spec.ts --garde';
export const OUTILS_D_ECRITURE = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] as const;
const MATCHER_DE_LA_GARDE = [...OUTILS_D_ECRITURE, 'Bash'].join('|');

/** Toute commande portant l'un de ces caractères enchaîne, redirige ou substitue : refusée. */
const METACARACTERES = /[;&|<>`$\n\r\\]/;
const BRANCHE_T = 't\\/[A-Za-z0-9._-]+';

/** Les seules commandes Bash que la garde laisse passer. Tout le reste est refusé. */
export const COMMANDES_PERMISES: readonly RegExp[] = [
  /^git (status|diff|log|show|fetch)( |$)/,
  /^git add( docs\/(DECISIONS|GLOSSAIRE|PRESEANCE)\.md)+$/,
  /^git commit -m "[^"]+"$/,
  new RegExp(`^git push( -u)? origin ${BRANCHE_T}$`),
  new RegExp(`^git switch -c ${BRANCHE_T}$`),
  /^gh pr (view|checks|diff|create)( |$)/,
  /^gh run (view|list)( |$)/,
];

/** Une option qui fait écrire une commande de lecture (`git diff --output=…`) : refusée. */
const OPTION_QUI_ECRIT = /(^| )(--output|-o)(=| |$)/;

/** `null` si la commande passe ; sinon, la raison du refus. */
export function jugerCommande(commande: string): string | null {
  const c = commande.trim();
  if (METACARACTERES.test(c)) {
    return `commande refusée dans le lot : elle enchaîne, redirige ou substitue (« ${c} »).`;
  }
  if (OPTION_QUI_ECRIT.test(c)) {
    return `commande refusée dans le lot : l'option --output écrit un fichier (« ${c} »).`;
  }
  if (!COMMANDES_PERMISES.some((m) => m.test(c))) {
    return (
      `commande refusée dans le lot : hors de la liste (lire, git add des trois fichiers, ` +
      `commit, push sur t/*, gh en lecture). Fais-la dans une session ordinaire (« ${c} »).`
    );
  }
  return null;
}

function cheminReel(absolu: string): string | null {
  try {
    return realpathSync.native(absolu);
  } catch {
    try {
      return join(realpathSync.native(dirname(absolu)), basename(absolu));
    } catch {
      return null;
    }
  }
}

/**
 * `null` si l'écriture vise l'un des trois fichiers ; sinon, la raison du refus. Le chemin est
 * RÉSOLU (`..`, chemin absolu) et comparé tel quel, casse comprise : `DOCS/Decisions.md` est
 * refusé même là où le disque l'accepterait. Puis le chemin RÉEL (lien symbolique suivi) doit être
 * celui du fichier : un lien nommé comme un fichier du lot et pointant ailleurs est refusé.
 * Seule la LETTRE DE LECTEUR Windows est normalisée (`c:` et `C:` désignent le même disque, et
 * l'outil comme le hook peuvent l'écrire différemment) ; le reste du chemin garde sa casse.
 */
const lecteur = (p: string): string => p.replace(/^[a-z]:/, (m) => m.toUpperCase());

export function jugerEcriture(chemin: string, racine: string): string | null {
  const vise = lecteur(resolve(racine, chemin));
  const reelVise = cheminReel(vise);
  for (const f of FICHIERS_DU_LOT) {
    const attendu = lecteur(resolve(racine, f));
    if (vise === attendu && reelVise !== null && reelVise === cheminReel(attendu)) return null;
  }
  return `écriture refusée dans le lot : seuls ${FICHIERS_DU_LOT.join(', ')} s'écrivent (« ${chemin} »).`;
}

type EntreeDeHook = {
  tool_name?: string;
  tool_input?: { command?: string; file_path?: string; notebook_path?: string };
  cwd?: string;
};

/** Le jugement du hook sur une entrée : `null` = passe, sinon la raison du refus. */
export function jugerOutil(entree: EntreeDeHook, racine: string): string | null {
  const outil = entree.tool_name ?? '';
  if ((OUTILS_D_ECRITURE as readonly string[]).includes(outil)) {
    const chemin = entree.tool_input?.file_path ?? entree.tool_input?.notebook_path;
    if (typeof chemin !== 'string') return `écriture refusée dans le lot : ${outil} sans chemin.`;
    return jugerEcriture(chemin, racine);
  }
  if (outil === 'Bash') return jugerCommande(entree.tool_input?.command ?? '');
  return null;
}

export type Reglages = {
  permissions?: { allow?: string[]; deny?: string[]; [k: string]: unknown };
  hooks?: unknown;
  env?: unknown;
  [k: string]: unknown;
};

type Crochet = { matcher?: string; hooks?: unknown[] };

/**
 * Les réglages du lot, DÉRIVÉS de ceux du projet : les interdictions du projet moins les six règles
 * du lot, plus les exécuteurs ; en `allow`, la lecture et les six règles SEULEMENT (les `allow` du
 * projet n'y passent pas) ; le mode `default` ; les hooks du projet plus la garde du lot ; le même
 * environnement. Tout le reste demande à Williams, et la garde refuse ce qui sort du lot.
 */
export function reglagesDuLot(projet: Reglages): Reglages {
  const deny = projet.permissions?.deny ?? [];
  const hooks = (projet.hooks ?? {}) as Record<string, Crochet[]>;
  return {
    $schema: projet['$schema'],
    _commentaire: [
      `RENDU par scripts/lot/lot-dedie-gardien-spec.ts depuis ${CHEMIN_REGLAGES_DU_PROJET} — ne pas éditer.`,
      `Lot dédié du gardien-spec (GOV-116, partners/ADR-0028) : ouvre ${FICHIERS_DU_LOT.join(', ')} et eux seuls.`,
      `Lancé par Williams SEUL, depuis la racine du dépôt : ${COMMANDE_DU_LOT}`,
    ],
    permissions: {
      defaultMode: MODE_DU_LOT,
      allow: [...LECTURES_DU_LOT, ...REGLES_DU_LOT],
      deny: [...deny.filter((r) => !REGLES_DU_LOT.includes(r)), ...DENY_DU_LOT],
    },
    hooks: {
      ...hooks,
      PreToolUse: [
        ...(hooks.PreToolUse ?? []),
        {
          matcher: MATCHER_DE_LA_GARDE,
          hooks: [{ type: 'command', command: COMMANDE_DE_LA_GARDE }],
        },
      ],
    },
    env: projet.env,
  };
}

/** Les règles du lot qu'une session ORDINAIRE n'a pas en `deny` : chacune est une porte ouverte. */
export function reglesNonInterditesAuProjet(projet: Reglages): string[] {
  const deny = projet.permissions?.deny ?? [];
  return REGLES_DU_LOT.filter((r) => !deny.includes(r));
}

export const rendre = (projet: Reglages): string =>
  JSON.stringify(reglagesDuLot(projet), null, 2) + '\n';

function lire(chemin: string): Reglages {
  return JSON.parse(readFileSync(chemin, 'utf8')) as Reglages;
}

export function verifier(racine = '.'): string[] {
  const fautes: string[] = [];
  const projet = lire(`${racine}/${CHEMIN_REGLAGES_DU_PROJET}`);
  let surDisque = '';
  try {
    surDisque = readFileSync(`${racine}/${CHEMIN_REGLAGES_DU_LOT}`, 'utf8');
  } catch {
    fautes.push(
      `[reglages_du_lot_absents] ${CHEMIN_REGLAGES_DU_LOT} est illisible : lance --rendre.`
    );
  }
  if (surDisque && surDisque !== rendre(projet)) {
    fautes.push(
      `[reglages_du_lot_divergents] ${CHEMIN_REGLAGES_DU_LOT} n'est pas le rendu de ` +
        `${CHEMIN_REGLAGES_DU_PROJET} : il ouvrirait ou fermerait autre chose que les trois fichiers du lot.`
    );
  }
  for (const r of reglesNonInterditesAuProjet(projet)) {
    fautes.push(
      `[session_ordinaire_non_bloquee] ${CHEMIN_REGLAGES_DU_PROJET} ne porte pas « ${r} » en deny : ` +
        'une session ordinaire peut écrire ce fichier réservé au lot. Williams ajoute la règle lui-même.'
    );
  }
  return fautes;
}

const LANCE = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('scripts/lot/lot-dedie-gardien-spec.ts');
if (LANCE) {
  if (process.argv.includes('--garde')) {
    // Hook PreToolUse : code 0 = passe ; code 2 + message sur stderr = refusé. Une entrée
    // illisible est refusée : une absence n'est pas une autorisation.
    let raison: string | null;
    try {
      const entree = JSON.parse(readFileSync(0, 'utf8')) as EntreeDeHook;
      raison = jugerOutil(entree, process.env.CLAUDE_PROJECT_DIR ?? entree.cwd ?? process.cwd());
    } catch {
      raison = 'entrée du hook illisible : refusé par la garde du lot.';
    }
    if (raison !== null) {
      console.error(raison);
      process.exit(2);
    }
  } else if (process.argv.includes('--rendre')) {
    writeFileSync(CHEMIN_REGLAGES_DU_LOT, rendre(lire(CHEMIN_REGLAGES_DU_PROJET)));
    console.log(`✅ ${CHEMIN_REGLAGES_DU_LOT} rendu depuis ${CHEMIN_REGLAGES_DU_PROJET}.`);
  } else if (process.argv.includes('--verifier')) {
    const fautes = verifier();
    if (fautes.length > 0) {
      console.error(
        `❌ lot:gardien-spec — ${fautes.length} faute(s) :\n   ${fautes.join('\n   ')}`
      );
      process.exit(1);
    }
    console.log(
      `✅ lot:gardien-spec — le lot ouvre ${FICHIERS_DU_LOT.length} fichiers et eux seuls ; ` +
        `une session ordinaire porte les ${REGLES_DU_LOT.length} règles en deny.`
    );
  } else {
    console.log(
      [
        'LOT DÉDIÉ DU GARDIEN-SPEC — procédure (GOV-116, partners/ADR-0028).',
        '  Qui : Williams SEUL. Aucun agent ne le lance pour lui, aucune session ne se le délègue.',
        '  Où : à la racine du dépôt, sur une branche t/<slug> dédiée au lot.',
        `  Commande : ${COMMANDE_DU_LOT}`,
        `  Ouvre : ${FICHIERS_DU_LOT.join(', ')} — et rien d'autre.`,
        '  Écarte : les réglages du projet et locaux (leurs deny sont recopiés dans le fichier du lot).',
        '  Trace : noter la date, la branche et le sha de départ dans la PR du lot.',
      ].join('\n')
    );
  }
}
