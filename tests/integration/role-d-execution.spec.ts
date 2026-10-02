// @req REQ-DM-024
/**
 * Le serveur s'exécute sous un rôle de connexion NON superutilisateur, membre de
 * `partners_execution` et JAMAIS de `partners_journal` — en base RÉELLE (QA-T62, REQ-DM-024).
 *
 * Céder la propriété d'`evenements` à `partners_journal` (DM-45) ne protège rien tant que le serveur
 * se connecte en superutilisateur : il pourrait désarmer les déclencheurs du journal. Ce témoin se
 * connecte COMME LE SERVEUR, sous le rôle que `provisionnerRoleDExecution` pose avec l'URL de
 * migration, et constate :
 *   — `rolsuper` faux ; aucune appartenance à `partners_journal` ; membre de `partners_execution` ;
 *   — `ALTER TABLE evenements DISABLE TRIGGER` refusé (42501) ; une écriture sur `evenements` hors
 *     ajout aussi ;
 *   — le serveur lit et écrit les AUTRES tables, et le journal par ajout seul ;
 *   — le provisionnement est idempotent, et la rotation du secret prend effet ;
 *   — il REFUSE un rôle d'exécution superutilisateur, ou propriétaire d'une table ;
 *   — `docker-entrypoint.sh` migre avec l'URL de migration, provisionne, puis lance le serveur.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  constaterRoleDExecution,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';

let base: Base;
const clients: PrismaClient[] = [];

const secret = () => randomBytes(24).toString('hex');

/** L'URL du serveur : celle de la base, sous un autre rôle et son secret. */
function urlSous(role: string, motDePasse: string): string {
  const u = new URL(base.url);
  u.username = role;
  u.password = motDePasse;
  return u.toString();
}

function connecter(url: string): PrismaClient {
  const c = new PrismaClient({ datasourceUrl: url });
  clients.push(c);
  return c;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

let urlServeur: string;
let serveur: PrismaClient;

beforeAll(async () => {
  base = await demarrerBase();
  urlServeur = urlSous('partners_app_temoin', secret());
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: urlServeur });
  serveur = connecter(urlServeur);
}, 180_000);

afterAll(async () => {
  await Promise.all(clients.map((c) => c.$disconnect()));
  await base?.arreter();
});

describe('REQ-DM-024 — le rôle d’exécution, constaté connecté comme le serveur', () => {
  it('REQ-DM-024 : TÉMOIN — rolsuper faux, jamais membre de partners_journal, membre de partners_execution', async () => {
    const [r] = await serveur.$queryRawUnsafe<
      { rolsuper: boolean; journal: boolean; execution: boolean }[]
    >(
      `SELECT r.rolsuper,
              pg_has_role(current_user, 'partners_journal', 'MEMBER') AS journal,
              pg_has_role(current_user, 'partners_execution', 'MEMBER') AS execution
       FROM pg_roles r WHERE r.rolname = current_user`
    );
    expect(r).toEqual({ rolsuper: false, journal: false, execution: true });
  });

  it('REQ-DM-024 : TÉMOIN — DISABLE TRIGGER sur evenements est refusé (42501)', async () => {
    expect(
      await refus(serveur.$executeRawUnsafe(`ALTER TABLE "evenements" DISABLE TRIGGER ALL`))
    ).toContain('42501');
    expect(
      await refus(serveur.$executeRawUnsafe(`UPDATE "evenements" SET "type" = "type"`))
    ).toContain('42501');
  });

  it('REQ-DM-024 : le serveur lit et écrit les autres tables, et lit le journal', async () => {
    await expect(
      serveur.$queryRawUnsafe(`SELECT count(*) FROM "evenements"`)
    ).resolves.toBeDefined();
    await expect(serveur.apporteur.count()).resolves.toBeGreaterThanOrEqual(0);
    const [{ ecrire }] = await serveur.$queryRawUnsafe<{ ecrire: boolean }[]>(
      `SELECT bool_and(has_table_privilege(current_user, format('%I', c.relname), 'SELECT,INSERT,UPDATE'))
              AS ecrire
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND pg_get_userbyid(c.relowner) <> 'partners_journal'
         AND c.relname <> '_prisma_migrations'`
    );
    expect(ecrire).toBe(true);
  });

  it('REQ-DM-024 : le serveur ne possède aucune table', async () => {
    const [{ n }] = await serveur.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)`
    );
    expect(n).toBe(0);
  });
});

describe('REQ-DM-024 — le provisionnement', () => {
  it('REQ-DM-024 : idempotent, et la rotation du secret prend effet', async () => {
    const nouvelle = urlSous('partners_app_temoin', secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: nouvelle });
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: nouvelle });
    await expect(constaterRoleDExecution(nouvelle)).resolves.toBeUndefined();
    expect(await refus(connecter(urlServeur).$queryRawUnsafe(`SELECT 1`))).toMatch(
      /authentication|authentification|password/i
    );
  });

  it('REQ-DM-024 : TÉMOIN — un rôle d’exécution superutilisateur est refusé', async () => {
    expect(
      await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: base.url }))
    ).toMatch(/superutilisateur|propri/);
    expect(await refus(constaterRoleDExecution(base.url))).toMatch(/superutilisateur/);
  });

  it('REQ-DM-024 : TÉMOIN — un rôle d’exécution membre de partners_journal est refusé au constat', async () => {
    const url = urlSous('partners_app_pieges', secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`GRANT partners_journal TO partners_app_pieges`);
    expect(await refus(constaterRoleDExecution(url))).toMatch(/partners_journal/);
    await base.prisma.$executeRawUnsafe(`REVOKE partners_journal FROM partners_app_pieges`);
  });
});

describe('REQ-DM-024 — docker-entrypoint.sh : migrer, provisionner, puis servir', () => {
  const texte = readFileSync('docker-entrypoint.sh', 'utf8');

  it('REQ-DM-024 : la migration passe sous DATABASE_MIGRATION_URL, le provisionnement suit, le serveur vient après', () => {
    const migre = texte.indexOf('DATABASE_URL="$DATABASE_MIGRATION_URL"');
    const provisionne = texte.indexOf('role-d-execution');
    const sert = texte.lastIndexOf('exec "$@"');
    expect(migre).toBeGreaterThan(-1);
    expect(provisionne).toBeGreaterThan(migre);
    expect(sert).toBeGreaterThan(provisionne);
  });
});
