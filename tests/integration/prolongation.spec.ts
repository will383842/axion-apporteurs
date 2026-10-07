// @req REQ-EXT-020
/**
 * EXT-T07 — la prolongation de l'attribution, en base RÉELLE (contrat v2, art. 3.4 al. 3 ; forme d'A02
 * #809 6039895839, amendée 6039970008 ; juriste #809 6039901134).
 *
 * CE QU'IL PROUVE, les écritures jugées sous `partners_app` (le rôle d'exécution, provisionné comme en
 * production) :
 *   — LA GARDE (005045) : la prolongation pose l'instant, la condition, l'auteur et une fin RECULÉE dans
 *     la même écriture, une fois ; la réputée n'a pas d'auteur, un geste en a un ; le constat est unique,
 *     exclusif de la prolongation, refusé après le terme, et ne touche pas la fin ; la fin ne se réécrit
 *     pas hors prolongation ; une attribution non confirmée ne se prolonge pas ;
 *   — LE SERVICE : prolonger, constater et réputer écrivent la ligne, l'événement et (pour une
 *     prolongation) l'avis à l'apporteur, identique décidée ou réputée ; un refus nommé n'écrit rien.
 * Le terme des témoins du service est dans le FUTUR RÉEL : la garde lit `clock_timestamp()`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  deciderDeLaProlongation,
  listerLesProlongationsADecider,
  reputerProlongee,
} from '../../src/server/attribution/prolonger';
import { ouvertureDeLaDecision, termeProlonge } from '../../src/domain/attribution/prolongation';
import { CHARGES_PAR_TYPE } from '../../src/domain/evenement/charges';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';
import { SEUILS } from '../../src/domain/seuils/ssot';

let base: Base;
let app: PrismaClient;
let grilleId: string;
let apporteurId: string;
let adminId: string;

const CONFIRMEE = new Date('2026-05-02T10:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 700000000;
const unSiren = () => String((sirens += 1));

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
        publieeAt: CONFIRMEE,
        importeeAt: CONFIRMEE,
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
        creeAt: CONFIRMEE,
      },
    })
  ).id;
  const [a] = await base.prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO utilisateurs_console (id, role, email_chiffre, email_hash, cree_at, valide_at)
     VALUES ($1::uuid, 'admin'::console_role, '\\x01'::bytea, $2, $3, $3) RETURNING id`,
    randomUUID(),
    hex(32),
    CONFIRMEE
  );
  adminId = a!.id;
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/** Une attribution d'apporteur, par SQL brut, sous le propriétaire (une fixture). */
async function semer(s: { statut?: string; fin: Date | null; confirmee?: boolean }) {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, grille_commission_id,
       date_contact, verification_prioritaire, entreprise_a_verifier, lien_interet_declare,
       confirmee_at, fenetre_fin_at, raison_sociale)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, 'espace', $5::uuid, '2026-05-01',
       false, false, false, $6, $7, 'Garage de la Démo')`,
    id,
    apporteurId,
    s.statut ?? 'active',
    unSiren(),
    grilleId,
    s.confirmee === false ? null : CONFIRMEE,
    s.fin
  );
  return id;
}

/** Une écriture du SERVEUR, sous `partners_app`. */
const ecrire = (sql: string, ...valeurs: unknown[]) => app.$executeRawUnsafe(sql, ...valeurs);

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const lire = (id: string) => base.prisma.attribution.findUniqueOrThrow({ where: { id } });
const evenements = (id: string) =>
  base.prisma.$queryRawUnsafe<{ id: bigint; type: string; charge: unknown }[]>(
    `SELECT id, type::text AS type, charge FROM evenements WHERE agregat_id = $1::uuid ORDER BY id`,
    id
  );
const avis = (id: string) =>
  base.prisma.notificationEspace.findMany({ where: { attributionId: id } });

const FIN_PASSEE = new Date('2026-09-02T10:00:00.000Z');
const plusTard = (d: Date, jours: number) => new Date(d.getTime() + jours * MS_PAR_JOUR);
/** Un terme dans le FUTUR RÉEL, dans la liste « à décider » (la garde lit `clock_timestamp()`). */
const termeDansLaListe = () => new Date(Date.now() + MS_PAR_JOUR);
/** Un terme au-delà de la liste : deux fois l’avance de la SSOT. */
const horsDeLaListe = () =>
  new Date(Date.now() + 2 * SEUILS.PROLONGATION_DECISION_AVANCE_JOURS.valeur * MS_PAR_JOUR);
/** La fin prolongée d’un terme passé, par la règle du domaine. */
const RECULEE = new Date(termeProlonge(Date.parse('2026-09-02T10:00:00.000Z')));

const PROLONGER = `UPDATE attributions SET prolongee_at = $2, prolongation_condition = $3::condition_prolongation,
  prolongee_par_id = $4::uuid, fenetre_fin_at = $5 WHERE id = $1::uuid`;
const CONSTATER = `UPDATE attributions SET prolongation_refusee_at = $2, prolongation_refusee_par_id = $3::uuid
  WHERE id = $1::uuid`;

describe('REQ-EXT-020 — la garde de la prolongation (005045), sous partners_app', () => {
  it('REQ-EXT-020 : TÉMOIN — une prolongation pose la condition, l’instant, l’auteur et une fin reculée dans la même écriture', async () => {
    const id = await semer({ fin: FIN_PASSEE });
    await ecrire(PROLONGER, id, FIN_PASSEE, 'devis_en_cours', adminId, RECULEE);
    const a = await lire(id);
    expect(a.prolongationCondition).toBe('devis_en_cours');
    expect(a.prolongeeParId).toBe(adminId);
    expect(a.fenetreFinAt).toEqual(RECULEE);
  });

  it('REQ-EXT-020 : TÉMOIN — une seconde prolongation, ou la fin prolongée réécrite, sont refusées', async () => {
    const id = await semer({ fin: FIN_PASSEE });
    await ecrire(PROLONGER, id, FIN_PASSEE, 'echange_recent', adminId, RECULEE);
    expect(
      await refus(
        ecrire(PROLONGER, id, FIN_PASSEE, 'echange_recent', adminId, plusTard(RECULEE, 1))
      )
    ).toContain('une prolongation est unique');
    expect(
      await refus(
        ecrire(
          `UPDATE attributions SET fenetre_fin_at = $2 WHERE id = $1::uuid`,
          id,
          plusTard(RECULEE, 1)
        )
      )
    ).toContain('une prolongation est unique');
  });

  it('REQ-EXT-020 : TÉMOIN — une prolongation sans recul de la fin est refusée', async () => {
    const id = await semer({ fin: FIN_PASSEE });
    expect(
      await refus(ecrire(PROLONGER, id, FIN_PASSEE, 'devis_en_cours', adminId, FIN_PASSEE))
    ).toContain('recule la fin de fenêtre');
  });

  it('REQ-EXT-020 : TÉMOIN — la fin de fenêtre ne se réécrit pas hors prolongation', async () => {
    const id = await semer({ fin: FIN_PASSEE });
    expect(
      await refus(
        ecrire(
          `UPDATE attributions SET fenetre_fin_at = $2 WHERE id = $1::uuid`,
          id,
          plusTard(FIN_PASSEE, 1)
        )
      )
    ).toContain('ne se réécrit que par la prolongation');
  });

  it('REQ-EXT-020 : TÉMOIN — une attribution non confirmée ne se prolonge pas', async () => {
    const id = await semer({ fin: null, confirmee: false, statut: 'provisoire' });
    expect(
      await refus(ecrire(PROLONGER, id, FIN_PASSEE, 'devis_en_cours', adminId, RECULEE))
    ).toMatch(/attributions_prolongation_si_confirmee|recule la fin de fenêtre/);
  });

  it('REQ-EXT-020 : TÉMOIN — la réputée sans auteur passe, avec un auteur elle est refusée ; un geste sans auteur est refusé', async () => {
    const sans = await semer({ fin: FIN_PASSEE });
    await ecrire(PROLONGER, sans, FIN_PASSEE, 'reputee', null, RECULEE);
    expect((await lire(sans)).prolongeeParId).toBeNull();
    const avec = await semer({ fin: FIN_PASSEE });
    expect(await refus(ecrire(PROLONGER, avec, FIN_PASSEE, 'reputee', adminId, RECULEE))).toContain(
      'attributions_prolongation_auteur'
    );
    const geste = await semer({ fin: FIN_PASSEE });
    expect(
      await refus(ecrire(PROLONGER, geste, FIN_PASSEE, 'devis_en_cours', null, RECULEE))
    ).toContain('attributions_prolongation_auteur');
  });

  it('REQ-EXT-020 : TÉMOIN — le constat est unique, refusé après une prolongation ou après le terme, et ne touche pas la fin', async () => {
    const fin = termeDansLaListe();
    const id = await semer({ fin });
    await ecrire(CONSTATER, id, new Date(), adminId);
    expect((await lire(id)).fenetreFinAt).toEqual(fin);
    expect(await refus(ecrire(CONSTATER, id, new Date(), adminId))).toContain(
      'le constat est unique'
    );

    const prolongee = await semer({ fin });
    await ecrire(
      PROLONGER,
      prolongee,
      new Date(),
      'devis_en_cours',
      adminId,
      new Date(termeProlonge(fin.getTime()))
    );
    expect(await refus(ecrire(CONSTATER, prolongee, new Date(), adminId))).toContain(
      'ne revient pas sur une prolongation'
    );

    const echue = await semer({ fin: FIN_PASSEE });
    expect(await refus(ecrire(CONSTATER, echue, new Date(), adminId))).toContain('passé le terme');

    const deplacee = await semer({ fin });
    expect(
      await refus(
        ecrire(
          `UPDATE attributions SET prolongation_refusee_at = $2, prolongation_refusee_par_id = $3::uuid,
             fenetre_fin_at = $4 WHERE id = $1::uuid`,
          deplacee,
          new Date(),
          adminId,
          plusTard(fin, 1)
        )
      )
    ).toContain('ne touche pas la fin');
  });

  it('REQ-EXT-020 : TÉMOIN — la prolongation après un constat est refusée', async () => {
    const fin = termeDansLaListe();
    const id = await semer({ fin });
    await ecrire(CONSTATER, id, new Date(), adminId);
    expect(
      await refus(
        ecrire(
          PROLONGER,
          id,
          new Date(),
          'devis_en_cours',
          adminId,
          new Date(termeProlonge(fin.getTime()))
        )
      )
    ).toContain('refusée après le constat');
  });
});

describe('REQ-EXT-020 — le service : prolonger, constater, réputer', () => {
  const ADMIN = () => ({ id: adminId, role: 'admin' as const });

  it('REQ-EXT-020 : TÉMOIN — prolonger : la ligne, l’événement {condition, finAvant, finApres, acteur} et l’avis à l’apporteur, une fois', async () => {
    const fin = termeDansLaListe();
    const id = await semer({ fin });
    const maintenant = new Date();
    const { termeAt } = await deciderDeLaProlongation(app, {
      acteur: ADMIN(),
      attributionId: id,
      decision: 'financement_en_instruction',
      maintenant,
    });
    expect(termeAt).toEqual(new Date(termeProlonge(fin.getTime())));
    const a = await lire(id);
    expect(a.prolongationCondition).toBe('financement_en_instruction');
    expect(a.fenetreFinAt).toEqual(termeAt);
    const [e] = await evenements(id);
    expect(e!.type).toBe('attribution_prolongee');
    expect(CHARGES_PAR_TYPE.attribution_prolongee.parse(e!.charge)).toEqual({
      condition: 'financement_en_instruction',
      finAvant: fin.toISOString(),
      finApres: termeAt.toISOString(),
      acteur: { par: 'utilisateur_console', id: adminId },
    });
    const n = await avis(id);
    expect(n.map((x) => [x.cle, x.apporteurId, x.evenementId])).toEqual([
      ['attribution_prolongee', apporteurId, e!.id],
    ]);
  });

  it('REQ-EXT-020 : TÉMOIN — constater : le constat et son événement {acteur}, la fin inchangée, AUCUN avis', async () => {
    const fin = termeDansLaListe();
    const id = await semer({ fin });
    const { termeAt } = await deciderDeLaProlongation(app, {
      acteur: ADMIN(),
      attributionId: id,
      decision: 'constater',
      maintenant: new Date(),
    });
    expect(termeAt).toEqual(fin);
    expect((await lire(id)).prolongationRefuseeParId).toBe(adminId);
    const ev = await evenements(id);
    expect(ev.map((x) => x.type)).toEqual(['attribution_prolongation_refusee']);
    expect(ev[0]!.charge).toEqual({ acteur: { par: 'utilisateur_console', id: adminId } });
    expect(await avis(id)).toEqual([]);
  });

  it('REQ-EXT-020 : TÉMOIN — une décision hors liste, déjà prise, au terme passé ou hors des trois conditions est refusée, sans rien écrire', async () => {
    const decider = (attributionId: string, decision: unknown, maintenant = new Date()) =>
      deciderDeLaProlongation(app, { acteur: ADMIN(), attributionId, decision, maintenant });
    const loin = await semer({ fin: horsDeLaListe() });
    expect(await refus(decider(loin, 'devis_en_cours'))).toContain('sans_objet');
    const echue = await semer({ fin: FIN_PASSEE });
    expect(await refus(decider(echue, 'devis_en_cours'))).toContain('terme_passe');
    const prise = await semer({ fin: termeDansLaListe() });
    await decider(prise, 'constater');
    expect(await refus(decider(prise, 'devis_en_cours'))).toContain('deja_decidee');
    const autre = await semer({ fin: termeDansLaListe() });
    expect(await refus(decider(autre, 'reputee'))).toContain('decision_invalide');
    expect(await refus(decider(autre, 'financement_en_cours'))).toContain('decision_invalide');
    expect(
      await refus(
        deciderDeLaProlongation(app, {
          acteur: { id: adminId, role: 'qualifieur' },
          attributionId: autre,
          decision: 'devis_en_cours',
          maintenant: new Date(),
        })
      )
    ).toContain('droit_absent');
    for (const id of [loin, echue, autre]) expect(await evenements(id)).toEqual([]);
  });

  it('REQ-EXT-020 : TÉMOIN — au terme, sans décision : RÉPUTÉE PROLONGÉE, sans auteur, avec le MÊME avis ; rejouée, rien de plus', async () => {
    const id = await semer({ fin: FIN_PASSEE });
    const maintenant = new Date();
    const r = await app.$transaction((tx) => reputerProlongee(tx, id, maintenant));
    expect(r?.termeAt).toEqual(new Date(termeProlonge(FIN_PASSEE.getTime())));
    const a = await lire(id);
    expect(a.prolongationCondition).toBe('reputee');
    expect(a.prolongeeParId).toBeNull();
    const [e] = await evenements(id);
    expect(CHARGES_PAR_TYPE.attribution_prolongee.parse(e!.charge).acteur).toEqual({
      par: 'systeme',
    });
    expect((await avis(id)).map((x) => x.cle)).toEqual(['attribution_prolongee']);
    // Le terme reculé n'est pas atteint : rien n'est écrit une seconde fois.
    expect(await app.$transaction((tx) => reputerProlongee(tx, id, maintenant))).toBeNull();
    expect(await evenements(id)).toHaveLength(1);
  });

  it('REQ-EXT-020 : TÉMOIN — un constat posé avant le terme : au terme, rien n’est réputé', async () => {
    const fin = termeDansLaListe();
    const id = await semer({ fin });
    await deciderDeLaProlongation(app, {
      acteur: ADMIN(),
      attributionId: id,
      decision: 'constater',
      maintenant: new Date(),
    });
    expect(await app.$transaction((tx) => reputerProlongee(tx, id, plusTard(fin, 1)))).toBeNull();
    expect((await lire(id)).prolongeeAt).toBeNull();
  });

  it('REQ-EXT-020 : TÉMOIN — la liste ne porte que les décisions ouvertes, les termes proches d’abord', async () => {
    const maintenant = new Date();
    const proche = await semer({ fin: plusTard(maintenant, 1) });
    const ouverte = await semer({ fin: plusTard(maintenant, 2) });
    const loin = await semer({ fin: horsDeLaListe() });
    const ids = (await listerLesProlongationsADecider(app, maintenant)).map((l) => l.id);
    expect(ids.indexOf(proche)).toBeLessThan(ids.indexOf(ouverte));
    expect(ids).not.toContain(loin);
    for (const l of await listerLesProlongationsADecider(app, maintenant))
      expect(ouvertureDeLaDecision(l.termeAt.getTime())).toBeLessThanOrEqual(maintenant.getTime());
  });
});
