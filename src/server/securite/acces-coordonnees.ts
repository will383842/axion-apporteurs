/**
 * SEC-52 (REQ-SEC-042) — l'accès de la console aux coordonnées du contact d'une entreprise RÉSERVÉE s'écrit
 * au journal chaîné, par identifiants seuls : QUI a lu (un utilisateur de la console), sur QUELLE attribution
 * (l'`agregatId`), QUAND (la date de l'événement). Rien d'autre : ni nom, ni adresse, ni téléphone, ni SIREN,
 * ni apporteur, ni cause ni date de la réserve. C'est la seule trace qui permette de constater un démarchage
 * hors outil pendant la réserve (HYP-W19-NON-EXPLOITATION).
 *
 * LA LECTURE n'est PAS du démarchage et reste permise : la vérification en a besoin. Cette voie ne refuse
 * jamais ; elle TRACE. Elle ne déchiffre rien elle-même : le déchiffrement des coordonnées du contact reste
 * celui du lecteur de SEC-58 (`lireCoordonneesDuContact`, qui trace aussi la lecture au journal des accès à
 * la console). Cette voie est la SEULE de la console à l'appeler : un témoin dérivé des sources du dépôt le
 * garde (`tests/unit/securite/acces-coordonnees.spec.ts`).
 *
 * L'ORDRE. Le jugement de la réserve (la définition de SEC-51, `portSousVerrou` : le verrou du SIREN que le
 * dépôt prend lui-même, puis les actes de l'apporteur) et l'événement s'écrivent dans UNE transaction, AVANT
 * la lecture : jamais de lecture d'une entreprise réservée sans sa trace. L'échec du jugement vaut RÉSERVÉ
 * (échec fermé, comme la garde) : on trace dans le doute. L'échec de l'écriture de la trace ne laisse rien lire.
 *
 * LIMITE NOMMÉE. La lecture elle-même se fait dans la transaction du lecteur de SEC-58, qui ouvre la sienne :
 * la trace de réserve et la lecture ne sont donc pas dans la MÊME transaction (la trace précède, elle ne peut
 * pas manquer). La fusion des deux demande d'ajouter `src/server/console/journal-des-acces.ts` aux chemins de
 * la tâche (question posée sur #786).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ajouterEvenement } from '../evenement/journal';
import { SEUILS } from '../../domain/seuils/ssot';
import { jugerLaReserve, portSousVerrou, type FaitsDeReserve } from '../demarchage/garde-reserve';
import {
  CibleInconnue,
  lireCoordonneesDuContact,
  type CoordonneesContact,
} from '../console/journal-des-acces';
import type { ClesPii } from './pii';

type Tx = Prisma.TransactionClient;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * Le TÉMOIN DE L'ART. 3.5 du contrat (rattrapage 120) : ce que la console affiche d'une entreprise réservée
 * est l'ÉCHÉANCE de la réserve, et RIEN d'autre — ni l'identifiant ni le nom de l'apporteur, ni la nature de
 * l'acte. L'écran qui l'affiche ne lit que cette valeur. `null` quand aucune réserve ne court.
 */
export function echeanceDeLaReserve(
  faits: FaitsDeReserve,
  maintenant: Date
): { jusqua: Date } | null {
  const duree = SEUILS.RESERVE_APRES_ACTE_APPORTEUR_JOURS.valeur * MS_PAR_JOUR;
  const fins = faits.actes
    .filter((a) => !a.exempte)
    .map((a) => a.at.getTime() + duree)
    .filter((fin) => maintenant.getTime() < fin);
  if (fins.length === 0) return null;
  return { jusqua: new Date(Math.max(...fins)) };
}

/** La nature de l'accès tracé : la lecture n'est jamais du démarchage, mais on juge comme lui (SEC-51). */
const NATURE_DU_JUGEMENT = 'demarchage' as const;

/**
 * Juge la réserve du SIREN de l'attribution, sous le verrou du SIREN, et trace l'accès si elle court. Rend
 * `true` si la trace est écrite. Une cible inconnue est refusée sans rien tracer.
 */
export async function tracerSiReservee(
  tx: Tx,
  demande: { utilisateurConsoleId: string; attributionId: string },
  maintenant: Date
): Promise<boolean> {
  const attribution = await tx.attribution.findUnique({
    where: { id: demande.attributionId },
    select: { siren: true },
  });
  if (attribution === null) throw new CibleInconnue('lecture_coordonnees_contact');
  let reservee: boolean;
  try {
    const faits = await portSousVerrou(tx).lireLesFaits(attribution.siren);
    reservee = !jugerLaReserve(faits, NATURE_DU_JUGEMENT, maintenant).permis;
  } catch {
    // Échec fermé : dans le doute, l'entreprise est réputée réservée, donc l'accès est tracé.
    reservee = true;
  }
  if (!reservee) return false;
  await ajouterEvenement(tx, {
    type: 'acces_coordonnees_reservee',
    agregat: 'attribution',
    agregatId: demande.attributionId,
    survenuAt: maintenant,
    charge: { acteur: { par: 'utilisateur_console', id: demande.utilisateurConsoleId } },
  });
  return true;
}

/**
 * La lecture des coordonnées du contact pour la console, avec la trace de réserve : la SEULE voie de la
 * console. `maintenant` est injecté (rien ici ne lit l'heure).
 */
export async function lireLesCoordonneesDuContactDeLaConsole(
  prisma: PrismaClient,
  demande: { utilisateurConsoleId: string; attributionId: string; adresse: string | null },
  cles: ClesPii,
  maintenant: Date
): Promise<CoordonneesContact> {
  await prisma.$transaction((tx) => tracerSiReservee(tx, demande, maintenant));
  return lireCoordonneesDuContact(prisma, demande, cles);
}
