// @req REQ-SEC-058
/**
 * SEC-59 — le résumé quotidien du journal des accès à la console : la tâche, jugée sur un monde
 * simulé (`tests/integration/resume-journal-acces-console.spec.ts` la juge en base réelle).
 *
 * La condition (2) de la sécurité sur SEC-58 : chaque jour clos reçoit au journal chaîné un résumé —
 * le nombre de lignes et DEUX empreintes —, et une suppression ou une modification antérieure à la
 * purge contredit le résumé. Le passage est dû une fois par jour civil UTC, et une contradiction le
 * fait échouer en nommant le jour et la faute, jamais une donnée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  empreintesDuJour,
  type LigneDuJournalDesAcces,
} from '../../../src/domain/evenement/resume-journal-acces';

type Resume = {
  acteur: { par: 'systeme' };
  jourUtc: string;
  lignesNombre: number;
  empreinteComplete: string;
  empreinteSurvivante: string;
};

/** Le journal chaîné simulé : ce que `ajouterEvenement` y écrit, ce que le lecteur en relit. */
const journal = vi.hoisted(() => ({
  ecrits: [] as { type: string; survenuAt: Date; charge: unknown; agregat?: unknown }[],
  lire: vi.fn(),
  ajouter: vi.fn(),
}));

vi.mock('../../../src/server/evenement/journal', () => ({
  ajouterEvenement: journal.ajouter,
  lireLesResumesDuJournalDesAcces: journal.lire,
}));

import {
  passageDuResumeDuJournalDesAcces,
  resumerLeJournalDesAccesConsole,
  verifierLesResumesDuJournalDesAcces,
} from '../../../src/server/taches/resumer-journal-acces-console';
import { TACHES } from '../../../src/server/taches/registre';

const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hex = (n: number) => String(n).padStart(12, '0');
const ligne = (n: number, iso: string, purgee = false) => ({
  id: `00000000-0000-4000-8000-${hex(n)}`,
  nature: 'connexion' as const,
  survenuAt: new Date(iso),
  utilisateurConsoleId: purgee ? null : U,
  cibleId: null,
  ipHash: purgee ? null : 'abcdef0123456789',
  purgeAt: purgee ? new Date('2027-09-01T00:00:00.000Z') : null,
});
type Ligne = ReturnType<typeof ligne>;

/** La table simulée : l'interrogation du jour et la plus ancienne ligne, comme la tâche les lit. */
function unMonde(lignes: Ligne[]) {
  const tx = { marqueur: 'tx' };
  const lectures: unknown[] = [];
  const prisma = {
    journalAccesConsole: {
      findMany: vi.fn(async (q: { where: { survenuAt: { gte: Date; lt: Date } } }) => {
        lectures.push(q);
        const { gte, lt } = q.where.survenuAt;
        return lignes.filter((l) => l.survenuAt >= gte && l.survenuAt < lt);
      }),
      findFirst: vi.fn(async () => {
        const tri = [...lignes].sort((a, b) => a.survenuAt.getTime() - b.survenuAt.getTime());
        return tri.length === 0 ? null : { survenuAt: tri[0]!.survenuAt };
      }),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { prisma, tx, lectures, lignes };
}

const resumeDe = (jourUtc: string, lignes: Ligne[]): Resume => ({
  acteur: { par: 'systeme' },
  jourUtc,
  ...empreintesDuJour(lignes as LigneDuJournalDesAcces[]),
});

const MAINTENANT = new Date('2027-01-12T03:00:00.000Z');

beforeEach(() => {
  journal.ecrits.length = 0;
  journal.lire.mockReset();
  journal.ajouter.mockReset();
  journal.ajouter.mockImplementation(
    async (_tx: unknown, e: { type: string; survenuAt: Date; charge: unknown }) => {
      journal.ecrits.push(e);
      return { id: String(journal.ecrits.length), selfHash: 'x' };
    }
  );
  journal.lire.mockImplementation(async () =>
    journal.ecrits.filter((e) => e.type === 'journal_acces_console_resume').map((e) => e.charge)
  );
});

describe('REQ-SEC-058 — la tâche est au registre et s’inscrit au lanceur', () => {
  it('REQ-SEC-058 : journal_acces_console_resumer porte son exigence', () => {
    expect(TACHES.journal_acces_console_resumer).toEqual({ req: 'REQ-SEC-058' });
  });
});

describe('REQ-SEC-058 — chaque jour clos reçoit son résumé', () => {
  it('REQ-SEC-058 : TÉMOIN — les jours clos, du plus ancien à la veille ; aujourd’hui n’est pas clos', async () => {
    const m = unMonde([
      ligne(1, '2027-01-10T08:00:00.000Z'),
      ligne(2, '2027-01-10T23:59:59.999Z'),
      ligne(3, '2027-01-11T00:00:00.000Z'),
      ligne(4, '2027-01-12T01:00:00.000Z'), // aujourd'hui : hors résumé
    ]);
    const { resumes } = await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    expect(resumes).toBe(2);
    expect(journal.ecrits).toHaveLength(2);
    expect(journal.ecrits[0]).toEqual({
      type: 'journal_acces_console_resume',
      survenuAt: MAINTENANT,
      charge: resumeDe('2027-01-10', m.lignes.slice(0, 2)),
    });
    expect(journal.ecrits[1]).toEqual({
      type: 'journal_acces_console_resume',
      survenuAt: MAINTENANT,
      charge: resumeDe('2027-01-11', m.lignes.slice(2, 3)),
    });
    // Un résumé n'est l'état d'aucun agrégat : ni agrégat ni identifiant d'agrégat.
    expect(journal.ecrits[0]).not.toHaveProperty('agregat');
    expect(journal.ecrits[0]).not.toHaveProperty('agregatId');
    // Une transaction par jour, et l'écriture se fait dans la transaction.
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(
      journal.ajouter.mock.calls.every((c) => (c[0] as { marqueur: string }).marqueur === 'tx')
    ).toBe(true);
  });

  it('REQ-SEC-058 : un jour sans accès a aussi son résumé, à zéro', async () => {
    const m = unMonde([ligne(1, '2027-01-09T08:00:00.000Z'), ligne(2, '2027-01-11T08:00:00.000Z')]);
    await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    const jours = journal.ecrits.map((e) => (e.charge as Resume).jourUtc);
    expect(jours).toEqual(['2027-01-09', '2027-01-10', '2027-01-11']);
    expect(journal.ecrits[1]!.charge).toEqual(resumeDe('2027-01-10', []));
    expect((journal.ecrits[1]!.charge as Resume).lignesNombre).toBe(0);
  });

  it('REQ-SEC-058 : une table vide : la veille seule reçoit un résumé, à zéro', async () => {
    const m = unMonde([]);
    const { resumes } = await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    expect(resumes).toBe(1);
    expect((journal.ecrits[0]!.charge as Resume).jourUtc).toBe('2027-01-11');
    expect((journal.ecrits[0]!.charge as Resume).lignesNombre).toBe(0);
  });

  it('REQ-SEC-058 : un passage manqué ne perd aucun jour : la reprise part du lendemain du dernier résumé', async () => {
    const lignes = [ligne(1, '2027-01-08T08:00:00.000Z'), ligne(2, '2027-01-10T08:00:00.000Z')];
    const m = unMonde(lignes);
    journal.ecrits.push({
      type: 'journal_acces_console_resume',
      survenuAt: new Date('2027-01-09T03:00:00.000Z'),
      charge: resumeDe('2027-01-08', lignes.slice(0, 1)),
    });
    const { resumes } = await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    expect(resumes).toBe(3);
    expect(journal.ecrits.slice(1).map((e) => (e.charge as Resume).jourUtc)).toEqual([
      '2027-01-09',
      '2027-01-10',
      '2027-01-11',
    ]);
    // Le plus ancien jour n'est pas relu : la reprise ne regarde pas la plus ancienne ligne.
    expect(m.prisma.journalAccesConsole.findFirst).not.toHaveBeenCalled();
  });

  it('REQ-SEC-058 : TÉMOIN — rejoué le même jour, il n’écrit rien de plus (un SEUL résumé par jour)', async () => {
    const m = unMonde([ligne(1, '2027-01-10T08:00:00.000Z')]);
    await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    const avant = journal.ecrits.length;
    const { resumes } = await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    expect(resumes).toBe(0);
    expect(journal.ecrits).toHaveLength(avant);
  });

  it('REQ-SEC-058 : TÉMOIN — un second résumé du même jour est REFUSÉ, même s’il a été écrit entre-temps', async () => {
    const m = unMonde([ligne(1, '2027-01-10T08:00:00.000Z')]);
    // Au premier regard, rien n'est écrit ; dans la transaction, un autre passage a déjà écrit le jour.
    journal.lire.mockImplementation(async (client: unknown) =>
      client === m.prisma ? [] : [resumeDe('2027-01-10', m.lignes)]
    );
    const { resumes } = await resumerLeJournalDesAccesConsole(m.prisma as never, MAINTENANT);
    expect(
      journal.ajouter.mock.calls.map((c) => (c[1] as { charge: Resume }).charge.jourUtc)
    ).toEqual(['2027-01-11']);
    expect(resumes).toBe(1);
  });
});

describe('REQ-SEC-058 — la vérification confronte chaque résumé à la table', () => {
  const jour = '2027-01-10';
  const saines = () => [ligne(1, '2027-01-10T08:00:00.000Z'), ligne(2, '2027-01-10T09:00:00.000Z')];
  const verifier = async (table: Ligne[], ecrit: Resume) => {
    journal.lire.mockResolvedValue([ecrit]);
    return verifierLesResumesDuJournalDesAcces(unMonde(table).prisma as never);
  };

  it('REQ-SEC-058 : une table intacte ne contredit rien, et le nombre de résumés lus est rendu', async () => {
    const t = saines();
    expect(await verifier(t, resumeDe(jour, t))).toEqual({ resumes: 1, contradictions: [] });
  });

  it('REQ-SEC-058 : TÉMOIN — une ligne SUPPRIMÉE à la main contredit le nombre et les deux empreintes', async () => {
    const t = saines();
    const v = await verifier(t.slice(0, 1), resumeDe(jour, t));
    expect(v.contradictions).toEqual([
      { jourUtc: jour, faute: 'nombre_contredit' },
      { jourUtc: jour, faute: 'empreinte_complete_contredite' },
      { jourUtc: jour, faute: 'empreinte_survivante_contredite' },
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — une ligne MODIFIÉE à la main (cible, avant purge) contredit l’empreinte complète seule', async () => {
    const t = saines();
    const ecrit = resumeDe(jour, t);
    const v = await verifier([{ ...t[0]!, ipHash: 'ffffffffffffffff' }, t[1]!], ecrit);
    expect(v.contradictions).toEqual([{ jourUtc: jour, faute: 'empreinte_complete_contredite' }]);
  });

  it('REQ-SEC-058 : TÉMOIN — une colonne qui survit à la purge, modifiée, contredit l’empreinte survivante', async () => {
    const t = saines();
    const ecrit = resumeDe(jour, t);
    const v = await verifier(
      [{ ...t[0]!, nature: 'lecture_journal_acces' as never }, t[1]!],
      ecrit
    );
    expect(v.contradictions.map((c) => c.faute)).toEqual([
      'empreinte_complete_contredite',
      'empreinte_survivante_contredite',
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — une ligne PURGÉE ne contredit rien : seule la survivante est jugée, et elle tient', async () => {
    const t = saines();
    const ecrit = resumeDe(jour, t);
    const purgee = { ...t[0]!, utilisateurConsoleId: null, ipHash: null, purgeAt: new Date() };
    expect((await verifier([purgee, t[1]!], ecrit)).contradictions).toEqual([]);
    // Mais une altération des colonnes survivantes, sur un jour purgé, se voit encore.
    const alteree = { ...purgee, survenuAt: new Date('2027-01-10T08:00:00.001Z') };
    expect((await verifier([alteree, t[1]!], ecrit)).contradictions).toEqual([
      { jourUtc: jour, faute: 'empreinte_survivante_contredite' },
    ]);
  });

  it('REQ-SEC-058 : un résumé illisible (charge hors forme) échoue fermé, sans citer la valeur', async () => {
    journal.lire.mockResolvedValue([{ jourUtc: jour, secret: 'x@y.fr' }]);
    const e = await verifierLesResumesDuJournalDesAcces(unMonde([]).prisma as never).catch(
      (x: Error) => x
    );
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe('resume_illisible');
  });
});

describe('REQ-SEC-058 — le passage est dû une fois par jour civil UTC', () => {
  const passage = (m: ReturnType<typeof unMonde>, dernier: Date | null) =>
    passageDuResumeDuJournalDesAcces(m.prisma as never, {
      maintenant: () => MAINTENANT,
      dernierSucces: async () => dernier,
    });

  it('REQ-SEC-058 : déjà réussi ce jour (UTC), il ne lit ni n’écrit rien — il se DIFFÈRE', async () => {
    const m = unMonde([ligne(1, '2027-01-10T08:00:00.000Z')]);
    const r = await passage(m, new Date('2027-01-12T00:00:01.000Z'))();
    expect(r).toEqual({ differee: 1 });
    expect(m.prisma.journalAccesConsole.findMany).not.toHaveBeenCalled();
    expect(journal.lire).not.toHaveBeenCalled();
    expect(journal.ecrits).toHaveLength(0);
  });

  it('REQ-SEC-058 : réussi la VEILLE (ou jamais), il résume puis vérifie tous les résumés', async () => {
    for (const dernier of [new Date('2027-01-11T23:59:59.999Z'), null]) {
      journal.ecrits.length = 0;
      const m = unMonde([ligne(1, '2027-01-10T08:00:00.000Z')]);
      expect(await passage(m, dernier)()).toEqual({ resumes: 2, verifies: 2 });
    }
  });

  it('REQ-SEC-058 : TÉMOIN — une contradiction le fait ÉCHOUER en nommant le jour et la faute, jamais une donnée', async () => {
    const t = [ligne(1, '2027-01-10T08:00:00.000Z'), ligne(2, '2027-01-10T09:00:00.000Z')];
    const m = unMonde(t.slice(0, 1)); // la ligne 2 a été supprimée à la main
    journal.ecrits.push({
      type: 'journal_acces_console_resume',
      survenuAt: new Date('2027-01-11T03:00:00.000Z'),
      charge: resumeDe('2027-01-10', t),
    });
    const e = await passage(m, null)().catch((x: Error) => x);
    expect((e as Error).message).toBe(
      'resume_contredit : 2027-01-10 nombre_contredit, 2027-01-10 empreinte_complete_contredite, ' +
        '2027-01-10 empreinte_survivante_contredite'
    );
    expect((e as Error).message).not.toContain(U);
  });
});
