/**
 * Les libellés que l'apporteur lit pour chacun des états de son dépôt (UX-P0-01b, suite
 * d'UX-P0-01). Chaque état déclaré par l'enum du schéma a son libellé visible et sa phrase
 * d'explication ; la liste des états n'est pas retapée ici : le type l'exige de l'enum, et le
 * témoin `tests/unit/espace/libelles-d-etats.spec.ts` nomme tout état qui manquerait.
 *
 * SOURCES. Les états qu'une maquette VALIDÉE nomme sans ambiguïté reprennent ses textes
 * (`mes-entreprises.html`, version corrigée par UX-P1-17), sans les détails propres à l'écran : ni
 * date de rendez-vous, ni montant, ni délai, que l'écran de la liste (UX-P1-05) ajoute. Les états
 * que les maquettes nommaient de plusieurs façons sont tranchés par la juriste (2026-10-03) : la
 * confirmation en cours, la déclaration non confirmée, l'annulation, la fin sans rendez-vous ni commande, la fin de
 * contrat et la fin du droit, qui couvre deux causes depuis DM-63. Le motif d'une fin est donné par
 * la notification (art. 3.7), jamais par le badge.
 *
 * La seule date d'une phrase est sa date de fin, le paramètre `{dateFin}`. Aucun texte ne dit qui
 * occupe une entreprise. Lu par l'apporteur : jugé par `gov:lexique` et `ux:exhaustivite` à la
 * portée la plus stricte.
 */

// La liste des états n'est pas importée ici : le chemin de l'enum porte un mot du schéma que la
// garde lexicale refuse dans ce que lit l'apporteur. Le témoin confronte les clés à l'enum.
import { FORMULES } from './vocabulaire';

/** Le libellé d'un état, et la phrase qui l'explique. */
export type LibelleDEtat = { readonly libelle: string; readonly phrase: string };

export const LIBELLES_DES_ETATS = {
  en_attente: {
    libelle: 'En attente',
    phrase: `Cette entreprise est ${FORMULES.dejaReservee}. Votre dépôt attend, avec son heure d’envoi.`,
  },
  provisoire: {
    libelle: 'En cours de confirmation',
    phrase:
      'Votre dépôt est enregistré. Axion-IA demande à l’entreprise de confirmer votre échange.',
  },
  active: {
    libelle: 'Confirmée',
    phrase: `L’entreprise a confirmé vous avoir rencontré. Axion-IA lui propose un rendez-vous. ${FORMULES.droitACommissionJusquau}`,
  },
  rdv_pris: {
    libelle: 'Rendez-vous pris',
    phrase: `Un rendez-vous est fixé entre Axion-IA et l’entreprise. ${FORMULES.rienAFaire}. ${FORMULES.droitACommissionJusquau}`,
  },
  proposition: {
    libelle: 'Proposition envoyée',
    phrase: `Axion-IA a envoyé une proposition. C’est à l’entreprise de décider. ${FORMULES.droitACommissionJusquau}`,
  },
  signee: {
    libelle: 'Signée',
    phrase: `L’entreprise a signé. Votre commission est versée après son paiement. ${FORMULES.droitACommissionJusquau}`,
  },
  convertie: {
    libelle: 'Payée par l’entreprise',
    phrase: `L’entreprise a payé. Votre commission sera sur votre prochain relevé. ${FORMULES.droitACommissionJusquau}`,
  },
  // Plus atteint depuis DM-63 ; l'exhaustivité exige son libellé, sans autre promesse (juriste).
  figee_resiliation: {
    libelle: 'Contrat terminé',
    phrase: 'Votre contrat a pris fin.',
  },
  // Le terme canonique, qui n'accuse pas ; le motif est celui de la notification.
  invalidee: {
    libelle: 'Non confirmée',
    phrase: 'Ce dépôt a pris fin. Le motif vous a été indiqué par notification.',
  },
  perdue: {
    libelle: FORMULES.sansSuite,
    phrase: 'L’entreprise ne souhaite pas donner suite pour le moment. Elle redevient libre.',
  },
  perimee: {
    // Texte de la juriste : « Terminée », puis la formule de `FORMULES`, jamais retapée.
    libelle: `Terminée ${FORMULES.sansSuite.toLowerCase()}`,
    phrase:
      'Aucun rendez-vous, devis ni commande dans le délai prévu par le contrat : ce dépôt a pris fin. L’entreprise est de nouveau disponible.',
  },
  // Deux causes depuis DM-63 : la fin de durée, et la fin du contrat sans commande.
  expiree: {
    libelle: 'Droit à commission terminé',
    phrase: 'Ce dépôt a pris fin le {dateFin} : sa durée est écoulée, ou votre contrat a pris fin.',
  },
  // La fin du contrat, le retrait par la console ou par l'apporteur : le motif est notifié.
  annulee: {
    libelle: 'Annulée',
    phrase: 'Ce dépôt est annulé. Le motif vous a été indiqué par notification.',
  },
} as const satisfies Readonly<Record<string, LibelleDEtat>>;
