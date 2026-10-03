// @req REQ-DM-046
/**
 * La reprise des codes NAF nuls, en base RÉELLE (REQ-DM-046, HYP-W15-SECTEUR).
 *
 * Le tiers est un FAUX (aucun réseau) ; la base est celle du harnais :
 *   — une attribution déposée en repli manuel, code nul, est complétée par ce que le tiers rend ;
 *   — un code déjà présent n'est jamais écrasé, même si le tiers rend autre chose ;
 *   — une attribution qui n'est pas en repli n'est pas relue ;
 *   — un tiers qui ne rend pas de code laisse le champ nul.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { completerLesCodesNaf, portsDeBase } from '../../src/server/taches/completer-code-naf';
import { creerDisjoncteur } from '../../src/server/integrations/recherche-entreprises/disjoncteur';
import { schemaReponseDuTiers } from '../../src/server/integrations/recherche-entreprises/schemas';
import type { IssueDuTiers } from '../../src/server/integrations/recherche-entreprises/tiers';

let base: Base;
let grilleId: string;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sirens = 400000000;
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: MAINTENANT,
        importeeAt: MAINTENANT,
      },
    })
  ).id;
  apporteurId = (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: MAINTENANT,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

/** Une attribution (perdue : elle n'occupe pas son SIREN), par SQL brut. */
async function semer(siren: string, aVerifier: boolean, codeNaf: string | null): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare, code_naf)
     VALUES ($1::uuid, $2::uuid, 'perdue', $3, 'espace', $4::uuid, '2026-10-01', false, $5, false, $6)`,
    id,
    apporteurId,
    siren,
    grilleId,
    aVerifier,
    codeNaf
  );
  return id;
}

const codeDe = async (id: string) =>
  (await base.prisma.attribution.findUniqueOrThrow({ where: { id }, select: { codeNaf: true } }))
    .codeNaf;

/** Le faux tiers : pour chaque SIREN, le code qu'il rend (ou `null`). */
function tiers(codes: Record<string, string | null>): (q: string) => Promise<IssueDuTiers> {
  return async (q) => ({
    ok: true,
    reponse: schemaReponseDuTiers.parse({
      results:
        q in codes
          ? [
              {
                siren: q,
                nom_complet: 'ENTREPRISE FICTIVE',
                nature_juridique: '5710',
                activite_principale: codes[q],
                tranche_effectif_salarie: null,
                etat_administratif: 'A',
                categorie_entreprise: null,
                statut_diffusion: 'O',
                siege: {
                  siret: `${q}00012`,
                  code_postal: null,
                  libelle_commune: null,
                  departement: null,
                  region: null,
                  statut_diffusion_etablissement: 'O',
                },
                dirigeants: [],
              },
            ]
          : [],
      total_results: q in codes ? 1 : 0,
      page: 1,
      per_page: 10,
      total_pages: q in codes ? 1 : 0,
    }),
  });
}

describe('REQ-DM-046 — la reprise des codes NAF nuls, en base réelle', () => {
  it('REQ-DM-046 : un repli manuel est complété ; un code présent n’est pas écrasé ; un dépôt hors repli n’est pas relu ; un tiers sans code laisse nul', async () => {
    const sRepli = unSiren();
    const sPresent = unSiren();
    const sHorsRepli = unSiren();
    const sSansCode = unSiren();
    const repli = await semer(sRepli, true, null);
    const present = await semer(sPresent, true, '70.10Z');
    const horsRepli = await semer(sHorsRepli, false, null);
    const sansCode = await semer(sSansCode, true, null);

    const appels: string[] = [];
    const faux = tiers({
      [sRepli]: '68.20B',
      [sPresent]: '94.99Z',
      [sHorsRepli]: '49.10Z',
      [sSansCode]: null,
    });
    const r = await completerLesCodesNaf({
      ...portsDeBase(base.prisma),
      tiers: async (q) => {
        appels.push(q);
        return faux(q);
      },
      disjoncteur: creerDisjoncteur(),
      debit: async () => ({
        autorise: true,
        restant: 1,
        repriseAt: null,
        panne: false,
        motif: 'admis',
      }),
      maintenantMs: () => MAINTENANT.getTime(),
    });

    expect(r).toEqual({ completes: 1, sansCode: 1, interruptions: 0 });
    expect(await codeDe(repli)).toBe('68.20B');
    expect(await codeDe(present)).toBe('70.10Z');
    expect(await codeDe(horsRepli)).toBeNull();
    expect(await codeDe(sansCode)).toBeNull();
    expect(appels.sort()).toEqual([sRepli, sSansCode].sort());
  });

  it('REQ-DM-046 : l’écriture exige un code nul — une ligne complétée entre la lecture et l’écriture n’est pas écrasée', async () => {
    const id = await semer(unSiren(), true, null);
    const { ecrire } = portsDeBase(base.prisma);
    expect(await ecrire(id, '68.20B')).toBe(true);
    expect(await ecrire(id, '94.99Z')).toBe(false);
    expect(await codeDe(id)).toBe('68.20B');
  });
});
