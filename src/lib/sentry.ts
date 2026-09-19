/**
 * Les erreurs serveur vers Sentry — QA-T08 (REQ-QA-024) : le MÊME caviardage que le journal.
 *
 * `@sentry/node`, et pas `@sentry/nextjs` : ce dernier enveloppe `next.config.ts` et le build. Un
 * client autonome (`NodeClient`), sans intégration par défaut, sans traces, `sendDefaultPii` faux.
 * Chaque événement, transaction et fil d'Ariane passe par `caviarder` de `logger.ts` avant de
 * partir. De la requête, seuls partent le chemin (sans sa chaîne de requête, caviardé), la méthode et
 * la route : AUCUN en-tête — cookies, autorisation et adresse réseau n'y entrent jamais.
 *
 * DSN absent : aucun client n'est construit, rien ne peut partir. Une ligne le dit — de niveau
 * `error` si l'environnement est la production.
 *
 * Pas de Sentry côté navigateur : limite déclarée. AUCUNE LECTURE D'ENVIRONNEMENT ICI.
 */
import { NodeClient, Scope, defaultStackParser, makeNodeTransport } from '@sentry/node';
import { caviarder, caviarderTexte, type Journal } from './logger';

/** Le type du transport, lu sur le client lui-même : `@sentry/core` n'est pas une dépendance directe. */
export type FabriqueDeTransport = ConstructorParameters<typeof NodeClient>[0]['transport'];

/** Ce que Next passe à `onRequestError` de la requête. Les en-têtes y sont, et n'en sortent pas. */
export type RequeteEnErreur = {
  path: string;
  method: string;
  headers?: Record<string, string | string[]>;
};

/** Ce que Next passe à `onRequestError` du contexte, réduit à ce qui part. */
export type ContexteEnErreur = { routerKind: string; routePath: string; routeType: string };

export type OptionsSentinelle = {
  dsn: string | undefined;
  environnement: string;
  production: boolean;
  journal: Journal;
  /** Le transport d'envoi ; celui de Node par défaut. Les tests en injectent un qui capture. */
  transport?: FabriqueDeTransport;
};

export interface Sentinelle {
  readonly actif: boolean;
  capturerErreur(
    erreur: unknown,
    requete?: RequeteEnErreur,
    contexte?: ContexteEnErreur
  ): Promise<void>;
}

/**
 * Le filtre commun aux événements et aux fils d'Ariane : `caviarder`, à une réserve près.
 * `sdkProcessingMetadata` porte des objets internes du client (portées, requête normalisée) : il ne
 * part jamais dans l'enveloppe, il est rendu intact au client au lieu d'être recopié.
 */
export function filtrerPourSentry<T extends object>(envoi: T): T {
  const { sdkProcessingMetadata, ...transmis } = envoi as T & {
    sdkProcessingMetadata?: unknown;
  };
  const filtre = caviarder(transmis) as T;
  return sdkProcessingMetadata === undefined ? filtre : { ...filtre, sdkProcessingMetadata };
}

/** Le chemin d'une requête sans sa chaîne de requête ni son fragment, caviardé. */
export function cheminSur(chemin: string): string {
  return caviarderTexte(chemin.split(/[?#]/)[0] ?? '');
}

export function creerSentinelle(options: OptionsSentinelle): Sentinelle {
  const { dsn, journal } = options;
  if (dsn === undefined || dsn === '') {
    if (options.production) journal.error('sentry_inactif_en_production');
    else journal.info('sentry_inactif');
    return { actif: false, capturerErreur: async () => undefined };
  }

  const client = new NodeClient({
    dsn,
    environment: options.environnement,
    transport: options.transport ?? makeNodeTransport,
    stackParser: defaultStackParser,
    integrations: [],
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (e) => filtrerPourSentry(e),
    beforeSendTransaction: (e) => filtrerPourSentry(e),
    beforeBreadcrumb: (b) => filtrerPourSentry(b),
  });
  client.init();

  return {
    actif: true,
    async capturerErreur(erreur, requete, contexte) {
      const portee = new Scope();
      portee.setClient(client);
      if (requete !== undefined) {
        portee.setContext('requete', {
          chemin: cheminSur(requete.path),
          methode: requete.method,
          ...(contexte === undefined
            ? {}
            : {
                routerKind: contexte.routerKind,
                routePath: contexte.routePath,
                routeType: contexte.routeType,
              }),
        });
      }
      client.captureException(erreur, undefined, portee);
      await client.flush(2000);
    },
  };
}
