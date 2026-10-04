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
/** Un `kid` : huit caractères hexadécimaux minuscules (`kidDe`, partners/ADR-0013 d.8). */
const MOTIF_KID = '^[0-9a-f]{8}$';

/**
 * L'en-tête qui porte l'identifiant de la clé d'émission d'axionia (INT-T42). FACULTATIF au
 * SCHÉMA (additif, v2) ; le `kid` CHOISIT la clé de vérification, et pour axionia un `kid`
 * absent ou inconnu est un refus, aucun autre secret n'est essayé (REQ-QA-030, QA-T52).
 */
export const ENTETE_KID_AXIONIA = 'x-axionia-kid';

/** Une valeur de coordonnée : une chaîne non vide, ou `null` si axionia ne la détient pas. */
const coordonnee: FragmentSchema = ouNul({ type: 'string', minLength: 1 });

/** Les en-têtes d'une signature, sous leur nom HTTP en minuscules ; le `kid`, facultatif. */
function entetesSignes(
  horodatage: string,
  signature: string,
  portee: string,
  kid?: string
): FragmentSchema {
  return {
    type: 'object',
    $comment: portee,
    required: [horodatage, signature],
    properties: {
      [horodatage]: { type: 'string', pattern: MOTIF_HORODATAGE },
      [signature]: { type: 'string', pattern: MOTIF_SIGNATURE },
      ...(kid === undefined ? {} : { [kid]: { type: 'string', pattern: MOTIF_KID } }),
    },
  };
}

/**
 * Les en-têtes d'un WEBHOOK axionia → Partners (INT-T42) : HMAC-SHA-256, sous le secret
 * d'émission, de `<horodatage>.<corps exact>` ; le `kid` de ce secret, facultatif.
 */
export const DEFS_WEBHOOK: Readonly<Record<string, FragmentSchema>> = {
  webhook_entetes: entetesSignes(
    'x-axionia-timestamp',
    'x-axionia-signature',
    "Webhook axionia → Partners : HMAC-SHA-256, sous le secret d'émission, de " +
      '`<horodatage>.<corps exact>` ; tolérance de 300 s. `x-axionia-kid`, facultatif, désigne ' +
      'le secret employé (kidDe, partners/ADR-0013 d.8).',
    ENTETE_KID_AXIONIA
  ),
};

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
        'de `<horodatage>.<corps exact>`. `x-axionia-kid`, facultatif, désigne le secret employé.',
      ENTETE_KID_AXIONIA
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

/** Une séquence de la file d'axion-ia, écrite en chiffres dans un en-tête. */
const MOTIF_SEQUENCE = '^[0-9]{1,18}$';

/**
 * La borne d'une page de relecture, nommée : celle du serveur d'axion-ia (`LIMITE_MAX` de sa route),
 * qui refuse au-delà. Le client de Partners lit en dessous.
 */
const LIMITE_MAX_RELECTURE = 500;

/**
 * La relecture de la file de sortie d'axion-ia, `GET` au chemin ci-dessous, paramètres
 * `after_sequence` et `limit` (REQ-INT-012), DÉCLARÉE au contrat en AMENDEMENT de la version 3 tant qu'axion-ia ne
 * l'a pas adoptée (rattrapage 66, forme de l'architecte) : elle tournait sans y être.
 *
 * Réponse 200 : les corps stockés, octet pour octet, un par ligne (NDJSON) — chacun une enveloppe
 * DÉJÀ au contrat, dans l'ordre strict des séquences —, la séquence de la dernière ligne rendue et
 * l'indication qu'il en reste. Une page se lit entière ou pas du tout.
 */
export const API_RELECTURE: ApiDuContrat = {
  methode: 'GET',
  chemin: '/api/partners/evenements',
  prefixeDefs: 'api_relecture',
  defs: {
    api_relecture_parametres: {
      type: 'object',
      additionalProperties: false,
      required: ['after_sequence', 'limit'],
      properties: {
        after_sequence: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: LIMITE_MAX_RELECTURE },
      },
      $comment:
        "Les paramètres de requête, en chiffres sur le fil : `after_sequence`, la dernière séquence " +
        'déjà lue (0 au départ) ; `limit`, le nombre de lignes au plus, sous la borne nommée du ' +
        'serveur. Au-delà de la borne, ou un paramètre illisible : refus, jamais une page tronquée.',
    },
    api_relecture_requete_entetes: entetesSignes(
      'x-partners-timestamp',
      'x-partners-signature',
      'Requête Partners → axionia, même authentification que la route des coordonnées : ' +
        'HMAC-SHA-256, sous le secret dédié à la relecture, de `<horodatage>.<cible exacte>`, la ' +
        "cible comprenant la requête (`after_sequence` et `limit`) ; tolérance de 300 s, " +
        "comparaison à temps constant, liste d'autorisation d'adresses réseau."
    ),
    api_relecture_reponse_entetes: {
      ...entetesSignes(
        'x-axionia-timestamp',
        'x-axionia-signature',
        "Réponse axionia → Partners, signée sous le secret d'émission ; `x-axionia-kid`, " +
          'facultatif, désigne le secret employé. La signature couvre, dans cet ordre CANONIQUE, ' +
          "joints par un point : `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>." +
          '<x-axionia-suite>.<corps exact>` — le corps, les deux en-têtes de la page, et les deux ' +
          "paramètres demandés, qui lient la réponse à SA requête : une page authentique d'une autre " +
          'lecture ne se rejoue pas sur celle-ci. Les paramètres y sont écrits en chiffres, sans zéro ' +
          'de tête.',
        ENTETE_KID_AXIONIA
      ),
      required: [
        'x-axionia-timestamp',
        'x-axionia-signature',
        'x-axionia-derniere-sequence',
        'x-axionia-suite',
      ],
      properties: {
        'x-axionia-timestamp': { type: 'string', pattern: MOTIF_HORODATAGE },
        'x-axionia-signature': { type: 'string', pattern: MOTIF_SIGNATURE },
        [ENTETE_KID_AXIONIA]: { type: 'string', pattern: MOTIF_KID },
        'x-axionia-derniere-sequence': { type: 'string', pattern: MOTIF_SEQUENCE },
        'x-axionia-suite': { type: 'string', enum: ['0', '1'] },
      },
    },
    api_relecture_reponse: {
      type: 'array',
      items: { $ref: '#' },
      maxItems: LIMITE_MAX_RELECTURE,
      $comment:
        'Réponse 200 : une enveloppe du contrat par ligne (NDJSON), le corps stocké octet pour ' +
        'octet, séquences strictement croissantes au-delà de `after_sequence` ; ' +
        '`x-axionia-derniere-sequence` est celle de la dernière ligne rendue, ou `after_sequence` ' +
        "si rien n'est rendu ; `x-axionia-suite` vaut `1` s'il en reste. Rien n'est mis en cache. " +
        "Chaque appel est journalisé côté axionia sans aucune donnée de personne : l'adresse " +
        'appelante en empreinte, les deux paramètres, le nombre de lignes rendues.',
    },
  },
};

/** Un mois `AAAA-MM`, mois de 01 à 12. */
const MOTIF_MOIS = '^[0-9]{4}-(0[1-9]|1[0-2])$';
/** Une référence opaque : un UUID, qui ne peut porter ni un nom ni une adresse de courriel. */
const MOTIF_UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
/**
 * Un nom d'affichage : le ou les mots du prénom, puis UNE initiale suivie d'un point (« Paul D. »,
 * « Jean-Paul D. ») — motif d'A02 (PR 710, commentaire 5981840348). Le nom entier, un prénom seul, une
 * adresse de courriel ou un numéro ne passent pas.
 */
const MOTIF_NOM_AFFICHABLE = "^[\\p{L}][\\p{L}'’-]*( [\\p{L}][\\p{L}'’-]*)* \\p{L}\\.$";
/** La longueur d'un nom d'affichage, au plus (A02). */
const LONGUEUR_MAX_NOM_AFFICHABLE = 64;

/** Ce que le statut exige d'un champ du porteur : posé, ou nul. Un champ absent reste libre. */
type ExigenceDuStatut = Partial<Record<'until' | 'apporteurRef' | 'nomAffichable', 'pose' | 'nul'>>;
/**
 * `if`/`then` : quand `statut` vaut `statut`, chaque champ nommé est posé ou nul. Le contrat juge
 * seul la cohérence — elle ne vit plus dans un `$comment`.
 */
function siLeStatut(statut: string, exigences: ExigenceDuStatut): FragmentSchema {
  return {
    if: { properties: { statut: { const: statut } }, required: ['statut'] },
    then: {
      properties: Object.fromEntries(
        Object.entries(exigences).map(([c, e]) => [
          c,
          e === 'pose' ? { type: 'string' } : { type: 'null' },
        ])
      ),
    },
  };
}

/**
 * L'API 1, `GET /api/integrations/axionia/attributions?siren=` — REQ-INT-014, INT-T07-P.
 *
 * axion-ia → Partners. Réponse 200 : `{statut, until, apporteurRef, nomAffichable}`, FERMÉE. Tout
 * refus d'authentification, de méthode ou de route rend 404 sans corps, identique à une route
 * inexistante (REQ-SEC-012) ; un SIREN mal formé rend 400 ; une lecture impossible rend 503.
 */
export const API_ATTRIBUTIONS: ApiDuContrat = {
  methode: 'GET',
  chemin: '/api/integrations/axionia/attributions',
  prefixeDefs: 'api_attributions',
  defs: {
    api_attributions_parametres: {
      type: 'object',
      additionalProperties: false,
      required: ['siren'],
      properties: { siren: { type: 'string', pattern: '^[0-9]{9}$' } },
      $comment: 'Le paramètre de requête : le SIREN, neuf chiffres. Mal formé : 400 sans corps.',
    },
    api_attributions_requete_entetes: {
      type: 'object',
      required: ['authorization', ENTETE_KID_AXIONIA],
      properties: {
        authorization: { type: 'string', pattern: '^Bearer \\S+$' },
        [ENTETE_KID_AXIONIA]: { type: 'string', pattern: MOTIF_KID },
      },
      $comment:
        'Requête axion-ia → Partners : le jeton porteur dédié à l’API 1, comparé à temps constant ' +
        'à la clé que désigne `x-axionia-kid`, EXIGÉ et dérivé par kidDe(AXIONIA_API_TOKEN) ' +
        '(avenant A01 du 2026-09-30, QA-T52) ; liste d’autorisation d’adresses réseau ; 60 appels ' +
        'par minute et par adresse. Un kid absent ou inconnu, un jeton faux ou échu, une adresse ' +
        'hors liste : 404 sans corps, identique à une route inexistante (REQ-SEC-012).',
    },
    api_attributions_reponse: {
      type: 'object',
      additionalProperties: false,
      required: ['statut', 'until', 'apporteurRef', 'nomAffichable'],
      properties: {
        statut: { type: 'string', enum: ['libre', 'attribuee', 'cliente'] },
        until: ouNul({ type: 'string', pattern: MOTIF_MOIS }),
        apporteurRef: ouNul({ type: 'string', pattern: MOTIF_UUID }),
        nomAffichable: ouNul({
          type: 'string',
          pattern: MOTIF_NOM_AFFICHABLE,
          maxLength: LONGUEUR_MAX_NOM_AFFICHABLE,
        }),
      },
      // Conditions d'A02, version consolidée et source publique : PR 710, commentaire 5981840348.
      // `nomAffichable` est au motif OU nul pour un porteur sans nom lisible (disponibilité) : le
      // statut et la référence passent toujours.
      allOf: [
        siLeStatut('libre', { until: 'nul', apporteurRef: 'nul', nomAffichable: 'nul' }),
        // A02 (5981872875) : `until` nul = attribuée, fin pas encore fixée (attribution non
        // confirmée) — jamais lu comme `libre`.
        siLeStatut('attribuee', { apporteurRef: 'pose' }),
        // Décision B de Williams : « Apportée par Paul » sur la fiche client — une `cliente` a un
        // porteur ; elle n'a plus d'échéance.
        siLeStatut('cliente', { until: 'nul', apporteurRef: 'pose' }),
      ],
      $comment:
        'Réponse 200, fermée. `libre` : `until`, `apporteurRef` et `nomAffichable` ' +
        'nuls (`allOf`), la même réponse pour un SIREN inconnu, au même instant ; `attribuee` : ' +
        '`apporteurRef` posé, et `until` nul signifie « attribuée, fin pas encore fixée (attribution ' +
        'non confirmée) » — jamais `libre` ; `cliente` : `apporteurRef` posé, `until` nul. ' +
        '`nomAffichable` est nul quand le porteur n’a pas de nom lisible. `apporteurRef` est opaque, de même forme ' +
        'pour un apporteur et pour un conseiller salarié (W19) ; `nomAffichable` est le prénom et ' +
        'l’initiale du nom du porteur, sans mention de rôle (décisions de Williams du 2026-10-01) — ' +
        'jamais e-mail, téléphone, identifiant ni adresse. Côté axion-ia, le nom ne s’affiche qu’à ' +
        'qui crée ou lit un devis, n’entre dans aucun journal ni rapport d’erreur, ni dans aucun ' +
        'document ou message au client, et n’est conservé que le temps du cache (5 minutes).',
    },
  },
};

/** Les API dont ce paquet porte le schéma. */
export const API_DU_CONTRAT: readonly ApiDuContrat[] = [
  API_COORDONNEES_CANDIDATURE,
  API_RELECTURE,
  API_ATTRIBUTIONS,
];

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
  return { ...defs, ...DEFS_WEBHOOK };
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
