// @req REQ-GOV-006
// @req REQ-GOV-023
/**
 * L'état vivant : ce que PLAN-STATE doit porter, et la garde qui le tient fraîche.
 *
 * POURQUOI CE FICHIER EXISTE. `docs/PLAN-STATE.md` est une VUE (partners/ADR-0005 §1) : on ne
 * l'édite pas, on corrige son générateur. Deux choses ne se dérivaient d'aucune source avant
 * GOV-008 — la file de fusion ORDONNÉE et le journal fait/reste/appris — et une troisième ne se
 * gardait par rien : la fraîcheur du fichier. Un état vivant périmé est pire qu'absent, parce
 * qu'on le lit en croyant qu'il dit le présent.
 *
 * La garde `gov:etat` lit GitHub. Ce fichier vérifie donc aussi ce qu'elle fait quand elle ne
 * PEUT PAS le lire : elle échoue, ou elle se déclare hors périmètre en le NOMMANT. Jamais verte
 * en silence — une gate qui passe parce qu'elle n'a rien pu lire est pire que pas de gate.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = 'scripts/gates/gov-etat.ts';
const CHEMIN_PLAN_STATE = 'docs/PLAN-STATE.md';
const CHEMIN_JOURNAL = 'docs/journal';

/**
 * Un instant FIXE, jamais `new Date()` : une garde qui lit l'horloge n'est pas rejouable, et son
 * verdict dépend alors de l'heure à laquelle la CI a démarré (RM-11 — aucun défaut sur ce que le
 * test fait varier ; ici l'instant ne varie pas, il est donné).
 */
const MAINTENANT = '2026-09-04T09:00:00Z';

function lancer(args: string[], env: Record<string, string> = {}): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, ...env },
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les rubriques que REQ-GOV-006 énumère nommément, et que la vue doit rendre. */
const RUBRIQUES = [
  '## REPRENDRE EN 30 SECONDES',
  '## File de fusion',
  '## Revendications',
  '## Décisions du jour',
  '## Prochain pas',
  '## Journal',
  '## Dernier atterrissage',
];

describe('REQ-GOV-006 — un seul état vivant, et il dit le présent', () => {
  it('REQ-GOV-006 — PLAN-STATE porte les sept rubriques que l’exigence énumère, bloc « REPRENDRE EN 30 SECONDES » compris', () => {
    const texte = readFileSync(CHEMIN_PLAN_STATE, 'utf8');
    const absentes = RUBRIQUES.filter((r) => !texte.includes(r));
    expect(absentes).toEqual([]);
  });

  it('REQ-GOV-006 — le bloc « REPRENDRE EN 30 SECONDES » ouvre le fichier : il est lu avant tout le reste', () => {
    const texte = readFileSync(CHEMIN_PLAN_STATE, 'utf8');
    const iReprise = texte.indexOf('## REPRENDRE EN 30 SECONDES');
    const iPhase = texte.indexOf('## Phase courante');
    expect(iReprise).toBeGreaterThan(0);
    expect(iReprise).toBeLessThan(iPhase);
  });

  it('REQ-GOV-006 — le bloc de reprise porte le SHA de la branche principale, sans qu’il faille descendre le chercher', () => {
    const texte = readFileSync(CHEMIN_PLAN_STATE, 'utf8');
    const bloc = texte.slice(
      texte.indexOf('## REPRENDRE EN 30 SECONDES'),
      texte.indexOf('## Phase courante')
    );
    // Le SHA court de `origin/main`, tel que `git rev-parse --short` le rend : 7 caractères hexa
    // encadrés d'accents graves. On vérifie la PRÉSENCE d'un SHA, pas sa valeur — figer la valeur
    // ferait rougir le test à chaque fusion, pour une raison qui n'est pas la faute cherchée.
    expect(bloc).toMatch(/`[0-9a-f]{7,40}`/);
  });

  it('REQ-GOV-006 — gov:etat est verte sur l’état du dépôt et NOMME les familles qu’elle a évaluées', () => {
    const { code, sortie } = lancer(['--now', MAINTENANT]);
    expect(sortie).toContain('✅');
    expect(sortie).toContain('familles évaluées');
    expect(code).toBe(0);
  });

  it('REQ-GOV-006 — gov:etat sait rougir : chacune de ses familles a un témoin, et ses contre-témoins restent verts', () => {
    const { code, sortie } = lancer(['--prove']);
    expect(sortie).toContain('familles rougissent');
    expect(code).toBe(0);
  });

  it('REQ-GOV-006 — la preuve n’est pas un décompte : la sortie énumère les familles une par une', () => {
    const { sortie } = lancer(['--prove']);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    const annonce = /Les (\d+) familles rougissent/.exec(sortie);
    expect(annonce).not.toBeNull();
    expect(puces.length).toBe(Number(annonce?.[1]));
  });

  it('REQ-GOV-006 — sans lecture GitHub possible, gov:etat ÉCHOUE au lieu de verdir en silence', () => {
    // Le seul point d'entrée vers GitHub est nommé par `GOV_ETAT_GH` : le pointer sur une commande
    // qui n'existe pas reproduit exactement « pas de `gh`, pas de réseau ». C'est le scénario qui
    // rend une gate décorative : elle ne lit rien, ne trouve rien, et se déclare verte.
    const { code, sortie } = lancer(['--now', MAINTENANT], { GOV_ETAT_GH: 'gh-qui-nexiste-pas-axion' });
    expect(code).not.toBe(0);
    expect(sortie).toContain('github_illisible');
  });

  it('REQ-GOV-006 — `--hors-ligne` déclare les familles GitHub HORS PÉRIMÈTRE et les nomme, au lieu de les taire', () => {
    const { code, sortie } = lancer(['--hors-ligne', '--now', MAINTENANT]);
    expect(code).toBe(0);
    expect(sortie).toContain('HORS PÉRIMÈTRE');
    expect(sortie).toContain('plan_state_perime');
    expect(sortie).toContain('deux_pr_meme_tache');
    expect(sortie).toContain('pr_fusionnee_sans_journal');
  });

  it('REQ-GOV-006 — sans `--now`, la famille qui a besoin d’un instant est déclarée NON ÉVALUÉE, pas réputée verte', () => {
    const { code, sortie } = lancer(['--hors-ligne']);
    expect(code).toBe(0);
    expect(sortie).toContain('journal_date_future');
    expect(sortie).toContain('NON ÉVALUÉE');
  });
});

describe('REQ-GOV-023 — le journal précède la fusion', () => {
  /** Les entrées du journal, lues à sa source — jamais dans la vue qui les rend. */
  function entrees(): { pr: number; corps: string }[] {
    const out: { pr: number; corps: string }[] = [];
    for (const f of readdirSync(CHEMIN_JOURNAL).filter((n) => n.endsWith('.md'))) {
      const texte = readFileSync(join(CHEMIN_JOURNAL, f), 'utf8');
      const blocs = texte.split(/^## /m).slice(1);
      for (const b of blocs) {
        const m = /^PR #(\d+) — (\d{4}-\d{2}-\d{2}) — /.exec(b);
        if (m && m[1]) out.push({ pr: Number(m[1]), corps: b });
      }
    }
    return out;
  }

  it('REQ-GOV-023 — le journal a une SOURCE à lui, distincte de PLAN-STATE, et elle porte des entrées', () => {
    // PLAN-STATE est une vue : y écrire le journal à la main le ferait effacer à la prochaine
    // génération. Le journal est le seul contenu de l'état vivant que personne ne peut dériver ;
    // il lui fallait donc un fichier source, et c'est `docs/journal/`.
    expect(entrees().length).toBeGreaterThan(0);
  });

  it('REQ-GOV-023 — chaque entrée cite un numéro de PR et porte fait / reste / appris', () => {
    for (const e of entrees()) {
      expect(e.pr, `entrée PR #${e.pr} : numéro`).toBeGreaterThan(0);
      expect(e.corps, `entrée PR #${e.pr} : fait`).toContain('**Fait.**');
      expect(e.corps, `entrée PR #${e.pr} : reste`).toContain('**Reste.**');
      expect(e.corps, `entrée PR #${e.pr} : appris`).toContain('**Appris.**');
    }
  });

  it('REQ-GOV-023 — PLAN-STATE REND le journal depuis sa source : la dernière entrée s’y retrouve', () => {
    const derniere = entrees().sort((a, b) => b.pr - a.pr)[0];
    expect(derniere).toBeDefined();
    const vue = readFileSync(CHEMIN_PLAN_STATE, 'utf8');
    const section = vue.slice(vue.indexOf('## Journal'));
    expect(section).toContain(`#${derniere?.pr}`);
    expect(section).toContain('docs/journal/');
  });
});
