/**
 * CPL-T13 — `horlogeSysteme` : la SEULE lecture de l'heure de la machine de tout le code (REQ-QA-027).
 *
 * Elle vit hors de `src/domain/`, qui est pur et reçoit son horloge en argument
 * (`src/domain/temps/horloge.ts`). La couche applicative (route, action serveur, cron) la passe au
 * domaine ; un test lui substitue `horlogeFigee(instant)`.
 */
import type { Horloge } from '../domain/temps/horloge';

export const horlogeSysteme: Horloge = { maintenant: () => Date.now() };
