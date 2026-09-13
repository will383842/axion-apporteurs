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
// pas. Ce qui est fermé, c'est tout ce qui se dérive d'un fichier du dépôt — c'est-à-dire les
// quinze lignes que la lentille a falsifiées.

/** Les rubriques COMPARÉES, octet par octet. Toutes se dérivent de fichiers suivis par git. */
const RUBRIQUES_COMPAREES = [
  '(en-tête)',
  'Phase courante',
  'Tâches',
  'Chemin critique',
  'Bloquées',
  'Questions ouvertes pour Will',
  'Hypothèses par défaut appliquées',
  'Journal',
  'Dette déclarée',
];

/** Les rubriques NON comparables, chacune avec la source vivante qui l'en empêche. */
const RUBRIQUES_VOLATILES: [string, string][] = [
  ['File de fusion', '`gh pr list` — change à chaque ouverture ou fusion de PR'],
  ['Revendications', '`gh issue list` — labels `owner:` posés hors du dépôt'],
  ['Décisions du jour', 'dérivée du JOUR du dernier atterrissage, donc de `origin/main`'],
  ['Prochain pas', 'dépend de la tête de la file de fusion'],
  ['Dernier atterrissage', 'SHA et date d’`origin/main`'],
];

/**
 * Le bloc de reprise MÉLANGE les deux : il résume à la fois `docs/tasks.json` et la forge. On y
 * compare donc LIGNE À LIGNE, par la question posée en première colonne — et une question
 * inconnue rougit, pour la même raison que les rubriques.
 */
const BLOC_DE_REPRISE = 'REPRENDRE EN 30 SECONDES';
const LIGNES_DE_REPRISE_COMPAREES = ['Où en est la phase ?', 'Ce qui bloque', 'Dernière entrée de journal'];
const LIGNES_DE_REPRISE_VOLATILES = ['Question', '---', 'Où est `main` ?', 'Qu’est-ce qui est en vol ?', 'Qui tient quoi ?', 'Le prochain pas'];

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

const classer = (titre: string): 'comparee' | 'volatile' | 'reprise' | 'inconnue' => {
  if (titre === BLOC_DE_REPRISE) return 'reprise';
  if (RUBRIQUES_COMPAREES.some((r) => titre === r || titre.startsWith(r + ' '))) return 'comparee';
  if (RUBRIQUES_VOLATILES.some(([r]) => titre === r || titre.startsWith(r + ' '))) return 'volatile';
  return 'inconnue';
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
function comparer(attendu: string, surDisque: string): Ecart[] {
  const ecarts: Ecart[] = [];

  // 1. LES MESURES DU DOMAINE d'abord : ce sont elles qui apprennent quelque chose.
  const mA = mesures(attendu);
  const mD = mesures(surDisque);
  for (const [nom, valeur] of mA) {
    const vu = mD.get(nom);
    if (vu === undefined) ecarts.push({ famille: 'mesure_absente', message: `${nom} : introuvable dans la vue sur le disque, ses sources en produisent ${valeur}` });
    else if (vu !== valeur) ecarts.push({ famille: 'vue_perimee', message: `${nom} : la vue sur le disque dit ${vu}, ses sources produisent ${valeur}` });
  }

  // 2. LA STRUCTURE : toute rubrique doit être classée, des deux côtés.
  const rA = decouper(attendu);
  const rD = decouper(surDisque);
  for (const [ou, liste] of [['la vue sur le disque', rD], ['ses sources', rA]] as const) {
    for (const r of liste) {
      if (classer(r.titre) === 'inconnue') {
        ecarts.push({
          famille: 'rubrique_non_classee',
          message: `rubrique « ${r.titre} » dans ${ou} : elle n’est ni déclarée comparable ni déclarée volatile dans ${
            'scripts/plan-state/build.ts'
          } — classe-la, sinon elle n’est comparée à rien`,
        });
      }
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
  const blocA = rA.find((r) => r.titre === BLOC_DE_REPRISE);
  const blocD = rD.find((r) => r.titre === BLOC_DE_REPRISE);
  if (blocA && blocD) {
    const question = (l: string) => (l.startsWith('|') ? (l.split('|')[1] ?? '').trim() : null);
    const lignesD = new Map(blocD.corps.split('\n').map((l) => [question(l), l] as const));
    for (const l of blocA.corps.split('\n')) {
      const q = question(l);
      if (q === null) continue;
      if (LIGNES_DE_REPRISE_VOLATILES.includes(q)) continue;
      if (!LIGNES_DE_REPRISE_COMPAREES.includes(q)) {
        ecarts.push({ famille: 'ligne_de_reprise_non_classee', message: `bloc de reprise, ligne « ${q} » : ni comparable ni volatile — classe-la dans scripts/plan-state/build.ts` });
        continue;
      }
      const vue = lignesD.get(q);
      if (vue === undefined) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise : la ligne « ${q} » est absente de la vue sur le disque` });
      else if (vue !== l) ecarts.push({ famille: 'vue_perimee', message: `bloc de reprise, ligne « ${q} » : la vue sur le disque dit « ${vue.slice(0, 160)} », ses sources produisent « ${l.slice(0, 160)} »` });
    }
  }

  // Un même écart nommé deux fois (mesure ET corps de rubrique) n'apprend rien de plus.
  const vus = new Set<string>();
  return ecarts.filter((e) => (vus.has(e.message) ? false : (vus.add(e.message), true)));
}

// ── les deux modes ───────────────────────────────────────────────────────────
const rendu = lignes.join('\n') + '\n';

if (MODE_VERIFIER) {
  // Ce mode N'ÉCRIT RIEN : une garde qui répare ce qu'elle contrôle est toujours verte.
  if (!existsSync(CHEMIN_VUE)) {
    console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} est ABSENT : il n’y a rien à comparer. Tape \`pnpm plan-state:build\`.`);
    process.exitCode = 1;
  } else {
    const ecarts = comparer(rendu, readFileSync(CHEMIN_VUE, 'utf8'));
    if (ecarts.length > 0) {
      console.error(`❌ plan-state:verifier — ${CHEMIN_VUE} a DÉRIVÉ de ses sources : ${ecarts.length} écart(s).`);
      for (const e of ecarts.slice(0, 20)) console.error(`   [${e.famille}] ${e.message}`);
      if (ecarts.length > 20) console.error(`   … et ${ecarts.length - 20} autre(s).`);
      console.error(
        '   Cette vue est DÉRIVÉE : tape `pnpm plan-state:build` pour la régénérer. Si le chiffre te ' +
          'surprend, c’est la SOURCE qu’il faut corriger (`docs/tasks.json` par `pnpm lot:cloture`, ' +
          '`docs/DECISIONS.md`, `docs/journal/`) — jamais la vue à la main.'
      );
      process.exitCode = 1;
    } else {
      const comparees = decouper(rendu).filter((r) => classer(r.titre) === 'comparee');
      console.log(
        `✅ plan-state:verifier — ${CHEMIN_VUE} est égal à ce que ses sources produisent : ` +
          `${comparees.length} rubrique(s) comparée(s) octet par octet, ${LIGNES_DE_REPRISE_COMPAREES.length} ligne(s) du bloc de reprise, ` +
          `${mesures(rendu).size} mesure(s) du domaine.`
      );
      console.log(
        `   NON COMPARÉ, et dit plutôt que tu : ${RUBRIQUES_VOLATILES.map(([r, motif]) => `« ${r} » (${motif})`).join(' · ')}.`
      );
    }
  }
} else {
  writeFileSync(CHEMIN_VUE, rendu);
  console.log(`PLAN-STATE régénéré — phase ${phaseCourante}, ${enCours.length} en cours, ${questions.length} question(s) ouverte(s).`);
  if (questions.length > PLAFOND_QUESTIONS) process.exitCode = 1;
}
