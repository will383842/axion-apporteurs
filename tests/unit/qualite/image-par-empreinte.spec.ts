// @req REQ-GOV-014
/**
 * QA-T65 (REQ-GOV-014) — l'image déployée est tirée par EMPREINTE, jamais par une étiquette.
 *
 * L'étiquette `sha-<7>` est immuable par convention, pas par construction : le registre accepte qu'on
 * la repousse. L'empreinte (`sha256:<64 hex>`), elle, désigne un contenu. Coolify la lit dans
 * `docker_registry_image_tag` sous la forme `sha256-<hex>` (vérifié dans son code, `docs/tiers/coolify.md`).
 *
 * CE QUE CE FICHIER GARDE :
 *   1. TÉMOIN : une étiquette mobile (`latest`, `sha-<7>`) au lieu d'une empreinte est refusée, nommée ;
 *   2. TÉMOIN : une empreinte servie différente de celle publiée rend NON ATTERRI ;
 *   3. le déploiement et le retour arrière posent l'empreinte, et `publier.sh` l'imprime.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etiquetteParEmpreinte, jugerLEmpreinteServie } from '../../../scripts/gates/deploy-verify';

const HEX = 'a'.repeat(64);
const EMPREINTE = `sha256:${HEX}`;

describe('REQ-GOV-014 — l’image déployée est tirée par empreinte', () => {
  it('REQ-GOV-014 : TÉMOIN — une étiquette mobile au lieu d’une empreinte est refusée, nommée', () => {
    for (const mobile of [
      'latest',
      'sha-1a2b3c4',
      'sha256:court',
      `sha256:${HEX.toUpperCase()}`,
      '',
    ])
      expect(() => etiquetteParEmpreinte(mobile)).toThrow(/empreinte_attendue/);
    expect(etiquetteParEmpreinte(EMPREINTE)).toBe(`sha256-${HEX}`);
  });

  it('REQ-GOV-014 : TÉMOIN — une empreinte servie différente de celle publiée : NON ATTERRI', () => {
    expect(jugerLEmpreinteServie(EMPREINTE, `sha256-${HEX}`)).toEqual({ atterri: true });
    expect(jugerLEmpreinteServie(EMPREINTE, `sha256-${'b'.repeat(64)}`)).toEqual({
      atterri: false,
      raison: `l'application tire sha256-${'b'.repeat(64)}, et non l'empreinte publiée ${EMPREINTE}`,
    });
    expect(jugerLEmpreinteServie(EMPREINTE, 'sha-1a2b3c4')).toMatchObject({ atterri: false });
    expect(jugerLEmpreinteServie(EMPREINTE, null)).toMatchObject({ atterri: false });
  });

  it('REQ-GOV-014 : le déploiement et le retour arrière ne posent plus d’étiquette `sha-<7>`, et la publication imprime l’empreinte', () => {
    const source = readFileSync('scripts/gates/deploy-verify.ts', 'utf8');
    expect(source).not.toMatch(/docker_registry_image_tag:\s*etiquette\b/);
    expect(source.match(/docker_registry_image_tag:\s*etiquetteParEmpreinte\(/g)).toHaveLength(2);
    const publier = readFileSync('scripts/image/publier.sh', 'utf8');
    expect(publier).toMatch(/RepoDigests/);
    expect(publier).toMatch(/empreinte publiée/);
  });
});
