// @req REQ-SEC-018
// @req REQ-SEC-019
/**
 * SEC-15 — la suspension, en base RÉELLE, dans la forme d'A02 (#794, 6035951154, 6036131730 et
 * 6036174464) : les CHECK du gel, la garde `apporteurs_gel_garde`, la décision `suspension` et sa
 * notification, puis la pose et la levée par le code serveur.
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures
 * et les lectures restent sous le propriétaire. Chaque refus est attendu sur son NOM.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import {
  leverLesSuspensionsEchues,
  leverUneSuspension,
  poserUneSuspension,
} from '../../src/server/apporteur/suspension';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let app: PrismaClient;
let adminId: string;

const MAINTENANT = new Date('2026-10-07T07:30:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
const GARDE = 'apporteurs_gel_garde';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-15-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  // Un administrateur VALIDÉ : le droit de la suspension est relu en base (sécurité, #794 6039195762).
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    MAINTENANT
  );
  adminId = admin!.id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Un apporteur sous contrat ; `gel` force des colonnes à l'insertion (témoins des CHECK). */
async function unApporteur(
  client: PrismaClient = base.prisma,
  gel: Record<string, unknown> = {}
): Promise<string> {
  return (
    await client.apporteur.create({
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
        ...gel,
      },
    })
  ).id;
}

/** Un fait du journal `apporteur_gel_modifie`, écrit par l'écrivain unique ; rend son id. */
async function unFait(apporteurId: string): Promise<bigint> {
  const inscrit = await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'apporteur_gel_modifie',
      agregat: 'apporteur',
      agregatId: apporteurId,
      survenuAt: MAINTENANT,
      charge: {
        de: 'libre',
        vers: 'gele_non_confirmation',
        par: 'role',
        acteur: { par: 'utilisateur_console', id: adminId },
      },
    })
  );
  return BigInt(inscrit.id);
}

type Ligne = {
  geste?: 'suspension' | 'mise_en_demeure';
  article?: string | null;
  texte?: Buffer | null;
  dateReception?: string | null;
  cle?: string | null;
};

/** Une décision, insérée par SQL brut sous `partners_app` ; par défaut, une suspension juste. */
async function uneDecision(apporteurId: string, l: Ligne = {}): Promise<string> {
  const id = randomUUID();
  const texte = l.texte === undefined ? randomBytes(40) : l.texte;
  await app.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, article, texte_chiffre,
       date_reception, evenement_id, cle_idempotence, faits_empreinte)
     VALUES ($1::uuid, $2::uuid, $3::geste_decision_contrat, $4, $5, $6::date, $7, $8::uuid, $9)`,
    id,
    apporteurId,
    l.geste ?? 'suspension',
    l.article === undefined ? (l.geste === 'mise_en_demeure' ? '6' : '3.7') : l.article,
    texte,
    l.dateReception ?? null,
    await unFait(apporteurId),
    l.cle === undefined ? randomUUID() : l.cle,
    texte === null ? null : hex(32)
  );
  return id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

/** La pose par SQL brut sous `partners_app` ; chaque colonne peut être forcée. */
function poser(apporteurId: string, o: Record<string, unknown>) {
  const v = {
    statut: 'suspendu',
    etat_gel: 'gele_non_confirmation',
    depots_geles_depuis: MAINTENANT,
    gel_pose_par_id: adminId,
    gel_decision_contrat_id: null,
    gel_anomalie_id: null,
    ...o,
  };
  return app.$executeRawUnsafe(
    `UPDATE apporteurs SET statut = $2::statut_apporteur, etat_gel = $3::etat_gel,
       depots_geles_depuis = $4, gel_pose_par_id = $5::uuid, gel_decision_contrat_id = $6::uuid,
       gel_anomalie_id = $7::uuid
     WHERE id = $1::uuid`,
    apporteurId,
    v.statut,
    v.etat_gel,
    v.depots_geles_depuis,
    v.gel_pose_par_id,
    v.gel_decision_contrat_id,
    v.gel_anomalie_id
  );
}

/** Un apporteur gelé par une pose juste ; rend son id et sa décision. */
async function unGele(): Promise<{ a: string; decision: string }> {
  const a = await unApporteur();
  const decision = await uneDecision(a);
  await poser(a, { gel_decision_contrat_id: decision });
  return { a, decision };
}

describe('REQ-SEC-018 — apporteurs : les CHECK du gel (A02, 6035951154)', () => {
  it('REQ-SEC-018 : TÉMOIN — un apporteur libre ne porte ni date, ni auteur, ni décision de gel', async () => {
    const d = await uneDecision(await unApporteur());
    expect(await refus(unApporteur(app, { depotsGelesDepuis: MAINTENANT }))).toContain(
      'apporteurs_gel_date_liee'
    );
    expect(await refus(unApporteur(app, { gelPoseParId: adminId }))).toContain(
      'apporteurs_gel_auteur_lie'
    );
    expect(await refus(unApporteur(app, { gelDecisionContratId: d }))).toContain(
      'apporteurs_gel_decision_liee'
    );
  });

  it('REQ-SEC-018 : TÉMOIN — la fraude cite son anomalie ; un gel laisse le statut à signe : refusés', async () => {
    const a = await unApporteur();
    const decision = await uneDecision(a);
    expect(
      await refus(poser(a, { etat_gel: 'gele_fraude', gel_decision_contrat_id: decision }))
    ).toContain('apporteurs_gel_fraude_anomalie');
    expect(await refus(poser(a, { statut: 'signe', gel_decision_contrat_id: decision }))).toContain(
      'apporteurs_suspendu_si_gele'
    );
  });
});

describe('REQ-SEC-018 — apporteurs : la garde dédiée du gel (A02, 6035951154, 6036131730)', () => {
  it('REQ-SEC-018 : TÉMOIN — un apporteur naît LIBRE : une ligne insérée gelée (posée ou échue) est refusée (A02, note de pré-relecture)', async () => {
    for (const depotsGelesDepuis of [MAINTENANT, new Date('2026-01-01T00:00:00.000Z')]) {
      expect(
        await refus(
          unApporteur(app, {
            statut: 'suspendu',
            etatGel: 'gele_non_confirmation',
            depotsGelesDepuis,
            gelPoseParId: adminId,
          })
        )
      ).toContain('apporteurs_gel_naissance');
    }
  });

  it('REQ-SEC-018 : TÉMOIN — la pose puis la levée passent ; la levée remet tout à NULL', async () => {
    const { a } = await unGele();
    await app.$executeRawUnsafe(
      `UPDATE apporteurs SET statut = 'signe', etat_gel = 'libre', depots_geles_depuis = NULL,
         gel_pose_par_id = NULL, gel_decision_contrat_id = NULL WHERE id = $1::uuid`,
      a
    );
    const r = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a } });
    expect([r.statut, r.etatGel, r.gelDecisionContratId]).toEqual(['signe', 'libre', null]);
  });

  it('REQ-SEC-018 : TÉMOIN — une pose partielle est refusée : sans auteur, sans date, sans décision', async () => {
    const a = await unApporteur();
    const decision = await uneDecision(a);
    for (const manque of ['gel_pose_par_id', 'depots_geles_depuis', 'gel_decision_contrat_id']) {
      expect(
        await refus(poser(a, { gel_decision_contrat_id: decision, [manque]: null })),
        manque
      ).toContain(GARDE);
    }
  });

  it('REQ-SEC-018 : TÉMOIN — une pose qui cite la décision d’un AUTRE apporteur, ou une mise en demeure, est refusée', async () => {
    const a = await unApporteur();
    const autre = await uneDecision(await unApporteur());
    const miseEnDemeure = await uneDecision(a, { geste: 'mise_en_demeure' });
    for (const decision of [autre, miseEnDemeure]) {
      expect(await refus(poser(a, { gel_decision_contrat_id: decision }))).toContain(
        'la décision citée est une suspension du même apporteur'
      );
    }
  });

  it('REQ-SEC-018 : TÉMOIN — pendant le gel, rien ne bouge en place, et un gel ne devient pas un autre gel', async () => {
    const { a } = await unGele();
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE apporteurs SET depots_geles_depuis = $2 WHERE id = $1::uuid`,
          a,
          new Date('2026-10-08T07:30:00.000Z')
        )
      )
    ).toContain('le gel ne se modifie pas en place');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE apporteurs SET etat_gel = 'gele_fraude' WHERE id = $1::uuid`,
          a
        )
      )
    ).toContain('un gel ne devient pas un autre gel');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE apporteurs SET statut = 'signe', etat_gel = 'libre', depots_geles_depuis = NULL,
             gel_pose_par_id = NULL WHERE id = $1::uuid`,
          a
        )
      )
    ).toContain('une levée remet la date');
  });
});

describe('REQ-SEC-018 — decisions_de_contrat : la suspension (A02, 6036131730, 6036174464)', () => {
  it('REQ-SEC-018 : TÉMOIN — une suspension sans article, ou avec un article de la liste autre que 3.7, ou avec une date, est refusée', async () => {
    const a = await unApporteur();
    const forme = 'decisions_de_contrat_forme_du_geste';
    expect(await refus(uneDecision(a, { article: null }))).toContain(forme);
    expect(await refus(uneDecision(a, { article: '6' }))).toContain(forme);
    expect(await refus(uneDecision(a, { dateReception: '2026-10-01' }))).toContain(forme);
  });

  it('REQ-SEC-018 : TÉMOIN — une suspension naît avec ses faits et sa clé', async () => {
    const a = await unApporteur();
    expect(await refus(uneDecision(a, { texte: null }))).toContain(
      'decisions_de_contrat_faits_de_la_suspension'
    );
    expect(await refus(uneDecision(a, { cle: null }))).toContain(
      'decisions_de_contrat_cle_de_la_suspension'
    );
  });

  it('REQ-SEC-018 : TÉMOIN — suspension_declarations porte sa décision ; une autre clé hors liste, non', async () => {
    const a = await unApporteur();
    const decision = await uneDecision(a);
    const notifier = (cle: string) =>
      app.$executeRawUnsafe(
        `INSERT INTO notifications_espace (id, apporteur_id, cle, decision_contrat_id)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid)`,
        randomUUID(),
        a,
        cle,
        decision
      );
    await notifier('suspension_declarations');
    expect(await refus(notifier('rappel_rc_pro'))).toContain(
      'notifications_espace_decision_contrat_cle'
    );
  });
});

describe('REQ-SEC-019 — la pose et la levée par le code serveur, en base réelle', () => {
  it('REQ-SEC-018 : TÉMOIN — la pose écrit la décision, l’apporteur qui la cite et la notification, en une transaction', async () => {
    const a = await unApporteur();
    const cle = randomUUID();
    await app.$transaction((tx) =>
      poserUneSuspension(tx, {
        apporteurId: a,
        faits: { motif: 'gele_non_confirmation', indicationRecueAt: MAINTENANT.getTime() - 60_000 },
        acteur: { id: adminId },
        maintenant: MAINTENANT,
        faitsTexte: "L'entreprise déclarée a indiqué n'avoir eu aucun échange avec vous.",
        cleIdempotence: cle,
        cles: CLES,
      })
    );
    const r = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a } });
    expect([r.statut, r.etatGel]).toEqual(['suspendu', 'gele_non_confirmation']);
    const d = await base.prisma.decisionDeContrat.findUniqueOrThrow({
      where: { id: r.gelDecisionContratId! },
    });
    expect([d.geste, d.article, d.cleIdempotence]).toEqual(['suspension', '3.7', cle]);
    const n = await base.prisma.notificationEspace.findMany({ where: { apporteurId: a } });
    expect(n.map((x) => [x.cle, x.decisionContratId, x.evenementId])).toEqual([
      ['suspension_declarations', d.id, d.evenementId],
    ]);
  });

  it('REQ-SEC-019 : TÉMOIN — la levée de plein droit passe à l’échéance, pas avant', async () => {
    const { a } = await unGele();
    const avant = await leverLesSuspensionsEchues(app, new Date('2026-10-22T07:29:00.000Z'));
    expect((await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a } })).etatGel).toBe(
      'gele_non_confirmation'
    );
    const apres = await leverLesSuspensionsEchues(app, new Date('2026-10-22T07:30:00.000Z'));
    expect(apres.levees).toBeGreaterThanOrEqual(avant.levees + 1);
    const r = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a } });
    expect([r.statut, r.etatGel, r.gelDecisionContratId]).toEqual(['signe', 'libre', null]);
  });

  it('REQ-SEC-019 : la levée par un rôle remet l’apporteur à signe', async () => {
    const { a } = await unGele();
    await app.$transaction((tx) =>
      leverUneSuspension(tx, {
        apporteurId: a,
        par: { role: { id: adminId } },
        maintenant: new Date('2026-10-08T07:30:00.000Z'),
      })
    );
    const r = await base.prisma.apporteur.findUniqueOrThrow({ where: { id: a } });
    expect([r.statut, r.etatGel]).toEqual(['signe', 'libre']);
  });
});
