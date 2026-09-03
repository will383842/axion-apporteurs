/**
 * gov-depot.ts — la garde `gov:depot-visibilite` : ce que la forge dit du dépôt, confronté à ce
 * que le dépôt a décidé. (REQ-GOV-014, acceptation de GOV-012, `partners/ADR-0006`)
 *
 * USAGE : npx tsx scripts/gates/gov-depot.ts              contrôle réel (appelle `gh`)
 *         npx tsx scripts/gates/gov-depot.ts --hors-ligne  sans la forge → verdict INDÉTERMINÉ
 *         npx tsx scripts/gates/gov-depot.ts --prove       un témoin par famille, contre-témoins verts
 *
 * TROIS CODES DE SORTIE, ET C'EST LE CŒUR DE CETTE GARDE.
 *   0  conforme — tout ce qui devait être lu l'a été, et concorde ;
 *   1  défaut CONSTATÉ — la forge a répondu, et sa réponse contredit une décision du dépôt ;
 *   2  INDÉTERMINÉ — la garde n'a pas pu lire ce qu'elle juge.
 *
 * Pourquoi 2 existe. La protection de branche n'est lisible que par un jeton qui en a le droit, et
 * la matrice d'autonomie porte une règle de refus qui la vise :
 * `Bash(gh api * /branches/main/protection*)` dans `.claude/settings.json` — sur la FORME de cette
 * règle, voir la section « Attaque » de la PR de GOV-012 : écrite avec une espace devant
 * `/branches`, elle ne rencontre pas la forme que `gh` impose. Un poste d'agent ne peut donc pas
 * tenir pour acquis qu'il obtiendra cette réponse. Une
 * garde qui rendrait vert dans ce cas serait pire que pas de garde du tout : elle ferait croire à
 * une vérification qui n'a pas eu lieu — exactement le défaut d'une gate Lighthouse d'axionia, qui
 * a mesuré le runner au lieu du site pendant des mois sans que sa couleur ne change jamais. Le
 * verdict 2 dit ce qui manque et QUI peut le lever (A04, ou la CI avec un jeton qui a le droit).
 *
 * CE QUE LA GARDE NE RECOPIE PAS (RM-01). Ni la visibilité attendue, ni le nom du check requis ne
 * sont écrits ici :
 *   — la visibilité se LIT dans la ligne `W13` de `docs/DECISIONS.md` ;
 *   — le nom du check se LIT dans les jobs de `.github/workflows/ci.yml`, parce que c'est ce nom-là
 *     que GitHub publiera. L'acceptation de GOV-000 dit pourquoi il doit correspondre au caractère
 *     près : « sinon GitHub reste en "Expected — Waiting for status", `gh pr checks --watch`
 *     n'aboutit jamais et la file se bloque dès la PR témoin ».
 * Renverser l'une ou l'autre de ces sources renverse l'attente de la garde ; c'est ce que
 * `tests/unit/gouvernance/tout-check-est-cable.spec.ts` exerce.
 *
 * CE QUI JUGE LES WORKFLOWS. Rien de neuf : `jugerPush` de `scripts/gates/git-push-sur.js`, écrit
 * pour le hook `PreToolUse` et déjà prouvé par `pnpm gov:autonomie:prove`. Un second analyseur en
 * ferait deux qui divergeraient (RM-01/RM-07) ; ici, il gagne un deuxième appelant, et les deux
 * portes — le poste de l'agent et le runner de la forge — sont gardées par la même lecture.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const CHEMIN_DECISIONS = 'docs/DECISIONS.md';
const CHEMIN_CI = '.github/workflows/ci.yml';
const DOSSIER_WORKFLOWS = '.github/workflows';

/** Les actions tierces dont le métier EST de pousser à la place du runner. */
const ACTIONS_QUI_POUSSENT = ['ad-m/github-push-action', 'stefanzweifel/git-auto-commit-action'];

export type Fichier = { chemin: string; contenu: string };
export type Gravite = 'rouge' | 'indetermine';
export type Faute = { famille: string; gravite: Gravite; message: string };

export type Protection = {
  required_status_checks?: { strict?: boolean; contexts?: string[]; checks?: { context: string }[] } | null;
  required_linear_history?: { enabled?: boolean };
  allow_force_pushes?: { enabled?: boolean };
  allow_deletions?: { enabled?: boolean };
};

export type Vue = {
  /** Le texte de `docs/DECISIONS.md` — la garde y lit W13. */
  decisions: string;
  /** Le texte de `.github/workflows/ci.yml` — la garde y lit le nom du check produit sur une PR. */
  ci: string;
  /** Tous les workflows du dépôt, jugés par `jugerPush`. */
  workflows: Fichier[];
  /** Ce que `gh repo view --json visibility` a répondu, ou `null` si on n'a pas pu lire. */
  visibilite: string | null;
  /**
   * Ce que `gh api …/branches/main/protection` a répondu.
   *   un objet          la protection existe et a été lue ;
   *   `'non_protegee'`  la forge a répondu « Branch not protected » — c'est un CONSTAT, donc rouge ;
   *   `null`            personne n'a répondu (droit, réseau, matrice) — c'est un aveu, donc 2.
   * Confondre les deux derniers cas ferait passer une branche DÉPROTÉGÉE pour un contrôle non joué,
   * et c'est précisément le résultat que produirait l'attaque décrite dans la PR de GOV-012.
   */
  protection: Protection | 'non_protegee' | null;
};

export const FAMILLES = [
  'source_illisible',
  'visibilite_inattendue',
  'check_requis_absent',
  'check_jamais_produit',
  'historique_non_lineaire',
  'ecrasement_autorise',
  'workflow_pousse_sur_main',
  'branche_non_protegee',
  'protection_non_lisible',
] as const;

// ── ce que le dépôt a décidé ─────────────────────────────────────────────────

/**
 * La visibilité que W13 a tranchée, LUE dans `docs/DECISIONS.md`.
 *
 * Le jeton est cherché en capitales : la même ligne contient « **Public ne signifie pas tout
 * publier** » et « publiés », qui ne sont pas des décisions. `PUBLIC` en capitales est la valeur,
 * et c'est aussi la forme que rend `gh repo view --json visibility`.
 */
export function visibiliteDecidee(decisions: string): string | null {
  const ligne = decisions.split('\n').find((l) => /^\|\s*\*\*W13\*\*/.test(l.trim()));
  if (ligne === undefined) return null;
  const jetons = [...new Set(ligne.match(/\b(PUBLIC|PRIVATE|PRIVE|PRIVÉ|INTERNAL)\b/g) ?? [])];
  if (jetons.length !== 1) return null;
  const j = jetons[0] as string;
  return j === 'PRIVE' || j === 'PRIVÉ' ? 'PRIVATE' : j;
}

/**
 * Les noms de checks qu'un workflow publie SUR UNE PULL REQUEST.
 *
 * GitHub nomme le check d'après le `name:` du job s'il existe, sinon d'après son identifiant. Le
 * découpage est volontairement grossier — deux niveaux d'indentation, pas d'analyseur YAML : la
 * seule chose qu'on ne peut pas se permettre est de rendre un nom FAUX, et une clé mal lue rend
 * une liste qui ne contient pas `gate-a`, donc un rouge, jamais un vert silencieux.
 */
export function checksProduits(yml: string): string[] {
  const lignes = yml.split(/\r?\n/);

  // 1. Le déclencheur. `pull_request_target:` n'est PAS `pull_request:` — d'où le `\s*:` collé.
  const iOn = lignes.findIndex((l) => /^on:/.test(l));
  if (iOn < 0) return [];
  let finOn = lignes.length;
  for (let i = iOn + 1; i < lignes.length; i++) {
    if (/^[A-Za-z_]/.test(lignes[i] as string)) {
      finOn = i;
      break;
    }
  }
  const bloc = lignes.slice(iOn, finOn).join('\n');
  if (!/(^|[\s{,])pull_request\s*:/m.test(bloc)) return [];

  // 2. Les jobs.
  const iJobs = lignes.findIndex((l) => /^jobs:\s*$/.test(l));
  if (iJobs < 0) return [];
  const noms: string[] = [];
  let courant: string | null = null;
  for (let i = iJobs + 1; i < lignes.length; i++) {
    const l = lignes[i] as string;
    if (/^[A-Za-z_]/.test(l)) break; // clé de premier niveau : on est sorti de `jobs:`
    const idJob = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (idJob) {
      courant = idJob[1] as string;
      noms.push(courant);
      continue;
    }
    const nom = /^ {4}name:\s*(.+?)\s*$/.exec(l);
    if (nom && courant !== null) {
      // Le `name:` du job REMPLACE l'identifiant dans le nom du check.
      noms[noms.length - 1] = (nom[1] as string).replace(/^["']|["']$/g, '');
      courant = null;
    }
  }
  return noms;
}

// ── ce que les workflows font ────────────────────────────────────────────────

type Analyse = { jugerPush: (ligne: string) => { refuse: boolean; motif: string | null } };
const analyse = require_('./git-push-sur.js') as Analyse;

/**
 * Les lignes de shell d'un workflow : chaque `run:`, en ligne comme en bloc.
 *
 * Le bloc est délimité par l'indentation de la clé `run:` elle-même, pas par celle du tiret : un
 * `- run: |` a son contenu indenté plus loin que `run:`, et la clé `env:` de l'étape suivante,
 * elle, revient à la colonne du tiret. Prendre la colonne du tiret avalerait donc l'étape suivante.
 */
function lignesDeCommande(contenu: string): string[] {
  const lignes = contenu.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i] as string;
    const col = l.indexOf('run:');
    if (col < 0 || !/^[\s-]*$/.test(l.slice(0, col))) continue;
    const reste = l.slice(col + 4).trim();
    if (/^[|>][-+0-9]*$/.test(reste)) {
      for (let j = i + 1; j < lignes.length; j++) {
        const suite = lignes[j] as string;
        if (suite.trim() === '') continue;
        if (suite.length - suite.trimStart().length <= col) break;
        out.push(suite.trim());
      }
    } else if (reste.length > 0) {
      out.push(reste.replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}

export function analyserWorkflows(fichiers: Fichier[]): Faute[];
export function analyserWorkflows(
  fichiers: Fichier[],
  options: { rendreCommandes: true }
): { commandes: string[]; fautes: Faute[] };
export function analyserWorkflows(
  fichiers: Fichier[],
  options?: { rendreCommandes?: boolean }
): Faute[] | { commandes: string[]; fautes: Faute[] } {
  const fautes: Faute[] = [];
  const commandes: string[] = [];
  const rouge = (message: string): void => {
    fautes.push({ famille: 'workflow_pousse_sur_main', gravite: 'rouge', message });
  };

  for (const f of fichiers) {
    for (const action of ACTIONS_QUI_POUSSENT) {
      if (f.contenu.includes(action)) {
        rouge(
          `${f.chemin} — l'action \`${action}\` pousse à la place du runner. La branche principale ` +
            `ne reçoit que des fusions de PR (REQ-GOV-014, partners/ADR-0006 §4) ; une action qui ` +
            `pousse contourne à la fois la protection de branche et la matrice d'autonomie.`
        );
      }
    }

    for (const commande of lignesDeCommande(f.contenu)) {
      commandes.push(commande);

      // Une destination portée par une expression ne peut pas être lue ici — et une garde qui ne
      // peut pas lire ne dit pas « vert » (c'est le principe du code de sortie 2, appliqué ligne
      // à ligne). `${{ github.ref }}` vaut `main` sur un `push` vers la branche principale.
      if (/(^|\s)git\s+(-C\s+\S+\s+)?push\b/.test(commande) && commande.includes('${{')) {
        rouge(
          `${f.chemin} — \`${commande}\` : la destination du push est une EXPRESSION, illisible ` +
            `à la revue. Écris la référence en clair, ou ne pousse pas depuis un workflow.`
        );
        continue;
      }

      const verdict = analyse.jugerPush(commande);
      if (verdict.refuse) rouge(`${f.chemin} — \`${commande}\` : ${verdict.motif}`);
    }
  }

  return options?.rendreCommandes === true ? { commandes, fautes } : fautes;
}

// ── le contrôle ──────────────────────────────────────────────────────────────

export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const rouge = (famille: string, message: string): void => {
    fautes.push({ famille, gravite: 'rouge', message });
  };
  const indetermine = (famille: string, message: string): void => {
    fautes.push({ famille, gravite: 'indetermine', message });
  };

  const attendue = visibiliteDecidee(vue.decisions);
  const produits = checksProduits(vue.ci);

  if (attendue === null) {
    rouge(
      'source_illisible',
      `${CHEMIN_DECISIONS} — la ligne \`W13\` ne porte pas UNE valeur de visibilité lisible ` +
        `(\`PUBLIC\` ou \`PRIVATE\` en capitales). La garde ne peut pas comparer le dépôt à une ` +
        `décision qu'elle ne sait plus lire : corrige la ligne, ne code pas la valeur ici (RM-01).`
    );
  }
  if (produits.length === 0) {
    rouge(
      'source_illisible',
      `${CHEMIN_CI} — aucun job déclenché sur \`pull_request\` : la garde ne sait pas quel nom de ` +
        `check exiger de la protection de \`main\`. Un check requis qui ne correspond à aucun job ` +
        `laisse la PR en « Expected — Waiting for status », indéfiniment.`
    );
  }

  if (vue.visibilite === null) {
    indetermine(
      'protection_non_lisible',
      `la visibilité du dépôt n'a pas été lue (\`gh repo view --json visibility\` indisponible). ` +
        `Non vérifiable ici : à jouer par A04, ou en CI avec un jeton qui le peut.`
    );
  } else if (attendue !== null && vue.visibilite !== attendue) {
    rouge(
      'visibilite_inattendue',
      `le dépôt est \`${vue.visibilite}\`, W13 l'a tranché \`${attendue}\` (${CHEMIN_DECISIONS}). ` +
        `La visibilité commande la règle de publication (REQ-GOV-031) : un passage en privé ne ` +
        `déclasse RIEN de ce qui a déjà été poussé (forks, caches, miroirs), et un passage en ` +
        `public expose tout l'historique d'un coup. Renverser W13 est une décision de Will, pas un ` +
        `réglage de la forge.`
    );
  }

  if (vue.protection === 'non_protegee') {
    rouge(
      'branche_non_protegee',
      `\`main\` N'EST PAS PROTÉGÉE : la forge répond « Branch not protected ». Aucun check n'est ` +
        `requis, l'historique linéaire n'est plus exigé, et une fusion peut passer sans gate. ` +
        `Ce n'est pas un contrôle non joué — c'est une réponse, et elle est mauvaise. Aucune fusion ` +
        `tant que la protection n'est pas rétablie (décision de Will, hors session d'agent).`
    );
  } else if (vue.protection === null) {
    indetermine(
      'protection_non_lisible',
      `la protection de \`main\` n'a pas été lue. La matrice d'autonomie porte une règle de refus qui ` +
        `vise \`gh api * /branches/main/protection*\` : depuis un poste d'agent, ce contrôle est ` +
        `NON VÉRIFIABLE — à jouer par A04 avant la première fusion d'une session, ou en CI avec un ` +
        `jeton qui a le droit de lire la protection. Ne pas conclure « conforme » ici.`
    );
  } else {
    const src = vue.protection.required_status_checks;
    const requis = [...new Set([...(src?.contexts ?? []), ...(src?.checks ?? []).map((c) => c.context)])];

    for (const attendu of produits) {
      if (!requis.includes(attendu)) {
        rouge(
          'check_requis_absent',
          `la protection de \`main\` n'exige pas le check \`${attendu}\`, que \`${CHEMIN_CI}\` ` +
            `produit sur chaque PR. Un job vert qui n'est pas requis ne bloque personne : la PR ` +
            `reste fusionnable pendant que la gate rougit.`
        );
      }
    }
    for (const r of requis) {
      if (!produits.includes(r)) {
        rouge(
          'check_jamais_produit',
          `la protection de \`main\` exige le check \`${r}\`, qu'AUCUN job de \`${CHEMIN_CI}\` ne ` +
            `produit sur une PR. GitHub l'affichera « Expected — Waiting for status » et ` +
            `\`gh pr checks --watch\` n'aboutira jamais : la file de fusion se bloque dès la PR ` +
            `suivante, sans message d'erreur.`
        );
      }
    }

    if (vue.protection.required_linear_history?.enabled !== true) {
      rouge(
        'historique_non_lineaire',
        `l'historique linéaire n'est plus exigé sur \`main\`. L'acceptation de GOV-012 le nomme ` +
          `(« squash + required_linear_history ») : sans lui, une fusion par confluence redevient ` +
          `possible et \`git revert <sha>\` d'un commit de tâche cesse d'être atomique ` +
          `(partners/ADR-0007).`
      );
    }
    if (vue.protection.allow_force_pushes?.enabled === true || vue.protection.allow_deletions?.enabled === true) {
      rouge(
        'ecrasement_autorise',
        `\`main\` accepte l'écrasement (\`allow_force_pushes\`) ou sa propre suppression ` +
          `(\`allow_deletions\`). C'est la porte que \`scripts/gates/git-push-sur.js\` ferme côté ` +
          `agent ; ouverte côté forge, elle rend la garde locale décorative (RM-09).`
      );
    }
  }

  fautes.push(...analyserWorkflows(vue.workflows));
  return fautes;
}

// ── la vue réelle, et la vue de fixture ──────────────────────────────────────

function lireWorkflows(): Fichier[] {
  if (!existsSync(DOSSIER_WORKFLOWS)) return [];
  return readdirSync(DOSSIER_WORKFLOWS)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ chemin: join(DOSSIER_WORKFLOWS, f), contenu: readFileSync(join(DOSSIER_WORKFLOWS, f), 'utf8') }));
}

/**
 * `gh`. Rend la sortie ET, en cas d'échec, ce que la forge a DIT.
 *
 * Avaler le message d'erreur transformerait « Branch not protected » — une réponse, donc un défaut
 * constaté — en « je n'ai pas pu lire », c'est-à-dire en indéterminé. La différence est tout l'objet
 * de cette garde.
 */
function gh(args: string[]): { sortie: string | null; erreur: string } {
  try {
    return { sortie: execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), erreur: '' };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return { sortie: null, erreur: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function lireVue(horsLigne: boolean): Vue {
  const depot = horsLigne ? { sortie: null, erreur: '' } : gh(['repo', 'view', '--json', 'visibility,nameWithOwner']);
  const nom = depot.sortie === null ? null : (JSON.parse(depot.sortie) as { nameWithOwner: string }).nameWithOwner;
  const brut =
    horsLigne || nom === null
      ? { sortie: null, erreur: '' }
      : gh(['api', `repos/${nom}/branches/main/protection`]);

  // « Branch not protected » est le message que GitHub rend sur une branche sans protection : la
  // question a reçu une réponse. Tout autre échec (droit refusé, réseau, matrice) n'en est pas une.
  const protection: Protection | 'non_protegee' | null =
    brut.sortie !== null
      ? (JSON.parse(brut.sortie) as Protection)
      : /Branch not protected/i.test(brut.erreur)
        ? 'non_protegee'
        : null;

  return {
    decisions: existsSync(CHEMIN_DECISIONS) ? readFileSync(CHEMIN_DECISIONS, 'utf8') : '',
    ci: existsSync(CHEMIN_CI) ? readFileSync(CHEMIN_CI, 'utf8') : '',
    workflows: lireWorkflows(),
    visibilite: depot.sortie === null ? null : (JSON.parse(depot.sortie) as { visibility: string }).visibility,
    protection,
  };
}

/**
 * La vue de référence des preuves — CONFORME par construction.
 *
 * Source: `gh repo view --json visibility` et `gh api repos/will383842/axion-apporteurs/branches/main/protection`,
 * lus le 2026-09-03 sur le dépôt réel (RM-03 : la forme des champs vient du producteur, pas d'une
 * invention — `contexts` et `checks[].context` coexistent dans la réponse de GitHub, et une garde
 * qui ne lirait que l'un des deux serait aveugle sur la moitié des dépôts).
 *
 * Les textes `decisions` et `ci` sont des EXTRAITS de fixture, pas les fichiers du dépôt : une
 * preuve qui lirait le disque verdirait ou rougirait au gré des fichiers présents ce jour-là.
 */
export const VUE_CONFORME: Vue = {
  decisions: '| **W13** ✅ | Dépôt et publication | Dépôt **`will383842/axion-apporteurs`, PUBLIC** | migration | −1 |\n',
  ci: ['name: Gate A', 'on:', '  pull_request:', 'jobs:', '  gate-a:', '    runs-on: ubuntu-latest', ''].join('\n'),
  workflows: [
    {
      chemin: '.github/workflows/ci.yml',
      contenu: ['jobs:', '  gate-a:', '    steps:', '      - run: pnpm gov:check', ''].join('\n'),
    },
  ],
  visibilite: 'PUBLIC',
  protection: {
    required_status_checks: { strict: true, contexts: ['gate-a'], checks: [{ context: 'gate-a' }] },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  },
};

// ── sortie ───────────────────────────────────────────────────────────────────

function rendre(fautes: Faute[], contexte: string): number {
  const rouges = fautes.filter((f) => f.gravite === 'rouge');
  const inconnus = fautes.filter((f) => f.gravite === 'indetermine');

  if (rouges.length > 0) {
    console.error(`❌ gov:depot-visibilite — ${rouges.length} défaut(s) constaté(s) :`);
    for (const f of rouges) console.error(`   [${f.famille}] ${f.message}`);
  }
  if (inconnus.length > 0) {
    console.error(`⚠️ INDÉTERMINÉ — ${inconnus.length} contrôle(s) NON VÉRIFIÉ(S) :`);
    for (const f of inconnus) console.error(`   [${f.famille}] ${f.message}`);
  }
  if (rouges.length > 0) return 1;
  if (inconnus.length > 0) {
    console.error(
      `   Verdict : NON VÉRIFIÉ. Ce n'est ni un vert ni un rouge — c'est l'aveu que la garde n'a ` +
        `pas pu lire sa cible. Voir docs/PROTOCOLE-FUSION.md, pas 0.`
    );
    return 2;
  }
  console.log(`✅ gov:depot-visibilite — ${contexte}`);
  return 0;
}

// ── mode --prove ─────────────────────────────────────────────────────────────

function prouver(): number {
  const base = controler(VUE_CONFORME);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'une vue DÉJÀ fautive (${base.length}) :`);
    base.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    return 1;
  }

  // Contre-témoins : ce que la garde doit LAISSER PASSER. Une garde qui refuse tout se prouve
  // avec n'importe quel témoin ; ce sont ces lignes-ci qui donnent sa valeur au reste.
  const LEGITIMES = [
    '      - run: pnpm install --frozen-lockfile',
    '      - run: echo "git push origin main"',
    '      - run: git push -u origin lot/L-1-03-integration',
    '      - run: gh pr merge 27 --squash --delete-branch',
    '      - run: git log --oneline origin/main',
  ];
  for (const etape of LEGITIMES) {
    const f = analyserWorkflows([{ chemin: 'temoin.yml', contenu: `jobs:\n  x:\n    steps:\n${etape}\n` }]);
    if (f.length > 0) {
      console.error(`❌ Faux positif : « ${etape.trim()} » est LÉGITIME et a été refusée.`);
      f.forEach((x) => console.error(`   ${x.message}`));
      return 1;
    }
  }

  const etape = (ligne: string): Fichier[] => [
    { chemin: '.github/workflows/temoin.yml', contenu: `jobs:\n  x:\n    steps:\n      - run: ${ligne}\n` },
  ];
  const p = (): Protection => structuredClone(VUE_CONFORME.protection as Protection);

  const TEMOINS: { famille: (typeof FAMILLES)[number]; vue: Vue }[] = [
    { famille: 'source_illisible', vue: { ...VUE_CONFORME, decisions: '| Id | Décision |\n' } },
    { famille: 'visibilite_inattendue', vue: { ...VUE_CONFORME, visibilite: 'PRIVATE' } },
    {
      famille: 'check_requis_absent',
      vue: { ...VUE_CONFORME, protection: { ...p(), required_status_checks: { contexts: [] } } },
    },
    {
      famille: 'check_jamais_produit',
      vue: { ...VUE_CONFORME, protection: { ...p(), required_status_checks: { contexts: ['gate-a', 'gate-fantome'] } } },
    },
    {
      famille: 'historique_non_lineaire',
      vue: { ...VUE_CONFORME, protection: { ...p(), required_linear_history: { enabled: false } } },
    },
    {
      famille: 'ecrasement_autorise',
      vue: { ...VUE_CONFORME, protection: { ...p(), allow_force_pushes: { enabled: true } } },
    },
    {
      // Le témoin qui compte : la forme que les six règles `deny` ne voient pas, portée cette
      // fois par un runner, où aucune matrice d'autonomie ne s'applique.
      famille: 'workflow_pousse_sur_main',
      vue: { ...VUE_CONFORME, workflows: etape('git push origin lot/L-9-99-integration:main --force') },
    },
    {
      // Le témoin de l'attaque : la protection SUPPRIMÉE ne doit pas ressembler à une protection
      // non lue. `gh api -X DELETE …/branches/main/protection` n'est refusé par aucune règle de la
      // matrice (la règle qui le vise porte une espace que la commande réelle n'a pas) : si ce cas
      // rendait 2, l'effacement passerait pour un contrôle non joué.
      famille: 'branche_non_protegee',
      vue: { ...VUE_CONFORME, protection: 'non_protegee' },
    },
    { famille: 'protection_non_lisible', vue: { ...VUE_CONFORME, protection: null } },
  ];

  for (const t of TEMOINS) {
    const f = controler(t.vue);
    if (!f.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille ` +
          `(${f.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
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
  console.log(`   ${LEGITIMES.length} étapes de workflow légitimes restent acceptées.`);
  return 0;
}

// ── ligne de commande ────────────────────────────────────────────────────────
// Gardée : ce module est IMPORTÉ par ses deux tests. Sans ce test d'entrée, l'import déclencherait
// le contrôle et son `process.exit`, et la suite mourrait au chargement.
const APPELE_DIRECTEMENT = /gov-depot\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    process.exit(prouver());
  } else {
    const horsLigne = process.argv.includes('--hors-ligne');
    const vue = lireVue(horsLigne);
    if (horsLigne) {
      console.error(
        `⚠️ \`--hors-ligne\` : la forge n'est PAS interrogée. Ce mode ne peut donc rien conclure ` +
          `sur la visibilité ni sur la protection de \`main\` — il vérifie les sources et les ` +
          `workflows, et sort en 2.`
      );
    }
    process.exit(
      rendre(
        controler(vue),
        `visibilité \`${vue.visibilite}\` = W13, check requis \`${checksProduits(vue.ci).join(', ')}\` armé sur ` +
          `main, historique linéaire exigé, ${vue.workflows.length} workflow(s) sans push vers la branche principale.`
      )
    );
  }
}
