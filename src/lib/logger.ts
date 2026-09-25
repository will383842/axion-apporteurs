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
 * DEUX DÉTECTIONS. Par NOM de clé — un segment du lexique de personne, de `SEGMENTS_SECRETS` ou de
 * `SEGMENTS_RESEAU`, casse et accents neutralisés, ou la clé brute `apporteurId` (on journalise son
 * EMPREINTE) : la valeur entière est remplacée. Par VALEUR, sur toute chaîne et tout nom de clé :
 * courriel, IBAN, téléphone français, lien de dépôt `/d/<jeton>`, adresse IPv4 ou IPv6 — sur la
 * chaîne telle quelle, puis sur sa forme décodée d'URL (`%40`, `%2540`, `+`).
 *
 * AUCUNE LECTURE D'ENVIRONNEMENT ICI : le niveau et la sortie entrent en paramètres.
 */
import pino from 'pino';
import { segmentsDuNom, segmentsPersonnels } from '../domain/donnees-personnelles/champs';
import { FORMES, HASH_HEX_64 } from '../domain/evenement/charges';
import { FORME_IBAN, cleIbanValide } from './forme-iban';

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

/**
 * Les segments de nom d'EN-TÊTE qui portent l'adresse réseau du visiteur SANS contenir le segment
 * `ip` du lexique de DM-01 (catégorie `reseau`) : `x-forwarded-for`, `forwarded` (RFC 7239),
 * `x-original-forwarded-for`. `x-real-ip`, `cf-connecting-ip`, `true-client-ip` et `x-client-ip`
 * tombent déjà sous `ip`. Un en-tête d'un autre nom est rattrapé par le motif de VALEUR `[ip]`.
 */
export const SEGMENTS_RESEAU: readonly string[] = ['forwarded'];

/** Ce qui remplace la valeur d'un champ protégé. */
export const CAVIARDE = '[caviarde]';

/**
 * Ce que devient une chaîne que `FORME_IBAN` a reconnue. La forme est GOURMANDE : son dernier groupe
 * (un à quatre caractères, précédé d'une espace) avale le mot court qui suit — « FR76 … 189 et » —
 * et la clé échoue alors sur le tout. On retire donc les mots de fin un à un, et la clé décide sur
 * chaque préfixe ; le mot retiré ressort tel quel. Aucun préfixe valide : la chaîne ressort intacte.
 */
function ibanEnTete(trouve: string): string {
  for (let t = trouve; t !== ''; t = t.slice(0, Math.max(t.lastIndexOf(' '), 0))) {
    if (cleIbanValide(t)) return `[iban]${trouve.slice(t.length)}`;
  }
  return trouve;
}

/** Un groupe d'une adresse IPv6 : un à quatre hexadécimaux. */
const H6 = '[0-9a-f]{1,4}';

/**
 * Les motifs de VALEUR, appliqués dans cet ordre. L'IBAN passe avant le téléphone, dont il contient
 * des suites de chiffres ; le téléphone avant l'IPv4 (`06.12.34.56.78`) ; l'IPv4 avant l'IPv6, dont
 * la forme mixte `::ffff:203.0.113.7` s'arrêterait sinon au point.
 *
 * L'IBAN est LA règle du dépôt (`forme-iban.ts`) : un code pays, puis la clé mod 97. Sans eux, un
 * identifiant hexadécimal sur une vingtaine se lisait comme un IBAN (relecture de la PR 88).
 *
 * L'IPv6 exige sept deux-points ou un `::`, et ni lettre, chiffre ni deux-points de part et d'autre :
 * une heure (`12:34:56`) et un identifiant hexadécimal, qui n'a pas de deux-points, passent.
 *
 * Limite déclarée : un nom de personne en texte libre n'a pas de motif — la règle d'appel est de ne
 * jamais interpoler une donnée dans le message.
 *
 * DETTE DÉCLARÉE : ce motif de courriel est le troisième du dépôt ; celui de
 * `packages/contracts/events.ts` (`motifValeur` de `coordonnees_du_contact`) a une autre forme,
 * n'est pas exporté seul et n'est pas global. Les réunir est une tâche de source unique à verser.
 */
const MOTIFS: ReadonlyArray<readonly [RegExp, string | ((trouve: string) => string)]> = [
  [/\/d\/[^\s/?#"'<>]+/g, '/d/[jeton]'],
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu, '[courriel]'],
  [FORME_IBAN, ibanEnTete],
  [/(?<![\d+])(?:\+33|0033|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g, '[telephone]'],
  [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\.?\d)/g, '[ip]'],
  [
    new RegExp(
      `(?<![0-9a-z:])(?:(?:${H6}:){7}${H6}|${H6}(?::${H6})*::(?:${H6}(?::${H6})*)?|::${H6}(?::${H6})*)(?![0-9a-z:])`,
      'gi'
    ),
    '[ip]',
  ],
];

/**
 * Le contexte d'un journal enfant (REQ-QA-024). Aucune autre clé.
 *
 * POURQUOI `event_id` EN SNAKE_CASE, SEUL PARMI TROIS CAMELCASE — ne pas le « corriger ».
 * Le terme canonique est `event_id` : le champ d'enveloppe décrit par
 * `packages/contracts/enveloppe.ts` (REQ-INT-003), et sa forme camelCase est un synonyme INTERDIT
 * du glossaire (`docs/GLOSSAIRE.md` §5, interdit sec). Cette clé ne nomme rien d'autre que cet
 * identifiant-là : la clé d'idempotence du récepteur, qui n'entre dans ce dépôt que par le fil.
 * REQ-QA-024 l'écrit encore en camelCase et CONVENTIONS §1 impose le camelCase au code de ce
 * dépôt — mais `docs/PRESEANCE.md` §2, ligne 7, donne au glossaire la primauté sur tout autre
 * document « sur un terme et ses synonymes interdits ». La remettre en camelCase fait rougir
 * `pnpm gov:termes-interdits`, qui n'accorde d'exemption de citation qu'aux `.md`, `.sql` et
 * `.prisma` : ce commentaire-ci ne peut donc pas écrire la forme interdite, même pour l'expliquer.
 */
export type ContexteJournal = {
  requestId?: string;
  apporteurIdHash?: string;
  event_id?: string;
  jobName?: string;
};

const CLES_CONTEXTE = new Set(['requestId', 'apporteurIdHash', 'event_id', 'jobName']);

/** Une empreinte : hexadécimal minuscule, 16 à 64 caractères. */
const FORME_EMPREINTE = /^[0-9a-f]{16,64}$/;

/** `event_id` et `trace_id` du protocole Sentry : 32 hexadécimaux minuscules. */
const HEX_32 = /^[0-9a-f]{32}$/;
/** `span_id` et `parent_span_id` du protocole Sentry : 16 hexadécimaux minuscules. */
const HEX_16 = /^[0-9a-f]{16}$/;
const UUID = FORMES.identifiant();

/**
 * LES SEULES VALEURS QUI ÉCHAPPENT AU SCAN : un identifiant technique NOMMÉ, à toute profondeur,
 * dont la valeur a EXACTEMENT la forme attendue pour ce nom. Le nom seul ne suffit pas — un
 * `requestId` qui porte un courriel est scanné ; la forme seule non plus — le même hexadécimal dans
 * un message est scanné. Sans cette exemption, un identifiant aléatoire croise tôt ou tard un motif
 * de valeur (IBAN à clé valide, suite de dix chiffres commençant par 0) : mesuré sur 400
 * identifiants, 23 altérés, dont deux par le motif téléphone.
 *
 * Toute autre valeur de ces clés est scannée : un IBAN allemand en minuscules (`de…`, 22
 * caractères) a la forme d'un hexadécimal, et n'a aucune des formes ci-dessous. Limite déclarée :
 * un IBAN belge en minuscules (16 caractères, `be…`) a la forme d'un `span_id` ; il ne passerait
 * que sous ce nom-là.
 */
const IDENTIFIANTS_TECHNIQUES: ReadonlyMap<string, (v: string) => boolean> = new Map([
  ['apporteurIdHash', (v: string) => HASH_HEX_64.test(v)],
  ['requestId', (v: string) => UUID.safeParse(v).success || HEX_32.test(v)],
  ['event_id', (v: string) => UUID.safeParse(v).success || HEX_32.test(v)],
  ['trace_id', (v: string) => HEX_32.test(v)],
  ['span_id', (v: string) => HEX_16.test(v)],
  ['parent_span_id', (v: string) => HEX_16.test(v)],
]);

const sansAccents = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '');

/** Une clé désigne-t-elle une donnée protégée ? Segments exacts, casse et accents neutralisés. */
export function cleProtegee(cle: string): boolean {
  const nue = sansAccents(cle);
  const compacte = nue.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compacte === 'apporteurid') return true;
  return [...segmentsDuNom(nue), compacte].some(
    (s) =>
      segmentsPersonnels(s).length > 0 ||
      SEGMENTS_SECRETS.includes(s) ||
      SEGMENTS_RESEAU.includes(s)
  );
}

function appliquerMotifs(texte: string): string {
  return MOTIFS.reduce(
    (t, [motif, marque]) =>
      typeof marque === 'string' ? t.replace(motif, marque) : t.replace(motif, marque),
    texte
  );
}

/**
 * Les suites `%XX` décodées, jusqu'à trois fois (`%2540` → `%40` → `@`). Jamais d'exception : une
 * suite que `decodeURIComponent` refuse ne décode que ses octets ASCII.
 */
function decoderPourcents(texte: string): string {
  let t = texte;
  for (let passe = 0; passe < 3; passe += 1) {
    const lu = t.replace(/(?:%[0-9a-f]{2})+/gi, (suite) => {
      try {
        return decodeURIComponent(suite);
      } catch {
        return suite.replace(/%([0-7][0-9a-f])/gi, (_, h: string) =>
          String.fromCharCode(parseInt(h, 16))
        );
      }
    });
    if (lu === t) break;
    t = lu;
  }
  return t;
}

/**
 * Les LECTURES d'une chaîne que les motifs jugent après la forme brute : décodée d'URL, puis avec
 * `+` lu comme une espace (formulaire encodé). Une lecture ne remplace la chaîne que si un motif y
 * a trouvé quelque chose : une URL sans donnée protégée ressort telle quelle, encodage compris.
 */
const LECTURES: ReadonlyArray<(t: string) => string> = [
  decoderPourcents,
  (t) => t.replace(/\+/g, ' '),
];

/** Retire d'un texte libre les valeurs reconnaissables par leur forme, encodées d'URL ou non. */
export function caviarderTexte(texte: string): string {
  return LECTURES.reduce((sortie, lire) => {
    const lu = lire(sortie);
    if (lu === sortie) return sortie;
    const caviarde = appliquerMotifs(lu);
    return caviarde === lu ? sortie : caviarde;
  }, appliquerMotifs(texte));
}

function parcourir(valeur: unknown, racine: boolean, ancetres: object[]): unknown {
  if (typeof valeur === 'string') return caviarderTexte(valeur);
  if (valeur === null || typeof valeur !== 'object') return valeur;
  if (ancetres.includes(valeur)) return '[circulaire]';
  const chemin = [...ancetres, valeur];
  if (Array.isArray(valeur)) return valeur.map((v) => parcourir(v, false, chemin));
  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(valeur)) {
    const forme = IDENTIFIANTS_TECHNIQUES.get(cle);
    if (forme !== undefined && typeof v === 'string' && forme(v)) {
      sortie[cle] = v;
    } else if (racine && CLES_CONTEXTE.has(cle)) {
      sortie[cle] = parcourir(v, false, chemin);
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
