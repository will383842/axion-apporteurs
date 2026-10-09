/**
 * SEC-18 (REQ-SEC-031, REQ-ARG-012) — l'ouverture DIFFÉRÉE des anomalies d'auto-parrainage, dans la
 * forme d'A02 (2026-10-03, PR 601).
 *
 * UN TRAITEMENT DISTINCT ET DIFFÉRÉ, JAMAIS AU MOMENT DU GESTE (DM-12, texte de la juriste). La
 * candidature et le RIB de l'apporteur n'ouvrent rien. Cette tâche du lanceur lit au journal, dans
 * l'ordre et depuis son dernier passage, les NAISSANCES qui l'intéressent :
 *   — une candidature : `apporteur_statut_modifie`, `de` nul, sur l'agrégat apporteur ;
 *   — une pièce RIB : `piece_kyc_statut_modifie`, `de` nul, `type` `rib`, sur l'agrégat de la pièce.
 * Elle juge les empreintes par `src/server/parrainage/anti-auto-parrainage.ts`, en lecture seule.
 *
 * L'OUVERTURE, DANS SA PROPRE TRANSACTION, PAR FILLEUL : une seule instruction idempotente
 * (`INSERT … ON CONFLICT … DO NOTHING RETURNING`), que l'index unique partiel
 * `anomalies_auto_parrainage_une_ouverte` tranche ; et, SEULEMENT si une ligne est rendue,
 * l'événement `anomalie_statut_modifie` (`de` nul vers `ouverte`, acteur `systeme`) sur l'agrégat
 * de l'anomalie. Aucun événement de l'agrégat apporteur n'est écrit dans cette transaction.
 *
 * LE CURSEUR ET LA CADENCE. Le passage rend l'identifiant du dernier événement lu (`curseur`) et
 * l'heure de son passage effectif (`passeAtMs`) ; le lanceur les écrit au battement, et le passage
 * suivant les y relit. Avant `AUTO_PARRAINAGE_CADENCE_MINUTES`, le passage rend le même curseur sans
 * rien lire. La lecture ne remonte jamais plus loin que `AUTO_PARRAINAGE_FENETRE_JOURS` : au premier
 * passage, ou après une panne, elle reste bornée.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { SEUILS } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR, MS_PAR_MINUTE } from '../../domain/temps/calendrier-civil';
import type { LigneJournal } from '../../domain/evenement/journal';
import { ajouterEvenement, lireJournalParLots, type NouvelEvenement } from '../evenement/journal';
import {
  famillesDe,
  soupconsALaCandidature,
  soupconsAuChangementDeRib,
  type LigneDuJournal,
  type MomentDuControle,
  type Soupcon,
} from '../parrainage/anti-auto-parrainage';

/** La clé de la tâche au registre (`registre.ts`). */
export const TACHE_AUTO_PARRAINAGE = 'auto_parrainage_ouvrir' as const;

/** Un lot de lecture du journal : la tâche reprend au lot suivant, dans le même passage. */
/** Les deux types d'événement qui portent une naissance : candidature et pièce KYC. */
const TYPES_DE_NAISSANCE: ReadonlySet<string> = new Set([
  'apporteur_statut_modifie',
  'piece_kyc_statut_modifie',
]);

export interface PortsDeLOuverture {
  maintenant(): Date;
  /** Le curseur et l'heure du dernier passage effectif, relus au battement ; `null` au premier. */
  precedent(): Promise<{ curseur: number; passeAtMs: number } | null>;
  /** La trace sans donnée de personne : le moment et les familles. */
  journal?: (ligne: LigneDuJournal) => void;
  /**
   * Le lecteur du journal ; `lireJournalParLots` par défaut. Le journal ne se lit que par son module
   * (`journal:sans-pii`) : la tâche ne touche jamais la table, elle filtre ce que le module rend.
   */
  lireJournal?: () => Promise<LigneJournal[]>;
  /** L'écrivain du journal, dans la transaction de l'ouverture ; `ajouterEvenement` par défaut. */
  journaliser?: (tx: Prisma.TransactionClient, e: NouvelEvenement) => Promise<unknown>;
}

export interface CompteursDeLOuverture extends Record<string, number> {
  curseur: number;
  passeAtMs: number;
  naissancesLues: number;
  ouvertes: number;
}

/**
 * Ouvre UNE anomalie d'auto-parrainage sur le filleul, dans sa propre transaction. Rend `false`, sans
 * rien écrire d'autre, si une anomalie `auto_parrainage` y est déjà ouverte : la base tranche.
 */
export async function ouvrirUneAnomalie(
  prisma: PrismaClient,
  filleulId: string,
  ports: Pick<PortsDeLOuverture, 'maintenant' | 'journaliser'>
): Promise<boolean> {
  const journaliser = ports.journaliser ?? ajouterEvenement;
  return prisma.$transaction(async (tx) => {
    const rendues = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "anomalies" ("id", "type", "apporteur_id", "statut", "ouverte_at")
      VALUES (${randomUUID()}::uuid, 'auto_parrainage', ${filleulId}::uuid, 'ouverte', clock_timestamp())
      ON CONFLICT ("apporteur_id") WHERE "type" = 'auto_parrainage' AND "statut" = 'ouverte'
      DO NOTHING
      RETURNING "id"`;
    const ouverte = rendues[0];
    if (ouverte === undefined) return false;
    await journaliser(tx, {
      type: 'anomalie_statut_modifie',
      agregat: 'anomalie',
      agregatId: ouverte.id,
      survenuAt: ports.maintenant(),
      charge: { de: null, vers: 'ouverte', acteur: { par: 'systeme' } },
    });
    return true;
  });
}

/** Une naissance utile, lue au journal : son moment, et l'agrégat qu'elle désigne. */
interface Naissance {
  moment: MomentDuControle;
  agregatId: string;
}

/**
 * Une naissance utile, ou `null`. Le passage ne lui donne que les deux types de naissance : celle
 * d'un apporteur est une candidature ; celle d'une pièce n'est utile que pour une pièce `rib`.
 */
function naissanceDe(e: {
  type: string;
  agregatId: string | null;
  charge: unknown;
}): Naissance | null {
  const c = e.charge as { de?: unknown; type?: unknown } | null;
  if (e.agregatId === null || c?.de !== null) return null;
  if (e.type === 'apporteur_statut_modifie')
    return { moment: 'candidature', agregatId: e.agregatId };
  return c.type === 'rib' ? { moment: 'rib', agregatId: e.agregatId } : null;
}

async function soupconsDe(prisma: PrismaClient, n: Naissance): Promise<Soupcon[]> {
  if (n.moment === 'candidature') return soupconsALaCandidature(prisma, n.agregatId);
  const piece = await prisma.pieceKyc.findUnique({
    where: { id: n.agregatId },
    select: { apporteurId: true },
  });
  return piece === null ? [] : soupconsAuChangementDeRib(prisma, piece.apporteurId);
}

/** Le passage de la tâche : ce qui est dû à l'instant t. */
export async function ouvrirLesAnomaliesDAutoParrainage(
  prisma: PrismaClient,
  ports: PortsDeLOuverture
): Promise<CompteursDeLOuverture> {
  const maintenant = ports.maintenant();
  const precedent = await ports.precedent();
  const cadenceMs = SEUILS.AUTO_PARRAINAGE_CADENCE_MINUTES.valeur * MS_PAR_MINUTE;
  if (precedent !== null && maintenant.getTime() - precedent.passeAtMs < cadenceMs) {
    return { ...precedent, naissancesLues: 0, ouvertes: 0 };
  }
  const borne = new Date(
    maintenant.getTime() - SEUILS.AUTO_PARRAINAGE_FENETRE_JOURS.valeur * MS_PAR_JOUR
  );
  const depart = precedent?.curseur ?? 0;
  let curseur = depart;
  let naissancesLues = 0;
  let ouvertes = 0;
  const lignes = await (ports.lireJournal ?? (() => lireJournalParLots(prisma)))();
  for (const l of lignes) {
    const id = Number(l.id);
    // Seuls les faits NOUVEAUX depuis le dernier passage se jugent : une anomalie levée par la
    // console ne se rouvre pas sans une naissance postérieure.
    if (id <= depart) continue;
    curseur = Math.max(curseur, id);
    if (!TYPES_DE_NAISSANCE.has(l.type) || Date.parse(l.survenuAt) < borne.getTime()) continue;
    const n = naissanceDe(l);
    if (n === null) continue;
    naissancesLues += 1;
    const soupcons = await soupconsDe(prisma, n);
    if (soupcons.length === 0) continue;
    for (const s of soupcons) {
      if (await ouvrirUneAnomalie(prisma, s.filleulId, ports)) ouvertes += 1;
    }
    ports.journal?.({
      signal: 'auto_parrainage_soupconne',
      moment: n.moment,
      correspondances: famillesDe(soupcons),
    });
  }
  return { curseur, passeAtMs: maintenant.getTime(), naissancesLues, ouvertes };
}

/** Le précédent passage effectif, relu au battement de la tâche. */
export function precedentDuBattement(
  prisma: PrismaClient
): () => Promise<{ curseur: number; passeAtMs: number } | null> {
  return async () => {
    const b = await prisma.battement.findUnique({
      where: { tache: TACHE_AUTO_PARRAINAGE },
      select: { compteurs: true },
    });
    const c = b?.compteurs;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) return null;
    const { curseur, passeAtMs } = c as Record<string, unknown>;
    return typeof curseur === 'number' && typeof passeAtMs === 'number'
      ? { curseur, passeAtMs }
      : null;
  };
}
