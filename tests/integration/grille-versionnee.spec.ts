// @req REQ-DM-014
/**
 * La grille de commission versionnée, en base RÉELLE — DM-03-P.
 *
 * TÉMOIN À DEUX FACES sur l'immuabilité (acceptation 6) : `UPDATE`, `DELETE` puis `TRUNCATE` d'une
 * version importée — lancés en SQL brut, comme un client qui contourne l'application — sont refusés
 * par la base et nomment le déclencheur ; un second import de la même empreinte n'écrit aucune ligne
 * et le dit.
 *
 * TÉMOIN À DEUX FACES sur la confrontation (acceptation 5) : la publication du producteur s'importe,
 * avec le compte des lignes de barème confrontées ; la même, un centime changé sans toucher aux
 * empreintes, est refusée en NOMMANT la ligne, et rien n'est écrit.
 *
 * Et l'acceptation 7 : relu depuis la colonne `jsonb`, le contenu rend l'empreinte publiée.
 *
 * LA FIXTURE est émise par le producteur réel, pseudonymisée par lui (voir
 * `tests/unit/domaine/grille-import.spec.ts`) : aucune valeur de grille n'entre dans ce dépôt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerBase, prismaCli, type Base } from './harnais';
import { empreinteGrille, type PublicationGrille } from '../../src/domain/commission/grille';
import { ImportGrilleRefuse, importerGrille } from '../../src/server/grille/import';
import { semerGrilleCommission } from '../../prisma/seed/02-grilles-commission';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const FIXTURE = join(__dirname, '..', 'fixtures', 'axionia', 'commissions.v1.pseudonymise.json');
const publiee = (): PublicationGrille =>
  structuredClone(
    (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { publication: PublicationGrille }).publication
  );

const IMPORTEE_AT = new Date('2026-09-29T08:00:00.000Z');
const compte = () => base.prisma.grilleCommission.count();

describe('REQ-DM-014 — une grille importée est une version, et une version ne se réécrit pas', () => {
  it('la migration pose la table, ses CHECK et ses déclencheurs, et le schéma n’a pas dérivé', () => {
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

  it('REQ-DM-014 — TÉMOIN : un centime changé sans toucher aux empreintes : refusé, la ligne NOMMÉE, rien écrit', async () => {
    const brut = publiee();
    const forfait = brut.contenu.commissions.find((c) => c.montantCents !== null)!;
    forfait.montantCents! += 1;
    const refus = await importerGrille(base.prisma, brut, IMPORTEE_AT).catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(ImportGrilleRefuse);
    expect((refus as ImportGrilleRefuse).fautes.map((f) => f.ligne)).toEqual([
      `commission:${forfait.commissionId}`,
      null,
    ]);
    expect(await compte()).toBe(0);
  });

  it('REQ-DM-014 : la publication du producteur s’importe, par le semeur, avec le compte des lignes confrontées', async () => {
    const brut = publiee();
    const r = await semerGrilleCommission(base.prisma, brut, IMPORTEE_AT);
    expect(r).toEqual({
      statut: 'importee',
      version: brut.version,
      hash: brut.hash,
      lignesConfrontees: brut.contenu.commissions.length + brut.contenu.paliers.length,
    });
    expect(r.lignesConfrontees).toBeGreaterThan(0);
    expect(await compte()).toBe(1);
  });

  it('relu depuis jsonb, le contenu rend l’empreinte PUBLIÉE (entiers seulement)', async () => {
    const [ligne] = await base.prisma.$queryRaw<{ hash: string; contenu: unknown }[]>`
      SELECT hash, contenu_json AS contenu FROM grilles_commission`;
    expect(ligne!.hash).toBe(publiee().hash);
    expect(empreinteGrille(ligne!.contenu)).toBe(ligne!.hash);
  });

  it('REQ-DM-014 — TÉMOIN : le second import de la même empreinte n’écrit rien, et le dit', async () => {
    const r = await importerGrille(base.prisma, publiee(), new Date('2026-09-30T00:00:00.000Z'));
    expect(r.statut).toBe('deja_importee');
    expect(await compte()).toBe(1);
  });

  it('TÉMOIN — la même version sous une autre empreinte est refusée, et nommée', async () => {
    const brut = publiee();
    brut.publieeAt = '2026-10-01T00:00:00.000Z';
    // Une publication cohérente mais DIFFÉRENTE du même numéro : empreintes de lignes intactes,
    // seule l'empreinte du contenu est recalculée pour un contenu altéré ailleurs que dans une ligne.
    brut.contenu.grilleVersionEvenement = '000000000000';
    brut.hash = empreinteGrille(brut.contenu);
    await expect(importerGrille(base.prisma, brut, IMPORTEE_AT)).rejects.toThrow(
      /v1 est déjà importée sous l'empreinte [0-9a-f]{64}/
    );
    expect(await compte()).toBe(1);
  });

  it.each([
    ['UPDATE', `UPDATE grilles_commission SET importee_at = now()`],
    ['DELETE', `DELETE FROM grilles_commission`],
    // DM-07 : `attributions` référence la grille. Sans CASCADE, la clé étrangère refuse AVANT le
    // déclencheur ; avec, le déclencheur de troncature parle, et c'est lui que ce témoin juge.
    ['TRUNCATE', `TRUNCATE grilles_commission CASCADE`],
  ])(
    'REQ-DM-014 — TÉMOIN : %s d’une version importée est refusé par la base, déclencheur nommé',
    async (op, sql) => {
      await expect(base.prisma.$executeRawUnsafe(sql)).rejects.toThrow(
        new RegExp(`grilles_commission_immuable : ${op} refusé`)
      );
      expect(await compte()).toBe(1);
    }
  );
});
