/**
 * La tolérance aux fautes de l'autocomplétion — INT-T09 (REQ-UX-020).
 *
 * CE QUE CE MODULE FAIT : il ORDONNE les suggestions du tiers (ou du cache) selon leur distance de
 * Levenshtein à la saisie, la ville en second critère, sans jamais en retirer une. Une raison
 * sociale à distance ≤ 2 de la saisie est donc proposée, et proposée devant les lointaines.
 *
 * CE QU'IL NE FAIT PAS, et c'est mesuré plutôt que supposé : il ne FABRIQUE pas de candidat. Le
 * tiers ne corrige pas les fautes de frappe — le 2026-09-19, « decathlom » rendait 0 résultat et
 * « danoen » ne rendait pas DANONE. Une faute que le tiers n'absorbe pas ne peut donc être
 * rattrapée ici ; le parcours offre alors « je ne trouve pas mon entreprise » (`repli.ts`).
 *
 * La distance se mesure sur des textes NORMALISÉS (casse, accents, ponctuation) : un accent oublié
 * n'est pas une faute. Elle compare la saisie au DÉBUT du nom de même longueur — c'est une
 * autocomplétion, l'apporteur n'a pas fini de taper — et au nom entier, et garde la plus petite.
 */
import type { Suggestion } from './schemas';

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Levenshtein classique (insertion, suppression, substitution), en deux lignes de mémoire. */
export function distanceDeLevenshtein(a: string, b: string): number {
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const courante = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (precedente[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      courante.push(Math.min((precedente[j] ?? 0) + 1, (courante[j - 1] ?? 0) + 1, substitution));
    }
    precedente = courante;
  }
  return precedente[b.length] ?? 0;
}

function distanceALaSaisie(saisie: string, nom: string): number {
  const n = normaliser(nom);
  return Math.min(
    distanceDeLevenshtein(saisie, n),
    distanceDeLevenshtein(saisie, n.slice(0, saisie.length))
  );
}

/**
 * Ordonne sans retirer : distance croissante, puis la ville quand elle est donnée, puis l'ordre du
 * tiers (tri stable).
 */
export function classerSuggestions(
  q: string,
  ville: string | null,
  suggestions: readonly Suggestion[]
): Suggestion[] {
  const saisie = normaliser(q);
  const villeNormalisee = ville === null ? null : normaliser(ville);
  const cle = (s: Suggestion) => ({
    distance: distanceALaSaisie(saisie, s.nom),
    horsVille: villeNormalisee !== null && normaliser(s.commune ?? '') === villeNormalisee ? 0 : 1,
  });
  return suggestions
    .map((s, rang) => ({ s, rang, ...cle(s) }))
    .sort((x, y) => x.distance - y.distance || x.horsVille - y.horsVille || x.rang - y.rang)
    .map((x) => x.s);
}
