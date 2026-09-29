// @req REQ-QA-015
/**
 * QA-T06 — LE SEMEUR DÉTERMINISTE : une preview est semée, jamais copiée de la production, et deux
 * semis des mêmes entrées donnent les mêmes données (REQ-QA-015).
 *
 * Sur un VRAI Postgres — UN seul conteneur, DEUX bases, pour ménager la mémoire du poste :
 *
 *   1. TÉMOIN À DEUX FACES sur la garde (`prisma/seed.ts --verifier` et `--comparer`) : le semeur du
 *      dépôt, joué deux fois sur deux bases neuves, sort en 0 ; deux jeux de données qui diffèrent
 *      font sortir en non nul, et la TABLE qui diverge est nommée ;
 *   2. les colonnes chiffrées tirent un vecteur aléatoire : le comparateur les DÉCHIFFRE avant de
 *      comparer — les ignorer laisserait passer un semeur qui écrirait un clair au hasard ;
 *   3. un module qui lit l'horloge du poste est attrapé par la même comparaison.
 *
 * RM-11 : l'instant et les clés sont posés par le test ; le semeur ne lit aucune horloge.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { IMAGE_BASE, prismaCli, RACINE } from './harnais';
import {
  semer,
  comparerBases,
  contexteDeSemis,
  modulesDeSemis,
  type ModuleDeSemis,
} from '../../prisma/seed';
import { clesPii } from '../../src/server/securite/pii';

const TSX = join(RACINE, 'node_modules/tsx/dist/cli.mjs');
const SEMEUR = join(RACINE, 'prisma/seed.ts');
const INSTANT = new Date('2026-09-30T00:00:00Z');
/** Des clés factices, propres à ce test : jamais celles d'un environnement réel. */
const ENV_CLES = {
  PII_ENCRYPTION_KEY: 'a1'.repeat(32),
  PII_HASH_KEY: 'cle-factice-empreintes-semeur-deterministe-0001',
  IP_HASH_SALT: 'cle-factice-adresses-semeur-deterministe-00001',
};

let pg: StartedPostgreSqlContainer;
const urls: Record<string, string> = {};

function base(nom: string): string {
  const r = spawnSync(
    'docker',
    [
      'exec',
      pg.getId(),
      'psql',
      '-U',
      pg.getUsername(),
      '-d',
      pg.getDatabase(),
      '-c',
      `CREATE DATABASE ${nom}`,
    ],
    {
      encoding: 'utf8',
    }
  );
  if (r.status !== 0) throw new Error(`création de la base ${nom}`);
  const u = new URL(pg.getConnectionUri());
  u.pathname = `/${nom}`;
  prismaCli(u.toString(), ['migrate', 'deploy', '--schema', join(RACINE, 'prisma/schema.prisma')]);
  return u.toString();
}

function lancer(args: string[]) {
  return spawnSync(process.execPath, [TSX, SEMEUR, ...args], {
    cwd: RACINE,
    encoding: 'utf8',
    env: { ...process.env, ...ENV_CLES, SEMEUR_INSTANT: INSTANT.toISOString() },
  });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer(IMAGE_BASE).start();
  for (const nom of ['a', 'b', 'c', 'd']) urls[nom] = base(nom);
}, 300_000);

afterAll(async () => {
  await pg?.stop();
});

describe('REQ-QA-015 — la garde du semeur, sur deux bases neuves', () => {
  it('REQ-QA-015 : le semeur du dépôt, joué deux fois, sort en 0 et dit combien de tables il a confrontées', () => {
    const r = lancer(['--verifier', urls.a!, urls.b!]);
    expect(r.stderr + r.stdout).toMatch(/\d+ table\(s\) confrontée\(s\)/);
    expect(r.status).toBe(0);
  }, 300_000);

  it('REQ-QA-015 : deux jeux de données qui diffèrent sortent en non nul, la table nommée', async () => {
    const b = new PrismaClient({ datasourceUrl: urls.b });
    try {
      // Une ligne de plus dans B, écrite par le producteur réel du module des battements.
      await b.battement.deleteMany({});
    } finally {
      await b.$disconnect();
    }
    const r = lancer(['--comparer', urls.a!, urls.b!]);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/battements|Battement/);
  }, 300_000);
});

describe('REQ-QA-015 — la comparaison voit ce qu’un semeur non déterministe écrirait', () => {
  const cles = clesPii(ENV_CLES);

  it('REQ-QA-015 : un module qui lit l’horloge du poste fait diverger sa table', async () => {
    const lisantLHorloge: ModuleDeSemis = {
      nom: '99-horloge-du-poste',
      semer: async (prisma, ctx) => {
        await prisma.utilisateurConsole.create({
          data: {
            id: ctx.uuid('console/horloge'),
            role: 'lecteur',
            emailChiffre: Buffer.from([1]),
            emailHash: `horloge-${process.hrtime.bigint()}`,
            creeAt: new Date(),
          },
        });
      },
    };
    const modules = [...(await modulesDeSemis()), lisantLHorloge];
    const c = new PrismaClient({ datasourceUrl: urls.c });
    const d = new PrismaClient({ datasourceUrl: urls.d });
    try {
      await semer(c, contexteDeSemis(INSTANT, cles), modules);
      await new Promise((r) => setTimeout(r, 5));
      await semer(d, contexteDeSemis(INSTANT, cles), modules);
      const ecarts = await comparerBases(c, d, cles);
      expect(ecarts.map((e) => e.table)).toContain('UtilisateurConsole');
    } finally {
      await c.$disconnect();
      await d.$disconnect();
    }
  }, 300_000);
});
