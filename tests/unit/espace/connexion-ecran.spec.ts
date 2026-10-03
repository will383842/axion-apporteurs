// @req REQ-UX-015
// @req REQ-SEC-003
/**
 * UX-P1-04 — l'écran « Se connecter » de l'espace, côté écran : le code à six chiffres, ses deux
 * refus, la page « lien déjà utilisé », le mode installé et la redirection bornée. Le mécanisme du
 * code vit dans `lien-magique.ts` (SEC-54) ; l'écran ne fait que l'afficher.
 *
 * CE QU'IL GARDE :
 *   (1) LES TEXTES DE LA JURISTE, mot pour mot (rattrapage 88) : un SEUL texte pour tout refus de
 *       code, et un texte pour le débit, sans durée en dur ;
 *   (2) chaque issue de la vérification (`code_refuse`, `debit`) correspond à son texte ;
 *   (3) après l'envoi, l'écran propose le code : un champ étiqueté, l'action de vérification, et
 *       « Changer d'adresse » ;
 *   (4) un lien déjà consommé a sa page, distincte d'un lien invalide ;
 *   (5) le mode installé met le code devant le lien ;
 *   (6) la redirection après connexion est BORNÉE aux chemins relatifs de l'espace.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONNEXION } from '../../../src/content/micro-copy/espace/vocabulaire';
import { ETATS_DU_CODE } from '../../../src/server/auth/lien-magique';
import {
  EcranCode,
  EcranIssue,
  texteDuRefusDeCode,
} from '../../../src/app/(espace)/connexion/ecran';
import { destinationBornee } from '../../../src/app/(espace)/connexion/destination';
import PageConnexion from '../../../src/app/(espace)/connexion/page';

const rien = async (): Promise<void> => undefined;
const page = async (q: Record<string, string>) =>
  renderToStaticMarkup(await PageConnexion({ searchParams: Promise.resolve(q) }));

describe('REQ-UX-015 — (1) et (2) les textes des refus, ceux de la juriste', () => {
  it('REQ-UX-015 : TÉMOIN — mot pour mot, un seul texte pour tout refus de code', () => {
    expect(CONNEXION.code.refus).toBe(
      'Ce code n’est pas valable. Demandez un nouveau lien de connexion.'
    );
    expect(CONNEXION.code.debit).toBe('Trop d’essais. Réessayez dans quelques minutes.');
  });

  it('REQ-UX-015 : TÉMOIN — chaque issue de refus correspond à son texte, et seulement elles', () => {
    expect(texteDuRefusDeCode('code_refuse')).toBe(CONNEXION.code.refus);
    expect(texteDuRefusDeCode('debit')).toBe(CONNEXION.code.debit);
    const refus = ETATS_DU_CODE.filter((e) => e !== 'ouverte');
    expect(refus).toEqual(['code_refuse', 'debit']);
  });

  it('REQ-UX-015 : TÉMOIN — la page rend le texte du refus, en alerte, et l’issue de l’URL ne passe que par la liste fermée', async () => {
    const refuse = await page({ code: 'code_refuse' });
    expect(refuse).toContain(CONNEXION.code.refus);
    expect(refuse).toMatch(/role="alert"/);
    expect(await page({ code: 'debit' })).toContain(CONNEXION.code.debit);
    // Une issue inconnue n'affiche aucun refus.
    const inconnue = await page({ code: '<script>' });
    expect(inconnue).not.toContain(CONNEXION.code.refus);
    expect(inconnue).not.toContain('&lt;script&gt;');
  });
});

describe('REQ-UX-015 — (3) le code, après l’envoi', () => {
  it('REQ-UX-015 : TÉMOIN — un champ de code étiqueté, numérique, l’action de vérification, et « Changer d’adresse »', () => {
    const h = renderToStaticMarkup(
      createElement(EcranCode, { refus: null, verifier: rien, changer: rien, suite: null })
    );
    const champ = /<input[^>]*name="code"[^>]*>/.exec(h)?.[0] ?? '';
    expect(champ).toMatch(/inputMode="numeric"|inputmode="numeric"/);
    expect(champ).toMatch(/autoComplete="one-time-code"|autocomplete="one-time-code"/);
    expect(champ).toMatch(/maxLength="6"|maxlength="6"/);
    const id = /id="([^"]+)"/.exec(champ)?.[1];
    expect(h).toContain(`<label for="${id}">${CONNEXION.code.champ}</label>`);
    expect(h).toContain(CONNEXION.code.action);
    expect(h).toContain(CONNEXION.code.changer);
    // L'adresse n'est jamais redemandée : elle est dans le cookie d'attente (SEC-54).
    expect(h).not.toMatch(/name="courriel"/);
  });

  it('REQ-UX-015 : TÉMOIN — après l’envoi, la page propose le code', async () => {
    const h = await page({ etat: 'envoye' });
    expect(h).toMatch(/name="code"/);
    expect(h).toContain(CONNEXION.code.changer);
  });
});

describe('REQ-SEC-003 — (4) un lien déjà consommé a sa page', () => {
  it('REQ-SEC-003 : TÉMOIN — « déjà utilisé » se dit comme tel, distinct d’un lien invalide', () => {
    const deja = renderToStaticMarkup(createElement(EcranIssue, { etat: 'deja_utilise' }));
    const invalide = renderToStaticMarkup(createElement(EcranIssue, { etat: 'lien_invalide' }));
    expect(deja).toContain(CONNEXION.dejaUtilise.titre);
    expect(deja).toContain(CONNEXION.dejaUtilise.action);
    expect(deja).not.toBe(invalide);
  });
});

describe('REQ-UX-015 — (5) le mode installé', () => {
  it('REQ-UX-015 : TÉMOIN — l’avis du mode installé est dans l’écran du code, caché tant que le mode n’est pas détecté', () => {
    const h = renderToStaticMarkup(
      createElement(EcranCode, { refus: null, verifier: rien, changer: rien, suite: null })
    );
    expect(h).toContain(CONNEXION.code.installee.titre);
    expect(h).toMatch(/data-mode-installe[^>]*hidden/);
  });
});

describe('REQ-SEC-003 — (6) la redirection bornée', () => {
  it('REQ-SEC-003 : TÉMOIN — un chemin relatif de l’espace passe ; tout le reste mène à l’accueil', () => {
    expect(destinationBornee(null)).toBe('/');
    expect(destinationBornee('/mes-entreprises')).toBe('/mes-entreprises');
    expect(destinationBornee('/mes-entreprises?onglet=a#x')).toBe('/mes-entreprises?onglet=a#x');
    for (const hostile of [
      '//exemple.invalid/x',
      '/\\exemple.invalid',
      'https://exemple.invalid',
      'javascript:alert(1)',
      'mes-entreprises',
      '/console/apporteurs',
      '/api/integrations/axionia',
      '/connexion',
      '/connexion/' + 'J'.repeat(43),
      '/' + 'a'.repeat(600),
      '',
    ])
      expect(destinationBornee(hostile), hostile).toBe('/');
  });
});
