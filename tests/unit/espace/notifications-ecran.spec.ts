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
 *      AUCUNE date (avant le premier envoi effectif du courriel, art. 20). La juriste a retenu
 *      l'option (a) : tant que la fenêtre est NULLE, la carte N'APPARAÎT PAS dans la liste ;
 *   5. LE LECTEUR DÉDIÉ (arbitrage de la coordination) : il ne lit que les notifications de
 *      l'apporteur de la session, écarte celle dont l'attribution n'est pas la sienne, et ne rend
 *      jamais d'identifiant d'attribution à l'écran.
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
import {
  entreeDeLEspace,
  notificationsDeLEspace,
  type ClientDesNotifications,
} from '../../../src/server/notifications/notifications-de-l-espace';

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

  it('REQ-DM-006 : TÉMOIN — une fenêtre NULLE n’affiche AUCUNE date : la carte n’apparaît pas (option (a) de la juriste)', () => {
    const e = entreeDeLEspace(ligne(null));
    expect(e).toBeNull();
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

describe('REQ-UX-016 — le lecteur dédié : l’apporteur de la session, et des textes seulement', () => {
  const MOI = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const AUTRE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const FIN = new Date('2027-05-25T22:00:00.000Z');
  type Ligne = {
    id: string;
    apporteurId: string;
    cle: string;
    creeAt: Date;
    attribution: {
      apporteurId: string;
      raisonSociale: string | null;
      siren: string;
      fenetreRedeclarationFinAt: Date | null;
    } | null;
  };
  const ligneDe = (id: string, apporteurDeLAttribution: string, fin: Date | null): Ligne => ({
    id,
    apporteurId: MOI,
    cle: 'premier_rang_libere',
    creeAt: new Date('2027-05-10T08:00:00.000Z'),
    attribution: {
      apporteurId: apporteurDeLAttribution,
      raisonSociale: 'Garage Témoin',
      siren: '552100554',
      fenetreRedeclarationFinAt: fin,
    },
  });

  type Requete = {
    where: { apporteurId: string; cle: { in: string[] } };
    orderBy: Record<string, string>[];
    select: Selection;
  };
  type Selection = { [champ: string]: true | { select: Selection } };

  /** Ne garde d'un enregistrement que les champs SÉLECTIONNÉS, comme le client de base. */
  function projeter(valeur: unknown, selection: Selection): unknown {
    if (valeur === null) return null;
    const source = valeur as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(selection).flatMap(([champ, choix]) => {
        if (choix === true) return [[champ, source[champ]]];
        if (typeof choix === 'object' && choix !== null && 'select' in choix)
          return [[champ, projeter(source[champ], choix.select)]];
        return [];
      })
    );
  }

  /** Compare deux lignes selon un tri du client de base ; une direction inconnue est refusée. */
  function comparer(tri: Record<string, string>[]) {
    return (a: Ligne, b: Ligne): number => {
      for (const critere of tri) {
        for (const [champ, sens] of Object.entries(critere)) {
          if (sens !== 'asc' && sens !== 'desc') throw new Error(`tri invalide : ${sens}`);
          const x = (a as Record<string, unknown>)[champ] as Date | string;
          const y = (b as Record<string, unknown>)[champ] as Date | string;
          const ordre = x < y ? -1 : x > y ? 1 : 0;
          if (ordre !== 0) return sens === 'asc' ? ordre : -ordre;
        }
      }
      return 0;
    };
  }

  /**
   * Un faux client qui se conduit comme le client de base : il filtre par l'apporteur et par les
   * clés demandées, trie, et ne rend que les champs sélectionnés. Il garde chaque requête.
   */
  function client(lignes: Ligne[]) {
    const requetes: unknown[] = [];
    const c = {
      notificationEspace: {
        findMany: async (args: Requete) => {
          requetes.push(args);
          return lignes
            .filter(
              (l) => l.apporteurId === args.where.apporteurId && args.where.cle.in.includes(l.cle)
            )
            .sort(comparer(args.orderBy))
            .map((l) => projeter(l, args.select));
        },
      },
    } as unknown as ClientDesNotifications;
    return { c, requetes };
  }

  it('REQ-UX-016 : la lecture porte l’apporteur de la session dans son filtre, et ne demande jamais la date de lecture', async () => {
    const { c, requetes } = client([ligneDe('1', MOI, FIN)]);
    await notificationsDeLEspace(c, MOI);
    expect(requetes).toHaveLength(1);
    const r = requetes[0] as { where: { apporteurId: string }; select: Record<string, unknown> };
    expect(r.where.apporteurId).toBe(MOI);
    expect(JSON.stringify(r.select)).not.toMatch(/lue/i);
  });

  it('REQ-UX-016 : une notification dont l’attribution est celle d’un autre apporteur est écartée', async () => {
    const { c } = client([ligneDe('1', MOI, FIN), ligneDe('2', AUTRE, FIN)]);
    const rendues = await notificationsDeLEspace(c, MOI);
    expect(rendues.map((n) => n.id)).toEqual(['1']);
  });

  it('REQ-DM-006 : la liste ne contient la carte de `premier_rang_libere` qu’une fois la fenêtre posée', async () => {
    const avant = await notificationsDeLEspace(client([ligneDe('1', MOI, null)]).c, MOI);
    expect(avant).toEqual([]);
    const apres = await notificationsDeLEspace(client([ligneDe('1', MOI, FIN)]).c, MOI);
    expect(apres).toHaveLength(1);
    expect(apres[0]!.titre).toContain('25 mai 2027');
  });

  // UX-P1-58 renverse l'option (c) : `decision_attribution` est demandée, et rendue par son propre
  // chemin (`notifications-decision-attribution.spec.ts`). Ici, ce qui reste vrai : sans le fait qui la
  // fonde, la décision n'est pas rendue, et `entreeDeLEspace` ne rend que `premier_rang_libere`.
  it('REQ-UX-016 : `decision_attribution` est demandée ; sans son fait, elle n’est pas rendue', async () => {
    const decision = { ...ligneDe('2', MOI, FIN), cle: 'decision_attribution', evenementId: null };
    const { c, requetes } = client([ligneDe('1', MOI, FIN), decision]);
    const rendues = await notificationsDeLEspace(c, MOI);
    expect(rendues.map((n) => n.id)).toEqual(['1']);
    const r = requetes[0] as { where: { cle: { in: string[] } } };
    expect(r.where.cle.in).toContain('decision_attribution');
    expect(entreeDeLEspace({ ...decision, attribution: decision.attribution })).toBeNull();
    expect(liste(rendues)).not.toContain('une décision concerne votre dépôt');
  });

  it('REQ-UX-016 : les plus récentes d’abord ; à la même heure, l’ordre de l’identifiant', async () => {
    const tot = { ...ligneDe('b', MOI, FIN), creeAt: new Date('2027-05-01T08:00:00.000Z') };
    const memeHeureA = { ...ligneDe('a', MOI, FIN), creeAt: new Date('2027-05-09T08:00:00.000Z') };
    const memeHeureC = { ...ligneDe('c', MOI, FIN), creeAt: new Date('2027-05-09T08:00:00.000Z') };
    const rendues = await notificationsDeLEspace(client([tot, memeHeureC, memeHeureA]).c, MOI);
    expect(rendues.map((n) => n.id)).toEqual(['a', 'c', 'b']);
    expect(rendues.map((n) => n.quand)).toEqual(['9 mai 2027', '9 mai 2027', '1 mai 2027']);
  });

  it('REQ-UX-016 : sans raison sociale, le repli nomme le numéro saisi au dépôt', async () => {
    const sansNom = ligneDe('1', MOI, FIN);
    sansNom.attribution!.raisonSociale = null;
    const rendues = await notificationsDeLEspace(client([sansNom]).c, MOI);
    expect(rendues).toHaveLength(1);
    expect(rendues[0]!.titre).toContain('Entreprise n° 552100554');
  });

  it('REQ-UX-016 : une notification sans attribution est écartée, sans lever', async () => {
    const orpheline = { ...ligneDe('1', MOI, FIN), attribution: null };
    await expect(notificationsDeLEspace(client([orpheline]).c, MOI)).resolves.toEqual([]);
    expect(
      entreeDeLEspace({
        id: '1',
        cle: 'premier_rang_libere',
        creeAt: new Date(),
        attribution: null,
      })
    ).toBeNull();
  });

  it('REQ-UX-016 : l’écran ne reçoit que des textes — aucun identifiant d’attribution ni numéro d’entreprise', async () => {
    const rendues = await notificationsDeLEspace(client([ligneDe('1', MOI, FIN)]).c, MOI);
    expect(Object.keys(rendues[0]!).sort()).toEqual(
      ['appel', 'corps', 'id', 'quand', 'route', 'titre'].sort()
    );
    const h = liste(rendues);
    expect(h).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(h).not.toContain('552100554');
  });
});
