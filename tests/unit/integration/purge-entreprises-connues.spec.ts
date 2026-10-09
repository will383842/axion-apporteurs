// @req REQ-DM-029
// @req REQ-DM-028
/**
 * La purge des projections de l'antériorité, jugée en processus sur un faux client fidèle aux
 * requêtes qu'elle émet (`where`, `orderBy`, `take`, `in`). Les durées sont celles de la juriste au
 * registre de l'article 30 : une ligne est gardée TANT QU'ELLE PEUT FONDER UN REFUS, puis effacée.
 *   — `devis_connus` : non signé, six mois après son émission ; signé, tant qu'il n'est pas
 *     entièrement facturé (et six mois au moins après son émission, qui fonde aussi un refus) ;
 *   — `entreprises_connues`, origine client : vingt-quatre mois après la dernière prestation ;
 *     origine devis : tant qu'un devis la rend connue.
 * Les fenêtres sont celles de la règle (SSOT), en mois civils à Paris, bornes comprises.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { ajouterMoisParis } from '../../../src/domain/attribution/machine';
import {
  LOT_DE_PURGE_DES_ENTREPRISES_CONNUES,
  purgerLesEntreprisesConnues,
} from '../../../src/server/taches/purger-entreprises-connues';

type Ligne = Record<string, unknown>;
const MAINTENANT = new Date('2027-06-15T12:00:00.000Z');
const LIMITE_DEVIS = new Date(
  ajouterMoisParis(MAINTENANT.getTime(), -SEUILS.ANTERIORITE_DEVIS_MOIS.valeur)
);
const LIMITE_CLIENT = new Date(
  ajouterMoisParis(MAINTENANT.getTime(), -SEUILS.ANTERIORITE_CLIENT_MOIS.valeur)
);
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);
const SIREN_A = '100000001';
const SIREN_B = '200000002';

function satisfait(l: Ligne, where: Ligne): boolean {
  return Object.entries(where).every(([k, v]) => {
    const x = l[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ('lt' in o) return x instanceof Date && x.getTime() < (o.lt as Date).getTime();
      if ('gt' in o) return typeof x === 'string' && x > (o.gt as string);
      if ('in' in o) return (o.in as unknown[]).includes(x);
      return false;
    }
    return x instanceof Date && v instanceof Date ? x.getTime() === v.getTime() : x === v;
  });
}

function base(devis: Ligne[], entreprises: Ligne[]) {
  const appels: string[] = [];
  const db = {
    devisConnu: {
      findMany: async (q: { where: Ligne; orderBy?: unknown; take?: number }) => {
        appels.push('devis.findMany');
        const lus = devis
          .filter((d) => satisfait(d, q.where))
          .sort((a, b) => String(a.devisRef).localeCompare(String(b.devisRef)));
        const trie = (q.orderBy as { devisRef?: unknown } | undefined)?.devisRef === 'asc';
        return (trie ? lus : [...lus].reverse()).slice(0, q.take ?? lus.length);
      },
      deleteMany: async (q: { where: Ligne }) => {
        appels.push('devis.deleteMany');
        const avant = devis.length;
        for (let i = devis.length - 1; i >= 0; i -= 1) {
          if (satisfait(devis[i]!, q.where)) devis.splice(i, 1);
        }
        return { count: avant - devis.length };
      },
    },
    entrepriseConnue: {
      deleteMany: async (q: { where: Ligne }) => {
        appels.push('entreprise.deleteMany');
        const avant = entreprises.length;
        for (let i = entreprises.length - 1; i >= 0; i -= 1) {
          if (satisfait(entreprises[i]!, q.where)) entreprises.splice(i, 1);
        }
        return { count: avant - entreprises.length };
      },
      updateMany: async (q: { where: Ligne; data: Ligne }) => {
        appels.push('entreprise.updateMany');
        let n = 0;
        for (const e of entreprises) {
          if (satisfait(e, q.where)) {
            Object.assign(e, q.data);
            n += 1;
          }
        }
        return { count: n };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      appels.push('tx');
      return fn(db);
    },
    $executeRaw: async (_sql: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push(`verrou:${valeurs.join('|')}`);
      return 1;
    },
  };
  return { prisma: db as unknown as PrismaClient, devis, entreprises, appels };
}

const unDevis = (ref: string, siren: string, emisAt: Date, o: Partial<Ligne> = {}): Ligne => ({
  devisRef: ref,
  siren,
  emisAt,
  signeAt: null,
  montantTotalHtCents: 0,
  factureHtCents: 0,
  ...o,
});
const uneLigne = (siren: string, origine: string, depuis: Date, dernier: Date): Ligne => ({
  siren,
  origine,
  connueDepuisAt: depuis,
  dernierContactAt: dernier,
});

describe('REQ-DM-029 — devis_connus : effacé quand il ne fonde plus aucun refus', () => {
  it('REQ-DM-029 : TÉMOIN — non signé, émis une milliseconde avant la limite : effacé ; pile à la limite : gardé', async () => {
    const b = base(
      [unDevis('d-avant', SIREN_A, ms(LIMITE_DEVIS, -1)), unDevis('d-pile', SIREN_A, LIMITE_DEVIS)],
      []
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ devis: 1 });
    expect(b.devis.map((d) => d.devisRef)).toEqual(['d-pile']);
  });

  it('REQ-DM-029 : TÉMOIN — signé et pas entièrement facturé : gardé, quelle que soit sa date', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const b = base(
      [
        unDevis('d-ouvert', SIREN_A, vieux, {
          signeAt: vieux,
          montantTotalHtCents: 1000,
          factureHtCents: 999,
        }),
        unDevis('d-solde', SIREN_A, vieux, {
          signeAt: vieux,
          montantTotalHtCents: 1000,
          factureHtCents: 1000,
        }),
        unDevis('d-trop', SIREN_A, vieux, {
          signeAt: vieux,
          montantTotalHtCents: 1000,
          factureHtCents: 1200,
        }),
      ],
      []
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ devis: 2 });
    expect(b.devis.map((d) => d.devisRef)).toEqual(['d-ouvert']);
  });

  it('REQ-DM-029 : un devis signé entièrement facturé mais émis il y a moins de six mois fonde encore un refus : gardé', async () => {
    const recent = ms(LIMITE_DEVIS, 1);
    const b = base(
      [
        unDevis('d-recent', SIREN_A, recent, {
          signeAt: recent,
          montantTotalHtCents: 10,
          factureHtCents: 10,
        }),
      ],
      []
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ devis: 0 });
    expect(b.devis).toHaveLength(1);
  });

  it('REQ-DM-029 : par lots bornés, sans relire à l’infini les devis qu’il faut garder', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const n = LOT_DE_PURGE_DES_ENTREPRISES_CONNUES * 2 + 3;
    const devis = Array.from({ length: n }, (_, i) =>
      unDevis(`d-${String(i).padStart(5, '0')}`, SIREN_A, vieux, {
        // un sur deux reste ouvert : il est gardé, et la purge doit passer outre.
        ...(i % 2 === 0 ? { signeAt: vieux, montantTotalHtCents: 10, factureHtCents: 0 } : {}),
      })
    );
    const b = base(devis, []);
    const r = await purgerLesEntreprisesConnues(b.prisma, MAINTENANT);
    expect(r.devis).toBe(Math.floor(n / 2));
    expect(b.devis).toHaveLength(Math.ceil(n / 2));
    expect(LOT_DE_PURGE_DES_ENTREPRISES_CONNUES).toBe(500);
  });
});

describe('REQ-DM-029 — entreprises_connues : effacée quand elle ne fonde plus aucun refus', () => {
  it('REQ-DM-029 : TÉMOIN — client, dernière prestation une milliseconde avant la limite : effacée ; pile : gardée', async () => {
    const b = base(
      [],
      [
        uneLigne(SIREN_A, 'client', ms(LIMITE_CLIENT, -10), ms(LIMITE_CLIENT, -1)),
        uneLigne(SIREN_B, 'client', ms(LIMITE_CLIENT, -10), LIMITE_CLIENT),
      ]
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ clients: 1 });
    expect(b.entreprises.map((e) => e.siren)).toEqual([SIREN_B]);
  });

  it('REQ-DM-029 : origine devis — retirée quand son dernier devis est effacé, recalée sur ceux qui restent', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const ouvert = new Date('2021-03-01T00:00:00.000Z');
    const signeLe = new Date('2021-04-01T00:00:00.000Z');
    const recent = ms(LIMITE_DEVIS, 5);
    const clientA = ms(LIMITE_CLIENT, 1);
    const b = base(
      [
        unDevis('a-vieux', SIREN_A, vieux),
        unDevis('b-vieux', SIREN_B, vieux),
        unDevis('b-ouvert', SIREN_B, ouvert, {
          signeAt: signeLe,
          montantTotalHtCents: 10,
          factureHtCents: 0,
        }),
        // un devis NON signé, émis récemment : il reste, et sa date entre au recalage
        unDevis('b-recent', SIREN_B, recent),
      ],
      [
        uneLigne(SIREN_A, 'devis', vieux, vieux),
        uneLigne(SIREN_B, 'devis', vieux, ouvert),
        uneLigne(SIREN_A, 'client', clientA, clientA),
      ]
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toEqual({
      devis: 2,
      clients: 0,
      devisOrigine: 1,
    });
    // le recalage ne touche QUE la ligne devis de l'entreprise : la ligne client de A garde ses dates
    const clientDeA = b.entreprises.find((e) => e.siren === SIREN_A && e.origine === 'client')!;
    expect((clientDeA.connueDepuisAt as Date).getTime()).toBe(clientA.getTime());
    expect((clientDeA.dernierContactAt as Date).getTime()).toBe(clientA.getTime());
    // A : son devis est effacé, la ligne devis aussi ; sa ligne client, récente, reste.
    expect(b.entreprises.filter((e) => e.siren === SIREN_A).map((e) => e.origine)).toEqual([
      'client',
    ]);
    // B : la ligne est recalée sur les devis qui restent — de la plus ancienne émission à la plus
    // récente des dates (émission ou signature).
    const ligneB = b.entreprises.find((e) => e.siren === SIREN_B)!;
    expect((ligneB.connueDepuisAt as Date).getTime()).toBe(ouvert.getTime());
    expect((ligneB.dernierContactAt as Date).getTime()).toBe(recent.getTime());
  });

  it('REQ-DM-029 : un devis NON signé est effacé à son échéance même s’il n’est pas entièrement facturé', async () => {
    const b = base(
      [
        unDevis('d-partiel', SIREN_A, ms(LIMITE_DEVIS, -1), {
          montantTotalHtCents: 100,
          factureHtCents: 40,
        }),
      ],
      []
    );
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ devis: 1 });
    expect(b.devis).toEqual([]);
  });

  it('REQ-DM-029 : une référence qui précède toute lettre est relue, la pagination part du début', async () => {
    const b = base([unDevis('0-ancien', SIREN_A, ms(LIMITE_DEVIS, -1))], []);
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toMatchObject({ devis: 1 });
  });

  it('REQ-DM-029 : rien à effacer dans un lot — aucune suppression n’est demandée', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const b = base(
      [unDevis('d-ouvert', SIREN_A, vieux, { signeAt: vieux, montantTotalHtCents: 10 })],
      []
    );
    await purgerLesEntreprisesConnues(b.prisma, MAINTENANT);
    expect(b.appels.filter((a) => a === 'devis.deleteMany')).toEqual([]);
  });

  it('REQ-DM-028 : la liste de la Société n’est pas une projection purgée ici : aucune ligne financeur n’est touchée', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const b = base([], [uneLigne(SIREN_A, 'financeur', vieux, vieux)]);
    expect(await purgerLesEntreprisesConnues(b.prisma, MAINTENANT)).toEqual({
      devis: 0,
      clients: 0,
      devisOrigine: 0,
    });
    expect(b.entreprises).toHaveLength(1);
  });
});

describe('REQ-DM-029 — la purge prend le verrou du SIREN avant de relire ses devis (lentille sécurité)', () => {
  it('REQ-DM-029 : TÉMOIN — étape 3 : une transaction par SIREN, le verrou, PUIS la relecture des devis restants', async () => {
    const vieux = new Date('2020-01-01T00:00:00.000Z');
    const b = base(
      [unDevis('a-vieux', SIREN_A, vieux), unDevis('b-vieux', SIREN_B, vieux)],
      [uneLigne(SIREN_A, 'devis', vieux, vieux), uneLigne(SIREN_B, 'devis', vieux, vieux)]
    );
    await purgerLesEntreprisesConnues(b.prisma, MAINTENANT);
    const etape3 = b.appels.slice(b.appels.indexOf('tx'));
    expect(etape3).toEqual([
      'tx',
      `verrou:partners.entreprise_connue|${SIREN_A}`,
      'devis.findMany',
      'entreprise.deleteMany',
      'tx',
      `verrou:partners.entreprise_connue|${SIREN_B}`,
      'devis.findMany',
      'entreprise.deleteMany',
    ]);
  });
});
