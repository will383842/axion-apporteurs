// @req REQ-GOV-026
/**
 * GOV-140 — une sortie lue par un PIPE arrive ENTIÈRE. `console.log(gros); process.exit(0)` la
 * tronquait au tampon du noyau (64 Ko) sous Linux : `gov:inventaire --rapport` (plus de 146 Ko) rendait
 * un JSON coupé, et sept témoins d'`inventaire-prouve.spec.ts` rougissaient en CI.
 *
 * TÉMOINS (rouges d'abord SOUS LINUX, en CI ; Windows ne tronque pas de la même façon) :
 *   1. le vrai rapport, lu par un pipe, est un JSON complet ;
 *   2. un texte de plus de 256 Ko, écrit par `ecrireEtSortir`, arrive entier, octet pour octet.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const TSX = resolve('node_modules/tsx/dist/cli.mjs');

describe('REQ-GOV-026 — une sortie lue par un pipe arrive entière (GOV-140)', () => {
  it('REQ-GOV-026 — le rapport de gov:inventaire, lu par un pipe, est un JSON complet', () => {
    const r = spawnSync(process.execPath, [TSX, 'scripts/gates/gov-inventaire.ts', '--rapport'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(64 * 1024);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('REQ-GOV-026 — TÉMOIN : plus de 256 Ko écrits par ecrireEtSortir arrivent entiers, puis le code de sortie', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'sortie-'));
    try {
      const script = join(dossier, 'ecrire.ts');
      writeFileSync(
        script,
        `import { ecrireEtSortir } from ${JSON.stringify(resolve('scripts/lib/sortie.ts'))};\n` +
          `ecrireEtSortir('x'.repeat(300 * 1024) + 'FIN', 3);\n`
      );
      const r = spawnSync(process.execPath, [TSX, script], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(r.stdout.length).toBe(300 * 1024 + 'FIN'.length + 1);
      expect(r.stdout.endsWith('FIN\n')).toBe(true);
      expect(r.status).toBe(3);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
