/**
 * LA PORTE de l'adaptateur `partners` : `POST /api/mcp` (INT-T11, REQ-INT-026).
 *
 * L'ORDRE EST LE CONTRAT, et chaque étape peut refuser :
 *   1. secret absent ou refusé par les règles de REQ-SEC-028 (jugé avec TOUS les secrets, par
 *      `lireEnvironnement`) → 503 : la porte ne sert rien, elle ne s'ouvre jamais par défaut ;
 *   2. le LIMITEUR, AVANT la serrure → 429 si la limite est atteinte, 503 s'il est en panne ou lève.
 *      Placé après, chaque essai de secret ne coûterait qu'une empreinte : la serrure deviendrait
 *      l'oracle de débit d'une force brute. Les deux 503 portent le MÊME corps : un appelant
 *      anonyme n'apprend pas lequel des deux manque ;
 *   3. la SERRURE, à temps constant (primitive partagée) → 401 pour un en-tête absent ou faux ;
 *   4. seulement alors, le corps est lu, borné, en JSON-RPC 2.0.
 *
 * Aucune valeur n'est lue d'un environnement global ici : la route passe le sien (contrôle 2 du
 * harnais), et un test ou le harnais passent le leur.
 */
import { lireEnvironnement, type Secrets } from '../../lib/env';
import { egalATempsConstant } from '../securite/primitives-de-porte';
import type { VerdictDeLimite } from '../securite/rate-limit';
import { nomComplet } from './socle';
import { OUTILS } from './registre';

/** Le NOM de la variable qui porte le secret propre à Partners — un nom, jamais la valeur. */
export const VARIABLE_DU_SECRET: keyof Secrets = 'PARTNERS_MCP_SHARED_SECRET';

/** L'en-tête que le socle présente à chaque appel (`core/federe/appel.ts`, `ENTETE_SECRET_PARTAGE`). */
export const ENTETE_DU_SECRET = 'x-mcp-secret';

/** Le limiteur de la porte. Il décide lui-même de son sujet ; la porte ne lit que son verdict. */
export type LimiteurMcp = (requete: Request, maintenantMs: number) => Promise<VerdictDeLimite>;

export interface OptionsDeLaPorte {
  readonly environnement: Readonly<Record<string, string | undefined>>;
  readonly limiteur: LimiteurMcp;
  readonly maintenantMs: number;
}

/**
 * La borne du corps, en octets : celle que REQ-SEC-010 fixe aux corps entrants des webhooks. Un
 * appel JSON-RPC du socle en fait quelques centaines ; au-delà, ce n'en est pas un.
 */
export const CORPS_MAX_OCTETS = 128 * 1024;

function texte(statut: number, corps: string): Response {
  return new Response(corps, { status: statut });
}

/** Le seul corps des deux 503 d'avant la serrure : ni « secret absent », ni « limiteur en panne ». */
const INDISPONIBLE = 'mcp_indisponible';

type IdJsonRpc = string | number | null;

function erreurJsonRpc(id: IdJsonRpc, code: number, message: string, data?: unknown): Response {
  const error = data === undefined ? { code, message } : { code, message, data };
  return Response.json({ jsonrpc: '2.0', id, error });
}

function resultatJsonRpc(id: IdJsonRpc, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result });
}

export async function traiterAppelMcp(requete: Request, o: OptionsDeLaPorte): Promise<Response> {
  const lu = lireEnvironnement(o.environnement);
  if (!lu.ok) return texte(503, INDISPONIBLE);
  const secret = lu.env[VARIABLE_DU_SECRET];

  let verdict: VerdictDeLimite;
  try {
    verdict = await o.limiteur(requete, o.maintenantMs);
  } catch {
    return texte(503, INDISPONIBLE);
  }
  if (!verdict.autorise) {
    return verdict.panne ? texte(503, INDISPONIBLE) : texte(429, 'mcp_debit_depasse');
  }

  if (!egalATempsConstant(requete.headers.get(ENTETE_DU_SECRET) ?? '', secret)) {
    return texte(401, 'mcp_secret_refuse');
  }

  const declaree = Number(requete.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaree) && declaree > CORPS_MAX_OCTETS)
    return texte(413, 'mcp_corps_trop_grand');
  let brut: string;
  try {
    brut = await requete.text();
  } catch {
    return erreurJsonRpc(null, -32700, 'corps illisible');
  }
  if (Buffer.byteLength(brut, 'utf8') > CORPS_MAX_OCTETS) return texte(413, 'mcp_corps_trop_grand');
  let enveloppe: unknown;
  try {
    enveloppe = JSON.parse(brut);
  } catch {
    return erreurJsonRpc(null, -32700, 'corps illisible : JSON invalide');
  }
  const e = (typeof enveloppe === 'object' && enveloppe !== null ? enveloppe : {}) as Record<
    string,
    unknown
  >;
  const id: IdJsonRpc = typeof e.id === 'string' || typeof e.id === 'number' ? e.id : null;
  if (e.jsonrpc !== '2.0' || typeof e.method !== 'string') {
    return erreurJsonRpc(id, -32600, 'enveloppe invalide : `jsonrpc` « 2.0 » et `method` exigés');
  }
  switch (e.method) {
    case 'tools/list':
      return resultatJsonRpc(id, {
        tools: OUTILS.map((outil) => ({
          name: nomComplet(outil.name),
          description: outil.description,
        })),
      });
    case 'tools/call': {
      const params = (typeof e.params === 'object' && e.params !== null ? e.params : {}) as Record<
        string,
        unknown
      >;
      const nom = typeof params.name === 'string' ? params.name : '';
      if (!OUTILS.some((outil) => nomComplet(outil.name) === nom)) {
        return erreurJsonRpc(id, -32602, `aucun outil nommé « ${nom} »`, {
          code: 'tool_not_found',
        });
      }
      // Inatteignable tant que le registre est vide : l'exécution d'un outil vient avec le premier
      // outil (tâche nommée par `PERIMETRE_VIDE`), jamais avant lui.
      return erreurJsonRpc(id, -32603, 'exécution d’outil non livrée', { code: 'internal' });
    }
    default:
      return erreurJsonRpc(id, -32601, `méthode inconnue : « ${e.method} »`);
  }
}
