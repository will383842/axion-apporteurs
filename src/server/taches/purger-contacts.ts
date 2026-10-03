/**
 * La purge planifiée du contact d'une attribution (REQ-DM-031, REQ-SEC-030, HYP-RGPD-RETENTION) —
 * condition RGPD de la mise en service : les coordonnées d'un tiers naissent en phase 1 (DM-07), leur
 * effacement ne peut pas attendre la phase 3.
 *
 * DEUX PIÈCES, décision A02 du 2026-10-02 :
 *   — `echeanceDePurge(statut, dateDeReference)`, PURE : la transition de la machine à états l'appelle pour poser
 *     `purge_contact_at` ; les durées sont lues dans `SEUILS` (sous-module `retention.ts`), jamais
 *     retapées. Avant cette machine, aucune transition n'existe : `purge_contact_at` reste nul, et la tâche ne
 *     trouve rien, ce qui est exact ;
 *   — `purgerLesContacts`, la tâche planifiée : elle SÉLECTIONNE `purge_contact_at <= maintenant` et
 *     `contact_purge_at` nul, efface le contact, pose `contact_purge_at` et écrit l'événement
 *     `attribution_contact_purge` DANS LA MÊME TRANSACTION. Idempotente : l'effacement exige
 *     `contact_purge_at` nul, et une ligne déjà purgée n'est ni réécrite ni rejournalisée.
 *
 * DÉFENSE EN PROFONDEUR : une occupante NON convertie n'est jamais purgée, même si son échéance était
 * mal posée ; la liste est DÉRIVÉE de `ETATS_OCCUPANTS`.
 */
import type { EtatAttribution, PrismaClient } from '@prisma/client';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { ajouterEvenement } from '../evenement/journal';
import { effacementPii, type ChampPii } from '../securite/pii';

/**
 * Les états LIBÉRÉS (REQ-SEC-030) : le contact se purge après `CONTACT_PURGE_APRES_LIBERATION_JOURS`.
 * `annulee` en est (décision de la coordination du 2026-10-02) : sans elle, une attribution annulée
 * avant l'envoi ou par la console garderait son contact pour toujours.
 */
export const ETATS_LIBERES = [
  'annulee',
  'invalidee',
  'perdue',
  'expiree',
  'perimee',
] as const satisfies readonly EtatAttribution[];

/** Les occupants qui ne se purgent JAMAIS : tous, sauf la convertie. */
const OCCUPANTS_GARDES = ETATS_OCCUPANTS.filter((e) => e !== 'convertie');

/**
 * L'échéance de la purge d'un contact, ou `null` si ce statut ne se purge pas. `dateDeReference` est
 * la date de la libération pour un état libéré, celle du dernier contact pour une convertie : c'est
 * la transition qui la connaît.
 */
export function echeanceDePurge(statut: EtatAttribution, dateDeReference: Date): Date | null {
  const jours = (ETATS_LIBERES as readonly EtatAttribution[]).includes(statut)
    ? SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur
    : statut === 'convertie'
      ? SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS.valeur
      : null;
  return jours === null ? null : new Date(dateDeReference.getTime() + jours * MS_PAR_JOUR);
}

/**
 * Les coordonnées du siège s'effacent-elles avec le contact ? Le siège d'un entrepreneur individuel
 * (catégorie juridique INSEE de premier rang « 1 ») est souvent son domicile : ses coordonnées
 * s'effacent (point 13 de la séance, validé par Williams le 2026-10-02).
 *
 * ÉCHEC FERMÉ (lentille sécurité) : seule une personne morale PROUVÉE garde les siennes — une
 * catégorie de quatre chiffres dont le premier rang va de « 3 » à « 9 » (nomenclature INSEE des
 * catégories juridiques, premier rang). Le rang « 2 » est un groupement de droit privé NON doté de
 * la personnalité morale, souvent entre personnes physiques (`2110`, indivision) : il est effacé.
 * Une forme nulle, vide ou illisible peut être une entreprise individuelle : elle est effacée aussi.
 */
const PERSONNE_MORALE_PROUVEE = /^[3-9]\d{3}$/;
export function coordonneesSEffacent(natureJuridique: string | null): boolean {
  return natureJuridique === null || !PERSONNE_MORALE_PROUVEE.test(natureJuridique);
}

/**
 * Le contact, champ par champ (`CHAMPS_PII`) : SOURCE UNIQUE de ce que la purge efface. Chaque champ
 * emporte son bloc chiffré et, s'il en a une, son empreinte (`effacementPii`). `lien_interet_declare`
 * RESTE : seule la précision est une donnée de personne.
 */
export const CHAMPS_DU_CONTACT = [
  'nomContact',
  'prenomContact',
  'email',
  'telephone',
  'fonctionContact',
  'contexte',
  'lienInteretPrecision',
] as const satisfies readonly ChampPii[];

/**
 * L'effacement du contact, construit À L'APPEL et non à l'import : un module qui importe ce fichier
 * sans purger (le lanceur, et ses tests qui simulent la couche de chiffrement) ne dépend pas de la
 * primitive.
 */
const contactEfface = () => effacementPii(CHAMPS_DU_CONTACT);

/** Les colonnes (propriétés Prisma) que la purge met à `null`, dérivées de la primitive. */
export function colonnesDuContact(): readonly string[] {
  return Object.keys(contactEfface());
}

/** Un lot de lecture : la tâche reprend au passage suivant ce qu'elle n'a pas fini. */
const LOT = 100;

export async function purgerLesContacts(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ purgees: number }> {
  let purgees = 0;
  const efface = contactEfface();
  for (;;) {
    const lot = await prisma.attribution.findMany({
      where: {
        purgeContactAt: { lte: maintenant },
        contactPurgeAt: null,
        statut: { notIn: [...OCCUPANTS_GARDES] },
      },
      select: { id: true, natureJuridique: true },
      orderBy: [{ purgeContactAt: 'asc' }, { id: 'asc' }],
      take: LOT,
    });
    if (lot.length === 0) return { purgees };
    for (const a of lot) {
      const faite = await prisma.$transaction(async (tx) => {
        const { count } = await tx.attribution.updateMany({
          where: { id: a.id, contactPurgeAt: null },
          data: {
            ...efface,
            // DM-59 : le jeton des droits du contact meurt avec ses données, dans la même instruction
            // (CHECK `attributions_jeton_droits_purge`).
            jetonDroitsHash: null,
            contactPurgeAt: maintenant,
            ...(coordonneesSEffacent(a.natureJuridique)
              ? { latitudeMicrodeg: null, longitudeMicrodeg: null }
              : {}),
          },
        });
        if (count === 0) return false;
        await ajouterEvenement(tx, {
          type: 'attribution_contact_purge',
          agregat: 'attribution',
          agregatId: a.id,
          survenuAt: maintenant,
          charge: { purgeAt: maintenant.toISOString(), acteur: { par: 'systeme' } },
        });
        return true;
      });
      if (faite) purgees += 1;
    }
    if (lot.length < LOT) return { purgees };
  }
}
