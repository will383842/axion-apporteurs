// @req REQ-CPL-006
/**
 * CPL-T06, en base RÉELLE — la table `decisions_candidature` (REQ-CPL-006, cadrage de l'architecte
 * du 2026-09-26, partners/ADR-0022, forme d'A02 versée sur #586).
 *
 * EN AJOUT SEUL : une nouvelle décision est une nouvelle ligne. La base refuse la mise à jour, la
 * suppression et la troncature (le gabarit `refuser_modification_sauf`), et la colonne `resultat`
 * est un enum fermé.
 *
 * LE MOTIF EST CHIFFRÉ (forme d'A02, point a) : `justification_chiffre`, écrit par `colonnesPii`,
 * lié à SA ligne (modèle `decisionCandidature`, id, champ) ; aucun clair ne subsiste en base. Il se
 * PURGE avec sa date, une fois.
 *
 * LE LIEN À L'APPORTEUR SORT DE LA LIGNE (forme d'A02, point b) : `apporteur_id` passe à NULL avec
 * `apporteur_purge_at`, AU PLUS TARD avec le motif ; la fiche de l'apporteur peut alors être effacée.
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures,
 * les lectures et la troncature restent sous le propriétaire (`partners_app` n'a pas le droit de
 * tronquer : sous lui, le refus prouverait le droit, pas le déclencheur). Chaque refus est attendu
 * sur son NOM.
 *
 * DE BOUT EN BOUT, dans UNE transaction : la décision rendue par le domaine est inscrite par le
 * semeur (`semerDecisionCandidature`), le statut de l'apporteur suit, et le changement de statut
 * entre au journal chaîné par son écrivain unique, sous le type `apporteur_statut_modifie`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, colonnesPii, decryptPii } from '../../src/server/securite/pii';
import { ErreurDecisionCandidature } from '../../src/domain/candidature/decision';
import {
  MODELE_DECISION_CANDIDATURE,
  semerDecisionCandidature,
} from '../../prisma/seed/13-candidatures';

let base: Base;
let app: PrismaClient;
let auteurId: string;
const MAINTENANT = new Date('2026-10-03T09:00:00.000Z');
const PLUS_TARD = new Date('2026-10-04T09:00:00.000Z');
const MOTIF = 'Profil à revoir au prochain cycle.';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-cpl-t06-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  auteurId = (
    await base.prisma.utilisateurConsole.create({
      // Désactivé : un compte actif exige une adresse chiffrée (CHECK), sans rapport avec la décision.
      data: { role: 'qualifieur', creeAt: MAINTENANT, desactiveAt: MAINTENANT },
      select: { id: true },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unCandidat(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'candidat',
        codeParrainage: `AX${randomBytes(3).toString('hex').toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: MAINTENANT,
      },
      select: { id: true },
    })
  ).id;
}

/** Le bloc chiffré d'un motif, lié à la décision `id`. */
function blocDuMotif(id: string, clair = MOTIF): Buffer {
  const { justificationChiffre } = colonnesPii(
    { modele: MODELE_DECISION_CANDIDATURE, id },
    { justification: clair },
    CLES
  );
  return Buffer.from(justificationChiffre!);
}

/** Une décision écrite par le SERVEUR, sous `partners_app` ; le bloc est celui de `pour` (par défaut, la ligne elle-même). */
async function uneDecision(
  apporteurId: string,
  p: { clair?: string; pour?: string } = {}
): Promise<string> {
  const id = randomUUID();
  await app.$executeRaw`INSERT INTO "decisions_candidature"
    ("id", "apporteur_id", "resultat", "justification_chiffre", "auteur_id", "decidee_at")
    VALUES (${id}::uuid, ${apporteurId}::uuid, 'vivier',
            ${blocDuMotif(p.pour ?? id, p.clair ?? MOTIF)}, ${auteurId}::uuid, ${MAINTENANT})`;
  return id;
}

/** Le message du refus d'une écriture, ou rien si elle passe. */
async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('REQ-CPL-006 — `decisions_candidature` est en ajout seul, et son résultat est fermé', () => {
  it('REQ-CPL-006 : une décision s’inscrit, et une SECONDE décision est une seconde ligne', async () => {
    const apporteurId = await unCandidat();
    await uneDecision(apporteurId);
    await uneDecision(apporteurId);
    expect(await base.prisma.decisionCandidature.count({ where: { apporteurId } })).toBe(2);
  });

  it('REQ-CPL-006 : la base REFUSE la mise à jour d’une décision', async () => {
    const id = await uneDecision(await unCandidat());
    await expect(
      app.decisionCandidature.update({ where: { id }, data: { resultat: 'retenu' } })
    ).rejects.toThrow(/ajout seul/);
  });

  it('REQ-CPL-006 : la base REFUSE la suppression et la troncature', async () => {
    const id = await uneDecision(await unCandidat());
    await expect(app.decisionCandidature.delete({ where: { id } })).rejects.toThrow(/ajout seul/);
    await expect(
      base.prisma.$executeRawUnsafe('TRUNCATE "decisions_candidature" CASCADE')
    ).rejects.toThrow(/ajout seul/);
  });

  it('REQ-CPL-006 : un résultat hors de l’enum est refusé par la base', async () => {
    const apporteurId = await unCandidat();
    const id = randomUUID();
    await expect(
      app.$executeRaw`INSERT INTO "decisions_candidature"
        ("id", "apporteur_id", "resultat", "justification_chiffre", "auteur_id", "decidee_at")
        VALUES (${id}::uuid, ${apporteurId}::uuid, 'accepte', ${blocDuMotif(id)},
                ${auteurId}::uuid, now())`
    ).rejects.toThrow(/resultat_decision_candidature/);
  });

  it('REQ-CPL-006 : une décision sans auteur de la console, ou sur un apporteur inconnu, est refusée', async () => {
    const apporteurId = await unCandidat();
    for (const [a, u] of [
      [apporteurId, randomUUID()],
      [randomUUID(), auteurId],
    ] as const) {
      const id = randomUUID();
      await expect(
        app.decisionCandidature.create({
          data: {
            id,
            apporteurId: a,
            resultat: 'refuse',
            justificationChiffre: blocDuMotif(id),
            webinaireSuivi: false,
            auteurId: u,
            decideeAt: MAINTENANT,
          },
        })
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    }
  });
});

describe('REQ-CPL-006 — de bout en bout : la décision, le statut et le journal, ensemble', () => {
  it('REQ-CPL-006 : retenir un candidat inscrit la décision, le passe `retenu`, et journalise `candidat → retenu` sous `retenir`', async () => {
    const apporteurId = await unCandidat();
    const { id } = await semerDecisionCandidature(app, {
      apporteurId,
      statutActuel: 'candidat',
      resultat: 'retenu',
      justification: 'Réseau et motivation alignés.',
      webinaireSuivi: true,
      auteurId,
      decideeAt: MAINTENANT,
      cles: CLES,
    });
    const a = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });
    expect(a.statut).toBe('retenu');
    const d = await base.prisma.decisionCandidature.findUniqueOrThrow({ where: { id } });
    expect([d.resultat, d.webinaireSuivi, d.auteurId]).toEqual(['retenu', true, auteurId]);
    expect(
      decryptPii(
        { modele: MODELE_DECISION_CANDIDATURE, champ: 'justificationChiffre', id },
        d.justificationChiffre!,
        CLES
      )
    ).toBe('Réseau et motivation alignés.');
    const e = await base.prisma.evenement.findFirstOrThrow({
      where: { type: 'apporteur_statut_modifie', agregatId: apporteurId },
    });
    expect(e.charge).toMatchObject({ de: 'candidat', vers: 'retenu', transition: 'retenir' });
    expect(JSON.stringify(e.charge)).not.toContain('Réseau et motivation');
  });

  it('REQ-CPL-006 : un motif vide ou fait de blancs est refusé AVANT l’écriture : aucune ligne, aucun statut changé', async () => {
    const apporteurId = await unCandidat();
    for (const justification of ['', '   ', ' \t\n']) {
      await expect(
        semerDecisionCandidature(app, {
          apporteurId,
          statutActuel: 'candidat',
          resultat: 'refuse',
          justification,
          webinaireSuivi: null,
          auteurId,
          decideeAt: MAINTENANT,
          cles: CLES,
        })
      ).rejects.toThrow(ErreurDecisionCandidature);
    }
    expect(await base.prisma.decisionCandidature.count({ where: { apporteurId } })).toBe(0);
    expect(
      (await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } })).statut
    ).toBe('candidat');
  });
});

describe('REQ-CPL-006 — le motif est CHIFFRÉ pour SA ligne (forme d’A02, point a)', () => {
  it('REQ-CPL-006 : aucune colonne ne porte le motif en clair — seule `justification_chiffre`, en octets', async () => {
    const colonnes = await base.prisma.$queryRaw<{ c: string; t: string }[]>`
      SELECT column_name AS c, data_type AS t FROM information_schema.columns
      WHERE table_name = 'decisions_candidature' AND column_name LIKE 'justification%'
      ORDER BY column_name`;
    expect(colonnes).toEqual([
      { c: 'justification_chiffre', t: 'bytea' },
      { c: 'justification_purgee_at', t: 'timestamp with time zone' },
    ]);
  });

  it('REQ-CPL-006 : la valeur en base n’est jamais le clair, et se déchiffre pour SA ligne', async () => {
    const clair = 'Expérience du terrain trop récente.';
    const id = await uneDecision(await unCandidat(), { clair });
    const [l] = await base.prisma.$queryRaw<{ j: Buffer }[]>`
      SELECT "justification_chiffre" AS j FROM "decisions_candidature" WHERE "id" = ${id}::uuid`;
    expect(l!.j.toString('utf8')).not.toContain(clair);
    const ligne = { modele: MODELE_DECISION_CANDIDATURE, champ: 'justificationChiffre', id };
    expect(decryptPii(ligne, l!.j, CLES)).toBe(clair);
    expect(() => decryptPii({ ...ligne, champ: 'texteChiffre' }, l!.j, CLES)).toThrow();
    expect(() => decryptPii({ ...ligne, modele: 'Anomalie' }, l!.j, CLES)).toThrow();
  });

  it('REQ-CPL-006 : un bloc PERMUTÉ entre deux décisions ne se déchiffre pas', async () => {
    const apporteurId = await unCandidat();
    const premiere = await uneDecision(apporteurId, { clair: 'Premier motif.' });
    const seconde = await uneDecision(apporteurId, { clair: 'Second motif.', pour: premiere });
    const [l] = await base.prisma.$queryRaw<{ j: Buffer }[]>`
      SELECT "justification_chiffre" AS j FROM "decisions_candidature" WHERE "id" = ${seconde}::uuid`;
    expect(() =>
      decryptPii(
        { modele: MODELE_DECISION_CANDIDATURE, champ: 'justificationChiffre', id: seconde },
        l!.j,
        CLES
      )
    ).toThrow();
  });

  it('REQ-CPL-006 : un bloc vide est refusé par la base (`decisions_candidature_justification_non_vide`), un motif absent à l’insertion aussi (`…_purge_liee`)', async () => {
    const apporteurId = await unCandidat();
    for (const [bloc, nom] of [
      [Buffer.alloc(0), /decisions_candidature_justification_non_vide/],
      [null, /decisions_candidature_justification_purge_liee/],
    ] as const) {
      expect(
        await refus(
          app.$executeRaw`INSERT INTO "decisions_candidature"
            ("id", "apporteur_id", "resultat", "justification_chiffre", "auteur_id", "decidee_at")
            VALUES (${randomUUID()}::uuid, ${apporteurId}::uuid, 'refuse', ${bloc},
                    ${auteurId}::uuid, now())`
        )
      ).toMatch(nom);
    }
  });
});

describe('REQ-CPL-006 — le motif se PURGE, et seulement avec sa date (rattrapage 81, forme d’A02)', () => {
  const purgerLeMotif = (id: string, bloc: Buffer | null, at: Date | null) =>
    app.$executeRaw`UPDATE "decisions_candidature"
      SET "justification_chiffre" = ${bloc}, "justification_purgee_at" = ${at}
      WHERE "id" = ${id}::uuid`;

  it('REQ-CPL-006 : la purge — le motif passe à NULL AVEC sa date — est acceptée, et la décision reste', async () => {
    const id = await uneDecision(await unCandidat());
    await purgerLeMotif(id, null, MAINTENANT);
    const apres = await base.prisma.decisionCandidature.findUniqueOrThrow({ where: { id } });
    expect([apres.justificationChiffre, apres.justificationPurgeeAt, apres.resultat]).toEqual([
      null,
      MAINTENANT,
      'vivier',
    ]);
  });

  it('REQ-CPL-006 : un motif vidé SANS date, ou une date SANS vidage, est refusé', async () => {
    const id = await uneDecision(await unCandidat());
    expect(await refus(purgerLeMotif(id, null, null))).toMatch(/justification_purge_liee/);
    // La date seule : le bloc n'est pas réécrit (un nouveau chiffrement du même motif serait un
    // AUTRE bloc, que le gabarit refuserait avant le CHECK).
    expect(
      await refus(
        app.$executeRaw`UPDATE "decisions_candidature" SET "justification_purgee_at" = ${MAINTENANT}
          WHERE "id" = ${id}::uuid`
      )
    ).toMatch(/justification_purge_liee/);
  });

  it('REQ-CPL-006 : un motif purgé ne REVIENT pas, et sa date ne se réécrit pas', async () => {
    const id = await uneDecision(await unCandidat());
    await purgerLeMotif(id, null, MAINTENANT);
    expect(await refus(purgerLeMotif(id, blocDuMotif(id), null))).toMatch(
      /« justification_chiffre » \(purge\) ne se réécrit pas/
    );
    expect(await refus(purgerLeMotif(id, null, PLUS_TARD))).toMatch(
      /« justification_purgee_at » \(une_fois\) ne se réécrit pas/
    );
  });
});

describe('REQ-CPL-006 — le lien à l’apporteur SORT de la ligne, au plus tard avec le motif (forme d’A02, point b)', () => {
  const purgerLeLien = (id: string, apporteurId: string | null, at: Date | null) =>
    app.$executeRaw`UPDATE "decisions_candidature"
      SET "apporteur_id" = ${apporteurId}::uuid, "apporteur_purge_at" = ${at}
      WHERE "id" = ${id}::uuid`;
  const purgerLeMotif = (id: string) =>
    app.$executeRaw`UPDATE "decisions_candidature"
      SET "justification_chiffre" = NULL, "justification_purgee_at" = ${MAINTENANT}
      WHERE "id" = ${id}::uuid`;

  it('REQ-CPL-006 : la purge du lien AVEC sa date passe, après celle du motif', async () => {
    const id = await uneDecision(await unCandidat());
    await purgerLeMotif(id);
    await purgerLeLien(id, null, PLUS_TARD);
    const apres = await base.prisma.decisionCandidature.findUniqueOrThrow({ where: { id } });
    expect([apres.apporteurId, apres.apporteurPurgeAt, apres.resultat]).toEqual([
      null,
      PLUS_TARD,
      'vivier',
    ]);
  });

  it('REQ-CPL-006 : la purge du lien et celle du motif passent dans la MÊME écriture', async () => {
    const id = await uneDecision(await unCandidat());
    await app.$executeRaw`UPDATE "decisions_candidature"
      SET "justification_chiffre" = NULL, "justification_purgee_at" = ${MAINTENANT},
          "apporteur_id" = NULL, "apporteur_purge_at" = ${MAINTENANT}
      WHERE "id" = ${id}::uuid`;
    const apres = await base.prisma.decisionCandidature.findUniqueOrThrow({ where: { id } });
    expect([apres.apporteurId, apres.justificationChiffre]).toEqual([null, null]);
  });

  it('REQ-CPL-006 : le lien vidé SANS date, ou la date posée SANS vider le lien, est refusé (`decisions_candidature_apporteur_purge_liee`)', async () => {
    const apporteurId = await unCandidat();
    const id = await uneDecision(apporteurId);
    await purgerLeMotif(id);
    expect(await refus(purgerLeLien(id, null, null))).toMatch(
      /decisions_candidature_apporteur_purge_liee/
    );
    expect(await refus(purgerLeLien(id, apporteurId, PLUS_TARD))).toMatch(
      /decisions_candidature_apporteur_purge_liee/
    );
  });

  it('REQ-CPL-006 : le lien vidé alors que le motif est encore là est refusé (`decisions_candidature_purge_ordre`)', async () => {
    const id = await uneDecision(await unCandidat());
    expect(await refus(purgerLeLien(id, null, PLUS_TARD))).toMatch(
      /decisions_candidature_purge_ordre/
    );
  });

  it('REQ-CPL-006 : un lien purgé ne REVIENT pas, et sa date ne se réécrit pas', async () => {
    const apporteurId = await unCandidat();
    const id = await uneDecision(apporteurId);
    await purgerLeMotif(id);
    await purgerLeLien(id, null, PLUS_TARD);
    expect(await refus(purgerLeLien(id, apporteurId, null))).toMatch(
      /« apporteur_id » \(purge\) ne se réécrit pas/
    );
    expect(await refus(purgerLeLien(id, null, MAINTENANT))).toMatch(
      /« apporteur_purge_at » \(une_fois\) ne se réécrit pas/
    );
  });

  it('REQ-CPL-006 : après la purge du lien, la fiche du candidat s’efface ; avant, la clé la retient', async () => {
    const apporteurId = await unCandidat();
    const id = await uneDecision(apporteurId);
    const effacer = () => app.apporteur.delete({ where: { id: apporteurId } });
    expect(await refus(effacer())).toMatch(/decisions_candidature_apporteur_id_fkey|Foreign key/);
    await purgerLeMotif(id);
    await purgerLeLien(id, null, PLUS_TARD);
    await effacer();
    expect(await base.prisma.apporteur.count({ where: { id: apporteurId } })).toBe(0);
    expect(await base.prisma.decisionCandidature.count({ where: { id } })).toBe(1);
  });
});
