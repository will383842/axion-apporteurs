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
 *      constant, aucun repli en clair → 401 et une alerte PLAFONNÉE. Le corps n'est PAS parsé avant.
 *      La clé est choisie par `X-Axionia-Kid` dans le trousseau à double clé (QA-T52, REQ-QA-030) :
 *      un kid absent ou inconnu, ou une clé précédente échue, est refusé sans calcul ;
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
 *
 * LA BASCULE DE LA v3 À LA v4 (INT-T76-P ; forme d'A02, #737). Une enveloppe v3 reste TRAITÉE, jugée
 * contre les `$defs` de la v3, tant que la fenêtre ouverte par le PREMIER événement v4 reçu n'est pas
 * refermée (`v3EncoreTraitee`, `BASCULE_CONTRAT_V3_V4_JOURS`) ; au-delà, elle s'inscrit `held`,
 * rejouable, jamais refusée. Avant toute v4, la v3 est la norme.
 *
 * `financement.etape` (v4) : sa clé de fait est `financement.etape:<dossierId>:<etape>`, une fois par
 * étape et par dossier, et un rejeu est un doublon. Une SECONDE ISSUE pour le même dossier (un
 * `accord` après un `refus`, ou l'inverse) est refusée, nommée `issue_contradictoire` (422 et une
 * alerte), jugée dans la transaction de l'inscription, sous un verrou du dossier.
 */
import { createHash, createHmac } from 'node:crypto';
import Ajv, { type ValidateFunction } from 'ajv';
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
import contratV2 from '../../../../packages/contracts/contracts.v2.json';
import contratV3 from '../../../../packages/contracts/contracts.v3.json';
import contratV4 from '../../../../packages/contracts/contracts.v4.json';
import { ENTETE_KID_AXIONIA } from '../../../../packages/contracts/api';
import { cleDuKid, lireTrousseaux, type MotifDeCle, type Trousseau } from '../../../lib/env';
import { v3EncoreTraitee } from '../../../domain/contrat/bascule-v3-v4';
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
  'entete_absent' | 'horodatage_illisible' | 'hors_fenetre' | 'signature_invalide' | MotifDeCle;

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
  kid: string | null,
  trousseau: Trousseau,
  maintenantMs: number
): { ok: true } | { ok: false; motif: MotifDeSignature } {
  if (horodatage === null || signature === null) return { ok: false, motif: 'entete_absent' };
  if (!HORODATAGE.test(horodatage)) return { ok: false, motif: 'horodatage_illisible' };
  if (Math.abs(maintenantMs / 1000 - Number(horodatage)) > TOLERANCE_SIGNATURE_S) {
    return { ok: false, motif: 'hors_fenetre' };
  }
  // Le kid est public : le refuser avant le calcul ne dit rien de la clé.
  const cle = cleDuKid(trousseau, kid, maintenantMs);
  if (!cle.ok) return { ok: false, motif: cle.motif };
  const attendue = signatureAttendue(cle.cle, horodatage, octets);
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

/**
 * INT-T44 (REQ-JUR-029, REQ-DM-036) — les champs du payload que la charge CONSERVÉE ne garde pas.
 * `evenements_recus.charge` est conservée dix ans : ce qui n'entre dans aucun traitement de Partners
 * n'y est pas écrit. Le `payload_hash` reste celui du corps reçu entier, et prouve seul ce qui a été
 * reçu. `reponsesJson` n'est PAS ici : le traitement de la candidature le lit dans la charge, et sa
 * minimisation réécrit la charge au passage à `traite` (tâche à part, arbitrage de la coordination).
 */
export const CHAMPS_NON_CONSERVES = ['utm'] as const;

// ── INT-T45 : les `$defs` fermés du contrat publié ──────────────────────────────────────────────

type ContratPublie = { $defs: Record<string, Record<string, unknown>> };

/**
 * INT-T46-P — les contrats PUBLIÉS, par version. Un `held` se juge contre les `$defs` de SA version,
 * jamais contre ceux de la courante : une facture mise en attente en version 2 ne porte pas
 * le `devisId` que la version 3 exige, et elle est pourtant conforme à ce qu'elle était. Chaque
 * artefact est celui que `pnpm contracts:export` a écrit et que l'empreinte a tenu ; aucun n'est
 * retapé ici. Une version absente de cette table n'a pas de contrat : rien ne s'y juge conforme.
 */
const CONTRATS_PUBLIES: Readonly<Record<number, ContratPublie>> = {
  2: contratV2 as ContratPublie,
  3: contratV3 as ContratPublie,
  4: contratV4 as ContratPublie,
};

/**
 * INT-T76-P — la version que la bascule garde TRAITÉE derrière la courante, le temps de la fenêtre.
 * Toute autre version que ces deux-là est `held`, comme avant.
 */
export const VERSION_EN_BASCULE = 3;

/**
 * Le `$defs` publié de la charge d'un type, dans une version, jamais un schéma retapé ici ; `null`
 * quand la version n'est pas publiée ou ne connaît pas ce type.
 */
function defsPublie(type: TypeEvenement, version: number): Record<string, unknown> | null {
  const contrat = Object.hasOwn(CONTRATS_PUBLIES, version) ? CONTRATS_PUBLIES[version] : undefined;
  const d = contrat?.$defs[`payload_${type.replace('.', '_')}`];
  if (contrat === undefined || d === undefined) return null;
  // Version 4 : une charge référence la définition PARTAGÉE des OPCO (`#/$defs/opco_id`). Compilée
  // seule, elle emporte les `$defs` de SA version, jamais ceux d'une autre.
  return { ...d, $defs: contrat.$defs };
}

/** Le `$defs` de la version COURANTE : il existe pour chaque type, sinon le contrat a divergé. */
function defsDuPayload(type: TypeEvenement): Record<string, unknown> {
  const d = defsPublie(type, SCHEMA_VERSION);
  if (d === null) throw new Error(`contrat_sans_defs : payload_${type.replace('.', '_')}`);
  return d;
}

/**
 * Le même `$defs`, PRIVÉ des `CHAMPS_NON_CONSERVES` : retirés des propriétés et de `required`,
 * jamais réintroduits. C'est contre lui que se juge une charge CONSERVÉE (condition de la lentille
 * sécurité, rattrapage 45) : `utm` est requis à la réception et n'est plus conservé (INT-T44).
 */
function defsDeLaCharge(d: Record<string, unknown>): Record<string, unknown> {
  const exclus: readonly string[] = CHAMPS_NON_CONSERVES;
  const proprietes = (d.properties ?? {}) as Record<string, unknown>;
  const requis = (d.required ?? []) as readonly string[];
  return {
    ...d,
    properties: Object.fromEntries(Object.entries(proprietes).filter(([c]) => !exclus.includes(c))),
    required: requis.filter((c) => !exclus.includes(c)),
  };
}

const VALIDEUR = new Ajv({ strict: false });
const valideurs = new Map<string, ValidateFunction>();

function valideur(cle: string, schema: () => Record<string, unknown>): ValidateFunction {
  let v = valideurs.get(cle);
  if (v === undefined) {
    v = VALIDEUR.compile(schema());
    valideurs.set(cle, v);
  }
  return v;
}

/**
 * Le payload REÇU d'un type, jugé contre le `$defs` publié de ce type dans SA version : la courante
 * par défaut, ou la v3 tant que la bascule la traite. Une version sans contrat publié, ou qui ne
 * connaît pas le type, n'est jamais conforme.
 */
export function payloadConforme(
  type: TypeEvenement,
  payload: unknown,
  version: number = SCHEMA_VERSION
): boolean {
  const d = version === SCHEMA_VERSION ? defsDuPayload(type) : defsPublie(type, version);
  if (d === null) return false;
  return valideur(`recu:v${version}:${type}`, () => d)(payload);
}

/**
 * La charge CONSERVÉE d'un type — celle d'un `held` qu'on rejoue après une montée de version —,
 * jugée par la MÊME validation, contre le `$defs` de SA version (`schemaVersion` de la ligne),
 * privé des champs non conservés. Une version sans contrat publié, ou qui ne connaît pas le type,
 * n'est jamais conforme : le rejeu échoue fermé.
 */
export function chargeConforme(type: TypeEvenement, charge: unknown, version: number): boolean {
  const d = defsPublie(type, version);
  if (d === null) return false;
  return valideur(`conserve:v${version}:${type}`, () => defsDeLaCharge(d))(charge);
}

/** La charge conservée : le payload reçu, sans les champs de `CHAMPS_NON_CONSERVES`. */
export function chargeConservee(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([cle]) => !(CHAMPS_NON_CONSERVES as readonly string[]).includes(cle)
    )
  );
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
  /**
   * Inscrit, ou dit `doublon` quand la BASE refuse la seconde ligne, ou `issue_contradictoire`
   * quand un `financement.etape` porte la seconde issue d'un dossier (INT-T76-P).
   */
  inscrire(e: EvenementAInscrire): Promise<'inscrit' | 'doublon' | 'issue_contradictoire'>;
  /**
   * INT-T76-P — la réception du PREMIER événement de la version courante, ou `null` s'il n'y en a
   * encore aucun : le point de départ de la fenêtre de bascule, un fait lu en base.
   */
  premiereReceptionDeLaVersionCourante(): Promise<Date | null>;
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
  const lu = lireTrousseaux(d.environnement, d.maintenantMs);
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
    requete.headers.get(ENTETE_KID_AXIONIA),
    lu.trousseaux.AXIONIA_WEBHOOK_SECRET,
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
  // INT-T76-P : la courante est toujours traitée ; la v3 l'est tant que la fenêtre de bascule n'est
  // pas refermée ; toute autre version est `held`.
  let traitee = e.schema_version === SCHEMA_VERSION;
  if (e.schema_version === VERSION_EN_BASCULE) {
    let premiere: Date | null;
    try {
      premiere = await d.depot.premiereReceptionDeLaVersionCourante();
    } catch {
      return texte(503, 'inscription_indisponible');
    }
    traitee = v3EncoreTraitee(premiere === null ? null : premiere.getTime(), d.maintenantMs);
  }
  const held = !traitee;
  // INT-T45 : la charge d'une version traitée est jugée contre le `$defs` FERMÉ de son type, dans SA
  // version ; celle d'une version `held` le sera à son rejeu (`chargeConforme`).
  if (!held && !payloadConforme(e.event_type, e.payload, e.schema_version)) return horsSchema();
  // INT-T76-P : la clé de fait d'une étape de financement, une fois par étape et par dossier. Sa forme
  // est tenue par le `$defs` qu'on vient de juger.
  if (!held && eventType === TypeEvenementRecu.financement_etape) {
    const cle = `${e.event_type}:${String(e.payload.dossierId)}:${String(e.payload.etape)}`;
    if (cle.length > CLE_METIER_MAX) return horsSchema();
    cleMetier = cle;
  }

  const inscription: EvenementAInscrire = {
    source: SourceEvenementRecu.axionia,
    eventId: e.event_id,
    eventType,
    schemaVersion: e.schema_version,
    sequence: BigInt(e.sequence),
    sujetRef: sujetRefDe(e.subject_ref),
    cleMetier,
    charge: chargeConservee(e.payload),
    payloadHash: createHash('sha256').update(corps.octets).digest('hex'),
    statut: held ? 'held' : 'recu',
    receivedAt: new Date(d.maintenantMs),
    survenuAt: new Date(e.occurred_at),
  };

  let resultat: 'inscrit' | 'doublon' | 'issue_contradictoire';
  try {
    resultat = await d.depot.inscrire(inscription);
  } catch {
    return texte(503, 'inscription_indisponible');
  }
  if (resultat === 'doublon') return Response.json({ duplicate: true });
  if (resultat === 'issue_contradictoire') {
    d.alerteur.signaler({ porte: PORTE_CONTENU, motif: 'issue_contradictoire' });
    return texte(422, 'issue_contradictoire');
  }

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

/** Les deux issues d'un dossier de financement : l'une exclut l'autre. */
const ISSUE_CONTRAIRE: Readonly<Record<string, string>> = { accord: 'refus', refus: 'accord' };

/** Le domaine du verrou d'un dossier de financement, à la réception. */
const DOMAINE_DU_VERROU_DE_FINANCEMENT = 'reception.financement.etape';

/**
 * La base dit `doublon` : violation d'unicité, (source, eventId) ou l'index de la clé métier. Une
 * ISSUE de financement s'inscrit dans une transaction, sous le verrou de son dossier : la seconde issue
 * d'un même dossier y est vue, et refusée, avant toute écriture.
 */
export function depotDeReception(prisma: PrismaClient): DepotDeReception {
  return {
    async inscrire(e) {
      const data = { ...e, charge: e.charge as Prisma.InputJsonObject };
      const contraire =
        e.eventType === TypeEvenementRecu.financement_etape
          ? ISSUE_CONTRAIRE[String(e.charge.etape)]
          : undefined;
      try {
        if (contraire === undefined) {
          await prisma.evenementRecu.create({ data });
          return 'inscrit';
        }
        const dossierId = String(e.charge.dossierId);
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DOMAINE_DU_VERROU_DE_FINANCEMENT}), hashtext(${dossierId}))`;
          const deja = await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM "evenements_recus"
            WHERE "event_type" = 'financement_etape'
              AND "charge"->>'dossierId' = ${dossierId} AND "charge"->>'etape' = ${contraire}`;
          if (Number(deja[0]?.n ?? 0) > 0) return 'issue_contradictoire' as const;
          await tx.evenementRecu.create({ data });
          return 'inscrit' as const;
        });
      } catch (erreur) {
        if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
          return 'doublon';
        }
        throw erreur;
      }
    },
    async premiereReceptionDeLaVersionCourante() {
      const premiere = await prisma.evenementRecu.findFirst({
        where: { source: SourceEvenementRecu.axionia, schemaVersion: SCHEMA_VERSION },
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        select: { receivedAt: true },
      });
      return premiere?.receivedAt ?? null;
    },
  };
}
