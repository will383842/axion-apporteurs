/**
 * Les limites de débit du mandataire, PAR LE REGISTRE — INT-T09 (REQ-SEC-013, REQ-INT-020).
 *
 * Trois compteurs, déclarés dans `src/server/securite/rate-limit.ts` et nulle part ailleurs, chacun
 * avec sa conduite quand le cache tombe :
 *   — le débit GLOBAL vers le tiers (REQ-INT-020, 5 par seconde) : un seul sujet pour tout le
 *     processus, l'empreinte d'une étiquette fixe ;
 *   — l'IDENTITÉ de l'apporteur (REQ-SEC-013, 120 par 24 h) ;
 *   — l'EMPREINTE D'ADRESSE réseau (REQ-SEC-013, que l'exigence ne chiffre pas : la limite attend
 *     sa configuration, et d'ici là le compteur applique sa conduite déclarée).
 *
 * Chaque appel est DIRECT, à nom LITTÉRAL, sans magasin ni signaleur : c'est la forme que
 * `scripts/gates/rate-famille.ts` sait lire, et hors des tests `limiter` refuse toute injection.
 * Un test qui veut compter en mémoire remplace le magasin du REGISTRE, jamais cet appel.
 */
import { createHash } from 'node:crypto';
import {
  limiter,
  sujetDepuisEmpreinte,
  type SujetDeCompteur,
  type VerdictDeLimite,
} from '../../securite/rate-limit';

export interface LimiteurDuMandataire {
  global(maintenantMs: number): Promise<VerdictDeLimite>;
  identite(sujet: SujetDeCompteur, maintenantMs: number): Promise<VerdictDeLimite>;
  adresse(sujet: SujetDeCompteur, maintenantMs: number): Promise<VerdictDeLimite>;
}

/** Le sujet du compteur global : une étiquette fixe, empreinte — aucune donnée de personne. */
const SUJET_GLOBAL = sujetDepuisEmpreinte(
  createHash('sha256').update('partners.recherche-entreprises.global', 'utf8').digest('hex')
);

export const limiteurDuRegistre: LimiteurDuMandataire = {
  global: (ms) => limiter('depot:entreprise-global', SUJET_GLOBAL, ms),
  identite: (sujet, ms) => limiter('depot:entreprise-identite', sujet, ms),
  adresse: (sujet, ms) => limiter('depot:entreprise-ip', sujet, ms),
};
