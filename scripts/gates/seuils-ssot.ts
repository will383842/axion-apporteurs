/**
 * seuils-ssot.ts — `ssot:seuils` (JUR-T02 : REQ-JUR-015, REQ-EXT-028, RM-10).
 *
 * USAGE : npx tsx scripts/gates/seuils-ssot.ts           (juge la SSOT, `src/` et le gabarit du dépôt)
 *         npx tsx scripts/gates/seuils-ssot.ts --prove   (un témoin par famille, contre-témoins verts)
 *
 * CE QU'ELLE TIENT, en quatre familles de contrôle :
 *   1. LA SSOT (`src/domain/seuils/ssot.ts`) : chaque constante a une source et une date ISO réelle,
 *      une valeur entière positive ; AUCUNE constante de gradation, de manquements ni de délai de
 *      contradictoire (`HYP-D11`, décision du 2026-09-03).
 *   2. AUCUN LITTÉRAL HORS DE LA SSOT, dans le code de `src/` (spécifications exclues), par deux
 *      RÈGLES qui normalisent ce qui est écrit plutôt que d'en décrire les formes :
 *        — TOUT NOMBRE, lu sans ses séparateurs de milliers (espace, espaces insécables U+00A0 et
 *          U+202F, espace fine U+2009, point, apostrophe, souligné, virgule entre groupes de trois)
 *          et à décimales nulles, qui égale un montant de seuil de la SSOT, en centimes ou en
 *          euros ; au-dessous de mille, suivi d'une unité monétaire ;
 *        — TOUT PRODUIT d'au moins deux littéraux entiers, dans n'importe quel ordre, parenthèses
 *          comprises, qui égale un délai de la SSOT exprimé en jours, heures, minutes, secondes ou
 *          millisecondes (un mois compte trente jours, une année 365) ;
 *      et, en plus de ces règles, par des motifs :
 *        — les durées 2, 3, 6, 10, 12, 15, 24, 30, 60 et 90 ATTACHÉES À UNE UNITÉ DE TEMPS :
 *          multipliées par une constante de jour, de mois ou d'année, ou par `24 * 60 * 60` ;
 *          passées à une fonction d'ajout de jours, de mois ou d'années ; posées sous une clé
 *          `jours`, `mois`, `ans` ; écrites dans une chaîne suivies de « jours », « mois », « ans »,
 *          en chiffres ou en lettres (« quinze jours », « vingt-quatre derniers mois »).
 *      Un nombre sans unité de temps n'est pas jugé : `slice(0, 12)` n'est pas un délai.
 *   3. AUCUN PRÉAVIS INDEXÉ SUR L'ANCIENNETÉ (M-16) : une déclaration qui lit à la fois un préavis et
 *      une ancienneté, une date d'entrée ou un nombre d'années est refusée.
 *   4. COHÉRENCE GABARIT ↔ SSOT (sur le modèle de REQ-EXT-028 a) : chaque constante qui renvoie à
 *      une unité du contrat y est écrite — sa variable `{{NOM}}`, ou sa valeur en lettres ou en
 *      chiffres suivie de son unité. Une valeur changée d'un seul côté rougit.
 *
 * LES EXEMPTIONS SONT NOMMÉES, et une exemption qui ne couvre plus rien rougit à son tour : sans
 * cela, elle survivrait à la migration qu'elle attend et couvrirait le littéral suivant.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne lit que `src/` : les scripts de gouvernance et les tests citent ces
 * valeurs pour les juger. Un délai calculé par un détour qu'aucun motif ne décrit (une constante
 * locale nommée `N`, puis `N * MS_PAR_JOUR`) lui échappe ; c'est la lentille exactitude qui le voit.
 *
 * ÉCHEC FERMÉ. Gabarit introuvable, zéro fichier lu : rouge. Le périmètre vient de la source unique
 * (`scripts/lot/fichiers-suivis.ts`) : les fichiers SUIVIS par git, et un refus nommé quand git ne
 * répond pas, qu'elle est lancée hors de la racine, ou qu'un fichier suivi manque sur le disque.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEUILS, type Seuil } from '../../src/domain/seuils/ssot';
import { normaliser, texteRemis, unitesDuGabarit } from '../../src/domain/contrat/gabarit';
import { fichiersSuivisOuRefus } from '../lot/fichiers-suivis';

export type Faute = { famille: string; cle: string; message: string };
export type Fichier = { chemin: string; texte: string };
export type Exemption = { chemin: string; raison: string };

export const CHEMIN_SSOT = 'src/domain/seuils/ssot.ts';
export const GABARIT = 'docs/contrat/CONTRAT-APPORTEUR-V1.md';
export const ANNEXE_2 = 'docs/contrat/ANNEXE-2-MANDAT.md';

/**
 * Les fichiers de `src/` où un littéral de durée s'écrit légitimement, fichier par fichier, avec la
 * raison. Chacun doit CONTENIR au moins un littéral : sinon l'exemption est orpheline, et rougit.
 */
export const EXEMPTIONS: readonly Exemption[] = [
  {
    chemin: 'src/domain/contrat/decisions.ts',
    raison:
      'ancrages lexicaux du registre `docs/DECISIONS.md`, cités mot pour mot pour être confrontés ' +
      'au gabarit : ce sont des citations, jamais des valeurs exécutées',
  },
  {
    chemin: 'src/server/auth/durees.ts',
    raison:
      'durée de session sourcée REQ-SEC-003 (HYP-E1-15), déjà en forme { valeur, source, verifieLe } ; ' +
      'sa migration dans la SSOT sort des chemins de JUR-T02 (SEC-03)',
  },
];

// ── 1. La SSOT ──────────────────────────────────────────────────────────────────────────────────

const NOM_DE_GRADATION = /CONTRADICTOIRE|STRIKE|GRADATION|GRADUE|MANQUEMENT|AVERTISSEMENT|SANCTION/;
const UNITES: readonly Seuil['unite'][] = [
  'minutes',
  'jours',
  'jours_ouvres',
  'mois',
  'ans',
  'centimes',
  // JUR-T40 : un compte, pas une durée (LIBERATION_SIGNALEE_INJOIGNABLE_MAX).
  'tentatives',
];

function dateIsoReelle(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function fautesDeLaSsot(seuils: Readonly<Record<string, Seuil>>): Faute[] {
  const fautes: Faute[] = [];
  for (const [cle, s] of Object.entries(seuils)) {
    if (NOM_DE_GRADATION.test(cle)) {
      fautes.push({
        famille: 'constante_de_gradation',
        cle,
        message:
          `${cle} : la SSOT ne porte aucune constante de gradation ni de délai de contradictoire ` +
          `(HYP-D11, décision du 2026-09-03). Un barème écrit ici serait exécuté par un cron.`,
      });
      continue;
    }
    if (typeof s.source !== 'string' || s.source.trim() === '') {
      fautes.push({ famille: 'seuil_sans_source', cle, message: `${cle} n'a pas de source.` });
    }
    if (typeof s.verifieLe !== 'string' || !dateIsoReelle(s.verifieLe)) {
      fautes.push({
        famille: 'seuil_sans_date',
        cle,
        message: `${cle} : « ${String(s.verifieLe)} » n'est pas une date ISO réelle de vérification.`,
      });
    }
    if (!Number.isInteger(s.valeur) || s.valeur <= 0 || !UNITES.includes(s.unite)) {
      fautes.push({
        famille: 'seuil_mal_forme',
        cle,
        message: `${cle} : une valeur entière positive et une unité parmi ${UNITES.join(', ')}.`,
      });
    }
  }
  return fautes;
}

// ── 2. Les littéraux hors SSOT ──────────────────────────────────────────────────────────────────

/**
 * Le texte, commentaires BLANCHIS (remplacés par des espaces, sauts de ligne conservés) : les
 * numéros de ligne restent justes, et une chaîne qui contient `//` n'est pas coupée. Avec
 * `blanchirChaines`, le contenu des chaînes l'est aussi, délimiteurs conservés.
 */
export function sansCommentaires(texte: string, blanchirChaines = false): string {
  let sortie = '';
  let i = 0;
  let chaine: string | null = null;
  const garder = (x: string): string => (blanchirChaines && x !== '\n' ? ' ' : x);
  while (i < texte.length) {
    const c = texte[i]!;
    const suivant = texte[i + 1];
    if (chaine !== null) {
      if (c === chaine) {
        sortie += c;
        chaine = null;
        i++;
        continue;
      }
      sortie += garder(c);
      if (c === '\\') {
        sortie += garder(suivant ?? '');
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === '/' && suivant === '/') {
      while (i < texte.length && texte[i] !== '\n') {
        sortie += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && suivant === '*') {
      const fin = texte.indexOf('*/', i + 2);
      const bout = fin === -1 ? texte.length : fin + 2;
      sortie += texte.slice(i, bout).replace(/[^\n]/g, ' ');
      i = bout;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    sortie += c;
    i++;
  }
  return sortie;
}

// Les numéraux français, remontés ici : `enLettres()` est hissée, mais les CONSTANTES qu'elle lit
// ne le sont pas, et la dérivation des durées ci-dessous l'appelle à l'évaluation du module.
// Les laisser plus bas rendait une zone morte temporelle (mesuré : la garde levait sur
// `UNITES_FR[reste]`).
const UNITES_FR = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
];
const DIZAINES_FR = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/**
 * Les DURÉES de la SSOT, DÉRIVÉES et jamais retapées (RM-01, « dériver, jamais recopier »). Toute
 * valeur de `SEUILS` qui n'est pas un montant est une durée : ajouter un délai à la SSOT arme donc
 * ces motifs sans qu'on y pense, et un délai retiré en sort.
 *
 * 🔴 CE QUE LA LISTE ÉCRITE À LA MAIN COÛTAIT. Elle coïncidait avec la SSOT — mesuré au moment de
 * la dérivation : les deux ensembles sont `2 3 6 10 12 15 24 30 60 90`, sans écart d'aucun côté.
 * Mais la coïncidence n'est pas une dérivation : un `45` versé à la SSOT aurait laissé passer
 * « 45 jours » écrit en dur dans `src/`, et la garde aurait mesuré autre chose que sa cible. Une
 * garde qui mesure le mauvais registre ne mentionne rien : elle mesure, et son vert ne veut rien
 * dire (revue `exactitude` de la PR 180, RM-01).
 *
 * L'ordre DÉCROISSANT est voulu : dans une alternance, `90` doit précéder `9`. Une alternance
 * croissante s'arrête au préfixe et ne rattrape que par le retour arrière du motif qui l'entoure.
 */
const VALEURS_DE_DUREE: readonly number[] = [
  ...new Set(
    Object.values(SEUILS)
      .filter((s) => s.unite !== 'centimes')
      .map((s) => s.valeur)
  ),
].sort((a, b) => b - a);
const DUREES = `(?:${VALEURS_DE_DUREE.join('|')})`;
/** Les mêmes durées en lettres, par `enLettres()` : une durée sans mot connu n'entre pas au motif. */
const EN_LETTRES = `(?:${[
  ...new Set(
    VALEURS_DE_DUREE.map((n) => enLettres(n)).filter((mot): mot is string => mot !== null)
  ),
].join('|')})`;
const UNITE_TEMPS = '(?:jours?|mois|ans|ann[ée]es?)';

/** Les motifs, chacun nommé : le message dit lequel a vu le littéral. */
const MOTIFS: readonly { quoi: string; motif: RegExp }[] = [
  {
    quoi: 'durée multipliée par une unité de temps',
    motif: new RegExp(
      `(?<![\\w.])(${DUREES})\\s*\\*\\s*(?:[\\w.]*(?:JOUR|MOIS|ANNEE|DAY|MONTH|YEAR)\\w*|24\\s*\\*\\s*60\\s*\\*\\s*60|86_?400)`,
      'i'
    ),
  },
  {
    quoi: 'unité de temps multipliée par une durée',
    motif: new RegExp(
      `[\\w.]*(?:JOUR|MOIS|ANNEE|DAY|MONTH|YEAR)\\w*\\s*\\*\\s*(${DUREES})(?![\\w.])`,
      'i'
    ),
  },
  {
    quoi: "durée passée à une fonction d'ajout",
    motif: new RegExp(
      `(?:ajouter|add|plus|sub|retirer|soustraire)\\w*(?:jours|mois|ans|annees|days|months|years|ouvres)\\w*\\s*\\([^()]*,\\s*(${DUREES})\\s*\\)`,
      'i'
    ),
  },
  {
    quoi: 'durée posée sous une clé de temps',
    motif: new RegExp(
      `\\b(?:jours|mois|ans|annees|days|months|years|joursOuvres)\\s*:\\s*(${DUREES})(?![\\w.])`,
      'i'
    ),
  },
  {
    quoi: 'durée écrite en chiffres dans un texte',
    motif: new RegExp(`(?<![\\w.,])(${DUREES})\\s*${UNITE_TEMPS}\\b`, 'i'),
  },
  {
    quoi: 'durée écrite en lettres dans un texte',
    motif: new RegExp(`\\b(${EN_LETTRES})\\s+(?:\\p{L}+\\s+)?${UNITE_TEMPS}\\b`, 'iu'),
  },
];

/** Une date civile `{ mois: 12, jour: 25 }` n'est pas une durée : la clé `jour` la signe. */
const DATE_CIVILE = /\bjour\s*:\s*\d/;

// ── 2 bis. Les deux RÈGLES : tout nombre, tout produit ──────────────────────────────────────────
//
// Un motif par forme perd la forme suivante : `2 400 €`, `5 000 €` à espace insécable,
// `1000 * 60 * 60 * 24 * 30` passaient. Ces deux règles ne décrivent pas des formes : elles
// NORMALISENT ce qui est écrit, puis confrontent le résultat aux valeurs DÉRIVÉES de `SEUILS`
// (RM-01) — une valeur changée dans la SSOT change ce que la garde cherche.

/** Tout séparateur de milliers qu'un texte ou un code peut porter entre deux groupes de chiffres. */
const SEPARATEUR_DE_MILLIERS = "[ \\u00A0\\u202F\\u2009._',]";

/**
 * Un nombre écrit : des groupes de trois chiffres liés par un séparateur de milliers, ou des chiffres
 * nus, puis d'éventuelles décimales (une ou deux). Jamais au milieu d'un mot, d'un nombre, ni après
 * un point.
 */
const NOMBRE_ECRIT = new RegExp(
  `(?<![\\p{L}\\d_$.])(\\d{1,3}(?:${SEPARATEUR_DE_MILLIERS}\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?(?![\\p{L}\\d_])`,
  'gu'
);
const UNITE_MONETAIRE = /^\s*(?:€|euros?\b|eur\b)/iu;

/** Les montants de seuil de la SSOT, en centimes et en euros, lus dans `SEUILS`. */
export function montantsDeSeuil(seuils: Readonly<Record<string, Seuil>>): Map<number, string> {
  const montants = new Map<number, string>();
  for (const [cle, s] of Object.entries(seuils)) {
    if (s.unite !== 'centimes') continue;
    montants.set(s.valeur, `${cle} en centimes`);
    if (s.valeur % 100 === 0) montants.set(s.valeur / 100, `${cle} en euros`);
  }
  return montants;
}

/**
 * La règle des montants : le premier nombre de la ligne qui, lu sans ses séparateurs de milliers et
 * à décimales nulles, égale un montant de seuil. Au-dessous de mille, un nombre n'est un montant que
 * suivi d'une unité monétaire : `slice(0, 50)` n'est pas un seuil.
 */
export function montantDansLaLigne(
  ligne: string,
  montants: ReadonlyMap<number, string>
): string | null {
  for (const m of ligne.matchAll(NOMBRE_ECRIT)) {
    if (m[2] !== undefined && Number(m[2]) !== 0) continue;
    const entier = Number(m[1]!.replace(new RegExp(SEPARATEUR_DE_MILLIERS, 'gu'), ''));
    const quoi = montants.get(entier);
    if (quoi === undefined) continue;
    const suite = ligne.slice(m.index + m[0].length);
    if (entier >= 1000 || UNITE_MONETAIRE.test(suite)) return `${m[0]}, ${quoi}`;
  }
  return null;
}

const JOURS_PAR_UNITE: Readonly<
  Record<Exclude<Seuil['unite'], 'centimes' | 'tentatives'>, number>
> = {
  // Une minute, en jours : 90 minutes rendent 0,0625 jour, 1,5 heure, 90 minutes, sans reste.
  minutes: 1 / 1440,
  jours: 1,
  jours_ouvres: 1,
  mois: 30,
  ans: 365,
};
const ECHELLES: readonly (readonly [string, number])[] = [
  ['jours', 1],
  ['heures', 24],
  ['minutes', 24 * 60],
  ['secondes', 24 * 60 * 60],
  ['millisecondes', 24 * 60 * 60 * 1000],
];

/**
 * Chaque délai de la SSOT exprimé en jours, heures, minutes, secondes et millisecondes. Un mois
 * compte trente jours ; un nombre entier d'années, écrit en mois ou en ans, compte 365 jours par an.
 */
export function delaisExprimes(seuils: Readonly<Record<string, Seuil>>): Map<number, string> {
  const delais = new Map<number, string>();
  for (const [cle, s] of Object.entries(seuils)) {
    // Un montant et un compte ne sont pas des délais.
    if (s.unite === 'centimes' || s.unite === 'tentatives') continue;
    const jours = new Set([s.valeur * JOURS_PAR_UNITE[s.unite]]);
    if (s.unite === 'mois' && s.valeur % 12 === 0) jours.add((s.valeur / 12) * 365);
    for (const j of jours) {
      for (const [echelle, facteur] of ECHELLES) {
        if (!delais.has(j * facteur)) {
          delais.set(j * facteur, `${j} jours en ${echelle}, ${cle} = ${s.valeur} ${s.unite}`);
        }
      }
    }
  }
  return delais;
}

const JETON = /[\p{L}_$][\p{L}\d_$]*|\d[\w.]*|\*\*|[*()]|\s+|[\s\S]/gu;

export type Produit = { ligne: number; ecrit: string; valeur: number };

/**
 * La règle des produits : tout produit d'au moins deux littéraux entiers, dans n'importe quel ordre,
 * parenthèses comprises et sur plusieurs lignes, est évalué. Rend chaque produit avec sa ligne de
 * début (base 0), tel qu'écrit, et sa valeur. Un facteur qui n'est pas un littéral entier (un nom,
 * une décimale, un grand entier `n`) clôt le produit.
 */
export function produitsDeLitteraux(texte: string): Produit[] {
  const produits: Produit[] = [];
  let facteurs: string[] = [];
  let debut = 0;
  let fin = 0;
  let attendUnFacteur = true;
  let precedent = '';
  const clore = (): void => {
    if (facteurs.length >= 2) {
      const valeur = facteurs.reduce((p, f) => p * Number(f.replace(/_/g, '')), 1);
      if (Number.isSafeInteger(valeur)) {
        produits.push({
          ligne: texte.slice(0, debut).split('\n').length - 1,
          ecrit: texte.slice(debut, fin).replace(/\s+/g, ' '),
          valeur,
        });
      }
    }
    facteurs = [];
    attendUnFacteur = true;
  };
  for (const m of texte.matchAll(JETON)) {
    const j = m[0];
    if (/^\s+$/u.test(j) || j === '(' || j === ')') continue;
    if (/^\d/.test(j)) {
      if (!/^\d(?:_?\d)*$/.test(j) || precedent === '.') {
        clore();
      } else {
        if (!attendUnFacteur) clore();
        if (facteurs.length === 0) debut = m.index;
        facteurs.push(j);
        fin = m.index + j.length;
        attendUnFacteur = false;
      }
    } else if (j === '*') {
      if (attendUnFacteur) clore();
      attendUnFacteur = true;
    } else {
      clore();
    }
    precedent = j;
  }
  clore();
  return produits;
}

const MONTANTS = montantsDeSeuil(SEUILS);
const DELAIS = delaisExprimes(SEUILS);

export function litterauxHorsSsot(
  fichiers: readonly Fichier[],
  exemptions: readonly Exemption[] = EXEMPTIONS
): Faute[] {
  const fautes: Faute[] = [];
  for (const { chemin, texte } of fichiers) {
    if (chemin === CHEMIN_SSOT) continue;
    const exemption = exemptions.find((e) => e.chemin === chemin);
    let vus = 0;
    const code = sansCommentaires(texte);
    const produits = new Map<number, string>();
    for (const p of produitsDeLitteraux(code)) {
      const delai = DELAIS.get(p.valeur);
      if (delai !== undefined && !produits.has(p.ligne))
        produits.set(p.ligne, `${p.ecrit} = ${delai}`);
    }
    code.split(/\r?\n/).forEach((ligne, i) => {
      const vu = ((): { quoi: string; litteral: string } | null => {
        const montant = montantDansLaLigne(ligne, MONTANTS);
        if (montant !== null) return { quoi: 'montant de seuil', litteral: montant };
        const produit = produits.get(i);
        if (produit !== undefined) {
          return { quoi: 'produit de littéraux égal à un délai', litteral: produit };
        }
        for (const { quoi, motif } of MOTIFS) {
          if (quoi === 'durée posée sous une clé de temps' && DATE_CIVILE.test(ligne)) continue;
          const m = motif.exec(ligne);
          if (m !== null) return { quoi, litteral: m[1]! };
        }
        return null;
      })();
      if (vu === null) return;
      vus++;
      if (exemption === undefined) {
        fautes.push({
          famille: 'litteral_hors_ssot',
          cle: `${chemin}:${i + 1}`,
          message:
            `${chemin}:${i + 1} — ${vu.quoi} « ${vu.litteral} » : ce seuil ou ce délai vit dans ` +
            `${CHEMIN_SSOT}, avec sa source et sa date (RM-10). Lis-le là, ne le retape pas.`,
        });
      }
    });
    if (exemption !== undefined && vus === 0) {
      fautes.push({
        famille: 'exemption_orpheline',
        cle: chemin,
        message:
          `${chemin} est exempté (« ${exemption.raison} ») mais ne porte plus aucun littéral : ` +
          `retire l'exemption, sans quoi elle couvrira le suivant.`,
      });
    }
  }
  return fautes;
}

// ── 3. Le préavis indexé ────────────────────────────────────────────────────────────────────────

const PREAVIS = /pr[ée]avis/i;
const ANCIENNETE =
  /anciennet|date_?d?_?entree|dateD?Entree|nombreD?Annees|annees?Completes|seniorit/i;

/** Une déclaration de premier niveau : du début d'une ligne non indentée jusqu'à la suivante. */
export function preavisIndexes(fichiers: readonly Fichier[]): Faute[] {
  const fautes: Faute[] = [];
  for (const { chemin, texte } of fichiers) {
    // Les chaînes sont blanchies : « quelle que soit l'ancienneté » dans un texte n'est pas un calcul.
    const lignes = sansCommentaires(texte, true).split(/\r?\n/);
    let debut = 0;
    const juger = (fin: number): void => {
      const bloc = lignes.slice(debut, fin).join('\n');
      if (PREAVIS.test(bloc) && ANCIENNETE.test(bloc)) {
        fautes.push({
          famille: 'preavis_indexe',
          cle: `${chemin}:${debut + 1}`,
          message:
            `${chemin}:${debut + 1} — un préavis calculé à partir d'une ancienneté : PREAVIS_JOURS ` +
            `est UNIQUE, quelle que soit l'ancienneté (contrat art. 11.1, REQ-JUR-015, M-16).`,
        });
      }
    };
    lignes.forEach((ligne, i) => {
      if (i > 0 && /^[A-Za-z]/.test(ligne)) {
        juger(i);
        debut = i;
      }
    });
    juger(lignes.length);
  }
  return fautes;
}

// ── 4. La cohérence gabarit ↔ SSOT ──────────────────────────────────────────────────────────────

/**
 * Un entier de 0 à 999 999 en lettres (orthographe traditionnelle, traits d'union) ; `null` au-delà.
 * QA-T57 : une durée de la SSOT peut dépasser 99 (`DERNIER_VIDAGE_MAX_MINUTES` = 120) ; et elle
 * peut dépasser 999 (`CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS` = 1 095). Règles du « s »
 * de cent : il prend la marque du pluriel quand il est multiplié ET termine le nombre (« deux
 * cents »), jamais suivi d'un autre nombre (« deux cent un », « cent vingt »), ni de « mille »
 * (« deux cent mille »). « Mille » est invariable et ne prend pas « un » devant lui.
 */
export function enLettres(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return null;
  if (n < 1000) return jusquaNeufCentQuatreVingtDixNeuf(n, true);
  const m = Math.floor(n / 1000);
  const r = n % 1000;
  const milliers = m === 1 ? 'mille' : `${jusquaNeufCentQuatreVingtDixNeuf(m, false)} mille`;
  return r === 0 ? milliers : `${milliers} ${jusquaNeufCentQuatreVingtDixNeuf(r, true)}`;
}

/** Un entier de 0 à 999 ; `final` : il termine le nombre (le « s » de cent n'y est admis qu'alors). */
function jusquaNeufCentQuatreVingtDixNeuf(n: number, final: boolean): string {
  // « quatre-vingts » perd aussi son « s » devant « mille » (« quatre-vingt mille »).
  const sansS = (t: string) => (final ? t : t.replace(/quatre-vingts$/, 'quatre-vingt'));
  if (n < 100) return sansS(deZeroAQuatreVingtDixNeuf(n));
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centaine = c === 1 ? 'cent' : `${UNITES_FR[c]} cent${r === 0 && final ? 's' : ''}`;
  return r === 0 ? centaine : `${centaine} ${sansS(deZeroAQuatreVingtDixNeuf(r))}`;
}

/** Un entier de 0 à 99 en lettres (orthographe traditionnelle, traits d'union). */
function deZeroAQuatreVingtDixNeuf(n: number): string {
  if (n <= 16) return UNITES_FR[n]!;
  if (n < 20) return `dix-${UNITES_FR[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const base = d === 7 ? 'soixante' : 'quatre-vingt';
    const reste = 10 + u;
    const suite = reste <= 16 ? UNITES_FR[reste]! : `dix-${UNITES_FR[reste - 10]}`;
    return d === 7 && u === 1 ? `${base} et ${suite}` : `${base}-${suite}`;
  }
  if (d === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITES_FR[u]}`;
  if (u === 0) return DIZAINES_FR[d]!;
  if (u === 1) return `${DIZAINES_FR[d]} et un`;
  return `${DIZAINES_FR[d]}-${UNITES_FR[u]}`;
}

const UNITE_ECRITE: Readonly<Record<Seuil['unite'], string>> = {
  minutes: 'minutes?',
  jours: 'jours?',
  jours_ouvres: 'jours? ouvr[ée]s',
  mois: 'mois',
  ans: '(?:ans|ann[ée]es)',
  centimes: '(?!)',
  tentatives: 'tentatives?',
};

export function fautesDeCoherence(entree: {
  seuils: Readonly<Record<string, Seuil>>;
  gabarit: string;
  annexe2: string;
}): Faute[] {
  const documents = {
    contrat: unitesDuGabarit(texteRemis(entree.gabarit)),
    'annexe-2': unitesDuGabarit(entree.annexe2),
  } as const;
  const fautes: Faute[] = [];
  for (const [cle, s] of Object.entries(entree.seuils)) {
    for (const renvoi of s.renvois) {
      const unite = documents[renvoi.document].get(renvoi.unite);
      const lieu = `${renvoi.document === 'contrat' ? 'contrat' : 'annexe 2'}, ${renvoi.unite}`;
      if (unite === undefined) {
        fautes.push({
          famille: 'renvoi_introuvable',
          cle,
          message: `${cle} renvoie à ${lieu}, que le gabarit ne contient pas.`,
        });
        continue;
      }
      const texte = normaliser([...unite.alineas, ...unite.notes].join(' '));
      if (texte.includes(`{{${cle}}}`)) continue;
      const mot = enLettres(s.valeur);
      const valeurs = [String(s.valeur), ...(mot === null ? [] : [mot])].map((v) =>
        v.replace(/[-\s]/g, '[-\\s]')
      );
      const motif = new RegExp(
        `(?<![\\p{L}\\d-])(?:${valeurs.join('|')})\\s+(?:\\p{L}+\\s+)?${UNITE_ECRITE[s.unite]}(?!\\p{L})`,
        'iu'
      );
      if (!motif.test(texte)) {
        fautes.push({
          famille: 'gabarit_diverge',
          cle,
          message:
            `${cle} vaut ${s.valeur} ${s.unite} dans ${CHEMIN_SSOT}, et ${lieu} ne l'écrit pas ` +
            `(ni « ${mot ?? s.valeur} », ni {{${cle}}}) : le contrat et le code divergent.`,
        });
      }
    }
  }
  return fautes;
}

// ── Le dépôt ────────────────────────────────────────────────────────────────────────────────────

/**
 * Les sources de `src/`, prises dans la source unique du périmètre : les fichiers SUIVIS, lus depuis
 * la racine du dépôt. Elle refuse et sort en échec, en nommant la cause, quand le périmètre ne peut
 * pas être établi — jamais une liste vide.
 */
function fichiersDeSrc(): string[] {
  return fichiersSuivisOuRefus('ssot:seuils').filter(
    (c) => c.startsWith('src/') && /\.(ts|tsx)$/.test(c) && !/\.(spec|test)\.tsx?$/.test(c)
  );
}

export function controlerDepot(racine: string): { fautes: Faute[]; fichiersLus: number } {
  const chemins = fichiersDeSrc();
  const fichiers = chemins.map((chemin) => ({
    chemin,
    texte: readFileSync(join(racine, chemin), 'utf8'),
  }));
  const fautes: Faute[] = [
    ...fautesDeLaSsot(SEUILS),
    ...litterauxHorsSsot(fichiers),
    ...preavisIndexes(fichiers),
    ...fautesDeCoherence({
      seuils: SEUILS,
      gabarit: readFileSync(join(racine, GABARIT), 'utf8'),
      annexe2: readFileSync(join(racine, ANNEXE_2), 'utf8'),
    }),
  ];
  for (const e of EXEMPTIONS) {
    if (!chemins.includes(e.chemin)) {
      fautes.push({
        famille: 'exemption_orpheline',
        cle: e.chemin,
        message: `${e.chemin} est exempté mais n'existe plus : retire l'exemption.`,
      });
    }
  }
  if (fichiers.length === 0) {
    fautes.push({
      famille: 'rien_lu',
      cle: 'src',
      message: 'aucun fichier de src/ n’a été lu : un vert sur rien n’est pas un vert.',
    });
  }
  return { fautes, fichiersLus: fichiers.length };
}

// ── La preuve : chaque famille vue rougir sur un témoin, et des contre-témoins verts ────────────

const TEMOIN_SEUIL: Seuil = {
  valeur: 15,
  unite: 'jours',
  source: 'contrat art. 11.2',
  renvois: [{ document: 'contrat', unite: '11.2' }],
  verifieLe: '2026-09-27',
};

/** Un témoin par famille : chacun DOIT produire exactement sa famille. */
export function temoins(gabarit: string, annexe2: string): { famille: string; fautes: Faute[] }[] {
  const code = (texte: string): Fichier[] => [{ chemin: 'src/server/temoin.ts', texte }];
  return [
    {
      famille: 'constante_de_gradation',
      fautes: fautesDeLaSsot({ CONTRADICTOIRE_JOURS: TEMOIN_SEUIL }),
    },
    {
      famille: 'seuil_sans_source',
      fautes: fautesDeLaSsot({ X_JOURS: { ...TEMOIN_SEUIL, source: ' ' } }),
    },
    {
      famille: 'seuil_sans_date',
      fautes: fautesDeLaSsot({ X_JOURS: { ...TEMOIN_SEUIL, verifieLe: '2026-02-30' } }),
    },
    {
      famille: 'seuil_mal_forme',
      fautes: fautesDeLaSsot({ X_JOURS: { ...TEMOIN_SEUIL, valeur: 1.5 } }),
    },
    { famille: 'litteral_hors_ssot', fautes: litterauxHorsSsot(code('const seuilDas2 = 2400;')) },
    {
      famille: 'exemption_orpheline',
      fautes: litterauxHorsSsot(
        [{ chemin: 'src/x.ts', texte: '' }],
        [{ chemin: 'src/x.ts', raison: 'témoin' }]
      ),
    },
    {
      famille: 'preavis_indexe',
      fautes: preavisIndexes(code('export const p = (anciennete: number) => preavis(anciennete);')),
    },
    {
      famille: 'gabarit_diverge',
      fautes: fautesDeCoherence({
        seuils: { MISE_EN_DEMEURE_JOURS: { ...TEMOIN_SEUIL, valeur: 8 } },
        gabarit,
        annexe2,
      }),
    },
    {
      famille: 'renvoi_introuvable',
      fautes: fautesDeCoherence({
        seuils: { X_JOURS: { ...TEMOIN_SEUIL, renvois: [{ document: 'contrat', unite: '99.9' }] } },
        gabarit,
        annexe2,
      }),
    },
  ];
}

/**
 * Les deux règles, une forme par séparateur et par écriture du produit : chacune DOIT produire
 * exactement une faute `litteral_hors_ssot`.
 */
export const TEMOINS_DE_REGLE: readonly string[] = [
  "const l = 'seuil de 2 400 €';",
  "const l = 'vigilance à 5 000 €';",
  "const l = 'vigilance à 5 000 €';",
  "const l = 'seuil de 2 400 euros';",
  "const l = 'seuil de 2.400 EUR';",
  'const l = "seuil de 2\'400";',
  'const s = 2_400;',
  "const l = 'seuil de 2,400';",
  "const l = 'vigilance dès 5000,00 €';",
  'const d = 1000 * 60 * 60 * 24 * 30;',
  'const d = 15 * 24 * 3600 * 1000;',
  'const d = (60 * 60) * (24 * 90) * 1000;',
];

/** Ce qui doit rester vert : une lecture de la SSOT, un commentaire, un nombre sans unité, un produit sans rapport. */
export const CONTRE_TEMOINS: readonly string[] = [
  'const d = SEUILS.PREAVIS_JOURS.valeur * MS_PAR_JOUR;',
  '// quinze jours, art. 11.2',
  'const n = liste.slice(0, 12);',
  'const noel = { mois: 12, jour: 25 };',
  "const l = '12 400 €';",
  'const aire = 7 * 11;',
  'const MS_PAR_JOUR = 24 * 60 * 60 * 1000;',
];

if (process.argv[1] !== undefined && /seuils-ssot[.](ts|js)$/.test(process.argv[1])) {
  if (process.argv.includes('--prove')) {
    const gabarit = readFileSync(GABARIT, 'utf8');
    const annexe2 = readFileSync(ANNEXE_2, 'utf8');
    let rate = 0;
    const liste = temoins(gabarit, annexe2);
    for (const t of liste) {
      const familles = [...new Set(t.fautes.map((f) => f.famille))];
      if (familles.length !== 1 || familles[0] !== t.famille) {
        console.error(`❌ témoin ${t.famille} : a produit [${familles.join(', ')}]`);
        rate++;
      }
    }
    for (const t of TEMOINS_DE_REGLE) {
      const f = litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: t }]);
      if (f.length !== 1 || f[0]!.famille !== 'litteral_hors_ssot') {
        console.error(`❌ témoin de règle « ${t} » : ${f.length} faute(s) au lieu d'une`);
        rate++;
      }
    }
    for (const c of CONTRE_TEMOINS) {
      const f = litterauxHorsSsot([{ chemin: 'src/server/temoin.ts', texte: c }]);
      if (f.length > 0) {
        console.error(`❌ faux positif sur « ${c} » : ${f[0]!.message}`);
        rate++;
      }
    }
    if (rate > 0) process.exit(1);
    console.log(
      `✅ ssot:seuils --prove — ${liste.length} témoins rougissent chacun de leur famille, ` +
        `${TEMOINS_DE_REGLE.length} formes des règles des montants et des produits rougissent, ` +
        `${CONTRE_TEMOINS.length} contre-témoins restent verts — preuve faite.`
    );
    process.exit(0);
  }

  const { fautes, fichiersLus } = controlerDepot('.');
  if (fautes.length > 0) {
    console.error(`❌ ssot:seuils — ${fautes.length} faute(s) :`);
    for (const f of fautes) console.error(`   [${f.famille}] ${f.message}`);
    process.exit(1);
  }
  console.log(
    `✅ ssot:seuils — ${Object.keys(SEUILS).length} constantes sourcées et datées, ` +
      `${fichiersLus} fichiers de src/ lus sans littéral hors SSOT (${EXEMPTIONS.length} exemptions ` +
      `nommées), gabarit cohérent avec la SSOT.`
  );
  process.exit(0);
}
