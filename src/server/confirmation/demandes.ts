/**
 * DM-40 (REQ-DM-060) — l'ÉCRIVAIN de la demande de confirmation par e-mail. Il écrit, toujours sur le
 * client de la transaction de l'appelant, la demande ET son événement : un changement d'état sans son
 * événement n'existe pas.
 *
 *   — `creerLaDemande` : appelée par le dépôt (SEC-12) dans SA transaction, une demande `planifiee` par
 *     attribution (index unique). Une attribution sans apporteur (prise en charge par un conseiller,
 *     HYP-W20-SALARIES) n'en reçoit jamais. Les jetons arrivent en EMPREINTE (SEC-40 les tire) ;
 *   — `annulerLaDemandeDe` : appelée par la transition `annulee_par_apporteur` de l'attribution, dans
 *     la même transaction, pour une demande encore `planifiee` seulement ;
 *   — `corrigerLeContact` : pendant le délai avant envoi, une RÉVISION garde l'ancienne valeur, recopiée
 *     telle quelle (chaque bloc reste lié à l'attribution par son AAD), puis l'attribution reçoit la
 *     nouvelle ; `deposee_at` n'est jamais touchée.
 */
import type { Prisma } from '@prisma/client';
import {
  jugerAnnulation,
  jugerCorrection,
  type EtatDemandeConfirmation,
} from '../../domain/confirmation/demande';
import { ajouterEvenement } from '../evenement/journal';
import { colonnesPii, type ClairsPii, type ClesPii } from '../securite/pii';

type Tx = Prisma.TransactionClient;
type Acteur = { par: 'systeme' } | { par: 'apporteur' | 'utilisateur_console'; id: string };

/** Le refus nommé d'une demande pour une attribution sans apporteur (HYP-W20-SALARIES). */
export class DemandePourUnConseiller extends Error {
  readonly code = 'demande_pour_un_conseiller';
  constructor() {
    super(
      'demande_pour_un_conseiller : une prise en charge par un conseiller ne crée pas de demande'
    );
    this.name = 'DemandePourUnConseiller';
  }
}

/** Le refus nommé d'une correction ou d'une annulation sans demande. */
export class DemandeIntrouvable extends Error {
  readonly code = 'demande_introuvable';
  constructor() {
    super('demande_introuvable : aucune demande de confirmation pour cette attribution');
    this.name = 'DemandeIntrouvable';
  }
}

async function journaliser(
  tx: Tx,
  e: {
    demandeId: string;
    de: EtatDemandeConfirmation | null;
    vers: EtatDemandeConfirmation;
    acteur: Acteur;
    survenuAt: Date;
  }
): Promise<void> {
  await ajouterEvenement(tx, {
    type: 'demande_confirmation_etat_modifie',
    agregat: 'demande_confirmation',
    agregatId: e.demandeId,
    survenuAt: e.survenuAt,
    charge: { de: e.de, vers: e.vers, acteur: e.acteur },
  });
}

/** La demande d'un dépôt d'apporteur, `planifiee`, et son événement de naissance. Rend son id. */
export async function creerLaDemande(
  tx: Tx,
  demande: {
    readonly attributionId: string;
    readonly jetonOuiHash: string;
    readonly jetonNonHash: string;
    readonly acteur: Acteur;
  }
): Promise<string> {
  const [a] = await tx.$queryRaw<{ apporteur_id: string | null }[]>`
    SELECT apporteur_id::text AS apporteur_id FROM attributions
    WHERE id = ${demande.attributionId}::uuid FOR UPDATE`;
  if (!a || a.apporteur_id === null) throw new DemandePourUnConseiller();
  const d = await tx.demandeConfirmation.create({
    data: {
      attributionId: demande.attributionId,
      jetonOuiHash: demande.jetonOuiHash,
      jetonNonHash: demande.jetonNonHash,
    },
    select: { id: true, creeeAt: true },
  });
  await journaliser(tx, {
    demandeId: d.id,
    de: null,
    vers: 'planifiee',
    acteur: demande.acteur,
    survenuAt: d.creeeAt,
  });
  return d.id;
}

/**
 * L'annulation de la demande, par la transition `annulee_par_apporteur` de son attribution, dans la
 * MÊME transaction. Une attribution sans demande (un conseiller) n'a rien à annuler. Une demande qui
 * n'est plus `planifiee` lève, et toute la transaction tombe : l'attribution n'est pas annulée non plus.
 */
export async function annulerLaDemandeDe(
  tx: Tx,
  attributionId: string,
  acteur: Acteur,
  maintenant: Date
): Promise<void> {
  const [d] = await tx.$queryRaw<{ id: string; etat: EtatDemandeConfirmation }[]>`
    SELECT id::text AS id, etat::text AS etat FROM demandes_confirmation
    WHERE attribution_id = ${attributionId}::uuid FOR UPDATE`;
  if (!d) return;
  jugerAnnulation(d.etat);
  await tx.demandeConfirmation.update({ where: { id: d.id }, data: { etat: 'annulee' } });
  await journaliser(tx, {
    demandeId: d.id,
    de: d.etat,
    vers: 'annulee',
    acteur,
    survenuAt: maintenant,
  });
}

/** Ce qu'une correction peut changer : le contact et le contexte, en CLAIR, chiffrés ici. */
export type CorrectionDuContact = Pick<
  ClairsPii,
  'nomContact' | 'prenomContact' | 'email' | 'telephone' | 'fonctionContact' | 'contexte'
>;

/**
 * La correction du contact ou du contexte pendant le délai avant envoi.
 *   1. L'ANCIENNE valeur de chaque champ corrigé est recopiée PAR LA BASE dans une révision
 *      (INSERT … SELECT) : le bloc chiffré ne sort jamais de la base, et reste lié à l'attribution.
 *   2. La nouvelle valeur est chiffrée par `colonnesPii`, liée à l'attribution, puis écrite.
 * `deposee_at` n'est pas touchée (son déclencheur la garde de toute façon).
 */
export async function corrigerLeContact(
  tx: Tx,
  correction: {
    readonly attributionId: string;
    readonly clairs: CorrectionDuContact;
    readonly cles: ClesPii;
    readonly maintenant: Date;
  }
): Promise<void> {
  const { attributionId, clairs } = correction;
  const [a] = await tx.$queryRaw<{ deposee_at: Date }[]>`
    SELECT deposee_at FROM attributions WHERE id = ${attributionId}::uuid FOR UPDATE`;
  if (!a) throw new DemandeIntrouvable();
  jugerCorrection(a.deposee_at.getTime(), correction.maintenant.getTime());
  const d = await tx.demandeConfirmation.findUnique({
    where: { attributionId },
    select: { id: true },
  });
  if (!d) throw new DemandeIntrouvable();
  const change = (champ: keyof CorrectionDuContact): boolean => clairs[champ] !== undefined;
  await tx.$executeRaw`
    INSERT INTO revisions_demande_confirmation (id, demande_id, nom_contact_chiffre,
      prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre, phone_hash,
      fonction_contact_chiffre, contexte_chiffre)
    SELECT gen_random_uuid(), ${d.id}::uuid,
      CASE WHEN ${change('nomContact')} THEN a.nom_contact_chiffre END,
      CASE WHEN ${change('prenomContact')} THEN a.prenom_contact_chiffre END,
      CASE WHEN ${change('email')} THEN a.email_chiffre END,
      CASE WHEN ${change('email')} THEN a.email_hash END,
      CASE WHEN ${change('telephone')} THEN a.telephone_chiffre END,
      CASE WHEN ${change('telephone')} THEN a.phone_hash END,
      CASE WHEN ${change('fonctionContact')} THEN a.fonction_contact_chiffre END,
      CASE WHEN ${change('contexte')} THEN a.contexte_chiffre END
    FROM attributions a WHERE a.id = ${attributionId}::uuid`;
  await tx.attribution.update({
    where: { id: attributionId },
    // Les blocs et empreintes naissent de colonnesPii, ÉTALÉ (garde securite:schema-pii) ; son `id`
    // est celui de la ligne. Prisma 5 accepte un Uint8Array là où il type Buffer.
    data: {
      ...(colonnesPii(
        { modele: 'attribution', id: attributionId },
        clairs,
        correction.cles
      ) as unknown as Prisma.AttributionUncheckedUpdateInput),
    },
  });
}
