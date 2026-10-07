/**
 * La page publique du contact (`/confirmer/<jeton>`, UX-P1-42), ses textes seuls (W20 : REQ-UX-061,
 * REQ-JUR-060). Textes de `docs/chantiers/W20-confirmation-par-email.md` §4, repris mot pour mot.
 *
 * GARDE-FOUS D'A07 (rattrapage 45) : la question de l'échange reste EXPLICITE — « Oui, nous avons
 * échangé » confirme (art. 3.2), « Non » confirmé est le démenti exprès (art. 3.7) ; aucun bouton ne
 * vaut confirmation sous un autre sens. Aucune date du contact (REQ-JUR-040), aucune consigne au
 * contact. L'information de l'art. 14 est celle de JUR-T09, rendue entière, jamais résumée ici.
 */
import { LIEN_OPPOSITION } from '../courriels/information-article-14';

export const PAGE_DE_CONFIRMATION = {
  question:
    'Bonjour {prenomContact} {nomContact}. {prenomApporteur} {nomApporteur} nous indique avoir échangé avec vous récemment au sujet de {entreprise}. Est-ce exact ?',
  oui: 'Oui, nous avons échangé',
  non: 'Non',
  information: 'Vos données personnelles',
  // DÉRIVÉ du libellé de l'opposition de l'art. 14 (A07, 2026-10-02) : la page ne promet pas plus que
  // l'opposition réelle, et ne la récrit pas (RM-01).
  opposition: LIEN_OPPOSITION.libelle,
} as const;

/** Les quatre autres états de la page (cinq avec la question). */
export const ETATS_DE_LA_PAGE = {
  merci: 'Merci, votre réponse est enregistrée.',
  dejaRepondu: 'Votre réponse a déjà été enregistrée.',
  /** Un seul texte, que le lien soit inconnu ou expiré : rien ne les distingue. */
  lienInvalide: "Ce lien n'est plus valable.",
  erreur: "Votre réponse n'a pas pu être enregistrée.",
  reessayer: 'Réessayer',
} as const;
