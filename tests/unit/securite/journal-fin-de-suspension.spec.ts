// @req REQ-SEC-019
/**
 * SEC-15 — le lecteur du journal qui date la FIN d'une suspension (A02, #794, 6036174464, d'après la
 * juriste, 6036161128) : la PREMIÈRE levée postérieure au fait de la pose, ou à défaut le premier
 * passage à `resilie`. Une charge illisible n'est jamais sautée : elle rend null, et le texte de la
 * décision est gardé.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { finDUneSuspension } from '../../../src/server/evenement/journal';

const APPORTEUR = '0190f0c2-0000-7000-8000-0000000000a1';
const LEVEE = new Date('2026-10-22T07:30:00.000Z');
const RESILIATION = new Date('2027-01-05T09:00:00.000Z');

type Fait = { id: bigint; type: string; survenuAt: Date; charge: unknown };
const levee = (
  id: bigint,
  charge: unknown = {
    de: 'gele_fraude',
    vers: 'libre',
    par: 'plein_droit',
    acteur: { par: 'systeme' },
  }
): Fait => ({
  id,
  type: 'apporteur_gel_modifie',
  survenuAt: LEVEE,
  charge,
});
const resilie = (id: bigint): Fait => ({
  id,
  type: 'apporteur_statut_modifie',
  survenuAt: RESILIATION,
  charge: {
    de: 'suspendu',
    vers: 'resilie',
    transition: 'resilier',
    resiliationMotif: 'manquement_grave',
    acteur: { par: 'utilisateur_console', id: APPORTEUR },
  },
});

function unJournal(faits: Fait[]) {
  const findFirst = vi.fn(
    async (args: { where: { type: string; id: { gt: bigint }; charge?: unknown } }) =>
      faits
        .filter((f) => f.type === args.where.type && f.id > args.where.id.gt)
        .filter((f) =>
          args.where.charge === undefined
            ? true
            : (f.charge as { vers?: string }).vers === 'resilie'
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null
  );
  return { client: { evenement: { findFirst } } as unknown as PrismaClient, findFirst };
}

describe('REQ-SEC-019 — la fin d’une suspension, lue au journal par son module', () => {
  it('REQ-SEC-019 : TÉMOIN — la première levée après la pose donne la fin, et sa source', async () => {
    const j = unJournal([levee(12n), resilie(20n)]);
    expect(await finDUneSuspension(j.client, APPORTEUR, 10n)).toEqual({
      fin: LEVEE,
      par: 'levee',
    });
    expect(j.findFirst.mock.calls[0]![0]).toEqual({
      where: {
        agregat: 'apporteur',
        agregatId: APPORTEUR,
        type: 'apporteur_gel_modifie',
        id: { gt: 10n },
      },
      orderBy: { id: 'asc' },
      select: { survenuAt: true, charge: true },
    });
  });

  it('REQ-SEC-019 : TÉMOIN — deux suspensions successives : chacune prend SA levée', async () => {
    const seconde = levee(32n);
    const j = unJournal([levee(12n), seconde]);
    // La pose de la seconde suspension est le fait 30 : sa levée est le fait 32, jamais le fait 12.
    j.findFirst.mockImplementationOnce(
      async () =>
        ({ survenuAt: new Date('2027-03-01T08:00:00.000Z'), charge: seconde.charge }) as never
    );
    expect((await finDUneSuspension(j.client, APPORTEUR, 30n))?.fin).toEqual(
      new Date('2027-03-01T08:00:00.000Z')
    );
    expect((j.findFirst.mock.calls[0]![0] as { where: { id: { gt: bigint } } }).where.id.gt).toBe(
      30n
    );
  });

  it('REQ-SEC-019 : TÉMOIN — sans levée, la fin du contrat (le premier passage à résilié) donne la fin', async () => {
    const j = unJournal([resilie(20n)]);
    expect(await finDUneSuspension(j.client, APPORTEUR, 10n)).toEqual({
      fin: RESILIATION,
      par: 'fin_du_contrat',
    });
  });

  it('REQ-SEC-019 : TÉMOIN — une suspension en cours n’a pas de fin', async () => {
    expect(await finDUneSuspension(unJournal([]).client, APPORTEUR, 10n)).toBeNull();
  });

  it('REQ-SEC-019 : TÉMOIN — une levée illisible n’est jamais sautée : pas de fin, le texte est gardé', async () => {
    for (const charge of [
      { de: 'gele_fraude', vers: 'libre' },
      { de: 'libre', vers: 'gele_fraude', par: 'role', acteur: { par: 'systeme' } },
    ]) {
      const j = unJournal([levee(12n, charge), resilie(20n)]);
      expect(await finDUneSuspension(j.client, APPORTEUR, 10n), JSON.stringify(charge)).toBeNull();
    }
  });

  it('REQ-SEC-019 : un agrégat hors forme est refusé avant toute lecture', async () => {
    const j = unJournal([]);
    await expect(finDUneSuspension(j.client, 'pas-un-uuid', 10n)).rejects.toThrow(
      'lecture_du_journal_refusee'
    );
    expect(j.findFirst).not.toHaveBeenCalled();
  });
});
