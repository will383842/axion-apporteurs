// @req REQ-DM-002
// @req REQ-DM-003
// @req REQ-DM-004
// @req REQ-DM-005
// @req REQ-DM-030
// @req REQ-DM-048
// @req REQ-SEC-014
/**
 * DM-07, en base RÉELLE — la table `attributions` telle que la migration la pose.
 *
 * CE QU'IL PROUVE :
 *   1. L'INDEX OCCUPANT (REQ-DM-003). Lu dans `pg_indexes` APRÈS `prisma migrate deploy` : un seul
 *      index unique partiel sur `siren`, dont l'ENSEMBLE des états du prédicat — réécrit par
 *      PostgreSQL en `= ANY (ARRAY[…])` — égale `ETATS_OCCUPANTS`. La même fonction que la garde
 *      (`fautesIndexOccupant`) le juge. Et la base refuse un second occupant sur un SIREN.
 *   2. LA FILE (REQ-DM-004) : `UNIQUE (siren, rang_attente) WHERE statut = 'en_attente'`, prédicat
 *      exact ; deux rangs au plus, chacun une fois ; un rang hors de 1 et 2 est refusé.
 *   3. L'HORLOGE DU DÉPÔT (REQ-DM-005, REQ-SEC-014, HYP-A02-PRECISION-DEPOT) : une valeur forgée est
 *      écrasée ; deux dépôts sérialisés sous le verrou consultatif du SIREN (celui que la tâche du
 *      verrou de dépôt prendra, simulé ici) ont des `deposee_at` STRICTEMENT croissants dans leur ordre réel ; la
 *      précision est la microseconde ; une fois posée, la valeur ne se réécrit pas.
 *   4. LE PORTEUR (REQ-DM-048, W19) : exactement un porteur ; une grille si et seulement si le
 *      porteur est un apporteur (attribution d'apporteur sans grille refusée — reprise du témoin de la grille
 *      —, avec une version existante elle passe) ; le canal `console` si et seulement si
 *      le porteur est un conseiller ; un porteur console d'un autre rôle refusé par le DÉCLENCHEUR ;
 *      l'occupation d'un SIREN vaut pour les deux porteurs, dans les deux sens.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { fautesIndexOccupant, cibleDeLIndex, texteDeLaReq } from '../../scripts/gates/schema-enums';
import { ETATS_OCCUPANTS } from '../../src/domain/attribution/etats';

let base: Base;
let grilleId: string;
let apporteurA: string;
let apporteurB: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');

let sirens = 100000000;
/** Un SIREN neuf par test : les témoins ne se gênent pas les uns les autres. */
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

type Ligne = {
  apporteurId?: string | null;
  utilisateurConsoleId?: string | null;
  statut?: string;
  rangAttente?: number | null;
  siren: string;
  canal?: string;
  grilleCommissionId?: string | null;
  deposeeAt?: Date;
};

/** Insère une attribution par SQL brut — c'est la BASE qu'on juge, pas le client. */
async function inserer(l: Ligne, client: Pick<Base['prisma'], '$queryRawUnsafe'> = base.prisma) {
  const porteurApporteur = l.apporteurId !== undefined ? l.apporteurId : apporteurA;
  const [r] = await client.$queryRawUnsafe<{ id: string; deposee_at: Date; brut: string }[]>(
    `INSERT INTO attributions (id, apporteur_id, utilisateur_console_id, statut, rang_attente, siren,
       canal, grille_commission_id, deposee_at, date_contact, verification_prioritaire,
       entreprise_a_verifier, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::etat_attribution, $5, $6, $7::canal_depot, $8::uuid,
       COALESCE($9::timestamptz, clock_timestamp()), '2026-10-01', false, false, false)
     RETURNING id, deposee_at, deposee_at::text AS brut`,
    randomUUID(),
    porteurApporteur,
    l.utilisateurConsoleId ?? null,
    l.statut ?? 'active',
    l.rangAttente ?? null,
    l.siren,
    l.canal ?? 'espace',
    l.grilleCommissionId !== undefined ? l.grilleCommissionId : grilleId,
    l.deposeeAt ?? null
  );
  return r!;
}

async function refus(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

/**
 * Une violation d'unicité : Prisma la rapporte par le code SQL et les COLONNES de l'index, sans son
 * nom — et ces colonnes désignent un seul index, puisque `(siren)` seul et `(siren, rang_attente)`
 * n'ont chacun qu'un index unique sur la table (le premier `describe` le prouve sur `pg_indexes`).
 */
// Mesuré en CI (Prisma 5.22, Postgres 16) : « Raw query failed. Code: `23505`. Message: `Key
// (siren)=(…) already exists.` » — le code SQL et les COLONNES de l'index, jamais son nom.
const UNIQUE_OCCUPANT = /`23505`[\s\S]*Key \(siren\)=/;
const UNIQUE_RANG = /`23505`[\s\S]*Key \(siren, rang_attente\)=/;

async function definitions(): Promise<string[]> {
  const l = await base.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'attributions' ORDER BY indexname"
  );
  return l.map((x) => x.indexdef);
}

/** Les littéraux d'un prédicat réécrit — `'x'::etat_attribution` —, en ENSEMBLE. */
const litteraux = (def: string) =>
  new Set([...def.matchAll(/'([a-z_]+)'::etat_attribution/g)].map((m) => m[1]!));

describe('REQ-DM-003 — l’index occupant de `attributions`, lu dans pg_indexes', () => {
  const cible = cibleDeLIndex(texteDeLaReq('REQ-DM-003'));

  it('REQ-DM-003 : UN index unique partiel sur siren, dont l’ensemble des états égale ETATS_OCCUPANTS — et la garde n’y voit aucune faute', async () => {
    expect(cible?.table).toBe('attributions');
    const occupants = (await definitions()).filter(
      (d) => d.startsWith('CREATE UNIQUE INDEX') && /\(siren\) WHERE/.test(d)
    );
    expect(occupants).toHaveLength(1);
    expect(litteraux(occupants[0]!)).toEqual(new Set(ETATS_OCCUPANTS));
    expect(
      fautesIndexOccupant(occupants[0]!, 'attributions', {
        colonne: cible!.colonne,
        colonneEtat: cible!.colonneEtat,
        occupants: ETATS_OCCUPANTS,
      })
    ).toEqual([]);
  });

  it('REQ-DM-003 : la base refuse un second occupant sur un SIREN ; un état qui n’occupe pas passe', async () => {
    const siren = unSiren();
    await inserer({ siren, statut: ETATS_OCCUPANTS[0] });
    expect(
      await refus(inserer({ siren, statut: ETATS_OCCUPANTS[1], apporteurId: apporteurB }))
    ).toMatch(UNIQUE_OCCUPANT);
    await expect(
      inserer({ siren, statut: 'perdue', apporteurId: apporteurB })
    ).resolves.toBeDefined();
  });
});

describe('REQ-DM-004 — la file : deux rangs au plus par SIREN', () => {
  it('REQ-DM-004 : l’index (siren, rang_attente) porte EXACTEMENT le prédicat statut = en_attente', async () => {
    const rang = (await definitions()).filter((d) => d.includes('(siren, rang_attente)'));
    expect(rang).toHaveLength(1);
    expect(rang[0]).toMatch(/^CREATE UNIQUE INDEX/);
    expect(rang[0]).toMatch(/WHERE \(statut = 'en_attente'::etat_attribution\)$/);
  });

  it('REQ-DM-004 : rangs 1 et 2 passent, chacun une fois ; un troisième rang est refusé ; en_attente sans rang est refusé', async () => {
    const siren = unSiren();
    await inserer({ siren, statut: 'en_attente', rangAttente: 1 });
    await inserer({ siren, statut: 'en_attente', rangAttente: 2, apporteurId: apporteurB });
    expect(await refus(inserer({ siren, statut: 'en_attente', rangAttente: 2 }))).toMatch(
      UNIQUE_RANG
    );
    expect(await refus(inserer({ siren, statut: 'en_attente', rangAttente: 3 }))).toMatch(
      /attributions_rang_attente/
    );
    expect(await refus(inserer({ siren: unSiren(), statut: 'en_attente' }))).toMatch(
      /attributions_rang_attente/
    );
    expect(await refus(inserer({ siren: unSiren(), statut: 'active', rangAttente: 1 }))).toMatch(
      /attributions_rang_attente/
    );
  });
});

describe('REQ-DM-005 — l’horloge du dépôt est celle de la base, sous le verrou', () => {
  it('REQ-DM-005 : TÉMOIN — une valeur FORGÉE est écrasée par l’horloge de la base', async () => {
    const forgee = new Date('2001-01-01T00:00:00.000Z');
    const avant = Date.now();
    const l = await inserer({ siren: unSiren(), statut: 'perdue', deposeeAt: forgee });
    expect(l.deposee_at.getTime()).not.toBe(forgee.getTime());
    expect(l.deposee_at.getTime()).toBeGreaterThanOrEqual(avant - 60_000);
  });

  it('REQ-SEC-014 : la colonne est en microsecondes, et elle seule de la table', async () => {
    const col = await base.prisma.$queryRawUnsafe<{ column_name: string; precision: number }[]>(
      `SELECT column_name, datetime_precision AS precision FROM information_schema.columns
       WHERE table_name = 'attributions' AND data_type = 'timestamp with time zone'`
    );
    const en6 = col.filter((c) => Number(c.precision) === 6).map((c) => c.column_name);
    expect(en6).toEqual(['deposee_at']);
  });

  it('REQ-SEC-014 : deux dépôts SÉRIALISÉS sous le verrou du SIREN ont des deposee_at strictement croissants, dans leur ordre réel', async () => {
    const siren = unSiren();
    const ordre: { brut: string; deposee_at: Date }[] = [];
    // Le verrou de SEC-12, simulé : chaque dépôt prend `pg_advisory_xact_lock` sur le SIREN AVANT
    // d'écrire. Le second, lancé pendant que le premier tient le verrou, attend sa fin.
    const deposer = (statut: string, apporteurId: string, pause: number) =>
      base.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', siren);
        const l = await inserer({ siren, statut, apporteurId }, tx);
        ordre.push(l);
        await tx.$executeRawUnsafe(`SELECT pg_sleep(${pause})`);
      });
    const premier = deposer('perdue', apporteurA, 0.3);
    await new Promise((r) => setTimeout(r, 50));
    const second = deposer('perimee', apporteurB, 0);
    await Promise.all([premier, second]);
    expect(ordre).toHaveLength(2);
    // Comparés en TEXTE, à la microseconde : un `Date` JS tronque à la milliseconde.
    expect(ordre[0]!.brut < ordre[1]!.brut).toBe(true);
  });

  it('REQ-DM-005 : une fois posée, deposee_at ne se réécrit pas', async () => {
    const l = await inserer({ siren: unSiren(), statut: 'perdue' });
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE attributions SET deposee_at = deposee_at - interval '1 day' WHERE id = $1::uuid`,
          l.id
        )
      )
    ).toMatch(/attributions_horloge_du_depot/);
  });
});

describe('REQ-DM-048 — le porteur exclusif (W19)', () => {
  const annulee = new Error('annulee');
  /**
   * Le rôle `conseiller_salarie` n'existe pas avant SEC-31 : le déclencheur du porteur refuserait
   * TOUT conseiller, et — déclencheur BEFORE — avant les CHECK. Neutralisé le temps d'une
   * transaction ANNULÉE, il laisse juger les contraintes seules ; rendue, la base l'a réactivé.
   */
  async function sansLeDeclencheurDuRole(
    corps: (tx: Pick<Base['prisma'], '$queryRawUnsafe'>) => Promise<string>
  ): Promise<string> {
    let message = '';
    await base.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE attributions DISABLE TRIGGER attributions_porteur_conseiller'
        );
        message = await corps(tx);
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    return message;
  }

  async function utilisateur(role: string): Promise<string> {
    const [u] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at)
       VALUES ($1::uuid, $2::console_role, '\\x01'::bytea, $3, $4) RETURNING id`,
      randomUUID(),
      role,
      hex(32),
      MAINTENANT
    );
    return u!.id;
  }

  it('REQ-DM-048 : TÉMOIN À DEUX FACES sur la grille — une attribution d’apporteur sans grille est refusée ; avec une version existante, elle passe', async () => {
    expect(
      await refus(inserer({ siren: unSiren(), statut: 'perdue', grilleCommissionId: null }))
    ).toMatch(/attributions_grille_de_l_apporteur/);
    await expect(inserer({ siren: unSiren(), statut: 'perdue' })).resolves.toBeDefined();
    expect(
      await refus(inserer({ siren: unSiren(), statut: 'perdue', grilleCommissionId: randomUUID() }))
    ).toMatch(/attributions_grille_commission_id_fkey|foreign key/);
  });

  it('REQ-DM-048 : ni zéro ni deux porteurs', async () => {
    const qualifieur = await utilisateur('qualifieur');
    expect(
      await refus(inserer({ siren: unSiren(), apporteurId: null, grilleCommissionId: null }))
    ).toMatch(/attributions_un_seul_porteur/);
    expect(
      await sansLeDeclencheurDuRole((tx) =>
        refus(inserer({ siren: unSiren(), utilisateurConsoleId: qualifieur, canal: 'console' }, tx))
      )
    ).toMatch(/attributions_un_seul_porteur/);
  });

  it('REQ-DM-048 : le canal console est réservé au conseiller — un apporteur sur ce canal est refusé', async () => {
    expect(await refus(inserer({ siren: unSiren(), canal: 'console' }))).toMatch(
      /attributions_canal_du_conseiller/
    );
  });

  it('REQ-DM-048 : un porteur console de rôle qualifieur est refusé PAR LE DÉCLENCHEUR, même avec des colonnes cohérentes', async () => {
    const qualifieur = await utilisateur('qualifieur');
    expect(
      await refus(
        inserer({
          siren: unSiren(),
          apporteurId: null,
          utilisateurConsoleId: qualifieur,
          canal: 'console',
          grilleCommissionId: null,
        })
      )
    ).toMatch(/attributions_porteur_conseiller/);
  });

  it('REQ-DM-048 : un conseiller avec une grille est refusé ; un conseiller hors du canal console aussi', async () => {
    const conseiller = await utilisateur('qualifieur');
    expect(
      await sansLeDeclencheurDuRole((tx) =>
        refus(
          inserer(
            {
              siren: unSiren(),
              apporteurId: null,
              utilisateurConsoleId: conseiller,
              canal: 'console',
            },
            tx
          )
        )
      )
    ).toMatch(/attributions_grille_de_l_apporteur/);
    expect(
      await sansLeDeclencheurDuRole((tx) =>
        refus(
          inserer(
            {
              siren: unSiren(),
              apporteurId: null,
              utilisateurConsoleId: conseiller,
              canal: 'espace',
              grilleCommissionId: null,
            },
            tx
          )
        )
      )
    ).toMatch(/attributions_canal_du_conseiller/);
  });

  it('REQ-DM-048 : l’occupation vaut pour les DEUX porteurs, dans les deux sens (déclencheur du rôle neutralisé dans la transaction : on juge l’index seul)', async () => {
    const conseiller = await utilisateur('qualifieur');
    for (const premierEstApporteur of [true, false]) {
      const siren = unSiren();
      const apporteur: Ligne = { siren, statut: 'active' };
      const prise: Ligne = {
        siren,
        statut: 'active',
        apporteurId: null,
        utilisateurConsoleId: conseiller,
        canal: 'console',
        grilleCommissionId: null,
      };
      const [d1, d2] = premierEstApporteur ? [apporteur, prise] : [prise, apporteur];
      const message = await sansLeDeclencheurDuRole(async (tx) => {
        await inserer(d1, tx);
        return refus(inserer(d2, tx));
      });
      expect(message).toMatch(UNIQUE_OCCUPANT);
    }
    const [etat] = await base.prisma.$queryRawUnsafe<{ actif: boolean }[]>(
      `SELECT tgenabled <> 'D' AS actif FROM pg_trigger WHERE tgname = 'attributions_porteur_conseiller'`
    );
    expect(etat?.actif).toBe(true);
  });
});

describe('REQ-DM-002 — la clé d’attribution est le SIREN normalisé ; le SIRET en est le contexte', () => {
  /** Une attribution au SIREN et au SIRET donnés, par SQL brut : c'est la BASE qu'on juge. */
  const ecrire = (siren: string, siret: string | null) =>
    base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, siret, canal, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare)
       VALUES ($1::uuid, $2::uuid, 'perdue', $3, $4, 'espace', $5::uuid, '2026-10-01', false, false, false)`,
      randomUUID(),
      apporteurA,
      siren,
      siret,
      grilleId
    );

  it('REQ-DM-002 : un SIREN de neuf caractères au plus, hors de neuf chiffres, est refusé par le CHECK attributions_siren_forme', async () => {
    for (const faux of ['12345678', '12345678A', '12345 678']) {
      expect(await refus(ecrire(faux, null))).toContain('attributions_siren_forme');
    }
    await expect(ecrire(unSiren(), null)).resolves.toBe(1);
  });

  it('REQ-DM-002 : un SIREN de dix chiffres est refusé AVANT le CHECK, par le type de la colonne (22001, char(9))', async () => {
    expect(await refus(ecrire('1234567890', null))).toMatch(
      /22001|too long for type character\(9\)/
    );
  });

  it('REQ-DM-002 : un SIRET présent a quatorze chiffres, et ses neuf premiers sont le SIREN', async () => {
    const siren = unSiren();
    expect(await refus(ecrire(siren, `${siren}0001`))).toContain('attributions_siret_forme');
    expect(await refus(ecrire(siren, `${unSiren()}00012`))).toContain('attributions_siret_forme');
    await expect(ecrire(siren, `${siren}00012`)).resolves.toBe(1);
  });
});

describe('REQ-DM-030 — l’entreprise est stockée STRUCTURÉE, jamais en adresse libre', () => {
  it('REQ-DM-030 : les colonnes structurées rendues par l’API sont présentes ; aucune colonne d’adresse en texte libre', async () => {
    const colonnes = (
      await base.prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'attributions'`
      )
    ).map((c) => c.column_name);
    for (const attendue of [
      'raison_sociale',
      'siret',
      'code_postal_chiffre',
      'commune_siege',
      'departement',
      'region',
      'code_naf',
      'tranche_effectif',
      'nature_juridique',
      'etat_administratif',
      'dirigeants_json',
    ]) {
      expect(colonnes).toContain(attendue);
    }
    expect(colonnes.filter((c) => /adresse|address|rue|voie/.test(c))).toEqual([]);
  });
});
