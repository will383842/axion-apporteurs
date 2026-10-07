// @req REQ-SEC-058
/**
 * SEC-59 — le résumé quotidien du journal des accès à la console, au journal chaîné, en base RÉELLE.
 *
 * Condition (2) de la sécurité sur SEC-58, forme commune d'A02 et de la sécurité : chaque jour clos
 * reçoit au journal chaîné un résumé `journal_acces_console_resume`, qui porte le nombre de lignes et
 * DEUX empreintes SHA-256 des lignes triées. La première, sur les lignes complètes, se vérifie jusqu'à
 * la purge. La seconde, sur les seules colonnes qui survivent à la purge (`id`, `nature`,
 * `survenu_at`), se vérifie pour toujours. Une suppression ou une modification faite à la main
 * contredit le résumé. Une purge ne le contredit pas.
 *
 * LA MAIN QUI ALTÈRE est celle du propriétaire de la table, qui désactive le gabarit d'ajout seul le
 * temps d'une transaction : c'est le seul chemin d'une altération, et c'est ce que le résumé doit voir.
 * Le reste tourne sous `partners_app`, le rôle du serveur.
 *
 * Les jours se suivent d'un test à l'autre : chaque résumé part du lendemain du dernier jour résumé.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  passageDuResumeDuJournalDesAcces,
  resumerLeJournalDesAccesConsole,
  verifierLesResumesDuJournalDesAcces,
} from '../../src/server/taches/resumer-journal-acces-console';
import { purgerLeJournalDesAccesConsole } from '../../src/server/taches/purger-journal-acces-console';
import { inscriptions } from '../../src/server/taches/inscriptions';
import { TACHES } from '../../src/server/taches/registre';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const hex = (octets: number) => randomBytes(octets).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unUtilisateur(): Promise<string> {
  return (
    await base.prisma.utilisateurConsole.create({
      data: {
        role: 'admin',
        creeAt: new Date('2026-01-01T00:00:00.000Z'),
        desactiveAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    })
  ).id;
}

/** Une trace de lecture, posée à l'instant donné ; tous ses identifiants sont rendus. */
async function uneTrace(utilisateurConsoleId: string, survenuAt: Date) {
  const trace = {
    id: randomUUID(),
    utilisateurConsoleId,
    nature: 'lecture_coordonnees_apporteur' as const,
    cibleId: randomUUID(),
    ipHash: hex(8),
    survenuAt,
  };
  await base.prisma.journalAccesConsole.create({ data: trace });
  return trace;
}

/** L'altération à la main : le propriétaire lève le gabarit d'ajout seul le temps d'une transaction. */
async function aLaMain(sql: string): Promise<void> {
  await base.prisma.$transaction([
    base.prisma.$executeRawUnsafe(
      'ALTER TABLE "journal_acces_console" DISABLE TRIGGER journal_acces_console_ajout_seul'
    ),
    base.prisma.$executeRawUnsafe(sql),
    base.prisma.$executeRawUnsafe(
      'ALTER TABLE "journal_acces_console" ENABLE TRIGGER journal_acces_console_ajout_seul'
    ),
  ]);
}

const resumes = () =>
  base.prisma.evenement.findMany({
    where: { type: 'journal_acces_console_resume' },
    orderBy: { id: 'asc' },
  });

/** Les contradictions d'UN jour : les autres jours appartiennent aux autres témoins. */
async function contradictionsDu(jour: string): Promise<string[]> {
  const v = await verifierLesResumesDuJournalDesAcces(app);
  return v.contradictions.filter((c) => c.jourUtc === jour).map((c) => c.faute);
}

/**
 * Le SHA-256 du texte des lignes, recalculé ICI, indépendamment de la tâche : la sérialisation fixée
 * par A02 (tabulation, `\N` pour NULL, ISO UTC à la milliseconde, un saut de ligne après chaque ligne,
 * lignes triées par (survenu_at, id)). Le vecteur figé du domaine la juge aussi, hors base.
 */
const sha = (lignes: (string | null)[][]) =>
  createHash('sha256')
    .update(lignes.map((l) => `${l.map((c) => c ?? '\\N').join('\t')}\n`).join(''))
    .digest('hex');

describe('REQ-SEC-058 — le résumé de la veille entre au journal chaîné', () => {
  it('REQ-SEC-058 : la tâche est au registre et s’inscrit au lanceur', () => {
    expect(TACHES.journal_acces_console_resumer).toEqual({ req: 'REQ-SEC-058' });
    expect(Object.keys(inscriptions(app, {}))).toContain('journal_acces_console_resumer');
  });

  it('REQ-SEC-058 : un jour clos reçoit UN résumé — le nombre de lignes et les deux empreintes', async () => {
    const u = await unUtilisateur();
    const a = await uneTrace(u, new Date('2027-01-10T08:00:00.000Z'));
    const b = await uneTrace(u, new Date('2027-01-10T23:59:59.999Z'));
    await uneTrace(u, new Date('2027-01-11T00:00:00.000Z')); // le lendemain : pas encore clos

    const r = await resumerLeJournalDesAccesConsole(app, new Date('2027-01-11T00:20:00.000Z'));
    expect(r).toEqual({ resumes: 1 });

    const [e] = await resumes();
    expect(e?.agregat).toBeNull();
    expect(e?.agregatId).toBeNull();
    const tries = [a, b].sort((x, y) =>
      x.survenuAt.getTime() === y.survenuAt.getTime()
        ? x.id < y.id
          ? -1
          : 1
        : x.survenuAt.getTime() - y.survenuAt.getTime()
    );
    expect(e?.charge).toEqual({
      acteur: { par: 'systeme' },
      jourUtc: '2027-01-10',
      lignesNombre: 2,
      empreinteComplete: sha(
        tries.map((t) => [
          t.id,
          t.nature,
          t.survenuAt.toISOString(),
          t.utilisateurConsoleId,
          t.cibleId,
          t.ipHash,
        ])
      ),
      empreinteSurvivante: sha(tries.map((t) => [t.id, t.nature, t.survenuAt.toISOString()])),
    });
    expect(await contradictionsDu('2027-01-10')).toEqual([]);
  });

  it('REQ-SEC-058 : rejouée, la tâche n’écrit rien de plus ; un jour sans accès reçoit un résumé à zéro', async () => {
    expect(
      await resumerLeJournalDesAccesConsole(app, new Date('2027-01-11T12:00:00.000Z'))
    ).toEqual({ resumes: 0 });
    // Deux jours plus tard : le 11 (une trace) et le 12 (aucune) sont clos, chacun reçoit son résumé.
    expect(
      await resumerLeJournalDesAccesConsole(app, new Date('2027-01-13T00:20:00.000Z'))
    ).toEqual({ resumes: 2 });
    const [, onze, douze] = await resumes();
    expect(onze?.charge).toMatchObject({ jourUtc: '2027-01-11', lignesNombre: 1 });
    expect(douze?.charge).toMatchObject({
      jourUtc: '2027-01-12',
      lignesNombre: 0,
      empreinteComplete: sha([]),
      empreinteSurvivante: sha([]),
    });
  });

  it('REQ-SEC-058 : TÉMOIN — le résumé ne porte AUCUN identifiant d’employé, ni cible, ni empreinte réseau', async () => {
    const u = await unUtilisateur();
    const t = await uneTrace(u, new Date('2027-01-13T09:00:00.000Z'));
    await resumerLeJournalDesAccesConsole(app, new Date('2027-01-14T00:20:00.000Z'));
    const dernier = (await resumes()).at(-1);
    expect(dernier?.charge).toMatchObject({ jourUtc: '2027-01-13', lignesNombre: 1 });
    const texte = JSON.stringify(dernier?.charge);
    for (const valeur of [u, t.id, t.cibleId, t.ipHash]) expect(texte).not.toContain(valeur);
    // Aucun identifiant du tout : des comptes et des empreintes seulement.
    expect(texte).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(Object.keys(dernier?.charge as object).sort()).toEqual([
      'acteur',
      'empreinteComplete',
      'empreinteSurvivante',
      'jourUtc',
      'lignesNombre',
    ]);
  });
});

describe('REQ-SEC-058 — une suppression ou une modification contredit le résumé, une purge non', () => {
  it('REQ-SEC-058 : TÉMOIN — une ligne supprimée à la main fait rougir la vérification du résumé', async () => {
    const u = await unUtilisateur();
    const t = await uneTrace(u, new Date('2027-01-14T10:00:00.000Z'));
    await uneTrace(u, new Date('2027-01-14T11:00:00.000Z'));
    await resumerLeJournalDesAccesConsole(app, new Date('2027-01-15T00:20:00.000Z'));
    expect(await contradictionsDu('2027-01-14')).toEqual([]);

    await aLaMain(`DELETE FROM "journal_acces_console" WHERE "id" = '${t.id}'`);

    expect(await contradictionsDu('2027-01-14')).toEqual([
      'nombre_contredit',
      'empreinte_complete_contredite',
      'empreinte_survivante_contredite',
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — une ligne modifiée à la main fait rougir la vérification du résumé', async () => {
    const u = await unUtilisateur();
    const t = await uneTrace(u, new Date('2027-01-15T10:00:00.000Z'));
    await resumerLeJournalDesAccesConsole(app, new Date('2027-01-16T00:20:00.000Z'));
    expect(await contradictionsDu('2027-01-15')).toEqual([]);

    await aLaMain(
      `UPDATE "journal_acces_console" SET "cible_id" = '${randomUUID()}' WHERE "id" = '${t.id}'`
    );

    expect(await contradictionsDu('2027-01-15')).toEqual(['empreinte_complete_contredite']);
  });

  it('REQ-SEC-058 : TÉMOIN — le passage quotidien échoue en nommant le jour contredit, jamais une donnée', async () => {
    const passage = passageDuResumeDuJournalDesAcces(app, {
      maintenant: () => new Date('2027-01-16T00:20:00.000Z'),
      dernierSucces: async () => null,
    });
    const refus = await passage().then(
      () => 'aucun refus',
      (e: unknown) => (e as Error).message
    );
    expect(refus).toMatch(/^resume_contredit : /);
    expect(refus).toContain('2027-01-14 nombre_contredit');
    expect(refus).toContain('2027-01-15 empreinte_complete_contredite');
    expect(refus).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('REQ-SEC-058 : le passage est quotidien — déjà réussi ce jour, il ne lit ni n’écrit rien', async () => {
    const avant = (await resumes()).length;
    const passage = passageDuResumeDuJournalDesAcces(app, {
      maintenant: () => new Date('2027-01-20T00:20:00.000Z'),
      dernierSucces: async () => new Date('2027-01-20T00:15:00.000Z'),
    });
    expect(await passage()).toEqual({ differee: 1 });
    expect(await resumes()).toHaveLength(avant);
  });

  it('REQ-SEC-058 : CONTRE-TÉMOIN — une ligne purgée ne fait pas rougir la vérification ; une ligne nue supprimée, si', async () => {
    const u = await unUtilisateur();
    const purgee = await uneTrace(u, new Date('2027-01-20T10:00:00.000Z'));
    const nue = await uneTrace(u, new Date('2027-01-20T11:00:00.000Z'));
    await resumerLeJournalDesAccesConsole(app, new Date('2027-01-21T00:20:00.000Z'));
    expect(await contradictionsDu('2027-01-20')).toEqual([]);

    // Douze mois et un jour plus tard, la purge vide les identifiants ; la ligne nue reste.
    const { purgees } = await purgerLeJournalDesAccesConsole(
      app,
      new Date('2028-01-21T12:00:00.000Z')
    );
    expect(purgees).toBeGreaterThanOrEqual(2);
    expect(
      await base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id: purgee.id } })
    ).toMatchObject({ utilisateurConsoleId: null, cibleId: null, ipHash: null });
    expect(await contradictionsDu('2027-01-20')).toEqual([]);

    // Après la purge, l'empreinte des colonnes survivantes voit encore une ligne retirée.
    await aLaMain(`DELETE FROM "journal_acces_console" WHERE "id" = '${nue.id}'`);
    expect(await contradictionsDu('2027-01-20')).toEqual([
      'nombre_contredit',
      'empreinte_survivante_contredite',
    ]);
  });
});

describe('REQ-SEC-058 — deux passages simultanés n’écrivent qu’UN résumé du même jour', () => {
  it('REQ-SEC-058 : TÉMOIN — deux écritures concurrentes du même jour ne donnent qu’un résumé', async () => {
    const u = await unUtilisateur();
    await uneTrace(u, new Date('2027-02-01T10:00:00.000Z'));
    const avant = (await resumes()).length;
    const quand = new Date('2027-02-02T00:20:00.000Z');
    await Promise.all([
      resumerLeJournalDesAccesConsole(app, quand),
      resumerLeJournalDesAccesConsole(app, quand),
    ]);
    const nouveaux = (await resumes()).slice(avant);
    const jours = nouveaux.map((r) => (r.charge as { jourUtc: string }).jourUtc);
    expect(new Set(jours).size).toBe(jours.length);
    expect(jours.filter((j) => j === '2027-02-01')).toHaveLength(1);
  });
});
