// @req REQ-DM-001
// @req REQ-DM-037
// @req REQ-DM-038
/**
 * `gardes-de-schema.spec.ts` — DM-02 : les gardes de schéma jugent un schéma LU, pas un texte
 * découpé ligne à ligne.
 *
 * CE QU'IL EXERCE. Les trois gardes de schéma et leur lecteur commun :
 *   — la lecture d'un bloc Prisma ferme chaque modèle sur SON accolade (un `}` de commentaire ou
 *     de chaîne ne ferme rien) ;
 *   — une garde invoquée sans extension juge, une copie renommée ne s'exécute pas ;
 *   — une liste littérale d'états se juge par GROUPE, pas par ligne ;
 *   — REQ-DM-001 : aucun flottant, tout montant en `…Cents` entier ;
 *   — REQ-DM-037 : les migrations sont additives, sauf absolution par un ADR accepté ;
 *   — l'index unique de l'attribution occupante est PARTIEL, et son prédicat couvre exactement
 *     les états occupants (lu en SQL statique ici, en base par la spec d'intégration).
 *
 * Toutes les vues sont INJECTÉES (RM-11) : aucune assertion ne dépend du contenu du dépôt du jour,
 * sauf celles qui le disent dans leur titre.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  champsDuSchema,
  cibleDeLIndex,
  controler,
  enumsDuSchema,
  fautesIndexOccupant,
  texteDeLaReq,
  VUE_CONFORME,
  type Vue,
} from '../../../scripts/gates/schema-enums';
import { controler as controlerCents } from '../../../scripts/gates/schema-cents';
import {
  controler as controlerMigrations,
  FAMILLES as FAMILLES_MIGRATIONS,
  protectionsDe,
  type Vue as VueMigrations,
} from '../../../scripts/gates/migrations-additive';
import {
  ErreurLecturePrisma,
  lireMigrationSql,
  lireSchemaPrisma,
} from '../../../scripts/lot/lecteur-prisma';
import { clauseEtatsOccupants, ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';

const TSX = resolve('node_modules/tsx/dist/cli.mjs');

function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

function lancer(script: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, script, ...args], { encoding: 'utf8' });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

function lancerDans(depot: string, script: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [TSX, script, ...args], { cwd: depot, encoding: 'utf8' });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Un dépôt git JETABLE : les gardes qui balaient `git ls-files` n'y sont pas aveugles. */
function depotJetable(prefixe: string, fichiers: Record<string, string>): string {
  const depot = mkdtempSync(join(tmpdir(), prefixe));
  execFileSync('git', ['init', '-q'], { cwd: depot });
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(depot, dirname(chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  }
  execFileSync('git', ['add', '-A'], { cwd: depot });
  return depot;
}

// ── le socle du schéma, tel que le pose la tâche qui ouvre le journal ──────────────────────────
// Les treize états se LISENT dans le schéma du dépôt, jamais tapés ici (RM-01, RM-06).
const TREIZE = enumsDuSchema(readFileSync('prisma/schema.prisma', 'utf8')).get('EtatAttribution')!;
const SCHEMA_SOCLE = [
  'generator client {',
  '  provider = "prisma-client-js"',
  '}',
  '',
  'datasource db {',
  '  provider = "postgresql"',
  '  url      = env("DATABASE_URL")',
  '}',
  '',
  'enum EtatAttribution {',
  ...TREIZE.map((e) => `  ${e}`),
  '  @@map("etat_attribution")',
  '}',
  '',
  'enum TypeEvenementJournal {',
  '  journal_ouvert',
  '  @@map("type_evenement_journal")',
  '}',
  '',
  'model Evenement {',
  '  id        BigInt               @id @default(autoincrement())',
  '  type      TypeEvenementJournal',
  '  agregatId String?              @map("agregat_id") @db.Uuid',
  '  survenuAt DateTime             @map("survenu_at") @db.Timestamptz(3)',
  '  charge    Json',
  '  prevHash  String               @unique @map("prev_hash") @db.Char(64)',
  '  selfHash  String               @unique @map("self_hash") @db.Char(64)',
  '',
  '  @@map("evenements")',
  '}',
  '',
].join('\n');

const MIGRATION_SOCLE = [
  '-- CreateEnum',
  'CREATE TYPE "etat_attribution" AS ENUM (',
  TREIZE.map((e) => `    '${e}'`).join(',\n'),
  ');',
  '',
  'CREATE TABLE "evenements" (',
  '    "id" BIGSERIAL NOT NULL,',
  '    "charge" JSONB NOT NULL,',
  '    CONSTRAINT "evenements_pkey" PRIMARY KEY ("id")',
  ');',
  '',
  'CREATE FUNCTION evenements_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$',
  'BEGIN',
  "  RAISE EXCEPTION 'evenements_append_only : % refusé, le journal est append-only (REQ-DM-024)', TG_OP;",
  'END;',
  '$$;',
  'CREATE TRIGGER evenements_append_only BEFORE UPDATE OR DELETE ON "evenements"',
  '  FOR EACH ROW EXECUTE FUNCTION evenements_refuser_modification();',
  'CREATE TRIGGER evenements_append_only_troncature BEFORE TRUNCATE ON "evenements"',
  '  FOR EACH STATEMENT EXECUTE FUNCTION evenements_refuser_modification();',
  '',
].join('\n');

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-DM-038 — un modèle se ferme sur SON accolade', () => {
  it('REQ-DM-038 : un champ placé après un `}` de commentaire est jugé', () => {
    const schema =
      VUE_CONFORME.schema + '\nmodel Bac {\n  id Int @id // }\n  statut String\n  nom String\n}\n';
    const fautes = controler({ ...VUE_CONFORME, schema }).filter(
      (f) => f.famille === 'colonne_vocabulaire_en_chaine'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('Bac.statut');
  });

  it('REQ-DM-038 : un champ placé après un `@default("}")` est jugé', () => {
    const schema =
      VUE_CONFORME.schema +
      '\nmodel Bac {\n  id Int @id\n  code String @default("}")\n  statut String\n}\n';
    expect(familles({ ...VUE_CONFORME, schema })).toContain('colonne_vocabulaire_en_chaine');
  });

  it('REQ-DM-038 : le lecteur rend champ, colonne `@map`, table `@@map`, type SQL de l’enum et ligne', () => {
    const lu = lireSchemaPrisma(SCHEMA_SOCLE);
    expect(lu.modeles.map((m) => [m.nom, m.table])).toEqual([['Evenement', 'evenements']]);
    const champs = lu.modeles[0]!.champs;
    expect(champs.length).toBeGreaterThan(0);
    expect(champs.map((c) => c.nom)).toEqual([
      'id',
      'type',
      'agregatId',
      'survenuAt',
      'charge',
      'prevHash',
      'selfHash',
    ]);
    const agregat = champs.find((c) => c.nom === 'agregatId')!;
    expect(agregat).toMatchObject({ colonne: 'agregat_id', type: 'String', optionnel: true });
    expect(agregat.attributs).toEqual(['@map("agregat_id")', '@db.Uuid']);
    expect(agregat.ligne).toBe(
      SCHEMA_SOCLE.split('\n').indexOf(
        SCHEMA_SOCLE.split('\n').find((l) => l.includes('agregatId'))!
      ) + 1
    );
    const etats = lu.enums.find((e) => e.nom === 'EtatAttribution')!;
    expect(etats.typeSql).toBe('etat_attribution');
    expect(etats.valeurs).toEqual(TREIZE);
    expect(TREIZE.length).toBeGreaterThan(ETATS_OCCUPANTS.length);
  });

  it('REQ-DM-038 : les fonctions historiques de la garde DÉLÈGUENT au lecteur — un `}` de commentaire ne cache aucun champ', () => {
    const schema = 'model Bac { id Int @id // }\n  statut String\n}\n';
    expect(champsDuSchema(schema).map((c) => `${c.modele}.${c.champ}:${c.type}`)).toEqual([
      'Bac.id:Int',
      'Bac.statut:String',
    ]);
    expect(enumsDuSchema('enum E { // }\n  a\n  b @map("B")\n  @@map("e")\n}\n').get('E')).toEqual([
      'a',
      'b',
    ]);
  });

  it('REQ-DM-038 : ce que le lecteur ne sait pas lire, il le REFUSE en nommant la ligne', () => {
    const cas: [string, number, RegExp][] = [
      ['model A {\n  id Int @id\n', 1, /jamais fermée/],
      ['model A {\n  id Int @id\n}\n}\n', 4, /fermante sans ouvrante/],
      ['model A {\n  id String @default("x)\n}\n', 2, /chaîne non terminée/],
      ['model A {\n  id Int @id\n  statut: String\n}\n', 3, /ni un champ/],
      ['model A {\n  id Int @id\n}\nstatut String\n', 4, /hors de tout bloc/],
      ['model A {\n  id Int @id quoi\n}\n', 2, /ni un type ni un attribut/],
      ['enum E {\n  a b\n}\n', 2, /ni un type ni un attribut/],
    ];
    for (const [texte, ligne, motif] of cas) {
      let erreur: unknown;
      try {
        lireSchemaPrisma(texte);
      } catch (e) {
        erreur = e;
      }
      expect(erreur, texte).toBeInstanceOf(ErreurLecturePrisma);
      expect((erreur as ErreurLecturePrisma).ligne, texte).toBe(ligne);
      expect((erreur as Error).message, texte).toMatch(motif);
    }
    expect(familles({ ...VUE_CONFORME, schema: 'model A {\n  id Int\n' })).toEqual([
      'schema_illisible',
    ]);
  });

  it('REQ-DM-038 : un schéma sans modèle n’est pas un vert — `perimetre_vide`', () => {
    const sansModele = VUE_CONFORME.schema.split('model ')[0]!;
    expect(familles({ ...VUE_CONFORME, schema: sansModele })).toEqual(['perimetre_vide']);
    expect(familles({ ...VUE_CONFORME, schema: sansModele + 'model Vide {\n}\n' })).toEqual([
      'perimetre_vide',
    ]);
  });

  it('REQ-DM-038 : la colonne compte autant que le champ — `code String @map("statut")` rougit', () => {
    const schema =
      VUE_CONFORME.schema + '\nmodel Bac {\n  id String @id\n  code String @map("statut")\n}\n';
    const fautes = controler({ ...VUE_CONFORME, schema });
    expect(fautes.map((f) => f.message).join('\n')).toContain('Bac.code');
  });

  it('REQ-DM-038 : le socle du schéma se lit sans faute de vocabulaire, et `Evenement.type` est jugé', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      glossaire: readFileSync('docs/GLOSSAIRE.md', 'utf8'),
      schema: SCHEMA_SOCLE,
      code: [{ chemin: 'prisma/migrations/1_socle/migration.sql', contenu: MIGRATION_SOCLE }],
    };
    const rougies = familles(vue);
    for (const f of [
      'colonne_vocabulaire_en_chaine',
      'liste_litterale_d_etats',
      'schema_illisible',
      'perimetre_vide',
    ]) {
      expect(rougies, f).not.toContain(f);
    }
    const typeEnChaine = SCHEMA_SOCLE.replace('type      TypeEvenementJournal', 'type      String');
    expect(
      controler({ ...vue, schema: typeEnChaine })
        .map((f) => f.message)
        .join('\n')
    ).toContain('Evenement.type');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-DM-038 — la garde invoquée sans extension juge', () => {
  it('REQ-DM-038 : `schema-enums` sans `.ts` imprime un verdict, et `--prove` en rend un', () => {
    const r = lancer('scripts/gates/schema-enums', '--prove');
    expect(r.sortie).toContain('partners:schema:enums');
    expect(r.code).toBe(0);
  });

  it('REQ-DM-038 : les deux autres gardes aussi, sans `.ts`', () => {
    for (const [script, id] of [
      ['scripts/gates/schema-cents', 'partners:schema:cents'],
      ['scripts/gates/migrations-additive', 'partners:migrations:additive'],
    ]) {
      const r = lancer(script!, '--prove');
      expect(r.sortie, script).toContain(`✅ ${id}`);
      expect(r.code, script).toBe(0);
    }
  });

  it('REQ-DM-038 : une copie nommée autrement ne s’exécute pas — et l’original, dans le MÊME arbre, s’exécute', () => {
    const arbre = mkdtempSync(join(tmpdir(), 'dm02-copie-'));
    try {
      for (const f of ['scripts/lot/lecteur-prisma.ts', 'scripts/lot/fichiers-suivis.ts']) {
        mkdirSync(join(arbre, dirname(f)), { recursive: true });
        copyFileSync(f, join(arbre, f));
      }
      mkdirSync(join(arbre, 'scripts/gates'), { recursive: true });
      copyFileSync(
        'scripts/gates/schema-enums.ts',
        join(arbre, 'scripts/gates/schema-enums-copie.ts')
      );
      copyFileSync('scripts/gates/schema-enums.ts', join(arbre, 'scripts/gates/schema-enums.ts'));
      const copie = lancer(join(arbre, 'scripts/gates/schema-enums-copie.ts'), '--prove');
      expect(copie.sortie.trim()).toBe('');
      expect(copie.code).toBe(0);
      const original = lancer(join(arbre, 'scripts/gates/schema-enums'), '--prove');
      expect(original.sortie).toContain('✅ partners:schema:enums');
    } finally {
      rmSync(arbre, { recursive: true, force: true });
    }
  }, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-JUR-027 → REQ-DM-038 — une liste d’états se juge par GROUPE', () => {
  it('REQ-JUR-027 → REQ-DM-038 : une liste sur plusieurs lignes rougit', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [
        { chemin: 'src/bac/liste.ts', contenu: "const x = [\n  'provisoire',\n  'active'\n];\n" },
      ],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-JUR-027 → REQ-DM-038 : des membres sans guillemets rougissent', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [{ chemin: 'src/bac/enum.ts', contenu: 'enum X { provisoire, active }\n' }],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-JUR-027 → REQ-DM-038 : une clause SQL sur plusieurs lignes rougit', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'prisma/migrations/2_bac/migration.sql',
          contenu: "SELECT 1 FROM t WHERE s IN (\n'signee',\n'convertie');\n",
        },
      ],
    };
    expect(familles(vue)).toContain('liste_litterale_d_etats');
  });

  it('REQ-JUR-027 → REQ-DM-038 : la faute nomme fichier ET ligne du premier état du groupe', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'src/bac/l.ts',
          contenu: "// en-tête\nconst x = [\n  'provisoire',\n  'active'\n];\n",
        },
      ],
    };
    expect(
      controler(vue)
        .map((f) => f.message)
        .join('\n')
    ).toContain('src/bac/l.ts:3 —');
  });

  it('REQ-JUR-027 → REQ-DM-038 : un commentaire qui cite deux états ne rougit plus, le code à côté si', () => {
    const vue = (contenu: string): Vue => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/bac/c.ts', contenu }],
    });
    expect(familles(vue("// on garde 'provisoire' et 'active'\nconst a = 1;\n"))).toEqual([]);
    expect(familles(vue("/* 'provisoire', 'active' */ f(['signee', 'convertie']);"))).toEqual([
      'liste_litterale_d_etats',
    ]);
  });

  it('REQ-JUR-027 → REQ-DM-038 : une liste cachée dans un gabarit `${…}` rougit', () => {
    const vue: Vue = {
      ...VUE_CONFORME,
      code: [{ chemin: 'src/bac/g.ts', contenu: "const q = `IN ${['provisoire', 'active']}`;" }],
    };
    expect(familles(vue)).toEqual(['liste_litterale_d_etats']);
  });

  it('REQ-JUR-027 → REQ-DM-038 : contre-témoins — un seul état par groupe, un switch sur l’enum COMPLET, des identifiants qui CONTIENNENT un état', () => {
    const complet = enumsDuSchema(VUE_CONFORME.schema).get('EtatAttribution')!;
    const cas = [
      "if (s === 'provisoire') return;\nf('active');",
      `switch (e) {\n${complet.map((v) => `  case '${v}':`).join('\n')}\n    return 1;\n}`,
      'f(activement, nombre, activeCount, signees);',
    ];
    for (const contenu of cas) {
      expect(
        familles({ ...VUE_CONFORME, code: [{ chemin: 'src/bac/x.ts', contenu }] }),
        contenu
      ).toEqual([]);
    }
    // Le switch AMPUTÉ d'un état n'est plus l'enum complet : il redevient une liste.
    const ampute = `switch (e) {\n${complet
      .slice(1)
      .map((v) => `  case '${v}':`)
      .join('\n')}\n}`;
    expect(
      familles({ ...VUE_CONFORME, code: [{ chemin: 'src/bac/x.ts', contenu: ampute }] })
    ).toEqual(['liste_litterale_d_etats']);
  });

  it('REQ-JUR-027 → REQ-DM-038 : la projection exacte est légitime par RÈGLE — en migration, et là seulement', () => {
    const socle: Vue = { ...VUE_CONFORME, schema: SCHEMA_SOCLE };
    const index = `CREATE UNIQUE INDEX "u" ON "attributions" ("siren") WHERE "statut" IN (${clauseEtatsOccupants()});`;
    const dans = (chemin: string, contenu: string) =>
      controler({ ...socle, code: [{ chemin, contenu }] }).filter(
        (f) => f.famille === 'liste_litterale_d_etats'
      );
    expect(dans('prisma/migrations/1_socle/migration.sql', MIGRATION_SOCLE)).toEqual([]);
    expect(dans('prisma/migrations/2_index/migration.sql', index)).toEqual([]);
    expect(dans('src/server/requete.sql', index)).toHaveLength(1);
    // Une migration qui n'a qu'une PARTIE de la clause rougit.
    const partiel = index.replace(`, '${ETATS_OCCUPANTS[ETATS_OCCUPANTS.length - 1]}'`, '');
    expect(dans('prisma/migrations/2_index/migration.sql', partiel)).toHaveLength(1);
  });

  it('REQ-JUR-027 → REQ-DM-038 : une liste dans le corps `$$` d’un déclencheur rougit', () => {
    const corps =
      "CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN IF NEW.statut IN ('signee', 'convertie') THEN RETURN NULL; END IF; END; $$ LANGUAGE plpgsql;";
    expect(
      familles({
        ...VUE_CONFORME,
        code: [{ chemin: 'prisma/migrations/3_x/migration.sql', contenu: corps }],
      })
    ).toEqual(['liste_litterale_d_etats']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-DM-001 — aucun flottant, tout montant en centimes entiers suffixés Cents', () => {
  const modele = (champ: string): string =>
    [
      'enum Palier {',
      '  bronze',
      '}',
      'model Ligne {',
      '  id            String @id',
      '  montantHtCents Int',
      `  ${champ}`,
      '  apporteurId   String',
      '  palier        Palier',
      '}',
      '',
    ].join('\n');
  const nomme = (champ: string, famille: string): string =>
    controlerCents(modele(champ))
      .filter((f) => f.famille === famille)
      .map((f) => f.message)
      .join('\n');

  it('REQ-DM-001 : `montantEuros Float` AU MILIEU d’un modèle rougit en nommant `Modèle.champ`', () => {
    expect(nomme('montantEuros Float', 'virgule_flottante')).toContain('Ligne.montantEuros');
  });

  it('REQ-DM-001 : un `Decimal` rougit aussi, quel que soit son nom', () => {
    expect(nomme('taux Decimal?', 'virgule_flottante')).toContain('Ligne.taux');
    expect(nomme('brut Unsupported("numeric")', 'virgule_flottante')).toContain('Ligne.brut');
  });

  it('REQ-DM-001 : `prixHt Int` rougit — un montant sans suffixe Cents', () => {
    expect(nomme('prixHt Int', 'montant_sans_suffixe')).toContain('Ligne.prixHt');
    expect(nomme('brut Int @map("solde_du")', 'montant_sans_suffixe')).toContain('Ligne.brut');
  });

  it('REQ-DM-001 : `remiseCents BigInt` rougit — des centimes qui ne sont pas un Int', () => {
    expect(nomme('remiseCents BigInt', 'centimes_non_entiers')).toContain('Ligne.remiseCents');
  });

  it('REQ-DM-001 : contre-témoins — `commissionId String`, `remiseId`, `soldeCents Int?`, une date de remise, un enum', () => {
    for (const champ of [
      'commissionId String',
      'remiseId String',
      'soldeCents Int?',
      'remiseAt DateTime',
      'tarifPalier Palier',
      'comprixe Int',
    ]) {
      expect(controlerCents(modele(champ)), champ).toEqual([]);
    }
  });

  it('REQ-DM-001 : un flottant placé après une accolade de commentaire est jugé', () => {
    const fautes = controlerCents('model Bac { id Int @id // }\n  montantEuros Float\n}\n');
    expect(fautes.map((f) => f.message).join('\n')).toContain('Bac.montantEuros');
  });

  it('REQ-DM-001 : périmètre vide et schéma illisible ne sont pas des verts', () => {
    expect(controlerCents('enum E {\n  a\n}\n').map((f) => f.famille)).toEqual(['perimetre_vide']);
    expect(controlerCents('model A {\n  id Int\n').map((f) => f.famille)).toEqual([
      'schema_illisible',
    ]);
    expect(controlerCents(SCHEMA_SOCLE)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-DM-037 — les migrations sont additives', () => {
  /** Trois migrations, la faute dans celle du MILIEU. */
  const vue = (milieu: string, adrs: VueMigrations['adrs'] = []): VueMigrations => ({
    migrations: [
      { chemin: 'prisma/migrations/1_socle/migration.sql', contenu: MIGRATION_SOCLE },
      { chemin: 'prisma/migrations/2_milieu/migration.sql', contenu: milieu },
      { chemin: 'prisma/migrations/3_fin/migration.sql', contenu: 'CREATE TABLE "w" ("id" INT);' },
    ],
    adrs,
  });

  it('REQ-DM-037 : `ALTER TABLE "x" DROP COLUMN "y"` rougit en nommant fichier, table et colonne', () => {
    const v = controlerMigrations(
      vue('CREATE TABLE "z" ("id" INT);\nALTER TABLE "x" DROP COLUMN "y";')
    );
    expect(v.fautes.map((f) => f.famille)).toEqual(['suppression_de_colonne']);
    expect(v.fautes[0]!.message).toContain(
      'prisma/migrations/2_milieu/migration.sql:2 — DROP COLUMN sur x.y'
    );
  });

  it('REQ-DM-037 : chaque famille rougit sur une migration du MILIEU', () => {
    const cas: [string, string][] = [
      ['suppression_de_table', 'DROP TABLE "y";'],
      ['renommage', 'ALTER TABLE "x" RENAME COLUMN "a" TO "b";'],
      ['renommage', 'ALTER TABLE "x" RENAME TO "y";'],
      ['enum_destructif', 'DROP TYPE "etat_attribution";'],
      ['enum_destructif', "ALTER TYPE \"etat_attribution\" RENAME VALUE 'perdue' TO 'perdu';"],
      ['enum_destructif', 'ALTER TYPE "etat_attribution" RENAME TO "etat_attribution_old";'],
      ['type_de_colonne_change', 'ALTER TABLE "x" ALTER COLUMN "id" TYPE BIGINT;'],
      ['non_null_sans_defaut', 'ALTER TABLE "x" ALTER COLUMN "id" SET NOT NULL;'],
      ['non_null_sans_defaut', 'ALTER TABLE "w" ADD COLUMN "n" INT NOT NULL;'],
      ['index_brut_supprime', 'DROP INDEX "attributions_un_occupant";'],
      ['journal_desarme', 'DROP TRIGGER evenements_append_only ON evenements;'],
      ['journal_desarme', 'ALTER TABLE evenements DISABLE TRIGGER ALL;'],
      ['journal_desarme', 'DROP FUNCTION evenements_refuser_modification() CASCADE;'],
      ['suppression_de_colonne', 'DO $$ BEGIN ALTER TABLE x DROP COLUMN y; END $$;'],
      ['sql_dynamique', "DO $$ BEGIN EXECUTE 'ALTER TABLE x DROP COLUMN y'; END $$;"],
    ];
    for (const [famille, sql] of cas) {
      const v = controlerMigrations(vue(sql));
      expect(
        v.fautes.map((f) => f.famille),
        sql
      ).toEqual([famille]);
      expect(v.fautes[0]!.chemin, sql).toBe('prisma/migrations/2_milieu/migration.sql');
    }
    const couvertes = new Set([
      ...cas.map(([f]) => f),
      'suppression_de_colonne',
      'perimetre_vide',
      'migration_illisible',
    ]);
    expect(FAMILLES_MIGRATIONS.map((f) => f.nom).filter((f) => !couvertes.has(f))).toEqual([]);
  });

  it('REQ-DM-037 : les mots d’un littéral ou d’un corps de fonction ne comptent pas', () => {
    expect(
      controlerMigrations(vue('COMMENT ON TABLE "x" IS \'ne jamais DROP TABLE ni DROP COLUMN\';'))
        .fautes
    ).toEqual([]);
    expect(controlerMigrations(vue('')).fautes).toEqual([]);
  });

  it('REQ-DM-037 : la protection du journal se DÉRIVE des déclencheurs des migrations, jamais d’un nom recopié', () => {
    // Le socle de la première migration arme deux déclencheurs (ligne et troncature).
    expect(protectionsDe(vue('').migrations).declencheurs).toBe(2);
    expect(controlerMigrations(vue('')).protections).toBe(2);
    // Sans le socle, la même table n'est protégée par rien : son déclencheur n'est pas un journal.
    const sansSocle = (sql: string) =>
      controlerMigrations({
        migrations: [{ chemin: 'prisma/migrations/2_milieu/migration.sql', contenu: sql }],
        adrs: [],
      });
    expect(sansSocle('DROP TRIGGER evenements_append_only ON evenements;').fautes).toEqual([]);
    // Un déclencheur sur INSERT seul ne protège rien ; sur UPDATE, sa table et sa fonction le sont.
    const insertSeul =
      'CREATE TRIGGER t BEFORE INSERT ON "bac" FOR EACH ROW EXECUTE FUNCTION f();\n' +
      'DROP TRIGGER t ON "bac";';
    expect(sansSocle(insertSeul).fautes).toEqual([]);
    const surUpdate = insertSeul.replace('INSERT', 'UPDATE') + '\nDROP FUNCTION f();';
    expect(sansSocle(surUpdate).fautes.map((f) => `${f.famille}:${f.ligne}`)).toEqual([
      'journal_desarme:2',
      'journal_desarme:3',
    ]);
    // Remplacer un déclencheur d'une table protégée désarme aussi.
    expect(
      controlerMigrations(
        vue(
          'CREATE OR REPLACE TRIGGER evenements_append_only BEFORE UPDATE ON "evenements" FOR EACH ROW EXECUTE FUNCTION laisser_passer();'
        )
      ).fautes.map((f) => f.famille)
    ).toEqual(['journal_desarme']);
  });

  it('REQ-DM-037 : sur le dépôt réel, la protection du journal est lue (dépôt du jour)', () => {
    const migration = readFileSync(
      'prisma/migrations/20260919000000_socle_journal/migration.sql',
      'utf8'
    );
    const reel = controlerMigrations({
      migrations: [
        {
          chemin: 'prisma/migrations/20260919000000_socle_journal/migration.sql',
          contenu: migration,
        },
      ],
      adrs: [],
    });
    expect(reel.fautes).toEqual([]);
    expect(reel.protections).toBeGreaterThan(0);
  });

  it('REQ-DM-037 : une ADR inexistante n’absout rien ; une ADR acceptée absout ET se dit', () => {
    const fautive = '-- ADR: partners/ADR-9999\nALTER TABLE "x" DROP COLUMN "y";';
    const inexistante = controlerMigrations(vue(fautive));
    expect(inexistante.fautes.map((f) => f.famille)).toEqual(['suppression_de_colonne']);
    expect(inexistante.fautes[0]!.message).toContain('n’existe pas');
    const proposee = controlerMigrations(vue(fautive, [{ numero: '9999', statut: 'propose' }]));
    expect(proposee.fautes).toHaveLength(1);
    const acceptee = controlerMigrations(vue(fautive, [{ numero: '9999', statut: 'accepte' }]));
    expect(acceptee.fautes).toEqual([]);
    expect(acceptee.absoutes.map((a) => `${a.adr} ${a.famille}`)).toEqual([
      'partners/ADR-9999 suppression_de_colonne',
    ]);
    // L'en-tête hors de la PREMIÈRE ligne n'absout rien.
    const decale = controlerMigrations(
      vue(`SELECT 1;\n${fautive}`, [{ numero: '9999', statut: 'accepte' }])
    );
    expect(decale.fautes).toHaveLength(1);
  });

  it('REQ-DM-037 : aucune migration n’est pas un vert — `perimetre_vide` ; une migration illisible non plus', () => {
    expect(controlerMigrations({ migrations: [], adrs: [] }).fautes.map((f) => f.famille)).toEqual([
      'perimetre_vide',
    ]);
    expect(controlerMigrations(vue("SELECT 'jamais fermé;")).fautes.map((f) => f.famille)).toEqual([
      'migration_illisible',
    ]);
  });

  it('REQ-DM-037 : dépôt jetable — la garde imprime son périmètre, rougit sur la faute du milieu, et imprime l’absolution', () => {
    const adr = [
      '# partners/ADR-0042 — Retrait d’une colonne morte',
      '',
      '| Champ | Valeur |',
      '| --- | --- |',
      '| **Statut** | `accepte` |',
      '',
    ].join('\n');
    const fichiers = {
      'prisma/migrations/1_socle/migration.sql': MIGRATION_SOCLE,
      'prisma/migrations/2_milieu/migration.sql': 'ALTER TABLE "x" DROP COLUMN "y";\n',
      'prisma/migrations/3_fin/migration.sql': 'CREATE TABLE "w" ("id" INT);\n',
      'docs/adr/0042-retrait.md': adr,
    };
    const script = resolve('scripts/gates/migrations-additive.ts');
    const fautif = depotJetable('dm02-mig-', fichiers);
    const absous = depotJetable('dm02-adr-', {
      ...fichiers,
      'prisma/migrations/2_milieu/migration.sql':
        '-- ADR: partners/ADR-0042\nALTER TABLE "x" DROP COLUMN "y";\n',
    });
    const vide = depotJetable('dm02-vide-', { 'README.md': 'rien' });
    try {
      const r = lancerDans(fautif, script);
      expect(r.sortie).toContain('3 migration(s) suivie(s)');
      expect(r.sortie).toContain(
        '[suppression_de_colonne] prisma/migrations/2_milieu/migration.sql:1'
      );
      expect(r.code).toBe(1);
      const a = lancerDans(absous, script);
      expect(a.sortie).toContain('absoute par partners/ADR-0042');
      expect(a.code).toBe(0);
      const v = lancerDans(vide, script);
      expect(v.sortie).toContain('[perimetre_vide]');
      expect(v.code).toBe(1);
    } finally {
      for (const d of [fautif, absous, vide]) rmSync(d, { recursive: true, force: true });
    }
  }, 120_000);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('REQ-DM-037 — l’index partiel écrit en SQL brut se juge par ensembles, pas par chaînes', () => {
  // La cible et les états se LISENT : l'exigence pour la colonne, la constante pour les états.
  const cible = cibleDeLIndex(texteDeLaReq('REQ-DM-003'))!;
  const source = {
    colonne: cible.colonne,
    colonneEtat: cible.colonneEtat,
    occupants: ETATS_OCCUPANTS,
  };
  const BAC = 'bac_attributions';
  const juger = (sql: string): string[] =>
    fautesIndexOccupant(sql, BAC, source).map((f) => f.famille);

  it('REQ-DM-037 : la cible de l’index se lit dans le texte de REQ-DM-003', () => {
    expect(cible).toBeDefined();
    expect(sqlSansEspaces(texteDeLaReq('REQ-DM-003'))).toContain(
      sqlSansEspaces(`ON ${cible.table}(${cible.colonne}) WHERE ${cible.colonneEtat} IN`)
    );
  });

  it('REQ-DM-037 : un index UNIQUE total là où l’exigence veut un partiel rougit en nommant table et index', () => {
    const fautes = fautesIndexOccupant(
      `CREATE UNIQUE INDEX "un_occupant" ON "${BAC}" ("${cible.colonne}");`,
      BAC,
      source
    );
    expect(fautes.map((f) => f.famille)).toEqual(['index_occupant_total']);
    expect(fautes[0]!.message).toContain(`« un_occupant » sur ${BAC}`);
  });

  it('REQ-DM-037 : la clause générée par clauseEtatsOccupants() est verte, dans l’ordre écrit comme réordonnée', () => {
    const index = (clause: string) =>
      `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${cible.colonne}") WHERE "${cible.colonneEtat}" IN (${clause});`;
    expect(juger(index(clauseEtatsOccupants()))).toEqual([]);
    const renverse = clauseEtatsOccupants().split(', ').reverse().join(', ');
    expect(juger(index(renverse))).toEqual([]);
  });

  it('REQ-DM-037 : la réécriture de `pg_indexes` (`= ANY (ARRAY[…::type])`) est verte', () => {
    const tableau = ETATS_OCCUPANTS.map((e) => `'${e}'::etat_attribution`).join(', ');
    const indexdef = `CREATE UNIQUE INDEX u ON public.${BAC} USING btree (${cible.colonne}) WHERE (${cible.colonneEtat} = ANY (ARRAY[${tableau}]))`;
    expect(juger(indexdef)).toEqual([]);
  });

  it('REQ-DM-037 : six états sur sept, les sept NIÉS, un OR, une clé à deux colonnes → `index_occupant_divergent`', () => {
    const six = ETATS_OCCUPANTS.slice(0, -1)
      .map((e) => `'${e}'`)
      .join(', ');
    const col = cible.colonne;
    const etat = cible.colonneEtat;
    for (const sql of [
      `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${col}") WHERE "${etat}" IN (${six});`,
      `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${col}") WHERE "${etat}" NOT IN (${clauseEtatsOccupants()});`,
      `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${col}") WHERE "${etat}" IN (${clauseEtatsOccupants()}) OR "id" > 0;`,
      `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${col}", "id") WHERE "${etat}" IN (${clauseEtatsOccupants()});`,
    ]) {
      expect(juger(sql), sql).toEqual(['index_occupant_divergent']);
    }
  });

  it('REQ-DM-037 : une autre table, un index non unique, une file sans état occupant ne sont pas jugés', () => {
    expect(
      fautesIndexOccupant(`CREATE UNIQUE INDEX "u" ON "autre" ("${cible.colonne}");`, BAC, source)
    ).toEqual([]);
    expect(juger(`CREATE INDEX "u" ON "${BAC}" ("${cible.colonne}");`)).toEqual([]);
    expect(
      juger(
        `CREATE UNIQUE INDEX "u" ON "${BAC}" ("${cible.colonne}") WHERE "${cible.colonneEtat}" = 'en_attente';`
      )
    ).toEqual([]);
  });

  it('REQ-DM-037 : dans la garde, l’index de la migration du MILIEU est jugé', () => {
    const total = `CREATE UNIQUE INDEX "un_occupant" ON "${cible.table}" ("${cible.colonne}");`;
    const code = [
      { chemin: 'prisma/migrations/1_a/migration.sql', contenu: 'CREATE TABLE "a" ("id" INT);' },
      {
        chemin: 'prisma/migrations/2_b/migration.sql',
        contenu: `CREATE TABLE "b" ("id" INT);\n${total}`,
      },
      { chemin: 'prisma/migrations/3_c/migration.sql', contenu: 'CREATE TABLE "c" ("id" INT);' },
    ];
    const fautes = controler({ ...VUE_CONFORME, code });
    expect(fautes.map((f) => f.famille)).toEqual(['index_occupant_total']);
    expect(fautes[0]!.message).toContain('prisma/migrations/2_b/migration.sql:2 —');
  });

  it('REQ-DM-037 : le lecteur SQL garde littéraux, identifiants et corps pour ce qu’ils sont', () => {
    const [a, b] = lireMigrationSql(
      'SELECT \'a;\'\'b\' AS "c""d"; /* x /* y */ ; */ DO $t$ ; $t$;'
    );
    expect(a!.jetons.map((j) => `${j.type}:${j.valeur}`)).toEqual([
      'mot:SELECT',
      "litteral:a;'b",
      'mot:AS',
      'identifiant:c"d',
    ]);
    expect(b!.jetons.map((j) => j.type)).toEqual(['mot', 'corps']);
    expect(() => lireMigrationSql("SELECT 'x;")).toThrow(ErreurLecturePrisma);
    expect(() => lireMigrationSql('/* /* */')).toThrow(ErreurLecturePrisma);
  });
});

function sqlSansEspaces(s: string): string {
  return s.replace(/\s+/g, '');
}
