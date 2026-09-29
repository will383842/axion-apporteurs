/**
 * prisma/seed/05-sessions.ts — le module du semeur pour les sessions de l'espace (SEC-04,
 * partners/ADR-0022 point 14) : un lien de connexion CONSOMMÉ et la session qu'il a ouverte.
 *
 * DÉTERMINISTE : les jetons et l'instant sont fournis par l'appelant, jamais tirés ici ; mêmes
 * entrées, mêmes lignes. Les empreintes viennent des producteurs réels (`empreinteDuJeton`,
 * `empreinteDeSession`, RM-03), sous les secrets fournis : aucun jeton en clair n'est écrit. La
 * version de la session n'est pas écrite ici : la base la copie de l'apporteur à l'ouverture.
 */

import type { PrismaClient } from '@prisma/client';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import { empreinteDeSession, empreinteDuJeton } from '../../src/server/auth/lien-magique';

export interface SessionASemer {
  apporteurId: string;
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

export async function semerSession(
  prisma: PrismaClient,
  s: SessionASemer
): Promise<{ lienMagiqueId: string; sessionId: string }> {
  const lien = await prisma.lienMagique.create({
    data: {
      apporteurId: s.apporteurId,
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
      apporteurId: s.apporteurId,
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

/**
 * Le module par défaut du chargeur (`prisma/seed.ts`) : il ne sème AUCUNE session. Une session
 * appartient à un apporteur, et aucun module du semeur ne sème encore d'apporteur : la tâche qui
 * livrera ce module appellera `semerSession` avec les jetons et l'instant du contexte.
 */
export default async function semerParDefaut(): Promise<void> {
  // Rien à semer : voir ci-dessus.
}
