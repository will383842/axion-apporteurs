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
import type { Prisma } from '@prisma/client';
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
    ).rejects.toThrow(/charge refusée[\s\S]*unrecognized_keys/);
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

  it('REQ-DM-041 : le refus d’une charge ne recopie JAMAIS la valeur reçue dans son message', async () => {
    const avant = await base.prisma.evenement.count();
    const refus = await ajouter({
      ...evenement(52),
      charge: { algorithme: 'jean.dupont@exemple.fr' },
    }).catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(Error);
    const texte = `${(refus as Error).message} ${JSON.stringify(refus)} ${String((refus as Error).cause)}`;
    expect(texte).toMatch(/charge refusée/);
    expect(texte).not.toContain('jean.dupont');
    expect(await base.prisma.evenement.count()).toBe(avant);
  });
});

describe('REQ-DM-024 — ce que la base et l’écrivain refusent d’eux-mêmes', () => {
  it('REQ-DM-024 : un agregatId en majuscules est NORMALISÉ avant hachage — la chaîne reste vérifiable', async () => {
    const id = randomUUID();
    const { id: ligneId } = await ajouter(evenement(50, id.toUpperCase()));
    const ligne = await base.prisma.evenement.findUniqueOrThrow({ where: { id: BigInt(ligneId) } });
    expect(ligne.agregatId).toBe(id);
    expect(await verifier()).toMatchObject({ ok: true });
  });

  it('REQ-DM-024 : un agregatId sans tirets est REFUSÉ, et rien n’est écrit', async () => {
    const avant = await base.prisma.evenement.count();
    await expect(ajouter(evenement(51, randomUUID().replace(/-/g, '')))).rejects.toThrow(
      /agregatId refusé/
    );
    expect(await base.prisma.evenement.count()).toBe(avant);
  });

  it.each([
    ['evenements_hashes_hex', "'" + 'Z'.repeat(64) + "'", 'NULL', 'NULL'],
    ['evenements_agregat_complet', "'" + 'e'.repeat(64) + "'", "'attribution'", 'NULL'],
  ])(
    'REQ-DM-024 : une insertion qui viole %s est refusée par la base',
    async (nom, selfHash, agregat, agregatId) => {
      const avant = await base.prisma.evenement.count();
      await expect(
        base.prisma.$executeRawUnsafe(
          'INSERT INTO evenements (type, agregat, agregat_id, survenu_at, charge, prev_hash, self_hash) ' +
            `VALUES ('journal_ouvert', ${agregat}, ${agregatId}, now(), '{}', '${'d'.repeat(64)}', ${selfHash})`
        )
      ).rejects.toThrow(new RegExp(nom));
      expect(await base.prisma.evenement.count()).toBe(avant);
    }
  );

  it('REQ-DM-024 : sans le verrou, deux maillons sur la même tête échouent FERMÉ sur UNIQUE(prev_hash)', async () => {
    await expect(
      base.prisma.$transaction(async (tx) => {
        const tete = await tx.evenement.findFirstOrThrow({ orderBy: { id: 'desc' } });
        const inserer = (selfHash: string) =>
          tx.$executeRawUnsafe(
            'INSERT INTO evenements (type, survenu_at, charge, prev_hash, self_hash) ' +
              "VALUES ('journal_ouvert', now(), '{}', $1, $2)",
            tete.selfHash,
            selfHash
          );
        await inserer('a'.repeat(64));
        await inserer('b'.repeat(64));
      })
    ).rejects.toThrow(/23505[\s\S]*prev_hash/);
    expect(await verifier()).toMatchObject({ ok: true });
  });

  it('REQ-DM-024 : le TYPE refuse un client nu — ajouterEvenement exige une transaction ouverte', () => {
    const jamaisAppele = (e: NouvelEvenement) =>
      // @ts-expect-error — un PrismaClient porte `$transaction` : il n'est pas une transaction.
      ajouterEvenement(base.prisma, e);
    expect(jamaisAppele).toBeTypeOf('function');
  });

  // Revue A02 schema (5254773565) : le type ne protège que l'appel DIRECT. Un client nu passé par un
  // intermédiaire typé `Prisma.TransactionClient` compile — c'est un `Omit<>` du client. Le refus à
  // l'exécution protège tout le reste : rien ne s'écrit hors d'une transaction ouverte.
  it('REQ-DM-024 : un client nu passé par un intermédiaire typé TransactionClient est REFUSÉ à l’exécution, rien n’est écrit', async () => {
    const intermediaire = (tx: Prisma.TransactionClient, e: NouvelEvenement) =>
      ajouterEvenement(tx, e);
    const avant = await base.prisma.evenement.count();
    await expect(intermediaire(base.prisma, evenement(60))).rejects.toThrow(
      /exige une transaction ouverte/
    );
    expect(await base.prisma.evenement.count()).toBe(avant);
    expect(await verifier()).toMatchObject({ ok: true });
  });
});
