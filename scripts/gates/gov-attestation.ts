/**
 * gov-attestation.ts — RÉSOUDRE, en ligne, les attestations inter-dépôt du backlog. (GOV-038)
 *
 * USAGE : pnpm gov:attestation --en-ligne
 *         …--taches <chemin>   lit un AUTRE backlog que celui du dépôt
 *
 * `--taches` existe pour la même raison que le `--out` des générateurs de vues : sans lui, ce
 * contrôle ne pourrait être éprouvé qu'en modifiant `docs/tasks.json`, fichier réservé qu'un
 * développeur n'écrit pas, et il resterait donc « jamais vu marcher » jusqu'au jour où il compte.
 *
 * ⚠️ CE CONTRÔLE N'EST NI DANS `pnpm test`, NI DANS `pnpm gov:check`, NI DANS LA CI, ET C'EST
 * DÉLIBÉRÉ. Il interroge la forge. Une garde qui lance `gh` fait dépendre son verdict du réseau,
 * d'un jeton, d'un quota et de la visibilité d'un dépôt : mesuré le 2026-09-05 sur cet arbre, cinq
 * spécifications qui lançaient `gh` ont fait rendre à `pnpm test` 1, puis 0, puis 0 sans qu'une
 * ligne ait changé. Une valeur dérivée d'une source non reproductible n'est pas dérivée, elle est
 * ÉCHANTILLONNÉE — et un verdict échantillonné qu'on croit déterministe est pire qu'un contrôle
 * absent, parce qu'on cesse de le lire.
 *
 * LE PARTAGE EST DONC EXPLICITE :
 *
 *   — `pnpm gov:tasks` (déterministe, bloquant, en CI) juge la FORME : le champ existe là où il
 *     doit, le SHA a quarante hexadécimaux, la date est un instant UTC, aucun `pr` nu hors dépôt ;
 *   — ce script (non déterministe, à la main) juge la RÉSOLUTION : ce SHA-là désigne un commit
 *     réel de ce dépôt-là, et la PR qu'il cite porte bien ce commit de fusion.
 *
 * L'AFFAIBLISSEMENT DE LA PREMIÈRE EST NOMMÉ PLUTÔT QUE TU : un SHA de quarante hexadécimaux qui
 * ne désigne rien passe `gov:tasks`. C'est le prix du déterminisme, et le rattrapage est ici. Il
 * se lance après toute clôture de lot portant une tâche `repo` ≠ `partners`, et avant toute
 * publication d'un état d'avancement qui s'appuie dessus.
 *
 * LE SCRIPT REFUSE DE TOURNER SANS `--en-ligne`. Sans ce refus, quelqu'un le câblerait un jour dans
 * `gov:check` « pour être complet », et la suite entière deviendrait intermittente.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DEPOT_LOCAL, MOTIF_SHA, depotDeLaTache, type Attestation } from '../lot/attestation';

const iTaches = process.argv.indexOf('--taches');
const CHEMIN_TACHES = iTaches >= 0 ? (process.argv[iTaches + 1] ?? 'docs/tasks.json') : 'docs/tasks.json';

type Tache = { id: string; repo: string; statut: string; attestation?: Attestation | null };

if (!process.argv.includes('--en-ligne')) {
  console.error(
    "❌ gov:attestation — ce contrôle INTERROGE la forge et ne s'exécute qu'avec `--en-ligne`.\n" +
      "   Il n'a pas sa place dans `pnpm test`, `pnpm gov:check` ni la CI : son verdict dépendrait\n" +
      "   du réseau, d'un jeton et d'un quota. La forme des attestations est jugée, elle, par\n" +
      '   `pnpm gov:tasks` — déterministe, bloquante, et sans aucun appel sortant.'
  );
  process.exit(2);
}

if (!existsSync(CHEMIN_TACHES)) {
  console.error(`❌ gov:attestation — ${CHEMIN_TACHES} est introuvable.`);
  process.exit(1);
}

const doc = JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: Tache[] };
const attestees = doc.taches.filter((t) => t.repo !== DEPOT_LOCAL && t.attestation);

// TÉMOIN POSITIF. « 0 échec » et « 0 attestation lue » sont indiscernables dans un journal de CI,
// et le second est le mode d'échec le plus probable d'un contrôle qui filtre sur deux champs.
console.log(`gov:attestation — ${attestees.length} attestation(s) à résoudre sur ${doc.taches.length} tâches.`);
if (attestees.length === 0) {
  console.log('   Aucune tâche livrée hors de ce dépôt : rien à résoudre. Ce n’est pas un vert de contrôle.');
  process.exit(0);
}

const gh = (chemin: string): { ok: true; corps: unknown } | { ok: false; erreur: string } => {
  try {
    return { ok: true, corps: JSON.parse(execFileSync('gh', ['api', chemin], { encoding: 'utf8' })) as unknown };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message.split('\n')[0] ?? 'sans message' };
  }
};

const fautes: string[] = [];

for (const t of attestees) {
  const a = t.attestation!;
  const depot = depotDeLaTache(t);
  if (depot === null) {
    fautes.push(`${t.id} — repo « ${t.repo} » ne désigne aucun dépôt de forge : rien à résoudre.`);
    continue;
  }
  if (!MOTIF_SHA.test(a.sha)) {
    fautes.push(`${t.id} — « ${a.sha} » n'a pas la forme d'un SHA ; \`pnpm gov:tasks\` le dit déjà.`);
    continue;
  }

  const commit = gh(`repos/${depot}/commits/${a.sha}`);
  if (!commit.ok) {
    fautes.push(`${t.id} — le commit ${a.sha} est INTROUVABLE dans ${depot} (${commit.erreur}).`);
    continue;
  }

  const pr = gh(`repos/${depot}/pulls/${a.pr}`);
  if (!pr.ok) {
    fautes.push(`${t.id} — la PR ${depot}#${a.pr} est introuvable (${pr.erreur}).`);
    continue;
  }
  const p = pr.corps as { merge_commit_sha?: string; merged_at?: string | null };
  if (p.merge_commit_sha !== a.sha) {
    fautes.push(
      `${t.id} — ${depot}#${a.pr} a fusionné par ${p.merge_commit_sha ?? 'aucun commit'}, pas par ${a.sha}. ` +
        `Le numéro et le SHA de l'attestation désignent deux choses différentes.`
    );
    continue;
  }
  if (!p.merged_at) {
    fautes.push(`${t.id} — ${depot}#${a.pr} n'est PAS fusionnée, alors que la tâche est « ${t.statut} ».`);
    continue;
  }
  console.log(`   ✓ ${t.id} — ${depot}#${a.pr} fusionnée par ${a.sha.slice(0, 7)} le ${p.merged_at}`);
}

if (fautes.length > 0) {
  console.error(`\n❌ gov:attestation — ${fautes.length} attestation(s) ne résolvent pas :`);
  fautes.forEach((f) => console.error(`   ${f}`));
  process.exit(1);
}

console.log(`\n✅ gov:attestation — les ${attestees.length} attestation(s) résolvent dans leur dépôt.`);
process.exit(0);
