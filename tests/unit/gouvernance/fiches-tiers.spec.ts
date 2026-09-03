/**
 * fiches-tiers.spec.ts — le test que `docs/tasks.json` attribue à GOV-015 pour REQ-CPL-002 et REQ-GOV-022.
 *
 * POURQUOI ICI, ET PAS SOUS `tests/gov/`. `vitest.config.ts` n'inclut que `src/**`, `tests/unit/**` et
 * `tests/schemas/**`. Un fichier posé sous `tests/gov/` ne serait JAMAIS exécuté : il aurait l'air d'un
 * test, il n'en serait pas un. Ce fichier est donc voisin de `gardes.spec.ts`, dans `tests/unit/`.
 *
 * CE QU'IL TIENT. Douze contrôles, tous DÉRIVÉS de `docs/tiers/README.md` et de `docs/requirements.json`
 * (RM-01) : la liste des tiers, les neuf titres du gabarit, les quatre éléments de source, les formules
 * d'attente et la liste fermée des responsables sont LUS, jamais retapés ici.
 *
 * CE QU'IL NE PRÉTEND PAS TENIR. Il ne dit pas que les fiches sont VRAIES : la rubrique 2 des douze
 * fiches est vide à ce jour, et c'est précisément ce que le douzième contrôle rend visible — l'index
 * doit déclarer chaque rubrique 2 incomplète, et la déclaration est comparée à ce que les fiches
 * portent. Une tâche partielle qui ne dit pas où elle s'arrête est une tâche fausse.
 */

import { describe, it, expect } from 'vitest';
import { controler, charger, prouver, FAMILLES, TEMOINS, CONTRE_TEMOINS } from './fiches-tiers.controles';

const RACINE = 'docs/tiers';
const EXIGENCES = 'docs/requirements.json';

describe('REQ-GOV-022 — les fiches tiers existent, et elles sont complètes de ce qui est écrivable', () => {
  it('ne porte aucune faute sur l’état du dépôt', () => {
    const fautes = controler(charger(RACINE, EXIGENCES));
    expect(fautes.map((f) => `[${f.famille}] ${f.message}`)).toEqual([]);
  });

  it('couvre les douze familles, et chacune a un témoin qui la fait rougir', () => {
    expect(TEMOINS.map((t) => t.famille).sort()).toEqual([...FAMILLES].sort());
  });

  it(`sait rougir : ${TEMOINS.length} témoins rouges, ${CONTRE_TEMOINS.length} contre-témoins verts`, () => {
    const p = prouver(charger(RACINE, EXIGENCES));
    expect(p.erreurs).toEqual([]);
    expect(p.rouges.map((r) => r.famille).sort()).toEqual([...FAMILLES].sort());
    expect(p.ok).toBe(true);
  });
});

describe('REQ-CPL-002 — la banque est connue, ou le repli est acté', () => {
  it('vérifie les DEUX branches, et rougit si aucune n’est vraie', () => {
    const base = charger(RACINE, EXIGENCES);
    expect(controler(base).filter((f) => f.famille === 'disjonction_cpl_002')).toEqual([]);

    // La branche « repli acté » est celle qui porte l'exigence aujourd'hui : retirer la citation du
    // registre sans renseigner l'établissement fait tomber les deux termes de la disjonction.
    const temoin = TEMOINS.find((t) => t.famille === 'disjonction_cpl_002');
    expect(temoin).toBeDefined();
    const fautes = controler(temoin!.defaut(base));
    expect(fautes.some((f) => f.famille === 'disjonction_cpl_002')).toBe(true);
  });
});

describe('REQ-GOV-022 — l’état PARTIEL de la tâche est tenu par le test, pas par une phrase', () => {
  it('exige que chaque rubrique 2 incomplète soit déclarée dans l’index', () => {
    const base = charger(RACINE, EXIGENCES);
    const temoin = TEMOINS.find((t) => t.famille === 'rubrique2_incomplete_non_declaree');
    expect(temoin).toBeDefined();
    // Retirer une fiche de la liste des restes du README doit rougir : sinon la liste se vide toute
    // seule et le « reste à faire » disparaît sans que personne ne l'ait fait.
    const fautes = controler(temoin!.defaut(base));
    expect(fautes.some((f) => f.famille === 'rubrique2_incomplete_non_declaree')).toBe(true);
  });
});
