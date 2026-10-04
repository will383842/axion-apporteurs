/**
 * Les quatre rôles de la console, pour le DOMAINE (SEC-30, forme d'A02) : le domaine est pur et
 * n'importe pas le client Prisma. Cette liste est confrontée à l'enum `ConsoleRole` du schéma, en
 * ordre et en contenu, par un témoin (`tests/unit/securite/matrice-des-roles.spec.ts`) ; elle ne se
 * modifie jamais seule. Identifiant unique `qualifieur` (`docs/GLOSSAIRE.md` §7).
 */
export const ROLES_CONSOLE = ['admin', 'qualifieur', 'comptable', 'lecteur'] as const;

export type RoleConsole = (typeof ROLES_CONSOLE)[number];

/**
 * Les gestes de l'administration des utilisateurs de la console, un par changement journalisé dans
 * `utilisateur_console_modifie` (SEC-30). `valider` : l'acteur EST le validateur.
 */
export const GESTES_UTILISATEUR_CONSOLE = [
  'inviter',
  'relancer',
  'activer',
  'changer_role',
  'valider',
  'desactiver',
  'reactiver',
  'revoquer_sessions',
] as const;

export type GesteUtilisateurConsole = (typeof GESTES_UTILISATEUR_CONSOLE)[number];
