/**
 * SEC-15 — un GEL posé en base réelle, pour les témoins qui ont besoin d'un apporteur `suspendu`. Le
 * statut `suspendu` ne s'écrit plus seul : le CHECK `apporteurs_suspendu_si_gele` l'exige avec un gel,
 * et la garde `apporteurs_gel_garde` exige, à la pose, la date, l'auteur et une décision `suspension`
 * du MÊME apporteur. Ce helper écrit donc, sous le propriétaire : un administrateur validé (repris s'il existe), le fait du
 * gel au journal, la décision, puis la pose complète.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ajouterEvenement } from '../../src/server/evenement/journal';

const hex = (octets: number) => randomBytes(octets).toString('hex');

/** Pose un gel `gele_non_confirmation` sur un apporteur `signe` et LIBRE ; le rend `suspendu`. */
export async function poserUnGelEnBase(
  prisma: PrismaClient,
  apporteurId: string,
  maintenant: Date
): Promise<void> {
  // Un administrateur validé et actif déjà en base est REPRIS : la garde des quatre yeux exige un
  // validateur dès qu'il en existe un, et une même base sert à plusieurs gels. Sinon, le premier naît.
  const [existant] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM utilisateurs_console
     WHERE role = 'admin'::console_role AND valide_at IS NOT NULL AND desactive_at IS NULL
     ORDER BY cree_at, id LIMIT 1`
  );
  const [admin] = existant
    ? [existant]
    : await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
         VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
        randomUUID(),
        hex(32),
        maintenant
      );
  const fait = await prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'apporteur_gel_modifie',
      agregat: 'apporteur',
      agregatId: apporteurId,
      survenuAt: maintenant,
      charge: {
        de: 'libre',
        vers: 'gele_non_confirmation',
        par: 'role',
        acteur: { par: 'utilisateur_console', id: admin!.id },
      },
    })
  );
  const decision = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, article, texte_chiffre, evenement_id,
       cle_idempotence, faits_empreinte, cree_at)
     VALUES ($1::uuid, $2::uuid, 'suspension'::geste_decision_contrat, '3.7', $3, $4, $5::uuid, $6, $7)`,
    decision,
    apporteurId,
    randomBytes(40),
    BigInt(fait.id),
    randomUUID(),
    hex(32),
    maintenant
  );
  await prisma.$executeRawUnsafe(
    `UPDATE apporteurs SET statut = 'suspendu', etat_gel = 'gele_non_confirmation',
       depots_geles_depuis = $2, gel_pose_par_id = $3::uuid, gel_decision_contrat_id = $4::uuid
     WHERE id = $1::uuid`,
    apporteurId,
    maintenant,
    admin!.id,
    decision
  );
}
