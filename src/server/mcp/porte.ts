/**
 * LA PORTE de l'adaptateur `partners` : `POST /api/mcp` (INT-T11, REQ-INT-026).
 *
 * L'ORDRE EST LE CONTRAT, et chaque étape peut refuser :
 *   1. aucun secret configuré        → 503 : la porte ne sert rien, elle ne s'ouvre jamais par défaut ;
 *   2. le LIMITEUR, AVANT la serrure → 429 si la limite est atteinte, 503 s'il est en panne ou lève.
 *      Placé après, chaque essai de secret ne coûterait qu'une empreinte : la serrure deviendrait
 *      l'oracle de débit d'une force brute ;
 *   3. la SERRURE, à temps constant  → 401 pour un en-tête absent ou faux ;
 *   4. seulement alors, le corps est lu, en JSON-RPC 2.0.
 *
 * Aucune valeur n'est lue d'un environnement global ici : la route passe le sien (contrôle 2 du
 * harnais), et un test ou le harnais passent le leur.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VerdictDeLimite } from '../securite/rate-limit';
import { nomComplet } from './socle';
import { OUTILS } from './registre';

/** Le NOM de la variable qui porte le secret propre à Partners — un nom, jamais la valeur. */
export const VARIABLE_DU_SECRET = 'PARTNERS_MCP_SHARED_SECRET';

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
 * Le limiteur tant que le registre de débit ne porte pas de compteur pour cette porte : REFUS, en
 * panne, sous le motif que le registre emploie lui-même pour une limite qu'aucune exigence ne
 * chiffre — même conduite que la frontière axionia (`api-entrante.ts`, `debitNonConfigure`).
 */
export const limiteurNonDeclare: LimiteurMcp = async () => ({
  autorise: false,
  restant: 0,
  repriseAt: null,
  panne: true,
  motif: 'limite_non_configuree',
});

function texte(statut: number, corps: string): Response {
  return new Response(corps, { status: statut });
}

/** Temps constant : les deux côtés réduits à une empreinte de même longueur avant la comparaison. */
function secretAccepte(presente: string | null, attendu: string): boolean {
  if (presente === null || presente === '') return false;
  const a = createHash('sha256').update(presente, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b);
}

type IdJsonRpc = string | number | null;

function erreurJsonRpc(id: IdJsonRpc, code: number, message: string, data?: unknown): Response {
  const error = data === undefined ? { code, message } : { code, message, data };
  return Response.json({ jsonrpc: '2.0', id, error });
}

function resultatJsonRpc(id: IdJsonRpc, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result });
}

export async function traiterAppelMcp(requete: Request, o: OptionsDeLaPorte): Promise<Response> {
  const secret = o.environnement[VARIABLE_DU_SECRET];
  if (secret === undefined || secret === '') return texte(503, 'mcp_secret_absent');

  let verdict: VerdictDeLimite;
  try {
    verdict = await o.limiteur(requete, o.maintenantMs);
  } catch {
    return texte(503, 'mcp_limiteur_indisponible');
  }
  if (!verdict.autorise) {
    return verdict.panne
      ? texte(503, 'mcp_limiteur_indisponible')
      : texte(429, 'mcp_debit_depasse');
  }

  if (!secretAccepte(requete.headers.get(ENTETE_DU_SECRET), secret)) {
    return texte(401, 'mcp_secret_refuse');
  }

  let enveloppe: unknown;
  try {
    enveloppe = JSON.parse(await requete.text());
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
