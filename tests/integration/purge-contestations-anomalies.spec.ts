// @req REQ-DM-033
// @req REQ-DM-043
/**
 * DM-62 — les anomalies, les contestations et le démenti d'un contact sortent à leur échéance, en
 * base RÉELLE : anonymisation, vidage des textes, purge dédiée.
 *
 * Les purges passent sous `partners_app`, provisionné comme en production : c'est sous lui que le
 * lanceur les joue. Les fixtures et les lectures restent sous le propriétaire. Les échéances sont
 * écrites EN CLAIR, date par date, et non recalculées par le code jugé : un témoin qui relirait la
 * durée dans la SSOT ne verrait pas une durée fausse.
 *
 * CE QUE LES TÉMOINS TIENNENT :
 *   — une anomalie LEVÉE est anonymisée deux mois après sa levée (`traite_at`) ; une CONFIRMÉE, cinq
 *     ans après la fin de la mesure (`mesure_terminee_at`, qui vaut `traite_at` pour une mesure sans
 *     durée), jamais tant que cette fin n'est pas posée ; une OUVERTE, jamais ; une GELÉE, jamais
 *     tant que le gel est actif, et dès sa levée si elle vient après l'échéance ;
 *   — après l'anonymisation, aucune colonne ne désigne une personne : seuls restent l'id, le type,
 *     le statut, les mois d'ouverture et de traitement, et la date de l'anonymisation ;
 *   — une contestation est vidée cinq ans après sa réponse, à défaut cinq ans après sa réception,
 *     jamais avant, avec la même règle de gel ; la purge ne pose pas de réponse ;
 *   — le démenti d'un contact (`non_confirme`) est vidé cinq ans après la qualification
 *     (`cree_at`, forme d'A02), ses deux blocs et `contact_purge_at` dans la même écriture, et
 *     rien d'autre n'est réécrit ; aucun autre résultat n'est touché par cette purge ;
 *   — une mesure ouverte depuis plus de `MESURE_OUVERTE_ALERTE_JOURS` est signalée ; le signal
 *     qui sort de la purge ne porte qu'un NOMBRE ;
 *   — chaque purge est inscrite au registre des tâches et au lanceur.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { DUREES_DE_RETENTION } from '../../src/domain/seuils/retention';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';
import { TACHES } from '../../src/server/taches/registre';
import { inscriptions } from '../../src/server/taches/inscriptions';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import {
  anonymiserLesAnomalies,
  mesuresOuvertesAuDela,
  purgerLesContestations,
  purgerLesDementis,
} from '../../src/server/taches/purger-contestations-anomalies';

let base: Base;
let app: PrismaClient;
let apporteurId: string;
let adminId: string;
let attributionId: string;

const CREATION = new Date('2026-10-03T08:00:00.000Z');
const MS = 1;
const LOIN = new Date('2076-01-01T00:00:00.000Z');
const REF_LITIGE = 'TJ-2027/00123';
const hex = (octets: number) => randomBytes(octets).toString('hex');
const d = (iso: string) => new Date(iso);
const avant = (t: Date) => new Date(t.getTime() - MS);

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  const grilleId = (
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
  const [u1] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    CREATION
  );
  adminId = u1!.id;
  attributionId = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, '552100554', 'espace', $3::uuid,
       '2026-10-01', false, false, $4, $5, $6, $7, $8, $9, $10, $11, false)`,
    attributionId,
    apporteurId,
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
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une ligne entière, telle que la base la rend : chaque colonne, par son nom SQL. */
type Ligne = Record<string, unknown>;
async function lire(table: string, id: string): Promise<Ligne> {
  const [l] = await base.prisma.$queryRawUnsafe<{ l: Ligne }[]>(
    `SELECT to_jsonb(t) AS l FROM ${table} t WHERE id = $1::uuid`,
    id
  );
  return l!.l;
}
const instant = (v: unknown) => (v === null ? null : new Date(String(v)).toISOString());
const sans = (l: Ligne, ...cles: string[]) =>
  Object.fromEntries(Object.entries(l).filter(([k]) => !cles.includes(k)));

// ── Les anomalies ────────────────────────────────────────────────────────────────────────────

type Gel = { at: Date; leveAt?: Date };
async function uneAnomalie(p: {
  statut: 'ouverte' | 'levee' | 'confirmee';
  ouverteAt?: Date;
  traiteAt?: Date;
  mesureTermineeAt?: Date;
  gel?: Gel;
  justificationPurgeeAt?: Date;
}): Promise<string> {
  const id = randomUUID();
  const close = p.statut !== 'ouverte';
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO anomalies (id, type, score, apporteur_id, attribution_id, statut, ouverte_at,
       traite_par_id, traite_at, justification_chiffre, justification_purgee_at, mesure_terminee_at,
       gel_litige_at, gel_litige_leve_at, gel_litige_ref)
     VALUES ($1::uuid, 'sincerite', 40, $2::uuid, $3::uuid, $4::statut_anomalie, $5, $6::uuid, $7,
       $8, $9, $10, $11, $12, $13)`,
    id,
    apporteurId,
    attributionId,
    p.statut,
    p.ouverteAt ?? d('2026-03-17T09:41:12.345Z'),
    close ? adminId : null,
    close ? (p.traiteAt ?? d('2026-04-21T15:02:03.004Z')) : null,
    close && p.justificationPurgeeAt === undefined ? randomBytes(40) : null,
    p.justificationPurgeeAt ?? null,
    p.mesureTermineeAt ?? null,
    p.gel?.at ?? null,
    p.gel?.leveAt ?? null,
    p.gel ? REF_LITIGE : null
  );
  return id;
}

const anonymisee = async (id: string) => (await lire('anomalies', id))['anonymisee_at'] !== null;

/** Ce qui reste d'une anomalie anonymisée : rien d'autre ne survit. */
const RESTE_D_UNE_ANOMALIE = ['id', 'type', 'statut', 'ouverte_at', 'traite_at', 'anonymisee_at'];

describe('REQ-DM-033 — l’anonymisation des anomalies à leur échéance', () => {
  it('REQ-DM-033 : TÉMOIN — une anomalie LEVÉE est anonymisée deux mois après sa levée, pas une milliseconde avant', async () => {
    const id = await uneAnomalie({ statut: 'levee', traiteAt: d('2026-04-21T15:02:03.004Z') });
    const echeance = d('2026-06-21T15:02:03.004Z');

    await anonymiserLesAnomalies(app, avant(echeance));
    expect(await anonymisee(id)).toBe(false);

    await anonymiserLesAnomalies(app, echeance);
    const l = await lire('anomalies', id);
    expect(instant(l['anonymisee_at'])).toBe(echeance.toISOString());
    // Les mois d'ouverture et de traitement, tronqués en UTC.
    expect(instant(l['ouverte_at'])).toBe('2026-03-01T00:00:00.000Z');
    expect(instant(l['traite_at'])).toBe('2026-04-01T00:00:00.000Z');
    expect(l['statut']).toBe('levee');
    expect(l['type']).toBe('sincerite');
  });

  it('REQ-DM-033 : TÉMOIN — après l’anonymisation, AUCUNE colonne ne désigne une personne : restent l’id, le type, le statut, les mois et la date de l’anonymisation', async () => {
    const levee = await uneAnomalie({ statut: 'levee', traiteAt: d('2026-04-02T11:00:00.000Z') });
    // Une confirmée dont la justification était déjà purgée, et dont un gel a été posé puis levé.
    const confirmee = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-04-02T11:00:00.000Z'),
      mesureTermineeAt: d('2026-04-02T11:00:00.000Z'),
      justificationPurgeeAt: d('2026-05-01T00:00:00.000Z'),
      gel: { at: d('2026-06-01T00:00:00.000Z'), leveAt: d('2026-07-01T00:00:00.000Z') },
    });
    await anonymiserLesAnomalies(app, LOIN);
    for (const id of [levee, confirmee]) {
      const l = await lire('anomalies', id);
      expect(Object.keys(l).length).toBeGreaterThan(RESTE_D_UNE_ANOMALIE.length);
      for (const [colonne, valeur] of Object.entries(l)) {
        if (RESTE_D_UNE_ANOMALIE.includes(colonne)) expect(valeur).not.toBeNull();
        else expect({ colonne, valeur }).toEqual({ colonne, valeur: null });
      }
    }
  });

  it('REQ-DM-033 : TÉMOIN — une CONFIRMÉE est anonymisée cinq ans après la FIN DE LA MESURE, et non cinq ans après sa clôture', async () => {
    const id = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-04-21T15:02:03.004Z'),
      mesureTermineeAt: d('2026-09-30T10:00:00.000Z'),
    });
    const echeance = d('2031-09-30T10:00:00.000Z');

    // Cinq ans après la clôture : la mesure, elle, a pris fin plus tard.
    await anonymiserLesAnomalies(app, d('2031-04-21T15:02:03.004Z'));
    expect(await anonymisee(id)).toBe(false);
    await anonymiserLesAnomalies(app, avant(echeance));
    expect(await anonymisee(id)).toBe(false);
    await anonymiserLesAnomalies(app, echeance);
    expect(await anonymisee(id)).toBe(true);
  });

  it('REQ-DM-033 : TÉMOIN — une CONFIRMÉE à mesure sans durée (fin de la mesure = traite_at) est anonymisée cinq ans après sa clôture', async () => {
    const t = d('2026-05-12T08:30:00.000Z');
    const id = await uneAnomalie({ statut: 'confirmee', traiteAt: t, mesureTermineeAt: t });
    const echeance = d('2031-05-12T08:30:00.000Z');
    await anonymiserLesAnomalies(app, avant(echeance));
    expect(await anonymisee(id)).toBe(false);
    await anonymiserLesAnomalies(app, echeance);
    expect(await anonymisee(id)).toBe(true);
  });

  it('REQ-DM-033 : TÉMOIN — une CONFIRMÉE sans fin de mesure posée n’est JAMAIS anonymisée, ni une OUVERTE', async () => {
    const sansFin = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-04-21T15:02:03.004Z'),
    });
    const ouverte = await uneAnomalie({
      statut: 'ouverte',
      ouverteAt: d('2020-01-15T10:00:00.000Z'),
    });
    const avantSansFin = await lire('anomalies', sansFin);
    const avantOuverte = await lire('anomalies', ouverte);

    await anonymiserLesAnomalies(app, LOIN);

    expect(await lire('anomalies', sansFin)).toEqual(avantSansFin);
    expect(await lire('anomalies', ouverte)).toEqual(avantOuverte);
  });

  it('REQ-DM-033 : TÉMOIN — une confirmée GELÉE échue n’est pas anonymisée ; elle l’est dès la levée du gel', async () => {
    const id = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-06-01T00:00:00.000Z'),
      mesureTermineeAt: d('2026-06-01T00:00:00.000Z'),
      gel: { at: d('2027-01-10T00:00:00.000Z') },
    });
    // Échue depuis 2031-06-01, mais gelée.
    await anonymiserLesAnomalies(app, d('2033-01-01T00:00:00.000Z'));
    expect(await anonymisee(id)).toBe(false);

    const levee = d('2033-03-15T12:00:00.000Z');
    await app.$executeRawUnsafe(
      `UPDATE anomalies SET gel_litige_leve_at = $2 WHERE id = $1::uuid`,
      id,
      levee
    );
    await anonymiserLesAnomalies(app, levee);
    expect(await anonymisee(id)).toBe(true);
  });

  it('REQ-DM-033 : TÉMOIN — un gel levé AVANT l’échéance n’avance pas l’anonymisation : elle a lieu à l’échéance', async () => {
    const id = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-06-01T00:00:00.000Z'),
      mesureTermineeAt: d('2026-06-01T00:00:00.000Z'),
      gel: { at: d('2026-07-01T00:00:00.000Z'), leveAt: d('2027-02-01T00:00:00.000Z') },
    });
    await anonymiserLesAnomalies(app, d('2027-02-01T00:00:00.000Z'));
    expect(await anonymisee(id)).toBe(false);
    await anonymiserLesAnomalies(app, avant(d('2031-06-01T00:00:00.000Z')));
    expect(await anonymisee(id)).toBe(false);
    await anonymiserLesAnomalies(app, d('2031-06-01T00:00:00.000Z'));
    expect(await anonymisee(id)).toBe(true);
  });

  it('REQ-DM-033 : un second passage au même instant ne change rien', async () => {
    const id = await uneAnomalie({ statut: 'levee', traiteAt: d('2026-08-09T10:00:00.000Z') });
    const t = d('2026-10-09T10:00:00.000Z');
    await anonymiserLesAnomalies(app, t);
    const premier = await lire('anomalies', id);
    expect(premier['anonymisee_at']).not.toBeNull();
    expect((await anonymiserLesAnomalies(app, t)).anonymisees).toBe(0);
    expect(await lire('anomalies', id)).toEqual(premier);
  });
});

describe('REQ-DM-033 — le signal des mesures ouvertes au-delà de MESURE_OUVERTE_ALERTE_JOURS', () => {
  it('REQ-DM-033 : TÉMOIN — une mesure ouverte depuis 91 jours est signalée, une de 89 ne l’est pas', async () => {
    const m = d('2027-03-01T00:00:00.000Z');
    const ilYa = (jours: number) => new Date(m.getTime() - jours * MS_PAR_JOUR);
    const a91 = await uneAnomalie({ statut: 'confirmee', traiteAt: ilYa(91) });
    const a89 = await uneAnomalie({ statut: 'confirmee', traiteAt: ilYa(89) });
    // Pile au seuil : « depuis plus de » la durée d'alerte, donc pas encore.
    const a90 = await uneAnomalie({ statut: 'confirmee', traiteAt: ilYa(90) });
    const juste = await uneAnomalie({ statut: 'confirmee', traiteAt: avant(ilYa(90)) });
    // Ni une mesure terminée, ni une levée, ni une ouverte ne sont des mesures ouvertes.
    const terminee = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: ilYa(400),
      mesureTermineeAt: ilYa(300),
    });
    const levee = await uneAnomalie({ statut: 'levee', traiteAt: ilYa(400) });
    const ouverte = await uneAnomalie({ statut: 'ouverte', ouverteAt: ilYa(400) });

    const signalees = await mesuresOuvertesAuDela(app, m);
    expect(signalees).toContain(a91);
    expect(signalees).toContain(juste);
    for (const id of [a89, a90, terminee, levee, ouverte]) expect(signalees).not.toContain(id);
  });

  it('REQ-DM-033 : TÉMOIN — le signal qui sort du passage ne porte qu’un NOMBRE : aucune anomalie n’y est nommée', async () => {
    const m = d('2027-09-01T00:00:00.000Z');
    const id = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: new Date(m.getTime() - 200 * MS_PAR_JOUR),
    });
    const signalees = await mesuresOuvertesAuDela(app, m);
    expect(signalees).toContain(id);

    const r = await anonymiserLesAnomalies(app, m);
    expect(r.mesuresOuvertes).toBe(signalees.length);
    for (const v of Object.values(r)) expect(typeof v).toBe('number');
    expect(JSON.stringify(r)).not.toContain(id);
  });
});

// ── Les contestations ────────────────────────────────────────────────────────────────────────

async function uneContestation(p: {
  recueAt: Date;
  repondueAt?: Date;
  gel?: Gel;
}): Promise<string> {
  const id = randomUUID();
  const repondue = p.repondueAt !== undefined;
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO contestations (id, apporteur_id, objet, attribution_id, texte_chiffre, recue_at,
       reponse_chiffre, repondue_par_id, repondue_at, gel_litige_at, gel_litige_leve_at, gel_litige_ref)
     VALUES ($1::uuid, $2::uuid, 'annulation_attribution', $3::uuid, $4, $5, $6, $7::uuid, $8, $9,
       $10, $11)`,
    id,
    apporteurId,
    attributionId,
    randomBytes(40),
    p.recueAt,
    repondue ? randomBytes(40) : null,
    repondue ? adminId : null,
    p.repondueAt ?? null,
    p.gel?.at ?? null,
    p.gel?.leveAt ?? null,
    p.gel ? REF_LITIGE : null
  );
  return id;
}

const videe = async (id: string) => (await lire('contestations', id))['purgee_at'] !== null;

describe('REQ-DM-043 — le vidage des contestations à leur échéance', () => {
  it('REQ-DM-043 : TÉMOIN — une contestation répondue est vidée cinq ans après sa RÉPONSE, jamais avant, et rien d’autre n’est réécrit', async () => {
    const id = await uneContestation({
      recueAt: d('2026-05-04T10:11:12.013Z'),
      repondueAt: d('2026-05-15T16:00:00.000Z'),
    });
    const echeance = d('2031-05-15T16:00:00.000Z');
    const initiale = await lire('contestations', id);

    // Cinq ans après la réception : la réponse est venue plus tard.
    await purgerLesContestations(app, d('2031-05-04T10:11:12.013Z'));
    expect(await videe(id)).toBe(false);
    await purgerLesContestations(app, avant(echeance));
    expect(await videe(id)).toBe(false);

    await purgerLesContestations(app, echeance);
    const l = await lire('contestations', id);
    expect(l['texte_chiffre']).toBeNull();
    expect(l['reponse_chiffre']).toBeNull();
    expect(instant(l['purgee_at'])).toBe(echeance.toISOString());
    // L'auteur et la date de la réponse restent, comme trace ; le reste est intact.
    const garde = ['texte_chiffre', 'reponse_chiffre', 'purgee_at'];
    expect(sans(l, ...garde)).toEqual(sans(initiale, ...garde));
    expect(l['repondue_par_id']).toBe(adminId);
  });

  it('REQ-DM-043 : TÉMOIN — une contestation JAMAIS répondue est vidée cinq ans après sa réception, sans qu’une réponse soit posée', async () => {
    const id = await uneContestation({ recueAt: d('2026-06-02T07:00:00.000Z') });
    const echeance = d('2031-06-02T07:00:00.000Z');
    await purgerLesContestations(app, avant(echeance));
    expect(await videe(id)).toBe(false);

    await purgerLesContestations(app, echeance);
    const l = await lire('contestations', id);
    expect(l['texte_chiffre']).toBeNull();
    expect(instant(l['purgee_at'])).toBe(echeance.toISOString());
    expect(l['repondue_at']).toBeNull();
    expect(l['repondue_par_id']).toBeNull();
  });

  it('REQ-DM-043 : TÉMOIN — une contestation GELÉE échue n’est pas vidée ; elle l’est dès la levée du gel', async () => {
    const id = await uneContestation({
      recueAt: d('2026-05-04T10:00:00.000Z'),
      repondueAt: d('2026-05-10T10:00:00.000Z'),
      gel: { at: d('2026-08-01T00:00:00.000Z') },
    });
    await purgerLesContestations(app, d('2032-01-01T00:00:00.000Z'));
    expect(await videe(id)).toBe(false);

    const levee = d('2034-02-01T09:00:00.000Z');
    await app.$executeRawUnsafe(
      `UPDATE contestations SET gel_litige_leve_at = $2 WHERE id = $1::uuid`,
      id,
      levee
    );
    await purgerLesContestations(app, levee);
    expect(await videe(id)).toBe(true);
  });

  it('REQ-DM-043 : TÉMOIN — un gel levé AVANT l’échéance n’avance pas le vidage : il a lieu à l’échéance', async () => {
    const id = await uneContestation({
      recueAt: d('2026-05-04T10:00:00.000Z'),
      repondueAt: d('2026-05-10T10:00:00.000Z'),
      gel: { at: d('2026-08-01T00:00:00.000Z'), leveAt: d('2026-12-01T00:00:00.000Z') },
    });
    await purgerLesContestations(app, d('2026-12-01T00:00:00.000Z'));
    expect(await videe(id)).toBe(false);
    await purgerLesContestations(app, avant(d('2031-05-10T10:00:00.000Z')));
    expect(await videe(id)).toBe(false);
    await purgerLesContestations(app, d('2031-05-10T10:00:00.000Z'));
    expect(await videe(id)).toBe(true);
  });

  it('REQ-DM-043 : un second passage au même instant ne change rien', async () => {
    const id = await uneContestation({ recueAt: d('2026-07-01T00:00:00.000Z') });
    const t = d('2031-07-01T00:00:00.000Z');
    await purgerLesContestations(app, t);
    const premier = await lire('contestations', id);
    expect(premier['purgee_at']).not.toBeNull();
    expect((await purgerLesContestations(app, t)).videes).toBe(0);
    expect(await lire('contestations', id)).toEqual(premier);
  });
});

// ── Le démenti d'un contact ──────────────────────────────────────────────────────────────────

async function uneQualification(
  resultat: 'non_confirme' | 'confirme',
  creeAt: Date
): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO qualifications (id, attribution_id, resultat_contact, prochaine_etape,
       personne_interrogee_chiffre, termes_reponse_chiffre, auteur_id, cree_at)
     VALUES ($1::uuid, $2::uuid, $3::resultat_contact, 'aucune', $4, $5, $6::uuid, $7)`,
    id,
    attributionId,
    resultat,
    randomBytes(40),
    randomBytes(40),
    adminId,
    creeAt
  );
  return id;
}

describe('REQ-DM-043 — la purge dédiée du démenti d’un contact', () => {
  it('REQ-DM-043 : TÉMOIN — le démenti est vidé cinq ans après la qualification : ses deux blocs et contact_purge_at dans la même écriture, et RIEN d’autre n’est réécrit', async () => {
    const id = await uneQualification('non_confirme', d('2026-07-08T13:14:15.016Z'));
    const echeance = d('2031-07-08T13:14:15.016Z');
    const initiale = await lire('qualifications', id);

    await purgerLesDementis(app, avant(echeance));
    expect(await lire('qualifications', id)).toEqual(initiale);

    await purgerLesDementis(app, echeance);
    const l = await lire('qualifications', id);
    expect(l['personne_interrogee_chiffre']).toBeNull();
    expect(l['termes_reponse_chiffre']).toBeNull();
    expect(instant(l['contact_purge_at'])).toBe(echeance.toISOString());
    const purge = ['personne_interrogee_chiffre', 'termes_reponse_chiffre', 'contact_purge_at'];
    expect(sans(l, ...purge)).toEqual(sans(initiale, ...purge));
  });

  it('REQ-DM-043 : TÉMOIN — l’exception est FERMÉE : cette purge ne touche aucun autre résultat que le démenti', async () => {
    const id = await uneQualification('confirme', d('2026-07-08T13:14:15.016Z'));
    const initiale = await lire('qualifications', id);
    await purgerLesDementis(app, LOIN);
    expect(await lire('qualifications', id)).toEqual(initiale);
  });

  it('REQ-DM-043 : un démenti vidé ne se réécrit pas : un passage ultérieur ne change rien', async () => {
    const id = await uneQualification('non_confirme', d('2026-08-01T00:00:00.000Z'));
    await purgerLesDementis(app, d('2031-08-01T00:00:00.000Z'));
    const premier = await lire('qualifications', id);
    expect(premier['contact_purge_at']).not.toBeNull();
    await purgerLesDementis(app, LOIN);
    expect(await lire('qualifications', id)).toEqual(premier);
  });
});

// ── Les durées, le registre et le lanceur ────────────────────────────────────────────────────

describe('REQ-DM-033 et REQ-DM-043 — les durées vivent dans la SSOT, chaque purge est inscrite', () => {
  it('REQ-DM-033 : les durées d’anonymisation vivent dans retention.ts (deux mois, cinq ans), l’alerte dans la SSOT (90 jours)', () => {
    expect(DUREES_DE_RETENTION.ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS).toMatchObject({
      valeur: 2,
      unite: 'mois',
    });
    expect(DUREES_DE_RETENTION.ANOMALIE_CONFIRMEE_ANONYMISEE_APRES_ANS).toMatchObject({
      valeur: 5,
      unite: 'ans',
    });
    expect(SEUILS.ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS).toBe(
      DUREES_DE_RETENTION.ANOMALIE_LEVEE_ANONYMISEE_APRES_MOIS
    );
    expect(SEUILS.MESURE_OUVERTE_ALERTE_JOURS).toMatchObject({ valeur: 90, unite: 'jours' });
    expect(Object.keys(DUREES_DE_RETENTION)).not.toContain('MESURE_OUVERTE_ALERTE_JOURS');
  });

  it('REQ-DM-043 : les durées du vidage des contestations et du démenti vivent dans retention.ts (cinq ans)', () => {
    for (const s of [
      DUREES_DE_RETENTION.CONTESTATION_TEXTES_VIDES_APRES_ANS,
      DUREES_DE_RETENTION.DEMENTI_CONTACT_VIDE_APRES_ANS,
    ]) {
      expect(s).toMatchObject({ valeur: 5, unite: 'ans' });
      expect(s.source).toContain('2026-10-03');
    }
  });

  it('REQ-DM-033 : TÉMOIN — chaque purge est inscrite au registre des tâches, avec son exigence, et au lanceur', async () => {
    expect(TACHES.anomalies_anonymiser.req).toBe('REQ-DM-033');
    expect(TACHES.contestations_purger.req).toBe('REQ-DM-043');
    expect(TACHES.dementis_purger.req).toBe('REQ-DM-043');
    const inscrites = inscriptions(app, {});
    for (const cle of [
      'anomalies_anonymiser',
      'contestations_purger',
      'dementis_purger',
    ] as const) {
      const passage = inscrites[cle];
      expect(typeof passage).toBe('function');
      // Joué à l'heure du système : il rend des compteurs, rien d'autre.
      const r = await passage!();
      for (const v of Object.values(r)) expect(typeof v).toBe('number');
    }
  });
});

describe('REQ-DM-033 — l’anonymisation délie les notifications de l’espace (juriste, DM-55)', () => {
  it('REQ-DM-033 : TÉMOIN — après l’anonymisation, AUCUNE notification ne pointe plus vers l’anomalie ; la notification reste', async () => {
    const id = await uneAnomalie({
      statut: 'confirmee',
      traiteAt: d('2026-04-21T15:02:03.004Z'),
      mesureTermineeAt: d('2026-04-21T15:02:03.004Z'),
    });
    const { id: evenementId } = await app.$transaction((tx) =>
      ajouterEvenement(tx, {
        type: 'attribution_etat_modifie',
        agregat: 'attribution',
        agregatId: attributionId,
        survenuAt: CREATION,
        charge: {
          de: 'provisoire',
          vers: 'invalidee',
          transition: 'anomalie_confirmee',
          acteur: { par: 'utilisateur_console', id: adminId },
          lienInteret: 'non_declare',
        },
      })
    );
    const notification = await base.prisma.notificationEspace.create({
      data: {
        apporteurId,
        cle: 'decision_attribution',
        attributionId,
        evenementId: BigInt(evenementId),
        anomalieId: id,
      },
    });
    await anonymiserLesAnomalies(app, d('2031-04-21T15:02:03.004Z'));
    expect(await anonymisee(id)).toBe(true);
    expect(await base.prisma.notificationEspace.count({ where: { anomalieId: id } })).toBe(0);
    const reste = await base.prisma.notificationEspace.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(reste.anomalieId).toBeNull();
    expect(reste.evenementId).toBe(BigInt(evenementId));
  });
});
