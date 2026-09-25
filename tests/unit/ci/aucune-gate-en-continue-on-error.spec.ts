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
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { estObjet, lireYaml } from '../../../scripts/lib/lire-yaml';

const WORKFLOWS = '.github/workflows';
const CI = `${WORKFLOWS}/ci.yml`;
const NIGHTLY = `${WORKFLOWS}/nightly.yml`;
const ESLINT = 'eslint.config.mjs';
const DOMAINE = 'src/domain';

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

/**
 * TOUS les fichiers du domaine, DÉRIVÉS du disque, sans filtre : un test, une déclaration ou un
 * fichier d'une autre extension posé sous `src/domain/` apparaît ici, et diverge de la liste mesurée.
 */
function fichiersDuDomaine(): string[] {
  return fichiersSous(DOMAINE).map((f) => `${DOMAINE}/${f}`);
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
    // `next` déclare `NODE_ENV` OBLIGATOIRE dans `NodeJS.ProcessEnv` (next/types/global.d.ts) : un
    // environnement FILTRÉ n'en porte pas forcément un. L'assertion dit ce que le filtre rend vraiment.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(?:VITEST|TEST$|NODE_V8_COVERAGE)/.test(k))
    ) as NodeJS.ProcessEnv;
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

/** Chaque fichier sous `racine`, à toute profondeur, en chemin relatif à barres obliques. */
function fichiersSous(racine: string): string[] {
  return readdirSync(racine, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split('\\').join('/'))
    .filter((f) => statSync(join(racine, f)).isFile())
    .sort();
}

/**
 * RIEN QUE DU `.ts` NON-TEST SOUS `src/domain/**`, sans exception. Le bloc de pureté
 * d'`eslint.config.mjs` vise les `.ts` du domaine : un fichier d'une AUTRE extension (`.tsx`, `.mts`,
 * `.js`…) y échapperait. Un `*.spec.ts` ou un `*.test.ts` est exécuté par Vitest mais EXCLU de la
 * mesure de couverture : du code de domaine qui s'y logerait tournerait sans être compté. Un `*.d.ts`
 * est lui aussi hors mesure. Les tests vivent sous `tests/`. Tout autre fichier est REFUSÉ, nommé :
 * échec fermé, un fichier de données ou de texte posé là rougit aussi.
 */
function nonAdmisSousLeDomaine(racine: string): { lus: number; fautes: string[] } {
  const fichiers = fichiersSous(racine);
  const admis = (f: string) => f.endsWith('.ts') && !/\.(?:spec|test|d)\.ts$/.test(f);
  return {
    lus: fichiers.length,
    fautes: fichiers.filter((f) => !admis(f)).map((f) => `${DOMAINE}/${f}`),
  };
}

/**
 * Une ligne qui PARLE de couverture. Pas une liste de directives connues — le fournisseur en accepte
 * plus qu'on n'en devine (sa classe de caractères admet `|8`, il honore `node:coverage disable`) —,
 * mais les mots dont toute directive d'exclusion a besoin, casse ignorée. Le fournisseur lit ses
 * directives LIGNE À LIGNE, n'importe où sur la ligne, chaînes comprises : la garde juge donc CHAQUE
 * LIGNE ENTIÈRE, code, chaînes et commentaires confondus, sans découper en commentaires — un découpage
 * laisse passer ce que le fournisseur retrouve à cheval sur deux morceaux. Un faux positif coûte un
 * mot ; un faux négatif coûte le seuil.
 *
 * S'y ajoute toute DÉCLARATION DE SOURCE (`sourceMappingURL`, `sourceURL`, sous toutes leurs formes) :
 * une carte de sources embarquée remplace, pour la mesure, le texte du fichier par celui qu'elle
 * porte — encodé, donc illisible pour les motifs ci-dessus. Elle est refusée sans être décodée.
 */
const PARLE_DE_COUVERTURE = /ignore|coverage|istanbul|[a-z|]8\s|sourcemappingurl|sourceurl/i;

/** Une carte de sources dont le contenu encadre une ligne par une directive, encodée en base64. */
const CARTE_EMBARQUEE = Buffer.from(
  JSON.stringify({
    version: 3,
    sources: ['etats.ts'],
    sourcesContent: ['/* v8 ignore start */\nexport const f = 1;\n/* v8 ignore stop */\n'],
    names: [],
    mappings: 'AAAA',
  })
).toString('base64');

/**
 * Chaque ligne suspecte sous `racine` (tous les fichiers, à toute profondeur), nommée
 * `src/domain/<chemin>:<ligne>`, et le nombre de fichiers LUS : un parcours qui ne lirait plus rien
 * rendrait le même `[]` qu'un domaine sain.
 */
function lignesDeCouverture(racine: string): { lus: number; fautes: string[] } {
  const fichiers = fichiersSous(racine);
  const fautes: string[] = [];
  for (const f of fichiers) {
    readFileSync(join(racine, f), 'utf8')
      .split('\n')
      .forEach((ligne, n) => {
        if (PARLE_DE_COUVERTURE.test(ligne)) fautes.push(`${DOMAINE}/${f}:${n + 1}`);
      });
  }
  return { lus: fichiers.length, fautes };
}

/**
 * Les expressions régulières par lesquelles le fournisseur de couverture INSTALLÉ reconnaît une
 * directive d'exclusion — lues dans le `provider.js` de `@vitest/coverage-v8` résolu depuis
 * `node_modules`, méthode `_parseIgnore`. LÈVE si le fichier, la méthode ou une expression manque :
 * un témoin qui ne lit plus les formes du fournisseur ne prouverait rien.
 */
function formesDuFournisseur(): RegExp[] {
  const requerir = createRequire(join(process.cwd(), 'package.json'));
  const provider = join(dirname(requerir.resolve('@vitest/coverage-v8')), 'provider.js');
  const source = readFileSync(provider, 'utf8');
  const debut = source.search(/_parseIgnore\s*\(lineStr\)\s*\{/);
  if (debut < 0) throw new Error(`${provider} : méthode _parseIgnore introuvable`);
  let profondeur = 0;
  let fin = debut;
  for (let i = source.indexOf('{', debut); i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    if (source[i] === '}' && --profondeur === 0) {
      fin = i;
      break;
    }
  }
  const corps = source.slice(debut, fin);
  const formes = [...corps.matchAll(/\.match\(\/((?:\\.|[^/\\\n])+)\/([a-z]*)\)/g)].map(
    (m) => new RegExp(m[1]!, m[2])
  );
  if (formes.length === 0) throw new Error(`${provider} : aucune expression lue dans _parseIgnore`);
  return formes;
}

/**
 * Des lignes candidates, larges : chaque caractère imprimable suivi de `8`, et `node:coverage`,
 * combinés à chaque mode connu. Les formes RETENUES sont celles qu'une expression du fournisseur
 * accepte ; une expression qui n'en accepterait aucune fait rougir le témoin — forme non dérivée.
 */
function candidatsDeDirective(): string[] {
  const prefixes = [
    ...Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => `${String.fromCharCode(0x21 + i)}8`),
    'node:coverage',
  ];
  const modes = [
    'ignore next',
    'ignore next 3',
    'ignore start',
    'ignore stop',
    'disable',
    'enable',
  ];
  return prefixes.flatMap((p) => modes.map((m) => `/* ${p} ${m} */`));
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

  it('REQ-QA-013 — au MILIEU de la liste (rang dérivé), en avant-dernière, clé écrite AVANT le nom, entre accolades ou entre guillemets : l’étape qui la porte est nommée', async () => {
    const ci = readFileSync(CI, 'utf8');
    // L'étape du MILIEU de `gate-a`, dérivée de son rang dans le workflow lu — ni la première, ni la
    // dernière : un détecteur qui ne verrait que l'une des deux bornes la laisserait passer.
    const workflow = await lireYaml(ci);
    const job = estObjet(workflow) && estObjet(workflow.jobs) ? workflow.jobs['gate-a'] : undefined;
    const etapes: unknown[] = estObjet(job) && Array.isArray(job.steps) ? job.steps : [];
    expect(etapes.length).toBeGreaterThan(2);
    const rang = Math.floor(etapes.length / 2);
    const milieu = etapes[rang];
    const nomMilieu = estObjet(milieu) && typeof milieu.name === 'string' ? milieu.name : '';
    expect(nomMilieu, `l'étape n° ${rang + 1} de gate-a n'a pas de nom`).not.toBe('');
    console.info(
      `[QA-T01] étape du milieu de gate-a : n° ${rang + 1} sur ${etapes.length}, « ${nomMilieu} »`
    );
    const TYPECHECK = '      - name: Typecheck\n        run: pnpm typecheck\n';
    const FORMAT = '      - name: Format\n        run: pnpm format:check\n';
    const cas: [string, string][] = [
      [
        substituer(
          ci,
          `      - name: ${nomMilieu}\n`,
          `      - ${TOLERANCE}: true\n        name: ${nomMilieu}\n`
        ),
        nomMilieu,
      ],
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

  it('REQ-QA-013 — un AVERTISSEMENT seul fait sortir `pnpm lint` en non nul (`--max-warnings 0`)', () => {
    // Une directive en ligne sans faute à éteindre : sous `noInlineConfig`, ESLint ne rend qu'un
    // avertissement — et un avertissement toléré est une porte pour les règles qu'on passerait en `warn`.
    const seul = {
      [BAC_DIRECTIVE]: '// eslint-disable-next-line no-console\nexport const a = 1;\n',
    };
    const { code, sortie, messages } = lintSurUnBac(seul);
    expect(messages.map((m) => m.gravite)).toEqual(['warning']);
    expect(code, sortie).toBe(1);
  }, 600_000);
});

describe('REQ-QA-001 — `pnpm lint` refuse toute I/O sous `src/domain/**`', () => {
  it('REQ-QA-001 — tout fichier de `src/domain/**` est un `.ts` non-test, que le bloc de pureté du lint couvre et que la couverture mesure', () => {
    const { lus, fautes } = nonAdmisSousLeDomaine(DOMAINE);
    expect(lus).toBeGreaterThan(0);
    expect(fautes).toEqual([]);
  });

  it('REQ-QA-001 — et ce témoin SAIT rougir : toute autre extension, un test ou une déclaration, dans un sous-dossier du MILIEU, est nommé', () => {
    const racine = mkdtempSync(join(tmpdir(), 'qa4-'));
    try {
      const plantes = [
        'attribution/sain.ts',
        'm-milieu/profond/types.d.ts',
        'm-milieu/profond/faute.spec.ts',
        'm-milieu/profond/faute.test.ts',
        'm-milieu/profond/horloge.tsx',
        'm-milieu/profond/b.mts',
        'm-milieu/profond/c.cts',
        'm-milieu/profond/d.js',
        'm-milieu/profond/e.jsx',
        'm-milieu/profond/f.mjs',
        'm-milieu/profond/g.cjs',
        'm-milieu/profond/h.json',
        'zz-fin/sain.ts',
      ];
      for (const f of plantes) {
        mkdirSync(dirname(join(racine, f)), { recursive: true });
        writeFileSync(join(racine, f), 'export const a = 1;\n');
      }
      const { lus, fautes } = nonAdmisSousLeDomaine(racine);
      expect(lus).toBe(plantes.length);
      expect(fautes).toEqual(
        plantes
          .filter((f) => f.startsWith('m-milieu/'))
          .sort()
          .map((f) => `${DOMAINE}/${f}`)
      );
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

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

  it('REQ-QA-002 — aucune ligne de `src/domain/**` ne parle de couverture : le seuil mesure tout le code livré', () => {
    const { lus, fautes } = lignesDeCouverture(DOMAINE);
    expect(lus).toBe(fichiersDuDomaine().length);
    expect(lus).toBeGreaterThan(0);
    expect(fautes).toEqual([]);
  });

  it('REQ-QA-002 — et ce témoin SAIT rougir : CHAQUE forme que le fournisseur INSTALLÉ accepte, dans un sous-dossier du MILIEU, est nommée', () => {
    const formes = formesDuFournisseur();
    const candidats = candidatsDeDirective();
    // Chaque expression du fournisseur doit accepter au moins un candidat : sinon une forme lui échappe.
    expect(formes.filter((re) => !candidats.some((c) => re.test(c))).map(String)).toEqual([]);
    const retenues = candidats.filter((c) => formes.some((re) => re.test(c)));
    console.info(`[QA-T01] ${formes.length} expressions du fournisseur, ${retenues.length} formes`);
    expect(retenues.length).toBeGreaterThanOrEqual(14);
    // Témoins positifs : les deux formes que la liste tapée d'avant laissait passer sont bien lues.
    expect(retenues).toContain('/* |8 ignore start */');
    expect(retenues).toContain('/* node:coverage disable */');
    // Des formes écrites à la main, chacune avec les lignes qui doivent rougir : casse et espaces,
    // directive à CHEVAL sur un commentaire refermé (le fournisseur réutilise le `/` de `*/`), bloc
    // jamais refermé, commentaire en ligne, `istanbul`, directive coupée sur deux lignes.
    const aLaMain: readonly (readonly [string, readonly number[]])[] = [
      ['/*V8   IGNORE next 3*/', [2]],
      ["export const MARQUE_A = '/* a */* node:coverage disable';", [2]],
      ['/* node:coverage disable', [2]],
      ['// c8 ignore next', [2]],
      ['/* istanbul ignore else */', [2]],
      ['/* v8\n   ignore stop */', [3]],
      // Une carte de sources EMBARQUÉE, dont le contenu (encodé) porterait une directive : refusée
      // sans être décodée, sous chacune de ses formes de déclaration.
      [`//# sourceMappingURL=data:application/json;base64,${CARTE_EMBARQUEE}`, [2]],
      [`//@ sourceMappingURL=data:application/json;base64,${CARTE_EMBARQUEE}`, [2]],
      [`/*# SOURCEMAPPINGURL=data:application/json;base64,${CARTE_EMBARQUEE} */`, [2]],
      ['//# sourceURL=etats.ts', [2]],
    ];
    // Le témoin est honnête : la carte encodée ne porte, en clair, aucun des mots de la directive.
    expect(/ignore|coverage|[a-z|]8\s/i.test(CARTE_EMBARQUEE)).toBe(false);
    const plantes: Record<string, string> = {
      'attribution/sain.ts': 'export const a = 1;\n',
      // Contre-témoin : une ligne qui ne parle pas de couverture.
      'zz-fin/sain.ts': '// la clause se génère depuis la constante\nexport const z = 1;\n',
    };
    const attendues: string[] = [];
    const planter = (f: string, ligne: string, lignes: readonly number[]) => {
      plantes[f] = `export const a = 1;\n${ligne}\nexport const b = 2;\n`;
      attendues.push(...lignes.map((n) => `${DOMAINE}/${f}:${n}`));
    };
    retenues.forEach((ligne, i) => planter(`m-milieu/profond/derivee-${i}.ts`, ligne, [2]));
    aLaMain.forEach(([ligne, lignes], i) =>
      planter(`m-milieu/profond/main-${i}.ts`, ligne, lignes)
    );
    // CHAQUE forme dérivée est plantée : planter la première ou la dernière seulement rougit ici.
    expect(Object.keys(plantes).filter((f) => f.includes('/derivee-'))).toHaveLength(
      retenues.length
    );
    const racine = mkdtempSync(join(tmpdir(), 'qa3-'));
    try {
      for (const [f, texte] of Object.entries(plantes)) {
        mkdirSync(dirname(join(racine, f)), { recursive: true });
        writeFileSync(join(racine, f), texte);
      }
      const { lus, fautes } = lignesDeCouverture(racine);
      expect(lus).toBe(Object.keys(plantes).length);
      expect([...fautes].sort()).toEqual([...attendues].sort());
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
