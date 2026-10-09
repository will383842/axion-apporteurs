/**
 * prisma/seed/06-console.ts — le module du semeur pour la console (SEC-17, partners/ADR-0022) : un
 * utilisateur de la console, et, par le MÊME lien magique que l'apporteur, un lien consommé et la
 * session qu'il a ouverte.
 *
 * DÉTERMINISTE : l'identifiant, les jetons et l'instant sont fournis par l'appelant, jamais tirés
 * ici ; mêmes entrées, mêmes lignes. Le courriel et le nom passent par `colonnesPii`, liés à la
 * ligne (modèle `UtilisateurConsole`) ; les empreintes des jetons viennent des producteurs réels
 * (`empreinteDuJeton`, `empreinteDeSessionConsole`, RM-03). Aucun clair ni aucun jeton n'est écrit. La
 * version de la session n'est pas écrite : la base y copie la version de son utilisateur (SEC-30).
 */

import {
  ConsoleRole as ConsoleRoleEnum,
  type ConsoleRole,
  type PrismaClient,
} from '@prisma/client';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import { empreinteDeSessionConsole, empreinteDuJeton } from '../../src/server/auth/lien-magique';
import { colonnesPii, type ClesPii } from '../../src/server/securite/pii';

/** Le nom du modèle dans la donnée authentifiée des blocs chiffrés d'un utilisateur de la console. */
export const MODELE_UTILISATEUR_CONSOLE = 'UtilisateurConsole';

export interface UtilisateurASemer {
  id: string;
  role: ConsoleRole;
  email: string;
  nom: string | null;
  creeAt: Date;
  cles: ClesPii;
  /**
   * SEC-30 (quatre yeux) : la validation d'un administrateur PREMIER, sans validateur. Absente, un
   * admin semé est EN ATTENTE ; le déclencheur `utilisateurs_console_quatre_yeux` n'admet cette date
   * que si aucun autre administrateur actif et validé n'existe.
   */
  valideAt?: Date;
}

export async function semerUtilisateurConsole(
  prisma: PrismaClient,
  u: UtilisateurASemer
): Promise<{ id: string }> {
  const { emailChiffre, emailHash, nomChiffre } = colonnesPii(
    { modele: MODELE_UTILISATEUR_CONSOLE, id: u.id },
    { email: u.email, nom: u.nom },
    u.cles
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  return prisma.utilisateurConsole.create({
    data: {
      id: u.id,
      role: u.role,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      nomChiffre: nomChiffre ? Buffer.from(nomChiffre) : null,
      creeAt: u.creeAt,
      // SEC-30 : un compte semé est ACTIVÉ à sa création, comme le report de la migration
      // (`activee_at = cree_at`) ; jamais au défaut `clock_timestamp()`, qui rendrait le semeur non
      // déterministe d'un passage à l'autre.
      activeeAt: u.creeAt,
      ...(u.valideAt === undefined ? {} : { valideAt: u.valideAt, valideParId: null }),
    },
    select: { id: true },
  });
}

export interface SessionConsoleASemer {
  utilisateurConsoleId: string;
  jetonLien: string;
  jetonSession: string;
  /** L'instant de la consommation du lien, qui est aussi celui de l'ouverture de la session. */
  consommeAt: Date;
  ipHash: string | null;
  configuration: {
    lien: { secret: string; kid: string };
    session: { secret: string; kid: string };
  };
}

export async function semerSessionConsole(
  prisma: PrismaClient,
  s: SessionConsoleASemer
): Promise<{ lienMagiqueId: string; sessionId: string }> {
  const lien = await prisma.lienMagique.create({
    data: {
      utilisateurConsoleId: s.utilisateurConsoleId,
      tokenHash: empreinteDuJeton(s.jetonLien, s.configuration.lien.secret),
      kid: s.configuration.lien.kid,
      creeAt: s.consommeAt,
      expireAt: new Date(s.consommeAt.getTime() + DUREES_AUTH.lienMagiqueMs.valeur),
      consommeAt: s.consommeAt,
    },
    select: { id: true },
  });
  const session = await prisma.sessionEspace.create({
    data: {
      utilisateurConsoleId: s.utilisateurConsoleId,
      lienMagiqueId: lien.id,
      tokenHash: empreinteDeSessionConsole(s.jetonSession, s.configuration.session.secret),
      kid: s.configuration.session.kid,
      ipHash: s.ipHash,
      creeAt: s.consommeAt,
      expireAt: new Date(s.consommeAt.getTime() + DUREES_AUTH.sessionMs.valeur),
      // SEC-29 : la dernière vue posée à l'ouverture ; sans elle, le juge refuse la session comme
      // inactive (jamais vue, échec fermé).
      derniereVueAt: s.consommeAt,
    },
    select: { id: true },
  });
  return { lienMagiqueId: lien.id, sessionId: session.id };
}

/**
 * Le module par défaut du chargeur (`prisma/seed.ts`) : UN administrateur de console, pour qu'une
 * preview soit utilisable. Identifiant en uuid v5 de l'espace de noms fixe, rôle lu dans l'enum de
 * Prisma, instant du contexte, adresse sous le domaine réservé `.invalid` (RFC 2606) : aucune
 * personne réelle, aucune donnée de production. Le courriel et le nom passent par `colonnesPii`.
 */
export default async function semerParDefaut(
  prisma: PrismaClient,
  ctx: { maintenant: Date; uuid: (nom: string) => string; cles: ClesPii }
): Promise<void> {
  const id = ctx.uuid('console/administrateur-de-preview');
  if (await prisma.utilisateurConsole.findUnique({ where: { id }, select: { id: true } })) return;
  await semerUtilisateurConsole(prisma, {
    id,
    role: ConsoleRoleEnum.admin,
    email: 'administrateur@preview.invalid',
    nom: 'Administrateur de preview',
    creeAt: ctx.maintenant,
    cles: ctx.cles,
    // SEC-30 (règle du rattrapage 97) : l'administrateur de preview est VALIDÉ, premier
    // administrateur sans validateur ; en attente, il n'aurait aucun droit d'administrateur.
    valideAt: ctx.maintenant,
  });
}
