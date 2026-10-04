/**
 * Le dossier de conformité d'un apporteur, en console (CPL-T07, maquette `apporteur-fiche.html`, bloc
 * « Dossier de conformité ») : ses textes seuls. Lu par Axion-IA seul.
 *
 * Les motifs de refus : leur libellé court pour la console, et la phrase que l'apporteur lira, de la
 * juriste, MOT POUR MOT (2026-10-04). Un refus porte toujours UN motif de la liste, jamais un texte
 * libre ; il n'empêche pas l'apporteur d'envoyer aussitôt une nouvelle pièce.
 */
import type { MotifRefusPiece, StatutPieceKyc, TypePieceKyc } from '../../../domain/kyc/pieces';

export const CONFORMITE_CONSOLE = {
  titre: 'Dossier de conformité',
  retour: '← Fiche de l’apporteur',
  siren: 'SIREN',
  regimeTva: { assujetti: 'assujetti à la TVA', franchise_293b: 'franchise de TVA' },
  sansIdentite: 'SIREN non saisi',
  legende: (total: number, aVerifier: number) => `Pièces : ${total} · ${aVerifier} à vérifier`,
  colonnes: { piece: 'Pièce', etat: 'État', action: 'Action' },
  jusquau: (date: string) => `jusqu’au ${date}`,
  aucuneAction: '—',
  /** Le RIB se vérifie à quatre yeux, dans son propre geste (condition de la sécurité). */
  ribAilleurs: 'Vérifié à quatre yeux, hors de cet écran',
  actions: {
    valider: 'Valider',
    refuser: 'Refuser avec un motif',
    motif: 'Motif du refus',
    ouvrir: 'Ouvrir le dossier de conformité',
    validerLeDossier: 'Valider le dossier : prêt à signer',
  },
  manques: (pieces: string) => `Il reste à valider avant la signature : ${pieces}.`,
  complet: 'Le dossier est complet : il peut passer à la signature.',
  vide: {
    titre: 'Aucune pièce déposée',
    phrase: 'L’apporteur n’a encore déposé aucune pièce ; le dossier se remplit depuis son espace.',
  },
  chargement: 'Chargement du dossier…',
  introuvable: {
    titre: 'Apporteur introuvable',
    phrase: 'Cet apporteur n’existe pas, ou plus. Revenez à la liste des apporteurs.',
  },
  /** Les refus d'un geste, tels que l'écran les dit, sans donnée de personne. */
  refus: {
    droit_absent: 'Votre rôle ne permet pas ce geste.',
    introuvable: 'Cette pièce n’existe pas, ou plus.',
    piece_pas_a_verifier: 'Cette pièce n’est plus à vérifier : la page a été rechargée.',
    rib_hors_de_ce_geste: 'Le RIB se vérifie à quatre yeux, hors de cet écran.',
    echeance_passee: 'L’échéance de cette pièce est passée : elle ne peut pas être validée.',
    transition_refusee: 'Le dossier n’est pas dans l’état qui permet ce geste.',
    pieces_manquantes: 'Des pièces manquent encore : elles sont listées sous le tableau.',
  },
  types: {
    siret: 'Extrait d’immatriculation',
    tva: 'Numéro de TVA',
    rib: 'IBAN (relevé d’identité bancaire)',
    identite: 'Pièce d’identité',
    vigilance: 'Attestation de vigilance',
    rc_pro: 'RC pro',
  } satisfies Record<TypePieceKyc, string>,
  statuts: {
    manquante: 'Manquante',
    a_verifier: 'À vérifier',
    valide: 'Valide',
    perimee: 'Périmée',
    refusee: 'Refusée',
  } satisfies Record<StatutPieceKyc, string>,
  motifsRefus: {
    illisible: {
      libelle: 'Illisible',
      phraseApporteur: "La pièce n'est pas lisible : envoyez une copie nette et complète.",
    },
    au_nom_d_un_tiers: {
      libelle: 'Au nom d’un tiers',
      phraseApporteur:
        "La pièce n'est pas à votre nom ni à celui de votre entreprise : envoyez une pièce à votre nom.",
    },
    perimee: {
      libelle: 'Périmée',
      phraseApporteur:
        "La pièce n'est plus en cours de validité : envoyez une pièce valable à ce jour.",
    },
    incomplete: {
      libelle: 'Incomplète',
      phraseApporteur:
        "Une partie de la pièce manque : envoyez-la en entier, toutes les pages et, s'il y a lieu, le recto et le verso.",
    },
    non_conforme: {
      libelle: 'Non conforme',
      phraseApporteur:
        'La pièce ne correspond pas à celle qui est demandée, ou aux informations que vous avez déclarées : vérifiez-la, puis envoyez la bonne pièce.',
    },
  } satisfies Record<MotifRefusPiece, { libelle: string; phraseApporteur: string }>,
} as const;
