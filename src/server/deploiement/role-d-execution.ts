/**
 * Le rôle de connexion du serveur (QA-T62, REQ-DM-024) — provisionné AU DÉMARRAGE de l'image, hors
 * migration, avec l'URL de migration (le propriétaire), puis CONSTATÉ connecté comme le serveur.
 *
 * Céder la propriété de la table du journal à `partners_journal` ne protège rien tant que le serveur
 * se connecte en superutilisateur. Le rôle d'exécution :
 *   — est un rôle LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION ;
 *   — est membre de `partners_execution` (ajout seul sur le journal) et JAMAIS de `partners_journal`
 *     (l'héritage lui rendrait le droit de DISABLE TRIGGER) ;
 *   — ne possède aucune table ;
 *   — reçoit, par `partners_execution`, la lecture et l'écriture de toutes les tables qui ne sont pas
 *     au journal, et les mêmes droits sur les tables à venir (privilèges par défaut du propriétaire).
 *
 * Son nom est FIXE, `partners_app` (`ROLE_D_EXECUTION`) : tout autre nom dans `DATABASE_URL` est refusé
 * avant le moindre appel. Son secret est celui de `DATABASE_URL`, une seule source, posée par le
 * provisionnement de la plateforme (`provisionner.ts`). Aucune valeur n'est imprimée, ni le secret,
 * ni une URL.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { productionDeclaree } from '../../lib/notify';
import { TABLE_DU_JOURNAL } from '../evenement/journal';

/** Le secret : un alphabet sans échappement, celui que le provisionnement de la plateforme tire. */
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
  // Le nom est FIXE : un nom libre laisserait le propriétaire réécrire le secret d'un autre rôle
  // existant (en faire un rôle de connexion). Refusé AVANT tout appel à la base.
  if (role !== ROLE_D_EXECUTION) {
    throw new RoleDExecutionRefuse(`le rôle d’exécution est ${ROLE_D_EXECUTION}, et lui seul`);
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

/** Les itérations du vérificateur, celles que Postgres emploie par défaut (`scram_iterations`). */
const ITERATIONS_SCRAM = 4096;

/**
 * Le vérificateur SCRAM-SHA-256 du secret (RFC 5802, RFC 7677), au format que Postgres stocke dans
 * `pg_authid` : `SCRAM-SHA-256$<itérations>:<sel>$<StoredKey>:<ServerKey>`. Passé tel quel à
 * `PASSWORD`, il est stocké sans que le secret en clair ne voyage jusqu'à la base, ni n'atteigne ses
 * journaux (`log_statement`). Le secret est restreint à l'ASCII (`SECRET`) : la normalisation
 * SASLprep de Postgres le laisse inchangé.
 */
export function verificateurScram(secret: string, sel: Buffer = randomBytes(16)): string {
  const sale = pbkdf2Sync(secret, sel, ITERATIONS_SCRAM, 32, 'sha256');
  const cleClient = createHmac('sha256', sale).update('Client Key').digest();
  const cleStockee = createHash('sha256').update(cleClient).digest();
  const cleServeur = createHmac('sha256', sale).update('Server Key').digest();
  return `SCRAM-SHA-256$${ITERATIONS_SCRAM}:${sel.toString('base64')}$${cleStockee.toString('base64')}:${cleServeur.toString('base64')}`;
}

async function avec<T>(url: string, f: (c: PrismaClient) => Promise<T>): Promise<T> {
  const c = new PrismaClient({ datasourceUrl: url });
  try {
    return await f(c);
  } finally {
    await c.$disconnect();
  }
}

type Etat = {
  existe: boolean;
  superutilisateur: boolean;
  journal: boolean;
  tables: number;
  courant: boolean;
  /** SEC-50 : le journal (`TABLE_DU_JOURNAL`) appartient à `partners_journal`. Absent, il ne l'est pas. */
  possede: boolean;
  /** SEC-50 : `partners_execution` peut réécrire le journal (UPDATE, DELETE ou TRUNCATE). */
  groupe: boolean;
  /** SEC-50 : le rôle d'exécution lui-même peut réécrire le journal. */
  reecrit: boolean;
  /** SEC-57 : ce que `partners_journal` possède d'autre que le journal et sa séquence, décrit. */
  etrangers: string[];
};

async function etatDu(c: PrismaClient, role: string): Promise<Etat> {
  const [e] = await c.$queryRaw<Etat[]>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}::name) AS existe,
           COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = ${role}::name), false)
             AS superutilisateur,
           (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}::name)
             AND pg_has_role(${role}::name, 'partners_journal', 'MEMBER')) AS journal,
           (SELECT count(*)::int FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
             WHERE r.rolname = ${role}::name) AS tables,
           (${role}::name = current_user) AS courant,
           COALESCE((SELECT pg_get_userbyid(relowner) = 'partners_journal' FROM pg_class
             WHERE oid = to_regclass(${TABLE_DU_JOURNAL}::text)), false) AS possede,
           CASE WHEN to_regclass(${TABLE_DU_JOURNAL}::text) IS NULL
                  OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partners_execution')
             THEN false
             ELSE has_table_privilege('partners_execution', to_regclass(${TABLE_DU_JOURNAL}::text),
                    'UPDATE, DELETE, TRUNCATE')
           END AS groupe,
           CASE WHEN to_regclass(${TABLE_DU_JOURNAL}::text) IS NULL
                  OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}::name)
             THEN false
             ELSE has_table_privilege(${role}::name, to_regclass(${TABLE_DU_JOURNAL}::text),
                    'UPDATE, DELETE, TRUNCATE')
           END AS reecrit,
           -- SEC-57 : la PROPRIÉTÉ d'un objet, dans cette base ou partagée (pg_shdepend, 'o'). Les
           -- index, le TOAST et le type de ligne d'une table n'y ont pas d'entrée propre : ils
           -- suivent leur table. Le journal et sa séquence sont désignés par le NOM lié.
           ARRAY(SELECT pg_describe_object(d.classid, d.objid, d.objsubid) FROM pg_shdepend d
             WHERE d.refclassid = 'pg_authid'::regclass
               AND d.refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'partners_journal')
               AND d.deptype = 'o'
               AND d.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
               AND (d.classid <> 'pg_class'::regclass
                 OR (d.objid IS DISTINCT FROM to_regclass(${TABLE_DU_JOURNAL}::text)::oid
                   AND d.objid IS DISTINCT FROM (CASE WHEN to_regclass(${TABLE_DU_JOURNAL}::text) IS NULL
                     THEN NULL
                     ELSE pg_get_serial_sequence(${TABLE_DU_JOURNAL}::text, 'id')::regclass::oid END)))
             ORDER BY 1) AS etrangers`;
  return e!;
}

/**
 * Pose le rôle d'exécution, idempotent : création s'il manque, attributs et secret à chaque passage
 * (la rotation du secret prend effet au démarrage suivant), appartenances et privilèges. Le journal
 * garde ses seuls droits d'ajout, posés par sa migration (DM-45).
 * REFUSE, AVANT toute écriture, un rôle superutilisateur, propriétaire d'une table, ou celui de la
 * migration ; et, SEC-50, un journal qui n'appartient pas à `partners_journal`, ou que
 * `partners_execution` ou le rôle d'exécution peuvent réécrire ; et, SEC-57, un `partners_journal`
 * qui possède autre chose que le journal et sa séquence, chaque objet nommé.
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
    if (e.journal) {
      throw new RoleDExecutionRefuse('le rôle d’exécution ne peut être membre de partners_journal');
    }
    if (e.tables > 0) {
      throw new RoleDExecutionRefuse(
        'le rôle d’exécution ne peut être propriétaire d’aucune table'
      );
    }
    if (!e.possede)
      throw new RoleDExecutionRefuse('le journal n’appartient pas à partners_journal');
    if (e.etrangers.length > 0) {
      throw new RoleDExecutionRefuse(
        `partners_journal possède autre chose que le journal et sa séquence : ${e.etrangers.join(', ')}`
      );
    }
    if (e.groupe) throw new RoleDExecutionRefuse('partners_execution peut réécrire le journal');
    if (e.reecrit) throw new RoleDExecutionRefuse('le rôle d’exécution peut réécrire le journal');
    // AUCUNE valeur dans le texte SQL : le nom du rôle est le littéral `partners_app`, et le
    // vérificateur du secret passe en PARAMÈTRE LIÉ (`set_config`, local à la transaction) qu'un bloc
    // CONSTANT relit, le verbe choisi dans le bloc et la valeur citée par `%L`.
    await c.$transaction([
      c.$queryRaw`SELECT set_config('partners_execution.verificateur', ${verificateurScram(secret)}, true)`,
      // SEC-50 : le NOM du journal, de même, en paramètre lié que la boucle des droits relit : il
      // vient de son seul écrivain (`TABLE_DU_JOURNAL`), jamais d'un littéral recopié ici.
      c.$queryRaw`SELECT set_config('partners_execution.journal', ${TABLE_DU_JOURNAL}, true)`,
      c.$executeRaw`DO $corps$
DECLARE
  verbe text := CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partners_app')
    THEN 'ALTER' ELSE 'CREATE' END;
BEGIN
  EXECUTE format(
    '%s ROLE partners_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT PASSWORD %L',
    verbe, current_setting('partners_execution.verificateur')
  );
END
$corps$`,
      c.$executeRaw`GRANT partners_execution TO partners_app`,
      c.$executeRaw`GRANT USAGE ON SCHEMA public TO partners_execution`,
      // La sonde de disponibilité (`readyz`) LIT l'état des migrations sous le rôle du serveur ; elle
      // n'en écrit aucun. La lecture seule, et rien d'autre, sur la table de suivi des migrations.
      c.$executeRaw`GRANT SELECT ON _prisma_migrations TO partners_execution`,
      // Les tables et séquences hors journal : lecture et écriture, à `partners_execution`. Le journal
      // est exclu par son NOM, jamais déduit de son propriétaire (SEC-50) : sa propriété est vérifiée
      // plus haut, avant tout lot, et ses seuls droits d'ajout viennent de sa migration.
      c.$executeRaw`DO $corps$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
      AND c.oid IS DISTINCT FROM to_regclass(current_setting('partners_execution.journal'))
      AND c.oid IS DISTINCT FROM
        pg_get_serial_sequence(current_setting('partners_execution.journal'), 'id')::regclass
      AND c.relname <> '_prisma_migrations'
  LOOP
    IF t.relkind = 'S' THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO partners_execution', t.relname);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO partners_execution', t.relname);
    END IF;
  END LOOP;
END
$corps$`,
      c.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO partners_execution`,
      c.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO partners_execution`,
    ]);
  });
}

/**
 * Le constat, connecté COMME LE SERVEUR : `rolsuper` faux, aucune appartenance à `partners_journal`,
 * membre de `partners_execution`, aucune table possédée ; et, SEC-50, un journal possédé par
 * `partners_journal` que le serveur ne peut pas réécrire. Lève en nommant le fait manquant.
 */
export async function constaterRoleDExecution(urlExecution: string): Promise<void> {
  await avec(urlExecution, async (c) => {
    const [f] = await c.$queryRaw<
      {
        superutilisateur: boolean;
        journal: boolean;
        execution: boolean;
        tables: number;
        possede: boolean;
        reecrit: boolean;
      }[]
    >`
      SELECT r.rolsuper AS superutilisateur,
             pg_has_role(current_user, 'partners_journal', 'MEMBER') AS journal,
             pg_has_role(current_user, 'partners_execution', 'MEMBER') AS execution,
             (SELECT count(*)::int FROM pg_class WHERE relowner = r.oid) AS tables,
             COALESCE((SELECT pg_get_userbyid(relowner) = 'partners_journal' FROM pg_class
               WHERE oid = to_regclass(${TABLE_DU_JOURNAL}::text)), false) AS possede,
             CASE WHEN to_regclass(${TABLE_DU_JOURNAL}::text) IS NULL THEN false
               ELSE has_table_privilege(to_regclass(${TABLE_DU_JOURNAL}::text),
                      'UPDATE, DELETE, TRUNCATE')
             END AS reecrit
      FROM pg_roles r WHERE r.rolname = current_user`;
    if (!f || f.superutilisateur) {
      throw new RoleDExecutionRefuse('le serveur est connecté en superutilisateur');
    }
    if (f.journal) throw new RoleDExecutionRefuse('le serveur est membre de partners_journal');
    if (!f.execution) {
      throw new RoleDExecutionRefuse('le serveur n’est pas membre de partners_execution');
    }
    if (f.tables > 0) throw new RoleDExecutionRefuse('le serveur est propriétaire de tables');
    if (!f.possede)
      throw new RoleDExecutionRefuse('le journal n’appartient pas à partners_journal');
    if (f.reecrit) throw new RoleDExecutionRefuse('le serveur peut réécrire le journal');
  });
}

/**
 * L'appel de `docker-entrypoint.sh` : provisionner avec `DATABASE_MIGRATION_URL`, puis constater sous
 * `DATABASE_URL`. Un échec rend 1 sans imprimer de valeur : le serveur n'est pas lancé.
 * En PRODUCTION, l'URL de migration est exigée ; ailleurs (poste, CI), son absence laisse le serveur
 * sous l'unique URL, et le dit.
 */
/** Les options de l'entrée : le constat seul (le retour arrière, sans migration), et l'écrivain. */
export type OptionsPrincipal = {
  readonly constatSeul?: boolean;
  readonly ecrire?: (texte: string) => void;
};

export async function principal(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: OptionsPrincipal = {}
): Promise<number> {
  const ecrire = options.ecrire ?? ((texte: string) => void process.stderr.write(texte));
  const urlMigration = env.DATABASE_MIGRATION_URL;
  const urlExecution = env.DATABASE_URL;
  // Le CONSTAT SEUL, décidé par l'entrée (le retour arrière, sans migration) : aucun provisionnement,
  // qui écrit ; l'URL du propriétaire n'est alors pas exigée.
  const migrer = options.constatSeul !== true;
  if (!urlExecution) {
    // Sans base, rien à constater : le serveur refusera lui-même de démarrer (DATABASE_URL est exigée
    // par le schéma de src/lib/env.ts). Hors retour arrière, l'entrée refuse dès ici, comme avant.
    if (!migrer) return 0;
    ecrire('Demarrage refuse : DATABASE_URL est requise.\n');
    return 1;
  }
  if (migrer && !urlMigration && productionDeclaree(env)) {
    ecrire('Demarrage refuse : DATABASE_MIGRATION_URL est requise en production.\n');
    return 1;
  }
  // Le CONSTAT tourne dès que DATABASE_URL est posée, quel que soit l'environnement déclaré : un
  // serveur sous un superutilisateur ou un membre du journal ne démarre pas (échec fermé).
  const provisionner = migrer && Boolean(urlMigration);
  try {
    identiteDe(urlExecution);
    if (provisionner) {
      await provisionnerRoleDExecution({ urlMigration: urlMigration!, urlExecution });
    }
    await constaterRoleDExecution(urlExecution);
    return 0;
  } catch (e) {
    const motif = e instanceof RoleDExecutionRefuse ? e.message : 'erreur de la base, non imprimée';
    ecrire(`Demarrage refuse : role d'execution — ${motif}.\n`);
    return 1;
  }
}

// Lancé par `docker-entrypoint.sh` (`tsx src/server/deploiement/role-d-execution.ts`).
if (process.argv[1]?.endsWith('role-d-execution.ts')) {
  // `exitCode`, jamais la sortie immédiate : les connexions se ferment d'elles-mêmes (provisionner.ts).
  void principal(process.env, { constatSeul: process.argv.includes('--constat-seul') }).then(
    (code) => {
      process.exitCode = code;
    }
  );
}
