/**
 * DM-63 (REQ-DM-011) — le geste de RÉSILIATION en console : réservé à un rôle nommé,
 * contrôlé côté serveur, et qui journalise un acteur humain identifié.
 *
 * La porte est `requireRole('action:resilier_apporteur', …)`, posée AVANT tout travail : un autre rôle
 * (ou une session absente, expirée, d'une version périmée) est refusé, SANS transaction ouverte et sans
 * effet. L'acteur journalisé est celui de la SESSION relue en base, jamais un champ de la demande :
 * la demande ne porte pas d'acteur, et un acteur glissé dedans est ignoré.
 *
 * LE DROIT EST REJUGÉ DANS LA TRANSACTION (condition de la lentille sécurité, comme pour la mise en
 * demeure) : `resilierUnApporteur` ne rejuge pas le rôle, et un compte désactivé entre la question
 * et la transaction résilierait encore. L'acteur est donc relu en base dans la même transaction :
 * rôle autorisé par la matrice, compte non désactivé, administrateur validé. Sinon, refus sans écriture.
 */
import type { PrismaClient } from '@prisma/client';
import { ouvertATousLesRoles, roleAutorise } from '../roles/matrice';
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

type LigneRelue = {
  readonly role: Parameters<typeof roleAutorise>[1];
  readonly desactiveAt: Date | null;
  readonly valideAt: Date | null;
} | null;

/** Le jugement de l'acteur relu, dans l'ordre de `jugerAcces` : le premier motif qui s'applique l'emporte. */
function refusDeLActeurRelu(ligne: LigneRelue): MotifDeRefusConsole | null {
  if (ligne === null) return 'inconnue';
  if (ligne.desactiveAt !== null) return 'desactive';
  if (!roleAutorise(DROIT, ligne.role)) return 'role_refuse';
  if (ligne.role === 'admin' && ligne.valideAt === null && !ouvertATousLesRoles(DROIT)) {
    return 'admin_en_attente';
  }
  return null;
}

const DROIT = 'action:resilier_apporteur';

export async function resilierDepuisLaConsole(
  ports: PortsDeLaResiliation,
  demande: DemandeDeLaConsole
): Promise<VerdictDeLaResiliation> {
  const verdict = await requireRole('action:resilier_apporteur', demande.jeton, ports.role);
  if (!verdict.ok) return { ok: false, motif: verdict.motif };
  const maintenant = ports.role.maintenant();
  const r = await ports.prisma.$transaction(async (tx) => {
    const relue = await tx.utilisateurConsole.findUnique({
      where: { id: verdict.utilisateur.id },
      select: { role: true, desactiveAt: true, valideAt: true },
    });
    const refus = refusDeLActeurRelu(relue);
    if (refus !== null) return { refus } as const;
    return await resilierUnApporteur(
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
    );
  });
  if ('refus' in r) return { ok: false, motif: r.refus };
  return { ok: true, ...r };
}
