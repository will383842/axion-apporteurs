// @req REQ-GOV-014
/**
 * QA-T54 — UN DÉPLOIEMENT QUI N'ATTERRIT PAS ALERTE, SANS DONNÉE PERSONNELLE.
 *
 * Condition de mise en service posée par la lentille `securite` (relayée par la coordination le
 * 2026-09-30), sur le modèle de QA-T53 : sans retour automatique de la plateforme, c'est le rouge de
 * `deploy:coolify` qui voit un déploiement malade, et un rouge dans l'onglet Actions ne réveille
 * personne. Une catégorie CLOSE, `deploiement_non_atterri` :
 *
 *   1. un atterrissage raté (sha servi ≠ sha fusionné, en-tête absent, délai dépassé) émet
 *      EXACTEMENT une alerte ; `readyz` non prêt aussi ; un atterrissage réussi n'en émet aucune ;
 *   2. l'alerte ne porte que le sha attendu, le sha servi et l'environnement — ni jeton, ni URL ;
 *   3. le sha servi vient d'un en-tête de RÉPONSE, que contrôle quiconque sert le domaine : il
 *      n'entre dans l'alerte qu'au format hexadécimal de 7 à 40 caractères, sinon « illisible » ;
 *   4. l'alerte ne remplace pas l'échec : le code rendu reste 1.
 *
 * RM-11 : chaque cas pose explicitement l'en-tête servi et le statut de `readyz` ; le serveur est
 * local, en mémoire du test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { atterrirOuAlerter } from '../../../scripts/gates/deploy-verify';
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

function recueil() {
  const alertes: ObjetAlerte[] = [];
  return { alertes, alerter: async (o: ObjetAlerte) => void alertes.push(o) };
}

describe('REQ-GOV-014 — la catégorie close `deploiement_non_atterri` existe', () => {
  it('elle est dans la liste close des catégories', () => {
    expect(CATEGORIES_ALERTE).toContain('deploiement_non_atterri');
  });
});

describe('REQ-GOV-014 — un atterrissage raté alerte, une fois ; un atterrissage réussi, jamais', () => {
  it('sha servi ≠ sha fusionné : une alerte, sha attendu et servi, code 1', async () => {
    const base = await servir(AUTRE, 200);
    const r = recueil();
    const code = await atterrirOuAlerter(SHA, base, RAPIDE, {
      alerter: r.alerter,
      environnement: 'production',
    });
    expect(code).toBe(1);
    expect(r.alertes).toHaveLength(1);
    expect(r.alertes[0]).toMatchObject({
      categorie: 'deploiement_non_atterri',
      deploiement: { attendu: SHA, servi: AUTRE, environnement: 'production' },
    });
  });

  it('en-tête absent : une alerte, le sha servi « illisible », code 1', async () => {
    const base = await servir(null, 200);
    const r = recueil();
    expect(
      await atterrirOuAlerter(SHA, base, RAPIDE, { alerter: r.alerter, environnement: 'production' })
    ).toBe(1);
    expect(r.alertes).toHaveLength(1);
    expect(messageDAlerte('alerte', r.alertes[0]!)).toContain('servi illisible');
  });

  it('`readyz` non prêt, sha atterri : une alerte, code 1', async () => {
    const base = await servir(SHA, 503);
    const r = recueil();
    expect(
      await atterrirOuAlerter(SHA, base, RAPIDE, { alerter: r.alerter, environnement: 'production' })
    ).toBe(1);
    expect(r.alertes).toHaveLength(1);
    expect(r.alertes[0]).toMatchObject({ categorie: 'deploiement_non_atterri' });
  });

  it('atterri et `readyz` prêt : aucune alerte, code 0', async () => {
    const base = await servir(SHA, 200);
    const r = recueil();
    expect(
      await atterrirOuAlerter(SHA, base, RAPIDE, { alerter: r.alerter, environnement: 'production' })
    ).toBe(0);
    expect(r.alertes).toEqual([]);
  });
});

describe('REQ-GOV-014 — le message ne porte ni jeton, ni URL, ni en-tête piégé', () => {
  it.each([
    ['une URL', 'https://piege.example/x'],
    ['du balisage', '<b>deadbeef</b>'],
    ['un sha trop court', 'abc12'],
    ['un sha trop long', 'a'.repeat(41)],
  ])('un en-tête servi portant %s entre « illisible »', async (_nom, piege) => {
    const base = await servir(piege, 200);
    const r = recueil();
    await atterrirOuAlerter(SHA, base, RAPIDE, { alerter: r.alerter, environnement: 'production' });
    const message = messageDAlerte('alerte', r.alertes[0]!);
    expect(message).toContain('servi illisible');
    expect(message).not.toContain(piege);
  });

  it('le message remis au canal : la catégorie, les deux sha, l’environnement — sans jeton ni URL', async () => {
    const base = await servir(AUTRE, 200);
    const corps: string[] = [];
    const alerteur = creerAlerteur({
      notifieur: { notifier: async (n) => void corps.push(`${n.sujet}\n${n.corps}`) },
      horloge: { maintenant: () => 0 },
      plafondParHeure: 1,
    });
    await atterrirOuAlerter(SHA, base, RAPIDE, {
      alerter: async (o) => void (await alerteur.alerter(o)),
      environnement: 'production',
    });
    expect(corps).toHaveLength(1);
    expect(corps[0]).toContain('[deploiement_non_atterri]');
    expect(corps[0]).toContain(`attendu ${SHA}`);
    expect(corps[0]).toContain(`servi ${AUTRE}`);
    expect(corps[0]).toContain('environnement production');
    expect(corps[0]).not.toContain(JETON);
    expect(corps[0]).not.toMatch(/https?:\/\//);
    expect(corps[0]).not.toContain(base.host);
  });

  it('un environnement hors de la liste close entre « illisible »', () => {
    const message = messageDAlerte('alerte', {
      categorie: 'deploiement_non_atterri',
      id: 'd4c3b2a1-e5f6-4a7b-8c9d-aebfcadbecfd',
      deploiement: { attendu: SHA, servi: AUTRE, environnement: 'jeanne.dupont@example.org' },
    });
    expect(message).toContain('environnement illisible');
    expect(message).not.toContain('example.org');
  });
});
