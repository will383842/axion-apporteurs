/**
 * Le harnais des tests d'intégration : une base Postgres RÉELLE, éphémère, migrée — né avec DM-01,
 * étendu par QA-T02 (un seul harnais, jamais deux : RM-01).
 *
 * CE QU'IL FAIT. `demarrerBase()` lance un conteneur `pgvector/pgvector:pg16` (la même image que
 * la production d'axionia), applique les migrations du dépôt par `prisma migrate deploy` lancé en
 * sous-processus avec l'URL DU CONTENEUR — jamais celle d'un `.env`, jamais celle de l'environnement
 * —, et rend un `PrismaClient` branché sur lui. `arreter()` ferme le client puis le conteneur.
 *
 * CE QU'IL REFUSE. Sans démon Docker, il LÈVE en le nommant : un test d'intégration qui se tait
 * faute de base est un vert qui n'a rien mesuré. `pnpm test` exige donc Docker (partners/ADR-0014,
 * décision 7 ; partners/ADR-0001 : « la dépendance à Docker devient structurelle »).
 *
 * CE QUE QA-T02 AJOUTERA ICI : cache éphémère, isolation par fichier, refus explicite d'un
 * environnement partagé, témoin « démon absent ». Le conteneur appartient à son fichier de test ; le
 * nettoyeur de testcontainers le retire aussi si le processus meurt avant `arreter()`.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

const IMAGE = 'pgvector/pgvector:pg16';

export type Base = {
  prisma: PrismaClient;
  /** L'URL du conteneur, pour un second client ou un sous-processus. */
  url: string;
  arreter: () => Promise<void>;
};

/** L'environnement que reçoit le sous-processus `prisma`. */
export function environnementDuSousProcessus(
  source: Record<string, string | undefined>,
  url: string
): Record<string, string | undefined> {
  return { ...source, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
}

/** Lance `prisma` (CLI) en sous-processus sur l'URL donnée, et rend sa sortie. */
export function prismaCli(url: string, args: string[]): string {
  return execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), ...args], {
    env: environnementDuSousProcessus(process.env, url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function demarrerBase(): Promise<Base> {
  let conteneur: StartedPostgreSqlContainer;
  try {
    conteneur = await new PostgreSqlContainer(IMAGE).start();
  } catch (e) {
    throw new Error(
      `démon Docker injoignable : les tests d'intégration exigent une base réelle (${IMAGE}). ` +
        `Démarre Docker Desktop puis relance. Cause : ${(e as Error).message}`,
      { cause: e }
    );
  }
  const url = conteneur.getConnectionUri();
  prismaCli(url, ['migrate', 'deploy']);
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
