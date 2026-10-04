/**
 * deploy-verify.ts — la plateforme TIRE l'image publiée, et l'atterrissage se lit sur l'en-tête
 * servi (QA-T34, REQ-QA-033 ; `docs/PROTOCOLE-FUSION.md` pas 7 ; RM-09).
 *
 * USAGE : pnpm deploy:verify [<sha>]   l'en-tête `x-partners-build-sha` servi par
 *                                      `PARTNERS_URL_PUBLIQUE` vaut-il <sha> (défaut : GITHUB_SHA) ?
 *                                      0 oui · 1 non, les deux sha nommés · 2 indéterminé
 *         pnpm deploy:coolify          (forge, job `deployer`) : étiquette `sha-<7>` posée sur
 *                                      l'application, déploiement déclenché, puis la même
 *                                      vérification
 *         … --essais <n> --delai-ms <n>  la patience de la vérification (les tests la raccourcissent)
 *         pnpm deploy:alerter
 *                                      (forge, job `alerter`, QA-T54) : l'alerte close
 *                                      `deploiement_non_atterri`, après un `deployer` rouge ou annulé
 *
 * ── LA PLATEFORME TIRE, ELLE NE CONSTRUIT RIEN ───────────────────────────────────────────────
 *
 * L'image est construite, jugée par la porte C et publiée par le job `publier`. Ici, on
 * dit seulement à la plateforme QUELLE étiquette tirer — `sha-<7>`, immuable, jamais `latest`, qui
 * bouge sous les pieds d'un déploiement en cours — puis on déclenche. API lue le 2026-09-29 sur la
 * documentation officielle de Coolify (RM-08) :
 *   • `PATCH /api/v1/applications/{uuid}`, champ `docker_registry_image_tag` ;
 *   • `POST /api/v1/deploy?uuid=…&force=false` — réponse 200 `{"deployments":[…]}`, 401
 *     `{"message":"Unauthenticated."}` ;
 *   • jeton en `Authorization: Bearer`.
 * ⚠️ La fiche `docs/tiers/coolify.md` §2 n'est pas encore remplie de ces extraits : elle appartient au
 * documentaliste (A03), et c'est nommé dans l'entrée de journal de la PR.
 *
 * ── SECRETS ABSENTS : SAUTÉ, ET NOMMÉ ────────────────────────────────────────────────────────
 *
 * Arbitrage -d7 sur délégation de Williams du 2026-09-29 : tant que l'adresse de la plateforme, son
 * jeton, l'uuid de l'application ou l'adresse publique manquent, le déploiement est SAUTÉ en code
 * 0, avec une annotation `::warning::` PAR secret manquant — un `main` rouge en permanence sur une
 * attente connue finit désarmé (RM-02). Dès que les quatre existent, tout échec est ROUGE : refus de
 * la plateforme, ou image jamais servie dans le délai.
 * Ce saut ne vaut QUE pour le déploiement d'un push sur `main`. Le retour arrière est un geste
 * MANUEL d'incident (arbitrage -d7 du 2026-09-30) : sans ses secrets, il ÉCHOUE en les nommant.
 *
 * ── CE QUI N'EST JAMAIS IMPRIMÉ ──────────────────────────────────────────────────────────────
 *
 * Le jeton, et le corps des réponses de la plateforme (qui pourrait l'écho). Seuls le statut HTTP et
 * les noms des variables sortent.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { ENTETE_DE_BUILD } from '../../next.config';
import { politiqueDeContenu } from '../../src/server/securite/entetes';
import {
  creerAlerteur,
  shaLisible,
  type ObjetAlerte,
} from '../../src/server/integrations/telegram/alertes';
import type { Notifieur } from '../../src/lib/notify';
import {
  TransfertNonConsigne,
  exigerLeTransfertConsigne,
} from '../../src/server/integrations/telegram/transfert';

const SHA_COMPLET = /^[0-9a-f]{40}$/;
/**
 * Dix minutes, par pas de dix secondes : la plateforme tire l'image, migre en bloquant puis attend
 * que `readyz` réponde (HEALTHCHECK, `start-period` de 90 s dans le Dockerfile). Un délai n'est pas
 * un seuil métier (RM-10) : c'est la patience d'un instrument, et `--essais` la règle.
 */
const ESSAIS_PAR_DEFAUT = 60;
const DELAI_PAR_DEFAUT_MS = 10_000;

const SECRETS_DU_DEPLOIEMENT = [
  'COOLIFY_URL',
  'COOLIFY_API_TOKEN',
  'COOLIFY_APP_UUID',
  'PARTNERS_URL_PUBLIQUE',
] as const;

type Options = { essais: number; delaiMs: number };

function options(argv: string[]): Options {
  const lire = (nom: string, defaut: number): number => {
    const i = argv.indexOf(nom);
    if (i < 0) return defaut;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${nom} attend un entier positif`);
    return n;
  };
  return {
    essais: Math.max(1, lire('--essais', ESSAIS_PAR_DEFAUT)),
    delaiMs: lire('--delai-ms', DELAI_PAR_DEFAUT_MS),
  };
}

/** https partout ; http n'est admis que sur la boucle locale (tests, serveur du poste). */
export function adresseSure(brut: string, nom: string): URL {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    throw new Error(`${nom} n'est pas une adresse`);
  }
  const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol === 'https:' || (u.protocol === 'http:' && locale)) return u;
  throw new Error(`${nom} doit être en https (http n'est admis que sur la boucle locale)`);
}

async function enteteServi(base: URL): Promise<{ valeur: string | null; erreur: string | null }> {
  try {
    const r = await fetch(new URL('/', base), {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
    });
    return { valeur: r.headers.get(ENTETE_DE_BUILD), erreur: null };
  } catch (e) {
    return { valeur: null, erreur: (e as Error).message };
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function verifier(sha: string, base: URL, o: Options): Promise<0 | 1> {
  return (await verifierEnDetail(sha, base, o)).code;
}

/** La même vérification, qui rend aussi l'en-tête servi au dernier essai (`null` : absent). */
async function verifierEnDetail(
  sha: string,
  base: URL,
  o: Options
): Promise<{ code: 0 | 1; servi: string | null }> {
  let dernier: { valeur: string | null; erreur: string | null } = { valeur: null, erreur: null };
  for (let i = 1; i <= o.essais; i++) {
    dernier = await enteteServi(base);
    if (dernier.valeur?.toLowerCase() === sha) {
      console.log(
        `✅ atterri : ${base.origin} sert ${ENTETE_DE_BUILD} = ${sha} (essai ${i}/${o.essais})`
      );
      return { code: 0, servi: dernier.valeur };
    }
    if (i < o.essais) await attendre(o.delaiMs);
  }
  const servi =
    dernier.valeur !== null
      ? dernier.valeur
      : dernier.erreur !== null
        ? `aucune réponse (${dernier.erreur})`
        : `en-tête ${ENTETE_DE_BUILD} absent`;
  console.error(`❌ NON ATTERRI après ${o.essais} essai(s) sur ${base.origin} :`);
  console.error(`   attendu : ${sha}`);
  console.error(`   servi   : ${servi}`);
  return { code: 1, servi: dernier.valeur };
}

/**
 * QA-T54 (REQ-GOV-014) — l'atterrissage, puis `readyz`. Le job `deployer` ne fait QUE vérifier : il
 * n'a aucun canal d'alerte (option B, choisie par la lentille `securite` et validée par la
 * coordination). Il rend le sha servi au dernier essai (`null` : en-tête absent), que
 * `sortieDuDeployeur` met en forme pour le job `alerter`.
 */
export async function atterrir(
  sha: string,
  base: URL,
  o: Options
): Promise<{ code: 0 | 1; servi: string | null }> {
  const v = await verifierEnDetail(sha, base, o);
  if (v.code !== 0) return v;
  const sante = await readyz(base);
  if (sante === 200) return v;
  console.error(
    `❌ readyz répond ${sante || 'rien'} : le sha est servi, l'application n'est pas prête`
  );
  return { code: 1, servi: v.servi };
}

/**
 * Ce que `deployer` passe à `alerter` par la sortie `sha_servi` du job : le sha servi en minuscules
 * s'il a la forme d'un sha, `illisible` s'il est là sans l'avoir, et RIEN s'il est absent. L'en-tête
 * vient d'une réponse que contrôle quiconque sert le domaine : rien d'autre ne traverse la sortie
 * (un saut de ligne y écrirait une seconde sortie).
 */
export function sortieDuDeployeur(servi: string | null): string {
  if (servi === null || servi === '') return '';
  const lu = shaLisible(servi);
  return lu === 'inconnu' ? '' : lu;
}

/** Écrit `sha_servi` dans `GITHUB_OUTPUT` quand la forge le fournit ; ailleurs, rien. */
function ecrireLaSortie(servi: string | null): void {
  const fichier = process.env.GITHUB_OUTPUT ?? '';
  if (fichier !== '') appendFileSync(fichier, `sha_servi=${sortieDuDeployeur(servi)}\n`);
}

/**
 * L'alerte close `deploiement_non_atterri` : le sha attendu, le sha servi et l'environnement, tels
 * que reçus. C'est le message (`shaLisible`, `ENVIRONNEMENTS_DE_DEPLOIEMENT`) qui les confronte à
 * leur liste blanche : absent, « inconnu » ; mal formé, « illisible ».
 */
export function alerteDeDeploiement(
  attendu: string,
  servi: string,
  environnement: string
): ObjetAlerte {
  return {
    categorie: 'deploiement_non_atterri',
    id: randomUUID(),
    deploiement: { attendu, servi, environnement },
  };
}

/** Le notifieur Telegram de la forge : le texte de l'alerte, rien d'autre ; le jeton ne sort jamais. */
function notifieurTelegram(jeton: string, salon: string): Notifieur {
  return {
    async notifier({ corps }) {
      const r = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: salon, text: corps }),
      });
      await r.body?.cancel();
      if (!r.ok) throw new Error(`Telegram refuse l'alerte : HTTP ${r.status}`);
    },
  };
}

/** Les deux seuls secrets du job `alerter` ; `deployer` n'en lit aucun. */
export const SECRETS_DU_CANAL = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const;

/**
 * Le job `alerter` (`needs: deployer`, `if: failure() || cancelled()`) : il émet TOUJOURS une
 * alerte, même si `deployer` est mort avant d'écrire sa sortie (« inconnu »). Sans canal, ou si
 * Telegram refuse, l'alerte qui ne part pas est NOMMÉE en `::error::` et le job rougit : une alarme
 * éteinte ne passe pas pour un silence.
 */
export async function alerterDepuisLaForge(
  env: Readonly<Record<string, string | undefined>>,
  alerter: (objet: ObjetAlerte) => Promise<unknown>
): Promise<0 | 1> {
  const objet = alerteDeDeploiement(
    env.SHA_ATTENDU ?? '',
    env.SHA_SERVI ?? '',
    env.DEPLOIEMENT_ENVIRONNEMENT ?? ''
  );
  try {
    await alerter(objet);
    return 0;
  } catch (e) {
    // Le NOM de l'erreur, jamais son message : une erreur de `fetch` peut recopier l'adresse appelée,
    // qui porte le jeton du bot, dans un journal de la forge lisible par tous (lentille `securite`).
    const nom = e instanceof Error ? e.name : 'Erreur';
    console.error(
      `::error title=deploy:alerter::alerte ${objet.categorie} NON envoyée (${nom}) : le canal a refusé ou n'a pas répondu`
    );
    return 1;
  }
}

async function commandeAlerter(): Promise<number> {
  const manquants = SECRETS_DU_CANAL.filter((n) => (process.env[n] ?? '') === '');
  if (manquants.length > 0) {
    console.error(
      `::error title=deploy:alerter::alerte deploiement_non_atterri NON envoyée : ${manquants.join(', ')} absent(s)`
    );
    return 1;
  }
  // SEC-64 : le canal réel ne se construit qu'avec la décision du transfert consignée ; un refus est
  // NOMMÉ et rougit le job, il n'envoie rien.
  try {
    exigerLeTransfertConsigne(process.env);
  } catch (e) {
    if (!(e instanceof TransfertNonConsigne)) throw e;
    console.error(
      `::error title=deploy:alerter::alerte deploiement_non_atterri NON envoyée : ${e.message}`
    );
    return 1;
  }
  const alerteur = creerAlerteur({
    notifieur: notifieurTelegram(
      process.env.TELEGRAM_BOT_TOKEN ?? '',
      process.env.TELEGRAM_CHAT_ID ?? ''
    ),
    horloge: { maintenant: () => Date.now() },
    plafondParHeure: 1,
  });
  return alerterDepuisLaForge(process.env, (o) => alerteur.alerter(o));
}

function shaDemande(argv: string[]): string {
  const donne = argv.find(
    (a, i) => !a.startsWith('--') && !['--essais', '--delai-ms'].includes(argv[i - 1] ?? '')
  );
  const sha = (donne ?? process.env.GITHUB_SHA ?? '').toLowerCase();
  if (!SHA_COMPLET.test(sha)) {
    throw new Error(
      `sha attendu : 40 caractères hexadécimaux (argument ou GITHUB_SHA), reçu « ${sha || 'rien'} »`
    );
  }
  return sha;
}

// ── SEC-46 : la politique de contenu SERVIE est celle de la configuration ─────────────────────

/** Le nonce neutre qui remplace, des deux côtés, celui que chaque réponse tire. */
const NONCE_NEUTRE = 'nonce-de-comparaison';

/** La route où la politique se lit : une page publique, que le proxy couvre comme toute page. */
const ROUTE_DE_LA_POLITIQUE = '/confidentialite';

/**
 * La politique de PRODUCTION telle que la configuration la produit (`politiqueDeContenu`), nonce
 * neutralisé. Ce n'est pas un second exemplaire des directives : la configuration est jugée par
 * `tests/unit/securite/headers.spec.ts` ; ici ne se juge que l'écart entre elle et ce que le domaine
 * SERT — un mandataire qui la retire ou la réécrit, un proxy qui ne tourne pas.
 */
export function politiqueAttendue(): string {
  return politiqueDeContenu({ nonce: NONCE_NEUTRE, developpement: false });
}

export type JugementDeLaPolitique =
  { ok: true } | { ok: false; motif: 'csp_absente' | 'csp_differente' };

/** La politique servie, nonce neutralisé, égale-t-elle celle de la configuration ? */
export function jugerLaPolitique(servie: string | null): JugementDeLaPolitique {
  if (servie === null || servie.trim() === '') return { ok: false, motif: 'csp_absente' };
  const neutre = servie.replace(/'nonce-[A-Za-z0-9+/=_-]+'/g, `'nonce-${NONCE_NEUTRE}'`);
  return neutre === politiqueAttendue() ? { ok: true } : { ok: false, motif: 'csp_differente' };
}

/**
 * Après l'atterrissage du sha COURANT (jamais d'un retour arrière, dont l'image porte sa propre
 * politique) : l'en-tête `Content-Security-Policy` servi doit être celui de la configuration.
 * Sinon, NON ATTERRI — correcte en configuration, altérée au service, c'est une politique absente.
 */
export async function verifierLaPolitique(base: URL): Promise<0 | 1> {
  let servie: string | null;
  try {
    const r = await fetch(new URL(ROUTE_DE_LA_POLITIQUE, base), {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
    });
    servie = r.headers.get('content-security-policy');
  } catch (e) {
    console.error(
      `❌ NON ATTERRI : ${base.origin}${ROUTE_DE_LA_POLITIQUE} ne répond pas (${(e as Error).message})`
    );
    return 1;
  }
  const j = jugerLaPolitique(servie);
  if (j.ok) {
    console.log(
      `✅ politique de contenu servie = configuration (${base.origin}${ROUTE_DE_LA_POLITIQUE})`
    );
    return 0;
  }
  console.error(
    `❌ NON ATTERRI : la politique de contenu servie n'est pas celle de la configuration (${j.motif})`
  );
  console.error(`   attendue : ${politiqueAttendue()}`);
  console.error(`   servie   : ${servie ?? 'en-tête absent'}`);
  return 1;
}

async function commandeVerifier(argv: string[]): Promise<number> {
  const sha = shaDemande(argv);
  const brut = process.env.PARTNERS_URL_PUBLIQUE ?? '';
  if (brut === '') {
    console.error(
      `⚠ INDÉTERMINÉ : PARTNERS_URL_PUBLIQUE absente — aucune adresse où lire ${ENTETE_DE_BUILD}. ` +
        `Ce n'est pas un atterrissage vérifié.`
    );
    return 2;
  }
  const base = adresseSure(brut, 'PARTNERS_URL_PUBLIQUE');
  const code = await verifier(sha, base, options(argv));
  return code === 0 ? verifierLaPolitique(base) : code;
}

// ── QA-T65 (REQ-GOV-014) : l'image tirée par EMPREINTE ───────────────────────────────────────────

/**
 * L'étiquette `sha-<7>` est immuable par CONVENTION : le registre accepte qu'on la repousse.
 * L'empreinte désigne un CONTENU. Coolify la lit dans `docker_registry_image_tag` sous la forme
 * `sha256-<hex>` et tire alors `<image>@sha256:<hex>` (vérifié dans son code, `docs/tiers/coolify.md`) ;
 * `sha256:<hex>` serait refusé par son motif d'étiquette.
 */
const EMPREINTE = /^sha256:[0-9a-f]{64}$/;

/** L'étiquette à poser pour une empreinte ; toute autre valeur (étiquette mobile) est refusée, nommée. */
export function etiquetteParEmpreinte(empreinte: string): string {
  if (!EMPREINTE.test(empreinte)) {
    throw new Error(
      `empreinte_attendue : « ${empreinte} » n'est pas une empreinte sha256 — une étiquette se déplace, une empreinte non`
    );
  }
  return `sha256-${empreinte.slice('sha256:'.length)}`;
}

export type JugementDeLEmpreinte = { atterri: true } | { atterri: false; raison: string };

/** L'image que l'application tire, confrontée à l'empreinte publiée : différente, NON ATTERRI. */
export function jugerLEmpreinteServie(
  publiee: string,
  servie: string | null
): JugementDeLEmpreinte {
  return servie === etiquetteParEmpreinte(publiee)
    ? { atterri: true }
    : {
        atterri: false,
        raison: `l'application tire ${servie ?? 'une image non lue'}, et non l'empreinte publiée ${publiee}`,
      };
}

/**
 * L'empreinte de l'image `sha-<7>` publiée, lue au registre (anonymement : l'image est publique),
 * sur l'en-tête `Docker-Content-Digest` du manifeste. Échec FERMÉ et nommé.
 */
async function empreintePubliee(sha: string): Promise<string> {
  const depot = (process.env.GITHUB_REPOSITORY ?? '').toLowerCase();
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot)) {
    throw new Error("GITHUB_REPOSITORY est exigé pour lire l'empreinte de l'image publiée");
  }
  const registre = adresseSure(
    process.env.PARTNERS_REGISTRE_URL ?? 'https://ghcr.io',
    'PARTNERS_REGISTRE_URL'
  );
  const etiquette = `sha-${sha.slice(0, 7)}`;
  const t = await fetch(new URL(`/token?scope=repository:${depot}:pull`, registre));
  const anonyme = t.ok
    ? ((await t.json()) as { token?: unknown }).token
    : (await t.body?.cancel(), null);
  const manifeste = await fetch(new URL(`/v2/${depot}/manifests/${etiquette}`, registre), {
    method: 'HEAD',
    headers: {
      ...(typeof anonyme === 'string' ? { authorization: `Bearer ${anonyme}` } : {}),
      accept:
        'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    },
  });
  await manifeste.body?.cancel();
  if (!manifeste.ok) {
    throw new Error(
      `l'image ${etiquette} n'a jamais été publiée (registre : HTTP ${manifeste.status}) — refusé`
    );
  }
  const empreinte = manifeste.headers.get('docker-content-digest') ?? '';
  etiquetteParEmpreinte(empreinte);
  return empreinte;
}

/** L'étiquette que l'application tire, relue sur la plateforme après le déploiement. */
async function etiquetteServie(
  racine: string,
  uuid: string,
  jeton: string
): Promise<string | null> {
  const r = await fetch(new URL(`${racine}/api/v1/applications/${uuid}`), {
    headers: { authorization: `Bearer ${jeton}`, accept: 'application/json' },
    redirect: 'manual',
  });
  if (!r.ok) {
    await r.body?.cancel();
    return null;
  }
  const lue = ((await r.json()) as { docker_registry_image_tag?: unknown })
    .docker_registry_image_tag;
  return typeof lue === 'string' ? lue : null;
}

/** Après l'en-tête : l'application tire-t-elle l'empreinte publiée ? Sinon NON ATTERRI, nommé. */
async function exigerLEmpreinteServie(
  publiee: string,
  racine: string,
  uuid: string,
  jeton: string
): Promise<0 | 1> {
  const j = jugerLEmpreinteServie(publiee, await etiquetteServie(racine, uuid, jeton));
  if (j.atterri) {
    console.log(`   empreinte servie : ${publiee}`);
    return 0;
  }
  console.error(`❌ NON ATTERRI — ${j.raison}`);
  return 1;
}

async function appel(
  url: URL,
  methode: 'PATCH' | 'POST',
  jeton: string,
  corps?: unknown
): Promise<number> {
  const r = await fetch(url, {
    method: methode,
    headers: {
      authorization: `Bearer ${jeton}`,
      accept: 'application/json',
      ...(corps === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    redirect: 'manual',
  });
  await r.body?.cancel();
  return r.status;
}

async function commandeDeclencher(argv: string[]): Promise<number> {
  const sha = shaDemande(argv);
  const manquants = SECRETS_DU_DEPLOIEMENT.filter((n) => (process.env[n] ?? '') === '');
  if (manquants.length > 0) {
    for (const n of manquants) {
      console.log(
        `::warning title=deploy:coolify::${n} absent — déploiement SAUTÉ (arbitrage -d7 du 2026-09-29)`
      );
    }
    console.log(
      `⚠ SAUTÉ : ${manquants.length} variable(s) manquante(s) : ${manquants.join(', ')}. ` +
        `Rien n'a été déployé, et rien n'est affirmé sur ce qui est servi.`
    );
    return 0;
  }
  const lire = (n: (typeof SECRETS_DU_DEPLOIEMENT)[number]): string => process.env[n] ?? '';
  const env = {
    COOLIFY_URL: lire('COOLIFY_URL'),
    COOLIFY_API_TOKEN: lire('COOLIFY_API_TOKEN'),
    COOLIFY_APP_UUID: lire('COOLIFY_APP_UUID'),
    PARTNERS_URL_PUBLIQUE: lire('PARTNERS_URL_PUBLIQUE'),
  };
  const plateforme = adresseSure(env.COOLIFY_URL, 'COOLIFY_URL');
  const publique = adresseSure(env.PARTNERS_URL_PUBLIQUE, 'PARTNERS_URL_PUBLIQUE');
  const racine = plateforme.href.replace(/\/+$/, '');
  const uuid = encodeURIComponent(env.COOLIFY_APP_UUID);
  const empreinte = await empreintePubliee(sha);
  const etiquette = etiquetteParEmpreinte(empreinte);

  const s1 = await appel(
    new URL(`${racine}/api/v1/applications/${uuid}`),
    'PATCH',
    env.COOLIFY_API_TOKEN,
    {
      docker_registry_image_tag: etiquetteParEmpreinte(empreinte),
    }
  );
  if (s1 < 200 || s1 > 299) {
    console.error(`❌ la plateforme refuse l'étiquette ${etiquette} : HTTP ${s1}`);
    return 1;
  }
  console.log(`   étiquette posée : ${etiquette}`);
  const s2 = await appel(
    new URL(`${racine}/api/v1/deploy?uuid=${uuid}&force=false`),
    'POST',
    env.COOLIFY_API_TOKEN
  );
  if (s2 < 200 || s2 > 299) {
    console.error(`❌ la plateforme refuse le déploiement : HTTP ${s2}`);
    return 1;
  }
  console.log(`   déploiement déclenché — lecture de ${ENTETE_DE_BUILD} sur ${publique.origin}`);
  const r = await atterrir(sha, publique, options(argv));
  ecrireLaSortie(r.servi);
  if (r.code !== 0) return r.code;
  if ((await exigerLEmpreinteServie(empreinte, racine, uuid, env.COOLIFY_API_TOKEN)) !== 0)
    return 1;
  return verifierLaPolitique(publique);
}

// ── QA-T55, QA-T67 (REQ-GOV-014) : la porte A du MÊME sha, de la bonne provenance ─────────────

/**
 * Le job `deployer` partait sur tout push de `main`, que la porte A soit verte, rouge ou encore en
 * cours. `pnpm deploy:attendre-porte-a` l'attend, AVANT l'AIPD et la plateforme. Deux lectures
 * seulement, `contents` et `actions` (lentille `securite` du 2026-10-02, quatre conditions) :
 *   1. les runs de `ci.yml` filtrés par la forge sur le sha, `event=push` et `branch=main` ; un run
 *      rendu hors de ce filtre est un refus nommé, jamais ignoré ;
 *   2. le plus récent se choisit sur `run_number` puis `run_attempt`, champs du SERVEUR ;
 *   3. ce run est `completed` et `success`, puis son job `gate-a` est `success` ;
 *   4. la paire de permissions est figée par le témoin du workflow.
 * Le jeton n'est servi qu'à cette étape. Échec FERMÉ et nommé partout ; ni le jeton ni les adresses
 * appelées ne sont imprimés.
 */
export const JOB_DE_LA_PORTE_A = 'gate-a';
export const WORKFLOW_DE_LA_PORTE_A = '.github/workflows/ci.yml';
const FICHIER_DU_WORKFLOW = 'ci.yml';

export type VerdictDesRuns =
  | { etat: 'reussie'; runId: number }
  | { etat: 'absente' }
  | { etat: 'en_cours' }
  | { etat: 'refusee'; raison: string };

type Run = {
  id?: unknown;
  run_number?: unknown;
  run_attempt?: unknown;
  head_sha?: unknown;
  head_branch?: unknown;
  event?: unknown;
  path?: unknown;
  status?: unknown;
  conclusion?: unknown;
};

const entier = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);

export function jugerLesRuns(brut: unknown, sha: string): VerdictDesRuns {
  const liste =
    typeof brut === 'object' && brut !== null
      ? (brut as { workflow_runs?: unknown }).workflow_runs
      : undefined;
  if (!Array.isArray(liste)) return { etat: 'refusee', raison: 'reponse_illisible : les runs' };
  const tous = liste as Run[];
  const horsFiltre = tous.find(
    (r) =>
      r?.head_sha !== sha ||
      r.event !== 'push' ||
      r.head_branch !== 'main' ||
      r.path !== WORKFLOW_DE_LA_PORTE_A
  );
  if (horsFiltre !== undefined)
    return {
      etat: 'refusee',
      raison: `hors_filtre : un run « ${String(horsFiltre?.event)} » de « ${String(horsFiltre?.head_branch)} » (${String(horsFiltre?.path)}) rendu pour ce sha`,
    };
  if (tous.length === 0) return { etat: 'absente' };
  if (tous.some((r) => !entier(r.id) || !entier(r.run_number) || !entier(r.run_attempt)))
    return { etat: 'refusee', raison: 'reponse_illisible : id, run_number ou run_attempt' };
  const rang = (r: Run) => [r.run_number as number, r.run_attempt as number] as const;
  const recent = [...tous].sort((a, b) => {
    const [na, ta] = rang(a);
    const [nb, tb] = rang(b);
    return nb - na || tb - ta;
  })[0]!;
  if (recent.status !== 'completed') return { etat: 'en_cours' };
  if (recent.conclusion !== 'success')
    return {
      etat: 'refusee',
      raison: `echec : le run de ${WORKFLOW_DE_LA_PORTE_A} le plus récent conclut « ${String(recent.conclusion)} »`,
    };
  return { etat: 'reussie', runId: recent.id as number };
}

export function jugerLesJobs(
  brut: unknown
): { etat: 'reussie' } | { etat: 'refusee'; raison: string } {
  const liste =
    typeof brut === 'object' && brut !== null ? (brut as { jobs?: unknown }).jobs : undefined;
  if (!Array.isArray(liste)) return { etat: 'refusee', raison: 'reponse_illisible : les jobs' };
  const porte = (liste as { name?: unknown; status?: unknown; conclusion?: unknown }[]).filter(
    (j) => j?.name === JOB_DE_LA_PORTE_A
  );
  if (porte.length === 0)
    return {
      etat: 'refusee',
      raison: `gate_a_absent : le run ne porte pas de job « ${JOB_DE_LA_PORTE_A} »`,
    };
  const ko = porte.find((j) => j.status !== 'completed' || j.conclusion !== 'success');
  if (ko !== undefined)
    return {
      etat: 'refusee',
      raison: `echec : le job « ${JOB_DE_LA_PORTE_A} » conclut « ${String(ko.conclusion)} »`,
    };
  return { etat: 'reussie' };
}

async function lireLaForge(chemin: string, jeton: string): Promise<unknown> {
  const api = adresseSure(process.env.GITHUB_API_URL ?? 'https://api.github.com', 'GITHUB_API_URL');
  try {
    const r = await fetch(new URL(chemin, api), {
      headers: { authorization: `Bearer ${jeton}`, accept: 'application/vnd.github+json' },
      redirect: 'manual',
    });
    if (!r.ok) {
      await r.body?.cancel();
      return null;
    }
    return (await r.json()) as unknown;
  } catch {
    return null;
  }
}

async function commandeAttendrePorteA(argv: string[]): Promise<number> {
  const sha = shaDemande(argv);
  const depot = process.env.GITHUB_REPOSITORY ?? '';
  const jeton = process.env.GH_TOKEN ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot) || jeton === '') {
    console.error('❌ porte A non vérifiable : GITHUB_REPOSITORY et GH_TOKEN sont exigés — refusé');
    return 1;
  }
  const o = options(argv);
  let dernier: VerdictDesRuns = { etat: 'absente' };
  for (let essai = 1; essai <= o.essais; essai++) {
    dernier = jugerLesRuns(
      await lireLaForge(
        `/repos/${depot}/actions/workflows/${FICHIER_DU_WORKFLOW}/runs?head_sha=${sha}&event=push&branch=main&per_page=100`,
        jeton
      ),
      sha
    );
    if (dernier.etat === 'reussie' || dernier.etat === 'refusee') break;
    if (essai < o.essais) await new Promise((ok) => setTimeout(ok, o.delaiMs));
  }
  if (dernier.etat === 'refusee') {
    console.error(`❌ porte A refusée pour ${sha} — ${dernier.raison}`);
    return 1;
  }
  if (dernier.etat !== 'reussie') {
    console.error(
      `❌ porte A ${dernier.etat === 'absente' ? 'absente' : 'toujours en cours'} pour ${sha} après ${o.essais} lecture(s) — déploiement refusé`
    );
    return 1;
  }
  const porte = jugerLesJobs(
    await lireLaForge(`/repos/${depot}/actions/runs/${dernier.runId}/jobs?per_page=100`, jeton)
  );
  if (porte.etat === 'refusee') {
    console.error(`❌ porte A refusée pour ${sha} — ${porte.raison}`);
    return 1;
  }
  console.log(
    `✅ porte A « ${JOB_DE_LA_PORTE_A} » réussie sur ${sha}, run de ${WORKFLOW_DE_LA_PORTE_A} — le déploiement peut partir`
  );
  return 0;
}

/**
 * Consignes de la lentille `securite` pour la livraison de QA-T13 : on ne remet en service QUE ce que
 * la chaîne de production a déjà livré. Le sha cible doit être un ANCÊTRE de la branche principale
 * (API de comparaison de la forge : `status` vaut `ahead` ou `identical`), et son image `sha-<7>` doit
 * avoir été PUBLIÉE par le job `publier` (manifeste présent dans le registre, lu anonymement : l'image
 * est publique). Jamais une image de branche. Les deux contrôles précèdent tout appel à la plateforme,
 * et échouent fermé.
 */
async function exigerUnShaLivre(cible: string): Promise<string> {
  const depot = process.env.GITHUB_REPOSITORY ?? '';
  const jetonForge = process.env.GH_TOKEN ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot) || jetonForge === '') {
    throw new Error(
      'GITHUB_REPOSITORY et GH_TOKEN sont exigés pour vérifier que le sha a été livré'
    );
  }
  const api = adresseSure(process.env.GITHUB_API_URL ?? 'https://api.github.com', 'GITHUB_API_URL');
  const comparaison = await fetch(new URL(`/repos/${depot}/compare/${cible}...main`, api), {
    headers: { authorization: `Bearer ${jetonForge}`, accept: 'application/vnd.github+json' },
  });
  const statut = comparaison.ok
    ? ((await comparaison.json()) as { status?: unknown }).status
    : (await comparaison.body?.cancel(), null);
  if (statut !== 'ahead' && statut !== 'identical') {
    throw new Error(
      `le sha ${cible} n'est pas un ancêtre de main (comparaison : ${String(statut ?? comparaison.status)}) — refusé`
    );
  }
  // L'image doit avoir été PUBLIÉE ; son empreinte est ce que le retour arrière tire (QA-T65).
  return empreintePubliee(cible);
}

/** L'échappatoire, remise à `0` — l'étape `if: always()` du workflow, jouée même après un échec. */
async function commandeRetirerEchappatoire(): Promise<number> {
  const manquants = SECRETS_DU_DEPLOIEMENT.filter(
    (n) => n !== 'PARTNERS_URL_PUBLIQUE' && (process.env[n] ?? '') === ''
  );
  if (manquants.length > 0) {
    console.log(
      `⚠ SAUTÉ : ${manquants.join(', ')} — aucune échappatoire n'a pu être posée non plus.`
    );
    return 0;
  }
  const plateforme = adresseSure(process.env.COOLIFY_URL ?? '', 'COOLIFY_URL');
  const racine = plateforme.href.replace(/\/+$/, '');
  const uuid = encodeURIComponent(process.env.COOLIFY_APP_UUID ?? '');
  const s = await appel(
    new URL(`${racine}/api/v1/applications/${uuid}/envs/bulk`),
    'PATCH',
    process.env.COOLIFY_API_TOKEN ?? '',
    { data: [{ key: 'SKIP_MIGRATE', value: '0' }] }
  );
  if (s < 200 || s > 299) {
    console.error(`❌ SKIP_MIGRATE n'a pas pu être remis à 0 (HTTP ${s}) : à retirer À LA MAIN`);
    return 1;
  }
  console.log('✅ SKIP_MIGRATE remis à 0 : le déploiement suivant migrera.');
  return 0;
}

/** `readyz` servi par l'adresse publique : 200, ou le statut qui en tient lieu. */
async function readyz(base: URL): Promise<number> {
  try {
    const r = await fetch(new URL('/api/readyz', base), { redirect: 'manual', cache: 'no-store' });
    await r.body?.cancel();
    return r.status;
  } catch {
    return 0;
  }
}

/**
 * QA-T13 (REQ-QA-022) — le retour arrière : `SKIP_MIGRATE=1`, étiquette `sha-<cible>`, déploiement,
 * puis VÉRIFICATION de l'en-tête servi ET de `readyz`. `SKIP_MIGRATE` est remis à `0` QUOI QU'IL
 * ARRIVE : l'entrée n'honore que `1` (`docker-entrypoint.sh`), et une échappatoire laissée en place
 * ferait démarrer l'image suivante sur un schéma qu'elle n'a pas migré (runbook, étape 5).
 * Le sha cible vient de l'environnement de l'étape (`SHA_CIBLE`), jamais d'une commande interpolée,
 * et il est jugé AVANT tout appel.
 */
async function commandeRetourArriere(argv: string[]): Promise<number> {
  const cible = (process.env.SHA_CIBLE ?? '').toLowerCase();
  if (!SHA_COMPLET.test(cible)) {
    throw new Error('SHA_CIBLE doit être un sha de 40 caractères hexadécimaux');
  }
  // Un retour arrière est un geste MANUEL d'incident (arbitrage -d7 du 2026-09-30) : sans ses
  // secrets, il ÉCHOUE en les nommant — jamais un vert qui n'aurait rien redéployé.
  const manquants = SECRETS_DU_DEPLOIEMENT.filter((n) => (process.env[n] ?? '') === '');
  if (manquants.length > 0) {
    for (const n of manquants) {
      console.log(`::error title=deploy:retour-arriere::${n} absent — retour arrière IMPOSSIBLE`);
    }
    console.error(`❌ ${manquants.join(', ')} absent(s) : rien n'a été redéployé.`);
    return 1;
  }
  const lire = (n: (typeof SECRETS_DU_DEPLOIEMENT)[number]): string => process.env[n] ?? '';
  const plateforme = adresseSure(lire('COOLIFY_URL'), 'COOLIFY_URL');
  const publique = adresseSure(lire('PARTNERS_URL_PUBLIQUE'), 'PARTNERS_URL_PUBLIQUE');
  const jeton = lire('COOLIFY_API_TOKEN');
  const empreinte = await exigerUnShaLivre(cible);
  const racine = plateforme.href.replace(/\/+$/, '');
  const uuid = encodeURIComponent(lire('COOLIFY_APP_UUID'));
  const variables = new URL(`${racine}/api/v1/applications/${uuid}/envs/bulk`);
  const poser = (valeur: '0' | '1') =>
    appel(variables, 'PATCH', jeton, { data: [{ key: 'SKIP_MIGRATE', value: valeur }] });

  let code: 0 | 1 = 1;
  try {
    const s0 = await poser('1');
    if (s0 < 200 || s0 > 299) {
      console.error(`❌ la plateforme refuse SKIP_MIGRATE=1 : HTTP ${s0}`);
      return 1;
    }
    const etiquette = etiquetteParEmpreinte(empreinte);
    const s1 = await appel(new URL(`${racine}/api/v1/applications/${uuid}`), 'PATCH', jeton, {
      docker_registry_image_tag: etiquetteParEmpreinte(empreinte),
    });
    if (s1 < 200 || s1 > 299) {
      console.error(`❌ la plateforme refuse l'étiquette ${etiquette} : HTTP ${s1}`);
      return 1;
    }
    const s2 = await appel(
      new URL(`${racine}/api/v1/deploy?uuid=${uuid}&force=false`),
      'POST',
      jeton
    );
    if (s2 < 200 || s2 > 299) {
      console.error(`❌ la plateforme refuse le déploiement : HTTP ${s2}`);
      return 1;
    }
    if ((await verifier(cible, publique, options(argv))) !== 0) return 1;
    if ((await exigerLEmpreinteServie(empreinte, racine, uuid, jeton)) !== 0) return 1;
    const sante = await readyz(publique);
    if (sante !== 200) {
      console.error(
        `❌ readyz répond ${sante || 'rien'} après le retour arrière : rien n'est remis en place`
      );
      return 1;
    }
    console.log(`✅ retour arrière sur ${etiquette} : en-tête et readyz vérifiés`);
    code = 0;
    return 0;
  } finally {
    const s3 = await poser('0');
    if (s3 < 200 || s3 > 299) {
      console.error(`❌ SKIP_MIGRATE n'a pas pu être remis à 0 (HTTP ${s3}) : à retirer À LA MAIN`);
    } else if (code === 0) {
      console.log('   SKIP_MIGRATE remis à 0 : le déploiement suivant migrera.');
    }
  }
}

const APPELE_DIRECTEMENT = /deploy-verify\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const argv = process.argv.slice(2);
  const mode = argv.includes('--declencher')
    ? commandeDeclencher
    : argv.includes('--verifier')
      ? commandeVerifier
      : argv.includes('--retour-arriere')
        ? commandeRetourArriere
        : argv.includes('--retirer-echappatoire')
          ? commandeRetirerEchappatoire
          : argv.includes('--alerter')
            ? commandeAlerter
            : argv.includes('--attendre-porte-a')
              ? commandeAttendrePorteA
              : null;
  if (mode === null) {
    console.error(
      'usage : deploy-verify.ts --verifier [<sha>] | --declencher | --retour-arriere | --retirer-echappatoire | --alerter | --attendre-porte-a'
    );
    process.exit(1);
  }
  // `exitCode`, jamais la sortie immédiate du processus ici : couper des sockets de `fetch` encore ouvertes fait
  // planter Node sous Windows (0xC0000409, mesuré le 2026-09-29) — le code rendu ne serait plus le nôtre.
  mode(
    argv.filter(
      (a) =>
        !['--declencher', '--verifier', '--retour-arriere', '--retirer-echappatoire'].includes(a) &&
        a !== '--alerter' &&
        a !== '--attendre-porte-a'
    )
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
    }
  );
}
