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
import { PrismaClient, TypeEvenementRecu } from '@prisma/client';
import { sourceAleatoireSysteme } from '../../../../domain/apporteur/identifiants';
import { lireEnvironnement, lireTrousseaux } from '../../../../lib/env';
import { horlogeSysteme } from '../../../../lib/horloge';
import { creerJournal } from '../../../../lib/logger';
import {
  depotDeReception,
  recevoirEvenementAxionia,
} from '../../../../server/integrations/axionia/reception';
import {
  clientCoordonnees,
  PREFIXE_ATTENTE_COORDONNEES,
  traiterCandidatureRecue,
} from '../../../../server/integrations/axionia/candidature-recue';
import {
  aiguiller,
  depotDuTravail,
  passerLeTravail,
  reprendreLesAttentes,
  reprendreLesTraitants,
  type EvenementATraiter,
  type Traitants,
} from '../../../../server/queue/workers/evenement-recu';
import { clesPii } from '../../../../server/securite/pii';
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
          // Un seul type a un traitant aujourd'hui : la candidature reçue (INT-T26). Les autres
          // attendent `traitant:<type>`, jamais `traite` (INT-T43) ; brancher un traitant ici
          // suffit pour qu'au passage suivant, ses événements en attente lui soient redonnés.
          const traitants: Traitants = {
            [TypeEvenementRecu.candidature_recue]: (recu) => traiterCandidature(prisma, recu),
          };
          const reprendreCoordonnees = reprendreLesAttentes(prisma, PREFIXE_ATTENTE_COORDONNEES);
          const reprendreTraitants = reprendreLesTraitants(prisma, traitants);
          await passerLeTravail({
            depot: depotDuTravail(prisma),
            dispatch: aiguiller(traitants),
            reprendre: async () => (await reprendreCoordonnees()) + (await reprendreTraitants()),
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

/**
 * Le traitant de la candidature reçue. Les secrets sont relus À CHAQUE traitement, par le même juge que le démarrage :
 * un refus lève (l'événement passe `en_erreur` sous le NOM de l'erreur, jamais un secret).
 */
async function traiterCandidature(prisma: PrismaClient, recu: EvenementATraiter): Promise<void> {
  const lu = lireEnvironnement(process.env);
  if (!lu.ok) throw new Error('environnement_refuse');
  const rotation = lireTrousseaux(process.env, horlogeSysteme.maintenant());
  if (!rotation.ok) throw new Error('environnement_refuse');
  await traiterCandidatureRecue(prisma, recu, {
    tirer: clientCoordonnees({
      urlAxionia: process.env['AXIONIA_BASE_URL'],
      secretRelecture: lu.env.AXIONIA_RELECTURE_SECRET,
      trousseauEmission: rotation.trousseaux.AXIONIA_WEBHOOK_SECRET,
      appeler: fetch,
      maintenantMs: () => horlogeSysteme.maintenant(),
    }),
    cles: clesPii(process.env),
    maintenant: () => new Date(horlogeSysteme.maintenant()),
    aleatoire: sourceAleatoireSysteme,
  });
}

/** `GET` : 405, dit par la route ; les autres verbes reçoivent le 405 du cadre. */
export function GET(): Response {
  return new Response('method_not_allowed', { status: 405, headers: { Allow: 'POST' } });
}
