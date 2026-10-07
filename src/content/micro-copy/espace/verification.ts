/**
 * SEC-72 (REQ-SEC-021) — le refus d'une vérification par le plafond. Texte NEUTRE de la juriste (#474,
 * 6036797355, qui remplace 6036719265), MOT POUR MOT : ni chiffre, ni durée, ni « trop », ni « limite »,
 * ni « seuil ». Il est le MÊME pour les trois fenêtres et ne dit pas laquelle a joué. Sa seconde phrase
 * est VRAIE et doit le rester : le dépôt ne passe jamais par la vérification. L'écran n'écrit rien et
 * n'ouvre aucune réserve de l'art. 3.5.
 */
import { ACTIONS_COMMUNES } from './vocabulaire';

export const VERIFICATION_INDISPONIBLE = {
  titre: 'Vérification indisponible pour le moment',
  phrase:
    'Vous pourrez vérifier cette entreprise un peu plus tard. Vous pouvez aussi la déposer dès maintenant, sans la vérifier.',
  action: ACTIONS_COMMUNES.deposerUneEntreprise,
} as const;
