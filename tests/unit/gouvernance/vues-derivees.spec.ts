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

/**
 * ── LA CINQUIÈME VUE (GOV-035) ───────────────────────────────────────────────
 *
 * REQ-GOV-032 énumère CINQ vues générées. GOV-024 en a outillé quatre ; `docs/PLAN-STATE.md`
 * était la seule à n'avoir qu'un GÉNÉRATEUR — `pnpm plan-state:build` écrit, et rien ne comparait.
 *
 * CE QUI L'A FAIT ÉCRIRE, MESURÉ. Une lentille a falsifié quinze lignes de la vue en gardant
 * toutes ses ancres — « 29/36 » → « 36/36 », « reste 4.00 j » → « 0.00 », « 2 tâche(s)
 * bloquée(s) » → « 0 » — donc sans toucher un seul titre de rubrique ni une seule barre de
 * tableau. **Huit vérificateurs de Gate A sont restés verts**, et `plan-state-frais.spec.ts`
 * 25/25 : il vérifie que les rubriques SONT LÀ, jamais ce qu'elles disent. La famille
 * `plan_state_perime` de `gov:etat`, elle, compare une DATE DE COMMIT — un fichier falsifié puis
 * recommité est plus « frais » que le vrai.
 *
 * CE QUE LE VÉRIFICATEUR COMPARE, ET CE QU'IL NE PEUT PAS COMPARER. Cette vue-ci n'a pas que des
 * sources suivies par git : elle porte aussi le SHA d'`origin/main`, la file des PR ouvertes et
 * les labels `owner:` des issues. Comparer le fichier ENTIER mesurerait la disponibilité de `gh`
 * et l'âge de `main` — la garde serait rouge après chaque fusion, chez tout le monde, et on
 * apprendrait à la sauter (RM-02 ; le motif est déjà écrit dans `gov-trace.ts` : « si son contenu
 * dépendait d'un appel réseau, `--verifier` mesurerait la disponibilité de `gh` »). Le périmètre
 * comparé est donc celui des rubriques DÉRIVÉES DE FICHIERS SUIVIS ; il est DÉCLARÉ dans le
 * script, la sortie verte le NOMME, et une rubrique qui n'appartiendrait à aucune des deux listes
 * fait ROUGIR — sans quoi la couverture se périmerait en silence à la première rubrique ajoutée.
 */
describe('REQ-GOV-032 — docs/PLAN-STATE.md est comparée à ses sources (GOV-035)', () => {
  const PLAN = 'scripts/plan-state/build.ts';

  /** Rend la vue dans le bac à sable. Le `docs/PLAN-STATE.md` du dépôt n'est JAMAIS écrit. */
  function rendrePlanState(nom: string): string {
    const chemin = join(bac, nom);
    const { code, sortie } = lancer(PLAN, '--out', chemin);
    expect(code, `le rendu de ${PLAN} a échoué : ${sortie}`).toBe(0);
    expect(existsSync(chemin), `\`--out\` n'a pas écrit dans le bac : ${sortie}`).toBe(true);
    return chemin;
  }

  /**
   * LA FALSIFICATION MESURÉE PAR LA LENTILLE, rejouée : les COMPTEURS changent, les ANCRES
   * restent. Aucun titre, aucune barre de tableau, aucune puce n'est touchée.
   */
  function falsifierLesCompteurs(texte: string): { faux: string; appliquees: number } {
    // Chaque règle INCRÉMENTE le compteur qu'elle vise plutôt que d'y écrire une valeur choisie :
    // « 36/36 » ne falsifie plus rien le jour où la phase est terminée, et « 0 bloquée » ne
    // falsifie rien s'il n'y en a aucune. Un témoin dont la mutation dépend de l'état du dépôt
    // devient vert tout seul, un jour, sans que rien ne le dise.
    const regles: [RegExp, (...g: string[]) => string][] = [
      [
        /^(\d+)\/(\d+) tâches terminées · reste ([\d.]+) j estimés\.$/m,
        (_m, a, b, j) => `${Number(a) + 1}/${b} tâches terminées · reste ${(Number(j) + 1).toFixed(2)} j estimés.`,
      ],
      [
        /^(\| Où en est la phase \? \| phase -?\d+ — )(\d+)(\/\d+ tâches, reste )([\d.]+)( j \|)$/m,
        (_m, tete, a, milieu, j, queue) => `${tete}${Number(a) + 1}${milieu}${(Number(j) + 1).toFixed(2)}${queue}`,
      ],
      [
        /^(\| Ce qui bloque \| )(\d+)( tâche\(s\) bloquée\(s\))/m,
        (_m, tete, n, queue) => `${tete}${Number(n) + 1}${queue}`,
      ],
    ];
    let faux = texte;
    let appliquees = 0;
    for (const [re, par] of regles) {
      const suivant = faux.replace(re, par as never);
      if (suivant !== faux) appliquees++;
      faux = suivant;
    }
    return { faux, appliquees };
  }

  it('REQ-GOV-032 · CONTRE-TÉMOIN : une vue FRAÎCHEMENT rendue est déclarée égale à ses sources', () => {
    const vue = rendrePlanState('PLAN-STATE-frais.md');
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(sortie).toContain('✅');
    expect(code, `une vue rendue à l'instant est jugée périmée : ${sortie}`).toBe(0);
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : la vue COMMITÉE du dépôt est égale à ce que ses sources produisent', () => {
    const { code, sortie } = lancer(PLAN, '--verifier');
    expect(sortie).toContain('✅');
    expect(code, `docs/PLAN-STATE.md a dérivé de ses sources : ${sortie}`).toBe(0);
  });

  it('REQ-GOV-032 · TÉMOIN : les compteurs falsifiés, TOUTES ANCRES CONSERVÉES, sortent 1', () => {
    const vue = rendrePlanState('PLAN-STATE-faux-compteurs.md');
    const rendu = readFileSync(vue, 'utf8');
    const { faux, appliquees } = falsifierLesCompteurs(rendu);
    expect(
      appliquees,
      'une des trois falsifications n’a pas mordu : le témoin exerce moins que ce qu’il annonce'
    ).toBe(3);
    expect(faux, 'le témoin n’a rien falsifié : il ne prouve rien').not.toBe(rendu);
    // L'ANCRE EST INTACTE — c'est toute la propriété : les huit vérificateurs de Gate A qui
    // regardent les titres sont restés verts sur exactement cette mutation.
    const titres = (t: string) => t.split('\n').filter((l) => l.startsWith('## '));
    expect(titres(faux), 'le témoin a bougé une ancre : il n’exerce plus la cécité mesurée').toEqual(titres(rendu));
    writeFileSync(vue, faux);

    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `une vue falsifiée est déclarée conforme : ${sortie}`).toBe(1);

    // Le message NOMME l'écart en unités du domaine (REQ-GOV-032) : des TÂCHES, des JOURS.
    expect(sortie, `l'écart n'est pas nommé en tâches : ${sortie}`).toMatch(/tâche/);
    expect(sortie, '« les deux fichiers diffèrent » n’apprend rien à qui lit un journal de CI').not.toMatch(
      /les deux fichiers diff/i
    );
    // Et il dit quoi taper : une garde qui constate sans dire quoi faire devient un avertissement.
    expect(sortie).toContain('plan-state:build');

    // Les DEUX comptes sont cités — celui du disque et celui de la source.
    const trouve = /^(\d+)\/(\d+) tâches terminées/m.exec(rendu);
    expect(trouve, 'la vue rendue ne porte pas le compte de phase attendu').not.toBeNull();
    const n = nombresCites(sortie);
    expect(n, `le message ne cite pas le compte de la SOURCE (${trouve![1]}) : ${sortie}`).toContain(
      Number(trouve![1])
    );
    expect(
      n,
      `le message ne cite pas le compte FALSIFIÉ du disque (${Number(trouve![1]) + 1}) : ${sortie}`
    ).toContain(Number(trouve![1]) + 1);
  });

  it('REQ-GOV-032 · TÉMOIN : UNE SEULE ligne falsifiée — le compte des tâches bloquées — suffit', () => {
    const vue = rendrePlanState('PLAN-STATE-une-ligne.md');
    const rendu = readFileSync(vue, 'utf8');
    const faux = rendu.replace(
      /^(\| Ce qui bloque \| )(\d+)( tâche\(s\) bloquée\(s\))/m,
      (_m, tete: string, n: string, queue: string) => `${tete}${Number(n) + 1}${queue}`
    );
    expect(faux, 'aucune ligne « Ce qui bloque » dans la vue : le témoin ne falsifie rien').not.toBe(rendu);
    writeFileSync(vue, faux);
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `une ligne falsifiée passe : ${sortie}`).toBe(1);
    expect(sortie, `l'écart n'est pas nommé en tâches bloquées : ${sortie}`).toMatch(/bloqu/i);
  });

  it('REQ-GOV-032 · la comparaison est OCTET PAR OCTET, pas par LONGUEUR', () => {
    // 🔴 CE TÉMOIN MUTAIT UN TITRE, et rougissait donc par `rubrique_manquante` — jamais par la
    // comparaison d'octets qu'il prétend éprouver. A10 · mutation l'a prouvé sur la PR #36 :
    // remplacer `surPlace.corps === r.corps` par une comparaison de LONGUEURS laissait les dix cas
    // VERTS. Un témoin qui rougit par une AUTRE famille que la sienne ne garde rien.
    // Il mute désormais le CORPS d'une rubrique comparée, à longueur constante, et il exige la
    // famille `vue_perimee` en plus du code de sortie.
    const vue = rendrePlanState('PLAN-STATE-longueur-constante.md');
    const rendu = readFileSync(vue, 'utf8');
    // La mutation vit DANS le corps d'une rubrique comparée — `## Tâches` — et nulle part ailleurs :
    // une bascule de casse sur une seule lettre, donc longueur strictement constante.
    const debut = rendu.indexOf('## Tâches');
    expect(debut, 'la rubrique `## Tâches` doit exister pour que ce témoin ait un sujet').toBeGreaterThan(-1);
    const suite = rendu.indexOf('\n## ', debut + 1);
    const corpsRubrique = rendu.slice(debut + 12, suite);
    const lettre = /[a-zé]/.exec(corpsRubrique);
    expect(lettre, 'il faut une lettre à basculer dans le corps de la rubrique').not.toBeNull();
    const pos = debut + 12 + lettre!.index;
    const faux = rendu.slice(0, pos) + rendu[pos]!.toUpperCase() + rendu.slice(pos + 1);
    expect(faux.length, 'le témoin doit garder la MÊME longueur, sinon il ne prouve rien').toBe(rendu.length);
    expect(faux, 'le témoin doit vraiment différer').not.toBe(rendu);
    // Aucun titre ne bouge : la structure est intacte des deux côtés.
    const titres = (t: string) => t.split('\n').filter((l) => l.startsWith('## ')).join('|');
    expect(titres(faux), 'le témoin ne doit PAS toucher aux titres, sinon il rougit par la structure').toBe(titres(rendu));
    writeFileSync(vue, faux);
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `une dérive à longueur constante DOIT sortir 1 : ${sortie}`).toBe(1);
    expect(sortie, "c'est la comparaison d'OCTETS qui doit tirer, pas la structure").toMatch(/vue_perimee/);
    expect(sortie, 'aucune rubrique ne manque ni n’est en trop dans ce témoin').not.toMatch(/rubrique_(manquante|en_trop)/);
  });

  it('REQ-GOV-032 · une rubrique que le générateur ne produit PAS fait rougir, et elle est NOMMÉE', () => {
    // 🔴 CE TÉMOIN S'APPELAIT « rubrique INCONNUE du périmètre ». La famille `rubrique_non_classee`
    // n'existe plus : depuis que `comparee` se DÉRIVE (« ni volatile, ni le bloc de reprise »),
    // aucune rubrique n'est inconnue — une rubrique neuve est COMPARÉE. A10 · mutation avait montré
    // que ce témoin tirait de toute façon par `rubrique_en_trop`, quel que soit le classement :
    // il ne mesurait donc pas ce que son nom annonçait. Il dit maintenant ce qu'il fait.
    const vue = rendrePlanState('PLAN-STATE-rubrique-inconnue.md');
    writeFileSync(vue, readFileSync(vue, 'utf8') + '\n## Rubrique inventée à la main\n\nrien.\n');
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `une rubrique hors périmètre passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/rubrique_en_trop/);
    expect(sortie).toMatch(/Rubrique inventée à la main/);
  });

  it('REQ-GOV-032 · l’écart est nommé EN UNITÉS DU DOMAINE — le témoin exclusif de cette couche', () => {
    // 🔴 A10 · mutation, PR #36 : désarmer TOUTE la couche des mesures du domaine
    // (`else if (vu !== valeur)` → `else if (false)`) laissait les dix cas VERTS. C'est pourtant
    // l'exigence CENTRALE de REQ-GOV-032 : « l'écart est nommé en unités du domaine — nombre de
    // tâches livrées, nombre d'exigences — et non "les deux fichiers diffèrent" ».
    //
    // Le piège est qu'un chiffre falsifié fait AUSSI rougir la comparaison ligne à ligne : le code
    // de sortie ne discrimine donc rien. Ce témoin n'assert pas `code === 1` — il exige le MESSAGE
    // que seule cette couche sait produire. C'est la leçon « un témoin qui bouge pour deux raisons
    // ne discrimine rien », appliquée au témoin lui-même.
    const vue = rendrePlanState('PLAN-STATE-unites-du-domaine.md');
    const rendu = readFileSync(vue, 'utf8');
    const m = /(\d+)\/(\d+) tâches/.exec(rendu);
    expect(m, `la vue doit porter un compte de tâches : ${rendu.slice(0, 200)}`).not.toBeNull();
    const faux = rendu.replace(`${m![1]}/${m![2]} tâches`, `${m![2]}/${m![2]} tâches`);
    expect(faux, 'le témoin doit vraiment falsifier').not.toBe(rendu);
    writeFileSync(vue, faux);
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `un compteur falsifié DOIT sortir 1 : ${sortie}`).toBe(1);
    // L'ASSERTION QUI COMPTE : le nom du domaine, les deux valeurs, et la forme « dit X, produisent Y ».
    expect(sortie, "l'écart doit être nommé en TÂCHES, pas « les deux fichiers diffèrent »")
      .toMatch(new RegExp(`tâches terminées[^\n]*dit ${m![2]}[^\n]*produisent ${m![1]}`));
  });
  it('REQ-GOV-032 · la COUVERTURE est dérivée : le vert compte les rubriques, il ne les déclare pas', () => {
    // 🔴 A10 · mutation, PR #36 : retirer une rubrique du générateur faisait tomber la couverture
    // de 9 à 8 EN SILENCE, la garde annonçant « 8 rubrique(s) comparée(s) » sans que rien ne dise
    // qu'il en manquait une. La liste tapée est supprimée ; ce témoin fige le fait que le compte
    // est DÉRIVÉ du rendu — et il rougirait si quelqu'un le retapait.
    const vue = rendrePlanState('PLAN-STATE-couverture.md');
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(code, `la vue fraîche doit être verte : ${sortie}`).toBe(0);
    const m = /(\d+) rubrique\(s\) comparée\(s\)/.exec(sortie);
    expect(m, `le vert doit annoncer un compte de rubriques : ${sortie}`).not.toBeNull();
    const titres = readFileSync(vue, 'utf8').split('\n').filter((l) => l.startsWith('## '));
    const volatiles = ['File de fusion', 'Revendications', 'Décisions du jour', 'Prochain pas', 'Dernier atterrissage', 'REPRENDRE EN 30 SECONDES'];
    // +1 : la rubrique `(en-tête)`, le texte d'avant le premier `## `, qui est comparée aussi.
    const attendu = titres.filter((t) => !volatiles.includes(t.slice(3).trim())).length + 1;
    expect(Number(m![1]), 'le compte annoncé doit être celui des rubriques RÉELLEMENT comparées').toBe(attendu);
  });

  it('REQ-GOV-032 · une vue ABSENTE est un rouge qui le dit, jamais un vert par défaut', () => {
    const { code, sortie } = lancer(PLAN, '--verifier', '--out', join(bac, 'jamais-rendue.md'));
    expect(code).toBe(1);
    expect(sortie).toMatch(/absent/i);
  });

  it('REQ-GOV-032 · `--verifier` N’ÉCRIT PAS ce qu’il contrôle', () => {
    const vue = rendrePlanState('PLAN-STATE-non-ecrit.md');
    const { faux, appliquees } = falsifierLesCompteurs(readFileSync(vue, 'utf8'));
    expect(appliquees, 'rien n’a été falsifié : le témoin ne contrôle aucune réparation').toBe(3);
    writeFileSync(vue, faux);
    lancer(PLAN, '--verifier', '--out', vue);
    expect(readFileSync(vue, 'utf8'), 'le vérificateur a RÉPARÉ ce qu’il contrôle').toBe(faux);
  });

  it('REQ-GOV-032 · le VERT nomme ce qu’il n’a PAS comparé — un vert muet promet plus qu’il ne tient', () => {
    const vue = rendrePlanState('PLAN-STATE-perimetre.md');
    const { sortie } = lancer(PLAN, '--verifier', '--out', vue);
    expect(sortie).toContain('✅');
    // Les rubriques qui dépendent de `gh` et d'`origin/main` ne sont pas comparables ; le vert
    // le DIT, plutôt que de laisser croire qu'elles le sont.
    expect(sortie, 'le vert ne nomme pas les rubriques non comparées').toMatch(/File de fusion/);
    expect(sortie).toMatch(/Dernier atterrissage/);
  });

  it('REQ-GOV-032 · le rendu des rubriques COMPARÉES est déterministe : deux appels, les mêmes octets', () => {
    // Sans quoi le vérificateur mesurerait l'ordre d'un `Object.keys`, l'heure ou le fuseau.
    const rubriques = (t: string) =>
      t
        .split(/^## /m)
        .filter((s) =>
          /^(Phase courante|Tâches|Chemin critique|Bloquées|Questions ouvertes|Hypothèses|Journal|Dette déclarée)/.test(s)
        );
    const a = rubriques(readFileSync(rendrePlanState('det-plan-a.md'), 'utf8'));
    const b = rubriques(readFileSync(rendrePlanState('det-plan-b.md'), 'utf8'));
    expect(a.length, 'aucune rubrique déterministe trouvée : le témoin ne compare rien').toBeGreaterThan(4);
    expect(a).toEqual(b);
  });
});
