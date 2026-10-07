/**
 * DM-13 (REQ-DM-004, REQ-DM-006, REQ-DM-007, REQ-QA-027) — le passage des échéances d'attribution,
 * sur le contrat v2 : « tout ce qui est dû à l'instant t », chaque attribution dans SA transaction.
 *
 * QUAND : la règle pure (`src/domain/attribution/echeances.ts`), ÉCHECS FERMÉS compris ; ce module ne
 * la recopie pas. La ligne est verrouillée, ses faits relus, la règle rejugée ; l'écrivain unique des
 * transitions écrit l'état, les dates et l'événement, et libère la file s'il y a lieu (DM-55).
 *
 * CE QUI EST PRÉSÉLECTIONNÉ : ce qui peut s'exécuter, et rien d'autre.
 *   — la fin faute d'adresse valide (art. 3.2) : une attribution d'apporteur provisoire dont la
 *     demande est en erreur ; sa demande passe `expiree` dans la même transaction ;
 *   — la file d'attente (art. 3.5) : le délai de redéclaration écoulé, ou l'extinction à douze mois ;
 *   — la péremption d'une PRISE EN CHARGE (art. 3.5), qui n'a pas d'exception « imputable ».
 * L'expiration à 6 mois et la péremption d'un apporteur, en échec fermé, ne sont pas lues : elles
 * restent dues et s'exécuteront avec la prolongation (art. 3.4 al. 3) et le fait « absence d'échange
 * imputable à la Société » (art. 3.4 al. 2).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  executableAujourdHui,
  transitionEchue,
  type TransitionEchue,
} from '../../domain/attribution/echeances';
import type { EtatAttribution } from '../../domain/attribution/machine';
import type { EtatDemandeConfirmation } from '../../domain/confirmation/demande';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { SEUILS } from '../../domain/seuils/ssot';
import { transitionnerUneAttribution } from '../attribution/transitionner';
import { expirerLaDemandeDe } from '../confirmation/demandes';

type Tx = Prisma.TransactionClient;

/** Les jours d'une année civile au plus court : la présélection de l'extinction à douze mois. */
const JOURS_D_UNE_ANNEE_AU_PLUS_COURT = 365;

/** Une borne de présélection, un jour plus tôt que l'échéance au plus tôt (le changement d'heure). */
const ilYA = (maintenant: Date, jours: number) =>
  new Date(maintenant.getTime() - (jours - 1) * MS_PAR_JOUR);

type LigneVerrouillee = {
  statut: EtatAttribution;
  apporteur_id: string | null;
  deposee_at: Date;
  peremption_at: Date | null;
  fenetre_fin_at: Date | null;
  fenetre_redeclaration_fin_at: Date | null;
};

const instant = (d: Date | null) => (d === null ? null : d.getTime());

/** Sous le verrou : la transition due ET exécutable, ou rien. */
async function rejugerSousLeVerrou(
  tx: Tx,
  attributionId: string,
  maintenant: Date
): Promise<TransitionEchue | null> {
  const [l] = await tx.$queryRaw<LigneVerrouillee[]>`
    SELECT statut::text AS statut, apporteur_id::text AS apporteur_id, deposee_at, peremption_at,
           fenetre_fin_at, fenetre_redeclaration_fin_at
    FROM attributions WHERE id = ${attributionId}::uuid FOR UPDATE`;
  if (!l) return null;
  const d = await tx.demandeConfirmation.findUnique({
    where: { attributionId },
    select: { etat: true },
  });
  const porteur = l.apporteur_id === null ? 'conseiller' : 'apporteur';
  const due = transitionEchue(
    {
      statut: l.statut,
      porteur,
      deposeeAt: l.deposee_at.getTime(),
      // Le fait « imputable à la Société » ne se pose pas encore : la péremption d'un apporteur est
      // en échec fermé (`executableAujourdHui`), ce champ ne décide donc de rien aujourd'hui.
      peremptionSuspendue: false,
      etatDeLaDemande: (d?.etat ?? null) as EtatDemandeConfirmation | null,
      peremptionAt: instant(l.peremption_at),
      fenetreFinAt: instant(l.fenetre_fin_at),
      fenetreRedeclarationFinAt: instant(l.fenetre_redeclaration_fin_at),
    },
    maintenant.getTime()
  );
  return due !== null && executableAujourdHui(due, porteur) ? due : null;
}

export async function appliquerLesEcheances(
  prisma: PrismaClient,
  maintenant: Date,
  p: {
    transitionner?: typeof transitionnerUneAttribution;
    expirerLaDemande?: typeof expirerLaDemandeDe;
  } = {}
): Promise<{ appliquees: number }> {
  const transitionner = p.transitionner ?? transitionnerUneAttribution;
  const expirerLaDemande = p.expirerLaDemande ?? expirerLaDemandeDe;
  const candidates = await prisma.attribution.findMany({
    where: {
      OR: [
        {
          statut: 'provisoire',
          apporteurId: { not: null },
          deposeeAt: { lte: ilYA(maintenant, SEUILS.LIBERATION_SIGNALEE_JOURS.valeur) },
          demandeConfirmation: { is: { etat: 'rebond' } },
        },
        {
          statut: 'en_attente',
          OR: [
            { fenetreRedeclarationFinAt: { lte: maintenant } },
            { deposeeAt: { lte: ilYA(maintenant, JOURS_D_UNE_ANNEE_AU_PLUS_COURT) } },
          ],
        },
        {
          statut: 'active',
          apporteurId: null,
          deposeeAt: { lte: ilYA(maintenant, SEUILS.PEREMPTION_JOURS.valeur) },
        },
      ],
    },
    select: { id: true },
    orderBy: [{ deposeeAt: 'asc' }, { id: 'asc' }],
  });
  let appliquees = 0;
  for (const { id } of candidates) {
    const fait = await prisma.$transaction(async (tx) => {
      const transition = await rejugerSousLeVerrou(tx, id, maintenant);
      if (transition === null) return false;
      await transitionner(tx, {
        attributionId: id,
        transition,
        acteur: { par: 'systeme' },
        maintenant,
      });
      if (transition === 'fin_sans_adresse_valide') await expirerLaDemande(tx, id, maintenant);
      return true;
    });
    if (fait) appliquees += 1;
  }
  return { appliquees };
}
