/**
 * L'écran des gels du journal des accès, en console : ses textes seuls. Lu par Axion-IA seul.
 *
 * Un gel protège de la purge les traces d'UNE portée (un utilisateur de la console, ou une cible)
 * tant qu'il est ouvert. L'écran ne nomme ni l'auteur du gel ni la personne visée : il dit le motif,
 * la référence, le type de portée et la période. Chaque refus du module a sa phrase, sans donnée de
 * personne ; celui où personne d'autre ne peut lever le dit en toutes lettres.
 */
import type { MotifGelJournal } from '@prisma/client';
import type { MotifDuGel } from '../../../server/console/gels-journal-acces';

export const GELS_JOURNAL_ACCES = {
  titre: 'Gels du journal des accès',
  intro:
    'Un gel protège de la purge les traces d’une personne ou d’une fiche, le temps d’un incident ou d’un litige. Il se lève par un autre administrateur que celui qui l’a posé.',
  colonnes: {
    motif: 'Motif',
    reference: 'Référence',
    portee: 'Portée',
    periode: 'Période',
    pose: 'Posé le',
    etat: 'État',
    action: 'Action',
  },
  motifs: { incident: 'Incident', litige: 'Litige' } satisfies Record<MotifGelJournal, string>,
  portees: {
    utilisateur: 'Un utilisateur de la console',
    cible: 'Une fiche (apporteur ou attribution)',
  },
  periode: (depuis: string, jusquA: string | null) =>
    jusquA === null ? `depuis le ${depuis}, sans fin` : `du ${depuis} au ${jusquA}`,
  etats: {
    ouvert: 'Ouvert',
    leve: (date: string) => `Levé le ${date}`,
  },
  actions: { lever: 'Lever le gel' },
  poser: {
    titre: 'Poser un gel',
    motif: 'Motif',
    reference: 'Référence de l’incident ou du litige',
    aideReference: 'Lettres, chiffres et tirets, comme sur le dossier.',
    portee: 'Portée',
    identifiant: 'Identifiant de la personne ou de la fiche',
    depuis: 'Protéger les traces depuis le',
    jusquA: 'Jusqu’au (facultatif : sans date, le gel couvre aussi les traces à venir)',
    envoyer: 'Poser le gel',
  },
  vide: {
    titre: 'Aucun gel',
    phrase:
      'Aucune trace n’est protégée de la purge. Posez un gel quand un incident ou un litige l’exige.',
  },
  pages: { suivante: 'Gels plus anciens', premiere: 'Revenir aux plus récents' },
  chargement: 'Chargement des gels…',
  /** Une saisie que le serveur refuse avant tout travail : référence, identifiant ou date hors forme. */
  saisie: 'La saisie est incomplète ou hors forme : vérifiez la référence, l’identifiant et les dates.',
  /** Les refus du module, tels que l'écran les dit. */
  refus: {
    droit_absent: 'Votre rôle ne permet pas ce geste.',
    introuvable: 'Ce gel, ou la personne visée, n’existe pas ou plus.',
    deja_leve: 'Ce gel est déjà levé : la page a été rechargée.',
    leveur_interdit:
      'Vous ne pouvez pas lever ce gel : vous l’avez posé, ou il vous vise. Un autre administrateur le lèvera.',
    aucun_autre_administrateur:
      'Ce gel ne peut pas être levé : aucun autre administrateur validé ne peut le faire. Il reste posé.',
  } satisfies Record<MotifDuGel, string>,
} as const;
