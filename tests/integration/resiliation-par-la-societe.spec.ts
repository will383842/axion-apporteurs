// @req REQ-JUR-015
// @req REQ-ARG-026
/**
 * SEC-66 — la résiliation par la Société (`ordinaire_axion`), en base RÉELLE, dans la forme (b) d'A02
 * (#703, 5983008261) et sous le texte de la juriste (#703, 5982404858) :
 *   - À LA DÉCISION, une seule transaction : l'événement `apporteur_resiliation_notifiee`, la ligne
 *     `decisions_de_contrat` (`date_reception` = jour civil de Paris de la décision, `date_effet` = ce
 *     jour + `PREAVIS_JOURS`) et la notification `resiliation`. AUCUN changement de statut : l'apporteur
 *     reste `signe` pendant le préavis ;
 *   - la décision n'est OPPOSABLE que si son courriel est `envoye` le jour civil de Paris de
 *     `date_reception` ; le rendu REFUSE un envoi un autre jour (échec fermé, sans courriel) ;
 *   - À LA DATE D'EFFET, la tâche planifiée lit la décision opposable la plus récente, passe l'apporteur
 *     en `resilie` et applique les effets de l'art. 12 ; sans décision opposable, rien.
 *
 * L'invariant de la juriste (#703, 5983001668) : « Aucune date d'effet ne peut être opposée à
 * l'apporteur, ni produire un effet de l'art. 12, si le courriel qui fait courir le préavis n'est pas
 * parti. »
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures et
 * les lectures restent sous le propriétaire.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  notifierLaResiliationParLaSociete,
  rendreUneDecisionDeContrat,
  resilierUnApporteur,
} from '../../src/server/apporteur/resiliation';
import { resilierALaDateDEffet } from '../../src/server/taches/resilier-a-date-effet';
import { niveauDAcces, routeOuverte } from '../../src/domain/apporteur/acces-espace';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let adminId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 760000000;
const unSiren = () => String((sirens += 1));
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-66-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

/**
 * La décision est prise le 4 octobre 2026 à 23 h 30, heure de Paris (UTC+2) : son jour civil de Paris
 * est le 4, alors que le jour UTC suivant commence une demi-heure plus tard. Le préavis de 30 jours
 * mène au 3 novembre 2026, après le retour à l'heure d'hiver (UTC+1, le 25 octobre).
 */
const DECISION = new Date('2026-10-04T21:30:00.000Z');
const ENVOI_LE_JOUR_MEME = new Date('2026-10-04T21:45:00.000Z'); // 23 h 45 à Paris, le 4
const ENVOI_LE_LENDEMAIN = new Date('2026-10-04T22:10:00.000Z'); // 0 h 10 à Paris, le 5
const VEILLE_DE_L_EFFET = new Date('2026-11-02T22:59:59.999Z'); // 23 h 59 à Paris, le 2 novembre
const JOUR_DE_L_EFFET = new Date('2026-11-02T23:00:00.000Z'); // minuit à Paris, le 3 novembre
const DATE_EFFET = '2026-11-03';

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
        publieeAt: DECISION,
        importeeAt: DECISION,
      },
    })
  ).id;
  const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    DECISION
  );
  adminId = admin!.id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

const ACTEUR = () => ({ par: 'utilisateur_console' as const, id: adminId });

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
        creeAt: DECISION,
      },
    })
  ).id;
}

/** Une attribution provisoire de l'apporteur, insérée par SQL brut ; rend son id. */
async function uneAttribution(apporteurId: string): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
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

/** Un jeton de dépôt vivant de l'apporteur ; rend son id. */
async function unJeton(apporteurId: string): Promise<string> {
  return (
    await base.prisma.jetonDepot.create({
      data: { apporteurId, tokenHash: hex(32), creeAt: DECISION },
    })
  ).id;
}

/** Le geste « notifier la résiliation par la Société », sous `partners_app`. */
function notifier(apporteurId: string, maintenant = DECISION) {
  return app.$transaction((tx) =>
    notifierLaResiliationParLaSociete(tx, { apporteurId, acteur: ACTEUR(), maintenant }, CLES)
  );
}

/** Le courriel de la notification `resiliation` de cette décision, tel que le passage l'aurait écrit. */
async function unCourriel(
  decisionId: string,
  issue: { statut: 'envoye' | 'echec'; at: Date }
): Promise<void> {
  const n = await base.prisma.notificationEspace.findFirstOrThrow({
    where: { decisionContratId: decisionId },
    select: { id: true, apporteurId: true },
  });
  await base.prisma.courrielEnvoye.create({
    data: {
      gabarit: 'resiliation',
      emailHash: hex(32),
      apporteurId: n.apporteurId,
      statut: issue.statut,
      demandeAt: issue.at,
      envoyeAt: issue.statut === 'envoye' ? issue.at : null,
      ...(issue.statut === 'echec' ? { erreur: 'relais_indisponible' } : {}),
      notificationEspaceId: n.id,
    },
  });
}

const statutDe = async (apporteurId: string) =>
  await base.prisma.apporteur.findUniqueOrThrow({
    where: { id: apporteurId },
    select: { statut: true, resiliationMotif: true, sessionVersion: true },
  });

const jour = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

/** La tâche planifiée, à l'instant donné, sur le client d'exécution. */
const tache = (maintenant: Date) => resilierALaDateDEffet(app, maintenant);

describe('REQ-JUR-015 — à la décision : la date d’effet, sans changement de statut', () => {
  it('REQ-JUR-015 : TÉMOIN — la date d’effet égale le jour civil de Paris de la décision plus le préavis ; l’événement, la ligne et la notification naissent ensemble', async () => {
    expect(SEUILS.PREAVIS_JOURS.valeur).toBe(30);
    const apporteurId = await unApporteur();
    const r = await notifier(apporteurId);
    expect(jour(r.dateEffet)).toBe(DATE_EFFET);
    const d = await base.prisma.decisionDeContrat.findUniqueOrThrow({
      where: { id: r.decisionId },
      select: {
        apporteurId: true,
        geste: true,
        dateReception: true,
        dateEffet: true,
        evenementId: true,
      },
    });
    expect({ ...d, dateReception: jour(d.dateReception), dateEffet: jour(d.dateEffet) }).toEqual({
      apporteurId,
      geste: 'resiliation',
      dateReception: '2026-10-04',
      dateEffet: DATE_EFFET,
      evenementId: r.evenementId,
    });
    const [fait] = await base.prisma.$queryRawUnsafe<{ type: string; charge: unknown }[]>(
      `SELECT type::text AS type, charge FROM evenements WHERE id = $1`,
      r.evenementId
    );
    expect(fait).toEqual({
      type: 'apporteur_resiliation_notifiee',
      charge: { motif: 'ordinaire_axion', dateEffet: DATE_EFFET, acteur: ACTEUR() },
    });
    const notifications = await base.prisma.notificationEspace.findMany({
      where: { apporteurId },
      select: { cle: true, evenementId: true, decisionContratId: true },
    });
    expect(notifications).toEqual([
      { cle: 'resiliation', evenementId: r.evenementId, decisionContratId: r.decisionId },
    ]);
    // Aucun changement de statut : l'apporteur reste `signe`, sans motif, et rien ne le dit au journal.
    expect(await statutDe(apporteurId)).toEqual({
      statut: 'signe',
      resiliationMotif: null,
      sessionVersion: 0,
    });
    const changements = await base.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM evenements WHERE agregat_id = $1::uuid AND type = 'apporteur_statut_modifie'`,
      apporteurId
    );
    expect(changements).toEqual([]);
  });

  it('REQ-JUR-015 : TÉMOIN — le geste est un acte de la console, sur un apporteur sous contrat ; un refus ne laisse rien', async () => {
    const apporteurId = await unApporteur();
    await expect(
      app.$transaction((tx) =>
        notifierLaResiliationParLaSociete(
          tx,
          {
            apporteurId,
            acteur: JSON.parse('{"par":"systeme"}') as ReturnType<typeof ACTEUR>,
            maintenant: DECISION,
          },
          CLES
        )
      )
    ).rejects.toThrow(/acteur_non_humain/);
    const candidat = await unApporteur('candidat');
    await expect(notifier(candidat)).rejects.toThrow(/statut_sans_contrat/);
    for (const a of [apporteurId, candidat]) {
      expect(await base.prisma.decisionDeContrat.count({ where: { apporteurId: a } })).toBe(0);
      expect(await base.prisma.notificationEspace.count({ where: { apporteurId: a } })).toBe(0);
    }
  });

  it('REQ-JUR-015 : TÉMOIN — le refus d’ordinaire_axion de SEC-19 est levé par ce geste ; la résiliation à la main reste refusée pour ce motif', async () => {
    const apporteurId = await unApporteur();
    await expect(
      app.$transaction((tx) =>
        resilierUnApporteur(
          tx,
          { apporteurId, motif: 'ordinaire_axion', acteur: ACTEUR(), maintenant: DECISION },
          CLES
        )
      )
    ).rejects.toThrow(/preavis_non_notifie/);
    const r = await notifier(apporteurId);
    await unCourriel(r.decisionId, { statut: 'envoye', at: ENVOI_LE_JOUR_MEME });
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 1 });
    expect(await statutDe(apporteurId)).toMatchObject({
      statut: 'resilie',
      resiliationMotif: 'ordinaire_axion',
    });
  });
});

describe('REQ-JUR-015 — pendant le préavis, le contrat court normalement', () => {
  it('REQ-JUR-015 : TÉMOIN — aucun effet de l’art. 12 avant la date d’effet, et l’apporteur en préavis peut encore déposer', async () => {
    const apporteurId = await unApporteur();
    const attributionId = await uneAttribution(apporteurId);
    const jetonId = await unJeton(apporteurId);
    const r = await notifier(apporteurId);
    await unCourriel(r.decisionId, { statut: 'envoye', at: ENVOI_LE_JOUR_MEME });
    expect(await tache(VEILLE_DE_L_EFFET)).toMatchObject({ resilies: 0 });
    const a = await statutDe(apporteurId);
    expect(a).toEqual({ statut: 'signe', resiliationMotif: null, sessionVersion: 0 });
    // L'espace reste PLEIN : le dépôt est ouvert, comme avant la décision.
    expect(niveauDAcces(a.statut)).toBe('plein');
    expect(routeOuverte(niveauDAcces(a.statut), 'deposer')).toBe(true);
    expect(
      (await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } })).statut
    ).toBe('provisoire');
    expect(
      (await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: jetonId } })).revoqueAt
    ).toBeNull();
  });

  it('REQ-JUR-015 : TÉMOIN — à la date d’effet, le passage à resilie se fait par la tâche, avec les effets de l’art. 12 et l’acteur de la décision', async () => {
    const apporteurId = await unApporteur();
    const attributionId = await uneAttribution(apporteurId);
    const jetonId = await unJeton(apporteurId);
    const r = await notifier(apporteurId);
    await unCourriel(r.decisionId, { statut: 'envoye', at: ENVOI_LE_JOUR_MEME });
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 1 });
    expect(await statutDe(apporteurId)).toEqual({
      statut: 'resilie',
      resiliationMotif: 'ordinaire_axion',
      sessionVersion: 1,
    });
    const [fait] = await base.prisma.$queryRawUnsafe<{ charge: unknown; survenu: Date }[]>(
      `SELECT charge, survenu_at AS survenu FROM evenements
       WHERE agregat_id = $1::uuid AND type = 'apporteur_statut_modifie'`,
      apporteurId
    );
    expect(fait!.charge).toEqual({
      de: 'signe',
      vers: 'resilie',
      transition: 'resilier',
      resiliationMotif: 'ordinaire_axion',
      acteur: ACTEUR(),
    });
    expect(fait!.survenu.toISOString()).toBe(JOUR_DE_L_EFFET.toISOString());
    expect(
      (await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } })).statut
    ).toBe('annulee');
    expect(
      (await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: jetonId } })).revoqueAt
    ).not.toBeNull();
    // La date d'effet n'écrit ni seconde décision ni second courriel : la fin a déjà été notifiée.
    expect(await base.prisma.decisionDeContrat.count({ where: { apporteurId } })).toBe(1);
    expect(await base.prisma.notificationEspace.count({ where: { apporteurId } })).toBe(1);
    // Un second passage ne change rien.
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 0 });
  });
});

describe('REQ-JUR-015 — sans courriel parti le jour de la décision, aucune date n’est opposable', () => {
  it('REQ-JUR-015 : TÉMOIN — un courriel en échec : aucune date opposable, aucun passage à resilie, aucun effet de l’art. 12, et la ligne reste', async () => {
    const apporteurId = await unApporteur();
    const attributionId = await uneAttribution(apporteurId);
    const r = await notifier(apporteurId);
    await unCourriel(r.decisionId, { statut: 'echec', at: ENVOI_LE_JOUR_MEME });
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 0 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'signe' });
    expect(
      (await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } })).statut
    ).toBe('provisoire');
    expect(await base.prisma.decisionDeContrat.count({ where: { id: r.decisionId } })).toBe(1);
  });

  it('REQ-JUR-015 : TÉMOIN — un courriel jamais parti : aucune date opposable, même longtemps après', async () => {
    const apporteurId = await unApporteur();
    await notifier(apporteurId);
    expect(await tache(new Date('2027-06-01T08:00:00.000Z'))).toMatchObject({ resilies: 0 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'signe' });
  });

  it('REQ-JUR-015 : TÉMOIN — le rendu refuse un envoi le lendemain de la décision (échec fermé) ; le jour même, il annonce la date d’effet', async () => {
    const apporteurId = await unApporteur();
    const r = await notifier(apporteurId);
    const n = await base.prisma.notificationEspace.findFirstOrThrow({
      where: { decisionContratId: r.decisionId },
      select: { cle: true, apporteurId: true, evenementId: true, decisionContratId: true },
    });
    const notification = { ...n, evenementId: String(n.evenementId) };
    const composer = (cle: string, texte: { corps: string }) => ({
      sujet: cle,
      corps: texte.corps,
    });
    const lendemain = await app.$transaction((tx) =>
      rendreUneDecisionDeContrat(tx, notification, {
        cles: CLES,
        composer: composer as never,
        envoyeLe: ENVOI_LE_LENDEMAIN,
      })
    );
    expect(lendemain).toEqual({ nonRendue: 'decision_non_notifiee' });
    const memeJour = await app.$transaction((tx) =>
      rendreUneDecisionDeContrat(tx, notification, {
        cles: CLES,
        composer: composer as never,
        envoyeLe: ENVOI_LE_JOUR_MEME,
      })
    );
    expect(memeJour).toMatchObject({ sujet: 'resiliation' });
    expect(JSON.stringify(memeJour)).toContain('3 novembre 2026');
  });

  it('REQ-JUR-015 : TÉMOIN — un courriel envoyé le lendemain rend la décision caduque : aucun passage à resilie', async () => {
    const apporteurId = await unApporteur();
    const r = await notifier(apporteurId);
    await unCourriel(r.decisionId, { statut: 'envoye', at: ENVOI_LE_LENDEMAIN });
    expect(await tache(new Date('2026-12-01T08:00:00.000Z'))).toMatchObject({ resilies: 0 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'signe' });
  });
});

describe('REQ-ARG-026 — une nouvelle notification est une nouvelle décision', () => {
  it('REQ-ARG-026 : TÉMOIN — une nouvelle notification fait une nouvelle ligne, et seule la dernière opposable compte', async () => {
    const apporteurId = await unApporteur();
    const premiere = await notifier(apporteurId);
    await unCourriel(premiere.decisionId, { statut: 'echec', at: ENVOI_LE_JOUR_MEME });
    // Une semaine plus tard, la Société notifie de nouveau : un nouvel événement, une nouvelle ligne,
    // une nouvelle date d'effet (le 11 octobre + 30 jours = le 10 novembre).
    const seconde = await notifier(apporteurId, new Date('2026-10-11T08:00:00.000Z'));
    expect(seconde.decisionId).not.toBe(premiere.decisionId);
    expect(seconde.evenementId).not.toBe(premiere.evenementId);
    expect(jour(seconde.dateEffet)).toBe('2026-11-10');
    await unCourriel(seconde.decisionId, {
      statut: 'envoye',
      at: new Date('2026-10-11T08:05:00.000Z'),
    });
    expect(await base.prisma.decisionDeContrat.count({ where: { apporteurId } })).toBe(2);
    // La date de la PREMIÈRE, caduque, ne produit rien.
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 0 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'signe' });
    // Celle de la seconde, opposable, résilie.
    expect(await tache(new Date('2026-11-09T23:00:00.000Z'))).toMatchObject({ resilies: 1 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'resilie' });
  });

  it('REQ-ARG-026 : TÉMOIN — deux décisions opposables : la plus récente fixe la date d’effet', async () => {
    const apporteurId = await unApporteur();
    const premiere = await notifier(apporteurId);
    await unCourriel(premiere.decisionId, { statut: 'envoye', at: ENVOI_LE_JOUR_MEME });
    const seconde = await notifier(apporteurId, new Date('2026-10-11T08:00:00.000Z'));
    await unCourriel(seconde.decisionId, {
      statut: 'envoye',
      at: new Date('2026-10-11T08:05:00.000Z'),
    });
    expect(await tache(JOUR_DE_L_EFFET)).toMatchObject({ resilies: 0 });
    expect(await statutDe(apporteurId)).toMatchObject({ statut: 'signe' });
    expect(await tache(new Date('2026-11-09T23:00:00.000Z'))).toMatchObject({ resilies: 1 });
  });
});
