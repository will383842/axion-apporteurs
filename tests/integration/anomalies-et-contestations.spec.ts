// @req REQ-DM-032
// @req REQ-DM-033
// @req REQ-DM-034
// @req REQ-DM-043
/**
 * DM-12 — vérifications, alertes de libération, anomalies, rattachements manuels et contestations,
 * en base RÉELLE, dans la forme d'A02 (2026-10-03).
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures,
 * les lectures et les TRUNCATE restent sous le propriétaire (`partners_app` n'a pas ce droit : sous
 * lui, le refus prouverait le droit, pas le déclencheur). Chaque refus est attendu sur son NOM.
 *
 * Le rôle `conseiller_salarie` n'existe pas encore dans `console_role` : le refus d'un conseiller se juge par la
 * fonction partagée (son corps compare `role::text`) et par les arguments de ses déclencheurs, qui
 * nomment chacun une colonne de leur table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;
let adminId: string;

const MAINTENANT = new Date('2026-10-03T08:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 600000000;
const unSiren = () => String((sirens += 1));

const GABARIT = 'refuser_modification_sauf';
const ANOMALIES = 'anomalies_refuser_substitution';
const CONTESTATIONS = 'contestations_refuser_substitution';
const CONSEILLER = 'refuser_acteur_conseiller';

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
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
  apporteurId = (
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
  adminId = await utilisateur('admin');
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

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

/** Une attribution `provisoire` d'apporteur, par SQL brut ; rend son id et sa date de dépôt. */
async function uneAttribution(): Promise<{ id: string; deposeeAt: Date }> {
  const id = randomUUID();
  const bloc = () => randomBytes(40);
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier,
       nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
       phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
     VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'espace', $4::uuid, '2026-10-01',
       false, false, $5, $6, $7, $8, $9, $10, $11, $12, false)`,
    id,
    apporteurId,
    unSiren(),
    grilleId,
    bloc(),
    bloc(),
    bloc(),
    hex(32),
    bloc(),
    hex(32),
    bloc(),
    bloc()
  );
  const [l] = await base.prisma.$queryRaw<{ d: Date }[]>`
    SELECT deposee_at AS d FROM attributions WHERE id = ${id}::uuid`;
  return { id, deposeeAt: l!.d };
}

async function unRefus(): Promise<string> {
  const [r] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO depots_refuses (id, apporteur_id, siren, motif, canal, refuse_at)
     VALUES ($1::uuid, $2::uuid, $3, 'anteriorite_client', 'espace', $4) RETURNING id`,
    randomUUID(),
    apporteurId,
    unSiren(),
    MAINTENANT
  );
  return r!.id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

/** Une écriture du SERVEUR, sous `partners_app`. */
const ecrire = (sql: string, ...valeurs: unknown[]) => app.$executeRawUnsafe(sql, ...valeurs);
/** Une troncature, sous le seul rôle qui pourrait tronquer. */
const tronquer = (table: string) => base.prisma.$executeRawUnsafe(`TRUNCATE ${table} CASCADE`);

async function uneVerification(p: { ipHash?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await ecrire(
    `INSERT INTO verifications (id, apporteur_id, siren, resultat, ip_hash, verifiee_at)
     VALUES ($1::uuid, $2::uuid, $3, 'libre', $4, $5)`,
    id,
    apporteurId,
    unSiren(),
    p.ipHash === undefined ? hex(8) : p.ipHash,
    MAINTENANT
  );
  return id;
}

describe('REQ-DM-032 — verifications : un porteur, en ajout seul, l’empreinte d’IP purgeable une fois', () => {
  it('REQ-DM-032 : TÉMOIN — aucun porteur, ou les deux : refusé (verifications_porteur_unique)', async () => {
    for (const [a, u] of [
      [null, null],
      [apporteurId, adminId],
    ]) {
      expect(
        await refus(
          ecrire(
            `INSERT INTO verifications (id, apporteur_id, utilisateur_console_id, siren, resultat, verifiee_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'libre', $5)`,
            randomUUID(),
            a,
            u,
            unSiren(),
            MAINTENANT
          )
        )
      ).toContain('verifications_porteur_unique');
    }
  });

  it('REQ-DM-032 : TÉMOIN — un porteur console qui n’est pas conseiller est refusé (verifications_porteur_conseiller)', async () => {
    expect(
      await refus(
        ecrire(
          `INSERT INTO verifications (id, utilisateur_console_id, siren, resultat, verifiee_at)
           VALUES ($1::uuid, $2::uuid, $3, 'libre', $4)`,
          randomUUID(),
          adminId,
          unSiren(),
          MAINTENANT
        )
      )
    ).toContain('verifications_porteur_conseiller');
  });

  it('REQ-DM-032 : TÉMOIN — une vérification qui naît SANS empreinte d’adresse réseau est refusée (verifications_ip_hash_purge_liee)', async () => {
    expect(await refus(uneVerification({ ipHash: null }))).toContain(
      'verifications_ip_hash_purge_liee'
    );
  });

  it('REQ-DM-032 : TÉMOIN — la purge de l’empreinte : ensemble, acceptée ; à moitié, ou une seconde fois, refusée', async () => {
    const id = await uneVerification();
    expect(
      await refus(ecrire(`UPDATE verifications SET ip_hash = NULL WHERE id = $1::uuid`, id))
    ).toContain('verifications_ip_hash_purge_liee');
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          MAINTENANT
        )
      )
    ).toContain('verifications_ip_hash_purge_liee');
    await ecrire(
      `UPDATE verifications SET ip_hash = NULL, empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(ecrire(`UPDATE verifications SET ip_hash = $2 WHERE id = $1::uuid`, id, hex(8)))
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE verifications SET empreinte_reseau_purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
  });

  it('REQ-DM-032 : TÉMOIN — toute autre colonne réécrite, DELETE et TRUNCATE : refusés', async () => {
    const id = await uneVerification();
    expect(
      await refus(ecrire(`UPDATE verifications SET resultat = 'fermee' WHERE id = $1::uuid`, id))
    ).toContain(GABARIT);
    expect(
      await refus(ecrire(`UPDATE verifications SET siren = $2 WHERE id = $1::uuid`, id, unSiren()))
    ).toContain(GABARIT);
    expect(await refus(ecrire(`DELETE FROM verifications WHERE id = $1::uuid`, id))).toContain(
      GABARIT
    );
    expect(await refus(tronquer('verifications'))).toContain(GABARIT);
  });
});

describe('REQ-DM-032 — alertes_liberation : une seule en attente, l’envoi posé une fois', () => {
  it('REQ-DM-032 : TÉMOIN — deux alertes en attente pour le même SIREN : refusé ; après l’envoi, une neuve passe', async () => {
    const siren = unSiren();
    const nouvelle = () =>
      ecrire(
        `INSERT INTO alertes_liberation (id, apporteur_id, siren, cree_at) VALUES ($1::uuid, $2::uuid, $3, $4)`,
        randomUUID(),
        apporteurId,
        siren,
        MAINTENANT
      );
    await nouvelle();
    expect(await refus(nouvelle())).toContain('alertes_liberation_une_en_attente');
    await ecrire(
      `UPDATE alertes_liberation SET envoyee_at = $2 WHERE apporteur_id = $1::uuid AND siren = $3`,
      apporteurId,
      MAINTENANT,
      siren
    );
    await expect(nouvelle()).resolves.toBe(1);
    expect(
      await refus(
        ecrire(
          `UPDATE alertes_liberation SET envoyee_at = $3
           WHERE apporteur_id = $1::uuid AND siren = $2 AND envoyee_at IS NOT NULL`,
          apporteurId,
          siren,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
    expect(await refus(tronquer('alertes_liberation'))).toContain(GABARIT);
  });
});

describe('REQ-DM-033 — anomalies : la forme, une clôture une seule fois, sans retour', () => {
  async function uneAnomalie(
    type = 'auto_parrainage',
    score: number | null = null
  ): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO anomalies (id, type, score, apporteur_id, statut, ouverte_at)
       VALUES ($1::uuid, $2::type_anomalie, $3, $4::uuid, 'ouverte', $5)`,
      id,
      type,
      score,
      apporteurId,
      MAINTENANT
    );
    return id;
  }

  it('REQ-DM-033 : TÉMOIN — le score n’existe que pour la sincérité (anomalies_score_sincerite)', async () => {
    await expect(uneAnomalie('sincerite', 40)).resolves.toBeDefined();
    expect(await refus(uneAnomalie('sincerite', null))).toContain('anomalies_score_sincerite');
    expect(await refus(uneAnomalie('auto_parrainage', 40))).toContain('anomalies_score_sincerite');
    expect(await refus(uneAnomalie('sincerite', 101))).toContain('anomalies_score_sincerite');
  });

  it('REQ-DM-033 : TÉMOIN — un type de RYTHME ou d’appareil n’existe pas : la base refuse ramassage et appareil_inconnu', async () => {
    const [e] = await base.prisma.$queryRaw<{ valeurs: string[] }[]>`
      SELECT enum_range(NULL::type_anomalie)::text[] AS valeurs`;
    expect(e!.valeurs).toEqual(['sincerite', 'auto_parrainage']);
    for (const type of ['ramassage', 'appareil_inconnu']) {
      expect(await refus(uneAnomalie(type)), type).toMatch(/type_anomalie/);
    }
  });

  it('REQ-DM-033 : TÉMOIN — la clôture pose statut, traite_at, traite_par_id et justification ENSEMBLE, une fois', async () => {
    const id = await uneAnomalie();
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'levee' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    await ecrire(
      `UPDATE anomalies SET statut = 'levee', traite_at = $2, traite_par_id = $3::uuid,
         justification = 'levée après vérification du dossier'
       WHERE id = $1::uuid`,
      id,
      MAINTENANT,
      adminId
    );
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'confirmee' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(
      await refus(ecrire(`UPDATE anomalies SET statut = 'ouverte' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
    expect(
      await refus(ecrire(`UPDATE anomalies SET justification = 'autre' WHERE id = $1::uuid`, id))
    ).toContain(ANOMALIES);
  });

  it('REQ-DM-033 : TÉMOIN — l’identité est figée ; DELETE et TRUNCATE refusés', async () => {
    const id = await uneAnomalie();
    expect(
      await refus(
        ecrire(`UPDATE anomalies SET type = 'sincerite', score = 10 WHERE id = $1::uuid`, id)
      )
    ).toContain(ANOMALIES);
    expect(
      await refus(
        ecrire(`UPDATE anomalies SET ouverte_at = $2 WHERE id = $1::uuid`, id, new Date())
      )
    ).toContain(ANOMALIES);
    expect(await refus(ecrire(`DELETE FROM anomalies WHERE id = $1::uuid`, id))).toContain(
      ANOMALIES
    );
    expect(await refus(tronquer('anomalies'))).toContain(ANOMALIES);
  });
});

describe('REQ-DM-034 — rattachements_manuels : justifiés, antérieurs au dépôt, un actif par SIREN', () => {
  async function unRattachement(p: {
    attributionId: string;
    siren?: string;
    justification?: string;
    lienAt: Date;
    source?: string;
  }): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO rattachements_manuels (id, attribution_id, siren_commande, justification,
         lien_controle_etabli_at, lien_controle_source, decide_par_id, decide_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8)`,
      id,
      p.attributionId,
      p.siren ?? unSiren(),
      p.justification ?? 'le Kbis montre une filiale à 100 % depuis 2019',
      p.lienAt,
      p.source ?? 'Kbis du 2019-04-01',
      adminId,
      MAINTENANT
    );
    return id;
  }

  it('REQ-DM-034 : TÉMOIN — moins de 20 caractères utiles, ou une source vide : refusé, nommé', async () => {
    const { id, deposeeAt } = await uneAttribution();
    const avant = new Date(deposeeAt.getTime() - 1000);
    expect(
      await refus(
        unRattachement({ attributionId: id, lienAt: avant, justification: `  ${'x'.repeat(19)}  ` })
      )
    ).toContain('rattachements_manuels_justification');
    expect(
      await refus(unRattachement({ attributionId: id, lienAt: avant, source: '   ' }))
    ).toContain('rattachements_manuels_source');
  });

  it('REQ-DM-034 : TÉMOIN — un lien établi APRÈS le dépôt est refusé (rattachement_lien_anterieur) ; au dépôt même, admis', async () => {
    const { id, deposeeAt } = await uneAttribution();
    expect(
      await refus(unRattachement({ attributionId: id, lienAt: new Date(deposeeAt.getTime() + 1) }))
    ).toContain('rattachement_lien_anterieur');
    await expect(unRattachement({ attributionId: id, lienAt: deposeeAt })).resolves.toBeDefined();
  });

  it('REQ-DM-034 : TÉMOIN — un seul rattachement actif par SIREN ; révoqué une fois, un neuf passe', async () => {
    const siren = unSiren();
    const { id, deposeeAt } = await uneAttribution();
    const premier = await unRattachement({ attributionId: id, siren, lienAt: deposeeAt });
    expect(await refus(unRattachement({ attributionId: id, siren, lienAt: deposeeAt }))).toContain(
      'rattachements_manuels_un_actif_par_siren'
    );
    await ecrire(
      `UPDATE rattachements_manuels SET revoque_at = $2 WHERE id = $1::uuid`,
      premier,
      MAINTENANT
    );
    await expect(
      unRattachement({ attributionId: id, siren, lienAt: deposeeAt })
    ).resolves.toBeDefined();
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET revoque_at = $2 WHERE id = $1::uuid`,
          premier,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(GABARIT);
    expect(
      await refus(
        ecrire(
          `UPDATE rattachements_manuels SET justification = $2 WHERE id = $1::uuid`,
          premier,
          'x'.repeat(30)
        )
      )
    ).toContain(GABARIT);
    expect(await refus(tronquer('rattachements_manuels'))).toContain(GABARIT);
  });
});

describe('REQ-DM-043 — contestations : un objet, une cible, une réponse posée ensemble et une fois', () => {
  async function uneContestation(p: {
    objet: string;
    depotRefuseId?: string | null;
    attributionId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await ecrire(
      `INSERT INTO contestations (id, apporteur_id, objet, depot_refuse_id, attribution_id,
         texte_chiffre, recue_at)
       VALUES ($1::uuid, $2::uuid, $3::objet_contestation, $4::uuid, $5::uuid, $6, $7)`,
      id,
      apporteurId,
      p.objet,
      p.depotRefuseId ?? null,
      p.attributionId ?? null,
      randomBytes(40),
      MAINTENANT
    );
    return id;
  }

  it('REQ-DM-043 : TÉMOIN — la cible suit l’objet (contestations_objet_cible)', async () => {
    const refusId = await unRefus();
    const { id: attributionId } = await uneAttribution();
    await expect(
      uneContestation({ objet: 'refus_depot', depotRefuseId: refusId })
    ).resolves.toBeDefined();
    await expect(
      uneContestation({ objet: 'annulation_attribution', attributionId })
    ).resolves.toBeDefined();
    for (const mauvaise of [
      { objet: 'refus_depot', attributionId },
      { objet: 'refus_depot', depotRefuseId: refusId, attributionId },
      { objet: 'demande_rattachement', depotRefuseId: refusId },
      { objet: 'annulation_attribution' },
    ]) {
      expect(await refus(uneContestation(mauvaise)), JSON.stringify(mauvaise)).toContain(
        'contestations_objet_cible'
      );
    }
  });

  /** Une contestation d'attribution, neuve. */
  async function neuve(): Promise<string> {
    const { id: attributionId } = await uneAttribution();
    return uneContestation({ objet: 'demande_rattachement', attributionId });
  }
  const repondre = (id: string) =>
    ecrire(
      `UPDATE contestations SET reponse_chiffre = $2, repondue_par_id = $3::uuid, repondue_at = $4
       WHERE id = $1::uuid`,
      id,
      randomBytes(40),
      adminId,
      MAINTENANT
    );
  const purger = (id: string) =>
    ecrire(
      `UPDATE contestations SET texte_chiffre = NULL, reponse_chiffre = NULL, purgee_at = $2
       WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );

  it('REQ-DM-043 : TÉMOIN — la réponse en deux temps est refusée ; posée ensemble, admise ; réécrite, refusée', async () => {
    const id = await neuve();
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET reponse_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    await repondre(id);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET reponse_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET repondue_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
  });

  it('REQ-DM-043 : TÉMOIN — la purge : sans sa date, ou la date sans la purge, refusée (contestations_purge_liee) ; ensemble, admise, la réponse gardée en trace', async () => {
    const id = await neuve();
    await repondre(id);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = NULL, reponse_chiffre = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toContain('contestations_purge_liee');
    expect(
      await refus(
        ecrire(`UPDATE contestations SET purgee_at = $2 WHERE id = $1::uuid`, id, MAINTENANT)
      )
    ).toContain('contestations_purge_liee');
    await purger(id);
    const [l] = await base.prisma.$queryRaw<
      { texte: Buffer | null; reponse: Buffer | null; par: string | null; at: Date | null }[]
    >`SELECT texte_chiffre AS texte, reponse_chiffre AS reponse, repondue_par_id AS par,
        repondue_at AS at FROM contestations WHERE id = ${id}::uuid`;
    expect([l!.texte, l!.reponse, l!.par, l!.at?.toISOString()]).toEqual([
      null,
      null,
      adminId,
      MAINTENANT.toISOString(),
    ]);
  });

  it('REQ-DM-043 : TÉMOIN — après la purge, plus rien ne bouge : réponse, texte qui revient, date réécrite, refusés', async () => {
    const id = await neuve();
    await purger(id);
    expect(await refus(repondre(id))).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET purgee_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
  });

  it('REQ-DM-043 : TÉMOIN — un texte réécrit, l’identité changée, DELETE et TRUNCATE : refusés', async () => {
    const id = await neuve();
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET texte_chiffre = $2 WHERE id = $1::uuid`,
          id,
          randomBytes(40)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(
      await refus(
        ecrire(
          `UPDATE contestations SET recue_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + 1)
        )
      )
    ).toContain(CONTESTATIONS);
    expect(await refus(ecrire(`DELETE FROM contestations WHERE id = $1::uuid`, id))).toContain(
      CONTESTATIONS
    );
    expect(await refus(tronquer('contestations'))).toContain(CONTESTATIONS);
  });
});

describe('W19 — jamais un conseiller pour traiter, décider ou répondre', () => {
  it('W19 : TÉMOIN — la fonction partagée compare role::text, sans EXECUTE, et refuse un argument qui ne nomme pas une colonne', async () => {
    const [f] = await base.prisma.$queryRaw<{ corps: string }[]>`
      SELECT pg_get_functiondef(p.oid) AS corps FROM pg_proc p WHERE p.proname = ${CONSEILLER}`;
    expect(f!.corps).toContain("'conseiller_salarie'");
    expect(f!.corps).toContain('TG_ARGV[0]');
    expect(f!.corps).not.toMatch(/\bEXECUTE\b/);
  });

  it('W19 : TÉMOIN — trois déclencheurs, et chaque argument nomme une colonne de sa table', async () => {
    const lignes = await base.prisma.$queryRaw<{ table: string; nom: string; colonne: string }[]>`
      SELECT c.relname AS table, t.tgname AS nom,
             convert_from(substring(t.tgargs FROM 1 FOR length(t.tgargs) - 1), 'UTF8') AS colonne
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE p.proname = ${CONSEILLER} AND NOT t.tgisinternal
      ORDER BY t.tgname`;
    expect(lignes.map((l) => [l.table, l.nom, l.colonne])).toEqual([
      ['anomalies', 'anomalies_traite_par_pas_conseiller', 'traite_par_id'],
      ['contestations', 'contestations_repondue_par_pas_conseiller', 'repondue_par_id'],
      ['rattachements_manuels', 'rattachements_manuels_decide_par_pas_conseiller', 'decide_par_id'],
    ]);
    for (const l of lignes) {
      const [c] = await base.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = ${l.table} AND column_name = ${l.colonne}`;
      expect(c!.n, `${l.table}.${l.colonne}`).toBe(1);
    }
  });
});
