/**
 * CPL-T13 — l'horloge INJECTÉE du domaine (REQ-QA-027, pour sa part « le domaine reçoit une
 * Clock » ; `docs/CONVENTIONS.md` §3).
 *
 * Le domaine ne lit jamais l'heure de la machine : il reçoit une `Horloge` et lui demande
 * `maintenant()`. Un calcul qui dépend de la minute où il tourne ne se rejoue pas ; un calcul qui
 * reçoit son instant se rejoue à l'identique, en test comme en production.
 *
 * DEUX IMPLÉMENTATIONS, ET UNE SEULE ICI.
 *   — `horlogeFigee(instant)` : ici, pure — le test, le rejeu, le calcul « à l'instant t ».
 *   — `horlogeSysteme` : HORS du domaine (`src/lib/horloge.ts`), seul endroit du code qui lit
 *     l'heure de la machine.
 *
 * Un `Instant` est un nombre ENTIER de millisecondes depuis l'époque Unix, en UTC : c'est la forme
 * de stockage (`timestamptz`), et la seule que le domaine échange. L'heure de Paris est une VUE
 * calculée (`paris.ts`), jamais une valeur stockée.
 */
import { ErreurTemps } from './erreurs';

/** Millisecondes UTC entières depuis 1970-01-01T00:00:00Z. */
export type Instant = number;

export interface Horloge {
  maintenant(): Instant;
}

/** Refuse ce qui n'est pas un nombre entier de millisecondes (fraction, NaN, infini). */
export function verifierInstant(instant: Instant): Instant {
  if (!Number.isInteger(instant)) {
    throw new ErreurTemps('instant_invalide', `${instant} n'est pas un nombre entier de ms`);
  }
  return instant;
}

/** Une horloge arrêtée sur `instant` : chaque lecture rend le même instant. */
export function horlogeFigee(instant: Instant): Horloge {
  const fige = verifierInstant(instant);
  return { maintenant: () => fige };
}
