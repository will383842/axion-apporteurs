// @req REQ-QA-021
/**
 * LA PORTE D EN BASE RÉELLE — QA-T11 (REQ-QA-021). La chaîne de `scripts/gates/gate-d.sh`, rejouée
 * pièce par pièce contre un Postgres éphémère du harnais :
 *   — la base VIERGE migrée n'a aucune différence avec `prisma/schema.prisma` ;
 *   — la base de la version PRÉCÉDENTE (l'arbre d'avant la dernière migration du dépôt) est SEMÉE
 *     par le semeur de la porte : chaque table porte une ligne, sinon une migration additive y
 *     passerait trivialement ;
 *   — sa copie, migrée par les migrations suivantes, n'a aucune différence avec le schéma et n'a
 *     perdu aucune ligne ;
 *   — TÉMOIN À DEUX FACES sur le binaire : un bac d'essai qui supprime une colonne encore lue par
 *     le code déployé sort en non nul en nommant la colonne et le fichier ; sans lui, les
 *     migrations du dépôt sortent en zéro et le vert imprime leur compte.
 *
 * Écart assumé avec la porte : la copie se fait ici par `CREATE DATABASE … TEMPLATE`, le harnais ne
 * donnant pas accès au conteneur ; `gate-d.sh` passe, lui, par `pg_dump` et `pg_restore`. L'image
 * N−1 démarrée sur le schéma N n'est jouée que par la porte, qui la construit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { RACINE, demarrerBase, environnementDeLHote, prismaCli, type Base } from './harnais';
import { REQUETE_SCHEMA, semis, type SchemaVu } from '../../scripts/lib/semis-porte-d';

let base: Base;
let arbre: string;
let sha: string;

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' }).trim();
const urlDe = (nom: string): string => {
  const u = new URL(base.url);
  u.pathname = `/${nom}`;
  return u.toString();
};
const COMPTES =
  "SELECT c.relname AS t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', c.relname), false, true, '')))[1]::text AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations' ORDER BY 1";

async function comptes(url: string): Promise<Map<string, number>> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const lignes = await client.$queryRawUnsafe<{ t: string; n: string }[]>(COMPTES);
    return new Map(lignes.map((l) => [l.t, Number(l.n)]));
  } finally {
    await client.$disconnect();
  }
}

function porteD(...args: string[]): { code: number | null; sortie: string } {
  const r = spawnSync(
    process.execPath,
    [
      join(RACINE, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/gates/migrations-additive.ts',
      '--pr',
      '--base',
      sha,
      '--deploye',
      arbre,
      ...args,
    ],
    { cwd: RACINE, env: environnementDeLHote(), encoding: 'utf8' }
  );
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

/**
 * La version N−1, calculée comme la porte (`scripts/gates/gate-d.sh`, l. 65-70) : la base de fusion
 * avec `origin/main`, ou `HEAD^1` quand cette base est HEAD lui-même (exécution sur main). Le parent
 * du dernier commit qui touche `prisma/migrations` était faux dès qu'une PR RENOMME une migration :
 * N−1 portait déjà la migration sous son ancien nom, et la copie la rejouait sous le nouveau (42710).
 * Deux replis, et aucun n'affaiblit le témoin : sans `origin/main`, l'ancienne règle ; et quand N−1
 * porte les MÊMES migrations que HEAD (une PR qui n'en touche aucune), l'ancienne règle aussi, pour
 * que la copie migrée joue toujours au moins une migration au lieu de passer à vide.
 */
function versionPrecedente(): string {
  const parDerniereMigration = (): string =>
    git('rev-parse', `${git('log', '-1', '--format=%H', '--', 'prisma/migrations')}^`);
  const origine = spawnSync('git', ['rev-parse', '--verify', '-q', 'origin/main'], {
    cwd: RACINE,
    encoding: 'utf8',
  });
  if (origine.status !== 0) return parDerniereMigration();
  const fusion = git('merge-base', 'HEAD', 'origin/main');
  const precedente = fusion === git('rev-parse', 'HEAD') ? git('rev-parse', 'HEAD^1') : fusion;
  const memesMigrations =
    spawnSync('git', ['diff', '--quiet', precedente, 'HEAD', '--', 'prisma/migrations'], {
      cwd: RACINE,
    }).status === 0;
  return memesMigrations ? parDerniereMigration() : precedente;
}

beforeAll(async () => {
  base = await demarrerBase();
  sha = versionPrecedente();
  arbre = mkdtempSync(join(tmpdir(), 'porte-d-'));
  const archive = join(arbre, 'n-1.tar');
  git('archive', '--format=tar', '-o', archive, sha, 'prisma', 'src');
  execFileSync('tar', ['-xf', archive, '-C', arbre]);
}, 180_000);

afterAll(async () => {
  await base?.arreter();
  if (arbre) rmSync(arbre, { recursive: true, force: true });
});

describe('REQ-QA-021 — base vierge, puis vidage N−1 semé et migré', () => {
  it('REQ-QA-021 — la base VIERGE migrée n’a aucune différence avec le schéma', () => {
    const diff = prismaCli(base.url, [
      'migrate',
      'diff',
      '--from-url',
      base.url,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    expect(diff).toContain('No difference detected');
  });

  it('REQ-QA-021 — la base N−1 est SEMÉE, puis migrée sans différence ni ligne perdue', async () => {
    await base.prisma.$executeRawUnsafe('CREATE DATABASE precedente');
    prismaCli(urlDe('precedente'), [
      'migrate',
      'deploy',
      '--schema',
      join(arbre, 'prisma/schema.prisma'),
    ]);
    const client = new PrismaClient({ datasourceUrl: urlDe('precedente') });
    try {
      const [ligne] = await client.$queryRawUnsafe<{ json_build_object: SchemaVu }[]>(
        REQUETE_SCHEMA.replace(/;\s*$/, '')
      );
      const s = semis(ligne!.json_build_object);
      for (const insert of s.sql.split('\n').filter((l) => l.startsWith('INSERT'))) {
        // Le refus d'un candidat est le mécanisme : le suivant est essayé, gardé par « table vide ».
        await client.$executeRawUnsafe(insert).catch(() => 0);
      }
    } finally {
      await client.$disconnect();
    }
    const avant = await comptes(urlDe('precedente'));
    const vides = [...avant].filter(([, n]) => n === 0).map(([t]) => t);
    expect(vides, `tables que le semeur n’a pas su semer : ${vides.join(', ')}`).toEqual([]);
    expect(avant.size).toBeGreaterThan(0);

    await base.prisma.$executeRawUnsafe('CREATE DATABASE migree TEMPLATE precedente');
    prismaCli(urlDe('migree'), ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    const diff = prismaCli(urlDe('migree'), [
      'migrate',
      'diff',
      '--from-url',
      urlDe('migree'),
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    expect(diff).toContain('No difference detected');
    const apres = await comptes(urlDe('migree'));
    for (const [t, n] of avant)
      expect(apres.get(t), `ligne perdue dans ${t}`).toBeGreaterThanOrEqual(n);
  }, 180_000);
});

describe('REQ-QA-021 — témoin à deux faces sur le binaire de la porte', () => {
  it('REQ-QA-021 — face ROUGE : le bac d’essai qui supprime une colonne encore lue sort en non nul', () => {
    const bac = join(arbre, 'bac', '99999999999999_temoin_porte_d');
    mkdirSync(bac, { recursive: true });
    writeFileSync(
      join(bac, 'migration.sql'),
      'ALTER TABLE "sessions_espace" DROP COLUMN "revoque_at";\n'
    );
    const { code, sortie } = porteD('--en-plus', bac);
    expect(code).toBe(1);
    expect(sortie).toContain('sessions_espace.revoque_at, encore lue par le code déployé : src/');
  });

  it('REQ-QA-021 — face VERTE : les migrations du dépôt sortent en zéro, et le vert les compte', () => {
    const { code, sortie } = porteD();
    expect(sortie).toMatch(/✅ porte D — [1-9]\d* migration\(s\) de la PR confrontée\(s\)/);
    expect(code).toBe(0);
  });
});
