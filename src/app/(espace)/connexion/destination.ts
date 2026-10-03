/**
 * UX-P1-04 — la redirection BORNÉE après la connexion (GOV-115, contraintes W19) : un lien
 * d'apporteur consommé mène en une action vers « / », ou vers l'URL demandée quand elle est un
 * chemin RELATIF de l'espace. Tout le reste mène à l'accueil : une autre origine (`//`, un schéma,
 * une barre oblique inverse), la console, l'API, la connexion elle-même (pas de boucle), ou un chemin
 * démesuré.
 */
const LONGUEUR_MAX = 512;
const HORS_ESPACE = ['/console', '/api', '/connexion'];

export function destinationBornee(suite: string | null | undefined): string {
  if (typeof suite !== 'string' || suite.length === 0 || suite.length > LONGUEUR_MAX) return '/';
  // Un seul « / » en tête, puis rien qui change d'origine : ni « // », ni « /\ », ni caractère de
  // contrôle ou d'espacement que le navigateur pourrait réinterpréter.
  if (!/^\/(?![/\\])[^\s\\]*$/.test(suite)) return '/';
  const chemin = suite.split(/[?#]/)[0]!;
  if (HORS_ESPACE.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return '/';
  return suite;
}
