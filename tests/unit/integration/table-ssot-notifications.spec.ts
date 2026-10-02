// @req REQ-UX-016
// @req REQ-JUR-039
// @req REQ-JUR-033
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
import { TEXTES_DES_NOTIFICATIONS } from '../../../src/content/micro-copy/courriels/notifications';
import {
  ecrirePreference,
  notifier,
  parametresDe,
  rendreLaNotification,
  type NotificationRefusee,
} from '../../../src/server/notifications/envoyer';

type Tache = { id: string; phase: number; reqs?: string[]; acceptance?: string };
const REGISTRE = (JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] })
  .taches;
const ROUTES = [...readFileSync('docs/ESPACE-ROUTES.md', 'utf8').matchAll(/\|\s*`(\/[^`]*)`/g)].map(
  (m) => m[1]!
);

const CONTEXTE = { registre: REGISTRE, routes: ROUTES, textes: TEXTES_DES_NOTIFICATIONS };
const table = (): Record<string, LigneDeNotification> =>
  structuredClone(GABARITS) as Record<string, LigneDeNotification>;

describe('REQ-UX-016 — la table des notifications, ses neuf clés et leurs règles', () => {
  it('REQ-UX-016 : la table porte EXACTEMENT les neuf clés arrêtées par A02, et la micro-copie les mêmes', () => {
    const attendues = [
      'attribution_liberee',
      'decision_attribution',
      'depot_injoignable_j5',
      'lien_magique',
      'premier_rang_libere',
      'rappel_rc_pro',
      'rattachement_decide',
      'refus_declaration',
      'suspension_declarations',
    ];
    expect(Object.keys(GABARITS).sort()).toEqual(attendues);
    expect(Object.keys(TEXTES_DES_NOTIFICATIONS).sort()).toEqual(attendues);
    for (const c of attendues) expect(schemaGabarit.safeParse(c).success).toBe(true);
    expect(schemaGabarit.safeParse('relance_dormance').success).toBe(false);
  });

  it('REQ-UX-016 REQ-JUR-039 : la table réelle ne porte aucune faute', () => {
    expect(fautesDeLaTable(GABARITS, CONTEXTE)).toEqual([]);
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
      depot_injoignable_j5: 'F/F',
      attribution_liberee: 'T/F',
      decision_attribution: 'T/F',
      premier_rang_libere: 'T/T',
      refus_declaration: 'T/F',
      suspension_declarations: 'T/T',
      rappel_rc_pro: 'F/F',
      rattachement_decide: 'T/F',
    });
  });

  it('REQ-UX-016 : TÉMOINS — chaque règle cassée d’un geste rougit, nommée', () => {
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
  return { acces, notifications, preferences, appels };
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
    expect(motif(() => rendreLaNotification('attribution_liberee', {}))).toBe('parametre_manquant');
    expect(
      motif(() => rendreLaNotification('attribution_liberee', { entreprise: 'X', contact: 'Y' }))
    ).toBe('parametre_en_trop');
    expect(
      motif(() => rendreLaNotification('attribution_liberee', { entreprise: 'X\nBcc: y' }))
    ).toBe('parametre_invalide');
    expect(motif(() => rendreLaNotification('attribution_liberee', { entreprise: '' }))).toBe(
      'parametre_invalide'
    );
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
