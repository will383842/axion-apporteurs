/**
 * SEC-15 (REQ-SEC-018, REQ-SEC-019, REQ-SEC-038, REQ-JUR-006) — la suspension de vérification au
 * serveur : le POINT D'ENTRÉE UNIQUE du gel des dépôts. Le contrat v2 fait foi, art. 3.7 al. 3 ; la
 * règle pure vit dans `src/domain/apporteur/suspension.ts`.
 *
 * LA POSE est une FACULTÉ, posée par un rôle habilité (`action:suspendre_apporteur`, admin), jamais un
 * automatisme : un démenti ou une anomalie ouvre seulement la possibilité. Elle écrit, dans UNE
 * instruction, le statut `suspendu`, l'état du gel, son instant et son auteur ; puis les deux faits du
 * journal, le statut (`apporteur_statut_modifie`) et le gel (`apporteur_gel_modifie`). La charge du gel
 * ne porte jamais l'anomalie (DM-12, décision (d) de la juriste) : le lien vit dans
 * `apporteurs.gel_anomalie_id`. La garde de la base (`apporteurs_gel_garde`) n'admet que la pose et la
 * levée.
 *
 * LA LEVÉE se fait par un rôle habilité (`action:lever_gel`, admin) ou DE PLEIN DROIT, quinze jours
 * après la pose, qui est aussi l'instant de la notification (`leverLesSuspensionsEchues`, un passage du
 * lanceur ; chaque levée est SA transaction).
 *
 * SANS EFFET sur les attributions, les commandes, les commissions et l'accès à l'espace (art. 3.7 al. 3,
 * REQ-SEC-032) : ce module n'écrit que l'apporteur et le journal. Aucun jeton n'est révoqué et
 * `session_version` ne bouge pas.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ErreurDeSuspension,
  jugerLaLevee,
  jugerLaPose,
  leveeDePleinDroitDue,
  type EtatDeGel,
  type FaitsDeSuspension,
} from '../../domain/apporteur/suspension';
import { transitionner } from '../../domain/apporteur/matrice';
import type { StatutApporteur } from '../../domain/apporteur/statut';
import { ajouterEvenement } from '../evenement/journal';
import { roleAutorise } from '../roles/matrice';
import { creerJournal, type Journal } from '../../lib/logger';
import { jugerLesFaitsSaisis } from '../attribution/notifications';
import { MODELE_DECISION_DE_CONTRAT } from './resiliation';
import {
  colonnesPii,
  empreinteRecherche,
  nettoyerUnTexteSaisi,
  type ClesPii,
} from '../securite/pii';

type Tx = Prisma.TransactionClient;
/** L'écriture d'un fait du journal ; injectable pour le témoin en processus. */
type EcrireUnEvenement = (tx: Tx, e: Parameters<typeof ajouterEvenement>[1]) => Promise<unknown>;

/** Une personne de la console qui agit, et son rôle. */
/**
 * L'acteur de la console, par son SEUL identifiant : son rôle, sa désactivation et sa validation sont
 * RELUS en base dans la transaction du geste, jamais pris de l'appelant (sécurité, #794 6039195762).
 */
export type ActeurDeLaConsole = { readonly id: string };

export type MotifDeSuspensionRefusee =
  | 'droit_absent'
  | 'apporteur_introuvable'
  | 'cle_idempotence_invalide'
  | 'cle_deja_employee'
  | 'anomalie_hors_motif'
  | `faits_${string}`
  | ErreurDeSuspension['code'];

export class ErreurSuspension extends Error {
  constructor(readonly motif: MotifDeSuspensionRefusee) {
    super(`suspension : ${motif}`);
    this.name = 'ErreurSuspension';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const POSER = 'action:suspendre_apporteur';
const LEVER = 'action:lever_gel';

/**
 * Le droit RELU dans la transaction, au point d'entrée UNIQUE du gel : un compte inconnu, désactivé,
 * au rôle retiré, ou un administrateur NON VALIDÉ est refusé avant toute lecture et toute écriture,
 * comme pour la mise en demeure et la résiliation.
 */
async function exigerLeDroit(tx: Tx, droit: string, acteur: ActeurDeLaConsole): Promise<void> {
  const lu = await tx.utilisateurConsole.findUnique({
    where: { id: acteur.id },
    select: { role: true, desactiveAt: true, valideAt: true },
  });
  if (
    lu === null ||
    lu.desactiveAt !== null ||
    !roleAutorise(droit, lu.role) ||
    (lu.role === 'admin' && lu.valideAt === null)
  ) {
    throw new ErreurSuspension('droit_absent');
  }
}

/** Le statut et le gel, sous verrou : la pose et la levée se jugent sur la ligne qu'elles écrivent. */
async function etatVerrouille(
  tx: Tx,
  apporteurId: string
): Promise<{ statut: StatutApporteur; etatGel: EtatDeGel }> {
  const [l] = await tx.$queryRaw<{ statut: StatutApporteur; etat_gel: EtatDeGel }[]>`
    SELECT statut::text AS statut, etat_gel::text AS etat_gel FROM apporteurs
    WHERE id = ${apporteurId}::uuid FOR UPDATE`;
  if (!l) throw new ErreurSuspension('apporteur_introuvable');
  return { statut: l.statut, etatGel: l.etat_gel };
}

/** La règle pure, dont le refus devient un refus nommé du serveur. */
function juger<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ErreurDeSuspension) throw new ErreurSuspension(e.code);
    throw e;
  }
}

/** Pose le gel des dépôts d'un apporteur, dans la transaction `tx`. */
export async function poserUneSuspension(
  tx: Tx,
  d: {
    apporteurId: string;
    faits: FaitsDeSuspension;
    acteur: ActeurDeLaConsole;
    maintenant: Date;
    /** Les faits notifiés, saisis par l'administrateur (art. 3.7 al. 3) ; chiffrés dans la décision. */
    faitsTexte: string;
    /** La clé tirée au rendu du formulaire : une décision par geste, jamais deux. */
    cleIdempotence: string;
    cles: ClesPii;
    ecrireUnFait?: EcrireUnEvenement;
  }
): Promise<void> {
  await exigerLeDroit(tx, POSER, d.acteur);
  if (!UUID.test(d.cleIdempotence)) throw new ErreurSuspension('cle_idempotence_invalide');
  // Les faits passent le JUGE UNIQUE des faits saisis (DM-55), comme ceux d'une mise en demeure.
  const verdict = jugerLesFaitsSaisis(d.faitsTexte);
  if (!verdict.ok) throw new ErreurSuspension(verdict.motif as `faits_${string}`);
  const texte = nettoyerUnTexteSaisi(d.faitsTexte);
  const ecrire = d.ecrireUnFait ?? ajouterEvenement;
  const { statut, etatGel } = await etatVerrouille(tx, d.apporteurId);
  juger(() => jugerLaPose({ statut, etatGel, faits: d.faits }, d.maintenant.getTime()));
  if (d.faits.motif === 'gele_fraude') {
    // La fraude n'est un fait qu'établie : l'anomalie est CONFIRMÉE, et elle est de CET apporteur.
    const a = await tx.anomalie.findUnique({
      where: { id: d.faits.anomalie.id },
      select: { statut: true, apporteurId: true, type: true },
    });
    if (a === null || a.statut !== 'confirmee' || a.apporteurId !== d.apporteurId) {
      throw new ErreurSuspension('anomalie_non_confirmee');
    }
    // Seule la fabrication ou l'automatisation d'une déclaration fonde la fraude (art. 3.7 al. 3) :
    // une anomalie de sincérité. L'auto-parrainage n'en relève jamais : son seul effet est la
    // suspension du VERSEMENT du parrainage (art. 4.6), une tâche distincte (juriste, #474,
    // 6036318718). L'état de l'attribution n'entre pas en compte : la suspension est sans effet sur elle.
    if (a.type !== 'sincerite') throw new ErreurSuspension('anomalie_hors_motif');
  }
  const vers = d.faits.motif;
  const { statut: statutVers } = transitionner({
    de: statut,
    evenementApporteur: 'suspendre',
    motif: null,
  });
  if (
    (await tx.decisionDeContrat.findUnique({
      where: { cleIdempotence: d.cleIdempotence },
      select: { id: true },
    })) !== null
  ) {
    throw new ErreurSuspension('cle_deja_employee');
  }
  const acteur = { par: 'utilisateur_console' as const, id: d.acteur.id };
  await ecrire(tx, {
    type: 'apporteur_statut_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de: statut, vers: statutVers, transition: 'suspendre', acteur },
  });
  const inscrit = (await ecrire(tx, {
    type: 'apporteur_gel_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de: 'libre', vers, par: 'role', acteur },
  })) as { id: string };
  const evenementId = BigInt(inscrit.id);
  // La décision `suspension` (voie (a), A02, 6036131730) : l'art. 3.7, les faits CHIFFRÉS, leur
  // empreinte dans un domaine dédié, la clé ; son instant est celui de la pose et de la notification.
  const decisionId = randomUUID();
  await tx.decisionDeContrat.create({
    data: {
      ...(colonnesPii(
        { modele: MODELE_DECISION_DE_CONTRAT, id: decisionId },
        { texte },
        d.cles
      ) as unknown as Prisma.DecisionDeContratUncheckedCreateInput),
      id: decisionId,
      apporteurId: d.apporteurId,
      geste: 'suspension',
      article: '3.7',
      cleIdempotence: d.cleIdempotence,
      faitsEmpreinte: empreinteRecherche('faits_suspension', texte, d.cles),
      evenementId,
      creeAt: d.maintenant,
    },
  });
  const { count } = await tx.apporteur.updateMany({
    where: { id: d.apporteurId, statut: 'signe', etatGel: 'libre' },
    data: {
      statut: statutVers,
      etatGel: vers,
      depotsGelesDepuis: d.maintenant,
      gelAnomalieId: d.faits.motif === 'gele_fraude' ? d.faits.anomalie.id : null,
      gelPoseParId: d.acteur.id,
      gelDecisionContratId: decisionId,
    },
  });
  // Une ligne qui a changé sous le verrou : la transaction de l'appelant est annulée, faits compris.
  if (count === 0) throw new ErreurSuspension('deja_suspendu');
  // La notification cite le fait du gel ET la décision : le passage relira les faits à l'envoi, et le
  // courriel part avec eux (« notifiée avec les faits qui la motivent »).
  await tx.notificationEspace.create({
    data: {
      apporteurId: d.apporteurId,
      cle: 'suspension_declarations',
      evenementId,
      decisionContratId: decisionId,
    },
  });
}

/** Lève le gel, par un rôle habilité ou de plein droit, dans la transaction `tx`. */
export async function leverUneSuspension(
  tx: Tx,
  d: {
    apporteurId: string;
    par: { role: ActeurDeLaConsole } | 'plein_droit';
    maintenant: Date;
    ecrireUnFait?: EcrireUnEvenement;
  }
): Promise<void> {
  if (d.par !== 'plein_droit') await exigerLeDroit(tx, LEVER, d.par.role);
  const ecrire = d.ecrireUnFait ?? ajouterEvenement;
  const { statut, etatGel } = await etatVerrouille(tx, d.apporteurId);
  juger(() => jugerLaLevee({ statut, etatGel }));
  const { statut: statutVers } = transitionner({
    de: statut,
    evenementApporteur: 'lever_suspension',
    motif: null,
  });
  const { count } = await tx.apporteur.updateMany({
    where: { id: d.apporteurId, statut: 'suspendu', etatGel },
    data: {
      statut: statutVers,
      etatGel: 'libre',
      depotsGelesDepuis: null,
      gelAnomalieId: null,
      gelPoseParId: null,
      gelDecisionContratId: null,
    },
  });
  if (count === 0) throw new ErreurSuspension('non_suspendu');
  const acteur =
    d.par === 'plein_droit'
      ? { par: 'systeme' as const }
      : { par: 'utilisateur_console' as const, id: d.par.role.id };
  await ecrire(tx, {
    type: 'apporteur_statut_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de: statut, vers: statutVers, transition: 'lever_suspension', acteur },
  });
  await ecrire(tx, {
    type: 'apporteur_gel_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: {
      de: etatGel,
      vers: 'libre',
      par: d.par === 'plein_droit' ? 'plein_droit' : 'role',
      acteur,
    },
  });
}

/**
 * Les gels échus lus par un passage : une lecture BORNÉE (sécurité, note) ; un passage suivant lit les
 * suivants, puisque chaque levée sort sa ligne du filtre.
 */
export const GELS_ECHUS_PAR_PASSAGE = 200;

/**
 * Le passage planifié : lève de plein droit chaque gel dont l'échéance est atteinte (quinze jours
 * civils de Paris après la pose, `echeanceDeLevee`), chacun dans SA transaction. Une levée qui
 * échoue (un gel levé entre la lecture et la transaction, par exemple) est COMPTÉE et n'arrête jamais
 * les suivantes : un gel échu laissé posé serait un droit de l'apporteur manqué (sécurité, condition 3).
 */
export async function leverLesSuspensionsEchues(
  prisma: PrismaClient,
  maintenant: Date,
  p: { ecrireUnFait?: EcrireUnEvenement; journal?: Pick<Journal, 'warn'> } = {}
): Promise<{ levees: number; echecs: number }> {
  const poses = await prisma.apporteur.findMany({
    where: { etatGel: { not: 'libre' }, depotsGelesDepuis: { lte: maintenant } },
    select: { id: true, depotsGelesDepuis: true },
    orderBy: [{ depotsGelesDepuis: 'asc' }, { id: 'asc' }],
    take: GELS_ECHUS_PAR_PASSAGE,
  });
  let levees = 0;
  let echecs = 0;
  for (const g of poses) {
    if (g.depotsGelesDepuis === null) continue;
    if (!leveeDePleinDroitDue(g.depotsGelesDepuis.getTime(), maintenant.getTime())) continue;
    try {
      await prisma.$transaction((tx) =>
        leverUneSuspension(tx, {
          apporteurId: g.id,
          par: 'plein_droit',
          maintenant,
          ...(p.ecrireUnFait === undefined ? {} : { ecrireUnFait: p.ecrireUnFait }),
        })
      );
      levees += 1;
    } catch {
      // Compté, rien d'autre : ni l'apporteur ni le motif ne sortent du passage.
      echecs += 1;
    }
  }
  // L'alerte d'exploitation (sécurité, note sur #802) : le nom et le NOMBRE seuls, aucun identifiant.
  if (echecs > 0) (p.journal ?? creerJournal()).warn('suspensions_lever_echecs', { echecs });
  return { levees, echecs };
}
