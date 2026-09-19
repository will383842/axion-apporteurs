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
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit rien du dépôt : chaque témoin est une vue
 * injectée, et la faute y est posée au MILIEU d'un modèle, entre deux champs sains.
 */

import { existsSync, readFileSync } from 'node:fs';
import { ErreurLecturePrisma, lireSchemaPrisma, type SchemaPrisma } from '../lot/lecteur-prisma';
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

/** Les types scalaires qui arrondissent. */
const TYPES_FLOTTANTS = new Set(['Float', 'Decimal']);
/** Le type natif d'un `Unsupported(…)` qui arrondit, ou qui porte des euros. */
const NATIF_FLOTTANT = /numeric|decimal|real|double|float|money/i;
/** Les types qui ne portent jamais un montant, même quand leur nom en évoque un. */
const TYPES_NON_MONETAIRES = new Set(['Boolean', 'DateTime']);

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
  const nonMonetaires = new Set([
    ...TYPES_NON_MONETAIRES,
    ...schema.modeles.map((m) => m.nom),
    ...schema.enums.map((e) => e.nom),
  ]);
  for (const c of champs) {
    const ou = `${CHEMIN_SCHEMA}:${c.ligne} — ${c.modele}.${c.nom}`;
    const natif = /^Unsupported\((.*)\)$/.exec(c.type)?.[1];
    if (TYPES_FLOTTANTS.has(c.type) || (natif !== undefined && NATIF_FLOTTANT.test(natif))) {
      fautes.push({
        famille: 'virgule_flottante',
        message:
          `${ou} est un ${c.type} : REQ-DM-001 interdit toute colonne Float ou Decimal, quel que ` +
          'soit son nom. Un montant est un Int en centimes, suffixé Cents ; un taux, un Int en ' +
          'points de base.',
      });
      continue;
    }
    const enCents = c.nom.endsWith('Cents');
    if (enCents && c.type !== 'Int') {
      fautes.push({
        famille: 'centimes_non_entiers',
        message: `${ou} est suffixé Cents mais typé ${c.type} : REQ-DM-001 veut un Int.`,
      });
      continue;
    }
    if (enCents || nonMonetaires.has(c.type)) continue;
    const segments = [...segmentsDuNom(c.nom), ...segmentsDuNom(c.colonne)];
    if (segments[segmentsDuNom(c.nom).length - 1] === 'id') continue;
    const mot = MOTS_DE_MONTANT.find((m) => segments.includes(m));
    if (mot !== undefined) {
      fautes.push({
        famille: 'montant_sans_suffixe',
        message:
          `${ou} (${c.type}) porte le mot « ${mot} » sans le suffixe Cents : on ne sait pas s'il ` +
          'est en euros ou en centimes. REQ-DM-001 : Int, centimes, HT, suffixé Cents.',
      });
    }
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
    enCents = lu.modeles.reduce(
      (n, m) => n + m.champs.filter((c) => c.nom.endsWith('Cents')).length,
      0
    );
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
