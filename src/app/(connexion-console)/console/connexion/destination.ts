/**
 * SEC-29 — la redirection BORNÉE après la connexion de la console (point 3 de l'acceptance). Un lien
 * ou un code consommé mène en une action vers l'URL demandée seulement si elle est un chemin relatif
 * de la console (`/console/…`), et jamais vers la connexion elle-même (pas de boucle) ; sinon vers
 * `/console`, l'accueil tant que celui du rôle (UX-P1-16) n'existe pas.
 *
 * La même technique que la borne de l'espace (UX-P1-04, revue de la lentille sécurité) : le chemin
 * est lu par `new URL(…)` sur une origine fixe, puis jugé RÉSOLU (segments pointés), décodé et en
 * minuscules ; un encodage malformé mène à l'accueil, et c'est le chemin résolu qui est rendu.
 */
const LONGUEUR_MAX = 512;
const ACCUEIL = '/console';
const RACINE = '/console';
const CONNEXION = '/console/connexion';
const ORIGINE = 'https://console.invalid';

export function destinationConsoleBornee(suite: string | null | undefined): string {
  if (typeof suite !== 'string' || suite.length === 0 || suite.length > LONGUEUR_MAX)
    return ACCUEIL;
  // Un seul « / » en tête, puis rien qui change d'origine : ni « // », ni une barre oblique suivie
  // d'une barre oblique inverse, ni caractère de contrôle ou d'espacement.
  if (!/^\/(?![/\\])[^\s\\]*$/.test(suite)) return ACCUEIL;
  let u: URL;
  let chemin: string;
  try {
    u = new URL(suite, ORIGINE);
    chemin = decodeURIComponent(u.pathname).toLowerCase();
  } catch {
    return ACCUEIL;
  }
  if (u.origin !== ORIGINE) return ACCUEIL;
  if (!(chemin === RACINE || chemin.startsWith(`${RACINE}/`))) return ACCUEIL;
  if (chemin === CONNEXION || chemin.startsWith(`${CONNEXION}/`)) return ACCUEIL;
  return u.pathname + u.search + u.hash;
}
