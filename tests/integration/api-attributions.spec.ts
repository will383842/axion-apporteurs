// @req REQ-INT-014
/**
 * INT-T07-P — le lecteur de l'API 1 sur une VRAIE base, sous le rôle d'exécution.
 *
 * Ce que le fichier juge, que le faux client des tests unitaires ne peut pas juger :
 *   — la lecture passe sous `partners_app` (les droits du rôle d'exécution suffisent) ;
 *   — les noms CHIFFRÉS par la base de chiffrement se relisent sous le bon modèle et le bon champ ;
 *   — seule l'attribution qui OCCUPE le SIREN est lue : une attribution terminée sur le même SIREN
 *     ne fait pas « attribuee » ;
 *   — un apporteur et un conseiller salarié rendent la même forme (W19), avec une référence
 *     opaque, stable, qui ne contient aucun identifiant interne.
 *
 * Le conseiller : le rôle `conseiller_salarie` n'existe pas encore dans `console_role` ;
 * son attribution se pose dans une transaction ANNULÉE, déclencheur du rôle neutralisé, comme dans
 * `index-partiel.spec.ts`. La lecture se fait dans la même transaction, sous `partners_app`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  MODELE_APPORTEUR,
  MODELE_UTILISATEUR_CONSOLE,
} from '../../src/server/auth/lien-magique-depot';
import {
  lecteurDeLaBase,
  referenceOpaque,
} from '../../src/server/integrations/axionia/attributions-dto';
import { schemaReponseAttribution } from '../../src/server/integrations/axionia/api-entrante';

let base: Base;
let app: PrismaClient;
let grilleId: string;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 770000000;
const unSiren = () => String((sirens += 1));

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t07-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});
const CLE_REFERENCE = { APPORTEUR_REF_KEY: 'temoin-int-t07-reference-'.padEnd(48, '0') };
const DEPS = { cles: CLES, cleReference: CLE_REFERENCE, signaler: () => {} };

const chiffrer = (modele: string, champ: string, id: string, clair: string) =>
  Buffer.from(encryptPii({ modele, champ, id }, clair, CLES));

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
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Un apporteur signé, dont le prénom et le nom sont chiffrés comme le fait le dépôt. */
async function unApporteur(prenom: string | null, nom: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      id,
      statut: 'signe',
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: MAINTENANT,
      prenomChiffre:
        prenom === null ? null : chiffrer(MODELE_APPORTEUR, 'prenomChiffre', id, prenom),
      nomChiffre: chiffrer(MODELE_APPORTEUR, 'nomChiffre', id, nom),
    },
  });
  return id;
}

type Client = Pick<PrismaClient, '$executeRawUnsafe'>;

/** Une attribution par SQL brut : c'est la BASE qu'on lit. */
async function uneAttribution(
  client: Client,
  l: {
    siren: string;
    statut: string;
    apporteurId?: string;
    conseillerId?: string;
    fenetreFinAt?: Date | null;
    peremptionAt?: Date | null;
  }
): Promise<void> {
  const conseiller = l.conseillerId !== undefined;
  await client.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, utilisateur_console_id, statut, siren, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       lien_interet_declare, fenetre_fin_at, peremption_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::etat_attribution, $5, $6::canal_depot, $7::uuid,
       '2026-10-01', false, false, false, $8::timestamptz, $9::timestamptz)`,
    randomUUID(),
    l.apporteurId ?? null,
    l.conseillerId ?? null,
    l.statut,
    l.siren,
    conseiller ? 'console' : 'espace',
    conseiller ? null : grilleId,
    l.fenetreFinAt ?? null,
    l.peremptionAt ?? null
  );
}

const annulee = new Error('transaction annulée exprès');

/**
 * Pose une attribution de conseiller et la lit, dans une transaction ANNULÉE : le déclencheur
 * du rôle est neutralisé (le rôle `conseiller_salarie` n'existe pas encore), et la lecture
 * passe sous `partners_app` (`SET LOCAL ROLE`).
 */
async function dansUneTransactionAnnulee<T>(
  corps: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
  let rendu: T | undefined;
  await base.prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE attributions DISABLE TRIGGER attributions_porteur_conseiller'
      );
      rendu = await corps(tx);
      throw annulee;
    })
    .catch((e: unknown) => {
      if (e !== annulee) throw e;
    });
  return rendu as T;
}

async function unConseiller(client: Client, nom: string): Promise<string> {
  const id = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, nom_chiffre, cree_at)
     VALUES ($1::uuid, 'qualifieur'::console_role, '\\x01'::bytea, $2, $3, $4)`,
    id,
    hex(32),
    chiffrer(MODELE_UTILISATEUR_CONSOLE, 'nomChiffre', id, nom),
    MAINTENANT
  );
  return id;
}

describe('REQ-INT-014 — le lecteur de l’API 1, sur la base, sous le rôle d’exécution', () => {
  it('REQ-INT-014 : un SIREN sans attribution est libre (le lecteur rend null)', async () => {
    expect(await lecteurDeLaBase(app, DEPS)(unSiren())).toBeNull();
  });

  it('REQ-INT-014 : une attribution active d’apporteur rend attribuee, le mois de fin de fenêtre à Paris, le prénom et l’initiale', async () => {
    const siren = unSiren();
    const apporteurId = await unApporteur('Anne-Marie', 'le Gall');
    await uneAttribution(base.prisma, {
      siren,
      statut: 'active',
      apporteurId,
      // 23 h 30 UTC le 31 octobre : déjà novembre à Paris.
      fenetreFinAt: new Date('2026-10-31T23:30:00.000Z'),
      peremptionAt: new Date('2026-12-15T10:00:00.000Z'),
    });
    const r = await lecteurDeLaBase(app, DEPS)(siren);
    expect(r).toEqual({
      statut: 'attribuee',
      until: '2026-11',
      apporteurRef: referenceOpaque('apporteur', apporteurId, CLE_REFERENCE),
      nomAffichable: 'Anne-Marie L.',
    });
    expect(schemaReponseAttribution.safeParse(r).success).toBe(true);
    expect(JSON.stringify(r)).not.toContain(apporteurId);
  });

  it('REQ-INT-014 : une active confirmée (fenêtre et péremption) rend le mois de la fenêtre ; une provisoire n’a pas de fin ; une convertie rend cliente, sans until, le porteur nommé', async () => {
    const apporteurId = await unApporteur('Paul', 'Durand');
    const active = unSiren();
    await uneAttribution(base.prisma, {
      siren: active,
      statut: 'active',
      apporteurId,
      fenetreFinAt: new Date('2027-04-03T08:00:00.000Z'),
      peremptionAt: new Date('2027-01-10T12:00:00.000Z'),
    });
    expect(await lecteurDeLaBase(app, DEPS)(active)).toMatchObject({ until: '2027-04' });

    // Une `provisoire` n'a jamais de fin (machine.ts) : `attribuee`, `until` nul, aucune alerte.
    const provisoire = unSiren();
    await uneAttribution(base.prisma, { siren: provisoire, statut: 'provisoire', apporteurId });
    const signaux: unknown[] = [];
    expect(
      await lecteurDeLaBase(app, { ...DEPS, signaler: (x) => signaux.push(x) })(provisoire)
    ).toMatchObject({ statut: 'attribuee', until: null, nomAffichable: 'Paul D.' });
    expect(signaux).toEqual([]);

    const convertie = unSiren();
    await uneAttribution(base.prisma, {
      siren: convertie,
      statut: 'convertie',
      apporteurId,
      fenetreFinAt: new Date('2027-03-01T12:00:00.000Z'),
    });
    expect(await lecteurDeLaBase(app, DEPS)(convertie)).toEqual({
      statut: 'cliente',
      until: null,
      apporteurRef: referenceOpaque('apporteur', apporteurId, CLE_REFERENCE),
      nomAffichable: 'Paul D.',
    });
  });

  it('REQ-INT-014 : une attribution terminée n’occupe pas le SIREN — seule l’occupante est lue', async () => {
    const ancien = await unApporteur('Luc', 'Martin');
    const actuel = await unApporteur('Inès', 'Roux');
    const siren = unSiren();
    await uneAttribution(base.prisma, { siren, statut: 'perimee', apporteurId: ancien });
    expect(await lecteurDeLaBase(app, DEPS)(siren)).toBeNull();
    await uneAttribution(base.prisma, {
      siren,
      statut: 'active',
      apporteurId: actuel,
      fenetreFinAt: new Date('2027-02-01T12:00:00.000Z'),
    });
    expect(await lecteurDeLaBase(app, DEPS)(siren)).toMatchObject({
      nomAffichable: 'Inès R.',
      apporteurRef: referenceOpaque('apporteur', actuel, CLE_REFERENCE),
    });
  });

  it('REQ-INT-014 : un conseiller salarié rend la MÊME forme qu’un apporteur (W19), sous partners_app', async () => {
    const siren = unSiren();
    const { r, conseillerId } = await dansUneTransactionAnnulee(async (tx) => {
      const id = await unConseiller(tx, 'Claire Dupont');
      await uneAttribution(tx, {
        siren,
        statut: 'active',
        conseillerId: id,
        fenetreFinAt: new Date('2027-04-15T12:00:00.000Z'),
      });
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE_D_EXECUTION}`);
      return { r: await lecteurDeLaBase(tx, DEPS)(siren), conseillerId: id };
    });
    expect(r).toEqual({
      statut: 'attribuee',
      until: '2027-04',
      apporteurRef: referenceOpaque('console', conseillerId, CLE_REFERENCE),
      nomAffichable: 'Claire D.',
    });
    expect(schemaReponseAttribution.safeParse(r).success).toBe(true);
    expect(Object.keys(r!).sort()).toEqual(
      ['apporteurRef', 'nomAffichable', 'statut', 'until'].sort()
    );
  });

  it('REQ-INT-014 : un apporteur sans prénom en base répond `attribuee`, nom nul, et l’alerte technique est levée (A02)', async () => {
    const siren = unSiren();
    const apporteurId = await unApporteur(null, 'Durand');
    await uneAttribution(base.prisma, {
      siren,
      statut: 'active',
      apporteurId,
      fenetreFinAt: new Date('2027-05-10T12:00:00.000Z'),
    });
    const signaux: unknown[] = [];
    const r = await lecteurDeLaBase(app, { ...DEPS, signaler: (s) => signaux.push(s) })(siren);
    expect(r).toEqual({
      statut: 'attribuee',
      until: '2027-05',
      apporteurRef: referenceOpaque('apporteur', apporteurId, CLE_REFERENCE),
      nomAffichable: null,
    });
    expect(schemaReponseAttribution.safeParse(r).success).toBe(true);
    expect(signaux).toEqual([{ genre: 'nom_affichable_indisponible', nombre: 1 }]);
  });

  it('REQ-INT-014 : un nom chiffré sous une autre clé est illisible — le lecteur lève, il ne rend ni libre ni un nom', async () => {
    const siren = unSiren();
    const apporteurId = await unApporteur('Zoé', 'Petit');
    await uneAttribution(base.prisma, { siren, statut: 'active', apporteurId });
    const autres = clesPii({
      NODE_ENV: 'test',
      ...Object.fromEntries(
        NOMS_DES_SECRETS.map((n) => [n, `autre-int-t07-${n.toLowerCase()}-`.padEnd(48, '0')])
      ),
      PII_ENCRYPTION_KEY: 'f'.repeat(64),
    });
    await expect(lecteurDeLaBase(app, { ...DEPS, cles: autres })(siren)).rejects.toThrow();
  });
});
