/**
 * part-gouvernance.ts — LA PART DE GOUVERNANCE DANS LES COMMITS (GOV-160, décision de Williams du
 * 2026-10-09, #319, commentaire 6077512137). Script SANS IA, en lecture seule.
 *
 * Mesure de départ : 52 % des commits de main étaient de la gouvernance, dont 30 % de rattrapages.
 * Ce rapport rougit au-dessus de SEUIL_POURCENT sur la fenêtre glissante. Il n'est PAS une garde de
 * PR : il tourne chaque semaine (`.github/workflows/part-gouvernance.yml`) et ne bloque aucune fusion.
 *
 * USAGE : pnpm gov:part-gouvernance [--jours 7] [--ref origin/main]
 *
 * Un commit est de GOUVERNANCE si son titre conventionnel nomme une tâche `GOV-…`, ou s'il ne
 * touche QUE des fichiers de processus (docs de gouvernance, registres, gardes, CI) et aucun code
 * produit (`src/`, `prisma/`, `packages/`).
 */
import { execFileSync } from 'node:child_process';

export const SEUIL_POURCENT = 15;

export type CommitLu = { sha: string; titre: string; fichiers: string[] };

const RACINES_DU_PRODUIT = ['src/', 'prisma/', 'packages/'];
const RACINES_DU_PROCESSUS = [
  'docs/',
  'scripts/gates/',
  'scripts/lot/',
  'scripts/plan-state/',
  'scripts/vues/',
  'scripts/agents/',
  'scripts/adr/',
  '.github/',
  '.claude/',
  'tests/archive/',
  'tests/unit/gouvernance/',
  'config/',
];

/** PURE. Un commit de gouvernance ? */
export function estDeGouvernance(c: CommitLu): boolean {
  if (/^[a-z]+\(GOV-[^)]*\):/.test(c.titre)) return true;
  if (c.fichiers.length === 0) return false;
  if (c.fichiers.some((f) => RACINES_DU_PRODUIT.some((r) => f.startsWith(r)))) return false;
  return c.fichiers.every((f) => RACINES_DU_PROCESSUS.some((r) => f.startsWith(r)));
}

/** PURE. La part, en pourcent entier arrondi, et le verdict contre le seuil. */
export function part(commits: readonly CommitLu[]): {
  total: number;
  gouvernance: number;
  pourcent: number;
  rouge: boolean;
} {
  const gouvernance = commits.filter(estDeGouvernance).length;
  const pourcent = commits.length === 0 ? 0 : Math.round((100 * gouvernance) / commits.length);
  return { total: commits.length, gouvernance, pourcent, rouge: pourcent > SEUIL_POURCENT };
}

/** PURE. Lit la sortie de `git log --format=%x1e%H%x1f%s --name-only`. */
export function lireLeJournal(sortie: string): CommitLu[] {
  return sortie
    .split('\x1e')
    .filter((b) => b.trim() !== '')
    .map((b) => {
      const [entete, ...reste] = b.split('\n');
      const [sha, titre] = (entete ?? '').split('\x1f');
      return {
        sha: sha ?? '',
        titre: titre ?? '',
        fichiers: reste.map((l) => l.trim()).filter(Boolean),
      };
    });
}

const LANCE_EN_SCRIPT = /[\\/]rapports[\\/]part-gouvernance(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const argv = process.argv.slice(2);
  const jours = Number(argv[argv.indexOf('--jours') + 1] ?? 7) || 7;
  const ref = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1]! : 'HEAD';
  const sortie = execFileSync(
    'git',
    ['log', ref, `--since=${jours}.days`, '--format=%x1e%H%x1f%s', '--name-only'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const commits = lireLeJournal(sortie);
  const r = part(commits);
  const ligne =
    `Part de gouvernance sur ${jours} jour(s) (${ref}) : ${r.gouvernance}/${r.total} commit(s), ` +
    `${r.pourcent} % (seuil ${SEUIL_POURCENT} %).`;
  if (r.rouge) {
    console.error(`❌ ${ligne}`);
    for (const c of commits.filter(estDeGouvernance).slice(0, 20))
      console.error(`   ${c.sha.slice(0, 7)} ${c.titre}`);
    process.exit(1);
  }
  console.log(`✅ ${ligne}`);
}
