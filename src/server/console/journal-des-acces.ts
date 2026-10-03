/**
 * Le journal des accès à la console (SEC-58) et le LECTEUR UNIQUE des coordonnées pour la console.
 *
 * Chaque connexion à la console, et chaque lecture des coordonnées d'un apporteur ou d'un contact
 * depuis elle, laisse UNE trace, par identifiants seuls : qui (l'utilisateur de la console), quand
 * (l'horodatage du serveur), quelle fiche (l'apporteur, ou l'attribution qui porte le contact). Aucun
 * contenu, aucun terme de recherche, aucune adresse réseau.
 *
 * L'ORDRE, DANS UNE SEULE TRANSACTION : la cible est vérifiée par son seul identifiant, la trace est
 * écrite, PUIS les blocs sont lus et déchiffrés. Une trace qui échoue fait échouer la lecture : aucune
 * coordonnée ne sort sans sa trace (échec fermé). Aucune lecture de coordonnées sous la console ne
 * contourne ce module : un témoin statique le tient.
 */
import { randomUUID } from 'node:crypto';
import type { NatureAccesConsole, Prisma, PrismaClient } from '@prisma/client';
import { decryptPii, type ClesPii } from '../securite/pii';
import { MODELE_APPORTEUR } from '../auth/lien-magique-depot';

/**
 * Le modèle sous lequel les coordonnées du contact sont chiffrées, sur l'attribution qui le porte
 * (`colonnesPii({ modele: 'attribution', … })`, `src/server/confirmation/demandes.ts`).
 */
const MODELE_DE_L_ATTRIBUTION = 'attribution';

type Tx = Prisma.TransactionClient;

/** Levée quand la fiche demandée n'existe pas : rien n'est tracé, rien n'est lu. */
export class CibleInconnue extends Error {
  constructor(nature: NatureAccesConsole) {
    super(`cible inconnue pour ${nature}`);
    this.name = 'CibleInconnue';
  }
}

/** Écrit UNE trace, dans la transaction de l'accès. */
async function tracer(
  tx: Tx,
  a: { utilisateurConsoleId: string; nature: NatureAccesConsole; cibleId: string | null }
): Promise<void> {
  await tx.journalAccesConsole.create({
    data: {
      id: randomUUID(),
      utilisateurConsoleId: a.utilisateurConsoleId,
      nature: a.nature,
      cibleId: a.cibleId,
    },
  });
}

/** Trace une connexion à la console : sans cible. */
export async function journaliserConnexionConsole(
  prisma: PrismaClient,
  utilisateurConsoleId: string
): Promise<void> {
  await prisma.$transaction((tx) =>
    tracer(tx, { utilisateurConsoleId, nature: 'connexion', cibleId: null })
  );
}

function dechiffrer(
  modele: string,
  champ: string,
  id: string,
  bloc: Uint8Array | null,
  cles: ClesPii
) {
  return bloc === null ? null : decryptPii({ modele, champ, id }, bloc, cles);
}

export type CoordonneesApporteur = {
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
};

/** Les coordonnées d'un apporteur, lues pour la console : tracées AVANT d'être lues. */
export async function lireCoordonneesDeLApporteur(
  prisma: PrismaClient,
  demande: { utilisateurConsoleId: string; apporteurId: string },
  cles: ClesPii
): Promise<CoordonneesApporteur> {
  const id = demande.apporteurId;
  return prisma.$transaction(async (tx) => {
    const existe = await tx.apporteur.findUnique({ where: { id }, select: { id: true } });
    if (existe === null) throw new CibleInconnue('lecture_coordonnees_apporteur');
    await tracer(tx, {
      utilisateurConsoleId: demande.utilisateurConsoleId,
      nature: 'lecture_coordonnees_apporteur',
      cibleId: id,
    });
    const l = await tx.apporteur.findUnique({
      where: { id },
      select: { nomChiffre: true, prenomChiffre: true, emailChiffre: true, telephoneChiffre: true },
    });
    if (l === null) throw new CibleInconnue('lecture_coordonnees_apporteur');
    return {
      nom: dechiffrer(MODELE_APPORTEUR, 'nomChiffre', id, l.nomChiffre, cles),
      prenom: dechiffrer(MODELE_APPORTEUR, 'prenomChiffre', id, l.prenomChiffre, cles),
      email: dechiffrer(MODELE_APPORTEUR, 'emailChiffre', id, l.emailChiffre, cles),
      telephone: dechiffrer(MODELE_APPORTEUR, 'telephoneChiffre', id, l.telephoneChiffre, cles),
    };
  });
}

export type CoordonneesContact = {
  nom: string | null;
  prenom: string | null;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
};

/** Les coordonnées du contact d'une attribution, lues pour la console : tracées AVANT d'être lues. */
export async function lireCoordonneesDuContact(
  prisma: PrismaClient,
  demande: { utilisateurConsoleId: string; attributionId: string },
  cles: ClesPii
): Promise<CoordonneesContact> {
  const id = demande.attributionId;
  return prisma.$transaction(async (tx) => {
    const existe = await tx.attribution.findUnique({ where: { id }, select: { id: true } });
    if (existe === null) throw new CibleInconnue('lecture_coordonnees_contact');
    await tracer(tx, {
      utilisateurConsoleId: demande.utilisateurConsoleId,
      nature: 'lecture_coordonnees_contact',
      cibleId: id,
    });
    const l = await tx.attribution.findUnique({
      where: { id },
      select: {
        nomContactChiffre: true,
        prenomContactChiffre: true,
        fonctionContactChiffre: true,
        emailChiffre: true,
        telephoneChiffre: true,
      },
    });
    if (l === null) throw new CibleInconnue('lecture_coordonnees_contact');
    const m = MODELE_DE_L_ATTRIBUTION;
    return {
      nom: dechiffrer(m, 'nomContactChiffre', id, l.nomContactChiffre, cles),
      prenom: dechiffrer(m, 'prenomContactChiffre', id, l.prenomContactChiffre, cles),
      fonction: dechiffrer(m, 'fonctionContactChiffre', id, l.fonctionContactChiffre, cles),
      email: dechiffrer(m, 'emailChiffre', id, l.emailChiffre, cles),
      telephone: dechiffrer(m, 'telephoneChiffre', id, l.telephoneChiffre, cles),
    };
  });
}
