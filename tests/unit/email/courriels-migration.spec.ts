// @req REQ-INT-023
/**
 * `courriels-migration.spec.ts` — lecture STATIQUE de la migration d'INT-T10, sans Docker : un
 * CHECK ou une unicité retirés font rougir ce spec sur tout poste. Chaque contrainte est exigée
 * avec SON expression. Les témoins en base réelle vivent dans
 * `tests/integration/webhook-rebonds.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'prisma/migrations/20260927000100_courriels_envoyes_et_suppressions/migration.sql',
  'utf8'
);
const plat = sql.replace(/\s+/g, ' ');
const code = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

const CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['courriels_envoyes', 'courriels_envoyes_email_hash_hex', `"email_hash" ~ '^[0-9a-f]{64}$'`],
  [
    'courriels_envoyes',
    'courriels_envoyes_envoye_si_et_seulement_si_date',
    `("statut" = 'envoye') = ("envoye_at" IS NOT NULL)`,
  ],
  ['courriels_envoyes', 'courriels_envoyes_gabarit_forme', `"gabarit" ~ '^[a-z][a-z0-9_]*$'`],
  [
    'suppressions_courriel',
    'suppressions_courriel_email_hash_hex',
    `"email_hash" ~ '^[0-9a-f]{64}$'`,
  ],
];

describe('REQ-INT-023 — les enums et les tables des courriels (lecture statique)', () => {
  it('REQ-INT-023 : `statut_courriel` porte les quatre statuts, dont les deux RETENUS', () => {
    expect(plat).toContain(
      `CREATE TYPE "statut_courriel" AS ENUM ('envoye', 'retenu_adresse_supprimee', 'retenu_dmarc_non_verifie', 'echec');`
    );
  });

  it('REQ-INT-023 : `motif_suppression_courriel` ne porte que le rebond définitif', () => {
    expect(plat).toContain(
      `CREATE TYPE "motif_suppression_courriel" AS ENUM ('rebond_definitif');`
    );
  });

  it('REQ-INT-023 : une adresse, une ligne — l’empreinte est unique dans la liste de suppression', () => {
    expect(plat).toContain(
      'CREATE UNIQUE INDEX "suppressions_courriel_email_hash_key" ON "suppressions_courriel"("email_hash");'
    );
  });

  it('REQ-INT-023 : aucune colonne d’adresse ni de corps dans les deux tables', () => {
    const tables =
      code.match(/CREATE TABLE "(?:courriels_envoyes|suppressions_courriel)" \([^;]*\);/g) ?? [];
    expect(tables).toHaveLength(2);
    for (const t of tables) expect(t).not.toMatch(/"(?:email|adresse|destinataire|corps|sujet)"/);
  });

  it('REQ-INT-023 : l’envoi référence l’apporteur sans jamais le supprimer en cascade', () => {
    expect(plat).toContain(
      'ALTER TABLE "courriels_envoyes" ADD CONSTRAINT "courriels_envoyes_apporteur_id_fkey" FOREIGN KEY ("apporteur_id") REFERENCES "apporteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;'
    );
  });

  for (const [table, nom, expression] of CHECKS) {
    it(`REQ-INT-023 : ${nom} porte son expression exacte`, () => {
      expect(plat).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${nom}" CHECK (${expression});`
      );
    });
  }

  it('REQ-INT-023 : la migration ne désarme rien et ne retire rien', () => {
    for (const desarmement of [/DROP /i, /DISABLE TRIGGER/i, /NOT VALID/i, /CREATE OR REPLACE/i]) {
      expect(code).not.toMatch(desarmement);
    }
  });
});
