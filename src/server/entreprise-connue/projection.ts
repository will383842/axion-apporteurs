/**
 * La projection locale de l'antériorité (DM-10-P, REQ-DM-029, REQ-DM-028) : les événements d'axionia
 * gardés dans `evenements_recus` (les types de `TYPES_DE_L_ANTERIORITE` : le client, le devis émis
 * puis signé, la facture, l'avoir et l'annulation) alimentent `devis_connus` et `entreprises_connues` ; la liste tenue
 * par la Société (`sirens_liste_noire`) fait l'origine `financeur`.
 *
 * La projection RECALCULE depuis les faits, elle n'incrémente jamais : le marquage `traite` n'est pas
 * dans la transaction du traitant, un événement peut donc être redonné ; recalculé, il ne compte rien
 * deux fois, et l'ordre d'arrivée n'importe pas (une annulation ou un avoir reçus avant leur facture
 * sont vus quand elle arrive). La règle se juge dans le domaine (`anteriorite.ts`), jamais ici.
 *
 * LIMITE DÉCLARÉE : l'art. 3.3 exclut un devis ANNULÉ ; aucun événement ne le transporte aujourd'hui.
 * Un devis signé reste donc connu faute d'information, jusqu'à l'événement prévu au rattrapage 93.
 */
import { Prisma, TypeEvenementRecu, type PrismaClient } from '@prisma/client';
import type { Traitants, EvenementATraiter } from '../queue/workers/evenement-recu';
import {
  evaluerAnteriorite,
  factureHtDuDevis,
  type Anteriorite,
  type DevisConnu,
} from '../../domain/entreprise-connue/anteriorite';

type Client = PrismaClient | Prisma.TransactionClient;
type Charge = Record<string, unknown>;

const FORME_SIREN = /^[0-9]{9}$/;

/** Les types que cette projection lit et traite. */
export const TYPES_DE_L_ANTERIORITE = [
  TypeEvenementRecu.client_cree,
  TypeEvenementRecu.client_mis_a_jour,
  TypeEvenementRecu.devis_emis,
  TypeEvenementRecu.devis_signe,
  TypeEvenementRecu.facture_emise,
  TypeEvenementRecu.avoir_emis,
  TypeEvenementRecu.facture_annulee,
] as const;

// ── la lecture défensive d'une charge ───────────────────────────────────────────────────────────

function enCharge(valeur: unknown): Charge {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)
    ? (valeur as Charge)
    : {};
}

function texte(c: Charge, champ: string): string | null {
  const v = c[champ];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function entier(c: Charge, champ: string): number | null {
  const v = c[champ];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function instant(c: Charge, champ: string): Date | null {
  const v = texte(c, champ);
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function siren(c: Charge): string | null {
  const v = texte(c, 'siren');
  return v !== null && FORME_SIREN.test(v) ? v : null;
}

/** Les charges des événements d'un type dont le champ `champ` vaut `valeur`, dans l'ordre reçu. */
async function charges(
  db: Client,
  types: readonly TypeEvenementRecu[],
  champ: string,
  valeur: string
): Promise<Charge[]> {
  const lus = await db.evenementRecu.findMany({
    where: { eventType: { in: [...types] }, charge: { path: [champ], equals: valeur } },
    select: { charge: true },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  return lus.map((l) => enCharge(l.charge));
}

const TYPES_CLIENT = [TypeEvenementRecu.client_cree, TypeEvenementRecu.client_mis_a_jour] as const;

/** Le SIREN d'un client, lu sur son dernier événement `client.*` qui en porte un. */
async function sirenDuClient(db: Client, clientId: string): Promise<string | null> {
  const lus = await charges(db, TYPES_CLIENT, 'clientId', clientId);
  for (let i = lus.length - 1; i >= 0; i -= 1) {
    const s = siren(lus[i]!);
    if (s !== null) return s;
  }
  return null;
}

/** Le SIREN porté par une charge, sinon celui de son client. */
async function sirenDe(db: Client, c: Charge): Promise<string | null> {
  const direct = siren(c);
  if (direct !== null) return direct;
  const clientId = texte(c, 'clientId');
  return clientId === null ? null : sirenDuClient(db, clientId);
}

/** Les factures annulées parmi `ids`. */
async function annulees(db: Client, ids: readonly string[]): Promise<Set<string>> {
  const faites = new Set<string>();
  for (const id of ids) {
    const lus = await charges(db, [TypeEvenementRecu.facture_annulee], 'factureId', id);
    if (lus.length > 0) faites.add(id);
  }
  return faites;
}

// ── le recalcul d'un devis ──────────────────────────────────────────────────────────────────────

/** Recalcule la ligne `devis_connus` d'un devis ; rend le SIREN touché, ou `null`. */
export async function recalculerDevis(db: Client, devisRef: string): Promise<string | null> {
  const emis = await charges(db, [TypeEvenementRecu.devis_emis], 'devisId', devisRef);
  const signes = await charges(db, [TypeEvenementRecu.devis_signe], 'devisId', devisRef);
  const dernierEmis = emis.at(-1) ?? null;
  const dernierSigne = signes.at(-1) ?? null;
  if (dernierEmis === null && dernierSigne === null) return null;

  const factures = await charges(db, [TypeEvenementRecu.facture_emise], 'devisId', devisRef);
  const idsFactures = factures.map((f) => texte(f, 'factureId')).filter((x): x is string => !!x);
  const sansSuite = await annulees(db, idsFactures);
  const avoirs: Charge[] = [];
  for (const id of idsFactures) {
    avoirs.push(...(await charges(db, [TypeEvenementRecu.avoir_emis], 'avoirDeFactureId', id)));
  }

  let s: string | null = null;
  for (const c of [dernierEmis, dernierSigne, ...factures]) {
    if (c !== null) s = s ?? (await sirenDe(db, c));
  }
  if (s === null) return null;

  const signeAt = dernierSigne === null ? null : instant(dernierSigne, 'signeLe');
  const emisLu = dernierEmis === null ? null : instant(dernierEmis, 'emisLe');
  // Un devis signé sans émission reçue : son émission est au plus tard sa signature.
  const emisAt =
    emisLu !== null && signeAt !== null
      ? new Date(Math.min(emisLu.getTime(), signeAt.getTime()))
      : (emisLu ?? signeAt);
  if (emisAt === null) return null;
  const montant = dernierSigne === null ? 0 : (entier(dernierSigne, 'montantTotalHtCents') ?? 0);
  const facture = factureHtDuDevis(
    factures.map((f) => ({
      montantHtCents: entier(f, 'montantHtCents') ?? 0,
      annulee: sansSuite.has(texte(f, 'factureId') ?? ''),
    })),
    avoirs.map((a) => ({ montantHtCents: entier(a, 'montantHtCents') ?? 0 }))
  );

  const ligne = {
    siren: s,
    emisAt,
    signeAt,
    montantTotalHtCents: BigInt(Math.max(montant, 0)),
    factureHtCents: BigInt(facture),
    majAt: new Date(),
  };
  await db.devisConnu.upsert({
    where: { devisRef },
    create: { devisRef, ...ligne },
    update: ligne,
  });
  return s;
}

// ── le recalcul d'une entreprise ────────────────────────────────────────────────────────────────

/** Les dates des factures non annulées d'un SIREN, portées par la facture ou par son client. */
async function datesDesFactures(db: Client, s: string): Promise<Date[]> {
  const parSiren = await charges(db, [TypeEvenementRecu.facture_emise], 'siren', s);
  const clients = await charges(db, TYPES_CLIENT, 'siren', s);
  const parClient: Charge[] = [];
  for (const id of new Set(
    clients.map((c) => texte(c, 'clientId')).filter((x): x is string => !!x)
  )) {
    for (const f of await charges(db, [TypeEvenementRecu.facture_emise], 'clientId', id)) {
      if (siren(f) === null) parClient.push(f);
    }
  }
  const toutes = [...parSiren, ...parClient];
  const ids = toutes.map((f) => texte(f, 'factureId')).filter((x): x is string => !!x);
  const sansSuite = await annulees(db, ids);
  return toutes
    .filter((f) => !sansSuite.has(texte(f, 'factureId') ?? ''))
    .map((f) => instant(f, 'emiseLe'))
    .filter((d): d is Date => d !== null);
}

/** Pose ou retire la ligne d'une origine, selon les dates qui la fondent. */
async function poser(
  db: Client,
  s: string,
  origine: 'client' | 'devis',
  dates: readonly Date[]
): Promise<void> {
  if (dates.length === 0) {
    await db.entrepriseConnue.deleteMany({ where: { siren: s, origine } });
    return;
  }
  const temps = dates.map((d) => d.getTime());
  const ligne = {
    connueDepuisAt: new Date(Math.min(...temps)),
    dernierContactAt: new Date(Math.max(...temps)),
  };
  await db.entrepriseConnue.upsert({
    where: { siren_origine: { siren: s, origine } },
    create: { siren: s, origine, ...ligne },
    update: ligne,
  });
}

/** Recalcule les lignes `client` et `devis` d'`entreprises_connues` pour un SIREN. */
export async function recalculerEntreprise(db: Client, s: string): Promise<void> {
  await poser(db, s, 'client', await datesDesFactures(db, s));
  const devis = await db.devisConnu.findMany({ where: { siren: s } });
  await poser(
    db,
    s,
    'devis',
    devis.flatMap((d) => (d.signeAt === null ? [d.emisAt] : [d.emisAt, d.signeAt]))
  );
}

// ── un événement ────────────────────────────────────────────────────────────────────────────────

/** Les devis et les SIREN qu'un événement touche, lus sur lui et sur ses faits voisins. */
async function touches(
  db: Client,
  recu: Pick<EvenementATraiter, 'eventType' | 'charge'>
): Promise<{ devis: Set<string>; sirens: Set<string> }> {
  const c = enCharge(recu.charge);
  const devis = new Set<string>();
  const sirens = new Set<string>();
  const ajouterFacture = async (factureId: string | null) => {
    if (factureId === null) return;
    for (const f of await charges(db, [TypeEvenementRecu.facture_emise], 'factureId', factureId)) {
      const d = texte(f, 'devisId');
      if (d !== null) devis.add(d);
      const s = await sirenDe(db, f);
      if (s !== null) sirens.add(s);
    }
  };
  switch (recu.eventType) {
    case TypeEvenementRecu.devis_emis:
    case TypeEvenementRecu.devis_signe: {
      const d = texte(c, 'devisId');
      if (d !== null) devis.add(d);
      break;
    }
    case TypeEvenementRecu.facture_emise: {
      const d = texte(c, 'devisId');
      if (d !== null) devis.add(d);
      const s = await sirenDe(db, c);
      if (s !== null) sirens.add(s);
      break;
    }
    case TypeEvenementRecu.facture_annulee:
      await ajouterFacture(texte(c, 'factureId'));
      break;
    case TypeEvenementRecu.avoir_emis:
      await ajouterFacture(texte(c, 'avoirDeFactureId'));
      break;
    case TypeEvenementRecu.client_cree:
    case TypeEvenementRecu.client_mis_a_jour: {
      const clientId = texte(c, 'clientId');
      if (clientId === null) break;
      for (const e of await charges(
        db,
        [TypeEvenementRecu.devis_emis, TypeEvenementRecu.devis_signe],
        'clientId',
        clientId
      )) {
        const d = texte(e, 'devisId');
        if (d !== null) devis.add(d);
      }
      const s = await sirenDuClient(db, clientId);
      if (s !== null) sirens.add(s);
      break;
    }
    default:
      break;
  }
  return { devis, sirens };
}

/** Projette un événement : recalcule les devis qu'il touche, puis leurs entreprises, ensemble. */
export async function projeterEvenement(
  prisma: PrismaClient,
  recu: Pick<EvenementATraiter, 'eventType' | 'charge'>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { devis, sirens } = await touches(tx, recu);
    for (const ref of devis) {
      // Le SIREN d'avant compte aussi : un devis qui change d'entreprise quitte l'ancienne.
      const avant = await tx.devisConnu.findUnique({
        where: { devisRef: ref },
        select: { siren: true },
      });
      if (avant !== null) sirens.add(avant.siren);
      const s = await recalculerDevis(tx, ref);
      if (s !== null) sirens.add(s);
    }
    for (const s of sirens) await recalculerEntreprise(tx, s);
  });
}

/** Les traitants de la projection, à brancher sur la réception. */
export function traitantsDeLAnteriorite(prisma: PrismaClient): Traitants {
  const traiter = (recu: EvenementATraiter) => projeterEvenement(prisma, recu);
  return Object.fromEntries(TYPES_DE_L_ANTERIORITE.map((t) => [t, traiter])) as Traitants;
}

// ── l'évaluation, locale ────────────────────────────────────────────────────────────────────────

/** L'antériorité d'un SIREN à `maintenant`, sur les seules projections locales, sans réseau. */
export async function anterioriteDe(db: Client, s: string, maintenant: Date): Promise<Anteriorite> {
  const [financeur, client, devis] = await Promise.all([
    db.sirenListeNoire.count({ where: { siren: s } }),
    db.entrepriseConnue.findUnique({ where: { siren_origine: { siren: s, origine: 'client' } } }),
    db.devisConnu.findMany({ where: { siren: s } }),
  ]);
  return evaluerAnteriorite(
    {
      financeur: financeur > 0,
      derniereFactureAt: client?.dernierContactAt ?? null,
      devis: devis.map((d): DevisConnu => ({
        emisAt: d.emisAt,
        signeAt: d.signeAt,
        montantTotalHtCents: Number(d.montantTotalHtCents),
        factureHtCents: Number(d.factureHtCents),
      })),
    },
    maintenant
  );
}
