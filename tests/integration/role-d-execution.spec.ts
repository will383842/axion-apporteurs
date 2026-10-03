// @req REQ-DM-024
/**
 * Le serveur s'exécute sous un rôle de connexion NON superutilisateur, membre de
 * `partners_execution` et JAMAIS de `partners_journal` — en base RÉELLE (QA-T62, REQ-DM-024).
 *
 * Céder la propriété d'`evenements` à `partners_journal` ne protège rien tant que le serveur
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
  ROLE_D_EXECUTION,
  constaterRoleDExecution,
  principal,
  provisionnerRoleDExecution,
  urlDuRoleDExecution,
  verificateurScram,
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
  urlServeur = urlSous(ROLE_D_EXECUTION, secret());
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
    const [privileges] = await serveur.$queryRawUnsafe<{ ecrire: boolean }[]>(
      `SELECT bool_and(has_table_privilege(current_user, format('%I', c.relname), 'SELECT,INSERT,UPDATE'))
              AS ecrire
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND pg_get_userbyid(c.relowner) <> 'partners_journal'
         AND c.relname <> '_prisma_migrations'`
    );
    expect(privileges?.ecrire).toBe(true);
  });

  it('REQ-DM-024 : le serveur ne possède aucune table', async () => {
    const [possedees] = await serveur.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)`
    );
    expect(possedees?.n).toBe(0);
  });

  it('REQ-DM-024 : TÉMOIN — la sonde de disponibilité lit l’état des migrations sous le rôle du serveur, sans pouvoir l’écrire', async () => {
    await expect(
      serveur.$queryRawUnsafe(`SELECT count(*) FROM _prisma_migrations`)
    ).resolves.toBeDefined();
    expect(
      await refus(serveur.$executeRawUnsafe(`DELETE FROM _prisma_migrations WHERE false`))
    ).toContain('42501');
  });
});

describe('REQ-DM-024 — le provisionnement', () => {
  it('REQ-DM-024 : idempotent, et la rotation du secret prend effet', async () => {
    const nouvelle = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: nouvelle });
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: nouvelle });
    await expect(constaterRoleDExecution(nouvelle)).resolves.toBeUndefined();
    expect(await refus(connecter(urlServeur).$queryRawUnsafe(`SELECT 1`))).toMatch(
      /authentication|authentification|password/i
    );
  });

  it('REQ-DM-024 : TÉMOIN — partners_app rendu superutilisateur est refusé, au provisionnement comme au constat', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`ALTER ROLE partners_app SUPERUSER`);
    try {
      expect(
        await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url }))
      ).toMatch(/superutilisateur/);
      expect(await refus(constaterRoleDExecution(url))).toMatch(/superutilisateur/);
    } finally {
      await base.prisma.$executeRawUnsafe(`ALTER ROLE partners_app NOSUPERUSER`);
    }
  });

  it('REQ-DM-024 : TÉMOIN — un rôle d’exécution membre de partners_journal est refusé au constat', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`GRANT partners_journal TO partners_app`);
    expect(await refus(constaterRoleDExecution(url))).toMatch(/partners_journal/);
    await base.prisma.$executeRawUnsafe(`REVOKE partners_journal FROM partners_app`);
  });

  it('REQ-DM-024 : TÉMOIN — SEC-50 : un journal à un autre propriétaire est refusé, au provisionnement comme au constat', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`ALTER TABLE evenements OWNER TO CURRENT_USER`);
    try {
      const attendu = 'le journal n’appartient pas à partners_journal';
      expect(
        await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url }))
      ).toBe(attendu);
      expect(await refus(constaterRoleDExecution(url))).toBe(attendu);
    } finally {
      await base.prisma.$executeRawUnsafe(`ALTER TABLE evenements OWNER TO partners_journal`);
    }
    await expect(constaterRoleDExecution(url)).resolves.toBeUndefined();
  });

  it('REQ-DM-024 : TÉMOIN — SEC-50 : un droit de réécriture accordé à la main sur le journal est refusé, au groupe comme au rôle', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`GRANT UPDATE ON evenements TO partners_execution`);
    try {
      expect(
        await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url }))
      ).toBe('partners_execution peut réécrire le journal');
      expect(await refus(constaterRoleDExecution(url))).toBe('le serveur peut réécrire le journal');
    } finally {
      await base.prisma.$executeRawUnsafe(`REVOKE UPDATE ON evenements FROM partners_execution`);
    }
    await base.prisma.$executeRawUnsafe(`GRANT TRUNCATE ON evenements TO partners_app`);
    try {
      expect(
        await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url }))
      ).toBe('le rôle d’exécution peut réécrire le journal');
      expect(await refus(constaterRoleDExecution(url))).toBe('le serveur peut réécrire le journal');
    } finally {
      await base.prisma.$executeRawUnsafe(`REVOKE TRUNCATE ON evenements FROM partners_app`);
    }
    await expect(constaterRoleDExecution(url)).resolves.toBeUndefined();
  });

  it('REQ-DM-024 : TÉMOIN — SEC-57 : un objet de plus possédé par partners_journal fait refuser le provisionnement ; le journal et sa séquence seuls passent', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    // Le journal et sa séquence seuls : la base des migrations passe.
    await expect(
      provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url })
    ).resolves.toBeUndefined();
    await base.prisma.$executeRawUnsafe(
      `CREATE FUNCTION temoin_sec_57() RETURNS integer LANGUAGE sql AS 'SELECT 1'`
    );
    await base.prisma.$executeRawUnsafe(`ALTER FUNCTION temoin_sec_57() OWNER TO partners_journal`);
    try {
      const message = await refus(
        provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url })
      );
      expect(message).toMatch(
        /^partners_journal possède autre chose que le journal et sa séquence : .*temoin_sec_57\(\)/
      );
      // Le journal et sa séquence ne sont jamais cités comme étrangers.
      expect(message).not.toMatch(/evenements/);
    } finally {
      await base.prisma.$executeRawUnsafe(`DROP FUNCTION temoin_sec_57()`);
    }
    await expect(
      provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url })
    ).resolves.toBeUndefined();
  });
});

/** Le rôle est-il membre de partners_journal, lu par le propriétaire ? */
async function membreDuJournal(role: string): Promise<boolean> {
  const [r] = await base.prisma.$queryRawUnsafe<{ m: boolean }[]>(
    `SELECT pg_has_role($1, 'partners_journal', 'MEMBER') AS m`,
    role
  );
  return r!.m;
}

describe('REQ-DM-024 — le chemin de l’entrée de l’image (principal), en échec fermé', () => {
  it('REQ-DM-024 : TÉMOIN — un rôle DÉJÀ membre de partners_journal fait refuser le démarrage, et n’est PAS réparé en silence', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`GRANT partners_journal TO partners_app`);
    expect(
      await principal({ NODE_ENV: 'test', DATABASE_MIGRATION_URL: base.url, DATABASE_URL: url })
    ).toBe(1);
    expect(await membreDuJournal(ROLE_D_EXECUTION)).toBe(true);
    await base.prisma.$executeRawUnsafe(`REVOKE partners_journal FROM partners_app`);
  });

  /** `principal`, sa sortie d'erreur CAPTURÉE : le motif prouve QUEL contrôle a refusé. */
  async function principalCapture(
    env: Record<string, string>,
    options: { constatSeul?: boolean } = {}
  ): Promise<{ code: number; sortie: string }> {
    const ecrit: string[] = [];
    const code = await principal(env, { ...options, ecrire: (texte) => void ecrit.push(texte) });
    return { code, sortie: ecrit.join('') };
  }

  /** partners_app provisionné, puis rendu membre du journal APRÈS : seul le CONSTAT peut refuser. */
  async function membreApresProvisionnement(): Promise<string> {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    await base.prisma.$executeRawUnsafe(`GRANT partners_journal TO partners_app`);
    return url;
  }

  it('REQ-DM-024 : TÉMOIN — sans URL de migration, hors production déclarée, le CONSTAT tourne quand même et refuse un membre du journal', async () => {
    const url = await membreApresProvisionnement();
    try {
      const r = await principalCapture({ NODE_ENV: 'production', DATABASE_URL: url });
      expect(r.code).toBe(1);
      expect(r.sortie).toContain('le serveur est membre de partners_journal');
    } finally {
      await base.prisma.$executeRawUnsafe(`REVOKE partners_journal FROM partners_app`);
    }
  });

  it('REQ-DM-024 : TÉMOIN — en constat seul (le retour arrière), le CONSTAT tourne et refuse un membre du journal', async () => {
    const url = await membreApresProvisionnement();
    try {
      const r = await principalCapture(
        {
          NODE_ENV: 'test',
          DATABASE_MIGRATION_URL: base.url,
          DATABASE_URL: url,
        },
        { constatSeul: true }
      );
      expect(r.code).toBe(1);
      expect(r.sortie).toContain('le serveur est membre de partners_journal');
    } finally {
      await base.prisma.$executeRawUnsafe(`REVOKE partners_journal FROM partners_app`);
    }
  });

  it('REQ-DM-024 : TÉMOIN — en constat seul (le retour arrière), rien n’est provisionné : un secret neuf n’est pas posé, un bon rôle passe', async () => {
    // Un secret NEUF, en constat seul : rien n'est provisionné, donc le secret n'est pas posé et
    // le constat ne peut pas se connecter.
    const neuf = urlSous(ROLE_D_EXECUTION, secret());
    expect(
      await principal(
        {
          NODE_ENV: 'test',
          DATABASE_MIGRATION_URL: base.url,
          DATABASE_URL: neuf,
        },
        { constatSeul: true }
      )
    ).toBe(1);
    expect(await refus(connecter(neuf).$queryRawUnsafe(`SELECT 1`))).toMatch(
      /authentication|authentification|password/i
    );
    const bon = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: bon });
    expect(
      await principal(
        {
          NODE_ENV: 'test',
          DATABASE_MIGRATION_URL: base.url,
          DATABASE_URL: bon,
        },
        { constatSeul: true }
      )
    ).toBe(0);
  });

  it('REQ-DM-024 : avec les deux URL, le provisionnement puis le constat passent', async () => {
    expect(
      await principal({
        NODE_ENV: 'test',
        DATABASE_MIGRATION_URL: base.url,
        DATABASE_URL: urlSous(ROLE_D_EXECUTION, secret()),
      })
    ).toBe(0);
  });
});

describe('REQ-DM-024 — le nom du rôle d’exécution est fixe', () => {
  it('REQ-DM-024 : TÉMOIN — un autre nom de rôle dans DATABASE_URL est refusé avant tout appel, et rien n’est créé', async () => {
    const autre = urlSous('partners_autre', secret());
    expect(
      await refus(provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: autre }))
    ).toMatch(/partners_app, et lui seul/);
    expect(
      await principal({ NODE_ENV: 'test', DATABASE_MIGRATION_URL: base.url, DATABASE_URL: autre })
    ).toBe(1);
    expect(
      await principal(
        {
          NODE_ENV: 'test',
          DATABASE_MIGRATION_URL: base.url,
          DATABASE_URL: autre,
        },
        { constatSeul: true }
      )
    ).toBe(1);
    const [cree] = await base.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'partners_autre'`
    );
    expect(cree!.n).toBe(0);
  });
});

describe('REQ-DM-024 — le secret ne voyage pas en clair jusqu’à la base', () => {
  it('REQ-DM-024 : TÉMOIN — le vérificateur SCRAM-SHA-256 a la forme de pg_authid, et ne contient pas le secret', () => {
    const s = secret();
    const v = verificateurScram(s, Buffer.alloc(16, 7));
    expect(v).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(v).not.toContain(s);
    expect(verificateurScram(s, Buffer.alloc(16, 7))).toBe(v);
    expect(verificateurScram(s)).not.toBe(v);
  });

  it('REQ-DM-024 : le rôle provisionné porte un vérificateur SCRAM, et le serveur s’y connecte', async () => {
    const url = urlSous(ROLE_D_EXECUTION, secret());
    await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: url });
    const [r] = await base.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT rolpassword LIKE 'SCRAM-SHA-256$4096:%' AS ok FROM pg_authid WHERE rolname = 'partners_app'`
    );
    expect(r!.ok).toBe(true);
    await expect(connecter(url).$queryRawUnsafe(`SELECT 1`)).resolves.toBeDefined();
  });
});

describe('REQ-DM-024 — l’URL du serveur, dérivée de celle du propriétaire', () => {
  it('REQ-DM-024 : même hôte et même base, sous partners_app et son secret', () => {
    const s = secret();
    const u = new URL(urlDuRoleDExecution('postgresql://proprio:mdp@hote:5432/partners', s));
    expect([u.username, u.password, u.host, u.pathname]).toEqual([
      ROLE_D_EXECUTION,
      s,
      'hote:5432',
      '/partners',
    ]);
  });

  it('REQ-DM-024 : TÉMOIN — un secret trop court ou hors alphabet est refusé, sans être imprimé', () => {
    for (const mauvais of ['', 'court', `${'a'.repeat(40)}'`, `${'a'.repeat(40)} b`]) {
      let message = '';
      try {
        urlDuRoleDExecution('postgresql://proprio:mdp@hote/partners', mauvais);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/secret/);
      if (mauvais !== '') expect(message).not.toContain(mauvais);
    }
  });
});

describe('REQ-DM-024 — docker-entrypoint.sh : migrer, provisionner, puis servir', () => {
  const texte = readFileSync('docker-entrypoint.sh', 'utf8');

  it('REQ-DM-024 : la migration passe sous DATABASE_MIGRATION_URL, le provisionnement suit, le serveur vient après', () => {
    const migre = texte.indexOf('DATABASE_URL="${DATABASE_MIGRATION_URL:-${DATABASE_URL:-}}"');
    const provisionne = texte.indexOf('role-d-execution');
    const sert = texte.lastIndexOf('exec "$@"');
    expect(migre).toBeGreaterThan(-1);
    expect(provisionne).toBeGreaterThan(migre);
    expect(sert).toBeGreaterThan(provisionne);
  });
});
