/**
 * exercice.ts — l'exercice de restauration de Partners (QA-T12, REQ-QA-023).
 *
 * USAGE : pnpm sauvegarde:exercice -- --vidage <fichier> [--verdict <sortie.json>]
 *             restaure le vidage chiffré sur un Postgres ÉPHÉMÈRE, juge, écrit le verdict ;
 *             code 0 si réussi, 1 sinon. Clé : PARTNERS_BACKUP_PASSPHRASE.
 *         pnpm sauvegarde:fraicheur -- --verdict <verdict.json> --now <ISO>
 *             code 1 si le dernier verdict est absent, en échec ou plus vieux que le seuil de la
 *             SSOT (`EXERCICE_DE_RESTAURATION_MAX_JOURS`).
 *
 * UNE SAUVEGARDE QU'ON NE RESTAURE PAS N'EST PAS UNE SAUVEGARDE. L'exercice, dans cet ordre :
 *   1. refuse un vidage sans chiffrement client, et déchiffre (AES-256-GCM, `chiffrement.ts`) : un
 *      octet altéré ou une mauvaise clé échouent ICI, avant toute restauration ;
 *   2. restaure sur un Postgres 16 éphémère — l'image épinglée des bancs du dépôt —, détruit à la
 *      fin quoi qu'il arrive, avec `pg_restore --exit-on-error` ;
 *   3. exige `prisma migrate status` propre ;
 *   4. exige au moins une ligne dans la table TÉMOIN, dérivée du schéma : la table d'attribution si
 *      le modèle existe, sinon `_prisma_migrations`, et la substitution est écrite dans le verdict
 *      (arbitrage -d7 sur délégation de Williams du 2026-09-29 : la table d'attribution n'existe
 *      pas encore, et la base sera vide au lancement).
 *
 * RIEN NE SORT DE LA BASE RESTAURÉE. Ni ligne, ni sortie brute de `pg_restore` ou de `prisma` :
 * une erreur de restauration peut citer une ligne de données. Le motif nomme l'ÉTAPE et le code de
 * sortie, jamais le texte. Le verdict ne porte que la date, l'empreinte du fichier, la table
 * témoin, son compte et le motif.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { IMAGE_BASE, prismaCli, RACINE } from '../../tests/integration/harnais';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { dechiffrer, estChiffre } from './chiffrement';

export type Verdict = {
  date: string;
  verdict: 'reussi' | 'echec';
  empreinteVidage: string;
  temoin: { table: string; lignes: number; substitution: boolean };
  motif: string | null;
};

const JOUR_MS = 86_400_000;

/** La table témoin : celle du modèle d'attribution s'il existe (nom lu dans `@@map`), sinon les migrations. */
export function tableTemoin(schema: string): { table: string; substitution: boolean } {
  const bloc = /model\s+Attribution\s*\{([\s\S]*?)\n\}/.exec(schema);
  if (!bloc) return { table: '_prisma_migrations', substitution: true };
  const carte = /@@map\("([^"]+)"\)/.exec(bloc[1] ?? '');
  return { table: carte?.[1] ?? 'Attribution', substitution: false };
}

export function jugerFraicheur(
  v: Verdict | null,
  maintenant: Date,
  seuilJours: number
): { ok: true; ageJours: number } | { ok: false; motif: string } {
  if (v === null) return { ok: false, motif: 'aucun verdict d’exercice lisible' };
  const date = Date.parse(v.date);
  if (Number.isNaN(date)) return { ok: false, motif: 'verdict sans date lisible' };
  const ageJours = Math.floor((maintenant.getTime() - date) / JOUR_MS);
  if (v.verdict !== 'reussi')
    return { ok: false, motif: `dernier exercice en échec (${v.motif ?? 'motif absent'})` };
  if (ageJours > seuilJours) {
    return {
      ok: false,
      motif: `dernier exercice réussi il y a ${ageJours} jours, au-delà de ${seuilJours}`,
    };
  }
  return { ok: true, ageJours };
}

export async function exercer(fichier: string, schema: string, phrase: string): Promise<Verdict> {
  const brut = readFileSync(fichier);
  const temoin = tableTemoin(schema);
  const base: Verdict = {
    date: new Date().toISOString(),
    verdict: 'echec',
    empreinteVidage: createHash('sha256').update(brut).digest('hex'),
    temoin: { ...temoin, lignes: 0 },
    motif: null,
  };
  const echec = (motif: string): Verdict => ({ ...base, motif });

  if (!estChiffre(brut)) return echec('vidage non chiffré côté client : refusé sans restauration');
  let vidage: Buffer;
  try {
    vidage = dechiffrer(brut, phrase);
  } catch (e) {
    return echec(`déchiffrement : ${(e as Error).message}`);
  }

  const pg = await new PostgreSqlContainer(IMAGE_BASE).start();
  try {
    const restauration = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        pg.getId(),
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '-U',
        pg.getUsername(),
        '-d',
        pg.getDatabase(),
      ],
      { input: vidage, maxBuffer: 64 * 1024 * 1024 }
    );
    if (restauration.status !== 0)
      return echec(`restauration : pg_restore sort en ${restauration.status}`);

    try {
      prismaCli(pg.getConnectionUri(), [
        'migrate',
        'status',
        '--schema',
        join(RACINE, 'prisma/schema.prisma'),
      ]);
    } catch {
      return echec('migrations : prisma migrate status n’est pas propre');
    }

    const compte = spawnSync(
      'docker',
      [
        'exec',
        pg.getId(),
        'psql',
        '-U',
        pg.getUsername(),
        '-d',
        pg.getDatabase(),
        '-tAc',
        `SELECT count(*) FROM "${temoin.table}"`,
      ],
      { encoding: 'utf8' }
    );
    const lignes = Number((compte.stdout ?? '').trim());
    if (compte.status !== 0 || !Number.isInteger(lignes))
      return echec(`témoin : comptage de ${temoin.table} impossible`);
    if (lignes < 1)
      return { ...echec(`témoin : ${temoin.table} est vide`), temoin: { ...temoin, lignes } };
    return { ...base, verdict: 'reussi', temoin: { ...temoin, lignes } };
  } finally {
    await pg.stop();
  }
}

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal(): Promise<number> {
  if (process.argv.includes('--fraicheur')) {
    const chemin = arg('--verdict');
    const now = arg('--now');
    if (!chemin || !now) throw new Error('usage : --fraicheur --verdict <fichier> --now <ISO>');
    let v: Verdict | null = null;
    try {
      v = existsSync(chemin) ? (JSON.parse(readFileSync(chemin, 'utf8')) as Verdict) : null;
    } catch {
      v = null;
    }
    const seuil = SEUILS.EXERCICE_DE_RESTAURATION_MAX_JOURS.valeur;
    const j = jugerFraicheur(v, new Date(now), seuil);
    if (j.ok) {
      console.log(
        `✅ sauvegarde:fraicheur — dernier exercice réussi il y a ${j.ageJours} jour(s), seuil ${seuil}`
      );
      return 0;
    }
    console.error(`❌ sauvegarde:fraicheur — ${j.motif}`);
    return 1;
  }

  const fichier = arg('--vidage');
  if (!fichier) throw new Error('usage : --vidage <fichier> [--verdict <sortie.json>]');
  const phrase = process.env.PARTNERS_BACKUP_PASSPHRASE ?? '';
  const v = await exercer(
    fichier,
    readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8'),
    phrase
  );
  const sortie = arg('--verdict');
  if (sortie) writeFileSync(sortie, `${JSON.stringify(v, null, 2)}\n`);
  const temoin = `${v.temoin.table}${v.temoin.substitution ? ' (témoin de substitution : table d’attribution absente du schéma)' : ''}`;
  if (v.verdict === 'reussi') {
    console.log(
      `✅ exercice réussi — ${v.temoin.lignes} ligne(s) dans ${temoin}, migrations propres, empreinte ${v.empreinteVidage}`
    );
    return 0;
  }
  console.error(`❌ exercice en échec — ${v.motif} (empreinte ${v.empreinteVidage})`);
  return 1;
}

const APPELE_DIRECTEMENT = /exercice\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  principal().then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
    }
  );
}
