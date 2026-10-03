/**
 * `POST /api/webhooks/axionia` — la réception des événements d'axionia (SEC-06, REQ-SEC-010,
 * REQ-DM-036).
 *
 * Tout le chemin — secret, borne du corps, signature, enveloppe, inscription — vit dans
 * `src/server/integrations/axionia/reception.ts`. Cette route ne fait que lui passer l'environnement
 * du processus, lu À CHAQUE APPEL, l'horloge, la base et l'alerteur plafonné du processus.
 *
 * AUCUN TRAVAIL DE FOND ICI (INT-T49). La route inscrit, et c'est tout : le passage des événements
 * reçus et la reprise des attentes appartiennent au lanceur des passages planifiés (GOV-137,
 * `pnpm taches:lancer`, chaque minute), qui les joue sous le verrou de la tâche. Une inscription
 * attend donc au plus le passage suivant ; aucun chemin d'appel ne joue le passage hors du lanceur.
 *
 * L'alerte s'écrit au journal en `error` : la porte, un motif fermé, et le nombre de refus tus
 * depuis la précédente. Jamais un en-tête, jamais un extrait du corps.
 */
import { PrismaClient } from '@prisma/client';
import { horlogeSysteme } from '../../../../lib/horloge';
import { creerJournal } from '../../../../lib/logger';
import {
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../../../server/integrations/axionia/reception';
import { creerAlerteurPlafonne } from '../../../../server/securite/primitives-de-porte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let client: PrismaClient | null = null;
const journal = creerJournal();
const alerteur = creerAlerteurPlafonne((signal) => journal.error('alerte_porte', signal));

export function POST(requete: Request): Promise<Response> {
  client ??= new PrismaClient();
  const prisma = client;
  return recevoirEvenementAxionia(requete, {
    environnement: process.env,
    maintenantMs: horlogeSysteme.maintenant(),
    depot: depotDeReception(prisma),
    alerteur,
    // Le lanceur prend l'inscription au passage suivant (INT-T49).
    declencher: () => undefined,
  });
}

/** `GET` : 405, dit par la route ; les autres verbes reçoivent le 405 du cadre. */
export function GET(): Response {
  return new Response('method_not_allowed', { status: 405, headers: { Allow: 'POST' } });
}
