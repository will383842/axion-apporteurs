// @req REQ-GOV-017
//
// REQ-GOV-017 est DURCIE par REQ-JUR-037 (phase 0, `JUR-T26`), qui étend la liste noire à tout ce
// qu'un apporteur voit ou reçoit et y ajoute le vocabulaire du droit social. Les deux textes sont
// la SOURCE de `src/domain/lexique/lexique-interdit.ts` : le §« la SSOT est une copie TENUE »
// ci-dessous les relit dans `docs/requirements.json` et refuse que la constante s'en éloigne.
/**
 * `lexique.spec.ts` — ce qui rend la gate lexicale opposable (GOV-013).
 *
 * CE QU'IL EXERCE, ET DANS QUEL SENS.
 *   1. LA DÉRIVATION (RM-01) : aucun terme n'est tapé deux fois. Les mots interdits se lisent dans
 *      le texte de REQ-GOV-017 et de REQ-JUR-037, au registre, et la constante `LEXIQUE_INTERDIT`
 *      doit les couvrir TOUS. Une exigence qui change et une constante qui ne bouge pas : rouge.
 *   2. LA TOURNURE, PAS LE MOT : la phrase de l'ADR « valeurs du monde réel » — « elle n'institue aucun
 *      mandat, aucun objectif, aucun quota » — reste VERTE, et la même phrase privée de ses
 *      négations rougit. Le second test est ce qui donne sa valeur au premier : un vert isolé ne
 *      distingue pas « la tournure est reconnue » de « la sonde ne mesure rien ».
 *   3. LES POSITIONS LIMITES : huit positions, dont la fin de phrase collée au point — celle où
 *      `gov:identifiants` est aveugle, et où ses propres témoins ne vont jamais.
 *   4. LE PÉRIMÈTRE : un motif attendu qui ne balaie plus rien est une faute, pas un succès.
 *   5. L'ACCEPTATION de la tâche : les deux modes de la gate, lancés comme la CI les lance.
 *
 * CE QU'IL NE FAIT PAS. Il ne juge pas le contenu des ADR existants : c'est le travail du mode en
 * ligne de la gate, exercé ici par un seul test d'acceptation. Et il n'invente aucun terme — tout
 * ce qu'il attend, il le lit dans le registre.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  ADR,
  COURRIEL,
  ESPACE,
  MICRO,
  MOTIFS,
  PHRASE_VALEURS_DU_MONDE_REEL,
  TEMOINS_POSITIONS,
  controler,
  estDenegation,
  motifDeLaForme,
  porteeDuFichier,
  vueDeFixture,
  vueDuDepot,
} from '../../../scripts/gates/lexique-apporteurs';
import {
  EXCEPTIONS_DECLAREES,
  LEXIQUE_INTERDIT,
  PORTEURS_DU_LEXIQUE,
  TERMES_CANONIQUES,
  toutesLesFormes,
} from '../../../src/domain/lexique/lexique-interdit';

const SCRIPT = 'scripts/gates/lexique-apporteurs.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
const familles = (fichiers: Parameters<typeof vueDeFixture>[0]): string[] =>
  controler(vueDeFixture(fichiers)).fautes.map((f) => f.famille);

/** Un terme est COUVERT si l'une des formes de la SSOT le reconnaît — au sens de la gate. */
function couvert(terme: string): boolean {
  return toutesLesFormes().some((forme) => motifDeLaForme(forme).test(terme));
}

// ── 1. la SSOT est une copie TENUE, pas une copie livrée à elle-même (RM-01) ──

type Registre = { exigences: { id: string; texte: string; source: string }[] };

function exigence(id: string): { texte: string; source: string } {
  const registre = JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as Registre;
  const e = registre.exigences.find((x) => x.id === id);
  if (!e) throw new Error(`${id} est absente du registre : le test ne sait plus à quoi comparer.`);
  return { texte: e.texte, source: e.source };
}

/** Les termes entre guillemets de REQ-GOV-017 — sa liste noire, telle qu'elle l'écrit. */
function termesDeGov017(): string[] {
  const { texte } = exigence('REQ-GOV-017');
  const entete = texte.slice(0, texte.indexOf(')'));
  return [...entete.matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]!);
}

/** Les termes que REQ-JUR-037 énumère après « refuse : », guillemets compris. */
function termesDeJur037(): string[] {
  const { texte } = exigence('REQ-JUR-037');
  const liste = texte.slice(texte.indexOf('refuse :') + 'refuse :'.length);
  return liste
    .split(',')
    .map((t) => t.replace(/[«»*.]/g, '').trim())
    .filter((t) => t.length > 0);
}

/** Le vocabulaire du droit social, ajouté à REQ-JUR-037 le 2026-09-03. */
function termesDuDroitSocial(): string[] {
  const { source } = exigence('REQ-JUR-037');
  const depart = source.indexOf('peut les lire —');
  const liste = source.slice(depart + 'peut les lire —'.length);
  return liste
    .slice(0, liste.indexOf('. '))
    .split(',')
    .map((t) => t.replace(/[«»*]/g, '').trim())
    .filter((t) => t.length > 0);
}

describe('la SSOT du lexique est DÉRIVÉE des exigences, jamais inventée (REQ-GOV-017, RM-01)', () => {
  it('REQ-GOV-017 : les six termes que l’exigence met entre guillemets sont couverts', () => {
    const termes = termesDeGov017();
    // Une lecture qui ne rend rien n'est pas « rien à dire » : c'est une source illisible, et
    // sans cette borne le `every` ci-dessous passerait sur un tableau vide.
    expect(termes.length).toBeGreaterThanOrEqual(6);
    for (const terme of termes) expect([terme, couvert(terme)]).toEqual([terme, true]);
  });

  it('REQ-JUR-037 : les termes énumérés après « refuse : » sont tous couverts', () => {
    const termes = termesDeJur037();
    expect(termes.length).toBeGreaterThanOrEqual(20);
    for (const terme of termes) expect([terme, couvert(terme)]).toEqual([terme, true]);
  });

  it('REQ-JUR-037 étendue : le vocabulaire du droit social est couvert', () => {
    const termes = termesDuDroitSocial();
    expect(termes.length).toBeGreaterThanOrEqual(14);
    for (const terme of termes) expect([terme, couvert(terme)]).toEqual([terme, true]);
  });

  it('les trois noms canoniques sont ceux que REQ-JUR-037 impose', () => {
    const { source } = exigence('REQ-JUR-037');
    for (const nom of Object.values(TERMES_CANONIQUES)) expect(source).toContain(nom);
  });

  it('un terme que les exigences n’écrivent pas ne se glisse pas dans la SSOT', () => {
    // Contrôle positif de la lecture ci-dessus : si `couvert()` répondait « oui » à tout, les
    // quatre tests précédents ne diraient rien. « prospect » n'est interdit par aucune exigence.
    expect(couvert('prospect')).toBe(false);
    expect(couvert('apporteur')).toBe(false);
  });

  it('la gate IMPORTE la liste, elle ne la recopie pas (docs/gates.json, RM-01)', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).toContain("from '../../src/domain/lexique/lexique-interdit'");
    expect(source).toContain('LEXIQUE_INTERDIT');
    // Aucune redéclaration : le mot-clé `formes:` n'appartient qu'à la SSOT.
    expect(source).not.toMatch(/^\s*formes:/m);
  });

  it('la SSOT reste PURE : aucune I/O sous src/domain/** (docs/CONVENTIONS.md §3)', () => {
    const source = readFileSync(PORTEURS_DU_LEXIQUE[0], 'utf8');
    expect(source).not.toMatch(/from 'node:/);
    expect(source).not.toMatch(/readFileSync|execFileSync|new Date\(/);
    expect(source).toMatch(/as const/);
  });
});

// ── 2. la tournure, pas le mot — le cœur de la tâche ──────────────────────────

describe('la négation qui PROTÈGE passe, la prescription rougit (REQ-GOV-017)', () => {
  it("la phrase de l'ADR « valeurs du monde réel » reste VERTE, verbatim", () => {
    const rapport = controler(vueDeFixture([ADR(PHRASE_VALEURS_DU_MONDE_REEL)]));
    expect(rapport.fautes).toEqual([]);
    // Le vert ne suffit pas : il faut qu'il vienne de la TOURNURE. Deux termes interdits sont
    // dans cette phrase — « objectif » et « quota » —, la garde les a VUS et les a exemptés.
    expect(rapport.occurrences).toBeGreaterThanOrEqual(2);
    expect(rapport.exemptions.filter((e) => e.genre === 'denegation').length).toBeGreaterThanOrEqual(2);
  });

  it('la MÊME phrase privée de ses négations rougit — la sonde mesure bien', () => {
    const sansNegation = PHRASE_VALEURS_DU_MONDE_REEL.replace("n'institue aucun mandat, aucun", 'institue un mandat, un').replace(
      'aucun quota',
      'un quota'
    );
    expect(familles([ADR(sansNegation)])).toEqual(expect.arrayContaining(['objectif', 'quota']));
  });

  it('« ni … ni … », « ne fixe aucun », « ce n’est pas un » : trois dénégations vertes', () => {
    expect(familles([ADR('Le contrat ne connaît ni quota ni classement ni objectif.')])).toEqual([]);
    expect(familles([ADR('La Société ne fixe aucun objectif et ne mesure aucun quota.')])).toEqual([]);
    expect(familles([ADR("Le seuil de versement n'est pas un objectif.")])).toEqual([]);
  });

  it('une CITATION en prose est verte, mais les guillemets ne sauvent pas la micro-copy', () => {
    expect(familles([ADR('Le mot « classement » figure au registre du vocabulaire fermé.')])).toEqual([]);
    // La `fixtureRouge` du registre, à la lettre : un libellé factice en micro-copy.
    expect(familles([MICRO('{ "entete": "« objectif du mois »" }')])).toContain('objectif');
  });

  it('la SSOT elle-même a le droit d’écrire les termes — et c’est bien son exemption qui la sauve', () => {
    const texte = "formes: ['objectif', 'objectifs', 'quota', 'classement'],";
    const porteur = controler(vueDeFixture([{ chemin: PORTEURS_DU_LEXIQUE[0], contenu: texte }]));
    expect(porteur.fautes).toEqual([]);
    expect(porteur.exemptions.every((e) => e.genre === 'porteur')).toBe(true);
    expect(porteur.exemptions.length).toBeGreaterThanOrEqual(4);
    // Le même texte ailleurs rougit : le vert ci-dessus n'était pas un vert de cécité.
    expect(familles([{ chemin: 'docs/adr/9998-copie.md', contenu: texte }]).length).toBeGreaterThan(0);
  });

  it('la dénégation ne franchit ni la ponctuation forte ni la cellule de tableau', () => {
    // Un « aucun » d'une autre proposition n'exempte rien : sinon la garde deviendrait muette
    // dès qu'une phrase est longue, ce qui est précisément le cas où une consigne se glisse.
    expect(estDenegation('Aucune règle ne le dit. Votre ')).toBe(false);
    expect(estDenegation('| aucun | ')).toBe(false);
    expect(estDenegation("elle n'institue aucun mandat, aucun ")).toBe(true);
  });

  it('un mot qui CONTIENT une forme n’est pas cette forme', () => {
    expect(familles([ESPACE('<p>La topologie du réseau, une rupture brutale, un primeur imprimé.</p>')])).toEqual([]);
  });
});

// ── 3. les positions limites — la leçon de gov:identifiants ───────────────────

describe('la garde voit le terme à TOUTES les positions (REQ-GOV-017)', () => {
  it('les huit positions limites rougissent, y compris collée au point final', () => {
    expect(TEMOINS_POSITIONS.length).toBeGreaterThanOrEqual(8);
    for (const p of TEMOINS_POSITIONS) {
      expect([p.position, familles([ADR(p.ligne)]).length > 0]).toEqual([p.position, true]);
    }
  });

  it('la position que gov:identifiants rate est explicitement couverte', () => {
    expect(TEMOINS_POSITIONS.map((p) => p.position)).toContain('fin de phrase, collé au point');
    expect(familles([ADR('Le tableau affiche votre objectif.')])).toEqual(['objectif']);
  });
});

// ── 4. le périmètre, les portées et les exceptions ────────────────────────────

describe('le périmètre est celui de REQ-GOV-017, et un périmètre vide est une faute', () => {
  it('les cinq lieux nommés par l’exigence sont des motifs de la gate', () => {
    const noms = MOTIFS.map((m) => m.nom);
    expect(noms).toEqual(expect.arrayContaining(['prisma/**', 'messages/**', 'src/**/*.tsx', 'docs/adr/**']));
    expect(noms.some((n) => /e-mail/.test(n))).toBe(true);
  });

  it('un motif attendu qui ne balaie plus rien rougit', () => {
    const vide = {
      fichiers: [],
      comptes: MOTIFS.map((m) => ({ motif: m.nom, nombre: 0, attendu: m.attendu })),
      exceptions: [],
    };
    expect(controler(vide).fautes.map((f) => f.famille)).toContain('perimetre_vide');
  });

  it('le vocabulaire large de REQ-JUR-037 ne s’applique qu’à ce qu’un apporteur lit', () => {
    expect(porteeDuFichier('src/app/(espace)/tableau.tsx')).toBe('apporteur');
    expect(porteeDuFichier('docs/adr/0001-pile-technique.md')).toBe('depot');
    expect(porteeDuFichier('docs/REQUIREMENTS.md')).toBe(null);
    // « niveau » est un mot courant : refusé côté apporteur, toléré dans un ADR interne.
    expect(familles([ADR('Le stub est décidé au niveau du singleton.')])).toEqual([]);
    expect(familles([ESPACE('<p>Vous êtes au niveau argent</p>')])).toContain('palmares');
  });

  it('un e-mail qui emprunte le vocabulaire de la paie rougit, le relevé de commissions non', () => {
    expect(familles([COURRIEL('<h1>Votre bulletin de commission du mois de mars</h1>')])).toContain('droit_social');
    expect(
      familles([COURRIEL("Le relevé de commissions n'est pas un bulletin de paie : il ne porte ni brut, ni net à payer.")])
    ).toEqual([]);
  });

  it('une exception non justifiée est refusée, une exception justifiée est honorée', () => {
    const molle = controler({
      fichiers: [],
      comptes: MOTIFS.map((m) => ({ motif: m.nom, nombre: m.attendu ? 1 : 0, attendu: m.attendu })),
      exceptions: [{ chemin: 'docs/adr/9999-temoin.md', forme: 'objectif', justification: 'ok', reference: '', poseeLe: 'hier' }],
    });
    expect(molle.fautes.map((f) => f.famille)).toEqual(['exception_sans_justification']);

    const ferme = controler(
      vueDeFixture(
        [ADR('Le classement des apporteurs, hérité du document source, est cité tel quel.')],
        [
          {
            chemin: 'docs/adr/9999-temoin.md',
            forme: 'classement',
            justification: "citation littérale du document d'origine, conservée pour la traçabilité",
            reference: 'REQ-GOV-017',
            poseeLe: '2026-09-05',
          },
        ]
      )
    );
    expect(ferme.fautes).toEqual([]);
    expect(ferme.exemptions.map((e) => e.genre)).toEqual(['exception']);
  });

  it('aucune exception n’est déclarée aujourd’hui, et celles qui viendront seront justifiées', () => {
    for (const e of EXCEPTIONS_DECLAREES) {
      expect(e.justification.trim().length).toBeGreaterThanOrEqual(20);
      expect(e.poseeLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ── 5. acceptation : la gate telle que la CI la lance ─────────────────────────

describe('acceptation de GOV-013 — les deux modes de la gate (REQ-GOV-017)', () => {
  it('`gov:lexique` juge le dépôt réel, sort 0, et DIT ce qu’il a balayé', () => {
    const { code, sortie } = lancer();
    expect(sortie).toMatch(/docs\/adr\/\*\* : \d+ \(attendu\)/);
    expect(sortie).toContain('fichiers SUIVIS par git');
    expect(code).toBe(0);
  });

  it('`gov:lexique --prove` sort 0 : chaque famille a été vue rougir', () => {
    const { code, sortie } = lancer('--prove');
    expect(sortie).toContain('positions limites rougissent');
    expect(sortie).toContain('valeurs du monde réel');
    expect(code).toBe(0);
  });

  it('la vue du dépôt ne lit que des fichiers suivis par git', () => {
    const suivis = new Set(execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean));
    for (const f of vueDuDepot().fichiers) expect([f.chemin, suivis.has(f.chemin)]).toEqual([f.chemin, true]);
  });

  it('les neuf familles du lexique portent chacune une exigence et une raison', () => {
    expect(LEXIQUE_INTERDIT.length).toBe(9);
    for (const f of LEXIQUE_INTERDIT) {
      expect(f.reqs.length).toBeGreaterThanOrEqual(1);
      expect(f.pourquoi.length).toBeGreaterThan(20);
      expect(f.formes.length).toBeGreaterThanOrEqual(2);
    }
  });
});
