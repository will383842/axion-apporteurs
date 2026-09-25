/**
 * schema-pii.ts — aucune donnée personnelle en clair, ni dans le schéma ni sur un chemin d'écriture
 * (SEC-08 ; REQ-SEC-024). Registre : `securite:schema-pii` (alias `G-SEC-SCHEMA-PII`), son nom de commande.
 *
 * USAGE : pnpm securite:schema-pii         (échoue sur une colonne ou une écriture de personne en clair)
 *         pnpm securite:schema-pii:prove   (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *
 * LE SCHÉMA (`prisma/schema.prisma`, lu par le lecteur unique `scripts/lot/lecteur-prisma.ts`).
 * Toute colonne dont le nom ou le `@map` porte un segment du lexique UNIQUE des champs de personne
 * (`src/domain/donnees-personnelles/champs.ts`) est un bloc chiffré `…Chiffre` de type `Bytes`, ou
 * une empreinte `…Hash` de type `String` (partners/ADR-0013, décision 13). Une adresse réseau n'est
 * jamais chiffrée : son empreinte seule. Les champs de relation (type = un modèle) ne sont pas des
 * colonnes et ne sont pas jugés.
 *
 * LES CHEMINS D'ÉCRITURE : tout fichier suivi sous `src/` que le compilateur TypeScript lit, sauf
 * `src/server/securite/pii.ts`, qui EST la primitive. Une propriété `…Chiffre` n'y reçoit que
 * `true`, `false` ou `null` (une sélection, une purge) : un bloc ne naît que de `colonnesPii`, étalé.
 * Sous une clé d'écriture Prisma (`data`, `create`, `update`, `createMany`, `updateMany`, `upsert`,
 * `connectOrCreate`), une empreinte de personne ou de REQ-SEC-024 (`emailHash`, `phoneHash`,
 * `ibanHash`, `siretHash`, `ipHash`…) ne reçoit que l'appel d'un producteur de `pii.ts` ou `null`,
 * et aucun autre champ de personne n'est écrit. La garde DESCEND dans la valeur de la clé : objets,
 * tableaux, étalements, ternaires (deux branches), `&&` (opérande droit), `||` et `??` (deux
 * opérandes), parenthèses, `as`, `satisfies`, `!` ; une valeur protégée est jugée sur chacune de
 * ces branches. Un champ protégé posé sous la clé dans une forme qu'elle ne descend pas (un appel,
 * une fonction…) rougit `ecriture_non_jugee` : échec FERMÉ. Seuls les arguments d'une fonction de
 * `pii.ts` (qui reçoit, elle, les clairs) en sont exemptés.
 *
 * LIMITE DÉCLARÉE : une clé calculée (`[nom]: …`), une écriture par SQL brut, une colonne `Json`
 * qui porterait une personne, un objet construit HORS de l'expression de la clé (une variable)
 * puis passé ou étalé en `data`, une fonction locale qui porterait le nom d'un producteur, et tout
 * ce qui vit hors de `src/` relèvent de la revue. La garde lit des NOMS ; elle ne suit pas les
 * valeurs.
 * Le vert imprime le compte des champs, des fichiers et des sites d'écriture RÉELLEMENT confrontés.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit pas le dépôt : ses vues sont INJECTÉES.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { segmentsDuNom, segmentsPersonnels } from '../../src/domain/donnees-personnelles/champs';
import {
  TYPES_EMPREINTE,
  colonnesPii,
  empreinteAdresseReseau,
  empreinteRecherche,
  encryptPii,
} from '../../src/server/securite/pii';
import { ErreurLecturePrisma, lireSchemaPrisma } from '../lot/lecteur-prisma';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';
/** La primitive elle-même : elle SEULE fabrique les blocs et les empreintes. */
const LA_PRIMITIVE = 'src/server/securite/pii.ts';
const RACINE_DU_CODE = 'src/';
const EXTENSION_ANALYSEE = /\.(?:[cm]?[jt]sx?)$/;
/** Les clés d'argument sous lesquelles Prisma ÉCRIT, écritures imbriquées comprises. */
const CLES_D_ECRITURE = new Set([
  'data',
  'create',
  'update',
  'createMany',
  'updateMany',
  'upsert',
  'connectOrCreate',
]);
/** Les producteurs admis d'une empreinte, lus sur les fonctions elles-mêmes (identité). */
const PRODUCTEURS = new Set([empreinteRecherche.name, empreinteAdresseReseau.name]);
/** Les fonctions de la primitive : leurs arguments portent les clairs QU'ELLES chiffrent. */
const FONCTIONS_DE_LA_PRIMITIVE = new Set([...PRODUCTEURS, colonnesPii.name, encryptPii.name]);
/** Les segments qui font d'un `…Hash` une empreinte protégée : le lexique, et les types de pii.ts. */
const SEGMENTS_TYPES = new Set<string>(TYPES_EMPREINTE);

export type Vue = {
  /** Le texte de `prisma/schema.prisma`. */
  schema: string;
  /** Les fichiers suivis sous `src/`. */
  code: { chemin: string; contenu: string }[];
};

export type Famille =
  | 'schema_illisible'
  | 'perimetre_vide'
  | 'colonne_personnelle_en_clair'
  | 'adresse_reseau_chiffree'
  | 'forme_de_colonne'
  | 'source_illisible'
  | 'chiffre_hors_primitive'
  | 'empreinte_hors_primitive'
  | 'champ_personnel_en_clair'
  | 'ecriture_non_jugee';

export type Faute = { famille: Famille; message: string };

export const FAMILLES: { nom: Famille; explication: string }[] = [
  {
    nom: 'schema_illisible',
    explication: 'le schéma Prisma ne se lit pas : aucun verdict sur lui.',
  },
  {
    nom: 'perimetre_vide',
    explication:
      'aucun modèle dans le schéma ou aucun fichier sous src/ : rien ne serait confronté.',
  },
  {
    nom: 'colonne_personnelle_en_clair',
    explication:
      'une colonne de personne (nom, courriel, téléphone, IBAN, adresse, IP) ni `…Chiffre` ni `…Hash`.',
  },
  {
    nom: 'adresse_reseau_chiffree',
    explication: 'une adresse réseau chiffrée : elle ne se stocke que par son empreinte.',
  },
  {
    nom: 'forme_de_colonne',
    explication:
      'un `…Chiffre` qui n’est pas `Bytes`, ou un `…Hash` de personne qui n’est pas `String`.',
  },
  {
    nom: 'source_illisible',
    explication:
      'un fichier sous src/ que le compilateur analyse avec des diagnostics : non jugé, donc refusé.',
  },
  {
    nom: 'chiffre_hors_primitive',
    explication:
      'une propriété `…Chiffre` qui reçoit autre chose que true, false ou null hors de pii.ts : un bloc ne naît que de colonnesPii.',
  },
  {
    nom: 'empreinte_hors_primitive',
    explication:
      'une empreinte écrite sous data/create/update sans l’appel d’un producteur de pii.ts : un clair peut s’y glisser.',
  },
  {
    nom: 'champ_personnel_en_clair',
    explication: 'un champ de personne écrit en clair sous data/create/update.',
  },
  {
    nom: 'ecriture_non_jugee',
    explication:
      'un champ protégé sous une clé d’écriture, dans une forme que la garde ne descend pas (appel, fonction…) : échec fermé.',
  },
];

const dernier = (nom: string): string => segmentsDuNom(nom).at(-1) ?? '';
const estPersonnel = (nom: string): boolean => segmentsPersonnels(nom).length > 0;
const estReseau = (nom: string): boolean =>
  segmentsPersonnels(nom).some((e) => e.categorie === 'reseau');
const estEmpreinteProtegee = (nom: string): boolean =>
  dernier(nom) === 'hash' &&
  (estPersonnel(nom) || segmentsDuNom(nom).some((s) => SEGMENTS_TYPES.has(s)));

// ── le schéma ────────────────────────────────────────────────────────────────

function fautesDeColonne(nom: string, type: string): Famille | null {
  if (!estPersonnel(nom) && !estEmpreinteProtegee(nom)) return null;
  const fin = dernier(nom);
  if (fin === 'chiffre') {
    if (estReseau(nom)) return 'adresse_reseau_chiffree';
    return type === 'Bytes' ? null : 'forme_de_colonne';
  }
  if (fin === 'hash') return type === 'String' ? null : 'forme_de_colonne';
  return 'colonne_personnelle_en_clair';
}

// ── les chemins d'écriture ───────────────────────────────────────────────────

const nomDePropriete = (p: ts.ObjectLiteralElementLike): string | null => {
  if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) return null;
  const n = p.name;
  return ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
    ? n.text
    : null;
};

/** Parenthèses, `as`, `satisfies`, `!` et `<T>x` ne changent pas la valeur : on les traverse. */
function deballer(e: ts.Expression): ts.Expression {
  let n = e;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isTypeAssertionExpression(n)
  ) {
    n = n.expression;
  }
  return n;
}

const litteralAdmis = (e: ts.Expression): boolean =>
  e.kind === ts.SyntaxKind.TrueKeyword ||
  e.kind === ts.SyntaxKind.FalseKeyword ||
  e.kind === ts.SyntaxKind.NullKeyword;

const nomAppele = (e: ts.CallExpression): string => {
  const c = e.expression;
  return ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
};

const appelDUnProducteur = (e: ts.Expression): boolean =>
  ts.isCallExpression(e) && PRODUCTEURS.has(nomAppele(e));

/**
 * Vrai si TOUTE valeur que l'expression peut prendre est admise : un littéral admis, ou (pour une
 * empreinte) l'appel d'un producteur. Un ternaire est jugé sur ses deux branches ; `a || b` et
 * `a ?? b` sur leurs deux opérandes ; `a && b` sur `b` seul (`a` n'en sort que faux : `''`, `0`,
 * `false`, `null`, `undefined`, qui ne portent personne). Toute autre forme : non admise.
 */
function valeurAdmise(expression: ts.Expression, producteur: boolean): boolean {
  const e = deballer(expression);
  if (litteralAdmis(e) || (producteur && appelDUnProducteur(e))) return true;
  if (ts.isConditionalExpression(e)) {
    return valeurAdmise(e.whenTrue, producteur) && valeurAdmise(e.whenFalse, producteur);
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return valeurAdmise(e.right, producteur);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return valeurAdmise(e.left, producteur) && valeurAdmise(e.right, producteur);
    }
  }
  return false;
}

/**
 * Les littéraux d'objet ATTEINTS depuis la valeur d'une clé d'écriture : la descente traverse les
 * objets (valeurs de leurs propriétés et étalements), les tableaux, les ternaires (deux branches),
 * `&&` (opérande droit), `||` et `??` (deux opérandes), les parenthèses, `as`, `satisfies` et `!`.
 * Toute autre forme (appel, identifiant, accès…) est opaque : la descente s'y arrête.
 */
function atteindre(expression: ts.Expression, atteints: Set<ts.Node>): void {
  const e = deballer(expression);
  if (ts.isObjectLiteralExpression(e)) {
    if (atteints.has(e)) return;
    atteints.add(e);
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p)) atteindre(p.initializer, atteints);
      else if (ts.isSpreadAssignment(p)) atteindre(p.expression, atteints);
    }
  } else if (ts.isArrayLiteralExpression(e)) {
    for (const el of e.elements) atteindre(ts.isSpreadElement(el) ? el.expression : el, atteints);
  } else if (ts.isConditionalExpression(e)) {
    atteindre(e.whenTrue, atteints);
    atteindre(e.whenFalse, atteints);
  } else if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) atteindre(e.right, atteints);
    else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      atteindre(e.left, atteints);
      atteindre(e.right, atteints);
    }
  }
}

/**
 * Vrai si le nœud vit sous la valeur d'une clé d'écriture SANS y avoir été atteint, et hors des
 * arguments d'un appel à la primitive (qui reçoit, elle, les clairs) : la garde ne sait pas le juger.
 */
function nonJugeSousUneCle(noeud: ts.Node, racines: ReadonlySet<ts.Node>): boolean {
  for (let n = noeud.parent; n !== undefined; n = n.parent) {
    if (ts.isCallExpression(n) && FONCTIONS_DE_LA_PRIMITIVE.has(nomAppele(n))) return false;
    if (racines.has(n)) return true;
  }
  return false;
}

function fautesDEcriture(chemin: string, contenu: string): { fautes: Faute[]; sites: number } {
  const source = ts.createSourceFile(chemin, contenu, ts.ScriptTarget.Latest, true);
  const diagnostics: unknown = Reflect.get(source, 'parseDiagnostics');
  if (!Array.isArray(diagnostics) || diagnostics.length > 0) {
    return {
      fautes: [
        {
          famille: 'source_illisible',
          message: `${chemin} — le compilateur ne l’analyse pas sans diagnostic : ses écritures ne sont pas jugées.`,
        },
      ],
      sites: 0,
    };
  }
  const fautes: Faute[] = [];
  let sites = 0;
  const racines = new Set<ts.Node>();
  const atteints = new Set<ts.Node>();
  const reperer = (noeud: ts.Node): void => {
    if (ts.isPropertyAssignment(noeud)) {
      const n = noeud.name;
      if ((ts.isIdentifier(n) || ts.isStringLiteral(n)) && CLES_D_ECRITURE.has(n.text)) {
        racines.add(noeud.initializer);
        atteindre(noeud.initializer, atteints);
      }
    }
    ts.forEachChild(noeud, reperer);
  };
  reperer(source);
  const visiter = (noeud: ts.Node): void => {
    if (ts.isObjectLiteralExpression(noeud)) {
      const ecriture = atteints.has(noeud);
      const nonJuge = !ecriture && nonJugeSousUneCle(noeud, racines);
      for (const p of noeud.properties) {
        const nom = nomDePropriete(p);
        if (nom === null) continue;
        const valeur = ts.isPropertyAssignment(p) ? p.initializer : null;
        const ligne = source.getLineAndCharacterOfPosition(p.getStart(source)).line + 1;
        const ici = `${chemin}:${ligne} — \`${nom}\``;
        if (dernier(nom) === 'chiffre') {
          sites++;
          if (valeur === null || !valeurAdmise(valeur, false)) {
            fautes.push({
              famille: 'chiffre_hors_primitive',
              message: `${ici} reçoit une valeur hors de colonnesPii (pii.ts) : un clair peut y entrer.`,
            });
          }
        } else if (ecriture && estEmpreinteProtegee(nom)) {
          sites++;
          if (valeur === null || !valeurAdmise(valeur, true)) {
            fautes.push({
              famille: 'empreinte_hors_primitive',
              message: `${ici} est écrit sans ${[...PRODUCTEURS].join(' ni ')} : la valeur n’est pas prouvée empreinte.`,
            });
          }
        } else if (ecriture && estPersonnel(nom)) {
          sites++;
          fautes.push({
            famille: 'champ_personnel_en_clair',
            message: `${ici} est un champ de personne écrit en clair ; passez par colonnesPii (pii.ts).`,
          });
        } else if (nonJuge && (estEmpreinteProtegee(nom) || estPersonnel(nom))) {
          sites++;
          fautes.push({
            famille: 'ecriture_non_jugee',
            message: `${ici} vit sous une clé d’écriture dans une forme que la garde ne descend pas (appel, fonction…) : non jugé, donc refusé.`,
          });
        }
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
  return { fautes, sites };
}

// ── le contrôle ──────────────────────────────────────────────────────────────

export function controler(vue: Vue): {
  fautes: Faute[];
  champs: number;
  personnels: number;
  fichiers: number;
  sites: number;
} {
  const fautes: Faute[] = [];
  let champs = 0;
  let personnels = 0;
  try {
    const { modeles } = lireSchemaPrisma(vue.schema);
    if (modeles.length === 0) {
      fautes.push({
        famille: 'perimetre_vide',
        message: `${CHEMIN_SCHEMA} ne déclare aucun modèle.`,
      });
    }
    const noms = new Set(modeles.map((m) => m.nom));
    for (const m of modeles) {
      for (const c of m.champs) {
        if (noms.has(c.type)) continue;
        champs++;
        const verdicts = [...new Set([c.nom, c.colonne])].map((n) => fautesDeColonne(n, c.type));
        if ([c.nom, c.colonne].some((n) => estPersonnel(n) || estEmpreinteProtegee(n))) {
          personnels++;
        }
        const famille = verdicts.find((v) => v !== null);
        if (famille !== undefined && famille !== null) {
          fautes.push({
            famille,
            message:
              `${m.nom}.${c.nom}${c.colonne !== c.nom ? ` (colonne ${c.colonne})` : ''} : ${c.type}` +
              ` — ${FAMILLES.find((f) => f.nom === famille)!.explication}`,
          });
        }
      }
    }
  } catch (e) {
    if (!(e instanceof ErreurLecturePrisma)) throw e;
    fautes.push({ famille: 'schema_illisible', message: `${CHEMIN_SCHEMA} : ${e.message}` });
  }

  const code = vue.code.filter(
    (f) =>
      f.chemin.startsWith(RACINE_DU_CODE) &&
      f.chemin !== LA_PRIMITIVE &&
      EXTENSION_ANALYSEE.test(f.chemin)
  );
  if (code.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message: 'aucun fichier de code sous src/ à confronter.',
    });
  }
  let sites = 0;
  for (const f of code) {
    const r = fautesDEcriture(f.chemin, f.contenu);
    fautes.push(...r.fautes);
    sites += r.sites;
  }
  return { fautes, champs, personnels, fichiers: code.length, sites };
}

/** La décision, pure : le code de sortie et ce qu'il faut imprimer. */
export function decider(vue: Vue): { code: 0 | 1; lignes: string[] } {
  const { fautes, champs, personnels, fichiers, sites } = controler(vue);
  const compte =
    `${champs} champ(s) du schéma confrontés dont ${personnels} de personne, ` +
    `${fichiers} fichier(s) de src/ lus, ${sites} site(s) d’écriture de champ protégé confrontés`;
  if (fautes.length === 0) {
    return {
      code: 0,
      lignes: [
        `✅ securite:schema-pii — ${compte}.` +
          (personnels === 0
            ? ' Aucun modèle de personne n’existe encore : DM-06 (Apporteur) et DM-07 (contact de ' +
              'l’Attribution) poseront les premières colonnes, que cette garde jugera.'
            : '') +
          ' Ce vert ne dit rien d’une clé calculée, du SQL brut, d’une colonne Json ni de ce qui vit hors de src/.',
      ],
    };
  }
  return {
    code: 1,
    lignes: [
      `❌ securite:schema-pii — ${fautes.length} faute(s) ; ${compte} :`,
      ...fautes.map((f) => `   [${f.famille}] ${f.message}`),
    ],
  };
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

/** Le périmètre D'ABORD : hors de la racine ou sans `git`, le refus nomme `perimetre_illisible`. */
export function vueDuDepot(): Vue {
  const suivis = fichiersSuivisOuRefus('securite:schema-pii');
  return {
    schema: readFileSync(CHEMIN_SCHEMA, 'utf8'),
    code: suivis
      .filter((chemin) => chemin.startsWith(RACINE_DU_CODE))
      .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') })),
  };
}

// ── la preuve (RM-11 : vues injectées) ─────────────────────────────────────────

const MODELE_SAIN = [
  'model Contact {',
  '  id           String  @id @db.Uuid',
  '  siren        String  @db.Char(9)',
  '  nomChiffre   Bytes?  @map("nom_chiffre")',
  '  emailChiffre Bytes?',
  '  emailHash    String? @db.Char(64)',
  '  ipHash       String? @map("ip_hash") @db.Char(16)',
  '  attribution  Attribution? @relation(fields: [siren], references: [siren])',
  '}',
  'model Attribution {',
  '  siren    String @id',
  '  contacts Contact[]',
  '}',
].join('\n');
const CODE_SAIN = [
  "import { colonnesPii, empreinteRecherche, empreinteAdresseReseau } from '../securite/pii';",
  'export const creer = (tx, id, c, cles, ip) =>',
  "  tx.contact.create({ data: { siren: c.siren, ipHash: empreinteAdresseReseau(ip, cles), ...colonnesPii({ modele: 'Contact', id }, c, cles) } });",
  'export const trouver = (tx, email, cles) =>',
  "  tx.contact.findFirst({ where: { emailHash: empreinteRecherche('courriel', email, cles) }, select: { emailChiffre: true } });",
  'export const purger = (tx, id) => tx.contact.update({ where: { id }, data: { emailChiffre: null, emailHash: null } });',
  "export const journal = (ipHash) => JSON.stringify({ route: 'x', ipHash });",
].join('\n');
const BAC = 'src/server/bac/contact.ts';
const vue = (schema: string, contenu: string, chemin = BAC): Vue => ({
  schema,
  code: [{ chemin, contenu }],
});
const colonne = (ligne: string): string => MODELE_SAIN.replace('}\nmodel', `  ${ligne}\n}\nmodel`);

const TEMOINS: { famille: Famille; vue: () => Vue }[] = [
  { famille: 'schema_illisible', vue: () => vue('model Contact {\n  id String @id\n', CODE_SAIN) },
  { famille: 'perimetre_vide', vue: () => vue('enum E {\n  a\n}\n', CODE_SAIN) },
  { famille: 'perimetre_vide', vue: () => ({ schema: MODELE_SAIN, code: [] }) },
  {
    famille: 'colonne_personnelle_en_clair',
    vue: () => vue(colonne('createdIp String?'), CODE_SAIN),
  },
  { famille: 'colonne_personnelle_en_clair', vue: () => vue(colonne('email String'), CODE_SAIN) },
  {
    famille: 'colonne_personnelle_en_clair',
    vue: () => vue(colonne('courrielHash String @map("courriel")'), CODE_SAIN),
  },
  { famille: 'adresse_reseau_chiffree', vue: () => vue(colonne('ipChiffre Bytes'), CODE_SAIN) },
  { famille: 'forme_de_colonne', vue: () => vue(colonne('telephoneChiffre String'), CODE_SAIN) },
  { famille: 'forme_de_colonne', vue: () => vue(colonne('siretHash Bytes'), CODE_SAIN) },
  { famille: 'source_illisible', vue: () => vue(MODELE_SAIN, 'export const x = {;') },
  {
    famille: 'chiffre_hors_primitive',
    vue: () =>
      vue(MODELE_SAIN, 'tx.contact.create({ data: { id, emailChiffre: Buffer.from(email) } });'),
  },
  {
    famille: 'chiffre_hors_primitive',
    vue: () => vue(MODELE_SAIN, 'const ligne = { id, nomChiffre };'),
  },
  {
    famille: 'empreinte_hors_primitive',
    vue: () =>
      vue(MODELE_SAIN, 'tx.contact.update({ where: { id }, data: { emailHash: email } });'),
  },
  {
    famille: 'empreinte_hors_primitive',
    vue: () =>
      vue(MODELE_SAIN, 'tx.x.upsert({ where: { id }, create: { siretHash: siret }, update: {} });'),
  },
  {
    famille: 'empreinte_hors_primitive',
    vue: () => vue(MODELE_SAIN, 'tx.x.createMany({ data: [{ ipHash: adresse }] });'),
  },
  {
    famille: 'champ_personnel_en_clair',
    vue: () => vue(MODELE_SAIN, 'tx.contact.create({ data: { id, email } });'),
  },
  {
    famille: 'champ_personnel_en_clair',
    vue: () =>
      vue(MODELE_SAIN, "tx.a.create({ data: { contact: { create: { 'telephone': t } } } });"),
  },
  {
    famille: 'empreinte_hors_primitive',
    vue: () =>
      vue(MODELE_SAIN, 'tx.c.update({ where: { id }, data: { ...(ip ? { ipHash: ip } : {}) } });'),
  },
  {
    famille: 'empreinte_hors_primitive',
    vue: () =>
      vue(MODELE_SAIN, 'tx.c.update({ where: { id }, data: { ...(e && { emailHash: e }) } });'),
  },
  {
    famille: 'champ_personnel_en_clair',
    vue: () => vue(MODELE_SAIN, 'tx.c.create({ data: { id, profil: f ? { email: e } : null } });'),
  },
  {
    famille: 'ecriture_non_jugee',
    vue: () => vue(MODELE_SAIN, 'tx.c.create({ data: (() => ({ id, ipHash: ip }))() });'),
  },
];

const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
  { quoi: 'le modèle et le chemin d’écriture sains', vue: () => vue(MODELE_SAIN, CODE_SAIN) },
  {
    quoi: 'des noms qui contiennent un segment sans le porter (nombreDeDepots, hotel, siren)',
    vue: () =>
      vue(
        colonne('nombreDeDepots Int'),
        'tx.a.create({ data: { nombreDeDepots: 1, hotel: h, siren: s } });'
      ),
  },
  {
    quoi: 'un producteur de pii.ts dans un ternaire, et un clair passé en argument à colonnesPii',
    vue: () =>
      vue(
        MODELE_SAIN,
        "tx.c.update({ where: { id }, data: { emailHash: e ? empreinteRecherche('courriel', e, k) : null, ...colonnesPii(l, { email: e }, k) } });"
      ),
  },
  {
    quoi: 'la primitive elle-même, qui fabrique les colonnes',
    vue: () => ({
      schema: MODELE_SAIN,
      code: [
        { chemin: BAC, contenu: CODE_SAIN },
        {
          chemin: LA_PRIMITIVE,
          contenu: 'const s = { data: { emailChiffre: bloc, emailHash: h } };',
        },
      ],
    }),
  },
  {
    quoi: 'un fichier hors de src/ ou qui n’est pas du code',
    vue: () => ({
      schema: MODELE_SAIN,
      code: [
        { chemin: BAC, contenu: CODE_SAIN },
        { chemin: 'src/app/lisez-moi.md', contenu: 'data: { email }' },
        { chemin: 'tests/bac.ts', contenu: 'tx.c.create({ data: { email } });' },
      ],
    }),
  },
];

export function prouver(): { code: 0 | 1; lignes: string[] } {
  const sansTemoin = FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f.nom));
  if (sansTemoin.length > 0) {
    return {
      code: 1,
      lignes: [`❌ Famille(s) sans témoin : ${sansTemoin.map((f) => f.nom).join(', ')}.`],
    };
  }
  for (const t of TEMOINS) {
    const rougies = controler(t.vue()).fautes.map((f) => f.famille);
    if (!rougies.includes(t.famille)) {
      return {
        code: 1,
        lignes: [
          `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille (rougies : ${rougies.join(', ') || 'aucune'}).`,
        ],
      };
    }
  }
  for (const c of CONTRE_TEMOINS) {
    const { fautes } = controler(c.vue());
    if (fautes.length > 0) {
      return {
        code: 1,
        lignes: [
          `❌ Faux positif sur « ${c.quoi} » : [${fautes[0]!.famille}] ${fautes[0]!.message}`,
        ],
      };
    }
  }
  return {
    code: 0,
    lignes: [
      `✅ securite:schema-pii — Les ${FAMILLES.length} familles rougissent (${TEMOINS.length} témoins), ` +
        `${CONTRE_TEMOINS.length} contre-témoins restent verts :`,
      ...FAMILLES.map((f) => `   • ${f.nom} — ${f.explication}`),
    ],
  };
}

// ── exécution ────────────────────────────────────────────────────────────────

/** Importé par sa spécification autant que lancé en script : l'import ne doit rien lire ni sortir. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]schema-pii(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : decider(vueDuDepot());
  const ecrire = decision.code === 0 ? console.log : console.error;
  for (const l of decision.lignes) ecrire(l);
  process.exit(decision.code);
}
