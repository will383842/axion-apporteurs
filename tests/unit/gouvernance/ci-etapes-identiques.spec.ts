// @req REQ-QA-013
/**
 * GOV-142 — la porte A en jobs parallèles, sans retirer ni alléger aucun contrôle.
 *
 * Le témoin `gov:ci-etapes` confronte la tête à l'« avant » FIGÉ (`scripts/gates/ci-etapes-reference.json`)
 * et doit être VERT sur le dépôt ; sa preuve doit rougir sur chaque faute plantée. Les scripts de
 * l'option A (éclat, fusion, empreinte, porte finale) sont jugés sur leurs fonctions pures, et les
 * points de la lentille sécurité qui se lisent dans `ci.yml` sont lus dans `ci.yml`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { estObjet, lireYaml } from '../../../scripts/lib/lire-yaml';
import {
  REFERENCE,
  WORKFLOW,
  jugerLesEtapes,
  lesJobs,
  prouver,
  type Job,
} from '../../../scripts/gates/ci-etapes-identiques';
import { argumentsDeLEclat, lireLEclat } from '../../../scripts/ci/tests-eclat';
import { blobsAttendus, jugerLesBlobs, jugerLesFichiers } from '../../../scripts/ci/tests-fusion';
import { empreinte, jugerLEmpreinte } from '../../../scripts/ci/artefact-empreinte';
import { jugerLesResultats } from '../../../scripts/ci/porte-finale';

let reference: Job[];
let tete: Job[];
let workflow: Record<string, unknown>;

beforeAll(async () => {
  const lu = JSON.parse(readFileSync(REFERENCE, 'utf8')) as { jobs: unknown };
  reference = lesJobs({ jobs: lu.jobs });
  const w = await lireYaml(readFileSync(WORKFLOW, 'utf8'));
  if (!estObjet(w)) throw new Error('ci.yml illisible');
  workflow = w;
  tete = lesJobs(w);
});

const jobsBruts = (): [string, Record<string, unknown>][] =>
  Object.entries(workflow.jobs as Record<string, Record<string, unknown>>);
const etapesDe = (job: Record<string, unknown>): Record<string, unknown>[] =>
  (job.steps as Record<string, unknown>[]) ?? [];

describe('REQ-QA-013 — GOV-142 : la même liste d’étapes, au regroupement près', () => {
  it('REQ-QA-013 : la référence est l’« avant » : un seul job, gate-a, et ses 115 étapes', () => {
    expect(reference.map((j) => j.nom)).toEqual(['gate-a']);
    expect(reference[0]!.etapes.length).toBe(115);
  });

  it('REQ-QA-013 : la tête, jugée contre la référence, est VERTE', () => {
    expect(jugerLesEtapes(reference, tete)).toEqual([]);
  });

  it('REQ-QA-013 : TÉMOIN — la preuve rougit sur chaque faute plantée, et les deux contre-témoins restent verts', () => {
    const v = prouver(reference, tete);
    expect(v.lignes.filter((l) => l.startsWith('❌'))).toEqual([]);
    expect(v.lignes.filter((l) => l.startsWith('✅')).length).toBe(10);
    expect(v.code).toBe(0);
  });

  it('REQ-QA-013 : TÉMOIN — retirer une seule étape de la tête rougit, en la nommant', () => {
    const [premier, ...autres] = tete;
    const victime = premier!.etapes.find((e) => e.name === 'La sonde sait rougir')!;
    const amputee: Job[] = [
      { ...premier!, etapes: premier!.etapes.filter((e) => e !== victime) },
      ...autres,
    ];
    expect(jugerLesEtapes(reference, amputee)).toEqual([
      { famille: 'etape_disparue', message: '« La sonde sait rougir » n\'est plus dans aucun job.' },
    ]);
  });
});

describe('REQ-QA-013 — GOV-142 : l’éclat, la fusion, l’empreinte et la porte finale', () => {
  it('REQ-QA-013 : ECLAT en forme FERMÉE ^[1-4]/4$ ; toute autre valeur est refusée', () => {
    for (const i of [1, 2, 3, 4]) expect(lireLEclat(`${i}/4`)).toBe(i);
    for (const v of ['0/4', '5/4', '1/3', '1/4 ', ' 1/4', '1', '', undefined, '01/4', '1/04']) {
      expect(typeof lireLEclat(v), String(v)).toBe('object');
    }
  });

  it('REQ-QA-013 : un éclat collecte la couverture, seuils ramenés à zéro, en blob, sur SON quart', () => {
    expect(argumentsDeLEclat(3)).toEqual([
      'exec',
      'vitest',
      'run',
      '--coverage',
      '--coverage.thresholds.src/domain/**.lines=0',
      '--coverage.thresholds.src/domain/**.branches=0',
      '--reporter=blob',
      '--shard=3/4',
    ]);
  });

  it('REQ-QA-013 : TÉMOIN — la fusion exige EXACTEMENT les quatre blobs', () => {
    expect(blobsAttendus()).toEqual(['blob-1-4.json', 'blob-2-4.json', 'blob-3-4.json', 'blob-4-4.json']);
    expect(jugerLesBlobs(blobsAttendus())).toEqual([]);
    expect(jugerLesBlobs(blobsAttendus().slice(0, 3))).toEqual(['blob manquant : blob-4-4.json']);
    expect(jugerLesBlobs([...blobsAttendus(), 'blob-5-4.json'])).toEqual([
      'blob inattendu : blob-5-4.json',
    ]);
  });

  it('REQ-QA-013 : TÉMOIN — aucun fichier de test ne se perd entre les éclats', () => {
    expect(jugerLesFichiers(['a.spec.ts', 'b.spec.ts'], ['b.spec.ts', 'a.spec.ts'])).toEqual([]);
    expect(jugerLesFichiers(['a.spec.ts', 'b.spec.ts'], ['a.spec.ts'])).toEqual([
      'fichier de test absent de la fusion : b.spec.ts',
    ]);
    expect(jugerLesFichiers(['a.spec.ts'], ['a.spec.ts', 'c.spec.ts'])).toEqual([
      'fichier de la fusion non énuméré : c.spec.ts',
    ]);
  });

  it('REQ-QA-013 : TÉMOIN — une empreinte vide, mal formée ou différente est refusée', () => {
    const e = empreinte(Buffer.from('instantané'));
    expect(e).toBe(createHash('sha256').update('instantané').digest('hex'));
    expect(jugerLEmpreinte(e, e)).toBeNull();
    expect(jugerLEmpreinte('', e)).toMatch(/absente ou mal formée/);
    expect(jugerLEmpreinte(undefined, e)).toMatch(/absente ou mal formée/);
    expect(jugerLEmpreinte(e.toUpperCase(), e)).toMatch(/absente ou mal formée/);
    expect(jugerLEmpreinte('0'.repeat(64), e)).toMatch(/empreinte différente/);
  });

  it('REQ-QA-013 : TÉMOIN — la porte finale exige success de CHAQUE job ; un saut ne vaut jamais réussite', () => {
    expect(jugerLesResultats(JSON.stringify({ a: { result: 'success' } }))).toEqual([]);
    for (const r of ['skipped', 'cancelled', 'failure']) {
      expect(
        jugerLesResultats(JSON.stringify({ a: { result: 'success' }, b: { result: r } }))
      ).toEqual([`le job « b » vaut « ${r} »`]);
    }
    expect(jugerLesResultats('{}')).toEqual([
      'RESULTATS ne nomme aucun job : la porte finale ne juge rien',
    ]);
    expect(jugerLesResultats('')).toEqual(['RESULTATS illisible : attendu toJSON(needs)']);
  });
});

describe('REQ-QA-013 — GOV-142 : les points de la lentille sécurité, lus dans ci.yml', () => {
  it('REQ-QA-013 : la porte finale reçoit toJSON(needs), et ses needs nomment tous les autres jobs', () => {
    const [, porte] = jobsBruts().find(([n]) => n === 'gate-a')!;
    const etape = etapesDe(porte).find((e) => e.run === 'pnpm ci:porte-finale')!;
    expect((etape.env as Record<string, string>).RESULTATS).toBe('${{ toJSON(needs) }}');
    expect([...(porte.needs as string[])].sort()).toEqual(
      jobsBruts()
        .map(([n]) => n)
        .filter((n) => n !== 'gate-a')
        .sort()
    );
  });

  it('REQ-QA-013 : contents: read par défaut, des permissions par job, aucun pull_request_target', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(workflow.on as object)).not.toContain('pull_request_target');
    for (const [nom, job] of jobsBruts()) {
      const p = job.permissions as Record<string, string>;
      expect(p, nom).toBeDefined();
      for (const v of Object.values(p)) expect(v, nom).toBe('read');
    }
  });

  it('REQ-QA-013 : le jeton ne vit que dans les jobs qui lisent la forge aujourd’hui', () => {
    const avecJeton = jobsBruts()
      .filter(([, j]) => JSON.stringify(j).includes('secrets.GITHUB_TOKEN'))
      .map(([n]) => n)
      .sort();
    expect(avecJeton).toEqual(['apres-tests', 'gardes', 'tests-1', 'tests-2', 'tests-3', 'tests-4']);
  });

  it('REQ-QA-013 : chaque artefact a UN producteur, overwrite false, et se reçoit du run courant seulement', () => {
    const producteurs = new Map<string, string[]>();
    for (const [nom, job] of jobsBruts()) {
      for (const e of etapesDe(job)) {
        const avec = (e.with ?? {}) as Record<string, string>;
        if (String(e.uses).startsWith('actions/upload-artifact@')) {
          expect(avec.overwrite, nom).toBe('false');
          producteurs.set(avec.name!, [...(producteurs.get(avec.name!) ?? []), nom]);
        }
        if (String(e.uses).startsWith('actions/download-artifact@')) {
          expect(Object.keys(avec).sort(), nom).toEqual(['name', 'path']);
        }
      }
    }
    expect([...producteurs.entries()].sort()).toEqual([
      ['blob-1', ['tests-1']],
      ['blob-2', ['tests-2']],
      ['blob-3', ['tests-3']],
      ['blob-4', ['tests-4']],
      ['forge-instantane', ['gardes']],
    ]);
  });
});
