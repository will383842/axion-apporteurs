/**
 * Le notifieur — QA-T08 : hors production, rien ne part vers une vraie personne.
 *
 * « Production » est jugée par le MÊME prédicat que le hook d'environnement du dépôt
 * (`scripts/gates/hook-env.js`) : `NODE_ENV` ET `PARTNERS_ENV` valent `production`. Une préversion
 * (`NODE_ENV=production`, `PARTNERS_ENV=preview`) est HORS production — voulu. La spec confronte les
 * deux écritures sur la même matrice : une divergence y rougit.
 *
 *   hors production, `NOTIFY_SINK` ≠ `true`  → levée `notify_sink_requis` à la CONSTRUCTION ;
 *   `NOTIFY_SINK` = `true`                    → le message va au puits (une ligne de journal,
 *                                               caviardée : le sujet et la TAILLE du corps, jamais
 *                                               le corps), jamais aux transports ;
 *   production                                → les transports injectés ;
 *   production ET `NOTIFY_SINK` = `true`      → accepté, mais une ligne `error` le dit : un silence
 *                                               en production se dit.
 *
 * Aucun transport réel n'est livré ici. AUCUNE LECTURE D'ENVIRONNEMENT : il entre en paramètre.
 */
import type { Journal } from './logger';

export type EnvironnementNotification = {
  NODE_ENV?: string;
  PARTNERS_ENV?: string;
  NOTIFY_SINK?: string;
};

/** Le prédicat de production du hook d'environnement, écrit une seconde fois — et confronté. */
export function productionDeclaree(env: EnvironnementNotification): boolean {
  return env.NODE_ENV === 'production' && env.PARTNERS_ENV === 'production';
}

export type Notification = { sujet: string; corps: string };

export type TransportNotification = {
  nom: string;
  envoyer(notification: Notification): Promise<void>;
};

export class NotifySinkRequis extends Error {
  readonly motif = 'notify_sink_requis';
  constructor() {
    super(
      'notify_sink_requis : hors production, NOTIFY_SINK doit valoir "true" — sans lui, une ' +
        'notification pourrait partir vers une vraie personne'
    );
    this.name = 'NotifySinkRequis';
  }
}

export interface Notifieur {
  notifier(notification: Notification): Promise<void>;
}

export type OptionsNotifieur = {
  env: EnvironnementNotification;
  journal: Journal;
  transports: readonly TransportNotification[];
};

export function creerNotifieur({ env, journal, transports }: OptionsNotifieur): Notifieur {
  const production = productionDeclaree(env);
  const puits = env.NOTIFY_SINK === 'true';
  if (!production && !puits) throw new NotifySinkRequis();
  if (puits) {
    if (production) journal.error('notifications_retenues_en_production');
    return {
      notifier: async ({ sujet, corps }) =>
        journal.info('notification_retenue', { sujet, octetsDuCorps: Buffer.byteLength(corps) }),
    };
  }
  return {
    notifier: async (notification) => {
      await Promise.all(transports.map((t) => t.envoyer(notification)));
    },
  };
}
