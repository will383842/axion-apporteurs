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
import { existsSync } from 'node:fs';

/** Le périmètre n'a pas pu être établi. Ce n'est pas « rien à signaler » : c'est « je n'ai rien lu ». */
export class PerimetreIllisible extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'PerimetreIllisible';
  }
}

/**
 * Deux entrées DISTINCTES de l'index rendraient la MÊME chaîne de chemin. C'est un périmètre
 * illisible d'une espèce nommée : la garde ne saurait pas lequel des deux elle juge.
 */
export class CheminsConfondus extends PerimetreIllisible {
  constructor(motif: string) {
    super(motif);
    this.name = 'CheminsConfondus';
  }
}

/**
 * Le périmètre est LISIBLE mais INCOMPLET : git déclare des fichiers que le disque ne rend pas.
 * Distincte de `PerimetreIllisible` — là on ne savait rien, ici on sait qu'il manque quelque chose.
 */
export class PerimetreEntame extends Error {
  constructor(motif: string) {
    super(motif);
    this.name = 'PerimetreEntame';
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

/**
 * Une entrée de l'INDEX, telle que `git ls-files -s -z` la rend : le chemin, et l'objet que l'index
 * associe à CE chemin — mode, empreinte, étage.
 *
 * 🔴 L'EMPREINTE N'EST PAS UN ORNEMENT. Une garde qui relit le contenu publié en redemandant l'objet
 * PAR SON NOM (`:<chemin>` à `git cat-file`) confie ce nom à la grammaire des révisions :
 * `0:notes/rib.txt` s'y lit « étage 0 de `notes/rib.txt` », et un retour chariot final est retiré par
 * la lecture ligne à ligne. Mesuré sous Linux sur la PR #39 : un fichier suivi porteur d'IBAN, voisin
 * d'un leurre propre, sortait EXIT=0 « lu(s) en entier ». L'objet d'un chemin se demande par
 * l'empreinte que l'index lui associe ICI — la même énumération, jamais une seconde.
 */
export interface EntreeSuivie {
  chemin: string;
  mode: string;
  empreinte: string;
  etage: string;
}

/** L'en-tête d'une entrée de `git ls-files -s -z` : `<mode> <empreinte> <étage>`. Puis une tabulation, puis le chemin — tout le reste. */
const ENTETE_D_INDEX = /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])$/;

const TABULATION = 0x09;
const BARRE_INVERSE = 0x5c;

/**
 * Le nom d'une entrée, OCTET PAR OCTET, pour un message : l'ASCII imprimable tel quel, tout le
 * reste en `\xHH`. Deux noms d'octets distincts s'y écrivent toujours distinctement — c'est ce
 * qu'un refus de confusion doit pouvoir montrer, et ce qu'un décodage ne garantit pas.
 */
export function cheminNomme(octets: Buffer): string {
  let rendu = '';
  for (const o of octets) {
    rendu +=
      o >= 0x20 && o < 0x7f && o !== BARRE_INVERSE
        ? String.fromCharCode(o)
        : `${String.fromCharCode(BARRE_INVERSE)}x${o.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return rendu;
}

/**
 * Les entrées d'une sortie BRUTE de `git ls-files -s -z`. Pure, pour que ses refus s'éprouvent
 * sur des octets qu'aucun système de fichiers de poste ne laisserait créer.
 *
 * 🔴 LE DÉFAUT QU'ELLE FERME (GOV-064). La sortie était décodée en UTF-8 PERMISSIF : toute suite
 * d'octets invalide y devient U+FFFD. Deux noms d'octets différents — l'un portant un octet
 * invalide, l'autre U+FFFD écrit en toutes lettres — rendaient la MÊME chaîne ; et la garde
 * d'entité, qui indexe les blobs par chemin, jugeait les deux fichiers sur le contenu d'UN seul.
 * Mesuré : un IBAN dans l'un, un leurre propre dans l'autre, `gov:entite` sortait 0 en déclarant
 * « 544 fichier(s) suivi(s) lu(s) en entier ».
 *
 * 🔑 LA MESURE N'EST PAS DE FAIRE CONFIANCE AU DÉCODEUR, C'EST DE LE VÉRIFIER. Un chemin n'est
 * rendu que si le réencoder redonne EXACTEMENT ses octets. Cette égalité, vérifiée entrée par
 * entrée, PROUVE l'injectivité : deux chemins rendus égaux se réencodent en les mêmes octets, donc
 * viennent du même nom. Ce qui échoue est refusé en le nommant octet par octet ; et quand
 * plusieurs entrées se confondraient, elles sont nommées TOUTES (`CheminsConfondus`).
 */
export function entreesDepuisSortie(sortie: Buffer): EntreeSuivie[] {
  const entrees: EntreeSuivie[] = [];
  const nonReversibles: Buffer[] = [];
  const parChaine = new Map<string, Buffer[]>();
  let debut = 0;
  while (debut < sortie.length) {
    let fin = sortie.indexOf(0, debut);
    if (fin < 0) fin = sortie.length;
    const brute = sortie.subarray(debut, fin);
    debut = fin + 1;
    if (brute.length === 0) continue;
    const tab = brute.indexOf(TABULATION);
    const m = tab < 0 ? null : ENTETE_D_INDEX.exec(brute.subarray(0, tab).toString('latin1'));
    const octets = tab < 0 ? Buffer.alloc(0) : brute.subarray(tab + 1);
    if (!m || octets.length === 0)
      throw new PerimetreIllisible(
        `\`git ls-files -s\` a rendu une entrée illisible : « ${cheminNomme(brute)} ».`
      );
    const chemin = octets.toString('utf8');
    if (!Buffer.from(chemin, 'utf8').equals(octets)) nonReversibles.push(octets);
    // Le MÊME nom à plusieurs étages (conflit) n'est pas une confusion de noms : `blobsDe` le
    // refuse sous son propre motif. Seuls des octets DIFFÉRENTS sous une même chaîne se confondent.
    const memes = parChaine.get(chemin) ?? [];
    if (!memes.some((o) => o.equals(octets))) memes.push(octets);
    parChaine.set(chemin, memes);
    entrees.push({ mode: m[1]!, empreinte: m[2]!, etage: m[3]!, chemin });
  }
  const confondus = [...parChaine.values()].filter((g) => g.length > 1);
  if (confondus.length > 0) {
    throw new CheminsConfondus(
      `${confondus.length} groupe(s) d'entrées DISTINCTES de l'index rendraient le même chemin : ` +
        confondus.map((g) => g.map((o) => `« ${cheminNomme(o)} »`).join(' et ')).join(' ; ') +
        ". Une garde qui indexe par chemin jugerait l'une à la place de l'autre."
    );
  }
  if (nonReversibles.length > 0) {
    throw new PerimetreIllisible(
      `${nonReversibles.length} entrée(s) de l'index ne sont pas de l'UTF-8 : ` +
        nonReversibles.map((o) => `« ${cheminNomme(o)} »`).join(', ') +
        '. Leur nom décodé ne serait pas le leur : la garde lirait, sous ce nom, un autre fichier ou aucun.'
    );
  }
  return entrees;
}

export function fichiersSuivis(): string[] {
  return entreesSuivies().map((e) => e.chemin);
}

/** Les ENTRÉES de l'index. **Lève** si git échoue, ne rend rien, ou rend une entrée illisible — jamais un tableau vide. */
export function entreesSuivies(): EntreeSuivie[] {
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
    throw new PerimetreIllisible(
      `\`git rev-parse\` a échoué (${(e as Error).message.split('\n')[0]}). ` +
        'Sans dépôt git, le périmètre est INCONNU — pas vide.'
    );
  }
  const ici = normaliser(process.cwd());
  const haut = normaliser(racine);
  if (ici.toLowerCase() !== haut.toLowerCase()) {
    throw new PerimetreIllisible(
      `lancée depuis \`${ici}\`, alors que la racine du dépôt est \`${haut}\`. ` +
        '`git ls-files` ne rend que le sous-arbre courant : la garde balaierait UN BOUT du dépôt ' +
        'et rendrait « ✅ » dessus. Relance-la depuis la racine.'
    );
  }

  let sortie: Buffer;
  try {
    // 🔴 QUATRIÈME ÉTAT MUET — motif de `securite` au 26e tour, reproduit avant d'être fermé.
    // Sans `-z`, `git ls-files` CITE et échappe en octal tout chemin non-ASCII
    // (`"docs/t\303\251moin.md"`), et les cinq appelants le jettent par leur
    // `if (!existsSync(...)) continue`. Même appât : nom ASCII → la garde MORD ; nom accentué →
    // `✅` et exit 0. Sur un dépôt PUBLIC et FRANCOPHONE.
    // `-z` sépare par NUL et n'échappe RIEN — il ferme du même coup les noms à retour de ligne.
    // `core.quotepath=false` est la ceinture : il vaut même si un jour `-z` saute.
    // `-s` rend, dans la MÊME énumération, l'objet que l'index associe à chaque chemin.
    // 🔴 Sans `encoding` : les OCTETS, que `entreesDepuisSortie` décode en vérifiant qu'aucun nom
    // ne s'y perd. Décodée ici en UTF-8 permissif, la sortie confondait deux entrées distinctes.
    sortie = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-s', '-z'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 2 ** 20,
    });
  } catch (e) {
    throw new PerimetreIllisible(
      `\`git ls-files\` a échoué (${(e as Error).message.split('\n')[0]}). ` +
        'Sans dépôt git, le périmètre est INCONNU — pas vide.'
    );
  }
  const entrees = entreesDepuisSortie(sortie);
  const fichiers = entrees.map((e) => e.chemin);
  if (fichiers.length === 0) {
    throw new PerimetreIllisible(
      '`git ls-files` n’a rendu AUCUN fichier : le périmètre est vide ou illisible.'
    );
  }

  // 🔴 TROISIÈME MOTIF DE `securite` AU 26e TOUR — le périmètre ENTAMÉ, et il était MUET.
  //
  // Les cinq gardes écrivent `if (!estBalaye(chemin) || !existsSync(chemin)) continue;` : deux
  // raisons de sauter, confondues. « Hors périmètre par décision » est légitime ; « fichier SUIVI
  // introuvable sur le disque » ne l'est pas — et c'est la seconde qui passait sans un mot. La
  // bannière imprimait « 168 fichier(s) suivi(s) balayé(s) » À L'IDENTIQUE avec 171 et 172 suivis.
  //
  // *Un compteur qui DIMINUE quand le périmètre s'entame ne peut pas signaler qu'il s'entame :
  // le témoin positif est soustrait par la chute même qu'il devrait dénoncer.*
  //
  // Ici, une seule fois, pour les cinq — c'est l'office de ce fichier (RM-01).
  const introuvables = fichiers.filter((f) => !existsSync(f));
  if (introuvables.length > 0) {
    throw new PerimetreEntame(
      `${introuvables.length} fichier(s) SUIVI(S) par git sont introuvables sur le disque : ` +
        `${introuvables.slice(0, 5).join(', ')}${introuvables.length > 5 ? ', …' : ''}. ` +
        'Le périmètre est ENTAMÉ : la garde lirait MOINS que ce qu’elle déclare balayer, et son ' +
        'compte de fichiers baisserait sans que rien ne le dise.'
    );
  }
  return entrees;
}

/**
 * Le même, mais qui REFUSE au lieu de lever : la garde sort en échec en nommant la famille
 * `perimetre_illisible`, comme `lexique-apporteurs.ts` le faisait déjà seul (son modèle est repris ici).
 */
export function fichiersSuivisOuRefus(gate: string): string[] {
  return entreesSuiviesOuRefus(gate).map((e) => e.chemin);
}

/** Les entrées de l'index, avec les MÊMES refus : `fichiersSuivisOuRefus` en dérive. */
export function entreesSuiviesOuRefus(gate: string): EntreeSuivie[] {
  try {
    return entreesSuivies();
  } catch (e) {
    if (e instanceof PerimetreEntame) {
      console.error(`❌ ${gate} — [perimetre_entame] ${e.message}`);
      console.error(
        '   La garde REFUSE plutôt que de balayer un périmètre amputé en le déclarant complet. ' +
          'Ce dépôt est PUBLIC : un vert obtenu sur MOINS que le périmètre est un vert qui ment.'
      );
      process.exit(1);
    }
    if (!(e instanceof PerimetreIllisible)) throw e;
    // La même sortie, une famille NOMMÉE de plus : deux entrées confondues ne sont pas « rien lu »,
    // ce sont deux fichiers dont un seul aurait été jugé.
    const famille = e instanceof CheminsConfondus ? 'chemins_confondus' : 'perimetre_illisible';
    console.error(`❌ ${gate} — [${famille}] ${e.message}`);
    console.error(
      '   La garde REFUSE plutôt que de déclarer propre ce qu’elle n’a pas lu. ' +
        'Ce dépôt est PUBLIC : un vert obtenu sur zéro fichier est un vert qui ment.'
    );
    process.exit(1);
  }
}
