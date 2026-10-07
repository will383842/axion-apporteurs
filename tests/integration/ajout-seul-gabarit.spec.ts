// @req REQ-DM-031
// @req REQ-DM-043
// @req REQ-SEC-058
// @req REQ-DM-028
/**
 * DM-07, en base RÉELLE — le gabarit « ajout seul, sauf purge » (HYP-A02-GABARIT-AJOUT-SEUL) : UNE
 * fonction générique, `refuser_modification_sauf()`, sans `EXECUTE`, que chaque table en ajout seul
 * branche par `CREATE TRIGGER … EXECUTE FUNCTION refuser_modification_sauf('purge:<c>', …)`.
 *
 * CE QU'IL PROUVE, sur ses deux premiers usages :
 *   — `depots_refuses` (`purge:siren`, `une_fois:siren_purge_at`, partners/ADR-0030) : le SIREN
 *     passe à NULL avec sa date de purge ; toute autre colonne modifiée est refusée, un SIREN purgé ne
 *     revient pas ;
 *   — `personnes_declarees` (`purge:nom_chiffre`, `purge:prenom_chiffre`, `une_fois:retiree_at`) :
 *     la colonne purgée passe à NULL, une autre colonne modifiée est refusée, un retour de NULL vers
 *     une valeur est refusé, `une_fois` réécrit est refusé ;
 *   — DELETE et TRUNCATE sont refusés partout ;
 *   — chaque argument de `pg_trigger.tgargs` nomme une colonne qui existe (`information_schema`) ;
 *   — une table dont le gabarit a reçu une fonction DÉDIÉE, au préfixe du gabarit, reste comptée :
 *     `demandes_droits_contact` et `refuser_modification_sauf_droits_contact()`, sans argument
 *     (DM-68, partners/ADR-0032) ;
 *   — un modèle cloisonné est dans `MODELES_EN_AJOUT_SEUL` si et seulement si sa table est
 *     branchée sur le gabarit (décision A02 : l'égalité porte sur l'intersection, d'autres tables
 *     non cloisonnées s'y brancheront) ;
 *   — la PURGE du contact d'une attribution (REQ-DM-031) : nom, prénom, courriel et son empreinte,
 *     téléphone et son empreinte, fonction et contexte passent à NULL ensemble ; le SIREN et
 *     `deposeeAt` restent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import { MODELES_CLOISONNES, MODELES_EN_AJOUT_SEUL } from '../../src/server/acces/for-apporteur';

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
/**
 * Une table TÉMOIN branchée sur le gabarit avec `argument`, une ligne insérée, puis `cas(table)` ;
 * la table est SUPPRIMÉE à la fin, quoi qu’il arrive.
 *
 * POURQUOI PAS UNE TABLE TEMPORAIRE. Une `TEMP TABLE` n’existe que sur la connexion qui l’a créée ;
 * or Prisma répartit les appels successifs sur un POOL de connexions. Le `CREATE`, l’`INSERT` et
 * l’`UPDATE` pouvaient donc tomber sur des connexions différentes : 42P01 « relation does not
 * exist », selon l’ordre du pool. Une table ordinaire, au nom UNIQUE par cas, est vue de toutes
 * les connexions et ne gêne aucun autre cas ; la supprimer à la fin garde vrais les témoins qui
 * confrontent les branchements du gabarit aux colonnes et aux modèles.
 */
async function avecTableTemoin(argument: string, cas: (table: string) => Promise<void>) {
  const table = `temoin_${randomBytes(6).toString('hex')}`;
  await base.prisma.$executeRawUnsafe(`CREATE TABLE ${table} (id int PRIMARY KEY, a text)`);
  try {
    await base.prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${table}_ajout_seul BEFORE UPDATE OR DELETE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION refuser_modification_sauf('${argument}')`
    );
    await base.prisma.$executeRawUnsafe(`INSERT INTO ${table} VALUES (1, 'x')`);
    await cas(table);
  } finally {
    await base.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

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

describe('REQ-DM-043 — `depots_refuses` : ajout seul, sauf la purge du SIREN', () => {
  it('REQ-DM-043 : la purge — le SIREN passe à NULL avec sa date de purge ; la ligne reste', async () => {
    const id = await unRefus(await unApporteur());
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE depots_refuses SET siren = NULL, siren_purge_at = $2 WHERE id = $1::uuid`,
        id,
        MAINTENANT
      )
    ).resolves.toBe(1);
  });

  it('REQ-DM-043 : TÉMOIN — un SIREN purgé ne revient pas de NULL vers une valeur', async () => {
    const id = await unRefus(await unApporteur());
    await base.prisma.$executeRawUnsafe(
      `UPDATE depots_refuses SET siren = NULL, siren_purge_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE depots_refuses SET siren = '552100554', siren_purge_at = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf/i);
  });

  it('REQ-DM-043 : TÉMOIN — toute autre modification d’un refus est refusée', async () => {
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
             string_to_array(encode(t.tgargs, 'escape'), '\\000') AS args
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE p.proname LIKE 'refuser\\_modification\\_sauf%' AND NOT t.tgisinternal
        AND c.relpersistence = 'p'`;
    const tables = new Set(branchements.map((b) => b.table));
    expect([...tables].sort()).toEqual([
      'alertes_liberation',
      'decisions_candidature',
      'demandes_droits_contact',
      'ecrits_apporteur',
      'depots_refuses',
      'journal_acces_console',
      'personnes_declarees',
      'qualifications',
      'rattachements_manuels',
      'revisions_demande_confirmation',
      'verifications',
    ]);
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

  it('REQ-SEC-058 : les gels du journal des accès ont une GARDE DÉDIÉE, hors du gabarit : la levée s’écrit une fois, et un gel épuisé s’efface', async () => {
    // SEC-61 (forme d'A02) : `journal_acces_console_gels` n'est pas en ajout seul — la levée est une
    // écriture, et un gel levé dont les lignes sont purgées est supprimé. Sa garde est la sienne.
    const declencheurs = await base.prisma.$queryRaw<{ nom: string; fonction: string }[]>`
      SELECT t.tgname AS nom, p.proname AS fonction
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE c.relname = 'journal_acces_console_gels' AND NOT t.tgisinternal
      ORDER BY t.tgname`;
    expect(declencheurs).toEqual([
      { nom: 'journal_acces_console_gels_garde', fonction: 'journal_acces_console_gels_garde' },
      {
        nom: 'journal_acces_console_gels_troncature',
        fonction: 'journal_acces_console_gels_garde',
      },
    ]);
  });

  it('REQ-DM-031 : TÉMOIN — une nature d’argument inconnue lève à l’appel, nommée', async () => {
    await avecTableTemoin('efface:a', async (table) => {
      expect(
        await refus(base.prisma.$executeRawUnsafe(`UPDATE ${table} SET a = NULL WHERE id = 1`))
      ).toMatch(/argument « efface:a » mal formé/);
    });
  });

  it('REQ-DM-031 : TÉMOIN — un branchement qui nomme une colonne absente lève à l’appel', async () => {
    await avecTableTemoin('purge:colonne_absente', async (table) => {
      expect(
        await refus(base.prisma.$executeRawUnsafe(`UPDATE ${table} SET a = NULL WHERE id = 1`))
      ).toMatch(/colonne_absente/);
    });
  });
});

describe('REQ-DM-031 — la liste des modèles en ajout seul égale, sur les modèles cloisonnés, les tables branchées', () => {
  it('REQ-DM-031 : un modèle cloisonné est dans MODELES_EN_AJOUT_SEUL si et seulement si sa table porte le gabarit', async () => {
    const branchees = new Set(
      (
        await base.prisma.$queryRaw<{ table: string }[]>`
          SELECT DISTINCT c.relname AS table
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE p.proname LIKE 'refuser\\_modification\\_sauf%' AND NOT t.tgisinternal
            AND c.relpersistence = 'p'`
      ).map((l) => l.table)
    );
    const tableDe = (modele: string) => {
      const nom = modele.charAt(0).toUpperCase() + modele.slice(1);
      const m = Prisma.dmmf.datamodel.models.find((x) => x.name === nom);
      if (m?.dbName === undefined || m.dbName === null) throw new Error(`${modele} sans table`);
      return m.dbName;
    };
    const branches = MODELES_CLOISONNES.filter((m) => branchees.has(tableDe(m)));
    expect([...branches].sort()).toEqual([...MODELES_EN_AJOUT_SEUL].sort());
  });
});

describe('REQ-DM-028 — les tables à garde DÉDIÉE, hors du gabarit commun', () => {
  // Une table dont la durée est FINIE et dont la purge EFFACE la ligne ne peut pas porter le gabarit
  // commun, qui refuse tout DELETE : elle porte sa propre garde, nommée ici, déclencheur par déclencheur.
  const GARDES_DEDIEES = {
    sirens_liste_noire_trace: [
      'sirens_liste_noire_trace_garde:BEFORE UPDATE OR DELETE:ROW',
      'sirens_liste_noire_trace_troncature:BEFORE TRUNCATE:STATEMENT',
    ],
  } as const;

  it('REQ-DM-028 : chaque table à garde dédiée porte exactement ses déclencheurs, et jamais le gabarit commun', async () => {
    for (const [table, attendus] of Object.entries(GARDES_DEDIEES)) {
      const lus = await base.prisma.$queryRaw<{ d: string }[]>`
        SELECT trigger_name || ':' || action_timing || ' ' || string_agg(event_manipulation, ' OR '
                 ORDER BY CASE event_manipulation WHEN 'INSERT' THEN 0 WHEN 'UPDATE' THEN 1
                                                  WHEN 'DELETE' THEN 2 ELSE 3 END)
               || ':' || action_orientation AS d
        FROM information_schema.triggers WHERE event_object_table = ${table}
        GROUP BY trigger_name, action_timing, action_orientation ORDER BY 1`;
      const troncatures = await base.prisma.$queryRaw<{ d: string }[]>`
        SELECT t.tgname || ':BEFORE TRUNCATE:STATEMENT' AS d FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = ${table} AND NOT t.tgisinternal AND (t.tgtype & 32) <> 0`;
      expect([...lus, ...troncatures].map((l) => l.d).sort(), table).toEqual([...attendus].sort());
      const [commun] = await base.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE c.relname = ${table} AND p.proname = 'refuser_modification_sauf'`;
      expect(commun?.n, table).toBe(0n);
    }
  });
});

describe('REQ-DM-031 — la purge du contact d’une attribution', () => {
  it('REQ-DM-031 : nom, prénom, courriel, téléphone, fonction et contexte passent à NULL ensemble ; le SIREN et deposeeAt restent', async () => {
    const apporteurId = await unApporteur();
    const [g] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO grilles_commission (id, version, hash, contenu_json, publiee_at, importee_at)
       VALUES ($1::uuid, $2, $3, '{}'::jsonb, $4, $4) RETURNING id`,
      randomUUID(),
      Math.floor(Math.random() * 1e9) + 1,
      randomUUID().replace(/-/g, '').repeat(2),
      MAINTENANT
    );
    const id = randomUUID();
    const empreinte = 'a'.repeat(64);
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
         nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash,
         telephone_chiffre, phone_hash, fonction_contact_chiffre, contexte_chiffre)
       VALUES ($1::uuid, $2::uuid, 'perdue', '552100554', 'espace', $3::uuid, '2026-10-01',
         false, false, false, '\\x01'::bytea, '\\x02'::bytea, '\\x03'::bytea, $4,
         '\\x04'::bytea, $4, '\\x05'::bytea, '\\x06'::bytea)`,
      id,
      apporteurId,
      g!.id,
      empreinte
    );
    await base.prisma.$executeRawUnsafe(
      `UPDATE attributions SET nom_contact_chiffre = NULL, prenom_contact_chiffre = NULL,
         email_chiffre = NULL, email_hash = NULL, telephone_chiffre = NULL, phone_hash = NULL,
         fonction_contact_chiffre = NULL, contexte_chiffre = NULL, contact_purge_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    const [l] = await base.prisma.$queryRawUnsafe<
      { restants: number; siren: string; depot: boolean }[]
    >(
      `SELECT num_nonnulls(nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash,
         telephone_chiffre, phone_hash, fonction_contact_chiffre, contexte_chiffre) AS restants,
         siren, deposee_at IS NOT NULL AS depot
       FROM attributions WHERE id = $1::uuid`,
      id
    );
    expect(l).toEqual({ restants: 0, siren: '552100554', depot: true });
  });

  it('REQ-DM-031 : TÉMOIN — purger le bloc du courriel sans son empreinte est refusé : ils vont ensemble', async () => {
    const apporteurId = await unApporteur();
    const [g] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO grilles_commission (id, version, hash, contenu_json, publiee_at, importee_at)
       VALUES ($1::uuid, $2, $3, '{}'::jsonb, $4, $4) RETURNING id`,
      randomUUID(),
      Math.floor(Math.random() * 1e9) + 1,
      randomUUID().replace(/-/g, '').repeat(2),
      MAINTENANT
    );
    const id = randomUUID();
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
         email_chiffre, email_hash)
       VALUES ($1::uuid, $2::uuid, 'perdue', '552100554', 'espace', $3::uuid, '2026-10-01',
         false, false, false, '\\x03'::bytea, $4)`,
      id,
      apporteurId,
      g!.id,
      'b'.repeat(64)
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE attributions SET email_chiffre = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/attributions_courriel_bloc_et_empreinte/);
  });
});
