// @req REQ-SEC-012
/**
 * SEC-44 — l'API entrante d'axion-ia a son compteur par IP, son allowlist déclarée et ses sauts de
 * confiance mesurés (écart C11 de la vérification de bout en bout).
 *
 * CE QU'IL PROUVE :
 *   1. LE COMPTEUR : `auth:axionia-ip` est au registre unique des limites, 60 par minute, sur
 *      l'empreinte de l'adresse, et il REFUSE quand le cache tombe — une API d'entreprise ne se
 *      laisse pas ouvrir par une panne ;
 *   2. L'ALLOWLIST : `AXIONIA_API_ALLOWLIST` est une variable DÉCLARÉE de la configuration, jugée au
 *      démarrage, facultative (absente, personne n'entre) — et non une lecture d'environnement que
 *      ni la validation, ni la documentation, ni le provisionnement ne connaissent ;
 *   3. LES SAUTS : `SAUTS_DE_CONFIANCE` égale la valeur MESURÉE et consignée dans
 *      `docs/tiers/coolify.md`, avec sa date, sa méthode et sa condition de remesure : la valeur du
 *      code et celle de la fiche ne peuvent pas diverger sans que ce témoin rougisse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPTEURS } from '../../../src/server/securite/rate-limit';
import { NOMS_DE_CONFIGURATION, NOMS_FACULTATIFS, schemaConfiguration } from '../../../src/lib/env';
import { SAUTS_DE_CONFIANCE } from '../../../src/server/securite/adresse-du-client';

describe('REQ-SEC-012 — le compteur par IP de l’API entrante', () => {
  it('REQ-SEC-012 : `auth:axionia-ip` est au registre — 60 par minute, conduite sur panne : refuser', () => {
    const registre: Readonly<Record<string, unknown>> = COMPTEURS;
    expect(registre['auth:axionia-ip']).toMatchObject({
      prefixe: 'auth:',
      limite: 60,
      fenetreSecondes: 60,
      surPanne: 'refuser',
      source: 'REQ-SEC-012',
    });
  });
});

describe('REQ-SEC-012 — l’allowlist est une variable déclarée de la configuration', () => {
  it('REQ-SEC-012 : AXIONIA_API_ALLOWLIST est jugée au démarrage, et facultative', () => {
    expect(NOMS_DE_CONFIGURATION).toContain('AXIONIA_API_ALLOWLIST');
    expect(NOMS_FACULTATIFS).toContain('AXIONIA_API_ALLOWLIST');
  });

  it('REQ-SEC-012 : TÉMOIN — une liste vide ou blanche est refusée au démarrage, une liste d’adresses passe', () => {
    const avec = (v: string | undefined) =>
      schemaConfiguration.safeParse({
        DATABASE_URL: 'postgresql://u:p@hote:5432/b',
        REDIS_URL: 'redis://hote:6379',
        AXIONIA_API_ALLOWLIST: v,
      }).success;
    expect(avec('203.0.113.7, 2001:db8::10')).toBe(true);
    expect(avec(undefined)).toBe(true);
    expect(avec('')).toBe(false);
    expect(avec('   ')).toBe(false);
  });
});

describe('REQ-SEC-012 — les sauts de confiance sont mesurés, et le code dit la mesure', () => {
  const fiche = readFileSync('docs/tiers/coolify.md', 'utf8');

  it('REQ-SEC-012 : la fiche Coolify consigne la mesure — date, méthode, valeur, condition de remesure', () => {
    const section = fiche.slice(fiche.indexOf('## 10. Sauts de confiance'));
    expect(section).toMatch(/^## 10\. Sauts de confiance/);
    expect(section).toMatch(/Mesuré le \d{4}-\d{2}-\d{2}/);
    expect(section).toContain('proxied');
    expect(section).toContain('cf-ray');
    expect(section).toMatch(/`SAUTS_DE_CONFIANCE` = (\d+)/);
    expect(section).toMatch(/[Rr]emesurer/);
  });

  it('REQ-SEC-012 : SAUTS_DE_CONFIANCE égale la valeur consignée — le code ne se met pas à jour seul', () => {
    const m = /`SAUTS_DE_CONFIANCE` = (\d+)/.exec(fiche);
    expect(m).not.toBeNull();
    expect(SAUTS_DE_CONFIANCE).toBe(Number(m![1]));
  });
});
