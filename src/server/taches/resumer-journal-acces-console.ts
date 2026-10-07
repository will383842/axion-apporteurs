/**
 * Le résumé quotidien du journal des accès à la console, au journal chaîné — SEC-59 (REQ-SEC-058).
 *
 * Condition (2) de la sécurité sur SEC-58, forme d'A02 (rattrapage 104). Le journal des accès
 * (`journal_acces_console`) est en ajout seul, tenu par la base. Mais son propriétaire peut lever le
 * gabarit, et une ligne retirée ne laisserait aucune trace. Chaque jour clos reçoit donc, au journal
 * chaîné, un résumé `journal_acces_console_resume` : le nombre de lignes du jour (`lignesNombre`) et
 * DEUX empreintes SHA-256 de leur texte (`resume-journal-acces.ts` du domaine, sérialisation fixée,
 * vecteur figé) :
 *   — `empreinteComplete`, sur `id`, `nature`, `survenu_at`, `utilisateur_console_id`, `cible_id` et
 *     `ip_hash` : elle se vérifie jusqu'à la purge ;
 *   — `empreinteSurvivante`, sur `id`, `nature` et `survenu_at` seuls : elle se vérifie pour toujours.
 * Aucun identifiant d'employé, ni cible, ni empreinte réseau n'entre au résumé. Le journal chaîné ne
 * se modifie pas : une suppression ou une modification du journal des accès contredit son résumé.
 *
 * LES JOURS. Un jour civil UTC (`jourUtc`) est clos à minuit UTC PLUS UNE MARGE (SSOT,
 * `JOURNAL_ACCES_CONSOLE_RESUME_MARGE_MINUTES`) : une transaction de la console qui écrit sa trace à
 * 23:59:59,9 et valide après minuit ne doit pas manquer au résumé, qui ne se réécrit jamais. La tâche résume chaque jour clos
 * qui n'a pas encore de résumé, du lendemain du dernier jour résumé jusqu'à la veille ; au premier
 * passage, du jour de la plus ancienne ligne, ou de la veille si la table est vide. Un jour sans
 * ligne a son résumé, à zéro. Un passage manqué ne perd donc aucun jour.
 *
 * UN SEUL RÉSUMÉ PAR JOUR. Chaque jour s'écrit dans SA transaction, qui prend d'abord un verrou
 * consultatif de transaction (clé fixe de la tâche), puis relit les résumés écrits : un jour déjà résumé
 * est laissé tel quel, jamais réécrit, et deux passages simultanés se suivent au lieu de doubler.
 *
 * LA VÉRIFICATION confronte chaque résumé à la table. Le nombre et l'empreinte survivante le sont
 * toujours ; l'empreinte complète tant qu'aucune ligne du jour n'est purgée (la purge vide les
 * identifiants, et elle seule le peut : gabarit `refuser_modification_sauf`). LIMITE DÉCLARÉE : le jour
 * où la purge passe, une modification d'une ligne pas encore purgée ne se voit plus que sur `id`,
 * `nature` et `survenu_at`.
 *
 * LE PASSAGE est dû une fois par jour civil UTC, compté depuis la fin de la marge : déjà réussi ce jour
 * (son battement le dit), il ne lit
 * ni n'écrit rien. Sinon il résume, puis vérifie tous les résumés. Une contradiction le fait ÉCHOUER en
 * nommant le jour et la faute, jamais une donnée.
 */
import type { PrismaClient } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../domain/evenement/charges';
import { empreintesDuJour } from '../../domain/evenement/resume-journal-acces';
import { PARAMETRES } from '../../domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../domain/temps/calendrier-civil';
import { ajouterEvenement, lireLesResumesDuJournalDesAcces } from '../evenement/journal';

/** Le type du résumé au journal chaîné. */
const TYPE_DU_RESUME = 'journal_acces_console_resume' as const;

/** Les fautes que la vérification nomme. */
export type FauteDuResume =
  'nombre_contredit' | 'empreinte_complete_contredite' | 'empreinte_survivante_contredite';

/** Une contradiction : le jour (`AAAA-MM-JJ`) et la faute. Rien d'autre. */
export interface Contradiction {
  jourUtc: string;
  faute: FauteDuResume;
}

/** Ce qu'un résumé écrit porte, hors acteur. */
interface Resume {
  jourUtc: string;
  lignesNombre: number;
  empreinteComplete: string;
  empreinteSurvivante: string;
}

/** Minuit UTC du jour d'un instant. */
const minuitUtc = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const jourUtcDe = (d: Date): string => d.toISOString().slice(0, 10);

/** La marge après minuit UTC, en millisecondes : lue de la SSOT, jamais recopiée. */
const MARGE_MS = PARAMETRES.JOURNAL_ACCES_CONSOLE_RESUME_MARGE_MINUTES.valeur * 60_000;

/**
 * Le « jour du passage » : le jour UTC de l'instant RECULÉ de la marge. Un jour n'est clos qu'une marge
 * après minuit UTC ; avant, le passage vit encore dans le jour d'avant.
 */
const jourDuPassage = (d: Date): string => jourUtcDe(new Date(d.getTime() - MARGE_MS));

/**
 * Le verrou consultatif de TRANSACTION de l'écriture des résumés : une clé fixe de la tâche. Deux
 * passages simultanés se suivent au lieu d'écrire deux fois le même jour.
 */
const CLE_DU_VERROU = 'journal_acces_console_resumer';

/** Les lignes d'un jour clos, et le nombre de purgées. */
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
  return { ...empreintesDuJour(lignes), purgees: lignes.filter((l) => l.purgeAt !== null).length };
}

/** Les résumés déjà écrits, relus au journal chaîné. Une charge hors forme échoue FERMÉ, sans valeur. */
async function resumesEcrits(client: Parameters<typeof lireLesResumesDuJournalDesAcces>[0]) {
  const charges = await lireLesResumesDuJournalDesAcces(client);
  return charges.map((c): Resume => {
    const r = CHARGES_PAR_TYPE.journal_acces_console_resume.safeParse(c);
    if (!r.success) throw new Error('resume_illisible');
    return r.data;
  });
}

/** Le premier jour à résumer : le lendemain du dernier résumé, sinon le jour de la plus ancienne ligne. */
async function premierJour(prisma: PrismaClient, ecrits: Resume[], veille: Date): Promise<Date> {
  if (ecrits.length > 0) {
    const dernier = Math.max(...ecrits.map((r) => Date.parse(`${r.jourUtc}T00:00:00.000Z`)));
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
  const veille = new Date(
    minuitUtc(new Date(maintenant.getTime() - MARGE_MS)).getTime() - MS_PAR_JOUR
  );
  let jour = await premierJour(prisma, await resumesEcrits(prisma), veille);
  let resumes = 0;
  while (jour.getTime() <= veille.getTime()) {
    const jourUtc = jourUtcDe(jour);
    const l = await lignesDuJour(prisma, jour);
    const ecrit = await prisma.$transaction(async (tx) => {
      // Le verrou d'abord, puis la relecture : un SEUL résumé par jour, même sous deux passages.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CLE_DU_VERROU}, 0))`;
      // Un jour déjà résumé n'est pas réécrit.
      if ((await resumesEcrits(tx)).some((r) => r.jourUtc === jourUtc)) return false;
      await ajouterEvenement(tx, {
        type: TYPE_DU_RESUME,
        survenuAt: maintenant,
        charge: {
          acteur: { par: 'systeme' },
          jourUtc,
          lignesNombre: l.lignesNombre,
          empreinteComplete: l.empreinteComplete,
          empreinteSurvivante: l.empreinteSurvivante,
        },
      });
      return true;
    });
    if (ecrit) resumes++;
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
    const l = await lignesDuJour(prisma, new Date(`${r.jourUtc}T00:00:00.000Z`));
    if (l.lignesNombre !== r.lignesNombre) {
      contradictions.push({ jourUtc: r.jourUtc, faute: 'nombre_contredit' });
    }
    // Une ligne purgée n'a plus ses identifiants : l'empreinte complète n'est plus comparable.
    if (l.purgees === 0 && l.empreinteComplete !== r.empreinteComplete) {
      contradictions.push({ jourUtc: r.jourUtc, faute: 'empreinte_complete_contredite' });
    }
    if (l.empreinteSurvivante !== r.empreinteSurvivante) {
      contradictions.push({ jourUtc: r.jourUtc, faute: 'empreinte_survivante_contredite' });
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
    if (dernier !== null && jourDuPassage(dernier) === jourDuPassage(maintenant))
      return { differee: 1 };
    const { resumes } = await resumerLeJournalDesAccesConsole(prisma, maintenant);
    const v = await verifierLesResumesDuJournalDesAcces(prisma);
    if (v.contradictions.length > 0) {
      const fautes = v.contradictions.map((c) => `${c.jourUtc} ${c.faute}`).join(', ');
      throw new Error(`resume_contredit : ${fautes}`);
    }
    return { resumes, verifies: v.resumes };
  };
}
