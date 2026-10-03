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
 * DEUX sens : l'apporteur comme filleul de son parrain, et comme parrain de ses filleuls. Le soupçon
 * vise toujours le FILLEUL du couple.
 *
 * CE MODULE NE FAIT QUE LIRE ET JUGER. Il n'ouvre rien, n'écrit rien. L'ouverture d'une anomalie
 * `auto_parrainage` (DM-12, REQ-DM-033) est un traitement DISTINCT et DIFFÉRÉ, jamais au moment du
 * geste de l'apporteur (texte de la juriste, forme d'A02) : la tâche du lanceur
 * `src/server/taches/ouvrir-anomalies-auto-parrainage.ts` lit les naissances de candidatures et de
 * pièces RIB depuis son dernier passage, appelle les deux lectures ci-dessous, et ouvre l'anomalie
 * dans sa propre transaction. La décision appartient à la console, qui lit l'anomalie.
 *
 * LES DEUX RÉPONSES. La console reçoit un refus NOMMÉ, avec les familles en cause (`verdictConsole`).
 * L'espace reçoit une réponse NEUTRE et figée, la même qu'il y ait correspondance ou non
 * (`REPONSE_ESPACE`) : l'apporteur n'apprend pas ce qui a été comparé. La trace ne porte que le
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

/** Un soupçon : le filleul visé, et les familles où il se confond avec son parrain. */
export interface Soupcon {
  filleulId: string;
  correspondances: FamilleDEmpreinte[];
}

// ── le cœur pur ──────────────────────────────────────────────────────────────────────────────────

/** Deux empreintes présentes et égales : une absente n'égale jamais rien, pas même une absente. */
function egales(a: string | null, b: string | null): boolean {
  return a !== null && a === b;
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

/** Le verdict de la console : nommé, avec les familles en cause ; sans correspondance, aucun. */
export function verdictConsole(
  correspondancesTrouvees: readonly FamilleDEmpreinte[]
): { verdict: 'auto_parrainage'; correspondances: FamilleDEmpreinte[] } | { verdict: 'aucun' } {
  return correspondancesTrouvees.length > 0
    ? { verdict: 'auto_parrainage', correspondances: [...correspondancesTrouvees] }
    : { verdict: 'aucun' };
}

/** Les familles vues dans des soupçons, dans l'ordre de `FAMILLES_D_EMPREINTE`. */
export function famillesDe(soupcons: readonly Soupcon[]): FamilleDEmpreinte[] {
  const vues = new Set(soupcons.flatMap((s) => s.correspondances));
  return FAMILLES_D_EMPREINTE.filter((f) => vues.has(f));
}

// ── la lecture en base ───────────────────────────────────────────────────────────────────────────

/** La lecture seule : ce module ne touche à aucune autre table, et n'écrit rien. */
type Client = Pick<PrismaClient, 'apporteur'>;

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

/** Les soupçons d'une liste de couples (filleul, parrain) : ceux qui se confondent. */
function juger(couples: readonly (readonly [ApporteurLu, ApporteurLu])[]): Soupcon[] {
  return couples.flatMap(([filleul, parrain]) => {
    const trouvees = correspondances(filleul, parrain);
    return trouvees.length === 0 ? [] : [{ filleulId: filleul.id, correspondances: trouvees }];
  });
}

/** À la candidature parrainée : le filleul contre son parrain. Lecture seule. */
export async function soupconsALaCandidature(
  client: Client,
  filleulId: string
): Promise<Soupcon[]> {
  const filleul = await lire(client, { id: filleulId });
  if (filleul === null) return [];
  const parrain = await parrainDe(client, filleul);
  return parrain === null ? [] : juger([[filleul, parrain]]);
}

/**
 * À la saisie ou à la modification d'un RIB : l'apporteur comme filleul de son parrain, et comme
 * parrain de chacun de ses filleuls. Le soupçon vise toujours le FILLEUL du couple. Lecture seule.
 */
export async function soupconsAuChangementDeRib(
  client: Client,
  apporteurId: string
): Promise<Soupcon[]> {
  const a = await lire(client, { id: apporteurId });
  if (a === null) return [];
  const parrain = await parrainDe(client, a);
  const filleuls = await filleulsDe(client, a);
  return juger([
    ...(parrain === null ? [] : [[a, parrain] as const]),
    ...filleuls.map((f) => [f, a] as const),
  ]);
}
