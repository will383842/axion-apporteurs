/**
 * SEC-19 — la RÉSILIATION d'un apporteur, en UNE transaction (REQ-SEC-032, REQ-DM-011, REQ-SEC-003,
 * REQ-SEC-005), celle de l'appelant :
 *   1. la ligne de l'apporteur est VERROUILLÉE (`FOR UPDATE`) et son statut relu ;
 *   2. la matrice juge `statut × resilier` et le motif (fermé, REQ-JUR-042) — un refus ne laisse rien ;
 *   3. le statut passe `resilie`, le motif est posé, et `sessionVersion` est incrémentée : toutes les
 *      sessions d'avant tombent (REQ-SEC-003) ; l'apporteur se reconnecte par lien magique, en
 *      lecture seule (art. 12.3) ;
 *   4. l'événement `apporteur_statut_modifie` est écrit par l'écrivain unique du journal ;
 *   5. TOUTES les attributions de l'apporteur sont transitionnées, chacune avec son événement (art. 12,
 *      A02 et juriste sur #703) : `figee` (vers `figee_resiliation`) avec commande, `fin_de_contrat`
 *      sans ; aucune attribution en file ou occupante n'est laissée telle quelle ;
 *   6. les jetons de dépôt sont révoqués (`revoquerJetonsALaResiliation`, REQ-SEC-005).
 *
 * LA RÉSILIATION POUR MANQUEMENT (art. 11.2, REQ-JUR-006) est refusée (`mise_en_demeure_requise`)
 * sans une mise en demeure du MÊME article, envoyée et échue, sauf inexécution irrémédiable. On
 * cherche UNE mise en demeure échue de l'article en cause ; on n'en compte jamais.
 *
 * LA COUPURE APPARTIENT À LA RÉSILIATION SEULE : la suspension n'appelle jamais ce module
 * (REQ-SEC-032, REQ-SEC-019).
 *
 * UN ACTE HUMAIN (garde GATE-JUR-ACTEUR-HUMAIN, REQ-JUR-042) : seul un utilisateur de la console
 * résilie ; aucune résiliation n'est jamais décidée par le système. Même une résiliation à la demande
 * de l'apporteur (`ordinaire_apporteur`, demandée par écrit) est consignée par la console. Jugé AVANT
 * tout verrou : un refus ne prend rien.
 */
import type { Prisma } from '@prisma/client';
import { transitionner } from '../../domain/apporteur/matrice';
import type { MotifResiliation, StatutApporteur } from '../../domain/apporteur/statut';
import {
  jugerLaResiliationPourManquement,
  type ArticleMiseEnDemeure,
} from '../../domain/apporteur/resiliation';
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
  type EtatAttribution,
} from '../../domain/attribution/machine';
import { ajouterEvenement, lireLaChargeDUnFait } from '../evenement/journal';
import { revoquerJetonsALaResiliation } from '../auth/jeton-depot';
import { transitionnerUneAttribution } from '../attribution/transitionner';

type Tx = Prisma.TransactionClient;

/** L'acteur d'une résiliation : un utilisateur de la console, et lui seul. */
export type ActeurDeResiliation = { readonly par: 'utilisateur_console'; readonly id: string };

export class ErreurResiliation extends Error {
  readonly code:
    | 'acteur_non_humain'
    | 'apporteur_introuvable'
    | 'manquement_incoherent'
    | 'mise_en_demeure_requise';

  constructor(code: ErreurResiliation['code'], detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurResiliation';
    this.code = code;
  }
}

export interface DemandeDeResiliation {
  readonly apporteurId: string;
  readonly motif: MotifResiliation;
  /**
   * Pour `manquement_grave`, et lui seul : l'article en cause (liste fermée de l'art. 11.2) et, le cas
   * échéant, l'inexécution irrémédiable, cochée — motivée par la décision.
   */
  readonly manquement?: {
    readonly article: ArticleMiseEnDemeure;
    readonly inexecutionIrremediable: boolean;
  };
  readonly acteur: ActeurDeResiliation;
  readonly maintenant: Date;
}

/**
 * DÉRIVÉES DE LA MATRICE, jamais recopiées : un état est à traiter s'il admet l'une des deux sorties
 * de fin de contrat ; il garde le droit à commission (art. 12.3) s'il admet `figee` — ce sont les
 * états AVEC commande.
 */
const sortieDeFinDeContrat = (e: EtatAttribution): 'figee' | 'fin_de_contrat' | null =>
  TRANSITIONS_ATTRIBUTION[e].figee !== undefined
    ? 'figee'
    : TRANSITIONS_ATTRIBUTION[e].fin_de_contrat !== undefined
      ? 'fin_de_contrat'
      : null;
const A_TRAITER = ETATS_ATTRIBUTION.filter((e) => sortieDeFinDeContrat(e) !== null);

/**
 * Les `envoye_at` des mises en demeure de CET article : chaque notification `mise_en_demeure` de
 * l'apporteur mène à son fait (l'article, relu par le lecteur du journal) et à ses courriels envoyés.
 */
async function envoisDeLArticle(
  tx: Tx,
  apporteurId: string,
  article: ArticleMiseEnDemeure
): Promise<(number | null)[]> {
  const notifications = await tx.notificationEspace.findMany({
    where: { apporteurId, cle: 'mise_en_demeure', evenementId: { not: null } },
    select: {
      evenementId: true,
      courriels: { where: { statut: 'envoye' }, select: { envoyeAt: true } },
    },
  });
  const envois: (number | null)[] = [];
  for (const n of notifications) {
    const fait = await lireLaChargeDUnFait(tx, String(n.evenementId));
    const charge = fait?.charge as { article?: string } | undefined;
    if (fait?.type !== 'apporteur_mis_en_demeure' || charge?.article !== article) continue;
    for (const c of n.courriels) envois.push(c.envoyeAt === null ? null : c.envoyeAt.getTime());
  }
  return envois;
}

async function statutVerrouille(tx: Tx, apporteurId: string): Promise<StatutApporteur> {
  const [l] = await tx.$queryRaw<{ statut: StatutApporteur }[]>`
    SELECT statut::text AS statut FROM apporteurs WHERE id = ${apporteurId}::uuid FOR UPDATE`;
  if (!l) throw new ErreurResiliation('apporteur_introuvable', 'aucune ligne pour cet apporteur');
  return l.statut;
}

/** Résilie un apporteur dans la transaction `tx`. Rend l'état de départ, d'arrivée et les jetons révoqués. */
export async function resilierUnApporteur(
  tx: Tx,
  demande: DemandeDeResiliation
): Promise<{ de: StatutApporteur; vers: StatutApporteur; jetonsRevoques: number }> {
  const { apporteurId, motif, acteur, maintenant } = demande;
  if ((acteur as { par: string }).par !== 'utilisateur_console') {
    throw new ErreurResiliation(
      'acteur_non_humain',
      'une résiliation est un acte d’un utilisateur de la console, jamais du système'
    );
  }
  const { manquement } = demande;
  if ((motif === 'manquement_grave') !== (manquement !== undefined)) {
    throw new ErreurResiliation(
      'manquement_incoherent',
      "l'article en cause accompagne manquement_grave, et lui seul"
    );
  }
  const de = await statutVerrouille(tx, apporteurId);
  const { statut: vers, resiliationMotif } = transitionner({
    de,
    evenementApporteur: 'resilier',
    motif,
  });
  if (manquement !== undefined) {
    const verdict = jugerLaResiliationPourManquement({
      envoisDeLArticle: manquement.inexecutionIrremediable
        ? []
        : await envoisDeLArticle(tx, apporteurId, manquement.article),
      maintenant: maintenant.getTime(),
      inexecutionIrremediable: manquement.inexecutionIrremediable,
    });
    if (!verdict.ok) {
      throw new ErreurResiliation(
        verdict.motif,
        `aucune mise en demeure de l'article ${manquement.article} envoyée et échue`
      );
    }
  }
  await tx.apporteur.update({
    where: { id: apporteurId },
    data: { statut: vers, resiliationMotif, sessionVersion: { increment: 1 } },
  });
  await ajouterEvenement(tx, {
    type: 'apporteur_statut_modifie',
    agregat: 'apporteur',
    agregatId: apporteurId,
    survenuAt: maintenant,
    charge: {
      de,
      vers,
      transition: 'resilier',
      ...(resiliationMotif === null ? {} : { resiliationMotif }),
      acteur,
    },
  });
  const attributions = await tx.attribution.findMany({
    where: { apporteurId, statut: { in: [...A_TRAITER] } },
    select: { id: true, statut: true },
    orderBy: { id: 'asc' },
  });
  for (const a of attributions) {
    await transitionnerUneAttribution(tx, {
      attributionId: a.id,
      transition: sortieDeFinDeContrat(a.statut)!,
      acteur,
      maintenant,
    });
  }
  const jetonsRevoques = await revoquerJetonsALaResiliation(tx, apporteurId, maintenant);
  return { de, vers, jetonsRevoques };
}
