// @req REQ-DM-031
// @req REQ-DM-043
/**
 * DM-07, en base RÉELLE — le gabarit « ajout seul, sauf purge » (HYP-A02-GABARIT-AJOUT-SEUL) : UNE
 * fonction générique, `refuser_modification_sauf()`, sans `EXECUTE`, que chaque table en ajout seul
 * branche par `CREATE TRIGGER … EXECUTE FUNCTION refuser_modification_sauf('purge:<c>', …)`.
 *
 * CE QU'IL PROUVE, sur ses deux premiers usages :
 *   — `depots_refuses` (aucun argument) : toute modification est refusée ;
 *   — `personnes_declarees` (`purge:nom_chiffre`, `purge:prenom_chiffre`, `une_fois:retiree_at`) :
 *     la colonne purgée passe à NULL, une autre colonne modifiée est refusée, un retour de NULL vers
 *     une valeur est refusé, `une_fois` réécrit est refusé ;
 *   — DELETE et TRUNCATE sont refusés partout ;
 *   — chaque argument de `pg_trigger.tgargs` nomme une colonne qui existe (`information_schema`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';

let base: Base;
beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);
afterAll(async () => {
  await base?.arreter();
});

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');

/** Un apporteur minimal, pour porter les lignes. */
async function unApporteur(): Promise<string> {
  const a = await base.prisma.apporteur.create({
    data: {
      statut: 'signe',
      codeParrainage: `AX${randomUUID()
        .replace(/-/g, '')
        .slice(0, 6)
        .toUpperCase()
        .replace(/[ILOU]/g, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: MAINTENANT,
    },
    select: { id: true },
  });
  return a.id;
}

/** Le code SQLSTATE et le message d'une erreur remontée par Prisma. */
async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

async function unRefus(apporteurId: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO depots_refuses (id, apporteur_id, siren, motif, canal, refuse_at)
     VALUES ($1::uuid, $2::uuid, '552100554', 'file_complete', 'espace', $3)`,
    id,
    apporteurId,
    MAINTENANT
  );
  return id;
}

async function unePersonne(apporteurId: string): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO personnes_declarees (id, apporteur_id, nom_chiffre, prenom_chiffre, qualite, declaree_at)
     VALUES ($1::uuid, $2::uuid, '\\x01'::bytea, '\\x02'::bytea, 'associe', $3)`,
    id,
    apporteurId,
    MAINTENANT
  );
  return id;
}

describe('REQ-DM-043 — `depots_refuses` : ajout seul, sans aucune exception', () => {
  it('REQ-DM-043 : toute modification d’un refus est refusée', async () => {
    const id = await unRefus(await unApporteur());
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE depots_refuses SET motif = 'insincerite' WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
  });

  it('REQ-DM-043 : DELETE et TRUNCATE sont refusés', async () => {
    const id = await unRefus(await unApporteur());
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(`DELETE FROM depots_refuses WHERE id = $1::uuid`, id)
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
    expect(await refus(base.prisma.$executeRawUnsafe(`TRUNCATE depots_refuses CASCADE`))).toMatch(
      /refuser_modification_sauf|ajout seul/i
    );
  });
});

describe('REQ-DM-031 — `personnes_declarees` : ajout seul, sauf la purge et le retrait', () => {
  it('REQ-DM-031 : la purge — `nom_chiffre` et `prenom_chiffre` passent à NULL', async () => {
    const id = await unePersonne(await unApporteur());
    await base.prisma.$executeRawUnsafe(
      `UPDATE personnes_declarees SET nom_chiffre = NULL, prenom_chiffre = NULL WHERE id = $1::uuid`,
      id
    );
    const [l] = await base.prisma.$queryRawUnsafe<{ n: null }[]>(
      `SELECT nom_chiffre AS n FROM personnes_declarees WHERE id = $1::uuid`,
      id
    );
    expect(l?.n).toBeNull();
  });

  it('REQ-DM-031 : TÉMOIN — une autre colonne modifiée est refusée', async () => {
    const id = await unePersonne(await unApporteur());
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE personnes_declarees SET declaree_at = declaree_at + interval '1 day' WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
  });

  it('REQ-DM-031 : TÉMOIN — une colonne purgée ne revient pas de NULL vers une valeur', async () => {
    const id = await unePersonne(await unApporteur());
    await base.prisma.$executeRawUnsafe(
      `UPDATE personnes_declarees SET nom_chiffre = NULL WHERE id = $1::uuid`,
      id
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE personnes_declarees SET nom_chiffre = '\\x03'::bytea WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
  });

  it('REQ-DM-031 : le retrait s’écrit UNE fois ; réécrit, il est refusé', async () => {
    const id = await unePersonne(await unApporteur());
    await base.prisma.$executeRawUnsafe(
      `UPDATE personnes_declarees SET retiree_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE personnes_declarees SET retiree_at = retiree_at + interval '1 day' WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
  });

  it('REQ-DM-031 : DELETE et TRUNCATE sont refusés', async () => {
    const id = await unePersonne(await unApporteur());
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(`DELETE FROM personnes_declarees WHERE id = $1::uuid`, id)
      )
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE personnes_declarees CASCADE`))
    ).toMatch(/refuser_modification_sauf|ajout seul/i);
  });
});

describe('REQ-DM-031 — chaque argument du gabarit nomme une colonne qui existe', () => {
  it('REQ-DM-031 : `pg_trigger.tgargs`, préfixe retiré, est confronté à `information_schema.columns`', async () => {
    const branchements = await base.prisma.$queryRaw<{ table: string; args: string[] }[]>`
      SELECT c.relname AS table,
             string_to_array(rtrim(encode(t.tgargs, 'escape'), E'\\000'), E'\\000') AS args
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE p.proname = 'refuser_modification_sauf' AND NOT t.tgisinternal`;
    const tables = new Set(branchements.map((b) => b.table));
    expect([...tables].sort()).toEqual(['depots_refuses', 'personnes_declarees']);
    const absentes: string[] = [];
    for (const b of branchements) {
      for (const arg of (b.args ?? []).filter((a) => a !== '')) {
        const m = /^(purge|une_fois):([a-z_]+)$/.exec(arg);
        if (!m) {
          absentes.push(`${b.table} : argument mal formé « ${arg} »`);
          continue;
        }
        const [c] = await base.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM information_schema.columns
          WHERE table_name = ${b.table} AND column_name = ${m[2]}`;
        if (Number(c?.n ?? 0n) !== 1) absentes.push(`${b.table}.${m[2]}`);
      }
    }
    expect(absentes).toEqual([]);
  });

  it('REQ-DM-031 : TÉMOIN — un branchement qui nomme une colonne absente lève à l’appel', async () => {
    await base.prisma.$executeRawUnsafe(
      `CREATE TEMP TABLE temoin_gabarit (id int PRIMARY KEY, a text)`
    );
    await base.prisma.$executeRawUnsafe(
      `CREATE TRIGGER temoin_gabarit_ajout_seul BEFORE UPDATE OR DELETE ON temoin_gabarit
       FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('purge:colonne_absente')`
    );
    await base.prisma.$executeRawUnsafe(`INSERT INTO temoin_gabarit VALUES (1, 'x')`);
    expect(
      await refus(base.prisma.$executeRawUnsafe(`UPDATE temoin_gabarit SET a = NULL WHERE id = 1`))
    ).toMatch(/colonne_absente/);
  });
});
