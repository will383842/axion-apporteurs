/**
 * DM-24 (REQ-DM-006, REQ-DM-042) — le passage de la confirmation tacite, sur le contrat v2, art. 3.2.
 *
 * QUAND : la règle pure (`src/domain/attribution/confirmation-tacite.ts`) ; ce module ne la recopie
 * pas. QUI : les attributions `provisoire` portées par un APPORTEUR — jamais par un conseiller
 * salarié (W19 : la matrice refuse `confirmee_tacitement` au conseiller). COMMENT : « tout ce qui
 * est dû à l'instant t » (REQ-QA-027), chaque attribution dans SA transaction ; la ligne est
 * verrouillée, ses faits RELUS, la règle rejugée, puis l'écrivain unique des transitions écrit l'état,
 * `confirmeeAt`, `fenetreFinAt` et l'événement `attribution_etat_modifie` dans la même transaction.
 *
 * Aucun régime de vérification ne retarde la confirmation (arbitrage #319 6035632726) : ce module ne
 * lit aucune raison de vérification. Une réponse, un rendez-vous, un échange ou un démenti font
 * quitter `provisoire` par leurs propres transitions : le passage ne promeut que ce qui y est encore.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  confirmationTaciteDue,
  type FaitsDeLaConfirmationTacite,
} from '../../domain/attribution/confirmation-tacite';
import type { EtatDemandeConfirmation } from '../../domain/confirmation/demande';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { SEUILS } from '../../domain/seuils/ssot';
import { confirmerUneAttribution } from '../attribution/transitionner';

type Tx = Prisma.TransactionClient;
type Confirmer = typeof confirmerUneAttribution;

/**
 * Les candidates lues par un passage : une lecture BORNÉE ; le passage suivant lit les suivantes, puisque
 * chaque confirmation sort sa ligne du filtre (une constante du module, comme le lot de DM-70).
 */
export const CONFIRMATIONS_PAR_PASSAGE = 500;

/**
 * La présélection : une attribution déposée depuis moins de `CONFIRMATION_TACITE_JOURS` jours n'a pas
 * pu échoir. Un jour de marge couvre le changement d'heure ; la règle juge chaque ligne au vrai.
 */
function bornePrealable(maintenant: Date): Date {
  return new Date(
    maintenant.getTime() - (SEUILS.CONFIRMATION_TACITE_JOURS.valeur - 1) * MS_PAR_JOUR
  );
}

/** Sous le verrou : l'état de la ligne et les faits de la règle, relus dans la transaction. */
async function relireSousLeVerrou(
  tx: Tx,
  attributionId: string
): Promise<{ statut: string; faits: FaitsDeLaConfirmationTacite } | null> {
  const [l] = await tx.$queryRaw<{ statut: string; deposee_at: Date }[]>`
    SELECT statut::text AS statut, deposee_at FROM attributions
    WHERE id = ${attributionId}::uuid FOR UPDATE`;
  if (!l) return null;
  const d = await tx.demandeConfirmation.findUnique({
    where: { attributionId },
    select: { etat: true, emissions: { select: { emiseAt: true, revoqueeAt: true } } },
  });
  return {
    statut: l.statut,
    faits: {
      deposeeAt: l.deposee_at.getTime(),
      etatDeLaDemande: (d?.etat ?? null) as EtatDemandeConfirmation | null,
      emissions: (d?.emissions ?? []).map((e) => ({
        emiseAt: e.emiseAt.getTime(),
        revoqueeAt: e.revoqueeAt === null ? null : e.revoqueeAt.getTime(),
      })),
    },
  };
}

export async function confirmerTacitementLesEchues(
  prisma: PrismaClient,
  maintenant: Date,
  p: { confirmer?: Confirmer } = {}
): Promise<{ confirmees: number; echecs: number }> {
  const confirmer = p.confirmer ?? confirmerUneAttribution;
  const candidates = await prisma.attribution.findMany({
    where: {
      statut: 'provisoire',
      apporteurId: { not: null },
      utilisateurConsoleId: null,
      deposeeAt: { lte: bornePrealable(maintenant) },
    },
    select: { id: true },
    orderBy: [{ deposeeAt: 'asc' }, { id: 'asc' }],
    take: CONFIRMATIONS_PAR_PASSAGE,
  });
  let confirmees = 0;
  let echecs = 0;
  for (const { id } of candidates) {
    // Un échec est COMPTÉ et n'arrête jamais les suivantes : une confirmation due et manquée serait un
    // droit de l'apporteur manqué (même règle que la levée de plein droit, sécurité, #794 6039195762).
    const fait = await prisma
      .$transaction(async (tx) => {
        const l = await relireSousLeVerrou(tx, id);
        if (l === null || l.statut !== 'provisoire') return false;
        if (!confirmationTaciteDue(l.faits, maintenant.getTime())) return false;
        await confirmer(tx, {
          attributionId: id,
          transition: 'confirmee_tacitement',
          acteur: { par: 'systeme' },
          maintenant,
          // L'existence d'une commande valable rattachée est portée par DM-15, pas encore livrée : une
          // attribution ne peut pas en porter avant elle (même convention que la qualification).
          commandeValableRattachee: false,
        });
        return true;
      })
      .catch(() => null);
    if (fait === null) echecs += 1;
    else if (fait) confirmees += 1;
  }
  return { confirmees, echecs };
}
