/**
 * UX-P1-56 — CONFIRMER une anomalie de sincérité, depuis la console, avec ses faits retenus.
 *
 * Une confirmation par un humain est le SEUL fondement d'un gel pour fraude (SEC-15) ; ce module n'en
 * pose AUCUN : l'effet relève de SEC-15, dans une transaction distincte. Ni score ni seuil ne le fondent :
 * seuls les faits écrits par l'administrateur.
 *
 * LE GESTE (conditions de la sécurité, relayées par la coordination) :
 *   — l'acteur arrive JUGÉ par `requireRole` (`action:confirmer_anomalie`, l'admin seul, sous step-up),
 *     et son droit est RELU dans la transaction (admin actif et validé) ;
 *   — les faits sont jugés À LA SAISIE (juriste) : vides, au-delà de `FAITS_ANOMALIE_CARACTERES_MAX`
 *     points de code, avec un lien ou un mot refusé, ils reviennent avec un refus NOMMÉ, sans rien écrire ;
 *   — l'anomalie est VERROUILLÉE (`FOR UPDATE`) et jugée depuis « ouverte » seulement : une seconde
 *     confirmation rend `deja_traitee`, sans réécriture ; seule la SINCÉRITÉ se confirme ici (un autre
 *     type rend `type_non_traite` : le parrainage de soi-même relève d'une tâche distincte) ;
 *   — la clôture est UNE écriture (statut, `traite_at`, `traite_par_id` et la justification CHIFFRÉE
 *     ensemble, comme l'exige la garde de la table), sous l'AAD de la ligne et du champ ;
 *   — l'événement `anomalie_statut_modifie` ne porte que `{ de, vers, acteur }`, sans identité ni faits ;
 *   — la confirmation ne fait que CLORE (juriste, #474, 6037559862 ; arbitrage, #319, 6037567525) :
 *     elle ne touche ni l'attribution, ni la commande, ni la commission, et n'écrit aucune notification.
 *     Un effet sur l'apporteur (l'annulation pour fabrication, la suspension) est une décision DISTINCTE,
 *     dans SA transaction (JUR-T58 ; règle du rattrapage 85 : l'effet n'est jamais écrit avec la clôture).
 * Les faits ne sortent jamais : ni l'adresse, ni le journal, ni l'événement, ni un message d'erreur.
 */
import type { ConsoleRole, Prisma, PrismaClient } from '@prisma/client';
import { roleAutorise } from '../../roles/matrice';
import { ajouterEvenement } from '../../evenement/journal';
import { colonnesPii, nettoyerUnTexteSaisi, type ClesPii } from '../../securite/pii';
import { jugerLesFaitsSaisis, type RefusDesFaits } from '../../attribution/notifications';
import { MODELE_DE_LA_JUSTIFICATION } from '../../anomalie/justification';

const DROIT = 'action:confirmer_anomalie';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RefusDeConfirmation =
  | RefusDesFaits
  | 'cle_invalide'
  | 'droit_absent'
  | 'anomalie_inconnue'
  | 'type_non_traite'
  | 'deja_traitee';

export class ErreurConfirmationAnomalie extends Error {
  constructor(readonly motif: RefusDeConfirmation) {
    super(`confirmation_anomalie : ${motif}`);
    this.name = 'ErreurConfirmationAnomalie';
  }
}

export interface ActeurDeLaConfirmation {
  readonly id: string;
  readonly role: ConsoleRole;
}

type Tx = Prisma.TransactionClient;

/** Le droit de l'acteur, RELU en base : admin actif et validé ; sinon refusé. */
async function exigerUnAdministrateurValide(tx: Tx, acteur: ActeurDeLaConfirmation): Promise<void> {
  if (!roleAutorise(DROIT, acteur.role)) throw new ErreurConfirmationAnomalie('droit_absent');
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    lu.valideAt === null ||
    !roleAutorise(DROIT, lu.role)
  )
    throw new ErreurConfirmationAnomalie('droit_absent');
}

export async function confirmerUneAnomalie(
  prisma: PrismaClient,
  d: {
    acteur: ActeurDeLaConfirmation;
    anomalieId: string;
    faits: string;
    cleIdempotence: string;
    maintenant: Date;
  },
  cles: ClesPii
): Promise<void> {
  // À LA SAISIE, par le juge commun des faits (règle de SEC-12, borne de la SSOT) : rien n'est écrit.
  const juges = jugerLesFaitsSaisis(d.faits);
  if (!juges.ok) throw new ErreurConfirmationAnomalie(juges.motif);
  // La clé tirée par le serveur au rendu, rapportée telle quelle : une clé absente ou forgée est refusée.
  if (!UUID.test(d.cleIdempotence)) throw new ErreurConfirmationAnomalie('cle_invalide');
  const faits = nettoyerUnTexteSaisi(d.faits);

  return prisma.$transaction(async (tx) => {
    await exigerUnAdministrateurValide(tx, d.acteur);
    const lignes = await tx.$queryRaw<{ statut: string; type: string }[]>`
      SELECT statut::text AS statut, type::text AS type
      FROM anomalies WHERE id = ${d.anomalieId}::uuid FOR UPDATE`;
    const a = lignes[0];
    if (a === undefined) throw new ErreurConfirmationAnomalie('anomalie_inconnue');
    if (a.type !== 'sincerite') throw new ErreurConfirmationAnomalie('type_non_traite');
    if (a.statut !== 'ouverte') throw new ErreurConfirmationAnomalie('deja_traitee');

    const { justificationChiffre } = colonnesPii(
      { modele: MODELE_DE_LA_JUSTIFICATION, id: d.anomalieId },
      { justification: faits },
      cles
    );
    // UNE écriture : la garde de la table exige la clôture entière, ensemble.
    await tx.anomalie.update({
      where: { id: d.anomalieId },
      data: {
        statut: 'confirmee',
        traiteAt: d.maintenant,
        traiteParId: d.acteur.id,
        // Une colonne Bytes : le bloc chiffré, tel quel, en Buffer.
        justificationChiffre: Buffer.from(justificationChiffre!),
      },
    });
    await ajouterEvenement(tx, {
      type: 'anomalie_statut_modifie',
      agregat: 'anomalie',
      agregatId: d.anomalieId,
      survenuAt: d.maintenant,
      charge: { de: 'ouverte', vers: 'confirmee', acteur: { par: 'utilisateur_console' } },
    });
  });
}

// ── la lecture de l'écran ────────────────────────────────────────────────────────────────────────

/** La liste est BORNÉE : les plus anciennes d'abord, jamais tout le stock d'un coup. */
export const ANOMALIES_OUVERTES_MAX = 100;

/** Une anomalie telle que l'écran la montre : ni score, ni rang, ni seuil, ni faits. */
export type AnomalieALaConsole = {
  readonly id: string;
  readonly ouverteAt: Date;
  /** La raison sociale, ou le repli « Entreprise n° … » ; `null` sans attribution lisible. */
  readonly entreprise: string | null;
};

const entrepriseDe = (
  att: { raisonSociale: string | null; siren: string } | null,
  nommer: (raisonSociale: string | null, siren: string) => string
): string | null => {
  if (att === null) return null;
  try {
    return nommer(att.raisonSociale, att.siren);
  } catch {
    return null;
  }
};

/** Les anomalies de SINCÉRITÉ encore ouvertes, les plus anciennes d'abord, bornées. */
export async function lireLesAnomaliesOuvertes(
  prisma: Pick<PrismaClient, 'anomalie'>,
  nommer: (raisonSociale: string | null, siren: string) => string
): Promise<AnomalieALaConsole[]> {
  const lignes = await prisma.anomalie.findMany({
    where: { type: 'sincerite', statut: 'ouverte' },
    orderBy: [{ ouverteAt: 'asc' }, { id: 'asc' }],
    take: ANOMALIES_OUVERTES_MAX,
    select: {
      id: true,
      ouverteAt: true,
      attribution: { select: { raisonSociale: true, siren: true } },
    },
  });
  return lignes.map((l) => ({
    id: l.id,
    ouverteAt: l.ouverteAt,
    entreprise: entrepriseDe(l.attribution, nommer),
  }));
}

/** L'anomalie d'une page de confirmation : ouverte et de sincérité, ou la raison de son absence. */
export type AnomalieAConfirmer =
  | { readonly etat: 'a_confirmer'; readonly anomalie: AnomalieALaConsole }
  | { readonly etat: 'introuvable' | 'deja_traitee' | 'type_non_traite' };

export async function lireUneAnomalie(
  prisma: Pick<PrismaClient, 'anomalie'>,
  anomalieId: string,
  nommer: (raisonSociale: string | null, siren: string) => string
): Promise<AnomalieAConfirmer> {
  if (!UUID.test(anomalieId)) return { etat: 'introuvable' };
  const l = await prisma.anomalie.findUnique({
    where: { id: anomalieId },
    select: {
      id: true,
      type: true,
      statut: true,
      ouverteAt: true,
      anonymiseeAt: true,
      attribution: { select: { raisonSociale: true, siren: true } },
    },
  });
  if (l === null || l.anonymiseeAt !== null) return { etat: 'introuvable' };
  if (l.type !== 'sincerite') return { etat: 'type_non_traite' };
  if (l.statut !== 'ouverte') return { etat: 'deja_traitee' };
  return {
    etat: 'a_confirmer',
    anomalie: {
      id: l.id,
      ouverteAt: l.ouverteAt,
      entreprise: entrepriseDe(l.attribution, nommer),
    },
  };
}
