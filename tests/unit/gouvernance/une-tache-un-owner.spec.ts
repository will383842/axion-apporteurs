// @req REQ-GOV-007
/**
 * Une tâche, un revendiqueur — et le verrou d'écriture qui le rend vrai.
 *
 * CE QUE CE FICHIER TRANCHE, PARCE QUE L'ÉNONCÉ NE POUVAIT PAS ÊTRE PRIS AU PIED DE LA LETTRE.
 * REQ-GOV-007 dit que la revendication est « écrite dans PLAN-STATE via l'orchestrateur ». Or
 * `docs/PLAN-STATE.md` est une VUE dérivée (partners/ADR-0005 §1) et `.claude/settings.json` en
 * refuse l'écriture : rien ne peut s'y écrire. La revendication vit donc dans les deux sources
 * qui existaient déjà, et PLAN-STATE les REND :
 *
 *   — en vol : les labels `en_cours` + `owner:<Axx>` de l'issue, posés par l'orchestrateur au §3
 *     de `.claude/skills/lot/SKILL.md` (`gh issue edit <n> --add-label …`), seul écrivain ;
 *   — consolidée : le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul.
 *
 * Aucun troisième endroit n'a été créé. Un état partagé entre quarante agents ne peut avoir
 * qu'une source par fait ; en inventer une de plus, c'est fabriquer la prochaine divergence.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SCRIPT = 'scripts/gates/gov-etat.ts';
const MAINTENANT = '2026-09-04T09:00:00Z';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('REQ-GOV-007 — au plus un owner à la fois', () => {
  it('REQ-GOV-007 — deux PR OUVERTES citant la même tâche font rougir la famille `deux_pr_meme_tache`', () => {
    // C'est la gate écrite mot pour mot dans REQ-GOV-007. Le témoin vit dans `--prove` : deux PR
    // ouvertes dont les titres portent le même identifiant de tâche.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('• deux_pr_meme_tache');
  });

  it('REQ-GOV-007 — deux revendiqueurs distincts sur la même tâche font rougir `revendication_multiple`', () => {
    // « Au plus un owner » : deux labels `owner:` sur la même issue, ou un label qui contredit le
    // champ `owner` de `docs/tasks.json`. Les deux sources doivent dire la MÊME chose ou se taire.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('• revendication_multiple');
  });

  it('REQ-GOV-007 — une PR ouverte sur une tâche que PERSONNE n’a revendiquée fait rougir `pr_sur_tache_non_revendiquee`', () => {
    // « Un agent ne travaille jamais sur une tâche non revendiquée » : sans ce témoin, la moitié
    // de l'exigence n'était gardée par rien — on aurait vérifié qu'il n'y a pas DEUX propriétaires
    // sans jamais vérifier qu'il y en a UN.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('• pr_sur_tache_non_revendiquee');
  });

  it('REQ-GOV-007 — sur l’état réel du dépôt, aucune tâche ne porte deux revendications', () => {
    const { code, sortie } = lancer('--now', MAINTENANT);
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-007 — PLAN-STATE rend la revendication : la tâche ET son revendiqueur, avec la source lue', () => {
    const vue = readFileSync('docs/PLAN-STATE.md', 'utf8');
    const section = vue.slice(vue.indexOf('## Revendications'), vue.indexOf('## Décisions du jour'));
    expect(section.length).toBeGreaterThan(0);
    // La section nomme ses deux sources : sans cela, un lecteur ne sait pas où corriger une
    // revendication fausse — et il la corrigerait dans la vue, qui l'effacerait.
    expect(section).toContain('docs/tasks.json');
    expect(section).toContain('SKILL.md');
  });

  it('REQ-GOV-007 — la revendication n’a PAS de troisième endroit : PLAN-STATE la rend, il ne la stocke pas', () => {
    // Le générateur doit lire les deux sources existantes. S'il lisait un fichier à lui, la
    // revendication aurait trois versions et deux d'entre elles seraient fausses un jour.
    const generateur = readFileSync('scripts/plan-state/build.ts', 'utf8');
    expect(generateur).toContain('docs/tasks.json');
    expect(generateur).toContain('issue');
    expect(generateur).toMatch(/owner:/);
  });
});
