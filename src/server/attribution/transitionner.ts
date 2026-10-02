/**
 * DM-08 — l'ÉCRIVAIN des transitions d'attribution (REQ-DM-006, REQ-DM-007, REQ-QA-004). Il est le
 * seul à changer `attributions.statut` ; la matrice (`src/domain/attribution/machine.ts`) dit si la
 * transition est permise, ce module l'écrit.
 *
 * DANS UNE SEULE TRANSACTION, celle de l'appelant :
 *   1. la ligne est VERROUILLÉE (`FOR UPDATE`) : deux transitions concurrentes se sérialisent, la
 *      seconde juge l'état laissé par la première ;
 *   2. le triplet (état, transition, type de porteur) est jugé ; un refus lève une erreur typée et
 *      RIEN n'est écrit ;
 *   3. l'état et les colonnes de temps recalculées (`effetsDeTransition`) sont écrits, et le rang
 *      d'attente quitte la ligne avec la file ;
 *   4. l'événement `attribution_etat_modifie` est écrit par l'écrivain unique du journal.
 *
 * CE QU'IL NE DÉCIDE PAS : quand une transition a lieu. Les passages planifiés (péremption, file,
 * confirmation tacite) et les déclencheurs (Qualification, devis, condition suspensive) sont à leurs
 * tâches ; ils appellent ce module.
 */
import type { Prisma } from '@prisma/client';
import {
  ErreurTransitionAttribution,
  NAISSANCES_ATTRIBUTION,
  codeDeCaducite,
  effetsDeTransition,
  transitionnerAttribution,
  type EtatAttribution,
  type TransitionAttribution,
  type TypePorteur,
} from '../../domain/attribution/machine';
import { ajouterEvenement } from '../evenement/journal';

type Tx = Prisma.TransactionClient;
type Acteur =
  | { par: 'systeme' }
  | { par: 'apporteur' | 'utilisateur_console'; id: string };

type Ligne = {
  statut: EtatAttribution;
  apporteur_id: string | null;
  lien_interet_declare: boolean;
  premier_contact_at: Date | null;
  peremption_suspendue_at: Date | null;
  confirmee_at: Date | null;
  fenetre_fin_at: Date | null;
  peremption_at: Date | null;
};

async function verrouiller(tx: Tx, attributionId: string): Promise<Ligne> {
  const [l] = await tx.$queryRaw<Ligne[]>`
    SELECT statut::text AS statut, apporteur_id::text AS apporteur_id, lien_interet_declare,
           premier_contact_at, peremption_suspendue_at, confirmee_at, fenetre_fin_at, peremption_at
    FROM attributions WHERE id = ${attributionId}::uuid FOR UPDATE`;
  if (!l) throw new ErreurTransitionAttribution('etat_inconnu', 'attribution introuvable');
  return l;
}

const porteurDe = (l: Ligne): TypePorteur => (l.apporteur_id === null ? 'conseiller' : 'apporteur');
const lienDe = (l: Ligne) => (l.lien_interet_declare ? 'declare' : 'non_declare');

export interface DemandeEcriture {
  readonly attributionId: string;
  readonly transition: TransitionAttribution;
  readonly acteur: Acteur;
  readonly maintenant: Date;
}

/** Une transition d'une attribution EXISTANTE. Rend l'état de départ et d'arrivée. */
export async function transitionnerUneAttribution(
  tx: Tx,
  demande: DemandeEcriture
): Promise<{ de: EtatAttribution; vers: EtatAttribution }> {
  const { attributionId, transition, acteur, maintenant } = demande;
  const l = await verrouiller(tx, attributionId);
  const de = l.statut;
  const vers = transitionnerAttribution({ de, transition, porteur: porteurDe(l) });
  const t = effetsDeTransition(
    {
      premierContactAt: l.premier_contact_at,
      peremptionSuspendueAt: l.peremption_suspendue_at,
      confirmeeAt: l.confirmee_at,
      fenetreFinAt: l.fenetre_fin_at,
      peremptionAt: l.peremption_at,
    },
    transition,
    vers,
    maintenant
  );
  await tx.attribution.update({
    where: { id: attributionId },
    data: {
      statut: vers,
      ...(de === 'en_attente' ? { rangAttente: null } : {}),
      confirmeeAt: t.confirmeeAt,
      fenetreFinAt: t.fenetreFinAt,
      peremptionAt: t.peremptionAt,
    },
  });
  await ajouterEvenement(tx, {
    type: 'attribution_etat_modifie',
    agregat: 'attribution',
    agregatId: attributionId,
    survenuAt: maintenant,
    charge: { de, vers, transition, acteur, lienInteret: lienDe(l) },
  });
  return { de, vers };
}

/**
 * La NAISSANCE d'une attribution que l'appelant vient d'insérer dans la même transaction (dépôt,
 * prise en charge, redéclaration au rang 1) : la naissance est jugée contre la population de la
 * ligne et son état d'entrée, puis journalisée.
 */
export async function journaliserLaNaissance(
  tx: Tx,
  demande: DemandeEcriture & { transition: keyof typeof NAISSANCES_ATTRIBUTION }
): Promise<EtatAttribution> {
  const { attributionId, transition, acteur, maintenant } = demande;
  const l = await verrouiller(tx, attributionId);
  const vers = transitionnerAttribution({ de: null, transition, porteur: porteurDe(l) });
  if (l.statut !== vers) {
    throw new ErreurTransitionAttribution(
      'naissance_refusee',
      `naissance × ${transition} : ligne en ${l.statut}, attendu ${vers}`
    );
  }
  await ajouterEvenement(tx, {
    type: 'attribution_etat_modifie',
    agregat: 'attribution',
    agregatId: attributionId,
    survenuAt: maintenant,
    charge: { de: null, vers, transition, acteur, lienInteret: lienDe(l) },
  });
  return vers;
}

/**
 * La confirmation (avis d'A07) : si une commande valable est DÉJÀ rattachée, la confirmation est
 * suivie, dans la même transaction, de `devis_signe` — deux événements, dans cet ordre, aucune
 * flèche combinée. L'existence de la commande est dite par l'appelant (DM-15 la porte).
 */
export async function confirmerUneAttribution(
  tx: Tx,
  demande: DemandeEcriture & {
    transition: 'confirmee' | 'confirmee_par_courriel' | 'confirmee_tacitement';
    commandeValableRattachee: boolean;
  }
): Promise<{ vers: EtatAttribution }> {
  const { vers } = await transitionnerUneAttribution(tx, demande);
  if (!demande.commandeValableRattachee) return { vers };
  return {
    vers: (await transitionnerUneAttribution(tx, { ...demande, transition: 'devis_signe' })).vers,
  };
}

/**
 * La caducité d'une commande (condition suspensive défaillie, D-OPCO-8). Le CODE est choisi ici
 * selon la fenêtre, jamais par l'appelant ; si une AUTRE commande valable est portée, l'attribution
 * reste `signee` et le refus est nommé. Le déclencheur est au lot OPCO.
 */
export async function constaterLaCaducite(
  tx: Tx,
  demande: Omit<DemandeEcriture, 'transition'> & { autreCommandeValable: boolean }
): Promise<{ vers: EtatAttribution }> {
  const l = await verrouiller(tx, demande.attributionId);
  if (demande.autreCommandeValable) {
    throw new ErreurTransitionAttribution(
      'autre_commande_valable',
      `${l.statut} × commande_caduque : une autre commande valable est portée`
    );
  }
  if (l.fenetre_fin_at === null) {
    throw new ErreurTransitionAttribution('transition_refusee', `${l.statut} × commande_caduque`);
  }
  const transition = codeDeCaducite(l.fenetre_fin_at, demande.maintenant);
  return { vers: (await transitionnerUneAttribution(tx, { ...demande, transition })).vers };
}
