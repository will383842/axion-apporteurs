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
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FAMILLES, BLOC_DE_REPRISE, decouper, question, proses, type Famille } from '../../../scripts/plan-state/build';
import { PLANCHER } from '../../../scripts/lot/avancement';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
    const { code, sortie } = lancer(
      TACHES,
      '--verifie-rendu',
      '--out',
      join(bac, 'jamais-rendue.md')
    );
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

  it('REQ-GOV-032 · la comparaison est OCTET PAR OCTET, pas par LONGUEUR — vu rougir sur une dérive à longueur CONSTANTE', () => {
    // 🔴 Trouvé par la lentille `mutation` le 2026-09-05. Remplacer la comparaison de contenu
    // par une comparaison de LONGUEUR laissait ce fichier entièrement VERT : les cinq témoins de
    // périmage RETIRENT tous du texte, donc changent tous la longueur, et aucun n'exerçait la
    // propriété que la garde revendique. Une garde peut être juste et son test aveugle : ce qui
    // est prouvé n'est pas ce que le code fait, c'est ce que les témoins font VARIER.
    // Celui-ci ne change QUE des octets, jamais leur nombre.
    const chemin = rendreDansLeBac(TACHES, 'longueur-constante.md');
    const rendu = readFileSync(chemin, 'utf8');
    const perime = rendu.replace('# Taches', '# taches');
    expect(perime.length, 'le témoin doit garder la MÊME longueur, sinon il ne prouve rien').toBe(
      rendu.length
    );
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
 * REQ-GOV-032 énumère CINQ vues générées ; `docs/PLAN-STATE.md` est la cinquième. Le témoin central
 * falsifie ses COMPTEURS en gardant toutes ses ancres — aucun titre de rubrique, aucune barre de
 * tableau — parce que c'est la falsification que les gardes qui regardent les titres ne voient pas.
 *
 * CE QUE LE VÉRIFICATEUR COMPARE. Tout, sauf ce que le générateur a LU HORS DU DÉPÔT pour l'écrire
 * — le SHA d'`origin/main`, la file des PR, les labels `owner:`. Comparer ces éléments mesurerait la
 * disponibilité de `gh` et l'âge de `main` : rouge après chaque fusion, et on apprendrait à sauter la
 * garde (RM-02). L'exemption est une PROVENANCE émise par le générateur, pas une liste tapée ; le
 * témoin « exemption portante » rend la vue sous deux forges et exige que tout ce qui change soit
 * exempté, et que tout ce qui est exempté change. Une exemption libère le CONTENU de sa zone, jamais
 * le droit d'atteindre ce qui l'entoure au rendu.
 */
describe('REQ-GOV-032 — docs/PLAN-STATE.md est comparée à ses sources (GOV-035)', () => {
  const PLAN = 'scripts/plan-state/build.ts';

  /**
   * LES FAMILLES VUES SE LISENT DANS LA SORTIE DU PROCESSUS, PAS DANS LE SOURCE.
   *
   * Le DERNIER témoin de ce bloc confronte `FAMILLES` à ce que ce lanceur a vu sortir, dans les deux
   * sens. Pourquoi pas un `--prove` comme les autres gardes : `--prove` compte les familles DANS le
   * processus qui les produit, et un second canal qui écrit `[x]` sans passer par ce compte, ou une
   * famille transtypée, lui échappe par construction. Seule l'observation de la SORTIE du vrai
   * processus le voit.
   *
   * Une ligne de refus est TOUTE ligne qui commence par `[…]`, quel que soit ce qu'il y a entre les
   * crochets : lire un alphabet (`[a-z_]`) laisserait passer un nom à tiret, à chiffre ou à majuscule.
   *
   * Il ne lance QUE ce script : `vue_perimee` est un nom que trois gates partagent, et un accumulateur
   * commun certifierait « vue rouge » une famille qu'aucun témoin de plan-state n'aurait tirée.
   */
  const famillesVues = new Set<string>();
  const vertsQuiRefusent: string[] = [];
  const famillesDe = (sortie: string): string[] => [...sortie.matchAll(/^[ \t]*\[([^\]\n]+)\]/gm)].map((m) => m[1]!);
  function lancerPlan(...args: string[]): { code: number; sortie: string } {
    const r = lancer(PLAN, ...args);
    const vues = famillesDe(r.sortie);
    for (const f of vues) famillesVues.add(f);
    if (r.code === 0 && vues.length > 0) vertsQuiRefusent.push(`${args.join(' ')} → [${vues.join('], [')}]`);
    return r;
  }

  /** Rend la vue dans le bac à sable. Le `docs/PLAN-STATE.md` du dépôt n'est JAMAIS écrit. */
  function rendrePlanState(nom: string, ...args: string[]): string {
    const chemin = join(bac, nom);
    const { code, sortie } = lancerPlan('--out', chemin, ...args);
    expect(code, `le rendu de ${PLAN} a échoué : ${sortie}`).toBe(0);
    expect(existsSync(chemin), `\`--out\` n'a pas écrit dans le bac : ${sortie}`).toBe(true);
    return chemin;
  }

  /** Les éléments qu'un vert déclare NON COMPARÉS, à un étage donné, lus dans sa sortie. */
  function exemptes(sortie: string, etage: 'rubriques' | 'lignes du bloc de reprise'): string[] {
    const ligne = new RegExp(`NON COMPARÉ — ${etage} : (.*)$`, 'm').exec(sortie)?.[1] ?? '';
    return [...ligne.matchAll(/«\s([^»]+?)\s»\s\(/g)].map((m) => m[1]!);
  }

  /**
   * LA FALSIFICATION QU'UNE GARDE DE STRUCTURE NE VOIT PAS : les COMPTEURS changent, les ANCRES
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
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(sortie).toContain('✅');
    expect(code, `une vue rendue à l'instant est jugée périmée : ${sortie}`).toBe(0);
  });

  it('REQ-GOV-032 · CONTRE-TÉMOIN : la vue COMMITÉE du dépôt est égale à ce que ses sources produisent', () => {
    const { code, sortie } = lancerPlan('--verifier');
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
    // L'ANCRE EST INTACTE — c'est toute la propriété : une garde qui regarde les titres ne voit rien.
    const titres = (t: string) => decouper(t).map((r) => r.titre);
    expect(titres(faux), 'le témoin a bougé une ancre : il n’exerce plus la cécité mesurée').toEqual(titres(rendu));
    writeFileSync(vue, faux);

    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
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
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une ligne falsifiée passe : ${sortie}`).toBe(1);
    expect(sortie, `l'écart n'est pas nommé en tâches bloquées : ${sortie}`).toMatch(/bloqu/i);
  });

  it('REQ-GOV-032 · la comparaison est OCTET PAR OCTET, pas par LONGUEUR', () => {
    // Un témoin qui rougit par une AUTRE famille que la sienne ne garde rien : muter un titre
    // rougirait par `rubrique_manquante`, jamais par la comparaison d'octets. Il mute donc le CORPS
    // d'une rubrique comparée, à longueur constante, et il exige la famille `vue_perimee`.
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
    const titres = (t: string) => decouper(t).map((r) => r.titre).join('|');
    expect(titres(faux), 'le témoin ne doit PAS toucher aux titres, sinon il rougit par la structure').toBe(titres(rendu));
    writeFileSync(vue, faux);
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une dérive à longueur constante DOIT sortir 1 : ${sortie}`).toBe(1);
    expect(sortie, "c'est la comparaison d'OCTETS qui doit tirer, pas la structure").toMatch(/vue_perimee/);
    expect(sortie, 'aucune rubrique ne manque ni n’est en trop dans ce témoin').not.toMatch(/rubrique_(manquante|en_trop)/);
  });

  it('REQ-GOV-032 · une rubrique que le générateur ne produit PAS fait rougir, et elle est NOMMÉE', () => {
    // Depuis que `comparee` se DÉRIVE, aucune rubrique n'est « inconnue » : une rubrique neuve est
    // COMPARÉE. Ce témoin tire donc par `rubrique_en_trop`, et il le dit.
    const vue = rendrePlanState('PLAN-STATE-rubrique-inconnue.md');
    writeFileSync(vue, readFileSync(vue, 'utf8') + '\n## Rubrique inventée à la main\n\nrien.\n');
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une rubrique hors périmètre passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/rubrique_en_trop/);
    expect(sortie).toMatch(/Rubrique inventée à la main/);
  });

  it('REQ-GOV-032 · l’écart est nommé EN UNITÉS DU DOMAINE — le témoin exclusif de cette couche', () => {
    // L'exigence CENTRALE de REQ-GOV-032. Un chiffre falsifié fait AUSSI rougir la comparaison ligne
    // à ligne : le code de sortie ne discrimine donc rien, et désarmer toute la couche des mesures le
    // laisserait à 1. Ce témoin exige le MESSAGE que seule cette couche sait produire.
    const vue = rendrePlanState('PLAN-STATE-unites-du-domaine.md');
    const rendu = readFileSync(vue, 'utf8');
    const m = /(\d+)\/(\d+) tâches/.exec(rendu);
    expect(m, `la vue doit porter un compte de tâches : ${rendu.slice(0, 200)}`).not.toBeNull();
    const faux = rendu.replace(`${m![1]}/${m![2]} tâches`, `${m![2]}/${m![2]} tâches`);
    expect(faux, 'le témoin doit vraiment falsifier').not.toBe(rendu);
    writeFileSync(vue, faux);
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `un compteur falsifié DOIT sortir 1 : ${sortie}`).toBe(1);
    expect(sortie, "l'écart doit être nommé en TÂCHES, pas « les deux fichiers diffèrent »")
      .toMatch(new RegExp(`tâches terminées[^\n]*dit ${m![2]}[^\n]*produisent ${m![1]}`));
  });

  it('REQ-GOV-032 · CHAQUE rubrique annoncée comparée l’est vraiment, en-tête et dernière comprises — comptées SANS `decouper` (une rubrique disparue reste invisible : GOV-055)', () => {
    // L'ORACLE NE PASSE PAS PAR `decouper`. Un témoin qui importe la découpe perd, avec elle, ce
    // qu'elle cesse de rendre : une rubrique que `decouper` oublierait disparaîtrait du vérificateur
    // ET de l'attendu. Les titres se lisent donc ici dans ce que le générateur ÉCRIT — `titre()` pose
    // `## ` en colonne 0 — et le texte d'avant le premier titre est `(en-tête)`.
    //
    // ⚠️ Ce témoin ne voit PAS une rubrique que le générateur cesse d'écrire : l'oracle lit le même
    // rendu. Il y faut une source extérieure qui énumère les rubriques dues (GOV-055).
    const vue = rendrePlanState('PLAN-STATE-couverture.md');
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `la vue fraîche doit être verte : ${sortie}`).toBe(0);
    const m = /(\d+) rubrique\(s\) comparée\(s\) octet par octet sur (\d+)/.exec(sortie);
    expect(m, `le vert doit annoncer X rubriques comparées sur Y : ${sortie}`).not.toBeNull();
    const t = readFileSync(vue, 'utf8');
    const titres = ['(en-tête)', ...[...t.matchAll(/^## (.+)$/gm)].map((x) => x[1]!)].filter((x) => x !== BLOC_DE_REPRISE);
    expect(Number(m![2]), 'le vert ne compte pas toutes les rubriques que le générateur écrit').toBe(titres.length);
    const exemptees = exemptes(sortie, 'rubriques');
    const comparees = titres.filter((x) => !exemptees.includes(x));
    expect(Number(m![1]), 'le compte annoncé doit être celui des rubriques RÉELLEMENT comparées').toBe(comparees.length);

    // CHAQUE rubrique annoncée comparée est falsifiée d'une ligne, à la fin de son corps : chacune
    // doit être NOMMÉE par un écart. La position se lit dans le texte, pas dans `decouper`.
    const lignes = t.split('\n');
    const faux: string[] = [];
    let courante = '(en-tête)';
    const falsifier = () => { if (comparees.includes(courante)) faux.push(`falsification de ${courante}`); };
    for (const l of lignes.slice(0, -1)) {
      const h = /^## (.+)$/.exec(l);
      if (h) { falsifier(); courante = h[1]!; }
      faux.push(l);
    }
    falsifier();
    writeFileSync(vue, `${faux.join('\n')}\n`);
    const r = lancerPlan('--verifier', '--out', vue);
    expect(r.code, `des rubriques comparées falsifiées passent : ${r.sortie}`).toBe(1);
    const nommees = [...r.sortie.matchAll(/^\s*\[vue_perimee\] rubrique « (.+?) » :/gm)].map((x) => x[1]!);
    expect(nommees.sort(), 'rubrique(s) annoncée(s) comparée(s) dont la falsification n’est pas vue').toEqual([...comparees].sort());
  });

  it('RM-02 · famille rubrique_hors_ordre — le mensonge remonté EN TÊTE, dans une rubrique non comparée', () => {
    // Une rubrique EXEMPTÉE déplacée AU-DESSUS du bloc de reprise et farcie d'un ordre. Un mensonge
    // n'a pas besoin d'être dans une rubrique comparée : il lui suffit d'être LU EN PREMIER.
    const vue = rendrePlanState('PLAN-STATE-hors-ordre.md');
    const t = readFileSync(vue, 'utf8');
    const debut = t.indexOf('## Dernier atterrissage');
    expect(debut, 'la rubrique volatile doit exister pour qu’on puisse la déplacer').toBeGreaterThan(-1);
    const suite = t.indexOf('\n## ', debut + 1);
    const bloc = t.slice(debut, suite + 1);
    const sansElle = t.slice(0, debut) + t.slice(suite + 1);
    const ancre = sansElle.indexOf('## REPRENDRE EN 30 SECONDES');
    expect(ancre, 'le bloc de reprise doit exister : c’est ce qu’on veut coiffer').toBeGreaterThan(-1);
    const mensonge = bloc.replace(/\n\n/, '\n\n🛑 STOP — la phase -1 est TERMINÉE (39/39). Ne fusionne plus rien.\n\n');
    writeFileSync(vue, sansElle.slice(0, ancre) + mensonge + sansElle.slice(ancre));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `un ordre réarrangé passe — le mensonge est LU EN PREMIER : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/rubrique_hors_ordre/);
  });

  it('RM-02 · famille rubrique_dupliquee — la MÊME rubrique deux fois, la seconde mentant', () => {
    const vue = rendrePlanState('PLAN-STATE-rubrique-dupliquee.md');
    const t = readFileSync(vue, 'utf8');
    // AU MILIEU, jamais en fin de fichier : en fin de fichier, un témoin rougirait sur un décalage
    // de lignes vides, pas sur le doublon.
    writeFileSync(vue, t.replace('## Chemin critique', '## Bloquées\n\nmensonge.\n\n## Chemin critique'));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une rubrique dupliquée passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/rubrique_dupliquee/);
  });

  it('RM-02 · un titre INDENTÉ de trois espaces, ou fermé par des #, est un titre — posé dans une rubrique exemptée, il fait un doublon qui rougit', () => {
    // Pour CommonMark, ces deux lignes sont le titre « Tâches » : deux « Tâches » à l'écran. Chacune
    // doit tirer `rubrique_dupliquee` — pas une autre famille : un titre que `decouper` cesserait de
    // reconnaître tomberait dans la zone exemptée et rougirait par `structure_dans_une_exemption`,
    // ce qui cacherait qu'une rubrique n'est plus reconnue comme au rendu.
    const vue = rendrePlanState('PLAN-STATE-titre-indente.md');
    const { sortie: vert } = lancerPlan('--verifier', '--out', vue);
    const zone = exemptes(vert, 'rubriques')[0];
    expect(zone, `le vert doit exempter au moins une rubrique : ${vert.slice(0, 300)}`).toBeDefined();
    const t = readFileSync(vue, 'utf8');
    expect(t, 'la rubrique comparée `Tâches` doit exister pour qu’on la double').toContain('\n## Tâches\n');
    const echappees: string[] = [];
    for (const [k, titre] of ['   ## Tâches', '## Tâches ##'].entries()) {
      const chemin = join(bac, `PLAN-STATE-titre-indente-${k}.md`);
      writeFileSync(chemin, t.replace(`\n## ${zone}\n\n`, `\n## ${zone}\n\n${titre}\n\n| \`a_faire\` | 0 | mensonge |\n\n`));
      const { code, sortie } = lancerPlan('--verifier', '--out', chemin);
      if (code !== 1 || !/rubrique_dupliquee/.test(sortie)) echappees.push(`${JSON.stringify(titre)} dans « ${zone} » → code ${code}`);
    }
    expect(echappees, 'titre(s) que le rendu voit et que la garde ne voit pas comme un doublon').toEqual([]);
  });

  it('RM-02 · famille structure_dans_une_exemption — une zone exemptée n’atteint rien au rendu, dans aucune de ses trois formes', () => {
    // La règle est une AUTORISATION (`horsDeSaZone`) : `<` refusé partout, et tout début de ligne hors
    // d'une courte liste refusé. Ce témoin ne recopie pas la liste : il porte ce qu'elle REFUSE, dans
    // les TROIS formes de zone exemptée — le corps d'une rubrique, une ligne-question du bloc de
    // reprise, la prose du bloc de reprise.
    const vue = rendrePlanState('PLAN-STATE-structure.md');
    const { sortie: vert } = lancerPlan('--verifier', '--out', vue);
    const zone = exemptes(vert, 'rubriques')[0];
    const questionExemptee = exemptes(vert, 'lignes du bloc de reprise').find((q) => !/^prose n°\d+$/.test(q));
    expect(zone, `le vert doit exempter au moins une rubrique : ${vert.slice(0, 300)}`).toBeDefined();
    expect(questionExemptee, `le vert doit exempter au moins une ligne-question : ${vert.slice(0, 300)}`).toBeDefined();
    const t = readFileSync(vue, 'utf8');
    expect(t).toContain(`\n## ${zone}\n\n`);
    const p = '**Ce qu’on tape maintenant.**';
    expect(t, 'la prose du bloc doit exister pour qu’on la prolonge').toContain(p);
    const ligneQuestion = t.split('\n').find((l) => question(l) === questionExemptee);
    expect(ligneQuestion, `la ligne « ${questionExemptee} » doit exister pour qu’on la charge`).toBeDefined();
    const OUVRE = ' <details><summary>Détails</summary>';

    // (a) LE COMPLÉMENT DE L'AUTORISATION, EXHAUSTIVEMENT, dans le corps d'une rubrique exemptée. Les
    // débuts PERMIS sont gardés par les contre-témoins, qui lisent ce que le générateur écrit : un
    // début retiré les fait rougir. Un début AJOUTÉ ne se voit qu'ici : une ligne par caractère ASCII
    // imprimable qui n'est ni une lettre ni `|` (l'accent grave sous sa forme de clôture), une par
    // catégorie générale Unicode hors lettres, chacune suivie de ce qu'elle tenterait au rendu ; puis
    // `<` en milieu de ligne, devant une lettre, `!`, `/`, `?` et un blanc. Le compte d'écarts exigé est
    // le nombre de charges : une charge acceptée le fait tomber.
    const ascii = Array.from({ length: 95 }, (_, k) => String.fromCharCode(0x20 + k)).filter((c) => !/[A-Za-z|]/.test(c));
    const unicode = [
      0x0301, 0x0903, 0x20dd, 0x0663, 0x2160, 0x00b2, 0x203f, 0x2014, 0x2045, 0x2046, 0x00ab, 0x00bb, 0xff03, 0x2212, 0x20ac, 0x00b4,
      0x00b0, 0x00a0, 0x2003, 0x3000, 0x2028, 0x2029, 0x0009, 0x000b, 0x000c, 0x0085, 0x200b, 0x202e, 0xfeff, 0x00ad, 0xe000, 0x0378,
    ].map((c) => String.fromCodePoint(c));
    const charges = [
      ...[...ascii, ...unicode].map((c) => (c === '`' ? '```' : `${c}   ## Bloquées`)),
      ...[OUVRE, ' <!-- x', ' </p>', ' <?x', ' < x'].map((s) => `Texte courant${s}`),
    ];
    const cheminDebuts = join(bac, 'PLAN-STATE-structure-debuts.md');
    writeFileSync(cheminDebuts, t.replace(`\n## ${zone}\n\n`, `\n## ${zone}\n\n${charges.join('\n')}\n`));
    const debuts = lancerPlan('--verifier', '--out', cheminDebuts);
    expect(debuts.code, `des débuts refusés passent : ${debuts.sortie.slice(0, 2000)}`).toBe(1);
    expect(famillesDe(debuts.sortie).filter((f) => f !== 'structure_dans_une_exemption'), 'une charge tire une autre famille').toEqual([]);
    const ecarts = Number(/: (\d+) écart\(s\)\./.exec(debuts.sortie)?.[1]);
    expect(ecarts, `${charges.length} charges dans « ${zone} », ${ecarts} refusée(s) : une charge au moins est acceptée`).toBe(charges.length);

    // (b) LES DEUX AUTRES FORMES DE ZONE : la prose et une cellule exemptées du bloc de reprise, où la
    // ligne commence par un début permis et où seul `<` peut atteindre le reste.
    const cheminBloc = join(bac, 'PLAN-STATE-structure-bloc.md');
    const bloc = t.replace(p, `${p}${OUVRE}`).replace(ligneQuestion!, ligneQuestion!.replace(/ \|$/, `${OUVRE} |`));
    writeFileSync(cheminBloc, bloc);
    const r = lancerPlan('--verifier', '--out', cheminBloc);
    expect(r.code, `du HTML dans le bloc de reprise passe : ${r.sortie}`).toBe(1);
    expect(famillesDe(r.sortie), r.sortie).toEqual(['structure_dans_une_exemption', 'structure_dans_une_exemption']);
    expect(r.sortie, 'la cellule exemptée n’est pas contenue').toContain(`bloc de reprise, ligne « ${questionExemptee} »`);
    expect(r.sortie, 'la prose exemptée n’est pas contenue').toMatch(/bloc de reprise, prose n°\d+/);
  });

  it('RM-02 · famille fin_de_ligne_non_lf — un retour chariot dans une prose exemptée ne découpe rien en silence', () => {
    // CommonMark coupe aussi sur CR : la prose exemptée prolongée par un CR resterait UNE ligne pour la
    // garde et en deviendrait deux au rendu, la seconde hors de tout contrôle.
    const vue = rendrePlanState('PLAN-STATE-retour-chariot.md');
    const t = readFileSync(vue, 'utf8');
    const p = '**Ce qu’on tape maintenant.**';
    expect(t, 'la prose du bloc doit exister pour qu’on la prolonge').toContain(p);
    writeFileSync(vue, t.replace(p, `${p} suite.\r<!--`));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `un CR dans une zone exemptée passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/fin_de_ligne_non_lf/);
  });

  it('REQ-GOV-032 · la FORME du bloc de reprise est dérivée — une ligne exemptée ne change pas de place', () => {
    // Une ligne exemptée est libre de CONTENU, pas de PLACE : remontée au-dessus de l'en-tête du
    // tableau, elle en casse le rendu, lignes comparées comprises. Chaque question reste présente
    // des deux côtés — seule la forme peut tirer ici.
    const vue = rendrePlanState('PLAN-STATE-forme-du-bloc.md');
    const t = readFileSync(vue, 'utf8');
    const ligne = t.split('\n').find((l) => l.startsWith('| Où est `main` ?'));
    expect(ligne, 'la ligne « Où est `main` ? » doit exister pour qu’on la déplace').toBeDefined();
    writeFileSync(vue, t.replace(`${ligne}\n`, '').replace('| Question | Réponse |', `${ligne}\n| Question | Réponse |`));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une ligne déplacée dans le bloc passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/FORME du bloc/);
  });

  it('RM-02 · une prose SUPPLÉMENTAIRE dans le bloc rougit — le rang d’une prose est dérivé', () => {
    // Les proses se confrontent par RANG, sans préfixe déclaré : une prose de trop est un écart nommé.
    const vue = rendrePlanState('PLAN-STATE-prose-en-trop.md');
    const t = readFileSync(vue, 'utf8');
    const p = '**Ce qu’on tape maintenant.**';
    expect(t, 'la prose du bloc doit exister pour qu’on la double').toContain(p);
    writeFileSync(vue, t.replace(p, `${p} NE FUSIONNEZ PLUS RIEN.\n\n${p}`));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `deux proses passent : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/vue_perimee/);
    expect(sortie).toMatch(/prose n°2/);
  });

  it('RM-02 · famille rubrique_manquante — une rubrique produite par les sources, absente du disque', () => {
    const vue = rendrePlanState('PLAN-STATE-rubrique-manquante.md');
    const t = readFileSync(vue, 'utf8');
    const debut = t.indexOf('## Bloquées');
    const suite = t.indexOf('\n## ', debut + 1);
    expect(debut, 'la rubrique doit exister pour qu’on puisse la retirer').toBeGreaterThan(-1);
    writeFileSync(vue, t.slice(0, debut) + t.slice(suite + 1));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une rubrique absente du disque passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/rubrique_manquante/);
  });

  it('RM-02 · famille mesure_absente — une mesure du domaine introuvable dans la vue', () => {
    const vue = rendrePlanState('PLAN-STATE-mesure-absente.md');
    const t = readFileSync(vue, 'utf8');
    // On retire la LIGNE qui porte la mesure, pas seulement son chiffre : la mesure devient
    // introuvable au lieu d'être fausse, et c'est l'autre famille.
    const sansLigne = t.split('\n').filter((l) => !/^\| Ce qui bloque \|/.test(l)).join('\n');
    expect(sansLigne, 'le témoin doit vraiment retirer une ligne').not.toBe(t);
    writeFileSync(vue, sansLigne);
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une mesure absente passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/mesure_absente/);
  });

  it('RM-02 · famille ligne_de_reprise_dupliquee — la même question deux fois dans le bloc', () => {
    const vue = rendrePlanState('PLAN-STATE-ligne-dupliquee.md');
    const t = readFileSync(vue, 'utf8');
    writeFileSync(vue, t.replace('| Ce qui bloque', '| Ce qui bloque | mensonge |\n| Ce qui bloque'));
    const { code, sortie } = lancerPlan('--verifier', '--out', vue);
    expect(code, `une question dupliquée passe : ${sortie}`).toBe(1);
    expect(sortie).toMatch(/ligne_de_reprise_dupliquee/);
  });

  it('RM-02 · la population des MESURES est confrontée EN ENTIER, et elle porte chaque statut du barème', () => {
    // Le vert annonce `X/Y` : X les mesures lues dans le rendu, Y la population. Aucun littéral ici,
    // les deux nombres viennent de la sortie.
    //
    // ⚠️ CE QU'IL ATTRAPE, ET CE QU'IL N'ATTRAPE PAS — mesuré dans les deux sens :
    //   une regex qui CESSE DE CORRESPONDRE (la vue change de forme) → X tombe, Y reste → ROUGE ici ;
    //   une LECTURE RETIRÉE de la table → X et Y tombent ENSEMBLE → VERT ici. La valeur retirée reste
    //       comparée octet par octet dans sa rubrique ; seul son nom de domaine se perd. Comparer un
    //       générateur à lui-même ne voit pas ce qu'il a cessé de lire : c'est GOV-055.
    //
    // PAS DE PLANCHER : un seuil tapé sur la population que le témoin surveille est un COMPTE, pas une
    // COUVERTURE. À sa place, la seule part de la population qui a une source HORS de `build.ts` : une
    // mesure par statut de `PLANCHER`, lue dans la sortie.
    const { code, sortie } = lancerPlan('--verifier', '--out', rendrePlanState('PLAN-STATE-mesures.md'));
    expect(code, `la vue fraîche doit être verte pour que ce témoin ait un sens : ${sortie}`).toBe(0);
    const m = /(\d+)\/(\d+) mesure\(s\) du domaine CONFRONTÉES/.exec(sortie);
    expect(m, `le vert doit annoncer X/Y mesures : ${sortie.slice(0, 300)}`).not.toBeNull();
    expect(Number(m![1]), `${m![2]} mesures déclarées, ${m![1]} confrontées : une lecture ne correspond plus à la vue`).toBe(Number(m![2]));
    const confrontees = (/CONFRONTÉ — mesures du domaine : (.*)\.$/m.exec(sortie)?.[1] ?? '').split(' · ');
    const statutsSansMesure = Object.keys(PLANCHER).filter((s) => !confrontees.includes(`tâches \`${s}\``));
    expect(statutsSansMesure, 'statut(s) du barème qui ne sont plus une mesure du domaine').toEqual([]);
  });

  it('REQ-GOV-032 · une exemption est PORTANTE : sous une autre forge, tout ce qui change est exempté, et tout ce qui est exempté change', () => {
    // Les exemptions sont la PROVENANCE que le générateur émet en lisant la forge. Ce témoin garde les
    // deux faces de cette provenance, et ce que la forge a le droit d'écrire :
    //   (0) la vue rendue sous la forge B (sans GitHub lisible), jugée sous B, est VERTE — ce que le
    //       générateur écrit quand la lecture échoue respecte la règle des zones exemptées ;
    //   (1) la vue rendue sous la forge A, jugée sous la forge B, est VERTE — un élément comparé qui
    //       dépendrait de la forge rougirait ici. La forge A porte des valeurs HOSTILES (un titre de PR
    //       et une date qui ouvrent du HTML) : sans `neutraliser`, la vue A porterait `<` dans ses zones
    //       exemptées et rougirait ici aussi ;
    //   (2) chaque élément que ce vert exempte DIFFÈRE entre A et B — une lecture GRATUITE de la
    //       forge, posée pour sortir une rubrique du contrôle, laisse son texte identique et rougit ici ;
    //   (3) la forge A est LISIBLE, au format de `gh`, et chaque valeur texte qu'elle porte — titre,
    //       branche et état de PR, label `owner:` d'issue, SHA et date de `main` — commence par une
    //       indentation et porte `<`, un retour chariot, des sauts de ligne suivis d'un titre et
    //       d'ouvertures de bloc. Une valeur de la forge ne produit JAMAIS plus d'une ligne : sa marque
    //       de début et sa marque de fin sont sur la même. La vue A est verte sous A, et une vue fautive
    //       rend les MÊMES refus sous A et sous B : le verdict ne dépend pas de la forge.
    const forgeA = join(bac, 'forge-a.json');
    const forgeB = join(bac, 'forge-b.json');
    const hostile = (k: string) =>
      `    ## Suite MARQUE-DEBUT-${k} <details><summary>replie</summary>\r\n## Suite\n    <!--\n- ## Bloquées\n\`\`\`\nMARQUE-FIN-${k}`;
    // « Décisions du jour » n'est rendue non vide que le jour d'un ADR : la date de `main` le prend.
    const adr = readdirSync('docs/adr').filter((f) => /^\d{4}-.*\.md$/.test(f)).sort().at(-1)!;
    const jourAdr = spawnSync('git', ['log', '-1', '--format=%cI', '--', `docs/adr/${adr}`], { encoding: 'utf8' }).stdout.trim().slice(0, 10);
    const issues = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: { issue?: number | null }[] }).taches
      .map((x) => x.issue)
      .filter((n): n is number => typeof n === 'number')
      .map((number) => ({ number, labels: [{ id: 'LA_temoin', name: `owner:A01${hostile('label')}`, description: '', color: 'ededed' }] }));
    writeFileSync(forgeA, JSON.stringify({
      prs: [
        { number: 9001, headRefName: `t/temoin-a${hostile('branche')}`, mergeStateStatus: 'CLEAN', isDraft: false, title: `forge A${hostile('titre')}` },
        { number: 9002, headRefName: 't/temoin-b', mergeStateStatus: hostile('etat'), isDraft: false, title: 'forge A, seconde' },
      ],
      issues: JSON.stringify(issues),
      main: { sha: `aaaaaaa${hostile('sha')}`, date: `${jourAdr}T00:00:00+00:00${hostile('date')}` },
    }));
    writeFileSync(forgeB, JSON.stringify({ prs: [], issues: '', main: { sha: 'bbbbbbb', date: '2026-02-02T00:00:00+00:00' } }));
    const a = rendrePlanState('PLAN-STATE-forge-a.md', '--forge', forgeA);
    const b = rendrePlanState('PLAN-STATE-forge-b.md', '--forge', forgeB);

    const lignesA = readFileSync(a, 'utf8').split('\n');
    const coupees = ['titre', 'branche', 'etat', 'label', 'sha', 'date'].filter((k) => {
      const debut = lignesA.filter((l) => l.includes(`MARQUE-DEBUT-${k}`));
      const fin = lignesA.filter((l) => l.includes(`MARQUE-FIN-${k}`));
      return debut.length === 0 || debut.join('\n') !== fin.join('\n');
    });
    expect(coupees, '(3) valeur(s) de la forge absente(s) de la vue, ou écrite(s) sur plus d’une ligne').toEqual([]);
    expect(lignesA.join('\n'), '(3) la branche non vide de « Décisions du jour » n’est pas exercée').toContain(`docs/adr/${adr}`);

    const bSousB = lancerPlan('--verifier', '--out', b, '--forge', forgeB);
    expect(bSousB.code, `(0) la vue écrite sans GitHub lisible est refusée par sa propre règle : ${bSousB.sortie}`).toBe(0);

    const aSousA = lancerPlan('--verifier', '--out', a, '--forge', forgeA);
    expect(aSousA.code, `(3) la vue écrite sous une forge LISIBLE est refusée sous cette même forge : ${aSousA.sortie}`).toBe(0);

    const { code, sortie } = lancerPlan('--verifier', '--out', a, '--forge', forgeB);
    expect(code, `(1) un élément COMPARÉ dépend de la forge, ou la forge a écrit hors de sa zone : ${sortie}`).toBe(0);

    const rubriques = exemptes(sortie, 'rubriques');
    const lignesDuBloc = exemptes(sortie, 'lignes du bloc de reprise');
    expect(rubriques.length + lignesDuBloc.length, `le vert n'exempte rien : ce témoin ne prouve rien — ${sortie.slice(0, 300)}`).toBeGreaterThan(0);
    const tA = readFileSync(a, 'utf8');
    const tB = readFileSync(b, 'utf8');
    const corps = (t: string, titre: string) => decouper(t).find((r) => r.titre === titre)?.corps;
    const ligneDuBloc = (t: string, nom: string) => {
      const c = corps(t, BLOC_DE_REPRISE) ?? '';
      const rang = /^prose n°(\d+)$/.exec(nom);
      if (rang) return proses(c)[Number(rang[1]) - 1];
      return c.split('\n').find((l) => question(l) === nom);
    };
    const inertes = [
      ...rubriques.filter((r) => corps(tA, r) === corps(tB, r)).map((r) => `rubrique « ${r} »`),
      ...lignesDuBloc.filter((q) => ligneDuBloc(tA, q) === ligneDuBloc(tB, q)).map((q) => `ligne « ${q} »`),
    ];
    expect(inertes, '(2) exemption(s) dont le texte ne dépend PAS de la forge').toEqual([]);

    // (3) LE MÊME VERDICT, ROUGE COMPRIS : compteurs falsifiés et une ouverture de liste dans une
    // rubrique exemptée, jugés sous la forge qui a écrit la vue puis sous une forge illisible.
    const fautive = join(bac, 'PLAN-STATE-forge-a-fautive.md');
    writeFileSync(fautive, falsifierLesCompteurs(tA).faux.replace(`\n## ${rubriques[0]}\n\n`, `\n## ${rubriques[0]}\n\n- ## Bloquées\n`));
    const refus = (s: string) => s.split('\n').filter((l) => /^\s*\[/.test(l));
    const sousA = lancerPlan('--verifier', '--out', fautive, '--forge', forgeA);
    const sousB = lancerPlan('--verifier', '--out', fautive, '--forge', forgeB);
    expect(sousA.code, `(3) la vue fautive passe sous la forge lisible : ${sousA.sortie}`).toBe(1);
    expect(refus(sousA.sortie), '(3) le verdict d’une vue fautive dépend de la forge').toEqual(refus(sousB.sortie));
    expect(refus(sousA.sortie).some((l) => l.includes('[structure_dans_une_exemption]')), sousA.sortie).toBe(true);
  });

  it('REQ-GOV-032 · une vue ABSENTE est un rouge qui le dit, jamais un vert par défaut', () => {
    const { code, sortie } = lancerPlan('--verifier', '--out', join(bac, 'jamais-rendue.md'));
    expect(code).toBe(1);
    expect(sortie).toMatch(/absent/i);
  });

  it('REQ-GOV-032 · `--verifier` N’ÉCRIT PAS ce qu’il contrôle', () => {
    const vue = rendrePlanState('PLAN-STATE-non-ecrit.md');
    const { faux, appliquees } = falsifierLesCompteurs(readFileSync(vue, 'utf8'));
    expect(appliquees, 'rien n’a été falsifié : le témoin ne contrôle aucune réparation').toBe(3);
    writeFileSync(vue, faux);
    lancerPlan('--verifier', '--out', vue);
    expect(readFileSync(vue, 'utf8'), 'le vérificateur a RÉPARÉ ce qu’il contrôle').toBe(faux);
  });

  it('REQ-GOV-032 · le VERT nomme ce qu’il n’a PAS comparé — un vert muet promet plus qu’il ne tient', () => {
    const vue = rendrePlanState('PLAN-STATE-perimetre.md');
    const { sortie } = lancerPlan('--verifier', '--out', vue);
    expect(sortie).toContain('✅');
    // Les rubriques qui dépendent de `gh` et d'`origin/main` ne sont pas comparables ; le vert
    // le DIT, avec la source lue, plutôt que de laisser croire qu'elles le sont.
    expect(sortie, 'le vert ne nomme pas les rubriques non comparées').toMatch(/« File de fusion » \(lu dans `gh pr list`\)/);
    expect(sortie).toMatch(/« Dernier atterrissage » \(lu dans /);
  });

  it('REQ-GOV-032 · le rendu des rubriques COMPARÉES est déterministe : deux appels, les mêmes octets', () => {
    // Sans quoi le vérificateur mesurerait l'ordre d'un `Object.keys`, l'heure ou le fuseau.
    // La liste des rubriques comparées se DÉRIVE du vert : il énumère ce qu'il n'a pas comparé, donc
    // tout le reste EST comparé.
    const { sortie: vert } = lancerPlan('--verifier');
    const exemptees = new Set(exemptes(vert, 'rubriques'));
    expect(exemptees.size, 'le vert doit énumérer ce qu’il n’a pas comparé, sinon ce témoin dérive de rien').toBeGreaterThan(0);
    const rubriques = (t: string) => decouper(t).filter((r) => !exemptees.has(r.titre) && r.titre !== BLOC_DE_REPRISE);
    const a = rubriques(readFileSync(rendrePlanState('det-plan-a.md'), 'utf8'));
    const b = rubriques(readFileSync(rendrePlanState('det-plan-b.md'), 'utf8'));
    expect(a.length, 'aucune rubrique déterministe trouvée : le témoin ne compare rien').toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('REQ-GOV-032 · IMPORTER le module n’écrit ni ne juge rien — sinon le contre-témoin de la vue commitée jugerait ce que l’import vient d’écrire', () => {
    // Un processus qui ne fait QU'IMPORTER `build.ts`, lancé dans un répertoire à lui : ses sources y
    // sont copiées, `docs/PLAN-STATE.md` y porte une sentinelle, et aucun `--out` n'est passé — une
    // écriture vers le chemin par défaut, ou vers un chemin tapé, tombe donc sur la sentinelle. On
    // compare les OCTETS de tout le répertoire avant et après, et ceux de la vue du dépôt. Ce n'est
    // pas l'import de CETTE spec qu'on juge : lui s'exécute avant tout témoin, dans le dépôt.
    const ici = mkdtempSync(join(tmpdir(), 'plan-import-'));
    try {
      mkdirSync(join(ici, 'docs'));
      for (const f of ['docs/tasks.json', 'docs/DECISIONS.md']) copyFileSync(f, join(ici, f));
      writeFileSync(join(ici, 'docs/PLAN-STATE.md'), 'sentinelle : importer le module ne doit pas réécrire ce fichier\n');
      writeFileSync(join(ici, 'forge.json'), JSON.stringify({ prs: [], issues: '', main: { sha: 'ccccccc', date: '2026-03-03T00:00:00+00:00' } }));
      writeFileSync(join(ici, 'importe.ts'), `import(${JSON.stringify(pathToFileURL(resolve(PLAN)).href)}).catch((e) => { console.error(e); process.exit(1); });\n`);
      const octets = () => readdirSync(ici, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => `${join(e.parentPath, e.name)} ${readFileSync(join(e.parentPath, e.name)).toString('base64')}`)
        .sort();
      const avant = octets();
      const depot = readFileSync('docs/PLAN-STATE.md');
      const r = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'importe.ts', '--forge', 'forge.json'], { cwd: ici, encoding: 'utf8' });
      const sortie = (r.stdout ?? '') + (r.stderr ?? '');
      expect(r.status, `importer le module a échoué : ${sortie}`).toBe(0);
      expect(octets(), `importer le module a ÉCRIT dans son répertoire : ${sortie}`).toEqual(avant);
      expect(readFileSync('docs/PLAN-STATE.md').equals(depot), 'importer le module a réécrit la vue du dépôt').toBe(true);
      expect(sortie, 'importer le module a rendu ou jugé une vue').not.toMatch(/régénéré|plan-state:verifier/);
    } finally {
      rmSync(ici, { recursive: true, force: true });
    }
  });

  /**
   * LE DERNIER TÉMOIN DU BLOC — rien ne le suit, et c'est voulu : Vitest exécute dans l'ordre et
   * `famillesVues` se remplit au fur et à mesure. Il ne mesure pas la gate : il mesure LES AUTRES
   * TÉMOINS, sur ce qu'ils ont vu SORTIR.
   */
  it('RM-02 · CHAQUE famille déclarée a été VUE ROUGE dans une sortie, aucune sortie n’en porte d’autre, et aucun VERT n’en porte', () => {
    // La grammaire d'observation d'abord : toute ligne qui commence par `[…]` est une ligne de refus,
    // quel que soit son alphabet.
    expect(famillesDe('   [titre-non-vide] a\n[Nom2] b\n✅ vert [pas en tête]')).toEqual(['titre-non-vide', 'Nom2']);
    const population = [...FAMILLES].sort();
    expect(population.length, 'une population vide dirait toujours oui').toBeGreaterThan(0);
    const muettes = population.filter((f) => !famillesVues.has(f));
    expect(muettes, `famille(s) déclarées qu'AUCUN témoin n'a vues sortir : ${muettes.join(', ')}`).toEqual([]);
    // LA RÉCIPROQUE : une famille VUE et non déclarée est un transtypage ou un second canal qui a écrit.
    const inconnues = [...famillesVues].filter((f) => !population.includes(f as Famille));
    expect(inconnues, `famille(s) sorties du processus et ABSENTES de FAMILLES : ${inconnues.join(', ')}`).toEqual([]);
    // ET UN VERT N'EN PORTE AUCUNE : un canal qui écrit un refus pendant que la gate sort 0 imprime des
    // lignes `[x]` puis ✅, EXIT 0.
    expect(vertsQuiRefusent, 'sortie(s) VERTES portant une ligne de refus').toEqual([]);
  });
});
