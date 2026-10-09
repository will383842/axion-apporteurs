// @req REQ-UX-048
// @req REQ-UX-019
// @req REQ-UX-018
// @req REQ-UX-047
/**
 * UX-P1-16 — le cadre de la console : la navigation DÉRIVÉE de la matrice, et l'accueil de chaque rôle.
 *
 * CE QU'IL PROUVE :
 *   (1) la table de navigation et les listes de préférence sont celles de `docs/CONSOLE-ROUTES.md`,
 *       ligne pour ligne ; les routes livrées aussi ;
 *   (2) une entrée n'apparaît que si le rôle a le DROIT de l'écran ET que l'écran est LIVRÉ : aucun
 *       onglet ne mène à un écran prévu ; ajouter un droit fait apparaître l'entrée, sans autre
 *       modification ;
 *   (3) bureau : sept entrées au plus ; en dessous de 768 px, trois entrées et le menu ;
 *   (4) l'accueil est la première route LIVRÉE de la liste de préférence du rôle ; sinon un état
 *       vide guidant, jamais une route prévue (jamais un 404), pour chaque rôle et chaque phase.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationConsole } from '../../../src/components/console/navigation';
import { NAVIGATION_CONSOLE } from '../../../src/content/micro-copy/console/navigation';
import type { ConsoleRole } from '@prisma/client';
import { ROLES_CONSOLE, roleAutorise } from '../../../src/server/roles/matrice';
import {
  ENTREES_DE_LA_CONSOLE,
  PREFERENCES_D_ACCUEIL,
  ROUTES_LIVREES_DE_LA_CONSOLE,
  accueilDuRole,
  barreMobile,
  entreesDuRole,
} from '../../../src/server/console/navigation';
import { BUDGETS_UX } from '../../../src/domain/seuils/ssot';

const CARTE = readFileSync('docs/CONSOLE-ROUTES.md', 'utf8');

/** Les lignes d'un tableau de la carte, après son titre de section. */
function lignes(section: string): string[][] {
  const debut = CARTE.indexOf(section);
  const bloc = CARTE.slice(debut).split('\n## ')[0]!;
  // Le PREMIER tableau de la section seulement : ses lignes se suivent, sans ligne vide.
  const tableau = bloc.slice(bloc.indexOf('\n| ')).split('\n\n')[0]!;
  return tableau
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| ---'))
    .slice(1)
    .map((l) =>
      l
        .slice(2, -2)
        .split(' | ')
        .map((c) => c.trim())
    );
}
const sansCode = (c: string) => c.replace(/`/g, '');
const TOUTES_LES_ROUTES = ENTREES_DE_LA_CONSOLE.map((e) => e.route);
const libelles = (role: ConsoleRole, livrees: readonly string[]) =>
  entreesDuRole(role, { livrees }).map((e) => e.libelle);

describe('REQ-UX-048 — (1) la navigation est celle de la carte', () => {
  it('REQ-UX-048 : TÉMOIN — la table de navigation, ligne pour ligne (ordre, entrée, route)', () => {
    const carte = lignes('## Navigation de premier niveau').map(([ordre, entree, route]) => ({
      ordre: Number(ordre),
      libelle: entree,
      route: sansCode(route!),
    }));
    expect(
      ENTREES_DE_LA_CONSOLE.map(({ ordre, libelle, route }) => ({ ordre, libelle, route }))
    ).toEqual(carte);
  });

  it('REQ-UX-048 : TÉMOIN — les listes de préférence de l’accueil, rôle par rôle', () => {
    const carte = Object.fromEntries(
      lignes('## Accueil par rôle et par phase')
        .filter(([role]) => (ROLES_CONSOLE as readonly string[]).includes(role!))
        .map(([role, preferences]) => [role, preferences!.split(', ').map(sansCode)])
    );
    expect(PREFERENCES_D_ACCUEIL).toEqual(carte);
  });

  it('REQ-UX-048 : TÉMOIN — les routes livrées sont celles que la carte dit livrées', () => {
    const livrees = [
      '## Connexion et pages transverses',
      '## Écrans de la phase 1',
      '## Écrans des phases 2 et 3',
    ]
      .flatMap((s) => lignes(s))
      .filter((l) => l[4] === 'livrée')
      .map((l) => sansCode(l[0]!));
    expect([...ROUTES_LIVREES_DE_LA_CONSOLE].sort()).toEqual(livrees.sort());
  });
});

describe('REQ-UX-048 — (2) une entrée exige le droit ET la livraison', () => {
  it('REQ-UX-048 : TÉMOIN — aujourd’hui seul l’écran des utilisateurs est livré : un onglet pour l’admin, aucun pour les autres', () => {
    expect(entreesDuRole('admin').map((e) => e.route)).toEqual(['/console/utilisateurs']);
    for (const role of ROLES_CONSOLE.filter((r) => r !== 'admin'))
      expect(entreesDuRole(role), role).toEqual([]);
  });

  it('REQ-UX-048 : TÉMOIN — tous les écrans livrés, chaque rôle voit en phase 1 le bureau de la carte, dérivé de ses droits', () => {
    expect(libelles('admin', TOUTES_LES_ROUTES)).toEqual([
      'Qualification',
      'Apporteurs',
      'Prospects',
      'Administration',
    ]);
    expect(libelles('qualifieur', TOUTES_LES_ROUTES)).toEqual([
      'Qualification',
      'Apporteurs',
      'Prospects',
    ]);
    expect(libelles('comptable', TOUTES_LES_ROUTES)).toEqual(['Apporteurs']);
    expect(libelles('lecteur', TOUTES_LES_ROUTES)).toEqual(['Qualification', 'Prospects']);
  });

  it('REQ-UX-048 : TÉMOIN À DEUX FACES — ajouter un droit fait apparaître l’entrée, sans autre modification ; le retirer la fait disparaître', () => {
    const avecArgent = (droit: string, role: ConsoleRole) =>
      roleAutorise(droit, role) || (droit === 'ecran:lots' && role === 'comptable');
    expect(
      entreesDuRole('comptable', { livrees: TOUTES_LES_ROUTES, autorise: avecArgent }).map(
        (e) => e.libelle
      )
    ).toEqual(['Apporteurs', 'Argent']);
    const sansApporteurs = (droit: string, role: ConsoleRole) =>
      droit !== 'ecran:apporteurs' && roleAutorise(droit, role);
    expect(
      entreesDuRole('comptable', { livrees: TOUTES_LES_ROUTES, autorise: sansApporteurs })
    ).toEqual([]);
  });

  it('REQ-SEC-023 : chaque entrée porte un droit d’écran, et l’entrée d’un écran livré mais refusé au rôle n’apparaît pas', () => {
    for (const e of ENTREES_DE_LA_CONSOLE) expect(e.droit, e.route).toMatch(/^ecran:/);
    expect(libelles('lecteur', TOUTES_LES_ROUTES)).not.toContain('Apporteurs');
    expect(libelles('lecteur', TOUTES_LES_ROUTES)).not.toContain('Administration');
  });
});

describe('REQ-UX-018 — (3) sept entrées au plus ; trois et le menu sur mobile', () => {
  it('REQ-UX-018 : TÉMOIN — le bureau n’a jamais plus de sept entrées ; la barre mobile en garde trois, et le menu porte le reste', () => {
    const tous = (_d: string, _r: ConsoleRole) => true;
    const toutes = entreesDuRole('admin', { livrees: TOUTES_LES_ROUTES, autorise: tous });
    expect(toutes.length).toBeLessThanOrEqual(7);
    const barre = barreMobile(toutes);
    expect(barre.visibles).toHaveLength(3);
    expect(barre.dansLeMenu).toHaveLength(toutes.length - 3);
    expect(barreMobile(toutes.slice(0, 2))).toEqual({
      visibles: toutes.slice(0, 2),
      dansLeMenu: [],
    });
  });
});

describe('REQ-UX-019 — (4) l’accueil : la première route livrée de la préférence, sinon un état vide', () => {
  const PHASES: readonly (readonly string[])[] = [
    [],
    ['/console/qualification'],
    ['/console/apporteurs'],
    ['/console/qualification', '/console/apporteurs'],
    ['/console/qualification', '/console/apporteurs', '/console/lots', '/console/statistiques'],
  ];

  it('REQ-UX-019 : TÉMOIN — pour chaque rôle et chaque phase, l’accueil est une route LIVRÉE et permise, ou l’état vide (null) : jamais une route prévue', () => {
    for (const livrees of PHASES)
      for (const role of ROLES_CONSOLE) {
        const accueil = accueilDuRole(role, { livrees });
        if (accueil === null) continue;
        expect(livrees, `${role} → ${accueil}`).toContain(accueil);
      }
  });

  it('REQ-UX-019 : TÉMOIN — l’ordre de préférence de chaque rôle est suivi', () => {
    expect(accueilDuRole('admin', { livrees: [] })).toBeNull();
    expect(accueilDuRole('admin', { livrees: ['/console/apporteurs'] })).toBe(
      '/console/apporteurs'
    );
    expect(accueilDuRole('admin', { livrees: PHASES[3]! })).toBe('/console/qualification');
    expect(accueilDuRole('comptable', { livrees: ['/console/qualification'] })).toBeNull();
    // Les lots et les statistiques sont livrés, mais leurs droits n'entrent qu'avec leur phase :
    // l'accueil passe à la préférence suivante, livrée ET permise.
    expect(accueilDuRole('comptable', { livrees: PHASES[4]! })).toBe('/console/apporteurs');
    expect(accueilDuRole('lecteur', { livrees: PHASES[3]! })).toBe('/console/qualification');
    expect(accueilDuRole('lecteur', { livrees: PHASES[4]! })).toBe('/console/qualification');
    const avecPhase2 = (droit: string, role: ConsoleRole) =>
      roleAutorise(droit, role) || (droit === 'ecran:lots' && role === 'comptable');
    expect(accueilDuRole('comptable', { livrees: PHASES[4]!, autorise: avecPhase2 })).toBe(
      '/console/lots'
    );
    // Aujourd'hui : aucun écran du menu n'est livré, l'accueil est l'état vide pour tous.
    for (const role of ROLES_CONSOLE) expect(accueilDuRole(role), role).toBeNull();
  });
});

describe('REQ-UX-018 — le composant de navigation', () => {
  const tous = (_d: string, _r: ConsoleRole) => true;
  const rendu = (role: ConsoleRole, livrees: readonly string[], autorise = roleAutorise) =>
    renderToStaticMarkup(
      createElement(NavigationConsole, {
        entrees: entreesDuRole(role, { livrees, autorise }),
        compte: createElement('button', { type: 'submit' }, 'COMPTE'),
      })
    );

  it('REQ-UX-018 : TÉMOIN — une navigation nommée ; le bureau porte les entrées et le compte ; la barre mobile trois entrées et « Menu », qui porte le reste et le compte', () => {
    const h = rendu('admin', TOUTES_LES_ROUTES, tous);
    expect(h).toContain(`<nav aria-label="${NAVIGATION_CONSOLE.etiquette}"`);
    const [bureau, barre] = h.split('</ul>');
    for (const e of ENTREES_DE_LA_CONSOLE) expect(bureau).toContain(`>${e.libelle}</a>`);
    expect(bureau).toContain('COMPTE');
    expect(barre).toBeDefined();
    const menu = h.slice(h.indexOf('<details'));
    expect(menu).toContain(`<summary`);
    expect(menu).toContain(NAVIGATION_CONSOLE.menu);
    expect(menu).toContain('COMPTE');
    for (const e of ENTREES_DE_LA_CONSOLE.slice(3)) expect(menu).toContain(`>${e.libelle}</a>`);
  });

  it('REQ-UX-048 : TÉMOIN — un rôle sans écran livré n’a aucun lien, seulement son compte : aucun onglet vers un écran prévu', () => {
    const h = rendu('comptable', []);
    expect(h).not.toMatch(/href="\/console\//);
    expect(h).toContain('COMPTE');
  });

  it('REQ-UX-018 : la feuille de la navigation tient les cibles de 44 px et la bascule à 768 px, sans style en ligne', () => {
    const feuille = readFileSync('src/components/console/navigation.module.css', 'utf8');
    expect(feuille).toMatch(/min-height:\s*2\.75rem/);
    expect(feuille).toMatch(/@media \(max-width: 767\.98px\)/);
    expect(readFileSync('src/components/console/navigation.tsx', 'utf8')).not.toMatch(/style=/);
  });
});

// REQ-UX-047 point 1 (consultation) : chaque écran du rôle s'atteint, depuis n'importe quel écran
// de la console, en au plus le budget de consultation — une interaction par la barre, deux par le
// menu (l'ouvrir, puis choisir). Jugé sur TOUTES les entrées que la carte prévoit, livrées ou non.
describe('REQ-UX-047 — la navigation tient le budget de consultation', () => {
  it('REQ-UX-047 : TÉMOIN — pour chaque rôle, chaque entrée s’atteint en au plus CONSULTATION_INTERACTIONS_MAX interactions', () => {
    const toutes = ENTREES_DE_LA_CONSOLE.map((e) => e.route);
    for (const role of ROLES_CONSOLE) {
      const { visibles, dansLeMenu } = barreMobile(entreesDuRole(role, { livrees: toutes }));
      const cout = [...visibles.map(() => 1), ...dansLeMenu.map(() => 2)];
      for (const c of cout)
        expect(c, role).toBeLessThanOrEqual(BUDGETS_UX.CONSULTATION_INTERACTIONS_MAX.valeur);
    }
  });
});
