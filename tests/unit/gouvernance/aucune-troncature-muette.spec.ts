// @req REQ-GOV-032
// @req REQ-GOV-026
/**
 * GOV-079 — la vue d'état tronquait la liste des tâches à faire à douze identifiants, sans le dire.
 *
 * CONSTAT : `plan-state:build` rend, dans « Tâches », douze identifiants suivis de points de
 * suspension. Aucun lecteur ne distingue « douze tâches à faire » de « douze affichées sur deux
 * cents » ; une troncature muette fabrique une impression de petit reste, dans le document qu'on lit
 * pour savoir où en est le projet — la famille du compte tapé qui ne tient pas.
 *
 * CE QUE CES TÉMOINS EXIGENT, sans relever le plafond :
 *   (1) toute liste tronquée imprime, à l'endroit de la troncature, le compte TOTAL et le compte
 *       AFFICHÉ, dérivés — le témoin les recompte dans la vue et dans le registre ;
 *   (2) elle nomme la vue où la liste complète se lit ;
 *   (3) le plafond est une constante nommée du générateur, importée ici, jamais retapée.
 * TÉMOIN À DEUX FACES : la vue régénérée est verte ; la même vue privée de son total, ou portant un
 * total recopié faux, fait sortir `plan-state:verifier` en code non nul en NOMMANT la rubrique.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decouper, PLAFOND_D_UNE_LISTE } from '../../../scripts/plan-state/build';

const PLAN = 'scripts/plan-state/build.ts';
const RUBRIQUE = 'Tâches';
/** La marque de troncature : `(N affichées sur M — liste complète : `docs/TASKS.md`)`. */
const MARQUE = /\((\d+) affichées sur (\d+) — liste complète : `docs\/TASKS\.md`\)/;

const bac = mkdtempSync(join(tmpdir(), 'troncature-'));
const forge = join(bac, 'forge.json');
writeFileSync(
  forge,
  JSON.stringify({
    prs: [],
    issues: '[]',
    main: { sha: 'abc1234', date: '2026-01-01T00:00:00+00:00' },
  })
);

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(PLAN), ...args, '--forge', forge],
    { encoding: 'utf8', maxBuffer: 64 * 2 ** 20 }
  );
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

function rendre(nom: string): { chemin: string; texte: string } {
  const chemin = join(bac, nom);
  const { code, sortie } = lancer('--out', chemin);
  expect(code, `le rendu a échoué : ${sortie}`).toBe(0);
  return { chemin, texte: readFileSync(chemin, 'utf8') };
}

const parStatut = (): Map<string, number> => {
  const m = new Map<string, number>();
  const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
    taches: { statut: string }[];
  };
  for (const t of doc.taches) m.set(t.statut, (m.get(t.statut) ?? 0) + 1);
  return m;
};

/** Les lignes du tableau « Tâches » : statut, nombre annoncé, détail. */
function lignesDuTableau(texte: string): { statut: string; nombre: number; detail: string }[] {
  const corps = decouper(texte).find((r) => r.titre === RUBRIQUE)?.corps ?? '';
  return [...corps.matchAll(/^\| `([a-z_]+)` \| (\d+) \| (.*) \|$/gm)].map((m) => ({
    statut: m[1]!,
    nombre: Number(m[2]),
    detail: m[3]!,
  }));
}

describe('REQ-GOV-032 — une liste tronquée de la vue dit son total, son affiché, et où lire le reste', () => {
  it('REQ-GOV-026 · FACE VERTE — au-delà du plafond, la ligne imprime le total et l’affiché, dérivés', () => {
    const { chemin, texte } = rendre('PLAN-STATE-troncature.md');
    const compte = parStatut();
    const lignes = lignesDuTableau(texte);
    const tronquees = lignes.filter((l) => l.nombre > PLAFOND_D_UNE_LISTE);
    expect(
      tronquees.length,
      `aucun statut ne dépasse le plafond (${PLAFOND_D_UNE_LISTE}) : ce témoin n'exerce pas la troncature`
    ).toBeGreaterThan(0);
    for (const l of tronquees) {
      const m = MARQUE.exec(l.detail);
      expect(
        m,
        `\`${l.statut}\` est tronquée sans le dire : « ${l.detail.slice(-80)} »`
      ).not.toBeNull();
      // L'AFFICHÉ est recompté dans la ligne : les identifiants avant la marque.
      const affiches = l.detail
        .slice(0, m!.index)
        .replace(/…\s*$/, '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
      expect(Number(m![1]), `\`${l.statut}\` : compte affiché`).toBe(affiches.length);
      expect(Number(m![1])).toBe(PLAFOND_D_UNE_LISTE);
      // LE TOTAL est recompté dans le registre, pas relu dans la vue.
      expect(Number(m![2]), `\`${l.statut}\` : total`).toBe(compte.get(l.statut) ?? 0);
      expect(Number(m![2])).toBe(l.nombre);
    }
    // Sous le plafond, rien n'est tronqué : pas de marque, pas de points de suspension.
    for (const l of lignes.filter((x) => x.nombre <= PLAFOND_D_UNE_LISTE)) {
      expect(l.detail, `\`${l.statut}\``).not.toMatch(MARQUE);
      expect(l.detail, `\`${l.statut}\``).not.toMatch(/…/);
    }
    const { code, sortie } = lancer('--verifier', '--out', chemin);
    expect(code, sortie).toBe(0);
  });

  it('REQ-GOV-026 · la liste du journal, tronquée elle aussi, dit son total et son affiché', () => {
    const { texte } = rendre('PLAN-STATE-journal.md');
    const corps = decouper(texte).find((r) => r.titre === 'Journal')?.corps ?? '';
    const rendues = (corps.match(/^### PR #\d+ — /gm) ?? []).length;
    const m =
      /^… (\d+) entrée\(s\) affichée\(s\) sur (\d+) ; les (\d+) plus ancienne\(s\) se lisent dans `docs\/journal\/`\.$/m.exec(
        corps
      );
    expect(m, `le journal est tronqué sans dire son total :\n${corps.slice(-300)}`).not.toBeNull();
    expect(Number(m![1])).toBe(rendues);
    expect(Number(m![3])).toBe(Number(m![2]) - Number(m![1]));
  });

  it('REQ-GOV-032 · FACE ROUGE — la même vue privée de son total sort 1 et NOMME la rubrique tronquée', () => {
    const { chemin, texte } = rendre('PLAN-STATE-sans-total.md');
    expect(MARQUE.test(texte), 'la marque de troncature doit exister pour qu’on la retire').toBe(
      true
    );
    writeFileSync(chemin, texte.replace(new RegExp(` ${MARQUE.source}`), ''));
    const { code, sortie } = lancer('--verifier', '--out', chemin);
    expect(code, `une troncature redevenue muette passe : ${sortie}`).toBe(1);
    expect(sortie).toContain(`rubrique « ${RUBRIQUE} »`);
  });

  it('REQ-GOV-032 · FACE ROUGE — un total RECOPIÉ à la main, faux d’une unité, sort 1 et nomme la rubrique', () => {
    const { chemin, texte } = rendre('PLAN-STATE-total-recopie.md');
    const m = MARQUE.exec(texte);
    expect(m).not.toBeNull();
    writeFileSync(
      chemin,
      texte.replace(m![0], m![0].replace(`sur ${m![2]}`, `sur ${Number(m![2]) + 1}`))
    );
    const { code, sortie } = lancer('--verifier', '--out', chemin);
    expect(code, `un total recopié faux passe : ${sortie}`).toBe(1);
    expect(sortie).toContain(`rubrique « ${RUBRIQUE} »`);
  });
});
