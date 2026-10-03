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
 * CŒUR PUR, PORTS INJECTÉS, comme la session : aucune lecture d'environnement ici.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SEUILS } from '../../domain/seuils/ssot';

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
    .update([DOMAINE_PAS_MOI, jetonId, depotId].join('\u001f'), 'utf8')
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
  lireJeton(
    id: string
  ): Promise<{ id: string; apporteurId: string; revoqueAt: Date | null } | null>;
  lireDepot(id: string): Promise<{ apporteurId: string } | null>;
  /** Révocation CONDITIONNELLE (`revoque_at` nul) : rend le nombre de lignes révoquées. */
  revoquer(id: string, at: Date): Promise<number>;
}

/** CONFIRMER : révoque le jeton nommé, s'il appartient à l'apporteur du dépôt. Idempotente. */
export async function confirmerPasMoi(
  lien: LienPasMoi,
  ports: PortsDuPasMoi
): Promise<typeof REPONSE_PAS_MOI> {
  if (!verifierPasMoi(lien, ports.cle)) return REPONSE_PAS_MOI;
  const jeton = await ports.lireJeton(lien.jetonId);
  const depot = await ports.lireDepot(lien.depotId);
  if (jeton === null || depot === null || jeton.apporteurId !== depot.apporteurId) {
    return REPONSE_PAS_MOI;
  }
  if (jeton.revoqueAt === null) await ports.revoquer(jeton.id, ports.maintenant());
  return REPONSE_PAS_MOI;
}
