/**
 * L'anonymisation planifiée de la trace des demandes de droits du contact (DM-60, REQ-JUR-065,
 * partners/ADR-0031) — un passage du lanceur (GOV-137).
 *
 * Cinq ans après la clôture de la demande (`DROITS_CONTACT_TRACE_ANS`, `retention.ts`), ou après sa
 * réception si elle n'a jamais été close — une demande sans réponse au bout de cinq ans est une
 * anomalie, et la minimisation l'emporte —, `attribution_id` passe à NULL et `trace_anonymisee_at`
 * date l'anonymisation, en une seule instruction. La ligne RESTE comme preuve du traitement (droit,
 * donnée visée, issue, dates au mois), sans lien à une personne. Dans cette même instruction, la BASE
 * ramène les dates de la trace au premier jour de leur mois UTC, et `trace_anonymisee_at` au premier
 * du mois UTC de l'instant passé ici (DM-68, partners/ADR-0032) : la tâche n'a rien à tronquer.
 *
 * Idempotente, lue sur `trace_anonymisee_at` : une trace anonymisée n'est ni relue ni réécrite. Une
 * demande qui porte encore la valeur d'une rectification n'est pas prise : la base la refuserait
 * (CHECK `demandes_droits_contact_anonymisee_sans_valeur`) et ferait tomber toute l'instruction ; le
 * filet de DM-59 (`droits_contact_purger`) l'efface, et le passage suivant l'anonymise. La base tient
 * le reste : la date est liée au lien vidé (CHECK), la protection d'ajout seul n'admet que la purge du
 * lien vers NULL, l'écriture unique de la date et la troncature au mois qu'elle fait elle-même.
 * Aucun événement de journal n'est écrit.
 */
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';

/** La limite : une demande close (ou reçue, jamais close) à elle ou avant a passé ses cinq ans. */
export function limiteDAnonymisation(maintenant: Date): Date {
  const limite = new Date(maintenant.getTime());
  limite.setUTCFullYear(limite.getUTCFullYear() - SEUILS.DROITS_CONTACT_TRACE_ANS.valeur);
  return limite;
}

export async function anonymiserLesTracesDesDroits(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ anonymisees: number }> {
  const limite = limiteDAnonymisation(maintenant);
  const { count } = await prisma.demandeDroitContact.updateMany({
    where: {
      traceAnonymiseeAt: null,
      valeurChiffree: null,
      // COALESCE(traitee_at, recue_at) <= limite, écrit en deux branches exclusives.
      OR: [{ traiteeAt: { lte: limite } }, { traiteeAt: null, recueAt: { lte: limite } }],
    },
    data: { attributionId: null, traceAnonymiseeAt: maintenant },
  });
  return { anonymisees: count };
}
