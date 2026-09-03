/**
 * cloture.ts — écrit dans `docs/tasks.json` le résultat d'un lot. C'est le SEUL écrivain de statut.
 *
 * USAGE   : pnpm lot:cloture -- --lot <lotId> [--owner <Axx>] [--commit]
 * ENTRÉES : docs/lots/<lotId>/lot.json · docs/lots/<lotId>/resultat.json (le rendu du workflow, écrit
 *           tel quel par la session à la fin de l'étape 4 du SKILL)
 * SORTIE  : docs/tasks.json mis à jour (statut, pr, branch, owner, lot, attempts, motif)
 *
 * POURQUOI CE SCRIPT EXISTE
 *   L'éligibilité du composeur et tout PLAN-STATE se calculent sur `t.statut` lu dans `docs/tasks.json`.
 *   Le SKILL ne mettait à jour que des LABELS d'issue, et le workflow n'écrivait rien : au deuxième
 *   `/lot`, les tâches fusionnées étaient encore `a_faire`, le composeur recomposait le même lot, et
 *   PLAN-STATE affichait « 0/25 terminées » à vie. Les labels d'issue restent une VUE ; la source des
 *   statuts est ce fichier, et cet écrivain-ci.
 *
 * INVARIANTS
 *   - une tâche n'est `fusionnee` que si sa PR a ATTERRI (`fusion.atterri === true`) : une PR fusionnée
 *     dont l'atterrissage n'est pas vérifié n'est pas une tâche livrée.
 *   - une tâche non livrée repart `a_faire` avec `attempts++`, et bascule `bloquee` à la deuxième.
 *   - `fusionnee` exige `owner` et `branch` (schéma) : le script REFUSE d'écrire un état invalide.
 *   - le script ne DÉCIDE rien : il transcrit le rendu du workflow. Aucune interprétation.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

interface Tache {
  id: string; titre: string; statut: string; owner?: string | null; lot?: string | null;
  branch?: string | null; pr?: number | null; attempts?: number; motif?: string | null;
  issue?: number | null;
}

interface Resultat {
  dev?: { taskId?: string; branch?: string; pr?: number | null; stop?: { motif?: string; ref?: string } | null } | null;
  fusion?: { pr?: number | null; sha?: string | null; atterri?: boolean; motif?: string } | null;
  refuse?: boolean;
  motif?: string;
}

function arg(nom: string, defaut?: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  const suivant = i >= 0 ? process.argv[i + 1] : undefined;
  if (suivant && !suivant.startsWith('--')) return suivant;
  if (defaut !== undefined) return defaut;
  throw new Error(`Argument --${nom} manquant.`);
}

const lotId = arg('lot');
const ownerParDefaut = arg('owner', '');
const doitCommiter = process.argv.includes('--commit');

const dossier = join('docs/lots', lotId);
const cheminResultat = join(dossier, 'resultat.json');
if (!existsSync(cheminResultat)) {
  throw new Error(
    `${cheminResultat} absent. Écris-y le rendu JSON du workflow (\`{ lotId, resultats, stops, manques, arret }\`) ` +
      'avant de clôturer : le script transcrit ce rendu, il ne le devine pas.'
  );
}

const rendu = JSON.parse(readFileSync(cheminResultat, 'utf8')) as {
  lotId?: string; resultats?: (Resultat | null)[]; stops?: { tache?: string; motif?: string; ref?: string }[];
};
if (rendu.lotId && rendu.lotId !== lotId) {
  throw new Error(`Le rendu porte le lot ${rendu.lotId}, pas ${lotId}. Refus de clôturer un autre lot.`);
}

const doc = JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as { version: number; taches: Tache[] };
const index = new Map(doc.taches.map((t) => [t.id, t]));

const motifDuStop = new Map((rendu.stops ?? []).map((s) => [s.tache ?? '', `${s.motif ?? 'stop'} — ${s.ref ?? ''}`.trim()]));
const journal: string[] = [];

for (const r of rendu.resultats ?? []) {
  if (!r) continue;
  const id = r.dev?.taskId;
  if (!id) { journal.push('⚠️ un résultat sans `dev.taskId` : ignoré (le workflow a-t-il bien remboîté la fusion ?)'); continue; }
  const t = index.get(id);
  if (!t) { journal.push(`⚠️ ${id} : inconnu de docs/tasks.json — ignoré`); continue; }

  t.lot = lotId;
  if (r.dev?.branch) t.branch = r.dev.branch;
  if (r.dev?.pr != null) t.pr = r.dev.pr;
  if (!t.owner && ownerParDefaut) t.owner = ownerParDefaut;

  const atterri = r.fusion?.atterri === true;
  if (!r.refuse && atterri) {
    if (!t.owner || !t.branch) {
      throw new Error(
        `${id} passerait \`fusionnee\` sans owner ni branch — état refusé par le schéma. ` +
          'Passe `--owner <Axx>` (celui de la revendication) et vérifie que le développeur a rendu sa branche.'
      );
    }
    t.statut = 'fusionnee';
    t.motif = null;
    journal.push(`${id} → fusionnee (PR #${t.pr ?? '?'}, sha ${r.fusion?.sha ?? '?'})`);
    continue;
  }

  // Non livrée : on transcrit POURQUOI, et on recompte la tentative.
  const motif =
    motifDuStop.get(id) ||
    r.motif ||
    (r.dev?.stop ? `${r.dev.stop.motif} — ${r.dev.stop.ref ?? ''}`.trim() : '') ||
    (r.fusion && !atterri ? `fusion non atterrie : ${r.fusion.motif ?? 'motif absent'}` : '') ||
    'refusée en revue, motif absent du rendu';

  t.attempts = (t.attempts ?? 0) + 1;
  if (t.attempts >= 2) {
    t.statut = 'bloquee';
    t.motif = motif;
    journal.push(`${id} → bloquee (${t.attempts} tentatives) — ${motif}`);
  } else {
    t.statut = 'a_faire';
    t.owner = null;
    t.branch = null;
    t.motif = null;
    journal.push(`${id} → a_faire (tentative ${t.attempts}) — ${motif}`);
  }
}

writeFileSync('docs/tasks.json', JSON.stringify(doc, null, 2) + '\n');
console.log(`Clôture du lot ${lotId} :`);
for (const l of journal) console.log(`  ${l}`);

if (doitCommiter) {
  execFileSync('git', ['add', 'docs/tasks.json'], { stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', `chore(lot): clôture ${lotId}`], { stdio: 'inherit' });
}
