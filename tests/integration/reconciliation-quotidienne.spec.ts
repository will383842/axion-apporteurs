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
 * secret de relecture ; réponse signée sous le secret d'émission, la page de relecture sur la chaîne
 * CANONIQUE que le `$comment` de la route déclare (INT-T74-P)
 * `<t>.<after_sequence>.<limit>.<derniere>.<suite>.<corps>`, la réponse de rejeu sur `<t>.<corps>` ;
 * NDJSON des corps stockés, en-têtes `X-Axionia-Derniere-Sequence` et `X-Axionia-Suite`. Les corps sont ceux de la
 * fixture du producteur réel (RM-03), tels quels.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
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
  RECOUVREMENT_SEQUENCES,
  clientRejeu,
  portsDeBase,
  reconcilier,
  type Signal,
} from '../../src/server/integrations/axionia/reconciliation';
import { passageQuotidien } from '../../src/server/jobs/reconciliation';
import { battementDeLaReconciliation } from '../../src/server/taches/inscriptions';
import { lancerLesPassages, verrouConsultatif } from '../../src/server/taches/lanceur';
import { depotDuTravail } from '../../src/server/queue/workers/evenement-recu';

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

type Ligne = { sequence: number; eventId: string; corps: string; produit: Produit };

/**
 * La file de sortie d'axion-ia : les événements du producteur réel, leurs charges TELLES QUELLES.
 * `evenements_recus` est IMMUABLE (REQ-DM-036 : aucun DELETE) : un test ne vide pas la table. Chaque
 * file reçoit donc des identifiants neufs et des séquences décalées au-delà de toutes les
 * précédentes — les seuls champs d'enveloppe que le test fait varier ; la charge n'est pas touchée.
 * Le curseur étant la plus haute séquence reçue, les cas s'enchaînent dans l'ordre du fichier.
 */
let decalage = 0;
function uneFile(longueur = PRODUCTEUR.evenements.length): Ligne[] {
  decalage += 10_000;
  return Array.from({ length: longueur }, (_, i) => {
    const source = PRODUCTEUR.evenements[i % PRODUCTEUR.evenements.length]!;
    const produit = {
      ...structuredClone(source),
      event_id: randomUUID(),
      sequence: decalage + i + 1,
    };
    return {
      sequence: produit.sequence,
      eventId: produit.event_id,
      corps: JSON.stringify(produit),
      produit,
    };
  });
}

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
  file: readonly Ligne[];
  limiteServeur?: number;
  statut?: number;
  signatureFausse?: boolean;
  /** Rend les lignes d'une page dans l'ordre INVERSE : une page rejouée ou mélangée. */
  melanger?: boolean;
}) {
  const appels: Appel[] = [];
  /** `signee` : ce que la signature couvre après `<t>.` — le corps seul, ou la chaîne canonique. */
  const repondre = (corps: string, entetes: Record<string, string> = {}, signee = corps) => {
    const t = String(Math.floor(MAINTENANT_MS / 1000));
    return new Response(corps, {
      status: 200,
      headers: {
        'x-axionia-timestamp': t,
        'x-axionia-signature': options.signatureFausse
          ? hmac(SECRET_EMISSION, `${t}.altere`)
          : hmac(SECRET_EMISSION, `${t}.${signee}`),
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
      const ordre = options.melanger ? [...rendues].reverse() : rendues;
      const page = ordre.map((l) => l.corps).join('\n');
      const derniere = String(rendues.at(-1)?.sequence ?? apres);
      const suite = suivantes.length > limite ? '1' : '0';
      return repondre(
        page,
        { 'x-axionia-derniere-sequence': derniere, 'x-axionia-suite': suite },
        [
          url.searchParams.get('after_sequence'),
          url.searchParams.get('limit'),
          derniere,
          suite,
          page,
        ].join('.')
      );
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

/** Inscrit en base les `combien` premiers événements de la file : ils sont REÇUS. */
async function recevoir(file: readonly Ligne[], combien: number): Promise<void> {
  for (const { produit: e } of file.slice(0, combien)) {
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

describe('REQ-INT-012 — Partners relit la file de sortie depuis le dernier `after_sequence` reçu', () => {
  // EN PREMIER : la table est vierge, et aucun cas ne la vide (elle est immuable).
  it('REQ-INT-012 : sans aucun événement reçu, la relecture part de zéro', async () => {
    const a = axionia({ file: [] });
    await brancher(a).passer();
    expect(a.appels[0]?.cible).toBe(
      `${CHEMIN_RELECTURE}?after_sequence=0&limit=${LIMITE_PAR_PAGE}`
    );
  });

  it('REQ-INT-012 : la relecture part de la plus haute séquence REÇUE moins le recouvrement, signée sur la cible exacte, bornée par page', async () => {
    const file = uneFile();
    await recevoir(file, 6);
    const a = axionia({ file });
    await brancher(a).passer();
    expect(a.appels[0]).toEqual({
      methode: 'GET',
      cible: `${CHEMIN_RELECTURE}?after_sequence=${BigInt(file[5]!.sequence) - RECOUVREMENT_SEQUENCES}&limit=${LIMITE_PAR_PAGE}`,
      corps: '',
    });
  });

  it('REQ-INT-012 : la relecture suit `X-Axionia-Suite` page après page, et s’arrête à `PAGES_MAX_PAR_PASSAGE` en le signalant', async () => {
    const a = axionia({ file: uneFile(PAGES_MAX_PAR_PASSAGE + 2), limiteServeur: 1 });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    const lectures = a.appels.filter((x) => x.methode === 'GET');
    expect(lectures).toHaveLength(PAGES_MAX_PAR_PASSAGE);
    expect(compteurs.pages).toBe(PAGES_MAX_PAR_PASSAGE);
    expect(signaux.map((s) => s.genre)).toContain('relecture_bornee');
  });
});

describe('REQ-INT-012 — un trou rattrapé est signalé, et son rejeu demandé sous l’identifiant d’origine', () => {
  it('REQ-INT-012 : quatre événements jamais reçus sont signalés et leur rejeu demandé, identifiants nommés', async () => {
    const file = uneFile();
    await recevoir(file, 6);
    const a = axionia({ file });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    const manquants = file.slice(6).map((l) => l.eventId);
    expect(signaux).toEqual([{ genre: 'trou_rattrape', nombre: 4 }]);
    const rejeu = a.appels.find((x) => x.methode === 'POST');
    expect(rejeu?.cible).toBe(CHEMIN_REJEU);
    expect(JSON.parse(rejeu!.corps)).toEqual({ eventIds: manquants });
    expect(compteurs).toMatchObject({ relus: 10, manquants: 4, rearmes: 4, introuvables: 0 });
  });

  it('REQ-INT-012 : un trou AU MILIEU — le quatrième jamais reçu, les suivants reçus — est retrouvé par le recouvrement, et lui seul est rejoué', async () => {
    const file = uneFile();
    await recevoir(file.slice(0, 3), 3);
    await recevoir(file.slice(4), file.length - 4);
    const a = axionia({ file });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    expect(signaux).toEqual([{ genre: 'trou_rattrape', nombre: 1 }]);
    const rejeu = a.appels.find((x) => x.methode === 'POST');
    expect(JSON.parse(rejeu!.corps)).toEqual({ eventIds: [file[3]!.eventId] });
    expect(compteurs).toMatchObject({ manquants: 1, rearmes: 1 });
  });

  it('REQ-INT-012 : CONTRE-TÉMOIN — rien ne manque : aucun signal, aucun rejeu, et les compteurs sont rendus quand même', async () => {
    const file = uneFile();
    await recevoir(file, file.length);
    const a = axionia({ file });
    const { signaux, passer } = brancher(a);
    const compteurs = await passer();
    expect(signaux).toEqual([]);
    expect(a.appels.some((x) => x.methode === 'POST')).toBe(false);
    expect(compteurs).toMatchObject({ pages: 1, relus: 10, manquants: 0, rearmes: 0 });
  });

  it('REQ-INT-012 : une relecture en panne (503) est signalée `relecture_echouee`, et le passage ÉCHOUE', async () => {
    const a = axionia({ file: uneFile(), statut: 503 });
    const { signaux, passer } = brancher(a);
    await expect(passer()).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'statut_503' }]);
  });

  it('REQ-INT-012 : une réponse dont la signature ne tient pas est refusée comme une panne — rien n’est rejoué', async () => {
    const a = axionia({ file: uneFile(), signatureFausse: true });
    const { signaux, passer } = brancher(a);
    await expect(passer()).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'signature_refusee' }]);
    expect(a.appels.some((x) => x.methode === 'POST')).toBe(false);
  });

  it('REQ-INT-012 : une requête signée sous un AUTRE secret est refusée par axion-ia (401), et c’est une panne signalée', async () => {
    const a = axionia({ file: uneFile() });
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

describe('REQ-INT-012 — une page hors d’ordre est refusée entière', () => {
  it('REQ-INT-012 : des lignes dont la séquence ne croît pas strictement depuis `after_sequence` font refuser la page `ligne_hors_ordre` — rien n’est rejoué', async () => {
    const a = axionia({ file: uneFile(), melanger: true });
    const { signaux, passer } = brancher(a);
    await expect(passer()).rejects.toThrow(/relecture_echouee/);
    expect(signaux).toEqual([{ genre: 'relecture_echouee', motif: 'ligne_hors_ordre' }]);
    expect(a.appels.some((x) => x.methode === 'POST')).toBe(false);
  });
});

describe('REQ-QA-026 — la réconciliation est une tâche du registre, jouée une fois par jour', () => {
  it('REQ-QA-026 : `reconciliation_axionia` est au registre des tâches, sous l’exigence du job quotidien', () => {
    expect(TACHES.reconciliation_axionia).toEqual({ req: 'REQ-INT-013' });
  });

  it('REQ-QA-026 : déjà réussie ce jour (UTC), la réconciliation n’est pas rejouée ; la veille, elle l’est', async () => {
    let jouee = 0;
    const reconcilierCompte = async () => {
      jouee += 1;
      return {
        pages: 1,
        relus: 0,
        manquants: 0,
        rearmes: 0,
        introuvables: 0,
        eventIdsManquants: [],
      };
    };
    const ceMatin = new Date(Date.UTC(2026, 9, 3, 0, 5));
    const hier = new Date(Date.UTC(2026, 9, 2, 23, 55));
    const maintenant = () => new Date(MAINTENANT_MS);

    const differee = await passageQuotidien({
      dernierSucces: async () => ceMatin,
      derniersCompteurs: async () => null,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect([jouee, differee]).toEqual([0, { differee: 1 }]);

    const jouees = await passageQuotidien({
      dernierSucces: async () => hier,
      derniersCompteurs: async () => null,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect(jouee).toBe(1);
    expect(jouees).toMatchObject({ pages: 1, relus: 0 });

    await passageQuotidien({
      dernierSucces: async () => null,
      derniersCompteurs: async () => null,
      maintenant,
      reconcilier: reconcilierCompte,
    })();
    expect(jouee).toBe(2);
  });

  it('REQ-INT-013 : en base réelle, les event_id manquants du passage restent au battement après les minutes différées du même jour', async () => {
    // Le lanceur, son verrou consultatif et le dépôt de production ; le battement est lu par le
    // port de l'inscription. Seul le passage lui-même est remplacé (il appellerait axion-ia).
    const resultat = {
      pages: 1,
      relus: 3,
      manquants: 1,
      rearmes: 1,
      introuvables: 0,
      eventIdsManquants: [randomUUID()],
    };
    let jouee = 0;
    let instant = Date.UTC(2026, 9, 5, 0, 1, 0);
    const maintenant = () => new Date(instant);
    const minute = () =>
      lancerLesPassages({
        inscriptions: {
          reconciliation_axionia: passageQuotidien({
            ...battementDeLaReconciliation(base.prisma),
            maintenant,
            reconcilier: async () => {
              jouee += 1;
              return resultat;
            },
          }) as never,
        },
        verrou: verrouConsultatif(base.prisma),
        battre: depotDuTravail(base.prisma).battre,
        maintenant,
      });
    const lu = async () =>
      (
        await base.prisma.battement.findUniqueOrThrow({
          where: { tache: 'reconciliation_axionia' },
        })
      ).compteurs;

    expect(await minute()).toEqual({ reconciliation_axionia: 'joue' });
    expect(await lu()).toEqual(resultat);
    instant += 60_000;
    expect(await minute()).toEqual({ reconciliation_axionia: 'joue' });
    instant += 60 * 60_000;
    expect(await minute()).toEqual({ reconciliation_axionia: 'joue' });
    expect(jouee).toBe(1);
    expect(await lu()).toEqual({ ...resultat, differee: 1 });
  });
});
