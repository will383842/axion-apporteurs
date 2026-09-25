/**
 * L'appel au tiers de recherche d'entreprises, et sa lecture — INT-T09 (REQ-INT-020, REQ-QA-028).
 *
 * ISOLÉ (REQ-QA-028) : c'est le seul module qui parle au tiers. Il reçoit `fetch`, l'adresse et le
 * délai — un test lui donne un serveur local, jamais le réseau — et il ne rend jamais d'exception :
 * toute issue est une VALEUR, que le mandataire traduit en saisie manuelle.
 *
 *   200 lisible par le schéma → `ok`            429 → `refus_exces` (+ Retry-After lu)
 *   200 hors schéma           → `reponse_illisible`   5xx → `erreur_serveur`
 *   délai dépassé, réseau     → `delai_depasse`       autre 4xx → `requete_refusee`
 *
 * Le délai est TENU par un signal d'abandon : un tiers qui accepte la connexion puis se tait ne
 * suspend pas le dépôt.
 */
import { PARAMETRES, urlDeRecherche } from './parametres';
import { schemaReponseDuTiers, type ReponseDuTiers } from './schemas';
import type { MotifDePanneDuTiers } from './disjoncteur';

export type IssueDuTiers =
  | { readonly ok: true; readonly reponse: ReponseDuTiers }
  | {
      readonly ok: false;
      readonly motif: MotifDePanneDuTiers | 'requete_refusee';
      /** Le délai demandé par `Retry-After`, en ms ; `null` s'il est absent ou illisible. */
      readonly retryAfterMs: number | null;
    };

export type ClientDuTiers = (q: string, maintenantMs: number) => Promise<IssueDuTiers>;

export interface ReglageDuClient {
  readonly fetch: typeof fetch;
  readonly urlDeBase: string;
  readonly delaiMs: number;
}

/**
 * `Retry-After` : un nombre de secondes, ou une date HTTP (RFC 9110 §10.2.3). Illisible, négatif
 * ou déjà passé : `null` — le disjoncteur prend alors sa pause par défaut, il n'invente pas.
 * PLAFONNÉ à `retryAfterPlafondMs` : un seul en-tête démesuré ne tient pas le disjoncteur du
 * processus ouvert jusqu'au redémarrage.
 */
export function lireRetryAfter(valeur: string | null, maintenantMs: number): number | null {
  if (valeur === null) return null;
  const texte = valeur.trim();
  const plafond = PARAMETRES.retryAfterPlafondMs.valeur;
  if (/^\d+$/.test(texte)) return Math.min(Number(texte) * 1000, plafond);
  if (!/[a-z]/i.test(texte)) return null;
  const date = Date.parse(texte);
  if (Number.isNaN(date) || date <= maintenantMs) return null;
  return Math.min(date - maintenantMs, plafond);
}

const panne = (
  motif: MotifDePanneDuTiers | 'requete_refusee',
  retryAfterMs: number | null = null
): IssueDuTiers => ({ ok: false, motif, retryAfterMs });

export function clientDuTiers(reglage: ReglageDuClient): ClientDuTiers {
  return async (q, maintenantMs) => {
    let reponse: Response;
    let corps: unknown;
    try {
      reponse = await reglage.fetch(urlDeRecherche(q, reglage.urlDeBase), {
        headers: { accept: 'application/json', 'user-agent': PARAMETRES.agentUtilisateur.valeur },
        signal: AbortSignal.timeout(reglage.delaiMs),
      });
      if (reponse.status !== 200) {
        // Le corps d'un refus n'est pas lu : il est libéré, pour ne pas retenir la connexion.
        await reponse.body?.cancel().catch(() => undefined);
        if (reponse.status === 429) {
          return panne(
            'refus_exces',
            lireRetryAfter(reponse.headers.get('retry-after'), maintenantMs)
          );
        }
        return panne(reponse.status >= 500 ? 'erreur_serveur' : 'requete_refusee');
      }
      corps = await reponse.json();
    } catch (e) {
      // Un corps 200 qui n'est pas du JSON est une réponse illisible ; tout le reste — délai,
      // connexion refusée, coupure — est un tiers qui n'a pas répondu à temps.
      return panne(e instanceof SyntaxError ? 'reponse_illisible' : 'delai_depasse');
    }
    const lu = schemaReponseDuTiers.safeParse(corps);
    return lu.success ? { ok: true, reponse: lu.data } : panne('reponse_illisible');
  };
}
