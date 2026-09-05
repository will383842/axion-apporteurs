/**
 * gov-etat.ts — la garde de l'état vivant : fraîcheur de PLAN-STATE, verrou d'un seul revendiqueur
 * par tâche, journal qui précède la fusion (GOV-008, REQ-GOV-006 / REQ-GOV-007 / REQ-GOV-023).
 *
 * USAGE : npx tsx scripts/gates/gov-etat.ts --now <ISO>   tout, familles GitHub comprises
 *         npx tsx scripts/gates/gov-etat.ts               idem, sauf la famille qui a besoin
 *                                                          d'un instant : elle est dite NON ÉVALUÉE
 *         npx tsx scripts/gates/gov-etat.ts --hors-ligne  les familles GitHub sont déclarées HORS
 *                                                          PÉRIMÈTRE et NOMMÉES, pas tues
 *         npx tsx scripts/gates/gov-etat.ts --prove       un témoin par famille, des contre-témoins verts
 *
 * ELLE NE LIT PAS L'HORLOGE. `--now <ISO>` est donné de l'extérieur. Une garde qui appelle
 * `new Date()` n'est pas rejouable : son verdict dépend de l'heure à laquelle la CI a démarré, et
 * un rouge d'hier ne se reproduit plus aujourd'hui. Sans `--now`, la famille qui en dépend n'est
 * pas réputée verte : elle est déclarée non évaluée, et nommée.
 *
 * ELLE LIT GITHUB, ET ELLE PEUT ÉCHOUER À LE LIRE. Cinq familles sur neuf ont besoin de
 * `gh pr list` / `gh issue list`. Sans `gh`, sans authentification ou sans réseau, cette garde
 * ÉCHOUE (code 1) en nommant les familles qu'elle n'a pas pu évaluer. Elle ne rend jamais vert en
 * silence : une gate qui passe parce qu'elle n'a rien pu lire est pire que pas de gate — elle
 * fabrique la confiance qu'elle ne mérite plus. `--hors-ligne` est le seul chemin qui l'autorise à
 * sortir 0 sans les cinq familles, et il l'écrit en toutes lettres dans sa sortie.
 * `GOV_ETAT_GH` nomme le binaire appelé : c'est la couture par laquelle les tests reproduisent
 * « pas de `gh` » sans toucher au PATH. La pointer sur autre chose ne peut que faire ÉCHOUER la
 * garde (une commande muette rend une sortie que `JSON.parse` refuse), jamais la faire taire.
 *
 * POURQUOI LA REVENDICATION N'EST PAS DANS PLAN-STATE, MALGRÉ LA LETTRE DE REQ-GOV-007.
 * L'exigence dit « revendiqué par écriture dans PLAN-STATE ». `docs/PLAN-STATE.md` est une VUE
 * dérivée (`partners/ADR-0005` §1) et `.claude/settings.json` en refuse l'écriture : la
 * revendication ne PEUT pas s'y écrire — ce qu'on y écrirait serait effacé à la génération
 * suivante. Elle vit donc dans les deux sources qui existaient déjà, et PLAN-STATE les rend :
 *   — en vol : les labels `en_cours` + `owner:<Axx>` de l'issue, posés par l'orchestrateur au §3 de
 *     `.claude/skills/lot/SKILL.md` (`gh issue edit <n> --add-label`), qui en est le seul écrivain ;
 *   — consolidée : le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul.
 * Cette garde lit les DEUX et rougit quand elles nomment deux revendiqueurs différents.
 *
 * CE QU'ELLE NE GARDE PAS, ET POURQUOI C'EST DIT PLUTÔT QUE CACHÉ. La revendication d'une tâche
 * DÉJÀ LIVRÉE n'est pas contrôlée : `pnpm lot:cloture` écrit `docs/tasks.json` mais ne retire pas
 * les labels de l'issue, si bien que sept issues portent aujourd'hui `en_cours` + `owner:A01` sur
 * des tâches `fusionnee` (mesuré le 2026-09-03 : issues #5, #8, #9, #11, #17, #20, #24). Armer
 * cette famille rendrait la garde rouge en permanence sur un défaut qui appartient à `lot:cloture`
 * (GOV-012), et une gate toujours rouge ne garde plus rien. `docs/PLAN-STATE.md` compte ces
 * revendications périmées et les nomme : le défaut est visible, il n'est pas gardé.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIVREE as LIVREE_DERIVEE, verifierExhaustivite } from '../lot/avancement';

const CHEMIN_PLAN_STATE = 'docs/PLAN-STATE.md';
const CHEMIN_JOURNAL = 'docs/journal';
const CHEMIN_README_JOURNAL = 'docs/journal/README.md';
const CHEMIN_TACHES = 'docs/tasks.json';

/** Les états dans lesquels une tâche est livrée : sa revendication est de l'histoire, pas un verrou. */
// L'ensemble « livrée » ne s'écrit plus ici : il se DÉRIVE du barème unique de
// `scripts/lot/avancement.ts`, dont l'exhaustivité est confrontée à l'enum `statut` du schéma.
// Il était recopié dans CINQ fichiers — relevé par la lentille `schema` sur la PR 28, dans la
// PR même qui écrivait la règle l'interdisant (RM-04, `docs/GLOSSAIRE.md` §4 : « deux copies du
// même vocabulaire divergent toujours »). Un dixième statut faisait rougir `gov:inventaire` et
// laissait les cinq copies se taire en se trompant.
const LIVREES = LIVREE_DERIVEE;

// Une garde qui lit un statut ne tourne pas sur un barème incomplet sans le dire.
{
  const ecarts = verifierExhaustivite();
  if (ecarts.length > 0) {
    console.error("❌ scripts/lot/avancement.ts a dérivé de scripts/lot/tasks.schema.json :");
    ecarts.forEach((e) => console.error("   " + e));
    process.exit(1);
  }
}

/**
 * Les rubriques que REQ-GOV-006 énumère nommément. La vue doit toutes les rendre ; l'exigence est
 * la seule source de cette liste, elle n'est ni devinée ni élargie.
 * `## Phase courante` sert d'ancre de fin au bloc de reprise : il doit venir APRÈS lui.
 */
const RUBRIQUES = [
  { ancre: '## REPRENDRE EN 30 SECONDES', sert: 'le bloc « REPRENDRE EN 30 SECONDES »' },
  { ancre: '## File de fusion', sert: 'les PR en vol et la file de fusion ORDONNÉE' },
  { ancre: '## Revendications', sert: 'la tâche revendiquée par agent' },
  { ancre: '## Décisions du jour', sert: 'les décisions du jour' },
  { ancre: '## Prochain pas', sert: 'le prochain pas' },
  { ancre: '## Journal', sert: 'le journal fait / reste / appris (REQ-GOV-023)' },
  { ancre: '## Dernier atterrissage', sert: 'le SHA de `main`' },
];

type Faute = { famille: string; message: string };

/** Les trois familles qui ne lisent que le disque : toujours évaluées. */
const FAMILLES_LOCALES = ['plan_state_incomplet', 'journal_entree_incomplete', 'journal_doublon_pr'];
/** La famille qui a besoin d'un instant : évaluée seulement sous `--now <ISO>`. */
const FAMILLES_INSTANT = ['journal_date_future'];
/** Les cinq familles qui lisent GitHub : évaluées sauf `--hors-ligne`, et alors NOMMÉES. */
const FAMILLES_GITHUB = [
  'plan_state_perime',
  'deux_pr_meme_tache',
  'pr_sur_tache_non_revendiquee',
  'revendication_multiple',
  'pr_fusionnee_sans_journal',
];
const FAMILLES = [...FAMILLES_LOCALES, ...FAMILLES_INSTANT, ...FAMILLES_GITHUB];

type Entree = { pr: number; date: string; titre: string; corps: string; fichier: string };
type Tache = { id: string; titre: string; statut: string; owner: string | null; issue: number | null };
type PrOuverte = { numero: number; titre: string };
type PrFusionnee = { numero: number; titre: string; dateCommitIso: string };

type Etat = {
  planState: string;
  /** Date du dernier commit qui a touché `docs/PLAN-STATE.md`. `null` = jamais commité. */
  planStateDateIso: string | null;
  entrees: Entree[];
  plancherPr: number;
  taches: Tache[];
  /** `null` = non lu (mode hors ligne). Ce n'est PAS « aucune PR ». */
  prOuvertes: PrOuverte[] | null;
  prFusionnees: PrFusionnee[] | null;
  /** issue → revendiqueurs lus dans ses labels `owner:<Axx>`. `null` = non lu. */
  revendications: Map<number, string[]> | null;
  /** `null` = `--now` non donné : la famille d'instant n'est pas évaluée. */
  maintenant: string | null;
};

// ── lecture du disque ────────────────────────────────────────────────────────

/**
 * Les entrées du journal, dérivées du SYSTÈME DE FICHIERS — comme `pnpm adr:index` dérive l'index
 * des ADR de `ls docs/adr/`. Un lot qui craint le conflit peut poser son propre fichier : le
 * balayage le trouve sans qu'aucune liste n'ait à être tenue.
 */
function lireJournal(): Entree[] {
  if (!existsSync(CHEMIN_JOURNAL)) {
    console.error(`❌ gov:etat — \`${CHEMIN_JOURNAL}\` est absent : le journal n'a pas de source.`);
    process.exit(1);
  }
  const out: Entree[] = [];
  for (const nom of readdirSync(CHEMIN_JOURNAL).filter((n) => n.endsWith('.md')).sort()) {
    const texte = readFileSync(join(CHEMIN_JOURNAL, nom), 'utf8');
    for (const bloc of texte.split(/^## /m).slice(1)) {
      const m = /^PR #(\d+) — (\d{4}-\d{2}-\d{2}) — (.*)$/m.exec(bloc);
      if (!m || !m[1] || !m[2]) continue;
      out.push({ pr: Number(m[1]), date: m[2], titre: (m[3] ?? '').trim(), corps: bloc, fichier: nom });
    }
  }
  return out;
}

/**
 * Le plancher est DÉRIVÉ de `docs/journal/README.md` (RM-01) : le déplacer se fait à un seul
 * endroit, celui que lit un humain qui ouvre le journal. Le recopier ici aurait garanti qu'un jour
 * la garde et la doctrine ne disent plus la même chose.
 */
function lirePlancher(): number {
  if (!existsSync(CHEMIN_README_JOURNAL)) {
    console.error(`❌ gov:etat — \`${CHEMIN_README_JOURNAL}\` est absent : le plancher du journal n'a pas de source.`);
    process.exit(1);
  }
  const m = /Plancher\s*:\s*le journal couvre les PR de numéro \*\*> (\d+)\*\*/.exec(
    readFileSync(CHEMIN_README_JOURNAL, 'utf8')
  );
  if (!m || !m[1]) {
    console.error(
      `❌ gov:etat — le plancher du journal est introuvable dans \`${CHEMIN_README_JOURNAL}\`.\n` +
        '   Forme attendue : « Plancher : le journal couvre les PR de numéro **> <n>**. »'
    );
    process.exit(1);
  }
  return Number(m[1]);
}

function lireTaches(): Tache[] {
  const doc = JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Record<string, unknown>[] };
  return doc.taches.map((t, i) => {
    // La garde lit trois champs de `docs/tasks.json` ; s'ils disparaissaient, elle jugerait sur du
    // vide sans le dire. On refuse plutôt que de compléter (RM-03 : une fonction qui « complète »
    // une fixture VÉRIFIE, elle ne fabrique pas).
    for (const champ of ['id', 'statut']) {
      if (typeof t[champ] !== 'string') {
        console.error(`❌ gov:etat — \`${CHEMIN_TACHES}\` : la tâche #${i} n'a pas de \`${champ}\` lisible.`);
        process.exit(1);
      }
    }
    return {
      id: t['id'] as string,
      titre: (t['titre'] as string) ?? '',
      statut: t['statut'] as string,
      owner: (t['owner'] as string | null) ?? null,
      issue: (t['issue'] as number | null) ?? null,
    };
  });
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

// ── lecture de GitHub, explicite et faillible ────────────────────────────────

/**
 * La commande qui parle à GitHub. `GOV_ETAT_GH` peut porter des arguments (« node banc.js ») : sur
 * Windows, `execFileSync` refuse un `.cmd` sans `shell: true` (EINVAL), et passer `shell: true`
 * aurait fait de cette variable une injection de commande. Le découpage sur les espaces garde
 * l'exécution SANS shell — c'est la seule forme qui permette au banc d'attaque de présenter un
 * `gh` compromis sans ouvrir un trou dans le chemin de production.
 */
const COMMANDE_GH = (process.env['GOV_ETAT_GH'] || 'gh').split(/\s+/).filter(Boolean);
const BINAIRE_GH = COMMANDE_GH[0] ?? 'gh';
const PREFIXE_GH = COMMANDE_GH.slice(1);

function gh(args: string[]): string {
  return execFileSync(BINAIRE_GH, [...PREFIXE_GH, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Sort en ÉCHEC en nommant ce qui n'a pas pu être évalué. Jamais un vert silencieux. */
function abandonGithub(commande: string, e: unknown): never {
  console.error(`❌ gov:etat — [github_illisible] \`${commande}\` a échoué : ${(e as Error).message}`);
  console.error(`   Les ${FAMILLES_GITHUB.length} familles qui lisent GitHub n'ont PAS été évaluées :`);
  console.error(`   ${FAMILLES_GITHUB.map((f) => '• ' + f).join('\n   ')}`);
  console.error(
    '   Une gate qui passe parce qu’elle n’a rien pu lire est pire que pas de gate. Si l’absence de\n' +
      '   réseau est assumée, relance avec `--hors-ligne` : les cinq familles seront déclarées hors périmètre.'
  );
  process.exit(1);
}

function lireGithub(): {
  prOuvertes: PrOuverte[];
  prFusionnees: PrFusionnee[];
  revendications: Map<number, string[]>;
} {
  let prOuvertes: PrOuverte[];
  try {
    prOuvertes = (JSON.parse(gh(['pr', 'list', '--state', 'open', '--json', 'number,title', '--limit', '100'])) as {
      number: number;
      title: string;
    }[]).map((p) => ({ numero: p.number, titre: p.title ?? '' }));
  } catch (e) {
    abandonGithub('gh pr list --state open', e);
  }

  let brutFusionnees: { number: number; title: string; mergeCommit: { oid: string } | null }[];
  try {
    brutFusionnees = JSON.parse(
      gh(['pr', 'list', '--state', 'merged', '--json', 'number,title,mergeCommit', '--limit', '100'])
    ) as typeof brutFusionnees;
  } catch (e) {
    abandonGithub('gh pr list --state merged', e);
  }

  /**
   * La date d'une fusion est celle de son COMMIT, pas le `mergedAt` de l'API.
   * MESURE du 2026-09-03 : la PR #27 porte `mergedAt = 2026-09-03T21:11:59Z` et son commit de
   * fusion `ff3ef54` porte `2026-09-03T21:11:58Z` — une seconde d'écart, systématique, parce que
   * GitHub horodate la fusion APRÈS avoir écrit le commit. Comparer la date de PLAN-STATE (lue par
   * `git log`) à `mergedAt` rendait donc ROUGE un dépôt parfaitement à jour, dont PLAN-STATE avait
   * été régénéré DANS ce commit même. Les deux dates viennent maintenant de la même horloge.
   */
  const prFusionnees: PrFusionnee[] = [];
  for (const p of brutFusionnees) {
    const oid = p.mergeCommit?.oid;
    if (!oid) continue; // fusionnée sans commit lisible (branche supprimée côté forge) : hors portée
    const date = git(['log', '-1', '--format=%cI', oid]);
    if (!date) {
      console.error(
        `❌ gov:etat — [github_illisible] le commit de fusion \`${oid}\` (PR #${p.number}) est absent du clone.\n` +
          '   La fraîcheur de PLAN-STATE ne peut pas être jugée. Le job doit poser `fetch-depth: 0` sur actions/checkout.'
      );
      process.exit(1);
    }
    prFusionnees.push({ numero: p.number, titre: p.title ?? '', dateCommitIso: date });
  }

  let issues: { number: number; labels: { name: string }[] }[];
  try {
    issues = JSON.parse(gh(['issue', 'list', '--state', 'open', '--json', 'number,labels', '--limit', '200'])) as typeof issues;
  } catch (e) {
    abandonGithub('gh issue list --state open', e);
  }
  const revendications = new Map<number, string[]>();
  for (const i of issues) {
    const owners = (i.labels ?? [])
      .map((l) => l.name)
      .filter((n) => n.startsWith('owner:'))
      .map((n) => n.slice('owner:'.length));
    if (owners.length > 0) revendications.set(i.number, owners);
  }

  return { prOuvertes, prFusionnees, revendications };
}

// ── les neuf familles ────────────────────────────────────────────────────────

/** L'identifiant de tâche que cite une PR : la clé du titre `<type>(<ID-TÂCHE>): <titre>`. */
function tacheCitee(titre: string, connues: Set<string>): string | null {
  const m = /^[a-z]+\(([^)]+)\)\s*:/.exec(titre);
  const id = m?.[1];
  return id && connues.has(id) ? id : null;
}

/** Les revendiqueurs d'une tâche : ses labels `owner:` en vol, plus le champ `owner` consolidé. */
function revendiqueurs(t: Tache, revendications: Map<number, string[]>): string[] {
  const vus = new Set<string>();
  if (t.issue !== null) for (const o of revendications.get(t.issue) ?? []) vus.add(o);
  if (t.owner) vus.add(t.owner);
  return [...vus];
}

function controler(e: Etat): Faute[] {
  const f: Faute[] = [];

  // ── plan_state_incomplet ───────────────────────────────────────────────────
  for (const r of RUBRIQUES) {
    if (!e.planState.includes(r.ancre)) {
      f.push({
        famille: 'plan_state_incomplet',
        message: `\`${CHEMIN_PLAN_STATE}\` ne porte pas « ${r.ancre} » — REQ-GOV-006 y exige ${r.sert}.`,
      });
    }
  }
  const iReprise = e.planState.indexOf('## REPRENDRE EN 30 SECONDES');
  const iPhase = e.planState.indexOf('## Phase courante');
  if (iReprise >= 0 && iPhase >= 0 && iReprise > iPhase) {
    f.push({
      famille: 'plan_state_incomplet',
      message: 'le bloc « REPRENDRE EN 30 SECONDES » est APRÈS « Phase courante » : il doit ouvrir le fichier.',
    });
  }
  if (iReprise >= 0) {
    const bloc = e.planState.slice(iReprise, iPhase > iReprise ? iPhase : undefined);
    if (!/`[0-9a-f]{7,40}`/.test(bloc)) {
      f.push({
        famille: 'plan_state_incomplet',
        message: 'le bloc de reprise ne porte aucun SHA : REQ-GOV-006 y exige le SHA de `main`.',
      });
    }
  }

  // ── journal_entree_incomplete ──────────────────────────────────────────────
  for (const en of e.entrees) {
    for (const champ of ['Fait', 'Reste', 'Appris']) {
      if (!new RegExp(`\\*\\*${champ}\\.\\*\\*\\s*\\S`).test(en.corps)) {
        f.push({
          famille: 'journal_entree_incomplete',
          message: `${en.fichier} · PR #${en.pr} : champ « ${champ} » absent ou vide (REQ-GOV-023 en exige trois).`,
        });
      }
    }
  }

  // ── journal_doublon_pr ─────────────────────────────────────────────────────
  const parPr = new Map<number, Entree[]>();
  for (const en of e.entrees) parPr.set(en.pr, [...(parPr.get(en.pr) ?? []), en]);
  for (const [pr, liste] of parPr) {
    if (liste.length > 1) {
      f.push({
        famille: 'journal_doublon_pr',
        message: `PR #${pr} : ${liste.length} entrées (${liste.map((x) => x.fichier).join(', ')}) — laquelle fait foi ?`,
      });
    }
  }

  // ── journal_date_future ────────────────────────────────────────────────────
  if (e.maintenant !== null) {
    const jour = e.maintenant.slice(0, 10);
    for (const en of e.entrees) {
      if (en.date > jour) {
        f.push({
          famille: 'journal_date_future',
          message: `${en.fichier} · PR #${en.pr} : datée ${en.date}, postérieure à ${jour} — une entrée recopiée sans être relue.`,
        });
      }
    }
  }

  // ── plan_state_perime ──────────────────────────────────────────────────────
  if (e.prFusionnees !== null) {
    const derniere = [...e.prFusionnees].sort((a, b) =>
      a.dateCommitIso < b.dateCommitIso ? 1 : a.dateCommitIso > b.dateCommitIso ? -1 : 0
    )[0];
    if (derniere) {
      if (e.planStateDateIso === null) {
        f.push({
          famille: 'plan_state_perime',
          message: `\`${CHEMIN_PLAN_STATE}\` n'a aucun commit : l'état vivant n'a jamais été écrit.`,
        });
      } else if (Date.parse(e.planStateDateIso) < Date.parse(derniere.dateCommitIso)) {
        f.push({
          famille: 'plan_state_perime',
          message:
            `\`${CHEMIN_PLAN_STATE}\` date du ${e.planStateDateIso}, la dernière fusion (PR #${derniere.numero}) ` +
            `du ${derniere.dateCommitIso} : l'état vivant décrit un passé. Relance \`pnpm plan-state:build\` et commite-le.`,
        });
      }
    }
  }

  const connues = new Set(e.taches.map((t) => t.id));
  const parIdTache = new Map(e.taches.map((t) => [t.id, t]));

  // ── deux_pr_meme_tache ─────────────────────────────────────────────────────
  if (e.prOuvertes !== null) {
    const parTache = new Map<string, number[]>();
    for (const p of e.prOuvertes) {
      const id = tacheCitee(p.titre, connues);
      if (id) parTache.set(id, [...(parTache.get(id) ?? []), p.numero]);
    }
    for (const [id, numeros] of parTache) {
      if (numeros.length > 1) {
        f.push({
          famille: 'deux_pr_meme_tache',
          message: `${id} est cité par ${numeros.length} PR ouvertes (${numeros.map((n) => '#' + n).join(', ')}) — deux agents sur la même tâche.`,
        });
      }
    }
  }

  // ── pr_sur_tache_non_revendiquee ───────────────────────────────────────────
  if (e.prOuvertes !== null && e.revendications !== null) {
    for (const p of e.prOuvertes) {
      const id = tacheCitee(p.titre, connues);
      if (!id) continue; // titre hors convention : c'est `gov:pr` qui le refuse, pas cette garde
      const t = parIdTache.get(id)!;
      if (revendiqueurs(t, e.revendications).length === 0) {
        f.push({
          famille: 'pr_sur_tache_non_revendiquee',
          message:
            `PR #${p.numero} porte ${id}, que personne n'a revendiquée : ni label \`owner:\` sur son issue` +
            `${t.issue === null ? ' (elle n’a pas d’issue)' : ' #' + t.issue}, ni \`owner\` dans \`${CHEMIN_TACHES}\`.`,
        });
      }
    }
  }

  // ── revendication_multiple ─────────────────────────────────────────────────
  if (e.revendications !== null) {
    for (const t of e.taches) {
      if (LIVREES.has(t.statut)) continue; // une tâche livrée : sa revendication est de l'histoire
      const r = revendiqueurs(t, e.revendications);
      if (r.length > 1) {
        f.push({
          famille: 'revendication_multiple',
          message: `${t.id} porte ${r.length} revendiqueurs (${r.join(', ')}) — REQ-GOV-007 en autorise un au plus.`,
        });
      }
    }
  }

  // ── pr_fusionnee_sans_journal ──────────────────────────────────────────────
  if (e.prFusionnees !== null) {
    const journalisees = new Set(e.entrees.map((x) => x.pr));
    for (const p of e.prFusionnees) {
      if (p.numero <= e.plancherPr) continue; // sous le plancher : le journal n'existait pas
      if (!journalisees.has(p.numero)) {
        f.push({
          famille: 'pr_fusionnee_sans_journal',
          message: `PR #${p.numero} « ${p.titre} » est fusionnée et aucune entrée de \`${CHEMIN_JOURNAL}/\` ne la cite (REQ-GOV-023).`,
        });
      }
    }
  }

  return f;
}

/** Le jour ISO situé `n` jours après un instant. Sert aux témoins qui doivent être dans le futur
 * de la base sans jamais dépendre d'une date tapée à la main. */
function joursApres(instantIso: string, n: number): string {
  const d = new Date(instantIso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── mode --prove ─────────────────────────────────────────────────────────────

/**
 * La preuve part des VRAIS fichiers locaux (PLAN-STATE, journal) — si le générateur cesse de rendre
 * une rubrique, le contre-témoin « la base » rougit ici. Le côté GitHub, lui, est synthétique : le
 * faire dépendre de l'état réel des PR rendrait la preuve verte ou rouge au gré de la journée, ce
 * qui est exactement le défaut que `--now` corrige ailleurs.
 *
 * ⚠️ L'INSTANT DE LA BASE SE DÉRIVE, IL NE SE TAPE PAS (GOV-032). Il a porté le littéral
 * `'2026-09-04T09:00:00Z'` pendant que `entrees` venait, lui, du journal RÉEL. Les deux moitiés
 * étaient défendables séparément et fausses ensemble : le journal avance, le littéral non. La
 * première entrée écrite après cette date rend la base fautive, et `--prove` REFUSE alors de
 * commencer — « la preuve part d'un état DÉJÀ fautif ». C'est arrivé le 2026-09-05, sur l'entrée
 * de PR #31, le lendemain. Une preuve qui s'éteint toute seule au bout d'un jour ne prouve rien
 * le second jour, et rien ne le dit : elle sort 1, comme une garde qui aurait trouvé un défaut.
 *
 * La règle est celle de `--now` : un instant se fige par rapport à CE QU'IL JUGE. Ici il juge le
 * journal réel, donc il vaut le jour réel. Cela n'introduit aucune lecture d'horloge dans la
 * GARDE — `controler()` reste pure et reçoit `maintenant` — seulement dans le banc d'essai, qui
 * doit bien dire contre quel présent il confronte un fichier vivant.
 */
if (process.argv.includes('--prove')) {
  const planState = readFileSync(CHEMIN_PLAN_STATE, 'utf8');
  const entrees = lireJournal();
  const plancherPr = lirePlancher();

  const TACHES: Tache[] = [
    { id: 'GOV-000', titre: 'tâche livrée', statut: 'fusionnee', owner: 'A01', issue: 900 },
    { id: 'QA-T00', titre: 'tâche en vol', statut: 'a_faire', owner: null, issue: 901 },
    { id: 'DM-01', titre: 'autre tâche en vol', statut: 'a_faire', owner: null, issue: 902 },
  ];
  const DATE_FUSION = '2026-09-03T23:11:58+02:00';

  const BASE: Etat = {
    planState,
    planStateDateIso: DATE_FUSION,
    entrees,
    plancherPr,
    taches: TACHES,
    prOuvertes: [{ numero: 28, titre: 'feat(QA-T00): la PR en vol' }],
    prFusionnees: [{ numero: plancherPr, titre: 'la dernière fusion', dateCommitIso: DATE_FUSION }],
    revendications: new Map([
      [900, ['A01']],
      [901, ['A01']],
      [902, ['A05']],
    ]),
    maintenant: `${new Date().toISOString().slice(0, 10)}T12:00:00Z`,
  };

  const copie = (m: Partial<Etat>): Etat => ({ ...BASE, ...m });

  const base = controler(BASE);
  if (base.length > 0) {
    console.error(`❌ La preuve part d'un état DÉJÀ fautif (${base.length}) — corrige d'abord :`);
    base.slice(0, 8).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
    process.exit(1);
  }

  const sansChamp = (en: Entree, champ: string): Entree => ({
    ...en,
    corps: en.corps.split(`**${champ}.**`).join(`**${champ}-mute.**`),
  });
  const premiere = entrees[0];
  if (!premiere) {
    console.error('❌ gov:etat --prove — le journal est vide : deux témoins ne peuvent pas en être dérivés (RM-03).');
    process.exit(1);
  }

  const TEMOINS: { famille: string; quoi: string; etat: () => Etat }[] = [
    {
      famille: 'plan_state_incomplet',
      quoi: 'PLAN-STATE sans son bloc de reprise',
      etat: () => copie({ planState: planState.split('## REPRENDRE EN 30 SECONDES').join('## Autre chose') }),
    },
    {
      famille: 'journal_entree_incomplete',
      quoi: 'une entrée de journal sans « Appris »',
      etat: () => copie({ entrees: [sansChamp(premiere, 'Appris')] }),
    },
    {
      famille: 'journal_doublon_pr',
      quoi: 'deux entrées pour la même PR',
      etat: () => copie({ entrees: [premiere, { ...premiere, fichier: 'ailleurs.md' }] }),
    },
    {
      famille: 'journal_date_future',
      quoi: 'une entrée datée après l’instant donné',
      // La date du témoin se DÉRIVE de l'instant de la base, au lieu du littéral `2026-12-31`
      // qu'elle portait : un témoin dont la date est écrite en dur cesse d'exercer sa famille le
      // jour où le présent le rattrape, et il le fait en silence — il devient un contre-témoin.
      etat: () => copie({ entrees: [{ ...premiere, date: joursApres(BASE.maintenant!, 1) }] }),
    },
    {
      famille: 'plan_state_perime',
      quoi: 'PLAN-STATE commité AVANT la dernière fusion',
      etat: () => copie({ planStateDateIso: '2026-09-03T20:00:00+02:00' }),
    },
    {
      famille: 'deux_pr_meme_tache',
      quoi: 'deux PR ouvertes citant QA-T00',
      etat: () =>
        copie({
          prOuvertes: [
            { numero: 28, titre: 'feat(QA-T00): la PR en vol' },
            { numero: 29, titre: 'fix(QA-T00): la même tâche, un autre agent' },
          ],
        }),
    },
    {
      famille: 'pr_sur_tache_non_revendiquee',
      quoi: 'une PR ouverte sur une tâche sans label `owner:` ni `owner` consolidé',
      etat: () => copie({ revendications: new Map([[900, ['A01']]]) }),
    },
    {
      famille: 'revendication_multiple',
      quoi: 'deux `owner:` distincts sur la même issue',
      etat: () => copie({ revendications: new Map([[901, ['A01', 'A05']]]) }),
    },
    {
      famille: 'pr_fusionnee_sans_journal',
      quoi: 'une PR fusionnée au-dessus du plancher, qu’aucune entrée ne cite',
      etat: () =>
        copie({
          prFusionnees: [{ numero: plancherPr + 72, titre: 'fusionnée sans journal', dateCommitIso: DATE_FUSION }],
        }),
    },
  ];

  const CONTRE_TEMOINS: { quoi: string; etat: () => Etat }[] = [
    { quoi: 'l’état de base, tel que le dépôt le porte', etat: () => BASE },
    {
      // LE contre-témoin du plancher : sans lui, la famille exigerait une entrée pour les sept PR
      // fusionnées avant que le journal n'existe, et rétro-journaliser aurait fabriqué de la mémoire.
      quoi: 'une PR fusionnée SOUS le plancher, sans entrée de journal',
      etat: () => copie({ prFusionnees: [{ numero: plancherPr, titre: 'avant le journal', dateCommitIso: DATE_FUSION }] }),
    },
    {
      quoi: 'une PR fusionnée AU-DESSUS du plancher, avec son entrée',
      etat: () =>
        copie({
          prFusionnees: [{ numero: premiere.pr, titre: premiere.titre, dateCommitIso: DATE_FUSION }],
          plancherPr: premiere.pr - 1,
        }),
    },
    {
      // Sans lui, une garde qui refuserait DEUX PR ouvertes quelles qu'elles soient serait « prouvée »
      // par son seul témoin. Ce qui est interdit, c'est la même TÂCHE, pas le parallélisme.
      quoi: 'deux PR ouvertes sur deux tâches différentes, chacune revendiquée',
      etat: () =>
        copie({
          prOuvertes: [
            { numero: 28, titre: 'feat(QA-T00): la PR en vol' },
            { numero: 29, titre: 'feat(DM-01): une autre tâche' },
          ],
        }),
    },
    {
      // Le cas RÉEL du dépôt au 2026-09-03 : `lot:cloture` n'efface pas les labels, sept issues de
      // tâches `fusionnee` portent encore `owner:`. C'est un défaut, il est nommé dans PLAN-STATE,
      // et il ne doit pas rendre cette garde rouge en permanence.
      quoi: 'une tâche LIVRÉE dont l’issue porte encore une revendication d’un autre agent',
      // Ne fait varier QUE la revendication de la tâche livrée (issue 900) : les deux autres restent
      // telles quelles. Muter la carte entière retirait aussi la revendication de la tâche en vol,
      // et le contre-témoin rougissait pour une raison qui n'était pas la sienne (RM-11).
      etat: () => copie({ revendications: new Map([...BASE.revendications!, [900, ['A05', 'A09']]]) }),
    },
    {
      quoi: 'PLAN-STATE régénéré APRÈS la dernière fusion',
      etat: () => copie({ planStateDateIso: '2026-09-04T08:00:00+02:00' }),
    },
    {
      // Sans `--now`, la famille d'instant n'est pas évaluée — et la sortie le DIT. Ce contre-témoin
      // fige que « non évaluée » n'est pas « verte par hasard » : c'est un choix, écrit et annoncé.
      quoi: 'une entrée datée dans le futur, mais sans instant donné',
      etat: () => copie({ entrees: [{ ...premiere, date: '2026-12-31' }], maintenant: null }),
    },
    {
      quoi: 'une PR ouverte dont le titre ne suit pas la convention (c’est `gov:pr` qui la refuse)',
      etat: () => copie({ prOuvertes: [{ numero: 28, titre: 'un titre sans identifiant de tâche' }] }),
    },
  ];

  for (const c of CONTRE_TEMOINS) {
    const fautes = controler(c.etat());
    if (fautes.length > 0) {
      console.error(`❌ Faux positif : « ${c.quoi} » a rougi. La garde est trop large.`);
      fautes.slice(0, 5).forEach((x) => console.error(`   [${x.famille}] ${x.message}`));
      process.exit(1);
    }
  }

  const prouvees = new Set<string>();
  for (const t of TEMOINS) {
    const fautes = controler(t.etat());
    if (!fautes.some((x) => x.famille === t.famille)) {
      console.error(
        `❌ Le témoin de « ${t.famille} » (${t.quoi}) n'a PAS fait rougir sa famille ` +
          `(${fautes.length} faute(s) d'autres familles). Le contrôle ne couvre pas ce qu'il prétend couvrir.`
      );
      process.exit(1);
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((x) => !prouvees.has(x));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) de contrôle sans témoin : ${sansTemoin.join(', ')}.`);
    process.exit(1);
  }

  console.log(`✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`);
  console.log(`   ${FAMILLES.map((x) => '• ' + x).join('\n   ')}`);
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  process.exit(0);
}

// ── mode normal ──────────────────────────────────────────────────────────────

const horsLigne = process.argv.includes('--hors-ligne');
const iNow = process.argv.indexOf('--now');
let maintenant: string | null = null;
if (iNow >= 0) {
  const brut = process.argv[iNow + 1];
  if (!brut || Number.isNaN(Date.parse(brut))) {
    console.error('❌ gov:etat — `--now` attend un instant ISO 8601 (ex. `2026-09-04T09:00:00Z`).');
    process.exit(1);
  }
  maintenant = new Date(brut).toISOString();
}

const etat: Etat = {
  planState: readFileSync(CHEMIN_PLAN_STATE, 'utf8'),
  planStateDateIso: git(['log', '-1', '--format=%cI', '--', CHEMIN_PLAN_STATE]),
  entrees: lireJournal(),
  plancherPr: lirePlancher(),
  taches: lireTaches(),
  prOuvertes: null,
  prFusionnees: null,
  revendications: null,
  maintenant,
};

if (!horsLigne) {
  const lu = lireGithub();
  etat.prOuvertes = lu.prOuvertes;
  etat.prFusionnees = lu.prFusionnees;
  etat.revendications = lu.revendications;
}

const evaluees = [
  ...FAMILLES_LOCALES,
  ...(maintenant !== null ? FAMILLES_INSTANT : []),
  ...(horsLigne ? [] : FAMILLES_GITHUB),
];

if (horsLigne) {
  console.log(`⚠️ HORS PÉRIMÈTRE — ${FAMILLES_GITHUB.length} familles NON ÉVALUÉES, faute de lecture GitHub (\`--hors-ligne\`) :`);
  console.log(`   ${FAMILLES_GITHUB.map((x) => '• ' + x).join('\n   ')}`);
}
if (maintenant === null) {
  console.log(`⚠️ NON ÉVALUÉE — ${FAMILLES_INSTANT.length} famille a besoin d'un instant, et \`--now <ISO>\` n'a pas été donné :`);
  console.log(`   ${FAMILLES_INSTANT.map((x) => '• ' + x).join('\n   ')}`);
}

const fautes = controler(etat);
if (fautes.length === 0) {
  console.log(`✅ gov:etat — ${evaluees.length} familles évaluées sur ${FAMILLES.length}.`);
  console.log(
    `   Lu : \`${CHEMIN_PLAN_STATE}\` (dernier commit ${etat.planStateDateIso ?? 'jamais commité'}) · ` +
      `\`${CHEMIN_JOURNAL}/\` (${etat.entrees.length} entrée(s), plancher PR > ${etat.plancherPr}) · ` +
      (horsLigne
        ? 'GitHub NON LU'
        : `GitHub (${etat.prOuvertes?.length ?? 0} PR ouverte(s), ${etat.prFusionnees?.length ?? 0} fusionnée(s), ` +
          `${etat.revendications?.size ?? 0} issue(s) revendiquée(s))`)
  );
  process.exit(0);
}

const parFamille = new Map<string, Faute[]>();
for (const x of fautes) parFamille.set(x.famille, [...(parFamille.get(x.famille) ?? []), x]);
console.error(`❌ gov:etat — ${fautes.length} défaut(s) sur ${evaluees.length} familles évaluées :\n`);
for (const [famille, liste] of parFamille) {
  console.error(`   ── ${famille} (${liste.length})`);
  liste.slice(0, 12).forEach((x) => console.error(`      ${x.message}`));
  if (liste.length > 12) console.error(`      … et ${liste.length - 12} autre(s).`);
}
process.exit(1);
