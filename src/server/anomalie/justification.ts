/**
 * DM-12 (REQ-DM-033) — le LECTEUR UNIQUE de la justification d'une anomalie (cadrage de la sécurité,
 * point 4). La justification porte un soupçon sur une personne : elle n'existe en base que CHIFFRÉE
 * (`justification_chiffre`, `CHAMPS_PII`), liée à SA ligne (modèle, id, champ). Seuls les rôles qui
 * ont `action:lire_justification_anomalie` la déchiffrent, et le refus tombe AVANT toute lecture.
 * C'est aussi le lecteur de l'export de l'article 15. Le clair ne part dans AUCUNE sortie : ni
 * journal, ni événement, ni alerte. Une justification purgée se lit `null`.
 */
import type { ConsoleRole } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { decryptPii, type ClesPii } from '../securite/pii';

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
