// @req REQ-JUR-065
/**
 * DM-60 (REQ-JUR-065, partners/ADR-0031) — la tâche d'anonymisation, jugée EN PROCESSUS sur une base
 * simulée qui enregistre l'appel : Stryker ne joue pas les témoins en base réelle
 * (`tests/integration/demandes-droits-contact-anonymisation.spec.ts`), qui restent la preuve du
 * comportement. Ici : la limite (cinq ans civils, en UTC, lue dans la SSOT), et la forme EXACTE de
 * l'instruction unique — son filtre et ce qu'elle écrit.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  anonymiserLesTracesDesDroits,
  limiteDAnonymisation,
} from '../../../src/server/taches/anonymiser-traces-droits-contact';
import { SEUILS } from '../../../src/domain/seuils/ssot';

function baseQuiCompte(compte: number) {
  const appels: unknown[] = [];
  const prisma = {
    demandeDroitContact: {
      updateMany: (args: unknown) => {
        appels.push(args);
        return Promise.resolve({ count: compte });
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, appels };
}

describe('REQ-JUR-065 — la tâche d’anonymisation, en processus', () => {
  it('REQ-JUR-065 : la durée est celle de la SSOT, cinq ans', () => {
    expect(SEUILS.DROITS_CONTACT_TRACE_ANS.valeur).toBe(5);
    expect(SEUILS.DROITS_CONTACT_TRACE_ANS.unite).toBe('ans');
  });

  it('REQ-JUR-065 : la limite recule de cinq années civiles, en UTC, sans toucher l’heure', () => {
    expect(limiteDAnonymisation(new Date('2031-10-03T12:34:56.789Z')).toISOString()).toBe(
      '2026-10-03T12:34:56.789Z'
    );
    expect(limiteDAnonymisation(new Date('2031-01-01T00:30:00.000Z')).toISOString()).toBe(
      '2026-01-01T00:30:00.000Z'
    );
  });

  it('REQ-JUR-065 : UNE instruction — lien vidé et date posée, sur les traces non anonymisées, sans valeur, échues par leur clôture ou leur réception', async () => {
    const maintenant = new Date('2031-10-03T12:00:00.000Z');
    const limite = new Date('2026-10-03T12:00:00.000Z');
    const b = baseQuiCompte(4);
    expect(await anonymiserLesTracesDesDroits(b.prisma, maintenant)).toEqual({ anonymisees: 4 });
    expect(b.appels).toEqual([
      {
        where: {
          traceAnonymiseeAt: null,
          valeurChiffree: null,
          OR: [{ traiteeAt: { lte: limite } }, { traiteeAt: null, recueAt: { lte: limite } }],
        },
        data: { attributionId: null, traceAnonymiseeAt: maintenant },
      },
    ]);
  });
});
