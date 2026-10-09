// @req REQ-JUR-065
/**
 * DM-60 (REQ-JUR-065, partners/ADR-0031) — la trace d'une demande de droit du contact s'anonymise
 * CINQ ANS après sa clôture, contre la base RÉELLE.
 *
 * CE QUE LA TÂCHE ET LA BASE TIENNENT :
 *   — sous l'échéance, rien ; pile et au-delà, le lien à l'attribution est vidé et
 *     `trace_anonymisee_at` est posée, en une instruction ; la ligne RESTE (droit, donnée visée,
 *     issue, dates), sans lien à une personne ;
 *   — l'échéance court de la clôture (`traitee_at`) ; une demande jamais close s'anonymise cinq ans
 *     après sa RÉCEPTION (la minimisation l'emporte) ;
 *   — un second passage ne change rien, et un passage ultérieur ne réécrit pas ce qui est fait ;
 *   — la base : la date sans le lien vidé, ou le lien vidé sans la date, refusés par le CHECK
 *     `demandes_droits_contact_trace_anonymisee_liee` ; une demande qui porte encore sa valeur ne
 *     s'anonymise pas (`demandes_droits_contact_anonymisee_sans_valeur`) ; le lien ne revient pas, la
 *     date ne se réécrit pas, toute autre modification et DELETE restent refusés par le gabarit, et
 *     la troncature aussi.
 *
 * DM-68 (REQ-JUR-065, partners/ADR-0032) — à l'anonymisation, dans la même instruction, les dates de
 * la trace (réception, traitement, prolongation, effacement de la valeur) sont ramenées au premier
 * jour de LEUR mois, à minuit UTC, et `trace_anonymisee_at` au premier du mois UTC de l'instant
 * d'anonymisation. Hors de cette écriture, aucune troncature ; une date tronquée ne se réécrit pas ;
 * un début de mois qui n'est pas celui de la date d'origine est refusé.
 *
 * Joué par Gate D, sur la base fraîchement migrée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  anonymiserLesTracesDesDroits,
  limiteDAnonymisation,
} from '../../src/server/taches/anonymiser-traces-droits-contact';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 630000000;
const unSiren = () => String((sirens += 1));
const GABARIT = 'refuser_modification_sauf';
const MAINTENANT = new Date('2031-10-03T12:00:00.000Z');
const MINUTE = 60_000;

/**
 * Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. La tâche et
 * les écritures jugées passent par lui ; les fixtures, les lectures et le recul d'horloge (un
 * ALTER TABLE d'administrateur) restent sous le propriétaire, seul rôle qui pourrait tronquer.
 */
beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  const CREATION = new Date('2026-10-03T12:00:00.000Z');
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: CREATION,
        importeeAt: CREATION,
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
        creeAt: CREATION,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une attribution libérée au contact complet (blocs factices), par SQL brut. */
async function uneAttribution(): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'perdue'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
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
    bloc()
  );
  return id;
}

/**
 * Une demande reçue à `recueAt`, close à `traiteeAt` si elle est donnée. Une rectification porte sa
 * valeur effacée (`valeur_purgee_at`) sauf si `valeur` est demandée : le témoin de la valeur la garde.
 */
async function uneDemande(d: {
  recueAt: Date;
  traiteeAt?: Date | null;
  prolongeeAt?: Date | null;
  droit?: 'acces' | 'rectification';
  valeur?: boolean;
}): Promise<string> {
  const id = randomUUID();
  const rectification = d.droit === 'rectification';
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO demandes_droits_contact (id, attribution_id, droit, donnee_visee, valeur_chiffree,
       valeur_purgee_at)
     VALUES ($1::uuid, $2::uuid, $3::droit_contact, $4::donnee_contact, $5, $6)`,
    id,
    await uneAttribution(),
    d.droit ?? 'acces',
    rectification ? 'telephone' : null,
    rectification && d.valeur === true ? randomBytes(40) : null,
    rectification && d.valeur !== true ? d.recueAt : null
  );
  // L'horloge de réception est celle de la base : le recul passe par l'administrateur des tests,
  // le déclencheur d'ajout seul suspendu le temps de l'écriture.
  await base.prisma.$transaction([
    base.prisma.$executeRawUnsafe(
      `ALTER TABLE demandes_droits_contact DISABLE TRIGGER demandes_droits_contact_ajout_seul`
    ),
    base.prisma.$executeRawUnsafe(
      `UPDATE demandes_droits_contact SET recue_at = $2, traitee_at = $3,
         issue = CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE 'appliquee'::issue_demande_droit END,
         prolongee_at = $4
       WHERE id = $1::uuid`,
      id,
      d.recueAt,
      d.traiteeAt ?? null,
      d.prolongeeAt ?? null
    ),
    base.prisma.$executeRawUnsafe(
      `ALTER TABLE demandes_droits_contact ENABLE TRIGGER demandes_droits_contact_ajout_seul`
    ),
  ]);
  return id;
}

type Lu = {
  attribution_id: string | null;
  trace_anonymisee_at: Date | null;
  droit: string;
  donnee_visee: string | null;
  issue: string | null;
  recue_at: Date;
  traitee_at: Date | null;
  prolongee_at: Date | null;
  valeur_purgee_at: Date | null;
};
async function lire(id: string): Promise<Lu> {
  const [l] = await base.prisma.$queryRawUnsafe<Lu[]>(
    `SELECT attribution_id::text, trace_anonymisee_at, droit::text, donnee_visee::text,
       issue::text, recue_at, traitee_at, prolongee_at, valeur_purgee_at
     FROM demandes_droits_contact WHERE id = $1::uuid`,
    id
  );
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

const maj = (sql: string, ...valeurs: unknown[]) => app.$executeRawUnsafe(sql, ...valeurs);
const LIMITE = limiteDAnonymisation(MAINTENANT);
const decale = (minutes: number) => new Date(LIMITE.getTime() + minutes * MINUTE);
/** Le premier du mois UTC, à minuit, d'un instant. */
const debutDeMois = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const auMois = (d: Date | null) => (d === null ? null : debutDeMois(d));
/** Les dates qu'une trace anonymisée garde : chacune au début de son mois UTC. */
const tronquee = (l: Lu): Lu => ({
  ...l,
  recue_at: debutDeMois(l.recue_at),
  traitee_at: auMois(l.traitee_at),
  prolongee_at: auMois(l.prolongee_at),
  valeur_purgee_at: auMois(l.valeur_purgee_at),
});
const ANONYMISEE_LE = debutDeMois(MAINTENANT);
/** Le début de mois UTC d'une colonne, en SQL : la seule valeur que l'anonymisation lui admet. */
const AU_MOIS = (c: string) => `date_trunc('month', ${c} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
/** L'écriture d'anonymisation complète, écrite à la main : les quatre dates à leur mois, et sa date. */
const ANONYMISER = `attribution_id = NULL, trace_anonymisee_at = ${AU_MOIS('clock_timestamp()')},
  recue_at = ${AU_MOIS('recue_at')}, traitee_at = ${AU_MOIS('traitee_at')},
  prolongee_at = ${AU_MOIS('prolongee_at')}, valeur_purgee_at = ${AU_MOIS('valeur_purgee_at')}`;

describe('REQ-JUR-065 — la tâche anonymise la trace à cinq ans', () => {
  it('REQ-JUR-065 : la limite est cinq ans civils avant l’instant du passage, en UTC', () => {
    expect(LIMITE.toISOString()).toBe('2026-10-03T12:00:00.000Z');
  });

  it('REQ-JUR-065 : TÉMOINS — sous l’échéance rien ; pile et au-delà, lien vidé et date posée, la ligne restant', async () => {
    const sous = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(1) });
    const pile = await uneDemande({ recueAt: decale(-60), traiteeAt: LIMITE });
    const audela = await uneDemande({
      recueAt: decale(-90),
      traiteeAt: decale(-30),
      droit: 'rectification',
    });
    const avant = { pile: await lire(pile), audela: await lire(audela) };
    await anonymiserLesTracesDesDroits(app, MAINTENANT);

    const s = await lire(sous);
    expect(s.attribution_id).not.toBeNull();
    expect(s.trace_anonymisee_at).toBeNull();
    for (const [nom, id] of [
      ['pile', pile],
      ['audela', audela],
    ] as const) {
      const l = await lire(id);
      expect([nom, l.attribution_id]).toEqual([nom, null]);
      expect([nom, l.trace_anonymisee_at?.toISOString()]).toEqual([
        nom,
        ANONYMISEE_LE.toISOString(),
      ]);
      // La ligne reste : droit, donnée visée et issue inchangés, dates au début de leur mois.
      expect({ ...l, attribution_id: 'vide', trace_anonymisee_at: null }).toEqual({
        ...tronquee(avant[nom]),
        attribution_id: 'vide',
      });
    }
    expect((await lire(audela)).donnee_visee).toBe('telephone');
  });

  it('REQ-JUR-065 : TÉMOIN — l’échéance court de la CLÔTURE : reçue il y a plus de cinq ans, close il y a moins, rien', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(30) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    expect((await lire(id)).attribution_id).not.toBeNull();
  });

  it('REQ-JUR-065 : TÉMOIN — une demande jamais close s’anonymise cinq ans après sa RÉCEPTION, et pas la veille', async () => {
    const echue = await uneDemande({ recueAt: LIMITE, traiteeAt: null });
    const veille = await uneDemande({ recueAt: decale(1), traiteeAt: null });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    const e = await lire(echue);
    expect(e.attribution_id).toBeNull();
    expect(e.trace_anonymisee_at?.toISOString()).toBe(ANONYMISEE_LE.toISOString());
    expect(e.traitee_at).toBeNull();
    expect((await lire(veille)).attribution_id).not.toBeNull();
  });

  it('REQ-JUR-065 : un second passage, au même instant, ne change rien', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    const apres = await lire(id);
    expect(await anonymiserLesTracesDesDroits(app, MAINTENANT)).toEqual({ anonymisees: 0 });
    expect(await lire(id)).toEqual(apres);
  });

  it('REQ-JUR-065 : TÉMOIN — un passage ULTÉRIEUR anonymise les nouvelles échues sans réécrire la date des anciennes', async () => {
    const a = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    const b = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(5) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    const aApres = await lire(a);
    expect((await lire(b)).attribution_id).not.toBeNull();
    const plusTard = new Date(MAINTENANT.getTime() + 10 * MINUTE);
    // Le compte n'est pas jugé : la base est partagée par les témoins de ce fichier, et d'autres
    // lignes échoient dans ces dix minutes. Ce qui est jugé, c'est A intacte et B anonymisée.
    expect((await anonymiserLesTracesDesDroits(app, plusTard)).anonymisees).toBeGreaterThan(0);
    expect(await lire(a)).toEqual(aApres);
    expect((await lire(b)).trace_anonymisee_at?.toISOString()).toBe(
      debutDeMois(plusTard).toISOString()
    );
  });

  it('REQ-JUR-065 : TÉMOIN — une demande qui porte encore sa valeur n’est pas anonymisée par la tâche, et ne bloque pas les autres', async () => {
    const avecValeur = await uneDemande({
      recueAt: decale(-60),
      traiteeAt: null,
      droit: 'rectification',
      valeur: true,
    });
    const voisine = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    expect((await lire(avecValeur)).attribution_id).not.toBeNull();
    expect((await lire(voisine)).attribution_id).toBeNull();
  });
});

describe('REQ-JUR-065 — la base tient l’anonymisation', () => {
  it('REQ-JUR-065 : TÉMOIN — la date posée sans vider le lien, ou le lien vidé sans la date, refusés sur le CHECK', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET ${ANONYMISER.replace('attribution_id = NULL, ', '')}
           WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('demandes_droits_contact_trace_anonymisee_liee');
    expect(
      await refus(
        maj(`UPDATE demandes_droits_contact SET attribution_id = NULL WHERE id = $1::uuid`, id)
      )
    ).toContain('demandes_droits_contact_trace_anonymisee_liee');
    // Face 2 : les deux ensemble passent.
    await expect(
      maj(`UPDATE demandes_droits_contact SET ${ANONYMISER} WHERE id = $1::uuid`, id)
    ).resolves.toBe(1);
  });

  it('REQ-JUR-065 : TÉMOIN — l’anonymisation d’une demande qui porte encore une valeur est refusée', async () => {
    const id = await uneDemande({
      recueAt: decale(-60),
      traiteeAt: null,
      droit: 'rectification',
      valeur: true,
    });
    expect(
      await refus(maj(`UPDATE demandes_droits_contact SET ${ANONYMISER} WHERE id = $1::uuid`, id))
    ).toContain('demandes_droits_contact_anonymisee_sans_valeur');
  });

  it('REQ-JUR-065 : TÉMOIN — le lien ne revient pas, et la date ne se réécrit pas', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET attribution_id = $2::uuid, trace_anonymisee_at = NULL
           WHERE id = $1::uuid`,
          id,
          await uneAttribution()
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET trace_anonymisee_at = clock_timestamp()
           WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-JUR-065 : TÉMOIN — toute autre modification et DELETE restent refusés, la troncature aussi', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    expect(
      await refus(
        maj(`UPDATE demandes_droits_contact SET droit = 'opposition' WHERE id = $1::uuid`, id)
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET recue_at = clock_timestamp() WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(maj(`DELETE FROM demandes_droits_contact WHERE id = $1::uuid`, id))
    ).toContain(GABARIT);
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE demandes_droits_contact`))
    ).toContain(GABARIT);
  });

  it('REQ-JUR-065 : TÉMOIN — les deux déclencheurs exécutent la fonction dédiée, remplacés et non doublés', async () => {
    const lignes = await base.prisma.$queryRaw<{ nom: string; fonction: string; args: string }[]>`
      SELECT t.tgname AS nom, p.proname AS fonction, encode(t.tgargs, 'escape') AS args
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE c.relname = 'demandes_droits_contact' AND NOT t.tgisinternal
        AND t.tgname IN ('demandes_droits_contact_ajout_seul', 'demandes_droits_contact_troncature')
      ORDER BY t.tgname`;
    expect(lignes).toEqual([
      {
        nom: 'demandes_droits_contact_ajout_seul',
        fonction: 'refuser_modification_sauf_droits_contact',
        args: '',
      },
      {
        nom: 'demandes_droits_contact_troncature',
        fonction: 'refuser_modification_sauf_droits_contact',
        args: '',
      },
    ]);
  });
});

describe('REQ-JUR-065 — DM-68 : la trace anonymisée ne garde de ses dates que le mois', () => {
  const estDebutDeMois = (d: Date | null) => d === null || d.getTime() === debutDeMois(d).getTime();

  it('REQ-JUR-065 : TÉMOIN — après l’anonymisation, les cinq dates sont des débuts de mois UTC, et les deux CHECK tiennent', async () => {
    const id = await uneDemande({
      recueAt: new Date('2026-08-14T09:17:23.456Z'),
      prolongeeAt: new Date('2026-09-02T16:40:00.000Z'),
      traiteeAt: new Date('2026-09-29T08:05:00.000Z'),
      droit: 'rectification',
    });
    const avant = await lire(id);
    expect(avant.valeur_purgee_at).not.toBeNull();
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    const l = await lire(id);
    expect(l.attribution_id).toBeNull();
    expect(l).toEqual({
      ...tronquee(avant),
      attribution_id: null,
      trace_anonymisee_at: ANONYMISEE_LE,
    });
    for (const d of [
      l.recue_at,
      l.traitee_at,
      l.prolongee_at,
      l.valeur_purgee_at,
      l.trace_anonymisee_at,
    ]) {
      expect(d).not.toBeNull();
      expect(estDebutDeMois(d)).toBe(true);
    }
    const [c] = await base.prisma.$queryRawUnsafe<{ ordre: boolean; purge: boolean }[]>(
      `SELECT prolongee_at <= traitee_at AS ordre,
         (valeur_chiffree IS NULL AND valeur_purgee_at IS NOT NULL) AS purge
       FROM demandes_droits_contact WHERE id = $1::uuid`,
      id
    );
    expect(c).toEqual({ ordre: true, purge: true });
  });

  it('REQ-JUR-065 : TÉMOIN — une demande close le dernier jour du mois à 23 h 30 heure de Paris est tronquée selon son mois UTC', async () => {
    // 30 septembre, 23 h 30 à Paris (UTC+2) : 21 h 30 UTC, toujours septembre.
    const septembre = await uneDemande({
      recueAt: new Date('2026-09-20T10:00:00.000Z'),
      traiteeAt: new Date('2026-09-30T21:30:00.000Z'),
    });
    // 1er septembre, 0 h 30 à Paris : encore le 31 août à 22 h 30 UTC — c'est AOÛT, le mois UTC.
    const aout = await uneDemande({
      recueAt: new Date('2026-08-20T10:00:00.000Z'),
      traiteeAt: new Date('2026-08-31T22:30:00.000Z'),
    });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    expect((await lire(septembre)).traitee_at?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect((await lire(aout)).traitee_at?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('REQ-JUR-065 : TÉMOIN — une anonymisation écrite sans troncature est tronquée par la base, dans la même instruction', async () => {
    const id = await uneDemande({
      recueAt: new Date('2026-06-11T07:42:10.123Z'),
      prolongeeAt: new Date('2026-07-01T00:00:00.001Z'),
      traiteeAt: new Date('2026-07-31T23:59:59.999Z'),
      droit: 'rectification',
    });
    const avant = await lire(id);
    expect(avant.valeur_purgee_at).not.toBeNull();
    // Un autre chemin que la tâche, une console ou un correctif manuel : il ne tronque rien.
    await expect(
      maj(
        `UPDATE demandes_droits_contact SET attribution_id = NULL, trace_anonymisee_at = $2
         WHERE id = $1::uuid`,
        id,
        new Date('2031-10-17T15:04:05.678Z')
      )
    ).resolves.toBe(1);
    expect(await lire(id)).toEqual({
      ...tronquee(avant),
      attribution_id: null,
      trace_anonymisee_at: new Date('2031-10-01T00:00:00.000Z'),
    });
  });

  it('REQ-JUR-065 : TÉMOIN — à l’anonymisation, une date NULL reste NULL', async () => {
    // Jamais close, jamais prolongée, sans valeur : seule la réception a une date.
    const jamaisClose = () =>
      uneDemande({
        recueAt: new Date('2026-07-15T12:00:00.000Z'),
        traiteeAt: null,
        prolongeeAt: null,
      });
    const id = await jamaisClose();
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    const l = await lire(id);
    expect(l.recue_at.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect([l.traitee_at, l.prolongee_at, l.valeur_purgee_at]).toEqual([null, null, null]);
    // Une valeur posée sur une date NULL dans l'écriture d'anonymisation est refusée, même un
    // début de mois : la troncature n'invente aucune date.
    const autre = await jamaisClose();
    expect(
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET ${ANONYMISER.replace(
            `prolongee_at = ${AU_MOIS('prolongee_at')}`,
            `prolongee_at = ${AU_MOIS('recue_at')}`
          )} WHERE id = $1::uuid`,
          autre
        )
      )
    ).toContain(GABARIT);
    expect((await lire(autre)).attribution_id).not.toBeNull();
  });

  it('REQ-JUR-065 : TÉMOIN — une troncature hors de l’écriture d’anonymisation est refusée', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    for (const c of ['recue_at', 'traitee_at']) {
      expect(
        await refus(
          maj(`UPDATE demandes_droits_contact SET ${c} = ${AU_MOIS(c)} WHERE id = $1::uuid`, id)
        ),
        c
      ).toContain(GABARIT);
    }
    expect((await lire(id)).attribution_id).not.toBeNull();
  });

  it('REQ-JUR-065 : TÉMOIN — une date tronquée ne se réécrit pas', async () => {
    const id = await uneDemande({ recueAt: decale(-60), traiteeAt: decale(-10) });
    await anonymiserLesTracesDesDroits(app, MAINTENANT);
    for (const [c, valeur] of [
      ['recue_at', `recue_at + interval '1 day'`],
      ['traitee_at', `traitee_at - interval '1 month'`],
      ['trace_anonymisee_at', `trace_anonymisee_at + interval '1 month'`],
    ] as const) {
      expect(
        await refus(
          maj(`UPDATE demandes_droits_contact SET ${c} = ${valeur} WHERE id = $1::uuid`, id)
        ),
        c
      ).toContain(GABARIT);
    }
  });

  it('REQ-JUR-065 : TÉMOIN — une valeur qui n’est pas un début de mois UTC est refusée, et le début d’un autre mois aussi', async () => {
    for (const [nom, valeur] of [
      ['une heure après le début du mois', `${AU_MOIS('recue_at')} + interval '1 hour'`],
      ['le début du mois précédent', `${AU_MOIS('recue_at')} - interval '1 month'`],
      ['le début du mois suivant', `${AU_MOIS('recue_at')} + interval '1 month'`],
      [
        'minuit du mois à Paris',
        `date_trunc('month', recue_at AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`,
      ],
    ] as const) {
      const id = await uneDemande({
        recueAt: new Date('2026-07-15T12:00:00.000Z'),
        traiteeAt: decale(-10),
      });
      expect(
        await refus(
          maj(
            `UPDATE demandes_droits_contact SET ${ANONYMISER.replace(
              `recue_at = ${AU_MOIS('recue_at')}`,
              `recue_at = ${valeur}`
            )} WHERE id = $1::uuid`,
            id
          )
        ),
        nom
      ).toContain(GABARIT);
      expect((await lire(id)).attribution_id, nom).not.toBeNull();
    }
  });
});
