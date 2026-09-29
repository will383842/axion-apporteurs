/**
 * provisionner.ts — Partners sur la plateforme : base Postgres séparée, cache, application, et
 * variables posées depuis les secrets du dépôt, JAMAIS en clair (QA-T50, REQ-INT-031).
 *
 * USAGE : pnpm coolify:provisionner     (forge, workflow `coolify-provisionner.yml`, à la main)
 *
 * ── CE QU'IL FAIT, DANS CET ORDRE ────────────────────────────────────────────────────────────
 *
 *   1. SAUTE, en code 0, avec un `::warning::` par nom, si un secret de la plateforme ou un secret
 *      applicatif manque (arbitrage -d7 sur délégation de Williams du 2026-09-29) : rien n'est appelé.
 *   2. JUGE les secrets applicatifs par la règle du démarrage (`lireEnvironnement`, `src/lib/env.ts`,
 *      en production) AVANT tout appel : une valeur qui ferait refuser le démarrage n'est jamais posée.
 *   3. TROUVE le projet `Axion-Partners` et le serveur ; CRÉE, s'ils n'existent pas sous leur nom, la
 *      base Postgres, le cache Redis et l'application (image `sha-<7>`, sonde `/api/readyz`, sans
 *      déploiement immédiat — le job `deployer` s'en charge). Relancé, il ne recrée rien et le DIT.
 *   4. LIT l'adresse interne de chaque base et en fait `DATABASE_URL` et `REDIS_URL` : jamais un
 *      secret du dépôt, jamais une adresse devinée. Si la réponse ne porte pas `internal_db_url`, il
 *      s'arrête en rouge en nommant le champ.
 *   5. POSE toutes les variables en une fois (`PATCH …/envs/bulk`).
 *
 * ── API, LUE LE 2026-09-29 SUR LA DOCUMENTATION OFFICIELLE (RM-08) ───────────────────────────
 *
 *   GET /api/v1/projects (uuid, name) · GET /api/v1/servers · GET /api/v1/applications ·
 *   GET /api/v1/databases · POST /api/v1/databases/postgresql et /redis (server_uuid, project_uuid,
 *   environment_name requis) · POST /api/v1/applications/dockerimage (project_uuid, server_uuid,
 *   environment_name, docker_registry_image_name requis ; 201 `{ "uuid" }`) · GET
 *   /api/v1/databases/{uuid} · PATCH /api/v1/applications/{uuid}/envs/bulk (`data: [{ key, value }]`).
 *   ⚠️ La documentation NE DÉCRIT PAS la réponse de GET /databases et de GET /databases/{uuid}
 *   (« Content is very complex. Will be implemented later. ») : le champ `internal_db_url` est une
 *   HYPOTHÈSE, tenue en échec fermé, que la première exécution réelle confirme ou infirme.
 *
 * ── CE QUI N'EST JAMAIS IMPRIMÉ ──────────────────────────────────────────────────────────────
 *
 * Aucune valeur : ni secret, ni jeton, ni adresse interne (elle porte le mot de passe de la base), ni
 * corps de réponse. Seuls les noms, les uuid et les statuts HTTP sortent.
 */
import {
  NOMS_DES_SECRETS,
  NOMS_FACULTATIFS,
  lireEnvironnement,
  formaterRefus,
} from '../../src/lib/env';

const PROJET = 'Axion-Partners';
const ENVIRONNEMENT = 'production';
const IMAGE = 'ghcr.io/will383842/axion-apporteurs';
const NOM_APPLICATION = 'axion-partners';
const NOM_BASE = 'axion-partners-postgres';
const NOM_CACHE = 'axion-partners-redis';
/** PostgreSQL 16 : la version des bancs d'intégration du dépôt. */
const IMAGE_BASE = 'postgres:16-alpine';
const PORT = '3000';
const SONDE = '/api/readyz';

const SECRETS_DE_LA_PLATEFORME = [
  'COOLIFY_URL',
  'COOLIFY_API_TOKEN',
  'PARTNERS_URL_PUBLIQUE',
] as const;

type Element = { uuid?: unknown; name?: unknown };

class Refus extends Error {}

function adresseSure(brut: string, nom: string): URL {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    throw new Refus(`${nom} n'est pas une adresse`);
  }
  const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:' || (u.protocol === 'http:' && locale)) return u;
  throw new Refus(`${nom} doit être en https (http n'est admis que sur la boucle locale)`);
}

function plateforme(base: URL, jeton: string) {
  const racine = base.href.replace(/\/+$/, '');
  return async (
    methode: 'GET' | 'POST' | 'PATCH',
    chemin: string,
    corps?: unknown
  ): Promise<unknown> => {
    const r = await fetch(`${racine}/api/v1${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${jeton}`,
        accept: 'application/json',
        ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      redirect: 'manual',
    });
    const texte = await r.text();
    if (r.status < 200 || r.status > 299) {
      throw new Refus(`la plateforme refuse ${methode} ${chemin.split('?')[0]} : HTTP ${r.status}`);
    }
    try {
      return texte === '' ? null : (JSON.parse(texte) as unknown);
    } catch {
      throw new Refus(`réponse illisible à ${methode} ${chemin} (HTTP ${r.status})`);
    }
  };
}

function liste(v: unknown, quoi: string): { uuid: string; name: string }[] {
  if (!Array.isArray(v)) throw new Refus(`${quoi} : la plateforme ne rend pas une liste`);
  return (v as Element[])
    .filter((e) => typeof e.uuid === 'string' && typeof e.name === 'string')
    .map((e) => ({ uuid: e.uuid as string, name: e.name as string }));
}

function uuidDe(v: unknown, quoi: string): string {
  const u = (v as Element | null)?.uuid;
  if (typeof u !== 'string' || u === '')
    throw new Refus(`${quoi} : la réponse ne porte pas d'uuid`);
  return u;
}

export async function provisionner(env: NodeJS.ProcessEnv): Promise<0 | 1> {
  const manquants = [
    ...SECRETS_DE_LA_PLATEFORME.filter((n) => (env[n] ?? '') === ''),
    ...NOMS_DES_SECRETS.filter((n) => (env[n] ?? '') === ''),
  ];
  if ((env.GITHUB_SHA ?? '') === '') manquants.push('GITHUB_SHA');
  if (manquants.length > 0) {
    for (const n of manquants) {
      console.log(
        `::warning title=coolify:provisionner::${n} absent — provisionnement SAUTÉ (arbitrage -d7 du 2026-09-29)`
      );
    }
    console.log(
      `⚠ SAUTÉ : ${manquants.length} variable(s) manquante(s). Rien n'a été créé ni posé.`
    );
    return 0;
  }

  const secrets: Record<string, string> = {};
  for (const n of NOMS_DES_SECRETS) secrets[n] = env[n] ?? '';
  const lu = lireEnvironnement({ ...secrets, NODE_ENV: 'production', PARTNERS_ENV: 'production' });
  if (!lu.ok) {
    console.error(
      `❌ secrets refusés par la règle du démarrage (src/lib/env.ts) — rien n'est appelé :`
    );
    for (const r of lu.refus) console.error(`   ${formaterRefus(r)}`);
    return 1;
  }

  const sha = (env.GITHUB_SHA ?? '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Refus('GITHUB_SHA doit être un sha de 40 caractères');
  const publique = adresseSure(env.PARTNERS_URL_PUBLIQUE ?? '', 'PARTNERS_URL_PUBLIQUE');
  const api = plateforme(
    adresseSure(env.COOLIFY_URL ?? '', 'COOLIFY_URL'),
    env.COOLIFY_API_TOKEN ?? ''
  );

  const projet = liste(await api('GET', '/projects'), 'projets').find((p) => p.name === PROJET);
  if (!projet) throw new Refus(`le projet « ${PROJET} » n'existe pas sur la plateforme`);
  const serveurs = liste(await api('GET', '/servers'), 'serveurs');
  const voulu = env.COOLIFY_SERVER_UUID ?? '';
  const serveur = voulu
    ? serveurs.find((s) => s.uuid === voulu)
    : serveurs.length === 1
      ? serveurs[0]
      : undefined;
  if (!serveur) {
    throw new Refus(
      voulu
        ? `COOLIFY_SERVER_UUID ne désigne aucun serveur de la plateforme`
        : `${serveurs.length} serveur(s) sur la plateforme : pose la variable COOLIFY_SERVER_UUID pour choisir`
    );
  }
  const place = {
    project_uuid: projet.uuid,
    server_uuid: serveur.uuid,
    environment_name: ENVIRONNEMENT,
  };

  const bases = liste(await api('GET', '/databases'), 'bases');
  const assurerBase = async (
    nom: string,
    type: 'postgresql' | 'redis',
    extra: Record<string, unknown>
  ) => {
    const existante = bases.find((b) => b.name === nom);
    if (existante) {
      console.log(`   ${nom} existe déjà (${existante.uuid})`);
      return existante.uuid;
    }
    const uuid = uuidDe(
      await api('POST', `/databases/${type}`, {
        ...place,
        name: nom,
        is_public: false,
        instant_deploy: true,
        ...extra,
      }),
      nom
    );
    console.log(`   ${nom} créée (${uuid})`);
    return uuid;
  };
  const adresseInterne = async (uuid: string, nom: string): Promise<string> => {
    const lue = (await api('GET', `/databases/${encodeURIComponent(uuid)}`)) as {
      internal_db_url?: unknown;
    } | null;
    const url = lue?.internal_db_url;
    if (typeof url !== 'string' || url === '') {
      throw new Refus(
        `${nom} : la réponse de GET /databases/{uuid} ne porte pas internal_db_url — aucune adresse n'est devinée`
      );
    }
    return url;
  };

  const uuidBase = await assurerBase(NOM_BASE, 'postgresql', { image: IMAGE_BASE });
  const uuidCache = await assurerBase(NOM_CACHE, 'redis', {});
  const variables: { key: string; value: string }[] = [
    ...NOMS_DES_SECRETS.map((n) => ({ key: n, value: secrets[n] ?? '' })),
    { key: 'DATABASE_URL', value: await adresseInterne(uuidBase, NOM_BASE) },
    { key: 'REDIS_URL', value: await adresseInterne(uuidCache, NOM_CACHE) },
    { key: 'PARTNERS_ENV', value: 'production' },
    ...NOMS_FACULTATIFS.filter((n) => n !== 'PARTNERS_ENV' && (env[n] ?? '') !== '').map((n) => ({
      key: n,
      value: env[n] ?? '',
    })),
  ];

  const applications = liste(await api('GET', '/applications'), 'applications');
  let application = applications.find((a) => a.name === NOM_APPLICATION)?.uuid;
  if (application) {
    console.log(`   ${NOM_APPLICATION} existe déjà (${application})`);
  } else {
    application = uuidDe(
      await api('POST', '/applications/dockerimage', {
        ...place,
        name: NOM_APPLICATION,
        docker_registry_image_name: IMAGE,
        docker_registry_image_tag: `sha-${sha.slice(0, 7)}`,
        ports_exposes: PORT,
        health_check_enabled: true,
        health_check_path: SONDE,
        domains: publique.origin,
        instant_deploy: false,
      }),
      NOM_APPLICATION
    );
    console.log(`   ${NOM_APPLICATION} créée (${application})`);
  }

  await api('PATCH', `/applications/${encodeURIComponent(application)}/envs/bulk`, {
    data: variables,
  });
  console.log(
    `✅ ${variables.length} variable(s) posée(s) sur ${NOM_APPLICATION} : ${variables.map((v) => v.key).join(', ')}`
  );
  console.log(
    `   Aucune valeur imprimée. Le déploiement suit par le job \`deployer\` (pnpm deploy:coolify).`
  );
  return 0;
}

const APPELE_DIRECTEMENT = /provisionner\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  // `exitCode`, jamais `process.exit()` : sous Windows, couper des sockets de `fetch` encore
  // ouvertes fait planter Node et le code rendu n'est plus le nôtre (mesuré le 2026-09-29).
  provisionner(process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      console.error(
        `❌ ${e instanceof Refus ? e.message : 'erreur inattendue (détail tu : il peut porter une valeur)'}`
      );
      process.exitCode = 1;
    }
  );
}
