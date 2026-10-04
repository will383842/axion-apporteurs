/**
 * Les alertes de console par le bot Telegram DÉDIÉ à Partners — INT-T14 (REQ-INT-024).
 *
 * CE QUE CE MODULE GARANTIT.
 *   1. DÉDOUBLONNAGE : la même alerte (catégorie + identifiant) ne part qu'une fois par heure
 *      glissante. Une alerte qui se répète 400 fois dans l'heure fait désarmer le canal par celui qui
 *      le lit, et c'est ainsi qu'une alerte utile se perd.
 *   2. PLAFOND HORAIRE PAR CATÉGORIE : au plus `plafondParHeure` envois d'une même catégorie par
 *      heure glissante. Le dernier envoi permis DIT que la suite est retenue ; une autre catégorie
 *      n'en est pas affectée. La valeur du plafond vit en configuration (`docs/tiers/telegram.md`
 *      §4) : elle entre en paramètre, jamais écrite ici.
 *   3. AUCUNE COORDONNÉE DE TIERS NI LIEN DE CONSOLE : le message ne porte que la catégorie,
 *      l'identifiant technique de l'objet et le compte concerné. LISTE BLANCHE : un `id` ou un
 *      `compte` n'entre dans le message que s'il a le format des identifiants d'agrégat du dépôt
 *      (`String @id @default(uuid()) @db.Uuid`, `prisma/schema.prisma`). Toute autre valeur — un
 *      courriel, un téléphone avec ou sans séparateur, un nom, un nombre — est remplacée par un
 *      marqueur neutre. Une catégorie n'entre que faite de mots en minuscules liés par `_`, sans
 *      chiffre. La garde `garde-sans-pii.ts` confronte chaque gabarit à un objet chargé de données
 *      personnelles.
 *   4. LA FORME AFFICHÉE EST LA FORME COMPTÉE : le dédoublonnage et le plafond portent sur la
 *      catégorie et l'identifiant NORMALISÉS, tels que le message les écrit. Des valeurs brutes
 *      distinctes que le message rendrait par le même marqueur partagent donc un seul plafond et un
 *      seul dédoublonnage : varier la valeur brute ne contourne rien.
 *
 * LE TRANSPORT N'EST PAS ICI. L'alerteur remet ses messages au notifieur de QA-T08
 * (`src/lib/notify.ts`) : hors production ils vont au puits, jamais au canal. L'appel réel à
 * l'interface du bot attend la rubrique 2 de `docs/tiers/telegram.md` (source officielle non lue) et
 * les deux secrets du bot dédié — jeton et conversation de console — qu'aucun nom de
 * `src/lib/env.ts` ne déclare à ce jour. Aucun envoi réel ne peut donc partir, et c'est l'état voulu.
 *
 * LIMITE DÉCLARÉE. L'état du dédoublonnage et du plafond vit dans la mémoire du processus : deux
 * instances du serveur ont chacune leur plafond.
 */
import { MOTIFS_DE_NON_RENDU } from '../../attribution/notifications';
import { TypeEvenementRecu } from '@prisma/client';
import type { Horloge } from '../../../domain/temps/horloge';
import { MS_PAR_HEURE } from '../../../domain/temps/calendrier-civil';
import type { Notifieur } from '../../../lib/notify';

/**
 * LES CATÉGORIES D'ALERTE, fermées — la liste, et rien qu'elle.
 *
 * 🔴 LE DÉFAUT QUE CETTE FERMETURE FERME (revue `securite`, PR 180). `categorie` était un `string`
 * filtré par une expression de FORME (« des mots en minuscules liés par `_` »). Un appelant qui
 * aurait écrit `categorie: nom.toLowerCase()` aurait fait passer `jean_dupont` : la forme est
 * valide, et le nom serait sorti DANS LE MESSAGE et DANS LE SUJET. La garde ne l'aurait pas vu,
 * son témoin portant une catégorie fixe.
 *
 * Une expression de forme dit à quoi une valeur RESSEMBLE ; une liste close dit ce qu'elle EST.
 * Sur une donnée personnelle, la ressemblance ne suffit pas.
 *
 * 🔴 CE QUE CETTE LISTE A PORTÉ À TORT, ET POURQUOI C'ÉTAIT GRAVE. Une première version en portait
 * HUIT, annoncées comme « les catégories réellement employées ». C'était faux, mesuré par une revue
 * `exactitude` : seules trois sont passées à `alerter()`. Les cinq autres — `identite`, `contact`,
 * `bancaire`, `reseau`, `postal` — sont MOT POUR MOT `CategoriePersonnelle`
 * (`src/domain/donnees-personnelles/champs.ts`), recopiées depuis un concept qui n'a rien à voir :
 * ce sont les catégories de DONNÉE PERSONNELLE que cette garde protège. Une liste close qui les
 * admet autorise un appelant à étiqueter une alerte du nom de ce qu'on ne doit pas divulguer.
 * L'erreur venait d'un relevé fait à la va-vite : un `grep` sur `categorie:` avait ramassé le
 * lexique des champs personnels au lieu des appelants d'`alerter()`.
 *
 * DONC : cette liste ne porte que les catégories ÉMISES ou EXIGÉES. Elle grandit quand un appelant
 * en a besoin, jamais par anticipation — une valeur admise sans émetteur est une porte ouverte que
 * personne ne surveille.
 */
export const CATEGORIES_ALERTE = [
  /**
   * Émise par les TESTS seulement (`notif-sans-pii.spec.ts`), comme catégorie d'essai du plafond et
   * du dédoublonnage. AUCUNE exigence ne la nomme, et les deux qui s'en approchent ont été lues :
   *
   *   — `REQ-ARG-025` porte une alerte console pour le cas SOUS le seuil, non bloquant (« sous le
   *     seuil, l'absence d'attestation ne bloque aucun versement et lève une alerte console »), et
   *     NON pour un relevé bloqué. Elle décrit bien un relevé qui passe `bloque` motif
   *     `vigilance_perimee` au-dessus du seuil — mais sans exiger d'alerte pour cet état-là.
   *   — `REQ-QA-026` alerte si le relevé du 1er N'A PAS TOURNÉ le 2 à 08:00, ce qui n'est pas
   *     « bloqué » non plus.
   *
   * Elle reste donc ce qu'elle est — une catégorie d'essai —, jusqu'à ce qu'un émetteur de `src/` la
   * demande et nomme son exigence.
   */
  'releve_bloque',
  /** `QA-T12` — l'échec de l'exercice mensuel de restauration (`REQ-QA-023`, `docs/tiers/telegram.md`). */
  'restauration_echouee',
  /**
   * `QA-T53` — un vidage resté en clair (`REQ-QA-023`) : tout échec du rechiffrement horaire, et la
   * garde des clairs quand elle nomme un clair plus vieux que le seuil de la SSOT
   * (`scripts/sauvegarde/cycle.ts`). Gabarit : `alerte`, la catégorie et un identifiant technique ;
   * ni la clé du vidage ni le motif de l'échec n'entrent dans le message.
   */
  'rechiffrement_echoue',
  /**
   * `QA-T54` — un déploiement dont l'atterrissage n'est pas vérifié (`REQ-GOV-014`). Le job
   * `deployer` de `.github/workflows/deploy.yml` ne fait que vérifier, et rougit quand le sha servi
   * n'est pas le sha fusionné (en-tête absent ou délai dépassé compris) ou quand `readyz` n'est pas
   * prêt ; c'est le job `alerter`, À PART (`scripts/gates/deploy-verify.ts --alerter`, après un
   * `deployer` rouge ou annulé), qui émet l'alerte. Le message ne porte que le sha attendu, le sha
   * servi et l'environnement (`ObjetAlerte.deploiement`, chacun en liste blanche).
   */
  'deploiement_non_atterri',
  /** Le témoin de la garde `G-SEC-NOTIF` (`garde-sans-pii.ts`, `OBJET_TEMOIN`). */
  'temoin_garde',
  /**
   * `INT-T49` et `INT-T54` — des événements reçus qui ATTENDENT au-delà de leur seuil de la SSOT
   * (`REQ-QA-027`, `REQ-DM-036`, `REQ-ARG-003`) : leurs coordonnées (plus reprises), un traitant, ou
   * un parent. Émise par le lanceur au FRANCHISSEMENT du seuil, une fois par (forme, type). Le message
   * ne porte que la forme, le type d'événement, le nombre et l'âge de la plus ancienne
   * (`ObjetAlerte.attente`, chacun en liste blanche) : ni référence, ni charge, ni identifiant
   * d'événement.
   */
  'attente_depassee',
  /**
   * `QA-T57` — le dernier vidage du dépôt est plus vieux que `DERNIER_VIDAGE_MAX_MINUTES` (SSOT), ou
   * absent (`REQ-QA-023`) : la plateforme ne vide plus la base. Émise par `sauvegarde:fraicheur`
   * (`scripts/sauvegarde/cycle.ts`). Gabarit : `alerte`, la catégorie et un identifiant technique ;
   * ni la clé du vidage ni sa date n'entrent dans le message.
   */
  'vidage_perime',
  /**
   * `INT-T08-P` — la réconciliation quotidienne avec axion-ia (`REQ-INT-013`, rattrapage 81) : une
   * relecture ou un rejeu en échec, un trou rattrapé, une relecture arrêtée par sa borne. Le message
   * ne porte que le genre (liste fermée), un motif de forme fermée et un NOMBRE
   * (`ObjetAlerte.reconciliation`) : les `event_id` manquants restent dans Partners, au battement.
   */
  'reconciliation',
  /**
   * DM-55 (arbitrage de la sécurité, `REQ-UX-016`) — une notification de la machine qui ne s'est pas
   * rendue : le courriel n'est pas parti, et la console doit informer autrement. Le message ne porte
   * que le motif FERMÉ (`MOTIFS_DE_NON_RENDU`) et un NOMBRE (`ObjetAlerte.nonRendu`) : ni
   * identifiant de notification ou d'attribution, ni texte, ni SIREN.
   */
  'notification_non_rendue',
] as const;

/**
 * Les genres d'une alerte de réconciliation : ceux des signaux de `reconcilier` (INT-T08-P), et
 * l'écart de sommes de `passageDesSommes` (INT-T73-P), qui ne porte que son NOMBRE.
 */
export const GENRES_RECONCILIATION = [
  'relecture_echouee',
  'rejeu_echoue',
  'trou_rattrape',
  'relecture_bornee',
  'ecart_de_sommes',
] as const;

/** La forme d'un motif de réconciliation : un code en minuscules (`statut_503`), rien d'autre. */
const MOTIF_DE_RECONCILIATION = /^[a-z][a-z0-9_]{0,39}$/;

export type CategorieAlerte = (typeof CATEGORIES_ALERTE)[number];

/** Ce qu'une alerte porte : de quoi RETROUVER l'objet, et rien de plus. */
export type ObjetAlerte = {
  readonly categorie: CategorieAlerte;
  readonly id: string;
  readonly compte?: string;
  /**
   * QA-T54 — ce qu'une alerte `deploiement_non_atterri` montre. Le sha servi vient d'un en-tête de
   * RÉPONSE, que contrôle quiconque sert le domaine : chaque champ passe une liste blanche
   * (`shaLisible`, `ENVIRONNEMENTS_DE_DEPLOIEMENT`), sinon il est écrit « illisible ».
   */
  readonly deploiement?: {
    readonly attendu: string;
    readonly servi: string;
    readonly environnement: string;
  };
  /**
   * INT-T49 / INT-T54 — ce qu'une alerte `attente_depassee` montre : la forme de l'attente et le type
   * d'événement, en listes fermées ; le nombre et l'âge, en entiers. Rien d'autre.
   */
  readonly reconciliation?: {
    readonly genre: string;
    readonly motif?: string;
    readonly nombre?: number;
  };
  /** DM-55 — ce qu'une alerte `notification_non_rendue` montre : le motif fermé, et un nombre. */
  readonly nonRendu?: {
    readonly motif: string;
    readonly nombre: number;
  };
  readonly attente?: {
    readonly forme: string;
    readonly type: string;
    readonly nombre: number;
    readonly plusAncienneJours: number;
  };
};

/** Les formes d'attente, fermées : ce qu'attend un événement reçu (INT-T49, INT-T54). */
export const FORMES_D_ATTENTE = ['coordonnees', 'traitant', 'parent'] as const;
export type FormeDAttente = (typeof FORMES_D_ATTENTE)[number];

/** Les environnements de déploiement, fermés : rien d'autre n'entre dans une alerte. */
export const ENVIRONNEMENTS_DE_DEPLOIEMENT = ['production', 'preview'] as const;

const SHA_LISIBLE = /^[0-9a-f]{7,40}$/;
const ILLISIBLE = 'illisible';

/**
 * Un sha de 7 à 40 hexadécimaux (casse indifférente), rendu en minuscules ; absent ou vide,
 * « inconnu » (le job qui devait le lire a pu mourir avant) ; toute autre valeur, « illisible ».
 */
export const shaLisible = (v: unknown): string =>
  v === undefined || v === null || v === ''
    ? 'inconnu'
    : typeof v === 'string' && SHA_LISIBLE.test(v.toLowerCase())
      ? v.toLowerCase()
      : ILLISIBLE;

const dansLaListe =
  (liste: readonly string[]) =>
  (v: unknown): string =>
    typeof v === 'string' && liste.includes(v) ? v : ILLISIBLE;
const formeDAttente = dansLaListe(FORMES_D_ATTENTE);
const typeDEvenement = dansLaListe(Object.values(TypeEvenementRecu));
const entier = (v: unknown): string =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? String(v) : ILLISIBLE;

const genreDeReconciliation = dansLaListe(GENRES_RECONCILIATION);
const motifDeNonRendu = dansLaListe(MOTIFS_DE_NON_RENDU);
const motifDeReconciliation = (v: unknown): string =>
  typeof v === 'string' && MOTIF_DE_RECONCILIATION.test(v) ? v : ILLISIBLE;

const environnement = (v: unknown): string =>
  typeof v === 'string' && (ENVIRONNEMENTS_DE_DEPLOIEMENT as readonly string[]).includes(v)
    ? v
    : ILLISIBLE;

/**
 * Le format des identifiants d'agrégat du dépôt, et LUI SEUL : `@default(uuid()) @db.Uuid`
 * (`prisma/schema.prisma`), en minuscules comme PostgreSQL le rend. Une liste blanche, pas une liste
 * de formes interdites : un téléphone sans séparateur passait la règle précédente.
 */
const IDENTIFIANT_D_AGREGAT = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const RETIRE = '[identifiant non technique retiré]';

const identifiant = (v: unknown): string =>
  typeof v === 'string' && IDENTIFIANT_D_AGREGAT.test(v) ? v : RETIRE;

/**
 * La catégorie, confrontée à la LISTE CLOSE et non à une forme. Le type l'interdit déjà à la
 * compilation ; ce contrôle tient la même règle à l'EXÉCUTION, pour qu'un `as`, un `any` ou une
 * frontière non typée ne la contourne pas. Les deux sont voulus : le type protège l'auteur, le
 * contrôle protège la donnée.
 */
const categorie = (v: unknown): string =>
  typeof v === 'string' && (CATEGORIES_ALERTE as readonly string[]).includes(v) ? v : RETIRE;

const ligneDeBase = (o: ObjetAlerte): string =>
  `[${categorie(o.categorie)}] objet ${identifiant(o.id)}` +
  (o.compte === undefined ? '' : ` · compte ${identifiant(o.compte)}`) +
  (o.deploiement === undefined
    ? ''
    : ` · attendu ${shaLisible(o.deploiement.attendu)} · servi ${shaLisible(o.deploiement.servi)}` +
      ` · environnement ${environnement(o.deploiement.environnement)}`) +
  (o.attente === undefined
    ? ''
    : ` · attente ${formeDAttente(o.attente.forme)} · type ${typeDEvenement(o.attente.type)}` +
      ` · ${entier(o.attente.nombre)} au-delà · la plus ancienne ${entier(o.attente.plusAncienneJours)} j`) +
  (o.reconciliation === undefined
    ? ''
    : ` · réconciliation ${genreDeReconciliation(o.reconciliation.genre)}` +
      (o.reconciliation.motif === undefined
        ? ''
        : ` · motif ${motifDeReconciliation(o.reconciliation.motif)}`) +
      (o.reconciliation.nombre === undefined ? '' : ` · ${entier(o.reconciliation.nombre)}`)) +
  (o.nonRendu === undefined
    ? ''
    : ` · non rendu ${motifDeNonRendu(o.nonRendu.motif)} · ${entier(o.nonRendu.nombre)}`);

/**
 * Les gabarits de message, et eux seuls : la garde les confronte TOUS, en les énumérant ici. Chacun
 * reçoit l'objet tel que l'appelant le passe — éventuellement plus riche que `ObjetAlerte` — et n'en
 * lit que les trois champs permis.
 */
export const GABARITS_ALERTE = {
  alerte: (o: ObjetAlerte): string => ligneDeBase(o),
  alerte_plafond: (o: ObjetAlerte): string =>
    `${ligneDeBase(o)} · plafond horaire atteint : les alertes suivantes de cette catégorie sont ` +
    `retenues jusqu'à la fin de l'heure`,
} as const satisfies Record<string, (o: ObjetAlerte) => string>;

export type NomDeGabarit = keyof typeof GABARITS_ALERTE;

export function messageDAlerte(gabarit: NomDeGabarit, objet: ObjetAlerte): string {
  return GABARITS_ALERTE[gabarit](objet);
}

export type IssueDAlerte = 'envoyee' | 'dedoublonnee' | 'plafonnee';

export class PlafondInvalide extends Error {
  readonly motif = 'plafond_invalide';
  constructor() {
    super('plafond_invalide : le plafond horaire par catégorie est un entier positif');
    this.name = 'PlafondInvalide';
  }
}

export type OptionsAlerteur = {
  readonly notifieur: Notifieur;
  readonly horloge: Horloge;
  /** Envois permis par catégorie et par heure glissante — lu en configuration par l'appelant. */
  readonly plafondParHeure: number;
};

export interface Alerteur {
  alerter(objet: ObjetAlerte): Promise<IssueDAlerte>;
}

export function creerAlerteur({ notifieur, horloge, plafondParHeure }: OptionsAlerteur): Alerteur {
  if (!Number.isInteger(plafondParHeure) || plafondParHeure < 1) throw new PlafondInvalide();
  const dernierEnvoi = new Map<string, number>();
  const envoisParCategorie = new Map<string, number[]>();

  return {
    async alerter(objet) {
      const maintenant = horloge.maintenant();
      const depuis = maintenant - MS_PAR_HEURE;
      // La forme affichée est la forme comptée (garantie 4).
      const cat = categorie(objet.categorie);
      const cle = `${cat}\u0000${identifiant(objet.id)}`;
      const precedent = dernierEnvoi.get(cle);
      if (precedent !== undefined && precedent > depuis) return 'dedoublonnee';

      const envois = envoisParCategorie.get(cat)?.filter((t) => t > depuis) ?? [];
      envoisParCategorie.set(cat, envois);
      if (envois.length >= plafondParHeure) return 'plafonnee';

      const gabarit: NomDeGabarit =
        envois.length + 1 === plafondParHeure ? 'alerte_plafond' : 'alerte';
      envois.push(maintenant);
      dernierEnvoi.set(cle, maintenant);
      await notifieur.notifier({
        sujet: `alerte console · ${cat}`,
        corps: messageDAlerte(gabarit, objet),
      });
      return 'envoyee';
    },
  };
}

/**
 * INT-T54 — le notifieur Telegram du SERVEUR : le texte de l'alerte, rien d'autre ; le jeton ne sort
 * jamais, et un refus du canal est une erreur nommée par son seul statut. Dette nommée : les deux
 * copies des scripts (`scripts/gates/deploy-verify.ts`, `scripts/sauvegarde/cycle.ts`) seront
 * ramenées ici, hors de ce lot.
 */
export function notifieurTelegram(
  jeton: string,
  salon: string,
  appeler: typeof fetch = fetch
): Notifieur {
  return {
    async notifier({ corps }) {
      const r = await appeler(`https://api.telegram.org/bot${jeton}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: salon, text: corps }),
        // Le jeton est dans le chemin : une redirection le porterait ailleurs.
        redirect: 'error',
      });
      await r.body?.cancel();
      if (!r.ok) throw new Error(`telegram_refuse : HTTP ${r.status}`);
    },
  };
}

// ── le transfert hors de l'Union européenne (SEC-64) ─────────────────────────────────────────────

// Le verrou vit dans un module PUR, importable par les scripts de la forge (sécurité, 5982916235).
export {
  DECISION_TRANSFERT_TELEGRAM,
  TransfertNonConsigne,
  exigerLeTransfertConsigne,
  type DecisionDuTransfert,
} from './transfert';
