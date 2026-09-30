/**
 * registre-des-refus.ts — chaque sortie non nulle DÉCLARÉE porte un NOM (GOV-045, REQ-GOV-012,
 * REQ-GOV-024 / RM-02). Lu par `tests/unit/gouvernance/cliquet-nomme-chaque-refus.spec.ts` et par
 * le cliquet de `tests/unit/gouvernance/refus-de-rendre-et-de-publier.spec.ts`.
 *
 * 🔴 LE DÉFAUT MESURÉ. Le cliquet des refus gardait un COMPTE par fichier (`total`, `porte`).
 * Un échange ENTRE fichiers rougissait déjà ; un échange DANS un même fichier — retirer un refus,
 * en ajouter un autre ailleurs dans le même fichier — laissait le compte intact et le cliquet vert.
 * À l'intérieur d'un fichier déclaré, les sorties étaient interchangeables.
 *
 * CE QUE CE MODULE FAIT. Il donne à chaque sortie une IDENTITÉ lisible, calculée sur l'arbre
 * syntaxique : sa nature (code, commentaire, chaîne), la portée nommée qui l'englobe, la condition
 * qui la garde, et son argument. `REFUS_NOMMES` fige ces identités pour chaque fichier déclaré ;
 * `confronterNoms` rend, en les NOMMANT, celles qui manquent et celles qui ne sont pas déclarées.
 * Retirer un refus fait donc rougir CE refus-là, pas seulement son fichier.
 *
 * CE QU'IL NE FAIT PAS. Il ne prouve pas qu'un refus SORT pour de vrai : c'est l'office des
 * témoins d'effet du cliquet. Il ne nomme que les fichiers DÉCLARÉS ; les autres sont comptés et
 * nommés par la spec, jamais tus.
 */
import { readdirSync } from 'node:fs';
import ts from 'typescript';

/**
 * Les extensions que le compilateur connaît (`ts.Extension`), DÉRIVÉES et jamais tapées —
 * données `.json` comprises.
 */
const EXTENSIONS_DE_CODE: string[] = Object.values(ts.Extension);

/**
 * L'énumération du DISQUE, pas de l'index : un script neuf non suivi porteur d'une sortie doit
 * être vu (RM-14). Source unique du cliquet et de sa spec nommée.
 */
export function enumererFichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : enumererFichiers(chemin);
    return EXTENSIONS_DE_CODE.some((x) => e.name.endsWith(x)) ? [chemin] : [];
  });
}

/**
 * Le motif des sorties non nulles — SOURCE UNIQUE, importée par le cliquet (RM-01). Il lit une
 * EXPRESSION, pas une valeur : un argument variable compte comme non nul.
 *
 * DEUX FORMES, toutes deux légitimes et jamais unifiées : l'appel de sortie IMMÉDIATE, et
 * l'affectation du code de sortie, DIFFÉRÉE — celle qui laisse le processus finir d'imprimer.
 * Le motif n'a longtemps vu que la première ; deux refus de `scripts/plan-state/build.ts` sont
 * entrés par la seconde sans que le cliquet bouge (GOV-054). L'affectation nulle ne compte pas,
 * la comparaison (`===`) non plus.
 */
export const SORTIE_NON_NULLE = /process\.exit(?:\(\s*(?!0\s*\))|Code\s*=(?!=)(?!\s*0(?![\w.])))/g;

/** Le nombre de sorties non nulles d'un texte, au sens du motif ci-dessus. */
export function compterSorties(texte: string): number {
  return (texte.match(new RegExp(SORTIE_NON_NULLE.source, 'g')) ?? []).length;
}

/**
 * La confrontation du cliquet, fichier par fichier : ce que le disque AJOUTE à la base contre ce
 * que le registre `declares` déclare. Rend les écarts NOMMÉS — vide si rien.
 */
export function ajoutsNonDeclares(
  ajoutes: ReadonlyMap<string, number>,
  declares: Readonly<Record<string, { total: number }>>
): string[] {
  const ecarts: string[] = [];
  for (const [f, n] of [...ajoutes].sort(([a], [b]) => a.localeCompare(b))) {
    const d = declares[f];
    if (d === undefined) {
      ecarts.push(`${f} ajoute ${n} sortie(s) non nulle(s) et n’est PAS déclaré`);
    } else if (d.total !== n) {
      ecarts.push(`${f} : ${n} sortie(s) ajoutée(s), ${d.total} déclarée(s)`);
    }
  }
  return ecarts;
}

/** Une sortie repérée dans un texte, avec l'identité qui la nomme. */
export interface SortieNommee {
  nom: string;
  /** Position du motif dans le texte (index de caractère). */
  position: number;
  /** Longueur du motif reconnu à cette position. */
  longueur: number;
  /** Ligne, comptée à partir de 1 — pour le message, jamais pour l'identité (elle pourrit). */
  ligne: number;
}

const LONGUEUR_MAX = 60;

function court(texte: string): string {
  const plat = texte.replace(/\s+/g, ' ').trim();
  return plat.length > LONGUEUR_MAX ? `${plat.slice(0, LONGUEUR_MAX - 1)}…` : plat;
}

function genreDeScript(chemin: string): ts.ScriptKind {
  if (/\.(c|m)?jsx?$/.test(chemin))
    return chemin.endsWith('x') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  if (chemin.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.(c|m)?ts$/.test(chemin)) return ts.ScriptKind.TS;
  return ts.ScriptKind.Unknown;
}

/** Le nœud le plus profond dont l'étendue (trivia comprise) contient `position`. */
function noeudA(racine: ts.Node, position: number): ts.Node {
  let courant: ts.Node = racine;
  for (;;) {
    let enfant: ts.Node | undefined;
    courant.forEachChild((n) => {
      if (enfant === undefined && n.getFullStart() <= position && position < n.getEnd()) enfant = n;
    });
    if (enfant === undefined) return courant;
    courant = enfant;
  }
}

/** Le nom d'une fonction, ou une description stable de l'endroit où elle est passée. */
function nomDeFonction(f: ts.Node): string | null {
  if ((ts.isFunctionDeclaration(f) || ts.isMethodDeclaration(f)) && f.name) return f.name.getText();
  if (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) {
    if (ts.isFunctionExpression(f) && f.name) return f.name.getText();
    const p = f.parent;
    if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) {
      return p.name.getText();
    }
    if (ts.isCallExpression(p)) {
      const premier = p.arguments[0];
      const titre =
        premier && (ts.isStringLiteral(premier) || ts.isNoSubstitutionTemplateLiteral(premier))
          ? `(${court(premier.text)})`
          : '';
      return `${court(p.expression.getText())}${titre}`;
    }
    return null;
  }
  return null;
}

function estUneFonction(n: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n)
  );
}

function natureA(noeud: ts.Node, position: number): 'code' | 'commentaire' | 'chaîne' {
  if (noeud.kind !== ts.SyntaxKind.SourceFile && noeud.getStart() > position) return 'commentaire';
  if (noeud.kind === ts.SyntaxKind.SourceFile && position >= noeud.getEnd() - 1)
    return 'commentaire';
  if (
    ts.isStringLiteral(noeud) ||
    ts.isNoSubstitutionTemplateLiteral(noeud) ||
    ts.isTemplateHead(noeud) ||
    ts.isTemplateMiddle(noeud) ||
    ts.isTemplateTail(noeud) ||
    ts.isRegularExpressionLiteral(noeud)
  ) {
    return 'chaîne';
  }
  return noeud.kind === ts.SyntaxKind.SourceFile ? 'commentaire' : 'code';
}

/** L'argument de la sortie : celui de l'appel dans du code, la fin de ligne ailleurs. */
function argumentDe(noeud: ts.Node | null, texte: string, fin: number, nature: string): string {
  if (noeud !== null && nature === 'code') {
    for (let n: ts.Node | undefined = noeud; n; n = n.parent) {
      // La sortie DIFFÉRÉE est une affectation : son argument est la valeur affectée, préfixée
      // de `=` pour qu'elle ne se confonde jamais avec la sortie immédiate de même argument.
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return `= ${court(n.right.getText())}`;
      }
      if (ts.isCallExpression(n)) return court(n.arguments.map((a) => a.getText()).join(', '));
    }
  }
  const finDeLigne = texte.indexOf('\n', fin);
  return court(texte.slice(fin, finDeLigne < 0 ? texte.length : finDeLigne));
}

/**
 * Les sorties non nulles d'un texte, chacune NOMMÉE. Une identité qui se répète reçoit un rang
 * (`#2`, `#3`) : c'est une identité FAIBLE — retirer la première renomme la seconde — et la spec
 * exige qu'aucune identité déclarée n'en porte.
 */
export function sortiesNommees(chemin: string, texte: string): SortieNommee[] {
  const genre = genreDeScript(chemin);
  const source =
    genre === ts.ScriptKind.Unknown
      ? null
      : ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true, genre);
  const brutes: (Omit<SortieNommee, 'nom'> & { base: string })[] = [];
  const motif = new RegExp(SORTIE_NON_NULLE.source, 'g');
  for (const m of texte.matchAll(motif)) {
    const position = m.index!;
    const ligne = texte.slice(0, position).split('\n').length;
    const fin = position + m[0].length;
    if (source === null) {
      brutes.push({
        position,
        longueur: m[0].length,
        ligne,
        base: `texte › ${argumentDe(null, texte, fin, 'texte')}`,
      });
      continue;
    }
    const noeud = noeudA(source, position);
    const nature = natureA(noeud, position);
    const portees: string[] = [];
    // La CHAÎNE des conditions qui gardent la sortie dans sa fonction, de la plus externe à la
    // plus interne : deux refus jumeaux (`si fautes.length > 0`) se distinguent par le bloc qui
    // les englobe (`si --prove` ou non).
    const conditions: string[] = [];
    let dansLaFonction = true;
    let enfant: ts.Node = noeud;
    for (let n: ts.Node | undefined = noeud; n; enfant = n, n = n.parent) {
      if (dansLaFonction && ts.isIfStatement(n) && enfant !== n.expression && n !== noeud) {
        const c = court(n.expression.getText());
        conditions.unshift(enfant === n.elseStatement ? `sinon ${c}` : `si ${c}`);
      }
      if (
        dansLaFonction &&
        ts.isConditionalExpression(n) &&
        enfant !== n.condition &&
        n !== noeud
      ) {
        const c = court(n.condition.getText());
        conditions.unshift(enfant === n.whenFalse ? `sinon ${c}` : `si ${c}`);
      }
      if (dansLaFonction && ts.isCatchClause(n)) conditions.unshift('catch');
      if (estUneFonction(n)) {
        dansLaFonction = false;
        const nom = nomDeFonction(n);
        if (nom !== null) portees.unshift(nom);
      }
    }
    const arg = argumentDe(noeud, texte, fin, nature);
    const prefixe = nature === 'code' ? '' : `${nature} · `;
    const garde = conditions.length > 0 ? conditions.join(' › ') : '∅';
    const base = `${prefixe}${portees.join(' › ') || 'module'} › ${garde} › (${arg})`;
    brutes.push({ position, longueur: m[0].length, ligne, base });
  }
  const vus = new Map<string, number>();
  return brutes.map(({ base, ...reste }) => {
    const rang = (vus.get(base) ?? 0) + 1;
    vus.set(base, rang);
    return { ...reste, nom: rang === 1 ? base : `${base} #${rang}` };
  });
}

/** Ce que la confrontation d'un fichier à ses noms déclarés rend — deux listes NOMMÉES. */
export interface Confrontation {
  /** Déclarées et introuvables : un refus a été RETIRÉ (ou déplacé, ou réécrit). */
  manquantes: string[];
  /** Présentes et non déclarées : une sortie est ENTRÉE sans nom. */
  nonDeclarees: string[];
}

export function confronterNoms(
  chemin: string,
  texte: string,
  declares: readonly string[]
): Confrontation {
  const presents = sortiesNommees(chemin, texte).map((s) => s.nom);
  const setPresents = new Set(presents);
  const setDeclares = new Set(declares);
  return {
    manquantes: declares.filter((n) => !setPresents.has(n)),
    nonDeclarees: presents.filter((n) => !setDeclares.has(n)),
  };
}

/**
 * LES IDENTITÉS FIGÉES, fichier déclaré par fichier déclaré. La liste des FICHIERS n'est pas
 * une seconde source : la spec l'exige ÉGALE aux clés du registre `declares` du cliquet, et
 * chaque nom égal à ce que `sortiesNommees` calcule sur le disque. Une identité se met à jour
 * quand son refus change de portée, de condition ou d'argument — c'est voulu : un refus déplacé
 * est un refus qu'on doit regarder.
 */
export const REFUS_NOMMES: Readonly<Record<string, readonly string[]>> = {
  'scripts/gates/aucun-annee-de-naissance.ts': [
    'principal(process.argv.slice(2)).then › ∅ › (code)',
    'principal(process.argv.slice(2)).then › ∅ › (2)',
  ],
  'scripts/gates/gov-attestation.ts': [
    "module › si !process.argv.includes('--en-ligne') › (2)",
    'module › si !existsSync(CHEMIN_TACHES) › (1)',
    'module › si fautes.length > 0 › (1)',
  ],
  'scripts/gates/gov-attributions.ts': [
    'module › si process.argv[1] !== undefined && /gov-attributions[.](ts|js… › (verdict.code)',
  ],
  'scripts/gates/gov-check.ts': ['module › si APPELE_DIRECTEMENT › (decision.code)'],
  'scripts/gates/gov-conventions.ts': [
    "module › si process.argv.includes('--prove') › (await prouver())",
    "module › sinon process.argv.includes('--prove') › (1)",
  ],
  'scripts/gates/gov-entite.ts': [
    "module › si APPELE_DIRECTEMENT › si iCorps >= 0 && !process.argv.includes('--prove') › si numero === undefined || !/^\\d+$/.test(numero) › (2)",
    "module › si APPELE_DIRECTEMENT › si iCorps >= 0 && !process.argv.includes('--prove') › catch › (2)",
    "module › si APPELE_DIRECTEMENT › si iCorps >= 0 && !process.argv.includes('--prove') › (verdict.code)",
    'module › si APPELE_DIRECTEMENT › si iCorps >= 0 › (prouverCorpsPublie())',
    "module › si APPELE_DIRECTEMENT › si process.argv.includes('--prove') › (prouver())",
    "module › si APPELE_DIRECTEMENT › sinon process.argv.includes('--prove') › si fautes.length > 0 › (1)",
  ],
  'scripts/gates/deploy-verify.ts': [
    'module › si APPELE_DIRECTEMENT › si mode === null › (1)',
    "mode(argv.filter((a) => a !== '--declencher' && a !== '--ve… › ∅ › (= code)",
    "mode(argv.filter((a) => a !== '--declencher' && a !== '--ve… › ∅ › (= 1)",
  ],
  'scripts/gates/gov-pr.ts': [
    'lireDepot › si !existsSync(f) › (1)',
    'prParGh › si !verdictTete.concordent › (1)',
    'prParEvenement › catch › (1)',
    'remplacer › si !texte.includes(cible) › (1)',
    'remplacerBloc › si d < 0 || f < 0 › (1)',
    'module › si LANCE_EN_SCRIPT › si ecarts.length > 0 › (1)',
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si base.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si f.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si !f.some((x) => x.famille === t.famille) › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si sansTemoin.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si nonDeclarees.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › si iPr >= 0 || iApres >= 0 › si !numero || !/^\\d+$/.test(numero) › (1)',
    'module › si LANCE_EN_SCRIPT › si iPr >= 0 || iApres >= 0 › catch › (1)',
    'module › si LANCE_EN_SCRIPT › (1)',
  ],
  'scripts/gates/gov-requirements.ts': [
    'sources › si !existsSync(f) › (1)',
    'sources › si refus.length > 0 › (1)',
    "module › si LANCE_EN_SCRIPT && (process.argv.includes('--render') || pr… › si fautes.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT && (process.argv.includes('--render') || pr… › si process.argv.includes('--verifie-rendu') › si !existsSync(CHEMIN_VUE) › (1)",
    "module › si LANCE_EN_SCRIPT && (process.argv.includes('--render') || pr… › si process.argv.includes('--verifie-rendu') › si surDisque !== normaliserFins(rendu) › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si base.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si !f.some((x) => x.famille === t.famille) › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si sansTemoin.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › (r.code)',
  ],
  'scripts/gates/gov-tasks.ts': [
    'module › si ecarts.length > 0 › (1)',
    'module › si LANCE_EN_SCRIPT › si !existsSync(f) › (1)',
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--render') || process.argv.includes(… › si fautes.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--render') || process.argv.includes(… › si process.argv.includes('--verifie-rendu') › si !existsSync(CHEMIN_VUE) › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--render') || process.argv.includes(… › si process.argv.includes('--verifie-rendu') › si surDisque !== normaliserFins(rendu) › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si base.length > 0 › (1)",
    'choisir › si !t › (1)',
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si f.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si !f.some((x) => x.famille === t.famille) › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si sansTemoin.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › (1)',
  ],
  'scripts/gates/gov-trace.ts': [
    'module › si ecarts.length > 0 › (1)',
    'motifsVitest › si include.length === 0 › (1)',
    'chargerUnivers › si !existsSync(f) › (1)',
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si fautesBase.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si f.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si !f.some( (x) => x.famille === t.famille && (t.attendu === u… › (1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--prove') › si sansTemoin.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--render') › si fautesAvantRendu.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--verifier') › si fautes.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › (1)',
  ],
  'scripts/gates/harnais-mcp.ts': ['principal().then › ∅ › (code)'],
  'scripts/gates/journal-sans-pii.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/jur-aucun-agregat-reseau.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/jur-aucune-progression.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/jur-grille-chiffree.ts': [
    "module › si APPELE_DIRECTEMENT › si process.argv.includes('--prove') › si !familles.includes(t.famille as never) › (1)",
    "module › si APPELE_DIRECTEMENT › si process.argv.includes('--prove') › si fautes.length > 0 › (1)",
    'module › si APPELE_DIRECTEMENT › si !existsSync(GABARIT) › (1)',
    'module › si APPELE_DIRECTEMENT › si fautes.length > 0 › (1)',
  ],
  'scripts/gates/jur-lexique-social.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/jur-revue-apporteur-facing.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/lexique-apporteurs.ts': [
    'echouer › ∅ › (1)',
    'module › si APPELE_DIRECTEMENT › (1)',
  ],
  'scripts/gates/maquettes-validees.ts': [
    "module › si LANCE_EN_SCRIPT › (process.argv.includes('--prove') ? prouver() : juger())",
  ],
  'scripts/gates/migrations-additive.ts': [
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si echecs.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › si verdict.fautes.length > 0 › (1)',
    // QA-T11 : la porte D — le semis sans table, l'usage de `--pr`, la colonne encore lue.
    "module › si LANCE_EN_SCRIPT && argument('--semis') !== undefined › (s.tables.length > 0 ? 0 : 1)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--pr') › si base === undefined || deploye === undefined › (2)",
    "module › si LANCE_EN_SCRIPT && process.argv.includes('--pr') › si v.fautes.length > 0 › (1)",
  ],
  'scripts/gates/perf-budgets.ts': [
    'lireVue › si !existsSync(c) › (1)',
    'module › si APPELE_DIRECTEMENT › si rendre || verifier › (rendreOuVerifier(verifier))',
    "module › si APPELE_DIRECTEMENT › sinon rendre || verifier › si process.argv.includes('--prove') › (prouver())",
    "module › si APPELE_DIRECTEMENT › sinon rendre || verifier › sinon process.argv.includes('--prove') › (controlerLeDepot())",
  ],
  'scripts/gates/rate-famille.ts': [
    "(process.argv.includes('--prove') ? prouver() : controler()… › ∅ › (code)",
  ],
  'scripts/gates/red-first.ts': ['module › si APPELE_DIRECTEMENT › (decision.code)'],
  'scripts/gates/roles.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  // QA-T07 — la gate semgrep. UNE sortie non nulle, commune aux deux modes, dont le code vient de
  // `verdict.code` : ce verdict est rendu par des fonctions PURES (`jugerReel`, `jugerPreuve`,
  // `jugerEnsemble`) que `semgrep-regles-maison.spec.ts` voit rendre chaque famille, et la sortie
  // elle-même est vue en 0 sur le dépôt réel et en 1 sur une copie des règles portant une règle
  // sans témoin.
  //
  // ⚠️ Cette prose n'écrit PAS l'appel de sortie en clair, et c'est voulu : `SORTIE_NON_NULLE` lit
  // le TEXTE du fichier, sans distinguer un appel d'une citation. Une première rédaction le citait
  // entre accents graves ; le cliquet a compté le commentaire comme une sortie et a refusé ce
  // fichier comme non déclaré (porte A de 95fd2bc). Le détecteur a raison de ne pas deviner : c'est
  // à la prose de ne pas ressembler à du code.
  'scripts/gates/semgrep.ts': ['module › si APPELE_DIRECTEMENT › (verdict.code)'],
  'scripts/gates/schema-cents.ts': [
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si echecs.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › si fautes.length > 0 › (1)',
  ],
  'scripts/gates/schema-enums.ts': [
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si sansTemoin.length > 0 › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si !rougies.includes(t.famille) › (1)",
    "module › si LANCE_EN_SCRIPT › si process.argv.includes('--prove') › si fautes.length > 0 › (1)",
    'module › si LANCE_EN_SCRIPT › si !existsSync(CHEMIN_SCHEMA) › (2)',
    'module › si LANCE_EN_SCRIPT › si fautes.length > 0 › (1)',
  ],
  'scripts/gates/schema-pii.ts': ['module › si LANCE_EN_SCRIPT › (decision.code)'],
  'scripts/gates/seuils-ssot.ts': [
    "module › si process.argv[1] !== undefined && /seuils-ssot[.](ts|js)$/.t… › si process.argv.includes('--prove') › si rate > 0 › (1)",
    'module › si process.argv[1] !== undefined && /seuils-ssot[.](ts|js)$/.t… › si fautes.length > 0 › (1)',
  ],
  'scripts/gates/ux-exhaustivite.ts': [
    'echouer › ∅ › (1)',
    'module › si APPELE_DIRECTEMENT › si fautes.length > 0 › (1)',
  ],
  'scripts/lot/cloture.ts': ['rattraperLePasse › si horsPassif.length > 0 › (= 1)'],
  'scripts/lot/corps-de-pr.ts': [
    'caseRevues › si !verdictTete.concordent › (1)',
    "module › si process.argv[1]?.endsWith('corps-de-pr.ts') › si prBrut === null || !/^\\d+$/.test(prBrut) › (1)",
    "module › si process.argv[1]?.endsWith('corps-de-pr.ts') › si !gabarit || !sortie › (1)",
    "module › si process.argv[1]?.endsWith('corps-de-pr.ts') › catch › (1)",
  ],
  'scripts/lot/fichiers-suivis.ts': [
    'entreesSuiviesOuRefus › catch › si e instanceof PerimetreEntame › (1)',
    'entreesSuiviesOuRefus › catch › (1)',
  ],
  'scripts/mutation/pr.ts': ['module › si APPELE_DIRECTEMENT › (issue.code)'],
  'scripts/mutation/rapport.ts': ['module › si APPELE_DIRECTEMENT › (decision.code)'],
  'scripts/plan-state/build.ts': [
    'module › sinon !LANCE_EN_SCRIPT › si MODE_VERIFIER › si !existsSync(CHEMIN_VUE) › (= 1)',
    'module › sinon !LANCE_EN_SCRIPT › si MODE_VERIFIER › sinon !existsSync(CHEMIN_VUE) › si chargerRubriquesDues().length === 0 › (= 1)',
    'module › sinon !LANCE_EN_SCRIPT › si MODE_VERIFIER › sinon !existsSync(CHEMIN_VUE) › sinon chargerRubriquesDues().length === 0 › si ecarts.length > 0 › (= 1)',
    'module › sinon !LANCE_EN_SCRIPT › sinon MODE_VERIFIER › si questions.length > PLAFOND_QUESTIONS › (= 1)',
  ],
  'scripts/prevol.ts': [
    'etapesDeLaPorteA › si !estObjet(job) › (1)',
    'etapesDeLaPorteA › si !Array.isArray(etapes) › (1)',
    "etapesDeLaPorteA › si substitution || commande.includes('\\n') › (1)",
    'etapesDeLaPorteA › si jouees.length === 0 › (1)',
    'courir › si !existsSync(CI) › (1)',
    'courir › ∅ › (1)',
  ],
  'scripts/vues/fusion.ts': ['module › si APPELE_DIRECTEMENT › (issue.code)'],
  'scripts/vues/rendre-apres-fusion.ts': ['module › si APPELE_DIRECTEMENT › (issue.code)'],
};
