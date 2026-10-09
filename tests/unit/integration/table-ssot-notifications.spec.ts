// @req REQ-UX-016
// @req REQ-JUR-039
// @req REQ-JUR-033
// @req REQ-SEC-003
/**
 * UX-P1-10 — la table SSOT des notifications (REQ-UX-016, REQ-JUR-039, REQ-JUR-033). Liste arrêtée par
 * A02 le 2026-10-02, textes d'A07.
 *
 * CE QUE CE FICHIER GARDE, clé par clé :
 *   1. la table porte EXACTEMENT les neuf clés arrêtées ; chacune NOMME sa tâche émettrice, qui existe
 *      au registre, est de phase ≤ 1 et cite l'exigence source (l'émission réelle est prouvée par la
 *      tâche émettrice à sa livraison) ;
 *   2. `faitCourirUnDelai` ⇒ `notificationObligatoire` ⇒ canal e-mail présent et NON désactivable ;
 *   3. le déclencheur n'est jamais l'inactivité de l'apporteur (M04) ; `calendrier_fixe` exige un
 *      article du contrat qui date le document ;
 *   4. UN appel à l'action par clé, tiré de la micro-copie, vers une route DÉCLARÉE de l'espace (ou
 *      `null`, nommant la tâche qui posera la route) ;
 *   5. une préférence qui désactiverait une clé obligatoire est refusée À L'ÉCRITURE, nommée.
 * Chaque règle est jugée sur la table réelle ET sur une table cassée d'un geste (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  GABARITS,
  schemaGabarit,
  schemaPreferenceNotification,
  fautesDeLaTable,
  type Gabarit,
  type LigneDeNotification,
} from '../../../src/server/notifications/table-ssot';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { TEXTES_DES_NOTIFICATIONS } from '../../../src/content/micro-copy/courriels/notifications';
import { CONNEXION_CONSOLE } from '../../../src/content/micro-copy/console/connexion';
import { UTILISATEURS_CONSOLE } from '../../../src/content/micro-copy/console/utilisateurs';
import {
  ecrirePreference,
  notifier,
  parametresDe,
  rendreLaNotification,
  type AccesDeLaNotification,
  type NotificationRefusee,
} from '../../../src/server/notifications/envoyer';

type Tache = { id: string; phase: number; reqs?: string[]; acceptance?: string };
const REGISTRE = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] })
  .taches;
const ROUTES = [...readFileSync('docs/ESPACE-ROUTES.md', 'utf8').matchAll(/\|\s*`(\/[^`]*)`/g)].map(
  (m) => m[1]!
);

// SEC-29 : la notification de la console se juge sur les routes et la micro-copie de la console.
const ROUTES_CONSOLE = [
  ...readFileSync('docs/CONSOLE-ROUTES.md', 'utf8').matchAll(/\|\s*`(\/[^`]*)`/g),
].map((m) => m[1]!);
const CONTEXTE = {
  registre: REGISTRE,
  routes: ROUTES,
  textes: TEXTES_DES_NOTIFICATIONS,
  console: {
    routes: ROUTES_CONSOLE,
    textes: {
      lien_magique_console: CONNEXION_CONSOLE.courriel,
      // SEC-30 : l'invitation et la création d'un administrateur, textes de la juriste.
      invitation_console: UTILISATEURS_CONSOLE.courriels.invitation,
      admin_cree: UTILISATEURS_CONSOLE.courriels.adminCree,
      // SEC-30 : la réactivation d'un administrateur, texte de la juriste (rattrapage 98).
      admin_reactive: UTILISATEURS_CONSOLE.courriels.adminReactive,
    },
  },
};
const table = (): Record<string, LigneDeNotification> =>
  structuredClone(GABARITS) as Record<string, LigneDeNotification>;

describe('REQ-UX-016 — la table des notifications, ses clés et leurs règles', () => {
  it('REQ-UX-016 : la table porte EXACTEMENT les clés arrêtées — celles de l’apporteur, dont la micro-copie porte les mêmes, et celles de la console', () => {
    const attendues = [
      // DM-25 : l'annulation pour antériorité de la Société (art. 3.3), clé NEUVE (coordination).
      'attribution_annulee_anteriorite',
      'attribution_liberee',
      'decision_attribution',
      'depot_injoignable_j5',
      'lien_magique',
      // SEC-19 (A02, #703) : la mise en demeure et la fin du contrat.
      'mise_en_demeure',
      // SEC-62 (texte du rattrapage 102) : l'avis de sécurité du compte, texte de la juriste.
      'nouvel_appareil',
      'premier_rang_libere',
      'rappel_rc_pro',
      'rattachement_decide',
      'refus_declaration',
      'resiliation',
      'suspension_declarations',
    ];
    // SEC-29 et SEC-30 : les clés destinées à la console ; leurs textes vivent avec la console.
    expect(Object.keys(GABARITS).sort()).toEqual(
      [
        ...attendues,
        'lien_magique_console',
        'invitation_console',
        'admin_cree',
        'admin_reactive',
      ].sort()
    );
    expect(Object.keys(TEXTES_DES_NOTIFICATIONS).sort()).toEqual(attendues);
    for (const cle of [
      'lien_magique_console',
      'invitation_console',
      'admin_cree',
      'admin_reactive',
    ] as const)
      expect(GABARITS[cle].destinataire).toBe('utilisateur_console');
    for (const c of attendues) expect(schemaGabarit.safeParse(c).success).toBe(true);
    expect(schemaGabarit.safeParse('relance_dormance').success).toBe(false);
  });

  it('REQ-UX-016 REQ-JUR-039 : la table réelle ne porte aucune faute', () => {
    expect(fautesDeLaTable(GABARITS, CONTEXTE)).toEqual([]);
  });

  it('REQ-UX-016 : TÉMOIN — la ligne de la console n’est jamais jugée sur l’espace : sans le contexte de la console, elle est une faute nommée', () => {
    const sansConsole = {
      registre: CONTEXTE.registre,
      routes: CONTEXTE.routes,
      textes: CONTEXTE.textes,
    };
    const fautes = fautesDeLaTable(GABARITS, sansConsole).map((f) => f.split(' :')[0]);
    expect(fautes).toContain('contexte_console_absent');
    expect(fautes).toContain('route_non_declaree');
  });

  it('REQ-UX-016 : les deux notions se lisent comme A02 les a arrêtées (obligatoire / délai)', () => {
    const lu = Object.fromEntries(
      Object.entries(GABARITS).map(([c, l]) => [
        c,
        `${l.notificationObligatoire ? 'T' : 'F'}/${l.faitCourirUnDelai ? 'T' : 'F'}`,
      ])
    );
    expect(lu).toEqual({
      lien_magique: 'T/F',
      lien_magique_console: 'T/F',
      invitation_console: 'T/F',
      admin_cree: 'T/F',
      admin_reactive: 'T/F',
      depot_injoignable_j5: 'F/F',
      attribution_liberee: 'T/F',
      attribution_annulee_anteriorite: 'T/F',
      decision_attribution: 'T/F',
      premier_rang_libere: 'T/T',
      refus_declaration: 'T/F',
      suspension_declarations: 'T/T',
      rappel_rc_pro: 'F/F',
      rattachement_decide: 'T/F',
      nouvel_appareil: 'T/F',
      mise_en_demeure: 'T/T',
      resiliation: 'T/T',
    });
  });

  it('REQ-UX-016 REQ-JUR-033 : TÉMOINS — chaque règle cassée d’un geste rougit, nommée, dont la clé déclenchée par l’inactivité', () => {
    const casse = (cle: Gabarit, champs: Partial<LigneDeNotification>) => {
      const t = table();
      t[cle] = { ...t[cle]!, ...champs };
      return fautesDeLaTable(t, CONTEXTE).map((f) => f.split(' :')[0]);
    };
    expect(casse('depot_injoignable_j5', { faitCourirUnDelai: true })).toContain(
      'delai_sans_obligation'
    );
    expect(casse('refus_declaration', { canaux: ['espace'] })).toContain(
      'obligatoire_sans_courriel'
    );
    expect(casse('refus_declaration', { desactivable: true })).toContain(
      'obligatoire_desactivable'
    );
    expect(casse('rappel_rc_pro', { emetteur: 'XX-T99' })).toContain('emetteur_inconnu');
    expect(casse('rappel_rc_pro', { emetteur: 'JUR-T25' })).toContain('emetteur_hors_phase');
    expect(casse('rappel_rc_pro', { req: 'REQ-UX-001' })).toContain('emetteur_sans_exigence');
    expect(
      casse('rappel_rc_pro', { declencheur: 'calendrier_fixe', fondement: 'service' })
    ).toContain('calendrier_sans_article');
    expect(casse('rappel_rc_pro', { fondement: 'aucun dépôt depuis 60 jours' })).toContain(
      'declenche_par_l_inactivite'
    );
    expect(casse('rappel_rc_pro', { route: '/route-inventee' })).toContain('route_non_declaree');
    expect(casse('rappel_rc_pro', { route: null, routeEnAttente: null })).toContain(
      'route_absente_sans_tache'
    );
    // SEC-70 : un appel qui mène au contact de l'entité (la demande écrite) n'a pas de route, et c'est juste.
    expect(
      casse('rappel_rc_pro', { route: null, routeEnAttente: null, lien: 'contact_entite' })
    ).not.toContain('route_absente_sans_tache');
  });
});

describe('REQ-UX-016 — une préférence ne désactive jamais une notification obligatoire', () => {
  const ecrire = (cle: string, active: boolean) =>
    schemaPreferenceNotification.safeParse({ cle, active });

  it('REQ-UX-016 : une clé facultative se désactive ; une clé obligatoire se garde active', () => {
    expect(ecrire('rappel_rc_pro', false).success).toBe(true);
    expect(ecrire('refus_declaration', true).success).toBe(true);
  });

  it('REQ-UX-016 : TÉMOIN — désactiver une clé obligatoire, ou une clé hors table, est refusé et nommé', () => {
    const r = ecrire('suspension_declarations', false);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('obligatoire');
    expect(ecrire('relance_dormance', true).success).toBe(false);
  });
});

// ── l'envoi (`src/server/notifications/envoyer.ts`) ─────────────────────────────────────────────

type LignePref = { id: string; cle: string; active: boolean; modifieeAt: Date };

/** Une couche cloisonnée en mémoire, pour UN apporteur : ce qu'elle reçoit est ce que le test juge. */
function coucheEnMemoire() {
  const notifications: { id: string; cle: string; attributionId?: string | null }[] = [];
  const preferences: LignePref[] = [];
  const appels: string[] = [];
  let n = 0;
  const acces = {
    apporteurId: '00000000-0000-4000-8000-000000000001',
    notificationEspace: {
      async creer(data: { cle: string; attributionId?: string | null }) {
        appels.push('notification.creer');
        const ligne = { id: `n${++n}`, ...data };
        notifications.push(ligne);
        return ligne;
      },
    },
    preferenceNotification: {
      async lister(o?: { where?: { cle?: string }; take?: number }) {
        appels.push('preference.lister');
        return preferences.filter((p) => p.cle === o?.where?.cle).slice(0, o?.take);
      },
      async creer(data: Omit<LignePref, 'id'>) {
        appels.push('preference.creer');
        const ligne = { id: `p${++n}`, ...data };
        preferences.push(ligne);
        return ligne;
      },
      async modifier(id: string, data: Partial<LignePref>) {
        appels.push('preference.modifier');
        const l = preferences.find((p) => p.id === id);
        if (!l) return 'introuvable' as const;
        Object.assign(l, data);
        return 'modifiee' as const;
      },
    },
  };
  // Le faux ne rend que les colonnes que l'envoi lit : la forme, pas le type, est jugée ici.
  return {
    acces: acces as unknown as AccesDeLaNotification,
    notifications,
    preferences,
    appels,
  };
}

const ESPACE = new URL('https://partners.exemple.invalid');
const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');

describe('REQ-UX-016 — le rendu d’une notification : les paramètres de sa clé, ni plus ni moins', () => {
  it('REQ-UX-016 : chaque paramètre des textes est rempli, et la phrase du contrat est reprise telle quelle', () => {
    const r = rendreLaNotification('premier_rang_libere', {
      entreprise: 'Entreprise témoin',
      dateLimite: '12 octobre 2026',
    });
    expect(r.titre).toBe(
      "Entreprise témoin : vous pouvez la déposer à nouveau jusqu'au 12 octobre 2026"
    );
    expect(r.corps).toContain("Sans nouveau dépôt d'ici le 12 octobre 2026");
    expect(r.appel).toBe('Déposer à nouveau cette entreprise');
    expect(parametresDe('lien_magique')).toEqual([]);
    expect(parametresDe('refus_declaration')).toEqual(['categorie', 'entreprise', 'motif']);
  });

  it('REQ-UX-016 : le délai de réponse vient de la SSOT, posé par l’envoi ; un émetteur qui le fournit est refusé', () => {
    expect(parametresDe('decision_attribution')).toEqual(['entreprise', 'motif']);
    const r = rendreLaNotification('decision_attribution', { entreprise: 'E', motif: 'Doublon' });
    expect(r.corps).toContain(
      `dans les ${SEUILS.REPONSE_CONTESTATION_JOURS.valeur} ${SEUILS.REPONSE_CONTESTATION_JOURS.unite}.`
    );
    expect(() =>
      rendreLaNotification('decision_attribution', {
        entreprise: 'E',
        motif: 'Doublon',
        delaiReponse: 'deux jours',
      })
    ).toThrow(/parametre_en_trop/);
  });

  it('REQ-UX-016 : TÉMOINS — une clé hors table, un paramètre manquant, en trop, vide ou porteur d’un saut de ligne : refusés, nommés', () => {
    const motif = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as NotificationRefusee).motif;
      }
      return 'aucun_refus';
    };
    expect(motif(() => rendreLaNotification('relance_dormance', {}))).toBe('cle_inconnue');
    expect(
      motif(() => rendreLaNotification('attribution_liberee', {}, 'peremption_ou_fin_de_duree'))
    ).toBe('parametre_manquant');
    expect(
      motif(() =>
        rendreLaNotification(
          'attribution_liberee',
          { entreprise: 'X', contact: 'Y' },
          'peremption_ou_fin_de_duree'
        )
      )
    ).toBe('parametre_en_trop');
    expect(
      motif(() =>
        rendreLaNotification(
          'attribution_liberee',
          { entreprise: 'X\nBcc: y' },
          'peremption_ou_fin_de_duree'
        )
      )
    ).toBe('parametre_invalide');
    expect(
      motif(() =>
        rendreLaNotification(
          'attribution_liberee',
          { entreprise: '' },
          'peremption_ou_fin_de_duree'
        )
      )
    ).toBe('parametre_invalide');
    // Un caractère de FORMAT (\p{Cf}) retourne ou masque le sujet d'un courriel : U+202E inverse le
    // sens de lecture, U+200B à U+200F et U+2066 à U+2069 cachent ou isolent un texte.
    for (const format of [0x202e, 0x200b, 0x200f, 0x2066, 0x2069].map((c) =>
      String.fromCharCode(c)
    ))
      expect(
        motif(() =>
          rendreLaNotification(
            'attribution_liberee',
            { entreprise: `Entreprise${format}fdp.exe` },
            'peremption_ou_fin_de_duree'
          )
        )
      ).toBe('parametre_invalide');
  });
});

describe('REQ-UX-016 REQ-JUR-039 — l’envoi : l’espace, puis le courriel, selon la table', () => {
  it('REQ-UX-016 : une clé obligatoire écrit dans l’espace ET demande le courriel, préférence ou pas', async () => {
    const c = coucheEnMemoire();
    c.preferences.push({
      id: 'p0',
      cle: 'refus_declaration',
      active: false,
      modifieeAt: MAINTENANT,
    });
    const demandes: {
      gabarit: string;
      sujet: string;
      corps: string;
      apporteurId: string | null;
    }[] = [];
    const issue = await notifier(
      {
        cle: 'refus_declaration',
        a: 'apporteur@exemple.invalid',
        parametres: { entreprise: 'E', categorie: 'Doublon', motif: 'déjà déposée' },
        attributionId: null,
      },
      {
        acces: c.acces,
        urlDeLEspace: ESPACE,
        envoyerCourriel: async (d) => {
          demandes.push(d);
          return 'envoye';
        },
      }
    );
    expect(issue).toEqual({ notificationId: 'n1', courriel: 'envoye' });
    expect(c.notifications).toEqual([{ id: 'n1', cle: 'refus_declaration', attributionId: null }]);
    expect(demandes).toHaveLength(1);
    expect(demandes[0]).toMatchObject({
      gabarit: 'refus_declaration',
      sujet: 'E : dépôt non enregistré — Doublon',
      apporteurId: c.acces.apporteurId,
    });
    expect(demandes[0]!.corps).toContain("n'est pas un manquement");
    expect(demandes[0]!.corps).toContain('Contester ce refus par écrit');
  });

  it('REQ-UX-016 : TÉMOIN — une clé désactivable que l’apporteur a désactivée : l’espace oui, le courriel non, nommé', async () => {
    const c = coucheEnMemoire();
    c.preferences.push({ id: 'p0', cle: 'rappel_rc_pro', active: false, modifieeAt: MAINTENANT });
    let appels = 0;
    const issue = await notifier(
      {
        cle: 'rappel_rc_pro',
        a: 'apporteur@exemple.invalid',
        parametres: { dateEcheance: '1er novembre 2026' },
        attributionId: null,
      },
      {
        acces: c.acces,
        urlDeLEspace: ESPACE,
        envoyerCourriel: async () => {
          appels++;
          return 'envoye';
        },
      }
    );
    expect(issue).toEqual({ notificationId: 'n1', courriel: 'desactive_par_preference' });
    expect(appels).toBe(0);
  });

  it('REQ-UX-016 : l’appel à l’action mène à la route déclarée de la table, sur l’adresse de l’espace', async () => {
    const c = coucheEnMemoire();
    let corps = '';
    await notifier(
      {
        cle: 'rappel_rc_pro',
        a: 'apporteur@exemple.invalid',
        parametres: { dateEcheance: '1er novembre 2026' },
        attributionId: null,
      },
      {
        acces: c.acces,
        urlDeLEspace: ESPACE,
        envoyerCourriel: async (d) => {
          corps = d.corps;
          return 'envoye';
        },
      }
    );
    expect(corps).toContain(
      `Déposer la nouvelle attestation : ${new URL('/conformite', ESPACE).href}`
    );
  });
});

describe('REQ-UX-016 — la préférence s’écrit par la couche cloisonnée, en upsert sur (apporteur, clé)', () => {
  it('REQ-UX-016 : TÉMOIN — deux écritures sur la même clé laissent UNE ligne, la dernière valeur, le même id', async () => {
    const c = coucheEnMemoire();
    expect(
      await ecrirePreference(c.acces, { cle: 'rappel_rc_pro', active: false }, MAINTENANT)
    ).toBe('creee');
    const id = c.preferences[0]!.id;
    const plusTard = new Date(MAINTENANT.getTime() + 60_000);
    expect(await ecrirePreference(c.acces, { cle: 'rappel_rc_pro', active: true }, plusTard)).toBe(
      'modifiee'
    );
    expect(c.preferences).toEqual([
      { id, cle: 'rappel_rc_pro', active: true, modifieeAt: plusTard },
    ]);
  });

  it('REQ-UX-016 : TÉMOIN — désactiver une clé obligatoire est refusé AVANT la couche : aucun appel', async () => {
    const c = coucheEnMemoire();
    await expect(
      ecrirePreference(c.acces, { cle: 'suspension_declarations', active: false }, MAINTENANT)
    ).rejects.toThrow(/obligatoire/);
    expect(c.appels).toEqual([]);
  });
});

describe('REQ-UX-016 — la fin d’une réservation se dit selon sa cause (A07, 2026-10-02)', () => {
  it('REQ-UX-016 : TÉMOIN — une demande vérifiée libérée : la carence et sa date de redépôt, mot pour mot', () => {
    const r = rendreLaNotification(
      'attribution_liberee',
      { entreprise: 'Entreprise témoin', dateRedepot: '2 novembre 2026' },
      'demande_verifiee'
    );
    expect(r.titre).toBe('Entreprise témoin : réservation terminée');
    expect(r.corps).toBe(
      "Ce dépôt a pris fin sans confirmation de l'échange. Vous pourrez déposer à nouveau cette entreprise à partir du 2 novembre 2026. Cette fin n'emporte aucune autre conséquence pour vous."
    );
    expect(parametresDe('attribution_liberee', 'demande_verifiee')).toEqual([
      'dateRedepot',
      'entreprise',
    ]);
  });

  it('REQ-UX-016 : TÉMOIN — une péremption ou une fin de durée : l’entreprise de nouveau disponible, sans date', () => {
    const r = rendreLaNotification(
      'attribution_liberee',
      { entreprise: 'Entreprise témoin' },
      'peremption_ou_fin_de_duree'
    );
    expect(r.corps).toBe(
      'Cette entreprise est de nouveau disponible, y compris pour un nouveau dépôt de votre part.'
    );
    expect(parametresDe('attribution_liberee', 'peremption_ou_fin_de_duree')).toEqual([
      'entreprise',
    ]);
  });

  it('REQ-UX-016 : TÉMOINS — sans cause, ou une cause donnée à une autre clé : refusés, nommés', () => {
    const motif = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as NotificationRefusee).motif;
      }
      return 'aucun_refus';
    };
    expect(motif(() => rendreLaNotification('attribution_liberee', { entreprise: 'E' }))).toBe(
      'cause_manquante'
    );
    expect(
      motif(() =>
        rendreLaNotification(
          'rappel_rc_pro',
          { dateEcheance: '1er novembre 2026' },
          'demande_verifiee'
        )
      )
    ).toBe('cause_en_trop');
    expect(
      motif(() =>
        rendreLaNotification(
          'attribution_liberee',
          { entreprise: 'E', dateRedepot: '2 novembre 2026' },
          'peremption_ou_fin_de_duree'
        )
      )
    ).toBe('parametre_en_trop');
  });
});

describe('REQ-SEC-003 — l’avis « nouvel appareil » (SEC-62, texte de la juriste du rattrapage 102)', () => {
  it('REQ-SEC-003 : le sujet et le corps de la juriste, MOT POUR MOT, et UN appel vers la page de connexion, sans jeton ni paramètre', () => {
    expect(TEXTES_DES_NOTIFICATIONS.nouvel_appareil).toEqual({
      titre: 'Connexion à votre espace depuis un nouvel appareil',
      appel: 'Demander un nouveau lien de connexion',
      corps:
        "Votre lien de connexion a été utilisé le {dateHeure} sur un appareil que nous ne connaissions pas encore pour votre compte. Si c'est bien vous, vous n'avez rien à faire. Sinon, ne cliquez sur aucun lien reçu que vous n'avez pas demandé, demandez un nouveau lien de connexion depuis la page de connexion, et écrivez à Axion-IA.",
    });
    expect(GABARITS.nouvel_appareil.route).toBe('/connexion');
    expect(GABARITS.nouvel_appareil.actions).toEqual([
      {
        libelle: 'Demander un nouveau lien de connexion',
        source: 'src/content/micro-copy/courriels/notifications.ts',
      },
    ]);
    const r = rendreLaNotification('nouvel_appareil', { dateHeure: '4 octobre 2026 à 10 h 37' });
    expect(r.titre).toBe('Connexion à votre espace depuis un nouvel appareil');
    expect(r.corps).toContain(
      'Votre lien de connexion a été utilisé le 4 octobre 2026 à 10 h 37 sur un appareil'
    );
    expect(r.appel).toBe('Demander un nouveau lien de connexion');
  });

  it('REQ-SEC-003 : un avis de sécurité du COMPTE — émis par SEC-62 sur un événement, obligatoire, par courriel seul, jamais désactivable, sans délai', () => {
    expect(GABARITS.nouvel_appareil).toMatchObject({
      destinataire: 'apporteur',
      req: 'REQ-SEC-003',
      emetteur: 'SEC-62',
      declencheur: 'evenement',
      notificationObligatoire: true,
      faitCourirUnDelai: false,
      canaux: ['email'],
      desactivable: false,
      routeEnAttente: null,
    });
    expect(schemaGabarit.safeParse('nouvel_appareil').success).toBe(true);
    expect(
      schemaPreferenceNotification.safeParse({ cle: 'nouvel_appareil', active: true }).success
    ).toBe(true);
    expect(
      schemaPreferenceNotification.safeParse({ cle: 'nouvel_appareil', active: false }).success
    ).toBe(false);
  });

  it('REQ-SEC-003 : TÉMOIN — rien sur l’appareil : la date et l’heure sont le SEUL paramètre, ni lieu, ni navigateur, ni adresse réseau', () => {
    expect(parametresDe('nouvel_appareil')).toEqual(['dateHeure']);
    const texte = Object.values(TEXTES_DES_NOTIFICATIONS.nouvel_appareil).join(' ');
    expect(texte).not.toMatch(/navigateur|adresse IP|adresse réseau|\blieu\b|ville|pays/i);
    expect(() => rendreLaNotification('nouvel_appareil', {})).toThrow();
    expect(() =>
      rendreLaNotification('nouvel_appareil', { dateHeure: '4 octobre 2026', navigateur: 'x' })
    ).toThrow();
  });
});

// La passe de mutation (PR 667) a montré des fautes de la table jugées sans leur TEXTE, et des
// branches jamais prises : chaque faute est ici rendue mot pour mot, sur une table cassée d'un geste.
describe('REQ-UX-016 — chaque faute de la table, nommée mot pour mot', () => {
  const ligneDe = (cle: Gabarit, extra: Partial<LigneDeNotification>) => ({
    [cle]: { ...(GABARITS[cle] as LigneDeNotification), ...extra },
  });
  const fautes = (t: Record<string, LigneDeNotification>) => fautesDeLaTable(t, CONTEXTE);

  it('REQ-UX-016 : TÉMOIN — le texte absent et la route non déclarée nomment LEUR source, espace ou console', () => {
    const sansTextes = { ...CONTEXTE, textes: {}, console: { ...CONTEXTE.console, textes: {} } };
    expect(fautesDeLaTable(ligneDe('lien_magique', {}), sansTextes)).toContain(
      "texte_absent : lien_magique n'a pas de texte dans src/content/micro-copy/courriels/notifications.ts"
    );
    expect(fautesDeLaTable(ligneDe('admin_cree', {}), sansTextes)).toContain(
      "texte_absent : admin_cree n'a pas de texte dans src/content/micro-copy/console/connexion.ts"
    );
    expect(fautes(ligneDe('lien_magique', { route: '/nulle-part' }))).toContain(
      'route_non_declaree : lien_magique mène à /nulle-part, absente de docs/ESPACE-ROUTES.md'
    );
    expect(fautes(ligneDe('admin_cree', { route: '/console/nulle-part' }))).toContain(
      'route_non_declaree : admin_cree mène à /console/nulle-part, absente de docs/CONSOLE-ROUTES.md'
    );
  });

  it('REQ-UX-016 : TÉMOIN — l’action est UNE, et c’est l’appel de la micro-copie', () => {
    const a = GABARITS.lien_magique.actions[0]!;
    const faute = 'action_non_unique : lien_magique doit porter UN appel, celui de la micro-copie';
    expect(fautes(ligneDe('lien_magique', {}))).toEqual([]);
    expect(fautes(ligneDe('lien_magique', { actions: [] }))).toEqual([faute]);
    expect(fautes(ligneDe('lien_magique', { actions: [a, a] }))).toEqual([faute]);
    expect(fautes(ligneDe('lien_magique', { actions: [{ ...a, libelle: 'Autre' }] }))).toEqual([
      faute,
    ]);
    // L'action d'une clé de l'apporteur vient de SA micro-copie, source nommée.
    expect(GABARITS.lien_magique.actions).toEqual([
      {
        libelle: TEXTES_DES_NOTIFICATIONS.lien_magique.appel,
        source: 'src/content/micro-copy/courriels/notifications.ts',
      },
    ]);
  });

  it('REQ-JUR-039 : TÉMOIN — une date fixe exige « art. » suivi d’un numéro, espace ou non', () => {
    const fixe = (fondement: string) =>
      fautes(ligneDe('rappel_rc_pro', { declencheur: 'calendrier_fixe', fondement }));
    const faute =
      'calendrier_sans_article : rappel_rc_pro part à date fixe sans article du contrat qui la fixe';
    expect(fixe('contrat art. 6.4')).toEqual([]);
    expect(fixe('contrat art.6')).toEqual([]);
    expect(fixe('contrat art.  12')).toEqual([]);
    expect(fixe('contrat art. six')).toEqual([faute]);
    expect(fixe('contrat article 6')).toEqual([faute]);
  });

  it('REQ-UX-016 : TÉMOIN — l’émetteur cite l’exigence par ses REQ OU par son acceptance ; sinon, nommé', () => {
    const l = GABARITS.lien_magique as LigneDeNotification;
    const avec = (t: Tache) => fautesDeLaTable({ lien_magique: l }, { ...CONTEXTE, registre: [t] });
    const faute = `emetteur_sans_exigence : ${l.emetteur} ne cite pas ${l.req} (lien_magique)`;
    expect(avec({ id: l.emetteur, phase: 1, reqs: [l.req] })).toEqual([]);
    expect(avec({ id: l.emetteur, phase: 1, acceptance: `… ${l.req} …` })).toEqual([]);
    expect(avec({ id: l.emetteur, phase: 1 })).toEqual([faute]);
    expect(avec({ id: l.emetteur, phase: 1, reqs: ['REQ-AUTRE-001'], acceptance: 'rien' })).toEqual(
      [faute]
    );
  });

  it('REQ-UX-016 : TÉMOIN À DEUX FACES — désactiver une clé obligatoire est refusé sur `active`, nommé ; une clé désactivable se désactive', () => {
    const r = schemaPreferenceNotification.safeParse({ cle: 'lien_magique', active: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.code, i.path.join('.')])).toEqual([['custom', 'active']]);
    expect(r.error?.issues[0]?.message).toBe(
      `notification obligatoire « lien_magique » : elle ne se désactive pas (${GABARITS.lien_magique.fondement})`
    );
    const libre = Object.entries(GABARITS).find(([, l]) => l.desactivable)?.[0];
    expect(libre).toBeDefined();
    expect(schemaPreferenceNotification.safeParse({ cle: libre, active: false }).success).toBe(
      true
    );
    expect(
      schemaPreferenceNotification.safeParse({ cle: 'lien_magique', active: true }).success
    ).toBe(true);
    expect(schemaPreferenceNotification.safeParse({ cle: 'lien_magique' }).success).toBe(false);
  });
});

describe('REQ-JUR-007 — la notification de l’annulation pour antériorité (DM-25, juriste)', () => {
  it('REQ-JUR-007 : la fiche de la clé neuve — art. 3.3, événement, courriel et espace, obligatoire, non désactivable, vers Mes entreprises', () => {
    expect(GABARITS.attribution_annulee_anteriorite).toMatchObject({
      destinataire: 'apporteur',
      req: 'REQ-JUR-007',
      emetteur: 'DM-25',
      declencheur: 'evenement',
      notificationObligatoire: true,
      faitCourirUnDelai: false,
      canaux: ['email', 'espace'],
      desactivable: false,
      route: '/mes-entreprises',
      routeEnAttente: null,
    });
    expect(GABARITS.attribution_annulee_anteriorite.fondement).toMatch(/art. 3.3/);
  });

  it('REQ-JUR-007 : TÉMOIN — le texte de la juriste, MOT POUR MOT : le motif, les commissions acquises qui restent, le droit de contester', () => {
    expect(TEXTES_DES_NOTIFICATIONS.attribution_annulee_anteriorite).toEqual({
      titre: '{entreprise} : votre dépôt est annulé — antériorité de la Société',
      appel: 'Voir Mes entreprises',
      corps:
        "Axion-IA connaissait déjà cette entreprise à la date de votre dépôt (contrat, article 3.3) : votre dépôt est annulé, et aucune commission nouvelle n'est due à son titre. Les commissions déjà acquises restent acquises. Vous pouvez contester cette décision par écrit ; Axion-IA vous répond de façon motivée dans les {delaiReponse}.",
    });
  });

  it('REQ-JUR-007 : le délai de réponse vient de la SSOT, jamais écrit en clair ; l’entreprise est le seul paramètre de l’émettrice', () => {
    expect(parametresDe('attribution_annulee_anteriorite')).toEqual(['entreprise']);
    const r = rendreLaNotification('attribution_annulee_anteriorite', {
      entreprise: 'Atelier Dupont',
    });
    expect(r.corps).toContain(
      `${SEUILS.REPONSE_CONTESTATION_JOURS.valeur} ${SEUILS.REPONSE_CONTESTATION_JOURS.unite}`
    );
    expect(r.titre).toContain('Atelier Dupont');
  });
});
