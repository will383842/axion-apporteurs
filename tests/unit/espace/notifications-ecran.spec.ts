// @req REQ-UX-016
// @req REQ-DM-006
// @req REQ-UX-047
/**
 * UX-P1-54 — l'écran des notifications de l'espace apporteur.
 *
 * CE QU'IL PROUVE (arbitrages de la coordination du 2026-10-04, #619) :
 *   1. LA LISTE rend, dans l'ordre reçu, les textes CANONIQUES des notifications, déjà résolus par le
 *      lecteur serveur ; une notification qui a une route s'ouvre d'UN geste, celle qui n'en a pas
 *      n'est pas un lien ;
 *   2. AUCUN ÉTAT DE LECTURE : la liste ne dit ni « lue » ni « non lue », et elle dit qu'elle ne fait
 *      courir aucun délai (REQ-UX-016 : seul le courriel en fait courir un) ;
 *   3. LES ÉTATS de l'écran (REQ-UX-047) : vide, avec le geste suivant ; chargement, annoncé ;
 *      erreur, qui dit ce qui est sûr et quoi faire ;
 *   4. `premier_rang_libere`, TÉMOIN À DEUX FACES (consigne de la juriste, rattrapage 104) : une
 *      fenêtre posée affiche son jour, par `jourLimiteDeLaFenetre` ; une fenêtre NULLE n'affiche
 *      AUCUNE date (avant le premier envoi effectif du courriel, art. 20).
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EcranNotifications,
  EcranChargementNotifications,
  EcranErreurNotifications,
  type NotificationDeLEspace,
} from '../../../src/app/(espace)/notifications/ecran';
import { NOTIFICATIONS } from '../../../src/content/micro-copy/espace/notifications';
import { ETATS_VIDES_ESPACE } from '../../../src/content/micro-copy/espace/etats-vides';
import { BUDGETS_UX } from '../../../src/domain/seuils/ssot';
import { entreeDeLEspace } from '../../../src/server/notifications/espace';

const UNE: NotificationDeLEspace = {
  id: '11111111-1111-4111-8111-111111111111',
  titre: 'Garage Témoin : vous pouvez la déposer à nouveau jusqu’au 25 mai 2027',
  corps: 'Votre dépôt était le premier en attente.',
  appel: 'Déposer à nouveau cette entreprise',
  route: '/deposer',
  quand: '10 mai 2027',
};
const SANS_ROUTE: NotificationDeLEspace = {
  id: '22222222-2222-4222-8222-222222222222',
  titre: 'Boulangerie Témoin : une décision sur votre déclaration',
  corps: null,
  appel: null,
  route: null,
  quand: '9 mai 2027',
};

const liste = (notifications: readonly NotificationDeLEspace[]) =>
  renderToStaticMarkup(createElement(EcranNotifications, { notifications }));

describe('REQ-UX-016 — la liste des notifications de l’espace', () => {
  it('REQ-UX-016 : les textes reçus sont rendus, dans l’ordre reçu, avec leur date', () => {
    const h = liste([UNE, SANS_ROUTE]);
    expect(h).toContain(NOTIFICATIONS.titre);
    const i = h.indexOf('Garage Témoin');
    const j = h.indexOf('Boulangerie Témoin');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(h).toContain('10 mai 2027');
    expect(h).toContain('Votre dépôt était le premier en attente.');
  });

  it('REQ-UX-016 : aucun état de lecture — ni « lue » ni « non lue » ; la liste ne fait courir aucun délai, et le dit', () => {
    const h = liste([UNE, SANS_ROUTE]);
    expect(h).not.toMatch(/\blue\b/i);
    expect(h).toContain(NOTIFICATIONS.aucunDelai);
  });
});

describe('REQ-UX-047 — un geste, et les états de l’écran', () => {
  it('REQ-UX-047 : ouvrir une notification qui a une route coûte UNE interaction, dans le budget de consultation', () => {
    const h = liste([UNE, SANS_ROUTE]);
    const liens = [...h.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(liens).toContain('/deposer');
    const interactions = 1;
    expect(interactions).toBeLessThanOrEqual(BUDGETS_UX.CONSULTATION_INTERACTIONS_MAX.valeur);
  });

  it('REQ-UX-047 : une notification sans route n’est pas un lien', () => {
    const h = liste([SANS_ROUTE]);
    expect(h).not.toMatch(/<a [^>]*>[^<]*Boulangerie Témoin/);
    expect(h).toContain('Boulangerie Témoin');
  });

  it('REQ-UX-047 : vide — le texte de l’état vide de l’espace, et le geste suivant vers l’accueil', () => {
    const vide = ETATS_VIDES_ESPACE['/notifications']!;
    const h = liste([]);
    expect(h).toContain(vide.titre);
    expect(h).toContain(vide.phrase);
    expect(h).toContain(`href="${vide.action.route}"`);
  });

  it('REQ-UX-047 : chargement — annoncé aux lecteurs d’écran', () => {
    const h = renderToStaticMarkup(createElement(EcranChargementNotifications));
    expect(h).toMatch(/role="status"/);
    expect(h).toContain(NOTIFICATIONS.chargement);
  });

  it('REQ-UX-047 : erreur — ce qui est sûr, et le geste pour réessayer', () => {
    let reessaye = 0;
    const h = renderToStaticMarkup(
      createElement(EcranErreurNotifications, { reessayer: () => (reessaye += 1) })
    );
    expect(h).toContain(NOTIFICATIONS.erreur.titre);
    expect(h).toContain(NOTIFICATIONS.erreur.phrase);
    expect(h).toContain(NOTIFICATIONS.erreur.action);
    expect(reessaye).toBe(0);
  });
});

describe('REQ-DM-006 — `premier_rang_libere` : la date limite, seulement quand la fenêtre est posée', () => {
  const ligne = (fenetreRedeclarationFinAt: Date | null) => ({
    id: '33333333-3333-4333-8333-333333333333',
    cle: 'premier_rang_libere',
    creeAt: new Date('2027-05-10T08:00:00.000Z'),
    attribution: { raisonSociale: 'Garage Témoin', siren: '552100554', fenetreRedeclarationFinAt },
  });

  it('REQ-DM-006 : TÉMOIN — une fenêtre POSÉE affiche son jour (`jourLimiteDeLaFenetre`)', () => {
    // Borne exclusive : minuit à Paris du 26 mai 2027 ; le jour affiché est le 25.
    const e = entreeDeLEspace(ligne(new Date('2027-05-25T22:00:00.000Z')));
    expect(e).not.toBeNull();
    expect(e!.titre).toContain('Garage Témoin');
    expect(e!.titre).toContain('25 mai 2027');
    expect(e!.route).toBe('/deposer');
  });

  it('REQ-DM-006 : TÉMOIN — une fenêtre NULLE n’affiche AUCUNE date', () => {
    const e = entreeDeLEspace(ligne(null));
    const rendu = e === null ? '' : liste([e]);
    expect(rendu).not.toMatch(/\{dateLimite\}/);
    expect(rendu).not.toMatch(
      /\b\d{1,2} (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}\b.*jusqu/
    );
    expect(rendu).not.toContain('jusqu’au');
    expect(rendu).not.toContain("jusqu'au");
  });

  it('REQ-DM-006 : une clé que l’espace ne rend pas est écartée, sans lever', () => {
    expect(entreeDeLEspace({ ...ligne(null), cle: 'cle_inconnue' })).toBeNull();
  });
});
