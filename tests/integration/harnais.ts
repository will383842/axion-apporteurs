/**
 * Le harnais des tests d'intégration : une base Postgres et un cache RÉELS, éphémères — né avec
 * DM-01, généralisé par QA-T02 (un seul harnais, jamais deux : RM-01).
 *
 * CE QU'IL FAIT. `demarrerBase()` lance un conteneur Postgres 16 avec pgvector, applique les
 * migrations du dépôt par `prisma migrate deploy` lancé en sous-processus avec l'URL DU CONTENEUR,
 * et rend un `PrismaClient` branché sur lui. `demarrerCache()` lance un conteneur Redis et rend son
 * URL et une `commande()` qui passe par `redis-cli` DANS le conteneur : aucun client n'est installé
 * tant qu'aucune tâche livrée n'en a besoin. `arreter()` ferme ce qui a été ouvert.
 *
 * ISOLATION : UN CONTENEUR PAR FICHIER. Chaque fichier d'intégration appelle `demarrerBase()` dans
 * son `beforeAll` ; `vitest` en `pool: forks` exécute chaque fichier dans son propre processus, donc
 * deux fichiers ne partagent ni base ni cache. Coût assumé : 10 à 20 s par fichier, trois en
 * parallèle. Réexamen déclaré au-delà de 10 fichiers ou de 3 min de phase d'intégration en CI :
 * conteneur partagé et base par fichier (`CREATE DATABASE … TEMPLATE`).
 *
 * L'ENVIRONNEMENT SE CONSTRUIT. Le sous-processus `prisma` ne reçoit que `VARIABLES_ADMISES`, plus
 * ce que le harnais pose lui-même : rien de ce que le poste porte d'autre (une URL de base, une URL
 * d'ombre, un réglage `PRISMA_*`, un `NODE_OPTIONS`) ne traverse. Ce fichier est le SEUL, sous
 * `tests/integration/`, qui lise l'environnement de l'hôte, et il ne le lit qu'à travers
 * `environnementDuSousProcessus()` — la spécification du harnais le refuse partout ailleurs.
 *
 * LIMITE DÉCLARÉE. La CLI `prisma` charge d'elle-même un `.env` voisin du schéma pour les variables
 * qu'on ne lui a PAS posées ; `DATABASE_URL`, posée ici, l'emporte toujours. Les autres ne sont pas
 * sous notre contrôle. Le dépôt ne versionne aucun `.env` (`.gitignore`).
 *
 * CE QU'IL REFUSE. Sans démon Docker, il LÈVE en le nommant : un test d'intégration qui se tait
 * faute de base est un vert qui n'a rien mesuré. `pnpm test` exige donc Docker (partners/ADR-0015,
 * décision 7 ; partners/ADR-0001). Mesuré avec testcontainers 12.1.0 : un `DOCKER_HOST` injoignable
 * fait échouer TOUTES les stratégies (docker-modem en tire l'hôte, qui prime sur la socket de
 * chacune) — il n'y a pas de repli silencieux vers un autre démon.
 *
 * IMAGES ÉPINGLÉES au tag exact ET au condensat : une image flottante change le résultat d'un test
 * sans changer une ligne du dépôt (mesuré le 2026-09-19 : `pgvector/pgvector:pg16` ne désignait plus
 * la même image que six mois plus tôt). Le conteneur appartient à son fichier de test ; le nettoyeur
 * de testcontainers le retire aussi si le processus meurt avant `arreter()`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';

/**
 * Postgres 16 avec pgvector : le même couple que la production d'axionia (`pgvector/pgvector:pg16`,
 * `axionia/docker/docker-compose.yml`), à la dernière version exacte publiée de pgvector.
 */
export const IMAGE_BASE =
  'pgvector/pgvector:0.8.3-pg16@sha256:131dcf7ff6a900545df8e7e092c270aa8c6db2f2c818e408cb45ec21316b74e6';

/**
 * Redis 7 : la production d'axionia tourne sur `redis:7-alpine` (`axionia/docker/
 * docker-compose.production.yml`), tag flottant sans version exacte lisible ; on épingle donc la
 * dernière 7.x publiée, qui est l'image que ce tag désignait le 2026-09-19.
 */
export const IMAGE_CACHE =
  'redis:7.4.11-alpine@sha256:520775a41a63e77e06c73e35d2fd9cc15921a609516818796b4ecbb813078bc7';

/** La racine du dépôt, tirée de l'emplacement du harnais : jamais du répertoire courant. */
export const RACINE = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Les SEULES variables de l'hôte qu'un sous-processus du harnais reçoit : de quoi trouver les
 * exécutables et les dossiers temporaires, le dossier de l'utilisateur, et le démon Docker.
 * `PATH` et `Path` : Windows nomme la même variable des deux façons selon le shell.
 */
export const VARIABLES_ADMISES = [
  'PATH',
  'Path',
  'SystemRoot',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'DOCKER_HOST',
] as const;

const ADMISES: ReadonlySet<string> = new Set(VARIABLES_ADMISES);

/**
 * L'environnement d'un sous-processus : les variables admises de la source, puis ce que le harnais
 * pose lui-même, qui l'emporte. Aucune autre variable de la source ne traverse.
 */
export function environnementDuSousProcessus(
  source: Readonly<Record<string, string | undefined>>,
  poses: Readonly<Record<string, string>> = {}
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(source)) {
    if (ADMISES.has(nom) && valeur !== undefined) env[nom] = valeur;
  }
  return { ...env, PRISMA_HIDE_UPDATE_MESSAGE: '1', ...poses };
}

/** L'environnement construit à partir de celui de l'hôte : la seule lecture de ce dernier. */
export function environnementDeLHote(
  poses: Readonly<Record<string, string>> = {}
): Record<string, string> {
  return environnementDuSousProcessus(process.env, poses);
}

export type Base = {
  prisma: PrismaClient;
  /** L'URL du conteneur, pour un second client ou un sous-processus. */
  url: string;
  arreter: () => Promise<void>;
};

export type Cache = {
  /** L'URL du conteneur, pour le client qu'une tâche future installera. */
  url: string;
  /** Une commande `redis-cli` exécutée dans le conteneur ; rend sa sortie, sans fin de ligne. */
  commande: (args: string[]) => Promise<string>;
  arreter: () => Promise<void>;
};

/** Lance `prisma` (CLI) en sous-processus sur l'URL donnée, et rend sa sortie. */
export function prismaCli(url: string, args: string[]): string {
  return execFileSync(
    process.execPath,
    [join(RACINE, 'node_modules/prisma/build/index.js'), ...args],
    {
      cwd: RACINE,
      env: environnementDeLHote({ DATABASE_URL: url }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

/** Démarre un conteneur ; sans démon, lève en le nommant — jamais un saut. */
async function demarrerConteneur<T>(image: string, lancer: () => Promise<T>): Promise<T> {
  try {
    return await lancer();
  } catch (e) {
    throw new Error(
      `démon Docker injoignable : les tests d'intégration exigent un conteneur réel (${image}). ` +
        `Démarre Docker Desktop puis relance. Cause : ${(e as Error).message}`,
      { cause: e }
    );
  }
}

export async function demarrerBase(): Promise<Base> {
  const conteneur: StartedPostgreSqlContainer = await demarrerConteneur(IMAGE_BASE, () =>
    new PostgreSqlContainer(IMAGE_BASE).start()
  );
  const url = conteneur.getConnectionUri();
  try {
    prismaCli(url, ['migrate', 'deploy', '--schema', join(RACINE, 'prisma/schema.prisma')]);
  } catch (e) {
    await conteneur.stop();
    throw e;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    prisma,
    url,
    arreter: async () => {
      await prisma.$disconnect();
      await conteneur.stop();
    },
  };
}

export async function demarrerCache(): Promise<Cache> {
  const conteneur: StartedRedisContainer = await demarrerConteneur(IMAGE_CACHE, () =>
    new RedisContainer(IMAGE_CACHE).start()
  );
  return {
    url: conteneur.getConnectionUrl(),
    commande: async (args) => {
      const { exitCode, output } = await conteneur.exec(['redis-cli', ...args]);
      if (exitCode !== 0)
        throw new Error(`redis-cli ${args.join(' ')} : code ${exitCode}, ${output}`);
      return output.replace(/\r?\n$/, '');
    },
    arreter: async () => {
      await conteneur.stop();
    },
  };
}
