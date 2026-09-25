/**
 * Le point de composition du journal et de Sentry côté serveur — QA-T08 (REQ-QA-024).
 *
 * Convention de fichier de Next 16 : avec un dossier `src`, `instrumentation.ts` vit DANS `src`.
 * `register()` est appelé une fois au démarrage d'une instance serveur ; `onRequestError` à chaque
 * erreur serveur capturée. Seul le runtime Node compose : pino et le client Sentry n'ont rien à
 * faire dans le runtime Edge, et y sont chargés par import dynamique, jamais au chargement.
 *
 * C'est le SEUL fichier de la tâche qui lit l'environnement (`SENTRY_DSN`, `PARTNERS_ENV`,
 * `NODE_ENV`, `LOG_LEVEL`), et il le fait juger d'abord par `src/lib/env.ts` (QA-T04) : `logger.ts`, `sentry.ts` et `notify.ts` reçoivent leur configuration
 * en paramètres. Il n'importe pas `next` : ses types sont écrits ici, réduits à ce qui sert.
 */
import type { Journal, Sortie } from './lib/logger';
import type {
  ContexteEnErreur,
  OptionsSentinelle,
  RequeteEnErreur,
  Sentinelle,
} from './lib/sentry';

export type Environnement = Record<string, string | undefined>;

export type Composition = { journal: Journal; sentinelle: Sentinelle };

/** Construit le journal et la sentinelle depuis un environnement. Les tests injectent les sorties. */
export async function composer(
  env: Environnement,
  injections: { sortie?: Sortie; transport?: OptionsSentinelle['transport'] } = {}
): Promise<Composition> {
  const { creerJournal } = await import('./lib/logger');
  const { creerSentinelle } = await import('./lib/sentry');
  const { productionDeclaree } = await import('./lib/notify');
  const journal = creerJournal({ niveau: env.LOG_LEVEL, sortie: injections.sortie });
  const sentinelle = creerSentinelle({
    dsn: env.SENTRY_DSN,
    environnement: env.PARTNERS_ENV ?? 'local',
    production: productionDeclaree(env),
    journal,
    transport: injections.transport,
  });
  return { journal, sentinelle };
}

/** Ce que fait `onRequestError` d'une composition : une ligne de journal, puis Sentry. */
export function traiterErreurDeRequete(composition: Composition) {
  return async (erreur: unknown, requete: RequeteEnErreur, contexte: ContexteEnErreur) => {
    const { cheminSur } = await import('./lib/sentry');
    composition.journal.error('erreur_de_requete', {
      err: erreur,
      chemin: cheminSur(requete.path),
      methode: requete.method,
      routePath: contexte.routePath,
      routeType: contexte.routeType,
    });
    await composition.sentinelle.capturerErreur(erreur, requete, contexte);
  };
}

let composition: Composition | undefined;

/**
 * QA-T04 (REQ-QA-030, REQ-CPL-021) : l'environnement est jugé AVANT toute composition. Une variable
 * requise absente ou hors règle fait sortir le serveur en code non nul, en la nommant : une instance
 * qui démarrerait quand même ne saurait pas servir, et `readyz` le découvrirait trop tard.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { exigerEnvironnement } = await import('./lib/env');
  exigerEnvironnement(process.env);
  composition = await composer(process.env);
}

export async function onRequestError(
  erreur: unknown,
  requete: RequeteEnErreur,
  contexte: ContexteEnErreur
): Promise<void> {
  if (composition === undefined) return;
  await traiterErreurDeRequete(composition)(erreur, requete, contexte);
}
