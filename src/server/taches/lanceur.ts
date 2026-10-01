/**
 * Le lanceur des passages planifiés — GOV-137 (REQ-QA-027) : « tout ce qui est dû à l'instant t ».
 *
 * CE QU'IL FAIT. Un processus planifié l'appelle périodiquement. Pour chaque clé du registre des
 * tâches de fond (`TACHES`, `registre.ts`) à laquelle un passage s'est inscrit, il :
 *   1. prend le VERROU CONSULTATIF de cette tâche — un second lanceur, arrivé pendant que le premier
 *      la tient, la saute (`deja_en_cours`) au lieu de la jouer deux fois ;
 *   2. joue le passage ;
 *   3. écrit son BATTEMENT : succès avec les compteurs que le passage rend, ou échec.
 * Une tâche en échec n'arrête pas les autres : chaque passage est jugé à part, et l'erreur reste dans
 * son battement (son NOM ne sort pas d'ici : une erreur métier peut citer une donnée).
 *
 * S'INSCRIRE SANS TOUCHER AU LANCEUR. Une tâche de fond fournit son passage dans les `Inscriptions`
 * que la composition passe au lanceur ; ajouter un cron = une clé au registre (avec son exigence) et
 * une inscription, jamais une ligne ici. Une clé hors du registre est refusée avant tout passage.
 *
 * LE VERROU EST INJECTÉ. `verrouConsultatif(prisma)` le tient sur Postgres, par
 * `pg_try_advisory_xact_lock`, dans une transaction qui couvre le passage : la base relâche le verrou
 * à la fin de la transaction, y compris si le processus meurt. Les témoins unitaires injectent un
 * verrou en mémoire ; le vrai est jugé par `tests/integration/lanceur-des-passages.spec.ts`.
 */
import { PrismaClient } from '@prisma/client';
import { horlogeSysteme } from '../../lib/horloge';
import { creerJournal } from '../../lib/logger';
import { TACHES, type NomDeTache } from './registre';
import {
  depotDuTravail,
  type Battre,
  type CompteursDuPassage,
} from '../queue/workers/evenement-recu';
import { inscriptions } from './inscriptions';

/** Un passage : ce qui est dû à l'instant t pour UNE tâche ; il rend ses compteurs. */
export type Passage = () => Promise<Partial<CompteursDuPassage> | Record<string, number>>;

/** Les passages inscrits, par clé du registre. Une clé sans inscription n'est pas jouée. */
export type Inscriptions = Partial<Record<NomDeTache, Passage>>;

/** Un verrou consultatif : `travail` ne s'exécute que si la clé est libre. */
export interface VerrouConsultatif {
  sous<T>(
    cle: string,
    travail: () => Promise<T>
  ): Promise<{ pris: false } | { pris: true; valeur: T }>;
}

export type IssueDuPassage = 'joue' | 'deja_en_cours' | 'echec';

/** La clé du verrou d'une tâche : son nom, sous un espace propre au lanceur. */
export const cleDuVerrou = (tache: NomDeTache): string => `lanceur:${tache}`;

export async function lancerLesPassages(d: {
  inscriptions: Inscriptions;
  verrou: VerrouConsultatif;
  battre: Battre;
  maintenant: () => Date;
  /** L'ordre de passage ; par défaut, celui des clés inscrites. */
  ordre?: readonly NomDeTache[];
}): Promise<Partial<Record<NomDeTache, IssueDuPassage>>> {
  const cles = Object.keys(d.inscriptions);
  for (const cle of cles) {
    if (!Object.hasOwn(TACHES, cle)) {
      throw new Error('tache_hors_registre : une inscription porte une clé absente de TACHES');
    }
  }
  const issues: Partial<Record<NomDeTache, IssueDuPassage>> = {};
  for (const tache of d.ordre ?? (cles as NomDeTache[])) {
    const passage = d.inscriptions[tache];
    if (passage === undefined) continue;
    try {
      const r = await d.verrou.sous(cleDuVerrou(tache), passage);
      if (!r.pris) {
        issues[tache] = 'deja_en_cours';
        continue;
      }
      await d.battre(tache, {
        succesAt: d.maintenant(),
        compteurs: { ...(r.valeur as CompteursDuPassage) },
      });
      issues[tache] = 'joue';
    } catch {
      await d.battre(tache, { echecAt: d.maintenant() }).catch(() => undefined);
      issues[tache] = 'echec';
    }
  }
  return issues;
}

/**
 * La patience d'une transaction qui tient un verrou de tâche : celle d'un instrument, pas un seuil
 * métier (RM-10). Un passage plus long que cela échoue, et son battement le dit.
 */
const DUREE_MAX_D_UN_PASSAGE_MS = 10 * 60 * 1000;

/** Le verrou consultatif de Postgres, par transaction : relâché par la base, même sur une panne. */
export function verrouConsultatif(prisma: PrismaClient): VerrouConsultatif {
  return {
    async sous(cle, travail) {
      return prisma.$transaction(
        async (tx) => {
          const [ligne] = await tx.$queryRaw<{ pris: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(hashtextextended(${cle}, 0)) AS pris`;
          if (ligne?.pris !== true) return { pris: false as const };
          return { pris: true as const, valeur: await travail() };
        },
        { timeout: DUREE_MAX_D_UN_PASSAGE_MS, maxWait: DUREE_MAX_D_UN_PASSAGE_MS }
      );
    },
  };
}

/** Le code de sortie du point d'entrée : 1 dès qu'une tâche a échoué, sinon 0. */
export function codeDeSortie(issues: Partial<Record<NomDeTache, IssueDuPassage>>): 0 | 1 {
  return Object.values(issues).includes('echec') ? 1 : 0;
}

// ── le point d'entrée : une tâche planifiée de la plateforme, chaque minute (`pnpm taches:lancer`) ──

const APPELE_DIRECTEMENT = /lanceur\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  const prisma = new PrismaClient();
  const journal = creerJournal();
  // Le journal ne porte que le nom de chaque tâche et son issue ; l'erreur, par son NOM.
  lancerLesPassages({
    inscriptions: inscriptions(prisma),
    verrou: verrouConsultatif(prisma),
    battre: depotDuTravail(prisma).battre,
    maintenant: () => new Date(horlogeSysteme.maintenant()),
  })
    .then(
      (issues) => {
        journal.info('passages_planifies', { issues });
        process.exitCode = codeDeSortie(issues);
      },
      (erreur: unknown) => {
        journal.error('lanceur_en_echec', {
          nom: erreur instanceof Error ? erreur.name : 'Erreur',
        });
        process.exitCode = 1;
      }
    )
    .finally(() => prisma.$disconnect());
}
