// @req REQ-DM-024
/**
 * QA-T62 (REQ-DM-024) — le rôle d'exécution, EN PROCESSUS. Les témoins d'intégration jugent la base
 * réelle, mais l'outil de mutation ne joue que les tests unitaires : ici, `@prisma/client` est simulé,
 * chaque client construit et chaque requête sont enregistrés, et chaque refus est jugé à son message
 * exact. Aucune valeur de secret n'est réelle : elles sont fabriquées à l'exécution.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';

type Requete = { sql: string; valeurs: unknown[] };
const etat = vi.hoisted(() => ({
  urls: [] as string[],
  requetes: [] as { sql: string; valeurs: unknown[] }[],
  transactions: [] as { sql: string; valeurs: unknown[] }[][],
  reponses: [] as unknown[][],
  deconnexions: 0,
}));

vi.mock('@prisma/client', () => {
  const lire = (gabarit: TemplateStringsArray, valeurs: unknown[]) => ({
    sql: gabarit.join('$').replace(/\s+/g, ' ').trim(),
    valeurs,
  });
  class FauxClient {
    constructor(o: { datasourceUrl: string }) {
      etat.urls.push(o.datasourceUrl);
    }
    // PARESSEUX, comme Prisma : une requête ne s'exécute qu'à son `await` ; placée dans un lot de
    // `$transaction`, elle est enregistrée par le lot et ne consomme aucune réponse.
    $queryRaw(gabarit: TemplateStringsArray, ...valeurs: unknown[]) {
      const r = lire(gabarit, valeurs);
      return {
        ...r,
        then(resoudre: (v: unknown) => unknown, rejeter?: (e: unknown) => unknown) {
          etat.requetes.push(r);
          return Promise.resolve(etat.reponses.shift() ?? []).then(resoudre, rejeter);
        },
      };
    }
    $executeRaw(gabarit: TemplateStringsArray, ...valeurs: unknown[]) {
      return lire(gabarit, valeurs);
    }
    async $transaction(lot: Requete[]) {
      etat.transactions.push(lot.map((x) => ({ sql: x.sql, valeurs: x.valeurs })));
      return [];
    }
    async $disconnect() {
      etat.deconnexions += 1;
    }
  }
  return { PrismaClient: FauxClient };
});

const {
  ROLE_D_EXECUTION,
  RoleDExecutionRefuse,
  constaterRoleDExecution,
  principal,
  provisionnerRoleDExecution,
  urlDuRoleDExecution,
  verificateurScram,
} = await import('../../../src/server/deploiement/role-d-execution');

const SECRET = 'a'.repeat(40);
const URL_PROPRIO = 'postgresql://proprio:mdp@hote:5432/partners';
const URL_SERVEUR = `postgresql://partners_app:${SECRET}@hote:5432/partners`;

/** L'état d'un rôle lu par le provisionnement. */
const ETAT_SAIN = {
  existe: true,
  superutilisateur: false,
  journal: false,
  tables: 0,
  courant: false,
  // SEC-50 : le journal appartient à partners_journal, et ni partners_execution ni le rôle ne peuvent
  // le réécrire (UPDATE, DELETE ou TRUNCATE sur evenements).
  possede: true,
  groupe: false,
  reecrit: false,
};
/** Le constat d'un serveur sain. */
const CONSTAT_SAIN = {
  superutilisateur: false,
  journal: false,
  execution: true,
  tables: 0,
  possede: true,
  reecrit: false,
};

beforeEach(() => {
  etat.urls.length = 0;
  etat.requetes.length = 0;
  etat.transactions.length = 0;
  etat.reponses.length = 0;
  etat.deconnexions = 0;
});

async function refus(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-024 — le vérificateur SCRAM-SHA-256, calculé côté serveur', () => {
  it('REQ-DM-024 : TÉMOIN — à sel fixe, le vérificateur égale un calcul indépendant (RFC 5802, format pg_authid)', () => {
    const sel = Buffer.alloc(16, 7);
    const sale = pbkdf2Sync(SECRET, sel, 4096, 32, 'sha256');
    const stockee = createHash('sha256')
      .update(createHmac('sha256', sale).update('Client Key').digest())
      .digest('base64');
    const serveur = createHmac('sha256', sale).update('Server Key').digest('base64');
    expect(verificateurScram(SECRET, sel)).toBe(
      `SCRAM-SHA-256$4096:${sel.toString('base64')}$${stockee}:${serveur}`
    );
  });

  it('REQ-DM-024 : sans sel fourni, deux vérificateurs du même secret diffèrent, et aucun ne contient le secret', () => {
    const a = verificateurScram(SECRET);
    expect(a).not.toBe(verificateurScram(SECRET));
    expect(a).not.toContain(SECRET);
    expect(a.startsWith('SCRAM-SHA-256$4096:')).toBe(true);
  });
});

describe('REQ-DM-024 — le nom FIXE et la forme du secret, jugés avant tout appel', () => {
  it('REQ-DM-024 : l’URL du serveur se dérive de celle du propriétaire, sous partners_app', () => {
    expect(ROLE_D_EXECUTION).toBe('partners_app');
    const u = new URL(urlDuRoleDExecution(URL_PROPRIO, SECRET));
    expect([u.username, u.password, u.host, u.pathname]).toEqual([
      'partners_app',
      SECRET,
      'hote:5432',
      '/partners',
    ]);
  });

  it('REQ-DM-024 : TÉMOIN — un autre nom est refusé, avant la construction de tout client', async () => {
    const e = await refus(
      provisionnerRoleDExecution({
        urlMigration: URL_PROPRIO,
        urlExecution: `postgresql://autre:${SECRET}@hote/partners`,
      })
    );
    expect(e).toBeInstanceOf(RoleDExecutionRefuse);
    expect(e.name).toBe('RoleDExecutionRefuse');
    expect(e.message).toBe('le rôle d’exécution est partners_app, et lui seul');
    expect(etat.urls).toEqual([]);
  });

  it.each([
    ['trop court', 'court'],
    ['hors alphabet', `${'a'.repeat(40)}'`],
  ])('REQ-DM-024 : TÉMOIN — un secret %s est refusé, sans être cité', async (_q, mauvais) => {
    const e = await refus(
      provisionnerRoleDExecution({
        urlMigration: URL_PROPRIO,
        urlExecution: `postgresql://partners_app:${encodeURIComponent(mauvais)}@hote/partners`,
      })
    );
    expect(e.message).toBe(
      'le secret du rôle d’exécution : au moins 32 caractères parmi A-Z a-z 0-9 _ . ~ -'
    );
    expect(e.message).not.toContain(mauvais);
    expect(etat.urls).toEqual([]);
  });
});

describe('REQ-DM-024 — le provisionnement : refus AVANT d’écrire, puis un lot unique', () => {
  it.each([
    [
      'le rôle de la migration',
      { courant: true },
      'le rôle d’exécution ne peut être ni superutilisateur, ni le rôle de la migration',
    ],
    [
      'un superutilisateur',
      { superutilisateur: true },
      'le rôle d’exécution ne peut être ni superutilisateur, ni le rôle de la migration',
    ],
    [
      'un membre du journal',
      { journal: true },
      'le rôle d’exécution ne peut être membre de partners_journal',
    ],
    [
      'un propriétaire de table',
      { tables: 1 },
      'le rôle d’exécution ne peut être propriétaire d’aucune table',
    ],
    [
      'un journal à un autre propriétaire',
      { possede: false },
      'le journal n’appartient pas à partners_journal',
    ],
    [
      'un journal que partners_execution peut réécrire',
      { groupe: true },
      'partners_execution peut réécrire le journal',
    ],
    [
      'un journal que le rôle d’exécution peut réécrire',
      { reecrit: true },
      'le rôle d’exécution peut réécrire le journal',
    ],
  ])('REQ-DM-024 : TÉMOIN — %s est refusé, et RIEN n’est écrit', async (_q, ecart, message) => {
    etat.reponses.push([{ ...ETAT_SAIN, ...ecart }]);
    const e = await refus(
      provisionnerRoleDExecution({ urlMigration: URL_PROPRIO, urlExecution: URL_SERVEUR })
    );
    expect(e.message).toBe(message);
    expect(etat.transactions).toEqual([]);
    expect(etat.urls).toEqual([URL_PROPRIO]);
    expect(etat.deconnexions).toBe(1);
  });

  it('REQ-DM-024 : TÉMOIN — un rôle sain : l’état est lu sous le nom lié, puis UN lot écrit, le vérificateur en paramètre', async () => {
    etat.reponses.push([ETAT_SAIN]);
    await provisionnerRoleDExecution({ urlMigration: URL_PROPRIO, urlExecution: URL_SERVEUR });
    expect(etat.urls).toEqual([URL_PROPRIO]);
    expect(etat.requetes).toHaveLength(1);
    expect(etat.requetes[0]!.valeurs.every((v) => v === 'partners_app')).toBe(true);
    expect(etat.transactions).toHaveLength(1);
    const lot = etat.transactions[0]!;
    const tous = JSON.stringify(lot);
    expect(tous).not.toContain(SECRET);
    const parametre = lot.find((x) => x.sql.includes('set_config'));
    expect(String(parametre?.valeurs[0]).startsWith('SCRAM-SHA-256$4096:')).toBe(true);
    expect(tous).toContain('GRANT partners_execution TO partners_app');
    expect(tous).toContain('GRANT SELECT ON _prisma_migrations TO partners_execution');
    expect(etat.deconnexions).toBe(1);
  });

  it('REQ-DM-024 : TÉMOIN — la boucle des droits exclut le journal par son NOM, sans le déduire de son propriétaire', async () => {
    etat.reponses.push([ETAT_SAIN]);
    await provisionnerRoleDExecution({ urlMigration: URL_PROPRIO, urlExecution: URL_SERVEUR });
    const boucle = etat.transactions[0]!.find((x) => x.sql.includes('FOR t IN'));
    expect(boucle?.sql).toContain(
      "c.relname NOT IN ('evenements', 'evenements_id_seq', '_prisma_migrations')"
    );
    expect(boucle?.sql).not.toContain('relowner');
  });

  it('REQ-DM-024 : l’état du journal est lu AVANT tout lot, dans la même requête que celui du rôle', async () => {
    etat.reponses.push([ETAT_SAIN]);
    await provisionnerRoleDExecution({ urlMigration: URL_PROPRIO, urlExecution: URL_SERVEUR });
    expect(etat.requetes).toHaveLength(1);
    const lu = etat.requetes[0]!.sql;
    expect(lu).toContain("to_regclass('public.evenements')");
    expect(lu).toContain("'UPDATE, DELETE, TRUNCATE'");
  });
});

describe('REQ-DM-024 — le constat, connecté comme le serveur', () => {
  it.each([
    ['aucune ligne', null, 'le serveur est connecté en superutilisateur'],
    ['superutilisateur', { superutilisateur: true }, 'le serveur est connecté en superutilisateur'],
    ['membre du journal', { journal: true }, 'le serveur est membre de partners_journal'],
    [
      'hors de partners_execution',
      { execution: false },
      'le serveur n’est pas membre de partners_execution',
    ],
    ['propriétaire de tables', { tables: 2 }, 'le serveur est propriétaire de tables'],
    [
      'un journal à un autre propriétaire',
      { possede: false },
      'le journal n’appartient pas à partners_journal',
    ],
    ['un journal réinscriptible', { reecrit: true }, 'le serveur peut réécrire le journal'],
  ])('REQ-DM-024 : TÉMOIN — %s : refus nommé', async (_q, ecart, message) => {
    etat.reponses.push(ecart === null ? [] : [{ ...CONSTAT_SAIN, ...ecart }]);
    const e = await refus(constaterRoleDExecution(URL_SERVEUR));
    expect(e.message).toBe(message);
    expect(etat.urls).toEqual([URL_SERVEUR]);
  });

  it('REQ-DM-024 : un serveur sain passe le constat', async () => {
    etat.reponses.push([CONSTAT_SAIN]);
    await expect(constaterRoleDExecution(URL_SERVEUR)).resolves.toBeUndefined();
  });
});

describe('REQ-DM-024 — principal, le chemin de l’entrée de l’image', () => {
  const lancer = async (
    env: Record<string, string | undefined>,
    options: { constatSeul?: boolean } = {}
  ) => {
    const ecrit: string[] = [];
    const code = await principal(env, { ...options, ecrire: (t) => void ecrit.push(t) });
    return { code, sortie: ecrit.join('') };
  };

  it('REQ-DM-024 : TÉMOIN — sans DATABASE_URL, hors constat seul, refus nommé ; en constat seul, rien à constater', async () => {
    expect(await lancer({ NODE_ENV: 'test' })).toEqual({
      code: 1,
      sortie: 'Demarrage refuse : DATABASE_URL est requise.\n',
    });
    expect(await lancer({ NODE_ENV: 'test' }, { constatSeul: true })).toEqual({
      code: 0,
      sortie: '',
    });
    expect(etat.urls).toEqual([]);
  });

  it('REQ-DM-024 : TÉMOIN — en production déclarée, l’URL de migration est exigée hors constat seul', async () => {
    const prod = { NODE_ENV: 'production', PARTNERS_ENV: 'production', DATABASE_URL: URL_SERVEUR };
    expect(await lancer(prod)).toEqual({
      code: 1,
      sortie: 'Demarrage refuse : DATABASE_MIGRATION_URL est requise en production.\n',
    });
    etat.reponses.push([CONSTAT_SAIN]);
    expect((await lancer(prod, { constatSeul: true })).code).toBe(0);
    expect(etat.urls).toEqual([URL_SERVEUR]);
  });

  it('REQ-DM-024 : TÉMOIN — avec les deux URL : provisionnement PUIS constat ; en constat seul, le constat seul', async () => {
    etat.reponses.push([ETAT_SAIN], [CONSTAT_SAIN]);
    const env = {
      NODE_ENV: 'test',
      DATABASE_MIGRATION_URL: URL_PROPRIO,
      DATABASE_URL: URL_SERVEUR,
    };
    expect((await lancer(env)).code).toBe(0);
    expect(etat.urls).toEqual([URL_PROPRIO, URL_SERVEUR]);
    etat.urls.length = 0;
    etat.reponses.push([CONSTAT_SAIN]);
    expect((await lancer(env, { constatSeul: true })).code).toBe(0);
    expect(etat.urls).toEqual([URL_SERVEUR]);
  });

  it('REQ-DM-024 : TÉMOIN — un refus nommé est écrit par l’écrivain ; une autre erreur, sans détail', async () => {
    etat.reponses.push([{ ...CONSTAT_SAIN, journal: true }]);
    const env = { NODE_ENV: 'test', DATABASE_URL: URL_SERVEUR };
    expect(await lancer(env, { constatSeul: true })).toEqual({
      code: 1,
      sortie: "Demarrage refuse : role d'execution — le serveur est membre de partners_journal.\n",
    });
    expect(await lancer({ ...env, DATABASE_URL: 'pas une url' }, { constatSeul: true })).toEqual({
      code: 1,
      sortie: "Demarrage refuse : role d'execution — erreur de la base, non imprimée.\n",
    });
  });
});
