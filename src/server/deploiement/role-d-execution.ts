/**
 * Le rôle de connexion du serveur (QA-T62, REQ-DM-024) — provisionné AU DÉMARRAGE de l'image, hors
 * migration, avec l'URL de migration (le propriétaire), puis CONSTATÉ connecté comme le serveur.
 *
 * Céder la propriété d'`evenements` à `partners_journal` (DM-45) ne protège rien tant que le serveur
 * se connecte en superutilisateur. Le rôle d'exécution :
 *   — est un rôle LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION ;
 *   — est membre de `partners_execution` (ajout seul sur le journal) et JAMAIS de `partners_journal`
 *     (l'héritage lui rendrait le droit de DISABLE TRIGGER) ;
 *   — ne possède aucune table ;
 *   — reçoit, par `partners_execution`, la lecture et l'écriture de toutes les tables qui ne sont pas
 *     au journal, et les mêmes droits sur les tables à venir (privilèges par défaut du propriétaire).
 *
 * Son nom et son secret sont ceux de `DATABASE_URL` : une seule source, posée par le provisionnement
 * de la plateforme (`provisionner.ts`). Aucune valeur n'est imprimée, ni le secret, ni une URL.
 */
import { PrismaClient } from '@prisma/client';
import { productionDeclaree } from '../../lib/notify';

/** Un identifiant de rôle Postgres simple : il s'écrit sans guillemets et sans échappement. */
const NOM_DE_ROLE = /^[a-z_][a-z0-9_]{0,62}$/;
/** Le secret s'écrit dans un littéral SQL : seuls des caractères qui n'ont pas à être échappés. */
const SECRET = /^[A-Za-z0-9_.~-]{32,}$/;

/** Le nom du rôle de connexion du serveur en production, posé par `provisionner.ts`. */
export const ROLE_D_EXECUTION = 'partners_app';

export class RoleDExecutionRefuse extends Error {
  override name = 'RoleDExecutionRefuse';
}

function identiteDe(urlExecution: string): { role: string; secret: string } {
  const u = new URL(urlExecution);
  const role = decodeURIComponent(u.username);
  const secret = decodeURIComponent(u.password);
  if (!NOM_DE_ROLE.test(role)) {
    throw new RoleDExecutionRefuse(
      'le nom du rôle d’exécution doit être un identifiant simple (minuscules, chiffres, _)'
    );
  }
  if (!SECRET.test(secret)) {
    throw new RoleDExecutionRefuse(
      'le secret du rôle d’exécution : au moins 32 caractères parmi A-Z a-z 0-9 _ . ~ -'
    );
  }
  return { role, secret };
}

/**
 * L'URL du serveur, dérivée de celle du propriétaire : même hôte, même base, sous `ROLE_D_EXECUTION` et
 * son secret. Lève si le secret ne suit pas la règle, AVANT tout appel.
 */
export function urlDuRoleDExecution(urlMigration: string, secret: string): string {
  const u = new URL(urlMigration);
  u.username = ROLE_D_EXECUTION;
  u.password = encodeURIComponent(secret);
  identiteDe(u.toString());
  return u.toString();
}

async function avec<T>(url: string, f: (c: PrismaClient) => Promise<T>): Promise<T> {
  const c = new PrismaClient({ datasourceUrl: url });
  try {
    return await f(c);
  } finally {
    await c.$disconnect();
  }
}

type Etat = { existe: boolean; superutilisateur: boolean; tables: number; courant: boolean };

async function etatDu(c: PrismaClient, role: string): Promise<Etat> {
  const [e] = await c.$queryRawUnsafe<Etat[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS existe,
            COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = $1), false) AS superutilisateur,
            (SELECT count(*)::int FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
              WHERE r.rolname = $1) AS tables,
            ($1 = current_user) AS courant`,
    role
  );
  return e!;
}

/** Les tables et séquences hors journal : lecture et écriture, à `partners_execution`. */
const PRIVILEGES_HORS_JOURNAL = `DO $corps$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
      AND pg_get_userbyid(c.relowner) <> 'partners_journal' AND c.relname <> '_prisma_migrations'
  LOOP
    IF t.relkind = 'S' THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO partners_execution', t.relname);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO partners_execution', t.relname);
    END IF;
  END LOOP;
END
$corps$`;

/**
 * Pose le rôle d'exécution, idempotent : création s'il manque, attributs et secret à chaque passage
 * (la rotation du secret prend effet au démarrage suivant), appartenances et privilèges. Le journal
 * garde ses seuls droits d'ajout, posés par sa migration (DM-45).
 * REFUSE, AVANT toute écriture, un rôle superutilisateur, propriétaire d'une table, ou celui de la
 * migration.
 */
export async function provisionnerRoleDExecution(urls: {
  urlMigration: string;
  urlExecution: string;
}): Promise<void> {
  const { role, secret } = identiteDe(urls.urlExecution);
  await avec(urls.urlMigration, async (c) => {
    const e = await etatDu(c, role);
    if (e.courant || e.superutilisateur) {
      throw new RoleDExecutionRefuse(
        'le rôle d’exécution ne peut être ni superutilisateur, ni le rôle de la migration'
      );
    }
    if (e.tables > 0) {
      throw new RoleDExecutionRefuse(
        'le rôle d’exécution ne peut être propriétaire d’aucune table'
      );
    }
    const attributs = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT';
    const verbe = e.existe ? 'ALTER' : 'CREATE';
    await c.$transaction([
      c.$executeRawUnsafe(`${verbe} ROLE ${role} WITH ${attributs} PASSWORD '${secret}'`),
      c.$executeRawUnsafe(`REVOKE partners_journal FROM ${role}`),
      c.$executeRawUnsafe(`GRANT partners_execution TO ${role}`),
      c.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO partners_execution`),
      c.$executeRawUnsafe(PRIVILEGES_HORS_JOURNAL),
      c.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO partners_execution`
      ),
      c.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO partners_execution`
      ),
    ]);
  });
}

/**
 * Le constat, connecté COMME LE SERVEUR : `rolsuper` faux, aucune appartenance à `partners_journal`,
 * membre de `partners_execution`, aucune table possédée. Lève en nommant le fait manquant.
 */
export async function constaterRoleDExecution(urlExecution: string): Promise<void> {
  await avec(urlExecution, async (c) => {
    const [f] = await c.$queryRawUnsafe<
      { superutilisateur: boolean; journal: boolean; execution: boolean; tables: number }[]
    >(
      `SELECT r.rolsuper AS superutilisateur,
              pg_has_role(current_user, 'partners_journal', 'MEMBER') AS journal,
              pg_has_role(current_user, 'partners_execution', 'MEMBER') AS execution,
              (SELECT count(*)::int FROM pg_class WHERE relowner = r.oid) AS tables
       FROM pg_roles r WHERE r.rolname = current_user`
    );
    if (!f || f.superutilisateur) {
      throw new RoleDExecutionRefuse('le serveur est connecté en superutilisateur');
    }
    if (f.journal) throw new RoleDExecutionRefuse('le serveur est membre de partners_journal');
    if (!f.execution) {
      throw new RoleDExecutionRefuse('le serveur n’est pas membre de partners_execution');
    }
    if (f.tables > 0) throw new RoleDExecutionRefuse('le serveur est propriétaire de tables');
  });
}

/**
 * L'appel de `docker-entrypoint.sh` : provisionner avec `DATABASE_MIGRATION_URL`, puis constater sous
 * `DATABASE_URL`. Un échec rend 1 sans imprimer de valeur : le serveur n'est pas lancé.
 * En PRODUCTION, l'URL de migration est exigée ; ailleurs (poste, CI), son absence laisse le serveur
 * sous l'unique URL, et le dit.
 */
export async function principal(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const urlMigration = env.DATABASE_MIGRATION_URL;
  const urlExecution = env.DATABASE_URL;
  if (!urlExecution || (!urlMigration && productionDeclaree(env))) {
    process.stderr.write(
      'Demarrage refuse : DATABASE_MIGRATION_URL et DATABASE_URL sont requises.\n'
    );
    return 1;
  }
  if (!urlMigration) {
    process.stderr.write(
      "DATABASE_MIGRATION_URL absente hors production : role d'execution non provisionne.\n"
    );
    return 0;
  }
  try {
    await provisionnerRoleDExecution({ urlMigration, urlExecution });
    await constaterRoleDExecution(urlExecution);
    return 0;
  } catch (e) {
    const motif = e instanceof RoleDExecutionRefuse ? e.message : 'erreur de la base, non imprimée';
    process.stderr.write(`Demarrage refuse : role d'execution — ${motif}.\n`);
    return 1;
  }
}

// Lancé par `docker-entrypoint.sh` (`tsx src/server/deploiement/role-d-execution.ts`).
if (process.argv[1]?.endsWith('role-d-execution.ts')) {
  // `exitCode`, jamais la sortie immédiate : les connexions se ferment d'elles-mêmes (provisionner.ts).
  void principal().then((code) => {
    process.exitCode = code;
  });
}
