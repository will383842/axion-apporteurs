/**
 * Les réglages du client de l'API publique de recherche d'entreprises — INT-T09.
 *
 * UNE VALEUR, UNE SOURCE, UNE DATE (RM-10). Chaque réglage porte d'où il vient et quand il a été
 * confronté à sa source. Deux familles, et la différence compte :
 *   — ce qu'une EXIGENCE chiffre (anti-rebond, cache, paramètres d'appel) : la
 *     valeur est celle du texte, et la changer passe par l'exigence ;
 *   — ce qu'AUCUNE exigence ne chiffre (délai d'attente, seuils du disjoncteur, taille de page) :
 *     la valeur est un choix d'implémentation de cette tâche, DIT comme tel, et soumis à la revue.
 *     Aucun ne touche l'argent, un texte juridique ou une donnée de personne ; chacun ne règle que
 *     QUAND le parcours bascule en saisie manuelle — et la saisie manuelle ne bloque jamais le dépôt.
 *
 * Le débit global et les plafonds par identité et par adresse ne sont PAS ici : ce sont des
 * compteurs, et un compteur n'existe que déclaré au registre (`src/server/securite/rate-limit.ts`).
 */
interface Reglage<T> {
  readonly valeur: T;
  readonly source: string;
  /** AAAA-MM-JJ : la date de confrontation à la source. */
  readonly verifieLe: string;
}

const EXIGE = (req: string): string => `${req} (valeur écrite dans le texte de l'exigence)`;
const CHOIX =
  'INT-T09 — choix d’implémentation : aucune exigence ne chiffre cette valeur (question ouverte au rendu)';

export const PARAMETRES = {
  /** L'adresse du service, lue dans sa documentation officielle le 2026-09-19. */
  urlDeBase: {
    valeur: 'https://recherche-entreprises.api.gouv.fr',
    source:
      'https://recherche-entreprises.api.gouv.fr/openapi.json, « L’API est accessible à partir de cette adresse »',
    verifieLe: '2026-09-19',
  },
  antiRebondMs: { valeur: 300, source: EXIGE('REQ-INT-020'), verifieLe: '2026-09-19' },
  cacheSecondes: {
    valeur: 86_400,
    source: EXIGE('REQ-INT-020, REQ-SEC-013 (24 h)'),
    verifieLe: '2026-09-19',
  },
  /** `minimal=true&include=siege,dirigeants` — mot pour mot. */
  parametresDAppel: {
    valeur: { minimal: 'true', include: 'siege,dirigeants' },
    source: EXIGE('REQ-INT-020'),
    verifieLe: '2026-09-19',
  },
  /** La documentation borne `per_page` à 25 ; la valeur par défaut du service est 10. */
  resultatsParPage: { valeur: 10, source: CHOIX, verifieLe: '2026-09-19' },
  delaiAttenteMs: { valeur: 1_500, source: CHOIX, verifieLe: '2026-09-19' },
  disjoncteurSeuilEchecs: { valeur: 3, source: CHOIX, verifieLe: '2026-09-19' },
  disjoncteurPauseMs: { valeur: 30_000, source: CHOIX, verifieLe: '2026-09-19' },
  /** Le plus long `Retry-After` obéi : au-delà, le disjoncteur rouvre quand même à ce terme. */
  retryAfterPlafondMs: { valeur: 3_600_000, source: CHOIX, verifieLe: '2026-09-25' },
  /** La documentation recommande un en-tête explicite ; aucune coordonnée dans un dépôt public. */
  agentUtilisateur: {
    valeur: 'axion-partners/recherche-entreprises (mandataire serveur)',
    source:
      'https://recherche-entreprises.api.gouv.fr/openapi.json, « inclure un en-tête User-Agent explicite »',
    verifieLe: '2026-09-19',
  },
} as const satisfies Record<string, Reglage<unknown>>;

/** La saisie telle qu'elle part au tiers : rognée, espaces réduits. Rien d'autre n'est envoyé. */
export function saisieNormalisee(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

/**
 * L'URL de recherche, SEULE fabrique : la production, l'enregistreur de fixtures et le contrat
 * nocturne l'appellent tous — une fixture enregistrée est donc la requête que la production enverrait.
 */
export function urlDeRecherche(q: string, urlDeBase: string): URL {
  const url = new URL('/search', urlDeBase);
  url.searchParams.set('q', saisieNormalisee(q));
  url.searchParams.set('minimal', PARAMETRES.parametresDAppel.valeur.minimal);
  url.searchParams.set('include', PARAMETRES.parametresDAppel.valeur.include);
  url.searchParams.set('per_page', String(PARAMETRES.resultatsParPage.valeur));
  url.searchParams.set('page', '1');
  return url;
}
