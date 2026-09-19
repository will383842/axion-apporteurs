/**
 * Le journal applicatif — QA-T08 (REQ-QA-024) : lignes JSON pino, caviardées sur la LIGNE FINALE.
 *
 * OÙ VIT LE CAVIARDAGE. Dans le flux de sortie, pas dans les appelants ni dans les options de pino.
 * pino écrit sa ligne dans `fluxCaviardant` ; celui-ci la relit (`JSON.parse`), la parcourt EN
 * ENTIER — toute profondeur, tout tableau, message, erreur sérialisée, liaisons des journaux
 * enfants comprises — et n'écrit que le résultat. L'option `redact` de pino juge des CHEMINS
 * (`*.email` = un seul niveau) : un objet un cran plus bas, un tableau, une clé `Courriel` passent.
 *
 * ÉCHOUE FERMÉ. Une ligne qui ne se relit pas n'est jamais écrite telle quelle : elle est remplacée
 * par une ligne de niveau 50 qui ne dit que sa taille. Aucune option `transport` de pino : ce serait
 * un fil d'exécution de plus et une seconde sortie hors du flux caviardant.
 *
 * DEUX DÉTECTIONS. Par NOM de clé — un segment du lexique de personne ou de `SEGMENTS_SECRETS`,
 * casse et accents neutralisés, ou la clé brute `apporteurId` (on journalise son EMPREINTE) : la
 * valeur entière est remplacée. Par VALEUR, sur toute chaîne et tout nom de clé : courriel, IBAN,
 * téléphone français, lien de dépôt `/d/<jeton>`.
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ICI : le niveau et la sortie entrent en paramètres.
 */
import pino from 'pino';
import { segmentsDuNom, segmentsPersonnels } from '../domain/donnees-personnelles/champs';

/**
 * Les segments de nom de champ qui désignent un SECRET. Le lexique des champs de PERSONNE n'est pas
 * ici : il est importé de DM-01 (`src/domain/donnees-personnelles/champs.ts`), seul du dépôt (RM-01).
 * Cette liste-ci est la seule du dépôt pour les secrets : INT-T14 et SEC-03 l'importeront.
 */
export const SEGMENTS_SECRETS: readonly string[] = [
  'jeton',
  'token',
  'secret',
  'password',
  'motdepasse',
  'authorization',
  'cookie',
  'signature',
];

/** Ce qui remplace la valeur d'un champ protégé. */
export const CAVIARDE = '[caviarde]';

/**
 * Les motifs de VALEUR, appliqués dans cet ordre. L'IBAN passe avant le téléphone, dont il contient
 * des suites de chiffres. Limite déclarée : un nom de personne en texte libre n'a pas de motif — la
 * règle d'appel est de ne jamais interpoler une donnée dans le message.
 */
const MOTIFS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/d\/[^\s/?#"'<>]+/g, '/d/[jeton]'],
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu, '[courriel]'],
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/gi, '[iban]'],
  [/(?<![\d+])(?:\+33|0033|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g, '[telephone]'],
];

/** Le contexte d'un journal enfant (REQ-QA-024). Aucune autre clé. */
export type ContexteJournal = {
  requestId?: string;
  apporteurIdHash?: string;
  eventId?: string;
  jobName?: string;
};

const CLES_CONTEXTE = new Set(['requestId', 'apporteurIdHash', 'eventId', 'jobName']);

/** Une empreinte : hexadécimal minuscule, 16 à 64 caractères. */
const FORME_EMPREINTE = /^[0-9a-f]{16,64}$/;

/**
 * La SEULE valeur qui échappe au scan : une empreinte SHA-256 exacte (64 hexadécimaux minuscules),
 * sous l'une des quatre clés de contexte, à la racine. Sans elle, une empreinte `ab12…` se lirait
 * comme un IBAN. Toute autre valeur de ces clés est scannée : un IBAN allemand en minuscules
 * (`de…`, 22 caractères) a la forme d'un hexadécimal et passerait sous une exemption plus large.
 */
const FORME_SHA256 = /^[0-9a-f]{64}$/;

const sansAccents = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '');

/** Une clé désigne-t-elle une donnée protégée ? Segments exacts, casse et accents neutralisés. */
export function cleProtegee(cle: string): boolean {
  const nue = sansAccents(cle);
  const compacte = nue.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compacte === 'apporteurid') return true;
  return [...segmentsDuNom(nue), compacte].some(
    (s) => segmentsPersonnels(s).length > 0 || SEGMENTS_SECRETS.includes(s)
  );
}

/** Retire d'un texte libre les valeurs reconnaissables par leur forme. */
export function caviarderTexte(texte: string): string {
  return MOTIFS.reduce((t, [motif, marque]) => t.replace(motif, marque), texte);
}

function parcourir(valeur: unknown, racine: boolean, ancetres: object[]): unknown {
  if (typeof valeur === 'string') return caviarderTexte(valeur);
  if (valeur === null || typeof valeur !== 'object') return valeur;
  if (ancetres.includes(valeur)) return '[circulaire]';
  const chemin = [...ancetres, valeur];
  if (Array.isArray(valeur)) return valeur.map((v) => parcourir(v, false, chemin));
  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(valeur)) {
    if (racine && CLES_CONTEXTE.has(cle)) {
      sortie[cle] = typeof v === 'string' && FORME_SHA256.test(v) ? v : parcourir(v, false, chemin);
    } else {
      sortie[caviarderTexte(cle)] = cleProtegee(cle) ? CAVIARDE : parcourir(v, false, chemin);
    }
  }
  return sortie;
}

/** LA fonction de caviardage : celle du journal, et celle que Sentry applique à ses événements. */
export function caviarder(valeur: unknown): unknown {
  return parcourir(valeur, true, []);
}

/** Une ligne JSON caviardée ; une ligne illisible est REMPLACÉE, jamais écrite brute. */
export function caviarderLigne(ligne: string): string {
  try {
    return JSON.stringify(caviarder(JSON.parse(ligne)));
  } catch {
    return JSON.stringify({
      level: 50,
      msg: 'ligne de journal illisible retirée',
      octets: Buffer.byteLength(ligne),
    });
  }
}

export type Sortie = { write(texte: string): unknown };

/** Le flux dans lequel pino écrit : chaque ligne est caviardée avant d'atteindre la sortie. */
export function fluxCaviardant(sortie: Sortie): Sortie {
  return {
    write(texte: string) {
      for (const ligne of texte.split('\n')) {
        if (ligne !== '') sortie.write(`${caviarderLigne(ligne)}\n`);
      }
      return true;
    },
  };
}

export type Donnees = Record<string, unknown>;

type Ecrire = (msg: string, donnees?: Donnees) => void;

export interface Journal {
  debug: Ecrire;
  info: Ecrire;
  warn: Ecrire;
  error: Ecrire;
  fatal: Ecrire;
  /** Un journal dont chaque ligne porte ce contexte. */
  enfant(contexte: ContexteJournal): Journal;
}

function exigerContexte(contexte: ContexteJournal): void {
  const h = contexte.apporteurIdHash;
  if (h !== undefined && !FORME_EMPREINTE.test(h)) {
    throw new Error(
      'apporteurIdHash doit être une empreinte hexadécimale de 16 à 64 caractères, ' +
        "jamais l'identifiant brut"
    );
  }
}

function envelopper(p: pino.Logger): Journal {
  const ecrire =
    (niveau: 'debug' | 'info' | 'warn' | 'error' | 'fatal'): Ecrire =>
    (msg, donnees) =>
      donnees === undefined ? p[niveau](msg) : p[niveau](donnees, msg);
  return {
    debug: ecrire('debug'),
    info: ecrire('info'),
    warn: ecrire('warn'),
    error: ecrire('error'),
    fatal: ecrire('fatal'),
    enfant(contexte) {
      exigerContexte(contexte);
      return envelopper(p.child(contexte));
    },
  };
}

export type OptionsJournal = { niveau?: string; sortie?: Sortie };

/** Le journal du dépôt. Sans sortie donnée, il écrit sur la sortie standard, caviardée. */
export function creerJournal(options: OptionsJournal = {}): Journal {
  const flux = fluxCaviardant(options.sortie ?? process.stdout);
  return envelopper(pino({ level: options.niveau ?? 'info' }, flux));
}
