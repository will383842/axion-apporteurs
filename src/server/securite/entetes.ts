/**
 * La SOURCE UNIQUE des en-têtes de sécurité de Partners (SEC-02, REQ-SEC-029).
 *
 * DEUX FICHIERS L'IMPORTENT, ET CHACUN A SON RÔLE — AUCUN EN-TÊTE N'EST POSÉ DEUX FOIS.
 *   — `next.config.ts` pose `ENTETES_STATIQUES` sur TOUTES les réponses, ressources statiques
 *     comprises (le proxy ne les voit pas). Aucune CSP n'y figure : deux politiques s'intersectent,
 *     et une politique statique, sans nonce, bloquerait tous les scripts.
 *   — `src/proxy.ts` tire un nonce NEUF par requête, construit la politique autour de lui et pose
 *     `CACHE_CONTROL` : une réponse qui porte un nonce ne doit jamais sortir d'un cache.
 *
 * Ce module est PUR : ni `next`, ni I/O, ni horloge. Le seul effet est le tirage aléatoire du
 * nonce, par `crypto.getRandomValues` — jamais `Math.random`, dont la suite se prédit.
 *
 * Le témoin (`tests/unit/securite/headers.spec.ts`) ne lit PAS les listes de ce fichier : il porte
 * sa propre liste des directives attendues, et c'est leur divergence qui rougit. Retirer une
 * directive ici ET dans un vérificateur qui l'importerait ne ferait rien rougir.
 */

/** 16 octets = 128 bits : le plancher d'imprévisibilité du nonce, tenu par le témoin. */
export const OCTETS_DU_NONCE = 16;

/**
 * Les origines tierces que le NAVIGATEUR appelle. Vide : aujourd'hui il n'appelle que Partners.
 * Une origine ajoutée ici doit apparaître dans un autre fichier de `src/` — le témoin rougit sur
 * une origine que rien n'appelle — et jamais sous une forme large (`*`, `https:`, `data:`…).
 */
export const ORIGINES_CONNECT: readonly string[] = [];

/** Posé par le proxy sur chaque réponse qu'il voit : « jamais rendu dans une page mise en cache ». */
export const CACHE_CONTROL = 'private, no-store';

/**
 * Posés par `next.config.ts` sur toutes les routes. HSTS : deux ans, sous-domaines, `preload`
 * (l'INSCRIPTION du domaine sur la liste de préchargement est un geste hors du code).
 * `Permissions-Policy` : uniquement des fonctions que Chrome reconnaît — un nom inconnu lève un
 * avertissement dans la console à chaque page.
 */
export const ENTETES_STATIQUES: readonly { readonly key: string; readonly value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), ' +
      'hid=(), browsing-topics=()',
  },
];

/** Un nonce neuf : 128 bits tirés par le générateur cryptographique, en base64. */
export function genererNonce(): string {
  const octets = new Uint8Array(OCTETS_DU_NONCE);
  crypto.getRandomValues(octets);
  return Buffer.from(octets).toString('base64');
}

/**
 * La politique de sécurité de contenu construite autour d'un nonce.
 *
 * `developpement` n'ajoute qu'une chose : `'unsafe-eval'`, dont React a besoin en développement
 * pour reconstruire les piles d'erreur (doc Next 16, guide CSP). Il n'ajoute PAS `'unsafe-inline'` :
 * à côté d'un nonce, tout navigateur CSP2+ l'ignore. Pas d'`upgrade-insecure-requests` : HSTS fait
 * ce travail, et la directive envoie un harnais local vers `https://localhost`.
 */
export function politiqueDeContenu({
  nonce,
  developpement,
}: {
  nonce: string;
  developpement: boolean;
}): string {
  const source = `'nonce-${nonce}'`;
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      ["'self'", source, "'strict-dynamic'", ...(developpement ? ["'unsafe-eval'"] : [])],
    ],
    ['style-src', ["'self'", source]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...ORIGINES_CONNECT]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([nom, sources]) => `${nom} ${sources.join(' ')}`).join('; ');
}
