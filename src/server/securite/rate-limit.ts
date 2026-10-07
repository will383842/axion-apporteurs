/**
 * Les compteurs de débit, et leur conduite quand le cache tombe. (SEC-10, REQ-SEC-016)
 *
 * UN COMPTEUR N'EXISTE QUE DÉCLARÉ ICI. `COMPTEURS` est le registre unique : un compteur écrit
 * ailleurs, sous un nom calculé ou sous un préfixe hors des cinq familles fait rougir
 * `scripts/gates/rate-famille.ts`. Chaque déclaration porte sa conduite sur panne, REQUISE par
 * le type — aucun `?`, aucun défaut : un prédicat optionnel à défaut ouvert échoue ouvert, et
 * c'est ce que cette bibliothèque ferme. La garde la revérifie, parce qu'un type se contourne.
 *
 * LE SUJET D'UN COMPTEUR EST UNE EMPREINTE, jamais une valeur. Une adresse de courriel ou une
 * adresse réseau en clair dans une clé du cache est une donnée personnelle hors de la base ; le
 * type marqué l'empêche, le constructeur la refuse. Ce module ne hache rien.
 *
 * UNE PANNE EST RAPIDE, SUIT LA CONDUITE DÉCLARÉE, ET SE DIT. Le client est bâti sans file hors
 * ligne, sans nouvelle tentative et avec des délais bornés : un cache tombé rend une erreur, il ne
 * suspend pas la requête. Le verdict porte `panne: true` et son motif, et chaque panne est signalée
 * par son PRÉFIXE seul — la clé porte l'empreinte, elle ne sort pas.
 *
 * LES LIMITES SONT CELLES DES EXIGENCES, avec leur source. Une limite qu'aucune exigence ne chiffre
 * ne s'invente pas : elle attend sa configuration, et en attendant le compteur refuse.
 *
 * SEC-72 (REQ-SEC-021) — LA CONFIGURATION PRIVÉE. Les trois compteurs `verif:` de « Vérifier une
 * entreprise » servent à repérer un usage anormal : leurs limites et leurs fenêtres ne sont PAS au
 * dépôt, qui est public. Ils portent la sentinelle `LIMITE_HORS_DEPOT`, et `limiter` lit leurs valeurs
 * dans le secret `PARTNERS_VERIFICATION_PLAFONDS` (cinq clés fermées et bornées, `lirePlafondsHorsDepot`).
 * Absent, illisible ou incohérent : `limite_non_configuree`, donc le REFUS (`surPanne: refuser`).
 */

import { randomUUID } from 'node:crypto';
import Redis, { type RedisOptions } from 'ioredis';
import { SEUILS } from '../../domain/seuils/ssot';
// La conversion d'une fenêtre lue en minutes dans la SSOT : la constante nommée de la table fermée
// que lit la garde `rate-famille`, jamais un nombre tapé dans la déclaration d'un compteur.
import { SECONDES_PAR_MINUTE } from '../../domain/seuils/conversions';
import { MS_PAR_JOUR, MS_PAR_MINUTE } from '../../domain/temps/calendrier-civil';

// ── Le vocabulaire fermé ────────────────────────────────────────────────────────────────────────

/** Les cinq familles de REQ-SEC-016. Un sixième préfixe passe par l'exigence, pas par ce fichier. */
export const PREFIXES_DE_FAMILLE = [
  'magic:',
  'depot:',
  'verif:',
  'webhook:',
  'auth:',
  // UX-P1-62 (REQ-SEC-016 amendée, arbitrage de la coordination) : l'écrit de l'apporteur.
  'ecrit:',
] as const;
export type PrefixeDeFamille = (typeof PREFIXES_DE_FAMILLE)[number];

/** Les deux conduites possibles quand le cache ne répond pas. Il n'y en a pas de troisième. */
export const CONDUITES_SUR_PANNE = ['refuser', 'laisser-passer'] as const;
export type ConduiteSurPanne = (typeof CONDUITES_SUR_PANNE)[number];

/**
 * La marque d'une limite qu'aucune exigence ne chiffre : elle attend une configuration. Tant
 * qu'aucune ne la fournit, le compteur répond comme en panne, sous sa conduite déclarée, avec le
 * motif `limite_non_configuree`. Une limite qui n'est écrite nulle part ne s'invente pas ici.
 */
export const LIMITE_HORS_DEPOT = 'hors-depot' as const;

export interface DeclarationDeCompteur {
  readonly prefixe: PrefixeDeFamille;
  readonly limite: number | typeof LIMITE_HORS_DEPOT;
  readonly fenetreSecondes: number | typeof LIMITE_HORS_DEPOT;
  readonly surPanne: ConduiteSurPanne;
  readonly source: `REQ-${string}`;
  /**
   * Le segment du texte de l'exigence qui DÉSIGNE ce compteur. La garde y lit la limite, la
   * fenêtre et la conduite exigées, et les confronte à la déclaration.
   */
  readonly ancre: string;
  /** RM-10 : la date (AAAA-MM-JJ) à laquelle la valeur a été confrontée à sa source. */
  readonly verifieLe: `${number}-${number}-${number}`;
}

// ── Le registre ─────────────────────────────────────────────────────────────────────────────────

/**
 * Le registre unique. Le nom d'un compteur commence par son préfixe ; la clé du cache est
 * `${nom}:${sujet}`, rien d'autre.
 */
export const COMPTEURS = {
  'magic:ip': {
    prefixe: 'magic:',
    limite: 10,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
    ancre: 'par hash IP',
    verifieLe: '2026-09-19',
  },
  'magic:courriel': {
    prefixe: 'magic:',
    limite: 5,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
    ancre: 'par email',
    verifieLe: '2026-09-19',
  },
  // SEC-54 — la VÉRIFICATION du code à six chiffres : deux compteurs distincts de ceux de la demande
  // de lien, en plus du plafond de cinq essais par lien que la base tient. Sujet : une EMPREINTE
  // (adresse réseau, adresse saisie normalisée), jamais l'adresse en clair. Échec fermé.
  'magic:code-ip': {
    prefixe: 'magic:',
    limite: 20,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
    ancre: 'par hash IP au code',
    verifieLe: '2026-10-03',
  },
  'magic:code-courriel': {
    prefixe: 'magic:',
    limite: 10,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-002',
    ancre: 'par email au code',
    verifieLe: '2026-10-03',
  },
  // SEC-29 — la connexion de la CONSOLE : quatre compteurs propres, plus stricts que ceux de
  // l'espace (REQ-SEC-062), dans la famille du lien magique qu'elle emploie. Un compteur est sa clé :
  // la console ne partage aucun budget avec l'espace. Sujet : une empreinte. Échec fermé.
  'magic:console-demande-ip': {
    prefixe: 'magic:',
    limite: 10,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-062',
    ancre: 'par hash IP à la demande de la console',
    verifieLe: '2026-10-03',
  },
  'magic:console-demande-courriel': {
    prefixe: 'magic:',
    limite: 3,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-062',
    ancre: 'par email à la demande de la console',
    verifieLe: '2026-10-03',
  },
  'magic:console-code-ip': {
    prefixe: 'magic:',
    limite: 10,
    fenetreSecondes: 900,
    surPanne: 'refuser',
    source: 'REQ-SEC-062',
    ancre: 'par hash IP au code de la console',
    verifieLe: '2026-10-03',
  },
  'magic:console-code-courriel': {
    prefixe: 'magic:',
    // L'ordre des champs diffère des autres entrées : le bloc « limite, fenêtre, conduite » de
    // `magic:courriel` reste unique, et le témoin d'effet de rate-famille y retire la conduite.
    surPanne: 'refuser',
    limite: 5,
    fenetreSecondes: 900,
    source: 'REQ-SEC-062',
    ancre: 'par email au code de la console',
    verifieLe: '2026-10-03',
  },
  // SEC-12 : deux compteurs, l'empreinte réseau et l'empreinte de session, sur la même fenêtre ; les
  // valeurs vivent dans la SSOT (RM-10), confrontées par la garde au texte de REQ-SEC-016.
  'depot:ip': {
    prefixe: 'depot:',
    limite: SEUILS.DEPOT_PAR_IP_PAR_FENETRE.valeur,
    fenetreSecondes: SEUILS.DEPOT_FENETRE_MINUTES.valeur * SECONDES_PAR_MINUTE,
    surPanne: 'refuser',
    source: 'REQ-SEC-016',
    ancre: "compteur d'IP (hash IP)",
    verifieLe: '2026-10-04',
  },
  'depot:session': {
    prefixe: 'depot:',
    limite: SEUILS.DEPOT_PAR_SESSION_PAR_FENETRE.valeur,
    fenetreSecondes: SEUILS.DEPOT_FENETRE_MINUTES.valeur * SECONDES_PAR_MINUTE,
    surPanne: 'refuser',
    source: 'REQ-SEC-016',
    ancre: 'compteur de SESSION',
    verifieLe: '2026-10-04',
  },
  // INT-T09 — le mandataire de recherche d'entreprises, un geste du dépôt.
  //
  // ⚠️ CE COMMENTAIRE A DIT LE CONTRAIRE JUSQU'AU 2026-09-23, et sa condition est levée : il
  // annonçait que REQ-INT-020 et REQ-SEC-013 n'écrivaient ni la conduite sur panne après leur
  // ancre, ni la limite sous la forme que la garde lit avant elle, et que `rate-famille` les
  // refuserait « tant que le gardien de la spécification n'a pas amendé ces deux textes ». Il les
  // a amendés, à VALEUR CONSTANTE : `5 / 1 s` et `120 / 86400 s` sont la mise en forme de ce que
  // la prose disait déjà (« limiteur global 5 req/s », « par identité (120/j) »).
  //
  // 🔑 Et le chiffre manquant n'était PAS l'obstacle : `exigenceDuCompteur` rend `null` dès
  // l'absence de `surPanne:` après l'ancre, et retombe sur la SENTINELLE hors dépôt quand la
  // limite, elle, n'est chiffrée nulle part. `depot:entreprise-ip` est donc entré ici SANS qu'aucun
  // plafond soit inventé, et la question de le chiffrer a été posée à Will plutôt que tranchée.
  // ✅ Elle l'est depuis le 2026-09-23 : voir le plafond arbitré plus bas.
  //
  // Les conduites ci-dessous se dérivent des textes : la plus fermée pour le débit global et
  // l'identité — `laisser-passer` y annulerait le plafond exactement quand il sert, et le parcours
  // bascule de toute façon en saisie manuelle, donc le dépôt n'est jamais bloqué — et
  // `laisser-passer` pour l'IP, où la sentinelle répond toujours « comme en panne » : `refuser` y
  // bloquerait l'autocomplétion en permanence.
  'depot:entreprise-global': {
    prefixe: 'depot:',
    limite: 5,
    fenetreSecondes: 1,
    surPanne: 'refuser',
    source: 'REQ-INT-020',
    ancre: 'limiteur global',
    verifieLe: '2026-09-19',
  },
  'depot:entreprise-identite': {
    prefixe: 'depot:',
    limite: 120,
    fenetreSecondes: 86_400,
    surPanne: 'refuser',
    source: 'REQ-SEC-013',
    ancre: 'par identité',
    verifieLe: '2026-09-19',
  },
  // 🔑 Le plafond par IP a été ARBITRÉ le 2026-09-23 (`HYP-SEC-IP-AUTOCOMPLETION`), après avoir
  // vécu à la sentinelle hors dépôt — c'est-à-dire sans opposer aucune limite. Trois mesures le
  // bornent : le tiers plafonne déjà à 7 req/s par IP (25 200/h), donc 600/h est le contraignant ;
  // une IP est partagée et le plafond par identité vaut 120/24 h, donc 600/h laisse cinq apporteurs
  // consommer leur journée entière dans la même heure ; et le plafond voisin de REQ-SEC-016
  // (20 / 10 min) garde un geste RARE, quand celui-ci garde une salve de frappe.
  // ⚠️ Le nombre est un CHOIX borné par ces trois mesures, pas une dérivation. Réversible par
  // paramètre, et le registre des décisions le dit.
  'depot:entreprise-ip': {
    prefixe: 'depot:',
    limite: 600,
    fenetreSecondes: 3600,
    surPanne: 'laisser-passer',
    source: 'REQ-SEC-013',
    ancre: 'par hash IP',
    verifieLe: '2026-09-19',
  },
  // SEC-44 — l'API appelée par axionia : 60 par minute, sur l'empreinte de l'adresse
  // AUTORISÉE. `refuser` sur panne : l'API ne sert qu'axionia, un refus passager est rejoué par
  // l'appelant ; une panne qui l'ouvrirait lèverait le plafond quand il sert.
  'auth:axionia-ip': {
    prefixe: 'auth:',
    limite: 60,
    fenetreSecondes: 60,
    surPanne: 'refuser',
    source: 'REQ-SEC-012',
    ancre: 'par hash IP',
    verifieLe: '2026-10-02',
  },
  // SEC-72 (REQ-SEC-021) : « Vérifier une entreprise », par identité sur deux fenêtres et par
  // empreinte d'adresse. Limites et fenêtres HORS DÉPÔT, lues dans `PARTNERS_VERIFICATION_PLAFONDS` ;
  // `refuser` sur panne : une vérification refusée n'empêche rien, le dépôt ne passe pas par elle.
  'verif:identite-jour': {
    prefixe: 'verif:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-021',
    ancre: 'verif:identite-jour',
    verifieLe: '2026-10-07',
  },
  'verif:identite-court': {
    prefixe: 'verif:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-021',
    ancre: 'verif:identite-court',
    verifieLe: '2026-10-07',
  },
  'verif:ip-jour': {
    prefixe: 'verif:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-021',
    ancre: 'verif:ip-jour',
    verifieLe: '2026-10-07',
  },
  // UX-P1-62 (REQ-SEC-016, condition a de la sécurité) : l'envoi d'un écrit, par session et par
  // apporteur. Limites et fenêtres HORS DÉPÔT, lues dans `PARTNERS_ECRIT_PLAFONDS` ; `refuser` sur panne.
  'ecrit:session': {
    prefixe: 'ecrit:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-016',
    ancre: 'ecrit:session',
    verifieLe: '2026-10-08',
  },
  'ecrit:apporteur': {
    prefixe: 'ecrit:',
    limite: LIMITE_HORS_DEPOT,
    fenetreSecondes: LIMITE_HORS_DEPOT,
    surPanne: 'refuser',
    source: 'REQ-SEC-016',
    ancre: 'ecrit:apporteur',
    verifieLe: '2026-10-08',
  },
} as const satisfies Readonly<Record<`${PrefixeDeFamille}${string}`, DeclarationDeCompteur>>;

/** Une faute de frappe dans le nom d'un compteur ne compile pas. */
export type NomDeCompteur = keyof typeof COMPTEURS;

// ── La configuration privée (SEC-72) ────────────────────────────────────────────────────────────

/** Le SECRET qui porte les plafonds de la vérification ; son nom seul est au dépôt. */
export const VARIABLE_DES_PLAFONDS = 'PARTNERS_VERIFICATION_PLAFONDS' as const;

/** Les cinq clés, FERMÉES : trois limites, deux fenêtres en minutes. */
export const CLES_DES_PLAFONDS = [
  'identite_jour',
  'identite_court',
  'ip_jour',
  'fenetre_jour_minutes',
  'fenetre_court_minutes',
] as const;
export type CleDePlafond = (typeof CLES_DES_PLAFONDS)[number];

/** Les motifs, FERMÉS, d'un réglage refusé. Le refus nomme la clé et le motif, jamais la valeur. */
export const MOTIFS_DE_PLAFONDS_REFUSES = [
  'absent',
  'forme',
  'inconnue',
  'en_double',
  'absente',
  'hors_bornes',
  'incoherente',
] as const;
export type MotifDePlafondsRefuses = (typeof MOTIFS_DE_PLAFONDS_REFUSES)[number];

/** Les bornes de FORME (sécurité) : une limite vaut au moins 1 ; une fenêtre, d'une minute à une semaine. */
// Une semaine du CALENDRIER (une borne de forme, pas un délai du contrat : rien de la SSOT).
const JOURS_PAR_SEMAINE = 7;
const MINUTES_PAR_SEMAINE = (JOURS_PAR_SEMAINE * MS_PAR_JOUR) / MS_PAR_MINUTE;
const BORNES_DES_PLAFONDS: Readonly<Record<CleDePlafond, readonly [number, number]>> = {
  identite_jour: [1, 99_999],
  identite_court: [1, 99_999],
  ip_jour: [1, 99_999],
  fenetre_jour_minutes: [1, MINUTES_PAR_SEMAINE],
  fenetre_court_minutes: [1, MINUTES_PAR_SEMAINE],
};

/** Quelle clé porte la limite, et laquelle la fenêtre, de chaque compteur hors dépôt. */
export const PLAFONDS_EN_CONFIGURATION = {
  'verif:identite-jour': { limite: 'identite_jour', fenetreMinutes: 'fenetre_jour_minutes' },
  'verif:identite-court': { limite: 'identite_court', fenetreMinutes: 'fenetre_court_minutes' },
  'verif:ip-jour': { limite: 'ip_jour', fenetreMinutes: 'fenetre_jour_minutes' },
} as const satisfies Readonly<
  Partial<Record<NomDeCompteur, { limite: CleDePlafond; fenetreMinutes: CleDePlafond }>>
>;

export type LectureDesPlafonds =
  | { readonly ok: true; readonly plafonds: Readonly<Record<CleDePlafond, number>> }
  | {
      readonly ok: false;
      readonly cle: CleDePlafond | '(forme)';
      readonly motif: MotifDePlafondsRefuses;
    };

const FORME_D_UNE_PAIRE = /^([a-z_]+)=(\d{1,5})$/;

/**
 * Le SEUL lecteur du secret des plafonds, en ÉCHEC FERMÉ : clés fermées, chacune une fois, bornées,
 * et COHÉRENTES — la rafale sous le plafond journalier (limite ET fenêtre), le plafond par adresse au
 * moins égal à celui par identité. Le refus ne recopie JAMAIS une valeur reçue.
 */
export function lirePlafondsHorsDepot(texte: string | undefined): LectureDesPlafonds {
  if (texte === undefined || texte === '') return { ok: false, cle: '(forme)', motif: 'absent' };
  const lues = new Map<CleDePlafond, number>();
  for (const paire of texte.split(';')) {
    const m = FORME_D_UNE_PAIRE.exec(paire);
    if (m === null) return { ok: false, cle: '(forme)', motif: 'forme' };
    const cle = m[1] as CleDePlafond;
    if (!(CLES_DES_PLAFONDS as readonly string[]).includes(cle)) {
      return { ok: false, cle: '(forme)', motif: 'inconnue' };
    }
    if (lues.has(cle)) return { ok: false, cle, motif: 'en_double' };
    lues.set(cle, Number(m[2]));
  }
  for (const cle of CLES_DES_PLAFONDS) {
    const v = lues.get(cle);
    if (v === undefined) return { ok: false, cle, motif: 'absente' };
    const [min, max] = BORNES_DES_PLAFONDS[cle];
    if (v < min || v > max) return { ok: false, cle, motif: 'hors_bornes' };
  }
  const p = Object.fromEntries(lues) as Record<CleDePlafond, number>;
  if (p.identite_court >= p.identite_jour) {
    return { ok: false, cle: 'identite_court', motif: 'incoherente' };
  }
  if (p.fenetre_court_minutes >= p.fenetre_jour_minutes) {
    return { ok: false, cle: 'fenetre_court_minutes', motif: 'incoherente' };
  }
  if (p.ip_jour < p.identite_jour) return { ok: false, cle: 'ip_jour', motif: 'incoherente' };
  return { ok: true, plafonds: p };
}

// ── Le second secret : les plafonds de l'écrit (UX-P1-62) ───────────────────────────────────────

/** Le SECRET qui porte les plafonds de l'écrit ; son nom seul est au dépôt. */
export const VARIABLE_DES_PLAFONDS_DE_L_ECRIT = 'PARTNERS_ECRIT_PLAFONDS' as const;

/** Les quatre clés, FERMÉES : deux limites, deux fenêtres en minutes. */
export const CLES_DES_PLAFONDS_DE_L_ECRIT = [
  'session',
  'apporteur',
  'fenetre_session_minutes',
  'fenetre_apporteur_minutes',
] as const;
export type CleDePlafondDeLEcrit = (typeof CLES_DES_PLAFONDS_DE_L_ECRIT)[number];

const BORNES_DE_L_ECRIT: Readonly<Record<CleDePlafondDeLEcrit, readonly [number, number]>> = {
  session: [1, 99_999],
  apporteur: [1, 99_999],
  fenetre_session_minutes: [1, MINUTES_PAR_SEMAINE],
  fenetre_apporteur_minutes: [1, MINUTES_PAR_SEMAINE],
};

/** Quelle clé porte la limite, et laquelle la fenêtre, de chaque compteur de l'écrit. */
export const PLAFONDS_DE_L_ECRIT_EN_CONFIGURATION = {
  'ecrit:session': { limite: 'session', fenetreMinutes: 'fenetre_session_minutes' },
  'ecrit:apporteur': { limite: 'apporteur', fenetreMinutes: 'fenetre_apporteur_minutes' },
} as const satisfies Readonly<
  Partial<
    Record<NomDeCompteur, { limite: CleDePlafondDeLEcrit; fenetreMinutes: CleDePlafondDeLEcrit }>
  >
>;

/**
 * La correspondance FERMÉE compteur → secret (condition de la sécurité) : les trois `verif:` ne lisent
 * que le secret de la vérification, les deux `ecrit:` que celui de l'écrit. La garde la confronte.
 */
export const SECRET_DU_COMPTEUR = {
  'verif:identite-jour': VARIABLE_DES_PLAFONDS,
  'verif:identite-court': VARIABLE_DES_PLAFONDS,
  'verif:ip-jour': VARIABLE_DES_PLAFONDS,
  'ecrit:session': VARIABLE_DES_PLAFONDS_DE_L_ECRIT,
  'ecrit:apporteur': VARIABLE_DES_PLAFONDS_DE_L_ECRIT,
} as const satisfies Readonly<Partial<Record<NomDeCompteur, string>>>;

export type LectureDesPlafondsDeLEcrit =
  | { readonly ok: true; readonly plafonds: Readonly<Record<CleDePlafondDeLEcrit, number>> }
  | {
      readonly ok: false;
      readonly cle: CleDePlafondDeLEcrit | '(forme)';
      readonly motif: MotifDePlafondsRefuses;
    };

/**
 * Le SEUL lecteur du secret de l'écrit, en ÉCHEC FERMÉ, sur les règles de celui de la vérification :
 * clés fermées, chacune une fois, bornées, et COHÉRENTES — la limite par session au plus égale à celle
 * par apporteur. Le refus ne recopie JAMAIS une valeur reçue.
 */
export function lirePlafondsDeLEcrit(texte: string | undefined): LectureDesPlafondsDeLEcrit {
  if (texte === undefined || texte === '') return { ok: false, cle: '(forme)', motif: 'absent' };
  const lues = new Map<CleDePlafondDeLEcrit, number>();
  for (const paire of texte.split(';')) {
    const m = FORME_D_UNE_PAIRE.exec(paire);
    if (m === null) return { ok: false, cle: '(forme)', motif: 'forme' };
    const cle = m[1] as CleDePlafondDeLEcrit;
    if (!(CLES_DES_PLAFONDS_DE_L_ECRIT as readonly string[]).includes(cle)) {
      return { ok: false, cle: '(forme)', motif: 'inconnue' };
    }
    if (lues.has(cle)) return { ok: false, cle, motif: 'en_double' };
    lues.set(cle, Number(m[2]));
  }
  for (const cle of CLES_DES_PLAFONDS_DE_L_ECRIT) {
    const v = lues.get(cle);
    if (v === undefined) return { ok: false, cle, motif: 'absente' };
    const [min, max] = BORNES_DE_L_ECRIT[cle];
    if (v < min || v > max) return { ok: false, cle, motif: 'hors_bornes' };
  }
  const p = Object.fromEntries(lues) as Record<CleDePlafondDeLEcrit, number>;
  if (p.session > p.apporteur) return { ok: false, cle: 'session', motif: 'incoherente' };
  return { ok: true, plafonds: p };
}

/** La limite et la fenêtre d'un compteur hors dépôt, lues dans SON secret ; `null` : non configuré. */
function plafondsDuCompteur(
  nom: NomDeCompteur
): { limite: number; fenetreSecondes: number } | null {
  const cles = (
    PLAFONDS_EN_CONFIGURATION as Readonly<
      Partial<Record<string, { limite: CleDePlafond; fenetreMinutes: CleDePlafond }>>
    >
  )[nom];
  if (cles === undefined) return plafondsDeLEcrit(nom);
  const lecture = lirePlafondsHorsDepot(process.env[VARIABLE_DES_PLAFONDS]);
  if (!lecture.ok) {
    // Le refus se DIT : la clé et le motif fermé, jamais la valeur, jamais le secret.
    process.stderr.write(
      `${JSON.stringify({ signal: 'plafonds_verification_refuses', cle: lecture.cle, motif: lecture.motif })}\n`
    );
    return null;
  }
  return {
    limite: lecture.plafonds[cles.limite],
    fenetreSecondes: lecture.plafonds[cles.fenetreMinutes] * SECONDES_PAR_MINUTE,
  };
}

/** La limite et la fenêtre d'un compteur de l'écrit, lues dans le secret de l'écrit SEUL. */
function plafondsDeLEcrit(nom: NomDeCompteur): { limite: number; fenetreSecondes: number } | null {
  const cles = (
    PLAFONDS_DE_L_ECRIT_EN_CONFIGURATION as Readonly<
      Partial<
        Record<string, { limite: CleDePlafondDeLEcrit; fenetreMinutes: CleDePlafondDeLEcrit }>
      >
    >
  )[nom];
  if (cles === undefined) return null;
  const lecture = lirePlafondsDeLEcrit(process.env[VARIABLE_DES_PLAFONDS_DE_L_ECRIT]);
  if (!lecture.ok) {
    // Le refus se DIT : la clé et le motif fermé, jamais la valeur, jamais le secret.
    process.stderr.write(
      `${JSON.stringify({ signal: 'plafonds_ecrit_refuses', cle: lecture.cle, motif: lecture.motif })}\n`
    );
    return null;
  }
  return {
    limite: lecture.plafonds[cles.limite],
    fenetreSecondes: lecture.plafonds[cles.fenetreMinutes] * SECONDES_PAR_MINUTE,
  };
}

// ── Le sujet : une empreinte, jamais une valeur ─────────────────────────────────────────────────

declare const marqueDeSujet: unique symbol;
export type SujetDeCompteur = string & { readonly [marqueDeSujet]: 'SujetDeCompteur' };

const EMPREINTE = /^(?:[0-9a-f]{16}|[0-9a-f]{64})$/;

/**
 * Le seul constructeur d'un sujet : 16 ou 64 hexadécimaux minuscules. Le refus ne recopie JAMAIS
 * la valeur reçue — si c'était un courriel, le message d'erreur le ferait fuir dans les journaux.
 */
export function sujetDepuisEmpreinte(hex: string): SujetDeCompteur {
  if (!EMPREINTE.test(hex)) {
    throw new Error(
      'sujet_non_empreinte : le sujet d’un compteur est une empreinte de 16 ou 64 hexadécimaux ' +
        'minuscules ; une valeur en clair n’entre jamais dans une clé du cache'
    );
  }
  return hex as SujetDeCompteur;
}

// ── Le magasin : un port ────────────────────────────────────────────────────────────────────────

export interface ResultatDuMagasin {
  readonly admis: boolean;
  /** Le nombre d'entrées dans la fenêtre APRÈS l'appel. */
  readonly compte: number;
  /** L'horodatage (ms) de l'entrée la plus ancienne de la fenêtre, `null` si elle est vide. */
  readonly plusAncienMs: number | null;
}

/**
 * Fenêtre glissante par journal : retirer ce qui est sorti de la fenêtre, compter, ajouter le
 * membre SEULEMENT s'il reste de la place, renouveler l'expiration. Un refus n'ajoute rien.
 */
export type ConsommerDuMagasin = (
  cle: string,
  maintenantMs: number,
  fenetreMs: number,
  limite: number,
  membre: string
) => Promise<ResultatDuMagasin>;

/**
 * Le magasin, OPAQUE. Sa fonction d'écriture n'est pas une propriété : elle vit dans une table
 * privée de ce module, et seul `limiter` l'appelle. Un magasin réel entre les mains d'un autre
 * module ne peut donc pas écrire une clé libre — un compteur hors du registre, une valeur en
 * clair, une clé sans conduite sur panne.
 */
declare const marqueDeMagasin: unique symbol;
export interface MagasinDeCompteurs {
  readonly [marqueDeMagasin]: 'MagasinDeCompteurs';
}

const ECRIVAINS = new WeakMap<object, ConsommerDuMagasin>();

function enregistrer<T extends object>(magasin: T, consommer: ConsommerDuMagasin): T {
  ECRIVAINS.set(Object.freeze(magasin), consommer);
  return magasin;
}

/**
 * DÉFENSE EN PROFONDEUR : une fabrique qui accepte une fonction d'écriture arbitraire peut bâtir un
 * magasin qui admet tout. Elle REFUSE donc de s'exécuter hors des tests, quoi que la garde de
 * famille ait vu ou pas vu des chemins par lesquels on l'atteint.
 */
function enContexteDeTest(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function exigerUnContexteDeTest(fabrique: string): void {
  if (enContexteDeTest()) return;
  throw new Error(
    `fabrique_hors_tests : ${fabrique} ne fabrique un magasin que sous les tests ; en production, ` +
      'le seul magasin est celui du registre'
  );
}

/** Un magasin bâti sur une fonction d'écriture fournie : les témoins, et le magasin en mémoire. */
export function magasinDepuis(consommer: ConsommerDuMagasin): MagasinDeCompteurs {
  exigerUnContexteDeTest('magasinDepuis');
  return enregistrer({}, consommer) as unknown as MagasinDeCompteurs;
}

export interface MagasinEnPanne {
  readonly magasin: MagasinDeCompteurs;
  /** Le nombre d'écritures qu'il a reçues, et toutes ont levé. */
  appels(): number;
}

/**
 * Un magasin qui LÈVE à chaque écriture, et qui les compte. Il rend la conduite déclarée de chaque
 * compteur — donc un compteur `laisser-passer` y ADMET TOUT. C'est pourquoi il ne se construit,
 * comme toute fabrique, que sous les tests.
 */
export function magasinEnPanne(): MagasinEnPanne {
  exigerUnContexteDeTest('magasinEnPanne');
  let appels = 0;
  const magasin = enregistrer({}, () => {
    appels += 1;
    return Promise.reject(new Error('cache indisponible (magasin en panne)'));
  }) as unknown as MagasinDeCompteurs;
  return { magasin, appels: () => appels };
}

/**
 * Le même algorithme, ATOMIQUE : un script exécuté d'un seul tenant par le cache. Une suite de
 * commandes envoyées l'une après l'autre laisse deux requêtes concurrentes lire le même compte.
 */
const SCRIPT_FENETRE_GLISSANTE = `
local cle = KEYS[1]
local maintenant = tonumber(ARGV[1])
local fenetre = tonumber(ARGV[2])
local limite = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', cle, '-inf', maintenant - fenetre)
local compte = redis.call('ZCARD', cle)
local admis = 0
if compte < limite then
  redis.call('ZADD', cle, maintenant, ARGV[4])
  compte = compte + 1
  admis = 1
end
redis.call('PEXPIRE', cle, fenetre)
local plusAncien = redis.call('ZRANGE', cle, 0, 0, 'WITHSCORES')
return {admis, compte, plusAncien[2] or '-1'}
`;

/**
 * Les options qui rendent une panne RAPIDE. Par défaut, le client retente sans fin et met les
 * commandes en file hors ligne : un cache tombé ne rend alors pas d'erreur, il suspend la requête,
 * ce qui est pire que les deux conduites. Le pire cas est un serveur qui accepte puis se tait : la
 * connexion (`connectTimeout`) puis la vérification d'état (`commandTimeout`) s'ajoutent, et les
 * commandes d'identification du client, qui en ajouteraient une troisième, ne sont pas envoyées.
 */
export const OPTIONS_DU_CLIENT = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  connectTimeout: 300,
  commandTimeout: 500,
  disableClientInfo: true,
  retryStrategy: () => null,
} as const satisfies RedisOptions;

export interface MagasinRedis extends MagasinDeCompteurs {
  fermer(): void;
}

/**
 * Une `REDIS_URL` que le client ne sait pas lire. Le refus est NOMMÉ et ne porte ni la valeur ni
 * l'erreur d'origine : celle-ci recopie l'URL entière, mot de passe compris.
 */
function adresseIllisible(): Error {
  return new Error(
    'redis_url_illisible : REDIS_URL ne se lit pas comme une adresse de cache (valeur non recopiée)'
  );
}

/**
 * Le magasin réel. Aucune connexion n'est ouverte à la construction : la première se fait au
 * premier appel, et une connexion perdue se rouvre à l'appel suivant — jamais en tâche de fond.
 */
export function creerMagasinRedis(url: string, options: RedisOptions): MagasinRedis {
  exigerUnContexteDeTest('creerMagasinRedis');
  return ouvrirMagasinRedis(url, options);
}

/** Le magasin Redis du registre : le seul que la production construit, par `REDIS_URL`. */
function ouvrirMagasinRedis(url: string, options: RedisOptions): MagasinRedis {
  let client: Redis;
  try {
    client = new Redis(url, options);
  } catch {
    throw adresseIllisible();
  }
  // Chaque panne est déjà signalée, par son préfixe, au verdict qui la subit. Sans écouteur, le
  // client imprimerait en plus la sienne, avec l'adresse du cache, à chaque tentative.
  client.on('error', () => undefined);
  let connexion: Promise<void> | null = null;

  // La connexion échoue à la PREMIÈRE erreur. Contre un serveur qui accepte puis se tait, la
  // promesse du client n'aboutit qu'à la fermeture du socket par le pair — c'est-à-dire jamais.
  const pret = async (): Promise<void> => {
    if (client.status === 'wait' || client.status === 'end') {
      let echec: (e: Error) => void = () => undefined;
      connexion ??= new Promise<void>((resoudre, rejeter) => {
        echec = rejeter;
        client.once('error', echec);
        client.connect().then(resoudre, rejeter);
      }).finally(() => {
        client.removeListener('error', echec);
        connexion = null;
      });
    }
    if (connexion !== null) await connexion;
  };

  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite, membre) => {
    await pret();
    const brut = await client.eval(
      SCRIPT_FENETRE_GLISSANTE,
      1,
      cle,
      maintenantMs,
      fenetreMs,
      limite,
      membre
    );
    if (!Array.isArray(brut) || brut.length !== 3) {
      throw new Error('rate-limit : réponse du cache illisible');
    }
    const plusAncien = Number(brut[2]);
    return {
      admis: Number(brut[0]) === 1,
      compte: Number(brut[1]),
      plusAncienMs: plusAncien < 0 ? null : plusAncien,
    };
  };
  const magasin = {
    fermer() {
      client.disconnect();
    },
  };
  return enregistrer(magasin, consommer) as unknown as MagasinRedis;
}

/** Le magasin d'un processus sans `REDIS_URL` : chaque appel est une panne, jamais un plantage. */
const MAGASIN_SANS_ADRESSE = enregistrer({}, () =>
  Promise.reject(new Error('rate-limit : REDIS_URL absente'))
) as unknown as MagasinDeCompteurs;

/** Le magasin d'une `REDIS_URL` illisible : une panne aussi, et le refus ne porte pas la valeur. */
const MAGASIN_ADRESSE_ILLISIBLE = enregistrer({}, () =>
  Promise.reject(adresseIllisible())
) as unknown as MagasinDeCompteurs;

let magasinDuProcessus: MagasinRedis | null = null;

/** `REDIS_URL` est lue au premier appel, jamais à l'import. */
function magasinParDefaut(): MagasinDeCompteurs {
  if (magasinDuProcessus !== null) return magasinDuProcessus;
  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') return MAGASIN_SANS_ADRESSE;
  try {
    magasinDuProcessus = ouvrirMagasinRedis(url, OPTIONS_DU_CLIENT);
  } catch {
    return MAGASIN_ADRESSE_ILLISIBLE;
  }
  return magasinDuProcessus;
}

// ── Le verdict ──────────────────────────────────────────────────────────────────────────────────

export type MotifDeVerdict =
  'admis' | 'limite_atteinte' | 'cache_indisponible' | 'limite_non_configuree';

export interface VerdictDeLimite {
  readonly autorise: boolean;
  readonly restant: number;
  /** Quand une place se libère (ms), si l'appel est refusé par la limite ; `null` sinon. */
  readonly repriseAt: number | null;
  /** L'appelant distingue « trop de tentatives » de « le compteur est aveugle ». */
  readonly panne: boolean;
  readonly motif: MotifDeVerdict;
}

export interface SignalDePanne {
  readonly prefixe: string;
  readonly motif: 'cache_indisponible' | 'limite_non_configuree';
}

export type Signaleur = (signal: SignalDePanne) => void;

/** Le puits de phase 0 : une ligne JSON sur la sortie d'erreur. Le préfixe, jamais la clé. */
export const signalerSurStderr: Signaleur = (signal) => {
  process.stderr.write(
    `${JSON.stringify({ signal: 'rate_limit_panne', prefixe: signal.prefixe, motif: signal.motif })}\n`
  );
};

/**
 * La conduite d'une déclaration, lue en ÉCHEC FERMÉ : tout ce qui n'est pas exactement
 * `laisser-passer` refuse — y compris une conduite absente qu'un cast aurait fait passer.
 */
export function conduiteSurPanne(declaration: { readonly surPanne?: unknown }): ConduiteSurPanne {
  return declaration.surPanne === 'laisser-passer' ? 'laisser-passer' : 'refuser';
}

function enPanne(
  declaration: DeclarationDeCompteur,
  motif: SignalDePanne['motif'],
  signaler: Signaleur
): VerdictDeLimite {
  signaler({ prefixe: declaration.prefixe, motif });
  return {
    autorise: conduiteSurPanne(declaration) === 'laisser-passer',
    restant: 0,
    repriseAt: null,
    panne: true,
    motif,
  };
}

/**
 * La marque du magasin par défaut. Un paramètre omis (ou `undefined`) prend cette valeur : c'est
 * ce qui distingue, à l'exécution, le magasin du registre d'un magasin INJECTÉ par l'appelant.
 */
const MAGASIN_DU_REGISTRE = enregistrer({}, () =>
  Promise.reject(new Error('rate-limit : la marque du magasin par défaut ne s’écrit pas'))
) as unknown as MagasinDeCompteurs;

/**
 * Compte un appel du sujet sous le compteur nommé. L'heure est un PARAMÈTRE : ce module ne lit
 * aucune horloge. Toute panne du magasin — levée, délai, réponse illisible, adresse absente —
 * rend la conduite déclarée du compteur, avec `panne: true`.
 *
 * DÉFENSE EN PROFONDEUR : hors des tests, un magasin ou un signaleur fourni par l'appelant est
 * REFUSÉ (`injection_hors_tests`). En production, seuls le magasin et le signaleur du registre
 * servent, quel que soit le chemin par lequel on a atteint cette fonction.
 */
export async function limiter(
  nom: NomDeCompteur,
  sujet: SujetDeCompteur,
  maintenantMs: number,
  magasinFourni: MagasinDeCompteurs = MAGASIN_DU_REGISTRE,
  signaler: Signaleur = signalerSurStderr
): Promise<VerdictDeLimite> {
  if (
    (magasinFourni !== MAGASIN_DU_REGISTRE || signaler !== signalerSurStderr) &&
    !enContexteDeTest()
  ) {
    throw new Error(
      'injection_hors_tests : hors des tests, limiter ne reçoit ni magasin ni signaleur ; ' +
        'ceux du registre servent seuls'
    );
  }
  const magasin = magasinFourni === MAGASIN_DU_REGISTRE ? magasinParDefaut() : magasinFourni;
  const declaration: DeclarationDeCompteur = COMPTEURS[nom];
  // Revérifié à l'exécution : un cast ferait entrer n'importe quelle chaîne dans la clé.
  const empreinte = sujetDepuisEmpreinte(sujet);
  let { limite, fenetreSecondes } = declaration;
  if (limite === LIMITE_HORS_DEPOT || fenetreSecondes === LIMITE_HORS_DEPOT) {
    // SEC-72 : une limite hors dépôt se lit dans la configuration privée ; sinon, refus.
    const lus = plafondsDuCompteur(nom);
    if (lus === null) return enPanne(declaration, 'limite_non_configuree', signaler);
    ({ limite, fenetreSecondes } = lus);
  }
  const fenetreMs = fenetreSecondes * 1000;
  const consommer = ECRIVAINS.get(magasin);
  if (consommer === undefined) return enPanne(declaration, 'cache_indisponible', signaler);
  let resultat: ResultatDuMagasin;
  try {
    resultat = await consommer(
      `${nom}:${empreinte}`,
      maintenantMs,
      fenetreMs,
      limite,
      randomUUID()
    );
  } catch {
    return enPanne(declaration, 'cache_indisponible', signaler);
  }
  return {
    autorise: resultat.admis,
    restant: Math.max(0, limite - resultat.compte),
    repriseAt: resultat.admis ? null : (resultat.plusAncienMs ?? maintenantMs) + fenetreMs,
    panne: false,
    motif: resultat.admis ? 'admis' : 'limite_atteinte',
  };
}
