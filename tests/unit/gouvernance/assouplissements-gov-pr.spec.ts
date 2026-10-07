// @req REQ-GOV-010
// @req REQ-GOV-011
// @req REQ-GOV-013
/**
 * assouplissements-gov-pr.spec.ts — GOV-145 : les trois assouplissements de `gov:pr` décidés par
 * Williams le 2026-10-04 (décision orale, #319, 6032352874) (points 2, 3 et 5). Chacun est exercé À DEUX FACES : ce qui passe désormais,
 * et ce qui doit continuer de rougir — un assouplissement sans son contre-témoin est une garde
 * qu'on a retirée sans le dire.
 *
 *   (2) une PR d'auteur ajoute à SES `paths` un chemin qui couvre un fichier qu'elle touche, et rien
 *       d'autre du registre (`ecartsDuRegistreDUnePrDAuteur`, `scripts/gates/gov-pr.ts`) ;
 *   (3) l'entrée de journal de la PR jugée sort de l'empreinte du diff propre, si ses titres
 *       n'ouvrent que son entrée (`empreinteDuPatch`, `lireRevues`, `scripts/lot/revues.ts`) ;
 *   (5) la case « Relecteur ≠ auteur » se dérive des revues — prouvé par `pnpm gov:pr --prove`
 *       (témoin et contre-témoin), qui tourne en porte A.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as LECTEUR from '../../../scripts/lot/revues';
import * as GARDE from '../../../scripts/gates/gov-pr';

const TETE = 'a'.repeat(40);
const AUTRE = 'b'.repeat(40);
const ELEVE: LECTEUR.Risque = { niveau: 'eleve', schema: false, raisons: ['zone argent'] };

function revue(corps: string, commit = TETE): LECTEUR.RevueBrute {
  return {
    user: { login: 'relecteur' },
    author_association: 'OWNER',
    state: 'COMMENTED',
    body: corps,
    commit_id: commit,
  };
}

// ── (3) l'entrée de journal de la PR jugée sort de l'empreinte ──────────────────────────────────

describe('REQ-GOV-011 — GOV-145 (3) : une ligne de journal de la PR ne périme plus ses accords', () => {
  let dir = '';
  let C = '';
  let Tjournal = '';
  let TautreEntree = '';
  let Tcode = '';
  const git = (...a: string[]): string =>
    execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const ecrire = (f: string, t: string): void => {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), t);
  };
  const empreinte = (sha: string, exclu: number | null): string | null =>
    LECTEUR.empreinteDuPatch(sha, { base: 'main', cwd: dir, journalExcluDeLaPr: exclu });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gov-145-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'temoin@example.invalid');
    git('config', 'user.name', 'temoin');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    ecrire('src/code.ts', 'ligne 1\nligne 2\n');
    ecrire('docs/journal/2026-10-pr-8.md', '## PR #8 — 2026-10-04 — une autre PR\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'pr');
    ecrire('src/code.ts', 'ligne 1 changee par la PR\nligne 2\n');
    ecrire('docs/journal/2026-10-pr-7.md', '## PR #7 — 2026-10-04 — la PR jugée\n\n**Fait.** une phrase.\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'pr');
    C = git('rev-parse', 'HEAD');
    // Une tête neuve qui n'ajoute qu'une ligne à SON entrée.
    ecrire(
      'docs/journal/2026-10-pr-7.md',
      '## PR #7 — 2026-10-04 — la PR jugée\n\n**Fait.** une phrase.\n\n**Tête neuve.** une ligne.\n'
    );
    git('commit', '-q', '-am', 'journal');
    Tjournal = git('rev-parse', 'HEAD');
    // Une tête qui réécrit l'entrée d'une AUTRE PR.
    git('checkout', '-q', '-b', 'pr-autre', C);
    ecrire('docs/journal/2026-10-pr-8.md', '## PR #8 — 2026-10-04 — une autre PR, réécrite\n');
    git('commit', '-q', '-am', 'autre entree');
    TautreEntree = git('rev-parse', 'HEAD');
    // Une tête qui change une ligne de code.
    git('checkout', '-q', '-b', 'pr-code', C);
    ecrire('src/code.ts', 'ligne 1 changee par la PR\nligne 2 changee aussi\n');
    git('commit', '-q', '-am', 'code');
    Tcode = git('rev-parse', 'HEAD');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('REQ-GOV-011 — SA ligne de journal : empreinte complète différente, empreinte sans son entrée ÉGALE', () => {
    expect(empreinte(C, null)).not.toBe(empreinte(Tjournal, null));
    expect(empreinte(C, 7)).toMatch(/^[0-9a-f]{40}$/);
    expect(empreinte(Tjournal, 7)).toBe(empreinte(C, 7));
  });

  it('REQ-GOV-011 — l’entrée d’une AUTRE PR reste dans l’empreinte : la réécrire périme', () => {
    expect(empreinte(TautreEntree, 7)).not.toBe(empreinte(C, 7));
  });

  it('REQ-GOV-011 — une ligne de code changée périme, entrée exclue ou non', () => {
    expect(empreinte(Tcode, 7)).not.toBe(empreinte(C, 7));
  });

  it('REQ-GOV-011 — le motif d’exclusion ne vise que la forme exacte de l’entrée de CE numéro', () => {
    expect(LECTEUR.motifDExclusionDuJournal(7)).toBe(
      ':(top,exclude,glob)docs/journal/[0-9][0-9][0-9][0-9]-[0-9][0-9]-pr-7.md'
    );
    expect(() => LECTEUR.motifDExclusionDuJournal(0)).toThrow();
    expect(() => LECTEUR.motifDExclusionDuJournal(1.5)).toThrow();
  });
});

describe('REQ-GOV-011 — GOV-145 (3) : la lecture des revues exclut l’entrée SEULEMENT si elle est la sienne', () => {
  const entree = 'docs/journal/2026-10-pr-7.md';
  // L'empreinte simulée : égale quand l'entrée de la 7 est exclue, différente sinon.
  const empreinteSimulee = (sha: string, exclu: number | null): string =>
    exclu === 7 ? 'e'.repeat(40) : (sha === AUTRE ? '1' : '2').repeat(40);
  const lire = (texte: string): LECTEUR.Lecture =>
    LECTEUR.lireRevues({
      revues: [
        revue('A09 · exactitude\nVerdict: accepte', AUTRE),
        revue('A09 · securite\nVerdict: accepte', AUTRE),
      ],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      numero: 7,
      // Un fichier de code dans le delta : la règle du journal (GOV-095) ne suffit pas, c'est
      // la règle `patch` qui décide.
      fichiersEntre: () => [entree, 'src/autre.ts'],
      lireALaTete: (_t, f) => (f === entree ? texte : null),
      empreinteDuPatch: empreinteSimulee,
    });

  it('REQ-GOV-011 — ses seuls titres : les deux accords SURVIVENT, exactitude comprise, et le DISENT', () => {
    const l = lire('## PR #7 — 2026-10-04 — la PR\n\n**Tête neuve.** une ligne.\n');
    expect(l.perimees).toEqual([]);
    expect(l.survivantes.map((s) => s.lentille).sort()).toEqual(['exactitude', 'securite']);
    expect(l.survivantes.every((s) => s.journalExclu === true)).toBe(true);
    expect(l.coche).toBe(true);
    expect(LECTEUR.direLaSurvivance(l.survivantes[0]!)).toContain('entrée de journal de la PR jugée exclue');
  });

  it('REQ-GOV-011 — un titre d’une AUTRE PR glissé dans son entrée : l’empreinte reste complète, tout PÉRIME', () => {
    const l = lire('## PR #7 — 2026-10-04 — la PR\n\n## PR #999 — 2026-10-04 — un faux\n');
    expect(l.perimees.map((v) => v.lentille).sort()).toEqual(['exactitude', 'securite']);
    expect(l.coche).toBe(false);
  });

  it('REQ-GOV-011 — numéro de la PR inconnu : aucune exclusion, tout PÉRIME', () => {
    const l = LECTEUR.lireRevues({
      revues: [revue('A09 · securite\nVerdict: accepte', AUTRE)],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => [entree, 'src/autre.ts'],
      lireALaTete: () => '## PR #7 — 2026-10-04 — la PR\n',
      empreinteDuPatch: empreinteSimulee,
    });
    expect(l.perimees.map((v) => v.lentille)).toEqual(['securite']);
  });

  it('REQ-GOV-011 — delta incalculable : aucune exclusion, tout PÉRIME', () => {
    const l = LECTEUR.lireRevues({
      revues: [revue('A09 · securite\nVerdict: accepte', AUTRE)],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      numero: 7,
      fichiersEntre: () => null,
      lireALaTete: () => '## PR #7 — 2026-10-04 — la PR\n',
      empreinteDuPatch: empreinteSimulee,
    });
    expect(l.perimees.map((v) => v.lentille)).toEqual(['securite']);
  });
});

// ── (2) l'auteur déclare ses chemins dans sa PR ─────────────────────────────────────────────────

describe('REQ-GOV-010 — GOV-145 (2) : une PR d’auteur n’ajoute que SES chemins au registre', () => {
  const tache = (id: string, zone: string, paths: string[], prose = 'une acceptation'): GARDE.Tache => {
    const brute = { id, zone, sensible: [], schema: false, pr: null, paths, tests: null, statut: 'a_faire', acceptance: prose };
    return GARDE.projeter([brute])[0]!;
  };
  const BASE = [
    tache('UX-P1-01', 'espace', ['src/app/(espace)/page.tsx']),
    tache('UX-P1-02', 'espace', ['src/app/(espace)/autre.tsx']),
    tache('GOV-012', 'gouvernance', ['docs/tasks.json']),
  ];
  const depotAvec = (taches: GARDE.Tache[]): GARDE.Depot => ({
    gabarit: '',
    codeowners: '',
    charte: '',
    fiches: [],
    architecte: '',
    taches,
  });
  const pr = (fichiers: string[]): GARDE.Pr => ({
    titre: 'feat(UX-P1-01): un écran',
    corps: '',
    labels: ['role:gardien-spec'],
    fichiers,
    revues: null,
    tachesBase: BASE,
  });
  const juger = (tete: GARDE.Tache[], fichiers: string[], titre = 'UX-P1-01'): string[] =>
    GARDE.ecartsDuRegistreDUnePrDAuteur(
      depotAvec(tete),
      pr(fichiers),
      titre,
      tete.filter((t) => t.id === titre)
    );
  const NEUF = 'src/app/(espace)/nouveau.tsx';

  it('REQ-GOV-010 — ajouter à SA tâche un chemin qui couvre un fichier qu’elle touche : AUCUN écart', () => {
    const tete = [tache('UX-P1-01', 'espace', ['src/app/(espace)/page.tsx', NEUF]), BASE[1]!, BASE[2]!];
    expect(juger(tete, ['docs/tasks.json', NEUF])).toEqual([]);
  });

  it('REQ-GOV-010 — un chemin ajouté qui ne couvre aucun fichier de la PR : écart NOMMÉ', () => {
    const tete = [tache('UX-P1-01', 'espace', ['src/app/(espace)/page.tsx', NEUF]), BASE[1]!, BASE[2]!];
    expect(juger(tete, ['docs/tasks.json']).join(' ')).toContain('ne couvrent aucun fichier');
  });

  it('REQ-GOV-010 — la tâche d’une AUTRE PR réécrite : écart NOMMÉ', () => {
    const tete = [BASE[0]!, tache('UX-P1-02', 'espace', ['src/app/(espace)/autre.tsx', NEUF]), BASE[2]!];
    expect(juger(tete, ['docs/tasks.json', NEUF]).join(' ')).toContain("UX-P1-02 est réécrite");
  });

  it('REQ-GOV-010 — un autre champ que paths réécrit sur SA tâche : écart NOMMÉ', () => {
    const tete = [
      tache('UX-P1-01', 'espace', ['src/app/(espace)/page.tsx', NEUF], 'une acceptation réécrite'),
      BASE[1]!,
      BASE[2]!,
    ];
    expect(juger(tete, ['docs/tasks.json', NEUF]).join(' ')).toContain('un autre champ que `paths`');
  });

  it('REQ-GOV-010 — un chemin RETIRÉ, une tâche versée ou supprimée : écarts NOMMÉS', () => {
    const retire = [tache('UX-P1-01', 'espace', [NEUF]), BASE[1]!, BASE[2]!];
    expect(juger(retire, ['docs/tasks.json', NEUF]).join(' ')).toContain('RETIRÉ');
    const versee = [...BASE, tache('UX-P1-99', 'espace', [])];
    expect(juger(versee, ['docs/tasks.json']).join(' ')).toContain('VERSÉE');
    const supprimee = [BASE[0]!, BASE[2]!];
    expect(juger(supprimee, ['docs/tasks.json']).join(' ')).toContain('SUPPRIMÉE');
  });

  it('REQ-GOV-010 — registre de base illisible : écart (échec FERMÉ)', () => {
    const tete = [tache('UX-P1-01', 'espace', ['src/app/(espace)/page.tsx', NEUF]), BASE[1]!, BASE[2]!];
    const ecarts = GARDE.ecartsDuRegistreDUnePrDAuteur(
      depotAvec(tete),
      { ...pr(['docs/tasks.json', NEUF]), tachesBase: null },
      'UX-P1-01',
      [tete[0]!]
    );
    expect(ecarts.join(' ')).toContain('illisible');
  });

  it('REQ-GOV-010 — une PR de la zone gouvernance n’est pas bornée ici ; une PR sans registre non plus', () => {
    const versee = [...BASE, tache('UX-P1-99', 'espace', [])];
    expect(juger(versee, ['docs/tasks.json'], 'GOV-012')).toEqual([]);
    expect(juger(versee, ['src/app/(espace)/page.tsx'])).toEqual([]);
  });
});

// ── (5) la case « Relecteur ≠ auteur » se dérive des revues ─────────────────────────────────────

describe('REQ-GOV-013 — GOV-145 (5) : la case « Relecteur ≠ auteur » compte remplie quand les revues la cochent', () => {
  const CASES = [
    '- [x] Les REQ couvertes sont listées dans `Couvre:`.',
    '- [x] Chaque REQ a son test.',
    "- [ ] Relecteur ≠ auteur : les deux lentilles, l'auteur ne s'auto-approuve pas.",
    '- [x] ADR ouverte si une décision de conception a été prise.',
  ];

  it('REQ-GOV-013 — revues qui la justifient : aucune case vide', () => {
    expect(GARDE.casesVidesDeLaDod(CASES, true)).toBe(0);
  });

  it('REQ-GOV-013 — revues qui ne la justifient pas : la case reste vide', () => {
    expect(GARDE.casesVidesDeLaDod(CASES, false)).toBe(1);
  });

  it('REQ-GOV-013 — seule CETTE case se dérive : une autre case vide reste vide, revues ou non', () => {
    const autre = [...CASES.slice(0, 2), '- [ ] ADR ouverte si une décision a été prise.'];
    expect(GARDE.casesVidesDeLaDod(autre, true)).toBe(1);
  });
});

// ── la fin des rattrapages de chemins (décision de Williams du 2026-10-05, #319, point 3) ──────────

describe('REQ-GOV-010 — GOV-145 : sans rattrapage, une PR d’auteur qui n’ajoute que ses chemins se passe du label', () => {
  const tache = (id: string, zone: string, paths: string[]): GARDE.Tache =>
    GARDE.projeter([{ id, zone, sensible: [], schema: false, pr: null, paths, tests: null, statut: 'a_faire', acceptance: 'a' }])[0]!;
  const depot = (taches: GARDE.Tache[]): GARDE.Depot => ({ gabarit: '', codeowners: '', charte: '', fiches: [], architecte: '', taches });
  const pr = (fichiers: string[]): GARDE.Pr => ({ titre: 't', corps: '', labels: [], fichiers, revues: null, tachesBase: null });
  const TETE = [tache('UX-P1-01', 'espace', ['src/app/x.tsx']), tache('GOV-012', 'gouvernance', ['docs/tasks.json'])];

  it('REQ-GOV-010 — registre touché, tâche d’auteur, AUCUN écart : le label n’est plus exigé', () => {
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(['docs/tasks.json', 'src/app/x.tsx']), 'UX-P1-01', [])).toBe(true);
  });

  it('REQ-GOV-010 — un seul écart, une PR de gouvernance, un titre inconnu ou sans tâche : le label reste exigé', () => {
    const f = ['docs/tasks.json'];
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(f), 'UX-P1-01', ['UX-P1-02 est réécrite'])).toBe(false);
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(f), 'GOV-012', [])).toBe(false);
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(f), 'UX-P1-99', [])).toBe(false);
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(f), null, [])).toBe(false);
  });

  it('REQ-GOV-010 — une PR qui ne touche pas le registre n’en tire aucune levée', () => {
    expect(GARDE.cheminsDAuteurSeuls(depot(TETE), pr(['src/app/x.tsx']), 'UX-P1-01', [])).toBe(false);
  });
});

// ── la relecture proportionnée (#319, 5988252245, point 2, amendée le 2026-10-07, 6032068586) ──────

describe('REQ-GOV-011 — GOV-145 : une lentille pour ce qui n’affiche aucune donnée, deux pour un écran', () => {
  it('REQ-GOV-011 — maquette, texte et micro-copy : UNE lentille possible', () => {
    expect(LECTEUR.fichierAUneLentille('docs/maquettes/contestation.html')).toBe(true);
    expect(LECTEUR.fichierAUneLentille('src/content/micro-copy/espace/contestation.ts')).toBe(true);
    expect(LECTEUR.ZONES_A_UNE_LENTILLE).toEqual(expect.arrayContaining(['espace', 'console']));
  });

  it('REQ-GOV-011 — un écran qui affiche ou modifie des données reste à DEUX lentilles', () => {
    for (const f of [
      'src/app/(espace)/contestation/page.tsx',
      'src/components/console/mise-en-demeure.tsx',
      'src/app/(console)/console/apporteurs/[id]/actions.ts',
      'src/server/console/navigation.ts',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
    }
  });

  it('REQ-GOV-011 — la fiche de validation de Williams et les gardes « mobile first » ne passent jamais à une lentille', () => {
    for (const f of [
      'docs/maquettes/VALIDATION.md',
      'scripts/gates/ux-reflow.ts',
      'tests/e2e/espace/mobile.spec.ts',
      'tests/unit/qualite/budgets-mobiles.spec.ts',
      'playwright.config.ts',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
    }
  });
});

describe('REQ-GOV-011 — GOV-145 : les relevés de la sécurité restent à deux lentilles', () => {
  it('REQ-GOV-011 — courriels, cartes des routes, audit de sécurité et procédures d’exploitation : DEUX lentilles', () => {
    for (const f of [
      'src/content/micro-copy/courriels/lien-magique.ts',
      'docs/CONSOLE-ROUTES.md',
      'docs/ESPACE-ROUTES.md',
      'docs/securite/audit.md',
      'docs/runbooks/restauration.md',
    ]) {
      expect(LECTEUR.fichierAUneLentille(f), f).toBe(false);
    }
  });

  it('REQ-GOV-011 — une maquette seule garde UNE lentille, sa fiche de validation en exige deux', () => {
    expect(LECTEUR.fichierAUneLentille('docs/maquettes/x.html')).toBe(true);
    expect(LECTEUR.fichierAUneLentille('docs/maquettes/VALIDATION.md')).toBe(false);
  });
});
