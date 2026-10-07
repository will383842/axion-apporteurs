/**
 * UX-P1-61 (REQ-DM-007 ; contrat v2, art. 3.4 al. 2 ; juriste #319 6037008645 et #803 6039744045 ; forme
 * d'A02 #803 6039776225) — le geste administrateur « absence d'échange imputable à la Société ».
 *
 * Un administrateur pose, sur une attribution, le fait que l'absence de rendez-vous, de devis et de
 * commande TIENT à la Société, avec un motif FERMÉ (`MOTIFS_SUSPENSION_PEREMPTION`), sans texte libre. La
 * péremption faute d'échange le lit pour NE PAS expirer : l'attribution va à son seul terme.
 *
 * LE GESTE :
 *   — le droit (`action:poser_absence_imputable`, l'admin seul, sous step-up) est jugé AVANT tout travail,
 *     puis RELU dans la transaction (admin actif et validé) ;
 *   — le motif est jugé contre la liste fermée AVANT la transaction : un motif hors liste n'écrit rien ;
 *   — le SIREN puis l'attribution sont VERROUILLÉS (le verrou du dépôt, puis `FOR UPDATE`) ; le fait se
 *     pose UNE fois (`deja_pose`) ;
 *   — UNE écriture pose l'instant, l'auteur et le motif ENSEMBLE (CHECK de 005030), et annule
 *     `peremptionAt` : la péremption ne frappe plus ; le terme (`fenetreFinAt`) n'est pas recalculé ;
 *   — l'événement `attribution_peremption_suspendue` porte l'acteur, l'instant et le motif.
 *
 * LE RÉTABLISSEMENT (juriste, 6039744045, point 3 ; A02, 6039776225) : sur une attribution `perimee`
 * FAUTE D'ÉCHANGE (sa dernière transition est `perimee`), poser le fait la RÉTABLIT vers `active`,
 * jusqu'à son terme, dans la même transaction :
 *   — le terme est déjà passé : `terme_depasse`, rien n'est écrit ;
 *   — un AUTRE APPORTEUR occupe le SIREN : `entreprise_reprise`, rien n'est écrit, sans éviction ;
 *   — une prise en charge de la SOCIÉTÉ l'occupe : elle CÈDE d'abord (`cedee_au_retablissement`, vers
 *     `annulee`, avec l'exception `retablissement_apporteur` et l'administrateur pour auteur), puis
 *     l'attribution de l'apporteur est rétablie ; l'index d'unicité de l'occupant reste tenu ;
 *   — l'apporteur est informé (`attribution_retablie`), par le MÊME avis, qu'il y ait eu cession ou non :
 *     il ne dit rien de l'occupant (juriste).
 * Toute autre attribution (ni en cours, ni périmée faute d'échange) : `sans_objet`.
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { roleAutorise } from '../roles/matrice';
import { ajouterEvenement } from '../evenement/journal';
import { transitionnerUneAttribution } from './transitionner';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import {
  MOTIFS_SUSPENSION_PEREMPTION,
  type MotifSuspensionPeremption,
} from '../../domain/attribution/machine';

const DROIT = 'action:poser_absence_imputable';

export type RefusDeLAbsenceImputable =
  | 'droit_absent'
  | 'motif_invalide'
  | 'attribution_inconnue'
  | 'deja_pose'
  | 'sans_objet'
  | 'terme_depasse'
  | 'entreprise_reprise';

export class ErreurAbsenceImputable extends Error {
  constructor(readonly motif: RefusDeLAbsenceImputable) {
    super(`absence_imputable : ${motif}`);
    this.name = 'ErreurAbsenceImputable';
  }
}

export interface ActeurDuGeste {
  readonly id: string;
  readonly role: ConsoleRole;
}

type Tx = Prisma.TransactionClient;

/** Le droit de l'acteur, RELU en base : admin actif et validé ; sinon refusé. */
async function exigerUnAdministrateurValide(tx: Tx, acteur: ActeurDuGeste): Promise<void> {
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
    throw new ErreurAbsenceImputable('droit_absent');
}

const estUnMotif = (m: unknown): m is MotifSuspensionPeremption =>
  (MOTIFS_SUSPENSION_PEREMPTION as readonly unknown[]).includes(m);

type LigneLue = {
  statut: string;
  siren: string;
  suspendue: boolean;
  fenetre_fin_at: Date | null;
  derniere_charge: unknown;
};

/**
 * L'attribution, verrouillée, et la charge du DERNIER `attribution_etat_modifie` qui l'a menée là, lue
 * au journal (ajout seul, source durable ; A02 #803) : elle seule distingue la péremption faute
 * d'échange de `liberee_sans_confirmation`, qui arrive aussi en `perimee`.
 */
async function lireSousLeVerrou(tx: Tx, attributionId: string): Promise<LigneLue | undefined> {
  const [a] = await tx.$queryRaw<LigneLue[]>`
    SELECT a.statut::text AS statut, a.siren, (a.peremption_suspendue_at IS NOT NULL) AS suspendue,
           a.fenetre_fin_at,
           (SELECT e.charge FROM evenements e
             WHERE e.type = 'attribution_etat_modifie' AND e.agregat = 'attribution'
               AND e.agregat_id = a.id
             ORDER BY e.survenu_at DESC, e.id DESC LIMIT 1) AS derniere_charge
    FROM attributions a WHERE a.id = ${attributionId}::uuid FOR UPDATE`;
  return a;
}

/** L'occupant du SIREN, s'il y en a un autre : un apporteur, ou une prise en charge de la Société. */
async function occupantDuSiren(
  tx: Tx,
  siren: string,
  attributionId: string
): Promise<{ id: string; deLaSociete: boolean } | null> {
  const [o] = await tx.$queryRaw<{ id: string; de_la_societe: boolean }[]>`
    SELECT id, (utilisateur_console_id IS NOT NULL) AS de_la_societe
    FROM attributions
    WHERE siren = ${siren} AND id <> ${attributionId}::uuid
      AND statut::text = ANY(${[...ETATS_OCCUPANTS]}::text[])
    FOR UPDATE`;
  return o === undefined ? null : { id: o.id, deLaSociete: o.de_la_societe };
}

/**
 * Pose le fait ; sur une attribution périmée faute d'échange, la rétablit. Rend le terme que
 * l'attribution atteindra désormais (lu, jamais recalculé) et si elle a été rétablie.
 */
export async function poserLAbsenceImputable(
  prisma: PrismaClient,
  d: { acteur: ActeurDuGeste; attributionId: string; motif: unknown; maintenant: Date }
): Promise<{ termeAt: Date | null; retablie: boolean }> {
  if (!roleAutorise(DROIT, d.acteur.role)) throw new ErreurAbsenceImputable('droit_absent');
  if (!estUnMotif(d.motif)) throw new ErreurAbsenceImputable('motif_invalide');
  const motif = d.motif;
  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur);
    const [{ siren } = { siren: null }] = await tx.$queryRaw<{ siren: string }[]>`
      SELECT siren FROM attributions WHERE id = ${d.attributionId}::uuid`;
    if (siren === null) throw new ErreurAbsenceImputable('attribution_inconnue');
    // Le verrou du SIREN, celui du dépôt : rien ne s'y dépose pendant le rétablissement.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`verrou-du-depot.siren.${siren}`}, 0))`;
    const a = await lireSousLeVerrou(tx, d.attributionId);
    if (a === undefined) throw new ErreurAbsenceImputable('attribution_inconnue');
    if (a.suspendue) throw new ErreurAbsenceImputable('deja_pose');
    // Une charge illisible ne rétablit jamais : l'attribution est alors sans objet (échec fermé).
    const derniere = CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse(a.derniere_charge);
    const retablir =
      a.statut === 'perimee' && derniere.success && derniere.data.transition === 'perimee';
    if (a.statut !== 'active' && !retablir) throw new ErreurAbsenceImputable('sans_objet');
    if (retablir) {
      if (a.fenetre_fin_at === null || a.fenetre_fin_at <= d.maintenant)
        throw new ErreurAbsenceImputable('terme_depasse');
      const occupant = await occupantDuSiren(tx, a.siren, d.attributionId);
      if (occupant !== null && !occupant.deLaSociete)
        throw new ErreurAbsenceImputable('entreprise_reprise');
      if (occupant !== null) {
        // La prise en charge de la Société cède, avec l'exception et l'administrateur pour auteur.
        await transitionnerUneAttribution(tx, {
          attributionId: occupant.id,
          transition: 'cedee_au_retablissement',
          acteur: { par: 'utilisateur_console', id: d.acteur.id },
          maintenant: d.maintenant,
        });
      }
    }
    await tx.attribution.update({
      where: { id: d.attributionId },
      data: {
        peremptionSuspendueAt: d.maintenant,
        peremptionSuspendueParId: d.acteur.id,
        peremptionSuspendueMotif: motif,
        peremptionAt: null,
        // Rétablie, l'attribution n'est plus libérée : la purge de son contact, programmée à la
        // péremption, est retirée (A02 en juge la forme).
        ...(retablir ? { purgeContactAt: null } : {}),
      },
    });
    await ajouterEvenement(tx, {
      type: 'attribution_peremption_suspendue',
      agregat: 'attribution',
      agregatId: d.attributionId,
      survenuAt: d.maintenant,
      charge: {
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
        suspendueAt: d.maintenant.toISOString(),
        motif,
      },
    });
    if (retablir) {
      // La suspension est posée d'abord : la transition ne rouvre donc aucune péremption.
      await transitionnerUneAttribution(tx, {
        attributionId: d.attributionId,
        transition: 'retablie_absence_imputable',
        acteur: { par: 'utilisateur_console', id: d.acteur.id },
        maintenant: d.maintenant,
      });
    }
    return { termeAt: a.fenetre_fin_at, retablie: retablir };
  });
}
