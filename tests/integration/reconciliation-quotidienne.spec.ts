// @req REQ-INT-012
// @req REQ-INT-013
// @req REQ-QA-026
/**
 * INT-T08-P — le client de relecture de Partners et la réconciliation quotidienne.
 *
 * Partners relit la file de sortie d'axion-ia depuis le dernier `after_sequence` REÇU (lu en base
 * réelle), dans des bornes nommées ; tout événement relu qui n'a jamais été reçu est un TROU : il est
 * signalé, et son rejeu est demandé à axion-ia sous son identifiant d'origine (la réception de
 * Partners le déduplique). Une relecture qui échoue est signalée, et le passage échoue — son
 * battement le dit.
 *
 * L'AUTRE CÔTÉ. `axionia` ci-dessous rejoue la sémantique des deux routes RÉELLES d'axion-ia
 * (`src/server/partners-sync/relecture.ts` et `reconciliation.ts`, lues sur sa branche principale le
 * 2026-10-03) : signature de la requête sur `<t>.<cible>` (et `\n<corps>` pour le rejeu) sous le
 * secret de relecture, réponse signée sur `<t>.<corps>` sous le secret d'émission, NDJSON des corps
 * stockés, en-têtes `X-Axionia-Derniere-Sequence` et `X-Axionia-Suite`. Les corps sont ceux de la
 * fixture du producteur réel (RM-03), tels quels.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { kidDe, type Trousseau } from '../../src/lib/env';
import { TACHES } from '../../src/server/taches/registre';
import {
  CHEMIN_RELECTURE,
  LIMITE_PAR_PAGE,
  clientRelecture,
} from '../../src/server/integrations/axionia/relecture';
import {
  CHEMIN_REJEU,
  PAGES_MAX_PAR_PASSAGE,
  clientRejeu,
  portsDeBase,
  reconcilier,
  type Signal,
} from '../../src/server/integrations/axionia/reconciliation';
import { passageQuotidien } from '../../src/server/jobs/reconciliation';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Produit = {
  event_id: string;
  event_type: string;
  sequence: number;
  occurred_at: string;
  payload: Record<string, unknown>;
};
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: Produit[] };

/** La file de sortie d'axion-ia : les corps du producteur réel, tels quels, par séquence. */
const FILE = PRODUCTEUR.evenements.map((e) => ({
  sequence: e.sequence,
  eventId: e.event_id,
  corps: JSON.stringify(e),
}));

const MAINTENANT_MS = Date.UTC(2026, 9, 3, 6, 0, 0);
const SECRET_RELECTURE = randomBytes(32).toString('hex');
const SECRET_EMISSION = randomBytes(32).toString('hex');
const TROUSSEAU: Trousseau = { courante: SECRET_EMISSION, precedente: null };
const URL_AXIONIA = 'https://axion-ia.test';

const hmac = (secret: string, texte: string) =>
  createHmac('sha256', secret).update(texte, 'utf8').digest('hex');

type Appel = { methode: string; cible: string; corps: string };

/** Le double d'axion-ia : les deux routes, leur authentification et leurs réponses signées. */
function axionia(options: {
  file: typeof FILE;
  limiteServeur?: number;
  statut?: number;
  signatureFausse?: boolean;
}) {
  const appels: Appel[] = [];
  const repondre = (corps: string, entetes: Record<string, string> = {}) => {
    const t = String(Math.floor(MAINTENANT_MS / 1000));
    return new Response(corps, {
      status: 200,
      headers: {
        'x-axionia-timestamp': t,
        'x-axionia-signature': options.signatureFausse
          ? hmac(SECRET_EMISSION, `${t}.altere`)
          : hmac(SECRET_EMISSION, `${t}.${corps}`),
        'x-axionia-kid': kidDe(SECRET_EMISSION),
        ...entetes,
      },
    });
  };
  const appeler = (async (entree: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(entree));
    const cible = `${url.pathname}${url.search}`;
    const corps = typeof init?.body === 'string' ? init.body : '';
    appels.push({ methode: init?.method ?? 'GET', cible, corps });
    const h = new Headers(init?.headers);
    const t = h.get('x-partners-timestamp') ?? '';
    const signee = init?.method === 'POST' ? `${url.pathname}\n${corps}` : cible;
    if (h.get('x-partners-signature') !== hmac(SECRET_RELECTURE, `${t}.${signee}`)) {
      return new Response('signature_refusee', { status: 401 });
    }
    if (options.statut !== undefined) return new Response('panne', { status: options.statut });
    if (url.pathname === CHEMIN_RELECTURE) {
      const apres = Number(url.searchParams.get('after_sequence'));
      const limite = Math.min(Number(url.searchParams.get('limit')), options.limiteServeur ?? 500);
      const suivantes = options.file.filter((l) => l.sequence > apres);
      const rendues = suivantes.slice(0, limite);
      return repondre(rendues.map((l) => l.corps).join('\n'), {
        'x-axionia-derniere-sequence': String(rendues.at(-1)?.sequence ?? apres),
        'x-axionia-suite': suivantes.length > limite ? '1' : '0',
      });
    }
    if (url.pathname === CHEMIN_REJEU) {
      const ids = (JSON.parse(corps) as { eventIds: string[] }).eventIds;
      const connus = new Set(options.file.map((l) => l.eventId));
      return repondre(
        JSON.stringify({
          rearmes: ids.filter((i) => connus.has(i)),
          introuvables: ids.filter((i) => !connus.has(i)),
        })
      );
    }
    return new Response('not_found', { status: 404 });
  }) as typeof fetch;
  return { appels, appeler };
}

/** Inscrit en base les événements de la file jusqu'à la séquence `jusqua` : ils sont REÇUS. */
async function recevoirJusqua(jusqua: number): Promise<void> {
  for (const e of PRODUCTEUR.evenements.filter((x) => x.sequence <= jusqua)) {
    await base.prisma.evenementRecu.create({
      data: {
        source: 'axionia',
        eventId: e.event_id,
        eventType: e.event_type.replace('.', '_') as TypeEvenementRecu,
        schemaVersion: 2,
        sequence: BigInt(e.sequence),
        sujetRef: null,
        cleMetier: null,
        charge: e.payload as object,
        payloadHash: createHash('sha256').update(JSON.stringify(e)).digest('hex'),
        statut: 'recu',
        receivedAt: new Date(MAINTENANT_MS),
        survenuAt: new Date(e.occurred_at),
      },
    });
  }
}

function brancher(a: ReturnType<typeof axionia>) {
  const signaux: Signal[] = [];
  const commun = {
    urlAxionia: URL_AXIONIA,
    secretRelecture: SECRET_RELECTURE,
    trousseauEmission: TROUSSEAU,
    appeler: a.appeler,
    maintenantMs: () => MAINTENANT_MS,
  };
  const passer = () =>
    reconcilier({
      ...portsDeBase(base.prisma),
      lire: clientRelecture(commun),
      rejouer: clientRejeu(commun),
      signaler: async (s) => {
        signaux.push(s);
      },
    });
  return { signaux, passer };
}

beforeEach(async () => {
  await base.prisma.evenementRecu.deleteMany({});
});

describe('REQ-INT-012 — Partners relit la file de sortie depuis le dernier `after_sequence` reçu', () => {
  it('REQ-INT-012 : la relecture part de la plus haute séquence REÇUE, signée sur la cible exacte, bornée par page', async () => {
    await recevoirJusqua(6);
    const a = axionia({ file: FILE });
    await brancher(a).passer();
    expect(a.appels[0]).toEqual({
      methode: 'GET',
      cible: `${CHEMIN_RELECTURE}?after_sequence=6&limit=${LIMITE_PAR_PAGE}`,
      corps: '',
    });
  });

  it('REQ-INT-012 : sans aucun événement reçu, la relecture part de zéro', async () => {
    const a = axionia({ file: [] });
    await brancher(a).passer();
    expect(a.appels[0]?.cible).toBe(
      `${CHEMIN_RELECTURE}?after_sequence=0&limit=${LIMITE_PAR_PAGE}`
    );
  });

  it('REQ-INT-012 : la relecture suit `X-Axionia-Suite` page après page, et s’arrête à `PAGES_MAX_PAR_PASSAGE` en le signalant', async () => {
    const longue = Array.from({ length: PAGES_MAX_PAR_PASSAGE + 2 }, (_, i) => ({
      ...FILE[0]!,
      sequence: i + 1,
    }));
    const a = axionia({ file: longue, limiteServeur: 1 });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    const lectures = a.appels.filter((x) => x.methode === 'GET');
    expect(lectures).toHaveLength(PAGES_MAX_PAR_PASSAGE);
    expect(compteurs.pages).toBe(PAGES_MAX_PAR_PASSAGE);
    expect(signaux.map((s) => s.genre)).toContain('relecture_bornee');
  });
});

describe('REQ-INT-013 — un trou rattrapé est signalé, et son rejeu demandé sous l’identifiant d’origine', () => {
  it('REQ-INT-013 : quatre événements jamais reçus sont signalés et leur rejeu demandé, identifiants nommés', async () => {
    await recevoirJusqua(6);
    const a = axionia({ file: FILE });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    const manquants = FILE.filter((l) => l.sequence > 6).map((l) => l.eventId);
    expect(signaux).toEqual([{ genre: 'trou_rattrape', nombre: 4 }]);
    const rejeu = a.appels.find((x) => x.methode === 'POST');
    expect(rejeu?.cible).toBe(CHEMIN_REJEU);
    expect(JSON.parse(rejeu!.corps)).toEqual({ eventIds: manquants });
    expect(compteurs).toMatchObject({ relus: 4, manquants: 4, rearmes: 4, introuvables: 0 });
  });

  it('REQ-INT-013 : CONTRE-TÉMOIN — rien ne manque : aucun signal, aucun rejeu, et les compteurs sont rendus quand même', async () => {
    await recevoirJusqua(10);
    const a = axionia({ file: FILE });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    expect(signaux).toEqual([]);
    expect(a.appels.some((x) => x.methode === 'POST')).toBe(false);
    expect(compteurs).toMatchObject({ pages: 1, relus: 0, manquants: 0, rearmes: 0 });
  });

  it('REQ-INT-013 : une relecture en panne (503) est signalée `relecture_echouee`, et le passage ÉCHOUE', async () => {
    const a = axionia({ file: FILE, statut: 503 });
    const { signaux, passer } = brancher(a);
    await expect(passer()).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'statut_503' }]);
  });

  it('REQ-INT-013 : une réponse dont la signature ne tient pas est refusée comme une panne — rien n’est rejoué', async () => {
    const a = axionia({ file: FILE, signatureFausse: true });
    const { signaux, passer } = brancher(a);
    await expect(passer()).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'signature_refusee' }]);
    expect(a.appels.some((x) => x.methode === 'POST')).toBe(false);
  });

  it('REQ-INT-013 : une requête signée sous un AUTRE secret est refusée par axion-ia (401), et c’est une panne signalée', async () => {
    const a = axionia({ file: FILE });
    const signaux: Signal[] = [];
    const commun = {
      urlAxionia: URL_AXIONIA,
      secretRelecture: randomBytes(32).toString('hex'),
      trousseauEmission: TROUSSEAU,
      appeler: a.appeler,
      maintenantMs: () => MAINTENANT_MS,
    };
    await expect(
      reconcilier({
        ...portsDeBase(base.prisma),
        lire: clientRelecture(commun),
        rejouer: clientRejeu(commun),
        signaler: async (s) => {
          signaux.push(s);
        },
      })
    ).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'statut_401' }]);
  });
});

describe('REQ-QA-026 — la réconciliation est une tâche du registre, jouée une fois par jour', () => {
  it('REQ-QA-026 : `reconciliation_axionia` est au registre des tâches, sous REQ-INT-013', () => {
    expect(TACHES.reconciliation_axionia).toEqual({ req: 'REQ-INT-013' });
  });

  it('REQ-QA-026 : déjà réussie ce jour (UTC), la réconciliation n’est pas rejouée ; la veille, elle l’est', async () => {
    let jouee = 0;
    const reconcilierCompte = async () => {
      jouee += 1;
      return { pages: 1, relus: 0, manquants: 0, rearmes: 0, introuvables: 0 };
    };
    const ceMatin = new Date(Date.UTC(2026, 9, 3, 0, 5));
    const hier = new Date(Date.UTC(2026, 9, 2, 23, 55));
    const maintenant = () => new Date(MAINTENANT_MS);

    const differee = await passageQuotidien({
      dernierSucces: async () => ceMatin,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect([jouee, differee]).toEqual([0, { differee: 1 }]);

    const jouees = await passageQuotidien({
      dernierSucces: async () => hier,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect(jouee).toBe(1);
    expect(jouees).toMatchObject({ pages: 1, relus: 0 });

    await passageQuotidien({
      dernierSucces: async () => null,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect(jouee).toBe(2);
  });
});
