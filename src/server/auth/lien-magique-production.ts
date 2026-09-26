/**
 * lien-magique-production.ts — le CÂBLAGE du lien magique (SEC-03) : ce que l'action serveur de
 * `/connexion` et celle de `/connexion/<jeton>` donnent au noyau (`lien-magique.ts`).
 *
 * D'OÙ VIENT CHAQUE PORT.
 *  - La configuration : MAGIC_LINK_SECRET et SESSION_SECRET, jugés par `src/lib/env.ts` (le
 *    lecteur de SEC-01), leurs `kid` par `kidDe` ; l'adresse publique vient du registre de l'entité
 *    (`domaines.servi`), jamais d'un en-tête `Host` (partners/ADR-0013, décision 14).
 *  - Les empreintes : celles de la couche des données personnelles (courriel sous PII_HASH_KEY,
 *    adresse réseau sous IP_HASH_SALT), sous les clés de `clesPii`.
 *  - Les compteurs : `limiter` du REGISTRE, appelé directement avec `magic:ip` et `magic:courriel`.
 *    Le magasin et le signaleur sont ceux du registre, toujours (garde `securite:rate-famille`).
 *  - Le travail différé : `planifier`, que l'action branche sur `after()` de Next.
 *  - L'envoi : un port. Hors production, le puits du notifieur (`NOTIFY_SINK`) ; l'envoi réel du
 *    courriel appartient à INT-T10, et d'ici là la production refuse d'envoyer en le disant.
 *
 * AUCUN JETON ET AUCUNE ADRESSE DANS LES JOURNAUX : l'échec du travail différé s'écrit par son seul
 * motif ; le puits du notifieur n'écrit que le sujet et la taille du corps.
 */

import { PrismaClient } from '@prisma/client';
import { domaines } from '../../config/entite';
import type { Horloge } from '../../domain/temps/horloge';
import { horlogeSysteme } from '../../lib/horloge';
import { formaterRefus, kidDe, lireEnvironnement } from '../../lib/env';
import { creerJournal, type Journal } from '../../lib/logger';
import { creerNotifieur, type Notifieur } from '../../lib/notify';
import { SAUTS_DE_CONFIANCE, adresseDuClient } from '../securite/adresse-du-client';
import { clesPii, empreinteAdresseReseau, empreinteRecherche, type ClesPii } from '../securite/pii';
import { signalerPotDeMiel } from '../securite/pot-de-miel';
import { limiter, sujetDepuisEmpreinte } from '../securite/rate-limit';
import { CONNEXION } from '../../content/micro-copy/espace/vocabulaire';
import type { ConfigurationDuLien, PortsDeConsommation, PortsDeDemande } from './lien-magique';
import { ecrituresDeLien, lectureDuCompte, transactionDeConsommation } from './lien-magique-depot';

export { MODELE_APPORTEUR } from './lien-magique-depot';

/** L'envoi du lien : l'adresse stockée, un sujet, un corps qui porte l'URL. */
export interface EnvoiDuLien {
  envoyer(message: { a: string; sujet: string; corps: string }): Promise<void>;
}

export interface DependancesDuLien {
  /** L'environnement, jugé ici par le lecteur de SEC-01 ; jamais lu ailleurs par ce module. */
  env: Readonly<Record<string, string | undefined>>;
  prisma: PrismaClient;
  horloge: Horloge;
  planifier(travail: () => Promise<void>): void;
  envoi: EnvoiDuLien;
  journal: Pick<Journal, 'warn'>;
}

/** Les secrets jugés en ENTIER ; un refus nomme les variables et leurs motifs, jamais une valeur. */
function secrets(env: DependancesDuLien['env']) {
  const lu = lireEnvironnement(env);
  if (!lu.ok) {
    throw new Error(
      `environnement refusé par src/lib/env.ts — ${lu.refus.map(formaterRefus).join(' ; ')}`
    );
  }
  return lu.env;
}

export function configurationDuLien(env: DependancesDuLien['env']): ConfigurationDuLien {
  const { MAGIC_LINK_SECRET, SESSION_SECRET } = secrets(env);
  return {
    secret: MAGIC_LINK_SECRET,
    kid: kidDe(MAGIC_LINK_SECRET),
    urlPublique: `https://${domaines().servi}`,
    session: { secret: SESSION_SECRET, kid: kidDe(SESSION_SECRET) },
  };
}

/** L'empreinte d'adresse réseau d'une requête, ou `null` si l'adresse est illisible. */
export function empreinteReseauDeLaRequete(entetes: Headers, cles: ClesPii): string | null {
  const adresse = adresseDuClient(entetes, SAUTS_DE_CONFIANCE);
  return adresse === null ? null : empreinteAdresseReseau(adresse, cles);
}

export function portsDeDemande(d: DependancesDuLien): PortsDeDemande {
  const cles = clesPii(d.env);
  const configuration = configurationDuLien(d.env);
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    adresseDuClient: (entetes) => adresseDuClient(entetes, SAUTS_DE_CONFIANCE),
    empreinteAdresseReseau: (adresse) => empreinteAdresseReseau(adresse, cles),
    empreinteCourriel: (saisie) => {
      try {
        return empreinteRecherche('courriel', saisie, cles);
      } catch {
        return null;
      }
    },
    compterAdresse: (sujet, maintenantMs) =>
      limiter('magic:ip', sujetDepuisEmpreinte(sujet), maintenantMs),
    compterCourriel: (sujet, maintenantMs) =>
      limiter('magic:courriel', sujetDepuisEmpreinte(sujet), maintenantMs),
    planifier: (travail) => d.planifier(travail),
    emission: {
      ...lectureDuCompte(d.prisma, cles),
      ...ecrituresDeLien(d.prisma),
      envoyer: ({ a, url }) =>
        d.envoi.envoyer({
          a,
          sujet: CONNEXION.courriel.sujet,
          corps: `${CONNEXION.courriel.corps}\n\n${url}`,
        }),
      signalerPotDeMiel: async ({ formulaire, adresseHash, survenuAt }) =>
        signalerPotDeMiel({ formulaire, adresseHash, survenuAt: survenuAt.getTime() }),
      signalerEchec: (motif) => d.journal.warn(`lien_magique_${motif}`),
    },
    configuration,
  };
}

export function portsDeConsommation(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'>
): PortsDeConsommation {
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    transaction: transactionDeConsommation(d.prisma),
    configuration: configurationDuLien(d.env),
  };
}

/**
 * L'envoi par le notifieur de QA-T08. Le notifieur ne connaît pas de destinataire : hors production
 * il n'écrit qu'au puits (sujet et taille du corps), et c'est tout ce que ce port promet. L'envoi
 * réel, à l'adresse stockée, appartient à INT-T10.
 */
export function envoiParLeNotifieur(notifieur: Notifieur): EnvoiDuLien {
  return {
    envoyer: ({ sujet, corps }) => notifieur.notifier({ sujet, corps }),
  };
}

let client: PrismaClient | null = null;

/**
 * Les dépendances du processus, pour les actions serveur : le client de base (un par processus),
 * l'horloge du système, le journal, le notifieur, et `planifier` branché sur `apres` — `after()`
 * de Next, que l'action passe. Le travail planifié n'est JAMAIS exécuté ici : il est confié.
 *
 * L'envoi : hors production, le puits du notifieur (`NOTIFY_SINK`) ; en production, le seul
 * transport déclaré refuse d'envoyer en le disant — le transport réel appartient à INT-T10.
 */
export function dependancesDuProcessus(outils: {
  apres: (travail: () => Promise<void>) => void;
  env: DependancesDuLien['env'];
}): DependancesDuLien {
  client ??= new PrismaClient();
  const journal = creerJournal();
  return {
    env: outils.env,
    prisma: client,
    horloge: horlogeSysteme,
    planifier: (travail) => outils.apres(travail),
    envoi: envoiParLeNotifieur(
      creerNotifieur({
        env: outils.env,
        journal,
        transports: [
          {
            nom: 'courriel',
            envoyer: async () => {
              throw new Error('envoi_courriel_non_cable : le transport réel appartient à INT-T10');
            },
          },
        ],
      })
    ),
    journal,
  };
}
