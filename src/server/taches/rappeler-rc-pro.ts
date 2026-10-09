/**
 * DM-51 — le rappel d'échéance de l'attestation `rc_pro` (REQ-DM-027, contrat art. 6.4).
 *
 * Un passage du lanceur prend les pièces `rc_pro` COURANTES (`remplacee_at` nulle) et `valide` dont
 * `expire_at - délai <= maintenant < expire_at`, le délai lu dans la SSOT
 * (`RC_PRO_RAPPEL_AVANT_ECHEANCE_JOURS`), et notifie l'apporteur par `notifier()` — la clé
 * `rappel_rc_pro` de la table des notifications, ses textes tels qu'A07 les a arrêtés.
 *
 * IDEMPOTENT PAR LA TRACE : rien ne part si l'apporteur porte déjà, depuis `expire_at - délai`, un
 * courriel `rappel_rc_pro` (`courriels_envoyes.demande_at`) OU une notification `rappel_rc_pro` de
 * l'espace — la seconde tient le cas d'un courriel désactivé par préférence, qui n'écrit aucun
 * courriel mais inscrit la notification. Le rappel de l'échéance précédente, plus ancien que la
 * fenêtre, ne retient rien.
 *
 * La pièce `rc_pro` ne bloque AUCUN versement (art. 5.4) : ce passage n'écrit rien d'autre qu'une
 * notification, et ne lit ni ne touche `piecesBloquantPaiement()`.
 */
import type { PrismaClient } from '@prisma/client';
import { TRANSITIONS_APPORTEUR } from '../../domain/apporteur/matrice';
import type { StatutApporteur } from '../../domain/apporteur/statut';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { forApporteur } from '../acces/for-apporteur';
import { dateEnClair } from '../attribution/notifications';
import { lectureDuCompte } from '../auth/lien-magique-depot';
import { notifier, type DependancesDeLaNotification } from '../notifications/envoyer';
import type { ClesPii } from '../securite/pii';

const CLE = 'rappel_rc_pro';

/**
 * Le contrat a pris fin : le statut d'arrivée de `resilier`, DÉRIVÉ de la matrice de l'apporteur
 * (RM-01), jamais recopié. Un apporteur résilié ne reçoit plus le rappel.
 */
const STATUTS_FIN_DE_CONTRAT: readonly StatutApporteur[] = [
  ...new Set(
    Object.values(TRANSITIONS_APPORTEUR).flatMap((t) =>
      t.resilier === undefined ? [] : [t.resilier]
    )
  ),
];

export type DependancesDuRappel = {
  maintenant: () => Date;
  cles: ClesPii;
  urlDeLEspace: URL;
  envoyerCourriel: DependancesDeLaNotification['envoyerCourriel'];
};

export type BilanDuRappel = { rappeles: number; dejaRappeles: number; echecs: number };

export async function rappelerLesAttestationsRcPro(
  prisma: PrismaClient,
  d: DependancesDuRappel
): Promise<BilanDuRappel> {
  const maintenant = d.maintenant();
  const delaiMs = SEUILS.RC_PRO_RAPPEL_AVANT_ECHEANCE_JOURS.valeur * MS_PAR_JOUR;
  const pieces = await prisma.pieceKyc.findMany({
    where: {
      type: 'rc_pro',
      statut: 'valide',
      remplaceeAt: null,
      apporteur: { statut: { notIn: [...STATUTS_FIN_DE_CONTRAT] } },
      expireAt: { gt: maintenant, lte: new Date(maintenant.getTime() + delaiMs) },
    },
    orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
    select: { apporteurId: true, expireAt: true },
  });
  const compte = lectureDuCompte(prisma, d.cles);
  const bilan: BilanDuRappel = { rappeles: 0, dejaRappeles: 0, echecs: 0 };
  for (const p of pieces) {
    if (p.expireAt === null) continue;
    const depuis = new Date(p.expireAt.getTime() - delaiMs);
    const [courriels, notifications] = await Promise.all([
      prisma.courrielEnvoye.count({
        where: { gabarit: CLE, apporteurId: p.apporteurId, demandeAt: { gte: depuis } },
      }),
      prisma.notificationEspace.count({
        where: { cle: CLE, apporteurId: p.apporteurId, creeAt: { gte: depuis } },
      }),
    ]);
    if (courriels + notifications > 0) {
      bilan.dejaRappeles += 1;
      continue;
    }
    try {
      await notifier(
        {
          cle: CLE,
          a: await compte.adresseStockee(p.apporteurId),
          parametres: { dateEcheance: dateEnClair(p.expireAt) },
          attributionId: null,
        },
        {
          acces: forApporteur(prisma, p.apporteurId),
          envoyerCourriel: d.envoyerCourriel,
          urlDeLEspace: d.urlDeLEspace,
        }
      );
      bilan.rappeles += 1;
    } catch {
      // Un apporteur sans adresse ne retient pas les suivants ; le bilan du battement le compte.
      bilan.echecs += 1;
    }
  }
  return bilan;
}
