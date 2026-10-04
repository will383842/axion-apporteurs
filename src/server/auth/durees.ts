/**
 * durees.ts — les durées de l'authentification de l'espace apporteur (SEC-03).
 *
 * Une durée, une source, une date (RM-10) : la forme `{ valeur, source, verifieLe }` est celle de
 * la source unique des seuils. Ce module y migrera quand elle existera ; jusque-là, c'est ICI et
 * nulle part ailleurs qu'une durée d'authentification s'écrit. `valeur` est en millisecondes.
 */

export interface Duree {
  readonly valeur: number;
  readonly source: string;
  readonly verifieLe: string;
}

export const DUREES_AUTH = {
  /** REQ-SEC-001 : « Le lien magique de connexion a un TTL de 15 minutes ». */
  lienMagiqueMs: { valeur: 15 * 60 * 1000, source: 'REQ-SEC-001', verifieLe: '2026-09-19' },
  /** REQ-SEC-003 : « La session est un cookie `__Host-` [...] de 30 jours » (HYP-E1-15). */
  sessionMs: { valeur: 30 * 24 * 60 * 60 * 1000, source: 'REQ-SEC-003', verifieLe: '2026-09-26' },
  /** REQ-SEC-004 : « un lien magique consommé depuis moins de 10 minutes » (le relèvement). */
  releveMs: { valeur: 10 * 60 * 1000, source: 'REQ-SEC-004', verifieLe: '2026-09-26' },
  /**
   * SEC-29 : la session de la CONSOLE est courte, sans « rester connecté ». Durée maximale et
   * inactivité PROPOSÉES par la tâche ; Williams les valide en séance groupée avant la fusion.
   */
  sessionConsoleMs: {
    valeur: 12 * 60 * 60 * 1000,
    source: 'SEC-29 (proposition, validation de Williams)',
    verifieLe: '2026-10-03',
  },
  inactiviteConsoleMs: {
    valeur: 30 * 60 * 1000,
    source: 'SEC-29 (proposition, validation de Williams)',
    verifieLe: '2026-10-03',
  },
  /**
   * SEC-29 (lentille sécurité, condition d) : la dernière vue d'une session de la console n'est
   * réécrite qu'au plus une fois par période, pour qu'une lecture ne devienne pas une écriture.
   */
  toucheVueConsoleMs: { valeur: 60 * 1000, source: 'SEC-29', verifieLe: '2026-10-03' },
  /**
   * SEC-30 : une invitation à la console non activée dans ce délai est expirée ; l'échéance se
   * dérive de `invitee_at`. Validée par Williams le 2026-10-03 (22h05 UTC).
   */
  invitationConsoleMs: {
    valeur: 72 * 60 * 60 * 1000,
    source: 'SEC-30 (validée par Williams le 2026-10-03)',
    verifieLe: '2026-10-03',
  },
} as const satisfies Record<string, Duree>;
