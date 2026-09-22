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
import { typeReel, type TypePg } from '../../scripts/lot/lecteur-prisma';
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
 * 🔴 SUR QUOI LA DÉCISION REPOSE, ET POURQUOI CE N'EST PLUS UN LIBELLÉ. La première rédaction de
 * ce `describe` jugeait sur `information_schema.columns.data_type`. Ce champ n'est pas ce que
 * PostgreSQL fait de la colonne : c'est un LIBELLÉ qui replie des familles entières — un tableau
 * y devient `ARRAY`, un type d'extension `USER-DEFINED`. Mesuré le 2026-09-22 : une migration de
 * quatre lignes (`citext`, `statut_liste TEXT[]`, `statut_ci citext`, une table dans un schéma
 * `metier`) faisait passer le compte de 19 à 21 colonnes LUES, COMPTÉES et ABSOUTES, en exit 0,
 * sans qu'une seule ligne de garde ait été touchée — et `citext` figurait dans le prédicat même
 * de la garde, qui déclarait le couvrir sans jamais le voir sur ce canal.
 *
 * LA SOURCE EST DÉSORMAIS `pg_attribute.atttypid` : l'identifiant du type que PostgreSQL a
 * RÉELLEMENT donné à la colonne, pas le nom qu'une vue en imprime. Le catalogue se déplie ensuite
 * par SES PROPRES relations (`typtype = 'd'` → `typbasetype`, `typcategory = 'A'` → `typelem`),
 * jamais par le préfixe `_` d'un nom ni par aucune convention d'écriture : `typeReel` (lecteur
 * unique) est la seule implémentation, et elle se prouve HORS BASE dans
 * `tests/unit/domaine/gardes-de-schema.spec.ts`. Un tableau d'un type fautif est jugé fautif, et
 * il se DIT (`text[]`), sans quoi le message mentirait sur ce qu'il a jugé.
 *
 * LE PÉRIMÈTRE EST DIT, PAS SUPPOSÉ : tout schéma HORS `pg_*` et `information_schema` — qui sont
 * une LIMITE DÉCLARÉE, voir le ⚠️ plus bas —, et toute relation qui STOCKE — table ordinaire, partitionnée, distante,
 * vue matérialisée, et le type composite, dont les champs sont des colonnes déguisées. Les
 * familles que ce contrôle ne tient PAS sont nommées dans `docs/gates.json`, entrée par entrée ;
 * et une colonne dont le type ne se résout pas n'est jamais un vert : elle est nommée.
 *
 * ⚠️ CETTE BORNE EST DÉPLACÉE D'UN CRAN, ELLE N'EST PAS LEVÉE — et ce paragraphe affirmait le
 * contraire. `CREATE SCHEMA pg_metier` rend bien « ERROR: unacceptable schema name », MAIS
 * `SET allow_system_table_mods = on` le permet, et `CREATE TABLE information_schema.x (…)` passe
 * SANS aucun paramètre (mesuré le 2026-09-22 sur pg16). Une colonne fautive posée dans ces deux
 * schémas n'est donc PAS vue : c'est une LIMITE DÉCLARÉE, pas une fermeture. Elle reste une dette
 * et non un refus parce que viser délibérément un schéma système n'est pas le chemin ordinaire
 * qu'institue REQ-DM-037, et que ça se lit dans le diff d'une migration.
 *
 * 🔑 C'est la TROISIÈME fois que cette PR remplace un fait par ce qui lui ressemble — orthographe
 * Prisma, puis libellé Postgres, puis ce « fait » de réservation — et elle l'a écrit ici même, dans
 * le paragraphe qui explique cette famille. Deux lentilles l'ont mesuré, pas relu.
 *
 * MÊME ARCHITECTURE QUE L'INDEX CI-DESSUS : les prédicats sont ceux des gardes elles-mêmes
 * (`fautesDUneColonne`, `fauteDeVocabulaire`) — une règle, deux sources de colonnes, une
 * implémentation (RM-01).
 */
describe('REQ-DM-001 → REQ-DM-038 — les colonnes de la base RÉELLE, quel que soit le canal qui les a posées', () => {
  type ColonneEnBase = { schema: string; table: string; colonne: string; oid: string };
  const BAC_COLONNES = 'bac_colonnes';
  /**
   * LE SCHÉMA DU BAC HORS `public`, et son nom n'est pas une coquetterie : `nettoyer()` le
   * SUPPRIME. Un nom du métier (`metier`) ferait détruire par ce test un schéma qu'une
   * migration aurait posé, puis déclarer vert ce qu'il vient d'effacer. Mesuré le 2026-09-22
   * en rejouant la migration témoin : elle perdait sa table et le compte retombait à 1 schéma.
   * Un test qui NETTOIE la base qu'il mesure ne mesure plus qu'après lui-même.
   */
  const AUTRE_SCHEMA = 'bac_hors_public';

  /**
   * Les relations qui STOCKENT une colonne : table ordinaire, partitionnée, distante, vue
   * matérialisée, et le type composite (`c`), dont les champs sont des colonnes déguisées. Une
   * VUE (`v`) est une projection de colonnes déjà jugées ailleurs, pas un stockage : limite
   * déclarée au registre.
   */
  const RELKINDS = ['r', 'p', 'f', 'm', 'c'] as const;

  /** Le catalogue des types, tel que PostgreSQL le tient — la source qui dit le type RÉEL. */
  const catalogueDesTypes = async (): Promise<Map<string, TypePg>> => {
    const lignes = await base.prisma.$queryRawUnsafe<TypePg[]>(
      'SELECT t.oid::text AS oid, t.typname AS nom, n.nspname AS "schema", t.typtype AS genre, ' +
        't.typcategory AS categorie, t.typelem::text AS element, t.typbasetype::text AS base ' +
        'FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace'
    );
    return new Map(lignes.map((t) => [t.oid, t]));
  };

  /**
   * Les colonnes de la base — tous les schémas HORS `pg_*` et `information_schema`, dont
   * l'exclusion est une LIMITE DÉCLARÉE et non une réservation de PostgreSQL. La borne à
   * `public` était une borne que rien n'annonçait : une table posée dans un autre schéma n'était
   * même pas LUE, pendant que le registre promettait « toutes les colonnes ».
   */
  const colonnesDeLaBase = (table = ''): Promise<ColonneEnBase[]> =>
    base.prisma.$queryRawUnsafe<ColonneEnBase[]>(
      'SELECT n.nspname AS "schema", c.relname AS "table", a.attname AS colonne, ' +
        'a.atttypid::text AS oid ' +
        'FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid ' +
        'JOIN pg_namespace n ON n.oid = c.relnamespace ' +
        "WHERE a.attnum > 0 AND NOT a.attisdropped AND n.nspname <> 'information_schema' " +
        "AND n.nspname !~ '^pg_' " +
        `AND c.relkind IN (${RELKINDS.map((k) => `'${k}'`).join(', ')}) ` +
        "AND ($1::text = '' OR c.relname = $1::text) " +
        'ORDER BY n.nspname, c.relname, a.attnum',
      table
    );

  /** Les fautes des deux REQ sur des colonnes lues en base : `natif`, donc jugées en types SQL. */
  function juger(lues: ColonneEnBase[], catalogue: Map<string, TypePg>): string[] {
    return lues.flatMap((c) => {
      const ou = `${c.schema}.${c.table}.${c.colonne}`;
      const reel = typeReel(c.oid, catalogue);
      // Un type qui ne se résout pas n'est PAS un vert : c'est un refus de conclure, nommé.
      if (reel === undefined) return [`type_irresolu ${ou} — oid ${c.oid} absent de pg_type`];
      const commune = {
        ou,
        nom: c.colonne,
        colonne: c.colonne,
        type: reel.nom,
        natif: true,
        tableau: reel.tableau,
        categorie: reel.categorie,
      };
      const vocabulaire = fauteDeVocabulaire(commune);
      return [
        ...fautesDUneColonne({ ...commune, jamaisMonetaire: false }),
        ...(vocabulaire ? [vocabulaire] : []),
      ].map((f) => `${f.famille} ${f.message}`);
    });
  }

  const nettoyer = async (): Promise<void> => {
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${BAC_COLONNES}"`);
    await base.prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${AUTRE_SCHEMA}" CASCADE`);
  };

  it('REQ-DM-001 → REQ-DM-038 : une colonne monétaire en décimal et un vocabulaire en texte, posés par du SQL BRUT, rougissent', async () => {
    // Le canal exact que REQ-DM-037 institue : du SQL que Prisma ne modélise pas, hors schéma.
    await nettoyer();
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${BAC_COLONNES}" ("id" SERIAL PRIMARY KEY, "libelle" TEXT NOT NULL)`
    );
    await base.prisma.$executeRawUnsafe(
      `ALTER TABLE "${BAC_COLONNES}" ADD COLUMN "montant" NUMERIC(12,2), ADD COLUMN "statut" TEXT`
    );
    const fautes = juger(await colonnesDeLaBase(BAC_COLONNES), await catalogueDesTypes()).join(
      '\n'
    );
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
    await nettoyer();
  });

  it('REQ-DM-001 → REQ-DM-038 : ce que le LIBELLÉ repliait — tableau de texte, citext, numeric[], domaine sous tableau et table hors du schéma public rougissent', async () => {
    // La migration MESURÉE le 2026-09-22 : quatre lignes, aucune ligne de garde ni de test
    // touchée, et le compte des colonnes jugées passait de 19 à 21 — lues, comptées, absoutes.
    await nettoyer();
    await base.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS citext');
    await base.prisma.$executeRawUnsafe(`CREATE SCHEMA "${AUTRE_SCHEMA}"`);
    await base.prisma.$executeRawUnsafe(`CREATE DOMAIN "${AUTRE_SCHEMA}".texte_libre AS TEXT`);
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${AUTRE_SCHEMA}"."${BAC_COLONNES}" ` +
        '("id" SERIAL PRIMARY KEY, "statut" TEXT NOT NULL)'
    );
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${BAC_COLONNES}" ("id" SERIAL PRIMARY KEY, "statut_liste" TEXT[], ` +
        `"statut_ci" citext, "montants" NUMERIC(12,2)[], ` +
        `"motif_libre" "${AUTRE_SCHEMA}".texte_libre[])`
    );
    const fautes = juger(await colonnesDeLaBase(), await catalogueDesTypes()).join('\n');
    // Le tableau d'un type fautif est fautif — et il se DIT, sans quoi le message mentirait.
    expect(fautes).toContain(`colonne_vocabulaire_en_chaine public.${BAC_COLONNES}.statut_liste`);
    expect(fautes).toContain('est un text[] alors que son nom');
    // `citext` figurait dans le prédicat de la garde, et le libellé le repliait en USER-DEFINED.
    expect(fautes).toContain(`colonne_vocabulaire_en_chaine public.${BAC_COLONNES}.statut_ci`);
    // La cécité JUMELLE, côté montants (REQ-DM-001) : un `numeric[]` à nom neutre.
    expect(fautes).toContain(`virgule_flottante public.${BAC_COLONNES}.montants`);
    expect(fautes).toContain('est un numeric[]');
    // Un DOMAINE sous un TABLEAU : `information_schema` ne le déplie pas (il rend `_texte_libre`),
    // le catalogue si — `typelem` puis `typbasetype`.
    expect(fautes).toContain(`colonne_vocabulaire_en_chaine public.${BAC_COLONNES}.motif_libre`);
    // La borne à `public` : une table posée ailleurs n'était même pas LUE.
    expect(fautes).toContain(
      `colonne_vocabulaire_en_chaine ${AUTRE_SCHEMA}.${BAC_COLONNES}.statut`
    );
    await nettoyer();
  });

  it('REQ-DM-001 → REQ-DM-038 : contre-témoin — les mêmes colonnes en centimes entiers et en enum NATIF restent vertes, TABLEAUX compris', async () => {
    await nettoyer();
    await base.prisma.$executeRawUnsafe(
      `CREATE TABLE "${BAC_COLONNES}" ("id" SERIAL PRIMARY KEY, "montant_ht_cents" INTEGER NOT NULL, ` +
        `"statut" "etat_attribution" NOT NULL, "cree_at" TIMESTAMPTZ(3) NOT NULL, ` +
        '"reseau" INET, "empreinte" BYTEA, "statuts" "etat_attribution"[], ' +
        '"montants_ht_cents" INTEGER[])'
    );
    // Un tableau d'un type JUSTE reste juste : sans ce contre-témoin, on punirait la bonne
    // écriture au lieu de fermer la mauvaise.
    expect(juger(await colonnesDeLaBase(BAC_COLONNES), await catalogueDesTypes())).toEqual([]);
    await nettoyer();
  });

  it('REQ-DM-001 → REQ-DM-038 : sur la base migrée du jour, toutes les colonnes sont jugées, et aucune ne rougit', async () => {
    await nettoyer();
    const catalogue = await catalogueDesTypes();
    const lues = await colonnesDeLaBase();
    // « 0 colonne » et « aucune faute » ne se confondent pas : c'est le défaut que DM-02 ferme
    // partout ailleurs, et il vaut aussi pour un test.
    expect(lues.length).toBeGreaterThan(0);
    // Le périmètre se DIT : ce qui a été lu, et sur quoi la décision repose.
    console.log(
      `REQ-DM-001 → REQ-DM-038 : ${lues.length} colonne(s) de ` +
        `${new Set(lues.map((c) => `${c.schema}.${c.table}`)).size} relation(s) dans ` +
        `${new Set(lues.map((c) => c.schema)).size} schéma(s), types résolus par pg_type ` +
        `(${catalogue.size} types au catalogue).`
    );
    expect(juger(lues, catalogue)).toEqual([]);
  });
});
