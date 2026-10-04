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
 * HUIT FAMILLES, chacune vue rougir sur son témoin par `--prove` :
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
 *   `magasin_explicite`      hors des tests, un magasin ou un signaleur passé à `limiter(` (arguments
 *                            étalés compris), ou toute référence à une fabrique de magasin hors du
 *                            registre, les fabriques étant dérivées des exports du registre
 *   `ecart_a_l_exigence`     une limite, une fenêtre ou une conduite DÉCLARÉE qui n'est pas celle
 *                            que le texte de l'exigence source porte, ou qu'un seuil de la SSOT
 *                            donne — le préfixe est nommé
 *
 * L'OPTION 1 (GOV-149 ; coordination, #619, commentaire 5980895730 ; critères de la sécurité, même
 * fil, commentaire 5982320469). Une exigence qui ne CHIFFRE pas la limite et dit « lus en SSOT »
 * dans la phrase de l'ancre, APRÈS elle, fait lire la limite et la fenêtre dans `SEUILS` : le TEXTE
 * du registre les écrit `SEUILS.<NOM>.valeur`, la fenêtre suivie de `* <CONSTANTE>` prise dans la
 * table fermée `CONVERSIONS_EN_SECONDES`, sans AUCUN littéral numérique. Une exigence qui chiffre
 * reste confrontée sur son chiffre, qu'elle dise « lus en SSOT » ou non. Cinq familles de plus :
 *   `valeur_tapee_hors_ssot`       la limite ou la fenêtre d'un compteur lu en SSOT n'est pas de la
 *                                  forme `SEUILS.<NOM>.valeur [* <CONSTANTE>]`, ou porte un littéral
 *   `seuil_inconnu`                le seuil nommé n'existe pas dans `SEUILS`
 *   `seuil_sans_source`            le seuil nommé n'a pas de source, ou pas de `verifieLe` daté
 *   `facteur_d_unite_faux`         la conversion ne répond pas à l'unité du seuil : une limite lue
 *                                  ailleurs qu'en `tentatives` ou convertie, une fenêtre sans la
 *                                  constante que la table associe à son unité
 *   `compteur_sans_confrontation`  ni chiffre dans l'exigence, ni « lus en SSOT » dans la phrase de
 *                                  l'ancre, et le compteur déclare une limite ; ou la sentinelle hors
 *                                  dépôt qui LAISSE PASSER, ou portée par un compteur hors de
 *                                  `SENTINELLES_FERMEES`
 *   `sentinelle_appelee`           un appel `limiter(` à un compteur de `SENTINELLES_FERMEES`, sous
 *                                  les racines lues : la sentinelle n'est admise que MORTE
 *
 * TROIS VOIES, NOMMÉES dans le relevé : `chiffre`, `ssot`, et `hors-depot-ferme` — la sentinelle,
 * admise seulement pour les compteurs de la liste fermée `SENTINELLES_FERMEES`, en `refuser`, et
 * qu'aucun code n'appelle (arbitrage de la sécurité sur GOV-149) : le compteur refuse alors tout
 * (`limite_non_configuree`), et personne ne l'atteint. Un compteur mort, fermé.
 *
 * DETTE NOMMÉE. `depot:identite` est à supprimer par SEC-12 (REQ-DM-009 interdit tout compteur par
 * identité) ; la sentinelle disparaîtra avec lui. Après SEC-12, la garde ne lit JAMAIS une ancre
 * placée dans une note [REMPLACÉ …] : aujourd'hui, `depot:ip` et `depot:identite` trouvent la leur
 * dans la note entre crochets de REQ-SEC-016, qui cite le texte remplacé.
 *
 * L'analyse passe par le compilateur TypeScript, jamais par une recherche de chaîne : un appel
 * écrit sur deux lignes est un appel. Le périmètre se lit sur le DISQUE, sous toutes les
 * extensions de code : un fichier neuf, pas encore indexé, est lu comme les autres. Toute
 * référence à `limiter` qui n'est pas un appel direct à nom littéral est refusée : échec fermé.
 *
 * LIMITES DÉCLARÉES. Cette garde est un fil tendu sur les FORMES ÉCRITES : elle refuse les
 * chargeurs NON littéraux (`import(x)`, `require(x)`), mais un chargeur renommé ou un module relais
 * hors de `src/` et `scripts/` lui échappe. Ce qui tient la production face à eux est la défense À
 * L'EXÉCUTION du registre : hors des tests, `limiter` refuse tout magasin et tout signaleur
 * injectés (`injection_hors_tests`), et toute fabrique de magasin refuse de fabriquer
 * (`fabrique_hors_tests`). Un préfixe reconstitué par concaténation (`'mag' + 'ic:'`) échappe à la
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
  sujetDepuisEmpreinte,
  type ConduiteSurPanne,
  type NomDeCompteur,
  type VerdictDeLimite,
} from '../../src/server/securite/rate-limit';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { conversionDeLUnite } from '../../src/domain/seuils/conversions';

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

/**
 * Ce que reçoit un appel hors des tests : les paramètres de `limiter` qui précèdent le premier
 * paramètre à défaut (nom, sujet, heure). DÉRIVÉ de la fonction, jamais retapé : le magasin et le
 * signaleur, qui ont un défaut, restent au registre.
 */
const ARGUMENTS_D_UN_APPEL = limiter.length;

/**
 * Les fabriques de magasin, DÉRIVÉES des exports du registre : toute fonction exportée dont le type
 * de retour déclaré est un magasin. Une troisième fabrique ajoutée au registre est vue sans qu'on
 * l'inscrive ici ; un registre illisible ou sans fabrique rend un ensemble vide, que `analyser`
 * refuse (échec fermé).
 */
export function fabriquesDuRegistre(texte: string): ReadonlySet<string> {
  const source = ts.createSourceFile(CHEMIN_DU_REGISTRE, texte, ts.ScriptTarget.Latest, true);
  const exporte = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) &&
    (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const rendUnMagasin = (t: ts.TypeNode | undefined): boolean =>
    t !== undefined && /Magasin/.test(t.getText(source));
  const noms = new Set<string>();
  for (const n of source.statements) {
    if (!exporte(n)) continue;
    if (ts.isFunctionDeclaration(n) && n.name !== undefined && rendUnMagasin(n.type)) {
      noms.add(n.name.text);
    }
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        const init = d.initializer;
        const fonction =
          init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
            ? init
            : null;
        const typeDeclare =
          d.type !== undefined && ts.isFunctionTypeNode(d.type) ? d.type.type : undefined;
        if (
          ts.isIdentifier(d.name) &&
          (rendUnMagasin(fonction?.type) || rendUnMagasin(typeDeclare))
        ) {
          noms.add(d.name.text);
        }
      }
    }
  }
  return noms;
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
  'magasin_explicite',
  'valeur_tapee_hors_ssot',
  'seuil_inconnu',
  'seuil_sans_source',
  'facteur_d_unite_faux',
  'compteur_sans_confrontation',
  'sentinelle_appelee',
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
  /** Les seuils de la SSOT, par nom (`src/domain/seuils/ssot.ts`). */
  readonly seuils: Readonly<Record<string, unknown>>;
}

/** La voie par laquelle un compteur a été confronté. Il n'y en a pas de quatrième. */
export type Voie = 'chiffre' | 'ssot' | 'hors-depot-ferme';

export interface Releve {
  readonly fautes: readonly Faute[];
  /** Les compteurs DÉCLARÉS ET EXÉCUTÉS en panne, avec la conduite constatée. */
  readonly confrontes: readonly string[];
  /** La voie de confrontation de chaque compteur dont la valeur a été lue dans une source. */
  readonly voies: Readonly<Record<string, Voie>>;
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

/**
 * La marque d'une limite et d'une fenêtre que l'exigence ne chiffre pas et dit « lus en SSOT » :
 * elles se lisent dans `SEUILS`, sous la forme que `confronterALaSsot` exige du texte du registre.
 */
export const LUE_EN_SSOT = 'lue-en-ssot' as const;

/**
 * Les SEULS compteurs admis à la sentinelle hors dépôt : une liste FERMÉE, en `refuser`, que nul
 * code n'appelle. Un seul, et il est en sursis : SEC-12 le supprime (REQ-DM-009).
 */
export const SENTINELLES_FERMEES = ['depot:identite'] as const;

export interface ValeursExigees {
  readonly limite: number | typeof LIMITE_HORS_DEPOT | typeof LUE_EN_SSOT;
  readonly fenetreSecondes: number | typeof LIMITE_HORS_DEPOT | typeof LUE_EN_SSOT;
  readonly surPanne: ConduiteSurPanne;
}

const SECONDES_PAR_UNITE: Readonly<Record<string, number>> = { s: 1, min: 60, h: 3600 };

/** La fin de la phrase : un point final suivi d'un blanc ou de la fin, ou une note entre crochets. */
const FIN_DE_PHRASE = /[.!?](?=\s|$)|\[/;
const LUS_EN_SSOT = /\blu(?:e)?s en SSOT\b/;

/**
 * Ce que le texte de l'exigence dit du compteur que désigne `ancre` : la conduite est la première
 * `surPanne: …` qui SUIT l'ancre ; la limite et la fenêtre sont le « N / M min » qui la PRÉCÈDE
 * immédiatement. Sans chiffre, elles sont LUES EN SSOT si « lus en SSOT » suit l'ancre dans sa
 * phrase ; sinon, aucune exigence ne les chiffre (hors dépôt).
 */
export function exigenceDuCompteur(texte: string, ancre: string): ValeursExigees | null {
  const i = ancre === '' ? -1 : texte.indexOf(ancre);
  if (i < 0) return null;
  const apres = texte.slice(i + ancre.length);
  const conduite = /surPanne:\s*(refuser|laisser-passer)/.exec(apres);
  if (conduite === null || !estUnDe(CONDUITES_SUR_PANNE, conduite[1])) return null;
  const valeurs = /(\d+)\s*\/\s*(\d+)\s*(s|min|h)\s*$/.exec(texte.slice(0, i));
  if (valeurs === null) {
    const fin = FIN_DE_PHRASE.exec(apres);
    const marque = LUS_EN_SSOT.test(fin === null ? apres : apres.slice(0, fin.index))
      ? LUE_EN_SSOT
      : LIMITE_HORS_DEPOT;
    return { limite: marque, fenetreSecondes: marque, surPanne: conduite[1] };
  }
  return {
    limite: Number(valeurs[1]),
    fenetreSecondes: Number(valeurs[2]) * (SECONDES_PAR_UNITE[valeurs[3] ?? ''] ?? Number.NaN),
    surPanne: conduite[1],
  };
}

/** Une date ISO (AAAA-MM-JJ) qui existe au calendrier. */
function estUneDate(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
  );
}

/** Les expressions `limite` et `fenetreSecondes` de l'entrée `nom`, lues dans le TEXTE du registre. */
function expressionsDuRegistre(
  u: Univers,
  nom: string
): { source: ts.SourceFile; champs: Map<string, ts.Expression> } | null {
  const fichier = u.fichiers.find((f) => f.chemin === CHEMIN_DU_REGISTRE);
  if (fichier === undefined) return null;
  const source = arbreDe(fichier);
  let trouvee: ts.ObjectLiteralExpression | null = null;
  const visiter = (n: ts.Node): void => {
    if (trouvee !== null) return;
    if (
      ts.isPropertyAssignment(n) &&
      (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name)) &&
      n.name.text === nom &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      trouvee = n.initializer;
      return;
    }
    ts.forEachChild(n, visiter);
  };
  for (const s of source.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === 'COMPTEURS' && d.initializer !== undefined) {
        visiter(d.initializer);
      }
    }
  }
  if (trouvee === null) return null;
  const champs = new Map<string, ts.Expression>();
  for (const p of (trouvee as ts.ObjectLiteralExpression).properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))
      champs.set(p.name.text, p.initializer);
  }
  return { source, champs };
}

/** Le module de la table fermée, sous toutes les formes de chemin qui le désignent. */
const MODULE_DES_CONVERSIONS = /(^|\/)seuils\/conversions(\.[cm]?[jt]s)?$/;

/** Les noms que le registre importe, NON renommés, du module de la table fermée. */
function conversionsImportees(source: ts.SourceFile): ReadonlySet<string> {
  const noms = new Set<string>();
  for (const s of source.statements) {
    if (
      !ts.isImportDeclaration(s) ||
      !ts.isStringLiteral(s.moduleSpecifier) ||
      !MODULE_DES_CONVERSIONS.test(s.moduleSpecifier.text)
    ) {
      continue;
    }
    const liens = s.importClause?.namedBindings;
    if (liens === undefined || !ts.isNamedImports(liens)) continue;
    for (const e of liens.elements) if (e.propertyName === undefined) noms.add(e.name.text);
  }
  return noms;
}

/** `SEUILS.<NOM>.valeur`, et rien d'autre : le nom du seuil, ou `null`. */
function seuilLu(e: ts.Expression): string | null {
  return ts.isPropertyAccessExpression(e) &&
    e.name.text === 'valeur' &&
    ts.isPropertyAccessExpression(e.expression) &&
    ts.isIdentifier(e.expression.expression) &&
    e.expression.expression.text === 'SEUILS'
    ? e.expression.name.text
    : null;
}

function porteUnLitteral(n: ts.Node): boolean {
  if (ts.isNumericLiteral(n) || ts.isBigIntLiteral(n)) return true;
  return ts.forEachChild(n, porteUnLitteral) === true;
}

/**
 * L'option 1 : la limite et la fenêtre sont lues dans `SEUILS`, sous la forme écrite
 * `SEUILS.<NOM>.valeur` (limite, en `tentatives`) et `SEUILS.<NOM>.valeur * <CONSTANTE>` (fenêtre,
 * la constante étant celle que `CONVERSIONS_EN_SECONDES` associe à l'unité du seuil) ; chaque seuil
 * porte une source et une date ; la valeur à l'exécution est celle que la SSOT donne.
 */
function confronterALaSsot(
  u: Univers,
  nom: string,
  d: Record<string, unknown>,
  prefixe: string,
  fautes: Faute[]
): void {
  const qui = `préfixe \`${prefixe}\` — le compteur \`${nom}\``;
  const lues = expressionsDuRegistre(u, nom);
  for (const champ of ['limite', 'fenetreSecondes'] as const) {
    const e = lues?.champs.get(champ);
    if (lues === null || e === undefined) {
      fautes.push({
        famille: 'valeur_tapee_hors_ssot',
        message: `${qui} : \`${champ}\` est introuvable dans le texte de ${CHEMIN_DU_REGISTRE}, alors que ${String(d.source)} le dit lu en SSOT.`,
      });
      continue;
    }
    const ecrit = e.getText(lues.source);
    const nu = ts.isParenthesizedExpression(e) ? e.expression : e;
    const produit =
      ts.isBinaryExpression(nu) && nu.operatorToken.kind === ts.SyntaxKind.AsteriskToken
        ? nu
        : null;
    const seuil = seuilLu(produit === null ? nu : produit.left);
    const facteur =
      produit !== null && ts.isIdentifier(produit.right) ? produit.right.text : undefined;
    if (porteUnLitteral(e) || seuil === null || (produit !== null && facteur === undefined)) {
      fautes.push({
        famille: 'valeur_tapee_hors_ssot',
        message:
          `${qui} écrit \`${champ}: ${ecrit}\` : ${String(d.source)} le dit lu en SSOT, il s'écrit ` +
          `\`SEUILS.<NOM>.valeur\`${champ === 'fenetreSecondes' ? ' suivi de `* <CONSTANTE>` de la table fermée' : ''}, sans aucun littéral.`,
      });
      continue;
    }
    const s = u.seuils[seuil];
    if (!estObjet(s)) {
      fautes.push({
        famille: 'seuil_inconnu',
        message: `${qui} lit \`SEUILS.${seuil}\` (\`${champ}\`), qui n'existe pas dans la SSOT.`,
      });
      continue;
    }
    if (typeof s.source !== 'string' || s.source.trim() === '' || !estUneDate(s.verifieLe)) {
      fautes.push({
        famille: 'seuil_sans_source',
        message:
          `${qui} lit \`SEUILS.${seuil}\`, qui n'a pas de source non vide ET de \`verifieLe\` daté ` +
          `(source ${JSON.stringify(s.source) ?? 'absente'}, verifieLe ${JSON.stringify(s.verifieLe) ?? 'absent'}).`,
      });
      continue;
    }
    const unite = String(s.unite);
    const conversion = conversionDeLUnite(unite);
    const juste =
      champ === 'limite'
        ? unite === 'tentatives' && facteur === undefined
        : conversion !== undefined && facteur === conversion.constante;
    if (!juste) {
      fautes.push({
        famille: 'facteur_d_unite_faux',
        message:
          `${qui} écrit \`${champ}: ${ecrit}\` sur \`SEUILS.${seuil}\` (unité \`${unite}\`) : ` +
          (champ === 'limite'
            ? `une limite se lit dans un seuil en \`tentatives\`, sans conversion.`
            : `une fenêtre se convertit par la constante que \`CONVERSIONS_EN_SECONDES\` associe ` +
              `à son unité (${conversion === undefined ? 'aucune pour cette unité' : `\`${conversion.constante}\``}).`),
      });
      continue;
    }
    if (facteur !== undefined && !conversionsImportees(lues.source).has(facteur)) {
      fautes.push({
        famille: 'facteur_d_unite_faux',
        message:
          `${qui} convertit par \`${facteur}\`, qui n'est pas importé, sous ce nom, de ` +
          `\`src/domain/seuils/conversions.ts\` : une constante définie à côté de la table fermée ` +
          `n'en fait pas partie.`,
      });
      continue;
    }
    const attendue = Number(s.valeur) * (champ === 'limite' ? 1 : conversion!.valeur);
    if (d[champ] !== attendue) {
      fautes.push({
        famille: 'ecart_a_l_exigence',
        message:
          `${qui} déclare ${champ} ${JSON.stringify(d[champ])} au lieu de ${attendue}, la valeur ` +
          `de \`SEUILS.${seuil}\`.`,
      });
    }
  }
}

/** Confronte le compteur à son exigence, et rend la voie suivie ; `null` s'il n'en a aucune. */
function confronterAlExigence(
  u: Univers,
  nom: string,
  d: Record<string, unknown>,
  prefixe: string,
  fautes: Faute[]
): Voie | null {
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
    return null;
  }
  const conduite = (): void => {
    if (d.surPanne !== exigee.surPanne) {
      fautes.push({
        famille: 'ecart_a_l_exigence',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` déclare surPanne ` +
          `${JSON.stringify(d.surPanne)} au lieu de ${JSON.stringify(exigee.surPanne)} : ` +
          `${source} (« ${d.ancre} ») exige autre chose.`,
      });
    }
  };
  if (exigee.limite === LUE_EN_SSOT) {
    confronterALaSsot(u, nom, d, prefixe, fautes);
    conduite();
    return 'ssot';
  }
  if (exigee.limite === LIMITE_HORS_DEPOT) {
    const sentinelle = d.limite === LIMITE_HORS_DEPOT && d.fenetreSecondes === LIMITE_HORS_DEPOT;
    const listee = (SENTINELLES_FERMEES as readonly string[]).includes(nom);
    const fermee = exigee.surPanne === 'refuser' && d.surPanne === 'refuser';
    if (!sentinelle || !listee || !fermee) {
      const pourquoi = !sentinelle
        ? ` ; il déclare pourtant limite ${JSON.stringify(d.limite)}, fenêtre ${JSON.stringify(d.fenetreSecondes)}`
        : !listee
          ? ` ; la sentinelle hors dépôt n'est admise que pour les compteurs de \`SENTINELLES_FERMEES\` ` +
            `(${SENTINELLES_FERMEES.join(', ')}), et celui-ci n'en est pas`
          : ` ; la sentinelle hors dépôt n'est admise que FERMÉE (\`surPanne: refuser\`), et ` +
            `celle-ci déclare ${JSON.stringify(d.surPanne)}`;
      fautes.push({
        famille: 'compteur_sans_confrontation',
        message:
          `préfixe \`${prefixe}\` — le compteur \`${nom}\` n'est confronté à rien : ${source} ` +
          `(« ${d.ancre} ») ne chiffre aucune limite et ne dit pas « lus en SSOT » dans la phrase ` +
          `de l'ancre, après elle${pourquoi}.`,
      });
      if (sentinelle && listee) return null;
      conduite();
      return null;
    }
    conduite();
    return 'hors-depot-ferme';
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
  return 'chiffre';
}

// ── Le registre, lu puis exécuté ────────────────────────────────────────────────────────────────

async function confronterLeRegistre(
  u: Univers,
  fautes: Faute[],
  confrontes: string[],
  voies: Record<string, Voie>
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
    const voie = confronterAlExigence(u, nom, d, prefixe, fautes);
    if (voie !== null) voies[nom] = voie;

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

function lireUnFichier(
  f: Fichier,
  noms: ReadonlySet<string>,
  fabriques: ReadonlySet<string>
): Lecture {
  const cle = `${[...noms].sort().join(' ')}|${[...fabriques].sort().join(' ')}`;
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
  // Un spécificateur déjà refusé pour une fabrique n'est pas refusé une seconde fois par son nom.
  const dejaRefuses = new Set<ts.Node>();

  const visiter = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && importNomme(n)) admis.add(n.moduleSpecifier);
    if (ts.isImportSpecifier(n) || ts.isExportSpecifier(n)) {
      // Le nom IMPORTÉ ou EXPORTÉ, qu'il soit écrit en identifiant ou en chaîne. Seul l'import
      // nommé, non renommé, écrit en identifiant, est lisible : tout autre spécificateur qui
      // désigne `limiter` ou une fabrique de magasin le fait sortir sous un autre nom, que la
      // garde ne suivrait plus.
      const designe = n.propertyName ?? n.name;
      const lisible =
        ts.isImportSpecifier(n) && n.propertyName === undefined && ts.isIdentifier(n.name);
      const sens = ts.isImportSpecifier(n) ? 'importé' : 'exporté';
      if (lisible) admis.add(n.name);
      else if (designe.text === 'limiter') {
        admis.add(designe);
        refuser(
          n,
          'nom_dynamique',
          `\`limiter\` est ${sens} sous un autre nom, ou par une chaîne : ses appels ` +
            `échapperaient à la lecture de leur premier argument.`
        );
      } else if (fabriques.has(designe.text)) {
        dejaRefuses.add(designe);
        refuser(
          n,
          'magasin_explicite',
          `la fabrique de magasin \`${designe.text}\` est ${sens} sous un autre nom, ou par une ` +
            `chaîne : un magasin se fabrique dans ${CHEMIN_DU_REGISTRE}, jamais à côté.`
        );
      }
    }
    if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword || estAppelA('require', n.expression))
    ) {
      const chemin = n.arguments[0];
      if (
        chemin === undefined ||
        !(ts.isStringLiteral(chemin) || ts.isNoSubstitutionTemplateLiteral(chemin))
      ) {
        refuser(
          n,
          'nom_dynamique',
          `chargement d'un module par un chemin NON littéral : la garde ne peut pas savoir s'il ` +
            `atteint le registre, et le refuse (échec fermé).`
        );
      }
    }
    if (ts.isIdentifier(n) && fabriques.has(n.text) && !dejaRefuses.has(n)) {
      refuser(
        n,
        'magasin_explicite',
        `\`${n.text}\` hors du registre : un magasin se fabrique dans ${CHEMIN_DU_REGISTRE}, ` +
          `et un magasin fait à la main peut tout admettre.`
      );
    }

    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'limiter'
    ) {
      admis.add(n.expression);
      appelsVus += 1;
      if (n.arguments.some(ts.isSpreadElement)) {
        refuser(
          n,
          'magasin_explicite',
          `\`limiter(\` reçoit des arguments ÉTALÉS : leur nombre ne se lit pas, et un magasin ou ` +
            `un puits passerait par là.`
        );
      } else if (n.arguments.length > ARGUMENTS_D_UN_APPEL) {
        refuser(
          n,
          'magasin_explicite',
          `\`limiter(\` reçoit ${n.arguments.length} arguments : hors des tests, le magasin et le ` +
            `signaleur sont ceux du registre, jamais un magasin ou un puits passé par l'appelant.`
        );
      }
      const premier = n.arguments[0];
      const litteral =
        premier !== undefined &&
        (ts.isStringLiteral(premier) || ts.isNoSubstitutionTemplateLiteral(premier))
          ? premier.text
          : null;
      if (litteral !== null && (SENTINELLES_FERMEES as readonly string[]).includes(litteral)) {
        refuser(
          n,
          'sentinelle_appelee',
          `\`limiter(\` appelle \`${litteral}\`, un compteur de \`SENTINELLES_FERMEES\` : la ` +
            `sentinelle hors dépôt refuse tout et n'est admise que MORTE, appelée par personne.`
        );
      }
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
  const registre = u.fichiers.find((f) => f.chemin === CHEMIN_DU_REGISTRE);
  const fabriques = fabriquesDuRegistre(registre?.texte ?? '');
  if (fabriques.size === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        `AUCUNE fabrique de magasin lue dans ${CHEMIN_DU_REGISTRE} : la garde ne saurait pas quel ` +
        `magasin refuser hors du registre.`,
    });
  }
  let appelsVus = 0;
  let appelantsDuPotDeMiel = 0;
  for (const f of u.fichiers) {
    if (f.chemin === CHEMIN_DU_REGISTRE || f.chemin === CHEMIN_DE_LA_GARDE) continue;
    const l = lireUnFichier(f, noms, fabriques);
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
  const voies: Record<string, Voie> = {};
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
  await confronterLeRegistre(u, fautes, confrontes, voies);
  const { appelsVus, appelantsDuPotDeMiel } = lireLesSources(u, fautes);
  return {
    fautes,
    confrontes,
    voies,
    fichiersLus: u.fichiers.length,
    appelsVus,
    appelantsDuPotDeMiel,
  };
}

// ── L'univers du dépôt ──────────────────────────────────────────────────────────────────────────

export function sourcesDuDisque(dossier: string): Fichier[] {
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
/**
 * Le compteur réel, exécuté contre un cache qui LÈVE, sans rien lui injecter : hors des tests,
 * `limiter` refuse tout magasin et tout signaleur fourni. La garde retire donc `REDIS_URL` le temps
 * de l'appel — le magasin du registre est alors celui de l'adresse absente, qui lève à chaque
 * écriture — et capte la ligne de panne que le signaleur du registre écrit sur la sortie d'erreur.
 */
async function executerSansCache(nom: string): Promise<VerdictDeLimite> {
  const adresse = process.env.REDIS_URL;
  const ecrire = process.stderr.write.bind(process.stderr);
  Reflect.deleteProperty(process.env, 'REDIS_URL');
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return await limiter(nom as NomDeCompteur, SUJET_TEMOIN, 0);
  } finally {
    process.stderr.write = ecrire;
    if (adresse !== undefined) process.env.REDIS_URL = adresse;
  }
}

const SUJET_TEMOIN = sujetDepuisEmpreinte('0'.repeat(16));

/** Le compteur réel, exécuté contre un cache qui lève, signalement capté (la garde imprime seule). */
export const executerLeCompteurReel: Executer = executerSansCache;

export function universDuDepot(): Univers {
  return {
    registre: COMPTEURS,
    fichiers: RACINES.flatMap(sourcesDuDisque),
    executer: executerLeCompteurReel,
    exigences: exigencesDuDepot(),
    seuils: SEUILS,
  };
}

// ── L'option 1, éprouvée sur un compteur témoin ─────────────────────────────────────────────────

/** Le compteur témoin de l'option 1, son exigence et ses deux seuils : hors du dépôt réel. */
export const NOM_DU_TEMOIN_SSOT = 'depot:temoin-ssot';
const EXIGENCE_DU_TEMOIN = 'REQ-TEMOIN-001';
const EXIGENCE_LUE_EN_SSOT =
  'Le témoin est limité par un compteur de témoin ; la fenêtre et le plafond sont lus en SSOT, ' +
  'avec leur source ; `surPanne: refuser`.';
const SEUILS_DU_TEMOIN: Readonly<Record<string, unknown>> = {
  TEMOIN_PLAFOND: {
    valeur: 4,
    unite: 'tentatives',
    source: 'témoin de rate-famille',
    renvois: [],
    verifieLe: '2026-10-04',
  },
  TEMOIN_FENETRE_MINUTES: {
    valeur: 1,
    unite: 'minutes',
    source: 'témoin de rate-famille',
    renvois: [],
    verifieLe: '2026-10-04',
  },
};

export interface OptionsDuTemoinSsot {
  /** Le texte de `limite` dans le registre. */
  readonly limite?: string;
  /** Le texte de `fenetreSecondes` dans le registre. */
  readonly fenetre?: string;
  /** La conduite déclarée ; `null` la retire, comme un cast. */
  readonly surPanne?: string | null;
  /** Le texte de l'exigence source. */
  readonly exigence?: string;
  /** Des seuils qui remplacent ou complètent ceux du témoin. */
  readonly seuils?: Readonly<Record<string, unknown>>;
  /** Les valeurs du compteur à l'exécution ; par défaut, celles de la SSOT du témoin. */
  readonly valeurs?: { readonly limite: unknown; readonly fenetreSecondes: unknown };
  /** Le registre importe-t-il les constantes de la table fermée ? Par défaut, oui. */
  readonly importe?: boolean;
}

const IMPORT_DES_CONVERSIONS =
  "import { SECONDES_PAR_JOUR, SECONDES_PAR_MINUTE } from '../../domain/seuils/conversions';\n";

/**
 * Un univers où le registre porte UN compteur de plus, `depot:temoin-ssot`, écrit dans le TEXTE du
 * registre comme dans sa déclaration, sous une exigence qui le dit lu en SSOT : la forme juste par
 * défaut, chaque option en écrit une fautive. Le compteur témoin est exécuté sans cache : il rend
 * sa conduite déclarée, en panne.
 */
export function universAvecUnCompteurLuEnSsot(base: Univers, o: OptionsDuTemoinSsot = {}): Univers {
  const limite = o.limite ?? 'SEUILS.TEMOIN_PLAFOND.valeur';
  const fenetre = o.fenetre ?? 'SEUILS.TEMOIN_FENETRE_MINUTES.valeur * SECONDES_PAR_MINUTE';
  const surPanne = o.surPanne === undefined ? 'refuser' : o.surPanne;
  const declaration: Record<string, unknown> = {
    prefixe: 'depot:',
    limite: o.valeurs?.limite ?? 4,
    fenetreSecondes: o.valeurs?.fenetreSecondes ?? 60,
    source: EXIGENCE_DU_TEMOIN,
    ancre: 'compteur de témoin',
    verifieLe: '2026-10-04',
  };
  if (surPanne !== null) declaration.surPanne = surPanne;
  const entree =
    `  '${NOM_DU_TEMOIN_SSOT}': {\n    prefixe: 'depot:',\n    limite: ${limite},\n` +
    `    fenetreSecondes: ${fenetre},\n` +
    (surPanne === null ? '' : `    surPanne: '${surPanne}',\n`) +
    `    source: '${EXIGENCE_DU_TEMOIN}',\n    ancre: 'compteur de témoin',\n` +
    `    verifieLe: '2026-10-04',\n  },\n`;
  const ouverture = 'export const COMPTEURS = {\n';
  const fichiers = base.fichiers.map((f) => {
    if (f.chemin !== CHEMIN_DU_REGISTRE) return f;
    const i = f.texte.indexOf(ouverture);
    if (i < 0) throw new Error(`témoin de l'option 1 : « ${ouverture.trim()} » introuvable.`);
    const j = i + ouverture.length;
    const texte = f.texte.slice(0, j) + entree + f.texte.slice(j);
    // Sans import, le registre n'en garde AUCUN de la table : la constante n'y est plus qu'un nom.
    return {
      chemin: f.chemin,
      texte:
        o.importe === false
          ? texte.replace(/^import [^;]*from '[^']*seuils\/conversions';\r?\n/gm, '')
          : IMPORT_DES_CONVERSIONS + texte,
    };
  });
  return {
    ...base,
    registre: { ...base.registre, [NOM_DU_TEMOIN_SSOT]: declaration },
    fichiers,
    exigences: { ...base.exigences, [EXIGENCE_DU_TEMOIN]: o.exigence ?? EXIGENCE_LUE_EN_SSOT },
    seuils: { ...base.seuils, ...SEUILS_DU_TEMOIN, ...o.seuils },
    executer: async (nom) =>
      nom === NOM_DU_TEMOIN_SSOT
        ? {
            autorise: surPanne === 'laisser-passer',
            restant: 0,
            repriseAt: null,
            panne: true,
            motif: 'cache_indisponible',
          }
        : base.executer(nom),
  };
}

/** Ce que l'option 1 doit LAISSER PASSER, en plus des contre-témoins de fichier. */
export const CONTRE_TEMOINS_D_UNIVERS: readonly {
  libelle: string;
  univers: (b: Univers) => Univers;
}[] = [
  {
    libelle: 'un compteur « lus en SSOT » écrit `SEUILS.<NOM>.valeur * SECONDES_PAR_MINUTE`',
    univers: (b) => universAvecUnCompteurLuEnSsot(b),
  },
  {
    libelle: 'une fenêtre en jours, convertie par `SECONDES_PAR_JOUR`',
    univers: (b) =>
      universAvecUnCompteurLuEnSsot(b, {
        fenetre: 'SEUILS.TEMOIN_FENETRE_MINUTES.valeur * SECONDES_PAR_JOUR',
        seuils: {
          TEMOIN_FENETRE_MINUTES: {
            valeur: 1,
            unite: 'jours',
            source: 'témoin de rate-famille',
            renvois: [],
            verifieLe: '2026-10-04',
          },
        },
        valeurs: { limite: 4, fenetreSecondes: 86_400 },
      }),
  },
];

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
    famille: 'magasin_explicite',
    libelle: 'un magasin fabriqué à la main, passé en 4e argument de `limiter(`',
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte:
            "import { limiter, magasinDepuis } from './securite/rate-limit';\n" +
            'const m = magasinDepuis(async () => ({ admis: true, compte: 0, plusAncienMs: null }));\n' +
            "export const f = (s: any) => limiter('magic:ip', s, 0, m);\n",
        },
      ],
    }),
    nomme: ['src/server/temoin.ts:2', 'src/server/temoin.ts:3'],
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
  {
    famille: 'valeur_tapee_hors_ssot',
    libelle: 'un compteur « lus en SSOT » dont la fenêtre convertit par `* 60`',
    univers: (b) =>
      universAvecUnCompteurLuEnSsot(b, {
        fenetre: 'SEUILS.TEMOIN_FENETRE_MINUTES.valeur * 60',
      }),
    nomme: ['depot:', NOM_DU_TEMOIN_SSOT],
  },
  {
    famille: 'seuil_inconnu',
    libelle: 'un compteur « lus en SSOT » qui lit un seuil absent de `SEUILS`',
    univers: (b) => universAvecUnCompteurLuEnSsot(b, { limite: 'SEUILS.PLAFOND_INVENTE.valeur' }),
    nomme: [NOM_DU_TEMOIN_SSOT, 'PLAFOND_INVENTE'],
  },
  {
    famille: 'seuil_sans_source',
    libelle: 'un compteur « lus en SSOT » sur un seuil à la source vide',
    univers: (b) =>
      universAvecUnCompteurLuEnSsot(b, {
        seuils: {
          TEMOIN_PLAFOND: {
            valeur: 4,
            unite: 'tentatives',
            source: '',
            renvois: [],
            verifieLe: '2026-10-04',
          },
        },
      }),
    nomme: [NOM_DU_TEMOIN_SSOT, 'TEMOIN_PLAFOND'],
  },
  {
    famille: 'facteur_d_unite_faux',
    libelle: 'une fenêtre en minutes convertie par `SECONDES_PAR_JOUR`',
    univers: (b) =>
      universAvecUnCompteurLuEnSsot(b, {
        fenetre: 'SEUILS.TEMOIN_FENETRE_MINUTES.valeur * SECONDES_PAR_JOUR',
      }),
    nomme: [NOM_DU_TEMOIN_SSOT, 'SECONDES_PAR_MINUTE'],
  },
  {
    famille: 'compteur_sans_confrontation',
    libelle: '« lus en SSOT » dans une autre phrase que l’ancre',
    univers: (b) =>
      universAvecUnCompteurLuEnSsot(b, {
        exigence:
          'Le témoin est limité par un compteur de témoin ; `surPanne: refuser`. La fenêtre et le ' +
          'plafond sont lus en SSOT, avec leur source.',
      }),
    nomme: ['depot:', NOM_DU_TEMOIN_SSOT],
  },
  {
    famille: 'sentinelle_appelee',
    libelle: "`limiter('depot:identite', …)` dans un fichier de `src/`",
    univers: (b) => ({
      ...b,
      fichiers: [
        ...b.fichiers,
        {
          chemin: 'src/server/temoin.ts',
          texte:
            "import { limiter } from './securite/rate-limit';\n" +
            "export const f = (s: any) => limiter('depot:identite', s, 0);\n",
        },
      ],
    }),
    nomme: ['src/server/temoin.ts:2', 'depot:identite'],
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
  const contreTemoins = [
    ...CONTRE_TEMOINS.map((c) => ({
      libelle: c.libelle,
      univers: (b: Univers): Univers => ({ ...b, fichiers: [...b.fichiers, c.fichier] }),
    })),
    ...CONTRE_TEMOINS_D_UNIVERS,
  ];
  for (const c of contreTemoins) {
    const r = await analyser(c.univers(base));
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
  console.log(`   ${contreTemoins.length} contre-témoins restent verts.`);
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
  const parVoie = (v: Voie) => Object.values(r.voies).filter((x) => x === v).length;
  console.log(
    `   Voies de confrontation : ${parVoie('chiffre')} au chiffre de l'exigence, ` +
      `${parVoie('ssot')} à la SSOT, ${parVoie('hors-depot-ferme')} à la sentinelle fermée.`
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
