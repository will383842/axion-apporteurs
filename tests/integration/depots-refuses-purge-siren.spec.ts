// @req REQ-DM-043
/**
 * Le SIREN d'un dépôt refusé s'efface douze mois après le refus, en base RÉELLE (REQ-DM-043,
 * HYP-A02-RETENTION, partners/ADR-0030).
 *
 * CE QUE LA TÂCHE ET LA BASE TIENNENT :
 *   — sous l'échéance, rien ; pile et au-delà, `siren` passe à NULL et `siren_purge_at` date la
 *     purge ; la ligne RESTE comme trace du refus (apporteur, motif, canal, date) ;
 *   — un second passage ne change rien ;
 *   — `siren_purge_at` est liée au SIREN (CHECK) : ni l'un sans l'autre ;
 *   — le gabarit d'ajout seul n'admet que la purge du SIREN vers NULL et l'écriture UNIQUE de sa
 *     date : un SIREN purgé ne revient pas, une date de purge ne se réécrit pas, et toute autre
 *     colonne reste figée.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  limiteDePurgeDuSiren,
  purgerLesSirenRefuses,
} from '../../src/server/taches/purger-siren-refuses';

let base: Base;
let apporteurId: string;

const MAINTENANT = new Date('2026-10-02T12:00:00.000Z');
const MINUTE = 60_000;
const hex = (octets: number) => randomBytes(octets).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
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

/** Un refus daté, par SQL brut : c'est la BASE qu'on juge. */
async function unRefus(refuseAt: Date): Promise<string> {
  const id = randomUUID();
  await base.prisma.$executeRawUnsafe(
    `INSERT INTO depots_refuses (id, apporteur_id, siren, motif, canal, refuse_at)
     VALUES ($1::uuid, $2::uuid, '552100554', 'file_complete', 'espace', $3)`,
    id,
    apporteurId,
    refuseAt
  );
  return id;
}

type Lu = {
  apporteur_id: string;
  siren: string | null;
  motif: string;
  canal: string;
  refuse_at: Date;
  siren_purge_at: Date | null;
};
async function lire(id: string): Promise<Lu> {
  const [l] = await base.prisma.$queryRawUnsafe<Lu[]>(
    `SELECT apporteur_id::text, siren, motif::text, canal::text, refuse_at, siren_purge_at
     FROM depots_refuses WHERE id = $1::uuid`,
    id
  );
  return l!;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const ecrire = (texte: string, ...valeurs: unknown[]) =>
  base.prisma.$executeRawUnsafe(texte, ...valeurs);

describe('REQ-DM-043 — la purge planifiée du SIREN d’un dépôt refusé', () => {
  it('REQ-DM-043 : TÉMOINS — sous l’échéance rien ; pile et au-delà, SIREN à NULL, date posée, la ligne reste', async () => {
    const limite = limiteDePurgeDuSiren(MAINTENANT);
    const sous = await unRefus(new Date(limite.getTime() + MINUTE));
    const pile = await unRefus(limite);
    const audela = await unRefus(new Date(limite.getTime() - MINUTE));
    const avant = await lire(audela);

    const r = await purgerLesSirenRefuses(base.prisma, MAINTENANT);
    expect(r.purges).toBeGreaterThanOrEqual(2);

    expect((await lire(sous)).siren).toBe('552100554');
    expect((await lire(sous)).siren_purge_at).toBeNull();
    for (const id of [pile, audela]) {
      const l = await lire(id);
      expect(l.siren).toBeNull();
      expect(l.siren_purge_at).toEqual(MAINTENANT);
    }
    // La trace du refus reste : apporteur, motif, canal, date.
    const apres = await lire(audela);
    expect({ ...apres, siren: avant.siren, siren_purge_at: null }).toEqual(avant);
  });

  it('REQ-DM-043 : un second passage ne change rien', async () => {
    const id = await unRefus(new Date(limiteDePurgeDuSiren(MAINTENANT).getTime() - MINUTE));
    await purgerLesSirenRefuses(base.prisma, MAINTENANT);
    const premier = await lire(id);
    // Au MÊME instant : un instant plus tard ferait échoir la ligne « sous » du témoin précédent, et
    // le compte ne jugerait plus l'idempotence.
    expect((await purgerLesSirenRefuses(base.prisma, MAINTENANT)).purges).toBe(0);
    expect(await lire(id)).toEqual(premier);
  });

  it('REQ-DM-043 : TÉMOIN — un passage ULTÉRIEUR qui purge d’autres lignes ne réécrit RIEN de ce qui est déjà purgé', async () => {
    // Un mois après le reste du banc : le premier passage solde toutes les lignes échues des témoins
    // précédents, et le second ne trouve que B.
    const t = new Date(Date.UTC(2026, 10, 2, 12, 0, 0));
    const tPlus10 = new Date(t.getTime() + 10 * MINUTE);
    const limite = limiteDePurgeDuSiren(t);
    const a = await unRefus(new Date(limite.getTime() - MINUTE));
    const b = await unRefus(new Date(limite.getTime() + 5 * MINUTE));

    await purgerLesSirenRefuses(base.prisma, t);
    const aApresPremier = await lire(a);
    expect(aApresPremier.siren_purge_at).toEqual(t);
    expect((await lire(b)).siren).toBe('552100554');

    expect((await purgerLesSirenRefuses(base.prisma, tPlus10)).purges).toBe(1);
    expect(await lire(a)).toEqual(aApresPremier);
    const bApres = await lire(b);
    expect(bApres.siren).toBeNull();
    expect(bApres.siren_purge_at).toEqual(tPlus10);
  });

  it('REQ-DM-043 : la date de purge est LIÉE au SIREN — ni l’un sans l’autre', async () => {
    const id = await unRefus(MAINTENANT);
    expect(
      await refus(ecrire(`UPDATE depots_refuses SET siren = NULL WHERE id = $1::uuid`, id))
    ).toContain('depots_refuses_siren_purge_liee');
    expect(
      await refus(
        ecrire(`UPDATE depots_refuses SET siren_purge_at = $2 WHERE id = $1::uuid`, id, MAINTENANT)
      )
    ).toContain('depots_refuses_siren_purge_liee');
  });

  it('REQ-DM-043 : un SIREN purgé ne revient pas, et la date de purge ne se réécrit pas', async () => {
    const id = await unRefus(MAINTENANT);
    await ecrire(
      `UPDATE depots_refuses SET siren = NULL, siren_purge_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    expect(
      await refus(
        ecrire(
          `UPDATE depots_refuses SET siren = '552100554', siren_purge_at = NULL WHERE id = $1::uuid`,
          id
        )
      )
    ).toMatch(/refuser_modification_sauf/);
    expect(
      await refus(
        ecrire(
          `UPDATE depots_refuses SET siren_purge_at = $2 WHERE id = $1::uuid`,
          id,
          new Date(MAINTENANT.getTime() + MINUTE)
        )
      )
    ).toMatch(/refuser_modification_sauf/);
  });
});
