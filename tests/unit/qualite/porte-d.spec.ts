// @req REQ-QA-021
/**
 * LA PORTE D, SANS DOCKER — REQ-QA-021.
 *
 * Le cœur PUR de la porte : les migrations de la PR confrontées au code DÉPLOYÉ (expand puis
 * contract), et le semeur du vidage N−1. La chaîne réelle — base vierge, vidage semé, `migrate
 * diff`, image N−1 — se rejoue en CI dans `tests/integration/migrations-additives.spec.ts`.
 *
 * TÉMOIN À DEUX FACES : un bac d'essai qui supprime une colonne encore lue rougit en nommant la
 * colonne ET le fichier qui la lit ; les migrations du dépôt, confrontées au code du dépôt, ne
 * rougissent pas, et le compte des migrations confrontées est rendu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  codeDeLArbre,
  confronterAuCodeDeploye,
  vueDuDepot,
  type VuePr,
} from '../../../scripts/gates/migrations-additive';
import { chaineQuiSatisfait, semis, type SchemaVu } from '../../../scripts/lib/semis-porte-d';

const SCHEMA = `
model Session {
  id        String    @id @db.Uuid
  revoqueAt DateTime? @map("revoque_at")
  note      String?   @map("note_libre")
  @@map("sessions")
}
`;
const LECTEUR = {
  chemin: 'src/server/auth/session.ts',
  contenu:
    'import { prisma } from "../db";\n\nexport const vivante = (id: string) =>\n  prisma.session.findFirst({ where: { id, revoqueAt: null } });\n',
};
const HOMONYME = { chemin: 'src/domain/jeton.ts', contenu: 'export const revoqueAt = null;\n' };

const vuePr = (sql: string): VuePr => {
  const m = { chemin: 'prisma/migrations/99_bac/migration.sql', contenu: sql };
  return { migrations: [m], toutes: [m], schemaDeploye: SCHEMA, codeDeploye: [HOMONYME, LECTEUR] };
};

describe('REQ-QA-021 — expand puis contract : la PR confrontée au code déployé', () => {
  it('REQ-QA-021 — face ROUGE : supprimer une colonne encore lue nomme la colonne et son lecteur', () => {
    const v = confronterAuCodeDeploye(vuePr('ALTER TABLE "sessions" DROP COLUMN "revoque_at";'));
    expect(v.fautes.map((f) => f.famille)).toEqual(['lue_par_le_code_deploye']);
    expect(v.fautes[0]!.message).toContain('sessions.revoque_at');
    expect(v.fautes[0]!.message).toContain('src/server/auth/session.ts:4');
    expect(v.fautes[0]!.message).toContain('99_bac/migration.sql:1');
  });

  it('REQ-QA-021 — renommage et non-nullité sans défaut d’une colonne lue rougissent aussi', () => {
    for (const sql of [
      'ALTER TABLE "sessions" RENAME COLUMN "revoque_at" TO "revoquee_at";',
      'ALTER TABLE "sessions" ALTER COLUMN "revoque_at" SET NOT NULL;',
      'ALTER TABLE "sessions" ADD COLUMN "neuve" TEXT NOT NULL;',
      'DROP TABLE "sessions";',
    ]) {
      const v = confronterAuCodeDeploye(vuePr(sql));
      expect(
        v.fautes.map((f) => f.famille),
        sql
      ).toEqual(['lue_par_le_code_deploye']);
      expect(v.fautes[0]!.message, sql).toContain('src/server/auth/session.ts');
    }
  });

  it('REQ-QA-021 — contre-témoins : colonne que personne ne lit, homonyme sans le modèle, ajout nullable', () => {
    const nonLue = confronterAuCodeDeploye(
      vuePr('ALTER TABLE "sessions" DROP COLUMN "note_libre";')
    );
    expect(nonLue.fautes).toEqual([]);
    expect(nonLue.confrontes).toBe(1);
    const seul = vuePr('ALTER TABLE "sessions" DROP COLUMN "revoque_at";');
    seul.codeDeploye = [HOMONYME];
    expect(confronterAuCodeDeploye(seul).fautes).toEqual([]);
    const ajout = confronterAuCodeDeploye(vuePr('ALTER TABLE "sessions" ADD COLUMN "x" TEXT;'));
    expect(ajout).toMatchObject({ fautes: [], confrontes: 0, tablesTouchees: ['sessions'] });
  });

  it('REQ-QA-021 — face VERTE : les migrations du dépôt contre le code du dépôt, comptées', () => {
    const toutes = vueDuDepot().migrations;
    const v = confronterAuCodeDeploye({
      migrations: toutes,
      toutes,
      schemaDeploye: readFileSync('prisma/schema.prisma', 'utf8'),
      codeDeploye: codeDeLArbre('.'),
    });
    expect(v.fautes).toEqual([]);
    expect(v.migrations).toBe(toutes.length);
    expect(v.migrations).toBeGreaterThan(0);
    expect(v.fichiersLus).toBeGreaterThan(0);
  });
});

describe('REQ-QA-021 — le vidage N−1 est SEMÉ, pas vide', () => {
  it('REQ-QA-021 — une chaîne satisfait chaque motif de CHECK du schéma', () => {
    for (const motif of [
      '^[0-9a-f]{64}$',
      '^AX[0-9A-HJKMNP-TV-Z]{6}$',
      '^[0-9]{9}$',
      '^[a-z][a-z0-9_]*$',
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    ]) {
      expect(chaineQuiSatisfait(motif), motif).toMatch(new RegExp(motif));
    }
    expect(chaineQuiSatisfait('^(a|b)$')).toBeNull();
  });

  it('REQ-QA-021 — chaque table reçoit des candidats gardés, la référencée avant la référente', () => {
    const catalogue: SchemaVu = {
      colonnes: [
        {
          table: 'jetons',
          colonne: 'id',
          type: 'uuid',
          nonNul: true,
          defaut: false,
          valeurs: null,
        },
        {
          table: 'jetons',
          colonne: 'apporteur_id',
          type: 'uuid',
          nonNul: true,
          defaut: false,
          valeurs: null,
        },
        {
          table: 'jetons',
          colonne: 'hash',
          type: 'character(64)',
          nonNul: true,
          defaut: false,
          valeurs: null,
        },
        {
          table: 'apporteurs',
          colonne: 'id',
          type: 'uuid',
          nonNul: true,
          defaut: false,
          valeurs: null,
        },
        {
          table: 'apporteurs',
          colonne: 'statut',
          type: 'statut_apporteur',
          nonNul: true,
          defaut: false,
          valeurs: ['signe', 'resilie'],
        },
        {
          table: 'apporteurs',
          colonne: 'motif',
          type: 'text',
          nonNul: false,
          defaut: false,
          valeurs: null,
        },
      ],
      contraintes: [
        {
          table: 'jetons',
          genre: 'f',
          definition: 'FOREIGN KEY (apporteur_id) REFERENCES apporteurs(id)',
          colonnes: ['apporteur_id'],
          cible: 'apporteurs',
          colonnesCibles: ['id'],
        },
        {
          table: 'jetons',
          genre: 'c',
          definition: "CHECK ((hash)::text ~ '^[0-9a-f]{64}$'::text)",
          colonnes: ['hash'],
          cible: null,
          colonnesCibles: null,
        },
      ],
    };
    const s = semis(catalogue);
    expect(s.tables).toEqual(['apporteurs', 'jetons']);
    expect(s.sql).toContain(`CAST('${'0'.repeat(64)}' AS character(64))`);
    expect(s.sql).toContain('(SELECT "id" FROM "apporteurs" LIMIT 1)');
    expect(s.sql).toContain("CAST('resilie' AS statut_apporteur)");
    const inserts = s.sql.split('\n').filter((l) => l.startsWith('INSERT'));
    expect(inserts.length).toBe(s.candidats);
    for (const l of inserts)
      expect(l).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM "(apporteurs|jetons)"\);$/);
  });

  it('REQ-QA-021 — DM-07 : les CHECK qui LIENT deux colonnes nullables sont remplis ensemble, et un porteur exclusif n’en remplit qu’un', () => {
    const uuid = (colonne: string, nonNul = false) => ({
      table: 'attrib',
      colonne,
      type: 'uuid',
      nonNul,
      defaut: false,
      valeurs: null,
    });
    const check = (definition: string) => ({
      table: 'attrib',
      genre: 'c' as const,
      definition,
      colonnes: [],
      cible: null,
      colonnesCibles: null,
    });
    const s = semis({
      colonnes: [uuid('id', true), uuid('porteur_a'), uuid('porteur_b'), uuid('grille')],
      contraintes: [
        check('CHECK (((grille IS NOT NULL) = (porteur_a IS NOT NULL)))'),
        check('CHECK ((num_nonnulls(porteur_a, porteur_b) = 1))'),
      ],
    });
    const u = "CAST('00000000-0000-4000-8000-000000000001' AS uuid)";
    // Le candidat que les deux CHECK admettent : porteur_a ET sa grille, sans porteur_b.
    expect(s.sql).toContain(`SELECT ${u}, ${u}, NULL, ${u} WHERE`);
  });
});
