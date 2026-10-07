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
 *  - L'envoi : un port. Hors production, le puits du notifieur (`NOTIFY_SINK`) ; en production,
 *    l'émetteur de courriels d'INT-T10 (`demanderEnvoi`), câblé par SEC-42, et son relais réel
 *    (`relaisZeptomail`, INT-T57).
 *  - Les appareils (SEC-62) : le clic et le code de l'espace avisent l'adresse STOCKÉE d'un nouvel
 *    appareil par `notifier()` (clé `nouvel_appareil`, texte de la juriste), puis le confirment dans
 *    une transaction courte ; seul un courriel `envoye` laisse confirmer. La console n'a pas d'appareil.
 *
 * AUCUN JETON ET AUCUNE ADRESSE DANS LES JOURNAUX : l'échec du travail différé s'écrit par son seul
 * motif ; le puits du notifieur n'écrit que le sujet et la taille du corps.
 */

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { domaines } from '../../config/entite';
import type { Horloge } from '../../domain/temps/horloge';
import { horlogeSysteme } from '../../lib/horloge';
import { formaterRefus, kidDe, lireEnvironnement } from '../../lib/env';
import { creerJournal, type Journal } from '../../lib/logger';
import { creerNotifieur, productionDeclaree, type Notifieur } from '../../lib/notify';
import { SAUTS_DE_CONFIANCE, adresseDuClient } from '../securite/adresse-du-client';
import { clesPii, empreinteAdresseReseau, empreinteRecherche, type ClesPii } from '../securite/pii';
import { signalerPotDeMiel } from '../securite/pot-de-miel';
import { limiter, sujetDepuisEmpreinte, type VerdictDeLimite } from '../securite/rate-limit';
import { CONNEXION } from '../../content/micro-copy/espace/vocabulaire';
import { CONNEXION_CONSOLE } from '../../content/micro-copy/console/connexion';
import { DUREES_AUTH } from './durees';
import { versParis } from '../../domain/temps/paris';
import { forApporteur } from '../acces/for-apporteur';
import { notifier, type DependancesDeLaNotification } from '../notifications/envoyer';
import type { PortsDesAppareils } from './appareil';
import { empreinteDeSessionConsole } from './lien-magique';
import { depotDeSessionsConsole, type PortsDeRole } from '../roles/require-role';
import {
  CODE_DU_COURRIEL_DE_CONNEXION,
  MOIS_EN_TOUTES_LETTRES,
} from '../../content/micro-copy/courriels/notifications';
import type {
  ConfigurationDuLien,
  PortsDeConsommation,
  PortsDeConsommationConsole,
  PortsDeDemande,
  PortsDeDemandeConsole,
  PortsDuCode,
  PortsDuCodeConsole,
} from './lien-magique';
import {
  ecrituresDeLien,
  ecrituresDeLienConsole,
  lectureDuCompte,
  lectureDuCompteConsole,
  transactionDeConfirmation,
  transactionDeConsommation,
  transactionDeConsommationConsole,
  transactionDuCode,
  transactionDuCodeConsole,
} from './lien-magique-depot';
import {
  configurationDeLEmetteur,
  demanderEnvoi,
  depotDesCourriels,
  type DependancesDeLEmetteur,
} from '../integrations/zeptomail/emetteur';
import { relaisZeptomail } from '../integrations/zeptomail/relais';
import { habillerLeCourriel } from '../email/chassis';
import { TEXTES_DES_NOTIFICATIONS } from '../../content/micro-copy/courriels/notifications';

export { MODELE_APPORTEUR } from './lien-magique-depot';

/** L'envoi du lien : l'adresse stockée, un sujet, un corps qui porte l'URL. */
export interface EnvoiDuLien {
  /** SEC-29 : `gabarit` absent vaut `lien_magique`, celui de l'espace. SEC-30 : l'invitation et la
   * création d'un administrateur, destinées à la console. */
  envoyer(message: {
    a: string;
    sujet: string;
    corps: string;
    /** UX-P1-64 : le HTML du châssis commun, famille A. */
    html?: string;
    gabarit?:
      | 'lien_magique'
      | 'lien_magique_console'
      | 'invitation_console'
      | 'admin_cree'
      | 'admin_reactive';
  }): Promise<void>;
}

export interface DependancesDuLien {
  /** L'environnement, jugé ici par le lecteur de SEC-01 ; jamais lu ailleurs par ce module. */
  env: Readonly<Record<string, string | undefined>>;
  prisma: PrismaClient;
  horloge: Horloge;
  planifier(travail: () => Promise<void>): void;
  envoi: EnvoiDuLien;
  journal: Pick<Journal, 'warn'>;
  /**
   * SEC-62 : l'émetteur des notifications de l'apporteur, qui rend le statut du courriel. Absent,
   * le clic et le code ne jugent aucun appareil : la consommation est celle d'avant.
   */
  envoyerCourriel?: DependancesDeLaNotification['envoyerCourriel'];
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

/**
 * Le corps du courriel de connexion : la phrase du lien, l'URL, puis la phrase du code (SEC-54). Le
 * code n'est écrit QUE là : ni au dépôt, ni au journal, ni au puits (qui n'écrit que la taille).
 */
export function corpsDuCourriel(url: string, code: string): string {
  const { avant, apres } = CODE_DU_COURRIEL_DE_CONNEXION;
  return `${CONNEXION.courriel.corps}\n\n${url}\n\n${avant}\n${code}\n${apres}`;
}

/**
 * UX-P1-64 — le courriel de connexion habillé du châssis commun, famille A : le lien est SECRET, il
 * n'est jamais recopié en clair dans le HTML (le texte joint le porte, comme avant) ; le code suit.
 */
export function htmlDuCourrielDeConnexion(
  courriel: { readonly sujet: string; readonly corps: string },
  appel: string,
  url: string,
  code: string
): string {
  const { avant, apres } = CODE_DU_COURRIEL_DE_CONNEXION;
  return habillerLeCourriel({
    famille: 'A',
    preEnTete: courriel.corps,
    titre: courriel.sujet,
    paragraphes: [courriel.corps, `${avant} ${code}`, apres],
    appel: { libelle: appel, href: url },
    appelSecret: true,
  }).html;
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
      envoyer: ({ a, url, code }) =>
        d.envoi.envoyer({
          a,
          sujet: CONNEXION.courriel.sujet,
          corps: corpsDuCourriel(url, code),
          html: htmlDuCourrielDeConnexion(
            CONNEXION.courriel,
            TEXTES_DES_NOTIFICATIONS.lien_magique.appel,
            url,
            code
          ),
        }),
      signalerPotDeMiel: async ({ formulaire, adresseHash, survenuAt }) =>
        signalerPotDeMiel({ formulaire, adresseHash, survenuAt: survenuAt.getTime() }),
      signalerEchec: (motif) => d.journal.warn(`lien_magique_${motif}`),
    },
    configuration,
  };
}

export function portsDeConsommation(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge' | 'envoyerCourriel'>
): PortsDeConsommation {
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    transaction: transactionDeConsommation(d.prisma),
    configuration: configurationDuLien(d.env),
    ...appareilsDe(d),
  };
}

// ── SEC-62 : l'avis « nouvel appareil », puis la confirmation ─────────────────────────────────────

/**
 * `{dateHeure}` de l'avis : l'instant de la consommation, au jour et à l'heure LÉGALE de Paris, à
 * la minute — « 4 octobre 2026 à 14 h 20 (heure de Paris) », « 1er » pour le premier du mois.
 * Rien de l'appareil, ni lieu ni navigateur (texte de la juriste). Les mois sont ceux de la
 * micro-copie (DM-55), le « 1er » vit ici : la garde de la micro-copie refuse un chiffre en clair.
 */
export function dateHeureDeLAvis(instant: Date): string {
  const p = versParis(instant.getTime());
  const jour = p.jour === 1 ? '1er' : String(p.jour);
  const minute = String(p.minute).padStart(2, '0');
  return `${jour} ${MOIS_EN_TOUTES_LETTRES[p.mois - 1]} ${p.annee} à ${p.heure} h ${minute} (heure de Paris)`;
}

/**
 * Les ports des appareils du clic et du code : l'avis part à l'adresse STOCKÉE, déchiffrée sous sa
 * ligne, par la composition unique de `notifier()` ; il ne porte que le compte et l'instant. Un
 * courriel qui n'est pas `envoye` (en échec, retenu) fait LEVER l'avis : le noyau le lit comme un
 * avis en échec, et ne confirme rien (`avis_echoue`). La confirmation est la transaction COURTE de
 * `transactionDeConfirmation`, ouverte seulement après un avis accepté.
 */
function portsDesAppareils(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'> & {
    envoyerCourriel: DependancesDeLaNotification['envoyerCourriel'];
  }
): PortsDesAppareils {
  const compte = lectureDuCompte(d.prisma, clesPii(d.env));
  const urlDeLEspace = new URL(configurationDuLien(d.env).urlPublique);
  return {
    async aviser({ apporteurId, confirmeAt }) {
      const { courriel } = await notifier(
        {
          cle: 'nouvel_appareil',
          a: await compte.adresseStockee(apporteurId),
          parametres: { dateHeure: dateHeureDeLAvis(confirmeAt) },
          attributionId: null,
        },
        {
          acces: forApporteur(d.prisma, apporteurId),
          envoyerCourriel: d.envoyerCourriel,
          urlDeLEspace,
        }
      );
      if (courriel !== 'envoye') throw new Error(`avis_non_envoye : ${String(courriel)}`);
    },
    maintenant: () => new Date(d.horloge.maintenant()),
    transaction: transactionDeConfirmation(d.prisma),
  };
}

/** Le port des appareils, branché seulement quand l'émetteur des notifications est là. */
function appareilsDe(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge' | 'envoyerCourriel'>
): { appareils?: PortsDesAppareils } {
  const { envoyerCourriel } = d;
  return envoyerCourriel === undefined
    ? {}
    : { appareils: portsDesAppareils({ ...d, envoyerCourriel }) };
}

/**
 * SEC-54 — le COOKIE D'ATTENTE du code (cadrage de la lentille sécurité, 2026-10-03). Posé à la
 * demande pour toute adresse bien formée, compte connu ou non, avec le même en-tête (seule la valeur
 * change) ; il porte l'EMPREINTE de recherche de l'adresse, jamais l'adresse. Il dure ce que dure le
 * lien, lu dans la SSOT des durées, et s'efface à l'ouverture de la session, au « Changer
 * d'adresse » et à l'annulation du lien au cinquième échec. SameSite=Strict : seule une requête du
 * même site le porte.
 */
export const COOKIE_DATTENTE = {
  nom: '__Host-connexion_code',
  attributs: {
    httpOnly: true,
    secure: true,
    path: '/',
    sameSite: 'strict',
    maxAge: DUREES_AUTH.lienMagiqueMs.valeur / 1000,
  },
} as const;

/**
 * Efface le cookie d'attente PAR LE MÊME EN-TÊTE que sa pose, Max-Age=0 : un cookie `__Host-` n'est
 * accepté qu'avec Secure et Path=/, et un effacement nu (`delete`) sans Secure serait REJETÉ par le
 * navigateur, le cookie restant jusqu'à son terme (lentille sécurité, 2026-10-03).
 */
export function effacerLeCookieDAttente(pot: PotDeCookies): void {
  effacerUnCookie(pot, COOKIE_DATTENTE);
}

/** Ce qu'un effacement lit du magasin de cookies de Next : la pose seule. */
type PotDeCookies = {
  set(nom: string, valeur: string, attributs: Record<string, unknown>): unknown;
};

/** SEC-29 : l'effacement d'un cookie `__Host-`, quel qu'il soit, par le même en-tête que sa pose. */
export function effacerUnCookie(
  pot: PotDeCookies,
  cookie: { readonly nom: string; readonly attributs: Readonly<Record<string, unknown>> }
): void {
  pot.set(cookie.nom, '', { ...cookie.attributs, maxAge: 0 });
}

/**
 * SEC-29 (lentille sécurité, condition b) : les cookies de la CONSOLE sont DISTINCTS de ceux de
 * l'espace. La session de la console porte son nom `__Host-` propre et dure ce que dure une session
 * de la console (`durees.ts`), sans « rester connecté » ; SameSite=Strict : seule une requête du
 * même site la porte. L'attente du code de la console a son propre nom, mêmes attributs que celle
 * de l'espace.
 */
export const COOKIE_DE_SESSION_CONSOLE = {
  nom: '__Host-partners-console',
  attributs: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: DUREES_AUTH.sessionConsoleMs.valeur / 1000,
  },
} as const;

export const COOKIE_DATTENTE_CONSOLE = {
  nom: '__Host-console_code',
  attributs: COOKIE_DATTENTE.attributs,
} as const;

/** L'empreinte de recherche de l'adresse saisie, comme à l'émission, ou `null` si elle est hors forme. */
export function empreinteDeLaSaisie(env: DependancesDuLien['env'], saisie: string): string | null {
  try {
    return empreinteRecherche('courriel', saisie, clesPii(env));
  } catch {
    return null;
  }
}

/**
 * SEC-54 — les ports de la vérification du code. L'empreinte de l'adresse vient du cookie
 * d'attente, et non d'une saisie ; les deux compteurs sont ceux du registre, appelés directement par
 * leur nom ; le journal ne reçoit qu'un motif fermé.
 */
export function portsDuCode(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge' | 'journal' | 'envoyerCourriel'>,
  lienAnnule?: () => void
): PortsDuCode {
  const cles = clesPii(d.env);
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    adresseDuClient: (entetes) => adresseDuClient(entetes, SAUTS_DE_CONFIANCE),
    empreinteAdresseReseau: (adresse) => empreinteAdresseReseau(adresse, cles),
    ...(lienAnnule ? { lienAnnule } : {}),
    compterAdresseCode: (sujet, maintenantMs) =>
      limiter('magic:code-ip', sujetDepuisEmpreinte(sujet), maintenantMs),
    compterCourrielCode: (sujet, maintenantMs) =>
      limiter('magic:code-courriel', sujetDepuisEmpreinte(sujet), maintenantMs),
    transaction: transactionDuCode(d.prisma),
    signaler: (motif) => d.journal.warn(`lien_magique_${motif}`),
    configuration: configurationDuLien(d.env),
    ...appareilsDe(d),
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

// ── SEC-29 : la console ──────────────────────────────────────────────────────────────────────────

/** Le corps du courriel de la console : sa phrase (juriste), l'URL, puis le code et sa phrase. */
export function corpsDuCourrielConsole(url: string, code: string): string {
  const { avant, apres } = CODE_DU_COURRIEL_DE_CONNEXION;
  return `${CONNEXION_CONSOLE.courriel.corps}

${url}

${avant}
${code}
${apres}`;
}

/**
 * Les compteurs de la console (REQ-SEC-062). Chaque appel à `limiter` est DIRECT, à nom littéral
 * du registre (garde `securite:rate-famille`). Un compteur ÉPUISÉ se signale sous sa CLÉ, jamais
 * sous sa seule famille (condition de la lentille sécurité) : la console, cible de plus grande
 * valeur, a ses propres signaux. La clé s'écrit par son suffixe, qui la désigne seule (la famille ne
 * s'écrit qu'au registre) ; le motif est fermé : ni sujet, ni adresse, ni empreinte.
 */
type CleDeLaConsole =
  'console-demande-ip' | 'console-demande-courriel' | 'console-code-ip' | 'console-code-courriel';

function signalerSiEpuise(
  verdict: VerdictDeLimite,
  cle: CleDeLaConsole,
  journal: DependancesDuLien['journal']
): VerdictDeLimite {
  if (!verdict.autorise) journal.warn(`compteur_epuise:${cle}`);
  return verdict;
}

export function portsDeDemandeConsole(d: DependancesDuLien): PortsDeDemandeConsole {
  const cles = clesPii(d.env);
  const espace = portsDeDemande(d);
  return {
    ...espace,
    compterAdresse: async (sujet, maintenantMs) =>
      signalerSiEpuise(
        await limiter('magic:console-demande-ip', sujetDepuisEmpreinte(sujet), maintenantMs),
        'console-demande-ip',
        d.journal
      ),
    compterCourriel: async (sujet, maintenantMs) =>
      signalerSiEpuise(
        await limiter('magic:console-demande-courriel', sujetDepuisEmpreinte(sujet), maintenantMs),
        'console-demande-courriel',
        d.journal
      ),
    emission: {
      ...lectureDuCompteConsole(d.prisma, cles),
      ...ecrituresDeLienConsole(d.prisma),
      envoyer: ({ a, url, code }) =>
        d.envoi.envoyer({
          a,
          sujet: CONNEXION_CONSOLE.courriel.sujet,
          corps: corpsDuCourrielConsole(url, code),
          html: htmlDuCourrielDeConnexion(
            CONNEXION_CONSOLE.courriel,
            CONNEXION_CONSOLE.courriel.appel,
            url,
            code
          ),
          gabarit: 'lien_magique_console',
        }),
      signalerPotDeMiel: espace.emission.signalerPotDeMiel,
      signalerEchec: (motif) => d.journal.warn(`lien_magique_console_${motif}`),
    },
  };
}

export function portsDeConsommationConsole(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'>
): PortsDeConsommationConsole {
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    transaction: transactionDeConsommationConsole(d.prisma),
    configuration: configurationDuLien(d.env),
  };
}

export function portsDuCodeConsole(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge' | 'journal'>,
  lienAnnule?: () => void
): PortsDuCodeConsole {
  // La console n'a pas d'appareil : ses ports sont ceux du code de l'espace, SANS l'émetteur des
  // notifications, quoi que porte `d`.
  const { env, prisma, horloge, journal } = d;
  return {
    ...portsDuCode({ env, prisma, horloge, journal }, lienAnnule),
    compterAdresseCode: async (sujet, maintenantMs) =>
      signalerSiEpuise(
        await limiter('magic:console-code-ip', sujetDepuisEmpreinte(sujet), maintenantMs),
        'console-code-ip',
        d.journal
      ),
    compterCourrielCode: async (sujet, maintenantMs) =>
      signalerSiEpuise(
        await limiter('magic:console-code-courriel', sujetDepuisEmpreinte(sujet), maintenantMs),
        'console-code-courriel',
        d.journal
      ),
    transaction: transactionDuCodeConsole(d.prisma),
    signaler: (motif) => d.journal.warn(`lien_magique_console_${motif}`),
  };
}

/**
 * SEC-42 — l'envoi par l'ÉMETTEUR de courriels (INT-T10) : chaque demande écrit sa ligne
 * `courriels_envoyes` (gabarit, empreinte de l'adresse, statut — ni adresse, ni corps, donc ni
 * jeton), puis le relais est appelé une fois, ou la demande est retenue (drapeau DMARC fermé,
 * adresse supprimée). L'émetteur est construit À L'ENVOI : une configuration absente fait échouer
 * l'envoi (signalé par le travail différé), jamais la page.
 */
export function envoiParLEmetteur(emetteur: () => DependancesDeLEmetteur): EnvoiDuLien {
  return {
    async envoyer({ a, sujet, corps, html, gabarit = 'lien_magique' }) {
      await demanderEnvoi(
        { gabarit, a, sujet, corps, ...(html === undefined ? {} : { html }), apporteurId: null },
        emetteur()
      );
    },
  };
}

/**
 * La voie d'envoi du processus, et elle seule : en PRODUCTION, l'émetteur ; hors production, le
 * puits du notifieur (`NOTIFY_SINK`), qui n'écrit que le sujet et la taille du corps.
 */
export function envoiDuProcessus(
  env: DependancesDuLien['env'],
  fabriques: { emetteur: () => DependancesDeLEmetteur; notifieur: () => Notifieur }
): EnvoiDuLien {
  return productionDeclaree(env)
    ? envoiParLEmetteur(fabriques.emetteur)
    : envoiParLeNotifieur(fabriques.notifieur());
}

/**
 * SEC-62 — l'émetteur des notifications de l'apporteur, et lui seul : en PRODUCTION, l'émetteur
 * de courriels, dont le statut remonte TEL QUEL ; hors production, le puits du notifieur, qui ne
 * reçoit que le sujet et le corps, et accepte.
 */
export function envoiDesNotifications(
  env: DependancesDuLien['env'],
  fabriques: { emetteur: () => DependancesDeLEmetteur; notifieur: () => Notifieur }
): DependancesDeLaNotification['envoyerCourriel'] {
  if (productionDeclaree(env)) return (demande) => demanderEnvoi(demande, fabriques.emetteur());
  return async ({ sujet, corps }) => {
    await fabriques.notifieur().notifier({ sujet, corps });
    return 'envoye';
  };
}

let client: PrismaClient | null = null;

/**
 * Les dépendances du processus, pour les actions serveur : le client de base (un par processus),
 * l'horloge du système, le journal, et `planifier` branché sur `apres` — `after()` de Next, que
 * l'action passe. Le travail planifié n'est JAMAIS exécuté ici : il est confié.
 *
 * L'envoi (SEC-42) : en production, l'émetteur d'INT-T10 et son relais réel (INT-T57), configuré
 * par `ZEPTOMAIL_API_URL` et `ZEPTOMAIL_SEND_TOKEN` ; sans eux, il refuse en se nommant, et la ligne
 * le dit. Hors production, le puits du notifieur.
 */
export function dependancesDuProcessus(outils: {
  apres: (travail: () => Promise<void>) => void;
  env: DependancesDuLien['env'];
}): DependancesDuLien {
  client ??= new PrismaClient();
  const prisma = client;
  const journal = creerJournal();
  const fabriques = {
    emetteur: (): DependancesDeLEmetteur => ({
      configuration: configurationDeLEmetteur(outils.env, domaines().envoi),
      relais: relaisZeptomail({
        url: outils.env.ZEPTOMAIL_API_URL,
        jeton: outils.env.ZEPTOMAIL_SEND_TOKEN,
      }),
      depot: depotDesCourriels(prisma),
      cles: clesPii(outils.env),
      maintenant: () => new Date(horlogeSysteme.maintenant()),
      nouvelId: randomUUID,
    }),
    notifieur: () => creerNotifieur({ env: outils.env, journal, transports: [] }),
  };
  return {
    env: outils.env,
    prisma,
    horloge: horlogeSysteme,
    planifier: (travail) => outils.apres(travail),
    envoi: envoiDuProcessus(outils.env, fabriques),
    journal,
    envoyerCourriel: envoiDesNotifications(outils.env, fabriques),
  };
}

/**
 * SEC-29 : les ports de `requireRole` pour le processus — le dépôt des sessions de la console, son
 * horloge, et le secret des sessions (celui de l'espace : même table, domaine d'empreinte distinct).
 */
export function portsDeRoleConsole(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'>
): PortsDeRole {
  const { session } = configurationDuLien(d.env);
  return {
    maintenant: () => new Date(d.horloge.maintenant()),
    depot: depotDeSessionsConsole(d.prisma),
    configuration: session,
  };
}

/**
 * SEC-29 : la déconnexion de la console. La session est RÉVOQUÉE en base (une écriture
 * conditionnelle, sur une session de la console encore ouverte), puis son cookie est effacé par
 * l'appelant : un jeton copié ailleurs ne rouvre rien.
 */
export async function revoquerSessionConsole(
  d: Pick<DependancesDuLien, 'env' | 'prisma' | 'horloge'>,
  jeton: string
): Promise<void> {
  const { session } = configurationDuLien(d.env);
  await d.prisma.sessionEspace.updateMany({
    where: {
      tokenHash: empreinteDeSessionConsole(jeton, session.secret),
      utilisateurConsoleId: { not: null },
      revoqueAt: null,
    },
    data: { revoqueAt: new Date(d.horloge.maintenant()) },
  });
}
