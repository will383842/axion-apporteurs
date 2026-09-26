/**
 * `POST /api/mcp` — la porte de l'adaptateur MCP fédéré `partners` (INT-T11, REQ-INT-026).
 *
 * Tout le chemin — secret, limiteur avant la serrure, serrure à temps constant, JSON-RPC — vit dans
 * `src/server/mcp/porte.ts`. Cette route ne fait que lui passer l'environnement du processus, lu À
 * CHAQUE APPEL, et le limiteur de production.
 *
 * ⚠️ LE LIMITEUR DE PRODUCTION REFUSE TOUT, et c'est l'état voulu tant que le registre de débit
 * (`src/server/securite/rate-limit.ts`) ne porte pas de compteur pour cette porte : aucune exigence
 * ne chiffre encore sa limite ni sa conduite sur panne, et une limite ne s'invente pas. La porte
 * rend donc 503 même avec son secret. Le registre est vide de toute façon (manifeste refusé
 * `tools : vide`) : il n'y a rien à servir avant le premier outil.
 */
import { horlogeSysteme } from '../../../lib/horloge';
import { limiteurNonDeclare, traiterAppelMcp } from '../../../server/mcp/porte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(requete: Request): Promise<Response> {
  return traiterAppelMcp(requete, {
    environnement: process.env,
    limiteur: limiteurNonDeclare,
    maintenantMs: horlogeSysteme.maintenant(),
  });
}

/** Tout autre verbe : 405, dit par la route elle-même plutôt que laissé au cadre. */
export function GET(): Response {
  return new Response('method_not_allowed', { status: 405, headers: { Allow: 'POST' } });
}
