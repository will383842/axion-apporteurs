/**
 * JUR-T58 (REQ-JUR-031) — L'EFFET d'une anomalie confirmée sur l'apporteur : le POINT D'ENTRÉE UNIQUE.
 *
 * Deux effets seulement (arbitrage de la coordination, #319, 6037567525 ; juriste, #474, 6037559862) :
 *   — l'ANNULATION de l'attribution pour FABRICATION de la déclaration (art. 3.3, « fraude de
 *     l'Apporteur »), par DÉLÉGATION à l'annulation pour fraude de DM-71 (#806, 6039852465), qui rejuge
 *     le droit, écrit la transition `fraude_etablie` et notifie `decision_attribution` avec le motif, les
 *     faits retenus et la voie de contestation. Les commandes signées et les commissions acquises avant
 *     l'annulation restent dues : ce module ne touche ni commande ni commission ;
 *   — la SUSPENSION des nouveaux dépôts (art. 3.7 al. 3), par DÉLÉGATION à `poserUneSuspension` de
 *     SEC-15, qui rejuge le droit et la notifie avec ses faits et sa voie de contestation.
 * L'automatisation seule ne fonde que la suspension, jamais l'annulation : la personne qui décide le juge.
 *
 * LES RÈGLES (juriste, points (2) et (4) ; règle du rattrapage 85) :
 *   — l'effet est décidé par une PERSONNE de la console, jamais par un traitement automatisé ; son
 *     auteur est l'acteur de l'événement écrit par le module délégué ;
 *   — l'anomalie est de SINCÉRITÉ, CONFIRMÉE et rattachée à un apporteur ; sinon un refus nommé, rien
 *     n'est écrit ;
 *   — l'effet est écrit dans SA PROPRE transaction, DISTINCTE de la clôture de l'anomalie : ce module
 *     ne clôt aucune anomalie, et il ouvre lui-même sa transaction ;
 *   — l'anomalie n'est jamais rendue à l'espace : seuls l'effet et son motif le sont ;
 *   — les faits notifiés passent le juge unique des faits saisis (un lien est refusé à la saisie).
 */
import type { PrismaClient } from '@prisma/client';
import { annulerApresConfirmation } from '../attribution/annuler-apres-confirmation';
import { poserUneSuspension } from '../apporteur/suspension';
import type { ClesPii } from '../securite/pii';

/** Les effets admis, FERMÉS. Aucune retenue de versement (elle relève de l'auto-parrainage). */
export const EFFETS_D_UNE_ANOMALIE = ['annulation_pour_fabrication', 'suspension'] as const;
export type EffetDUneAnomalie = (typeof EFFETS_D_UNE_ANOMALIE)[number];

export type RefusDeLEffet =
  | 'decideur_humain_absent'
  | 'anomalie_inconnue'
  | 'anomalie_hors_motif'
  | 'anomalie_non_confirmee'
  | 'sans_attribution';

export class ErreurEffetDUneAnomalie extends Error {
  constructor(readonly motif: RefusDeLEffet) {
    super(`effet d'une anomalie : ${motif}`);
    this.name = 'ErreurEffetDUneAnomalie';
  }
}

/** La personne de la console qui décide ; son droit est relu en base par le module délégué. */
export type DecideurDeLaConsole = { readonly par: 'utilisateur_console'; readonly id: string };

type Commun = {
  readonly anomalieId: string;
  readonly acteur: DecideurDeLaConsole;
  readonly maintenant: Date;
};

export type DecisionDEffet =
  | (Commun & { readonly effet: 'annulation_pour_fabrication' })
  | (Commun & {
      readonly effet: 'suspension';
      /** Les faits notifiés, saisis par la personne qui décide (art. 3.7 al. 3). */
      readonly faitsTexte: string;
      readonly cleIdempotence: string;
    });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applique l'effet décidé, dans SA transaction. Le décideur humain est exigé AVANT toute transaction ;
 * l'anomalie est relue sous verrou : un refus n'écrit rien.
 */
export async function appliquerLEffetDUneAnomalie(
  prisma: PrismaClient,
  d: DecisionDEffet,
  cles: ClesPii
): Promise<void> {
  const acteur = d.acteur as { par?: unknown; id?: unknown } | undefined;
  if (
    acteur?.par !== 'utilisateur_console' ||
    typeof acteur.id !== 'string' ||
    !UUID.test(acteur.id)
  ) {
    throw new ErreurEffetDUneAnomalie('decideur_humain_absent');
  }
  const decideur = { id: acteur.id };
  await prisma.$transaction(async (tx) => {
    const [a] = await tx.$queryRaw<
      { type: string; statut: string; apporteur_id: string | null; attribution_id: string | null }[]
    >`
      SELECT type::text AS type, statut::text AS statut, apporteur_id::text AS apporteur_id,
             attribution_id::text AS attribution_id
      FROM anomalies WHERE id = ${d.anomalieId}::uuid FOR UPDATE`;
    if (a === undefined || a.apporteur_id === null) {
      throw new ErreurEffetDUneAnomalie('anomalie_inconnue');
    }
    if (a.type !== 'sincerite') throw new ErreurEffetDUneAnomalie('anomalie_hors_motif');
    if (a.statut !== 'confirmee') throw new ErreurEffetDUneAnomalie('anomalie_non_confirmee');
    if (d.effet === 'annulation_pour_fabrication') {
      if (a.attribution_id === null) throw new ErreurEffetDUneAnomalie('sans_attribution');
      await annulerApresConfirmation(tx, {
        attributionId: a.attribution_id,
        exception: 'fraude',
        anomalieId: d.anomalieId,
        acteur: decideur,
        maintenant: d.maintenant,
      });
      return;
    }
    await poserUneSuspension(tx, {
      apporteurId: a.apporteur_id,
      faits: { motif: 'gele_fraude', anomalie: { id: d.anomalieId, confirmeeParUnHumain: true } },
      acteur: decideur,
      maintenant: d.maintenant,
      faitsTexte: d.faitsTexte,
      cleIdempotence: d.cleIdempotence,
      cles,
    });
  });
}
