// @req REQ-SEC-029
/**
 * SEC-46 — la politique de contenu SERVIE est celle de la configuration (`deploy-verify`,
 * condition de la lentille sécurité ; le témoin sur serveur construit vit avec le terrain e2e
 * de la porte mobile).
 *
 * CE QU'IL PROUVE, sur un serveur local qui sert l'en-tête choisi :
 *   1. la politique de la configuration, servie avec un nonce quelconque : « atterri » (0) ;
 *   2. TÉMOIN — l'en-tête ABSENT : NON ATTERRI (1), motif `csp_absente` ;
 *   3. TÉMOIN — l'en-tête DIFFÉRENT (une directive relâchée par un mandataire) : NON ATTERRI (1),
 *      motif `csp_differente` ;
 *   4. un domaine qui ne répond pas : NON ATTERRI (1).
 * La configuration elle-même est jugée, directive par directive, par
 * `tests/unit/securite/headers.spec.ts` : ce témoin ne juge que l'écart entre elle et le service.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  jugerLaPolitique,
  politiqueAttendue,
  verifierLaPolitique,
} from '../../../scripts/gates/deploy-verify';

let serveur: Server | null = null;

afterEach(async () => {
  await new Promise<void>((r) => (serveur ? serveur.close(() => r()) : r()));
  serveur = null;
});

/** Un serveur local qui sert l'en-tête de politique donné (ou aucun) sur toute route. */
async function servir(politique: string | null): Promise<URL> {
  serveur = createServer((_req, res) => {
    if (politique !== null) res.setHeader('content-security-policy', politique);
    res.statusCode = 200;
    res.end();
  });
  await new Promise<void>((r) => serveur!.listen(0, '127.0.0.1', () => r()));
  return new URL(`http://127.0.0.1:${(serveur!.address() as AddressInfo).port}`);
}

/** La politique de la configuration, telle qu'une réponse la sert : son propre nonce. */
const servieAvecNonce = (nonce: string) =>
  politiqueAttendue().replace(/'nonce-[^']+'/g, `'nonce-${nonce}'`);

describe('REQ-SEC-029 — la politique servie, comparée à la configuration au nonce près', () => {
  it('REQ-SEC-029 : la politique de la configuration, servie avec son nonce, est « atterrie »', async () => {
    expect(jugerLaPolitique(servieAvecNonce('AbC123+/=='))).toEqual({ ok: true });
    expect(await verifierLaPolitique(await servir(servieAvecNonce('Zz9_-')))).toBe(0);
  });

  it('REQ-SEC-029 : TÉMOIN — l’en-tête ABSENT est NON ATTERRI, motif csp_absente', async () => {
    expect(jugerLaPolitique(null)).toEqual({ ok: false, motif: 'csp_absente' });
    expect(jugerLaPolitique('  ')).toEqual({ ok: false, motif: 'csp_absente' });
    expect(await verifierLaPolitique(await servir(null))).toBe(1);
  });

  it('REQ-SEC-029 : TÉMOIN — l’en-tête DIFFÉRENT (style-src relâché par un mandataire) est NON ATTERRI, motif csp_differente', async () => {
    const relachee = servieAvecNonce('n').replace(
      /style-src ([^;]+)/,
      "style-src $1 'unsafe-inline'"
    );
    expect(relachee).not.toBe(servieAvecNonce('n'));
    expect(jugerLaPolitique(relachee)).toEqual({ ok: false, motif: 'csp_differente' });
    expect(await verifierLaPolitique(await servir(relachee))).toBe(1);
  });

  it('REQ-SEC-029 : un domaine qui ne répond pas est NON ATTERRI', async () => {
    const base = await servir(null);
    await new Promise<void>((r) => serveur!.close(() => r()));
    serveur = null;
    expect(await verifierLaPolitique(base)).toBe(1);
  });

  it('REQ-SEC-029 : la politique attendue est celle de PRODUCTION — sans unsafe-eval', () => {
    expect(politiqueAttendue()).not.toContain('unsafe-eval');
    expect(politiqueAttendue()).toMatch(/style-src 'self' 'nonce-/);
  });
});
