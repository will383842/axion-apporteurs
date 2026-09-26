// @req REQ-QA-014
/**
 * REQ-QA-014 — LE CONTRÔLE COMPENSATOIRE DIT CE QU'IL NE COUVRE PAS (GOV-043).
 *
 * `gov:trace` est le contrôle invoqué chaque fois qu'un trou de `lot:cloture` est jugé tolérable.
 * Mesure du 2026-09-09 : il ne regardait que les tâches qui portent un `tests{}` — 48 sur 209 — et
 * son résumé n'en disait rien : deux tâches de sécurité et une livraison faite dans l'autre dépôt
 * étaient hors de sa vue, en silence.
 *
 * ⚠️ LA TÂCHE N'ÉTEND PAS LA COUVERTURE. Elle exige trois choses, et ce fichier tient les trois :
 *
 *   1. le résumé REND le périmètre et le complément, chiffre par chiffre, et NOMME le complément ;
 *   2. un PLANCHER DÉCLARÉ (une valeur, une source, une date — RM-10) rougit quand la couverture
 *      passe dessous, et imprime les deux chiffres ; un contre-témoin reste vert quand elle MONTE
 *      (RM-02 : la moitié qu'on oublie) ;
 *   3. `gov:inventaire` cesse de compter une tâche FABRIQUÉE — absente du registre — comme portant
 *      une preuve qui résout.
 *
 * AUCUN CHIFFRE N'EST ÉPINGLÉ ICI. Le nombre de tâches se lit dans `docs/tasks.json`, le plancher
 * dans la sortie de la garde, qui le lit dans `docs/gates.json`. Les oracles du complément sont
 * des prédicats PLUS SIMPLES que la garde (dépôt de la tâche, `tests{}` vide), pas sa recopie.
 *
 * Les pannes du plancher se fabriquent sur une COPIE du backlog (`--taches`) et une COPIE de la vue
 * (`--out`), dans un dossier créé ici : on n'écrit jamais dans `docs/` pour se prouver.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TRACE = 'scripts/gates/gov-trace.ts';
const INVENTAIRE = 'scripts/gates/gov-inventaire.ts';
const CE_FICHIER = 'tests/unit/gouvernance/trace-dit-ce-qu-elle-ne-couvre-pas.spec.ts';
const LONG = 300_000;

type Tache = {
  id: string;
  statut: string;
  repo: string;
  reqs: string[];
  paths: string[];
  tests?: Record<string, string[]>;
};
const backlog = (): { taches: Tache[] } & Record<string, unknown> =>
  JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };

/** `pnpm` ou `npx tsx`, JAMAIS `node node_modules/tsx/…` : l'enfant `vitest list` rendrait vide. */
function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GOV_TRACE_SANS_PR: '1' },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Le résumé du périmètre, tel que la garde l'imprime. `null` si elle ne l'imprime pas. */
function lirePerimetre(sortie: string): {
  dedans: string[];
  total: number;
  plancher: number;
  complement: Map<string, string[]>;
  annonceComplement: number;
} | null {
  const tete = /périmètre : (\d+) tâche\(s\) sur (\d+)/.exec(sortie);
  const plancher = /plancher déclaré : (\d+)/.exec(sortie);
  const annonce = /complément : (\d+) tâche\(s\)/.exec(sortie);
  const dedans = /dans le périmètre \((\d+)\) : (.*)$/m.exec(sortie);
  if (!tete || !plancher || !annonce || !dedans) return null;
  const complement = new Map<string, string[]>();
  for (const m of sortie.matchAll(/^\s+hors périmètre · (\w+) \((\d+)\) : (.*)$/gm)) {
    complement.set(m[1]!, m[3]!.split(', ').filter(Boolean));
  }
  return {
    dedans: dedans[2]!.split(', ').filter(Boolean),
    total: Number(tete[2]),
    plancher: Number(plancher[1]),
    complement,
    annonceComplement: Number(annonce[1]),
  };
}

let reel: { code: number; sortie: string };
const dossiers: string[] = [];
const bac = () => {
  const d = mkdtempSync(join(tmpdir(), 'g43-'));
  dossiers.push(d);
  return d;
};

beforeAll(() => {
  reel = lancer(TRACE);
}, LONG);
afterAll(() => {
  for (const d of dossiers) rmSync(d, { recursive: true, force: true });
});

describe('gov:trace — le résumé rend son périmètre et son complément (GOV-043)', () => {
  it('REQ-QA-014 : le résumé rend le périmètre et le complément, chiffre par chiffre', () => {
    const p = lirePerimetre(reel.sortie);
    expect(p, reel.sortie).not.toBeNull();
    const taches = backlog().taches;
    // Le total est celui du registre, et chaque tâche est rangée UNE fois, dedans ou dehors.
    expect(p!.total).toBe(taches.length);
    const dehors = [...p!.complement.values()].flat();
    expect(dehors.length).toBe(p!.annonceComplement);
    expect(p!.dedans.length + dehors.length).toBe(taches.length);
    expect(new Set([...p!.dedans, ...dehors]).size).toBe(taches.length);
    expect(p!.dedans.length).toBeGreaterThan(0);
    expect(dehors.length).toBeGreaterThan(0);
  });

  it('REQ-QA-014 : le complément est NOMMÉ — une tâche d un autre dépôt, une tâche sans promesse', () => {
    const p = lirePerimetre(reel.sortie)!;
    expect(p, reel.sortie).not.toBeNull();
    const taches = backlog().taches;
    // Oracles plus simples que la garde : ils se lisent dans le registre, sans disque.
    const ailleurs = taches.filter((t) => t.repo !== 'partners').map((t) => t.id);
    const sansPromesse = taches
      .filter((t) => t.repo === 'partners' && Object.keys(t.tests ?? {}).length === 0)
      .map((t) => t.id);
    expect(ailleurs.length).toBeGreaterThan(0);
    expect(sansPromesse.length).toBeGreaterThan(0);
    expect([...(p.complement.get('hors_depot') ?? [])].sort()).toEqual([...ailleurs].sort());
    expect([...(p.complement.get('sans_promesse') ?? [])].sort()).toEqual([...sansPromesse].sort());
  });

  it('REQ-QA-014 : la garde reste verte sur le dépôt, plancher compris', () => {
    const p = lirePerimetre(reel.sortie);
    expect(p, reel.sortie).not.toBeNull();
    expect(p!.dedans.length).toBeGreaterThanOrEqual(p!.plancher);
    expect(reel.code, reel.sortie).toBe(0);
  });
});

describe('gov:trace — le plancher déclaré (RM-02, RM-10)', () => {
  it(
    'REQ-QA-014 : le plancher rougit quand la couverture passe dessous, et imprime les deux chiffres',
    () => {
      const p = lirePerimetre(reel.sortie);
      expect(p, reel.sortie).not.toBeNull();
      // On retire du périmètre JUSTE ce qu'il faut pour passer sous le plancher, en frappant au
      // MILIEU de la liste : un témoin construit contre le dernier élément ne distingue pas
      // « tous » de « le dernier ».
      const aRetirer = p!.dedans.length - p!.plancher + 1;
      // 🔧 GOV-101 : le périmètre a passé le DOUBLE du plancher (90 pour 45). À partir du milieu, il
      // ne restait plus assez d'éléments pour en retirer `aRetirer` — le témoin rougissait sur sa
      // propre arithmétique (« expected 45 to be 46 »), pas sur la garde. Le point de frappe reste le
      // milieu tant qu'il laisse assez d'éléments derrière lui, et recule juste ce qu'il faut sinon.
      const milieu = Math.min(Math.floor(p!.dedans.length / 2), p!.dedans.length - aRetirer);
      const cibles = new Set(p!.dedans.slice(milieu, milieu + aRetirer));
      expect(cibles.size).toBe(aRetirer);
      const b = backlog();
      for (const t of b.taches) if (cibles.has(t.id)) delete t.tests;
      const d = bac();
      writeFileSync(join(d, 'tasks.json'), JSON.stringify(b, null, 2));
      const r = lancer(TRACE, '--taches', join(d, 'tasks.json'), '--out', join(d, 'vue.md'));
      expect(r.code, r.sortie).not.toBe(0);
      expect(r.sortie).toContain('couverture_sous_plancher');
      expect(r.sortie).toContain(`plancher déclaré : ${p!.plancher}`);
      expect(r.sortie).toContain(`périmètre : ${p!.plancher - 1} tâche(s)`);
    },
    LONG
  );

  it(
    'REQ-QA-014 : contre-témoin — le plancher reste VERT quand la couverture MONTE',
    () => {
      const p = lirePerimetre(reel.sortie);
      expect(p, reel.sortie).not.toBeNull();
      const b = backlog();
      // Une tâche sans promesse en reçoit une vers CE fichier, qui cite REQ-QA-014 : elle entre
      // dans le périmètre sans qu'aucune autre famille n'ait de raison de rougir.
      const cible = (p!.complement.get('sans_promesse') ?? [])[0];
      expect(cible).toBeDefined();
      const t = b.taches.find((x) => x.id === cible)!;
      t.tests = { 'REQ-QA-014': [CE_FICHIER] };
      const d = bac();
      const chemin = join(d, 'tasks.json');
      const vue = join(d, 'vue.md');
      writeFileSync(chemin, JSON.stringify(b, null, 2));
      const rendu = lancer(TRACE, '--render', '--taches', chemin, '--out', vue);
      expect(rendu.code, rendu.sortie).toBe(0);
      const r = lancer(TRACE, '--taches', chemin, '--out', vue);
      expect(r.code, r.sortie).toBe(0);
      expect(r.sortie).toContain(`périmètre : ${p!.dedans.length + 1} tâche(s)`);
      expect(r.sortie).toContain(`plancher déclaré : ${p!.plancher}`);
    },
    LONG
  );

  it(
    'REQ-QA-014 : la preuve énumère les familles du plancher, chacune vue rougir sur son témoin',
    () => {
      const r = lancer(TRACE, '--prove');
      expect(r.code, r.sortie).toBe(0);
      const familles = r.sortie
        .split('\n')
        .filter((l) => l.trim().startsWith('•'))
        .map((l) => l.trim().slice(1).trim());
      expect(familles).toContain('couverture_sous_plancher');
      expect(familles).toContain('plancher_non_declare');
    },
    LONG
  );
});

describe('gov:inventaire — une tâche fabriquée ne porte pas de preuve (GOV-043)', () => {
  /** Un backlog proposé qui AJOUTE une tâche que le registre ne connaît pas. */
  function fabriquer(statut: string): string {
    const b = backlog();
    // La preuve est BIEN FORMÉE : les chemins d'une tâche réellement livrée ici, qui existent.
    const modele = b.taches.find(
      (t) => t.repo === 'partners' && t.statut === 'fusionnee' && t.paths.some((c) => existsSync(c))
    )!;
    expect(modele).toBeDefined();
    expect(b.taches.some((t) => t.id === 'GOV-999')).toBe(false);
    b.taches.push({ ...modele, id: 'GOV-999', statut, tests: undefined });
    const d = bac();
    writeFileSync(join(d, 'tasks.json'), JSON.stringify(b, null, 2));
    return join(d, 'tasks.json');
  }

  it(
    'REQ-QA-014 : une tâche livrée absente du registre fait sortir la garde en échec, nommée',
    () => {
      const r = lancer(INVENTAIRE, '--taches', fabriquer('fusionnee'));
      expect(r.code, r.sortie).not.toBe(0);
      expect(r.sortie).toContain('tache_preuve_manquante');
      expect(r.sortie).toContain('GOV-999 est « fusionnee »');
      expect(r.sortie).toContain("n'existe pas au registre");
    },
    LONG
  );

  it(
    'REQ-QA-014 : contre-témoin — une tâche NEUVE à faire, proposée au versement, reste verte',
    () => {
      const r = lancer(INVENTAIRE, '--taches', fabriquer('a_faire'));
      expect(r.code, r.sortie).toBe(0);
    },
    LONG
  );
});
