// @req REQ-UX-063
/**
 * UX-P1-64 — le LOGO DISTANT des courriels, admis aux six conditions de la coordination (#319
 * 6041013643, sur l'avis de la sécurité et de la juriste 6040944172). Chaque condition a son témoin :
 *   1. l'URL est statique : aucun paramètre, aucun fragment, aucun identifiant ;
 *   2. elle est identique pour tous les courriels et tous les destinataires ;
 *   3. aucun suivi : une seule image, aucun pixel, aucune redirection, aucun paramètre de suivi des
 *      clics sur aucun lien ;
 *   4. aucun cookie ni mesure d'ouverture : c'est l'affaire du serveur d'axion-ia, hors de ce dépôt ;
 *      le témoin vérifie que le courriel ne porte rien qui relie l'image à un destinataire ;
 *   5. la phrase de la juriste est dans la politique de confidentialité (témoin de la politique) ;
 *   6. le suivi d'ouverture et de clic du fournisseur est ÉTEINT à chaque envoi.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FAMILLES_DE_COURRIEL,
  LOGO_DES_COURRIELS,
  habillerLeCourriel,
  type CourrielAHabiller,
} from '../../../src/server/email/chassis';
import { relaisZeptomail } from '../../../src/server/integrations/zeptomail/relais';

const OPPOSITION = 'https://espace.partners.test/opposition/JETON-OPPOSITION-1';
const courriel = (
  famille: (typeof FAMILLES_DE_COURRIEL)[number],
  n: number
): CourrielAHabiller => ({
  famille,
  preEnTete: `Pré-en-tête du destinataire ${n}`,
  titre: `Titre ${n}`,
  paragraphes: [`Bonjour, destinataire-${n}@example.org.`],
  appel:
    famille === 'A'
      ? { libelle: 'Me connecter', href: `https://espace.partners.test/connexion/JETON-${n}` }
      : {
          libelle: 'Voir Mes entreprises',
          href: 'https://espace.partners.test/mes-entreprises',
        },
  ...(famille === 'A' ? { appelSecret: true } : {}),
  ...(famille === 'B' ? { opposition: `${OPPOSITION}${n}` } : {}),
});
const images = (html: string) => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
const liens = (html: string) => [...html.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1]!);

describe('REQ-UX-063 — le logo distant des courriels, sans suivi', () => {
  it('REQ-UX-063 : TÉMOIN — condition 1 : l’URL du logo est statique, en https, sans paramètre ni fragment', () => {
    const u = new URL(LOGO_DES_COURRIELS);
    expect(u.protocol).toBe('https:');
    expect(u.search).toBe('');
    expect(u.hash).toBe('');
    expect(LOGO_DES_COURRIELS).toBe('https://axion-ia.com/email/axion-ia-logo-pill.png');
  });

  it('REQ-UX-063 : TÉMOIN — conditions 2 et 3 : une seule image par courriel, la MÊME pour toutes les familles et tous les destinataires', () => {
    for (const famille of FAMILLES_DE_COURRIEL) {
      for (const n of [1, 2]) {
        expect(images(habillerLeCourriel(courriel(famille, n)).html), `${famille} ${n}`).toEqual([
          LOGO_DES_COURRIELS,
        ]);
      }
    }
  });

  it('REQ-UX-063 : TÉMOIN — condition 3 : aucun lien ne porte de paramètre de suivi, ni ne redirige', () => {
    for (const famille of FAMILLES_DE_COURRIEL) {
      for (const href of liens(habillerLeCourriel(courriel(famille, 1)).html)) {
        expect(href, `${famille} ${href}`).not.toMatch(/utm_|[?&](ref|track|click|redirect)=/i);
        expect(href, `${famille} ${href}`).not.toMatch(/linkedin|facebook|x\.com/i);
      }
    }
  });

  it('REQ-UX-063 : TÉMOIN — condition 4 : rien dans l’image ne la relie au destinataire', () => {
    const html = habillerLeCourriel(courriel('C', 7)).html;
    const balise = /<img\b[^>]*>/.exec(html)![0];
    expect(balise).not.toContain('destinataire-7');
    expect(balise).not.toMatch(/data-|id=/);
  });

  it('REQ-UX-063 : TÉMOIN statique — le châssis n’écrit ni paramètre de suivi, ni réseau social, ni pixel', () => {
    const source = readFileSync('src/server/email/chassis.ts', 'utf8');
    expect(source).not.toMatch(/utm_|linkedin\.com|facebook\.com|width="1"|height="1"/i);
  });

  it('REQ-UX-063 : TÉMOIN — condition 6 : chaque envoi éteint le suivi d’ouverture et de clic du fournisseur', async () => {
    const corps: Record<string, unknown>[] = [];
    const relais = relaisZeptomail({
      url: 'https://api.zeptomail.eu/v1.1/email',
      jeton: 'jeton-temoin-ux-p1-64-0123456789abcdefghijklmnop',
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        corps.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ request_id: 'r-1', data: [] }), { status: 201 });
      }) as typeof fetch,
    });
    const habille = habillerLeCourriel(courriel('C', 1));
    await relais
      .envoyer({
        de: 'contact@envoi.example.org',
        a: 'marie@example.org',
        sujet: 'Sujet',
        corps: habille.texte,
        html: habille.html,
        reference: '00000000-0000-4000-8000-000000000064',
      })
      .catch(() => undefined);
    await relais
      .envoyer({
        de: 'contact@envoi.example.org',
        a: 'marie@example.org',
        sujet: 'Sujet',
        corps: 'Texte seul',
        reference: '00000000-0000-4000-8000-000000000065',
      })
      .catch(() => undefined);
    expect(corps).toHaveLength(2);
    for (const c of corps) {
      expect(c['track_opens']).toBe(false);
      expect(c['track_clicks']).toBe(false);
      expect(c['textbody']).toBeTypeOf('string');
    }
    expect(corps[0]!['htmlbody']).toBe(habille.html);
    expect(corps[1]).not.toHaveProperty('htmlbody');
  });
});
