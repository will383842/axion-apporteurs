/**
 * SEC-40 (REQ-SEC-061, HYP-W20-LIEN) — les jetons de confirmation à usage unique, et le jeton de la
 * page des droits du contact (DM-59). Ce module tire les jetons, en calcule l'empreinte, et les LIT.
 *
 * CINQ RÈGLES, ET CE QUI LES TIENT.
 *  1. L'ALÉA : 32 octets (256 bits) par jeton, tirés par le générateur cryptographique ; seule
 *     l'EMPREINTE est stockée, un HMAC-SHA-256 sous un secret, séparé par domaine — un accès en
 *     écriture à la base ne fabrique pas un lien, et un jeton de confirmation n'ouvre jamais la page
 *     des droits.
 *  2. L'OUVERTURE (GET) N'ÉCRIT RIEN : `ouvrirLeLien` lit dans une transaction déclarée en LECTURE
 *     SEULE, que la base refuse d'écrire. Un analyseur de liens de messagerie ne répond donc jamais à
 *     la place du contact.
 *  3. LA RÉPONSE (POST) EST À USAGE UNIQUE : `consommerLeJeton` est UNE écriture conditionnelle sur
 *     la demande (`repondu_at` encore nul), jamais un lire-puis-écrire. La première réponse fait foi
 *     pour les DEUX jetons de la demande. Ce qu'elle fait de la réponse (états, journal) appartient à
 *     son appelant, dans la même transaction (DM-41).
 *  4. AUCUN ORACLE : un jeton hors forme, inconnu, révoqué, expiré, déjà consommé, d'une demande non
 *     envoyée ou d'une attribution qui n'est plus provisoire rend `REPONSE_SANS_SUITE` — le MÊME objet
 *     figé, donc les mêmes octets. Le refus de débit est décidé AVANT toute lecture, sans le jeton.
 *  5. AUCUN JETON DANS UN JOURNAL : ce module n'écrit sur aucune sortie, et aucun de ses refus ne
 *     porte le jeton.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ICI : le secret, les clés et le compteur de débit entrent par des
 * ports. Le compteur est celui de l'appelant : ce module ne déclare aucun compteur (le registre
 * unique est `src/server/securite/rate-limit.ts`).
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { CHAMPS_PII, decryptPii, type ClesPii } from '../securite/pii';
import { MODELE_APPORTEUR } from '../auth/lien-magique-depot';

type Tx = Prisma.TransactionClient;

// ── le jeton et son empreinte ────────────────────────────────────────────────────────────────────

const OCTETS_DU_JETON = 32;

/** 32 octets en base64url sans remplissage : 43 caractères, ni plus ni moins. */
function aLaFormeDUnJeton(jeton: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(jeton);
}

/** Un jeton : 256 bits d'aléa cryptographique, en base64url. */
export function tirerUnJeton(): string {
  return randomBytes(OCTETS_DU_JETON).toString('base64url');
}

/** L'empreinte d'un jeton de confirmation : HMAC-SHA-256, domaine `partners.confirmation.v1`. */
export function empreinteDuJetonDeConfirmation(jeton: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`partners.confirmation.v1\u001f${jeton}`)
    .digest('hex');
}

/** L'empreinte du jeton de la page des droits (DM-59) : même HMAC, domaine `partners.droits.v1`. */
export function empreinteDuJetonDesDroits(jeton: string, secret: string): string {
  return createHmac('sha256', secret).update(`partners.droits.v1\u001f${jeton}`).digest('hex');
}

export interface JetonTire {
  /** Le jeton en clair : il part dans le courriel, et nulle part ailleurs. */
  readonly jeton: string;
  readonly empreinte: string;
}

/** Les deux jetons d'une demande (« Oui », « Non »), jamais égaux, avec leurs empreintes. */
export function tirerLesJetonsDeLaDemande(secret: string): {
  readonly oui: JetonTire;
  readonly non: JetonTire;
} {
  const oui = tirerUnJeton();
  let non = tirerUnJeton();
  while (non === oui) non = tirerUnJeton();
  return {
    oui: { jeton: oui, empreinte: empreinteDuJetonDeConfirmation(oui, secret) },
    non: { jeton: non, empreinte: empreinteDuJetonDeConfirmation(non, secret) },
  };
}

// ── la page et ses réponses ──────────────────────────────────────────────────────────────────────

/**
 * Les en-têtes de la page publique du lien (REQ-SEC-061) : aucun référent ne sort l'URL (et son
 * jeton) vers un tiers, aucun moteur ne l'indexe, aucun cache ne la garde.
 */
export const ENTETES_DE_LA_PAGE_DE_CONFIRMATION = Object.freeze({
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'private, no-store',
} as const);

/** La seule réponse à un jeton qui ne vaut rien, quelle qu'en soit la raison : aucun oracle. */
export const REPONSE_SANS_SUITE = Object.freeze({ etat: 'sans_suite' } as const);

/** Le débit est refusé, ou le compteur ne sait pas juger : décidé avant toute lecture du jeton. */
export const REPONSE_A_REESSAYER = Object.freeze({ etat: 'a_reessayer' } as const);

export type SensDuJeton = 'oui' | 'non';

/** Ce que la page révèle (REQ-SEC-061) : l'entreprise, le prénom et le nom de l'apporteur, le sens. */
export interface LienARepondre {
  readonly etat: 'a_repondre';
  readonly sens: SensDuJeton;
  readonly entreprise: string | null;
  readonly apporteur: { readonly prenom: string | null; readonly nom: string | null };
}

/** La réponse retenue : ce que l'appelant (DM-41) traite dans la MÊME transaction. */
export interface ReponseRetenue {
  readonly etat: 'retenue';
  readonly demandeId: string;
  readonly sens: SensDuJeton;
}

/** La page des droits : l'attribution dont le contact exerce ses droits, et rien d'autre. */
export interface DroitsAExercer {
  readonly etat: 'a_exercer';
  readonly attributionId: string;
}

type Refus = typeof REPONSE_SANS_SUITE | typeof REPONSE_A_REESSAYER;

// ── les ports ────────────────────────────────────────────────────────────────────────────────────

export interface PortsDesJetons {
  /** Le secret des empreintes de jetons ; l'appelant le lit de l'environnement. */
  readonly secret: string;
  /** Les clés de déchiffrement du nom de l'apporteur. */
  readonly cles: ClesPii;
  /** Le compteur de débit par empreinte d'adresse, déclaré au registre de l'appelant. */
  compterAdresse(
    sujet: string,
    maintenantMs: number
  ): Promise<{ readonly autorise: boolean; readonly panne: boolean }>;
}

export interface RequeteDuJeton {
  readonly jeton: string;
  /** L'empreinte tronquée de l'adresse du client (REQ-SEC-024), `null` si illisible. */
  readonly empreinteAdresse: string | null;
  readonly maintenantMs: number;
}

/**
 * Le débit d'abord, puis la forme : rien de ce qui précède la lecture de la base ne dépend de
 * l'existence du jeton. Une adresse illisible n'ouvre pas un seau commun : elle est refusée.
 */
async function admettre(requete: RequeteDuJeton, ports: PortsDesJetons): Promise<Refus | null> {
  if (requete.empreinteAdresse === null) return REPONSE_A_REESSAYER;
  const verdict = await ports.compterAdresse(requete.empreinteAdresse, requete.maintenantMs);
  if (!verdict.autorise) return REPONSE_A_REESSAYER;
  if (!aLaFormeDUnJeton(requete.jeton)) return REPONSE_SANS_SUITE;
  return null;
}

/** Une transaction que la base refuse d'écrire : l'ouverture d'un lien ne change rien. */
function enLectureSeule<T>(prisma: PrismaClient, lire: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return lire(tx);
  });
}

function dechiffrer(champ: string, id: string, bloc: Uint8Array | null, cles: ClesPii) {
  return bloc === null ? null : decryptPii({ modele: MODELE_APPORTEUR, champ, id }, bloc, cles);
}

// ── l'ouverture (GET) ────────────────────────────────────────────────────────────────────────────

/**
 * L'ouverture du lien : ce que la page affiche, ou `REPONSE_SANS_SUITE`. Un jeton n'est valable que
 * sur l'émission ACTIVE d'une demande ENVOYÉE, sans réponse, dont l'attribution est encore
 * provisoire (HYP-W20-LIEN). Rien n'est écrit.
 */
export async function ouvrirLeLien(
  prisma: PrismaClient,
  requete: RequeteDuJeton,
  ports: PortsDesJetons
): Promise<LienARepondre | Refus> {
  const refus = await admettre(requete, ports);
  if (refus !== null) return refus;
  const empreinte = empreinteDuJetonDeConfirmation(requete.jeton, ports.secret);
  const [l] = await enLectureSeule(
    prisma,
    (tx) => tx.$queryRaw<
      {
        oui: boolean;
        entreprise: string | null;
        apporteur_id: string;
        nom: Uint8Array | null;
        prenom: Uint8Array | null;
      }[]
    >`
      SELECT (e.jeton_oui_hash = ${empreinte}) AS oui, a.raison_sociale AS entreprise,
        p.id::text AS apporteur_id, p.nom_chiffre AS nom, p.prenom_chiffre AS prenom
      FROM emissions_demande_confirmation e
      JOIN demandes_confirmation d ON d.id = e.demande_id
      JOIN attributions a ON a.id = d.attribution_id
      JOIN apporteurs p ON p.id = a.apporteur_id
      WHERE e.revoquee_at IS NULL
        AND (e.jeton_oui_hash = ${empreinte} OR e.jeton_non_hash = ${empreinte})
        AND d.etat = 'envoyee' AND d.repondu_at IS NULL
        AND a.statut = 'provisoire'`
  );
  if (!l) return REPONSE_SANS_SUITE;
  return {
    etat: 'a_repondre',
    sens: l.oui ? 'oui' : 'non',
    entreprise: l.entreprise,
    apporteur: {
      prenom: dechiffrer(CHAMPS_PII.prenom.chiffre, l.apporteur_id, l.prenom, ports.cles),
      nom: dechiffrer(CHAMPS_PII.nom.chiffre, l.apporteur_id, l.nom, ports.cles),
    },
  };
}

// ── la réponse (POST) ────────────────────────────────────────────────────────────────────────────

/**
 * La réponse au lien, sur le client de la transaction de l'appelant. UNE écriture conditionnelle :
 * la demande ne reçoit `repondu_at` que si elle n'en a pas, ce qui rend la réponse unique pour les
 * deux jetons, même sous des réponses concurrentes (la seconde attend le verrou de ligne, relit la
 * condition, et ne trouve plus rien). L'empreinte d'adresse du clic est posée sur l'émission.
 */
export async function consommerLeJeton(
  tx: Tx,
  requete: RequeteDuJeton,
  ports: PortsDesJetons
): Promise<ReponseRetenue | Refus> {
  const refus = await admettre(requete, ports);
  if (refus !== null) return refus;
  const empreinte = empreinteDuJetonDeConfirmation(requete.jeton, ports.secret);
  const [r] = await tx.$queryRaw<{ demande_id: string; emission_id: string; oui: boolean }[]>`
    UPDATE demandes_confirmation d SET repondu_at = clock_timestamp()
    FROM emissions_demande_confirmation e, attributions a
    WHERE e.demande_id = d.id AND a.id = d.attribution_id
      AND e.revoquee_at IS NULL
      AND (e.jeton_oui_hash = ${empreinte} OR e.jeton_non_hash = ${empreinte})
      AND d.etat = 'envoyee' AND d.repondu_at IS NULL
      AND a.statut = 'provisoire'
    RETURNING d.id::text AS demande_id, e.id::text AS emission_id,
      (e.jeton_oui_hash = ${empreinte}) AS oui`;
  if (!r) return REPONSE_SANS_SUITE;
  await tx.$executeRaw`
    UPDATE emissions_demande_confirmation SET clic_ip_hash = ${requete.empreinteAdresse}
    WHERE id = ${r.emission_id}::uuid AND clic_ip_hash IS NULL`;
  return { etat: 'retenue', demandeId: r.demande_id, sens: r.oui ? 'oui' : 'non' };
}

// ── la page des droits du contact (DM-59) ────────────────────────────────────────────────────────

/**
 * L'ouverture de la page des droits : l'attribution dont le jeton est l'empreinte, tant que son
 * contact n'est pas purgé (la purge efface l'empreinte, DM-48). Sinon `REPONSE_SANS_SUITE`, la même
 * qu'un jeton faux. Rien n'est écrit.
 */
export async function ouvrirLaPageDesDroits(
  prisma: PrismaClient,
  requete: RequeteDuJeton,
  ports: PortsDesJetons
): Promise<DroitsAExercer | Refus> {
  const refus = await admettre(requete, ports);
  if (refus !== null) return refus;
  const empreinte = empreinteDuJetonDesDroits(requete.jeton, ports.secret);
  const [l] = await enLectureSeule(
    prisma,
    (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM attributions
      WHERE jeton_droits_hash = ${empreinte} AND contact_purge_at IS NULL`
  );
  if (!l) return REPONSE_SANS_SUITE;
  return { etat: 'a_exercer', attributionId: l.id };
}
