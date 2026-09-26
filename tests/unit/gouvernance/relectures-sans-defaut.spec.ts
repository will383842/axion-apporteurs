// @req REQ-GOV-011
// @req REQ-GOV-013
// @req REQ-GOV-032
// @req REQ-QA-002
/**
 * relectures-sans-defaut.spec.ts — GOV-101 : supprimer les tours de relecture qui ne corrigent
 * aucun défaut.
 *
 * LA MESURE QUI L'OUVRE (orchestrateur, 2026-09-26) : environ neuf PR en douze heures, trois à
 * quatre tours de relecture par PR, et près de la moitié de ces tours ne corrigent RIEN — ils
 * rejouent un accord qu'une fusion de `main` a périmé sur un patch identique, ou un conflit de vue
 * dérivée, ou un cliquet littéral que deux branches ont incrémenté chacune de son côté.
 *
 * CE QUE CE FICHIER EXERCE, UN BLOC PAR LIVRABLE, TOUJOURS À DEUX FACES :
 *
 *   1. DEUX LENTILLES PARTOUT (décision de Will du 2026-09-26) : `exactitude` et `securite`, plus
 *      l'avis `schema` de l'architecte dès que la PR touche au schéma. Ni `simplicite`, ni
 *      `mutation` ne sont plus exigées d'un agent.
 *   2. UN ACCORD SURVIT À UNE FUSION DE `main` QUI NE CHANGE PAS LE PATCH de la PR — mesuré sur un
 *      VRAI dépôt git jetable : fusion propre → conservé ; une ligne changée dans un fichier de la
 *      PR → périmé ; conflit résolu en modifiant une ligne de la PR → périmé.
 *   3. `pnpm vues:fusion` : un conflit qui ne porte QUE sur des vues dérivées se résout en les
 *      RÉGÉNÉRANT ; un conflit sur un autre fichier abandonne la fusion et le nomme.
 *   4. `pnpm pre-gate` : les étapes RAPIDES de la porte A, lues dans `ci.yml`, sans la suite.
 *   5. `pnpm mutation:pr` : Stryker, en bac à sable, sur les seuls fichiers mutables de la PR.
 *   6. Le cliquet des sorties non nulles : une déclaration ne disparaît qu'avec son fichier.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  empreinteDuPatch,
  fautesDesRevues,
  lentillesExigees,
  lireRevues,
  type RevueBrute,
  type Risque,
} from '../../../scripts/lot/revues';
import { VUES_DERIVEES, estUneVueDerivee } from '../../../scripts/vues/vues';
import { fusionnerMain, trierLesConflits } from '../../../scripts/vues/fusion';
import { etapesDeLaPorteA } from '../../../scripts/prevol';
import { ETAPES_LENTES, etapesRapides } from '../../../scripts/prevol';
import {
  configDeLaPr,
  desactivationsDeStryker,
  fichiersAMuter,
  passer,
} from '../../../scripts/mutation/pr';
import { declarationsDeLaBase, declarationsRetirees } from './declarations-de-sorties';

// ── outils de témoin ────────────────────────────────────────────────────────────────────────────

const ELEVE: Risque = { niveau: 'eleve', schema: false, raisons: ['zone argent'] };
const SCHEMA: Risque = { niveau: 'eleve', schema: true, raisons: ['la PR touche au schéma'] };
const ORDINAIRE: Risque = { niveau: 'ordinaire', schema: false, raisons: ['zone gouvernance'] };

const TETE = 'a'.repeat(40);
const AUTRE = 'b'.repeat(40);

function revue(corps: string, commit = TETE): RevueBrute {
  return {
    user: { login: 'relecteur' },
    author_association: 'OWNER',
    state: 'COMMENTED',
    body: corps,
    commit_id: commit,
  };
}

/** Un vrai dépôt git jetable : la mesure (`git patch-id`) ne se prouve pas contre une simulation. */
function depot(): {
  dir: string;
  git: (...a: string[]) => string;
  ecrire: (f: string, t: string) => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'gov-101-'));
  const git = (...a: string[]): string =>
    execFileSync('git', a, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const ecrire = (f: string, t: string): void => {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), t);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'temoin@example.invalid');
  git('config', 'user.name', 'temoin');
  git('config', 'commit.gpgsign', 'false');
  // Sous Windows, `core.autocrlf` réécrirait les fins de ligne à l'extraction : le témoin
  // chercherait un saut de ligne nu dans un fichier en CRLF et ne changerait rien.
  git('config', 'core.autocrlf', 'false');
  return { dir, git, ecrire };
}

const LIGNES = (n: number, prefixe: string): string =>
  Array.from({ length: n }, (_, i) => `${prefixe} ${i + 1}`).join('\n') + '\n';

// ── 1. deux lentilles partout ───────────────────────────────────────────────────────────────────

describe('REQ-GOV-011 — deux lentilles partout, exactitude et securite (décision de Will du 2026-09-26)', () => {
  it('REQ-GOV-011 — une PR de risque ÉLEVÉ n’exige plus que exactitude et securite', () => {
    expect([...lentillesExigees(ELEVE).toutes]).toEqual(['exactitude', 'securite']);
  });

  it('REQ-GOV-011 — une PR de schéma exige EN PLUS l’avis schema de l’architecte', () => {
    expect([...lentillesExigees(SCHEMA).toutes]).toEqual(['exactitude', 'securite', 'schema']);
  });

  it('REQ-GOV-011 — ordinaire et élevé exigent la même chose : le risque ne compte plus de lentille', () => {
    expect([...lentillesExigees(ORDINAIRE).toutes]).toEqual([...lentillesExigees(ELEVE).toutes]);
  });

  it('REQ-GOV-011 — une PR élevée cochée par DEUX accords sur la tête ; sans securite, elle ne l’est pas', () => {
    const deux = lireRevues({
      revues: [
        revue('A09 · exactitude\nVerdict: accepte'),
        revue('A09 · securite\nVerdict: accepte'),
      ],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(deux.manquantes).toEqual([]);
    expect(deux.coche).toBe(true);
    const une = lireRevues({
      revues: [revue('A09 · exactitude\nVerdict: accepte')],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
    });
    expect(une.manquantes).toEqual(['securite']);
    expect(une.coche).toBe(false);
  });

  it('REQ-GOV-011 — le refus de securite reste un VETO, et aucune faute ne réclame plus un avis mutation', () => {
    const lecture = lireRevues({
      revues: [
        revue('A09 · exactitude\nVerdict: accepte'),
        revue('A09 · securite\nVerdict: refuse'),
      ],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
    });
    const fautes = fautesDesRevues(lecture, { tacheSensible: true });
    expect(fautes.map((f) => f.famille)).toContain('lentille_en_refus');
    expect(fautes[0]!.message).toContain('bloque à lui seul');
    const vide = fautesDesRevues(
      lireRevues({
        revues: [revue('A09 · exactitude\nVerdict: accepte')],
        risque: ELEVE,
        tete: TETE,
        auteurPoste: 'A05',
      }),
      { tacheSensible: false }
    );
    expect(vide.map((f) => f.message).join('\n')).not.toMatch(/mutation/);
  });
});

// ── 2. un accord survit à une fusion de main qui ne change pas le patch ────────────────────────

describe('REQ-GOV-011 — un accord survit à une fusion de main sans changement du patch de la PR', () => {
  let d: ReturnType<typeof depot>;
  let T = '';
  let Tfusion = '';
  let Tligne = '';
  let Tconflit = '';
  let Tvue = '';

  beforeAll(() => {
    d = depot();
    d.ecrire('src/code.ts', LIGNES(30, 'ligne'));
    d.ecrire('src/autre.ts', LIGNES(30, 'autre'));
    d.ecrire('docs/PLAN-STATE.md', 'etat 0\n');
    d.git('add', '-A');
    d.git('commit', '-q', '-m', 'base');
    // La PR : une ligne de src/code.ts, et sa vue régénérée.
    d.git('checkout', '-q', '-b', 'pr');
    d.ecrire(
      'src/code.ts',
      LIGNES(30, 'ligne').replace('ligne 5\n', 'ligne 5 changee par la PR\n')
    );
    d.ecrire('docs/PLAN-STATE.md', 'etat PR\n');
    d.git('commit', '-q', '-am', 'pr');
    T = d.git('rev-parse', 'HEAD');
    // main avance AILLEURS, et sur la même vue.
    d.git('checkout', '-q', 'main');
    d.ecrire('src/autre.ts', LIGNES(30, 'autre').replace('autre 20\n', 'autre 20 sur main\n'));
    d.ecrire('docs/PLAN-STATE.md', 'etat main\n');
    d.git('commit', '-q', '-am', 'main avance');
    // La PR fusionne main : conflit sur la vue SEULE, résolu en la régénérant.
    d.git('checkout', '-q', 'pr');
    try {
      d.git('merge', '-q', '--no-edit', 'main');
    } catch {
      d.ecrire('docs/PLAN-STATE.md', 'etat regenere\n');
      d.git('add', 'docs/PLAN-STATE.md');
      d.git('commit', '-q', '--no-edit');
    }
    Tfusion = d.git('rev-parse', 'HEAD');
    // Une vue régénérée de plus, rien d'autre.
    d.ecrire('docs/PLAN-STATE.md', 'etat regenere encore\n');
    d.git('commit', '-q', '-am', 'vue');
    Tvue = d.git('rev-parse', 'HEAD');
    // Une ligne changée dans un fichier de la PR.
    d.git('checkout', '-q', '-b', 'pr-ligne', Tfusion);
    d.ecrire(
      'src/code.ts',
      readFileSync(join(d.dir, 'src/code.ts'), 'utf8').replace('ligne 25\n', 'ligne 25 ajoutee\n')
    );
    d.git('commit', '-q', '-am', 'une ligne de plus');
    Tligne = d.git('rev-parse', 'HEAD');
    // Un conflit sur la ligne de la PR, résolu en MODIFIANT cette ligne.
    d.git('checkout', '-q', 'main');
    d.ecrire(
      'src/code.ts',
      readFileSync(join(d.dir, 'src/code.ts'), 'utf8').replace('ligne 5\n', 'ligne 5 sur main\n')
    );
    d.git('commit', '-q', '-am', 'main touche la ligne de la PR');
    d.git('checkout', '-q', '-b', 'pr-conflit', Tfusion);
    try {
      d.git('merge', '-q', '--no-edit', 'main');
    } catch {
      d.ecrire(
        'src/code.ts',
        LIGNES(30, 'ligne').replace('ligne 5\n', 'ligne 5 resolue autrement\n')
      );
      d.git('add', 'src/code.ts');
      d.git('commit', '-q', '--no-edit');
    }
    Tconflit = d.git('rev-parse', 'HEAD');
  });
  afterAll(() => rmSync(d.dir, { recursive: true, force: true }));

  const empreinte = (sha: string, base = 'main'): string | null =>
    empreinteDuPatch(sha, { base, cwd: d.dir });

  it('REQ-GOV-011 — la mesure rend une empreinte, et null sur un sha inconnu (échec FERMÉ)', () => {
    expect(empreinte(T, `${T}~1`)).toMatch(/^[0-9a-f]{40}$/);
    expect(empreinte('c'.repeat(40))).toBeNull();
    expect(empreinte('pas-un-sha')).toBeNull();
  });

  it('REQ-GOV-011 — fusion de main SANS changement du patch → même empreinte, hors vues dérivées', () => {
    // La base de T est l'ancien main : on la lit sur la base de fusion de T avec `main`.
    expect(empreinte(Tfusion)).not.toBeNull();
    expect(empreinte(T)).toBe(empreinte(Tfusion));
    expect(empreinte(Tvue)).toBe(empreinte(T));
  });

  it('REQ-GOV-011 — une ligne changée dans un fichier de la PR → autre empreinte', () => {
    expect(empreinte(Tligne)).not.toBe(empreinte(Tfusion));
  });

  it('REQ-GOV-011 — un conflit résolu en modifiant une ligne de la PR → autre empreinte', () => {
    expect(empreinte(Tconflit)).not.toBeNull();
    expect(empreinte(Tconflit)).not.toBe(empreinte(Tfusion));
  });

  it('REQ-GOV-011 — la garde : l’accord SURVIT sur patch égal, exactitude comprise, et le DIT', () => {
    const lecture = lireRevues({
      revues: [
        revue('A09 · exactitude\nVerdict: accepte', AUTRE),
        revue('A09 · securite\nVerdict: accepte', AUTRE),
      ],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => ['src/code.ts', 'src/autre.ts'],
      empreinteDuPatch: () => 'f'.repeat(40),
    });
    expect(lecture.perimees).toEqual([]);
    expect(lecture.survivantes.map((s) => s.lentille).sort()).toEqual(['exactitude', 'securite']);
    expect(lecture.coche).toBe(true);
    expect(lecture.detail).toContain('diff propre à la PR');
  });

  it('REQ-GOV-011 — la garde : patch différent ou incalculable → PÉRIMÉ, avec son motif', () => {
    let n = 0;
    const differe = lireRevues({
      revues: [revue('A09 · securite\nVerdict: accepte', AUTRE)],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => ['src/code.ts'],
      empreinteDuPatch: () => String(n++).repeat(40).slice(0, 40),
    });
    expect(differe.perimees.map((v) => v.lentille)).toEqual(['securite']);
    expect(differe.peremptions[0]!.motif).toContain('diff propre à la PR a changé');
    const incalculable = lireRevues({
      revues: [revue('A09 · securite\nVerdict: accepte', AUTRE)],
      risque: ELEVE,
      tete: TETE,
      auteurPoste: 'A05',
      fichiersEntre: () => ['src/code.ts'],
      empreinteDuPatch: () => null,
    });
    expect(incalculable.perimees.map((v) => v.lentille)).toEqual(['securite']);
    expect(incalculable.coche).toBe(false);
  });
});

// ── 3. vues:fusion ──────────────────────────────────────────────────────────────────────────────

describe('REQ-GOV-032 — `pnpm vues:fusion` : un conflit de vue se RÉGÉNÈRE, un autre conflit arrête', () => {
  it('REQ-GOV-032 — les vues dérivées sont une liste nommée, PLAN-STATE rendue EN DERNIER', () => {
    const chemins = VUES_DERIVEES.map((v) => v.chemin);
    expect(chemins.at(-1)).toBe('docs/PLAN-STATE.md');
    expect(chemins).toContain('docs/TRACABILITE.md');
    for (const v of VUES_DERIVEES) {
      expect(v.rendu).toMatch(/^pnpm [a-z:-]+$/);
      expect(v.verificateur).toMatch(/^pnpm [a-z:-]+$/);
    }
    expect(estUneVueDerivee('docs/PLAN-STATE.md')).toBe(true);
    expect(estUneVueDerivee('docs/tasks.json')).toBe(false);
  });

  it('REQ-GOV-032 — le tri des conflits sépare les vues du reste', () => {
    expect(trierLesConflits(['docs/PLAN-STATE.md', 'src/x.ts', 'docs/TASKS.md'])).toEqual({
      vues: ['docs/PLAN-STATE.md', 'docs/TASKS.md'],
      autres: ['src/x.ts'],
    });
  });

  it('REQ-GOV-032 — conflit sur une vue SEULE : fusion commitée, vue rendue, aucun marqueur', () => {
    const d = depot();
    try {
      d.ecrire('docs/PLAN-STATE.md', 'etat 0\n');
      d.ecrire('src/code.ts', 'code\n');
      d.git('add', '-A');
      d.git('commit', '-q', '-m', 'base');
      d.git('checkout', '-q', '-b', 'pr');
      d.ecrire('docs/PLAN-STATE.md', 'etat PR\n');
      d.git('commit', '-q', '-am', 'pr');
      d.git('checkout', '-q', 'main');
      d.ecrire('docs/PLAN-STATE.md', 'etat main\n');
      d.git('commit', '-q', '-am', 'main');
      d.git('checkout', '-q', 'pr');
      let rendus = 0;
      const issue = fusionnerMain({
        cwd: d.dir,
        base: 'main',
        rendre: () => {
          rendus++;
          writeFileSync(join(d.dir, 'docs/PLAN-STATE.md'), 'etat rendu\n');
          return true;
        },
      });
      expect(issue.code, issue.lignes.join('\n')).toBe(0);
      expect(rendus).toBe(1);
      expect(readFileSync(join(d.dir, 'docs/PLAN-STATE.md'), 'utf8')).toBe('etat rendu\n');
      expect(d.git('status', '--porcelain')).toBe('');
      expect(d.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    } finally {
      rmSync(d.dir, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-032 — conflit sur un fichier qui n’est pas une vue : fusion ABANDONNÉE, fichier nommé, code 1', () => {
    const d = depot();
    try {
      d.ecrire('src/code.ts', 'code\n');
      d.git('add', '-A');
      d.git('commit', '-q', '-m', 'base');
      d.git('checkout', '-q', '-b', 'pr');
      d.ecrire('src/code.ts', 'code PR\n');
      d.git('commit', '-q', '-am', 'pr');
      d.git('checkout', '-q', 'main');
      d.ecrire('src/code.ts', 'code main\n');
      d.git('commit', '-q', '-am', 'main');
      d.git('checkout', '-q', 'pr');
      const avant = d.git('rev-parse', 'HEAD');
      const issue = fusionnerMain({ cwd: d.dir, base: 'main', rendre: () => true });
      expect(issue.code).toBe(1);
      expect(issue.lignes.join('\n')).toContain('src/code.ts');
      expect(existsSync(join(d.dir, '.git', 'MERGE_HEAD'))).toBe(false);
      expect(d.git('rev-parse', 'HEAD')).toBe(avant);
      expect(d.git('status', '--porcelain')).toBe('');
    } finally {
      rmSync(d.dir, { recursive: true, force: true });
    }
  });

  it('REQ-GOV-032 — un rendu en échec abandonne la fusion au lieu de commiter une vue fausse', () => {
    const d = depot();
    try {
      d.ecrire('docs/PLAN-STATE.md', 'etat 0\n');
      d.git('add', '-A');
      d.git('commit', '-q', '-m', 'base');
      d.git('checkout', '-q', '-b', 'pr');
      d.ecrire('docs/PLAN-STATE.md', 'etat PR\n');
      d.git('commit', '-q', '-am', 'pr');
      d.git('checkout', '-q', 'main');
      d.ecrire('docs/PLAN-STATE.md', 'etat main\n');
      d.git('commit', '-q', '-am', 'main');
      d.git('checkout', '-q', 'pr');
      const avant = d.git('rev-parse', 'HEAD');
      const issue = fusionnerMain({ cwd: d.dir, base: 'main', rendre: () => false });
      expect(issue.code).toBe(1);
      expect(d.git('rev-parse', 'HEAD')).toBe(avant);
      expect(existsSync(join(d.dir, '.git', 'MERGE_HEAD'))).toBe(false);
    } finally {
      rmSync(d.dir, { recursive: true, force: true });
    }
  });
});

// ── 4. pre-gate ─────────────────────────────────────────────────────────────────────────────────

describe('REQ-GOV-013 — `pnpm pre-gate` : les étapes RAPIDES de la porte A, lues dans ci.yml', () => {
  it('REQ-GOV-013 — la suite, les navigateurs et Stryker sont écartés et NOMMÉS ; le reste est joué', async () => {
    const { jouees } = await etapesDeLaPorteA(readFileSync('.github/workflows/ci.yml', 'utf8'));
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    ).scripts;
    const { rapides, lentes } = etapesRapides(jouees, scripts);
    const commandes = rapides.map((e) => e.commande);
    for (const c of [
      'pnpm lint',
      'pnpm format:check',
      'pnpm typecheck',
      'pnpm perf:budgets',
      'pnpm gov:pr',
    ]) {
      expect(commandes).toContain(c);
    }
    expect(commandes).not.toContain('pnpm test');
    expect(commandes).not.toContain('pnpm a11y:navigateurs');
    expect(commandes).not.toContain('pnpm mutation:pr');
    expect(lentes.map((e) => e.nom).join('\n')).toMatch(/Tests/);
    for (const e of lentes) expect(e.motif.length).toBeGreaterThan(10);
    expect(rapides.length + lentes.length).toBe(jouees.length);
  });

  it('REQ-GOV-013 — chaque étape lente déclarée est bien une étape de la porte A (aucune liste morte)', async () => {
    const { jouees } = await etapesDeLaPorteA(readFileSync('.github/workflows/ci.yml', 'utf8'));
    for (const s of ETAPES_LENTES) {
      expect(
        jouees.map((e) => e.commande),
        s.script
      ).toContain(`pnpm ${s.script}`);
    }
  });

  it('REQ-GOV-013 — pre-gate est déclaré, et la documentation le prescrit avant d’ouvrir une PR', () => {
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts['pre-gate']).toBeDefined();
    expect(readFileSync('docs/PROTOCOLE-FUSION.md', 'utf8')).toContain('pnpm pre-gate');
    expect(readFileSync('docs/CHARTE-AGENTS.md', 'utf8')).toContain('pnpm pre-gate');
  });
});

// ── 5. mutation:pr ──────────────────────────────────────────────────────────────────────────────

describe('REQ-QA-002 — `pnpm mutation:pr` : Stryker sur les fichiers mutables de la PR, en bac à sable', () => {
  it('REQ-QA-002 — les sources de src/domain et src/server sont mutés ; les gardes et la surface Next sont nommées à part', () => {
    const { mutes, ecartes } = fichiersAMuter([
      'src/domain/depot/regle.ts',
      'src/server/securite/pii.ts',
      'src/domain/depot/regle.spec.ts',
      'src/domain/types.d.ts',
      'src/app/page.tsx',
      'scripts/gates/gov-pr.ts',
      'docs/CHARTE-AGENTS.md',
    ]);
    expect(mutes).toEqual(['src/domain/depot/regle.ts', 'src/server/securite/pii.ts']);
    expect(ecartes.map((e) => e.fichier)).toEqual(['src/app/page.tsx', 'scripts/gates/gov-pr.ts']);
    expect(ecartes[1]!.motif).toMatch(/--prove/);
    expect(ecartes[0]!.motif).toMatch(/rendu/);
  });

  it('REQ-QA-002 — la configuration de la PR est DÉRIVÉE de stryker.config.json : bac à sable, seuil conservé', () => {
    const base = JSON.parse(readFileSync('stryker.config.json', 'utf8')) as Record<string, unknown>;
    const c = configDeLaPr(base, ['src/domain/depot/regle.ts']) as Record<string, unknown>;
    expect(c.inPlace).toBe(false);
    expect(c.mutate).toEqual(['src/domain/depot/regle.ts']);
    expect(c.thresholds).toEqual(base.thresholds);
    expect(c.incremental).toBe(true);
    expect(JSON.stringify(c.jsonReporter)).not.toBe(JSON.stringify(base.jsonReporter));
  });

  it('REQ-QA-002 — la porte A lance `pnpm mutation:pr`, sans tolérance d’échec', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).toMatch(/^\s+run: pnpm mutation:pr$/m);
  });
});

// ── 6. le cliquet des sorties non nulles ────────────────────────────────────────────────────────

describe('REQ-GOV-032 — le cliquet des sorties non nulles est CALCULÉ : une déclaration ne disparaît qu’avec son fichier', () => {
  const texte = [
    '  const declares: Record<string, { total: number }> = {',
    "    'scripts/gates/a.ts': {",
    '      total: 3,',
    '      porte: 3,',
    '    },',
    "    'scripts/gates/b.ts': {",
    '      total: 1,',
    '      porte: 1,',
    '    },',
    '  };',
  ].join('\n');

  it('REQ-GOV-032 — les déclarations de la base se lisent dans son texte', () => {
    expect(declarationsDeLaBase(texte)).toEqual(
      new Map([
        ['scripts/gates/a.ts', 3],
        ['scripts/gates/b.ts', 1],
      ])
    );
  });

  it('REQ-GOV-032 — retirer une déclaration dont le fichier existe, ou baisser son total, rougit', () => {
    const base = declarationsDeLaBase(texte);
    const existe = (): boolean => true;
    expect(declarationsRetirees(base, { 'scripts/gates/a.ts': { total: 3 } }, existe)).toEqual([
      'scripts/gates/b.ts : déclaré sur la base (1), retiré ici alors que le fichier existe',
    ]);
    expect(
      declarationsRetirees(
        base,
        { 'scripts/gates/a.ts': { total: 2 }, 'scripts/gates/b.ts': { total: 1 } },
        existe
      )
    ).toEqual(['scripts/gates/a.ts : déclaré 3 sur la base, 2 ici']);
  });

  it('REQ-GOV-032 — contre-témoins : un ajout passe, un fichier supprimé emporte sa déclaration', () => {
    const base = declarationsDeLaBase(texte);
    expect(
      declarationsRetirees(
        base,
        {
          'scripts/gates/a.ts': { total: 3 },
          'scripts/gates/b.ts': { total: 1 },
          'scripts/gates/c.ts': { total: 2 },
        },
        () => true
      )
    ).toEqual([]);
    expect(
      declarationsRetirees(
        base,
        { 'scripts/gates/a.ts': { total: 3 } },
        (f) => f !== 'scripts/gates/b.ts'
      )
    ).toEqual([]);
  });

  it('REQ-GOV-032 — une base illisible n’est pas une base vide : ZÉRO déclaration lue est un refus', () => {
    expect(declarationsDeLaBase('rien de lisible').size).toBe(0);
  });
});

// ── 7. second tour de relecture (exactitude 5326296410, securite 5326296579) ───────────────────

describe('REQ-QA-002 — `mutation:pr` ne saute RIEN en silence', () => {
  it('REQ-QA-002 — src/lib est muté (forme-iban touche l’argent) ; src/app et src/proxy.ts sont NOMMÉS, jamais tus', () => {
    const { mutes, ecartes } = fichiersAMuter([
      'src/lib/forme-iban.ts',
      'src/app/(espace)/connexion/page.tsx',
      'src/proxy.ts',
      'src/instrumentation.ts',
    ]);
    expect(mutes).toEqual(['src/lib/forme-iban.ts']);
    expect(ecartes.map((e) => e.fichier)).toEqual([
      'src/app/(espace)/connexion/page.tsx',
      'src/proxy.ts',
      'src/instrumentation.ts',
    ]);
    for (const e of ecartes) expect(e.motif.length).toBeGreaterThan(20);
  });

  it('REQ-QA-002 — tout source touché sous src/ ou scripts/ est soit muté, soit écarté avec motif', () => {
    const touches = [
      'src/domain/a.ts',
      'src/server/b.ts',
      'src/lib/c.ts',
      'src/app/api/d/route.ts',
      'src/proxy.ts',
      'src/content/e.ts',
      'scripts/gates/f.ts',
    ];
    const { mutes, ecartes } = fichiersAMuter(touches);
    expect([...mutes, ...ecartes.map((e) => e.fichier)].sort()).toEqual([...touches].sort());
  });

  it('REQ-QA-002 — un `// Stryker disable` dans un fichier touché est nommé fichier:ligne', () => {
    const textes: Record<string, string> = {
      'src/domain/a.ts': 'const x = 1;\n// Stryker disable next-line all\nconst y = 2;\n',
      'src/domain/b.ts': 'const z = 3;\n',
    };
    expect(desactivationsDeStryker(Object.keys(textes), (f) => textes[f]!)).toEqual([
      'src/domain/a.ts:2',
    ]);
    expect(desactivationsDeStryker(['src/domain/b.ts'], (f) => textes[f]!)).toEqual([]);
  });
});

describe('REQ-QA-002 — `passer()` : la passe entière, mesures injectées', () => {
  const texteConfig = JSON.stringify({ thresholds: { break: 80 } });
  const rapport = (statuts: string[]) => ({
    files: {
      'src/domain/a.ts': {
        mutants: statuts.map((status, i) => ({
          id: String(i),
          mutatorName: 'ConditionalExpression',
          status,
          location: { start: { line: i + 1, column: 1 } },
        })),
      },
    },
  });

  it('REQ-QA-002 — base illisible : code 1, et Stryker n’est PAS lancé', () => {
    let lance = 0;
    const r = passer('origin/main', {
      fichiersDeLaPr: () => null,
      lancerStryker: () => (lance++, 0),
    });
    expect(r.code).toBe(1);
    expect(lance).toBe(0);
    expect(r.lignes.join('\n')).toContain('introuvable');
  });

  it('REQ-QA-002 — rien de mutable : code 0, les écartés sont NOMMÉS', () => {
    const r = passer('origin/main', {
      fichiersDeLaPr: () => ['src/proxy.ts', 'docs/x.md'],
      lancerStryker: () => 0,
    });
    expect(r.code).toBe(0);
    expect(r.lignes.join('\n')).toContain('src/proxy.ts');
  });

  it('REQ-QA-002 — une désactivation de Stryker fait ÉCHOUER la passe, avant toute mutation', () => {
    let lance = 0;
    const r = passer('origin/main', {
      fichiersDeLaPr: () => ['src/domain/a.ts'],
      lire: () => '// Stryker disable all\nexport const a = 1;\n',
      lancerStryker: () => (lance++, 0),
    });
    expect(r.code).toBe(1);
    expect(lance).toBe(0);
    expect(r.lignes.join('\n')).toContain('src/domain/a.ts:1');
  });

  it('REQ-QA-002 — sous le seuil : code 1 et survivant nommé ; au seuil : code 0 (contre-témoin)', () => {
    const base = {
      fichiersDeLaPr: () => ['src/domain/a.ts'],
      lire: () => 'export const a = 1;\n',
      texteConfig,
      lancerStryker: () => 0,
    };
    const rouge = passer('origin/main', {
      ...base,
      lireRapport: () => rapport(['Killed', 'Survived']),
    });
    expect(rouge.code).toBe(1);
    expect(rouge.lignes.join('\n')).toContain('src/domain/a.ts:2 Survived');
    const vert = passer('origin/main', {
      ...base,
      lireRapport: () => rapport(['Killed', 'Killed', 'Killed', 'Killed', 'Survived']),
    });
    expect(vert.code).toBe(0);
    const tombe = passer('origin/main', {
      ...base,
      lancerStryker: () => 1,
      lireRapport: () => null,
    });
    expect(tombe.code).toBe(1);
  });
});

describe('REQ-GOV-011 — l’empreinte tient le CONTEXTE et le MODE', () => {
  let d: ReturnType<typeof depot>;
  let T = '';
  let Tvoisin = '';
  let Tmode = '';
  beforeAll(() => {
    d = depot();
    d.ecrire('src/code.ts', LIGNES(30, 'ligne'));
    d.git('add', '-A');
    d.git('commit', '-q', '-m', 'base');
    d.git('checkout', '-q', '-b', 'pr');
    d.ecrire('src/code.ts', LIGNES(30, 'ligne').replace('ligne 10\n', 'ligne 10 PR\n'));
    d.git('commit', '-q', '-am', 'pr');
    T = d.git('rev-parse', 'HEAD');
    // Mode seul : aucun octet de contenu ne change.
    // Le bit posé des DEUX côtés : sous Linux (`core.filemode` vrai), un index exécutable sur un
    // fichier qui ne l'est pas laisse l'arbre « modifié », et le `checkout` suivant refuse (mesuré
    // en porte A, run 36251815392) ; sous Windows, seul l'index porte le mode.
    d.git('config', 'core.filemode', 'false');
    chmodSync(join(d.dir, 'src/code.ts'), 0o755);
    d.git('update-index', '--chmod=+x', 'src/code.ts');
    d.git('commit', '-q', '-m', 'mode');
    Tmode = d.git('rev-parse', 'HEAD');
    // main change une ligne VOISINE (deux lignes plus bas) : fusion propre, contexte changé.
    d.git('checkout', '-q', 'main');
    d.ecrire('src/code.ts', LIGNES(30, 'ligne').replace('ligne 12\n', 'ligne 12 main\n'));
    d.git('commit', '-q', '-am', 'voisin');
    d.git('checkout', '-q', '-b', 'pr-voisin', T);
    d.git('merge', '-q', '--no-edit', 'main');
    Tvoisin = d.git('rev-parse', 'HEAD');
  });
  afterAll(() => rmSync(d.dir, { recursive: true, force: true }));

  it('REQ-GOV-011 — un changement de main à deux lignes d’un morceau de la PR périme : le contexte compte', () => {
    const e = (sha: string) => empreinteDuPatch(sha, { base: 'main', cwd: d.dir });
    expect(e(Tvoisin)).not.toBeNull();
    expect(e(Tvoisin)).not.toBe(e(T));
  });

  it('REQ-GOV-011 — un changement de MODE seul périme : `patch-id` hache les en-têtes de mode', () => {
    const e = (sha: string) => empreinteDuPatch(sha, { base: `${T}~1`, cwd: d.dir });
    expect(e(Tmode)).not.toBeNull();
    expect(e(Tmode)).not.toBe(e(T));
  });
});

describe('REQ-GOV-011 — l’API morte `sansMutation` est retirée', () => {
  it('REQ-GOV-011 — `lentillesExigees` ne rend plus que `toutes`', () => {
    expect(Object.keys(lentillesExigees(ELEVE))).toEqual(['toutes']);
  });
});

describe('REQ-GOV-032 — `vues:fusion` : une levée au milieu laisse l’arbre INTACT', () => {
  it('REQ-GOV-032 — un rendu qui LÈVE : fusion annulée, tête inchangée, aucune fusion en cours, code 1', () => {
    const d = depot();
    try {
      d.ecrire('docs/PLAN-STATE.md', 'etat 0\n');
      d.git('add', '-A');
      d.git('commit', '-q', '-m', 'base');
      d.git('checkout', '-q', '-b', 'pr');
      d.ecrire('docs/PLAN-STATE.md', 'etat PR\n');
      d.git('commit', '-q', '-am', 'pr');
      d.git('checkout', '-q', 'main');
      d.ecrire('docs/PLAN-STATE.md', 'etat main\n');
      d.git('commit', '-q', '-am', 'main');
      d.git('checkout', '-q', 'pr');
      const avant = d.git('rev-parse', 'HEAD');
      const issue = fusionnerMain({
        cwd: d.dir,
        base: 'main',
        rendre: () => {
          throw new Error('rendu cassé');
        },
      });
      expect(issue.code).toBe(1);
      expect(issue.lignes.join('\n')).toContain('rendu cassé');
      expect(d.git('rev-parse', 'HEAD')).toBe(avant);
      expect(existsSync(join(d.dir, '.git', 'MERGE_HEAD'))).toBe(false);
      expect(d.git('status', '--porcelain')).toBe('');
    } finally {
      rmSync(d.dir, { recursive: true, force: true });
    }
  });
});
