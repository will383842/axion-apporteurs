// @req REQ-DM-064
/**
 * DM-49, en base RÉELLE — `attributions.idcc_saisi` : l'IDCC facultatif de quatre chiffres.
 *
 * CE QU'IL PROUVE :
 *   1. LA BASE REFUSE ce qui n'est pas quatre chiffres : « 44 » (trop court) et « 00A4 » (une lettre) ;
 *      le refus nomme la contrainte. Le CHECK porte sur le TEXTE de la valeur, où le remplissage de
 *      `CHAR(4)` ne compte pas.
 *   2. LES ZÉROS DE TÊTE COMPTENT : « 0044 » est écrit et relu tel quel — un texte, jamais un nombre.
 *   3. L'IDCC EST FACULTATIF : une attribution sans IDCC est écrite, et rendue avec `null`.
 *   4. LE RENDU À L'APPORTEUR : la saisie de l'apporteur lui est rendue par sa vue cloisonnée ; un autre
 *      apporteur ne la lit pas.
 *   5. AUCUN DOCUMENT : aucune colonne d'`attributions` n'ajoute de document ni de fichier avec l'IDCC
 *      (jamais de bulletin de paie) — la colonne neuve est la SEULE de la table dont le nom parle d'IDCC.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { forApporteur, type ClientCloisonnable } from '../../src/server/acces/for-apporteur';

let base: Base;
let grilleId: string;
let apporteurA: string;
let apporteurB: string;

const MAINTENANT = new Date('2026-10-07T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sirens = 520000000;
const unSiren = () => String((sirens += 1));

beforeAll(async () => {
  base = await demarrerBase();
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
  const apporteur = async () =>
    (
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
  apporteurA = await apporteur();
  apporteurB = await apporteur();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

/** Insère une attribution par SQL brut avec l'IDCC donné — c'est la BASE qu'on juge, pas le client. */
async function inserer(idcc: string | null): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id, date_contact,
       verification_prioritaire, entreprise_a_verifier, lien_interet_declare, idcc_saisi)
     VALUES ($1::uuid, $2::uuid, 'active', $3, 'espace', $4::uuid, '2026-10-01', false, false, false, $5)`,
    id,
    apporteurA,
    unSiren(),
    grilleId,
    idcc
  );
  return id;
}

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-064 — attributions.idcc_saisi : quatre chiffres, en texte, facultatif', () => {
  it('REQ-DM-064 : « 44 » et « 00A4 » sont refusés par la base, la contrainte nommée', async () => {
    for (const faux of ['44', '00A4', '4 4 ', ' 044', '００４４']) {
      expect(await refus(inserer(faux)), faux).toMatch(/attributions_idcc_saisi_quatre_chiffres/);
    }
  });

  it('REQ-DM-064 : cinq chiffres sont refusés aussi — par le type, avant même la contrainte', async () => {
    expect(await refus(inserer('12345'))).toMatch(/too long|trop long/i);
  });

  it('REQ-DM-064 : « 0044 » est écrit et relu tel quel — les zéros de tête comptent', async () => {
    const id = await inserer('0044');
    const [l] = await base.prisma.$queryRawUnsafe<{ idcc_saisi: string }[]>(
      `SELECT idcc_saisi FROM attributions WHERE id = $1::uuid`,
      id
    );
    expect(l!.idcc_saisi).toBe('0044');
  });

  it('REQ-DM-064 : l’IDCC est facultatif — une attribution sans IDCC est écrite', async () => {
    const id = await inserer(null);
    const [l] = await base.prisma.$queryRawUnsafe<{ idcc_saisi: string | null }[]>(
      `SELECT idcc_saisi FROM attributions WHERE id = $1::uuid`,
      id
    );
    expect(l!.idcc_saisi).toBeNull();
  });

  it('REQ-DM-064 : la saisie est rendue à l’apporteur ; un autre apporteur ne la lit pas', async () => {
    const avec = await inserer('1486');
    const sans = await inserer(null);
    const moi = forApporteur(base.prisma as unknown as ClientCloisonnable, apporteurA).attribution;
    expect((await moi.trouver(avec))?.idccSaisi).toBe('1486');
    expect((await moi.trouver(sans))?.idccSaisi).toBeNull();
    const autre = forApporteur(
      base.prisma as unknown as ClientCloisonnable,
      apporteurB
    ).attribution;
    expect(await autre.trouver(avec)).toBeNull();
  });

  it('REQ-DM-064 : aucun document — la colonne neuve est la seule de la table qui parle d’IDCC', async () => {
    const colonnes = await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'attributions' AND (column_name ~* 'idcc|bulletin|paie|document|fichier')`
    );
    expect(colonnes.map((c) => c.column_name)).toEqual(['idcc_saisi']);
  });
});
