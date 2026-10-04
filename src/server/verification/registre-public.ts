/**
 * L'état d'une entreprise au registre public, pour « Vérifier une entreprise » (SEC-16), lu sur la
 * fiche d'INT-T09 (`ficheEntreprisePourServeur` : cache, puis tiers sous disjoncteur et débit).
 *
 * ÉCHEC FERMÉ (condition de la sécurité) : une panne, un disjoncteur ouvert, un débit atteint, ou
 * une fiche sans état administratif lisible rendent `indisponible`, jamais `active` — la
 * vérification est alors refusée (`registre_indisponible`). Seul un SIREN que le registre ne connaît
 * pas est `introuvable`.
 *
 * LIMITE DÉCLARÉE (phase 1, décision de la coordination) : la fiche persistée ne porte pas le statut
 * de diffusion ; l'état administratif seul est lu. Une entreprise non diffusible et active est donc
 * jugée sur ses autres faits.
 */
import {
  ficheEntreprisePourServeur,
  type DependancesDuMandataire,
  type IssueDeFiche,
} from '../integrations/recherche-entreprises/autocompletion';
import type { EtatDeLEntreprise } from '../../domain/verification/etats';

const PAR_ETAT_ADMINISTRATIF: Readonly<Record<string, EtatDeLEntreprise>> = {
  A: 'active',
  C: 'fermee',
};

export function etatDepuisLaFiche(issue: IssueDeFiche): EtatDeLEntreprise | 'indisponible' {
  if (!issue.ok) return issue.motif === 'siren_inconnu' ? 'introuvable' : 'indisponible';
  const etat: unknown = issue.fiche.etat_administratif;
  return typeof etat === 'string' && Object.hasOwn(PAR_ETAT_ADMINISTRATIF, etat)
    ? PAR_ETAT_ADMINISTRATIF[etat]!
    : 'indisponible';
}

/** Le port `entreprise` de la vérification, sur les dépendances du mandataire. */
export function entrepriseParLeRegistre(deps: DependancesDuMandataire) {
  return async (siren: string): Promise<EtatDeLEntreprise | 'indisponible'> =>
    etatDepuisLaFiche(await ficheEntreprisePourServeur(siren, deps));
}
