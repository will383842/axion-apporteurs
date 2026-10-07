/**
 * EXT-T07 (REQ-EXT-020 ; contrat v2, art. 3.4 al. 3 ; forme d'A02 #809 6039970008 ; juriste #809
 * 6039901134 et 6039962596 ; arbitrage #809 6039931639) — la prolongation de l'attribution, côté serveur.
 *
 * TROIS ÉCRITURES, chacune dans sa transaction, l'attribution VERROUILLÉE (`FOR UPDATE`) :
 *   — PROLONGER (console) : un administrateur, sous step-up, son droit RELU en base, choisit une des
 *     trois conditions FERMÉES. UNE écriture pose l'instant, la condition, l'auteur et la fin de fenêtre
 *     RECULÉE (la garde de la base l'exige ensemble) ; l'événement `attribution_prolongee` porte la
 *     condition, les deux termes et l'acteur ; l'Apporteur est informé (`attribution_prolongee`).
 *   — CONSTATER (console) : aucune condition n'est remplie. L'instant et l'auteur, ensemble ; la fin de
 *     fenêtre ne bouge pas ; l'événement `attribution_prolongation_refusee` ne porte que l'acteur.
 *     L'Apporteur n'en reçoit rien : l'attribution prend fin à son terme, comme le contrat le prévoit.
 *   — RÉPUTER PROLONGÉE (le passage au terme de DM-13, sous SON verrou) : sans décision au terme, la
 *     prolongation est acquise, la condition `reputee`, sans auteur ; même événement, même avis.
 * Une décision n'est ouverte que dans la liste (`refusDeLaDecision`) : déjà décidée, terme passé ou hors
 * liste, elle est refusée par un motif NOMMÉ, sans rien écrire. La base le tient aussi (garde de 005045).
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { ajouterEvenement } from '../evenement/journal';
import type { EtatAttribution } from '../../domain/attribution/machine';
import {
  estUneConditionDecidee,
  issueAuTerme,
  ouvertureDeLaDecision,
  refusDeLaDecision,
  termeProlonge,
  ETATS_A_TERME,
  type ConditionDecidee,
  type FaitsDeProlongation,
  type RefusDeLaDecision,
} from '../../domain/attribution/prolongation';

const DROIT = 'action:decider_prolongation';

/** Les deux issues d'une décision de la console : une condition, ou le constat. */
export type DecisionDeProlongation = ConditionDecidee | 'constater';

export type RefusDeProlongation =
  RefusDeLaDecision | 'droit_absent' | 'decision_invalide' | 'attribution_inconnue';

export class ErreurProlongation extends Error {
  constructor(readonly motif: RefusDeProlongation) {
    super(`prolongation : ${motif}`);
    this.name = 'ErreurProlongation';
  }
}

export interface ActeurDeLaDecision {
  readonly id: string;
  readonly role: ConsoleRole;
}

type Tx = Prisma.TransactionClient;

type LigneLue = {
  statut: EtatAttribution;
  apporteur_id: string | null;
  fenetre_fin_at: Date | null;
  prolongee_at: Date | null;
  prolongation_refusee_at: Date | null;
};

/** L'attribution, VERROUILLÉE ; `null` si elle n'existe pas. */
async function lireSousLeVerrou(tx: Tx, attributionId: string): Promise<LigneLue | null> {
  const [a] = await tx.$queryRaw<LigneLue[]>`
    SELECT statut::text AS statut, apporteur_id, fenetre_fin_at, prolongee_at, prolongation_refusee_at
    FROM attributions WHERE id = ${attributionId}::uuid FOR UPDATE`;
  return a ?? null;
}

const faitsDe = (a: LigneLue): FaitsDeProlongation => ({
  statut: a.statut,
  fenetreFinAt: a.fenetre_fin_at?.getTime() ?? null,
  prolongeeAt: a.prolongee_at?.getTime() ?? null,
  prolongationRefuseeAt: a.prolongation_refusee_at?.getTime() ?? null,
});

/** Le droit de l'acteur, RELU en base : admin actif et validé ; sinon refusé. */
async function exigerUnAdministrateurValide(tx: Tx, acteur: ActeurDeLaDecision): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(DROIT, lu.role)
  )
    throw new ErreurProlongation('droit_absent');
}

/** La prolongation écrite, décidée ou réputée : la ligne, l'événement et l'avis à l'Apporteur. */
async function ecrireLaProlongation(
  tx: Tx,
  attributionId: string,
  a: LigneLue & { fenetre_fin_at: Date },
  o: {
    condition: ConditionDecidee | 'reputee';
    acteur: { par: 'utilisateur_console'; id: string } | { par: 'systeme' };
    maintenant: Date;
  }
): Promise<Date> {
  const finApres = new Date(termeProlonge(a.fenetre_fin_at.getTime()));
  // UNE écriture : l'instant, la condition, l'auteur et la fin reculée ensemble (garde de 005045).
  await tx.attribution.update({
    where: { id: attributionId },
    data: {
      prolongeeAt: o.maintenant,
      prolongationCondition: o.condition,
      prolongeeParId: o.acteur.par === 'systeme' ? null : o.acteur.id,
      fenetreFinAt: finApres,
    },
  });
  const inscrit = await ajouterEvenement(tx, {
    type: 'attribution_prolongee',
    agregat: 'attribution',
    agregatId: attributionId,
    survenuAt: o.maintenant,
    charge: {
      condition: o.condition,
      finAvant: a.fenetre_fin_at.toISOString(),
      finApres: finApres.toISOString(),
      acteur: o.acteur,
    },
  });
  // L'art. 3.4 al. 3 : « L'Apporteur est informé de la prolongation ». Un conseiller n'a pas d'espace.
  if (a.apporteur_id !== null) {
    await tx.notificationEspace.create({
      data: {
        apporteurId: a.apporteur_id,
        cle: 'attribution_prolongee',
        attributionId,
        evenementId: BigInt(inscrit.id),
      },
    });
  }
  return finApres;
}

/**
 * La décision de la console : prolonger sur une condition, ou constater qu'aucune n'est remplie. Rend
 * le terme désormais : reculé par la prolongation, inchangé par le constat.
 */
export async function deciderDeLaProlongation(
  prisma: PrismaClient,
  d: { acteur: ActeurDeLaDecision; attributionId: string; decision: unknown; maintenant: Date }
): Promise<{ termeAt: Date }> {
  if (!roleAutorise(DROIT, d.acteur.role)) throw new ErreurProlongation('droit_absent');
  const decision = d.decision;
  if (decision !== 'constater' && !estUneConditionDecidee(decision))
    throw new ErreurProlongation('decision_invalide');
  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur);
    const a = await lireSousLeVerrou(tx, d.attributionId);
    if (a === null) throw new ErreurProlongation('attribution_inconnue');
    const refus = refusDeLaDecision(faitsDe(a), d.maintenant.getTime());
    if (refus !== null) throw new ErreurProlongation(refus);
    // Ouverte, la décision suppose un terme : `refusDeLaDecision` rend `sans_objet` sans lui.
    const fin = a.fenetre_fin_at as Date;
    const acteur = { par: 'utilisateur_console' as const, id: d.acteur.id };
    if (decision === 'constater') {
      await tx.attribution.update({
        where: { id: d.attributionId },
        data: { prolongationRefuseeAt: d.maintenant, prolongationRefuseeParId: d.acteur.id },
      });
      await ajouterEvenement(tx, {
        type: 'attribution_prolongation_refusee',
        agregat: 'attribution',
        agregatId: d.attributionId,
        survenuAt: d.maintenant,
        charge: { acteur },
      });
      return { termeAt: fin };
    }
    const termeAt = await ecrireLaProlongation(
      tx,
      d.attributionId,
      { ...a, fenetre_fin_at: fin },
      { condition: decision, acteur, maintenant: d.maintenant }
    );
    return { termeAt };
  });
}

/**
 * Le passage au terme (DM-13), dans SA transaction, l'attribution verrouillée par lui : sans décision
 * au terme, la prolongation est RÉPUTÉE (juriste : la Société ne peut pas opposer à l'Apporteur son
 * propre défaut de décision). Relu ici, le verrou repris ne coûte rien ; si l'issue n'est plus
 * `reputer_prolongee`, rien n'est écrit et `null` est rendu.
 */
export async function reputerProlongee(
  tx: Tx,
  attributionId: string,
  maintenant: Date
): Promise<{ termeAt: Date } | null> {
  const a = await lireSousLeVerrou(tx, attributionId);
  if (a === null || a.fenetre_fin_at === null || !ETATS_A_TERME.includes(a.statut)) return null;
  if (issueAuTerme(faitsDe(a), maintenant.getTime()) !== 'reputer_prolongee') return null;
  const termeAt = await ecrireLaProlongation(
    tx,
    attributionId,
    { ...a, fenetre_fin_at: a.fenetre_fin_at },
    { condition: 'reputee', acteur: { par: 'systeme' }, maintenant }
  );
  return { termeAt };
}

// ── la lecture de l'écran ────────────────────────────────────────────────────────────────────────

/** La liste est BORNÉE : les termes les plus proches d'abord, jamais tout le stock d'un coup. */
export const LIGNES_DE_LA_LISTE_MAX = 100;

/** Une attribution telle que la liste la montre : l'entreprise et son terme ; ni porteur, ni faits. */
export type ProlongationADecider = {
  readonly id: string;
  readonly raisonSociale: string | null;
  readonly siren: string;
  readonly termeAt: Date;
};

/** Les attributions dont la décision est OUVERTE à cet instant (même règle que `refusDeLaDecision`). */
export async function listerLesProlongationsADecider(
  prisma: Pick<PrismaClient, 'attribution'>,
  maintenant: Date
): Promise<ProlongationADecider[]> {
  const m = maintenant.getTime();
  const lignes = await prisma.attribution.findMany({
    where: {
      statut: { in: [...ETATS_A_TERME] },
      prolongeeAt: null,
      prolongationRefuseeAt: null,
      // Le terme dans la fenêtre de la liste : après maintenant, au plus l'avance de la SSOT.
      fenetreFinAt: { gt: maintenant },
    },
    select: { id: true, raisonSociale: true, siren: true, fenetreFinAt: true },
    orderBy: [{ fenetreFinAt: 'asc' }, { id: 'asc' }],
    take: LIGNES_DE_LA_LISTE_MAX,
  });
  return lignes
    .filter(
      (l): l is typeof l & { fenetreFinAt: Date } =>
        l.fenetreFinAt !== null && ouvertureDeLaDecision(l.fenetreFinAt.getTime()) <= m
    )
    .map((l) => ({
      id: l.id,
      raisonSociale: l.raisonSociale,
      siren: l.siren,
      termeAt: l.fenetreFinAt,
    }));
}
