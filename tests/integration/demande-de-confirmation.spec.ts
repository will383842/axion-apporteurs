// @req REQ-DM-060
// @req REQ-DM-008
// @req REQ-DM-031
// @req REQ-DM-005
/**
 * DM-40 (REQ-DM-060) — la demande de confirmation par e-mail, contre la base RÉELLE.
 *
 * CE QU'IL PROUVE, chaque refus attendu sur son NOM :
 *   — `creerLaDemande` écrit, sur le client de la transaction, UNE demande `planifiee` et son
 *     événement ; une seconde demande pour la même attribution est refusée par l'index unique ;
 *   — les deux jetons ne sont stockés qu'en EMPREINTE (64 hexadécimaux, ancrés), uniques ; l'empreinte
 *     d'IP du clic a la forme tronquée des autres empreintes ;
 *   — l'annulation de l'apporteur (transition `annulee_par_apporteur`) fait passer la demande à
 *     `annulee` dans la MÊME transaction, les deux événements ensemble ou aucun ;
 *   — la correction du contact est une RÉVISION en ajout seul : l'ancienne valeur conservée,
 *     `deposee_at` inchangée ; la révision ne se réécrit pas ;
 *   — la purge du contact révoque les jetons et purge les révisions.
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { creerLaDemande, corrigerLeContact } from '../../src/server/confirmation/demandes';
import { transitionnerUneAttribution } from '../../src/server/attribution/transitionner';
import { purgerLesContacts } from '../../src/server/taches/purger-contacts';
import { clesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
let grilleId: string;
let apporteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 500000000;
const unSiren = () => String((sirens += 1));
const ACTEUR = { par: 'systeme' } as const;
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-40-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});

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

/** Une attribution `provisoire` d'apporteur, au contact complet (blocs factices), par SQL brut. */
async function uneAttribution(p: { purgeContactAt?: Date | null } = {}): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare, purge_contact_at)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false, $13)`,
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
    p.purgeContactAt ?? null
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

const jetons = () => ({ jetonOuiHash: hex(32), jetonNonHash: hex(32) });

async function demandeDe(attributionId: string) {
  return base.prisma.demandeConfirmation.findUniqueOrThrow({ where: { attributionId } });
}

async function evenements(agregatId: string) {
  return base.prisma.evenement.findMany({
    where: { agregatId },
    orderBy: { id: 'asc' },
    select: { type: true, charge: true },
  });
}

describe('REQ-DM-060 — une demande par dépôt, planifiée, et son événement', () => {
  it('REQ-DM-060 : TÉMOIN — creerLaDemande écrit UNE demande `planifiee` et son événement, dans la transaction', async () => {
    const a = await uneAttribution();
    const j = jetons();
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...j, acteur: ACTEUR })
    );
    const d = await demandeDe(a);
    expect(d.id).toBe(id);
    expect(d.etat).toBe('planifiee');
    expect([d.jetonOuiHash, d.jetonNonHash]).toEqual([j.jetonOuiHash, j.jetonNonHash]);
    expect(await evenements(id)).toEqual([
      {
        type: 'demande_confirmation_etat_modifie',
        charge: expect.objectContaining({ de: null, vers: 'planifiee' }),
      },
    ]);
  });

  it('REQ-DM-060 : TÉMOIN — une seconde demande pour la même attribution est refusée par l’index unique', async () => {
    const a = await uneAttribution();
    await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
        )
      )
    ).toMatch(/23505|Unique constraint/);
  });
});

describe('REQ-DM-060 — les jetons n’existent qu’en empreinte', () => {
  it('REQ-DM-060 : TÉMOIN — une empreinte hors forme est refusée, et deux demandes au même jeton aussi', async () => {
    expect(
      await refus(
        base.prisma.$transaction(async (tx) =>
          creerLaDemande(tx, {
            attributionId: await uneAttribution(),
            jetonOuiHash: 'Z'.repeat(64),
            jetonNonHash: hex(32),
            acteur: ACTEUR,
          })
        )
      )
    ).toContain('demandes_confirmation_jeton_oui_hex');
    const commun = hex(32);
    await base.prisma.$transaction(async (tx) =>
      creerLaDemande(tx, {
        attributionId: await uneAttribution(),
        jetonOuiHash: commun,
        jetonNonHash: hex(32),
        acteur: ACTEUR,
      })
    );
    expect(
      await refus(
        base.prisma.$transaction(async (tx) =>
          creerLaDemande(tx, {
            attributionId: await uneAttribution(),
            jetonOuiHash: commun,
            jetonNonHash: hex(32),
            acteur: ACTEUR,
          })
        )
      )
    ).toMatch(/23505|Unique constraint/);
  });

  it('REQ-SEC-024 : TÉMOIN — l’empreinte d’IP du clic n’a que la forme tronquée (16 hexadécimaux)', async () => {
    const a = await uneAttribution();
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE demandes_confirmation SET clic_ip_hash = $2 WHERE id = $1::uuid`,
          id,
          '203.0.113.7'
        )
      )
    ).toContain('demandes_confirmation_clic_ip_hash_hex');
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE demandes_confirmation SET clic_ip_hash = $2 WHERE id = $1::uuid`,
        id,
        hex(8)
      )
    ).resolves.toBe(1);
  });
});

describe('REQ-DM-008 — l’annulation de l’apporteur, ensemble ou rien', () => {
  it('REQ-DM-008 : TÉMOIN — annulee_par_apporteur fait passer la demande à `annulee` dans la MÊME transaction, avec les deux événements', async () => {
    const a = await uneAttribution();
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    await base.prisma.$transaction((tx) =>
      transitionnerUneAttribution(tx, {
        attributionId: a,
        transition: 'annulee_par_apporteur',
        acteur: ACTEUR,
        maintenant: new Date(),
      })
    );
    expect((await demandeDe(a)).etat).toBe('annulee');
    expect((await evenements(id)).map((e) => (e.charge as { vers: string }).vers)).toEqual([
      'planifiee',
      'annulee',
    ]);
    expect(
      (await evenements(a)).map((e) => (e.charge as { transition?: string }).transition)
    ).toContain('annulee_par_apporteur');
  });

  it('REQ-DM-008 : TÉMOIN — une demande déjà envoyée ne s’annule pas : l’attribution reste `provisoire`, aucun événement', async () => {
    const a = await uneAttribution();
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    await base.prisma.$executeRawUnsafe(
      `UPDATE demandes_confirmation SET etat = 'envoyee' WHERE id = $1::uuid`,
      id
    );
    const avant = (await evenements(a)).length;
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          transitionnerUneAttribution(tx, {
            attributionId: a,
            transition: 'annulee_par_apporteur',
            acteur: ACTEUR,
            maintenant: new Date(),
          })
        )
      )
    ).toContain('demande_non_annulable');
    const [l] = await base.prisma.$queryRaw<{ statut: string }[]>`
      SELECT statut::text AS statut FROM attributions WHERE id = ${a}::uuid`;
    expect(l!.statut).toBe('provisoire');
    expect((await evenements(a)).length).toBe(avant);
  });
});

describe('REQ-DM-005 — la correction est une révision tracée, deposee_at inchangée', () => {
  it('REQ-DM-005 : TÉMOIN — corriger le contact garde l’ancienne valeur dans une révision, et ne touche pas deposee_at', async () => {
    const a = await uneAttribution();
    await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    const [avant] = await base.prisma.$queryRaw<
      { deposee_at: Date; email_chiffre: Buffer }[]
    >`SELECT deposee_at, email_chiffre FROM attributions WHERE id = ${a}::uuid`;
    await base.prisma.$transaction((tx) =>
      corrigerLeContact(tx, {
        attributionId: a,
        clairs: { email: 'nouvelle-adresse@exemple.invalid' },
        cles: CLES,
        maintenant: new Date(avant!.deposee_at.getTime() + 60_000),
      })
    );
    const [apres] = await base.prisma.$queryRaw<
      { deposee_at: Date; email_chiffre: Buffer }[]
    >`SELECT deposee_at, email_chiffre FROM attributions WHERE id = ${a}::uuid`;
    expect(apres!.deposee_at).toEqual(avant!.deposee_at);
    expect(Buffer.compare(apres!.email_chiffre, avant!.email_chiffre)).not.toBe(0);
    const revisions = await base.prisma.$queryRaw<{ email_chiffre: Buffer }[]>`
      SELECT r.email_chiffre FROM revisions_demande_confirmation r
      JOIN demandes_confirmation d ON d.id = r.demande_id WHERE d.attribution_id = ${a}::uuid`;
    expect(revisions).toHaveLength(1);
    expect(Buffer.compare(revisions[0]!.email_chiffre, avant!.email_chiffre)).toBe(0);
  });

  it('REQ-DM-005 : TÉMOIN — passé le délai avant envoi, la correction libre est refusée', async () => {
    const a = await uneAttribution();
    await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    const [l] = await base.prisma.$queryRaw<{ deposee_at: Date }[]>`
      SELECT deposee_at FROM attributions WHERE id = ${a}::uuid`;
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          corrigerLeContact(tx, {
            attributionId: a,
            clairs: { email: 'trop-tard@exemple.invalid' },
            cles: CLES,
            maintenant: new Date(l!.deposee_at.getTime() + 15 * 60_000),
          })
        )
      )
    ).toContain('correction_hors_delai');
  });

  it('REQ-DM-005 : TÉMOIN — une révision ne se réécrit pas, ne se supprime pas, la table ne se vide pas', async () => {
    const a = await uneAttribution();
    await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    const [l] = await base.prisma.$queryRaw<{ deposee_at: Date }[]>`
      SELECT deposee_at FROM attributions WHERE id = ${a}::uuid`;
    await base.prisma.$transaction((tx) =>
      corrigerLeContact(tx, {
        attributionId: a,
        clairs: { contexte: 'un contexte corrigé' },
        cles: CLES,
        maintenant: new Date(l!.deposee_at.getTime() + 60_000),
      })
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE revisions_demande_confirmation SET contexte_chiffre = $1`,
          randomBytes(40)
        )
      )
    ).toContain('refuser_modification_sauf');
    expect(
      await refus(base.prisma.$executeRawUnsafe(`DELETE FROM revisions_demande_confirmation`))
    ).toContain('refuser_modification_sauf');
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE revisions_demande_confirmation`))
    ).toContain('refuser_modification_sauf');
  });
});

describe('REQ-DM-031 — la purge du contact révoque les jetons et purge les révisions', () => {
  it('REQ-DM-031 : TÉMOIN — après la purge, plus de jeton, plus de bloc dans les révisions', async () => {
    const a = await uneAttribution({ purgeContactAt: new Date('2026-01-01T00:00:00.000Z') });
    await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO revisions_demande_confirmation (id, demande_id, email_chiffre, email_hash)
       SELECT gen_random_uuid(), d.id, $2, $3 FROM demandes_confirmation d
       WHERE d.attribution_id = $1::uuid`,
      a,
      randomBytes(40),
      hex(32)
    );
    await purgerLesContacts(base.prisma, new Date('2026-10-02T12:00:00.000Z'));
    const d = await demandeDe(a);
    expect([d.jetonOuiHash, d.jetonNonHash]).toEqual([null, null]);
    expect(d.jetonsRevoquesAt).not.toBeNull();
    const [r] = await base.prisma.$queryRaw<{ email: Buffer | null; purge: Date | null }[]>`
      SELECT r.email_chiffre AS email, r.purgee_at AS purge FROM revisions_demande_confirmation r
      JOIN demandes_confirmation d ON d.id = r.demande_id WHERE d.attribution_id = ${a}::uuid`;
    expect(r!.email).toBeNull();
    expect(r!.purge).not.toBeNull();
  });

  it('REQ-DM-031 : TÉMOIN — des jetons présents avec une date de révocation sont refusés', async () => {
    const a = await uneAttribution();
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE demandes_confirmation SET jetons_revoques_at = now() WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('demandes_confirmation_jetons_revocation_liee');
  });
});
