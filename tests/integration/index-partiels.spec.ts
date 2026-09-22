// @req REQ-DM-003
// @req REQ-DM-001
// @req REQ-DM-038
/**
 * CE QUE LES GARDES DE SCHÉMA NE PEUVENT JUGER QU'EN BASE RÉELLE — DM-02. Deux règles, un seul
 * conteneur : l'index unique PARTIEL de l'attribution occupante (REQ-DM-003, premier `describe`),
 * et les TYPES DES COLONNES quel que soit le canal qui les a posées (REQ-DM-001, REQ-DM-038,
 * second `describe` — voir son en-tête pour le trou qu'il ferme). Les deux suivent la même
 * architecture : le prédicat est celui de la garde, la SOURCE des faits est le catalogue de
 * PostgreSQL après `prisma migrate deploy`.
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
import { readFileSync } from 'node:fs';
import {
  cibleDeLIndex,
  controler as controlerEnums,
  fauteDeVocabulaire,
  fautesIndexOccupant,
  texteDeLaReq,
  VUE_CONFORME,
} from '../../scripts/gates/schema-enums';
import { controler as controlerCents, fautesDUneColonne } from '../../scripts/gates/schema-cents';
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
/**
 * LE CANAL DU SQL BRUT — la seconde chose que ce fichier tient, et pourquoi elle est ICI.
 *
 * `partners:schema:cents` et `partners:schema:enums` ne lisent, pour juger des COLONNES, que
 * `prisma/schema.prisma`. Or REQ-DM-037 institue elle-même le SQL brut comme canal légitime
 * (« les index partiels sont écrits en SQL brut »), et la première migration l'utilise déjà. Une
 * colonne monétaire en `numeric` et une colonne de vocabulaire en `text` posées par ce canal
 * faisaient donc sortir les deux gardes en 0 : elles ne les lisaient pas.
 *
 * ON NE FERME PAS ÇA EN APPRENANT AU LECTEUR STATIQUE À PARSER `CREATE TABLE`. Un parseur ne
 * connaît que les formes qu'on lui a apprises (`ADD COLUMN` oui, `ALTER COLUMN … TYPE`
 * peut-être, `CREATE TABLE … AS SELECT` non) : ce demi-savoir est exactement la famille qu'on
 * ferme aujourd'hui. On ferme LÀ OÙ LE CANAL DÉBOUCHE — le catalogue de la base, après
 * `prisma migrate deploy`, qui voit toute colonne quel que soit ce qui l'a posée.
 *
 * MÊME ARCHITECTURE QUE L'INDEX CI-DESSUS : les prédicats sont ceux des gardes elles-mêmes
 * (`fautesDUneColonne`, `fauteDeVocabulaire`) — une règle, deux sources de colonnes, une
 * implémentation (RM-01).
 */
describe('REQ-DM-001 → REQ-DM-038 — les colonnes de la base RÉELLE, quel que soit le canal qui les a posées', () => {
  type ColonneEnBase = { table: string; colonne: string; type: string };
  const BAC_COLONNES = 'bac_colonnes';
  const SELECT_COLONNES =
    'SELECT table_name AS "table", column_name AS "colonne", data_type AS "type" ' +
    "FROM information_schema.columns WHERE table_schema = 'public'";

  /** Les colonnes d'UNE table, telles que PostgreSQL les expose. */
  const colonnesDe = (table: string): Promise<ColonneEnBase[]> =>
    base.prisma.$queryRawUnsafe<ColonneEnBase[]>(
      `${SELECT_COLONNES} AND table_name = $1 ORDER BY ordinal_position`,
      table
    );

  /** TOUTES les colonnes du schéma `public` de la base migrée. */
  const toutesLesColonnes = (): Promise<ColonneEnBase[]> =>
    base.prisma.$queryRawUnsafe<ColonneEnBase[]>(
      `${SELECT_COLONNES} ORDER BY table_name, ordinal_position`
    );

  /** Les fautes des deux REQ sur des colonnes lues en base : `natif`, donc jugées en types SQL. */
  function juger(lues: ColonneEnBase[]): string[] {
    return lues.flatMap((c) => {
      const commune = {
        ou: `public.${c.table}.${c.colonne}`,
        nom: c.colonne,
        colonne: c.colonne,
        type: c.type,
        natif: true,
      };
      const vocabulaire = fauteDeVocabulaire(commune);
      return [
        ...fautesDUneColonne({ ...commune, jamaisMonetaire: false }),
        ...(vocabulaire ? [vocabulaire] : []),
      ].map((f) => `${f.famille} ${f.message}`);
    });
  }

  it('REQ-DM-001 → REQ-DM-038 : une colonne monétaire en décimal et un vocabulaire en texte, posés par du SQL BRUT, rougissent', async () => {
    // Le canal exact que REQ-DM-037 institue : du SQL que Prisma ne modélise pas, hors schéma.
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${BAC_COLONNES}" ("id" SERIAL PRIMARY KEY, "libelle" TEXT NOT NULL)`
    );
    await base.prisma.$executeRawUnsafe(
      `ALTER TABLE "${BAC_COLONNES}" ADD COLUMN "montant" NUMERIC(12,2), ADD COLUMN "statut" TEXT`
    );
    const fautes = juger(await colonnesDe(BAC_COLONNES)).join('\n');
    expect(fautes).toContain(`virgule_flottante public.${BAC_COLONNES}.montant`);
    expect(fautes).toContain(`colonne_vocabulaire_en_chaine public.${BAC_COLONNES}.statut`);
    // L'AUTRE FACE, celle qui rend le témoin concluant : les gardes STATIQUES restent vertes sur
    // le même dépôt — la faute n'est pas dans `schema.prisma`, et c'est bien là le trou.
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(controlerCents(schema)).toEqual([]);
    expect(
      controlerEnums({ ...VUE_CONFORME, schema }).filter(
        (f) => f.famille === 'colonne_vocabulaire_en_chaine'
      )
    ).toEqual([]);
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
  });

  it('REQ-DM-001 → REQ-DM-038 : contre-témoin — les mêmes colonnes en centimes entiers et en enum NATIF restent vertes', async () => {
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${BAC_COLONNES}" ("id" SERIAL PRIMARY KEY, "montant_ht_cents" INTEGER NOT NULL, ` +
        `"statut" "etat_attribution" NOT NULL, "cree_at" TIMESTAMPTZ(3) NOT NULL)`
    );
    expect(juger(await colonnesDe(BAC_COLONNES))).toEqual([]);
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
  });

  it('REQ-DM-001 → REQ-DM-038 : sur la base migrée du jour, toutes les colonnes sont jugées, et aucune ne rougit', async () => {
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
    const lues = await toutesLesColonnes();
    // « 0 colonne » et « aucune faute » ne se confondent pas : c'est le défaut que DM-02 ferme
    // partout ailleurs, et il vaut aussi pour un test.
    expect(lues.length).toBeGreaterThan(0);
    console.log(
      `REQ-DM-001 → REQ-DM-038 : ${lues.length} colonne(s) de ${new Set(lues.map((c) => c.table)).size} ` +
        'table(s) lues dans information_schema après migrate deploy.'
    );
    expect(juger(lues)).toEqual([]);
  });
});
