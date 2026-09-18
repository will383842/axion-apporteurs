/**
 * journal-sans-pii.ts — la charge d'un événement du journal ne porte aucune donnée personnelle
 * (DM-01 ; REQ-DM-041). Registre : `journal:sans-pii`.
 *
 * USAGE : pnpm journal:sans-pii          (échoue si une charge sort de la liste fermée des formes)
 *         pnpm journal:sans-pii:prove    (un témoin par famille, chacun vu rougir ; contre-témoins verts)
 *
 * LE PROBLÈME QU'ELLE TIENT. Le journal `Evenement` est append-only : la base refuse toute mise à
 * jour (REQ-DM-024). Une donnée personnelle écrite dans une charge ne pourrait donc JAMAIS être
 * effacée — le droit à l'effacement buterait sur le déclencheur. La seule issue est une charge qui
 * n'en porte aucune : alors effacer un tiers ne touche pas `evenements`, et la chaîne reste vraie.
 *
 * CE QU'ELLE JUGE : LE SCHÉMA ZOD LUI-MÊME, PAS DES EXEMPLES. Pour chaque type de
 * `CHARGES_PAR_TYPE` (`src/domain/evenement/charges.ts`), elle descend l'arbre du schéma et exige :
 *   — une charge et chaque objet imbriqué `.strict()`, sans `catchall` (`charge_ouverte`) ;
 *   — chaque feuille dans la liste fermée des formes — identifiant `uuid`, empreinte sur
 *     `HASH_HEX_64` (CETTE constante, par identité), enum, `nativeEnum`, littéral de chaîne, entier
 *     sur un champ suffixé `Cents`, horodatage `datetime`, déballés d'`optional` / `nullable`
 *     (`feuille_hors_liste`) — `z.string()` nu compris : une chaîne libre peut porter un courriel ;
 *   — aucun champ dont un segment de nom est au lexique UNIQUE des champs de personne
 *     (`src/domain/donnees-personnelles/champs.ts`), sauf une EMPREINTE : dernier segment `hash` et
 *     forme empreinte (`ipHash`, `emailHash`) (`champ_nominatif`) ;
 *   — les clés de `CHARGES_PAR_TYPE` égales aux valeurs de l'enum `TypeEvenementJournal` lues dans
 *     `prisma/schema.prisma`, dans les deux sens (`type_sans_charge`, `charge_sans_type`) ;
 *   — un périmètre non vide : un enum illisible n'est pas « rien à dire » (`perimetre_vide`).
 * Le vert imprime le compte des types et des champs RÉELLEMENT confrontés.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit pas le dépôt : ses vues sont INJECTÉES.
 */
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { CHARGES_PAR_TYPE, FORMES, HASH_HEX_64 } from '../../src/domain/evenement/charges';
import { segmentsDuNom, segmentsPersonnels } from '../../src/domain/donnees-personnelles/champs';
import { enumsDuSchema } from './schema-enums';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';
const ENUM_DES_TYPES = 'TypeEvenementJournal';

export type Vue = {
  /** Les valeurs de l'enum `TypeEvenementJournal`, lues dans `prisma/schema.prisma`. */
  typesDuSchema: string[];
  /** Les schémas de charge, par type. */
  charges: Record<string, z.ZodTypeAny>;
};

export type Famille =
  | 'champ_nominatif'
  | 'feuille_hors_liste'
  | 'charge_ouverte'
  | 'type_sans_charge'
  | 'charge_sans_type'
  | 'perimetre_vide';

export type Faute = { famille: Famille; ou: string; message: string };

export const FAMILLES: { nom: Famille; explication: string }[] = [
  {
    nom: 'champ_nominatif',
    explication:
      'un champ dont un segment de nom désigne une personne (nom, courriel, téléphone, IBAN, adresse, IP), hors empreinte.',
  },
  {
    nom: 'feuille_hors_liste',
    explication:
      'une feuille hors de la liste fermée des formes — `z.string()` nu compris : une chaîne libre peut porter un courriel.',
  },
  {
    nom: 'charge_ouverte',
    explication:
      'une charge ou un objet imbriqué qui accepte des clés inconnues (non `.strict()`, `catchall`) ou qui n’est pas un objet.',
  },
  {
    nom: 'type_sans_charge',
    explication: 'une valeur de l’enum TypeEvenementJournal sans schéma de charge.',
  },
  {
    nom: 'charge_sans_type',
    explication: 'un schéma de charge dont le type n’est pas une valeur de l’enum.',
  },
  {
    nom: 'perimetre_vide',
    explication:
      'l’enum TypeEvenementJournal est illisible : la garde ne saurait pas quoi confronter.',
  },
];

// ── le contrôle ──────────────────────────────────────────────────────────────

type Forme = 'identifiant' | 'empreinte' | 'enum' | 'montant' | 'horodatage' | 'objet' | null;

/** La forme d'une feuille, ou `null` si elle est hors de la liste fermée. */
function forme(schema: z.ZodTypeAny, cle: string): Forme {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return forme(schema.unwrap() as z.ZodTypeAny, cle);
  }
  if (schema instanceof z.ZodObject) return 'objet';
  if (schema instanceof z.ZodEnum || schema instanceof z.ZodNativeEnum) return 'enum';
  if (schema instanceof z.ZodLiteral) return typeof schema.value === 'string' ? 'enum' : null;
  if (schema instanceof z.ZodString) {
    const checks = schema._def.checks;
    if (checks.some((c) => c.kind === 'uuid')) return 'identifiant';
    if (checks.some((c) => c.kind === 'regex' && c.regex === HASH_HEX_64)) return 'empreinte';
    if (checks.some((c) => c.kind === 'datetime')) return 'horodatage';
    return null;
  }
  if (schema instanceof z.ZodNumber) {
    const entier = schema._def.checks.some((c) => c.kind === 'int');
    return entier && cle.endsWith('Cents') ? 'montant' : null;
  }
  return null;
}

/** Le schéma d'objet sous `optional` / `nullable`. */
function objetSous(schema: z.ZodTypeAny): z.AnyZodObject | undefined {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return objetSous(schema.unwrap() as z.ZodTypeAny);
  }
  return schema instanceof z.ZodObject ? schema : undefined;
}

const estFerme = (o: z.AnyZodObject): boolean =>
  o._def.unknownKeys === 'strict' && o._def.catchall instanceof z.ZodNever;

export function controler(vue: Vue): { fautes: Faute[]; types: number; champs: number } {
  const fautes: Faute[] = [];
  let champs = 0;

  if (vue.typesDuSchema.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      ou: ENUM_DES_TYPES,
      message:
        `${CHEMIN_SCHEMA} ne donne aucune valeur à l’enum ${ENUM_DES_TYPES} : la garde ne sait pas ` +
        'quels types confronter, et ne prétend pas juger.',
    });
  }
  for (const t of vue.typesDuSchema) {
    if (!(t in vue.charges)) {
      fautes.push({
        famille: 'type_sans_charge',
        ou: t,
        message:
          `${t} est une valeur de ${ENUM_DES_TYPES} sans schéma dans CHARGES_PAR_TYPE : un événement ` +
          'de ce type n’aurait aucune charge fermée.',
      });
    }
  }

  /** Descend un objet `.strict()` et juge chacun de ses champs. */
  const descendre = (objet: z.AnyZodObject, chemin: string): void => {
    for (const [cle, champ] of Object.entries(objet.shape as Record<string, z.ZodTypeAny>)) {
      champs++;
      const ici = `${chemin}.${cle}`;
      const f = forme(champ, cle);
      const empreinte = f === 'empreinte' && segmentsDuNom(cle).at(-1) === 'hash';
      const personnels = segmentsPersonnels(cle);
      if (personnels.length > 0 && !empreinte) {
        fautes.push({
          famille: 'champ_nominatif',
          ou: ici,
          message:
            `${ici} — « ${personnels.map((p) => `${p.segment} (${p.categorie})`).join(', ')} » ` +
            'désigne une donnée personnelle : le journal ne peut pas l’effacer. Référence la ' +
            'personne par son identifiant, ou par une empreinte `…Hash` sur HASH_HEX_64.',
        });
      }
      if (f === null) {
        fautes.push({
          famille: 'feuille_hors_liste',
          ou: ici,
          message:
            `${ici} — forme hors de la liste fermée (identifiant uuid, empreinte HASH_HEX_64, enum, ` +
            'littéral de chaîne, entier sur un champ …Cents, horodatage datetime). Utilise FORMES.',
        });
      }
      const sous = objetSous(champ);
      if (sous) juger(sous, ici);
    }
  };

  const juger = (schema: z.ZodTypeAny, chemin: string): void => {
    const objet = objetSous(schema);
    if (!objet || !estFerme(objet)) {
      fautes.push({
        famille: 'charge_ouverte',
        ou: chemin,
        message:
          `${chemin} — charge ouverte : une clé inconnue y passerait, courriel compris. ` +
          'Déclare un objet `.strict()`, sans `catchall`.',
      });
    }
    if (objet) descendre(objet, chemin);
  };

  let types = 0;
  for (const [type, schema] of Object.entries(vue.charges)) {
    if (!vue.typesDuSchema.includes(type)) {
      fautes.push({
        famille: 'charge_sans_type',
        ou: type,
        message:
          `CHARGES_PAR_TYPE.${type} n’est pas une valeur de ${ENUM_DES_TYPES} (${CHEMIN_SCHEMA}) : ` +
          'aucune ligne du journal ne peut porter ce type.',
      });
    }
    types++;
    juger(schema, type);
  }

  return { fautes, types, champs };
}

/** La décision, pure : le code de sortie et ce qu'il faut imprimer. */
export function decider(vue: Vue): { code: 0 | 1; lignes: string[] } {
  const { fautes, types, champs } = controler(vue);
  if (fautes.length === 0) {
    return {
      code: 0,
      lignes: [
        `✅ journal:sans-pii — ${types} type(s), ${champs} champ(s) confrontés à la liste fermée ` +
          'des formes et au lexique des champs de personne ; aucune charge ne porte de donnée personnelle.',
      ],
    };
  }
  return {
    code: 1,
    lignes: [
      `❌ journal:sans-pii — ${fautes.length} faute(s) sur ${types} type(s), ${champs} champ(s) :`,
      ...fautes.map((f) => `   [${f.famille}] ${f.message}`),
    ],
  };
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

export function vueDuDepot(): Vue {
  const schema = existsSync(CHEMIN_SCHEMA) ? readFileSync(CHEMIN_SCHEMA, 'utf8') : '';
  return {
    typesDuSchema: enumsDuSchema(schema).get(ENUM_DES_TYPES) ?? [],
    charges: CHARGES_PAR_TYPE,
  };
}

// ── la preuve (RM-11 : vues injectées) ─────────────────────────────────────────

const bac = (shape: z.ZodRawShape): Vue => ({
  typesDuSchema: ['bac'],
  charges: { bac: z.object(shape).strict() },
});

const TEMOINS: { famille: Famille; vue: () => Vue }[] = [
  { famille: 'champ_nominatif', vue: () => bac({ email: z.string().email() }) },
  { famille: 'champ_nominatif', vue: () => bac({ nomContact: z.enum(['a']) }) },
  { famille: 'feuille_hors_liste', vue: () => bac({ motif: z.string() }) },
  { famille: 'feuille_hors_liste', vue: () => bac({ montantHt: z.number().int() }) },
  {
    famille: 'charge_ouverte',
    vue: () => ({
      typesDuSchema: ['bac'],
      charges: { bac: z.object({ agregatId: FORMES.identifiant() }).passthrough() },
    }),
  },
  {
    famille: 'charge_ouverte',
    vue: () => bac({ contexte: z.object({ agregatId: FORMES.identifiant() }) }),
  },
  {
    famille: 'type_sans_charge',
    vue: () => ({ ...bac({ agregatId: FORMES.identifiant() }), typesDuSchema: ['bac', 'autre'] }),
  },
  {
    famille: 'charge_sans_type',
    vue: () => ({ ...bac({ agregatId: FORMES.identifiant() }), typesDuSchema: ['autre'] }),
  },
  { famille: 'perimetre_vide', vue: () => ({ typesDuSchema: [], charges: {} }) },
];

const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
  {
    quoi: 'toutes les formes admises, empreintes de personne comprises',
    vue: () =>
      bac({
        agregatId: FORMES.identifiant(),
        ipHash: FORMES.empreinte(),
        emailHash: FORMES.empreinte().nullable(),
        montantHtCents: FORMES.montantCents(),
        survenuAt: FORMES.horodatage().optional(),
        statut: z.enum(['a', 'b']),
        version: z.literal('v1'),
        contexte: z.object({ releveId: FORMES.identifiant() }).strict(),
      }),
  },
  {
    quoi: 'des noms qui CONTIENNENT un segment de personne sans en porter un',
    vue: () => bac({ nombreDeDepots: z.enum(['un']), nomenclature: z.enum(['x']) }),
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
      `✅ journal:sans-pii — Les ${FAMILLES.length} familles rougissent (${TEMOINS.length} témoins), ` +
        `${CONTRE_TEMOINS.length} contre-témoins restent verts :`,
      ...FAMILLES.map((f) => `   • ${f.nom} — ${f.explication}`),
    ],
  };
}

// ── exécution ────────────────────────────────────────────────────────────────

/**
 * Importé par sa spécification autant que lancé en script : l'import ne doit rien lire ni sortir.
 * Ancré sur le dossier, le nom et la fin — extension FACULTATIVE : `tsx` lance aussi le chemin sans
 * `.ts`, et une garde qui ne se reconnaîtrait pas sortirait en 0 sans avoir rien jugé.
 */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]journal-sans-pii(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  const decision = process.argv.includes('--prove') ? prouver() : decider(vueDuDepot());
  const ecrire = decision.code === 0 ? console.log : console.error;
  for (const l of decision.lignes) ecrire(l);
  process.exit(decision.code);
}
