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
 */
export const CATEGORIES_ALERTE = [
  'bancaire',
  'contact',
  'identite',
  'postal',
  'releve_bloque',
  'reseau',
  'restauration_echouee',
  'temoin_garde',
] as const;

export type CategorieAlerte = (typeof CATEGORIES_ALERTE)[number];

/** Ce qu'une alerte porte : de quoi RETROUVER l'objet, et rien de plus. */
export type ObjetAlerte = {
  readonly categorie: CategorieAlerte;
  readonly id: string;
  readonly compte?: string;
};

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
  (o.compte === undefined ? '' : ` · compte ${identifiant(o.compte)}`);

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
