/**
 * tests-fusion.ts — GOV-142 : la fusion des deux éclats de la suite, et le verdict de couverture.
 *
 * 1. EXACTEMENT les deux blobs attendus (`blob-<i>-2.json`), aucun de plus : un blob manquant
 *    rougit, ce n'est jamais une couverture calculée sur trois éclats.
 * 2. `vitest run --merge-reports --coverage`, aux seuils de `vitest.config.ts`, LUS et jamais
 *    recopiés : aucune surcharge `--coverage.*` ici, à la différence des éclats. Les rapports sont
 *    ceux de `pnpm test`, dont `test-results/vitest.json` que lisent `req:check` et la mutation.
 * 3. AUCUN TEST PERDU ENTRE LES ÉCLATS : les fichiers du rapport fusionné sont exactement ceux que
 *    `vitest list --filesOnly` énumère. Un écart est nommé, fichier par fichier.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { NOMBRE_D_ECLATS } from './tests-eclat';

export const DOSSIER_DES_BLOBS = '.vitest-reports';
export const RAPPORT = 'test-results/vitest.json';

/** PURE. Les blobs attendus. */
export function blobsAttendus(n = NOMBRE_D_ECLATS): string[] {
  return Array.from({ length: n }, (_, i) => `blob-${i + 1}-${n}.json`);
}

/** PURE. Les écarts entre les blobs présents et attendus. */
export function jugerLesBlobs(presents: readonly string[], attendus = blobsAttendus()): string[] {
  const manquants = attendus.filter((b) => !presents.includes(b));
  const intrus = presents.filter((b) => !attendus.includes(b));
  return [
    ...manquants.map((b) => `blob manquant : ${b}`),
    ...intrus.map((b) => `blob inattendu : ${b}`),
  ];
}

/** PURE. Les fichiers énumérés absents du rapport fusionné, et l'inverse. */
export function jugerLesFichiers(
  enumeres: readonly string[],
  rapportes: readonly string[]
): string[] {
  const r = new Set(rapportes);
  const e = new Set(enumeres);
  return [
    ...[...e].filter((f) => !r.has(f)).map((f) => `fichier de test absent de la fusion : ${f}`),
    ...[...r].filter((f) => !e.has(f)).map((f) => `fichier de la fusion non énuméré : ${f}`),
  ];
}

const normaliser = (f: string) => relative(process.cwd(), resolve(f)).replace(/\\/g, '/');

function principal(): number {
  const presents = existsSync(DOSSIER_DES_BLOBS) ? readdirSync(DOSSIER_DES_BLOBS) : [];
  const blobs = jugerLesBlobs(presents);
  if (blobs.length > 0) {
    for (const b of blobs) console.error(`::error::${b}`);
    return 1;
  }
  const fusion = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--merge-reports',
      '--coverage',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${RAPPORT}`,
    ],
    { stdio: 'inherit', shell: false }
  );
  // `vitest list --json` n'écrit son JSON que dans un fichier : hors du dépôt, sous le temporaire.
  const fichierDeLaListe = join(tmpdir(), `vitest-list-${process.pid}.json`);
  const liste = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'list', '--filesOnly', `--json=${fichierDeLaListe}`],
    { stdio: 'ignore', shell: false }
  );
  if (liste.status !== 0 || !existsSync(fichierDeLaListe) || !existsSync(RAPPORT)) {
    console.error(`::error::énumération des tests ou rapport ${RAPPORT} illisible`);
    return 1;
  }
  const enumeres = (JSON.parse(readFileSync(fichierDeLaListe, 'utf8')) as { file: string }[]).map(
    (t) => normaliser(t.file)
  );
  const rapport = JSON.parse(readFileSync(RAPPORT, 'utf8')) as { testResults: { name: string }[] };
  const ecarts = jugerLesFichiers(
    enumeres,
    rapport.testResults.map((t) => normaliser(t.name))
  );
  for (const e of ecarts) console.error(`::error::${e}`);
  console.log(
    `${ecarts.length === 0 ? '✅' : '❌'} fusion — ${NOMBRE_D_ECLATS} blobs, ${enumeres.length} fichier(s) énuméré(s), ${rapport.testResults.length} fichier(s) dans la fusion.`
  );
  return fusion.status === 0 && ecarts.length === 0 ? 0 : 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ci/tests-fusion.ts')) {
  process.exit(principal());
}
