/**
 * `gabarit.ts` — la LECTURE du gabarit de contrat (JUR-T01, REQ-JUR-003).
 *
 * Le gabarit public `docs/contrat/CONTRAT-APPORTEUR-V1.md` est un texte figé (décision `W11`). Ce
 * module ne le rédige pas : il le découpe, pour que les gardes et le refus de publication jugent
 * des UNITÉS (article, sous-article, alinéa, note encadrée, ligne de tableau) plutôt que des
 * sous-chaînes perdues dans soixante-dix kilo-octets.
 *
 * PUR (docs/CONVENTIONS.md §3) : le texte arrive en argument, rien n'est lu ici.
 *
 * LES CONVENTIONS DE DÉCOUPE, ÉCRITES UNE FOIS.
 *   — Un ARTICLE commence à un titre `### Article N — …` ; une SECTION d'annexe à un titre de
 *     niveau 3 numéroté « A<annexe>.<n> ».
 *     Tout autre titre de niveau 2 (`## …`) ferme l'unité en cours.
 *   — Un SOUS-ARTICLE commence à une ligne `**N.M`, `**N.M bis` (suivie de `**` ou de ` —`).
 *   — Un ALINÉA est un bloc de lignes non vides ; une NOTE est un bloc dont chaque ligne commence
 *     par `>`. Les notes ne comptent pas comme alinéas : c'est ainsi que se numérotent les alinéas
 *     d'un texte signé, et c'est la convention que la concordance avec le registre applique.
 */

/** Les identifiants de clause RETIRÉS par REQ-JUR-003 : un gabarit qui les porte est refusé. */
export const CLAUSES_RETIREES = ['CL-SANCTION'] as const;

/** Le titre qui ouvre la table technique : ce qui suit n'est pas remis à l'apporteur. */
const TITRE_TABLE_TECHNIQUE = /^## Correspondance article/;

/** Une forme comparable : sans emphase Markdown, apostrophe droite, blancs réduits. */
export function normaliser(texte: string): string {
  return texte
    .replace(/\*+/g, '')
    .replace(/’/g, "'")
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

export type Unite = {
  readonly numero: string;
  /** Les alinéas, dans l'ordre, sans les notes encadrées. */
  readonly alineas: string[];
  /** Les notes encadrées (blocs `>`), dans l'ordre. */
  readonly notes: string[];
};

const TITRE_ARTICLE = /^#{2,3} Article (\d+) — /;
const TITRE_SECTION_ANNEXE = /^### (A\d+\.\d+) — /;
const DEBUT_SOUS_ARTICLE = /^\*\*(\d+\.\d+(?: bis)?)(?:\*\*| —)/;

/**
 * Un JETON de lecture, produit par le parcours unique : soit une unité qui s'ouvre, soit un bloc de
 * lignes. Vocabulaire de DÉCOUPE, tenu distinct du vocabulaire du journal chaîné, qui est réservé
 * (docs/GLOSSAIRE.md §5) : ce module est du domaine pur, il n'écrit nulle part.
 */
type Jeton =
  | { genre: 'bloc'; lignes: string[]; article: string | null; sousArticle: string | null }
  | { genre: 'unite'; numero: string };

/** Le parcours unique du texte : les unités ouvertes et les blocs, dans l'ordre. */
function parcourir(texte: string): Jeton[] {
  const jetons: Jeton[] = [];
  let article: string | null = null;
  let sousArticle: string | null = null;
  let bloc: string[] = [];
  const fermer = (): void => {
    if (bloc.length > 0) jetons.push({ genre: 'bloc', lignes: bloc, article, sousArticle });
    bloc = [];
  };
  for (const ligne of texte.split(/\r?\n/)) {
    const titre = TITRE_ARTICLE.exec(ligne) ?? TITRE_SECTION_ANNEXE.exec(ligne);
    if (titre !== null) {
      fermer();
      article = titre[1]!;
      sousArticle = null;
      jetons.push({ genre: 'unite', numero: article });
      continue;
    }
    if (/^#/.test(ligne)) {
      fermer();
      if (/^## /.test(ligne)) {
        article = null;
        sousArticle = null;
      }
      continue;
    }
    if (ligne.trim() === '' || ligne.trim() === '---') {
      fermer();
      continue;
    }
    const sous = bloc.length === 0 ? DEBUT_SOUS_ARTICLE.exec(ligne) : null;
    if (sous !== null) {
      sousArticle = sous[1]!;
      jetons.push({ genre: 'unite', numero: sousArticle });
    }
    bloc.push(ligne);
  }
  fermer();
  return jetons;
}

const estNote = (lignes: string[]): boolean => lignes.every((l) => l.startsWith('>'));

/**
 * Les unités du gabarit, par numéro : `3`, `3.4`, `3.4 bis`, `14`, `A1.6`… Un article contient les
 * alinéas de tous ses sous-articles ; un sous-article, les siens seulement.
 */
export function unitesDuGabarit(texte: string): Map<string, Unite> {
  const unites = new Map<string, Unite>();
  for (const e of parcourir(texte)) {
    if (e.genre === 'unite') {
      unites.set(e.numero, { numero: e.numero, alineas: [], notes: [] });
      continue;
    }
    const contenu = e.lignes.join('\n');
    for (const numero of [e.article, e.sousArticle]) {
      const u = numero === null ? undefined : unites.get(numero);
      if (u === undefined) continue;
      (estNote(e.lignes) ? u.notes : u.alineas).push(contenu);
    }
  }
  return unites;
}

/**
 * Les articles sous lesquels une note encadrée signale une CASE D'ACCEPTATION DISTINCTE, dans
 * l'ordre du texte. La note qui dit « Cet article » se rattache à l'article ; les autres, à l'unité
 * la plus fine où elles sont posées.
 */
export function notesDAcceptation(texte: string): string[] {
  const articles: string[] = [];
  for (const e of parcourir(texte)) {
    if (e.genre !== 'bloc' || !estNote(e.lignes)) continue;
    const note = normaliser(e.lignes.join(' '));
    if (!/case (?:d'acceptation )?distincte/i.test(note)) continue;
    const porteur = /Cet article/.test(note) ? e.article : (e.sousArticle ?? e.article);
    if (porteur !== null) articles.push(porteur);
  }
  return articles;
}

export type ClausePosee = { readonly id: string; readonly porteur: string };

/** Les identifiants `CL-*` posés en commentaire HTML dans les titres. */
export function clausesPosees(texte: string): ClausePosee[] {
  const posees: ClausePosee[] = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const m = /^#{2,3} (.+?)\s*<!--([^>]*)-->\s*$/.exec(ligne);
    if (m === null) continue;
    for (const id of m[2]!.trim().split(/\s+/)) {
      if (id.startsWith('CL-')) posees.push({ id, porteur: m[1]! });
    }
  }
  return posees;
}

/** Le texte d'une section `## …` dont le titre répond au motif, jusqu'au titre `## ` suivant. */
function section(texte: string, titre: RegExp): string | null {
  const lignes = texte.split(/\r?\n/);
  const debut = lignes.findIndex((l) => titre.test(l));
  if (debut === -1) return null;
  const fin = lignes.findIndex((l, i) => i > debut && /^## /.test(l));
  return lignes.slice(debut, fin === -1 ? lignes.length : fin).join('\n');
}

export function sectionAnnexe1(texte: string): string | null {
  return section(texte, /^## Annexe 1\b/);
}

export type LigneDeCorrespondance = { readonly id: string; readonly articles: string };

/** La table de correspondance article ↔ identifiant (table technique, hors texte remis). */
export function tableDeCorrespondance(texte: string): LigneDeCorrespondance[] {
  const table = section(texte, TITRE_TABLE_TECHNIQUE) ?? '';
  const lignes: LigneDeCorrespondance[] = [];
  for (const l of table.split('\n')) {
    const m = /^\|\s*`(CL-[A-Z-]+)`\s*\|\s*([^|]+?)\s*\|/.exec(l);
    if (m !== null) lignes.push({ id: m[1]!, articles: m[2]! });
  }
  return lignes;
}

/** Le texte REMIS à l'apporteur : tout ce qui précède la table technique. */
export function texteRemis(texte: string): string {
  const lignes = texte.split(/\r?\n/);
  const i = lignes.findIndex((l) => TITRE_TABLE_TECHNIQUE.test(l));
  return i === -1 ? texte : lignes.slice(0, i).join('\n');
}

/** Les noms des variables `{{NOM}}`, sans doublon, dans l'ordre d'apparition. */
export function variablesDuTexte(texte: string): string[] {
  return [...new Set([...texte.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]!))];
}

/** Substitue les variables pourvues ; une variable sans valeur reste écrite, donc visible. */
export function rendre(texte: string, valeurs: Readonly<Record<string, string>>): string {
  return texte.replace(/\{\{([A-Z0-9_]+)\}\}/g, (brut, nom: string) =>
    Object.hasOwn(valeurs, nom) ? valeurs[nom]! : brut
  );
}

export type LigneDeTableau = {
  readonly section: string;
  readonly cellules: string[];
  readonly entete: string[];
};

/** Les lignes de données des tableaux de l'annexe 1, avec la section qui les porte. */
function lignesDeLAnnexe1(texte: string): LigneDeTableau[] {
  const lignes: LigneDeTableau[] = [];
  let sectionCourante = '';
  let entete: string[] = [];
  for (const l of (sectionAnnexe1(texte) ?? '').split('\n')) {
    const titre = TITRE_SECTION_ANNEXE.exec(l);
    if (titre !== null) {
      sectionCourante = titre[1]!;
      entete = [];
      continue;
    }
    if (!l.startsWith('|')) continue;
    const cellules = l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cellules.every((c) => /^-+$/.test(c))) continue;
    if (entete.length === 0) {
      entete = cellules;
      continue;
    }
    lignes.push({ section: sectionCourante, cellules, entete });
  }
  return lignes;
}

export type Palier = {
  readonly section: string;
  readonly identifiant: string;
  /** La cellule de la colonne « CPF », ou `null` si le tableau n'en a pas. */
  readonly cpf: string | null;
};

/** Les paliers COMMISSIONNÉS : les tableaux A1.1 à A1.4, une ligne par identifiant de palier. */
export function paliersDeLAnnexe1(texte: string): Palier[] {
  return (
    lignesDeLAnnexe1(texte)
      // Seule l'annexe 1 est lue ici : ses sections 1 à 4 sont les familles commissionnées.
      .filter((l) => /^A\d+\.[1-4]$/.test(l.section))
      .flatMap((l) => {
        const m = /^`([a-z0-9-]+)`$/.exec(String(l.cellules[1]));
        if (m === null) return [];
        const i = l.entete.indexOf('CPF');
        return [{ section: l.section, identifiant: m[1]!, cpf: i === -1 ? null : l.cellules[i]! }];
      })
  );
}

/** Les prestations NON commissionnées de A1.5, par leur libellé. */
export function nonCommissionneesDeLAnnexe1(texte: string): string[] {
  return lignesDeLAnnexe1(texte)
    .filter((l) => l.section === 'A1.5')
    .map((l) => l.cellules[0]!);
}

/** Toutes les cellules de données de l'annexe 1 — la matière de `jur:grille-chiffree`. */
export function cellulesDeLAnnexe1(texte: string): string[] {
  return lignesDeLAnnexe1(texte).flatMap((l) => l.cellules);
}
