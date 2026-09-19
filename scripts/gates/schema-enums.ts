/**
 * schema-enums.ts — la garde du vocabulaire (GOV-006, DM-02 ; REQ-GOV-016, REQ-JUR-027 → REQ-DM-038,
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
 *   — Aucune LISTE LITTÉRALE d'états occupants ailleurs dans le code. L'unité de détection est le
 *     GROUPE — le plus petit `()`, `[]` ou `{}` qui les contient, commentaires retirés —, plus la
 *     ligne : une liste écrite sur plusieurs lignes passait, une liste de membres sans guillemets
 *     aussi. On compte les membres DIRECTS du groupe, chaînes ou identifiants nus ; DEUX états
 *     occupants suffisent à faire rougir, sauf si le groupe nomme EXACTEMENT l'enum
 *     `EtatAttribution` complet (un `switch` exhaustif, la projection `CREATE TYPE` de l'enum). Le
 *     discriminant reste la COUVERTURE, jamais la syntaxe — une clause `IN (…)` et une comparaison
 *     booléenne `x === a || x === b` rougissent pareil. Dans `prisma/migrations/**`, et là
 *     seulement, une clause qui nomme EXACTEMENT les états occupants est la projection de
 *     `clauseEtatsOccupants()` (l'index partiel) : elle est légitime par RÈGLE, pas par chemin.
 *     Cette garde est la SEULE implémentation de la famille (`partners/ADR-0011`). Sa portée —
 *     tout fichier SUIVI sous `RACINES_CODE`, quelle que soit son extension — tient dans
 *     `dansLaPorteeDesEtats` : la lecture du dépôt en dérive, et `gov-check.ts` en dérive, à chaque
 *     exécution, ses racines que cette famille ne couvre pas.
 *   — Une LIGNE est ce que LF termine, CRLF compris. Un texte lu qui porte une autre fin de ligne
 *     qu'un consommateur coupe est refusé (`fin_de_ligne_non_lf`) : découpé sur LF, un champ du
 *     schéma s'y collerait au précédent. `finDeLigneEtrangere` est la règle, et `gov-check.ts` l'importe.
 *   — Toute colonne de VOCABULAIRE est un enum. ⚠️ La citation de `REQ-DM-038` — « statut, type,
 *     motif, resultat, etat, origine, kind ou palier » — est le texte du REGISTRE, qui a perdu
 *     `status` et `priorite` à la fusion. La liste EXÉCUTÉE (`NOMS_DE_VOCABULAIRE`) porte les dix
 *     noms de l'arbitrage : voir l'avertissement posé sur elle. Une `String` y rougit — que le nom
 *     soit celui du champ ou celui de sa colonne (`@map`).
 *   — Toute VALEUR d'enum figure au glossaire, et tout enum que le glossaire ÉNUMÈRE a exactement
 *     ces valeurs-là — dans les deux sens, sans quoi une valeur retirée du schéma passerait.
 *   — Aucun REPLI qui retombe sur la valeur brute (`LIBELLES[x] ?? x`) : il rend à l'écran un
 *     identifiant technique au lieu de rougir, et déguise précisément la faute qu'on cherche.
 *   — L'index unique de l'attribution occupante est PARTIEL, et son prédicat nomme exactement les
 *     états occupants (`fautesIndexOccupant`, lue sur le SQL des migrations ; la spec d'intégration
 *     l'applique à `pg_indexes` après `migrate deploy`).
 *
 * LE SCHÉMA SE LIT PAR `scripts/lot/lecteur-prisma.ts`, jamais ligne à ligne : un modèle se ferme
 * sur SON accolade, pas sur la première `}` d'un commentaire ou d'une chaîne. Ce que le lecteur ne
 * sait pas lire est REFUSÉ en nommant la ligne (`schema_illisible`), et un schéma sans modèle ni
 * champ n'est pas un vert (`perimetre_vide`).
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne lance pas `prisma validate` et ne juge pas les relations. Elle ne
 * complète jamais le glossaire toute seule : `docs/CONVENTIONS.md` §8 en réserve l'écriture au
 * `gardien-spec`. Elle n'exige pas encore qu'un index occupant EXISTE : la table `attributions` naît
 * en phase 1 (DM-07), et c'est cette tâche-là qui exigera un compte `> 0` — la sortie imprime ce
 * compte, table absente comprise, pour que personne ne lise ce zéro comme un vert.
 *
 * INVARIANT DE LA PREUVE (RM-11). `--prove` ne touche pas au dépôt : la vue est INJECTÉE. Une
 * preuve qui lirait les fichiers réels verdirait ou rougirait au gré de ce que le dépôt contient
 * le jour où elle tourne, et ne dirait plus rien de la garde. Le fixture porte donc sa propre liste
 * d'états — c'est la seule raison pour laquelle ce fichier est exempté de la famille
 * `liste_litterale_d_etats`, comme `gov-identifiants.ts` l'est de la sienne.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';
import {
  ErreurLecturePrisma,
  lireMigrationSql,
  lireSchemaPrisma,
  type InstructionSql,
  type JetonSql,
  type SchemaPrisma,
} from '../lot/lecteur-prisma';

const CHEMIN_SCHEMA = 'prisma/schema.prisma';
const CHEMIN_GLOSSAIRE = 'docs/GLOSSAIRE.md';
const CHEMIN_EXIGENCES = 'docs/requirements.json';
const CHEMIN_ETATS = 'src/domain/attribution/etats.ts';
const RACINE_MIGRATIONS = 'prisma/migrations/';

/** Les racines où une liste d'états ou un repli muet ne doivent pas apparaître. */
export const RACINES_CODE = ['src', 'prisma', 'scripts'] as const;

/**
 * LA PORTÉE de la famille des listes d'états : tout fichier suivi sous une racine de `RACINES_CODE`,
 * QUELLE QUE SOIT SON EXTENSION — une liste d'extensions échoue ouvert sur celle qu'elle oublie.
 * La lecture du dépôt en dérive, et `gov-check.ts` aussi : une racine est dans la portée quand tout
 * chemin qui commence par elle l'est.
 */
export function dansLaPorteeDesEtats(chemin: string): boolean {
  return RACINES_CODE.some((racine) => chemin.startsWith(`${racine}/`));
}

/** Posés par leur code : écrits dans ce fichier, ils le couperaient lui-même. */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const FIN_DE_LIGNE_ETRANGERE = new RegExp(
  `${CR}(?!${LF})|[${String.fromCharCode(0x2028, 0x2029)}]`
);

/**
 * LA FIN DE LIGNE des gardes qui découpent un texte en lignes — celle-ci et `gov-check.ts` : LF, et
 * CRLF, dont le CR reste en fin de ligne. Rend la PREMIÈRE autre fin de ligne qu'un consommateur du
 * dépôt coupe — CR seul (Prisma, PostgreSQL, CommonMark), U+2028 ou U+2029 (ECMAScript) —, avec son
 * numéro de ligne au sens de LF. Un tel texte serait jugé sur d'autres lignes que celles de son
 * consommateur : un commentaire couvrirait l'instruction suivante, un champ se collerait au précédent.
 * Les deux gardes le REFUSENT (`fin_de_ligne_non_lf`) au lieu de le juger.
 */
export function finDeLigneEtrangere(texte: string): { ligne: number; code: string } | undefined {
  const m = FIN_DE_LIGNE_ETRANGERE.exec(texte);
  if (!m) return undefined;
  return {
    ligne: texte.slice(0, m.index).split(LF).length,
    code: `U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
  };
}

/**
 * Les fichiers qui ont le DROIT de porter la liste. CHACUN PORTE SON MOTIF : exempter sans motif,
 * c'est ouvrir un trou que personne ne relira. L'exemption vaut pour le CHEMIN EXACT, et chaque
 * entrée a un contre-témoin atteignable (sous une racine de `RACINES_CODE`) ; un voisin de la
 * source unique, dans le même dossier, a son témoin qui rougit. ⚠️ Les migrations n'y figurent
 * PAS : leur projection exacte est légitime par une RÈGLE jugée sur le contenu, jamais par un chemin.
 */
const PORTEURS_LEGITIMES: { chemin: string; motif: string }[] = [
  { chemin: CHEMIN_ETATS, motif: 'la source unique — interdire ici, c’est interdire la solution' },
  {
    chemin: 'scripts/gates/schema-enums.ts',
    motif: 'la garde elle-même : sa fixture et ses témoins SONT des listes d’états (RM-11)',
  },
];

/**
 * Les noms de colonne qui portent un vocabulaire (REQ-DM-038, REQ-GOV-016).
 *
 * ⚠️ CETTE LISTE EST PLUS LONGUE QUE LE TEXTE EN VIGUEUR DE `REQ-DM-038`, ET C'EST VOULU.
 * Le registre a perdu `status` et `priorite` — ainsi que la clause « une garde lit
 * `schema.prisma` et rougit sur toute colonne `String` ainsi nommée » — en appliquant la fusion
 * de `docs/REQUIREMENTS-ANNEXE-FUSIONS.md`, dont le texte DÉCIDÉ porte bien les dix noms.
 * **C'est le CODE qui est conforme à l'arbitrage, et l'EXIGENCE qui a dérivé.**
 *
 * 🔴 NE RÉDUIS PAS CETTE LISTE POUR LA FAIRE COÏNCIDER AVEC LE REGISTRE. C'est le geste que
 * la divergence PRESCRIT à qui la découvre — et il désarmerait la garde de deux noms. *Un
 * registre faux ne se contente pas de ne rien protéger : il prescrit le désarmement.*
 * Le sens de la correction est INVERSE : c'est `REQ-DM-038` qui doit retrouver son texte décidé.
 * ⚠️ AUCUN CHIFFRE ICI, ET C'EST VOULU. Une première rédaction gravait « 111 clauses décidées,
 * 14 appliquées » dans ce commentaire. La lentille `exactitude` (12e tour) a re-mesuré et obtenu
 * 114/15, dans une bande de 110-114 / 14-15 selon la normalisation choisie : **le compte dépend
 * de la façon dont on découpe une clause**, et rien ici ne le dérive. Un nombre gravé dans un
 * commentaire est un nombre que personne ne recalcule et que rien ne fait rougir — c'est la
 * famille que cette PR passe sa journée à fermer. Ce qui est GARDÉ, et qui suffit ici, est
 * ci-dessous : chaque nom décidé par l'annexe fait rougir la garde
 * (`tests/unit/gouvernance/glossaire-enums.spec.ts`).
 */
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
      'le texte de REQ-DM-003 ne donne plus la liste des états occupants ni la cible de son index : la garde ne sait plus à quoi comparer.',
  },
  {
    nom: 'fin_de_ligne_non_lf',
    explication:
      "un texte lu porte une fin de ligne autre que LF ou CRLF qu'un consommateur coupe : la garde le jugerait sur d'autres lignes que les siennes.",
  },
  {
    nom: 'schema_illisible',
    explication:
      'le schéma ou une migration ne se lit pas (accolade non appariée, chaîne non terminée, ligne inconnue) : la garde refuse au lieu de juger ce qu’elle a compris.',
  },
  {
    nom: 'perimetre_vide',
    explication:
      'le schéma ne porte aucun modèle ou aucun champ : « rien à redire » et « rien lu » ne se distinguent plus.',
  },
  {
    nom: 'etats_occupants_divergents',
    explication: 'la constante ETATS_OCCUPANTS ne dit plus ce que REQ-DM-003 dit.',
  },
  {
    nom: 'glossaire_divergent',
    explication: 'la colonne « Occupant ? » du glossaire ne rend pas les états de REQ-DM-003.',
  },
  {
    nom: 'liste_litterale_d_etats',
    explication: "une liste d'états occupants recopiée hors de sa source unique (RM-06).",
  },
  {
    nom: 'colonne_vocabulaire_en_chaine',
    explication:
      "une colonne de vocabulaire déclarée en String : le type n'attrape plus rien (RM-04).",
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
    explication: 'un repli qui retombe sur la valeur brute déguise la faute au lieu de la montrer.',
  },
  {
    nom: 'index_occupant_total',
    explication:
      'un index UNIQUE sur le SIREN des attributions sans WHERE : REQ-DM-003 veut un index PARTIEL.',
  },
  {
    nom: 'index_occupant_divergent',
    explication:
      "l'index partiel de l'attribution occupante ne couvre pas exactement les états occupants.",
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

/**
 * La CIBLE de l'index partiel, LUE dans le texte de REQ-DM-003 :
 * `ON attributions(siren) WHERE statut IN (…)` → table, colonne unique, colonne d'état.
 * Aucune des trois n'est tapée ici (RM-01) ; `undefined` si le texte ne la donne plus.
 */
export function cibleDeLIndex(
  texte: string
): { table: string; colonne: string; colonneEtat: string } | undefined {
  const m = /\bON\s+(\w+)\s*\(\s*(\w+)\s*\)\s*WHERE\s+(\w+)\s+IN\b/.exec(texte);
  return m ? { table: m[1]!, colonne: m[2]!, colonneEtat: m[3]! } : undefined;
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

/**
 * Les enums déclarés par le schéma Prisma, LUS par le lecteur unique. Lève `ErreurLecturePrisma`
 * sur un schéma qui ne se lit pas — jamais une table vide.
 */
export function enumsDuSchema(schema: string): Map<string, string[]> {
  return new Map(lireSchemaPrisma(schema).enums.map((e) => [e.nom, e.valeurs]));
}

/** Les champs des modèles Prisma, LUS par le lecteur unique : nom, colonne (`@map`) et type. */
export function champsDuSchema(
  schema: string
): { modele: string; champ: string; colonne: string; type: string }[] {
  return lireSchemaPrisma(schema).modeles.flatMap((m) =>
    m.champs.map((c) => ({ modele: m.nom, champ: c.nom, colonne: c.colonne, type: c.type }))
  );
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

// ── les groupes : l'unité de détection des listes d'états ────────────────────

type JetonDeCode = { type: 'ouvre' | 'ferme' | 'membre'; valeur: string; ligne: number };

const OUVRANTS = new Set(['(', '[', '{']);
const FERMANTS = new Set([')', ']', '}']);
const EXTENSIONS_ECMA = /\.(?:[cm]?[jt]sx?|json|prisma)$/;

/**
 * Les jetons d'un fichier ECMAScript, JSON ou Prisma : commentaires `//` et `/* *\/` RETIRÉS,
 * chaînes `'…'`, `"…"` et morceaux de gabarit `` `…${…}…` `` rendus comme membres, identifiants
 * aussi, et les trois paires de délimiteurs. Seuls les membres dont la valeur est dans `noms` sont
 * gardés : les autres ne comptent jamais.
 */
function jetonsEcma(texte: string, noms: ReadonlySet<string>): JetonDeCode[] {
  const sortie: JetonDeCode[] = [];
  const pileGabarits: number[] = [];
  const IDENT = /[A-Za-z_$][\w$]*/y;
  let ligne = 1;
  let i = 0;
  const membre = (valeur: string, l: number): void => {
    if (noms.has(valeur)) sortie.push({ type: 'membre', valeur, ligne: l });
  };
  const gabarit = (): void => {
    let valeur = '';
    const l = ligne;
    while (i < texte.length) {
      const d = texte[i]!;
      if (d === '\\') {
        if (texte[i + 1] === LF) ligne++;
        valeur += texte[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (d === '`') {
        i++;
        break;
      }
      if (d === '$' && texte[i + 1] === '{') {
        i += 2;
        pileGabarits.push(0);
        break;
      }
      if (d === LF) ligne++;
      valeur += d;
      i++;
    }
    membre(valeur, l);
  };
  while (i < texte.length) {
    const c = texte[i]!;
    if (c === LF) {
      ligne++;
      i++;
      continue;
    }
    if (c === '/' && texte[i + 1] === '/') {
      while (i < texte.length && texte[i] !== LF) i++;
      continue;
    }
    if (c === '/' && texte[i + 1] === '*') {
      const fin = texte.indexOf('*/', i + 2);
      const jusqua = fin === -1 ? texte.length : fin + 2;
      for (; i < jusqua; i++) if (texte[i] === LF) ligne++;
      continue;
    }
    if (c === "'" || c === '"') {
      let valeur = '';
      i++;
      while (i < texte.length && texte[i] !== c && texte[i] !== LF) {
        if (texte[i] === '\\' && texte[i + 1] !== LF) {
          valeur += texte[i + 1] ?? '';
          i += 2;
          continue;
        }
        valeur += texte[i]!;
        i++;
      }
      if (texte[i] === c) i++;
      membre(valeur, ligne);
      continue;
    }
    if (c === '`') {
      i++;
      gabarit();
      continue;
    }
    if (c === '}' && pileGabarits.length > 0 && pileGabarits[pileGabarits.length - 1] === 0) {
      pileGabarits.pop();
      i++;
      gabarit();
      continue;
    }
    if (OUVRANTS.has(c) || FERMANTS.has(c)) {
      if (pileGabarits.length > 0 && (c === '{' || c === '}')) {
        pileGabarits[pileGabarits.length - 1]! += c === '{' ? 1 : -1;
      }
      sortie.push({ type: OUVRANTS.has(c) ? 'ouvre' : 'ferme', valeur: c, ligne });
      i++;
      continue;
    }
    IDENT.lastIndex = i;
    const m = IDENT.exec(texte);
    if (m) {
      membre(m[0], ligne);
      i += m[0].length;
      continue;
    }
    i++;
  }
  return sortie;
}

/**
 * Les jetons d'un fichier SQL, par le lecteur unique : littéraux, identifiants et mots sont des
 * membres ; un corps `$$…$$` est RELU comme du SQL (un déclencheur peut porter une liste) ; chaque
 * instruction est son propre groupe racine.
 */
function jetonsSql(texte: string, noms: ReadonlySet<string>, ligneDeDepart = 1): JetonDeCode[] {
  const sortie: JetonDeCode[] = [];
  for (const instr of lireMigrationSql(texte, ligneDeDepart)) {
    sortie.push({ type: 'ouvre', valeur: ';', ligne: instr.ligne });
    for (const j of instr.jetons) {
      if (j.type === 'corps') sortie.push(...jetonsSql(j.valeur, noms, j.ligne));
      else if (j.type === 'symbole' && OUVRANTS.has(j.valeur))
        sortie.push({ type: 'ouvre', valeur: j.valeur, ligne: j.ligne });
      else if (j.type === 'symbole' && FERMANTS.has(j.valeur))
        sortie.push({ type: 'ferme', valeur: j.valeur, ligne: j.ligne });
      else if (j.type !== 'symbole' && noms.has(j.valeur))
        sortie.push({ type: 'membre', valeur: j.valeur, ligne: j.ligne });
    }
    sortie.push({ type: 'ferme', valeur: ';', ligne: instr.ligne });
  }
  return sortie;
}

/** Tout autre texte : identifiants nus et délimiteurs, guillemets ignorés — rien ne s'y cache. */
function jetonsTexte(texte: string, noms: ReadonlySet<string>): JetonDeCode[] {
  const sortie: JetonDeCode[] = [];
  let ligne = 1;
  const MOTIF = /\n|[()[\]{}]|[A-Za-z_][\w]*/g;
  for (const m of texte.matchAll(MOTIF)) {
    const v = m[0];
    if (v === LF) ligne++;
    else if (OUVRANTS.has(v)) sortie.push({ type: 'ouvre', valeur: v, ligne });
    else if (FERMANTS.has(v)) sortie.push({ type: 'ferme', valeur: v, ligne });
    else if (noms.has(v)) sortie.push({ type: 'membre', valeur: v, ligne });
  }
  return sortie;
}

/**
 * Les GROUPES d'un fichier et leurs membres DIRECTS (ceux d'un sous-groupe appartiennent au
 * sous-groupe). Le fichier entier est le groupe racine. Un fermant sans ouvrant est ignoré ; un
 * groupe jamais fermé l'est à la fin du fichier.
 */
export function groupesDEtats(
  chemin: string,
  texte: string,
  noms: ReadonlySet<string>
): { valeur: string; ligne: number }[][] {
  const jetons = chemin.endsWith('.sql')
    ? jetonsSql(texte, noms)
    : EXTENSIONS_ECMA.test(chemin)
      ? jetonsEcma(texte, noms)
      : jetonsTexte(texte, noms);
  const fermes: { valeur: string; ligne: number }[][] = [];
  const pile: { valeur: string; ligne: number }[][] = [[]];
  for (const j of jetons) {
    if (j.type === 'ouvre') pile.push([]);
    else if (j.type === 'ferme') {
      if (pile.length > 1) fermes.push(pile.pop()!);
    } else pile[pile.length - 1]!.push({ valeur: j.valeur, ligne: j.ligne });
  }
  while (pile.length > 0) fermes.push(pile.pop()!);
  return fermes.filter((g) => g.length > 0);
}

// ── l'index partiel de l'attribution occupante ───────────────────────────────

const estMot = (j: JetonSql | undefined, ...mots: string[]): boolean =>
  j !== undefined && j.type === 'mot' && mots.includes(j.valeur.toUpperCase());

/** Le nom d'un identifiant SQL : un mot nu se replie en minuscules, un `"…"` garde sa casse. */
const nomSql = (j: JetonSql): string => (j.type === 'mot' ? j.valeur.toLowerCase() : j.valeur);

type IndexLu = {
  nom: string;
  unique: boolean;
  table: string;
  colonnes: string[];
  predicat: JetonSql[] | undefined;
};

/** Un `CREATE [UNIQUE] INDEX`, tel que l'écrit une migration ou que le rend `pg_indexes.indexdef`. */
function lireIndex(instr: InstructionSql): IndexLu | undefined {
  const t = instr.jetons;
  let k = 0;
  if (!estMot(t[k++], 'CREATE')) return undefined;
  const unique = estMot(t[k], 'UNIQUE');
  if (unique) k++;
  if (!estMot(t[k++], 'INDEX')) return undefined;
  if (estMot(t[k], 'CONCURRENTLY')) k++;
  if (estMot(t[k], 'IF')) k += 3;
  let nom = '(sans nom)';
  if (!estMot(t[k], 'ON')) nom = nomSql(t[k++]!);
  if (!estMot(t[k++], 'ON')) return undefined;
  if (estMot(t[k], 'ONLY')) k++;
  let table = nomSql(t[k++]!);
  while (t[k]?.type === 'symbole' && t[k]!.valeur === '.') {
    table = nomSql(t[k + 1]!);
    k += 2;
  }
  if (estMot(t[k], 'USING')) k += 2;
  const colonnes: string[] = [];
  if (t[k]?.valeur === '(') {
    let profondeur = 0;
    let debutElement = true;
    for (; k < t.length; k++) {
      const j = t[k]!;
      if (j.type === 'symbole' && j.valeur === '(') {
        profondeur++;
        if (profondeur === 1) continue;
      } else if (j.type === 'symbole' && j.valeur === ')') {
        profondeur--;
        if (profondeur === 0) {
          k++;
          break;
        }
      } else if (profondeur === 1 && j.type === 'symbole' && j.valeur === ',') {
        debutElement = true;
        continue;
      }
      if (debutElement && profondeur === 1 && (j.type === 'mot' || j.type === 'identifiant')) {
        colonnes.push(nomSql(j));
      }
      debutElement = false;
    }
  }
  const where = t.findIndex((j, i) => i >= k && estMot(j, 'WHERE'));
  return { nom, unique, table, colonnes, predicat: where === -1 ? undefined : t.slice(where + 1) };
}

/**
 * Le prédicat d'un index partiel RÉDUIT à sa forme : parenthèses, crochets, virgules, `ARRAY` et
 * conversions `::type` retirés. `statut IN ('a', 'b')` et la réécriture de PostgreSQL
 * `(statut = ANY (ARRAY['a'::etat, 'b'::etat]))` rendent la MÊME suite — on compare des ensembles
 * de littéraux, jamais des chaînes.
 */
function formeDuPredicat(predicat: JetonSql[]): JetonSql[] {
  const sortie: JetonSql[] = [];
  for (let i = 0; i < predicat.length; i++) {
    const j = predicat[i]!;
    if (j.type === 'symbole' && ['(', ')', '[', ']', ','].includes(j.valeur)) continue;
    if (estMot(j, 'ARRAY')) continue;
    if (j.type === 'symbole' && j.valeur === '::') {
      i++;
      continue;
    }
    sortie.push(j);
  }
  return sortie;
}

/**
 * Les fautes d'UN index, au regard de REQ-DM-003. Exportée : la spec d'intégration l'applique à
 * `pg_indexes.indexdef` après `migrate deploy`, la garde au SQL des migrations — une règle, deux
 * sources, une implémentation.
 *
 *   — un index UNIQUE sur `source.colonne` de `table`, SANS `WHERE` → `index_occupant_total` ;
 *   — un tel index dont le prédicat nomme au moins un état occupant, mais n'est pas EXACTEMENT
 *     « `colonneEtat` IN (états occupants) » — ensemble différent, négation, `OR`, `AND`, colonne
 *     d'état différente, clé à plusieurs colonnes → `index_occupant_divergent`.
 *
 * Un index unique partiel dont le prédicat ne nomme AUCUN état occupant (une file `en_attente`)
 * n'est pas l'index de l'attribution occupante : il n'est pas jugé ici.
 */
export function fautesIndexOccupant(
  index: string,
  table: string,
  source: { colonne: string; colonneEtat: string; occupants: readonly string[] }
): Faute[] {
  const fautes: Faute[] = [];
  for (const instr of lireMigrationSql(index)) {
    const lu = lireIndex(instr);
    if (!lu || !lu.unique || lu.table !== table || !lu.colonnes.includes(source.colonne)) continue;
    if (lu.predicat === undefined) {
      fautes.push({
        famille: 'index_occupant_total',
        message:
          `index « ${lu.nom} » sur ${table}(${lu.colonnes.join(', ')}) : UNIQUE sans WHERE. ` +
          `REQ-DM-003 veut un index PARTIEL — « au plus une attribution OCCUPANTE par ${source.colonne} » ; ` +
          'un index total interdit toute nouvelle attribution après une perte ou une expiration.',
      });
      continue;
    }
    const forme = formeDuPredicat(lu.predicat);
    const litteraux = forme.filter((j) => j.type === 'litteral').map((j) => j.valeur);
    if (!litteraux.some((v) => source.occupants.includes(v))) continue;
    const [colonne, operateur, ensuite] = forme;
    const appartenance =
      colonne !== undefined &&
      colonne.type !== 'litteral' &&
      nomSql(colonne) === source.colonneEtat &&
      (estMot(operateur, 'IN') ||
        (operateur?.type === 'symbole' && operateur.valeur === '=' && estMot(ensuite, 'ANY')));
    const valeurs = forme.slice(estMot(operateur, 'IN') ? 2 : 3);
    const seulementDesLitteraux = valeurs.every((j) => j.type === 'litteral');
    const ensembleExact =
      new Set(litteraux).size === source.occupants.length &&
      source.occupants.every((o) => litteraux.includes(o)) &&
      litteraux.every((v) => source.occupants.includes(v));
    if (lu.colonnes.length !== 1 || !appartenance || !seulementDesLitteraux || !ensembleExact) {
      fautes.push({
        famille: 'index_occupant_divergent',
        message:
          `index « ${lu.nom} » sur ${table}(${lu.colonnes.join(', ')}) : le prédicat nomme ` +
          `{${[...new Set(litteraux)].join(', ')}} ; REQ-DM-003 exige exactement ` +
          `« ${source.colonneEtat} IN (${source.occupants.join(', ')}) » sur la seule colonne ` +
          `${source.colonne}. Génère la clause depuis clauseEtatsOccupants() : une liste tapée ne suit ` +
          "jamais l'exigence.",
      });
    }
  }
  return fautes;
}

/** Les index uniques d'une table sur une colonne, dans le SQL des migrations — le compte imprimé. */
function indexUniquesSur(sql: string, table: string, colonne: string): number {
  return lireMigrationSql(sql)
    .map(lireIndex)
    .filter((i) => i?.unique && i.table === table && i.colonnes.includes(colonne)).length;
}

/** Vrai si une migration crée la table. */
function creeLaTable(sql: string, table: string): boolean {
  return lireMigrationSql(sql).some((instr) => {
    const t = instr.jetons;
    if (!estMot(t[0], 'CREATE') || !estMot(t[1], 'TABLE')) return false;
    const k = estMot(t[2], 'IF') ? 5 : 2;
    let nom = t[k] ? nomSql(t[k]!) : '';
    if (t[k + 1]?.valeur === '.' && t[k + 2]) nom = nomSql(t[k + 2]!);
    return nom === table;
  });
}

const estMigrationSql = (chemin: string): boolean =>
  chemin.startsWith(RACINE_MIGRATIONS) && chemin.endsWith('.sql');

// ── le contrôle ──────────────────────────────────────────────────────────────

const memeEnsemble = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** Le schéma lu, ou la faute qui dit pourquoi il ne l'est pas. */
function schemaLu(schema: string): SchemaPrisma | Faute {
  try {
    return lireSchemaPrisma(schema);
  } catch (e) {
    if (!(e instanceof ErreurLecturePrisma)) throw e;
    return {
      famille: 'schema_illisible',
      message:
        `${CHEMIN_SCHEMA} — ${e.message}. La garde ne juge pas un schéma qu'elle ne sait pas lire : ` +
        'un modèle mal fermé cacherait les champs qui le suivent.',
    };
  }
}

export function controler(vue: Vue): Faute[] {
  const fautes: Faute[] = [];
  const attendus = etatsOccupantsDeLaReq(vue.reqDm003);
  const cible = cibleDeLIndex(vue.reqDm003);

  // Ne pas avoir pu lire la source n'est JAMAIS un vert : sans elle, toutes les égalités
  // ci-dessous compareraient un tableau vide à un tableau vide.
  if (attendus.length === 0 || cible === undefined) {
    return [
      {
        famille: 'source_illisible',
        message:
          'REQ-DM-003 ne porte plus « ETATS_OCCUPANTS = {…} » ou « ON <table>(<colonne>) WHERE ' +
          '<colonne> IN (…) » : la garde ne sait plus à quoi comparer la constante, le glossaire ' +
          "ni l'index. Rétablis le texte dans le registre des exigences — ce n'est pas ici qu'il se décide.",
      },
    ];
  }

  // Chaque texte lu, UNE fois par chemin (le schéma et la source des états sont aussi dans `code`).
  const textes = new Map<string, string>([
    ['REQ-DM-003', vue.reqDm003],
    [CHEMIN_GLOSSAIRE, vue.glossaire],
    [CHEMIN_SCHEMA, vue.schema],
    [CHEMIN_ETATS, vue.etatsSource],
    ...vue.code.map((f): [string, string] => [f.chemin, f.contenu]),
  ]);
  const coupes = new Set<string>();
  for (const [chemin, texte] of textes) {
    const fin = finDeLigneEtrangere(texte);
    if (fin === undefined) continue;
    coupes.add(chemin);
    fautes.push({
      famille: 'fin_de_ligne_non_lf',
      message:
        `${chemin}:${fin.ligne} — fin de ligne ${fin.code}, que cette garde ne coupe pas et que Prisma, ` +
        "CommonMark ou ECMAScript coupent : un champ, une valeur d'enum ou une liste y serait jugé sur la " +
        "ligne d'à côté. Écris LF (ou CRLF).",
    });
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

  // Le schéma se LIT — sauf s'il vient d'être refusé pour sa fin de ligne : refusé, il n'est pas jugé.
  const lu = coupes.has(CHEMIN_SCHEMA) ? undefined : schemaLu(vue.schema);
  const schema = lu && 'modeles' in lu ? lu : undefined;
  if (lu && !schema) fautes.push(lu as Faute);

  // L'enum COMPLET des états, lu dans le schéma ; à défaut, dans le glossaire.
  const complets =
    schema?.enums.find((e) => e.nom === 'EtatAttribution')?.valeurs ??
    etatsDuGlossaire(vue.glossaire).map((e) => e.valeur);
  const noms = new Set([...complets, ...attendus]);

  // RM-06 : le discriminant est la COUVERTURE d'un GROUPE — deux états occupants parmi ses membres
  // directs, quel que soit l'opérateur qui les relie. Seuil, alternatives écartées et retour
  // arrière : `partners/ADR-0011`. Un prédicat légitime passe par `PORTEURS_LEGITIMES` ou par la
  // règle de projection exacte, jamais par un seuil.
  for (const f of vue.code) {
    if (coupes.has(f.chemin)) continue;
    const legitime = PORTEURS_LEGITIMES.some((p) => p.chemin === f.chemin);
    if (!legitime) {
      let groupes: { valeur: string; ligne: number }[][];
      try {
        groupes = groupesDEtats(f.chemin, f.contenu, noms);
      } catch (e) {
        if (!(e instanceof ErreurLecturePrisma)) throw e;
        fautes.push({
          famille: 'schema_illisible',
          message: `${f.chemin} — ${e.message} : le SQL ne se lit pas, la garde ne le juge pas.`,
        });
        groupes = [];
      }
      for (const g of groupes) {
        const nomsDuGroupe = [...new Set(g.map((m) => m.valeur))];
        const occupants = nomsDuGroupe.filter((n) => attendus.includes(n));
        if (occupants.length < 2) continue;
        if (complets.length > 0 && memeEnsemble(nomsDuGroupe, complets)) continue;
        if (estMigrationSql(f.chemin) && memeEnsemble(nomsDuGroupe, attendus)) continue;
        const ligne = g.find((m) => attendus.includes(m.valeur))!.ligne;
        fautes.push({
          famille: 'liste_litterale_d_etats',
          message:
            `${f.chemin}:${ligne} — liste littérale d'états occupants (${occupants.join(', ')}, ` +
            `soit ${occupants.length} sur ${attendus.length}). ` +
            `Importe ETATS_OCCUPANTS depuis ${CHEMIN_ETATS} : une liste recopiée ne suit jamais ` +
            "l'exigence, et l'index qui n'en couvrait que deux sur sept n'a rien fait rougir.",
        });
      }
    }
    f.contenu.split('\n').forEach((ligne, i) => {
      if (legitime) return;
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

    // L'index de l'attribution occupante, lu dans le SQL de chaque migration.
    if (estMigrationSql(f.chemin)) {
      const instructions = ((): InstructionSql[] => {
        try {
          return lireMigrationSql(f.contenu);
        } catch {
          return []; // déjà nommée ci-dessus, famille `schema_illisible`
        }
      })();
      for (const instr of instructions) {
        for (const faute of fautesIndexOccupant(instr.texte, cible.table, {
          colonne: cible.colonne,
          colonneEtat: cible.colonneEtat,
          occupants: attendus,
        })) {
          fautes.push({ ...faute, message: `${f.chemin}:${instr.ligne} — ${faute.message}` });
        }
      }
    }
  }

  if (!schema) return fautes;

  const champs = schema.modeles.flatMap((m) => m.champs.map((c) => ({ modele: m.nom, ...c })));
  if (schema.modeles.length === 0 || champs.length === 0) {
    fautes.push({
      famille: 'perimetre_vide',
      message:
        `${CHEMIN_SCHEMA} — ${schema.modeles.length} modèle(s), ${champs.length} champ(s) : la garde ` +
        "n'a aucune colonne à juger, et un zéro ne dit pas si c'est parce qu'il n'y a rien à redire " +
        "ou parce qu'elle n'a rien lu.",
    });
  }

  for (const c of champs) {
    const nomPorteur = [c.nom, c.colonne].find((n) => NOMS_DE_VOCABULAIRE.test(n));
    if (nomPorteur !== undefined && TYPES_LIBRES.has(c.type)) {
      fautes.push({
        famille: 'colonne_vocabulaire_en_chaine',
        message:
          `${CHEMIN_SCHEMA}:${c.ligne} — ${c.modele}.${c.nom} est un ${c.type} alors que son nom ` +
          `(« ${nomPorteur} ») porte un vocabulaire (REQ-DM-038). Déclare un enum Prisma et inscris ` +
          "ses valeurs au glossaire : une chaîne libre laisse un seed écrire n'importe quoi, et rien ne le voit.",
      });
    }
  }

  const auGlossaire = enumsDuGlossaire(vue.glossaire);
  for (const { nom, valeurs } of schema.enums) {
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

/**
 * Ce que la garde a RÉELLEMENT confronté — imprimé au vert comme au rouge. Aucun compte n'est la
 * longueur d'une liste tapée : tout se relit dans la vue.
 */
export function perimetreDeLaVue(vue: Vue): {
  modeles: number;
  champs: number;
  enums: number;
  valeurs: number;
  fichiers: number;
  migrations: number;
  indexOccupants: number;
  table: string;
  tablePresente: boolean;
} {
  const cible = cibleDeLIndex(vue.reqDm003);
  const table = cible?.table ?? '(cible illisible)';
  let schema: SchemaPrisma = { modeles: [], enums: [] };
  try {
    schema = lireSchemaPrisma(vue.schema);
  } catch {
    // illisible : zéro lu, et la famille `schema_illisible` le dit
  }
  const migrations = vue.code.filter((f) => estMigrationSql(f.chemin));
  let indexOccupants = 0;
  let tablePresente = false;
  for (const m of migrations) {
    try {
      if (cible) indexOccupants += indexUniquesSur(m.contenu, cible.table, cible.colonne);
      if (cible && creeLaTable(m.contenu, cible.table)) tablePresente = true;
    } catch {
      // illisible : déjà nommée par `controler`
    }
  }
  return {
    modeles: schema.modeles.length,
    champs: schema.modeles.reduce((n, m) => n + m.champs.length, 0),
    enums: schema.enums.length,
    valeurs: schema.enums.reduce((n, e) => n + e.valeurs.length, 0),
    fichiers: vue.code.length,
    migrations: migrations.length,
    indexOccupants,
    table,
    tablePresente,
  };
}

// ── la vue du dépôt ──────────────────────────────────────────────────────────

const lireOuVide = (chemin: string): string =>
  existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';

/**
 * La vue du dépôt. Le code est l'ensemble des fichiers SUIVIS de la portée, lus par la source unique
 * du périmètre : sans dépôt git, ou lancée hors de sa racine, la garde refuse en le nommant.
 */
export function vueDuDepot(): Vue {
  const suivis = fichiersSuivisOuRefus('partners:schema:enums');
  return {
    reqDm003: texteDeLaReq('REQ-DM-003'),
    glossaire: lireOuVide(CHEMIN_GLOSSAIRE),
    schema: lireOuVide(CHEMIN_SCHEMA),
    etatsSource: lireOuVide(CHEMIN_ETATS),
    code: suivis.filter(dansLaPorteeDesEtats).map((chemin) => ({
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
  'model Compte {',
  '  id   String      @id',
  '  role ConsoleRole',
  '}',
  '',
].join('\n');

/**
 * La liste ci-dessous est le SEUL littéral d'états occupants du dépôt hors de sa source, et c'est
 * pourquoi ce fichier figure dans `PORTEURS_LEGITIMES` : sans elle, la preuve devrait lire le
 * dépôt, et une preuve qui lit le dépôt ne prouve plus rien de la garde (RM-11).
 */
const ETATS_FIXTURE =
  "['provisoire', 'active', 'rdv_pris', 'proposition', 'signee', 'convertie', 'figee_resiliation']";
const CLAUSE_FIXTURE =
  "'provisoire', 'active', 'rdv_pris', 'proposition', 'signee', 'convertie', 'figee_resiliation'";

export const VUE_CONFORME: Vue = {
  reqDm003:
    'Au plus une attribution occupante par SIREN : index unique partiel `ON attributions(siren) ' +
    'WHERE statut IN (ETATS_OCCUPANTS)` où ETATS_OCCUPANTS = ' +
    '{provisoire, active, rdv_pris, proposition, signee, convertie, figee_resiliation}, la liste ' +
    'étant une constante unique partagée par le code et la migration.',
  glossaire: GLOSSAIRE_FIXTURE,
  schema: SCHEMA_FIXTURE,
  etatsSource: `export const ETATS_OCCUPANTS = ${ETATS_FIXTURE} as const;\n`,
  code: [],
};

/** Trois migrations, la faute au MILIEU : un contrôle qui ne lirait que la première ou la dernière passerait. */
function migrationsAvec(milieu: string): FichierCode[] {
  return [
    {
      chemin: 'prisma/migrations/1_socle/migration.sql',
      contenu: 'CREATE TABLE "a" ("id" INT);\n',
    },
    {
      chemin: 'prisma/migrations/2_attributions/migration.sql',
      contenu:
        'CREATE TABLE "attributions" ("siren" CHAR(9), "statut" "etat_attribution");\n' +
        `${milieu}\n` +
        'CREATE INDEX "attributions_siren" ON "attributions" ("siren");\n',
    },
    {
      chemin: 'prisma/migrations/3_suite/migration.sql',
      contenu: 'CREATE TABLE "b" ("id" INT);\n',
    },
  ];
}

/** Un témoin par famille : la vue truquée, et la famille qu'elle DOIT faire rougir. */
const TEMOINS: { famille: string; vue: () => Vue }[] = [
  {
    famille: 'source_illisible',
    vue: () => ({ ...VUE_CONFORME, reqDm003: 'Au plus une attribution occupante par SIREN.' }),
  },
  // La cible de l'index disparaît du texte, la liste reste : la garde ne sait plus quel index juger.
  {
    famille: 'source_illisible',
    vue: () => ({
      ...VUE_CONFORME,
      reqDm003: VUE_CONFORME.reqDm003.replace('ON attributions(siren) ', ''),
    }),
  },
  // Un CR seul, que Prisma coupe : découpé sur LF, `statut String` se colle au champ précédent et disparaît.
  {
    famille: 'fin_de_ligne_non_lf',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema +
        ['model Attribution {', '  id     String @id', '  statut String', '}', ''].join(CR),
    }),
  },
  // Une accolade jamais fermée : lu ligne à ligne, le modèle se fermerait sur le bloc suivant.
  {
    famille: 'schema_illisible',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nmodel Bac {\n  id     String @id\n  statut String\n',
    }),
  },
  {
    famille: 'schema_illisible',
    vue: () => ({
      ...VUE_CONFORME,
      schema: VUE_CONFORME.schema + '\nmodel Bac {\n  id String @id @default("}\n}\n',
    }),
  },
  // Le lecteur rend « rien » : zéro modèle, et le zéro ne passe pas pour un vert.
  {
    famille: 'perimetre_vide',
    vue: () => ({ ...VUE_CONFORME, schema: VUE_CONFORME.schema.split('model Compte')[0]! }),
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
      glossaire: VUE_CONFORME.glossaire.replace(
        '| `annulee` | retirée | non |',
        '| `annulee` | retirée | **oui** |'
      ),
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
  // La comparaison booléenne à deux états : le verdict ne bascule pas sur l'opérateur (`partners/ADR-0011`).
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'src/server/x.ts',
          contenu: "if (s === 'provisoire' || s === 'active') return;",
        },
      ],
    }),
  },
  // Le VOISIN de la source unique, dans son dossier : l'exemption vaut pour un chemin, pas un dossier.
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'src/domain/attribution/requete.ts',
          contenu: "const vivantes = ['provisoire', 'active'];",
        },
      ],
    }),
  },
  // Une liste sur PLUSIEURS lignes : jugée par groupe, plus par ligne.
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/x/liste.ts', contenu: "const x = [\n  'provisoire',\n  'active'\n];" }],
    }),
  },
  // Des membres SANS guillemets.
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/x/enum.ts', contenu: 'enum X { provisoire, active }' }],
    }),
  },
  // La clause EXACTE des occupants HORS d'une migration : la règle de projection ne vaut qu'en migration.
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        { chemin: 'src/x/requete.sql', contenu: `SELECT 1 WHERE statut IN (${CLAUSE_FIXTURE});` },
      ],
    }),
  },
  // Une liste cachée dans le corps `$$` d'un déclencheur : le corps se relit comme du SQL.
  {
    famille: 'liste_litterale_d_etats',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        "CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN IF NEW.statut IN ('signee', 'convertie') THEN RETURN NULL; END IF; END; $$ LANGUAGE plpgsql;"
      ),
    }),
  },
  {
    famille: 'colonne_vocabulaire_en_chaine',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema + '\nmodel Attribution {\n  id     String @id\n  statut String\n}\n',
    }),
  },
  // Le champ placé APRÈS une accolade de commentaire, au milieu du modèle.
  {
    famille: 'colonne_vocabulaire_en_chaine',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema + '\nmodel Bac { id Int @id // }\n  statut String\n  siren String\n}\n',
    }),
  },
  // Le nom du CHAMP est neutre, celui de sa COLONNE porte le vocabulaire.
  {
    famille: 'colonne_vocabulaire_en_chaine',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema + '\nmodel Bac {\n  id String @id\n  code String @map("statut")\n}\n',
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
  {
    famille: 'index_occupant_total',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec('CREATE UNIQUE INDEX "un_occupant" ON "attributions" ("siren");'),
    }),
  },
  // Six états sur sept : la liste a perdu `figee_resiliation`.
  {
    famille: 'index_occupant_divergent',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        `CREATE UNIQUE INDEX "un_occupant" ON "attributions" ("siren") WHERE "statut" IN (${CLAUSE_FIXTURE.replace(", 'figee_resiliation'", '')});`
      ),
    }),
  },
  // Les sept, mais NIÉS : l'ensemble est le bon, le prédicat couvre l'inverse.
  {
    famille: 'index_occupant_divergent',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        `CREATE UNIQUE INDEX "un_occupant" ON "attributions" ("siren") WHERE "statut" NOT IN (${CLAUSE_FIXTURE});`
      ),
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
    quoi: 'un schéma en CRLF : CRLF est une fin de ligne, la garde le lit et ne le refuse pas',
    vue: () => ({ ...VUE_CONFORME, schema: VUE_CONFORME.schema.split(LF).join(CR + LF) }),
  },
  {
    quoi: 'la source unique porte la liste — sinon la garde interdirait sa propre solution',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: CHEMIN_ETATS, contenu: "['provisoire', 'active', 'signee']" }],
    }),
  },
  {
    // Le contre-témoin de la SECONDE exemption de `PORTEURS_LEGITIMES`. Sans lui, elle serait
    // verte parce qu'on ne l'atteint jamais en preuve, pas parce qu'elle fonctionne.
    quoi: 'la garde elle-même porte des listes d’états — sa fixture et ses témoins en SONT (RM-11)',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        { chemin: 'scripts/gates/schema-enums.ts', contenu: "code: ['provisoire', 'active']" },
      ],
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
      schema:
        VUE_CONFORME.schema +
        '\nmodel Attribution {\n  id     String @id\n  statut EtatAttribution\n}\n',
    }),
  },
  {
    quoi: 'une colonne libre qui ne porte aucun vocabulaire',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema + '\nmodel Attribution {\n  id    String @id\n  siren String\n}\n',
    }),
  },
  {
    quoi: 'une chaîne `@default("}")` et un commentaire `// }` ne ferment rien',
    vue: () => ({
      ...VUE_CONFORME,
      schema:
        VUE_CONFORME.schema +
        '\nmodel Bac { // }\n  id   String @id @default("}")\n  role ConsoleRole\n}\n',
    }),
  },
  {
    quoi: 'un groupe qui ne nomme qu’UN état occupant',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/x/un.ts', contenu: "if (s === 'provisoire') return;\nf('active');" }],
    }),
  },
  {
    quoi: 'un switch exhaustif sur l’enum COMPLET',
    vue: () => ({
      ...VUE_CONFORME,
      code: [
        {
          chemin: 'src/x/libelle.ts',
          contenu:
            'switch (e) {\n' +
            "  case 'provisoire': case 'active': case 'rdv_pris': case 'proposition':\n" +
            "  case 'signee': case 'convertie': case 'figee_resiliation': case 'annulee':\n" +
            '    return 1;\n}',
        },
      ],
    }),
  },
  {
    quoi: 'des identifiants qui CONTIENNENT un nom d’état sans l’être (`nombre`, `activement`)',
    vue: () => ({
      ...VUE_CONFORME,
      code: [{ chemin: 'src/x/mots.ts', contenu: 'f(activement, nombre, activeCount, signees);' }],
    }),
  },
  {
    quoi: 'la projection exacte de l’enum en `CREATE TYPE`, une valeur par ligne',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        "CREATE TYPE \"etat_attribution\" AS ENUM (\n  'provisoire',\n  'active',\n  'rdv_pris',\n" +
          "  'proposition',\n  'signee',\n  'convertie',\n  'figee_resiliation',\n  'annulee'\n);"
      ),
    }),
  },
  {
    quoi: 'l’index partiel dont la clause est EXACTEMENT clauseEtatsOccupants(), dans une migration',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        `CREATE UNIQUE INDEX "un_occupant" ON "attributions" ("siren") WHERE "statut" IN (${CLAUSE_FIXTURE});`
      ),
    }),
  },
  {
    quoi: 'la même définition telle que `pg_indexes` la réécrit (`= ANY (ARRAY[…::type])`)',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        'CREATE UNIQUE INDEX un_occupant ON public.attributions USING btree (siren) WHERE (statut = ANY (ARRAY[' +
          CLAUSE_FIXTURE.split(', ')
            .map((v) => `${v}::etat_attribution`)
            .join(', ') +
          ']));'
      ),
    }),
  },
  {
    quoi: 'un index unique partiel qui ne nomme aucun état occupant (une file `en_attente`)',
    vue: () => ({
      ...VUE_CONFORME,
      code: migrationsAvec(
        'CREATE UNIQUE INDEX "file" ON "attributions" ("siren") WHERE "statut" = \'annulee\';'
      ),
    }),
  },
];

// ── exécution ────────────────────────────────────────────────────────────────

/**
 * Le fichier est IMPORTÉ par les specs autant qu'il est lancé en ligne de commande : sans cette
 * garde, l'import exécuterait le contrôle et son `process.exit(0)`.
 *
 * ANCRÉE dossier + nom + fin, EXTENSION FACULTATIVE. `npx tsx scripts/gates/schema-enums` (sans
 * `.ts`) rend `argv[1]` sans extension : l'ancienne forme `/schema-enums\.ts$/` y sortait en 0
 * sans rien juger ni rien imprimer. Une copie nommée autrement, elle, ne s'exécute toujours pas.
 */
const LANCE_EN_SCRIPT = /[\\/]gates[\\/]schema-enums(\.ts)?$/.test(process.argv[1] ?? '');

if (LANCE_EN_SCRIPT) {
  if (process.argv.includes('--prove')) {
    const sansTemoin = NOMS_FAMILLES.filter((f) => !TEMOINS.some((t) => t.famille === f));
    if (sansTemoin.length > 0) {
      console.error(
        `❌ Famille(s) sans témoin : ${sansTemoin.join(', ')}. Une famille sans témoin n'est pas prouvée.`
      );
      process.exit(1);
    }
    for (const t of TEMOINS) {
      const rougies = controler(t.vue()).map((f) => f.famille);
      if (!rougies.includes(t.famille)) {
        console.error(
          `❌ Le témoin de « ${t.famille} » n'a PAS fait rougir sa famille (rougies : ${rougies.join(', ') || 'aucune'}).`
        );
        process.exit(1);
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const fautes = controler(c.vue());
      if (fautes.length > 0) {
        console.error(
          `❌ Faux positif sur « ${c.quoi} » : ${fautes[0]!.famille}. La garde est trop large.\n   ${fautes[0]!.message}`
        );
        process.exit(1);
      }
    }
    console.log(
      `✅ partners:schema:enums — Les ${FAMILLES.length} familles rougissent, ${CONTRE_TEMOINS.length} contre-témoins restent verts :`
    );
    for (const f of FAMILLES) console.log(`   • ${f.nom} — ${f.explication}`);
    process.exit(0);
  }

  if (!existsSync(CHEMIN_SCHEMA)) {
    console.error(
      `❌ partners:schema:enums — [perimetre_vide] ${CHEMIN_SCHEMA} est introuvable : la garde n'a rien lu, et ne prétend pas juger.`
    );
    process.exit(2);
  }

  const vue = vueDuDepot();
  const p = perimetreDeLaVue(vue);
  console.log(
    `partners:schema:enums — périmètre : ${p.modeles} modèle(s), ${p.champs} champ(s), ${p.enums} enum(s), ` +
      `${p.valeurs} valeur(s) ; ${p.fichiers} fichier(s) suivi(s) sous ${RACINES_CODE.map((r) => `${r}/`).join(', ')}, ` +
      `dont ${p.migrations} migration(s) ; ${p.indexOccupants} index d'attribution sur ${p.table}` +
      `${p.tablePresente ? '' : ', table absente des migrations'}.`
  );
  const fautes = controler(vue);
  if (fautes.length > 0) {
    console.error(`❌ partners:schema:enums — ${fautes.length} faute(s) de vocabulaire :\n`);
    fautes.slice(0, 25).forEach((f) => console.error(`   [${f.famille}] ${f.message}`));
    if (fautes.length > 25) console.error(`   … et ${fautes.length - 25} autre(s).`);
    process.exit(1);
  }
  console.log(
    `✅ partners:schema:enums — ${p.enums} enum(s), ${p.valeurs} valeur(s) confrontées au glossaire ; ` +
      `${p.champs} champ(s) de ${p.modeles} modèle(s) jugés ; ETATS_OCCUPANTS égale REQ-DM-003 ; ` +
      `aucune liste littérale d'états dans les ${p.fichiers} fichier(s) suivi(s), toute extension comprise.`
  );
  process.exit(0);
}
