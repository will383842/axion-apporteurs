/**
 * La charge d'un événement du journal est un schéma Zod FERMÉ par type — DM-01 (REQ-DM-041,
 * partners/ADR-0015 décision 4).
 *
 * POURQUOI FERMÉ. Le journal est append-only : la base refuse toute mise à jour (REQ-DM-024). Une
 * donnée personnelle glissée dans une charge ne pourrait donc JAMAIS être effacée — le droit à
 * l'effacement (RGPD art. 17) buterait sur le déclencheur. La seule issue est qu'aucune charge ne
 * porte de donnée personnelle : alors effacer un tiers ne touche jamais le journal, et la chaîne
 * reste vérifiable après l'effacement.
 *
 * LA LISTE FERMÉE DES FORMES. Chaque feuille d'une charge est l'une de celles-ci, et rien d'autre :
 *   — identifiant       `z.string().uuid()`                                   → `FORMES.identifiant()`
 *   — empreinte         `z.string().regex(HASH_HEX_64)` — CETTE constante      → `FORMES.empreinte()`
 *   — enum / littéral   `z.enum`, `z.nativeEnum`, `z.literal` d'une chaîne
 *   — montant           `z.number().int()` sur un champ suffixé `Cents`       → `FORMES.montantCents()`
 *   — horodatage        `z.string().datetime()`                               → `FORMES.horodatage()`
 *   — `optional` / `nullable` d'une forme admise ; objet imbriqué `.strict()`.
 * Tout le reste est refusé — `z.string()` nu compris : une chaîne libre peut porter un courriel.
 * C'est `scripts/gates/journal-sans-pii.ts` (`pnpm journal:sans-pii`) qui le vérifie, sur le schéma
 * lui-même, et `ajouterEvenement()` qui l'applique à l'exécution (`parse` strict : rien n'est écrit).
 *
 * LES TYPES NE SONT PAS RECOPIÉS D'UNE SOURCE : `TypeEvenementJournal` est l'enum de
 * `prisma/schema.prisma`. L'union locale ci-dessous n'existe que parce que le domaine est pur (il
 * n'importe pas le client Prisma) ; la garde confronte les clés de `CHARGES_PAR_TYPE` aux valeurs de
 * l'enum lues dans le schéma, DANS LES DEUX SENS.
 */
import { z } from 'zod';
import { ALGORITHME } from './journal';
import { EVENEMENTS_APPORTEUR, MOTIFS_RESILIATION, STATUTS_APPORTEUR } from '../apporteur/statut';
import {
  ETATS_ATTRIBUTION,
  EVENEMENTS_ATTRIBUTION,
  NAISSANCES_ATTRIBUTION,
} from '../attribution/machine';
import { STATUTS_PIECE_KYC, TYPES_PIECE_KYC } from '../kyc/pieces';
import { ETATS_CONTESTATION, GESTES_RATTACHEMENT, STATUTS_ANOMALIE } from '../anomalie/regles';

/**
 * Les codes d'événement que porte `apporteur_statut_modifie` : la NAISSANCE (`creer`, `de` nul), puis
 * les flèches de la matrice (`EVENEMENTS_APPORTEUR`, une par flèche de `matrice.ts`). DÉRIVÉS,
 * jamais recopiés ; `creer` n'entre PAS dans la matrice : ce n'est pas une transition admise.
 */
export const TRANSITIONS_DU_JOURNAL_APPORTEUR = ['creer', ...EVENEMENTS_APPORTEUR] as const;

/** L'empreinte admise : SHA-256 en hexadécimal minuscule. La SEULE expression d'empreinte admise. */
export const HASH_HEX_64 = /^[0-9a-f]{64}$/;

/** Les constructeurs des formes admises — un raccourci, pas une obligation : la garde lit le schéma. */
export const FORMES = {
  identifiant: () => z.string().uuid(),
  empreinte: () => z.string().regex(HASH_HEX_64),
  montantCents: () => z.number().int(),
  horodatage: () => z.string().datetime(),
  /**
   * HYP-A02-ACTEUR-JOURNAL — QUI a produit l'événement : OBLIGATOIRE dans la charge hachée de tout
   * type sauf la genèse, et sous CETTE forme seule. `id` est présent si et seulement si l'acteur
   * n'est pas le système : le raffinement le dit. Le conseiller salarié (W19)
   * est un `utilisateur_console` ; une écriture de l'intégration porte `{ par: 'systeme' }`.
   */
  acteur: () =>
    z
      .object({
        par: z.enum(['apporteur', 'utilisateur_console', 'systeme']),
        id: z.string().uuid().optional(),
      })
      .strict()
      .superRefine((a, ctx) => {
        if ((a.par === 'systeme') !== (a.id === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id'],
            message: 'acteur_id_incoherent',
          });
        }
      }),
};

/** Les valeurs de l'enum Prisma `TypeEvenementJournal`, confrontées au schéma par la garde. */
export type TypeEvenementJournal =
  | 'journal_ouvert'
  | 'apporteur_statut_modifie'
  | 'attribution_contact_purge'
  | 'attribution_etat_modifie'
  | 'attribution_peremption_suspendue'
  | 'attribution_porteur_reaffecte'
  | 'piece_kyc_statut_modifie'
  | 'anomalie_statut_modifie'
  | 'contestation_modifiee'
  | 'rattachement_manuel_modifie';

/** DM-08 : le porteur d'une attribution, une forme UNIQUE — sa population et son identifiant. */
const PORTEUR = () =>
  z
    .object({
      type: z.enum(['apporteur', 'utilisateur_console']),
      id: FORMES.identifiant(),
    })
    .strict();

const NAISSANCES: readonly string[] = Object.keys(NAISSANCES_ATTRIBUTION);

export const CHARGES_PAR_TYPE = {
  /** La genèse : l'algorithme de chaînage, inscrit DANS la chaîne. */
  journal_ouvert: z.object({ algorithme: z.literal(ALGORITHME) }).strict(),
  /**
   * Un changement de statut d'apporteur, NAISSANCE comprise (`de` nul, `transition: 'creer'`) : un type
   * par GENRE de transition (ADR-0022 §4, rectification d'A02 sur DM-45). L'apporteur est l'agrégat ;
   * la candidature est déjà portée par `apporteurs.candidature_id`. Aucune donnée personnelle.
   */
  apporteur_statut_modifie: z
    .object({
      de: z.enum(STATUTS_APPORTEUR).nullable(),
      vers: z.enum(STATUTS_APPORTEUR),
      transition: z.enum(TRANSITIONS_DU_JOURNAL_APPORTEUR),
      resiliationMotif: z.enum(MOTIFS_RESILIATION).optional(),
      acteur: FORMES.acteur(),
    })
    .strict()
    .superRefine(({ de, transition }, ctx) => {
      if ((de === null) !== (transition === 'creer')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['de'],
          message: 'naissance_incoherente',
        });
      }
    }),
  /**
   * DM-07 (REQ-DM-031) : la purge du contact d'une attribution. Aucune donnée du contact, seulement
   * l'instant ; l'acteur est la forme unique de `FORMES.acteur()`, RESTREINTE au système — la purge
   * est celle du cron (décision A02 du 2026-10-02).
   */
  attribution_contact_purge: z
    .object({
      purgeAt: FORMES.horodatage(),
      acteur: FORMES.acteur().refine((a) => a.par === 'systeme', {
        message: 'acteur_systeme_attendu',
      }),
    })
    .strict(),
  /**
   * DM-08 (REQ-DM-006) : un changement d'état d'attribution, NAISSANCE comprise (`de` nul). Un type par
   * GENRE de transition (partners/ADR-0022 §4) : `transition` est un code de la matrice
   * (`EVENEMENTS_ATTRIBUTION`), dérivé ; ajouter une flèche modifie cette charge, jamais le schéma.
   * Le lien d'intérêt s'écrit `declare` ou `non_declare` (REQ-DM-041), jamais un booléen.
   */
  attribution_etat_modifie: z
    .object({
      de: z.enum(ETATS_ATTRIBUTION).nullable(),
      vers: z.enum(ETATS_ATTRIBUTION),
      transition: z.enum(EVENEMENTS_ATTRIBUTION),
      acteur: FORMES.acteur(),
      lienInteret: z.enum(['declare', 'non_declare']).optional(),
    })
    .strict()
    .superRefine(({ de, transition }, ctx) => {
      if ((de === null) !== NAISSANCES.includes(transition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['de'],
          message: 'naissance_incoherente',
        });
      }
    }),
  /** DM-08 (REQ-DM-007) : le marqueur qui suspend la péremption, posé par un rôle habilité. */
  attribution_peremption_suspendue: z
    .object({ acteur: FORMES.acteur(), suspendueAt: FORMES.horodatage() })
    .strict(),
  /**
   * DM-08 (W19 (5)) : le porteur réaffecté, de conseiller à conseiller ; aucune donnée de personne,
   * aucune date, et jamais vers lui-même (décision A02 du 2026-10-02).
   */
  attribution_porteur_reaffecte: z
    .object({ de: PORTEUR(), vers: PORTEUR(), acteur: FORMES.acteur() })
    .strict()
    .superRefine(({ de, vers }, ctx) => {
      // W19 (5) ne connaît que la réaffectation ENTRE CONSEILLERS : retirer son entreprise à un
      // apporteur, ou la lui donner, n'est pas une réaffectation (lentilles securite et schema). La forme
      // unique du porteur reste ; un futur genre élargira ce raffinement, pas la forme.
      for (const [cote, p] of [
        ['de', de],
        ['vers', vers],
      ] as const) {
        if (p.type !== 'utilisateur_console') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [cote],
            message: 'porteur_non_conseiller',
          });
        }
      }
      if (de.type === vers.type && de.id === vers.id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vers'], message: 'meme_porteur' });
      }
    }),
  /**
   * DM-11 (REQ-DM-027) : un changement de statut d'une pièce du KYC, sur l'agrégat `piece_kyc`.
   * `de` est nul à la naissance de la pièce. Ni fichier, ni IBAN, ni donnée de personne.
   */
  piece_kyc_statut_modifie: z
    .object({
      de: z.enum(STATUTS_PIECE_KYC).nullable(),
      vers: z.enum(STATUTS_PIECE_KYC),
      type: z.enum(TYPES_PIECE_KYC),
      acteur: FORMES.acteur(),
    })
    .strict(),
  // DM-12 (REQ-DM-033) : l'ouverture (`de` nul) ou la clôture d'une anomalie, agrégat `apporteur`.
  anomalie_statut_modifie: z
    .object({
      anomalieId: FORMES.identifiant(),
      de: z.enum(STATUTS_ANOMALIE).nullable(),
      vers: z.enum(STATUTS_ANOMALIE),
      acteur: FORMES.acteur(),
    })
    .strict(),
  // DM-12 (REQ-DM-043) : la réception (`de` nul) ou la réponse d'une contestation, agrégat `apporteur`.
  contestation_modifiee: z
    .object({
      contestationId: FORMES.identifiant(),
      de: z.enum(ETATS_CONTESTATION).nullable(),
      vers: z.enum(ETATS_CONTESTATION),
      acteur: FORMES.acteur(),
    })
    .strict(),
  // DM-12 (REQ-DM-034) : la décision ou la révocation d'un rattachement manuel, agrégat `attribution`.
  rattachement_manuel_modifie: z
    .object({
      rattachementId: FORMES.identifiant(),
      vers: z.enum(GESTES_RATTACHEMENT),
      acteur: FORMES.acteur(),
    })
    .strict(),
} satisfies Record<TypeEvenementJournal, z.ZodTypeAny>;

/**
 * DM-45 — la charge de NAISSANCE d'un apporteur (`apporteur_statut_modifie`, `de` nul) : construite ICI,
 * dans le domaine du journal, pour qu'aucun appelant n'écrive le vocabulaire du journal à la main.
 */
export function naissanceDApporteur(acteur: z.input<ReturnType<typeof FORMES.acteur>>) {
  return { de: null, vers: 'candidat', transition: 'creer', acteur } as const;
}
