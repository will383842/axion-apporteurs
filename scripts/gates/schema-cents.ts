/**
 * schema-cents.ts — la garde des montants (DM-02 ; REQ-DM-001). Registre : `partners:schema:cents`.
 *
 * USAGE : pnpm partners:schema:cents           (échoue sur un flottant ou un montant hors centimes)
 *         pnpm partners:schema:cents --prove   (un témoin par famille, cible au MILIEU d'un modèle ;
 *                                               contre-témoins verts)
 *
 * CE QU'ELLE TIENT. REQ-DM-001 : « Toute colonne monétaire de Partners est de type Int, exprimée en
 * centimes, HT, signée, suffixée `Cents` ; aucune colonne Float/Decimal ni valeur en euros n'existe
 * dans le schéma. » Un flottant arrondit un montant sans le dire, et un montant sans suffixe ne dit
 * pas s'il est en euros ou en centimes — la moitié des écarts de commission viennent de là.
 *
 * LES FAMILLES.
 *   — `virgule_flottante` : tout `Float` ou `Decimal`, QUEL QUE SOIT LE NOM — un taux en flottant
 *     finit multiplié par un montant. `Unsupported("numeric" | "real" | "money" …)` aussi.
 *   — `centimes_non_entiers` : un champ `…Cents` qui n'est pas un `Int` (`BigInt` compris : le
 *     domaine calcule en `number`, et REQ-DM-001 dit `Int`).
 *   — `montant_sans_suffixe` : un champ dont un SEGMENT (camelCase ou snake_case, nom du champ ou
 *     de sa colonne) est un mot de montant, sans le suffixe `Cents`. Un `…Id` n'est jamais un
 *     montant ; une relation, un enum, un booléen ou une date non plus.
 *   — `perimetre_vide` : schéma absent, zéro modèle ou zéro champ — « rien à redire » et « rien lu »
 *     ne se confondent pas.
 *   — `schema_illisible` : le lecteur unique refuse le schéma en nommant la ligne.
 *
 * LE SCHÉMA SE LIT par `scripts/lot/lecteur-prisma.ts` : un modèle se ferme sur SON accolade.
 *
 * LE TYPE SE JUGE SUR CE QUE POSTGRES EN FAIT (`GENRE_FLOTTANT` + `estDuGenreColonne`), jamais sur
 * son orthographe Prisma : `Unsupported("numeric")` arrondit autant qu'un `Decimal`. Le mécanisme
 * vit dans le lecteur unique et sert aussi à `schema-enums` (RM-01) — l'AIGUILLAGE entre type
 * natif et type Prisma y vit désormais lui aussi, au lieu d'être recopié mot pour mot des deux
 * côtés.
 *
 * SON PÉRIMÈTRE EST `prisma/schema.prisma`, ET UNE COLONNE PEUT ENTRER AILLEURS. REQ-DM-037
 * institue le SQL brut comme canal légitime : une colonne posée par une migration à la main n'est
 * PAS dans ce fichier, et cette garde ne la voit pas. Elle n'essaie pas de parser `CREATE TABLE` —
 * un parseur ne connaît que les formes qu'on lui a apprises. Le canal est fermé LÀ OÙ IL DÉBOUCHE :
 * `tests/integration/index-partiels.spec.ts`, second `describe`, applique `fautesDUneColonne` aux
 * colonnes que le CATALOGUE de la base porte après `prisma migrate deploy` —
 * `pg_attribute.atttypid` déplié par `typeReel`, et non le libellé
 * `information_schema.columns.data_type`, qui repliait un `numeric[]` en `ARRAY` et le rendait
 * invisible à `virgule_flottante` — la MÊME cécité que celle de `schema-enums`, fermée ici du
 * même geste : un tableau d'un type qui arrondit arrondit. Ce que ce contrôle ne tient PAS est
 * nommé, forme par forme, dans `docs/gates.json`. Une règle, deux sources de colonnes, une
 * implémentation.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit rien du dépôt : chaque témoin est une vue
 * injectée, et la faute y est posée au MILIEU d'un modèle, entre deux champs sains.
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  ErreurLecturePrisma,
  estDuGenreColonne,
  lireSchemaPrisma,
  typeAffiche,
  type GenreDeType,
  type SchemaPrisma,
  type TypeDeColonne,
} from '../lot/lecteur-prisma';
import { segmentsDuNom } from '../../src/domain/donnees-personnelles/champs';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';

/**
 * Les SEGMENTS qui font d'un champ un montant. Ce sont des mots du métier, pas une valeur dérivable
 * d'une source : la liste est celle de l'acceptation de la tâche, plus les trois mots
 * (`remuneration`, `euro`, `euros`) du prédicat provisoire que cette garde remplace — le remplacer
 * ne l'affaiblit pas. Chaque mot a son témoin.
 */
export const MOTS_DE_MONTANT = [
  'montant',
  'prix',
  'solde',
  'tarif',
  'remise',
  'acompte',
  'remuneration',
  'euro',
  'euros',
] as const;

/**
 * LE GENRE « ce type arrondit, ou porte des euros » — le prédicat de décision de la famille
 * `virgule_flottante`, scalaires Prisma ET types natifs d'un `Unsupported(…)` dans le MÊME objet.
 * Exporté parce que ce qui décide ici doit décider partout où la même règle se juge : la spec
 * d'intégration l'applique aux colonnes de la base RÉELLE (RM-01). Un `numeric[]` en relève :
 * `typeReel` déplie le tableau, et un tableau de ce qui arrondit arrondit.
 *
 * ⚠️ IL NE PORTE PAS DE `categories`, ET CETTE ASYMÉTRIE AVEC `GENRE_CHAINE_LIBRE` EST VOULUE.
 * La catégorie que PostgreSQL attache aux types numériques est `N`, et elle couvre AUSSI les
 * entiers — que REQ-DM-001 exige. S'y appuyer condamnerait `Int … Cents`, la seule écriture juste.
 * LA LIMITE QUI EN DÉCOULE, nommée plutôt que subie : un type d'EXTENSION qui arrondit et dont le
 * nom n'est dans aucun motif ci-dessous n'est pas vu, là où la catégorie `S` rattrape son
 * équivalent côté chaînes. La fermer demande la liste des types qui arrondissent DÉRIVÉE de
 * l'extension installée ; les migrations du dépôt n'installent aucune extension à ce jour, et
 * cette famille appartient à la tâche qui en installerait une. Voir `docs/gates.json`.
 */
export const GENRE_FLOTTANT: GenreDeType = {
  scalaires: ['Float', 'Decimal'],
  natif: /numeric|decimal|real|double|float|money/i,
};
/** Les types qui ne portent jamais un montant, même quand leur nom en évoque un. */
const TYPES_NON_MONETAIRES = new Set(['Boolean', 'DateTime']);

/**
 * LE SUFFIXE `Cents`, jugé par SEGMENT et non par fin de chaîne : `montantHtCents` en Prisma et
 * `montant_ht_cents` en base sont le même champ, et la garde doit en dire la même chose des deux
 * côtés. Exporté pour la spec d'intégration, qui lit les colonnes de la base réelle.
 */
export function estEnCents(nom: string): boolean {
  return segmentsDuNom(nom).at(-1) === 'cents';
}

export type Faute = { famille: string; message: string };

export const FAMILLES: { nom: string; explication: string }[] = [
  {
    nom: 'schema_illisible',
    explication: 'le schéma ne se lit pas : la garde refuse au lieu de juger ce qu’elle a compris.',
  },
  {
    nom: 'perimetre_vide',
    explication: 'aucun modèle ou aucun champ : un zéro ne dit pas si rien n’a été lu.',
  },
  {
    nom: 'virgule_flottante',
    explication: 'un Float ou un Decimal, quel que soit son nom (REQ-DM-001).',
  },
  {
    nom: 'centimes_non_entiers',
    explication: 'un champ …Cents qui n’est pas un Int (REQ-DM-001).',
  },
  {
    nom: 'montant_sans_suffixe',
    explication: 'un montant, un prix, un solde… sans le suffixe Cents (REQ-DM-001).',
  },
];
const NOMS_FAMILLES = FAMILLES.map((f) => f.nom);

/**
 * UNE COLONNE À JUGER, d'où qu'elle vienne — du schéma Prisma, ou du catalogue d'une base migrée.
 * `natif` dit laquelle des deux : le type d'une colonne lue en base est DÉJÀ un type PostgreSQL,
 * celui d'un champ Prisma ne l'est qu'à l'intérieur d'un `Unsupported(…)`. La RÈGLE, elle, est la
 * même des deux côtés, et n'a qu'une implémentation (`fautesDUneColonne`, RM-01).
 */
export type ColonneAJuger = TypeDeColonne & {
  /** Où la nommer : `prisma/schema.prisma:97 — Commission.brut`, `metier.attributions.montant`… */
  ou: string;
  /** Le nom du champ — celui qui porte, ou non, le suffixe `Cents`. */
  nom: string;
  /** Le nom de la colonne SQL (`@map`), ou le même que `nom` quand il n'y en a pas d'autre. */
  colonne: string;
  /** Un type qui ne porte jamais un montant : relation, enum, booléen, date, identifiant. */
  jamaisMonetaire: boolean;
};

/** Le genre « ce type est un entier », celui que REQ-DM-001 exige d'un champ `…Cents`. */
export const GENRE_ENTIER: GenreDeType = { scalaires: ['Int'], natif: /^(integer|int4|int)$/i };

/** Le genre « ce type ne porte jamais un montant », côté Prisma comme côté PostgreSQL. */
export const GENRE_NON_MONETAIRE: GenreDeType = {
  scalaires: [...TYPES_NON_MONETAIRES],
  natif: /\b(bool|boolean|date|time|timestamp|timestamptz|interval|uuid|inet|bytea)\b/i,
};

/**
 * LES FAUTES DE REQ-DM-001 SUR UNE COLONNE. Seule implémentation de la règle : la garde statique
 * l'applique aux champs de `prisma/schema.prisma`, la spec d'intégration aux colonnes de la base
 * RÉELLE après `migrate deploy` — une règle, deux sources de colonnes, une implémentation.
 */
export function fautesDUneColonne(c: ColonneAJuger): Faute[] {
  // L'aiguillage « natif ou Prisma » ne se pose plus ici : il vit une seule fois, dans le
  // lecteur unique. Il était recopié mot pour mot dans `schema-enums` (RM-01).
  const duGenre = (g: GenreDeType): boolean => estDuGenreColonne(c, g);
  if (duGenre(GENRE_FLOTTANT)) {
    return [
      {
        famille: 'virgule_flottante',
        message:
          `${c.ou} est un ${typeAffiche(c)} : REQ-DM-001 interdit toute colonne Float ou ` +
          'Decimal, quel que soit son nom. Un montant est un Int en centimes, suffixé Cents ; ' +
          'un taux, un Int en points de base.',
      },
    ];
  }
  const enCents = estEnCents(c.nom);
  if (enCents && !duGenre(GENRE_ENTIER)) {
    return [
      {
        famille: 'centimes_non_entiers',
        message: `${c.ou} est suffixé Cents mais typé ${typeAffiche(c)} : REQ-DM-001 veut un Int.`,
      },
    ];
  }
  if (enCents || c.jamaisMonetaire || duGenre(GENRE_NON_MONETAIRE)) return [];
  const segments = [...segmentsDuNom(c.nom), ...segmentsDuNom(c.colonne)];
  if (segments[segmentsDuNom(c.nom).length - 1] === 'id') return [];
  const mot = MOTS_DE_MONTANT.find((m) => segments.includes(m));
  if (mot === undefined) return [];
  return [
    {
      famille: 'montant_sans_suffixe',
      message:
        `${c.ou} (${typeAffiche(c)}) porte le mot « ${mot} » sans le suffixe Cents : on ne sait ` +
        "pas s'il est en euros ou en centimes. REQ-DM-001 : Int, centimes, HT, suffixé Cents.",
    },
  ];
}

/** Le schéma lu, et ce qui y a été confronté. Lève `ErreurLecturePrisma` s'il ne se lit pas. */
export function controlerSchema(schema: SchemaPrisma): Faute[] {
  const fautes: Faute[] = [];
  const champs = schema.modeles.flatMap((m) => m.champs.map((c) => ({ modele: m.nom, ...c })));
  if (schema.modeles.length === 0 || champs.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        `${CHEMIN_SCHEMA} — ${schema.modeles.length} modèle(s), ${champs.length} champ(s) : aucune ` +
        "colonne à juger, et ce zéro ne dit pas si c'est parce qu'il n'y a rien à redire ou parce " +
        "qu'on n'a rien lu.",
    });
  }
  /** Un type qui nomme un modèle ou un enum du schéma est une relation ou un vocabulaire. */
  const declares = new Set([
    ...schema.modeles.map((m) => m.nom),
    ...schema.enums.map((e) => e.nom),
  ]);
  for (const c of champs) {
    fautes.push(
      ...fautesDUneColonne({
        ou: `${CHEMIN_SCHEMA}:${c.ligne} — ${c.modele}.${c.nom}`,
        nom: c.nom,
        colonne: c.colonne,
        type: c.type,
        natif: false,
        tableau: c.liste,
        jamaisMonetaire: declares.has(c.type),
      })
    );
  }
  return fautes;
}

/** Le contrôle d'un TEXTE de schéma : un schéma illisible est une faute, jamais un vert. */
export function controler(texte: string): Faute[] {
  try {
    return controlerSchema(lireSchemaPrisma(texte));
  } catch (e) {
    if (!(e instanceof ErreurLecturePrisma)) throw e;
    return [
      {
        famille: 'schema_illisible',
        message: `${CHEMIN_SCHEMA} — ${e.message} : la garde ne juge pas un schéma qu'elle ne sait pas lire.`,
      },
    ];
  }
}

// ── la preuve (RM-11) ────────────────────────────────────────────────────────

/** Un modèle sain, la faute posée au MILIEU : ni premier champ, ni dernier. */
const avecAuMilieu = (champ: string): string =>
  [
    'enum Palier {',
    '  bronze',
    '}',
    '',
    'model Commission {',
    '  id            String @id',
    '  montantHtCents Int',
    `  ${champ}`,
    '  apporteurId   String',
    '  palier        Palier',
    '}',
    '',
  ].join('\n');

const TEMOINS: { famille: string; nomme: string; schema: string }[] = [
  {
    famille: 'virgule_flottante',
    nomme: 'Commission.montantEuros',
    schema: avecAuMilieu('montantEuros Float'),
  },
  { famille: 'virgule_flottante', nomme: 'Commission.taux', schema: avecAuMilieu('taux Decimal') },
  {
    famille: 'virgule_flottante',
    nomme: 'Commission.brut',
    schema: avecAuMilieu('brut Unsupported("numeric")?'),
  },
  {
    famille: 'centimes_non_entiers',
    nomme: 'Commission.remiseCents',
    schema: avecAuMilieu('remiseCents BigInt'),
  },
  {
    famille: 'montant_sans_suffixe',
    nomme: 'Commission.prixHt',
    schema: avecAuMilieu('prixHt Int'),
  },
  {
    famille: 'montant_sans_suffixe',
    nomme: 'Commission.brut',
    schema: avecAuMilieu('brut Int @map("solde_du")'),
  },
  ...MOTS_DE_MONTANT.map((mot) => ({
    famille: 'montant_sans_suffixe',
    nomme: `Commission.${mot}Du`,
    schema: avecAuMilieu(`${mot}Du Int`),
  })),
  {
    famille: 'virgule_flottante',
    nomme: 'Bac.montantEuros',
    schema: 'model Bac { id Int @id // }\n  montantEuros Float\n  nom String\n}\n',
  },
  { famille: 'perimetre_vide', nomme: '0 modèle', schema: 'enum Palier {\n  bronze\n}\n' },
  { famille: 'schema_illisible', nomme: 'ligne 8', schema: avecAuMilieu('prix Int @default("}') },
];

const CONTRE_TEMOINS: { quoi: string; schema: string }[] = [
  { quoi: 'un modèle sain', schema: avecAuMilieu('libelle String') },
  { quoi: 'un identifiant qui nomme une commission', schema: avecAuMilieu('commissionId String') },
  { quoi: 'un identifiant qui nomme une remise', schema: avecAuMilieu('remiseId String') },
  { quoi: 'un montant en centimes', schema: avecAuMilieu('soldeCents Int?') },
  { quoi: 'une date de remise', schema: avecAuMilieu('remiseAt DateTime') },
  { quoi: 'un enum dont le nom évoque un montant', schema: avecAuMilieu('tarifPalier Palier') },
  { quoi: 'un mot qui CONTIENT un segment sans l’être', schema: avecAuMilieu('comprixe Int') },
];

// ── exécution ────────────────────────────────────────────────────────────────

/** Ancrée dossier + nom + fin, extension FACULTATIVE : invoquée sans `.ts`, elle juge quand même. */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]schema-cents(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = NOMS_FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
    const echecs: string[] = sansTemoin.map((f) => `famille sans témoin : ${f}`);
    for (const t of TEMOINS) {
      const fautes = controler(t.schema).filter((f) => f.famille === t.famille);
      if (!fautes.some((f) => f.message.includes(t.nomme))) {
        echecs.push(`le témoin « ${t.famille} » (${t.nomme}) n'a pas rougi en le nommant`);
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const fautes = controler(c.schema);
      if (fautes.length > 0) echecs.push(`faux positif sur « ${c.quoi} » : ${fautes[0]!.message}`);
    }
    if (echecs.length > 0) {
      console.error(`❌ partners:schema:cents --prove — ${echecs.length} échec(s) :`);
      for (const e of echecs) console.error(`   ${e}`);
      process.exit(1);
    }
    console.log(
      `✅ partners:schema:cents — Les ${FAMILLES.length} familles rougissent sur ${TEMOINS.length} témoins, ` +
        `${CONTRE_TEMOINS.length} contre-témoins restent verts :`
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  const texte = existsSync(CHEMIN_SCHEMA) ? readFileSync(CHEMIN_SCHEMA, 'utf8') : undefined;
  const fautes: Faute[] =
    texte === undefined
      ? [
          {
            famille: 'perimetre_vide',
            message: `${CHEMIN_SCHEMA} est introuvable : rien n'a été lu.`,
          },
        ]
      : controler(texte);
  let modeles = 0;
  let champs = 0;
  let enCents = 0;
  try {
    const lu = lireSchemaPrisma(texte ?? '');
    modeles = lu.modeles.length;
    champs = lu.modeles.reduce((n, m) => n + m.champs.length, 0);
    enCents = lu.modeles.reduce((n, m) => n + m.champs.filter((c) => estEnCents(c.nom)).length, 0);
  } catch {
    // illisible : la famille `schema_illisible` le dit
  }
  console.log(
    `partners:schema:cents — périmètre : ${CHEMIN_SCHEMA}, ${modeles} modèle(s), ${champs} champ(s) confrontés, ` +
      `dont ${enCents} en Cents.`
  );
  if (fautes.length > 0) {
    console.error(`❌ partners:schema:cents — ${fautes.length} faute(s) :`);
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  console.log(
    `✅ partners:schema:cents — aucun flottant, aucun montant hors centimes : ${champs} champ(s) de ` +
      `${modeles} modèle(s) jugés.`
  );
  process.exit(0);
}
