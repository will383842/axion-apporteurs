/**
 * SEC-15 (REQ-SEC-018, REQ-SEC-019, REQ-JUR-031, REQ-JUR-006) — la suspension de vérification, la
 * règle PURE. Le contrat v2 fait foi (décision de Williams du 2026-10-07), art. 3.7 al. 3 :
 *
 *   « La Société peut suspendre l'enregistrement de nouvelles déclarations le temps d'une
 *   vérification. La suspension est notifiée avec les faits qui la motivent, lesquels ne peuvent être
 *   que l'indication de l'entreprise déclarée prévue au deuxième alinéa ou des éléments établissant la
 *   fabrication ou l'automatisation d'une déclaration. »
 *
 * UNE FACULTÉ, JAMAIS UN AUTOMATISME. Ce module juge si la pose est PERMISE ; il ne la décide pas. Le
 * rôle qui la pose est jugé au serveur (`src/server/apporteur/suspension.ts`).
 *
 * DEUX FAITS, ET EUX SEULS. L'indication de l'entreprise (un démenti, par appel ou au formulaire, sans
 * seconde action) fonde `gele_non_confirmation` ; une anomalie CONFIRMÉE PAR UN HUMAIN fonde
 * `gele_fraude`. Le type des faits ne porte ni nombre, ni rythme, ni heure, ni lieu, ni zone, ni
 * secteur, ni méthode : « aucune suspension ne peut être fondée, même partiellement » sur eux, et
 * elle « n'obéit à aucun barème, à aucun compteur et à aucun seuil ».
 *
 * QUINZE JOURS AU PLUS, À COMPTER DE LA NOTIFICATION. La pose et la notification s'écrivent dans la
 * même transaction : l'échéance part de cet instant, à la même heure de Paris, quinze jours civils
 * plus tard (`SUSPENSION_MAX_JOURS`), et la levée y est due de plein droit.
 */
import { SEUILS } from '../seuils/ssot';
import { dateDepuisJours, joursDeLaDate } from '../temps/calendrier-civil';
import type { Instant } from '../temps/horloge';
import { depuisParis, versParis } from '../temps/paris';
import type { StatutApporteur } from './statut';

/** Les états du gel, liste FERMÉE (REQ-SEC-019) : `gele_manuel` n'existe pas. */
export const ETATS_DE_GEL = ['libre', 'gele_non_confirmation', 'gele_fraude'] as const;
export type EtatDeGel = (typeof ETATS_DE_GEL)[number];

/** Les deux motifs d'une suspension : les deux faits que le v2 admet, et eux seuls. */
export const MOTIFS_DE_SUSPENSION = ['gele_non_confirmation', 'gele_fraude'] as const;
export type MotifDeSuspension = (typeof MOTIFS_DE_SUSPENSION)[number];

/** Les faits qui fondent une suspension (art. 3.7 al. 3). */
export type FaitsDeSuspension =
  | { readonly motif: 'gele_non_confirmation'; readonly indicationRecueAt: Instant }
  | {
      readonly motif: 'gele_fraude';
      readonly anomalie: { readonly id: string; readonly confirmeeParUnHumain: true };
    };

export type CodeDeSuspension =
  | 'motif_hors_liste'
  | 'statut_non_suspendable'
  | 'deja_suspendu'
  | 'anomalie_non_confirmee'
  | 'indication_posterieure'
  | 'non_suspendu';

export class ErreurDeSuspension extends Error {
  constructor(readonly code: CodeDeSuspension) {
    super(`suspension_refusee : ${code}`);
    this.name = 'ErreurDeSuspension';
  }
}

/**
 * La pose est-elle permise ? Seul un apporteur `signe` et `libre` se suspend ; une anomalie non
 * confirmée n'est pas un fait ; une indication postérieure à l'instant de la pose n'en est pas la
 * cause. Rien ne se compte : une suspension déjà posée se refuse, elle ne s'aggrave pas.
 */
export function jugerLaPose(
  e: { statut: StatutApporteur; etatGel: EtatDeGel; faits: FaitsDeSuspension },
  maintenant?: Instant
): void {
  // JUR-T24 (REQ-JUR-031) : le type est fermé, l'exécution aussi — un motif forcé hors de la liste est refusé.
  if (!(MOTIFS_DE_SUSPENSION as readonly string[]).includes(e.faits.motif)) {
    throw new ErreurDeSuspension('motif_hors_liste');
  }
  if (e.etatGel !== 'libre') throw new ErreurDeSuspension('deja_suspendu');
  if (e.statut !== 'signe') throw new ErreurDeSuspension('statut_non_suspendable');
  if (e.faits.motif === 'gele_fraude') {
    if (e.faits.anomalie.confirmeeParUnHumain !== true) {
      throw new ErreurDeSuspension('anomalie_non_confirmee');
    }
    return;
  }
  if (maintenant !== undefined && e.faits.indicationRecueAt > maintenant) {
    throw new ErreurDeSuspension('indication_posterieure');
  }
}

/** L'échéance : la même heure de Paris, `SUSPENSION_MAX_JOURS` jours civils après la notification. */
export function echeanceDeLevee(notifieeAt: Instant): Instant {
  const p = versParis(notifieeAt);
  const jour = dateDepuisJours(joursDeLaDate(p) + SEUILS.SUSPENSION_MAX_JOURS.valeur);
  return depuisParis({ ...p, ...jour });
}

/** La levée de plein droit est due à l'échéance, pas avant. */
export function leveeDePleinDroitDue(notifieeAt: Instant, maintenant: Instant): boolean {
  return maintenant >= echeanceDeLevee(notifieeAt);
}

/** La levée, par un rôle ou de plein droit : seule une suspension posée se lève, vers `signe`, `libre`. */
export function jugerLaLevee(e: { statut: StatutApporteur; etatGel: EtatDeGel }): {
  statut: 'signe';
  etatGel: 'libre';
} {
  if (e.statut !== 'suspendu' || e.etatGel === 'libre') {
    throw new ErreurDeSuspension('non_suspendu');
  }
  return { statut: 'signe', etatGel: 'libre' };
}
