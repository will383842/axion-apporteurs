/**
 * DM-62 (REQ-DM-033, REQ-DM-043) — les anomalies, les contestations et le démenti d'un contact
 * sortent à leur échéance. Trois passages du lanceur (GOV-137), un par clé du registre des tâches.
 *
 * LES ÉCHÉANCES (durées lues dans `SEUILS`, sous-module `retention.ts`, jamais retapées ; mois et
 * années CIVILS, en heure de Paris, comme le reste du domaine — `ajouterMoisParis`) :
 *   — une anomalie LEVÉE : `ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS` après sa levée (`traite_at`) ;
 *   — une anomalie CONFIRMÉE : `ANOMALIE_CONFIRMEE_ANONYMISEE_APRES_ANS` après la fin de la mesure
 *     qu'elle a fondée (`mesure_terminee_at`) ; jamais tant que cette fin n'est pas posée, le passage
 *     ne la remplace par rien. C'est la console qui la pose, à `traite_at` pour une mesure sans
 *     durée (DM-12) ; une anomalie OUVERTE, jamais ;
 *   — une contestation : `CONTESTATION_TEXTES_VIDES_APRES_ANS` après sa réponse, à défaut après sa
 *     réception ;
 *   — le démenti d'un contact (`non_confirme`, contrat art. 3.7, que la purge du contact EXCEPTE) :
 *     `DEMENTI_CONTACT_VIDE_APRES_ANS` après la qualification (`cree_at`, forme d'A02).
 *
 * LE GEL POUR LITIGE (DM-12) : une ligne gelée n'est ni anonymisée ni vidée tant que le gel est
 * actif ; levé après l'échéance, la ligne sort au passage qui suit la levée ; levé avant, elle sort à
 * l'échéance. La base le tient aussi (`anomalies_refuser_substitution`,
 * `contestations_refuser_substitution`) : la sélection l'écarte pour qu'une ligne gelée ne fasse
 * jamais échouer le passage entier.
 *
 * UNE ÉCRITURE par purge, conditionnelle et idempotente : une ligne déjà anonymisée, vidée ou purgée
 * n'est ni relue ni réécrite. La base tient le reste — l'anonymisation est liée aux champs vidés et
 * aux mois tronqués (`anomalies_anonymisation_liee`), le vidage de la contestation à sa date
 * (`contestations_purge_liee`), et le démenti suit le gabarit d'ajout seul (les deux blocs vers NULL,
 * `contact_purge_at` posée une fois).
 *
 * LE SIGNAL DES MESURES OUVERTES (REQ-DM-033) : une anomalie confirmée dont la fin de la mesure n'est
 * pas posée plus de `MESURE_OUVERTE_ALERTE_JOURS` après sa clôture est signalée. Le passage n'en rend
 * que le NOMBRE (`mesuresOuvertes`, au battement) ; `mesuresOuvertesAuDela` rend les anomalies en
 * cause, pour la console seule.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ajouterMoisParis } from '../../domain/attribution/machine';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';

/** Le calendrier, pas un délai : les mois d'une année civile. */
const MOIS_PAR_AN = 12;

/**
 * `maintenant` moins `mois` mois civils, en heure de Paris : un jour absent du mois d'arrivée devient
 * son dernier (deux mois avant le 30 avril, c'est le 28 février), jamais un débordement sur le mois
 * suivant, qui ferait sortir une ligne avant son échéance.
 */
function moinsMois(maintenant: Date, mois: number): Date {
  return new Date(ajouterMoisParis(maintenant.getTime(), -mois));
}

/** `maintenant` moins `ans` années civiles, en heure de Paris (cinq ans avant un 29 février : le 28). */
function moinsAns(maintenant: Date, ans: number): Date {
  return moinsMois(maintenant, ans * MOIS_PAR_AN);
}

/**
 * Les limites d'un passage : une ligne dont le point de départ est antérieur ou égal à sa limite a
 * passé son échéance. Le signal est STRICT : « ouverte depuis plus de » la durée d'alerte.
 */
export function limitesDePurge(maintenant: Date) {
  return {
    anomalieLevee: moinsMois(maintenant, SEUILS.ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS.valeur),
    anomalieConfirmee: moinsAns(maintenant, SEUILS.ANOMALIE_CONFIRMEE_ANONYMISEE_APRES_ANS.valeur),
    contestation: moinsAns(maintenant, SEUILS.CONTESTATION_TEXTES_VIDES_APRES_ANS.valeur),
    dementi: moinsAns(maintenant, SEUILS.DEMENTI_CONTACT_VIDE_APRES_ANS.valeur),
    mesureOuverte: new Date(
      maintenant.getTime() - SEUILS.MESURE_OUVERTE_ALERTE_JOURS.valeur * MS_PAR_JOUR
    ),
  };
}

/** Les mesures ouvertes au-delà de la durée d'alerte : confirmées, sans fin posée, non anonymisées. */
function mesuresOuvertes(maintenant: Date): Prisma.AnomalieWhereInput {
  return {
    statut: 'confirmee',
    mesureTermineeAt: null,
    anonymiseeAt: null,
    traiteAt: { lt: limitesDePurge(maintenant).mesureOuverte },
  };
}

/** Les anomalies en cause, pour la console SEULE : leurs identifiants ne sortent pas d'ici. */
export async function mesuresOuvertesAuDela(
  prisma: PrismaClient,
  maintenant: Date
): Promise<string[]> {
  const lignes = await prisma.anomalie.findMany({
    where: mesuresOuvertes(maintenant),
    select: { id: true },
    orderBy: [{ traiteAt: 'asc' }, { id: 'asc' }],
  });
  return lignes.map((l) => l.id);
}

/**
 * L'anonymisation des anomalies échues, en UNE instruction : tout ce qui désigne une personne est
 * vidé, les mois d'ouverture et de traitement sont tronqués en UTC (la forme que la base exige,
 * `anomalies_anonymisation_liee` : la troncature range une date, elle ne compte pas un délai),
 * `anonymisee_at` est posée.
 * Restent l'id, le type et le statut. Le passage rend aussi le NOMBRE des mesures ouvertes au-delà
 * de la durée d'alerte, et rien d'autre.
 *
 * DM-55 (condition de la juriste) : dans la MÊME instruction — donc la même transaction —, les
 * notifications de l'espace qui nommaient une anomalie anonymisée sont DÉLIÉES (`anomalie_id` vidé).
 * Après l'anonymisation, plus aucune ne pointe vers elle ; la notification reste, et se rend avec la
 * phrase fermée de la juriste.
 */
export async function anonymiserLesAnomalies(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ anonymisees: number; mesuresOuvertes: number }> {
  const limites = limitesDePurge(maintenant);
  const t = maintenant.toISOString();
  const [r] = await prisma.$queryRaw<{ anonymisees: number }[]>`
    WITH "anonymisees" AS (UPDATE "anomalies" SET
      "anonymisee_at" = ${t}::timestamptz,
      "score" = NULL,
      "apporteur_id" = NULL,
      "attribution_id" = NULL,
      "traite_par_id" = NULL,
      "justification_chiffre" = NULL,
      "justification_purgee_at" = NULL,
      "mesure_terminee_at" = NULL,
      "gel_litige_at" = NULL,
      "gel_litige_leve_at" = NULL,
      "gel_litige_ref" = NULL,
      "ouverte_at" = date_trunc('month', "ouverte_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      "traite_at" = date_trunc('month', "traite_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    WHERE "anonymisee_at" IS NULL
      AND ("gel_litige_at" IS NULL OR "gel_litige_leve_at" <= ${t}::timestamptz)
      AND (("statut" = 'levee'
             AND "traite_at" <= ${limites.anomalieLevee.toISOString()}::timestamptz)
        OR ("statut" = 'confirmee'
             AND "mesure_terminee_at" <= ${limites.anomalieConfirmee.toISOString()}::timestamptz))
      RETURNING "id"),
    "deliees" AS (UPDATE "notifications_espace" SET "anomalie_id" = NULL
      WHERE "anomalie_id" IN (SELECT "id" FROM "anonymisees") RETURNING 1)
    SELECT (SELECT count(*) FROM "anonymisees")::int AS "anonymisees"`;
  const anonymisees = r?.anonymisees ?? 0;
  const ouvertes = await prisma.anomalie.count({ where: mesuresOuvertes(maintenant) });
  return { anonymisees, mesuresOuvertes: ouvertes };
}

/** Une ligne hors d'un gel ACTIF : jamais gelée, ou gel levé. */
const horsGelActif = (maintenant: Date) => ({
  OR: [{ gelLitigeAt: null }, { gelLitigeLeveAt: { lte: maintenant } }],
});

/**
 * Le vidage des contestations échues : le texte et la réponse passent à NULL, `purgee_at` est posée.
 * L'auteur et la date de la réponse restent, comme trace ; la purge n'en pose jamais.
 */
export async function purgerLesContestations(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ videes: number }> {
  const limite = limitesDePurge(maintenant).contestation;
  const { count } = await prisma.contestation.updateMany({
    where: {
      purgeeAt: null,
      AND: [
        { OR: [{ repondueAt: { lte: limite } }, { repondueAt: null, recueAt: { lte: limite } }] },
        horsGelActif(maintenant),
      ],
    },
    data: { texteChiffre: null, reponseChiffre: null, purgeeAt: maintenant },
  });
  return { videes: count };
}

/**
 * La purge DÉDIÉE du démenti d'un contact : le nom de la personne interrogée et les termes de sa
 * réponse passent à NULL, `contact_purge_at` est posée, dans la même écriture ; rien d'autre n'est
 * réécrit. L'exception est FERMÉE : seul `non_confirme` est lu ici, tout autre résultat part avec le
 * contact (`purger-contacts.ts`).
 */
export async function purgerLesDementis(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ vides: number }> {
  const { count } = await prisma.qualification.updateMany({
    where: {
      resultatContact: 'non_confirme',
      contactPurgeAt: null,
      creeAt: { lte: limitesDePurge(maintenant).dementi },
    },
    data: {
      personneInterrogeeChiffre: null,
      termesReponseChiffre: null,
      contactPurgeAt: maintenant,
    },
  });
  return { vides: count };
}
