// @req REQ-QA-023
/**
 * QA-T12 — le cycle de la sauvegarde autour de l'exercice : rechiffrer chaque heure ce que la
 * plateforme dépose, exercer chaque mois le dernier vidage chiffré, alerter sur échec, juger la
 * fraîcheur chaque nuit. Le dépôt objet est un dépôt EN MÉMOIRE et l'exercice un exerceur injecté :
 * la restauration réelle est exercée par `sauvegarde-et-exercice.spec.ts` sur un vrai Postgres.
 *
 * RM-11 : l'état du dépôt, l'instant, la clé et l'issue de l'exercice sont posés par chaque cas.
 */
import { describe, it, expect } from 'vitest';
import {
  rechiffrer,
  exercerLeDernier,
  fraicheurDuDepot,
  PREFIXES,
  type Depot,
  type ObjetDuDepot,
} from '../../../scripts/sauvegarde/cycle';
import { dechiffrer, chiffrer, estChiffre } from '../../../scripts/sauvegarde/chiffrement';
import type { Verdict } from '../../../scripts/sauvegarde/exercice';
import type { ObjetAlerte } from '../../../src/server/integrations/telegram/alertes';

const CLE = 'cle-factice-de-test-cycle-de-sauvegarde-000001';

function depot(initial: Record<string, { contenu: Buffer; date: string }>): Depot & {
  etat: Map<string, ObjetDuDepot & { contenu: Buffer }>;
} {
  const etat = new Map(
    Object.entries(initial).map(([cle, v]) => [cle, { cle, date: v.date, contenu: v.contenu }])
  );
  return {
    etat,
    lister: async (prefixe) =>
      [...etat.values()]
        .filter((o) => o.cle.startsWith(prefixe))
        .map(({ cle, date }) => ({ cle, date })),
    lire: async (cle) => {
      const o = etat.get(cle);
      if (!o) throw new Error(`absent : ${cle}`);
      return o.contenu;
    },
    ecrire: async (cle, contenu) => {
      etat.set(cle, { cle, date: '2026-09-29T04:00:00Z', contenu });
    },
    supprimer: async (cle) => {
      etat.delete(cle);
    },
  };
}

const verdict = (issue: 'reussi' | 'echec', date: string): Verdict => ({
  date,
  verdict: issue,
  empreinteVidage: 'b'.repeat(64),
  temoin: { table: '_prisma_migrations', lignes: issue === 'reussi' ? 4 : 0, substitution: true },
  motif: issue === 'reussi' ? null : 'restauration : pg_restore sort en 1',
});

describe('REQ-QA-023 — chaque heure, ce que la plateforme dépose est rechiffré puis effacé en clair', () => {
  it('le vidage en clair devient un vidage chiffré, et le clair disparaît', async () => {
    const d = depot({
      [`${PREFIXES.depot}pg-dump-partners-1.dmp`]: {
        contenu: Buffer.from('vidage-1'),
        date: '2026-09-29T02:00:00Z',
      },
    });
    const r = await rechiffrer(d, CLE);
    expect(r).toEqual({ rechiffres: 1 });
    expect(d.etat.has(`${PREFIXES.depot}pg-dump-partners-1.dmp`)).toBe(false);
    const chiffre = d.etat.get(`${PREFIXES.chiffres}pg-dump-partners-1.dmp.chiffre`)!.contenu;
    expect(estChiffre(chiffre)).toBe(true);
    expect(dechiffrer(chiffre, CLE).toString()).toBe('vidage-1');
  });

  it('ne retouche ni les vidages déjà chiffrés, ni les verdicts', async () => {
    const d = depot({
      [`${PREFIXES.chiffres}ancien.dmp.chiffre`]: {
        contenu: chiffrer(Buffer.from('x'), CLE),
        date: '2026-09-28T00:00:00Z',
      },
      [`${PREFIXES.exercices}2026-09-01.json`]: {
        contenu: Buffer.from('{}'),
        date: '2026-09-01T00:00:00Z',
      },
    });
    expect(await rechiffrer(d, CLE)).toEqual({ rechiffres: 0 });
    expect(d.etat.size).toBe(2);
  });
});

describe('REQ-QA-023 — chaque mois, le dernier vidage chiffré est exercé, et l’échec alerte', () => {
  const deuxVidages = () =>
    depot({
      [`${PREFIXES.chiffres}a.dmp.chiffre`]: {
        contenu: chiffrer(Buffer.from('ancien'), CLE),
        date: '2026-09-28T01:00:00Z',
      },
      [`${PREFIXES.chiffres}b.dmp.chiffre`]: {
        contenu: chiffrer(Buffer.from('recent'), CLE),
        date: '2026-09-29T01:00:00Z',
      },
    });

  it('exerce le PLUS RÉCENT, écrit le verdict daté, et n’alerte pas sur réussite', async () => {
    const d = deuxVidages();
    const exerces: string[] = [];
    const alertes: ObjetAlerte[] = [];
    const v = await exercerLeDernier(d, {
      exercer: async (contenu) => {
        exerces.push(dechiffrer(contenu, CLE).toString());
        return verdict('reussi', '2026-09-29T04:00:00Z');
      },
      alerter: async (o) => void alertes.push(o),
    });
    expect(exerces).toEqual(['recent']);
    expect(v.verdict).toBe('reussi');
    expect(
      JSON.parse(d.etat.get(`${PREFIXES.exercices}2026-09-29.json`)!.contenu.toString())
    ).toEqual(v);
    expect(alertes).toEqual([]);
  });

  it('un exercice en échec écrit son verdict ET alerte, sous la catégorie close, sans donnée', async () => {
    const d = deuxVidages();
    const alertes: ObjetAlerte[] = [];
    const v = await exercerLeDernier(d, {
      exercer: async () => verdict('echec', '2026-09-29T04:00:00Z'),
      alerter: async (o) => void alertes.push(o),
    });
    expect(v.verdict).toBe('echec');
    expect(alertes).toHaveLength(1);
    expect(alertes[0]!.categorie).toBe('restauration_echouee');
    expect(alertes[0]!.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  });

  it('aucun vidage chiffré : échec nommé, verdict écrit, alerte', async () => {
    const d = depot({});
    const alertes: ObjetAlerte[] = [];
    const v = await exercerLeDernier(d, {
      exercer: async () => {
        throw new Error('ne doit pas être appelé');
      },
      alerter: async (o) => void alertes.push(o),
    });
    expect(v.verdict).toBe('echec');
    expect(v.motif).toMatch(/aucun vidage chiffré/);
    expect(alertes).toHaveLength(1);
  });
});

describe('REQ-QA-023 — chaque nuit, la fraîcheur se lit sur le dernier verdict du dépôt', () => {
  it('le verdict le plus récent est jugé : réussi dans le délai, vert', async () => {
    const d = depot({
      [`${PREFIXES.exercices}2026-08-01.json`]: {
        contenu: Buffer.from(JSON.stringify(verdict('echec', '2026-08-01T04:00:00Z'))),
        date: '2026-08-01T04:00:00Z',
      },
      [`${PREFIXES.exercices}2026-09-01.json`]: {
        contenu: Buffer.from(JSON.stringify(verdict('reussi', '2026-09-01T04:00:00Z'))),
        date: '2026-09-01T04:00:00Z',
      },
    });
    expect((await fraicheurDuDepot(d, new Date('2026-09-29T03:17:00Z'), 35)).ok).toBe(true);
  });

  it('aucun verdict : rouge', async () => {
    expect((await fraicheurDuDepot(depot({}), new Date('2026-09-29T03:17:00Z'), 35)).ok).toBe(
      false
    );
  });

  it('un verdict trop vieux : rouge', async () => {
    const d = depot({
      [`${PREFIXES.exercices}2026-07-01.json`]: {
        contenu: Buffer.from(JSON.stringify(verdict('reussi', '2026-07-01T04:00:00Z'))),
        date: '2026-07-01T04:00:00Z',
      },
    });
    expect((await fraicheurDuDepot(d, new Date('2026-09-29T03:17:00Z'), 35)).ok).toBe(false);
  });
});

describe('REQ-QA-023 — les préfixes vivent sous partners/ (décision de Williams du 2026-09-22)', () => {
  it('trois préfixes distincts, tous sous partners/', () => {
    const p = Object.values(PREFIXES);
    expect(new Set(p).size).toBe(3);
    for (const x of p) expect(x.startsWith('partners/')).toBe(true);
  });
});
