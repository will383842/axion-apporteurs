// @req REQ-GOV-014
/**
 * La fusion par paquets adaptatifs (GOV-158), exception au gel de la phase 1 décidée par Williams le
 * 2026-10-08 (#319, commentaire 6059181319).
 *
 * Un paquet ne réunit que des PR sans fichier commun, dont les migrations suivent l'ordre d'A02 ; il est
 * testé ensemble une fois ; sa taille part de 4 et monte tant que les paquets passent du premier coup ;
 * un échec le coupe en deux pour isoler la fautive, et les saines fusionnent. Aucune garde ne tombe :
 * chaque fusion porte `--match-head-commit`.
 *
 * Le workflow `scripts/lot/lot.workflow.js` est JOUÉ ici, comme dans `chaine-de-lots-econome.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TAILLE_DE_DEPART,
  TAILLE_PLAFOND,
  commandeDeFusion,
  composerPaquets,
  isolerEtFusionner,
  ligneDeCommande,
  migrationsDe,
  moities,
  tailleSuivante,
  type PrAFusionner,
} from '../../../scripts/lot/paquets-de-fusion';

const pr = (numero: number, fichiers: string[]): PrAFusionner => ({ pr: numero, fichiers });
const MIG = (nom: string) => `prisma/migrations/${nom}/migration.sql`;

describe('REQ-GOV-014 — la composition d’un paquet', () => {
  it('REQ-GOV-014 — deux PR qui partagent un fichier ne sont jamais dans le même paquet', () => {
    const prs = [pr(1, ['a.ts']), pr(2, ['b.ts']), pr(3, ['a.ts', 'c.ts']), pr(4, ['d.ts'])];
    const paquets = composerPaquets(prs, 4);
    for (const p of paquets) {
      const vus = new Set<string>();
      for (const n of p) {
        for (const f of prs.find((x) => x.pr === n)!.fichiers) {
          expect(vus.has(f), `paquet ${p.join(',')} : ${f} en double`).toBe(false);
          vus.add(f);
        }
      }
    }
    expect(paquets.flat().sort()).toEqual([1, 2, 3, 4]);
  });

  it('REQ-GOV-014 — un paquet ne dépasse pas la taille demandée', () => {
    const prs = [1, 2, 3, 4, 5, 6].map((n) => pr(n, [`f${n}.ts`]));
    expect(composerPaquets(prs, 4).map((p) => p.length)).toEqual([4, 2]);
  });

  it('REQ-GOV-014 — les migrations fusionnent dans l’ordre d’A02, quel que soit l’ordre des PR', () => {
    const prs = [
      pr(1, [MIG('20261009000002_b'), 'x.ts']),
      pr(2, ['y.ts']),
      pr(3, [MIG('20261009000001_a')]),
    ];
    const ordre = composerPaquets(prs, 4, ['20261009000001_a', '20261009000002_b']).flat();
    const rang = (n: number) => ordre.indexOf(n);
    expect(rang(3)).toBeLessThan(rang(1));
    expect(migrationsDe(prs[0]!)).toEqual(['20261009000002_b']);
  });

  it('REQ-GOV-014 — une migration absente de l’ordre d’A02 refuse la composition', () => {
    expect(() =>
      composerPaquets([pr(1, [MIG('20261009000001_a')])], 4, ['20261009000002_b'])
    ).toThrow(/A02/);
  });

  it('REQ-GOV-014 — sans l’ordre d’A02, une PR qui porte une migration refuse la composition (rien n’est deviné)', () => {
    expect(() => composerPaquets([pr(1, [MIG('20261009000001_a')])], 4)).toThrow(/A02/);
    expect(composerPaquets([pr(1, ['x.ts'])], 4)).toEqual([[1]]);
  });

  it('REQ-GOV-014 — la ligne de commande TRANSMET l’ordre d’A02 au composeur, et refuse une migration hors ordre', () => {
    const fichiers: Record<number, string[]> = { 1: [MIG('m_b')], 2: [MIG('m_a')] };
    const lire = (n: number) => fichiers[n]!;
    const composer = (ordre: string) =>
      ligneDeCommande(['composer', '--taille', '4', '--prs', '1,2', '--ordre-a02', ordre], lire);
    // L'ordre d'A02 n'est pas l'ordre lexical : c'est lui qui décide.
    expect(composer('m_a,m_b')).toBe('[[2,1]]');
    expect(composer('m_b,m_a')).toBe('[[1,2]]');
    expect(() => composer('m_a')).toThrow(/A02/);
    expect(() => ligneDeCommande(['composer', '--taille', '4', '--prs', '1,2'], lire)).toThrow(
      /A02/
    );
  });
});

describe('REQ-GOV-014 — la taille adaptative', () => {
  it('REQ-GOV-014 — on part de 4 ou 5, on monte jusqu’à 8 ou 10 tant que ça passe du premier coup', () => {
    expect([4, 5]).toContain(TAILLE_DE_DEPART);
    expect([8, 9, 10]).toContain(TAILLE_PLAFOND);
    let t = TAILLE_DE_DEPART;
    for (let i = 0; i < 10; i++) t = tailleSuivante(t, true);
    expect(t).toBe(TAILLE_PLAFOND);
    expect(tailleSuivante(TAILLE_DE_DEPART, true)).toBeGreaterThan(TAILLE_DE_DEPART);
  });

  it('REQ-GOV-014 — la taille ne monte jamais après un échec', () => {
    for (const t of [TAILLE_DE_DEPART, 6, 8, TAILLE_PLAFOND]) {
      expect(tailleSuivante(t, false)).toBeLessThanOrEqual(t);
      expect(tailleSuivante(t, false)).toBe(TAILLE_DE_DEPART);
    }
  });
});

describe('REQ-GOV-014 — un échec coupe le paquet en deux', () => {
  it('REQ-GOV-014 — moities coupe au milieu, sans perdre ni réordonner une PR', () => {
    expect(moities([1, 2, 3, 4, 5])).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
  });

  it('REQ-GOV-014 — un paquet vert est testé une seule fois puis fusionné en entier, dans l’ordre', async () => {
    const tests: number[][] = [];
    const fusions: number[] = [];
    const r = await isolerEtFusionner([1, 2, 3, 4], {
      tester: async (p) => (tests.push(p), true),
      fusionner: async (n) => void fusions.push(n),
    });
    expect(tests).toEqual([[1, 2, 3, 4]]);
    expect(fusions).toEqual([1, 2, 3, 4]);
    expect(r).toEqual({ fusionnees: [1, 2, 3, 4], fautives: [], enAttente: [], premierCoup: true });
  });

  it('REQ-GOV-014 — un paquet rouge isole la fautive, et TOUTES les saines sont fusionnées', async () => {
    const fautive = 3;
    const fusions: number[] = [];
    const r = await isolerEtFusionner([1, 2, 3, 4, 5], {
      tester: async (p) => !p.includes(fautive),
      fusionner: async (n) => void fusions.push(n),
    });
    expect(r.fautives).toEqual([fautive]);
    expect(fusions).toEqual([1, 2, 4, 5]);
    expect(r.fusionnees).toEqual([1, 2, 4, 5]);
    expect(r.premierCoup).toBe(false);
  });

  it('REQ-GOV-014 — une fusion refusée (garde rouge sur la tête) compte comme une fautive, pas comme une fusion', async () => {
    const r = await isolerEtFusionner([1, 2], {
      tester: async () => true,
      fusionner: async (n) => {
        if (n === 2) throw new Error('gate-a rouge sur la tête');
      },
    });
    expect(r.fusionnees).toEqual([1]);
    expect(r.fautives).toEqual([2]);
    expect(r.premierCoup).toBe(false);
  });
});

describe('REQ-GOV-014 — une fautive retient les migrations qui la suivent', () => {
  const ORDRE = ['m_a', 'm_b', 'm_c'];
  const prs = [pr(1, [MIG('m_a')]), pr(2, [MIG('m_b')]), pr(3, ['x.ts']), pr(4, [MIG('m_c')])];

  it('REQ-GOV-014 — une saine dont la migration suit celle d’une fautive attend : elle n’est pas fusionnée', async () => {
    const fusions: number[] = [];
    const r = await isolerEtFusionner(
      [1, 2, 3, 4],
      { tester: async (p) => !p.includes(1), fusionner: async (n) => void fusions.push(n) },
      { prs, ordreA02: ORDRE }
    );
    expect(r.fautives).toEqual([1]);
    expect(r.enAttente).toEqual([2, 4]);
    expect(fusions).toEqual([3]);
    expect(r.fusionnees).toEqual([3]);
    expect(r.premierCoup).toBe(false);
  });

  it('REQ-GOV-014 — une fautive sans migration ne retient personne', async () => {
    const fusions: number[] = [];
    const r = await isolerEtFusionner(
      [1, 2, 3, 4],
      { tester: async (p) => !p.includes(3), fusionner: async (n) => void fusions.push(n) },
      { prs, ordreA02: ORDRE }
    );
    expect(r.fautives).toEqual([3]);
    expect(r.enAttente).toEqual([]);
    expect(fusions).toEqual([1, 2, 4]);
  });

  it('REQ-GOV-014 — une fusion refusée sur sa tête retient elle aussi les migrations qui la suivent', async () => {
    const fusions: number[] = [];
    const r = await isolerEtFusionner(
      [2, 4],
      {
        tester: async () => true,
        fusionner: async (n) => {
          if (n === 2) throw new Error('gate-a rouge');
          fusions.push(n);
        },
      },
      { prs, ordreA02: ORDRE }
    );
    expect(r.fautives).toEqual([2]);
    expect(r.enAttente).toEqual([4]);
    expect(fusions).toEqual([]);
  });
});

describe('REQ-GOV-014 — chaque fusion porte --match-head-commit', () => {
  const SHA = 'b'.repeat(40);

  it('REQ-GOV-014 — la commande de fusion impose la tête, en squash, avec la ligne Lot:', () => {
    const c = commandeDeFusion(42, SHA);
    expect(c).toContain(`--match-head-commit ${SHA}`);
    expect(c).toContain('gh pr merge 42 --squash');
    expect(c).toContain('--subject');
    expect(c).toContain('--body');
    expect(c).not.toContain('--auto');
  });

  it('REQ-GOV-014 — une tête absente ou abrégée refuse la commande', () => {
    expect(() => commandeDeFusion(42, '')).toThrow();
    expect(() => commandeDeFusion(42, 'abc1234')).toThrow();
  });

  it('REQ-GOV-014 — le workflow, la fiche A04 et le skill lot décrivent la même chaîne', () => {
    for (const f of [
      'scripts/lot/lot.workflow.js',
      '.claude/agents/release-manager.md',
      '.claude/skills/lot/SKILL.md',
    ]) {
      const texte = readFileSync(f, 'utf8');
      expect(texte, f).toContain('scripts/lot/paquets-de-fusion.ts');
      for (const l of texte.split('\n').filter((x) => x.includes('gh pr merge'))) {
        expect(l, f).toContain('--match-head-commit');
      }
    }
  });
});

// ── le workflow joué ────────────────────────────────────────────────────────────────────────────
const SOURCE = readFileSync('scripts/lot/lot.workflow.js', 'utf8').replace(
  /^export const meta/m,
  'const meta'
);
const FonctionAsynchrone = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => (...a: unknown[]) => Promise<unknown>;

const tache = (id: string) => ({
  id,
  titre: `Tâche ${id}`,
  phase: 1,
  repo: 'partners',
  zone: 'gouvernance',
  paths: [`scripts/lot/${id}.ts`],
  schema: false,
  sensible: [] as string[],
  deps: [],
  reqs: ['REQ-GOV-014'],
  hyp: [],
  owner: null,
  acceptance: 'A',
  tests: {},
});

async function jouer(fusionsRendues: (prs: number[]) => unknown[]) {
  const appels: { label: string; agentType: string; prompt: string }[] = [];
  const taches = [tache('GOV-T1'), tache('GOV-T2'), tache('GOV-T3')];
  const numero = (id: string) => Number(id.slice(-1)) + 100;
  const agent = async (prompt: string, o: { label: string; agentType: string }) => {
    appels.push({ prompt, label: o.label, agentType: o.agentType });
    if (o.label.startsWith('dev:')) {
      const id = o.label.split(':')[1]!;
      return {
        taskId: id,
        branch: `t/${id.toLowerCase()}`,
        pr: numero(id),
        statut: 'livree',
        rouge: 'R',
        vert: true,
        reqCouvertes: ['REQ-GOV-014'],
        appris: [],
        stop: null,
      };
    }
    if (o.label.startsWith('fusion:')) {
      const prs = [...prompt.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
      return { fusions: fusionsRendues([...new Set(prs)]) };
    }
    if (o.label === 'completude') return { manques: [] };
    return { refuse: false, motifs: [] };
  };
  const parallel = (thunks: (() => Promise<unknown>)[]) =>
    Promise.all(thunks.map((f) => f().catch(() => null)));
  const pipeline = (items: unknown[], ...etapes: ((p: unknown, i: unknown) => unknown)[]) =>
    Promise.all(
      items.map(async (item) => {
        let r: unknown = item;
        for (const e of etapes) r = await e(r, item);
        return r;
      })
    );
  const f = new FonctionAsynchrone('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', SOURCE);
  const sortie = (await f(
    { lot: { id: 'L1-99', taches, ecartees: [], exigences: {} }, now: '2026-10-08T00:00:00Z' },
    agent,
    parallel,
    pipeline,
    () => {},
    () => {}
  )) as { resultats: { dev: { pr: number }; fusion?: { atterri: boolean } }[] };
  return { appels, sortie };
}

describe('REQ-GOV-014 — le workflow de lot fusionne par paquets', () => {
  const fusion = (pr: number, atterri: boolean) => ({
    pr,
    sha: atterri ? 'c'.repeat(40) : null,
    fusionneeAt: atterri ? '2026-10-08T00:00:00Z' : null,
    atterri,
    motif: atterri ? '' : 'fautive isolée',
  });

  it('REQ-GOV-014 — un seul release manager reçoit toutes les PR acceptées, avec le composeur de paquets', async () => {
    const { appels } = await jouer((prs) => prs.map((n) => fusion(n, true)));
    const rm = appels.filter((a) => a.agentType === 'release-manager');
    expect(rm).toHaveLength(1);
    for (const n of [101, 102, 103]) expect(rm[0]!.prompt).toContain(`#${n}`);
    expect(rm[0]!.prompt).toContain('scripts/lot/paquets-de-fusion.ts');
    expect(rm[0]!.prompt).toContain('--match-head-commit');
    expect(rm[0]!.prompt).toContain('deploy:verify');
  });

  it('REQ-GOV-014 — la fautive isolée n’atterrit pas, les saines atterrissent', async () => {
    const { sortie } = await jouer((prs) => prs.map((n) => fusion(n, n !== 102)));
    const atterri = (n: number) => sortie.resultats.find((r) => r.dev.pr === n)?.fusion?.atterri;
    expect(atterri(101)).toBe(true);
    expect(atterri(102)).toBe(false);
    expect(atterri(103)).toBe(true);
  });

  it('REQ-GOV-014 — une PR que le release manager ne rend pas n’est pas comptée comme livrée', async () => {
    const { sortie } = await jouer((prs) =>
      prs.filter((n) => n !== 103).map((n) => fusion(n, true))
    );
    expect(sortie.resultats.find((r) => r.dev.pr === 103)?.fusion?.atterri ?? false).toBe(false);
  });
});
