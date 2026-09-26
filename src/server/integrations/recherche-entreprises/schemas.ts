/**
 * Les schémas du client de recherche d'entreprises — INT-T09 (REQ-QA-028, REQ-INT-021, REQ-SEC-013).
 *
 * TROIS FRONTIÈRES, TROIS SCHÉMAS, et chacun dans le sens qui échoue fermé :
 *
 *   1. CE QUE LE TIERS RENVOIE (`schemaReponseDuTiers`). Il ne décrit que les champs que nous
 *      CONSOMMONS, et il les exige : un champ consommé qui disparaît ou change de type fait refuser
 *      la réponse — le parcours bascule alors en saisie manuelle, il ne « complète » rien (RM-03).
 *      Tout le reste est RETIRÉ à la lecture (`z.object` retire les clés qu'il ne connaît pas) :
 *      l'année et le mois de naissance d'un dirigeant, sa nationalité, l'adresse en clair du siège
 *      n'existent plus dans l'objet lu. La première défense contre leur fuite est qu'ils ne sont
 *      jamais lus. La dérive des champs NON consommés est le travail du contrat nocturne.
 *
 *   2. CE QUE LE NAVIGATEUR REÇOIT (`schemaReponseAutocompletion`). Une liste BLANCHE stricte :
 *      toute clé en plus — des dirigeants, une année — fait lever, et le mandataire ne rend rien
 *      qu'il n'ait passé par ce schéma (REQ-SEC-013). C'est la défense à l'exécution derrière la
 *      garde lexicale `scripts/gates/aucun-annee-de-naissance.ts`.
 *
 *   3. CE QUI EST PERSISTÉ (`schemaFicheEntreprise`). Exactement les champs de REQ-INT-021, stricts
 *      à chaque niveau ; des dirigeants, une empreinte et la qualité, rien d'autre.
 *
 * Les formes ont été établies sur les réponses RÉELLES enregistrées le 2026-09-19
 * (`tests/fixtures/recherche-entreprises/`), et confrontées à la documentation officielle du même
 * jour (https://recherche-entreprises.api.gouv.fr/openapi.json) : là où la documentation ne dit
 * pas « nullable » mais où une réponse réelle porte `null` (`categorie_entreprise`), c'est la
 * réponse réelle qui fait foi.
 */
import { z } from 'zod';
import { saisieNormalisee } from './parametres';

const SIREN = /^\d{9}$/;
const SIRET = /^\d{14}$/;
const texteOuNul = z.string().nullable();

// ── 1. Le tiers ─────────────────────────────────────────────────────────────────────────────────

/** Une personne physique : ni année, ni mois de naissance, ni nationalité ne sont LUS. */
const schemaDirigeantPersonnePhysique = z.object({
  type_dirigeant: z.literal('personne physique'),
  nom: texteOuNul,
  prenoms: texteOuNul,
  qualite: texteOuNul,
});

const schemaDirigeantPersonneMorale = z.object({
  type_dirigeant: z.literal('personne morale'),
  siren: texteOuNul,
  denomination: texteOuNul,
  qualite: texteOuNul,
});

/** Un troisième type de dirigeant est une dérive de forme : refusé. */
const schemaDirigeantDuTiers = z.discriminatedUnion('type_dirigeant', [
  schemaDirigeantPersonnePhysique,
  schemaDirigeantPersonneMorale,
]);

const schemaSiegeDuTiers = z.object({
  siret: z.string().regex(SIRET),
  code_postal: texteOuNul,
  libelle_commune: texteOuNul,
  departement: texteOuNul,
  region: texteOuNul,
  statut_diffusion_etablissement: z.string(),
});

const schemaResultatDuTiers = z.object({
  siren: z.string().regex(SIREN),
  nom_complet: z.string(),
  nature_juridique: texteOuNul,
  activite_principale: texteOuNul,
  tranche_effectif_salarie: texteOuNul,
  /** `A` active, `C` cessée — les deux seules valeurs vues ; une troisième est une dérive. */
  etat_administratif: z.enum(['A', 'C']),
  categorie_entreprise: texteOuNul,
  /** `O` diffusible, `P` diffusion partielle (documentation) ; toute autre valeur vaut partielle. */
  statut_diffusion: z.string(),
  siege: schemaSiegeDuTiers,
  dirigeants: z.array(schemaDirigeantDuTiers),
});

export const schemaReponseDuTiers = z.object({
  results: z.array(schemaResultatDuTiers),
  total_results: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  per_page: z.number().int().positive(),
  total_pages: z.number().int().nonnegative(),
});

export type ReponseDuTiers = z.infer<typeof schemaReponseDuTiers>;
export type ResultatDuTiers = z.infer<typeof schemaResultatDuTiers>;
export type DirigeantDuTiers = z.infer<typeof schemaDirigeantDuTiers>;

// ── 2. Le navigateur ────────────────────────────────────────────────────────────────────────────

/** Ce que l'apporteur voit d'une entreprise proposée : de quoi la reconnaître, rien de plus. */
export const schemaSuggestion = z
  .object({
    siren: z.string().regex(SIREN),
    siret: z.string().regex(SIRET),
    nom: z.string(),
    /** `null` quand la diffusion est partielle : l'adresse n'est pas affichée. */
    codePostal: texteOuNul,
    commune: texteOuNul,
  })
  .strict();
export type Suggestion = z.infer<typeof schemaSuggestion>;

/**
 * Pourquoi le parcours bascule en saisie manuelle. Aucun de ces motifs ne bloque le dépôt : ils
 * disent seulement pourquoi l'autocomplétion n'est pas proposée.
 */
export const MOTIFS_DE_SAISIE_MANUELLE = [
  'refus_exces',
  'delai_depasse',
  'erreur_serveur',
  'requete_refusee',
  'reponse_illisible',
  'disjoncteur_ouvert',
  'debit_global',
  'limite_atteinte',
  'limiteur_indisponible',
  'adresse_illisible',
] as const;
export type MotifDeSaisieManuelle = (typeof MOTIFS_DE_SAISIE_MANUELLE)[number];

export const schemaReponseAutocompletion = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('autocompletion'), suggestions: z.array(schemaSuggestion) }).strict(),
  z
    .object({ mode: z.literal('saisie_manuelle'), motif: z.enum(MOTIFS_DE_SAISIE_MANUELLE) })
    .strict(),
  z.object({ mode: z.literal('requete_invalide') }).strict(),
]);
export type ReponseAutocompletion = z.infer<typeof schemaReponseAutocompletion>;

/**
 * Ce que le navigateur envoie. Trois caractères au moins : c'est la règle du tiers, lue dans sa
 * réponse d'erreur le 2026-09-19 (« 3 caractères minimum pour les termes de la requête ») — une
 * saisie plus courte ne part pas.
 */
export const schemaEntreeAutocompletion = z
  .object({
    q: z.string().transform(saisieNormalisee).pipe(z.string().min(3).max(100)),
    /** Le second critère de tri (REQ-UX-020) : jamais envoyé au tiers. */
    ville: z.string().trim().max(100).optional(),
  })
  .strict();

// ── 3. La fiche persistée ───────────────────────────────────────────────────────────────────────

/** Une empreinte HMAC-SHA-256 en hexadécimal : la seule trace d'un dirigeant qui se garde. */
const schemaDirigeantPersiste = z
  .object({ empreinte: z.string().regex(/^[0-9a-f]{64}$/), qualite: texteOuNul })
  .strict();

/** REQ-INT-021, mot pour mot, et strict à chaque niveau : un champ en trop est refusé. */
export const schemaFicheEntreprise = z
  .object({
    siren: z.string().regex(SIREN),
    siret: z.string().regex(SIRET),
    nom_complet: z.string(),
    nature_juridique: texteOuNul,
    activite_principale: texteOuNul,
    tranche_effectif_salarie: texteOuNul,
    etat_administratif: z.string(),
    categorie_entreprise: texteOuNul,
    siege: z
      .object({
        code_postal: texteOuNul,
        libelle_commune: texteOuNul,
        departement: texteOuNul,
        region: texteOuNul,
      })
      .strict(),
    dirigeants: z.array(schemaDirigeantPersiste),
  })
  .strict();
export type FicheEntreprise = z.infer<typeof schemaFicheEntreprise>;

/** Ce que le cache garde d'une recherche : la projection, jamais la réponse brute. */
export const schemaProjection = z
  .object({ suggestions: z.array(schemaSuggestion), fiches: z.array(schemaFicheEntreprise) })
  .strict();
export type Projection = z.infer<typeof schemaProjection>;
