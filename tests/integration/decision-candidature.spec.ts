// @req REQ-CPL-006
/**
 * CPL-T06, en base RÉELLE — la table `decisions_candidature` (REQ-CPL-006, cadrage de l'architecte
 * du 2026-09-26, partners/ADR-0022).
 *
 * EN AJOUT SEUL : une nouvelle décision est une nouvelle ligne. La base refuse la mise à jour, la
 * suppression et la troncature (le trio de déclencheurs des tables en ajout seul), et la colonne
 * `resultat` est un enum fermé.
 *
 * DE BOUT EN BOUT, dans UNE transaction : la décision rendue par le domaine est inscrite, le statut
 * de l'apporteur suit, et le changement de statut entre au journal chaîné par son écrivain unique
 * (`ajouterEvenement`), sous le type `apporteur_statut_modifie`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { deciderCandidature } from '../../src/domain/candidature/decision';
import { ajouterEvenement } from '../../src/server/evenement/journal';

let base: Base;
let auteurId: string;
const MAINTENANT = new Date('2026-10-03T09:00:00.000Z');

beforeAll(async () => {
  base = await demarrerBase();
  auteurId = (
    await base.prisma.utilisateurConsole.create({
      // Désactivé : un compte actif exige une adresse chiffrée (CHECK), sans rapport avec la décision.
      data: { role: 'qualifieur', creeAt: MAINTENANT, desactiveAt: MAINTENANT },
      select: { id: true },
    })
  ).id;
}, 180_000);

afterAll(async () => {
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

async function uneDecision(apporteurId: string) {
  return base.prisma.decisionCandidature.create({
    data: {
      apporteurId,
      resultat: 'vivier',
      justification: 'Profil à revoir au prochain cycle.',
      webinaireSuivi: null,
      auteurId,
      decideeAt: MAINTENANT,
    },
  });
}

describe('REQ-CPL-006 — `decisions_candidature` est en ajout seul, et son résultat est fermé', () => {
  it('REQ-CPL-006 : une décision s’inscrit, et une SECONDE décision est une seconde ligne', async () => {
    const apporteurId = await unCandidat();
    await uneDecision(apporteurId);
    await uneDecision(apporteurId);
    expect(await base.prisma.decisionCandidature.count({ where: { apporteurId } })).toBe(2);
  });

  it('REQ-CPL-006 : la base REFUSE la mise à jour d’une décision', async () => {
    const d = await uneDecision(await unCandidat());
    await expect(
      base.prisma.decisionCandidature.update({ where: { id: d.id }, data: { resultat: 'retenu' } })
    ).rejects.toThrow(/ajout seul/);
  });

  it('REQ-CPL-006 : la base REFUSE la suppression et la troncature', async () => {
    const d = await uneDecision(await unCandidat());
    await expect(base.prisma.decisionCandidature.delete({ where: { id: d.id } })).rejects.toThrow(
      /ajout seul/
    );
    await expect(
      base.prisma.$executeRawUnsafe('TRUNCATE "decisions_candidature" CASCADE')
    ).rejects.toThrow(/ajout seul/);
  });

  it('REQ-CPL-006 : un résultat hors de l’enum est refusé par la base', async () => {
    const apporteurId = await unCandidat();
    await expect(
      base.prisma.$executeRaw`INSERT INTO "decisions_candidature"
        ("id", "apporteur_id", "resultat", "justification", "auteur_id", "decidee_at")
        VALUES (${randomUUID()}::uuid, ${apporteurId}::uuid, 'accepte', 'x', ${auteurId}::uuid, now())`
    ).rejects.toThrow(/resultat_decision_candidature/);
  });

  it('REQ-CPL-006 : une décision sans auteur de la console, ou sur un apporteur inconnu, est refusée', async () => {
    const apporteurId = await unCandidat();
    await expect(
      base.prisma.decisionCandidature.create({
        data: {
          apporteurId,
          resultat: 'refuse',
          justification: 'x',
          webinaireSuivi: false,
          auteurId: randomUUID(),
          decideeAt: MAINTENANT,
        },
      })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    await expect(
      base.prisma.decisionCandidature.create({
        data: {
          apporteurId: randomUUID(),
          resultat: 'refuse',
          justification: 'x',
          webinaireSuivi: false,
          auteurId,
          decideeAt: MAINTENANT,
        },
      })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});

describe('REQ-CPL-006 — de bout en bout : la décision, le statut et le journal, ensemble', () => {
  it('REQ-CPL-006 : retenir un candidat inscrit la décision, le passe `retenu`, et journalise `candidat → retenu` sous `retenir`', async () => {
    const apporteurId = await unCandidat();
    const r = deciderCandidature({
      statutActuel: 'candidat',
      resultat: 'retenu',
      justification: 'Réseau et motivation alignés.',
      webinaireSuivi: true,
      auteurId,
      decideeAt: MAINTENANT,
    });
    await base.prisma.$transaction(async (tx) => {
      await tx.decisionCandidature.create({ data: { apporteurId, ...r.decision } });
      await tx.apporteur.update({ where: { id: apporteurId }, data: { statut: r.statut } });
      await ajouterEvenement(tx, {
        type: 'apporteur_statut_modifie',
        agregat: 'apporteur',
        agregatId: apporteurId,
        survenuAt: MAINTENANT,
        charge: r.chargeStatut,
      });
    });
    const a = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: apporteurId } });
    expect(a.statut).toBe('retenu');
    const d = await base.prisma.decisionCandidature.findFirstOrThrow({ where: { apporteurId } });
    expect([d.resultat, d.webinaireSuivi, d.auteurId]).toEqual(['retenu', true, auteurId]);
    const e = await base.prisma.evenement.findFirstOrThrow({
      where: { type: 'apporteur_statut_modifie', agregatId: apporteurId },
    });
    expect(e.charge).toMatchObject({ de: 'candidat', vers: 'retenu', transition: 'retenir' });
  });
});
