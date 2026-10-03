// @req REQ-QA-013
// @req REQ-GOV-010
// @req REQ-GOV-029
/**
 * LA PORTE A EST GARDÉE ; CE QUI LA FAIT TOURNER NE L'ÉTAIT PAS.
 *
 * Sept points de l'outillage qui exécute la porte A n'étaient jugés par aucune garde : le réglage
 * du gestionnaire de paquets posé au niveau du projet, les chemins de l'outillage non réservés, les
 * correctifs et surcharges de version, les actions tierces, une étape amont qui réécrit l'arbre, un
 * script qui porte le nom d'une commande intégrée, et l'environnement hérité par ce qui lance
 * l'outil. `confronterLOutillage` (`scripts/gates/gov-conventions.ts`) les juge, un par un, et
 * chaque refus NOMME son point.
 *
 * TÉMOIN À DEUX FACES. Chaque désarmement est UNE variation du dépôt réel (RM-11) : en mémoire sur
 * la fonction, puis sur le BINAIRE dans une copie de travail. Le dépôt, lui, sort en zéro, et le
 * vert imprime le compte des points RÉELLEMENT confrontés — dérivé, jamais tapé (RM-01).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  CHEMINS_DE_L_OUTILLAGE,
  POINTS_DE_L_OUTILLAGE,
  VUE_OUTILLAGE_CONFORME,
  confronterLOutillage,
  environnementDuTemoin,
  estUneVariableDuLanceur,
  lignesDeLOutillage,
  lireVue,
  reserveCouvre,
  type Vue,
} from '../../../scripts/gates/gov-conventions';
import { cheminsReserves } from '../../../scripts/lot/chemins-de-tache';
import { touche } from '../../../scripts/lot/revues';
import { estObjet } from '../../../scripts/lib/lire-yaml';

const RACINE = process.cwd();
const SCRIPT = resolve(RACINE, 'scripts/gates/gov-conventions.ts');
const TSX = resolve(RACINE, 'node_modules/tsx/dist/cli.mjs');
const CI = '.github/workflows/ci.yml';
const CHARTE = 'docs/CHARTE-AGENTS.md';
const VERROU = 'pnpm-lock.yaml';

function lancer(cwd: string): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, SCRIPT], {
    cwd,
    encoding: 'utf8',
    // `next` déclare `NODE_ENV` obligatoire dans `NodeJS.ProcessEnv` : l'enfant n'en reçoit pas.
    env: environnementDuTemoin(process.env) as NodeJS.ProcessEnv,
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Remplace UNE occurrence, et refuse si le texte cherché n'y est pas UNE fois : un témoin qui ne
 * désarme rien rendrait un vert, qui passerait pour la preuve que la garde laisse passer. */
function remplacerUneFois(texte: string, cherche: string, par: string): string {
  const i = texte.indexOf(cherche);
  if (i < 0 || texte.indexOf(cherche, i + 1) >= 0) {
    throw new Error(`témoin mal posé : « ${cherche.slice(0, 60)} » doit figurer UNE fois`);
  }
  return texte.slice(0, i) + par + texte.slice(i + cherche.length);
}

/**
 * GOV-142 : les étapes du socle se répètent dans chaque job de la porte A. Remplace la PREMIÈRE
 * occurrence (celle du premier job, `forge`), et refuse si le texte n'y est pas.
 */
function remplacerLaPremiere(texte: string, cherche: string, par: string): string {
  const i = texte.indexOf(cherche);
  if (i < 0) throw new Error(`témoin mal posé : « ${cherche.slice(0, 60)} » est absent`);
  return texte.slice(0, i) + par + texte.slice(i + cherche.length);
}

const CI_REEL = readFileSync(CI, 'utf8');
const PKG_REEL = readFileSync('package.json', 'utf8');
const CHARTE_REELLE = readFileSync(CHARTE, 'utf8');
const VERROU_REEL = readFileSync(VERROU, 'utf8');

/** Le libellé d'un point, lu dans la garde : c'est lui que le refus doit NOMMER. */
function libelle(famille: string): string {
  const p = POINTS_DE_L_OUTILLAGE.find((x) => x.famille === famille);
  if (p === undefined) throw new Error(`famille inconnue de la garde : ${famille}`);
  return p.point;
}

const INSTALL = '      - run: pnpm install --frozen-lockfile\n';
const LINT = '      - name: Lint\n        run: pnpm lint\n';
const LIGNE_DE_L_OUTILLAGE = /^\| `package\.json`, `pnpm-lock\.yaml`, `patches\/\*\*` \|.*$/m;

/** UN désarmement : une seule variation du dépôt réel, et le fichier qu'elle ajoute s'il y en a un. */
interface Desarmement {
  quoi: string;
  famille: string;
  ci?: (t: string) => string;
  pkg?: (t: string) => string;
  charte?: (t: string) => string;
  verrou?: (t: string) => string;
  ajout?: { chemin: string; contenu: string };
}

const avecCle = (cle: string, valeur: unknown) => (t: string) =>
  JSON.stringify({ ...(JSON.parse(t) as Record<string, unknown>), [cle]: valeur }, null, 2) + '\n';
const avecScript = (nom: string, valeur: string) => (t: string) => {
  const p = JSON.parse(t) as { scripts: Record<string, string> };
  return JSON.stringify({ ...p, scripts: { ...p.scripts, [nom]: valeur } }, null, 2) + '\n';
};

const DESARMEMENTS: readonly Desarmement[] = [
  {
    quoi: '(1) un réglage du verrou changé au niveau du projet',
    famille: 'outillage_reglage_du_gestionnaire',
    verrou: (t) =>
      remplacerUneFois(
        t,
        '  excludeLinksFromLockfile: false\n',
        '  excludeLinksFromLockfile: true\n'
      ),
  },
  {
    quoi: '(1) une clé de premier niveau ajoutée à `package.json`',
    famille: 'outillage_reglage_du_gestionnaire',
    pkg: avecCle('devEngines', { packageManager: { name: 'pnpm' } }),
  },
  {
    quoi: '(2) le répertoire de correctifs retiré des chemins réservés de la charte',
    famille: 'outillage_chemin_non_reserve',
    charte: (t) => remplacerUneFois(t, ', `patches/**` |', ' |'),
  },
  {
    quoi: '(2) une forme de répertoire que `gov:pr` ne sait pas lire (`patches/*`)',
    famille: 'outillage_chemin_non_reserve',
    charte: (t) => remplacerUneFois(t, '`patches/**` |', '`patches/*` |'),
  },
  {
    quoi: '(3) une surcharge de version par `resolutions`',
    famille: 'outillage_correctif_ou_surcharge',
    pkg: avecCle('resolutions', { eslint: '9.0.0' }),
  },
  {
    quoi: '(3) une dépendance corrigée inscrite au verrou',
    famille: 'outillage_correctif_ou_surcharge',
    verrou: (t) =>
      remplacerUneFois(
        t,
        '\nimporters:\n',
        '\npatchedDependencies:\n  eslint: { hash: abc, path: patches/eslint.patch }\n\nimporters:\n'
      ),
  },
  {
    quoi: '(3) un correctif suivi sous `patches/`',
    famille: 'outillage_correctif_ou_surcharge',
    ajout: { chemin: 'patches/eslint.patch', contenu: '--- a\n+++ b\n' },
  },
  {
    quoi: '(4) une action tierce qui embarque sa propre image',
    famille: 'outillage_action_tierce',
    ci: (t) => remplacerLaPremiere(t, INSTALL, `      - uses: docker://alpine:3\n${INSTALL}`),
  },
  {
    quoi: '(4) une action tierce hors du relevé',
    famille: 'outillage_action_tierce',
    ci: (t) =>
      remplacerLaPremiere(
        t,
        '      - uses: actions/setup-node@v4\n',
        '      - uses: actions/setup-node@main\n'
      ),
  },
  {
    quoi: '(5) une étape qui réécrit l’arbre avant les gardes',
    famille: 'outillage_etape_amont_ecrivante',
    ci: (t) =>
      remplacerUneFois(t, LINT, `      - name: Mise en forme\n        run: pnpm format\n${LINT}`),
  },
  {
    quoi: '(5) un second checkout posé après l’installation',
    famille: 'outillage_etape_amont_ecrivante',
    ci: (t) => remplacerUneFois(t, LINT, `      - uses: actions/checkout@v4\n${LINT}`),
  },
  {
    quoi: '(6) un script qui porte le nom d’une commande intégrée',
    famille: 'outillage_commande_integree',
    pkg: avecScript('ls', 'tsx scripts/gates/gov-conventions.ts'),
  },
  {
    quoi: '(6) une étape qui lance une commande intégrée en croyant lancer un script',
    famille: 'outillage_commande_integree',
    ci: (t) => remplacerUneFois(t, '        run: pnpm lint\n', '        run: pnpm exec eslint .\n'),
  },
  {
    quoi: '(7) une variable du lanceur posée dans l’environnement d’une étape',
    famille: 'outillage_environnement_herite',
    ci: (t) =>
      remplacerUneFois(
        t,
        '        run: pnpm lint\n',
        '        run: pnpm lint\n        env:\n          NODE_OPTIONS: --require ./x.js\n'
      ),
  },
  {
    quoi: '(7) un code qui écrit l’environnement des étapes suivantes',
    famille: 'outillage_environnement_herite',
    ajout: {
      chemin: 'scripts/lot/preparer.ts',
      contenu:
        "import { appendFileSync } from 'node:fs';\n" +
        "appendFileSync(process.env.GITHUB_ENV ?? '', 'NODE_OPTIONS=--require ./x.js\\n');\n",
    },
  },
];

/** Une copie EN MÉMOIRE de la vue réelle, désarmée d'une seule façon. */
function vueDesarmee(d: Desarmement): Vue {
  const vue = lireVue();
  return {
    ...vue,
    workflows: vue.workflows.map((w) =>
      w.chemin === CI && d.ci ? { ...w, source: d.ci(w.source) } : w
    ),
    packageJson: d.pkg ? d.pkg(vue.packageJson) : vue.packageJson,
    charte: d.charte ? d.charte(vue.charte ?? '') : vue.charte,
    verrou: d.verrou ? d.verrou(vue.verrou ?? '') : vue.verrou,
    fichiersSuivis: d.ajout ? [...vue.fichiersSuivis, d.ajout.chemin] : vue.fichiersSuivis,
    sources:
      d.ajout && d.ajout.chemin.endsWith('.ts')
        ? [...vue.sources, { chemin: d.ajout.chemin, source: d.ajout.contenu }]
        : vue.sources,
  };
}

describe('REQ-QA-013 — l’outillage du dépôt passe, et les SEPT points sont confrontés', () => {
  it('REQ-QA-013 — la vue réelle : aucune faute, et chaque point est réellement confronté', async () => {
    const c = await confronterLOutillage(lireVue());
    expect(c.fautes).toEqual([]);
    expect(POINTS_DE_L_OUTILLAGE).toHaveLength(7);
    expect(c.points.filter((p) => !p.confronte).map((p) => p.point)).toEqual([]);
    expect(c.confrontes).toBe(POINTS_DE_L_OUTILLAGE.length);
  });

  it('REQ-QA-013 — le rendu imprime le compte DÉRIVÉ, et ce que chaque point a lu', async () => {
    const lignes = lignesDeLOutillage(await confronterLOutillage(lireVue())).join('\n');
    expect(lignes).toContain(
      `OUTILLAGE — ${POINTS_DE_L_OUTILLAGE.length} point(s) sur ${POINTS_DE_L_OUTILLAGE.length} confronté(s)`
    );
    for (const p of POINTS_DE_L_OUTILLAGE) expect(lignes).toContain(p.point);
    expect(lignes).not.toMatch(/tout est gardé/i);
  });

  it('REQ-QA-013 — un point dont la source n’est pas suivie n’est PAS compté, et le rendu le dit', async () => {
    const vue = lireVue();
    const sansCharte = { ...vue, fichiersSuivis: vue.fichiersSuivis.filter((f) => f !== CHARTE) };
    const c = await confronterLOutillage(sansCharte);
    expect(c.confrontes).toBe(POINTS_DE_L_OUTILLAGE.length - 1);
    const lignes = lignesDeLOutillage(c).join('\n');
    expect(lignes).toContain(`${POINTS_DE_L_OUTILLAGE.length - 1} point(s) sur`);
    expect(lignes).toContain('NON confronté');
  });

  it('REQ-QA-013 — la vue de référence de la preuve est conforme, elle aussi', async () => {
    const c = await confronterLOutillage(VUE_OUTILLAGE_CONFORME);
    expect(c.fautes).toEqual([]);
    expect(c.confrontes).toBe(POINTS_DE_L_OUTILLAGE.length);
  });
});

describe('REQ-GOV-029 — chaque désarmement, un refus qui NOMME son point (copies en mémoire)', () => {
  for (const d of DESARMEMENTS) {
    it(`REQ-GOV-029 — ${d.quoi} : ${d.famille}, point nommé`, async () => {
      const fautes = (await confronterLOutillage(vueDesarmee(d))).fautes;
      const miennes = fautes.filter((f) => f.famille === d.famille);
      expect(miennes.length, fautes.map((f) => f.message).join('\n')).toBeGreaterThan(0);
      for (const f of miennes) expect(f.message).toContain(libelle(d.famille));
    });
  }

  it('REQ-GOV-029 — chacun des sept points a au moins un désarmement', () => {
    const exerces = new Set(DESARMEMENTS.map((d) => d.famille));
    expect(POINTS_DE_L_OUTILLAGE.filter((p) => !exerces.has(p.famille))).toEqual([]);
  });

  it('REQ-GOV-029 — CONTRE-TÉMOIN : une variable qui ne configure pas le lanceur passe', async () => {
    const d: Desarmement = {
      quoi: 'jeton',
      famille: 'outillage_environnement_herite',
      ci: (t) =>
        remplacerUneFois(
          t,
          '        run: pnpm lint\n',
          '        run: pnpm lint\n        env:\n          TZ: UTC\n'
        ),
    };
    const fautes = (await confronterLOutillage(vueDesarmee(d))).fautes;
    expect(fautes.filter((f) => f.famille.startsWith('outillage_'))).toEqual([]);
  });
});

describe('REQ-GOV-010 — les chemins de l’outillage sont RÉSERVÉS, sous une forme que `gov:pr` lit', () => {
  it('REQ-GOV-010 — la charte réelle réserve chaque chemin de l’outillage, lu par le lecteur de `gov:pr`', () => {
    const reserves = cheminsReserves(CHARTE_REELLE);
    expect(CHEMINS_DE_L_OUTILLAGE.length).toBeGreaterThan(0);
    for (const chemin of CHEMINS_DE_L_OUTILLAGE) {
      // Un chemin de répertoire est éprouvé par un FICHIER qu'il contient, comme `gov:pr` le fait
      // d'un fichier de la PR (`touche(reserve, pr.fichiers)`).
      const sonde = chemin.endsWith('/') ? `${chemin}exemple.patch` : chemin;
      const porteurs = reserves.filter((r) => r.chemins.some((c) => touche(c, [sonde])));
      expect(
        porteurs.map((r) => r.label),
        chemin
      ).toEqual(['role:architecte']);
    }
  });

  it('REQ-GOV-010 — la forme `patches/**` couvre un fichier du répertoire ; `patches/*` ne couvre rien', () => {
    const ligne = LIGNE_DE_L_OUTILLAGE.exec(CHARTE_REELLE)?.[0];
    expect(ligne, 'la ligne de l’outillage est absente du §7').toBeDefined();
    const couvre = (charte: string): boolean =>
      cheminsReserves(charte).some((r) => r.chemins.some((c) => touche(c, ['patches/a.patch'])));
    expect(couvre(CHARTE_REELLE)).toBe(true);
    expect(
      couvre(CHARTE_REELLE.replace(ligne!, ligne!.replace('`patches/**`', '`patches/*`')))
    ).toBe(false);
  });
});

describe('REQ-GOV-010 — le prédicat de la garde est celui de `gov:pr`', () => {
  it('REQ-GOV-010 — `reserveCouvre` rend ce que `touche` rend, sur les formes limites', () => {
    const reserves = [
      'package.json',
      'patches/',
      'patches',
      'patches/*',
      'docs/adr/',
      'pnpm-lock.yaml',
    ];
    const fichiers = [
      'package.json',
      'packages/x/package.json',
      'patches/a.patch',
      'patches',
      'patchesx/a',
      'patches/*',
      'docs/adr/0001.md',
      'pnpm-lock.yaml',
      'pnpm-lock.yaml.bak',
    ];
    for (const r of reserves) {
      for (const f of fichiers) expect(reserveCouvre(r, f), `${r} / ${f}`).toBe(touche(r, [f]));
    }
  });
});

describe('REQ-GOV-029 — le témoin qui lance l’outil n’hérite d’aucune variable du lanceur', () => {
  it('REQ-GOV-029 — `environnementDuTemoin` retire chaque variable du lanceur, et garde le reste', () => {
    const herite = {
      PATH: '/bin',
      npm_config_script_shell: 'sh',
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      pnpm_config_enable_pre_post_scripts: 'false',
      NODE_OPTIONS: '--require ./x.js',
      TZ: 'UTC',
    };
    const env = environnementDuTemoin(herite);
    expect(Object.keys(env).filter(estUneVariableDuLanceur)).toEqual([]);
    expect(env).toEqual({ PATH: '/bin', TZ: 'UTC' });
  });
});

// ── les copies de travail, sur le binaire ────────────────────────────────────────────────────

const COPIES = [
  'docs/gates.json',
  'docs/tasks.json',
  'package.json',
  '.claude/settings.json',
  'eslint.config.mjs',
  '.prettierrc.json',
  CHARTE,
  VERROU,
];

function copieDeTravail(): string {
  const dir = mkdtempSync(join(tmpdir(), 'outillage-'));
  const suivis = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const f of suivis.filter(
    (s) => COPIES.includes(s) || /^\.github\/workflows\/.+\.ya?ml$/.test(s)
  )) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(RACINE, f), join(dir, f));
  }
  for (const f of suivis.filter((s) => s.startsWith('scripts/gates/'))) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), '');
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

describe('REQ-GOV-029 — TÉMOIN À DEUX FACES sur le binaire, une copie de travail par point', () => {
  it('REQ-GOV-029 — la copie intacte sort en zéro avec le compte des sept points ; chaque copie désarmée sort en non nul en NOMMANT le point', () => {
    const dir = copieDeTravail();
    try {
      const intacte = lancer(dir);
      expect(intacte.code, intacte.sortie.slice(-1500)).toBe(0);
      expect(intacte.sortie).toContain(
        `OUTILLAGE — ${POINTS_DE_L_OUTILLAGE.length} point(s) sur ${POINTS_DE_L_OUTILLAGE.length} confronté(s)`
      );
      const vus = new Set<string>();
      for (const d of DESARMEMENTS) {
        const reels: [string, string, ((t: string) => string) | undefined][] = [
          [CI, CI_REEL, d.ci],
          ['package.json', PKG_REEL, d.pkg],
          [CHARTE, CHARTE_REELLE, d.charte],
          [VERROU, VERROU_REEL, d.verrou],
        ];
        for (const [f, reel, muer] of reels) if (muer) writeFileSync(join(dir, f), muer(reel));
        if (d.ajout) {
          mkdirSync(dirname(join(dir, d.ajout.chemin)), { recursive: true });
          writeFileSync(join(dir, d.ajout.chemin), d.ajout.contenu);
          execFileSync('git', ['add', '--', d.ajout.chemin], { cwd: dir });
        }
        const r = lancer(dir);
        for (const [f, reel] of reels) writeFileSync(join(dir, f), reel);
        if (d.ajout) {
          execFileSync('git', ['rm', '-q', '--cached', '--', d.ajout.chemin], { cwd: dir });
          rmSync(join(dir, d.ajout.chemin));
        }
        expect(r.code, d.quoi).not.toBe(0);
        expect(r.sortie, d.quoi).toContain(`[${d.famille}]`);
        expect(r.sortie, d.quoi).toContain(libelle(d.famille));
        vus.add(d.famille);
      }
      expect(vus.size).toBe(POINTS_DE_L_OUTILLAGE.length);
      // La face verte, remesurée après les sept rouges : la copie a bien été rendue intacte.
      expect(lancer(dir).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('REQ-QA-013 — le dépôt : le binaire sort en zéro et imprime le compte des sept points', () => {
    const { code, sortie } = lancer(RACINE);
    expect(code, sortie.slice(-1500)).toBe(0);
    expect(sortie).toContain(
      `OUTILLAGE — ${POINTS_DE_L_OUTILLAGE.length} point(s) sur ${POINTS_DE_L_OUTILLAGE.length} confronté(s)`
    );
  }, 120_000);
});

/**
 * REQ-QA-013 — L'AUDIT DES DÉPENDANCES DE PRODUCTION. L'exigence énumère
 * `pnpm audit --prod --audit-level=high` parmi ce que la porte A exécute. Mesuré le 2026-09-30
 * (VÉRIF-1, GOV-131) : aucune étape ne le lançait, et `next` 16.3.1 était servi en production avec
 * trois vulnérabilités CRITIQUES (exécutions de code non authentifiées) sous une porte A verte.
 *
 * L'audit vit ICI, sous `pnpm test` (étape « Tests » de gate-a), et non dans une étape `run:` : le
 * point 6 de l'outillage refuse qu'une étape lance une commande intégrée de pnpm, « qui n'a le
 * statut d'aucune garde » — et ce témoin lui en donne un. La commande est celle de l'exigence, mot
 * pour mot, en `--json` pour être JUGÉE et non lue à l'œil ; le jugement est une fonction pure,
 * vue rougir sur un avis critique fictif et rester verte sur un avis modéré. Un rendu illisible
 * LÈVE : l'audit qui n'a pas pu être fait n'est pas un audit vert (échec fermé).
 */
export const ARGUMENTS_D_AUDIT = ['audit', '--prod', '--audit-level=high', '--json'] as const;
const GRAVITES_BLOQUANTES: ReadonlySet<string> = new Set(['high', 'critical']);

interface Avis {
  readonly module_name: string;
  readonly severity: string;
  readonly title: string;
  readonly patched_versions: string;
  readonly findings: ReadonlyArray<{ readonly version: string }>;
}

/** Le rendu de `pnpm audit --json`, ou une levée : un JSON absent ou sans `advisories` n'audite rien. */
export function lireAudit(stdout: string): { avis: readonly Avis[] } {
  let brut: unknown;
  try {
    brut = JSON.parse(stdout);
  } catch {
    throw new Error(`pnpm audit : rendu illisible (${stdout.trim().slice(0, 120) || 'vide'})`);
  }
  if (!estObjet(brut) || !estObjet(brut.advisories) || !estObjet(brut.metadata)) {
    throw new Error('pnpm audit : rendu sans `advisories` ni `metadata` — rien n’a été audité');
  }
  return { avis: Object.values(brut.advisories) as Avis[] };
}

/** Les avis de gravité haute ou critique, NOMMÉS : module, version installée, gravité, correctif. */
export function vulnerabilitesBloquantes(audit: { avis: readonly Avis[] }): string[] {
  return audit.avis
    .filter((a) => GRAVITES_BLOQUANTES.has(a.severity))
    .map(
      (a) =>
        `${a.module_name}@${a.findings.map((f) => f.version).join(',')} — ${a.severity} — ` +
        `${a.title} — corrigé en ${a.patched_versions}`
    );
}

describe('REQ-QA-013 — la porte A AUDITE les dépendances de production', () => {
  it('REQ-QA-013 — `pnpm audit --prod --audit-level=high --json` sur le dépôt : aucune vulnérabilité haute ou critique, et le vert imprime le compte des avis lus', () => {
    const r = spawnSync('pnpm', [...ARGUMENTS_D_AUDIT], {
      cwd: RACINE,
      encoding: 'utf8',
      env: environnementDuTemoin(process.env) as NodeJS.ProcessEnv,
      shell: process.platform === 'win32',
    });
    // Le code de sortie de pnpm n'est pas lu : il vaut 1 dès qu'un avis existe, quelle que soit sa
    // gravité, et 0 aussi quand rien n'a été lu. Seul le JSON, jugé, fait foi.
    const audit = lireAudit(r.stdout ?? '');
    const fautes = vulnerabilitesBloquantes(audit);
    expect(
      fautes,
      `dépendances de production vulnérables (REQ-QA-013) :\n${fautes.join('\n')}`
    ).toEqual([]);
    console.info(
      `[GOV-062] audit des dépendances : ${audit.avis.length} avis lu(s), 0 haut ou critique`
    );
  }, 180_000);

  it('REQ-QA-013 — et ce témoin SAIT rougir : un avis critique (fictif) est nommé — module, version, gravité, correctif — et un avis modéré ne compte pas', () => {
    const critique: Avis = {
      module_name: 'paquet-fictif',
      severity: 'critical',
      title: 'Exécution de code à distance (fictive)',
      patched_versions: '>=9.9.9',
      findings: [{ version: '9.9.8' }],
    };
    const modere: Avis = { ...critique, module_name: 'autre-fictif', severity: 'moderate' };
    expect(vulnerabilitesBloquantes({ avis: [modere] })).toEqual([]);
    expect(vulnerabilitesBloquantes({ avis: [modere, critique] })).toEqual([
      'paquet-fictif@9.9.8 — critical — Exécution de code à distance (fictive) — corrigé en >=9.9.9',
    ]);
    expect(vulnerabilitesBloquantes({ avis: [{ ...critique, severity: 'high' }] })).toHaveLength(1);
  });

  it('REQ-QA-013 — un rendu illisible, vide ou sans `advisories` LÈVE, jamais un vert', () => {
    expect(() => lireAudit('')).toThrow(/illisible/);
    expect(() => lireAudit('{"metadata":{}}')).toThrow(/rien n’a été audité/);
    expect(lireAudit('{"advisories":{},"metadata":{"vulnerabilities":{}}}').avis).toEqual([]);
  });
});
