// @req REQ-SEC-018
// @req REQ-SEC-019
// @req REQ-JUR-006
/**
 * SEC-15 — la pose et la levée du gel au SERVEUR, jugées EN PROCESSUS sur un double de Prisma : le
 * droit, la machine des statuts, l'écriture unique, l'ordre des faits du journal, la levée de plein
 * droit. Ce que la base en fait (CHECK, garde, clés étrangères) est jugé en base réelle par
 * `tests/integration/suspension.spec.ts`. Ce fichier existe aussi pour la mutation.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ErreurSuspension,
  leverLesSuspensionsEchues,
  leverUneSuspension,
  poserUneSuspension,
} from '../../../src/server/apporteur/suspension';

const APPORTEUR = '0190f0c2-0000-7000-8000-0000000000a1';
const ADMIN = '0190f0c2-0000-7000-8000-0000000000ad';
const ANOMALIE = '0190f0c2-0000-7000-8000-0000000000e1';
const MAINTENANT = new Date('2026-10-07T07:30:00.000Z');

type Ligne = { statut: string; etat_gel: string };

function unDouble(o: {
  ligne?: Ligne | null;
  anomalie?: { statut: string; apporteurId: string | null } | null;
  ecrites?: number;
  echues?: { id: string; depotsGelesDepuis: Date }[];
}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const tx = {
    $queryRaw: vi.fn(async () =>
      o.ligne === null ? [] : [o.ligne ?? { statut: 'signe', etat_gel: 'libre' }]
    ),
    anomalie: {
      findUnique: vi.fn(async (args: unknown) => {
        appels.push({ quoi: 'anomalie', args });
        return o.anomalie === undefined
          ? { statut: 'confirmee', apporteurId: APPORTEUR }
          : o.anomalie;
      }),
    },
    apporteur: {
      updateMany: vi.fn(async (args: unknown) => {
        appels.push({ quoi: 'ecrire', args });
        return { count: o.ecrites ?? 1 };
      }),
      findMany: vi.fn(async (args: unknown) => {
        appels.push({ quoi: 'lire_echues', args });
        return o.echues ?? [];
      }),
    },
  };
  const faits: { type: string; charge: unknown }[] = [];
  const ecrireUnFait = vi.fn(async (_tx: unknown, e: { type: string; charge: unknown }) => {
    faits.push({ type: e.type, charge: e.charge });
    return { id: String(faits.length), selfHash: 'x' };
  });
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (f: (t: unknown) => Promise<unknown>) => f(tx)),
  } as unknown as PrismaClient;
  return { tx: tx as never, prisma, appels, faits, ecrireUnFait };
}

const motif = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurSuspension) return e.motif;
    throw e;
  }
  return 'aucun refus';
};

const ADMIN_ROLE = { id: ADMIN, role: 'admin' } as const;
const DEMENTI = {
  motif: 'gele_non_confirmation',
  indicationRecueAt: MAINTENANT.getTime() - 3_600_000,
} as const;

describe('REQ-SEC-018 — la pose : un rôle habilité, une écriture, deux faits', () => {
  it('REQ-SEC-018 : TÉMOIN — un admin pose le gel : statut, gel, instant et auteur dans UNE écriture, puis le statut et le gel au journal', async () => {
    const d = unDouble({});
    await poserUneSuspension(d.tx, {
      apporteurId: APPORTEUR,
      faits: DEMENTI,
      acteur: ADMIN_ROLE,
      maintenant: MAINTENANT,
      ecrireUnFait: d.ecrireUnFait,
    });
    expect(d.appels.filter((a) => a.quoi === 'ecrire')).toEqual([
      {
        quoi: 'ecrire',
        args: {
          where: { id: APPORTEUR, statut: 'signe', etatGel: 'libre' },
          data: {
            statut: 'suspendu',
            etatGel: 'gele_non_confirmation',
            depotsGelesDepuis: MAINTENANT,
            gelAnomalieId: null,
            gelPoseParId: ADMIN,
          },
        },
      },
    ]);
    const acteur = { par: 'utilisateur_console', id: ADMIN };
    expect(d.faits).toEqual([
      {
        type: 'apporteur_statut_modifie',
        charge: { de: 'signe', vers: 'suspendu', transition: 'suspendre', acteur },
      },
      {
        type: 'apporteur_gel_modifie',
        charge: { de: 'libre', vers: 'gele_non_confirmation', par: 'role', acteur },
      },
    ]);
  });

  it('REQ-SEC-018 : TÉMOIN — un autre rôle que admin est refusé, sans rien lire ni écrire', async () => {
    for (const role of ['qualifieur', 'comptable', 'lecteur', 'inconnu']) {
      const d = unDouble({});
      expect(
        await motif(
          poserUneSuspension(d.tx, {
            apporteurId: APPORTEUR,
            faits: DEMENTI,
            acteur: { id: ADMIN, role },
            maintenant: MAINTENANT,
            ecrireUnFait: d.ecrireUnFait,
          })
        ),
        role
      ).toBe('droit_absent');
      expect(d.appels, role).toEqual([]);
      expect(d.faits, role).toEqual([]);
    }
  });

  it('REQ-SEC-018 : TÉMOIN À DEUX FACES — la fraude exige une anomalie CONFIRMÉE de CET apporteur', async () => {
    const fraude = {
      motif: 'gele_fraude',
      anomalie: { id: ANOMALIE, confirmeeParUnHumain: true },
    } as const;
    for (const [anomalie, attendu] of [
      [null, 'anomalie_non_confirmee'],
      [{ statut: 'ouverte', apporteurId: APPORTEUR }, 'anomalie_non_confirmee'],
      [{ statut: 'confirmee', apporteurId: ADMIN }, 'anomalie_non_confirmee'],
    ] as const) {
      const d = unDouble({ anomalie });
      expect(
        await motif(
          poserUneSuspension(d.tx, {
            apporteurId: APPORTEUR,
            faits: fraude,
            acteur: ADMIN_ROLE,
            maintenant: MAINTENANT,
            ecrireUnFait: d.ecrireUnFait,
          })
        )
      ).toBe(attendu);
      expect(d.faits).toEqual([]);
    }
    const d = unDouble({});
    await poserUneSuspension(d.tx, {
      apporteurId: APPORTEUR,
      faits: fraude,
      acteur: ADMIN_ROLE,
      maintenant: MAINTENANT,
      ecrireUnFait: d.ecrireUnFait,
    });
    expect(
      (d.appels.find((a) => a.quoi === 'ecrire')!.args as { data: { gelAnomalieId: string } }).data
        .gelAnomalieId
    ).toBe(ANOMALIE);
    // Le journal ne porte jamais l'anomalie (DM-12, décision (d)).
    expect(JSON.stringify(d.faits)).not.toContain(ANOMALIE);
  });

  it('REQ-SEC-018 : un apporteur introuvable, déjà suspendu, ou non signé est refusé, sans écriture', async () => {
    for (const [ligne, attendu] of [
      [null, 'apporteur_introuvable'],
      [{ statut: 'suspendu', etat_gel: 'gele_fraude' }, 'deja_suspendu'],
      [{ statut: 'resilie', etat_gel: 'libre' }, 'statut_non_suspendable'],
    ] as const) {
      const d = unDouble({ ligne });
      expect(
        await motif(
          poserUneSuspension(d.tx, {
            apporteurId: APPORTEUR,
            faits: DEMENTI,
            acteur: ADMIN_ROLE,
            maintenant: MAINTENANT,
            ecrireUnFait: d.ecrireUnFait,
          })
        )
      ).toBe(attendu);
      expect(d.appels.filter((a) => a.quoi === 'ecrire')).toEqual([]);
    }
  });

  it('REQ-SEC-018 : une écriture qui ne trouve plus la ligne attendue est refusée, et rien n’est journalisé', async () => {
    const d = unDouble({ ecrites: 0 });
    expect(
      await motif(
        poserUneSuspension(d.tx, {
          apporteurId: APPORTEUR,
          faits: DEMENTI,
          acteur: ADMIN_ROLE,
          maintenant: MAINTENANT,
          ecrireUnFait: d.ecrireUnFait,
        })
      )
    ).toBe('deja_suspendu');
    expect(d.faits).toEqual([]);
  });
});

describe('REQ-SEC-019 — la levée, par un rôle ou de plein droit', () => {
  const GELE: Ligne = { statut: 'suspendu', etat_gel: 'gele_non_confirmation' };

  it('REQ-SEC-019 : TÉMOIN — un admin lève : statut et gel rendus, les trois colonnes à NULL, puis les deux faits', async () => {
    const d = unDouble({ ligne: GELE });
    await leverUneSuspension(d.tx, {
      apporteurId: APPORTEUR,
      par: { role: ADMIN_ROLE },
      maintenant: MAINTENANT,
      ecrireUnFait: d.ecrireUnFait,
    });
    expect(d.appels.filter((a) => a.quoi === 'ecrire')).toEqual([
      {
        quoi: 'ecrire',
        args: {
          where: { id: APPORTEUR, statut: 'suspendu', etatGel: 'gele_non_confirmation' },
          data: {
            statut: 'signe',
            etatGel: 'libre',
            depotsGelesDepuis: null,
            gelAnomalieId: null,
            gelPoseParId: null,
          },
        },
      },
    ]);
    const acteur = { par: 'utilisateur_console', id: ADMIN };
    expect(d.faits).toEqual([
      {
        type: 'apporteur_statut_modifie',
        charge: { de: 'suspendu', vers: 'signe', transition: 'lever_suspension', acteur },
      },
      {
        type: 'apporteur_gel_modifie',
        charge: { de: 'gele_non_confirmation', vers: 'libre', par: 'role', acteur },
      },
    ]);
  });

  it('REQ-SEC-019 : TÉMOIN — de plein droit, l’acteur est le système, et aucun droit n’est demandé', async () => {
    const d = unDouble({ ligne: GELE });
    await leverUneSuspension(d.tx, {
      apporteurId: APPORTEUR,
      par: 'plein_droit',
      maintenant: MAINTENANT,
      ecrireUnFait: d.ecrireUnFait,
    });
    expect(d.faits.map((f) => (f.charge as { acteur: unknown }).acteur)).toEqual([
      { par: 'systeme' },
      { par: 'systeme' },
    ]);
    expect((d.faits[1]!.charge as { par: string }).par).toBe('plein_droit');
  });

  it('REQ-SEC-019 : la levée par un rôle exige l’admin ; un apporteur non suspendu ne se lève pas', async () => {
    const d = unDouble({ ligne: GELE });
    expect(
      await motif(
        leverUneSuspension(d.tx, {
          apporteurId: APPORTEUR,
          par: { role: { id: ADMIN, role: 'qualifieur' } },
          maintenant: MAINTENANT,
          ecrireUnFait: d.ecrireUnFait,
        })
      )
    ).toBe('droit_absent');
    const libre = unDouble({});
    expect(
      await motif(
        leverUneSuspension(libre.tx, {
          apporteurId: APPORTEUR,
          par: 'plein_droit',
          maintenant: MAINTENANT,
          ecrireUnFait: libre.ecrireUnFait,
        })
      )
    ).toBe('non_suspendu');
  });

  it('REQ-SEC-019 : TÉMOIN — le passage ne lève que les gels ÉCHUS, chacun dans SA transaction', async () => {
    // Posé le 2026-09-22 09:30 à Paris : échu le 2026-10-07 09:30, l'instant même du passage.
    const echu = { id: APPORTEUR, depotsGelesDepuis: new Date('2026-09-22T07:30:00.000Z') };
    // Posé une minute plus tard : pas encore échu.
    const pasEncore = { id: ADMIN, depotsGelesDepuis: new Date('2026-09-22T07:31:00.000Z') };
    const d = unDouble({ ligne: GELE, echues: [echu, pasEncore] });
    expect(
      await leverLesSuspensionsEchues(d.prisma, MAINTENANT, { ecrireUnFait: d.ecrireUnFait })
    ).toEqual({ levees: 1 });
    expect(d.appels.find((a) => a.quoi === 'lire_echues')!.args).toEqual({
      where: { etatGel: { not: 'libre' }, depotsGelesDepuis: { lte: MAINTENANT } },
      select: { id: true, depotsGelesDepuis: true },
      orderBy: { depotsGelesDepuis: 'asc' },
    });
    expect(d.appels.filter((a) => a.quoi === 'ecrire')).toHaveLength(1);
  });
});
