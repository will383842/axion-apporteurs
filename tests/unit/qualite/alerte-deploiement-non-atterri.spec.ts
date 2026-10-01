// @req REQ-GOV-014
/**
 * QA-T54 — UN DÉPLOIEMENT QUI N'ATTERRIT PAS ALERTE, SANS DONNÉE PERSONNELLE.
 *
 * Condition de mise en service posée par la lentille `securite` (relayée par la coordination le
 * 2026-09-30), sur le modèle de l'alerte `rechiffrement_echoue` : sans retour automatique de la plateforme, c'est le rouge de
 * `deploy:coolify` qui voit un déploiement malade, et un rouge dans l'onglet Actions ne réveille
 * personne. Une catégorie CLOSE, `deploiement_non_atterri`.
 *
 * OPTION B (lentille `securite`, validée par la coordination) : le job `deployer` ne fait que
 * vérifier, et passe le sha servi en sortie ; un job `alerter` À PART (`needs: deployer`,
 * `if: failure() || cancelled()`) est le seul à lire le canal, et alerte même si `deployer` est mort
 * avant d'écrire sa sortie.
 *
 *   1. un atterrissage raté (sha servi ≠ sha fusionné, en-tête absent, délai dépassé) rend 1 ;
 *      `readyz` non prêt aussi ; un atterrissage réussi rend 0 — et `alerter` ne tourne qu'après un
 *      `deployer` rouge ou annulé ;
 *   2. l'alerte ne porte que le sha attendu, le sha servi et l'environnement — ni jeton, ni URL ;
 *   3. le sha servi vient d'un en-tête de RÉPONSE : il ne traverse la sortie du job et n'entre dans
 *      l'alerte qu'au format hexadécimal de 7 à 40 caractères, sinon « illisible » ; absent, « inconnu »,
 *      et l'alerte part quand même ;
 *   4. l'alerte ne remplace pas l'échec : `deployer` reste rouge.
 *
 * RM-11 : chaque cas pose explicitement l'en-tête servi et le statut de `readyz` ; le serveur est
 * local, en mémoire du test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SECRETS_DU_CANAL,
  alerterDepuisLaForge,
  atterrir,
  sortieDuDeployeur,
} from '../../../scripts/gates/deploy-verify';
import {
  CATEGORIES_ALERTE,
  creerAlerteur,
  messageDAlerte,
  type ObjetAlerte,
} from '../../../src/server/integrations/telegram/alertes';

const SHA = 'a'.repeat(40);
const AUTRE = 'b'.repeat(40);
const JETON = 'jeton-factice-de-test-qa-t54-0001';
const RAPIDE = { essais: 1, delaiMs: 0 };

let serveur: Server | null = null;
afterEach(async () => {
  await new Promise<void>((r) => (serveur ? serveur.close(() => r()) : r()));
  serveur = null;
});

/** Un serveur local qui sert l'en-tête de build donné (ou aucun) et `readyz` au statut donné. */
async function servir(entete: string | null, statutReadyz: number): Promise<URL> {
  serveur = createServer((req, res) => {
    if (entete !== null) res.setHeader('x-partners-build-sha', entete);
    res.statusCode = req.url === '/api/readyz' ? statutReadyz : 200;
    res.end();
  });
  await new Promise<void>((r) => serveur!.listen(0, '127.0.0.1', () => r()));
  return new URL(`http://127.0.0.1:${(serveur!.address() as AddressInfo).port}`);
}

/** Ce que le job `alerter` remet au canal, pour un environnement de forge donné. */
async function alerteDuJob(env: Record<string, string | undefined>): Promise<ObjetAlerte[]> {
  const alertes: ObjetAlerte[] = [];
  const code = await alerterDepuisLaForge(env, async (o) => void alertes.push(o));
  expect(code).toBe(0);
  return alertes;
}

describe('REQ-GOV-014 — la catégorie close `deploiement_non_atterri` existe', () => {
  it('elle est dans la liste close des catégories', () => {
    expect(CATEGORIES_ALERTE).toContain('deploiement_non_atterri');
  });
});

describe('REQ-GOV-014 — `deployer` rougit sur un atterrissage raté, jamais sur un atterrissage réussi', () => {
  it('sha servi ≠ sha fusionné : code 1, le sha servi rendu', async () => {
    const r = await atterrir(SHA, await servir(AUTRE, 200), RAPIDE);
    expect(r).toEqual({ code: 1, servi: AUTRE });
  });

  it('en-tête absent : code 1, aucun sha servi', async () => {
    expect(await atterrir(SHA, await servir(null, 200), RAPIDE)).toEqual({ code: 1, servi: null });
  });

  it('`readyz` non prêt, sha atterri : code 1', async () => {
    expect((await atterrir(SHA, await servir(SHA, 503), RAPIDE)).code).toBe(1);
  });

  it('atterri et `readyz` prêt : code 0', async () => {
    expect((await atterrir(SHA, await servir(SHA, 200), RAPIDE)).code).toBe(0);
  });
});

describe('REQ-GOV-014 — la sortie de `deployer` ne laisse passer qu’un sha', () => {
  it.each([
    ['un sha', AUTRE, AUTRE],
    ['un sha en majuscules', 'ABCDEF1', 'abcdef1'],
    ['aucun en-tête', null, ''],
    ['une URL', 'https://piege.example/x', 'illisible'],
    ['un saut de ligne qui écrirait une seconde sortie', `${SHA}\nsha_servi=${AUTRE}`, 'illisible'],
    ['un sha trop court', 'abc12', 'illisible'],
    ['un sha trop long', 'a'.repeat(41), 'illisible'],
  ])('%s', (_nom, servi, attendu) => {
    expect(sortieDuDeployeur(servi)).toBe(attendu);
  });
});

describe('REQ-GOV-014 — le job `alerter` alerte toujours, une fois, sans donnée personnelle', () => {
  it('après un atterrissage raté : une alerte, sha attendu et servi, environnement', async () => {
    const alertes = await alerteDuJob({
      SHA_ATTENDU: SHA,
      SHA_SERVI: AUTRE,
      DEPLOIEMENT_ENVIRONNEMENT: 'production',
    });
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatchObject({
      categorie: 'deploiement_non_atterri',
      deploiement: { attendu: SHA, servi: AUTRE, environnement: 'production' },
    });
  });

  it('`deployer` mort avant sa sortie : l’alerte part quand même, sha servi « inconnu »', async () => {
    const [a] = await alerteDuJob({ SHA_ATTENDU: SHA, DEPLOIEMENT_ENVIRONNEMENT: 'production' });
    expect(messageDAlerte('alerte', a!)).toContain('servi inconnu');
    const [b] = await alerteDuJob({ SHA_SERVI: '', DEPLOIEMENT_ENVIRONNEMENT: 'production' });
    expect(messageDAlerte('alerte', b!)).toContain('attendu inconnu');
  });

  it('un sha servi piégé n’entre pas tel quel : « illisible »', async () => {
    const piege = '<b>https://piege.example/x</b>';
    const [a] = await alerteDuJob({
      SHA_ATTENDU: SHA,
      SHA_SERVI: piege,
      DEPLOIEMENT_ENVIRONNEMENT: 'production',
    });
    const message = messageDAlerte('alerte', a!);
    expect(message).toContain('servi illisible');
    expect(message).not.toContain('piege.example');
  });

  it('un environnement hors de la liste close entre « illisible »', async () => {
    const [a] = await alerteDuJob({
      SHA_ATTENDU: SHA,
      SHA_SERVI: AUTRE,
      DEPLOIEMENT_ENVIRONNEMENT: 'jeanne.dupont@example.org',
    });
    const message = messageDAlerte('alerte', a!);
    expect(message).toContain('environnement illisible');
    expect(message).not.toContain('example.org');
  });

  it('le message remis au canal : catégorie, deux sha, environnement — sans jeton ni URL', async () => {
    const corps: string[] = [];
    const alerteur = creerAlerteur({
      notifieur: { notifier: async (n) => void corps.push(`${n.sujet}\n${n.corps}`) },
      horloge: { maintenant: () => 0 },
      plafondParHeure: 1,
    });
    const env = {
      SHA_ATTENDU: SHA,
      SHA_SERVI: AUTRE,
      DEPLOIEMENT_ENVIRONNEMENT: 'production',
      TELEGRAM_BOT_TOKEN: JETON,
      COOLIFY_URL: 'https://coolify.example',
    };
    expect(await alerterDepuisLaForge(env, (o) => alerteur.alerter(o))).toBe(0);
    expect(corps).toHaveLength(1);
    expect(corps[0]).toContain('[deploiement_non_atterri]');
    expect(corps[0]).toContain(`attendu ${SHA}`);
    expect(corps[0]).toContain(`servi ${AUTRE}`);
    expect(corps[0]).toContain('environnement production');
    expect(corps[0]).not.toContain(JETON);
    expect(corps[0]).not.toMatch(/https?:\/\//);
  });

  it('un canal qui refuse : le job `alerter` rougit, l’alerte ne passe pas pour envoyée', async () => {
    const code = await alerterDepuisLaForge({ SHA_ATTENDU: SHA }, async () => {
      throw new Error('Telegram refuse l’alerte : HTTP 401');
    });
    expect(code).toBe(1);
  });
});

/** Le texte d'un job de `deploy.yml`, découpé sur `  <nom>:` sous `jobs:`. */
function job(workflow: string, nom: string): string {
  const corps = workflow.slice(workflow.indexOf('\njobs:'));
  for (const bloc of corps.split(/\n(?= {2}[a-z][\w-]*:\s*$)/m).slice(1))
    if (new RegExp(`^ {2}${nom}:`).test(bloc)) return bloc;
  return '';
}

describe('REQ-GOV-014 — `alerter` tourne après un `deployer` rouge ou annulé, et lui seul lit le canal', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const alerter = job(workflow, 'alerter');
  const deployer = job(workflow, 'deployer');

  it('`alerter` dépend de `deployer`, ne tourne que sur son échec ou son annulation, en production', () => {
    expect(alerter).toMatch(/^ {4}needs: deployer\s*$/m);
    // La ligne ENTIÈRE, à l'identique : `false && (…)`, `always() || …` ou une autre ref passeraient
    // une expression qui ne cherche que `(failure() || cancelled())` (refus `securite` sur #339). La
    // garde qui la tient, avec ses faces rouges, vit dans pipeline-image.spec.ts (`alerter_mal_garde`).
    expect(alerter.split('\n').map((l) => l.trim())).toContain(
      "if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' && (failure() || cancelled()) }}"
    );
    expect(alerter).toMatch(/^ {4}environment: production\s*$/m);
  });

  it('`alerter` ne lit que les deux secrets du canal, dans l’env de son ÉTAPE', () => {
    const lus = [...alerter.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]).sort();
    expect(lus).toEqual([...SECRETS_DU_CANAL].sort());
    // Aucun `env:` au niveau du job : les secrets n'existent que pendant l'étape qui alerte.
    expect(alerter).not.toMatch(/^ {4}env:/m);
  });

  it('`deployer` ne lit aucun secret du canal, et passe le sha servi en sortie', () => {
    for (const s of SECRETS_DU_CANAL) expect(deployer).not.toContain(s);
    expect(deployer).toMatch(/sha_servi: \$\{\{ steps\.atterrissage\.outputs\.sha_servi \}\}/);
  });
});
