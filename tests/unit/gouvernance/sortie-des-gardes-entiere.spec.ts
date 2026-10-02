// @req REQ-GOV-026
// @req REQ-QA-013
/**
 * GOV-140 — la sortie d'une garde, lue par un PIPE, arrive ENTIÈRE.
 *
 * Sous Linux, stdout vers un pipe est asynchrone : `console.log(gros); process.exit(0)` coupait le
 * dernier morceau. `gov:inventaire --rapport` (plus de 146 Ko) rendait en CI un JSON tronqué
 * (« Expected ',' or ']' after array element … position 146080 »), et `inventaire-prouve.spec.ts`
 * rougissait sur #384 et #372, alors qu'il passait sous Windows, où le pipe est synchrone.
 *
 * TÉMOINS :
 *   1. le rapport, lu par un pipe, est un JSON complet et de la BONNE longueur — rouge sur l'ancien
 *      code SOUS LINUX (constaté en CI) ;
 *   2. un BALAYAGE : aucun script de `scripts/gates/` ni de `scripts/lot/` n'écrit un JSON sur stdout
 *      puis ne sort par un `process.exit` synchrone dans le même bloc ; il NOMME tout fautif, et il voit
 *      l'ancien `gov-inventaire.ts`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TSX = resolve('node_modules/tsx/dist/cli.mjs');
const DOSSIERS = ['scripts/gates', 'scripts/lot'];
/** Le tampon d'un pipe sous Linux : au-delà, une sortie coupée se voit. */
const TAMPON_DU_PIPE = 64 * 1024;

/**
 * Les sorties JSON suivies d'un `process.exit` synchrone : un `console.log` ou un
 * `process.stdout.write` SANS rappel, qui porte un `JSON.stringify`, puis un `process.exit(` avant la
 * fin du bloc (une accolade fermante en colonne 0). Rend `fichier:ligne`.
 */
function sortiesCoupees(fichier: string, texte: string): string[] {
  const lignes = texte.split('\n');
  const fautes: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    if (!/console\.log\(|process\.stdout\.write\(/.test(lignes[i]!)) continue;
    const appel = lignes.slice(i, i + 4).join(' ');
    if (!/JSON\.stringify/.test(appel)) continue;
    for (let j = i + 1; j < Math.min(lignes.length, i + 80); j++) {
      if (/^\}/.test(lignes[j]!)) break;
      if (/process\.stdout\.write\([^)]*,\s*\(\)\s*=>\s*process\.exit/.test(lignes[j]!)) break;
      if (/^\s*process\.exit\(/.test(lignes[j]!)) {
        fautes.push(`${fichier}:${i + 1}`);
        break;
      }
    }
  }
  return fautes;
}

describe('REQ-GOV-026 — le rapport de gov:inventaire, lu par un pipe, arrive entier (GOV-140)', () => {
  it('REQ-GOV-026 — TÉMOIN : le rapport lu par un pipe est un JSON complet et de la bonne longueur', () => {
    const r = spawnSync(process.execPath, [TSX, 'scripts/gates/gov-inventaire.ts', '--rapport'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(TAMPON_DU_PIPE);
    const lu = JSON.parse(r.stdout) as unknown;
    expect(r.stdout).toBe(`${JSON.stringify(lu, null, 2)}\n`);
  });
});

describe('REQ-QA-013 — aucune garde n’écrit un JSON sur stdout puis ne sort sans attendre (GOV-140)', () => {
  it('REQ-QA-013 — le balayage de scripts/gates/ et scripts/lot/ ne nomme aucun fautif', () => {
    const fautes: string[] = [];
    let lus = 0;
    for (const d of DOSSIERS)
      for (const f of readdirSync(d).filter((n) => n.endsWith('.ts'))) {
        lus += 1;
        fautes.push(...sortiesCoupees(join(d, f), readFileSync(join(d, f), 'utf8')));
      }
    expect(lus).toBeGreaterThan(40);
    expect(fautes).toEqual([]);
  });

  it('REQ-QA-013 — TÉMOIN : l’ancienne forme du rapport est nommée ; l’écriture avec rappel ne l’est pas', () => {
    const ancienne = [
      "if (process.argv.includes('--rapport')) {",
      '  console.log(',
      '    JSON.stringify(',
      '      { taches: [] },',
      '      null,',
      '      2',
      '    )',
      '  );',
      '  process.exit(0);',
      '}',
    ].join('\n');
    expect(sortiesCoupees('ancien.ts', ancienne)).toEqual(['ancien.ts:2']);
    const corrigee = [
      "if (process.argv.includes('--rapport')) {",
      '  const rapport = JSON.stringify({ taches: [] }, null, 2);',
      '  process.stdout.write(`${rapport}\\n`, () => process.exit(0));',
      '}',
    ].join('\n');
    expect(sortiesCoupees('corrige.ts', corrigee)).toEqual([]);
  });
});

/**
 * QA-T60, point (3) — note de la lentille securite sur GOV-140 : le rappel d'écriture du rapport
 * ignorait son erreur. Un tube fermé avant la fin (EPIPE) ne recevait pas le rapport, et la garde
 * sortait pourtant en 0 : un lecteur qui coupe trop tôt prenait une absence pour un succès.
 */
describe('REQ-GOV-026 — une écriture du rapport qui échoue sort en non nul (QA-T60)', () => {
  it('REQ-GOV-026 — TÉMOIN : le rapport écrit dans un tube déjà fermé fait sortir gov:inventaire en non nul', async () => {
    const { spawn } = await import('node:child_process');
    const code = await new Promise<number | null>((resoudre) => {
      const p = spawn(process.execPath, [TSX, 'scripts/gates/gov-inventaire.ts', '--rapport'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      p.stdout.destroy();
      p.on('close', (c) => resoudre(c));
    });
    expect(code).not.toBe(0);
  }, 60_000);
});
