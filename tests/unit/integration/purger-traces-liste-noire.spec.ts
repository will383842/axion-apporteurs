// @req REQ-DM-028
/**
 * DM-65 — la purge de la trace de la liste, jugée EN PROCESSUS sur un faux client : la limite est
 * l'instant moins `LISTE_NOIRE_TRACE_ANS` ans civils (UTC), seules les périodes FERMÉES échues sont
 * lues et effacées, par lots bornés, et la boucle s'arrête quand un lot n'efface rien. L'échéance à la
 * milliseconde, sur base réelle, est jugée par `tests/integration/liste-noire-trace.spec.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE,
  limiteDesTracesDeLaListe,
  purgerLesTracesDeLaListe,
} from '../../../src/server/taches/purger-traces-liste-noire';

const MAINTENANT = new Date('2026-10-07T12:00:00.000Z');
const ANS = SEUILS.LISTE_NOIRE_TRACE_ANS.valeur;

describe('REQ-DM-028 — la limite de la purge', () => {
  it('REQ-DM-028 : TÉMOIN — la limite est l’instant moins LISTE_NOIRE_TRACE_ANS ans civils, en UTC, à la milliseconde', () => {
    const limite = limiteDesTracesDeLaListe(MAINTENANT);
    expect(limite.toISOString()).toBe(`${2026 - ANS}-10-07T12:00:00.000Z`);
    // L'instant d'origine n'est pas modifié.
    expect(MAINTENANT.toISOString()).toBe('2026-10-07T12:00:00.000Z');
  });
});

describe('REQ-DM-028 — la purge de la trace', () => {
  /** Un faux client : des lots d'identifiants rendus à tour de rôle, et le nombre d'effacements demandé. */
  function faux(lots: string[][], comptes: number[]) {
    const lectures: unknown[] = [];
    const effacements: unknown[] = [];
    let lu = 0;
    let efface = 0;
    const prisma = {
      sirenListeNoireTrace: {
        findMany: vi.fn(async (q: unknown) => {
          lectures.push(q);
          return (lots[lu++] ?? []).map((id) => ({ id }));
        }),
        deleteMany: vi.fn(async (q: unknown) => {
          effacements.push(q);
          return { count: comptes[efface++] ?? 0 };
        }),
      },
    };
    return { prisma: prisma as unknown as PrismaClient, lectures, effacements };
  }

  it('REQ-DM-028 : TÉMOIN — seules les périodes FERMÉES échues sont lues, du plus ancien retrait au plus récent, par lots bornés', async () => {
    const f = faux([['a', 'b']], [2]);
    await purgerLesTracesDeLaListe(f.prisma, MAINTENANT);
    const limite = limiteDesTracesDeLaListe(MAINTENANT);
    expect(f.lectures[0]).toEqual({
      where: { retireAt: { not: null, lte: limite } },
      select: { id: true },
      orderBy: [{ retireAt: 'asc' }, { id: 'asc' }],
      take: LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE,
    });
    expect(LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE).toBe(500);
  });

  it('REQ-DM-028 : TÉMOIN — l’effacement ne vise que les identifiants lus, et rejuge l’échéance (une période ouverte ne s’efface pas)', async () => {
    const f = faux([['a', 'b']], [2]);
    await purgerLesTracesDeLaListe(f.prisma, MAINTENANT);
    expect(f.effacements[0]).toEqual({
      where: {
        id: { in: ['a', 'b'] },
        retireAt: { not: null, lte: limiteDesTracesDeLaListe(MAINTENANT) },
      },
    });
  });

  it('REQ-DM-028 : rien d’échu — rien n’est effacé, le compte est nul', async () => {
    const f = faux([], []);
    expect(await purgerLesTracesDeLaListe(f.prisma, MAINTENANT)).toEqual({ effacees: 0 });
    expect(f.effacements).toEqual([]);
  });

  it('REQ-DM-028 : TÉMOIN — par lots jusqu’à épuisement : les effacements s’additionnent, et la boucle s’arrête au premier lot vide', async () => {
    const f = faux([['a', 'b'], ['c'], []], [2, 1]);
    expect(await purgerLesTracesDeLaListe(f.prisma, MAINTENANT)).toEqual({ effacees: 3 });
    expect(f.lectures).toHaveLength(3);
    expect(f.effacements).toHaveLength(2);
  });

  it('REQ-DM-028 : TÉMOIN — un lot échu qui n’est pas effacé arrête la boucle, au lieu de la relire à l’infini', async () => {
    const f = faux([['a'], ['a'], ['a']], [0, 0, 0]);
    expect(await purgerLesTracesDeLaListe(f.prisma, MAINTENANT)).toEqual({ effacees: 0 });
    expect(f.lectures).toHaveLength(1);
    expect(f.effacements).toHaveLength(1);
  });

  it('REQ-DM-028 : un lot partiellement effacé compte ce que la base a effacé, et la boucle continue', async () => {
    const f = faux([['a', 'b'], ['b'], []], [1, 1]);
    expect(await purgerLesTracesDeLaListe(f.prisma, MAINTENANT)).toEqual({ effacees: 2 });
  });
});
