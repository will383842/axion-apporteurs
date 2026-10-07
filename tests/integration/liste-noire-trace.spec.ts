// @req REQ-DM-028
// @req REQ-DM-029
/**
 * DM-65 — la liste tenue par la Société (art. 3.3 bis (b)), en base RÉELLE, sous le rôle du serveur
 * (`partners_app`), comme en production.
 *
 * CE QU'IL PROUVE :
 *   1. LA TRACE EST TENUE PAR LA BASE : un ajout ouvre une période (même SIREN, même catégorie, même
 *      auteur, même date) ; un retrait n'est admis que si sa période est d'abord fermée ; une
 *      inscription ne se modifie pas ; une seconde période ouverte pour un SIREN est refusée ; la
 *      trace ne se réécrit pas, ne se ferme qu'une fois, et une période ouverte ne s'efface pas, ni
 *      par DELETE ni par TRUNCATE ; une période FERMÉE peut s'effacer (la purge, à cinq ans) ;
 *   2. LE REPORT : chaque inscription antérieure à la migration a sa période ouverte ;
 *   3. UN RÔLE NOMMÉ : ajouter et retirer sont réservés au rôle que la matrice nomme ; tout autre
 *      rôle, et un utilisateur désactivé, sont refusés sans rien écrire ; le retrait par le code
 *      ferme la période (auteur, date) puis supprime la ligne, dans une transaction ;
 *   4. LA PURGE À CINQ ANS : une période fermée est effacée quand `retire_at` plus
 *      `LISTE_NOIRE_TRACE_ANS` est atteint — à la milliseconde : l'échéance moins 1 ms est gardée,
 *      l'échéance pile effacée ; une période ouverte n'est jamais touchée ; seule la tâche de purge
 *      efface la trace (témoin statique) ;
 *   5. CE QUE LA PROJECTION EN LIT : inscrit, un SIREN est connu sous sa catégorie ; retiré, il
 *      redevient déclarable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaClient, type ConsoleRole } from '@prisma/client';
import { INFORMATION_LISTE_TENUE } from '../../src/content/micro-copy/espace/issues-depot';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { anterioriteDe } from '../../src/server/entreprise-connue/projection';
import {
  DROIT_DE_TENIR_LA_LISTE,
  ErreurListeNoire,
  ajouterALaListe,
  retirerDeLaListe,
} from '../../src/server/entreprise-connue/liste-noire';
import { MATRICE_DES_ROLES, ROLES_CONSOLE } from '../../src/server/roles/matrice';
import {
  LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE,
  limiteDesTracesDeLaListe,
  purgerLesTracesDeLaListe,
} from '../../src/server/taches/purger-traces-liste-noire';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { TACHES } from '../../src/server/taches/registre';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const T0 = new Date('2026-10-04T08:00:00.000Z');
const MINUTE = 60_000;

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

const unSiren = () => String(randomInt(100_000_000, 999_999_999));

async function utilisateur(role: ConsoleRole, desactive = false): Promise<string> {
  const u = await base.prisma.utilisateurConsole.create({
    // Un utilisateur actif porte son adresse, chiffrée et en empreinte (`utilisateurs_console_adresse_si_actif`).
    data: {
      role,
      creeAt: T0,
      desactiveAt: desactive ? T0 : null,
      emailChiffre: randomBytes(48),
      emailHash: randomBytes(32).toString('hex'),
    },
    select: { id: true },
  });
  return u.id;
}

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
  throw new Error('aucun refus');
}

const periodes = (siren: string) =>
  base.prisma.$queryRawUnsafe<
    {
      siren: string;
      motif: string;
      ajoute_par_id: string;
      ajoute_at: Date;
      retire_par_id: string | null;
      retire_at: Date | null;
    }[]
  >(
    `SELECT siren, motif::text AS motif, ajoute_par_id::text AS ajoute_par_id, ajoute_at,
            retire_par_id::text AS retire_par_id, retire_at
       FROM sirens_liste_noire_trace WHERE siren = $1 ORDER BY ajoute_at`,
    siren
  );

/** Inscrit un SIREN en SQL direct, sous `partners_app`, à une date choisie. */
async function inscrire(siren: string, auteur: string, at: Date): Promise<void> {
  await app.$executeRawUnsafe(
    `INSERT INTO sirens_liste_noire (siren, motif, ajoute_par_id, ajoute_at)
     VALUES ($1, 'financeur_public'::motif_liste_noire, $2::uuid, $3)`,
    siren,
    auteur,
    at
  );
}

// ── 1. la trace tenue par la base ────────────────────────────────────────────────────────────────

describe('REQ-DM-028 — chaque ajout et chaque retrait de la liste est tracé par la base', () => {
  it('REQ-DM-028 : un ajout ouvre une période — même SIREN, même catégorie, même auteur, même date', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    expect(await periodes(siren)).toEqual([
      {
        siren,
        motif: 'financeur_public',
        ajoute_par_id: auteur,
        ajoute_at: T0,
        retire_par_id: null,
        retire_at: null,
      },
    ]);
  });

  it('REQ-DM-028 : TÉMOIN — un retrait sans fermeture préalable de sa période est refusé, sur son nom', async () => {
    const siren = unSiren();
    await inscrire(siren, await utilisateur('admin'), T0);
    expect(
      await refus(app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire WHERE siren = $1`, siren))
    ).toContain('sirens_liste_noire_retrait_sans_trace');
    expect(await app.sirenListeNoire.count({ where: { siren } })).toBe(1);
  });

  it('REQ-DM-028 : un retrait tracé passe — la période fermée d’abord, puis la ligne supprimée', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    const retireur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    const retireAt = new Date(T0.getTime() + MINUTE);
    await app.$transaction([
      app.$executeRawUnsafe(
        `UPDATE sirens_liste_noire_trace SET retire_par_id = $2::uuid, retire_at = $3
          WHERE siren = $1 AND retire_at IS NULL`,
        siren,
        retireur,
        retireAt
      ),
      app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire WHERE siren = $1`, siren),
    ]);
    expect(await app.sirenListeNoire.count({ where: { siren } })).toBe(0);
    expect((await periodes(siren)).map((p) => [p.retire_par_id, p.retire_at])).toEqual([
      [retireur, retireAt],
    ]);
  });

  it('REQ-DM-028 : TÉMOIN — une inscription ne se modifie pas : changer de catégorie, c’est retirer puis ajouter', async () => {
    const siren = unSiren();
    await inscrire(siren, await utilisateur('admin'), T0);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE sirens_liste_noire SET motif = 'administration' WHERE siren = $1`,
          siren
        )
      )
    ).toContain('sirens_liste_noire_immuable');
  });

  it('REQ-DM-028 : TÉMOIN — une seconde période ouverte pour un même SIREN est refusée', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `INSERT INTO sirens_liste_noire_trace (id, siren, motif, ajoute_par_id, ajoute_at)
           VALUES (gen_random_uuid(), $1, 'administration'::motif_liste_noire, $2::uuid, $3)`,
          siren,
          auteur,
          new Date(T0.getTime() + MINUTE)
        )
      )
    ).toMatch(/23505[\s\S]*Key \(siren\)/);
    // Un refus levé en SQL brut ne nomme pas l'index : c'est `pg_indexes` qui prouve lequel tient.
    const [index] = await base.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'sirens_liste_noire_trace_une_ouverte'`
    );
    expect(index?.indexdef).toMatch(
      /^CREATE UNIQUE INDEX sirens_liste_noire_trace_une_ouverte ON public\.sirens_liste_noire_trace USING btree \(siren\) WHERE \(retire_at IS NULL\)$/
    );
  });

  it('REQ-DM-028 : TÉMOIN — la trace ne se réécrit pas, et ne se ferme qu’une fois', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    for (const reecriture of [
      `UPDATE sirens_liste_noire_trace SET motif = 'administration' WHERE siren = $1`,
      `UPDATE sirens_liste_noire_trace SET ajoute_at = ajoute_at - interval '1 day' WHERE siren = $1`,
      `UPDATE sirens_liste_noire_trace SET siren = '000000000' WHERE siren = $1`,
    ]) {
      expect(await refus(app.$executeRawUnsafe(reecriture, siren)), reecriture).toContain(
        'sirens_liste_noire_trace_garde'
      );
    }
    const fermer = (at: Date) =>
      app.$executeRawUnsafe(
        `UPDATE sirens_liste_noire_trace SET retire_par_id = $2::uuid, retire_at = $3 WHERE siren = $1`,
        siren,
        auteur,
        at
      );
    await fermer(new Date(T0.getTime() + MINUTE));
    expect(await refus(fermer(new Date(T0.getTime() + 2 * MINUTE)))).toContain(
      'sirens_liste_noire_trace_garde'
    );
  });

  it('REQ-DM-028 : TÉMOIN — une fermeture incomplète, ou antérieure à l’ajout, est refusée sur son nom', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE sirens_liste_noire_trace SET retire_at = $2 WHERE siren = $1`,
          siren,
          new Date(T0.getTime() + MINUTE)
        )
      )
    ).toContain('sirens_liste_noire_trace_retrait_lie');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `UPDATE sirens_liste_noire_trace SET retire_par_id = $2::uuid, retire_at = $3 WHERE siren = $1`,
          siren,
          auteur,
          new Date(T0.getTime() - MINUTE)
        )
      )
    ).toContain('sirens_liste_noire_trace_retrait_apres_ajout');
  });

  it('REQ-DM-028 : TÉMOIN — une période OUVERTE ne s’efface pas, ni par DELETE ni par TRUNCATE ; une période fermée, oui', async () => {
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    await inscrire(siren, auteur, T0);
    expect(
      await refus(
        app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire_trace WHERE siren = $1`, siren)
      )
    ).toContain('sirens_liste_noire_trace_garde');
    expect(
      await refus(base.prisma.$executeRawUnsafe(`TRUNCATE sirens_liste_noire_trace CASCADE`))
    ).toContain('sirens_liste_noire_trace_garde');

    await app.$transaction([
      app.$executeRawUnsafe(
        `UPDATE sirens_liste_noire_trace SET retire_par_id = $2::uuid, retire_at = $3 WHERE siren = $1`,
        siren,
        auteur,
        new Date(T0.getTime() + MINUTE)
      ),
      app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire WHERE siren = $1`, siren),
    ]);
    expect(
      await app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire_trace WHERE siren = $1`, siren)
    ).toBe(1);
  });

  it('REQ-DM-028 : TÉMOIN — la forme du SIREN de la trace est tenue par la base, sur son nom', async () => {
    const auteur = await utilisateur('admin');
    expect(
      await refus(
        app.$executeRawUnsafe(
          `INSERT INTO sirens_liste_noire_trace (id, siren, motif, ajoute_par_id, ajoute_at)
           VALUES (gen_random_uuid(), '12345678A', 'administration'::motif_liste_noire, $1::uuid, $2)`,
          auteur,
          T0
        )
      )
    ).toContain('sirens_liste_noire_trace_siren_forme');
  });

  it('REQ-DM-028 : la migration est additive, et ne recrée aucun déclencheur existant', async () => {
    const declencheurs = await base.prisma.$queryRawUnsafe<{ t: string; tgname: string }[]>(
      `SELECT c.relname AS t, g.tgname FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
        WHERE NOT g.tgisinternal AND c.relname IN ('sirens_liste_noire', 'sirens_liste_noire_trace')
        ORDER BY 1, 2`
    );
    expect(declencheurs).toEqual([
      { t: 'sirens_liste_noire', tgname: 'sirens_liste_noire_retrait_trace' },
      { t: 'sirens_liste_noire', tgname: 'sirens_liste_noire_tracer_ajout' },
      { t: 'sirens_liste_noire_trace', tgname: 'sirens_liste_noire_trace_garde' },
      { t: 'sirens_liste_noire_trace', tgname: 'sirens_liste_noire_trace_troncature' },
    ]);
  });
});

// ── 2. le report ─────────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-028 — le report : chaque inscription existante reçoit sa période ouverte', () => {
  it('REQ-DM-028 : le report donne à une inscription antérieure sa période ouverte, et une seule', async () => {
    // Le report est la seule ligne de données de la migration : rejoué sur une inscription posée
    // AVANT les déclencheurs (sous le propriétaire, déclencheur d'ajout neutralisé le temps d'une
    // transaction annulée), il lui donne sa période, et une seule.
    const siren = unSiren();
    const auteur = await utilisateur('admin');
    const annulee = new Error('annulee');
    let periodesApresReport: unknown = null;
    await base.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE sirens_liste_noire DISABLE TRIGGER sirens_liste_noire_tracer_ajout'
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO sirens_liste_noire (siren, motif, ajoute_par_id, ajoute_at)
           VALUES ($1, 'administration'::motif_liste_noire, $2::uuid, $3)`,
          siren,
          auteur,
          T0
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE sirens_liste_noire ENABLE TRIGGER sirens_liste_noire_tracer_ajout'
        );
        const migration = (await import('node:fs')).readFileSync(
          'prisma/migrations/20261003004900_sirens_liste_noire_trace/migration.sql',
          'utf8'
        );
        const report = /-- \(4\)[^\n]*\n(INSERT INTO[\s\S]*?;)/.exec(migration)?.[1];
        expect(report).toBeDefined();
        await tx.$executeRawUnsafe(
          `${report!.replace(/;\s*$/, '')} WHERE NOT EXISTS (
             SELECT 1 FROM sirens_liste_noire_trace t
              WHERE t.siren = sirens_liste_noire.siren AND t.retire_at IS NULL)`
        );
        periodesApresReport = await tx.$queryRawUnsafe(
          `SELECT siren, motif::text AS motif, ajoute_at, retire_at FROM sirens_liste_noire_trace
            WHERE siren = $1`,
          siren
        );
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    expect(periodesApresReport).toEqual([
      { siren, motif: 'administration', ajoute_at: T0, retire_at: null },
    ]);
  });
});

// ── 3. un rôle nommé ─────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-028 — ajouter et retirer sont réservés au rôle que la matrice nomme', () => {
  it('REQ-DM-028 : la matrice nomme le droit de tenir la liste, et le réserve à l’administrateur', () => {
    expect(DROIT_DE_TENIR_LA_LISTE).toBe('action:tenir_liste_noire');
    expect(MATRICE_DES_ROLES[DROIT_DE_TENIR_LA_LISTE]).toEqual(['admin']);
  });

  it('REQ-DM-028 : l’administrateur ajoute puis retire ; la période porte l’auteur et la date de chacun', async () => {
    const siren = unSiren();
    const ajouteur = await utilisateur('admin');
    const retireur = await utilisateur('admin');
    await ajouterALaListe(app, {
      siren,
      motif: 'organisme_de_formation_partenaire',
      auteurId: ajouteur,
    });
    const [ouverte] = await periodes(siren);
    expect(ouverte).toMatchObject({
      siren,
      motif: 'organisme_de_formation_partenaire',
      ajoute_par_id: ajouteur,
      retire_at: null,
    });
    const retireAt = new Date(ouverte!.ajoute_at.getTime() + MINUTE);
    await retirerDeLaListe(app, { siren, auteurId: retireur, maintenant: retireAt });
    expect(await app.sirenListeNoire.count({ where: { siren } })).toBe(0);
    expect((await periodes(siren)).map((p) => [p.retire_par_id, p.retire_at])).toEqual([
      [retireur, retireAt],
    ]);
  });

  it('REQ-DM-028 : TÉMOIN — tout autre rôle, et un administrateur désactivé, sont refusés sans rien écrire', async () => {
    const autres = ROLES_CONSOLE.filter((r) => r !== 'admin');
    expect(autres.length).toBeGreaterThan(0);
    const siren = unSiren();
    const auteurs = [
      ...(await Promise.all(autres.map((r) => utilisateur(r)))),
      await utilisateur('admin', true),
    ];
    for (const auteurId of auteurs) {
      const e = await refus(
        ajouterALaListe(app, { siren, motif: 'administration', auteurId }).then(() => undefined)
      );
      expect(e, auteurId).toMatch(/role_refuse/);
    }
    expect(await app.sirenListeNoire.count({ where: { siren } })).toBe(0);
    expect(await periodes(siren)).toEqual([]);

    const admin = await utilisateur('admin');
    await ajouterALaListe(app, { siren, motif: 'administration', auteurId: admin });
    for (const auteurId of auteurs) {
      const e = await refus(
        retirerDeLaListe(app, {
          siren,
          auteurId,
          maintenant: new Date(Date.now() + MINUTE),
        }).then(() => undefined)
      );
      expect(e, auteurId).toMatch(/role_refuse/);
    }
    expect(await app.sirenListeNoire.count({ where: { siren } })).toBe(1);
    expect((await periodes(siren)).map((p) => p.retire_at)).toEqual([null]);
  });

  it('REQ-DM-028 : TÉMOIN — un auteur inconnu est refusé comme un rôle refusé', async () => {
    const e = await refus(
      ajouterALaListe(app, { siren: unSiren(), motif: 'administration', auteurId: randomUUID() })
    );
    expect(e).toMatch(/role_refuse/);
  });

  it('REQ-DM-028 : un SIREN déjà inscrit est refusé, nommé ; un SIREN absent ne se retire pas, nommé', async () => {
    const siren = unSiren();
    const admin = await utilisateur('admin');
    await ajouterALaListe(app, { siren, motif: 'administration', auteurId: admin });
    const deja = await refus(
      ajouterALaListe(app, { siren, motif: 'financeur_public', auteurId: admin })
    );
    expect(deja).toMatch(/deja_inscrit/);
    const absent = await refus(
      retirerDeLaListe(app, {
        siren: unSiren(),
        auteurId: admin,
        maintenant: new Date(Date.now() + MINUTE),
      })
    );
    expect(absent).toMatch(/absent/);
  });

  it('REQ-DM-028 : les refus sont des `ErreurListeNoire`, au code nommé', async () => {
    try {
      await ajouterALaListe(app, {
        siren: unSiren(),
        motif: 'administration',
        auteurId: await utilisateur('lecteur'),
      });
      throw new Error('aucun refus');
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurListeNoire);
      expect((e as ErreurListeNoire).code).toBe('role_refuse');
    }
  });

  it('REQ-DM-028 : retirer puis ajouter de nouveau ouvre une seconde période ; la première reste fermée', async () => {
    const siren = unSiren();
    const admin = await utilisateur('admin');
    await ajouterALaListe(app, { siren, motif: 'administration', auteurId: admin });
    await retirerDeLaListe(app, {
      siren,
      auteurId: admin,
      maintenant: new Date(Date.now() + MINUTE),
    });
    await ajouterALaListe(app, { siren, motif: 'financeur_paritaire', auteurId: admin });
    const p = await periodes(siren);
    expect(p.map((x) => [x.motif, x.retire_at === null])).toEqual([
      ['administration', false],
      ['financeur_paritaire', true],
    ]);
  });
});

// ── 4. ce que la projection locale en lit ────────────────────────────────────────────────────────

describe('REQ-DM-029 — la projection locale lit la liste : un SIREN retiré redevient déclarable', () => {
  it('REQ-DM-029 : inscrit, le SIREN est connu sous sa catégorie ; retiré, il ne l’est plus', async () => {
    const siren = unSiren();
    const admin = await utilisateur('admin');
    const maintenant = new Date(Date.now() + MINUTE);
    await ajouterALaListe(app, { siren, motif: 'financeur_paritaire', auteurId: admin });
    expect(await anterioriteDe(app, siren, maintenant)).toEqual({
      connue: true,
      origine: 'financeur',
      depuis: null,
      categorie: 'financeur_paritaire',
    });
    await retirerDeLaListe(app, { siren, auteurId: admin, maintenant });
    expect((await anterioriteDe(app, siren, maintenant)).connue).toBe(false);
  });
});

// ── 5. la purge à cinq ans ───────────────────────────────────────────────────────────────────────

describe('REQ-DM-028 — la trace d’un retrait est gardée cinq ans, puis effacée', () => {
  /** Une période inscrite à `ajoute`, retirée à `retire`, sous `partners_app`. */
  async function periodeFermee(ajoute: Date, retire: Date): Promise<string> {
    const siren = unSiren();
    const admin = await utilisateur('admin');
    await inscrire(siren, admin, ajoute);
    await app.$transaction([
      app.$executeRawUnsafe(
        `UPDATE sirens_liste_noire_trace SET retire_par_id = $2::uuid, retire_at = $3
          WHERE siren = $1 AND retire_at IS NULL`,
        siren,
        admin,
        retire
      ),
      app.$executeRawUnsafe(`DELETE FROM sirens_liste_noire WHERE siren = $1`, siren),
    ]);
    return siren;
  }

  /** L'échéance d'une période retirée à `retire` : cinq ans civils plus tard, en UTC. */
  const echeance = (retire: Date) => {
    const d = new Date(retire.getTime());
    d.setUTCFullYear(d.getUTCFullYear() + SEUILS.LISTE_NOIRE_TRACE_ANS.valeur);
    return d;
  };

  it('REQ-DM-028 : la durée vit dans la SSOT des rétentions — cinq ans, avec sa source', () => {
    expect(SEUILS.LISTE_NOIRE_TRACE_ANS).toMatchObject({ valeur: 5, unite: 'ans' });
    expect(SEUILS.LISTE_NOIRE_TRACE_ANS.source).toMatch(/registre de l.article 30|juriste/);
  });

  it('REQ-DM-028 : la limite est l’instant moins cinq ans civils, en UTC', () => {
    expect(limiteDesTracesDeLaListe(new Date('2031-10-04T08:00:00.000Z'))).toEqual(
      new Date('2026-10-04T08:00:00.000Z')
    );
  });

  it('REQ-DM-028 : à la milliseconde — l’échéance moins 1 ms est gardée, l’échéance pile est effacée', async () => {
    const retire = new Date(T0.getTime() + MINUTE);
    const siren = await periodeFermee(T0, retire);
    const fin = echeance(retire);

    await purgerLesTracesDeLaListe(app, new Date(fin.getTime() - 1));
    expect(await periodes(siren)).toHaveLength(1);

    await purgerLesTracesDeLaListe(app, fin);
    expect(await periodes(siren)).toEqual([]);
  });

  it('REQ-DM-028 : une période OUVERTE n’est jamais touchée, quelle que soit son ancienneté', async () => {
    const siren = unSiren();
    await inscrire(siren, await utilisateur('admin'), new Date('2000-01-01T00:00:00.000Z'));
    await purgerLesTracesDeLaListe(app, new Date('2100-01-01T00:00:00.000Z'));
    expect((await periodes(siren)).map((p) => p.retire_at)).toEqual([null]);
  });

  it('REQ-DM-028 : la purge va par lots bornés jusqu’à épuisement, et rend le nombre effacé', async () => {
    const retire = new Date('2001-01-01T00:00:00.000Z');
    const ajoute = new Date('2000-01-01T00:00:00.000Z');
    const sirens: string[] = [];
    for (let i = 0; i < 3; i += 1) sirens.push(await periodeFermee(ajoute, retire));
    const { effacees } = await purgerLesTracesDeLaListe(app, echeance(retire));
    expect(effacees).toBeGreaterThanOrEqual(3);
    for (const s of sirens) expect(await periodes(s)).toEqual([]);
    expect(LOT_DE_PURGE_DES_TRACES_DE_LA_LISTE).toBeGreaterThan(0);
    expect((await purgerLesTracesDeLaListe(app, echeance(retire))).effacees).toBe(0);
  });

  it('REQ-DM-028 : la purge est une tâche du registre, sous sa clé', () => {
    expect(TACHES.traces_liste_noire_purger).toEqual({ req: 'REQ-DM-028' });
  });

  it('REQ-DM-028 : TÉMOIN statique — seule la tâche de purge efface la trace', () => {
    const fichiers = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const effaceurs = fichiers.filter((f) =>
      /sirenListeNoireTrace\.(delete|deleteMany)\b|DELETE\s+FROM\s+"?sirens_liste_noire_trace\b/i.test(
        readFileSync(f, 'utf8')
      )
    );
    expect(effaceurs).toEqual(['src/server/taches/purger-traces-liste-noire.ts']);
  });
});

describe('REQ-DM-028 — l’apporteur est informé de l’existence et du principe de la liste', () => {
  it('REQ-DM-028 : le texte de l’aide du dépôt est celui de la juriste, MOT POUR MOT', () => {
    expect(INFORMATION_LISTE_TENUE).toBe(
      "Axion-IA tient une liste d'organismes avec lesquels elle est déjà en relation : administrations, financeurs publics ou paritaires, et organismes de formation. Une entreprise qui y figure ne peut pas être déposée, et le refus vous indique cette catégorie (contrat, article 3.3 bis)."
    );
  });
});
