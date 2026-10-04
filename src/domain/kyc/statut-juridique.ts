/**
 * Le statut juridique de l'apporteur — une liste FERMÉE rangée dans sa qualité d'exercice (DM-56,
 * REQ-DM-065).
 *
 * LES LISTES sont celles des enums Prisma `StatutJuridique` et `QualiteExercice`, que la garde
 * `partners:schema:enums` confronte au glossaire ; le témoin `statut-juridique.spec.ts` les confronte
 * au schéma. Le domaine n'importe pas le client de base de données : il les écrit une fois, et les
 * deux confrontations en tiennent l'égalité.
 *
 * LA CORRESPONDANCE est une fonction pure (`qualiteDuStatut`) : les six sociétés donnent
 * `societe_commerciale`, les deux formes individuelles la qualité de l'activité déclarée. Le CHECK
 * `apporteurs_qualite_suit_le_statut` en est le garde-fou en base (partners/ADR-0022 §8).
 *
 * LE LIBELLÉ est celui du glossaire §4, que lit `{{APPORTEUR_STATUT}}` au préambule du contrat —
 * jamais une chaîne libre. Le témoin confronte chaque libellé à la ligne du glossaire.
 *
 * CE QUI N'EST PAS ICI. Le portage salarial et l'entrepreneur-salarié de coopérative ne sont pas des
 * valeurs : ils changent qui signe et qui facture, et relèvent de la phase 2.
 */

/** Les statuts juridiques (REQ-DM-065), dans l'ordre du glossaire. */
export const STATUTS_JURIDIQUES = [
  'micro_entrepreneur',
  'entrepreneur_individuel',
  'sarl',
  'eurl',
  'sas',
  'sasu',
  'sa',
  'snc',
] as const;
export type StatutJuridique = (typeof STATUTS_JURIDIQUES)[number];

/** Les six sociétés : elles, et elles seules, sont de qualité `societe_commerciale`. */
export const STATUTS_SOCIETE = [
  'sarl',
  'eurl',
  'sas',
  'sasu',
  'sa',
  'snc',
] as const satisfies readonly StatutJuridique[];

/** Les qualités d'exercice (DM-50, REQ-JUR-022), quatre valeurs, dans l'ordre du glossaire. */
export const QUALITES_EXERCICE = [
  'commercant',
  'societe_commerciale',
  'artisan',
  'profession_liberale',
] as const;
export type QualiteExercice = (typeof QUALITES_EXERCICE)[number];

/** Les qualités qu'une forme individuelle tient de son activité déclarée. */
export const QUALITES_INDIVIDUELLES = [
  'commercant',
  'artisan',
  'profession_liberale',
] as const satisfies readonly QualiteExercice[];
export type QualiteIndividuelle = (typeof QUALITES_INDIVIDUELLES)[number];

/** Le libellé de chaque statut, celui du glossaire §4 (lu par `{{APPORTEUR_STATUT}}`). */
export const LIBELLES_STATUT_JURIDIQUE: Readonly<Record<StatutJuridique, string>> = {
  micro_entrepreneur: 'micro-entrepreneur',
  entrepreneur_individuel: 'entrepreneur individuel',
  sarl: 'société à responsabilité limitée (SARL)',
  eurl: 'entreprise unipersonnelle à responsabilité limitée (EURL)',
  sas: 'société par actions simplifiée (SAS)',
  sasu: 'société par actions simplifiée unipersonnelle (SASU)',
  sa: 'société anonyme (SA)',
  snc: 'société en nom collectif (SNC)',
};

/** Vrai pour une valeur de la liste, exactement écrite ; faux pour toute autre saisie. */
export function estStatutJuridique(valeur: unknown): valeur is StatutJuridique {
  return typeof valeur === 'string' && (STATUTS_JURIDIQUES as readonly string[]).includes(valeur);
}

/**
 * La qualité d'exercice qu'un statut emporte : `societe_commerciale` pour une société, quelle que soit
 * l'activité ; pour une forme individuelle, la qualité de l'activité déclarée, ou `null` quand elle
 * n'est pas déclarée ou hors liste (jamais devinée).
 */
export function qualiteDuStatut(
  statut: StatutJuridique,
  activite?: QualiteIndividuelle
): QualiteExercice | null {
  if ((STATUTS_SOCIETE as readonly string[]).includes(statut)) return 'societe_commerciale';
  return activite !== undefined && (QUALITES_INDIVIDUELLES as readonly string[]).includes(activite)
    ? activite
    : null;
}

/** Le libellé d'un statut, tel que le glossaire l'écrit. */
export function libelleDuStatut(statut: StatutJuridique): string {
  return LIBELLES_STATUT_JURIDIQUE[statut];
}
