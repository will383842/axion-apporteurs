/**
 * gov-pr-niveaux.ts — LA GARDE DE PR À TROIS NIVEAUX (GOV-160, décision de Williams du 2026-10-09,
 * #319, commentaire 6077512137). Registre : `gov:pr`. Elle remplace `scripts/gates/gov-pr.ts`,
 * ARCHIVÉ (conservé, plus lancé) avec ses familles de registre, de rattrapage, de journal et de
 * définition de « terminé ».
 *
 * USAGE : pnpm gov:pr                (en CI sur `pull_request` : titre, niveau, corps, migrations ;
 *                                      ailleurs : structure du gabarit seule)
 *         pnpm gov:pr --pr <numéro>  (avant fusion : tout, relectures comprises)
 *         pnpm gov:pr --prove        (un témoin par famille, chacun vu rougir)
 *
 * LES TROIS NIVEAUX — le niveau d'une PR est le PLUS HAUT de ses fichiers, et de sa tâche :
 *   — CRITIQUE : l'argent et les commissions, le RIB, le journal immuable, l'authentification, le
 *     cloisonnement, les données personnelles — et ce qui les garde (CI, gardes, dépendances,
 *     configuration). La rigueur d'avant reste : DEUX lentilles, `exactitude` et `securite`, le
 *     test vu ROUGE avant le code (bloc ROUGE/VERT), la section Attaque, et le VETO de `securite`.
 *   — NORMAL : une lentille, `exactitude` ou `securite`.
 *   — LÉGER : écrans, textes, documents, outillage — aucune lentille.
 * Sur tout niveau, un refus de `securite` sur la tête vaut veto. L'avis `schema` de l'architecte
 * n'est exigé que si une migration de la PR n'est PAS purement additive (lue par la garde des
 * migrations, `scripts/gates/migrations-additive.ts`, jamais réécrite ici).
 *
 * CE QU'ELLE NE JUGE QUE SUR LES FICHIERS DE LA PR : le niveau, les migrations ajoutées. Une
 * migration ajoutée porte un préfixe horodaté (AAAAMMJJhhmmss) STRICTEMENT postérieur à la
 * dernière de la base : plus de réservation ni de renumérotation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cheminsTouches, diffEntre } from './fichiers-de-la-pr';
import {
  ASSOCIATIONS_HABILITEES,
  codesDePoste,
  lentilleDeLaRevue,
  verdictDeLaRevue,
} from '../lot/revues';
import {
  controler as controlerMigrations,
  vueDuDepot as vueDesMigrations,
} from './migrations-additive';

export type Niveau = 'critique' | 'normal' | 'leger';
export type Faute = { famille: string; message: string };

export const FAMILLES = [
  'titre_non_conforme',
  'rouge_vert_absent',
  'attaque_absente',
  'migration_hors_ordre',
  'lentille_manquante',
  'veto_securite',
  'gabarit_incomplet',
  'statut_ecrit',
] as const;

export const CHEMIN_GABARIT = '.github/PULL_REQUEST_TEMPLATE.md';
export const MARQUEURS = ['rouge-vert:debut', 'rouge-vert:fin', 'attaque:debut', 'attaque:fin'];
export const MOTIF_TITRE =
  /^(feat|fix|test|docs|chore|refactor|ci|perf)\(([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)\):\s+\S/;

// ── le niveau ─────────────────────────────────────────────────────────────────

/** Les racines CRITIQUES : le code qui calcule, stocke ou garde, et ce qui exécute la porte A. */
export const RACINES_CRITIQUES: readonly string[] = [
  'src/domain/',
  'src/server/',
  'src/lib/',
  'src/app/api/',
  'src/middleware.ts',
  'middleware.ts',
  'prisma/',
  'packages/contracts/',
  '.github/',
  '.claude/',
  'config/',
  'patches/',
  // TOUT `scripts/` : l'outillage qui juge, mesure ou publie ne s'allège pas lui-même (refus de la
  // lentille securite sur #859 — une liste de sous-dossiers laissait `scripts/ci` et
  // `scripts/mutation` légers).
  'scripts/',
  // L'outillage qui juge ne s'allège pas lui-même (refus des lentilles sur #859) : le lot lit
  // les verdicts (`scripts/lot/revues.ts`), `scripts/lib/` sert les gardes.
  'src/config/',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
  'next.config.ts',
  'tests/integration/',
  'tests/unit/domaine/',
  'tests/unit/securite/',
  'docs/gates.json',
  'package.json',
  'pnpm-lock.yaml',
  'Dockerfile',
  '.semgrep.yml',
  'stryker.config.json',
  'vitest.config.ts',
  'eslint.config.mjs',
];

/** Un mot de l'argent, des données personnelles ou de la sécurité dans le CHEMIN : critique. */
export const MOTIF_CHEMIN_CRITIQUE =
  /(commission|argent|releve|versement|autofactur|rib|iban|sepa|paiement|grille|tva|das2|journal|auth|session|role|cloison|idor|rgpd|purge|chiffr|secret|securite|webhook|kyc|donnees|pii)/i;

/** Les racines LÉGÈRES : écrans, textes, documents, outillage. */
export const RACINES_LEGERES: readonly string[] = [
  'docs/',
  'src/content/',
  'src/app/',
  'src/components/',
  'README.md',
  'CHANGELOG.md',
  'CLAUDE.md',
];

/** Les zones de tâche qui rendent une PR critique, quels que soient ses fichiers. */
export const ZONES_CRITIQUES: readonly string[] = ['argent', 'securite'];

export type TacheLue = { id: string; zone?: string; sensible?: unknown };

const RANG: Record<Niveau, number> = { leger: 0, normal: 1, critique: 2 };

/**
 * PURE. Le niveau d'UN fichier. `contenu` rend le texte du fichier à la tête (ou `null`) : un
 * fichier d'écran qui déclare `'use server'` écrit des données, il est critique.
 */
export function niveauDuFichier(f: string, contenu: (f: string) => string | null): Niveau {
  if (RACINES_CRITIQUES.some((r) => (r.endsWith('/') ? f.startsWith(r) : f === r)))
    return 'critique';
  if (MOTIF_CHEMIN_CRITIQUE.test(f)) return 'critique';
  if (/^src\/app\//.test(f) && /['"]use server['"]/.test(contenu(f) ?? '')) return 'critique';
  if (RACINES_LEGERES.some((r) => (r.endsWith('/') ? f.startsWith(r) : f === r))) return 'leger';
  return 'normal';
}

/** PURE. Le niveau d'une PR : le plus haut de ses fichiers et de sa tâche. Un diff vide est critique. */
export function niveauDeLaPr(e: {
  fichiers: readonly string[];
  tache?: TacheLue | null;
  contenu?: (f: string) => string | null;
}): { niveau: Niveau; raisons: string[] } {
  const contenu = e.contenu ?? (() => null);
  if (e.fichiers.length === 0) return { niveau: 'critique', raisons: ['diff vide ou illisible'] };
  let niveau: Niveau = 'leger';
  const raisons: string[] = [];
  for (const f of e.fichiers) {
    const n = niveauDuFichier(f, contenu);
    if (n === 'critique') raisons.push(f);
    if (RANG[n] > RANG[niveau]) niveau = n;
  }
  const t = e.tache;
  if (
    t &&
    (ZONES_CRITIQUES.includes(t.zone ?? '') || (Array.isArray(t.sensible) && t.sensible.length > 0))
  ) {
    niveau = 'critique';
    raisons.unshift(
      `tâche ${t.id} (zone ${t.zone ?? '?'}, sensible ${JSON.stringify(t.sensible)})`
    );
  }
  return { niveau, raisons };
}

/** PURE. Les lentilles exigées. `schema` seulement si une migration n'est pas purement additive. */
export function lentillesExigees(
  niveau: Niveau,
  migrationNonAdditive: boolean
): {
  toutes: string[];
  uneParmi: string[];
} {
  const schema = migrationNonAdditive ? ['schema'] : [];
  if (niveau === 'critique') return { toutes: ['exactitude', 'securite', ...schema], uneParmi: [] };
  if (niveau === 'normal') return { toutes: schema, uneParmi: ['exactitude', 'securite'] };
  return { toutes: schema, uneParmi: [] };
}

// ── le corps ──────────────────────────────────────────────────────────────────

function bloc(corps: string, nom: string): string | null {
  const d = corps.indexOf(`<!-- ${nom}:debut -->`);
  const f = corps.indexOf(`<!-- ${nom}:fin -->`);
  if (d < 0 || f < d) return null;
  return corps.slice(d + `<!-- ${nom}:debut -->`.length, f).trim();
}

const SANS_OBJET = /^sans objet\s*:\s*\S.{9,}/im;
const ESPACE_RESERVE = /^\(.*\)$/;

/**
 * PURE. Le corps d'une PR critique : bloc ROUGE/VERT et section Attaque remplis. `code` : la PR
 * touche `src/` ou `prisma/` — alors « sans objet » n'est pas une réponse, le rouge se constate.
 */
export function fautesDuCorps(corps: string, niveau: Niveau, code: boolean): Faute[] {
  if (niveau !== 'critique') return [];
  const fautes: Faute[] = [];
  const rv = bloc(corps, 'rouge-vert');
  const rouge = /^ROUGE\s*:\s*(.*)$/m.exec(rv ?? '')?.[1]?.trim() ?? '';
  const rougeVide = rouge === '' || ESPACE_RESERVE.test(rouge);
  const rougeSansObjet = /^sans objet/i.test(rouge) || SANS_OBJET.test(rv ?? '');
  if (rv === null || (rougeVide && !rougeSansObjet) || (code && (rougeVide || rougeSansObjet))) {
    fautes.push({
      famille: 'rouge_vert_absent',
      message:
        'PR critique : le bloc ROUGE/VERT porte le message d’échec VERBATIM du test lancé avant le ' +
        'code' +
        (code
          ? ' (la PR touche src/ ou prisma/ : « sans objet » n’y est pas admis).'
          : ', ou « sans objet : <motif> ».'),
    });
  }
  const at = bloc(corps, 'attaque');
  const atVide =
    at === null || at === '' || ESPACE_RESERVE.test(at) || (code && /^sans objet/i.test(at));
  if (atVide) {
    fautes.push({
      famille: 'attaque_absente',
      message:
        'PR critique : la section Attaque dit le scénario joué, le résultat obtenu, et qui l’a joué' +
        (code ? ' (la PR touche src/ ou prisma/ : « sans objet » n’y est pas admis).' : '.'),
    });
  }
  return fautes;
}

export function fauteDuTitre(titre: string): Faute[] {
  return MOTIF_TITRE.test(titre)
    ? []
    : [
        {
          famille: 'titre_non_conforme',
          message: `titre « ${titre} » : attendu <type>(<ID-TÂCHE>): <titre> (docs/CONVENTIONS.md §5).`,
        },
      ];
}

// ── les migrations ────────────────────────────────────────────────────────────

const MOTIF_MIGRATION = /^prisma\/migrations\/([^/]+)\//;

/** PURE. Une migration AJOUTÉE porte un horodatage strictement postérieur à la dernière de la base. */
export function fautesDOrdre(base: readonly string[], ajoutees: readonly string[]): Faute[] {
  const derniere =
    [...base]
      .filter((d) => /^\d{14}_/.test(d))
      .sort()
      .pop() ?? '';
  const fautes: Faute[] = [];
  for (const d of [...new Set(ajoutees)].sort()) {
    if (!/^\d{14}_[a-z0-9_]+$/.test(d)) {
      fautes.push({
        famille: 'migration_hors_ordre',
        message: `prisma/migrations/${d} — attendu AAAAMMJJhhmmss_nom (horodatage à l'écriture).`,
      });
    } else if (d.slice(0, 14) <= derniere.slice(0, 14)) {
      fautes.push({
        famille: 'migration_hors_ordre',
        message:
          `prisma/migrations/${d} — son horodatage n'est pas postérieur à la dernière migration de ` +
          `main (${derniere}) : régénère-la à l'heure actuelle.`,
      });
    }
  }
  return fautes;
}

/** Les migrations de la PR sont-elles purement additives ? Lu par la garde des migrations. */
export function migrationNonAdditive(fichiers: readonly string[]): boolean {
  const dossiers = new Set(fichiers.map((f) => MOTIF_MIGRATION.exec(f)?.[1]).filter(Boolean));
  if (dossiers.size === 0) return false;
  const vue = vueDesMigrations();
  const verdict = controlerMigrations({
    ...vue,
    migrations: vue.migrations.filter((m) => dossiers.has(MOTIF_MIGRATION.exec(m.chemin)?.[1])),
  });
  return verdict.fautes.length + verdict.absoutes.length > 0;
}

// ── les relectures ────────────────────────────────────────────────────────────

export type RevueLue = {
  association: string;
  corps: string;
  commit: string;
  soumise: string;
};

/** PURE. Les lentilles exigées sans accord sur la tête, et le veto de `securite`. */
export function fautesDesRevues(
  revues: readonly RevueLue[],
  tete: string,
  exigees: { toutes: string[]; uneParmi: string[] },
  codes: ReadonlySet<string>
): Faute[] {
  const derniere = new Map<string, 'accepte' | 'refuse'>();
  for (const r of [...revues].sort((a, b) => a.soumise.localeCompare(b.soumise))) {
    if (!ASSOCIATIONS_HABILITEES.has(r.association.toUpperCase()) || r.commit !== tete) continue;
    const l = lentilleDeLaRevue(r.corps, codes);
    const v = verdictDeLaRevue(r.corps);
    if (!('lentille' in l) || !('verdict' in v)) continue;
    derniere.set(l.lentille, v.verdict);
  }
  const fautes: Faute[] = [];
  if (derniere.get('securite') === 'refuse') {
    fautes.push({
      famille: 'veto_securite',
      message: 'la lentille securite refuse la tête : veto.',
    });
  }
  for (const l of exigees.toutes) {
    if (derniere.get(l) !== 'accepte') {
      fautes.push({
        famille: 'lentille_manquante',
        message: `lentille « ${l} » : aucun « Verdict: accepte » sur la tête ${tete.slice(0, 7)}.`,
      });
    }
  }
  if (exigees.uneParmi.length > 0 && !exigees.uneParmi.some((l) => derniere.get(l) === 'accepte')) {
    fautes.push({
      famille: 'lentille_manquante',
      message: `une lentille parmi ${exigees.uneParmi.join(', ')} : aucun accord sur la tête ${tete.slice(0, 7)}.`,
    });
  }
  return fautes;
}

// ── le statut des tâches ─────────────────────────────────────────────────────

/**
 * L'exception unique : la PR qui a retiré l'écriture des statuts (GOV-160, décision #319,
 * 6077512137). Liée à son NUMÉRO, jamais au titre : un titre se copie, un numéro de PR non.
 */
export const PR_EXCEPTEE_DU_STATUT = 859;

function statutsDe(texte: string | null): Map<string, unknown> {
  if (texte === null) return new Map();
  const doc = JSON.parse(texte) as { taches?: { id: string; statut?: unknown }[] };
  return new Map((doc.taches ?? []).map((t) => [t.id, t.statut]));
}

/**
 * PURE. Aucune PR d'auteur n'écrit de statut dans `docs/tasks.json` : l'avancement se dérive des
 * PR fusionnées (`pnpm avancement`). Une tâche AJOUTÉE ou RETIRÉE n'est pas un statut écrit ; un
 * statut changé sur une tâche existante l'est.
 */
export function fautesDeStatut(
  base: string | null,
  tete: string | null,
  numero: number | null
): Faute[] {
  if (numero === PR_EXCEPTEE_DU_STATUT) return [];
  let avant: Map<string, unknown>;
  let apres: Map<string, unknown>;
  try {
    avant = statutsDe(base);
    apres = statutsDe(tete);
  } catch {
    return [
      { famille: 'statut_ecrit', message: 'docs/tasks.json illisible : statuts non vérifiables.' },
    ];
  }
  const changes = [...apres]
    .filter(([id, st]) => avant.has(id) && avant.get(id) !== st)
    .map(([id]) => id);
  return changes.length === 0
    ? []
    : [
        {
          famille: 'statut_ecrit',
          message: `docs/tasks.json : statut modifié pour ${changes.slice(0, 8).join(', ')} — aucune PR n'écrit de statut ; l'avancement se lit par « pnpm avancement ».`,
        },
      ];
}

function tasksA(ref: string): string | null {
  try {
    return git(['show', `${ref}:docs/tasks.json`]);
  } catch {
    return null;
  }
}

// ── le gabarit ────────────────────────────────────────────────────────────────

export function fautesDuGabarit(gabarit: string): Faute[] {
  return MARQUEURS.filter((m) => gabarit.split(`<!-- ${m} -->`).length !== 2).map((m) => ({
    famille: 'gabarit_incomplet',
    message: `${CHEMIN_GABARIT} — le marqueur ${m} doit y figurer exactement une fois.`,
  }));
}

// ── lectures (forge, git) ─────────────────────────────────────────────────────

function git(args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Les deux côtés d'un renommage : un fichier critique déplacé (vers `tests/archive/`, `docs/`) reste critique. */
function fichiersEntre(base: string, tete: string): string[] {
  return cheminsTouches(diffEntre(base, tete));
}

function migrationsAjoutees(base: string, tete: string): string[] {
  return git([
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${base}...${tete}`,
    '--',
    'prisma/migrations/',
  ])
    .split('\n')
    .map((f) => MOTIF_MIGRATION.exec(f)?.[1])
    .filter((d): d is string => !!d);
}

function migrationsDeLaBase(base: string): string[] {
  return git(['ls-tree', '--name-only', `${base}:prisma/migrations`])
    .split('\n')
    .filter(Boolean);
}

function tacheDeLaBase(base: string, titre: string): TacheLue | null {
  const id = MOTIF_TITRE.exec(titre)?.[2];
  if (!id) return null;
  try {
    const doc = JSON.parse(git(['show', `${base}:docs/tasks.json`])) as { taches: TacheLue[] };
    return doc.taches.find((t) => t.id === id) ?? null;
  } catch {
    return null;
  }
}

const contenuALaTete = (f: string): string | null =>
  existsSync(f) ? readFileSync(f, 'utf8') : null;

type PrLue = {
  numero: number | null;
  titre: string;
  corps: string;
  base: string;
  tete: string;
  fichiers: string[];
};

function juger(pr: PrLue, revues: RevueLue[] | null): { niveau: Niveau; fautes: Faute[] } {
  const { niveau, raisons } = niveauDeLaPr({
    fichiers: pr.fichiers,
    tache: tacheDeLaBase(pr.base, pr.titre),
    contenu: contenuALaTete,
  });
  const code = pr.fichiers.some((f) => f.startsWith('src/') || f.startsWith('prisma/'));
  const nonAdditive = migrationNonAdditive(pr.fichiers);
  const exigees = lentillesExigees(niveau, nonAdditive);
  console.log(
    `gov:pr — niveau ${niveau.toUpperCase()} ; lentilles : ` +
      `${[...exigees.toutes, ...(exigees.uneParmi.length ? [`une parmi ${exigees.uneParmi.join('/')}`] : [])].join(', ') || 'aucune'}` +
      (raisons.length
        ? `\n   critique par : ${raisons.slice(0, 8).join(', ')}${raisons.length > 8 ? ', …' : ''}`
        : '')
  );
  const fautes = [
    ...fauteDuTitre(pr.titre),
    ...fautesDuCorps(pr.corps, niveau, code),
    ...fautesDOrdre(migrationsDeLaBase(pr.base), migrationsAjoutees(pr.base, pr.tete)),
    ...(pr.fichiers.includes('docs/tasks.json')
      ? fautesDeStatut(tasksA(pr.base), tasksA(pr.tete), pr.numero)
      : []),
  ];
  if (revues !== null) fautes.push(...fautesDesRevues(revues, pr.tete, exigees, codesDePoste()));
  return { niveau, fautes };
}

function prParGh(numero: string): { pr: PrLue; revues: RevueLue[] } {
  const v = JSON.parse(
    execFileSync('gh', ['pr', 'view', numero, '--json', 'title,body,baseRefName,headRefOid'], {
      encoding: 'utf8',
    })
  ) as { title: string; body: string; baseRefName: string; headRefOid: string };
  git(['fetch', '-q', 'origin', v.baseRefName, v.headRefOid]);
  const base = `origin/${v.baseRefName}`;
  const brutes = JSON.parse(
    execFileSync('gh', ['api', '--paginate', `repos/{owner}/{repo}/pulls/${numero}/reviews`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  ) as { author_association?: string; body?: string; commit_id?: string; submitted_at?: string }[];
  return {
    pr: {
      numero: Number(numero),
      titre: v.title,
      corps: v.body ?? '',
      base,
      tete: v.headRefOid,
      fichiers: fichiersEntre(base, v.headRefOid),
    },
    revues: brutes.map((r) => ({
      association: r.author_association ?? '',
      corps: r.body ?? '',
      commit: r.commit_id ?? '',
      soumise: r.submitted_at ?? '',
    })),
  };
}

function prParEvenement(): PrLue | null {
  const chemin = process.env['GITHUB_EVENT_PATH'];
  if (process.env['GITHUB_EVENT_NAME'] !== 'pull_request' || !chemin) return null;
  const e = JSON.parse(readFileSync(chemin, 'utf8')) as {
    pull_request: {
      number: number;
      title: string;
      body: string | null;
      base: { sha: string };
      head: { sha: string };
    };
  };
  const p = e.pull_request;
  return {
    numero: typeof p.number === 'number' ? p.number : null,
    titre: p.title,
    corps: p.body ?? '',
    base: p.base.sha,
    tete: p.head.sha,
    fichiers: fichiersEntre(p.base.sha, p.head.sha),
  };
}

// ── la preuve ─────────────────────────────────────────────────────────────────

const CORPS_CRITIQUE_REMPLI = [
  '<!-- rouge-vert:debut -->',
  'ROUGE : AssertionError: expected 0 to be 1',
  'VERT : 3 passed',
  '<!-- rouge-vert:fin -->',
  '<!-- attaque:debut -->',
  'Scénario : un apporteur lit le relevé d’un autre. Résultat : 404. Joué par A09.',
  '<!-- attaque:fin -->',
].join('\n');

const TETE = 'a'.repeat(40);
const revue = (corps: string, commit = TETE, association = 'OWNER'): RevueLue => ({
  association,
  corps,
  commit,
  soumise: '2026-10-09T10:00:00Z',
});

export const TEMOINS: { famille: (typeof FAMILLES)[number]; fautes: () => Faute[] }[] = [
  { famille: 'titre_non_conforme', fautes: () => fauteDuTitre('ajout du relevé') },
  {
    famille: 'rouge_vert_absent',
    fautes: () =>
      fautesDuCorps(
        CORPS_CRITIQUE_REMPLI.replace(/ROUGE : .*/, 'ROUGE : sans objet : pas de test'),
        'critique',
        true
      ),
  },
  {
    famille: 'attaque_absente',
    fautes: () => fautesDuCorps(CORPS_CRITIQUE_REMPLI.replace(/Scénario.*/, ''), 'critique', true),
  },
  {
    famille: 'migration_hors_ordre',
    fautes: () => fautesDOrdre(['20261003005025_b'], ['20261001000000_a']),
  },
  {
    famille: 'lentille_manquante',
    fautes: () =>
      fautesDesRevues(
        [revue('A09 · exactitude\nVerdict: accepte')],
        TETE,
        lentillesExigees('critique', false),
        new Set(['A09'])
      ),
  },
  {
    famille: 'veto_securite',
    fautes: () =>
      fautesDesRevues(
        [revue('A09 · securite\nVerdict: refuse')],
        TETE,
        lentillesExigees('leger', false),
        new Set(['A09'])
      ),
  },
  { famille: 'gabarit_incomplet', fautes: () => fautesDuGabarit('<!-- rouge-vert:debut -->') },
  {
    famille: 'statut_ecrit',
    fautes: () =>
      fautesDeStatut(
        JSON.stringify({ taches: [{ id: 'DM-01', statut: 'a_faire' }] }),
        JSON.stringify({ taches: [{ id: 'DM-01', statut: 'fusionnee' }] }),
        900
      ),
  },
];

/** Les contre-témoins : chacun doit rester VERT, sans quoi la garde refuserait le cas légitime. */
export const CONTRE_TEMOINS: { nom: string; fautes: () => Faute[] }[] = [
  { nom: 'titre conforme', fautes: () => fauteDuTitre('feat(DM-01): le journal') },
  {
    nom: 'corps critique rempli',
    fautes: () => fautesDuCorps(CORPS_CRITIQUE_REMPLI, 'critique', true),
  },
  { nom: 'PR légère sans bloc', fautes: () => fautesDuCorps('', 'leger', false) },
  {
    nom: 'définition modifiée, statut intact',
    fautes: () =>
      fautesDeStatut(
        JSON.stringify({ taches: [{ id: 'DM-01', statut: 'a_faire', titre: 'a' }] }),
        JSON.stringify({ taches: [{ id: 'DM-01', statut: 'a_faire', titre: 'b' }] }),
        900
      ),
  },
  {
    nom: 'migration postérieure',
    fautes: () => fautesDOrdre(['20261003005025_b'], ['20261009120000_c']),
  },
  {
    nom: 'critique, deux accords sur la tête',
    fautes: () =>
      fautesDesRevues(
        [revue('A09 · exactitude\nVerdict: accepte'), revue('A08 · securite\nVerdict: accepte')],
        TETE,
        lentillesExigees('critique', false),
        new Set(['A08', 'A09'])
      ),
  },
  {
    nom: 'normal, un accord',
    fautes: () =>
      fautesDesRevues(
        [revue('A09 · exactitude\nVerdict: accepte')],
        TETE,
        lentillesExigees('normal', false),
        new Set(['A09'])
      ),
  },
];

function prouver(): number {
  let ko = 0;
  for (const t of TEMOINS) {
    const vu = t.fautes().some((f) => f.famille === t.famille);
    console.log(`${vu ? '✅' : '❌'} ${t.famille} ${vu ? 'rougit' : 'NE ROUGIT PAS'}`);
    if (!vu) ko++;
  }
  for (const c of CONTRE_TEMOINS) {
    const f = c.fautes();
    console.log(
      `${f.length === 0 ? '✅' : '❌'} contre-témoin « ${c.nom} » ${f.length === 0 ? 'vert' : 'ROUGIT'}`
    );
    if (f.length) ko++;
  }
  const niveaux: [string, Niveau][] = [
    ['src/domain/commission/calcul.ts', 'critique'],
    ['docs/PRIORITES.md', 'leger'],
    ['src/app/(espace)/accueil/page.tsx', 'leger'],
    ['tests/unit/espace/accueil.spec.ts', 'normal'],
    ['scripts/lot/revues.ts', 'critique'],
    ['next.config.mjs', 'critique'],
  ];
  for (const [f, attendu] of niveaux) {
    const lu = niveauDuFichier(f, () => null);
    console.log(`${lu === attendu ? '✅' : '❌'} ${f} → ${lu} (attendu ${attendu})`);
    if (lu !== attendu) ko++;
  }
  return ko === 0 ? 0 : 1;
}

// ── principal ─────────────────────────────────────────────────────────────────

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]gov-pr-niveaux(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const argv = process.argv.slice(2);
  if (argv.includes('--prove')) process.exit(prouver());
  const fautesGabarit = fautesDuGabarit(readFileSync(CHEMIN_GABARIT, 'utf8'));
  const i = argv.indexOf('--pr');
  let fautes: Faute[] = [...fautesGabarit];
  if (i >= 0) {
    const numero = argv[i + 1] ?? '';
    if (!/^\d+$/.test(numero)) {
      console.error('gov:pr — --pr attend un numéro de PR.');
      process.exit(2);
    }
    const { pr, revues } = prParGh(numero);
    fautes.push(...juger(pr, revues).fautes);
  } else {
    const pr = prParEvenement();
    if (pr === null) console.log('gov:pr — hors PR : structure du gabarit seule.');
    else fautes = [...fautes, ...juger(pr, null).fautes];
  }
  if (fautes.length > 0) {
    for (const f of fautes) console.error(`❌ [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  console.log('✅ gov:pr');
  process.exit(0);
}
