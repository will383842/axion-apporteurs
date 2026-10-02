/**
 * grille.ts — le contrat de la grille de commission publiée par axion-ia vers Axion Partners
 * (REQ-DM-014, REQ-INT-017 ; INT-T47-P, contrat arrêté par A02 le 2026-10-02, HYP-GRILLE-SCHEMA-2).
 *
 * UNE SEULE FORME, DEUX DÉPÔTS. Ce fichier est la source ; axion-ia le recopie À L'IDENTIQUE
 * (INT-T47-A), et les deux dépôts épinglent la même empreinte de son JSON Schema
 * (`tests/unit/integration/contrat-grille-hash.spec.ts`, patron de partners/ADR-0008). Ordre du
 * passage : Partners lit 1 et 2 D'ABORD, puis axion-ia publie 2.
 *
 * DEUX SCHÉMAS LISIBLES, ET AUCUN AUTRE.
 *   — `schema: 1` : la forme d'origine (DM-03-A). Les versions importées sont immuables : elles
 *     restent lisibles, pour les commissions ;
 *   — `schema: 2` = schema 1 + DEUX champs par palier, rien de retiré ni de renommé :
 *     `cpfEligible` (booléen, obligatoire, jamais nul) et `prixReferenceHtCents` (entier ≥ 0 en
 *     centimes HT, ou `null` sans prix public ; jamais un flottant ni une chaîne).
 *   — Tout autre `schema` est REFUSÉ, nommé : échec fermé.
 * La commission PUBLIÉE d'un palier n'est PAS dans le contrat : Partners la DÉRIVE de la ligne de
 * commission par sa correspondance fermée (`src/domain/commission/grille.ts`). La publier ferait une
 * seconde source de la même vérité, dans deux dépôts.
 *
 * LES OBJETS SONT FERMÉS. Un champ inconnu, un montant à virgule, un forfait sans montant ou un
 * pourcentage hors de ]0, 10 000] points de base sont REFUSÉS, jamais complétés.
 */
import { z } from 'zod';

/** La version de FORME que publie le producteur. Change si un champ change. */
export const SCHEMA_GRILLE = 2;

/** Les formes que Partners LIT : les versions importées sont immuables, l'ancienne reste lisible. */
export const SCHEMAS_LISIBLES = [1, 2] as const;
export type SchemaLisible = (typeof SCHEMAS_LISIBLES)[number];

/** Le plafond d'un taux : 100 % en points de base. */
export const BPS_MAX = 10_000;

/** Les trois genres de commission d'axion-ia (`CommercialCommission.kind`), recopiés tels quels. */
export const GENRES_DE_COMMISSION = ['flat', 'percent', 'scale'] as const;
export type GenreDeCommission = (typeof GENRES_DE_COMMISSION)[number];

/** Une empreinte : SHA-256 en hexadécimal minuscule. */
const EMPREINTE = /^[0-9a-f]{64}$/;

const ligneCommission = z
  .object({
    commissionId: z.string().min(1),
    libelleFr: z.string().min(1),
    kind: z.enum(GENRES_DE_COMMISSION),
    montantCents: z.number().int().positive().nullable(),
    tauxBps: z.number().int().min(1).max(BPS_MAX).nullable(),
  })
  .strict()
  .superRefine((l, ctx) => {
    const attendu = {
      flat: { montantCents: true, tauxBps: false },
      percent: { montantCents: false, tauxBps: true },
      scale: { montantCents: false, tauxBps: false },
    }[l.kind];
    for (const champ of ['montantCents', 'tauxBps'] as const) {
      if ((l[champ] !== null) !== attendu[champ]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [champ],
          message: `commission « ${l.commissionId} » (${l.kind}) : ${champ} ${attendu[champ] ? 'requis' : 'interdit'}`,
        });
      }
    }
  });

const champsDuPalier = {
  tierId: z.string().min(1),
  categorie: z.string().min(1),
  commissionId: z.string().min(1).nullable(),
  statut: z.enum(['taux', 'bareme_indefini']),
  baremeIndefini: z
    .object({
      depuis: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      motif: z.enum(['hors_perimetre_w6', 'bareme_non_publie', 'palier_sans_bareme', 'non_declare']),
    })
    .strict()
    .nullable(),
};

const coherenceDuPalier = {
  message: 'un palier « taux » ne porte aucun barème indéfini, et inversement',
  path: ['baremeIndefini'],
};

const lignePalierV1 = z
  .object(champsDuPalier)
  .strict()
  .refine((p) => (p.statut === 'taux') === (p.baremeIndefini === null), coherenceDuPalier);

/** Schema 2 : les deux champs ajoutés, obligatoires, l'objet toujours fermé. */
const lignePalierV2 = z
  .object({
    ...champsDuPalier,
    cpfEligible: z.boolean(),
    prixReferenceHtCents: z.number().int().min(0).nullable(),
  })
  .strict()
  .refine((p) => (p.statut === 'taux') === (p.baremeIndefini === null), coherenceDuPalier);

const champsDuContenu = {
  unites: z
    .object({ montant: z.literal('centimes_ht'), taux: z.literal('points_de_base') })
    .strict(),
  grilleVersionEvenement: z.string().regex(/^[0-9a-f]{12}$/),
  commissions: z.array(ligneCommission).min(1),
};

const contenuV1 = z
  .object({ schema: z.literal(1), ...champsDuContenu, paliers: z.array(lignePalierV1).min(1) })
  .strict();
const contenuV2 = z
  .object({ schema: z.literal(2), ...champsDuContenu, paliers: z.array(lignePalierV2).min(1) })
  .strict();

const empreinte = z.string().regex(EMPREINTE);

/** Le fichier `commissions.v<N>.json` publié par axion-ia, en schema 1 ou 2. */
export const SCHEMA_PUBLICATION_GRILLE = z
  .object({
    version: z.number().int().positive(),
    publieeAt: z.string().datetime(),
    hash: empreinte,
    empreintesLignes: z
      .object({ commissions: z.record(empreinte), paliers: z.record(empreinte) })
      .strict(),
    contenu: z.discriminatedUnion('schema', [contenuV1, contenuV2]),
  })
  .strict();

export type PublicationGrille = z.infer<typeof SCHEMA_PUBLICATION_GRILLE>;
export type ContenuGrille = PublicationGrille['contenu'];
export type LigneCommissionPubliee = ContenuGrille['commissions'][number];
export type PalierPublie = ContenuGrille['paliers'][number];
