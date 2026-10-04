/**
 * La frontière des API qu'axionia appelle. (SEC-07 ; REQ-SEC-012, REQ-INT-014)
 *
 * UN SEUL CHEMIN POUR TOUT APPEL, DANS CET ORDRE, ET CHAQUE REFUS EST LE MÊME.
 *   1. la configuration : les secrets sont lus par `lireEnvironnement` (SEC-01) ; un jeu refusé,
 *      une liste d'adresses absente, vide ou dont UNE entrée est illisible → refus ;
 *   2. l'adresse du client, lue depuis la droite de `X-Forwarded-For` (SEC-10) → hors liste, refus ;
 *   3. le jeton porteur, comparé en temps constant au jeton dédié → absent ou faux, refus ;
 *   4. la méthode et la route : seule `GET /attributions` sert → sinon, refus ;
 *   5. le débit, APRÈS l'authentification : un inconnu reçoit 404, jamais un 429 qui confirmerait
 *      la route ; le compteur reçoit l'empreinte de l'adresse, jamais l'adresse ;
 *   6. le SIREN (neuf chiffres), puis la lecture, sous un plancher de durée.
 * « Refus » = `refus()` : 404, corps vide, aucun en-tête — le même octet pour octet, quelle qu'en
 * soit la cause. Un 401 confirme que la route existe ; un 405 et l'`OPTIONS` automatique de Next
 * aussi : les routes exportent donc les SEPT méthodes (`gestionnaires`), et un attrape-tout sous la
 * frontière rend le même refus à un chemin qui n'existe pas.
 *
 * ÉCHEC FERMÉ PARTOUT. Le débit de production est le compteur `auth:axionia-ip` du registre de
 * SEC-10 (SEC-44 : 60 / 1 min par empreinte d'adresse, `surPanne: refuser`) : une panne du cache
 * rend 503, jamais un passage. La lecture de production est celle d'INT-T07-P
 * (`attributions-dto.ts`) : une lecture qui lève rend 503. Jamais « libre » par défaut : ce serait
 * échouer ouvert contre l'apporteur.
 *
 * CE QUI N'EST PAS DANS LA RÉPONSE NE PEUT PAS FUIR. Le corps est RECONSTRUIT champ par champ depuis
 * un schéma `.strict()` : un lecteur qui rend un champ de plus, un nom à la place d'une référence ou
 * un « libre » porteur d'une échéance voit sa réponse refusée (503) — rien ne traverse. Un SIREN
 * inconnu et un SIREN libre rendent la même constante, au même instant (`executerAuPlancher`).
 *
 * LE JOURNAL. Une ligne par appel, reconstruite depuis des champs fermés : la route, le résultat,
 * le SIREN s'il a la forme de neuf chiffres (jamais la chaîne reçue), l'empreinte de l'adresse,
 * l'instant, et le dépassement du plancher. Ni le jeton, ni l'adresse, ni un message d'erreur.
 * Le puits de phase 0 est la sortie d'erreur, comme pour les compteurs et le pot de miel.
 *
 * LIMITE DE LA DÉFENSE. La liste d'adresses repose sur `X-Forwarded-For` écrit par le mandataire de
 * la plateforme. Un conteneur joignable SANS lui lit un en-tête écrit par le client : la liste tombe,
 * le jeton reste. Une IPv6 est comparée par son /64, la granularité du normaliseur de SEC-10.
 */
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { API_ATTRIBUTIONS, ENTETE_KID_AXIONIA } from '../../../../packages/contracts/api';
import { cleDuKid, lireEnvironnement, lireTrousseaux, type Trousseau } from '../../../lib/env';
import { horlogeSysteme } from '../../../lib/horloge';
import { lecteurDeProduction } from './attributions-dto';
import { SAUTS_DE_CONFIANCE, adresseDuClient } from '../../securite/adresse-du-client';
import { executerAuPlancher, type HorlogeDePlancher } from '../../securite/pot-de-miel';
import { egalATempsConstant } from '../../securite/primitives-de-porte';
import {
  limiter,
  sujetDepuisEmpreinte,
  type SujetDeCompteur,
  type VerdictDeLimite,
} from '../../securite/rate-limit';

// ── Le vocabulaire fermé ────────────────────────────────────────────────────────────────────────

/** Les méthodes que Next route : toutes sont exportées, aucune n'est laissée au 405. */
export const METHODES_HTTP = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export type MethodeHttp = (typeof METHODES_HTTP)[number];

/** `inconnue` : l'attrape-tout de la frontière. */
export const ROUTES_DE_LA_FRONTIERE = ['attributions', 'inconnue'] as const;
export type RouteDeLaFrontiere = (typeof ROUTES_DE_LA_FRONTIERE)[number];

/**
 * La réponse de l'API 1 telle que le CONTRAT la publie (`packages/contracts/api.ts`) : la forme
 * admise ici en est DÉRIVÉE (statuts, champs, motifs), jamais réécrite (INT-T07-P, écart C-03).
 */
const DEF_REPONSE = API_ATTRIBUTIONS.defs.api_attributions_reponse as {
  required: readonly string[];
  properties: Record<
    string,
    { enum?: readonly string[]; anyOf?: readonly { pattern?: string; maxLength?: number }[] }
  >;
  allOf: readonly {
    if: { properties: { statut: { const: string } } };
    then: { properties: Record<string, { type: 'string' | 'null' }> };
  }[];
};

/** Le motif d'un champ nullable du contrat (`ouNul({type: 'string', pattern})`). */
function motifDuContrat(champ: string): RegExp {
  const motif = DEF_REPONSE.properties[champ]?.anyOf?.[0]?.pattern;
  if (motif === undefined) throw new Error(`contrat : le champ ${champ} n'a pas de motif.`);
  return new RegExp(motif, 'u');
}

/** La longueur maximale d'un champ nullable du contrat. */
function longueurDuContrat(champ: string): number {
  const n = DEF_REPONSE.properties[champ]?.anyOf?.[0]?.maxLength;
  if (n === undefined) throw new Error(`contrat : le champ ${champ} n'a pas de longueur.`);
  return n;
}

/**
 * Pour chaque statut, les champs que le contrat veut POSÉS (`true`) ou NULS (`false`) — lus dans
 * ses `if`/`then`, jamais réécrits ici.
 */
const EXIGENCES_DU_STATUT: ReadonlyMap<string, Readonly<Record<string, boolean>>> = new Map(
  DEF_REPONSE.allOf.map((r) => [
    r.if.properties.statut.const,
    Object.fromEntries(
      Object.entries(r.then.properties).map(([champ, t]) => [champ, t.type === 'string'])
    ),
  ])
);

/** REQ-INT-014 : `statut: libre|attribuee|cliente`, lu dans le contrat. */
export const STATUTS_D_ATTRIBUTION = DEF_REPONSE.properties.statut!.enum as readonly [
  'libre',
  'attribuee',
  'cliente',
];

export const RESULTATS_D_APPEL = [
  'configuration_refusee',
  'adresse_hors_liste',
  'jeton_refuse',
  'methode_refusee',
  'route_inconnue',
  'debit_depasse',
  'debit_indisponible',
  'siren_invalide',
  'lecture_indisponible',
  'reponse_non_conforme',
  ...STATUTS_D_ATTRIBUTION,
] as const;
export type ResultatDAppel = (typeof RESULTATS_D_APPEL)[number];

/** La variable qui porte la liste d'adresses autorisées. Absente ou vide : personne n'entre. */
export const VARIABLE_DE_LA_LISTE = 'AXIONIA_API_ALLOWLIST';

/**
 * Le plancher de durée de la lecture. Valeur TECHNIQUE, qu'aucune exigence ne chiffre : elle doit
 * dépasser la lecture la plus lente d'un fonctionnement normal. Un dépassement n'est pas tu — il se
 * dit au journal (`plancherDepasse`), parce qu'il redevient une différence mesurable.
 */
export const PLANCHER_LECTURE_MS = 150;

// ── La réponse minimale ─────────────────────────────────────────────────────────────────────────

const SIREN = /^\d{9}$/;

const formeDeLaReponse = z
  .object({
    statut: z.enum(STATUTS_D_ATTRIBUTION),
    until: z.string().regex(motifDuContrat('until')).nullable(),
    /** Opaque : un UUID ne peut porter ni un nom ni une adresse de courriel. */
    apporteurRef: z.string().regex(motifDuContrat('apporteurRef')).nullable(),
    /** Le prénom et l'initiale du nom : ni arobase ni chiffre (décision de Williams, 2026-10-01). */
    nomAffichable: z
      .string()
      .max(longueurDuContrat('nomAffichable'))
      .regex(motifDuContrat('nomAffichable'))
      .nullable(),
  })
  .strict();

/** Les champs du contrat, DÉRIVÉS du schéma, dans l'ordre du contrat. */
export const CHAMPS_DE_LA_REPONSE: readonly string[] = DEF_REPONSE.required;
if (
  CHAMPS_DE_LA_REPONSE.length !== Object.keys(formeDeLaReponse.shape).length ||
  CHAMPS_DE_LA_REPONSE.some((c) => !(c in formeDeLaReponse.shape))
) {
  throw new Error('api-entrante : la forme admise diverge des champs du contrat.');
}
if (STATUTS_D_ATTRIBUTION.some((st) => !EXIGENCES_DU_STATUT.has(st))) {
  throw new Error('api-entrante : un statut du contrat n’a pas sa règle `if`/`then`.');
}

/**
 * La cohérence du statut, telle que le contrat la pose (`if`/`then`, dérivés ici) : un « libre » ne
 * porte ni échéance, ni référence, ni nom — c'est ce qui le rend identique à « inconnu » ; une
 * « attribuee » porte son échéance et sa référence ; une « cliente » sa référence, sans échéance. Le
 * nom, lui, peut manquer quand le porteur n'en a pas de lisible.
 */
export const schemaReponseAttribution = formeDeLaReponse.refine((r) =>
  Object.entries(EXIGENCES_DU_STATUT.get(r.statut)!).every(
    ([champ, pose]) => (r[champ as keyof typeof r] !== null) === pose
  )
);
export type ReponseAttribution = z.infer<typeof formeDeLaReponse>;

const LIBRE: ReponseAttribution = {
  statut: 'libre',
  until: null,
  apporteurRef: null,
  nomAffichable: null,
};

// ── Les ports ───────────────────────────────────────────────────────────────────────────────────

/** La lecture d'un SIREN : la forme minimale, ou `null` pour un SIREN inconnu. */
export type LecteurDAttribution = (siren: string) => Promise<unknown>;

/** Le compteur de débit, sur l'empreinte de l'adresse autorisée. */
export type LimiteurDeLaFrontiere = (
  sujet: SujetDeCompteur,
  maintenantMs: number
) => Promise<VerdictDeLimite>;

export type PuitsDAppels = (ligne: string) => void;

export interface Frontiere {
  readonly environnement: Readonly<Record<string, string | undefined>>;
  readonly horloge: HorlogeDePlancher;
  readonly debit: LimiteurDeLaFrontiere;
  readonly lire: LecteurDAttribution;
  readonly puits: PuitsDAppels;
}

/** Lue À CHAQUE APPEL : l'environnement n'est jamais figé à l'import. */
export function frontiereDeProduction(): Frontiere {
  return {
    environnement: process.env,
    horloge: {
      maintenantMs: () => horlogeSysteme.maintenant(),
      attendre: (ms) => new Promise((resoudre) => setTimeout(resoudre, ms)),
    },
    // SEC-44 : le compteur du registre, appelé à nom LITTÉRAL — la forme que `rate-famille` lit.
    debit: (sujet, maintenantMs) => limiter('auth:axionia-ip', sujet, maintenantMs),
    // INT-T07-P : la lecture des attributions, sur la base (`attributions-dto.ts`).
    lire: lecteurDeProduction,
    puits: (ligne) => {
      process.stderr.write(`${ligne}\n`);
    },
  };
}

// ── Les primitives ──────────────────────────────────────────────────────────────────────────────

/** Le refus unique : 404, corps vide, aucun en-tête. Neuf à chaque appel, identique à chaque fois. */
export function refus(): Response {
  return new Response(null, { status: 404 });
}

function sansCorps(statut: 400 | 503): Response {
  return new Response(null, { status: statut });
}

/** partners/ADR-0013 §12 : HMAC-SHA256 sous le sel, séparé par domaine, 16 hexadécimaux. */
export function empreinteAdresse(adresse: string, sel: string): string {
  return createHmac('sha256', sel)
    .update(`partners.ip.v1\u001f${adresse}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * La liste d'adresses, normalisée par le MÊME normaliseur que l'adresse lue. Absente, vide, ou une
 * seule entrée illisible : `null`, et personne n'entre — une faute de frappe ne rend pas une liste
 * partielle en silence.
 */
function listeDAdresses(brut: string | undefined): ReadonlySet<string> | null {
  if (brut === undefined || brut.trim() === '') return null;
  const sujets = new Set<string>();
  for (const entree of brut.split(',')) {
    const sujet = adresseDuClient(new Headers({ 'x-forwarded-for': entree.trim() }), 1);
    if (sujet === null) return null;
    sujets.add(sujet);
  }
  return sujets;
}

/**
 * Le jeton porteur, comparé à temps constant par la primitive partagée, à la clé que désigne le
 * `kid` présenté (QA-T52, REQ-QA-030) : un kid absent ou inconnu, ou un jeton précédent échu, est
 * refusé sans comparaison — jamais essayé contre toutes les clés.
 */
function jetonAccepte(
  autorisation: string | null,
  kid: string | null,
  trousseau: Trousseau,
  maintenantMs: number
): boolean {
  const presente = /^Bearer (\S+)$/.exec(autorisation ?? '')?.[1] ?? '';
  const cle = cleDuKid(trousseau, kid, maintenantMs);
  return cle.ok && egalATempsConstant(presente, cle.cle);
}

// ── Le chemin d'un appel ────────────────────────────────────────────────────────────────────────

export async function traiterAppel(
  requete: Request,
  route: RouteDeLaFrontiere,
  f: Frontiere
): Promise<Response> {
  const brut = new URL(requete.url).searchParams.get('siren');
  const siren = brut !== null && SIREN.test(brut) ? brut : null;
  let ipHash: string | null = null;
  const noter = (resultat: ResultatDAppel, plancherDepasse = false): void => {
    f.puits(
      JSON.stringify({
        signal: 'appel_axionia',
        route,
        resultat,
        siren,
        ipHash,
        survenuAt: new Date(f.horloge.maintenantMs()).toISOString(),
        plancherDepasse,
      })
    );
  };

  const lu = lireEnvironnement(f.environnement);
  const rotation = lireTrousseaux(f.environnement, f.horloge.maintenantMs());
  if (!lu.ok || !rotation.ok) {
    noter('configuration_refusee');
    return refus();
  }
  const adresse = adresseDuClient(requete.headers, SAUTS_DE_CONFIANCE);
  if (adresse !== null) ipHash = empreinteAdresse(adresse, lu.env.IP_HASH_SALT);
  const liste = listeDAdresses(f.environnement[VARIABLE_DE_LA_LISTE]);
  if (liste === null) {
    noter('configuration_refusee');
    return refus();
  }
  if (adresse === null || ipHash === null || !liste.has(adresse)) {
    noter('adresse_hors_liste');
    return refus();
  }
  if (
    !jetonAccepte(
      requete.headers.get('authorization'),
      requete.headers.get(ENTETE_KID_AXIONIA),
      rotation.trousseaux.AXIONIA_API_TOKEN,
      f.horloge.maintenantMs()
    )
  ) {
    noter('jeton_refuse');
    return refus();
  }
  if (requete.method !== 'GET') {
    noter('methode_refusee');
    return refus();
  }
  if (route !== 'attributions') {
    noter('route_inconnue');
    return refus();
  }

  const maintenant = f.horloge.maintenantMs();
  let verdict: VerdictDeLimite;
  try {
    verdict = await f.debit(sujetDepuisEmpreinte(ipHash), maintenant);
  } catch {
    noter('debit_indisponible');
    return sansCorps(503);
  }
  if (!verdict.autorise) {
    if (verdict.panne) {
      noter('debit_indisponible');
      return sansCorps(503);
    }
    noter('debit_depasse');
    const entetes = new Headers();
    if (verdict.repriseAt !== null) {
      const secondes = Math.max(1, Math.ceil((verdict.repriseAt - maintenant) / 1000));
      entetes.set('retry-after', String(secondes));
    }
    return new Response(null, { status: 429, headers: entetes });
  }

  if (siren === null) {
    noter('siren_invalide');
    return sansCorps(400);
  }

  let lecture: { valeur: unknown; depasse: boolean };
  try {
    lecture = await executerAuPlancher(PLANCHER_LECTURE_MS, () => f.lire(siren), f.horloge);
  } catch {
    noter('lecture_indisponible');
    return sansCorps(503);
  }
  const verifie =
    lecture.valeur === null
      ? { success: true as const, data: LIBRE }
      : schemaReponseAttribution.safeParse(lecture.valeur);
  if (!verifie.success) {
    noter('reponse_non_conforme', lecture.depasse);
    return sansCorps(503);
  }
  // Reconstruite champ par champ : rien de ce que le lecteur a pu ajouter ne traverse.
  const corps: ReponseAttribution = {
    statut: verifie.data.statut,
    until: verifie.data.until,
    apporteurRef: verifie.data.apporteurRef,
    nomAffichable: verifie.data.nomAffichable,
  };
  noter(corps.statut, lecture.depasse);
  return new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Les sept méthodes d'une route de la frontière, chacune par le même chemin. */
export function gestionnaires(
  route: RouteDeLaFrontiere
): Record<MethodeHttp, (requete: Request) => Promise<Response>> {
  const traiter = (requete: Request): Promise<Response> =>
    traiterAppel(requete, route, frontiereDeProduction());
  return {
    GET: traiter,
    HEAD: traiter,
    POST: traiter,
    PUT: traiter,
    PATCH: traiter,
    DELETE: traiter,
    OPTIONS: traiter,
  };
}
