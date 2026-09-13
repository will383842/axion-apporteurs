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
 * CE FICHIER A CITÉ UN TEST QUI N'EXISTE PAS — « le test `plan-state-derive.spec.ts` relance ce
 * script et exige que le fichier commité soit identique ». Aucun fichier de ce nom n'a jamais été
 * écrit ; l'assertion qu'il promettait n'existait nulle part, et c'est précisément ce qui a permis à
 * une lentille de falsifier quinze lignes de la vue sans faire rougir quoi que ce soit. C'est LEC-12
 * mot pour mot — « une citation n'est pas une existence » — dans le fichier même qu'elle décrit.
 * La promesse est désormais TENUE, par `--verifier` ci-dessous et par le témoin qui le voit rougir :
 * `tests/unit/gouvernance/vues-derivees.spec.ts` (GOV-035, REQ-GOV-032).
 *
 * INVARIANT : ce script ne DÉCIDE rien. S'il faut changer un statut, on change l'issue, pas le fichier.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { referencePr, type Attestation } from '../lot/attestation';

const PLAFOND_QUESTIONS = 10;

/**
 * Les deux arguments. `--verifier` ne fait que LIRE ; `--out` déplace la vue, et n'existe que pour
 * que les témoins travaillent en bac à sable : un test qui périmerait `docs/PLAN-STATE.md` pour de
 * vrai emporterait le travail non commité de la session qui l'exécute.
 */
const MODE_VERIFIER = process.argv.includes('--verifier');
const CHEMIN_VUE = (() => {
  const i = process.argv.indexOf('--out');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : 'docs/PLAN-STATE.md';
})();

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
const TERMINES = new Set(['fusionnee', 'deployee', 'verifiee']);
const phases = [...new Set(taches.map((t) => t.phase))].sort((a, b) => a - b);
const phaseCourante = phases.find((p) => taches.some((t) => t.phase === p && !TERMINES.has(t.statut))) ?? phases.at(-1)!;

const par = (s: string) => taches.filter((t) => t.statut === s);
const enCours = par('en_cours');
const bloquees = par('bloquee');
const attente = par('attente_externe');

// Questions ouvertes = décisions SANS hypothèse posée, citées par une tâche de la phase courante.
const questions = [
  ...new Set(
    taches
      .filter((t) => t.phase === phaseCourante && !TERMINES.has(t.statut))
      .flatMap((t) => [
        ...t.hyp.filter((h) => !posees.has(h)).map((h) => (bloquantes.has(h) ? `${h} — **bloquante (§1 du registre)**` : h)),
        ...(t.externe ? [`externe:${t.externe}`] : []),
      ])
  ),
];

interface PrOuverte { number: number; headRefName: string; mergeStateStatus: string; isDraft: boolean; title: string }

const prs: PrOuverte[] = (() => {
  const brut = sh('gh', ['pr', 'list', '--json', 'number,headRefName,mergeStateStatus,isDraft,title', '--limit', '50']);
  try { return JSON.parse(brut || '[]') as PrOuverte[]; } catch { return []; }
})();

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
const brutIssues = sh('gh', ['issue', 'list', '--state', 'open', '--json', 'number,labels', '--limit', '200']);
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
const revendiqueursDe = (t: Tache): string[] => {
  const vus = new Set<string>();
  const issue = (t as unknown as { issue?: number | null }).issue ?? null;
  if (issue !== null) for (const o of revendications.get(issue) ?? []) vus.add(o);
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

const shaMain = sh('git', ['rev-parse', '--short', 'origin/main']);
const dateMain = sh('git', ['log', '-1', '--format=%cI', 'origin/main']);

/**
 * Les DÉCISIONS DU JOUR : les ADR dont le dernier commit tombe le même jour que la dernière fusion.
 * Dérivées de `git`, jamais tenues à la main — un « décidé aujourd'hui » écrit à la main reste vrai
 * pour l'éternité.
 */
const jourMain = dateMain.slice(0, 10);
const decisionsDuJour = (existsSync('docs/adr') ? readdirSync('docs/adr') : [])
  .filter((f) => /^\d{4}-/.test(f) && f !== '0000-gabarit.md')
  .map((f) => ({
    fichier: f,
    jour: sh('git', ['log', '-1', '--format=%cI', '--', join('docs/adr', f)]).slice(0, 10),
    titre: (readFileSync(join('docs/adr', f), 'utf8').split('\n')[0] ?? '').replace(/^#\s*/, '').trim(),
  }))
  .filter((a) => a.jour !== '' && a.jour === jourMain)
  .sort((a, b) => a.fichier.localeCompare(b.fichier));
const lignes: string[] = [];

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
lignes.push(`## Phase courante : ${phaseCourante}`);
lignes.push('');
const restant = taches.filter((t) => t.phase === phaseCourante && !TERMINES.has(t.statut));
const faitPhase = taches.filter((t) => t.phase === phaseCourante && TERMINES.has(t.statut));
lignes.push(`${faitPhase.length}/${faitPhase.length + restant.length} tâches terminées · reste ${restant.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j estimés.`);
lignes.push('');

lignes.push('## Tâches');
lignes.push('');
lignes.push('| Statut | Nombre | Détail |');
lignes.push('| --- | --- | --- |');
for (const s of ['a_faire', 'en_cours', 'en_revue', 'fusionnee', 'deployee', 'verifiee', 'bloquee', 'attente_externe']) {
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

  lignes.push('## Chemin critique');
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
        const fait = TERMINES.has(t.statut);
        return `${fait ? '~~' : ''}${id}${fait ? '~~' : ''} (${t.estimateDays} j, ph ${t.phase})`;
      })
      .join(' → ')
  );
  lignes.push('');
  const restantCritique = sommet.suite
    .map((id) => parId.get(id)!)
    .filter((t) => !TERMINES.has(t.statut))
    .reduce((a, t) => a + t.estimateDays, 0);
  lignes.push(`Reste sur ce chemin : **${restantCritique.toFixed(2)} j**.`);
  lignes.push('');
}

if (bloquees.length || attente.length) {
  lignes.push('## Bloquées');
  lignes.push('');
  for (const t of [...bloquees, ...attente]) {
    lignes.push(`- **${t.id}** — ${t.titre} · ${t.motif ?? `attend ${t.externe}`}${(t.attempts ?? 0) > 0 ? ` · ${t.attempts} tentative(s)` : ''}`);
  }
  lignes.push('');
}

lignes.push('## Questions ouvertes pour Will');
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

lignes.push('## Hypothèses par défaut appliquées');
lignes.push('');
lignes.push(`${posees.size} décisions portent une hypothèse datée dans \`docs/DECISIONS.md\` (avec leur réversibilité). Les décisions marquées « avenant » se tranchent **avant le premier envoi DocuSeal**.`);
lignes.push('');

// ── File de fusion (remplace l'ancienne rubrique « PR ouvertes ») ────────────
// Elle porte les mêmes PR, dans l'ORDRE et avec ce qui les bloque (REQ-GOV-006, `partners/ADR-0006` §5). Deux
// rubriques listant les mêmes PR auraient été exactement la duplication que RM-01 interdit : celle
// qu'on lit n'est jamais celle qu'on a corrigée.
lignes.push('## File de fusion');
lignes.push('');
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
lignes.push('## Revendications');
lignes.push('');
lignes.push('Deux sources, aucune troisième : les labels `en_cours` + `owner:<Axx>` de l’issue, posés par l’orchestrateur au §3 de `.claude/skills/lot/SKILL.md` (revendication **en vol**), et le champ `owner` de `docs/tasks.json`, écrit par `pnpm lot:cloture` seul (revendication **consolidée**). Cette rubrique les REND ; corriger une revendication fausse se fait dans l’une des deux sources, jamais ici.');
lignes.push('');
if (!githubLu) {
  lignes.push('> ⚠️ **Lecture GitHub indisponible** : les revendications en vol n’ont PAS pu être lues. Ce qui suit ne vient que de `docs/tasks.json` — l’absence d’une ligne ne veut donc pas dire que personne ne tient la tâche.');
  lignes.push('');
}
{
  const enVol = taches.filter((t) => !TERMINES.has(t.statut) && revendiqueursDe(t).length > 0);
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
  const perimees = taches.filter((t) => TERMINES.has(t.statut) && revendiqueursDe(t).length > 0 && !t.owner);
  const perimeesLabel = taches.filter((t) => {
    const issue = (t as unknown as { issue?: number | null }).issue ?? null;
    return TERMINES.has(t.statut) && issue !== null && revendications.has(issue);
  });
  if (githubLu && perimeesLabel.length > 0) {
    lignes.push(`⚠️ **${perimeesLabel.length} revendication(s) périmée(s)** — ${perimeesLabel.map((t) => t.id).join(', ')} : leur issue porte encore un label \`owner:\` alors que la tâche est livrée. \`pnpm lot:cloture\` écrit \`docs/tasks.json\` mais n’efface pas les labels ; la dette appartient à GOV-012.`);
    lignes.push('');
  }
  if (perimees.length > 0) {
    lignes.push(`⚠️ ${perimees.length} tâche(s) livrée(s) sans \`owner\` consolidé dans \`docs/tasks.json\`.`);
    lignes.push('');
  }
}

// ── Décisions du jour (REQ-GOV-006) ─────────────────────────────────────────
lignes.push('## Décisions du jour');
lignes.push('');
if (!decisionsDuJour.length) {
  lignes.push(`Aucun ADR daté du ${jourMain || '?'} (jour du dernier atterrissage). Les décisions de Will, elles, vivent au registre \`docs/DECISIONS.md\`, tranchées ou tenues par une hypothèse datée.`);
} else {
  for (const a of decisionsDuJour) lignes.push(`- ${a.titre} — \`docs/adr/${a.fichier}\``);
  lignes.push('');
  lignes.push(`Dérivé de \`git log\` sur \`docs/adr/\`, jour du dernier atterrissage (${jourMain}). Une décision de Will n’est pas un ADR : elle vit au registre \`docs/DECISIONS.md\`.`);
}
lignes.push('');

// ── Prochain pas (REQ-GOV-006) ──────────────────────────────────────────────
lignes.push('## Prochain pas');
lignes.push('');
{
  const livrees = new Set(taches.filter((t) => TERMINES.has(t.statut)).map((t) => t.id));
  const eligibles = taches.filter(
    (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.externe === null && t.deps.every((d) => livrees.has(d))
  );
  const surLeChemin = new Set(cheminCritique);
  const suivante = eligibles.find((t) => surLeChemin.has(t.id)) ?? eligibles[0] ?? null;
  const prete = file.find((p) => p.rang === 1);
  if (prete) {
    lignes.push(`1. **Fusionner #${prete.number}** — elle est en tête de file et ne bloque sur rien. Lire \`mergeStateStatus\` et fusionner dans le MÊME appel (RM-09), puis vérifier l’atterrissage.`);
  }
  if (suivante) {
    lignes.push(
      `${prete ? '2' : '1'}. **${suivante.id}** — ${suivante.titre} (${suivante.estimateDays} j` +
        `${surLeChemin.has(suivante.id) ? ', **sur le chemin critique**' : ''}) : ${eligibles.length} tâche(s) éligible(s) en tout. \`pnpm lot:composer\` compose le lot.`
    );
  } else if (!prete) {
    lignes.push('Aucune tâche éligible en phase courante : toutes les candidates attendent une dépendance, un tiers ou un arbitrage de Will. Voir « Bloquées » et « Questions ouvertes ».');
  }
}
lignes.push('');

lignes.push('## Dernier atterrissage');
lignes.push('');
// MESURE du 2026-09-03 : le fichier commité par la PR #27 nommait `9272c04` — le commit de la
// fusion PRÉCÉDENTE — alors que `main` était à `ff3ef54`. Ce n'est pas un oubli, c'est structurel :
// ce fichier est généré AVANT la fusion qui le porte, donc son SHA a toujours un atterrissage de
// retard. C'est pourquoi `gov:etat` garde la fraîcheur par la DATE du commit de PLAN-STATE, jamais
// par le SHA écrit dedans — et c'est pourquoi la phrase le dit, plutôt que de laisser croire.
lignes.push(`\`origin/main\` = \`${shaMain || '?'}\` (${dateMain || '?'}). Vérifier \`x-partners-build-sha\` avant toute nouvelle fusion.`);
lignes.push('');
lignes.push('> Ce SHA est celui lu **au moment de la génération**, donc avant la fusion de la PR qui porte ce fichier : il a par construction un atterrissage de retard. La fraîcheur se garde par la DATE du commit (`gov:etat`, famille `plan_state_perime`), jamais par ce SHA.');
lignes.push('');

// ── Journal (REQ-GOV-023) ───────────────────────────────────────────────────
lignes.push('## Journal');
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

lignes.push('## Dette déclarée');
lignes.push('');
const dette = taches.filter((t) => t.statut === 'proposee');
lignes.push(dette.length ? dette.map((t) => `- ${t.id} — ${t.titre}`).join('\n') : 'Aucune tâche `proposee` en attente d\'arbitrage.');
lignes.push('');

// ── REPRENDRE EN 30 SECONDES (REQ-GOV-006) ──────────────────────────────────
// Écrit comme si on ouvrait le dépôt demain sans mémoire : où est `main`, qu'est-ce qui est en vol
// et dans quel ordre, qui tient quoi, ce qu'on tape maintenant. Chaque ligne est DÉRIVÉE d'une
// rubrique plus bas ; aucune n'est saisie. Un résumé tenu à la main ment au premier oubli.
{
  const enVol = taches.filter((t) => !TERMINES.has(t.statut) && revendiqueursDe(t).length > 0);
  const livrees = new Set(taches.filter((t) => TERMINES.has(t.statut)).map((t) => t.id));
  const eligibles = taches.filter(
    (t) => t.statut === 'a_faire' && t.phase === phaseCourante && t.externe === null && t.deps.every((d) => livrees.has(d))
  );
  const surLeChemin = new Set(cheminCritique);
  const suivante = eligibles.find((t) => surLeChemin.has(t.id)) ?? eligibles[0] ?? null;
  const prete = file.find((p) => p.rang === 1);
  const derniere = entrees[0];

  const bloc = [
    '## REPRENDRE EN 30 SECONDES',
    '',
    '| Question | Réponse |',
    '| --- | --- |',
    `| Où est \`main\` ? | \`${shaMain || '?'}\` — ${dateMain || '?'} |`,
    `| Qu’est-ce qui est en vol ? | ${file.length === 0 ? 'aucune PR ouverte' : file.map((p, i) => `${i + 1}. #${p.number} (${p.bloque.split(' — ')[0]})`).join(' · ')} |`,
    `| Qui tient quoi ? | ${githubLu ? (enVol.length === 0 ? 'aucune tâche revendiquée' : enVol.map((t) => `${t.id} (${revendiqueursDe(t).join(', ')})`).join(' · ')) : '**lecture GitHub indisponible** — ne pas conclure « personne »'} |`,
    `| Où en est la phase ? | phase ${phaseCourante} — ${faitPhase.length}/${faitPhase.length + restant.length} tâches, reste ${restant.reduce((s, t) => s + t.estimateDays, 0).toFixed(2)} j |`,
    `| Le prochain pas | ${prete ? `fusionner #${prete.number}, puis ` : ''}${suivante ? `${suivante.id} — ${suivante.titre}${surLeChemin.has(suivante.id) ? ' (chemin critique)' : ''}` : 'aucune tâche éligible'} |`,
    `| Ce qui bloque | ${bloquees.length + attente.length} tâche(s) bloquée(s) ou en attente externe · ${questions.length} question(s) pour Will |`,
    `| Dernière entrée de journal | ${derniere ? `PR #${derniere.pr} — ${derniere.date}` : 'aucune'} |`,
    '',
    `**Ce qu’on tape maintenant.** ${
      prete
        ? `\`gh pr view ${prete.number} --json mergeStateStatus\` puis la fusion dans le MÊME appel (RM-09).`
        : file.length > 0
          ? 'débloquer la tête de file ci-dessus — aucune PR n’est fusionnable en l’état.'
          : '`pnpm lot:composer` pour composer le lot suivant, puis revendiquer ses tâches par `gh issue edit`.'
    } Avant d’écrire une ligne : \`docs/REGLES-MAISON.md\`, la fiche de rôle, la tâche, ses REQ.`,
    '',
  ];
  lignes.splice(iBlocReprise, 0, ...bloc);
}

// ════════════════════════════════════════════════════════════════════════════
// LE VÉRIFICATEUR (GOV-035, REQ-GOV-032)
// ════════════════════════════════════════════════════════════════════════════
//
// `docs/PLAN-STATE.md` était la CINQUIÈME vue de REQ-GOV-032 et la seule sans vérificateur : ce
// script ÉCRIVAIT, et rien ne comparait. Mesuré par une lentille le 2026-09-12 — quinze lignes
// falsifiées dans la vue, toutes ancres conservées (« 29/36 » → « 36/36 », « reste 4.00 j » →
// « 0.00 », « 2 tâche(s) bloquée(s) » → « 0 ») : HUIT vérificateurs de Gate A sont restés verts,
// et `plan-state-frais.spec.ts` 25/25, parce qu'il juge que les rubriques SONT LÀ, jamais ce
// qu'elles disent. La famille `plan_state_perime` de `gov:etat` compare une DATE DE COMMIT : un
// fichier falsifié puis recommité est plus « frais » que le vrai.
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
// mesurerait la disponibilité de `gh`, pas la dérivation de la vue ». MESURE du 2026-09-12 : sur
// un arbre à jour, les seules différences entre le fichier commité et un rendu neuf étaient le
// SHA de `main`, la file de fusion, « Décisions du jour » (dérivée du JOUR du dernier
// atterrissage) et « Prochain pas » — toutes volatiles, aucune fautive.
//
// Le périmètre comparé est donc celui des rubriques dérivées de fichiers SUIVIS. Il est DÉCLARÉ
// ci-dessous, la sortie verte le NOMME — un vert muet promet plus qu'il ne tient — et une
// rubrique qui n'appartient à AUCUNE des deux listes fait rougir : sans quoi la couverture se
// périmerait en silence dès la première rubrique ajoutée au générateur.
//
// ⚠️ CE QUE CE VÉRIFICATEUR NE VOIT PAS, écrit plutôt que tu : une falsification portée
// uniquement sur une rubrique volatile (réécrire le SHA de `main`, retirer une PR de la file)
// passe. Fermer ce trou demanderait de figer la forge dans une fixture, ce que cette vue ne fait
// 🔴 CETTE PHRASE DISAIT : « ce qui est fermé, c'est tout ce qui se dérive d'un fichier du
// dépôt ». **C'est FAUX**, et A10 · mutation l'a joué sur la PR #36 : la deuxième ligne de
// « Prochain pas » se dérive de `docs/tasks.json` SEUL — `statut === 'a_faire' && phase ===
// phaseCourante && externe === null && deps.every(livrées)` — sans le moindre appel à la forge.
// La réécrire en « la phase -1 est TERMINÉE, 39/39 tâches » passe : exit 0.
//
// 🔑 La leçon exacte : **le classement est par RUBRIQUE, la volatilité est par LIGNE.** Une
// rubrique qui mêle une source vivante et une source du dépôt est déclarée volatile EN ENTIER,
// donc sa part dérivable sort du contrôle avec le reste. Le bloc de reprise, lui, est traité
// ligne à ligne : c'est la bonne granularité, et elle n'a pas été appliquée aux rubriques.
//
// Ce n'est PAS fermé ici. Découper « Prochain pas » demanderait de séparer sa ligne dérivable de
// sa ligne vivante DANS LE GÉNÉRATEUR, donc de changer ce que la vue affiche : un arbitrage de
// rendu, pas une correction de garde. Versé plutôt que glissé dans ce lot (charte A11).

/** Les rubriques NON comparables, chacune avec la source vivante qui l'en empêche. */
const RUBRIQUES_VOLATILES: [string, string][] = [
  ['File de fusion', '`gh pr list` — change à chaque ouverture ou fusion de PR'],
  ['Revendications', '`gh issue list` — labels `owner:` posés hors du dépôt'],
  ['Décisions du jour', 'dérivée du JOUR du dernier atterrissage, donc de `origin/main`'],
  ['Prochain pas', 'dépend de la tête de la file de fusion'],
  ['Dernier atterrissage', 'SHA et date d’`origin/main`'],
];

/**
 * 🔴 QUATRE LISTES TAPÉES SONT DEVENUES UNE, ET LA DOCTRINE EST LA MÊME AUX DEUX ÉTAGES.
 *
 * La rédaction précédente portait deux règles OPPOSÉES dans la même fonction, sans qu'aucune phrase
 * ne l'explique : au niveau des rubriques, *non déclaré ⇒ COMPARÉE* ; au niveau des lignes,
 * *non déclaré ⇒ REFUS*. A09 · simplicite l'a relevé, et a démoli la raison que j'en donnais —
 * « une ligne inconnue n'a pas de contrepartie » n'est pas une propriété des lignes, **c'est une
 * propriété de l'ordre des tests** : les deux messages de contrepartie existaient déjà, ils étaient
 * seulement inatteignables parce que le classement tirait avant la provenance.
 *
 * 🔑 L'ARGUMENT QUI TRANCHE, et il porte sur ce que chaque règle ENSEIGNE. Sous « comparée par
 * défaut », la seule déclaration qu'un humain puisse écrire est une **exemption, et elle coûte un
 * motif**. Sous « refus par défaut », il peut aussi écrire « comparée » : une déclaration qui ne
 * coûte rien, qui a l'air d'une mise en conformité — et c'était exactement la porte que le message
 * de refus désignait du doigt (« classe-la dans scripts/plan-state/build.ts »). *L'échappatoire
 * bon marché est celle qu'on prend.*
 *
 * Ce que le refus donnait — un signal DÉTERMINISTE à l'introduction, plutôt qu'un rouge différé au
 * premier changement de la forge — est rendu par le vert qui **énumère sa population** : ajouter
 * une ligne au générateur change la sortie du vert dans le diff même qui l'ajoute.
 *
 * Il reste donc, à chaque niveau, EXACTEMENT UNE liste tapée : les exemptions, chacune avec la
 * source vivante qui la justifie, chacune IMPRIMÉE par le vert.
 */
const BLOC_DE_REPRISE = 'REPRENDRE EN 30 SECONDES';

/**
 * Les LIGNES exemptées du bloc, chacune avec la source vivante qui l'en empêche.
 *
 * ⚠️ `LIGNES_DE_REPRISE_COMPAREES` et `LIGNES_DE_STRUCTURE` ont disparu. La première était la
 * liste d'inclusion que la dérivation remplace. La seconde exemptait l'en-tête et le séparateur du
 * tableau : A09 · securite a mesuré qu'elle les exemptait **par leur question seule, le contenu
 * restant libre** — réécrire `| Question | n'importe quoi |` passait, exit 0. Ce sont des
 * constantes du générateur : les comparer octet par octet est gratuit et correct.
 */
const LIGNES_EXEMPTEES: [string, string][] = [
  ['Où est `main` ?', 'SHA et date d’`origin/main`'],
  ['Qu’est-ce qui est en vol ?', '`gh pr list` — la file de fusion'],
  ['Qui tient quoi ?', '`gh issue list` — labels `owner:` posés hors du dépôt'],
  ['Le prochain pas', 'dépend de la tête de la file de fusion'],
];

/**
 * Les PROSES exemptées du bloc, déclarées par leur début.
 *
 * ⚠️ RÉSERVE ÉCRITE ICI PARCE QUE PERSONNE NE LA RAMASSERAIT AILLEURS (A09 · securite) : de cette
 * prose, seule la PREMIÈRE clause dépend de la file de fusion — sa queue est une constante du
 * générateur, et la réécrire passe. L'exemption est donc plus large que sa justification. C'est le
 * même défaut que GOV-053 nomme pour les rubriques, **à la granularité de la clause** : l'acceptance
 * de GOV-053 le dit maintenant explicitement.
 */
const PROSES_EXEMPTEES: [string, string][] = [
  ['**Ce qu’on tape maintenant.**', 'sa première clause dépend de la tête de la file de fusion'],
];

/**
 * 🔴 UN PRÉFIXE VIDE DÉSARMAIT TOUTE LA FAMILLE. A10 · mutation, 2e tour de la PR #36 : remplacer
 * le préfixe déclaré par la chaîne vide exempte TOUTE prose, puisque `startsWith('')` est toujours
 * vrai — et rien ne le disait. Une exemption qui s'élargit en silence est pire qu'une exemption
 * large : celle-ci a l'air étroite.
 *
 * Le contrôle est ici, au chargement du module, et il LÈVE : un plantage au démarrage est le seul
 * refus qu'on ne peut pas manquer.
 */
for (const [prefixe, motif] of PROSES_EXEMPTEES) {
  if (prefixe.trim().length < 4) {
    throw new Error(`plan-state : un préfixe d'exemption de prose fait moins de 4 caractères (« ${prefixe} ») — il exempterait bien plus que ce qu'il nomme.`);
  }
  if (motif.trim().length < 10) {
    throw new Error(`plan-state : l'exemption de prose « ${prefixe} » n'a pas de motif lisible — une exemption sans motif est un oubli qui a l'air d'une décision.`);
  }
}

interface Rubrique { titre: string; corps: string }

/** Découpe une vue en rubriques `## `. Le texte d'avant la première porte le nom `(en-tête)`. */
function decouper(texte: string): Rubrique[] {
  const out: Rubrique[] = [];
  let titre = '(en-tête)';
  let corps: string[] = [];
  for (const l of texte.split('\n')) {
    if (l.startsWith('## ')) {
      out.push({ titre, corps: corps.join('\n') });
      titre = l.slice(3).trim();
      corps = [];
    } else corps.push(l);
  }
  out.push({ titre, corps: corps.join('\n') });
  return out;
}

/**
 * 🔴 IL N'Y A PLUS DE LISTE DES RUBRIQUES COMPARÉES, ET C'EST LA CORRECTION.
 *
 * Elle en retapait neuf, qui existent déjà dans ce fichier là où le générateur les écrit. Trois
 * défauts en sortaient, tous mesurés sur la PR #36 :
 *   — A09 · simplicite : la même liste était tapée QUATRE fois dans le dépôt (ici, dans le spec,
 *     dans `docs/gates.json`, dans `ci.yml`) et déjà divergente — le spec n'en couvrait que huit.
 *   — A10 · mutation : retirer une rubrique du générateur faisait tomber la couverture de 9 à 8
 *     **en silence**, la gate annonçant fièrement « 8 rubrique(s) comparée(s) ».
 *   — A10 · mutation : renommer `Bloquées` en `Prochain pas bloqué` la faisait capturer par la
 *     règle de PRÉFIXE des volatiles, et la sortait du contrôle.
 *
 * `comparee` se DÉRIVE désormais : **tout ce qui n'est ni volatile ni le bloc de reprise**. Une
 * rubrique neuve est donc COMPARÉE, et non plus simplement signalée — strictement plus fort, et
 * une liste en moins. C'est le renversement inclusion→exclusion déjà appliqué au gel des outils.
 *
 * ⚠️ Et le PRÉFIXE ne vaut plus que pour les rubriques comparées. Les cinq volatiles se
 * reconnaissent EXACTEMENT : sans quoi une rubrique renommée avec le bon préfixe s'exempte
 * elle-même, ce que `mutation` a joué.
 */
const classer = (titre: string): 'comparee' | 'volatile' | 'reprise' => {
  if (titre === BLOC_DE_REPRISE) return 'reprise';
  if (RUBRIQUES_VOLATILES.some(([r]) => titre === r)) return 'volatile';
  return 'comparee';
};

/**
 * LES MESURES DU DOMAINE. REQ-GOV-032 exige que l'écart soit nommé « en unités du domaine —
 * nombre de tâches livrées, nombre d'exigences — et non "les deux fichiers diffèrent" ». Elles
 * sont LUES dans les deux textes et confrontées deux à deux ; aucune n'est écrite en dur.
 */
function mesures(texte: string): Map<string, string> {
  const m = new Map<string, string>();
  const lire = (re: RegExp, ...noms: string[]) => {
    const r = re.exec(texte);
    if (r) noms.forEach((n, i) => { if (r[i + 1] !== undefined) m.set(n, r[i + 1]!); });
  };
  lire(/^(\d+)\/(\d+) tâches terminées · reste ([\d.]+) j estimés\.$/m,
    'tâches terminées en phase courante', 'tâches de la phase courante', 'jours restants en phase courante');
  lire(/^\| Où en est la phase \? \| phase (-?\d+) — (\d+)\/(\d+) tâches, reste ([\d.]+) j \|$/m,
    'phase courante (bloc de reprise)', 'tâches terminées (bloc de reprise)', 'tâches de la phase (bloc de reprise)', 'jours restants (bloc de reprise)');
  lire(/^\| Ce qui bloque \| (\d+) tâche\(s\) bloquée\(s\) ou en attente externe · (\d+) question\(s\) pour Will \|$/m,
    'tâches bloquées ou en attente (bloc de reprise)', 'questions ouvertes pour Will (bloc de reprise)');
  lire(/^\*\*([\d.]+) j\*\* sur (\d+) taches enchainees/m, 'jours du chemin critique', 'tâches du chemin critique');
  lire(/^Reste sur ce chemin : \*\*([\d.]+) j\*\*\.$/m, 'jours restants sur le chemin critique');
  lire(/^(\d+) décisions portent une hypothèse datée/m, 'décisions à hypothèse posée');
  for (const s of ['a_faire', 'en_cours', 'en_revue', 'fusionnee', 'deployee', 'verifiee', 'bloquee', 'attente_externe']) {
    lire(new RegExp(`^\\| \`${s}\` \\| (\\d+) \\|`, 'm'), `tâches \`${s}\``);
  }
  m.set('tâches nommées sous « Bloquées »', String((texte.match(/^- \*\*[A-Z]+-[A-Za-z0-9-]+\*\* — /gm) ?? []).length));
  m.set('entrées de journal rendues', String((texte.match(/^### PR #\d+ — /gm) ?? []).length));
  return m;
}

interface Ecart { famille: string; message: string }

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

/** Le verdict : ce que le disque porte, confronté à ce que les sources produisent À L'INSTANT. */
function comparer(attendu: string, surDisque: string): { ecarts: Ecart[]; lignesComparees: number; lignesExemptees: [string, string][]; prosesExemptees: [string, string][] } {
  // 🔴 CE COMPTEUR EST MESURÉ, PAS DÉCLARÉ. La première rédaction affichait
  // `LIGNES_DE_REPRISE_COMPAREES.length` — une constante. A09 · securite : « le même défaut que
  // celui que la PR vient corriger, déplacé d'un cran : un chiffre qui a l'air d'une mesure et qui
  // est une déclaration. »
  let lignesComparees = 0;
  // 🔴 LE VERT DOIT ÉNUMÉRER SA POPULATION, PAS SEULEMENT LA COMPTER. Il nommait les cinq
  // rubriques exemptées et TAISAIT les lignes et la prose — dont deux listes nées au tour
  // précédent — tout en annonçant « 3 lignes CONFRONTÉES » sur un bloc qui en porte neuf
  // (A09 · simplicite et A09 · securite, indépendamment). « Un compteur qui n'énumère pas sa
  // population dit toujours qu'elle est couverte. »
  const lignesExemptees: [string, string][] = [];
  const prosesExemptees: [string, string][] = [];
  const ecarts: Ecart[] = [];

  // 1. LES MESURES DU DOMAINE d'abord : ce sont elles qui apprennent quelque chose.
  const mA = mesures(attendu);
  const mD = mesures(surDisque);
  for (const [nom, valeur] of mA) {
    const vu = mD.get(nom);
    if (vu === undefined) ecarts.push({ famille: 'mesure_absente', message: `${nom} : introuvable dans la vue sur le disque, ses sources en produisent ${valeur}` });
    else if (vu !== valeur) ecarts.push({ famille: 'vue_perimee', message: `${nom} : la vue sur le disque dit ${vu}, ses sources produisent ${valeur}` });
  }

  // 2. LA STRUCTURE : la même rubrique des deux côtés.
  //
  // 🔴 LA FAMILLE `rubrique_non_classee` A DISPARU, ET C'EST VOULU. Elle ne pouvait plus tirer :
  // depuis que `comparee` se DÉRIVE (« ni volatile, ni le bloc de reprise »), aucune rubrique
  // n'est « inconnue » — une rubrique neuve est COMPARÉE, ce qui est strictement plus fort que
  // signalée. La garder aurait été du code mort affirmant une couverture qu'il n'a pas, le défaut
  // même que A09 · simplicite a relevé sur le dédoublonnage de cette fonction.
  const rA = decouper(attendu);
  const rD = decouper(surDisque);
  /**
   * 🔴 UNE RUBRIQUE DUPLIQUÉE N'ÉTAIT NI COMPARÉE NI SIGNALÉE. `includes()` teste une appartenance
   * et `find()` rend la PREMIÈRE occurrence : une seconde rubrique « Bloquées » disant l'inverse de
   * la première passait, exit 0 (A09 · securite, trois variantes mesurées).
   *
   * Cette PR venait pourtant d'établir que le doublon est un refus — trente lignes plus bas, au
   * niveau des LIGNES seulement. La règle vaut aux deux étages, comme le reste de la doctrine.
   */
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

  // 3. LE CORPS des rubriques comparables, OCTET PAR OCTET.
  for (const r of rA) {
    if (classer(r.titre) !== 'comparee') continue;
    const surPlace = rD.find((x) => x.titre === r.titre);
    if (!surPlace || surPlace.corps === r.corps) continue;
    ecarts.push({ famille: 'vue_perimee', message: `rubrique « ${r.titre} » : ${premiereDifference(r.corps, surPlace.corps)}` });
  }

  // 4. LE BLOC DE REPRISE, ligne à ligne : il mélange les tâches et la forge.
  //
  // Non déclaré ⇒ COMPARÉ, comme au niveau des rubriques. La provenance se teste AVANT le
  // classement : une ligne présente d'un seul côté est nommée par sa PROVENANCE, jamais renvoyée
  // à la liste blanche de la garde. Le message précédent disait « classe-la dans
  // scripts/plan-state/build.ts » à une ligne insérée à la main — il enseignait le contournement
  // (A09 · simplicite).
  const blocA = rA.find((r) => r.titre === BLOC_DE_REPRISE);
  const blocD = rD.find((r) => r.titre === BLOC_DE_REPRISE);
  if (blocA && blocD) {
    const question = (l: string) => (l.startsWith('|') ? (l.split('|')[1] ?? '').trim() : null);
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
      const attendu = qA.get(q);
      const vue = qD.get(q);
      // LA PROVENANCE D'ABORD. Une ligne qui n'existe que d'un côté est un écart, quel que soit
      // son classement — et le dire ainsi évite d'inviter l'auteur à l'exempter.
      if (attendu === undefined) {
        ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la ligne « ${q} » est sur le disque et n'est produite par AUCUNE source` });
        continue;
      }
      if (vue === undefined) {
        ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la ligne « ${q} » est produite par les sources et ABSENTE de la vue sur le disque` });
        continue;
      }
      const exemptee = LIGNES_EXEMPTEES.find(([r]) => r === q);
      if (exemptee) { lignesExemptees.push(exemptee); continue; }
      lignesComparees += 1;
      if (vue !== attendu) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, ligne « ${q} » : la vue sur le disque dit « ${vue.slice(0, 160)} », ses sources produisent « ${attendu.slice(0, 160)} »` });
    }

    // LA PROSE, des deux côtés, PRÉSENCE COMPRISE.
    // 🔴 La rédaction précédente vérifiait qu'une prose était DÉCLARÉE, jamais qu'elle était
    // PRÉSENTE : supprimer entièrement la ligne du disque passait, exit 0 (A09 · securite).
    const proses = (corps: string) => corps.split('\n').filter((l) => l.trim() !== '' && question(l) === null);
    const pA = proses(blocA.corps);
    const pD = proses(blocD.corps);
    const cle = (l: string) => {
      const d = PROSES_EXEMPTEES.find(([x]) => l.trimStart().startsWith(x));
      return d ? d[0] : l.trim();
    };
    /**
     * 🔴 UNE PROSE SUPPLÉMENTAIRE PORTANT LE PRÉFIXE BÉNI ÉTAIT INVISIBLE (A10 · mutation) : deux
     * proses de même clé, `find()` rend la première, la seconde n'est jamais confrontée. C'est le
     * doublon, à l'étage de la prose — et cette PR a déjà établi deux fois que le doublon est un
     * refus. La règle vaut aux trois étages.
     */
    for (const [ou, liste] of [['ce que produisent les sources', pA], ['la vue sur le disque', pD]] as [string, string[]][]) {
      const vues = new Set<string>();
      for (const l of liste) {
        const c = cle(l);
        if (vues.has(c)) ecarts.push({ famille: 'prose_dupliquee', message: `bloc de reprise, ${ou} : deux proses commencent par « ${c.slice(0, 50)} » — laquelle fait foi ? Aucune : corrige la source.` });
        vues.add(c);
      }
    }
    for (const c of new Set([...pA.map(cle), ...pD.map(cle)])) {
      const a = pA.find((l) => cle(l) === c);
      const d = pD.find((l) => cle(l) === c);
      if (a === undefined) { ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la prose « ${c.slice(0, 60)} » est sur le disque et n'est produite par AUCUNE source` }); continue; }
      if (d === undefined) { ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la prose « ${c.slice(0, 60)} » est produite par les sources et ABSENTE de la vue sur le disque` }); continue; }
      const exemptee = PROSES_EXEMPTEES.find(([x]) => x === c);
      if (exemptee) { prosesExemptees.push(exemptee); continue; }
      lignesComparees += 1;
      if (a !== d) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, prose « ${c.slice(0, 60)} » : la vue sur le disque et ses sources diffèrent` });
    }
  }

  return { ecarts, lignesComparees, lignesExemptees, prosesExemptees };
}

// ── les deux modes ───────────────────────────────────────────────────────────
const rendu = lignes.join('\n') + '\n';

if (MODE_VERIFIER) {
  // Ce mode N'ÉCRIT RIEN : une garde qui répare ce qu'elle contrôle est toujours verte.
  if (!existsSync(CHEMIN_VUE)) {
    console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} est ABSENT : il n’y a rien à comparer. Tape \`pnpm plan-state:build\`.`);
    process.exitCode = 1;
  } else {
    const { ecarts, lignesComparees, lignesExemptees, prosesExemptees } = comparer(rendu, readFileSync(CHEMIN_VUE, 'utf8'));
    if (ecarts.length > 0) {
      console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} a DÉRIVÉ de ses sources : ${ecarts.length} écart(s).`);
      for (const e of ecarts.slice(0, 20)) console.error(`   [${e.famille}] ${e.message}`);
      if (ecarts.length > 20) console.error(`   … et ${ecarts.length - 20} autre(s).`);
      console.error(
        '   Cette vue est DÉRIVÉE : tape `pnpm plan-state:build` pour la régénérer. Si le chiffre te ' +
          'surprend, c’est la SOURCE qu’il faut corriger (`docs/tasks.json` par `pnpm lot:cloture`, ' +
          '`docs/DECISIONS.md`, `docs/journal/`) — jamais la vue à la main.\n' +
          '   ⚠️ SECONDE ISSUE, si l’élément est RÉELLEMENT volatile — dérivé d’une source vivante ' +
          'que le dépôt ne fige pas : déclare-le dans `scripts/plan-state/build.ts` AVEC SON MOTIF ' +
          '(`RUBRIQUES_VOLATILES`, `LIGNES_EXEMPTEES` ou `PROSES_EXEMPTEES`). Le vert l’imprimera. ' +
          'Sans cette issue, un rouge que régénérer ne calme pas est un rouge qu’on apprend à sauter.'
      );
      process.exitCode = 1;
    } else {
      const decoupe = decouper(rendu);
      const comparees = decoupe.filter((r) => classer(r.titre) === 'comparee');
      // 🔴 LE COMPTE ÉTAIT MESURÉ, LES NOMS RESTAIENT LA LISTE DÉCLARÉE. Depuis que `classer`
      // exige l'égalité EXACTE, renommer une rubrique volatile la bascule du côté comparé : la
      // gate rougirait à chaque changement de forge pendant que le vert continuerait de la citer
      // comme non comparée (A09 · simplicite). Les noms se dérivent donc du RENDU, comme le compte.
      const volatilesVues = decoupe
        .filter((r) => classer(r.titre) === 'volatile')
        .map((r) => [r.titre, RUBRIQUES_VOLATILES.find(([x]) => x === r.titre)?.[1] ?? '(motif absent)'] as [string, string]);
      console.log(
        `✅ plan-state:verifier — ${CHEMIN_VUE} est égal à ce que ses sources produisent : ` +
          `${comparees.length} rubrique(s) comparée(s) octet par octet, ${lignesComparees} ligne(s) du bloc de reprise CONFRONTÉES, ` +
          `${mesures(rendu).size} mesure(s) du domaine.`
      );
      const rendreExemptions = (quoi: string, l: [string, string][]) =>
        l.length ? `   NON COMPARÉ — ${quoi} : ${l.map(([r, motif]) => `« ${r} » (${motif})`).join(' · ')}.` : null;
      for (const ligne of [
        rendreExemptions('rubriques', volatilesVues),
        rendreExemptions('lignes du bloc de reprise', lignesExemptees),
        rendreExemptions('prose du bloc de reprise', prosesExemptees),
      ]) if (ligne) console.log(ligne);
    }
  }
} else {
  writeFileSync(CHEMIN_VUE, rendu);
  console.log(`PLAN-STATE régénéré — phase ${phaseCourante}, ${enCours.length} en cours, ${questions.length} question(s) ouverte(s).`);
  if (questions.length > PLAFOND_QUESTIONS) process.exitCode = 1;
}
