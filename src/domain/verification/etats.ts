/**
 * « Vérifier une entreprise » — l'état rendu à l'apporteur (SEC-16, REQ-UX-007, REQ-JUR-011), la
 * règle PURE, sur des faits déjà lus.
 *
 * QUATRE ÉTATS (rattrapage 95, `EtatVerificationDto` du glossaire). `non_disponible` REGROUPE
 * l'antériorité (cliente, devis, devis signé), la liste de la Société et l'entreprise fermée ou non
 * diffusible, sans sous-état ni catégorie : la catégorie de la liste ne se dit qu'au refus d'un
 * DÉPÔT (art. 3.3 bis). Les deux `suivie_*` valent pour TOUT occupant — un apporteur, ou la Société
 * et ses préposés (W19) — au même stade : le porteur n'entre pas dans les faits.
 *
 * AUCUNE DATE, dans aucun état, tant que Williams n'a pas tranché (rattrapage 96).
 *
 * La cause INTERNE (`causeDuJournal`) est tenue au journal des vérifications ; elle ne sort jamais.
 */

export const ETATS_VERIFICATION = [
  'libre',
  'suivie_place_disponible',
  'suivie_file_complete',
  'non_disponible',
] as const;
export type EtatVerification = (typeof ETATS_VERIFICATION)[number];

/** Les places de la file derrière un occupant : les rangs 1 et 2 (`attributions_rang_attente`). */
export const PLACES_DE_LA_FILE = 2;

/** Ce que le registre public dit de l'entreprise. Introuvable, elle n'est pas déposable. */
export type EtatDeLEntreprise = 'active' | 'fermee' | 'non_diffusible' | 'introuvable';

export type FaitsDeVerification = {
  /** Connue de la Société par antériorité (cliente, devis émis récent, devis signé ouvert). */
  anteriorite: boolean;
  /** Inscrite sur la liste tenue par la Société. */
  surLaListe: boolean;
  entreprise: EtatDeLEntreprise;
  /** Une attribution en état occupant, quel qu'en soit le porteur. */
  occupee: boolean;
  /** Le nombre d'attributions en file derrière l'occupant. */
  enFile: number;
};

/** La cause interne, aux valeurs de `ResultatVerification` (`verifications.resultat`). */
export type CauseDeVerification = 'libre' | 'suivie' | 'cliente' | 'liste_noire' | 'fermee';

/**
 * La cause, par préséance : l'entreprise d'abord (fermée, non diffusible ou introuvable), puis la
 * liste, puis l'antériorité, puis l'occupation. Une file sans occupant lu est une occupation : une
 * incohérence ne se lit jamais `libre`.
 */
export function causeDuJournal(f: FaitsDeVerification): CauseDeVerification {
  if (f.entreprise !== 'active') return 'fermee';
  if (f.surLaListe) return 'liste_noire';
  if (f.anteriorite) return 'cliente';
  if (f.occupee || f.enFile > 0) return 'suivie';
  return 'libre';
}

/** L'état rendu : la cause, repliée sur les quatre états, sans rien de plus. */
export function etatDeVerification(f: FaitsDeVerification): EtatVerification {
  const cause = causeDuJournal(f);
  if (cause === 'libre') return 'libre';
  if (cause !== 'suivie') return 'non_disponible';
  return f.enFile >= PLACES_DE_LA_FILE ? 'suivie_file_complete' : 'suivie_place_disponible';
}
