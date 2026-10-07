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
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { transitionner } from '../../domain/apporteur/matrice';
import type { MotifResiliation, StatutApporteur } from '../../domain/apporteur/statut';
import {
  ARTICLES_MISE_EN_DEMEURE,
  estSousContrat,
  jugerLaResiliationPourManquement,
  type ArticleMiseEnDemeure,
} from '../../domain/apporteur/resiliation';
import { versParis } from '../../domain/temps/paris';
import {
  ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT,
  sortieDeFinDeContrat,
} from '../../domain/apporteur/effets-de-la-fin';
import { ajouterEvenement, lireLaChargeDUnFait } from '../evenement/journal';
import { revoquerJetonsALaResiliation } from '../auth/jeton-depot';
import { transitionnerUneAttribution } from '../attribution/transitionner';
import {
  dateEnClair,
  faitsPourLeCourriel,
  jugerLesFaitsSaisis,
  type MotifDeNonRendu,
  type RefusDesFaits,
} from '../attribution/notifications';
import {
  NotificationRefusee,
  parametresDe,
  rendreLaNotification,
  type CourrielCompose,
  type TexteRendu,
} from '../notifications/envoyer';
import {
  CHAMPS_PII,
  colonnesPii,
  decryptPii,
  empreinteRecherche,
  nettoyerUnTexteSaisi,
  type ClesPii,
} from '../securite/pii';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { echeanceDeLevee } from '../../domain/apporteur/suspension';

type Tx = Prisma.TransactionClient;

/** L'acteur d'une résiliation : un utilisateur de la console, et lui seul. */
export type ActeurDeResiliation = { readonly par: 'utilisateur_console'; readonly id: string };

export class ErreurResiliation extends Error {
  readonly code:
    | 'acteur_non_humain'
    | 'apporteur_introuvable'
    | 'manquement_incoherent'
    | 'mise_en_demeure_requise'
    | 'motif_de_la_decision_incoherent'
    | 'date_de_reception_requise'
    | RefusDesFaits
    | 'article_hors_liste'
    | 'statut_sans_contrat'
    | 'preavis_non_notifie'
    | 'cle_idempotence_invalide'
    | 'cle_deja_employee';

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
  /**
   * Le `{motif}` de la décision motivée : pour `manquement_grave`, et lui seul (A02, 5982202417).
   * Saisi par une personne, sous les règles de `{faits}` (DM-55) ; CHIFFRÉ dans la décision.
   */
  readonly motifDeLaDecision?: string;
  /** La réception de l'écrit de l'apporteur : exigée pour `ordinaire_apporteur`. */
  readonly dateReception?: Date;
  readonly acteur: ActeurDeResiliation;
  readonly maintenant: Date;
}

/** Le modèle des blocs chiffrés d'une décision de contrat (lien du bloc, `pii.ts`). */
export const MODELE_DECISION_DE_CONTRAT = 'DecisionDeContrat';

/** Une clé d'idempotence : un UUID, tiré par le serveur au rendu ; revalidé ici, jamais remplacé. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Le jour civil de Paris d'un instant, en colonne DATE (minuit UTC de ce jour). */
function jourDeParis(instant: Date): Date {
  const { annee, mois, jour } = versParis(instant.getTime());
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Un texte saisi par une personne, jugé par le JUGE UNIQUE des faits (DM-55) : un refus nommé. */
function exigerUnTexteAdmis(texte: string): void {
  const verdict = jugerLesFaitsSaisis(texte);
  if (!verdict.ok) throw new ErreurResiliation(verdict.motif, 'le texte saisi est refusé');
}

function exigerUnActeurHumain(acteur: { par: string }): void {
  if (acteur.par !== 'utilisateur_console') {
    throw new ErreurResiliation(
      'acteur_non_humain',
      'une décision de contrat est un acte d’un utilisateur de la console, jamais du système'
    );
  }
}

/**
 * La décision et sa notification, dans la transaction du geste : le texte CHIFFRÉ dans la décision,
 * jamais au journal ; la notification porte l'événement ET la décision — le passage enverra le
 * courriel, dont l'`envoye_at` fait courir le délai.
 */
async function deciderEtNotifier(
  tx: Tx,
  d: {
    apporteurId: string;
    geste: 'mise_en_demeure' | 'resiliation';
    evenementId: bigint;
    article?: ArticleMiseEnDemeure;
    texte?: string;
    dates?: { reception: Date; effet: Date };
    /** La mise en demeure seule : sa clé et l'empreinte de ses faits (A02, 5982552283). */
    idempotence?: { cle: string; faitsEmpreinte: string };
  },
  cles: ClesPii
): Promise<string> {
  const id = randomUUID();
  await tx.decisionDeContrat.create({
    data: {
      ...(d.texte === undefined
        ? { id }
        : (colonnesPii(
            { modele: MODELE_DECISION_DE_CONTRAT, id },
            { texte: d.texte },
            cles
          ) as unknown as Prisma.DecisionDeContratUncheckedCreateInput)),
      ...(d.idempotence === undefined
        ? {}
        : {
            cleIdempotence: d.idempotence.cle,
            faitsEmpreinte: d.idempotence.faitsEmpreinte,
          }),
      apporteurId: d.apporteurId,
      geste: d.geste,
      ...(d.article === undefined ? {} : { article: d.article }),
      ...(d.dates === undefined
        ? {}
        : { dateReception: d.dates.reception, dateEffet: d.dates.effet }),
      evenementId: d.evenementId,
    },
  });
  await tx.notificationEspace.create({
    data: {
      apporteurId: d.apporteurId,
      cle: d.geste,
      evenementId: d.evenementId,
      decisionContratId: id,
    },
  });
  return id;
}

export interface DemandeDeMiseEnDemeure {
  readonly apporteurId: string;
  readonly article: ArticleMiseEnDemeure;
  /** Les `{faits}`, saisis par une personne : sous les règles de DM-55, CHIFFRÉS, jamais au journal. */
  readonly faits: string;
  /**
   * La clé d'idempotence, tirée par le SERVEUR au rendu du formulaire (sécurité, #703, 5982535417) :
   * revalidée en UUID ; absente ou forgée, refusée — jamais remplacée par une clé neuve.
   */
  readonly cleIdempotence: string;
  readonly acteur: ActeurDeResiliation;
  readonly maintenant: Date;
}

/**
 * LE GESTE MINIMAL DE MISE EN DEMEURE (juriste, #703, 5980966503 §3 ; forme d'A02) : un acte de la
 * console, l'article de la liste fermée et les faits ; le fait daté au journal SANS les faits, la
 * décision chiffrée, la notification `mise_en_demeure`. Un apporteur hors contrat n'en reçoit pas.
 * Une mise en demeure n'est ni un avertissement ni un antécédent : rien ne les compte (art. 11.2).
 *
 * IDEMPOTENTE (sécurité, 5982535417 ; forme d'A02, 5982552283) : sous le verrou de l'apporteur, SEULE
 * la ligne de la même clé est lue — jamais l'historique. Même contenu (apporteur, article, empreinte
 * des faits nettoyés, acteur de SON fait) : la décision existante est rendue, sans rien écrire. Autre
 * contenu, ou ligne déjà purgée (comparaison impossible) : `cle_deja_employee`.
 */
export async function mettreEnDemeure(
  tx: Tx,
  demande: DemandeDeMiseEnDemeure,
  cles: ClesPii
): Promise<{ decisionId: string; evenementId: bigint; rejouee?: true }> {
  const { apporteurId, article, faits, cleIdempotence, acteur, maintenant } = demande;
  if (typeof cleIdempotence !== 'string' || !UUID.test(cleIdempotence)) {
    throw new ErreurResiliation(
      'cle_idempotence_invalide',
      "la clé tirée au rendu manque ou n'est pas un UUID"
    );
  }
  exigerUnActeurHumain(acteur);
  if (!(ARTICLES_MISE_EN_DEMEURE as readonly string[]).includes(article)) {
    throw new ErreurResiliation('article_hors_liste', "l'article n'est pas visé par l'art. 11.2");
  }
  exigerUnTexteAdmis(faits);
  const propres = nettoyerUnTexteSaisi(faits);
  const faitsEmpreinte = empreinteRecherche('faits_mise_en_demeure', propres, cles);
  const statut = await statutVerrouille(tx, apporteurId);
  const memeCle = await tx.decisionDeContrat.findUnique({
    where: { cleIdempotence },
    select: {
      id: true,
      apporteurId: true,
      geste: true,
      article: true,
      faitsEmpreinte: true,
      evenementId: true,
    },
  });
  if (memeCle !== null) {
    const fait = await lireLaChargeDUnFait(tx, String(memeCle.evenementId));
    const auteur = (fait?.charge as { acteur?: { par?: string; id?: string } } | undefined)?.acteur;
    const identique =
      memeCle.geste === 'mise_en_demeure' &&
      memeCle.apporteurId === apporteurId &&
      memeCle.article === article &&
      memeCle.faitsEmpreinte !== null &&
      memeCle.faitsEmpreinte === faitsEmpreinte &&
      auteur?.par === acteur.par &&
      auteur?.id === acteur.id;
    if (!identique) {
      throw new ErreurResiliation('cle_deja_employee', 'cette clé a déjà servi à un autre acte');
    }
    return { decisionId: memeCle.id, evenementId: memeCle.evenementId, rejouee: true };
  }
  if (!estSousContrat(statut)) {
    throw new ErreurResiliation('statut_sans_contrat', `statut ${statut}`);
  }
  const inscrit = await ajouterEvenement(tx, {
    type: 'apporteur_mis_en_demeure',
    agregat: 'apporteur',
    agregatId: apporteurId,
    survenuAt: maintenant,
    charge: { article, acteur },
  });
  const evenementId = BigInt(inscrit.id);
  const decisionId = await deciderEtNotifier(
    tx,
    {
      apporteurId,
      geste: 'mise_en_demeure',
      evenementId,
      article,
      texte: propres,
      idempotence: { cle: cleIdempotence, faitsEmpreinte },
    },
    cles
  );
  return { decisionId, evenementId };
}

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
  demande: DemandeDeResiliation,
  cles: ClesPii
): Promise<{ de: StatutApporteur; vers: StatutApporteur; jetonsRevoques: number }> {
  const { apporteurId, motif, acteur, maintenant, motifDeLaDecision, dateReception } = demande;
  exigerUnActeurHumain(acteur);
  const { manquement } = demande;
  if ((motif === 'manquement_grave') !== (manquement !== undefined)) {
    throw new ErreurResiliation(
      'manquement_incoherent',
      "l'article en cause accompagne manquement_grave, et lui seul"
    );
  }
  if ((motif === 'manquement_grave') !== (motifDeLaDecision !== undefined)) {
    throw new ErreurResiliation(
      'motif_de_la_decision_incoherent',
      'la décision motivée accompagne manquement_grave, et lui seul'
    );
  }
  if (motifDeLaDecision !== undefined) exigerUnTexteAdmis(motifDeLaDecision);
  // La juriste (#703, 5982404858) : le préavis d'une résiliation par la Société court de l'ENVOI de
  // l'écrit. Tant que le geste « notifier la résiliation par la Société » (tâche jumelle) n'existe pas,
  // ce motif est REFUSÉ : un courriel parti à la date d'effet ne laisserait aucun préavis.
  if (motif === 'ordinaire_axion') {
    throw new ErreurResiliation(
      'preavis_non_notifie',
      "la résiliation par la Société exige l'écrit préalable qui fait courir le préavis"
    );
  }
  if (motif === 'ordinaire_apporteur' && dateReception === undefined) {
    throw new ErreurResiliation(
      'date_de_reception_requise',
      "la réception de l'écrit de l'apporteur fait courir le préavis"
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
  const inscrit = await ajouterEvenement(tx, {
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
  // La décision et la notification de la fin du contrat (juriste et A02, #703). La date d'effet est le
  // jour du geste : le runbook place le geste à la date d'effet.
  await deciderEtNotifier(
    tx,
    {
      apporteurId,
      geste: 'resiliation',
      evenementId: BigInt(inscrit.id),
      ...(motifDeLaDecision === undefined ? {} : { texte: motifDeLaDecision }),
      dates: {
        reception: jourDeParis(dateReception ?? maintenant),
        effet: jourDeParis(maintenant),
      },
    },
    cles
  );
  const attributions = await tx.attribution.findMany({
    where: { apporteurId, statut: { in: [...ETATS_A_TRAITER_A_LA_FIN_DU_CONTRAT] } },
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

// ── le rendu par le passage ──────────────────────────────────────────────────────────────────────

/** Ce que le rendu lit d'une notification du contrat. */
/**
 * SEC-15 : la clé d'une notification du contrat, et le geste de la décision qu'elle cite. Écrite UNE
 * fois (RM-01) : le courriel et l'écran la lisent ici.
 */
export const GESTE_DE_LA_CLE_DU_CONTRAT: Readonly<Record<string, string>> = {
  mise_en_demeure: 'mise_en_demeure',
  resiliation: 'resiliation',
  suspension_declarations: 'suspension',
};

export type NotificationDuContrat = {
  cle: string;
  apporteurId: string;
  evenementId: string | null;
  decisionContratId: string | null;
};

const nonRendue = (motif: MotifDeNonRendu) => ({ nonRendue: motif });

/**
 * Le texte d'une notification du contrat (`mise_en_demeure`, `resiliation`), rendu DEPUIS SA DÉCISION
 * à l'heure de l'envoi (forme d'A02, #703, 5982083436) : le texte déchiffré puis nettoyé et échappé
 * comme les faits de DM-55, les dates en clair à Paris, et, pour la résiliation, le motif lu dans la
 * charge de SON événement. Échec FERMÉ : tout manque rend un motif fermé, jamais un texte à moitié ;
 * un texte purgé ne se rend plus.
 */
export async function rendreUneDecisionDeContrat(
  tx: Tx,
  n: NotificationDuContrat,
  s: { cles: ClesPii; composer(cle: string, texte: TexteRendu): CourrielCompose }
): Promise<CourrielCompose | { nonRendue: MotifDeNonRendu }> {
  if (n.decisionContratId === null) return nonRendue('faits_non_conserves');
  const d = await tx.decisionDeContrat.findUnique({
    where: { id: n.decisionContratId },
    select: {
      apporteurId: true,
      geste: true,
      article: true,
      texteChiffre: true,
      dateReception: true,
      dateEffet: true,
      evenementId: true,
      textePurgeAt: true,
      creeAt: true,
    },
  });
  if (d === null || n.evenementId === null || d.evenementId.toString() !== n.evenementId) {
    return nonRendue('fait_introuvable');
  }
  if (d.apporteurId !== n.apporteurId) return nonRendue('apporteur_different');
  if (d.geste !== GESTE_DE_LA_CLE_DU_CONTRAT[n.cle]) return nonRendue('charge_illisible');
  if (d.textePurgeAt !== null) return nonRendue('faits_non_conserves');
  let texte: string | undefined;
  if (d.texteChiffre !== null) {
    const clair = decryptPii(
      {
        modele: MODELE_DECISION_DE_CONTRAT,
        champ: CHAMPS_PII.texte.chiffre,
        id: n.decisionContratId,
      },
      d.texteChiffre,
      s.cles
    );
    const propre = faitsPourLeCourriel(clair);
    if (propre === null) return nonRendue('faits_refuses');
    texte = propre;
  }
  try {
    // SEC-15 : la suspension, notifiée avec ses faits ; levée au plus tard quinze jours civils après.
    if (d.geste === 'suspension') {
      if (texte === undefined) return nonRendue('faits_non_conserves');
      return s.composer(
        n.cle,
        rendreLaNotification(n.cle, {
          faits: texte,
          dateLevee: dateEnClair(new Date(echeanceDeLevee(d.creeAt.getTime()))),
        })
      );
    }
    if (d.geste === 'mise_en_demeure') {
      if (texte === undefined || d.article === null) return nonRendue('faits_non_conserves');
      return s.composer(n.cle, rendreLaNotification(n.cle, { article: d.article, faits: texte }));
    }
    const fait = await lireLaChargeDUnFait(tx, n.evenementId);
    const charge = CHARGES_PAR_TYPE.apporteur_statut_modifie.safeParse(fait?.charge);
    if (fait?.type !== 'apporteur_statut_modifie' || !charge.success) {
      return nonRendue('charge_illisible');
    }
    const motif = charge.data.resiliationMotif;
    if (motif === undefined || d.dateEffet === null || d.dateReception === null) {
      return nonRendue('charge_illisible');
    }
    const candidats: Record<string, string | undefined> = {
      dateEffet: dateEnClair(d.dateEffet),
      dateReception: dateEnClair(d.dateReception),
      motif: texte,
    };
    const parametres: Record<string, string> = {};
    for (const p of parametresDe('resiliation', motif)) {
      const v = candidats[p];
      if (v === undefined) return nonRendue('faits_non_conserves');
      parametres[p] = v;
    }
    return s.composer(n.cle, rendreLaNotification(n.cle, parametres, motif));
  } catch (e) {
    if (e instanceof NotificationRefusee) return nonRendue('parametre_refuse');
    throw e;
  }
}
