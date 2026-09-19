// @req REQ-QA-006
/**
 * QA-T02 — l'étape « Tests » de Gate A atteint le harnais d'intégration (REQ-QA-006).
 *
 * POURQUOI CE TÉMOIN N'EST PAS DANS `tests/integration/`. Il y a vécu, et il y était aveugle à la
 * panne même qu'il garde : retirer le motif d'intégration de l'`include` de `vitest.config.ts`
 * retire AUSSI ce témoin de la passe. Mesuré le 2026-09-19 : `vitest run` sur la spécification du
 * harnais répond alors « No test files found », `vitest list` ne collecte plus aucun fichier
 * d'intégration, et `pnpm test` n'aurait plus rien à dire — vert. Un témoin logé dans l'ensemble
 * qu'il garde disparaît avec lui. Il vit donc sous `tests/unit/`, que l'`include` collecte par un
 * autre motif.
 *
 * CE QU'IL JUGE, PAR QUEL ACTE.
 *   — `vitest list` sous la configuration du dépôt collecte CHAQUE fichier de test présent sur le
 *     disque sous `tests/integration/` (plancher > 0, compte imprimé) ;
 *   — une configuration privée du motif fait rougir ce même jugement, qui NOMME le dossier perdu ;
 *   — `pnpm test` lance `vitest run` sans filtre, et l'étape du job `gate-a` qui le lance ne porte
 *     ni `if:` ni tolérance d'échec (la tolérance, sur tous les workflows, est jugée par un analyseur
 *     YAML dans `aucune-gate-en-continue-on-error.spec.ts` ; ici, une lecture par indentation).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import configuration from '../../../vitest.config';

/**
 * Le dossier d'intégration, TAPÉ : c'est l'attente, et sa divergence avec la configuration est le
 * signal. Le dériver de l'`include` le ferait disparaître avec le motif qu'il doit garder.
 */
const DOSSIER = 'tests/integration';
const RACINE = resolve('.');
const VITEST = join(RACINE, 'node_modules/vitest/vitest.mjs');

const enBarres = (chemin: string) => chemin.replace(/\\/g, '/');

/** Les fichiers de test présents sur le DISQUE sous le dossier d'intégration, relatifs, triés. */
function fichiersDIntegration(): string[] {
  return readdirSync(join(RACINE, DOSSIER), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(test|spec)\.tsx?$/.test(e.name))
    .map((e) => enBarres(join(e.parentPath, e.name)).slice(enBarres(RACINE).length + 1))
    .sort();
}

/** Ce que `vitest list` collecte sous une configuration, en chemins relatifs à la racine. */
function fichiersCollectes(cheminConfig: string): string[] {
  const r = spawnSync(
    process.execPath,
    [VITEST, 'list', '--filesOnly', '--json', '--config', cheminConfig],
    { cwd: RACINE, encoding: 'utf8', timeout: 120_000 }
  );
  if (r.status !== 0) throw new Error(`vitest list a échoué (code ${r.status}) :\n${r.stderr}`);
  const liste = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) as { file: string }[];
  return liste.map(({ file }) => enBarres(file).slice(enBarres(RACINE).length + 1));
}

/** Les fautes : aucun motif de l'include ne couvre le dossier, puis chaque fichier non collecté. */
function fautesDeCollecte(cheminConfig: string, include: readonly string[]): string[] {
  const fautes: string[] = [];
  if (!include.some((m) => m.startsWith(`${DOSSIER}/`))) {
    fautes.push(`aucun motif de l'include ne couvre ${DOSSIER}/`);
  }
  const collectes = new Set(fichiersCollectes(cheminConfig));
  for (const f of fichiersDIntegration()) if (!collectes.has(f)) fautes.push(`non collecté : ${f}`);
  return fautes;
}

describe('REQ-QA-006 — l’étape « Tests » de Gate A atteint le harnais d’intégration', () => {
  it('REQ-QA-006 — la configuration du dépôt collecte chaque fichier d’intégration du disque', () => {
    const integration = fichiersDIntegration();
    console.log(`collecte : ${integration.length} fichier(s) d'intégration sur le disque`);
    expect(integration.length).toBeGreaterThan(0);
    const fautes = fautesDeCollecte(
      join(RACINE, 'vitest.config.ts'),
      configuration.test?.include ?? []
    );
    expect(fautes, fautes.join('\n')).toEqual([]);
  }, 120_000);

  it('REQ-QA-006 — une configuration privée du motif d’intégration fait rougir le témoin, qui le nomme', () => {
    const bac = mkdtempSync(join(tmpdir(), 'qat02-'));
    try {
      const include = (configuration.test?.include ?? []).filter(
        (m) => !m.startsWith(`${DOSSIER}/`)
      );
      const config = { test: { root: RACINE, include, exclude: configuration.test?.exclude } };
      const chemin = join(bac, 'vitest.config.mjs');
      writeFileSync(chemin, `export default ${JSON.stringify(config)};\n`);
      const fautes = fautesDeCollecte(chemin, include);
      expect(fautes[0]).toBe(`aucun motif de l'include ne couvre ${DOSSIER}/`);
      expect(fautes.slice(1)).toEqual(fichiersDIntegration().map((f) => `non collecté : ${f}`));
    } finally {
      if (!existsSync(join(bac, 'node_modules'))) rmSync(bac, { recursive: true, force: true });
    }
  }, 120_000);

  it('REQ-QA-006 — `pnpm test` lance vitest sans filtre, et l’étape « Tests » du job gate-a le lance sans condition', () => {
    const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const [outil, verbe, ...options] = paquet.scripts.test!.split(/\s+/);
    expect([outil, verbe]).toEqual(['vitest', 'run']);
    // Liste FERMÉE : un chemin, un `--exclude` ou un `--dir` retirerait l'intégration de la passe.
    expect(options.filter((o) => o !== '--coverage')).toEqual([]);

    const lignes = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8').split(/\r?\n/);
    const debutJob = lignes.findIndex((l) => /^ {2}gate-a:\s*$/.test(l));
    expect(debutJob, 'aucun job gate-a dans ci.yml').toBeGreaterThanOrEqual(0);
    const finJob = lignes.findIndex((l, i) => i > debutJob && /^ {2}\S/.test(l));
    const job = lignes.slice(debutJob, finJob === -1 ? undefined : finJob);
    const ligneRun = job.findIndex((l) => /^\s+(- )?run:\s*pnpm test\s*$/.test(l));
    expect(ligneRun, 'aucune étape `run: pnpm test` dans le job gate-a').toBeGreaterThan(0);
    let debutEtape = ligneRun;
    while (debutEtape > 0 && !/^\s+- /.test(job[debutEtape]!)) debutEtape--;
    const indentation = job[debutEtape]!.search(/-/);
    const finEtape = job.findIndex(
      (l, i) => i > ligneRun && l.trim() !== '' && l.search(/\S/) <= indentation
    );
    const etape = job.slice(debutEtape, finEtape === -1 ? undefined : finEtape);
    const conditions = etape.filter((l) => /^\s*(- )?(if|continue-on-error)\s*:/.test(l));
    expect(
      conditions,
      `l'étape qui lance pnpm test est conditionnée : ${conditions.join(' | ')}`
    ).toEqual([]);
  });
});
