/**
 * Les notifications de la machine (DM-55, REQ-DM-006, REQ-DM-004, REQ-UX-016) — le rendu de leurs
 * paramètres.
 *
 * `decision_attribution` porte l'entreprise et le MOTIF de la décision ; `premier_rang_libere`, l'entreprise
 * et la date limite. Les textes sont ceux de la juriste, mot pour mot, dans la micro-copie : ce module
 * ne fait que les choisir et les remplir.
 *
 * SÉCURITÉ (rattrapage 64) : `{faits}` est refusé s'il porte un lien, ou les mots « fraude »,
 * « anomalie » ou « sanction » (juriste) ; sans nom de tiers, ce que le texte de la mesure tient à sa
 * saisie. Une valeur vide est refusée. Un refus lève, nommé : la notification ne part pas à moitié.
 */
import {
  ENTREPRISE_DE_REPLI,
  LIBELLES_DES_CATEGORIES,
  MOIS_EN_TOUTES_LETTRES,
  MOTIFS_DES_DECISIONS,
  RAISONS_D_ANNULATION,
} from '../../content/micro-copy/courriels/notifications';
import {
  finDeLaFenetreDeRedeclaration,
  jourLimiteDeLaFenetre,
} from '../../domain/attribution/fenetre-redeclaration';
import type { Instant } from '../../domain/temps/horloge';
import type { Prisma } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import {
  NotificationRefusee,
  rendreLaNotification,
  type TexteRendu,
} from '../notifications/envoyer';
import { versParis } from '../../domain/temps/paris';

export type DecisionNotifiee = keyof typeof MOTIFS_DES_DECISIONS;
export type RaisonDAnnulation =
  keyof typeof RAISONS_D_ANNULATION | 'erreur_de_saisie_de_la_societe';

export type Decision = {
  transition: string;
  faits?: string;
  raison?: RaisonDAnnulation;
  categorie?: keyof typeof LIBELLES_DES_CATEGORIES;
};

const LIEN = /https?:\/\/|www\.|\b[\w-]+\.(?:fr|com|net|org|io|test|eu)\b/i;
const MOTS_INTERDITS = /\b(?:fraude|anomalie|sanction)s?\b/i;

class MotifRefuse extends Error {
  constructor(code: 'motif_incoherent' | 'faits_refuses', detail: string) {
    super(`${code} : ${detail}`);
    this.name = 'MotifRefuse';
  }
}

const estUneDecision = (t: string): t is DecisionNotifiee => Object.hasOwn(MOTIFS_DES_DECISIONS, t);

/**
 * Le motif d'une décision, rendu ; `null` quand la décision ne se notifie pas à l'apporteur
 * (`erreur_de_saisie_de_la_societe`, réservé à la prise en charge d'un conseiller).
 */
export function motifDeLaDecision(d: Decision): string | null {
  const { transition, faits, raison, categorie } = d;
  if (!estUneDecision(transition)) {
    throw new MotifRefuse('motif_incoherent', `${transition} n'est pas une décision notifiée`);
  }
  if ((transition === 'anomalie_confirmee') !== (faits !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `faits sur ${transition}`);
  }
  if ((transition === 'annulee_par_la_console') !== (raison !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `raison sur ${transition}`);
  }
  if ((raison === 'entreprise_relevant_de_l_article_3_3_bis') !== (categorie !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `catégorie avec la raison ${String(raison)}`);
  }
  if (
    faits !== undefined &&
    (faits.trim() === '' || LIEN.test(faits) || MOTS_INTERDITS.test(faits))
  ) {
    throw new MotifRefuse('faits_refuses', 'un lien, un mot interdit ou une valeur vide');
  }
  if (raison === 'erreur_de_saisie_de_la_societe') return null;
  const libelle =
    raison === undefined
      ? ''
      : RAISONS_D_ANNULATION[raison].replace('{categorie}', () =>
          categorie === undefined ? '' : LIBELLES_DES_CATEGORIES[categorie]
        );
  return MOTIFS_DES_DECISIONS[transition]
    .replace('{faits}', () => faits ?? '')
    .replace('{raison}', () => libelle);
}

/**
 * Le nom de l'entreprise : sa raison sociale, ou, SEULEMENT si elle est absente, le repli de la
 * juriste avec le numéro saisi au dépôt.
 */
export function entrepriseDeLaNotification(
  raisonSociale: string | null,
  numeroEntreprise: string
): string {
  const nom = raisonSociale?.trim() ?? '';
  return nom === ''
    ? ENTREPRISE_DE_REPLI.replace('{numeroEntreprise}', () => numeroEntreprise)
    : nom;
}

/** Une date en clair, au jour civil de Paris : « 25 mai 2027 ». */
export function dateEnClair(instant: Instant | Date): string {
  const { annee, mois, jour } = versParis(instant instanceof Date ? instant.getTime() : instant);
  return `${jour} ${MOIS_EN_TOUTES_LETTRES[mois - 1]} ${annee}`;
}

/** Les paramètres d'une clé de la machine, EXACTEMENT ceux de ses textes. */
export function parametresDeLaNotification(
  cle: string,
  c: { entreprise: string; motif?: string; envoyeLe: Date }
): Record<string, string> {
  if (cle === 'decision_attribution') {
    if (c.motif === undefined) throw new Error('motif_manquant : decision_attribution sans motif');
    return { entreprise: c.entreprise, motif: c.motif };
  }
  if (cle === 'premier_rang_libere') {
    const { annee, mois, jour } = jourLimiteDeLaFenetre(
      finDeLaFenetreDeRedeclaration(c.envoyeLe.getTime())
    );
    return {
      entreprise: c.entreprise,
      dateLimite: `${jour} ${MOIS_EN_TOUTES_LETTRES[mois - 1]} ${annee}`,
    };
  }
  throw new Error(`cle_hors_passage : ${cle}`);
}

// ── Le rendu depuis la base, à l'heure de l'envoi (passage de DM-55) ───────────────────────────────

/**
 * Les motifs FERMÉS d'un non-rendu (lentille sécurité) : la notification ne part pas, et le passage
 * nomme le motif à son bilan, sans contenu — la console peut informer autrement.
 */
export const MOTIFS_DE_NON_RENDU = [
  'fait_introuvable',
  'charge_illisible',
  'attribution_introuvable',
  'apporteur_different',
  'anomalie_refusee',
  'faits_non_conserves',
  'faits_refuses',
  'decision_non_notifiee',
  'parametre_refuse',
] as const;
export type MotifDeNonRendu = (typeof MOTIFS_DE_NON_RENDU)[number];

/** Ce que le rendu lit d'une notification. */
export type NotificationARendre = {
  cle: string;
  apporteurId: string;
  attributionId: string | null;
  evenementId: string | null;
  anomalieId: string | null;
};

type Tx = Prisma.TransactionClient;

/**
 * Les sources du rendu, branchées par le passage : la charge de l'événement (par l'écrivain unique du
 * journal), les faits d'une anomalie (par le lecteur unique de la justification, qui revérifie le
 * triplet) et la composition du courriel (celle de `notifier()`).
 */
export type SourcesDuRendu = {
  chargeDuFait(tx: Tx, evenementId: string): Promise<unknown>;
  faitsDe(
    tx: Tx,
    q: { anomalieId: string; attributionId: string; apporteurId: string }
  ): Promise<{ faits: string } | 'purgee' | 'refusee'>;
  composer(cle: string, texte: TexteRendu): { sujet: string; corps: string };
};

const nonRendue = (motif: MotifDeNonRendu) => ({ nonRendue: motif });

/** Le motif d'une décision, lu dans la charge de SON événement (et, pour une anomalie, ses faits). */
async function motifDuFait(
  tx: Tx,
  n: NotificationARendre & { attributionId: string },
  s: SourcesDuRendu
): Promise<{ motif: string } | { nonRendue: MotifDeNonRendu }> {
  if (n.evenementId === null) return nonRendue('fait_introuvable');
  const brute = await s.chargeDuFait(tx, n.evenementId);
  if (brute === null || brute === undefined) return nonRendue('fait_introuvable');
  const lue = CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse(brute);
  if (!lue.success) return nonRendue('charge_illisible');
  const { transition, motifAnnulation, categorieRelation } = lue.data;
  let faits: string | undefined;
  if (transition === 'anomalie_confirmee') {
    // Sans lien (vidé par la purge ou l'anonymisation), ou purgés : les faits ne sont plus conservés.
    if (n.anomalieId === null) return nonRendue('faits_non_conserves');
    const lus = await s.faitsDe(tx, {
      anomalieId: n.anomalieId,
      attributionId: n.attributionId,
      apporteurId: n.apporteurId,
    });
    if (lus === 'purgee') return nonRendue('faits_non_conserves');
    if (lus === 'refusee') return nonRendue('anomalie_refusee');
    faits = lus.faits;
  }
  try {
    const motif = motifDeLaDecision({
      transition,
      ...(faits === undefined ? {} : { faits }),
      ...(motifAnnulation === undefined ? {} : { raison: motifAnnulation }),
      ...(categorieRelation === undefined ? {} : { categorie: categorieRelation }),
    });
    return motif === null ? nonRendue('decision_non_notifiee') : { motif };
  } catch (e) {
    if (e instanceof Error && e.name === 'MotifRefuse') return nonRendue('faits_refuses');
    throw e;
  }
}

/**
 * Le texte d'une notification de la machine, rendu DEPUIS LA BASE à l'heure de l'envoi : l'entreprise
 * de l'attribution (qui doit être celle du destinataire), le motif lu dans la charge de l'événement, la
 * date limite calculée sur l'envoi. Tout manque rend un motif FERMÉ, jamais un texte à moitié.
 */
export async function rendreDepuisLaBase(
  tx: Tx,
  n: NotificationARendre,
  envoyeLe: Date,
  s: SourcesDuRendu
): Promise<{ sujet: string; corps: string } | { nonRendue: MotifDeNonRendu }> {
  if (n.attributionId === null) return nonRendue('attribution_introuvable');
  const a = await tx.attribution.findUnique({
    where: { id: n.attributionId },
    select: { apporteurId: true, raisonSociale: true, siren: true },
  });
  if (a === null) return nonRendue('attribution_introuvable');
  if (a.apporteurId !== n.apporteurId) return nonRendue('apporteur_different');
  const entreprise = entrepriseDeLaNotification(a.raisonSociale, a.siren);
  let motif: string | undefined;
  if (n.cle === 'decision_attribution') {
    const lu = await motifDuFait(tx, { ...n, attributionId: n.attributionId }, s);
    if ('nonRendue' in lu) return lu;
    motif = lu.motif;
  }
  try {
    const parametres = parametresDeLaNotification(n.cle, {
      entreprise,
      envoyeLe,
      ...(motif === undefined ? {} : { motif }),
    });
    return s.composer(n.cle, rendreLaNotification(n.cle, parametres));
  } catch (e) {
    if (e instanceof NotificationRefusee) return nonRendue('parametre_refuse');
    throw e;
  }
}
