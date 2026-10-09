/**
 * L'administration des utilisateurs de la console — SEC-30 (REQ-SEC-023, REQ-SEC-003, REQ-DM-024).
 *
 * CHAQUE GESTE, UNE TRANSACTION : l'écriture et son événement `utilisateur_console_modifie` (forme
 * d'A02) partent ensemble ou pas du tout. Un événement refusé par son schéma fermé annule le geste.
 *
 * CE QUE LA BASE TIENT DÉJÀ, ET QUI N'EST PAS RÉÉCRIT ICI : la version de session incrémentée à tout
 * changement de rôle et à toute désactivation (déclencheur `utilisateurs_console_version_de_session`),
 * les quatre yeux sur un administrateur (déclencheur `utilisateurs_console_quatre_yeux`), et
 * l'invitation invitée-ou-activée (CHECK). Ce module ajoute ce que la base ne peut pas dire : personne
 * ne touche à son propre compte, et seul un admin agit.
 *
 * Appelé sous `requireRole('action:gerer_utilisateur_console', …)`, à step-up : l'acteur arrive JUGÉ.
 * Ni adresse ni nom dans un refus, un journal ou un événement.
 */
import { randomUUID } from 'node:crypto';
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import type { GesteUtilisateurConsole } from '../../../domain/console/roles';
import { ajouterEvenement } from '../../evenement/journal';
import { MODELE_UTILISATEUR_CONSOLE } from '../../auth/lien-magique-depot';
import { colonnesPii, type ClesPii } from '../../securite/pii';
import { roleAutorise } from '../../roles/matrice';
import { jugerChangementDeRole } from './regles';
import {
  courrielDInvitation,
  courrielsDeCreationDAdministrateur,
  courrielsDeReactivationDAdministrateur,
  type CourrielDeLAdministration,
} from './courriels';

export type MotifDAdministration =
  | 'droit_absent'
  | 'auto_changement'
  | 'sans_changement'
  | 'propre_compte'
  | 'introuvable'
  | 'deja_active'
  | 'deja_dans_cet_etat';

export class ErreurAdministrationConsole extends Error {
  constructor(readonly motif: MotifDAdministration) {
    super(`administration_console : ${motif}`);
    this.name = 'ErreurAdministrationConsole';
  }
}

export interface ActeurDeLaConsole {
  readonly id: string;
  readonly role: ConsoleRole;
}

type Tx = Prisma.TransactionClient;

/** L'événement du geste, dans la transaction ; `de` et `vers` ne valent que pour le rôle. */
async function journaliser(
  tx: Tx,
  d: {
    geste: GesteUtilisateurConsole;
    cibleId: string;
    acteur: ActeurDeLaConsole;
    maintenant: Date;
    de?: ConsoleRole | null;
    vers?: ConsoleRole | null;
  }
): Promise<void> {
  await ajouterEvenement(tx, {
    type: 'utilisateur_console_modifie',
    agregat: 'utilisateur_console',
    agregatId: d.cibleId,
    survenuAt: d.maintenant,
    charge: {
      geste: d.geste,
      de: d.de ?? null,
      vers: d.vers ?? null,
      acteur: { par: 'utilisateur_console', id: d.acteur.id },
    },
  });
}

/** Seul un admin agit, et jamais sur son propre compte. */
function exigerUnAutreCompte(acteur: ActeurDeLaConsole, cibleId: string): void {
  if (!roleAutorise('action:gerer_utilisateur_console', acteur.role))
    throw new ErreurAdministrationConsole('droit_absent');
  if (acteur.id === cibleId) throw new ErreurAdministrationConsole('propre_compte');
}

async function lireLaCible(tx: Tx, cibleId: string) {
  const c = await tx.utilisateurConsole.findUnique({
    where: { id: cibleId },
    select: { id: true, role: true, desactiveAt: true, activeeAt: true },
  });
  if (c === null) throw new ErreurAdministrationConsole('introuvable');
  return c;
}

/** Changer le rôle d'un AUTRE utilisateur. Toutes ses sessions tombent à la requête suivante. */
export async function changerLeRole(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDeLaConsole;
    cibleId: string;
    vers: ConsoleRole;
    maintenant: Date;
    /** Pour lire les adresses des administrateurs, si le geste crée un administrateur. */
    cles: ClesPii;
  }
): Promise<{ courriels: CourrielDeLAdministration[] }> {
  return prisma.$transaction(async (tx) => {
    const cible = await lireLaCible(tx, d.cibleId);
    const verdict = jugerChangementDeRole({ acteur: d.acteur, cible, vers: d.vers });
    if (!verdict.ok) throw new ErreurAdministrationConsole(verdict.motif);
    await tx.utilisateurConsole.update({ where: { id: cible.id }, data: { role: d.vers } });
    await journaliser(tx, {
      geste: 'changer_role',
      cibleId: cible.id,
      acteur: d.acteur,
      maintenant: d.maintenant,
      de: cible.role,
      vers: d.vers,
    });
    // Un passage VERS admin crée un administrateur (en attente) : tous les administrateurs actifs
    // en sont notifiés, comme pour une invitation d'administrateur.
    const courriels =
      d.vers === 'admin'
        ? await courrielsDeCreationDAdministrateur(tx, {
            creeId: cible.id,
            auteurId: d.acteur.id,
            maintenant: d.maintenant,
            cles: d.cles,
          })
        : [];
    return { courriels };
  });
}

/** Désactiver un AUTRE utilisateur, avec effet à la requête suivante (sa version monte). */
export async function desactiver(
  prisma: PrismaClient,
  d: { acteur: ActeurDeLaConsole; cibleId: string; maintenant: Date }
): Promise<void> {
  exigerUnAutreCompte(d.acteur, d.cibleId);
  await prisma.$transaction(async (tx) => {
    const cible = await lireLaCible(tx, d.cibleId);
    if (cible.desactiveAt !== null) throw new ErreurAdministrationConsole('deja_dans_cet_etat');
    await tx.utilisateurConsole.update({
      where: { id: cible.id },
      data: { desactiveAt: d.maintenant },
    });
    await journaliser(tx, { geste: 'desactiver', ...d, cibleId: cible.id });
  });
}

/**
 * Réactiver un AUTRE utilisateur désactivé. Ses anciennes sessions restent tombées. Un administrateur
 * réactivé repart en attente (déclencheur des quatre yeux) : tous les administrateurs actifs, auteur
 * compris, en sont notifiés (`admin_reactive`, rattrapage 98).
 */
export async function reactiver(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDeLaConsole;
    cibleId: string;
    maintenant: Date;
    /** Pour lire les adresses des administrateurs, si le compte réactivé est un administrateur. */
    cles: ClesPii;
  }
): Promise<{ courriels: CourrielDeLAdministration[] }> {
  exigerUnAutreCompte(d.acteur, d.cibleId);
  return prisma.$transaction(async (tx) => {
    const cible = await lireLaCible(tx, d.cibleId);
    if (cible.desactiveAt === null) throw new ErreurAdministrationConsole('deja_dans_cet_etat');
    await tx.utilisateurConsole.update({ where: { id: cible.id }, data: { desactiveAt: null } });
    await journaliser(tx, { geste: 'reactiver', ...d, cibleId: cible.id });
    const courriels =
      cible.role === 'admin'
        ? await courrielsDeReactivationDAdministrateur(tx, {
            reactiveId: cible.id,
            auteurId: d.acteur.id,
            maintenant: d.maintenant,
            cles: d.cles,
          })
        : [];
    return { courriels };
  });
}

/** Faire tomber toutes les sessions d'un AUTRE utilisateur, à la demande (sa version monte d'un cran). */
export async function revoquerLesSessions(
  prisma: PrismaClient,
  d: { acteur: ActeurDeLaConsole; cibleId: string; maintenant: Date }
): Promise<void> {
  exigerUnAutreCompte(d.acteur, d.cibleId);
  await prisma.$transaction(async (tx) => {
    const cible = await lireLaCible(tx, d.cibleId);
    await tx.utilisateurConsole.update({
      where: { id: cible.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await journaliser(tx, { geste: 'revoquer_sessions', ...d, cibleId: cible.id });
  });
}

/**
 * Valider un AUTRE administrateur (quatre yeux) : l'acteur EST le validateur. La base refuse un
 * validateur en attente, désactivé ou non administrateur, et une validation déjà posée.
 */
export async function validerLAdministrateur(
  prisma: PrismaClient,
  d: { acteur: ActeurDeLaConsole; cibleId: string; maintenant: Date }
): Promise<void> {
  exigerUnAutreCompte(d.acteur, d.cibleId);
  await prisma.$transaction(async (tx) => {
    const cible = await lireLaCible(tx, d.cibleId);
    await tx.utilisateurConsole.update({
      where: { id: cible.id },
      data: { valideParId: d.acteur.id, valideAt: d.maintenant },
    });
    await journaliser(tx, { geste: 'valider', ...d, cibleId: cible.id });
  });
}

/**
 * Inviter une personne : une ligne INVITÉE, non activée (`activee_at` nul, écrit EXPLICITEMENT), à
 * l'adresse chiffrée. Le compte s'active à sa première connexion ; l'invitation expire sinon. Un
 * admin invité naît EN ATTENTE de validation. Rend l'identifiant de la ligne.
 */
export async function inviter(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDeLaConsole;
    email: string;
    role: ConsoleRole;
    cles: ClesPii;
    maintenant: Date;
    /** L'adresse de `/console/connexion`, SANS jeton : seule forme qu'un courriel d'invitation porte. */
    adresseConnexion: string;
  }
): Promise<{ id: string; courriels: CourrielDeLAdministration[] }> {
  if (!roleAutorise('action:gerer_utilisateur_console', d.acteur.role))
    throw new ErreurAdministrationConsole('droit_absent');
  const id = randomUUID();
  const courriels = await prisma.$transaction(async (tx) => {
    await tx.utilisateurConsole.create({
      data: {
        role: d.role,
        // Le bloc et l'empreinte naissent de colonnesPii, ÉTALÉ (garde securite:schema-pii) ; `id`
        // vient de lui aussi. Prisma 5 accepte un Uint8Array là où il type Buffer.
        ...(colonnesPii(
          { modele: MODELE_UTILISATEUR_CONSOLE, id },
          { email: d.email },
          d.cles
        ) as unknown as {
          id: string;
          emailChiffre: Buffer;
          emailHash: string;
        }),
        creeAt: d.maintenant,
        inviteeAt: d.maintenant,
        activeeAt: null,
      },
    });
    await journaliser(tx, {
      geste: 'inviter',
      cibleId: id,
      acteur: d.acteur,
      maintenant: d.maintenant,
      vers: d.role,
    });
    const invitation = courrielDInvitation({
      a: d.email,
      role: d.role,
      adresseConnexion: d.adresseConnexion,
      inviteeAt: d.maintenant,
    });
    // Toute création d'un administrateur est notifiée à tous les administrateurs actifs.
    const creation =
      d.role === 'admin'
        ? await courrielsDeCreationDAdministrateur(tx, {
            creeId: id,
            auteurId: d.acteur.id,
            maintenant: d.maintenant,
            cles: d.cles,
          })
        : [];
    return [invitation, ...creation];
  });
  return { id, courriels };
}

/** Relancer une invitation NON activée : `invitee_at` reposé, aucun second compte. */
export async function relancer(
  prisma: PrismaClient,
  d: { acteur: ActeurDeLaConsole; cibleId: string; maintenant: Date }
): Promise<void> {
  exigerUnAutreCompte(d.acteur, d.cibleId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.utilisateurConsole.updateMany({
      where: { id: d.cibleId, activeeAt: null },
      data: { inviteeAt: d.maintenant },
    });
    if (count !== 1) throw new ErreurAdministrationConsole('deja_active');
    await journaliser(tx, { geste: 'relancer', ...d });
  });
}
