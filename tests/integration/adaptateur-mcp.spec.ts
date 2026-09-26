// @req REQ-INT-026
/**
 * INT-T11 — l'adaptateur MCP fédéré `partners` : la porte `POST /api/mcp`, sa serrure, le contrat du
 * socle porté, le manifeste versionné, et le harnais des neuf contrôles.
 *
 * CE QUE CHAQUE BLOC JUGE, ET PAR QUEL ACTE.
 *   — La porte : sans secret configuré 503, secret faux 401, en-tête absent 401, bon secret 200, et
 *     le limiteur AVANT la serrure — un limiteur qui refuse rend 429 même au secret faux, et il est
 *     consulté exactement une fois. La route servie par Next, sans compteur déclaré, refuse (503).
 *   — Le contrat : le sceau des profils est RECALCULÉ depuis l'énumération portée, avec
 *     l'algorithme du socle, et confronté au sceau exécuté depuis le socle.
 *   — Le manifeste : le fichier versionné est ce que le code produit, octet canonique pour octet ;
 *     un fichier altéré est un refus NOMMÉ ; un manifeste sans outil est refusé par la règle du
 *     socle, et ce refus est écrit dans le fichier, pas adapté en silence.
 *   — Le harnais, à deux faces : contre l'adaptateur du dépôt il rend 0 et nomme ses neuf
 *     contrôles ; privé de son secret, avec un secret faux, ou le limiteur après la serrure, il rend
 *     un code non nul en nommant le contrôle en défaut.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { NOMS_DES_SECRETS, lireEnvironnement } from '../../src/lib/env';
import type { OutilQuelconque } from '../../src/server/mcp/socle';
import type { VerdictDeLimite } from '../../src/server/securite/rate-limit';
import {
  ENTETE_DU_SECRET,
  VARIABLE_DU_SECRET,
  traiterAppelMcp,
  type LimiteurMcp,
  type OptionsDeLaPorte,
} from '../../src/server/mcp/porte';
import { PROFILS_DU_SOCLE, SCEAU_PROFILS } from '../../src/server/mcp/socle';
import { canoniser } from '../../src/server/mcp/json-canonique';
import {
  analyserOutils,
  confronterManifesteVersionne,
  documentDuManifeste,
} from '../../src/server/mcp/manifeste';
import { OUTILS } from '../../src/server/mcp/registre';
import {
  adaptateurDuDepot,
  executerHarnais,
  type AdaptateurSoumis,
} from '../../scripts/gates/harnais-mcp';

/**
 * Un environnement de secrets COMPLET et valide : la porte juge son secret avec tous les autres
 * (REQ-SEC-028 : distincts, au moins 32 octets). Chaque valeur est tirée au hasard, jamais écrite.
 */
function secretsTemoins(): Record<string, string> {
  return Object.fromEntries(
    [...NOMS_DES_SECRETS, VARIABLE_DU_SECRET].map((n) => [n, randomBytes(32).toString('hex')])
  );
}
const ENV = secretsTemoins();
const SECRET = ENV[VARIABLE_DU_SECRET] as string;

const ADMIS: VerdictDeLimite = {
  autorise: true,
  restant: 1,
  repriseAt: null,
  panne: false,
  motif: 'admis',
};
const LIMITE_ATTEINTE: VerdictDeLimite = {
  autorise: false,
  restant: 0,
  repriseAt: null,
  panne: false,
  motif: 'limite_atteinte',
};

function limiteurQuiRend(verdict: VerdictDeLimite): {
  limiteur: LimiteurMcp;
  appels: () => number;
} {
  let appels = 0;
  return {
    limiteur: async () => {
      appels += 1;
      return verdict;
    },
    appels: () => appels,
  };
}

function requete(secret: string | null, corps: unknown): Request {
  const entetes: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) entetes[ENTETE_DU_SECRET] = secret;
  return new Request('https://partners.test/api/mcp', {
    method: 'POST',
    headers: entetes,
    body: JSON.stringify(corps),
  });
}

const LISTE = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

function options(
  environnement: Record<string, string | undefined>,
  limiteur: LimiteurMcp
): OptionsDeLaPorte {
  return { environnement, limiteur, maintenantMs: 1_758_800_000_000 };
}

describe('REQ-INT-026 — la porte, sa serrure, et le limiteur avant la serrure', () => {
  it('REQ-INT-026 — sans secret configuré : 503, et le limiteur n’est même pas consulté', async () => {
    const l = limiteurQuiRend(ADMIS);
    const sans = { ...ENV, [VARIABLE_DU_SECRET]: undefined };
    const r = await traiterAppelMcp(requete(SECRET, LISTE), options(sans, l.limiteur));
    expect(r.status).toBe(503);
    expect(l.appels()).toBe(0);
    // Une chaîne vide n'est pas un secret configuré.
    const vide = { ...ENV, [VARIABLE_DU_SECRET]: '' };
    expect((await traiterAppelMcp(requete('', LISTE), options(vide, l.limiteur))).status).toBe(503);
    expect(l.appels()).toBe(0);
  });

  it('REQ-INT-026, REQ-SEC-028 — le secret suit les règles des secrets : trop court, égal à un autre, préfixe de développement en production → 503', async () => {
    const l = limiteurQuiRend(ADMIS);
    const autre = NOMS_DES_SECRETS[0] as string;
    const fautifs: [string, Record<string, string | undefined>][] = [
      ['trop court', { ...ENV, [VARIABLE_DU_SECRET]: 'court' }],
      ['égal à un autre secret', { ...ENV, [VARIABLE_DU_SECRET]: ENV[autre] }],
      [
        'préfixe dev_ en production',
        { ...ENV, NODE_ENV: 'production', [VARIABLE_DU_SECRET]: `dev_${SECRET}` },
      ],
    ];
    for (const [quoi, env] of fautifs) {
      const secret = env[VARIABLE_DU_SECRET] as string;
      const r = await traiterAppelMcp(requete(secret, LISTE), options(env, l.limiteur));
      expect(r.status, quoi).toBe(503);
      const lu = lireEnvironnement(env);
      expect(lu.ok, quoi).toBe(false);
      expect(lu.ok ? [] : lu.refus.map((x) => x.variable), quoi).toContain(VARIABLE_DU_SECRET);
    }
    expect(l.appels()).toBe(0);
  });

  it('REQ-INT-026 — un appelant anonyme ne distingue pas « secret non configuré » de « limiteur en panne »', async () => {
    const sans = { ...ENV, [VARIABLE_DU_SECRET]: undefined };
    const a = await traiterAppelMcp(
      requete(null, LISTE),
      options(sans, limiteurQuiRend(ADMIS).limiteur)
    );
    const panne = limiteurQuiRend({ ...LIMITE_ATTEINTE, panne: true, motif: 'cache_indisponible' });
    const b = await traiterAppelMcp(requete(null, LISTE), options(ENV, panne.limiteur));
    expect([a.status, b.status]).toEqual([503, 503]);
    expect(await a.text()).toBe(await b.text());
  });

  it('REQ-INT-026 — un corps au-delà de la borne est refusé (413), même derrière la bonne serrure', async () => {
    const l = limiteurQuiRend(ADMIS);
    const gros = { ...LISTE, bourrage: 'x'.repeat(200 * 1024) };
    const r = await traiterAppelMcp(requete(SECRET, gros), options(ENV, l.limiteur));
    expect(r.status).toBe(413);
  });

  it('REQ-INT-026 — la serrure compare à TEMPS CONSTANT, par la primitive partagée avec la frontière axionia', () => {
    const primitive = readFileSync('src/server/securite/primitives-de-porte.ts', 'utf8');
    expect(primitive).toMatch(/timingSafeEqual\(/);
    for (const f of [
      'src/server/mcp/porte.ts',
      'src/server/integrations/axionia/api-entrante.ts',
    ]) {
      const source = readFileSync(f, 'utf8');
      expect(source, f).toMatch(/egalATempsConstant\(/);
      expect(source, f).not.toMatch(/timingSafeEqual/);
    }
  });

  it('REQ-INT-026 — secret faux : 401 ; en-tête absent : 401 ; le limiteur a compté chaque appel', async () => {
    const l = limiteurQuiRend(ADMIS);
    const env = ENV;
    expect(
      (await traiterAppelMcp(requete('pas-le-bon', LISTE), options(env, l.limiteur))).status
    ).toBe(401);
    expect((await traiterAppelMcp(requete(null, LISTE), options(env, l.limiteur))).status).toBe(
      401
    );
    expect(l.appels()).toBe(2);
  });

  it('REQ-INT-026 — bon secret : 200, JSON-RPC, et le manifeste de phase 0 n’expose aucun outil', async () => {
    const l = limiteurQuiRend(ADMIS);
    const r = await traiterAppelMcp(requete(SECRET, LISTE), options(ENV, l.limiteur));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  });

  it('REQ-INT-026 — limiteur AVANT la serrure : un refus du limiteur rend 429 au secret faux comme au bon', async () => {
    const env = ENV;
    const faux = limiteurQuiRend(LIMITE_ATTEINTE);
    expect(
      (await traiterAppelMcp(requete('pas-le-bon', LISTE), options(env, faux.limiteur))).status
    ).toBe(429);
    expect(faux.appels()).toBe(1);
    const bon = limiteurQuiRend(LIMITE_ATTEINTE);
    expect((await traiterAppelMcp(requete(SECRET, LISTE), options(env, bon.limiteur))).status).toBe(
      429
    );
  });

  it('REQ-INT-026 — un limiteur en panne ou qui lève FERME la porte : 503, jamais 200', async () => {
    const env = ENV;
    const panne = limiteurQuiRend({ ...LIMITE_ATTEINTE, panne: true, motif: 'cache_indisponible' });
    expect(
      (await traiterAppelMcp(requete(SECRET, LISTE), options(env, panne.limiteur))).status
    ).toBe(503);
    const leve: LimiteurMcp = async () => {
      throw new Error('cache tombé');
    };
    expect((await traiterAppelMcp(requete(SECRET, LISTE), options(env, leve))).status).toBe(503);
  });

  it('REQ-INT-026 — la route servie par Next : 503 sans secret, 503 avec secret tant qu’aucun compteur n’est déclaré', async () => {
    // L'environnement n'est pas LU ici : il est posé par la doublure de vitest, puis restauré.
    try {
      for (const [nom, valeur] of Object.entries(ENV)) vi.stubEnv(nom, valeur);
      vi.stubEnv(VARIABLE_DU_SECRET, '');
      const { POST, GET } = await import('../../src/app/api/mcp/route');
      expect((await POST(requete(SECRET, LISTE))).status).toBe(503);
      vi.stubEnv(VARIABLE_DU_SECRET, SECRET);
      expect((await POST(requete(SECRET, LISTE))).status).toBe(503);
      expect(GET().status).toBe(405);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('REQ-INT-026 — le contrat du socle porté, et le sceau des profils vérifié', () => {
  it('REQ-INT-026 — le sceau recalculé depuis l’énumération portée est le sceau exécuté depuis le socle', () => {
    const canonique = canoniser({
      version: SCEAU_PROFILS.version,
      profils: PROFILS_DU_SOCLE.map((p) => ({ nom: p.nom, depuis: p.depuis })),
    });
    expect(createHash('sha256').update(canonique, 'utf8').digest('hex')).toBe(
      SCEAU_PROFILS.empreinte
    );
  });
});

describe('REQ-INT-026 — le manifeste versionné, et le refus nommé', () => {
  it('REQ-INT-026 — un manifeste sans outil est refusé par la règle du socle, et le document le DIT', () => {
    expect(OUTILS).toHaveLength(0);
    const analyse = analyserOutils(OUTILS);
    expect(analyse.manifeste).toBeNull();
    expect(analyse.anomalies).toEqual(["tools : vide — un adaptateur sans outil n'expose rien."]);
    const doc = documentDuManifeste(analyse);
    expect(doc.etat).toBe('refuse');
    expect(doc.refus).toEqual(analyse.anomalies);
    expect(doc.manifestSha).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('REQ-INT-026 — le fichier versionné est ce que le code produit ; altéré, il est un refus nommé', () => {
    expect(confronterManifesteVersionne()).toEqual([]);
    const doc = documentDuManifeste(analyserOutils(OUTILS));
    const altere = JSON.parse(JSON.stringify(doc)) as { manifeste: { version: string } };
    altere.manifeste.version = '9.9.9';
    const refus = confronterManifesteVersionne(altere);
    expect(refus.length).toBeGreaterThan(0);
    expect(refus.join(' ')).toMatch(/manifeste_diverge/);
    const ajoute = { ...(JSON.parse(JSON.stringify(doc)) as object), ajout: 1 };
    expect(confronterManifesteVersionne(ajoute).join(' ')).toMatch(/champ « ajout » inconnu/);
  });
});

describe('REQ-INT-026 — le harnais des neuf contrôles, à deux faces', () => {
  it('REQ-INT-026 — contre l’adaptateur du dépôt : code 0, les neuf contrôles nommés avec leur résultat', async () => {
    const rapport = await executerHarnais(adaptateurDuDepot());
    const numeros = rapport.controles.map((c) => c.numero).filter((n) => n >= 1);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const c of rapport.controles) {
      expect(c.libelle.length, `contrôle ${c.numero} sans libellé`).toBeGreaterThan(0);
      expect(
        c.detail.length,
        `contrôle ${c.numero} ne dit pas ce qu’il a confronté`
      ).toBeGreaterThan(0);
    }
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.code).toBe(0);
  });

  const DEFAUTS: { nom: string; porte: (a: AdaptateurSoumis) => AdaptateurSoumis['porte'] }[] = [
    {
      nom: 'privé de son secret',
      porte: (a) => (req, o) =>
        a.porte(req, {
          ...o,
          environnement: { ...o.environnement, [VARIABLE_DU_SECRET]: undefined },
        }),
    },
    {
      nom: 'avec un secret faux',
      porte: (a) => (req, o) =>
        a.porte(req, {
          ...o,
          environnement: {
            ...o.environnement,
            [VARIABLE_DU_SECRET]: randomBytes(32).toString('hex'),
          },
        }),
    },
    {
      nom: 'le limiteur placé après la serrure',
      porte: (a) => async (req, o) => {
        if (req.headers.get(ENTETE_DU_SECRET) !== o.environnement[VARIABLE_DU_SECRET]) {
          return new Response(null, { status: 401 });
        }
        return a.porte(req, o);
      },
    },
  ];

  for (const d of DEFAUTS) {
    it(`REQ-INT-026 — ${d.nom} : code non nul, et le contrôle en défaut est NOMMÉ`, async () => {
      const depot = adaptateurDuDepot();
      const rapport = await executerHarnais({ ...depot, porte: d.porte(depot) });
      expect(rapport.code).not.toBe(0);
      const rouges = rapport.controles.filter((c) => c.anomalies.length > 0).map((c) => c.numero);
      expect(rouges).toEqual([8]);
      expect(rapport.anomalies.join(' ')).toMatch(/contrôle 8/);
    });
  }

  it('REQ-INT-026 — une porte qui consulte le limiteur DEUX fois rougit le contrôle 8, nommé', async () => {
    const depot = adaptateurDuDepot();
    const rapport = await executerHarnais({
      ...depot,
      porte: async (req, o) => {
        await o.limiteur(req.clone(), o.maintenantMs);
        return depot.porte(req, o);
      },
    });
    expect(rapport.code).toBe(1);
    expect(rapport.anomalies.join(' ')).toMatch(/contrôle 8 .*consulté 2 fois/);
  });

  it('REQ-INT-026 — le contrôle 8 annonce ses cinq appels, et le contrôle 9 son plancher', async () => {
    const rapport = await executerHarnais(adaptateurDuDepot());
    const huit = rapport.controles.find((c) => c.numero === 8);
    expect([huit?.mesures, huit?.plancher]).toEqual([5, 5]);
    const moins = adaptateurDuDepot();
    const tronque = await executerHarnais({ ...moins, fichiers: moins.fichiers.slice(1) });
    expect(tronque.code).toBe(1);
    expect(tronque.anomalies.join(' ')).toMatch(/contrôle 9 .*sous le plancher/);
  });

  it('REQ-INT-026 — contrôle 2 : chacun des quatre motifs d’accès à un secret, injecté dans un fichier, rougit', async () => {
    const P = 'proc' + 'ess';
    const D = 'dot' + 'env';
    const sources = [
      `const v = ${P}.env.X;`,
      `const v = ${P}['env'];`,
      `import '${D}';`,
      `lire('.env');`,
    ];
    for (const source of sources) {
      const depot = adaptateurDuDepot();
      const rapport = await executerHarnais({
        ...depot,
        fichiers: [...depot.fichiers, { chemin: 'src/server/mcp/fautif.ts', source }],
      });
      const deux = rapport.controles.find((c) => c.numero === 2);
      expect(deux?.anomalies.length, source).toBe(1);
    }
  });
});

/** Un outil témoin VALIDE, sur lequel un test greffe UNE faute. */
function outilTemoin(surcharge: Partial<OutilQuelconque>): OutilQuelconque {
  return {
    name: 'temoin.lecture',
    version: '1.0.0',
    description: 'Témoin de garde.',
    effect: 'read',
    dataClass: 'internal',
    idempotency: 'n/a',
    pagination: 'none',
    input: z.strictObject({ limite: z.number().int().optional() }),
    output: z.strictObject({
      items: z.array(z.strictObject({ id: z.string(), extra: z.string().optional() })),
    }),
    maxBytes: 1024,
    compaction: { free: [], tier2: ['extra'], aggregateBy: null },
    idFields: ['id'],
    governanceFields: [],
    fixtureMax: 'fixtures/temoin.json',
    handler: async () => ({ items: [] }),
    ...surcharge,
  };
}

describe('REQ-INT-026 — chaque contrôle par outil rougit de SA règle, sur un outil injecté', () => {
  const avecOutil = async (outil: OutilQuelconque) =>
    executerHarnais({ ...adaptateurDuDepot(), outils: [outil], perimetreVide: null });
  const anomaliesDe = (r: Awaited<ReturnType<typeof avecOutil>>, cle: string) =>
    r.controles.find((c) => c.cle === cle)?.anomalies ?? [];

  it('REQ-INT-026 — § 13.3 : un champ de rang 2 OBLIGATOIRE rougit tier2-optionnel', async () => {
    const r = await avecOutil(
      outilTemoin({
        output: z.strictObject({
          items: z.array(z.strictObject({ id: z.string(), extra: z.string() })),
        }),
      })
    );
    expect(anomaliesDe(r, 'tier2-optionnel').join(' ')).toMatch(/extra/);
  });

  it('REQ-INT-026 — contrôle 7 : un nom réservé dans l’entrée rougit autorisation-hors-input', async () => {
    const r = await avecOutil(outilTemoin({ input: z.strictObject({ principal: z.string() }) }));
    expect(anomaliesDe(r, 'autorisation-hors-input').join(' ')).toMatch(/principal/);
  });

  it('REQ-INT-026 — contrôles 1 et 5 : effect inconnu, préfixe saisi', async () => {
    const un = await avecOutil(outilTemoin({ effect: 'lire' as never }));
    expect(anomaliesDe(un, 'effect-dataclass').join(' ')).toMatch(/effect/);
    const cinq = await avecOutil(outilTemoin({ name: 'partners.temoin' }));
    expect(anomaliesDe(cinq, 'prefixes-derives').join(' ')).toMatch(/préfixe/);
  });
});

describe('REQ-INT-026 — le périmètre vide n’est admis QUE déclaré, motivé et repris', () => {
  const cas: [string, (a: AdaptateurSoumis) => AdaptateurSoumis, RegExp][] = [
    ['vide non déclaré', (a) => ({ ...a, perimetreVide: null }), /perimetre_vide_non_declare/],
    [
      'motif trop court',
      (a) => ({ ...a, perimetreVide: { motif: 'trop court', tache: 'INT-T13' } }),
      /perimetre_vide_sans_motif/,
    ],
    [
      'tâche repreneuse absente du backlog',
      (a) => ({ ...a, perimetreVide: { motif: 'x'.repeat(30), tache: 'INT-T99' } }),
      /perimetre_vide_sans_repreneur : INT-T99 absente/,
    ],
    [
      'tâche repreneuse déjà livrée',
      (a) => ({
        ...a,
        taches: a.taches.map((t) => (t.id === 'INT-T13' ? { ...t, statut: 'fusionnee' } : t)),
      }),
      /perimetre_vide_sans_repreneur : INT-T13 est livrée/,
    ],
    [
      'tâche repreneuse sans REQ-INT-027',
      (a) => ({ ...a, perimetreVide: { motif: 'x'.repeat(30), tache: 'INT-T11' } }),
      /perimetre_vide_sans_repreneur : INT-T11 ne porte pas REQ-INT-027/,
    ],
    [
      'outil inscrit et vide toujours déclaré',
      (a) => ({ ...a, outils: [outilTemoin({})] }),
      /perimetre_vide_perime/,
    ],
  ];
  for (const [quoi, fauter, famille] of cas) {
    it(`REQ-INT-026 — ${quoi} : code 1, famille nommée`, async () => {
      const rapport = await executerHarnais(fauter(adaptateurDuDepot()));
      expect(rapport.code).toBe(1);
      expect(rapport.anomalies.join(' ')).toMatch(famille);
    });
  }

  it('REQ-INT-026 — la commande : `pnpm harnais-mcp` sort en 0 et imprime chaque contrôle', () => {
    const r = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/harnais-mcp.ts'],
      { encoding: 'utf8' }
    );
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    for (let n = 1; n <= 9; n += 1) expect(r.stdout).toMatch(new RegExp(`n°${n} `));
  }, 120_000);
});
