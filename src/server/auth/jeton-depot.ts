/**
 * jeton-depot.ts — le jeton de dépôt privé (SEC-11, REQ-SEC-005, REQ-SEC-006, REQ-DM-012, HYP-C6).
 *
 * L'ÉCHÉANCE SE DÉRIVE. Aucune colonne ne la porte : un jeton sert de `cree_at` jusqu'à `cree_at`
 * plus `JETON_DEPOT_DUREE_MOIS` mois civils (SSOT), échéance exclue, tant qu'il n'est pas révoqué.
 *
 * LE LIEN « CE N'EST PAS MOI » EST SANS ÉTAT (décision 15 de `partners/ADR-0013`). Il porte
 * l'identifiant du jeton, celui du dépôt et le `kid`, signés par HMAC-SHA-256 sous `MAGIC_LINK_SECRET`,
 * entrée séparée par domaine : `partners.pas-moi.v1`, U+001F, le jeton, U+001F, le dépôt. La signature
 * se compare à temps constant ; une clé retirée est refusée (pas de double clé).
 *   — OUVRIR le lien ne lit ni n'écrit rien : la page de confirmation est la même pour tout lien. Les
 *     analyseurs de liens des messageries ouvrent les URL sans que personne n'ait cliqué.
 *   — CONFIRMER, depuis cette page, révoque le jeton nommé, et lui seul, si la signature est bonne et
 *     si le jeton appartient à l'apporteur du dépôt. La révocation est conditionnelle (`revoque_at`
 *     nul) : idempotente. Tout autre cas rend la MÊME réponse sans rien écrire.
 *
 *     Le jeton doit être celui qui a PORTÉ ce dépôt : un lien ne révoque jamais un autre jeton.
 *
 * UN SEUL JETON ACTIF PAR APPORTEUR, et c'est la BASE qui le tient : l'index unique partiel
 * `jetons_depot_un_actif_par_apporteur` (`WHERE revoque_at IS NULL`). Le code n'y ajoute rien.
 *
 * QUI REÇOIT UN JETON : les statuts d'ouverture PLEINE de l'espace (`niveauDAcces`), relus sous
 * verrou de la ligne de l'apporteur dans la transaction qui écrit. Un apporteur résilié n'en reçoit
 * aucun (REQ-SEC-032) ; un apporteur suspendu garde le sien et peut le régénérer (REQ-SEC-019).
 *
 * RÉVOQUÉ À LA RÉSILIATION, JAMAIS À LA SUSPENSION. `revoquerJetonsALaResiliation` s'appelle dans la
 * transaction de résiliation, APRÈS l'écriture du statut, et ne révoque rien si le statut relu n'est
 * pas `resilie` : appelée par erreur sur une suspension, elle n'a aucun effet.
 *
 * Le cœur du lien est pur, ses ports injectés ; les fonctions de base reçoivent le client Prisma.
 * Aucune lecture d'environnement ici.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { niveauDAcces } from '../../domain/apporteur/acces-espace';
import {
  empreinteJetonDepot,
  nouveauJetonDepot,
  type SourceAleatoire,
} from '../../domain/apporteur/identifiants';

// ── l'échéance ───────────────────────────────────────────────────────────────────────────────────

/** L'échéance d'un jeton : `creeAt` plus la durée de la SSOT, en mois civils UTC. */
export function echeanceDuJeton(creeAt: Date): Date {
  const echeance = new Date(creeAt.getTime());
  echeance.setUTCMonth(echeance.getUTCMonth() + SEUILS.JETON_DEPOT_DUREE_MOIS.valeur);
  return echeance;
}

/** Vrai si le jeton sert encore à `maintenant` : non révoqué, et avant son échéance. */
export function jetonUtilisable(
  jeton: { readonly creeAt: Date; readonly revoqueAt: Date | null },
  maintenant: Date
): boolean {
  return jeton.revoqueAt === null && maintenant.getTime() < echeanceDuJeton(jeton.creeAt).getTime();
}

// ── le lien « ce n'est pas moi » ─────────────────────────────────────────────────────────────────

export const DOMAINE_PAS_MOI = 'partners.pas-moi.v1';

/** La clé du lien : `MAGIC_LINK_SECRET` et son `kid`. */
export interface CleDuLien {
  readonly secret: string;
  readonly kid: string;
}

export interface LienPasMoi {
  readonly jetonId: string;
  readonly depotId: string;
  readonly kid: string;
  readonly signature: string;
}

/** La signature : 64 caractères hexadécimaux minuscules. */
export function signerPasMoi(jetonId: string, depotId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update([DOMAINE_PAS_MOI, jetonId, depotId].join('\u001f'))
    .digest('hex');
}

export function lienPasMoi(jetonId: string, depotId: string, cle: CleDuLien): LienPasMoi {
  return { jetonId, depotId, kid: cle.kid, signature: signerPasMoi(jetonId, depotId, cle.secret) };
}

const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

/** Vrai si le lien est signé sous la clé COURANTE, pour CE jeton et CE dépôt. */
export function verifierPasMoi(lien: LienPasMoi, cle: CleDuLien): boolean {
  if (lien.kid !== cle.kid || !SIGNATURE_HEX.test(lien.signature)) return false;
  const attendue = Buffer.from(signerPasMoi(lien.jetonId, lien.depotId, cle.secret), 'hex');
  return timingSafeEqual(attendue, Buffer.from(lien.signature, 'hex'));
}

/** La page qu'ouvre le lien : la même pour tout lien, un formulaire qui confirme. */
export const PAGE_DE_CONFIRMATION = Object.freeze({ etat: 'a_confirmer' as const });

/** La réponse de la confirmation : la même dans tous les cas. */
export const REPONSE_PAS_MOI = Object.freeze({ etat: 'traite' as const });

/** OUVRIR ne lit ni n'écrit rien (décision 15) : la page ne dépend pas du lien. */
export function ouvrirPasMoi(_lien: LienPasMoi): typeof PAGE_DE_CONFIRMATION {
  return PAGE_DE_CONFIRMATION;
}

export interface PortsDuPasMoi {
  readonly cle: CleDuLien;
  maintenant(): Date;
  lireJeton(id: string): Promise<{ id: string; apporteurId: string } | null>;
  lireDepot(
    id: string
  ): Promise<{ apporteurId: string | null; jetonDepotId: string | null } | null>;
  /** Révocation CONDITIONNELLE (`revoque_at` nul) : rend le nombre de lignes révoquées. */
  revoquer(id: string, at: Date): Promise<number>;
}

/** CONFIRMER : révoque le jeton nommé, s'il a porté ce dépôt, de cet apporteur. Idempotente. */
export async function confirmerPasMoi(
  lien: LienPasMoi,
  ports: PortsDuPasMoi
): Promise<typeof REPONSE_PAS_MOI> {
  if (!verifierPasMoi(lien, ports.cle)) return REPONSE_PAS_MOI;
  const jeton = await ports.lireJeton(lien.jetonId);
  const depot = await ports.lireDepot(lien.depotId);
  if (
    jeton === null ||
    depot === null ||
    depot.jetonDepotId !== jeton.id ||
    jeton.apporteurId !== depot.apporteurId
  ) {
    return REPONSE_PAS_MOI;
  }
  await ports.revoquer(jeton.id, ports.maintenant());
  return REPONSE_PAS_MOI;
}

/** L'adaptateur Prisma des ports du lien : lectures étroites, révocation conditionnelle. */
export function portsDuPasMoi(
  prisma: PrismaClient,
  cle: CleDuLien,
  maintenant: () => Date
): PortsDuPasMoi {
  return {
    cle,
    maintenant,
    lireJeton: (id) =>
      prisma.jetonDepot.findUnique({
        where: { id },
        select: { id: true, apporteurId: true },
      }),
    lireDepot: (id) =>
      prisma.attribution.findUnique({
        where: { id },
        select: { apporteurId: true, jetonDepotId: true },
      }),
    async revoquer(id, at) {
      const r = await prisma.jetonDepot.updateMany({
        where: { id, revoqueAt: null },
        data: { revoqueAt: at },
      });
      return r.count;
    },
  };
}

// ── l'émission, la régénération, la révocation ──────────────────────────────────────────────────

/** L'index qui tient « un seul jeton actif par apporteur » (migration SQL brut). */
export const INDEX_UN_ACTIF_PAR_APPORTEUR = 'jetons_depot_un_actif_par_apporteur';

export type MotifRefusEmission = 'statut_sans_jeton' | 'jeton_actif_existant';

export class ErreurEmissionJeton extends Error {
  readonly code: MotifRefusEmission;

  constructor(code: MotifRefusEmission) {
    super(`${code} : aucun jeton de dépôt émis`);
    this.name = 'ErreurEmissionJeton';
    this.code = code;
  }
}

export interface ContexteDEmission {
  readonly source: SourceAleatoire;
  readonly maintenant: Date;
}

/** Un jeton émis : le CLAIR, remis une seule fois, et l'identifiant de sa ligne. */
export interface JetonEmis {
  readonly id: string;
  readonly clair: string;
}

/** Le statut de l'apporteur, ligne VERROUILLÉE jusqu'à la fin de la transaction ; nul s'il n'existe pas. */
async function statutVerrouille(
  tx: Prisma.TransactionClient,
  apporteurId: string
): Promise<string | null> {
  const lignes = await tx.$queryRaw<{ statut: string }[]>`
    SELECT statut::text AS statut FROM apporteurs WHERE id = ${apporteurId}::uuid FOR UPDATE`;
  return lignes[0]?.statut ?? null;
}

async function inserer(
  tx: Prisma.TransactionClient,
  apporteurId: string,
  ctx: ContexteDEmission
): Promise<JetonEmis> {
  const { clair, enregistrement } = nouveauJetonDepot(ctx.source, ctx.maintenant.getTime());
  try {
    const ligne = await tx.jetonDepot.create({
      data: {
        apporteurId,
        tokenHash: enregistrement.tokenHash,
        creeAt: new Date(enregistrement.creeAt),
      },
      select: { id: true },
    });
    return { id: ligne.id, clair };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      /apporteur_id|un_actif_par_apporteur/.test(JSON.stringify(e.meta ?? {}))
    ) {
      throw new ErreurEmissionJeton('jeton_actif_existant');
    }
    throw e;
  }
}

async function exigerStatutAvecJeton(
  tx: Prisma.TransactionClient,
  apporteurId: string
): Promise<void> {
  if (niveauDAcces(await statutVerrouille(tx, apporteurId)) !== 'plein') {
    throw new ErreurEmissionJeton('statut_sans_jeton');
  }
}

/**
 * ÉMET le premier jeton d'un apporteur. S'il en a déjà un actif, la BASE refuse
 * (`jeton_actif_existant`) : remplacer un jeton, c'est `regenererJetonDepot`.
 */
export async function emettreJetonDepot(
  prisma: PrismaClient,
  apporteurId: string,
  ctx: ContexteDEmission
): Promise<JetonEmis> {
  return prisma.$transaction(async (tx) => {
    await exigerStatutAvecJeton(tx, apporteurId);
    return inserer(tx, apporteurId, ctx);
  });
}

/**
 * RÉGÉNÈRE : révoque le jeton actif puis en émet un neuf, dans UNE transaction. Si l'émission
 * échoue, la révocation est annulée avec elle : l'apporteur n'est jamais laissé sans jeton.
 */
export async function regenererJetonDepot(
  prisma: PrismaClient,
  apporteurId: string,
  ctx: ContexteDEmission
): Promise<JetonEmis> {
  return prisma.$transaction(async (tx) => {
    await exigerStatutAvecJeton(tx, apporteurId);
    await tx.jetonDepot.updateMany({
      where: { apporteurId, revoqueAt: null },
      data: { revoqueAt: ctx.maintenant },
    });
    return inserer(tx, apporteurId, ctx);
  });
}

/**
 * La part « jeton » de la transaction de RÉSILIATION (REQ-SEC-032) : révoque le jeton actif si le
 * statut relu est `resilie`, et rien sinon — une suspension ne révoque pas (REQ-SEC-019). Rend le
 * nombre de jetons révoqués ; rejouée, elle rend 0.
 */
export async function revoquerJetonsALaResiliation(
  tx: Prisma.TransactionClient,
  apporteurId: string,
  at: Date
): Promise<number> {
  if ((await statutVerrouille(tx, apporteurId)) !== 'resilie') return 0;
  const r = await tx.jetonDepot.updateMany({
    where: { apporteurId, revoqueAt: null },
    data: { revoqueAt: at },
  });
  return r.count;
}

/** Le jeton que désigne ce clair, s'il sert encore à `maintenant` ; nul sinon, sans dire pourquoi. */
export async function trouverJetonUtilisable(
  prisma: PrismaClient,
  clair: string,
  maintenant: Date
): Promise<{ id: string; apporteurId: string } | null> {
  const jeton = await prisma.jetonDepot.findUnique({
    where: { tokenHash: empreinteJetonDepot(clair) },
    select: { id: true, apporteurId: true, creeAt: true, revoqueAt: true },
  });
  if (jeton === null || !jetonUtilisable(jeton, maintenant)) return null;
  return { id: jeton.id, apporteurId: jeton.apporteurId };
}
