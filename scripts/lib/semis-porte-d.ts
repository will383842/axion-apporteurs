/**
 * semis-porte-d.ts — le semeur du vidage N−1 de la porte D (REQ-QA-021).
 *
 * POURQUOI SEMER. Une migration additive passe TRIVIALEMENT sur une base vide : un
 * `ADD COLUMN … NOT NULL` sans défaut ne refuse rien quand la table n'a aucune ligne. Le vidage de
 * la version précédente porte donc une ligne par table, sinon la porte D rend un faux vert.
 *
 * CE QU'IL FAIT. Il lit le catalogue de la base N−1 (`REQUETE_SCHEMA`, jouée par `psql`) et en
 * dérive, table par table dans l'ordre des clés étrangères, une LISTE de candidats `INSERT … SELECT
 * … WHERE NOT EXISTS (SELECT 1 FROM la table)`. Joués à la suite sans arrêt sur erreur, le premier
 * candidat que la base accepte sème la table et les suivants sont inertes. Aucune table n'est
 * nommée ici : le semeur ne connaît que le catalogue, et une table ajoutée demain se sème sans
 * retouche.
 *
 * LES VALEURS. Une colonne à défaut est omise ; une colonne nullable vaut NULL ; une colonne
 * requise vaut la valeur de son type, sa première valeur d'enum, la clé d'une ligne de la table
 * qu'elle référence, ou une chaîne qui satisfait l'expression régulière de son CHECK. Les
 * candidats varient ensuite chaque enum sur ses valeurs et remplissent chaque colonne nullable :
 * c'est ce qui satisfait les CHECK couplés (« statut = x ⇔ colonne non nulle »).
 *
 * CE QU'IL NE VOIT PAS, et la porte le DIT au lieu de le taire : une table dont aucun candidat ne
 * passe reste vide, et `gate-d.sh` la nomme ; si la migration de la PR touche cette table, la porte
 * rougit (`table_touchee_non_semee`) au lieu de conclure sur une table vide.
 *
 * POURQUOI HORS DE `scripts/gates/`. Tout fichier de ce dossier est une garde inscrite au
 * registre ; une bibliothèque y rougirait `garde_hors_registre`.
 */

export type ColonneVue = {
  table: string;
  colonne: string;
  /** `format_type` du catalogue : `character(8)`, `timestamp(3) with time zone`, `"statut"`… */
  type: string;
  nonNul: boolean;
  defaut: boolean;
  /** Les valeurs de l'enum, dans l'ordre du type ; `null` hors enum. */
  valeurs: string[] | null;
};
export type ContrainteVue = {
  table: string;
  genre: 'c' | 'f';
  definition: string;
  colonnes: string[];
  cible: string | null;
  colonnesCibles: string[] | null;
};
export type SchemaVu = { colonnes: ColonneVue[]; contraintes: ContrainteVue[] };
export type Semis = { tables: string[]; candidats: number; sql: string };

/** Le catalogue du schéma `public`, en UN objet JSON, hors table de Prisma. */
export const REQUETE_SCHEMA = `SELECT json_build_object(
 'colonnes', COALESCE((SELECT json_agg(json_build_object('table', c.relname, 'colonne', a.attname,
   'type', format_type(a.atttypid, a.atttypmod), 'nonNul', a.attnotnull,
   'defaut', ad.adbin IS NOT NULL OR a.attidentity <> '' OR a.attgenerated <> '',
   'valeurs', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = a.atttypid))
   ORDER BY c.relname, a.attnum)
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    AND c.relname <> '_prisma_migrations'), '[]'::json),
 'contraintes', COALESCE((SELECT json_agg(json_build_object('table', c.relname, 'genre', k.contype,
   'definition', pg_get_constraintdef(k.oid),
   'colonnes', (SELECT json_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)),
   'cible', f.relname,
   'colonnesCibles', (SELECT json_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = k.confrelid AND a.attnum = ANY (k.confkey)))
   ORDER BY c.relname, k.conname)
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_class f ON f.oid = k.confrelid
  WHERE n.nspname = 'public' AND k.contype IN ('c', 'f')), '[]'::json));`;

/** L'instant des horodatages semés ; une colonne d'échéance vaut un jour de plus (`expire_at > cree_at`). */
const INSTANT = '2026-01-01 00:00:00+00';
const ECHEANCE = '2026-01-02 00:00:00+00';
const NOM_D_ECHEANCE = /expire|fin|echeance|jusqu/;
/** Borne des candidats d'une table : au-delà, la table se déclare non semée plutôt que d'exploser. */
const CANDIDATS_MAX = 400;

const ident = (n: string): string => `"${n.replace(/"/g, '""')}"`;
const litteral = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/**
 * Une chaîne qui satisfait une expression régulière SIMPLE : littéraux, échappements, classes et
 * quantificateurs. Un groupe ou une alternative rend `null` : la colonne prend alors sa valeur de
 * type, et si le CHECK la refuse, la table se déclare non semée. Le RANG choisit un autre caractère
 * de chaque classe (SEC-45) : deux colonnes au même motif d'une même ligne reçoivent ainsi deux
 * valeurs distinctes, ce qu'exige un CHECK comme `jeton_oui_hash <> jeton_non_hash`.
 */
export function chaineQuiSatisfait(motif: string, rang = 0): string | null {
  let sortie = '';
  let i = 0;
  const premierDeClasse = (corps: string): string => {
    const nie = corps.startsWith('^');
    const c = nie ? corps.slice(1) : corps;
    if (!nie) {
      const possibles = caracteresDeClasse(c);
      return possibles.length === 0 ? 'a' : possibles[rang % possibles.length]!;
    }
    return [...'abcdefghijklmnopqrstuvwxyz0123456789'].find((x) => !c.includes(x)) ?? 'z';
  };
  while (i < motif.length) {
    const car = motif[i]!;
    let atome: string;
    if (car === '^' || car === '$') {
      i++;
      continue;
    } else if (car === '(' || car === ')' || car === '|') {
      return null;
    } else if (car === '[') {
      const fin = motif.indexOf(']', i + 2);
      if (fin < 0) return null;
      atome = premierDeClasse(motif.slice(i + 1, fin));
      i = fin + 1;
    } else if (car === '\\') {
      const e = motif[i + 1] ?? '';
      atome = e === 'd' ? String(rang % 10) : e === 'w' ? 'a' : e === 's' ? ' ' : e;
      i += 2;
    } else if (car === '.') {
      atome = 'a';
      i++;
    } else {
      atome = car;
      i++;
    }
    const q = /^(?:\{(\d+)(?:,\d*)?\}|[*?+])/.exec(motif.slice(i));
    let fois = 1;
    if (q !== null) {
      fois = q[1] !== undefined ? Number(q[1]) : q[0] === '+' ? 1 : 0;
      i += q[0].length;
    }
    sortie += atome.repeat(fois);
  }
  return sortie;
}

/** Les caractères d'une classe non niée, plages comprises (`0-9a-f`) ; `\d` vaut ses dix chiffres. */
function caracteresDeClasse(corps: string): string[] {
  const sortie: string[] = [];
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i]!;
    if (c === '\\') {
      const e = corps[i + 1] ?? '';
      sortie.push(...(e === 'd' ? [...'0123456789'] : [e]));
      i++;
    } else if (corps[i + 1] === '-' && i + 2 < corps.length) {
      for (let k = c.charCodeAt(0); k <= corps.charCodeAt(i + 2); k++) {
        sortie.push(String.fromCharCode(k));
      }
      i += 2;
    } else {
      sortie.push(c);
    }
  }
  return sortie;
}

/** Les motifs `colonne ~ '…'` des CHECK d'une table, par colonne : le premier l'emporte. */
function motifsDesChecks(contraintes: ContrainteVue[]): Map<string, string> {
  const motifs = new Map<string, string>();
  const forme = /\(?"?([A-Za-z_][A-Za-z0-9_]*)"?\)?(?:::[\w ]+?)?\s+~\s+'((?:[^']|'')*)'/g;
  for (const k of contraintes) {
    if (k.genre !== 'c') continue;
    for (const m of k.definition.matchAll(forme)) {
      if (!motifs.has(m[1]!)) motifs.set(m[1]!, m[2]!.replace(/''/g, "'"));
    }
  }
  return motifs;
}

/**
 * Les colonnes que des CHECK LIENT (DM-07, DM-53) : `(a IS NULL) = (b IS NULL)` dit que a et b
 * sont présentes ensemble ou absentes ensemble, `(a IS NULL) = (b IS NOT NULL)` que l'une l'est sans
 * l'autre ; `num_nonnulls(a, b, …) = 1` dit qu'une seule
 * l'est. Lus dans la définition que rend le catalogue, jamais dans un nom de table.
 */
function liensDesChecks(contraintes: ContrainteVue[]): {
  ensemble: Map<string, Set<string>>;
  exclusives: Map<string, Set<string>>;
} {
  const ensemble = new Map<string, Set<string>>();
  const exclusives = new Map<string, Set<string>>();
  const lier = (m: Map<string, Set<string>>, a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  // Les deux polarités sont LUES (DM-53) : `(a IS NULL) = (b IS NULL)` et `(a IS NOT NULL) = (b IS NOT
  // NULL)` lient a et b ENSEMBLE ; `(a IS NULL) = (b IS NOT NULL)` dit que l'une est remplie sans
  // l'autre — une EXCLUSION, que `fermeture` ne franchit pas.
  const paire =
    /\(\(?"?([A-Za-z_]\w*)"? IS (NOT )?NULL\)?\s*=\s*\(?"?([A-Za-z_]\w*)"? IS (NOT )?NULL\)/g;
  const unSeul = /num_nonnulls\(([^)]*)\)\s*=\s*1\b/g;
  for (const k of contraintes) {
    if (k.genre !== 'c') continue;
    for (const m of k.definition.matchAll(paire)) {
      const [, a, nonA, b, nonB] = m;
      const lien = (nonA === undefined) === (nonB === undefined) ? ensemble : exclusives;
      lier(lien, a!, b!);
      lier(lien, b!, a!);
    }
    for (const m of k.definition.matchAll(unSeul)) {
      const membres = m[1]!.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      for (const a of membres) for (const b of membres) if (a !== b) lier(exclusives, a, b);
    }
  }
  return { ensemble, exclusives };
}

/** La colonne et celles que les CHECK lui lient, transitivement, sans franchir une exclusion. */
function fermeture(
  c: string,
  liens: ReturnType<typeof liensDesChecks>,
  nullables: Set<string>
): string[] {
  const interdites = liens.exclusives.get(c) ?? new Set<string>();
  const vues = new Set([c]);
  const pile = [c];
  while (pile.length > 0) {
    for (const v of liens.ensemble.get(pile.pop()!) ?? []) {
      if (!vues.has(v) && nullables.has(v) && !interdites.has(v)) {
        vues.add(v);
        pile.push(v);
      }
    }
  }
  return [...vues];
}

/** La valeur SQL d'une colonne remplie, hors enum et hors clé étrangère. */
function valeurDeType(c: ColonneVue, motif: string | undefined, rang = 0): string {
  const t = c.type.toLowerCase();
  const typee = (v: string): string => `CAST(${litteral(v)} AS ${c.type})`;
  if (t.endsWith('[]')) return typee('{}');
  if (motif !== undefined) {
    const v = chaineQuiSatisfait(motif, rang);
    if (v !== null) return typee(v);
  }
  if (/^(smallint|integer|bigint|numeric|real|double precision)/.test(t)) return typee('1');
  if (t === 'boolean') return 'false';
  if (t === 'uuid') return typee('00000000-0000-4000-8000-000000000001');
  if (t === 'json' || t === 'jsonb') return typee('{}');
  if (t === 'bytea') return typee('\\x00');
  if (t === 'inet' || t === 'cidr') return typee('127.0.0.1');
  if (t === 'date' || t.startsWith('timestamp')) {
    return typee(NOM_D_ECHEANCE.test(c.colonne) ? ECHEANCE : INSTANT);
  }
  const longueur = /\((\d+)\)/.exec(t);
  return typee('porte-d'.slice(0, longueur === null ? undefined : Number(longueur[1])));
}

/**
 * Les tables dans l'ordre des clés étrangères : une table référencée se sème avant qui la référence.
 * TOUTE clé ordonne : une table aux seules clés nullables (attributions, son porteur exclusif) doit
 * trouver ses cibles déjà semées, sinon ses sous-requêtes rendent NULL et ses CHECK la refusent (CI de
 * cdab3adb, REQ-QA-023). Seule la RUPTURE d'un cycle ignore les clés NULLABLES — une clé n'est
 * obligatoire que si TOUTES ses colonnes le sont, car sous MATCH SIMPLE une colonne NULL suspend son
 * contrôle : deux tables liées dans les deux sens, l'une par une clé nullable (SEC-15 :
 * `apporteurs.gel_anomalie_id` vers `anomalies`, qui référence `apporteurs`), se sèment dans l'ordre
 * de la clé obligatoire. L'ordre alphabétique ne rompt plus qu'un cycle de clés toutes obligatoires.
 */
function ordreDesTables(schema: SchemaVu): string[] {
  const tables = [...new Set(schema.colonnes.map((c) => c.table))].sort();
  /** Pour chaque table, ses cibles : vrai si l'une de ses clés vers elle est obligatoire. */
  const dependances = new Map(tables.map((t) => [t, new Map<string, boolean>()]));
  const obligatoire = (table: string, colonne: string): boolean =>
    schema.colonnes.some((c) => c.table === table && c.colonne === colonne && c.nonNul);
  for (const k of schema.contraintes) {
    if (k.genre !== 'f' || k.cible === null || k.cible === k.table || !dependances.has(k.cible)) {
      continue;
    }
    const deps = dependances.get(k.table);
    if (deps === undefined) continue;
    const toutesObligatoires = k.colonnes.every((c) => obligatoire(k.table, c));
    deps.set(k.cible, (deps.get(k.cible) ?? false) || toutesObligatoires);
  }
  const ordre: string[] = [];
  const restantes = new Set(tables);
  const pretes = (seulesObligatoires: boolean): string[] =>
    [...restantes].filter((t) =>
      [...dependances.get(t)!].every(
        ([cible, oblig]) => !restantes.has(cible) || (seulesObligatoires && !oblig)
      )
    );
  while (restantes.size > 0) {
    let lot = pretes(false);
    // Un cycle : il se rompt d'abord par ses clés NULLABLES, qui peuvent rester NULL — UNE table à
    // la fois, la plus ATTENDUE (celle dont le plus de tables restantes dépendent par une clé
    // obligatoire), pour qu'une table aux seules clés nullables ne parte pas avec elle, trop tôt.
    if (lot.length === 0) {
      const attendue = (t: string): number =>
        [...restantes].filter((r) => dependances.get(r)!.get(t) === true).length;
      const [premiere] = pretes(true).sort(
        (x, y) => attendue(y) - attendue(x) || x.localeCompare(y)
      );
      lot = premiere === undefined ? [] : [premiere];
    }
    // Un cycle de clés toutes obligatoires : l'ordre alphabétique, et la base dira laquelle refuse.
    if (lot.length === 0) lot = [...restantes];
    for (const t of lot) {
      ordre.push(t);
      restantes.delete(t);
    }
  }
  return ordre;
}

/** Les candidats d'une table : chaque variante d'enum croisée avec chaque remplissage nullable. */
function candidatsDe(table: string, schema: SchemaVu): string[] {
  const colonnes = schema.colonnes.filter((c) => c.table === table);
  const contraintes = schema.contraintes.filter((k) => k.table === table);
  const motifs = motifsDesChecks(contraintes);
  const cle = new Map<string, string>();
  for (const k of contraintes) {
    if (k.genre !== 'f' || k.cible === null || k.colonnes.length !== k.colonnesCibles?.length) {
      continue;
    }
    k.colonnes.forEach((c, n) =>
      cle.set(c, `(SELECT ${ident(k.colonnesCibles![n]!)} FROM ${ident(k.cible!)} LIMIT 1)`)
    );
  }
  const ecrites = colonnes.filter((c) => !c.defaut);
  const retenues = ecrites.length > 0 ? ecrites : colonnes.slice(0, 1);
  // Le rang de chaque colonne parmi celles de la ligne qui partagent son motif : deux empreintes au
  // même motif reçoivent deux valeurs distinctes (SEC-45, `jeton_oui_hash <> jeton_non_hash`).
  const rangDuMotif = new Map<string, number>();
  const vus = new Map<string, number>();
  for (const c of retenues) {
    const m = motifs.get(c.colonne);
    if (m === undefined) continue;
    rangDuMotif.set(c.colonne, vus.get(m) ?? 0);
    vus.set(m, (vus.get(m) ?? 0) + 1);
  }
  const remplie = (c: ColonneVue, rang = 0): string =>
    cle.get(c.colonne) ??
    (c.valeurs !== null && c.valeurs.length > 0
      ? `CAST(${litteral(c.valeurs[rang % c.valeurs.length]!)} AS ${c.type})`
      : valeurDeType(c, motifs.get(c.colonne), rangDuMotif.get(c.colonne) ?? 0));
  const base = new Map(retenues.map((c) => [c.colonne, c.nonNul ? remplie(c) : 'NULL']));
  const variantesEnum: Map<string, string>[] = [base];
  for (const c of retenues) {
    if (c.valeurs === null || cle.has(c.colonne)) continue;
    for (let r = c.nonNul ? 1 : 0; r < c.valeurs.length; r++) {
      variantesEnum.push(new Map(base).set(c.colonne, remplie(c, r)));
    }
  }
  const nullables = retenues.filter((c) => !c.nonNul);
  // Chaque nullable est remplie AVEC celles que les CHECK lui lient, jamais avec une exclusive
  // (DM-07 : porteur exclusif, grille si et seulement si apporteur, bloc et empreinte ensemble).
  const liens = liensDesChecks(contraintes);
  const nomsNullables = new Set(nullables.map((c) => c.colonne));
  const parNom = new Map(nullables.map((c) => [c.colonne, c]));
  const fermees = nullables.map((c) =>
    fermeture(c.colonne, liens, nomsNullables).map((n) => parNom.get(n)!)
  );
  const remplissages: ColonneVue[][] = [[], ...fermees, nullables];
  const sortie: string[] = [];
  const noms = retenues.map((c) => ident(c.colonne)).join(', ');
  const candidat = (v: Map<string, string>, r: readonly ColonneVue[]): boolean => {
    const ligne = new Map(v);
    for (const c of r) if (ligne.get(c.colonne) === 'NULL') ligne.set(c.colonne, remplie(c));
    const valeurs = retenues.map((c) => ligne.get(c.colonne)!).join(', ');
    const sql =
      `INSERT INTO ${ident(table)} (${noms}) SELECT ${valeurs} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM ${ident(table)});`;
    if (!sortie.includes(sql)) sortie.push(sql);
    return sortie.length >= CANDIDATS_MAX;
  };
  for (const v of variantesEnum) {
    for (const r of remplissages) if (candidat(v, r)) return sortie;
  }
  // SECONDE PASSE, APRÈS toutes les autres (tables de #556) : DEUX groupes de nullables remplis ENSEMBLE,
  // l'union de deux fermetures. Un CHECK comme « exactement un porteur » (lu sous une forme que
  // `liensDesChecks` ne reconnaît pas, `num_nonnulls(…) = CASE … END`) et un autre comme « l'empreinte
  // ou sa purge » exigent un membre de CHACUN : aucun candidat d'une seule fermeture ne les tient.
  // Venue après, elle ne change pas le candidat qui sème déjà une table. Deux fermetures qu'une
  // exclusion CONNUE sépare ne sont jamais unies.
  for (const v of variantesEnum) {
    for (let a = 0; a < fermees.length; a++) {
      const interdites = new Set(
        fermees[a]!.flatMap((c) => [...(liens.exclusives.get(c.colonne) ?? [])])
      );
      for (let b = a + 1; b < fermees.length; b++) {
        if (fermees[b]!.some((c) => interdites.has(c.colonne))) continue;
        const union = [
          ...new Map([...fermees[a]!, ...fermees[b]!].map((c) => [c.colonne, c])).values(),
        ];
        if (candidat(v, union)) return sortie;
      }
    }
  }
  return sortie;
}

/** Le script de semis du schéma lu : à jouer par `psql` SANS arrêt sur erreur. */
export function semis(schema: SchemaVu): Semis {
  const tables = ordreDesTables(schema);
  const lignes: string[] = [];
  for (const t of tables) lignes.push(`-- ${t}`, ...candidatsDe(t, schema));
  return {
    tables,
    candidats: lignes.filter((l) => l.startsWith('INSERT')).length,
    sql: `${lignes.join('\n')}\n`,
  };
}
