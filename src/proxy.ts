/**
 * Le proxy de Partners (SEC-02, REQ-SEC-029) — `src/proxy.ts`, le nom que Next 16 impose
 * (`middleware.ts` est déprécié ; runtime Node.js, l'option `runtime` y est interdite).
 *
 * À CHAQUE REQUÊTE QU'IL VOIT : un nonce neuf, la CSP construite autour de lui, posée
 *   — sur la RÉPONSE, pour le navigateur ;
 *   — sur les en-têtes de REQUÊTE transmis, où Next la lit pour poser le nonce sur ses propres
 *     scripts (avec `x-nonce`, pour un composant qui en aurait besoin) ;
 * plus `Cache-Control: private, no-store` sur la réponse. Les en-têtes que la requête entrante
 * porterait sous ces noms sont ÉCRASÉS, jamais repris.
 *
 * ⚠️ CE PROXY N'EST PAS UNE GARDE D'AUTHENTIFICATION. Un `matcher` modifié ou une action serveur
 * déplacée le contourne en silence (doc Next 16, « Execution order ») : l'accès se vérifie dans
 * chaque action et chaque route, jamais ici seulement.
 *
 * Le `matcher` n'exclut que les ressources statiques immuables — `no-store` y tuerait leur cache.
 * Il n'exclut NI `api` NI les préchargements : REQ-SEC-029 dit « toutes les routes ».
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CACHE_CONTROL, genererNonce, politiqueDeContenu } from './server/securite/entetes';

export function proxy(requete: NextRequest): NextResponse {
  // Tiré DANS la fonction : un nonce tiré au chargement du module serait le même pour toutes les
  // réponses, donc devinable après la première.
  const nonce = genererNonce();
  const csp = politiqueDeContenu({ nonce, developpement: process.env.NODE_ENV === 'development' });

  const entetesRequete = new Headers(requete.headers);
  entetesRequete.set('x-nonce', nonce);
  entetesRequete.set('Content-Security-Policy', csp);

  const reponse = NextResponse.next({ request: { headers: entetesRequete } });
  reponse.headers.set('Content-Security-Policy', csp);
  reponse.headers.set('Cache-Control', CACHE_CONTROL);
  return reponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
