/**
 * Le client de RELECTURE de la file de sortie d'axion-ia — INT-T08-P (REQ-INT-012). C'est le client
 * UNIQUE de la route de relecture (`GET`, `CHEMIN_RELECTURE` ci-dessous, paramètres `after_sequence` et `limit`) : la réconciliation
 * quotidienne l'emploie, le rattrapage historique le réemploiera tel quel (audit du plan de la
 * Phase 1, écart B-07).
 *
 * CE QU'AXION-IA RÉPOND (route INT-T02 de l'autre dépôt, `src/server/partners-sync/relecture.ts`) :
 * les corps stockés, octet pour octet, un par ligne (NDJSON) ; `X-Axionia-Derniere-Sequence`, la
 * séquence de la dernière ligne rendue ; `X-Axionia-Suite` à `1` s'il en reste. La requête est signée
 * comme celle des coordonnées (`candidature-recue.ts`) : HMAC-SHA-256 de `<horodatage>.<cible>` sous
 * le secret de relecture — la CIBLE entière, requête comprise, sans quoi une signature valable pour
 * une lecture le serait pour toute autre pendant la fenêtre.
 *
 * LA RÉPONSE EST SIGNÉE SUR LA CHAÎNE CANONIQUE (INT-T74-P) que le `$comment` de la route déclare au
 * contrat : `<horodatage>.<after_sequence>.<limit>.<x-axionia-derniere-sequence>.<x-axionia-suite>.
 * <corps exact>`, construite par la fonction PARTAGÉE `chaineCanoniqueDeRelecture`
 * (`packages/contracts/signature-relecture.ts`). Elle lie la page à SA requête et couvre les deux
 * en-têtes qui disent où reprendre. La forme courte `<horodatage>.<corps>` n'est JAMAIS acceptée en
 * repli : elle est exigée dès la fusion (décision de la coordination par délégation de Williams),
 * et cette tâche ne fusionne qu'après INT-T72-A, qui la pose côté axion-ia. La fenêtre de 300 s, la
 * clé désignée par `x-axionia-kid` et la comparaison à temps constant restent celles des webhooks
 * (`verifierSignatureAxionia`).
 *
 * ÉCHEC FERMÉ. Canal non configuré, appel en erreur, statut autre que 200, signature refusée, en-tête
 * illisible, ligne qui n'est pas une enveloppe : la page est REFUSÉE entière, avec son motif. Une
 * moitié de page n'est jamais rendue — elle ferait avancer un curseur sur des lignes non lues.
 *
 * LA ROUTE EST DÉCLARÉE AU CONTRAT (`API_RELECTURE`, `packages/contracts/api.ts`). La forme d'une
 * ligne n'est lue que pour ce dont la réconciliation a besoin : `event_id` et `sequence`.
 */
import { createHmac } from 'node:crypto';
import { ENTETE_KID_AXIONIA } from '../../../../packages/contracts/api';
import { chaineCanoniqueDeRelecture } from '../../../../packages/contracts/signature-relecture';
import type { Trousseau } from '../../../lib/env';
import { ENTETE_HORODATAGE, ENTETE_SIGNATURE, verifierSignatureAxionia } from './reception';
import { ENTETE_HORODATAGE_REQUETE, ENTETE_SIGNATURE_REQUETE } from './candidature-recue';

/** Le chemin de la route de relecture d'axion-ia. */
export const CHEMIN_RELECTURE = '/api/partners/evenements';

/**
 * La borne d'une page : cent lignes. Elle est sous la borne du serveur (cinq cents, `LIMITE_MAX` de
 * la route d'axion-ia), qui refuserait au-delà ; c'est aussi sa valeur par défaut.
 */
export const LIMITE_PAR_PAGE = 100;

/** Délai d'attente d'un appel : au-delà, la page est refusée et le passage suivant reprend. */
const DELAI_MS = 10_000;

/** Une ligne relue : l'identifiant d'origine, la séquence, et le corps exact. */
export type LigneRelue = {
  readonly eventId: string;
  readonly sequence: bigint;
  readonly corps: string;
};

export type MotifDeRelecture =
  | 'canal_non_configure'
  | 'appel_echoue'
  | `statut_${number}`
  | 'signature_refusee'
  | 'entete_illisible'
  | 'ligne_illisible'
  | 'ligne_hors_ordre';

export type PageRelue =
  | {
      readonly ok: true;
      readonly lignes: readonly LigneRelue[];
      readonly derniereSequence: bigint;
      readonly suite: boolean;
    }
  | { readonly ok: false; readonly motif: MotifDeRelecture };

/** Lit UNE page de la file, après `apres`. */
export type LirePage = (apres: bigint) => Promise<PageRelue>;

/** Ce que les deux clients de l'autre dépôt partagent : l'adresse, les secrets, l'horloge. */
export type CanalAxionia = {
  readonly urlAxionia: string | undefined;
  readonly secretRelecture: string;
  /** Les clés sous lesquelles axion-ia signe ses réponses ; la sienne est choisie par `x-axionia-kid`. */
  readonly trousseauEmission: Trousseau;
  readonly appeler: typeof fetch;
  readonly maintenantMs: () => number;
};

/** Une séquence d'en-tête : décimale, sans zéro de tête — la seule écriture que la chaîne signe. */
const ENTIER = /^(0|[1-9][0-9]{0,17})$/;

type AppelBrut =
  | { ok: true; octets: Uint8Array; entetes: Headers }
  | { ok: false; motif: 'canal_non_configure' | 'appel_echoue' | `statut_${number}` };

/** Le texte d'une réponse, octet pour octet : UTF-8 strict, sans retirer d'indicateur d'ordre. */
function texteDe(octets: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(octets);
  } catch {
    return null;
  }
}

/** Appelle une route d'axion-ia, la requête signée sur `signee` ; la réponse n'est PAS encore jugée. */
async function appeler(
  c: CanalAxionia,
  requete: { methode: 'GET' | 'POST'; cible: string; signee: string; corps?: string }
): Promise<AppelBrut> {
  if (c.urlAxionia === undefined) return { ok: false, motif: 'canal_non_configure' };
  const horodatage = String(Math.floor(c.maintenantMs() / 1000));
  const signature = createHmac('sha256', c.secretRelecture)
    .update(`${horodatage}.${requete.signee}`)
    .digest('hex');
  let reponse: Response;
  try {
    reponse = await c.appeler(new URL(requete.cible, c.urlAxionia), {
      method: requete.methode,
      headers: {
        [ENTETE_HORODATAGE_REQUETE]: horodatage,
        [ENTETE_SIGNATURE_REQUETE]: signature,
        ...(requete.corps === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(requete.corps === undefined ? {} : { body: requete.corps }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    return { ok: false, motif: 'appel_echoue' };
  }
  if (reponse.status !== 200) return { ok: false, motif: `statut_${reponse.status}` };
  return {
    ok: true,
    octets: new Uint8Array(await reponse.arrayBuffer()),
    entetes: reponse.headers,
  };
}

/**
 * Juge la signature `x-axionia-signature` sur `<horodatage>.` suivi de `reste`, par la fonction des
 * webhooks : fenêtre de 300 s, clé désignée par le kid, comparaison à temps constant.
 */
function signee(c: CanalAxionia, entetes: Headers, reste: Uint8Array): boolean {
  return verifierSignatureAxionia(
    reste,
    entetes.get(ENTETE_HORODATAGE),
    entetes.get(ENTETE_SIGNATURE),
    entetes.get(ENTETE_KID_AXIONIA),
    c.trousseauEmission,
    c.maintenantMs()
  ).ok;
}

/**
 * Appelle une route d'axion-ia, signée sur `signee`, et rend le corps AUTHENTIFIÉ sur
 * `<horodatage>.<corps>` — ou le motif du refus. C'est la forme du REJEU, qu'INT-T72-A ne change pas ;
 * la relecture, elle, se juge sur la chaîne canonique (`clientRelecture`).
 */
export async function appelSigne(
  c: CanalAxionia,
  requete: { methode: 'GET' | 'POST'; cible: string; signee: string; corps?: string }
): Promise<
  | { ok: true; texte: string; entetes: Headers }
  | {
      ok: false;
      motif: 'canal_non_configure' | 'appel_echoue' | `statut_${number}` | 'signature_refusee';
    }
> {
  const r = await appeler(c, requete);
  if (!r.ok) return r;
  if (!signee(c, r.entetes, r.octets)) return { ok: false, motif: 'signature_refusee' };
  const texte = texteDe(r.octets);
  if (texte === null) return { ok: false, motif: 'signature_refusee' };
  return { ok: true, texte, entetes: r.entetes };
}

/**
 * La réponse de relecture est-elle signée sur la chaîne canonique de CETTE requête ? La chaîne est
 * construite par la fonction partagée ; un nombre non canonique, horodatage compris, la fait lever
 * et la réponse est refusée. Elle commence par `<horodatage>.` : la vérification commune hache ce
 * préfixe puis le reste, octet pour octet.
 */
function signeeCanonique(
  c: CanalAxionia,
  entetes: Headers,
  page: { apres: bigint; derniere: string; suite: string; texte: string }
): boolean {
  const horodatage = entetes.get(ENTETE_HORODATAGE) ?? '';
  let chaine: string;
  try {
    chaine = chaineCanoniqueDeRelecture({
      horodatage,
      afterSequence: page.apres,
      limit: LIMITE_PAR_PAGE,
      derniereSequence: page.derniere,
      suite: page.suite,
      corps: page.texte,
    });
  } catch {
    return false;
  }
  return signee(c, entetes, new TextEncoder().encode(chaine.slice(horodatage.length + 1)));
}

/** Une ligne NDJSON lue : son `event_id` (chaîne non vide) et sa `sequence` (entier positif). */
function lireLigne(corps: string): LigneRelue | null {
  let brut: unknown;
  try {
    brut = JSON.parse(corps);
  } catch {
    return null;
  }
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const { event_id: eventId, sequence } = brut as Record<string, unknown>;
  if (typeof eventId !== 'string' || eventId === '') return null;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) return null;
  return { eventId, sequence: BigInt(sequence), corps };
}

/** Le client de relecture. Aucun appel si le canal n'est pas configuré. */
export function clientRelecture(c: CanalAxionia): LirePage {
  return async (apres) => {
    const cible = `${CHEMIN_RELECTURE}?after_sequence=${apres}&limit=${LIMITE_PAR_PAGE}`;
    const r = await appeler(c, { methode: 'GET', cible, signee: cible });
    if (!r.ok) return r;
    // Les deux en-têtes signés sont exigés, sous leur seule écriture canonique : absent ou autrement
    // écrit, la page est refusée avant tout calcul.
    const derniere = r.entetes.get('x-axionia-derniere-sequence') ?? '';
    const suite = r.entetes.get('x-axionia-suite') ?? '';
    if (!ENTIER.test(derniere) || (suite !== '0' && suite !== '1')) {
      return { ok: false, motif: 'entete_illisible' };
    }
    const texte = texteDe(r.octets);
    if (texte === null || !signeeCanonique(c, r.entetes, { apres, derniere, suite, texte })) {
      return { ok: false, motif: 'signature_refusee' };
    }
    const lignes: LigneRelue[] = [];
    // Chaque séquence croît STRICTEMENT depuis `apres` : une page rejouée ou mélangée est refusée
    // entière. Une page authentique d'une lecture qui part PLUS LOIN dans la file passerait cet
    // ordre : c'est la chaîne canonique, qui signe `after_sequence` et `limit`, qui la refuse.
    let precedente = apres;
    for (const corps of texte === '' ? [] : texte.split('\n')) {
      const ligne = lireLigne(corps);
      if (ligne === null) return { ok: false, motif: 'ligne_illisible' };
      if (ligne.sequence <= precedente) return { ok: false, motif: 'ligne_hors_ordre' };
      precedente = ligne.sequence;
      lignes.push(ligne);
    }
    const derniereSequence = BigInt(derniere);
    // Le curseur ne recule jamais, et il ne saute pas de ligne : la dernière séquence annoncée est
    // celle de la dernière ligne rendue, ou le point de départ quand rien n'est rendu.
    const attendue = lignes.at(-1)?.sequence ?? apres;
    if (derniereSequence !== attendue) return { ok: false, motif: 'entete_illisible' };
    return { ok: true, lignes, derniereSequence, suite: suite === '1' };
  };
}
