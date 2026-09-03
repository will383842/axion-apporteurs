/**
 * gov-autonomie.ts — la matrice d'autonomie des agents, et la preuve qu'elle garde. (REQ-CPL-021)
 *
 * USAGE : pnpm gov:autonomie          contrôle le dépôt
 *         pnpm gov:autonomie --prove  un témoin par famille, des contre-témoins verts
 *
 * CE QUE CETTE GARDE EXISTE POUR EMPÊCHER. `docs/gates.json` déclarait `gov:autonomie` depuis
 * GOV-000, avec `preuveRouge: null` — c'est-à-dire : personne ne l'avait jamais vue rougir, et
 * pour cause, le script n'existait pas. La matrice était une liste de motifs dans un fichier de
 * réglages, que rien ne lisait et que rien ne mettait à l'épreuve.
 *
 * Le coût s'est mesuré sur la PR 27. Élargir l'`allow` aux branches `lot/*` a ouvert, sans que
 * personne ne le voie, deux chemins vers la branche principale :
 *
 *     git push origin lot/L-9-99-integration:main --force
 *     git push -u origin lot/quelquechose:main
 *
 * Aucune des six règles `deny` censées protéger `main` ne les intercepte : toutes sont des
 * SOUS-CHAÎNES, et supposent donc une forme de commande — un espace juste avant `main`, un
 * drapeau collé au verbe. Git n'impose ni l'un ni l'autre.
 *
 * D'où deux décisions, et cette garde qui les tient :
 *   1. la matrice reste, elle double ;
 *   2. la vraie défense est un HOOK qui LIT la commande — `scripts/gates/git-push-sur.js`, appelé
 *      par `hook-env.js` en `PreToolUse`. Un motif ne comprend pas une syntaxe ; un analyseur oui.
 *
 * QUATRE FAMILLES, chacune vue rougir sur son témoin :
 *   `deny_manquant`      une règle que la matrice doit porter a disparu de `.claude/settings.json`
 *   `hook_non_declare`   le hook `PreToolUse` n'est plus déclaré sur `Bash`, ou pointe ailleurs
 *   `hook_sans_analyse`  `hook-env.js` n'appelle plus `git-push-sur.js` : la matrice redevient seule
 *   `commande_laissee_passer`  une commande dangereuse que `jugerPush` laisse passer
 *
 * Et des CONTRE-TÉMOINS : les commandes légitimes que la garde doit laisser passer. Sans eux, une
 * garde qui refuse tout serait « prouvée » par ses quatre témoins.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const CHEMIN_MATRICE = '.claude/settings.json';
const CHEMIN_HOOK = 'scripts/gates/hook-env.js';
const CHEMIN_ANALYSE = 'scripts/gates/git-push-sur.js';

type Faute = { famille: string; message: string };

const FAMILLES = ['deny_manquant', 'hook_non_declare', 'hook_sans_analyse', 'commande_laissee_passer'];

/**
 * Les règles `deny` que la matrice DOIT porter. Recopiées ? Non : c'est `docs/gates.json`, entrée
 * `gov:autonomie`, champ `verifie`, qui les énonce — cette liste en est la lecture, et la garde
 * rougit si l'une manque. Les motifs eux-mêmes ne peuvent pas être dérivés du registre (il les
 * décrit en prose), mais leur PRÉSENCE est ce qu'on contrôle, pas leur formulation.
 */
const DENY_EXIGES = [
  'Bash(git push origin main*)',
  'Bash(git push * main*)',
  'Bash(git push --force*)',
  'Bash(git push -f*)',
  'Bash(git reset --hard*)',
  'Bash(pnpm db:deploy*)',
  'Write(docs/tasks.json)',
  'Write(docs/PLAN-STATE.md)',
  'Write(docs/DECISIONS.md)',
  'Write(docs/REQUIREMENTS.md)',
];

/**
 * Les commandes qui ne doivent JAMAIS partir. Les deux premières sont celles que la lentille
 * `securite` a construites sur la PR 27 et qu'aucune règle `deny` n'intercepte : elles sont ici
 * mot pour mot, parce qu'un témoin reformulé cesse d'être le témoin d'un incident.
 */
const DANGEREUSES = [
  'git push origin lot/L-9-99-integration:main --force',
  'git push -u origin lot/quelquechose:main',
  'git push origin main',
  'git push origin HEAD:main',
  'git push origin +lot/x:main',
  'git push origin refs/heads/lot/x:refs/heads/main',
  'git push --force origin lot/x',
  'git push origin lot/x -f',
  'git push --mirror origin',
  'git status && git push origin lot/x:main',
  'git -C ../axion-partners-wt/dm-07 push origin lot/x:main',
  'git push',
];

/**
 * Les commandes LÉGITIMES. Une garde qui refuse tout est prouvée par n'importe quel témoin :
 * ce sont ces lignes-ci qui font la différence entre garder et bloquer.
 */
const LEGITIMES = [
  'git push -u origin lot/L-1-02-integration',
  'git push origin t/gov-012',
  'git push --set-upstream origin lot/L-1-02-integration',
  'echo git push origin main',
  'grep -rn "git push origin main" docs/',
  'git commit -m "chore: on poussera main plus tard"',
  'git fetch origin && git merge origin/main',
];

type Analyse = { jugerPush: (ligne: string) => { refuse: boolean; motif: string | null } };

/** Contrôle le dépôt, ou une VUE mutée de lui — c'est ce qui rend `--prove` possible. */
function controler(vue: { matrice: string; hook: string; analyse: Analyse | null }): Faute[] {
  const fautes: Faute[] = [];
  const ajouter = (famille: string, message: string): void => {
    fautes.push({ famille, message });
  };

  let regles: { permissions?: { deny?: string[] }; hooks?: Record<string, unknown> };
  try {
    regles = JSON.parse(vue.matrice) as typeof regles;
  } catch (e) {
    ajouter('deny_manquant', `${CHEMIN_MATRICE} n'est pas un JSON lisible : ${(e as Error).message}`);
    return fautes;
  }

  const deny = regles.permissions?.deny ?? [];
  for (const r of DENY_EXIGES) {
    if (!deny.includes(r)) {
      ajouter(
        'deny_manquant',
        `${CHEMIN_MATRICE} — la règle \`${r}\` a disparu de \`permissions.deny\`. ` +
          `Le registre (docs/gates.json, gov:autonomie) l'exige. Ne jamais assouplir un \`deny\` ` +
          `pour débloquer une tâche : rendre \`stop\` et remonter à Will.`
      );
    }
  }

  const pre = (regles.hooks?.['PreToolUse'] ?? []) as { matcher?: string; hooks?: { command?: string }[] }[];
  const surBash = pre.filter((h) => h.matcher === 'Bash');
  const commandes = surBash.flatMap((h) => (h.hooks ?? []).map((x) => x.command ?? ''));
  if (!commandes.some((c) => c.includes('hook-env.js'))) {
    ajouter(
      'hook_non_declare',
      `${CHEMIN_MATRICE} — aucun hook \`PreToolUse\` sur \`Bash\` n'appelle \`${CHEMIN_HOOK}\`. ` +
        `Sans lui, la matrice n'est plus qu'une liste de motifs, et les motifs ne lisent pas une syntaxe.`
    );
  }

  if (!vue.hook.includes('git-push-sur')) {
    ajouter(
      'hook_sans_analyse',
      `${CHEMIN_HOOK} n'appelle plus \`${CHEMIN_ANALYSE}\`. Les règles \`deny\` redeviennent seules ` +
        `à garder la branche principale — et elles ne voient pas \`origin lot/x:main\`.`
    );
  }

  if (vue.analyse !== null) {
    for (const c of DANGEREUSES) {
      if (!vue.analyse.jugerPush(c).refuse) {
        ajouter(
          'commande_laissee_passer',
          `\`${c}\` est LAISSÉE PASSER par \`jugerPush\`. Cette commande atteint la branche ` +
            `principale ou écrase l'historique distant (REQ-GOV-014, RM-09).`
        );
      }
    }
  }

  return fautes;
}

function lireVue(): { matrice: string; hook: string; analyse: Analyse | null } {
  for (const c of [CHEMIN_MATRICE, CHEMIN_HOOK, CHEMIN_ANALYSE]) {
    if (!existsSync(c)) {
      console.error(`❌ gov:autonomie — ${c} est introuvable. La matrice ne peut pas être contrôlée.`);
      process.exit(1);
    }
  }
  return {
    matrice: readFileSync(CHEMIN_MATRICE, 'utf8'),
    hook: readFileSync(CHEMIN_HOOK, 'utf8'),
    analyse: require_(`${process.cwd()}/${CHEMIN_ANALYSE}`) as Analyse,
  };
}

// ── mode --prove ─────────────────────────────────────────────────────────────
if (process.argv.includes('--prove')) {
  const vue = lireVue();

  const base = controler(vue);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un dépôt DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 5).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    process.exit(1);
  }

  // Contre-témoins d'abord : ce que la garde doit LAISSER PASSER. Une garde qui refuse tout se
  // prouve avec n'importe quel témoin ; ce sont ces lignes-ci qui donnent sa valeur au reste.
  const laissesPasser = LEGITIMES.filter((c) => vue.analyse!.jugerPush(c).refuse);
  if (laissesPasser.length > 0) {
    console.error(`❌ Faux positif : ${laissesPasser.length} commande(s) LÉGITIME(S) refusée(s) :`);
    laissesPasser.forEach((c) => console.error(`   ${c} — ${vue.analyse!.jugerPush(c).motif}`));
    console.error('   Une garde trop large ne garde pas mieux : elle apprend à être contournée.');
    process.exit(1);
  }

  const TEMOINS: { famille: string; defaut: () => typeof vue }[] = [
    {
      famille: 'deny_manquant',
      defaut: () => ({ ...vue, matrice: vue.matrice.replace(`"${DENY_EXIGES[0]}",`, '') }),
    },
    {
      famille: 'hook_non_declare',
      defaut: () => ({ ...vue, matrice: vue.matrice.replace('scripts/gates/hook-env.js', 'scripts/gates/rien.js') }),
    },
    {
      famille: 'hook_sans_analyse',
      defaut: () => ({ ...vue, hook: vue.hook.split('git-push-sur').join('rien-du-tout') }),
    },
    {
      // La famille qui compte : un analyseur qui dit toujours oui. C'est l'état du dépôt AVANT
      // cette garde — les six règles `deny` seules, et deux commandes qui passent au travers.
      famille: 'commande_laissee_passer',
      defaut: () => ({ ...vue, analyse: { jugerPush: () => ({ refuse: false, motif: null }) } }),
    },
  ];

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const f = controler(t.defaut());
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
    console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((f) => '• ' + f).join('\n   ')}`);
  console.log(`   ${LEGITIMES.length} commandes légitimes restent acceptées.`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────
const fautes = controler(lireVue());
if (fautes.length === 0) {
  console.log(
    `✅ gov:autonomie — ${DENY_EXIGES.length} règles \`deny\` en place, hook \`PreToolUse\` déclaré sur Bash, ` +
      `${DANGEREUSES.length} commandes dangereuses refusées et ${LEGITIMES.length} légitimes acceptées.`
  );
  process.exit(0);
}

console.error(`❌ gov:autonomie — ${fautes.length} défaut(s) :`);
const parFamille = new Map<string, Faute[]>();
for (const f of fautes) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f]);
for (const [famille, liste] of parFamille) {
  console.error(`\n   ── ${famille} (${liste.length})`);
  liste.forEach((f) => console.error(`      ${f.message}`));
}
process.exit(1);
