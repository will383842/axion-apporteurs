/**
 * DM-63 (REQ-DM-011, REQ-SEC-023) — le geste de RÉSILIATION en console : réservé à un rôle nommé,
 * contrôlé côté serveur, et qui journalise un acteur humain identifié.
 *
 * La porte est `requireRole('action:resilier_apporteur', …)`, posée AVANT tout travail : un autre rôle
 * (ou une session absente, expirée, d'une version périmée) est refusé, SANS transaction ouverte et sans
 * effet. L'acteur journalisé est celui de la SESSION relue en base, jamais un champ de la demande :
 * la demande ne porte pas d'acteur, et un acteur glissé dedans est ignoré.
 */
import type { PrismaClient } from '@prisma/client';
import { requireRole, type MotifDeRefusConsole, type PortsDeRole } from '../roles/require-role';
import type { ClesPii } from '../securite/pii';
import { resilierUnApporteur, type DemandeDeResiliation } from './resiliation';

/** Ce que la console envoie : la demande SANS acteur ni horloge, plus le jeton de session. */
export type DemandeDeLaConsole = Omit<DemandeDeResiliation, 'acteur' | 'maintenant'> & {
  readonly jeton: string | undefined;
};

export interface PortsDeLaResiliation {
  readonly role: PortsDeRole;
  readonly prisma: Pick<PrismaClient, '$transaction'>;
  readonly cles: ClesPii;
}

export type VerdictDeLaResiliation =
  | { ok: true; de: string; vers: string; jetonsRevoques: number }
  | { ok: false; motif: MotifDeRefusConsole };

export async function resilierDepuisLaConsole(
  ports: PortsDeLaResiliation,
  demande: DemandeDeLaConsole
): Promise<VerdictDeLaResiliation> {
  const verdict = await requireRole('action:resilier_apporteur', demande.jeton, ports.role);
  if (!verdict.ok) return { ok: false, motif: verdict.motif };
  const maintenant = ports.role.maintenant();
  const r = await ports.prisma.$transaction((tx) =>
    resilierUnApporteur(
      tx,
      {
        apporteurId: demande.apporteurId,
        motif: demande.motif,
        ...(demande.manquement === undefined ? {} : { manquement: demande.manquement }),
        ...(demande.motifDeLaDecision === undefined
          ? {}
          : { motifDeLaDecision: demande.motifDeLaDecision }),
        ...(demande.dateReception === undefined ? {} : { dateReception: demande.dateReception }),
        acteur: { par: 'utilisateur_console', id: verdict.utilisateur.id },
        maintenant,
      },
      ports.cles
    )
  );
  return { ok: true, ...r };
}
