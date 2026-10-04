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
  MOIS_EN_TOUTES_LETTRES,
  MOTIFS_DES_DECISIONS,
  RAISONS_D_ANNULATION,
} from '../../content/micro-copy/courriels/notifications';
import {
  finDeLaFenetreDeRedeclaration,
  jourLimiteDeLaFenetre,
} from '../../domain/attribution/fenetre-redeclaration';
import type { Instant } from '../../domain/temps/horloge';
import { versParis } from '../../domain/temps/paris';

export type DecisionNotifiee = keyof typeof MOTIFS_DES_DECISIONS;
export type RaisonDAnnulation =
  keyof typeof RAISONS_D_ANNULATION | 'erreur_de_saisie_de_la_societe';

export type Decision = {
  transition: string;
  faits?: string;
  raison?: RaisonDAnnulation;
  categorie?: string;
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
      : RAISONS_D_ANNULATION[raison].replace('{categorie}', () => categorie ?? '');
  return MOTIFS_DES_DECISIONS[transition]
    .replace('{faits}', () => faits ?? '')
    .replace('{raison}', () => libelle);
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
