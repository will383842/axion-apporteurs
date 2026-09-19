/**
 * Configuration Next de Partners (SEC-02, REQ-SEC-029).
 *
 * `headers()` pose les en-têtes de sécurité STATIQUES sur toutes les routes — `'/(.*)'`, ressources
 * statiques comprises, que le proxy ne voit pas. La liste vient de `src/server/securite/entetes.ts`
 * (source unique) ; la CSP, elle, vit dans `src/proxy.ts`, parce qu'elle porte un nonce par requête.
 */
import type { NextConfig } from 'next';
import { ENTETES_STATIQUES } from './src/server/securite/entetes';

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/(.*)', headers: ENTETES_STATIQUES.map(({ key, value }) => ({ key, value })) },
    ];
  },
};

export default nextConfig;
