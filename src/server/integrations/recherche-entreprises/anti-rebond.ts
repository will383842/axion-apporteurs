/**
 * L'anti-rebond de l'autocomplétion — INT-T09 (REQ-INT-020 : « debounce 300 ms »).
 *
 * Il vit du côté de celui qui tape : une rafale de frappes ne produit qu'UN appel au mandataire,
 * 300 ms après la dernière. Le composant de saisie, qui appartient à la tâche de l'écran de dépôt,
 * l'importe d'ici — la durée n'est écrite qu'une fois, dans `parametres.ts`.
 *
 * Il ne dépend que de `setTimeout`/`clearTimeout`, présents au navigateur comme au serveur, et que
 * les tests remplacent par des minuteries simulées.
 */
import { PARAMETRES } from './parametres';

export function creerAntiRebond<A extends unknown[]>(
  appeler: (...args: A) => void,
  delaiMs: number = PARAMETRES.antiRebondMs.valeur
): (...args: A) => void {
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (minuterie !== null) clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      minuterie = null;
      appeler(...args);
    }, delaiMs);
  };
}
