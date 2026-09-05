// @req REQ-GOV-021
// @req REQ-GOV-032
/**
 * vues-derivees.spec.ts — une vue générée qui a dérivé de sa source doit ROUGIR (GOV-024).
 *
 * CE QUI A COÛTÉ CETTE TÂCHE. `pnpm gov:tasks` n'avait qu'un mode `--render` : rien ne comparait
 * `docs/TASKS.md` à `docs/tasks.json`. La PR #30 a fait passer vingt tâches à `fusionnee` dans la
 * source sans régénérer la vue, qui a continué d'en annoncer CINQ — quinze tâches d'écart, sur le
 * fichier qu'on ouvre justement pour savoir où en est le chantier. Aucune garde ne l'a vu ; trois
 * relecteurs l'ont vu, à la lecture. `docs/REQUIREMENTS.md`, elle, n'avait AUCUN générateur, alors
 * que son bandeau affirmait que « la cohérence des deux est tenue par `pnpm gov:requirements` ».
 *
 * CE QUE CE FICHIER EXERCE, ET POURQUOI CHAQUE CAS EXISTE :
 *
 *   1. LE CONTRE-TÉMOIN, d'abord. Sur le dépôt à jour, `--verifie-rendu` sort 0. Sans lui, le rouge
 *      ne prouve rien : une garde qui rougit sur tout rougit aussi sur le juste (RM-02, RM-11).
 *   2. LE TÉMOIN. Une vue périmée d'UNE SEULE tâche livrée sort 1. L'écart d'une seule unité est le
 *      cas limite : c'est lui qui dit si la garde compare, ou si elle se contente d'exister.
 *   3. LE MESSAGE. REQ-GOV-032 exige qu'il NOMME l'écart en unités du domaine — nombre de tâches
 *      livrées, nombre d'exigences — et non « les deux fichiers diffèrent », qui n'apprend rien à
 *      qui lit un journal de CI. Le test refuse donc explicitement cette formule.
 *   4. L'ABSENCE. Une vue absente est un ROUGE qui dit quoi taper, jamais un vert par défaut.
 *   5. LE DÉTERMINISME. Deux rendus du même état produisent le même octet : sans quoi
 *      `--verifie-rendu` mesurerait l'heure, l'ordre d'un `Object.keys` ou le fuseau de la machine.
 *   6. LA NON-ÉCRITURE. `--verifie-rendu` ne touche pas au disque — une garde qui répare ce qu'elle
 *      contrôle est toujours verte, et ne garde donc rien.
 *
 * AUCUN TOTAL N'EST ÉPINGLÉ. Les nombres de tâches et d'exigences sont LUS dans la sortie et
 * comparés entre eux ; un test qui figerait « 20 tâches livrées » rougirait à la prochaine clôture
 * sans que rien ne soit cassé.
 *
 * RIEN N'EST ÉCRIT DANS LE DÉPÔT. Les deux générateurs acceptent `--out <chemin>`, et tous les
 * témoins travaillent sur une COPIE en bac à sable : un test qui périme `docs/TASKS.md` pour de
 * vrai emporte le travail non commité de la session qui l'exécute.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TACHES = 'scripts/gates/gov-tasks.ts';
const EXIGENCES = 'scripts/gates/gov-requirements.ts';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

let bac = '';
beforeAll(() => {
  bac = mkdtempSync(join(tmpdir(), 'vues-derivees-'));
  return () => rmSync(bac, { recursive: true, force: true });
});

/** Rend la vue dans un bac à sable, et retourne son chemin. Le dépôt n'est jamais écrit. */
function rendreDansLeBac(script: string, nom: string): string {
  const chemin = join(bac, nom);
  const { code, sortie } = lancer(script, '--render', '--out', chemin);
  expect(sortie, `le rendu de ${script} a échoué : ${sortie}`).toContain('✅');
  expect(code).toBe(0);
  return chemin;
}

/** Les nombres cités par un message d'écart, dans l'ordre où ils sont écrits. */
function nombresCites(sortie: string): number[] {
  return [...sortie.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
}

describe('REQ-GOV-032 — docs/TASKS.md est comparée à docs/tasks.json', () => {
  it('REQ-GOV-032 · CONTRE-TÉMOIN : la vue commitée est égale à ce que sa source produit', () => {
    const { code, sortie } = lancer(TACHES, '--verifie-rendu');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-032 · TÉMOIN : une vue périmée d’UNE SEULE tâche livrée sort 1', () => {
    const vue = rendreDansLeBac(TACHES, 'TASKS.md');
    const rendu = readFileSync(vue, 'utf8');
    // On retire la marque de livraison d'UNE tâche, et d'une seule : la vue annonce alors une
    // tâche livrée de moins que la source. C'est exactement la dérive de la PR #30, à l'échelle 1.
    const perimee = rendu.replace(/ ✅ \*\*(fusionnee|deployee|verifiee)\*\*\n/, '\n');
    expect(perimee, 'aucune tâche livrée dans la vue : le témoin ne périme rien').not.toBe(rendu);
    writeFileSync(vue, perimee);

    const { code, sortie } = lancer(TACHES, '--verifie-rendu', '--out', vue);
    expect(code).toBe(1);

    // Le message NOMME l'écart en tâches LIVRÉES — l'unité du domaine (REQ-GOV-032) — et les deux
    // nombres qu'il cite diffèrent d'exactement 1, puisque le témoin n'a périmé qu'une tâche.
    expect(sortie, `l'écart n'est pas nommé en tâches livrées : ${sortie}`).toMatch(/tâche/);
    expect(sortie).toMatch(/livr/);
    const n = nombresCites(sortie);
    expect(n.length, `aucun nombre dans le message : ${sortie}`).toBeGreaterThanOrEqual(2);
    expect(
      n.some((a, i) => n.slice(i + 1).some((b) => Math.abs(a - b) === 1)),
      `le message ne cite pas deux comptes distants de 1 : ${sortie}`
    ).toBe(true);
  });

  it('REQ-GOV-032 · le message REFUSE « les deux fichiers diffèrent »', () => {
    const vue = rendreDansLeBac(TACHES, 'TASKS-2.md');
    writeFileSync(
      vue,
      readFileSync(vue, 'utf8').replace(/ ✅ \*\*(fusionnee|deployee|verifiee)\*\*\n/, '\n')
    );
    const { sortie } = lancer(TACHES, '--verifie-rendu', '--out', vue);
    expect(sortie).not.toMatch(/les deux fichiers diff/i);
    // Il dit AUSSI quoi taper : une garde qui constate sans dire quoi faire devient un
    // avertissement qu'on apprend à ignorer.
    expect(sortie).toContain('--render');
  });

  it('REQ-GOV-032 · une vue ABSENTE est un rouge qui le dit, jamais un vert par défaut', () => {
    const { code, sortie } = lancer(TACHES, '--verifie-rendu', '--out', join(bac, 'jamais-rendue.md'));
    expect(code).toBe(1);
    expect(sortie).toMatch(/absent/i);
  });

  it('REQ-GOV-032 · `--verifie-rendu` N’ÉCRIT PAS ce qu’il contrôle', () => {
    // Une garde qui répare ce qu'elle contrôle est toujours verte, et ne garde donc rien.
    const vue = rendreDansLeBac(TACHES, 'TASKS-3.md');
    const perimee = readFileSync(vue, 'utf8').replace(
      / ✅ \*\*(fusionnee|deployee|verifiee)\*\*\n/,
      '\n'
    );
    writeFileSync(vue, perimee);
    lancer(TACHES, '--verifie-rendu', '--out', vue);
    expect(readFileSync(vue, 'utf8')).toBe(perimee);
  });

  it("REQ-GOV-032 · la comparaison est OCTET PAR OCTET, pas par LONGUEUR — vu rougir sur une dérive à longueur CONSTANTE", () => {
    // 🔴 Trouvé par la lentille `mutation` le 2026-09-05. Remplacer la comparaison de contenu
    // par une comparaison de LONGUEUR laissait ce fichier entièrement VERT : les cinq témoins de
    // périmage RETIRENT tous du texte, donc changent tous la longueur, et aucun n'exerçait la
    // propriété que la garde revendique. Une garde peut être juste et son test aveugle : ce qui
    // est prouvé n'est pas ce que le code fait, c'est ce que les témoins font VARIER.
    // Celui-ci ne change QUE des octets, jamais leur nombre.
    const chemin = rendreDansLeBac(TACHES, 'longueur-constante.md');
    const rendu = readFileSync(chemin, 'utf8');
    const perime = rendu.replace('# Taches', '# taches');
    expect(perime.length, 'le témoin doit garder la MÊME longueur, sinon il ne prouve rien').toBe(rendu.length);
    expect(perime).not.toBe(rendu);
    writeFileSync(chemin, perime);
    const r = lancer(TACHES, '--verifie-rendu', '--out', chemin);
    expect(r.code, `une dérive à longueur constante DOIT sortir 1`).toBe(1);
    expect(r.sortie).toContain('vue_perimee');
  });

  it('REQ-GOV-032 · le rendu est DÉTERMINISTE : deux appels produisent le même octet', () => {
    const a = rendreDansLeBac(TACHES, 'det-a.md');
    const b = rendreDansLeBac(TACHES, 'det-b.md');
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });
});

describe('REQ-GOV-032 — docs/REQUIREMENTS.md a enfin un générateur, et il est comparé', () => {
  it('REQ-GOV-032 · CONTRE-TÉMOIN : la vue commitée est égale à docs/requirements.json rendu', () => {
    const { code, sortie } = lancer(EXIGENCES, '--verifie-rendu');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-032 · TÉMOIN : une vue périmée d’UNE exigence sort 1, l’écart NOMMÉ en exigences', () => {
    const vue = rendreDansLeBac(EXIGENCES, 'REQUIREMENTS.md');
    const lignes = readFileSync(vue, 'utf8').split('\n');
    const i = lignes.findIndex((l) => /^- \*\*REQ-[A-Z]+-\d+\*\*/.test(l));
    expect(i, 'aucune entrée d’exigence dans la vue rendue').toBeGreaterThan(0);
    lignes.splice(i, 2); // l'entrée et sa ligne `<br>`
    writeFileSync(vue, lignes.join('\n'));

    const { code, sortie } = lancer(EXIGENCES, '--verifie-rendu', '--out', vue);
    expect(code).toBe(1);
    expect(sortie).toMatch(/exigence/i);
    expect(sortie).not.toMatch(/les deux fichiers diff/i);
    expect(sortie).toContain('--render');
    const n = nombresCites(sortie);
    expect(
      n.some((a, k) => n.slice(k + 1).some((b) => Math.abs(a - b) === 1)),
      `le message ne cite pas deux comptes distants de 1 : ${sortie}`
    ).toBe(true);
  });

  it('REQ-GOV-032 · le bandeau ÉMIS par le générateur dit ce qu’il fait vraiment', () => {
    // Point 5 de `docs/PRESEANCE.md` §5 : le bandeau de la vue affirmait que « la cohérence des
    // deux est tenue par `pnpm gov:requirements` » alors qu'AUCUN contrôle ne comparait la vue à
    // sa source. Il est désormais ÉMIS par le générateur — donc il ne peut plus mentir sans que
    // le mode de vérification rougisse — et il nomme les deux commandes qui tiennent l'égalité.
    const texte = readFileSync(rendreDansLeBac(EXIGENCES, 'bandeau.md'), 'utf8');
    expect(texte).toContain('gov:requirements --render');
    expect(texte).toContain('gov:requirements --verifie-rendu');
  });

  it('REQ-GOV-032 · le rendu est DÉTERMINISTE : deux appels produisent le même octet', () => {
    const a = rendreDansLeBac(EXIGENCES, 'req-det-a.md');
    const b = rendreDansLeBac(EXIGENCES, 'req-det-b.md');
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });
});

describe('REQ-GOV-021 — les deux modes ne dégradent pas les gardes existantes', () => {
  it('REQ-GOV-021 · `gov:tasks` et `gov:requirements` restent verts en mode normal', () => {
    expect(lancer(TACHES).code).toBe(0);
    expect(lancer(EXIGENCES).code).toBe(0);
  });

  it('REQ-GOV-021 · les vues du dépôt existent — sans quoi la garde n’a rien à comparer', () => {
    expect(existsSync('docs/TASKS.md')).toBe(true);
    expect(existsSync('docs/REQUIREMENTS.md')).toBe(true);
    expect(statSync('docs/REQUIREMENTS.md').size).toBeGreaterThan(0);
  });
});
