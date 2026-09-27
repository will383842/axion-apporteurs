/**
 * Le module du semeur d'INT-T10 (partners/ADR-0022, point 14).
 *
 * Il ne sème RIEN, et c'est une décision : `courriels_envoyes` et `suppressions_courriel` ne portent
 * que des empreintes HMAC sous `PII_HASH_KEY`, qu'un semeur ne peut pas calculer sans la clé de
 * l'environnement qu'il sème — et une empreinte inventée ne désignerait aucune adresse. Une ligne se
 * produit par `demanderEnvoi` ou par le webhook des rebonds, jamais à la main (RM-03). Le module
 * existe pour que le chargeur de QA-T06 trouve un module par table créée, dans l'ordre des préfixes.
 */
import type { PrismaClient } from '@prisma/client';

export default async function semerCourriels(prisma: PrismaClient): Promise<void> {
  // Rien à semer : voir l'en-tête. Le client est reçu pour la forme commune des modules.
  void prisma;
}
