// @req REQ-DM-024
// @req REQ-DM-041
/**
 * Le journal `Evenement` en base RÉELLE — DM-01 (gate `partners:journal:immutable`).
 *
 * TÉMOIN À DEUX FACES. Face rouge : `UPDATE`, `DELETE` et `TRUNCATE` sur une ligne existante — lancés
 * en SQL brut, comme le ferait un client qui contourne l'application — échouent et nomment le
 * déclencheur `evenements_append_only`. Face verte : `ajouterEvenement()` insère, et
 * `verifierChaine()` sort sans faute sur la base ainsi remplie, en comptant ses maillons.
 *
 * Les altérations qu'un propriétaire de table PEUT faire (déclencheur désarmé : c'est une limite
 * déclarée, partners/ADR-0014) sont jouées ici pour prouver que `verifierChaine()` les VOIT, puis
 * défaites. Chaque altération frappe une ligne du MILIEU.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, prismaCli, type Base } from './harnais';
import {
  ajouterEvenement,
  lireJournal,
  type NouvelEvenement,
} from '../../src/server/evenement/journal';
import { verifierChaine, ALGORITHME, GENESE } from '../../src/domain/evenement/journal';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const evenement = (i: number, agregatId: string = randomUUID()): NouvelEvenement => ({
  type: 'journal_ouvert',
  agregat: 'attribution',
  agregatId,
  survenuAt: new Date(Date.UTC(2026, 8, 20, 8, i)),
  charge: { algorithme: ALGORITHME },
});

const ajouter = (e: NouvelEvenement) => base.prisma.$transaction((tx) => ajouterEvenement(tx, e));

const verifier = async () => verifierChaine(await lireJournal(base.prisma));

/** Désarme le déclencheur de ligne le temps d'une altération : ce que peut un propriétaire. */
async function commeProprietaire(sql: string, ...valeurs: unknown[]): Promise<void> {
  await base.prisma.$transaction([
    base.prisma.$executeRawUnsafe('ALTER TABLE evenements DISABLE TRIGGER evenements_append_only'),
    base.prisma.$executeRawUnsafe(sql, ...valeurs),
    base.prisma.$executeRawUnsafe('ALTER TABLE evenements ENABLE TRIGGER evenements_append_only'),
  ]);
}

/** L'id d'une ligne du MILIEU du journal. */
async function idDuMilieu(): Promise<bigint> {
  const ids = (await lireJournal(base.prisma)).map((l) => BigInt(l.id));
  expect(ids.length, 'le journal doit avoir au moins trois lignes').toBeGreaterThanOrEqual(3);
  return ids[Math.floor(ids.length / 2)]!;
}

describe('REQ-DM-024 — le journal en base réelle : append-only, chaîné, vérifiable', () => {
  it('REQ-DM-024 : la migration a ouvert le journal par sa genèse, et le schéma n’a pas dérivé', async () => {
    const [genese] = await lireJournal(base.prisma);
    expect(genese).toMatchObject({ prevHash: GENESE.prevHash, selfHash: GENESE.selfHash });
    // `migrate diff` vide : CHECK, fonction et déclencheurs sont hors du modèle de Prisma.
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

  it('REQ-DM-024 : une insertion nominale par ajouterEvenement() réussit, et verifierChaine() sort sans faute', async () => {
    for (let i = 0; i < 4; i++) await ajouter(evenement(i));
    const verdict = await verifier();
    expect(verdict).toMatchObject({ ok: true });
    const maillons = verdict.ok ? verdict.maillons : 0;
    console.log(`verifierChaine() : 0 faute, ${maillons} maillon(s) vérifié(s)`);
    expect(maillons).toBe(5);
  });

  it('REQ-JUR-026 → REQ-DM-024 : un test tente une modification (UPDATE) et attend un refus nommé', async () => {
    const id = await idDuMilieu();
    await expect(
      base.prisma.$executeRawUnsafe(`UPDATE evenements SET charge = '{}' WHERE id = $1`, id)
    ).rejects.toThrow(/evenements_append_only : UPDATE refusé/);
  });

  it('REQ-DM-024 : une suppression (DELETE) d’une ligne du milieu est refusée par la base, et nommée', async () => {
    const id = await idDuMilieu();
    await expect(
      base.prisma.$executeRawUnsafe('DELETE FROM evenements WHERE id = $1', id)
    ).rejects.toThrow(/evenements_append_only : DELETE refusé/);
  });

  it('REQ-SEC-027 → REQ-DM-024 : TRUNCATE, que le déclencheur de ligne ne voit pas, est refusé aussi', async () => {
    await expect(base.prisma.$executeRawUnsafe('TRUNCATE evenements')).rejects.toThrow(
      /evenements_append_only : TRUNCATE refusé/
    );
    expect(await verifier()).toMatchObject({ ok: true, maillons: 5 });
  });

  it('REQ-DM-024 : un agregat_id réécrit par le propriétaire (déclencheur désarmé) → hash_altere nomme CETTE ligne', async () => {
    const id = await idDuMilieu();
    const avant = await base.prisma.evenement.findUniqueOrThrow({ where: { id } });
    await commeProprietaire(
      'UPDATE evenements SET agregat_id = $1::uuid WHERE id = $2',
      randomUUID(),
      id
    );
    expect(await verifier()).toEqual({ ok: false, faute: 'hash_altere', id: id.toString() });
    await commeProprietaire(
      'UPDATE evenements SET agregat_id = $1::uuid WHERE id = $2',
      avant.agregatId,
      id
    );
    expect(await verifier()).toMatchObject({ ok: true });
  });

  it('REQ-DM-024 : une ligne du milieu supprimée par le propriétaire → maillon_orphelin nomme la SUIVANTE', async () => {
    const id = await idDuMilieu();
    const ligne = await base.prisma.evenement.findUniqueOrThrow({ where: { id } });
    const suivante = await base.prisma.evenement.findFirstOrThrow({
      where: { prevHash: ligne.selfHash },
    });
    await commeProprietaire('DELETE FROM evenements WHERE id = $1', id);
    expect(await verifier()).toEqual({
      ok: false,
      faute: 'maillon_orphelin',
      id: suivante.id.toString(),
    });
    await base.prisma.evenement.create({ data: { ...ligne, charge: { algorithme: ALGORITHME } } });
    expect(await verifier()).toMatchObject({ ok: true });
  });

  it('REQ-DM-024 : deux écrivains concurrents se suivent au lieu de bifurquer (verrou consultatif)', async () => {
    const avant = await verifier();
    // Chaque transaction reste ouverte après son écriture : sans verrou, la seconde lirait la même
    // tête et échouerait sur UNIQUE(prev_hash).
    const ecrire = (i: number) =>
      base.prisma.$transaction(
        async (tx) => {
          const r = await ajouterEvenement(tx, evenement(10 + i));
          await new Promise((fin) => setTimeout(fin, 300));
          return r;
        },
        { timeout: 20_000 }
      );
    const resultats = await Promise.all([ecrire(0), ecrire(1)]);
    expect(resultats).toHaveLength(2);
    expect(await verifier()).toMatchObject({
      ok: true,
      maillons: (avant.ok ? avant.maillons : 0) + 2,
    });
  });
});

describe('REQ-DM-041 — la charge est fermée, et l’effacement d’un tiers laisse la chaîne vérifiable', () => {
  it('REQ-DM-041 : une clé en trop dans la charge lève, et aucune ligne n’est écrite', async () => {
    const avant = await base.prisma.evenement.count();
    await expect(
      ajouter({ ...evenement(30), charge: { algorithme: ALGORITHME, courriel: 'a@b.fr' } })
    ).rejects.toThrow(/Unrecognized key/);
    expect(await base.prisma.evenement.count()).toBe(avant);
  });

  it('REQ-DM-041 : après l’effacement d’un tiers, verifierChaine() reste sans faute — et « purger » la charge est refusé', async () => {
    await base.prisma.$executeRawUnsafe(
      'CREATE TABLE bac_tiers (id uuid PRIMARY KEY, courriel text NOT NULL)'
    );
    const tiers = randomUUID();
    await base.prisma.$executeRawUnsafe(
      'INSERT INTO bac_tiers (id, courriel) VALUES ($1::uuid, $2)',
      tiers,
      'tiers@exemple.fr'
    );
    await ajouter({ ...evenement(40, tiers), agregat: 'apporteur' });

    await base.prisma.$executeRawUnsafe('DELETE FROM bac_tiers WHERE id = $1::uuid', tiers);
    expect(await verifier()).toMatchObject({ ok: true });

    // La face qui dit pourquoi la charge DOIT être fermée : effacer dans le journal exige un UPDATE.
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE evenements SET charge = '{}' WHERE agregat_id = $1::uuid`,
        tiers
      )
    ).rejects.toThrow(/evenements_append_only : UPDATE refusé/);
  });
});
