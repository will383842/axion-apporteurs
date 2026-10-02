/**
 * La reprise des codes NAF nuls (REQ-DM-046, HYP-W15-SECTEUR) — un passage périodique du lanceur
 * (GOV-137), choix écrit à la revendication (#431) : même patron que `journal_verifier` et
 * `contacts_purger`, et `disjoncteur.ts` reste intact.
 *
 * CE QU'ELLE FAIT. Elle relit les attributions déposées en REPLI MANUEL (`entreprise_a_verifier`) dont
 * le code NAF est nul, interroge le tiers par SIREN, et n'écrit que ce qu'il rend
 * (`codeNafACompleter`) : jamais une valeur par défaut, jamais par-dessus un code présent (l'écriture
 * exige `code_naf` nul). Le disjoncteur décide : refusé, ou tiers en panne, la reprise s'INTERROMPT et
 * reprend au passage suivant — c'est sa fermeture qui la relance.
 *
 * Le dépôt lui-même (SEC-12) appellera `codeNafDuDepot` ; ce module n'en est que la reprise.
 */
import type { PrismaClient } from '@prisma/client';
import { codeNafACompleter } from '../../domain/entreprise/code-naf';
import type { Disjoncteur } from '../integrations/recherche-entreprises/disjoncteur';
import type { ClientDuTiers } from '../integrations/recherche-entreprises/tiers';
import type { VerdictDeLimite } from '../securite/rate-limit';

/** Un lot par passage : la reprise ne sature pas le tiers, le passage suivant continue. */
export const LOT_DE_LA_REPRISE = 20;

export interface PortsDeLaReprise {
  /** Les attributions à compléter : repli manuel, code nul. */
  lire(): Promise<readonly { readonly id: string; readonly siren: string }[]>;
  /** Écrit le code si et seulement s'il est encore nul ; `false` sinon. */
  ecrire(id: string, code: string): Promise<boolean>;
  readonly tiers: (q: string, maintenantMs: number) => ReturnType<ClientDuTiers>;
  readonly disjoncteur: Disjoncteur;
  /**
   * Le débit GLOBAL vers le tiers (`depot:entreprise-global`, `limiteurDuRegistre.global`) : son quota
   * est PARTAGÉ avec l'autocomplétion des apporteurs, et la reprise le consomme comme elle (lentille
   * sécurité). Refusé ou en panne, la reprise s'interrompt sans appeler le tiers.
   */
  debit(maintenantMs: number): Promise<VerdictDeLimite>;
  maintenantMs(): number;
}

export async function completerLesCodesNaf(
  p: PortsDeLaReprise
): Promise<{ completes: number; sansCode: number; interruptions: number }> {
  let completes = 0;
  let sansCode = 0;
  for (const { id, siren } of await p.lire()) {
    const maintenant = p.maintenantMs();
    if (!p.disjoncteur.autoriser(maintenant)) return { completes, sansCode, interruptions: 1 };
    if (!(await p.debit(maintenant)).autorise) return { completes, sansCode, interruptions: 1 };
    const issue = await p.tiers(siren, maintenant);
    if (!issue.ok) {
      if (issue.motif !== 'requete_refusee') {
        p.disjoncteur.echec(p.maintenantMs(), issue.motif, issue.retryAfterMs);
      } else {
        p.disjoncteur.abandonner();
      }
      return { completes, sansCode, interruptions: 1 };
    }
    p.disjoncteur.reussite();
    const rendu = issue.reponse.results.find((r) => r.siren === siren) ?? null;
    const code = codeNafACompleter(null, rendu);
    if (code === null) {
      sansCode += 1;
      continue;
    }
    if (await p.ecrire(id, code)) completes += 1;
  }
  return { completes, sansCode, interruptions: 0 };
}

/** Les ports de base : une lecture et une écriture typées, sans SQL brut. */
export function portsDeBase(prisma: PrismaClient): Pick<PortsDeLaReprise, 'lire' | 'ecrire'> {
  return {
    lire: () =>
      prisma.attribution.findMany({
        where: { entrepriseAVerifier: true, codeNaf: null },
        select: { id: true, siren: true },
        orderBy: [{ deposeeAt: 'asc' }, { id: 'asc' }],
        take: LOT_DE_LA_REPRISE,
      }),
    ecrire: async (id, code) =>
      (
        await prisma.attribution.updateMany({
          where: { id, codeNaf: null },
          data: { codeNaf: code },
        })
      ).count === 1,
  };
}
