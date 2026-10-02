/**
 * provisionner.ts — Partners sur la plateforme : base Postgres séparée, cache, application, et
 * variables posées depuis les secrets du dépôt, JAMAIS en clair (QA-T50, REQ-INT-031).
 *
 * USAGE : pnpm coolify:provisionner     (forge, workflow `coolify-provisionner.yml`, à la main)
 *
 * ── CE QU'IL FAIT, DANS CET ORDRE ────────────────────────────────────────────────────────────
 *
 *   1. ÉCHOUE, en code 1, avec un `::error::` par nom, si un secret de la plateforme ou un secret
 *      applicatif manque : rien n'est appelé. Geste MANUEL, jamais un vert vide (arbitrage -d7 du 2026-09-30).
 *   2. JUGE les secrets applicatifs par la règle du démarrage (`lireEnvironnement`, `src/lib/env.ts`,
 *      en production) AVANT tout appel : une valeur qui ferait refuser le démarrage n'est jamais posée.
 *   3. TROUVE le projet `Axion-Partners` et le serveur ; CRÉE, s'ils n'existent pas sous leur nom, la
 *      base Postgres, le cache Redis et l'application (image `sha-<7>`, sans déploiement immédiat — le
 *      job `deployer` s'en charge). Relancé, il ne recrée rien et le DIT. La sonde de la PLATEFORME est
 *      coupée sur l'application (création ET réglage à chaque passage) : le HEALTHCHECK natif de
 *      l'image, en node, fait foi.
 *   4. LIT l'adresse interne de chaque base et en fait `DATABASE_URL` et `REDIS_URL` : jamais un
 *      secret du dépôt, jamais une adresse devinée. Si la réponse ne porte pas `internal_db_url`, il
 *      s'arrête en rouge en nommant le champ.
 *   5. POSE toutes les variables en une fois (`PATCH …/envs/bulk`), dont la double clé de rotation
 *      quand elle est présente (REQ-QA-030). Il POSE, il n'efface pas : une paire retirée des secrets
 *      se retire aussi de l'application, à la main (runbook `secret-desynchronise.md`).
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
 * ── LIMITE DÉCLARÉE : UN HOMONYME UNIQUE AILLEURS EST RÉUTILISÉ ──────────────────────────────
 *
 * Les listes de la plateforme couvrent TOUS ses projets, et leur réponse ne documente pas le projet
 * d'appartenance : le script ne peut pas filtrer par projet. Deux ressources ou plus du même nom
 * font refuser, avant toute création (`unique`). Mais UNE SEULE ressource homonyme dans un AUTRE
 * projet serait prise pour celle de Partners, et, pour une base, son adresse deviendrait la
 * `DATABASE_URL` de production (lentille `exactitude`, PR 272). À VÉRIFIER AU PREMIER EXERCICE
 * RÉEL : aucune ressource nommée `axion-partners-postgres`, `axion-partners-redis` ou
 * `axion-partners` n'existe hors du projet `Axion-Partners` — et, si la réponse porte l'uuid du
 * projet, filtrer dessus au lieu de le déclarer ici.
 *
 * ── CE QUI N'EST JAMAIS IMPRIMÉ ──────────────────────────────────────────────────────────────
 *
 * Aucune valeur : ni secret, ni jeton, ni adresse interne (elle porte le mot de passe de la base), ni
 * corps de réponse. Seuls les noms, les uuid et les statuts HTTP sortent. Dans la forge, chaque adresse
 * interne est de plus déclarée à masquer (`::add-mask::`) dès sa lecture.
 */
import {
  NOMS_DES_SECRETS,
  NOMS_DES_SECRETS_CONDITIONNELS,
  NOMS_FACULTATIFS,
  NOMS_EN_ROTATION,
  variablesDeRotation,
  lireEnvironnement,
  lireTrousseaux,
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
/**
 * QA-T57 — la sonde de la PLATEFORME, sur le même chemin que le HEALTHCHECK de l'image : `/api/readyz`,
 * jamais `/api/livez`. L'image porte curl depuis QA-T57 (`Dockerfile`, étape `execution`).
 */
const SONDE_DE_LA_PLATEFORME = {
  health_check_enabled: true,
  health_check_path: '/api/readyz',
  health_check_port: PORT,
} as const;

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

/**
 * UNE ressource de ce nom, ou aucune : jamais un choix entre plusieurs. La plateforme liste ses
 * ressources sur TOUS ses projets (lentille exactitude, PR 272) ; une homonyme d'un autre projet ou
 * d'une preview serait réutilisée, et son adresse deviendrait la base de production. Deux ou plus :
 * refus nommé, rien n'est créé ni posé.
 */
function unique<T extends { uuid: string; name: string }>(
  liste: readonly T[],
  nom: string
): T | undefined {
  const trouvees = liste.filter((x) => x.name === nom);
  if (trouvees.length > 1) {
    throw new Refus(
      `${trouvees.length} ressources s'appellent « ${nom} » sur la plateforme : aucune n'est choisie — à lever à la main`
    );
  }
  return trouvees[0];
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
    // Le provisionnement ne part qu'à la main (workflow_dispatch) : sans ses secrets, il ÉCHOUE en
    // les nommant. Un vert qui n'a rien créé ferait croire la production provisionnée (arbitrage -d7
    // du 2026-09-30).
    for (const n of manquants) {
      console.log(`::error title=coolify:provisionner::${n} absent — provisionnement IMPOSSIBLE`);
    }
    console.error(
      `❌ ${manquants.length} variable(s) manquante(s) : ${manquants.join(', ')}. Rien n'a été créé ni posé.`
    );
    return 1;
  }

  const secrets: Record<string, string> = {};
  for (const n of NOMS_DES_SECRETS) secrets[n] = env[n] ?? '';
  // Un secret conditionnel POSÉ est jugé avec les autres (longueur, préfixe, égalité).
  for (const n of NOMS_DES_SECRETS_CONDITIONNELS)
    if ((env[n] ?? '') !== '') secrets[n] = env[n] ?? '';
  const lu = lireEnvironnement({ ...secrets, NODE_ENV: 'production', PARTNERS_ENV: 'production' });
  if (!lu.ok) {
    console.error(
      `❌ secrets refusés par la règle du démarrage (src/lib/env.ts) — rien n'est appelé :`
    );
    for (const r of lu.refus) console.error(`   ${formaterRefus(r)}`);
    return 1;
  }

  // La double clé de rotation (REQ-QA-030, refus de la PR 297) : `<NOM>_PRECEDENT` et son échéance,
  // FACULTATIVES. Absentes, rien n'est posé ; présentes, elles sont jugées par la règle du démarrage
  // (la paire ensemble, l'échéance à 24 h au plus, la clé distincte de tout secret) AVANT tout appel.
  const rotation: Record<string, string> = {};
  for (const nom of NOMS_EN_ROTATION) {
    for (const v of Object.values(variablesDeRotation(nom))) {
      if ((env[v] ?? '') !== '') rotation[v] = env[v] ?? '';
    }
  }
  const tr = lireTrousseaux(
    { ...secrets, ...rotation, NODE_ENV: 'production', PARTNERS_ENV: 'production' },
    Date.now()
  );
  if (!tr.ok) {
    console.error(
      `❌ double clé refusée par la règle du démarrage (src/lib/env.ts) — rien n'est appelé :`
    );
    for (const r of tr.refus) console.error(`   ${formaterRefus(r)}`);
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
  const applications = liste(await api('GET', '/applications'), 'applications');
  // Toute ambiguïté se juge AVANT la première création : rien ne doit être créé à moitié.
  unique(bases, NOM_BASE);
  unique(bases, NOM_CACHE);
  unique(applications, NOM_APPLICATION);
  const assurerBase = async (
    nom: string,
    type: 'postgresql' | 'redis',
    extra: Record<string, unknown>
  ) => {
    const existante = unique(bases, nom);
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
    // Dérivée, elle porte le mot de passe de la base : la forge la masque AVANT tout autre geste
    // (exigence de la lentille `securite` sur la PR de registre). Les secrets du dépôt, eux, sont
    // déjà masqués par la forge.
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${url}`);
    return url;
  };

  const uuidBase = await assurerBase(NOM_BASE, 'postgresql', { image: IMAGE_BASE });
  const uuidCache = await assurerBase(NOM_CACHE, 'redis', {});
  const variables: { key: string; value: string }[] = [
    ...NOMS_DES_SECRETS.map((n) => ({ key: n, value: secrets[n] ?? '' })),
    ...Object.entries(rotation).map(([key, value]) => ({ key, value })),
    { key: 'DATABASE_URL', value: await adresseInterne(uuidBase, NOM_BASE) },
    { key: 'REDIS_URL', value: await adresseInterne(uuidCache, NOM_CACHE) },
    { key: 'PARTNERS_ENV', value: 'production' },
    // INT-T57 : les secrets conditionnels, posés seulement s'ils sont présents (jugés par
    // `lireEnvironnement` avec les autres) ; leur absence n'empêche pas le provisionnement.
    ...NOMS_DES_SECRETS_CONDITIONNELS.filter((n) => (env[n] ?? '') !== '').map((n) => ({
      key: n,
      value: env[n] ?? '',
    })),
    ...NOMS_FACULTATIFS.filter((n) => n !== 'PARTNERS_ENV' && (env[n] ?? '') !== '').map((n) => ({
      key: n,
      value: env[n] ?? '',
    })),
  ];

  let application = unique(applications, NOM_APPLICATION)?.uuid;
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
        ...SONDE_DE_LA_PLATEFORME,
        domains: publique.origin,
        instant_deploy: false,
      }),
      NOM_APPLICATION
    );
    console.log(`   ${NOM_APPLICATION} créée (${application})`);
  }

  // La sonde de la PLATEFORME, sur l'application Partners SEULE. Elle avait été coupée au premier
  // déploiement réel (2026-09-30) : elle s'exécute dans le conteneur par curl, que l'image n'avait
  // pas, et Coolify retirait tout nouveau conteneur. Depuis QA-T57, l'image porte curl : la sonde est
  // réactivée sur `/api/readyz`, le même chemin que le HEALTHCHECK de l'image. Reposée à chaque
  // passage : une application existante, coupée le 2026-09-30, est corrigée.
  await api('PATCH', `/applications/${encodeURIComponent(application)}`, SONDE_DE_LA_PLATEFORME);
  console.log(
    `   ${NOM_APPLICATION} : sonde de la plateforme sur ${SONDE_DE_LA_PLATEFORME.health_check_path}`
  );

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
  // `exitCode`, jamais la sortie immédiate du processus : sous Windows, couper des sockets de `fetch` encore
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
