/**
 * `politique.ts` — la politique de confidentialité de l'espace, DÉRIVÉE du registre de l'article 30
 * (JUR-T34, REQ-JUR-025). Registre : `docs/rgpd/registre-article-30.md`, livré par JUR-T04.
 *
 * DÉRIVÉE, JAMAIS RECOPIÉE (RM-01). Les rubriques utiles à la personne — finalité, base légale,
 * durée de conservation, destinataires, transferts hors Union européenne, droits — se lisent dans le
 * tableau du traitement TRT-APPORTEURS ; les destinataires tiers dans la section 4, ligne par ligne,
 * quand leur colonne « Traitements » cite TRT-APPORTEURS tel quel (une mention « dans une version
 * ultérieure » n'est pas une citation). Une durée nommée par la source unique des seuils
 * (`SEUILS`) est résolue à sa valeur. Ce que le registre dit « À compléter » reste « à compléter »,
 * avec sa question : aucune valeur n'est inventée.
 *
 * REFUS NOMMÉ. Un registre dont une rubrique, une section ou une colonne manque, qui renvoie à une
 * constante inconnue, ou dont l'extrait parlerait des conseillers de la Société, est refusé avec
 * son motif : la page affiche alors son état d'erreur, jamais une politique partielle.
 *
 * LE TÉMOIN DE LA PAGE. `valeursRetapees` confronte le SOURCE d'une page au registre : toute durée
 * écrite en chiffres, et tout nom de prestataire (ceux du registre et ceux d'un catalogue de
 * services courants), rougit en nommant la valeur — la page lit le registre, elle ne l'écrit pas.
 *
 * Domaine pur : `node:crypto` seul, aucune I/O, aucune horloge.
 */
import { createHash } from 'node:crypto';
import { SEUILS, type Seuil, type UniteDeSeuil } from '../seuils/ssot';
import { famillesPourPortee } from '../lexique/lexique-interdit';

// ── les formes ──────────────────────────────────────────────────────────────────────────────────

/**
 * Un morceau de contenu : un texte du registre, ou un passage EN COURS DE RÉDACTION. Ce dernier ne
 * porte rien du registre (JUR-T36) : ni la question interne d'un manque déclaré, ni un texte retenu
 * parce qu'il nomme une personne ou emploie un mot que le lexique de l'espace refuse.
 */
export type Segment =
  { readonly type: 'texte'; readonly texte: string } | { readonly type: 'a_completer' };

/**
 * Ce que la lecture a retenu, et pourquoi (JUR-T36) : la page publique ne montre pas la note
 * interne, la lecture la NOMME. `ou` est la clé de la rubrique, ou « nom du tiers · colonne ».
 */
export type Filtre = {
  readonly ou: string;
  readonly motif: 'question_interne' | 'nom_de_personne' | 'lexique_interdit' | 'non_tranche';
  readonly detail?: string;
};

/**
 * Les personnes que le registre nomme dans ses notes internes : l'arbitre des questions juridiques
 * du projet (registre, en-tête et section 6). Aucun texte qui les nomme n'atteint la page publique.
 */
export const PERSONNES_DU_REGISTRE: readonly string[] = ['Will', 'Williams'];

/** Les rubriques de TRT-APPORTEURS affichées, et leur nom exact dans le registre. */
export const RUBRIQUES_AFFICHEES = {
  finalite: 'Finalité',
  baseLegale: 'Base légale',
  duree: 'Durée de conservation',
  destinataires: 'Destinataires',
  transferts: 'Transferts hors Union européenne',
  droits: "Droits et modalités d'exercice",
} as const;
export type CleDeRubrique = keyof typeof RUBRIQUES_AFFICHEES;

/** L'ordre d'affichage des rubriques. */
const ORDRE: readonly CleDeRubrique[] = [
  'finalite',
  'baseLegale',
  'duree',
  'destinataires',
  'transferts',
  'droits',
];

export type Rubrique = { readonly cle: CleDeRubrique; readonly contenu: readonly Segment[] };

/** Un destinataire tiers de la section 4. */
export type Destinataire = {
  readonly nom: string;
  readonly qualification: readonly Segment[];
  readonly donnees: readonly Segment[];
  readonly localisation: readonly Segment[];
};

export type Politique = {
  readonly rubriques: readonly Rubrique[];
  readonly destinataires: readonly Destinataire[];
  /** Empreinte stable du contenu extrait : elle change dès qu'une valeur affichée change. */
  readonly version: string;
};

export type LecturePolitique =
  | { readonly ok: true; readonly politique: Politique; readonly filtres: readonly Filtre[] }
  | { readonly ok: false; readonly refus: string };

/** La longueur de la version : celle de la colonne `confidentialite_version` du schéma. */
export const LONGUEUR_DE_VERSION = 32;

export const TRAITEMENT = 'TRT-APPORTEURS';
export const MARQUE_A_COMPLETER = 'À compléter — source manquante.';

const COLONNES = {
  nom: 'Tiers',
  qualification: 'Qualification',
  traitements: 'Traitements',
  donnees: 'Données confiées',
  localisation: 'Localisation et transfert',
} as const;

const UNITES: Readonly<Record<UniteDeSeuil, string>> = {
  minutes: 'minutes',
  jours: 'jours',
  jours_ouvres: 'jours ouvrés',
  mois: 'mois',
  ans: 'ans',
  centimes: 'centimes',
  tentatives: 'tentatives',
};

/** Un refus du registre : son message est le motif, rendu tel quel. */
const refus = (motif: string): Error => new Error(motif);

const REFUS_CONSEILLERS =
  'l’extrait mentionne les conseillers : leur information passe par un autre canal';

// ── la lecture du Markdown ──────────────────────────────────────────────────────────────────────

/**
 * L'apostrophe typographique et l'apostrophe droite sont la même lettre pour un nom de rubrique.
 * Aucun `trim` : `cellules` rend déjà chaque cellule rognée.
 */
const normaliser = (s: string): string => s.replace(/’/g, "'");

function cellules(ligne: string): string[] {
  return ligne
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
}

/**
 * La cellule `i` d'une ligne, vide si la ligne est trop courte. `join()` sans séparateur : la
 * tranche porte au plus un élément, un séparateur n'y aurait aucun effet.
 */
const cellule = (ligne: readonly string[], i: number): string => ligne.slice(i, i + 1).join();

/** Les lignes d'une section : de la ligne qui satisfait `debut` à la prochaine qui satisfait `fin`. */
function section(lignes: readonly string[], debut: RegExp, fin: RegExp, nom: string): string[] {
  const i = lignes.findIndex((l) => debut.test(l));
  if (i < 0) throw refus(`section absente du registre : ${nom}`);
  const suite = lignes.slice(i + 1);
  const j = suite.findIndex((l) => fin.test(l));
  return j < 0 ? suite : suite.slice(0, j);
}

/** Les lignes de tableau d'une section, sans la ligne de séparation. */
function lignesDeTableau(lignes: readonly string[]): string[][] {
  return lignes
    .filter((l) => l.trimStart().startsWith('|'))
    .map(cellules)
    .filter((c) => !c.every((x) => /^-+$/.test(x)));
}

function seuilNomme(nom: string): Seuil | undefined {
  return Object.entries(SEUILS).find(([n]) => n === nom)?.[1];
}

/** Résout chaque constante entre accents graves à sa valeur ; une constante inconnue est refusée. */
function resoudre(texte: string): string {
  return texte.replace(/`([^`]+)`/g, (_, nom: string) => {
    const seuil = seuilNomme(nom);
    if (seuil === undefined) throw refus(`référence non résolue : ${nom}`);
    return `${seuil.valeur} ${UNITES[seuil.unite]}`;
  });
}

/** Les formes que le lexique de l'espace refuse à l'apporteur, chacune jugée comme un mot entier. */
const FORMES_REFUSEES = famillesPourPortee('apporteur').flatMap((f) =>
  f.formes.map((forme) => ({ forme, motif: motDe(forme, 'iu') }))
);
const PERSONNES = PERSONNES_DU_REGISTRE.map((p) => motDe(p, 'u'));
/** Une qualification, ou toute mention, que le registre dit encore « à confirmer ». */
const NON_TRANCHE = /à confirmer/i;

function motDe(mot: string, drapeaux: string): RegExp {
  const litteral = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${litteral}(?![\\p{L}\\p{N}])`, drapeaux);
}

/**
 * Le texte tel que la page publique peut le montrer : un texte qui nomme une personne, ou qui
 * emploie un mot refusé, est RETENU en entier (on ne réécrit pas le registre à sa place) et la page
 * l'annonce en cours de rédaction. Un texte qui se dit « à confirmer » n'est pas annoncé du tout
 * (A07, art. 13 : la politique dit ce qui EST) : il est OMIS (`null`). Chaque retenue est nommée.
 */
function texteAffichable(texte: string, ou: string, filtres: Filtre[]): Segment | null {
  // Le refus des conseillers se juge AVANT toute retenue : retenir le texte ne doit pas le taire.
  if (/conseill/i.test(texte)) throw refus(REFUS_CONSEILLERS);
  if (PERSONNES.some((p) => p.test(texte))) {
    filtres.push({ ou, motif: 'nom_de_personne' });
    return { type: 'a_completer' };
  }
  if (NON_TRANCHE.test(texte)) {
    filtres.push({ ou, motif: 'non_tranche' });
    return null;
  }
  const refusee = FORMES_REFUSEES.find((f) => f.motif.test(texte));
  if (refusee !== undefined) {
    filtres.push({ ou, motif: 'lexique_interdit', detail: refusee.forme });
    return { type: 'a_completer' };
  }
  return { type: 'texte', texte };
}

/**
 * Une cellule en segments : le texte, puis chaque manque déclaré. La question qui suit un manque
 * est une note INTERNE, posée à l'arbitre : elle ne sort pas du domaine (JUR-T36), seul le manque
 * est annoncé, et la retenue est nommée.
 */
function segments(contenu: string, ou: string, filtres: Filtre[]): Segment[] {
  const morceaux = resoudre(contenu).split(MARQUE_A_COMPLETER);
  const manques = morceaux.slice(1).map((): Segment => {
    filtres.push({ ou, motif: 'question_interne' });
    return { type: 'a_completer' };
  });
  // Un seul élément au plus : `join()` sans séparateur, comme dans `cellule`.
  const avant = morceaux.slice(0, 1).join().trim();
  const affichable = avant === '' ? null : texteAffichable(avant, ou, filtres);
  const texte: Segment[] = affichable === null ? [] : [affichable];
  return [...texte, ...manques];
}

/**
 * Les rubriques d'UN bloc de traitement du registre, dans l'ordre donné : la lecture commune à la
 * politique de l'espace et à la page « Vos données dans la console » (JUR-T61). Mêmes segments, mêmes
 * retenues nommées, mêmes refus ; une rubrique absente est refusée.
 */
function rubriquesDuTraitement<C extends string>(
  lignes: readonly string[],
  traitement: string,
  rubriques: Readonly<Record<C, string>>,
  ordre: readonly C[],
  filtres: Filtre[]
): { readonly cle: C; readonly contenu: readonly Segment[] }[] {
  const tableau = lignesDeTableau(
    section(lignes, new RegExp(`^### ${traitement}\\b`), /^#{1,3} /, traitement)
  );
  return ordre.map((cle) => {
    const nom = rubriques[cle];
    const ligne = tableau.find((c) => normaliser(cellule(c, 0)) === nom);
    if (ligne === undefined) throw refus(`rubrique absente de ${traitement} : ${nom}`);
    return { cle, contenu: segments(cellule(ligne, 1), cle, filtres) };
  });
}

function lireRubriques(lignes: readonly string[], filtres: Filtre[]): Rubrique[] {
  return rubriquesDuTraitement(lignes, TRAITEMENT, RUBRIQUES_AFFICHEES, ORDRE, filtres);
}

export type LectureDUnTraitement<C extends string> =
  | {
      readonly ok: true;
      readonly rubriques: readonly { readonly cle: C; readonly contenu: readonly Segment[] }[];
      readonly filtres: readonly Filtre[];
    }
  | { readonly ok: false; readonly refus: string };

/**
 * JUR-T61 — la lecture GÉNÉRIQUE d'un bloc de traitement du registre (`### <traitement>`) : ses
 * rubriques nommées, dans l'ordre donné, par la même lecture que la politique de l'espace, ou le
 * refus nommé qui l'empêche. Aucun changement de comportement pour `extrairePolitique`.
 */
export function lireUnTraitement<C extends string>(
  registre: string,
  traitement: string,
  rubriques: Readonly<Record<C, string>>,
  ordre: readonly C[]
): LectureDUnTraitement<C> {
  try {
    const filtres: Filtre[] = [];
    const lues = rubriquesDuTraitement(
      registre.split(/\r?\n/),
      traitement,
      rubriques,
      ordre,
      filtres
    );
    // Le refus des conseillers est déjà jugé texte par texte (`texteAffichable`), avant toute
    // retenue : une seconde vérification sur le rendu serait une branche que rien n'atteint.
    return { ok: true, rubriques: lues, filtres };
  } catch (e) {
    return { ok: false, refus: String(e).replace(/^Error: /, '') };
  }
}

/** Le tableau de la section 4 : ses lignes, et l'index d'une colonne nommée par l'en-tête. */
function tableauDesTiers(lignes: readonly string[]) {
  const tableau = lignesDeTableau(section(lignes, /^## 4\./, /^## /, 'section 4'));
  const entete = tableau.slice(0, 1).flat();
  const colonne = (nom: string): number => {
    const i = entete.indexOf(nom);
    if (i < 0) throw refus(`colonne absente de la section 4 : ${nom}`);
    return i;
  };
  return { corps: tableau.slice(1), colonne };
}

/**
 * La qualification d'un tiers n'est montrée que TRANCHÉE (A07) : une cellule qui porte « à confirmer »
 * ou un manque déclaré n'est pas annoncée du tout — ni texte, ni « en cours » — et la retenue est
 * nommée. La page dit alors le rôle du tiers (ses données confiées), jamais un titre juridique en suspens.
 */
function qualificationTranchee(contenu: string, ou: string, filtres: Filtre[]): Segment[] {
  if (NON_TRANCHE.test(contenu) || contenu.includes(MARQUE_A_COMPLETER)) {
    filtres.push({ ou, motif: 'non_tranche' });
    return [];
  }
  return segments(contenu, ou, filtres);
}

function lireDestinataires(lignes: readonly string[], filtres: Filtre[]): Destinataire[] {
  const { corps, colonne } = tableauDesTiers(lignes);
  const c = {
    nom: colonne(COLONNES.nom),
    qualification: colonne(COLONNES.qualification),
    traitements: colonne(COLONNES.traitements),
    donnees: colonne(COLONNES.donnees),
    localisation: colonne(COLONNES.localisation),
  };
  return corps
    .filter((l) =>
      cellule(l, c.traitements)
        .split(/[,;]/)
        .some((t) => t.trim() === TRAITEMENT)
    )
    .map((l) => {
      const nom = resoudre(cellule(l, c.nom));
      const lire = (i: number, colonne: string) =>
        segments(cellule(l, i), `${nom} · ${colonne}`, filtres);
      return {
        nom,
        qualification: qualificationTranchee(
          cellule(l, c.qualification),
          `${nom} · ${COLONNES.qualification}`,
          filtres
        ),
        donnees: lire(c.donnees, COLONNES.donnees),
        localisation: lire(c.localisation, COLONNES.localisation),
      };
    });
}

/** La version : sha256 du contenu extrait, tronqué à la longueur de la colonne. */
function versionDe(contenu: Omit<Politique, 'version'>): string {
  return createHash('sha256')
    .update(JSON.stringify(contenu))
    .digest('hex')
    .slice(0, LONGUEUR_DE_VERSION);
}

/** La politique extraite du registre, ou le refus nommé qui l'empêche. */
export function extrairePolitique(registre: string): LecturePolitique {
  try {
    const lignes = registre.split(/\r?\n/);
    const filtres: Filtre[] = [];
    const contenu = {
      rubriques: lireRubriques(lignes, filtres),
      destinataires: lireDestinataires(lignes, filtres),
    };
    if (/conseill/i.test(JSON.stringify(contenu))) throw refus(REFUS_CONSEILLERS);
    return { ok: true, politique: { ...contenu, version: versionDe(contenu) }, filtres };
  } catch (e) {
    return { ok: false, refus: String(e).replace(/^Error: /, '') };
  }
}

// ── JUR-T57 : la politique PUBLIABLE ────────────────────────────────────────────────────────────

/**
 * Les segments « en cours de rédaction » de la politique rendue, rubriques et destinataires compris,
 * quel qu'en soit le motif. Une qualification non tranchée est OMISE (aucun segment) : elle ne compte
 * pas — c'est la seule omission admise (A07, rattrapage 80).
 */
export function segmentsEnCours(politique: Omit<Politique, 'version'>): number {
  const tous = [
    ...politique.rubriques.flatMap((r) => r.contenu),
    ...politique.destinataires.flatMap((d) => [
      ...d.qualification,
      ...d.donnees,
      ...d.localisation,
    ]),
  ];
  return tous.filter((s) => s.type === 'a_completer').length;
}

/**
 * CONDITION DE MISE EN SERVICE (A07, mot pour mot) : « la page ne peut pas être présentée à
 * l'acceptation d'un Apporteur tant que la politique rendue contient un seul segment `a_completer`,
 * quel qu'en soit le motif. Seule l'omission d'une qualification non tranchée est admise. »
 */
export function estPubliable(politique: Omit<Politique, 'version'>): boolean {
  return segmentsEnCours(politique) === 0;
}

// ── le témoin de la page ────────────────────────────────────────────────────────────────────────

/** Une durée écrite en chiffres, suivie de son unité (jours, semaines, mois, ans, heures). */
const DUREE_ECRITE =
  /\b\d+\s*(?:jours?(?:\s+ouvrés)?|semaines?|mois|ans?|années?|heures?)(?!\p{L})/giu;

/** Des services courants qu'une page pourrait nommer sans que le registre les connaisse. */
export const SERVICES_COURANTS: readonly string[] = [
  'Amazon Web Services',
  'AWS',
  'Google',
  'Microsoft',
  'Azure',
  'OVH',
  'OVHcloud',
  'Scaleway',
  'Hetzner',
  'Cloudflare',
  'Vercel',
  'Brevo',
  'Sendinblue',
  'Mailchimp',
  'SendGrid',
  'Mailgun',
  'Twilio',
  'Stripe',
  'Firebase',
  'OneSignal',
  'DocuSign',
  'Yousign',
  'Qonto',
  'Pennylane',
];

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les noms de tiers que la section 4 du registre porte ; aucun si elle est illisible. */
function tiersDuRegistre(registre: string): string[] {
  try {
    const { corps, colonne } = tableauDesTiers(registre.split(/\r?\n/));
    const i = colonne(COLONNES.nom);
    return corps.map((l) => cellule(l, i)).filter((n) => n !== '');
  } catch {
    return [];
  }
}

/**
 * Les valeurs qu'une page RETAPE au lieu de les lire : chaque durée écrite en chiffres et chaque nom
 * de prestataire trouvé dans son source, commentaires compris. Chaque faute nomme la valeur, et dit
 * si le registre la porte (recopiée) ou non (absente du registre). Vide : la page ne retape rien.
 */
export function valeursRetapees(
  sourceDeLaPage: string,
  registre: string,
  services: readonly string[] = SERVICES_COURANTS
): string[] {
  const provenance = (v: string): string =>
    registre.includes(v) ? 'recopiée du registre' : 'absente du registre';
  const durees = [...sourceDeLaPage.matchAll(DUREE_ECRITE)].map(
    (m) => `durée retapée dans la page : « ${m[0]} » (${provenance(m[0])})`
  );
  const noms = [...new Set([...tiersDuRegistre(registre), ...services])]
    .filter((n) =>
      new RegExp(`(?<![\\p{L}\\d])${echapper(n)}(?![\\p{L}\\d])`, 'u').test(sourceDeLaPage)
    )
    .map((n) => `prestataire retapé dans la page : « ${n} » (${provenance(n)})`);
  return [...durees, ...noms];
}
