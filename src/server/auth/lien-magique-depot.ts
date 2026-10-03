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
import {
  ESSAIS_DU_CODE_MAX,
  type PortsDEmission,
  type PortsDeConsommation,
  type PortsDuCode,
  type TransactionDeConsommation,
  type TransactionDuCode,
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

/**
 * SEC-54 — la vérification du code, dans UNE transaction. L'essai est compté par UNE instruction
 * conditionnelle (`UPDATE … WHERE tentatives_code < 5 … RETURNING`) : des essais concurrents ne
 * dépassent jamais cinq, et la base le double (CHECK et déclencheur `liens_magiques_code_fige`).
 */
function codeSur(tx: Prisma.TransactionClient): TransactionDuCode {
  const { statutApporteur, ouvrirSession } = consommationSur(tx);
  return {
    statutApporteur,
    ouvrirSession,
    async lienActifDe(emailHash, maintenant) {
      const lien = await tx.lienMagique.findFirst({
        where: {
          apporteur: { emailHash },
          consommeAt: null,
          annuleAt: null,
          expireAt: { gt: maintenant },
          codeHash: { not: null },
        },
        orderBy: [{ creeAt: 'desc' }, { id: 'desc' }],
        select: { id: true, apporteurId: true, kid: true },
      });
      return lien?.apporteurId == null
        ? null
        : { id: lien.id, apporteurId: lien.apporteurId, kid: lien.kid };
    },
    async compterEssai(lienId, maintenant) {
      const [ligne] = await tx.$queryRaw<{ code_hash: string | null; tentatives_code: number }[]>`
        UPDATE "liens_magiques" SET "tentatives_code" = "tentatives_code" + 1
        WHERE "id" = ${lienId}::uuid AND "tentatives_code" < ${ESSAIS_DU_CODE_MAX}
          AND "consomme_at" IS NULL AND "annule_at" IS NULL AND "expire_at" > ${maintenant}
        RETURNING "code_hash", "tentatives_code"`;
      return ligne ? { codeHash: ligne.code_hash, tentatives: ligne.tentatives_code } : null;
    },
    async annulerLien(lienId, maintenant) {
      await tx.lienMagique.updateMany({
        where: { id: lienId, consommeAt: null, annuleAt: null },
        data: { annuleAt: maintenant },
      });
    },
    async consommerParId(lienId, maintenant) {
      const { count } = await tx.lienMagique.updateMany({
        where: { id: lienId, consommeAt: null, annuleAt: null, expireAt: { gt: maintenant } },
        data: { consommeAt: maintenant },
      });
      return count;
    },
  };
}

/** La transaction de la vérification du code : tout le travail de `verifierLeCode`. */
export function transactionDuCode(prisma: PrismaClient): PortsDuCode['transaction'] {
  return (travail) => prisma.$transaction((tx) => travail(codeSur(tx)));
}
