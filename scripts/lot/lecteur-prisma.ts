/**
 * lecteur-prisma.ts — LE lecteur du schéma Prisma et du SQL des migrations (DM-02).
 *
 * POURQUOI UN LECTEUR, ET POURQUOI UN SEUL. Les gardes de schéma découpaient un modèle par
 * `/model\s+(\w+)\s*\{([^}]*)\}/` : la PREMIÈRE `}` fermait le modèle, même dans un commentaire
 * `// }` ou une chaîne `@default("}")`, et tous les champs suivants échappaient au contrôle — un
 * échec OUVERT, vert sur ce qu'il n'avait pas lu. Chaque garde qui relit le schéma à sa façon
 * refait ce défaut à sa façon (RM-01) : il n'y a donc qu'un lecteur, et les gardes l'importent.
 *
 * CE QU'IL FAIT. Il retire commentaires et littéraux EN PRÉSERVANT les numéros de ligne, puis ferme
 * chaque bloc sur SON accolade (profondeur). Tout ce qu'il ne sait pas lire, il le REFUSE en
 * nommant la ligne (`ErreurLecturePrisma`) : accolade non appariée, chaîne non terminée, ligne de
 * modèle qui n'est ni un champ ni un attribut de bloc. Jamais « 0 modèle, vert ».
 *
 * POURQUOI IL N'EST PAS SOUS `scripts/gates/`. Tout fichier suivi de ce dossier doit être une garde
 * inscrite au registre : une bibliothèque y rougirait `garde_hors_registre`.
 *
 * AUCUNE DÉPENDANCE. `Prisma.dmmf` ne voit ni les commentaires ni le SQL brut des migrations — et
 * c'est précisément ce que les gardes jugent.
 */

/** Le texte ne se lit pas : la garde qui l'appelle ne rend pas de verdict sur lui. */
export class ErreurLecturePrisma extends Error {
  readonly ligne: number;
  constructor(ligne: number, motif: string) {
    super(`ligne ${ligne} — ${motif}`);
    this.name = 'ErreurLecturePrisma';
    this.ligne = ligne;
  }
}

export type ChampPrisma = {
  nom: string;
  /** La valeur de `@map("…")` si présente, sinon le nom. */
  colonne: string;
  /** Le type tel qu'écrit, argument compris (`Unsupported("numeric")`), sans `[]` ni `?`. */
  type: string;
  optionnel: boolean;
  liste: boolean;
  /** Les attributs de champ, tels qu'écrits : `@id`, `@map("x")`, `@db.Uuid`… */
  attributs: string[];
  ligne: number;
};

export type ModelePrisma = {
  nom: string;
  /** La valeur de `@@map("…")` si présente, sinon le nom. */
  table: string;
  ligne: number;
  champs: ChampPrisma[];
};

export type EnumPrisma = {
  nom: string;
  /** La valeur de `@@map("…")` si présente, sinon le nom. */
  typeSql: string;
  valeurs: string[];
  ligne: number;
};

export type SchemaPrisma = { modeles: ModelePrisma[]; enums: EnumPrisma[] };

// ── positions et lignes ──────────────────────────────────────────────────────

const LF = '\n';

/** Le numéro de ligne (base 1) d'une position : on compte les LF qui la précèdent. */
function ligneA(texte: string, position: number): number {
  let n = 1;
  for (let i = 0; i < position && i < texte.length; i++) if (texte[i] === LF) n++;
  return n;
}

// ── le masquage Prisma ───────────────────────────────────────────────────────

/**
 * Deux vues du schéma, de même longueur et de mêmes lignes que l'original :
 *   — `sansCommentaires` : commentaires (`//`, `///`) blanchis, chaînes conservées ;
 *   — `neutre` : commentaires ET chaînes blanchis — la vue sur laquelle on lit la STRUCTURE.
 * Une chaîne Prisma ne franchit pas une ligne : elle lève si elle n'est pas fermée avant.
 */
export function masquerPrisma(texte: string): { sansCommentaires: string; neutre: string } {
  let sansCommentaires = '';
  let neutre = '';
  let i = 0;
  while (i < texte.length) {
    const c = texte[i]!;
    if (c === '/' && texte[i + 1] === '/') {
      while (i < texte.length && texte[i] !== LF) {
        sansCommentaires += ' ';
        neutre += ' ';
        i++;
      }
      continue;
    }
    if (c === '"') {
      const debut = i;
      sansCommentaires += c;
      neutre += ' ';
      i++;
      let ferme = false;
      while (i < texte.length) {
        const d = texte[i]!;
        if (d === LF) break;
        if (d === '\\' && i + 1 < texte.length && texte[i + 1] !== LF) {
          sansCommentaires += d + texte[i + 1]!;
          neutre += '  ';
          i += 2;
          continue;
        }
        sansCommentaires += d;
        neutre += ' ';
        i++;
        if (d === '"') {
          ferme = true;
          break;
        }
      }
      if (!ferme) throw new ErreurLecturePrisma(ligneA(texte, debut), 'chaîne non terminée');
      continue;
    }
    sansCommentaires += c;
    neutre += c;
    i++;
  }
  return { sansCommentaires, neutre };
}

/** La première chaîne `"…"` d'un texte, déséchappée ; `undefined` s'il n'y en a pas. */
function premiereChaine(texte: string): string | undefined {
  const m = /"((?:[^"\\]|\\.)*)"/.exec(texte);
  return m ? m[1]!.replace(/\\(.)/g, '$1') : undefined;
}

// ── les blocs ────────────────────────────────────────────────────────────────

type Bloc = { genre: string; nom: string; ligne: number; ouvre: number; ferme: number };

const EN_TETE = /^\s*(model|enum|view|type|generator|datasource)\s+([A-Za-z_]\w*)\s*$/;

/**
 * Les blocs de premier niveau, chacun fermé sur SON accolade. Tout texte hors bloc qui n'est pas
 * l'en-tête du bloc suivant est refusé : un champ égaré entre deux modèles ne serait jugé par personne.
 */
function blocs(texte: string, neutre: string): Bloc[] {
  const sortie: Bloc[] = [];
  let profondeur = 0;
  let finPrecedente = 0;
  let courant: { genre: string; nom: string; ligne: number; ouvre: number } | undefined;
  for (let i = 0; i < neutre.length; i++) {
    const c = neutre[i]!;
    if (c === '{') {
      if (profondeur === 0) {
        const entete = neutre.slice(finPrecedente, i);
        const m = EN_TETE.exec(entete);
        if (!m) {
          const decalage = entete.search(/\S/);
          throw new ErreurLecturePrisma(
            ligneA(texte, decalage === -1 ? i : finPrecedente + decalage),
            'accolade ouvrante sans en-tête de bloc reconnu (model, enum, view, type, generator, datasource)'
          );
        }
        const debutMot = finPrecedente + entete.indexOf(m[1]!);
        courant = { genre: m[1]!, nom: m[2]!, ligne: ligneA(texte, debutMot), ouvre: i };
      }
      profondeur++;
    } else if (c === '}') {
      if (profondeur === 0) {
        throw new ErreurLecturePrisma(ligneA(texte, i), 'accolade fermante sans ouvrante');
      }
      profondeur--;
      if (profondeur === 0) {
        sortie.push({ ...courant!, ferme: i });
        courant = undefined;
        finPrecedente = i + 1;
      }
    }
  }
  if (profondeur > 0) {
    throw new ErreurLecturePrisma(
      ligneA(texte, courant!.ouvre),
      `accolade ouvrante du bloc « ${courant!.nom} » jamais fermée`
    );
  }
  const reste = neutre.slice(finPrecedente);
  const decalage = reste.search(/\S/);
  if (decalage !== -1) {
    throw new ErreurLecturePrisma(
      ligneA(texte, finPrecedente + decalage),
      'texte hors de tout bloc : il ne serait jugé par personne'
    );
  }
  return sortie;
}

/**
 * Les LIGNES LOGIQUES d'un corps de bloc : coupées sur LF hors parenthèses et crochets, pour qu'un
 * attribut écrit sur plusieurs lignes (`@@index([\n a,\n b\n])`) reste une seule ligne.
 */
function lignesLogiques(
  texte: string,
  neutre: string,
  sansCommentaires: string,
  debut: number,
  fin: number
): { neutre: string; brut: string; ligne: number }[] {
  const sortie: { neutre: string; brut: string; ligne: number }[] = [];
  let profondeur = 0;
  let depart = debut;
  const pousser = (jusqua: number): void => {
    const n = neutre.slice(depart, jusqua);
    const decalage = n.search(/\S/);
    if (decalage !== -1) {
      sortie.push({
        neutre: n.trim(),
        brut: sansCommentaires.slice(depart + decalage, jusqua).trim(),
        ligne: ligneA(texte, depart + decalage),
      });
    }
  };
  for (let i = debut; i < fin; i++) {
    const c = neutre[i]!;
    if (c === '(' || c === '[' || c === '{') profondeur++;
    else if (c === ')' || c === ']' || c === '}') profondeur = Math.max(0, profondeur - 1);
    else if (c === LF && profondeur === 0) {
      pousser(i);
      depart = i + 1;
    }
  }
  pousser(fin);
  return sortie;
}

/**
 * Les attributs d'une fin de ligne (`@id @map("x") @db.Uuid`), lus sur la vue neutre pour la
 * structure et rendus depuis la vue brute. Lève si autre chose qu'un attribut s'y trouve.
 */
function attributs(neutre: string, brut: string, ligne: number, ou: string): string[] {
  const sortie: string[] = [];
  let i = 0;
  while (i < neutre.length) {
    if (/\s/.test(neutre[i]!)) {
      i++;
      continue;
    }
    const m = /^@@?[A-Za-z_][\w.]*/.exec(neutre.slice(i));
    if (!m) {
      throw new ErreurLecturePrisma(
        ligne,
        `${ou} : « ${brut.slice(i).trim()} » n'est ni un type ni un attribut — la ligne ne se lit pas`
      );
    }
    let j = i + m[0].length;
    if (neutre[j] === '(') {
      let profondeur = 0;
      for (; j < neutre.length; j++) {
        if (neutre[j] === '(') profondeur++;
        else if (neutre[j] === ')' && --profondeur === 0) break;
      }
      j++;
    }
    sortie.push(brut.slice(i, j));
    i = j;
  }
  return sortie;
}

const CHAMP = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)/;

function lireChamp(
  l: { neutre: string; brut: string; ligne: number },
  modele: string
): ChampPrisma {
  const m = CHAMP.exec(l.neutre);
  if (!m) {
    throw new ErreurLecturePrisma(
      l.ligne,
      `modèle « ${modele} » : « ${l.brut} » n'est ni un champ ni un attribut de bloc`
    );
  }
  let j = m[0].length;
  let type = m[2]!;
  if (l.neutre[j] === '(') {
    const fin = l.neutre.indexOf(')', j);
    if (fin === -1) {
      throw new ErreurLecturePrisma(
        l.ligne,
        `modèle « ${modele} » : type « ${m[2]}( » jamais fermé`
      );
    }
    type += l.brut.slice(j, fin + 1);
    j = fin + 1;
  }
  let liste = false;
  let optionnel = false;
  if (l.neutre.startsWith('[]', j)) {
    liste = true;
    j += 2;
  }
  if (l.neutre[j] === '?') {
    optionnel = true;
    j++;
  }
  const attrs = attributs(
    l.neutre.slice(j),
    l.brut.slice(j),
    l.ligne,
    `modèle « ${modele} », champ « ${m[1]} »`
  );
  const map = attrs.find((a) => a.startsWith('@map('));
  return {
    nom: m[1]!,
    colonne: (map && premiereChaine(map)) ?? m[1]!,
    type,
    optionnel,
    liste,
    attributs: attrs,
    ligne: l.ligne,
  };
}

/**
 * Le schéma LU. Lève `ErreurLecturePrisma` en nommant la ligne sur tout ce qu'il ne sait pas lire.
 * `view` et `type` (types composites) se lisent comme des modèles : leurs champs sont jugés aussi.
 */
export function lireSchemaPrisma(texte: string): SchemaPrisma {
  const { sansCommentaires, neutre } = masquerPrisma(texte);
  const modeles: ModelePrisma[] = [];
  const enums: EnumPrisma[] = [];
  for (const b of blocs(texte, neutre)) {
    if (b.genre === 'generator' || b.genre === 'datasource') continue;
    const lignes = lignesLogiques(texte, neutre, sansCommentaires, b.ouvre + 1, b.ferme);
    const blocMap = (l: { neutre: string; brut: string }): string | undefined =>
      l.neutre.startsWith('@@map') ? premiereChaine(l.brut) : undefined;
    if (b.genre === 'enum') {
      const valeurs: string[] = [];
      let typeSql = b.nom;
      for (const l of lignes) {
        if (l.neutre.startsWith('@@')) {
          attributs(l.neutre, l.brut, l.ligne, `enum « ${b.nom} »`);
          typeSql = blocMap(l) ?? typeSql;
          continue;
        }
        const v = /^[A-Za-z_]\w*/.exec(l.neutre);
        if (!v) {
          throw new ErreurLecturePrisma(
            l.ligne,
            `enum « ${b.nom} » : « ${l.brut} » n'est pas une valeur`
          );
        }
        attributs(
          l.neutre.slice(v[0].length),
          l.brut.slice(v[0].length),
          l.ligne,
          `enum « ${b.nom} », valeur « ${v[0]} »`
        );
        valeurs.push(v[0]);
      }
      enums.push({ nom: b.nom, typeSql, valeurs, ligne: b.ligne });
      continue;
    }
    const champs: ChampPrisma[] = [];
    let table = b.nom;
    for (const l of lignes) {
      if (l.neutre.startsWith('@@')) {
        attributs(l.neutre, l.brut, l.ligne, `modèle « ${b.nom} »`);
        table = blocMap(l) ?? table;
        continue;
      }
      champs.push(lireChamp(l, b.nom));
    }
    modeles.push({ nom: b.nom, table, ligne: b.ligne, champs });
  }
  return { modeles, enums };
}

// ── le SQL des migrations ────────────────────────────────────────────────────

export type JetonSql = {
  /**
   * `mot` : mot-clé ou identifiant nu ; `identifiant` : `"…"` ; `litteral` : `'…'` ;
   * `corps` : `$tag$…$tag$` ; `nombre` ; `symbole`.
   */
  type: 'mot' | 'identifiant' | 'litteral' | 'corps' | 'nombre' | 'symbole';
  /** Le contenu : déséchappé pour un identifiant ou un littéral, intérieur du corps pour un `$$`. */
  valeur: string;
  ligne: number;
};

export type InstructionSql = { ligne: number; jetons: JetonSql[]; texte: string };

const SYMBOLES_DOUBLES = ['::', '<>', '!=', '>=', '<=', '||', '->'];

/**
 * Les instructions d'une migration. Commentaires `--` et `/* … *\/` (IMBRIQUÉS, comme en
 * PostgreSQL) retirés ; littéraux `'…'` (avec `''`), `E'…'` (avec `\\`), identifiants `"…"` (avec
 * `""`) et corps `$tag$…$tag$` reconnus comme tels — leurs mots ne comptent pas comme du SQL ; découpe
 * sur `;` hors littéraux. Lève en nommant la ligne sur un littéral, un corps ou un commentaire non
 * terminé. `ligneDeDepart` sert à relire un corps en gardant les lignes du fichier.
 */
export function lireMigrationSql(texte: string, ligneDeDepart = 1): InstructionSql[] {
  const instructions: InstructionSql[] = [];
  let jetons: JetonSql[] = [];
  let debutInstruction = -1;
  let ligne = ligneDeDepart;
  let i = 0;
  const avancer = (jusqua: number): void => {
    for (; i < jusqua; i++) if (texte[i] === LF) ligne++;
  };
  const clore = (fin: number): void => {
    if (jetons.length > 0) {
      instructions.push({
        ligne: jetons[0]!.ligne,
        jetons,
        texte: texte.slice(debutInstruction, fin).trim(),
      });
    }
    jetons = [];
    debutInstruction = -1;
  };
  const pousser = (type: JetonSql['type'], valeur: string, debut: number, fin: number): void => {
    if (debutInstruction === -1) debutInstruction = debut;
    jetons.push({ type, valeur, ligne });
    avancer(fin);
  };
  while (i < texte.length) {
    const c = texte[i]!;
    const reste = texte.slice(i, i + 2);
    if (/\s/.test(c)) {
      avancer(i + 1);
      continue;
    }
    if (reste === '--') {
      const fin = texte.indexOf(LF, i);
      avancer(fin === -1 ? texte.length : fin);
      continue;
    }
    if (reste === '/*') {
      const debut = ligne;
      let profondeur = 0;
      let j = i;
      for (; j < texte.length; j++) {
        if (texte.startsWith('/*', j)) {
          profondeur++;
          j++;
        } else if (texte.startsWith('*/', j)) {
          profondeur--;
          j++;
          if (profondeur === 0) break;
        }
      }
      if (profondeur > 0) throw new ErreurLecturePrisma(debut, 'commentaire /* non terminé');
      avancer(j + 1);
      continue;
    }
    if (c === ';') {
      clore(i);
      avancer(i + 1);
      continue;
    }
    const echappe = (c === 'E' || c === 'e') && texte[i + 1] === "'";
    if (c === "'" || echappe) {
      const debut = i;
      let j = echappe ? i + 2 : i + 1;
      let valeur = '';
      let ferme = false;
      while (j < texte.length) {
        const d = texte[j]!;
        if (echappe && d === '\\' && j + 1 < texte.length) {
          valeur += texte[j + 1]!;
          j += 2;
          continue;
        }
        if (d === "'") {
          if (texte[j + 1] === "'") {
            valeur += "'";
            j += 2;
            continue;
          }
          ferme = true;
          j++;
          break;
        }
        valeur += d;
        j++;
      }
      if (!ferme) throw new ErreurLecturePrisma(ligne, "littéral '…' non terminé");
      pousser('litteral', valeur, debut, j);
      continue;
    }
    if (c === '"') {
      const debut = i;
      let j = i + 1;
      let valeur = '';
      let ferme = false;
      while (j < texte.length) {
        if (texte[j] === '"') {
          if (texte[j + 1] === '"') {
            valeur += '"';
            j += 2;
            continue;
          }
          ferme = true;
          j++;
          break;
        }
        valeur += texte[j]!;
        j++;
      }
      if (!ferme) throw new ErreurLecturePrisma(ligne, 'identifiant "…" non terminé');
      pousser('identifiant', valeur, debut, j);
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texte.slice(i, i + 80));
    if (dollar) {
      const balise = dollar[0];
      const fin = texte.indexOf(balise, i + balise.length);
      if (fin === -1) throw new ErreurLecturePrisma(ligne, `corps ${balise}…${balise} non terminé`);
      pousser('corps', texte.slice(i + balise.length, fin), i, fin + balise.length);
      continue;
    }
    const motSql = /^[A-Za-z_\u0080-￿][\w$\u0080-￿]*/.exec(texte.slice(i, i + 256));
    if (motSql) {
      pousser('mot', motSql[0], i, i + motSql[0].length);
      continue;
    }
    const nombre = /^\d+(?:\.\d+)?/.exec(texte.slice(i, i + 64));
    if (nombre) {
      pousser('nombre', nombre[0], i, i + nombre[0].length);
      continue;
    }
    const double = SYMBOLES_DOUBLES.find((s) => texte.startsWith(s, i));
    pousser('symbole', double ?? c, i, i + (double ?? c).length);
  }
  clore(texte.length);
  return instructions;
}
