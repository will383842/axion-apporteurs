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
 * LIMITE NOMMÉE (arbitrage de la coordination, source publiée sur #766, commentaire 6033957822) :
 * seule compte, pour le départ d'une mise en demeure, une résiliation fondée sur
 * `apporteur_statut_modifie` — la coupure immédiate de SEC-19, opposable par construction. Toute
 * autre décision, dont la résiliation notifiée avec préavis de SEC-66, laisse la mise en demeure à
 * son `cree_at`, comme une décision caduque. La caducité de SEC-66 se dérivait de la notification et
 * de son courriel, que DM-61 supprime au bout de douze mois. A02 a depuis posé une trace DURABLE,
 * `decisionContratId` (#561, 5988205180) : sa lecture est portée par SEC-66, qui fusionne en second
 * (source 6033957822). Aucune purge ne peut survenir avant cinq ans.
 *
 * L'écriture est celle qu'admet la garde dédiée de SEC-19 : le texte ET `faits_empreinte` vidés,
 * `texte_purge_at` posé, dans la même instruction, une fois. La ligne nue (geste, article, dates,
 * événement) reste, et `rendreUneDecisionDeContrat` refuse ensuite de rendre le texte. Une résiliation
 * sans texte n'est jamais prise.
 *
 * JUR-T64, LE GEL POUR LITIGE (code civil art. 2241 et 2231 ; juriste, #703 6041829569 ; forme d'A02,
 * #703 6041868006) : tant qu'un litige est OUVERT sur une décision, son texte n'est JAMAIS purgé — le
 * passage la saute en requête, à la lecture comme à l'écriture, et le filet de la base
 * (`decisions_de_contrat_gel_litige`) ferme le contournement. À la clôture, le départ devient le PLUS
 * TARDIF du départ ordinaire et du jour civil de Paris de la DERNIÈRE clôture ; l'échéance reste celle
 * ci-dessous.
 *
 * Par lots bornés, en avançant sur l'identifiant : un texte gardé n'est pas relu dans le passage.
 * Idempotente : un texte purgé n'est plus sélectionné.
 */
import type { GesteDecisionContrat, PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { lireLaChargeDUnFait } from '../evenement/journal';
import { creerJournal, type Journal } from '../../lib/logger';
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

/** Une ligne du lot : ce que la purge en lit, rien d'autre (JUR-T64 : sa DERNIÈRE clôture de litige). */
type Candidate = Decision & {
  id: string;
  apporteurId: string;
  litiges: { closAt: Date | null }[];
};

/** JUR-T64 : aucun litige OUVERT sur la décision. */
const SANS_LITIGE_OUVERT = { litiges: { none: { closAt: null } } } as const;

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

/**
 * JUR-T64 (art. 2231) : après la clôture d'un litige, le départ est le PLUS TARDIF du départ ordinaire et
 * du jour civil de Paris de la DERNIÈRE clôture. Un départ illisible reste illisible (texte gardé).
 */
export function departApresLesLitiges(
  departOrdinaire: DateCivile | null,
  derniereClotureAt: Date | null
): DateCivile | null {
  if (departOrdinaire === null || derniereClotureAt === null) return departOrdinaire;
  const cloture = jourDeParis(derniereClotureAt);
  return joursDeLaDate(cloture) > joursDeLaDate(departOrdinaire) ? cloture : departOrdinaire;
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

/**
 * JUR-T64 — l'alerte d'exploitation (juriste, #703 6042136542 ; condition de la sécurité) : un litige
 * OUVERT depuis `LITIGE_DECISION_OUVERT_ALERTE_JOURS` jours ou plus alerte à CHAQUE passage, tant qu'il
 * reste ouvert (arbitrage de la coordination : sans schéma, sans trou si un passage manque ; l'alerte cesse
 * à la clôture). Elle ne clôt rien, et ne nomme ni l'apporteur ni les faits : le nombre, puis la décision
 * (son identifiant) et l'âge en jours.
 */
async function alerterLesLitigesAnciens(
  prisma: PrismaClient,
  maintenant: Date,
  journal: Pick<Journal, 'warn'>
): Promise<void> {
  const periode = SEUILS.LITIGE_DECISION_OUVERT_ALERTE_JOURS.valeur;
  const ouverts = await prisma.litigeDecisionDeContrat.findMany({
    where: {
      closAt: null,
      ouvertAt: { lte: new Date(maintenant.getTime() - periode * MS_PAR_JOUR) },
    },
    select: { decisionId: true, ouvertAt: true },
  });
  const litiges = ouverts.map((l) => ({
    decisionId: l.decisionId,
    ageJours: Math.floor((maintenant.getTime() - l.ouvertAt.getTime()) / MS_PAR_JOUR),
  }));
  if (litiges.length > 0)
    journal.warn('litiges_decisions_ouverts_anciens', { nombre: litiges.length, litiges });
}

export async function purgerLesTextesDesDecisions(
  prisma: PrismaClient,
  maintenant: Date,
  p: { journal?: Pick<Journal, 'warn'> } = {}
): Promise<{ textesPurges: number }> {
  await alerterLesLitigesAnciens(prisma, maintenant, p.journal ?? creerJournal());
  const aPurger = {
    textePurgeAt: null,
    NOT: { texteChiffre: null },
    creeAt: { lte: bornePrealable(maintenant) },
    ...SANS_LITIGE_OUVERT,
  };
  let textesPurges = 0;
  let apres: string | null = null;
  for (;;) {
    const lot: Candidate[] = await prisma.decisionDeContrat.findMany({
      where: apres === null ? aPurger : { ...aPurger, id: { gt: apres } },
      select: {
        id: true,
        apporteurId: true,
        geste: true,
        dateEffet: true,
        creeAt: true,
        litiges: {
          where: { NOT: { closAt: null } },
          select: { closAt: true },
          orderBy: { closAt: 'desc' },
          take: 1,
        },
      },
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
            select: { apporteurId: true, dateEffet: true, creeAt: true, evenementId: true },
            orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
          });
    // LIMITE NOMMÉE (en tête) : seule la résiliation fondée sur un changement de statut compte. Le
    // type de son fait se lit par `evenementId`, au module du journal : la relation vers le journal
    // n'est jamais employée par le code (condition d'A02).
    const resiliations: typeof toutes = [];
    for (const r of toutes) {
      const fait = await lireLaChargeDUnFait(prisma, r.evenementId.toString());
      if (fait?.type === 'apporteur_statut_modifie') resiliations.push(r);
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
        return texteEchu(
          departApresLesLitiges(departDuTexte(d, suivante), d.litiges[0]?.closAt ?? null),
          maintenant
        );
      })
      .map((d) => d.id);
    if (echus.length > 0) {
      const { count } = await prisma.decisionDeContrat.updateMany({
        where: {
          id: { in: echus },
          textePurgeAt: null,
          NOT: { texteChiffre: null },
          ...SANS_LITIGE_OUVERT,
        },
        data: { texteChiffre: null, faitsEmpreinte: null, textePurgeAt: maintenant },
      });
      textesPurges += count;
    }
    if (lot.length < LOT_DE_PURGE_DES_DECISIONS) return { textesPurges };
  }
}
