/**
 * SEC-21 — la RÉSOLUTION SILENCIEUSE d'un code de parrainage capturé (REQ-SEC-037), au traitement
 * d'une candidature reçue d'axion-ia.
 *
 * Le code capturé n'est conservé que s'il désigne un parrain ACTIF : un apporteur signé. Un code
 * inconnu, mal formé, ou d'un apporteur qui n'est pas actif (révoqué, suspendu, pas encore signé)
 * ne rattache RIEN : la candidature est traitée exactement comme sans code. Un code mal formé n'est
 * même pas cherché.
 *
 * ÉCHEC FERMÉ (condition de la lentille sécurité) : aucun rattachement sans code vérifié. Une lecture
 * qui échoue n'est PAS lue comme « inconnu » : l'erreur remonte, et l'événement est rejoué — jamais
 * rattaché, jamais privé de son parrain par une panne.
 */
import type { Prisma, StatutApporteur } from '@prisma/client';
import { normaliserCodeParrainage } from '../../domain/parrainage/code';

/** Les statuts d'un parrain ACTIF : un apporteur signé, et lui seul. */
export const STATUTS_DE_PARRAIN_ACTIF: readonly StatutApporteur[] = Object.freeze(['signe']);

/** La lecture d'un parrain par son code : son statut, ou `null` si aucun apporteur ne le porte. */
export type LireParrain = (code: string) => Promise<{ statut: string } | null>;

/** Le code capturé, s'il désigne un parrain actif ; sinon `null`, en silence. */
export async function codeDeParrainResolu(
  lire: LireParrain,
  capture: unknown
): Promise<string | null> {
  const code = normaliserCodeParrainage(capture);
  if (code === null) return null;
  const parrain = await lire(code);
  if (parrain === null) return null;
  return (STATUTS_DE_PARRAIN_ACTIF as readonly string[]).includes(parrain.statut) ? code : null;
}

/** La lecture des parrains dans la table des apporteurs, par l'index unique du code. */
export function lecteurDesParrains(tx: Prisma.TransactionClient): LireParrain {
  return (code) =>
    tx.apporteur.findUnique({ where: { codeParrainage: code }, select: { statut: true } });
}
