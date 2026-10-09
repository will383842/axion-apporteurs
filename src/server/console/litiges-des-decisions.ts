/**
 * Le litige sur une décision de contrat (JUR-T64 ; code civil art. 2241 et 2231 ; règle de la juriste,
 * #703 6041829569 ; forme d'A02, #703 6041868006).
 *
 * Un administrateur OUVRE un litige sur une décision (mise en demeure, résiliation, suspension), avec un
 * motif FERMÉ ; tant qu'il est ouvert, le texte de la décision n'est jamais purgé. Il le CLÔT avec un
 * motif FERMÉ ; le départ de la conservation devient alors le plus tardif du départ ordinaire et du jour
 * de la clôture (`departApresLesLitiges`, dans la purge de DM-70). AUCUN texte libre, aucune notification
 * à l'apporteur : c'est une mesure de conservation interne.
 *
 * La base tient la forme : un litige naît ouvert, à l'heure de la base, sur une décision dont le texte
 * existe encore ; un seul ouvert par décision ; seule la clôture s'écrit, une fois ; le filet
 * `decisions_de_contrat_gel_litige` refuse la purge d'un texte au litige ouvert. Ce module ajoute ce que
 * la base ne peut pas dire : le droit relu en base, les refus nommés de la juriste, et l'événement chaîné
 * `decision_contrat_litige_modifie`, dans la MÊME transaction.
 *
 * OUVRIR et CLORE : un administrateur VALIDÉ, sous step-up (les deux droits portent `stepUp: true`) ; le
 * rôle, la désactivation et la validation sont RELUS dans la transaction.
 */
import { randomUUID } from 'node:crypto';
import type {
  MotifClotureLitige,
  MotifOuvertureLitige,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';
import { MOTIFS_CLOTURE_LITIGE, MOTIFS_OUVERTURE_LITIGE } from '../../domain/evenement/charges';

export type MotifDuRefusLitige =
  | 'droit_absent'
  | 'motif_refuse'
  | 'decision_introuvable'
  | 'texte_efface'
  | 'deja_ouvert'
  | 'aucun_litige';

export class ErreurLitige extends Error {
  constructor(readonly motif: MotifDuRefusLitige) {
    super(`litige_decision_contrat : ${motif}`);
    this.name = 'ErreurLitige';
  }
}

/** L'acteur de la console, par son SEUL identifiant : son droit est relu en base. */
export interface ActeurDuLitige {
  readonly id: string;
}

type Tx = Prisma.TransactionClient;

/** Le droit de l'acteur, RELU en base : un rôle autorisé, actif, validé ; sinon refusé. */
async function exigerLeDroit(
  tx: Tx,
  acteur: ActeurDuLitige,
  droit: 'action:ouvrir_litige_decision' | 'action:clore_litige_decision'
): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(droit, lu.role)
  )
    throw new ErreurLitige('droit_absent');
}

/** La décision visée : son apporteur (l'agrégat de l'événement) et la présence de son texte. */
async function laDecision(
  tx: Tx,
  decisionId: string
): Promise<{ apporteurId: string; texte: boolean }> {
  const d = await tx.decisionDeContrat.findUnique({
    where: { id: decisionId },
    select: { apporteurId: true, texteChiffre: true },
  });
  if (d === null) throw new ErreurLitige('decision_introuvable');
  return { apporteurId: d.apporteurId, texte: d.texteChiffre !== null };
}

const litigeOuvert = (tx: Tx, decisionId: string) =>
  tx.litigeDecisionDeContrat.findFirst({
    where: { decisionId, closAt: null },
    select: { id: true },
  });

/** Ouvrir un litige sur une décision : la ligne OUVERTE et son événement. Rend l'id du litige. */
export async function ouvrirUnLitige(
  prisma: Pick<PrismaClient, '$transaction'>,
  d: {
    acteur: ActeurDuLitige;
    decisionId: string;
    motif: MotifOuvertureLitige;
    maintenant: Date;
  }
): Promise<{ litigeId: string }> {
  if (!(MOTIFS_OUVERTURE_LITIGE as readonly string[]).includes(d.motif))
    throw new ErreurLitige('motif_refuse');
  return prisma.$transaction(async (tx) => {
    await exigerLeDroit(tx, d.acteur, 'action:ouvrir_litige_decision');
    const decision = await laDecision(tx, d.decisionId);
    if (!decision.texte) throw new ErreurLitige('texte_efface');
    if ((await litigeOuvert(tx, d.decisionId)) !== null) throw new ErreurLitige('deja_ouvert');
    const litigeId = randomUUID();
    await tx.litigeDecisionDeContrat.create({
      data: {
        id: litigeId,
        decisionId: d.decisionId,
        motifOuverture: d.motif,
        ouvertParId: d.acteur.id,
      },
      select: { id: true },
    });
    await ajouterEvenement(tx, {
      type: 'decision_contrat_litige_modifie',
      agregat: 'apporteur',
      agregatId: decision.apporteurId,
      survenuAt: d.maintenant,
      charge: {
        geste: 'ouvrir',
        litigeId,
        decisionContratId: d.decisionId,
        motif: d.motif,
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
      },
    });
    return { litigeId };
  });
}

/** Clore le litige OUVERT d'une décision, une fois, et son événement. */
export async function cloreUnLitige(
  prisma: Pick<PrismaClient, '$transaction'>,
  d: {
    acteur: ActeurDuLitige;
    decisionId: string;
    motif: MotifClotureLitige;
    maintenant: Date;
  }
): Promise<{ litigeId: string; closAt: Date }> {
  if (!(MOTIFS_CLOTURE_LITIGE as readonly string[]).includes(d.motif))
    throw new ErreurLitige('motif_refuse');
  return prisma.$transaction(async (tx) => {
    await exigerLeDroit(tx, d.acteur, 'action:clore_litige_decision');
    const decision = await laDecision(tx, d.decisionId);
    const ouvert = await litigeOuvert(tx, d.decisionId);
    if (ouvert === null) throw new ErreurLitige('aucun_litige');
    // Sous condition : un litige clos entre-temps n'est ni réécrit, ni journalisé.
    const { count } = await tx.litigeDecisionDeContrat.updateMany({
      where: { id: ouvert.id, closAt: null },
      data: { motifCloture: d.motif, closAt: d.maintenant, closParId: d.acteur.id },
    });
    if (count !== 1) throw new ErreurLitige('aucun_litige');
    await ajouterEvenement(tx, {
      type: 'decision_contrat_litige_modifie',
      agregat: 'apporteur',
      agregatId: decision.apporteurId,
      survenuAt: d.maintenant,
      charge: {
        geste: 'clore',
        litigeId: ouvert.id,
        decisionContratId: d.decisionId,
        motif: d.motif,
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
      },
    });
    return { litigeId: ouvert.id, closAt: d.maintenant };
  });
}
