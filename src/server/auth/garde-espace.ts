/**
 * garde-espace.ts — la garde d'acceptation de l'espace apporteur (SEC-53, REQ-JUR-025).
 *
 * LA RÈGLE. Chaque page, route et action de `src/app/(espace)/` exige une session valide ET
 * l'acceptation de la version PUBLIABLE COURANTE de la politique de confidentialité, en échec FERMÉ,
 * avec un motif nommé. La session se juge dans `src/server/auth/session.ts` ; ce module juge
 * l'acceptation, et `pageEspace` et `actionEspace` l'appellent après la session. Elle lève la dette
 * que l'acceptance de JUR-T36 nomme « après lancement » : la politique n'était exigée qu'à
 * l'ouverture d'une session, un lien direct passait outre.
 *
 * ÉCHEC FERMÉ, sans exception :
 *   — l'acceptation absente ou d'une ancienne version : `acceptation_requise` ;
 *   — la politique courante non publiable (JUR-T57) : `politique_non_publiable` ;
 *   — le registre illisible : `politique_illisible` ;
 *   — la base qui ne répond pas, ou le port d'acceptation qui n'est pas branché :
 *     `acceptation_illisible`. Un câblage oublié ne rouvre pas l'espace.
 *
 * LES EXEMPTIONS SONT NOMMÉES, chacune avec sa raison : `confidentialite` et `connexion`. Aucune
 * autre ; un segment public à venir s'y ajoute par décision, jamais par défaut.
 */
import type { PrismaClient } from '@prisma/client';
import type { LecturePolitique } from '../../domain/rgpd/politique';
import {
  depotDAcceptation,
  etatDAcceptation,
  lireLaPolitique,
  type DepotDAcceptation,
} from '../rgpd/acceptation';

/** Les segments exemptés de l'acceptation, PAR NOM, et pourquoi. */
export const EXEMPTIONS_NOMMEES = {
  confidentialite:
    'la politique s’accepte sur sa propre page : l’exiger acceptée pour l’accepter fermerait l’espace',
  connexion: 'la connexion précède toute session : rien n’y est encore accepté',
} as const;
export type SegmentExempte = keyof typeof EXEMPTIONS_NOMMEES;

export function estExempte(segment: string): boolean {
  return Object.hasOwn(EXEMPTIONS_NOMMEES, segment);
}

/** Les motifs de la garde : une liste FERMÉE, distincte de celle du juge de session. */
export const MOTIFS_DE_LA_GARDE = [
  'session_illisible',
  'acceptation_requise',
  'acceptation_illisible',
  'politique_non_publiable',
  'politique_illisible',
] as const;
export type MotifDeLaGarde = (typeof MOTIFS_DE_LA_GARDE)[number];

/** Les ports de la garde : la politique courante, lue à chaque appel, et le dépôt d'acceptation. */
export interface PortsDeLaGarde {
  lirePolitique(): LecturePolitique;
  depot: DepotDAcceptation;
}

export type VerdictDeLaGarde = { ok: true } | { ok: false; motif: MotifDeLaGarde };

/**
 * L'acceptation de l'apporteur DE LA SESSION, pour ce segment. Rien n'est mis en mémoire : la
 * politique et l'acceptation se relisent à chaque requête, comme la session.
 */
export async function exigerAcceptation(
  apporteurId: string,
  segment: string,
  ports: PortsDeLaGarde | undefined
): Promise<VerdictDeLaGarde> {
  if (estExempte(segment)) return { ok: true };
  if (ports === undefined) return { ok: false, motif: 'acceptation_illisible' };
  let lue: LecturePolitique;
  try {
    lue = ports.lirePolitique();
  } catch {
    return { ok: false, motif: 'politique_illisible' };
  }
  if (!lue.ok) return { ok: false, motif: 'politique_illisible' };
  let etat;
  try {
    etat = await etatDAcceptation(apporteurId, lue.politique, ports.depot);
  } catch {
    return { ok: false, motif: 'acceptation_illisible' };
  }
  if (etat === 'acceptee') return { ok: true };
  if (etat === 'non_publiable') return { ok: false, motif: 'politique_non_publiable' };
  return { ok: false, motif: 'acceptation_requise' };
}

/** Les ports du processus : le registre sur disque et l'acceptation en base. */
export function portsDeLaGarde(
  prisma: PrismaClient,
  lirePolitique: () => LecturePolitique = () => lireLaPolitique()
): PortsDeLaGarde {
  return { lirePolitique, depot: depotDAcceptation(prisma) };
}
