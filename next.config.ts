/**
 * Configuration Next de Partners (SEC-02, REQ-SEC-029 ; QA-T34, REQ-QA-033).
 *
 * `headers()` pose les en-têtes de sécurité STATIQUES sur toutes les routes — `'/(.*)'`, ressources
 * statiques comprises, que le proxy ne voit pas. La liste vient de `src/server/securite/entetes.ts`
 * (source unique) ; la CSP, elle, vit dans `src/proxy.ts`, parce qu'elle porte un nonce par requête.
 *
 * `x-partners-build-sha` (QA-T34) : le sha du commit dont l'image a été construite, injecté au build
 * par `--build-arg GITHUB_SHA` (Dockerfile) sous le nom `PARTNERS_BUILD_SHA`. C'est la SEULE vérité
 * d'un atterrissage (`pnpm deploy:verify`, `docs/PROTOCOLE-FUSION.md` pas 7). Sans sha injecté —
 * build du poste —, l'en-tête n'est pas posé : il n'affirme rien plutôt qu'une valeur inventée. Un
 * sha mal formé fait échouer le build : servir une valeur fausse serait pire que n'en servir aucune.
 */
import type { NextConfig } from 'next';
import { ENTETES_STATIQUES } from './src/server/securite/entetes';

export const ENTETE_DE_BUILD = 'x-partners-build-sha';

export function enteteDeBuild(): { key: string; value: string }[] {
  const sha = process.env.PARTNERS_BUILD_SHA ?? '';
  if (sha === '') return [];
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('PARTNERS_BUILD_SHA doit être un sha de 40 caractères hexadécimaux minuscules');
  }
  return [{ key: ENTETE_DE_BUILD, value: sha }];
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          ...ENTETES_STATIQUES.map(({ key, value }) => ({ key, value })),
          ...enteteDeBuild(),
        ],
      },
    ];
  },
};

export default nextConfig;
