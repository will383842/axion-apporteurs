/**
 * API 1 — `GET /api/integrations/axionia/attributions?siren=` (REQ-INT-014, REQ-SEC-012).
 *
 * Tout le chemin — liste d'adresses, jeton, débit, forme minimale, journal — vit dans
 * `src/server/integrations/axionia/api-entrante.ts`. Les SEPT méthodes sont exportées : une méthode
 * absente rendrait 405, et l'`OPTIONS` automatique de Next un en-tête `Allow`, deux façons de
 * confirmer que la route existe.
 */
import { gestionnaires } from '../../../../../server/integrations/axionia/api-entrante';

const g = gestionnaires('attributions');

export const GET = g.GET;
export const HEAD = g.HEAD;
export const POST = g.POST;
export const PUT = g.PUT;
export const PATCH = g.PATCH;
export const DELETE = g.DELETE;
export const OPTIONS = g.OPTIONS;
