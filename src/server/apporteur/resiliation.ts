/**
 * SEC-19 — la RÉSILIATION d'un apporteur, en UNE transaction (REQ-SEC-032, REQ-DM-011, REQ-SEC-003,
 * REQ-SEC-005), celle de l'appelant :
 *   1. la ligne de l'apporteur est VERROUILLÉE (`FOR UPDATE`) et son statut relu ;
 *   2. la matrice juge `statut × resilier` et le motif (fermé, REQ-JUR-042) — un refus ne laisse rien ;
 *   3. le statut passe `resilie`, le motif est posé, et `sessionVersion` est incrémentée : toutes les
 *      sessions d'avant tombent (REQ-SEC-003) ; l'apporteur se reconnecte par lien magique, en
 *      lecture seule (art. 12.3) ;
 *   4. l'événement `apporteur_statut_modifie` est écrit par l'écrivain unique du journal ;
 *   5. les jetons de dépôt sont révoqués (`revoquerJetonsALaResiliation`, REQ-SEC-005).
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
import { ajouterEvenement } from '../evenement/journal';
import { revoquerJetonsALaResiliation } from '../auth/jeton-depot';

type Tx = Prisma.TransactionClient;

/** L'acteur d'une résiliation : un utilisateur de la console, et lui seul. */
export type ActeurDeResiliation = { readonly par: 'utilisateur_console'; readonly id: string };

export class ErreurResiliation extends Error {
  readonly code: 'acteur_non_humain' | 'apporteur_introuvable';

  constructor(code: ErreurResiliation['code'], detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'ErreurResiliation';
    this.code = code;
  }
}

export interface DemandeDeResiliation {
  readonly apporteurId: string;
  readonly motif: MotifResiliation;
  readonly acteur: ActeurDeResiliation;
  readonly maintenant: Date;
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
  const de = await statutVerrouille(tx, apporteurId);
  const { statut: vers, resiliationMotif } = transitionner({
    de,
    evenementApporteur: 'resilier',
    motif,
  });
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
  const jetonsRevoques = await revoquerJetonsALaResiliation(tx, apporteurId, maintenant);
  return { de, vers, jetonsRevoques };
}
