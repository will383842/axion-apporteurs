/**
 * acces-espace.ts — quels statuts d'apporteur ouvrent l'espace, et jusqu'où (SEC-03, SEC-43).
 *
 * UN SEUL VERDICT, défaut FERMÉ : un statut absent de la liste blanche, inconnu ou mal orthographié
 * ne donne pas accès.
 *   — `plein` : `signe` et `suspendu` — la suspension ne gèle que l'enregistrement des nouvelles
 *     déclarations : elle ne déconnecte pas et ne coupe pas l'accès (contrat v2, art. 3.7 al. 3 ;
 *     REQ-SEC-032) ;
 *   — `limite` : `kyc_en_cours` et `pret_a_signer` — l'apporteur entre, mais ne voit que « Ma
 *     conformité » et « Mon contrat » (décision de Williams du 2026-10-01, qui amende
 *     HYP-SEC03-ACCES) ;
 *   — `lecture` : `resilie`, tant que ses droits courent (SEC-19, REQ-SEC-032, art. 12.3) — une
 *     liste blanche EXPLICITE de segments en lecture, et aucune écriture ; les droits courent tant
 *     qu'au moins une attribution `figee_resiliation` n'est pas éteinte (A02, #703) : l'appelant
 *     les relit en base avec le statut, à chaque requête ;
 *   — `ferme` : tout le reste, et `resilie` dont les droits sont éteints.
 *
 * LES SEGMENTS SONT UNE UNION FERMÉE (décision A02, SEC-43) : le premier segment de chaque route de
 * l'espace (`docs/ESPACE-ROUTES.md`, l'accueil `/` s'appelle `accueil`) est dans exactement une des
 * listes ci-dessous, ou il n'existe pas. Aucun niveau n'est implicite : un segment inconnu est
 * refusé même en ouverture pleine. Le témoin du disque
 * (`tests/unit/securite/acces-espace-avant-signature.spec.ts`) confronte chaque fichier de l'espace
 * à ces listes.
 *
 * Le statut se juge DANS la fonction, jamais par une constante de module : une constante est
 * évaluée au chargement, avant toute activation d'un mutant (SEC-17).
 */

/** Ce que l'ouverture LIMITÉE atteint : « Ma conformité » et « Mon contrat ». */
export const SEGMENTS_LIMITES = ['conformite', 'mon-contrat'] as const;

/**
 * SEC-19 (critères de la sécurité, #703) : ce que la LECTURE d'un résilié atteint — un sous-ensemble
 * EXPLICITE des segments protégés, défaut fermé : un segment ajouté plus tard à `SEGMENTS_PLEINS`
 * n'y entre que par décision. Ni dépôt, ni entreprise, ni filleuls, ni profil, ni conformité.
 */
export const SEGMENTS_LECTURE = [
  'accueil',
  'mes-commissions',
  'mes-entreprises',
  'notifications',
  'documents',
  'mon-contrat',
] as const;

/** Ce que seule l'ouverture PLEINE atteint. */
export const SEGMENTS_PLEINS = [
  'accueil',
  'mes-entreprises',
  'mes-commissions',
  'plus',
  'entreprise',
  'deposer',
  'documents',
  'filleuls',
  'profil',
  'notifications',
  'activite',
  'ressources',
  'aide',
  // UX-P1-51 : l'apporteur relit sa contestation et la réponse d'Axion-IA (REQ-DM-043). En PLEIN
  // seulement (arbitrage de la coordination sur #775 : le contrat v2 fait foi, art. 12.3, SEC-70) :
  // un résilié n'y a pas accès.
  'contestations',
] as const;

/**
 * L'acceptation de la politique de confidentialité (REQ-JUR-025) : sa PAGE est publique, son ACTION
 * exige une session, à tout niveau ouvert — l'accord précède tout le reste.
 */
export const SEGMENT_DE_L_ACCEPTATION = 'confidentialite' as const;

/** Les segments PUBLICS : aucune session (connexion, dépôt par lien privé, réponse du contact). */
export const SEGMENTS_PUBLICS = ['connexion', 'd', 'confirmer'] as const;

/** Un segment que la session protège — le seul qu'accepte `exigerSessionPour`. */
export type SegmentProtege =
  | (typeof SEGMENTS_LIMITES)[number]
  | (typeof SEGMENTS_PLEINS)[number]
  | typeof SEGMENT_DE_L_ACCEPTATION;

/** Le niveau d'accès à l'espace. */
export type NiveauDAcces = 'plein' | 'limite' | 'lecture' | 'ferme';

/**
 * `droitsEnCours` : vrai si un résilié a encore au moins une attribution `figee_resiliation` non
 * éteinte (A02, #703). Il ne vaut que pour `resilie` ; absent, il est faux — défaut fermé.
 */
export function niveauDAcces(statut: string | null, droitsEnCours = false): NiveauDAcces {
  if (statut === 'signe' || statut === 'suspendu') return 'plein';
  if (statut === 'kyc_en_cours' || statut === 'pret_a_signer') return 'limite';
  if (statut === 'resilie' && droitsEnCours) return 'lecture';
  return 'ferme';
}

/** Vrai si le statut ouvre l'espace, pleinement, en ouverture limitée ou en lecture. */
export function peutOuvrirLEspace(statut: string | null, droitsEnCours = false): boolean {
  return niveauDAcces(statut, droitsEnCours) !== 'ferme';
}

/**
 * Vrai si la route de ce segment répond à ce niveau. Défaut fermé : un segment hors des listes est
 * refusé à tout niveau, et une route ajoutée plus tard est refusée en ouverture limitée tant qu'elle
 * n'entre pas, par décision, dans `SEGMENTS_LIMITES`.
 */
export function routeOuverte(niveau: NiveauDAcces, segment: string): boolean {
  if (niveau === 'ferme') return false;
  if (niveau === 'lecture') {
    const lus: readonly string[] = SEGMENTS_LECTURE;
    return lus.includes(segment) || segment === SEGMENT_DE_L_ACCEPTATION;
  }
  const limites: readonly string[] = SEGMENTS_LIMITES;
  if (limites.includes(segment) || segment === SEGMENT_DE_L_ACCEPTATION) return true;
  const pleins: readonly string[] = SEGMENTS_PLEINS;
  return niveau === 'plein' && pleins.includes(segment);
}
