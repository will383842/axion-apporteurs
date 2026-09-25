/**
 * DM-06 — le snapshot de candidature que porte l'apporteur (REQ-DM-035, REQ-QA-035).
 *
 * Il est lu dans la charge de l'événement `candidature.recue` émis par axionia, qui garde le
 * tunnel (HYP-E1-7), et il est FIGÉ : Partners ne le recalcule, ne le complète ni ne le
 * réinterprète jamais.
 *
 *   — LE SCORE (total, parts, version du barème) est calculé UNE fois, par le producteur. Il est
 *     repris tel quel — même si ses parts ne font pas son total : ce n'est pas à Partners d'en juger.
 *   — `sourceCanal` est une CHAÎNE TRANSPORTÉE FIGÉE (HYP-DM06-SOURCE-CANAL) : stockée telle que
 *     reçue, sans normalisation, `SOURCE_CANAL_LONGUEUR_MAX` caractères au plus. Au-delà, elle
 *     n'est PAS tronquée — une chaîne tronquée est une valeur que personne n'a émise : elle est
 *     stockée nulle, et l'écart est RENDU à l'appelant, qui le journalise avec sa LONGUEUR, jamais
 *     sa valeur. Sa traduction en canal (`CanalCandidature`) n'est pas ici.
 *
 * ENTRÉE ZOD (`docs/CONVENTIONS.md` §9) : une charge incomplète ou mal typée est REFUSÉE en nommant
 * le champ ; aucun champ n'est complété (RM-03).
 */
import { z } from 'zod';

/**
 * La borne de `sourceCanal` (HYP-DM06-SOURCE-CANAL). La colonne `@db.VarChar(…)` du schéma porte
 * la même : une spec tient les deux égales.
 */
export const SOURCE_CANAL_LONGUEUR_MAX = 512;

const json: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(json)])
);

/** Les champs de la charge `candidature.recue` que le snapshot retient — ni plus, ni moins. */
export const chargeCandidature = z.object({
  candidatureId: z.string().uuid(),
  reponsesJson: z.record(json),
  scoreInitial: z.number().int(),
  scorePartsJson: z.record(z.number().int()),
  scoreBaremeVersion: z.string().min(1),
  sourceCanal: z.string().nullable(),
  parrainCodeCapture: z.string().nullable(),
});

export type SnapshotCandidature = z.infer<typeof chargeCandidature>;

export interface EcartSourceCanal {
  readonly code: 'source_canal_hors_borne';
  /** La longueur reçue, et elle seule : la valeur ne se journalise jamais. */
  readonly longueur: number;
}

export function snapshotDeCandidature(charge: unknown): {
  snapshot: SnapshotCandidature;
  ecarts: EcartSourceCanal[];
} {
  const lu = chargeCandidature.safeParse(charge);
  if (!lu.success) {
    const champs = lu.error.issues.map((i) => i.path.join('.') || '(racine)').join(', ');
    throw new TypeError(`charge candidature.recue refusée : ${champs}`);
  }
  const snapshot = lu.data;
  // Compter en POINTS DE CODE, comme `varchar(n)` de PostgreSQL — pas en unités UTF-16.
  const longueur = snapshot.sourceCanal === null ? 0 : [...snapshot.sourceCanal].length;
  if (longueur > SOURCE_CANAL_LONGUEUR_MAX) {
    return {
      snapshot: { ...snapshot, sourceCanal: null },
      ecarts: [{ code: 'source_canal_hors_borne', longueur }],
    };
  }
  return { snapshot, ecarts: [] };
}
