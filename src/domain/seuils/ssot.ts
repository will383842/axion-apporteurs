/**
 * `ssot.ts` — la source unique des seuils et des délais (JUR-T02 : REQ-JUR-015, REQ-JUR-029 ; RM-10).
 *
 * UN SEUIL, UNE SOURCE, UNE DATE. Chaque constante est nommée d'après ce qu'elle mesure, porte sa
 * source (l'article du contrat, la loi ou l'exigence qui la fixe) et la date à laquelle cette source
 * a été confrontée. Aucun de ces littéraux ne s'écrit ailleurs dans `src/` : la garde
 * `scripts/gates/seuils-ssot.ts` le vérifie, et elle vérifie aussi que chaque valeur écrite dans le
 * gabarit de contrat, à l'article que `renvois` nomme, est celle d'ici.
 *
 * CE QUI N'Y FIGURE PAS, ET NE DOIT JAMAIS Y FIGURER. Aucune constante de gradation, aucun seuil de
 * manquements, aucun délai de « contradictoire » : retirés du produit le 2026-09-03 (`HYP-D11`).
 *
 * CE QUI N'Y FIGURE PAS ENCORE, ET POURQUOI. La durée de l'attribution (`{{FENETRE_MOIS}}`, art. 3.4
 * al. 1) est tenue par la question `JUR-T01-Q02` (`HYP-E1-9`, ligne `avenant` non tranchée) : la
 * SSOT n'invente pas une valeur que le registre ne porte pas. La fenêtre du parrainage vit en
 * configuration (`HYP-E1-19`, `src/domain/contrat/variables.ts`).
 *
 * Les montants sont en CENTIMES hors taxes (`docs/CONVENTIONS.md`, argent en centimes).
 */

export type UniteDeSeuil = 'jours' | 'jours_ouvres' | 'mois' | 'ans' | 'centimes';

/** Un endroit du contrat où la valeur est écrite : le corps du contrat, ou son annexe 2. */
export type Renvoi = { readonly document: 'contrat' | 'annexe-2'; readonly unite: string };

export type Seuil = {
  readonly valeur: number;
  readonly unite: UniteDeSeuil;
  /** Ce qui fixe la valeur : article du contrat, texte de loi, exigence ou décision du registre. */
  readonly source: string;
  /** Les unités du gabarit où la valeur est écrite ; vide si le contrat ne l'écrit pas. */
  readonly renvois: readonly Renvoi[];
  /** Date ISO de la dernière confrontation de la valeur à sa source. */
  readonly verifieLe: string;
};

const LE = '2026-09-27';
const art = (...unites: string[]): Renvoi[] =>
  unites.map((unite) => ({ document: 'contrat', unite }));

export const SEUILS = {
  PRISE_DE_CONTACT_JOURS_OUVRES: {
    valeur: 2,
    unite: 'jours_ouvres',
    source: 'contrat art. 3.2',
    renvois: art('3.2'),
    verifieLe: LE,
  },
  CONFIRMATION_TACITE_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 3.2',
    renvois: art('3.2'),
    verifieLe: LE,
  },
  ANTERIORITE_CLIENT_MOIS: {
    valeur: 24,
    unite: 'mois',
    source: 'contrat art. 3.3',
    renvois: art('3.3'),
    verifieLe: LE,
  },
  ANTERIORITE_DEVIS_MOIS: {
    valeur: 6,
    unite: 'mois',
    source: 'contrat art. 3.3',
    renvois: art('3.3'),
    verifieLe: LE,
  },
  PEREMPTION_JOURS: {
    valeur: 90,
    unite: 'jours',
    source: 'contrat art. 3.4 al. 2',
    renvois: art('3.4'),
    verifieLe: LE,
  },
  PROLONGATION_DEVIS_MOIS: {
    valeur: 3,
    unite: 'mois',
    source: 'contrat art. 3.4 al. 3 (W9)',
    renvois: art('3.4'),
    verifieLe: LE,
  },
  FILE_FENETRE_REDECLARATION_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.5',
    renvois: art('3.5'),
    verifieLe: LE,
  },
  FILE_EXPIRATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 3.5',
    renvois: art('3.5'),
    verifieLe: LE,
  },
  SUSPENSION_MAX_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.7',
    renvois: art('3.7'),
    verifieLe: LE,
  },
  REPRISE_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 4.5',
    renvois: art('4.5'),
    verifieLe: LE,
  },
  SEUIL_VERSEMENT: {
    valeur: 5_000,
    unite: 'centimes',
    source: 'contrat art. 5.1 ; REQ-ARG-015',
    renvois: art('5.1'),
    verifieLe: LE,
  },
  CONTESTATION_FACTURE_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 5.2',
    renvois: art('5.2'),
    verifieLe: LE,
  },
  VERSEMENT_JOURS_OUVRES: {
    valeur: 10,
    unite: 'jours_ouvres',
    source: 'contrat art. 5.3',
    renvois: art('5.3'),
    verifieLe: LE,
  },
  VERSEMENT_PLAFOND_JOURS: {
    valeur: 60,
    unite: 'jours',
    source: 'contrat art. 5.3 ; C. com. L.441-10, I',
    renvois: art('5.3'),
    verifieLe: LE,
  },
  FORCLUSION_CONTESTATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 5.5',
    renvois: art('5.5'),
    verifieLe: LE,
  },
  REPONSE_CONTESTATION_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 3.3 et 5.6',
    renvois: art('3.3', '5.6'),
    verifieLe: LE,
  },
  VIGILANCE_PERIODICITE_MOIS: {
    valeur: 6,
    unite: 'mois',
    source: 'contrat art. 6.2 ; C. trav. D.8222-5',
    renvois: art('6.2'),
    verifieLe: LE,
  },
  SEUIL_VIGILANCE: {
    valeur: 500_000,
    unite: 'centimes',
    source:
      'C. trav. L.8222-1 et D.8222-5 (contrat art. 5.4) — valeur de REQ-ARG-025, texte de loi non relu ici',
    renvois: [],
    verifieLe: LE,
  },
  SEUIL_DAS2: {
    valeur: 240_000,
    unite: 'centimes',
    source: 'HYP-D9 (à confirmer avec l’expert-comptable) — valeur de REQ-JUR-015',
    renvois: [],
    verifieLe: LE,
  },
  CONFIDENTIALITE_ANS: {
    valeur: 2,
    unite: 'ans',
    source: 'contrat art. 9',
    renvois: art('9'),
    verifieLe: LE,
  },
  PREAVIS_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat art. 11.1 — unique, jamais indexé sur l’ancienneté (M-16)',
    renvois: art('11.1'),
    verifieLe: LE,
  },
  MISE_EN_DEMEURE_JOURS: {
    valeur: 15,
    unite: 'jours',
    source: 'contrat art. 11.2',
    renvois: art('11.2'),
    verifieLe: LE,
  },
  IMPUTATION_MOIS: {
    valeur: 12,
    unite: 'mois',
    source: 'contrat art. 12.4',
    renvois: art('12.4'),
    verifieLe: LE,
  },
  FORCE_MAJEURE_MOIS: {
    valeur: 3,
    unite: 'mois',
    source: 'contrat art. 15',
    renvois: art('15'),
    verifieLe: LE,
  },
  PALIER_HORS_GRILLE_JOURS: {
    valeur: 60,
    unite: 'jours',
    source: 'contrat annexe 1, A1.7',
    renvois: art('A1.7'),
    verifieLe: LE,
  },
  MANDAT_DENONCIATION_JOURS: {
    valeur: 30,
    unite: 'jours',
    source: 'contrat annexe 2, 2.5',
    renvois: [{ document: 'annexe-2', unite: '2.5' }],
    verifieLe: LE,
  },
  CONSERVATION_PIECES_ANS: {
    valeur: 10,
    unite: 'ans',
    source: 'REQ-JUR-029 (contrats, autofactures, relevés, preuves de paiement) ; C. com. L.123-22',
    renvois: [],
    verifieLe: LE,
  },
} as const satisfies Record<string, Seuil>;

export type NomDeSeuil = keyof typeof SEUILS;
