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
import { ajouterEvenement } from '../evenement/journal';
import { invitationOuverte } from '../console/utilisateurs/regles';
import { depotDAppareils, type PortsDesAppareils } from './appareil';
import {
  ESSAIS_DU_CODE_MAX,
  type PortsDEmission,
  type PortsDEmissionConsole,
  type PortsDeConsommation,
  type PortsDeConsommationConsole,
  type PortsDuCode,
  type PortsDuCodeConsole,
  type TransactionDeConsommation,
  type TransactionDeConsommationConsole,
  type TransactionDuCode,
  type TransactionDuCodeConsole,
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
    // SEC-55 : l'appareil qui consomme est RECONNU dans cette transaction ; il n'y est jamais confirmé.
    appareils: depotDAppareils(tx),
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
    // SEC-54 : déjà consommé, sous la clé courante, et lien de l'espace (population apporteur).
    async dejaConsomme(tokenHash, kid) {
      const n = await tx.lienMagique.count({
        where: { tokenHash, kid, apporteurId: { not: null }, consommeAt: { not: null } },
      });
      return n === 1;
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
 * SEC-55 — la transaction COURTE de la confirmation, ouverte APRÈS l'avis accepté (voie (b) de la
 * lentille sécurité) : elle relit la session que la consommation a ouverte, avec le lien qui l'a
 * ouverte, et confirme l'appareil par le même dépôt. Aucun appel réseau n'y a lieu.
 */
export function transactionDeConfirmation(prisma: PrismaClient): PortsDesAppareils['transaction'] {
  return (travail) =>
    prisma.$transaction((tx) =>
      travail({
        async lireSession(tokenHash) {
          const ligne = await tx.sessionEspace.findUnique({
            where: { tokenHash },
            select: {
              id: true,
              apporteurId: true,
              kid: true,
              expireAt: true,
              revoqueAt: true,
              sessionVersion: true,
              lienMagiqueId: true,
              apporteur: { select: { statut: true, sessionVersion: true } },
              lienMagique: { select: { consommeAt: true } },
            },
          });
          if (ligne === null) return null;
          const { lienMagiqueId, ...session } = ligne;
          return { ligne: session, lienMagiqueId };
        },
        appareils: depotDAppareils(tx),
      })
    );
}

/**
 * SEC-54 — la vérification du code, dans UNE transaction. L'essai est compté par UNE instruction
 * conditionnelle (`UPDATE … WHERE tentatives_code < 5 … RETURNING`) : des essais concurrents ne
 * dépassent jamais cinq, et la base le double (CHECK et déclencheur `liens_magiques_code_fige`).
 */
function codeSur(tx: Prisma.TransactionClient): TransactionDuCode {
  const { statutApporteur, ouvrirSession, appareils } = consommationSur(tx);
  return {
    statutApporteur,
    ouvrirSession,
    appareils,
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

// ── SEC-29 : la console ──────────────────────────────────────────────────────────────────────────
//
// Les MÊMES écritures que l'espace, pour l'autre population : chaque lecture et chaque écriture
// d'un lien de la console juge `utilisateurConsoleId` non nul (lentille sécurité, condition a). Le
// compte se lit par l'empreinte de son courriel ; l'adresse est le bloc stocké, déchiffré sous la
// ligne qui le porte.

/** Le nom du modèle dans la donnée authentifiée des blocs chiffrés d'un utilisateur de la console. */
export const MODELE_UTILISATEUR_CONSOLE = 'UtilisateurConsole';

/**
 * SEC-30 — l'identité d'un utilisateur de la CONSOLE (son nom et son adresse), déchiffrée ICI, dans le
 * module qui déchiffre déjà l'adresse du courriel de connexion : jamais sous la console, où seul le
 * lecteur unique des coordonnées d'apporteurs et de contacts déchiffre (SEC-58). Lue pour l'écran
 * des utilisateurs (admin seul) et pour les courriels de l'administration. Un bloc absent rend `null`.
 */
export function identiteDeLUtilisateurConsole(
  ligne: { id: string; nomChiffre: Uint8Array | null; emailChiffre: Uint8Array | null },
  cles: ClesPii
): { nom: string | null; adresse: string | null } {
  const lire = (champ: string, bloc: Uint8Array | null) =>
    bloc === null
      ? null
      : decryptPii({ modele: MODELE_UTILISATEUR_CONSOLE, champ, id: ligne.id }, bloc, cles);
  return {
    nom: lire(CHAMPS_PII.nom.chiffre, ligne.nomChiffre),
    adresse: lire(CHAMPS_PII.email.chiffre, ligne.emailChiffre),
  };
}

export type LectureDuCompteConsole = Pick<
  PortsDEmissionConsole,
  'trouverUtilisateurConsole' | 'adresseStockee'
>;

export function lectureDuCompteConsole(
  prisma: PrismaClient,
  cles: ClesPii
): LectureDuCompteConsole {
  return {
    async trouverUtilisateurConsole(emailHash) {
      return prisma.utilisateurConsole.findUnique({
        where: { emailHash },
        select: { id: true, desactiveAt: true },
      });
    },
    async adresseStockee(utilisateurConsoleId) {
      const ligne = await prisma.utilisateurConsole.findUnique({
        where: { id: utilisateurConsoleId },
        select: { emailChiffre: true },
      });
      if (ligne?.emailChiffre == null) throw new Error('adresse_absente : aucun courriel stocké');
      return decryptPii(
        {
          modele: MODELE_UTILISATEUR_CONSOLE,
          champ: CHAMPS_PII.email.chiffre,
          id: utilisateurConsoleId,
        },
        ligne.emailChiffre,
        cles
      );
    },
  };
}

export type EcrituresDeLienConsole = Pick<
  PortsDEmissionConsole,
  'annulerLiensActifs' | 'insererLien'
>;

export function ecrituresDeLienConsole(prisma: PrismaClient): EcrituresDeLienConsole {
  return {
    async annulerLiensActifs(utilisateurConsoleId, maintenant) {
      await prisma.lienMagique.updateMany({
        where: { utilisateurConsoleId, consommeAt: null, annuleAt: null },
        data: { annuleAt: maintenant },
      });
    },
    async insererLien(lien) {
      await prisma.lienMagique.create({ data: lien });
    },
  };
}

function consommationConsoleSur(tx: Prisma.TransactionClient): TransactionDeConsommationConsole {
  return {
    async consommer(condition, donnees) {
      const { count } = await tx.lienMagique.updateMany({ where: condition, data: donnees });
      return count;
    },
    lireLienConsole(tokenHash) {
      return tx.lienMagique.findUnique({
        where: { tokenHash },
        select: { id: true, utilisateurConsoleId: true, kid: true },
      });
    },
    async dejaConsommeConsole(tokenHash, kid) {
      const n = await tx.lienMagique.count({
        where: { tokenHash, kid, utilisateurConsoleId: { not: null }, consommeAt: { not: null } },
      });
      return n === 1;
    },
    async utilisateurActif(utilisateurConsoleId, maintenant) {
      const u = await tx.utilisateurConsole.findUnique({
        where: { id: utilisateurConsoleId },
        select: { desactiveAt: true, inviteeAt: true, activeeAt: true },
      });
      if (u === null || u.desactiveAt !== null) return false;
      // SEC-30 (forme d'A02) : une invitation non activée à son échéance répond comme un compte
      // désactivé ; l'égalité est refusée, à la milliseconde. Un compte activé ne vieillit plus.
      if (u.activeeAt == null && u.inviteeAt != null)
        return invitationOuverte({ inviteeAt: u.inviteeAt, activeeAt: null }, maintenant);
      return true;
    },
    async ouvrirSessionConsole(session) {
      const neuve = await tx.sessionEspace.create({ data: session, select: { id: true } });
      if (session.utilisateurConsoleId == null) return;
      // L'ordre (relecture de la sécurité) : `utilisateurActif` a déjà jugé, avant cette écriture ;
      // puis l'activation ; puis seulement la révocation des autres sessions. Un compte refusé
      // (désactivé, invitation échue) n'arrive jamais ici et ne révoque rien.
      //
      // SEC-30 : la première connexion ACTIVE le compte invité, une seule fois, dans la transaction
      // qui ouvre la session ; le geste est journalisé, l'utilisateur étant son propre acteur.
      const { count } = await tx.utilisateurConsole.updateMany({
        where: { id: session.utilisateurConsoleId, activeeAt: null },
        data: { activeeAt: session.creeAt },
      });
      if (count === 1)
        await ajouterEvenement(tx, {
          type: 'utilisateur_console_modifie',
          agregat: 'utilisateur_console',
          agregatId: session.utilisateurConsoleId,
          survenuAt: session.creeAt,
          charge: {
            geste: 'activer',
            de: null,
            vers: null,
            acteur: { par: 'utilisateur_console', id: session.utilisateurConsoleId },
          },
        });
      // SEC-30 (option (a) de la sécurité) : UNE session de console vivante par personne. Dans la
      // transaction d'ouverture, les AUTRES sessions ouvertes du même utilisateur sont révoquées ;
      // le filtre porte sur l'utilisateur de la console, jamais une session de l'espace n'est
      // touchée. Le relèvement (step-up) en hérite : sa session neuve révoque l'ancienne.
      await tx.sessionEspace.updateMany({
        where: {
          utilisateurConsoleId: session.utilisateurConsoleId,
          revoqueAt: null,
          id: { not: neuve.id },
        },
        data: { revoqueAt: session.creeAt },
      });
    },
  };
}

/** La transaction de consommation d'un lien de la console. */
export function transactionDeConsommationConsole(
  prisma: PrismaClient
): PortsDeConsommationConsole['transaction'] {
  return (travail) => prisma.$transaction((tx) => travail(consommationConsoleSur(tx)));
}

function codeConsoleSur(tx: Prisma.TransactionClient): TransactionDuCodeConsole {
  // L'essai, l'annulation et la consommation par identifiant sont CEUX de l'espace : l'identifiant
  // vient de `lienActifDeConsole`, déjà jugé sur la population, ou il est factice.
  const { compterEssai, annulerLien, consommerParId } = codeSur(tx);
  const { utilisateurActif, ouvrirSessionConsole } = consommationConsoleSur(tx);
  return {
    compterEssai,
    annulerLien,
    consommerParId,
    utilisateurActif,
    ouvrirSessionConsole,
    async lienActifDeConsole(emailHash, maintenant) {
      const lien = await tx.lienMagique.findFirst({
        where: {
          utilisateurConsole: { emailHash },
          utilisateurConsoleId: { not: null },
          consommeAt: null,
          annuleAt: null,
          expireAt: { gt: maintenant },
          codeHash: { not: null },
        },
        orderBy: [{ creeAt: 'desc' }, { id: 'desc' }],
        select: { id: true, utilisateurConsoleId: true, kid: true },
      });
      return lien?.utilisateurConsoleId == null
        ? null
        : { id: lien.id, utilisateurConsoleId: lien.utilisateurConsoleId, kid: lien.kid };
    },
  };
}

/** La transaction de la vérification du code de la console. */
export function transactionDuCodeConsole(prisma: PrismaClient): PortsDuCodeConsole['transaction'] {
  return (travail) => prisma.$transaction((tx) => travail(codeConsoleSur(tx)));
}
