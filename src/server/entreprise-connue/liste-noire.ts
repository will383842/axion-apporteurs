/**
 * La liste tenue par la Société (DM-65, REQ-DM-028, contrat art. 3.3 bis (b)) : AJOUTER un SIREN
 * d'organisme et l'en RETIRER. Retirer un SIREN le rend déclarable : les deux gestes sont réservés au
 * rôle que la matrice nomme (`action:tenir_liste_noire`), relu dans la transaction, jamais reçu de
 * l'appelant.
 *
 * LA TRACE EST TENUE PAR LA BASE. L'ajout est l'INSERT dans `sirens_liste_noire` : le déclencheur
 * `sirens_liste_noire_tracer_ajout` ouvre la période de trace dans la même transaction. Le retrait
 * ferme d'abord la période ouverte (auteur, date), puis supprime la ligne : le déclencheur
 * `sirens_liste_noire_retrait_trace` refuse tout retrait dont la période n'est pas fermée. Le code ne
 * peut donc oublier ni l'un ni l'autre.
 *
 * Un refus est une `ErreurListeNoire` au code nommé, et rien n'est écrit.
 */
import { Prisma, type MotifListeNoire, type PrismaClient } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';

/** Le droit de la matrice qui ouvre l'ajout et le retrait. */
export const DROIT_DE_TENIR_LA_LISTE = 'action:tenir_liste_noire' as const;

export type CodeDeRefusListeNoire = 'role_refuse' | 'deja_inscrit' | 'absent';

export class ErreurListeNoire extends Error {
  constructor(readonly code: CodeDeRefusListeNoire) {
    super(`liste de la Société : ${code}`);
    this.name = 'ErreurListeNoire';
  }
}

/**
 * L'auteur relu dans la transaction : son rôle, sa désactivation et sa validation, tels que la base les
 * porte. Un administrateur non encore validé n'a aucun droit d'administrateur (quatre yeux, SEC-30).
 */
async function exigerLeRole(tx: Prisma.TransactionClient, auteurId: string): Promise<void> {
  const auteur = await tx.utilisateurConsole.findUnique({
    where: { id: auteurId },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    auteur === null ||
    auteur.desactiveAt !== null ||
    auteur.valideAt === null ||
    !roleAutorise(DROIT_DE_TENIR_LA_LISTE, auteur.role)
  ) {
    throw new ErreurListeNoire('role_refuse');
  }
}

/** Inscrit un SIREN sous une catégorie ; la base ouvre sa période de trace. */
export async function ajouterALaListe(
  prisma: PrismaClient,
  demande: { readonly siren: string; readonly motif: MotifListeNoire; readonly auteurId: string }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await exigerLeRole(tx, demande.auteurId);
    try {
      await tx.sirenListeNoire.create({
        data: { siren: demande.siren, motif: demande.motif, ajouteParId: demande.auteurId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ErreurListeNoire('deja_inscrit');
      }
      throw e;
    }
  });
}

/**
 * Retire un SIREN : la période ouverte est fermée (auteur, `maintenant`), puis la ligne supprimée,
 * dans une transaction. La ligne est relue sous verrou : deux retraits simultanés n'en ferment
 * qu'une.
 */
export async function retirerDeLaListe(
  prisma: PrismaClient,
  demande: { readonly siren: string; readonly auteurId: string; readonly maintenant: Date }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await exigerLeRole(tx, demande.auteurId);
    const inscrite = await tx.$queryRaw<{ siren: string }[]>`
      SELECT siren FROM sirens_liste_noire WHERE siren = ${demande.siren} FOR UPDATE`;
    if (inscrite.length === 0) throw new ErreurListeNoire('absent');
    await tx.sirenListeNoireTrace.updateMany({
      where: { siren: demande.siren, retireAt: null },
      data: { retireParId: demande.auteurId, retireAt: demande.maintenant },
    });
    await tx.sirenListeNoire.delete({ where: { siren: demande.siren } });
  });
}
