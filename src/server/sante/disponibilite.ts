/**
 * La vie et la disponibilité de l'instance — QA-T04 (REQ-QA-020).
 *
 * DEUX QUESTIONS DIFFÉRENTES, ET LES CONFONDRE EST LE DÉFAUT QUE CE MODULE FERME.
 *  - `livez` : le serveur répond-il ? 200 dès qu'il répond, sans rien consulter. Une sonde de vie qui
 *    interrogerait la base ferait redémarrer l'instance à chaque panne de la base.
 *  - `readyz` : l'instance sait-elle SERVIR ? 503 si l'environnement, la base, le cache ou une
 *    migration en attente est en défaut, 200 sinon. C'est elle que le `HEALTHCHECK` de l'image et la
 *    sonde de la plateforme interrogent : une sonde de vie déclarerait saine une instance qui ne sait
 *    pas servir.
 *
 * La réponse NOMME chaque sous-système en défaut, et rien d'autre : ni URL, ni message d'erreur, ni
 * nom de variable — la route est publique, et un message de pilote de base porte l'hôte.
 *
 * Chaque sonde a son délai : une base qui ne répond plus ne doit pas faire attendre la plateforme
 * au-delà du sien. Les sondes sont jouées EN PARALLÈLE, et une sonde qui lève compte pour un
 * défaut : l'échec est fermé.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { lireDemarrage } from '../../lib/env';
import { OPTIONS_DU_CLIENT } from '../securite/rate-limit';

/** Les sous-systèmes jugés, dans l'ordre où la réponse les rend. */
export const SOUS_SYSTEMES = ['environnement', 'base', 'cache', 'migrations'] as const;
export type SousSysteme = (typeof SOUS_SYSTEMES)[number];
export type EtatDeSousSysteme = 'ok' | 'en_defaut';

export interface EtatDisponibilite {
  pret: boolean;
  sousSystemes: Record<SousSysteme, EtatDeSousSysteme>;
  enDefaut: SousSysteme[];
}

export interface OptionsDisponibilite {
  /** L'environnement jugé : `process.env` pour la route, un environnement posé pour un test. */
  env: Readonly<Record<string, string | undefined>>;
  /** Les migrations du dépôt, telles que l'image les porte. */
  dossierMigrations: string;
}

/** Le dossier des migrations de l'instance : à côté du schéma, dans le répertoire de travail. */
export const DOSSIER_MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');

/** Le délai d'une sonde, en millisecondes : sous le délai du `HEALTHCHECK` de l'image. */
const DELAI_SONDE_MS = 2_000;

/** Un client par URL de base, gardé d'un appel à l'autre : chaque sonde n'ouvre pas un pool. */
const clientsDeBase = new Map<string, PrismaClient>();

function clientDeBase(url: string): PrismaClient {
  let client = clientsDeBase.get(url);
  if (client === undefined) {
    client = new PrismaClient({ datasourceUrl: url });
    clientsDeBase.set(url, client);
  }
  return client;
}

/** Ferme les clients ouverts par les sondes (arrêt propre, fin d'un test). */
export async function fermerSondes(): Promise<void> {
  const clients = [...clientsDeBase.values()];
  clientsDeBase.clear();
  await Promise.all(clients.map((c) => c.$disconnect()));
}

/** Rend `true` si la sonde aboutit dans le délai, `false` si elle lève ou le dépasse. */
async function dansLeDelai(sonde: () => Promise<unknown>): Promise<boolean> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<false>((resoudre) => {
    minuteur = setTimeout(() => resoudre(false), DELAI_SONDE_MS);
  });
  try {
    return await Promise.race([sonde().then(() => true), delai]);
  } catch {
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

async function sonderBase(url: string): Promise<void> {
  await clientDeBase(url).$queryRaw`SELECT 1`;
}

/** Les options du client de débit (SEC-10), reprises : aucune file hors ligne, aucune relance. */
async function sonderCache(url: string): Promise<void> {
  const client = new Redis(url, OPTIONS_DU_CLIENT);
  client.on('error', () => undefined);
  try {
    await client.connect();
    const reponse = await client.ping();
    if (reponse !== 'PONG') throw new Error('cache : réponse inattendue');
  } finally {
    client.disconnect();
  }
}

/** Les migrations du disque : chaque dossier qui porte un `migration.sql`. */
function migrationsDuDisque(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dossier, e.name, 'migration.sql')))
    .map((e) => e.name);
}

/** Aucune migration du disque n'attend : chacune est appliquée, terminée, et non annulée. */
async function sonderMigrations(url: string, dossier: string): Promise<void> {
  const surLeDisque = migrationsDuDisque(dossier);
  const appliquees = await clientDeBase(url).$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const faites = new Set(appliquees.map((m) => m.migration_name));
  const enAttente = surLeDisque.filter((m) => !faites.has(m));
  if (enAttente.length > 0) throw new Error(`${enAttente.length} migration(s) en attente`);
}

/** Juge les quatre sous-systèmes. Sans URL, la sonde qui en dépend est en défaut. */
export async function verifierDisponibilite(
  options: OptionsDisponibilite
): Promise<EtatDisponibilite> {
  const { env, dossierMigrations } = options;
  const urlBase = env.DATABASE_URL;
  const urlCache = env.REDIS_URL;
  const [base, cache, migrations] = await Promise.all([
    urlBase ? dansLeDelai(() => sonderBase(urlBase)) : Promise.resolve(false),
    urlCache ? dansLeDelai(() => sonderCache(urlCache)) : Promise.resolve(false),
    urlBase
      ? dansLeDelai(() => sonderMigrations(urlBase, dossierMigrations))
      : Promise.resolve(false),
  ]);
  const verdicts: Record<SousSysteme, boolean> = {
    environnement: lireDemarrage(env).ok,
    base,
    cache,
    migrations,
  };
  const etat = (s: SousSysteme): EtatDeSousSysteme => (verdicts[s] ? 'ok' : 'en_defaut');
  const sousSystemes: Record<SousSysteme, EtatDeSousSysteme> = {
    environnement: etat('environnement'),
    base: etat('base'),
    cache: etat('cache'),
    migrations: etat('migrations'),
  };
  const enDefaut = SOUS_SYSTEMES.filter((s) => !verdicts[s]);
  return { pret: enDefaut.length === 0, sousSystemes, enDefaut };
}

const SANS_CACHE = { 'cache-control': 'no-store' } as const;

/** La réponse de `readyz` : 200 si tout est prêt, 503 sinon, et l'état qui nomme les défauts. */
export async function repondreDisponibilite(options: OptionsDisponibilite): Promise<Response> {
  const etat = await verifierDisponibilite(options);
  return Response.json(etat, { status: etat.pret ? 200 : 503, headers: SANS_CACHE });
}

/** La réponse de `livez` : 200, sans rien consulter. */
export function repondreVie(): Response {
  return Response.json({ vivant: true }, { status: 200, headers: SANS_CACHE });
}
