/**
 * `GET /api/readyz` — l'instance sait-elle servir ? (QA-T04, REQ-QA-020). 503 si l'environnement,
 * la base, le cache ou une migration en attente est en défaut, et la réponse nomme le sous-système.
 * C'est la sonde du `HEALTHCHECK` de l'image et de la plateforme — jamais `livez`.
 */
import { DOSSIER_MIGRATIONS, repondreDisponibilite } from '../../../server/sante/disponibilite';

export async function GET(): Promise<Response> {
  return repondreDisponibilite({ env: process.env, dossierMigrations: DOSSIER_MIGRATIONS });
}
