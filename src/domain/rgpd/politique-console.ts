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

/** Les rubriques de TRT-CONSOLE rendues à la personne, et leur nom exact dans le registre. */
export const RUBRIQUES_DE_LA_CONSOLE = {
  finalite: 'Finalité',
  baseLegale: 'Base légale',
  donnees: 'Catégories de données',
  origine: 'Origine des données',
  duree: 'Durée de conservation',
  destinataires: 'Destinataires',
  transferts: 'Transferts hors Union européenne',
  droits: "Droits et modalités d'exercice",
} as const;
export type CleDeLaConsole = keyof typeof RUBRIQUES_DE_LA_CONSOLE;

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

export type PageDeLaConsole = {
  readonly rubriques: readonly RubriqueDeLaConsole[];
  /** Empreinte stable du contenu rendu : elle change dès qu'une valeur affichée change. */
  readonly version: string;
};

export type LectureDeLaConsole =
  | { readonly ok: true; readonly page: PageDeLaConsole; readonly filtres: readonly Filtre[] }
  | { readonly ok: false; readonly refus: string };

/** La page extraite du bloc TRT-CONSOLE, ou le refus nommé qui l'empêche. */
export function extrairePageDeLaConsole(registre: string): LectureDeLaConsole {
  const lu = lireUnTraitement(registre, TRAITEMENT_CONSOLE, RUBRIQUES_DE_LA_CONSOLE, ORDRE);
  if (!lu.ok) return lu;
  const version = createHash('sha256')
    .update(JSON.stringify(lu.rubriques))
    .digest('hex')
    .slice(0, 32);
  return { ok: true, page: { rubriques: lu.rubriques, version }, filtres: lu.filtres };
}

/** Les segments « en cours de rédaction » de la page rendue. */
export function segmentsEnCoursDeLaConsole(page: Pick<PageDeLaConsole, 'rubriques'>): number {
  return page.rubriques.flatMap((r) => r.contenu).filter((s) => s.type === 'a_completer').length;
}

/** Publiable : aucun segment en cours de rédaction. Avant, la page n'est pas liée depuis la connexion. */
export function pageDeLaConsolePubliable(page: Pick<PageDeLaConsole, 'rubriques'>): boolean {
  return segmentsEnCoursDeLaConsole(page) === 0;
}
