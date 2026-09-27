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

// ── Les webhooks entrants (SEC-06, INT-T10 ; REQ-SEC-010) ──────────────────────────────────────

/**
 * La borne des corps entrants, en octets : 128 Ko (REQ-SEC-010). Une seule écriture pour toutes les
 * portes — les webhooks d'axionia et du relais de courriel, et la porte MCP qui l'importe.
 */
export const CORPS_MAX_OCTETS = 128 * 1024;

/** La tolérance d'horloge d'une signature de webhook, en secondes (REQ-SEC-010). */
export const TOLERANCE_SIGNATURE_S = 300;

export type LectureDeCorps =
  { ok: true; octets: Uint8Array } | { ok: false; motif: 'corps_trop_grand' | 'corps_illisible' };

/**
 * Le corps BRUT d'une requête, borné AVANT d'être lu en entier : une longueur déclarée au-delà de la
 * borne est refusée sans lire un octet, et un corps en flux (sans longueur déclarée, ou qui ment sur
 * elle) est COUPÉ dès qu'il la dépasse. `text()` lirait tout avant de compter — une charge énorme
 * serait déjà en mémoire quand on la refuserait. Les octets sont rendus tels quels : la signature et
 * l'empreinte portent sur eux, jamais sur un objet re-sérialisé.
 */
export async function lireCorpsBorne(
  requete: Request,
  max: number = CORPS_MAX_OCTETS
): Promise<LectureDeCorps> {
  const declaree = Number(requete.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaree) && declaree > max) return { ok: false, motif: 'corps_trop_grand' };
  if (requete.body === null) return { ok: true, octets: new Uint8Array(0) };
  const lecteur = requete.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await lecteur.cancel().catch(() => undefined);
        return { ok: false, motif: 'corps_trop_grand' };
      }
      morceaux.push(value);
    }
  } catch {
    return { ok: false, motif: 'corps_illisible' };
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    octets.set(m, position);
    position += m.byteLength;
  }
  return { ok: true, octets };
}

/** Un signal de sécurité d'une porte : son nom et un motif FERMÉ, jamais une valeur reçue. */
export type SignalDePorte = { porte: string; motif: string };

export interface AlerteurPlafonne {
  signaler(signal: SignalDePorte): void;
  /** Une livraison authentifiée réarme la porte : le prochain refus sera de nouveau alerté. */
  rearmer(porte: string): void;
}

/**
 * L'alerte PLAFONNÉE de REQ-SEC-010 : le premier signal d'un couple (porte, motif) est émis, les
 * suivants sont COMPTÉS et tus jusqu'à ce que la porte soit réarmée ; le signal émis après le
 * réarmement dit combien ont été tus. Un attaquant qui frappe mille fois ne produit qu'une alerte,
 * et le plafond ne repose sur AUCUN seuil chiffré — donc sur aucune valeur qui dirait comment rester
 * en dessous (REQ-GOV-031). Émettre ne lève jamais : une alerte ne fait pas tomber la porte.
 */
export function creerAlerteurPlafonne(
  emettre: (signal: SignalDePorte & { tus: number }) => void
): AlerteurPlafonne {
  const armes = new Set<string>();
  const tus = new Map<string, number>();
  const cle = (s: SignalDePorte) => `${s.porte}\u001f${s.motif}`;
  return {
    signaler(signal) {
      const k = cle(signal);
      if (armes.has(k)) {
        tus.set(k, (tus.get(k) ?? 0) + 1);
        return;
      }
      armes.add(k);
      const n = tus.get(k) ?? 0;
      tus.delete(k);
      try {
        emettre({ porte: signal.porte, motif: signal.motif, tus: n });
      } catch {
        // Une alerte qui ne part pas ne ferme pas la porte : elle est déjà refusée.
      }
    },
    rearmer(porte) {
      for (const k of [...armes]) if (k.startsWith(`${porte}\u001f`)) armes.delete(k);
    },
  };
}
