// @req REQ-DM-060
// @req REQ-DM-008
// @req REQ-DM-031
// @req REQ-DM-005
// @req REQ-SEC-024
// @req REQ-SEC-061
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
import {
  corrigerLeContact,
  creerLaDemande,
  emettreDeNouveau,
  emissionActiveParJeton,
} from '../../src/server/confirmation/demandes';
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

/**
 * Une attribution d'apporteur, `provisoire` par défaut, au contact complet (blocs factices), par
 * SQL brut. La purge ne touche jamais un état occupant : son témoin sème un état libéré.
 */
async function uneAttribution(
  p: { purgeContactAt?: Date | null; statut?: string } = {}
): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare, purge_contact_at)
     VALUES ($1::uuid, $2::uuid, $14::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
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
    p.purgeContactAt ?? null,
    p.statut ?? 'provisoire'
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

/** Le SQLSTATE d'un refus, et son message : chaque témoin juge LES DEUX. */
const DECLENCHEUR = 'P0001';
const CONTRAINTE = '23514';
const UNICITE = '23505';

async function emissionsDe(demandeId: string) {
  return base.prisma.emissionDemandeConfirmation.findMany({
    where: { demandeId },
    orderBy: { emiseAt: 'asc' },
  });
}

async function uneDemande(): Promise<{ a: string; id: string; j: ReturnType<typeof jetons> }> {
  const a = await uneAttribution();
  const j = jetons();
  const id = await base.prisma.$transaction((tx) =>
    creerLaDemande(tx, { attributionId: a, ...j, acteur: ACTEUR })
  );
  return { a, id, j };
}

const maj = (sql: string, ...valeurs: unknown[]) => base.prisma.$executeRawUnsafe(sql, ...valeurs);

describe('REQ-DM-060 — une demande par dépôt, planifiée, et son événement', () => {
  it('REQ-DM-060 : TÉMOIN — creerLaDemande écrit UNE demande `planifiee`, sa PREMIÈRE émission et son événement', async () => {
    const { a, id, j } = await uneDemande();
    const d = await demandeDe(a);
    expect(d.id).toBe(id);
    expect(d.etat).toBe('planifiee');
    const e = await emissionsDe(id);
    expect(e.map((x) => [x.jetonOuiHash, x.jetonNonHash, x.revoqueeAt, x.clicIpHash])).toEqual([
      [j.jetonOuiHash, j.jetonNonHash, null, null],
    ]);
    expect(await evenements(id)).toEqual([
      {
        type: 'demande_confirmation_etat_modifie',
        charge: expect.objectContaining({ de: null, vers: 'planifiee' }),
      },
    ]);
  });

  it('REQ-DM-060 : TÉMOIN — une seconde demande pour la même attribution est refusée par l’index unique', async () => {
    const { a } = await uneDemande();
    const m = await refus(
      base.prisma.$transaction((tx) =>
        creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
      )
    );
    expect(m).toMatch(new RegExp(`${UNICITE}|Unique constraint`));
  });
});

describe('REQ-SEC-061 — les jetons n’existent qu’en empreinte, une seule émission active', () => {
  it('REQ-SEC-061 : TÉMOIN — une empreinte hors forme, et un « Oui » égal au « Non », sont refusés', async () => {
    const hors = await refus(
      base.prisma.$transaction(async (tx) =>
        creerLaDemande(tx, {
          attributionId: await uneAttribution(),
          jetonOuiHash: 'Z'.repeat(64),
          jetonNonHash: hex(32),
          acteur: ACTEUR,
        })
      )
    );
    expect(hors).toContain(CONTRAINTE);
    expect(hors).toContain('emissions_demande_confirmation_jeton_oui_hex');
    const meme = hex(32);
    const egal = await refus(
      base.prisma.$transaction(async (tx) =>
        creerLaDemande(tx, {
          attributionId: await uneAttribution(),
          jetonOuiHash: meme,
          jetonNonHash: meme,
          acteur: ACTEUR,
        })
      )
    );
    expect(egal).toContain(CONTRAINTE);
    expect(egal).toContain('emissions_demande_confirmation_oui_ne_non');
  });

  it('REQ-SEC-061 : TÉMOIN — deux émissions au même jeton sont refusées par l’index unique', async () => {
    const { j } = await uneDemande();
    const m = await refus(
      base.prisma.$transaction(async (tx) =>
        creerLaDemande(tx, {
          attributionId: await uneAttribution(),
          jetonOuiHash: j.jetonOuiHash,
          jetonNonHash: hex(32),
          acteur: ACTEUR,
        })
      )
    );
    expect(m).toMatch(new RegExp(`${UNICITE}|Unique constraint`));
  });

  it('REQ-SEC-061 : TÉMOIN — deux émissions ACTIVES pour une demande sont refusées par la base, pas par le code', async () => {
    const { id } = await uneDemande();
    const m = await refus(
      maj(
        `INSERT INTO emissions_demande_confirmation (id, demande_id, jeton_oui_hash, jeton_non_hash)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3)`,
        id,
        hex(32),
        hex(32)
      )
    );
    expect(m).toContain(UNICITE);
  });

  it('REQ-SEC-061 : TÉMOIN — une émission naît avec ses jetons, sans clic ni révocation', async () => {
    const { id } = await uneDemande();
    await maj(
      `UPDATE emissions_demande_confirmation SET revoquee_at = now() WHERE demande_id = $1::uuid`,
      id
    );
    for (const [colonnes, valeurs] of [
      ['jeton_oui_hash, jeton_non_hash, clic_ip_hash', [hex(32), hex(32), hex(8)]],
      ['jeton_oui_hash, jeton_non_hash, revoquee_at', [hex(32), hex(32), new Date()]],
    ] as const) {
      const m = await refus(
        maj(
          `INSERT INTO emissions_demande_confirmation (id, demande_id, ${colonnes})
           VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4)`,
          id,
          ...valeurs
        )
      );
      expect(m).toContain(DECLENCHEUR);
      expect(m).toContain('emissions_demande_confirmation_naissance');
    }
  });

  it('REQ-SEC-061 : TÉMOIN — une ré-émission révoque la précédente et en crée une neuve, dans la MÊME transaction', async () => {
    const { id, j } = await uneDemande();
    const neufs = jetons();
    await base.prisma.$transaction((tx) =>
      emettreDeNouveau(tx, { demandeId: id, ...neufs, maintenant: new Date() })
    );
    const e = await emissionsDe(id);
    expect(e).toHaveLength(2);
    expect(e[0]!.revoqueeAt).not.toBeNull();
    expect([e[0]!.jetonOuiHash, e[0]!.jetonNonHash]).toEqual([null, null]);
    expect([e[1]!.jetonOuiHash, e[1]!.revoqueeAt]).toEqual([neufs.jetonOuiHash, null]);
    // Un jeton d'une émission révoquée ne résout plus rien ; celui de l'active, si.
    await base.prisma.$transaction(async (tx) => {
      expect(await emissionActiveParJeton(tx, j.jetonOuiHash)).toBeNull();
      expect(await emissionActiveParJeton(tx, neufs.jetonNonHash)).toEqual({
        demandeId: id,
        sens: 'non',
      });
    });
  });
});

describe('REQ-SEC-024 — l’empreinte d’IP du clic : posée une fois, effacée à la révocation', () => {
  const TRACE = 'emissions_demande_confirmation_trace';
  const clic = (id: string, valeur: string | null) =>
    maj(
      `UPDATE emissions_demande_confirmation SET clic_ip_hash = $2 WHERE demande_id = $1::uuid`,
      id,
      valeur
    );

  it('REQ-SEC-024 : TÉMOIN — une adresse en clair est refusée par la forme ; une empreinte tronquée passe', async () => {
    const { id } = await uneDemande();
    const m = await refus(clic(id, '203.0.113.7'));
    expect(m).toContain(CONTRAINTE);
    expect(m).toContain('emissions_demande_confirmation_clic_ip_hash_hex');
    await expect(clic(id, hex(8))).resolves.toBe(1);
  });

  it('REQ-SEC-024 : TÉMOIN — un second clic qui écraserait l’empreinte est refusé', async () => {
    const { id } = await uneDemande();
    await clic(id, hex(8));
    const m = await refus(clic(id, hex(8)));
    expect(m).toContain(DECLENCHEUR);
    expect(m).toContain(TRACE);
  });

  it('REQ-SEC-024 : TÉMOIN — un clic sur une émission révoquée est refusé', async () => {
    const { id } = await uneDemande();
    await maj(
      `UPDATE emissions_demande_confirmation SET revoquee_at = now() WHERE demande_id = $1::uuid`,
      id
    );
    const m = await refus(clic(id, hex(8)));
    expect(m).toContain(DECLENCHEUR);
    expect(m).toContain(TRACE);
  });

  it('REQ-SEC-024 : TÉMOIN — une empreinte vidée sans révocation est refusée', async () => {
    const { id } = await uneDemande();
    await clic(id, hex(8));
    const m = await refus(clic(id, null));
    expect(m).toContain(DECLENCHEUR);
    expect(m).toContain(TRACE);
  });
});

describe('REQ-SEC-061 — l’émission est en ajout seul', () => {
  const TRACE = 'emissions_demande_confirmation_trace';

  it('REQ-SEC-061 : TÉMOIN — un jeton qui change de valeur, ou qui renaît après la révocation, est refusé', async () => {
    const { id } = await uneDemande();
    const autre = await refus(
      maj(
        `UPDATE emissions_demande_confirmation SET jeton_oui_hash = $2 WHERE demande_id = $1::uuid`,
        id,
        hex(32)
      )
    );
    expect(autre).toContain(DECLENCHEUR);
    expect(autre).toContain(TRACE);
    await maj(
      `UPDATE emissions_demande_confirmation SET revoquee_at = now(), jeton_oui_hash = NULL,
         jeton_non_hash = NULL WHERE demande_id = $1::uuid`,
      id
    );
    const renait = await refus(
      maj(
        `UPDATE emissions_demande_confirmation SET jeton_oui_hash = $2, jeton_non_hash = $3
         WHERE demande_id = $1::uuid`,
        id,
        hex(32),
        hex(32)
      )
    );
    expect(renait).toContain(DECLENCHEUR);
    expect(renait).toContain(TRACE);
  });

  it('REQ-SEC-061 : TÉMOIN — vider un jeton sans révoquer est refusé ; la révocation s’écrit une fois', async () => {
    const { id } = await uneDemande();
    const sans = await refus(
      maj(
        `UPDATE emissions_demande_confirmation SET jeton_oui_hash = NULL, jeton_non_hash = NULL
         WHERE demande_id = $1::uuid`,
        id
      )
    );
    expect(sans).toContain(DECLENCHEUR);
    // Révoquer sans vider passe ; vider ensuite passe aussi.
    await expect(
      maj(
        `UPDATE emissions_demande_confirmation SET revoquee_at = now() WHERE demande_id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    await expect(
      maj(
        `UPDATE emissions_demande_confirmation SET jeton_oui_hash = NULL, jeton_non_hash = NULL
         WHERE demande_id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    const reecrite = await refus(
      maj(
        `UPDATE emissions_demande_confirmation SET revoquee_at = now() + interval '1 day'
         WHERE demande_id = $1::uuid`,
        id
      )
    );
    expect(reecrite).toContain(DECLENCHEUR);
    expect(reecrite).toContain(TRACE);
  });

  it('REQ-SEC-061 : TÉMOIN — DELETE et TRUNCATE d’une émission sont refusés', async () => {
    const { id } = await uneDemande();
    const del = await refus(
      maj(`DELETE FROM emissions_demande_confirmation WHERE demande_id = $1::uuid`, id)
    );
    expect(del).toContain(DECLENCHEUR);
    expect(del).toContain(TRACE);
    const tronc = await refus(maj(`TRUNCATE emissions_demande_confirmation`));
    expect(tronc).toContain('emissions_demande_confirmation_troncature');
  });
});

describe('REQ-DM-060 — la demande est une trace : mutable pour son état et ses dates seulement', () => {
  const TRACE = 'demandes_confirmation_trace';

  it('REQ-DM-060 : l’état, la date d’envoi et la date de réponse restent libres', async () => {
    const { id } = await uneDemande();
    await expect(
      maj(
        `UPDATE demandes_confirmation SET etat = 'envoyee', envoyee_at = now(), repondu_at = now()
         WHERE id = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
  });

  it('REQ-DM-060 : TÉMOIN — réécrire l’attribution d’une demande est refusé', async () => {
    const { id } = await uneDemande();
    const m = await refus(
      maj(
        `UPDATE demandes_confirmation SET attribution_id = $2::uuid WHERE id = $1::uuid`,
        id,
        await uneAttribution()
      )
    );
    expect(m).toContain(DECLENCHEUR);
    expect(m).toContain(TRACE);
  });

  it('REQ-DM-060 : TÉMOIN — DELETE et TRUNCATE d’une demande sont refusés', async () => {
    const { id } = await uneDemande();
    const del = await refus(maj(`DELETE FROM demandes_confirmation WHERE id = $1::uuid`, id));
    expect(del).toContain(DECLENCHEUR);
    expect(del).toContain(TRACE);
    expect(await refus(maj(`TRUNCATE demandes_confirmation CASCADE`))).toContain(
      'demandes_confirmation_troncature'
    );
  });

  it('REQ-DM-060 : les déclencheurs des deux tables existent, lus dans pg_trigger', async () => {
    const lignes = await base.prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid IN ('demandes_confirmation'::regclass, 'emissions_demande_confirmation'::regclass)
        AND NOT tgisinternal`;
    expect(lignes.map((l) => l.tgname)).toEqual(
      expect.arrayContaining([
        TRACE,
        'demandes_confirmation_troncature',
        'emissions_demande_confirmation_naissance',
        'emissions_demande_confirmation_trace',
        'emissions_demande_confirmation_troncature',
      ])
    );
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

describe('REQ-DM-031 — la purge du contact révoque TOUTES les émissions, vide l’empreinte du clic, purge les révisions', () => {
  it('REQ-DM-031 : TÉMOIN — après la purge, plus de jeton, plus d’empreinte de clic, plus de bloc dans les révisions', async () => {
    const a = await uneAttribution({
      statut: 'perdue',
      purgeContactAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const id = await base.prisma.$transaction((tx) =>
      creerLaDemande(tx, { attributionId: a, ...jetons(), acteur: ACTEUR })
    );
    // Une émission déjà révoquée, puis l'active, cliquée.
    await base.prisma.$transaction((tx) =>
      emettreDeNouveau(tx, { demandeId: id, ...jetons(), maintenant: new Date() })
    );
    await maj(
      `UPDATE emissions_demande_confirmation SET clic_ip_hash = $2
       WHERE demande_id = $1::uuid AND revoquee_at IS NULL`,
      id,
      hex(8)
    );
    await maj(
      `INSERT INTO revisions_demande_confirmation (id, demande_id, email_chiffre, email_hash)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3)`,
      id,
      randomBytes(40),
      hex(32)
    );
    await purgerLesContacts(base.prisma, new Date('2026-10-02T12:00:00.000Z'));
    // La purge a bien eu lieu : sans elle, ce témoin ne prouverait rien.
    const [p] = await base.prisma.$queryRaw<{ faite: Date | null }[]>`
      SELECT contact_purge_at AS faite FROM attributions WHERE id = ${a}::uuid`;
    expect(p!.faite).not.toBeNull();
    const e = await emissionsDe(id);
    expect(e).toHaveLength(2);
    for (const x of e) {
      expect([x.jetonOuiHash, x.jetonNonHash, x.clicIpHash]).toEqual([null, null, null]);
      expect(x.revoqueeAt).not.toBeNull();
    }
    const [r] = await base.prisma.$queryRaw<{ email: Buffer | null; purge: Date | null }[]>`
      SELECT email_chiffre AS email, purgee_at AS purge FROM revisions_demande_confirmation
      WHERE demande_id = ${id}::uuid`;
    expect(r!.email).toBeNull();
    expect(r!.purge).not.toBeNull();
  });
});
