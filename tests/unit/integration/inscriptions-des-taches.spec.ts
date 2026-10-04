// @req REQ-QA-027
/**
 * GOV-137 — la COMPOSITION des tâches de fond (`src/server/taches/inscriptions.ts`), partagée par
 * la route des événements reçus et par le lanceur des passages planifiés.
 *
 * Jugée en processus, sur des modules simulés : ce que la route et le lanceur font de la base est
 * jugé ailleurs (`evenement-recu-travail.spec.ts`, `lanceur-des-passages.spec.ts`,
 * `tests/integration/candidature-recue.spec.ts`). Ici : quels traitants sont branchés, comment les
 * reprises s'additionnent, que le lanceur reçoit un dépôt qui ne bat pas, et que le traitant de la
 * candidature relit ses secrets À CHAQUE traitement et refuse sans eux.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TypeEvenementRecu, type PrismaClient } from '@prisma/client';

const m = vi.hoisted(() => ({
  passerLeTravail: vi.fn(),
  reprendreLesAttentes: vi.fn(),
  reprendreLesTraitants: vi.fn(),
  lireLesAttentes: vi.fn(),
  depotDuTravail: vi.fn(),
  lireEnvironnement: vi.fn(),
  lireTrousseaux: vi.fn(),
  traiterCandidatureRecue: vi.fn(),
  clientCoordonnees: vi.fn(),
  clesPii: vi.fn(),
  // DM-62 : les passages planifiés, simulés pour juger ce que chaque inscription leur passe.
  minimiserCandidatures: vi.fn(),
  purgerLesContacts: vi.fn(),
  purgerLesSirenRefuses: vi.fn(),
  purgerLesValeursDesDroits: vi.fn(),
  // DM-60 : l'anonymisation des traces de droits, et la réconciliation composée sur ses ports.
  anonymiserLesTracesDesDroits: vi.fn(),
  passageQuotidien: vi.fn(),
  reconcilier: vi.fn(),
  clientRejeu: vi.fn(),
  portsDeReconciliation: vi.fn(),
  clientRelecture: vi.fn(),
  anonymiserLesAnomalies: vi.fn(),
  purgerLesContestations: vi.fn(),
  purgerLesDementis: vi.fn(),
  completerLesCodesNaf: vi.fn(),
  portsDeBaseNaf: vi.fn(),
  clientDuTiers: vi.fn(),
  creerDisjoncteur: vi.fn(),
  debitGlobal: vi.fn(),
}));

vi.mock('../../../src/server/queue/workers/evenement-recu', async (original) => ({
  ...(await original<object>()),
  passerLeTravail: m.passerLeTravail,
  reprendreLesAttentes: m.reprendreLesAttentes,
  reprendreLesTraitants: m.reprendreLesTraitants,
  lireLesAttentes: m.lireLesAttentes,
  depotDuTravail: m.depotDuTravail,
}));
vi.mock('../../../src/lib/env', () => ({
  lireEnvironnement: m.lireEnvironnement,
  lireTrousseaux: m.lireTrousseaux,
}));
vi.mock('../../../src/server/integrations/axionia/candidature-recue', () => ({
  PREFIXE_ATTENTE_COORDONNEES: 'coordonnees:',
  traiterCandidatureRecue: m.traiterCandidatureRecue,
  clientCoordonnees: m.clientCoordonnees,
}));
vi.mock('../../../src/server/securite/pii', () => ({ clesPii: m.clesPii }));
vi.mock('../../../src/server/taches/minimiser-candidatures', () => ({
  minimiserCandidatures: m.minimiserCandidatures,
}));
vi.mock('../../../src/server/taches/purger-contacts', () => ({
  purgerLesContacts: m.purgerLesContacts,
}));
vi.mock('../../../src/server/taches/purger-siren-refuses', () => ({
  purgerLesSirenRefuses: m.purgerLesSirenRefuses,
}));
vi.mock('../../../src/server/taches/purger-valeurs-droits-contact', () => ({
  purgerLesValeursDesDroits: m.purgerLesValeursDesDroits,
}));
vi.mock('../../../src/server/taches/anonymiser-traces-droits-contact', () => ({
  anonymiserLesTracesDesDroits: m.anonymiserLesTracesDesDroits,
}));
vi.mock('../../../src/server/jobs/reconciliation', () => ({
  passageQuotidien: m.passageQuotidien,
}));
vi.mock('../../../src/server/integrations/axionia/reconciliation', () => ({
  reconcilier: m.reconcilier,
  clientRejeu: m.clientRejeu,
  portsDeBase: m.portsDeReconciliation,
}));
vi.mock('../../../src/server/integrations/axionia/relecture', () => ({
  clientRelecture: m.clientRelecture,
}));
vi.mock('../../../src/server/taches/purger-contestations-anomalies', () => ({
  anonymiserLesAnomalies: m.anonymiserLesAnomalies,
  purgerLesContestations: m.purgerLesContestations,
  purgerLesDementis: m.purgerLesDementis,
}));
vi.mock('../../../src/server/taches/completer-code-naf', () => ({
  completerLesCodesNaf: m.completerLesCodesNaf,
  portsDeBase: m.portsDeBaseNaf,
}));
vi.mock('../../../src/server/integrations/recherche-entreprises/tiers', () => ({
  clientDuTiers: m.clientDuTiers,
}));
vi.mock('../../../src/server/integrations/recherche-entreprises/disjoncteur', () => ({
  creerDisjoncteur: m.creerDisjoncteur,
}));
vi.mock('../../../src/server/integrations/recherche-entreprises/limiteur', () => ({
  limiteurDuRegistre: { global: m.debitGlobal },
}));

import {
  battementDeLaReconciliation,
  canalDAlerte,
  inscriptions,
  passageDeReconciliation,
  passageDesEvenementsRecus,
  passageDuJournal,
  traitantsDeReception,
} from '../../../src/server/taches/inscriptions';
import { TACHE_DE_RECEPTION } from '../../../src/server/queue/workers/evenement-recu';
import { PARAMETRES } from '../../../src/server/integrations/recherche-entreprises/parametres';

const PRISMA = { nom: 'client-de-test' } as unknown as PrismaClient;
const RECU = {
  id: 'e1',
  eventType: TypeEvenementRecu.candidature_recue,
  sujetRef: null,
  charge: {},
  retryCount: 0,
};

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
});

describe('REQ-QA-027 — les traitants branchés', () => {
  it('REQ-QA-027 : les traitants branchés aujourd’hui — la candidature reçue, et la projection de l’antériorité (DM-10-P)', () => {
    expect(Object.keys(traitantsDeReception(PRISMA))).toEqual([
      TypeEvenementRecu.candidature_recue,
      TypeEvenementRecu.client_cree,
      TypeEvenementRecu.client_mis_a_jour,
      TypeEvenementRecu.devis_emis,
      TypeEvenementRecu.devis_signe,
      TypeEvenementRecu.facture_emise,
      TypeEvenementRecu.avoir_emis,
      TypeEvenementRecu.facture_annulee,
    ]);
  });
});

describe('REQ-QA-027 — le passage des événements reçus', () => {
  it('REQ-QA-027 : les deux reprises s’additionnent, sur le préfixe des coordonnées, et le dépôt donné est celui du travail', async () => {
    m.reprendreLesAttentes.mockReturnValue(async () => 2);
    m.reprendreLesTraitants.mockReturnValue(async () => 3);
    m.passerLeTravail.mockResolvedValue({ traites: 1, enAttente: 0, enErreur: 0, reveilles: 5 });
    const depot = { battre: vi.fn() };
    const r = await passageDesEvenementsRecus(PRISMA, depot as never)();
    expect(r).toEqual({ traites: 1, enAttente: 0, enErreur: 0, reveilles: 5 });
    // INT-T49 : la reprise reçoit l'horloge du passage, qui la borne par l'âge.
    expect(m.reprendreLesAttentes).toHaveBeenCalledWith(
      PRISMA,
      'coordonnees:',
      expect.any(Function)
    );
    const d = m.passerLeTravail.mock.calls[0]![0] as {
      depot: unknown;
      reprendre: () => Promise<number>;
      maintenant: () => Date;
    };
    expect(d.depot).toBe(depot);
    expect(await d.reprendre()).toBe(5);
    expect(d.maintenant()).toBeInstanceOf(Date);
  });

  it('REQ-QA-027 : sans dépôt donné (la route), c’est le dépôt du travail, qui bat', async () => {
    const depot = { battre: vi.fn() };
    m.depotDuTravail.mockReturnValue(depot);
    m.reprendreLesAttentes.mockReturnValue(async () => 0);
    m.reprendreLesTraitants.mockReturnValue(async () => 0);
    m.passerLeTravail.mockResolvedValue({});
    await passageDesEvenementsRecus(PRISMA)();
    expect((m.passerLeTravail.mock.calls[0]![0] as { depot: unknown }).depot).toBe(depot);
  });

  it('REQ-QA-027 : le lanceur reçoit un dépôt qui ne bat PAS — le battement est le sien', async () => {
    const battre = vi.fn();
    const aTraiter = vi.fn();
    m.depotDuTravail.mockReturnValue({ battre, aTraiter });
    m.reprendreLesAttentes.mockReturnValue(async () => 0);
    m.reprendreLesTraitants.mockReturnValue(async () => 0);
    m.passerLeTravail.mockResolvedValue({});
    // INT-T54 : aucune attente en cours, aucune alerte due.
    m.lireLesAttentes.mockReturnValue(async () => []);
    await inscriptions(PRISMA).evenements_recus!();
    const d = m.passerLeTravail.mock.calls[0]![0] as {
      depot: { battre: (...a: unknown[]) => Promise<unknown>; aTraiter: unknown };
    };
    expect(d.depot.aTraiter).toBe(aTraiter);
    expect(await d.depot.battre('evenements_recus', { echecAt: new Date(0) })).toBeUndefined();
    expect(battre).not.toHaveBeenCalled();
  });
});

describe('REQ-QA-027 — le traitant de la candidature relit ses secrets à chaque traitement', () => {
  const traitant = () => traitantsDeReception(PRISMA)[TypeEvenementRecu.candidature_recue]!;

  it('REQ-QA-027 : environnement refusé — `environnement_refuse`, rien n’est traité', async () => {
    m.lireEnvironnement.mockReturnValue({ ok: false });
    await expect(traitant()(RECU)).rejects.toThrow('environnement_refuse');
    expect(m.traiterCandidatureRecue).not.toHaveBeenCalled();
  });

  it('REQ-QA-027 : trousseaux refusés — `environnement_refuse`, rien n’est traité', async () => {
    m.lireEnvironnement.mockReturnValue({ ok: true, env: { AXIONIA_RELECTURE_SECRET: 's' } });
    m.lireTrousseaux.mockReturnValue({ ok: false });
    await expect(traitant()(RECU)).rejects.toThrow('environnement_refuse');
    expect(m.traiterCandidatureRecue).not.toHaveBeenCalled();
  });

  it('REQ-QA-027 : environnement admis — la candidature est traitée, avec le secret de relecture et le trousseau d’émission', async () => {
    m.lireEnvironnement.mockReturnValue({
      ok: true,
      env: { AXIONIA_RELECTURE_SECRET: 'relecture' },
    });
    m.lireTrousseaux.mockReturnValue({
      ok: true,
      trousseaux: { AXIONIA_WEBHOOK_SECRET: { courante: 'c', precedente: null } },
    });
    const tirer = vi.fn();
    m.clientCoordonnees.mockReturnValue(tirer);
    m.clesPii.mockReturnValue('cles');
    m.traiterCandidatureRecue.mockResolvedValue('cree');
    await traitant()(RECU);
    expect(m.clientCoordonnees).toHaveBeenCalledWith(
      expect.objectContaining({
        secretRelecture: 'relecture',
        trousseauEmission: { courante: 'c', precedente: null },
      })
    );
    const [prisma, recu, deps] = m.traiterCandidatureRecue.mock.calls[0]! as [
      unknown,
      unknown,
      { tirer: unknown; cles: unknown; maintenant: () => Date },
    ];
    expect([prisma, recu, deps.tirer, deps.cles]).toEqual([PRISMA, RECU, tirer, 'cles']);
    expect(deps.maintenant()).toBeInstanceOf(Date);
  });
});

// ── DM-62 : chaque passage planifié joue SA tâche, sur le client donné, à l'heure du système ─────

describe('REQ-QA-027 — les passages planifiés reçoivent le client et l’heure du système', () => {
  const INSTANT = new Date('2026-10-03T08:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers({ now: INSTANT, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const PURGES = [
    ['contacts_purger', 'purgerLesContacts'],
    ['siren_refuses_purger', 'purgerLesSirenRefuses'],
    ['droits_contact_purger', 'purgerLesValeursDesDroits'],
    ['droits_contact_anonymiser', 'anonymiserLesTracesDesDroits'],
    ['anomalies_anonymiser', 'anonymiserLesAnomalies'],
    ['contestations_purger', 'purgerLesContestations'],
    ['dementis_purger', 'purgerLesDementis'],
  ] as const;

  for (const [cle, purge] of PURGES) {
    it(`REQ-QA-027 : \`${cle}\` joue \`${purge}\` sur le client, à l'heure du système, et rend ses compteurs`, async () => {
      const compteurs = { [cle]: 7 };
      m[purge].mockResolvedValue(compteurs);
      expect(await inscriptions(PRISMA)[cle]!()).toBe(compteurs);
      expect(m[purge]).toHaveBeenCalledTimes(1);
      expect(m[purge]).toHaveBeenCalledWith(PRISMA, INSTANT);
      for (const [, autre] of PURGES) if (autre !== purge) expect(m[autre]).not.toHaveBeenCalled();
    });
  }

  it('REQ-QA-027 : la minimisation des candidatures rend le nombre minimisé, à l’heure du système', async () => {
    m.minimiserCandidatures.mockResolvedValue(4);
    expect(await inscriptions(PRISMA).minimiser_candidatures!()).toEqual({ minimisees: 4 });
    expect(m.minimiserCandidatures).toHaveBeenCalledWith(PRISMA, INSTANT);
  });

  it('REQ-QA-027 : la reprise des codes NAF reçoit ses ports, le tiers réglé par ses paramètres, un disjoncteur neuf et le débit partagé', async () => {
    m.portsDeBaseNaf.mockReturnValue({ lire: 'lire', ecrire: 'ecrire' });
    m.clientDuTiers.mockReturnValue('tiers');
    m.creerDisjoncteur.mockReturnValue('disjoncteur');
    m.completerLesCodesNaf.mockResolvedValue({ completes: 1 });
    m.debitGlobal.mockResolvedValue('passe');
    expect(await inscriptions(PRISMA).naf_completer!()).toEqual({ completes: 1 });
    expect(m.portsDeBaseNaf).toHaveBeenCalledWith(PRISMA);
    expect(m.clientDuTiers).toHaveBeenCalledWith({
      fetch,
      urlDeBase: PARAMETRES.urlDeBase.valeur,
      delaiMs: PARAMETRES.delaiAttenteMs.valeur,
    });
    const ports = m.completerLesCodesNaf.mock.calls[0]![0] as {
      lire: unknown;
      ecrire: unknown;
      tiers: unknown;
      disjoncteur: unknown;
      debit: (ms: number) => Promise<unknown>;
      maintenantMs: () => number;
    };
    expect([ports.lire, ports.ecrire, ports.tiers, ports.disjoncteur]).toEqual([
      'lire',
      'ecrire',
      'tiers',
      'disjoncteur',
    ]);
    expect(await ports.debit(250)).toBe('passe');
    expect(m.debitGlobal).toHaveBeenCalledWith(250);
    expect(ports.maintenantMs()).toBe(INSTANT.getTime());
  });
});

describe('REQ-QA-027 — le battement de la réconciliation, lu en base', () => {
  it('REQ-QA-027 : le dernier succès et les compteurs viennent du battement de `reconciliation_axionia`', async () => {
    const succes = new Date('2026-10-02T00:00:00.000Z');
    const findUnique = vi.fn(async () => ({
      dernierSuccesAt: succes,
      compteurs: { manquants: 2 },
    }));
    const b = battementDeLaReconciliation({ battement: { findUnique } } as unknown as PrismaClient);
    expect(await b.dernierSucces()).toBe(succes);
    expect(await b.derniersCompteurs()).toEqual({ manquants: 2 });
    expect(findUnique).toHaveBeenCalledWith({
      where: { tache: 'reconciliation_axionia' },
      select: { dernierSuccesAt: true, compteurs: true },
    });
  });

  it('REQ-QA-027 : sans battement (premier passage), ni succès ni compteurs', async () => {
    const findUnique = vi.fn(async () => null);
    const b = battementDeLaReconciliation({ battement: { findUnique } } as unknown as PrismaClient);
    expect(await b.dernierSucces()).toBeNull();
    expect(await b.derniersCompteurs()).toBeNull();
  });
});

describe('REQ-QA-027 — le canal d’alerte du serveur', () => {
  it('REQ-QA-027 : sans jeton ou sans salon, absent ou vide, aucun canal', () => {
    for (const env of [
      {},
      { TELEGRAM_CHAT_ID: '42' },
      { TELEGRAM_BOT_TOKEN: 'jeton' },
      { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '42' },
      { TELEGRAM_BOT_TOKEN: 'jeton', TELEGRAM_CHAT_ID: '' },
    ]) {
      expect(canalDAlerte(env)).toBeNull();
    }
  });

  it('REQ-QA-027 : avec un jeton et un salon, un canal qui alerte', () => {
    const canal = canalDAlerte({ TELEGRAM_BOT_TOKEN: 'jeton', TELEGRAM_CHAT_ID: '42' });
    expect(canal).not.toBeNull();
    expect(typeof canal!.alerter).toBe('function');
  });
});

describe('REQ-QA-027 — l’alerte des attentes, en fin de passage', () => {
  it('REQ-QA-027 : avec des alertes branchées, le passage lit les attentes ; sans, il ne les lit pas', async () => {
    m.reprendreLesAttentes.mockReturnValue(async () => 0);
    m.reprendreLesTraitants.mockReturnValue(async () => 0);
    m.passerLeTravail.mockResolvedValue({});
    const lire = vi.fn(async () => []);
    const alertes = { lireLesAttentes: lire, dernierSucces: vi.fn(), alerteur: null };
    const depot = { battre: vi.fn() };
    await passageDesEvenementsRecus(PRISMA, depot as never, alertes as never)();
    expect(lire).toHaveBeenCalledTimes(1);
    lire.mockClear();
    await passageDesEvenementsRecus(PRISMA, depot as never, null)();
    expect(lire).not.toHaveBeenCalled();
  });
});

// ── DM-60 : les témoins qui ferment les mutants de la composition ──────────────────────────────

describe('REQ-QA-027 — les alertes d’attente dues, bornées par le dernier succès', () => {
  /** Une attente reçue à l'époque Unix : au-delà de tout seuil, donc DUE si rien ne l'a déjà vue. */
  const ATTENTE_ANCIENNE = {
    eventType: TypeEvenementRecu.candidature_recue,
    dependanceRef: 'coordonnees:x',
    receivedAt: new Date(0),
  };
  const prismaDuBattement = (battement: { dernierSuccesAt: Date } | null) => {
    const findUnique = vi.fn(async () => battement);
    return { findUnique, prisma: { battement: { findUnique } } as unknown as PrismaClient };
  };
  const lancerLaReception = async (prisma: PrismaClient) => {
    m.depotDuTravail.mockReturnValue({ battre: vi.fn() });
    m.reprendreLesAttentes.mockReturnValue(async () => 0);
    m.reprendreLesTraitants.mockReturnValue(async () => 0);
    m.passerLeTravail.mockResolvedValue({});
    m.lireLesAttentes.mockReturnValue(async () => [ATTENTE_ANCIENNE]);
    return inscriptions(prisma, {}).evenements_recus!();
  };

  it('REQ-QA-027 : jamais réussie, une attente ancienne est DUE, et sans canal le passage échoue en le nommant', async () => {
    const { findUnique, prisma } = prismaDuBattement(null);
    await expect(lancerLaReception(prisma)).rejects.toThrow('canal_alerte_absent');
    expect(findUnique).toHaveBeenCalledWith({
      where: { tache: TACHE_DE_RECEPTION },
      select: { dernierSuccesAt: true },
    });
  });

  it('REQ-QA-027 : le dernier succès lu au battement borne la fenêtre — déjà vue, rien n’est dû', async () => {
    const { prisma } = prismaDuBattement({ dernierSuccesAt: new Date() });
    await expect(lancerLaReception(prisma)).resolves.toEqual({});
  });
});

describe('REQ-QA-027 — la réconciliation quotidienne, composée sur ses ports', () => {
  type Composee = {
    dernierSucces: () => Promise<Date | null>;
    derniersCompteurs: () => Promise<unknown>;
    maintenant: () => Date;
    reconcilier: () => Promise<unknown>;
  };
  const composer = (env: Record<string, string>, alerteur: { alerter: never } | null) => {
    const passage = vi.fn();
    m.passageQuotidien.mockReturnValue(passage);
    expect(passageDeReconciliation(PRISMA, env, alerteur)).toBe(passage);
    return m.passageQuotidien.mock.calls.at(-1)![0] as Composee;
  };
  const admis = () => {
    m.lireEnvironnement.mockReturnValue({ ok: true, env: { AXIONIA_RELECTURE_SECRET: 'relu' } });
    m.lireTrousseaux.mockReturnValue({
      ok: true,
      trousseaux: { AXIONIA_WEBHOOK_SECRET: { courante: 'c', precedente: null } },
    });
  };

  it('REQ-QA-027 : environnement refusé — `environnement_refuse`, rien n’est relu', () => {
    m.lireEnvironnement.mockReturnValue({ ok: false });
    expect(() => composer({}, null).reconcilier()).toThrow('environnement_refuse');
    expect(m.reconcilier).not.toHaveBeenCalled();
  });

  it('REQ-QA-027 : trousseaux refusés — `environnement_refuse`, rien n’est relu', () => {
    m.lireEnvironnement.mockReturnValue({ ok: true, env: { AXIONIA_RELECTURE_SECRET: 'relu' } });
    m.lireTrousseaux.mockReturnValue({ ok: false });
    expect(() => composer({}, null).reconcilier()).toThrow('environnement_refuse');
    expect(m.reconcilier).not.toHaveBeenCalled();
  });

  it('REQ-QA-027 : admis — la relecture et le rejeu reçoivent l’adresse, le secret, le trousseau et l’horloge', async () => {
    admis();
    m.portsDeReconciliation.mockReturnValue({ port: 'base' });
    m.clientRelecture.mockReturnValue('lire');
    m.clientRejeu.mockReturnValue('rejouer');
    m.reconcilier.mockResolvedValue({ relus: 7 });
    const c = composer({ AXIONIA_BASE_URL: 'https://axionia.test' }, null);
    expect(c.maintenant()).toBeInstanceOf(Date);
    expect(await c.reconcilier()).toEqual({ relus: 7 });
    const canal = m.clientRelecture.mock.calls[0]![0] as {
      urlAxionia: string;
      secretRelecture: string;
      trousseauEmission: unknown;
      appeler: unknown;
      maintenantMs: () => number;
    };
    expect(canal).toMatchObject({
      urlAxionia: 'https://axionia.test',
      secretRelecture: 'relu',
      trousseauEmission: { courante: 'c', precedente: null },
      appeler: fetch,
    });
    expect(typeof canal.maintenantMs()).toBe('number');
    expect(m.clientRejeu.mock.calls[0]![0]).toBe(canal);
    expect(m.portsDeReconciliation).toHaveBeenCalledWith(PRISMA);
    expect(m.reconcilier.mock.calls[0]![0]).toMatchObject({
      port: 'base',
      lire: 'lire',
      rejouer: 'rejouer',
    });
  });

  it('REQ-QA-027 : un signal part en alerte `reconciliation` — le nombre OU le motif, jamais les deux ; sans canal, rien ne lève', async () => {
    admis();
    const alerter = vi.fn(async () => undefined);
    m.reconcilier.mockResolvedValue({});
    const canal = { alerter };
    await composer({}, canal as never).reconcilier();
    const { signaler } = m.reconcilier.mock.calls[0]![0] as {
      signaler: (s: object) => Promise<void>;
    };
    await signaler({ genre: 'trou_rattrape', nombre: 3 });
    await signaler({ genre: 'relecture_en_echec', motif: 'injoignable' });
    const [premier, second] = alerter.mock.calls.map((c) => (c as unknown[])[0]) as {
      categorie: string;
      id: string;
      reconciliation: object;
    }[];
    expect(premier).toMatchObject({
      categorie: 'reconciliation',
      reconciliation: { genre: 'trou_rattrape', nombre: 3 },
    });
    expect(premier!.reconciliation).not.toHaveProperty('motif');
    expect(second!.reconciliation).toEqual({ genre: 'relecture_en_echec', motif: 'injoignable' });
    expect(premier!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(premier!.id).not.toBe(second!.id);

    m.reconcilier.mockReset();
    m.reconcilier.mockResolvedValue({});
    await composer({}, null).reconcilier();
    const sansCanal = m.reconcilier.mock.calls[0]![0] as { signaler: (s: object) => Promise<void> };
    await expect(
      sansCanal.signaler({ genre: 'trou_rattrape', nombre: 1 })
    ).resolves.toBeUndefined();
  });
});

describe('REQ-QA-027 — la vérification du journal et l’adresse relue du traitant', () => {
  it('REQ-QA-027 : une chaîne vide fait échouer la vérification, en nommant la faute et « aucun » maillon', async () => {
    await expect(passageDuJournal(async () => [])()).rejects.toThrow(
      'chaine_rompue : chaine_vide, maillon aucun'
    );
  });

  it('REQ-QA-027 : le traitant de la candidature relit l’adresse d’axion-ia et l’horloge à chaque traitement', async () => {
    vi.stubEnv('AXIONIA_BASE_URL', 'https://axionia.relue');
    try {
      m.lireEnvironnement.mockReturnValue({ ok: true, env: { AXIONIA_RELECTURE_SECRET: 'r' } });
      m.lireTrousseaux.mockReturnValue({ ok: true, trousseaux: { AXIONIA_WEBHOOK_SECRET: 'k' } });
      m.traiterCandidatureRecue.mockResolvedValue('cree');
      await traitantsDeReception(PRISMA)[TypeEvenementRecu.candidature_recue]!(RECU);
      const canal = m.clientCoordonnees.mock.calls[0]![0] as {
        urlAxionia: string;
        appeler: unknown;
        maintenantMs: () => number;
      };
      expect(canal.urlAxionia).toBe('https://axionia.relue');
      expect(canal.appeler).toBe(fetch);
      expect(typeof canal.maintenantMs()).toBe('number');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
