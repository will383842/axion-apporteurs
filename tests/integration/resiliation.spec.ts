// @req REQ-JUR-006
// @req REQ-DM-011
// @req REQ-SEC-032
/**
 * SEC-19 — la résiliation et les décisions de contrat, en base RÉELLE, dans la forme d'A02 (#703,
 * 5982083436 §1) : la table `decisions_de_contrat` (CHECK et garde dédiée), le lien de la
 * notification, et la transaction de résiliation sur une attribution réelle.
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures,
 * les lectures et le TRUNCATE restent sous le propriétaire. Chaque refus est attendu sur son NOM.
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
import { resilierUnApporteur } from '../../src/server/apporteur/resiliation';
import { ARTICLES_MISE_EN_DEMEURE } from '../../src/domain/apporteur/resiliation';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let adminId: string;

const MAINTENANT = new Date('2026-10-04T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 700000000;
const unSiren = () => String((sirens += 1));
const GARDE = 'decisions_de_contrat_garde';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-19-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: MAINTENANT,
        importeeAt: MAINTENANT,
      },
    })
  ).id;
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
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

async function unApporteur(statut = 'signe'): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: statut as never,
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

/** Un fait du journal `apporteur_mis_en_demeure`, écrit par l'écrivain unique ; rend son id. */
async function unFait(apporteurId: string): Promise<bigint> {
  const inscrit = await base.prisma.$transaction((tx) =>
    ajouterEvenement(tx, {
      type: 'apporteur_mis_en_demeure',
      agregat: 'apporteur',
      agregatId: apporteurId,
      survenuAt: MAINTENANT,
      charge: { article: '6', acteur: { par: 'utilisateur_console', id: adminId } },
    })
  );
  return BigInt(inscrit.id);
}

type Ligne = {
  geste: 'mise_en_demeure' | 'resiliation';
  article?: string | null;
  texte?: Buffer | null;
  dateReception?: string | null;
  dateEffet?: string | null;
  purgeAt?: Date | null;
  cle?: string | null;
  empreinte?: string | null;
};

/** Une décision, insérée par SQL brut sous `partners_app` ; rend son id. */
async function uneDecision(l: Ligne, apporteurId?: string): Promise<string> {
  const a = apporteurId ?? (await unApporteur());
  const id = randomUUID();
  const texte = l.texte === undefined ? randomBytes(40) : l.texte;
  // Par défaut, une mise en demeure porte sa clé et l'empreinte de son texte ; une résiliation, rien.
  const med = l.geste === 'mise_en_demeure';
  await app.$executeRawUnsafe(
    `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, article, texte_chiffre,
       date_reception, date_effet, evenement_id, texte_purge_at, cle_idempotence, faits_empreinte)
     VALUES ($1::uuid, $2::uuid, $3::geste_decision_contrat, $4, $5, $6::date, $7::date, $8, $9,
       $10::uuid, $11)`,
    id,
    a,
    l.geste,
    l.article ?? null,
    texte,
    l.dateReception ?? null,
    l.dateEffet ?? null,
    await unFait(a),
    l.purgeAt ?? null,
    l.cle === undefined ? (med ? randomUUID() : null) : l.cle,
    l.empreinte === undefined ? (med && texte !== null ? hex(32) : null) : l.empreinte
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

const MISE_EN_DEMEURE: Ligne = { geste: 'mise_en_demeure', article: '6' };
const RESILIATION: Ligne = {
  geste: 'resiliation',
  dateReception: '2026-09-01',
  dateEffet: '2026-10-01',
};

describe('REQ-JUR-006 — decisions_de_contrat : la forme de chaque geste, dans les deux sens', () => {
  it('REQ-JUR-006 : une mise en demeure juste et une résiliation juste passent', async () => {
    await uneDecision(MISE_EN_DEMEURE);
    await uneDecision(RESILIATION);
    // Une résiliation sans décision motivée n'a pas de texte.
    await uneDecision({ ...RESILIATION, texte: null });
  });

  it('REQ-JUR-006 : TÉMOIN — la mise en demeure vise un article et n’a pas de dates ; la résiliation, l’inverse', async () => {
    const forme = 'decisions_de_contrat_forme_du_geste';
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, article: null }))).toContain(forme);
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, dateReception: '2026-09-01' }))).toContain(
      forme
    );
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, dateEffet: '2026-10-01' }))).toContain(
      forme
    );
    expect(await refus(uneDecision({ ...RESILIATION, article: '6' }))).toContain(forme);
    expect(await refus(uneDecision({ ...RESILIATION, dateReception: null }))).toContain(forme);
    expect(await refus(uneDecision({ ...RESILIATION, dateEffet: null }))).toContain(forme);
  });

  it('REQ-JUR-006 : TÉMOIN — l’article est dans la liste FERMÉE de l’art. 11.2, celle du domaine', async () => {
    for (const article of ARTICLES_MISE_EN_DEMEURE) {
      await uneDecision({ ...MISE_EN_DEMEURE, article });
    }
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, article: '10' }))).toContain(
      'decisions_de_contrat_article_ferme'
    );
    const [def] = await base.prisma.$queryRawUnsafe<{ d: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
       WHERE conname = 'decisions_de_contrat_article_ferme'`
    );
    const enBase = [...def!.d.matchAll(/'([0-9.]+)'/g)].map((m) => m[1]);
    expect(enBase).toEqual([...ARTICLES_MISE_EN_DEMEURE]);
  });

  it('REQ-JUR-006 : TÉMOIN — une mise en demeure naît avec ses faits', async () => {
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, texte: null }))).toContain(
      'decisions_de_contrat_faits_de_la_mise_en_demeure'
    );
  });

  it('REQ-JUR-006 : TÉMOIN — l’événement fonde UNE décision', async () => {
    const a = await unApporteur();
    const fait = await unFait(a);
    const inserer = () =>
      app.$executeRawUnsafe(
        `INSERT INTO decisions_de_contrat (id, apporteur_id, geste, article, texte_chiffre, evenement_id,
           cle_idempotence, faits_empreinte)
         VALUES ($1::uuid, $2::uuid, 'mise_en_demeure', '6', $3, $4, $5::uuid, $6)`,
        randomUUID(),
        a,
        randomBytes(40),
        fait,
        // Une clé neuve à chaque appel : seul l'événement est partagé.
        randomUUID(),
        hex(32)
      );
    await inserer();
    expect(await refus(inserer())).toContain('evenement_id');
  });
});

describe('REQ-JUR-006 — decisions_de_contrat : la garde dédiée', () => {
  it('REQ-JUR-006 : TÉMOIN — une décision naît sans purge', async () => {
    expect(
      await refus(uneDecision({ ...MISE_EN_DEMEURE, texte: null, purgeAt: MAINTENANT }))
    ).toContain(GARDE);
  });

  it('REQ-JUR-006 : TÉMOIN — la purge du texte s’écrit UNE fois ; toute autre réécriture est refusée', async () => {
    const id = await uneDecision(MISE_EN_DEMEURE);
    const purger = () =>
      app.$executeRawUnsafe(
        `UPDATE decisions_de_contrat SET texte_chiffre = NULL, faits_empreinte = NULL, texte_purge_at = $2
         WHERE id = $1::uuid`,
        id,
        MAINTENANT
      );
    // Toute autre écriture, avant la purge : refusée.
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET article = '7' WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GARDE);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET texte_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(GARDE);
    // La purge vide le texte sans poser sa date : refusée.
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET texte_chiffre = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GARDE);
    await purger();
    const [l] = await base.prisma.$queryRawUnsafe<{ t: Buffer | null; p: Date | null }[]>(
      `SELECT texte_chiffre AS t, texte_purge_at AS p FROM decisions_de_contrat WHERE id = $1::uuid`,
      id
    );
    expect(l).toEqual({ t: null, p: MAINTENANT });
    const [e] = await base.prisma.$queryRawUnsafe<{ e: string | null }[]>(
      `SELECT faits_empreinte AS e FROM decisions_de_contrat WHERE id = $1::uuid`,
      id
    );
    expect(e!.e).toBeNull();
    // Une seconde purge : refusée.
    expect(await refus(purger())).toContain(GARDE);
  });

  it('REQ-JUR-006 : TÉMOIN — DELETE et TRUNCATE sont refusés : la ligne nue reste comme preuve', async () => {
    const id = await uneDecision(RESILIATION);
    expect(
      await refus(app.$executeRawUnsafe(`DELETE FROM decisions_de_contrat WHERE id = $1::uuid`, id))
    ).toContain(GARDE);
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE decisions_de_contrat CASCADE`))
    ).toContain(GARDE);
  });

  it('REQ-JUR-006 : TÉMOIN — une notification ne porte une décision que pour mise_en_demeure ou resiliation', async () => {
    const a = await unApporteur();
    const decision = await uneDecision(MISE_EN_DEMEURE, a);
    const notifier = (cle: string) =>
      app.$executeRawUnsafe(
        `INSERT INTO notifications_espace (id, apporteur_id, cle, decision_contrat_id)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid)`,
        randomUUID(),
        a,
        cle,
        decision
      );
    await notifier('mise_en_demeure');
    expect(await refus(notifier('rappel_rc_pro'))).toContain(
      'notifications_espace_decision_contrat_cle'
    );
  });
});

describe('REQ-DM-011 — la résiliation, en base réelle', () => {
  it('REQ-DM-011 : TÉMOIN — une attribution provisoire est annulée par fin_de_contrat, dans la transaction de la résiliation, avec son événement', async () => {
    const apporteurId = await unApporteur('signe');
    const attributionId = randomUUID();
    const bloc = () => randomBytes(40);
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier,
         nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
         phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
       VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
         false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
      attributionId,
      apporteurId,
      unSiren(),
      grilleId,
      bloc(),
      bloc(),
      bloc(),
      hex(32),
      bloc(),
      hex(32),
      bloc(),
      bloc()
    );
    const r = await app.$transaction((tx) =>
      resilierUnApporteur(
        tx,
        {
          apporteurId,
          motif: 'ordinaire_apporteur',
          dateReception: MAINTENANT,
          acteur: { par: 'utilisateur_console', id: adminId },
          maintenant: MAINTENANT,
        },
        CLES
      )
    );
    expect(r).toMatchObject({ de: 'signe', vers: 'resilie' });
    const apres = await base.prisma.attribution.findUniqueOrThrow({
      where: { id: attributionId },
      select: { statut: true },
    });
    expect(apres.statut).toBe('annulee');
    const [fait] = await base.prisma.$queryRawUnsafe<{ transition: string }[]>(
      `SELECT charge->>'transition' AS transition FROM evenements
       WHERE agregat_id = $1::uuid AND type = 'attribution_etat_modifie' ORDER BY id DESC LIMIT 1`,
      attributionId
    );
    expect(fait!.transition).toBe('fin_de_contrat');
    // Aucune attribution de l'apporteur n'est laissée en file ou occupante hors de figee_resiliation.
    const restantes = await base.prisma.attribution.count({
      where: {
        apporteurId,
        statut: {
          in: [
            'en_attente',
            'provisoire',
            'active',
            'rdv_pris',
            'proposition',
            'signee',
            'convertie',
          ],
        },
      },
    });
    expect(restantes).toBe(0);
  });
});

describe('REQ-JUR-006 — decisions_de_contrat : l’idempotence de la mise en demeure (A02, 5982552283)', () => {
  it('REQ-JUR-006 : TÉMOIN — une mise en demeure sans clé est refusée ; une résiliation peut s’en passer', async () => {
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, cle: null }))).toContain(
      'decisions_de_contrat_cle_de_la_mise_en_demeure'
    );
    await uneDecision({ ...RESILIATION, cle: null });
    await uneDecision({ ...RESILIATION, cle: randomUUID() });
  });

  it('REQ-JUR-006 : TÉMOIN — l’empreinte : hors forme refusée ; sans texte, ou texte sans empreinte, refusés ; jamais sur une résiliation', async () => {
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, empreinte: 'A'.repeat(64) }))).toContain(
      'decisions_de_contrat_faits_empreinte_forme'
    );
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, empreinte: null }))).toContain(
      'decisions_de_contrat_empreinte_liee_au_texte'
    );
    expect(await refus(uneDecision({ ...RESILIATION, empreinte: hex(32) }))).toContain(
      'decisions_de_contrat_empreinte_liee_au_texte'
    );
  });

  it('REQ-JUR-006 : TÉMOIN — l’index unique refuse une seconde ligne de même clé, même hors du code', async () => {
    const cle = randomUUID();
    await uneDecision({ ...MISE_EN_DEMEURE, cle });
    expect(await refus(uneDecision({ ...MISE_EN_DEMEURE, cle }))).toContain('cle_idempotence');
  });

  it('REQ-JUR-006 : TÉMOIN — une purge qui garde l’empreinte est refusée ; une réécriture de la clé aussi', async () => {
    const id = await uneDecision(MISE_EN_DEMEURE);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET texte_chiffre = NULL, texte_purge_at = $2 WHERE id = $1::uuid`,
          id,
          MAINTENANT
        )
      )
    ).toMatch(/decisions_de_contrat_(?:garde|empreinte_liee_au_texte)/);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE decisions_de_contrat SET cle_idempotence = $2::uuid WHERE id = $1::uuid`,
          id,
          randomUUID()
        )
      )
    ).toContain(GARDE);
  });
});
