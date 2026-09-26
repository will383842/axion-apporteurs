/**
 * Le webhook des rebonds du relais de courriel — INT-T10 (REQ-INT-023, REQ-SEC-010).
 *
 * L'ORDRE, et chaque étape refuse sans rien écrire :
 *   1. le secret dédié, jugé avec TOUS les secrets (`lireEnvironnement`) → 503 ;
 *   2. le corps, borné à 128 Ko avant d'être lu en entier → 413 ;
 *   3. l'en-tête `Producer-Signature` → 401 et une alerte PLAFONNÉE ;
 *   4. la lecture de la charge. SEUL un rebond DÉFINITIF ajoute une ligne à la liste de
 *      suppression, et une seule fois par adresse (unicité de l'empreinte). Un rebond temporaire est
 *      journalisé et n'ajoute rien. Un nom d'événement inconnu, une charge illisible, une adresse
 *      absente ou ambiguë rendent 200 SANS effet et sont alertés — jamais « supprimé par défaut » :
 *      un relais qui changerait sa charge ne doit pas vider la liste des destinataires en silence,
 *      et un 4xx répété le ferait retenter puis désabonner le webhook.
 *
 * LA FORME DE L'EN-TÊTE n'est pas encore confrontée à la documentation du relais
 * (`docs/tiers/zeptomail.md` §2) : elle est celle que lit notre producteur voisin, axionia
 * (`src/server/email/zeptomail-webhook-signature.ts`), qui cite l'exemple de la documentation —
 * `ts=<millisecondes>;s=<base64>;s-algorithm=HmacSHA256`, le bourrage `=` percent-encodé, le
 * condensat portant sur le CORPS seul (l'horodatage n'y entre pas), et une seconde tentative sur le
 * corps percent-décodé, que la documentation prescrit. Aucune des deux formes ne s'obtient sans la clé.
 *
 * LIMITE DÉCLARÉE. L'horodatage n'est pas dans le condensat : une livraison capturée reste rejouable
 * dans sa fenêtre de 300 s, et seule la fenêtre la borne. Rejouer un rebond définitif ne fait rien de
 * plus — l'adresse est déjà supprimée.
 */
import { createHmac } from 'node:crypto';
import type { MotifSuppressionCourriel, PrismaClient } from '@prisma/client';
import { lireEnvironnement } from '../../../lib/env';
import type { Journal } from '../../../lib/logger';
import { clesPii, empreinteRecherche } from '../../securite/pii';
import {
  TOLERANCE_SIGNATURE_S,
  egalATempsConstant,
  lireCorpsBorne,
  type AlerteurPlafonne,
} from '../../securite/primitives-de-porte';

/** Les deux familles d'alertes : l'authentification, et le contenu d'un envoi authentifié. */
export const PORTE_ZEPTOMAIL = 'zeptomail';
export const PORTE_ZEPTOMAIL_CONTENU = 'zeptomail.contenu';

export const ENTETE_SIGNATURE_ZEPTOMAIL = 'producer-signature';

// ── La signature ────────────────────────────────────────────────────────────────────────────────

export type MotifDeSignatureZeptomail =
  | 'entete_absent'
  | 'entete_illisible'
  | 'algorithme_refuse'
  | 'hors_fenetre'
  | 'signature_invalide';

/** Le condensat attendu : 32 octets, soit 44 caractères base64 bourrage compris. */
const OCTETS_DU_CONDENSAT = 32;

function champsDeLEntete(entete: string): { ts: string; s: string; algo: string } | null {
  const champs = new Map<string, string>();
  for (const partie of entete.split(';')) {
    const i = partie.indexOf('=');
    if (i <= 0) continue;
    // Tout ce qui suit le PREMIER `=` : le bourrage base64 se termine par des `=`.
    champs.set(partie.slice(0, i).trim(), partie.slice(i + 1).trim());
  }
  const ts = champs.get('ts');
  const s = champs.get('s');
  const algo = champs.get('s-algorithm');
  return ts && s && algo ? { ts, s, algo } : null;
}

function decoderPourcent(valeur: string): string | null {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return null;
  }
}

/** Temps constant, sur la forme base64 canonique des 32 octets présentés. */
function condensatEgal(presente: Buffer, attendu: Buffer): boolean {
  return egalATempsConstant(presente.toString('base64'), attendu.toString('base64'));
}

export function verifierSignatureZeptomail(
  octets: Uint8Array,
  entete: string | null,
  cle: string,
  maintenantMs: number
): { ok: true } | { ok: false; motif: MotifDeSignatureZeptomail } {
  if (entete === null || entete === '') return { ok: false, motif: 'entete_absent' };
  const champs = champsDeLEntete(entete);
  if (champs === null || !/^[0-9]{1,16}$/.test(champs.ts))
    return { ok: false, motif: 'entete_illisible' };
  if (champs.algo.toLowerCase() !== 'hmacsha256') return { ok: false, motif: 'algorithme_refuse' };
  // MILLISECONDES : les lire comme des secondes rendrait toute livraison « périmée ».
  if (Math.abs(maintenantMs - Number(champs.ts)) / 1000 > TOLERANCE_SIGNATURE_S) {
    return { ok: false, motif: 'hors_fenetre' };
  }
  const s = decoderPourcent(champs.s);
  const presente = s === null ? Buffer.alloc(0) : Buffer.from(s, 'base64');
  if (presente.length !== OCTETS_DU_CONDENSAT) return { ok: false, motif: 'signature_invalide' };

  const surLeCorps = createHmac('sha256', cle).update(octets).digest();
  if (condensatEgal(presente, surLeCorps)) return { ok: true };
  // Seconde tentative : le corps percent-décodé, que la documentation du relais prescrit.
  const texte = new TextDecoder('utf-8').decode(octets);
  const decode = decoderPourcent(texte.replace(/\+/g, ' '));
  if (decode === null || decode === texte) return { ok: false, motif: 'signature_invalide' };
  const surLeDecode = createHmac('sha256', cle).update(decode, 'utf8').digest();
  return condensatEgal(presente, surLeDecode)
    ? { ok: true }
    : { ok: false, motif: 'signature_invalide' };
}

// ── La lecture d'une charge ─────────────────────────────────────────────────────────────────────

export type LectureDeRebond =
  | { genre: 'definitif'; adresse: string; survenuAt: Date | null }
  | { genre: 'temporaire' }
  | { genre: 'inconnu'; motif: 'evenement_inconnu' | 'forme_inconnue' };

function objet(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Les noms que le relais donne à ses rebonds, tels que notre producteur voisin les lit. */
const DEFINITIF = 'hardbounce';
const TEMPORAIRE = 'softbounce';

/** Les adresses de `event_message.email_info.to[].email_address` — tableau d'objets, ou objet seul. */
function adressesDe(message: Record<string, unknown>): string[] {
  const to = objet(message.email_info)?.to;
  if (!Array.isArray(to)) return [];
  const adresses = new Set<string>();
  for (const entree of to) {
    const brut = objet(entree)?.email_address;
    for (const a of Array.isArray(brut) ? brut : [brut]) {
      const adresse = objet(a)?.address;
      if (typeof adresse === 'string' && adresse.trim() !== '')
        adresses.add(adresse.trim().toLowerCase());
    }
  }
  return [...adresses];
}

export function lireRebond(charge: unknown): LectureDeRebond {
  const racine = objet(charge);
  if (racine === null) return { genre: 'inconnu', motif: 'forme_inconnue' };
  const nom = typeof racine.event_name === 'string' ? racine.event_name.toLowerCase() : null;
  if (nom === TEMPORAIRE) return { genre: 'temporaire' };
  if (nom !== DEFINITIF) return { genre: 'inconnu', motif: 'evenement_inconnu' };
  const message = objet(racine.event_message);
  if (message === null) return { genre: 'inconnu', motif: 'forme_inconnue' };
  const adresses = adressesDe(message);
  // Aucune adresse, ou plusieurs : on ne sait pas laquelle a rebondi, et on ne devine pas.
  if (adresses.length !== 1) return { genre: 'inconnu', motif: 'forme_inconnue' };
  const temps = objet(objet(message.event_data)?.details)?.time;
  const instant = typeof temps === 'string' ? new Date(temps) : null;
  return {
    genre: 'definitif',
    adresse: adresses[0]!,
    survenuAt: instant !== null && !Number.isNaN(instant.getTime()) ? instant : null,
  };
}

// ── La route ────────────────────────────────────────────────────────────────────────────────────

export interface SuppressionAInscrire {
  emailHash: string;
  motif: MotifSuppressionCourriel;
  survenuAt: Date;
  creeAt: Date;
}

export interface DepotDesSuppressions {
  /** Idempotent : une adresse déjà supprimée rend `deja` et n'écrit rien. */
  supprimer(s: SuppressionAInscrire): Promise<'ajoutee' | 'deja'>;
}

export interface DependancesDesRebonds {
  readonly environnement: Readonly<Record<string, string | undefined>>;
  readonly maintenantMs: number;
  depot: DepotDesSuppressions;
  readonly alerteur: AlerteurPlafonne;
  readonly journal: Pick<Journal, 'info'>;
}

function texte(statut: number, corps: string): Response {
  return new Response(corps, { status: statut });
}

export async function recevoirRebond(
  requete: Request,
  d: DependancesDesRebonds
): Promise<Response> {
  const lu = lireEnvironnement(d.environnement);
  if (!lu.ok) return texte(503, 'rebonds_indisponibles');

  const corps = await lireCorpsBorne(requete);
  if (!corps.ok)
    return corps.motif === 'corps_trop_grand'
      ? texte(413, 'corps_trop_grand')
      : texte(400, 'corps_illisible');

  const verdict = verifierSignatureZeptomail(
    corps.octets,
    requete.headers.get(ENTETE_SIGNATURE_ZEPTOMAIL),
    lu.env.ZEPTOMAIL_WEBHOOK_SECRET,
    d.maintenantMs
  );
  if (!verdict.ok) {
    d.alerteur.signaler({ porte: PORTE_ZEPTOMAIL, motif: verdict.motif });
    return texte(401, 'signature_refusee');
  }
  d.alerteur.rearmer(PORTE_ZEPTOMAIL);

  const sansEffet = (motif: string) => {
    d.alerteur.signaler({ porte: PORTE_ZEPTOMAIL_CONTENU, motif });
    return Response.json({ ok: true });
  };
  let charge: unknown;
  try {
    charge = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corps.octets));
  } catch {
    return sansEffet('forme_inconnue');
  }
  const rebond = lireRebond(charge);
  if (rebond.genre === 'inconnu') return sansEffet(rebond.motif);
  if (rebond.genre === 'temporaire') {
    d.journal.info('rebond_temporaire');
    return Response.json({ ok: true });
  }

  let emailHash: string;
  try {
    emailHash = empreinteRecherche('courriel', rebond.adresse, clesPii(d.environnement));
  } catch {
    return sansEffet('forme_inconnue');
  }
  const maintenant = new Date(d.maintenantMs);
  try {
    await d.depot.supprimer({
      emailHash,
      motif: 'rebond_definitif',
      survenuAt: rebond.survenuAt ?? maintenant,
      creeAt: maintenant,
    });
  } catch {
    // La liste n'est pas alimentée : le relais retentera, et la suppression est idempotente.
    return texte(503, 'rebonds_indisponibles');
  }
  d.alerteur.rearmer(PORTE_ZEPTOMAIL_CONTENU);
  return Response.json({ ok: true });
}

// ── L'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

export function depotDesSuppressions(prisma: PrismaClient): DepotDesSuppressions {
  return {
    async supprimer(s) {
      // L'empreinte a été produite par `empreinteRecherche` dans `recevoirRebond`, seul chemin qui
      // construit une `SuppressionAInscrire`. L'unicité est celle de la BASE.
      const r = await prisma.suppressionCourriel.createMany({ data: [s], skipDuplicates: true });
      return r.count === 1 ? 'ajoutee' : 'deja';
    },
  };
}
