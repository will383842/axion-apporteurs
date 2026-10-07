// @req REQ-DM-027
// @req REQ-CPL-005
/**
 * Les pièces du KYC en base RÉELLE (DM-11, REQ-DM-027, HYP-DM06-IBAN).
 *
 * CE QUE LA BASE TIENT, CONTRE TOUT APPELANT :
 *   — l'échéance est obligatoire pour `vigilance` et `rc_pro` ;
 *   — l'IBAN n'existe que sur une pièce `rib`, bloc et empreinte ensemble, empreinte hexadécimale ;
 *   — au plus une pièce COURANTE et au plus une EN VÉRIFICATION par (apporteur, type) : un changement
 *     de RIB crée une pièce `a_verifier` pendant que l'ancienne reste courante ;
 *   — l'identité de facturation ne référence qu'une pièce `rib` (clé étrangère composite).
 * Les blocs sont factices, les empreintes tirées au hasard : aucune donnée réelle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { TYPES_A_ECHEANCE, TYPES_PIECE_KYC } from '../../src/domain/kyc/pieces';

let base: Base;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const ECHEANCE = new Date('2027-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
  await deuxAdministrateursDuRib(base.prisma);
  apporteurId = await unApporteur();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
    await base.prisma.apporteur.create({
      data: {
        statut: 'kyc_en_cours',
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
}

type Piece = {
  apporteur?: string;
  type: string;
  statut?: string;
  expireAt?: Date | null;
  remplaceeAt?: Date | null;
  ibanChiffre?: Buffer | null;
  ibanHash?: string | null;
};

/**
 * Un RIB VALIDE, tel que la base l'exige depuis la migration 004750 : il naît SANS regard, dans un
 * statut qui n'est pas `a_verifier` (il occupe donc le même index partiel qu'une pièce courante,
 * comme avant), puis un administrateur le vérifie et un AUTRE le confirme ; la confirmation le passe à
 * `valide`, dans la même écriture.
 */
/** Un client qui exécute du SQL paramétré : le propriétaire, `partners_app` ou une transaction. */
type ClientSql = { $executeRawUnsafe(sql: string, ...valeurs: unknown[]): Promise<number> };
const VERIFICATEUR_DU_RIB = randomUUID();
const CONFIRMATEUR_DU_RIB = randomUUID();

/** Les deux administrateurs actifs et validés des regards, sous le propriétaire. */
async function deuxAdministrateursDuRib(proprietaire: ClientSql) {
  for (const [id, par] of [
    [VERIFICATEUR_DU_RIB, null],
    [CONFIRMATEUR_DU_RIB, VERIFICATEUR_DU_RIB],
  ] as const) {
    await proprietaire.$executeRawUnsafe(
      `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at, valide_par_id)
       VALUES ($1::uuid, 'admin'::console_role, $2, $3, clock_timestamp(), clock_timestamp(), $4::uuid)`,
      id,
      randomBytes(40),
      randomBytes(32).toString('hex'),
      par
    );
  }
}

/** Les deux regards d'un RIB inséré sans eux : vérifié, puis confirmé et passé à `valide`. */
async function confirmerLeRib(client: ClientSql, id: string) {
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_verifie_par_id = $1::uuid, rib_verifie_at = clock_timestamp()
     WHERE id = $2::uuid`,
    VERIFICATEUR_DU_RIB,
    id
  );
  await client.$executeRawUnsafe(
    `UPDATE pieces_kyc SET rib_confirme_par_id = $1::uuid, rib_confirme_at = clock_timestamp(),
       statut = 'valide' WHERE id = $2::uuid`,
    CONFIRMATEUR_DU_RIB,
    id
  );
}

/** Une pièce par SQL brut : c'est la BASE qu'on juge. */
async function piece(p: Piece): Promise<string> {
  const id = randomUUID();
  const statut = p.statut ?? 'valide';
  const ribValide = p.type === 'rib' && statut === 'valide';
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO pieces_kyc (id, apporteur_id, type, statut, expire_at, remplacee_at, iban_chiffre, iban_hash)
     VALUES ($1::uuid, $2::uuid, $3::type_piece_kyc, $4::statut_piece_kyc, $5, $6, $7, $8)`,
    id,
    p.apporteur ?? apporteurId,
    p.type,
    ribValide ? 'refusee' : statut,
    p.expireAt ?? null,
    p.remplaceeAt ?? null,
    p.ibanChiffre ?? null,
    p.ibanHash ?? null
  );
  if (ribValide) await confirmerLeRib(base.prisma, id);
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

/**
 * Le refus d'UNICITÉ, avec le NOM de l'index. Une requête brute ne transmet que le code et le détail
 * (« Key (apporteur_id, type)=… already exists »), et les deux index partiels portent les MÊMES
 * colonnes : seul leur nom les distingue. Un message relevé ne revient pas non plus (Prisma rend
 * « Message: N/A » sous le code `23505`). Le refus est donc RENDU COMME UNE DONNÉE : une fonction
 * `pg_temp`, créée et appelée dans la MÊME transaction (une seule connexion : un objet temporaire est
 * invisible à travers le pool), tente l'insertion, attrape `unique_violation` et rend le SQLSTATE et
 * le CONSTRAINT_NAME lus dans le diagnostic. L'appel est paramétré ; aucune valeur n'est interpolée.
 */
async function refusDUnicite(p: {
  apporteur: string;
  type: 'siret' | 'rib';
  statut: 'valide' | 'a_verifier';
}): Promise<{ etat: string; contrainte: string | null }> {
  return base.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION pg_temp.essai_unicite(a uuid, t type_piece_kyc, s statut_piece_kyc, rib boolean)
      RETURNS text[] LANGUAGE plpgsql AS $f$
      DECLARE etat text; contrainte text;
      BEGIN
        INSERT INTO pieces_kyc (id, apporteur_id, type, statut, iban_chiffre, iban_hash)
        VALUES (gen_random_uuid(), a, t, s,
                CASE WHEN rib THEN decode(repeat('ab', 40), 'hex') END,
                CASE WHEN rib THEN repeat('a', 64) END);
        RETURN ARRAY['insere', ''];
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS etat = RETURNED_SQLSTATE, contrainte = CONSTRAINT_NAME;
        RETURN ARRAY[etat, coalesce(contrainte, '')];
      END $f$`);
    const [r] = await tx.$queryRaw<{ r: (string | null)[] }[]>`
      SELECT pg_temp.essai_unicite(${p.apporteur}::uuid, ${p.type}::type_piece_kyc,
                                   ${p.statut}::statut_piece_kyc, ${p.type === 'rib'}) AS r`;
    return { etat: String(r!.r[0]), contrainte: r!.r[1] || null };
  });
}

describe('REQ-DM-027 — les formes d’une pièce du KYC', () => {
  it.each([...TYPES_PIECE_KYC])(
    'REQ-DM-027 : %s — l’échéance est exigée pour vigilance et rc_pro, et pour eux seuls',
    async (type) => {
      const a = await unApporteur();
      if ((TYPES_A_ECHEANCE as readonly string[]).includes(type)) {
        expect(await refus(piece({ apporteur: a, type, expireAt: null }))).toContain(
          'pieces_kyc_echeance_requise'
        );
        await expect(piece({ apporteur: a, type, expireAt: ECHEANCE })).resolves.toBeTruthy();
      } else {
        await expect(piece({ apporteur: a, type, expireAt: null })).resolves.toBeTruthy();
      }
    }
  );

  it('REQ-DM-027 : l’IBAN n’existe que sur une pièce rib, bloc et empreinte ensemble, empreinte hexadécimale', async () => {
    const a = await unApporteur();
    const iban = { ibanChiffre: randomBytes(40), ibanHash: hex(32) };
    expect(await refus(piece({ apporteur: a, type: 'identite', ...iban }))).toContain(
      'pieces_kyc_iban_sur_rib'
    );
    expect(
      await refus(
        piece({ apporteur: a, type: 'rib', ibanChiffre: randomBytes(40), ibanHash: null })
      )
    ).toContain('pieces_kyc_iban_ensemble');
    expect(
      await refus(
        piece({ apporteur: a, type: 'rib', ibanChiffre: randomBytes(40), ibanHash: 'Z'.repeat(64) })
      )
    ).toContain('pieces_kyc_iban_hash_hex');
    await expect(piece({ apporteur: a, type: 'rib', ...iban })).resolves.toBeTruthy();
  });
});

describe('REQ-DM-027 — une pièce courante et une en vérification, au plus, par type', () => {
  it('REQ-DM-027 : deux pièces COURANTES du même type sont refusées ; une remplacée laisse la place', async () => {
    const a = await unApporteur();
    await piece({ apporteur: a, type: 'siret' });
    const courante = await refusDUnicite({ apporteur: a, type: 'siret', statut: 'valide' });
    expect(courante).toStrictEqual({ etat: '23505', contrainte: 'pieces_kyc_une_courante' });
    // Une pièce remplacée ne compte plus : la nouvelle passe.
    await base.prisma.$executeRawUnsafe(
      `UPDATE pieces_kyc SET remplacee_at = $2 WHERE apporteur_id = $1::uuid AND type = 'siret'`,
      a,
      MAINTENANT
    );
    await expect(piece({ apporteur: a, type: 'siret' })).resolves.toBeTruthy();
    // Un autre apporteur n'est pas gêné.
    await expect(piece({ apporteur: await unApporteur(), type: 'siret' })).resolves.toBeTruthy();
  });

  it('REQ-DM-027 : un changement de RIB — une pièce en vérification coexiste avec la courante, deux en vérification sont refusées', async () => {
    const a = await unApporteur();
    const iban = () => ({ ibanChiffre: randomBytes(40), ibanHash: hex(32) });
    await piece({ apporteur: a, type: 'rib', ...iban() });
    await expect(
      piece({ apporteur: a, type: 'rib', statut: 'a_verifier', ...iban() })
    ).resolves.toBeTruthy();
    const enVerification = await refusDUnicite({ apporteur: a, type: 'rib', statut: 'a_verifier' });
    expect(enVerification).toStrictEqual({
      etat: '23505',
      contrainte: 'pieces_kyc_une_en_verification',
    });
  });
});

describe('REQ-CPL-005 — l’identité de facturation référence une pièce rib, et seulement elle', () => {
  const identite = (a: string, pieceKycId: string | null, type: string | null = null) =>
    base.prisma.$executeRawUnsafe(
      `INSERT INTO identites_facturation (id, apporteur_id, siren, regime_tva, debut_at, piece_kyc_id${type ? ', piece_kyc_type' : ''})
       VALUES ($1::uuid, $2::uuid, '000000001', 'franchise_293b', $3, $4::uuid${type ? ', $5::type_piece_kyc' : ''})`,
      ...[randomUUID(), a, MAINTENANT, pieceKycId, ...(type ? [type] : [])]
    );

  it('REQ-CPL-005 : une pièce rib est acceptée ; une pièce d’un autre type est refusée par la clé composite', async () => {
    const a = await unApporteur();
    const rib = await piece({
      apporteur: a,
      type: 'rib',
      ibanChiffre: randomBytes(40),
      ibanHash: hex(32),
    });
    const autre = await piece({ apporteur: a, type: 'identite' });
    await expect(identite(a, rib)).resolves.toBe(1);
    expect(await refus(identite(a, autre))).toContain('identites_facturation_piece_rib_fkey');
  });

  it('REQ-CPL-005 : TÉMOIN — la pièce rib d’un AUTRE apporteur est refusée par la base, sur le nom de la clé', async () => {
    const a = await unApporteur();
    const b = await unApporteur();
    const ribDeB = await piece({
      apporteur: b,
      type: 'rib',
      ibanChiffre: randomBytes(40),
      ibanHash: hex(32),
    });
    const r = await refus(identite(a, ribDeB));
    expect(r).toContain('23503');
    expect(r).toContain('identites_facturation_piece_rib_fkey');
    await expect(identite(b, ribDeB)).resolves.toBe(1);
  });

  it('REQ-CPL-005 : le type de la référence ne peut valoir que rib ; une identité sans pièce reste admise', async () => {
    const a = await unApporteur();
    const tva = await piece({ apporteur: a, type: 'tva' });
    expect(await refus(identite(a, tva, 'tva'))).toContain(
      'identites_facturation_piece_kyc_est_un_rib'
    );
    await expect(identite(a, null)).resolves.toBe(1);
  });
});
