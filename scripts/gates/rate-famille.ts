/**
 * rate-famille.ts — la garde de famille des compteurs de débit. (SEC-10, REQ-SEC-016)
 *
 * USAGE : pnpm securite:rate-famille          contrôle le dépôt
 *         pnpm securite:rate-famille:prove    un témoin par famille, des contre-témoins verts
 *
 * CE QU'ELLE EMPÊCHE. Un compteur sous l'un des cinq préfixes qui ne dit pas ce qu'il fait quand
 * le cache tombe laisse le défaut décider — et un défaut ouvert échoue ouvert. Le type exige la
 * conduite ; la garde la revérifie, parce qu'un type se contourne (cast, objet construit, JSON).
 * Elle ne se contente pas de LIRE la déclaration : elle EXÉCUTE chaque compteur contre un cache
 * qui lève, et confronte le verdict rendu à la conduite déclarée.
 *
 * SEPT FAMILLES, chacune vue rougir sur son témoin par `--prove` :
 *   `perimetre_vide`         0 compteur au registre, ou 0 fichier de code lu sous `src/` et `scripts/`
 *   `conduite_absente`       un compteur sans conduite sur panne valide — le préfixe est nommé
 *   `conduite_trahie`        exécuté contre un cache qui lève, le verdict n'est pas la conduite
 *                            déclarée, ou ne se dit pas en panne — le préfixe est nommé
 *   `prefixe_hors_famille`   un compteur sous un préfixe hors des cinq, ou dont le nom le dément
 *   `prefixe_hors_registre`  une chaîne ou un gabarit de `src/` ou de `scripts/` qui CONTIENT un
 *                            des cinq préfixes, hors du registre — un compteur écrit à côté de lui
 *   `nom_dynamique`          un appel `limiter(` dont le premier argument n'est pas un littéral
 *                            du registre, ou TOUTE autre référence à `limiter` (alias, `.call`,
 *                            `.apply`, parenthèses, accès par propriété, import d'espace de noms)
 *   `ecart_a_l_exigence`     une limite, une fenêtre ou une conduite DÉCLARÉE qui n'est pas celle
 *                            que le texte de l'exigence source porte — le préfixe est nommé
 *
 * L'analyse passe par le compilateur TypeScript, jamais par une recherche de chaîne : un appel
 * écrit sur deux lignes est un appel. Le périmètre se lit sur le DISQUE, sous toutes les
 * extensions de code : un fichier neuf, pas encore indexé, est lu comme les autres. Toute
 * référence à `limiter` qui n'est pas un appel direct à nom littéral est refusée : échec fermé.
 *
 * LIMITES DÉCLARÉES. Un préfixe reconstitué par concaténation (`'mag' + 'ic:'`) échappe à la
 * lecture statique : il n'a de sens qu'en contournement délibéré. Le registre et cette garde sont
 * exemptés de la lecture des sources : ils portent les préfixes et les noms par construction.
 */

import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import {
  COMPTEURS,
  CONDUITES_SUR_PANNE,
  LIMITE_HORS_DEPOT,
  PREFIXES_DE_FAMILLE,
  limiter,
  magasinDepuis,
  sujetDepuisEmpreinte,
  type ConduiteSurPanne,
  type MagasinDeCompteurs,
  type NomDeCompteur,
  type VerdictDeLimite,
} from '../../src/server/securite/rate-limit';

export const CHEMIN_DU_REGISTRE = 'src/server/securite/rate-limit.ts';
export const CHEMIN_DE_LA_GARDE = 'scripts/gates/rate-famille.ts';
export const CHEMIN_DU_POT_DE_MIEL = 'src/server/securite/pot-de-miel.ts';
const CHEMIN_DES_EXIGENCES = 'docs/requirements.json';
const RACINES = ['src', 'scripts'] as const;

/** Les extensions de code lues, et la façon dont le compilateur les lit. */
const GENRES: Readonly<Record<string, ts.ScriptKind>> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
};

function genreDe(chemin: string): ts.ScriptKind | null {
  const ext = /\.[a-z]+$/.exec(chemin)?.[0] ?? '';
  return GENRES[ext] ?? null;
}

/** Le module du registre, sous toutes les formes d'import qui le désignent. */
const MODULE_DU_REGISTRE = /(^|\/)rate-limit(\.[cm]?[jt]sx?)?$/;

export const FAMILLES = [
  'perimetre_vide',
  'conduite_absente',
  'conduite_trahie',
  'prefixe_hors_famille',
  'prefixe_hors_registre',
  'nom_dynamique',
  'ecart_a_l_exigence',
] as const;
export type Famille = (typeof FAMILLES)[number];

export interface Faute {
  readonly famille: Famille;
  readonly message: string;
}

export interface Fichier {
  readonly chemin: string;
  readonly texte: string;
}

/** Exécute le compteur nommé contre un cache qui lève, et rend son verdict. */
export type Executer = (nom: string) => Promise<VerdictDeLimite>;

export interface Univers {
  readonly registre: Readonly<Record<string, unknown>>;
  readonly fichiers: readonly Fichier[];
  readonly executer: Executer;
  /** Le texte de chaque exigence, par identifiant (`docs/requirements.json`). */
  readonly exigences: Readonly<Record<string, string>>;
}

export interface Releve {
  readonly fautes: readonly Faute[];
  /** Les compteurs DÉCLARÉS ET EXÉCUTÉS en panne, avec la conduite constatée. */
  readonly confrontes: readonly string[];
  readonly fichiersLus: number;
  readonly appelsVus: number;
  /** Les appels à `evaluerPotDeMiel(` hors de son module : les formulaires qui le câblent. */
  readonly appelantsDuPotDeMiel: number;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function estUnDe<T extends string>(liste: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (liste as readonly string[]).includes(v);
}

// ── L'exigence, lue dans son texte ──────────────────────────────────────────────────────────────

export interface ValeursExigees {
  readonly limite: number | typeof LIMITE_HORS_DEPOT;
  readonly fenetreSecondes: number | typeof LIMITE_HORS_DEPOT;
  readonly surPanne: ConduiteSurPanne;
}

const SECONDES_PAR_UNITE: Readonly<Record<string, number>> = { s: 1, min: 60, h: 3600 };

/**
 * Ce que le texte de l'exigence dit du compteur que désigne `ancre` : la conduite est la première
 * `surPanne: …` qui SUIT l'ancre ; la limite et la fenêtre sont le « N / M min » qui la PRÉCÈDE
 * immédiatement, et leur absence veut dire qu'aucune exigence ne les chiffre (hors dépôt).
 */
export function exigenceDuCompteur(texte: string, ancre: string): ValeursExigees | null {
  const i = ancre === '' ? -1 : texte.indexOf(ancre);
  if (i < 0) return null;
  const conduite = /surPanne:\s*(refuser|laisser-passer)/.exec(texte.slice(i + ancre.length));
  if (conduite === null || !estUnDe(CONDUITES_SUR_PANNE, conduite[1])) return null;
  const valeurs = /(\d+)\s*\/\s*(\d+)\s*(s|min|h)\s*$/.exec(texte.slice(0, i));
  if (valeurs === null) {
    return { limite: LIMITE_HORS_DEPOT, fenetreSecondes: LIMITE_HORS_DEPOT, surPanne: conduite[1] };
  }
  return {
    limite: Number(valeurs[1]),
    fenetreSecondes: Number(valeurs[2]) * (SECONDES_PAR_UNITE[valeurs[3] ?? ''] ?? Number.NaN),
    surPanne: conduite[1],
  };
}

function confronterAlExigence(
  u: Univers,
  nom: string,
  d: Record<string, unknown>,
  prefixe: string,
  fautes: Faute[]
): void {
  const source = String(d.source);
  const texte = u.exigences[source];
  const exigee =
    texte === undefined || typeof d.ancre !== 'string' ? null : exigenceDuCompteur(texte, d.ancre);
  if (exigee === null) {
    fautes.push({
      famille: 'ecart_a_l_exigence',
      message:
        `préfixe \`${prefixe}\` — le compteur \`${nom}\` ne se retrouve pas dans ${source} ` +
        `(ancre ${JSON.stringify(d.ancre) ?? 'absente'}) : sa valeur n'a pas de source lisible.`,
    });
    return;
  }
  const ecarts = (['limite', 'fenetreSecondes', 'surPanne'] as const)
    .filter((champ) => d[champ] !== exigee[champ])
    .map(
      (champ) => `${champ} ${JSON.stringify(d[champ])} au lieu de ${JSON.stringify(exigee[champ])}`
    );
  if (ecarts.length > 0) {
    fautes.push({
      famille: 'ecart_a_l_exigence',
      message:
        `préfixe \`${prefixe}\` — le compteur \`${nom}\` déclare ${ecarts.join(', ')} : ` +
        `${source} (« ${d.ancre} ») exige autre chose.`,
    });
  }
}

// ── Le registre, lu puis exécuté ────────────────────────────────────────────────────────────────

async function confronterLeRegistre(
  u: Univers,
  fautes: Faute[],
  confrontes: string[]
): Promise<void> {
  for (const [nom, brut] of Object.entries(u.registre)) {
    const d = estObjet(brut) ? brut : {};
    const prefixe = d.prefixe;
    const prefixeValide =
      estUnDe(PREFIXES_DE_FAMILLE, prefixe) &&
      nom.startsWith(prefixe) &&
      nom.length > prefixe.length;
    if (!prefixeValide) {
      fautes.push({
        famille: 'prefixe_hors_famille',
        message:
          `le compteur \`${nom}\` déclare le préfixe \`${String(prefixe)}\` : la famille est ` +
          `close (${PREFIXES_DE_FAMILLE.join(' ')}) et le nom commence par son préfixe. Un ` +
          `sixième préfixe passe par l'exigence, pas par le code.`,
      });
    }
    const surPanne = d.surPanne;
    if (!estUnDe(CONDUITES_SUR_PANNE, surPanne)) {
      fautes.push({
        famille: 'conduite_absente',
        message:
          `préfixe \`${String(prefixe)}\` — le compteur \`${nom}\` ne déclare aucune conduite ` +
          `sur panne valide (reçu : ${JSON.stringify(surPanne) ?? 'rien'}). Attendu : ` +
          `${CONDUITES_SUR_PANNE.join(' ou ')}. Un défaut ouvert échoue ouvert.`,
      });
    }
    if (!prefixeValide || !estUnDe(CONDUITES_SUR_PANNE, surPanne)) continue;
    confronterAlExigence(u, nom, d, prefixe, fautes);

    let verdict: VerdictDeLimite;
    try {
      verdict = await u.executer(nom);
    } catch (e) {
      fautes.push({
        famille: 'conduite_trahie',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` a LEVÉ au lieu de rendre sa conduite ` +
          `quand le cache tombe : ${(e as Error).message}`,
      });
      continue;
    }
    const attendu = surPanne === 'laisser-passer';
    if (verdict.autorise !== attendu || verdict.panne !== true) {
      fautes.push({
        famille: 'conduite_trahie',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` déclare \`${surPanne}\` et, contre un ` +
          `cache qui lève, rend autorise=${verdict.autorise} panne=${verdict.panne} ` +
          `(motif ${verdict.motif}).`,
      });
      continue;
    }
    confrontes.push(`${nom}→${surPanne} (${verdict.motif})`);
  }
}

// ── Les sources, lues par le compilateur ────────────────────────────────────────────────────────

function estAppelA(nomDeFonction: string, e: ts.Expression): boolean {
  if (ts.isIdentifier(e)) return e.text === nomDeFonction;
  return ts.isPropertyAccessExpression(e) && e.name.text === nomDeFonction;
}

function estChaine(
  n: ts.Node
): n is
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail {
  return (
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    ts.isTemplateHead(n) ||
    ts.isTemplateMiddle(n) ||
    ts.isTemplateTail(n)
  );
}

/** La chaîne est-elle le nom d'un module chargé (import, ré-export, `require`, `import()`) ? */
function designeUnModule(n: ts.Node): boolean {
  const p = n.parent;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return p.moduleSpecifier === n;
  if (ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p) && p.arguments[0] === n) {
    return p.expression.kind === ts.SyntaxKind.ImportKeyword || estAppelA('require', p.expression);
  }
  return false;
}

/** Le seul import admis du registre : des noms, sans espace de noms ni défaut. */
function importNomme(n: ts.ImportDeclaration): boolean {
  const c = n.importClause;
  return (
    c !== undefined &&
    c.name === undefined &&
    c.namedBindings !== undefined &&
    ts.isNamedImports(c.namedBindings)
  );
}

/**
 * L'arbre d'un fichier, construit une fois par objet `Fichier` : `--prove` et les témoins relisent
 * le même disque autant de fois qu'il y a de témoins, et l'arbre ne dépend que du texte.
 */
const ARBRES = new WeakMap<Fichier, ts.SourceFile>();
function arbreDe(f: Fichier): ts.SourceFile {
  let arbre = ARBRES.get(f);
  if (arbre === undefined) {
    const genre = genreDe(f.chemin) ?? ts.ScriptKind.TS;
    arbre = ts.createSourceFile(f.chemin, f.texte, ts.ScriptTarget.Latest, true, genre);
    ARBRES.set(f, arbre);
  }
  return arbre;
}

interface Lecture {
  readonly fautes: readonly Faute[];
  readonly appelsVus: number;
  readonly appelantsDuPotDeMiel: number;
}

/**
 * La lecture d'UN fichier ne dépend que de son texte et des noms du registre : elle est gardée par
 * objet `Fichier` et par jeu de noms, pour que `--prove` et les témoins ne relisent pas le dépôt
 * entier à chaque univers.
 */
const LECTURES = new WeakMap<Fichier, Map<string, Lecture>>();

function lireUnFichier(f: Fichier, noms: ReadonlySet<string>): Lecture {
  const cle = [...noms].sort().join(' ');
  const deja = LECTURES.get(f)?.get(cle);
  if (deja !== undefined) return deja;
  const fautes: Faute[] = [];
  let appelsVus = 0;
  let appelantsDuPotDeMiel = 0;
  const source = arbreDe(f);
  const ou = (n: ts.Node) =>
    `${f.chemin}:${source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1}`;
  const refuser = (n: ts.Node, famille: Famille, message: string): void => {
    fautes.push({ famille, message: `${ou(n)} — ${message}` });
  };
  // Le nom littéral passé à `limiter(` porte le préfixe par construction : il est jugé par
  // `nom_dynamique` (un littéral DU REGISTRE), pas comme un compteur écrit à côté de lui. Et un
  // identifiant `limiter` n'est admis qu'à deux places : l'import nommé, l'appel direct.
  const admis = new Set<ts.Node>();

  const visiter = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && importNomme(n)) admis.add(n.moduleSpecifier);
    if (ts.isImportSpecifier(n) && n.propertyName === undefined) admis.add(n.name);

    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'limiter'
    ) {
      admis.add(n.expression);
      appelsVus += 1;
      const premier = n.arguments[0];
      const litteral =
        premier !== undefined &&
        (ts.isStringLiteral(premier) || ts.isNoSubstitutionTemplateLiteral(premier))
          ? premier.text
          : null;
      if (litteral !== null && noms.has(litteral)) admis.add(premier!);
      else {
        refuser(
          n,
          'nom_dynamique',
          `\`limiter(\` reçoit ${premier === undefined ? 'aucun nom' : `\`${premier.getText(source)}\``} : ` +
            `le nom d'un compteur est un littéral du registre, jamais une valeur calculée.`
        );
      }
    }

    if (ts.isIdentifier(n) && n.text === 'limiter' && !admis.has(n)) {
      refuser(
        n,
        'nom_dynamique',
        `référence indirecte à \`limiter\` (${ts.SyntaxKind[n.parent.kind]}) : seul un appel ` +
          `direct, à nom littéral du registre, est lisible ; tout autre chemin échappe à la garde.`
      );
    }

    if (estChaine(n) && !admis.has(n)) {
      if (n.text === 'limiter' && ts.isElementAccessExpression(n.parent)) {
        refuser(n, 'nom_dynamique', `\`limiter\` atteint par une chaîne : échec fermé.`);
      } else if (MODULE_DU_REGISTRE.test(n.text) && designeUnModule(n)) {
        refuser(
          n,
          'nom_dynamique',
          `le registre est chargé autrement que par un import NOMMÉ (espace de noms, défaut, ` +
            `\`require\`, \`import()\`, ré-export) : ses appels échapperaient à la garde.`
        );
      } else {
        const texte = n.text.toLowerCase();
        const prefixe = PREFIXES_DE_FAMILLE.find((p) => texte.includes(p));
        if (prefixe !== undefined) {
          refuser(
            n,
            'prefixe_hors_registre',
            `une chaîne porte le préfixe de famille \`${prefixe}\` hors de ` +
              `${CHEMIN_DU_REGISTRE} : un compteur se déclare au registre, jamais à côté.`
          );
        }
      }
    }

    if (
      f.chemin !== CHEMIN_DU_POT_DE_MIEL &&
      ts.isCallExpression(n) &&
      estAppelA('evaluerPotDeMiel', n.expression)
    ) {
      appelantsDuPotDeMiel += 1;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  const lecture = { fautes, appelsVus, appelantsDuPotDeMiel };
  const parNoms = LECTURES.get(f) ?? new Map<string, Lecture>();
  parNoms.set(cle, lecture);
  LECTURES.set(f, parNoms);
  return lecture;
}

function lireLesSources(
  u: Univers,
  fautes: Faute[]
): { appelsVus: number; appelantsDuPotDeMiel: number } {
  const noms = new Set(Object.keys(u.registre));
  let appelsVus = 0;
  let appelantsDuPotDeMiel = 0;
  for (const f of u.fichiers) {
    if (f.chemin === CHEMIN_DU_REGISTRE || f.chemin === CHEMIN_DE_LA_GARDE) continue;
    const l = lireUnFichier(f, noms);
    fautes.push(...l.fautes);
    appelsVus += l.appelsVus;
    appelantsDuPotDeMiel += l.appelantsDuPotDeMiel;
  }
  return { appelsVus, appelantsDuPotDeMiel };
}

/** Fonction sans effet de bord hors de `u.executer` : c'est ce qui rend `--prove` possible. */
export async function analyser(u: Univers): Promise<Releve> {
  const fautes: Faute[] = [];
  const confrontes: string[] = [];
  if (Object.keys(u.registre).length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message: `le registre ${CHEMIN_DU_REGISTRE} ne déclare AUCUN compteur : rien n'est confronté.`,
    });
  }
  if (u.fichiers.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message: `AUCUN fichier de code sous ${RACINES.join(' ni ')} lu : l'absence de faute ne dirait rien.`,
    });
  }
  await confronterLeRegistre(u, fautes, confrontes);
  const { appelsVus, appelantsDuPotDeMiel } = lireLesSources(u, fautes);
  return { fautes, confrontes, fichiersLus: u.fichiers.length, appelsVus, appelantsDuPotDeMiel };
}

// ── L'univers du dépôt ──────────────────────────────────────────────────────────────────────────

function sourcesDuDisque(dossier: string): Fichier[] {
  return readdirSync(dossier, { withFileTypes: true })
    .flatMap((e): Fichier[] => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourcesDuDisque(chemin);
      return genreDe(e.name) !== null ? [{ chemin, texte: readFileSync(chemin, 'utf8') }] : [];
    })
    .sort((a, b) => a.chemin.localeCompare(b.chemin));
}

function exigencesDuDepot(): Record<string, string> {
  const r: { exigences: { id: string; texte: string }[] } = JSON.parse(
    readFileSync(CHEMIN_DES_EXIGENCES, 'utf8')
  );
  return Object.fromEntries(r.exigences.map((e) => [e.id, e.texte]));
}

/** Un cache qui LÈVE à chaque appel, et qui compte ceux qu'il a reçus. */
export function cacheQuiLeve(): { magasin: MagasinDeCompteurs; appels: () => number } {
  let appels = 0;
  const magasin = magasinDepuis(() => {
    appels += 1;
    return Promise.reject(new Error('cache indisponible (témoin de la garde)'));
  });
  return { magasin, appels: () => appels };
}

const SUJET_TEMOIN = sujetDepuisEmpreinte('0'.repeat(16));

/** Le compteur réel, exécuté contre un cache qui lève, signalement capté (la garde imprime seule). */
export const executerLeCompteurReel: Executer = (nom) =>
  limiter(nom as NomDeCompteur, SUJET_TEMOIN, 0, cacheQuiLeve().magasin, () => undefined);

export function universDuDepot(): Univers {
  return {
    registre: COMPTEURS,
    fichiers: RACINES.flatMap(sourcesDuDisque),
    executer: executerLeCompteurReel,
    exigences: exigencesDuDepot(),
  };
}

// ── --prove ─────────────────────────────────────────────────────────────────────────────────────

/** Un registre dont on retire un champ, comme le ferait un cast : le type ne le voit plus. */
function sansChamp(
  registre: Readonly<Record<string, unknown>>,
  nom: string,
  champ: string
): Record<string, unknown> {
  const copie: Record<string, unknown> = JSON.parse(JSON.stringify(registre));
  const d = copie[nom];
  if (estObjet(d)) delete d[champ];
  return copie;
}

export interface Temoin {
  readonly famille: Famille;
  readonly libelle: string;
  readonly univers: (base: Univers) => Univers;
  /** Ce que les messages de la famille doivent nommer, pour que le rouge dise où regarder. */
  readonly nomme: readonly string[];
}

/** Un compteur du MILIEU du registre : un témoin sur le dernier ne distingue pas « tous » de lui. */
export const TEMOINS: readonly Temoin[] = [
  {
    famille: 'perimetre_vide',
    libelle: 'registre vide',
    univers: (b) => ({ ...b, registre: {} }),
    nomme: [],
  },
  {
    famille: 'conduite_absente',
    libelle: '`magic:courriel` sans `surPanne`, retiré par cast',
    univers: (b) => ({ ...b, registre: sansChamp(b.registre, 'magic:courriel', 'surPanne') }),
    nomme: ['magic:', 'magic:courriel'],
  },
  {
    famille: 'conduite_trahie',
    libelle: 'une implémentation qui laisse passer quelle que soit la déclaration',
    univers: (b) => ({
      ...b,
      executer: async (nom) => ({
        ...(await b.executer(nom)),
        autorise: true,
      }),
    }),
    nomme: ['magic:ip', 'magic:courriel'],
  },
  {
    famille: 'ecart_a_l_exigence',
    libelle: '`magic:courriel` déclaré `laisser-passer`, contre REQ-SEC-002',
    univers: (b) => {
      const registre: Record<string, unknown> = JSON.parse(JSON.stringify(b.registre));
      const d = registre['magic:courriel'];
      if (estObjet(d)) d.surPanne = 'laisser-passer';
      return { ...b, registre };
    },
    nomme: ['magic:', 'magic:courriel'],
  },
  {
    famille: 'prefixe_hors_famille',
    libelle: 'un compteur `login:essai` au registre',
    univers: (b) => ({
      ...b,
      registre: {
        ...b.registre,
        'login:essai': {
          prefixe: 'login:',
          limite: 1,
          fenetreSecondes: 1,
          surPanne: 'refuser',
          source: 'REQ-SEC-016',
        },
      },
    }),
    nomme: ['login:'],
  },
  {
    famille: 'prefixe_hors_registre',
    libelle: "`redis.incr('depot:x')` dans un fichier de `src/`",
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte: "export const f = (redis: any) => redis.incr('depot:x');\n",
        },
      ],
    }),
    nomme: ['depot:', 'src/server/temoin.ts:1'],
  },
  {
    famille: 'nom_dynamique',
    libelle: "`limiter('magic:' + x, …)` sur deux lignes",
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte:
            "import { limiter } from './securite/rate-limit';\n" +
            'export const f = (x: string, s: any) =>\n' +
            "  limiter(\n    'magic:' + x,\n    s,\n    0\n  );\n",
        },
      ],
    }),
    nomme: ['src/server/temoin.ts:3'],
  },
];

/** Ce que la garde doit LAISSER PASSER : sans eux, une garde qui refuse tout serait « prouvée ». */
export const CONTRE_TEMOINS: readonly { libelle: string; fichier: Fichier }[] = [
  {
    libelle: 'un appel sur deux lignes avec un nom littéral du registre',
    fichier: {
      chemin: 'src/server/contre-temoin.ts',
      texte:
        "import { limiter } from './securite/rate-limit';\n" +
        "export const f = (s: any) =>\n  limiter(\n    'depot:ip',\n    s,\n    0\n  );\n",
    },
  },
  {
    libelle: 'un composant `.tsx` qui écrit « magic » sans deux-points',
    fichier: {
      chemin: 'src/app/contre-temoin.tsx',
      texte: "export const C = () => <p title='magic'>{'auth'}</p>;\n",
    },
  },
];

async function prouver(): Promise<number> {
  const base = universDuDepot();
  const r0 = await analyser(base);
  if (r0.fautes.length > 0) {
    console.error(`❌ La preuve part d'un dépôt DÉJÀ fautif (${r0.fautes.length}) :`);
    r0.fautes.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    return 1;
  }
  for (const c of CONTRE_TEMOINS) {
    const r = await analyser({ ...base, fichiers: [...base.fichiers, c.fichier] });
    if (r.fautes.length > 0) {
      console.error(`❌ Faux positif sur le contre-témoin « ${c.libelle} » :`);
      r.fautes.forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
      return 1;
    }
  }
  const prouvees = new Set<Famille>();
  for (const t of TEMOINS) {
    const r = await analyser(t.univers(base));
    const siennes = r.fautes.filter((f) => f.famille === t.famille);
    const manquants = t.nomme.filter((m) => !siennes.some((f) => f.message.includes(m)));
    if (siennes.length === 0 || manquants.length > 0) {
      console.error(
        `❌ Le témoin « ${t.libelle} » n'a PAS fait rougir \`${t.famille}\` en nommant ` +
          `${manquants.join(', ') || 'sa cible'} (${r.fautes.length} faute(s) d'autres familles).`
      );
      return 1;
    }
    prouvees.add(t.famille);
  }
  const sansTemoin = FAMILLES.filter((f) => !prouvees.has(f));
  if (sansTemoin.length > 0) {
    console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}.`);
    return 1;
  }
  console.log(
    `✅ Les ${FAMILLES.length} familles rougissent chacune sur son témoin — preuve faite.`
  );
  TEMOINS.forEach((t) => console.log(`   • ${t.famille} — ${t.libelle}`));
  console.log(`   ${CONTRE_TEMOINS.length} contre-témoins restent verts.`);
  return 0;
}

// ── Le dépôt ────────────────────────────────────────────────────────────────────────────────────

async function controler(): Promise<number> {
  const r = await analyser(universDuDepot());
  if (r.fautes.length > 0) {
    console.error(`❌ rate-famille — ${r.fautes.length} faute(s) :`);
    for (const famille of FAMILLES) {
      const liste = r.fautes.filter((f) => f.famille === famille);
      if (liste.length === 0) continue;
      console.error(`\n   ── ${famille} (${liste.length})`);
      liste.forEach((f) => console.error(`      ${f.message}`));
    }
    return 1;
  }
  console.log(
    `✅ rate-famille — ${r.confrontes.length} compteurs confrontés (déclarés ET exécutés contre ` +
      `un cache qui lève) : ${r.confrontes.join(' ; ')}.`
  );
  console.log(
    `   ${r.fichiersLus} fichiers de code lus sous ${RACINES.map((x) => `\`${x}/\``).join(' et ')} ; ` +
      `${r.appelsVus} appels \`limiter(\` vus.`
  );
  console.log(
    `   Pot de miel : ${r.appelantsDuPotDeMiel} formulaire(s) câblé(s) — 0 formulaire de dépôt en ` +
      `phase 0 ; 1 appelant attendu : SEC-03 (/connexion).`
  );
  return 0;
}

const LANCE_EN_SCRIPT = /[\\/]gates[\\/]rate-famille\.ts$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  (process.argv.includes('--prove') ? prouver() : controler())
    .catch((e: unknown) => {
      console.error(`❌ rate-famille — la garde a levé : ${(e as Error).message}`);
      return 2;
    })
    .then((code) => process.exit(code));
}
