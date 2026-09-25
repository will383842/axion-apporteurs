/**
 * Le cache de 24 h du mandataire — INT-T09 (REQ-INT-020, REQ-SEC-013, REQ-QA-028).
 *
 * CE QU'IL GARDE : la PROJECTION d'une recherche (suggestions et fiches à empreintes), jamais la
 * réponse brute du tiers. Un nom de dirigeant, une année de naissance n'entrent donc jamais dans le
 * cache — ils n'existent déjà plus dans l'objet lu (`schemas.ts`).
 *
 * UNE PANNE DE CACHE VAUT UNE ABSENCE. Lire lève → le mandataire traite comme un défaut de cache et
 * va au tiers ; écrire lève → la réponse est rendue quand même. Le cache accélère, il ne décide de
 * rien, et le dépôt n'en dépend pas.
 *
 * CE QUI SORT DU CACHE EST RELU PAR SON SCHÉMA (CONVENTIONS §9) : une valeur écrite par une autre
 * version, ou altérée, est une absence, jamais une donnée crue.
 *
 * LE CLIENT RÉEL reprend les options à panne RAPIDE du registre des compteurs (`OPTIONS_DU_CLIENT`,
 * dérivées, pas recopiées) : sans elles, un cache tombé suspendrait la requête au lieu d'échouer.
 * `REDIS_URL` est lue au premier appel, jamais à l'import.
 */
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { OPTIONS_DU_CLIENT } from '../../securite/rate-limit';
import { saisieNormalisee } from './parametres';
import {
  schemaFicheEntreprise,
  schemaProjection,
  type FicheEntreprise,
  type Projection,
} from './schemas';

export interface CacheDeProjections {
  lire(cle: string): Promise<unknown>;
  ecrire(cle: string, valeur: Projection | FicheEntreprise, ttlSecondes: number): Promise<void>;
}

const ESPACE = 'entreprise:v1';

/** La clé d'une recherche : l'empreinte de la saisie normalisée, jamais la saisie en clair. */
export function cleDeRecherche(q: string): string {
  const saisie = saisieNormalisee(q).toLowerCase();
  return `${ESPACE}:recherche:${createHash('sha256').update(saisie, 'utf8').digest('hex')}`;
}

export function cleDeFiche(siren: string): string {
  return `${ESPACE}:fiche:${siren}`;
}

/** Relit une projection ; toute valeur qui ne passe pas son schéma est une absence. */
export function relireProjection(brut: unknown): Projection | null {
  const lu = schemaProjection.safeParse(brut);
  return lu.success ? lu.data : null;
}

export function relireFiche(brut: unknown): FicheEntreprise | null {
  const lu = schemaFicheEntreprise.safeParse(brut);
  return lu.success ? lu.data : null;
}

/**
 * Ce que le cache demande à Redis, et rien d'autre. Un test lui donne un Redis simulé au niveau de
 * CETTE api — c'est donc la vraie écriture, `'EX'` compris, qui est jugée.
 */
export interface ClientDuCache {
  readonly status: string;
  connect(): Promise<unknown>;
  get(cle: string): Promise<string | null>;
  set(cle: string, valeur: string, mode: 'EX', secondes: number): Promise<unknown>;
}

let client: Redis | null = null;

function clientRedis(): ClientDuCache {
  if (client !== null) return client;
  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') throw new Error('cache : REDIS_URL absente');
  const c = new Redis(url, OPTIONS_DU_CLIENT);
  // Une panne est déjà rendue à l'appelant ; sans écouteur, le client imprimerait l'adresse.
  c.on('error', () => undefined);
  client = c;
  return c;
}

async function pret(c: ClientDuCache): Promise<void> {
  if (c.status === 'wait' || c.status === 'end') await c.connect();
}

/** Le cache sur un client : chaque méthode peut lever, c'est le mandataire qui en fait une absence. */
export function cacheSurClient(obtenir: () => ClientDuCache): CacheDeProjections {
  return {
    async lire(cle) {
      const c = obtenir();
      await pret(c);
      const brut = await c.get(cle);
      return brut === null ? null : (JSON.parse(brut) as unknown);
    },
    async ecrire(cle, valeur, ttlSecondes) {
      const c = obtenir();
      await pret(c);
      await c.set(cle, JSON.stringify(valeur), 'EX', ttlSecondes);
    },
  };
}

/** Le cache de production. */
export const cacheRedis: CacheDeProjections = cacheSurClient(clientRedis);
