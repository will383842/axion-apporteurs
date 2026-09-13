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
 *   - une tâche dont le `repo` n'est pas celui-ci ne reçoit JAMAIS de `pr` : le numéro d'une PR
 *     d'ailleurs, écrit nu, est rendu `PR#998` par les vues et ne résout pas. Elle reçoit une
 *     `attestation` — { pr, sha entier, fusionneeAt } — et le script REFUSE de clore sans le SHA
 *     du commit de fusion (GOV-038). Fermer en silence sur un SHA manquant écrirait une livraison
 *     que plus personne ne pourrait retrouver.
 *   - le script ne DÉCIDE rien : il transcrit le rendu du workflow. Aucune interprétation.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEPOT_LOCAL,
  controlerAttestation,
  depotDeLaTache,
  referencePr,
  type Attestation,
} from './attestation';

interface Tache {
  id: string; titre: string; statut: string; owner?: string | null; lot?: string | null;
  branch?: string | null; pr?: number | null; attempts?: number; motif?: string | null;
  issue?: number | null; repo?: string; attestation?: Attestation | null;
}

interface Resultat {
  dev?: { taskId?: string; branch?: string; pr?: number | null; stop?: { motif?: string; ref?: string } | null } | null;
  fusion?: { pr?: number | null; sha?: string | null; fusionneeAt?: string | null; atterri?: boolean; motif?: string } | null;
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
  // Le numéro de PR n'est écrit NU que si la tâche vit dans CE dépôt. Ailleurs, il ira dans son
  // attestation, plus bas, avec le SHA qui le rend retrouvable (GOV-038).
  const depotDeCetteTache = t.repo ?? DEPOT_LOCAL;
  if (depotDeCetteTache === DEPOT_LOCAL && r.dev?.pr != null) t.pr = r.dev.pr;
  if (!t.owner && ownerParDefaut) t.owner = ownerParDefaut;

  const atterri = r.fusion?.atterri === true;
  if (!r.refuse && atterri) {
    if (!t.owner || !t.branch) {
      throw new Error(
        `${id} passerait \`fusionnee\` sans owner ni branch — état refusé par le schéma. ` +
          'Passe `--owner <Axx>` (celui de la revendication) et vérifie que le développeur a rendu sa branche.'
      );
    }

    // ── l'attestation inter-dépôt (GOV-038) ──────────────────────────────────
    // Une livraison hors de ce dépôt ne laisse ICI aucune trace : ni PR qui résout, ni commit dans
    // cet historique. Le SHA du commit de fusion est la seule valeur qu'aucun autre dépôt ne
    // réattribue ; sans lui, le backlog affirmerait une livraison introuvable. Le script REFUSE
    // plutôt que d'écrire un `pr` nu — c'est la même doctrine que le refus ci-dessus sur `owner`.
    if (depotDeCetteTache !== DEPOT_LOCAL) {
      const numero = r.fusion?.pr ?? r.dev?.pr ?? null;
      const sha = r.fusion?.sha ?? null;
      const quand = r.fusion?.fusionneeAt ?? null;
      if (numero == null || sha == null || quand == null) {
        throw new Error(
          `${id} vit dans ${depotDeLaTache(t as { repo: string }) ?? `repo « ${depotDeCetteTache} »`} et ` +
            `passerait \`fusionnee\` sans attestation complète : ` +
            `pr=${numero ?? 'absent'}, sha=${sha ?? 'absent'}, fusionneeAt=${quand ?? 'absent'}. ` +
            'Le release manager rend les trois : `gh pr view <n> --json number,mergeCommit,mergedAt` ' +
            'dans le dépôt concerné. Un numéro seul serait rendu `PR#<n>` par les vues et ne résout pas ici.'
        );
      }
      t.pr = null;
      t.attestation = { pr: numero, sha, fusionneeAt: quand };
    }

    t.statut = 'fusionnee';
    t.motif = null;

    // Le script ne s'écrit jamais un état que `pnpm gov:tasks` refuserait : il le vérifie avant de
    // le poser. Sans ce contrôle, la faute serait découverte en CI, sur un fichier déjà commité par
    // le seul écrivain autorisé — et personne d'autre n'a le droit de le corriger.
    const fautes = controlerAttestation(
      { id, repo: depotDeCetteTache, statut: t.statut, pr: t.pr, attestation: t.attestation },
      true
    );
    if (fautes.length > 0) {
      throw new Error(
        `${id} : l'attestation écrite serait refusée par \`pnpm gov:tasks\` —\n` +
          fautes.map((f) => `  [${f.famille}] ${f.message}`).join('\n')
      );
    }

    const ref = referencePr({ id, repo: depotDeCetteTache, statut: t.statut, pr: t.pr, attestation: t.attestation });
    journal.push(`${id} → fusionnee (${ref ?? 'aucune référence de PR'}, sha ${r.fusion?.sha ?? '?'})`);
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
