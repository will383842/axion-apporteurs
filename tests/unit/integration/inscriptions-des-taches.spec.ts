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
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import {
  inscriptions,
  passageDesEvenementsRecus,
  traitantsDeReception,
} from '../../../src/server/taches/inscriptions';

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
