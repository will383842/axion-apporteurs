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

type Tx = Prisma.TransactionClient;
/** L'écriture d'un fait du journal ; injectable pour le témoin en processus. */
type EcrireUnEvenement = (tx: Tx, e: Parameters<typeof ajouterEvenement>[1]) => Promise<unknown>;

/** Une personne de la console qui agit, et son rôle. */
export type ActeurDeLaConsole = { readonly id: string; readonly role: string };

export type MotifDeSuspensionRefusee =
  'droit_absent' | 'apporteur_introuvable' | ErreurDeSuspension['code'];

export class ErreurSuspension extends Error {
  constructor(readonly motif: MotifDeSuspensionRefusee) {
    super(`suspension : ${motif}`);
    this.name = 'ErreurSuspension';
  }
}

const POSER = 'action:suspendre_apporteur';
const LEVER = 'action:lever_gel';

function exigerLeDroit(droit: string, acteur: ActeurDeLaConsole): void {
  if (!roleAutorise(droit, acteur.role as Parameters<typeof roleAutorise>[1])) {
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
    ecrireUnFait?: EcrireUnEvenement;
  }
): Promise<void> {
  exigerLeDroit(POSER, d.acteur);
  const ecrire = d.ecrireUnFait ?? ajouterEvenement;
  const { statut, etatGel } = await etatVerrouille(tx, d.apporteurId);
  juger(() => jugerLaPose({ statut, etatGel, faits: d.faits }, d.maintenant.getTime()));
  if (d.faits.motif === 'gele_fraude') {
    // La fraude n'est un fait qu'établie : l'anomalie est CONFIRMÉE, et elle est de CET apporteur.
    const a = await tx.anomalie.findUnique({
      where: { id: d.faits.anomalie.id },
      select: { statut: true, apporteurId: true },
    });
    if (a === null || a.statut !== 'confirmee' || a.apporteurId !== d.apporteurId) {
      throw new ErreurSuspension('anomalie_non_confirmee');
    }
  }
  const vers = d.faits.motif;
  const { statut: statutVers } = transitionner({
    de: statut,
    evenementApporteur: 'suspendre',
    motif: null,
  });
  const { count } = await tx.apporteur.updateMany({
    where: { id: d.apporteurId, statut: 'signe', etatGel: 'libre' },
    data: {
      statut: statutVers,
      etatGel: vers,
      depotsGelesDepuis: d.maintenant,
      gelAnomalieId: d.faits.motif === 'gele_fraude' ? d.faits.anomalie.id : null,
      gelPoseParId: d.acteur.id,
    },
  });
  if (count === 0) throw new ErreurSuspension('deja_suspendu');
  const acteur = { par: 'utilisateur_console' as const, id: d.acteur.id };
  await ecrire(tx, {
    type: 'apporteur_statut_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de: statut, vers: statutVers, transition: 'suspendre', acteur },
  });
  await ecrire(tx, {
    type: 'apporteur_gel_modifie',
    agregat: 'apporteur',
    agregatId: d.apporteurId,
    survenuAt: d.maintenant,
    charge: { de: 'libre', vers, par: 'role', acteur },
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
  if (d.par !== 'plein_droit') exigerLeDroit(LEVER, d.par.role);
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
 * Le passage planifié : lève de plein droit chaque gel dont l'échéance est atteinte (quinze jours
 * civils de Paris après la pose, `echeanceDeLevee`), chacun dans SA transaction.
 */
export async function leverLesSuspensionsEchues(
  prisma: PrismaClient,
  maintenant: Date,
  p: { ecrireUnFait?: EcrireUnEvenement } = {}
): Promise<{ levees: number }> {
  const poses = await prisma.apporteur.findMany({
    where: { etatGel: { not: 'libre' }, depotsGelesDepuis: { lte: maintenant } },
    select: { id: true, depotsGelesDepuis: true },
    orderBy: { depotsGelesDepuis: 'asc' },
  });
  let levees = 0;
  for (const g of poses) {
    if (g.depotsGelesDepuis === null) continue;
    if (!leveeDePleinDroitDue(g.depotsGelesDepuis.getTime(), maintenant.getTime())) continue;
    await prisma.$transaction((tx) =>
      leverUneSuspension(tx, {
        apporteurId: g.id,
        par: 'plein_droit',
        maintenant,
        ...(p.ecrireUnFait === undefined ? {} : { ecrireUnFait: p.ecrireUnFait }),
      })
    );
    levees += 1;
  }
  return { levees };
}
