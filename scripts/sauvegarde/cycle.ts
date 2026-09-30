/**
 * cycle.ts — le cycle de la sauvegarde de Partners autour de l'exercice (QA-T12, REQ-QA-023).
 *
 * USAGE (forge, `.github/workflows/backup.yml` et `nightly.yml`) :
 *   pnpm sauvegarde:rechiffrer    chaque heure : chiffre ce que la plateforme a déposé en clair
 *   pnpm sauvegarde:exercice      chaque mois : exerce le dernier vidage chiffré, alerte sur échec
 *   pnpm sauvegarde:fraicheur     chaque nuit : rougit si le dernier exercice réussi est trop vieux
 *   pnpm sauvegarde:configurer    à la main : programme la sauvegarde horaire de la base vers Cloudflare R2
 *
 * ── LA RÉPARTITION, ARBITRÉE PAR -d7 SUR DÉLÉGATION DE WILLIAMS DU 2026-09-29 ────────────────
 *
 * La base n'est pas publique : c'est la PLATEFORME qui produit le vidage horaire et le dépose dans
 * Cloudflare R2, sous `partners/` (bucket `axion-ia-backups`, décision de Williams du 2026-09-22). Elle ne sait
 * pas chiffrer côté client : chaque heure, `rechiffrer` le chiffre avec la clé PROPRE à Partners
 * (`PARTNERS_BACKUP_PASSPHRASE`), l'écrit sous `partners/chiffres/` et efface le clair. Chaque mois,
 * la forge exerce le dernier vidage chiffré et écrit son verdict sous `partners/exercices/`.
 * ⚠️ Le chiffrement côté client est une CONDITION DE MISE EN SERVICE : aucune donnée réelle avant
 * que `rechiffrer` ait tourné en production (runbook `docs/runbooks/sauvegarde.md`).
 *
 * ── SECRETS ABSENTS : SAUTÉ ET NOMMÉ ─────────────────────────────────────────────────────────
 *
 * Chaque commande nomme en `::warning::` chaque variable qui lui manque et sort en 0 sans rien
 * toucher : un `main` rouge en permanence sur une attente connue finit désarmé (RM-02). Dès qu'elles
 * existent, tout échec est rouge.
 *
 * ── TIERS, LUS LE 2026-09-29 (RM-08) ─────────────────────────────────────────────────────────
 *
 *   • Cloudflare R2 parle S3 : la CLI `aws` des runners (`s3api list-objects-v2`, `s3 cp`, `s3 rm`), avec
 *     `--endpoint-url` et la région `auto`. Aucun SDK ajouté au dépôt.
 *   • Coolify : `POST /api/v1/databases/{uuid}/backups` (`frequency`, `enabled`, `save_s3`,
 *     `s3_storage_uuid`), `GET /api/v1/databases/{uuid}/backups`, dont la réponse N'EST PAS
 *     documentée : toute forme non reconnue est refusée et nommée, jamais devinée.
 *   • Telegram : `POST https://api.telegram.org/bot<jeton>/sendMessage` (`chat_id`, `text`), par
 *     l'alerteur existant (`src/server/integrations/telegram/alertes.ts`, catégorie close
 *     `restauration_echouee`) : le message ne porte que la catégorie et un identifiant technique.
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { chiffrer, dechiffrer } from './chiffrement';
import { exercer, jugerFraicheur, type Verdict } from './exercice';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { creerAlerteur, type ObjetAlerte } from '../../src/server/integrations/telegram/alertes';
import type { Notifieur } from '../../src/lib/notify';

export const PREFIXES = {
  depot: 'partners/',
  chiffres: 'partners/chiffres/',
  exercices: 'partners/exercices/',
} as const;
const SUFFIXE_CHIFFRE = '.chiffre';

export type ObjetDuDepot = { cle: string; date: string };
export interface Depot {
  lister(prefixe: string): Promise<ObjetDuDepot[]>;
  lire(cle: string): Promise<Buffer>;
  ecrire(cle: string, contenu: Buffer): Promise<void>;
  supprimer(cle: string): Promise<void>;
}

const parDate = (a: ObjetDuDepot, b: ObjetDuDepot) => Date.parse(a.date) - Date.parse(b.date);

/** Chaque vidage en clair déposé sous `partners/` (hors des deux sous-préfixes) : chiffré, puis effacé. */
export async function rechiffrer(depot: Depot, phrase: string): Promise<{ rechiffres: number }> {
  const clairs = (await depot.lister(PREFIXES.depot))
    .filter((o) => !o.cle.startsWith(PREFIXES.chiffres) && !o.cle.startsWith(PREFIXES.exercices))
    .filter((o) => !o.cle.endsWith(SUFFIXE_CHIFFRE) && !o.cle.endsWith('/'))
    .sort(parDate);
  for (const o of clairs) {
    const clair = await depot.lire(o.cle);
    const cible = `${PREFIXES.chiffres}${basename(o.cle)}${SUFFIXE_CHIFFRE}`;
    await depot.ecrire(cible, chiffrer(clair, phrase));
    // Le clair n'est effacé qu'une fois le chiffré RELU et déchiffré à l'identique (lentille
    // `securite`, PR 280) : un dépôt qui aurait mal écrit ne coûte jamais la seule copie lisible.
    const relu = await depot
      .lire(cible)
      .then((c) => dechiffrer(c, phrase))
      .catch(() => null);
    if (relu === null || !relu.equals(clair)) {
      throw new Error(
        `${cible} relu ne restitue pas ${o.cle} : le clair est GARDÉ, rien n'est effacé`
      );
    }
    await depot.supprimer(o.cle);
  }
  return { rechiffres: clairs.length };
}

export type OutilsDExercice = {
  exercer: (contenuChiffre: Buffer) => Promise<Verdict>;
  alerter: (objet: ObjetAlerte) => Promise<void>;
};

/** Exerce le dernier vidage chiffré, écrit le verdict daté, alerte sur échec. */
export async function exercerLeDernier(depot: Depot, outils: OutilsDExercice): Promise<Verdict> {
  const dernier = (await depot.lister(PREFIXES.chiffres))
    .filter((o) => o.cle.endsWith(SUFFIXE_CHIFFRE))
    .sort(parDate)
    .at(-1);
  const v: Verdict = dernier
    ? await outils.exercer(await depot.lire(dernier.cle))
    : {
        date: new Date().toISOString(),
        verdict: 'echec',
        empreinteVidage: '',
        temoin: { table: '', lignes: 0, substitution: false },
        motif: `aucun vidage chiffré sous ${PREFIXES.chiffres}`,
      };
  await depot.ecrire(
    `${PREFIXES.exercices}${v.date.slice(0, 10)}.json`,
    Buffer.from(`${JSON.stringify(v, null, 2)}\n`)
  );
  if (v.verdict !== 'reussi') {
    await outils.alerter({ categorie: 'restauration_echouee', id: randomUUID() });
  }
  return v;
}

export async function fraicheurDuDepot(depot: Depot, maintenant: Date, seuilJours: number) {
  const dernier = (await depot.lister(PREFIXES.exercices))
    .filter((o) => o.cle.endsWith('.json'))
    .sort(parDate)
    .at(-1);
  let v: Verdict | null = null;
  if (dernier) {
    try {
      v = JSON.parse((await depot.lire(dernier.cle)).toString('utf8')) as Verdict;
    } catch {
      v = null;
    }
  }
  return jugerFraicheur(v, maintenant, seuilJours);
}

// ── les adaptateurs réels ─────────────────────────────────────────────────────────────────────

function manquantes(noms: readonly string[]): string[] {
  return noms.filter((n) => (process.env[n] ?? '') === '');
}

function sauter(commande: string, noms: string[]): 0 {
  for (const n of noms)
    console.log(`::warning title=${commande}::${n} absent — SAUTÉ (arbitrage -d7 du 2026-09-29)`);
  console.log(`⚠ ${commande} SAUTÉ : ${noms.join(', ')}. Rien n'a été lu ni écrit.`);
  return 0;
}

const SECRETS_DU_STOCKAGE = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const;

/** Cloudflare R2 par la CLI `aws` : les clés passent par l'environnement du sous-processus, jamais en argument. */
function depotR2(): Depot {
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
    AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
    AWS_DEFAULT_REGION: 'auto',
  };
  const bucket = process.env.R2_BUCKET ?? '';
  const point = ['--endpoint-url', process.env.R2_ENDPOINT ?? ''];
  const aws = (args: string[], entree?: Buffer): Buffer => {
    const r = spawnSync('aws', [...args, ...point], {
      env,
      input: entree,
      maxBuffer: 2 * 1024 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error(`aws ${args.slice(0, 2).join(' ')} sort en ${r.status}`);
    return r.stdout;
  };
  return {
    lister: async (prefixe) => {
      const brut = aws([
        's3api',
        'list-objects-v2',
        '--bucket',
        bucket,
        '--prefix',
        prefixe,
        '--output',
        'json',
      ]);
      const lu = (brut.length ? JSON.parse(brut.toString('utf8')) : {}) as {
        Contents?: { Key: string; LastModified: string }[];
      };
      return (lu.Contents ?? []).map((c) => ({ cle: c.Key, date: c.LastModified }));
    },
    lire: async (cle) => aws(['s3', 'cp', `s3://${bucket}/${cle}`, '-']),
    ecrire: async (cle, contenu) => void aws(['s3', 'cp', '-', `s3://${bucket}/${cle}`], contenu),
    supprimer: async (cle) => void aws(['s3', 'rm', `s3://${bucket}/${cle}`]),
  };
}

/** Le notifieur Telegram : le texte de l'alerte, rien d'autre ; le jeton ne sort jamais. */
function notifieurTelegram(jeton: string, salon: string): Notifieur {
  return {
    async notifier({ corps }) {
      const r = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: salon, text: corps }),
      });
      await r.body?.cancel();
      if (!r.ok) throw new Error(`Telegram refuse l’alerte : HTTP ${r.status}`);
    },
  };
}

async function commande(nom: string): Promise<number> {
  if (nom === 'rechiffrer') {
    const m = manquantes([...SECRETS_DU_STOCKAGE, 'PARTNERS_BACKUP_PASSPHRASE']);
    if (m.length) return sauter('sauvegarde:rechiffrer', m);
    const r = await rechiffrer(depotR2(), process.env.PARTNERS_BACKUP_PASSPHRASE ?? '');
    console.log(
      `✅ sauvegarde:rechiffrer — ${r.rechiffres} vidage(s) chiffré(s) côté client, clair(s) effacé(s)`
    );
    return 0;
  }
  if (nom === 'exercice') {
    const m = manquantes([
      ...SECRETS_DU_STOCKAGE,
      'PARTNERS_BACKUP_PASSPHRASE',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
    ]);
    if (m.length) return sauter('sauvegarde:exercice', m);
    const alerteur = creerAlerteur({
      notifieur: notifieurTelegram(
        process.env.TELEGRAM_BOT_TOKEN ?? '',
        process.env.TELEGRAM_CHAT_ID ?? ''
      ),
      horloge: { maintenant: () => Date.now() },
      plafondParHeure: 1,
    });
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const v = await exercerLeDernier(depotR2(), {
      exercer: async (contenu) => {
        const dossier = mkdtempSync(join(tmpdir(), 'exercice-'));
        try {
          const f = join(dossier, 'vidage.chiffre');
          writeFileSync(f, contenu);
          return await exercer(f, schema, process.env.PARTNERS_BACKUP_PASSPHRASE ?? '');
        } finally {
          rmSync(dossier, { recursive: true, force: true });
        }
      },
      alerter: async (o) => void (await alerteur.alerter(o)),
    });
    if (v.verdict === 'reussi') {
      console.log(
        `✅ sauvegarde:exercice — réussi, ${v.temoin.lignes} ligne(s) dans ${v.temoin.table}${v.temoin.substitution ? ' (témoin de substitution)' : ''}`
      );
      return 0;
    }
    console.error(`❌ sauvegarde:exercice — ${v.motif} ; alerte envoyée`);
    return 1;
  }
  if (nom === 'fraicheur') {
    const m = manquantes(SECRETS_DU_STOCKAGE);
    if (m.length) return sauter('sauvegarde:fraicheur', m);
    const seuil = SEUILS.EXERCICE_DE_RESTAURATION_MAX_JOURS.valeur;
    const j = await fraicheurDuDepot(depotR2(), new Date(), seuil);
    if (j.ok) {
      console.log(
        `✅ sauvegarde:fraicheur — dernier exercice réussi il y a ${j.ageJours} jour(s), seuil ${seuil}`
      );
      return 0;
    }
    console.error(`❌ sauvegarde:fraicheur — ${j.motif}`);
    return 1;
  }
  if (nom === 'configurer') return configurer();
  throw new Error('usage : cycle.ts rechiffrer | exercice | fraicheur | configurer');
}

/** La sauvegarde horaire de la base, programmée sur la plateforme ; relancée, elle ne se double pas. */
async function configurer(): Promise<number> {
  const m = manquantes([
    'COOLIFY_URL',
    'COOLIFY_API_TOKEN',
    'COOLIFY_DB_UUID',
    'COOLIFY_S3_STORAGE_UUID',
  ]);
  if (m.length) return sauter('sauvegarde:configurer', m);
  const base = new URL(process.env.COOLIFY_URL ?? '');
  if (base.protocol !== 'https:') throw new Error('COOLIFY_URL doit être en https');
  const racine = `${base.href.replace(/\/+$/, '')}/api/v1/databases/${encodeURIComponent(process.env.COOLIFY_DB_UUID ?? '')}/backups`;
  const entetes = {
    authorization: `Bearer ${process.env.COOLIFY_API_TOKEN ?? ''}`,
    accept: 'application/json',
  };
  const lu = await fetch(racine, { headers: entetes });
  if (!lu.ok) throw new Error(`la plateforme refuse GET …/backups : HTTP ${lu.status}`);
  const existantes = (await lu.json()) as unknown;
  if (!Array.isArray(existantes))
    throw new Error(
      'GET …/backups ne rend pas une liste : forme non documentée, à vérifier à la main'
    );
  if (existantes.length > 0) {
    const horaire = existantes.some(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        (b as { frequency?: unknown }).frequency === 'hourly' &&
        (b as { save_s3?: unknown }).save_s3 === true
    );
    if (!horaire)
      throw new Error(
        `${existantes.length} planification(s) déjà présente(s), aucune horaire vers S3 lisible : à vérifier à la main`
      );
    console.log('   sauvegarde horaire vers S3 : existe déjà');
    return 0;
  }
  const cree = await fetch(racine, {
    method: 'POST',
    headers: { ...entetes, 'content-type': 'application/json' },
    body: JSON.stringify({
      frequency: 'hourly',
      enabled: true,
      save_s3: true,
      s3_storage_uuid: process.env.COOLIFY_S3_STORAGE_UUID,
    }),
  });
  await cree.body?.cancel();
  if (!cree.ok) throw new Error(`la plateforme refuse POST …/backups : HTTP ${cree.status}`);
  console.log('✅ sauvegarde horaire vers S3 programmée');
  return 0;
}

const APPELE_DIRECTEMENT = /cycle\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  // `exitCode`, jamais la sortie immédiate du processus : voir `exercice.ts`.
  commande(process.argv[2] ?? '').then(
    (code) => {
      process.exitCode = code;
    },
    (e: Error) => {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
    }
  );
}
