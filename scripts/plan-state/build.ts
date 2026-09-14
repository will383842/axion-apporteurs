/**
 * build.ts — régénère docs/PLAN-STATE.md. Le fichier est DÉRIVÉ, jamais écrit à la main.
 *
 * USAGE   : pnpm plan-state:build            rend la vue et l'ÉCRIT
 *           pnpm plan-state:verifier         n'écrit rien ; sort 1 si la vue sur le disque a dérivé
 *           …--out <chemin>                  travaille sur une autre vue (bancs d'essai des tests)
 * ENTRÉES : docs/tasks.json · docs/DECISIONS.md · docs/journal/ · docs/adr/ · `gh pr list` ·
 *           `gh issue list` · git
 *
 *   — le STATUT d'une tâche vient de `docs/tasks.json`, écrit par `pnpm lot:cloture` à la fin de
 *     chaque lot. Les labels d'issue n'en sont qu'une vue, et ce script ne les lit pas pour ça ;
 *   — la REVENDICATION, elle, se lit AUSSI dans les labels `owner:<Axx>` de l'issue (GOV-008,
 *     REQ-GOV-007). Ce n'est pas une contradiction avec la ligne précédente : l'orchestrateur
 *     revendique au §3 de `.claude/skills/lot/SKILL.md` (`gh issue edit <n> --add-label en_cours
 *     --add-label owner:<Axx>`) AVANT que `lot:cloture` n'écrive quoi que ce soit. Entre les deux —
 *     c'est-à-dire pendant tout le travail — le label est le SEUL endroit où la revendication
 *     existe. La chercher ailleurs, ce serait afficher « personne » sur une tâche que quelqu'un tient ;
 *   — le JOURNAL fait / reste / appris vient de `docs/journal/` : c'est le seul contenu de l'état
 *     vivant que personne ne peut dériver, et il a donc sa propre source (REQ-GOV-023).
 *
 * SORTIE  : docs/PLAN-STATE.md (écrasé)
 *
 * POURQUOI : trois textes du plan donnaient trois écrivains différents à ce fichier. Un état partagé
 * entre 40 agents ne peut avoir qu'une source ; ici la source est GitHub, et ce script en est la vue.
 * L'égalité de la vue commitée et de ses sources est tenue par `--verifier` ci-dessous, et par les
 * témoins qui le voient rougir : `tests/unit/gouvernance/vues-derivees.spec.ts` (GOV-035, REQ-GOV-032).
 *
 * INVARIANT : ce script ne DÉCIDE rien. S'il faut changer un statut, on change l'issue, pas le fichier.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { referencePr, type Attestation } from '../lot/attestation';
import { LIVREE, PLANCHER } from '../lot/avancement';

const PLAFOND_QUESTIONS = 10;

/**
 * Les deux arguments. `--verifier` ne fait que LIRE ; `--out` déplace la vue, et n'existe que pour
 * que les témoins travaillent en bac à sable : un test qui périmerait `docs/PLAN-STATE.md` pour de
 * vrai emporterait le travail non commité de la session qui l'exécute.
 */
const MODE_VERIFIER = process.argv.includes('--verifier');
const argument = (nom: string): string | null => {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
};
const CHEMIN_VUE = argument('--out') ?? 'docs/PLAN-STATE.md';
/**
 * `--forge <fichier.json>` remplace les TROIS lectures hors du dépôt (`gh pr list`, `gh issue list`,
 * `origin/main`) par un état figé. Il n'existe que pour le témoin qui rend la vue sous deux forges
 * différentes : c'est lui qui prouve qu'une exemption dépend VRAIMENT de la forge, et qu'un élément
 * comparé n'en dépend pas. La Gate A ne le passe jamais.
 */
const CHEMIN_FORGE = argument('--forge');

interface Tache {
  id: string; titre: string; phase: number; repo: string; statut: string;
  deps: string[]; reqs: string[]; hyp: string[]; externe: string | null;
  estimateDays: number; owner?: string | null; branch?: string | null; pr?: number | null;
  attempts?: number; motif?: string | null; attestation?: Attestation | null;
}

const sh = (cmd: string, args: string[]) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); } catch { return ''; }
};

const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { taches: Tache[] };
const taches = doc.taches;
// La frontière §1 / §2 du registre fait foi : le §4 prescrit de DÉPLACER une ligne de la §2 vers la §1
// quand une décision cesse d'avoir un défaut. Ratisser tout le fichier rendait ce déplacement invisible
// et faisait écrire « Aucune question ouverte » sur une décision redevenue bloquante.
const decisions = readFileSync('docs/DECISIONS.md', 'utf8');
const section = (n: number) =>
  decisions.split(new RegExp(`^## ${n}\\.`, 'm'))[1]?.split(new RegExp(`^## ${n + 1}\\.`, 'm'))[0] ?? '';
const ids = (texte: string) => new Set(texte.match(/\b(HYP|DEC)-[A-Z0-9-]+\b/g) || []);
/** §2 = décisions avec une hypothèse par défaut posée. §1 = décisions SANS défaut, bloquantes. */
const posees = ids(section(2));
const bloquantes = ids(section(1));

// Phase courante = la plus petite phase qui porte encore une tâche non terminée.
// Le vocabulaire « livrée » vient de `scripts/lot/avancement.ts`, qui le dérive du barème et le
// confronte à `tasks.schema.json` : il ne se retape pas ici (RM-01, RM-04).
const phases = [...new Set(taches.map((t) => t.phase))].sort((a, b) => a - b);
const phaseCourante = phases.find((p) => taches.some((t) => t.phase === p && !LIVREE.has(t.statut))) ?? phases.at(-1)!;

const par = (s: string) => taches.filter((t) => t.statut === s);
const enCours = par('en_cours');
const bloquees = par('bloquee');
const attente = par('attente_externe');

// Questions ouvertes = décisions SANS hypothèse posée, citées par une tâche de la phase courante.
const questions = [
  ...new Set(
    taches
      .filter((t) => t.phase === phaseCourante && !LIVREE.has(t.statut))
      .flatMap((t) => [
        ...t.hyp.filter((h) => !posees.has(h)).map((h) => (bloquantes.has(h) ? `${h} — **bloquante (§1 du registre)**` : h)),
        ...(t.externe ? [`externe:${t.externe}`] : []),
      ])
  ),
];

interface PrOuverte { number: number; headRefName: string; mergeStateStatus: string; isDraft: boolean; title: string }

/**
 * LA PROVENANCE EST ÉMISE PAR LE GÉNÉRATEUR — IL N'Y A PAS DE LISTE D'EXEMPTIONS.
 *
 * Une exemption déclarée à côté de ce qu'elle exempte se déclare aussi pour ce qui n'en a pas besoin.
 * Le générateur, lui, SAIT ce qu'il a lu hors du dépôt au moment où il écrit. Les trois sources
 * vivantes ne se lisent donc qu'à travers `forge`, et chaque lecture est NOTÉE contre la rubrique —
 * ou la ligne du bloc de reprise — en cours d'écriture. Est exempté ce qui a lu la forge, et le motif
 * imprimé EST la source lue : il ne peut être ni vide ni inventé. Une lecture hors de toute rubrique
 * LÈVE : sa provenance ne s'attribuerait à rien.
 *
 * ⚠️ Ce que ça ne ferme pas seul :
 *   — une lecture GRATUITE de la forge, dont le texte ne change pas d'une forge à l'autre, exempterait
 *     sa zone. Le témoin « exemption portante » la voit rougir : il rend la vue sous deux forges et
 *     exige que tout élément exempté CHANGE de l'une à l'autre ;
 *   — une modification du générateur qui AFFICHE réellement une valeur de la forge dans une rubrique
 *     l'exempte : c'est la définition même de l'exemption. Elle se voit au diff et au rendu ; elle ne
 *     se voit pas ici, y compris quand la valeur affichée est rendue peu visible.
 *
 * `git log` sur `docs/adr/` (« Décisions du jour ») ne passe pas par `forge` : il lit l'historique de
 * HEAD, comme les fichiers suivis, pas l'état de GitHub ni `origin/main`. Cette rubrique est exemptée
 * parce qu'elle lit AUSSI `forge.dateMain()`, pas à cause de cet historique.
 */
const SOURCE_PR = '`gh pr list`';
const SOURCE_ISSUES = '`gh issue list`, labels `owner:`';
const SOURCE_MAIN = '`git` sur `origin/main`';

const sourcesDesRubriques = new Map<string, Set<string>>();
const sourcesDesLignes = new Map<string, Set<string>>();
let rubriqueCourante: string | null = null;
let ligneCourante: Set<string> | null = null;

function lire<T>(source: string, valeur: T): T {
  const cible = ligneCourante ?? (rubriqueCourante === null ? undefined : sourcesDesRubriques.get(rubriqueCourante));
  if (cible === undefined) {
    throw new Error(`plan-state : ${source} est lue hors de toute rubrique — sa provenance ne s'attribue à rien. Lis-la DANS la rubrique ou la ligne qui l'affiche.`);
  }
  cible.add(source);
  return valeur;
}

/**
 * L'ORDRE de la file de fusion, dérivé de l'état de fusionnabilité que rend GitHub.
 *
 * `partners/ADR-0006` §5 : « l'ordre est explicite et lisible dans l'état vivant du plan ». Il ne
 * suffit donc pas de LISTER les PR ouvertes — c'est ce que ce fichier faisait, et deux sessions qui
 * le lisaient en tiraient deux ordres différents.
 *
 * La règle : la plus prête d'abord. Motif écrit au §1 du même ADR — « le créneau se réserve AVANT de
 * remettre la branche à jour ». Une PR en retard sur `main` ne se met à jour qu'au moment où elle
 * prend le créneau ; la mettre à jour plus tôt, c'est courir après un état qui a déjà changé, et
 * chaque fusion remet de toute façon toutes les autres en retard. Les faire passer avant une PR
 * déjà fusionnable ferait donc du travail deux fois.
 */
const RANGS: { etat: string; rang: number; bloque: string }[] = [
  { etat: 'CLEAN', rang: 1, bloque: 'rien — fusionnable maintenant' },
  { etat: 'HAS_HOOKS', rang: 1, bloque: 'rien — fusionnable maintenant (crochets côté forge)' },
  { etat: 'UNSTABLE', rang: 2, bloque: 'des contrôles encore en cours' },
  { etat: 'BEHIND', rang: 3, bloque: 'en retard sur `main` — `gh pr update-branch` AU MOMENT de prendre le créneau, pas avant' },
  { etat: 'BLOCKED', rang: 4, bloque: 'un contrôle requis rouge ou une revue manquante' },
  { etat: 'DIRTY', rang: 5, bloque: 'un conflit avec `main` — à résoudre avant tout' },
];
const rangDe = (p: PrOuverte): { rang: number; bloque: string } => {
  if (p.isDraft) return { rang: 9, bloque: 'brouillon — hors file tant qu’il n’est pas prêt' };
  const r = RANGS.find((x) => x.etat === p.mergeStateStatus);
  return r ? { rang: r.rang, bloque: r.bloque } : { rang: 6, bloque: `état \`${p.mergeStateStatus}\` — à qualifier à la main` };
};
/**
 * LES TROIS LECTURES HORS DU DÉPÔT, et le seul chemin pour les atteindre. Les valeurs brutes ne
 * sortent pas de cette fermeture : les lire sans passer par `lire` est impossible, pas seulement
 * déconseillé.
 */
const forge = (() => {
  const figee = CHEMIN_FORGE === null
    ? null
    : (JSON.parse(readFileSync(CHEMIN_FORGE, 'utf8')) as { prs: PrOuverte[]; issues: string; main: { sha: string; date: string } });
  const prs: PrOuverte[] = figee ? figee.prs : (() => {
    const brut = sh('gh', ['pr', 'list', '--json', 'number,headRefName,mergeStateStatus,isDraft,title', '--limit', '50']);
    try { return JSON.parse(brut || '[]') as PrOuverte[]; } catch { return []; }
  })();
  const file = [...prs]
    .map((p) => ({ ...p, ...rangDe(p) }))
    .sort((a, b) => (a.rang !== b.rang ? a.rang - b.rang : a.number - b.number));

  /**
   * Les REVENDICATIONS en vol : les labels `owner:<Axx>` des issues ouvertes.
   * `sh` rend la chaîne vide quand la commande échoue — et `gh issue list --json` rend `[]`, jamais
   * du vide, quand elle réussit sans résultat. La chaîne vide distingue donc « pas lu » de « aucune
   * revendication », et la vue DIT lequel des deux : afficher « personne » sur une lecture qui a
   * échoué serait le pire des deux mensonges.
   */
  const brutIssues = figee ? figee.issues : sh('gh', ['issue', 'list', '--state', 'open', '--json', 'number,labels', '--limit', '200']);
  const githubLu = brutIssues !== '';
  const revendications = new Map<number, string[]>();
  if (githubLu) {
    try {
      for (const i of JSON.parse(brutIssues) as { number: number; labels: { name: string }[] }[]) {
        const owners = (i.labels ?? []).map((l) => l.name).filter((n) => n.startsWith('owner:')).map((n) => n.slice(6));
        if (owners.length > 0) revendications.set(i.number, owners);
      }
    } catch { /* réponse illisible : traitée comme une lecture vide, et dite comme telle plus bas */ }
  }

  const shaMain = figee ? figee.main.sha : sh('git', ['rev-parse', '--short', 'origin/main']);
  const dateMain = figee ? figee.main.date : sh('git', ['log', '-1', '--format=%cI', 'origin/main']);

  return {
    file: () => lire(SOURCE_PR, file),
    githubLu: () => lire(SOURCE_ISSUES, githubLu),
    revendications: () => lire(SOURCE_ISSUES, revendications),
    shaMain: () => lire(SOURCE_MAIN, shaMain),
    dateMain: () => lire(SOURCE_MAIN, dateMain),
  };
})();

const revendiqueursDe = (t: Tache): string[] => {
  const vus = new Set<string>();
  const issue = (t as unknown as { issue?: number | null }).issue ?? null;
  if (issue !== null) for (const o of forge.revendications().get(issue) ?? []) vus.add(o);
  if (t.owner) vus.add(t.owner);
  return [...vus];
};

/** Le JOURNAL, dérivé du système de fichiers comme l'index des ADR (`pnpm adr:index`). */
const CHEMIN_JOURNAL = 'docs/journal';
interface Entree { pr: number; date: string; titre: string; corps: string }
const entrees: Entree[] = [];
if (existsSync(CHEMIN_JOURNAL)) {
  for (const nom of readdirSync(CHEMIN_JOURNAL).filter((n) => n.endsWith('.md')).sort()) {
    for (const bloc of readFileSync(join(CHEMIN_JOURNAL, nom), 'utf8').split(/^## /m).slice(1)) {
      const m = /^PR #(\d+) — (\d{4}-\d{2}-\d{2}) — (.*)$/m.exec(bloc);
      if (m && m[1] && m[2]) entrees.push({ pr: Number(m[1]), date: m[2], titre: (m[3] ?? '').trim(), corps: bloc.trim() });
    }
  }
}
entrees.sort((a, b) => b.pr - a.pr);

const lignes: string[] = [];
/** Où commence chaque rubrique dans `lignes` : la neutralisation des zones exemptées en a besoin. */
const debutsDesRubriques: [string, number][] = [];

/** Ouvre une rubrique : les lectures de la forge qui suivent lui sont attribuées, jusqu'à la suivante. */
function titre(t: string): void {
  rubriqueCourante = t;
  if (!sourcesDesRubriques.has(t)) sourcesDesRubriques.set(t, new Set());
  debutsDesRubriques.push([t, lignes.length]);
  lignes.push(`## ${t}`);
}

/**
 * CE QUI EST ÉCRIT DANS UNE ZONE QUI A LU LA FORGE TIENT SUR UNE LIGNE ET NE PORTE AUCUN `<`.
 *
 * Toute valeur de la forge est lue par `lire`, donc DANS la rubrique ou la ligne du bloc qui
 * l'affiche, et tout ce que cette zone écrit passe ici. Deux choses en sortent :
 *   — un retour chariot ou un saut de ligne devient une espace. Une valeur de la forge (un titre de
 *     PR garde ses sauts de ligne, et n'importe qui ouvre une PR sur un dépôt public) ouvrirait
 *     sinon une ligne à elle, puis une rubrique qu'aucun `titre()` n'a déclarée : sans provenance,
 *     donc ni exemptée ni contenue, et comparée à elle-même ;
 *   — `<` devient `&lt;`, qui s'affiche `<` en texte courant (et `&lt;` littéral dans du code en
 *     ligne). Le vérificateur refuse tout `<` dans une zone exemptée (`horsDeSaZone`) : sans cette
 *     neutralisation, la forge fabriquerait un rouge sur une vue juste.
 * Un titre de tâche écrit dans la même zone suit la même règle.
 */
const neutraliser = (l: string): string => l.replaceAll('<', '&lt;').replace(/[\r\n]/g, ' ');

/** Écrit UNE ligne du bloc de reprise : ses lectures de la forge sont attribuées à elle seule. */
function ligneDeReprise(ecrire: () => string): string {
  ligneCourante = new Set();
  const brute = ecrire();
  const l = ligneCourante.size > 0 ? neutraliser(brute) : brute;
  sourcesDesLignes.set(l, ligneCourante);
  ligneCourante = null;
  return l;
}

lignes.push('# PLAN-STATE — état vivant d\'Axion Partners');
lignes.push('');
lignes.push('> ⚠️ **Fichier DÉRIVÉ.** Régénéré par `pnpm plan-state:build` depuis `docs/tasks.json`, les issues et les');
lignes.push('> PR GitHub, et git. Ne jamais l\'éditer à la main (`.claude/settings.json` l\'interdit) : modifier l\'issue.');
lignes.push('');
// Le bloc « REPRENDRE EN 30 SECONDES » (REQ-GOV-006) s'insère ICI, en tête. Il est composé à la fin
// du script parce qu'il résume des sections qui ne sont pas encore calculées — mais il se LIT en
// premier, et c'est tout son intérêt : un agent qui ouvre le dépôt demain sans mémoire ne doit pas
// avoir à descendre chercher le SHA, la file et le prochain pas dans trois rubriques différentes.
const iBlocReprise = lignes.length;
titre(`Phase courante : ${phaseCourante}`);
lignes.push('');
const restant = taches.filter((t) => t.phase === phaseCourante && !LIVREE.has(t.statut));
const faitPhase = taches.filter((t) => t.phase === phaseCourante && LIVREE.has(t.statut));
lignes.push(`${faitPhase.length}/${faitPhase.length + restant.length} tâches terminées · reste ${restant.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j estimés.`);
lignes.push('');

titre('Tâches');
lignes.push('');
/**
 * LES STATUTS DU TABLEAU « Tâches », lus par le générateur ET par les mesures du domaine.
 *
 * Ils se DÉRIVENT du barème : `scripts/lot/avancement.ts` porte le vocabulaire arbitré (`PLANCHER`),
 * et `verifierExhaustivite()` le confronte à l'enum de `scripts/lot/tasks.schema.json` dans quatre
 * gates. Un statut neuf du barème entre dans la vue et dans les mesures ; un statut ajouté à l'enum
 * SANS barème fait rougir ces quatre gates. L'ordre est celui de `PLANCHER`, du plancher le plus
 * faible au plus fort.
 */
const STATUTS_DU_TABLEAU: readonly string[] = Object.keys(PLANCHER);

lignes.push('| Statut | Nombre | Détail |');
lignes.push('| --- | --- | --- |');
for (const s of STATUTS_DU_TABLEAU) {
  const l = par(s);
  const detail = ['en_cours', 'en_revue', 'bloquee', 'attente_externe'].includes(s)
    ? l.map((t) => {
        // LA RÉFÉRENCE EST QUALIFIÉE PAR DÉPÔT (GOV-038). Cette ligne rendait `PR#<n>` sans dire de
        // quel dépôt : quatorze tâches de ce backlog vivent ailleurs, et la vue publique aurait
        // porté « INT-T01b (A01) PR#998 » pour une PR que la forge de CE dépôt ne connaît pas —
        // 404. La composition vit désormais dans `scripts/lot/attestation.ts`, avec la garde qui
        // la juge : une vue et une garde qui parlent d'un même objet lisent la même définition
        // (RM-01, RM-12).
        const ref = referencePr(t);
        return `${t.id}${t.owner ? ` (${t.owner})` : ''}${ref ? ` ${ref}` : ''}${t.motif ? ` — ${t.motif}` : ''}`;
      }).join(' · ')
    : l.length > 12 ? `${l.slice(0, 12).map((t) => t.id).join(', ')} …` : l.map((t) => t.id).join(', ');
  lignes.push(`| \`${s}\` | ${l.length} | ${detail || '—'} |`);
}
lignes.push('');

// ── Chemin critique ─────────────────────────────────────────────────────────
// Le plus long enchainement de taches liees par une dependance, pondere par les jours estimes.
// C'est lui qui donne la duree PLANCHER du projet : elargir la flotte d'agents ne le raccourcit
// pas d'une heure. Une estimation totale de 149 j ne dit rien de la date de fin ; ce chemin, si.
// Il sort du bloc parce que « Prochain pas » en depend : le prochain pas utile est celui qui est
// SUR ce chemin, pas le premier de la liste.
let cheminCritique: string[] = [];
{
  const parId = new Map(taches.map((t) => [t.id, t]));
  const memo = new Map<string, { poids: number; suite: string[] }>();
  const plusLong = (id: string, vus: Set<string>): { poids: number; suite: string[] } => {
    const cache = memo.get(id);
    if (cache) return cache;
    const t = parId.get(id);
    if (!t) return { poids: 0, suite: [] };
    if (vus.has(id)) return { poids: 0, suite: [] }; // garde-fou : gov:tasks garantit l'acyclicite
    vus.add(id);
    let meilleur = { poids: 0, suite: [] as string[] };
    for (const d of t.deps) {
      const r = plusLong(d, vus);
      if (r.poids > meilleur.poids) meilleur = r;
    }
    vus.delete(id);
    const res = { poids: meilleur.poids + t.estimateDays, suite: [...meilleur.suite, id] };
    memo.set(id, res);
    return res;
  };

  let sommet = { poids: 0, suite: [] as string[] };
  for (const t of taches) {
    const r = plusLong(t.id, new Set());
    if (r.poids > sommet.poids) sommet = r;
  }

  cheminCritique = sommet.suite;

  titre('Chemin critique');
  lignes.push('');
  lignes.push(
    `**${sommet.poids.toFixed(2)} j** sur ${sommet.suite.length} taches enchainees — duree PLANCHER du projet. ` +
      `Aucune flotte d'agents ne la raccourcit : ces taches ne peuvent pas se faire en parallele.`
  );
  lignes.push('');
  lignes.push(
    sommet.suite
      .map((id) => {
        const t = parId.get(id)!;
        const fait = LIVREE.has(t.statut);
        return `${fait ? '~~' : ''}${id}${fait ? '~~' : ''} (${t.estimateDays} j, ph ${t.phase})`;
      })
      .join(' → ')
  );
  lignes.push('');
  const restantCritique = sommet.suite
    .map((id) => parId.get(id)!)
    .filter((t) => !LIVREE.has(t.statut))
    .reduce((a, t) => a + t.estimateDays, 0);
  lignes.push(`Reste sur ce chemin : **${restantCritique.toFixed(2)} j**.`);
  lignes.push('');
}

if (bloquees.length || attente.length) {
  titre('Bloquées');
  lignes.push('');
  for (const t of [...bloquees, ...attente]) {
    lignes.push(`- **${t.id}** — ${t.titre} · ${t.motif ?? `attend ${t.externe}`}${(t.attempts ?? 0) > 0 ? ` · ${t.attempts} tentative(s)` : ''}`);
  }
  lignes.push('');
}

titre('Questions ouvertes pour Will');
lignes.push('');
if (!questions.length) {
  lignes.push('Aucune : toutes les décisions dont la phase courante dépend ont une hypothèse posée dans `docs/DECISIONS.md`.');
} else {
  for (const q of questions) lignes.push(`- ${q}`);
  if (questions.length > PLAFOND_QUESTIONS) {
    lignes.push('');
    lignes.push(`🛑 **${questions.length} questions ouvertes, plafond ${PLAFOND_QUESTIONS} : l'autopilote s'arrête.** Il faut un arbitrage avant de composer un nouveau lot.`);
  }
}
lignes.push('');

titre('Hypothèses par défaut appliquées');
lignes.push('');
lignes.push(`${posees.size} décisions portent une hypothèse datée dans \`docs/DECISIONS.md\` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.`);
lignes.push('');

// ── File de fusion (remplace l'ancienne rubrique « PR ouvertes ») ────────────
// Elle porte les mêmes PR, dans l'ORDRE et avec ce qui les bloque (REQ-GOV-006, `partners/ADR-0006` §5). Deux
// rubriques listant les mêmes PR auraient été exactement la duplication que RM-01 interdit : celle
// qu'on lit n'est jamais celle qu'on a corrigée.
titre('File de fusion');
lignes.push('');
const file = forge.file();
if (!file.length) {
  lignes.push('Aucune PR ouverte. **Une fusion à la fois** (RM-09) : la file se réserve avant `gh pr update-branch`, jamais après.');
} else {
  lignes.push('| # | PR | Branche | Ce qui la bloque |');
  lignes.push('| --- | --- | --- | --- |');
  file.forEach((p, i) => {
    lignes.push(`| ${i + 1} | #${p.number} — ${p.title} | \`${p.headRefName}\` | ${p.bloque} |`);
  });
  lignes.push('');
  lignes.push('Ordre : la plus prête d’abord. **Une seule fusion à la fois** (RM-09, `partners/ADR-0006` §1) ; le créneau se réserve AVANT `gh pr update-branch`, et la suivante attend l’atterrissage.');
}
lignes.push('');

// ── Revendications (REQ-GOV-007) ────────────────────────────────────────────
titre('Revendications');
lignes.push('');
lignes.push('Deux sources, aucune troisième : les labels `en_cours` + `owner:Axx` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.');
lignes.push('');
if (!forge.githubLu()) {
  lignes.push('⚠️ **Lecture GitHub indisponible** : les revendications en vol n’ont PAS pu être lues. Ce qui suit ne vient que de `docs/tasks.json` — l’absence d’une ligne ne veut donc pas dire que personne ne tient la tâche.');
  lignes.push('');
}
{
  const enVol = taches.filter((t) => !LIVREE.has(t.statut) && revendiqueursDe(t).length > 0);
  if (!enVol.length) {
    lignes.push('Aucune tâche revendiquée. Un agent ne prend jamais une tâche non revendiquée (REQ-GOV-007) : la revendication passe par l’orchestrateur.');
  } else {
    lignes.push('| Tâche | Revendiquée par | Issue | Statut |');
    lignes.push('| --- | --- | --- | --- |');
    for (const t of enVol) {
      const issue = (t as unknown as { issue?: number | null }).issue ?? null;
      lignes.push(`| ${t.id} — ${t.titre} | ${revendiqueursDe(t).join(', ')} | ${issue === null ? '—' : '#' + issue} | \`${t.statut}\` |`);
    }
  }
  lignes.push('');
  // Le défaut est NOMMÉ ici plutôt que gardé par `gov:etat` : `lot:cloture` écrit `docs/tasks.json`
  // mais ne retire pas les labels de l'issue. Armer une gate dessus la rendrait rouge en permanence
  // sur un défaut qui appartient à GOV-012, et une gate toujours rouge ne garde plus rien.
  const perimees = taches.filter((t) => LIVREE.has(t.statut) && revendiqueursDe(t).length > 0 && !t.owner);
  const perimeesLabel = taches.filter((t) => {
    const issue = (t as unknown as { issue?: number | null }).issue ?? null;
    return LIVREE.has(t.statut) && issue !== null && forge.revendications().has(issue);
  });
  if (forge.githubLu() && perimeesLabel.length > 0) {
    lignes.push(`⚠️ **${perimeesLabel.length} revendication(s) périmée(s)** — ${perimeesLabel.map((t) => t.id).join(', ')} : leur issue porte encore un label \`owner:\` alors que la tâche est livrée. \`pnpm lot:cloture\` écrit \`docs/tasks.json\` mais n’efface pas les labels ; la dette appartient à GOV-012.`);
    lignes.push('');
  }
  if (perimees.length > 0) {
    lignes.push(`⚠️ ${perimees.length} tâche(s) livrée(s) sans \`owner\` consolidé dans \`docs/tasks.json\`.`);
    lignes.push('');
  }
}

// ── Décisions du jour (REQ-GOV-006) ─────────────────────────────────────────
titre('Décisions du jour');
lignes.push('');
{
  /**
   * Les DÉCISIONS DU JOUR : les ADR dont le dernier commit tombe le même jour que la dernière fusion.
   * Dérivées de `git`, jamais tenues à la main — un « décidé aujourd'hui » écrit à la main reste vrai
   * pour l'éternité.
   */
  const jourMain = forge.dateMain().slice(0, 10);
  const decisionsDuJour = (existsSync('docs/adr') ? readdirSync('docs/adr') : [])
    .filter((f) => /^\d{4}-/.test(f) && f !== '0000-gabarit.md')
    .map((f) => ({
      fichier: f,
      jour: sh('git', ['log', '-1', '--format=%cI', '--', join('docs/adr', f)]).slice(0, 10),
      titre: (readFileSync(join('docs/adr', f), 'utf8').split('\n')[0] ?? '').replace(/^#\s*/, '').trim(),
    }))
    .filter((a) => a.jour !== '' && a.jour === jourMain)
    .sort((a, b) => a.fichier.localeCompare(b.fichier));
  if (!decisionsDuJour.length) {
    lignes.push(`Aucun ADR daté du ${jourMain || '?'} (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre \`docs/DECISIONS.md\`, tranchées ou tenues par une hypothèse datée.`);
  } else {
    // Une seule ligne, sans puce : une zone exemptée n'ouvre ni liste ni citation (`horsDeSaZone`).
    lignes.push(decisionsDuJour.map((a) => `\`docs/adr/${a.fichier}\` — ${a.titre}`).join(' · '));
    lignes.push('');
    lignes.push(`Dérivé de \`git log\` sur \`docs/adr/\`, jour du dernier atterrissage (${jourMain}). Une décision de Will n’est pas un ADR : elle vit au registre \`docs/DECISIONS.md\`.`);
  }
}
lignes.push('');

// ── Prochain pas (REQ-GOV-006) ──────────────────────────────────────────────
titre('Prochain pas');
lignes.push('');
{
  const livrees = new Set(taches.filter((t) => LIVREE.has(t.statut)).map((t) => t.id));
  const eligibles = taches.filter(
    (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.externe === null && t.deps.every((d) => livrees.has(d))
  );
  const surLeChemin = new Set(cheminCritique);
  const suivante = eligibles.find((t) => surLeChemin.has(t.id)) ?? eligibles[0] ?? null;
  const prete = forge.file().find((p) => p.rang === 1);
  // Deux paragraphes, sans numéro : une zone exemptée n'ouvre pas de liste (`horsDeSaZone`), et la
  // ligne de la tâche ne porte plus un rang qui dépendait de la forge.
  if (prete) {
    lignes.push(`**Fusionner #${prete.number}** — elle est en tête de file et ne bloque sur rien. Lire \`mergeStateStatus\` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.`);
  }
  if (suivante) {
    if (prete) lignes.push('');
    lignes.push(
      `**${suivante.id}** — ${suivante.titre} (${suivante.estimateDays} j` +
        `${surLeChemin.has(suivante.id) ? ', **sur le chemin critique**' : ''}) : ${eligibles.length} tâche(s) éligible(s) en tout. \`pnpm lot:composer\` compose le lot.`
    );
  } else if (!prete) {
    lignes.push('Aucune tâche éligible en phase courante : toutes les candidates attendent une dépendance, un tiers ou un arbitrage de Will. Voir « Bloquées » et « Questions ouvertes ».');
  }
}
lignes.push('');

titre('Dernier atterrissage');
lignes.push('');
// MESURE du 2026-09-03 : le fichier commité par la PR #27 nommait `9272c04` — le commit de la
// fusion PRÉCÉDENTE — alors que `main` était à `ff3ef54`. Ce n'est pas un oubli, c'est structurel :
// ce fichier est généré AVANT la fusion qui le porte, donc son SHA a toujours un atterrissage de
// retard. C'est pourquoi `gov:etat` garde la fraîcheur par la DATE du commit de PLAN-STATE, jamais
// par le SHA écrit dedans — et c'est pourquoi la phrase le dit, plutôt que de laisser croire.
lignes.push(`\`origin/main\` = \`${forge.shaMain() || '?'}\` (${forge.dateMain() || '?'}). Vérifier \`x-partners-build-sha\` avant toute nouvelle fusion.`);
lignes.push('');
lignes.push('Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.');
lignes.push('');

// ── Journal (REQ-GOV-023) ───────────────────────────────────────────────────
titre('Journal');
lignes.push('');
lignes.push('Source : `docs/journal/` — une entrée par PR, **fait / reste / appris**, écrite AVANT la fusion (`docs/journal/README.md`). Ce qu’une session a compris ne se dérive de rien : c’est le seul contenu de cet état vivant qui ait sa propre source.');
lignes.push('');
if (!entrees.length) {
  lignes.push('Aucune entrée. Toute PR fusionnée doit être précédée de la sienne (REQ-GOV-023) — `gov:etat` rougit sinon.');
} else {
  for (const e of entrees.slice(0, 3)) {
    lignes.push(`### PR #${e.pr} — ${e.date} — ${e.titre}`);
    lignes.push('');
    lignes.push(e.corps.split('\n').slice(1).join('\n').trim());
    lignes.push('');
  }
  if (entrees.length > 3) lignes.push(`… ${entrees.length - 3} entrée(s) plus ancienne(s) dans \`docs/journal/\`.`);
}
// Chaque entrée rendue laisse déjà sa ligne vide derrière elle : en ajouter une ici produirait une
// ligne vide en double, que le prochain `diff` du fichier dérivé ferait passer pour un changement.
if (lignes[lignes.length - 1] !== '') lignes.push('');

titre('Dette déclarée');
lignes.push('');
const dette = taches.filter((t) => t.statut === 'proposee');
lignes.push(dette.length ? dette.map((t) => `- ${t.id} — ${t.titre}`).join('\n') : 'Aucune tâche `proposee` en attente d\'arbitrage.');
lignes.push('');
// Fin des rubriques : une lecture de la forge au-delà n'appartient plus à aucune, et LÈVE.
rubriqueCourante = null;
// Le corps de chaque rubrique qui a lu la forge est neutralisé (`neutraliser`) ; son titre ne l'est pas.
debutsDesRubriques.forEach(([t, debut], k) => {
  if ((sourcesDesRubriques.get(t)?.size ?? 0) === 0) return;
  const fin = debutsDesRubriques[k + 1]?.[1] ?? lignes.length;
  for (let i = debut + 1; i < fin; i += 1) lignes[i] = neutraliser(lignes[i]!);
});

// ── REPRENDRE EN 30 SECONDES (REQ-GOV-006) ──────────────────────────────────
// Écrit comme si on ouvrait le dépôt demain sans mémoire : où est `main`, qu'est-ce qui est en vol
// et dans quel ordre, qui tient quoi, ce qu'on tape maintenant. Chaque ligne est DÉRIVÉE d'une
// rubrique plus bas ; aucune n'est saisie. Un résumé tenu à la main ment au premier oubli.
{
  const livrees = new Set(taches.filter((t) => LIVREE.has(t.statut)).map((t) => t.id));
  const eligibles = taches.filter(
    (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.externe === null && t.deps.every((d) => livrees.has(d))
  );
  const surLeChemin = new Set(cheminCritique);
  const suivante = eligibles.find((t) => surLeChemin.has(t.id)) ?? eligibles[0] ?? null;
  const derniere = entrees[0];

  // Chaque ligne non vide passe par `ligneDeReprise` : ce qu'elle lit de la forge lui est attribué,
  // et ce qu'elle ne lit pas la laisse COMPARÉE. Aucune ligne n'est classée à la main.
  const bloc = [
    '## REPRENDRE EN 30 SECONDES',
    '',
    ligneDeReprise(() => '| Question | Réponse |'),
    ligneDeReprise(() => '| --- | --- |'),
    ligneDeReprise(() => `| Où est \`main\` ? | \`${forge.shaMain() || '?'}\` — ${forge.dateMain() || '?'} |`),
    ligneDeReprise(() => {
      const file = forge.file();
      return `| Qu’est-ce qui est en vol ? | ${file.length === 0 ? 'aucune PR ouverte' : file.map((p, i) => `${i + 1}. #${p.number} (${p.bloque.split(' — ')[0]})`).join(' · ')} |`;
    }),
    ligneDeReprise(() => {
      const enVol = taches.filter((t) => !LIVREE.has(t.statut) && revendiqueursDe(t).length > 0);
      return `| Qui tient quoi ? | ${forge.githubLu() ? (enVol.length === 0 ? 'aucune tâche revendiquée' : enVol.map((t) => `${t.id} (${revendiqueursDe(t).join(', ')})`).join(' · ')) : '**lecture GitHub indisponible** — ne pas conclure « personne »'} |`;
    }),
    ligneDeReprise(() => `| Où en est la phase ? | phase ${phaseCourante} — ${faitPhase.length}/${faitPhase.length + restant.length} tâches, reste ${restant.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j |`),
    ligneDeReprise(() => {
      const prete = forge.file().find((p) => p.rang === 1);
      return `| Le prochain pas | ${prete ? `fusionner #${prete.number}, puis ` : ''}${suivante ? `${suivante.id} — ${suivante.titre}${surLeChemin.has(suivante.id) ? ' (chemin critique)' : ''}` : 'aucune tâche éligible'} |`;
    }),
    ligneDeReprise(() => `| Ce qui bloque | ${bloquees.length + attente.length} tâche(s) bloquée(s) ou en attente externe · ${questions.length} question(s) pour Will |`),
    ligneDeReprise(() => `| Dernière entrée de journal | ${derniere ? `PR #${derniere.pr} — ${derniere.date}` : 'aucune'} |`),
    '',
    ligneDeReprise(() => {
      const file = forge.file();
      const prete = file.find((p) => p.rang === 1);
      return `**Ce qu’on tape maintenant.** ${
        prete
          ? `\`gh pr view ${prete.number} --json mergeStateStatus\` puis la fusion dans le MÊME appel (RM-09).`
          : file.length > 0
            ? 'débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état.'
            : '`pnpm lot:composer` pour composer le lot suivant, puis revendiquer ses tâches par `gh issue edit`.'
      } Avant d’écrire une ligne : \`docs/REGLES-MAISON.md\`, la fiche de rôle, la tâche, ses REQ.`;
    }),
    '',
  ];
  lignes.splice(iBlocReprise, 0, ...bloc);
}

// ════════════════════════════════════════════════════════════════════════════
// LE VÉRIFICATEUR (GOV-035, REQ-GOV-032)
// ════════════════════════════════════════════════════════════════════════════
//
// `docs/PLAN-STATE.md` est la CINQUIÈME vue de REQ-GOV-032. `plan-state-frais.spec.ts` juge que ses
// rubriques SONT LÀ, jamais ce qu'elles disent ; la famille `plan_state_perime` de `gov:etat` compare
// une DATE DE COMMIT, et un fichier falsifié puis recommité est plus « frais » que le vrai. Ce mode
// compare ce que la vue DIT à ce que ses sources produisent.
//
// ── CE QUI EST COMPARÉ, ET POURQUOI PAS TOUT ────────────────────────────────
//
// Les quatre vues sœurs se dérivent de fichiers SUIVIS par git : leur vérificateur compare le
// fichier entier, octet par octet. Celle-ci ne le peut pas, et il faut le dire plutôt que le
// laisser croire : elle porte AUSSI le SHA d'`origin/main`, la file des PR ouvertes et les labels
// `owner:` des issues. Un vérificateur qui comparerait tout mesurerait la disponibilité de `gh` et
// l'âge de `main` — rouge après chaque fusion, chez tout le monde, sur une vue parfaitement juste.
// On apprendrait à le sauter, et une garde qu'on saute ne garde plus rien (RM-02). Le motif est
// déjà écrit dans `gov-trace.ts` : « si son contenu dépendait d'un appel réseau, `--verifier`
// mesurerait la disponibilité de `gh`, pas la dérivation de la vue ».
//
// LA RÈGLE : **tout est comparé, sauf ce que le générateur a LU HORS DU DÉPÔT pour l'écrire**
// (`forge`, plus haut). L'exemption est une provenance émise au moment de l'écriture ; il n'existe
// aucune liste d'exemptions, et le motif que le vert imprime est la source lue. Une exemption ne
// libère que le CONTENU de sa zone, jamais ce qui l'entoure au rendu (`horsDeSaZone`).
//
// ⚠️ CE QUE CE VÉRIFICATEUR NE VOIT PAS, écrit plutôt que tu :
//   (1) une falsification portée sur un élément exempté, et qui reste dans sa zone, passe —
//       la comparer mesurerait la forge ;
//   (2) le classement est par RUBRIQUE : « Prochain pas » lit la forge et sort du contrôle EN
//       ENTIER, alors que sa ligne de tâche se dérive de `docs/tasks.json` seul. Le bloc de reprise
//       est jugé ligne à ligne ; les rubriques pas encore. C'est GOV-053 ;
//   (3) un élément que le générateur CESSE de produire disparaît des deux côtés à la fois. C'est
//       GOV-055, et il faut une source extérieure pour le fermer.

export const BLOC_DE_REPRISE = 'REPRENDRE EN 30 SECONDES';

/** Les sources vivantes lues pour écrire un élément, en clair — `null` s'il n'en a lu aucune. */
const exemption = (sources: Set<string> | undefined): string | null =>
  sources !== undefined && sources.size > 0 ? `lu dans ${[...sources].sort().join(' et ')}` : null;

interface Rubrique { titre: string; corps: string }

/**
 * UNE RUBRIQUE EST UNE GRAMMAIRE, PAS UNE ORTHOGRAPHE — et c'est la SEULE définition du dépôt :
 * `vues-derivees.spec.ts` importe `decouper` au lieu de reconnaître `## ` à sa façon.
 *
 * Le motif est celui de CommonMark §4.2 (titre ATX de niveau 2) : jusqu'à TROIS espaces, `##`, puis
 * un blanc ou la fin de ligne ; une séquence fermante de `#` ne fait pas partie du titre. Un titre
 * indenté posé dans une rubrique exemptée ouvre donc une rubrique ici comme au rendu, et le doublon
 * rougit (`rubrique_dupliquee`).
 *
 * Les autres écritures d'un titre — Setext, titre dans une citation ou un élément de liste, titre
 * indenté de quatre colonnes ou plus — n'ouvrent pas de rubrique ici : dans une zone comparée elles
 * sont comparées octet par octet, et dans une zone exemptée `horsDeSaZone` les refuse.
 */
const TITRE_DE_RUBRIQUE = /^ {0,3}##(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/** Découpe une vue en rubriques de niveau 2. Le texte d'avant la première porte le nom `(en-tête)`. */
export function decouper(texte: string): Rubrique[] {
  const out: Rubrique[] = [];
  let nom = '(en-tête)';
  let corps: string[] = [];
  for (const l of texte.split('\n')) {
    const m = TITRE_DE_RUBRIQUE.exec(l);
    if (m) {
      out.push({ titre: nom, corps: corps.join('\n') });
      nom = (m[1] ?? '').trim();
      corps = [];
    } else corps.push(l);
  }
  out.push({ titre: nom, corps: corps.join('\n') });
  return out;
}

/**
 * UNE ZONE EXEMPTÉE NE DOIT RIEN POUVOIR FAIRE AU RENDU DE CE QUI L'ENTOURE.
 *
 * Exemptée veut dire « son CONTENU n'est pas comparé », jamais « elle peut atteindre ce qui l'est ».
 * Ce qui atteint le reste du document au rendu ne se reconnaît PAS en énumérant les ouvertures de la
 * grammaire : un élément HTML laissé ouvert au milieu d'un paragraphe n'est rien pour CommonMark, et
 * GitHub replie pourtant tout ce qui le suit ; une ouverture de bloc se cache derrière une pile de
 * conteneurs dont les indentations se composent. La règle est donc une AUTORISATION, par caractère :
 *
 *   — `<` est refusé PARTOUT dans la ligne : c'est le seul caractère qui ouvre du HTML, en bloc comme
 *     en ligne, quelle que soit sa colonne ;
 *   — la ligne est vide, ou COMMENCE, en colonne 0, par l'un des débuts de `DEBUT_PERMIS` : `|` (ligne
 *     de tableau), une lettre, un pictogramme, `**`, ou un accent grave seul (du code en ligne,
 *     jamais une clôture). Ce sont les débuts que le générateur écrit, et rien de plus. Tout le reste
 *     est refusé sans être nommé : indentation, `#`, `=`, `-`, `+`, `*` seul, chiffre, `>`, `[`, `~`,
 *     plusieurs accents graves, `$`… Un début retiré fait rougir les contre-témoins, qui jugent ce
 *     que le générateur écrit ; un début ajouté fait rougir le témoin de structure, qui porte le
 *     complément de cette liste ;
 *   — un retour chariot est refusé partout, dans toute la vue (`fin_de_ligne_non_lf`).
 *
 * Aucun de ces débuts permis n'ouvre, en CommonMark ni en GFM, une construction qui dépasse son
 * paragraphe, sa ligne de tableau ou sa cellule. Le générateur n'écrit rien d'autre dans une zone
 * exemptée, et il y ramène tout à une ligne sans `<` (`neutraliser`) : les contre-témoins (vue
 * commitée, vue rendue sous deux forges dont l'une, lisible, porte des valeurs hostiles sur plusieurs
 * lignes) gardent que la règle ne coûte aucun faux rouge.
 */
const DEBUT_PERMIS = /^(?:$|[|\p{L}\p{Extended_Pictographic}]|\*\*|`(?!`))/u;

function horsDeSaZone(ligne: string): string | null {
  if (ligne.includes('<')) return 'porte `<` — du HTML au rendu, qui peut replier ce qui suit';
  if (!DEBUT_PERMIS.test(ligne)) return `commence par ${JSON.stringify(ligne.slice(0, 3))}, hors des débuts permis — au rendu, une construction qui peut sortir de sa zone`;
  return null;
}

/** La question d'une ligne du bloc de reprise (sa première cellule), ou `null` si la ligne est une prose. */
export const question = (l: string): string | null => (l.startsWith('|') ? (l.split('|')[1] ?? '').trim() : null);
/** Les proses du bloc de reprise, dans l'ordre : toute ligne non vide qui n'est pas une question. */
export const proses = (corps: string): string[] => corps.split('\n').filter((l) => l.trim() !== '' && question(l) === null);

/**
 * LES MESURES DU DOMAINE. REQ-GOV-032 exige que l'écart soit nommé « en unités du domaine — nombre
 * de tâches livrées, nombre d'exigences — et non "les deux fichiers diffèrent" ». Elles sont LUES
 * dans les deux textes et confrontées deux à deux ; aucune valeur n'est écrite en dur.
 *
 * Leurs NOMS sont une table, et `MESURES_ATTENDUES` en dérive : le vert annonce `X/Y` — X les mesures
 * lues dans le rendu, Y la population. CE QUE CE COUPLE ATTRAPE, ET CE QU'IL N'ATTRAPE PAS :
 *   — une regex qui CESSE DE CORRESPONDRE (la vue a changé de forme) : X tombe, Y reste. Cette gate
 *     l'imprime et sort 0 ; c'est le témoin de `vues-derivees.spec.ts`, dans `pnpm test`, qui
 *     rougit sur l'inégalité ;
 *   — une LECTURE RETIRÉE de la table : X et Y tombent ENSEMBLE, EXIT 0, et aucun témoin ne rougit
 *     sur la population. La valeur retirée reste comparée octet par octet dans sa rubrique — seul son
 *     nom de domaine se perd. Comparer un générateur à lui-même ne voit pas ce qu'il a cessé de lire :
 *     c'est GOV-055.
 * Les mesures par statut, elles, viennent de `PLANCHER`, hors de ce fichier.
 */
const LECTURES: readonly (readonly [RegExp, ...string[]])[] = [
  [/^(\d+)\/(\d+) tâches terminées · reste ([\d.]+) j estimés\.$/m,
    'tâches terminées en phase courante', 'tâches de la phase courante', 'jours restants en phase courante'],
  [/^\| Où en est la phase \? \| phase (-?\d+) — (\d+)\/(\d+) tâches, reste ([\d.]+) j \|$/m,
    'phase courante (bloc de reprise)', 'tâches terminées (bloc de reprise)', 'tâches de la phase (bloc de reprise)', 'jours restants (bloc de reprise)'],
  [/^\| Ce qui bloque \| (\d+) tâche\(s\) bloquée\(s\) ou en attente externe · (\d+) question\(s\) pour Will \|$/m,
    'tâches bloquées ou en attente (bloc de reprise)', 'questions ouvertes pour Will (bloc de reprise)'],
  [/^\*\*([\d.]+) j\*\* sur (\d+) taches enchainees/m, 'jours du chemin critique', 'tâches du chemin critique'],
  [/^Reste sur ce chemin : \*\*([\d.]+) j\*\*\.$/m, 'jours restants sur le chemin critique'],
  [/^(\d+) décisions portent une hypothèse datée/m, 'décisions à hypothèse posée'],
];

/** Les mesures COMPTÉES sans regex : elles n'ont pas de capture, seulement un dénombrement. */
const DENOMBREMENTS: readonly (readonly [string, RegExp])[] = [
  ['tâches nommées sous « Bloquées »', /^- \*\*[A-Z]+-[A-Za-z0-9-]+\*\* — /gm],
  ['entrées de journal rendues', /^### PR #\d+ — /gm],
];

/** LA POPULATION, dérivée de la table et du barème — jamais retapée. */
const MESURES_ATTENDUES: readonly string[] = [
  ...LECTURES.flatMap(([, ...noms]) => noms),
  ...STATUTS_DU_TABLEAU.map((x) => `tâches \`${x}\``),
  ...DENOMBREMENTS.map(([nom]) => nom),
];

function mesures(texte: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [re, ...noms] of LECTURES) {
    const r = re.exec(texte);
    if (r) noms.forEach((n, k) => { if (r[k + 1] !== undefined) m.set(n, r[k + 1]!); });
  }
  for (const st of STATUTS_DU_TABLEAU) {
    const r = new RegExp(`^\\| \`${st}\` \\| (\\d+) \\|`, 'm').exec(texte);
    if (r) m.set(`tâches \`${st}\``, r[1]!);
  }
  for (const [nom, re] of DENOMBREMENTS) m.set(nom, String((texte.match(re) ?? []).length));
  return m;
}

/**
 * LES FAMILLES, une VALEUR — et `Famille` le type qui en dérive. `refuser`, la seule fonction qui
 * imprime une ligne `[famille]`, n'accepte qu'un membre du type.
 *
 * CE QUE LE TYPE NE FERME PAS, ET POURQUOI LE TÉMOIN LIT LA SORTIE. Un transtypage ou un second canal
 * qui écrit `[x]` lui-même passent le compilateur, et une garde qui lirait le source reconnaîtrait
 * une orthographe, pas un acte. Le témoin de `vues-derivees.spec.ts` confronte donc `FAMILLES` à ce
 * qui sort RÉELLEMENT du processus — toute ligne qui commence par `[…]`, quel que soit son contenu —
 * dans les deux sens, et exige qu'une sortie verte n'en porte aucune. Ce qui reste ouvert, et c'est
 * dit : une évasion dont AUCUN témoin ne tire la condition.
 */
export const FAMILLES = [
  'vue_perimee',
  'mesure_absente',
  'rubrique_manquante',
  'rubrique_en_trop',
  'rubrique_dupliquee',
  'rubrique_hors_ordre',
  'ligne_de_reprise_dupliquee',
  'fin_de_ligne_non_lf',
  'structure_dans_une_exemption',
] as const;

export type Famille = (typeof FAMILLES)[number];

interface Ecart { famille: Famille; message: string }

/** LA SEULE fonction du module qui écrit une ligne `[famille]`. */
function refuser(famille: Famille, message: string): void {
  console.error(`   [${famille}] ${message}`);
}

/** La première ligne qui diffère entre deux corps, rendue lisible. */
function premiereDifference(attendu: string, trouve: string): string {
  const a = attendu.split('\n');
  const t = trouve.split('\n');
  for (let i = 0; i < Math.max(a.length, t.length); i++) {
    if (a[i] !== t[i]) {
      const court = (s: string | undefined) => (s === undefined ? '(ligne absente)' : `« ${s.slice(0, 160)} »`);
      return `ligne ${i + 1} — la vue dit ${court(t[i])}, ses sources produisent ${court(a[i])}`;
    }
  }
  return 'les corps diffèrent sans qu’aucune ligne ne diffère (fin de fichier)';
}

/** Ce qu'un étage a comparé, et ce qu'il a exempté avec la source lue — pour que le vert l'ÉNUMÈRE. */
interface Etage { comparees: number; exemptees: [string, string][] }

/** Le verdict : ce que le disque porte, confronté à ce que les sources produisent À L'INSTANT. */
function comparer(attendu: string, surDisque: string): { ecarts: Ecart[]; rubriques: Etage; reprise: Etage; mesuresConfrontees: string[] } {
  const ecarts: Ecart[] = [];
  const rubriques: Etage = { comparees: 0, exemptees: [] };
  const reprise: Etage = { comparees: 0, exemptees: [] };
  const mesuresConfrontees: string[] = [];

  /** Une zone exemptée garde son contenu libre, jamais le droit d'atteindre ce qui l'entoure au rendu. */
  const contenir = (zone: string, texte: string) => {
    texte.split('\n').forEach((l, k) => {
      const s = horsDeSaZone(l);
      if (s !== null) {
        ecarts.push({ famille: 'structure_dans_une_exemption', message: `${zone}, ligne ${k + 1} de la vue sur le disque : « ${l.slice(0, 80)} » ${s}. Son CONTENU n'est pas comparé ; ce qu'elle fait au reste du document l'est.` });
      }
    });
  };

  // 0. LA FIN DE LIGNE. Tout ce qui suit découpe sur LF ; CommonMark coupe AUSSI sur CR, et une ligne
  // exemptée prolongée par un CR en deviendrait deux au rendu. Le générateur n'en écrit aucun : le
  // refuser partout ne coûte rien.
  for (const [ou, texte] of [['ce que produisent les sources', attendu], ['la vue sur le disque', surDisque]] as [string, string][]) {
    const i = texte.indexOf('\r');
    if (i >= 0) {
      ecarts.push({ famille: 'fin_de_ligne_non_lf', message: `${ou} : ${texte.split('\r').length - 1} retour(s) chariot, le premier ligne ${texte.slice(0, i).split('\n').length} — un lecteur Markdown y voit une fin de ligne, le découpage de cette garde n'en voit pas. Seul LF sépare les lignes d'une vue dérivée.` });
    }
  }

  // 1. LES MESURES DU DOMAINE : ce sont elles qui apprennent quelque chose.
  const mA = mesures(attendu);
  const mD = mesures(surDisque);
  for (const [nom] of mA) mesuresConfrontees.push(nom);
  for (const [nom, valeur] of mA) {
    const vu = mD.get(nom);
    if (vu === undefined) ecarts.push({ famille: 'mesure_absente', message: `${nom} : introuvable dans la vue sur le disque, ses sources en produisent ${valeur}` });
    else if (vu !== valeur) ecarts.push({ famille: 'vue_perimee', message: `${nom} : la vue sur le disque dit ${vu}, ses sources produisent ${valeur}` });
  }

  // 2. LA STRUCTURE : les mêmes rubriques, une fois chacune, dans le même ordre.
  const rA = decouper(attendu);
  const rD = decouper(surDisque);
  // Une rubrique dupliquée ne serait ni comparée ni signalée — `find()` rend la PREMIÈRE.
  for (const [ou, liste] of [['ce que produisent les sources', rA], ['la vue sur le disque', rD]] as [string, Rubrique[]][]) {
    const vus = new Set<string>();
    for (const r of liste) {
      if (vus.has(r.titre)) {
        ecarts.push({ famille: 'rubrique_dupliquee', message: `rubrique « ${r.titre} » dans ${ou} : elle apparaît deux fois — laquelle fait foi ? Aucune : corrige la source.` });
        continue;
      }
      vus.add(r.titre);
    }
  }
  const titresA = rA.map((r) => r.titre);
  const titresD = rD.map((r) => r.titre);
  for (const t of titresA) if (!titresD.includes(t)) ecarts.push({ famille: 'rubrique_manquante', message: `rubrique « ${t} » : absente de la vue sur le disque, produite par ses sources` });
  for (const t of titresD) if (!titresA.includes(t)) ecarts.push({ famille: 'rubrique_en_trop', message: `rubrique « ${t} » : présente dans la vue sur le disque, produite par aucune source` });
  // L'ORDRE : un mensonge n'a pas besoin d'être dans une rubrique comparée, il lui suffit d'être LU
  // EN PREMIER (une rubrique exemptée remontée au-dessus du bloc de reprise).
  if (titresA.length === titresD.length) {
    for (let k = 0; k < titresA.length; k += 1) {
      if (titresA[k] !== titresD[k]) {
        ecarts.push({
          famille: 'rubrique_hors_ordre',
          message: `rubrique n°${k + 1} : la vue sur le disque porte « ${titresD[k]} », ses sources produisent « ${titresA[k]} » — l'ORDRE des rubriques est dérivé, il ne se réarrange pas à la main`,
        });
        break;
      }
    }
  }

  // 3. LE CORPS des rubriques, OCTET PAR OCTET — sauf celles dont le générateur a lu la forge.
  for (const r of rA) {
    if (r.titre === BLOC_DE_REPRISE) continue;
    const surPlace = rD.find((x) => x.titre === r.titre);
    const motif = exemption(sourcesDesRubriques.get(r.titre));
    if (motif !== null) {
      rubriques.exemptees.push([r.titre, motif]);
      if (surPlace) contenir(`rubrique « ${r.titre} »`, surPlace.corps);
      continue;
    }
    rubriques.comparees += 1;
    if (!surPlace || surPlace.corps === r.corps) continue;
    ecarts.push({ famille: 'vue_perimee', message: `rubrique « ${r.titre} » : ${premiereDifference(r.corps, surPlace.corps)}` });
  }

  // 4. LE BLOC DE REPRISE, ligne à ligne : il mêle les tâches et la forge.
  const blocA = rA.find((r) => r.titre === BLOC_DE_REPRISE);
  const blocD = rD.find((r) => r.titre === BLOC_DE_REPRISE);
  if (blocA && blocD) {
    // LA FORME d'abord : l'ordre des lignes, les lignes vides, la nature de chacune. Une ligne
    // exemptée est libre de CONTENU, pas de PLACE — remontée au-dessus de l'en-tête du tableau, elle
    // en casserait le rendu, lignes comparées comprises.
    const forme = (corps: string) =>
      corps.split('\n').map((l) => (l === '' ? '(ligne vide)' : question(l) !== null ? `la question « ${question(l)} »` : 'une prose'));
    const fA = forme(blocA.corps);
    const fD = forme(blocD.corps);
    for (let k = 0; k < Math.max(fA.length, fD.length); k += 1) {
      if (fA[k] !== fD[k]) {
        ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, ligne ${k + 1} : la vue sur le disque porte ${fD[k] ?? '(rien)'}, ses sources produisent ${fA[k] ?? '(rien)'} — la FORME du bloc est dérivée, elle ne se réarrange pas à la main` });
        break;
      }
    }

    // Les QUESTIONS, par leur libellé. La provenance se teste avant l'exemption : une ligne présente
    // d'un seul côté est un écart, quel que soit ce qu'elle a lu.
    const indexer = (corps: string, ou: string) => {
      const m = new Map<string, string>();
      for (const l of corps.split('\n')) {
        const q = question(l);
        if (q === null) continue;
        if (m.has(q)) {
          ecarts.push({ famille: 'ligne_de_reprise_dupliquee', message: `bloc de reprise, ${ou} : la question « ${q} » apparaît deux fois — laquelle fait foi ? Aucune : corrige la source.` });
          continue;
        }
        m.set(q, l);
      }
      return m;
    };
    const qA = indexer(blocA.corps, 'dans ce que produisent les sources');
    const qD = indexer(blocD.corps, 'dans la vue sur le disque');
    for (const q of new Set([...qA.keys(), ...qD.keys()])) {
      const attendue = qA.get(q);
      const vue = qD.get(q);
      if (attendue === undefined) {
        ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la ligne « ${q} » est sur le disque et n'est produite par AUCUNE source` });
        continue;
      }
      if (vue === undefined) {
        ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la ligne « ${q} » est produite par les sources et ABSENTE de la vue sur le disque` });
        continue;
      }
      const motif = exemption(sourcesDesLignes.get(attendue));
      if (motif !== null) {
        reprise.exemptees.push([q, motif]);
        contenir(`bloc de reprise, ligne « ${q} »`, vue);
        continue;
      }
      reprise.comparees += 1;
      if (vue !== attendue) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, ligne « ${q} » : la vue sur le disque dit « ${vue.slice(0, 160)} », ses sources produisent « ${attendue.slice(0, 160)} »` });
    }

    // Les PROSES, par leur RANG : la forme vient d'être confrontée, la n-ième prose du disque est donc
    // celle que les sources ont écrite n-ième. Il n'y a plus de préfixe à déclarer, donc plus de
    // préfixe vide qui exempterait tout.
    const pA = proses(blocA.corps);
    const pD = proses(blocD.corps);
    for (let k = 0; k < Math.max(pA.length, pD.length); k += 1) {
      const a = pA[k];
      const d = pD[k];
      if (a === undefined) { ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la prose n°${k + 1} « ${d!.slice(0, 60)} » est sur le disque et n'est produite par AUCUNE source` }); continue; }
      if (d === undefined) { ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la prose n°${k + 1} « ${a.slice(0, 60)} » est produite par les sources et ABSENTE de la vue sur le disque` }); continue; }
      const motif = exemption(sourcesDesLignes.get(a));
      if (motif !== null) {
        reprise.exemptees.push([`prose n°${k + 1}`, motif]);
        contenir(`bloc de reprise, prose n°${k + 1}`, d);
        continue;
      }
      reprise.comparees += 1;
      if (a !== d) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, prose n°${k + 1} « ${a.slice(0, 60)} » : la vue sur le disque et ses sources diffèrent` });
    }
  }

  return { ecarts, rubriques, reprise, mesuresConfrontees };
}

// ── les deux modes ───────────────────────────────────────────────────────────
const rendu = lignes.join('\n') + '\n';

/**
 * IMPORTER CE MODULE N'ÉCRIT ET NE JUGE RIEN. `vues-derivees.spec.ts` l'importe (`FAMILLES`,
 * `decouper`) ; si l'import tombait dans la branche qui ÉCRIT, le contre-témoin « la vue COMMITÉE est
 * égale à ses sources » jugerait un fichier que l'import vient de régénérer — vert par construction.
 * Les deux modes ne tournent donc que lorsque ce fichier est LE script lancé, et le témoin « importer
 * le module » le voit rougir s'il écrit.
 */
const LANCE_EN_SCRIPT = /[\\/]plan-state[\\/]build\.ts$/.test(process.argv[1] ?? '');

if (!LANCE_EN_SCRIPT) {
  // Importé : rien n'est écrit, rien n'est jugé.
} else if (MODE_VERIFIER) {
  // Ce mode N'ÉCRIT RIEN : une garde qui répare ce qu'elle contrôle est toujours verte.
  if (!existsSync(CHEMIN_VUE)) {
    console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} est ABSENT : il n’y a rien à comparer. Tape \`pnpm plan-state:build\`.`);
    process.exitCode = 1;
  } else {
    const { ecarts, rubriques, reprise, mesuresConfrontees } = comparer(rendu, readFileSync(CHEMIN_VUE, 'utf8'));
    if (ecarts.length > 0) {
      console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} a DÉRIVÉ de ses sources : ${ecarts.length} écart(s).`);
      for (const e of ecarts.slice(0, 20)) refuser(e.famille, e.message);
      if (ecarts.length > 20) console.error(`   … et ${ecarts.length - 20} autre(s).`);
      console.error(
        '   Cette vue est DÉRIVÉE : tape `pnpm plan-state:build` pour la régénérer. Si le chiffre te ' +
          'surprend, c’est la SOURCE qu’il faut corriger (`docs/tasks.json` par `pnpm lot:cloture`, ' +
          '`docs/DECISIONS.md`, `docs/journal/`) — jamais la vue à la main.\n' +
          '   ⚠️ Si l’élément est RÉELLEMENT volatile, c’est que le générateur le lit hors du dépôt : cette ' +
          'lecture passe par `forge` dans `scripts/plan-state/build.ts`, qui l’exempte et imprime la source ' +
          'lue. Il n’y a pas de liste à allonger.'
      );
      process.exitCode = 1;
    } else {
      console.log(
        `✅ plan-state:verifier — ${CHEMIN_VUE} est égal à ce que ses sources produisent : ` +
          `${rubriques.comparees} rubrique(s) comparée(s) octet par octet sur ${rubriques.comparees + rubriques.exemptees.length}, ` +
          `${reprise.comparees} ligne(s) du bloc de reprise CONFRONTÉES sur ${reprise.comparees + reprise.exemptees.length}, ` +
          `${mesuresConfrontees.length}/${MESURES_ATTENDUES.length} mesure(s) du domaine CONFRONTÉES.`
      );
      const rendreExemptions = (quoi: string, l: [string, string][]) =>
        l.length ? `   NON COMPARÉ — ${quoi} : ${l.map(([r, motif]) => `« ${r} » (${motif})`).join(' · ')}.` : null;
      // Les mesures sont NOMMÉES, comme les autres étages — sinon c'est la seule population qu'on
      // pourrait vider sans que la forme de la sortie change.
      console.log(`   CONFRONTÉ — mesures du domaine : ${mesuresConfrontees.join(' · ')}.`);
      for (const ligne of [
        rendreExemptions('rubriques', rubriques.exemptees),
        rendreExemptions('lignes du bloc de reprise', reprise.exemptees),
      ]) if (ligne) console.log(ligne);
    }
  }
} else {
  writeFileSync(CHEMIN_VUE, rendu);
  console.log(`PLAN-STATE régénéré — phase ${phaseCourante}, ${enCours.length} en cours, ${questions.length} question(s) ouverte(s).`);
  if (questions.length > PLAFOND_QUESTIONS) process.exitCode = 1;
}
