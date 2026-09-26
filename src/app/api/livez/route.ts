/**
 * `GET /api/livez` — le serveur répond (QA-T04, REQ-QA-020). Rien n'est consulté : la vie du
 * serveur n'est pas sa disponibilité, qui se lit sur `/api/readyz`.
 */
import { repondreVie } from '../../../server/sante/disponibilite';

export async function GET(): Promise<Response> {
  return repondreVie();
}
