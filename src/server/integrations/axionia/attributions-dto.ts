/**
 * Le lecteur de l'API 1 — INT-T07-P (REQ-INT-014).
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
 *   — une `cliente` garde son porteur (décision B de Williams : « Apportée par Paul » sur la fiche
 *     client) : `apporteurRef` et `nomAffichable`, et `until` nul (conditions d'A02, PR 710,
 *     commentaire 5981840348, posées en `if`/`then` au contrat) ;
 *   — `until` est le mois, à Paris, de la fin de fenêtre si elle est posée, sinon de la
 *     péremption, pour une `attribuee` ; nul pour une `provisoire`, qui n'a pas encore de fin, et
 *     nul avec l'alerte `echeance_indisponible` (`{ etat }`) pour un état confirmé sans fin ;
 *   — un porteur sans nom lisible rend `nomAffichable` nul et lève l'alerte technique
 *     `nom_affichable_indisponible` (`{ genre, nombre }`, rien d'autre) ;
 *   — `apporteurRef` est un UUID DÉRIVÉ par HMAC, sous une clé dédiée, de l'identifiant du porteur :
 *     stable pour un même porteur, de même forme pour un apporteur et pour un conseiller salarié
 *     (W19), et sans lien lisible avec un identifiant interne. La revue sécurité (A09, #561) en a
 *     fixé la clé (`APPORTEUR_REF_KEY`, à elle seule, hors rotation courante) et la dérivation
 *     (séparée par population : un `apporteurId` et un `utilisateurConsoleId` ne donnent jamais
 *     la même référence). Partners ne stocke pas la correspondance : il la recalcule ;
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
import { API_ATTRIBUTIONS } from '../../../../packages/contracts/api';
import { ETATS_OCCUPANTS } from '../../../domain/attribution/etats';
import { versParis } from '../../../domain/temps/paris';
import { clesPii, decryptPii, type ClesPii } from '../../securite/pii';
import { formaterRefus, lireEnvironnement, type CleDesReferences } from '../../../lib/env';
import { MODELE_APPORTEUR, MODELE_UTILISATEUR_CONSOLE } from '../../auth/lien-magique-depot';
import type { LecteurDAttribution, ReponseAttribution } from './api-entrante';

/** La variable qui porte la clé de dérivation des références (revue sécurité, #561). */
export const VARIABLE_CLE_REFERENCE = 'APPORTEUR_REF_KEY';

/**
 * La clé de pseudonymisation des porteurs, sous son type dédié de `src/lib/env.ts` (SEC-63). Elle ne
 * sert qu'à dériver `apporteurRef` : jamais à signer ni à authentifier.
 */
export type { CleDesReferences };

/**
 * SEC-63 : la clé des références, tirée d'un environnement que `lireEnvironnement` a jugé en ENTIER
 * (présence, 32 octets au moins, distincte de toutes les autres clés, préfixes refusés en production).
 * Un refus lève en nommant les variables et leurs motifs (`formaterRefus`), jamais une valeur.
 */
export function cleDesReferences(
  source: Readonly<Record<string, string | undefined>>
): CleDesReferences {
  const lu = lireEnvironnement(source);
  if (!lu.ok) {
    throw new Error(
      `cle_reference : environnement refusé par src/lib/env.ts — ${lu.refus.map(formaterRefus).join(' ; ')}`
    );
  }
  return { APPORTEUR_REF_KEY: lu.env.APPORTEUR_REF_KEY };
}

/** La population du porteur : elle entre dans la dérivation. */
export type Population = 'apporteur' | 'console';

/** 32 octets au moins, comme les autres secrets HMAC du dépôt. */
const LONGUEUR_MIN_CLE = 32;

/** Le nom d'affichage du contrat (`api_attributions_reponse`) : son motif et sa longueur, lus. */
const NOM_DU_CONTRAT = (
  API_ATTRIBUTIONS.defs.api_attributions_reponse as {
    properties: { nomAffichable: { anyOf: readonly { pattern: string; maxLength: number }[] } };
  }
).properties.nomAffichable.anyOf[0]!;
const FORME_NOM = new RegExp(NOM_DU_CONTRAT.pattern, 'u');

/**
 * L'alerte technique d'un nom indisponible (A02, PR 710, 5981840348) : son genre et un NOMBRE, rien d'autre —
 * ni SIREN, ni nom, ni identifiant.
 */
export type SignalDuLecteur =
  | { readonly genre: 'nom_affichable_indisponible'; readonly nombre: number }
  /** A02 (5981872875) : un état confirmé sans aucune fin — sa charge est l'ÉTAT, rien d'autre. */
  | { readonly genre: 'echeance_indisponible'; readonly etat: string };

export interface DependancesDuLecteur {
  readonly cles: ClesPii;
  /** La clé de dérivation des références opaques. */
  readonly cleReference: CleDesReferences;
  /** L'alerte technique : une `attribuee` dont le porteur n'a pas de nom lisible. */
  readonly signaler: (s: SignalDuLecteur) => void;
}

// ── Les dérivations ─────────────────────────────────────────────────────────────────────────────

/**
 * La référence opaque d'un porteur : HMAC-SHA-256 sous `APPORTEUR_REF_KEY` de
 * « partners.apporteur-ref.v1|population|id », dont les 128 premiers bits sont mis en forme
 * d'UUID (version 8, variante RFC 9562). Une clé absente ou trop courte lève : jamais une
 * référence dérivée d'une clé faible.
 */
export function referenceOpaque(
  population: Population,
  idPorteur: string,
  cle: CleDesReferences
): string {
  const k = cle.APPORTEUR_REF_KEY;
  if (k.length < LONGUEUR_MIN_CLE) {
    throw new Error('cle_reference : absente ou trop courte');
  }
  const h = createHmac('sha256', k)
    .update(`partners.apporteur-ref.v1|${population}|${idPorteur}`)
    .digest();
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const mots = (texte: string | null): string[] => (texte ?? '').split(/\s/u).filter(Boolean);

/** Une initiale, en majuscule, suivie d'un point. */
const initiale = (mot: string): string => `${[...mot][0]!.toLocaleUpperCase('fr-FR')}.`;

/** Le nom rendu, s'il tient la forme du contrat ; sinon rien. */
const sousLaForme = (nom: string): string | null =>
  nom.length <= NOM_DU_CONTRAT.maxLength && FORME_NOM.test(nom) ? nom : null;

/**
 * Le nom d'affichage d'un apporteur : le prénom, puis l'initiale du nom de famille. Sans
 * prénom, rien : une initiale seule n'est pas un nom d'affichage — elle ne tient pas la forme du
 * contrat, qui exige une lettre en tête.
 */
export function nomAffichable(prenom: string | null, nom: string | null): string | null {
  const p = mots(prenom);
  const premier = mots(nom)[0];
  return sousLaForme(premier === undefined ? p.join(' ') : `${p.join(' ')} ${initiale(premier)}`);
}

/** Le nom d'affichage d'un conseiller : le premier mot de son nom, puis l'initiale du dernier. */
export function nomAffichableDuConseiller(nom: string | null): string | null {
  const n = mots(nom);
  return nomAffichable(n[0] ?? null, n.length > 1 ? n[n.length - 1]! : null);
}

/** Le mois `AAAA-MM`, à Paris, d'un instant. */
export function moisAParis(instant: Date): string {
  const d = versParis(instant.getTime());
  return `${d.annee}-${String(d.mois).padStart(2, '0')}`;
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

    let population: Population;
    let idPorteur: string;
    let nom: string | null;
    if (a.apporteur !== null) {
      const { id, prenomChiffre, nomChiffre } = a.apporteur;
      population = 'apporteur';
      idPorteur = id;
      nom = nomAffichable(
        dechiffrer(MODELE_APPORTEUR, 'prenomChiffre', id, prenomChiffre, d.cles),
        dechiffrer(MODELE_APPORTEUR, 'nomChiffre', id, nomChiffre, d.cles)
      );
    } else if (a.utilisateurConsole !== null) {
      const { id, nomChiffre } = a.utilisateurConsole;
      population = 'console';
      idPorteur = id;
      nom = nomAffichableDuConseiller(
        dechiffrer(MODELE_UTILISATEUR_CONSOLE, 'nomChiffre', id, nomChiffre, d.cles)
      );
    } else {
      // Le CHECK de la base l'interdit : une attribution a exactement un porteur.
      throw new Error('attribution_sans_porteur');
    }

    // A02 (PR 710, 5981840348) : un porteur sans nom lisible répond quand même — le nom, seul, est
    // nul, et l'alerte technique le dit, sans rien qui désigne le SIREN ni le porteur.
    if (nom === null) d.signaler({ genre: 'nom_affichable_indisponible', nombre: 1 });
    const cliente = a.statut === 'convertie';
    const fin = a.fenetreFinAt ?? a.peremptionAt;
    // A02 (5981872875) : une `provisoire` n'a jamais de fin (seule une confirmation pose
    // `fenetreFinAt`) — `until` nul, sans alerte. Un état confirmé sans aucune fin est une
    // incohérence : `until` nul aussi (jamais 503), et l'alerte nomme l'état, et lui seul.
    if (!cliente && fin === null && a.statut !== 'provisoire') {
      d.signaler({ genre: 'echeance_indisponible', etat: a.statut });
    }
    return {
      statut: cliente ? 'cliente' : 'attribuee',
      until: cliente || fin === null ? null : moisAParis(fin),
      apporteurRef: referenceOpaque(population, idPorteur, d.cleReference),
      nomAffichable: nom,
    };
  };
}

let client: PrismaClient | undefined;

/**
 * Le lecteur de production. Les clés sont relues À CHAQUE APPEL, par le même juge que le
 * démarrage (SEC-63 : la clé des références aussi, jamais `process.env` lu à part) : un
 * environnement refusé, ou une clé de référence absente, lève — la frontière rend 503, jamais
 * « libre » (échec fermé).
 */
export const lecteurDeProduction: LecteurDAttribution = async (siren) => {
  client ??= new PrismaClient();
  // La clé des références d'abord : son absence se nomme `cle_reference`.
  const cleReference = cleDesReferences(process.env);
  return lecteurDeLaBase(client, {
    cles: clesPii(process.env),
    cleReference,
    // Le canal de la frontière (son puits) : une ligne, le genre et sa charge fermée.
    signaler: (s) => {
      const { genre, ...charge } = s;
      process.stderr.write(`${JSON.stringify({ alerte: genre, ...charge })}\n`);
    },
  })(siren);
};
