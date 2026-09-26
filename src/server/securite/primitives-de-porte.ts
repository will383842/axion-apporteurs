/**
 * Les deux primitives que partagent les portes du serveur — la frontière axionia (SEC-07) et la
 * porte MCP (INT-T11). Une seule écriture de chaque règle de sécurité : deux copies divergent au
 * premier correctif appliqué d'un seul côté (RM-01).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VerdictDeLimite } from './rate-limit';

/**
 * Temps constant : les deux côtés sont réduits à une empreinte de même longueur AVANT la
 * comparaison — ni la longueur ni le premier octet différent ne se mesurent. Une chaîne présentée
 * VIDE n'est jamais égale : un en-tête absent ne vaut pas un secret.
 */
export function egalATempsConstant(presente: string, attendu: string): boolean {
  const a = createHash('sha256').update(presente, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b) && presente !== '';
}

/**
 * Le débit d'une porte tant que le registre de débit ne porte pas son compteur : REFUS, en panne,
 * sous le motif que le registre emploie lui-même pour une limite qu'aucune exigence ne chiffre.
 */
export async function limiteNonDeclaree(): Promise<VerdictDeLimite> {
  return {
    autorise: false,
    restant: 0,
    repriseAt: null,
    panne: true,
    motif: 'limite_non_configuree',
  };
}
