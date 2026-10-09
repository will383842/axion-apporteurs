// @req REQ-GOV-011
/**
 * La chaîne de lots coûte moins de tours et de contexte par tâche, sans retirer aucun garde-fou.
 *
 * Le workflow `scripts/lot/lot.workflow.js` est JOUÉ ici, pas lu : son texte est exécuté avec des
 * `agent()`, `parallel()` et `pipeline()` de témoin qui enregistrent chaque appel et rendent un avis
 * scripté. Ce qu'on mesure, ce sont les agents lancés et ce qu'on leur donne à lire.
 *
 * Source des règles éprouvées : `W16` (`docs/DECISIONS.md` §1), `partners/ADR-0024` et
 * `docs/CHARTE-AGENTS.md` §6 — deux lentilles partout (`exactitude`, `securite`), plus l'architecte
 * sur une tâche `schema` ; plus de lentille `simplicite` ; la mutation est mesurée par Stryker en
 * porte A, plus par un agent ; le refus de `securite` bloque à lui seul, sur toute PR.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exigencesDuLot } from '../../../scripts/lot/composer';

type Appel = { prompt: string; label: string; agentType: string };
type Avis = Record<string, unknown> | null;
type Repondre = (label: string, prompt: string) => Avis;

const SOURCE = readFileSync('scripts/lot/lot.workflow.js', 'utf8').replace(
  /^export const meta/m,
  'const meta'
);
const FonctionAsynchrone = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => (...a: unknown[]) => Promise<unknown>;

const TACHE = {
  id: 'GOV-T99',
  titre: 'Tâche témoin',
  phase: 1,
  repo: 'partners',
  zone: 'gouvernance',
  paths: ['scripts/lot/x.ts'],
  schema: false,
  sensible: [] as string[],
  deps: ['GOV-T98'],
  reqs: ['REQ-GOV-011'],
  hyp: ['HYP-TEMOIN'],
  owner: null,
  acceptance: 'ACCEPTATION-DU-TEMOIN',
  tests: { 'REQ-GOV-011': ['tests/unit/x.spec.ts#REQ-GOV-011 — x'] },
};

const DEV_LIVRE = {
  taskId: TACHE.id,
  branch: 't/gov-t99',
  pr: 7,
  statut: 'livree',
  rouge: 'ROUGE-DU-TOUR-1',
  vert: true,
  reqCouvertes: ['REQ-GOV-011'],
  appris: [],
  stop: null,
};
const FUSION_OK = {
  pr: 7,
  sha: 'a'.repeat(40),
  fusionneeAt: '2026-10-08T00:00:00Z',
  atterri: true,
  motif: '',
};

async function jouer(repondre: Repondre, tache: Record<string, unknown> = TACHE) {
  const appels: Appel[] = [];
  const agent = async (prompt: string, opts: { label: string; agentType: string }) => {
    appels.push({ prompt, label: opts.label, agentType: opts.agentType });
    if (opts.label.startsWith('fusion:')) return FUSION_OK;
    if (opts.label === 'completude') return { manques: [] };
    return repondre(opts.label, prompt);
  };
  const parallel = (thunks: (() => Promise<unknown>)[]) =>
    Promise.all(thunks.map((f) => f().catch(() => null)));
  const pipeline = (
    items: unknown[],
    ...etapes: ((p: unknown, i: unknown, n: number) => unknown)[]
  ) =>
    Promise.all(
      items.map(async (item, n) => {
        let r: unknown = item;
        for (const e of etapes) {
          try {
            r = await e(r, item, n);
          } catch {
            return null;
          }
        }
        return r;
      })
    );
  const lot = {
    id: 'L1-99',
    taches: [tache],
    ecartees: [],
    exigences: { 'REQ-GOV-011': 'TEXTE-DE-L-EXIGENCE-CITEE' },
  };
  const f = new FonctionAsynchrone('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', SOURCE);
  const sortie = (await f(
    { lot, now: '2026-10-08T00:00:00Z' },
    agent,
    parallel,
    pipeline,
    () => {},
    () => {}
  )) as { resultats: { refuse: boolean; motif?: string }[]; stops: unknown[]; arret: unknown };
  return { appels, sortie };
}

const accord = { refuse: false, motifs: [] };
const refus = (m: string) => ({ refuse: true, motifs: [m] });
const revues = (appels: Appel[], tour: number) =>
  appels
    .filter((a) => a.label.startsWith('revue:') && a.label.endsWith(`:${tour}`))
    .map((a) => a.label.split(':')[2])
    .sort();

describe('la chaîne de lots — deux lentilles, et la mutation à Stryker', () => {
  it('REQ-GOV-011 — une tâche ordinaire reçoit exactement exactitude et securite, sans simplicite ni agent de mutation', async () => {
    const { appels, sortie } = await jouer((label) =>
      label.startsWith('dev:') ? DEV_LIVRE : accord
    );
    expect(revues(appels, 1)).toEqual(['exactitude', 'securite']);
    expect(appels.some((a) => a.agentType === 'verificateur-rouge')).toBe(false);
    expect(appels.some((a) => a.label.includes('simplicite'))).toBe(false);
    expect(sortie.resultats[0]?.refuse).toBe(false);
  });

  it('REQ-GOV-011 — une tâche schema reçoit en plus la lentille de l’architecte', async () => {
    const { appels } = await jouer((label) => (label.startsWith('dev:') ? DEV_LIVRE : accord), {
      ...TACHE,
      schema: true,
    });
    expect(revues(appels, 1)).toEqual(['exactitude', 'schema', 'securite']);
  });

  it('REQ-GOV-011 — le refus de securite seul bloque, même hors tâche sensible, et le lead ne le lève pas', async () => {
    const { appels, sortie } = await jouer((label) =>
      label.startsWith('dev:') ? DEV_LIVRE : label.includes(':securite:') ? refus('fuite') : accord
    );
    expect(appels.some((a) => a.agentType === 'lead')).toBe(false);
    expect(appels.some((a) => a.label.startsWith('fusion:'))).toBe(false);
    expect(sortie.resultats[0]?.refuse).toBe(true);
  });
});

describe('la chaîne de lots — le second tour ne relit que ce qui a refusé, plus securite', () => {
  it('REQ-GOV-011 — au tour 2, seules les lentilles qui ont refusé et securite relisent en entier ; les autres reconfirment sur le delta', async () => {
    const { appels } = await jouer(
      (label) => {
        if (label.startsWith('dev:')) return DEV_LIVRE;
        if (label === `revue:${TACHE.id}:schema:1`) return refus('index non dérivé');
        return accord;
      },
      { ...TACHE, schema: true }
    );
    expect(revues(appels, 2)).toEqual(['schema', 'securite']);
    expect(appels.filter((a) => a.label.startsWith('reaccord:')).map((a) => a.label)).toEqual([
      `reaccord:${TACHE.id}:exactitude`,
    ]);
  });

  it('REQ-GOV-011 — le rendu du correctif est lu : son rouge parvient aux relecteurs du tour 2', async () => {
    const { appels } = await jouer((label) => {
      if (label === `dev:${TACHE.id}`) return DEV_LIVRE;
      if (label.startsWith('dev:')) return { ...DEV_LIVRE, rouge: 'ROUGE-DU-CORRECTIF' };
      if (label === `revue:${TACHE.id}:exactitude:1`) return refus('écart de périmètre');
      return accord;
    });
    const tour2 = appels.filter((a) => a.label.endsWith(':2'));
    expect(tour2.length).toBeGreaterThan(0);
    for (const a of tour2) expect(a.prompt).toContain('ROUGE-DU-CORRECTIF');
  });

  it('REQ-GOV-011 — un stop rendu par le correctif arrête le lot', async () => {
    const { sortie, appels } = await jouer((label) => {
      if (label === `dev:${TACHE.id}`) return DEV_LIVRE;
      if (label.startsWith('dev:'))
        return { ...DEV_LIVRE, statut: 'stop', stop: { motif: 'req_non_testable', ref: 'x' } };
      if (label === `revue:${TACHE.id}:exactitude:1`) return refus('écart');
      return accord;
    });
    expect(sortie.stops).toEqual([{ tache: TACHE.id, motif: 'req_non_testable', ref: 'x' }]);
    expect(sortie.arret).toBeTruthy();
    expect(appels.some((a) => a.label.endsWith(':2'))).toBe(false);
  });
});

describe('la chaîne de lots — le contexte donné à chaque agent', () => {
  it('REQ-GOV-011 — la tâche est réduite à ses champs utiles, et le texte des REQ citées est inliné', async () => {
    const { appels } = await jouer((label) => (label.startsWith('dev:') ? DEV_LIVRE : accord));
    const dev = appels.find((a) => a.label === `dev:${TACHE.id}`)!;
    expect(dev.prompt).toContain('TEXTE-DE-L-EXIGENCE-CITEE');
    expect(dev.prompt).toContain('ACCEPTATION-DU-TEMOIN');
    for (const absent of ['"deps"', '"owner"']) {
      expect(dev.prompt).not.toContain(absent);
    }
  });

  it('REQ-GOV-011 — le développeur reçoit `hyp` : c’est lui qui déclenche le `stop` d’une décision sans hypothèse', async () => {
    const { appels } = await jouer((label) => (label.startsWith('dev:') ? DEV_LIVRE : accord));
    const dev = appels.find((a) => a.label === `dev:${TACHE.id}`)!;
    expect(dev.prompt).toContain('"hyp":["HYP-TEMOIN"]');
  });

  const lentillesDUneTacheSensible = async () => {
    const sensible = { ...TACHE, schema: true, sensible: ['auth'] };
    const { appels } = await jouer(
      (label) => (label.startsWith('dev:') ? DEV_LIVRE : accord),
      sensible
    );
    expect(revues(appels, 1)).toEqual(['exactitude', 'schema', 'securite']);
    return appels.filter((x) => x.label.startsWith('revue:'));
  };

  it('REQ-GOV-011 — chaque lentille (exactitude, securite, schema) reçoit `acceptance` : les critères de sécurité d’une tâche sensible n’y vivent souvent que là', async () => {
    for (const a of await lentillesDUneTacheSensible()) {
      expect(a.prompt, `${a.label} → acceptance`).toContain('ACCEPTATION-DU-TEMOIN');
    }
  });

  it('REQ-GOV-011 — chaque lentille reçoit `hyp`, `sensible`, `schema` et `paths`', async () => {
    for (const a of await lentillesDUneTacheSensible()) {
      for (const attendu of [
        '"hyp":["HYP-TEMOIN"]',
        '"sensible":["auth"]',
        '"schema":true',
        '"paths":["scripts/lot/x.ts"]',
      ]) {
        expect(a.prompt, `${a.label} → ${attendu}`).toContain(attendu);
      }
    }
  });

  it('REQ-GOV-011 — aucun agent n’est envoyé vers une vue générée absente ou un dossier inexistant', async () => {
    const { appels } = await jouer((label) => (label.startsWith('dev:') ? DEV_LIVRE : accord));
    for (const a of appels) {
      for (const chemin of [
        'docs/REQUIREMENTS.md',
        'docs/PLAN-STATE.md',
        'docs/TRACEABILITY.md',
        'docs/spec/',
      ]) {
        expect(a.prompt, `${a.label} → ${chemin}`).not.toContain(chemin);
      }
    }
  });

  it('REQ-GOV-011 — le release manager ne reçoit pas l’acceptation, et garde la fusion à tête imposée', async () => {
    const { appels } = await jouer((label) => (label.startsWith('dev:') ? DEV_LIVRE : accord));
    const rm = appels.find((a) => a.agentType === 'release-manager')!;
    expect(rm.prompt).not.toContain('ACCEPTATION-DU-TEMOIN');
    expect(rm.prompt).toContain('--match-head-commit');
  });
});

describe('le composeur — le texte des seules exigences citées par le lot', () => {
  it('REQ-GOV-011 — rend le texte des REQ citées, et null pour une REQ absente du registre', () => {
    const exigences = [
      { id: 'REQ-A', texte: 'a' },
      { id: 'REQ-B', texte: 'b' },
      { id: 'REQ-C', texte: 'c' },
    ];
    expect(exigencesDuLot([{ reqs: ['REQ-B', 'REQ-Z'] }, { reqs: ['REQ-B'] }], exigences)).toEqual({
      'REQ-B': 'b',
      'REQ-Z': null,
    });
  });
});
