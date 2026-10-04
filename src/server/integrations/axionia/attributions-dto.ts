/**
 * Le lecteur de l'API 1 — INT-T07-P (REQ-INT-014, REQ-SEC-042).
 *
 * Il ne fait QUE lire : la frontière (`api-entrante.ts`) authentifie, limite, juge la forme rendue
 * contre le contrat et reconstruit le corps champ par champ. Ce module rend la forme minimale, ou
 * `null` quand aucune attribution n'occupe le SIREN (la frontière rend alors « libre »).
 *
 * L'ARBITRAGE DE LA COORDINATION (#561, 2026-10-04) :
 *   — le STATUT se lit dans la seule attribution qui OCCUPE le SIREN (`ETATS_OCCUPANTS`) :
 *     `convertie` rend `cliente`, tout autre état occupant `attribuee` ; aucune attribution
 *     occupante, `null`. L'API 1 ne parle que des attributions de Partners : une entreprise connue
 *     par antériorité n'est jamais rendue `cliente` ici ;
 *   — `until` est le mois, à Paris, de la fin de fenêtre si elle est posée, sinon de la
 *     péremption ; `null` pour `cliente` ;
 *   — `apporteurRef` est un UUID DÉRIVÉ par HMAC, sous une clé dédiée, de l'identifiant du porteur :
 *     stable pour un même porteur, de même forme pour un apporteur et pour un conseiller salarié
 *     (W19), et sans lien lisible avec un identifiant interne ;
 *   — `nomAffichable` est le prénom et l'initiale du nom d'un apporteur, ou, pour un conseiller
 *     (dont la fiche ne porte qu'un nom), le premier mot de son nom et l'initiale du dernier — la
 *     même forme, sans mention de rôle.
 *
 * MÊME TRAVAIL POUR LES DEUX POPULATIONS (W19, clause jumelle de QA-T31) : une seule lecture,
 * qui sélectionne les deux porteurs possibles, quel que soit celui qui occupe ; aucune branche,
 * lecture ni appel propre à la Société avant la réponse.
 *
 * RIEN DU NOM NE SORT D'ICI AILLEURS QUE DANS LA RÉPONSE. Ni journal, ni message d'erreur : un bloc
 * illisible lève une erreur que la frontière rend en 503 sans en écrire le message. Un nom qui ne
 * tient pas la forme du contrat (un chiffre, une arobase) n'est pas rendu : `null`.
 */
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ETATS_OCCUPANTS } from '../../../domain/attribution/etats';
import { versParis } from '../../../domain/temps/paris';
import { clesPii, decryptPii, type ClesPii } from '../../securite/pii';
import { MODELE_APPORTEUR, MODELE_UTILISATEUR_CONSOLE } from '../../auth/lien-magique-depot';
import type { LecteurDAttribution, ReponseAttribution } from './api-entrante';

/** La variable qui porte la clé de dérivation des références (nom PROVISOIRE, en revue sécurité). */
export const VARIABLE_CLE_REFERENCE = 'APPORTEUR_REF_HMAC_CLE';

/** 32 octets au moins, comme les autres secrets HMAC du dépôt. */
const LONGUEUR_MIN_CLE = 32;

/** La forme d'un nom d'affichage : celle du contrat (`api_attributions_reponse`). */
const FORME_NOM = /^[\p{L}][\p{L} '’.-]{0,63}$/u;

export interface DependancesDuLecteur {
  readonly cles: ClesPii;
  /** La clé de dérivation des références opaques. */
  readonly cleReference: string;
}

// ── Les dérivations ─────────────────────────────────────────────────────────────────────────────

/**
 * La référence opaque d'un porteur : HMAC-SHA256 sous la clé dédiée, séparé par domaine, mis en
 * forme d'UUID (version 4, variante RFC 4122). Une clé absente ou trop courte lève : jamais une
 * référence dérivée d'une clé faible.
 */
export function referenceOpaque(idPorteur: string, cle: string): string {
  if (cle.length < LONGUEUR_MIN_CLE) {
    throw new Error('cle_reference : absente ou trop courte');
  }
  const h = createHmac('sha256', cle)
    .update(`partners.apporteur-ref.v1\u001f${idPorteur}`, 'utf8')
    .digest();
  h[6] = (h[6]! & 0x0f) | 0x40;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const mots = (texte: string | null): string[] => (texte ?? '').trim().split(/\s+/u).filter(Boolean);

/** Une initiale, en majuscule, suivie d'un point. */
const initiale = (mot: string): string => `${[...mot][0]!.toLocaleUpperCase('fr-FR')}.`;

/** Le nom rendu, s'il tient la forme du contrat ; sinon rien. */
const sousLaForme = (nom: string): string | null => (FORME_NOM.test(nom) ? nom : null);

/**
 * Le nom d'affichage d'un apporteur : le prénom, puis l'initiale du nom de famille. Sans
 * prénom, rien : une initiale seule n'est pas un nom d'affichage.
 */
export function nomAffichable(prenom: string | null, nom: string | null): string | null {
  const p = mots(prenom);
  if (p.length === 0) return null;
  const premier = mots(nom)[0];
  return sousLaForme(premier === undefined ? p.join(' ') : `${p.join(' ')} ${initiale(premier)}`);
}

/** Le nom d'affichage d'un conseiller : le premier mot de son nom, puis l'initiale du dernier. */
export function nomAffichableDuConseiller(nom: string | null): string | null {
  const n = mots(nom);
  if (n.length === 0) return null;
  return n.length === 1 ? nomAffichable(n[0]!, null) : nomAffichable(n[0]!, n[n.length - 1]!);
}

/** Le mois `AAAA-MM`, à Paris, d'un instant. */
export function moisAParis(instant: Date): string {
  const d = versParis(instant.getTime());
  return `${String(d.annee).padStart(4, '0')}-${String(d.mois).padStart(2, '0')}`;
}

// ── Le lecteur ──────────────────────────────────────────────────────────────────────────────────

const dechiffrer = (
  modele: string,
  champ: string,
  id: string,
  bloc: Uint8Array | null,
  cles: ClesPii
): string | null => (bloc === null ? null : decryptPii({ modele, champ, id }, bloc, cles));

/** Le lecteur de l'API 1 sur la base : une seule lecture, la même quel que soit le porteur. */
export function lecteurDeLaBase(
  prisma: Pick<PrismaClient, 'attribution'>,
  d: DependancesDuLecteur
): LecteurDAttribution {
  return async (siren): Promise<ReponseAttribution | null> => {
    const a = await prisma.attribution.findFirst({
      where: { siren, statut: { in: [...ETATS_OCCUPANTS] } },
      select: {
        statut: true,
        fenetreFinAt: true,
        peremptionAt: true,
        apporteur: { select: { id: true, prenomChiffre: true, nomChiffre: true } },
        utilisateurConsole: { select: { id: true, nomChiffre: true } },
      },
    });
    if (a === null) return null;

    let idPorteur: string;
    let nom: string | null;
    if (a.apporteur !== null) {
      const { id, prenomChiffre, nomChiffre } = a.apporteur;
      idPorteur = id;
      nom = nomAffichable(
        dechiffrer(MODELE_APPORTEUR, 'prenomChiffre', id, prenomChiffre, d.cles),
        dechiffrer(MODELE_APPORTEUR, 'nomChiffre', id, nomChiffre, d.cles)
      );
    } else if (a.utilisateurConsole !== null) {
      const { id, nomChiffre } = a.utilisateurConsole;
      idPorteur = id;
      nom = nomAffichableDuConseiller(
        dechiffrer(MODELE_UTILISATEUR_CONSOLE, 'nomChiffre', id, nomChiffre, d.cles)
      );
    } else {
      // Le CHECK de la base l'interdit : une attribution a exactement un porteur.
      throw new Error('attribution_sans_porteur');
    }

    const cliente = a.statut === 'convertie';
    const fin = a.fenetreFinAt ?? a.peremptionAt;
    return {
      statut: cliente ? 'cliente' : 'attribuee',
      until: cliente || fin === null ? null : moisAParis(fin),
      apporteurRef: referenceOpaque(idPorteur, d.cleReference),
      nomAffichable: nom,
    };
  };
}

let client: PrismaClient | undefined;

/**
 * Le lecteur de production. Les clés sont relues À CHAQUE APPEL, par le même juge que le
 * démarrage : un environnement refusé, ou une clé de référence absente, lève — la frontière rend
 * 503, jamais « libre » (échec fermé).
 */
export const lecteurDeProduction: LecteurDAttribution = async (siren) => {
  client ??= new PrismaClient();
  return lecteurDeLaBase(client, {
    cles: clesPii(process.env),
    cleReference: process.env[VARIABLE_CLE_REFERENCE] ?? '',
  })(siren);
};
