// @req REQ-GOV-014
/**
 * Aucun workflow ne pousse sur la branche principale.
 *
 * POURQUOI CE FICHIER EXISTE. `partners/ADR-0006` §4 pose la règle et l'attribue nommément à
 * GOV-012 (« Assertion à poser — par GOV-012 : `aucun-workflow-ne-pousse-sur-main.spec.ts` »).
 * Jusqu'ici elle ne tenait que par la protection de branche, c'est-à-dire par un réglage que
 * personne ne relit et qu'un poste d'agent ne peut pas lire (voir `tout-check-est-cable.spec.ts`).
 * Un dépôt qui se pousse lui-même n'a plus d'historique reproductible : la PR fusionnée n'est plus
 * la seule façon d'écrire sur `main`, et l'écrasement (`--force`) redevient atteignable depuis un
 * runner, où aucune matrice d'autonomie ne s'applique.
 *
 * CE QUI JUGE, ET POURQUOI CE N'EST PAS UN NOUVEL ANALYSEUR. La décision « cette ligne de shell
 * atteint-elle `main` ? » est déjà écrite une fois, dans `scripts/gates/git-push-sur.js`
 * (`jugerPush`), livrée par la PR 27 après que la lentille `securite` eut montré deux commandes
 * qu'aucune règle `deny` n'interceptait (`git push origin lot/x:main --force`,
 * `git push -u origin lot/x:main`). En écrire un second ici en ferait deux qui divergeraient
 * (RM-01, RM-07) : `analyserWorkflows` extrait les commandes des workflows et les lui passe.
 * Le module d'analyse reste la source unique ; ce fichier lui donne un deuxième appelant.
 *
 * CE QUE LE VERT DU DÉPÔT NE PROUVE PAS. Aucun workflow ne pousse aujourd'hui : le contrôle serait
 * donc vert même s'il ne lisait rien. C'est pourquoi il y a ici, à parts égales, des TÉMOINS
 * (workflows fabriqués qui doivent rougir) et des CONTRE-TÉMOINS (workflows légitimes qui doivent
 * rester verts) — plus l'assertion que le dossier réel n'est pas vide.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyserWorkflows, type Fichier } from '../../../scripts/gates/gov-depot';

const DOSSIER = '.github/workflows';

/** Les workflows réellement commités, lus sur le disque. */
function workflowsDuDepot(): Fichier[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ chemin: join(DOSSIER, f), contenu: readFileSync(join(DOSSIER, f), 'utf8') }));
}

/** Un workflow de fixture : le cadre est fixe, seule l'étape jugée varie (RM-11). */
function workflow(etapes: string): Fichier {
  return {
    chemin: '.github/workflows/temoin.yml',
    contenu: [
      'name: Temoin',
      'on: { pull_request: {} }',
      'jobs:',
      '  travail:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      etapes,
      '',
    ].join('\n'),
  };
}

describe('REQ-GOV-014 — la branche principale ne reçoit que des fusions de PR', () => {
  it('REQ-GOV-014 — aucun workflow ne pousse sur la branche principale', () => {
    const fichiers = workflowsDuDepot();
    // Sans cette ligne, le contrôle serait vert sur un dossier vide — c'est-à-dire sur rien.
    expect(fichiers.length).toBeGreaterThanOrEqual(2);
    expect(analyserWorkflows(fichiers).map((f) => f.message)).toEqual([]);
  });

  it('REQ-GOV-014 — les étapes des workflows sont réellement LUES, pas survolées', () => {
    // Le contre-contrôle du précédent : si l'extraction ne rendait rien, tout serait vert.
    // Gate A porte au moins ses étapes `pnpm …` ; on exige que l'analyse en voie autant.
    const commandes = analyserWorkflows(workflowsDuDepot(), { rendreCommandes: true });
    expect(commandes.commandes.length).toBeGreaterThanOrEqual(10);
    expect(commandes.commandes.some((c) => c.startsWith('pnpm '))).toBe(true);
  });
});

describe('REQ-GOV-014 — les témoins : ces workflows-là doivent rougir', () => {
  const TEMOINS: { nom: string; etape: string }[] = [
    { nom: 'push direct sur main', etape: '      - run: git push origin HEAD:main' },
    {
      nom: 'refspec à deux-points, la forme que les règles `deny` ne voient pas',
      etape: '      - run: git push origin lot/L-9-99-integration:main --force',
    },
    {
      nom: 'push nu, dont la destination dépend de `push.default`',
      etape: ['      - run: |', '          git config user.name ci', '          git push'].join('\n'),
    },
    {
      nom: 'destination portée par une expression, donc illisible',
      etape: '      - run: git push origin ${{ github.ref }}',
    },
    {
      nom: 'action tierce qui pousse à la place du runner',
      etape: ['      - uses: ad-m/github-push-action@master', '        with: { branch: main }'].join('\n'),
    },
  ];

  it.each(TEMOINS)('$nom → refusé', ({ etape }) => {
    const fautes = analyserWorkflows([workflow(etape)]);
    expect(fautes.length).toBeGreaterThan(0);
    expect(fautes.every((f) => f.famille === 'workflow_pousse_sur_main')).toBe(true);
    expect(fautes[0]?.gravite).toBe('rouge');
  });
});

describe('REQ-GOV-014 — les contre-témoins : une garde qui refuse tout ne garde rien', () => {
  const LEGITIMES: { nom: string; etape: string }[] = [
    { nom: 'une installation', etape: '      - run: pnpm install --frozen-lockfile' },
    // Le hook `git-push-sur.js` porte la trace d'un refus « n'importe où dans la ligne » qui
    // interdisait un `git commit` dont le MESSAGE parlait de la commande gardée.
    { nom: 'une commande qui NOMME le push sans le faire', etape: '      - run: echo "git push origin main"' },
    { nom: 'un push sur une branche de lot', etape: '      - run: git push -u origin lot/L-1-03-integration' },
    { nom: 'une fusion de PR par la forge', etape: '      - run: gh pr merge 27 --squash --delete-branch' },
    // `on: push: branches: [main]` est un DÉCLENCHEUR, pas un push. `ci.yml` en porte un.
    {
      nom: 'un déclencheur sur main',
      etape: '      - run: git log --oneline origin/main | head -3',
    },
  ];

  it.each(LEGITIMES)('$nom → laissé passer', ({ etape }) => {
    expect(analyserWorkflows([workflow(etape)])).toEqual([]);
  });
});
