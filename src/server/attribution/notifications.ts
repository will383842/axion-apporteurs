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
import { fondeeSurUneAnomalie } from '../../domain/attribution/machine';
import {
  ENTREPRISE_DE_REPLI,
  LIBELLES_DES_CATEGORIES,
  MOIS_EN_TOUTES_LETTRES,
  MOTIFS_DES_DECISIONS,
  RAISONS_D_ANNULATION,
} from '../../content/micro-copy/courriels/notifications';
import { NOTIFICATIONS } from '../../content/micro-copy/espace/notifications';
import {
  finDeLaFenetreDeRedeclaration,
  jourLimiteDeLaFenetre,
} from '../../domain/attribution/fenetre-redeclaration';
import type { Instant } from '../../domain/temps/horloge';
import type { Prisma } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../domain/seuils/ssot';
import { nettoyerUnTexteSaisi } from '../securite/pii';
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

/** {numeroEntreprise} : neuf chiffres, rien d'autre. */
const NUMERO_D_ENTREPRISE = /^[0-9]{9}$/;

const ECHAPPEMENTS: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * {faits} à l'ENVOI (arbitrage de la sécurité) — le seul paramètre libre, lu par le lecteur réservé :
 * les caractères de contrôle et les retours à la ligne forcés deviennent une espace, les espaces se
 * resserrent, la longueur est revérifiée en POINTS DE CODE (`FAITS_ANOMALIE_CARACTERES_MAX`) — au-delà,
 * `null` : aucun courriel, jamais une troncature —, puis le texte est échappé pour le HTML.
 */
export function faitsPourLeCourriel(brut: string): string | null {
  const propre = faitsPourLEcran(brut);
  return propre === null ? null : propre.replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]!);
}

/**
 * UX-P1-58 — {faits} pour l'ÉCRAN de l'espace (sécurité, #726, 5984213408, condition 2) : le même
 * nettoyage et la même borne qu'à l'envoi, SANS l'échappement HTML du courriel — à l'écran, React
 * échappe, et un double échappement afficherait `&amp;`. Au-delà de la borne, `null` : jamais une
 * troncature. Une seule définition, que le courriel échappe ensuite (RM-01).
 */
export function faitsPourLEcran(brut: string): string | null {
  const propre = nettoyerUnTexteSaisi(brut);
  const longueur = [...propre].length;
  if (longueur === 0 || longueur > FAITS_ANOMALIE_CARACTERES_MAX.valeur) return null;
  return propre;
}

const LIEN = /https?:\/\/|www\.|\b[\w-]+\.(?:fr|com|net|org|io|test|eu)\b/i;
const MOTS_INTERDITS = /\b(?:fraude|anomalie|sanction)s?\b/i;

/** Les refus NOMMÉS d'un texte saisi par une personne (sécurité, #703, condition 2 ; DM-55). */
export const REFUS_DES_FAITS = [
  'faits_vides',
  'faits_trop_longs',
  'faits_avec_lien',
  'faits_avec_mot_refuse',
] as const;
export type RefusDesFaits = (typeof REFUS_DES_FAITS)[number];

/** Le contenu d'un texte : vide, avec un lien, avec un mot refusé — la règle de DM-55, une fois. */
function contenuRefuse(texte: string): Exclude<RefusDesFaits, 'faits_trop_longs'> | null {
  if (texte.trim() === '') return 'faits_vides';
  if (LIEN.test(texte)) return 'faits_avec_lien';
  if (MOTS_INTERDITS.test(texte)) return 'faits_avec_mot_refuse';
  return null;
}

/**
 * LE JUGE UNIQUE des faits SAISIS par une personne — les faits d'une anomalie (DM-55), d'une mise en
 * demeure ou d'une décision motivée (SEC-19) : nettoyés comme à l'envoi, puis vides, au-delà de la
 * borne de DM-55 en points de code, avec un lien ou un mot refusé — chaque refus NOMMÉ. L'écran
 * l'appelle à la saisie ; l'émetteur, avant toute écriture.
 */
export function jugerLesFaitsSaisis(
  brut: string
): { ok: true } | { ok: false; motif: RefusDesFaits } {
  const propre = nettoyerUnTexteSaisi(brut);
  const contenu = contenuRefuse(propre);
  if (contenu === 'faits_vides') return { ok: false, motif: contenu };
  if ([...propre].length > FAITS_ANOMALIE_CARACTERES_MAX.valeur) {
    return { ok: false, motif: 'faits_trop_longs' };
  }
  return contenu === null ? { ok: true } : { ok: false, motif: contenu };
}

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
  if (fondeeSurUneAnomalie(transition) !== (faits !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `faits sur ${transition}`);
  }
  // Les paramètres fermés (arbitrage de la sécurité) : une raison ou une catégorie hors de leur liste
  // est refusée, jamais rendue.
  if (
    raison !== undefined &&
    raison !== 'erreur_de_saisie_de_la_societe' &&
    !Object.hasOwn(RAISONS_D_ANNULATION, raison)
  ) {
    throw new MotifRefuse('motif_incoherent', `raison hors de la liste`);
  }
  if (categorie !== undefined && !Object.hasOwn(LIBELLES_DES_CATEGORIES, categorie)) {
    throw new MotifRefuse('motif_incoherent', `catégorie hors de la liste`);
  }
  if ((transition === 'annulee_par_la_console') !== (raison !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `raison sur ${transition}`);
  }
  if ((raison === 'entreprise_relevant_de_l_article_3_3_bis') !== (categorie !== undefined)) {
    throw new MotifRefuse('motif_incoherent', `catégorie avec la raison ${String(raison)}`);
  }
  if (faits !== undefined && contenuRefuse(faits) !== null) {
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
  if (nom !== '') return nom;
  // {numeroEntreprise} : forme FERMÉE de neuf chiffres (arbitrage de la sécurité).
  if (!NUMERO_D_ENTREPRISE.test(numeroEntreprise)) {
    throw new Error('numero_entreprise_invalide : le numéro saisi au dépôt n’a pas neuf chiffres');
  }
  return ENTREPRISE_DE_REPLI.replace('{numeroEntreprise}', () => numeroEntreprise);
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
    return {
      entreprise: c.entreprise,
      dateLimite: dateLimiteDeLaFenetre(
        new Date(finDeLaFenetreDeRedeclaration(c.envoyeLe.getTime()))
      ),
    };
  }
  // DM-25 : l'entreprise SEULE ; {delaiReponse} vient de la SSOT, posé par l'envoi. Aucun critère
  // d'antériorité n'entre dans le texte (règle de SEC-12).
  if (cle === 'attribution_annulee_anteriorite') return { entreprise: c.entreprise };
  throw new Error(`cle_hors_passage : ${cle}`);
}

// ── Le rendu depuis la base, à l'heure de l'envoi (passage de DM-55) ───────────────────────────────

/**
 * Les motifs FERMÉS d'un non-rendu (lentille sécurité) : la notification ne part pas, et le passage
 * nomme le motif à son bilan, sans contenu — la console peut informer autrement.
 */
export const MOTIFS_DE_NON_RENDU = [
  'numero_entreprise_invalide',
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
  if (fondeeSurUneAnomalie(transition)) {
    // Sans lien (vidé par la purge ou l'anonymisation), ou purgés : les faits ne sont plus conservés.
    if (n.anomalieId === null) return nonRendue('faits_non_conserves');
    const lus = await s.faitsDe(tx, {
      anomalieId: n.anomalieId,
      attributionId: n.attributionId,
      apporteurId: n.apporteurId,
    });
    if (lus === 'purgee') return nonRendue('faits_non_conserves');
    if (lus === 'refusee') return nonRendue('anomalie_refusee');
    const nettoyes = faitsPourLeCourriel(lus.faits);
    if (nettoyes === null) return nonRendue('faits_refuses');
    faits = nettoyes;
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
  let entreprise: string;
  try {
    entreprise = entrepriseDeLaNotification(a.raisonSociale, a.siren);
  } catch {
    return nonRendue('numero_entreprise_invalide');
  }
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

/** La phrase du gabarit qui porte les faits ; purgés, la juriste la remplace (#619, 5984284097). */
const PHRASE_DES_FAITS = 'Faits retenus : {faits}';

/**
 * UX-P1-58 — le texte de `decision_attribution` pour l'ESPACE : le MÊME gabarit que le courriel
 * (juriste, #619, 5984284097, point (b)), par `motifDeLaDecision`, avec les mêmes paramètres ; une
 * seule exception, les faits purgés d'`anomalie_confirmee`, dont la phrase devient le texte fermé de
 * la juriste, posé ici par le serveur. Les faits viennent du lecteur dédié de l'espace ; ils sont
 * nettoyés et bornés pour l'écran, jamais échappés. Tout manque rend `null` : la notification n'est
 * pas affichée, jamais à moitié.
 */
export function texteDeLaDecisionDansLEspace(
  entreprise: string,
  chargeDuFait: unknown,
  faits: { faits: string } | 'purgee' | 'refusee' | null
): TexteRendu | null {
  const lue = CHARGES_PAR_TYPE.attribution_etat_modifie.safeParse(chargeDuFait);
  if (!lue.success) return null;
  const { transition, motifAnnulation, categorieRelation } = lue.data;
  let motif: string | null;
  if (fondeeSurUneAnomalie(transition) && faits === 'purgee') {
    const gabarit = MOTIFS_DES_DECISIONS[transition as 'anomalie_confirmee' | 'fraude_etablie'];
    if (gabarit.split(PHRASE_DES_FAITS).length !== 2) return null;
    motif = gabarit.replace(PHRASE_DES_FAITS, () => NOTIFICATIONS.faitsNonConserves);
  } else {
    let propres: string | undefined;
    if (fondeeSurUneAnomalie(transition)) {
      if (faits === null || faits === 'purgee' || faits === 'refusee') return null;
      const f = faitsPourLEcran(faits.faits);
      if (f === null) return null;
      propres = f;
    }
    try {
      motif = motifDeLaDecision({
        transition,
        ...(propres === undefined ? {} : { faits: propres }),
        ...(motifAnnulation === undefined ? {} : { raison: motifAnnulation }),
        ...(categorieRelation === undefined ? {} : { categorie: categorieRelation }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'MotifRefuse') return null;
      throw e;
    }
  }
  if (motif === null) return null;
  try {
    return rendreLaNotification(
      'decision_attribution',
      parametresDeLaNotification('decision_attribution', {
        entreprise,
        motif,
        envoyeLe: new Date(0),
      })
    );
  } catch (e) {
    if (e instanceof NotificationRefusee) return null;
    throw e;
  }
}

/** Le jour limite d'une fenêtre de redéclaration (borne exclusive), en clair, à Paris. */
function dateLimiteDeLaFenetre(finAt: Date): string {
  const { annee, mois, jour } = jourLimiteDeLaFenetre(finAt.getTime());
  return `${jour} ${MOIS_EN_TOUTES_LETTRES[mois - 1]} ${annee}`;
}

/**
 * Le texte de `premier_rang_libere` pour l'ESPACE (juriste, critère a) : `{dateLimite}` est le jour
 * de la fenêtre POSÉE (`fenetreRedeclarationFinAt`), celle que le courriel a fait courir — jamais un
 * recalcul. Tant qu'elle est NULLE, le courriel n'est pas parti, aucun délai ne court, et aucun texte
 * daté n'existe : `null`. L'écran de l'espace a sa propre tâche ; ce texte est sa seule source.
 */
export function texteDuPremierRangDansLEspace(
  entreprise: string,
  fenetreRedeclarationFinAt: Date | null
): TexteRendu | null {
  if (fenetreRedeclarationFinAt === null) return null;
  return rendreLaNotification('premier_rang_libere', {
    entreprise,
    dateLimite: dateLimiteDeLaFenetre(fenetreRedeclarationFinAt),
  });
}
