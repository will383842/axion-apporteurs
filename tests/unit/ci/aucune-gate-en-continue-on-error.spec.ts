// @req REQ-QA-001
// @req REQ-QA-002
// @req REQ-QA-013
/**
 * QA-T01 — le squelette de tests et la Gate A BLOQUANTE : trois témoins à deux faces, un par
 * exigence, dans la seule spécification que la tâche promet (`docs/tasks.json`, `QA-T01.tests`).
 *
 * CE QUE CHAQUE TÉMOIN JUGE, ET PAR QUEL ACTE.
 *
 *   — REQ-QA-013 : aucun job ni aucune étape d'AUCUN workflow de `.github/workflows/` ne porte
 *     `continue-on-error`, à quelque valeur que ce soit (littéral, expression `${{ … }}`), écrit en
 *     bloc ou dans un mapping entre accolades. C'est le `script` de la gate `G-SEC-CI-BLOQUANTE`
 *     (`docs/gates.json`) : le détecteur vit ICI, lancé par l'étape « Tests » de Gate A, qui sort
 *     en code non nul dès qu'il nomme une étape. Il LIT DES CLÉS, par un vrai analyseur YAML, pas
 *     du texte : les commentaires de `ci.yml` qui citent le mot ne le font pas rougir.
 *     `pnpm lint` sort en 0 sur le dépôt, sans un seul avertissement, et `pnpm format:check` aussi ;
 *     `no-console` et `noInlineConfig` (déjà posés, pas par cette tâche) tiennent quand on les ATTAQUE.
 *   — REQ-QA-001 : `pnpm lint` — la commande même que lance Gate A — sort en code non nul sur un
 *     fichier du domaine qui touche la base, le cache, le réseau ou l'horloge, une erreur par
 *     ligne fautive, chacune nommant son interdit.
 *   — REQ-QA-002 : `pnpm test` applique le seuil de 100 % lignes et branches à CHAQUE fichier de
 *     `src/domain/**`, sous-dossiers compris, et la liste des fichiers mesurés est celle du disque.
 *
 * CE QUI N'EST PAS FERMÉ ICI, ET QUI LE FERME.
 *   — Les FORMES VOISINES des interdits du domaine (import sans préfixe `'fs'`, `import()`
 *     dynamique, `globalThis.fetch`, `Date['now']`, console atteinte par un alias) : elles sont
 *     fermées par GOV-076, pas par QA-T01.
 *   — Semgrep (QA-T07), testcontainers (QA-T02), audit, gitleaks, `req:check`, `idor:check`, lint
 *     de migration, size-limit : REQ-QA-013 n'est couverte ici qu'en partie.
 *   — La couverture « ≥ 80 % global » de `docs/CONVENTIONS.md` §6 n'est pas appliquée : les gardes
 *     de ce dépôt tournent en sous-processus, une couverture globale n'y mesurerait rien.
 *   — Un sous-ensemble lancé par `pnpm test -- <fichier>` ROUGIT sur le seuil (les fichiers du
 *     domaine non chargés comptent 0 %) : c'est voulu, et c'est ce que le témoin de REQ-QA-002
 *     exploite. Une passe partielle se lance par `npx vitest run <fichier>`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { parsers as analyseursYaml } from 'prettier/plugins/yaml';

const WORKFLOWS = '.github/workflows';
const CI = `${WORKFLOWS}/ci.yml`;
const NIGHTLY = `${WORKFLOWS}/nightly.yml`;
const ESLINT = 'eslint.config.mjs';
const DOMAINE = 'src/domain';

// ── Lecture YAML ────────────────────────────────────────────────────────────────────────────────

/** Un nœud de l'arbre que rend l'analyseur YAML embarqué par Prettier (déjà épinglé). */
interface NoeudYaml {
  readonly type: string;
  readonly value?: string;
  readonly anchor?: unknown;
  readonly tag?: unknown;
  readonly children?: readonly (NoeudYaml | null)[];
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Un workflow lu comme la forge le lit : un OBJET. YAML n'ordonne pas les clés, et une clé écrite
 * dans un mapping entre accolades est une clé comme une autre. Les ancres, alias, étiquettes et clés
 * de fusion sont REFUSÉS (levée) : `<<: *desarme` ferait porter à une étape une clé écrite ailleurs.
 */
async function lireYaml(texte: string): Promise<unknown> {
  const options = { originalText: texte };
  return valeurYaml((await analyseursYaml.yaml.parse(texte, options as never)) as NoeudYaml);
}

function valeurYaml(n: NoeudYaml | null | undefined): unknown {
  if (n === null || n === undefined) return null;
  if ((n.anchor ?? null) !== null || (n.tag ?? null) !== null) {
    throw new Error(`YAML : ancre ou étiquette refusée (${n.type})`);
  }
  const enfants = n.children ?? [];
  switch (n.type) {
    case 'root':
      if (enfants.length !== 1) throw new Error('YAML : un fichier porte un seul document');
      return valeurYaml(enfants[0]);
    case 'document':
      return valeurYaml(enfants[1]);
    case 'documentBody':
    case 'mappingValue':
    case 'sequenceItem':
    case 'flowSequenceItem':
      return valeurYaml(enfants[0]);
    case 'sequence':
    case 'flowSequence':
      return enfants.map(valeurYaml);
    case 'mapping':
    case 'flowMapping': {
      const objet: Record<string, unknown> = {};
      for (const item of enfants) {
        const [cle, valeur] = item?.children ?? [];
        const nom = valeurYaml(cle?.children?.[0]);
        if (typeof nom !== 'string' || nom === '<<' || Object.hasOwn(objet, nom)) {
          throw new Error(`YAML : clé refusée (${String(nom)})`);
        }
        objet[nom] = valeurYaml(valeur);
      }
      return objet;
    }
    case 'plain':
    case 'quoteDouble':
    case 'quoteSingle':
    case 'blockLiteral':
    case 'blockFolded':
      return n.value ?? '';
    default:
      throw new Error(`YAML : nœud « ${n.type} » refusé`);
  }
}

// ── REQ-QA-013 : le détecteur de désarmement ────────────────────────────────────────────────────

/** Ce que le détecteur a LU, et ce qu'il y a trouvé : un vert sans lecture ne se confond pas. */
interface Releve {
  readonly jobs: number;
  readonly etapes: number;
  readonly fautes: readonly string[];
}

const TOLERANCE = 'continue-on-error';

/** Le nom d'une étape : `name`, sinon ce qu'elle lance, sinon son rang. */
function nomDEtape(etape: Record<string, unknown>, rang: number): string {
  for (const cle of ['name', 'uses', 'run']) {
    const v = etape[cle];
    if (typeof v === 'string' && v.trim() !== '') return v.trim().split('\n')[0]!;
  }
  return `étape n° ${rang + 1}`;
}

/**
 * Chaque job, et chaque étape de chaque job, qui porte la clé `continue-on-error` — à toute valeur.
 * Le nom retenu est celui de l'étape qui PORTE la clé, où que la clé soit écrite dans l'étape. LÈVE
 * si le workflow n'a pas de `jobs` lisibles, si un job ou une étape n'est pas un objet : un
 * détecteur qui ne trouve plus ce qu'il juge rendrait `[]`, c'est-à-dire vert. Fonction PURE.
 */
function desarmements(fichier: string, workflow: unknown): Releve {
  if (!estObjet(workflow) || !estObjet(workflow.jobs)) {
    throw new Error(`${fichier} : aucun \`jobs\` lisible — le détecteur ne mesurerait rien`);
  }
  const jobs = Object.entries(workflow.jobs);
  if (jobs.length === 0) throw new Error(`${fichier} : \`jobs\` vide`);
  const fautes: string[] = [];
  let etapes = 0;
  for (const [id, job] of jobs) {
    if (!estObjet(job)) throw new Error(`${fichier} › ${id} : job illisible`);
    if (Object.hasOwn(job, TOLERANCE)) fautes.push(`${fichier} › job ${id} : ${TOLERANCE}`);
    if (job.steps === undefined) continue;
    if (!Array.isArray(job.steps)) throw new Error(`${fichier} › ${id} : \`steps\` illisible`);
    job.steps.forEach((etape: unknown, rang: number) => {
      if (!estObjet(etape)) throw new Error(`${fichier} › ${id} : étape n° ${rang + 1} illisible`);
      etapes += 1;
      if (Object.hasOwn(etape, TOLERANCE)) {
        fautes.push(`${fichier} › ${id} › « ${nomDEtape(etape, rang)} » : ${TOLERANCE}`);
      }
    });
  }
  return { jobs: jobs.length, etapes, fautes };
}

/** Les workflows du dépôt, DÉRIVÉS du disque : un workflow ajouté est jugé sans qu'on l'inscrive. */
function workflowsDuDisque(): string[] {
  return readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => `${WORKFLOWS}/${f}`);
}

/** Le relevé d'un workflow tel qu'il est sur le disque, ou tel qu'une substitution le rend. */
async function relever(fichier: string, texte = readFileSync(fichier, 'utf8')): Promise<Releve> {
  return desarmements(fichier, await lireYaml(texte));
}

/** Une substitution UNIQUE et effective sur un texte réel : sinon le témoin ne témoigne de rien. */
function substituer(texte: string, avant: string, apres: string): string {
  expect(texte.split(avant).length - 1, `« ${avant.trim()} » doit figurer une fois`).toBe(1);
  const variante = texte.replace(avant, apres);
  expect(variante).not.toBe(texte);
  return variante;
}

// ── Actes lancés en sous-processus ──────────────────────────────────────────────────────────────

/** Un acte `pnpm <script>` lancé par un shell dans `racine` : son code et sa sortie, rien d'autre. */
function lancer(
  commande: string,
  racine = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): { code: number | null; sortie: string } {
  const r = spawnSync(commande, { cwd: racine, shell: true, encoding: 'utf8', env });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\\').join('/') };
}

/** Un message du format `stylish` d'ESLint : ligne, gravité, texte, règle (absente pour un avis). */
interface MessageLint {
  readonly fichier: string;
  readonly ligne: number;
  readonly gravite: 'error' | 'warning';
  readonly texte: string;
  readonly regle: string | undefined;
}

function messagesDuLint(sortie: string): MessageLint[] {
  const messages: MessageLint[] = [];
  let fichier = '';
  for (const l of sortie.split(/\r?\n/)) {
    const m = /^\s+(\d+):\d+\s+(error|warning)\s+(.*?)(?:\s{2,}(\S+))?\s*$/.exec(l);
    if (m !== null) {
      const gravite = m[2] === 'error' ? 'error' : 'warning';
      messages.push({ fichier, ligne: Number(m[1]), gravite, texte: m[3]!, regle: m[4] });
    } else if (/^\S.*\.[cm]?[jt]sx?$/.test(l)) {
      fichier = l.trim();
    }
  }
  return messages;
}

/**
 * Un arbre JETABLE hors du dépôt : la configuration ESLint (réelle ou variée), le `package.json`
 * réel — c'est lui qui fait de `pnpm lint` la commande de Gate A —, les fichiers plantés, et un lien
 * vers le `node_modules` que l'installation figée a posé. On y lance `pnpm lint`, puis on défait le
 * lien SEUL avant d'effacer l'arbre : l'effacement ne descend jamais dans le `node_modules` réel.
 */
function lintSurUnBac(
  plantes: Readonly<Record<string, string>>,
  configuration = readFileSync(ESLINT, 'utf8')
): { code: number | null; sortie: string; messages: MessageLint[] } {
  const racine = mkdtempSync(join(tmpdir(), 'qa1-'));
  const lien = join(racine, 'node_modules');
  try {
    const ecrire = (f: string, contenu: string) => {
      mkdirSync(dirname(join(racine, f)), { recursive: true });
      writeFileSync(join(racine, f), contenu);
    };
    ecrire(ESLINT, configuration);
    ecrire('package.json', readFileSync('package.json', 'utf8'));
    for (const [f, contenu] of Object.entries(plantes)) ecrire(f, contenu);
    symlinkSync(realpathSync('node_modules'), lien, 'junction');
    const { code, sortie } = lancer('pnpm lint', racine);
    return { code, sortie, messages: messagesDuLint(sortie) };
  } finally {
    try {
      unlinkSync(lien);
    } catch {
      // Le lien n'a pas été posé : rien à défaire.
    }
    rmSync(racine, { recursive: true, force: true });
  }
}

// ── Les fautes plantées ─────────────────────────────────────────────────────────────────────────

/**
 * REQ-QA-001, « ni Prisma, ni Redis, ni fetch, ni new Date() » : une ligne par interdit, chacune
 * avec le NOM que son message d'erreur doit porter. Oracle tapé EXPRÈS : c'est sa divergence avec
 * l'effet de `eslint.config.mjs` qui rougit. Les imports d'abord, pour que chaque ligne reste seule.
 */
const INTERDITS_DU_DOMAINE: readonly (readonly [ligne: string, nom: string])[] = [
  ["import '@prisma/client';", '@prisma/client'],
  ["import 'ioredis';", 'ioredis'],
  ["import 'redis';", 'redis'],
  ["import 'bullmq';", 'bullmq'],
  ["import 'node:http';", 'node:http'],
  ["import 'node:https';", 'node:https'],
  ["import 'node:net';", 'node:net'],
  ["import 'undici';", 'undici'],
  ["import 'node:fs';", 'node:fs'],
  ["export const a = fetch('https://exemple.invalid');", 'fetch'],
  ['export const b = new XMLHttpRequest();', 'XMLHttpRequest'],
  ["export const c = new WebSocket('wss://exemple.invalid');", 'WebSocket'],
  ['export const d = Date.now();', 'Date.now'],
  ['export const e = performance.now();', 'performance.now'],
  ['export const f = new Date();', 'new Date()'],
  ["console.log('courriel');", 'console'],
];

// Dans un SOUS-dossier : un bac posé à la racine du domaine ne prouverait rien des sous-dossiers.
const BAC_DOMAINE = `${DOMAINE}/m-milieu/zz-bac.ts`;
/** Une directive en ligne qui prétend éteindre `no-console` : `noInlineConfig` doit l'ignorer. */
const BAC_DIRECTIVE = `${DOMAINE}/m-milieu/zz-directive.ts`;
const DIRECTIVE = "// eslint-disable-next-line no-console\nconsole.log('courriel');\n";
/**
 * Les chemins où les deux règles étaient TOLÉRÉES en `warn` jusqu'à QA-T01 (les deux blocs « dette »
 * d'`eslint.config.mjs`, 13 avertissements mesurés sur la PR 44) : une faute de la règle y rend
 * désormais une ERREUR. Un bloc de tolérance rétabli pour l'un d'eux fait rougir ce témoin.
 */
const ANY = 'export const v: any = 1;\n';
const AFFECTATION_INUTILE =
  'export function f(): number {\n  let v = 1;\n  v = 2;\n  return v;\n}\n';
const ANCIENNE_DETTE: Readonly<Record<string, readonly [string, string]>> = {
  'scripts/gates/perf-budgets.ts': [ANY, '@typescript-eslint/no-explicit-any'],
  'tests/unit/gouvernance/poids-du-bundle-garde-vraiment.spec.ts': [
    ANY,
    '@typescript-eslint/no-explicit-any',
  ],
  'scripts/gates/gov-inventaire.ts': [AFFECTATION_INUTILE, 'no-useless-assignment'],
  'scripts/gates/gov-sonde.ts': [AFFECTATION_INUTILE, 'no-useless-assignment'],
  'scripts/plan-state/build.ts': [AFFECTATION_INUTILE, 'no-useless-assignment'],
  'tests/unit/gouvernance/corps-de-pr-couvre.spec.ts': [
    AFFECTATION_INUTILE,
    'no-useless-assignment',
  ],
  'tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts': [
    AFFECTATION_INUTILE,
    'no-useless-assignment',
  ],
};

/** UN lancement de `pnpm lint` sur le bac porteur de toutes les fautes, partagé par les témoins. */
let bacFautif: ReturnType<typeof lintSurUnBac> | undefined;
function lintDuBacFautif(): ReturnType<typeof lintSurUnBac> {
  bacFautif ??= lintSurUnBac({
    [BAC_DOMAINE]: `${INTERDITS_DU_DOMAINE.map(([l]) => l).join('\n')}\n`,
    [BAC_DIRECTIVE]: DIRECTIVE,
    ...Object.fromEntries(Object.entries(ANCIENNE_DETTE).map(([f, [texte]]) => [f, texte])),
  });
  return bacFautif;
}

/** Les messages d'un fichier planté, reconnu par la fin de son chemin (le bac a un chemin absolu). */
function messagesDe(messages: readonly MessageLint[], fichier: string): MessageLint[] {
  return messages.filter((m) => m.fichier.endsWith(`/${fichier}`));
}

// ── REQ-QA-002 : la couverture du domaine ───────────────────────────────────────────────────────

/** Les fichiers de code du domaine, DÉRIVÉS du disque (ni test, ni déclaration). */
function fichiersDuDomaine(): string[] {
  return readdirSync(DOMAINE, { recursive: true, encoding: 'utf8' })
    .map((f) => `${DOMAINE}/${f.split('\\').join('/')}`)
    .filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec|d)\.tsx?$/.test(f))
    .sort();
}

/** Le seul fichier de test que la passe partielle charge : il couvre `etats.ts`, et lui seul. */
const PASSE_PARTIELLE = 'tests/unit/domaine/etats-occupants.spec.ts';
const COUVERT_PAR_LA_PASSE = `${DOMAINE}/attribution/etats.ts`;

/**
 * Le script `test` — celui que lance l'étape « Tests » —, restreint à UN fichier de test, avec un
 * rapport de couverture écrit hors du dépôt (jamais dans le `coverage/` que la passe parente remplit).
 * `pnpm run test`, et non `pnpm test` : sous cette forme courte, pnpm prend `--coverage.*` pour ses
 * propres options et refuse (« Unknown options »), en sortant en 0. L'environnement de Vitest du
 * processus parent n'est pas transmis : l'enfant est une passe neuve.
 */
function passePartielle(): { code: number | null; sortie: string; couverts: string[] } {
  const rapport = mkdtempSync(join(tmpdir(), 'qa2-'));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(?:VITEST|TEST$|NODE_V8_COVERAGE)/.test(k))
    );
    const { code, sortie } = lancer(
      `pnpm run test --coverage.reportsDirectory=${rapport} --coverage.reporter=json-summary ` +
        PASSE_PARTIELLE,
      process.cwd(),
      env
    );
    let couverts: string[] = [];
    try {
      const resume = JSON.parse(readFileSync(join(rapport, 'coverage-summary.json'), 'utf8')) as {
        [fichier: string]: unknown;
      };
      couverts = Object.keys(resume)
        .filter((k) => k !== 'total')
        .map((k) => relative(process.cwd(), k).split('\\').join('/'))
        .sort();
    } catch {
      // Aucun rapport : la couverture n'a pas tourné. `couverts` vide le dit au témoin.
    }
    return { code, sortie, couverts };
  } finally {
    rmSync(rapport, { recursive: true, force: true });
  }
}

/** La marque que `tests/setup.ts` pose : sa présence prouve que `setupFiles` le charge. */
const MARQUE_DU_SETUP = Symbol.for('axion-partners.tests.setup');

/**
 * Une directive d'EXCLUSION DE COUVERTURE (familles v8, c8, istanbul, node:coverage) n'a pas sa place
 * sous `src/domain/**` : le seuil de 100 % doit mesurer tout le code livré. Elle est refusée quelle
 * que soit la casse, l'espacement (saut de ligne compris) ou l'extension du fichier. Le texte entier
 * est lu, pas seulement les commentaires : une chaîne qui la citerait rougit aussi — échec fermé,
 * voulu.
 */
const DIRECTIVE_D_EXCLUSION = /(?:\b(?:v8|c8|istanbul)|node:coverage)\s*ignore/gi;

/**
 * Chaque directive d'exclusion trouvée sous `racine` (tous les fichiers, toutes extensions, à toute
 * profondeur), nommée `src/domain/<chemin>:<ligne>`, et le nombre de fichiers LUS : un parcours qui
 * ne lirait plus rien rendrait le même `[]` qu'un domaine sain.
 */
function directivesDExclusion(racine: string): { lus: number; fautes: string[] } {
  const fichiers = readdirSync(racine, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split('\\').join('/'))
    .filter((f) => statSync(join(racine, f)).isFile())
    .sort();
  const fautes: string[] = [];
  for (const f of fichiers) {
    const texte = readFileSync(join(racine, f), 'utf8');
    for (const m of texte.matchAll(DIRECTIVE_D_EXCLUSION)) {
      const ligne = texte.slice(0, m.index).split('\n').length;
      fautes.push(`${DOMAINE}/${f}:${ligne}`);
    }
  }
  return { lus: fichiers.length, fautes };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('REQ-QA-013 — aucune gate ne se désarme par `continue-on-error`, et la Gate A lint sans tolérance', () => {
  it('REQ-QA-013 — chaque job et chaque étape de CHAQUE workflow du disque est lu, et aucun ne porte la tolérance', async () => {
    const fichiers = workflowsDuDisque();
    const releves = await Promise.all(fichiers.map((f) => relever(f)));
    const jobs = releves.reduce((n, r) => n + r.jobs, 0);
    const etapes = releves.reduce((n, r) => n + r.etapes, 0);
    console.info(`[QA-T01] ${fichiers.length} workflows, ${jobs} jobs, ${etapes} étapes lus`);
    // Planchers : un détecteur vidé, ou un disque qu'on ne lit plus, rendrait le même `[]`.
    expect(fichiers).toContain(CI);
    expect(jobs).toBeGreaterThan(0);
    expect(etapes).toBeGreaterThan(0);
    expect(releves.flatMap((r) => r.fautes)).toEqual([]);
  });

  it('REQ-QA-013 — la tolérance posée sur l’étape « Tests » de gate-a est nommée, elle seule, à toute valeur', async () => {
    const ci = readFileSync(CI, 'utf8');
    const TESTS = '      - name: Tests\n        run: pnpm test\n';
    for (const valeur of ['${{ true }}', 'true', 'false', "${{ github.event_name == 'push' }}"]) {
      const desarme = substituer(ci, TESTS, `${TESTS}        ${TOLERANCE}: ${valeur}\n`);
      expect((await relever(CI, desarme)).fautes, valeur).toEqual([
        `${CI} › gate-a › « Tests » : ${TOLERANCE}`,
      ]);
    }
  });

  it('REQ-QA-013 — au MILIEU de la liste, clé écrite AVANT le nom, entre accolades ou entre guillemets : l’étape qui la porte est nommée', async () => {
    const ci = readFileSync(CI, 'utf8');
    const TYPECHECK = '      - name: Typecheck\n        run: pnpm typecheck\n';
    const FORMAT = '      - name: Format\n        run: pnpm format:check\n';
    const cas: [string, string][] = [
      // La clé précède `name` : un détecteur qui retient « le dernier `name:` vu » nommerait Format.
      [
        substituer(
          ci,
          TYPECHECK,
          `      - ${TOLERANCE}: true\n        name: Typecheck\n        run: pnpm typecheck\n`
        ),
        'Typecheck',
      ],
      [
        substituer(
          ci,
          FORMAT,
          `      - { name: Format, run: pnpm format:check, ${TOLERANCE}: true }\n`
        ),
        'Format',
      ],
      [substituer(ci, FORMAT, `${FORMAT}        '${TOLERANCE}': true\n`), 'Format'],
    ];
    for (const [variante, nom] of cas) {
      expect((await relever(CI, variante)).fautes).toEqual([
        `${CI} › gate-a › « ${nom} » : ${TOLERANCE}`,
      ]);
    }
  });

  it('REQ-QA-013 — la tolérance posée au niveau d’un JOB, hors de gate-a, est nommée', async () => {
    const nightly = readFileSync(NIGHTLY, 'utf8');
    const variante = substituer(
      nightly,
      '  gates-prouvees:\n',
      `  gates-prouvees:\n    ${TOLERANCE}: true\n`
    );
    expect((await relever(NIGHTLY, variante)).fautes).toEqual([
      `${NIGHTLY} › job gates-prouvees : ${TOLERANCE}`,
    ]);
  });

  it('REQ-QA-013 — le détecteur lit des CLÉS : les commentaires et le texte d’un script qui citent le mot ne rougissent pas', async () => {
    const ci = readFileSync(CI, 'utf8');
    // Le piège est RÉEL : les workflows du dépôt citent le mot en commentaire.
    const citations = workflowsDuDisque()
      .map((f) => readFileSync(f, 'utf8'))
      .flatMap((t) => t.split('\n'))
      .filter((l) => /^\s*#.*continue-on-error/.test(l));
    expect(citations.length).toBeGreaterThan(0);
    const TESTS = '      - name: Tests\n        run: pnpm test\n';
    const script = substituer(
      ci,
      TESTS,
      `      - name: Tests\n        run: |\n          echo "${TOLERANCE}: true"\n          pnpm test\n`
    );
    expect((await relever(CI, script)).fautes).toEqual([]);
  });

  it('REQ-QA-013 — ce qu’il ne sait pas lire le fait LEVER, jamais rendre vide', async () => {
    const ci = readFileSync(CI, 'utf8');
    await expect(relever(CI, 'name: x\non: push\n')).rejects.toThrow(/aucun `jobs`/);
    await expect(relever(CI, 'name: x\non: push\njobs: {}\n')).rejects.toThrow(/vide/);
    await expect(
      relever(CI, substituer(ci, '    steps:\n', '    steps: &etapes\n'))
    ).rejects.toThrow(/ancre/);
    await expect(
      relever(CI, substituer(ci, '    steps:\n', '    steps: 3\n    x:\n'))
    ).rejects.toThrow();
  });

  it('REQ-QA-013 — `pnpm lint` et `pnpm format:check` sortent en 0 sur le dépôt, sans un seul avertissement', () => {
    const lint = lancer('pnpm lint');
    expect(lint.code, lint.sortie).toBe(0);
    expect(messagesDuLint(lint.sortie)).toEqual([]);
    const format = lancer('pnpm format:check');
    expect(format.code, format.sortie).toBe(0);
  }, 600_000);

  it('REQ-QA-013 — ESLint rend en ERREUR : `no-console` malgré une directive en ligne, et les règles autrefois tolérées', () => {
    const { code, messages, sortie } = lintDuBacFautif();
    expect(code, sortie).toBe(1);
    // `noInlineConfig` : la directive est ignorée, `console.log` reste une erreur.
    expect(
      messagesDe(messages, BAC_DIRECTIVE)
        .filter((m) => m.gravite === 'error')
        .map((m) => [m.ligne, m.regle])
    ).toEqual([[2, 'no-console']]);
    for (const [fichier, [, regle]] of Object.entries(ANCIENNE_DETTE)) {
      const rendus = messagesDe(messages, fichier).map((m) => [m.gravite, m.regle]);
      expect(rendus, fichier).toEqual([['error', regle]]);
    }
  }, 600_000);

  it('REQ-QA-013 — et ce témoin SAIT voir `noInlineConfig` retiré : la même directive fait alors sortir `pnpm lint` en 0', () => {
    const config = readFileSync(ESLINT, 'utf8');
    const REGLAGE = 'linterOptions: { noInlineConfig: true },';
    const sansReglage = substituer(config, REGLAGE, '');
    const { code, sortie } = lintSurUnBac({ [BAC_DIRECTIVE]: DIRECTIVE }, sansReglage);
    expect(code, sortie).toBe(0);
  }, 600_000);
});

describe('REQ-QA-001 — `pnpm lint` refuse toute I/O sous `src/domain/**`', () => {
  it('REQ-QA-001 — base, cache, réseau et horloge : une ERREUR par ligne fautive, chacune nommant son interdit', () => {
    const { code, messages, sortie } = lintDuBacFautif();
    expect(code, sortie).toBe(1);
    const rendus = messagesDe(messages, BAC_DOMAINE);
    const fautes = INTERDITS_DU_DOMAINE.flatMap(([ligne, nom], n) => {
      const ici = rendus.filter((m) => m.ligne === n + 1 && m.gravite === 'error');
      return ici.length === 1 && ici[0]!.texte.includes(nom)
        ? []
        : [`ligne ${n + 1} « ${ligne} » : ${JSON.stringify(ici.map((m) => m.texte))}`];
    });
    expect(fautes).toEqual([]);
    // Rien d'autre : pas d'erreur d'analyse, pas de configuration qui rougirait pour une autre raison.
    expect(rendus).toHaveLength(INTERDITS_DU_DOMAINE.length);
  }, 600_000);
});

describe('REQ-QA-002 — 100 % lignes et branches sur `src/domain/**`, appliqués par `pnpm test`', () => {
  it('REQ-QA-002 — `tests/setup.ts` est chargé par `setupFiles` avant chaque fichier de test', () => {
    expect(Reflect.get(globalThis, MARQUE_DU_SETUP)).toBe('tests/setup.ts');
  });

  it('REQ-QA-002 — un fichier du domaine non couvert, dans un SOUS-dossier, fait sortir `pnpm test` en non nul en le NOMMANT ; les fichiers mesurés sont ceux du disque', () => {
    const disque = fichiersDuDomaine();
    const { code, sortie, couverts } = passePartielle();
    console.info(
      `[QA-T01] ${couverts.length} fichiers de src/domain mesurés, ${disque.length} sur le disque`
    );
    expect(disque.length).toBeGreaterThan(1);
    expect(disque).toContain(COUVERT_PAR_LA_PASSE);
    // La liste mesurée est celle du disque : un `include` rétréci, ou un périmètre vide — dont le
    // seuil serait vert —, divergent ici.
    expect(couverts).toEqual(disque);
    expect(code, sortie).not.toBe(0);
    // Chaque fichier que la passe ne charge pas est nommé par le seuil ; celui qu'elle couvre, non.
    const nommes = disque.filter((f) =>
      sortie.includes(`does not meet "${DOMAINE}/**" threshold (100%) for ${f}`)
    );
    expect(nommes).toEqual(disque.filter((f) => f !== COUVERT_PAR_LA_PASSE));
    // Au moins un fichier nommé vit dans un SOUS-dossier : une clé de seuil `src/domain/*` le perdrait.
    expect(nommes.some((f) => relative(DOMAINE, dirname(f)) !== '')).toBe(true);
  }, 600_000);

  it('REQ-QA-002 — aucune directive d’exclusion de couverture sous `src/domain/**` : le seuil mesure tout le code livré', () => {
    const { lus, fautes } = directivesDExclusion(DOMAINE);
    expect(lus).toBeGreaterThanOrEqual(fichiersDuDomaine().length);
    expect(fautes).toEqual([]);
  });

  it('REQ-QA-002 — et ce témoin SAIT rougir : chaque forme, chaque extension, dans un sous-dossier du MILIEU, est nommée à sa ligne', () => {
    const racine = mkdtempSync(join(tmpdir(), 'qa3-'));
    try {
      const plantes: Record<string, string> = {
        'attribution/sain.ts': 'export const a = 1;\n',
        'm-milieu/profond/a.ts': 'export const a = 1;\n/* v8 ignore start */\n',
        'm-milieu/profond/b.tsx': 'export const b = 1;\n/*V8   IGNORE next 3*/\n',
        'm-milieu/profond/c.mts': '// c8 ignore next\n',
        'm-milieu/profond/d.cts': '\n\n/* istanbul ignore else */\n',
        'm-milieu/profond/e.ts': '/* node:coverage ignore next */\n',
        'm-milieu/profond/f.ts': '/* v8\n   ignore stop */\n',
        // Contre-témoin : les deux mots, séparés, ne sont pas une directive.
        'zz-fin/sain.ts': '// on ignore ce cas ; le moteur v8 le traite ailleurs\n',
      };
      for (const [f, texte] of Object.entries(plantes)) {
        mkdirSync(dirname(join(racine, f)), { recursive: true });
        writeFileSync(join(racine, f), texte);
      }
      const { lus, fautes } = directivesDExclusion(racine);
      expect(lus).toBe(Object.keys(plantes).length);
      expect(fautes).toEqual([
        `${DOMAINE}/m-milieu/profond/a.ts:2`,
        `${DOMAINE}/m-milieu/profond/b.tsx:2`,
        `${DOMAINE}/m-milieu/profond/c.mts:1`,
        `${DOMAINE}/m-milieu/profond/d.cts:3`,
        `${DOMAINE}/m-milieu/profond/e.ts:1`,
        `${DOMAINE}/m-milieu/profond/f.ts:1`,
      ]);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
