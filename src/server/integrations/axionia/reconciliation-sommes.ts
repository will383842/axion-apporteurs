/**
 * La réconciliation des SOMMES avec axion-ia — INT-T73-P (REQ-INT-013). La part que la réconciliation des séquences ne
 * livre pas : sur sept jours glissants, les encaissements HT par SIREN attribué, des deux côtés.
 *
 * MÉTHODE (lentille schema, A02), sans migration ni route neuve :
 *   — la source axion-ia est la RELECTURE de sa file (`relecture.ts`) : les corps stockés, chaque
 *     ligne jugée par le schéma de sa charge au contrat (`payloadConforme`, le même que la réception
 *     des webhooks) ; la source Partners est la charge des MÊMES événements reçus ;
 *   — la fenêtre se juge sur la date MÉTIER de la charge (`paidAt`, `rembourseLe`), des deux côtés :
 *     un paiement ancien livré en retard tombe dans la même fenêtre de part et d'autre ;
 *   — par SIREN attribué, Σ HT des paiements et Σ HT des remboursements sont comparées SÉPARÉMENT ;
 *   — deux contrôles GLOBAUX, sans SIREN : le NOMBRE d'événements de chaque type et leur somme HT,
 *     attribués ou non, avec ou sans SIREN : une perte hors des SIREN attribués ne se cache pas ;
 *   — les sommes sont des entiers en centimes, en `number`, sous une garde à MAX_SAFE_INTEGER.
 *
 * Module pur : la relecture, la lecture de Partners et le signal sont des ports. Vers l'extérieur,
 * seul le NOMBRE d'écarts part ; les SIREN en cause ne sont nommés que dans Partners.
 */
import { TYPES_EVENEMENT, type TypeEvenement } from '../../../../packages/contracts/events';
import type { PrismaClient } from '@prisma/client';
import { MS_PAR_JOUR } from '../../../domain/temps/calendrier-civil';
import { PARAMETRES } from '../../../domain/seuils/ssot';
import { identifiantDuType, payloadConforme } from './reception';
import { RECOUVREMENT_SEQUENCES } from './reconciliation';
import type { LirePage, MotifDeRelecture } from './relecture';

/** La fenêtre glissante, en jours (REQ-INT-013). */
export const FENETRE_JOURS = 7;

/** Les types d'argent, LUS dans le contrat : la famille `paiement.`, jamais recopiée. */
export type TypeDeSomme = Extract<TypeEvenement, `paiement.${string}`>;
const TYPES_DE_SOMME: readonly TypeDeSomme[] = TYPES_EVENEMENT.filter((t): t is TypeDeSomme =>
  t.startsWith('paiement.')
);

type Nature = 'paiements' | 'remboursements';

/** Le remboursement est le type de la famille qui finit par `.rembourse` ; l'autre est le paiement. */
function natureDe(type: TypeDeSomme): Nature {
  return type.endsWith('.rembourse') ? 'remboursements' : 'paiements';
}

/** Un événement d'argent, réduit à ce que la comparaison lit. */
export interface EvenementDeSomme {
  readonly type: TypeDeSomme;
  readonly eventId: string;
  readonly siren: string | null;
  readonly montantHtCents: number;
  /** La date MÉTIER : `paidAt` d'un paiement, `rembourseLe` d'un remboursement. */
  readonly date: Date;
}

/** La date métier de chaque nature, lue dans sa charge. */
const CHAMP_DE_DATE: Readonly<Record<Nature, 'paidAt' | 'rembourseLe'>> = {
  paiements: 'paidAt',
  remboursements: 'rembourseLe',
};

function estTypeDeSomme(type: string): type is TypeDeSomme {
  return (TYPES_DE_SOMME as readonly string[]).includes(type);
}

/**
 * Une ligne (identifiant, type, charge) devenue événement de somme, si son type est un type d'argent
 * ET si sa charge est conforme au schéma du contrat ; `null` sinon. Une charge hors schéma n'est
 * jamais sommée : elle ne dirait pas son montant avec certitude.
 */
export function evenementDeSomme(
  eventId: string,
  type: string,
  charge: unknown
): EvenementDeSomme | null {
  if (!estTypeDeSomme(type) || !payloadConforme(type, charge)) return null;
  const c = charge as Record<string, unknown>;
  const date = new Date(String(c[CHAMP_DE_DATE[natureDe(type)]]));
  if (Number.isNaN(date.getTime())) return null;
  return {
    type,
    eventId,
    siren: typeof c['siren'] === 'string' ? c['siren'] : null,
    montantHtCents: c['montantHtCents'] as number,
    date,
  };
}

export interface Fenetre {
  readonly debut: Date;
  readonly fin: Date;
}

/** Les sept jours glissants qui finissent maintenant. */
export function fenetreDe(maintenant: Date): Fenetre {
  return {
    debut: new Date(maintenant.getTime() - FENETRE_JOURS * MS_PAR_JOUR),
    fin: maintenant,
  };
}

/** Additionne deux sommes en centimes ; lève au-delà de MAX_SAFE_INTEGER, jamais un BigInt silencieux. */
function ajouter(a: number, b: number): number {
  const s = a + b;
  if (!Number.isSafeInteger(s))
    throw new RangeError('somme_hors_borne : au-delà de MAX_SAFE_INTEGER');
  return s;
}

interface Totaux {
  paiements: number;
  remboursements: number;
}

export interface SommesDUnCote {
  /** Par SIREN attribué : les paiements et les remboursements, séparés. */
  readonly parSiren: ReadonlyMap<string, Totaux>;
  /** Sans SIREN, pour chaque type : le nombre d'événements et leur somme HT. */
  readonly globales: Readonly<Record<TypeDeSomme, { nombre: number; somme: number }>>;
}

/** Les sommes d'un côté, sur la fenêtre (bornes : début exclu, fin incluse). */
export function sommerSurLaFenetre(
  lignes: readonly EvenementDeSomme[],
  fenetre: Fenetre,
  sirensAttribues: ReadonlySet<string>
): SommesDUnCote {
  const parSiren = new Map<string, Totaux>();
  const globales = Object.fromEntries(
    TYPES_DE_SOMME.map((t) => [t, { nombre: 0, somme: 0 }])
  ) as Record<TypeDeSomme, { nombre: number; somme: number }>;
  for (const e of lignes) {
    const t = e.date.getTime();
    if (t <= fenetre.debut.getTime() || t > fenetre.fin.getTime()) continue;
    const g = globales[e.type];
    g.nombre += 1;
    g.somme = ajouter(g.somme, e.montantHtCents);
    if (e.siren === null || !sirensAttribues.has(e.siren)) continue;
    const totaux = parSiren.get(e.siren) ?? { paiements: 0, remboursements: 0 };
    const nature = natureDe(e.type);
    totaux[nature] = ajouter(totaux[nature], e.montantHtCents);
    parSiren.set(e.siren, totaux);
  }
  return { parSiren, globales };
}

export interface EcartParSiren {
  readonly siren: string;
  readonly nature: Nature;
  readonly axionia: number;
  readonly partners: number;
}

export interface EcartGlobal {
  readonly controle: `${'nombre' | 'somme'}:${TypeDeSomme}`;
  readonly axionia: number;
  readonly partners: number;
}

export interface ResultatDesSommes {
  /** Nommés DANS Partners seulement. */
  readonly ecartsParSiren: readonly EcartParSiren[];
  readonly ecartsGlobaux: readonly EcartGlobal[];
  /** Ce qui part vers l'extérieur : un nombre, rien d'autre. */
  readonly nombreDEcarts: number;
}

/** La comparaison des deux côtés : par SIREN (paiements et remboursements séparés), puis globale. */
export function comparerLesSommes(
  axionia: SommesDUnCote,
  partners: SommesDUnCote
): ResultatDesSommes {
  const ecartsParSiren: EcartParSiren[] = [];
  const sirens = [...new Set([...axionia.parSiren.keys(), ...partners.parSiren.keys()])].sort();
  for (const siren of sirens) {
    const a = axionia.parSiren.get(siren) ?? { paiements: 0, remboursements: 0 };
    const p = partners.parSiren.get(siren) ?? { paiements: 0, remboursements: 0 };
    for (const nature of ['paiements', 'remboursements'] as const)
      if (a[nature] !== p[nature])
        ecartsParSiren.push({ siren, nature, axionia: a[nature], partners: p[nature] });
  }
  const ecartsGlobaux: EcartGlobal[] = [];
  for (const type of TYPES_DE_SOMME)
    for (const mesure of ['nombre', 'somme'] as const) {
      const a = axionia.globales[type][mesure];
      const p = partners.globales[type][mesure];
      if (a !== p) ecartsGlobaux.push({ controle: `${mesure}:${type}`, axionia: a, partners: p });
    }
  return {
    ecartsParSiren,
    ecartsGlobaux,
    nombreDEcarts: ecartsParSiren.length + ecartsGlobaux.length,
  };
}

// ── le passage ─────────────────────────────────────────────────────────────────────────────────

/**
 * La borne d'une relecture des sommes, LUE dans la source unique des paramètres (A02) : sept jours
 * de file dépassent la borne d'un passage de rattrapage ; au-delà de celle-ci, le passage s'arrête
 * et le signale, sans rien comparer : une relecture incomplète ne produirait que de faux écarts.
 */
export const PAGES_MAX_DES_SOMMES = PARAMETRES.RELECTURE_DES_SOMMES_PAGES_MAX.valeur;

export type SignalDesSommes =
  | { readonly genre: 'relecture_echouee'; readonly motif: MotifDeRelecture }
  | { readonly genre: 'relecture_bornee'; readonly nombre: number }
  | { readonly genre: 'ecart_de_sommes'; readonly nombre: number };

/** Un événement d'argent REÇU par Partners : son identifiant, son type, sa charge stockée. */
export interface EvenementRecuDeSomme {
  readonly eventId: string;
  readonly eventType: string;
  readonly charge: unknown;
}

export interface PortsDesSommes {
  maintenant(): Date;
  /** La plus haute séquence d'axion-ia REÇUE avant cet instant (heure de réception), ou zéro. */
  sequenceAvant(instant: Date): Promise<bigint>;
  readonly lire: LirePage;
  /** Les événements d'argent reçus par Partners, source axion-ia. */
  evenementsRecus(types: readonly TypeDeSomme[]): Promise<readonly EvenementRecuDeSomme[]>;
  /** Les SIREN attribués dans Partners. */
  sirensAttribues(): Promise<ReadonlySet<string>>;
  signaler(s: SignalDesSommes): Promise<void>;
}

export interface CompteursDesSommes extends ResultatDesSommes {
  readonly pages: number;
  readonly relus: number;
}

/** Le corps relu, réduit à ce que la somme lit ; `null` s'il n'est pas une enveloppe lisible. */
function evenementDuCorps(eventId: string, corps: string): EvenementDeSomme | null {
  let brut: unknown;
  try {
    brut = JSON.parse(corps);
  } catch {
    return null;
  }
  const e = (brut ?? {}) as Record<string, unknown>;
  return typeof e['event_type'] === 'string'
    ? evenementDeSomme(eventId, e['event_type'], e['payload'])
    : null;
}

/**
 * Un passage : relit la file d'axion-ia depuis la plus haute séquence reçue AVANT la fenêtre, moins
 * le recouvrement ; somme les deux côtés sur la fenêtre ; compare. Un écart : UNE alerte, au nombre.
 * Les SIREN en cause ne sont rendus qu'au retour, que Partners garde. Lève quand la relecture échoue
 * ou est bornée : le battement le dit, et rien n'est comparé.
 */
export async function passageDesSommes(d: PortsDesSommes): Promise<CompteursDesSommes> {
  const fenetre = fenetreDe(d.maintenant());
  const avant = await d.sequenceAvant(fenetre.debut);
  let apres = avant > RECOUVREMENT_SEQUENCES ? avant - RECOUVREMENT_SEQUENCES : 0n;
  const cote: EvenementDeSomme[] = [];
  let pages = 0;
  let relus = 0;
  let suite = true;
  while (suite && pages < PAGES_MAX_DES_SOMMES) {
    const page = await d.lire(apres);
    if (!page.ok) {
      await d.signaler({ genre: 'relecture_echouee', motif: page.motif });
      throw new Error(`relecture_echouee : ${page.motif}`);
    }
    pages += 1;
    relus += page.lignes.length;
    for (const l of page.lignes) {
      const e = evenementDuCorps(l.eventId, l.corps);
      if (e !== null) cote.push(e);
    }
    apres = page.derniereSequence;
    suite = page.suite;
  }
  if (suite) {
    await d.signaler({ genre: 'relecture_bornee', nombre: pages });
    throw new Error('relecture_bornee : la fenêtre dépasse la borne, rien n’est comparé');
  }
  const recus: EvenementDeSomme[] = [];
  for (const r of await d.evenementsRecus(TYPES_DE_SOMME)) {
    const e = evenementDeSomme(r.eventId, r.eventType, r.charge);
    if (e !== null) recus.push(e);
  }
  const attribues = await d.sirensAttribues();
  const resultat = comparerLesSommes(
    sommerSurLaFenetre(cote, fenetre, attribues),
    sommerSurLaFenetre(recus, fenetre, attribues)
  );
  if (resultat.nombreDEcarts > 0)
    await d.signaler({ genre: 'ecart_de_sommes', nombre: resultat.nombreDEcarts });
  return { ...resultat, pages, relus };
}

// ── les ports en base ──────────────────────────────────────────────────────────────────────────

/**
 * Les états d'une attribution qui ne font PAS un SIREN attribué : invalidée ou annulée, elle n'a
 * jamais tenu. Tout autre état, en cours comme terminé, rattache encore les paiements du SIREN.
 * Choix soumis à la lentille schema ; les contrôles globaux couvrent de toute façon le reste.
 */
const ETATS_SANS_ATTRIBUTION = ['invalidee', 'annulee'] as const;

/** Les ports de lecture en base ; la relecture, l'horloge et le signal arrivent de l'appelant. */
export function portsDesSommesEnBase(
  prisma: PrismaClient,
  d: Pick<PortsDesSommes, 'maintenant' | 'lire' | 'signaler'>
): PortsDesSommes {
  return {
    ...d,
    async sequenceAvant(instant) {
      const r = await prisma.evenementRecu.aggregate({
        where: { source: 'axionia', receivedAt: { lt: instant } },
        _max: { sequence: true },
      });
      return r._max.sequence ?? 0n;
    },
    async evenementsRecus(types) {
      const parIdentifiant = new Map(types.map((t) => [identifiantDuType(t), t]));
      const lignes = await prisma.evenementRecu.findMany({
        where: { source: 'axionia', eventType: { in: [...parIdentifiant.keys()] } },
        select: { eventId: true, eventType: true, charge: true },
      });
      return lignes.map((l) => ({
        eventId: l.eventId,
        eventType: parIdentifiant.get(l.eventType) ?? '',
        charge: l.charge,
      }));
    },
    async sirensAttribues() {
      const lignes = await prisma.attribution.findMany({
        where: { statut: { notIn: [...ETATS_SANS_ATTRIBUTION] } },
        select: { siren: true },
        distinct: ['siren'],
      });
      return new Set(lignes.map((l) => l.siren));
    },
  };
}
