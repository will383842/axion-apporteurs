/**
 * tracabilite.spec.ts — la matrice REQ → tâche → test → PR est DÉRIVÉE, jamais rédigée (GOV-011).
 *
 * @req REQ-GOV-005
 * @req REQ-QA-014
 *
 * ⚠️ REQ-GOV-005 est ABSORBÉE par REQ-QA-014 (`docs/requirements.json`, `remplaceePar`). Le texte en
 * vigueur est celui de REQ-QA-014 ; l'identifiant REQ-GOV-005 est conservé pour que GOV-011 et
 * GOV-022, qui le citent, continuent de résoudre. Les deux sont annotés ci-dessus parce que la
 * garde vérifie la citation par identifiant, et que les deux identifiants sont cités par le backlog.
 *
 * CE QUE CE FICHIER EXERCE, ET POURQUOI CHAQUE CAS EXISTE :
 *
 *   1. `--prove` : un témoin par famille, sur un univers de FIXTURE. Il ne peut pas partir de
 *      l'état du dépôt, parce que cet état est fautif — c'est le résultat de la tâche, pas un
 *      accident (voir le troisième cas). Le patron est celui de `gates:prouvees` : registre de
 *      fixture et disque injecté (RM-11).
 *   2. `--verifier` : la vue `docs/TRACABILITE.md` est comparée à ce que la source produit. Le cas
 *      suivant truque une COPIE de la vue et exige le rouge — sans quoi `--verifier` pourrait ne
 *      rien comparer du tout et rester vert pour cette raison.
 *   3. La garde sur l'état réel du dépôt ROUGIT, et ce rouge est l'objet de la tâche : quatre
 *      fichiers de test livrés par des tâches `fusionnee` ne portent AUCUNE annotation `@req` et
 *      aucun identifiant REQ dans leurs titres. La deuxième case de la définition de « terminé »
 *      (« Chaque REQ a son test, nommé par son identifiant, annoté `// @req` ») a donc été cochée
 *      sur quatre PR sans être vraie. Le jour où ce test devra être réécrit sera le jour où ces
 *      annotations seront posées — et ce sera une correction, pas un effet de bord.
 *   4. La source PR est FACULTATIVE : sans réseau ni `gh`, la garde le DIT et continue sur les trois
 *      autres sources. Une gate qui passe parce qu'elle n'a pas pu lire est pire que pas de gate ;
 *      le test exige donc que l'indisponibilité soit ÉCRITE dans la sortie.
 *
 * AUCUN TOTAL N'EST ÉPINGLÉ ICI. Le compte des familles se DÉRIVE de la liste que `--prove`
 * imprime : un test qui figeait « 15 familles » a déjà rougi au passage à 16 alors que rien
 * n'était cassé (PR 26).
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'scripts/gates/gov-trace.ts';
const VUE = 'docs/TRACABILITE.md';

/**
 * La quatrième source — les corps de PR — est COUPÉE ici (`GOV_TRACE_SANS_PR`), sauf dans le cas
 * qui porte précisément sur elle. Aucun des contrôles exercés ci-dessous ne juge une PR ; les
 * laisser appeler `gh` ferait dépendre la suite d'un jeton et d'un réseau, et un test qui échoue
 * parce qu'il n'a pas pu joindre GitHub ne dit plus rien de la garde.
 */
function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, GOV_TRACE_SANS_PR: '1' },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('gov:trace — la garde sait rougir (REQ-GOV-005 → REQ-QA-014)', () => {
  it('REQ-QA-014 : chaque famille a son témoin, et les contre-témoins restent verts', () => {
    const { code, sortie } = lancer('--prove');
    expect(sortie).toContain('familles rougissent');
    expect(sortie).toContain('contre-témoin');
    expect(code).toBe(0);
  });

  it('REQ-QA-014 : la preuve ÉNUMÈRE ses familles, elle ne les compte pas', () => {
    // Le compte annoncé doit être celui de la liste imprimée, dérivé et non figé : trois familles
    // de `gov:publication` ont été réputées prouvées sans témoin parce que la preuve comptait
    // des fautes au lieu de les nommer (2026-09-03).
    const { sortie } = lancer('--prove');
    const familles = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(familles.length).toBeGreaterThan(0);
    const annonce = /Les (\d+) familles rougissent/.exec(sortie);
    expect(annonce).not.toBeNull();
    expect(Number(annonce![1])).toBe(familles.length);
  });
});

describe('gov:trace — la vue est DÉRIVÉE de la source (REQ-GOV-005 → REQ-QA-014)', () => {
  it('REQ-QA-014 : docs/TRACABILITE.md est à jour — `--verifier` est vert sur le dépôt', () => {
    expect(existsSync(VUE)).toBe(true);
    const { code, sortie } = lancer('--verifier');
    expect(sortie).toContain('est égal');
    expect(code).toBe(0);
  });

  it('REQ-QA-014 : sait rougir — une vue truquée d’une ligne fait échouer `--verifier`', () => {
    // On n'écrit JAMAIS dans `docs/` pour se prouver : la vue truquée part dans un dossier qu'on a
    // créé soi-même, et `--out` dit au script où lire. Un test qui abîme le dépôt ne prouve rien,
    // et un `rmSync` sur un dossier qu'on n'a pas créé efface le travail du voisin.
    const dossier = mkdtempSync(join(tmpdir(), 'gov-trace-'));
    try {
      const fidele = join(dossier, 'copie-fidele.md');
      writeFileSync(fidele, readFileSync(VUE, 'utf8'), 'utf8');
      // Contre-témoin d'abord : une copie FIDÈLE reste verte. Sans lui, le rouge ci-dessous
      // pourrait n'être que le refus d'un `--out` que le script ignorerait.
      const vert = lancer('--verifier', '--out', fidele);
      expect(vert.code).toBe(0);

      const truque = join(dossier, 'vue-truquee.md');
      writeFileSync(truque, `${readFileSync(VUE, 'utf8')}\n| REQ-ZZZ-999 | ligne écrite à la main |\n`, 'utf8');
      const rouge = lancer('--verifier', '--out', truque);
      expect(rouge.sortie).toContain('diffère');
      expect(rouge.code).not.toBe(0);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe('gov:trace — la source PR est facultative, jamais silencieuse', () => {
  it('REQ-QA-014 : sans `gh`, la garde DIT que la source PR manque et continue sur les trois autres', () => {
    // `GOV_TRACE_SANS_PR=1` coupe la quatrième source sans toucher au réseau : le test doit valoir
    // sur un poste connecté comme en CI. Ce qui est vérifié n'est pas le contenu des PR, c'est que
    // leur absence est ÉCRITE — une gate verte parce qu'elle n'a pas pu lire est pire que pas de gate.
    const r = spawnSync('npx', ['tsx', SCRIPT, '--sources'], {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, GOV_TRACE_SANS_PR: '1' },
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(sortie).toContain('PR');
    expect(sortie.toLowerCase()).toContain('indisponible');
    expect(sortie).toMatch(/registre.*(✓|lu)/);
  });
});

describe('gov:trace — les deux familles qui ont coûté seize ruptures', () => {
  // CE BLOC A ÉTÉ RÉÉCRIT LE 2026-09-04, ET LA RAISON MÉRITE D'ÊTRE ÉCRITE.
  //
  // Il ÉPINGLAIT l'état fautif du dépôt : « `pnpm gov:trace` doit sortir en erreur et nommer
  // REQ-GOV-031 ». C'était vrai le jour où la garde a été livrée — elle venait de trouver seize
  // ruptures, dont treize dues au fait que `gardes.spec.ts` portait douze promesses de couverture
  // et zéro annotation `@req`. Mais un test qui EXIGE le défaut ne l'attrape pas : il l'épingle.
  // Le jour où on corrige, c'est le test qui rougit — et le réflexe est alors de « réparer » le
  // test, c'est-à-dire de rendre la correction plus coûteuse que la faute.
  //
  // Les seize ruptures sont corrigées : quatre annotations `@req` posées sur les exigences que
  // `gardes.spec.ts` exerce réellement, douze promesses re-pointées vers les fichiers qui les
  // portent, un test écrit pour REQ-CPL-021 qui n'en avait aucun. Ce que ces deux `it()` doivent
  // prouver n'est donc plus l'état du dépôt — c'est que la garde SAIT ENCORE les voir.
  //
  // On l'exige donc de `--prove`, qui juge un univers de FIXTURE : indépendant de l'état du
  // dépôt, il vaudra encore quand tout sera vert depuis longtemps.

  it('REQ-QA-014 : la famille `req_sans_test` a son témoin — celle qui a coûté treize ruptures', () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('req_sans_test');
  });

  it('REQ-GOV-005 : la famille `req_non_citee_par_son_test` a son témoin', () => {
    // Le défaut attrapé À LA MAIN sur ce dépôt (PR 27, lentille « exactitude ») : une tâche
    // déclarait couvrir REQ-GOV-027 par un test qui ne parle pas de cette exigence. Cette
    // famille est ce qui l'attrape désormais toute seule.
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('req_non_citee_par_son_test');
  });

  it('REQ-QA-014 : et le dépôt, lui, est VERT — aucune rupture ne subsiste', () => {
    // Le pendant du bloc ci-dessus : la garde sait rougir (prouvé plus haut) ET ne rougit pas
    // ici. Les deux assertions ensemble valent quelque chose ; l'une sans l'autre, non.
    const { code, sortie } = lancer();
    expect(sortie, sortie).toContain('✅');
    expect(code).toBe(0);
  });
});

describe('gov:trace — l’absorption au registre', () => {
  it('REQ-GOV-005 : le registre porte bien l’absorption, et c’est REQ-QA-014 qui fait foi', () => {
    const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
      exigences: { id: string; statut: string; remplaceePar: string | null }[];
    };
    const absorbee = registre.exigences.find((e) => e.id === 'REQ-GOV-005')!;
    expect(absorbee.statut).toBe('absorbee');
    expect(absorbee.remplaceePar).toBe('REQ-QA-014');
    expect(registre.exigences.find((e) => e.id === 'REQ-QA-014')!.statut).toBe('active');
  });
});
