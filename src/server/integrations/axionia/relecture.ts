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
 * une lecture le serait pour toute autre pendant la fenêtre. La réponse est signée comme un envoi du
 * relais, et jugée par la MÊME fonction que les webhooks (`verifierSignatureAxionia`).
 *
 * ÉCHEC FERMÉ. Canal non configuré, appel en erreur, statut autre que 200, signature refusée, en-tête
 * illisible, ligne qui n'est pas une enveloppe : la page est REFUSÉE entière, avec son motif. Une
 * moitié de page n'est jamais rendue — elle ferait avancer un curseur sur des lignes non lues.
 *
 * LA ROUTE N'EST PAS ENCORE DÉCLARÉE AU CONTRAT : elle y entre par INT-T70-P, dans
 * `packages/contracts/api.ts`. D'ici là, son chemin est écrit ici, une fois, et la forme d'une ligne
 * n'est lue que pour ce dont la réconciliation a besoin : `event_id` et `sequence`.
 */
import { createHmac } from 'node:crypto';
import { ENTETE_KID_AXIONIA } from '../../../../packages/contracts/api';
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
  | 'ligne_illisible';

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

const ENTIER = /^[0-9]{1,18}$/;

/**
 * Appelle une route d'axion-ia, signée sur `signee`, et rend le corps AUTHENTIFIÉ — ou le motif du
 * refus. Partagé par la relecture et le rejeu : une seule écriture de l'authentification.
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
  const octets = new Uint8Array(await reponse.arrayBuffer());
  const verdict = verifierSignatureAxionia(
    octets,
    reponse.headers.get(ENTETE_HORODATAGE),
    reponse.headers.get(ENTETE_SIGNATURE),
    reponse.headers.get(ENTETE_KID_AXIONIA),
    c.trousseauEmission,
    c.maintenantMs()
  );
  if (!verdict.ok) return { ok: false, motif: 'signature_refusee' };
  let texte: string;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return { ok: false, motif: 'signature_refusee' };
  }
  return { ok: true, texte, entetes: reponse.headers };
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
    const r = await appelSigne(c, { methode: 'GET', cible, signee: cible });
    if (!r.ok) return r;
    const derniere = r.entetes.get('x-axionia-derniere-sequence') ?? '';
    const suite = r.entetes.get('x-axionia-suite');
    if (!ENTIER.test(derniere) || (suite !== '0' && suite !== '1')) {
      return { ok: false, motif: 'entete_illisible' };
    }
    const lignes: LigneRelue[] = [];
    for (const corps of r.texte === '' ? [] : r.texte.split('\n')) {
      const ligne = lireLigne(corps);
      if (ligne === null) return { ok: false, motif: 'ligne_illisible' };
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
