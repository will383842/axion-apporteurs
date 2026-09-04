/**
 * La matrice d'autonomie des agents, exercée comme un test.
 *
 * @req REQ-CPL-021
 *
 * POURQUOI CE FICHIER EXISTE. `pnpm gov:trace` (GOV-011) l'a trouvé le 2026-09-04 : REQ-CPL-021 est
 * portée par GOV-000, livrée, et **aucun test exécuté ne la citait**. Le seul contrôle était la
 * garde `gov:autonomie` — elle-même écrite la veille, après que la lentille sécurité eut montré que
 * la matrice ne gardait pas ce qu'elle prétendait garder.
 *
 * Ce fichier existe parce que la matrice a été prise en défaut TROIS FOIS en deux jours, toujours
 * pour la même raison : ses règles sont des SOUS-CHAÎNES, et une sous-chaîne suppose une forme de
 * commande que l'outil n'est pas tenu d'employer.
 *
 *   1. `Bash(git push * main*)` exige une espace avant `main` — `git push origin lot/x:main --force`
 *      passe entre les six règles censées protéger la branche principale (PR 27, lentille sécurité).
 *   2. `Bash(gh api * /branches/main/protection*)` exige une espace devant `/branches`, que la
 *      commande réelle de `gh` n'a jamais : la règle ne peut matcher qu'une commande INVALIDE,
 *      pendant que `Bash(gh api*)` est en `allow`. `gh api -X DELETE …/branches/main/protection`
 *      efface donc toute la protection sans rencontrer un seul refus (GOV-012).
 *   3. `Bash(gh issue edit*)` est en `allow` et rien ne couvre `--remove-label` : un agent retire
 *      `owner:A01`, pose le sien, et l'état final ne porte qu'un revendiqueur — `gov:etat` reste
 *      verte pendant que le verrou a été forcé. Indétectable côté forge : `W13` a tranché un dépôt
 *      à un seul compte, où deux agents sont la même identité (GOV-008).
 *
 * Ce que ce fichier vérifie n'est donc PAS que les règles existent — c'est que les commandes
 * dangereuses sont RÉELLEMENT refusées par le hook, et que les légitimes passent. Les trois
 * commandes ci-dessus y sont écrites mot pour mot : un témoin reformulé cesse d'être le témoin
 * d'un incident.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { jugerPush } = require_(`${process.cwd()}/scripts/gates/git-push-sur.js`) as {
  jugerPush: (l: string) => { refuse: boolean; motif: string | null };
};
const { jugerGh } = require_(`${process.cwd()}/scripts/gates/gh-sur.js`) as {
  jugerGh: (l: string) => { refuse: boolean; motif: string | null };
};

/**
 * Passe une commande au VRAI hook, par son entrée réelle (le JSON de `PreToolUse` sur stdin), et
 * rend son code de sortie. C'est la seule façon de prouver le refus : appeler `jugerPush` en
 * direct ne dit rien de ce que le hook fait de son verdict.
 */
function hook(commande: string): { code: number; sortie: string } {
  const r = spawnSync('node', ['scripts/gates/hook-env.js'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: commande } }),
    encoding: 'utf8',
    env: { ...process.env, NOTIFY_SINK: 'true' },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les trois incidents, verbatim. Chacun a été construit contre la matrice, pas imaginé. */
const INCIDENTS = [
  {
    quoi: 'la destination écrite après un deux-points, le drapeau de force en fin de ligne (PR 27)',
    commande: 'git push origin lot/L-9-99-integration:main --force',
  },
  {
    quoi: "l'effacement de la protection de branche, que la règle `deny` ne peut pas matcher (GOV-012)",
    commande: 'gh api -X DELETE repos/will383842/axion-apporteurs/branches/main/protection',
  },
  {
    quoi: "le vol de revendication, indétectable côté forge sur un dépôt à un compte (GOV-008)",
    commande: 'gh issue edit 7 --remove-label owner:A01',
  },
];

/**
 * Ce que la matrice doit LAISSER PASSER. Sans ces lignes, un hook qui refuse tout serait « prouvé »
 * par les trois incidents ci-dessus — et une garde trop large apprend à être contournée : c'est
 * écrit dans `hook-env.js`, qui porte déjà la trace d'un `git commit -m` refusé parce que son
 * MESSAGE citait une variable gardée.
 */
const LEGITIMES = [
  'git push -u origin lot/L-1-03-integration',
  'git push origin t/gov-012',
  // La LECTURE de la protection reste permise : c'est ainsi que `gov:depot-visibilite` la vérifie.
  // L'interdire aurait rendu cette gate impossible à satisfaire — et une gate insatisfiable est
  // une gate qu'on apprend à sauter.
  'gh api repos/will383842/axion-apporteurs/branches/main/protection',
  'gh issue edit 7 --add-label en_cours --add-label owner:A01',
  'gh pr merge 27 --squash --delete-branch',
  // Citer une commande dangereuse n'est pas l'exécuter.
  'echo git push origin main',
  'grep -rn "gh api -X DELETE" docs/',
];

describe('REQ-CPL-021 — la matrice d’autonomie refuse ce qu’elle prétend refuser', () => {
  it.each(INCIDENTS)('REQ-CPL-021 — refusé par le hook : $quoi', ({ commande }) => {
    const { code, sortie } = hook(commande);
    expect(code, `« ${commande} » n'a pas été refusée`).toBe(2);
    expect(sortie).toContain('REFUSÉ');
  });

  it.each(LEGITIMES.map((commande) => ({ commande })))(
    'REQ-CPL-021 — CONTRE-TÉMOIN, laissé passer : $commande',
    ({ commande }) => {
      const { code, sortie } = hook(commande);
      expect(code, `« ${commande} » a été refusée à tort : ${sortie}`).toBe(0);
    }
  );

  it('REQ-CPL-021 — le hook juge sur les JETONS, pas sur des sous-chaînes', () => {
    // La preuve que le mécanisme est bien un analyseur : la MÊME destination, écrite de quatre
    // façons que quatre sous-chaînes différentes auraient dû couvrir, est refusée par une seule
    // règle — celle qui lit le refspec.
    for (const forme of [
      'git push origin main',
      'git push origin HEAD:main',
      'git push origin +lot/x:main',
      'git push origin refs/heads/lot/x:refs/heads/main',
    ]) {
      expect(jugerPush(forme).refuse, forme).toBe(true);
    }
    // Et une branche parfaitement légitime dont le NOM contient `main` n'est pas refusée :
    // c'est la destination qui compte, pas la présence du mot.
    expect(jugerPush('git push -u origin lot/domaine-principal').refuse).toBe(false);
  });

  it('REQ-CPL-021 — `gh api` : l’écriture est refusée, la lecture reste permise', () => {
    // La distinction porte sur la MÉTHODE, pas sur le chemin. Refuser le chemin aurait cassé
    // `gov:depot-visibilite`, qui doit lire cette même route pour faire son travail.
    expect(jugerGh('gh api -X DELETE repos/o/r/branches/main/protection').refuse).toBe(true);
    expect(jugerGh('gh api --method PUT repos/o/r/branches/main/protection').refuse).toBe(true);
    expect(jugerGh('gh api repos/o/r/branches/main/protection').refuse).toBe(false);
    // `-f` pose un corps : `gh` bascule alors en POST tout seul, sans qu'aucun `-X` n'apparaisse.
    expect(jugerGh('gh api repos/o/r/branches/main/protection -f enforce_admins=false').refuse).toBe(true);
  });

  it('REQ-CPL-021 — `pnpm gov:autonomie` et sa preuve sont vertes sur l’état du dépôt', () => {
    const lancer = (...args: string[]) => {
      const r = spawnSync('npx', ['tsx', 'scripts/gates/gov-autonomie.ts', ...args], {
        encoding: 'utf8',
        shell: true,
      });
      return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
    };
    const normal = lancer();
    expect(normal.sortie).toContain('✅');
    expect(normal.code).toBe(0);

    const preuve = lancer('--prove');
    expect(preuve.code).toBe(0);
    // Aucun total n'est épinglé : le compte se dérive de la liste imprimée. Épingler « 4 » aurait
    // fait rougir ce test à la première famille ajoutée, pour une raison qui n'est pas un défaut.
    const familles = preuve.sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(familles.length).toBeGreaterThan(0);
    expect(preuve.sortie).toContain(`Les ${familles.length} familles rougissent`);
  });
});
