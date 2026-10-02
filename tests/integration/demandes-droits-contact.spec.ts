// @req REQ-JUR-065
/**
 * DM-59 (REQ-JUR-065) — chaque demande de droit du contact est une ligne tracée, sans donnée de
 * personne en clair, contre la base RÉELLE.
 *
 * CE QU'IL PROUVE, chaque refus attendu sur son NOM :
 *   — les formes : la donnée visée n'existe que pour une rectification, la valeur chiffrée (ou sa
 *     date d'effacement, jamais les deux ni aucune) aussi ; un traitement porte son issue ;
 *   — `recue_at` est l'heure de la BASE, jamais celle de l'appelant ;
 *   — la protection (gabarit `refuser_modification_sauf`) : un traitement, une issue, une
 *     prolongation s'écrivent une fois ; la valeur s'efface sans retour ; rien d'autre ne change ;
 *     DELETE et TRUNCATE sont refusés ;
 *   — une prolongation après le traitement est refusée par son CHECK ;
 *   — la tâche de fond efface la valeur non traitée à un mois, ou à trois s'il y a prolongation, et
 *     pas avant ; aucun événement du journal ne porte la valeur ;
 *   — le jeton des droits de l'attribution : empreinte en forme, unique, effacé par la purge du
 *     contact (DM-48), et refusé sur une attribution purgée.
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { purgerLesValeursDesDroits } from '../../src/server/taches/purger-valeurs-droits-contact';
import { purgerLesContacts } from '../../src/server/taches/purger-contacts';

let base: Base;
let grilleId: string;
let apporteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 400000000;
const unSiren = () => String((sirens += 1));
const GABARIT = 'refuser_modification_sauf';

beforeAll(async () => {
  base = await demarrerBase();
  const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
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
  apporteurId = (
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
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

/** Une attribution au contact complet (blocs factices), par SQL brut. */
async function uneAttribution(p: { purgeContactAt?: Date | null; jeton?: string | null } = {}) {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare,
       purge_contact_at, jeton_droits_hash)
     VALUES ($1::uuid, $2::uuid, 'perdue'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false, $13, $14)`,
    id,
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
    bloc(),
    p.purgeContactAt ?? null,
    p.jeton === undefined ? hex(32) : p.jeton
  );
  return id;
}

type Demande = {
  attribution?: string;
  droit: 'acces' | 'rectification' | 'effacement' | 'limitation' | 'opposition';
  donnee?: 'nom' | 'prenom' | 'fonction' | 'telephone' | 'email' | null;
  valeur?: Buffer | null;
  valeurPurgeeAt?: Date | null;
};

/** Une demande par SQL brut : c'est la BASE qu'on juge. Rend son id. */
async function demande(d: Demande): Promise<string> {
  const id = randomUUID();
  const rectification = d.droit === 'rectification';
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO demandes_droits_contact (id, attribution_id, droit, donnee_visee, valeur_chiffree,
       valeur_purgee_at)
     VALUES ($1::uuid, $2::uuid, $3::droit_contact, $4::donnee_contact, $5, $6)`,
    id,
    d.attribution ?? (await uneAttribution()),
    d.droit,
    d.donnee === undefined ? (rectification ? 'telephone' : null) : d.donnee,
    d.valeur === undefined ? (rectification ? randomBytes(40) : null) : d.valeur,
    d.valeurPurgeeAt ?? null
  );
  return id;
}

/** Avance l'horloge de la demande, par l'administrateur des tests : le déclencheur est suspendu. */
async function reculer(id: string, recueAt: Date): Promise<void> {
  await base.prisma.$transaction([
    base.prisma.$executeRawUnsafe(
      `ALTER TABLE demandes_droits_contact DISABLE TRIGGER demandes_droits_contact_ajout_seul`
    ),
    base.prisma.$executeRawUnsafe(
      `UPDATE demandes_droits_contact SET recue_at = $2 WHERE id = $1::uuid`,
      id,
      recueAt
    ),
    base.prisma.$executeRawUnsafe(
      `ALTER TABLE demandes_droits_contact ENABLE TRIGGER demandes_droits_contact_ajout_seul`
    ),
  ]);
}

async function ligne(id: string) {
  const [l] = await base.prisma.$queryRaw<
    {
      recue_at: Date;
      valeur_chiffree: Buffer | null;
      valeur_purgee_at: Date | null;
      traitee_at: Date | null;
    }[]
  >`SELECT recue_at, valeur_chiffree, valeur_purgee_at, traitee_at
    FROM demandes_droits_contact WHERE id = ${id}::uuid`;
  return l!;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const maj = (sql: string, ...valeurs: unknown[]) => base.prisma.$executeRawUnsafe(sql, ...valeurs);

describe('REQ-JUR-065 — les formes d’une demande de droit', () => {
  it('REQ-JUR-065 : TÉMOIN — une rectification sans donnée visée, et une donnée visée sur un autre droit, sont refusées', async () => {
    expect(await refus(demande({ droit: 'rectification', donnee: null }))).toContain(
      'demandes_droits_contact_donnee_si_rectification'
    );
    expect(await refus(demande({ droit: 'acces', donnee: 'email' }))).toContain(
      'demandes_droits_contact_donnee_si_rectification'
    );
  });

  it('REQ-JUR-065 : TÉMOIN — une valeur sur un autre droit est refusée ; une rectification porte sa valeur OU sa date d’effacement', async () => {
    const LIEE = 'demandes_droits_contact_valeur_purge_liee';
    expect(await refus(demande({ droit: 'effacement', valeur: randomBytes(40) }))).toContain(LIEE);
    expect(await refus(demande({ droit: 'rectification', valeurPurgeeAt: new Date() }))).toContain(
      LIEE
    );
    expect(await refus(demande({ droit: 'rectification', valeur: null }))).toContain(LIEE);
    await expect(demande({ droit: 'rectification' })).resolves.toBeTruthy();
    await expect(demande({ droit: 'opposition' })).resolves.toBeTruthy();
  });

  it('REQ-JUR-065 : TÉMOIN — recue_at est l’heure de la BASE : une date fournie par l’appelant est écrasée', async () => {
    const id = randomUUID();
    const avant = Date.now();
    await maj(
      `INSERT INTO demandes_droits_contact (id, attribution_id, droit, recue_at)
       VALUES ($1::uuid, $2::uuid, 'acces'::droit_contact, '2020-01-01T00:00:00Z')`,
      id,
      await uneAttribution()
    );
    const l = await ligne(id);
    expect(l.recue_at.getTime()).toBeGreaterThanOrEqual(avant - 60_000);
  });

  it('REQ-JUR-065 : TÉMOIN — traitee_at sans issue est refusé, et un second traitement aussi', async () => {
    const id = await demande({ droit: 'acces' });
    expect(
      await refus(
        maj(`UPDATE demandes_droits_contact SET traitee_at = now() WHERE id = $1::uuid`, id)
      )
    ).toContain('demandes_droits_contact_traitement');
    await expect(
      maj(
        `UPDATE demandes_droits_contact SET traitee_at = now(), issue = 'appliquee' WHERE id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET traitee_at = now() + interval '1 hour' WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        maj(`UPDATE demandes_droits_contact SET issue = 'refusee' WHERE id = $1::uuid`, id)
      )
    ).toContain(GABARIT);
  });
});

describe('REQ-JUR-065 — la trace ne change pas après l’insertion', () => {
  it('REQ-JUR-065 : TÉMOIN — le droit et l’attribution d’une demande ne changent pas', async () => {
    const id = await demande({ droit: 'acces' });
    expect(
      await refus(
        maj(`UPDATE demandes_droits_contact SET droit = 'opposition' WHERE id = $1::uuid`, id)
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET attribution_id = $2::uuid WHERE id = $1::uuid`,
          id,
          await uneAttribution()
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-JUR-065 : TÉMOIN — la valeur s’efface avec sa date, et ne revient pas', async () => {
    const id = await demande({ droit: 'rectification' });
    await expect(
      maj(
        `UPDATE demandes_droits_contact SET valeur_chiffree = NULL, valeur_purgee_at = now()
         WHERE id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET valeur_chiffree = $2, valeur_purgee_at = NULL
           WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-JUR-065 : TÉMOIN — une seconde prolongation est refusée par le déclencheur', async () => {
    const id = await demande({ droit: 'acces' });
    await expect(
      maj(`UPDATE demandes_droits_contact SET prolongee_at = now() WHERE id = $1::uuid`, id)
    ).resolves.toBe(1);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET prolongee_at = now() + interval '1 day' WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-JUR-065 : TÉMOIN — une prolongation après le traitement est refusée par son CHECK', async () => {
    const id = await demande({ droit: 'acces' });
    await maj(
      `UPDATE demandes_droits_contact SET traitee_at = now(), issue = 'appliquee' WHERE id = $1::uuid`,
      id
    );
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET prolongee_at = now() + interval '1 day' WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('demandes_droits_contact_prolongation_avant_traitement');
  });

  it('REQ-JUR-065 : TÉMOIN — DELETE et TRUNCATE sont refusés', async () => {
    const id = await demande({ droit: 'acces' });
    expect(
      await refus(maj(`DELETE FROM demandes_droits_contact WHERE id = $1::uuid`, id))
    ).toContain(GABARIT);
    expect(await refus(maj(`TRUNCATE demandes_droits_contact`))).toContain(GABARIT);
  });
});

describe('REQ-JUR-065 — la valeur non traitée s’efface à l’échéance, et pas avant', () => {
  const RECUE = new Date('2026-06-15T10:00:00.000Z');

  it('REQ-JUR-065 : TÉMOIN — sans prolongation, effacée à un mois, pas la veille', async () => {
    const id = await demande({ droit: 'rectification' });
    await reculer(id, RECUE);
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-07-15T09:59:59.999Z'));
    expect((await ligne(id)).valeur_chiffree).not.toBeNull();
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-07-15T10:00:00.000Z'));
    const l = await ligne(id);
    expect(l.valeur_chiffree).toBeNull();
    expect(l.valeur_purgee_at).toEqual(new Date('2026-07-15T10:00:00.000Z'));
  });

  it('REQ-JUR-065 : TÉMOIN — avec prolongation, effacée à trois mois, et pas à un', async () => {
    const id = await demande({ droit: 'rectification' });
    await reculer(id, RECUE);
    await maj(
      `UPDATE demandes_droits_contact SET prolongee_at = $2 WHERE id = $1::uuid`,
      id,
      new Date('2026-06-20T10:00:00.000Z')
    );
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-07-15T10:00:00.000Z'));
    expect((await ligne(id)).valeur_chiffree).not.toBeNull();
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-09-15T09:59:59.999Z'));
    expect((await ligne(id)).valeur_chiffree).not.toBeNull();
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-09-15T10:00:00.000Z'));
    expect((await ligne(id)).valeur_chiffree).toBeNull();
  });

  it('REQ-JUR-065 : TÉMOIN — un second passage ne réécrit pas la date d’effacement', async () => {
    const id = await demande({ droit: 'rectification' });
    await reculer(id, RECUE);
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-08-01T00:00:00.000Z'));
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-09-01T00:00:00.000Z'));
    expect((await ligne(id)).valeur_purgee_at).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('REQ-JUR-065 : TÉMOIN — aucun événement du journal ne porte la valeur', async () => {
    const valeur = randomBytes(40);
    const id = await demande({ droit: 'rectification', valeur });
    await reculer(id, RECUE);
    await purgerLesValeursDesDroits(base.prisma, new Date('2026-08-01T00:00:00.000Z'));
    const [{ n }] = await base.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM evenements
      WHERE charge::text LIKE ${'%' + valeur.toString('hex') + '%'}
         OR charge::text LIKE ${'%' + valeur.toString('base64') + '%'}`;
    expect(Number(n)).toBe(0);
  });
});

describe('REQ-JUR-065 — le jeton des droits de l’attribution', () => {
  it('REQ-JUR-065 : TÉMOIN — une empreinte hors forme est refusée', async () => {
    expect(await refus(uneAttribution({ jeton: 'Z'.repeat(64) }))).toContain(
      'attributions_jeton_droits_hex'
    );
  });

  it('REQ-JUR-065 : TÉMOIN — deux attributions au même jeton sont refusées par l’index', async () => {
    const jeton = hex(32);
    await uneAttribution({ jeton });
    expect(await refus(uneAttribution({ jeton }))).toContain('23505');
  });

  it('REQ-JUR-065 : TÉMOIN — une attribution purgée qui garde son jeton est refusée', async () => {
    const id = await uneAttribution();
    expect(
      await refus(maj(`UPDATE attributions SET contact_purge_at = now() WHERE id = $1::uuid`, id))
    ).toContain('attributions_jeton_droits_purge');
  });

  it('REQ-JUR-065 : TÉMOIN — la purge du contact (DM-48) efface le jeton dans la même instruction', async () => {
    const id = await uneAttribution({ purgeContactAt: new Date('2026-01-01T00:00:00.000Z') });
    await purgerLesContacts(base.prisma, new Date('2026-10-02T12:00:00.000Z'));
    const [l] = await base.prisma.$queryRaw<{ jeton: string | null; purge: Date | null }[]>`
      SELECT jeton_droits_hash AS jeton, contact_purge_at AS purge FROM attributions
      WHERE id = ${id}::uuid`;
    expect(l!.jeton).toBeNull();
    expect(l!.purge).not.toBeNull();
  });
});
