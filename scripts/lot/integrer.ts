/**
 * integrer.ts — applique le livrable d'une tâche au dépôt, avec la discipline du DIFF ADDITIF.
 *
 * USAGE : pnpm lot:integrer -- --tache <ID> --depuis <dossier livrable/> [--dry]
 *
 * POURQUOI CE SCRIPT EXISTE. Le lot `L-1-01` a été intégré à la main, tâche par tâche, et c'est là
 * qu'on a mesuré le vrai risque : un agent travaille sur l'état du dépôt qu'il a lu AU DÉMARRAGE.
 * S'il rend un fichier partagé complet plutôt qu'un diff, il efface tout ce qui y est entré depuis,
 * sans le voir ni l'annoncer. Trois contre-lectures indépendantes ont trouvé le même `package.json`
 * supprimant la ligne `reprise` ; le même livrable aurait effacé huit étapes de `ci.yml` et
 * 93 lignes d'un fichier de test partagé.
 *
 * CE QUE FAIT CE SCRIPT
 *   - fichier NEUF, ou fichier appartenant en propre à la tâche  → copie directe ;
 *   - fichier PARTAGÉ (la liste ci-dessous)                      → REFUS de la copie, et il dit
 *     précisément ce que le livrable voulait ajouter et ce qu'il aurait supprimé.
 *
 * Il ne fusionne pas les fichiers partagés à la place de l'humain : sur `package.json` un ajout est
 * trivial, sur `gardes.spec.ts` il demande de choisir quel `describe` porter. Le script REND VISIBLE,
 * il ne devine pas. C'est la différence entre une intégration relue et une intégration subie.
 *
 * INVARIANT : ce script n'écrit JAMAIS dans `docs/tasks.json` (`lot:cloture` en est le seul
 * écrivain) ni dans `docs/gates.json` (l'inscription d'une garde est un geste de la tâche qui la
 * possède, pas d'un outil de copie).
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

/**
 * Les fichiers que PLUSIEURS tâches écrivent. La liste n'est pas une opinion : elle se lit dans
 * `docs/paths-proposes.json`, où ces chemins apparaissent dans les `paths[]` de plus d'une tâche.
 * `docs/gates.json` et `docs/tasks.json` y sont aussi, mais ils sont en `deny` d'écriture : le
 * script les refuse pour la même raison, en le disant autrement.
 */
const PARTAGES = [
  'package.json',
  'pnpm-lock.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/nightly.yml',
  'vitest.config.ts',
  'tsconfig.json',
  'docs/gates.json',
  'docs/tasks.json',
  'docs/DECISIONS.md',
  'docs/REQUIREMENTS.md',
  'docs/PLAN-STATE.md',
  'tests/unit/gouvernance/gardes.spec.ts',
  '.claude/settings.json',
  'prisma/schema.prisma',
];

function args(): { tache: string; depuis: string; dry: boolean } {
  const a = process.argv.slice(2);
  const lire = (nom: string): string | null => {
    const i = a.indexOf(nom);
    return i >= 0 && a[i + 1] !== undefined ? (a[i + 1] as string) : null;
  };
  const tache = lire('--tache');
  const depuis = lire('--depuis');
  if (tache === null || depuis === null) {
    console.error('❌ lot:integrer — usage : --tache <ID> --depuis <dossier livrable/> [--dry]');
    process.exit(2);
  }
  return { tache, depuis, dry: a.includes('--dry') };
}

/** Tous les fichiers d'un dossier, en chemins RELATIFS à ce dossier, séparateurs normalisés. */
function fichiers(racine: string): string[] {
  const out: string[] = [];
  const descendre = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) descendre(p);
      else out.push(relative(racine, p).split(sep).join('/'));
    }
  };
  descendre(racine);
  return out.sort();
}

/** Les lignes de `avant` qui ne sont plus dans `apres`. Ce que la recopie ferait DISPARAÎTRE. */
function disparues(avant: string, apres: string): string[] {
  const reste = new Set(apres.split('\n').map((l) => l.trim()));
  return avant
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('//') && !l.startsWith('#') && !reste.has(l));
}

const { tache, depuis, dry } = args();

if (!existsSync(depuis)) {
  console.error(`❌ lot:integrer — le dossier « ${depuis} » n'existe pas.`);
  process.exit(2);
}

const liste = fichiers(depuis);
const copies: string[] = [];
const refuses: { chemin: string; ajoute: number; supprime: string[] }[] = [];

for (const f of liste) {
  const source = join(depuis, f);
  const cible = f;

  if (PARTAGES.includes(f)) {
    const avant = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
    const apres = readFileSync(source, 'utf8');
    const perdues = avant === '' ? [] : disparues(avant, apres);
    const gagnees = disparues(apres, avant).length;
    refuses.push({ chemin: f, ajoute: gagnees, supprime: perdues });
    continue;
  }

  if (!dry) {
    mkdirSync(dirname(cible) === '' ? '.' : dirname(cible), { recursive: true });
    copyFileSync(source, cible);
  }
  copies.push(f);
}

console.log(`lot:integrer — tâche ${tache}, ${liste.length} fichier(s) au livrable.`);
console.log('');
console.log(`✅ ${copies.length} copié(s)${dry ? ' (à blanc)' : ''} :`);
for (const c of copies) console.log(`   ${c}`);

if (refuses.length > 0) {
  console.log('');
  console.log(`⛔ ${refuses.length} fichier(s) PARTAGÉ(S) non copié(s) — à appliquer comme un diff, à la main :`);
  for (const r of refuses) {
    console.log('');
    console.log(`   ── ${r.chemin}`);
    console.log(`      le livrable ajoute ${r.ajoute} ligne(s) significative(s)`);
    if (r.supprime.length > 0) {
      console.log(`      ⚠️  et il en SUPPRIME ${r.supprime.length}, dont :`);
      for (const s of r.supprime.slice(0, 6)) console.log(`         − ${s.slice(0, 110)}`);
      if (r.supprime.length > 6) console.log(`         … et ${r.supprime.length - 6} autre(s)`);
    } else {
      console.log('      il ne supprime rien : un ajout pur, mais qui reste à appliquer à la main.');
    }
  }
  console.log('');
  console.log('   Un fichier partagé se relit comme un DIFF, jamais comme un contenu. Le livrable a');
  console.log("   été écrit contre l'état du dépôt au démarrage de son agent, pas contre celui-ci.");
}

console.log('');
console.log(
  refuses.length === 0
    ? '✅ aucun fichier partagé dans ce livrable : intégration complète.'
    : `⚠️  intégration PARTIELLE : ${refuses.length} fichier(s) restent à porter à la main.`
);
