/**
 * La purge planifiée du texte des décisions de contrat (DM-70, REQ-JUR-029 ; règle de la juriste,
 * #703, 5982101876, et ses deux corrections, #766, 5988086461) — un passage du lanceur.
 *
 * Le texte chiffré des faits d'une mise en demeure, ou du motif d'une résiliation, est gardé
 * `DECISION_CONTRAT_TEXTE_CONSERVATION_ANS` ans (code civil art. 2224) depuis son POINT DE DÉPART :
 *   - une résiliation : sa `date_effet` ;
 *   - une mise en demeure : la `date_effet` de la première résiliation OPPOSABLE du même apporteur
 *     créée à son jour ou après ; à défaut, le jour civil de Paris de son `cree_at`.
 * L'échéance est le départ plus ces années, en jours civils de Paris (un 29 février donne le 28).
 *
 * LES CORRECTIONS DE LA JURISTE (#766, 5988086461), TELLES QUELLES :
 * (1) Seule une résiliation OPPOSABLE déplace le point de départ d'une mise en demeure : une
 * décision de résiliation caduque (SEC-66, forme (b) : courriel en échec ou envoi refusé) ne
 * compte pas, et la mise en demeure garde alors le jour civil de Paris de son cree_at. (2) La
 * purge a lieu au plus tôt le LENDEMAIN du jour de l'échéance, heure de Paris : le jour
 * anniversaire appartient encore au délai de cinq ans (code civil art. 2229, la prescription n'est
 * acquise que lorsque le dernier jour du terme est accompli) ; la veille et le jour même, rien.
 *
 * LA LECTURE PAR `decisionContratId` (SEC-66, #781 ; source publiée sur #766, 6033957822). Sont
 * opposables, pour le départ d'une mise en demeure : la coupure immédiate de SEC-19 (un fait
 * `apporteur_statut_modifie`, opposable par construction), et la résiliation notifiée de SEC-66 (un fait
 * `apporteur_resiliation_notifiee`) QUE CITE un passage à `resilie` par `decisionContratId`, l'UUID de
 * sa ligne : la trace DURABLE de l'opposabilité que A02 a posée au journal (#561, 5988205180). Une
 * résiliation notifiée que nul passage ne cite est CADUQUE : elle ne compte pas, et la mise en demeure
 * garde son `cree_at`. La caducité ne se lit donc plus sur la notification ni sur son courriel,
 * supprimés à douze mois : le journal ne se purge jamais, et la limite nommée de DM-70 tombe. Toute
 * autre décision ne compte pas. Aucune purge ne peut survenir avant cinq ans.
 *
 * L'écriture est celle qu'admet la garde dédiée de SEC-19 : le texte ET `faits_empreinte` vidés,
 * `texte_purge_at` posé, dans la même instruction, une fois. La ligne nue (geste, article, dates,
 * événement) reste, et `rendreUneDecisionDeContrat` refuse ensuite de rendre le texte. Une résiliation
 * sans texte n'est jamais prise. Le gel pendant un litige (code civil art. 2241) relève de JUR-T64.
 *
 * Par lots bornés, en avançant sur l'identifiant : un texte gardé n'est pas relu dans le passage.
 * Idempotente : un texte purgé n'est plus sélectionné.
 */
import type { GesteDecisionContrat, PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { lireLaChargeDUnFait, passageQuiCiteLaDecision } from '../evenement/journal';
import { versParis } from '../../domain/temps/paris';
import { MS_PAR_JOUR, joursDeLaDate, type DateCivile } from '../../domain/temps/calendrier-civil';

/** La taille d'un lot : une lecture bornée, relancée jusqu'à épuisement. */
export const LOT_DE_PURGE_DES_DECISIONS = 500;

/**
 * La marge de la présélection : un départ n'est jamais antérieur au jour de Paris de la création de
 * sa ligne, qui peut être le lendemain de son jour UTC. Deux jours couvrent ce décalage ; le juge
 * exact est `texteEchu`.
 */
const MARGE_DE_PRESELECTION_JOURS = 2;

type Decision = {
  geste: GesteDecisionContrat;
  dateEffet: Date | null;
  creeAt: Date;
};

/** Une ligne du lot : ce que la purge en lit, rien d'autre. */
type Candidate = Decision & { id: string; apporteurId: string };

/** Une colonne DATE, telle que Prisma la rend (minuit UTC du jour civil). */
const dateCivileDe = (d: Date): DateCivile => ({
  annee: d.getUTCFullYear(),
  mois: d.getUTCMonth() + 1,
  jour: d.getUTCDate(),
});

/** Le jour civil de Paris d'un instant. */
function jourDeParis(instant: Date): DateCivile {
  const { annee, mois, jour } = versParis(instant.getTime());
  return { annee, mois, jour };
}

/**
 * Le point de départ du texte, ou `null` s'il ne se lit pas (une résiliation sans `date_effet`, que
 * le CHECK interdit) : sans départ, le texte est GARDÉ (échec fermé).
 */
export function departDuTexte(
  d: Decision,
  resiliationSuivante: { dateEffet: Date | null } | null
): DateCivile | null {
  switch (d.geste) {
    case 'resiliation':
      return d.dateEffet === null ? null : dateCivileDe(d.dateEffet);
    case 'mise_en_demeure':
      if (resiliationSuivante !== null) {
        return resiliationSuivante.dateEffet === null
          ? null
          : dateCivileDe(resiliationSuivante.dateEffet);
      }
      return jourDeParis(d.creeAt);
    case 'suspension':
      // SEC-15 (A02, #794 6036131730, point 4) : une suspension n'a pas de départ tant que sa règle
      // (la première levée après la pose, sinon la fin du contrat ; juriste, 6036161128) n'est pas
      // lue au journal. Sans départ, le texte est GARDÉ (échec fermé), jamais purgé par défaut.
      return null;
    default: {
      // Un geste FUTUR ne tombe dans aucun cas par défaut : le compilateur le refuse ici.
      const inconnu: never = d.geste;
      throw new Error(`geste_inconnu : ${String(inconnu)}`);
    }
  }
}

/** L'échéance : le départ plus la durée, en années civiles ; un jour absent devient le dernier du mois. */
export function echeanceDuTexte(depart: DateCivile): DateCivile {
  const annee = depart.annee + SEUILS.DECISION_CONTRAT_TEXTE_CONSERVATION_ANS.valeur;
  const premierDuMoisSuivant =
    depart.mois === 12
      ? { annee: annee + 1, mois: 1, jour: 1 }
      : { annee, mois: depart.mois + 1, jour: 1 };
  const dernier =
    joursDeLaDate(premierDuMoisSuivant) - joursDeLaDate({ annee, mois: depart.mois, jour: 1 });
  return { annee, mois: depart.mois, jour: Math.min(depart.jour, dernier) };
}

/** Échu au plus tôt le LENDEMAIN de l'échéance, heure de Paris : le jour anniversaire est du délai. */
export function texteEchu(depart: DateCivile | null, maintenant: Date): boolean {
  if (depart === null) return false;
  return joursDeLaDate(jourDeParis(maintenant)) > joursDeLaDate(echeanceDuTexte(depart));
}

/** La présélection : une ligne créée après cette borne n'a pas encore pu échoir. */
function bornePrealable(maintenant: Date): Date {
  const borne = new Date(maintenant.getTime() + MARGE_DE_PRESELECTION_JOURS * MS_PAR_JOUR);
  borne.setUTCFullYear(
    borne.getUTCFullYear() - SEUILS.DECISION_CONTRAT_TEXTE_CONSERVATION_ANS.valeur
  );
  return borne;
}

export async function purgerLesTextesDesDecisions(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ textesPurges: number }> {
  const aPurger = {
    textePurgeAt: null,
    NOT: { texteChiffre: null },
    creeAt: { lte: bornePrealable(maintenant) },
  };
  let textesPurges = 0;
  let apres: string | null = null;
  for (;;) {
    const lot: Candidate[] = await prisma.decisionDeContrat.findMany({
      where: apres === null ? aPurger : { ...aPurger, id: { gt: apres } },
      select: { id: true, apporteurId: true, geste: true, dateEffet: true, creeAt: true },
      orderBy: { id: 'asc' },
      take: LOT_DE_PURGE_DES_DECISIONS,
    });
    if (lot.length === 0) return { textesPurges };
    apres = lot[lot.length - 1]!.id;

    const apporteursMisEnDemeure = [
      ...new Set(lot.filter((d) => d.geste === 'mise_en_demeure').map((d) => d.apporteurId)),
    ];
    const toutes =
      apporteursMisEnDemeure.length === 0
        ? []
        : await prisma.decisionDeContrat.findMany({
            where: { apporteurId: { in: apporteursMisEnDemeure }, geste: 'resiliation' },
            select: {
              id: true,
              apporteurId: true,
              dateEffet: true,
              creeAt: true,
              evenementId: true,
            },
            orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
          });
    // Seule une résiliation OPPOSABLE compte (en tête). Le type de son fait se lit par `evenementId`, au
    // module du journal : la relation vers le journal n'est jamais employée par le code (condition
    // d'A02). La notifiée de SEC-66 n'est opposable que si un passage à `resilie` la cite.
    const resiliations: typeof toutes = [];
    for (const r of toutes) {
      const fait = await lireLaChargeDUnFait(prisma, r.evenementId.toString());
      if (
        fait?.type === 'apporteur_statut_modifie' ||
        (fait?.type === 'apporteur_resiliation_notifiee' &&
          (await passageQuiCiteLaDecision(prisma, r.apporteurId, r.id)) !== null)
      ) {
        resiliations.push(r);
      }
    }

    const echus = lot
      .filter((d) => {
        const suivante =
          d.geste === 'mise_en_demeure'
            ? (resiliations.find(
                (r) =>
                  r.apporteurId === d.apporteurId &&
                  joursDeLaDate(jourDeParis(r.creeAt)) >= joursDeLaDate(jourDeParis(d.creeAt))
              ) ?? null)
            : null;
        return texteEchu(departDuTexte(d, suivante), maintenant);
      })
      .map((d) => d.id);
    if (echus.length > 0) {
      const { count } = await prisma.decisionDeContrat.updateMany({
        where: { id: { in: echus }, textePurgeAt: null, NOT: { texteChiffre: null } },
        data: { texteChiffre: null, faitsEmpreinte: null, textePurgeAt: maintenant },
      });
      textesPurges += count;
    }
    if (lot.length < LOT_DE_PURGE_DES_DECISIONS) return { textesPurges };
  }
}
