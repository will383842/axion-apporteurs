// @req REQ-DM-003
/**
 * L'index unique PARTIEL de l'attribution occupante, lu en base RÉELLE — DM-02.
 *
 * CE QU'IL PROUVE. La règle de REQ-DM-003 (« au plus une attribution occupante par SIREN ») ne se
 * juge pas seulement sur le SQL écrit : PostgreSQL RÉÉCRIT le prédicat d'un index partiel
 * (`statut IN ('a', 'b')` devient `(statut = ANY (ARRAY['a'::etat_attribution, …]))`). La même
 * fonction, `fautesIndexOccupant` (`scripts/gates/schema-enums.ts`), lit donc ici
 * `pg_indexes.indexdef` après `prisma migrate deploy` — une règle, deux sources, une
 * implémentation.
 *
 * TÉMOIN À DEUX FACES, sur une table de BAC. La table de l'exigence naît plus tard ; le bac porte
 * le type `etat_attribution` que la première migration crée, et la colonne d'unicité et la colonne
 * d'état LUES dans le texte de REQ-DM-003 (rien n'est tapé ici, RM-01, RM-06) :
 *   — index unique TOTAL → `index_occupant_total`, qui nomme la table et l'index ;
 *   — index généré par `clauseEtatsOccupants()` → vert, et la base refuse un second occupant ;
 *   — index à six états sur sept → `index_occupant_divergent`.
 *
 * LIMITE DÉCLARÉE. Sur la base du jour, la table de l'exigence est absente : le test l'imprime
 * (« 0 index, table absente ») et ne le prend pas pour un vert — c'est la tâche qui crée la table
 * qui exigera un index, et un seul.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { demarrerBase, type Base } from './harnais';
import { cibleDeLIndex, fautesIndexOccupant, texteDeLaReq } from '../../scripts/gates/schema-enums';
import { clauseEtatsOccupants, ETATS_OCCUPANTS } from '../../src/domain/attribution/etats';

const cible = cibleDeLIndex(texteDeLaReq('REQ-DM-003'));
if (cible === undefined) throw new Error('REQ-DM-003 ne donne plus la cible de son index');
const source = {
  colonne: cible.colonne,
  colonneEtat: cible.colonneEtat,
  occupants: ETATS_OCCUPANTS,
};
const BAC = 'bac_attributions';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
  await base.prisma.$executeRawUnsafe(
    `CREATE TABLE "${BAC}" ("id" SERIAL PRIMARY KEY, "${cible.colonne}" CHAR(9) NOT NULL, ` +
      `"${cible.colonneEtat}" "etat_attribution" NOT NULL)`
  );
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

/** Les définitions d'index de la table, telles que PostgreSQL les a RÉÉCRITES. */
async function definitions(table: string): Promise<string[]> {
  const lignes = await base.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname",
    table
  );
  return lignes.map((l) => l.indexdef);
}

/** Pose un index sur le bac, lit sa définition en base, et rend les fautes que la garde y voit. */
async function juger(predicat: string): Promise<{ indexdef: string; fautes: string[] }> {
  await base.prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "un_occupant"');
  await base.prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "un_occupant" ON "${BAC}" ("${cible!.colonne}")${predicat}`
  );
  const indexdef = (await definitions(BAC)).find((d) => d.includes('un_occupant'));
  expect(indexdef, 'pg_indexes ne rend pas l’index posé').toBeDefined();
  const fautes = fautesIndexOccupant(indexdef!, BAC, source).map(
    (f) => `${f.famille} ${f.message}`
  );
  return { indexdef: indexdef!, fautes };
}

describe('REQ-DM-003 — l’index unique partiel de l’attribution occupante, lu dans pg_indexes', () => {
  it('REQ-DM-003 : un index UNIQUE total rougit `index_occupant_total`, en nommant la table et l’index', async () => {
    const { fautes } = await juger('');
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('index_occupant_total');
    expect(fautes[0]).toContain(`« un_occupant » sur ${BAC}`);
  });

  it('REQ-DM-003 : l’index généré par clauseEtatsOccupants() est vert malgré la réécriture `= ANY (ARRAY[…])`, et la base refuse un second occupant', async () => {
    const { indexdef, fautes } = await juger(
      ` WHERE "${cible.colonneEtat}" IN (${clauseEtatsOccupants()})`
    );
    // La réécriture de PostgreSQL : on compare des ensembles, jamais des chaînes.
    expect(indexdef).toContain('ANY (ARRAY[');
    expect(fautes).toEqual([]);
    // Le comportement que l'index promet : deux occupants sur un SIREN, non ; un occupant et un
    // état qui n'occupe pas, oui.
    const inserer = (siren: string, etat: string) =>
      base.prisma.$executeRawUnsafe(
        `INSERT INTO "${BAC}" ("${cible.colonne}", "${cible.colonneEtat}") VALUES ($1, $2::etat_attribution)`,
        siren,
        etat
      );
    const [premier, second] = ETATS_OCCUPANTS;
    await inserer('123456789', premier!);
    await expect(inserer('123456789', second!)).rejects.toThrow(/unique|duplicate|23505/i);
    await expect(inserer('123456789', 'perdue')).resolves.toBe(1);
    await base.prisma.$executeRawUnsafe(`DELETE FROM "${BAC}"`);
  });

  it('REQ-DM-003 : un index à six états sur sept rougit `index_occupant_divergent`', async () => {
    const six = ETATS_OCCUPANTS.slice(0, -1)
      .map((e) => `'${e}'`)
      .join(', ');
    const { fautes } = await juger(` WHERE "${cible.colonneEtat}" IN (${six})`);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('index_occupant_divergent');
  });

  it('REQ-DM-003 : sur la base migrée du jour, la table de l’exigence est absente — dit, pas pris pour un vert', async () => {
    const tables = await base.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
      cible.table
    );
    const presente = Number(tables[0]!.n) > 0;
    const index = await definitions(cible.table);
    const fautes = index.flatMap((d) => fautesIndexOccupant(d, cible.table, source));
    console.log(
      `REQ-DM-003 : ${index.length} index sur ${cible.table}, table ${presente ? 'présente' : 'absente'}.`
    );
    expect(fautes).toEqual([]);
    // Le jour où la table naît, un index partiel l'accompagne : un tableau vide n'est plus admis.
    if (presente) expect(index.some((d) => d.includes('WHERE'))).toBe(true);
  });
});
