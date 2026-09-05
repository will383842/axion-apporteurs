// @req REQ-GOV-033
/**
 * L'identifiant d'un lot est unique SUR LA VIE DU DÉPÔT, et il se dérive d'une source SUIVIE.
 *
 * CE QUE CE FICHIER TIENT, ET COMMENT LE DÉFAUT A ÉTÉ TROUVÉ. `scripts/lot/composer.ts` nommait
 * un lot en lisant `docs/lots/`, un dossier que `.gitignore` ligne 67 EXCLUT du dépôt. Dans un
 * arbre neuf — un worktree fraîchement créé, un clone, une machine de CI — ce dossier n'existe
 * pas ; le maximum d'un ensemble vide est 0, et le composeur repart à `L-1-01`. Or `L-1-01` est
 * déjà porté par SEPT tâches `fusionnee` de `docs/tasks.json`.
 *
 * Ce n'est pas une hypothèse : le 2026-09-05, dans un worktree neuf, `pnpm lot:composer` a
 * imprimé « Lot L-1-01 : 7 tâche(s) » pour un lot dont aucune des sept tâches n'appartient au
 * L-1-01 historique. `pnpm lot:cloture -- --lot L-1-01` aurait alors écrit `lot: "L-1-01"` sur
 * les nouvelles, et le lot historique en aurait compté quatorze, prises dans deux lots
 * différents. Aucune garde ne l'aurait vu : `t.lot` est une chaîne libre.
 *
 * ⚠️ CE QUI REND CE DÉFAUT INSTRUCTIF. Le code portait DÉJÀ, en commentaire, l'énoncé exact du
 * défaut :
 *
 *     « Le numéro se DÉDUIT du plus grand déjà posé, jamais d'un COMPTAGE : un dossier supprimé,
 *       archivé ou non commité faisait retomber sur un identifiant déjà utilisé, et écrasait le
 *       lot.json précédent. »
 *
 * L'auteur avait vu la panne — « un dossier non commité » — et n'avait corrigé que la moitié :
 * il a remplacé le COMPTAGE par un MAXIMUM, ce qui ferme le cas des trous dans la numérotation,
 * et il a laissé la SOURCE inchangée, ce qui laisse ouvert le cas qu'il décrit. Un commentaire
 * qui nomme un défaut ne le corrige pas, et il rassure d'autant plus qu'il est juste.
 *
 * LE REMÈDE. L'identifiant se dérive de l'UNION de deux sources : le dossier (qui porte les lots
 * composés mais pas encore clos, invisibles du backlog) et `docs/tasks.json` (qui porte les lots
 * clos, seul à survivre à `git clean`). Aucune des deux ne suffit seule — c'est pour cela que la
 * fonction les prend toutes les deux, et que ce fichier a un témoin par source.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import {
  prochainIdentifiantDeLot,
  prochainIdentifiantHerite,
  lotsDuBacklog,
} from '../../../scripts/lot/identifiant-de-lot';

type Tache = { id: string; lot?: string | null };

const backlog = () =>
  (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] }).taches;

describe("REQ-GOV-033 — l'identifiant de lot ne se dérive pas d'un dossier ignoré par git", () => {
  it('REQ-GOV-033 — TÉMOIN : un arbre neuf (aucun dossier docs/lots) ne repart PAS sur un identifiant déjà porté par le backlog', () => {
    // C'est la panne réelle, reproduite : dossier vide, backlog portant L-1-01 à L-1-03.
    const deja = ['L-1-01', 'L-1-03', 'gov-amorcage'];
    const id = prochainIdentifiantDeLot(-1, [], deja);
    expect(deja).not.toContain(id);
    expect(id).toBe('L-1-04');
  });

  it("REQ-GOV-033 — TÉMOIN : le dossier seul ne suffit pas non plus — un lot composé mais pas encore clos n'est dans aucun backlog", () => {
    // Symétrique du précédent : le backlog ignore un lot en cours, le dossier le porte.
    const id = prochainIdentifiantDeLot(-1, ['L-1-04', 'L-1-05'], ['L-1-01']);
    expect(id).toBe('L-1-06');
  });

  it("REQ-GOV-033 — c'est bien l'UNION des deux sources qui décide, jamais la plus grande des deux", () => {
    // Le dossier porte le plus grand ; puis le backlog. Ni « toujours le dossier » ni « toujours
    // le backlog » ne rend ces deux réponses-là.
    expect(prochainIdentifiantDeLot(0, ['L0-07'], ['L0-02'])).toBe('L0-08');
    expect(prochainIdentifiantDeLot(0, ['L0-02'], ['L0-07'])).toBe('L0-08');
  });

  it("REQ-GOV-033 — le calcul HÉRITÉ retombe bien sur un identifiant DÉJÀ PRIS, et c'est ce qui prouve que le remède change quelque chose", () => {
    // Sans ce témoin, rien ne montrerait que la correction corrige : deux implémentations qui
    // rendent la même chose sur le dépôt du jour se ressemblent, et on discute. Ici la fixture du
    // défaut est confrontée au calcul unique sur l'état RÉEL de l'arbre neuf — dossier absent.
    const deja = [...lotsDuBacklog(backlog())];
    const herite = prochainIdentifiantHerite(-1, []);
    const unique = prochainIdentifiantDeLot(-1, [], deja);
    expect(deja, `le calcul hérité doit retomber sur un identifiant déjà porté`).toContain(herite);
    expect(deja, `le calcul unique ne doit JAMAIS retomber dessus`).not.toContain(unique);
    expect(herite).not.toBe(unique);
  });

  it('REQ-GOV-033 — CONTRE-TÉMOIN : deux sources vides donnent le PREMIER identifiant, pas une erreur', () => {
    expect(prochainIdentifiantDeLot(-1, [], [])).toBe('L-1-01');
  });

  it("REQ-GOV-033 — CONTRE-TÉMOIN : un identifiant d'une AUTRE phase ne décale pas la phase demandée", () => {
    // `L0-09` ne dit rien de la phase -1. Confondre les préfixes ferait sauter huit numéros.
    expect(prochainIdentifiantDeLot(-1, ['L0-09'], ['L1-42'])).toBe('L-1-01');
  });

  it("REQ-GOV-033 — CONTRE-TÉMOIN : un nom de lot hors nomenclature (`gov-amorcage`) est ignoré sans faire tomber le calcul", () => {
    expect(prochainIdentifiantDeLot(-1, ['archives', 'L-1-02'], ['gov-amorcage', 'gov-amorcage-2'])).toBe('L-1-03');
  });

  it('REQ-GOV-033 — `lotsDuBacklog` lit le champ `lot` des tâches, et ignore celles qui n’en portent pas', () => {
    // Le tableau est typé `Tache[]` et non laissé au littéral : la signature de `lotsDuBacklog`
    // ne demande que `lot`, et le contrôle des propriétés en trop refuserait un `id` écrit ici
    // en clair. Or `id` est justement ce qui rend la fixture lisible — deux tâches distinctes
    // portent le même lot, et c'est ce que le test vérifie.
    const fixture: Tache[] = [
      { id: 'A', lot: 'L-1-01' },
      { id: 'B', lot: null },
      { id: 'C' },
      { id: 'D', lot: 'L-1-01' },
    ];
    const lus = lotsDuBacklog(fixture);
    expect([...lus].sort()).toEqual(['L-1-01']);
  });

  it("REQ-GOV-033 — sur le dépôt RÉEL : le prochain identifiant n'est porté par aucune tâche", () => {
    // Le contrôle qui compte. Il ne juge pas une fixture, il juge l'état du dépôt du jour.
    const taches = backlog();
    const dossiers = existsSync('docs/lots') ? readdirSync('docs/lots') : [];
    const deja = new Set(taches.map((t) => t.lot).filter((l): l is string => typeof l === 'string'));
    for (const phase of [-1, 0, 1, 2, 3]) {
      const id = prochainIdentifiantDeLot(phase, dossiers, [...deja]);
      expect(deja, `phase ${phase} : ${id} est déjà porté par une tâche du backlog`).not.toContain(id);
    }
  });
});
