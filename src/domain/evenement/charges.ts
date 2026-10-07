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
import { ARTICLES_MISE_EN_DEMEURE } from '../apporteur/resiliation';
import { ETATS_DE_GEL } from '../apporteur/suspension';
import {
  CRITERES_D_ANTERIORITE,
  ETATS_ATTRIBUTION,
  MOTIFS_ANNULATION_CONSOLE,
  MOTIFS_LISTE_NOIRE,
  EVENEMENTS_ATTRIBUTION,
  NAISSANCES_ATTRIBUTION,
} from '../attribution/machine';
import { MOTIFS_REFUS_PIECE, STATUTS_PIECE_KYC, TYPES_PIECE_KYC } from '../kyc/pieces';
import { ETATS_DEMANDE_CONFIRMATION } from '../confirmation/demande';
import {
  ETATS_CONTESTATION,
  GESTES_DU_GEL,
  GESTES_RATTACHEMENT,
  STATUTS_ANOMALIE,
} from '../anomalie/regles';
import { GESTES_UTILISATEUR_CONSOLE, ROLES_CONSOLE } from '../console/roles';

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
  /**
   * EXCEPTION NOMMÉE à HYP-A02-ACTEUR-JOURNAL (décision d'A02 sur la décision (d) de la juriste,
   * 2026-10-03), pour les seuls événements de cycle de vie d'une ANOMALIE : l'acteur dit QUI a agi
   * (la console ou le système), JAMAIS son identifiant. Qui a traité l'anomalie se lit sur
   * `anomalies.traite_par_id`, et plus du tout après son anonymisation : c'est voulu.
   */
  acteurSansIdentite: () => z.object({ par: z.enum(['utilisateur_console', 'systeme']) }).strict(),
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
  | 'demande_confirmation_etat_modifie'
  | 'anomalie_statut_modifie'
  | 'contestation_modifiee'
  | 'rattachement_manuel_modifie'
  | 'anomalie_gel_modifie'
  | 'utilisateur_console_modifie'
  | 'journal_acces_gel_modifie'
  | 'apporteur_mis_en_demeure'
  | 'apporteur_gel_modifie'
  | 'apporteur_resiliation_notifiee';

/**
 * SEC-61 : le gel du journal des accès à la console — ses gestes, ses motifs (les valeurs de
 * `MotifGelJournal`, confrontées au schéma par la garde des énumérations) et le TYPE de sa portée.
 */
export const GESTES_GEL_JOURNAL = ['poser', 'lever'] as const;
export const MOTIFS_GEL_JOURNAL = ['incident', 'litige'] as const;
export const PORTEES_GEL_JOURNAL = ['utilisateur', 'cible'] as const;

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
      /**
       * SEC-66 (A02, #561, 5988205180, voie 2) : l'UUID de la ligne `decisions_de_contrat` (geste
       * `resiliation`) de la décision OPPOSABLE qui fonde le passage à `resilie` pour `ordinaire_axion`
       * — et lui seul. Cette ligne est aussi permanente que le journal : il garde ainsi quelle décision
       * a été opposée, après la purge de sa notification. Un UUID ne peut rien porter d'autre.
       */
      decisionContratId: FORMES.identifiant().optional(),
      acteur: FORMES.acteur(),
    })
    .strict()
    .superRefine(({ de, transition, vers, resiliationMotif, decisionContratId }, ctx) => {
      if ((de === null) !== (transition === 'creer')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['de'],
          message: 'naissance_incoherente',
        });
      }
      const exigee = vers === 'resilie' && resiliationMotif === 'ordinaire_axion';
      if (exigee !== (decisionContratId !== undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['decisionContratId'],
          message: 'citation_de_la_decision_incoherente',
        });
      }
    }),
  /**
   * SEC-15 (REQ-SEC-019) : la pose et la levée du gel des dépôts (forme d'A02, #794, 6035951154). Un
   * côté vaut `libre`, jamais les deux ; un rôle est une personne de la console, et le plein droit, le
   * système, pour la seule levée. AUCUN identifiant d'anomalie (DM-12, décision (d) de la juriste) : le
   * lien d'un gel pour fraude vit dans `apporteurs.gel_anomalie_id`, jamais au journal.
   */
  apporteur_gel_modifie: z
    .object({
      de: z.enum(ETATS_DE_GEL),
      vers: z.enum(ETATS_DE_GEL),
      par: z.enum(['role', 'plein_droit']),
      acteur: FORMES.acteur(),
    })
    .strict()
    .superRefine(({ de, vers, par, acteur }, ctx) => {
      const faute = (path: string, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if ((de === 'libre') === (vers === 'libre')) faute('vers', 'pose_ou_levee_seulement');
      if (par === 'role' && acteur.par !== 'utilisateur_console')
        faute('acteur', 'role_sans_personne');
      if (par === 'plein_droit' && (acteur.par !== 'systeme' || vers !== 'libre')) {
        faute('par', 'plein_droit_pour_la_seule_levee');
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
      /**
       * DM-67 (REQ-DM-006) : le critère de l'antériorité établie après coup, en enum INTERNE, porté
       * par `anteriorite_etablie` et par elle seule ; aucune donnée de personne.
       */
      critere: z.enum(CRITERES_D_ANTERIORITE).optional(),
      /**
       * Lentille sécurité (rattrapage 99) : la RÉFÉRENCE du fait fondateur — la facture ou le devis
       * d'axion-ia, et sa date. Son identifiant est une chaîne libre au contrat : il entre par son
       * EMPREINTE (SHA-256), qui se retrouve en hachant l'identifiant connu, sans rien laisser passer
       * d'autre. Aucune donnée de personne, la charge est fermée.
       */
      fait: z
        .object({
          nature: z.enum(['facture', 'devis']),
          ref: FORMES.empreinte(),
          le: FORMES.horodatage(),
        })
        .strict()
        .optional(),
    })
    .extend({
      /** DM-55 : le motif fermé d'une annulation par la console, exigé pour elle seule. */
      motifAnnulation: z.enum(MOTIFS_ANNULATION_CONSOLE).optional(),
      /** DM-55 : la catégorie de l'article 3.3 bis, exigée avec ce motif et lui seul. */
      categorieRelation: z.enum(MOTIFS_LISTE_NOIRE).optional(),
    })
    .strict()
    .superRefine(({ de, transition, critere, fait, motifAnnulation, categorieRelation }, ctx) => {
      if ((de === null) !== NAISSANCES.includes(transition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['de'],
          message: 'naissance_incoherente',
        });
      }
      if ((transition === 'anteriorite_etablie') !== (critere !== undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['critere'],
          message: 'critere_incoherent',
        });
      }
      // Le fait fondateur accompagne le critère, et sa nature est celle que le critère nomme.
      const natureAttendue =
        critere === undefined ? undefined : critere === 'cliente' ? 'facture' : 'devis';
      if ((transition === 'annulee_par_la_console') !== (motifAnnulation !== undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motifAnnulation'],
          message: 'motif_annulation_incoherent',
        });
      }
      if (
        (motifAnnulation === 'entreprise_relevant_de_l_article_3_3_bis') !==
        (categorieRelation !== undefined)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categorieRelation'],
          message: 'categorie_incoherente',
        });
      }
      if (fait?.nature !== natureAttendue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fait'],
          message: 'fait_incoherent',
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
   * CPL-T07 (forme d'A02) : le motif FERMÉ d'un refus, exigé si et seulement si `vers` vaut
   * `refusee` ; l'espace le relit dans le dernier événement de l'agrégat de la pièce, sans colonne.
   */
  piece_kyc_statut_modifie: z
    .object({
      de: z.enum(STATUTS_PIECE_KYC).nullable(),
      vers: z.enum(STATUTS_PIECE_KYC),
      type: z.enum(TYPES_PIECE_KYC),
      motifRefus: z.enum(MOTIFS_REFUS_PIECE).optional(),
      acteur: FORMES.acteur(),
    })
    .strict()
    .superRefine((c, ctx) => {
      if ((c.vers === 'refusee') !== (c.motifRefus !== undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motifRefus'],
          message: 'motif_refus_si_et_seulement_si_refusee',
        });
      }
    }),
  /**
   * DM-40 (REQ-DM-060) : un changement d'état de la demande de confirmation, naissance comprise (`de`
   * nul, `planifiee`). Ni jeton, ni empreinte, ni donnée de personne : l'état seul.
   */
  demande_confirmation_etat_modifie: z
    .object({
      de: z.enum(ETATS_DEMANDE_CONFIRMATION).nullable(),
      vers: z.enum(ETATS_DEMANDE_CONFIRMATION),
      acteur: FORMES.acteur(),
    })
    .strict(),
  // DM-12 (REQ-DM-033), décision (d) de la juriste : l'ouverture (`de` nul) ou la clôture d'une
  // anomalie, sur l'agrégat ANOMALIE (son id est `agregatId`). Ni apporteur, ni attribution, ni
  // utilisateur de la console, ni justification, ni score : à l'anonymisation, plus rien ne relie
  // l'événement à une personne. L'EFFET sur l'apporteur part ailleurs, sans id d'anomalie.
  anomalie_statut_modifie: z
    .object({
      de: z.enum(STATUTS_ANOMALIE).nullable(),
      vers: z.enum(STATUTS_ANOMALIE),
      acteur: FORMES.acteurSansIdentite(),
    })
    .strict()
    .superRefine((c, ctx) => {
      // `de` nul à la naissance seulement, qui ouvre l'anomalie.
      if ((c.de === null) !== (c.vers === 'ouverte')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['de'],
          message: 'de_nul_a_la_naissance',
        });
      }
    }),
  // DM-12 (REQ-DM-033) : le gel pour litige d'une anomalie, posé ou levé, sur l'agrégat ANOMALIE.
  // Ni la référence du litige, ni personne : comme `anomalie_statut_modifie`.
  anomalie_gel_modifie: z
    .object({
      vers: z.enum(GESTES_DU_GEL),
      acteur: FORMES.acteurSansIdentite(),
    })
    .strict(),
  // DM-12 (REQ-DM-043) : la réception (`de` nul) ou la réponse d'une contestation, agrégat `apporteur` ;
  // et le gel pour litige, posé ou levé, sans sa référence.
  contestation_modifiee: z
    .object({
      contestationId: FORMES.identifiant(),
      de: z.enum(ETATS_CONTESTATION).nullable(),
      vers: z.enum([...ETATS_CONTESTATION, ...GESTES_DU_GEL]),
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
  // SEC-30 (forme d'A02) : tout changement d'un utilisateur de la console, agrégat
  // `utilisateur_console` (son id est `agregatId`), dans la MÊME transaction que lui. Le rôle avant
  // et après, rien d'autre : ni adresse, ni nom. Pour `valider`, l'acteur EST le validateur.
  utilisateur_console_modifie: z
    .object({
      geste: z.enum(GESTES_UTILISATEUR_CONSOLE),
      de: z.enum(ROLES_CONSOLE).nullable(),
      vers: z.enum(ROLES_CONSOLE).nullable(),
      acteur: FORMES.acteur(),
    })
    .strict()
    .superRefine((c, ctx) => {
      const juste =
        c.geste === 'changer_role'
          ? c.de !== null && c.vers !== null && c.de !== c.vers
          : c.geste === 'inviter'
            ? c.de === null && c.vers !== null
            : c.de === null && c.vers === null;
      if (!juste)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vers'],
          message: 'roles_incoherents_avec_le_geste',
        });
    }),
  // SEC-61 (forme d'A02 et de la sécurité, mot pour mot) : la pose ou la levée d'un gel du journal des
  // accès, sur l'agrégat `journal_acces_gel` (l'id du gel est `agregatId`). AUCUN identifiant
  // d'employé : ni le poseur, ni celui qui lève, ni la personne visée, ni la cible ; la portée n'en
  // dit que le TYPE, l'acteur que sa population, et la référence n'y est qu'en empreinte. Les
  // identifiants vivent sur la ligne du gel et partent avec elle.
  journal_acces_gel_modifie: z
    .object({
      geste: z.enum(GESTES_GEL_JOURNAL),
      motif: z.enum(MOTIFS_GEL_JOURNAL),
      portee: z.object({ type: z.enum(PORTEES_GEL_JOURNAL) }).strict(),
      referenceEmpreinte: FORMES.empreinte(),
      acteur: FORMES.acteurSansIdentite(),
    })
    .strict(),
  /**
   * SEC-19 (forme d'A02, #703, 5980982895 §2) : la mise en demeure datée d'un apporteur (art. 11.2),
   * agrégat `apporteur`. L'article, de la liste FERMÉE, et l'acteur de la console : NI les faits NI
   * aucun texte libre — ils ne vivent que dans le courriel `mise_en_demeure`, dont l'`envoye_at` fait
   * courir le délai. Un fait daté, pas un antécédent : rien ne compte ces événements.
   */
  apporteur_mis_en_demeure: z
    .object({
      article: z.enum(ARTICLES_MISE_EN_DEMEURE),
      acteur: FORMES.acteur().refine((a) => a.par === 'utilisateur_console', {
        message: 'acteur_console_attendu',
      }),
    })
    .strict(),
  /**
   * SEC-66 (forme (b) d'A02, #703, 5983008261) : la DÉCISION de la Société de résilier le contrat
   * (art. 11.1), agrégat `apporteur`. Ce n'est pas un changement de statut : l'apporteur reste `signe`
   * pendant le préavis. Le motif, la date d'effet annoncée (jour civil de Paris de la décision plus
   * `PREAVIS_JOURS`) et l'acteur de la console ; aucun texte libre.
   */
  apporteur_resiliation_notifiee: z
    .object({
      motif: z.literal('ordinaire_axion'),
      /** Minuit, heure de Paris, du jour d'effet, en ISO 8601 UTC (A02, 5988205180). */
      dateEffet: FORMES.horodatage(),
      acteur: FORMES.acteur().refine((a) => a.par === 'utilisateur_console', {
        message: 'acteur_console_attendu',
      }),
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
