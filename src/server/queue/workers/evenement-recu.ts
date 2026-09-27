/**
 * Le travail de fond des événements reçus — SEC-06 (REQ-DM-036, REQ-INT-011, REQ-ARG-003,
 * REQ-QA-026).
 *
 * HORS REQUÊTE. La route n'inscrit que la ligne `recu` et rend la main ; ce passage tourne après la
 * réponse (`after()` de Next, câblé par la route) et peut être relancé par une tâche planifiée : il
 * ne prend que ce qui est `recu`, donc un passage de plus ne fait rien de plus. Un échec de
 * traitement ne remonte JAMAIS à l'émetteur : il s'écrit sur la ligne (`en_erreur`, le NOM de
 * l'erreur, `retryCount` + 1), jamais dans un 5xx qui inviterait à rejouer ce qui est déjà inscrit.
 *
 * L'ATTENTE DE DÉPENDANCE (REQ-INT-011). Un devis dont le client est inconnu, un paiement dont la
 * facture est inconnue, passent `en_attente_dependance` en nommant le parent attendu — jamais
 * rejetés. Quand un parent passe `traite`, ses enfants sont RÉVEILLÉS (repassent `recu`) et traités
 * dans le même passage. Le parent se reconnaît à sa référence de sujet ET à son type : un avoir porte
 * une référence de facture, il n'en est pas une.
 *
 * LE REJEU (REQ-ARG-003). L'état final ne dépend pas de l'ordre d'arrivée d'un dossier : un enfant
 * arrivé avant son parent attend, un enfant arrivé après passe ; les deux finissent `traite`. Un
 * événement déjà traité n'est jamais redonné au dispatch.
 *
 * LE BATTEMENT (REQ-QA-026). Chaque passage écrit celui de sa tâche : succès et compteurs, ou échec
 * — puis l'erreur remonte à qui a lancé le passage.
 *
 * Aucun effet métier ici : `dispatch` est le port où les tâches de commission et de rattachement se
 * brancheront (DM-10-P, DM-15). En phase 0, il ne fait rien.
 */
import { Prisma, TypeEvenementRecu, type PrismaClient } from '@prisma/client';
import { schemaNomDeTache, type NomDeTache } from '../../taches/registre';

/** La tâche dont ce passage écrit le battement : une clé du registre, validée à la lecture. */
export const TACHE_DE_RECEPTION: NomDeTache = schemaNomDeTache.parse('evenements_recus');

export interface EvenementATraiter {
  id: string;
  eventType: TypeEvenementRecu;
  sujetRef: string | null;
  charge: unknown;
  retryCount: number;
}

export type Marque =
  | { statut: 'traite'; processedAt: Date }
  | { statut: 'en_attente_dependance'; dependanceRef: string }
  | { statut: 'en_erreur'; error: string; retryCount: number };

export interface CompteursDuPassage {
  traites: number;
  enAttente: number;
  enErreur: number;
  reveilles: number;
}

export type Battre = (
  tache: NomDeTache,
  battement: { succesAt: Date; compteurs: CompteursDuPassage } | { echecAt: Date }
) => Promise<void>;

export interface DepotDuTravail {
  /** Les événements `recu`, dans l'ordre de réception. */
  aTraiter(): Promise<EvenementATraiter[]>;
  /** Un événement de référence `ref`, de l'un des `types`, est-il déjà `traite` ? */
  parentTraite(ref: string, types: readonly TypeEvenementRecu[]): Promise<boolean>;
  marquer(id: string, marque: Marque): Promise<void>;
  /** Repasse `recu` les enfants qui attendent `ref` ; rend leur nombre. */
  reveiller(ref: string): Promise<number>;
  battre: Battre;
}

/** Le port métier. Il ne reçoit qu'un événement dont les dépendances sont satisfaites. */
export type Dispatch = (recu: EvenementATraiter) => Promise<void>;

/**
 * Les dépendances de REQ-INT-011, et elles seules : le champ de la charge qui désigne le parent,
 * l'espace de référence du parent, et les types qui le font exister.
 */
const DEPENDANCES: Partial<
  Record<
    TypeEvenementRecu,
    { champ: string; espace: string; parents: readonly TypeEvenementRecu[] }
  >
> = {
  [TypeEvenementRecu.devis_signe]: {
    champ: 'clientId',
    espace: 'client',
    parents: [TypeEvenementRecu.client_cree, TypeEvenementRecu.client_mis_a_jour],
  },
  [TypeEvenementRecu.paiement_recu]: {
    champ: 'factureId',
    espace: 'facture',
    parents: [TypeEvenementRecu.facture_emise],
  },
};

/** La même borne que la colonne `dependance_ref`. */
const REFERENCE_MAX = 180;

/**
 * La dépendance d'un événement, lue dans sa charge : `null` s'il n'en a pas, `'illisible'` si sa
 * charge ne permet pas de la nommer. La référence a la forme de `sujetRef` (`client:<id>`).
 */
export function dependanceDe(
  e: Pick<EvenementATraiter, 'eventType' | 'charge'>
): { ref: string; parents: readonly TypeEvenementRecu[] } | null | 'illisible' {
  const regle = DEPENDANCES[e.eventType];
  if (regle === undefined) return null;
  const charge = e.charge;
  if (charge === null || typeof charge !== 'object' || Array.isArray(charge)) return 'illisible';
  const valeur = (charge as Record<string, unknown>)[regle.champ];
  if (typeof valeur !== 'string' || valeur === '') return 'illisible';
  const ref = `${regle.espace}:${valeur}`;
  if (ref.length > REFERENCE_MAX) return 'illisible';
  return { ref, parents: regle.parents };
}

/** Le NOM d'une erreur, jamais son message : une erreur métier peut citer la charge. */
function nomDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.name.slice(0, 500) : 'Erreur';
}

/**
 * Un passage : traite tout ce qui est `recu`, y compris ce que le passage réveille, jusqu'à ce qu'il
 * n'en reste plus. Chaque événement quitte `recu` à chaque tour ; un enfant n'y revient que si un
 * parent vient de passer `traite` — le passage se termine donc toujours.
 */
export async function passerLeTravail(d: {
  depot: DepotDuTravail;
  dispatch: Dispatch;
  maintenant: () => Date;
}): Promise<CompteursDuPassage> {
  const compteurs: CompteursDuPassage = { traites: 0, enAttente: 0, enErreur: 0, reveilles: 0 };
  try {
    for (;;) {
      const lot = await d.depot.aTraiter();
      if (lot.length === 0) break;
      for (const e of lot) await traiterUn(e, d, compteurs);
    }
  } catch (erreur) {
    await d.depot.battre(TACHE_DE_RECEPTION, { echecAt: d.maintenant() }).catch(() => undefined);
    throw erreur;
  }
  await d.depot.battre(TACHE_DE_RECEPTION, {
    succesAt: d.maintenant(),
    compteurs: { ...compteurs },
  });
  return compteurs;
}

async function traiterUn(
  e: EvenementATraiter,
  d: { depot: DepotDuTravail; dispatch: Dispatch; maintenant: () => Date },
  compteurs: CompteursDuPassage
): Promise<void> {
  const dependance = dependanceDe(e);
  if (dependance === 'illisible') {
    compteurs.enErreur += 1;
    await d.depot.marquer(e.id, {
      statut: 'en_erreur',
      error: 'dependance_illisible',
      retryCount: e.retryCount + 1,
    });
    return;
  }
  if (dependance !== null && !(await d.depot.parentTraite(dependance.ref, dependance.parents))) {
    compteurs.enAttente += 1;
    await d.depot.marquer(e.id, { statut: 'en_attente_dependance', dependanceRef: dependance.ref });
    // Le parent a pu passer `traite` entre la lecture et l'écriture : on relit, et on se réveille.
    if (await d.depot.parentTraite(dependance.ref, dependance.parents)) {
      compteurs.enAttente -= 1;
      await d.depot.reveiller(dependance.ref);
    }
    return;
  }
  try {
    await d.dispatch(e);
  } catch (erreur) {
    compteurs.enErreur += 1;
    await d.depot.marquer(e.id, {
      statut: 'en_erreur',
      error: nomDe(erreur),
      retryCount: e.retryCount + 1,
    });
    return;
  }
  compteurs.traites += 1;
  await d.depot.marquer(e.id, { statut: 'traite', processedAt: d.maintenant() });
  if (e.sujetRef !== null) compteurs.reveilles += await d.depot.reveiller(e.sujetRef);
}

// ── L'adaptateur Prisma ─────────────────────────────────────────────────────────────────────────

/** La taille d'un lot lu par `aTraiter` : un passage en lit autant qu'il en faut, lot après lot. */
const LOT = 100;

export function depotDuTravail(prisma: PrismaClient): DepotDuTravail {
  return {
    async aTraiter() {
      return prisma.evenementRecu.findMany({
        where: { statut: 'recu' },
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        take: LOT,
        select: { id: true, eventType: true, sujetRef: true, charge: true, retryCount: true },
      });
    },
    async parentTraite(ref, types) {
      const n = await prisma.evenementRecu.count({
        where: { sujetRef: ref, eventType: { in: [...types] }, statut: 'traite' },
      });
      return n > 0;
    },
    async marquer(id, m) {
      const data: Prisma.EvenementRecuUpdateInput =
        m.statut === 'traite'
          ? { statut: 'traite', processedAt: m.processedAt, dependanceRef: null }
          : m.statut === 'en_attente_dependance'
            ? { statut: 'en_attente_dependance', dependanceRef: m.dependanceRef }
            : {
                statut: 'en_erreur',
                error: m.error,
                retryCount: m.retryCount,
                dependanceRef: null,
              };
      await prisma.evenementRecu.update({ where: { id }, data });
    },
    async reveiller(ref) {
      const r = await prisma.evenementRecu.updateMany({
        where: { statut: 'en_attente_dependance', dependanceRef: ref },
        data: { statut: 'recu', dependanceRef: null },
      });
      return r.count;
    },
    async battre(tache, b) {
      const nom = schemaNomDeTache.parse(tache);
      const data =
        'succesAt' in b
          ? { dernierSuccesAt: b.succesAt, compteurs: { ...b.compteurs } }
          : { dernierEchecAt: b.echecAt };
      await prisma.battement.upsert({
        where: { tache: nom },
        create: { tache: nom, ...data },
        update: data,
      });
    },
  };
}
