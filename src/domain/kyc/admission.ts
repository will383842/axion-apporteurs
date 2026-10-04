/**
 * L'admission au KYC — refuser par motif NOMMÉ, bloquer sans refuser (DM-56, REQ-JUR-063).
 *
 * LES MOTIFS sont des codes du domaine, NON persistés (précision (c) d'A02 : aucune migration pour
 * eux), rendus ensemble et dans cet ordre quand plusieurs valent :
 *   — `siren_inactif` : l'absence de SIREN actif ; un état inconnu vaut inactif (échec fermé) ;
 *   — `lien_avec_la_societe` : la personne salariée, dirigeante ou associée d'Axion-IA, sur sa SEULE
 *     déclaration — jamais déduit du contrôle croisé ;
 *   — `statut_hors_liste` : un statut hors de la liste fermée de REQ-DM-065 ;
 *   — `profession_exclue` : un code NAF de la liste des professions dont la déontologie interdit de
 *     percevoir un apport (avocats, notaires, commissaires de justice, professions de santé).
 *
 * LE CONTRÔLE CROISÉ (REQ-CPL-030) ne refuse jamais : une correspondance avec un conseiller salarié
 * actif BLOQUE pour revue humaine, et la réponse au candidat est IDENTIQUE qu'il y ait correspondance
 * ou non. La comparaison porte sur des empreintes de courriel sous `PII_HASH_KEY`, calculées hors
 * d'ici ; une empreinte hors forme envoie en revue (échec fermé). Le journal ne porte que l'issue,
 * les motifs et la revue : ni nom, ni adresse, ni empreinte.
 *
 * CE QUI N'EST PAS ICI. Le signal « attestation spécifique requise » de REQ-JUR-022 reste inchangé :
 * les professions réglementées admissibles ne sont pas exclues d'office. Rien n'est persisté ici :
 * aucun refus ne laisse de donnée au-delà de ce que le registre de traitement prévoit.
 */
import { estStatutJuridique } from './statut-juridique';

/** Les motifs de refus de l'admission (REQ-JUR-063), dans leur ordre de rendu. */
export const MOTIFS_REFUS_ADMISSION = [
  'siren_inactif',
  'lien_avec_la_societe',
  'statut_hors_liste',
  'profession_exclue',
] as const;
export type MotifRefusAdmission = (typeof MOTIFS_REFUS_ADMISSION)[number];

/**
 * Les codes NAF des professions exclues d'office, liste arrêtée par A07 et figée par un témoin.
 * EN ATTENTE : la liste n'est pas encore versée (question posée sur #563) ; tant qu'elle est vide,
 * le témoin de `profession_exclue` rougit.
 */
export const CODES_NAF_EXCLUS: readonly string[] = [];

/** La forme d'une empreinte de recherche : 64 hexadécimaux minuscules (HMAC-SHA-256). */
const FORME_EMPREINTE = /^[0-9a-f]{64}$/;

/** Ce que l'admission lit d'une candidature : des déclarations, des faits vérifiés, une empreinte. */
export interface CandidatureAdmission {
  /** Le SIREN déclaré est actif au registre. */
  readonly sirenActif: boolean;
  /** La personne DÉCLARE être salariée, dirigeante ou associée d'Axion-IA. */
  readonly lienDeclareAvecLaSociete: boolean;
  /** Le statut juridique tel que saisi, avant tout contrôle. */
  readonly statutJuridique: unknown;
  /** Le code NAF de l'activité principale, en nomenclature rév. 2, ou nul. */
  readonly codeNaf: string | null;
  /** L'empreinte du courriel sous `PII_HASH_KEY` — jamais le courriel lui-même. */
  readonly empreinteCourriel: string;
}

/** Ce que le candidat reçoit : jamais un mot du contrôle croisé. */
export type ReponseAdmission =
  | { readonly issue: 'refusee'; readonly motifs: readonly MotifRefusAdmission[] }
  | { readonly issue: 'recue' };

/** Ce que le journal garde : l'issue, les motifs et la revue, sans rien de la personne. */
export interface JournalAdmission {
  readonly issue: ReponseAdmission['issue'];
  readonly motifs: readonly MotifRefusAdmission[];
  readonly revueHumaine: boolean;
}

export interface JugementAdmission {
  readonly reponse: ReponseAdmission;
  /** Vrai quand le contrôle croisé bloque l'activation pour revue humaine. */
  readonly revueHumaine: boolean;
  readonly journal: JournalAdmission;
}

/** Vrai pour un code de la liste des professions exclues d'office ; faux pour tout autre. */
export function estProfessionExclue(codeNaf: string | null): boolean {
  return codeNaf !== null && CODES_NAF_EXCLUS.includes(codeNaf);
}

/**
 * Le contrôle croisé : l'empreinte correspond-elle à celle d'un conseiller salarié actif ? Égalité
 * exacte d'empreintes ; une empreinte hors forme répond oui, pour qu'une personne la revoie.
 */
export function correspondAUnConseillerActif(
  empreinteCourriel: string,
  empreintesConseillersActifs: ReadonlySet<string>
): boolean {
  if (typeof empreinteCourriel !== 'string' || !FORME_EMPREINTE.test(empreinteCourriel))
    return true;
  return empreintesConseillersActifs.has(empreinteCourriel);
}

/** Le jugement de l'admission : les motifs nommés d'abord, la revue humaine à part. */
export function jugerAdmission(
  candidature: CandidatureAdmission,
  empreintesConseillersActifs: ReadonlySet<string>
): JugementAdmission {
  const vaut: Record<MotifRefusAdmission, boolean> = {
    siren_inactif: candidature.sirenActif !== true,
    lien_avec_la_societe: candidature.lienDeclareAvecLaSociete === true,
    statut_hors_liste: !estStatutJuridique(candidature.statutJuridique),
    profession_exclue: estProfessionExclue(candidature.codeNaf),
  };
  const motifs = MOTIFS_REFUS_ADMISSION.filter((m) => vaut[m]);
  const reponse: ReponseAdmission =
    motifs.length > 0 ? { issue: 'refusee', motifs } : { issue: 'recue' };
  const revueHumaine = correspondAUnConseillerActif(
    candidature.empreinteCourriel,
    empreintesConseillersActifs
  );
  return { reponse, revueHumaine, journal: { issue: reponse.issue, motifs, revueHumaine } };
}
