/**
 * L'INSTANT D'UNE PASSE DE TÉMOIN, DÉRIVÉ DU REGISTRE RÉEL — une seule définition (RM-01).
 *
 * Les témoins qui confrontent le vrai `docs/tasks.json` à la garde lui passent un instant : la garde
 * refuse une attestation dont `fusionneeAt` lui est postérieure (`attestation_date_future`). Figé à
 * une heure du jour, cet instant a fait rougir deux témoins dès qu'un rattrapage a inscrit une fusion
 * plus tardive. Il vaut donc un jour après la plus récente fusion que le registre atteste, ou après
 * `plancher` si le témoin fabrique lui-même une fusion plus récente. Aucun témoin ne lit l'horloge :
 * c'est la donnée qui fixe l'instant, et deux passes sur le même registre jugent au même instant.
 */
import { readFileSync } from 'node:fs';

const UN_JOUR = 86_400_000;

export function instantDuRegistre(plancher: string | null = null): number {
  const taches = (
    JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
      taches: { attestation?: { fusionneeAt?: string } | null }[];
    }
  ).taches;
  const instants = taches.map((t) => Date.parse(t.attestation?.fusionneeAt ?? '') || 0);
  if (plancher !== null) instants.push(Date.parse(plancher));
  return Math.max(0, ...instants) + UN_JOUR;
}
