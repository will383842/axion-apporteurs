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
 *      l'identifiant technique de l'objet et le compte concerné. Un identifiant qui n'a pas la forme
 *      d'un identifiant technique (un courriel, un téléphone passés par erreur) n'entre pas dans le
 *      message. La garde `garde-sans-pii.ts` confronte chaque gabarit à un objet chargé de données
 *      personnelles.
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

/** Ce qu'une alerte porte : de quoi RETROUVER l'objet, et rien de plus. */
export type ObjetAlerte = {
  readonly categorie: string;
  readonly id: string;
  readonly compte?: string;
};

/** Un identifiant technique : lettres ASCII, chiffres, `_` et `-`, sans `@`, espace ni `+`. */
const IDENTIFIANT_TECHNIQUE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RETIRE = '[identifiant non technique retiré]';

const technique = (v: unknown): string =>
  typeof v === 'string' && IDENTIFIANT_TECHNIQUE.test(v) ? v : RETIRE;

const ligneDeBase = (o: ObjetAlerte): string =>
  `[${technique(o.categorie)}] objet ${technique(o.id)}` +
  (o.compte === undefined ? '' : ` · compte ${technique(o.compte)}`);

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
      const cle = `${objet.categorie}\u0000${objet.id}`;
      const precedent = dernierEnvoi.get(cle);
      if (precedent !== undefined && precedent > depuis) return 'dedoublonnee';

      const envois = envoisParCategorie.get(objet.categorie)?.filter((t) => t > depuis) ?? [];
      envoisParCategorie.set(objet.categorie, envois);
      if (envois.length >= plafondParHeure) return 'plafonnee';

      const gabarit: NomDeGabarit =
        envois.length + 1 === plafondParHeure ? 'alerte_plafond' : 'alerte';
      envois.push(maintenant);
      dernierEnvoi.set(cle, maintenant);
      await notifieur.notifier({
        sujet: `alerte console · ${technique(objet.categorie)}`,
        corps: messageDAlerte(gabarit, objet),
      });
      return 'envoyee';
    },
  };
}
