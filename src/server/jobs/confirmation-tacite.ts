/**
 * DM-24 (REQ-DM-042, REQ-DM-006, HYP-W20-TACITE) — le passage de la confirmation tacite, horloge
 * INJECTÉE. Il promeut en `active` toute attribution `provisoire` d'un APPORTEUR dont la demande de
 * confirmation a été reçue depuis `CONFIRMATION_TACITE_JOURS` jours au moins, sans confirmation ni
 * `non_confirme`, et que SEC-41 ne signale pas ; c'est la SEULE conséquence attachée au silence de
 * l'entreprise pour une demande non signalée.
 *
 * « TOUT CE QUI EST DÛ À L'INSTANT t » (REQ-QA-027) : le passage juge l'échéance à la minute, pas une
 * fois par jour ; une échéance à 23 h 59 est promue le jour dit.
 *
 * UNE PROMOTION, UNE TRANSACTION : l'état, les dates (`confirmeeAt`, `fenetreFinAt` qui court de la
 * promotion) et l'événement `attribution_etat_modifie` (`confirmee_tacitement`) sont écrits ensemble
 * par l'écrivain des transitions. La demande est relue DANS la transaction : un clic ou un rebond
 * arrivé entre la sélection et l'écriture l'emporte. Deux passages n'écrivent qu'un événement : une
 * attribution déjà `active` n'est plus sélectionnée.
 *
 * LA DEMANDE SIGNALÉE est jugée par le prédicat de SEC-41, à l'échéance, jamais recopié ici. Le site
 * de l'entreprise n'est pas connu de la base : la comparaison de domaine n'a rien à comparer.
 *
 * LA COMMANDE RATTACHÉE. Une confirmation suivie d'une commande valable déjà rattachée appelle
 * `devis_signe` ; aucune commande n'est encore rattachable en phase 1 : l'appelant dit `false`.
 */
import type { PrismaClient } from '@prisma/client';
import {
  echeanceTacite,
  promotionTaciteDue,
  recueAt,
  ETATS_DE_DEMANDE_RECUE,
} from '../../domain/attribution/confirmation-tacite';
import type { EtatAttribution } from '../../domain/attribution/machine';
import type { EtatDemandeConfirmation } from '../../domain/confirmation/demande';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { confirmerUneAttribution } from '../attribution/transitionner';
import { demandeSignalee, faitsDeVerification } from '../securite/verification-suggeree';
import type { ClesPii } from '../securite/pii';

/** Un lot de lecture : un passage reprend au suivant ce qu'il n'a pas fini. */
const LOT = 100;

/**
 * La marge de la présélection : un jour de plus que le délai couvre tout changement d'heure. Le
 * jugement exact est `promotionTaciteDue`, à la minute.
 */
const MARGE_JOURS = 1;

export async function confirmerTacitement(
  prisma: PrismaClient,
  p: { maintenant: Date; cles: ClesPii }
): Promise<{ promues: number; signalees: number }> {
  const { maintenant, cles } = p;
  const auPlusTard = new Date(
    maintenant.getTime() - (SEUILS.CONFIRMATION_TACITE_JOURS.valeur - MARGE_JOURS) * MS_PAR_JOUR
  );
  let promues = 0;
  let signalees = 0;
  let apres: string | undefined;
  for (;;) {
    const lot = await prisma.attribution.findMany({
      where: {
        statut: 'provisoire',
        apporteurId: { not: null },
        demandeConfirmation: {
          etat: { in: [...ETATS_DE_DEMANDE_RECUE] },
          envoyeeAt: { lte: auPlusTard },
        },
        ...(apres === undefined ? {} : { id: { gt: apres } }),
      },
      select: {
        id: true,
        demandeConfirmation: { select: { etat: true, envoyeeAt: true } },
      },
      orderBy: { id: 'asc' },
      take: LOT,
    });
    if (lot.length === 0) break;
    apres = lot.at(-1)!.id;
    for (const a of lot) {
      const d = a.demandeConfirmation;
      const demande =
        d === null ? null : { etat: d.etat, envoyeeAt: d.envoyeeAt?.getTime() ?? null };
      const recue = demande === null ? null : recueAt(demande);
      if (recue === null || maintenant.getTime() < echeanceTacite(recue)) continue;
      const signalee = demandeSignalee(
        await faitsDeVerification(prisma, { attributionId: a.id, domaineDuSite: null, cles })
      );
      if (signalee) {
        signalees += 1;
        continue;
      }
      const faite = await prisma.$transaction(async (tx) => {
        // Relue sous la transaction : l'état de la demande et de l'attribution font foi à l'écriture.
        const [l] = await tx.$queryRaw<
          {
            statut: EtatAttribution;
            apporteur_id: string | null;
            etat: EtatDemandeConfirmation | null;
            envoyee_at: Date | null;
          }[]
        >`
          SELECT a.statut::text AS statut, a.apporteur_id::text AS apporteur_id,
                 d.etat::text AS etat, d.envoyee_at
          FROM attributions a LEFT JOIN demandes_confirmation d ON d.attribution_id = a.id
          WHERE a.id = ${a.id}::uuid FOR UPDATE OF a`;
        if (!l) return false;
        const due = promotionTaciteDue({
          statut: l.statut,
          porteur: l.apporteur_id === null ? 'conseiller' : 'apporteur',
          demande:
            l.etat === null
              ? null
              : {
                  etat: l.etat,
                  envoyeeAt: l.envoyee_at?.getTime() ?? null,
                },
          signalee: false,
          maintenant: maintenant.getTime(),
        });
        if (!due) return false;
        await confirmerUneAttribution(tx, {
          attributionId: a.id,
          transition: 'confirmee_tacitement',
          acteur: { par: 'systeme' },
          maintenant,
          commandeValableRattachee: false,
        });
        return true;
      });
      if (faite) promues += 1;
    }
    if (lot.length < LOT) break;
  }
  return { promues, signalees };
}
