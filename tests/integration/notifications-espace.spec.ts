// @req REQ-UX-016
// @req REQ-JUR-039
/**
 * UX-P1-10 — les notifications de l'espace et leurs préférences, en base RÉELLE (REQ-UX-016,
 * REQ-JUR-039, partners/ADR-0022 exception E3).
 *
 * CE QUE LA BASE ET LA COUCHE TIENNENT :
 *   — `cle` : la base en tient la FORME (CHECK), sur les deux tables ; le code en tient la VALEUR,
 *     et ce qui est écrit par l'envoi est une clé de la table des notifications ;
 *   — la préférence : UNE ligne par (apporteur, clé), sous la contrainte nommée
 *     `preferences_notification_apporteur_cle_unique` ; l'écriture est un upsert PAR la couche
 *     cloisonnée, qui garde l'`id` ; la préférence d'un autre apporteur est invisible (A02) ;
 *   — une préférence qui désactiverait une notification obligatoire n'atteint pas la base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { forApporteur } from '../../src/server/acces/for-apporteur';
import { ecrirePreference, notifier } from '../../src/server/notifications/envoyer';
import { GABARITS } from '../../src/server/notifications/table-ssot';

let base: Base;
let A: string;
let B: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'signe',
        codeParrainage: `AX${hex(3).toUpperCase()}`,
        isTest: true,
        candidatureId: randomUUID(),
        reponsesJson: {},
        scoreInitial: 0,
        scorePartsJson: {},
        scoreBaremeVersion: 'v1',
        creeAt: MAINTENANT,
      },
    })
  ).id;
}

beforeAll(async () => {
  base = await demarrerBase();
  A = await unApporteur();
  B = await unApporteur();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

describe('REQ-UX-016 — la clé : sa forme en base, sa valeur dans le code', () => {
  it('REQ-UX-016 : TÉMOIN — une clé hors forme est refusée par la base, sur les deux tables, contrainte nommée', async () => {
    await expect(
      base.prisma.$executeRawUnsafe(
        `INSERT INTO notifications_espace (id, apporteur_id, cle) VALUES ($1::uuid, $2::uuid, 'Clé Hors Forme')`,
        randomUUID(),
        A
      )
    ).rejects.toThrow(/notifications_espace_cle_forme/);
    await expect(
      base.prisma.$executeRawUnsafe(
        `INSERT INTO preferences_notification (id, apporteur_id, cle, active, modifiee_at)
         VALUES ($1::uuid, $2::uuid, 'x-y', true, now())`,
        randomUUID(),
        A
      )
    ).rejects.toThrow(/preferences_notification_cle_forme/);
  });

  it('REQ-UX-016 REQ-JUR-039 : l’envoi écrit dans l’espace par la couche, et ce qui est écrit est une clé de la table', async () => {
    const issue = await notifier(
      {
        cle: 'refus_declaration',
        a: 'apporteur@exemple.invalid',
        parametres: { entreprise: 'E', categorie: 'Doublon', motif: 'déjà déposée' },
        attributionId: null,
      },
      {
        acces: forApporteur(base.prisma, A),
        urlDeLEspace: new URL('https://partners.exemple.invalid'),
        envoyerCourriel: async () => 'retenu_dmarc_non_verifie',
      }
    );
    expect(issue.courriel).toBe('retenu_dmarc_non_verifie');
    const lignes = await base.prisma.notificationEspace.findMany({ where: { apporteurId: A } });
    expect(lignes.map((l) => [l.id, l.cle, l.lueAt])).toEqual([
      [issue.notificationId, 'refus_declaration', null],
    ]);
    const ecrites = await base.prisma.$queryRawUnsafe<{ cle: string }[]>(
      'SELECT cle FROM notifications_espace UNION SELECT cle FROM preferences_notification'
    );
    for (const { cle } of ecrites) expect(Object.keys(GABARITS)).toContain(cle);
  });
});

describe('REQ-UX-016 — la préférence : un upsert par la couche, une ligne par (apporteur, clé)', () => {
  it('REQ-UX-016 : TÉMOIN — deux écritures sur la même clé laissent UNE ligne, la dernière valeur, le même id', async () => {
    const acces = forApporteur(base.prisma, A);
    expect(await ecrirePreference(acces, { cle: 'rappel_rc_pro', active: false }, MAINTENANT)).toBe(
      'creee'
    );
    const [premiere] = await base.prisma.preferenceNotification.findMany({
      where: { apporteurId: A, cle: 'rappel_rc_pro' },
    });
    const plusTard = new Date(MAINTENANT.getTime() + 60_000);
    expect(await ecrirePreference(acces, { cle: 'rappel_rc_pro', active: true }, plusTard)).toBe(
      'modifiee'
    );
    const lignes = await base.prisma.preferenceNotification.findMany({
      where: { apporteurId: A, cle: 'rappel_rc_pro' },
    });
    expect(lignes.map((l) => [l.id, l.active, l.modifieeAt.toISOString()])).toEqual([
      [premiere!.id, true, plusTard.toISOString()],
    ]);
  });

  it('REQ-UX-016 : TÉMOIN — une insertion directe en double échoue sur la contrainte nommée', async () => {
    const inserer = () =>
      base.prisma.$executeRawUnsafe(
        `INSERT INTO preferences_notification (id, apporteur_id, cle, active, modifiee_at)
         VALUES ($1::uuid, $2::uuid, 'depot_injoignable_j5', true, now())`,
        randomUUID(),
        B
      );
    await inserer();
    // Le message de Prisma ne nomme pas l'index : le refus se juge par son code et sa clé, et
    // l'index par le catalogue, à son nom exact. C'est un INDEX unique (CREATE UNIQUE INDEX dans la
    // migration), pas une contrainte de table : pg_constraint ne le verrait pas.
    const refus = await inserer().then(
      () => 'aucun refus',
      (e: unknown) => String((e as Error).message)
    );
    expect(refus).toMatch(/23505/);
    expect(refus).toMatch(/Key \(apporteur_id, cle\)=/);
    const index = await base.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'preferences_notification'
          AND indexname = 'preferences_notification_apporteur_cle_unique'`
    );
    expect(index.map((i) => i.indexdef)).toEqual([
      expect.stringMatching(
        /^CREATE UNIQUE INDEX preferences_notification_apporteur_cle_unique ON public\.preferences_notification USING btree \(apporteur_id, cle\)$/
      ),
    ]);
  });

  it('REQ-UX-016 : TÉMOIN — la préférence d’un autre apporteur est invisible par la couche', async () => {
    const [deB] = await base.prisma.preferenceNotification.findMany({ where: { apporteurId: B } });
    expect(deB).toBeDefined();
    const vueA = forApporteur(base.prisma, A).preferenceNotification;
    expect(await vueA.trouver(deB!.id)).toBeNull();
    expect(await vueA.lister({ where: { cle: 'depot_injoignable_j5' } })).toEqual([]);
    expect(await vueA.modifier(deB!.id, { active: false })).toBe('introuvable');
  });

  it('REQ-UX-016 : TÉMOIN — désactiver une notification obligatoire n’atteint pas la base', async () => {
    const avant = await base.prisma.preferenceNotification.count();
    await expect(
      ecrirePreference(
        forApporteur(base.prisma, A),
        { cle: 'suspension_declarations', active: false },
        MAINTENANT
      )
    ).rejects.toThrow(/obligatoire/);
    expect(await base.prisma.preferenceNotification.count()).toBe(avant);
  });
});
