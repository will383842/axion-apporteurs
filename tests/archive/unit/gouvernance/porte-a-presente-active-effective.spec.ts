// @req REQ-QA-013
// @req REQ-GOV-012
// @req REQ-GOV-029
/**
 * GOV-061 — on croyait la porte A armée, et rien ne le prouvait.
 *
 * SIX FAITS MESURÉS, UN TÉMOIN PAR FAIT. (a) Une garde citée dans un seul COMMENTAIRE du workflow
 * passait pour appelée. (b) Retirer une étape qui ne lance pas un script de `scripts/gates/` — la
 * vérification de la vue d'état — ne rougissait rien. (c) Une condition toujours fausse désarmait
 * une étape sans bruit. (d) La tolérance d'échec n'était lue que sous sa forme littérale. (e) Un
 * script de `package.json` repointé n'était rattrapé par aucune garde. (f) Les commentaires du
 * workflow affirmaient des refus qu'aucune garde ne portait.
 *
 * CE QUE CE FICHIER GARDE. UNE définition — « étape présente, active et effective » — lue par UNE
 * garde et appliquée à TOUTES les étapes du job de la porte A. Chaque témoin désarme une COPIE du
 * dépôt réel d'une seule façon, puis EXÉCUTE la garde : la fonction, et le binaire.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  COMMANDES_INTEGREES_DE_PNPM,
  COMMANDES_RELEVEES_DE_PNPM,
  controler,
  FAMILLES,
  GESTIONNAIRE_RELEVE,
  confronterLaPorteA,
  lireVue,
  PORTE_A_FIGEE,
  VUE_CONFORME,
  type Vue,
} from '../../../scripts/gates/gov-conventions';
import { lireYaml } from '../../../scripts/lib/lire-yaml';

const RACINE = process.cwd();
const SCRIPT = resolve(RACINE, 'scripts/gates/gov-conventions.ts');
const TSX = resolve(RACINE, 'node_modules/tsx/dist/cli.mjs');
const CI = '.github/workflows/ci.yml';

function lancer(cwd: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync(process.execPath, [TSX, SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Remplace UNE occurrence, et refuse si le texte cherché n'y est pas : un témoin qui ne désarme
 * rien rendrait un vert, et ce vert passerait pour la preuve que la garde laisse passer. */
function remplacerUneFois(texte: string, cherche: string, par: string): string {
  const i = texte.indexOf(cherche);
  if (i < 0 || texte.indexOf(cherche, i + 1) >= 0) {
    throw new Error(`témoin mal posé : « ${cherche.slice(0, 60)} » doit figurer UNE fois`);
  }
  return texte.slice(0, i) + par + texte.slice(i + cherche.length);
}

/**
 * GOV-142 : la porte A a plusieurs jobs, dont les étapes du socle se répètent. Remplace la PREMIÈRE
 * occurrence APRÈS l'en-tête du job nommé, et refuse si le job ou le texte n'y sont pas.
 */
function remplacerDansLeJob(texte: string, job: string, cherche: string, par: string): string {
  const debut = texte.indexOf(`\n  ${job}:\n`);
  const i = debut < 0 ? -1 : texte.indexOf(cherche, debut);
  if (i < 0) throw new Error(`témoin mal posé : « ${cherche.slice(0, 60)} » absent du job ${job}`);
  return texte.slice(0, i) + par + texte.slice(i + cherche.length);
}

const CI_REEL = readFileSync(CI, 'utf8');
const PKG_REEL = readFileSync('package.json', 'utf8');

/** Les désarmements des six faits — le (a) et le (d) en deux formes —, chacun UNE variation du dépôt réel (RM-11). */
interface Desarmement {
  fait: string;
  famille: string;
  /** Ce que le refus doit NOMMER : l'étape, le script ou la garde. */
  nomme: string;
  ci?: (t: string) => string;
  pkg?: (t: string) => string;
}

const ETAPE_VUE_ETAT = '      - name: La vue de l etat vivant est egale a sa source\n';
const DESARMEMENTS: readonly Desarmement[] = [
  {
    fait: '(a) une garde dont les deux étapes sont réduites à un COMMENTAIRE',
    famille: 'garde_ecrite_jamais_appelee',
    nomme: 'jur:grille-chiffree',
    ci: (t) =>
      remplacerUneFois(
        t,
        '      - name: Grille du contrat — aucun forfait, bareme ou pourcentage sans chiffre dans l annexe 1\n' +
          '        run: pnpm jur:grille-chiffree\n' +
          '      - name: La garde de la grille chiffree sait rougir\n' +
          '        run: pnpm jur:grille-chiffree:prove\n',
        '      # - name: Grille du contrat — aucun forfait, bareme ou pourcentage sans chiffre dans l annexe 1\n' +
          '      #   run: pnpm jur:grille-chiffree\n' +
          '      # - name: La garde de la grille chiffree sait rougir\n' +
          '      #   run: pnpm jur:grille-chiffree:prove\n'
      ),
  },
  {
    fait: '(a, citation) une garde dont les deux étapes ne font plus que la CITER — dans un `name:` et un `echo`',
    famille: 'garde_ecrite_jamais_appelee',
    nomme: 'jur:grille-chiffree',
    ci: (t) =>
      remplacerUneFois(
        t,
        '      - name: Grille du contrat — aucun forfait, bareme ou pourcentage sans chiffre dans l annexe 1\n' +
          '        run: pnpm jur:grille-chiffree\n' +
          '      - name: La garde de la grille chiffree sait rougir\n' +
          '        run: pnpm jur:grille-chiffree:prove\n',
        '      - name: pnpm jur:grille-chiffree\n' +
          '        run: echo pnpm jur:grille-chiffree scripts/gates/jur-grille-chiffree.ts\n' +
          '      - name: La garde de la grille chiffree sait rougir\n' +
          '        run: echo "pnpm jur:grille-chiffree:prove"\n'
      ),
  },
  {
    fait: '(b) l’étape qui vérifie la vue d’état RETIRÉE — elle ne lance aucun script de garde',
    famille: 'etape_absente',
    nomme: 'La vue de l etat vivant est egale a sa source',
    ci: (t) => remplacerUneFois(t, ETAPE_VUE_ETAT + '        run: pnpm plan-state:verifier\n', ''),
  },
  {
    fait: '(c) une étape désarmée par une condition toujours fausse',
    famille: 'etape_conditionnee',
    nomme: 'Etat vivant — fraicheur, verrou d owner, journal',
    ci: (t) =>
      remplacerUneFois(
        t,
        '      - name: Etat vivant — fraicheur, verrou d owner, journal\n',
        '      - name: Etat vivant — fraicheur, verrou d owner, journal\n        if: ${{ false }}\n'
      ),
  },
  {
    fait: '(d) une tolérance d’échec sous sa forme ÉVALUÉE, sur une étape qui n’est pas un lint',
    famille: 'etape_toleree',
    nomme: 'Typecheck',
    ci: (t) =>
      remplacerUneFois(
        t,
        '      - name: Typecheck\n        run: pnpm typecheck\n',
        '      - name: Typecheck\n        run: pnpm typecheck\n        continue-on-error: ${{ true }}\n'
      ),
  },
  {
    fait: '(e) le script de `package.json` d’une étape REPOINTÉ vers une commande qui ne mesure rien',
    famille: 'script_repointe',
    nomme: 'plan-state:verifier',
    pkg: (t) => {
      const p = JSON.parse(t) as { scripts: Record<string, string> };
      if (!p.scripts['plan-state:verifier']) throw new Error('témoin mal posé');
      p.scripts['plan-state:verifier'] = 'node -e "process.exit(0)"';
      return JSON.stringify(p, null, 2) + '\n';
    },
  },
  {
    fait: '(d, shell) la commande d’une étape rendue inopérante par une tolérance écrite dans le shell',
    famille: 'etape_repointee',
    nomme: 'La garde de l etat vivant sait rougir',
    ci: (t) =>
      remplacerUneFois(
        t,
        '        run: pnpm gov:etat:prove\n',
        '        run: pnpm gov:etat:prove || true\n'
      ),
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
  };
}

async function famillesDe(vue: Vue): Promise<string[]> {
  const porte = await confronterLaPorteA(vue);
  return [...new Set([...controler(vue), ...porte.fautes].map((f) => f.famille))].sort();
}

async function messagesDe(vue: Vue): Promise<string> {
  const porte = await confronterLaPorteA(vue);
  return [...controler(vue), ...porte.fautes].map((f) => f.message).join('\n');
}

/**
 * Le nombre d'étapes de la porte A, TOUS jobs confondus (GOV-142), recompté ICI par l'analyseur
 * partagé — pas par la garde.
 */
async function etapesDuJob(): Promise<number> {
  const w = (await lireYaml(CI_REEL)) as { jobs: Record<string, { steps: unknown[] }> };
  return Object.values(w.jobs).reduce((n, j) => n + j.steps.length, 0);
}

describe('REQ-QA-013 — la porte A du dépôt est présente, active et effective', () => {
  it('REQ-QA-013 — le workflow du dépôt passe, et CHAQUE étape du job est confrontée', async () => {
    const porte = await confronterLaPorteA(lireVue());
    expect(porte.fautes).toEqual([]);
    const n = await etapesDuJob();
    // PLANCHER : une confrontation qui ne lirait rien se lirait « aucune étape désarmée ».
    expect(n).toBeGreaterThan(0);
    expect(porte.etapes).toBe(n);
  });

  it('REQ-QA-013 — le binaire sort en zéro et IMPRIME le compte des étapes réellement confrontées', async () => {
    const { code, sortie } = lancer(RACINE);
    expect(code).toBe(0);
    expect(sortie).toMatch(new RegExp(`PORTE A — ${await etapesDuJob()} étape\\(s\\)`));
  }, 120_000);

  it('REQ-QA-013 — chaque script de `package.json` lancé par une étape du job est FIGÉ', async () => {
    const w = (await lireYaml(CI_REEL)) as { jobs: Record<string, { steps: { run?: string }[] }> };
    const scripts = (JSON.parse(PKG_REEL) as { scripts: Record<string, string> }).scripts;
    const lances = Object.values(w.jobs)
      .flatMap((j) => j.steps)
      .map((e) => /^pnpm\s+(\S+)/.exec((e.run ?? '').trim())?.[1])
      .filter((s): s is string => s !== undefined && Object.hasOwn(scripts, s));
    expect(lances.length).toBeGreaterThan(0);
    expect(lances.filter((s) => !Object.hasOwn(PORTE_A_FIGEE.scripts, s))).toEqual([]);
  });
});

describe('REQ-GOV-012 — les six faits, chaque désarmement un refus NOMMÉ (copies en mémoire)', () => {
  for (const d of DESARMEMENTS) {
    it(`REQ-GOV-012 — ${d.fait} : ${d.famille}, et le refus nomme « ${d.nomme} »`, async () => {
      const vue = vueDesarmee(d);
      expect(await famillesDe(vue)).toContain(d.famille);
      expect(await messagesDe(vue)).toContain(d.nomme);
    });
  }

  it('REQ-GOV-012 — CONTRE-TÉMOIN : un commentaire AJOUTÉ au workflow ne change rien, dans aucun sens', async () => {
    const vue = vueDesarmee({
      fait: 'commentaire',
      famille: '',
      nomme: '',
      ci: (t) =>
        remplacerUneFois(
          t,
          ETAPE_VUE_ETAT,
          '      # pnpm gov:fantome — cité, jamais lancé\n' + ETAPE_VUE_ETAT
        ),
    });
    expect(await famillesDe(vue)).toEqual([]);
  });

  it('REQ-GOV-012 — CONTRE-TÉMOIN : la vue de référence passe la porte A qu’elle fige elle-même', async () => {
    expect((await confronterLaPorteA(VUE_CONFORME)).fautes).toEqual([]);
  });
});

/**
 * VETO DE SÉCURITÉ SUR LA PR 175 — L'ÉTAPE ET LE JOB SONT FIGÉS EN ENTIER. La confrontation ne lisait
 * que quatre clés par étape (`if`, `continue-on-error`, `run`, `uses`) et deux du job : toute AUTRE
 * clé désarmait la porte en exit 0 sans toucher au constat. La classe : une clé que le constat ne
 * porte pas, ajoutée, retirée ou modifiée — à l'étape, au job ou au workflow — est une faute NOMMÉE.
 */
interface Alteration {
  quoi: string;
  famille: string;
  nomme: readonly string[];
  ci: (t: string) => string;
}
const ALTERATIONS: readonly Alteration[] = [
  {
    quoi: 'une clé `shell:` sur une étape — un shell qui rend toujours 0',
    famille: 'porte_a_alteree',
    nomme: ['Typecheck', 'shell'],
    ci: (t) =>
      remplacerUneFois(
        t,
        '        run: pnpm typecheck\n',
        "        run: pnpm typecheck\n        shell: sh -c 'exit 0' {0}\n"
      ),
  },
  {
    quoi: '`defaults: run: shell:` sur le JOB — ses étapes désarmées d’un coup',
    famille: 'porte_a_alteree',
    nomme: ['gate-a', 'defaults'],
    ci: (t) =>
      remplacerUneFois(
        t,
        '\n  gate-a:\n',
        "\n  gate-a:\n    defaults:\n      run:\n        shell: sh -c 'exit 0' {0}\n"
      ),
  },
  {
    quoi: '`with: ref:` sur le checkout — la porte mesure un AUTRE arbre',
    famille: 'porte_a_alteree',
    nomme: ['uses: actions/checkout@v4', 'with'],
    ci: (t) =>
      remplacerDansLeJob(
        t,
        'gardes',
        '        with: { fetch-depth: 0 }\n',
        '        with: { fetch-depth: 0, ref: main }\n'
      ),
  },
  {
    quoi: 'une clé INCONNUE du constat ajoutée à une étape',
    famille: 'porte_a_alteree',
    nomme: ['Format', 'working-directory'],
    ci: (t) =>
      remplacerUneFois(
        t,
        '        run: pnpm format:check\n',
        '        run: pnpm format:check\n        working-directory: ./vide\n'
      ),
  },
  {
    quoi: 'l’`env:` d’une étape MODIFIÉ',
    famille: 'porte_a_alteree',
    nomme: ['Tests — un eclat de la suite', 'env'],
    ci: (t) =>
      remplacerDansLeJob(
        t,
        'tests-2',
        '        run: pnpm test:eclat\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n',
        '        run: pnpm test:eclat\n        env:\n          GH_TOKEN: ${{ secrets.AUTRE }}\n'
      ),
  },
  {
    quoi: 'l’`env:` d’une étape RETIRÉ',
    famille: 'porte_a_alteree',
    nomme: ['Tests — un eclat de la suite', 'env'],
    // Le bloc ENTIER : l'instantané de la forge (`GOV_FORGE`, QA-T64) et le numéro de l'éclat (GOV-142).
    ci: (t) =>
      remplacerDansLeJob(
        t,
        'tests-2',
        '        run: pnpm test:eclat\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n' +
          '          GOV_FORGE: ${{ runner.temp }}/forge-instantane.json\n          ECLAT: 2/2\n',
        '        run: pnpm test:eclat\n'
      ),
  },
  {
    quoi: 'un `env:` posé au niveau du WORKFLOW, qui agit sur le job',
    famille: 'porte_a_alteree',
    nomme: ['workflow', 'env'],
    ci: (t) => remplacerUneFois(t, 'name: Gate A\n', 'name: Gate A\nenv:\n  CI: "false"\n'),
  },
  {
    quoi: 'deux étapes de MÊME nom — la seconde échappait à la confrontation',
    famille: 'etape_en_double',
    nomme: ['Typecheck'],
    ci: (t) =>
      remplacerUneFois(
        t,
        '      - name: Typecheck\n        run: pnpm typecheck\n',
        '      - name: Typecheck\n        run: pnpm typecheck\n' +
          "      - name: Typecheck\n        run: pnpm typecheck\n        shell: sh -c 'exit 0' {0}\n"
      ),
  },
];

describe('REQ-GOV-012 — l’étape ENTIÈRE et le job ENTIER sont figés : aucune clé ne désarme en silence', () => {
  for (const a of ALTERATIONS) {
    it(`REQ-GOV-012 — ${a.quoi} : ${a.famille}, nommée`, async () => {
      const vue = vueDesarmee({ fait: a.quoi, famille: a.famille, nomme: '', ci: a.ci });
      const porte = await confronterLaPorteA(vue);
      expect(porte.fautes.map((f) => f.famille)).toContain(a.famille);
      const dites = porte.fautes
        .filter((f) => f.famille === a.famille)
        .map((f) => f.message)
        .join('\n');
      for (const n of a.nomme) expect(dites).toContain(n);
    });
  }

  it('REQ-GOV-012 — CONTRE-TÉMOIN : le vrai ci.yml passe, étapes, job et workflow figés compris', async () => {
    expect((await confronterLaPorteA(lireVue())).fautes).toEqual([]);
  });
});

// ── les copies de travail, sur le binaire ────────────────────────────────────────────────────

function copieDeTravail(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gov-061-'));
  const suivis = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const f of suivis.filter(
    (s) =>
      [
        'docs/gates.json',
        'docs/tasks.json',
        'package.json',
        '.claude/settings.json',
        'eslint.config.mjs',
        '.prettierrc.json',
      ].includes(s) || /^\.github\/workflows\/.+\.ya?ml$/.test(s)
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

describe('REQ-GOV-029 — chaque copie de travail désarmée font sortir la garde en non nul', () => {
  it('REQ-GOV-029 — la copie intacte sort en zéro ; chaque copie désarmée sort en non nul, famille et étape NOMMÉES', () => {
    const dir = copieDeTravail();
    try {
      const intacte = lancer(dir);
      expect(intacte.code, intacte.sortie.slice(-1500)).toBe(0);
      for (const d of DESARMEMENTS) {
        if (d.ci) writeFileSync(join(dir, CI), d.ci(CI_REEL));
        if (d.pkg) writeFileSync(join(dir, 'package.json'), d.pkg(PKG_REEL));
        const r = lancer(dir);
        writeFileSync(join(dir, CI), CI_REEL);
        writeFileSync(join(dir, 'package.json'), PKG_REEL);
        expect(r.code, d.fait).not.toBe(0);
        expect(r.sortie, d.fait).toContain(`[${d.famille}]`);
        expect(r.sortie, d.fait).toContain(d.nomme);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});

/**
 * Les commentaires qui PRÉCÈDENT une étape et lui attribuent un refus de `continue-on-error`, lus
 * dans le texte réel : le bloc de lignes `#` contiguës juste au-dessus d'un `- name:`.
 */
function attributionsDesCommentaires(): { etape: string; famille: string; garde: string | null }[] {
  const out: { etape: string; famille: string; garde: string | null }[] = [];
  let bloc: string[] = [];
  for (const ligne of CI_REEL.split(/\r?\n/)) {
    const commentaire = /^\s*#(.*)$/.exec(ligne);
    if (commentaire) {
      bloc.push(commentaire[1]!);
      continue;
    }
    const etape = /^\s*- name:\s*(.+)$/.exec(ligne);
    const texte = bloc.join(' ');
    if (etape && /continue-on-error/.test(texte)) {
      for (const m of texte.matchAll(/famille\s+`([a-z_]+)`(?:\s+de\s+`([a-z:-]+)`)?/g)) {
        out.push({ etape: etape[1]!.trim(), famille: m[1]!, garde: m[2] ?? null });
      }
    }
    bloc = [];
  }
  return out;
}

describe('REQ-GOV-029 — (f) un commentaire du workflow ne promet que les refus que la garde PORTE', () => {
  it('REQ-GOV-029 — un refus de `continue-on-error` attribué à `gov:conventions` est EXÉCUTÉ sur son étape, et il rougit', async () => {
    const attributions = attributionsDesCommentaires().filter(
      (a) => a.garde === 'gov:conventions' || FAMILLES.some((f) => f === a.famille)
    );
    // PLANCHER : sans attribution lue, ce témoin ne jugerait rien.
    expect(attributions.length).toBeGreaterThan(0);
    const muettes: string[] = [];
    for (const a of attributions) {
      const entete = `      - name: ${a.etape}\n`;
      const i = CI_REEL.indexOf(entete);
      const fin = CI_REEL.indexOf('\n', CI_REEL.indexOf('        run:', i));
      const ci =
        CI_REEL.slice(0, fin + 1) + '        continue-on-error: true\n' + CI_REEL.slice(fin + 1);
      const vue = lireVue();
      const desarmee: Vue = {
        ...vue,
        workflows: vue.workflows.map((w) => (w.chemin === CI ? { ...w, source: ci } : w)),
      };
      if (!(await famillesDe(desarmee)).includes(a.famille))
        muettes.push(`${a.etape} → ${a.famille}`);
    }
    expect(muettes).toEqual([]);
  });

  it('REQ-GOV-029 — une famille attribuée par un commentaire à une AUTRE garde existe dans cette garde', () => {
    const scripts = (JSON.parse(PKG_REEL) as { scripts: Record<string, string> }).scripts;
    const absentes = attributionsDesCommentaires()
      .filter((a) => a.garde !== 'gov:conventions' && !FAMILLES.some((f) => f === a.famille))
      .filter((a) => {
        const chemin = a.garde
          ? /\s(scripts\/gates\/\S+\.ts)/.exec(scripts[a.garde] ?? '')?.[1]
          : null;
        const lus = chemin
          ? [chemin]
          : execFileSync('git', ['ls-files', 'scripts/gates/'], { encoding: 'utf8' })
              .split(/\r?\n/)
              .filter((f) => f.endsWith('.ts'));
        return !lus.some((f) => readFileSync(f, 'utf8').includes(`'${a.famille}'`));
      });
    expect(absentes).toEqual([]);
  });

  it('REQ-GOV-029 — aucun commentaire n’écrit un compte d’étapes que le job ne porte pas', async () => {
    const n = await etapesDuJob();
    const commentaires = CI_REEL.split(/\r?\n/)
      .map((l) => /^\s*#(.*)$/.exec(l)?.[1] ?? '')
      .join('\n');
    const comptes = [...commentaires.matchAll(/\b(\d+) etapes\b|\betape \d+ sur (\d+)\b/g)].map(
      (m) => Number(m[1] ?? m[2])
    );
    expect(comptes.filter((c) => c !== n)).toEqual([]);
  });
});

/**
 * REFUS D'EXACTITUDE ET VETOS DE SÉCURITÉ SUR LA PR 175 — UNE GARDE N'EST APPELÉE QUE SI UNE ÉTAPE
 * N'EXÉCUTE QU'ELLE. On ne découpe plus la ligne de commande et on ne juge plus ce qui s'y exécute :
 * le `run:` doit être EXACTEMENT une commande simple, sur une ligne, sans affectation en tête, dont
 * l'outil lance le FICHIER de la garde — directement (`tsx`, `node`, `bash`, `sh`, `npx tsx`), ou par
 * `pnpm run <script>` (ou `pnpm <script>` hors commande intégrée de pnpm) dont la VALEUR obéit à la
 * même règle. Toute autre forme n'appelle rien, même si elle lance réellement la garde : citée,
 * court-circuitée, inatteignable, masquée, en arrière-plan, composée, derrière une affectation. La
 * garde `mutation` (`scripts/gates/stryker.sh`) n'est lancée que par une étape de `nightly.yml`
 * (`pnpm mutation`, qui vaut `bash scripts/gates/stryker.sh`) : chaque forme ci-dessous remplace
 * cette seule étape, sur une copie en mémoire.
 */
const NIGHTLY = '.github/workflows/nightly.yml';
const RUN_MUTATION = '        run: pnpm mutation\n';

/** La clé `run:` d'une étape : sur une ligne, ou en bloc littéral si la commande en porte plusieurs. */
function runYaml(run: string): string {
  if (!run.includes('\n')) return `        run: ${run}\n`;
  const lignes = run.split('\n').map((l) => `          ${l}\n`);
  return `        run: |\n${lignes.join('')}`;
}

function nuitEn(run: string, hooks?: string): Vue {
  const vue = lireVue();
  return {
    ...vue,
    workflows: vue.workflows.map((w) =>
      w.chemin === NIGHTLY
        ? { ...w, source: remplacerUneFois(w.source, RUN_MUTATION, runYaml(run)) }
        : w
    ),
    hooks: hooks ?? vue.hooks,
  };
}

/** Les réglages RÉELS, plus UNE commande de crochet : le reste des réglages reste ce qu'il est. */
function reglagesPlus(command: string): string {
  const reels = JSON.parse(lireVue().hooks || '{}') as Record<string, unknown>;
  return JSON.stringify({ ...reels, temoin: { hooks: [{ type: 'command', command }] } });
}

const APPELS_QUI_N_EN_SONT_PAS: readonly { forme: string; run: string }[] = [
  {
    forme: 'citée entre guillemets doubles, après un `;`',
    run: 'echo "nuit sautee; pnpm mutation"',
  },
  {
    forme: 'citée entre guillemets simples, entre parenthèses',
    run: "echo 'desactive (pnpm mutation)'",
  },
  {
    forme: 'citée entre guillemets doubles, après un guillemet échappé',
    run: 'echo "a \\" ; pnpm mutation"',
  },
  { forme: 'court-circuitée à droite de `true ||`', run: 'true || pnpm mutation' },
  { forme: 'inatteignable après un `exit`', run: 'exit 0; pnpm mutation' },
  {
    forme: 'dans un pipeline, statut masqué par la commande suivante',
    run: 'pnpm mutation | tee /dev/null',
  },
  { forme: 'lancée en arrière-plan', run: 'pnpm mutation &' },
  { forme: 'enfermée dans une substitution', run: 'echo $(pnpm mutation)' },
  {
    forme: 'sous une construction `if` que la lecture ne juge pas',
    run: 'if false; then pnpm mutation; fi',
  },
  // REFUS D'EXACTITUDE ET VETO DE SÉCURITÉ, TOUR 3 — la règle STRICTE : une étape n'appelle une
  // garde que si elle n'exécute QU'ELLE. Chaque forme ci-dessous lance la garde sans que son échec
  // fasse échouer l'étape, ou sans qu'elle s'exécute : aucune n'est un appel.
  {
    forme: 'garde NON FINALE d’une liste `&&` suivie d’une autre ligne (bash -e avale son échec)',
    run: 'pnpm mutation && echo fait\necho fin',
  },
  { forme: 'après un `set +e`', run: 'set +e; pnpm mutation; echo fin' },
  {
    forme: 'derrière un test `[ … ] &&` qui ne passe jamais',
    run: '[ -n "$NUIT" ] && pnpm mutation',
  },
  { forme: 'après un piège `trap` qui rend 0', run: "trap 'exit 0' EXIT\npnpm mutation" },
  {
    forme: 'après un `alias` qui remplace l’outil',
    run: 'shopt -s expand_aliases; alias pnpm=true\npnpm mutation',
  },
  { forme: 'après un `eval`', run: 'eval \'trap "exit 0" EXIT\'; pnpm mutation' },
  {
    forme: 'une expression d’Actions qui INJECTE un opérateur',
    run: "pnpm mutation ${{ '|| true' }}",
  },
  // Les formes COMPOSÉES que le tour 2 lisait comme des appels : le PRIX de la règle stricte. On
  // écrit la garde dans une étape à part.
  { forme: 'enchaînée par `&&` à une autre commande', run: 'pnpm mutation:prove && pnpm mutation' },
  { forme: 'un argument qui porte une substitution', run: 'pnpm mutation --seuil $(date -u +%F)' },
  {
    forme: 'un argument qui porte une expression d’Actions',
    run: "pnpm mutation --phase ${{ inputs.phase || '-1' }}",
  },
  { forme: 'après un guillemet échappé et un `;`', run: 'echo \\"x; pnpm mutation' },
  { forme: 'suivie d’une seconde ligne', run: 'pnpm mutation\necho fin' },
  // VETO DE SÉCURITÉ, TOUR 4 — une affectation en tête de commande configure le LANCEUR : un
  // `npm_config_script_shell` qui rend toujours 0, un `NODE_OPTIONS` qui précharge du code. Aucune
  // affectation n'est admise dans une étape qui appelle une garde.
  { forme: 'derrière une affectation `CI=1`', run: 'CI=1 pnpm mutation --flag' },
  { forme: 'derrière une affectation `MODE=nuit`', run: 'MODE=nuit pnpm run mutation' },
  {
    forme: 'derrière `npm_config_script_shell`, qui remplace le shell des scripts',
    run: 'npm_config_script_shell=/bin/true pnpm run mutation',
  },
];

describe('REQ-GOV-029 — une étape qui n’exécute pas SEULEMENT la garde ne l’appelle pas (copies en mémoire de nightly.yml)', () => {
  for (const a of APPELS_QUI_N_EN_SONT_PAS) {
    it(`REQ-GOV-029 — \`${a.run}\` (${a.forme}) : garde_ecrite_jamais_appelee, nommée`, () => {
      const fautes = controler(nuitEn(a.run)).filter(
        (f) => f.famille === 'garde_ecrite_jamais_appelee'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain('`mutation`');
    });
  }

  it('REQ-GOV-029 — une `command` des réglages lue de même : `exit 0; pnpm mutation` n’appelle rien', () => {
    const hooks = reglagesPlus('exit 0; pnpm mutation');
    const fautes = controler(nuitEn('echo nuit', hooks)).filter(
      (f) => f.famille === 'garde_ecrite_jamais_appelee'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('`mutation`');
  });

  for (const run of [
    'pnpm mutation',
    'pnpm run mutation',
    "pnpm mutation --seuil '80'",
    'bash scripts/gates/stryker.sh',
  ]) {
    it(`REQ-GOV-029 — CONTRE-TÉMOIN : \`${run}\` appelle bien \`mutation\``, () => {
      expect(controler(nuitEn(run)).map((f) => f.famille)).toEqual([]);
    });
  }

  it('REQ-GOV-029 — CONTRE-TÉMOIN : une `command` des réglages qui lance la garde la tient pour appelée', () => {
    const hooks = reglagesPlus('pnpm mutation');
    expect(controler(nuitEn('echo nuit', hooks)).map((f) => f.famille)).toEqual([]);
  });
});

/**
 * VETO DE SÉCURITÉ (1), UN ÉTAGE PLUS BAS — la configuration du gestionnaire de paquets de la racine
 * change ce que `pnpm <script>` exécute (le shell des scripts, leurs crochets) sans toucher ni au
 * workflow ni au script : elle est figée au constat de la porte A.
 */
describe('REQ-GOV-012 — la configuration pnpm/npm de la racine est figée : aucun fichier ne change le shell des scripts', () => {
  const avec = (fichier: string): Vue => {
    const vue = lireVue();
    return { ...vue, fichiersSuivis: [...vue.fichiersSuivis, fichier] };
  };
  for (const fichier of ['.npmrc', 'pnpm-workspace.yaml', '.pnpmfile.cjs']) {
    it(`REQ-GOV-012 — un \`${fichier}\` suivi à la racine : porte_a_alteree, nommé`, async () => {
      const fautes = (await confronterLaPorteA(avec(fichier))).fautes.filter(
        (f) => f.famille === 'porte_a_alteree'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain(fichier);
    });
  }

  it('REQ-GOV-012 — une clé `pnpm` posée dans package.json : porte_a_alteree, nommée', async () => {
    const vue = lireVue();
    const pkg = JSON.parse(vue.packageJson) as Record<string, unknown>;
    const alteree: Vue = {
      ...vue,
      packageJson: JSON.stringify({ ...pkg, pnpm: { scriptShell: 'true' } }),
    };
    const fautes = (await confronterLaPorteA(alteree)).fautes.filter(
      (f) => f.famille === 'porte_a_alteree'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('pnpm');
  });

  it('REQ-GOV-012 — CONTRE-TÉMOIN : un `.npmrc` hors de la racine ne touche pas la porte A', async () => {
    expect((await confronterLaPorteA(avec('packages/contracts/.npmrc'))).fautes).toEqual([]);
  });
});

/**
 * VETO DE SÉCURITÉ, TOUR 3 — LES CROCHETS DE CYCLE DE VIE DE LA RACINE. L'étape `pnpm install
 * --frozen-lockfile` n'était figée que par sa commande : pnpm 9 y exécute, pour le projet racine,
 * `pnpm:devPreinstall`, `preinstall`, `install`, `postinstall`, `preprepare`, `prepare`, `postprepare`
 * — AVANT toutes les gardes. Et `enable-pre-post-scripts` vaut `true` par défaut : un `pre<script>` ou
 * un `post<script>` tourne autour de chaque `pnpm <script>` de la porte. La VALEUR de chaque crochet
 * est figée, et l'ABSENCE des autres : tout ajout, retrait ou changement est un refus nommé.
 */
describe('REQ-GOV-012 — les crochets de cycle de vie de la racine sont figés : valeur, et absence des autres', () => {
  const avecScripts = (change: (s: Record<string, string>) => void): Vue => {
    const vue = lireVue();
    const pkg = JSON.parse(vue.packageJson) as { scripts: Record<string, string> };
    change(pkg.scripts);
    return { ...vue, packageJson: JSON.stringify(pkg, null, 2) + '\n' };
  };
  const alterations: readonly {
    quoi: string;
    nomme: string;
    change: (s: Record<string, string>) => void;
  }[] = [
    {
      quoi: '`postinstall` repointé',
      nomme: 'postinstall',
      change: (s) => {
        s.postinstall = 'prisma generate && node -e "process.exit(0)"';
      },
    },
    {
      quoi: '`postinstall` retiré',
      nomme: 'postinstall',
      change: (s) => {
        delete s.postinstall;
      },
    },
    {
      quoi: '`preinstall` ajouté',
      nomme: 'preinstall',
      change: (s) => {
        s.preinstall = 'node scripts/desarmer.js';
      },
    },
    {
      quoi: '`prepare` ajouté',
      nomme: 'prepare',
      change: (s) => {
        s.prepare = 'node scripts/desarmer.js';
      },
    },
    {
      quoi: '`pnpm:devPreinstall` ajouté',
      nomme: 'pnpm:devPreinstall',
      change: (s) => {
        s['pnpm:devPreinstall'] = 'node scripts/desarmer.js';
      },
    },
    {
      quoi: 'un `pre<script>` posé devant une garde de la porte',
      nomme: 'pregov:conventions',
      change: (s) => {
        s['pregov:conventions'] = 'node scripts/desarmer.js';
      },
    },
    {
      quoi: 'un `post<script>` posé derrière une garde de la porte',
      nomme: 'posttest',
      change: (s) => {
        s.posttest = 'node scripts/desarmer.js';
      },
    },
  ];
  for (const a of alterations) {
    it(`REQ-GOV-012 — ${a.quoi} : porte_a_alteree, nommé`, async () => {
      const fautes = (await confronterLaPorteA(avecScripts(a.change))).fautes.filter(
        (f) => f.famille === 'porte_a_alteree'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain(`\`${a.nomme}\``);
    });
  }

  it('REQ-GOV-012 — CONTRE-TÉMOIN : un script ordinaire ajouté ne touche pas la porte A', async () => {
    const vue = avecScripts((s) => {
      s['outil:local'] = 'tsx scripts/outil.ts';
    });
    expect((await confronterLaPorteA(vue)).fautes).toEqual([]);
  });

  it('REQ-GOV-012 — chaque script lancé par la porte est figé par sa VALEUR, pas par son nom', () => {
    const scripts = (JSON.parse(PKG_REEL) as { scripts: Record<string, string> }).scripts;
    for (const [nom, valeur] of Object.entries(PORTE_A_FIGEE.scripts)) {
      expect({ nom, valeur: scripts[nom] }).toEqual({ nom, valeur });
    }
  });
});

/**
 * REFUS D'EXACTITUDE ET VETO DE SÉCURITÉ, TOUR 4. (1) Une garde passait pour appelée dès qu'une étape
 * lançait le script de `package.json` qui porte son IDENTIFIANT, quelle que soit sa VALEUR : un script
 * réduit à `true` gardait sa garde « câblée ». Seul compte désormais le FICHIER de la garde, exécuté
 * par une étape, directement ou à travers les valeurs de `package.json`. (2) `pnpm <mot>` exécute la
 * COMMANDE INTÉGRÉE de pnpm quand `<mot>` en est une, jamais le script du même nom : `pnpm ls` ne
 * lance pas un script `ls`, et un script qui porte un nom réservé est refusé. (3) Le `packageManager`
 * que lit `pnpm/action-setup` est figé par sa valeur.
 */
describe('REQ-GOV-029 — une garde est appelée par son FICHIER exécuté, jamais par un nom (tour 4)', () => {
  const avecPaquet = (vue: Vue, change: (p: Record<string, unknown>) => void): Vue => {
    const pkg = JSON.parse(vue.packageJson) as Record<string, unknown>;
    change(pkg);
    return { ...vue, packageJson: JSON.stringify(pkg, null, 2) + '\n' };
  };
  const scriptsDe = (p: Record<string, unknown>): Record<string, string> =>
    p.scripts as Record<string, string>;
  const jamaisAppelee = (vue: Vue): string =>
    controler(vue)
      .filter((f) => f.famille === 'garde_ecrite_jamais_appelee')
      .map((f) => f.message)
      .join('\n');
  const ANNEE_PROUVE = '        run: pnpm securite:annee-naissance:prove\n';
  const ANNEE = '        run: pnpm securite:annee-naissance\n';
  const nuitAnnee = (prouve: string, verdict: string): Vue => {
    const vue = lireVue();
    return {
      ...vue,
      workflows: vue.workflows.map((w) =>
        w.chemin === NIGHTLY
          ? {
              ...w,
              source: remplacerUneFois(
                remplacerUneFois(w.source, ANNEE_PROUVE, runYaml(prouve)),
                ANNEE,
                runYaml(verdict)
              ),
            }
          : w
      ),
    };
  };

  it('REQ-GOV-029 — la VALEUR du script `mutation` remplacée par `true`, étapes intactes : `mutation` n’est plus appelée', () => {
    const vue = avecPaquet(lireVue(), (p) => {
      scriptsDe(p).mutation = 'true';
    });
    expect(jamaisAppelee(vue)).toContain('`mutation`');
  });

  it('REQ-GOV-029 — les VALEURS des deux scripts d’une garde remplacées par `true` : elle n’est plus appelée', () => {
    const vue = avecPaquet(lireVue(), (p) => {
      scriptsDe(p)['securite:annee-naissance'] = 'true';
      scriptsDe(p)['securite:annee-naissance:prove'] = 'true';
    });
    expect(jamaisAppelee(vue)).toContain('`securite:annee-naissance`');
  });

  it('REQ-GOV-029 — `pnpm ls` avec un script `ls` qui lance la garde : pnpm exécute sa commande intégrée, rien n’est appelé', () => {
    const vue = avecPaquet(nuitEn('pnpm ls'), (p) => {
      scriptsDe(p).ls = 'bash scripts/gates/stryker.sh';
    });
    expect(jamaisAppelee(vue)).toContain('`mutation`');
  });

  it('REQ-GOV-029 — `NODE_OPTIONS=… tsx <fichier>` : une affectation configure le lanceur, rien n’est appelé', () => {
    const vue = nuitAnnee(
      'echo nuit',
      'NODE_OPTIONS=--require=./desarme.cjs tsx scripts/gates/aucun-annee-de-naissance.ts'
    );
    expect(jamaisAppelee(vue)).toContain('`securite:annee-naissance`');
  });

  it('REQ-GOV-029 — CONTRE-TÉMOIN : `tsx <fichier>` seul, sans affectation, appelle la garde', () => {
    const vue = nuitAnnee('echo nuit', 'tsx scripts/gates/aucun-annee-de-naissance.ts');
    expect(controler(vue).map((f) => f.famille)).toEqual([]);
  });

  it('REQ-GOV-029 — CONTRE-TÉMOIN : le vrai dépôt, `mutation` comprise (lancée par `bash scripts/gates/stryker.sh`)', () => {
    const vue = lireVue();
    expect(scriptsDe(JSON.parse(vue.packageJson) as Record<string, unknown>).mutation).toBe(
      'bash scripts/gates/stryker.sh'
    );
    expect(controler(vue).map((f) => f.famille)).toEqual([]);
  });

  for (const [nom, valeur] of [
    ['audit', 'tsx scripts/gates/gov-conventions.ts'],
    ['ls', 'bash scripts/gates/stryker.sh'],
  ] as const) {
    it(`REQ-GOV-012 — un script nommé \`${nom}\`, commande intégrée de pnpm : porte_a_alteree, nommé`, async () => {
      const vue = avecPaquet(lireVue(), (p) => {
        scriptsDe(p)[nom] = valeur;
      });
      const fautes = (await confronterLaPorteA(vue)).fautes.filter(
        (f) => f.famille === 'porte_a_alteree'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain(`\`${nom}\``);
    });
  }

  // VETO DE SÉCURITÉ, TOUR 5 — la table des commandes de pnpm 9.12.0 est un objet JS ordinaire : un
  // mot qui nomme une propriété HÉRITÉE d'`Object.prototype` y passe pour une commande, et `pnpm <mot>`
  // sort sans lancer le script de ce nom. Le script `mutation` est RENOMMÉ, l'étape repointée.
  const renomme = (vue: Vue, nom: string): Vue =>
    avecPaquet(vue, (p) => {
      const s = scriptsDe(p);
      s[nom] = s.mutation!;
      delete s.mutation;
    });
  for (const nom of ['toString', 'constructor']) {
    it(`REQ-GOV-029 — script \`mutation\` renommé \`${nom}\`, étape de nightly.yml repointée sur \`pnpm ${nom}\` : rien n’est appelé`, () => {
      expect(jamaisAppelee(renomme(nuitEn(`pnpm ${nom}`), nom))).toContain('`mutation`');
    });
    it(`REQ-GOV-029 — script \`mutation\` renommé \`${nom}\`, lancé par une \`command\` des réglages \`pnpm ${nom}\` : rien n’est appelé`, () => {
      const vue = renomme(nuitEn('echo nuit', reglagesPlus(`pnpm ${nom}`)), nom);
      expect(jamaisAppelee(vue)).toContain('`mutation`');
    });
  }

  it('REQ-GOV-029 — `pnpm <mot>` hors de la forme ASCII basse `^[a-z][a-z0-9:_-]*$` : rien n’est appelé (échec fermé)', () => {
    expect(jamaisAppelee(renomme(nuitEn('pnpm Mutation'), 'Mutation'))).toContain('`mutation`');
  });

  it('REQ-GOV-029 — CONTRE-TÉMOIN : `pnpm run constructor` compte (mesuré : `run` lit les scripts, pas la table des commandes)', () => {
    const vue = renomme(nuitEn('pnpm run constructor'), 'constructor');
    expect(jamaisAppelee(vue)).toBe('');
  });

  it('REQ-GOV-012 — un script nommé `valueOf`, nom hérité d’Object.prototype que pnpm prend pour une commande : porte_a_alteree, nommé', async () => {
    const vue = avecPaquet(lireVue(), (p) => {
      // `valueOf` est justement le sujet de ce témoin : c'est un nom HÉRITÉ d'`Object.prototype`.
      // Conséquence pour le compilateur, et elle n'est pas un détail de confort : sur un nom connu
      // d'`Object`, TypeScript résout le MEMBRE DÉCLARÉ (`() => Object`) et non la signature
      // d'index de `Record<string, string>`, donc l'affectation directe ne compile pas. Le nom
      // passe par une variable de type `string` — exactement ce que fait le code de production,
      // qui lit un nom de script dans `package.json` sans le connaître à la compilation. C'est la
      // même confusion, côté types, que celle que ce témoin mesure côté pnpm.
      const nomHeriteDObjectPrototype: string = 'valueOf';
      scriptsDe(p)[nomHeriteDObjectPrototype] = 'tsx scripts/gates/gov-conventions.ts';
    });
    const fautes = (await confronterLaPorteA(vue)).fautes.filter(
      (f) => f.famille === 'porte_a_alteree'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('`valueOf`');
  });

  it('REQ-GOV-012 — CONTRE-TÉMOIN : le vrai dépôt, chaque script de forme ASCII basse et aucun sous un nom de commande', () => {
    const noms = Object.keys(scriptsDe(JSON.parse(PKG_REEL) as Record<string, unknown>));
    expect(noms.filter((n) => !/^[a-z][a-z0-9:_-]*$/.test(n))).toEqual([]);
    expect(noms.filter((n) => COMMANDES_INTEGREES_DE_PNPM.has(n) && n !== 'test')).toEqual([]);
    expect(controler(lireVue()).map((f) => f.famille)).toEqual([]);
  });

  for (const [quoi, change] of [
    [
      'changé',
      (p: Record<string, unknown>) => {
        p.packageManager = 'pnpm@9.15.9';
      },
    ],
    [
      'retiré',
      (p: Record<string, unknown>) => {
        delete p.packageManager;
      },
    ],
  ] as const) {
    it(`REQ-GOV-012 — \`packageManager\` ${quoi} : porte_a_alteree, nommé`, async () => {
      const fautes = (await confronterLaPorteA(avecPaquet(lireVue(), change))).fautes.filter(
        (f) => f.famille === 'porte_a_alteree'
      );
      expect(fautes.map((f) => f.message).join('\n')).toContain('`packageManager`');
    });
  }

  it('REQ-GOV-012 — CONTRE-TÉMOIN : le vrai package.json passe la porte A, `packageManager` compris', async () => {
    expect((await confronterLaPorteA(lireVue())).fautes).toEqual([]);
  });
});

/**
 * DETTE (1) DU VETO DE SÉCURITÉ, TOUR 5 — la liste relevée à la main (`COMMANDES_RELEVEES_DE_PNPM`)
 * CONFRONTÉE au pnpm réellement installé, lu HORS LIGNE : le `switch` qui passe à npm, lu dans le
 * texte de `dist/pnpm.cjs`, et les clés de `handlerByCommandName`, obtenues en compilant le même
 * fichier sans son point d'entrée (dans un processus à part : rien de pnpm ne touche ce processus).
 * Le pnpm lu est celui qui lance le test (`npm_execpath`, posé par `pnpm test` en CI comme en local),
 * sinon celui que `packageManager` a fait installer sous `%LOCALAPPDATA%/pnpm/.tools`, sinon
 * `node_modules/.pnpm` — et seulement s'il est à la version relevée (`GESTIONNAIRE_RELEVE`).
 * ⚠️ LIMITE DÉCLARÉE : lancé hors de pnpm (`npx vitest`), sur une machine où aucun de ces chemins ne
 * porte la version relevée, le test est SAUTÉ, et son titre le dit ; la porte `pnpm test`, elle, le
 * lance toujours sous le pnpm qu'elle confronte.
 */
function pnpmReleve(): string | null {
  const version = GESTIONNAIRE_RELEVE.replace(/^pnpm@/, '');
  const racines = [
    process.env.npm_execpath ? resolve(dirname(process.env.npm_execpath), '..') : '',
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'pnpm/.tools/pnpm', version, 'node_modules/pnpm')
      : '',
    join(RACINE, 'node_modules/.pnpm', `pnpm@${version}`, 'node_modules/pnpm'),
  ].filter((r) => r !== '');
  for (const r of racines) {
    try {
      const pkg = JSON.parse(readFileSync(join(r, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      const cjs = join(r, 'dist/pnpm.cjs');
      if (pkg.name === 'pnpm' && pkg.version === version && existsSync(cjs)) return cjs;
    } catch {
      /* chemin absent ou illisible : le suivant */
    }
  }
  return null;
}

const PNPM_RELEVE = pnpmReleve();

const LIRE_LES_COMMANDES = String.raw`
const fs = require('fs'), path = require('path'), Module = require('module');
const p = process.argv[1];
const src = fs.readFileSync(p, 'utf8');
const cmd = /var (\w+) = __commonJS\(\{\s*"lib\/cmd\/index\.js"/.exec(src);
const i = src.lastIndexOf('(async () => {\n  switch (argv[0])');
const j = src.indexOf('await passThruToNpm()', i);
if (!cmd || i < 0 || j < 0) { console.log('null'); process.exit(0); }
const npm = [...src.slice(i, j).matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
const mod = new Module(p);
mod.filename = p;
mod.paths = Module._nodeModulePaths(path.dirname(p));
mod._compile(src.slice(0, i) + '\nmodule.exports = ' + cmd[1] + '();\n', p);
console.log(JSON.stringify([...npm, ...Object.keys(mod.exports.pnpmCmds)]));
`;

describe('REQ-GOV-012 — les commandes intégrées relevées à la main sont celles du pnpm installé (dette 1, tour 5)', () => {
  it.skipIf(PNPM_RELEVE === null)(
    'REQ-GOV-012 — la liste relevée égale, mot pour mot, les commandes du pnpm de la version relevée (sauté si aucun n’est lisible hors ligne)',
    () => {
      const sortie = execFileSync(process.execPath, ['-e', LIRE_LES_COMMANDES, PNPM_RELEVE!], {
        encoding: 'utf8',
      });
      const lues = JSON.parse(sortie) as string[] | null;
      expect(lues, 'le code de pnpm a changé de forme : relevez la liste à nouveau').not.toBeNull();
      expect([...new Set(lues)].sort()).toEqual([...COMMANDES_RELEVEES_DE_PNPM].sort());
    }
  );
});
