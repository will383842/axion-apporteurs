// @req REQ-UX-027
// @req REQ-DM-027
/**
 * CPL-T24 — le RIB à quatre yeux, en base RÉELLE. Les gestes passent sous `partners_app`, provisionné
 * comme en production ; les fixtures et les écritures qui ATTAQUENT la base passent sous le
 * propriétaire, car c'est la base qu'on juge contre tout appelant.
 *
 * CE QUE CE FICHIER GARDE (forme d'A02, rattrapages 105 et 106 ; conditions de la sécurité) :
 *  — une vérification puis une confirmation par deux administrateurs validés passent, et la pièce
 *    devient `valide` dans l'écriture de la confirmation, une fois ;
 *  — la même personne pour les deux regards, une confirmation sans vérification, un regard réécrit,
 *    un regard d'un non-administrateur, d'un administrateur en attente ou désactivé, un RIB `valide`
 *    sans confirmation, un INSERT qui poserait un regard : refusés par la base ;
 *  — une pièce rib ne revient pas à `valide` depuis un autre statut, alors qu'une pièce d'identité le
 *    peut ;
 *  — l'auteur de l'ouverture du dossier est refusé, relu au journal ;
 *  — le juge du versement : la pièce conforme passe ; remplacée, d'un autre apporteur, d'une autre
 *    empreinte, à vérifier ou validée par une seule personne : `rib_non_valide`.
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
  ErreurRibQuatreYeux,
  RibNonValide,
  confirmerUnRib,
  exigerUnRibVersable,
  verifierUnRib,
} from '../../src/server/conformite/rib';
import { ouvrirLeKyc, type ActeurDuDossier } from '../../src/server/conformite/dossier';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { clesPii, colonnesPii, empreinteRecherche } from '../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`. */
let app: PrismaClient;

const T0 = new Date('2027-03-01T08:00:00.000Z');
const MAINTENANT = new Date('2027-03-01T10:00:00.000Z');
const PLUS_TARD = new Date('2027-03-01T11:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

/**
 * Un IBAN français de TEST, fabriqué à l'exécution depuis des numéros fictifs : la clé RIB et la clé
 * de contrôle sont calculées, aucune coordonnée réelle n'est écrite dans le dépôt (`gov:entite`).
 */
function ibanDeTest(banque: string, guichet: string, compte: string): string {
  const reste = (chiffres: string) => [...chiffres].reduce((r, c) => (r * 10 + Number(c)) % 97, 0);
  const cle = 97 - ((89 * Number(banque) + 15 * Number(guichet) + 3 * Number(compte)) % 97);
  const bban = `${banque}${guichet}${compte}${String(cle).padStart(2, '0')}`;
  // « FR » vaut 15 27 ; la clé de contrôle est 98 moins le reste de (bban + FR00) modulo 97.
  const controle = 98 - reste(`${bban}152700`);
  return `FR${String(controle).padStart(2, '0')}${bban}`;
}
const cles = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-cpl-t24-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});
const IBAN = ibanDeTest('90001', '00002', '00000012345');
const AUTRE_IBAN = ibanDeTest('90001', '00002', '00000067890');

/** Les utilisateurs de la console : deux administrateurs validés, et ceux que la garde refuse. */
const U = {
  premier: randomUUID(),
  a1: randomUUID(),
  a2: randomUUID(),
  attente: randomUUID(),
  desactive: randomUUID(),
  qualifieur: randomUUID(),
};
const admin = (id: string): ActeurDuDossier => ({ id, role: 'admin' });

async function unUtilisateur(
  id: string,
  role: 'admin' | 'qualifieur',
  o: { valideAt?: Date | null; valideParId?: string | null; desactiveAt?: Date | null } = {}
) {
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO "utilisateurs_console" ("id","role","email_chiffre","email_hash","cree_at","valide_at","valide_par_id","desactive_at")
     VALUES ($1::uuid, $2::console_role, $3, $4, $5, $6, $7::uuid, $8)`,
    id,
    role,
    randomBytes(40),
    hex(32),
    T0,
    o.valideAt ?? null,
    o.valideParId ?? null,
    o.desactiveAt ?? null
  );
}

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = hex(24);
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  // Le premier administrateur se valide seul ; les autres le sont par lui (SEC-30).
  await unUtilisateur(U.premier, 'admin', { valideAt: T0 });
  for (const id of [U.a1, U.a2])
    await unUtilisateur(id, 'admin', { valideAt: T0, valideParId: U.premier });
  await unUtilisateur(U.attente, 'admin');
  await unUtilisateur(U.desactive, 'admin', {
    valideAt: T0,
    valideParId: U.premier,
    desactiveAt: T0,
  });
  await unUtilisateur(U.qualifieur, 'qualifieur');
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(statut: 'retenu' | 'kyc_en_cours' = 'kyc_en_cours'): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      ...(colonnesPii(
        { modele: MODELE_APPORTEUR, id },
        { nom: 'Témoin', prenom: 'Rib', email: `r-${hex(4)}@exemple.test` },
        cles
      ) as object),
      id,
      statut,
      codeParrainage: `AX${hex(3).toUpperCase()}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: T0,
    },
  });
  return id;
}

/** Une pièce RIB, à vérifier, à l'empreinte de `iban`, posée par SQL brut. */
async function unRib(apporteurId: string, iban = IBAN, statut = 'a_verifier'): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, 'rib', $3::statut_piece_kyc, $4, $5)`,
    id,
    apporteurId,
    statut,
    randomBytes(40),
    empreinteRecherche('iban', iban, cles)
  );
  return id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    if (e instanceof ErreurRibQuatreYeux) return e.motif;
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const piece = (id: string) => base.prisma.pieceKyc.findUniqueOrThrow({ where: { id } });
const ecrire = (sql: string, ...valeurs: unknown[]) =>
  base.prisma.$executeRawUnsafe(sql, ...valeurs);

/** Un RIB vérifié par le premier administrateur et confirmé par le second, par les gestes du serveur. */
async function unRibValide(apporteurId: string, iban = IBAN): Promise<string> {
  const id = await unRib(apporteurId, iban);
  await verifierUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: MAINTENANT });
  await confirmerUnRib(app, { acteur: admin(U.a2), pieceId: id, maintenant: PLUS_TARD });
  return id;
}

describe('REQ-UX-027 — deux regards distincts rendent un RIB valide, une fois', () => {
  it('REQ-UX-027 : TÉMOIN — une vérification puis une confirmation par deux administrateurs passent ; la pièce devient valide dans l’écriture de la confirmation', async () => {
    const a = await unApporteur();
    const id = await unRib(a);
    await verifierUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: MAINTENANT });
    expect(await piece(id)).toMatchObject({
      statut: 'a_verifier',
      ribVerifieParId: U.a1,
      ribVerifieAt: MAINTENANT,
      ribConfirmeAt: null,
    });
    await confirmerUnRib(app, { acteur: admin(U.a2), pieceId: id, maintenant: PLUS_TARD });
    expect(await piece(id)).toMatchObject({
      statut: 'valide',
      verifieeAt: PLUS_TARD,
      ribConfirmeParId: U.a2,
      ribConfirmeAt: PLUS_TARD,
    });
    const [e] = await base.prisma.evenement.findMany({
      where: { agregatId: id, type: 'piece_kyc_statut_modifie' },
    });
    expect(e!.charge).toEqual({
      de: 'a_verifier',
      vers: 'valide',
      type: 'rib',
      acteur: { par: 'utilisateur_console', id: U.a2 },
    });
  });

  it('REQ-UX-027 : TÉMOIN — la confirmation d’un nouveau RIB écarte l’ancien du service', async () => {
    const a = await unApporteur();
    const ancien = await unRibValide(a);
    const nouveau = await unRibValide(a, AUTRE_IBAN);
    expect((await piece(ancien)).remplaceeAt).toEqual(PLUS_TARD);
    expect(await piece(nouveau)).toMatchObject({ statut: 'valide', remplaceeAt: null });
  });
});

describe('REQ-DM-027 — la base refuse, contre tout appelant (garde et CHECK)', () => {
  it('REQ-DM-027 : TÉMOIN — la même personne pour les deux regards est refusée (CHECK)', async () => {
    const id = await unRib(await unApporteur());
    await ecrire(
      `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = $2 WHERE id = $3::uuid`,
      U.a1,
      MAINTENANT,
      id
    );
    expect(
      await refus(
        ecrire(
          `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = $2, statut = 'valide' WHERE id = $3::uuid`,
          U.a1,
          PLUS_TARD,
          id
        )
      )
    ).toContain('pieces_kyc_rib_confirmation_apres_verification');
  });

  it('REQ-DM-027 : TÉMOIN — une confirmation sans vérification est refusée (CHECK)', async () => {
    const id = await unRib(await unApporteur());
    expect(
      await refus(
        ecrire(
          `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = $2, statut = 'valide' WHERE id = $3::uuid`,
          U.a2,
          PLUS_TARD,
          id
        )
      )
    ).toContain('pieces_kyc_rib_confirmation_apres_verification');
  });

  it('REQ-DM-027 : TÉMOIN — un regard d’un non-administrateur, d’un administrateur en attente ou désactivé est refusé (garde)', async () => {
    for (const qui of [U.qualifieur, U.attente, U.desactive]) {
      const id = await unRib(await unApporteur());
      expect(
        await refus(
          ecrire(
            `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = $2 WHERE id = $3::uuid`,
            qui,
            MAINTENANT,
            id
          )
        ),
        qui
      ).toContain('la vérification exige un administrateur actif et validé');
    }
  });

  it('REQ-DM-027 : TÉMOIN — un regard réécrit est refusé (garde)', async () => {
    const id = await unRib(await unApporteur());
    await ecrire(
      `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = $2 WHERE id = $3::uuid`,
      U.a1,
      MAINTENANT,
      id
    );
    expect(
      await refus(
        ecrire(`UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid WHERE id = $2::uuid`, U.a2, id)
      )
    ).toContain('ne se réécrit pas');
  });

  it('REQ-DM-027 : TÉMOIN — un RIB inséré valide, ou passé à valide sans sa confirmation, est refusé', async () => {
    const a = await unApporteur();
    expect(await refus(unRib(a, IBAN, 'valide'))).toContain('pieces_kyc_rib_valide_si_confirme');
    const id = await unRib(a);
    await ecrire(
      `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = $2 WHERE id = $3::uuid`,
      U.a1,
      MAINTENANT,
      id
    );
    expect(
      await refus(ecrire(`UPDATE pieces_kyc SET statut = 'valide' WHERE id = $1::uuid`, id))
    ).toContain('ne devient valide que par sa confirmation');
  });

  it('REQ-DM-027 : TÉMOIN — un INSERT qui pose un regard est refusé (garde, à l’INSERT)', async () => {
    const a = await unApporteur();
    expect(
      await refus(
        ecrire(
          `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash, rib_verifie_par_id, rib_verifie_at)
           VALUES ($1::uuid, $2::uuid, 'rib', 'a_verifier', $3, $4, $5::uuid, $6)`,
          randomUUID(),
          a,
          randomBytes(40),
          empreinteRecherche('iban', IBAN, cles),
          U.a1,
          MAINTENANT
        )
      )
    ).toContain('une pièce naît sans vérification ni confirmation');
  });

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — un RIB valide puis périmé ne redevient pas valide ; une pièce d’identité, si', async () => {
    const a = await unApporteur();
    const rib = await unRibValide(a);
    await ecrire(`UPDATE pieces_kyc SET statut = 'perimee' WHERE id = $1::uuid`, rib);
    expect(
      await refus(ecrire(`UPDATE pieces_kyc SET statut = 'valide' WHERE id = $1::uuid`, rib))
    ).toContain('ne devient valide que par sa confirmation');
    const identite = randomUUID();
    await ecrire(
      `INSERT INTO pieces_kyc (id, apporteur_id, type, statut) VALUES ($1::uuid, $2::uuid, 'identite', 'valide')`,
      identite,
      a
    );
    await ecrire(`UPDATE pieces_kyc SET statut = 'perimee' WHERE id = $1::uuid`, identite);
    await ecrire(`UPDATE pieces_kyc SET statut = 'valide' WHERE id = $1::uuid`, identite);
    expect((await piece(identite)).statut).toBe('valide');
  });
});

describe('REQ-UX-027 — les gestes du serveur refusent, nommés', () => {
  it('REQ-UX-027 : TÉMOIN À DEUX FACES — l’auteur de l’ouverture du dossier, relu au journal, est refusé ; un autre administrateur vérifie', async () => {
    const a = await unApporteur('retenu');
    await ouvrirLeKyc(app, { acteur: admin(U.a1), apporteurId: a, maintenant: T0 });
    const id = await unRib(a);
    expect(
      await refus(verifierUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: MAINTENANT }))
    ).toBe('auteur_de_l_ouverture');
    await verifierUnRib(app, { acteur: admin(U.a2), pieceId: id, maintenant: MAINTENANT });
    expect(
      await refus(confirmerUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: PLUS_TARD }))
    ).toBe('auteur_de_l_ouverture');
  });

  it('REQ-UX-027 : la même personne aux deux regards est refusée par le serveur, avant la base', async () => {
    const id = await unRib(await unApporteur());
    await verifierUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: MAINTENANT });
    expect(
      await refus(confirmerUnRib(app, { acteur: admin(U.a1), pieceId: id, maintenant: PLUS_TARD }))
    ).toBe('meme_regard');
  });
});

describe('REQ-UX-027 — aucun versement vers un RIB non validé', () => {
  const juger = (pieceId: string, apporteurId: string, ibanPaye = IBAN) =>
    app.$transaction((tx) => exigerUnRibVersable(tx, { pieceId, apporteurId, ibanPaye, cles }));
  const fermé = async (p: Promise<unknown>) =>
    p.then(
      () => 'aucun refus',
      (e: unknown) => (e instanceof RibNonValide ? e.message : String(e))
    );

  it('REQ-UX-027 : TÉMOIN — la pièce confirmée, non remplacée, au bon apporteur et à la bonne empreinte passe', async () => {
    const a = await unApporteur();
    const id = await unRibValide(a);
    await expect(juger(id, a)).resolves.toBeUndefined();
  });

  it('REQ-UX-027 : TÉMOIN À DEUX FACES — remplacée, d’un autre apporteur, d’une autre empreinte, à vérifier, ou validée par une seule personne : rib_non_valide', async () => {
    const a = await unApporteur();
    const remplacee = await unRibValide(a);
    await unRibValide(a, AUTRE_IBAN);
    expect(await fermé(juger(remplacee, a))).toBe('rib_non_valide');

    const b = await unApporteur();
    const deB = await unRibValide(b);
    expect(await fermé(juger(deB, a))).toBe('rib_non_valide');
    expect(await fermé(juger(deB, b, AUTRE_IBAN))).toBe('rib_non_valide');

    const c = await unApporteur();
    const aVerifier = await unRib(c);
    expect(await fermé(juger(aVerifier, c))).toBe('rib_non_valide');
    await verifierUnRib(app, { acteur: admin(U.a1), pieceId: aVerifier, maintenant: MAINTENANT });
    expect(await fermé(juger(aVerifier, c))).toBe('rib_non_valide');
  });
});
