// @req REQ-DM-008
// @req REQ-CPL-024
// @req REQ-DM-031
/**
 * DM-09 — la table `qualifications` en AJOUT SEUL, et l'écriture d'une qualification, sur une vraie
 * base (Testcontainers), sous le rôle d'exécution `partners_app`.
 *
 * CE QUE CE FICHIER GARDE (forme d'A02 du 2026-10-03) :
 *   1. chaque CHECK nommé refuse sa forme fautive ;
 *   2. le gabarit : une colonne non purgeable modifiée, une valeur purgée qui revient, une date de purge
 *      réécrite et un DELETE sont refusés sous `partners_app` ; TRUNCATE l'est sous le propriétaire ;
 *   3. REQ-CPL-024 : une version périmée est rejetée avec la version courante, et rien n'est écrit ;
 *   4. REQ-DM-008 : `non_confirme` éteint l'attribution dans la MÊME transaction ; `injoignable` la
 *      maintient et ne pose pas le premier contact ; un contact joint le pose.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { demarrerBase, type Base } from './harnais';
import {
  enregistrerUneQualification,
  type Saisie,
} from '../../src/server/qualification/enregistrer';
import { clesPii } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;
let auteurId: string;

const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 610000000;
const unSiren = () => String((sirens += 1));
const MAINTENANT = new Date('2026-10-03T12:00:00.000Z');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm-09-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});

const DECLENCHEUR = 'P0001';
const CONTRAINTE = '23514';

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
  auteurId = (
    await base.prisma.utilisateurConsole.create({
      data: { role: 'qualifieur', creeAt: MAINTENANT },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function uneAttribution(statut = 'provisoire'): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $5::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, false)`,
    id,
    apporteurId,
    unSiren(),
    grilleId,
    statut
  );
  return id;
}

/** Le SQLSTATE et le message d'un refus : chaque témoin juge LES DEUX. */
async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    const err = e as { code?: string; meta?: { code?: string }; message: string };
    return `${err.meta?.code ?? err.code ?? ''} ${err.message}`;
  }
  throw new Error('aucun refus');
}

/** Une qualification insérée directement (sous le propriétaire), pour juger les contraintes. */
async function inserer(attributionId: string, colonnes: Record<string, string> = {}) {
  const c = {
    resultat_contact: `'injoignable'`,
    prochaine_etape: `'aucune'`,
    motif_perte: 'NULL',
    rdv_at: 'NULL',
    rappeler_at: 'NULL',
    personne_interrogee_chiffre: `'\\x0102'::bytea`,
    termes_reponse_chiffre: `'\\x0304'::bytea`,
    ...colonnes,
  };
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO qualifications (id, attribution_id, resultat_contact, prochaine_etape, motif_perte,
       rdv_at, rappeler_at, personne_interrogee_chiffre, termes_reponse_chiffre, auteur_id)
     VALUES ($1::uuid, $2::uuid, ${c.resultat_contact}, ${c.prochaine_etape}, ${c.motif_perte},
       ${c.rdv_at}, ${c.rappeler_at}, ${c.personne_interrogee_chiffre}, ${c.termes_reponse_chiffre},
       $3::uuid)`,
    id,
    attributionId,
    auteurId
  );
  return id;
}

const saisie = (attributionId: string, p: Partial<Saisie> = {}): Saisie => ({
  attributionId,
  versionLue: 0,
  resultatContact: 'injoignable',
  interet: null,
  prochaineEtape: 'aucune',
  motifPerte: null,
  rdvAt: null,
  rappelerAt: null,
  personneInterrogee: 'Personne témoin',
  termesReponse: 'Termes témoins',
  auteurId,
  maintenant: MAINTENANT,
  cles: CLES,
  ...p,
});

describe('REQ-DM-008 — les contraintes nommées de la qualification', () => {
  it('REQ-DM-008 : TÉMOIN — chaque CHECK refuse sa forme fautive, nommé', async () => {
    const a = await uneAttribution();
    const cas: [Record<string, string>, string][] = [
      [{ prochaine_etape: `'perdue'` }, 'qualifications_perte_motivee'],
      [{ motif_perte: `'autre'` }, 'qualifications_perte_motivee'],
      [{ prochaine_etape: `'rdv'` }, 'qualifications_rdv_date'],
      [{ rdv_at: `now()` }, 'qualifications_rdv_date'],
      [{ prochaine_etape: `'rappeler'` }, 'qualifications_rappel_date'],
      [{ rappeler_at: `now()` }, 'qualifications_rappel_date'],
      [{ personne_interrogee_chiffre: `''::bytea` }, 'qualifications_personne_non_vide'],
      [{ termes_reponse_chiffre: `''::bytea` }, 'qualifications_termes_non_vides'],
    ];
    for (const [colonnes, nom] of cas) {
      const r = await refus(inserer(a, colonnes));
      expect([nom, r]).toEqual([nom, expect.stringContaining(nom)]);
      expect(r).toContain(CONTRAINTE);
    }
    // Contre-témoins : les formes justes passent.
    await inserer(a, { prochaine_etape: `'perdue'`, motif_perte: `'hors_cible'` });
    await inserer(a, { prochaine_etape: `'rdv'`, rdv_at: `now()` });
    await inserer(a, { prochaine_etape: `'rappeler'`, rappeler_at: `now()` });
  });

  it('REQ-DM-031 : TÉMOIN — la purge est datée : une date posée avec un bloc encore plein est refusée', async () => {
    const a = await uneAttribution();
    const q = await inserer(a);
    const r = await refus(
      app.$executeRawUnsafe(
        `UPDATE qualifications SET contact_purge_at = now() WHERE id = $1::uuid`,
        q
      )
    );
    expect(r).toContain('qualifications_purge_liee');
  });
});

describe('REQ-DM-008 — l’ajout seul, sous partners_app', () => {
  it('REQ-DM-008 : TÉMOIN — colonne non purgeable, valeur purgée qui revient, date réécrite, DELETE : refusés', async () => {
    const a = await uneAttribution();
    const q = await inserer(a);
    const maj = (sql: string) => app.$executeRawUnsafe(sql, q);
    expect(
      await refus(
        maj(`UPDATE qualifications SET resultat_contact = 'confirme' WHERE id = $1::uuid`)
      )
    ).toContain(DECLENCHEUR);
    // La purge autorisée : les deux blocs à NULL, la date posée une fois.
    await maj(
      `UPDATE qualifications SET personne_interrogee_chiffre = NULL, termes_reponse_chiffre = NULL, contact_purge_at = now() WHERE id = $1::uuid`
    );
    expect(
      await refus(
        maj(`UPDATE qualifications SET termes_reponse_chiffre = '\\x05'::bytea WHERE id = $1::uuid`)
      )
    ).toContain('ne se réécrit pas');
    expect(
      await refus(
        maj(
          `UPDATE qualifications SET contact_purge_at = now() + interval '1 day' WHERE id = $1::uuid`
        )
      )
    ).toContain('ne se réécrit pas');
    expect(await refus(maj(`DELETE FROM qualifications WHERE id = $1::uuid`))).toContain(
      'table en ajout seul'
    );
  });

  it('REQ-DM-008 : TÉMOIN — TRUNCATE est refusé, même sous le propriétaire', async () => {
    expect(await refus(base.prisma.$executeRawUnsafe(`TRUNCATE qualifications`))).toContain(
      'table en ajout seul'
    );
  });
});

describe('REQ-CPL-024 REQ-DM-008 — l’écriture d’une qualification et son effet, en une transaction', () => {
  it('REQ-CPL-024 : TÉMOIN — une version périmée est rejetée avec la courante, et rien n’est écrit', async () => {
    const a = await uneAttribution();
    const premiere = await app.$transaction((tx) => enregistrerUneQualification(tx, saisie(a)));
    expect(premiere).toMatchObject({ ok: true, version: 1 });
    const seconde = await app.$transaction((tx) =>
      enregistrerUneQualification(tx, saisie(a, { versionLue: 0 }))
    );
    expect(seconde).toEqual({ ok: false, motif: 'version_perimee', courante: 1 });
    expect(await base.prisma.qualification.count({ where: { attributionId: a } })).toBe(1);
  });

  it('REQ-DM-008 : TÉMOIN — non_confirme éteint l’attribution dans la même transaction', async () => {
    const a = await uneAttribution();
    const r = await app.$transaction((tx) =>
      enregistrerUneQualification(
        tx,
        saisie(a, { resultatContact: 'non_confirme', prochaineEtape: 'aucune' })
      )
    );
    expect(r).toMatchObject({ ok: true });
    const apres = await base.prisma.attribution.findUniqueOrThrow({ where: { id: a } });
    expect(apres.statut).not.toBe('provisoire');
    expect(apres.premierContactAt).toEqual(MAINTENANT);
  });

  it('REQ-DM-008 : TÉMOIN — injoignable maintient l’attribution et ne pose pas le premier contact', async () => {
    const a = await uneAttribution();
    await app.$transaction((tx) => enregistrerUneQualification(tx, saisie(a)));
    const apres = await base.prisma.attribution.findUniqueOrThrow({ where: { id: a } });
    expect([apres.statut, apres.premierContactAt]).toEqual(['provisoire', null]);
  });

  it('REQ-DM-008 : les données du tiers sont écrites CHIFFRÉES, jamais en clair', async () => {
    const a = await uneAttribution();
    const r = await app.$transaction((tx) => enregistrerUneQualification(tx, saisie(a)));
    if (!r.ok) throw new Error('refus inattendu');
    const [ligne] = await base.prisma.$queryRawUnsafe<{ p: Buffer; t: Buffer }[]>(
      `SELECT personne_interrogee_chiffre AS p, termes_reponse_chiffre AS t FROM qualifications WHERE id = $1::uuid`,
      r.qualificationId
    );
    expect(ligne?.p.toString('utf8')).not.toContain('Personne témoin');
    expect(ligne?.t.toString('utf8')).not.toContain('Termes témoins');
  });
});
