/**
 * La minimisation de fond des candidatures reçues — INT-T56 (REQ-JUR-029, REQ-DM-036), cas (ii).
 *
 * Une `candidature_recue` qui n'est pas `traite` au-delà de `CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS`
 * (SSOT, plafond provisoire) perd `reponsesJson` de sa charge conservée, comme au passage à `traite`.
 * Le délai n'est tenu QUE par le `WHERE` ci-dessous, jamais recopié dans le SQL du déclencheur (une
 * seconde copie de la SSOT).
 *
 * LE MARQUEUR. Le déclencheur d'immutabilité n'admet cette réécriture que sous
 * `partners.minimisation_de_fond = 'oui'`, posé par `set_config(…, true)` DANS la même transaction
 * interactive que l'UPDATE : il meurt avec elle et ne fuit vers aucune autre connexion du pool. Sous ce
 * marqueur, le statut ne peut pas changer : le fond ne passe jamais une candidature à `traite`.
 *
 * ⚠️ CONSÉQUENCE ASSUMÉE : une candidature `en_erreur` minimisée ne peut plus être retraitée —
 * `snapshotDeCandidature` lève faute de `reponsesJson`, et elle reste `en_erreur`. Le cas
 * « en_erreur ancien » est déjà alerté ; le runbook de mise en service le dit.
 *
 * Une ligne par transaction : un échec n'emporte que sa ligne, et `payload_hash` n'est jamais touché.
 */
import { TypeEvenementRecu, type Prisma, type PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { chargeMinimisee } from '../integrations/axionia/candidature-recue';

const JOUR_MS = 24 * 3600_000;

export async function minimiserCandidatures(
  prisma: Pick<PrismaClient, 'evenementRecu' | '$transaction'>,
  maintenant: Date
): Promise<number> {
  const avant = new Date(
    maintenant.getTime() - SEUILS.CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS.valeur * JOUR_MS
  );
  const lignes = await prisma.evenementRecu.findMany({
    where: {
      eventType: TypeEvenementRecu.candidature_recue,
      statut: { not: 'traite' },
      receivedAt: { lt: avant },
    },
    select: { id: true, charge: true },
  });
  // Seules les charges qui portent ENCORE `reponsesJson` : une déjà minimisée n'est pas réécrite.
  const aMinimiser = lignes.filter(
    (l) =>
      typeof l.charge === 'object' &&
      l.charge !== null &&
      !Array.isArray(l.charge) &&
      Object.hasOwn(l.charge, 'reponsesJson')
  );
  let minimisees = 0;
  for (const l of aMinimiser) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('partners.minimisation_de_fond', 'oui', true)`;
      await tx.evenementRecu.update({
        where: { id: l.id },
        data: { charge: chargeMinimisee(l.charge) as Prisma.InputJsonValue },
      });
    });
    minimisees += 1;
  }
  return minimisees;
}
