// @req REQ-QA-020
/**
 * sondes-client-unique.spec.ts — QA-T04 : ce que la sonde `readyz` fait de ses clients et de ses
 * lignes de migration, jugé sans démon Docker.
 *
 * `readyz` est public. Ouvrir une connexion de cache neuve à chaque appel en ferait un amplificateur
 * bon marché (revue `securite` de la PR 130) : le client du cache est UNIQUE par adresse, gardé d'un
 * appel à l'autre, remplacé seulement s'il est mort, et fermé par `fermerSondes`.
 *
 * Une ligne de migration ÉCHOUÉE (fin nulle) ou ANNULÉE (annulation posée) n'est pas une migration
 * appliquée : `readyz` doit nommer les migrations en défaut (revue `mutation` de la PR 130). Et une
 * sonde qui pend est coupée à DEUX secondes, écrites ici en toutes lettres.
 *
 * Le client du cache et celui de la base sont REMPLACÉS par des doublures qui comptent : c'est la
 * seule façon de voir une connexion ouverte sans un vrai serveur. Le vrai client est joué, contre un
 * vrai conteneur, par `tests/integration/sondes-de-vie.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Ligne = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

const etat = vi.hoisted(() => ({
  clients: [] as { status: string; deconnexions: number }[],
  pingPend: false,
  lignes: [] as Ligne[],
}));

vi.mock('ioredis', () => {
  class CacheDouble {
    status = 'wait';
    deconnexions = 0;
    constructor() {
      etat.clients.push(this);
    }
    on() {
      return this;
    }
    async connect() {
      this.status = 'ready';
    }
    ping() {
      return etat.pingPend ? new Promise<string>(() => undefined) : Promise.resolve('PONG');
    }
    disconnect() {
      this.deconnexions++;
      this.status = 'end';
    }
  }
  return { default: CacheDouble };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    async $queryRaw(morceaux: TemplateStringsArray) {
      return /SELECT 1\b/.test(morceaux.join('?')) ? [{ un: 1 }] : etat.lignes;
    }
    async $disconnect() {}
  },
}));

const { fermerSondes, verifierDisponibilite } =
  await import('../../../src/server/sante/disponibilite');

const MIGRATIONS = mkdtempSync(join(tmpdir(), 'qat04-migrations-'));
for (const m of ['20260101000000_une', '20260102000000_deux']) {
  mkdirSync(join(MIGRATIONS, m));
  writeFileSync(join(MIGRATIONS, m, 'migration.sql'), 'SELECT 1;\n');
}
afterAll(() => rmSync(MIGRATIONS, { recursive: true, force: true }));

const ENV = {
  DATABASE_URL: 'postgresql://partners@localhost:5432/partners',
  REDIS_URL: 'redis://localhost:6379',
};
const FAITE = new Date('2026-01-01T00:00:00Z');
const appliquee = (migration_name: string): Ligne => ({
  migration_name,
  finished_at: FAITE,
  rolled_back_at: null,
});

beforeEach(async () => {
  await fermerSondes();
  etat.clients.length = 0;
  etat.pingPend = false;
  etat.lignes = [appliquee('20260101000000_une'), appliquee('20260102000000_deux')];
});

describe('REQ-QA-020 — readyz garde UN client de cache par adresse', () => {
  it('REQ-QA-020 : cinq appels, un seul client ouvert ; fermerSondes le ferme ; l’appel suivant en ouvre un', async () => {
    for (let i = 0; i < 5; i++) {
      const e = await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
      expect(e.sousSystemes.cache).toBe('ok');
    }
    expect(etat.clients).toHaveLength(1);
    await fermerSondes();
    expect(etat.clients[0]?.deconnexions).toBe(1);
    await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    expect(etat.clients).toHaveLength(2);
  });

  it('REQ-QA-020 : un client MORT est remplacé, et un seul à la fois', async () => {
    await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    etat.clients[0]!.status = 'end';
    await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    expect(etat.clients).toHaveLength(2);
  });

  it('REQ-QA-020 : une sonde qui pend est coupée à deux secondes, et le cache est nommé en défaut', async () => {
    etat.pingPend = true;
    const debut = Date.now();
    const e = await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    const duree = Date.now() - debut;
    expect(e.enDefaut).toEqual(['environnement', 'cache']);
    expect(duree).toBeGreaterThanOrEqual(1_900);
    expect(duree).toBeLessThan(3_000);
  }, 10_000);
});

describe('REQ-QA-020 — une migration échouée ou annulée n’est pas appliquée', () => {
  it('REQ-QA-020 : toutes les migrations du disque terminées — migrations ok', async () => {
    const e = await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    expect(e.sousSystemes.migrations).toBe('ok');
  });

  it('REQ-QA-020 : une ligne échouée (fin nulle) — migrations en défaut', async () => {
    etat.lignes = [
      appliquee('20260101000000_une'),
      { migration_name: '20260102000000_deux', finished_at: null, rolled_back_at: null },
    ];
    const e = await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    expect(e.sousSystemes.migrations).toBe('en_defaut');
  });

  it('REQ-QA-020 : une ligne annulée (annulation posée) — migrations en défaut', async () => {
    etat.lignes = [
      appliquee('20260101000000_une'),
      { migration_name: '20260102000000_deux', finished_at: FAITE, rolled_back_at: FAITE },
    ];
    const e = await verifierDisponibilite({ env: ENV, dossierMigrations: MIGRATIONS });
    expect(e.sousSystemes.migrations).toBe('en_defaut');
  });
});
