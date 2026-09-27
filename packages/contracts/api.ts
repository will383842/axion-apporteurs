/**
 * api.ts — les API du contrat axionia ↔ Axion Partners qui ne sont pas des webhooks (REQ-QA-007).
 *
 * UNE ROUTE ICI, LA TROISIÈME DU CONTRAT : celle par laquelle Partners TIRE les coordonnées d'un
 * candidat au traitement de la candidature (partners/ADR-0023). Le contrat de webhooks reste sans
 * donnée personnelle ; la frontière de REQ-INT-029 n'est ni affaiblie ni exemptée pour elle.
 *
 * SOUS LA MÊME EMPREINTE QUE LE RESTE. Les schémas de cette route sont des `$defs` du JSON Schema
 * publié (`contratJsonSchema`, `events.ts`) : un champ renommé ici change `contracts.sha256`, et se
 * publie donc des deux côtés dans la même fenêtre, comme un type ou un champ de charge.
 *
 * CE QUE LE JSON SCHEMA NE DIT PAS, ET QUE LE `$comment` PORTE — décisions 3 à 8 de
 * partners/ADR-0023 : l'authentification est celle de la relecture ; la route ne répond que pour une
 * candidature réellement émise vers Partners, et un identifiant non émis rend la réponse d'un
 * identifiant inexistant ; rien n'est mis en cache ; chaque appel est journalisé sans aucune
 * coordonnée ; le débit est plafonné par candidature.
 */

import type { FragmentSchema } from './enveloppe';
import { ouNul } from './payloads';

/** Des secondes Unix en chiffres, et rien d'autre : la découpe `<t>.<cible>` reste non ambiguë. */
const MOTIF_HORODATAGE = '^[0-9]{1,20}$';
/** Une signature HMAC-SHA-256 en hexadécimal minuscule. */
const MOTIF_SIGNATURE = '^[0-9a-f]{64}$';

/** Une valeur de coordonnée : une chaîne non vide, ou `null` si axionia ne la détient pas. */
const coordonnee: FragmentSchema = ouNul({ type: 'string', minLength: 1 });

/** Les en-têtes d'une signature, sous leur nom HTTP en minuscules. */
function entetesSignes(horodatage: string, signature: string, portee: string): FragmentSchema {
  return {
    type: 'object',
    $comment: portee,
    required: [horodatage, signature],
    properties: {
      [horodatage]: { type: 'string', pattern: MOTIF_HORODATAGE },
      [signature]: { type: 'string', pattern: MOTIF_SIGNATURE },
    },
  };
}

export type ApiDuContrat = {
  /** La méthode et le chemin, paramètre entre accolades. */
  readonly methode: 'GET';
  readonly chemin: string;
  /** Le préfixe des noms de `$defs` de cette route dans le JSON Schema publié. */
  readonly prefixeDefs: string;
  readonly defs: Readonly<Record<string, FragmentSchema>>;
};

/**
 * `GET /api/partners/candidatures/{candidatureId}/coordonnees` — partners/ADR-0023.
 *
 * Réponse 200 : `{nom, prenom, email, telephone}`, FERMÉE, chaque champ nul s'il est absent. Toute
 * autre situation — identifiant inconnu, candidature non émise vers Partners, plafond atteint —
 * rend 404 sans corps distinctif.
 */
export const API_COORDONNEES_CANDIDATURE: ApiDuContrat = {
  methode: 'GET',
  chemin: '/api/partners/candidatures/{candidatureId}/coordonnees',
  prefixeDefs: 'api_coordonnees_candidature',
  defs: {
    api_coordonnees_candidature_parametres: {
      type: 'object',
      additionalProperties: false,
      required: ['candidatureId'],
      properties: { candidatureId: { type: 'string', minLength: 1 } },
      $comment:
        "Le paramètre de chemin : l'identifiant de candidature que porte la charge de la candidature " +
        'reçue (`candidatureId`).',
    },
    api_coordonnees_candidature_requete_entetes: entetesSignes(
      'x-partners-timestamp',
      'x-partners-signature',
      'Requête Partners → axionia, même authentification que la relecture : HMAC-SHA-256, sous le ' +
        'secret dédié à la relecture, de `<horodatage>.<chemin exact>` ; tolérance de 300 s, ' +
        "comparaison à temps constant, liste d'autorisation d'adresses réseau (partners/ADR-0023, " +
        'décision 3).'
    ),
    api_coordonnees_candidature_reponse_entetes: entetesSignes(
      'x-axionia-timestamp',
      'x-axionia-signature',
      "Réponse axionia → Partners, signée comme un envoi : HMAC-SHA-256, sous le secret d'émission, " +
        'de `<horodatage>.<corps exact>`.'
    ),
    api_coordonnees_candidature_reponse: {
      type: 'object',
      additionalProperties: false,
      required: ['nom', 'prenom', 'email', 'telephone'],
      properties: {
        nom: coordonnee,
        prenom: coordonnee,
        email: coordonnee,
        telephone: coordonnee,
      },
      $comment:
        'Réponse 200, fermée. Toute autre situation rend 404, identique pour un identifiant ' +
        "inexistant et pour une candidature non émise vers Partners. Rien n'est mis en cache ; " +
        "chaque appel est journalisé côté axionia sans aucune coordonnée ; au plus cinq lectures " +
        'réussies par candidature sur vingt-quatre heures glissantes (partners/ADR-0023). Côté ' +
        "Partners, les valeurs ne vivent que le temps du traitement : jamais dans les charges reçues, " +
        'jamais au journal, jamais dans un message.',
    },
  },
};

/** Les API dont ce paquet porte le schéma. */
export const API_DU_CONTRAT: readonly ApiDuContrat[] = [API_COORDONNEES_CANDIDATURE];

/** Les `$defs` de toutes les API, à fusionner dans le JSON Schema publié. */
export function defsApi(): Record<string, FragmentSchema> {
  const defs: Record<string, FragmentSchema> = {};
  for (const api of API_DU_CONTRAT) {
    for (const [nom, schema] of Object.entries(api.defs)) {
      if (!nom.startsWith(`${api.prefixeDefs}_`)) {
        throw new Error(`${nom} ne porte pas le préfixe de sa route (${api.prefixeDefs}).`);
      }
      defs[nom] = schema;
    }
  }
  return defs;
}

/** Les noms de ces `$defs`. */
export function nomsDefsApi(): string[] {
  return Object.keys(defsApi());
}

/**
 * La référence de dépendance d'une charge reçue qui attend les coordonnées de son candidat : si la
 * route échoue, la charge reste `en_attente_dependance` avec cette référence, et elle est rejouée —
 * jamais un apporteur sans adresse (partners/ADR-0023, décision 7).
 */
export function refDependanceCoordonnees(candidatureId: string): string {
  if (candidatureId === '') throw new Error('candidatureId vide : aucune dépendance à attendre.');
  return `coordonnees:${candidatureId}`;
}
