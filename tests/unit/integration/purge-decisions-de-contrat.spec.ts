// @req REQ-JUR-029
/**
 * DM-70 — la purge du texte d'une décision de contrat, jugée EN PROCESSUS sur un double de Prisma :
 * le point de départ de chaque geste, l'échéance au jour civil de Paris, ce que le passage DEMANDE à
 * la base (sa sélection, son écriture) et ce qu'il en rend. Ce que la base en fait — la garde dédiée
 * de la table, la ligne nue qui reste, le rendu qui refuse un texte purgé — est jugé en base réelle par
 * `tests/integration/purge-decisions-de-contrat.spec.ts`. Ce fichier-ci existe pour la mutation :
 * `pnpm mutation:pr` ne lance que les tests en processus (`vitest.mutation.config.ts`).
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  LOT_DE_PURGE_DES_DECISIONS,
  departDuTexte,
  echeanceDuTexte,
  purgerLesTextesDesDecisions,
  texteEchu,
} from '../../../src/server/taches/purger-textes-des-decisions';
import { SEUILS } from '../../../src/domain/seuils/ssot';

/** Une colonne DATE, telle que Prisma la rend : minuit UTC du jour civil. */
const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const civil = (annee: number, mois: number, j: number) => ({ annee, mois, jour: j });

describe('REQ-JUR-029 — la SSOT de la juriste', () => {
  it('REQ-JUR-029 : DECISION_CONTRAT_TEXTE_CONSERVATION_ANS vaut 5 ans', () => {
    expect(SEUILS.DECISION_CONTRAT_TEXTE_CONSERVATION_ANS.valeur).toBe(5);
    expect(SEUILS.DECISION_CONTRAT_TEXTE_CONSERVATION_ANS.unite).toBe('ans');
  });
});

describe('REQ-JUR-029 — le point de départ, aux trois cas de la juriste', () => {
  it('REQ-JUR-029 : TÉMOIN — une résiliation court depuis sa date_effet', () => {
    expect(
      departDuTexte(
        {
          geste: 'resiliation',
          dateEffet: jour('2026-11-30'),
          creeAt: new Date('2026-10-04T08:00:00Z'),
        },
        null
      )
    ).toEqual(civil(2026, 11, 30));
  });

  it('REQ-JUR-029 : TÉMOIN — une mise en demeure suivie d’une résiliation court depuis la date_effet de celle-ci', () => {
    expect(
      departDuTexte(
        { geste: 'mise_en_demeure', dateEffet: null, creeAt: new Date('2026-10-04T08:00:00Z') },
        { dateEffet: jour('2026-12-15') }
      )
    ).toEqual(civil(2026, 12, 15));
  });

  it('REQ-JUR-029 : TÉMOIN — une mise en demeure sans résiliation court depuis le jour civil de Paris de son cree_at', () => {
    // 22h30 UTC le 4 octobre est déjà le 5 octobre à Paris (heure d'été) : le jour de Paris compte.
    expect(
      departDuTexte(
        { geste: 'mise_en_demeure', dateEffet: null, creeAt: new Date('2026-10-04T22:30:00Z') },
        null
      )
    ).toEqual(civil(2026, 10, 5));
    expect(
      departDuTexte(
        { geste: 'mise_en_demeure', dateEffet: null, creeAt: new Date('2026-10-04T21:59:59.999Z') },
        null
      )
    ).toEqual(civil(2026, 10, 4));
  });

  it('REQ-JUR-029 : TÉMOIN — une SUSPENSION n’a pas encore de départ : son texte est GARDÉ, même vingt ans après sa pose (SEC-15 ; A02, #794 6036131730, point 4)', () => {
    // La règle de la juriste (la levée, sinon la fin du contrat) se lit au journal : elle vient avec
    // la lecture de la résiliation opposable. D'ici là, aucune purge par défaut.
    for (const resiliation of [null, { dateEffet: jour('2027-01-31') }]) {
      expect(
        departDuTexte(
          { geste: 'suspension', dateEffet: null, creeAt: new Date('2006-10-07T07:30:00Z') },
          resiliation
        )
      ).toBeNull();
    }
  });

  it('REQ-JUR-029 : une résiliation sans date_effet n’a pas de départ (échec fermé : le texte est gardé)', () => {
    expect(
      departDuTexte(
        { geste: 'resiliation', dateEffet: null, creeAt: new Date('2020-01-01T00:00:00Z') },
        null
      )
    ).toBeNull();
  });
});

describe('REQ-JUR-029 — l’échéance, en jours civils de Paris', () => {
  it('REQ-JUR-029 : le départ plus cinq ans', () => {
    expect(echeanceDuTexte(civil(2026, 10, 5))).toEqual(civil(2031, 10, 5));
  });

  it('REQ-JUR-029 : un départ au 29 février échoit le 28 février, jamais le 1er mars', () => {
    expect(echeanceDuTexte(civil(2028, 2, 29))).toEqual(civil(2033, 2, 28));
  });

  // Correction de la juriste (#766, 5988086461, point 2) : le jour anniversaire appartient encore au
  // délai (code civil art. 2229) ; la purge a lieu au plus tôt le LENDEMAIN, heure de Paris.
  it('REQ-JUR-029 : TÉMOIN À TROIS FACES — la veille et le jour de l’échéance, rien ; le lendemain, échu (heure de Paris)', () => {
    const depart = civil(2026, 10, 5);
    // L'échéance est le 5 octobre 2031 ; minuit à Paris est 22h00 UTC la veille (heure d'été).
    expect(texteEchu(depart, new Date('2031-10-04T12:00:00.000Z'))).toBe(false);
    expect(texteEchu(depart, new Date('2031-10-04T22:00:00.000Z'))).toBe(false);
    expect(texteEchu(depart, new Date('2031-10-05T21:59:59.999Z'))).toBe(false);
    expect(texteEchu(depart, new Date('2031-10-05T22:00:00.000Z'))).toBe(true);
    expect(texteEchu(depart, new Date('2031-10-06T09:00:00.000Z'))).toBe(true);
    expect(texteEchu(depart, new Date('2030-10-05T12:00:00.000Z'))).toBe(false);
  });

  it('REQ-JUR-029 : sans départ, jamais échu', () => {
    expect(texteEchu(null, new Date('2099-01-01T00:00:00Z'))).toBe(false);
  });
});

type Candidate = {
  id: string;
  apporteurId: string;
  geste: 'mise_en_demeure' | 'resiliation';
  dateEffet: Date | null;
  creeAt: Date;
};

/** Une résiliation du double : son fait fondateur est un changement de statut, sauf `fait` contraire. */
type Resiliation = {
  /** Son identifiant ; `r<n>` par défaut. C'est lui que cite `decisionContratId`. */
  id?: string;
  apporteurId: string;
  dateEffet: Date | null;
  creeAt: Date;
  fait?: string;
  /** Un passage à `resilie` la cite par `decisionContratId` (SEC-66, #781). */
  citee?: boolean;
};

function unDouble(lots: Candidate[][], resiliations: Resiliation[]) {
  const restants = [...lots];
  // Chaque résiliation porte son `evenementId` ; le journal du double rend le type de ce fait.
  const lignes = resiliations.map((r, n) => ({
    id: r.id ?? `r${n}`,
    apporteurId: r.apporteurId,
    dateEffet: r.dateEffet,
    creeAt: r.creeAt,
    evenementId: BigInt(1000 + n),
  }));
  const faits = new Map(
    resiliations.map((r, n) => [String(1000 + n), r.fait ?? 'apporteur_statut_modifie'])
  );
  const findMany = vi.fn(async (args: { where: { geste?: string } }) =>
    args.where.geste === 'resiliation' ? lignes : (restants.shift() ?? [])
  );
  const updateMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => ({
    count: args.where.id.in.length,
  }));
  const findUnique = vi.fn(async (args: { where: { id: bigint } }) => {
    const type = faits.get(String(args.where.id));
    return type === undefined ? null : { type, charge: {} };
  });
  // La lecture par `decisionContratId` : un passage à `resilie` qui cite la ligne, par le module du journal.
  const citees = new Set(resiliations.flatMap((r, n) => (r.citee ? [r.id ?? `r${n}`] : [])));
  const findFirst = vi.fn(
    async (args: { where: { charge: { path: string[]; equals: string } } }) =>
      citees.has(args.where.charge.equals) ? { id: 88n } : null
  );
  const prisma = {
    decisionDeContrat: { findMany, updateMany },
    evenement: { findUnique, findFirst },
  } as unknown as PrismaClient;
  return { prisma, findMany, updateMany, findUnique, findFirst };
}

const MAINTENANT = new Date('2031-10-06T09:00:00.000Z');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('REQ-JUR-029 — le passage : sa sélection, son écriture, ce qu’il rend', () => {
  it('REQ-JUR-029 : TÉMOIN — une résiliation fondée sur un AUTRE fait qu’un changement de statut ne déplace pas le départ (limite nommée)', async () => {
    const d = unDouble(
      [
        [
          {
            id: 'm1',
            apporteurId: A,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-01T08:00:00Z'),
          },
        ],
      ],
      [
        {
          apporteurId: A,
          dateEffet: jour('2026-12-01'),
          creeAt: new Date('2026-09-02T08:00:00Z'),
          fait: 'apporteur_mis_en_demeure',
        },
      ]
    );
    // La résiliation ne compte pas : la mise en demeure court de son jour de Paris, échu au 2031-10-06.
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 1 });
    expect(d.findUnique).toHaveBeenCalledWith({
      where: { id: BigInt(1000) },
      select: { type: true, charge: true },
    });
  });

  it('REQ-JUR-029 : TÉMOIN — seuls les textes échus sont purgés : le texte ET son empreinte vidés, la date posée, dans la même écriture', async () => {
    const d = unDouble(
      [
        [
          // Échue : résiliation au 2026-10-01.
          {
            id: 'r1',
            apporteurId: A,
            geste: 'resiliation',
            dateEffet: jour('2026-10-01'),
            creeAt: new Date('2026-10-01T08:00:00Z'),
          },
          // Non échue : résiliation au 2026-10-07.
          {
            id: 'r2',
            apporteurId: B,
            geste: 'resiliation',
            dateEffet: jour('2026-10-07'),
            creeAt: new Date('2026-10-01T08:00:00Z'),
          },
          // Mise en demeure de A, avant sa résiliation du 2026-10-01 : échue avec elle.
          {
            id: 'm1',
            apporteurId: A,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-01T08:00:00Z'),
          },
          // Mise en demeure de B, suivie de sa résiliation au 2026-10-07 : gardée comme elle.
          {
            id: 'm2',
            apporteurId: B,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-01T08:00:00Z'),
          },
        ],
      ],
      [
        { apporteurId: A, dateEffet: jour('2026-10-01'), creeAt: new Date('2026-10-01T08:00:00Z') },
        { apporteurId: B, dateEffet: jour('2026-10-07'), creeAt: new Date('2026-10-01T08:00:00Z') },
      ]
    );
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 2 });
    expect(d.updateMany).toHaveBeenCalledTimes(1);
    expect(d.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'm1'] }, textePurgeAt: null, NOT: { texteChiffre: null } },
      data: { texteChiffre: null, faitsEmpreinte: null, textePurgeAt: MAINTENANT },
    });
  });

  it('REQ-JUR-029 : TÉMOIN — une mise en demeure lit la PREMIÈRE résiliation créée à ou après elle, jamais une antérieure', async () => {
    const d = unDouble(
      [
        [
          {
            id: 'm1',
            apporteurId: A,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-01T08:00:00Z'),
          },
        ],
      ],
      [
        // Antérieure à la mise en demeure : ignorée, sinon la mise en demeure échoirait trop tôt.
        { apporteurId: A, dateEffet: jour('2026-01-01'), creeAt: new Date('2026-01-01T08:00:00Z') },
        // La suivante : son départ, non échu au 2031-10-06.
        { apporteurId: A, dateEffet: jour('2026-12-01'), creeAt: new Date('2026-09-02T08:00:00Z') },
        { apporteurId: A, dateEffet: jour('2026-01-02'), creeAt: new Date('2026-09-03T08:00:00Z') },
      ]
    );
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 0 });
    expect(d.updateMany).not.toHaveBeenCalled();
  });

  it('REQ-JUR-029 : une mise en demeure sans résiliation court de son jour de Paris : rien le jour anniversaire, purgée le lendemain', async () => {
    const leJour = unDouble(
      [
        [
          {
            id: 'm1',
            apporteurId: A,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-10-06T08:00:00Z'),
          },
        ],
      ],
      []
    );
    expect(await purgerLesTextesDesDecisions(leJour.prisma, MAINTENANT)).toEqual({
      textesPurges: 0,
    });
    const laVeille = unDouble(
      [
        [
          {
            id: 'm1',
            apporteurId: A,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-10-05T08:00:00Z'),
          },
        ],
      ],
      []
    );
    expect(await purgerLesTextesDesDecisions(laVeille.prisma, MAINTENANT)).toEqual({
      textesPurges: 1,
    });
  });

  it('REQ-JUR-029 : la sélection — textes présents, jamais purgés, assez anciens, par lots bornés, en avançant sur l’id', async () => {
    // Un lot PLEIN appelle le suivant, après le dernier id lu ; un lot court clôt le passage.
    const plein: Candidate[] = Array.from({ length: LOT_DE_PURGE_DES_DECISIONS }, (_, n) => ({
      id: `r${String(n).padStart(3, '0')}`,
      apporteurId: A,
      geste: 'resiliation',
      dateEffet: jour('2026-10-01'),
      creeAt: new Date('2026-10-01T08:00:00Z'),
    }));
    const court: Candidate[] = [
      {
        id: 'z1',
        apporteurId: A,
        geste: 'resiliation',
        dateEffet: jour('2026-10-02'),
        creeAt: new Date('2026-10-01T08:00:00Z'),
      },
    ];
    const d = unDouble([plein, court], []);
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({
      textesPurges: LOT_DE_PURGE_DES_DECISIONS + 1,
    });
    const lectures = d.findMany.mock.calls.map((c) => c[0] as Record<string, unknown>);
    // Cinq ans avant l'instant, plus deux jours de marge.
    const borne = new Date('2026-10-08T09:00:00.000Z');
    expect(lectures[0]).toEqual({
      where: { textePurgeAt: null, NOT: { texteChiffre: null }, creeAt: { lte: borne } },
      select: { id: true, apporteurId: true, geste: true, dateEffet: true, creeAt: true },
      orderBy: { id: 'asc' },
      take: LOT_DE_PURGE_DES_DECISIONS,
    });
    expect(lectures[1]).toEqual({
      ...lectures[0],
      where: { ...(lectures[0]!.where as object), id: { gt: 'r499' } },
    });
    expect(lectures).toHaveLength(2);
    expect(d.updateMany).toHaveBeenCalledTimes(2);
    expect(LOT_DE_PURGE_DES_DECISIONS).toBe(500);
  });

  it('REQ-JUR-029 : un lot sans texte échu n’écrit rien, et le passage s’arrête au premier lot vide', async () => {
    const d = unDouble([], []);
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 0 });
    expect(d.findMany).toHaveBeenCalledTimes(1);
    expect(d.updateMany).not.toHaveBeenCalled();
  });

  it('REQ-JUR-029 : un lot sans mise en demeure ne lit aucune résiliation ; un lot qui en porte les lit pour ses seuls apporteurs', async () => {
    const sans = unDouble(
      [
        [
          {
            id: 'r1',
            apporteurId: A,
            geste: 'resiliation',
            dateEffet: jour('2026-10-01'),
            creeAt: new Date('2026-10-01T08:00:00Z'),
          },
        ],
      ],
      []
    );
    await purgerLesTextesDesDecisions(sans.prisma, MAINTENANT);
    expect(
      sans.findMany.mock.calls.some((c) => (c[0] as { where: { geste?: string } }).where.geste)
    ).toBe(false);

    const avec = unDouble(
      [
        [
          {
            id: 'm1',
            apporteurId: B,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-01T08:00:00Z'),
          },
          {
            id: 'm2',
            apporteurId: B,
            geste: 'mise_en_demeure',
            dateEffet: null,
            creeAt: new Date('2026-09-02T08:00:00Z'),
          },
        ],
      ],
      []
    );
    await purgerLesTextesDesDecisions(avec.prisma, MAINTENANT);
    expect(avec.findMany).toHaveBeenCalledWith({
      // Correction de la juriste (#766, 5988086461, point 1) : seule une résiliation OPPOSABLE compte ;
      // aujourd'hui, celle que fonde un changement de statut (la coupure immédiate).
      // Le type du fait fondateur se lit ENSUITE, au module du journal, par `evenementId` : la
      // relation vers le journal n'est jamais employée par le code (condition d'A02).
      where: { apporteurId: { in: [B] }, geste: 'resiliation' },
      select: { id: true, apporteurId: true, dateEffet: true, creeAt: true, evenementId: true },
      orderBy: [{ creeAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('REQ-JUR-029 : la date reçue n’est pas modifiée', async () => {
    const m = new Date(MAINTENANT.getTime());
    await purgerLesTextesDesDecisions(unDouble([], []).prisma, m);
    expect(m).toEqual(MAINTENANT);
  });
});

describe('REQ-JUR-029 — la limite tombe : la décision citée par decisionContratId (SEC-66, #781)', () => {
  // Une mise en demeure du 2026-09-01. Sans résiliation opposable, son départ est son jour : l'échéance
  // 2031-09-01 est passée au 2031-10-06 (purgée). Une résiliation notifiée, citée, la déplace à sa
  // date_effet 2026-12-01 : l'échéance 2031-12-01 n'est pas atteinte (gardée).
  const MISE_EN_DEMEURE: Candidate = {
    id: 'm1',
    apporteurId: A,
    geste: 'mise_en_demeure',
    dateEffet: null,
    creeAt: new Date('2026-09-01T08:00:00Z'),
  };
  const NOTIFIEE = (
    id: string,
    dateEffet: string,
    creeAt: string,
    citee: boolean
  ): Resiliation => ({
    id,
    apporteurId: A,
    dateEffet: jour(dateEffet),
    creeAt: new Date(creeAt),
    fait: 'apporteur_resiliation_notifiee',
    citee,
  });

  it('REQ-JUR-029 : TÉMOIN À DEUX FACES — une résiliation notifiée CITÉE déplace le départ ; CADUQUE, la mise en demeure part de son cree_at', async () => {
    const citee = unDouble(
      [[MISE_EN_DEMEURE]],
      [NOTIFIEE('r1', '2026-12-01', '2026-09-02T08:00:00Z', true)]
    );
    expect(await purgerLesTextesDesDecisions(citee.prisma, MAINTENANT)).toEqual({
      textesPurges: 0,
    });
    expect(citee.updateMany).not.toHaveBeenCalled();

    const caduque = unDouble(
      [[MISE_EN_DEMEURE]],
      [NOTIFIEE('r1', '2026-12-01', '2026-09-02T08:00:00Z', false)]
    );
    expect(await purgerLesTextesDesDecisions(caduque.prisma, MAINTENANT)).toEqual({
      textesPurges: 1,
    });
    expect(caduque.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] }, textePurgeAt: null, NOT: { texteChiffre: null } },
      data: { texteChiffre: null, faitsEmpreinte: null, textePurgeAt: MAINTENANT },
    });
  });

  it('REQ-JUR-029 : la citation se cherche par l’UUID de la LIGNE de décision, au journal, dans le passage à resilie', async () => {
    const d = unDouble(
      [[MISE_EN_DEMEURE]],
      [NOTIFIEE('11111111-1111-4111-8111-111111111111', '2026-12-01', '2026-09-02T08:00:00Z', true)]
    );
    await purgerLesTextesDesDecisions(d.prisma, MAINTENANT);
    expect(d.findFirst).toHaveBeenCalledTimes(1);
    expect(d.findFirst.mock.calls[0]![0]).toMatchObject({
      where: {
        type: 'apporteur_statut_modifie',
        charge: { path: ['decisionContratId'], equals: '11111111-1111-4111-8111-111111111111' },
      },
    });
  });

  it('REQ-JUR-029 : la coupure immédiate (SEC-19) est opposable par construction : elle n’interroge pas le journal des citations', async () => {
    const d = unDouble(
      [[MISE_EN_DEMEURE]],
      [
        {
          apporteurId: A,
          dateEffet: jour('2026-12-01'),
          creeAt: new Date('2026-09-02T08:00:00Z'),
        },
      ]
    );
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 0 });
    expect(d.findFirst).not.toHaveBeenCalled();
  });

  it('REQ-JUR-029 : TÉMOIN — la première résiliation OPPOSABLE compte : une notifiée caduque plus ancienne est passée, la citée suivante fixe le départ', async () => {
    const d = unDouble(
      [[MISE_EN_DEMEURE]],
      [
        NOTIFIEE('r1', '2026-10-01', '2026-09-02T08:00:00Z', false),
        NOTIFIEE('r2', '2026-12-01', '2026-09-03T08:00:00Z', true),
      ]
    );
    // r1, non citée, est caduque : sa date_effet 2026-10-01 (échéance 2031-10-01, passée) ne compte pas.
    expect(await purgerLesTextesDesDecisions(d.prisma, MAINTENANT)).toEqual({ textesPurges: 0 });
    expect(d.findFirst).toHaveBeenCalledTimes(2);
  });
});
