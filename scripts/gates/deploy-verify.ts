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
import { ENTETE_DE_BUILD } from '../../next.config';
import { creerAlerteur, type ObjetAlerte } from '../../src/server/integrations/telegram/alertes';
import type { Notifieur } from '../../src/lib/notify';

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

export type AlerteDeDeploiement = {
  /** Remet l'alerte au canal ; un échec d'envoi se nomme, il ne masque pas l'échec du déploiement. */
  readonly alerter: (objet: ObjetAlerte) => Promise<void>;
  /** L'environnement déployé, confronté à la liste close à l'écriture du message. */
  readonly environnement: string;
};

/**
 * QA-T54 (REQ-GOV-014) — l'atterrissage, puis `readyz` ; tout échec émet EXACTEMENT une alerte close
 * `deploiement_non_atterri` (sha attendu, sha servi, environnement), et le code reste 1 : l'alerte
 * ne remplace pas le rouge du job. Le sha servi est passé BRUT : c'est l'alerte qui le confronte à sa
 * liste blanche (`shaLisible`), au seul endroit où il entre dans un message.
 */
export async function atterrirOuAlerter(
  sha: string,
  base: URL,
  o: Options,
  a: AlerteDeDeploiement
): Promise<0 | 1> {
  const v = await verifierEnDetail(sha, base, o);
  let echoue = v.code !== 0;
  if (!echoue) {
    const sante = await readyz(base);
    if (sante !== 200) {
      console.error(
        `❌ readyz répond ${sante || 'rien'} : le sha est servi, l'application n'est pas prête`
      );
      echoue = true;
    }
  }
  if (!echoue) return 0;
  await a.alerter({
    categorie: 'deploiement_non_atterri',
    id: randomUUID(),
    deploiement: { attendu: sha, servi: v.servi ?? '', environnement: a.environnement },
  });
  return 1;
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

const SECRETS_DU_CANAL = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const;

/**
 * L'alerte de la forge pour `deploy:coolify`. Sans canal, l'alerte qui ne peut partir est NOMMÉE en
 * `::error::` ; un envoi refusé par Telegram aussi. Dans les deux cas, le job est déjà rouge.
 */
function alerteDeLaForge(): AlerteDeDeploiement {
  const environnement = process.env.DEPLOIEMENT_ENVIRONNEMENT ?? '';
  const manquants = SECRETS_DU_CANAL.filter((n) => (process.env[n] ?? '') === '');
  if (manquants.length > 0) {
    return {
      environnement,
      alerter: async (objet) => {
        console.error(
          `::error title=deploy:coolify::alerte ${objet.categorie} NON envoyée : ${manquants.join(', ')} absent(s)`
        );
      },
    };
  }
  const alerteur = creerAlerteur({
    notifieur: notifieurTelegram(
      process.env.TELEGRAM_BOT_TOKEN ?? '',
      process.env.TELEGRAM_CHAT_ID ?? ''
    ),
    horloge: { maintenant: () => Date.now() },
    plafondParHeure: 1,
  });
  return {
    environnement,
    alerter: async (objet) => {
      await alerteur.alerter(objet).catch((e: Error) => {
        console.error(
          `::error title=deploy:coolify::alerte ${objet.categorie} NON envoyée : ${e.message}`
        );
      });
    },
  };
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
  return verifier(sha, adresseSure(brut, 'PARTNERS_URL_PUBLIQUE'), options(argv));
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
  const etiquette = `sha-${sha.slice(0, 7)}`;

  const s1 = await appel(
    new URL(`${racine}/api/v1/applications/${uuid}`),
    'PATCH',
    env.COOLIFY_API_TOKEN,
    {
      docker_registry_image_tag: etiquette,
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
  return atterrirOuAlerter(sha, publique, options(argv), alerteDeLaForge());
}

/**
 * Consignes de la lentille `securite` pour la livraison de QA-T13 : on ne remet en service QUE ce que
 * la chaîne de production a déjà livré. Le sha cible doit être un ANCÊTRE de la branche principale
 * (API de comparaison de la forge : `status` vaut `ahead` ou `identical`), et son image `sha-<7>` doit
 * avoir été PUBLIÉE par le job `publier` (manifeste présent dans le registre, lu anonymement : l'image
 * est publique). Jamais une image de branche. Les deux contrôles précèdent tout appel à la plateforme,
 * et échouent fermé.
 */
async function exigerUnShaLivre(cible: string): Promise<void> {
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
  const registre = adresseSure(
    process.env.PARTNERS_REGISTRE_URL ?? 'https://ghcr.io',
    'PARTNERS_REGISTRE_URL'
  );
  const nom = depot.toLowerCase();
  const etiquette = `sha-${cible.slice(0, 7)}`;
  const t = await fetch(new URL(`/token?scope=repository:${nom}:pull`, registre));
  const anonyme = t.ok
    ? ((await t.json()) as { token?: unknown }).token
    : (await t.body?.cancel(), null);
  const manifeste = await fetch(new URL(`/v2/${nom}/manifests/${etiquette}`, registre), {
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
  await exigerUnShaLivre(cible);
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
    const etiquette = `sha-${cible.slice(0, 7)}`;
    const s1 = await appel(new URL(`${racine}/api/v1/applications/${uuid}`), 'PATCH', jeton, {
      docker_registry_image_tag: etiquette,
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
          : null;
  if (mode === null) {
    console.error(
      'usage : deploy-verify.ts --verifier [<sha>] | --declencher | --retour-arriere | --retirer-echappatoire'
    );
    process.exit(1);
  }
  // `exitCode`, jamais la sortie immédiate du processus ici : couper des sockets de `fetch` encore ouvertes fait
  // planter Node sous Windows (0xC0000409, mesuré le 2026-09-29) — le code rendu ne serait plus le nôtre.
  mode(
    argv.filter(
      (a) =>
        !['--declencher', '--verifier', '--retour-arriere', '--retirer-echappatoire'].includes(a)
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
