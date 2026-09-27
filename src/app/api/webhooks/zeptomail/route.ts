/**
 * `POST /api/webhooks/zeptomail` — les rebonds du relais de courriel (INT-T10, REQ-INT-023).
 *
 * Tout le chemin — secret, borne du corps, `Producer-Signature`, lecture de la charge, liste de
 * suppression — vit dans `src/server/integrations/zeptomail/rebonds.ts`. Cette route ne fait que lui
 * passer l'environnement du processus, lu À CHAQUE APPEL, l'horloge, la base, l'alerteur plafonné
 * du processus et le journal.
 *
 * ⚠️ UNE SONDE NON SIGNÉE REÇOIT 401. Notre producteur voisin, axionia, a mesuré le 2026-09-01 que
 * le relais interroge l'adresse AVANT de créer un webhook, sans signature, et qu'il faut un 200
 * pour que la création aboutisse — axionia rend donc 200 à une signature refusée. Cette route
 * applique REQ-SEC-010 (401), et la création du webhook côté relais peut s'y heurter : c'est un
 * geste à mesurer à la mise en service, consigné dans `docs/tiers/zeptomail.md` §8.
 */
import { PrismaClient } from '@prisma/client';
import { horlogeSysteme } from '../../../../lib/horloge';
import { creerJournal } from '../../../../lib/logger';
import {
  depotDesSuppressions,
  recevoirRebond,
} from '../../../../server/integrations/zeptomail/rebonds';
import { creerAlerteurPlafonne } from '../../../../server/securite/primitives-de-porte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let client: PrismaClient | null = null;
const journal = creerJournal();
const alerteur = creerAlerteurPlafonne((signal) => journal.error('alerte_porte', signal));

export function POST(requete: Request): Promise<Response> {
  client ??= new PrismaClient();
  return recevoirRebond(requete, {
    environnement: process.env,
    maintenantMs: horlogeSysteme.maintenant(),
    depot: depotDesSuppressions(client),
    alerteur,
    journal,
  });
}

/** `GET` : 405, dit par la route ; les autres verbes reçoivent le 405 du cadre. */
export function GET(): Response {
  return new Response('method_not_allowed', { status: 405, headers: { Allow: 'POST' } });
}
