/**
 * acces-espace.ts — quels statuts d'apporteur ouvrent l'espace (SEC-03).
 *
 * Prédicat pur, défaut FERMÉ : un statut absent de l'ensemble, inconnu ou mal orthographié ne
 * donne pas accès. `suspendu` y est : la suspension déconnecte mais ne coupe pas l'accès
 * (REQ-SEC-032). `resilie` n'y est pas : la lecture seule après résiliation est une autre tâche.
 */

// HYP-SEC03-ACCES — seuls `signe` et `suspendu` ouvrent l'espace tant que Will n'a pas dit si
// `kyc_en_cours` et `pret_a_signer` doivent pouvoir s'y connecter (dépôt des pièces).
const STATUTS_QUI_OUVRENT_L_ESPACE: ReadonlySet<string> = new Set(['signe', 'suspendu']);

export function peutOuvrirLEspace(statut: string): boolean {
  return STATUTS_QUI_OUVRENT_L_ESPACE.has(statut);
}
