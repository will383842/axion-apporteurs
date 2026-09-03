// @req REQ-GOV-014
// @req REQ-QA-013
//
// REQ-QA-013 n'est couverte ici QUE par sa moitie BLOQUANTE : que le check requis de `main` soit
// celui que `ci.yml` produit reellement, et qu'un workflow qui ne se declenche pas sur
// `pull_request` ne produise aucun check de PR. Le CONTENU de la gate — ESLint, Prettier,
// couverture, testcontainers, semgrep, audit, gitleaks, req:check, idor:check, lint de migration,
// size-limit — n'est livre par AUCUNE tache de la phase -1 : il revient a QA-T01, QA-T07 et
// QA-T28, qui portent deja l'exigence. `pnpm gov:trace` le redira quand elles entreront.
// Le dire ici vaut mieux que le laisser croire : c'est la case cochee sans etre vraie que
// GOV-011 a trouvee seize fois le 2026-09-04.
/**
 * `gov:depot-visibilite` — la visibilité décidée, le check requis câblé, et ce que la garde
 * AVOUE ne pas avoir pu lire.
 *
 * POURQUOI CE FICHIER EXISTE. `docs/tasks.json` (GOV-012) déclare deux tests pour REQ-GOV-014 ;
 * celui-ci est le second. L'acceptation de la tâche dit : « `gh repo view --json visibility` ≠ la
 * valeur décidée par W13, ou check requis `gate-a` absent → rouge ». Deux faits mesurés fondent
 * chacune de ces moitiés :
 *
 *   — la VISIBILITÉ est une décision (W13, `docs/DECISIONS.md`), pas une préférence : elle commande
 *     la règle de publication (REQ-GOV-031). Un dépôt qui bascule en privé sans que la décision
 *     change, ou l'inverse, est un écart qu'aucune relecture de code ne voit ;
 *   — le CHECK REQUIS doit porter le nom EXACT du job. L'acceptation de GOV-000 le dit et dit
 *     pourquoi : « sinon GitHub reste en "Expected — Waiting for status", `gh pr checks --watch`
 *     n'aboutit jamais et la file se bloque dès la PR témoin ». Un check requis mal nommé ne rend
 *     pas la PR rouge : il la rend ÉTERNELLE.
 *
 * CE QUE CE TEST NE FAIT PAS, ET C'EST DÉLIBÉRÉ. Il n'appelle pas la forge. La protection de branche
 * n'est lisible que par un jeton qui en a le droit, et `.claude/settings.json` porte une règle de
 * refus qui la vise (`Bash(gh api * /branches/main/protection*)`). Un test qui dépendrait du réseau serait
 * vert ou rouge selon la minute. Ce qui est exercé ici, c'est donc : la DÉRIVATION des valeurs
 * attendues depuis les fichiers du dépôt (RM-01), le jugement sur des vues INJECTÉES (RM-11), et le
 * fait que l'absence de lecture produise un verdict INDÉTERMINÉ — jamais un vert.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import {
  controler,
  checksProduits,
  visibiliteDecidee,
  VUE_CONFORME,
  FAMILLES,
  type Vue,
  type Protection,
} from '../../../scripts/gates/gov-depot';

const SCRIPT = 'scripts/gates/gov-depot.ts';
const CI = '.github/workflows/ci.yml';
const DECISIONS = 'docs/DECISIONS.md';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

describe('REQ-GOV-014 — les valeurs attendues sont DÉRIVÉES du dépôt (RM-01)', () => {
  it('la visibilité attendue se lit dans la ligne W13 de DECISIONS.md, elle n’est pas tapée', () => {
    expect(visibiliteDecidee(readFileSync(DECISIONS, 'utf8'))).toBe('PUBLIC');

    // La preuve que c'est une lecture et non un littéral : on renverse la décision dans une COPIE
    // du texte, et l'attente doit se renverser avec elle. Sans cette assertion, un `return "PUBLIC"`
    // passerait le test précédent.
    const renverse = readFileSync(DECISIONS, 'utf8').replace('`, PUBLIC**', '`, PRIVATE**');
    expect(visibiliteDecidee(renverse)).toBe('PRIVATE');
  });

  it('le nom du check requis se lit dans les jobs de ci.yml, il n’est pas tapé', () => {
    // GitHub nomme le check d'après le `name:` du job, ou à défaut d'après son identifiant.
    // `ci.yml` déclare le job `gate-a` sans `name:` : le check s'appelle donc `gate-a`.
    expect(checksProduits(readFileSync(CI, 'utf8'))).toEqual(['gate-a']);

    const renomme = readFileSync(CI, 'utf8').replace('  gate-a:', '  gate-zzz:');
    expect(checksProduits(renomme)).toEqual(['gate-zzz']);
  });

  it('un workflow qui ne se déclenche pas sur `pull_request` ne produit aucun check de PR', () => {
    // C'est le piège « Expected — Waiting for status » : le job existe, la protection l'exige,
    // et il n'arrive jamais parce que rien ne le déclenche sur une PR.
    const sansPr = readFileSync(CI, 'utf8').replace('  pull_request:', '  pull_request_target:');
    expect(checksProduits(sansPr)).toEqual([]);
  });
});

describe('REQ-GOV-014 — chaque famille rougit sur son témoin', () => {
  it('la vue conforme est verte : sans ce contre-témoin, tout le reste ne prouve rien', () => {
    expect(controler(VUE_CONFORME)).toEqual([]);
  });

  it('visibilite_inattendue — le dépôt est privé alors que W13 le veut public', () => {
    expect(familles({ ...VUE_CONFORME, visibilite: 'PRIVATE' })).toEqual(['visibilite_inattendue']);
  });

  it('check_requis_absent — `gate-a` n’est plus exigé par la protection de `main`', () => {
    const protection = structuredClone(VUE_CONFORME.protection as Protection);
    protection.required_status_checks = { strict: true, contexts: [] };
    expect(familles({ ...VUE_CONFORME, protection })).toContain('check_requis_absent');
  });

  it('check_jamais_produit — la protection exige un check qu’aucun job ne produit', () => {
    const protection = structuredClone(VUE_CONFORME.protection as Protection);
    protection.required_status_checks = { strict: true, contexts: ['gate-a', 'gate-fantome'] };
    expect(familles({ ...VUE_CONFORME, protection })).toEqual(['check_jamais_produit']);
  });

  it('historique_non_lineaire — l’historique linéaire n’est plus exigé (acceptation de GOV-012)', () => {
    const protection = structuredClone(VUE_CONFORME.protection as Protection);
    protection.required_linear_history = { enabled: false };
    expect(familles({ ...VUE_CONFORME, protection })).toEqual(['historique_non_lineaire']);
  });

  it('ecrasement_autorise — la branche principale accepte le `--force` ou la suppression', () => {
    const protection = structuredClone(VUE_CONFORME.protection as Protection);
    protection.allow_force_pushes = { enabled: true };
    expect(familles({ ...VUE_CONFORME, protection })).toEqual(['ecrasement_autorise']);
  });

  it('workflow_pousse_sur_main — une étape de workflow atteint la branche principale', () => {
    const workflows = [
      { chemin: '.github/workflows/temoin.yml', contenu: 'jobs:\n  x:\n    steps:\n      - run: git push origin HEAD:main\n' },
    ];
    expect(familles({ ...VUE_CONFORME, workflows })).toEqual(['workflow_pousse_sur_main']);
  });

  it('source_illisible — la ligne W13 a disparu : la garde ne sait plus ce qu’elle attend', () => {
    expect(familles({ ...VUE_CONFORME, decisions: '| Id | Décision |\n' })).toEqual(['source_illisible']);
  });
});

describe('REQ-GOV-014 — ne pas avoir pu lire n’est JAMAIS un vert', () => {
  it('branche_non_protegee — la protection SUPPRIMÉE est un ROUGE, pas un indéterminé', () => {
    // Le scénario d'attaque de cette tâche : `gh api -X DELETE …/branches/main/protection` n'est
    // refusé par aucune règle de la matrice — celle qui le vise porte une espace devant
    // `/branches` que la commande réelle n'a pas. Si la garde traitait l'effacement comme « je
    // n'ai pas pu lire », l'attaque produirait le même verdict qu'un poste sans droits.
    const fautes = controler({ ...VUE_CONFORME, protection: 'non_protegee' });
    expect(fautes.map((f) => f.famille)).toEqual(['branche_non_protegee']);
    expect(fautes[0]?.gravite).toBe('rouge');
  });

  it('protection_non_lisible — protection NON LUE ⇒ verdict INDÉTERMINÉ, pas conforme', () => {
    const fautes = controler({ ...VUE_CONFORME, protection: null });
    expect(fautes.map((f) => f.famille)).toEqual(['protection_non_lisible']);
    expect(fautes[0]?.gravite).toBe('indetermine');
    // Le message doit dire QUI peut la lire : une garde qui constate sans dire quoi faire
    // devient un avertissement qu'on apprend à ignorer.
    expect(fautes[0]?.message).toContain('A04');
  });

  it('`--hors-ligne` sort en 2 et le DIT — il ne prétend pas juger la forge', () => {
    const { code, sortie } = lancer('--hors-ligne');
    expect(code).toBe(2);
    expect(sortie).toContain('INDÉTERMINÉ');
    expect(sortie).not.toContain('✅');
  });

  it('un code de sortie distinct sépare « non conforme » de « non vérifié »', () => {
    // 0 conforme · 1 défaut constaté · 2 indéterminé. Confondre 1 et 2 ferait passer une gate
    // aveugle pour une gate qui refuse, et une gate aveugle pour une gate qui accepte.
    expect(lancer('--hors-ligne').code).toBe(2);
    expect(lancer('--prove').code).toBe(0);
  });
});

describe('REQ-GOV-014 — la garde sait rougir, et le prouve elle-même', () => {
  it(`sait rougir : ses ${FAMILLES.length} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${FAMILLES.length} familles rougissent`);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES.length);
  });

  it('le registre des gardes nomme cette garde, et elle est armée', () => {
    // `docs/gates.json` déclarait `gov:depot-visibilite` avec `preuveRouge: null` depuis GOV-000 :
    // personne ne l'avait vue rougir, et son script n'existait pas. Ce test fige le fait que le
    // script existe désormais ; la mise à jour du registre (chemin + preuveRouge) est un ajout à un
    // fichier partagé, rendu en diff dans la PR.
    const gates = JSON.parse(readFileSync('docs/gates.json', 'utf8')) as {
      gates: { id: string; tache: string }[];
    };
    const entree = gates.gates.find((g) => g.id === 'gov:depot-visibilite');
    expect(entree?.tache).toBe('GOV-012');
    expect(readdirSync('scripts/gates')).toContain('gov-depot.ts');
  });
});

describe('REQ-GOV-014 — le protocole de fusion est écrit et exécutable', () => {
  const PROTOCOLE = 'docs/PROTOCOLE-FUSION.md';

  it('`docs/PROTOCOLE-FUSION.md` existe et porte les cinq gestes que REQ-GOV-014 nomme', () => {
    const texte = readFileSync(PROTOCOLE, 'utf8');
    for (const geste of [
      'mergeStateStatus',
      'gh pr merge --squash --delete-branch',
      'x-partners-build-sha',
      'pnpm gov:pr --pr',
      'pnpm gov:pr --apres-fusion',
    ]) {
      expect(texte).toContain(geste);
    }
  });

  it('il DÉRIVE des ADR et des conventions : il les cite au lieu de les recopier (RM-01)', () => {
    const texte = readFileSync(PROTOCOLE, 'utf8');
    expect(texte).toContain('partners/ADR-0006');
    expect(texte).toContain('partners/ADR-0007');
    expect(texte).toContain('docs/CONVENTIONS.md');
    expect(texte).toContain('RM-09');
  });

  it('il refuse nommément les trois formes que la matrice d’autonomie refuse déjà', () => {
    const texte = readFileSync(PROTOCOLE, 'utf8');
    for (const interdit of ['--auto', '--admin', '--force']) expect(texte).toContain(interdit);
  });

  it('chaque pas dit ce qu’on LIT pour savoir s’il est réussi', () => {
    // Un protocole qui énumère des commandes sans critère d'arrêt n'est pas exécutable : c'est
    // ce qui a fait fusionner une PR passée BEHIND entre la lecture et l'action.
    const pas = readFileSync(PROTOCOLE, 'utf8')
      .split('\n')
      .filter((l) => /^### Pas \d/.test(l));
    expect(pas.length).toBeGreaterThanOrEqual(8);
    const lus = readFileSync(PROTOCOLE, 'utf8').match(/^\*\*Ce qu'on lit\.\*\*/gm) ?? [];
    expect(lus.length).toBe(pas.length);
  });
});
