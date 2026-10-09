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
import { controlerAttestation, resoudreAttestations } from '../../../scripts/lot/attestation';
import { risqueDeLaPr, tachesDeLaPr } from '../../../scripts/lot/revues';
import { LIVREE } from '../../../scripts/lot/avancement';

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

describe('REQ-GOV-021 — GOV-154 : le sha d’une attestation pendante se LIT dans l’historique (gov:attestation)', () => {
  const SHA = 'b'.repeat(40);
  const QUAND = '2026-10-09T10:00:00Z';
  const PULL = 'repos/will383842/axion-apporteurs/pulls/901';
  const pendante = {
    id: 'UX-P1-01',
    repo: 'partners',
    statut: 'fusionnee',
    pr: 901,
    branch: 't/ux-p1-01',
    attestation: { pr: 901, sha: null, fusionneeAt: null },
  };
  const vues = (o: { squash: string | null; mergeCommit: string }) => ({
    brancheParDefaut: 'origin/main',
    forge: (chemin: string) =>
      chemin === PULL
        ? { ok: true as const, corps: { merged_at: QUAND, merge_commit_sha: o.mergeCommit } }
        : { ok: false as const, erreur: 'HTTP 404' },
    situer: (sha: string) => (sha === SHA ? ('ancetre' as const) : ('absent' as const)),
    dateDuCommit: (sha: string) => (sha === SHA ? QUAND : null),
    fusionDeLaPr: (n: number) => (n === 901 ? o.squash : null),
  });
  const livree = () => true;

  it('REQ-GOV-021 — le commit squashé « (#901) » de main résout l’attestation pendante, confronté à la forge', () => {
    const r = resoudreAttestations([pendante], vues({ squash: SHA, mergeCommit: SHA }), livree);
    expect(r.fautes).toEqual([]);
    expect(r.resolues.join(' ')).toContain(SHA.slice(0, 7));
  });

  it('REQ-GOV-021 — un squash que la forge dément est une faute, nommée', () => {
    const r = resoudreAttestations(
      [pendante],
      vues({ squash: SHA, mergeCommit: 'c'.repeat(40) }),
      livree
    );
    expect(r.fautes.join(' ')).toContain('UX-P1-01');
  });

  it('REQ-GOV-021 — sans commit squashé, la pendante est SAUTÉE et nommée, jamais résolue en silence', () => {
    const r = resoudreAttestations([pendante], vues({ squash: null, mergeCommit: SHA }), livree);
    expect(r.resolues).toEqual([]);
    expect(r.sautees.map((s) => s.id)).toEqual(['UX-P1-01']);
  });
});

describe('REQ-GOV-021 — GOV-154 : la PR en cours se lit par --pr ou PR_COURANTE', () => {
  it('REQ-GOV-021 — le numéro de la PR courante est lu, une valeur vide ne vaut rien', () => {
    expect(GARDE.prCourante(['--pr', '901'], {})).toBe(901);
    expect(GARDE.prCourante([], { PR_COURANTE: '902' })).toBe(902);
    expect(GARDE.prCourante([], { PR_COURANTE: '' })).toBeNull();
  });
});

describe('REQ-GOV-021 — GOV-154 : le début de la règle est la FUSION de la garde, jamais un commit de branche', () => {
  it('REQ-GOV-021 — seuls les commits squashés « (#n) » qui ajoutent la garde datent le début', () => {
    expect(
      GARDE.debutDeLaRegle([
        { date: '2026-10-07T20:00:00+02:00', sujet: 'wip: GOV-154 — la garde' },
        { date: '2026-10-09T10:00:00+02:00', sujet: 'Merge abc into def' },
      ])
    ).toBeUndefined();
    expect(
      GARDE.debutDeLaRegle([
        { date: '2026-10-10T10:00:00+02:00', sujet: 'feat(GOV-154): la garde (#860)' },
        { date: '2026-10-07T20:00:00+02:00', sujet: 'wip: GOV-154 — la garde' },
      ])
    ).toBe('2026-10-10T10:00:00+02:00');
  });
});

describe('REQ-GOV-021 — GOV-154 (veto sécurité #856) : une clôture dans la PR ne rouvre jamais une tâche livrée', () => {
  const close = { statut: 'fusionnee', pr: 901, branch: 't/ux-p1-01', owner: 'A06' };
  const pendante = { pr: 901, sha: null, fusionneeAt: null };
  const juger = (base: Record<string, unknown>, tete: Record<string, unknown>): boolean => {
    const [avant] = PR.projeter([brute('UX-P1-01', base)])!;
    const [apres] = PR.projeter([brute('UX-P1-01', { ...base, ...close, ...tete })])!;
    return PR.clotureDansLaPrBienFormee(apres!, avant!, 901);
  };

  it('REQ-GOV-021 — CONTRE-TÉMOIN : une tâche a_faire close à son numéro, attestation pendante', () => {
    expect(juger({}, { attestation: pendante })).toBe(true);
  });

  it('REQ-GOV-021 — chaque statut livré du registre, à la base, refuse la clôture (le sha réel serait effacé)', () => {
    const reel = { pr: 700, sha: 'd'.repeat(40), fusionneeAt: '2026-10-01T10:00:00Z' };
    for (const statut of LIVREE) {
      expect([
        statut,
        juger({ statut, pr: 700, attestation: reel }, { attestation: pendante }),
      ]).toEqual([statut, false]);
    }
    expect(juger({ statut: null }, { attestation: pendante })).toBe(false);
  });

  it('REQ-GOV-021 — `lot` et `motif` ne se réécrivent pas par une clôture dans la PR', () => {
    expect(juger({ lot: 'L1-01' }, { attestation: pendante, lot: 'L1-99' })).toBe(false);
    expect(juger({}, { attestation: pendante, motif: 'un motif glissé' })).toBe(false);
    expect(juger({ lot: 'L1-01' }, { attestation: pendante })).toBe(true);
  });
});

describe('REQ-GOV-021 — GOV-154 (exactitude #856) : une PR fusionnée qui nomme une tâche exige `pr` = son numéro', () => {
  it('REQ-GOV-021 — une tâche livrée sous un AUTRE numéro que la PR qui la nomme est un écart nommé', () => {
    const familles = GARDE.ecartsDuRegistreEtDesFusions({
      taches: [
        {
          id: 'X-3',
          repo: 'partners',
          statut: 'fusionnee',
          pr: 700,
          attestation: { pr: 700, sha: 'e'.repeat(40), fusionneeAt: '2026-10-01T10:00:00Z' },
        },
      ],
      commits: [
        { sha: 'f'.repeat(40), date: '2026-10-09T10:00:00Z', message: 'feat(X-3): x (#905)' },
      ],
      prCourante: null,
      debut: '2026-10-08T00:00:00Z',
    }).map((f) => f.famille);
    expect(familles).toContain('fusion_pr_divergente');
  });
});
