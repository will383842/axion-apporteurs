/**
 * anti-auto-parrainage.ts — SEC-18 (REQ-ARG-012, REQ-SEC-031) : un apporteur ne se parraine pas
 * lui-même, sous un autre nom.
 *
 * LA RÈGLE. Les empreintes du filleul et de son parrain se comparent famille par famille : le
 * courriel (`emailHash`), le téléphone (`phoneHash`), l'IBAN (`ibanHash` des pièces RIB non
 * remplacées) et le SIREN (des identités de facturation en cours, public, comparé tel quel). Un
 * filleul qui est son propre parrain est nommé `identite`. Une empreinte absente ne correspond
 * jamais à une autre absente.
 *
 * LES DEUX MOMENTS. À la candidature parrainée, et à toute saisie ou modification de RIB — dans les
 * DEUX sens : l'apporteur comme filleul de son parrain, et comme parrain de ses filleuls. Une
 * correspondance ouvre UNE anomalie `auto_parrainage` (DM-12, REQ-DM-033) sur le filleul ; une
 * anomalie déjà ouverte sur lui n'est pas doublée. La décision appartient à la console, qui lit
 * l'anomalie : ce module ne refuse rien de lui-même, il marque.
 *
 * LES DEUX RÉPONSES. La console reçoit un refus NOMMÉ, avec les familles en cause (`verdictConsole`).
 * L'espace reçoit une réponse NEUTRE et figée, la même qu'il y ait correspondance ou non
 * (`reponseEspace`) : l'apporteur n'apprend pas ce qui a été comparé. Le journal ne porte que le
 * moment et les familles : aucune empreinte, aucun identifiant, aucune donnée de personne.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { normaliserCodeParrainage } from '../../domain/parrainage/code';

/** Les familles d'empreinte comparées, dans l'ordre où elles se nomment. */
export const FAMILLES_D_EMPREINTE = ['identite', 'courriel', 'telephone', 'iban', 'siren'] as const;
export type FamilleDEmpreinte = (typeof FAMILLES_D_EMPREINTE)[number];

/** Les deux moments du contrôle. */
export type MomentDuControle = 'candidature' | 'rib';

/** Ce qu'on compare d'un apporteur : ses empreintes, jamais un clair. */
export interface EmpreintesDUnApporteur {
  readonly id: string;
  readonly emailHash: string | null;
  readonly phoneHash: string | null;
  readonly ibans: readonly string[];
  readonly sirens: readonly string[];
}

/** La seule ligne que le contrôle écrit au journal. */
export interface LigneDuJournal {
  signal: 'auto_parrainage_soupconne';
  moment: MomentDuControle;
  correspondances: FamilleDEmpreinte[];
}

export interface ResultatDuControle {
  correspondances: FamilleDEmpreinte[];
  anomalieOuverte: boolean;
}

// ── le cœur pur ──────────────────────────────────────────────────────────────────────────────────

function egales(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

function seCroisent(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.includes(x));
}

/** Les familles où le filleul et le parrain se confondent, dans l'ordre de `FAMILLES_D_EMPREINTE`. */
export function correspondances(
  filleul: EmpreintesDUnApporteur,
  parrain: EmpreintesDUnApporteur
): FamilleDEmpreinte[] {
  const trouvees: FamilleDEmpreinte[] = [];
  if (filleul.id === parrain.id) trouvees.push('identite');
  if (egales(filleul.emailHash, parrain.emailHash)) trouvees.push('courriel');
  if (egales(filleul.phoneHash, parrain.phoneHash)) trouvees.push('telephone');
  if (seCroisent(filleul.ibans, parrain.ibans)) trouvees.push('iban');
  if (seCroisent(filleul.sirens, parrain.sirens)) trouvees.push('siren');
  return trouvees;
}

/** La réponse de l'espace : figée, la même dans tous les cas. */
export const REPONSE_ESPACE = Object.freeze({ etat: 'recu' as const });

export function reponseEspace(_resultat: ResultatDuControle): typeof REPONSE_ESPACE {
  return REPONSE_ESPACE;
}

/** Le verdict de la console : nommé, avec les familles en cause. */
export function verdictConsole(
  resultat: ResultatDuControle
): { verdict: 'auto_parrainage'; correspondances: FamilleDEmpreinte[] } | { verdict: 'aucun' } {
  return resultat.correspondances.length > 0
    ? { verdict: 'auto_parrainage', correspondances: resultat.correspondances }
    : { verdict: 'aucun' };
}

// ── la lecture en base ───────────────────────────────────────────────────────────────────────────

type Client = Pick<PrismaClient, 'apporteur' | 'anomalie'>;

/** Les empreintes d'un apporteur : pièces RIB non remplacées, identités de facturation en cours. */
const SELECTION = {
  id: true,
  codeParrainage: true,
  parrainCodeCapture: true,
  emailHash: true,
  phoneHash: true,
  piecesKyc: {
    where: { type: 'rib', remplaceeAt: null, ibanHash: { not: null } },
    select: { ibanHash: true },
  },
  identitesFacturation: { where: { finAt: null }, select: { siren: true } },
} satisfies Prisma.ApporteurSelect;

type Lu = Prisma.ApporteurGetPayload<{ select: typeof SELECTION }>;

interface ApporteurLu extends EmpreintesDUnApporteur {
  readonly codeParrainage: string;
  readonly parrainCodeCapture: string | null;
}

function versEmpreintes(l: Lu): ApporteurLu {
  return {
    id: l.id,
    codeParrainage: l.codeParrainage,
    parrainCodeCapture: l.parrainCodeCapture,
    emailHash: l.emailHash,
    phoneHash: l.phoneHash,
    ibans: l.piecesKyc.flatMap((p) => (p.ibanHash === null ? [] : [p.ibanHash])),
    sirens: l.identitesFacturation.map((i) => i.siren),
  };
}

async function lire(
  client: Client,
  where: Prisma.ApporteurWhereUniqueInput
): Promise<ApporteurLu | null> {
  const l = await client.apporteur.findUnique({ where, select: SELECTION });
  return l === null ? null : versEmpreintes(l);
}

/** Le parrain d'un apporteur, retrouvé par le code capturé sous sa forme canonique. */
async function parrainDe(client: Client, a: ApporteurLu): Promise<ApporteurLu | null> {
  const code = normaliserCodeParrainage(a.parrainCodeCapture);
  return code === null ? null : lire(client, { codeParrainage: code });
}

/** Les filleuls d'un apporteur : ceux dont le code capturé, canonique, est EXACTEMENT le sien. */
async function filleulsDe(client: Client, a: ApporteurLu): Promise<ApporteurLu[]> {
  const lus = await client.apporteur.findMany({
    where: { parrainCodeCapture: { contains: a.codeParrainage, mode: 'insensitive' } },
    select: SELECTION,
  });
  return lus
    .map(versEmpreintes)
    .filter((f) => normaliserCodeParrainage(f.parrainCodeCapture) === a.codeParrainage);
}

/** Ouvre l'anomalie sur le filleul, sauf si une `auto_parrainage` y est déjà ouverte. */
async function marquer(prisma: PrismaClient, filleulId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const ouverte = await tx.anomalie.findFirst({
      where: { type: 'auto_parrainage', apporteurId: filleulId, statut: 'ouverte' },
      select: { id: true },
    });
    if (ouverte !== null) return false;
    await tx.anomalie.create({
      data: { type: 'auto_parrainage', apporteurId: filleulId, score: null },
    });
    return true;
  });
}

/** Confronte chaque couple (filleul, parrain), marque, journalise une ligne si quelque chose correspond. */
async function controler(
  prisma: PrismaClient,
  couples: readonly (readonly [ApporteurLu, ApporteurLu])[],
  moment: MomentDuControle,
  journal?: (ligne: LigneDuJournal) => void
): Promise<ResultatDuControle> {
  const vues = new Set<FamilleDEmpreinte>();
  let anomalieOuverte = false;
  for (const [filleul, parrain] of couples) {
    const trouvees = correspondances(filleul, parrain);
    if (trouvees.length === 0) continue;
    trouvees.forEach((f) => vues.add(f));
    if (await marquer(prisma, filleul.id)) anomalieOuverte = true;
  }
  const familles = FAMILLES_D_EMPREINTE.filter((f) => vues.has(f));
  if (familles.length > 0) {
    journal?.({ signal: 'auto_parrainage_soupconne', moment, correspondances: familles });
  }
  return { correspondances: familles, anomalieOuverte };
}

/** À la candidature parrainée : le filleul contre son parrain. */
export async function controlerALaCandidature(
  prisma: PrismaClient,
  filleulId: string,
  journal?: (ligne: LigneDuJournal) => void
): Promise<ResultatDuControle> {
  const filleul = await lire(prisma, { id: filleulId });
  const parrain = filleul === null ? null : await parrainDe(prisma, filleul);
  const couples = filleul !== null && parrain !== null ? [[filleul, parrain] as const] : [];
  return controler(prisma, couples, 'candidature', journal);
}

/**
 * À la saisie ou à la modification d'un RIB : l'apporteur comme filleul de son parrain, et comme
 * parrain de chacun de ses filleuls. L'anomalie s'ouvre toujours sur le FILLEUL du couple.
 */
export async function controlerAuChangementDeRib(
  prisma: PrismaClient,
  apporteurId: string,
  journal?: (ligne: LigneDuJournal) => void
): Promise<ResultatDuControle> {
  const a = await lire(prisma, { id: apporteurId });
  if (a === null) return controler(prisma, [], 'rib', journal);
  const parrain = await parrainDe(prisma, a);
  const filleuls = await filleulsDe(prisma, a);
  const couples = [
    ...(parrain === null ? [] : [[a, parrain] as const]),
    ...filleuls.map((f) => [f, a] as const),
  ];
  return controler(prisma, couples, 'rib', journal);
}
