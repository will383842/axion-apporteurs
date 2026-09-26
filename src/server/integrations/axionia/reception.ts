/**
 * La réception des événements d'axionia — SEC-06 (REQ-SEC-010, REQ-DM-036, REQ-ARG-002,
 * REQ-ARG-003, REQ-INT-011).
 *
 * L'ORDRE EST LE CONTRAT, et chaque étape refuse sans rien écrire :
 *   1. le secret, jugé avec TOUS les secrets par `lireEnvironnement` (SEC-01) → 503 : la porte ne
 *      s'ouvre jamais par défaut ;
 *   2. le corps, borné à 128 Ko AVANT d'être lu en entier (`lireCorpsBorne`) → 413 ;
 *   3. la signature : HMAC-SHA256 de `<secondes>.<corps exact>` sous le secret dédié, en-têtes
 *      `X-Axionia-Timestamp` / `X-Axionia-Signature`, tolérance de 300 s, comparaison à temps
 *      constant, aucun repli en clair → 401 et une alerte PLAFONNÉE. Le corps n'est PAS parsé avant ;
 *   4. l'enveloppe, jugée par le schéma Zod du contrat (`packages/contracts/events.zod.ts`), puis la
 *      frontière de REQ-INT-029 (aucune coordonnée ne traverse), puis la clé métier d'un paiement →
 *      422 et une alerte : l'outbox d'axionia passe l'envoi en `gave_up`, rien n'est perdu ;
 *   5. l'INSCRIPTION dans `evenements_recus`, AVANT tout traitement. Un doublon — même
 *      (source, eventId), ou même paiement — rend 200 `{duplicate:true}` sans rien écrire ni
 *      déclencher : c'est la base qui le dit (contrainte unique, index partiel), jamais une lecture
 *      préalable. Une base qui refuse l'inscription rend 503 : l'événement N'EST PAS inscrit, et
 *      l'émetteur doit le rejouer ;
 *   6. le déclenchement du travail de fond, qui ne peut pas faire échouer la réponse : un échec de
 *      TRAITEMENT ne produit jamais un 5xx (REQ-SEC-011).
 *
 * `schema_version` INCONNUE. Une enveloppe bien formée, d'un type connu, mais d'une autre version
 * est inscrite `held` et alertée — jamais rejetée, jamais traitée (REQ-ARG-003). Un type INCONNU,
 * lui, ne peut pas s'inscrire (la colonne est un enum) : 422, et c'est l'outbox qui le garde.
 */
import { createHash, createHmac } from 'node:crypto';
import {
  Prisma,
  SourceEvenementRecu,
  TypeEvenementRecu,
  type PrismaClient,
  type StatutEvenementRecu,
} from '@prisma/client';
import { z } from 'zod';
import {
  champsInterdits,
  SCHEMA_VERSION,
  type TypeEvenement,
} from '../../../../packages/contracts/events';
import { enveloppeEvenement } from '../../../../packages/contracts/events.zod';
import { lireEnvironnement } from '../../../lib/env';
import {
  TOLERANCE_SIGNATURE_S,
  egalATempsConstant,
  lireCorpsBorne,
  type AlerteurPlafonne,
} from '../../securite/primitives-de-porte';

/**
 * La porte, telle que ses alertes la nomment. Deux familles, réarmées par deux événements :
 * l'AUTHENTIFICATION (`axionia`), réarmée par une signature valide ; le CONTENU d'un émetteur
 * authentifié (`axionia.contenu` : hors schéma, frontière, version inconnue), réarmé par une
 * inscription ordinaire. Une panne qui se répète ne produit qu'une alerte ; la suivante, après un
 * retour à la normale, dit combien ont été tues.
 */
export const PORTE = 'axionia';
export const PORTE_CONTENU = 'axionia.contenu';

/** Les en-têtes que le producteur pose (REQ-SEC-010). */
export const ENTETE_HORODATAGE = 'x-axionia-timestamp';
export const ENTETE_SIGNATURE = 'x-axionia-signature';

// ── La signature ────────────────────────────────────────────────────────────────────────────────

export type MotifDeSignature =
  'entete_absent' | 'horodatage_illisible' | 'hors_fenetre' | 'signature_invalide';

/**
 * Des secondes Unix en chiffres, et rien d'autre : un horodatage qui porterait un point rendrait la
 * découpe de `<t>.<corps>` ambiguë, et deux messages distincts pourraient porter la même signature
 * (même règle que le producteur, `signerCorps`).
 */
const HORODATAGE = /^[0-9]{1,20}$/;

/** La forme exacte que le producteur écrit : 64 hexadécimaux minuscules. */
const SIGNATURE = /^[0-9a-f]{64}$/;

/** La signature du producteur, recalculée sur les OCTETS reçus. */
export function signatureAttendue(secret: string, horodatage: string, octets: Uint8Array): string {
  return createHmac('sha256', secret).update(`${horodatage}.`, 'utf8').update(octets).digest('hex');
}

export function verifierSignatureAxionia(
  octets: Uint8Array,
  horodatage: string | null,
  signature: string | null,
  secret: string,
  maintenantMs: number
): { ok: true } | { ok: false; motif: MotifDeSignature } {
  if (horodatage === null || signature === null) return { ok: false, motif: 'entete_absent' };
  if (!HORODATAGE.test(horodatage)) return { ok: false, motif: 'horodatage_illisible' };
  if (Math.abs(maintenantMs / 1000 - Number(horodatage)) > TOLERANCE_SIGNATURE_S) {
    return { ok: false, motif: 'hors_fenetre' };
  }
  const attendue = signatureAttendue(secret, horodatage, octets);
  // La forme est jugée APRÈS le calcul, et la comparaison se fait toujours : le temps de réponse ne
  // dit pas si la signature présentée avait la bonne forme.
  const egale = egalATempsConstant(signature, attendue);
  return egale && SIGNATURE.test(signature)
    ? { ok: true }
    : { ok: false, motif: 'signature_invalide' };
}

// ── L'enveloppe ─────────────────────────────────────────────────────────────────────────────────

/**
 * Le schéma du contrat, tel qu'il est publié — à UNE exception : la version est lue comme un entier
 * positif et non comme la constante, pour qu'une enveloppe bien formée d'une autre version soit
 * reconnue et inscrite `held` au lieu d'être refusée.
 */
const enveloppeReconnue = enveloppeEvenement.extend({
  schema_version: z.number().int().positive(),
});

/**
 * L'identifiant de l'enum, DÉRIVÉ du nom de fil (le point devient un souligné), jamais retapé ; un
 * nom qui n'y correspond pas lève — le contrat et le schéma ont divergé.
 */
export function identifiantDuType(type: TypeEvenement): TypeEvenementRecu {
  const identifiant = type.replace('.', '_');
  const valeurs: readonly string[] = Object.values(TypeEvenementRecu);
  if (!valeurs.includes(identifiant)) {
    throw new Error(`type_hors_enum : ${identifiant} n'est pas une valeur de TypeEvenementRecu`);
  }
  return identifiant as TypeEvenementRecu;
}

/** Les bornes des colonnes `sujet_ref` et `cle_metier`. */
const SUJET_MAX = 180;
const CLE_METIER_MAX = 120;

/**
 * La référence de sujet, mise à plat : `{ client_id: "<id>" }` → `client:<id>`. Toute autre forme
 * — plusieurs clés, une valeur qui n'est pas une chaîne — rend `null` : l'événement s'inscrit, il
 * ne pourra simplement réveiller personne.
 */
export function sujetRefDe(sujet: unknown): string | null {
  if (sujet === null || typeof sujet !== 'object' || Array.isArray(sujet)) return null;
  const entrees = Object.entries(sujet as Record<string, unknown>);
  if (entrees.length !== 1) return null;
  const [cle, valeur] = entrees[0]!;
  const espace = /^([a-z][a-z_]*)_id$/.exec(cle)?.[1];
  if (espace === undefined || typeof valeur !== 'string' || valeur === '') return null;
  const ref = `${espace}:${valeur}`;
  return ref.length > SUJET_MAX ? null : ref;
}

/** Les types dont la clé métier est le `paymentId` (REQ-ARG-002). */
const TYPES_A_CLE_DE_PAIEMENT: readonly TypeEvenementRecu[] = [
  TypeEvenementRecu.paiement_recu,
  TypeEvenementRecu.paiement_rembourse,
];

// ── L'inscription ───────────────────────────────────────────────────────────────────────────────

export interface EvenementAInscrire {
  source: SourceEvenementRecu;
  eventId: string;
  eventType: TypeEvenementRecu;
  schemaVersion: number;
  sequence: bigint | null;
  sujetRef: string | null;
  cleMetier: string | null;
  charge: Record<string, unknown>;
  payloadHash: string;
  statut: Extract<StatutEvenementRecu, 'recu' | 'held'>;
  receivedAt: Date;
  survenuAt: Date;
}

export interface DepotDeReception {
  /** Inscrit, ou dit `doublon` quand la BASE refuse la seconde ligne. */
  inscrire(e: EvenementAInscrire): Promise<'inscrit' | 'doublon'>;
}

export interface DependancesDeReception {
  readonly environnement: Readonly<Record<string, string | undefined>>;
  readonly maintenantMs: number;
  depot: DepotDeReception;
  /** Confie le travail de fond. Il ne s'exécute jamais dans la requête ; s'il lève, rien ne change. */
  declencher: () => void;
  readonly alerteur: AlerteurPlafonne;
}

function texte(statut: number, corps: string): Response {
  return new Response(corps, { status: statut });
}

export async function recevoirEvenementAxionia(
  requete: Request,
  d: DependancesDeReception
): Promise<Response> {
  const lu = lireEnvironnement(d.environnement);
  if (!lu.ok) return texte(503, 'reception_indisponible');

  const corps = await lireCorpsBorne(requete);
  if (!corps.ok)
    return corps.motif === 'corps_trop_grand'
      ? texte(413, 'corps_trop_grand')
      : texte(400, 'corps_illisible');

  const verdict = verifierSignatureAxionia(
    corps.octets,
    requete.headers.get(ENTETE_HORODATAGE),
    requete.headers.get(ENTETE_SIGNATURE),
    lu.env.AXIONIA_WEBHOOK_SECRET,
    d.maintenantMs
  );
  if (!verdict.ok) {
    d.alerteur.signaler({ porte: PORTE, motif: verdict.motif });
    return texte(401, 'signature_refusee');
  }
  d.alerteur.rearmer(PORTE);

  const horsSchema = () => {
    d.alerteur.signaler({ porte: PORTE_CONTENU, motif: 'hors_schema' });
    return texte(422, 'hors_schema');
  };
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corps.octets));
  } catch {
    return horsSchema();
  }
  const enveloppe = enveloppeReconnue.safeParse(brut);
  if (!enveloppe.success) return horsSchema();
  const e = enveloppe.data;
  if (champsInterdits(e as unknown as Record<string, unknown>).length > 0) {
    d.alerteur.signaler({ porte: PORTE_CONTENU, motif: 'frontiere' });
    return texte(422, 'hors_schema');
  }

  const eventType = identifiantDuType(e.event_type);
  let cleMetier: string | null = null;
  if (TYPES_A_CLE_DE_PAIEMENT.includes(eventType)) {
    const paymentId = e.payload.paymentId;
    if (typeof paymentId !== 'string' || paymentId === '' || paymentId.length > CLE_METIER_MAX) {
      return horsSchema();
    }
    cleMetier = paymentId;
  }
  const held = e.schema_version !== SCHEMA_VERSION;

  const inscription: EvenementAInscrire = {
    source: SourceEvenementRecu.axionia,
    eventId: e.event_id,
    eventType,
    schemaVersion: e.schema_version,
    sequence: BigInt(e.sequence),
    sujetRef: sujetRefDe(e.subject_ref),
    cleMetier,
    charge: e.payload,
    payloadHash: createHash('sha256').update(corps.octets).digest('hex'),
    statut: held ? 'held' : 'recu',
    receivedAt: new Date(d.maintenantMs),
    survenuAt: new Date(e.occurred_at),
  };

  let resultat: 'inscrit' | 'doublon';
  try {
    resultat = await d.depot.inscrire(inscription);
  } catch {
    return texte(503, 'inscription_indisponible');
  }
  if (resultat === 'doublon') return Response.json({ duplicate: true });

  if (held) {
    d.alerteur.signaler({ porte: PORTE_CONTENU, motif: 'schema_version_inconnue' });
    return Response.json({ ok: true });
  }
  d.alerteur.rearmer(PORTE_CONTENU);
  try {
    d.declencher();
  } catch {
    // Le travail de fond est relancé au passage suivant : la ligne `recu` l'attend.
  }
  return Response.json({ ok: true });
}

// ── L'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

/** La base dit `doublon` : violation d'unicité, (source, eventId) ou l'index du paiement. */
export function depotDeReception(prisma: PrismaClient): DepotDeReception {
  return {
    async inscrire(e) {
      try {
        await prisma.evenementRecu.create({
          data: { ...e, charge: e.charge as Prisma.InputJsonObject },
        });
        return 'inscrit';
      } catch (erreur) {
        if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
          return 'doublon';
        }
        throw erreur;
      }
    },
  };
}
