// @req REQ-DM-012
/**
 * L'apporteur et ses jetons de dépôt en base RÉELLE — DM-06.
 *
 * Ce que le domaine promet, la BASE le tient aussi, contre un client qui passerait par du SQL brut :
 *   — l'empreinte d'un jeton est UNIQUE et a la forme d'un SHA-256 hexadécimal ;
 *   — un jeton révoqué ne se réactive pas : sa ligne est GELÉE (tout `UPDATE` et tout `DELETE`
 *     refusés), une empreinte ne change jamais, même sur un jeton actif, et `TRUNCATE` est refusé —
 *     par le déclencheur `jetons_depot_revocation_definitive`, qui se nomme ;
 *   — le code de parrainage est UNIQUE et a la forme `AX` + 6 caractères Crockford base32.
 *
 * TÉMOIN À DEUX FACES : chaque refus a son contre-témoin qui passe (révoquer un jeton actif, noter
 * son dernier usage, insérer un code bien formé).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, prismaCli, type Base } from './harnais';
import { empreinteJetonDepot } from '../../src/domain/apporteur/identifiants';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const creeAt = new Date(Date.UTC(2026, 8, 25, 10, 0));

/** Un apporteur minimal : chaque champ obligatoire est ÉCRIT (RM-11). */
async function apporteur(codeParrainage: string): Promise<string> {
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'signe',
      codeParrainage,
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/candidature',
      parrainCodeCapture: null,
      creeAt,
    },
  });
  return a.id;
}

async function jeton(apporteurId: string, clair: string) {
  return base.prisma.jetonDepot.create({
    data: { apporteurId, tokenHash: empreinteJetonDepot(clair), creeAt },
  });
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-012 — le schéma appliqué est celui du dépôt', () => {
  it('REQ-DM-012 : `migrate diff` vide entre la base migrée et prisma/schema.prisma', () => {
    const diff = prismaCli(base.url, [
      'migrate',
      'diff',
      '--from-url',
      base.url,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    expect(diff).toContain('No difference detected');
  });
});

describe('REQ-DM-012 — le jeton de dépôt en base', () => {
  it('REQ-DM-012 : deux jetons de même empreinte sont refusés — l’empreinte est unique', async () => {
    const id = await apporteur('AX0000A1');
    await jeton(id, 'jeton-unique-1');
    const m = await refus(jeton(id, 'jeton-unique-1'));
    expect(m).toMatch(/Unique constraint|token_hash/);
  });

  it('REQ-DM-012 : une empreinte qui n’est pas un SHA-256 hexadécimal est refusée', async () => {
    const id = await apporteur('AX0000A2');
    const m = await refus(
      base.prisma.jetonDepot.create({
        data: { apporteurId: id, tokenHash: 'jeton-en-clair', creeAt },
      })
    );
    expect(m).toContain('jetons_depot_token_hash_hex');
  });

  it('REQ-DM-012 : face VERTE — révoquer un jeton actif et noter son dernier usage passent', async () => {
    const id = await apporteur('AX0000A3');
    const j = await jeton(id, 'jeton-vert');
    await base.prisma.jetonDepot.update({ where: { id: j.id }, data: { dernierUsageAt: creeAt } });
    const r = await base.prisma.jetonDepot.update({
      where: { id: j.id },
      data: { revoqueAt: new Date(creeAt.getTime() + 1000) },
    });
    expect(r.revoqueAt).not.toBeNull();
  });

  it('REQ-DM-012 : face ROUGE — un jeton révoqué ne se réactive pas, même en SQL brut', async () => {
    const id = await apporteur('AX0000A4');
    const j = await jeton(id, 'jeton-rouge');
    await base.prisma.jetonDepot.update({ where: { id: j.id }, data: { revoqueAt: creeAt } });
    const reactivation = await refus(
      base.prisma.$executeRawUnsafe(
        'UPDATE jetons_depot SET revoque_at = NULL WHERE id = $1::uuid',
        j.id
      )
    );
    expect(reactivation).toContain('jetons_depot_revocation_definitive');
    const deplacement = await refus(
      base.prisma.$executeRawUnsafe(
        "UPDATE jetons_depot SET revoque_at = revoque_at + interval '1 day' WHERE id = $1::uuid",
        j.id
      )
    );
    expect(deplacement).toContain('jetons_depot_revocation_definitive');
    // Supprimer puis réinsérer la même empreinte serait une réactivation par un autre chemin.
    const suppression = await refus(
      base.prisma.$executeRawUnsafe('DELETE FROM jetons_depot WHERE id = $1::uuid', j.id)
    );
    expect(suppression).toContain('jetons_depot_revocation_definitive');
    const relu = await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: j.id } });
    expect(relu.revoqueAt?.getTime()).toBe(creeAt.getTime());
  });
});

describe('REQ-DM-012 — une ligne révoquée est gelée, une empreinte ne change jamais', () => {
  it('REQ-DM-012 : face ROUGE — changer l’empreinte d’un jeton révoqué puis réinsérer l’ancienne est refusé', async () => {
    const id = await apporteur('AX0000C1');
    const j = await jeton(id, 'jeton-gele');
    await base.prisma.jetonDepot.update({ where: { id: j.id }, data: { revoqueAt: creeAt } });
    const autre = empreinteJetonDepot('empreinte-de-remplacement');
    const m = await refus(
      base.prisma.$executeRawUnsafe(
        'UPDATE jetons_depot SET token_hash = $2 WHERE id = $1::uuid',
        j.id,
        autre
      )
    );
    expect(m).toContain('jetons_depot_revocation_definitive');
    // L'empreinte d'origine reste occupée : la réinsérer se heurte à l'unicité.
    expect(await refus(jeton(id, 'jeton-gele'))).toMatch(/Unique constraint|token_hash/);
  });

  it('REQ-DM-012 : face ROUGE — tout UPDATE d’une ligne révoquée est refusé, dernier usage compris', async () => {
    const id = await apporteur('AX0000C2');
    const j = await jeton(id, 'jeton-gele-2');
    await base.prisma.jetonDepot.update({ where: { id: j.id }, data: { revoqueAt: creeAt } });
    const m = await refus(
      base.prisma.jetonDepot.update({ where: { id: j.id }, data: { dernierUsageAt: creeAt } })
    );
    expect(m).toContain('jetons_depot_revocation_definitive');
  });

  it('REQ-DM-012 : face ROUGE — l’empreinte d’un jeton ACTIF ne change pas non plus', async () => {
    const id = await apporteur('AX0000C3');
    const j = await jeton(id, 'jeton-actif-fige');
    const m = await refus(
      base.prisma.jetonDepot.update({
        where: { id: j.id },
        data: { tokenHash: empreinteJetonDepot('autre-clair') },
      })
    );
    expect(m).toContain('jetons_depot_revocation_definitive');
  });

  it('REQ-DM-012 : face ROUGE — TRUNCATE est refusé, il effacerait d’un coup toutes les révocations', async () => {
    const m = await refus(base.prisma.$executeRawUnsafe('TRUNCATE jetons_depot'));
    expect(m).toContain('jetons_depot_revocation_definitive');
    expect(await base.prisma.jetonDepot.count()).toBeGreaterThan(0);
  });
});

describe('REQ-DM-012 — le code de parrainage en base', () => {
  it('REQ-DM-012 : un code déjà attribué est refusé — le code est unique', async () => {
    await apporteur('AX0000B1');
    expect(await refus(apporteur('AX0000B1'))).toMatch(/Unique constraint|code_parrainage/);
  });

  it('REQ-DM-012 : un code hors alphabet (I, L, O, U, minuscule) est refusé par la base', async () => {
    for (const faux of ['AXI00000', 'AXL00000', 'AXO00000', 'AXU00000', 'ax000000', 'AX00000']) {
      expect(await refus(apporteur(faux)), faux).toContain('apporteurs_code_parrainage_format');
    }
  });
});
