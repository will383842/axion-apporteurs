// @req REQ-INT-032
// @req REQ-DM-035
// @req REQ-QA-035
/**
 * INT-T26 — le traitement de `candidature.recue`, en unitaire : le client signé de la route des
 * coordonnées, la création d'un apporteur `candidat` ou son rattachement, et l'attente quand la route
 * ne répond pas. La base réelle est jugée par `tests/integration/candidature-recue.spec.ts`.
 *
 * LA CHARGE est celle du producteur réel (fixture `tests/fixtures/axionia/candidature-recue.json`,
 * copie de la fixture GÉNÉRÉE par axionia) ; aucune n'est tapée ici.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import contrat from '../../../packages/contracts/contracts.v2.json';
import { refDependanceCoordonnees } from '../../../packages/contracts/api';
import { NOMS_DES_SECRETS, kidDe, type Trousseau } from '../../../src/lib/env';
import {
  ENTETE_HORODATAGE_REQUETE,
  ENTETE_SIGNATURE_REQUETE,
  PREFIXE_ATTENTE_COORDONNEES,
  clientCoordonnees,
  traiterCandidatureRecue,
  type ClientCandidature,
  type Coordonnees,
} from '../../../src/server/integrations/axionia/candidature-recue';
import {
  AttenteDeDependance,
  passerLeTravail,
  type DepotDuTravail,
  type Marque,
} from '../../../src/server/queue/workers/evenement-recu';
import { clesPii, empreinteRecherche } from '../../../src/server/securite/pii';
import fixture from '../../fixtures/axionia/candidature-recue.json';

const CHARGE = fixture.evenement.payload as { candidatureId: string };
const CANDIDATURE = CHARGE.candidatureId;
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t26-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'a'.repeat(64),
});
const SECRET_RELECTURE = 'r'.repeat(40);
const SECRET_EMISSION = 'e'.repeat(40);
const MAINTENANT_MS = Date.UTC(2026, 8, 29, 12, 0, 0);
const COORDONNEES: Coordonnees = {
  nom: 'Camille Durand',
  prenom: null,
  email: 'camille@example.test',
  telephone: '0600000000',
};

/** Une réponse de la route, signée comme axionia la signe. */
function reponseSignee(
  corps: string,
  secret = SECRET_EMISSION,
  statut = 200,
  kid: string | null = kidDe(secret)
): Response {
  const t = String(Math.floor(MAINTENANT_MS / 1000));
  const sig = createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex');
  return new Response(corps, {
    status: statut,
    headers: {
      'x-axionia-timestamp': t,
      'x-axionia-signature': sig,
      ...(kid === null ? {} : { 'x-axionia-kid': kid }),
    },
  });
}

/** Le trousseau des réponses d'axionia : sa clé d'émission, sans rotation en cours. */
const TROUSSEAU: Trousseau = { courante: SECRET_EMISSION, precedente: null };

function client(repondre: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const appels: { url: string; init: RequestInit }[] = [];
  const tirer = clientCoordonnees({
    urlAxionia: 'https://axion-ia.example',
    secretRelecture: SECRET_RELECTURE,
    trousseauEmission: TROUSSEAU,
    appeler: (async (url: URL | string, init?: RequestInit) => {
      appels.push({ url: String(url), init: init ?? {} });
      return repondre(String(url), init ?? {});
    }) as typeof fetch,
    maintenantMs: () => MAINTENANT_MS,
  });
  return { tirer, appels };
}

describe('REQ-INT-032 — le client de la route des coordonnées', () => {
  it('REQ-INT-032 : la requête est signée sur « horodatage.chemin » avec le secret de relecture, en-têtes du contrat', async () => {
    const { tirer, appels } = client(() => reponseSignee(JSON.stringify(COORDONNEES)));
    expect(await tirer(CANDIDATURE)).toEqual(COORDONNEES);
    const chemin = `/api/partners/candidatures/${CANDIDATURE}/coordonnees`;
    expect(appels[0]!.url).toBe(`https://axion-ia.example${chemin}`);
    const h = appels[0]!.init.headers as Record<string, string>;
    const t = String(Math.floor(MAINTENANT_MS / 1000));
    expect(h[ENTETE_HORODATAGE_REQUETE]).toBe(t);
    expect(h[ENTETE_SIGNATURE_REQUETE]).toBe(
      createHmac('sha256', SECRET_RELECTURE).update(`${t}.${chemin}`).digest('hex')
    );
    // Les noms d'en-têtes sont ceux que le contrat publie, pas une copie qui dériverait.
    const publies = (contrat as { $defs: Record<string, { required: string[] }> }).$defs
      .api_coordonnees_candidature_requete_entetes!.required;
    expect(publies).toEqual([ENTETE_HORODATAGE_REQUETE, ENTETE_SIGNATURE_REQUETE]);
  });

  it.each([
    [
      'une signature de réponse fausse',
      () => reponseSignee(JSON.stringify(COORDONNEES), 'x'.repeat(40)),
    ],
    ['un 404', () => reponseSignee('not_found', SECRET_EMISSION, 404)],
    ['un champ de trop', () => reponseSignee(JSON.stringify({ ...COORDONNEES, adresse: 'rue' }))],
    [
      'un champ manquant',
      () => reponseSignee(JSON.stringify({ nom: 'a', prenom: null, email: 'b' })),
    ],
    ['un corps qui n’est pas du JSON', () => reponseSignee('pas du json')],
    ['une panne réseau', () => Promise.reject(new TypeError('fetch failed'))],
  ] as const)(
    'REQ-INT-032 — TÉMOIN : %s rend « indisponible », jamais des coordonnées',
    async (_n, repondre) => {
      const { tirer } = client(repondre as () => Promise<Response>);
      expect(await tirer(CANDIDATURE)).toBeNull();
    }
  );

  it('REQ-INT-032 : l’appel est un GET qui refuse toute redirection et tout cache', async () => {
    const { tirer, appels } = client(() => reponseSignee(JSON.stringify(COORDONNEES)));
    await tirer(CANDIDATURE);
    expect(appels[0]!.init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
  });

  it('REQ-INT-032 — TÉMOIN : une réponse bien signée et conforme mais qui n’est pas un 200 est refusée', async () => {
    const { tirer } = client(() =>
      reponseSignee(JSON.stringify(COORDONNEES), SECRET_EMISSION, 201)
    );
    expect(await tirer(CANDIDATURE)).toBeNull();
  });

  it('REQ-INT-032 : sans adresse d’axionia configurée, rien ne part', async () => {
    const appels: unknown[] = [];
    const tirer = clientCoordonnees({
      urlAxionia: undefined,
      secretRelecture: SECRET_RELECTURE,
      trousseauEmission: TROUSSEAU,
      appeler: (async () => {
        appels.push(1);
        return new Response();
      }) as unknown as typeof fetch,
      maintenantMs: () => MAINTENANT_MS,
    });
    expect(await tirer(CANDIDATURE)).toBeNull();
    expect(appels).toEqual([]);
  });
});

/** Une transaction simulée qui enregistre ce qu'on lui fait. */
function base(existants: { emailHash?: string; phoneHash?: string; candidatureId?: string }[]) {
  const crees: Record<string, unknown>[] = [];
  const mises: unknown[] = [];
  const recherches: unknown[] = [];
  const correspond = (where: Record<string, unknown>) => {
    const conditions = (where['OR'] as Record<string, unknown>[] | undefined) ?? [where];
    return existants.find((e) =>
      conditions.some((c) =>
        Object.entries(c).every(([k, v]) => (e as Record<string, unknown>)[k] === v)
      )
    );
  };
  const tx = {
    apporteur: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        recherches.push(args);
        return correspond(args.where) ? { id: 'existant' } : null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        crees.push(args.data);
        return args.data;
      },
    },
    evenementRecu: {
      update: async (args: unknown) => {
        mises.push(args);
        return args;
      },
    },
  };
  let transactions = 0;
  const prisma = {
    $transaction: async (fn: (t: typeof tx) => unknown) => {
      transactions += 1;
      return fn(tx);
    },
  } as unknown as ClientCandidature;
  return { prisma, crees, mises, recherches, transactions: () => transactions };
}

const DEPS = (tirer: (id: string) => Promise<Coordonnees | null>) => ({
  tirer,
  cles: CLES,
  maintenant: () => new Date(MAINTENANT_MS),
  aleatoire: (n: number) => new Uint8Array(n).fill(7),
});
const EVENEMENT = { id: 'evt-1', charge: CHARGE };

describe('REQ-DM-035, REQ-QA-035 — un apporteur `candidat` naît, figé, dans la transaction de l’événement', () => {
  it('REQ-DM-035, REQ-QA-035 : création au statut candidat, snapshot du producteur, coordonnées CHIFFRÉES, événement traité', async () => {
    const b = base([]);
    expect(
      await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => COORDONNEES)
      )
    ).toBe('cree');
    expect(b.transactions()).toBe(1);
    const cree = b.crees[0]!;
    expect(cree).toMatchObject({
      statut: 'candidat',
      isTest: false,
      candidatureId: CANDIDATURE,
      emailHash: empreinteRecherche('courriel', COORDONNEES.email!, CLES),
      phoneHash: empreinteRecherche('telephone', COORDONNEES.telephone!, CLES),
      prenomChiffre: null,
    });
    expect(cree['emailChiffre']).toBeInstanceOf(Uint8Array);
    // Aucun clair : ni le nom, ni l'adresse, ni le téléphone ne sont écrits tels quels.
    const texte = JSON.stringify(cree, (_k, v: unknown) =>
      Buffer.isBuffer(v) ? v.toString('latin1') : v
    );
    expect(texte).not.toMatch(/Camille|Durand|camille@example|0600000000/);
    expect(b.mises).toEqual([
      {
        where: { id: 'evt-1' },
        data: { statut: 'traite', processedAt: new Date(MAINTENANT_MS), dependanceRef: null },
      },
    ]);
  });

  it('REQ-INT-032 — TÉMOIN : une personne déjà connue par son courriel est RATTACHÉE, aucune ligne créée', async () => {
    const b = base([{ emailHash: empreinteRecherche('courriel', COORDONNEES.email!, CLES) }]);
    expect(
      await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => COORDONNEES)
      )
    ).toBe('rattache');
    expect(b.crees).toEqual([]);
    expect(b.mises).toHaveLength(1);
  });

  it('REQ-INT-032 : la recherche est exacte — courriel OU candidature d’abord, puis le seul téléphone, l’identifiant seul', async () => {
    const b = base([]);
    await traiterCandidatureRecue(
      b.prisma,
      EVENEMENT,
      DEPS(async () => COORDONNEES)
    );
    const emailHash = empreinteRecherche('courriel', COORDONNEES.email!, CLES);
    const phoneHash = empreinteRecherche('telephone', COORDONNEES.telephone!, CLES);
    expect(b.recherches).toEqual([
      { where: { OR: [{ emailHash }, { candidatureId: CANDIDATURE }] }, select: { id: true } },
      { where: { phoneHash }, select: { id: true } },
    ]);
  });

  it('REQ-INT-032 : sans téléphone, aucune recherche par téléphone, et aucune empreinte de téléphone écrite', async () => {
    const b = base([]);
    expect(
      await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => ({ ...COORDONNEES, telephone: null }))
      )
    ).toBe('cree');
    expect(b.recherches).toHaveLength(1);
    expect(b.crees[0]).toMatchObject({ phoneHash: null });
  });

  it('REQ-INT-032 : connue par sa seule candidature (autre courriel), elle est rattachée', async () => {
    const b = base([{ candidatureId: CANDIDATURE }]);
    expect(
      await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => COORDONNEES)
      )
    ).toBe('rattache');
    expect(b.crees).toEqual([]);
    expect(b.recherches).toHaveLength(1);
  });

  it('REQ-INT-032 : connue par son seul téléphone, elle est rattachée aussi', async () => {
    const b = base([{ phoneHash: empreinteRecherche('telephone', COORDONNEES.telephone!, CLES) }]);
    expect(
      await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => COORDONNEES)
      )
    ).toBe('rattache');
    expect(b.crees).toEqual([]);
  });

  it.each([
    ['la route ne répond pas', null],
    ['la route rend une candidature sans adresse', { ...COORDONNEES, email: null }],
  ] as const)(
    'REQ-INT-032 — TÉMOIN : %s → en attente de `coordonnees:<id>`, aucun apporteur',
    async (_n, rendu) => {
      const b = base([]);
      const erreur = await traiterCandidatureRecue(
        b.prisma,
        EVENEMENT,
        DEPS(async () => rendu)
      ).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(AttenteDeDependance);
      expect((erreur as AttenteDeDependance).ref).toBe(refDependanceCoordonnees(CANDIDATURE));
      expect(b.transactions()).toBe(0);
    }
  );
});

describe('REQ-INT-032 — le travail de fond sait attendre une route, et la reprendre', () => {
  function depot(): { d: DepotDuTravail; marques: [string, Marque][] } {
    const marques: [string, Marque][] = [];
    let donne = false;
    return {
      marques,
      d: {
        aTraiter: async () => {
          if (donne) return [];
          donne = true;
          return [
            {
              id: 'evt-1',
              eventType: TypeEvenementRecu.candidature_recue,
              sujetRef: null,
              charge: CHARGE,
              retryCount: 0,
            },
          ];
        },
        parentTraite: async () => false,
        marquer: async (id, m) => {
          marques.push([id, m]);
        },
        reveiller: async () => 0,
        battre: async () => undefined,
      },
    };
  }

  it('REQ-INT-032 : une AttenteDeDependance passe l’événement en attente, jamais en erreur ; la reprise est comptée', async () => {
    const { d, marques } = depot();
    let reprises = 0;
    const compteurs = await passerLeTravail({
      depot: d,
      dispatch: async () => {
        throw new AttenteDeDependance(refDependanceCoordonnees(CANDIDATURE));
      },
      reprendre: async () => {
        reprises += 1;
        return 2;
      },
      maintenant: () => new Date(MAINTENANT_MS),
    });
    expect(marques).toEqual([
      [
        'evt-1',
        { statut: 'en_attente_dependance', dependanceRef: refDependanceCoordonnees(CANDIDATURE) },
      ],
    ]);
    expect(compteurs).toMatchObject({ enAttente: 1, enErreur: 0, reveilles: 2 });
    expect(reprises).toBe(1);
  });

  it('le préfixe repris est celui que pose le contrat', () => {
    expect(refDependanceCoordonnees(CANDIDATURE).startsWith(PREFIXE_ATTENTE_COORDONNEES)).toBe(
      true
    );
    expect(PREFIXE_ATTENTE_COORDONNEES).toBe('coordonnees:');
  });
});

describe('REQ-QA-030 — la réponse d’axionia est jugée sous la clé que désigne son kid', () => {
  const PRECEDENTE = 'p'.repeat(40);
  const corps = JSON.stringify(COORDONNEES);
  const tirerAvec = (trousseau: Trousseau, reponse: Response) =>
    clientCoordonnees({
      urlAxionia: 'https://axion-ia.example',
      secretRelecture: SECRET_RELECTURE,
      trousseauEmission: trousseau,
      appeler: (async () => reponse) as unknown as typeof fetch,
      maintenantMs: () => MAINTENANT_MS,
    })(CANDIDATURE);

  it('REQ-QA-030 : signée par la clé précédente avant son échéance, la réponse est acceptée ; après, refusée', async () => {
    const avant: Trousseau = {
      courante: SECRET_EMISSION,
      precedente: { valeur: PRECEDENTE, echeanceMs: MAINTENANT_MS + 1 },
    };
    const echue: Trousseau = {
      courante: SECRET_EMISSION,
      precedente: { valeur: PRECEDENTE, echeanceMs: MAINTENANT_MS },
    };
    expect(await tirerAvec(avant, reponseSignee(corps, PRECEDENTE))).toEqual(COORDONNEES);
    expect(await tirerAvec(echue, reponseSignee(corps, PRECEDENTE))).toBeNull();
  });

  it('REQ-QA-030 : une réponse sans kid est refusée, même bien signée par la clé courante', async () => {
    expect(await tirerAvec(TROUSSEAU, reponseSignee(corps, SECRET_EMISSION, 200, null))).toBeNull();
    expect(await tirerAvec(TROUSSEAU, reponseSignee(corps))).toEqual(COORDONNEES);
  });
});
