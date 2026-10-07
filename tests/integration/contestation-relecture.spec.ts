// @req REQ-DM-043
/**
 * UX-P1-51 — l'apporteur relit SA contestation et la réponse d'Axion-IA, en base RÉELLE, sous le rôle
 * d'exécution (`partners_app`), comme en production. Les textes sont chiffrés par le vrai chiffrement
 * des PII, sous l'AAD de LEUR contestation et de LEUR champ.
 *
 * CE QUE LES TÉMOINS TIENNENT (condition de la lentille sécurité) :
 *   — l'apporteur de la session lit sa contestation, son écrit et la réponse, en clair ;
 *   — la contestation d'un AUTRE apporteur rend exactement la même réponse qu'un identifiant inconnu ;
 *   — un chiffré permuté entre deux contestations, ou entre le texte et la réponse, échoue au
 *     déchiffrement : la page dit « illisible », jamais un texte d'autrui ;
 *   — une contestation purgée n'est plus déchiffrée : il reste l'objet, la date et le statut ;
 *   — aucun texte n'atteint les journaux capturés pendant les lectures.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii, encryptPii } from '../../src/server/securite/pii';
import {
  MODELE_DE_LA_CONTESTATION,
  relireLaContestation,
} from '../../src/server/contestation/relire';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let adminId: string;
let moi: string;
let autre: string;
let monAttribution: string;

const CREATION = new Date('2026-10-03T08:00:00.000Z');
const RECUE = new Date('2026-10-03T09:00:00.000Z');
const REPONDUE = new Date('2026-10-10T14:00:00.000Z');
const MARQUEUR = `temoin-ux-p1-51-${randomUUID()}`;
const hex = (octets: number) => randomBytes(octets).toString('hex');

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-ux-p1-51-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});

const chiffrer = (id: string, champ: 'texteChiffre' | 'reponseChiffre', clair: string) =>
  Buffer.from(encryptPii({ modele: MODELE_DE_LA_CONTESTATION, champ, id }, clair, CLES));

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
        creeAt: CREATION,
      },
    })
  ).id;
}

async function uneAttribution(apporteurId: string, siren: string): Promise<string> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, raison_sociale, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'Boulangerie Démo du Lac',
       'espace', $4::uuid, '2026-10-01', false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
    id,
    apporteurId,
    siren,
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

/** Une contestation d'annulation, ses textes chiffrés sous SON id ; répondue si `reponse` est donnée. */
async function uneContestation(p: {
  apporteurId: string;
  attributionId: string;
  texte: string;
  reponse?: string;
}): Promise<string> {
  const id = randomUUID();
  const repondue = p.reponse !== undefined;
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO contestations (id, apporteur_id, objet, attribution_id, texte_chiffre, recue_at,
       reponse_chiffre, repondue_par_id, repondue_at)
     VALUES ($1::uuid, $2::uuid, 'annulation_attribution', $3::uuid, $4, $5, $6, $7::uuid, $8)`,
    id,
    p.apporteurId,
    p.attributionId,
    chiffrer(id, 'texteChiffre', p.texte),
    RECUE,
    repondue ? chiffrer(id, 'reponseChiffre', p.reponse!) : null,
    repondue ? adminId : null,
    repondue ? REPONDUE : null
  );
  return id;
}

const relire = (contestationId: string, apporteurId: string = moi) =>
  relireLaContestation(app, { contestationId, apporteurId }, CLES);

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
        publieeAt: CREATION,
        importeeAt: CREATION,
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
  moi = await unApporteur();
  autre = await unApporteur();
  monAttribution = await uneAttribution(moi, '552100554');
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

describe('REQ-DM-043 — l’apporteur relit sa contestation et la réponse, et seulement les siennes', () => {
  it('REQ-DM-043 : TÉMOIN — sa contestation répondue se relit en clair, avec son entreprise et ses dates', async () => {
    const id = await uneContestation({
      apporteurId: moi,
      attributionId: monAttribution,
      texte: 'Je conteste cette annulation.',
      reponse: 'L’annulation est maintenue.',
    });
    expect(await relire(id)).toEqual({
      etat: 'repondue',
      objet: 'annulation_attribution',
      entreprise: 'Boulangerie Démo du Lac',
      recueAt: RECUE,
      texte: 'Je conteste cette annulation.',
      reponse: 'L’annulation est maintenue.',
      repondueAt: REPONDUE,
    });
  });

  it('REQ-DM-043 : TÉMOIN — la contestation d’un AUTRE apporteur rend la même réponse qu’une inconnue', async () => {
    const sonAttribution = await uneAttribution(autre, '732829320');
    const sienne = await uneContestation({
      apporteurId: autre,
      attributionId: sonAttribution,
      texte: `Son écrit. ${MARQUEUR}`,
      reponse: 'Sa réponse.',
    });
    const autrui = await relire(sienne);
    const inconnue = await relire(randomUUID());
    expect(autrui).toEqual({ etat: 'indisponible' });
    expect(autrui).toEqual(inconnue);
    // Son propriétaire, lui, la lit : la ligne existe bien.
    expect((await relire(sienne, autre)).etat).toBe('repondue');
  });

  it('REQ-DM-043 : TÉMOIN — un chiffré permuté entre deux contestations échoue au déchiffrement', async () => {
    const a = await uneContestation({
      apporteurId: moi,
      attributionId: monAttribution,
      texte: 'A',
    });
    const b = await uneContestation({
      apporteurId: moi,
      attributionId: monAttribution,
      texte: `B ${MARQUEUR}`,
    });
    await base.prisma.$executeRawUnsafe(
      `UPDATE contestations SET texte_chiffre = (SELECT texte_chiffre FROM contestations WHERE id = $2::uuid)
       WHERE id = $1::uuid`,
      a,
      b
    );
    const r = await relire(a);
    expect(r).toEqual({ etat: 'illisible' });
    expect(JSON.stringify(r)).not.toContain(MARQUEUR);
  });

  it('REQ-DM-043 : TÉMOIN — le texte et la réponse permutés dans la MÊME contestation échouent au déchiffrement', async () => {
    const id = await uneContestation({
      apporteurId: moi,
      attributionId: monAttribution,
      texte: 'Mon écrit.',
      reponse: `La réponse. ${MARQUEUR}`,
    });
    await base.prisma.$executeRawUnsafe(
      `UPDATE contestations SET texte_chiffre = reponse_chiffre, reponse_chiffre = texte_chiffre
       WHERE id = $1::uuid`,
      id
    );
    const r = await relire(id);
    expect(r).toEqual({ etat: 'illisible' });
    expect(JSON.stringify(r)).not.toContain(MARQUEUR);
  });

  it('REQ-DM-043 : TÉMOIN — une contestation purgée garde son objet, sa date et son statut, et aucun texte', async () => {
    const id = await uneContestation({
      apporteurId: moi,
      attributionId: monAttribution,
      texte: 'Écrit purgé.',
      reponse: 'Réponse purgée.',
    });
    await base.prisma.$executeRawUnsafe(
      `UPDATE contestations SET texte_chiffre = NULL, reponse_chiffre = NULL, purgee_at = $2
       WHERE id = $1::uuid`,
      id,
      new Date('2031-10-10T14:00:00.000Z')
    );
    expect(await relire(id)).toEqual({
      etat: 'purgee',
      objet: 'annulation_attribution',
      entreprise: 'Boulangerie Démo du Lac',
      recueAt: RECUE,
      repondue: true,
    });
  });

  it('REQ-DM-043 : TÉMOIN — aucun texte n’atteint les journaux capturés pendant les lectures', async () => {
    const capture: string[] = [];
    const garder = (...a: unknown[]) => void capture.push(a.map(String).join(' '));
    const espions = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(garder)
    );
    const ecrire = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      capture.push(String(c));
      return true;
    });
    try {
      const id = await uneContestation({
        apporteurId: moi,
        attributionId: monAttribution,
        texte: `Écrit ${MARQUEUR}`,
        reponse: `Réponse ${MARQUEUR}`,
      });
      await relire(id);
      await relire(id, autre);
      await base.prisma.$executeRawUnsafe(
        `UPDATE contestations SET texte_chiffre = reponse_chiffre WHERE id = $1::uuid`,
        id
      );
      await relire(id);
    } finally {
      for (const e of espions) e.mockRestore();
      ecrire.mockRestore();
    }
    expect(capture.join('\n')).not.toContain(MARQUEUR);
  });
});
