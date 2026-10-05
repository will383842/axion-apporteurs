/**
 * La saisie du formulaire de pose, lue et FERMÉE avant tout travail : un motif de l'enum, une portée
 * connue, un identifiant au format UUID, des jours civils de Paris. Toute autre forme rend `null`, et
 * l'action revient à l'écran sans rien écrire. La référence n'est jugée qu'à l'empreinte, par le
 * module du gel (`reference_gel`), avant toute écriture.
 *
 * Les jours se lisent à Paris : `depuis` couvre dès minuit, `jusquA` jusqu'à la dernière milliseconde
 * de son jour, inclus (la période du gel est inclusive).
 */
import type { MotifGelJournal } from '@prisma/client';
import { depuisParis } from '../../../../../../domain/temps/paris';

const MOTIFS: readonly MotifGelJournal[] = ['incident', 'litige'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface SaisieDuGel {
  readonly motif: MotifGelJournal;
  readonly reference: string;
  readonly portee: 'utilisateur' | 'cible';
  readonly identifiant: string;
  readonly depuis: Date;
  readonly jusquA: Date | null;
}

function texte(formData: FormData, cle: string): string {
  const v = formData.get(cle);
  return typeof v === 'string' ? v.trim() : '';
}

/** Un jour civil de Paris, à l'heure donnée ; `null` s'il n'existe pas. */
function jourDeParis(valeur: string, fin: boolean): Date | null {
  const m = JOUR.exec(valeur);
  if (!m) return null;
  try {
    return new Date(
      depuisParis({
        annee: Number(m[1]),
        mois: Number(m[2]),
        jour: Number(m[3]),
        heure: fin ? 23 : 0,
        minute: fin ? 59 : 0,
        seconde: fin ? 59 : 0,
        milliseconde: fin ? 999 : 0,
      })
    );
  } catch {
    return null;
  }
}

export function lireLaSaisieDuGel(formData: FormData): SaisieDuGel | null {
  const motif = texte(formData, 'motif');
  const portee = texte(formData, 'portee');
  const identifiant = texte(formData, 'identifiant').toLowerCase();
  const reference = texte(formData, 'reference');
  const depuis = jourDeParis(texte(formData, 'depuis'), false);
  const brutJusquA = texte(formData, 'jusquA');
  const jusquA = brutJusquA === '' ? null : jourDeParis(brutJusquA, true);
  if (!(MOTIFS as readonly string[]).includes(motif)) return null;
  if (portee !== 'utilisateur' && portee !== 'cible') return null;
  if (!UUID.test(identifiant) || reference === '' || depuis === null) return null;
  if (brutJusquA !== '' && (jusquA === null || jusquA < depuis)) return null;
  return { motif: motif as MotifGelJournal, reference, portee, identifiant, depuis, jusquA };
}
