/**
 * fiches-agents.spec.ts — les quinze fiches de rôle sont DÉRIVÉES de `docs/agents.json`.
 *
 * @req REQ-GOV-010
 *
 * C'est le test que `docs/tasks.json` déclare pour GOV-023, sur son unique exigence.
 *
 * POURQUOI IL EST ICI ET PAS SOUS `tests/gov/`. Le backlog nomme le fichier sans chemin ; il est
 * placé là où `vitest.config.ts` le lance, à côté de `adr-index-derive.spec.ts` qui exerce la
 * garde jumelle. Une suite qui ne tourne pas ne garde rien.
 *
 * CE QUE CE TEST TIENT. Avant GOV-023, `docs/CHARTE-AGENTS.md` §2 (le tableau des quinze postes,
 * leurs outils, leur droit d'écriture) et les quinze fiches de `.claude/agents/` étaient DEUX
 * textes tenus à la main qui devaient s'accorder — exactement le défaut que RM-01 nomme. La source
 * est désormais `docs/agents.json` ; la fiche en est une vue (frontmatter + bloc généré), et la
 * charte lui est CONFRONTÉE ligne par ligne. `docs/CHARTE-AGENTS.md` reste tenue à la main : elle
 * est partagée, GOV-023 ne l'écrit pas — mais elle ne peut plus diverger en silence.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CHEMIN_FICHES,
  SECTIONS,
  lireSource,
  proseDe,
  rendreFiche,
  normaliser,
} from '../../../scripts/agents/generer';

const CHARTE = 'docs/CHARTE-AGENTS.md';
const WORKFLOW = 'scripts/lot/lot.workflow.js';

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** La section d'un document markdown, de son titre au titre suivant de même niveau. */
function sectionCharte(debut: string, fin: string): string {
  const texte = readFileSync(CHARTE, 'utf8');
  const d = texte.indexOf(debut);
  const f = texte.indexOf(fin, d + debut.length);
  return texte.slice(d, f < 0 ? undefined : f);
}

const postes = lireSource();

describe('docs/agents.json — la source unique des quinze fiches de rôle', () => {
  it('REQ-GOV-010 — la source déclare les quinze postes, codes A01 à A15 uniques', () => {
    expect(postes.length).toBe(15);
    const codes = postes.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual(Array.from({ length: 15 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`));
    const roles = postes.map((p) => p.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('REQ-GOV-010 — chaque poste porte mission, entrées, sorties, interdits, documents et outils', () => {
    for (const p of postes) {
      expect(p.mission.length, `${p.code} mission`).toBeGreaterThan(20);
      expect(p.entrees.length, `${p.code} entrees`).toBeGreaterThan(0);
      expect(p.sorties.length, `${p.code} sorties`).toBeGreaterThan(0);
      expect(p.interdits.length, `${p.code} interdits`).toBeGreaterThan(0);
      expect(p.documents.length, `${p.code} documents`).toBeGreaterThan(0);
      expect(p.tools.length, `${p.code} tools`).toBeGreaterThan(0);
    }
  });

  it('REQ-GOV-010 — tout chemin de documents[] existe sur le disque', () => {
    // Une fiche qui envoie lire `docs/spec/` — dossier que ce dépôt n'a pas — envoie l'agent
    // chercher un texte qui n'existe pas, et il invente. C'est la famille `document_absent`.
    const absents = postes.flatMap((p) => p.documents.filter((d) => !existsSync(d.chemin)).map((d) => `${p.role} → ${d.chemin}`));
    expect(absents).toEqual([]);
  });
});

describe('les fiches sont une VUE de la source', () => {
  it('REQ-GOV-010 — chaque fiche `.claude/agents/<role>.md` est égale au rendu de la source', () => {
    for (const p of postes) {
      const chemin = join(CHEMIN_FICHES, `${p.role}.md`);
      expect(existsSync(chemin), chemin).toBe(true);
      const surDisque = readFileSync(chemin, 'utf8');
      expect(normaliser(surDisque), chemin).toBe(normaliser(rendreFiche(p, proseDe(surDisque))));
    }
  });

  it('REQ-GOV-010 — aucune fiche orpheline : un fichier de `.claude/agents/` sans poste ne résout pas', () => {
    const surDisque = readdirSync(CHEMIN_FICHES).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
    expect([...surDisque].sort()).toEqual([...postes.map((p) => p.role)].sort());
  });

  it('REQ-GOV-010 — chaque fiche porte les cinq sections (mission, entrées, sorties, interdits, documents)', () => {
    for (const p of postes) {
      const texte = readFileSync(join(CHEMIN_FICHES, `${p.role}.md`), 'utf8');
      for (const s of SECTIONS) {
        expect(texte, `${p.role} · ${s}`).toContain(`### ${s}`);
      }
    }
  });

  it('REQ-GOV-010 — le frontmatter reste lisible par l’outillage : `name`, `description`, `tools`', () => {
    // Si cette forme casse, les quinze rôles cessent de résoudre et l'autopilote meurt au premier
    // agent : `agentType` est résolu par le NOM de fichier et le champ `name`.
    for (const p of postes) {
      const texte = normaliser(readFileSync(join(CHEMIN_FICHES, `${p.role}.md`), 'utf8'));
      const m = /^---\n([\s\S]*?)\n---\n/.exec(texte);
      expect(m, p.role).not.toBeNull();
      const entete = m![1]!;
      expect(entete).toContain(`name: ${p.role}`);
      expect(entete).toContain(`description: ${p.description}`);
      expect(entete).toContain(`tools: ${p.tools.join(', ')}`);
    }
  });

  it('REQ-GOV-010 — le rendu est reproductible : deux générations, le même octet', () => {
    for (const p of postes) {
      const prose = proseDe(readFileSync(join(CHEMIN_FICHES, `${p.role}.md`), 'utf8'));
      expect(rendreFiche(p, prose)).toBe(rendreFiche(p, prose));
    }
  });
});

describe('la charte est CONFRONTÉE à la source (elle n’est plus un second texte à la main)', () => {
  it('REQ-GOV-010 — le tableau des postes du §2 et `docs/agents.json` se recouvrent exactement', () => {
    const lignes = [...sectionCharte('## 2.', '## 3.').split('\n')]
      .map((l) => /^\|\s*(A\d{2})\s*\|\s*`([a-z0-9-]+)`\s*\|/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]} ${m[2]}`);
    expect(lignes.sort()).toEqual(postes.map((p) => `${p.code} ${p.role}`).sort());
  });

  it('REQ-GOV-010 — les neuf droits exclusifs sont portés par des postes déclarés dans la source', () => {
    // Le §4 de la charte fait correspondre les neuf droits de REQ-GOV-010 aux codes qui les
    // portent. Chacun doit résoudre : un droit exclusif porté par un code sans fiche n'est
    // exercé par personne.
    const section = sectionCharte('## 4.', '## 5.');
    const lignes = section.split('\n').filter((l) => l.startsWith('|') && /\*\*A\d{2}\*\*/.test(l));
    expect(lignes.length).toBe(9);
    const cites = new Set([...section.matchAll(/\*\*(A\d{2})\*\*/g)].map((m) => m[1]!));
    const connus = new Set(postes.map((p) => p.code));
    expect([...cites].filter((c) => !connus.has(c))).toEqual([]);
  });

  it('REQ-GOV-010 — chaque chemin réservé du §7 nomme un poste de la source (gate de l’exigence)', () => {
    const lignes = sectionCharte('## 7.', '## 8.').split('\n').filter((l) => l.startsWith('|'));
    const labels = lignes
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length >= 4)
      .map((c) => c[2]!.replace(/`/g, '').trim())
      .filter((l) => l.startsWith('role:'))
      .map((l) => l.slice('role:'.length));
    expect(labels.length).toBeGreaterThan(0);
    const connus = new Set(postes.map((p) => p.role));
    expect(labels.filter((l) => !connus.has(l))).toEqual([]);
  });

  it('REQ-GOV-010 — tout `agentType` du workflow de lot désigne une fiche existante', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');
    const types = new Set([...workflow.matchAll(/agentType:\s*([^,}\n]+)/g)].map((m) => m[1]!.trim()));
    expect(types.size).toBeGreaterThan(0);
    const connus = new Set(postes.map((p) => p.role));
    for (const expr of types) {
      const litteraux = [...expr.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
      // `agentType: role` et `agentType: roleDev(t)` sont dynamiques : le contrôle complet est
      // dans `gov-agents.ts`, qui résout l'identifiant. Ici on exige au moins que les littéraux
      // écrits en clair résolvent.
      for (const l of litteraux) expect(connus.has(l), `${l} n'a pas de fiche`).toBe(true);
    }
  });
});

describe('gov:agents — la garde des fiches de rôle', () => {
  it('REQ-GOV-010 — est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer('scripts/gates/gov-agents.ts');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-010 — sait rougir : ses 14 familles ont chacune un témoin, 7 contre-témoins restent verts', () => {
    const { code, sortie } = lancer('scripts/gates/gov-agents.ts', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 14 familles rougissent');
    expect(sortie).toContain('7 contre-témoins restent verts');
  });

  it('REQ-GOV-010 — la preuve énumère ses familles, elle ne les compte pas', () => {
    const { sortie } = lancer('scripts/gates/gov-agents.ts', '--prove');
    const lignes = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(lignes.length).toBe(14);
  });

  it('REQ-GOV-010 — une fiche éditée à la main est refusée (le rouge de cette tâche)', () => {
    const banc = mkdtempSync(join(tmpdir(), 'agents-temoin-'));
    try {
      const fiches = join(banc, 'agents');
      mkdirSync(fiches);
      const source = join(banc, 'agents.json');
      writeFileSync(
        source,
        JSON.stringify(
          {
            postes: [
              {
                code: 'A01',
                role: 'temoin',
                libelle: 'Témoin',
                description: 'Un poste témoin, écrit pour éprouver la garde.',
                mission: 'Éprouver la dérivation des fiches depuis leur source unique.',
                entrees: ['une tâche'],
                sorties: ['un rendu'],
                interdits: ['inventer une décision'],
                documents: [{ chemin: 'docs/REGLES-MAISON.md', pourquoi: 'les douze règles' }],
                tools: ['Read', 'Grep'],
                ecrit: 'non',
                cheminsReserves: [],
              },
            ],
          },
          null,
          2
        )
      );

      expect(lancer('scripts/agents/generer.ts', '--source', `"${source}"`, '--racine', `"${fiches}"`).code).toBe(0);
      expect(
        lancer('scripts/agents/generer.ts', '--source', `"${source}"`, '--racine', `"${fiches}"`, '--verifier').code
      ).toBe(0);

      const fiche = join(fiches, 'temoin.md');
      writeFileSync(fiche, readFileSync(fiche, 'utf8').replace('### Interdits', '### Ce qui est interdit'));

      const apres = lancer('scripts/agents/generer.ts', '--source', `"${source}"`, '--racine', `"${fiches}"`, '--verifier');
      expect(apres.code).toBe(1);
      expect(apres.sortie).toContain('diffère');
    } finally {
      // On ne détruit que ce qu'on a posé (RM-07).
      rmSync(banc, { recursive: true, force: true });
    }
  });
});
