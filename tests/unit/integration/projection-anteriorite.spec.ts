// @req REQ-DM-029
// @req REQ-DM-028
/**
 * La projection de l'antériorité (`src/server/entreprise-connue/projection.ts`), jugée EN
 * PROCESSUS sur un faux client Prisma en mémoire : la même projection que le banc Docker
 * (`tests/integration/entreprise-connue.spec.ts`) juge sur Postgres, mais ici Stryker la voit.
 *
 * Le faux est FIDÈLE à ce que la projection demande, et à rien d'autre : `where` (types, chemin de la
 * charge, clés), `orderBy` (les événements y sont rangés dans le désordre, seul le tri demandé les
 * remet en ordre), `select`, `upsert`, `deleteMany`. Une requête mal formée rend donc un autre
 * résultat, et le témoin rougit.
 */
import { describe, it, expect } from 'vitest';
import { TypeEvenementRecu, type PrismaClient } from '@prisma/client';
import {
  ChargeIncomplete,
  DOMAINE_DU_VERROU,
  TYPES_DE_L_ANTERIORITE,
  anterioriteDe,
  montantRequis,
  projeterEvenement,
  recalculerDevis,
  recalculerEntreprise,
  traitantsDeLAnteriorite,
  verrouillerLesSirens,
} from '../../../src/server/entreprise-connue/projection';
import type { EvenementATraiter } from '../../../src/server/queue/workers/evenement-recu';

type Ligne = Record<string, unknown>;
type Recu = { id: number; eventType: TypeEvenementRecu; charge: unknown; receivedAt: Date };

const SIREN_A = '100000001';
const SIREN_B = '200000002';
const SIREN_C = '300000003';

/** Les lignes qui satisfont un `where` d'égalités simples. */
const satisfait = (l: Ligne, where: Ligne): boolean =>
  Object.entries(where).every(([k, v]) => l[k] === v);

/** Un tri `orderBy` générique : liste de `{ champ: 'asc' | 'desc' }`. */
function trier<T extends Ligne>(lignes: T[], orderBy: unknown): T[] {
  const cles = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<
    string,
    'asc' | 'desc'
  >[];
  const valeur = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
  return [...lignes].sort((a, b) => {
    for (const c of cles) {
      const [champ, sens] = Object.entries(c)[0]!;
      const d = valeur(a[champ]) - valeur(b[champ]);
      if (d !== 0) return sens === 'desc' ? -d : d;
    }
    return 0;
  });
}

function choisir(l: Ligne, select: Record<string, boolean> | undefined): Ligne {
  if (select === undefined) return { ...l };
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, v]) => v)
      .map(([k]) => [k, l[k]])
  );
}

/** Le faux client, et ses tables, ouvertes à la lecture du témoin. */
function base(recus: Recu[] = []) {
  const ordre: string[] = [];
  const devisConnus: Ligne[] = [];
  const entreprises: Ligne[] = [];
  const liste: Ligne[] = [];
  const db = {
    evenementRecu: {
      findMany: async (q: {
        where: {
          eventType: { in: TypeEvenementRecu[] };
          charge: { path: string[]; equals: unknown };
        };
        select?: Record<string, boolean>;
        orderBy?: unknown;
      }) => {
        const chemin = q.where.charge.path;
        const lus = recus.filter((r) => {
          if (!q.where.eventType.in.includes(r.eventType)) return false;
          if (chemin.length !== 1) return false;
          const c = r.charge;
          if (c === null || typeof c !== 'object' || Array.isArray(c)) return false;
          return (c as Ligne)[chemin[0]!] === q.where.charge.equals;
        });
        return trier(lus as unknown as Ligne[], q.orderBy).map((r) => choisir(r, q.select));
      },
    },
    devisConnu: {
      upsert: async (q: { where: { devisRef: string }; create: Ligne; update: Ligne }) => {
        ordre.push(`devis:${q.where.devisRef}`);
        const l = devisConnus.find((d) => d.devisRef === q.where.devisRef);
        if (l) Object.assign(l, q.update);
        else devisConnus.push({ ...q.create });
      },
      findUnique: async (q: { where: { devisRef: string }; select?: Record<string, boolean> }) => {
        const l = devisConnus.find((d) => d.devisRef === q.where.devisRef);
        return l ? choisir(l, q.select) : null;
      },
      findMany: async (q: { where: Ligne }) =>
        devisConnus.filter((d) => satisfait(d, q.where)).map((d) => ({ ...d })),
    },
    entrepriseConnue: {
      upsert: async (q: {
        where: { siren_origine: { siren: string; origine: string } };
        create: Ligne;
        update: Ligne;
      }) => {
        const l = entreprises.find((e) => satisfait(e, q.where.siren_origine));
        if (l) Object.assign(l, q.update);
        else entreprises.push({ ...q.create });
      },
      deleteMany: async (q: { where: Ligne }) => {
        for (let i = entreprises.length - 1; i >= 0; i -= 1) {
          if (satisfait(entreprises[i]!, q.where)) entreprises.splice(i, 1);
        }
      },
      findUnique: async (q: { where: { siren_origine: Ligne } }) =>
        entreprises.find((e) => satisfait(e, q.where.siren_origine)) ?? null,
    },
    sirenListeNoire: {
      findUnique: async (q: { where: { siren: string }; select?: Record<string, boolean> }) => {
        const l = liste.find((x) => x.siren === q.where.siren);
        return l ? choisir(l, q.select) : null;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    // Le verrou par SIREN : la forme à deux clés, noté dans l'ordre des appels.
    $executeRaw: async (_sql: TemplateStringsArray, ...valeurs: unknown[]) => {
      ordre.push(`verrou:${valeurs.join('|')}`);
      return 1;
    },
  };
  return {
    db,
    prisma: db as unknown as PrismaClient,
    recus,
    devisConnus,
    entreprises,
    liste,
    ordre,
  };
}

/**
 * Les événements sont RANGÉS DANS LE DÉSORDRE : `receivedAt` dit l'ordre d'arrivée, la place dans le
 * tableau ne dit rien. Seul l'`orderBy` de la projection remet le dernier à sa place.
 */
let suivant = 0;
function recu(eventType: TypeEvenementRecu, charge: unknown, reception: string): Recu {
  suivant += 1;
  return { id: suivant, eventType, charge, receivedAt: new Date(reception) };
}

const T = TypeEvenementRecu;
/** L'événement tel que la réception le donne à son traitant. */
const aTraiter = (eventType: TypeEvenementRecu, charge: unknown): EvenementATraiter => ({
  id: `recu-${eventType}`,
  eventType,
  sujetRef: null,
  charge,
  retryCount: 0,
});
const emis = (devisId: string, emisLe: string, extra: Ligne = {}) => ({
  devisId,
  emisLe,
  ...extra,
});
const signe = (devisId: string, signeLe: string, montant: number, extra: Ligne = {}) => ({
  devisId,
  signeLe,
  montantTotalHtCents: montant,
  ...extra,
});
const facture = (factureId: string, montant: number, emiseLe: string, extra: Ligne = {}) => ({
  factureId,
  montantHtCents: montant,
  emiseLe,
  ...extra,
});

const date = (s: string) => new Date(s);
const temps = (x: unknown) => (x as Date).getTime();

// ── la lecture défensive ────────────────────────────────────────────────────────────────────────

describe('REQ-DM-029 — un montant exigé n’est jamais lu comme zéro', () => {
  it('REQ-DM-029 : un entier est rendu tel quel, zéro et négatif compris', () => {
    expect(montantRequis({ m: 1250 }, 'm')).toBe(1250);
    expect(montantRequis({ m: 0 }, 'm')).toBe(0);
    expect(montantRequis({ m: -40 }, 'm')).toBe(-40);
  });

  it.each([
    ['absent', {}],
    ['une chaîne', { m: '1250' }],
    ['un décimal', { m: 12.5 }],
    ['nul', { m: null }],
  ])('REQ-DM-029 : %s, il lève ChargeIncomplete nommée, avec le champ', (_, c) => {
    let levee: unknown = null;
    try {
      montantRequis(c as Ligne, 'm');
    } catch (e) {
      levee = e;
    }
    expect(levee).toBeInstanceOf(ChargeIncomplete);
    expect((levee as Error).name).toBe('ChargeIncomplete');
    expect((levee as Error).message).toBe('charge sans m');
  });
});

describe('REQ-DM-029 — les types lus par la projection, et ses traitants', () => {
  it('REQ-DM-029 : les sept types, exactement, dans cet ordre', () => {
    expect([...TYPES_DE_L_ANTERIORITE]).toEqual([
      T.client_cree,
      T.client_mis_a_jour,
      T.devis_emis,
      T.devis_signe,
      T.facture_emise,
      T.avoir_emis,
      T.facture_annulee,
    ]);
  });

  it('REQ-DM-029 : un traitant par type, et chacun projette l’événement reçu', async () => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-trait', '2027-01-10T09:00:00Z', { siren: SIREN_A }),
        '2027-01-10T09:00:01Z'
      ),
    ]);
    const traitants = traitantsDeLAnteriorite(b.prisma);
    expect(Object.keys(traitants).sort()).toEqual([...TYPES_DE_L_ANTERIORITE].sort());
    await traitants[T.devis_emis]!(
      aTraiter(T.devis_emis, emis('devis-trait', '2027-01-10T09:00:00Z', { siren: SIREN_A }))
    );
    expect(b.devisConnus.map((d) => d.devisRef)).toEqual(['devis-trait']);
  });
});

// ── le recalcul d'un devis ──────────────────────────────────────────────────────────────────────

describe('REQ-DM-029 — recalculerDevis : la ligne d’un devis, depuis ses faits', () => {
  it('REQ-DM-029 : sans émission ni signature reçues, rien n’est écrit', async () => {
    const b = base([
      recu(
        T.facture_emise,
        facture('fac-seule', 100, '2027-01-01T00:00:00Z', { devisId: 'devis-x', siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-x')).toBeNull();
    expect(b.devisConnus).toEqual([]);
  });

  it('REQ-DM-029 : seulement émis — montant nul, la DERNIÈRE émission reçue fait foi, SIREN rendu', async () => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-e', '2027-02-01T00:00:00Z', { siren: SIREN_A }),
        '2027-02-01T00:00:05Z'
      ),
      recu(
        T.devis_emis,
        emis('devis-e', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
        '2027-01-01T00:00:05Z'
      ),
      recu(
        T.devis_emis,
        emis('devis-autre', '2026-01-01T00:00:00Z', { siren: SIREN_B }),
        '2027-03-01T00:00:05Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-e')).toBe(SIREN_A);
    expect(b.devisConnus).toHaveLength(1);
    const l = b.devisConnus[0]!;
    expect(l).toMatchObject({
      devisRef: 'devis-e',
      siren: SIREN_A,
      signeAt: null,
      montantTotalHtCents: 0,
      factureHtCents: 0,
    });
    expect(temps(l.emisAt)).toBe(Date.parse('2027-02-01T00:00:00Z'));
    expect(l.majAt).toBeInstanceOf(Date);
  });

  it('REQ-DM-029 : à réception égale, l’identifiant départage — le plus grand est le dernier', async () => {
    const meme = '2027-02-01T00:00:05Z';
    const premier = recu(
      T.devis_emis,
      emis('devis-eg', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
      meme
    );
    const second = recu(
      T.devis_emis,
      emis('devis-eg', '2027-01-20T00:00:00Z', { siren: SIREN_A }),
      meme
    );
    const b = base([second, premier]);
    await recalculerDevis(b.db as never, 'devis-eg');
    expect(temps(b.devisConnus[0]!.emisAt)).toBe(Date.parse('2027-01-20T00:00:00Z'));
  });

  it('REQ-DM-029 : signé — la DERNIÈRE signature fait foi ; l’émission est la plus ancienne des deux dates', async () => {
    const b = base([
      recu(
        T.devis_signe,
        signe('devis-s', '2027-03-01T00:00:00Z', 9000, { siren: SIREN_A }),
        '2027-03-01T00:00:09Z'
      ),
      recu(
        T.devis_signe,
        signe('devis-s', '2027-02-15T00:00:00Z', 5000, { siren: SIREN_A }),
        '2027-02-15T00:00:09Z'
      ),
      recu(
        T.devis_emis,
        emis('devis-s', '2027-02-01T00:00:00Z', { siren: SIREN_A }),
        '2027-02-01T00:00:09Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-s')).toBe(SIREN_A);
    const l = b.devisConnus[0]!;
    expect(l.montantTotalHtCents).toBe(9000);
    expect(temps(l.signeAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
    expect(temps(l.emisAt)).toBe(Date.parse('2027-02-01T00:00:00Z'));
  });

  it('REQ-DM-029 : une émission reçue APRÈS une signature plus ancienne — l’émission est ramenée à la signature', async () => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-r', '2027-04-01T00:00:00Z', { siren: SIREN_A }),
        '2027-04-01T00:00:09Z'
      ),
      recu(
        T.devis_signe,
        signe('devis-r', '2027-03-01T00:00:00Z', 100, { siren: SIREN_A }),
        '2027-03-01T00:00:09Z'
      ),
    ]);
    await recalculerDevis(b.db as never, 'devis-r');
    expect(temps(b.devisConnus[0]!.emisAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
  });

  it('REQ-DM-029 : signé sans émission reçue — l’émission est la signature', async () => {
    const b = base([
      recu(
        T.devis_signe,
        signe('devis-ss', '2027-03-01T00:00:00Z', 100, { siren: SIREN_A }),
        '2027-03-01T00:00:09Z'
      ),
    ]);
    await recalculerDevis(b.db as never, 'devis-ss');
    expect(temps(b.devisConnus[0]!.emisAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
    expect(temps(b.devisConnus[0]!.signeAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
  });

  it('REQ-DM-029 : une date d’émission illisible est ignorée — la signature la remplace', async () => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-il', 'pas une date', { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
      recu(T.devis_signe, signe('devis-il', '2027-03-01T00:00:00Z', 100), '2027-03-01T00:00:01Z'),
    ]);
    await recalculerDevis(b.db as never, 'devis-il');
    expect(temps(b.devisConnus[0]!.emisAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
  });

  it('REQ-DM-029 : aucune date lisible — rien n’est écrit', async () => {
    const b = base([
      recu(T.devis_emis, emis('devis-nd', '   ', { siren: SIREN_A }), '2027-01-01T00:00:01Z'),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-nd')).toBeNull();
    expect(b.devisConnus).toEqual([]);
  });

  it('REQ-DM-029 : signé sans montant — ChargeIncomplete, rien n’est écrit', async () => {
    const b = base([
      recu(
        T.devis_signe,
        { devisId: 'devis-sm', signeLe: '2027-03-01T00:00:00Z', siren: SIREN_A },
        '2027-03-01T00:00:01Z'
      ),
    ]);
    await expect(recalculerDevis(b.db as never, 'devis-sm')).rejects.toBeInstanceOf(
      ChargeIncomplete
    );
    expect(b.devisConnus).toEqual([]);
  });

  it('REQ-DM-029 : un montant signé négatif est ramené à zéro', async () => {
    const b = base([
      recu(
        T.devis_signe,
        signe('devis-neg', '2027-03-01T00:00:00Z', -500, { siren: SIREN_A }),
        '2027-03-01T00:00:01Z'
      ),
    ]);
    await recalculerDevis(b.db as never, 'devis-neg');
    expect(b.devisConnus[0]!.montantTotalHtCents).toBe(0);
  });

  it('REQ-DM-029 : le SIREN vient de l’émission d’abord, puis de la signature, puis des factures', async () => {
    const parEmis = base([
      recu(
        T.devis_emis,
        emis('devis-p', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
      recu(
        T.devis_signe,
        signe('devis-p', '2027-02-01T00:00:00Z', 10, { siren: SIREN_B }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(parEmis.db as never, 'devis-p')).toBe(SIREN_A);

    const parSigne = base([
      recu(T.devis_emis, emis('devis-p', '2027-01-01T00:00:00Z'), '2027-01-01T00:00:01Z'),
      recu(
        T.devis_signe,
        signe('devis-p', '2027-02-01T00:00:00Z', 10, { siren: SIREN_B }),
        '2027-02-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-p', 10, '2027-02-02T00:00:00Z', { devisId: 'devis-p', siren: SIREN_C }),
        '2027-02-02T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(parSigne.db as never, 'devis-p')).toBe(SIREN_B);

    const parFacture = base([
      recu(T.devis_emis, emis('devis-p', '2027-01-01T00:00:00Z'), '2027-01-01T00:00:01Z'),
      recu(
        T.facture_emise,
        facture('fac-p', 10, '2027-02-02T00:00:00Z', { devisId: 'devis-p', siren: SIREN_C }),
        '2027-02-02T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(parFacture.db as never, 'devis-p')).toBe(SIREN_C);
  });

  it('REQ-DM-029 : sans SIREN sur la charge, celui du DERNIER événement client qui en porte un', async () => {
    const b = base([
      recu(T.client_cree, { clientId: 'cli-1', siren: SIREN_A }, '2027-01-01T00:00:01Z'),
      recu(T.client_mis_a_jour, { clientId: 'cli-1' }, '2027-01-03T00:00:01Z'),
      recu(T.client_mis_a_jour, { clientId: 'cli-1', siren: SIREN_B }, '2027-01-02T00:00:01Z'),
      recu(T.client_mis_a_jour, { clientId: 'cli-1', siren: '12345678' }, '2027-01-04T00:00:01Z'),
      recu(T.client_cree, { clientId: 'cli-2', siren: SIREN_C }, '2027-01-05T00:00:01Z'),
      recu(
        T.devis_emis,
        emis('devis-c', '2027-02-01T00:00:00Z', { clientId: 'cli-1' }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-c')).toBe(SIREN_B);
  });

  it.each([
    ['huit chiffres', '12345678'],
    ['dix chiffres', '1234567890'],
    ['une lettre', '12345678A'],
    ['un préfixe', 'x123456789'],
    ['un nombre', 123456789],
  ])('REQ-DM-029 : un SIREN mal formé (%s) n’en est pas un — rien n’est écrit', async (_, s) => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-m', '2027-02-01T00:00:00Z', { siren: s }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-m')).toBeNull();
    expect(b.devisConnus).toEqual([]);
  });

  it('REQ-DM-029 : un client sans SIREN, ou pas de client — rien n’est écrit', async () => {
    const b = base([
      recu(T.client_cree, { clientId: 'cli-vide' }, '2027-01-01T00:00:01Z'),
      recu(
        T.devis_emis,
        emis('devis-v', '2027-02-01T00:00:00Z', { clientId: 'cli-vide' }),
        '2027-02-01T00:00:01Z'
      ),
      recu(
        T.devis_emis,
        emis('devis-sc', '2027-02-01T00:00:00Z', { clientId: '  ' }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    expect(await recalculerDevis(b.db as never, 'devis-v')).toBeNull();
    expect(await recalculerDevis(b.db as never, 'devis-sc')).toBeNull();
    expect(b.devisConnus).toEqual([]);
  });

  it('REQ-DM-029 : le facturé — factures du devis, sans les annulées, avoirs déduits quel que soit leur signe', async () => {
    const b = base([
      recu(
        T.devis_signe,
        signe('devis-f', '2027-01-01T00:00:00Z', 10000, { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-1', 4000, '2027-01-10T00:00:00Z', { devisId: 'devis-f' }),
        '2027-01-10T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-2', 3000, '2027-01-11T00:00:00Z', { devisId: 'devis-f' }),
        '2027-01-11T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-3', 2000, '2027-01-12T00:00:00Z', { devisId: 'devis-f' }),
        '2027-01-12T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-ailleurs', 999, '2027-01-12T00:00:00Z', { devisId: 'devis-autre' }),
        '2027-01-12T00:00:02Z'
      ),
      recu(T.facture_annulee, { factureId: 'fac-3' }, '2027-01-13T00:00:01Z'),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-1', montantHtCents: -500 },
        '2027-01-14T00:00:01Z'
      ),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-2', montantHtCents: 250 },
        '2027-01-15T00:00:01Z'
      ),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-ailleurs', montantHtCents: 100 },
        '2027-01-15T00:00:02Z'
      ),
    ]);
    await recalculerDevis(b.db as never, 'devis-f');
    expect(b.devisConnus[0]!.factureHtCents).toBe(4000 + 3000 - 500 - 250);
  });

  it('REQ-DM-029 : une facture sans identifiant compte au facturé, sans avoir ni annulation possibles', async () => {
    const b = base([
      recu(
        T.devis_signe,
        signe('devis-sid', '2027-01-01T00:00:00Z', 10000, { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        { devisId: 'devis-sid', montantHtCents: 700, emiseLe: '2027-01-10T00:00:00Z' },
        '2027-01-10T00:00:01Z'
      ),
      recu(T.facture_annulee, { factureId: '' }, '2027-01-11T00:00:01Z'),
    ]);
    await recalculerDevis(b.db as never, 'devis-sid');
    expect(b.devisConnus[0]!.factureHtCents).toBe(700);
  });

  it.each([
    [
      'une facture',
      { factureId: 'fac-x', emiseLe: '2027-01-10T00:00:00Z', devisId: 'devis-z' },
      null,
    ],
    [
      'un avoir',
      {
        factureId: 'fac-x',
        montantHtCents: 10,
        emiseLe: '2027-01-10T00:00:00Z',
        devisId: 'devis-z',
      },
      { avoirDeFactureId: 'fac-x' },
    ],
  ])('REQ-DM-029 : %s sans montant — ChargeIncomplete', async (_, f, avoir) => {
    const evs = [
      recu(
        T.devis_signe,
        signe('devis-z', '2027-01-01T00:00:00Z', 100, { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
      recu(T.facture_emise, f, '2027-01-10T00:00:01Z'),
    ];
    if (avoir) evs.push(recu(T.avoir_emis, avoir, '2027-01-11T00:00:01Z'));
    await expect(recalculerDevis(base(evs).db as never, 'devis-z')).rejects.toBeInstanceOf(
      ChargeIncomplete
    );
  });

  it('REQ-DM-029 : recalculé, il REMPLACE sa ligne — une signature reçue ensuite la met à jour', async () => {
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-maj', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
        '2027-01-01T00:00:01Z'
      ),
    ]);
    await recalculerDevis(b.db as never, 'devis-maj');
    b.recus.push(
      recu(T.devis_signe, signe('devis-maj', '2027-02-01T00:00:00Z', 4200), '2027-02-01T00:00:01Z')
    );
    await recalculerDevis(b.db as never, 'devis-maj');
    expect(b.devisConnus).toHaveLength(1);
    expect(b.devisConnus[0]).toMatchObject({ montantTotalHtCents: 4200, siren: SIREN_A });
    expect(temps(b.devisConnus[0]!.signeAt)).toBe(Date.parse('2027-02-01T00:00:00Z'));
  });

  it('REQ-DM-029 : une charge qui n’est pas un objet est lue vide', async () => {
    const b = base([
      recu(T.devis_emis, ['devisId', 'devis-t'], '2027-01-01T00:00:01Z'),
      recu(T.devis_emis, null, '2027-01-01T00:00:02Z'),
    ]);
    await projeterEvenement(b.prisma, aTraiter(T.devis_emis, ['devisId', 'devis-t']));
    await projeterEvenement(b.prisma, aTraiter(T.devis_emis, null));
    await projeterEvenement(b.prisma, aTraiter(T.devis_emis, 'devis-t'));
    expect(b.devisConnus).toEqual([]);
    expect(b.entreprises).toEqual([]);
  });
});

// ── le recalcul d'une entreprise ────────────────────────────────────────────────────────────────

describe('REQ-DM-029 — recalculerEntreprise : les origines client et devis d’un SIREN', () => {
  it('REQ-DM-029 : client — de la plus ancienne à la plus récente prestation facturée, par SIREN ou par client', async () => {
    const b = base([
      recu(T.client_cree, { clientId: 'cli-a', siren: SIREN_A }, '2026-01-01T00:00:01Z'),
      recu(T.client_mis_a_jour, { clientId: 'cli-a', siren: SIREN_A }, '2026-01-02T00:00:01Z'),
      recu(
        T.facture_emise,
        facture('fac-s', 100, '2026-05-01T00:00:00Z', { siren: SIREN_A }),
        '2026-05-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-c', 100, '2026-03-01T00:00:00Z', { clientId: 'cli-a' }),
        '2026-03-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-tard', 100, '2026-09-01T00:00:00Z', { clientId: 'cli-a' }),
        '2026-09-01T00:00:01Z'
      ),
      // portée par le client, mais avec son propre SIREN : elle est à l'autre entreprise.
      recu(
        T.facture_emise,
        facture('fac-autre', 100, '2025-01-01T00:00:00Z', { clientId: 'cli-a', siren: SIREN_B }),
        '2025-01-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-b', 100, '2020-01-01T00:00:00Z', { siren: SIREN_B }),
        '2020-01-01T00:00:01Z'
      ),
    ]);
    await recalculerEntreprise(b.db as never, SIREN_A);
    expect(b.entreprises).toHaveLength(1);
    const l = b.entreprises[0]!;
    expect(l).toMatchObject({ siren: SIREN_A, origine: 'client' });
    expect(temps(l.connueDepuisAt)).toBe(Date.parse('2026-03-01T00:00:00Z'));
    expect(temps(l.dernierContactAt)).toBe(Date.parse('2026-09-01T00:00:00Z'));
  });

  it('REQ-DM-029 : ne comptent pas — l’annulée, l’éteinte par ses avoirs, la date illisible ; l’avoir partiel la laisse', async () => {
    const b = base([
      recu(
        T.facture_emise,
        facture('fac-ok', 1000, '2026-02-01T00:00:00Z', { siren: SIREN_A }),
        '2026-02-01T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-partiel', 1000, '2026-06-01T00:00:00Z', { siren: SIREN_A }),
        '2026-06-01T00:00:01Z'
      ),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-partiel', montantHtCents: 999 },
        '2026-06-02T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-annulee', 1000, '2026-01-01T00:00:00Z', { siren: SIREN_A }),
        '2026-01-01T00:00:01Z'
      ),
      recu(T.facture_annulee, { factureId: 'fac-annulee' }, '2026-01-05T00:00:01Z'),
      recu(
        T.facture_emise,
        facture('fac-eteinte', 1000, '2026-12-01T00:00:00Z', { siren: SIREN_A }),
        '2026-12-01T00:00:01Z'
      ),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-eteinte', montantHtCents: -600 },
        '2026-12-02T00:00:01Z'
      ),
      recu(
        T.avoir_emis,
        { avoirDeFactureId: 'fac-eteinte', montantHtCents: 400 },
        '2026-12-03T00:00:01Z'
      ),
      recu(
        T.facture_emise,
        facture('fac-illisible', 1000, 'demain', { siren: SIREN_A }),
        '2026-12-04T00:00:01Z'
      ),
    ]);
    await recalculerEntreprise(b.db as never, SIREN_A);
    const l = b.entreprises.find((e) => e.origine === 'client')!;
    expect(temps(l.connueDepuisAt)).toBe(Date.parse('2026-02-01T00:00:00Z'));
    expect(temps(l.dernierContactAt)).toBe(Date.parse('2026-06-01T00:00:00Z'));
  });

  it('REQ-DM-029 : une facture sans identifiant compte, sans avoir possible', async () => {
    const b = base([
      recu(
        T.facture_emise,
        { siren: SIREN_A, montantHtCents: 10, emiseLe: '2026-04-01T00:00:00Z' },
        '2026-04-01T00:00:01Z'
      ),
      recu(T.avoir_emis, { avoirDeFactureId: '', montantHtCents: 10 }, '2026-04-02T00:00:01Z'),
    ]);
    await recalculerEntreprise(b.db as never, SIREN_A);
    expect(temps(b.entreprises[0]!.dernierContactAt)).toBe(Date.parse('2026-04-01T00:00:00Z'));
  });

  it('REQ-DM-029 : une facture ou un avoir sans montant — ChargeIncomplete', async () => {
    const sansMontant = base([
      recu(
        T.facture_emise,
        { factureId: 'f', siren: SIREN_A, emiseLe: '2026-04-01T00:00:00Z' },
        '2026-04-01T00:00:01Z'
      ),
    ]);
    await expect(recalculerEntreprise(sansMontant.db as never, SIREN_A)).rejects.toBeInstanceOf(
      ChargeIncomplete
    );
    const avoirSansMontant = base([
      recu(
        T.facture_emise,
        facture('f', 10, '2026-04-01T00:00:00Z', { siren: SIREN_A }),
        '2026-04-01T00:00:01Z'
      ),
      recu(T.avoir_emis, { avoirDeFactureId: 'f' }, '2026-04-02T00:00:01Z'),
    ]);
    await expect(
      recalculerEntreprise(avoirSansMontant.db as never, SIREN_A)
    ).rejects.toBeInstanceOf(ChargeIncomplete);
  });

  it('REQ-DM-029 : devis — émissions ET signatures datent l’origine ; plus rien, la ligne est RETIRÉE, celle des autres reste', async () => {
    const b = base();
    b.devisConnus.push(
      { devisRef: 'd-1', siren: SIREN_A, emisAt: date('2027-02-01T00:00:00Z'), signeAt: null },
      {
        devisRef: 'd-2',
        siren: SIREN_A,
        emisAt: date('2027-01-01T00:00:00Z'),
        signeAt: date('2027-05-01T00:00:00Z'),
      },
      {
        devisRef: 'd-3',
        siren: SIREN_B,
        emisAt: date('2020-01-01T00:00:00Z'),
        signeAt: date('2030-01-01T00:00:00Z'),
      }
    );
    b.entreprises.push(
      {
        siren: SIREN_A,
        origine: 'client',
        connueDepuisAt: date('2020-01-01T00:00:00Z'),
        dernierContactAt: date('2020-01-01T00:00:00Z'),
      },
      {
        siren: SIREN_B,
        origine: 'devis',
        connueDepuisAt: date('2020-01-01T00:00:00Z'),
        dernierContactAt: date('2020-01-01T00:00:00Z'),
      }
    );
    await recalculerEntreprise(b.db as never, SIREN_A);
    // client : aucune prestation facturée reçue → retirée ; celle de l'autre SIREN reste.
    expect(b.entreprises.filter((e) => e.siren === SIREN_A).map((e) => e.origine)).toEqual([
      'devis',
    ]);
    expect(b.entreprises.filter((e) => e.siren === SIREN_B)).toHaveLength(1);
    const l = b.entreprises.find((e) => e.siren === SIREN_A)!;
    expect(temps(l.connueDepuisAt)).toBe(Date.parse('2027-01-01T00:00:00Z'));
    expect(temps(l.dernierContactAt)).toBe(Date.parse('2027-05-01T00:00:00Z'));

    b.devisConnus.splice(0, 2);
    await recalculerEntreprise(b.db as never, SIREN_A);
    expect(b.entreprises.filter((e) => e.siren === SIREN_A)).toEqual([]);
    expect(b.entreprises.filter((e) => e.siren === SIREN_B)).toHaveLength(1);
  });

  it('REQ-DM-029 : recalculée, la ligne est MISE À JOUR, jamais doublée', async () => {
    const b = base();
    b.devisConnus.push({
      devisRef: 'd-1',
      siren: SIREN_A,
      emisAt: date('2027-02-01T00:00:00Z'),
      signeAt: null,
    });
    await recalculerEntreprise(b.db as never, SIREN_A);
    b.devisConnus.push({
      devisRef: 'd-2',
      siren: SIREN_A,
      emisAt: date('2027-03-01T00:00:00Z'),
      signeAt: null,
    });
    await recalculerEntreprise(b.db as never, SIREN_A);
    expect(b.entreprises).toHaveLength(1);
    expect(temps(b.entreprises[0]!.dernierContactAt)).toBe(Date.parse('2027-03-01T00:00:00Z'));
  });
});

// ── un événement ────────────────────────────────────────────────────────────────────────────────

describe('REQ-DM-029 — projeterEvenement : ce qu’un événement touche est recalculé', () => {
  const projeter = (b: ReturnType<typeof base>, r: Recu) =>
    projeterEvenement(b.prisma, aTraiter(r.eventType, r.charge));

  it.each([T.devis_emis, T.devis_signe])(
    'REQ-DM-029 : %s — son devis, puis son entreprise',
    async (type) => {
      const charge =
        type === T.devis_emis
          ? emis('devis-ev', '2027-01-01T00:00:00Z', { siren: SIREN_A })
          : signe('devis-ev', '2027-01-01T00:00:00Z', 10, { siren: SIREN_A });
      const r = recu(type, charge, '2027-01-01T00:00:01Z');
      const b = base([r]);
      await projeter(b, r);
      expect(b.devisConnus.map((d) => d.devisRef)).toEqual(['devis-ev']);
      expect(b.entreprises).toMatchObject([{ siren: SIREN_A, origine: 'devis' }]);
    }
  );

  it('REQ-DM-029 : un devis sans identifiant ne touche rien', async () => {
    const r = recu(
      T.devis_emis,
      { emisLe: '2027-01-01T00:00:00Z', siren: SIREN_A },
      '2027-01-01T00:00:01Z'
    );
    const b = base([r]);
    await projeter(b, r);
    expect(b.devisConnus).toEqual([]);
    expect(b.entreprises).toEqual([]);
  });

  it('REQ-DM-029 : une facture — son devis ET son entreprise (par SIREN, ou par son client)', async () => {
    const d = recu(
      T.devis_signe,
      signe('devis-fa', '2027-01-01T00:00:00Z', 1000, { siren: SIREN_A }),
      '2027-01-01T00:00:01Z'
    );
    const f = recu(
      T.facture_emise,
      facture('fac-fa', 1000, '2027-02-01T00:00:00Z', { devisId: 'devis-fa', siren: SIREN_A }),
      '2027-02-01T00:00:01Z'
    );
    const b = base([d, f]);
    b.devisConnus.push({
      devisRef: 'devis-fa',
      siren: SIREN_A,
      emisAt: date('2027-01-01T00:00:00Z'),
      signeAt: date('2027-01-01T00:00:00Z'),
      montantTotalHtCents: 1000,
      factureHtCents: 0,
    });
    await projeter(b, f);
    expect(b.devisConnus[0]!.factureHtCents).toBe(1000);
    expect(b.entreprises.map((e) => e.origine).sort()).toEqual(['client', 'devis']);

    const c = recu(T.client_cree, { clientId: 'cli-fb', siren: SIREN_B }, '2027-01-01T00:00:01Z');
    const sansDevis = recu(
      T.facture_emise,
      facture('fac-fb', 10, '2027-02-01T00:00:00Z', { clientId: 'cli-fb' }),
      '2027-02-01T00:00:01Z'
    );
    const b2 = base([c, sansDevis]);
    await projeter(b2, sansDevis);
    expect(b2.devisConnus).toEqual([]);
    expect(b2.entreprises).toMatchObject([{ siren: SIREN_B, origine: 'client' }]);
  });

  it('REQ-DM-029 : une facture sans SIREN connu ne pose aucune entreprise', async () => {
    const f = recu(
      T.facture_emise,
      facture('fac-x', 10, '2027-02-01T00:00:00Z'),
      '2027-02-01T00:00:01Z'
    );
    const b = base([f]);
    await projeter(b, f);
    expect(b.entreprises).toEqual([]);
  });

  it.each([
    ['une annulation', T.facture_annulee, 'factureId'],
    ['un avoir', T.avoir_emis, 'avoirDeFactureId'],
  ])('REQ-DM-029 : %s — la facture visée, son devis et son entreprise', async (_, type, champ) => {
    const d = recu(
      T.devis_signe,
      signe('devis-an', '2027-01-01T00:00:00Z', 1000, { siren: SIREN_A }),
      '2027-01-01T00:00:01Z'
    );
    const f = recu(
      T.facture_emise,
      facture('fac-an', 1000, '2027-02-01T00:00:00Z', { devisId: 'devis-an' }),
      '2027-02-01T00:00:01Z'
    );
    const g = recu(
      T.facture_emise,
      facture('fac-an-2', 1000, '2027-02-02T00:00:00Z', { siren: SIREN_B }),
      '2027-02-02T00:00:01Z'
    );
    const b = base([d, f, g]);
    // l'état d'avant : entièrement facturé, et cliente.
    b.devisConnus.push({
      devisRef: 'devis-an',
      siren: SIREN_A,
      emisAt: date('2027-01-01T00:00:00Z'),
      signeAt: date('2027-01-01T00:00:00Z'),
      montantTotalHtCents: 1000,
      factureHtCents: 1000,
    });
    b.entreprises.push({
      siren: SIREN_A,
      origine: 'client',
      connueDepuisAt: date('2027-02-01T00:00:00Z'),
      dernierContactAt: date('2027-02-01T00:00:00Z'),
    });
    b.entreprises.push({
      siren: SIREN_B,
      origine: 'client',
      connueDepuisAt: date('2027-02-02T00:00:00Z'),
      dernierContactAt: date('2027-02-02T00:00:00Z'),
    });
    const r = recu(
      type,
      type === T.avoir_emis ? { [champ]: 'fac-an', montantHtCents: 1000 } : { [champ]: 'fac-an' },
      '2027-03-01T00:00:01Z'
    );
    b.recus.push(r);
    await projeter(b, r);
    expect(b.devisConnus[0]!.factureHtCents).toBe(0);
    expect(b.entreprises.filter((e) => e.siren === SIREN_A).map((e) => e.origine)).toEqual([
      'devis',
    ]);
    // l'autre entreprise n'est pas touchée : sa ligne reste telle quelle.
    expect(b.entreprises.filter((e) => e.siren === SIREN_B)).toHaveLength(1);
  });

  it('REQ-DM-029 : une facture visée sans devis ni SIREN, ou pas de facture visée — rien n’est touché', async () => {
    const f = recu(
      T.facture_emise,
      facture('fac-nu', 10, '2027-02-01T00:00:00Z'),
      '2027-02-01T00:00:01Z'
    );
    const b = base([f]);
    for (const r of [
      recu(T.facture_annulee, { factureId: 'fac-nu' }, '2027-03-01T00:00:01Z'),
      recu(T.avoir_emis, { montantHtCents: 10 }, '2027-03-01T00:00:01Z'),
      recu(T.facture_annulee, { factureId: 'fac-inconnue' }, '2027-03-01T00:00:01Z'),
    ]) {
      b.recus.push(r);
      await projeter(b, r);
    }
    expect(b.devisConnus).toEqual([]);
    expect(b.entreprises).toEqual([]);
  });

  it.each([T.client_cree, T.client_mis_a_jour])(
    'REQ-DM-029 : %s — ses devis changent d’entreprise : l’ancienne les perd, la nouvelle les reçoit',
    async (type) => {
      const b = base([
        recu(T.client_cree, { clientId: 'cli-m', siren: SIREN_A }, '2027-01-01T00:00:01Z'),
        recu(
          T.devis_emis,
          emis('devis-m1', '2027-02-01T00:00:00Z', { clientId: 'cli-m' }),
          '2027-02-01T00:00:01Z'
        ),
        recu(
          T.devis_signe,
          signe('devis-m2', '2027-02-05T00:00:00Z', 10, { clientId: 'cli-m' }),
          '2027-02-05T00:00:01Z'
        ),
        recu(
          T.devis_emis,
          emis('devis-ailleurs', '2027-02-01T00:00:00Z', { clientId: 'cli-z', siren: SIREN_C }),
          '2027-02-01T00:00:02Z'
        ),
      ]);
      b.devisConnus.push(
        {
          devisRef: 'devis-m1',
          siren: SIREN_A,
          emisAt: date('2027-02-01T00:00:00Z'),
          signeAt: null,
        },
        {
          devisRef: 'devis-m2',
          siren: SIREN_A,
          emisAt: date('2027-02-05T00:00:00Z'),
          signeAt: date('2027-02-05T00:00:00Z'),
        }
      );
      b.entreprises.push({
        siren: SIREN_A,
        origine: 'devis',
        connueDepuisAt: date('2027-02-01T00:00:00Z'),
        dernierContactAt: date('2027-02-05T00:00:00Z'),
      });
      const r = recu(type, { clientId: 'cli-m', siren: SIREN_B }, '2027-03-01T00:00:01Z');
      b.recus.push(r);
      await projeter(b, r);
      expect(b.devisConnus.map((d) => [d.devisRef, d.siren])).toEqual([
        ['devis-m1', SIREN_B],
        ['devis-m2', SIREN_B],
      ]);
      expect(b.entreprises.map((e) => [e.siren, e.origine])).toEqual([[SIREN_B, 'devis']]);
    }
  );

  it('REQ-DM-029 : un client sans devis — son entreprise est recalculée sur ses factures', async () => {
    const b = base([
      recu(
        T.facture_emise,
        facture('fac-cl', 10, '2027-02-01T00:00:00Z', { clientId: 'cli-f' }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    const r = recu(T.client_cree, { clientId: 'cli-f', siren: SIREN_A }, '2027-03-01T00:00:01Z');
    b.recus.push(r);
    await projeter(b, r);
    expect(b.entreprises).toMatchObject([{ siren: SIREN_A, origine: 'client' }]);
  });

  it('REQ-DM-029 : un client sans identifiant, ou sans SIREN, ne pose rien', async () => {
    const b = base([
      recu(
        T.facture_emise,
        facture('fac-cl', 10, '2027-02-01T00:00:00Z', { clientId: 'cli-f' }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    for (const r of [
      recu(T.client_cree, { siren: SIREN_A }, '2027-03-01T00:00:01Z'),
      recu(T.client_cree, { clientId: 'cli-f' }, '2027-03-01T00:00:02Z'),
    ]) {
      b.recus.push(r);
      await projeter(b, r);
    }
    expect(b.entreprises).toEqual([]);
  });

  it('REQ-DM-029 : un type hors de la projection ne touche rien', async () => {
    const r = recu(
      T.paiement_recu,
      { devisId: 'devis-p', siren: SIREN_A, clientId: 'cli' },
      '2027-01-01T00:00:01Z'
    );
    const b = base([
      recu(
        T.devis_emis,
        emis('devis-p', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
        '2027-01-01T00:00:00Z'
      ),
      r,
    ]);
    await projeter(b, r);
    expect(b.devisConnus).toEqual([]);
    expect(b.entreprises).toEqual([]);
  });
});

// ── l'évaluation, locale ────────────────────────────────────────────────────────────────────────

describe('REQ-DM-029 REQ-DM-028 — anterioriteDe : sur les seules projections locales', () => {
  const MAINTENANT = date('2027-06-15T12:00:00Z');

  it('REQ-DM-028 : inscrite sur la liste de la Société — financeur, avec sa CATÉGORIE', async () => {
    const b = base();
    b.liste.push({ siren: SIREN_A, motif: 'financeur_public', ajouteParId: 'console-1' });
    expect(await anterioriteDe(b.db as never, SIREN_A, MAINTENANT)).toEqual({
      connue: true,
      origine: 'financeur',
      depuis: null,
      categorie: 'financeur_public',
    });
  });

  it('REQ-DM-029 : cliente — la dernière prestation facturée, lue sur la ligne client de CE SIREN', async () => {
    const b = base();
    b.entreprises.push(
      {
        siren: SIREN_A,
        origine: 'client',
        connueDepuisAt: date('2026-01-01T00:00:00Z'),
        dernierContactAt: date('2027-05-01T00:00:00Z'),
      },
      {
        siren: SIREN_A,
        origine: 'devis',
        connueDepuisAt: date('2027-06-01T00:00:00Z'),
        dernierContactAt: date('2027-06-01T00:00:00Z'),
      },
      {
        siren: SIREN_B,
        origine: 'client',
        connueDepuisAt: date('2027-06-01T00:00:00Z'),
        dernierContactAt: date('2027-06-01T00:00:00Z'),
      }
    );
    expect(await anterioriteDe(b.db as never, SIREN_A, MAINTENANT)).toEqual({
      connue: true,
      origine: 'client',
      depuis: date('2027-05-01T00:00:00Z'),
    });
  });

  it('REQ-DM-029 : par ses devis — signé et pas entièrement facturé ; entièrement facturé, il ne compte plus', async () => {
    const b = base();
    b.devisConnus.push(
      {
        devisRef: 'd-ouvert',
        siren: SIREN_A,
        emisAt: date('2020-01-01T00:00:00Z'),
        signeAt: date('2020-02-01T00:00:00Z'),
        montantTotalHtCents: 1000,
        factureHtCents: 999,
      },
      {
        devisRef: 'd-solde',
        siren: SIREN_B,
        emisAt: date('2020-01-01T00:00:00Z'),
        signeAt: date('2020-02-01T00:00:00Z'),
        montantTotalHtCents: 1000,
        factureHtCents: 1000,
      }
    );
    expect(await anterioriteDe(b.db as never, SIREN_A, MAINTENANT)).toEqual({
      connue: true,
      origine: 'devis',
      depuis: date('2020-02-01T00:00:00Z'),
    });
    expect(await anterioriteDe(b.db as never, SIREN_B, MAINTENANT)).toEqual({ connue: false });
  });

  it('REQ-DM-029 : par un devis émis récemment ; d’un autre SIREN, il ne compte pas', async () => {
    const b = base();
    b.devisConnus.push({
      devisRef: 'd-recent',
      siren: SIREN_B,
      emisAt: date('2027-05-01T00:00:00Z'),
      signeAt: null,
      montantTotalHtCents: 0,
      factureHtCents: 0,
    });
    expect(await anterioriteDe(b.db as never, SIREN_B, MAINTENANT)).toEqual({
      connue: true,
      origine: 'devis',
      depuis: date('2027-05-01T00:00:00Z'),
    });
    expect(await anterioriteDe(b.db as never, SIREN_A, MAINTENANT)).toEqual({ connue: false });
  });
});

describe('REQ-DM-029 — la projection verrouille ses SIREN avant d’écrire (lentille sécurité, DM-66)', () => {
  it('REQ-DM-029 : TÉMOIN — le SIREN d’un devis est verrouillé AVANT l’écriture de sa ligne', async () => {
    const r = recu(
      T.devis_emis,
      emis('devis-v', '2027-01-01T00:00:00Z', { siren: SIREN_A }),
      '2027-01-01T00:00:01Z'
    );
    const b = base([r]);
    await projeterEvenement(b.prisma, aTraiter(r.eventType, r.charge));
    expect(b.ordre).toEqual([`verrou:${DOMAINE_DU_VERROU}|${SIREN_A}`, 'devis:devis-v']);
  });

  it('REQ-DM-029 : TÉMOIN — un devis qui CHANGE de SIREN verrouille l’ancien et le nouveau, dans l’ordre CROISSANT', async () => {
    const b = base([
      recu(T.client_cree, { clientId: 'cli-v', siren: SIREN_B }, '2027-01-01T00:00:01Z'),
      recu(
        T.devis_emis,
        emis('devis-v', '2027-02-01T00:00:00Z', { clientId: 'cli-v' }),
        '2027-02-01T00:00:01Z'
      ),
    ]);
    // la ligne est aujourd'hui sous SIREN_B ; le client passe à SIREN_A (plus petit)
    b.devisConnus.push({
      devisRef: 'devis-v',
      siren: SIREN_B,
      emisAt: new Date('2027-02-01T00:00:00Z'),
      signeAt: null,
    });
    const r = recu(
      T.client_mis_a_jour,
      { clientId: 'cli-v', siren: SIREN_A },
      '2027-03-01T00:00:01Z'
    );
    b.recus.push(r);
    await projeterEvenement(b.prisma, aTraiter(r.eventType, r.charge));
    const verrous = b.ordre.filter((o) => o.startsWith('verrou:'));
    expect(verrous).toEqual([
      `verrou:${DOMAINE_DU_VERROU}|${SIREN_A}`,
      `verrou:${DOMAINE_DU_VERROU}|${SIREN_B}`,
    ]);
    expect(b.ordre.indexOf('devis:devis-v')).toBeGreaterThan(b.ordre.lastIndexOf(verrous.at(-1)!));
  });

  it('REQ-DM-029 : verrouillerLesSirens — dédoublonnés, ordre croissant, forme à deux clés du domaine propre', async () => {
    const vus: unknown[][] = [];
    const tx = {
      $executeRaw: async (sql: TemplateStringsArray, ...valeurs: unknown[]) => {
        vus.push([sql.join('?'), ...valeurs]);
        return 1;
      },
    };
    await verrouillerLesSirens(tx as never, [SIREN_C, SIREN_A, SIREN_C, SIREN_B]);
    expect(vus.map((v) => v.slice(1))).toEqual([
      [DOMAINE_DU_VERROU, SIREN_A],
      [DOMAINE_DU_VERROU, SIREN_B],
      [DOMAINE_DU_VERROU, SIREN_C],
    ]);
    expect(String(vus[0]![0])).toMatch(/pg_advisory_xact_lock\(hashtext\(\?\), hashtext\(\?\)\)/);
    expect(DOMAINE_DU_VERROU).toBe('partners.entreprise_connue');
  });
});
