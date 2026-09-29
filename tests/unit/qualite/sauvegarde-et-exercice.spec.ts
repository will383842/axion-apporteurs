// @req REQ-QA-023
/**
 * QA-T12 — UNE SAUVEGARDE QU'ON NE RESTAURE PAS N'EST PAS UNE SAUVEGARDE.
 *
 * L'exercice mensuel restaure le dernier vidage sur un Postgres ÉPHÉMÈRE, vérifie l'état des
 * migrations et la présence de lignes dans la table témoin, puis écrit un verdict daté portant
 * l'empreinte du vidage. Le travail de nuit rougit si le dernier verdict réussi est plus vieux que le
 * seuil de la SSOT. Ce fichier l'exerce sur un VRAI Postgres (Docker), jamais sur un simulacre :
 *
 *   1. TÉMOIN À DEUX FACES : le vidage réel d'une base migrée se restaure (code 0, lignes comptées) ;
 *      le même vidage tronqué d'UN octet fait échouer la restauration, et l'échec est nommé ;
 *   2. la table témoin est DÉRIVÉE du schéma (arbitrage -d7 sur délégation de Williams du
 *      2026-09-29) : la table d'attribution si le modèle existe, sinon `_prisma_migrations`, et la
 *      substitution est écrite dans le verdict ;
 *   3. la fraîcheur : un verdict réussi plus vieux que le seuil, un verdict en échec, un verdict
 *      absent ou illisible font rougir ; un verdict réussi récent passe ;
 *   4. le verdict ne porte aucune donnée : date, empreinte, table témoin, compte, motif ;
 *   5. CHIFFREMENT CÔTÉ CLIENT (avenant du rattrapage de registre, arbitrage -d7 du 2026-09-29) : un
 *      vidage déposé sans ce chiffrement est REFUSÉ et nommé ; un vidage chiffré altéré d'un octet
 *      échoue au déchiffrement, avant toute restauration ; une mauvaise clé aussi.
 *
 * RM-11 : l'instant, le seuil et le texte du schéma sont passés explicitement à chaque jugement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { IMAGE_BASE, prismaCli, RACINE } from '../../integration/harnais';
import {
  exercer,
  tableTemoin,
  jugerFraicheur,
  type Verdict,
} from '../../../scripts/sauvegarde/exercice';
import { chiffrer, dechiffrer } from '../../../scripts/sauvegarde/chiffrement';

/** Une clé factice, propre à ce test : jamais la clé réelle, jamais celle d'un autre produit. */
const CLE = 'cle-factice-de-test-exercice-de-restauration-0001';
const AUTRE_CLE = 'cle-factice-de-test-exercice-de-restauration-0002';
import { SEUILS } from '../../../src/domain/seuils/ssot';

const SCHEMA_SANS_ATTRIBUTION = 'model Evenement {\n  id String @id\n}\n';
const SCHEMA_AVEC_ATTRIBUTION =
  'model Attribution {\n  id String @id\n  @@map("attribution")\n}\nmodel Evenement {\n  id String @id\n}\n';

describe('REQ-QA-023 — la table témoin se dérive du schéma', () => {
  it('sans modèle d’attribution : _prisma_migrations, et la substitution est dite', () => {
    expect(tableTemoin(SCHEMA_SANS_ATTRIBUTION)).toEqual({
      table: '_prisma_migrations',
      substitution: true,
    });
  });
  it('avec le modèle d’attribution : sa table, lue dans @@map', () => {
    expect(tableTemoin(SCHEMA_AVEC_ATTRIBUTION)).toEqual({
      table: 'attribution',
      substitution: false,
    });
  });
  it('sur le vrai schéma du dépôt, la dérivation rend une table', () => {
    const t = tableTemoin(readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'));
    expect(t.table.length).toBeGreaterThan(0);
  });
});

describe('REQ-QA-023 — la fraîcheur de l’exercice', () => {
  const seuil = SEUILS.EXERCICE_DE_RESTAURATION_MAX_JOURS.valeur;
  const reussi = (date: string): Verdict => ({
    date,
    verdict: 'reussi',
    empreinteVidage: 'a'.repeat(64),
    temoin: { table: '_prisma_migrations', lignes: 3, substitution: true },
    motif: null,
  });

  it('le seuil vient de la SSOT, avec sa source et sa date', () => {
    expect(SEUILS.EXERCICE_DE_RESTAURATION_MAX_JOURS.unite).toBe('jours');
    expect(SEUILS.EXERCICE_DE_RESTAURATION_MAX_JOURS.source).toMatch(/QA-T12/);
  });
  it('un verdict réussi dans le délai passe', () => {
    expect(
      jugerFraicheur(reussi('2026-09-01T03:00:00Z'), new Date('2026-09-29T03:00:00Z'), seuil)
    ).toEqual({ ok: true, ageJours: 28 });
  });
  it('un verdict réussi au-delà du seuil rougit, l’âge nommé', () => {
    const j = jugerFraicheur(
      reussi('2026-08-01T03:00:00Z'),
      new Date('2026-09-29T03:00:00Z'),
      seuil
    );
    expect(j.ok).toBe(false);
    expect(j.ok === false && j.motif).toMatch(/59 jours/);
  });
  it('un verdict en échec rougit, même récent', () => {
    const v: Verdict = {
      ...reussi('2026-09-28T03:00:00Z'),
      verdict: 'echec',
      motif: 'restauration',
    };
    expect(jugerFraicheur(v, new Date('2026-09-29T03:00:00Z'), seuil).ok).toBe(false);
  });
  it('un verdict absent ou illisible rougit', () => {
    expect(jugerFraicheur(null, new Date('2026-09-29T03:00:00Z'), seuil).ok).toBe(false);
  });
});

describe('REQ-QA-023 — le vidage est chiffré côté client, et seul un vidage intact se déchiffre', () => {
  const clair = Buffer.from('contenu de vidage factice');
  it('aller-retour avec la bonne clé', () => {
    expect(dechiffrer(chiffrer(clair, CLE), CLE)).toEqual(clair);
  });
  it('deux chiffrements du même vidage diffèrent (sel et vecteur tirés à chaque fois)', () => {
    expect(chiffrer(clair, CLE).equals(chiffrer(clair, CLE))).toBe(false);
  });
  it('une mauvaise clé est refusée', () => {
    expect(() => dechiffrer(chiffrer(clair, CLE), AUTRE_CLE)).toThrow(/altéré|clé/);
  });
  it('un octet de moins est refusé', () => {
    const c = chiffrer(clair, CLE);
    expect(() => dechiffrer(c.subarray(0, c.length - 1), CLE)).toThrow(/altéré|clé/);
  });
  it('un fichier sans l’en-tête du chiffrement est nommé « non chiffré »', () => {
    expect(() => dechiffrer(clair, CLE)).toThrow(/non chiffré/);
  });
  it('une clé trop courte est refusée', () => {
    expect(() => chiffrer(clair, 'courte')).toThrow(/PARTNERS_BACKUP_PASSPHRASE/);
  });
});

describe('REQ-QA-023 — TÉMOIN À DEUX FACES sur un vrai Postgres', () => {
  let source: StartedPostgreSqlContainer;
  let dossier: string;
  let vidage: string;
  let brut: Buffer;

  beforeAll(async () => {
    source = await new PostgreSqlContainer(IMAGE_BASE).start();
    prismaCli(source.getConnectionUri(), [
      'migrate',
      'deploy',
      '--schema',
      join(RACINE, 'prisma/schema.prisma'),
    ]);
    const r = spawnSync(
      'docker',
      [
        'exec',
        source.getId(),
        'pg_dump',
        '-U',
        source.getUsername(),
        '-Fc',
        '-d',
        source.getDatabase(),
      ],
      { maxBuffer: 256 * 1024 * 1024 }
    );
    if (r.status !== 0) throw new Error(`pg_dump de la base source : ${r.stderr.toString()}`);
    dossier = mkdtempSync(join(tmpdir(), 'exercice-'));
    brut = r.stdout;
    vidage = join(dossier, 'reel.dump.chiffre');
    writeFileSync(vidage, chiffrer(brut, CLE));
  }, 300_000);

  afterAll(async () => {
    await source?.stop();
    if (dossier) rmSync(dossier, { recursive: true, force: true });
  });

  it('REQ-QA-023 : le vidage réel se restaure, migrations propres, lignes du témoin comptées', async () => {
    const v = await exercer(
      vidage,
      readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'),
      CLE
    );
    expect(v.motif).toBeNull();
    expect(v.verdict).toBe('reussi');
    expect(v.temoin.lignes).toBeGreaterThan(0);
    expect(v.empreinteVidage).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(v).sort()).toEqual([
      'date',
      'empreinteVidage',
      'motif',
      'temoin',
      'verdict',
    ]);
  }, 300_000);

  it('REQ-QA-023 : un vidage tronqué d’UN octet, chiffré, fait échouer la restauration, nommée', async () => {
    const tronque = join(dossier, 'tronque.dump.chiffre');
    writeFileSync(tronque, chiffrer(brut.subarray(0, brut.length - 1), CLE));
    const v = await exercer(
      tronque,
      readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'),
      CLE
    );
    expect(v.verdict).toBe('echec');
    expect(v.motif).toMatch(/restauration/);
  }, 300_000);

  it('REQ-QA-023 : le fichier chiffré tronqué d’UN octet échoue au déchiffrement, avant toute restauration', async () => {
    const altere = join(dossier, 'altere.dump.chiffre');
    const c = readFileSync(vidage);
    writeFileSync(altere, c.subarray(0, c.length - 1));
    const v = await exercer(
      altere,
      readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'),
      CLE
    );
    expect(v.verdict).toBe('echec');
    expect(v.motif).toMatch(/déchiffrement/);
  }, 300_000);

  it('REQ-QA-023 : un vidage déposé SANS chiffrement client est refusé et nommé', async () => {
    const clair = join(dossier, 'clair.dump');
    writeFileSync(clair, brut);
    const v = await exercer(clair, readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'), CLE);
    expect(v.verdict).toBe('echec');
    expect(v.motif).toMatch(/non chiffré/);
  }, 300_000);
});
