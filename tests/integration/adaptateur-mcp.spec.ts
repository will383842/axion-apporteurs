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
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

const SECRET = 'secret-de-garde-du-test-mcp-0123456789abcdef';

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
    const r = await traiterAppelMcp(requete(SECRET, LISTE), options({}, l.limiteur));
    expect(r.status).toBe(503);
    expect(l.appels()).toBe(0);
  });

  it('REQ-INT-026 — secret faux : 401 ; en-tête absent : 401 ; le limiteur a compté chaque appel', async () => {
    const l = limiteurQuiRend(ADMIS);
    const env = { [VARIABLE_DU_SECRET]: SECRET };
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
    const r = await traiterAppelMcp(
      requete(SECRET, LISTE),
      options({ [VARIABLE_DU_SECRET]: SECRET }, l.limiteur)
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  });

  it('REQ-INT-026 — limiteur AVANT la serrure : un refus du limiteur rend 429 au secret faux comme au bon', async () => {
    const env = { [VARIABLE_DU_SECRET]: SECRET };
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
    const env = { [VARIABLE_DU_SECRET]: SECRET };
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
    const avant = process.env[VARIABLE_DU_SECRET];
    try {
      delete process.env[VARIABLE_DU_SECRET];
      const { POST, GET } = await import('../../src/app/api/mcp/route');
      expect((await POST(requete(SECRET, LISTE))).status).toBe(503);
      process.env[VARIABLE_DU_SECRET] = SECRET;
      expect((await POST(requete(SECRET, LISTE))).status).toBe(503);
      expect(GET().status).toBe(405);
    } finally {
      if (avant === undefined) delete process.env[VARIABLE_DU_SECRET];
      else process.env[VARIABLE_DU_SECRET] = avant;
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
      porte: (a) => (req, o) => a.porte(req, { ...o, environnement: {} }),
    },
    {
      nom: 'avec un secret faux',
      porte: (a) => (req, o) =>
        a.porte(req, {
          ...o,
          environnement: { [VARIABLE_DU_SECRET]: 'un-autre-secret-que-celui-du-harnais' },
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

  it('REQ-INT-026 — la commande : `pnpm harnais-mcp` sort en 0 et imprime chaque contrôle', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/gates/harnais-mcp.ts'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    for (let n = 1; n <= 9; n += 1) expect(r.stdout).toMatch(new RegExp(`n°${n} `));
  }, 120_000);
});
