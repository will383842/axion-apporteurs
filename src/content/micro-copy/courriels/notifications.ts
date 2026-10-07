/**
 * Les textes des notifications de l'apporteur — UX-P1-10 (REQ-UX-016, REQ-JUR-039). Textes d'A07 du
 * 2026-10-02, repris MOT POUR MOT.
 *
 * Pour chaque clé de la table (`src/server/notifications/table-ssot.ts`) : un TITRE, UN appel à
 * l'action, et, quand le contrat l'exige, la phrase de corps qu'il impose et que la tâche émettrice
 * reprend telle quelle. Les variables sont entre accolades et remplies par l'émetteur.
 *
 * Aucun texte n'est une instruction, une relance d'activité, ni une menace (charte relationnelle,
 * REQ-JUR-012, REQ-JUR-039) : une notification INFORME, et l'appel à l'action est une possibilité.
 */
import { MENTION_DU_REFUS } from '../espace/issues-depot';

export type TexteDeNotification = {
  readonly titre: string;
  readonly appel: string;
  /** La phrase que le contrat exige dans le corps, ou `null`. */
  readonly corps: string | null;
};

export const TEXTES_DES_NOTIFICATIONS = {
  lien_magique: {
    titre: 'Votre lien de connexion à votre espace',
    appel: 'Ouvrir mon espace',
    corps: null,
  },
  depot_injoignable_j5: {
    titre: "{entreprise} : la confirmation de l'échange est en cours",
    appel: 'Voir Mes entreprises',
    corps:
      "Axion-IA n'a pas encore pu joindre {contact}. Votre dépôt garde son heure d'enregistrement.",
  },
  // DM-25 — l'annulation pour antériorité de la Société (art. 3.3) : texte de la juriste, MOT POUR
  // MOT. Le critère n'y figure pas (règle de SEC-12) ; {delaiReponse} vient de la SSOT.
  /**
   * UX-P1-61 (art. 3.4 al. 2) : le rétablissement d'un dépôt périmé faute d'échange, quand l'absence
   * d'échange tenait à Axion-IA. Le corps est celui de la juriste (#803, 6039744045, point 3), mot pour
   * mot ; il ne dit rien d'une prise en charge qui aurait cédé. {date} : le terme, posé par l'émettrice.
   * Titre et appel retenus par la juriste (#803, 6041520663).
   */
  attribution_retablie: {
    titre: '{entreprise} : votre dépôt est rétabli',
    appel: 'Voir Mes entreprises',
    corps:
      "Votre dépôt de {entreprise} est rétabli jusqu'au {date} : l'absence d'échange tenait à Axion-IA (contrat, article 3.4).",
  },
  attribution_annulee_anteriorite: {
    titre: '{entreprise} : votre dépôt est annulé — antériorité de la Société',
    appel: 'Voir Mes entreprises',
    corps:
      "Axion-IA connaissait déjà cette entreprise à la date de votre dépôt (contrat, article 3.3) : votre dépôt est annulé, et aucune commission nouvelle n'est due à son titre. Les commissions déjà acquises restent acquises. Vous pouvez contester cette décision par écrit ; Axion-IA vous répond de façon motivée dans les {delaiReponse}.",
  },
  attribution_liberee: {
    titre: '{entreprise} : réservation terminée',
    appel: 'Voir Mes entreprises',
    corps: null,
  },
  decision_attribution: {
    titre: '{entreprise} : une décision concerne votre dépôt',
    appel: 'Contester cette décision par écrit',
    // {delaiReponse} : le délai de la SSOT (contrat art. 3.3 et 5.6), posé par l'envoi, jamais retapé.
    corps:
      '{motif}. Vous pouvez contester cette décision par écrit ; Axion-IA vous répond de façon motivée dans les {delaiReponse}.',
  },
  premier_rang_libere: {
    titre: "{entreprise} : vous pouvez la déposer à nouveau jusqu'au {dateLimite}",
    appel: 'Déposer à nouveau cette entreprise',
    corps:
      "Votre dépôt était le premier en attente. Sans nouveau dépôt d'ici le {dateLimite}, votre dépôt en attente est effacé.",
  },
  refus_declaration: {
    titre: '{entreprise} : dépôt non enregistré — {categorie}',
    appel: 'Contester ce refus par écrit',
    // La mention de l'espace, DÉRIVÉE (RM-01) : « n'est pas un manquement » reprend la fin de
    // l'art. 3.3 bis (avis d'A07 du 2026-10-02).
    corps: `{categorie} : {motif}. ${MENTION_DU_REFUS}`,
  },
  suspension_declarations: {
    titre: "Vos nouveaux dépôts sont suspendus le temps d'un échange avec Axion-IA",
    appel: 'Lire le courrier et répondre',
    corps:
      "{faits}. Cette suspension prend fin au plus tard le {dateLevee}. Rien ne change pour vos entreprises en cours, ni pour vos commissions, ni pour l'accès à votre espace.",
  },
  rappel_rc_pro: {
    titre: "Votre attestation d'assurance arrive à échéance le {dateEcheance}",
    appel: 'Déposer la nouvelle attestation',
    corps: null,
  },
  rattachement_decide: {
    titre: '{entreprise} : décision de rattachement',
    appel: 'Voir Mes entreprises',
    corps: '{decision}. Motif : {motif}.',
  },
  // SEC-55 (rattrapage 102) : l'avis de sécurité du compte, texte de la juriste MOT POUR MOT ; l'appel
  // mène à la page de connexion, sans jeton ni paramètre. Rien sur l'appareil, ni lieu ni navigateur.
  nouvel_appareil: {
    titre: 'Connexion à votre espace depuis un nouvel appareil',
    appel: 'Demander un nouveau lien de connexion',
    corps:
      "Votre lien de connexion a été utilisé le {dateHeure} sur un appareil que nous ne connaissions pas encore pour votre compte. Si c'est bien vous, vous n'avez rien à faire. Sinon, ne cliquez sur aucun lien reçu que vous n'avez pas demandé, demandez un nouveau lien de connexion depuis la page de connexion, et écrivez à Axion-IA.",
  },
  // SEC-19 (juriste, #703, 5980966503, MOT POUR MOT) : la mise en demeure de l'art. 11.2.
  // {delaiMiseEnDemeure} : la SSOT, en toutes lettres, posée par l'envoi ; {article} : la liste fermée
  // de l'art. 11.2 ; {faits} : saisis par une personne, sous les règles de DM-55.
  mise_en_demeure: {
    titre: 'Mise en demeure de remédier à un manquement au contrat',
    appel: 'Écrire à Axion-IA',
    corps:
      "Axion-IA vous met en demeure de remédier, dans un délai de {delaiMiseEnDemeure} à compter de l'envoi de ce message, au manquement suivant à l'article {article} du contrat : {faits}. À défaut, Axion-IA pourra résilier le contrat sans préavis, par une décision motivée (article 11.2). Cette mise en demeure n'est ni un avertissement ni une mesure disciplinaire, et elle ne constitue pas un antécédent. Vous pouvez répondre par écrit à Axion-IA.",
  },
  // SEC-19 (juriste, #703, 5980966503) : la fin du contrat. Le corps dépend du MOTIF de la
  // résiliation : `PARAGRAPHES_DE_LA_RESILIATION`, puis `PARAGRAPHE_COMMUN_DE_LA_RESILIATION`.
  resiliation: {
    titre: "Fin de votre contrat d'apporteur",
    appel: 'Voir mes commissions',
    corps: null,
  },
} as const satisfies Readonly<Record<string, TexteDeNotification>>;

export type CleDeNotification = keyof typeof TEXTES_DES_NOTIFICATIONS;

/**
 * Le corps d'`attribution_liberee`, choisi par la CAUSE de la fin (textes d'A07 du 2026-10-02, mot
 * pour mot ; titre et appel inchangés). Une demande vérifiée libérée ouvre une carence de redépôt
 * (art. 3.2 al. 6), seule conséquence de la libération ; une péremption ou une fin de durée
 * (art. 3.4) n'en ouvre aucune. `{dateRedepot}` est fourni par l'émettrice.
 */
export const CORPS_DE_LA_LIBERATION = {
  demande_verifiee:
    "Ce dépôt a pris fin sans confirmation de l'échange. Vous pourrez déposer à nouveau cette entreprise à partir du {dateRedepot}. Cette fin n'emporte aucune autre conséquence pour vous.",
  peremption_ou_fin_de_duree:
    'Cette entreprise est de nouveau disponible, y compris pour un nouveau dépôt de votre part.',
} as const;

export type CauseDeLiberation = keyof typeof CORPS_DE_LA_LIBERATION;

/**
 * DM-55 — le `{motif}` de `decision_attribution`, par décision (textes de la juriste, rattrapage 98,
 * MOT POUR MOT, sans point final : le corps le pose). `{faits}` est le texte de la mesure notifiée
 * (DM-12) ; `{raison}` vient de la liste fermée des motifs d'annulation par la console.
 */
export const MOTIFS_DES_DECISIONS = {
  anomalie_confirmee:
    "À la vérification, ce dépôt ne remplit pas les conditions de l'article 3.7 du contrat. Faits retenus : {faits}",
  non_confirmee:
    "L'entreprise a indiqué expressément n'avoir eu aucun échange avec vous (contrat, article 3.7) ; vous pouvez demander à Axion-IA l'extrait de sa réponse",
  non_confirmee_par_courriel:
    "L'entreprise a indiqué expressément n'avoir eu aucun échange avec vous (contrat, article 3.7) ; vous pouvez demander à Axion-IA l'extrait de sa réponse",
  annulee_par_la_console:
    'Axion-IA a annulé ce dépôt avant sa confirmation, pour la raison suivante : {raison}',
  // DM-71 (art. 3.3 du v2) : les deux exceptions humaines après la confirmation (juriste, #806
  // 6039893112, révisé en 6039942821 : l'erreur d'identification n'a pas de faits ; #474 6037701905),
  // mot pour mot ; pour la fraude, « Faits retenus : {faits} » une fois, en fin de motif.
  annulee_erreur_identification:
    "Ce dépôt est annulé : l'entreprise a été identifiée par erreur (contrat, article 3.3) ; les commandes signées et les commissions acquises avant cette annulation restent dues",
  fraude_etablie:
    "À la vérification, ce dépôt ne remplit pas les conditions de l'article 3.7 du contrat et il est annulé (article 3.3) ; les commandes signées et les commissions acquises avant cette annulation restent dues. Faits retenus : {faits}",
} as const;

/**
 * DM-55 — le libellé de `{raison}`, par motif d'annulation par la console (juriste, rattrapage 98,
 * MOT POUR MOT, sans point final). `erreur_de_saisie_de_la_societe` n'a AUCUN libellé pour
 * l'apporteur : il ne vaut que pour la prise en charge d'un conseiller, et ne notifie rien.
 */
export const RAISONS_D_ANNULATION = {
  demande_de_l_apporteur: 'à votre demande',
  declaration_en_double:
    'vous aviez déjà déposé cette entreprise, et ce dépôt faisait double emploi avec le premier',
  entreprise_relevant_de_l_article_3_3_bis:
    '{categorie} (contrat, article 3.3 bis), situation qui existait déjà à la date de votre dépôt',
} as const;

/**
 * DM-55 — le nom de l'entreprise quand le dépôt n'a pas de raison sociale (juriste, MOT POUR
 * MOT) : le numéro que l'apporteur a lui-même saisi au dépôt, pour qu'il sache quel dépôt est visé.
 */
export const ENTREPRISE_DE_REPLI = 'Entreprise n° {numeroEntreprise}';

/**
 * DM-55 — à la place de `{faits}`, quand la justification de l'anomalie n'est plus conservée (juriste,
 * MOT POUR MOT, sans point final) : la notification de l'espace, relue après la purge, renvoie au
 * courriel qui les a portés.
 */
export const FAITS_NON_CONSERVES =
  'les faits vous ont été indiqués dans le courriel qui vous a informé de cette décision';

/**
 * DM-55 — le libellé de `{categorie}` (raison « article 3.3 bis »), par catégorie de la liste de la
 * Société (juriste, MOT POUR MOT). Ici la catégorie EST dite : la règle de SEC-22 ne vaut que pour
 * une vérification.
 */
export const LIBELLES_DES_CATEGORIES = {
  administration: "l'entreprise est une administration avec laquelle Axion-IA est en relation",
  financeur_public: "l'entreprise est un financeur public avec lequel Axion-IA est en relation",
  financeur_paritaire:
    "l'entreprise est un financeur paritaire avec lequel Axion-IA est en relation",
  organisme_de_formation_partenaire:
    "l'entreprise est un organisme de formation avec lequel Axion-IA est en relation",
} as const;

/** Les mois en toutes lettres, pour une date en clair (« 25 mai 2027 »). */
export const MOIS_EN_TOUTES_LETTRES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/**
 * SEC-54 — les deux phrases qui encadrent le code à six chiffres, dans le MÊME courriel que le lien
 * (`lien_magique`). Le code est une seconde forme du lien : il ne sert qu'une fois et ne vaut pas plus
 * longtemps que lui. Le code lui-même n'est pas un paramètre de texte : l'envoi le pose seul, sur sa
 * ligne, entre les deux phrases.
 */
export const CODE_DU_COURRIEL_DE_CONNEXION = {
  avant: 'Vous pouvez aussi saisir ce code sur la page de connexion :',
  apres: 'Il ne sert qu’une fois, et pas plus longtemps que le lien.',
} as const;

/**
 * SEC-19 — le paragraphe propre au MOTIF de la résiliation (juriste, #703, 5980966503, MOT POUR MOT),
 * une valeur par motif de `MotifResiliation`. `{dateEffet}` et `{dateReception}` sont des jours
 * civils de Paris ; `{motif}` suit les règles de `{faits}` (DM-55).
 */
export const PARAGRAPHES_DE_LA_RESILIATION = {
  ordinaire_apporteur:
    "Axion-IA a bien reçu, le {dateReception}, votre décision de résilier le contrat. Celui-ci prend fin le {dateEffet}, au terme du préavis prévu à l'article 11.1.",
  ordinaire_axion:
    "Axion-IA résilie votre contrat d'apporteur, comme le permet l'article 11.1. Le préavis court à compter de l'envoi de ce message : le contrat prend fin le {dateEffet}.",
  manquement_grave:
    "Axion-IA résilie votre contrat d'apporteur sans préavis, par une décision motivée, en application de l'article 11.2 : {motif}. Le contrat prend fin le {dateEffet}.",
  fin_de_plein_droit:
    "Le contrat d'apporteur a pris fin de plein droit le {dateEffet}, en application de l'article 12.5.",
} as const;

/**
 * SEC-19 — le paragraphe COMMUN de la résiliation (juriste, #703, 5980966503, MOT POUR MOT), dont la
 * première phrase est celle de 5982317891 et la dernière celle de 5981529273, MOT POUR MOT : dans le
 * courriel ET dans l'espace.
 */
export const PARAGRAPHE_COMMUN_DE_LA_RESILIATION =
  "Vos dépôts en cours de confirmation et vos dépôts en attente sont annulés ; vos réservations sans commande prennent fin. Les commandes signées avant la fin du contrat continuent de vous ouvrir droit à commission, au fur et à mesure de leurs encaissements, quelle qu'en soit la date. Les commissions déjà acquises vous sont payées au dernier relevé. Vous gardez l'accès en lecture à votre espace jusqu'à l'extinction de vos droits : reconnectez-vous avec votre adresse e-mail pour y accéder.";
