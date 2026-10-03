/**
 * tests-eclat.ts — GOV-142 : UN éclat de la suite, lancé par la matrice de la porte A.
 *
 * La suite ne change pas : chaque éclat lance `vitest run --coverage --shard=<i>/4` avec le reporter
 * `blob`, et le job qui suit fusionne les quatre éclats (`pnpm test:fusion`, `tests-fusion.ts`) en
 * appliquant les seuils de couverture de `vitest.config.ts` et en écrivant le MÊME
 * `test-results/vitest.json` que `pnpm test`.
 *
 * UN ÉCLAT NE JUGE PAS LA COUVERTURE. Il ne charge qu'une part des tests : sous le seuil par fichier
 * de `src/domain/**`, il rougirait sur ce qu'un autre éclat couvre. Il COLLECTE la couverture dans
 * son blob, seuils ramenés à zéro par la ligne de commande ; la fusion, elle, lit les seuils de la
 * configuration sans aucune surcharge, et c'est son verdict qui compte.
 *
 * L'éclat se lit dans `ECLAT`, posé par la seule matrice, sous la forme FERMÉE `^[1-4]/4$` : la
 * commande de l'étape reste `pnpm test:eclat` (REQ-GOV-018). Une valeur absente ou autre fait
 * ÉCHOUER l'étape : un éclat qui lancerait toute la suite, ou aucune, ne se lit pas comme un vert.
 */
import { spawnSync } from 'node:child_process';

export const NOMBRE_D_ECLATS = 4;
const FORME_DE_L_ECLAT = /^([1-4])\/4$/;

/** PURE. L'indice de l'éclat (1 à 4), ou une raison de refus. */
export function lireLEclat(valeur: string | undefined): number | { refus: string } {
  const m = FORME_DE_L_ECLAT.exec(valeur ?? '');
  return m === null
    ? { refus: `ECLAT vaut « ${valeur ?? ''} », attendu i/${NOMBRE_D_ECLATS} avec 1 ≤ i ≤ 4` }
    : Number(m[1]);
}

/** La clé de seuil de la configuration que l'éclat neutralise, et elle seule. */
export const CLE_DES_SEUILS = 'src/domain/**';

/** PURE. Les arguments de vitest pour un éclat. */
export function argumentsDeLEclat(indice: number): string[] {
  return [
    'exec',
    'vitest',
    'run',
    '--coverage',
    `--coverage.thresholds.${CLE_DES_SEUILS}.lines=0`,
    `--coverage.thresholds.${CLE_DES_SEUILS}.branches=0`,
    '--reporter=blob',
    `--shard=${indice}/${NOMBRE_D_ECLATS}`,
  ];
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/ci/tests-eclat.ts')) {
  const lu = lireLEclat(process.env.ECLAT);
  if (typeof lu !== 'number') {
    console.error(`::error::${lu.refus}`);
    process.exit(1);
  }
  const r = spawnSync('pnpm', argumentsDeLEclat(lu), { stdio: 'inherit', shell: false });
  process.exit(r.status ?? 1);
}
