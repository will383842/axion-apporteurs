/**
 * gov-attestation.ts — RÉSOUDRE, en ligne, CHAQUE attestation du backlog. (GOV-038)
 *
 * USAGE : pnpm gov:attestation --en-ligne
 *         …--taches <chemin>   lit un AUTRE backlog que celui du dépôt
 *
 * `--taches` existe pour la même raison que le `--out` des générateurs de vues : sans lui, ce
 * contrôle ne pourrait être éprouvé qu'en modifiant `docs/tasks.json`, fichier réservé qu'un
 * développeur n'écrit pas, et il resterait donc « jamais vu marcher » jusqu'au jour où il compte.
 *
 * 🔴 LA POPULATION EST TOUTES LES ATTESTATIONS, LOCALES COMPRISES (veto sécurité 5328941794, PR
 * 168). Ce script filtrait `repo !== DEPOT_LOCAL` : écrit quand seules les livraisons d'AILLEURS
 * portaient une attestation (GOV-038), il est resté tel quand l'attestation s'est étendue à ce
 * dépôt. Le backlog est passé de 1 à 78 attestations ; ce contrôle en résolvait UNE. Mesuré sur
 * e8369ab : une tâche SENSIBLE de ce dépôt avec un SHA à quarante zéros → « ✅ les 1
 * attestation(s) résolvent », sortie 0.
 * *Un filtre écrit pour une population ne suit pas la population quand elle change.* La règle
 * vit désormais dans `resoudreAttestations` (`scripts/lot/attestation.ts`), pure, éprouvée par
 * `un-statut-fusionnee-porte-sa-preuve.spec.ts` sur une forge et un git SIMULÉS (RM-11) ; ce
 * fichier ne fait que brancher les vues réelles et imprimer.
 *
 * ⚠️ CE CONTRÔLE N'EST NI DANS `pnpm test`, NI DANS `pnpm gov:partiel`, NI DANS LA CI, ET C'EST
 * DÉLIBÉRÉ. Il interroge la forge. Une garde qui lance `gh` fait dépendre son verdict du réseau,
 * d'un jeton, d'un quota et de la visibilité d'un dépôt : mesuré le 2026-09-05 sur cet arbre, cinq
 * spécifications qui lançaient `gh` ont fait rendre à `pnpm test` 1, puis 0, puis 0 sans qu'une
 * ligne ait changé. Une valeur dérivée d'une source non reproductible n'est pas dérivée, elle est
 * ÉCHANTILLONNÉE — et un verdict échantillonné qu'on croit déterministe est pire qu'un contrôle
 * absent, parce qu'on cesse de le lire.
 *
 * LE PARTAGE EST DONC EXPLICITE :
 *
 *   — `pnpm gov:tasks` (déterministe, bloquant, en CI, sans réseau) juge la FORME et ce qui se
 *     ferme sans forge : SHA de quarante hexadécimaux, instant UTC non postérieur à la passe, pas
 *     de `pr` nu hors dépôt, pas d'attestation locale sans `pr` ;
 *   — ce script (non déterministe, à la main) juge la RÉSOLUTION : pour une tâche d'ici, git
 *     connaît le SHA comme commit ET comme ancêtre de la branche par défaut ; pour une tâche
 *     d'ailleurs, la forge de son dépôt connaît le commit ; pour toutes, la PR citée est
 *     FUSIONNÉE, par CE commit, à CET instant.
 *
 * L'AFFAIBLISSEMENT HORS LIGNE EST NOMMÉ PLUTÔT QUE TU : un SHA de quarante hexadécimaux qui ne
 * désigne AUCUN commit — d'ici comme d'ailleurs —, ou un commit d'ici qui existe mais n'est pas
 * celui de la PR citée, passent `gov:tasks`. Un oracle `git cat-file` hors ligne pour le SHA
 * d'ici a existé (famille `attestation_sha_etranger`) et a été RETIRÉ (PR 168, run
 * 36298491294) : il rougissait les attestations justes partout où le clone n'a pas l'historique
 * complet — les dépôts jetables des témoins d'effet, en CI comme en local. Le rattrapage est ici. Il se lance après toute clôture de lot
 * et avant toute publication d'un état d'avancement qui s'appuie dessus.
 *
 * UNE FORGE ILLISIBLE EST UNE FAUTE : échec fermé, jamais « rien à redire faute de réponse ».
 *
 * LE SCRIPT REFUSE DE TOURNER SANS `--en-ligne`. Sans ce refus, quelqu'un le câblerait un jour dans
 * une chaîne « pour être complet », et la suite entière deviendrait intermittente.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  numeroDuSujet,
  resoudreAttestations,
  versUtcSeconde,
  type ReponseForge,
  type SituationGit,
  type TacheAttestable,
} from '../lot/attestation';
import { LIVREE } from '../lot/avancement';

const iTaches = process.argv.indexOf('--taches');
const CHEMIN_TACHES =
  iTaches >= 0 ? (process.argv[iTaches + 1] ?? 'docs/tasks.json') : 'docs/tasks.json';

/** La branche par défaut telle que CET arbre la connaît. Le contrôle ne la rafraîchit pas : il la NOMME. */
const BRANCHE = 'origin/main';

if (!process.argv.includes('--en-ligne')) {
  console.error(
    "❌ gov:attestation — ce contrôle INTERROGE la forge et ne s'exécute qu'avec `--en-ligne`.\n" +
      "   Il n'a pas sa place dans `pnpm test`, `pnpm gov:partiel` ni la CI : son verdict dépendrait\n" +
      '   du réseau, d’un jeton et d’un quota. La forme des attestations est jugée, elle, par\n' +
      '   `pnpm gov:tasks` — déterministe, bloquante, et sans aucun appel sortant.'
  );
  process.exit(2);
}

if (!existsSync(CHEMIN_TACHES)) {
  console.error(`❌ gov:attestation — ${CHEMIN_TACHES} est introuvable.`);
  process.exit(1);
}

const doc = JSON.parse(readFileSync(CHEMIN_TACHES, 'utf8')) as { taches: TacheAttestable[] };

const forge = (chemin: string): ReponseForge => {
  try {
    return {
      ok: true,
      corps: JSON.parse(
        execFileSync('gh', ['api', chemin], { encoding: 'utf8', stdio: 'pipe' })
      ) as unknown,
    };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message.split('\n')[0] ?? 'sans message' };
  }
};

/** Le code de sortie de git, sans lever : 0 = oui, 1 = non, autre = git n'a pas su. */
const statutGit = (args: string[]): number => {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return 0;
  } catch (e) {
    return (e as { status?: number | null }).status ?? -1;
  }
};

const brancheLisible = statutGit(['rev-parse', '--verify', '--quiet', BRANCHE]) === 0;

/**
 * GOV-154 — LE SQUASH SE LIT, IL NE S'ÉCRIT PAS. Les sujets de la branche par défaut, lus UNE fois :
 * « (#n) » en fin de sujet désigne le commit squashé de la PR n (le plus récent l'emporte). Une
 * branche illisible laisse la table vide : la pendante est alors SAUTÉE et nommée, jamais résolue.
 */
const squashs = new Map<number, string>();
if (brancheLisible) {
  const brut = execFileSync('git', ['log', '--format=%H%x1f%s', BRANCHE], {
    encoding: 'utf8',
    maxBuffer: 256e6,
  });
  for (const ligne of brut.split(/\r?\n/)) {
    const [sha = '', sujet = ''] = ligne.split('\x1f');
    const n = numeroDuSujet(sujet);
    if (n !== null && !squashs.has(n)) squashs.set(n, sha);
  }
}
const fusionDeLaPr = (pr: number): string | null => squashs.get(pr) ?? null;
const situer = (sha: string): SituationGit => {
  if (!brancheLisible) return 'illisible';
  if (statutGit(['cat-file', '-e', `${sha}^{commit}`]) !== 0) return 'absent';
  const s = statutGit(['merge-base', '--is-ancestor', sha, BRANCHE]);
  return s === 0 ? 'ancetre' : s === 1 ? 'hors_branche' : 'illisible';
};

const dateDuCommit = (sha: string): string | null => {
  try {
    return versUtcSeconde(
      execFileSync('git', ['show', '-s', '--format=%cI', sha], { encoding: 'utf8' }).trim()
    );
  } catch {
    return null;
  }
};

const r = resoudreAttestations(
  doc.taches,
  { brancheParDefaut: BRANCHE, forge, situer, dateDuCommit, fusionDeLaPr },
  (t) => LIVREE.has(t.statut)
);

// TÉMOIN POSITIF. « 0 échec » et « 0 attestation lue » sont indiscernables dans un journal, et le
// second est exactement le mode d'échec qu'a eu ce contrôle : un filtre sur une population morte.
console.log(
  `gov:attestation — ${r.population} attestation(s) à résoudre sur ${doc.taches.length} tâches ` +
    `(branche de référence : ${BRANCHE}${brancheLisible ? '' : ' — ILLISIBLE'}).`
);
// CE QUE LE CONTRÔLE SAUTE, NOMMÉ À CHAQUE PASSAGE : jamais un périmètre silencieux.
console.log(
  `   SAUTÉ — ${r.sautees.length} tâche(s) livrée(s) sans attestation, donc sans rien à résoudre :`
);
r.sautees.forEach((s) => console.log(`     · ${s.id} — ${s.motif}`));
r.resolues.forEach((l) => console.log(`   ✓ ${l}`));

const fautes = r.fautes;
if (fautes.length > 0) {
  console.error(`\n❌ gov:attestation — ${fautes.length} attestation(s) ne résolvent pas :`);
  fautes.forEach((f) => console.error(`   ${f}`));
  process.exit(1);
}

if (r.population === 0) {
  console.log(
    '   Aucune attestation au backlog : rien à résoudre. Ce n’est pas un vert de contrôle.'
  );
  process.exit(0);
}

console.log(
  `\n✅ gov:attestation — les ${r.population} attestation(s) résolvent : ${r.resolues.length} ` +
    `confrontée(s) à git et à la forge, ${r.sautees.length} tâche(s) livrée(s) sautée(s) et nommée(s).`
);
process.exit(0);
