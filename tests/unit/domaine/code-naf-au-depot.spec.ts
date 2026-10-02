// @req REQ-DM-046
/**
 * Le code NAF au dépôt (REQ-DM-046, HYP-W15-SECTEUR) — ce qui se juge sans base.
 *
 * CE QU'IL PROUVE :
 *   1. sur CHACUNE des fixtures enregistrées du tiers, le code retenu égale `activite_principale`,
 *      jamais `activite_principale_naf25` ;
 *   2. un dépôt en repli manuel (aucune fiche) porte un code NUL ; une valeur hors forme ou absente
 *      reste nulle — jamais devinée, jamais complétée par défaut ;
 *   3. la reprise complète les codes nuls par un nouvel appel au tiers, n'écrase jamais un code
 *      présent, s'arrête dès que le tiers est en panne et ne fait rien tant que le disjoncteur
 *      refuse ;
 *   4. TÉMOIN : une reprise qui écrirait une valeur par défaut fait rougir le point 4.
 */
import { describe, it, expect } from 'vitest';
import { codeNafACompleter, codeNafDuDepot } from '../../../src/domain/entreprise/code-naf';
import { lireFixtures } from '../../../src/server/integrations/recherche-entreprises/fixtures';
import { schemaReponseDuTiers } from '../../../src/server/integrations/recherche-entreprises/schemas';
import {
  completerLesCodesNaf,
  type PortsDeLaReprise,
} from '../../../src/server/taches/completer-code-naf';
import { creerDisjoncteur } from '../../../src/server/integrations/recherche-entreprises/disjoncteur';
import type { IssueDuTiers } from '../../../src/server/integrations/recherche-entreprises/tiers';
import { TACHES } from '../../../src/server/taches/registre';
import { inscriptions } from '../../../src/server/taches/inscriptions';
import type { PrismaClient } from '@prisma/client';
import type { VerdictDeLimite } from '../../../src/server/securite/rate-limit';

type Brut = {
  siren: string;
  activite_principale: string | null;
  activite_principale_naf25?: string | null;
};

/** Les résultats bruts des fixtures enregistrées, avec leur code NAF 2025 quand il existe. */
const resultats = (): Brut[] =>
  lireFixtures().flatMap((f) => {
    const lu = schemaReponseDuTiers.safeParse(f.reponse);
    if (!lu.success) return [];
    const bruts = (f.reponse as { results: Brut[] }).results;
    return lu.data.results.map((r, i) => ({
      siren: r.siren,
      activite_principale: r.activite_principale,
      activite_principale_naf25: bruts[i]?.activite_principale_naf25 ?? null,
    }));
  });

describe('REQ-DM-046 — le code NAF retenu au dépôt', () => {
  it('REQ-DM-046 : sur chaque fixture enregistrée, le code retenu égale activite_principale en NAF rév. 2, jamais le NAF 2025 ; une nomenclature antérieure reste nulle', () => {
    const tous = resultats();
    expect(tous.length).toBeGreaterThan(20);
    const REV2 = /^\d{2}\.\d{2}[A-Z]$/;
    let compares = 0;
    let anterieurs = 0;
    for (const r of tous) {
      const rev2 = r.activite_principale !== null && REV2.test(r.activite_principale);
      if (!rev2 && r.activite_principale !== null) anterieurs += 1;
      expect(codeNafDuDepot(r)).toBe(rev2 ? r.activite_principale : null);
      if (r.activite_principale_naf25 && r.activite_principale_naf25 !== r.activite_principale) {
        expect(codeNafDuDepot(r)).not.toBe(r.activite_principale_naf25);
        compares += 1;
      }
    }
    expect(compares).toBeGreaterThan(0);
    // Les fixtures portent bien des codes d'une nomenclature antérieure : le cas est jugé, pas supposé.
    expect(anterieurs).toBeGreaterThan(0);
  });

  it('REQ-DM-046 : un dépôt en repli manuel porte un code NUL ; une valeur absente ou hors forme reste nulle', () => {
    expect(codeNafDuDepot(null)).toBeNull();
    expect(codeNafDuDepot({ activite_principale: null })).toBeNull();
    for (const faux of ['', ' ', '7010Z', '70.', 'x70.10Z', '70.10ZZ', '70.10z', ' 70.10Z']) {
      expect(codeNafDuDepot({ activite_principale: faux })).toBeNull();
    }
    // Une nomenclature antérieure, que le tiers rend encore pour d'anciennes entreprises, n'est ni
    // traduite ni devinée : le code reste nul, comme l'exige le CHECK de la base.
    expect(codeNafDuDepot({ activite_principale: '74.4B' })).toBeNull();
    expect(codeNafDuDepot({ activite_principale: '59.08' })).toBeNull();
    expect(codeNafDuDepot({ activite_principale: '70.10' })).toBeNull();
  });

  it('REQ-DM-046 : un code présent n’est jamais écrasé ; un code nul n’est complété que par le tiers', () => {
    expect(codeNafACompleter('70.10Z', { activite_principale: '68.20B' })).toBeNull();
    expect(codeNafACompleter(null, { activite_principale: '68.20B' })).toBe('68.20B');
    expect(codeNafACompleter(null, { activite_principale: null })).toBeNull();
    expect(codeNafACompleter(null, null)).toBeNull();
  });
});

// ── la reprise, sur des ports factices ───────────────────────────────────────────────────────────

const SIREN_A = '000000001';
const SIREN_B = '000000002';

/** Une réponse du tiers pour un SIREN, au format brut validé par le schéma. */
function reponse(siren: string, naf: string | null): IssueDuTiers {
  return {
    ok: true,
    reponse: schemaReponseDuTiers.parse({
      results: [
        {
          siren,
          nom_complet: 'ENTREPRISE FICTIVE',
          nature_juridique: '5710',
          activite_principale: naf,
          tranche_effectif_salarie: null,
          etat_administratif: 'A',
          categorie_entreprise: null,
          statut_diffusion: 'O',
          siege: {
            siret: `${siren}00012`,
            code_postal: null,
            libelle_commune: null,
            departement: null,
            region: null,
            statut_diffusion_etablissement: 'O',
          },
          dirigeants: [],
        },
      ],
      total_results: 1,
      page: 1,
      per_page: 10,
      total_pages: 1,
    }),
  };
}

type PortsSimules = PortsDeLaReprise & {
  ecrits: [string, string][];
  appels: string[];
  debits: number;
  verdict: VerdictDeLimite;
};

function ports(
  lignes: { id: string; siren: string; codeNaf: string | null }[],
  tiers: (q: string) => IssueDuTiers
): PortsSimules {
  const ecrits: [string, string][] = [];
  const appels: string[] = [];
  const admis: VerdictDeLimite = {
    autorise: true,
    restant: 1,
    repriseAt: null,
    panne: false,
    motif: 'admis',
  };
  const p: PortsSimules = {
    ecrits,
    appels,
    lire: async () =>
      lignes.filter((l) => l.codeNaf === null).map(({ id, siren }) => ({ id, siren })),
    ecrire: async (id, code) => {
      const l = lignes.find((x) => x.id === id)!;
      if (l.codeNaf !== null) return false;
      l.codeNaf = code;
      ecrits.push([id, code]);
      return true;
    },
    tiers: async (q) => {
      appels.push(q);
      return tiers(q);
    },
    disjoncteur: creerDisjoncteur({ seuilEchecs: 1, pauseMs: 60_000 }),
    debits: 0,
    verdict: admis,
    debit: async () => {
      p.debits += 1;
      return p.verdict;
    },
    maintenantMs: () => 0,
  };
  return p;
}

describe('REQ-DM-046 — la reprise des codes nuls', () => {
  it('REQ-DM-046 : un code nul est complété par le tiers ; un code présent n’est ni relu ni écrasé', async () => {
    const lignes = [
      { id: 'a', siren: SIREN_A, codeNaf: null },
      { id: 'b', siren: SIREN_B, codeNaf: '70.10Z' },
    ];
    const p = ports(lignes, (q) => reponse(q, '68.20B'));
    expect(await completerLesCodesNaf(p)).toEqual({
      completes: 1,
      sansCode: 0,
      interruptions: 0,
    });
    expect(p.ecrits).toEqual([['a', '68.20B']]);
    expect(p.appels).toEqual([SIREN_A]);
    expect(lignes[1]!.codeNaf).toBe('70.10Z');
  });

  it('REQ-DM-046 : (4) un tiers qui ne rend pas le code laisse le champ NUL, sans valeur par défaut', async () => {
    const lignes = [{ id: 'a', siren: SIREN_A, codeNaf: null as string | null }];
    const p = ports(lignes, (q) => reponse(q, null));
    expect(await completerLesCodesNaf(p)).toEqual({
      completes: 0,
      sansCode: 1,
      interruptions: 0,
    });
    expect(p.ecrits).toEqual([]);
    expect(lignes[0]!.codeNaf).toBeNull();
  });

  it('REQ-DM-046 : un SIREN absent de la réponse du tiers laisse le champ nul', async () => {
    const lignes = [{ id: 'a', siren: SIREN_A, codeNaf: null as string | null }];
    const p = ports(lignes, () => reponse(SIREN_B, '68.20B'));
    expect((await completerLesCodesNaf(p)).completes).toBe(0);
    expect(lignes[0]!.codeNaf).toBeNull();
  });

  it('REQ-DM-046 : le tiers en panne interrompt la reprise — elle reprendra au passage suivant', async () => {
    const lignes = [
      { id: 'a', siren: SIREN_A, codeNaf: null as string | null },
      { id: 'b', siren: SIREN_B, codeNaf: null as string | null },
    ];
    const p = ports(lignes, () => ({ ok: false, motif: 'erreur_serveur', retryAfterMs: null }));
    expect(await completerLesCodesNaf(p)).toEqual({ completes: 0, sansCode: 0, interruptions: 1 });
    expect(p.appels).toEqual([SIREN_A]);
  });

  it('REQ-DM-046 : disjoncteur ouvert — aucun appel, rien n’est écrit', async () => {
    const lignes = [{ id: 'a', siren: SIREN_A, codeNaf: null as string | null }];
    const p = ports(lignes, (q) => reponse(q, '68.20B'));
    p.disjoncteur.echec(0, 'erreur_serveur', null);
    expect(await completerLesCodesNaf(p)).toEqual({ completes: 0, sansCode: 0, interruptions: 1 });
    expect(p.appels).toEqual([]);
  });

  it.each([
    [
      'refusé par la limite',
      { autorise: false, restant: 0, repriseAt: 1_000, panne: false, motif: 'limite_atteinte' },
    ],
    [
      'en panne',
      { autorise: false, restant: 0, repriseAt: null, panne: true, motif: 'cache_indisponible' },
    ],
  ] as const)(
    'REQ-DM-046 : TÉMOIN — le débit global %s interrompt la reprise sans appeler le tiers',
    async (_quoi, verdict) => {
      const lignes = [{ id: 'a', siren: SIREN_A, codeNaf: null as string | null }];
      const p = ports(lignes, (q) => reponse(q, '68.20B'));
      p.verdict = verdict;
      expect(await completerLesCodesNaf(p)).toEqual({
        completes: 0,
        sansCode: 0,
        interruptions: 1,
      });
      expect(p.appels).toEqual([]);
      expect(p.debits).toBe(1);
      expect(lignes[0]!.codeNaf).toBeNull();
    }
  );

  it('REQ-DM-046 : un appel au tiers consomme UNE place du débit global, comme l’autocomplétion', async () => {
    const lignes = [
      { id: 'a', siren: SIREN_A, codeNaf: null as string | null },
      { id: 'b', siren: SIREN_B, codeNaf: null as string | null },
    ];
    const p = ports(lignes, (q) => reponse(q, '68.20B'));
    await completerLesCodesNaf(p);
    expect(p.debits).toBe(p.appels.length);
    expect(p.appels).toHaveLength(2);
  });

  it('REQ-DM-046 : la reprise est une tâche du registre, inscrite au lanceur', () => {
    expect(TACHES.naf_completer).toEqual({ req: 'REQ-DM-046' });
    const client: unknown = {};
    expect(typeof inscriptions(client as PrismaClient).naf_completer).toBe('function');
  });
});
