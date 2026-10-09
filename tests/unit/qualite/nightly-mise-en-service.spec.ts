// @req REQ-QA-027
/**
 * QA-T56 (REQ-QA-027) — le nightly ne rougit pas sur une condition de mise en service.
 *
 * `runbooks:exerces` juge ce qui doit être exercé AVANT la mise en service. Lancé sans date, il
 * rougissait chaque nuit pour un travail qui n'est pas en retard. La garde sait maintenant ne pas
 * juger avant `MISE_EN_SERVICE` — à condition que le nightly lui FOURNISSE `--now` en UTC (elle ne
 * lit pas l'horloge). Ce fichier garde le câblage, lu dans `.github/workflows/nightly.yml` :
 *   1. l'étape de verdict passe `--now $(date -u +%F)` ;
 *   2. la preuve (`runbooks:exerces:prove`) reste, sans condition : la garde doit savoir rougir ;
 *   3. aucune des deux n'est conditionnée (`if:`) ni tolérée (`continue-on-error`) : la bascule se
 *      fait dans la garde, sur la seule source `MISE_EN_SERVICE`, jamais dans le YAML.
 * `gov:lecons` n'est PAS concerné : son rouge (une consolidation vieillie) est une vraie alerte.
 * Chaque règle est jugée sur le nightly réel ET sur un nightly cassé d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const NIGHTLY = readFileSync('.github/workflows/nightly.yml', 'utf8').replace(/\r\n/g, '\n');
const JOB = 'runbooks-exerces';
const VERDICT = 'run: pnpm runbooks:exerces --now $(date -u +%F)';
const PREUVE = 'run: pnpm runbooks:exerces:prove';

/** Le texte d'un job : de sa clé (deux espaces) à la clé suivante du même niveau. */
function job(yaml: string, id: string): string | null {
  const lignes = yaml.split('\n');
  const debut = lignes.findIndex((l) => l === `  ${id}:`);
  if (debut < 0) return null;
  const fin = lignes.findIndex((l, i) => i > debut && /^ {2}[\w-]+:\s*$/.test(l));
  return lignes.slice(debut, fin < 0 ? undefined : fin).join('\n');
}

function fautes(yaml: string): string[] {
  const t = job(yaml, JOB);
  if (t === null) return [`job ${JOB} absent`];
  const f: string[] = [];
  const runs = t.split('\n').filter((l) => /^\s+(- )?run: pnpm runbooks:exerces/.test(l));
  if (!runs.some((l) => l.trim().replace(/^- /, '') === VERDICT))
    f.push('le verdict ne reçoit pas --now en UTC');
  if (!runs.some((l) => l.trim().replace(/^- /, '') === PREUVE)) f.push('la preuve a disparu');
  if (runs.some((l) => /runbooks:exerces(\s*$|\s+(?!--now))/.test(l.trim())))
    f.push('un verdict sans --now subsiste');
  if (/^\s+if:/m.test(t)) f.push('une étape est conditionnée');
  if (/continue-on-error/.test(t)) f.push('une étape est tolérée');
  return f;
}

describe('REQ-QA-027 — le nightly fournit la date, la garde décide', () => {
  it('REQ-QA-027 : le job des runbooks passe --now en UTC, garde sa preuve, sans if ni tolérance', () => {
    expect(fautes(NIGHTLY)).toEqual([]);
  });

  it('REQ-QA-027 : TÉMOINS — chaque câblage cassé d’un geste rougit, nommé', () => {
    const t = job(NIGHTLY, JOB)!;
    const casse = (de: string, vers: string) => NIGHTLY.replace(t, t.replace(de, vers));
    expect(fautes(casse(VERDICT, 'run: pnpm runbooks:exerces'))).toEqual([
      'le verdict ne reçoit pas --now en UTC',
      'un verdict sans --now subsiste',
    ]);
    expect(fautes(casse(PREUVE, 'run: echo plus de preuve'))).toEqual(['la preuve a disparu']);
    expect(
      fautes(casse(`        ${VERDICT}`, `        if: \${{ false }}\n        ${VERDICT}`))
    ).toEqual(['une étape est conditionnée']);
    expect(
      fautes(casse(`        ${PREUVE}`, `        continue-on-error: true\n        ${PREUVE}`))
    ).toEqual(['une étape est tolérée']);
    expect(fautes(NIGHTLY.replace(`  ${JOB}:`, '  autre-job:'))).toEqual([`job ${JOB} absent`]);
  });

  it('REQ-QA-027 : gov:lecons est archivée (GOV-160, #319, 6077512137) et ne tourne plus en nightly', () => {
    expect(NIGHTLY).not.toContain('pnpm gov:lecons');
  });
});
