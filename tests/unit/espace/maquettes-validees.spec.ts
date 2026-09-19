// @req REQ-UX-008
// @req REQ-UX-017
// @req REQ-UX-034
/**
 * UX-P0-02 — les maquettes de l'espace, et la garde qui les rend OBLIGATOIRES avant tout code d'écran.
 *
 * CE QUE CE FICHIER GARDE, BLOC PAR BLOC.
 *
 *   (1) LA GARDE `maquettes-validees`. `docs/maquettes/VALIDATION.md` dit depuis la phase −1 qu'« une
 *       tâche d'écran n'est pas attribuable tant que la maquette de son écran n'a pas une ligne
 *       validée », et que ce fichier-ci le vérifie. Il n'existait pas : la règle vivait dans le
 *       composeur (`scripts/lot/composer.ts`), qui la relit à sa façon au moment de composer, et nulle
 *       part ailleurs. Une tâche d'écran attribuée À LA MAIN, hors composeur, ne rougissait rien. Les
 *       témoins EXÉCUTENT `controler()` sur des vues injectées, et le script entier sur le dépôt.
 *       Un témoin porte sur une ligne du MILIEU du tableau : une lecture qui ne verrait que la
 *       dernière ligne passerait un témoin de fin de tableau.
 *
 *   (2) REQ-UX-008 — l'accueil maquetté tient la forme exigée : trois chiffres, au plus une alerte,
 *       un seul champ, une barre à quatre onglets — ceux que `docs/ESPACE-ROUTES.md` déclare (lus,
 *       jamais retapés, RM-01), et les mêmes sur les six maquettes de l'espace.
 *
 *   (3) REQ-UX-034 — les deux thèmes de l'espace sont portés par des jetons PROPRES, distincts de
 *       ceux de la console, et CHAQUE paire que la charte déclare (`index.html`) passe son seuil dans
 *       les deux thèmes, recalculée ici depuis le CSS de chaque maquette. Le rapport que la charte
 *       AFFICHE est confronté au rapport recalculé : une charte qui annonce 7:1 pour une paire à 4:1
 *       rougit.
 *
 *   (4) REQ-UX-017, EN PARTIE SEULEMENT : la moitié STATIQUE — maquettes autonomes (aucune ressource
 *       externe : le dépôt est public et la CSP de SEC-02 refuse l'externe), langue déclarée, chaque
 *       champ étiqueté. La moitié DYNAMIQUE (axe, cibles mesurées à 48 px, reflux à 320 px sur un
 *       navigateur réel) appartient au harnais `tests/a11y/` de UX-P0-03 et n'est PAS prouvée ici.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import {
  controler,
  lireValidation,
  tachesNonValidees,
  estValidee,
  FAMILLES,
  VALIDEUR,
  vueDuDepot,
  type Vue,
} from '../../../scripts/gates/maquettes-validees';
import { composerLeLot, type Tache as TacheDuComposeur } from '../../../scripts/lot/composer';
import { lireRegistre } from '../../../scripts/lot/registre-decisions';

const SCRIPT = 'scripts/gates/maquettes-validees.ts';
const DOSSIER = 'docs/maquettes';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

// ── (1) la garde ─────────────────────────────────────────────────────────────

/** Un tableau de validation de TROIS lignes : la ligne du milieu est celle qu'on abîme. */
const tableau = (
  milieu: string,
  derniere = '| Lot | `lot.html` | UX-P2-03 | — | — |'
) => `# Validation

## Espace apporteur

| Écran | Fichier | Tâche | Validé le | Par |
| --- | --- | --- | --- | --- |
| Accueil | \`accueil.html\` | UX-P1-08 | 2026-09-19 | Will |
${milieu}
${derniere}
`;

const MILIEU_VALIDE = '| Entreprise | `entreprise.html` | UX-P1-01 | 2026-09-19 | Will |';
const MILIEU_NON_VALIDE = '| Entreprise | `entreprise.html` | UX-P1-01 | — | — |';

const vue = (validation: string, surcharge: Partial<Vue> = {}): Vue => ({
  validation,
  maquettes: ['accueil.html', 'entreprise.html', 'lot.html'],
  taches: [
    { id: 'UX-P1-08', statut: 'a_faire', owner: null },
    { id: 'UX-P1-01', statut: 'a_faire', owner: null },
    { id: 'UX-P2-03', statut: 'a_faire', owner: null },
  ],
  ...surcharge,
});

const familles = (v: Vue) => [...new Set(controler(v).map((f) => f.famille))].sort();

describe('maquettes-validees — la garde exécutée sur des vues injectées', () => {
  it('REQ-UX-008 — CONTRE-TÉMOIN : un tableau conforme, validé ou non, sort sans faute', () => {
    expect(controler(vue(tableau(MILIEU_VALIDE)))).toEqual([]);
    expect(controler(vue(tableau(MILIEU_NON_VALIDE)))).toEqual([]);
  });

  it('REQ-UX-008 — la ligne du MILIEU non validée écarte SA tâche, et seulement elle', () => {
    const { lignes } = lireValidation(tableau(MILIEU_NON_VALIDE));
    expect(lignes.map((l) => l.taches.join())).toEqual(['UX-P1-08', 'UX-P1-01', 'UX-P2-03']);
    expect([...tachesNonValidees(lignes)].sort()).toEqual(['UX-P1-01', 'UX-P2-03']);
    expect(estValidee(lignes[0]!)).toBe(true);
    expect(estValidee(lignes[1]!)).toBe(false);
  });

  it('REQ-UX-008 — TÉMOIN : une tâche d’écran ATTRIBUÉE alors que sa ligne (au milieu) n’est pas validée rougit', () => {
    const v = vue(tableau(MILIEU_NON_VALIDE), {
      taches: [
        { id: 'UX-P1-08', statut: 'a_faire', owner: null },
        { id: 'UX-P1-01', statut: 'en_cours', owner: 'A05' },
        { id: 'UX-P2-03', statut: 'a_faire', owner: null },
      ],
    });
    const fautes = controler(v);
    expect(fautes.map((f) => f.famille)).toEqual(['ecran_attribue_sans_validation']);
    expect(fautes[0]!.message).toContain('UX-P1-01');
    // Un propriétaire seul suffit : attribuer, c'est nommer quelqu'un.
    const seulementNommee = vue(tableau(MILIEU_NON_VALIDE), {
      taches: [
        { id: 'UX-P1-08', statut: 'a_faire', owner: null },
        { id: 'UX-P1-01', statut: 'a_faire', owner: 'A05' },
        { id: 'UX-P2-03', statut: 'a_faire', owner: null },
      ],
    });
    expect(familles(seulementNommee)).toEqual(['ecran_attribue_sans_validation']);
    // CONTRE-TÉMOIN : la même attribution sur une ligne VALIDÉE ne rougit pas.
    expect(controler({ ...v, validation: tableau(MILIEU_VALIDE) })).toEqual([]);
  });

  it('REQ-UX-008 — TÉMOINS : une validation à moitié écrite, une date fausse, un autre valideur que Will', () => {
    expect(VALIDEUR).toBe('Will');
    expect(
      familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | 2026-09-19 | — |')))
    ).toEqual(['validation_partielle']);
    expect(
      familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | — | Will |')))
    ).toEqual(['validation_partielle']);
    expect(
      familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | 19/09/2026 | Will |')))
    ).toEqual(['date_invalide']);
    expect(
      familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | 2026-02-30 | Will |')))
    ).toEqual(['date_invalide']);
    expect(
      familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | 2026-09-19 | A06 |')))
    ).toEqual(['valideur_non_autorise']);
    // Une validation partielle ne VALIDE pas : la tâche reste écartée.
    const { lignes } = lireValidation(
      tableau('| Entreprise | `entreprise.html` | UX-P1-01 | 2026-09-19 | — |')
    );
    expect(tachesNonValidees(lignes).has('UX-P1-01')).toBe(true);
  });

  it('REQ-UX-008 — TÉMOINS : maquette absente, maquette sans ligne, tâche inconnue, ligne mal formée, tableau illisible', () => {
    expect(
      familles(vue(tableau(MILIEU_VALIDE), { maquettes: ['accueil.html', 'lot.html'] }))
    ).toEqual(['maquette_absente']);
    expect(
      familles(
        vue(tableau(MILIEU_VALIDE), {
          maquettes: ['accueil.html', 'entreprise.html', 'lot.html', 'orpheline.html'],
        })
      )
    ).toEqual(['maquette_sans_ligne']);
    // `index.html` est la page de la charte, pas un écran : elle n'a pas de ligne, et c'est voulu.
    expect(
      controler(
        vue(tableau(MILIEU_VALIDE), {
          maquettes: ['accueil.html', 'entreprise.html', 'lot.html', 'index.html'],
        })
      )
    ).toEqual([]);
    expect(familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P9-99 | — | — |')))).toEqual(
      ['tache_inconnue']
    );
    expect(familles(vue(tableau('| Entreprise | `entreprise.html` | UX-P1-01 | — |')))).toEqual([
      'ligne_mal_formee',
    ]);
    // Sans fichier lisible, la ligne ne nomme aucune maquette : `entreprise.html` resterait « sans
    // ligne » si elle était sur le disque. On l'en retire pour isoler la faute de forme.
    expect(
      familles(
        vue(tableau('| Entreprise | entreprise | UX-P1-01 | — | — |'), {
          maquettes: ['accueil.html', 'lot.html'],
        })
      )
    ).toEqual(['ligne_mal_formee']);
    expect(familles(vue('# Validation\n\nAucun tableau.\n'))).toEqual(['tableau_illisible']);
  });

  it('REQ-UX-008 — les colonnes se lisent par leur EN-TÊTE, pas par leur position', () => {
    // Le composeur lisait l'avant-dernière cellule, c'est-à-dire « Par », sous un commentaire qui
    // disait « Validé le ». Ici, les colonnes permutées se lisent pareil.
    const permute = `| Tâche | Par | Validé le | Fichier | Écran |
| --- | --- | --- | --- | --- |
| UX-P1-08 | Will | 2026-09-19 | \`accueil.html\` | Accueil |
| UX-P1-01 | — | — | \`entreprise.html\` | Entreprise |
| UX-P2-03 | — | — | \`lot.html\` | Lot |
`;
    expect(controler(vue(permute))).toEqual([]);
    expect([...tachesNonValidees(lireValidation(permute).lignes)].sort()).toEqual([
      'UX-P1-01',
      'UX-P2-03',
    ]);
  });

  it('REQ-UX-008 — chaque famille déclarée a son témoin dans ce fichier', () => {
    expect([...FAMILLES].sort()).toEqual(
      [
        'date_invalide',
        'ecran_attribue_sans_validation',
        'ligne_mal_formee',
        'maquette_absente',
        'maquette_sans_ligne',
        'tableau_illisible',
        'tache_inconnue',
        'valideur_non_autorise',
        'validation_partielle',
      ].sort()
    );
  });

  it('REQ-UX-008 — CÂBLAGE : l’ensemble que la garde écarte, donné au VRAI composeur, écarte la tâche', () => {
    const tache = (id: string): TacheDuComposeur => ({
      id,
      titre: id,
      phase: 1,
      repo: 'partners',
      zone: 'espace',
      paths: [`src/app/${id}`],
      schema: false,
      sensible: [],
      deps: [],
      reqs: ['REQ-UX-008'],
      hyp: [],
      externe: null,
      estimateDays: 1,
      statut: 'a_faire',
    });
    const { lignes } = lireValidation(tableau(MILIEU_NON_VALIDE));
    const { retenues, ecartees } = composerLeLot([tache('UX-P1-08'), tache('UX-P1-01')], {
      phase: 1,
      repo: 'partners',
      max: 8,
      registre: lireRegistre(''),
      maquettesNonValidees: tachesNonValidees(lignes),
    });
    expect(retenues.map((t) => t.id)).toEqual(['UX-P1-08']);
    expect(ecartees).toEqual([{ id: 'UX-P1-01', raison: 'maquette non validée par Will' }]);
  });
});

describe('maquettes-validees — le script sur le dépôt réel', () => {
  it('REQ-UX-008 — le dépôt sort en zéro, et la sortie COMPTE ce qu’elle a lu', () => {
    const { code, sortie } = lancer();
    expect(sortie).toMatch(/8 ligne\(s\) lue\(s\)/);
    expect(code).toBe(0);
  });

  it('REQ-UX-008 — `--prove` fait rougir chaque famille et laisse ses contre-témoins verts', () => {
    const { code, sortie } = lancer('--prove');
    for (const f of FAMILLES) expect(sortie).toContain(f);
    expect(code).toBe(0);
  });

  it('REQ-UX-008 — la vue du dépôt lit les huit maquettes et les tâches du registre', () => {
    const v = vueDuDepot();
    expect(v.maquettes).toContain('accueil.html');
    expect(v.taches.find((t) => t.id === 'UX-P1-08')).toBeDefined();
    expect(lireValidation(v.validation).lignes).toHaveLength(8);
  });
});

// ── (2) REQ-UX-008 : la forme de l'accueil ───────────────────────────────────

const lire = (f: string) => readFileSync(`${DOSSIER}/${f}`, 'utf8');
const MAQUETTES_ESPACE = lireValidation(readFileSync(`${DOSSIER}/VALIDATION.md`, 'utf8'))
  .lignes.filter((l) => /espace/i.test(l.section))
  .map((l) => l.fichier!);
const MAQUETTES_CONSOLE = lireValidation(readFileSync(`${DOSSIER}/VALIDATION.md`, 'utf8'))
  .lignes.filter((l) => /console/i.test(l.section))
  .map((l) => l.fichier!);

/** Les sections d'état d'une maquette : `<section class="ecran" …>` jusqu'à la suivante. */
function etats(html: string): { id: string; corps: string }[] {
  const morceaux = html.split(/<section\s+class="ecran"/).slice(1);
  return morceaux.map((m) => ({
    id: /id="([^"]+)"/.exec(m)?.[1] ?? '?',
    corps: m.split(/<\/main>/)[0]!,
  }));
}

/** Les onglets déclarés par `docs/ESPACE-ROUTES.md` (première colonne du tableau « Barre de navigation »). */
function ongletsDeclares(): string[] {
  const texte = readFileSync('docs/ESPACE-ROUTES.md', 'utf8');
  const bloc = texte.split('## Barre de navigation')[1]!.split('\n## ')[0]!;
  return bloc
    .split('\n')
    .filter((l) => /^\|\s*[^-|\s]/.test(l) && !/^\|\s*Onglet\s*\|/.test(l))
    .map((l) => l.split('|')[1]!.trim());
}

/**
 * Les libellés de la barre de navigation d'un état, espaces et retours à la ligne normalisés.
 * ⚠️ Prettier coupe les balises fermantes (`</a` puis `>` à la ligne suivante) : chaque fermante se
 * cherche donc en `<\/x\s*>`. Écrite `<\/a>`, la lecture rendait une barre VIDE — mesuré.
 */
function ongletsDe(corps: string): string[] {
  const nav = /<nav\s+class="onglets"[\s\S]*?<\/nav\s*>/.exec(corps)?.[0] ?? '';
  return [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/g)].map((m) =>
    m[1]!
      .replace(/<svg[\s\S]*?<\/svg\s*>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

describe('REQ-UX-008 — l’accueil maquetté : 3 chiffres, 1 alerte au plus, 1 champ, 4 onglets', () => {
  it('REQ-UX-008 — ESPACE-ROUTES déclare quatre onglets, et ce sont eux', () => {
    expect(ongletsDeclares()).toEqual(['Accueil', 'Mes entreprises', 'Mes commissions', 'Plus']);
  });

  it('REQ-UX-008 — chaque état de l’accueil : au plus une alerte, trois chiffres s’il en montre, un seul champ', () => {
    const lus = etats(lire('accueil.html'));
    expect(lus.length).toBeGreaterThanOrEqual(8);
    for (const { id, corps } of lus) {
      // `class="encart ok"` et non `class="encart-titre"` : la classe exacte, suivie d'un blanc ou
      // du guillemet fermant (`\b` s'arrêtait au tiret et comptait chaque titre d'alerte en plus).
      const alertes = (corps.match(/class="encart[\s"]/g) ?? []).length;
      expect(alertes, `${id} : alertes`).toBeLessThanOrEqual(1);
      const chiffres = /<ul\s+class="chiffres"[\s\S]*?<\/ul\s*>/.exec(corps)?.[0];
      if (chiffres) expect((chiffres.match(/<li\b/g) ?? []).length, `${id} : chiffres`).toBe(3);
      const champs = (corps.match(/<input\b/g) ?? []).length;
      expect(champs, `${id} : champs`).toBeLessThanOrEqual(1);
    }
    // L'état nominal montre les trois chiffres ET le champ : sinon le témoin ci-dessus serait vide.
    const nominal = lus.find((e) => e.id === 'etat-nominal')!;
    expect(nominal.corps).toMatch(/<ul\s+class="chiffres"/);
    expect((nominal.corps.match(/<input\b/g) ?? []).length).toBe(1);
  });

  it('REQ-UX-008 — les six maquettes de l’espace portent la MÊME barre, celle d’ESPACE-ROUTES', () => {
    expect(MAQUETTES_ESPACE).toHaveLength(6);
    const attendus = ongletsDeclares();
    let barres = 0;
    for (const f of MAQUETTES_ESPACE) {
      for (const { id, corps } of etats(lire(f))) {
        if (!/<nav\s+class="onglets"/.test(corps)) continue;
        barres += 1;
        expect(ongletsDe(corps), `${f}#${id}`).toEqual(attendus);
      }
    }
    expect(barres).toBeGreaterThan(40);
  });
});

// ── (3) REQ-UX-034 : deux thèmes, jetons propres, contraste recalculé ────────

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

/** Les jetons d'un bloc CSS `sélecteur { --nom: #hex; … }`. */
function jetons(html: string, selecteur: RegExp): Record<string, string> {
  const debut = html.search(selecteur);
  if (debut < 0) return {};
  const bloc = html.slice(debut, html.indexOf('}', debut));
  return Object.fromEntries(
    [...bloc.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ])
  );
}
const CLAIR = /:root\s*\{/;
const SOMBRE = /:root\[data-theme='sombre'\]\s*\{/;

/** Les paires que la charte déclare, par tableau (légende) : premier plan, fond, rapport affiché, seuil. */
function pairesDeLaCharte(): Map<
  string,
  { avant: string; arriere: string; affiche: number; seuil: number }[]
> {
  const html = lire('index.html');
  const tables = new Map<
    string,
    { avant: string; arriere: string; affiche: number; seuil: number }[]
  >();
  for (const morceau of html.split('<caption>').slice(1)) {
    const legende = morceau.split(/<\/caption\s*>/)[0]!.trim();
    const lignes = [...morceau.split(/<\/table\s*>/)[0]!.matchAll(/<tr>([\s\S]*?)<\/tr\s*>/g)]
      .map((m) =>
        [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td\s*>/g)].map((c) =>
          c[1]!.replace(/<[^>]+>/g, '').trim()
        )
      )
      .filter((c) => c.length === 5 && c[0]!.startsWith('--'));
    if (lignes.length)
      tables.set(
        legende,
        lignes.map((c) => ({
          avant: c[0]!.slice(2),
          arriere: c[1]!.slice(2),
          affiche: parseFloat(c[3]!),
          seuil: parseFloat(c[4]!),
        }))
      );
  }
  return tables;
}

describe('REQ-UX-034 — mode clair et mode sombre de l’espace, jetons propres, mêmes seuils', () => {
  const charte = pairesDeLaCharte();

  it('REQ-UX-034 — la charte déclare ses paires pour les deux thèmes de l’espace et pour la console', () => {
    expect([...charte.keys()]).toEqual(['Espace, thème clair', 'Espace, thème sombre', 'Console']);
    expect(charte.get('Espace, thème clair')!.length).toBeGreaterThanOrEqual(30);
    expect(charte.get('Espace, thème sombre')!.length).toBe(
      charte.get('Espace, thème clair')!.length
    );
  });

  it('REQ-UX-034 — chaque paire passe son seuil dans chaque maquette de l’espace, dans les DEUX thèmes, et la charte dit vrai', () => {
    let mesures = 0;
    for (const f of MAQUETTES_ESPACE) {
      const html = lire(f);
      for (const [legende, motif] of [
        ['Espace, thème clair', CLAIR],
        ['Espace, thème sombre', SOMBRE],
      ] as const) {
        const j = jetons(html, motif);
        for (const p of charte.get(legende)!) {
          const r = rapport(j[p.avant]!, j[p.arriere]!);
          expect(r, `${f} ${legende} --${p.avant}/--${p.arriere}`).toBeGreaterThanOrEqual(p.seuil);
          expect(
            Math.abs(r - p.affiche),
            `${legende} : rapport affiché --${p.avant}/--${p.arriere}`
          ).toBeLessThan(0.01);
          mesures += 1;
        }
      }
    }
    expect(mesures).toBeGreaterThan(300);
  });

  it('REQ-UX-034 — les jetons sont les MÊMES d’une maquette de l’espace à l’autre, et PROPRES face à la console', () => {
    const reference = jetons(lire(MAQUETTES_ESPACE[0]!), CLAIR);
    for (const f of MAQUETTES_ESPACE) {
      expect(jetons(lire(f), CLAIR), f).toEqual(reference);
      expect(jetons(lire(f), SOMBRE), f).toEqual(jetons(lire(MAQUETTES_ESPACE[0]!), SOMBRE));
    }
    expect(MAQUETTES_CONSOLE).toHaveLength(2);
    const consoleClair = jetons(lire(MAQUETTES_CONSOLE[0]!), CLAIR);
    expect(consoleClair.fond).toBeDefined();
    expect(consoleClair.fond).not.toBe(reference.fond);
    expect(consoleClair.primaire).not.toBe(reference.primaire);
    for (const p of charte.get('Console')!) {
      expect(
        rapport(consoleClair[p.avant]!, consoleClair[p.arriere]!),
        `console --${p.avant}/--${p.arriere}`
      ).toBeGreaterThanOrEqual(p.seuil);
    }
  });

  it('REQ-UX-034 — TÉMOIN : un jeton assombri sous le seuil rougit la paire qui l’emploie', () => {
    const html = lire(MAQUETTES_ESPACE[0]!).replace(
      /(:root\s*\{[\s\S]*?--texte-doux:\s*)#[0-9a-fA-F]{6}/,
      '$1#b8b2aa'
    );
    const j = jetons(html, CLAIR);
    expect(rapport(j['texte-doux']!, j.fond!)).toBeLessThan(4.5);
  });
});

// ── (4) REQ-UX-017, moitié statique ──────────────────────────────────────────

describe('REQ-UX-017 — la moitié statique : autonomes, langue déclarée, champs étiquetés', () => {
  const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith('.html'));

  it('REQ-UX-017 — aucune maquette ne charge quoi que ce soit hors d’elle-même', () => {
    expect(toutes.length).toBe(9);
    for (const f of toutes) {
      const html = lire(f);
      expect(html.match(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi) ?? [], f).toEqual([]);
      expect(html.match(/url\(\s*["']?(?:https?:)?\/\//gi) ?? [], f).toEqual([]);
      expect(html.match(/@import/gi) ?? [], f).toEqual([]);
      expect(html, f).toMatch(/<html lang="fr"/);
      expect(html, f).toMatch(
        /<meta name="viewport" content="width=device-width, initial-scale=1"/
      );
    }
  });

  it('REQ-UX-017 — chaque champ d’une maquette de l’espace est dans une étiquette ou porte un nom accessible', () => {
    let champs = 0;
    for (const f of MAQUETTES_ESPACE) {
      const html = lire(f);
      for (const m of html.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
        champs += 1;
        const avant = html.slice(0, m.index);
        // Fermante cherchée en motif (Prettier la coupe) : cherchée en texte exact, elle n'était
        // jamais trouvée, et TOUT champ placé après une étiquette passait pour étiqueté.
        const derniere = (re: RegExp) =>
          Math.max(-1, ...[...avant.matchAll(re)].map((x) => x.index!));
        const dansUneEtiquette = derniere(/<label\b/g) > derniere(/<\/label\s*>/g);
        const nomme = /aria-label=|aria-labelledby=/.test(m[0]);
        expect(dansUneEtiquette || nomme, `${f} : ${m[0].slice(0, 80)}`).toBe(true);
      }
    }
    expect(champs).toBeGreaterThan(50);
  });
});
