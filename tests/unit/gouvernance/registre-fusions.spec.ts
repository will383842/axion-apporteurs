// @req REQ-GOV-021
/**
 * registre-fusions.spec.ts — GOV-154 : la fin des PR de rattrapage. Une PR clôt sa propre tâche
 * (`lot:cloture --dans-la-pr`) avec une attestation PENDANTE ; le sha se lit sur main par
 * `gov:registre-fusions`, qui rougit sur un écart prouvé. Les deux conditions de la sécurité sont des
 * témoins : la clôture ne fait jamais baisser le risque, et un registre illisible arrête la garde.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as GARDE from '../../../scripts/gates/registre-fusions';
import * as PR from '../../../scripts/gates/gov-pr';
import { cloturerDansLaPr, ErreurDeCloture } from '../../../scripts/lot/cloture';
import { controlerAttestation } from '../../../scripts/lot/attestation';
import { risqueDeLaPr, tachesDeLaPr } from '../../../scripts/lot/revues';

type TacheBrute = NonNullable<Parameters<typeof PR.projeter>[0]>[number] & Record<string, unknown>;
const brute = (id: string, extra: Record<string, unknown> = {}): TacheBrute => ({
  id,
  repo: 'partners',
  zone: 'espace',
  sensible: [],
  schema: false,
  pr: null,
  paths: [`src/${id}.ts`],
  tests: null,
  statut: 'a_faire',
  owner: 'A06',
  acceptance: 'une acceptation',
  ...extra,
});

describe('REQ-GOV-021 — GOV-154 : une PR clôt sa propre tâche, attestation PENDANTE', () => {
  const pr = {
    numero: 901,
    titre: 'feat(UX-P1-01): x',
    corps: 'Lot: UX-P1-01',
    branch: 't/ux-p1-01',
  };

  it('REQ-GOV-021 — lot:cloture --dans-la-pr pose fusionnee, le numéro et une attestation sans sha ni date', () => {
    const taches = [brute('UX-P1-01')] as never[];
    cloturerDansLaPr({ tacheId: 'UX-P1-01', pr, taches });
    const t = taches[0] as unknown as TacheBrute;
    expect(t.statut).toBe('fusionnee');
    expect(t.pr).toBe(901);
    expect(t.attestation).toEqual({ pr: 901, sha: null, fusionneeAt: null });
  });

  it('REQ-GOV-021 — une PR ne clôt pas une tâche qu’elle ne déclare pas, ni une tâche déjà livrée', () => {
    const autre = [brute('UX-P1-02')] as never[];
    expect(() => cloturerDansLaPr({ tacheId: 'UX-P1-02', pr, taches: autre })).toThrow(
      ErreurDeCloture
    );
    const livree = [brute('UX-P1-01', { statut: 'fusionnee', pr: 800 })] as never[];
    expect(() => cloturerDansLaPr({ tacheId: 'UX-P1-01', pr, taches: livree })).toThrow(/déjà/);
  });

  it('REQ-GOV-021 — l’attestation pendante est admise ICI, refusée pour une tâche d’un autre dépôt', () => {
    const a = { pr: 901, sha: null, fusionneeAt: null };
    const vues = { maintenant: Date.parse('2026-10-09T00:00:00Z') };
    expect(
      controlerAttestation(
        { id: 'X', repo: 'partners', statut: 'fusionnee', pr: 901, attestation: a },
        true,
        vues
      )
    ).toEqual([]);
    const ailleurs = controlerAttestation(
      { id: 'Y', repo: 'axionia', statut: 'fusionnee', pr: null, attestation: a },
      true,
      vues
    );
    expect(ailleurs.map((f) => f.famille)).toContain('attestation_sha_non_conforme');
  });
});

describe('REQ-GOV-021 — GOV-154 : gov:pr admet la SEULE clôture des tâches déclarées', () => {
  const base = [brute('UX-P1-01'), brute('UX-P1-02')];
  const close = (t: TacheBrute): TacheBrute => ({
    ...t,
    statut: 'fusionnee',
    pr: 901,
    branch: 't/ux-p1-01',
    attestation: { pr: 901, sha: null, fusionneeAt: null },
  });
  const juger = (tete: TacheBrute[], corps = 'Lot: UX-P1-01'): string[] => {
    const taches = PR.projeter(tete);
    return PR.ecartsDuRegistreDUnePrDAuteur(
      { gabarit: '', codeowners: '', charte: '', fiches: [], architecte: '', taches },
      {
        numero: 901,
        titre: 'feat(UX-P1-01): x',
        corps,
        labels: [],
        fichiers: ['docs/tasks.json', 'src/UX-P1-01.ts'],
        revues: null,
        tachesBase: PR.projeter(base),
      },
      'UX-P1-01',
      tachesDeLaPr(taches, 901, 'UX-P1-01', ['UX-P1-01'])
    );
  };

  it('REQ-GOV-021 — la clôture bien formée de SA tâche n’est pas un écart', () => {
    expect(juger([close(base[0]!), base[1]!])).toEqual([]);
  });

  it('REQ-GOV-021 — une tâche close par son seul `pr`, hors du titre et du Lot, reste un écart', () => {
    const etrangere = { ...close(base[1]!), branch: 't/ux-p1-01' };
    expect(juger([base[0]!, etrangere]).join(' ')).toContain('UX-P1-02');
  });

  it('REQ-GOV-021 — une clôture qui réécrit AUSSI un autre champ reste un écart', () => {
    const plus = { ...close(base[0]!), acceptance: 'réécrite' };
    expect(juger([plus, base[1]!]).join(' ')).toContain('un autre champ');
  });
});

describe('REQ-GOV-021 — GOV-154 : gov:registre-fusions juge l’écart prouvé, et lui seul', () => {
  it('REQ-GOV-021 — chaque famille rougit sur son témoin, chaque contre-témoin reste vert', () => {
    for (const t of GARDE.TEMOINS) {
      expect([t.famille, GARDE.ecartsDuRegistreEtDesFusions(t.cas).map((f) => f.famille)]).toEqual([
        t.famille,
        expect.arrayContaining([t.famille]),
      ]);
    }
    for (const c of GARDE.CONTRE_TEMOINS) {
      expect([c.quoi, GARDE.ecartsDuRegistreEtDesFusions(c.cas)]).toEqual([c.quoi, []]);
    }
  });

  it('REQ-GOV-021 — condition de la sécurité : la clôture dans la PR ne fait JAMAIS baisser le risque', () => {
    const sensible = (statut: string) =>
      PR.projeter([
        brute('UX-P1-01', {
          sensible: ['argent'],
          statut,
          pr: statut === 'fusionnee' ? 901 : null,
        }),
      ]);
    const risque = (statut: string) =>
      risqueDeLaPr({
        titre: 'feat(UX-P1-01): x',
        pr: 901,
        taches: sensible(statut),
        tachesBase: sensible('a_faire'),
        fichiers: ['docs/tasks.json'],
        labels: [],
        liste: { source: 'complete' },
      }).niveau;
    expect(risque('fusionnee')).toBe(risque('a_faire'));
    expect(risque('fusionnee')).toBe('eleve');
  });

  it('REQ-GOV-021 — condition de la sécurité : un registre illisible ARRÊTE la garde', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-154-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      let code = 0;
      try {
        execFileSync(
          process.execPath,
          [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/gates/registre-fusions.ts')],
          {
            cwd: dir,
            stdio: 'pipe',
          }
        );
      } catch (e) {
        code = (e as { status: number }).status;
      }
      expect(code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
