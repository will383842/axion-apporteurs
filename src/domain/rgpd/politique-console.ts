/**
 * `politique-console.ts` — la page « Vos données dans la console », DÉRIVÉE du registre de l'article
 * 30, bloc TRT-CONSOLE (JUR-T61, REQ-JUR-068). Registre : `docs/rgpd/registre-article-30.md`.
 *
 * DÉRIVÉE, JAMAIS RECOPIÉE (RM-01). La lecture est CELLE de la politique de l'espace
 * (`lireUnTraitement`, `politique.ts`) : mêmes segments, mêmes retenues nommées (question interne,
 * nom de personne, mot refusé), mêmes refus. Ce que le registre dit « À compléter » s'affiche « en
 * cours de rédaction », avec sa retenue nommée ; la question interne ne sort jamais.
 *
 * PUBLIABLE seulement sans un seul segment en cours de rédaction : tant qu'un « À compléter » reste,
 * la page n'est pas liée depuis la connexion (statut de la juriste : « Texte en PROPOSITION, non en
 * vigueur, jusqu'aux réponses de Williams »).
 *
 * Domaine pur : aucune I/O, aucune horloge.
 */
import { createHash } from 'node:crypto';
import { lireUnTraitement, type Filtre, type Segment } from './politique';

export const TRAITEMENT_CONSOLE = 'TRT-CONSOLE';

/**
 * Les rubriques de TRT-CONSOLE rendues à la personne, et leur nom exact dans le registre. Arbitrage
 * de la juriste : ni « Information des personnes » (elle décrit la page elle-même), ni « Mesures de
 * sécurité » (l'art. 13 ne l'exige pas, et la rendre exposerait des détails de défense), ni
 * « Personnes concernées » (la page s'adresse à elles).
 */
export const RUBRIQUES_CONSOLE = {
  finalite: 'Finalité',
  baseLegale: 'Base légale',
  donnees: 'Catégories de données',
  origine: 'Origine des données',
  duree: 'Durée de conservation',
  destinataires: 'Destinataires',
  transferts: 'Transferts hors Union européenne',
  droits: "Droits et modalités d'exercice",
} as const;
export type CleDeLaConsole = keyof typeof RUBRIQUES_CONSOLE;

/** L'ordre d'affichage : pourquoi, sur quelle base, quoi, d'où, combien de temps, qui, où, vos droits. */
const ORDRE: readonly CleDeLaConsole[] = [
  'finalite',
  'baseLegale',
  'donnees',
  'origine',
  'duree',
  'destinataires',
  'transferts',
  'droits',
];

export type RubriqueDeLaConsole = {
  readonly cle: CleDeLaConsole;
  readonly contenu: readonly Segment[];
};

export type PolitiqueConsole = {
  readonly rubriques: readonly RubriqueDeLaConsole[];
  /** Empreinte stable du contenu rendu : elle change dès qu'une valeur affichée change. */
  readonly version: string;
};

export type LecturePolitiqueConsole =
  | { readonly ok: true; readonly politique: PolitiqueConsole; readonly filtres: readonly Filtre[] }
  | { readonly ok: false; readonly refus: string };

/** La page extraite du bloc TRT-CONSOLE, ou le refus nommé qui l'empêche. */
export function extrairePolitiqueConsole(registre: string): LecturePolitiqueConsole {
  const lu = lireUnTraitement(registre, TRAITEMENT_CONSOLE, RUBRIQUES_CONSOLE, ORDRE);
  if (!lu.ok) return lu;
  const version = createHash('sha256')
    .update(JSON.stringify(lu.rubriques))
    .digest('hex')
    .slice(0, 32);
  return { ok: true, politique: { rubriques: lu.rubriques, version }, filtres: lu.filtres };
}

/** Les segments « en cours de rédaction » de la page rendue. */
export function segmentsEnCoursConsole(politique: Pick<PolitiqueConsole, 'rubriques'>): number {
  return politique.rubriques.flatMap((r) => r.contenu).filter((s) => s.type === 'a_completer')
    .length;
}

/**
 * JUR-T63 (REQ-JUR-068 ; juriste, #708, 5981356847 ; condition d'A02, 5982307722) — une version
 * PUBLIÉE de la page : son empreinte (`PolitiqueConsole.version`), l'instant UTC de sa publication, et
 * ce qui l'a publiée.
 */
export type VersionPubliee = {
  readonly version: string;
  readonly publieeLe: string;
  readonly source: string;
  /** JUR-T65 : le déploiement vérifié qui a servi la page. Absent de la seule première version. */
  readonly deploiement?: DeploiementVerifie;
};

/**
 * JUR-T65 (REQ-JUR-068 ; juriste, #745, 5986650886) — le déploiement vérifié d'une version : le sha
 * SERVI, constaté par `deploy:verify` (QA-T54), et l'instant de la fusion qui l'a portée. La page
 * n'est servie qu'après le déploiement : `publieeLe` est l'instant de ce déploiement vérifié, pas
 * celui de la fusion. Une invitation envoyée entre les deux reste rattachée à la version précédente,
 * celle que la page servait encore.
 */
export type DeploiementVerifie = {
  readonly shaServi: string;
  readonly fusionneeLe: string;
};

/**
 * La seule version datée de la FUSION : la première, publiée depuis la fusion de JUR-T62 et figée
 * (JUR-T63). Toute version suivante porte son déploiement vérifié.
 */
export const VERSION_DATEE_DE_LA_FUSION = 'aaf43d0ae628eb1c9e696e8613704e44';

/**
 * Les versions PUBLIÉES de la page, dans l'ordre de leur publication. AJOUT SEUL : une entrée n'est
 * jamais réécrite ni retirée ; une page qui change reçoit une NOUVELLE entrée, datée de son
 * DÉPLOIEMENT VÉRIFIÉ (JUR-T65 : le sha servi, et `publieeLe` à l'instant où il l'a été), jamais de
 * la fusion (`fautesDeDatation` la refuse, et un témoin rougit tant que la dernière entrée n'est pas
 * la version que le registre rend). La version portée par la trace d'un courriel d'invitation se
 * DÉRIVE de son `envoye_at` contre cette liste (`versionEnVigueurConsole`) : aucune colonne (forme
 * d'A02, `schema: false`).
 *
 * La première est la version rendue par le registre quand la page est devenue publiable, à la
 * fusion de JUR-T62 : elle n'a pas changé depuis, et reste datée de cette fusion.
 */
export const VERSIONS_PUBLIEES_CONSOLE: readonly VersionPubliee[] = [
  {
    version: VERSION_DATEE_DE_LA_FUSION,
    publieeLe: '2026-10-04T17:59:34.000Z',
    source: 'fusion de JUR-T62 (#709), 3f020314',
  },
];

/**
 * La version de la page en vigueur à un instant : la dernière publiée à cet instant, borne de
 * publication INCLUSE ; `null` avant toute publication. La liste ne fait que croître : une version
 * en vigueur à un instant l'est aussi, ou une plus récente, à tout instant ultérieur.
 */
export function versionEnVigueurConsole(
  instant: Date,
  versions: readonly VersionPubliee[] = VERSIONS_PUBLIEES_CONSOLE
): string | null {
  let enVigueur: string | null = null;
  for (const v of versions) {
    if (Date.parse(v.publieeLe) <= instant.getTime()) enVigueur = v.version;
  }
  return enVigueur;
}

export type FauteDeDatation =
  | 'datee_de_la_fusion'
  | 'sha_servi_illisible'
  | 'source_sans_sha_servi'
  | 'date_illisible'
  | 'deploiement_avant_la_fusion';

/** Un sha de commit abrégé ou complet : de 7 à 40 hexadécimaux minuscules. */
const SHA = /^[0-9a-f]{7,40}$/;

/**
 * JUR-T65 — les fautes de datation de la liste, une par version fautive, dans l'ordre de la liste :
 * une version sans déploiement vérifié (datée de la fusion), hors la première publiée depuis JUR-T62 ;
 * un sha servi illisible, ou que la source ne nomme pas ; une date illisible ; une publication qui ne
 * suit pas strictement la fusion. Une liste sans faute rend `[]`.
 */
export function fautesDeDatation(
  versions: readonly VersionPubliee[] = VERSIONS_PUBLIEES_CONSOLE
): readonly { readonly version: string; readonly faute: FauteDeDatation }[] {
  const fautes: { version: string; faute: FauteDeDatation }[] = [];
  versions.forEach((v, i) => {
    const faute = fauteDeDatation(v, i === 0);
    if (faute !== null) fautes.push({ version: v.version, faute });
  });
  return fautes;
}

function fauteDeDatation(v: VersionPubliee, enTete: boolean): FauteDeDatation | null {
  const d = v.deploiement;
  if (d === undefined) {
    return enTete && v.version === VERSION_DATEE_DE_LA_FUSION ? null : 'datee_de_la_fusion';
  }
  if (!SHA.test(d.shaServi)) return 'sha_servi_illisible';
  if (!v.source.includes(d.shaServi.slice(0, 7))) return 'source_sans_sha_servi';
  const publieeLe = Date.parse(v.publieeLe);
  const fusionneeLe = Date.parse(d.fusionneeLe);
  if (Number.isNaN(publieeLe) || Number.isNaN(fusionneeLe)) return 'date_illisible';
  return publieeLe > fusionneeLe ? null : 'deploiement_avant_la_fusion';
}

/** Publiable : aucun segment en cours de rédaction. Avant, la page n'est pas liée depuis la connexion. */
export function estPubliableConsole(politique: Pick<PolitiqueConsole, 'rubriques'>): boolean {
  return segmentsEnCoursConsole(politique) === 0;
}
