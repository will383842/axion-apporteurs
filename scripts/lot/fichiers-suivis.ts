/**
 * fichiers-suivis.ts — LA source du périmètre des gardes qui balaient le dépôt.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE : une garde d'argent VERTE sur ZÉRO fichier, dans un dépôt PUBLIC.
 *
 * Mesuré par la lentille `schema` au 23e tour, puis reproduit :
 *
 * ```
 * $ git archive HEAD | tar -x -C <jetable>     # une copie SANS .git
 * $ npx tsx scripts/gates/gov-entite.ts
 * fatal: not a git repository (or any of the parent directories): .git
 * ✅ gov:entite — … 0 fichier(s) suivi(s) balayé(s) : aucune coordonnée en clair,
 *    aucune valeur recopiée, aucun point de sortie sans refus.
 * CODE=0
 * ```
 *
 * Avec un IBAN à clé mod-97 VALIDE posé en clair dans `src/config/entite.ts` : **toujours exit 0**.
 * Le `try/catch` rendait `[]`, et toutes les familles de fuite parcourent cette liste vide.
 *
 * > **Une garde qui ne peut pas établir son périmètre ne doit pas rendre un verdict.** « Je n'ai
 * > rien trouvé » et « je n'ai rien regardé » sont deux phrases différentes, et une seule des deux
 * > autorise à publier.
 *
 * 🔑 ET LE DÉPÔT LE DISAIT DÉJÀ, DEUX FOIS, DANS LE FICHIER QUI LE VIOLAIT.
 * `gov-entite.ts:915` : « un `try/catch` qui rendrait un tableau vide en cas d'erreur produirait un
 * vert, et c'est [le défaut] ». `gov-entite.ts:1247` : « Aucun `catch` ne rend ici de tableau
 * vide. » — 800 lignes au-dessus de celui qui le faisait.
 * *Une règle écrite dans un commentaire ne garde pas le fichier qui la porte.*
 *
 * ⚠️ LE PATRON ÉTAIT RECOPIÉ CINQ FOIS À L'IDENTIQUE — `gov-entite`, `gov-identifiants`,
 * `gov-preseance`, `gov-publication`, `lexique-apporteurs` — et la PR #31 en ajoutait deux
 * exemplaires. La primitive commune de six gardes n'avait pas de source unique (RM-01) : la
 * corriger à un endroit aurait laissé le défaut aux quatre autres.
 */
import { execFileSync } from 'node:child_process';

/** Le périmètre n'a pas pu être établi. Ce n'est pas « rien à signaler » : c'est « je n'ai rien lu ». */
export class PerimetreVide extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'PerimetreVide';
  }
}

/**
 * Les fichiers SUIVIS par git. **Lève** si git échoue ou ne rend rien — jamais un tableau vide.
 *
 * Le second cas compte autant que le premier : un dépôt réellement vide et un `git` muet sont
 * indiscernables pour l'appelant, et les deux rendraient un « ✅ » sur zéro fichier.
 */
/** Normalise un chemin pour comparaison : séparateurs uniformes, pas de barre finale. */
function normaliser(chemin: string): string {
  const BARRE_INVERSE = String.fromCharCode(92);
  let p = chemin.split(BARRE_INVERSE).join('/');
  while (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function fichiersSuivis(): string[] {
  // 🔴 TROISIÈME ÉTAT : « je n'ai regardé qu'UN BOUT ».
  // Motif de `schema` au 24e tour. `git ls-files` rend les fichiers du RÉPERTOIRE COURANT, pas du
  // dépôt : lancées depuis `packages/` (5 fichiers suivis sur 171), `gov:identifiants` et
  // `gov:publication` rendaient **exit 0 avec leur bannière ✅**, un IBAN à clé valide en clair
  // dans `src/config/`. Ma première version distinguait « rien trouvé » de « rien regardé » et
  // laissait celui-ci muet — **le seul des trois à rendre 0**.
  //
  // ⚠️ Et j'avais écrit reprendre le modèle de `lexique-apporteurs.ts` : **il a DEUX étages**
  // (périmètre illisible ET motif qui doit avoir des fichiers et n'en a aucun), je n'en avais
  // repris qu'un. *Dire qu'on reprend un modèle n'en reprend pas la moitié qu'on n'a pas lue.*
  //
  // Les gardes lisent toutes leurs entrées par chemin RELATIF (`docs/…`, `scripts/…`) : hors de la
  // racine elles ne mesurent pas « moins », elles mesurent **autre chose**. On refuse.
  let racine: string;
  try {
    racine = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    throw new PerimetreVide(
      `\`git rev-parse\` a échoué (${(e as Error).message.split('\n')[0]}). ` +
        'Sans dépôt git, le périmètre est INCONNU — pas vide.'
    );
  }
  const ici = normaliser(process.cwd());
  const haut = normaliser(racine);
  if (ici.toLowerCase() !== haut.toLowerCase()) {
    throw new PerimetreVide(
      `lancée depuis \`${ici}\`, alors que la racine du dépôt est \`${haut}\`. ` +
        '`git ls-files` ne rend que le sous-arbre courant : la garde balaierait UN BOUT du dépôt ' +
        'et rendrait « ✅ » dessus. Relance-la depuis la racine.'
    );
  }

  let sortie: string;
  try {
    sortie = execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new PerimetreVide(
      `\`git ls-files\` a échoué (${(e as Error).message.split('\n')[0]}). ` +
        'Sans dépôt git, le périmètre est INCONNU — pas vide.'
    );
  }
  const fichiers = sortie.split('\n').filter(Boolean);
  if (fichiers.length === 0) {
    throw new PerimetreVide('`git ls-files` n’a rendu AUCUN fichier : le périmètre est vide ou illisible.');
  }
  return fichiers;
}

/**
 * Le même, mais qui REFUSE au lieu de lever : la garde sort en échec en nommant la famille
 * `perimetre_vide`, comme `lexique-apporteurs.ts` le faisait déjà seul (son modèle est repris ici).
 */
export function fichiersSuivisOuRefus(gate: string): string[] {
  try {
    return fichiersSuivis();
  } catch (e) {
    if (!(e instanceof PerimetreVide)) throw e;
    console.error(`❌ ${gate} — [perimetre_vide] ${e.message}`);
    console.error(
      '   La garde REFUSE plutôt que de déclarer propre ce qu’elle n’a pas lu. ' +
        'Ce dépôt est PUBLIC : un vert obtenu sur zéro fichier est un vert qui ment.'
    );
    process.exit(1);
  }
}
