/**
 * schema-enums.ts — la garde du vocabulaire (GOV-006 ; REQ-GOV-016, REQ-JUR-027 → REQ-DM-038,
 * REQ-DM-003). Registre : `partners:schema:enums`.
 *
 * USAGE : pnpm partners:schema:enums           (échoue si le vocabulaire dérive de sa source)
 *         pnpm partners:schema:enums --prove   (un témoin par famille, chacun vu rougir ;
 *                                               contre-témoins verts)
 *
 * LE PROBLÈME QU'ELLE TIENT. `docs/GLOSSAIRE.md` fixait le vocabulaire depuis GOV-006 et personne
 * n'allait le lire. `docs/PRESEANCE.md` §2 lui donne pourtant la primauté sur un terme et ses
 * synonymes interdits. Le résultat était mesurable : un paragraphe du glossaire a annoncé pendant
 * des semaines onze types d'événements et une enveloppe en camelCase, quand `packages/contracts`
 * en produit sept en snake_case — et il se réclamait de « synonymes vus rougir par une garde » qui
 * n'existait pas. Un document qui se dit contrôlé sans l'être est pire qu'un document muet.
 *
 * CE QU'ELLE VÉRIFIE, ET DANS QUEL SENS DE LECTURE.
 *
 *   — REQ-DM-003 est la SOURCE des sept états occupants. La constante `ETATS_OCCUPANTS`
 *     (`src/domain/attribution/etats.ts`) et la colonne « Occupant ? » du glossaire lui sont
 *     comparées, jamais l'inverse. Deux copies existent parce que l'une doit être exécutable et
 *     l'autre lisible ; c'est cette garde qui les tient égales (RM-01, RM-06).
 *   — Aucune LISTE LITTÉRALE d'états occupants ailleurs dans le code : trois de ces sept noms sur
 *     une même ligne suffisent à faire rougir. L'index partiel proposé par les documents d'origine
 *     ne couvrait que deux états sur sept, et rien ne l'a dit pendant des semaines.
 *   — Toute colonne de VOCABULAIRE est un enum (REQ-DM-038 : « toute colonne dont le nom contient
 *     statut, type, motif, resultat, etat, origine, kind ou palier »). Une `String` y rougit.
 *   — Toute VALEUR d'enum figure au glossaire, et tout enum que le glossaire ÉNUMÈRE a exactement
 *     ces valeurs-là — dans les deux sens, sans quoi une valeur retirée du schéma passerait.
 *   — Aucun REPLI qui retombe sur la valeur brute (`LIBELLES[x] ?? x`) : il rend à l'écran un
 *     identifiant technique au lieu de rougir, et déguise précisément la faute qu'on cherche.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne lance pas `prisma validate` — le dépôt ne porte pas encore la
 * dépendance — et ne juge donc ni les relations ni les index : l'index partiel de REQ-DM-003 est
 * vérifié en base par DM-07 (`pg_indexes`). Elle lit le schéma comme un texte, ce qui suffit à ce
 * qu'elle juge. Elle ne complète jamais le glossaire toute seule : `docs/CONVENTIONS.md` §8 en
 * réserve l'écriture au `gardien-spec`.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne touche pas au dépôt : la vue est INJECTÉE. Une
 * preuve qui lirait les fichiers réels verdirait ou rougirait au gré de ce que le dépôt contient
 * le jour où elle tourne, et ne dirait plus rien de la garde. Le fixture porte donc sa propre liste
 * d'états — c'est la seule raison pour laquelle ce fichier est exempté de la famille
 * `liste_litterale_d_etats`, comme `gov-identifiants.ts` l'est de la sienne.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';
const CHEMIN_GLOSSAIRE = 'docs/GLOSSAIRE.md';
const CHEMIN_EXIGENCES = 'docs/requirements.json';
const CHEMIN_ETATS = 'src/domain/attribution/etats.ts';

/** Les racines où une liste d'états ou un repli muet ne doivent pas apparaître. */
const RACINES_CODE = ['src', 'prisma', 'scripts'];
const EXTENSIONS_CODE = /\.(ts|tsx|prisma|sql)$/;

/**
 * Les deux fichiers qui ont le DROIT de porter la liste : sa source unique, et la garde qui
 * l'exerce. Exempter l'un sans l'autre reviendrait soit à interdire la solution, soit à ne
 * jamais pouvoir écrire le témoin qui prouve que la garde sait rougir.
 */
const PORTEURS_LEGITIMES = [CHEMIN_ETATS, 'scripts/gates/schema-enums.ts'];

/** Les noms de colonne qui portent un vocabulaire (REQ-DM-038, REQ-GOV-016). */
const NOMS_DE_VOCABULAIRE =
  /(statut|status|etat|type|motif|resultat|origine|kind|palier|priorite)/i;

/** Les types scalaires qui ne peuvent pas porter un vocabulaire fermé. */
const TYPES_LIBRES = new Set(['String', 'Json']);

export type FichierCode = { chemin: string; contenu: string };

export type Vue = {
  /** Le texte de REQ-DM-003 — la source des sept états occupants. */
  reqDm003: string;
  /** `docs/GLOSSAIRE.md`. */
  glossaire: string;
  /** `prisma/schema.prisma`. */
  schema: string;
  /** Le contenu de `src/domain/attribution/etats.ts`. */
  etatsSource: string;
  /** Les fichiers de code où une liste littérale ou un repli muet se cachent. */
  code: FichierCode[];
};

export type Faute = { famille: string; message: string };

/** Les familles de contrôle. `--prove` en exige un témoin chacune, et refuse d'en laisser une sans. */
export const FAMILLES: { nom: string; explication: string }[] = [
  {
    nom: 'source_illisible',
    explication:
      "le texte de REQ-DM-003 ne donne plus la liste des états occupants : la garde ne sait plus à quoi comparer.",
  },
  {
    nom: 'etats_occupants_divergents',
    explication: "la constante ETATS_OCCUPANTS ne dit plus ce que REQ-DM-003 dit.",
  },
  {
    nom: 'glossaire_divergent',
    explication: "la colonne « Occupant ? » du glossaire ne rend pas les états de REQ-DM-003.",
  },
  {
    nom: 'liste_litterale_d_etats',
    explication: "une liste d'états occupants recopiée hors de sa source unique (RM-06).",
  },
  {
    nom: 'colonne_vocabulaire_en_chaine',
    explication: "une colonne de vocabulaire déclarée en String : le type n'attrape plus rien (RM-04).",
  },
  {
    nom: 'valeur_hors_glossaire',
    explication: "une valeur d'enum que docs/GLOSSAIRE.md ne connaît pas (REQ-GOV-016).",
  },
  {
    nom: 'enum_divergent_du_glossaire',
    explication: "un enum que le glossaire énumère n'a pas exactement ces valeurs-là.",
  },
  {
    nom: 'repli_muet',
    explication: "un repli qui retombe sur la valeur brute déguise la faute au lieu de la montrer.",
  },
];
const NOMS_FAMILLES = FAMILLES.map((f) => f.nom);

// ── lectures pures ───────────────────────────────────────────────────────────

/**
 * Les états occupants, LUS dans le texte de REQ-DM-003. Un tableau vide n'est pas « rien à
 * dire » : c'est une source illisible, et la famille `source_illisible` le dit.
 */
export function etatsOccupantsDeLaReq(texte: string): string[] {
  const m = /ETATS_OCCUPANTS\s*=\s*\{([^}]*)\}/.exec(texte);
  if (!m) return [];
  return m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));
}

/** Les cellules d'une ligne de tableau markdown, sans les deux barres extrêmes. */
function cellules(ligne: string): string[] {
  const t = ligne.trim();
  if (!t.startsWith('|')) return [];
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

/** Le tableau §1 du glossaire : les états d'attribution et leur qualité d'occupant. */
export function etatsDuGlossaire(glossaire: string): { valeur: string; occupant: boolean }[] {
  const debut = glossaire.indexOf('## 1.');
  if (debut === -1) return [];
  const fin = glossaire.indexOf('## 2.', debut);
  const section = glossaire.slice(debut, fin === -1 ? undefined : fin);
  const sortie: { valeur: string; occupant: boolean }[] = [];
  for (const ligne of section.split('\n')) {
    const c = cellules(ligne);
    if (c.length < 2) continue;
    const m = /^`([a-z][a-z0-9_]*)`$/.exec(c[0]!);
    if (!m) continue;
    sortie.push({ valeur: m[1]!, occupant: /\boui\b/i.test(c[c.length - 1]!) });
  }
  return sortie;
}

/**
 * Les enums que le glossaire ÉNUMÈRE : le tableau §1 pour `EtatAttribution`, et toute ligne de
 * tableau dont la première cellule est un nom d'enum entre accents graves.
 *
 * La cellule des valeurs est coupée au premier commentaire (« — », « ; », « ( ») : plusieurs
 * lignes du glossaire commentent leur propre liste, et les accents graves de la glose ne sont pas
 * des valeurs. Sans cette coupe, `EtatVerificationDto` rendrait six valeurs pour quatre.
 */
export function enumsDuGlossaire(glossaire: string): Map<string, string[]> {
  const sortie = new Map<string, string[]>();
  const etats = etatsDuGlossaire(glossaire).map((e) => e.valeur);
  if (etats.length > 0) sortie.set('EtatAttribution', etats);

  for (const ligne of glossaire.split('\n')) {
    const c = cellules(ligne);
    if (c.length < 2) continue;
    const nom = /^`([A-Z][A-Za-z0-9]*)`$/.exec(c[0]!);
    if (!nom) continue;
    const brut = c[1]!.split(/ — | ; | \(/)[0]!;
    const valeurs = [...brut.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]!);
    if (valeurs.length > 0 && !sortie.has(nom[1]!)) sortie.set(nom[1]!, valeurs);
  }
  return sortie;
}

/** Les enums déclarés par le schéma Prisma, lus comme du texte. */
export function enumsDuSchema(schema: string): Map<string, string[]> {
  const sortie = new Map<string, string[]>();
  for (const m of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    const valeurs = m[2]!
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => /^[a-z][a-z0-9_]*$/.test(l));
    sortie.set(m[1]!, valeurs);
  }
  return sortie;
}

/** Les champs des modèles Prisma : nom et type déclaré. */
export function champsDuSchema(schema: string): { modele: string; champ: string; type: string }[] {
  const sortie: { modele: string; champ: string; type: string }[] = [];
  for (const m of schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
    for (const ligne of m[2]!.split('\n')) {
      const propre = ligne.replace(/\/\/.*$/, '').trim();
      const champ = /^(\w+)\s+(\w+)/.exec(propre);
      if (!champ) continue;
      sortie.push({ modele: m[1]!, champ: champ[1]!, type: champ[2]! });
    }
  }
  return sortie;
}

/** La constante `ETATS_OCCUPANTS`, lue dans son fichier source. */
export function constanteEtatsOccupants(source: string): string[] {
  const m = /ETATS_OCCUPANTS\s*(?::[^=]*)?=\s*(?:Object\.freeze\()?\[([^\]]*)\]/.exec(source);
  if (!m) return [];
  return [...m[1]!.matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g)].map((x) => x[1]!);
}

/** Le texte d'une exigence, lu au registre. */
export function texteDeLaReq(id: string): string {
  const registre = JSON.parse(readFileSync(CHEMIN_EXIGENCES, 'utf8')) as {
    exigences: { id: string; texte: string }[];
  };
  return registre.exigences.find((e) => e.id === id)?.texte ?? '';
}

// ── le contrôle ──────────────────────────────────────────────────────────────

const memeEnsemble = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const attendus = etatsOccupantsDeLaReq(vue.reqDm003);

  // Ne pas avoir pu lire la source n'est JAMAIS un vert : sans elle, toutes les égalités
  // ci-dessous compareraient un tableau vide à un tableau vide.
  if (attendus.length === 0) {
    return [
      {
        famille: 'source_illisible',
        message:
          "REQ-DM-003 ne porte plus « ETATS_OCCUPANTS = {…} » : la garde ne sait plus à quoi " +
          'comparer la constante ni le glossaire. Rétablis la liste dans le registre des ' +
          "exigences — ce n'est pas ici qu'elle se décide.",
      },
    ];
  }

  const constante = constanteEtatsOccupants(vue.etatsSource);
  if (!memeEnsemble(constante, attendus)) {
    fautes.push({
      famille: 'etats_occupants_divergents',
      message:
        `${CHEMIN_ETATS} — ETATS_OCCUPANTS vaut {${constante.join(', ')}} quand REQ-DM-003 dit ` +
        `{${attendus.join(', ')}}. La constante est une COPIE tenue : c'est l'exigence qui décide.`,
    });
  }

  const occupantsDuGlossaire = etatsDuGlossaire(vue.glossaire)
    .filter((e) => e.occupant)
    .map((e) => e.valeur);
  if (!memeEnsemble(occupantsDuGlossaire, attendus)) {
    fautes.push({
      famille: 'glossaire_divergent',
      message:
        `${CHEMIN_GLOSSAIRE} §1 — la colonne « Occupant ? » rend {${occupantsDuGlossaire.join(', ')}} ` +
        `quand REQ-DM-003 dit {${attendus.join(', ')}}. Le glossaire se corrige par le gardien-spec.`,
    });
  }

  // RM-06 : trois de ces sept noms sur une même ligne, hors de leur source, sont une liste.
  const quotes = new RegExp(`['"\`](${attendus.join('|')})['"\`]`, 'g');
  for (const f of vue.code) {
    if (PORTEURS_LEGITIMES.includes(f.chemin)) continue;
    f.contenu.split('\n').forEach((ligne, i) => {
      const trouves = new Set([...ligne.matchAll(quotes)].map((m) => m[1]!));
      if (trouves.size >= 3) {
        fautes.push({
          famille: 'liste_litterale_d_etats',
          message:
            `${f.chemin}:${i + 1} — liste littérale d'états occupants (${[...trouves].join(', ')}). ` +
            `Importe ETATS_OCCUPANTS depuis ${CHEMIN_ETATS} : une liste recopiée ne suit jamais ` +
            "l'exigence, et l'index qui n'en couvrait que deux sur sept n'a rien fait rougir.",
        });
      }
      const repli = /(\w+)\s*\[\s*([A-Za-z0-9_.]+)\s*\]\s*\?\?\s*\2\b/.exec(ligne);
      if (repli) {
        fautes.push({
          famille: 'repli_muet',
          message:
            `${f.chemin}:${i + 1} — repli « ${repli[0]} » : quand la valeur manque à la table, ` +
            "l'identifiant technique s'affiche et la faute passe inaperçue. Rends la fonction " +
            'exhaustive (switch … never) et laisse le type refuser la valeur inconnue.',
        });
      }
    });
  }

  for (const { modele, champ, type } of champsDuSchema(vue.schema)) {
    if (NOMS_DE_VOCABULAIRE.test(champ) && TYPES_LIBRES.has(type)) {
      fautes.push({
        famille: 'colonne_vocabulaire_en_chaine',
        message:
          `${CHEMIN_SCHEMA} — ${modele}.${champ} est un ${type} alors que son nom porte un ` +
          `vocabulaire (REQ-DM-038). Déclare un enum Prisma et inscris ses valeurs au glossaire : ` +
          "une chaîne libre laisse un seed écrire n'importe quoi, et rien ne le voit.",
      });
    }
  }

  const auGlossaire = enumsDuGlossaire(vue.glossaire);
  for (const [nom, valeurs] of enumsDuSchema(vue.schema)) {
    for (const v of valeurs) {
      if (!vue.glossaire.includes('`' + v + '`')) {
        fautes.push({
          famille: 'valeur_hors_glossaire',
          message:
            `${CHEMIN_SCHEMA} — ${nom}.${v} ne figure pas dans ${CHEMIN_GLOSSAIRE} (REQ-GOV-016). ` +
            'Une valeur qui ne se lit nulle part se traduit à la main dans chaque écran, et deux ' +
            'écrans la traduisent différemment.',
        });
      }
    }
    const enumere = auGlossaire.get(nom);
    if (enumere && !memeEnsemble(enumere, valeurs)) {
      fautes.push({
        famille: 'enum_divergent_du_glossaire',
        message:
          `${CHEMIN_SCHEMA} — ${nom} vaut {${valeurs.join(', ')}} quand ${CHEMIN_GLOSSAIRE} ` +
          `énumère {${enumere.join(', ')}}. Le glossaire a la primauté sur les termes ` +
          "(docs/PRESEANCE.md §2) : c'est le schéma qui le suit, jamais l'inverse.",
      });
    }
  }

  return fautes;
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

function lister(racine: string): string[] {
  if (!existsSync(racine)) return [];
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree).replace(/\\/g, '/');
    if (statSync(chemin).isDirectory()) sortie.push(...lister(chemin));
    else if (EXTENSIONS_CODE.test(chemin)) sortie.push(chemin);
  }
  return sortie;
}

const lireOuVide = (chemin: string): string =>
  existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';

export function vueDuDepot(): Vue {
  return {
    reqDm003: texteDeLaReq('REQ-DM-003'),
    glossaire: lireOuVide(CHEMIN_GLOSSAIRE),
    schema: lireOuVide(CHEMIN_SCHEMA),
    etatsSource: lireOuVide(CHEMIN_ETATS),
    code: RACINES_CODE.flatMap(lister).map((chemin) => ({
      chemin,
      contenu: readFileSync(chemin, 'utf8'),
    })),
  };
}

// ── la fixture de la preuve (RM-11 : elle ne lit rien du dépôt) ───────────────

const GLOSSAIRE_FIXTURE = [
  '## 1. Attribution',
  '',
  '| Valeur | Sens | Occupant ? |',
  '| --- | --- | --- |',
  '| `provisoire` | déposée | **oui** |',
  '| `active` | qualifiée | **oui** |',
  '| `rdv_pris` | rendez-vous fixé | **oui** |',
  '| `proposition` | devis envoyé | **oui** |',
  '| `signee` | devis signé | **oui** |',
  '| `convertie` | premier encaissement | **oui** |',
  '| `figee_resiliation` | gelée | **oui** |',
  '| `annulee` | retirée | non |',
  '',
  '## 2. Autres enums',
  '',
  '| Enum | Valeurs | REQ |',
  '| --- | --- | --- |',
  '| `ConsoleRole` | `admin`, `qualifieur` | REQ-SEC-023 |',
  '',
].join('\n');

const SCHEMA_FIXTURE = [
  'enum EtatAttribution {',
  '  provisoire',
  '  active',
  '  rdv_pris',
  '  proposition',
  '  signee',
  '  convertie',
  '  figee_resiliation',
  '  annulee',
  '}',
  '',
  'enum ConsoleRole {',
  '  admin',
  '  qualifieur',
  '}',
  '',
].join('\n');

/**
 * La liste ci-dessous est le SEUL littéral d'états occupants du dépôt hors de sa source, et c'est
 * pourquoi ce fichier figure dans `PORTEURS_LEGITIMES` : sans elle, la preuve devrait lire le
 * dépôt, et une preuve qui lit le dépôt ne prouve plus rien de la garde (RM-11).
 */
const ETATS_FIXTURE = "['provisoire', 'active', 'rdv_pris', 'proposition', 'signee', 'convertie', 'figee_resiliation']";

export const VUE_CONFORME: Vue = {
  reqDm003:
    'Au plus une attribution occupante par SIREN : index unique partiel où ETATS_OCCUPANTS = ' +
    '{provisoire, active, rdv_pris, proposition, signee, convertie, figee_resiliation}, la liste ' +
    'étant une constante unique partagée par le code et la migration.',
  glossaire: GLOSSAIRE_FIXTURE,
  schema: SCHEMA_FIXTURE,
  etatsSource: `export const ETATS_OCCUPANTS = ${ETATS_FIXTURE} as const;\n`,
  code: [],
};

/** Un témoin par famille : la vue truquée, et la famille qu'elle DOIT faire rougir. */
const TEMOINS: { famille: string; vue: () => Vue }[] = [
  {
    famille: 'source_illisible',
    vue: () => ({ ...VUE_CONFORME, reqDm003: 'Au plus une attribution occupante par SIREN.' }),
  },
  {
    famille: 'etats_occupants_divergents',
    vue: () => ({
      ...VUE_CONFORME,
      etatsSource: VUE_CONFORME.etatsSource.replace("'convertie',", "'convertie', 'perdue',"),
    }),
  },
  {
    famille: 'glossaire_divergent',
    vue: () => ({
      ...VUE_CONFORME,
      glossaire: VUE_CONFORME.glossaire.replace('| `annulee` | retirée | non |', '| `annulee` | retirée | **oui** |'),
    }),
  },
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'src/server/attribution/requete.ts',
          contenu: "const vivantes = ['provisoire', 'active', 'signee'];",
        },
      ],
    }),
  },
  {
    famille: 'colonne_vocabulaire_en_chaine',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nmodel Attribution {\n  id     String @id\n  statut String\n}\n',
    }),
  },
  {
    famille: 'valeur_hors_glossaire',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nenum Divers {\n  valeur_inventee\n}\n',
    }),
  },
  {
    famille: 'enum_divergent_du_glossaire',
    vue: () => ({ ...VUE_CONFORME, schema: VUE_CONFORME.schema.replace('  convertie\n', '') }),
  },
  {
    famille: 'repli_muet',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/ui/libelles.ts', contenu: 'const l = LIBELLES[statut] ?? statut;' }],
    }),
  },
];

/**
 * Les contre-témoins comptent autant que les témoins : une garde trop large finit par interdire
 * la solution qu'elle exige, et c'est alors la solution qu'on retire.
 */
const CONTRE_TEMOINS: { quoi: string; vue: () => Vue }[] = [
  { quoi: 'la vue conforme', vue: () => VUE_CONFORME },
  {
    quoi: 'la source unique porte la liste — sinon la garde interdirait sa propre solution',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: CHEMIN_ETATS, contenu: "['provisoire', 'active', 'signee']" }],
    }),
  },
  {
    quoi: 'deux états seulement sur une ligne : une requête peut nommer un couple sans le recopier',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/server/x.ts', contenu: "if (s === 'provisoire' || s === 'active') return;" }],
    }),
  },
  {
    quoi: 'un repli vers une valeur EXPLICITE, qui ne déguise rien',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/ui/x.ts', contenu: "const l = LIBELLES[statut] ?? 'état inconnu';" }],
    }),
  },
  {
    quoi: 'une colonne de vocabulaire déclarée en enum',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nmodel Attribution {\n  id     String @id\n  statut EtatAttribution\n}\n',
    }),
  },
  {
    quoi: 'une colonne libre qui ne porte aucun vocabulaire',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nmodel Attribution {\n  id    String @id\n  siren String\n}\n',
    }),
  },
];

// ── exécution ────────────────────────────────────────────────────────────────

/**
 * Le fichier est IMPORTÉ par `tests/unit/gouvernance/glossaire-enums.spec.ts` autant qu'il est
 * lancé en ligne de commande. Sans cette garde, l'import exécuterait le contrôle et son
 * `process.exit(0)` : « process.exit unexpectedly called with "0" », et pas un seul test collecté.
 * Même parade que `gov-depot.ts`.
 */
const APPELE_DIRECTEMENT = /schema-enums\.ts$/.test(process.argv[1] ?? '');

if (APPELE_DIRECTEMENT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = NOMS_FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
    if (sansTemoin.length > 0) {
      console.error(`❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}. Une famille sans témoin n'est pas prouvée.`);
      process.exit(1);
    }
    for (const t of TEMOINS) {
      const rougies = controler(t.vue()).map((f) => f.famille);
      if (!rougies.includes(t.famille)) {
        console.error(`❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille (rougies : ${rougies.join(', ') || 'aucune'}).`);
        process.exit(1);
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const fautes = controler(c.vue());
      if (fautes.length > 0) {
        console.error(`❌ Faux positif sur « ${c.quoi} » : ${fautes[0]!.famille}. La garde est trop large.\n   ${fautes[0]!.message}`);
        process.exit(1);
      }
    }
    console.log(`✅ partners:schema:enums — Les ${FAMILLES.length} familles rougissent, ${CONTRE_TEMOINS.length} contre-témoins restent verts :`);
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  if (!existsSync(CHEMIN_SCHEMA)) {
    console.error(`❌ partners:schema:enums — ${CHEMIN_SCHEMA} est introuvable : la garde n'a rien lu, et ne prétend pas juger.`);
    process.exit(2);
  }

  const fautes = controler(vueDuDepot());
  if (fautes.length === 0) {
    const enums = enumsDuSchema(lireOuVide(CHEMIN_SCHEMA));
    const valeurs = [...enums.values()].reduce((n, v) => n + v.length, 0);
    console.log(
      `✅ partners:schema:enums — ${enums.size} enum(s), ${valeurs} valeur(s) confrontées au glossaire ; ` +
        `ETATS_OCCUPANTS égale REQ-DM-003 ; aucune liste littérale d'états dans ${RACINES_CODE.join(', ')}.`
    );
    process.exit(0);
  }
  console.error(`❌ partners:schema:enums — ${fautes.length} faute(s) de vocabulaire :\n`);
  fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
  if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
  process.exit(1);
}
