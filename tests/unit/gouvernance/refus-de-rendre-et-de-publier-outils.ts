/**
 * QA-T72 — LE BANC DES TÉMOINS DES REFUS, partagé par les trois fichiers qui les portent.
 *
 * Le témoin des refus de rendre et de publier prenait plus que le plafond de la porte A à lui
 * seul : il est scindé en `refus-de-rendre-et-de-publier.spec.ts` (le cliquet `declares`, que
 * d'autres fichiers lisent par son nom, et l'appât des noms accentués, que `gov-identifiants`
 * exempte par son nom), `refus-de-rendre-et-de-publier-effet.spec.ts` (les témoins d'effet) et
 * `refus-de-rendre-et-de-publier-perimetre.spec.ts` (le refus d'un périmètre illisible). Ce
 * module n'est PAS un fichier de tests : il porte ce que les trois partagent, écrit une seule
 * fois (RM-01) — les dépôts jetables, le lanceur des gardes et les listes déclarées. Rien n'y est
 * changé : le texte est celui du fichier d'origine, déplacé, avec ses commentaires.
 */
import {
  readFileSync,
  existsSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  CHEMIN_ANNEXE,
  fusionsDecidees,
  marqueursDe,
} from '../../../scripts/gates/gov-requirements';

/**
 * 🔴 LA FAMILLE NE SE FERME PAS PAR DU TEXTE. On lance le programme.
 *
 * ## Quatre tours, quatre fois le même défaut d'un cran plus bas
 *
 * ```
 * 18e  « le test suit-il la LIGNE du calcul ? »          battu par : tout sur UNE ligne
 * 19e  « l'INSTRUCTION precedente est-elle le calcul ? »  battu par : pas de point-virgule (ASI)
 * 20e  « l'INTERVALLE est-il vide ? »                     aurait ete battu par : le ternaire,
 *                                                         le recrutement par NOM, la forme
 *                                                         inline, la branche composition
 * ```
 *
 * À chaque tour j'ai fermé le trou nommé, et le tour suivant a trouvé le même trou une couche
 * plus bas. Ce n'est pas une convergence : **j'essayais de prouver une propriété SÉMANTIQUE —
 * « la valeur ne peut pas être vidée entre son calcul et son test » — par un appariement de
 * TEXTE.** Toute approximation syntaxique a une porte de sortie, et les lentilles trouvaient
 * chaque fois la suivante.
 *
 * > **La seule surface où AUCUN mutant n'a survécu, sur les quatre tours, est la garde d'argent
 * > — et c'est la seule qui LANCE LE BINAIRE.** Un témoin d'effet ne reconnaît pas la mutation :
 * > il constate que la gate ne refuse plus. Il est donc indifférent à la façon dont on l'écrit.
 *
 * Will a tranché : on bascule sur des témoins d'effet, et on cesse de raffiner le motif.
 *
 * ## La forme, et pourquoi elle porte un CONTRÔLE POSITIF
 *
 * Chaque témoin fait DEUX mesures dans deux dépôts jetables : le dépôt sain doit sortir en **0**,
 * le dépôt fauté doit sortir **non nul** ET nommer sa faute. Sans la première, un témoin resterait
 * vert alors que la gate refuse TOUT — un fichier d'entrée manquant, un `tsx` cassé, un chemin
 * relatif qui ne résout plus : le rouge serait obtenu pour la mauvaise raison, et c'est
 * exactement le défaut que ce fichier a déjà commis deux fois.
 *
 * ⚠️ CE QUE CES TÉMOINS NE COUVRENT PAS — mesuré, et non plus supposé.
 *
 * 🔴 Ma première rédaction de cette déclaration était **fausse deux fois**, et `exactitude` puis
 * `schema` l'ont mesuré : `.github/workflows/` n'est PAS une entrée de `gov:pr` (simple test de
 * préfixe, `gov-pr.ts:91`), `.claude/agents/` en est une et je l'omettais — **et l'obstacle que
 * j'avais nommé n'était pas le bon.** J'avais aussi déclaré UNE lacune là où il y en avait DEUX.
 * 🔑 *Déclarer une lacune ne dispense pas de mesurer ce qui la cause : une déclaration fausse est
 * une dette qu'on ne saura pas payer, et une déclaration incomplète protège moins qu'elle ne
 * rassure.*
 *
 * **`gov:pr`** — la surface qui AUTORISE, celle dont la neutralisation laisse passer une PR SANS
 * AUCUNE REVUE. Cause réelle : sous `--pr`, `gov-pr.ts:667`, `:681` et `:744` appellent **`gh` et
 * `git`**. Un dépôt jetable de fichiers ne la fait pas tourner ; son témoin demande de simuler la
 * forge.
 *
 * **`gov:trace`** — tentée au 22e tour sur motif de `schema`, qui avait raison de dire que
 * l'obstacle de `gov:pr` ne s'y applique pas (`--render` passe `avecPr=false`). Mesurée en trois
 * passes, entrées ajoutées une par une :
 * ```
 * docs/{requirements,tasks}.json + vitest.config.ts   -> ENOENT scripts/lot/tasks.schema.json
 * + scripts/lot/tasks.schema.json                     -> 96 ruptures (req_sans_test x31)
 * + l'arbre tests/ entier (39 fichiers)               -> 27 ruptures (titres_non_resolus)
 * ```
 * **Elle doit RÉSOUDRE les titres des tests**, ce qui demande le lanceur dans le dépôt cible : à
 * ce point, le « dépôt jetable » est un clone complet, et ce n'en est plus un.
 * ⚠️ C'est le **contrôle positif** qui l'a dit — il a refusé un dépôt sain (`code 1`) et m'a évité
 * de publier quatre témoins qui n'auraient rien mesuré. *Un contrôle positif ne sert pas à
 * confirmer : il sert à refuser un montage qui ne peut rien établir.*
 *
 * **Les familles NON injectées** restent sans témoin d'effet. Elles sont NOMMÉES dans les titres
 * des tests — pas comptées : `exactitude` a mesuré au 22e tour qu'aucun titre ne portait de
 * nombre, alors que j'écrivais ici le contraire. L'assertion d'appartenance
 * (`famillesDeclarees`) interdit d'en inventer une, mais elle ne dit rien de celles qui manquent.
 * *Déclarer une lacune ne dispense pas de mesurer ce qui la cause — une déclaration fausse est une
 * dette qu'on ne saura pas payer.*
 */
/**
 * ⚠️ LES DÉPÔTS JETABLES SONT TRACÉS ET NETTOYÉS, MÊME QUAND UN TÉMOIN ÉCHOUE.
 * `securite` a mesuré au 22e tour **399 dossiers laissés, 222 Mo**, dont **11 portant encore
 * `preuve.md` et sa coordonnée fabriquée** : le `rmSync` de la garde d’argent n’est pas dans un
 * `finally`, donc il ne tournait **que quand la garde passait**.
 * 🔑 *Un nettoyage qui ne s’exécute qu’en cas de SUCCÈS garde les traces précisément quand on
 * voudrait qu’il les efface.* `afterAll` tourne dans les deux cas.
 */
export const DEPOTS_JETABLES: string[] = [];
/** Le nettoyage des dépôts jetables : chaque fichier de témoins le passe à son `afterAll`. */
export function nettoyerLesDepotsJetables(): void {
  for (const d of DEPOTS_JETABLES.splice(0)) rmSync(d, { recursive: true, force: true });
}

/**
 * Un dépôt jetable est un VRAI dépôt git : `git ls-files` doit y répondre.
 * 🔴 Sans ça, les gardes qui balaient le dépôt ne mesurent RIEN — et c’est exactement le défaut
 * que `schema` a trouvé au 23e tour : `gov:entite` rendait « ✅ aucune coordonnée en clair » après
 * avoir balayé ZÉRO fichier, avec un IBAN valide en clair dans les sources. L’absence de `.git`
 * est l’un des quatre discriminants par lesquels l’enfant reconnaît le banc d’essai.
 */
export function faireDeCeDossierUnDepot(depot: string): void {
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 't@t'],
    ['config', 'user.name', 't'],
    ['add', '-A'],
  ]) {
    execFileSync('git', args, { cwd: depot, stdio: 'ignore' });
  }
}

export function depotJetableAvec(fichiers: readonly string[]): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-effet-'));
  for (const f of fichiers) {
    mkdirSync(join(depot, dirname(f)), { recursive: true });
    copyFileSync(f, join(depot, f));
  }
  DEPOTS_JETABLES.push(depot);
  faireDeCeDossierUnDepot(depot);
  return depot;
}

/**
 * 🔴 UN DÉPÔT JETABLE **COMPLET**, pour les gates dont les entrées sont le dépôt lui-même.
 *
 * Motif BLOQUANT de `mutation` au 22e tour : `gov-trace.ts:383`,
 * `return process.argv.includes('--prove') ? fautes : [];` — **586/586 verts, `tsc` 0,
 * `gov:trace` 0, `--prove` ✅ « les 10 familles rougissent », `--verifier` ✅** — et la vue est
 * ÉCRITE depuis une source fautive à exit 0. Le refus qu'elle neutralise est **introduit par
 * cette PR**, et `gov:trace` était le seul des trois générateurs gardé **par du TEXTE seul**.
 *
 * ⚠️ **ET J'AVAIS DÉCLARÉ CETTE LACUNE IRRÉDUCTIBLE — À TORT.** J'avais mesuré trois passes
 * (ENOENT → 96 ruptures → 27 `titres_non_resolus`) et conclu qu'il faudrait « un clone complet,
 * et ce n'en est plus un ». **C'est un clone complet, et il coûte 0 seconde pour 170 fichiers.**
 * `git archive HEAD | tar -x` plus une jonction vers `node_modules` : la gate sort en 0.
 * 🔑 *Ma déclaration était fausse une fois par excès de confiance, puis une fois par excès de
 * prudence. Une lacune se mesure jusqu'au bout — s'arrêter à la troisième passe m'a fait déclarer
 * irréductible ce qui tenait en dix lignes.*
 *
 * `titresResolus` (`gov-trace.ts:632`) lance `npx vitest list` : il lui faut les specs ET les
 * sources qu'elles importent ET le lanceur. C'est pour ça que les copies partielles échouaient —
 * elles ne rendaient pas la gate fautive, elles la rendaient AVEUGLE.
 */
export function depotCompletJetable({ avecGit = true }: { avecGit?: boolean } = {}): string {
  const depot = extraireLaTete();
  if (avecGit) faireDeCeDossierUnDepot(depot);
  const vue = join(depot, VUE_DE_TRACABILITE);
  mkdirSync(dirname(vue), { recursive: true });
  writeFileSync(vue, tracabiliteRendueDeLaTete());
  if (avecGit) execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'ignore' });
  return depot;
}

/** `git archive HEAD` extrait dans un dossier jetable, avec une jonction vers `node_modules`. */
export function extraireLaTete(): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-complet-'));
  DEPOTS_JETABLES.push(depot);
  const tar = execFileSync('git', ['archive', 'HEAD'], { maxBuffer: 512e6, encoding: 'buffer' });
  const chemin = join(depot, 'depot.tar');
  writeFileSync(chemin, tar);
  execFileSync('tar', ['-x', '-f', 'depot.tar'], { cwd: depot });
  rmSync(chemin, { force: true });
  symlinkSync(resolve('node_modules'), join(depot, 'node_modules'), 'junction');
  return depot;
}

/**
 * GOV-123 — LA PORTE A REND LES VUES AVANT DE LES LIRE (`pnpm vues:rendre`) ; le dépôt jetable
 * aussi. `git archive HEAD` ne porte plus aucune vue, elles sont hors de git : sans
 * `docs/TRACABILITE.md`, `gov:trace` refusait un dépôt SAIN (`vue_divergente`, « absent »), et
 * le témoin ne mesurait plus rien. La vue est RENDUE par la gate elle-même, UNE fois, dans un
 * dépôt extrait de la même tête — jamais recopiée du disque, où elle peut être périmée.
 */
export const VUE_DE_TRACABILITE = 'docs/TRACABILITE.md';
export let tracabiliteDeLaTete: string | null = null;
export function tracabiliteRendueDeLaTete(): string {
  if (tracabiliteDeLaTete !== null) return tracabiliteDeLaTete;
  const depot = extraireLaTete();
  faireDeCeDossierUnDepot(depot);
  const r = lancerLaGate('scripts/gates/gov-trace.ts', depot, ['--render']);
  const vue = join(depot, VUE_DE_TRACABILITE);
  if (r.code !== 0 || !existsSync(vue)) {
    throw new Error(`gov:trace --render n'a pas rendu ${VUE_DE_TRACABILITE} (code ${r.code}) :
${r.sortie.slice(0, 600)}`);
  }
  tracabiliteDeLaTete = readFileSync(vue, 'utf8');
  return tracabiliteDeLaTete;
}

/**
 * Les familles que la gate DÉCLARE, lues dans SA source. Rend `null` si la gate n'en déclare
 * AUCUNE — et ce `null` est **prouvé**, pas supposé.
 *
 * 🔴 UN EXTRACTEUR QUI PERD EST SÛR SOUS UNE ASSERTION POSITIVE ET DANGEREUX SOUS UNE NÉGATIVE.
 * Motif de `schema` au 25e tour, et c'est la distinction que je n'avais pas vue :
 *
 * ```
 * sous `toContain(famille)`      une perte -> FAUX ROUGE, visible, on le corrige
 * sous `not.toContain(famille)`  une perte -> FAUX VERT,  invisible, il rassure
 * ```
 *
 * Mon témoin de distinction, ajouté au tour d'avant pour interdire un cas, était **VERT sur ce cas
 * même** (`5 passed | 42 skipped`) : son `catch { return }` avalait l'échec d'extraction.
 * *Un `catch` qui rend « rien » transforme « je n'ai pas su lire » en « il n'y a rien à
 * signaler » — le même défaut que le `try/catch { return [] }` de `fichiersSuivis`, dans le
 * fichier qui le ferme.*
 *
 * ⚠️ ET LA PREMIÈRE RÉÉCRITURE ÉTAIT ENCORE TROP ÉTROITE : elle exigeait un `\n]` final, donc elle
 * ne lisait pas `const FAMILLES = ['doctrine', ...CHIFFRES.map(…)]` (une seule ligne, avec spread).
 * L'appariement se fait maintenant par **équilibrage de crochets**, jamais par une forme de
 * mise en page.
 */
export function famillesDeclarees(script: string): { noms: string[]; calculee: boolean } | null {
  const src = readFileSync(script, 'utf8');
  const noms = new Set<string>();
  let listes = 0;
  let calculee = false;

  const MARQUE = /const FAMILLES[A-Z_]*(?::[^=]+)? = \[/g;
  for (const m of [...src.matchAll(MARQUE)]) {
    listes++;
    let profondeur = 0;
    let fin = -1;
    for (let i = m.index! + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '[') profondeur++;
      else if (src[i] === ']') {
        profondeur--;
        if (profondeur === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin < 0)
      throw new Error(
        `${script} : liste \`FAMILLES\` non refermée — l’extracteur ne peut pas la lire.`
      );
    const corps = src.slice(m.index! + m[0].length, fin);
    for (const x of corps.matchAll(/nom: '([a-z_]+)'/g)) noms.add(x[1]!);
    for (const x of corps.matchAll(/'([a-z_]+)'/g)) noms.add(x[1]!);
    if (corps.includes('...')) calculee = true;
  }

  // Aucune liste : ce n'est pas un échec de lecture, c'est une ABSENCE — mais on la PROUVE.
  if (listes === 0) {
    if (/FAMILLES/.test(src)) {
      throw new Error(
        `${script} : le mot \`FAMILLES\` apparaît mais aucune DÉCLARATION n’a été reconnue. ` +
          'La garde REFUSE plutôt que de conclure à une absence qu’elle n’a pas établie.'
      );
    }
    return null;
  }
  if (noms.size === 0)
    throw new Error(`${script} : liste \`FAMILLES\` trouvée mais AUCUN nom extrait.`);
  return { noms: [...noms], calculee };
}

/**
 * QA-T72 — LE `tsx` DU DÉPÔT, lancé par le `node` qui fait tourner ce fichier. Jamais `npx tsx`.
 *
 * 🔴 CE QUI A FAIT ÉCRIRE CETTE CONSTANTE. Ce fichier prenait 480 s en CI à lui seul, et sur un
 * poste la plus grande part n'était pas les gardes : c'était le LANCEUR. Lancé dans un dépôt jetable qui n'a pas de
 * `node_modules`, `npx tsx` ne trouve pas `tsx` sur place et interroge le registre avant de
 * lancer quoi que ce soit — mesuré sur un poste sans accès au registre, 70 s par lancement, et
 * le témoin de la garde d'argent, qui lance deux fois, à 146 s pour UN test. Et quand le registre
 * répond, `npx` lance le `tsx` de SON cache, pas celui du dépôt : mesuré, 4.23.15 contre 4.23.13.
 * *Le témoin jugeait la garde sous une autre version que celle que la porte A lance.*
 *
 * Le chemin est résolu depuis CE fichier, donc dans le `node_modules` du dépôt, quel que soit le
 * `cwd` de l'enfant : le jetable reste un jetable, sans jonction. Sans `shell` : le premier
 * argument est un exécutable absolu, il n'y a plus rien à chercher dans `PATH`.
 */
export const TSX_DU_DEPOT = createRequire(import.meta.url).resolve('tsx/cli');

/**
 * 🔴 CETTE LISTE **RÉDUIT** L'ENVIRONNEMENT. ELLE NE LE CONSTRUIT PAS À PARTIR DE RIEN.
 *
 * C'est ce que j'avais écrit, et **c'est faux** — mesuré par `mutation` au 25e tour :
 * `env: {}` **strictement vide** rend quand même onze variables, réinjectées par libuv et
 * **ineffaçables sous Windows** (`HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`,
 * `SYSTEMROOT`, `TEMP`, `USERDOMAIN`, `USERNAME`, `USERPROFILE`, `WINDIR`), et `npx` en ajoute
 * ~22. **L'enfant en reçoit 53, pas 20.** La liste s'applique EN AMONT de ce qui repollue.
 * (Mesuré quand le lanceur était `npx` ; il ne l'est plus, voir `TSX_DU_DEPOT` ci-dessus.)
 * 🔑 *Un mutant a d'ailleurs été tué par `process.env.USERNAME` — non pas parce que la liste
 * l'avait prévu, mais parce que libuv le réinjecte. Une garde qui mord pour une raison qu'on
 * n'a pas choisie n'est pas la garde qu'on croit tenir.*
 *
 * ⚠️ ET DIX DES VINGT ENTRÉES N'ONT AUCUNE PROMESSE VIVANTE — recompté à l'exécution au 26e
 * tour, sur le motif d'`exactitude` : j'avais écrit « sept », la mesure en rend **neuf**
 * redondantes (`PATH`, `Path`, `SystemRoot`, `SystemDrive`, `windir`, `TEMP`, `USERPROFILE`,
 * `HOMEDRIVE`, `HOMEPATH` — toutes réinjectées par libuv, donc non retirables), plus `LC_ALL`
 * **absente du parent**, donc jamais transmise. Pour ces dix, la promesse « ça casse bruyamment
 * si ça manque » est **vide** : on ne peut pas les faire manquer.
 * 🔑 *Un chiffre écrit sous un titre « mesuré, pas supposé » se recompte à chaque tour, sinon
 * c'est le titre qui devient faux avant le chiffre.*
 *
 * ## Ce que cette liste ferme, et ce qu'elle NE ferme PAS — mesuré, pas supposé
 *
 * ```
 * FERMÉ    process.env.VITEST / TEST / NODE_ENV / CI       (les noms du lanceur de tests)
 * OUVERT   npm_config_user_agent : `npm/…` au banc, `pnpm/…` en CI (ci.yml lance `pnpm gov:*`)
 * OUVERT   la TOPOLOGIE git : le jetable n'a pas de remote, le dépôt réel et actions/checkout si
 * OUVERT   `process.cwd().startsWith(process.env.TEMP)` — INFERMABLE par une liste
 *          d'environnement, quelle qu'elle soit. Il faut monter le jetable AILLEURS.
 * ```
 *
 * > **La bonne propriété n'est pas « assainir l'environnement », c'est LANCER CE QU'ON LIVRE, DE
 * > LA FAÇON DONT ON LE LIVRE** — `pnpm <script>`, depuis le cwd de production, sur la copie
 * > qu'on juge. C'est la formulation de `mutation`, et elle vaut mieux que la mienne : elle
 * > explique pourquoi « un témoin d'effet par garde » n'aurait tué **aucun** des trois survivants.
 * > `gov:entite` A son témoin d'effet, il est VERT, et la garde est aveugle en production.
 */
export const VARIABLES_DE_PRODUCTION = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'COMSPEC',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'LANG',
  'LC_ALL',
] as const;

/**
 * L'environnement d'un enfant qui ne doit PAS savoir qu'il est sous test.
 *
 * ⚠️ Il **RÉDUIT** l'environnement du parent — il ne le construit pas à partir de rien. Le corps
 * ci-dessous fait `env[v] = process.env[v]` : c'est une COPIE filtrée. La formule « construit à
 * partir de RIEN, jamais copié depuis le parent » a figuré ici et elle est **fausse deux fois** :
 * par ce corps, et parce que libuv réinjecte onze variables dans tout enfant même sous `env: {}`.
 * 🔑 *Elle avait été rectifiée dans le docstring du haut et laissée intacte ici — la même erreur
 * qu'un `findIndex` sur une chaîne non unique, rejouée sur la prose : une chose à deux endroits,
 * un seul apparié.*
 */
export function environnementDeProduction(): NodeJS.ProcessEnv {
  // Pas `NodeJS.ProcessEnv` à la construction : `next` y déclare `NODE_ENV` obligatoire
  // (next/types/global.d.ts), et cet environnement ne le porte que si la production le pose.
  const env: Record<string, string> = {};
  for (const v of VARIABLES_DE_PRODUCTION) {
    const val = process.env[v];
    if (val !== undefined) env[v] = val;
  }
  return env as NodeJS.ProcessEnv;
}

export function lancerLaGate(
  script: string,
  cwd: string,
  args: string[] = []
): { code: number; sortie: string } {
  try {
    const stdout = execFileSync(process.execPath, [TSX_DU_DEPOT, resolve(script), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: environnementDeProduction(),
    });
    return { code: 0, sortie: stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * 🔴 UNE FAUTE PAR GATE MESURE UNE GATE, PAS UN CONTRÔLE.
 *
 * Motif de `mutation` au 21e tour, et c'est la faiblesse que j'avais moi-même nommée en lançant
 * le tour — elle l'a confirmée par la mesure :
 *
 * ```
 * return fautes
 *   -> !argv.includes('--prove') ? fautes.filter(f => f.famille === 'dep_inconnue') : fautes
 *      spec 21/21 VERTS · gov:tasks 0 · --prove 0 · --verifie-rendu 0
 *      un backlog SANS `statut` et a 999 jours passe a exit 0
 * ```
 *
 * La gate déclare **douze** familles ; mon témoin en exerçait **une**. Toute neutralisation qui
 * préserve la famille injectée et jette les autres reste verte, et le filet `--prove` ne rattrape
 * rien : il se discrimine trivialement par `process.argv` **dans le même processus**.
 *
 * > **Un témoin d'effet prouve la famille qu'il injecte, jamais la gate.** Il n'y a pas de
 * > généralisation gratuite : ce qu'on n'a pas fait rougir, on ne l'a pas gardé.
 *
 * Chaque gate porte donc **plusieurs** fautes, de familles DIFFÉRENTES, et le nom du test les
 * énumère. Ce n'est pas l'exhaustivité — c'est la fin de l'ambiguïté sur ce qui est couvert.
 * ⚠️ Ce que ça ne donne toujours pas : les familles NON listées ici restent sans témoin d'effet.
 * Les nommer une par une est le travail du lot suivant, et le nombre déclaré dans le titre du
 * test est là pour que leur absence se voie.
 */
/**
 * Les gates dont la neutralisation a été MESURÉE au 19e et au 20e tour : sain elles refusent,
 * mutées elles sortent en 0 **en imprimant leur bannière de succès**. C'est ce couple-là que le
 * témoin d'effet rend impossible à obtenir silencieusement.
 */
/**
 * Un geste sur les exigences d'un bac, avec la fusion du MILIEU de son annexe sous la main. Le
 * registre est relu et réécrit dans le bac, jamais dans le dépôt.
 */
export type ExigenceDuBac = {
  id: string;
  texte: string;
  statut: string;
  remplaceePar: string | null;
};
export function surLesExigencesDuBac(
  depot: string,
  geste: (
    exigences: ExigenceDuBac[],
    fusionDuMilieu: ReturnType<typeof fusionsDecidees>[number],
    fusions: ReturnType<typeof fusionsDecidees>
  ) => void
): void {
  const p = join(depot, 'docs/requirements.json');
  const doc = JSON.parse(readFileSync(p, 'utf8')) as { exigences: ExigenceDuBac[] };
  const fusions = fusionsDecidees(readFileSync(join(depot, CHEMIN_ANNEXE), 'utf8'));
  geste(doc.exigences, fusions[Math.floor(fusions.length / 2)]!, fusions);
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

export const GATES_A_TEMOIN_D_EFFET = [
  {
    nom: 'gov:tasks',
    depot: 'partiel' as const,
    vue: 'docs/TASKS.md',
    script: 'scripts/gates/gov-tasks.ts',
    // GOV-093 — la charte donne les chemins de schéma que `gov:tasks` confronte aux `paths`.
    fichiers: [
      'docs/tasks.json',
      'docs/DECISIONS.md',
      'scripts/lot/tasks.schema.json',
      'docs/CHARTE-AGENTS.md',
    ],
    // Une dépendance vers une tâche qui n'existe pas : faute RÉELLE, contrôlée par la gate.
    fautes: [
      {
        famille: 'dep_inconnue',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { taches: { deps?: string[] }[] };
          doc.taches[0]!.deps = [...(doc.taches[0]!.deps ?? []), 'XXX-999'];
          writeFileSync(
            p,
            `${JSON.stringify(doc, null, 2)}
`,
            'utf8'
          );
        },
      },
      {
        // Famille DIFFÉRENTE : le mutant qui ne garde que `dep_inconnue` meurt ici.
        famille: 'schema',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { taches: Record<string, unknown>[] };
          delete doc.taches[0]!.statut;
          writeFileSync(
            p,
            `${JSON.stringify(doc, null, 2)}
`,
            'utf8'
          );
        },
      },
    ],
  },
  {
    nom: 'gov:requirements',
    depot: 'partiel' as const,
    vue: 'docs/REQUIREMENTS.md',
    script: 'scripts/gates/gov-requirements.ts',
    // ⚠️ `docs/REQUIREMENTS-ANNEXE-FUSIONS.md` entre ici avec GOV-039 : la garde confronte le texte
    // DÉCIDÉ des fusions au texte APPLIQUÉ, et son absence du bac ferait sortir le binaire sur
    // « annexe introuvable » — un rouge, mais pas CELUI que le témoin d'effet mesure.
    fichiers: [
      'docs/requirements.json',
      'docs/tasks.json',
      'docs/REQUIREMENTS-ANNEXE-FUSIONS.md',
      'scripts/lot/requirements.schema.json',
    ],
    // Un champ obligatoire retiré : le schéma doit le refuser.
    fautes: [
      {
        famille: 'schema',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/requirements.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as {
            exigences: Record<string, unknown>[];
          };
          delete doc.exigences[0]!.statut;
          writeFileSync(
            p,
            `${JSON.stringify(doc, null, 2)}
`,
            'utf8'
          );
        },
      },
      {
        // Famille DIFFÉRENTE : un identifiant dupliqué, que le schéma seul ne voit pas.
        famille: 'id_double',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/requirements.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { exigences: { id: string }[] };
          doc.exigences[1]!.id = doc.exigences[0]!.id;
          writeFileSync(
            p,
            `${JSON.stringify(doc, null, 2)}
`,
            'utf8'
          );
        },
      },
      // 🔴 Les CINQ familles des fusions (GOV-039), chacune par le BINAIRE en mode normal — refus
      // A10 · mutation sur la PR 55 : l'appelant normal pouvait écarter ces familles, et le rouge
      // d'origine de la PR sortait en exit 0 sans qu'aucun test ne rougisse, car rien ne lançait
      // le binaire que sur un dépôt SAIN ou sous `--prove`.
      {
        famille: 'annexe_sans_fusion',
        appliquer: (depot: string) => {
          writeFileSync(join(depot, CHEMIN_ANNEXE), '# une annexe sans aucune puce\n', 'utf8');
        },
      },
      {
        famille: 'fusion_survivante_inconnue',
        appliquer: (depot: string) =>
          surLesExigencesDuBac(depot, (ex, f) => {
            ex.find((e) => e.id === f.survivante)!.statut = 'retiree';
          }),
      },
      {
        famille: 'fusion_absorbee_non_marquee',
        appliquer: (depot: string) =>
          surLesExigencesDuBac(depot, (ex, f) => {
            ex.find((e) => e.id === f.absorbees[0])!.remplaceePar = null;
          }),
      },
      {
        // Le rouge d'origine de la PR 55 : le texte de REQ-QA-014 privé de ses clauses décidées.
        famille: 'texte_decide_perdu',
        appliquer: (depot: string) =>
          surLesExigencesDuBac(depot, (ex, _f, fusions) => {
            const f = fusions.find((x) => x.survivante === 'REQ-QA-014')!;
            const e = ex.find((x) => x.id === 'REQ-QA-014')!;
            for (const m of marqueursDe(f.decide)) e.texte = e.texte.split(m).join('(retiré)');
          }),
      },
      // ⚠️ `dette_texte_decide_perimee` n'a PLUS de témoin par le binaire, et ce n'est pas un oubli.
      // Le registre `DETTE_TEXTE_DECIDE` est VIDE depuis le 2026-09-19 (les 25 clauses résorbées,
      // sur décision de Will) : cette famille ne rougit que sur une dette DÉCLARÉE, et aucune
      // donnée du bac ne peut en déclarer une — le binaire lit le registre dans son propre code.
      // Son témoin d'appelant passe par `modeNormal()`, la fonction que le binaire exécute, avec
      // une dette fabriquée : `titres-de-test-resolvent.spec.ts`, « le mode NORMAL sort en 1 et
      // NOMME `dette_texte_decide_perimee` sur une dette fabriquée ».
    ],
  },
  {
    // 🔴 AJOUTÉE au 22e tour, sur motif BLOQUANT de `mutation`. Elle est la seule des trois
    // générateurs qui était gardée par du TEXTE seul, et le refus que son mutant neutralise est
    // INTRODUIT par cette PR. Ses entrées sont le dépôt lui-même : `titresResolus` lance
    // `npx vitest list`, donc il lui faut les specs, leurs sources, et le lanceur.
    nom: 'gov:trace',
    script: 'scripts/gates/gov-trace.ts',
    vue: 'docs/TRACABILITE.md',
    depot: 'complet' as const,
    fichiers: [] as readonly string[],
    fautes: [
      {
        famille: 'tache_sans_req',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as {
            taches: { statut: string; reqs: string[] }[];
          };
          const livree = doc.taches.find((t) => t.statut === 'fusionnee' && t.reqs.length > 0)!;
          livree.reqs = [];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        },
      },
      {
        // Famille DIFFÉRENTE : une tâche livrée promet un test qui n'existe pas.
        famille: 'test_promis_absent',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as {
            taches: { statut: string; reqs: string[]; tests?: Record<string, string[]> }[];
          };
          const livree = doc.taches.find(
            (t) => t.statut === 'fusionnee' && t.tests && Object.keys(t.tests).length > 0
          )!;
          const req = Object.keys(livree.tests!)[0]!;
          livree.tests![req] = ['tests/unit/gouvernance/ce-fichier-n-existe-pas.spec.ts'];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        },
      },
    ],
  },
] as const;

/**
 * 🔴 DÉCLARÉE, ET NON DÉRIVÉE — et c'est le RENVERSEMENT de ma première rédaction.
 *
 * J'avais dérivé cette liste du disque : les gardes de `scripts/gates/` qui importent
 * `fichiersSuivisOuRefus`. `mutation` l'a mise en défaut DEUX FOIS, et la seconde est décisive :
 * en remplaçant la primitive par une marche `readdirSync` avec `catch { return [] }` — sans jamais
 * réintroduire `'ls-files'` — la garde **s'évapore des trois `describe`**, 21/21 verts, le total
 * collecté passant de 59 à 56 sans un bruit.
 *
 * 🔑 **Une population DÉRIVÉE DE LA PRÉSENCE DU CORRECTIF ne verra jamais celui qui le PERD.**
 * C'est exactement la garde qu'on veut : éprouver des fichiers qui POURRAIENT perdre le correctif.
 * Les y chercher par le correctif rend l'épreuve vide au moment précis où elle compterait.
 *
 * La liste est donc TAPÉE — une déclaration, que seul un humain retire — et la réciproque
 * ci-dessous attrape l'oubli inverse : toute garde qui importe la primitive doit y figurer.
 */
export const GARDES_QUI_BALAIENT = [
  // 🔧 SEPTIÈME sur la première base de GOV-037 (`6237f96`), qui l'a déclarée : `gov-attributions.ts` balaie les VINGT premières lignes de
  // tout fichier suivi de `scripts/` et `tests/` pour y confronter les identifiants de tâche. La
  // réciproque ci-dessous a rougi en la nommant — elle n'a pas été devinée.
  'scripts/gates/gov-attributions.ts',
  // GOV-030 — `gov-check` établit son périmètre AVANT de lire ses sources, précisément pour que
  // son refus depuis `packages/` porte le nom `perimetre_illisible` au lieu d'un `ENOENT` muet.
  'scripts/gates/gov-check.ts',
  'scripts/gates/gov-conventions.ts',
  'scripts/gates/gov-entite.ts',
  'scripts/gates/gov-identifiants.ts',
  'scripts/gates/gov-preseance.ts',
  'scripts/gates/gov-publication.ts',
  'scripts/gates/lexique-apporteurs.ts',
  // GOV-030 (`partners/ADR-0011`) — `partners:schema:enums` lit sa portée dans les fichiers SUIVIS,
  // quelle que soit leur extension.
  'scripts/gates/schema-enums.ts',
  // DM-01 — `journal:sans-pii` cherche un second écrivain de la table `evenements` dans les fichiers
  // SUIVIS sous `src/` et `scripts/`.
  'scripts/gates/journal-sans-pii.ts',
  // SEC-08 — `securite:schema-pii` juge les chemins d'écriture dans les fichiers SUIVIS sous `src/`.
  'scripts/gates/schema-pii.ts',
  // DM-02 — `partners:migrations:additive` lit TOUTES les migrations SUIVIES, pas celles de la PR.
  'scripts/gates/migrations-additive.ts',
  // UX-P0-01 — `ux:exhaustivite` établit son périmètre par la primitive pour que les composants
  // `.tsx` qu'elle relit soient ceux que `git` suit, et pour que son refus porte le nom
  // `perimetre_illisible` plutôt qu'une erreur de lecture muette. La réciproque ci-dessous a rougi
  // en la nommant — elle n'a pas été devinée.
  'scripts/gates/ux-exhaustivite.ts',
  // GOV-046 — `perf:budgets` juge les routes des fichiers SUIVIS sous `src/`. Elle rendait `[]`
  // quand `src/` manquait ; elle établit désormais son périmètre par la source unique.
  'scripts/gates/perf-budgets.ts',
  // JUR-T02 — `ssot:seuils` juge les littéraux de seuil et de délai dans les fichiers SUIVIS sous
  // `src/`. Elle lançait son propre `git ls-files` ; le témoin de la source unique l'a nommée.
  'scripts/gates/seuils-ssot.ts',
  // JUR-T26 — les trois gardes de la charte qui balaient l'espace (ou la portée apporteur et
  // `src/server/pdf/`) dans les fichiers SUIVIS. La réciproque ci-dessous a rougi en les nommant.
  'scripts/gates/jur-aucun-agregat-reseau.ts',
  'scripts/gates/jur-aucune-progression.ts',
  // SEC-46 — `csp:inline` juge les fichiers SUIVIS sous `src/app/`.
  'scripts/gates/csp-inline.ts',
  // UX-P1-10 — `notifications:lue-at-inerte` juge les fichiers SUIVIS sous `src/` et les migrations.
  'scripts/gates/notifications-lue-at-inerte.ts',
  'scripts/gates/jur-lexique-social.ts',
  // QA-T69 — `jur:copy-indicative-partners` juge les fichiers SUIVIS de `src/content/` et `docs/maquettes/`.
  'scripts/gates/jur-copy-indicative.ts',
  // SEC-17 — `securite:roles` dérive les actions et les routes de la console des fichiers SUIVIS
  // sous `src/app/(console)/` et `src/server/console/`.
  'scripts/gates/roles.ts',
] as const;
