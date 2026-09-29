// @req REQ-QA-014
// @req REQ-GOV-032
/**
 * un-rendu-n-officialise-pas-une-attribution.spec.ts — GOV-085.
 *
 * LE DÉFAUT, ET POURQUOI SA VICTIME CROIT AVOIR OBÉI. Une tâche promet, pour une exigence, un test
 * PRÉCIS (`fichier#titre`) dont le titre ne cite pas cette exigence — il en cite une autre. La garde
 * ne regardait que le FICHIER : `@req` en tête, et UN titre de `it()` quelconque portant
 * l'identifiant. Le test promis, lui, n'était jamais confronté à l'exigence qu'on lui attribue.
 * Quand l'attribution faisait bouger la vue, le seul rouge était `vue_divergente`, dont le message
 * prescrivait « regénère » : le rendu ÉCRIVAIT l'attribution fausse dans la vue, la comparaison vue
 * contre générateur concordait, et le rouge s'éteignait. Personne n'a triché ; le circuit était
 * fermé sur lui-même, et le geste prescrit rendait vraie l'erreur dénoncée.
 *
 * LA MESURE. Deux questions, deux contrôles, deux sorties : « la source dit-elle vrai du disque ? »
 * et « la vue est-elle à jour de sa source ? ». Rendre la vue ne répond qu'à la seconde. Le témoin
 * joue les DEUX faces sur le binaire : la garde sort en code non nul AVANT le rendu (vue périmée)
 * et APRÈS un rendu complet (vue égale à ce que la source produit, `--verifier` à zéro) — c'est la
 * seconde face qui manquait. Le dépôt, lui, sort en zéro et dit combien de promesses il a jugées.
 *
 * Tout se fabrique sur une COPIE du backlog (`--taches`) et des vues (`--out`), dans un bac créé
 * ici : on n'écrit jamais dans `docs/`. Aucun titre n'est recopié : le test promis à tort est LU
 * dans le texte de ce fichier.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { titresDeTest } from '../../../scripts/lot/titres-ecrits';
import {
  controler,
  universFixture,
  QUESTION_SOURCE,
  QUESTION_VUE,
  type Univers,
} from '../../../scripts/gates/gov-trace';

const TRACE = 'scripts/gates/gov-trace.ts';
const CE_FICHIER = 'tests/unit/gouvernance/un-rendu-n-officialise-pas-une-attribution.spec.ts';
const CETTE_TACHE = 'GOV-085';
const ATTRIBUEE = 'REQ-QA-014';
const AUTRE = 'REQ-GOV-032';
const LONG = 900_000;

/**
 * Le test que la promesse fausse désigne : un `it()` de CE fichier dont le titre cite l'autre
 * exigence de la tâche, et pas celle qu'on lui attribue. Lu dans le texte, jamais recopié.
 */
const TITRE_PROMIS_A_TORT = titresDeTest(readFileSync(CE_FICHIER, 'utf8')).find(
  (t) => t.includes(AUTRE) && !t.includes(ATTRIBUEE)
)!;

type Tache = { id: string; tests?: Record<string, string[]> } & Record<string, unknown>;
type Backlog = { taches: Tache[] } & Record<string, unknown>;

/** `npx tsx`, jamais le binaire du transpileur seul : l'enfant `vitest list` rendrait vide. */
function lancer(...args: string[]): Promise<{ code: number; sortie: string }> {
  return new Promise((resoudre) => {
    const enfant = spawn('npx', ['tsx', TRACE, ...args], {
      shell: true,
      env: { ...process.env, GOV_TRACE_SANS_PR: '1' },
    });
    let sortie = '';
    enfant.stdout.on('data', (d: Buffer) => (sortie += d.toString('utf8')));
    enfant.stderr.on('data', (d: Buffer) => (sortie += d.toString('utf8')));
    enfant.on('close', (code) => resoudre({ code: code ?? 1, sortie }));
  });
}

/** La section d'une sortie qui répond à une question : du titre de la question à la suivante. */
function section(sortie: string, question: string, suivante: string | null): string {
  const debut = sortie.indexOf(question);
  if (debut < 0) return '';
  const fin = suivante === null ? -1 : sortie.indexOf(suivante, debut + question.length);
  return fin < 0 ? sortie.slice(debut) : sortie.slice(debut, fin);
}

let bac = '';
let promesseFausse = '';
let reel: { code: number; sortie: string };
let renduPropre: { code: number; sortie: string };
let avant: { code: number; sortie: string };
let verifie: { code: number; sortie: string };
let apres: { code: number; sortie: string };
let renduFaux: { code: number; sortie: string };
let vueNeuve = '';

beforeAll(async () => {
  expect(TITRE_PROMIS_A_TORT, `aucun titre de ${CE_FICHIER} ne cite ${AUTRE} seul`).toBeDefined();
  bac = mkdtempSync(join(tmpdir(), 'g85-'));
  const vue = join(bac, 'vue.md');
  const perimee = join(bac, 'vue-perimee.md');
  const fausse = join(bac, 'tasks.json');
  vueNeuve = join(bac, 'vue-neuve.md');

  // LE GESTE que le rouge prescrivait : un rendu COMPLET de la vue, depuis le backlog du dépôt.
  // Le dépôt se juge contre CETTE vue, pas contre `docs/TRACABILITE.md` : la question ② n'est pas
  // celle de ce fichier, et la vue commitée ne porte pas encore la spécification qu'on y ajoute.
  renduPropre = await lancer('--render', '--out', vue);
  writeFileSync(
    perimee,
    `${readFileSync(vue, 'utf8')}\n| une ligne que la source ne porte pas |\n`
  );

  // L'ATTRIBUTION FAUSSE : cette tâche promet, pour l'exigence attribuée, un test précis qui ne
  // la cite pas. Le fichier promis la cite ailleurs — c'est ce qui la faisait passer.
  const b = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Backlog;
  const t = b.taches.find((x) => x.id === CETTE_TACHE)!;
  promesseFausse = `${CE_FICHIER}#${TITRE_PROMIS_A_TORT}`;
  t.tests = { ...(t.tests ?? {}), [ATTRIBUEE]: [promesseFausse] };
  writeFileSync(fausse, JSON.stringify(b, null, 2));

  [reel, avant, verifie, apres, renduFaux] = await Promise.all([
    lancer('--out', vue),
    lancer('--taches', fausse, '--out', perimee),
    lancer('--verifier', '--taches', fausse, '--out', vue),
    lancer('--taches', fausse, '--out', vue),
    lancer('--render', '--taches', fausse, '--out', vueNeuve),
  ]);
}, LONG);

afterAll(() => {
  if (bac) rmSync(bac, { recursive: true, force: true });
});

describe('gov:trace — une attribution fausse survit-elle à un rendu complet de la vue ?', () => {
  it(
    'REQ-QA-014 : AVANT le rendu, la promesse dont le test ne cite pas son exigence fait sortir la garde en code non nul',
    () => {
      expect(avant.code, avant.sortie).not.toBe(0);
      expect(avant.sortie).toContain('req_non_citee_par_son_test');
      expect(avant.sortie).toContain(promesseFausse);
    },
    LONG
  );

  it(
    'REQ-QA-014 : APRÈS un rendu complet, la vue est à jour de sa source et la garde sort TOUJOURS en code non nul',
    () => {
      // Le rendu est COMPLET : la vue est exactement ce que la source fautive produit.
      expect(renduPropre.code, renduPropre.sortie).toBe(0);
      expect(verifie.code, verifie.sortie).toBe(0);
      // Et la garde ne s'éteint pas pour autant : c'est la face qui manquait.
      expect(apres.code, apres.sortie).not.toBe(0);
      expect(apres.sortie).toContain('req_non_citee_par_son_test');
      expect(apres.sortie).toContain(promesseFausse);
      expect(apres.sortie).not.toContain('vue_divergente');
    },
    LONG
  );

  it(
    'REQ-GOV-032 : le rendu refuse d officialiser l attribution, sort en code non nul et n écrit rien',
    () => {
      expect(renduFaux.code, renduFaux.sortie).not.toBe(0);
      expect(existsSync(vueNeuve)).toBe(false);
      // Contre-témoin : sur la source du dépôt, le même geste rend et sort en zéro.
      expect(renduPropre.code, renduPropre.sortie).toBe(0);
    },
    LONG
  );
});

describe('gov:trace — deux questions, deux contrôles, deux sorties, deux messages', () => {
  it(
    'REQ-GOV-032 : la vérité de la source et la fraîcheur de la vue se répondent dans deux sections distinctes',
    () => {
      const sourceAvant = section(avant.sortie, QUESTION_SOURCE, QUESTION_VUE);
      const vueAvant = section(avant.sortie, QUESTION_VUE, null);
      expect(sourceAvant, avant.sortie).toContain('req_non_citee_par_son_test');
      expect(sourceAvant).not.toContain('vue_divergente');
      expect(vueAvant, avant.sortie).toContain('vue_divergente');
      expect(vueAvant).not.toContain('req_non_citee_par_son_test');

      // Après le rendu : la seconde question est verte, la première reste rouge.
      const sourceApres = section(apres.sortie, QUESTION_SOURCE, QUESTION_VUE);
      const vueApres = section(apres.sortie, QUESTION_VUE, null);
      expect(sourceApres, apres.sortie).toContain('❌');
      expect(vueApres, apres.sortie).toContain('✅');
    },
    LONG
  );

  it(
    'REQ-GOV-032 : `--verifier` ne répond qu’à la fraîcheur de la vue, et dit qu’il ne juge pas la source',
    () => {
      expect(verifie.sortie).toContain('est égal');
      expect(verifie.sortie).toContain(QUESTION_VUE);
      expect(verifie.sortie).toContain(`${QUESTION_SOURCE} NON JUGÉE`);
    },
    LONG
  );

  it(
    'REQ-GOV-032 : le message qui dénonce l attribution nomme la tâche et le test promis, et ne prescrit pas de re-rendre',
    () => {
      const ligne = apres.sortie
        .split('\n')
        .find((l) => l.includes(`${CETTE_TACHE} déclare couvrir ${ATTRIBUEE}`));
      expect(ligne, apres.sortie).toBeDefined();
      expect(ligne).toContain(promesseFausse);
      expect(ligne).toContain("corrige l'un des deux");
      expect(ligne).not.toMatch(/--render|gov:trace:render/);
    },
    LONG
  );

  it(
    'REQ-QA-014 : contre-témoin — le registre du dépôt sort en zéro, avec le compte des promesses réellement confrontées',
    () => {
      expect(reel.code, reel.sortie).toBe(0);
      const m =
        /(\d+) promesse\(s\) de `tests\{\}` confrontée\(s\) à ce disque, dont (\d+) au titre de leur `it\(\)`/.exec(
          reel.sortie
        );
      expect(m, reel.sortie).not.toBeNull();
      const [jugees, titrees] = [Number(m![1]), Number(m![2])];
      // Oracles plus simples que la garde : les promesses que le backlog écrit, avec ou sans titre.
      const promesses = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Backlog).taches
        .flatMap((x) => Object.values(x.tests ?? {}))
        .flat();
      expect(titrees).toBeGreaterThan(0);
      expect(titrees).toBeLessThanOrEqual(jugees);
      expect(jugees).toBeLessThanOrEqual(promesses.length);
      expect(titrees).toBeLessThanOrEqual(promesses.filter((p) => p.includes('#')).length);
    },
    LONG
  );
});

describe('gov:trace — la famille, sur l univers de fixture (RM-02)', () => {
  /** L'identifiant feint est ASSEMBLÉ : écrit en clair, il serait lu comme une citation. */
  const FEINTE = ['REQ', 'AAA', '001'].join('-');

  /** Un fichier où UN test cite l'exigence feinte et un AUTRE ne la cite pas. */
  function univers(titrePromis: string): Univers {
    const u = universFixture();
    const f = u.fichiers[0]!;
    f.titresStatiques.push('un titre sans exigence');
    f.titresDeTest.push('un titre sans exigence');
    f.titresResolus = [...(f.titresResolus ?? []), 'un titre sans exigence'];
    u.taches[0]!.tests![FEINTE] = [`${f.chemin}#${titrePromis}`];
    if (u.resultats.etat === 'lus') {
      u.resultats.parFichier[f.chemin]!.push({
        nom: 'un titre sans exigence',
        titre: 'un titre sans exigence',
        statut: 'passed',
      });
    }
    return u;
  }

  it('REQ-QA-014 : témoin — la promesse vise un test dont le titre ne cite pas son exigence : rouge', () => {
    const fautes = controler(univers('un titre sans exigence'));
    const f = fautes.find((x) => x.famille === 'req_non_citee_par_son_test');
    expect(f, JSON.stringify(fautes)).toBeDefined();
    expect(f!.message).toContain(`ne cite pas ${FEINTE}`);
    expect(f!.message).toContain("corrige l'un des deux");
  });

  it('REQ-QA-014 : contre-témoin — la promesse vise le test qui cite son exigence : vert', () => {
    expect(controler(univers(`${FEINTE} : un titre`))).toEqual([]);
  });
});
