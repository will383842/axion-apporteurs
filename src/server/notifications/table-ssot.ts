/**
 * La table des notifications — la SOURCE UNIQUE des clés de `courriels_envoyes.gabarit`,
 * `notifications_espace.cle` et `preferences_notification.cle` (INT-T10, puis UX-P1-10 ; exceptions
 * E2 et E3 de partners/ADR-0022). REQ-UX-016, REQ-JUR-039, REQ-JUR-033.
 *
 * POURQUOI UNE TABLE DE CODE ET PAS UN ENUM : un enum Postgres en serait une seconde copie, et
 * chaque nouvelle notification deviendrait une PR `schema`. La FORME est tenue par la base (CHECK),
 * la VALEUR ici : une clé hors de cette table est refusée AVANT toute écriture, et un test
 * d'intégration confronte les clés écrites en base à cette table. Aucune règle métier ne branche
 * sur cette colonne. Une clé nouvelle entre par UNE ligne, avec sa tâche émettrice.
 *
 * LA LISTE est celle qu'A02 a arrêtée le 2026-10-02 : une clé n'entre que si sa source est une
 * exigence de phase 1 ET si son émetteur est une tâche de phase 1 du registre. Les textes sont dans
 * `src/content/micro-copy/courriels/notifications.ts` (A07).
 *
 * DEUX NOTIONS DISTINCTES (correction d'A07, retenue par A02) :
 *   — `notificationObligatoire` : le contrat exige l'information ; l'e-mail est alors obligatoire et
 *     NON désactivable ;
 *   — `faitCourirUnDelai` : la notification fait courir un délai CONTRE l'apporteur, compté de
 *     `courriels_envoyes.envoye_at`, jamais de `notifications_espace.lue_at`.
 *   Un délai sans obligation est une faute : `faitCourirUnDelai` ⇒ `notificationObligatoire`.
 *
 * AUCUN DÉCLENCHEUR D'INACTIVITÉ (charte relationnelle, M04 ; REQ-JUR-033, REQ-JUR-039) : une
 * notification part sur un ÉVÉNEMENT, l'ÉCHÉANCE d'une pièce, ou un CALENDRIER que le contrat date ;
 * jamais parce que l'apporteur n'a rien fait.
 */
import { z } from 'zod';
import { SEUILS } from '../../domain/seuils/ssot';
import { CONNEXION_CONSOLE } from '../../content/micro-copy/console/connexion';
import { UTILISATEURS_CONSOLE } from '../../content/micro-copy/console/utilisateurs';
import {
  TEXTES_DES_NOTIFICATIONS,
  type TexteDeNotification,
} from '../../content/micro-copy/courriels/notifications';

const SOURCE_DES_TEXTES = 'src/content/micro-copy/courriels/notifications.ts';
/** SEC-29 : les textes et les routes d'une notification de la CONSOLE vivent avec la console. */
const SOURCE_DES_TEXTES_CONSOLE = 'src/content/micro-copy/console/connexion.ts';

export type Declencheur = 'evenement' | 'echeance_piece' | 'calendrier_fixe';
export type Canal = 'email' | 'espace';

export type LigneDeNotification = {
  /**
   * SEC-29 (forme d'A02) : à qui part la notification. Une ligne `utilisateur_console` n'a que le
   * canal e-mail, n'est jamais désactivable (aucune préférence d'apporteur ne la porte), et sa route
   * est déclarée dans `docs/CONSOLE-ROUTES.md`.
   */
  readonly destinataire: 'apporteur' | 'utilisateur_console';
  /** L'exigence qui fonde la notification ; la tâche émettrice la cite. */
  readonly req: `REQ-${string}`;
  /** La tâche du registre qui émet la notification ; elle prouve l'émission à sa livraison. */
  readonly emetteur: string;
  /** L'article du contrat ou l'exigence qui fonde l'envoi, en clair. */
  readonly fondement: string;
  readonly declencheur: Declencheur;
  readonly notificationObligatoire: boolean;
  readonly faitCourirUnDelai: boolean;
  readonly canaux: readonly Canal[];
  /** L'apporteur peut-il désactiver cette notification dans son profil ? */
  readonly desactivable: boolean;
  /** UN seul appel à l'action, son libellé tiré de la micro-copie (lu par `ux:exhaustivite`). */
  readonly actions: readonly { readonly libelle: string; readonly source: string }[];
  /** La route de l'espace où mène l'appel, telle que `docs/ESPACE-ROUTES.md` la déclare. */
  readonly route: string | null;
  /** Quand la route n'est pas encore déclarée : la tâche qui la posera. */
  readonly routeEnAttente: string | null;
};

const action = (cle: keyof typeof TEXTES_DES_NOTIFICATIONS) => [
  {
    libelle: (TEXTES_DES_NOTIFICATIONS[cle] as TexteDeNotification).appel,
    source: SOURCE_DES_TEXTES,
  },
];

/** Le lien de connexion de l'espace apporteur (SEC-03, puis SEC-42 en production). */
const LIEN_DE_L_ESPACE = {
  destinataire: 'apporteur',
  req: 'REQ-SEC-001',
  emetteur: 'SEC-42',
  fondement: 'REQ-SEC-001 — connexion par lien, transactionnel',
  declencheur: 'evenement',
  notificationObligatoire: true,
  faitCourirUnDelai: false,
  canaux: ['email'],
  desactivable: false,
  actions: action('lien_magique'),
  route: '/connexion/<jeton>',
  routeEnAttente: null,
} as const satisfies LigneDeNotification;

export const GABARITS = {
  lien_magique: LIEN_DE_L_ESPACE,
  /**
   * SEC-29 : le lien de connexion de la CONSOLE. Lu par ses utilisateurs seuls ; ses textes vivent
   * avec ceux de la connexion de la console, jamais parmi ceux de l'apporteur.
   */
  lien_magique_console: {
    destinataire: 'utilisateur_console',
    req: 'REQ-UX-048',
    emetteur: 'SEC-29',
    fondement:
      'REQ-UX-048 et REQ-SEC-003 — connexion de la console par lien et code, transactionnel',
    // La forme est CALQUÉE sur le lien de l'espace (forme d'A02) : le même déclencheur, la même
    // obligation, l'e-mail seul, jamais désactivable.
    declencheur: LIEN_DE_L_ESPACE.declencheur,
    notificationObligatoire: LIEN_DE_L_ESPACE.notificationObligatoire,
    faitCourirUnDelai: LIEN_DE_L_ESPACE.faitCourirUnDelai,
    canaux: LIEN_DE_L_ESPACE.canaux,
    desactivable: LIEN_DE_L_ESPACE.desactivable,
    actions: [
      {
        libelle: CONNEXION_CONSOLE.courriel.appel,
        source: 'src/content/micro-copy/console/connexion.ts',
      },
    ],
    route: '/console/connexion',
    routeEnAttente: null,
  },
  /**
   * SEC-30 : la création d'un administrateur, notifiée à TOUS les administrateurs actifs, auteur
   * compris (HYP-W19-QUATRE-YEUX). Une émission par administrateur. Textes de la juriste (96).
   */
  admin_cree: {
    destinataire: 'utilisateur_console',
    req: 'REQ-SEC-023',
    emetteur: 'SEC-30',
    fondement:
      'REQ-SEC-023 et HYP-W19-QUATRE-YEUX — toute création d’un administrateur est notifiée à tous les administrateurs',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email'],
    desactivable: false,
    actions: [
      {
        libelle: UTILISATEURS_CONSOLE.courriels.adminCree.appel,
        source: 'src/content/micro-copy/console/utilisateurs.ts',
      },
    ],
    route: '/console/utilisateurs',
    routeEnAttente: null,
  },
  /**
   * SEC-30 : la réactivation d'un administrateur, qui repart en attente, notifiée à TOUS les
   * administrateurs actifs, auteur compris. Une émission par administrateur. Texte de la juriste (98).
   */
  admin_reactive: {
    destinataire: 'utilisateur_console',
    req: 'REQ-SEC-023',
    emetteur: 'SEC-30',
    fondement:
      'REQ-SEC-023 et HYP-W19-QUATRE-YEUX — toute réactivation d’un administrateur est notifiée à tous les administrateurs',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email'],
    desactivable: false,
    actions: [
      {
        libelle: UTILISATEURS_CONSOLE.courriels.adminReactive.appel,
        source: 'src/content/micro-copy/console/utilisateurs.ts',
      },
    ],
    route: '/console/utilisateurs',
    routeEnAttente: null,
  },
  /**
   * SEC-30 : l'invitation à la console, SANS lien de connexion : l'adresse de `/console/connexion`.
   * L'échéance FERME l'invitation, elle n'ouvre aucun délai. Textes de la juriste (96).
   */
  invitation_console: {
    destinataire: 'utilisateur_console',
    req: 'REQ-UX-048',
    emetteur: 'SEC-30',
    fondement:
      'REQ-UX-048 et REQ-DM-024 — invitation à la console, transactionnelle, sans lien de connexion',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email'],
    desactivable: false,
    actions: [
      {
        libelle: UTILISATEURS_CONSOLE.courriels.invitation.appel,
        source: 'src/content/micro-copy/console/utilisateurs.ts',
      },
    ],
    route: '/console/connexion',
    routeEnAttente: null,
  },
  depot_injoignable_j5: {
    destinataire: 'apporteur',
    req: 'REQ-UX-038',
    emetteur: 'DM-13',
    fondement: 'REQ-UX-038 et W20 — une seule fois, sans confirmation à J+5 ouvrés',
    declencheur: 'evenement',
    notificationObligatoire: false,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: true,
    actions: action('depot_injoignable_j5'),
    route: '/mes-entreprises',
    routeEnAttente: null,
  },
  attribution_annulee_anteriorite: {
    destinataire: 'apporteur',
    req: 'REQ-JUR-007',
    emetteur: 'DM-25',
    fondement:
      'art. 3.3 — l’antériorité de la Société établie après coup : le dépôt est annulé, les commissions acquises restent acquises',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('attribution_annulee_anteriorite'),
    route: '/mes-entreprises',
    routeEnAttente: null,
  },
  attribution_liberee: {
    destinataire: 'apporteur',
    req: 'REQ-DM-007',
    emetteur: 'DM-13',
    fondement:
      'recommandé A07, art. 1104 C. civ. — fait courir la carence de redépôt (art. 3.2 al. 6)',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('attribution_liberee'),
    route: '/mes-entreprises',
    routeEnAttente: null,
  },
  decision_attribution: {
    destinataire: 'apporteur',
    req: 'REQ-DM-006',
    emetteur: 'DM-55',
    fondement:
      'art. 3.3 — une décision qui ouvre une contestation (le délai court contre la Société)',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('decision_attribution'),
    route: null,
    routeEnAttente: 'DM-25',
  },
  premier_rang_libere: {
    destinataire: 'apporteur',
    req: 'REQ-DM-004',
    emetteur: 'DM-55',
    fondement: `art. 3.5 al. 2 — ${SEUILS.FILE_FENETRE_REDECLARATION_JOURS.valeur} jours pour déclarer à nouveau, à compter de l’information`,
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: true,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('premier_rang_libere'),
    route: '/deposer',
    routeEnAttente: null,
  },
  refus_declaration: {
    destinataire: 'apporteur',
    req: 'REQ-SEC-022',
    emetteur: 'SEC-12',
    fondement: 'art. 3.3 et 3.3 bis — notifié avec sa catégorie (le délai court contre la Société)',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('refus_declaration'),
    route: null,
    routeEnAttente: 'DM-25',
  },
  suspension_declarations: {
    destinataire: 'apporteur',
    req: 'REQ-SEC-018',
    emetteur: 'SEC-15',
    fondement: `art. 3.7 al. 3 — notifiée avec les faits qui la motivent, ${SEUILS.SUSPENSION_MAX_JOURS.valeur} jours au plus`,
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: true,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('suspension_declarations'),
    route: '/aide',
    routeEnAttente: null,
  },
  rappel_rc_pro: {
    destinataire: 'apporteur',
    req: 'REQ-DM-027',
    emetteur: 'DM-51',
    fondement: 'art. 6.4 — échéance de l’attestation d’assurance, un service',
    declencheur: 'echeance_piece',
    notificationObligatoire: false,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: true,
    actions: action('rappel_rc_pro'),
    route: '/conformite',
    routeEnAttente: null,
  },
  rattachement_decide: {
    destinataire: 'apporteur',
    req: 'REQ-DM-034',
    emetteur: 'DM-12',
    fondement: 'art. 3.6 — notifié avec son motif',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('rattachement_decide'),
    route: '/mes-entreprises',
    routeEnAttente: null,
  },
  /**
   * SEC-62 (texte du rattrapage 102) : l'avis de sécurité du COMPTE, à la consommation d'un lien ou
   * d'un code sur un appareil que le compte ne connaît pas encore. Un avis de sécurité ne se désactive
   * pas, et part par courriel seul, à l'adresse vérifiée, comme le lien qu'il signale.
   */
  nouvel_appareil: {
    destinataire: 'apporteur',
    req: 'REQ-SEC-003',
    emetteur: 'SEC-62',
    fondement: 'REQ-SEC-003 — avis de sécurité du compte, à la connexion depuis un nouvel appareil',
    declencheur: LIEN_DE_L_ESPACE.declencheur,
    notificationObligatoire: LIEN_DE_L_ESPACE.notificationObligatoire,
    faitCourirUnDelai: LIEN_DE_L_ESPACE.faitCourirUnDelai,
    canaux: LIEN_DE_L_ESPACE.canaux,
    desactivable: LIEN_DE_L_ESPACE.desactivable,
    actions: action('nouvel_appareil'),
    route: '/connexion',
    routeEnAttente: null,
  },
  // SEC-19 (fiches de la juriste, #703, 5980966503 ; arrêt d'A02, 5980982895 §1) : la mise en demeure
  // fait courir son délai de l'envoi du courriel ; son texte vit dans `decisions_de_contrat`.
  mise_en_demeure: {
    destinataire: 'apporteur',
    req: 'REQ-JUR-006',
    emetteur: 'SEC-19',
    fondement: `art. 11.2 — ${SEUILS.MISE_EN_DEMEURE_JOURS.valeur} jours pour remédier au manquement, à compter de l’envoi`,
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: true,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('mise_en_demeure'),
    route: '/mes-entreprises',
    routeEnAttente: null,
  },
  // SEC-19 : la fin du contrat, dans l'espace en lecture seule ; elle fait courir le préavis d'une
  // résiliation par la Société (art. 11.1 et 20).
  resiliation: {
    destinataire: 'apporteur',
    req: 'REQ-DM-011',
    emetteur: 'SEC-19',
    fondement: 'art. 11 et 12.5 — la fin du contrat et ses effets (art. 12), notifiés par écrit',
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: true,
    canaux: ['email', 'espace'],
    desactivable: false,
    actions: action('resiliation'),
    route: '/mes-commissions',
    routeEnAttente: null,
  },
  // SEC-71 (contrat v2, art. 3.8) : l'avis du renouvellement de l'accès, APRÈS le courriel du lien et
  // jamais sans lui (juriste, #474, 6034554456). Par courriel seul : l'accès vient d'être coupé. Son
  // appel mène à la page de connexion (juriste, 6034821195) ; le lien part dans son propre courriel.
  acces_renouvele: {
    destinataire: 'apporteur',
    req: 'REQ-JUR-069',
    emetteur: 'SEC-71',
    fondement:
      "art. 3.8 — la Société révoque et renouvelle un moyen d'accès, sans effet sur les attributions ni les commissions",
    declencheur: 'evenement',
    notificationObligatoire: true,
    faitCourirUnDelai: false,
    canaux: ['email'],
    desactivable: false,
    actions: action('acces_renouvele'),
    route: '/connexion',
    routeEnAttente: null,
  },
} as const satisfies Readonly<Record<string, LigneDeNotification>>;

export type Gabarit = keyof typeof GABARITS;

/**
 * SEC-29 (forme d'A02) : les clés des notifications de l'APPORTEUR. Une ligne `utilisateur_console`
 * n'en est pas : elle n'a ni texte d'apporteur ni préférence. `envoyer.ts` (les notifications de
 * l'apporteur) refuse donc la clé de la console comme une clé inconnue.
 */
export type GabaritDeLApporteur = {
  [C in Gabarit]: (typeof GABARITS)[C]['destinataire'] extends 'apporteur' ? C : never;
}[Gabarit];

export function estGabaritDeLApporteur(cle: Gabarit): cle is GabaritDeLApporteur {
  return GABARITS[cle].destinataire === 'apporteur';
}

const CLES = Object.keys(GABARITS) as [Gabarit, ...Gabarit[]];

/** La validation à l'écriture : une clé hors de la table ne devient jamais une ligne. */
export const schemaGabarit = z.enum(CLES);

/**
 * L'écriture d'une préférence (relecture A02) : la base ne peut pas le tenir, puisque les clés vivent
 * dans le code ; c'est donc ici qu'une notification OBLIGATOIRE refuse d'être désactivée, nommée.
 */
export const schemaPreferenceNotification = z
  .object({ cle: schemaGabarit, active: z.boolean() })
  .superRefine((p, ctx) => {
    const ligne: LigneDeNotification = GABARITS[p.cle];
    if (!p.active && !ligne.desactivable)
      ctx.addIssue({
        code: 'custom',
        path: ['active'],
        message: `notification obligatoire « ${p.cle} » : elle ne se désactive pas (${ligne.fondement})`,
      });
  });

type TacheDuRegistre = { id: string; phase: number; reqs?: string[]; acceptance?: string };

/** Le motif d'inactivité qu'aucun fondement ne peut porter (charte relationnelle, M04). */
const INACTIVITE = /inactiv|sans (?:dépôt|activité|connexion)|aucun dépôt|faute d'activité/i;

/**
 * Les fautes de la table, nommées. PURE : le registre, les routes déclarées et les textes sont
 * fournis, pour que le témoin juge la table réelle ET une table cassée d'un geste.
 */
export function fautesDeLaTable(
  table: Readonly<Record<string, LigneDeNotification>>,
  ctx: {
    registre: readonly TacheDuRegistre[];
    routes: readonly string[];
    textes: Readonly<Record<string, TexteDeNotification>>;
    /**
     * SEC-29 : les routes (`docs/CONSOLE-ROUTES.md`) et les appels des notifications de la console.
     * Absent, une ligne destinée à la console est une faute : elle n'est jamais jugée sur l'espace.
     */
    console?: {
      routes: readonly string[];
      textes: Readonly<Record<string, { readonly appel: string }>>;
    };
  }
): string[] {
  const f: string[] = [];
  for (const [cle, l] of Object.entries(table)) {
    const deLaConsole = l.destinataire === 'utilisateur_console';
    if (deLaConsole && ctx.console === undefined)
      f.push(`contexte_console_absent : ${cle} est destinée à la console, jugée sans ses routes`);
    const routes = deLaConsole ? (ctx.console?.routes ?? []) : ctx.routes;
    const textes = deLaConsole ? (ctx.console?.textes ?? {}) : ctx.textes;
    const sourceDesTextes = deLaConsole ? SOURCE_DES_TEXTES_CONSOLE : SOURCE_DES_TEXTES;
    const sourceDesRoutes = deLaConsole ? 'docs/CONSOLE-ROUTES.md' : 'docs/ESPACE-ROUTES.md';
    const tache = ctx.registre.find((t) => t.id === l.emetteur);
    if (tache === undefined)
      f.push(`emetteur_inconnu : ${cle} nomme ${l.emetteur}, absent du registre`);
    else if (tache.phase > 1)
      f.push(`emetteur_hors_phase : ${cle} nomme ${l.emetteur}, de phase ${tache.phase}`);
    else if (!(tache.reqs ?? []).includes(l.req) && !(tache.acceptance ?? '').includes(l.req))
      f.push(`emetteur_sans_exigence : ${l.emetteur} ne cite pas ${l.req} (${cle})`);
    if (l.faitCourirUnDelai && !l.notificationObligatoire)
      f.push(`delai_sans_obligation : ${cle} fait courir un délai sans être obligatoire`);
    if (l.notificationObligatoire && !l.canaux.includes('email'))
      f.push(`obligatoire_sans_courriel : ${cle} est obligatoire et ne part pas par e-mail`);
    if (l.notificationObligatoire && l.desactivable)
      f.push(`obligatoire_desactivable : ${cle} est obligatoire et désactivable`);
    if (l.declencheur === 'calendrier_fixe' && !/art\.\s*\d/.test(l.fondement))
      f.push(
        `calendrier_sans_article : ${cle} part à date fixe sans article du contrat qui la fixe`
      );
    if (INACTIVITE.test(l.fondement))
      f.push(`declenche_par_l_inactivite : ${cle} — « ${l.fondement} »`);
    const texte = textes[cle];
    if (texte === undefined)
      f.push(`texte_absent : ${cle} n'a pas de texte dans ${sourceDesTextes}`);
    if (l.actions.length !== 1 || l.actions[0]?.libelle !== texte?.appel)
      f.push(`action_non_unique : ${cle} doit porter UN appel, celui de la micro-copie`);
    if (l.route !== null && !routes.includes(l.route))
      f.push(`route_non_declaree : ${cle} mène à ${l.route}, absente de ${sourceDesRoutes}`);
    if (l.route === null && l.routeEnAttente === null)
      f.push(`route_absente_sans_tache : ${cle} n'a ni route ni tâche qui la posera`);
  }
  return f;
}
