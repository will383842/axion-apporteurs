// @req REQ-UX-016
// @req REQ-DM-006
// @req REQ-DM-004
/**
 * L'émission des notifications de la machine, en base RÉELLE, sous le rôle du serveur
 * (`partners_app`), comme en production (forme d'A02, critères de la juriste, conditions de la
 * sécurité) :
 *   — la transition écrit UNE notification, au BON apporteur, avec son événement, dans la même
 *     transaction ; les contraintes refusent le doublon, la clé de la machine sans événement, et le
 *     lien d'anomalie hors d'une décision ;
 *   — l'erreur de saisie de la Société n'annule jamais le dépôt d'un apporteur ;
 *   — la libération de l'occupation notifie le premier rang, dont la fenêtre reste NULLE tant que le
 *     courriel n'est pas parti ;
 *   — le passage envoie une fois ; la fenêtre court de l'ENVOI EFFECTIF, à la milliseconde, et ne
 *     bouge plus ; un courriel retenu ne pose rien ; la purge à douze mois laisse le courriel, preuve
 *     du délai, sans son lien.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { transitionnerUneAttribution } from '../../src/server/attribution/transitionner';
import {
  envoyerLesNotificationsDeLEspace,
  envoyerParLEmetteur,
  portsDuPassage,
} from '../../src/server/taches/envoyer-notifications-espace';
import { finDeLaFenetreDeRedeclaration } from '../../src/domain/attribution/fenetre-redeclaration';
import { purgerLesNotificationsDeLEspace } from '../../src/server/taches/purger-notifications-espace';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, encryptPii } from '../../src/server/securite/pii';
import { rendreDepuisLaBase } from '../../src/server/attribution/notifications';
import { lireLaChargeDUnFait } from '../../src/server/evenement/journal';
import {
  MODELE_DE_LA_JUSTIFICATION,
  lireLesFaitsPourLaNotification,
} from '../../src/server/anomalie/justification';
import { composerLeCourriel } from '../../src/server/notifications/envoyer';
import type { Relais } from '../../src/server/integrations/zeptomail/emetteur';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;
let grilleId: string;

const T0 = new Date('2027-05-10T08:00:00.000Z');
const CONSOLE = { par: 'utilisateur_console', id: '0190f3a0-0000-7000-8000-0000000000e5' } as const;
const SYSTEME = { par: 'systeme' } as const;
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 410000000;
const unSiren = () => String((sirens += 1));

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
        publieeAt: T0,
        importeeAt: T0,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

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
        creeAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
  ).id;
}

/** Une attribution d'apporteur, par SQL brut. */
async function semer(
  apporteurId: string,
  statut: string,
  o: { siren?: string; rangAttente?: number | null } = {}
): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, rang_attente, siren, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, $5, 'espace', $6::uuid, '2026-10-01',
       false, false, false)`,
    id,
    apporteurId,
    statut,
    o.rangAttente ?? null,
    o.siren ?? unSiren(),
    grilleId
  );
  return id;
}

const transition = (demande: Parameters<typeof transitionnerUneAttribution>[1]) =>
  app.$transaction((tx) => transitionnerUneAttribution(tx, demande));

const notificationsDe = (attributionId: string) =>
  base.prisma.notificationEspace.findMany({ where: { attributionId }, orderBy: { creeAt: 'asc' } });

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('aucun refus');
}

// ── le passage, branché sur l'émetteur réel et un relais simulé ─────────────────────────────────────

let horloge = T0;
let relaisEnPanne = false;
let dmarcVerifie = true;
const appels: string[] = [];
const relais: Relais = {
  async envoyer(m) {
    appels.push(m.reference);
    if (relaisEnPanne) throw new Error('relais_hors_service');
    return { messageId: `msg-${appels.length}` };
  },
};
const cles = () => {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = hex(32);
  return clesPii(env);
};
const CLES = cles();

const passage = () =>
  envoyerLesNotificationsDeLEspace(
    portsDuPassage(app, {
      maintenant: () => horloge,
      rendre: async () => ({ sujet: 'Objet', corps: 'Corps' }),
      envoyer: (tx, n, texte, envoyeLe) =>
        envoyerParLEmetteur(
          {
            configuration: { expediteur: 'camille@envoi.partners.test', dmarcVerifie },
            relais,
            cles: CLES,
            nouvelId: randomUUID,
          },
          async () => 'destinataire@envoi.partners.test'
        )(tx, n, texte, envoyeLe),
    })
  );

const courrielsDe = (notificationEspaceId: string) =>
  base.prisma.courrielEnvoye.findMany({
    where: { notificationEspaceId },
    orderBy: { demandeAt: 'asc' },
  });

const fenetreDe = async (attributionId: string) =>
  (await base.prisma.attribution.findUniqueOrThrow({ where: { id: attributionId } }))
    .fenetreRedeclarationFinAt;

describe('REQ-DM-006 — la décision écrit sa notification, dans la transaction de la transition', () => {
  it('REQ-DM-006 : TÉMOIN — une non-confirmation écrit UNE notification, au BON apporteur, avec son événement', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n, ...reste] = await notificationsDe(id);
    expect(reste).toEqual([]);
    expect(n).toMatchObject({
      apporteurId: apporteur,
      cle: 'decision_attribution',
      anomalieId: null,
    });
    const [ligneDernier] = await base.prisma.$queryRawUnsafe<{ dernier: bigint }[]>(
      `SELECT max(id) AS dernier FROM evenements WHERE agregat_id = $1::uuid`,
      id
    );
    expect(n!.evenementId).toBe(ligneDernier!.dernier);
  });

  it('REQ-DM-006 : TÉMOIN — un second écrit pour le même événement est refusé ; une clé de la machine sans événement aussi', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(id);
    expect(
      await refus(
        base.prisma.notificationEspace.create({
          data: {
            apporteurId: apporteur,
            cle: 'decision_attribution',
            attributionId: id,
            evenementId: n!.evenementId,
          },
        })
      )
    ).toMatch(/notifications_espace_une_par_evenement|Unique constraint/);
    expect(
      await refus(
        base.prisma.notificationEspace.create({
          data: { apporteurId: apporteur, cle: 'premier_rang_libere', attributionId: id },
        })
      )
    ).toMatch(/notifications_espace_machine_a_son_evenement/);
  });

  it('REQ-DM-006 : deux événements sur la même attribution donnent deux notifications', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(id);
    const [ligneAutre] = await base.prisma.$queryRawUnsafe<{ autre: bigint }[]>(
      `SELECT min(id) AS autre FROM evenements WHERE id <> $1`,
      n!.evenementId
    );
    await base.prisma.notificationEspace.create({
      data: {
        apporteurId: apporteur,
        cle: 'decision_attribution',
        attributionId: id,
        evenementId: ligneAutre!.autre,
      },
    });
    expect(await notificationsDe(id)).toHaveLength(2);
  });

  it('REQ-DM-006 : TÉMOIN — le lien d’anomalie hors d’une décision est refusé par le CHECK', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    const anomalie = await base.prisma.anomalie.create({
      data: { type: 'sincerite', score: 40, apporteurId: apporteur, attributionId: id },
    });
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(id);
    expect(
      await refus(
        base.prisma.notificationEspace.create({
          data: {
            apporteurId: apporteur,
            cle: 'refus_declaration',
            attributionId: id,
            evenementId: n!.evenementId,
            anomalieId: anomalie.id,
          },
        })
      )
    ).toMatch(/notifications_espace_anomalie_decision_seule/);
  });

  it('REQ-DM-006 : TÉMOIN — l’erreur de saisie de la Société sur le dépôt d’un apporteur : refus nommé, ni état, ni événement, ni notification', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    expect(
      await refus(
        transition({
          attributionId: id,
          transition: 'annulee_par_la_console',
          acteur: CONSOLE,
          maintenant: T0,
          motifAnnulation: 'erreur_de_saisie_de_la_societe',
        })
      )
    ).toMatch(/erreur_de_saisie_de_la_societe/);
    expect((await base.prisma.attribution.findUniqueOrThrow({ where: { id } })).statut).toBe(
      'provisoire'
    );
    const evenements = await base.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT id FROM evenements WHERE agregat_id = $1::uuid`,
      id
    );
    expect(evenements).toEqual([]);
    expect(await notificationsDe(id)).toEqual([]);
  });
});

describe('REQ-DM-004 — le premier rang libéré, et la fenêtre qui court de l’ENVOI EFFECTIF', () => {
  it('REQ-DM-004 : TÉMOIN — la libération notifie le premier rang ; sa fenêtre reste NULLE jusqu’à l’envoi', async () => {
    const siren = unSiren();
    const occupant = await semer(await unApporteur(), 'active', { siren });
    const apporteurRang1 = await unApporteur();
    const rang1 = await semer(apporteurRang1, 'en_attente', { siren, rangAttente: 1 });
    await transition({
      attributionId: occupant,
      transition: 'perimee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n, ...reste] = await notificationsDe(rang1);
    expect(reste).toEqual([]);
    expect(n).toMatchObject({ apporteurId: apporteurRang1, cle: 'premier_rang_libere' });
    expect(await fenetreDe(rang1)).toBeNull();
  });

  it('REQ-DM-004 : TÉMOIN (juriste) — relais en panne, puis envoi deux heures plus tard : l’échéance part de l’envoi, à la milliseconde ; un rejeu ne la déplace pas', async () => {
    const siren = unSiren();
    const occupant = await semer(await unApporteur(), 'active', { siren });
    const rang1 = await semer(await unApporteur(), 'en_attente', { siren, rangAttente: 1 });
    await transition({
      attributionId: occupant,
      transition: 'perimee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(rang1);

    horloge = T0;
    relaisEnPanne = true;
    await passage();
    expect((await courrielsDe(n!.id)).map((c) => c.statut)).toContain('echec');
    expect(await fenetreDe(rang1)).toBeNull();

    const plusTard = new Date(T0.getTime() + 2 * 3_600_000);
    horloge = plusTard;
    relaisEnPanne = false;
    await passage();
    const envoye = (await courrielsDe(n!.id)).find((c) => c.statut === 'envoye')!;
    expect(envoye.envoyeAt!.toISOString()).toBe(plusTard.toISOString());
    const attendue = new Date(finDeLaFenetreDeRedeclaration(plusTard.getTime()));
    expect((await fenetreDe(rang1))!.toISOString()).toBe(attendue.toISOString());

    horloge = new Date(plusTard.getTime() + 3_600_000);
    await passage();
    expect((await courrielsDe(n!.id)).filter((c) => c.statut === 'envoye')).toHaveLength(1);
    expect((await fenetreDe(rang1))!.toISOString()).toBe(attendue.toISOString());
  });

  it('REQ-DM-004 : TÉMOIN — un courriel RETENU ne pose aucune fenêtre : aucun délai ne court', async () => {
    const siren = unSiren();
    const occupant = await semer(await unApporteur(), 'active', { siren });
    const rang1 = await semer(await unApporteur(), 'en_attente', { siren, rangAttente: 1 });
    await transition({
      attributionId: occupant,
      transition: 'perimee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(rang1);
    dmarcVerifie = false;
    try {
      await passage();
    } finally {
      dmarcVerifie = true;
    }
    expect((await courrielsDe(n!.id)).map((c) => c.statut)).toEqual(['retenu_dmarc_non_verifie']);
    expect(await fenetreDe(rang1)).toBeNull();
  });
});

describe('REQ-DM-006 — les faits ne sortent que vers le courriel : condition (4) de la sécurité', () => {
  it('REQ-DM-006 : TÉMOIN — un MARQUEUR des faits part au relais, et n’apparaît ni dans courriels_envoyes, ni dans evenements, ni dans le journal applicatif', async () => {
    const marqueur = `MARQUEUR-${hex(8)}`;
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    const [admin] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
       VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3) RETURNING id`,
      randomUUID(),
      hex(32),
      T0
    );
    const anomalieId = randomUUID();
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO anomalies (id, type, score, apporteur_id, attribution_id, statut, ouverte_at,
         traite_par_id, traite_at, justification_chiffre)
       VALUES ($1::uuid, 'sincerite', 40, $2::uuid, $3::uuid, 'confirmee'::statut_anomalie, $4,
         $5::uuid, $6, $7)`,
      anomalieId,
      apporteur,
      id,
      new Date(T0.getTime() - 86_400_000),
      admin!.id,
      T0,
      encryptPii(
        { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: anomalieId },
        `deux dépôts le même jour, ${marqueur}`,
        CLES
      )
    );
    await transition({
      attributionId: id,
      transition: 'anomalie_confirmee',
      acteur: { par: 'utilisateur_console', id: admin!.id },
      maintenant: T0,
      anomalieId,
    });

    // Le journal applicatif : le passage n'écrit aucun journal ; toute sortie par la console est captée.
    const sorties: string[] = [];
    const capter = (...a: unknown[]) => {
      sorties.push(a.map(String).join(' '));
      return true;
    };
    const espions = [
      vi.spyOn(console, 'log').mockImplementation(capter),
      vi.spyOn(console, 'info').mockImplementation(capter),
      vi.spyOn(console, 'warn').mockImplementation(capter),
      vi.spyOn(console, 'error').mockImplementation(capter),
    ];
    const corpsRelayes: string[] = [];
    try {
      await envoyerLesNotificationsDeLEspace(
        portsDuPassage(app, {
          maintenant: () => T0,
          rendre: (tx, n, envoyeLe) =>
            rendreDepuisLaBase(tx, n, envoyeLe, {
              chargeDuFait: async (t, f) => (await lireLaChargeDUnFait(t, f))?.charge ?? null,
              faitsDe: (t, q) => lireLesFaitsPourLaNotification(t, q, CLES),
              composer: (cle, texte) =>
                composerLeCourriel(cle, texte, new URL('https://espace.partners.test')),
            }),
          envoyer: (tx, n, texte, envoyeLe) =>
            envoyerParLEmetteur(
              {
                configuration: { expediteur: 'camille@envoi.partners.test', dmarcVerifie: true },
                relais: {
                  async envoyer(m) {
                    corpsRelayes.push(m.corps);
                    return { messageId: `msg-${hex(4)}` };
                  },
                },
                cles: CLES,
                nouvelId: randomUUID,
              },
              async () => 'destinataire@envoi.partners.test'
            )(tx, n, texte, envoyeLe),
        })
      );
    } finally {
      for (const e of espions) e.mockRestore();
    }

    // Le chemin a bien porté les faits jusqu'au relais : le témoin ne passe pas à vide.
    expect(corpsRelayes.some((c) => c.includes(marqueur))).toBe(true);
    const courriels = await base.prisma.$queryRawUnsafe<{ l: string }[]>(
      `SELECT to_jsonb(c)::text AS l FROM courriels_envoyes c`
    );
    expect(courriels.length).toBeGreaterThan(0);
    expect(courriels.filter((c) => c.l.includes(marqueur))).toEqual([]);
    const faits = await base.prisma.$queryRawUnsafe<{ l: string }[]>(
      `SELECT to_jsonb(e)::text AS l FROM evenements e`
    );
    expect(faits.filter((e) => e.l.includes(marqueur))).toEqual([]);
    expect(sorties.filter((x) => x.includes(marqueur))).toEqual([]);
  });
});

describe('REQ-UX-016 — le passage envoie une fois, et le courriel survit à la purge', () => {
  it('REQ-UX-016 : TÉMOIN — le passage envoie une fois ; un second passage n’envoie rien ; une préférence inactive ne coupe pas une clé obligatoire', async () => {
    const apporteur = await unApporteur();
    await base.prisma.preferenceNotification.create({
      data: { apporteurId: apporteur, cle: 'decision_attribution', active: false, modifieeAt: T0 },
    });
    const id = await semer(apporteur, 'provisoire');
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(id);
    horloge = T0;
    await passage();
    await passage();
    const courriels = await courrielsDe(n!.id);
    expect(courriels.map((c) => c.statut)).toEqual(['envoye']);
    expect(courriels[0]).toMatchObject({ gabarit: 'decision_attribution', apporteurId: apporteur });
    expect(
      await refus(
        base.prisma.courrielEnvoye.create({
          data: {
            gabarit: 'decision_attribution',
            emailHash: hex(32),
            apporteurId: apporteur,
            statut: 'envoye',
            demandeAt: T0,
            envoyeAt: T0,
            notificationEspaceId: n!.id,
          },
        })
      )
    ).toMatch(/courriels_envoyes_un_par_notification|Unique constraint/);
  });

  it('REQ-UX-016 : TÉMOIN — la purge à douze mois supprime la notification envoyée ; le courriel reste, sans lien, son envoi intact', async () => {
    const apporteur = await unApporteur();
    const id = await semer(apporteur, 'provisoire');
    await transition({
      attributionId: id,
      transition: 'non_confirmee',
      acteur: SYSTEME,
      maintenant: T0,
    });
    const [n] = await notificationsDe(id);
    horloge = T0;
    await passage();
    const [courriel] = await courrielsDe(n!.id);
    await purgerLesNotificationsDeLEspace(app, new Date('2040-01-01T00:00:00.000Z'));
    expect(await base.prisma.notificationEspace.count({ where: { id: n!.id } })).toBe(0);
    const reste = await base.prisma.courrielEnvoye.findUniqueOrThrow({
      where: { id: courriel!.id },
    });
    expect(reste.notificationEspaceId).toBeNull();
    expect(reste.envoyeAt!.toISOString()).toBe(courriel!.envoyeAt!.toISOString());
  });
});
