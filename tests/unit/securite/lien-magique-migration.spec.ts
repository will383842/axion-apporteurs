// @req REQ-SEC-001
/**
 * `lien-magique-migration.spec.ts` — lecture STATIQUE de la migration du lien magique (SEC-03),
 * sans Docker : un CHECK ou une branche du déclencheur retirés font rougir ce spec sur tout poste,
 * pas seulement en CI. Même forme que la garde de DM-06 (`apporteur-identifiants.spec.ts`).
 *
 * Chaque contrainte est exigée avec SON expression : un nom gardé sur une expression affaiblie
 * rougit aussi. Les témoins qui prouvent que la base REFUSE vivent dans
 * `tests/integration/lien-magique.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'prisma/migrations/20260926000000_lien_magique_et_session/migration.sql',
  'utf8'
);
/** Les espaces et sauts de ligne se lisent comme une espace : la forme, pas la mise en page. */
const plat = sql.replace(/\s+/g, ' ');
const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les CHECK : table, nom, expression — tels que la migration doit les porter. */
const CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['liens_magiques', 'liens_magiques_token_hash_hex', `"token_hash" ~ '^[0-9a-f]{64}$'`],
  ['liens_magiques', 'liens_magiques_kid_hex', `"kid" ~ '^[0-9a-f]{8}$'`],
  ['liens_magiques', 'liens_magiques_expire_apres_creation', `"expire_at" > "cree_at"`],
  [
    'liens_magiques',
    'liens_magiques_consomme_avant_expiration',
    `"consomme_at" IS NULL OR ("consomme_at" >= "cree_at" AND "consomme_at" < "expire_at")`,
  ],
  [
    'liens_magiques',
    'liens_magiques_annule_apres_creation',
    `"annule_at" IS NULL OR "annule_at" >= "cree_at"`,
  ],
  [
    'liens_magiques',
    'liens_magiques_consomme_ou_annule',
    `"consomme_at" IS NULL OR "annule_at" IS NULL`,
  ],
  ['sessions_espace', 'sessions_espace_token_hash_hex', `"token_hash" ~ '^[0-9a-f]{64}$'`],
  ['sessions_espace', 'sessions_espace_kid_hex', `"kid" ~ '^[0-9a-f]{8}$'`],
  ['sessions_espace', 'sessions_espace_expire_apres_creation', `"expire_at" > "cree_at"`],
  [
    'sessions_espace',
    'sessions_espace_ip_hash_hex',
    `"ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{16}$'`,
  ],
  [
    'apporteurs',
    'apporteurs_email_hash_hex',
    `"email_hash" IS NULL OR "email_hash" ~ '^[0-9a-f]{64}$'`,
  ],
  [
    'apporteurs',
    'apporteurs_courriel_complet',
    `("email_chiffre" IS NULL) = ("email_hash" IS NULL)`,
  ],
];

/** Les colonnes qu'une mise à jour ne change jamais, chacune sa branche du déclencheur. */
const IMMUABLES = ['id', 'apporteur_id', 'token_hash', 'kid', 'cree_at', 'expire_at'] as const;

describe('REQ-SEC-001 — les CHECK du lien, de la session et du courriel (lecture statique)', () => {
  for (const [table, nom, expression] of CHECKS) {
    it(`REQ-SEC-001 : ${nom} porte son expression exacte`, () => {
      expect(plat).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${nom}" CHECK (${expression});`
      );
    });
  }

  it('REQ-SEC-001 : unicité de l’empreinte du lien, de la session, du lien de session et du courriel', () => {
    for (const index of [
      'CREATE UNIQUE INDEX "liens_magiques_token_hash_key" ON "liens_magiques"("token_hash");',
      'CREATE UNIQUE INDEX "sessions_espace_token_hash_key" ON "sessions_espace"("token_hash");',
      'CREATE UNIQUE INDEX "sessions_espace_lien_magique_id_key" ON "sessions_espace"("lien_magique_id");',
      'CREATE UNIQUE INDEX "apporteurs_email_hash_key" ON "apporteurs"("email_hash");',
    ]) {
      expect(plat).toContain(index);
    }
  });

  it('REQ-SEC-001 : aucune durée écrite en SQL (les 15 minutes et les 30 jours vivent dans durees.ts)', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).toContain('CREATE TABLE "liens_magiques"');
    expect(code).not.toMatch(/interval|\b900\b|\bminute/i);
  });
});

describe('REQ-SEC-001 — le déclencheur liens_magiques_usage_unique (lecture statique)', () => {
  const debut = plat.indexOf('CREATE FUNCTION liens_magiques_refuser_modification()');
  const corps = plat.slice(debut, plat.indexOf('$$;', debut));

  it('REQ-SEC-001 : un déclencheur de LIGNE, AVANT chaque UPDATE, sans clause WHEN', () => {
    expect(plat).toContain(
      'CREATE TRIGGER liens_magiques_usage_unique BEFORE UPDATE ON "liens_magiques" FOR EACH ROW EXECUTE FUNCTION liens_magiques_refuser_modification();'
    );
    expect(plat).not.toMatch(/CREATE TRIGGER liens_magiques_usage_unique[^;]*WHEN/);
  });

  it('REQ-SEC-001 : une ligne consommée OU annulée est gelée, le refus se nomme', () => {
    expect(debut).toBeGreaterThanOrEqual(0);
    expect(corps).toContain(
      `IF OLD."consomme_at" IS NOT NULL OR OLD."annule_at" IS NOT NULL THEN RAISE EXCEPTION 'liens_magiques_usage_unique : un lien consommé ou annulé est gelé (REQ-SEC-001)';`
    );
  });

  for (const colonne of IMMUABLES) {
    it(`REQ-SEC-001 : la colonne ${colonne} ne change jamais`, () => {
      expect(corps).toMatch(
        new RegExp(
          `NEW\\."${echapper(colonne)}" IS DISTINCT FROM OLD\\."${echapper(colonne)}"[^;]*THEN RAISE EXCEPTION 'liens_magiques_usage_unique : seules consomme_at et annule_at s''écrivent \\(REQ-SEC-001\\)';`
        )
      );
    });
  }

  it('REQ-SEC-001 : DELETE et TRUNCATE restent permis, aucune branche ne les refuse', () => {
    expect(corps).not.toMatch(/TG_OP/);
    expect(plat).not.toMatch(/BEFORE (?:UPDATE OR )?(?:DELETE|TRUNCATE) ON "liens_magiques"/);
  });
});
