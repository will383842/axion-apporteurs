/**
 * build.ts — régénère docs/PLAN-STATE.md. Le fichier est DÉRIVÉ, jamais écrit à la main.
 *
 * USAGE   : pnpm plan-state:build
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
 * Le test `plan-state-derive.spec.ts` relance ce script et exige que le fichier commité soit identique.
 *
 * INVARIANT : ce script ne DÉCIDE rien. S'il faut changer un statut, on change l'issue, pas le fichier.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { referencePr, type Attestation } from '../lot/attestation';

const PLAFOND_QUESTIONS = 10;

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

writeFileSync('docs/PLAN-STATE.md', lignes.join('\n') + '\n');
console.log(`PLAN-STATE régénéré — phase ${phaseCourante}, ${enCours.length} en cours, ${questions.length} question(s) ouverte(s).`);
if (questions.length > PLAFOND_QUESTIONS) process.exitCode = 1;
