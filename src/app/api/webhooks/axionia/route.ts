/**
 * `POST /api/webhooks/axionia` — la réception des événements d'axionia (SEC-06, REQ-SEC-010,
 * REQ-DM-036).
 *
 * Tout le chemin — secret, borne du corps, signature, enveloppe, inscription — vit dans
 * `src/server/integrations/axionia/reception.ts`. Cette route ne fait que lui passer l'environnement
 * du processus, lu À CHAQUE APPEL, l'horloge, la base, l'alerteur plafonné du processus, et le
 * travail de fond confié à `after()` : il s'exécute APRÈS la réponse, jamais dans la requête.
 *
 * L'alerte s'écrit au journal en `error` : la porte, un motif fermé, et le nombre de refus tus
 * depuis la précédente. Jamais un en-tête, jamais un extrait du corps.
 */
import { after } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { horlogeSysteme } from '../../../../lib/horloge';
import { creerJournal } from '../../../../lib/logger';
import {
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../../../server/integrations/axionia/reception';
import { depotDuTravail, passerLeTravail } from '../../../../server/queue/workers/evenement-recu';
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
    declencher: () =>
      after(async () => {
        try {
          await passerLeTravail({
            depot: depotDuTravail(prisma),
            // Aucun effet métier en phase 0 : les tâches de commission s'y brancheront.
            dispatch: async () => undefined,
            maintenant: () => new Date(horlogeSysteme.maintenant()),
          });
        } catch (erreur) {
          journal.error('travail_evenements_recus_en_echec', {
            nom: erreur instanceof Error ? erreur.name : 'Erreur',
          });
        }
      }),
  });
}

/** `GET` : 405, dit par la route ; les autres verbes reçoivent le 405 du cadre. */
export function GET(): Response {
  return new Response('method_not_allowed', { status: 405, headers: { Allow: 'POST' } });
}
