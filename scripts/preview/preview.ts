/**
 * preview.ts — une preview par PR : publiée, attribuée sous plafond, détruite (QA-T06, REQ-QA-015).
 *
 * USAGE (forge, `.github/workflows/preview.yml`) :
 *   pnpm preview:verifier-artefact  refuse un artefact qui n'est pas EXACTEMENT l'image, en fichier ordinaire
 *   pnpm preview:publier-image   charge l'image de la PR (artefact du job image) et la pousse en PREVIEW
 *   pnpm preview:attribuer       crée ou met à jour la preview de la PR, sous le plafond, et commente
 *   pnpm preview:detruire        détruit l'application, la base, le cache et les étiquettes de la PR
 *
 * ── LES SIX CONDITIONS DE L'ARBITRAGE -d7 (DÉLÉGATION DE WILLIAMS, 2026-09-29, OPTION B) ──────
 *
 *   (1) `publier-image` ne tourne que pour une PR du même dépôt (garde du workflow) ;
 *   (2) elle ne lit que le jeton de la forge, et REFUSE toute cible qui n'est pas le paquet de
 *       preview : `latest` et `sha-*` de production sont hors d'atteinte, par construction du nom ;
 *   (3) la preview reçoit des secrets FACTICES tirés pour elle, jamais un secret de production, et
 *       une base neuve, semée par `prisma/seed.ts` au démarrage, jamais copiée ;
 *   (4) `attribuer` et `detruire` n'exécutent aucun code de la PR : ils lisent le numéro et le sha
 *       comme des DONNÉES, et seuls ils détiennent le jeton de plateforme dédié aux previews ;
 *   (5) plafond de deux, décidé par `decider` dans un job sérialisé ; destruction complète à la
 *       fermeture de la PR ;
 *   (6) la règle jumelle vit dans `tests/unit/qualite/pipeline-image.spec.ts`.
 *
 * ── TIERS, LUS LE 2026-09-29 (RM-08) ─────────────────────────────────────────────────────────
 *
 * Plateforme : les mêmes endpoints que le provisionnement (création d'application, de bases, pose des
 * variables, `POST /deploy`), plus `DELETE /api/v1/applications/{uuid}` et `DELETE
 * /api/v1/databases/{uuid}` (volumes, configurations et réseaux supprimés par défaut). La réponse
 * qui porte l'adresse interne d'une base n'est pas documentée : lue dans `internal_db_url`, en échec
 * fermé. Forge : registre `ghcr.io`, et `gh api` pour les versions de paquet et le commentaire.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PARAMETRES_PREVIEW = {
  PREVIEWS_SIMULTANEES_MAX: {
    valeur: 2,
    source: 'HYP-E1-5 (docs/DECISIONS.md) ; acceptation QA-T06, point 3',
    verifieLe: '2026-09-30',
  },
  /** L'horloge du semis des previews : FIXE, pour que toutes les previews portent les mêmes données. */
  INSTANT_DE_SEMIS: {
    valeur: '2026-01-01T00:00:00.000Z',
    source: 'acceptation QA-T06, point 8 (horloge injectée)',
    verifieLe: '2026-09-30',
  },
  DUREE_DE_VIE_HEURES: {
    valeur: 48,
    source: 'HYP-E1-5 (docs/DECISIONS.md) ; acceptation QA-T06',
    verifieLe: '2026-09-30',
  },
} as const;

export type Decision = 'creer' | 'mettre_a_jour' | 'attendre';

export function nomDePreview(pr: number): string {
  if (!Number.isInteger(pr) || pr < 1) throw new Error(`numéro de PR invalide : ${pr}`);
  return `axion-partners-pr-${pr}`;
}

/** La décision, sur la liste des previews vivantes : jamais une de plus que le plafond. */
export function decider(vivantes: readonly string[], pr: number): Decision {
  if (vivantes.includes(nomDePreview(pr))) return 'mettre_a_jour';
  return vivantes.length >= PARAMETRES_PREVIEW.PREVIEWS_SIMULTANEES_MAX.valeur
    ? 'attendre'
    : 'creer';
}

/** Le seul paquet où une image de PR peut aller : jamais celui de production. */
export function cibleDePreview(depot: string, pr: number, tete: string): string {
  if (!/^[0-9a-f]{40}$/.test(tete)) throw new Error('sha de tête invalide');
  const cible = `ghcr.io/${depot.toLowerCase()}-preview:pr-${pr}-${tete.slice(0, 7)}`;
  if (!/^ghcr\.io\/[^/]+\/[^:]+-preview:pr-\d+-[0-9a-f]{7}$/.test(cible)) {
    throw new Error('cible hors du paquet de preview : refusée');
  }
  return cible;
}

// ── les gestes ───────────────────────────────────────────────────────────────────────────────

function exiger(noms: readonly string[], commande: string): Record<string, string> | null {
  const manquants = noms.filter((n) => (process.env[n] ?? '') === '');
  if (manquants.length === 0) return Object.fromEntries(noms.map((n) => [n, process.env[n] ?? '']));
  for (const n of manquants)
    console.log(`::warning title=${commande}::${n} absent — SAUTÉ (arbitrage -d7 du 2026-09-29)`);
  console.log(`⚠ ${commande} SAUTÉ : ${manquants.join(', ')}.`);
  return null;
}

function executer(cmd: string, args: string[], entree?: string): void {
  const r = spawnSync(cmd, args, { input: entree, stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} sort en ${r.status}`);
}

// ── L'artefact : une DONNÉE venue de la PR ──────────────────────────────────────────────────

/** Le seul fichier qu'un artefact de preview peut porter : l'archive écrite par `pnpm image:exporter`. */
export const ARTEFACT_ATTENDU = 'image-preview.tar';

export type EntreeDArtefact = { nom: string; fichierOrdinaire: boolean };

/**
 * PURE. L'artefact vient du job `image` d'une PR, dont le workflow est modifiable par la PR : il
 * est extrait HORS de l'espace de travail (`runner.temp`) et doit contenir EXACTEMENT l'archive, en
 * fichier ordinaire. Un fichier de plus, un dossier, un lien, ou l'archive absente : refus nommé
 * (lentille `securite`, PR 281 — un artefact extrait par-dessus le checkout de main y aurait glissé
 * des scripts, exécutés ensuite avec `packages: write`).
 */
export function jugerArtefact(
  entrees: readonly EntreeDArtefact[]
): { ok: true } | { ok: false; motif: string } {
  const noms = entrees.map((x) => x.nom).sort();
  const seule = entrees.length === 1 ? entrees[0] : undefined;
  if (seule?.nom === ARTEFACT_ATTENDU && seule.fichierOrdinaire) return { ok: true };
  return {
    ok: false,
    motif: `artefact_inattendu : attendu exactement ${ARTEFACT_ATTENDU} en fichier ordinaire, reçu [${noms.join(', ')}]${
      seule?.nom === ARTEFACT_ATTENDU ? ' (pas un fichier ordinaire)' : ''
    }`,
  };
}

/** Le contenu du dossier d'artefact, sans suivre aucun lien (`isFile` est faux pour un lien). */
function lireArtefact(dossier: string): EntreeDArtefact[] {
  return readdirSync(dossier, { withFileTypes: true }).map((d) => ({
    nom: d.name,
    fichierOrdinaire: d.isFile(),
  }));
}

function verifierArtefact(): number {
  const e = exiger(['DOSSIER_ARTEFACT'], 'preview:verifier-artefact');
  if (!e) return 0;
  const verdict = jugerArtefact(lireArtefact(e.DOSSIER_ARTEFACT!));
  if (!verdict.ok) throw new Error(verdict.motif);
  console.log(`✅ artefact de preview : ${ARTEFACT_ATTENDU} seul, en fichier ordinaire`);
  return 0;
}

function publierImage(): number {
  const e = exiger(
    ['JETON', 'GITHUB_REPOSITORY', 'GITHUB_ACTOR', 'PR_NUMERO', 'TETE', 'DOSSIER_ARTEFACT'],
    'preview:publier-image'
  );
  if (!e) return 0;
  // Rejugé ici, juste avant le chargement : l'étape de vérification peut avoir été retirée du workflow.
  const verdict = jugerArtefact(lireArtefact(e.DOSSIER_ARTEFACT!));
  if (!verdict.ok) throw new Error(verdict.motif);
  const cible = cibleDePreview(e.GITHUB_REPOSITORY!, Number(e.PR_NUMERO), e.TETE!);
  // L'image vient de l'ARTEFACT du job `image` (lecture seule) : on la CHARGE, on ne construit rien,
  // et aucun code de la PR ne tourne ici (lentille `securite`, PR 281 — le schéma « pwn request »).
  // `docker load` n'exécute aucun code ; l'étiquette chargée doit être exactement celle du job `image`.
  const charge = spawnSync('docker', ['load', '-i', join(e.DOSSIER_ARTEFACT!, ARTEFACT_ATTENDU)], {
    encoding: 'utf8',
  });
  if (charge.status !== 0 || !/Loaded image: partners:construite\s*$/m.test(charge.stdout ?? '')) {
    throw new Error("l'artefact ne charge pas l'image partners:construite : refusé");
  }
  executer('docker', ['tag', 'partners:construite', cible]);
  executer('docker', ['login', 'ghcr.io', '-u', e.GITHUB_ACTOR!, '--password-stdin'], e.JETON);
  executer('docker', ['push', cible]);
  console.log(`✅ image de preview publiée : ${cible}`);
  return 0;
}

type Element = { uuid?: unknown; name?: unknown };

function plateforme(url: string, jeton: string) {
  const u = new URL(url);
  const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && locale))
    throw new Error('COOLIFY_PREVIEW_URL doit être en https');
  const racine = `${u.href.replace(/\/+$/, '')}/api/v1`;
  return async (
    methode: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    chemin: string,
    corps?: unknown
  ): Promise<unknown> => {
    const r = await fetch(`${racine}${chemin}`, {
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
    if (r.status < 200 || r.status > 299)
      throw new Error(`la plateforme refuse ${methode} ${chemin.split('?')[0]} : HTTP ${r.status}`);
    try {
      return texte === '' ? null : (JSON.parse(texte) as unknown);
    } catch {
      return null;
    }
  };
}

const liste = (v: unknown) =>
  (Array.isArray(v) ? (v as Element[]) : [])
    .filter((x) => typeof x.uuid === 'string' && typeof x.name === 'string')
    .map((x) => ({ uuid: x.uuid as string, name: x.name as string }));

/** Des secrets FACTICES, tirés pour cette preview seule : valides pour `src/lib/env.ts`, jamais imprimés. */
async function secretsFactices(): Promise<{ key: string; value: string }[]> {
  const { NOMS_DES_SECRETS } = await import('../../src/lib/env');
  return NOMS_DES_SECRETS.map((n) => ({
    key: n,
    value:
      n === 'PII_ENCRYPTION_KEY'
        ? randomBytes(32).toString('hex')
        : `preview_${randomBytes(24).toString('hex')}`,
  }));
}

async function attribuer(): Promise<number> {
  const e = exiger(
    [
      'COOLIFY_PREVIEW_URL',
      'COOLIFY_PREVIEW_TOKEN',
      'PREVIEW_DOMAINE',
      'PR_NUMERO',
      'TETE',
      'GITHUB_REPOSITORY',
      'GH_TOKEN',
    ],
    'preview:attribuer'
  );
  if (!e) return 0;
  const pr = Number(e.PR_NUMERO);
  const nom = nomDePreview(pr);
  const image = cibleDePreview(e.GITHUB_REPOSITORY!, pr, e.TETE!);
  const [nomImage, etiquette] = image.split(':') as [string, string];
  const api = plateforme(e.COOLIFY_PREVIEW_URL!, e.COOLIFY_PREVIEW_TOKEN!);

  const applications = liste(await api('GET', '/applications'));
  const vivantes = applications
    .map((a) => a.name)
    .filter((n) => n.startsWith('axion-partners-pr-'));
  const d = decider(vivantes, pr);
  if (d === 'attendre') {
    console.log(
      `::notice title=preview::plafond atteint (${vivantes.length}) — la PR ${pr} attend qu’une preview soit détruite`
    );
    return 0;
  }
  let app = applications.find((a) => a.name === nom)?.uuid;
  if (d === 'creer') {
    const projet = liste(await api('GET', '/projects')).find((p) => p.name === 'Axion-Partners');
    const serveurs = liste(await api('GET', '/servers'));
    const serveur =
      process.env.COOLIFY_SERVER_UUID || (serveurs.length === 1 ? serveurs[0]!.uuid : '');
    if (!projet || !serveur) throw new Error('projet Axion-Partners ou serveur introuvable');
    const place = { project_uuid: projet.uuid, server_uuid: serveur, environment_name: 'preview' };
    const creer = async (type: 'postgresql' | 'redis', suffixe: string, extra: object) => {
      const r = (await api('POST', `/databases/${type}`, {
        ...place,
        name: `${nom}-${suffixe}`,
        is_public: false,
        instant_deploy: true,
        ...extra,
      })) as Element | null;
      if (typeof r?.uuid !== 'string') throw new Error(`${nom}-${suffixe} : réponse sans uuid`);
      const lue = (await api('GET', `/databases/${r.uuid}`)) as {
        internal_db_url?: unknown;
      } | null;
      if (typeof lue?.internal_db_url !== 'string')
        throw new Error(`${nom}-${suffixe} : internal_db_url absent — aucune adresse devinée`);
      console.log(`::add-mask::${lue.internal_db_url}`);
      return lue.internal_db_url;
    };
    const base = await creer('postgresql', 'postgres', { image: 'postgres:16-alpine' });
    const cache = await creer('redis', 'redis', {});
    const r = (await api('POST', '/applications/dockerimage', {
      ...place,
      name: nom,
      docker_registry_image_name: nomImage,
      docker_registry_image_tag: etiquette,
      ports_exposes: '3000',
      health_check_enabled: true,
      health_check_path: '/api/readyz',
      domains: `https://pr-${pr}.${e.PREVIEW_DOMAINE}`,
      instant_deploy: false,
    })) as Element | null;
    if (typeof r?.uuid !== 'string') throw new Error(`${nom} : réponse sans uuid`);
    app = r.uuid;
    await api('PATCH', `/applications/${app}/envs/bulk`, {
      data: [
        ...(await secretsFactices()),
        { key: 'DATABASE_URL', value: base },
        { key: 'REDIS_URL', value: cache },
        { key: 'NOTIFY_SINK', value: 'true' },
        { key: 'PARTNERS_ENV', value: 'preview' },
        { key: 'SEMEUR_INSTANT', value: PARAMETRES_PREVIEW.INSTANT_DE_SEMIS.valeur },
      ],
    });
  } else {
    await api('PATCH', `/applications/${app}`, { docker_registry_image_tag: etiquette });
  }
  await api('POST', `/deploy?uuid=${encodeURIComponent(app!)}&force=false`);
  const adresse = `https://pr-${pr}.${e.PREVIEW_DOMAINE}`;
  executer('gh', [
    'pr',
    'comment',
    String(pr),
    '--repo',
    e.GITHUB_REPOSITORY!,
    '--edit-last',
    '--create-if-none',
    '--body',
    `Preview : ${adresse} (image ${etiquette}). Détruite à la fermeture de la PR.`,
  ]);
  console.log(`✅ preview ${d === 'creer' ? 'créée' : 'mise à jour'} : ${adresse}`);
  return 0;
}

/**
 * PURE. Les versions du paquet de preview qui portent une étiquette de la PR. Une lecture qui ÉCHOUE
 * n'est pas « aucune étiquette » : ce serait annoncer détruite une preview dont les images survivent
 * (acceptation, point 2 : une preview qui survit à sa PR est un défaut nommé). Le refus nomme le
 * paquet et la PR ; le job sort en non nul.
 */
export function etiquettesDeLaPr(
  r: { status: number | null; stdout?: string | null },
  pr: number,
  paquet: string
): { ok: true; ids: string[] } | { ok: false; motif: string } {
  if (r.status !== 0) {
    return {
      ok: false,
      motif: `etiquettes_illisibles : versions du paquet ${paquet} non lues (sortie ${r.status}) — les étiquettes pr-${pr}-* de la PR ${pr} ne sont PAS détruites`,
    };
  }
  return { ok: true, ids: (r.stdout ?? '').split('\n').filter(Boolean) };
}

async function detruire(): Promise<number> {
  const e = exiger(
    ['COOLIFY_PREVIEW_URL', 'COOLIFY_PREVIEW_TOKEN', 'PR_NUMERO', 'GITHUB_REPOSITORY', 'GH_TOKEN'],
    'preview:detruire'
  );
  if (!e) return 0;
  const pr = Number(e.PR_NUMERO);
  const nom = nomDePreview(pr);
  const api = plateforme(e.COOLIFY_PREVIEW_URL!, e.COOLIFY_PREVIEW_TOKEN!);
  const app = liste(await api('GET', '/applications')).find((a) => a.name === nom);
  if (app) await api('DELETE', `/applications/${app.uuid}`);
  const bases = liste(await api('GET', '/databases')).filter(
    (b) => b.name === `${nom}-postgres` || b.name === `${nom}-redis`
  );
  for (const b of bases) await api('DELETE', `/databases/${b.uuid}`);
  const [proprietaire, depot] = e.GITHUB_REPOSITORY!.split('/') as [string, string];
  const paquet = `${depot}-preview`;
  const versions = spawnSync(
    'gh',
    [
      'api',
      `/users/${proprietaire}/packages/container/${paquet}/versions`,
      '--paginate',
      '-q',
      `.[] | select(any(.metadata.container.tags[]; startswith("pr-${pr}-"))) | .id`,
    ],
    { encoding: 'utf8' }
  );
  const lu = etiquettesDeLaPr(versions, pr, paquet);
  if (!lu.ok) throw new Error(lu.motif);
  const ids = lu.ids;
  for (const id of ids)
    executer('gh', [
      'api',
      '-X',
      'DELETE',
      `/users/${proprietaire}/packages/container/${paquet}/versions/${id}`,
    ]);
  console.log(
    `✅ preview de la PR ${pr} détruite : application ${app ? 1 : 0}, bases ${bases.length}, étiquettes ${ids.length}`
  );
  return 0;
}

const APPELE_DIRECTEMENT = /preview\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const geste = process.argv[2];
  const f =
    geste === 'verifier-artefact'
      ? async () => verifierArtefact()
      : geste === 'publier-image'
        ? async () => publierImage()
        : geste === 'attribuer'
          ? attribuer
          : geste === 'detruire'
            ? detruire
            : null;
  if (!f) {
    console.error('usage : preview.ts verifier-artefact | publier-image | attribuer | detruire');
    process.exitCode = 1;
  } else {
    // `exitCode`, jamais la sortie immédiate du processus : voir `scripts/gates/deploy-verify.ts`.
    f().then(
      (code) => {
        process.exitCode = code;
      },
      (err: Error) => {
        console.error(`❌ ${err.message}`);
        process.exitCode = 1;
      }
    );
  }
}
