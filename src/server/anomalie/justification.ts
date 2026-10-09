/**
 * DM-12 (REQ-DM-033) — le LECTEUR UNIQUE de la justification d'une anomalie (cadrage de la sécurité,
 * point 4). La justification porte un soupçon sur une personne : elle n'existe en base que CHIFFRÉE
 * (`justification_chiffre`, `CHAMPS_PII`), liée à SA ligne (modèle, id, champ). Seuls les rôles qui
 * ont `action:lire_justification_anomalie` la déchiffrent, et le refus tombe AVANT toute lecture.
 * C'est aussi le lecteur de l'export de l'article 15. Le clair ne part dans AUCUNE sortie : ni
 * journal, ni événement, ni alerte. Une justification purgée se lit `null`.
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { decryptPii, ErreurPii, type ClesPii } from '../securite/pii';

/** Le nom du modèle dans la donnée authentifiée du bloc chiffré d'une anomalie. */
export const MODELE_DE_LA_JUSTIFICATION = 'Anomalie';

export class LectureDeJustificationRefusee extends Error {
  constructor() {
    super('lecture_de_justification_refusee');
    this.name = 'LectureDeJustificationRefusee';
  }
}

/** Le client dont le lecteur a besoin : une lecture, la colonne chiffrée seule. */
export interface ClientDeLaJustification {
  anomalie: {
    findUnique(args: {
      where: { id: string };
      select: { justificationChiffre: true };
    }): Promise<{ justificationChiffre: Uint8Array | null } | null>;
  };
}

export async function lireLaJustification(
  prisma: ClientDeLaJustification,
  demande: { anomalieId: string; role: ConsoleRole },
  cles: ClesPii
): Promise<string | null> {
  if (!roleAutorise('action:lire_justification_anomalie', demande.role)) {
    throw new LectureDeJustificationRefusee();
  }
  const ligne = await prisma.anomalie.findUnique({
    where: { id: demande.anomalieId },
    select: { justificationChiffre: true },
  });
  if (ligne === null || ligne.justificationChiffre === null) return null;
  return decryptPii(
    { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: demande.anomalieId },
    ligne.justificationChiffre,
    cles
  );
}

/**
 * DM-55 — le SECOND point d'entrée du lecteur unique, validé par la lentille sécurité à ses
 * conditions : l'acteur est le SYSTÈME (aucun rôle, aucun jeton, aucune route, aucune trace d'accès),
 * et son seul appelant est le passage d'envoi des notifications de l'espace — un témoin statique le
 * tient. Le triplet est revérifié dans la transaction de l'envoi : l'anomalie est CONFIRMÉE, de CETTE
 * attribution et du MÊME apporteur que le destinataire. Trois issues fermées :
 *   — `{ faits }` : le clair, qui ne sort que vers le texte du courriel ; il n'est jamais consigné ;
 *   — `'purgee'` : justification purgée ou anomalie anonymisée — aucun courriel ne part ;
 *   — `'refusee'` : tout le reste, y compris un bloc qui ne se déchiffre pas sous la donnée
 *     authentifiée de SA ligne.
 */
export async function lireLesFaitsPourLaNotification(
  tx: Prisma.TransactionClient,
  q: { anomalieId: string; attributionId: string; apporteurId: string },
  cles: ClesPii
): Promise<{ faits: string } | 'purgee' | 'refusee'> {
  const a = await tx.anomalie.findUnique({
    where: { id: q.anomalieId },
    select: {
      statut: true,
      attributionId: true,
      apporteurId: true,
      anonymiseeAt: true,
      justificationChiffre: true,
    },
  });
  if (a === null || a.statut !== 'confirmee') return 'refusee';
  if (a.anonymiseeAt !== null || a.justificationChiffre === null) return 'purgee';
  if (a.attributionId !== q.attributionId || a.apporteurId !== q.apporteurId) return 'refusee';
  try {
    return {
      faits: decryptPii(
        { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: q.anomalieId },
        a.justificationChiffre,
        cles
      ),
    };
  } catch (e) {
    if (e instanceof ErreurPii) return 'refusee';
    throw e;
  }
}

/** Le client du lecteur de l'espace : la notification, puis l'anomalie qu'elle désigne. */
export type ClientDesFaitsDeLEspace = Pick<PrismaClient, 'notificationEspace' | 'anomalie'>;

/**
 * UX-P1-58 — le TROISIÈME point d'entrée, DÉDIÉ à l'espace (sécurité, #726, 5984281779, voie (b)) :
 * un lecteur par usage, chacun avec son témoin « seul appelant ». Son seul appelant est le lecteur
 * des notifications de l'espace (`notifications-de-l-espace.ts`) ; celui du passage d'envoi reste
 * inchangé. L'acteur est l'apporteur de la SESSION ouverte, passé par l'appelant, jamais un
 * identifiant de la requête. Il ne rend que les faits d'une anomalie CONFIRMÉE, liée à SA notification
 * `decision_attribution`, après avoir rejugé le triplet ; une anomalie d'un autre apporteur rend
 * `refusee` sans rien déchiffrer. Trois issues fermées, comme le lecteur du passage d'envoi :
 *   — `{ faits }` : le clair, qui ne sort que vers l'écran ; il n'est jamais consigné ;
 *   — `'purgee'` : justification purgée, anomalie anonymisée, ou détachée de la notification ;
 *   — `'refusee'` : tout le reste, y compris un bloc qui ne se déchiffre pas sous SA ligne.
 */
export async function lireLesFaitsPourLEspace(
  client: ClientDesFaitsDeLEspace,
  q: { notificationId: string; apporteurId: string },
  cles: ClesPii
): Promise<{ faits: string } | 'purgee' | 'refusee'> {
  const n = await client.notificationEspace.findUnique({
    where: { id: q.notificationId },
    select: { apporteurId: true, cle: true, attributionId: true, anomalieId: true },
  });
  if (
    n === null ||
    n.apporteurId !== q.apporteurId ||
    n.cle !== 'decision_attribution' ||
    n.attributionId === null
  )
    return 'refusee';
  // L'anomalie anonymisée détache la notification (`ON DELETE SET NULL`) : ses faits ne sont plus conservés.
  if (n.anomalieId === null) return 'purgee';
  const a = await client.anomalie.findUnique({
    where: { id: n.anomalieId },
    select: {
      statut: true,
      attributionId: true,
      apporteurId: true,
      anonymiseeAt: true,
      justificationChiffre: true,
    },
  });
  if (
    a === null ||
    a.statut !== 'confirmee' ||
    a.attributionId !== n.attributionId ||
    a.apporteurId !== q.apporteurId
  )
    return 'refusee';
  if (a.anonymiseeAt !== null || a.justificationChiffre === null) return 'purgee';
  try {
    return {
      faits: decryptPii(
        { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: n.anomalieId },
        a.justificationChiffre,
        cles
      ),
    };
  } catch (e) {
    if (e instanceof ErreurPii) return 'refusee';
    throw e;
  }
}
