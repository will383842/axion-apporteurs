/**
 * lien-magique-depot.ts — l'adaptateur Prisma des ports du lien magique (SEC-03).
 *
 * CE QU'IL TIENT, ET CE QU'IL NE TIENT PAS.
 *  - La consommation est UNE écriture : `updateMany` sur la condition que `conditionDeConsommation`
 *    construit, dans la transaction ouverte par `transactionDeConsommation`. L'adaptateur ne lit
 *    jamais avant d'écrire, et ne réécrit pas la condition : il la passe telle quelle.
 *  - Les empreintes arrivent CALCULÉES : aucun secret n'entre ici, aucun jeton en clair non plus.
 *  - La base double le code : `liens_magiques_usage_unique` refuse qu'un lien consommé redevienne
 *    consommable, et `sessions_espace.lien_magique_id` est unique (une session par lien au plus).
 *  - Le compte se lit par l'EMPREINTE de recherche du courriel (`email_hash`, unique), jamais par
 *    un clair ; l'adresse à laquelle le lien part est le bloc STOCKÉ, déchiffré sous la ligne qui le
 *    porte (partners/ADR-0013, décisions 10 et 11) — jamais la saisie.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { CHAMPS_PII, decryptPii, type ClesPii } from '../securite/pii';
import type {
  PortsDEmission,
  PortsDeConsommation,
  TransactionDeConsommation,
} from './lien-magique';

/** Le nom du modèle dans la donnée authentifiée des blocs chiffrés d'un apporteur. */
export const MODELE_APPORTEUR = 'Apporteur';

/** La lecture du compte : par empreinte de courriel, puis l'adresse stockée, déchiffrée. */
export type LectureDuCompte = Pick<PortsDEmission, 'trouverApporteur' | 'adresseStockee'>;

export function lectureDuCompte(prisma: PrismaClient, cles: ClesPii): LectureDuCompte {
  return {
    async trouverApporteur(emailHash) {
      return prisma.apporteur.findUnique({
        where: { emailHash },
        select: { id: true, statut: true },
      });
    },
    async adresseStockee(apporteurId) {
      const ligne = await prisma.apporteur.findUnique({
        where: { id: apporteurId },
        select: { emailChiffre: true },
      });
      if (ligne?.emailChiffre == null) throw new Error('adresse_absente : aucun courriel stocké');
      return decryptPii(
        { modele: MODELE_APPORTEUR, champ: CHAMPS_PII.email.chiffre, id: apporteurId },
        ligne.emailChiffre,
        cles
      );
    },
  };
}

/** Les écritures de l'émission : annuler les liens actifs d'un apporteur, poser le nouveau. */
export type EcrituresDeLien = Pick<PortsDEmission, 'annulerLiensActifs' | 'insererLien'>;

export function ecrituresDeLien(prisma: PrismaClient): EcrituresDeLien {
  return {
    async annulerLiensActifs(apporteurId, maintenant) {
      await prisma.lienMagique.updateMany({
        where: { apporteurId, consommeAt: null, annuleAt: null },
        data: { annuleAt: maintenant },
      });
    },
    async insererLien(lien) {
      await prisma.lienMagique.create({ data: lien });
    },
  };
}

function consommationSur(tx: Prisma.TransactionClient): TransactionDeConsommation {
  return {
    async consommer(condition, donnees) {
      const { count } = await tx.lienMagique.updateMany({ where: condition, data: donnees });
      return count;
    },
    lireLien(tokenHash) {
      return tx.lienMagique.findUnique({
        where: { tokenHash },
        select: { id: true, apporteurId: true, kid: true },
      });
    },
    async statutApporteur(apporteurId) {
      const a = await tx.apporteur.findUnique({
        where: { id: apporteurId },
        select: { statut: true },
      });
      return a?.statut ?? null;
    },
    async ouvrirSession(session) {
      await tx.sessionEspace.create({ data: session });
    },
  };
}

/** La transaction de consommation : tout le travail de `consommerLien` dans UNE transaction. */
export function transactionDeConsommation(
  prisma: PrismaClient
): PortsDeConsommation['transaction'] {
  return (travail) => prisma.$transaction((tx) => travail(consommationSur(tx)));
}
