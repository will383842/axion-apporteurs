// @req REQ-DM-006
// @req REQ-DM-007
// @req REQ-DM-004
// @req REQ-DM-022
// @req REQ-QA-004
// @req REQ-DM-031
/**
 * DM-08 — l'écrivain des transitions d'attribution, en base RÉELLE.
 *
 * CE QU'IL PROUVE :
 *   — l'état, les colonnes de temps et l'événement s'écrivent dans la MÊME transaction : annulée,
 *     elle ne laisse rien ; un refus de la matrice n'écrit rien non plus ;
 *   — deux transitions concurrentes se sérialisent sur la ligne : la seconde juge l'état laissé par
 *     la première ;
 *   — la confirmation enchaîne `devis_signe` si une commande valable est rattachée (deux événements,
 *     dans cet ordre) ; une libération laisse un état libéré ;
 *   — la caducité choisit son code selon la fenêtre et refuse en présence d'une autre commande ;
 *   — la redéclaration au rang 1 : l'attente passe `expiree` et une nouvelle attribution naît, dans
 *     la même transaction.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  confirmerUneAttribution,
  constaterLaCaducite,
  journaliserLaNaissance,
  transitionnerUneAttribution,
} from '../../src/server/attribution/transitionner';
import { MS_PAR_JOUR } from '../../src/domain/temps/calendrier-civil';
import { echeanceDePurge } from '../../src/server/taches/purger-contacts';

let base: Base;
let grilleId: string;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const SYSTEME = { par: 'systeme' } as const;
const hex = (octets: number) => randomBytes(octets).toString('hex');
let sirens = 400000000;
const unSiren = () => String((sirens += 1));
const annulee = new Error('annulee');

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
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Semis = {
  statut: string;
  siren?: string;
  rangAttente?: number | null;
  fenetreFinAt?: Date | null;
  confirmeeAt?: Date | null;
};

/** Une attribution d'apporteur, par SQL brut. */
async function semer(s: Semis, tx: Pick<Base['prisma'], '$executeRawUnsafe'> = base.prisma) {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO attributions (id, apporteur_id, statut, rang_attente, siren, canal,
       grille_commission_id, date_contact, verification_prioritaire, entreprise_a_verifier,
       lien_interet_declare, confirmee_at, fenetre_fin_at)
     VALUES ($1::uuid, $2::uuid, $3::etat_attribution, $4, $5, 'espace', $6::uuid, '2026-10-01',
       false, false, false, $7, $8)`,
    id,
    apporteurId,
    s.statut,
    s.rangAttente ?? null,
    s.siren ?? unSiren(),
    grilleId,
    s.confirmeeAt ?? null,
    s.fenetreFinAt ?? null
  );
  return id;
}

async function statut(id: string): Promise<string> {
  return (await base.prisma.attribution.findUniqueOrThrow({ where: { id } })).statut;
}

async function evenements(id: string) {
  return base.prisma.$queryRawUnsafe<{ type: string; charge: Record<string, unknown> }[]>(
    `SELECT type::text AS type, charge FROM evenements WHERE agregat_id = $1::uuid ORDER BY id`,
    id
  );
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-QA-004 — l’état, le temps et l’événement, dans la même transaction', () => {
  it('REQ-DM-007 : TÉMOIN — confirmée : statut active, fenêtre ouverte, UN événement {de, vers, transition}', async () => {
    const id = await semer({ statut: 'provisoire' });
    await base.prisma.$transaction((tx) =>
      transitionnerUneAttribution(tx, {
        attributionId: id,
        transition: 'confirmee',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect(a.statut).toBe('active');
    expect(a.confirmeeAt).toEqual(MAINTENANT);
    expect(a.fenetreFinAt).toEqual(new Date('2027-04-02T12:00:00.000Z'));
    expect(a.peremptionAt).toBeNull();
    const ev = await evenements(id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      type: 'attribution_etat_modifie',
      charge: { de: 'provisoire', vers: 'active', transition: 'confirmee', acteur: SYSTEME },
    });
  });

  it('REQ-QA-004 : TÉMOIN — la transaction annulée ne laisse ni état ni événement', async () => {
    const id = await semer({ statut: 'provisoire' });
    await base.prisma
      .$transaction(async (tx) => {
        await transitionnerUneAttribution(tx, {
          attributionId: id,
          transition: 'confirmee',
          acteur: SYSTEME,
          maintenant: MAINTENANT,
        });
        throw annulee;
      })
      .catch((e: unknown) => {
        if (e !== annulee) throw e;
      });
    expect(await statut(id)).toBe('provisoire');
    expect(await evenements(id)).toHaveLength(0);
  });

  it('REQ-DM-006 : TÉMOIN — un couple absent est refusé, nommé, et rien n’est écrit', async () => {
    const id = await semer({ statut: 'perdue' });
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          transitionnerUneAttribution(tx, {
            attributionId: id,
            transition: 'confirmee',
            acteur: SYSTEME,
            maintenant: MAINTENANT,
          })
        )
      )
    ).toContain('transition_refusee : perdue × confirmee');
    expect(await statut(id)).toBe('perdue');
    expect(await evenements(id)).toHaveLength(0);
  });

  it('REQ-QA-004 : TÉMOIN — deux confirmations concurrentes : une seule passe, la seconde juge active', async () => {
    const id = await semer({ statut: 'provisoire' });
    const une = () =>
      base.prisma.$transaction((tx) =>
        transitionnerUneAttribution(tx, {
          attributionId: id,
          transition: 'confirmee',
          acteur: SYSTEME,
          maintenant: MAINTENANT,
        })
      );
    const issues = await Promise.allSettled([une(), une()]);
    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    const echec = issues.find((i) => i.status === 'rejected') as PromiseRejectedResult;
    expect(String(echec.reason)).toContain('active × confirmee');
    expect(await evenements(id)).toHaveLength(1);
  });
});

describe('REQ-DM-031 — la libération pose l’échéance de la purge du contact', () => {
  it('REQ-DM-031 : TÉMOIN — une attribution libérée reçoit purge_contact_at = echeanceDePurge(vers, maintenant) ; une occupante non', async () => {
    const libre = await semer({ statut: 'active' });
    const occupante = await semer({ statut: 'active' });
    await base.prisma.$transaction(async (tx) => {
      await transitionnerUneAttribution(tx, {
        attributionId: libre,
        transition: 'perdue',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      });
      await transitionnerUneAttribution(tx, {
        attributionId: occupante,
        transition: 'rdv_pris',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      });
    });
    const l = await base.prisma.attribution.findUniqueOrThrow({ where: { id: libre } });
    expect(l.purgeContactAt).toEqual(echeanceDePurge('perdue', MAINTENANT));
    const o = await base.prisma.attribution.findUniqueOrThrow({ where: { id: occupante } });
    expect(o.purgeContactAt).toBeNull();
  });
});

describe('REQ-DM-022 — la commande reçue pendant provisoire (avis d’A07)', () => {
  it('REQ-DM-022 : TÉMOIN — commande rattachée, puis confirmation : signee, deux événements dans l’ordre', async () => {
    const id = await semer({ statut: 'provisoire' });
    await base.prisma.$transaction((tx) =>
      confirmerUneAttribution(tx, {
        attributionId: id,
        transition: 'confirmee',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
        commandeValableRattachee: true,
      })
    );
    expect(await statut(id)).toBe('signee');
    expect((await evenements(id)).map((e) => e.charge['transition'])).toEqual([
      'confirmee',
      'devis_signe',
    ]);
  });

  it('REQ-DM-022 : TÉMOIN — commande rattachée, puis libération sans confirmation : état libéré', async () => {
    const id = await semer({ statut: 'provisoire' });
    await base.prisma.$transaction((tx) =>
      transitionnerUneAttribution(tx, {
        attributionId: id,
        transition: 'fin_sans_adresse_valide',
        acteur: SYSTEME,
        maintenant: MAINTENANT,
      })
    );
    expect(await statut(id)).toBe('perimee');
  });
});

describe('REQ-DM-022 — la caducité d’une commande (condition suspensive défaillie)', () => {
  const confirmeeAt = new Date(MAINTENANT.getTime() - 30 * MS_PAR_JOUR);

  it('REQ-DM-022 : TÉMOIN — dans la fenêtre : retour à active, rien n’est recalculé', async () => {
    const fin = new Date(MAINTENANT.getTime() + 100 * MS_PAR_JOUR);
    const id = await semer({ statut: 'signee', confirmeeAt, fenetreFinAt: fin });
    await base.prisma.$transaction((tx) =>
      constaterLaCaducite(tx, {
        attributionId: id,
        acteur: SYSTEME,
        maintenant: MAINTENANT,
        autreCommandeValable: false,
      })
    );
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id } });
    expect([a.statut, a.confirmeeAt, a.fenetreFinAt, a.peremptionAt]).toEqual([
      'active',
      confirmeeAt,
      fin,
      null,
    ]);
    expect((await evenements(id))[0]?.charge['transition']).toBe('commande_caduque');
  });

  it('REQ-DM-022 : TÉMOIN — hors fenêtre : expiree', async () => {
    const fin = new Date(MAINTENANT.getTime() - MS_PAR_JOUR);
    const id = await semer({ statut: 'signee', confirmeeAt, fenetreFinAt: fin });
    await base.prisma.$transaction((tx) =>
      constaterLaCaducite(tx, {
        attributionId: id,
        acteur: SYSTEME,
        maintenant: MAINTENANT,
        autreCommandeValable: false,
      })
    );
    expect(await statut(id)).toBe('expiree');
    expect((await evenements(id))[0]?.charge['transition']).toBe('commande_caduque_hors_fenetre');
  });

  it('REQ-DM-022 : TÉMOIN — une autre commande valable : refus nommé, l’attribution reste signee', async () => {
    const fin = new Date(MAINTENANT.getTime() + 100 * MS_PAR_JOUR);
    const id = await semer({ statut: 'signee', confirmeeAt, fenetreFinAt: fin });
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          constaterLaCaducite(tx, {
            attributionId: id,
            acteur: SYSTEME,
            maintenant: MAINTENANT,
            autreCommandeValable: true,
          })
        )
      )
    ).toContain('autre_commande_valable');
    expect(await statut(id)).toBe('signee');
    expect(await evenements(id)).toHaveLength(0);
  });
});

describe('REQ-DM-004 — la redéclaration au rang 1', () => {
  it('REQ-DM-004 : TÉMOIN — l’attente passe expiree et une nouvelle attribution naît, dans la même transaction', async () => {
    const siren = unSiren();
    const attente = await semer({ statut: 'en_attente', siren, rangAttente: 1 });
    let nouvelle = '';
    await base.prisma.$transaction(async (tx) => {
      await transitionnerUneAttribution(tx, {
        attributionId: attente,
        transition: 'redeclaree',
        acteur: { par: 'apporteur', id: apporteurId },
        maintenant: MAINTENANT,
      });
      nouvelle = await semer({ statut: 'provisoire', siren }, tx);
      await journaliserLaNaissance(tx, {
        attributionId: nouvelle,
        transition: 'deposee',
        acteur: { par: 'apporteur', id: apporteurId },
        maintenant: MAINTENANT,
      });
    });
    const a = await base.prisma.attribution.findUniqueOrThrow({ where: { id: attente } });
    expect([a.statut, a.rangAttente]).toEqual(['expiree', null]);
    expect(await statut(nouvelle)).toBe('provisoire');
    expect((await evenements(attente))[0]?.charge['transition']).toBe('redeclaree');
    expect((await evenements(nouvelle))[0]?.charge).toMatchObject({
      de: null,
      vers: 'provisoire',
      transition: 'deposee',
    });
  });

  it('REQ-DM-006 : une naissance qui ne correspond pas à l’état inséré est refusée', async () => {
    const id = await semer({ statut: 'active' });
    expect(
      await refus(
        base.prisma.$transaction((tx) =>
          journaliserLaNaissance(tx, {
            attributionId: id,
            transition: 'deposee',
            acteur: SYSTEME,
            maintenant: MAINTENANT,
          })
        )
      )
    ).toContain('naissance_refusee');
  });
});
