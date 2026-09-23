/**
 * L'attrape-tout de la frontière axionia (REQ-SEC-012) : un chemin qui n'existe pas sous
 * `/api/integrations/axionia/` rend le MÊME 404 qu'une route existante appelée sans jeton. Sans lui,
 * la page 404 de Next distinguerait les deux, et l'on énumérerait les routes de la frontière.
 * L'appel est journalisé comme les autres.
 */
import { gestionnaires } from '../../../../../server/integrations/axionia/api-entrante';

const g = gestionnaires('inconnue');

export const GET = g.GET;
export const HEAD = g.HEAD;
export const POST = g.POST;
export const PUT = g.PUT;
export const PATCH = g.PATCH;
export const DELETE = g.DELETE;
export const OPTIONS = g.OPTIONS;
