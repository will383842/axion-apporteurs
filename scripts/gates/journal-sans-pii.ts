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
 *   — UN SEUL ÉCRIVAIN de la table `evenements` : `src/server/evenement/journal.ts`.
 *     LA PROMESSE, mot pour mot : `journal:sans-pii` est un FIL TENDU : il refuse toute mention de
 *     la table ou de son délégué ÉCRITE EN CLAIR, en toute casse, hors de la liste blanche tenue
 *     par le contenu, dans tout fichier de code sous `src/`, `scripts/` et `packages/`.
 *     Mention : la famille du mot `evenement` / `evenements`, en toute casse (Prisma résout aussi
 *     `client.Evenement` comme délégué), comme identifiant, propriété, chaîne, gabarit ou clé ;
 *     `EvenementDelegate` et `ModelName` dans TOUT fichier ; seul le CHEMIN d'un import statique,
 *     lu par le compilateur TypeScript, n'est pas une mention. Les séquences `\uXXXX`, `\u{…}`,
 *     `\xXX` qui désignent une lettre sont décodées avant la lecture (commodité, pas une
 *     promesse).
 *     LA LISTE BLANCHE est tenue par le CONTENU : l'écrivain ; cette garde ; le domaine pur
 *     `src/domain/evenement/`, qui ne nomme ni la table ni le délégué, ne porte aucune trace de
 *     client et n'écrit aucune requête (mot de DML dans une chaîne) ; et les fichiers de
 *     `LISTE_BLANCHE_PAR_CONTENU`, tenus par le texte exact de leurs lignes de mention et sans
 *     trace de client. Échec FERMÉ : une simple lecture du journal hors de l'écrivain rougit
 *     aussi.
 *     LIMITE DÉCLARÉE, mot pour mot : toute forme délibérément obfusquée — nom calculé,
 *     transformé, extrait, ou encodé (séquences d'échappement JS, identifiants Unicode SQL
 *     `U&"…"`), vues ou alias SQL, conversions de type — relève de la revue et de la défense au
 *     niveau base, pas de cette garde. Hors de portée aussi : un client pris hors du dépôt,
 *     `prisma/` (graine et DML des migrations), et les deux fichiers qui SONT l'écrivain et la
 *     garde. TypedSQL n'est pas activé : l'activer exige de revoir cette garde.
 * Le vert imprime le compte des types et des champs RÉELLEMENT confrontés.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne lit pas le dépôt : ses vues sont INJECTÉES.
 */
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
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
 * Le domaine pur du journal. Il ne nomme NI la table NI le délégué, ne porte aucune trace d'un client
 * (import, constructeur, SQL brut) et n'écrit aucune requête (mot de DML dans une chaîne) : sans cela,
 * une requête née ici et importée par un consommateur — dont le chemin d'import est effacé avant le
 * compte — écrirait la table sous l'exemption (troisième veto securite de la PR 75).
 */
const DOMAINE_DU_JOURNAL = 'src/domain/evenement/';

/**
 * LA LISTE BLANCHE PAR CONTENU : des fichiers qui NOMMENT le mot sans atteindre la table. Chacun est
 * tenu par le TEXTE EXACT (espaces de tête et de queue retirés) de chaque ligne de mention admise —
 * jamais par un compte, qu'une mention échangée contre une écriture laissait inchangé (revue schema
 * de la PR 75), jamais par un numéro de ligne, qu'une édition sans rapport déplacerait. Une ligne de
 * mention neuve ou modifiée rougit en nommant le fichier et la ligne ; une trace de client aussi.
 */
export const LISTE_BLANCHE_PAR_CONTENU: { chemin: string; motif: string; lignes: string[] }[] = [
  {
    chemin: 'packages/contracts/contracts.v1.json',
    motif: 'l’URL du schéma du contrat d’événements inter-dépôts, pas la table',
    lignes: ['"$id": "https://axion-ia.com/contrats/partners/evenements/v1",'],
  },
  {
    chemin: 'packages/contracts/events.ts',
    motif: 'un paramètre `evenement` du contrat inter-dépôts et l’URL de son schéma, sans client',
    lignes: [
      'export function champsInterdits(evenement: Record<string, unknown>): ChampInterdit[] {',
      "const type = evenement['event_type'] as TypeEvenement | undefined;",
      'noeuds.push({ chemin: racine, cle: racine, valeur: evenement[racine] });',
      'feuilles(evenement[racine], racine, noeuds, racine);',
      '$id: `https://axion-ia.com/contrats/partners/evenements/v${SCHEMA_VERSION}`,',
    ],
  },
  {
    chemin: 'scripts/gates/gov-check.ts',
    motif: 'des fixtures de la garde des termes interdits, jugées comme texte',
    lignes: [
      '"UPDATE evenements SET type = \'payment.received\';",',
      '`${AG}payment.received${AG} ${FERME_BLOC_SQL} UPDATE evenements SET type = ${AG}payment.received${AG};`',
      "'-- le producteur emet payment.received\\nALTER TABLE evenements ADD COLUMN type text;'",
      "'docs/adr/0008-contrat-evenements.md',",
      "'ALTER TABLE evenements ADD COLUMN type text;'",
    ],
  },
  {
    chemin: 'scripts/gates/gov-publication.ts',
    motif: 'une fixture de la garde de publication (« etat x evenement »), jugée comme texte',
    lignes: [
      '`"verifie": "100 % des cellules (etat x evenement) testees pour Attribution et LigneCommission"`,',
    ],
  },
  {
    chemin: 'scripts/gates/gov-requirements.ts',
    motif: 'deux motifs de dette en prose, sans client',
    lignes: [
      "motif: 'securite : la forme de la signature DocuSeal et son evenement',",
      "motif: 'argent : la permutation des evenements et la conservation d un schemaVersion inconnu',",
    ],
  },
  {
    chemin: 'scripts/lot/paths-proposes.ts',
    motif: 'deux CHEMINS de fichiers proposés à des tâches, sans client',
    lignes: [
      "'DM-01': ['prisma/schema.prisma', 'prisma/migrations/', 'src/domain/evenement/journal.ts'],",
      "'src/server/queue/workers/evenement-recu.ts',",
    ],
  },
];

/**
 * LA FAMILLE DU MOT, toute casse : `evenement`, `Evenement`, `EVENEMENTS`… Prisma 5.22 résout aussi
 * `client.Evenement` (majuscule) comme délégué — la propriété est capitalisée avant la recherche du
 * modèle (revue schema, quatrième tour de la PR 75). Les noms COMPOSÉS (`EvenementCreateInput`,
 * `evenementRecu`, `TypeEvenementJournal`) sont d'autres mots et ne sont pas lus. C'est le DERNIER
 * élargissement lexical : une garde de mots est un fil tendu contre le code ordinaire, la défense
 * durable est en base (partners/ADR-0015, « Reste à faire »).
 */
const MENTION = /\bevenements?\b/gi;
/**
 * Un mot de DML (`INSERT`, `UPDATE`, `DELETE`, `INTO`, `TRUNCATE`, `MERGE`, toute casse) DANS une chaîne,
 * un gabarit ou entre guillemets doubles : le domaine du journal n'a aucune raison d'écrire une
 * requête. `hash.update(…)`, qui n'est pas dans une chaîne, n'en est pas un.
 */
const CHAINE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const DML = /\b(?:insert|update|delete|into|truncate|merge)\b/i;
/** Les fichiers dont la syntaxe se lit par le compilateur TypeScript (JS et TS, toutes variantes). */
const EXTENSION_ANALYSEE = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Les plages du CHEMIN de chaque import ou réexportation statique (`import … from '…'`,
 * `export … from '…'`, `import type`), lues par le COMPILATEUR TypeScript et non par une expression :
 * seul le nœud `moduleSpecifier` d'une `ImportDeclaration` ou d'une `ExportDeclaration` de premier
 * niveau est effacé. Rien d'intérieur à une chaîne, un gabarit ou un commentaire ne peut l'être — une
 * ligne « import from "evenements" » DANS un gabarit SQL reste lue (revue exactitude, quatrième tour).
 */
function cheminsDImport(chemin: string, contenu: string): [number, number][] {
  if (!EXTENSION_ANALYSEE.test(chemin)) return [];
  const source = ts.createSourceFile(chemin, contenu, ts.ScriptTarget.Latest, false);
  const plages: [number, number][] = [];
  for (const instruction of source.statements) {
    if (
      (ts.isImportDeclaration(instruction) || ts.isExportDeclaration(instruction)) &&
      instruction.moduleSpecifier !== undefined
    ) {
      plages.push([
        instruction.moduleSpecifier.getStart(source),
        instruction.moduleSpecifier.getEnd(),
      ]);
    }
  }
  return plages;
}
/**
 * Une trace de client : elle fait sortir de la liste blanche le domaine du journal ET les fichiers
 * admis par contenu. Le délégué pris comme propriété (`.evenement`, `?.evenement`) en est une.
 */
const CLIENT =
  /@prisma\/client|\bPrismaClient\b|\$transaction\b|\$(?:executeRaw|queryRaw)\w*|\.\s*evenement\b|\bEvenementDelegate\b|\bModelName\b/i;
/**
 * Le délégué du journal atteint par son TYPE (`Prisma.EvenementDelegate`) ou par le nom de modèle
 * (`Prisma.ModelName`) : refusé dans TOUT fichier de la portée, hors de l'écrivain, de la garde et du
 * module client unique que SEC-08 posera (`MODULE_CLIENT`).
 */
const TYPE_DU_DELEGUE = /\bEvenementDelegate\b|\bModelName\b/;
/** Le module client unique du dépôt, à venir (SEC-08) : il construit le client, il ne vise pas le journal. */
const MODULE_CLIENT = 'src/server/db.ts';

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
export function mentions(contenu: string, chemin = 'fichier.ts'): number[] {
  // Seul le CHEMIN est effacé, octet pour octet (les sauts de ligne gardent leur place) : les noms
  // importés (`import type { Evenement }`, `import { evenement }`) restent lus.
  let sansImports = contenu;
  for (const [debut, fin] of cheminsDImport(chemin, contenu)) {
    sansImports =
      sansImports.slice(0, debut) +
      sansImports.slice(debut, fin).replace(/[^\n]/g, ' ') +
      sansImports.slice(fin);
  }
  return [...sansImports.matchAll(MENTION)].map((m) => ligneDe(sansImports, m.index));
}

/**
 * Les séquences d'échappement `\uXXXX`, `\u{…}` et `\xXX` qui désignent une lettre, un chiffre, `_`
 * ou `$` sont DÉCODÉES avant la lecture : `tx['\u0065venement']` atteint le délégué sans écrire le
 * mot (revue securite, quatrième tour). Une séquence qui désigne autre chose reste telle quelle, pour
 * que les numéros de ligne ne bougent pas.
 */
export function decoderEchappements(texte: string): string {
  return texte.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))/g,
    (seq, a, b, c) => {
      const code = parseInt((a ?? b ?? c) as string, 16);
      const car = code <= 0x10ffff ? String.fromCodePoint(code) : '';
      return /^[\w$]$/.test(car) ? car : seq;
    }
  );
}

/** Les lignes fautives d'un fichier : toute mention hors de la liste blanche. */
export function ecrituresHorsJournal(chemin: string, brut: string): number[] {
  if (chemin === ECRIVAIN_UNIQUE || chemin === CETTE_GARDE) return [];
  const contenu = decoderEchappements(brut);
  if (!RACINES_ECRIVAINS.some((r) => chemin.startsWith(r))) return [];
  const lignes = mentions(contenu, chemin);
  if (chemin !== MODULE_CLIENT) {
    contenu.split('\n').forEach((l, i) => {
      if (TYPE_DU_DELEGUE.test(l)) lignes.push(i + 1);
    });
  }
  if (chemin.startsWith(DOMAINE_DU_JOURNAL)) {
    // Le domaine pur ne nomme NI le délégué NI la table, ne porte aucune trace d'un client et
    // n'écrit aucune requête : une requête née ici, importée ailleurs, passerait sous le chemin
    // d'import effacé du consommateur (troisième veto securite de la PR 75).
    const fautes = new Set(lignes);
    contenu.split('\n').forEach((l, i) => {
      if (CLIENT.test(l)) fautes.add(i + 1);
    });
    for (const m of contenu.matchAll(CHAINE)) {
      if (DML.test(m[2]!)) fautes.add(ligneDe(contenu, m.index));
    }
    return [...fautes].sort((a, b) => a - b);
  }
  const admis = LISTE_BLANCHE_PAR_CONTENU.find((e) => e.chemin === chemin);
  if (!admis) return [...new Set(lignes)].sort((a, b) => a - b);
  // Chaque texte admis vaut pour UNE ligne : deux lignes au même texte n'en consomment pas une seule.
  const restants = [...admis.lignes];
  const texte = contenu.split('\n');
  const fautes = new Set<number>();
  for (const n of [...new Set(lignes)].sort((a, b) => a - b)) {
    const i = restants.indexOf(texte[n - 1]!.trim());
    if (i === -1) fautes.add(n);
    else restants.splice(i, 1);
  }
  texte.forEach((l, i) => {
    if (CLIENT.test(l)) fautes.add(i + 1);
  });
  return [...fautes].sort((a, b) => a - b);
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
          'LISTE_BLANCHE_PAR_CONTENU, avec le texte de la ligne et son motif.',
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
        {
          chemin: 'src/domain/evenement/x.ts',
          contenu: "export const h = hash.update(x, 'utf8');",
        },
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
