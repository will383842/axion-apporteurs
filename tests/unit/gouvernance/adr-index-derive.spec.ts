/**
 * adr-index-derive.spec.ts — l'index des ADR est une VUE, et le dossier des ADR a une garde.
 *
 * @req REQ-GOV-008
 * @req REQ-CPL-018
 *
 * C'est le test que `docs/tasks.json` déclare pour GOV-009, sur SES DEUX exigences.
 *
 * POURQUOI IL EST ICI ET PAS SOUS `tests/gov/`. `vitest.config.ts` n'inclut que `src/**`,
 * `tests/unit/**` et `tests/schemas/**` — un fichier posé sous `tests/gov/` ne serait JAMAIS
 * exécuté, et une suite qui ne tourne pas ne garde rien. Le backlog nomme ce test par son nom de
 * fichier, sans chemin ; il est donc placé là où la configuration le lance, à côté de
 * `gardes.spec.ts`, qui exerce les autres gardes de gouvernance.
 *
 * LE ROUGE. Le troisième cas ci-dessous construit un dossier d'ADR à part, en fait rendre l'index,
 * puis en retire une ligne À LA MAIN et vérifie que `adr:index --verifier` sort en erreur. C'est
 * exactement la dérive qui a motivé REQ-GOV-008 — un index figé pendant huit ADR — et c'est le seul
 * moyen de savoir que le contrôle mesure sa cible (RM-02). Les deux rouges, obtenus verbatim le
 * 2026-09-03 :
 *
 *   ❌ adr:index — <dossier>\INDEX.md diffère du listage de <dossier>. L'index est une VUE :
 *      corrige le dossier ou regénère (`pnpm adr:index`), n'édite pas la vue.
 *
 *   ❌ gov:adr — 1 faute(s) dans le dossier des ADR (REQ-GOV-008) :
 *      ── index_non_derive (1)
 *         docs\adr\INDEX.md diffère du listage du dossier (« index ≠ ls », REQ-GOV-008).
 *         L'index est une VUE : regénère-le par `pnpm adr:index`, ne l'édite pas.
 *
 * La garde a par ailleurs rougi, au premier passage, sur le gabarit lui-même : il écrivait son
 * contre-exemple entre accents graves — la forme d'une RÉFÉRENCE — au lieu de guillemets. Elle a
 * donc trouvé son premier défaut sur le livrable qui la porte, avant d'être armée.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NOM_ADR, GABARIT, entrees, rendreIndex } from '../../../scripts/adr/index';

const RACINE = 'docs/adr';
const INDEX = join(RACINE, 'INDEX.md');

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', script, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les numéros que l'index déclare, dans son ordre. */
function numerosDeLIndex(): string[] {
  return [...readFileSync(INDEX, 'utf8').matchAll(/partners\/ADR-(\d{4})/g)].map((m) => m[1]!);
}

describe("l'index des ADR est dérivé du système de fichiers", () => {
  it('REQ-GOV-008 — docs/adr/INDEX.md est égal au listage de docs/adr/, gabarit exclu', () => {
    const listage = readdirSync(RACINE)
      .filter((f) => NOM_ADR.test(f) && f !== GABARIT)
      .sort()
      .map((f) => NOM_ADR.exec(f)![1]!);

    expect(listage.length).toBeGreaterThan(0);
    expect(numerosDeLIndex()).toEqual(listage);
    expect(readFileSync(INDEX, 'utf8')).toBe(rendreIndex(entrees(RACINE)));
  });

  it('REQ-GOV-008 — les numéros sont uniques et consécutifs depuis 0001', () => {
    const numeros = numerosDeLIndex().map(Number);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });

  it('REQ-GOV-008 — un index tenu à la main est refusé (le rouge de cette tâche)', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'adr-temoin-'));
    try {
      const adr = [
        '# partners/ADR-0001 — Un témoin',
        '',
        '| Champ | Valeur |',
        '| --- | --- |',
        '| **Statut** | `propose` |',
        '| **Date** | 2026-09-03 |',
        '| **Tâche** | GOV-009 |',
        '',
      ].join('\n');
      writeFileSync(join(dossier, '0001-temoin.md'), adr);

      const rendu = lancer('scripts/adr/index.ts', '--racine', `"${dossier}"`);
      expect(rendu.code).toBe(0);
      expect(lancer('scripts/adr/index.ts', '--racine', `"${dossier}"`, '--verifier').code).toBe(0);

      const index = join(dossier, 'INDEX.md');
      writeFileSync(index, readFileSync(index, 'utf8').replace(/\| \[`partners\/ADR-0001`\][^\n]*\n/, ''));

      const apres = lancer('scripts/adr/index.ts', '--racine', `"${dossier}"`, '--verifier');
      expect(apres.code).toBe(1);
      expect(apres.sortie).toContain('diffère du listage');
    } finally {
      // On ne détruit que ce qu'on a créé soi-même.
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-008 — le rendu est reproductible : deux générations, le même octet', () => {
    expect(rendreIndex(entrees(RACINE))).toBe(rendreIndex(entrees(RACINE)));
  });
});

describe('gov:adr — la garde du dossier des ADR', () => {
  it('REQ-GOV-008 — est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer('scripts/gates/gov-adr.ts');
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it('REQ-GOV-008 — sait rougir : ses 12 familles ont chacune un témoin, 5 contre-témoins restent verts', () => {
    const { code, sortie } = lancer('scripts/gates/gov-adr.ts', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('Les 12 familles rougissent');
    expect(sortie).toContain('5 contre-témoins restent verts');
  });

  it('REQ-GOV-008 — la preuve énumère ses familles, elle ne les compte pas', () => {
    // Une preuve qui annonce un total sans dire lesquelles a déjà laissé passer trois familles
    // réputées prouvées sans témoin (gov:publication, 2026-09-03).
    const { sortie } = lancer('scripts/gates/gov-adr.ts', '--prove');
    const lignes = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(lignes.length).toBe(12);
  });
});

describe('le mono-tenant est consigné par un ADR', () => {
  it('REQ-CPL-018 — un ADR consigne le mono-tenant, cite HYP-TENANT et refuse la colonne de locataire', () => {
    const fichiers = readdirSync(RACINE).filter((f) => NOM_ADR.test(f) && f !== GABARIT);
    const porteurs = fichiers.filter((f) => readFileSync(join(RACINE, f), 'utf8').includes('REQ-CPL-018'));

    expect(porteurs.length).toBe(1);

    const texte = readFileSync(join(RACINE, porteurs[0]!), 'utf8').replace(/[*`]/g, '');
    expect(texte).toContain('HYP-TENANT');
    expect(texte).toMatch(/mono-tenant en V1/i);
    expect(texte).toMatch(/aucune colonne de locataire/i);

    // …et il est indexé : une décision qu'aucun index ne porte est une décision qu'on ne retrouve pas.
    const numero = NOM_ADR.exec(porteurs[0]!)![1]!;
    expect(readFileSync(INDEX, 'utf8')).toContain(`partners/ADR-${numero}`);
  });
});
