/**
 * Les durées de CONSERVATION — un SOUS-MODULE de la SSOT (partners/ADR-0022 §12 ; condition d'A02 au
 * rattrapage 53). Chaque durée a la forme `Seuil` (valeur, unité, source, renvois, date de
 * vérification) ; `SEUILS` (`ssot.ts`) les ÉTALE, l'accès reste unique (`SEUILS.X`) et la garde
 * `ssot:seuils` les juge comme les autres. Une durée vit ICI ou dans `ssot.ts`, jamais aux deux
 * endroits.
 *
 * HYP-RGPD-RETENTION : valeurs PROVISOIRES, à confirmer par Williams (il n'y a pas de DPO sur le
 * projet, décision du 2026-09-03) ; un test HYP rougit si l'une change sans décision datée.
 */
import type { Seuil } from './ssot';

const LE = '2026-10-02';

export const DUREES_DE_RETENTION = {
  /** REQ-SEC-030 : le contact d'une attribution libérée (invalidée, perdue, expirée, périmée). */
  CONTACT_PURGE_APRES_LIBERATION_JOURS: {
    valeur: 90,
    unite: 'jours',
    source: 'REQ-SEC-030, HYP-RGPD-RETENTION (valeur provisoire, à confirmer par Williams)',
    renvois: [],
    verifieLe: LE,
  },
  /** REQ-SEC-030 : le contact d'une attribution convertie, compté depuis le dernier contact. */
  CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS: {
    valeur: 1095,
    unite: 'jours',
    source: 'REQ-SEC-030, HYP-RGPD-RETENTION (valeur provisoire, à confirmer par Williams)',
    renvois: [],
    verifieLe: LE,
  },
} as const satisfies Record<string, Seuil>;
