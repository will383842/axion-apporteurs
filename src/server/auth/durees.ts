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
} as const satisfies Record<string, Duree>;
