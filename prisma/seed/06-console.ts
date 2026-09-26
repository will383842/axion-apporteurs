/**
 * prisma/seed/06-console.ts — le module du semeur pour la console (SEC-17, partners/ADR-0022) : un
 * utilisateur de la console, et, par le MÊME lien magique que l'apporteur, un lien consommé et la
 * session qu'il a ouverte.
 *
 * DÉTERMINISTE : l'identifiant, les jetons et l'instant sont fournis par l'appelant, jamais tirés
 * ici ; mêmes entrées, mêmes lignes. Le courriel et le nom passent par `colonnesPii`, liés à la
 * ligne (modèle `UtilisateurConsole`) ; les empreintes des jetons viennent des producteurs réels
 * (`empreinteDuJeton`, `empreinteDeSession`, RM-03). Aucun clair ni aucun jeton n'est écrit. La
 * version de la session n'est pas écrite : la base la pose à 0 pour une session de la console.
 */

import type { ConsoleRole, PrismaClient } from '@prisma/client';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import { empreinteDeSession, empreinteDuJeton } from '../../src/server/auth/lien-magique';
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
      tokenHash: empreinteDeSession(s.jetonSession, s.configuration.session.secret),
      kid: s.configuration.session.kid,
      ipHash: s.ipHash,
      creeAt: s.consommeAt,
      expireAt: new Date(s.consommeAt.getTime() + DUREES_AUTH.sessionMs.valeur),
    },
    select: { id: true },
  });
  return { lienMagiqueId: lien.id, sessionId: session.id };
}
