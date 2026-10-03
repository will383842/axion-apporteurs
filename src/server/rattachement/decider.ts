/**
 * DM-12 (REQ-DM-034) — l'écrivain du rattachement manuel, ÉMETTEUR de `rattachement_decide`.
 *
 * Il juge AVANT d'écrire : la justification (vingt caractères utiles), aucun lien dans les
 * paramètres libres de la notification (`{decision}`, `{motif}` : note de la lentille sécurité,
 * rattrapage 64), puis, dans la transaction, le lien de contrôle antérieur au dépôt. La décision et
 * son événement (`rattachement_manuel_modifie`, agrégat `attribution`) s'écrivent dans UNE
 * transaction ; la notification part APRÈS, une seule fois, à l'apporteur de l'attribution : un
 * courriel ne se rejoue pas, une transaction annulée n'en envoie aucun. Une attribution portée par
 * un conseiller n'a pas d'apporteur à notifier. Les textes (`{decision}`, `{motif}`) viennent de
 * l'appelant, jamais d'ici.
 */
import type { Prisma } from '@prisma/client';
import { jugerJustification, jugerLienAnterieur } from '../../domain/anomalie/regles';
import { ajouterEvenement, type NouvelEvenement } from '../evenement/journal';
import type { DemandeDeNotification } from '../notifications/envoyer';

type Tx = Prisma.TransactionClient;

export class LienDansUnParametre extends Error {
  constructor(parametre: string) {
    super(`lien_dans_un_parametre : ${parametre}`);
    this.name = 'LienDansUnParametre';
  }
}

/**
 * Un lien, sous toutes les formes qu'un lecteur suivrait : un schéma (`https://`, `mailto:`…), un
 * `www.`, ou un nom de domaine nu (`exemple.fr`). Échec fermé : dans le doute, la saisie est refusée.
 */
const LIEN = /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;

/** Les paramètres libres de la notification, jugés à la saisie. */
const PARAMETRES_LIBRES = ['decision', 'motif'] as const;

export interface DecisionDeRattachement {
  attributionId: string;
  sirenCommande: string;
  justification: string;
  lienControleEtabliAt: Date;
  lienControleSource: string;
  decideParId: string;
  maintenant: Date;
  /** Ce qui part à l'apporteur : son adresse déchiffrée par l'appelant, et les trois paramètres. */
  notification: { a: string; entreprise: string; decision: string; motif: string };
}

export interface PortsDuRattachement {
  prisma: { $transaction<T>(f: (tx: Tx) => Promise<T>): Promise<T> };
  /** L'écrivain du journal ; `ajouterEvenement` par défaut. */
  journaliser?: (tx: Tx, e: NouvelEvenement) => Promise<unknown>;
  /** La notification, liée par l'appelant à la couche de l'apporteur DESTINATAIRE. */
  notifier: (apporteurId: string, demande: DemandeDeNotification) => Promise<unknown>;
}

export async function deciderLeRattachement(
  d: DecisionDeRattachement,
  ports: PortsDuRattachement
): Promise<{ rattachementId: string; notifie: boolean }> {
  for (const p of PARAMETRES_LIBRES) {
    if (LIEN.test(d.notification[p])) throw new LienDansUnParametre(p);
  }
  jugerJustification(d.justification);
  const journaliser = ports.journaliser ?? ajouterEvenement;

  const { rattachementId, apporteurId } = await ports.prisma.$transaction(async (tx) => {
    const attribution = await tx.attribution.findUniqueOrThrow({
      where: { id: d.attributionId },
      select: { apporteurId: true, deposeeAt: true },
    });
    jugerLienAnterieur(d.lienControleEtabliAt, attribution.deposeeAt);
    const cree = await tx.rattachementManuel.create({
      data: {
        attributionId: d.attributionId,
        sirenCommande: d.sirenCommande,
        justification: d.justification,
        lienControleEtabliAt: d.lienControleEtabliAt,
        lienControleSource: d.lienControleSource,
        decideParId: d.decideParId,
        decideAt: d.maintenant,
      },
    });
    await journaliser(tx, {
      type: 'rattachement_manuel_modifie',
      agregat: 'attribution',
      agregatId: d.attributionId,
      survenuAt: d.maintenant,
      charge: {
        rattachementId: cree.id,
        vers: 'decide',
        acteur: { par: 'utilisateur_console', id: d.decideParId },
      },
    });
    return { rattachementId: cree.id, apporteurId: attribution.apporteurId };
  });

  if (apporteurId === null) return { rattachementId, notifie: false };
  await ports.notifier(apporteurId, {
    cle: 'rattachement_decide',
    a: d.notification.a,
    parametres: {
      entreprise: d.notification.entreprise,
      decision: d.notification.decision,
      motif: d.notification.motif,
    },
    attributionId: d.attributionId,
  });
  return { rattachementId, notifie: true };
}
