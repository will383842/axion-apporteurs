/**
 * L'état vide de chaque écran de la console (REQ-UX-019) — un titre, une phrase, une action
 * principale. Lu par Axion-IA seul : `gov:lexique` le juge à la portée du dépôt (REQ-GOV-017).
 *
 * LA LISTE DES ÉCRANS. Aucune carte des routes de la console n'existe encore : la seule liste
 * DÉCLARÉE est la section « Console » de `docs/maquettes/VALIDATION.md`, et la clé est le nom de
 * la maquette. Quand la matrice écran × rôle de SEC-17 (REQ-SEC-023) sera livrée, c'est d'elle que
 * la garde `ux-exhaustivite` dérivera les écrans de la console — et chacun lui devra un état vide.
 *
 * Base : les maquettes `file-qualification.html` et `lot-paiement.html`. Le vocabulaire des motifs
 * de blocage est celui du glossaire (« bloqué »), jamais celui de la paie.
 */
import type { EtatVide } from '../types';

export const ETATS_VIDES_CONSOLE: Readonly<Record<string, EtatVide>> = {
  'file-qualification': {
    titre: 'Aucun dépôt à qualifier',
    phrase:
      'Les nouveaux dépôts arrivent ici, triés automatiquement. Les contestations en attente sont dans Contestations.',
    action: { libelle: 'Ouvrir les contestations', route: null },
  },
  'lot-paiement': {
    titre: 'Aucun relevé à payer ce mois-ci',
    phrase:
      'Les soldes du mois sont sous le seuil de versement, ou bloqués par un motif : ils seront repris au prochain lot.',
    action: { libelle: 'Voir les relevés bloqués', route: null },
  },
};
