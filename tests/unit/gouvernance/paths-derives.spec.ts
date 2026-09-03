/**
 * Ce que GOV-017b livre — `scripts/lot/paths-proposes.ts` — n'était porté par AUCUNE assertion :
 * la tâche n'avait pas de `tests{}`, et le schéma du backlog l'exige de toute tâche `fusionnee`.
 * C'est ce trou que ce fichier ferme.
 *
 * Trois choses sont vérifiées, chacune parce qu'elle a une façon connue de casser en silence :
 *
 *   1. `docs/paths-proposes.json` est bien la VUE de ce que le script produit (RM-01). Le fichier
 *      est commité ; s'il dérive, `--check` doit le dire. On l'exerce sur le disque réel.
 *   2. Le fichier de vue N'EST PAS la source : si `--check` restait vert après qu'on ait truqué
 *      le rendu, il ne comparerait rien. On mute une copie et on exige le rouge.
 *   3. Toute tâche `repo: axionia` porte des chemins préfixés `axionia/` (REQ-GOV-025) — l'invariant
 *      que le composeur suppose pour ne jamais mêler deux dépôts dans un même lot.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'scripts/lot/paths-proposes.ts';
const VUE = 'docs/paths-proposes.json';

/** Lance le script et rend `{ code, sortie }` sans jamais jeter — le code de sortie EST le verdict. */
function lancer(...args: string[]): { code: number; sortie: string } {
  try {
    const sortie = execFileSync('npx', ['tsx', SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    return { code: 0, sortie };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('REQ-GOV-021 / REQ-GOV-025 — les paths du backlog sont DÉRIVÉS, et la vue le prouve', () => {
  it('la vue commitée est à jour : `--check` est vert sur le dépôt', () => {
    const { code, sortie } = lancer('--check');
    expect(sortie).toContain('à jour');
    expect(code).toBe(0);
  }, 60_000);

  it("sait rougir : une vue truquée d'un seul caractère fait échouer `--check`", () => {
    const dossier = mkdtempSync(join(tmpdir(), 'paths-derives-'));
    // On n'écrit JAMAIS dans `docs/` : la vue truquée part dans un dossier qu'on a créé nous-mêmes,
    // et le script la compare via `--out`. Un test qui abîme le dépôt pour se prouver ne prouve rien.
    const truque = join(dossier, 'paths-proposes.json');
    try {
      const vue = JSON.parse(readFileSync(VUE, 'utf8')) as { resume?: Record<string, unknown> };
      if (vue.resume) vue.resume['pairesEnIntersection'] = 999_999;
      writeFileSync(truque, `${JSON.stringify(vue, null, 2)}\n`, 'utf8');

      const { code, sortie } = lancer('--check', '--out', truque);
      expect(code).not.toBe(0);
      expect(sortie).toContain('diverge');

      // Contre-temoin, sans lequel le rouge ci-dessus ne prouverait rien : `--check --out` sur une
      // copie FIDELE doit rester vert. Sans lui, un `--out` que le script ignorerait — ou qu'il
      // refuserait par principe — donnerait exactement le meme rouge.
      const fidele = join(dossier, 'copie-fidele.json');
      writeFileSync(fidele, readFileSync(VUE, 'utf8'), 'utf8');
      const temoinVert = lancer('--check', '--out', fidele);
      expect(temoinVert.sortie).toContain('a jour'.replace('a jour', 'à jour'));
      expect(temoinVert.code).toBe(0);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 60_000);

  it('REQ-GOV-025 — aucune tâche `repo: axionia` ne prétend écrire un fichier de ce dépôt', () => {
    const taches = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
      taches: { id: string; repo: string }[];
    }).taches;
    const vue = JSON.parse(readFileSync(VUE, 'utf8')) as { paths: Record<string, string[]> };

    const fautives = taches
      .filter((t) => t.repo === 'axionia')
      .filter((t) => (vue.paths[t.id] ?? []).some((p) => !p.startsWith('axionia/')))
      .map((t) => t.id);

    expect(fautives).toEqual([]);
  });
});
