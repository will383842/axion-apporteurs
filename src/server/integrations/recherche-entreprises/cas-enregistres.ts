/**
 * Les cas enregistrés — INT-T09 (REQ-QA-028 : « ≥ 20 cas »).
 *
 * LA LISTE UNIQUE des saisies que l'enregistreur de fixtures rejoue contre l'API réelle, et que le
 * contrat nocturne rejoue à son tour : les deux lisent CE tableau, jamais une copie (RM-01). Chaque
 * cas dit ce qu'il couvre ; les saisies sont des raisons sociales et des numéros d'entreprises,
 * jamais un nom de personne.
 */
export interface CasEnregistre {
  /** Le nom du cas : unique, il devient le nom du fichier de fixture. */
  readonly cas: string;
  readonly q: string;
}

export const CAS_ENREGISTRES: readonly CasEnregistre[] = [
  { cas: 'raison-sociale-exacte', q: 'danone' },
  { cas: 'numero-siren', q: '552032534' },
  { cas: 'numero-siret', q: '55203253400646' },
  { cas: 'faute-de-frappe-non-absorbee', q: 'danoen' },
  { cas: 'mot-tronque', q: 'decath' },
  { cas: 'raison-sociale-composee', q: 'leroy merlin' },
  { cas: 'sigle', q: 'sncf' },
  { cas: 'association', q: 'restos du coeur' },
  { cas: 'entreprise-cessee', q: 'virgin stores' },
  { cas: 'aucun-resultat', q: 'zzqqxwvk' },
  { cas: 'collectivite', q: 'commune de grenoble' },
  { cas: 'dirigeant-personne-morale', q: 'lvmh' },
  { cas: 'accents', q: 'société générale' },
  { cas: 'apostrophe', q: "l'oreal" },
  { cas: 'chiffres-dans-le-nom', q: '3m france' },
  { cas: 'etablissement-public', q: 'france travail' },
  { cas: 'societe-civile-immobiliere', q: 'sci du chateau' },
  { cas: 'trois-caracteres', q: 'edf' },
  { cas: 'raison-sociale-et-ville', q: 'boulangerie grenoble' },
  { cas: 'raison-sociale-et-code-postal', q: 'carrefour 38100' },
  { cas: 'organisme-de-formation', q: 'axion ia' },
  { cas: 'cooperative', q: 'scop' },
];
