/**
 * INT-T57 — le client HTTP du relais de courriels (ZeptoMail) : l'interface `Relais` de l'émetteur
 * (`emetteur.ts`, INT-T10), qui remplace le port de production qui refusait (SEC-42).
 *
 * LA SOURCE (RM-08). `docs/tiers/zeptomail.md` §2, lue le 2026-10-02 : `POST <hôte>/v1.1/email`,
 * `Authorization: Zoho-enczapikey <jeton>`, corps JSON (`from`, `to[].email_address`, `subject`,
 * `textbody`, `client_reference`) ; la réponse 200 porte `request_id`, qui devient le `messageId`.
 *
 * L'HÔTE est une liste FERMÉE : les hôtes lus sur une page officielle, plus l'hôte européen, indiqué
 * par des sources tierces seulement et à confirmer dans « Setup info » avant l'allumage. Une autre
 * URL est un refus nommé, avant tout appel.
 *
 * LES ÉCHECS sont une liste FERMÉE de codes : jamais la sortie du prestataire, qui peut citer
 * l'adresse ou le corps, et jamais le jeton. Le délai est borné.
 *
 * AUCUNE REDIRECTION n'est suivie (`redirect: 'error'`) : le corps, qui porte l'URL du lien magique,
 * ne part jamais vers un autre hôte (condition de la lentille sécurité).
 *
 * LA NOUVELLE TENTATIVE n'a lieu que si le prestataire a REFUSÉ avant d'accepter (429, débit) : rien
 * n'est parti. Après une réponse incertaine — délai dépassé, panne réseau, 5xx —, le message a pu
 * partir : on ne retente pas, l'échec est rendu et la ligne le dit. Aucun double envoi.
 */
import type { Relais } from './emetteur';

/** Le chemin d'envoi d'un message seul, tel que la source le donne. */
export const CHEMIN_D_ENVOI = '/v1.1/email';

/**
 * Les hôtes admis. `cpaas.zoho.com` : la référence officielle de l'API ; `api.zeptomail.com` :
 * l'article officiel ; `api.zeptomail.eu` : SOURCE TIERCE, non officielle — le compte est européen,
 * et l'hôte se confirme dans « Setup info » avant l'allumage (fiche, §2).
 */
export const HOTES_D_ENVOI: readonly string[] = Object.freeze([
  'cpaas.zoho.com',
  'api.zeptomail.com',
  'api.zeptomail.eu',
]);

/** La patience d'un envoi : celle d'un instrument, pas un seuil métier (RM-10). */
export const DELAI_D_ENVOI_MS = 15_000;

/** Le temps laissé au prestataire entre un refus de débit et la seconde tentative. */
const PAUSE_APRES_REFUS_DE_DEBIT_MS = 1_000;

export const ECHECS_DU_RELAIS = [
  'relais_non_configure',
  'relais_url_refusee',
  'relais_delai_depasse',
  'relais_injoignable',
  'relais_refus_authentification',
  'relais_requete_refusee',
  'relais_debit_depasse',
  'relais_indisponible',
  'relais_reponse_illisible',
  'relais_redirection_refusee',
] as const;
export type EchecDuRelais = (typeof ECHECS_DU_RELAIS)[number];

/** Une erreur qui ne porte QUE son code : ni cause, ni sortie du prestataire. */
class ErreurDuRelais extends Error {
  constructor(code: EchecDuRelais) {
    super(code);
    this.name = 'ErreurDuRelais';
  }
}

/** L'URL d'envoi, si elle est https, d'un hôte admis, au chemin d'envoi exact ; sinon `null`. */
function urlAdmise(brute: string): string | null {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }
  const admise =
    url.protocol === 'https:' &&
    HOTES_D_ENVOI.includes(url.hostname) &&
    url.port === '' &&
    url.pathname === CHEMIN_D_ENVOI &&
    url.search === '' &&
    url.username === '' &&
    url.password === '';
  return admise ? url.toString() : null;
}

/** Le code d'une réponse non 200. */
function echecDuStatut(statut: number): EchecDuRelais {
  if (statut >= 300 && statut < 400) return 'relais_redirection_refusee';
  if (statut === 401 || statut === 403) return 'relais_refus_authentification';
  if (statut === 429) return 'relais_debit_depasse';
  if (statut >= 500) return 'relais_indisponible';
  return 'relais_requete_refusee';
}

export function relaisZeptomail(d: {
  url: string | undefined;
  jeton: string | undefined;
  fetch?: typeof fetch;
  delaiMs?: number;
  attendre?: (ms: number) => Promise<void>;
}): Relais {
  const appeler = d.fetch ?? fetch;
  const delaiMs = d.delaiMs ?? DELAI_D_ENVOI_MS;
  const attendre =
    d.attendre ?? ((ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms)));

  return {
    async envoyer(m) {
      if (d.url === undefined || d.url === '' || d.jeton === undefined || d.jeton === '') {
        throw new ErreurDuRelais('relais_non_configure');
      }
      const url = urlAdmise(d.url);
      if (url === null) throw new ErreurDuRelais('relais_url_refusee');
      const corps = JSON.stringify({
        from: { address: m.de },
        to: [{ email_address: { address: m.a } }],
        subject: m.sujet,
        textbody: m.corps,
        // UX-P1-64 : le châssis commun, quand le courriel en a un ; le texte reste toujours joint.
        ...(m.html === undefined ? {} : { htmlbody: m.html }),
        // UX-P1-64, condition 6 du logo distant (#319 6041013643) : le suivi d'ouverture et de clic du
        // fournisseur est ÉTEINT, explicitement, à chaque envoi.
        track_opens: false,
        track_clicks: false,
        client_reference: m.reference,
      });

      const essai = async (): Promise<Response> => {
        try {
          return await appeler(url, {
            method: 'POST',
            headers: {
              authorization: `Zoho-enczapikey ${d.jeton}`,
              'content-type': 'application/json',
            },
            body: corps,
            // Le corps porte l'URL du lien magique : une redirection ne le RENVOIE jamais ailleurs.
            // `error` fait échouer l'appel (rendu `relais_injoignable`) ; une réponse 3xx qui
            // arriverait quand même est refusée en se nommant.
            redirect: 'error',
            signal: AbortSignal.timeout(delaiMs),
          });
        } catch (erreur) {
          const nom = erreur instanceof Error ? erreur.name : '';
          throw new ErreurDuRelais(
            nom === 'TimeoutError' || nom === 'AbortError'
              ? 'relais_delai_depasse'
              : 'relais_injoignable'
          );
        }
      };

      let reponse = await essai();
      if (reponse.status === 429) {
        await attendre(PAUSE_APRES_REFUS_DE_DEBIT_MS);
        reponse = await essai();
      }
      if (reponse.status !== 200) throw new ErreurDuRelais(echecDuStatut(reponse.status));

      let lu: unknown;
      try {
        lu = await reponse.json();
      } catch {
        throw new ErreurDuRelais('relais_reponse_illisible');
      }
      const id = (lu as { request_id?: unknown } | null)?.request_id;
      if (typeof id !== 'string' || id === '') throw new ErreurDuRelais('relais_reponse_illisible');
      return { messageId: id };
    },
  };
}
