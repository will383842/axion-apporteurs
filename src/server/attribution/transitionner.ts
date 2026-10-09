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
 *      d'attente quitte la ligne avec la file ; à l'entrée dans un état LIBÉRÉ, `purge_contact_at` est
 *      posé par `echeanceDePurge(vers, maintenant)` (DM-48, REQ-DM-031) ;
 *   4. l'événement `attribution_etat_modifie` est écrit par l'écrivain unique du journal ;
 *   5. DM-55 : une DÉCISION notifiée à l'apporteur écrit sa notification de l'espace, qui nomme cet
 *      événement (et l'anomalie confirmée qui la fonde) ; son courriel part APRÈS le commit, par le
 *      passage d'envoi des notifications de l'espace.
 *
 * CE QU'IL NE DÉCIDE PAS : quand une transition a lieu. Les passages planifiés (péremption, file,
 * confirmation tacite) et les déclencheurs (Qualification, devis, condition suspensive) sont à leurs
 * tâches ; ils appellent ce module.
 */
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  ErreurTransitionAttribution,
  type CritereDAnteriorite,
  type MotifAnnulationConsole,
  type MotifListeNoire,
  NAISSANCES_ATTRIBUTION,
  codeDeCaducite,
  effetsDeTransition,
  transitionnerAttribution,
  type EtatAttribution,
  type TransitionAttribution,
  type TypePorteur,
  EXCEPTION_DE_LA_TRANSITION,
  fondeeSurUneAnomalie,
  type ExceptionAnnulation,
} from '../../domain/attribution/machine';
import {
  attributionDeLaCommande,
  finDuContratDeLaSortie,
  type OccupationDeLEntreprise,
} from '../../domain/apporteur/effets-de-la-fin';
import { minuitDeParisDuJour } from '../../domain/apporteur/resiliation';
import { ajouterEvenement } from '../evenement/journal';
import { annulerLaDemandeDe } from '../confirmation/demandes';
import { ETATS_LIBERES, echeanceDePurge } from '../taches/purger-contacts';
import { ETATS_OCCUPANTS } from '../../domain/attribution/etats';
import { MOTIFS_DES_DECISIONS } from '../../content/micro-copy/courriels/notifications';

type Tx = Prisma.TransactionClient;
type Acteur = { par: 'systeme' } | { par: 'apporteur' | 'utilisateur_console'; id: string };

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

/** Le domaine compte en instants ; la base, en dates. */
const instant = (d: Date | null): number | null => (d === null ? null : d.getTime());
const date = (i: number | null): Date | null => (i === null ? null : new Date(i));

const porteurDe = (l: Ligne): TypePorteur => (l.apporteur_id === null ? 'conseiller' : 'apporteur');
const lienDe = (l: Ligne) => (l.lien_interet_declare ? 'declare' : 'non_declare');

/** DM-67 : le fait fondateur de l'antériorité — sa nature, l'EMPREINTE de son identifiant, sa date. */
export type FaitFondateur = {
  readonly nature: 'facture' | 'devis';
  readonly ref: string;
  readonly le: string;
};

/** Un identifiant d'axion-ia : un UUID, aléatoire et non séquentiel (`@default(uuid())` côté axion-ia). */
const IDENTIFIANT_AXIONIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DM-25 — LA référence du fait fondateur d'`anteriorite_etablie` (voie (a) d'A02, #731, 5984318182,
 * arbitrée par la coordination) : un SHA-256 hexadécimal, SANS clé, de
 * « partners.anteriorite.v1|<nature>|<id> », où `id` est l'identifiant OPAQUE de la pièce dans
 * axion-ia (`devisId`, `factureId`), à l'octet. Jamais le numéro, le client ni le SIREN. Un id qui
 * n'est pas un UUID est refusé, nommé : une empreinte sans clé ne vaut que sur un id non énumérable.
 */
export function refDuFaitFondateur(nature: FaitFondateur['nature'], id: string): string {
  if (!IDENTIFIANT_AXIONIA.test(id)) {
    throw new ErreurTransitionAttribution(
      'reference_du_fait_invalide',
      `${nature} : l'identifiant d'axion-ia n'a pas la forme d'un UUID`
    );
  }
  return createHash('sha256')
    .update(`partners.anteriorite.v1|${nature}|${id}`, 'utf8')
    .digest('hex');
}

export interface DemandeEcriture {
  readonly attributionId: string;
  readonly transition: TransitionAttribution;
  readonly acteur: Acteur;
  readonly maintenant: Date;
  /** DM-67 : exigés pour `anteriorite_etablie`, et pour elle seule. */
  readonly critere?: CritereDAnteriorite;
  readonly fait?: FaitFondateur;
  /** DM-55 : exigé pour `annulee_par_la_console`, et pour elle seule. */
  readonly motifAnnulation?: MotifAnnulationConsole;
  /** DM-55 : exigée avec le motif de l'article 3.3 bis, et lui seul. */
  readonly categorieRelation?: MotifListeNoire;
  /**
   * DM-55 : exigée pour une transition fondée sur une anomalie (`anomalie_confirmee` ; DM-71 :
   * `fraude_etablie`), et pour elles seules. Elle va à la NOTIFICATION, jamais
   * à la charge du journal (décision (d) de la juriste pour DM-12).
   */
  readonly anomalieId?: string;
  /**
   * DM-73 : l'instant de la SIGNATURE de la commande, exigé pour `confirmee_par_la_commande`, et pour
   * elle seule. `confirmee_at` et la fenêtre courent de lui, jamais du passage.
   */
  readonly confirmeeLe?: Date;
}

/**
 * DM-67 (lentille sécurité) : `anteriorite_etablie` porte son critère et son fait fondateur, et n'est
 * émise que par le SYSTÈME — le passage quotidien de l'antériorité, sur les faits projetés. Jugé AVANT
 * tout verrou et toute écriture : un refus ne laisse rien.
 */
function jugerLAnteriorite(demande: DemandeEcriture): void {
  const { transition, critere, fait, acteur } = demande;
  const anteriorite = transition === 'anteriorite_etablie';
  if (anteriorite !== (critere !== undefined) || anteriorite !== (fait !== undefined)) {
    throw new ErreurTransitionAttribution(
      'critere_incoherent',
      `${transition} : le critère et le fait sont exigés pour anteriorite_etablie, et pour elle seule`
    );
  }
  if (anteriorite && acteur.par !== 'systeme') {
    throw new ErreurTransitionAttribution(
      'acteur_refuse',
      `anteriorite_etablie : émise par le système seul, refusée à ${acteur.par}`
    );
  }
}

/**
 * DM-55 : le motif, sa catégorie et l'anomalie accompagnent leur transition, et elle seule. Jugé
 * AVANT tout verrou : un refus ne laisse rien.
 */
/**
 * DM-71 (art. 3.3 du v2) : une exception d'annulation après la confirmation est un geste HUMAIN. Son
 * acteur est un utilisateur de la console, jamais le système ; son exception se DÉRIVE de la
 * transition, jamais de l'appelant. Jugé AVANT tout verrou : un refus ne laisse rien.
 */
function exceptionHumaine(demande: DemandeEcriture): ExceptionAnnulation | undefined {
  const exception = (EXCEPTION_DE_LA_TRANSITION as Partial<Record<string, ExceptionAnnulation>>)[
    demande.transition
  ];
  if (exception !== undefined && demande.acteur.par !== 'utilisateur_console') {
    throw new ErreurTransitionAttribution(
      'acteur_refuse',
      `${demande.transition} : une exception de l'art. 3.3 est un geste humain de la console`
    );
  }
  return exception;
}

/** L'auteur humain du marqueur : l'utilisateur de la console du geste (jugé par `exceptionHumaine`). */
const acteurHumain = (acteur: Acteur): string => (acteur as { id: string }).id;

function jugerLeMotif(demande: DemandeEcriture): void {
  const { transition, motifAnnulation, categorieRelation, anomalieId } = demande;
  if (
    (transition === 'annulee_par_la_console') !== (motifAnnulation !== undefined) ||
    (motifAnnulation === 'entreprise_relevant_de_l_article_3_3_bis') !==
      (categorieRelation !== undefined)
  ) {
    throw new ErreurTransitionAttribution(
      'motif_incoherent',
      `${transition} : le motif est exigé pour annulee_par_la_console seule, la catégorie pour l'article 3.3 bis seul`
    );
  }
  if ((transition === 'confirmee_par_la_commande') !== (demande.confirmeeLe !== undefined)) {
    throw new ErreurTransitionAttribution(
      'motif_incoherent',
      `${transition} : la date de signature est exigée pour confirmee_par_la_commande, et pour elle seule`
    );
  }
  if (fondeeSurUneAnomalie(transition) !== (anomalieId !== undefined)) {
    throw new ErreurTransitionAttribution(
      'anomalie_refusee',
      `${transition} : l'anomalie est exigée pour une transition fondée sur une anomalie, et pour elle seule`
    );
  }
}

/**
 * DM-55 (sécurité, juriste) : sous le verrou, l'erreur de saisie de la Société n'annule que la prise en
 * charge d'un CONSEILLER ; l'anomalie qui fonde une invalidation est CONFIRMÉE, de CETTE attribution et
 * du MÊME apporteur. Sinon un refus nommé, et rien n'est écrit.
 */
async function jugerSousLeVerrou(tx: Tx, demande: DemandeEcriture, l: Ligne): Promise<void> {
  // DM-25 (juriste) : l'antériorité ne se fonde que sur un fait ANTÉRIEUR au dépôt — la règle de fond
  // est tenue à l'écriture même. Un fait daté du dépôt, ou après lui, n'annule rien.
  if (demande.fait !== undefined) {
    const depot = await tx.attribution.findUnique({
      where: { id: demande.attributionId },
      select: { deposeeAt: true },
    });
    if (depot === null || new Date(demande.fait.le).getTime() >= depot.deposeeAt.getTime()) {
      throw new ErreurTransitionAttribution(
        'fait_posterieur_au_depot',
        'anteriorite_etablie : le fait fondateur ne précède pas le dépôt'
      );
    }
  }
  if (
    demande.motifAnnulation === 'erreur_de_saisie_de_la_societe' &&
    porteurDe(l) !== 'conseiller'
  ) {
    throw new ErreurTransitionAttribution(
      'porteur_refuse',
      "erreur_de_saisie_de_la_societe : réservée à la prise en charge d'un conseiller"
    );
  }
  if (demande.anomalieId === undefined) return;
  const a = await tx.anomalie.findUnique({
    where: { id: demande.anomalieId },
    select: { statut: true, type: true, attributionId: true, apporteurId: true },
  });
  if (
    a === null ||
    a.statut !== 'confirmee' ||
    // DM-71 (sécurité, #815) : une fraude ne se fonde que sur une anomalie de SINCÉRITÉ, comme le gel
    // de SEC-15 ; une anomalie d'auto-parrainage confirmée ne la fonde jamais.
    (demande.transition === 'fraude_etablie' && a.type !== 'sincerite') ||
    a.attributionId !== demande.attributionId ||
    a.apporteurId !== l.apporteur_id
  ) {
    throw new ErreurTransitionAttribution(
      'anomalie_refusee',
      `${demande.transition} : l'anomalie n'est pas confirmée, sur cette attribution, pour ce porteur`
    );
  }
}

/** Les transitions qui sont une DÉCISION notifiée à l'apporteur (`decision_attribution`). */
const estUneDecisionNotifiee = (t: TransitionAttribution): boolean =>
  Object.hasOwn(MOTIFS_DES_DECISIONS, t);

const occupe = (e: EtatAttribution): boolean =>
  (ETATS_OCCUPANTS as readonly EtatAttribution[]).includes(e);

/**
 * DM-55 (REQ-DM-004, art. 3.5 al. 2) : l'attribution qui QUITTE l'occupation libère le SIREN. Le
 * premier rang en attente est notifié — sur SA ligne, à SON apporteur —, avec l'événement de la
 * libération. Sa fenêtre de redéclaration n'est PAS posée ici : elle court de l'envoi effectif du
 * courriel, posée par le passage d'envoi.
 */
async function notifierLePremierRang(
  tx: Tx,
  attributionId: string,
  evenementId: bigint
): Promise<void> {
  const libere = await tx.attribution.findUnique({
    where: { id: attributionId },
    select: { siren: true },
  });
  if (libere === null) return;
  const rang1 = await tx.attribution.findFirst({
    where: { siren: libere.siren, statut: 'en_attente', rangAttente: 1 },
    select: { id: true, apporteurId: true },
  });
  if (rang1 === null || rang1.apporteurId === null) return;
  await tx.notificationEspace.create({
    data: {
      apporteurId: rang1.apporteurId,
      cle: 'premier_rang_libere',
      attributionId: rang1.id,
      evenementId,
    },
  });
}

/** Une transition d'une attribution EXISTANTE. Rend l'état de départ et d'arrivée. */
export async function transitionnerUneAttribution(
  tx: Tx,
  demande: DemandeEcriture
): Promise<{ de: EtatAttribution; vers: EtatAttribution }> {
  const { attributionId, transition, acteur, maintenant, critere, fait } = demande;
  const { motifAnnulation, categorieRelation, anomalieId } = demande;
  jugerLAnteriorite(demande);
  jugerLeMotif(demande);
  const exception = exceptionHumaine(demande);
  const l = await verrouiller(tx, attributionId);
  const de = l.statut;
  const vers = transitionnerAttribution({ de, transition, porteur: porteurDe(l) });
  await jugerSousLeVerrou(tx, demande, l);
  const t = effetsDeTransition(
    {
      premierContactAt: instant(l.premier_contact_at),
      peremptionSuspendueAt: instant(l.peremption_suspendue_at),
      confirmeeAt: instant(l.confirmee_at),
      fenetreFinAt: instant(l.fenetre_fin_at),
      peremptionAt: instant(l.peremption_at),
    },
    transition,
    vers,
    maintenant.getTime(),
    (demande.confirmeeLe ?? maintenant).getTime()
  );
  await tx.attribution.update({
    where: { id: attributionId },
    data: {
      statut: vers,
      ...(de === 'en_attente' ? { rangAttente: null } : {}),
      confirmeeAt: date(t.confirmeeAt),
      fenetreFinAt: date(t.fenetreFinAt),
      peremptionAt: date(t.peremptionAt),
      ...((ETATS_LIBERES as readonly EtatAttribution[]).includes(vers)
        ? { purgeContactAt: echeanceDePurge(vers, maintenant) }
        : {}),
      // DM-71 : une exception humaine pose son marqueur et son auteur dans la MÊME écriture que
      // l'annulation ; la base refuse toute autre annulation après la confirmation.
      ...(exception === undefined
        ? {}
        : { annulationException: exception, annulationParId: acteurHumain(acteur) }),
    },
  });
  const inscrit = await ajouterEvenement(tx, {
    type: 'attribution_etat_modifie',
    agregat: 'attribution',
    agregatId: attributionId,
    survenuAt: maintenant,
    charge: {
      de,
      vers,
      transition,
      acteur,
      lienInteret: lienDe(l),
      ...(critere !== undefined ? { critere } : {}),
      ...(fait !== undefined ? { fait } : {}),
      ...(motifAnnulation !== undefined ? { motifAnnulation } : {}),
      ...(categorieRelation !== undefined ? { categorieRelation } : {}),
      ...(exception !== undefined ? { exception } : {}),
    },
  });
  // DM-55 : la notification de la décision, dans la MÊME transaction. L'erreur de saisie de la
  // Société ne notifie rien : elle ne vaut que pour un conseiller, qui n'a pas d'espace.
  if (l.apporteur_id !== null && estUneDecisionNotifiee(transition)) {
    await tx.notificationEspace.create({
      data: {
        apporteurId: l.apporteur_id,
        cle: 'decision_attribution',
        attributionId,
        evenementId: BigInt(inscrit.id),
        ...(anomalieId !== undefined ? { anomalieId } : {}),
      },
    });
  }
  // DM-25 (juriste, critère d) : l'antériorité établie après coup est notifiée à l'APPORTEUR, une
  // fois, avec son événement ; pour un conseiller, la console seule.
  if (l.apporteur_id !== null && transition === 'anteriorite_etablie') {
    await tx.notificationEspace.create({
      data: {
        apporteurId: l.apporteur_id,
        cle: 'attribution_annulee_anteriorite',
        attributionId,
        evenementId: BigInt(inscrit.id),
      },
    });
  }
  if (occupe(de) && !occupe(vers)) {
    await notifierLePremierRang(tx, attributionId, BigInt(inscrit.id));
  }
  // DM-40 (HYP-W20-ANNULATION) : l'annulation de l'apporteur annule sa demande de confirmation,
  // dans la MÊME transaction ; une demande déjà envoyée fait tout tomber.
  if (transition === 'annulee_par_apporteur') {
    await annulerLaDemandeDe(tx, attributionId, acteur, maintenant);
  }
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
 * DM-73 (art. 3.2 et 12.3 du v2 ; juriste et A02, #824) : une commande SIGNÉE. Sur une `provisoire`,
 * elle la confirme — `confirmee_par_la_commande`, datée de la signature — puis `devis_signe`, dans la
 * MÊME transaction : deux faits, dans cet ordre, et aucune commande n'est refusée pour ce seul motif.
 * Ailleurs, `devis_signe` seul, jugé par la matrice : une attribution terminée ne revient pas
 * (voie (b) : le droit de la commande se désigne par `attributionDUneCommandeSignee`).
 *
 * Deux refus nommés, jugés sous le verrou, et rien n'est écrit : l'attribution n'est pas celle de
 * l'apporteur annoncé (cloisonnement, `porteur_refuse`) ; la commande est signée AVANT le dépôt de
 * l'attribution (`commande_anterieure_a_l_occupation`) — elle appartient à l'occupant d'alors, et
 * l'occupant suivant ne la reçoit jamais : aucune double commission (art. 4.4, condition 3).
 */
export async function enregistrerLaCommandeSignee(
  tx: Tx,
  demande: Omit<DemandeEcriture, 'transition' | 'confirmeeLe'> & {
    signeLe: Date;
    /** L'apporteur pour qui la commande est enregistrée ; nul pour un conseiller. */
    apporteurId: string | null;
  }
): Promise<{ de: EtatAttribution; vers: EtatAttribution }> {
  const { signeLe, apporteurId, ...reste } = demande;
  const l = await verrouiller(tx, demande.attributionId);
  const de = l.statut;
  if (l.apporteur_id !== apporteurId) {
    throw new ErreurTransitionAttribution(
      'porteur_refuse',
      "commande signée : l'attribution n'est pas celle de cet apporteur"
    );
  }
  const { deposeeAt } = await tx.attribution.findUniqueOrThrow({
    where: { id: demande.attributionId },
    select: { deposeeAt: true },
  });
  if (signeLe.getTime() < deposeeAt.getTime()) {
    throw new ErreurTransitionAttribution(
      'commande_anterieure_a_l_occupation',
      "commande signée avant le dépôt : elle ne profite pas à l'occupant suivant"
    );
  }
  if (de === 'provisoire') {
    await transitionnerUneAttribution(tx, {
      ...reste,
      transition: 'confirmee_par_la_commande',
      confirmeeLe: signeLe,
    });
  }
  const { vers } = await transitionnerUneAttribution(tx, { ...reste, transition: 'devis_signe' });
  return { de, vers };
}

/**
 * DM-73, voie (b) (juriste, #824, 6043135877) : la chaîne des commissions DÉSIGNE l'attribution — et son
 * apporteur — à qui revient une commande signée, d'après les occupations de l'entreprise lues en base :
 * le dépôt, la dernière transition au journal, et la fin du contrat (`finDuContratDeLaSortie`). La règle
 * est `attributionDeLaCommande` ; nul si aucune attribution n'y a droit. Rien n'est écrit.
 */
export async function attributionDUneCommandeSignee(
  tx: Tx,
  commande: { siren: string; signeLe: Date }
): Promise<{ attributionId: string; apporteurId: string | null } | null> {
  const lignes = await tx.attribution.findMany({
    where: { siren: commande.siren, statut: { not: 'en_attente' } },
    select: { id: true, apporteurId: true, statut: true, deposeeAt: true },
  });
  const occupations: OccupationDeLEntreprise[] = [];
  for (const a of lignes) {
    const dernier = await tx.evenement.findFirst({
      where: { agregat: 'attribution', agregatId: a.id, type: 'attribution_etat_modifie' },
      orderBy: { id: 'desc' },
      select: { charge: true, survenuAt: true },
    });
    const transition = (dernier?.charge as { transition?: TransitionAttribution } | null)
      ?.transition;
    const finie = !occupe(a.statut) || transition === 'figee';
    // Une attribution finie sans transition au journal n'a droit à rien.
    if (finie && transition === undefined) continue;
    const sortie = finie ? transition! : null;
    let finDuContrat: number | null = null;
    if (dernier && a.apporteurId !== null && (sortie === 'figee' || sortie === 'fin_de_contrat')) {
      const decision = await tx.decisionDeContrat.findFirst({
        where: { apporteurId: a.apporteurId, geste: 'resiliation' },
        orderBy: { creeAt: 'desc' },
        select: { dateEffet: true },
      });
      finDuContrat = finDuContratDeLaSortie({
        sortieAt: dernier.survenuAt.getTime(),
        jourDEffet:
          decision?.dateEffet == null
            ? null
            : minuitDeParisDuJour(decision.dateEffet.toISOString().slice(0, 10)),
      });
    }
    occupations.push({
      attributionId: a.id,
      occupeeDepuis: a.deposeeAt.getTime(),
      sortie,
      finDuContrat,
    });
  }
  const id = attributionDeLaCommande(commande.signeLe.getTime(), occupations);
  if (id === null) return null;
  return { attributionId: id, apporteurId: lignes.find((a) => a.id === id)!.apporteurId };
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
  const transition = codeDeCaducite(l.fenetre_fin_at.getTime(), demande.maintenant.getTime());
  return { vers: (await transitionnerUneAttribution(tx, { ...demande, transition })).vers };
}
