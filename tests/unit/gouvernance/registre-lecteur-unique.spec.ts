// @req REQ-GOV-015
// @req REQ-GOV-021
/**
 * registre-lecteur-unique.spec.ts — un seul lecteur de `docs/DECISIONS.md` (GOV-027).
 *
 * LE DÉFAUT, MESURÉ LE 2026-09-04. Deux lecteurs du même registre, et ils ne lisaient pas la même
 * chose (RM-04) : `scripts/gates/gov-tasks.ts` reconnaissait une décision à la PREMIÈRE CELLULE
 * d'une ligne de tableau et acceptait les quatre familles d'identifiants du registre, tandis que
 * `scripts/lot/composer.ts` la cherchait par une expression régulière qui ne connaissait que deux
 * préfixes (`HYP-`, `DEC-`) et n'appliquait aucun alias de la §0. Trois conséquences, toutes
 * SILENCIEUSES — le composeur imprimait une raison plausible et personne ne la contestait :
 *
 *   (a) une tâche dont la décision est une DÉCISION DE WILL (`W6`, `W10`…) ou un ALIAS de la §0
 *       (`HYP-BEB-D2`, `DEC-BEB-A12`, `DEC-DM-013`…) était écartée pour « décision sans
 *       hypothèse », alors que sa décision est bel et bien déclarée au registre ;
 *   (b) trois identifiants cités dans une NOTE EN PROSE sous la §1 — une note qui explique
 *       précisément qu'ils ne bloquent PLUS, puisque `EXT-2` est descendue en §2 — étaient
 *       comptés comme bloquants ;
 *   (c) la §1 était ratissée ENTIÈRE, si bien qu'une décision TRANCHÉE y bloquait encore, alors
 *       que la §4 du registre prescrit de la faire descendre en §2.
 *
 * CE QUE CE FICHIER EXERCE. Un TÉMOIN PAR FAMILLE de défaut — chacun oppose le lecteur unique au
 * lecteur hérité, qui est conservé dans le module comme FIXTURE DE LA RÉGRESSION et n'est jamais
 * consulté pour juger — et des CONTRE-TÉMOINS : ce que le lecteur unique doit continuer de
 * refuser. Sans eux, un lecteur qui déclarerait tout codable passerait chaque témoin (RM-02).
 *
 * AUCUN TOTAL N'EST ÉPINGLÉ. Les identifiants cités ci-dessous sont ceux du registre réel, et
 * chaque assertion porte sur un identifiant NOMMÉ, jamais sur un décompte : un test qui figerait
 * « 21 tâches redevenues éligibles » rougirait le jour où Will tranche une décision de plus,
 * c'est-à-dire précisément le jour où tout va bien.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  lireRegistre,
  lireRegistreHerite,
  tachesRedevenuesEligibles,
  CHEMIN_REGISTRE,
} from '../../../scripts/lot/registre-decisions';

const TEXTE = readFileSync(CHEMIN_REGISTRE, 'utf8');
const registre = lireRegistre(TEXTE);
const herite = lireRegistreHerite(TEXTE);

const taches = (
  JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: { id: string; hyp: string[] }[] }
).taches;

/**
 * Les deux formes de lecture ad hoc du registre : le découpage de section par titre, et
 * l'expression régulière à deux préfixes. L'une ou l'autre dans du CODE signifie qu'un second
 * lecteur est revenu.
 */
const LECTURE_AD_HOC = /new RegExp\(`\^## |\(HYP\|DEC\)-\[A-Z0-9-\]\+/;

/** Retire commentaires de bloc et de ligne : une garde de CODE ne juge pas la prose qui l'explique. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('REQ-GOV-015 — le lecteur unique connaît les QUATRE familles d’identifiants', () => {
  it('REQ-GOV-015 · TÉMOIN (a) : une décision de Will (`W6`) est déclarée — le lecteur hérité l’ignorait', () => {
    expect(registre.estDeclaree('W6')).toBe(true);
    expect(herite.estDeclaree('W6')).toBe(false);
  });

  it('REQ-GOV-015 · TÉMOIN (a) : un ALIAS de la §0 résout vers son canonique', () => {
    // La §0 existe précisément pour cela : « ce tableau ne décide rien, il rend lisible par la
    // machine ce qui ne l'était que par un lecteur attentif ».
    expect(registre.canonique('HYP-BEB-D2')).toBe('HYP-W5');
    expect(registre.canonique('DEC-BEB-A12')).toBe('HYP-W6-BIS');
    expect(registre.canonique('DEC-DM-013')).toBe('HYP-E1-7');
    expect(registre.canonique('W2')).toBe('HYP-W2');
    expect(registre.canonique('W7')).toBe('HYP-W7');
    for (const a of ['HYP-BEB-D2', 'DEC-BEB-A12', 'DEC-DM-013', 'W2', 'W7']) {
      expect(registre.estCodable(a), `${a} résout vers une décision codable`).toBe(true);
    }
    // Les alias à préfixe `W` étaient invisibles au lecteur hérité, dont l'expression régulière
    // ne connaissait que `HYP-` et `DEC-`.
    expect(herite.estCodable('W7')).toBe(false);
  });

  it('REQ-GOV-015 · le lecteur hérité avait RAISON sur `DEC-BEB-A12`, mais pour la mauvaise raison', () => {
    // Il ne résolvait aucun alias ; il acceptait cet identifiant parce que la PROSE d'une cellule
    // de la §2 le mentionne (« absorbe `DEC-BEB-A12` »). C'est exactement le mécanisme qui lui
    // faisait tenir `HYP-D9` pour bloquant : lire au fil du texte au lieu de lire des lignes.
    // Un accord qui ne tient qu'au hasard d'une mention n'est pas un accord — il se défait au
    // premier remaniement de la phrase.
    expect(herite.estCodable('DEC-BEB-A12')).toBe(true);
    expect(registre.estCodable('DEC-BEB-A12')).toBe(true);
    expect(registre.canonique('DEC-BEB-A12')).toBe('HYP-W6-BIS');
  });

  it('REQ-GOV-015 · un identifiant CANONIQUE reste lui-même : l’alias ne renomme pas ce qui existe', () => {
    expect(registre.canonique('HYP-W5')).toBe('HYP-W5');
    expect(registre.canonique('EXT-2a')).toBe('EXT-2a');
  });
});

describe('REQ-GOV-015 — la frontière §1/§2 se lit sur les LIGNES DE TABLEAU, jamais sur la prose', () => {
  it('REQ-GOV-015 · TÉMOIN (b) : les identifiants d’une NOTE en prose ne bloquent rien', () => {
    // La note sous la §1 dit mot pour mot qu'`EXT-2` « n'est plus dans cette section : ses
    // questions ont toutes un défaut dans le registre (`HYP-D9`, `HYP-E1-30`, `HYP-D7`) ». Les y
    // lire comme bloquants, c'est faire dire à une note l'exact contraire de ce qu'elle écrit.
    for (const id of ['HYP-D9', 'HYP-E1-30', 'HYP-D7']) {
      expect(registre.estBloquante(id), `${id} est cité en PROSE, pas en ligne de tableau`).toBe(false);
      expect(registre.estCodable(id)).toBe(true);
      expect(herite.estBloquante(id), `le lecteur hérité tenait ${id} pour bloquant`).toBe(true);
    }
  });

  it('REQ-GOV-015 · une décision est déclarée par sa PREMIÈRE CELLULE, pas par une mention en cellule', () => {
    // `DEC-INT-002` n'est pas une ligne de la §1 : il est CITÉ dans la cellule de `W3`. Le lecteur
    // le résout par la §0 vers `W3` — et non en le déclarant lui-même bloquant.
    expect(registre.canonique('DEC-INT-002')).toBe('W3');
    expect(registre.decision('DEC-INT-002')?.id).toBe('W3');
  });
});

describe('REQ-GOV-015 — une décision TRANCHÉE ne bloque plus rien (§4 du registre)', () => {
  it('REQ-GOV-015 · TÉMOIN (c) : `W1`, tranchée le 2026-09-03, est en §1 et NE BLOQUE PLUS', () => {
    const d = registre.decision('W1');
    expect(d?.section).toBe(1);
    expect(d?.trancheeLe).toBe('2026-09-03');
    expect(registre.estBloquante('W1')).toBe(false);
    expect(registre.estCodable('W1')).toBe(true);
    // Le lecteur hérité ratissait la §1 entière : il ne lisait même pas ces identifiants,
    // et les écartait donc par l'autre bout — « décision sans hypothèse ».
    expect(herite.estCodable('W1')).toBe(false);
  });

  it('REQ-GOV-015 · les huit décisions de la §1 marquées tranchées sont toutes débloquées', () => {
    for (const id of ['W1', 'W3', 'W4', 'W6', 'W9', 'W11', 'W12', 'W13']) {
      expect(registre.decision(id)?.section, `${id} doit être lue en §1`).toBe(1);
      expect(registre.estBloquante(id), `${id} est tranchée : elle ne bloque plus`).toBe(false);
    }
  });

  it('REQ-GOV-015 · CONTRE-TÉMOIN : `EXT-2a`, NON tranchée, bloque toujours', () => {
    // Sans ce cas, un lecteur qui déclarerait tout codable passerait chacun des témoins ci-dessus.
    const d = registre.decision('EXT-2a');
    expect(d?.section).toBe(1);
    expect(d?.trancheeLe).toBeNull();
    expect(registre.estBloquante('EXT-2a')).toBe(true);
    expect(registre.estCodable('EXT-2a')).toBe(false);
    // Et son alias, `DEC-INT-004`, bloque avec elle : sinon la §0 serait une porte dérobée.
    expect(registre.estBloquante('DEC-INT-004')).toBe(true);
  });

  it('REQ-GOV-015 · le défaut jouait DANS LES DEUX SENS : `EXT-2a` ne bloquait rien', () => {
    // La seule décision qui bloque réellement porte le préfixe `EXT`, que l'expression régulière
    // du lecteur hérité ne connaissait pas. Il bloquait donc trois décisions qui ne bloquent pas
    // (`HYP-D9`, `HYP-D7`, `HYP-E1-30`) et laissait passer la seule qui bloque. Un lecteur faux
    // n'est pas « trop strict » ou « trop laxiste » : il est faux, et il l'est dans les deux sens.
    expect(herite.estBloquante('EXT-2a')).toBe(false);
    expect(registre.estBloquante('EXT-2a')).toBe(true);
  });

  it('REQ-GOV-015 · CONTRE-TÉMOIN : un identifiant jamais écrit reste NON DÉCLARÉ', () => {
    expect(registre.estDeclaree('HYP-JAMAIS-ECRITE')).toBe(false);
    expect(registre.estCodable('HYP-JAMAIS-ECRITE')).toBe(false);
    expect(registre.motif('HYP-JAMAIS-ECRITE')).toBe('decision_sans_hypothese');
  });

  it('REQ-GOV-015 · CONTRE-TÉMOIN : la §6 (affirmations invalidées) n’est pas un registre de décisions', () => {
    // Ses lignes de tableau ont une PREMIÈRE CELLULE en prose (« Le modèle `Invoice` existe… »).
    // Une lecture qui ratisserait les identifiants d'une cellule quelconque y trouverait `AFF-01`.
    expect(registre.estDeclaree('AFF-01')).toBe(false);
  });
});

describe('REQ-GOV-021 — un seul lecteur, importé par la garde ET par le composeur', () => {
  const MODULE = 'registre-decisions';

  it('REQ-GOV-021 · `scripts/gates/gov-tasks.ts` importe le lecteur unique', () => {
    expect(readFileSync('scripts/gates/gov-tasks.ts', 'utf8')).toContain(MODULE);
  });

  it('REQ-GOV-021 · `scripts/lot/composer.ts` importe le MÊME lecteur', () => {
    expect(readFileSync('scripts/lot/composer.ts', 'utf8')).toContain(MODULE);
  });

  it('REQ-GOV-021 · aucun des deux ne garde son expression régulière ad hoc — dans le CODE', () => {
    // C'est la forme exacte qui a coûté la tâche : `/\b(HYP|DEC)-[A-Z0-9-]+\b/` côté composeur.
    //
    // ⚠️ LA GARDE VISE LE CODE, PAS LA PROSE, et cette précaution est le fruit de son premier
    // rouge : elle attrapait le COMMENTAIRE qui explique le défaut, dans le fichier même qui le
    // corrige. Une garde lexicale trop large interdit l'explication qui protège — et pousse à
    // retirer l'explication plutôt que le défaut. Les commentaires sont donc retirés avant.
    for (const f of ['scripts/gates/gov-tasks.ts', 'scripts/lot/composer.ts']) {
      expect(sansCommentaires(readFileSync(f, 'utf8')), `${f} relit encore le registre pour son compte`)
        .not.toMatch(LECTURE_AD_HOC);
    }
  });

  it('REQ-GOV-021 · TÉMOIN : la garde ci-dessus rougit bien sur du CODE qui relit le registre', () => {
    // Sans ce cas, « aucun des deux ne porte la forme » serait indiscernable de « la garde ne
    // regarde rien ». On lui donne le code d'avant, et elle doit le voir.
    const codeDavant = [
      "const section = (n: number) =>",
      "  brut.split(new RegExp(`^## ${n}\\\\.`, 'm'))[1] ?? '';",
      "const ids = (t: string) => new Set(t.match(/\\b(HYP|DEC)-[A-Z0-9-]+\\b/g) || []);",
    ].join('\n');
    expect(sansCommentaires(codeDavant)).toMatch(LECTURE_AD_HOC);
  });

  it('REQ-GOV-021 · CONTRE-TÉMOIN : la même forme EN COMMENTAIRE reste permise', () => {
    const explication = '// la forme d’avant : /\\b(HYP|DEC)-[A-Z0-9-]+\\b/ sur le texte brut.\nconst x = 1;';
    expect(sansCommentaires(explication)).not.toMatch(LECTURE_AD_HOC);
  });

  it('REQ-GOV-021 · toute `hyp` du backlog est déclarée au registre — dans les deux sens', () => {
    // C'est l'invariant que `gov:tasks` tient (famille `hyp_hors_registre`) : le lecteur unique
    // doit le préserver, sans quoi le remède aurait cassé la garde qu'il devait unifier.
    const inconnues = [...new Set(taches.flatMap((t) => t.hyp))].filter((h) => !registre.estDeclaree(h));
    expect(inconnues).toEqual([]);
  });
});

describe('REQ-GOV-021 — le décompte des tâches redevenues éligibles est MESURÉ, pas supposé', () => {
  const ecarts = tachesRedevenuesEligibles(taches, TEXTE);

  it('REQ-GOV-021 · des tâches que le lecteur hérité écartait sont éligibles, et elles sont NOMMÉES', () => {
    expect(ecarts.length).toBeGreaterThan(0);
    for (const e of ecarts) {
      expect(e.id).toMatch(/^[A-Z]/);
      expect(e.motifHerite).toMatch(/decision_sans_hypothese|decision_bloquante_non_tranchee/);
      expect(e.decisions.length).toBeGreaterThan(0);
    }
  });

  it('REQ-GOV-021 · les trois familles de défaut sont chacune représentée dans l’écart', () => {
    const concernees = (id: string) => ecarts.filter((e) => e.decisions.includes(id));

    // (a) une DÉCISION DE WILL, préfixe que le lecteur hérité ne connaissait pas.
    expect(concernees('W6').length, 'famille (a) — décision de Will').toBeGreaterThan(0);
    expect(concernees('W6')[0]?.motifHerite).toBe('decision_sans_hypothese');

    // (b) un identifiant cité dans la NOTE EN PROSE sous la §1.
    expect(concernees('HYP-D9').length, 'famille (b) — note en prose').toBeGreaterThan(0);
    expect(concernees('HYP-D9')[0]?.motifHerite).toBe('decision_bloquante_non_tranchee');

    // (c) un ALIAS de la §0 qui résout vers une décision TRANCHÉE de la §1.
    expect(concernees('DEC-INT-002').length, 'famille (c) — alias vers une tranchée').toBeGreaterThan(0);
    expect(concernees('DEC-INT-002')[0]?.motifHerite).toBe('decision_bloquante_non_tranchee');
    expect(registre.canonique('DEC-INT-002')).toBe('W3');
    expect(registre.decision('W3')?.trancheeLe).toBe('2026-09-03');
  });

  it('REQ-GOV-021 · CONTRE-TÉMOIN : aucune tâche citant `EXT-2a` n’est déclarée redevenue éligible', () => {
    // `EXT-2a` est la seule décision qui bloque encore. Une tâche qui la cite doit rester écartée :
    // sinon le décompte imprimé mesurerait l'assouplissement, pas la correction.
    expect(ecarts.filter((e) => e.decisions.includes('EXT-2a'))).toEqual([]);
  });
});
