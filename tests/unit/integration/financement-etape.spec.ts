// @req REQ-INT-012
// @req REQ-JUR-061
/**
 * INT-T76-P — le contrat v4 côté Partners, jugé en processus (forme d'A02, #656 et #737) :
 *   — la charge FERMÉE de `financement.etape` et ses règles croisées (le dépôt daté, l'accord ÉCRIT,
 *     daté et chiffré, le refus sans montant), et l'OPCO tiré de la SEULE liste des onze codes ;
 *   — la fiche du client, qui exige la clé `opco` et admet `null` ;
 *   — la fenêtre de bascule : la v3 TRAITÉE jusqu'au minuit de Paris qui suit le 7e jour après la
 *     première v4 (le jour de celle-ci ne compte pas), puis `held`, en jours civils et jamais en 7×24 h ;
 *   — la réception : la clé de fait `financement.etape:<dossierId>:<etape>`, et le refus nommé
 *     `issue_contradictoire` d'une seconde issue pour le même dossier, jugé sous verrou dans la
 *     transaction de l'inscription.
 * La base réelle est jouée par `tests/integration/financement-etape.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { SCHEMA_VERSION } from '../../../packages/contracts/events';
import { OPCO_IDS } from '../../../packages/contracts/payloads';
import { ENTETE_KID_AXIONIA } from '../../../packages/contracts/api';
import { NOMS_DES_SECRETS, kidDe } from '../../../src/lib/env';
import { creerAlerteurPlafonne } from '../../../src/server/securite/primitives-de-porte';
import {
  ENTETE_HORODATAGE,
  ENTETE_SIGNATURE,
  VERSION_EN_BASCULE,
  chargeConforme,
  depotDeReception,
  payloadConforme,
  recevoirEvenementAxionia,
  type EvenementAInscrire,
} from '../../../src/server/integrations/axionia/reception';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { finDeLaBasculeV3V4, v3EncoreTraitee } from '../../../src/domain/contrat/bascule-v3-v4';

const JOUR_MS = 86_400_000;

/** Une étape conforme, et ses variantes. */
const DEPOT = {
  dossierId: 'dossier-1',
  clientId: 'client-1',
  siren: '123456789',
  etape: 'depot',
  opco: 'akto',
  regime: 'subrogation_possible',
  depotFaitLe: '2026-10-01T08:00:00.000Z',
  accordEcritLe: null,
  montantAccordeCents: null,
} as const;
const ACCORD = {
  ...DEPOT,
  etape: 'accord',
  accordEcritLe: '2026-10-20T08:00:00.000Z',
  montantAccordeCents: 150_000,
} as const;
const REFUS = { ...DEPOT, etape: 'refus' } as const;

/** La fiche du client du PRODUCTEUR RÉEL (v1), et l'OPCO que la v4 exige. */
const PRODUCTEUR = JSON.parse(
  readFileSync('tests/fixtures/axionia/fixtures-producteur.v1.json', 'utf8')
) as { evenements: { event_type: string; payload: Record<string, unknown> }[] };
const FICHE = PRODUCTEUR.evenements.find((e) => e.event_type === 'client.cree')!.payload;

describe('REQ-JUR-061 — la charge fermée de `financement.etape` (contrat v4)', () => {
  it('REQ-JUR-061 : TÉMOIN — les trois étapes conformes passent, contre le contrat courant', () => {
    expect(SCHEMA_VERSION).toBe(4);
    for (const etape of [DEPOT, ACCORD, REFUS]) {
      expect(payloadConforme('financement.etape', etape), etape.etape).toBe(true);
    }
  });

  it('REQ-JUR-061 : TÉMOIN — l’accord n’est émis qu’ÉCRIT : sans `accordEcritLe`, ou sans montant, il est refusé', () => {
    expect(payloadConforme('financement.etape', { ...ACCORD, accordEcritLe: null })).toBe(false);
    expect(payloadConforme('financement.etape', { ...ACCORD, montantAccordeCents: null })).toBe(
      false
    );
  });

  it('REQ-JUR-061 : TÉMOIN — le dépôt est daté, et le refus ne porte aucun montant ni motif', () => {
    expect(payloadConforme('financement.etape', { ...DEPOT, depotFaitLe: null })).toBe(false);
    expect(payloadConforme('financement.etape', { ...REFUS, montantAccordeCents: 0 })).toBe(false);
    expect(payloadConforme('financement.etape', { ...REFUS, motif: 'x' })).toBe(false);
  });

  it('REQ-JUR-061 : TÉMOIN — chaque clé est exigée (`null` est une valeur, l’absence ne l’est pas), aucune autre n’est admise', () => {
    for (const cle of Object.keys(DEPOT)) {
      const sans: Record<string, unknown> = { ...DEPOT };
      delete sans[cle];
      expect(payloadConforme('financement.etape', sans), cle).toBe(false);
    }
    expect(payloadConforme('financement.etape', { ...DEPOT, interlocuteur: 'x' })).toBe(false);
    expect(payloadConforme('financement.etape', { ...DEPOT, etape: 'accord_oral' })).toBe(false);
    expect(payloadConforme('financement.etape', { ...DEPOT, regime: 'autre' })).toBe(false);
    expect(payloadConforme('financement.etape', { ...ACCORD, montantAccordeCents: -1 })).toBe(
      false
    );
  });

  it('REQ-JUR-061 : TÉMOIN — l’OPCO est l’un des onze codes, jamais une chaîne libre ; `null` n’est pas admis sur l’étape', () => {
    for (const opco of OPCO_IDS) {
      expect(payloadConforme('financement.etape', { ...DEPOT, opco }), opco).toBe(true);
    }
    for (const opco of ['OPCO_EP', 'opco-ep', 'autre', '', null]) {
      expect(payloadConforme('financement.etape', { ...DEPOT, opco }), String(opco)).toBe(false);
    }
  });

  it('REQ-JUR-061 : la liste des OPCO est celle de l’enum `Opco` d’axion-ia, dans son ordre et en minuscules', () => {
    // Recopiée de `OPCO_IDS` (axion-ia, `src/server/qualiopi/financements/opco-referentiel.ts`) ;
    // le témoin de recopie à empreinte épinglée vit côté axion-ia (INT-T76-A).
    expect([...OPCO_IDS]).toEqual([
      'atlas',
      'opco_ep',
      'akto',
      'opco2i',
      'mobilites',
      'afdas',
      'uniformation',
      'ocapiat',
      'constructys',
      'opcommerce',
      'opco_sante',
    ]);
  });
});

describe('REQ-INT-012 — la fiche du client exige `opco` en v4, et la v3 reste jugée contre SA version', () => {
  it('REQ-INT-012 : TÉMOIN — sans la clé `opco`, la fiche est refusée ; `opco: null` passe ; un code hors des onze est refusé', () => {
    expect(payloadConforme('client.cree', FICHE)).toBe(false);
    expect(payloadConforme('client.cree', { ...FICHE, opco: null })).toBe(true);
    expect(payloadConforme('client.mis_a_jour', { ...FICHE, opco: 'atlas' })).toBe(true);
    for (const opco of ['OPCO_EP', 'opco-ep']) {
      expect(payloadConforme('client.cree', { ...FICHE, opco }), opco).toBe(false);
    }
  });

  it('REQ-INT-012 : TÉMOIN — une fiche v3, sans `opco`, est conforme à SA version, à la réception comme au rejeu', () => {
    expect(VERSION_EN_BASCULE).toBe(3);
    expect(payloadConforme('client.cree', FICHE, VERSION_EN_BASCULE)).toBe(true);
    expect(chargeConforme('client.cree', FICHE, VERSION_EN_BASCULE)).toBe(true);
    // Et la v3 ne connaît pas `financement.etape` : rien ne s'y juge conforme.
    expect(payloadConforme('financement.etape', DEPOT, VERSION_EN_BASCULE)).toBe(false);
  });
});

describe('REQ-INT-012 — la fenêtre de bascule de la v3 à la v4, en jours civils de Paris', () => {
  const paris = (iso: string) => Date.parse(iso);

  it('REQ-INT-012 : la durée vient de la SSOT : sept jours, arbitrage d’A02', () => {
    expect(SEUILS.BASCULE_CONTRAT_V3_V4_JOURS).toMatchObject({ valeur: 7, unite: 'jours' });
    expect(SEUILS.BASCULE_CONTRAT_V3_V4_JOURS.source).toContain('arbitrage A02 (INT-T76-P, #737)');
  });

  it('REQ-INT-012 : TÉMOIN — aucune v4 reçue : la v3 est traitée, à toute date', () => {
    expect(v3EncoreTraitee(null, paris('2030-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('REQ-INT-012 : TÉMOIN — première v4 le 10 (hiver) : la v3 est traitée le 17 à 23 h 59 à Paris, `held` le 18 à 00 h 00', () => {
    const premiere = paris('2026-01-10T14:00:00.000Z');
    const fin = finDeLaBasculeV3V4(premiere);
    expect(new Date(fin).toISOString()).toBe('2026-01-17T23:00:00.000Z');
    expect(v3EncoreTraitee(premiere, fin - 1)).toBe(true);
    expect(v3EncoreTraitee(premiere, fin)).toBe(false);
  });

  it('REQ-INT-012 : TÉMOIN — première v4 le 10 (été) : `held` le 18 à 00 h 00, heure d’été de Paris', () => {
    const premiere = paris('2026-07-10T21:59:59.999Z');
    const fin = finDeLaBasculeV3V4(premiere);
    expect(new Date(fin).toISOString()).toBe('2026-07-17T22:00:00.000Z');
    expect(v3EncoreTraitee(premiere, fin - 1)).toBe(true);
    expect(v3EncoreTraitee(premiere, fin)).toBe(false);
  });

  it('REQ-INT-012 : TÉMOIN — le changement d’heure ne déplace pas le jour : jamais sept fois vingt-quatre heures', () => {
    // Première v4 le 25 mars 2026 à 10 h, heure d'hiver ; le passage à l'heure d'été tombe le 29.
    const premiere = paris('2026-03-25T09:00:00.000Z');
    const fin = finDeLaBasculeV3V4(premiere);
    // Le 2 avril à 00 h 00, heure d'été de Paris.
    expect(new Date(fin).toISOString()).toBe('2026-04-01T22:00:00.000Z');
    expect(fin - paris('2026-03-25T23:00:00.000Z')).toBe(7 * JOUR_MS - 3_600_000);
    // Et dans l'autre sens : la première v4 le 22 octobre, l'heure d'hiver revient le 25.
    const automne = finDeLaBasculeV3V4(paris('2026-10-22T08:00:00.000Z'));
    expect(new Date(automne).toISOString()).toBe('2026-10-29T23:00:00.000Z');
  });

  it('REQ-INT-012 : TÉMOIN — le jour de la première v4 ne compte pas, même reçue à 23 h 59 de Paris', () => {
    const tard = paris('2026-01-10T22:59:59.999Z');
    expect(new Date(finDeLaBasculeV3V4(tard)).toISOString()).toBe('2026-01-17T23:00:00.000Z');
    const minuit = paris('2026-01-10T23:00:00.000Z');
    expect(new Date(finDeLaBasculeV3V4(minuit)).toISOString()).toBe('2026-01-18T23:00:00.000Z');
  });
});

// ── la réception, avec un faux dépôt ────────────────────────────────────────────────────────────

const MAINTENANT_MS = Date.UTC(2026, 9, 1, 10, 0, 0);

type Banc = {
  premiere?: () => Promise<Date | null>;
  resultat?: 'inscrit' | 'doublon' | 'issue_contradictoire';
};

async function recevoir(
  type: string,
  payload: Record<string, unknown>,
  version: number,
  banc: Banc = {}
): Promise<{ statut: number; corps: string; inscrites: EvenementAInscrire[]; alertes: string[] }> {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  const secret = env.AXIONIA_WEBHOOK_SECRET!;
  const corps = JSON.stringify({
    event_id: randomUUID(),
    event_type: type,
    schema_version: version,
    occurred_at: '2026-10-01T09:59:00.000Z',
    emitted_at: '2026-10-01T09:59:30.000Z',
    producer: 'axionia',
    subject_ref: { client_id: 'client-1' },
    sequence: 7,
    payload,
  });
  const secondes = String(MAINTENANT_MS / 1000);
  const inscrites: EvenementAInscrire[] = [];
  const alertes: string[] = [];
  const r = await recevoirEvenementAxionia(
    new Request('https://partners.test/api/webhooks/axionia', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENTETE_HORODATAGE]: secondes,
        [ENTETE_SIGNATURE]: createHmac('sha256', secret)
          .update(`${secondes}.${corps}`, 'utf8')
          .digest('hex'),
        [ENTETE_KID_AXIONIA]: kidDe(secret),
      },
      body: corps,
    }),
    {
      environnement: env,
      maintenantMs: MAINTENANT_MS,
      depot: {
        async inscrire(e) {
          inscrites.push(e);
          return banc.resultat ?? 'inscrit';
        },
        premiereReceptionDeLaVersionCourante: banc.premiere ?? (async () => null),
      },
      alerteur: creerAlerteurPlafonne((a) => void alertes.push(a.motif)),
      declencher: () => undefined,
    }
  );
  return { statut: r.status, corps: await r.text(), inscrites, alertes };
}

describe('REQ-INT-012 — la réception de la v4, et de la v3 pendant la bascule', () => {
  const v3 = { ...FICHE };
  const v4 = { ...FICHE, opco: null };

  it('REQ-INT-012 : TÉMOIN — aucune v4 reçue : une fiche v3 est TRAITÉE (`recu`), jugée contre la v3', async () => {
    const r = await recevoir('client.cree', v3, VERSION_EN_BASCULE);
    expect([r.statut, r.inscrites.map((e) => e.statut)]).toEqual([200, ['recu']]);
  });

  it('REQ-INT-012 : TÉMOIN — fenêtre ouverte : la v3 est traitée ; refermée : elle est `held`, jamais refusée', async () => {
    const ouverte = new Date(MAINTENANT_MS - 2 * JOUR_MS);
    const r1 = await recevoir('client.cree', v3, VERSION_EN_BASCULE, {
      premiere: async () => ouverte,
    });
    expect(r1.inscrites.map((e) => e.statut)).toEqual(['recu']);
    const refermee = new Date(MAINTENANT_MS - 30 * JOUR_MS);
    const r2 = await recevoir('client.cree', v3, VERSION_EN_BASCULE, {
      premiere: async () => refermee,
    });
    expect([r2.statut, r2.inscrites.map((e) => e.statut)]).toEqual([200, ['held']]);
    expect(r2.alertes).toEqual(['schema_version_inconnue']);
    // Et ce `held` se rejoue contre la v3, sans perte.
    expect(chargeConforme('client.cree', r2.inscrites[0]!.charge, VERSION_EN_BASCULE)).toBe(true);
  });

  it('REQ-INT-012 : TÉMOIN — une version 5 reste `held`, sans lire la première v4', async () => {
    let lue = false;
    const r = await recevoir('client.cree', v4, SCHEMA_VERSION + 1, {
      premiere: async () => {
        lue = true;
        return null;
      },
    });
    expect(r.inscrites.map((e) => e.statut)).toEqual(['held']);
    expect(lue).toBe(false);
  });

  it('REQ-INT-012 : TÉMOIN — la v4 est toujours traitée ; sa fiche sans `opco` est hors schéma', async () => {
    const r = await recevoir('client.cree', v4, SCHEMA_VERSION, {
      premiere: async () => new Date(0),
    });
    expect(r.inscrites.map((e) => e.statut)).toEqual(['recu']);
    const sans = await recevoir('client.cree', v3, SCHEMA_VERSION);
    expect([sans.statut, sans.corps, sans.inscrites]).toEqual([422, 'hors_schema', []]);
  });

  it('REQ-INT-012 : une base qui ne dit pas la première v4 rend 503 : rien n’est inscrit, l’émetteur rejoue', async () => {
    const r = await recevoir('client.cree', v3, VERSION_EN_BASCULE, {
      premiere: async () => {
        throw new Error('base_coupee');
      },
    });
    expect([r.statut, r.corps, r.inscrites]).toEqual([503, 'inscription_indisponible', []]);
  });

  it('REQ-JUR-061 : TÉMOIN — la clé de fait est `financement.etape:<dossierId>:<etape>`', async () => {
    const r = await recevoir('financement.etape', ACCORD, SCHEMA_VERSION);
    expect(r.inscrites.map((e) => [e.statut, e.cleMetier])).toEqual([
      ['recu', 'financement.etape:dossier-1:accord'],
    ]);
  });

  it('REQ-JUR-061 : TÉMOIN — une seconde issue pour le même dossier est refusée 422, nommée, et alertée', async () => {
    const r = await recevoir('financement.etape', REFUS, SCHEMA_VERSION, {
      resultat: 'issue_contradictoire',
    });
    expect([r.statut, r.corps]).toEqual([422, 'issue_contradictoire']);
    expect(r.alertes).toEqual(['issue_contradictoire']);
  });

  it('REQ-JUR-061 : une étape hors forme est refusée AVANT toute clé : rien n’est inscrit', async () => {
    const r = await recevoir(
      'financement.etape',
      { ...ACCORD, accordEcritLe: null },
      SCHEMA_VERSION
    );
    expect([r.statut, r.corps, r.inscrites]).toEqual([422, 'hors_schema', []]);
  });
});

// ── l'adaptateur Prisma, sur un faux client ─────────────────────────────────────────────────────

function ligne(etape: string, eventType = 'financement_etape'): EvenementAInscrire {
  return {
    source: 'axionia',
    eventId: randomUUID(),
    eventType,
    schemaVersion: SCHEMA_VERSION,
    sequence: 1n,
    sujetRef: 'client:client-1',
    cleMetier: `financement.etape:dossier-1:${etape}`,
    charge: { ...DEPOT, etape },
    payloadHash: 'a'.repeat(64),
    statut: 'recu',
    receivedAt: new Date(MAINTENANT_MS),
    survenuAt: new Date(MAINTENANT_MS),
  } as unknown as EvenementAInscrire;
}

function fauxClient(contraires: number) {
  const appels: { quoi: string; args: unknown }[] = [];
  const tx = {
    $executeRaw: async (chaines: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ quoi: 'verrou', args: [chaines.join('?'), ...valeurs] });
      return 1;
    },
    $queryRaw: async (chaines: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ quoi: 'lecture', args: [chaines.join('?'), ...valeurs] });
      return [{ n: BigInt(contraires) }];
    },
    evenementRecu: {
      create: async (args: unknown) => {
        appels.push({ quoi: 'create', args });
        return {};
      },
    },
  };
  const client = {
    ...tx,
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: 'transaction', args: null });
      return f(tx);
    },
    evenementRecu: {
      ...tx.evenementRecu,
      findFirst: async (args: unknown) => {
        appels.push({ quoi: 'findFirst', args });
        return { receivedAt: new Date(MAINTENANT_MS) };
      },
    },
  } as unknown as PrismaClient;
  return { client, appels };
}

describe('REQ-JUR-061 — l’issue contradictoire, jugée sous verrou dans la transaction de l’inscription', () => {
  it('REQ-JUR-061 : TÉMOIN — un refus après un accord : la transaction prend le verrou du dossier, lit l’issue contraire, et n’écrit rien', async () => {
    const f = fauxClient(1);
    expect(await depotDeReception(f.client).inscrire(ligne('refus'))).toBe('issue_contradictoire');
    expect(f.appels.map((a) => a.quoi)).toEqual(['transaction', 'verrou', 'lecture']);
    const [verrou, lecture] = [f.appels[1]!.args, f.appels[2]!.args] as unknown[][];
    expect(verrou!.slice(1)).toEqual(['reception.etape-de-financement', 'dossier-1']);
    expect(String(lecture![0])).toMatch(/"charge"->>'dossierId' = \? AND "charge"->>'etape' = \?/);
    expect(lecture!.slice(1)).toEqual(['dossier-1', 'accord']);
  });

  it('REQ-JUR-061 : TÉMOIN — une première issue s’inscrit dans la même transaction, et l’accord cherche le refus', async () => {
    const f = fauxClient(0);
    expect(await depotDeReception(f.client).inscrire(ligne('accord'))).toBe('inscrit');
    expect(f.appels.map((a) => a.quoi)).toEqual(['transaction', 'verrou', 'lecture', 'create']);
    expect((f.appels[2]!.args as unknown[]).slice(1)).toEqual(['dossier-1', 'refus']);
  });

  it('REQ-JUR-061 : un dépôt, ou un autre type, s’inscrit sans transaction ni verrou', async () => {
    const f = fauxClient(1);
    expect(await depotDeReception(f.client).inscrire(ligne('depot'))).toBe('inscrit');
    const g = fauxClient(1);
    expect(await depotDeReception(g.client).inscrire(ligne('accord', 'client_cree'))).toBe(
      'inscrit'
    );
    expect([...f.appels, ...g.appels].map((a) => a.quoi)).toEqual(['create', 'create']);
  });

  it('REQ-INT-012 : la première v4 se lit en base : la plus ancienne réception de la version courante, d’axion-ia', async () => {
    const f = fauxClient(0);
    expect(await depotDeReception(f.client).premiereReceptionDeLaVersionCourante()).toEqual(
      new Date(MAINTENANT_MS)
    );
    expect(f.appels).toEqual([
      {
        quoi: 'findFirst',
        args: {
          where: { source: 'axionia', schemaVersion: SCHEMA_VERSION },
          orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
          select: { receivedAt: true },
        },
      },
    ]);
  });
});
