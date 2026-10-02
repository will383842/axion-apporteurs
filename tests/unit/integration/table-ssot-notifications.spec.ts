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
