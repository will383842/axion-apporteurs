// @req REQ-UX-048
// @req REQ-UX-047
// @req REQ-UX-018
/**
 * UX-P1-18 — la carte des routes de la console, et les maquettes qui la dessinent.
 *
 * CE QUE CE FICHIER GARDE, BLOC PAR BLOC.
 *
 *   (1) REQ-UX-048 — `docs/CONSOLE-ROUTES.md` existe et se lit : chaque tableau d'écrans porte les
 *       colonnes exigées (route, écran, rôles, phase, statut, REQ, maquette, tâche, écran principal),
 *       toute route vit sous `/console`, chaque rôle est un rôle de la console (`ROLES_CONSOLE`,
 *       dérivé de l'enum du schéma, jamais retapé), et aucun conseiller n'y figure (REQ-SEC-041).
 *       La navigation de premier niveau tient en sept entrées au plus ; la barre mobile en trois
 *       entrées et « Menu » ; l'instantané par rôle de la phase 1 est DÉRIVÉ de la navigation.
 *   (2) REQ-UX-047 point 7 — les deux cartes, console et espace, portent la colonne « Écran
 *       principal », en `oui` ou `non`, sur chaque route.
 *   (3) REQ-UX-048, en-têtes filtrés par rôle — dans CHAQUE état de CHAQUE maquette de la console
 *       (section « Console » de `VALIDATION.md`), les entrées de l'en-tête et de la barre du bas
 *       sont exactement celles que la carte ouvre au rôle affiché. Le qualifieur ne voit plus les
 *       lots, le comptable ne voit plus la qualification.
 *   (4) REQ-UX-018 et REQ-UX-047 point 3 — chaque maquette de la console a ses deux thèmes et un
 *       bouton pour passer de l'un à l'autre ; les maquettes neuves de la tâche montrent un état de
 *       chargement et un état d'erreur, et la largeur 375 × 667. Les contrastes du thème sombre sont
 *       recalculés par `tests/unit/espace/maquettes-validees.spec.ts`, depuis la charte.
 *
 * Chaque règle est une fonction pure, appliquée au dépôt ET à un témoin qu'on fabrique en cassant
 * le dépôt d'un geste : un contrôle qui ne rougit pas sur son témoin ne garde rien (RM-02).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { lireValidation } from '../../../scripts/gates/maquettes-validees';
import { ROLES_CONSOLE } from '../../../src/server/roles/matrice';

const CARTE = 'docs/CONSOLE-ROUTES.md';
const CARTE_ESPACE = 'docs/ESPACE-ROUTES.md';
const MAQUETTES = 'docs/maquettes';
const lire = (chemin: string) => readFileSync(chemin, 'utf8');

const COLONNES_D_ECRAN = [
  'Route',
  'Écran',
  'Rôles',
  'Phase',
  'Statut',
  'REQ',
  'Maquette',
  'Tâche',
  'Écran principal',
] as const;
const MAQUETTES_NEUVES = [
  'console-cadre.html',
  'connexion-console.html',
  'utilisateurs-console.html',
  'acces-refuse.html',
] as const;

// ── la lecture des tableaux ─────────────────────────────────────────────────────

type Tableau = { section: string; entete: string[]; lignes: string[][] };

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Les tableaux d'un document Markdown, chacun avec le dernier titre `##` qui le précède. */
function tableaux(texte: string): Tableau[] {
  const sortie: Tableau[] = [];
  let section = '';
  let courant: Tableau | null = null;
  for (const ligne of texte.split('\n')) {
    if (/^##\s/.test(ligne)) section = ligne.replace(/^#+\s+/, '').trim();
    if (!ligne.trimStart().startsWith('|')) {
      courant = null;
      continue;
    }
    if (/^\|\s*-{3}/.test(ligne.trim())) continue;
    if (!courant) {
      courant = { section, entete: cellules(ligne), lignes: [] };
      sortie.push(courant);
    } else courant.lignes.push(cellules(ligne));
  }
  return sortie;
}

const colonne = (t: Tableau, nom: string) => t.entete.indexOf(nom);
const route = (cellule: string) => /^`(\/[^`]*)`$/.exec(cellule)?.[1] ?? null;
const rolesDe = (cellule: string) =>
  cellule
    .replace(/\([^)]*\)/g, '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

/** Les tableaux d'écrans : ceux dont l'en-tête commence par « Route ». */
const tableauxDEcrans = (texte: string) => tableaux(texte).filter((t) => t.entete[0] === 'Route');

// ── (1) la carte ────────────────────────────────────────────────────────────────

/** Les fautes de forme de la carte de la console. Vide : la carte est recevable. */
function fautesDeLaCarte(texte: string): string[] {
  const fautes: string[] = [];
  const ecrans = tableauxDEcrans(texte);
  if (ecrans.length === 0) return ['aucun tableau d’écrans (en-tête « Route »)'];
  const roles = new Set<string>(ROLES_CONSOLE);
  for (const t of ecrans) {
    if (t.entete.join('|') !== COLONNES_D_ECRAN.join('|'))
      fautes.push(`${t.section} : colonnes « ${t.entete.join(', ')} »`);
    for (const l of t.lignes) {
      const r = route(l[0] ?? '');
      if (!r || !(r === '/console' || r.startsWith('/console/')))
        fautes.push(`${t.section} : route hors de /console « ${l[0]} »`);
      const cRoles = l[colonne(t, 'Rôles')] ?? '';
      if (/conseiller/i.test(cRoles)) fautes.push(`${r} : un conseiller dans les rôles`);
      if (!/^tous\b/.test(cRoles))
        for (const role of rolesDe(cRoles))
          if (!roles.has(role)) fautes.push(`${r} : rôle inconnu « ${role} »`);
      if (!/^[123]$/.test(l[colonne(t, 'Phase')] ?? '')) fautes.push(`${r} : phase illisible`);
      if (!/^(prévue|livrée)$/.test(l[colonne(t, 'Statut')] ?? ''))
        fautes.push(`${r} : statut illisible`);
      if (!/^(oui|non)$/.test(l[colonne(t, 'Écran principal')] ?? ''))
        fautes.push(`${r} : « Écran principal » illisible`);
    }
  }
  return fautes;
}

type Entree = { libelle: string; route: string; roles: string[]; phase: number };

/** La navigation de premier niveau, lue dans son tableau. */
function navigation(texte: string): Entree[] {
  const t = tableaux(texte).find(
    (x) => x.section === 'Navigation de premier niveau' && x.entete[0] === 'Ordre'
  );
  if (!t) return [];
  return t.lignes.map((l) => ({
    libelle: l[colonne(t, 'Entrée')]!,
    route: route(l[colonne(t, 'Route d’arrivée')] ?? l[colonne(t, "Route d'arrivée")] ?? '') ?? '',
    roles: rolesDe(l[colonne(t, 'Rôles')] ?? ''),
    phase: Number(l[colonne(t, 'Phase')]),
  }));
}

/** Les entrées qu'un rôle voit à une phase donnée, dans l'ordre de la carte. */
const entreesDuRole = (nav: Entree[], role: string, phase: number) =>
  nav.filter((e) => e.roles.includes(role) && e.phase <= phase).map((e) => e.libelle);

function fautesDeNavigation(texte: string): string[] {
  const fautes: string[] = [];
  const nav = navigation(texte);
  if (nav.length === 0) return ['navigation de premier niveau illisible'];
  if (nav.length > 7) fautes.push(`${nav.length} entrées de premier niveau, sept au plus`);
  const routes = new Set(tableauxDEcrans(texte).flatMap((t) => t.lignes.map((l) => route(l[0]!))));
  for (const e of nav)
    if (!routes.has(e.route)) fautes.push(`${e.libelle} : route d’arrivée absente des tableaux`);
  const instantane = tableaux(texte).find((x) => x.entete.join('|') === 'Rôle|Bureau|Barre mobile');
  if (!instantane) return [...fautes, 'instantané par rôle absent'];
  const vus = new Set<string>();
  for (const [role, bureau, barre] of instantane.lignes) {
    vus.add(role!);
    const attendu = entreesDuRole(nav, role!, 1);
    const lu = bureau!.split('·').map((x) => x.trim());
    if (lu.join('|') !== attendu.join('|'))
      fautes.push(
        `${role} : bureau « ${lu.join(', ')} », la navigation donne « ${attendu.join(', ')} »`
      );
    const mobile = barre!.split('·').map((x) => x.trim());
    if (mobile.at(-1) !== 'Menu')
      fautes.push(`${role} : la barre mobile ne finit pas par « Menu »`);
    if (mobile.length > 4)
      fautes.push(`${role} : ${mobile.length - 1} entrées dans la barre, trois au plus`);
    if (mobile.slice(0, -1).join('|') !== attendu.slice(0, 3).join('|'))
      fautes.push(`${role} : barre mobile « ${mobile.join(', ')} » hors de la navigation`);
  }
  for (const role of ROLES_CONSOLE) if (!vus.has(role)) fautes.push(`${role} : aucun instantané`);
  return fautes;
}

describe('REQ-UX-048 — la carte des routes de la console', () => {
  it('REQ-UX-048 — elle existe, tout est sous /console, colonnes, rôles, phases, statuts', () => {
    expect(existsSync(CARTE), CARTE).toBe(true);
    expect(fautesDeLaCarte(lire(CARTE))).toEqual([]);
    expect(tableauxDEcrans(lire(CARTE)).flatMap((t) => t.lignes).length).toBeGreaterThan(20);
  });

  it('REQ-UX-048 — TÉMOINS : une route hors de /console, un conseiller, un statut libre rougissent', () => {
    const carte = lire(CARTE);
    const ligne = carte.split('\n').find((l) => l.startsWith('| `/console/utilisateurs`'))!;
    expect(
      fautesDeLaCarte(
        carte.replace(ligne, ligne.replace('`/console/utilisateurs`', '`/utilisateurs`'))
      )
    ).toContain('Écrans de la phase 1 : route hors de /console « `/utilisateurs` »');
    expect(
      fautesDeLaCarte(
        carte.replace(ligne, ligne.replace('| admin |', '| admin, conseiller_salarie |'))
      )
    ).toContain('/console/utilisateurs : un conseiller dans les rôles');
    expect(
      // SEC-30 : la ligne de `/console/utilisateurs` est « livrée » ; le témoin casse ce statut-là.
      fautesDeLaCarte(carte.replace(ligne, ligne.replace('| livrée |', '| bientôt |')))
    ).toContain('/console/utilisateurs : statut illisible');
    expect(fautesDeLaCarte('# vide\n')).toEqual(['aucun tableau d’écrans (en-tête « Route »)']);
  });

  it('REQ-UX-048 — sept entrées au plus, barre mobile de trois entrées et « Menu », instantané dérivé', () => {
    expect(fautesDeNavigation(lire(CARTE))).toEqual([]);
  });

  it('REQ-UX-048 — TÉMOINS : une huitième entrée, un instantané qui montre les lots au qualifieur', () => {
    const carte = lire(CARTE);
    const huit = carte.replace(
      '| 7 | Administration |',
      '| 8 | Huit | `/console` | admin | 1 |\n| 7 | Administration |'
    );
    expect(fautesDeNavigation(huit)).toContain('8 entrées de premier niveau, sept au plus');
    const fuite = carte.replace(
      '| qualifieur | Qualification · Apporteurs · Prospects |',
      '| qualifieur | Qualification · Apporteurs · Prospects · Argent |'
    );
    expect(fautesDeNavigation(fuite).some((f) => f.startsWith('qualifieur : bureau'))).toBe(true);
  });
});

// ── (1 bis) les routes réservées à l'admin, écrites ici et non lues dans la carte ─

/**
 * Les routes que la décision de Williams réserve au seul `admin` (UX-P3-04 : tableau de bord
 * nominatif des conseillers ; UX-P2-12 : plans et objectifs des conseillers). Écrites ICI, pas lues
 * dans la carte : un contrôle qui dériverait ses rôles de la carte resterait vert si quelqu'un y
 * rendait le pilotage au lecteur (refus de la lentille securite sur la PR 342).
 */
const RESERVEES_A_L_ADMIN = ['/console/pilotage', '/console/conseillers'] as const;

/** Chaque ligne, de navigation ou de route, qui ouvre une route réservée à un autre rôle que `admin`. */
function fautesDesRoutesReservees(texte: string): string[] {
  const fautes: string[] = [];
  const vues = new Set<string>();
  for (const t of tableaux(texte)) {
    const iRoute = t.entete.findIndex((c) => /^Route/.test(c));
    const iRoles = colonne(t, 'Rôles');
    if (iRoute < 0 || iRoles < 0) continue;
    for (const l of t.lignes) {
      const r = route(l[iRoute] ?? '');
      if (!r || !(RESERVEES_A_L_ADMIN as readonly string[]).includes(r)) continue;
      vues.add(r);
      const roles = rolesDe(l[iRoles] ?? '');
      for (const role of roles.filter((x) => x !== 'admin'))
        fautes.push(`${t.section} : ${r} ouverte au rôle « ${role} », réservée à admin`);
      if (!roles.includes('admin')) fautes.push(`${t.section} : ${r} sans le rôle admin`);
    }
  }
  for (const r of RESERVEES_A_L_ADMIN) if (!vues.has(r)) fautes.push(`${r} absente de la carte`);
  return fautes;
}

describe('REQ-UX-048 — le pilotage nominatif et la fiche conseiller sont réservés à l’admin', () => {
  it('REQ-UX-048 — /console/pilotage et /console/conseillers : « admin » et lui seul, navigation et routes', () => {
    expect(fautesDesRoutesReservees(lire(CARTE))).toEqual([]);
    expect(
      tableaux(lire(CARTE)).some(
        (t) =>
          t.section === 'Navigation de premier niveau' &&
          t.lignes.some((l) => l.includes('`/console/pilotage`'))
      )
    ).toBe(true);
  });

  it('REQ-UX-048 — TÉMOIN : le pilotage rendu au lecteur rougit, en nommant la route et le rôle', () => {
    const carte = lire(CARTE).replace(
      '| 5 | Pilotage | `/console/pilotage` | admin | 3 |',
      '| 5 | Pilotage | `/console/pilotage` | admin, lecteur | 3 |'
    );
    expect(fautesDesRoutesReservees(carte)).toEqual([
      'Navigation de premier niveau : /console/pilotage ouverte au rôle « lecteur », réservée à admin',
    ]);
    const conseillers = lire(CARTE).replace(
      /(\| `\/console\/conseillers` \|[^\n]*?\|) admin \|/,
      '$1 admin, comptable |'
    );
    expect(fautesDesRoutesReservees(conseillers)).toEqual([
      'Écrans des phases 2 et 3 : /console/conseillers ouverte au rôle « comptable », réservée à admin',
    ]);
  });
});

// ── (2) la colonne « Écran principal » ──────────────────────────────────────────

/**
 * Les routes d'une carte qui n'ont pas de valeur `oui` ou `non` dans « Écran principal ». Seuls
 * les tableaux d'ÉCRANS sont lus, ceux qui ont une colonne « Route » : la navigation et l'accueil
 * par rôle citent des routes sans en être la liste.
 */
function sansEcranPrincipal(texte: string): string[] {
  const manques: string[] = [];
  for (const t of tableaux(texte).filter((x) => x.entete.includes('Route'))) {
    const i = colonne(t, 'Écran principal');
    for (const l of t.lignes) {
      const r = l.map(route).find((x) => x !== null);
      if (!r) continue;
      if (i < 0 || !/^(oui|non)$/.test(l[i] ?? '')) manques.push(r);
    }
  }
  return manques;
}

describe('REQ-UX-047 — la colonne « Écran principal » des deux cartes', () => {
  it('REQ-UX-047 — chaque route de la console et de l’espace dit oui ou non', () => {
    expect(sansEcranPrincipal(lire(CARTE))).toEqual([]);
    expect(sansEcranPrincipal(lire(CARTE_ESPACE))).toEqual([]);
    expect(
      tableaux(lire(CARTE_ESPACE))
        .flatMap((t) => t.lignes)
        .filter((l) => l.at(-1) === 'oui').length
    ).toBeGreaterThan(0);
  });

  it('REQ-UX-047 — TÉMOIN : une carte sans la colonne nomme ses routes', () => {
    const avant = `| Route | Écran |\n| --- | --- |\n| \`/x\` | X |\n`;
    expect(sansEcranPrincipal(avant)).toEqual(['/x']);
  });
});

// ── (3) les en-têtes filtrés par rôle ───────────────────────────────────────────

/** Les maquettes de la console : la section « Console » de VALIDATION.md, lue par la garde. */
const MAQUETTES_CONSOLE = lireValidation(lire(`${MAQUETTES}/VALIDATION.md`))
  .lignes.filter((l) => /console/i.test(l.section))
  .map((l) => l.fichier!);

const texteDe = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Pour chaque état : le rôle affiché, les entrées de l'en-tête, celles de la barre du bas. */
function entetes(
  html: string
): { id: string; role: string | null; nav: string[]; barre: string[] }[] {
  return html
    .split(/<section\s+class="ecran"/)
    .slice(1)
    .map((m) => {
      const corps = m.split(/<\/section\s*>/)[0]!;
      // Le rôle affiché : dans le compte de la barre latérale (UX-P1-50), `<span class="s-qui">
      // <b>nom</b><small>rôle</small>`, ou dans l'en-tête d'un état sans navigation.
      const role =
        /class="s-qui"\s*><b>[^<]*<\/b\s*><small>([a-z_]+)<\/small\s*>/.exec(corps)?.[1] ??
        /class="c-(?:qui|compte)"[\s\S]*?<b>([a-z_]+)<\/b\s*>/.exec(corps)?.[1] ??
        null;
      const liens = (bloc: RegExp) =>
        [...(bloc.exec(corps)?.[0] ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/g)].map((x) =>
          texteDe(x[1]!)
        );
      return {
        id: /id="([^"]+)"/.exec(m)?.[1] ?? '?',
        role,
        // La navigation : la barre latérale en sections (UX-P1-50).
        nav: liens(/<nav\s+class="s-nav"[\s\S]*?<\/nav\s*>/),
        barre: liens(/<nav\s+class="c-barre"[\s\S]*?<\/nav\s*>/),
      };
    });
}

/** La phase que dessine une maquette : celle de la ligne de la carte qui la cite (la plus basse). */
function phaseDe(carte: string, fichier: string): number {
  const phases = tableauxDEcrans(carte).flatMap((t) =>
    t.lignes
      .filter((l) => (l[colonne(t, 'Maquette')] ?? '').includes(`\`${fichier}\``))
      .map((l) => Number(l[colonne(t, 'Phase')]))
  );
  return phases.length ? Math.min(...phases) : 1;
}

function fautesDEntete(carte: string, fichier: string, html: string): string[] {
  const nav = navigation(carte);
  const phase = phaseDe(carte, fichier);
  const fautes: string[] = [];
  for (const e of entetes(html)) {
    if (!e.role) {
      if (e.nav.length || e.barre.length)
        fautes.push(`${fichier}#${e.id} : navigation sans rôle affiché`);
      continue;
    }
    const permis = entreesDuRole(nav, e.role, phase);
    if (e.nav.join('|') !== permis.join('|'))
      fautes.push(
        `${fichier}#${e.id} (${e.role}) : en-tête « ${e.nav.join(', ')} », la carte ouvre « ${permis.join(', ')} »`
      );
    if (e.barre.length && e.barre.join('|') !== permis.slice(0, 3).join('|'))
      fautes.push(`${fichier}#${e.id} (${e.role}) : barre « ${e.barre.join(', ')} »`);
  }
  return fautes;
}

describe('REQ-UX-048 — chaque état de chaque maquette de la console montre les entrées de son rôle, et elles seules', () => {
  it('REQ-UX-048 — la section Console de VALIDATION.md nomme les maquettes de la tâche', () => {
    for (const f of MAQUETTES_NEUVES) expect(MAQUETTES_CONSOLE, f).toContain(f);
  });

  it('REQ-UX-048 — en-têtes et barres conformes à la carte, rôle par rôle', () => {
    const carte = lire(CARTE);
    let etats = 0;
    for (const f of MAQUETTES_CONSOLE) {
      const html = lire(`${MAQUETTES}/${f}`);
      expect(fautesDEntete(carte, f, html), f).toEqual([]);
      etats += entetes(html).filter((e) => e.role).length;
    }
    expect(etats).toBeGreaterThan(40);
  });

  it('REQ-UX-048 — TÉMOINS : l’onglet des lots chez le qualifieur, la qualification chez le comptable', () => {
    const carte = lire(CARTE);
    const file = lire(`${MAQUETTES}/file-qualification.html`).replace(
      '<a href="console-cadre.html#etat-qualifieur">Prospects</a>',
      '<a href="console-cadre.html#etat-qualifieur">Prospects</a><a href="lot-paiement.html#etat-brouillon">Lots de paiement</a>'
    );
    expect(
      fautesDEntete(carte, 'file-qualification.html', file).some((f) => f.includes('(qualifieur)'))
    ).toBe(true);
    const lot = lire(`${MAQUETTES}/lot-paiement.html`).replace(
      '<a href="console-cadre.html#etat-comptable">Apporteurs</a>',
      '<a href="file-qualification.html#etat-nominal">Qualification</a><a href="console-cadre.html#etat-comptable">Apporteurs</a>'
    );
    expect(
      fautesDEntete(carte, 'lot-paiement.html', lot).some((f) => f.includes('(comptable)'))
    ).toBe(true);
  });
});

// ── (4) deux thèmes, cinq états, deux largeurs ──────────────────────────────────

function fautesDeMaquette(fichier: string, html: string, neuve: boolean): string[] {
  const fautes: string[] = [];
  if (!/:root\[data-theme='sombre'\]\s*\{/.test(html))
    fautes.push(`${fichier} : pas de thème sombre`);
  if (!/@media \(prefers-color-scheme: dark\)/.test(html))
    fautes.push(`${fichier} : le thème automatique ignore le système`);
  if (!/id="theme"/.test(html)) fautes.push(`${fichier} : pas de bouton de thème`);
  if (neuve) {
    const ids = entetes(html).map((e) => e.id);
    for (const id of ['etat-chargement', 'etat-erreur'])
      if (!ids.includes(id)) fautes.push(`${fichier} : pas d’état ${id}`);
    if (!/data-largeur="1280" data-hauteur="800"/.test(html))
      fautes.push(`${fichier} : pas de largeur 1280 × 800`);
    if (!/data-largeur="375" data-hauteur="667"/.test(html))
      fautes.push(`${fichier} : pas de largeur 375 × 667`);
  }
  return fautes;
}

describe('REQ-UX-018 — deux thèmes et deux largeurs pour la console', () => {
  it('REQ-UX-018 — chaque maquette de la console porte ses deux thèmes ; les neuves, leurs états et leurs largeurs', () => {
    for (const f of MAQUETTES_CONSOLE)
      expect(
        fautesDeMaquette(
          f,
          lire(`${MAQUETTES}/${f}`),
          (MAQUETTES_NEUVES as readonly string[]).includes(f)
        )
      ).toEqual([]);
  });

  it('REQ-UX-018 — TÉMOIN : une maquette sans thème sombre ni chargement rougit', () => {
    const html = lire(`${MAQUETTES}/console-cadre.html`)
      .replace(":root[data-theme='sombre'] {", ':root[data-theme="nuit"] {')
      .replace('id="etat-chargement"', 'id="etat-attente"');
    expect(fautesDeMaquette('console-cadre.html', html, true)).toEqual([
      'console-cadre.html : pas de thème sombre',
      'console-cadre.html : pas d’état etat-chargement',
    ]);
  });

  it('REQ-UX-018 — chaque maquette citée par la carte existe, ou une tâche du registre la produit', () => {
    const disque = new Set(readdirSync(MAQUETTES));
    const registre = JSON.parse(lire('docs/tasks.json')) as { taches: { paths?: string[] }[] };
    const promises = new Set(
      registre.taches.flatMap((t) =>
        (t.paths ?? [])
          .filter((p) => p.startsWith(`${MAQUETTES}/`))
          .map((p) => p.slice(MAQUETTES.length + 1))
      )
    );
    const citees = [...lire(CARTE).matchAll(/`([a-z0-9-]+\.html)`/g)].map((m) => m[1]!);
    expect(citees.length).toBeGreaterThan(5);
    for (const f of citees) expect(disque.has(f) || promises.has(f), f).toBe(true);
  });
});

// ── (5) le thème sombre de la console, recalculé depuis la charte ───────────────

function luminance(hex: string): number {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const rapport = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
function jetonsSombres(html: string): Record<string, string> {
  const debut = html.search(/:root\[data-theme='sombre'\]\s*\{/);
  if (debut < 0) return {};
  const bloc = html.slice(debut, html.indexOf('}', debut));
  return Object.fromEntries(
    [...bloc.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ])
  );
}
/** Les paires de la table « Console, thème sombre » de la charte : premier plan, fond, rapport affiché, seuil. */
function pairesSombres(index: string) {
  const morceau = index
    .split('<caption>')
    .find((m) => /^\s*Console, thème sombre\s*<\/caption/.test(m));
  if (!morceau) return [];
  return [...morceau.split(/<\/table\s*>/)[0]!.matchAll(/<tr>([\s\S]*?)<\/tr\s*>/g)]
    .map((m) =>
      [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td\s*>/g)].map((c) =>
        c[1]!.replace(/<[^>]+>/g, '').trim()
      )
    )
    .filter((c) => c.length === 5 && c[0]!.startsWith('--'))
    .map((c) => ({
      avant: c[0]!.slice(2),
      arriere: c[1]!.slice(2),
      affiche: parseFloat(c[3]!),
      seuil: parseFloat(c[4]!),
    }));
}
function fautesDeContraste(index: string, fichier: string, html: string): string[] {
  const j = jetonsSombres(html);
  return pairesSombres(index).flatMap((p) => {
    const r = rapport(j[p.avant] ?? '#000000', j[p.arriere] ?? '#000000');
    const fautes: string[] = [];
    if (r < p.seuil)
      fautes.push(`${fichier} --${p.avant}/--${p.arriere} : ${r.toFixed(2)}:1, seuil ${p.seuil}:1`);
    if (Math.abs(r - p.affiche) >= 0.01)
      fautes.push(
        `${fichier} --${p.avant}/--${p.arriere} : la charte affiche ${p.affiche}:1, recalculé ${r.toFixed(2)}:1`
      );
    return fautes;
  });
}

describe('REQ-UX-018 — le thème sombre de la console passe ses seuils, et la charte dit vrai', () => {
  it('REQ-UX-018 — chaque paire déclarée, dans chaque maquette de la console', () => {
    const index = lire(`${MAQUETTES}/index.html`);
    expect(pairesSombres(index).length).toBeGreaterThanOrEqual(25);
    for (const f of MAQUETTES_CONSOLE)
      expect(fautesDeContraste(index, f, lire(`${MAQUETTES}/${f}`))).toEqual([]);
  });

  it('REQ-UX-018 — TÉMOIN : un texte doux assombri sous le seuil rougit, en nommant la paire', () => {
    const index = lire(`${MAQUETTES}/index.html`);
    const html = lire(`${MAQUETTES}/console-cadre.html`).replace(
      /(:root\[data-theme='sombre'\]\s*\{[\s\S]*?--texte-doux:\s*)#[0-9a-fA-F]{6}/,
      '$1#4a5261'
    );
    expect(
      fautesDeContraste(index, 'console-cadre.html', html).some(
        (f) => f.includes('--texte-doux/--fond') && f.includes('seuil')
      )
    ).toBe(true);
  });
});
