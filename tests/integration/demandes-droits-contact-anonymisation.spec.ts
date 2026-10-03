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
         issue = CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE 'appliquee'::issue_demande_droit END
       WHERE id = $1::uuid`,
      id,
      d.recueAt,
      d.traiteeAt ?? null
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
  valeur_purgee_at: Date | null;
};
async function lire(id: string): Promise<Lu> {
  const [l] = await base.prisma.$queryRawUnsafe<Lu[]>(
    `SELECT attribution_id::text, trace_anonymisee_at, droit::text, donnee_visee::text,
       issue::text, recue_at, traitee_at, valeur_purgee_at
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
      expect([nom, l.trace_anonymisee_at?.toISOString()]).toEqual([nom, MAINTENANT.toISOString()]);
      // La ligne reste : droit, donnée visée, issue et dates, inchangés.
      const { attribution_id: _a, trace_anonymisee_at: _t, ...trace } = l;
      const { attribution_id: _b, trace_anonymisee_at: _u, ...attendu } = avant[nom];
      expect(trace).toEqual(attendu);
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
    expect(e.trace_anonymisee_at?.toISOString()).toBe(MAINTENANT.toISOString());
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
    expect(await anonymiserLesTracesDesDroits(app, plusTard)).toEqual({ anonymisees: 1 });
    expect(await lire(a)).toEqual(aApres);
    expect((await lire(b)).trace_anonymisee_at?.toISOString()).toBe(plusTard.toISOString());
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
          `UPDATE demandes_droits_contact SET trace_anonymisee_at = clock_timestamp() WHERE id = $1::uuid`,
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
      maj(
        `UPDATE demandes_droits_contact SET attribution_id = NULL,
           trace_anonymisee_at = clock_timestamp() WHERE id = $1::uuid`,
        id
      )
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
      await refus(
        maj(
          `UPDATE demandes_droits_contact SET attribution_id = NULL,
             trace_anonymisee_at = clock_timestamp() WHERE id = $1::uuid`,
          id
        )
      )
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

  it('REQ-JUR-065 : TÉMOIN — les deux déclencheurs portent les arguments complets, dans l’ordre, remplacés et non doublés', async () => {
    const lignes = await base.prisma.$queryRaw<{ nom: string; args: string }[]>`
      SELECT t.tgname AS nom, encode(t.tgargs, 'escape') AS args FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'demandes_droits_contact' AND NOT t.tgisinternal
        AND t.tgname IN ('demandes_droits_contact_ajout_seul', 'demandes_droits_contact_troncature')
      ORDER BY t.tgname`;
    const attendus = [
      'une_fois:traitee_at',
      'une_fois:issue',
      'purge:valeur_chiffree',
      'une_fois:valeur_purgee_at',
      'une_fois:prolongee_at',
      'purge:attribution_id',
      'une_fois:trace_anonymisee_at',
    ];
    expect(lignes.map((l) => l.nom)).toEqual([
      'demandes_droits_contact_ajout_seul',
      'demandes_droits_contact_troncature',
    ]);
    for (const l of lignes) {
      expect(l.args.split('\\000').filter((a) => a !== '')).toEqual(attendus);
    }
  });
});
