/**
 * `variables.ts` — le registre des variables du gabarit de contrat (JUR-T01, REQ-JUR-003).
 *
 * UNE variable du gabarit = UNE source déclarée ici. Aucune valeur n'est écrite dans ce fichier :
 * chaque variable dit D'OÙ sa valeur vient, et c'est cette source qui la porte (RM-01).
 *
 *   `entite`         — `config/entite.json`, le registre unique de l'entité (décision `W1`, CPL-T01).
 *                      Le contrat LIT ces valeurs : il ne les retape pas. Résolue dès aujourd'hui.
 *   `kyc`            — recueillie au KYC de l'apporteur ; jamais saisie à la main.
 *   `grille-contrat` — le snapshot de la grille du présent contrat (`GrilleContrat`, DM-23).
 *   `pricing`        — l'export de `pricing.ts` d'axionia (REQ-DM-014, DM-03-A) : jamais retapé.
 *   `seuil`          — la SSOT des seuils et délais (JUR-T02).
 *   `configuration`  — une valeur versionnée en configuration, sous une décision du registre.
 *   `question`       — AUCUNE décision ne porte cette valeur : elle attend Will. Le refus de
 *                      publication la tient ouverte ; elle n'est jamais inventée.
 *
 * Il n'existe PAS de genre « saisie » : une variable qui se remplirait à la main à la génération
 * (la qualité de commerçant de l'apporteur, par exemple, dont dépend la validité de la clause
 * attributive de juridiction) ne se distinguerait pas d'une variable fausse.
 */
import { valeurResolue, variablesDuTexte } from './gabarit';

export type RenduEntite = 'tel-quel' | 'forme-developpee' | 'siren-par-trois';

export type SourceDeVariable =
  | { readonly genre: 'entite'; readonly cle: string; readonly rendu: RenduEntite }
  | { readonly genre: 'kyc'; readonly champ: string; readonly tache: string }
  | { readonly genre: 'grille-contrat'; readonly champ: string; readonly tache: string }
  | { readonly genre: 'pricing'; readonly champ: string; readonly tache: string }
  | { readonly genre: 'seuil'; readonly constante: string; readonly tache: string }
  | { readonly genre: 'configuration'; readonly cle: string; readonly decision: string }
  | { readonly genre: 'question'; readonly question: string };

const SNAPSHOT = { genre: 'grille-contrat', tache: 'DM-23' } as const;
const EXPORT_PRICING = { genre: 'pricing', tache: 'DM-03-A' } as const;
const SSOT_SEUILS = { genre: 'seuil', tache: 'JUR-T02' } as const;

/** Les variables NOMMÉES du gabarit et de son annexe 2. */
export const VARIABLES: Readonly<Record<string, SourceDeVariable>> = {
  // L'entité qui signe et qui paie — W1.
  SOCIETE: { genre: 'entite', cle: 'entite.denomination', rendu: 'tel-quel' },
  FORME: { genre: 'entite', cle: 'entite.formeJuridique', rendu: 'forme-developpee' },
  SIREN_AXION: { genre: 'entite', cle: 'entite.siren', rendu: 'siren-par-trois' },
  SIRET_AXION: { genre: 'entite', cle: 'entite.siret', rendu: 'tel-quel' },
  TVA_AXION: { genre: 'entite', cle: 'entite.tvaIntracommunautaire', rendu: 'tel-quel' },
  SIEGE: { genre: 'entite', cle: 'entite.siege', rendu: 'tel-quel' },
  // Ce que W1 ne porte pas : aucune décision, donc une question.
  CAPITAL: { genre: 'question', question: 'JUR-T01-Q10' },
  REPRESENTANT: { genre: 'question', question: 'JUR-T01-Q11' },
  // L'apporteur — KYC (DM-11). La qualité de commerçant vient du statut d'exercice recueilli.
  APPORTEUR_IDENTITE: { genre: 'kyc', champ: 'identite', tache: 'DM-11' },
  APPORTEUR_STATUT: { genre: 'kyc', champ: 'statutJuridique', tache: 'DM-11' },
  APPORTEUR_SIREN: { genre: 'kyc', champ: 'siren', tache: 'DM-11' },
  APPORTEUR_SIEGE: { genre: 'kyc', champ: 'siege', tache: 'DM-11' },
  APPORTEUR_QUALITE: { genre: 'kyc', champ: 'qualiteExercice', tache: 'DM-11' },
  // La grille du présent contrat.
  GRILLE_VERSION: { ...SNAPSHOT, champ: 'version' },
  GRILLE_DATE: { ...SNAPSHOT, champ: 'figeeAt' },
  // Les valeurs publiées de référence, par famille (annexe 1).
  PUBLIEE_FORFAIT_JOURNEE: { ...EXPORT_PRICING, champ: 'com-formation-1j' },
  PUBLIEE_TAUX_AUDIT: { ...EXPORT_PRICING, champ: 'com-audit' },
  PUBLIEE_TAUX_INTEGRATION: { ...EXPORT_PRICING, champ: 'com-integration' },
  // Les délais et seuils du contrat.
  FENETRE_MOIS: { ...SSOT_SEUILS, constante: 'FENETRE_MOIS' },
  PEREMPTION_JOURS: { ...SSOT_SEUILS, constante: 'PEREMPTION_JOURS' },
  SEUIL_VERSEMENT: { ...SSOT_SEUILS, constante: 'SEUIL_VERSEMENT' },
  PREAVIS_JOURS: { ...SSOT_SEUILS, constante: 'PREAVIS_JOURS' },
  // Le parrainage : taux et fenêtre versionnés en configuration (HYP-E1-19).
  PARRAINAGE_TAUX: { genre: 'configuration', cle: 'parrainage.taux', decision: 'HYP-E1-19' },
  PARRAINAGE_MOIS: { genre: 'configuration', cle: 'parrainage.fenetreMois', decision: 'HYP-E1-19' },
};

/**
 * Les variables PAR PALIER de l'annexe 1 : `<PREFIXE><IDENTIFIANT DU PALIER>`. La liste des
 * paliers n'est pas retapée ici : elle se lit dans les tableaux de l'annexe (`paliersDeLAnnexe1`).
 */
export const FAMILLES_PAR_PALIER: readonly {
  readonly prefixe: string;
  readonly source: SourceDeVariable;
}[] = [
  { prefixe: 'COM_', source: { ...SNAPSHOT, champ: 'commission du palier' } },
  { prefixe: 'PRIX_', source: { ...EXPORT_PRICING, champ: 'prixReferenceHt' } },
  { prefixe: 'PUBLIEE_', source: { ...EXPORT_PRICING, champ: 'commissionPubliee' } },
  { prefixe: 'CPF_', source: { ...EXPORT_PRICING, champ: 'cpfEligible' } },
];

/** `intervention-4h` → `INTERVENTION_4H`. */
export function suffixeDePalier(identifiant: string): string {
  return identifiant.toUpperCase().replace(/-/g, '_');
}

/** La source d'une variable, ou `null` si elle n'est déclarée nulle part. */
export function sourceDe(nom: string, paliers: readonly string[]): SourceDeVariable | null {
  if (Object.hasOwn(VARIABLES, nom)) return VARIABLES[nom]!;
  for (const f of FAMILLES_PAR_PALIER) {
    if (paliers.some((p) => nom === f.prefixe + suffixeDePalier(p))) return f.source;
  }
  return null;
}

export type FauteDeVariable = { readonly famille: string; readonly message: string };

/**
 * Le contrôle des variables d'un texte : toute variable a une source ; toute variable « question »
 * renvoie à une question déclarée ; aucune variable nommée n'est déclarée sans être employée.
 */
export function controlerVariables(entree: {
  texte: string;
  paliers: readonly string[];
  questions: readonly { readonly id: string }[];
}): FauteDeVariable[] {
  const fautes: FauteDeVariable[] = [];
  const employees = new Set(variablesDuTexte(entree.texte));
  for (const nom of employees) {
    const source = sourceDe(nom, entree.paliers);
    if (source === null) {
      fautes.push({
        famille: 'variable_non_declaree',
        message:
          `{{${nom}}} n'a aucune source déclarée dans src/domain/contrat/variables.ts. Une variable ` +
          `sans source se remplit à la main à la génération, et une valeur saisie ne se distingue ` +
          `pas d'une valeur fausse : déclare sa source, ou une question si aucune décision ne la porte.`,
      });
    } else if (
      source.genre === 'question' &&
      !entree.questions.some((q) => q.id === source.question)
    ) {
      fautes.push({
        famille: 'question_absente',
        message: `{{${nom}}} attend la question ${source.question}, qui n'est plus déclarée.`,
      });
    }
  }
  for (const nom of Object.keys(VARIABLES)) {
    if (!employees.has(nom)) {
      fautes.push({
        famille: 'declaration_orpheline',
        message: `{{${nom}}} est déclarée mais n'apparaît plus dans le gabarit : retire sa déclaration.`,
      });
    }
  }
  return fautes;
}

/** Le libellé développé d'une forme juridique, tel qu'un contrat l'écrit. */
const FORMES_DEVELOPPEES: Readonly<Record<string, string>> = {
  SAS: 'société par actions simplifiée',
};

export type Resolution = { readonly valeur: string } | { readonly manque: string };

/**
 * La valeur d'une variable d'ENTITÉ, lue par `lire` dans le registre de l'entité. `sentinelle` est
 * la valeur « à renseigner » de ce registre : une clé qui la porte ne résout pas.
 */
export function valeurDEntite(
  source: SourceDeVariable,
  lire: (cle: string) => string | undefined,
  sentinelle: string
): Resolution {
  if (source.genre !== 'entite') return { manque: `source « ${source.genre} », pas l'entité` };
  const brute = lire(source.cle);
  if (brute === undefined || valeurResolue(brute, [sentinelle]) === null) {
    return { manque: `${source.cle} n'est pas renseignée` };
  }
  if (source.rendu === 'forme-developpee') {
    const developpee = FORMES_DEVELOPPEES[brute];
    return developpee === undefined
      ? { manque: `forme juridique « ${brute} » sans libellé développé` }
      : { valeur: developpee };
  }
  if (source.rendu === 'siren-par-trois') {
    return /^\d{9}$/.test(brute)
      ? { valeur: brute.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') }
      : { manque: `${source.cle} n'est pas un SIREN à neuf chiffres` };
  }
  return { valeur: brute };
}
