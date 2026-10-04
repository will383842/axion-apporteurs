/**
 * Le résumé quotidien du journal des accès à la console au journal chaîné — SEC-59 (REQ-SEC-058).
 *
 * Condition (2) de la sécurité sur SEC-58, forme commune d'A02 et de la sécurité. Le journal des accès
 * (`journal_acces_console`) est en ajout seul, tenu par la base. Mais son propriétaire peut lever le
 * gabarit, et une ligne retirée ne laisserait aucune trace. Chaque jour clos reçoit donc, au journal
 * chaîné, un résumé `journal_acces_console_resume` qui porte :
 *   — le nombre de lignes du jour (`lignesNombre`) ;
 *   — une empreinte SHA-256 des lignes COMPLÈTES triées par `id` (`empreinteComplete`), sur `id`,
 *     `nature`, `survenu_at`, `utilisateur_console_id`, `cible_id` et `ip_hash`. Elle se vérifie
 *     jusqu'à la purge ;
 *   — une empreinte SHA-256 des seules colonnes qui SURVIVENT à la purge (`empreinteSurvivante`), sur
 *     `id`, `nature` et `survenu_at`. Elle se vérifie pour toujours.
 * Aucun identifiant d'employé, ni cible, ni empreinte réseau n'entre au résumé : des comptes et des
 * empreintes seulement, comme le journal pseudonyme des anomalies. Le journal chaîné, lui, ne se
 * modifie pas : une suppression ou une modification du journal des accès contredit son résumé.
 *
 * LA LIGNE. Chaque ligne est mise sous la forme canonique du journal (`canonique`, clés triées), les
 * lignes sont triées par `id` et jointes par un saut de ligne, puis hachées. Un jour sans accès a
 * aussi son résumé, à zéro : une ligne ajoutée après coup à ce jour-là le contredit.
 *
 * LES JOURS. Un jour civil UTC est clos à minuit UTC. La tâche résume chaque jour clos qui n'a pas
 * encore de résumé, du lendemain du dernier jour résumé jusqu'à la veille. Au premier passage, elle
 * part du jour de la plus ancienne ligne, ou de la veille si la table est vide. Un passage manqué ne
 * perd donc aucun jour. `survenu_at` est l'horloge du serveur à l'écriture de la ligne : aucune ligne
 * ne naît dans un jour déjà clos.
 *
 * LA VÉRIFICATION recalcule chaque résumé sur la table. Le nombre et l'empreinte survivante sont
 * toujours confrontés. L'empreinte complète l'est tant qu'aucune ligne du jour n'est purgée : la purge
 * vide les identifiants, et elle seule le peut (gabarit `refuser_modification_sauf`). LIMITE
 * DÉCLARÉE : le jour où la purge passe, et lui seul, une modification d'une ligne pas encore purgée ne
 * se voit plus que par l'empreinte survivante, donc seulement sur `id`, `nature` et `survenu_at`.
 *
 * LE PASSAGE est dû une fois par jour civil UTC : déjà réussi ce jour (son battement le dit), il ne lit
 * ni n'écrit rien. Sinon il résume, puis vérifie tous les résumés. Une contradiction le fait ÉCHOUER
 * en nommant le jour et la faute, jamais une donnée, et son battement le dit.
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonique } from '../../domain/evenement/canonique';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { ajouterEvenement, lireJournalParLots } from '../evenement/journal';

/** Le type du résumé au journal chaîné. */
const TYPE_DU_RESUME = 'journal_acces_console_resume' as const;

/** Les fautes que la vérification nomme. */
export type FauteDuResume =
  'nombre_contredit' | 'empreinte_complete_contredite' | 'empreinte_survivante_contredite';

/** Une contradiction : le jour (`AAAA-MM-JJ`) et la faute. Rien d'autre. */
export interface Contradiction {
  jour: string;
  faute: FauteDuResume;
}

/** Ce qu'un résumé porte, hors acteur. */
interface Resume {
  jour: string;
  lignesNombre: number;
  empreinteComplete: string;
  empreinteSurvivante: string;
}

/** Minuit UTC du jour d'un instant. */
const minuitUtc = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const jourUtc = (d: Date): string => d.toISOString().slice(0, 10);

const sha256 = (lignes: readonly string[]): string =>
  createHash('sha256').update(lignes.join('\n')).digest('hex');

/** Les lignes d'un jour, triées par `id`, sous les deux formes hachées, et le nombre de purgées. */
async function lignesDuJour(prisma: PrismaClient, debut: Date) {
  const fin = new Date(debut.getTime() + MS_PAR_JOUR);
  const lignes = await prisma.journalAccesConsole.findMany({
    where: { survenuAt: { gte: debut, lt: fin } },
    select: {
      id: true,
      nature: true,
      survenuAt: true,
      utilisateurConsoleId: true,
      cibleId: true,
      ipHash: true,
      purgeAt: true,
    },
  });
  // Le tri se fait ici, sur la chaîne : l'ordre d'un `uuid` en base n'est pas celui du code.
  lignes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    nombre: lignes.length,
    purgees: lignes.filter((l) => l.purgeAt !== null).length,
    empreinteComplete: sha256(
      lignes.map((l) =>
        canonique({
          id: l.id,
          nature: l.nature,
          survenuAt: l.survenuAt.toISOString(),
          utilisateurConsoleId: l.utilisateurConsoleId,
          cibleId: l.cibleId,
          ipHash: l.ipHash,
        })
      )
    ),
    empreinteSurvivante: sha256(
      lignes.map((l) =>
        canonique({ id: l.id, nature: l.nature, survenuAt: l.survenuAt.toISOString() })
      )
    ),
  };
}

/** Les résumés déjà écrits, lus au journal chaîné par son lecteur. */
async function resumesEcrits(prisma: PrismaClient): Promise<Resume[]> {
  const journal = await lireJournalParLots(prisma);
  return journal.filter((l) => l.type === TYPE_DU_RESUME).map((l) => l.charge as Resume);
}

/** Le premier jour à résumer : le lendemain du dernier résumé, sinon le jour de la plus ancienne ligne. */
async function premierJour(prisma: PrismaClient, ecrits: Resume[], veille: Date): Promise<Date> {
  if (ecrits.length > 0) {
    const dernier = Math.max(...ecrits.map((r) => new Date(r.jour).getTime()));
    return new Date(dernier + MS_PAR_JOUR);
  }
  const plusAncienne = await prisma.journalAccesConsole.findFirst({
    orderBy: { survenuAt: 'asc' },
    select: { survenuAt: true },
  });
  return plusAncienne === null ? veille : minuitUtc(plusAncienne.survenuAt);
}

/** Écrit le résumé de chaque jour clos qui n'en a pas encore. Rend le nombre de résumés écrits. */
export async function resumerLeJournalDesAccesConsole(
  prisma: PrismaClient,
  maintenant: Date
): Promise<{ resumes: number }> {
  const veille = new Date(minuitUtc(maintenant).getTime() - MS_PAR_JOUR);
  let jour = await premierJour(prisma, await resumesEcrits(prisma), veille);
  let resumes = 0;
  while (jour.getTime() <= veille.getTime()) {
    const l = await lignesDuJour(prisma, jour);
    const debut = jour;
    await prisma.$transaction((tx) =>
      ajouterEvenement(tx, {
        type: TYPE_DU_RESUME,
        survenuAt: maintenant,
        charge: {
          acteur: { par: 'systeme' },
          jour: debut.toISOString(),
          lignesNombre: l.nombre,
          empreinteComplete: l.empreinteComplete,
          empreinteSurvivante: l.empreinteSurvivante,
        },
      })
    );
    resumes++;
    jour = new Date(jour.getTime() + MS_PAR_JOUR);
  }
  return { resumes };
}

/** Confronte chaque résumé écrit à la table. Rend le nombre de résumés lus et les contradictions. */
export async function verifierLesResumesDuJournalDesAcces(
  prisma: PrismaClient
): Promise<{ resumes: number; contradictions: Contradiction[] }> {
  const ecrits = await resumesEcrits(prisma);
  const contradictions: Contradiction[] = [];
  for (const r of ecrits) {
    const debut = new Date(r.jour);
    const l = await lignesDuJour(prisma, debut);
    const jour = jourUtc(debut);
    if (l.nombre !== r.lignesNombre) contradictions.push({ jour, faute: 'nombre_contredit' });
    if (l.purgees === 0 && l.empreinteComplete !== r.empreinteComplete) {
      contradictions.push({ jour, faute: 'empreinte_complete_contredite' });
    }
    if (l.empreinteSurvivante !== r.empreinteSurvivante) {
      contradictions.push({ jour, faute: 'empreinte_survivante_contredite' });
    }
  }
  return { resumes: ecrits.length, contradictions };
}

/**
 * Le passage `journal_acces_console_resumer` : dû une fois par jour civil UTC. Il résume les jours
 * clos, puis vérifie tous les résumés ; une contradiction le fait échouer, en nommant jours et fautes.
 */
export function passageDuResumeDuJournalDesAcces(
  prisma: PrismaClient,
  d: { maintenant: () => Date; dernierSucces: () => Promise<Date | null> }
): () => Promise<{ resumes: number; verifies: number } | { differee: number }> {
  return async () => {
    const maintenant = d.maintenant();
    const dernier = await d.dernierSucces();
    if (dernier !== null && jourUtc(dernier) === jourUtc(maintenant)) return { differee: 1 };
    const { resumes } = await resumerLeJournalDesAccesConsole(prisma, maintenant);
    const v = await verifierLesResumesDuJournalDesAcces(prisma);
    if (v.contradictions.length > 0) {
      const fautes = v.contradictions.map((c) => `${c.jour} ${c.faute}`).join(', ');
      throw new Error(`resume_contredit : ${fautes}`);
    }
    return { resumes, verifies: v.resumes };
  };
}
