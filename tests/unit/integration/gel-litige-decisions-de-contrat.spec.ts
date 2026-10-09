// @req REQ-JUR-029
/**
 * JUR-T64 — le gel pour litige du texte d'une décision de contrat (code civil art. 2241 et 2231 ; règle
 * de la juriste, #703 6041829569 ; forme d'A02, #703 6041868006), jugé EN PROCESSUS sur un double de
 * Prisma : la règle du départ après les litiges, ce que le passage DEMANDE à la base (il saute une
 * décision dont un litige est ouvert, il lit la DERNIÈRE clôture) et ce qu'il en rend. Ce que la base en
 * fait — la naissance, l'ajout seul, le filet `decisions_de_contrat_gel_litige` — est jugé en base réelle
 * par `tests/integration/gel-litige-decisions-de-contrat.spec.ts`. Ce fichier-ci existe pour la mutation.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import {
  departApresLesLitiges,
  purgerLesTextesDesDecisions,
} from '../../../src/server/taches/purger-textes-des-decisions';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';

/** Une colonne DATE, telle que Prisma la rend : minuit UTC du jour civil. */
const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const civil = (annee: number, mois: number, j: number) => ({ annee, mois, jour: j });

describe('REQ-JUR-029 — JUR-T64 : le départ après les litiges (art. 2231)', () => {
  it('REQ-JUR-029 : sans clôture, le départ reste l’ordinaire', () => {
    expect(departApresLesLitiges(civil(2026, 10, 1), null)).toEqual(civil(2026, 10, 1));
  });

  it('REQ-JUR-029 : TÉMOIN — une clôture PLUS TARDIVE devient le départ, au jour civil de PARIS', () => {
    // 23 h 30 UTC le 14 mars 2029 : déjà le 15 à Paris.
    expect(departApresLesLitiges(civil(2026, 10, 1), new Date('2029-03-14T23:30:00.000Z'))).toEqual(
      civil(2029, 3, 15)
    );
  });

  it('REQ-JUR-029 : TÉMOIN — le départ ordinaire reste s’il est PLUS TARDIF que la clôture', () => {
    expect(departApresLesLitiges(civil(2027, 6, 30), new Date('2027-01-10T10:00:00.000Z'))).toEqual(
      civil(2027, 6, 30)
    );
  });

  it('REQ-JUR-029 : le même jour, l’un ou l’autre : ce jour', () => {
    expect(departApresLesLitiges(civil(2027, 1, 10), new Date('2027-01-10T10:00:00.000Z'))).toEqual(
      civil(2027, 1, 10)
    );
  });

  it('REQ-JUR-029 : un départ illisible reste illisible : le texte est gardé (échec fermé)', () => {
    expect(departApresLesLitiges(null, new Date('2027-01-10T10:00:00.000Z'))).toBeNull();
  });
});

type Candidate = {
  id: string;
  apporteurId: string;
  geste: 'resiliation';
  dateEffet: Date | null;
  creeAt: Date;
  litiges: { closAt: Date | null }[];
};

function unDouble(lot: Candidate[], ouverts: { decisionId: string; ouvertAt: Date }[] = []) {
  const findMany = vi.fn(async (args: { where: { geste?: string } }) =>
    args.where.geste === 'resiliation' ? [] : lot
  );
  const updateMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => ({
    count: args.where.id.in.length,
  }));
  const lireOuverts = vi.fn(async () => ouverts);
  const prisma = {
    decisionDeContrat: { findMany, updateMany },
    litigeDecisionDeContrat: { findMany: lireOuverts },
  } as unknown as PrismaClient;
  return { prisma, findMany, updateMany, lireOuverts };
}

const MAINTENANT = new Date('2031-10-06T09:00:00.000Z');
const A = '00000000-0000-4000-8000-00000000000a';
/** Une résiliation au 2026-10-01 : échue au 2031-10-06 sans litige. */
const resiliation = (id: string, litiges: { closAt: Date | null }[]): Candidate => ({
  id,
  apporteurId: A,
  geste: 'resiliation',
  dateEffet: jour('2026-10-01'),
  creeAt: new Date('2026-10-01T08:00:00Z'),
  litiges,
});

describe('REQ-JUR-029 — JUR-T64 : le passage saute un litige ouvert et lit la dernière clôture', () => {
  it('REQ-JUR-029 : TÉMOIN — la sélection EXCLUT une décision dont un litige est OUVERT, et lit sa DERNIÈRE clôture', async () => {
    const d = unDouble([]);
    await purgerLesTextesDesDecisions(d.prisma, MAINTENANT);
    const lecture = d.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(lecture.where.litiges).toEqual({ none: { closAt: null } });
    expect(lecture.select.litiges).toEqual({
      where: { NOT: { closAt: null } },
      select: { closAt: true },
      orderBy: { closAt: 'desc' },
      take: 1,
    });
  });

  it('REQ-JUR-029 : TÉMOIN — l’écriture refuse elle aussi une décision au litige ouvert entre-temps', async () => {
    const d = unDouble([resiliation('r1', [])]);
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 1 });
    expect(d.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['r1'] },
        textePurgeAt: null,
        NOT: { texteChiffre: null },
        litiges: { none: { closAt: null } },
      },
      data: { texteChiffre: null, faitsEmpreinte: null, textePurgeAt: MAINTENANT },
    });
  });

  it('REQ-JUR-029 : TÉMOIN à deux faces — clos en 2029, le texte attend le lendemain de la clôture plus la durée ; clos AVANT le départ ordinaire, il échoit à l’ordinaire', async () => {
    const tardif = unDouble([resiliation('r1', [{ closAt: new Date('2029-03-14T10:00:00Z') }])]);
    expect(await purgerLesTextesDesDecisions(tardif.prisma, MAINTENANT)).toEqual({
      textesPurges: 0,
    });
    expect(tardif.updateMany).not.toHaveBeenCalled();

    // Résiliation créée le 1er septembre, à effet le 1er octobre ; le litige est clos le 20 septembre.
    const ancien = unDouble([resiliation('r1', [{ closAt: new Date('2026-09-20T10:00:00Z') }])]);
    expect(await purgerLesTextesDesDecisions(ancien.prisma, MAINTENANT)).toEqual({
      textesPurges: 1,
    });
  });

  it('REQ-JUR-029 : TÉMOIN — après une clôture, rien le jour anniversaire de la clôture, purgé le lendemain (art. 2229)', async () => {
    const clos = [{ closAt: new Date('2026-12-01T10:00:00Z') }];
    const decision = { ...resiliation('r1', clos), dateEffet: jour('2026-01-01') };
    const leJour = unDouble([decision]);
    expect(
      await purgerLesTextesDesDecisions(leJour.prisma, new Date('2031-12-01T12:00:00Z'))
    ).toEqual({ textesPurges: 0 });
    const lendemain = unDouble([decision]);
    expect(
      await purgerLesTextesDesDecisions(lendemain.prisma, new Date('2031-12-02T12:00:00Z'))
    ).toEqual({ textesPurges: 1 });
  });
});

describe('REQ-JUR-029 — JUR-T64 : l’alerte d’exploitation d’un litige ouvert trop longtemps (juriste 6042136542 ; sécurité)', () => {
  const PERIODE = SEUILS.LITIGE_DECISION_OUVERT_ALERTE_JOURS.valeur;
  const ouvertIlYA = (jours: number, decisionId: string) => ({
    decisionId,
    ouvertAt: new Date(MAINTENANT.getTime() - jours * MS_PAR_JOUR - 3_600_000),
  });

  it('REQ-JUR-029 : la période est de 180 jours', () => {
    expect(PERIODE).toBe(180);
    expect(SEUILS.LITIGE_DECISION_OUVERT_ALERTE_JOURS.unite).toBe('jours');
  });

  it('REQ-JUR-029 : TÉMOIN à deux faces — à 180 et à 400 jours, l’alerte sonne à CHAQUE passage, NOMMÉE, avec le nombre, la décision et l’âge, ni apporteur ni faits ; à 179 jours, ou clos, elle se tait', async () => {
    // La base ne rend que les litiges OUVERTS depuis la période ou plus : la lecture le demande.
    const warn = vi.fn();
    const d = unDouble([], [ouvertIlYA(PERIODE, 'd-180'), ouvertIlYA(400, 'd-400')]);
    await purgerLesTextesDesDecisions(d.prisma, MAINTENANT, { journal: { warn } });
    expect(d.lireOuverts).toHaveBeenCalledWith({
      where: {
        closAt: null,
        ouvertAt: { lte: new Date(MAINTENANT.getTime() - PERIODE * MS_PAR_JOUR) },
      },
      select: { decisionId: true, ouvertAt: true },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('litiges_decisions_ouverts_anciens', {
      nombre: 2,
      litiges: [
        { decisionId: 'd-180', ageJours: PERIODE },
        { decisionId: 'd-400', ageJours: 400 },
      ],
    });
    // Le passage suivant sonne encore : la répétition est voulue.
    await purgerLesTextesDesDecisions(d.prisma, MAINTENANT, { journal: { warn } });
    expect(warn).toHaveBeenCalledTimes(2);

    // À 179 jours, ou une fois clos, la base ne rend rien : l'alerte se tait.
    const calme = vi.fn();
    await purgerLesTextesDesDecisions(unDouble([], []).prisma, MAINTENANT, {
      journal: { warn: calme },
    });
    expect(calme).not.toHaveBeenCalled();
  });
});

describe('REQ-JUR-029 — JUR-T64 : l’alerte reste INTERNE (condition de la sécurité)', () => {
  it('REQ-JUR-029 : TÉMOIN — le passage n’importe AUCUN notifieur externe (Telegram, notify, Sentry) : l’identifiant de la décision ne sort jamais du journal interne', () => {
    const source = readFileSync('src/server/taches/purger-textes-des-decisions.ts', 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => /telegram|notify|sentry|integrations/i.test(i!))).toEqual([]);
    expect(imports).toContain('../../lib/logger');
  });
});
