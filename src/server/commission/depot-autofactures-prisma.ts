/**
 * T-ARG-045 — l'adaptateur Prisma du port d'émission des autofactures (REQ-ARG-014, REQ-ARG-018).
 *
 * LE CONTRAT, tenu ici et par la base (migration 20261009183517, A02) :
 *   — une ligne entre dans au plus UNE autofacture : l'affectation est l'`UPDATE … WHERE
 *     autofacture_id IS NULL RETURNING id` de la transaction d'émission. Sous READ COMMITTED, un
 *     passage concurrent attend le verrou de la ligne, réévalue la condition après la validation de
 *     l'autre, et n'affecte plus rien ; le déclencheur `lignes_commission_facturee_figee` refuse, de
 *     toute façon, de changer une affectation posée ;
 *   — l'émission affecte PUIS insère : la clé étrangère composite est différée à la validation ;
 *   — le NUMÉRO n'est jamais fourni par l'application : le déclencheur `autofactures_numerotation`
 *     le pose depuis `compteurs_autofacture`, sous le verrou du compteur, sans trou ; une transaction
 *     annulée ne consomme aucun numéro ;
 *   — à la validation, la base vérifie que le montant est la somme exacte des lignes.
 *
 * Rien du contenu d'une autofacture n'est journalisé ici.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient, LigneCommission } from '@prisma/client';
import type { LigneAcquise } from '../../domain/commission/autofacture';
import type { DateCivile } from '../../domain/temps/calendrier-civil';
import type { DepotAutofactures } from './emission-autofactures';

/** Une colonne `date` arrive à minuit UTC : on en lit le jour civil tel qu'écrit. */
const versDateCivile = (d: Date): DateCivile => ({
  annee: d.getUTCFullYear(),
  mois: d.getUTCMonth() + 1,
  jour: d.getUTCDate(),
});

const versDate = ({ annee, mois, jour }: DateCivile): Date =>
  new Date(Date.UTC(annee, mois - 1, jour));

function versLigneAcquise(l: LigneCommission): LigneAcquise {
  const base = {
    id: l.id,
    apporteurId: l.apporteurId,
    commissionCents: l.commissionCents,
    encaissementIntegralLe: versDateCivile(l.encaissementIntegralLe),
    constateLe: versDateCivile(l.constateLe),
  };
  if (l.type === 'parrainage') return { ...base, nature: 'parrainage' };
  if (l.commandeRef === null || l.prixFactureCents === null || l.prixPublicCents === null) {
    throw new Error(`ligne ${l.id} : une ligne de commission porte sa commande et ses prix`);
  }
  return {
    ...base,
    nature: 'commande',
    commandeRef: l.commandeRef,
    prixFactureCents: l.prixFactureCents,
    prixPublicCents: l.prixPublicCents,
  };
}

export function depotAutofacturesPrisma(prisma: PrismaClient): DepotAutofactures {
  return {
    async lignesLibres() {
      const lignes = await prisma.ligneCommission.findMany({
        where: {
          autofactureId: null,
          statut: 'acquise',
          type: { in: ['commission', 'parrainage'] },
        },
        orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
      });
      return lignes.map(versLigneAcquise);
    },
    transaction(fn) {
      return prisma.$transaction((tx) =>
        fn({
          nouvelId: () => randomUUID(),
          async affecterSiLibre(ids, autofactureId) {
            if (ids.length === 0) return [];
            const rendues = await tx.$queryRaw<{ id: string }[]>`
              UPDATE "lignes_commission"
                 SET "autofacture_id" = ${autofactureId}::uuid
               WHERE "id" = ANY(${[...ids]}::uuid[])
                 AND "autofacture_id" IS NULL
              RETURNING "id"::text AS "id"`;
            return rendues.map((r) => r.id);
          },
          async creerAutofacture(af) {
            // Aucun `numero` : la base le pose (`autofactures_numerotation`).
            await tx.autofacture.create({
              data: {
                id: af.id,
                apporteurId: af.apporteurId,
                emiseLe: versDate(af.emiseLe),
                echeanceLe: versDate(af.echeanceLe),
                montantCents: af.montantCents,
              },
            });
          },
        })
      );
    },
  };
}
