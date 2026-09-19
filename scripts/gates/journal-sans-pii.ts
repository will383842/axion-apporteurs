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
 *   — un périmètre non vide : un enum illisible n'est pas « rien à dire » (`perimetre_vide`) ;
 *   — UN SEUL ÉCRIVAIN de la table `evenements` : `src/server/evenement/journal.ts`. La règle ne
 *     chasse pas une ORTHOGRAPHE d'appel — un délégué pris en variable, déstructuré, entre crochets,
 *     une requête construite à part passent sous toute liste de formes. Elle refuse toute MENTION :
 *     le mot `evenement` (le délégué Prisma, en minuscules) ou `evenements` (la table, toute casse),
 *     comme identifiant, propriété, chaîne, gabarit ou clé entre crochets, dans tout fichier SUIVI
 *     sous `src/`, `scripts/` ou `packages/`, TOUTES extensions (`ecrivain_hors_journal`). Seul le
 *     CHEMIN d'un import statique (`from '…/evenement/journal'`) n'est pas une mention : il charge un
 *     module, il n'atteint pas la table. Le type Prisma `Evenement` (majuscule) reste admis.
 *     LA LISTE BLANCHE est courte et nommée (`LISTE_BLANCHE`) : l'écrivain unique, le domaine pur du
 *     journal (`src/domain/evenement/`, à condition qu'il n'importe aucun client), cette garde, et
 *     quelques fichiers qui NOMMENT le mot sans toucher la table — ceux-là à un COMPTE de mentions
 *     figé : une mention de plus rougit. Échec FERMÉ : une simple lecture du journal hors de
 *     l'écrivain rougit aussi. Ce que la règle ne voit PAS : un nom calculé (`'evene' + 'ment'`), un
 *     client hors du dépôt, `prisma/` (migrations et graine), une extension `$extends` ou TypedSQL
 *     qui ne nomme pas le mot.
 * Le vert imprime le compte des types et des champs RÉELLEMENT confrontés.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit pas le dépôt : ses vues sont INJECTÉES.
 */
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { CHARGES_PAR_TYPE, FORMES, HASH_HEX_64 } from '../../src/domain/evenement/charges';
import { segmentsDuNom, segmentsPersonnels } from '../../src/domain/donnees-personnelles/champs';
import { enumsDuSchema } from './schema-enums';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';
const ENUM_DES_TYPES = 'TypeEvenementJournal';

/** Le SEUL fichier qui a le droit d'écrire la table `evenements`. */
export const ECRIVAIN_UNIQUE = 'src/server/evenement/journal.ts';
/** La garde elle-même : ses témoins SONT des écrivains (RM-11). */
const CETTE_GARDE = 'scripts/gates/journal-sans-pii.ts';
/** Les racines où un second écrivain se cherche. `tests/` n'en est pas : les harnais y écrivent. */
const RACINES_ECRIVAINS = ['src/', 'scripts/', 'packages/'] as const;

/**
 * Le domaine pur du journal. Il peut NOMMER la table ; il ne peut ni nommer le délégué `evenement`, ni
 * porter la moindre trace d'un client (import, constructeur, SQL brut) : sans cela, une fonction du
 * domaine qui reçoit un client en paramètre écrirait la table sous l'exemption.
 */
const DOMAINE_DU_JOURNAL = 'src/domain/evenement/';

/**
 * LA LISTE BLANCHE COMPTÉE : des fichiers qui NOMMENT le mot sans atteindre la table, chacun avec
 * le compte EXACT de ses mentions et son motif. Une mention de plus, ou de moins, rougit : le
 * compte se relit, il ne s'élargit pas en silence.
 */
export const LISTE_BLANCHE_COMPTEE: { chemin: string; mentions: number; motif: string }[] = [
  {
    chemin: 'packages/contracts/contracts.v1.json',
    mentions: 1,
    motif: 'l’URL du schéma du contrat d’événements inter-dépôts, pas la table',
  },
  {
    chemin: 'packages/contracts/events.ts',
    mentions: 5,
    motif: 'un paramètre `evenement` du contrat inter-dépôts et l’URL de son schéma, sans client',
  },
  {
    chemin: 'scripts/gates/gov-check.ts',
    mentions: 5,
    motif: 'des fixtures de la garde des termes interdits, jugées comme texte',
  },
  {
    chemin: 'scripts/gates/gov-publication.ts',
    mentions: 1,
    motif: 'une fixture de la garde de publication (« etat x evenement »), jugée comme texte',
  },
  {
    chemin: 'scripts/gates/gov-requirements.ts',
    mentions: 2,
    motif: 'deux motifs de dette en prose, sans client',
  },
  {
    chemin: 'scripts/lot/paths-proposes.ts',
    mentions: 2,
    motif: 'deux CHEMINS de fichiers proposés à des tâches, sans client',
  },
];

/** Le délégué (minuscules exactes) ou la table (toute casse). `Evenement`, `evenementRecu` passent. */
const MENTION = /\bevenement\b|\b[Ee][Vv][Ee][Nn][Ee][Mm][Ee][Nn][Tt][Ss]\b/g;
/** Le délégué seul : dans le domaine du journal, lui seul est refusé. */
const DELEGUE = /\bevenement\b/;
/**
 * Le chemin d'un import ou d'une réexportation STATIQUE, en tête d'instruction : il charge un module,
 * il n'atteint pas la table. Ancré en début de ligne et sans `=`, accent grave ni `;` entre le mot-clé
 * et `from` : un `from "evenements"` dans une requête SQL n'est PAS un chemin d'import.
 */
const CHEMIN_D_IMPORT =
  /^[ \t]*(?:(?:import|export)\b[^'"`=;]*?\bfrom|import)[ \t]*(['"])[^'"\n]*\1/gm;
/** Un client dans le domaine du journal le ferait sortir de la liste blanche. */
const CLIENT = /@prisma\/client|\bPrismaClient\b|\$(?:executeRaw|queryRaw)/;

export type Vue = {
  /** Les valeurs de l'enum `TypeEvenementJournal`, lues dans `prisma/schema.prisma`. */
  typesDuSchema: string[];
  /** Les schémas de charge, par type. */
  charges: Record<string, z.ZodTypeAny>;
  /** Les fichiers suivis sous `src/`, `scripts/` et `packages/`, où un second écrivain se cacherait. */
  code: { chemin: string; contenu: string }[];
};

export type Famille =
  | 'champ_nominatif'
  | 'feuille_hors_liste'
  | 'charge_ouverte'
  | 'type_sans_charge'
  | 'charge_sans_type'
  | 'perimetre_vide'
  | 'ecrivain_hors_journal';

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
  {
    nom: 'ecrivain_hors_journal',
    explication:
      'une MENTION de la table ou du délégué (evenements, evenement) hors de la liste blanche : un second écrivain contournerait la charge fermée.',
  },
];

/** Le numéro de ligne (1-indexé) d'une position dans un texte. */
const ligneDe = (texte: string, position: number): number =>
  texte.slice(0, position).split('\n').length;

/** Les lignes où un fichier MENTIONNE la table ou le délégué, chemins d'import statiques retirés. */
export function mentions(contenu: string): number[] {
  const sansImports = contenu.replace(CHEMIN_D_IMPORT, (m) => m.replace(/[^\n]/g, ' '));
  return [...sansImports.matchAll(MENTION)].map((m) => ligneDe(sansImports, m.index));
}

/** Les lignes fautives d'un fichier : toute mention hors de la liste blanche. */
export function ecrituresHorsJournal(chemin: string, contenu: string): number[] {
  if (chemin === ECRIVAIN_UNIQUE || chemin === CETTE_GARDE) return [];
  if (!RACINES_ECRIVAINS.some((r) => chemin.startsWith(r))) return [];
  const lignes = mentions(contenu);
  if (chemin.startsWith(DOMAINE_DU_JOURNAL)) {
    return contenu
      .split('\n')
      .flatMap((l, i) => (CLIENT.test(l) || DELEGUE.test(l) ? [i + 1] : []));
  }
  const comptee = LISTE_BLANCHE_COMPTEE.find((e) => e.chemin === chemin);
  if (comptee && lignes.length === comptee.mentions) return [];
  return [...new Set(lignes)].sort((a, b) => a - b);
}

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
    if (!Object.hasOwn(vue.charges, t)) {
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

  for (const f of vue.code) {
    for (const ligne of ecrituresHorsJournal(f.chemin, f.contenu)) {
      fautes.push({
        famille: 'ecrivain_hors_journal',
        ou: `${f.chemin}:${ligne}`,
        message:
          `${f.chemin}:${ligne} — mention de la table ou du délégué du journal hors de la liste ` +
          `blanche (écrivain unique : ${ECRIVAIN_UNIQUE}). Passe par ajouterEvenement() : sa charge ` +
          'traverse le schéma fermé, et une donnée personnelle écrite ailleurs ne pourrait plus ' +
          "jamais être effacée. Un fichier qui NOMME le mot sans toucher la table s'inscrit à " +
          'LISTE_BLANCHE_COMPTEE, avec son compte et son motif.',
      });
    }
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
          'des formes et au lexique des champs de personne, aucun écrivain de la table hors de ' +
          `${ECRIVAIN_UNIQUE}. Ce vert ne dit rien d'une donnée personnelle hors du lexique.`,
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
    code: fichiersSuivisOuRefus('journal:sans-pii')
      .filter((chemin) => RACINES_ECRIVAINS.some((r) => chemin.startsWith(r)))
      .map((chemin) => ({ chemin, contenu: readFileSync(chemin, 'utf8') })),
  };
}

// ── la preuve (RM-11 : vues injectées) ─────────────────────────────────────────

const bac = (shape: z.ZodRawShape): Vue => ({
  typesDuSchema: ['bac'],
  charges: { bac: z.object(shape).strict() },
  code: [],
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
      code: [],
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
  { famille: 'perimetre_vide', vue: () => ({ typesDuSchema: [], charges: {}, code: [] }) },
  {
    famille: 'ecrivain_hors_journal',
    vue: () => ({
      ...bac({ agregatId: FORMES.identifiant() }),
      code: [
        {
          chemin: 'src/server/bac/ecrivain-bis.ts',
          contenu: "await tx.evenement.create({ data: { charge: { courriel: 'a@b.fr' } } });",
        },
      ],
    }),
  },
  {
    famille: 'ecrivain_hors_journal',
    vue: () => ({
      ...bac({ agregatId: FORMES.identifiant() }),
      code: [
        {
          chemin: 'src/server/bac/alias.ts',
          contenu: 'const { evenement: j } = tx;\nawait j.create({ data });',
        },
      ],
    }),
  },
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
  {
    quoi: 'l’écrivain unique écrit la table, un appelant l’importe, le domaine nomme la table',
    vue: () => ({
      ...bac({ agregatId: FORMES.identifiant() }),
      code: [
        { chemin: ECRIVAIN_UNIQUE, contenu: 'await tx.evenement.create({ data });' },
        {
          chemin: 'src/server/apporteur/creer.ts',
          contenu: "import { ajouterEvenement } from '../evenement/journal';",
        },
        { chemin: 'src/domain/evenement/x.ts', contenu: '// la table evenements est append-only' },
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
