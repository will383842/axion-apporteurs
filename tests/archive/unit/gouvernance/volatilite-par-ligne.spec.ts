// @req REQ-GOV-032
/**
 * GOV-053 — le classement des vues est par RUBRIQUE, la volatilité est par LIGNE.
 *
 * LA MESURE QUI OUVRAIT LA TÂCHE (tour de revue de la PR 36) : réécrire, dans « Prochain pas », la
 * ligne qui énumère les tâches éligibles en « la phase -1 est TERMINEE, 39/39 taches, plus aucune
 * tache eligible », puis `pnpm plan-state:verifier` → EXIT 0. La rubrique lisait la forge pour
 * nommer la PR en tête de file, elle était donc exemptée EN ENTIER, et sa part dérivable de
 * `docs/tasks.json` seul sortait du contrôle avec le reste.
 *
 * REJOUÉE LE 2026-09-26 AVANT D'ÉCRIRE UNE LIGNE : EXIT 1. La PR 106 a déjà descendu
 * l'attribution des lectures de la rubrique à la ligne, et la ligne falsifiée est désormais
 * confrontée par sa PRÉSENCE. Ce qui manquait encore, et que ces témoins exigent :
 *   (a) l'écart se NOMME en unités du domaine — le nombre de tâches éligibles — et la ligne se
 *       désigne par CE QU'ELLE DÉRIVE, jamais par son rang (amendement du 2026-09-16) ;
 *   (b) la part VIVANTE de la même rubrique reste libre, et le vert le DIT ;
 *   (c) le vert annonce, rubrique par rubrique, les lignes RÉELLEMENT confrontées.
 *
 * La vue est rendue sous une FORGE FIGÉE (`--forge`) qui porte une PR fusionnable : sans elle, la
 * ligne vivante de « Prochain pas » n'existe que les jours où une PR est prête, et le témoin (b)
 * dépendrait de l'état de la file — le défaut que l'amendement du 2026-09-16 a retiré.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decouper } from '../../../scripts/plan-state/build';

const PLAN = 'scripts/plan-state/build.ts';
const RUBRIQUE = 'Prochain pas';
const PR_PRETE = 4242;

function lancerPlan(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve(PLAN), ...args],
    { encoding: 'utf8', maxBuffer: 64 * 2 ** 20 }
  );
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const bac = mkdtempSync(join(tmpdir(), 'volatilite-par-ligne-'));
const forge = join(bac, 'forge.json');
writeFileSync(
  forge,
  JSON.stringify({
    prs: [
      {
        number: PR_PRETE,
        headRefName: 't/essai',
        mergeStateStatus: 'CLEAN',
        isDraft: false,
        title: 'feat(ESSAI): une PR fusionnable',
      },
    ],
    issues: '[]',
    main: { sha: 'abc1234', date: '2026-01-01T00:00:00+00:00' },
  })
);

function rendre(nom: string): { chemin: string; texte: string } {
  const chemin = join(bac, nom);
  const { code, sortie } = lancerPlan('--out', chemin, '--forge', forge);
  expect(code, `le rendu de la vue a échoué : ${sortie}`).toBe(0);
  return { chemin, texte: readFileSync(chemin, 'utf8') };
}

const juger = (chemin: string) => lancerPlan('--verifier', '--out', chemin, '--forge', forge);

/** La ligne qui ÉNUMÈRE les tâches éligibles, reconnue par ce qu'elle dit — jamais par son rang. */
const LIGNE_DES_ELIGIBLES = /^.*tâche\(s\) éligible\(s\) en tout.*$/m;
/** La ligne VIVANTE de la rubrique : le numéro de la PR en tête de file, lu sur la forge. */
const LIGNE_DE_LA_PR_PRETE = new RegExp(`^\\*\\*Fusionner #${PR_PRETE}\\*\\*.*$`, 'm');

describe('REQ-GOV-032 — dans « Prochain pas », la volatilité est jugée à la LIGNE', () => {
  it('REQ-GOV-032 · (a) ROUGE — falsifier la part DÉRIVABLE sort 1 et nomme l’écart en tâches éligibles', () => {
    const { chemin, texte } = rendre('PLAN-STATE-eligibles-falsifies.md');
    expect(
      LIGNE_DES_ELIGIBLES.test(texte),
      "la ligne des tâches éligibles n'est plus rendue : ce témoin ne mesure plus rien"
    ).toBe(true);
    expect(
      LIGNE_DE_LA_PR_PRETE.test(texte),
      "la rubrique ne lit plus la forge : elle n'est plus un mélange, et le témoin ne mesure plus rien"
    ).toBe(true);
    // LA FALSIFICATION DE LA MESURE D'ORIGINE, mot pour mot : une fin de phase qui n'a pas eu lieu.
    writeFileSync(
      chemin,
      texte.replace(
        LIGNE_DES_ELIGIBLES,
        'la phase -1 est TERMINEE, 39/39 taches, plus aucune tache eligible'
      )
    );
    const { code, sortie } = juger(chemin);
    expect(
      code,
      `la liste des tâches éligibles réécrite à la main est restée verte : ${sortie}`
    ).toBe(1);
    // EN UNITÉS DU DOMAINE (REQ-GOV-032) : le nombre de tâches éligibles, pas « une ligne diffère ».
    expect(sortie).toMatch(/tâches éligibles en phase courante : introuvable dans la vue/);
    // ET LA LIGNE SE DÉSIGNE PAR CE QU'ELLE DÉRIVE, pas par sa position dans la rubrique.
    expect(sortie).toContain('la liste des tâches éligibles, dérivée de `docs/tasks.json` seul');
    expect(sortie).not.toMatch(/deuxième ligne|première ligne|ligne n°/);
  });

  it('REQ-GOV-032 · (a) ROUGE — changer le seul COMPTE des éligibles sort 1, et le compte est nommé', () => {
    const { chemin, texte } = rendre('PLAN-STATE-compte-des-eligibles.md');
    const m = /(\d+) tâche\(s\) éligible\(s\) en tout/.exec(texte);
    expect(m, 'le compte des tâches éligibles doit être rendu').not.toBeNull();
    const vrai = Number(m![1]);
    writeFileSync(chemin, texte.replace(m![0], `${vrai + 1} tâche(s) éligible(s) en tout`));
    const { code, sortie } = juger(chemin);
    expect(code, `un compte d'éligibles faux est resté vert : ${sortie}`).toBe(1);
    expect(sortie).toContain(
      `tâches éligibles en phase courante : la vue sur le disque dit ${vrai + 1}, ses sources produisent ${vrai}`
    );
  });

  it('REQ-GOV-032 · (b) VERT — falsifier la part VIVANTE de la même rubrique reste vert, et le vert le DIT', () => {
    const { chemin, texte } = rendre('PLAN-STATE-part-vivante.md');
    expect(LIGNE_DE_LA_PR_PRETE.test(texte)).toBe(true);
    writeFileSync(
      chemin,
      texte.replace(`**Fusionner #${PR_PRETE}**`, `**Fusionner #${PR_PRETE + 1}**`)
    );
    const { code, sortie } = juger(chemin);
    expect(code, `la part vivante est comparée — elle mesurerait la forge : ${sortie}`).toBe(0);
    // UN VERT MUET PROMET PLUS QU'IL NE TIENT : la rubrique, ce qui y est libre, et pourquoi.
    const m = new RegExp(
      `« ${RUBRIQUE} » : (\\d+) ligne\\(s\\) CONFRONTÉE\\(S\\), (\\d+) ligne\\(s\\) LIBRE\\(S\\) — ([^\\n]*)`
    ).exec(sortie);
    expect(
      m,
      `le vert ne dit plus ce qui est libre dans « ${RUBRIQUE} » : ${sortie}`
    ).not.toBeNull();
    expect(Number(m![2]), 'la ligne vivante doit être déclarée libre').toBeGreaterThan(0);
    expect(m![3]).toContain('le numéro de la PR en tête de file');
  });

  it('REQ-GOV-032 · (c) le vert compte les lignes RÉELLEMENT confrontées, rubrique par rubrique', () => {
    const { chemin, texte } = rendre('PLAN-STATE-compte-par-ligne.md');
    const { code, sortie } = juger(chemin);
    expect(code, sortie).toBe(0);
    // Le compte se confronte à la VUE, jamais à une liste déclarée : les lignes non vides de la
    // rubrique sont soit confrontées, soit libres, et rien d'autre.
    const corps = decouper(texte).find((r) => r.titre === RUBRIQUE)?.corps ?? '';
    const nonVides = corps.split('\n').filter((l) => l !== '').length;
    const m = new RegExp(
      `« ${RUBRIQUE} » : (\\d+) ligne\\(s\\) CONFRONTÉE\\(S\\), (\\d+) ligne\\(s\\) LIBRE\\(S\\)`
    ).exec(sortie);
    expect(m, sortie).not.toBeNull();
    expect(Number(m![1]) + Number(m![2])).toBe(nonVides);
    expect(Number(m![1]), 'la part dérivable doit être confrontée').toBeGreaterThan(0);
    // Et la somme des rubriques est le total annoncé : un seul compte, deux lectures.
    const parRubrique = [
      ...sortie.matchAll(
        /« [^»]+ » : (\d+) ligne\(s\) CONFRONTÉE\(S\), \d+ ligne\(s\) LIBRE\(S\)/g
      ),
    ].reduce((s, x) => s + Number(x[1]), 0);
    const total = /(\d+) ligne\(s\) non vide\(s\) COMPARÉE\(S\) sur \d+/.exec(sortie);
    expect(total, sortie).not.toBeNull();
    expect(parRubrique).toBe(Number(total![1]));
  });
});
