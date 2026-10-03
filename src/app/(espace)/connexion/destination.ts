/**
 * UX-P1-04 — la redirection BORNÉE après la connexion (GOV-115, contraintes W19) : un lien
 * d'apporteur consommé mène en une action vers « / », ou vers l'URL demandée quand elle est un
 * chemin RELATIF de l'espace. Tout le reste mène à l'accueil : une autre origine (`//`, un schéma,
 * une barre oblique inverse), la console, l'API, la connexion elle-même (pas de boucle), ou un chemin
 * démesuré.
 *
 * Les SEGMENTS POINTÉS (`..`, `.`, et leurs formes encodées `%2e`) sont RÉSOLUS avant l'exclusion
 * (lentille sécurité, #612) : le navigateur normalise le `Location`, et « /x/../api/y » mènerait à
 * l'API. L'exclusion se juge donc sur le chemin résolu, décodé, en minuscules — et c'est le chemin
 * résolu qui est rendu.
 */
const LONGUEUR_MAX = 512;
const HORS_ESPACE = ['/console', '/api', '/connexion'];
const ORIGINE = 'https://espace.invalid';

export function destinationBornee(suite: string | null | undefined): string {
  if (typeof suite !== 'string' || suite.length === 0 || suite.length > LONGUEUR_MAX) return '/';
  // Un seul « / » en tête, puis rien qui change d'origine : ni « // », ni une barre oblique suivie
  // d'une barre oblique inverse, ni caractère de contrôle ou d'espacement que le navigateur
  // pourrait réinterpréter.
  if (!/^\/(?![/\\])[^\s\\]*$/.test(suite)) return '/';
  let u: URL;
  let chemin: string;
  try {
    u = new URL(suite, ORIGINE);
    chemin = decodeURIComponent(u.pathname).toLowerCase();
  } catch {
    return '/';
  }
  if (u.origin !== ORIGINE) return '/';
  if (HORS_ESPACE.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return '/';
  return u.pathname + u.search + u.hash;
}
