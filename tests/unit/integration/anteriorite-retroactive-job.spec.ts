// @req REQ-JUR-007
// @req REQ-DM-043
/**
 * Le job de l'antériorité établie après coup, jugé en processus.
 *
 *   — `faitsDatesAuDepot` : les faits d'une entreprise, DATÉS, tels qu'ils étaient AU DÉPÔT. Une
 *     facture, un avoir, une annulation, une émission ou une signature postérieurs au dépôt sont
 *     ignorés : un avoir postérieur ne rend pas « non facturé » un devis qui l'était au dépôt ;
 *   — `rapprocherLesAnteriorites` : chaque attribution occupante d'une entreprise connue est jugée sur
 *     ces faits ; un critère rempli au dépôt l'annule par `anteriorite_etablie`, avec son critère, par
 *     l'écrivain des transitions. Une attribution déjà annulée n'occupe plus : rien n'est rejoué.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { TypeEvenementRecu, type PrismaClient } from '@prisma/client';

const transitionner = vi.hoisted(() => ({ transitionnerUneAttribution: vi.fn() }));
vi.mock('../../../src/server/attribution/transitionner', async (original) => ({
  ...(await original<typeof import('../../../src/server/attribution/transitionner')>()),
  ...transitionner,
}));

import {
  faitsDatesAuDepot,
  rapprocherLesAnteriorites,
} from '../../../src/server/jobs/anteriorite-retroactive';

const T = TypeEvenementRecu;
const DEPOT = new Date('2027-03-10T09:00:00.000Z');
const avant = (ms: number) => new Date(DEPOT.getTime() - ms);
const apres = (ms: number) => new Date(DEPOT.getTime() + ms);
const iso = (d: Date) => d.toISOString();
const JOUR = 24 * 3600 * 1000;
const SIREN = '100000001';

type Lu = { eventType: TypeEvenementRecu; charge: Record<string, unknown>; survenuAt: Date };
const lu = (
  eventType: TypeEvenementRecu,
  charge: Record<string, unknown>,
  survenuAt: Date
): Lu => ({
  eventType,
  charge,
  survenuAt,
});
/** Un identifiant d'axion-ia, UUID déterministe par libellé (les vrais sont `@default(uuid())`). */
const U = (libelle: string): string => {
  const h = createHash('sha256').update(libelle).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const facture = (id: string, montant: number, emiseLe: Date, extra: Record<string, unknown> = {}) =>
  lu(
    T.facture_emise,
    { factureId: id, montantHtCents: montant, emiseLe: iso(emiseLe), siren: SIREN, ...extra },
    emiseLe
  );

describe('REQ-JUR-007 — les faits, tels qu’ils étaient au dépôt', () => {
  it('REQ-JUR-007 : TÉMOIN — une facture avant le dépôt compte ; pile au dépôt ou après, non', () => {
    const f = faitsDatesAuDepot(
      [
        facture(U('f-avant'), 100, avant(1)),
        facture(U('f-pile'), 100, DEPOT),
        facture(U('f-apres'), 100, apres(1)),
      ],
      DEPOT
    );
    expect(f.facturesAt.map((d) => d.getTime())).toEqual([avant(1).getTime()]);
  });

  it('REQ-JUR-007 : TÉMOIN — annulée AVANT le dépôt, elle ne compte pas ; annulée APRÈS, elle comptait au dépôt', () => {
    const f = faitsDatesAuDepot(
      [
        facture(U('f-1'), 100, avant(10 * JOUR)),
        lu(T.facture_annulee, { factureId: U('f-1') }, avant(JOUR)),
        facture(U('f-2'), 100, avant(10 * JOUR)),
        lu(T.facture_annulee, { factureId: U('f-2') }, apres(JOUR)),
      ],
      DEPOT
    );
    expect(f.facturesAt).toHaveLength(1);
  });

  it('REQ-JUR-007 : TÉMOIN — éteinte par un avoir AVANT le dépôt, elle ne compte pas ; par un avoir APRÈS, elle comptait', () => {
    const f = faitsDatesAuDepot(
      [
        facture(U('f-1'), 100, avant(10 * JOUR)),
        lu(
          T.avoir_emis,
          { avoirDeFactureId: U('f-1'), montantHtCents: -100, emisLe: iso(avant(JOUR)) },
          avant(JOUR)
        ),
        facture(U('f-2'), 100, avant(10 * JOUR)),
        lu(
          T.avoir_emis,
          { avoirDeFactureId: U('f-2'), montantHtCents: -100, emisLe: iso(apres(JOUR)) },
          apres(JOUR)
        ),
      ],
      DEPOT
    );
    expect(f.facturesAt).toHaveLength(1);
  });

  it('REQ-JUR-007 : le devis — émis au plus tôt entre émission et signature, signé, son montant', () => {
    const f = faitsDatesAuDepot(
      [
        lu(
          T.devis_emis,
          { devisId: U('d-1'), emisLe: iso(avant(20 * JOUR)), siren: SIREN },
          avant(20 * JOUR)
        ),
        lu(
          T.devis_signe,
          { devisId: U('d-1'), signeLe: iso(avant(10 * JOUR)), montantTotalHtCents: 1000 },
          avant(10 * JOUR)
        ),
      ],
      DEPOT
    );
    expect(f.devis).toEqual([
      {
        emisAt: avant(20 * JOUR),
        signeAt: avant(10 * JOUR),
        montantTotalHtCents: 1000,
        factureHtCents: 0,
      },
    ]);
  });

  it('REQ-JUR-007 : TÉMOIN — le facturé du devis AU DÉPÔT : factures antérieures seules, avoirs et annulations antérieurs seuls', () => {
    const signe = lu(
      T.devis_signe,
      { devisId: U('d-1'), signeLe: iso(avant(30 * JOUR)), montantTotalHtCents: 1000 },
      avant(30 * JOUR)
    );
    const f = faitsDatesAuDepot(
      [
        signe,
        facture(U('f-1'), 600, avant(20 * JOUR), { devisId: U('d-1') }),
        facture(U('f-2'), 400, avant(15 * JOUR), { devisId: U('d-1') }),
        // un avoir POSTÉRIEUR ne rend pas « non facturé » ce qui l'était au dépôt
        lu(
          T.avoir_emis,
          { avoirDeFactureId: U('f-2'), montantHtCents: -400, emisLe: iso(apres(JOUR)) },
          apres(JOUR)
        ),
        // une facture POSTÉRIEURE n'entre pas dans le facturé au dépôt
        facture(U('f-3'), 999, apres(2 * JOUR), { devisId: U('d-1') }),
      ],
      DEPOT
    );
    expect(f.devis[0]!.factureHtCents).toBe(1000);

    const partiel = faitsDatesAuDepot(
      [
        signe,
        facture(U('f-1'), 600, avant(20 * JOUR), { devisId: U('d-1') }),
        facture(U('f-2'), 400, avant(15 * JOUR), { devisId: U('d-1') }),
        lu(T.facture_annulee, { factureId: U('f-2') }, avant(5 * JOUR)),
        lu(
          T.avoir_emis,
          { avoirDeFactureId: U('f-1'), montantHtCents: 100, emisLe: iso(avant(JOUR)) },
          avant(JOUR)
        ),
      ],
      DEPOT
    );
    expect(partiel.devis[0]!.factureHtCents).toBe(500);
  });

  it('REQ-JUR-007 : un fait à la charge illisible est ignoré, jamais lu comme une date', () => {
    const f = faitsDatesAuDepot(
      [
        facture(U('f-1'), 100, avant(JOUR), { emiseLe: 'pas une date' }),
        lu(T.devis_emis, { devisId: U('d-1'), emisLe: 'demain' }, avant(JOUR)),
        lu(T.devis_emis, { emisLe: iso(avant(JOUR)) }, avant(JOUR)),
      ],
      DEPOT
    );
    expect(f.facturesAt).toEqual([]);
    expect(f.devis).toEqual([]);
  });
});

// ── le job ──────────────────────────────────────────────────────────────────────────────────────

type Attribution = { id: string; siren: string; statut: string; deposeeAt: Date };

function base(o: {
  connues: { siren: string; origine: string; connueDepuisAt: Date }[];
  attributions: Attribution[];
  recus: { eventType: TypeEvenementRecu; charge: Record<string, unknown>; survenuAt: Date }[];
}) {
  const db = {
    entrepriseConnue: {
      findMany: async (q: { where: { origine: { in: string[] } } }) =>
        o.connues.filter((c) => q.where.origine.in.includes(c.origine)),
    },
    attribution: {
      findMany: async (q: {
        where: { siren: { in: string[] }; statut: { in: string[] }; id?: { gt: string } };
        take: number;
      }) =>
        o.attributions
          .filter(
            (a) =>
              q.where.siren.in.includes(a.siren) &&
              q.where.statut.in.includes(a.statut) &&
              (q.where.id === undefined || a.id > q.where.id.gt)
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, q.take),
    },
    evenementRecu: {
      findMany: async (q: {
        where: {
          eventType: { in: TypeEvenementRecu[] };
          charge: { path: string[]; equals: unknown };
        };
      }) =>
        o.recus.filter(
          (r) =>
            q.where.eventType.in.includes(r.eventType) &&
            r.charge[q.where.charge.path[0]!] === q.where.charge.equals
        ),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn('tx'),
  };
  return db as unknown as PrismaClient;
}

const MAINTENANT = new Date('2027-06-01T00:00:00.000Z');

describe('REQ-JUR-007 — le job annule par la machine, avec le critère, une fois', () => {
  beforeEach(() => {
    transitionner.transitionnerUneAttribution.mockReset();
    transitionner.transitionnerUneAttribution.mockResolvedValue({ de: 'active', vers: 'annulee' });
  });

  it('REQ-JUR-007 : TÉMOIN — une facture antérieure au dépôt annule, par anteriorite_etablie, critère cliente', async () => {
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [facture(U('f-1'), 100, avant(30 * JOUR))],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 1,
      annulees: 1,
    });
    const { refDuFaitFondateur } = await import('../../../src/server/attribution/transitionner');
    expect(transitionner.transitionnerUneAttribution).toHaveBeenCalledWith('tx', {
      attributionId: 'a-1',
      transition: 'anteriorite_etablie',
      critere: 'cliente',
      // DM-67, condition (c) : la référence de la facture qui fonde l'annulation, et sa date.
      fait: {
        nature: 'facture',
        ref: refDuFaitFondateur('facture', U('f-1')),
        le: avant(30 * JOUR).toISOString(),
      },
      acteur: { par: 'systeme' },
      maintenant: MAINTENANT,
    });
  });

  it('REQ-JUR-007 : TÉMOIN — un fait POSTÉRIEUR au dépôt n’annule rien', async () => {
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [facture(U('f-1'), 100, apres(JOUR))],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 1,
      annulees: 0,
    });
    expect(transitionner.transitionnerUneAttribution).not.toHaveBeenCalled();
  });

  it('REQ-JUR-007 : connue APRÈS le dépôt (première date de l’origine) : l’attribution n’est même pas examinée', async () => {
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'devis', connueDepuisAt: apres(JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 0,
      annulees: 0,
    });
  });

  it('REQ-JUR-007 : seules les attributions OCCUPANTES sont lues ; une annulée n’est pas rejouée', async () => {
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'annulee', deposeeAt: DEPOT }],
      recus: [facture(U('f-1'), 100, avant(30 * JOUR))],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 0,
      annulees: 0,
    });
  });

  it('REQ-JUR-007 : la liste de la Société n’est pas une origine lue ici', async () => {
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'financeur', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [facture(U('f-1'), 100, avant(30 * JOUR))],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 0,
      annulees: 0,
    });
  });

  it('REQ-JUR-007 : une transition refusée entre-temps (l’état a changé) est comptée, sans arrêter le passage', async () => {
    transitionner.transitionnerUneAttribution.mockRejectedValueOnce(
      Object.assign(new Error('perdue × anteriorite_etablie'), {
        name: 'ErreurTransitionAttribution',
        code: 'transition_refusee',
      })
    );
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [
        { id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT },
        { id: 'a-2', siren: SIREN, statut: 'signee', deposeeAt: DEPOT },
      ],
      recus: [facture(U('f-1'), 100, avant(30 * JOUR))],
    });
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 2,
      annulees: 1,
    });
  });

  it('REQ-JUR-007 : TÉMOIN — un devis lu par son SIREN ET par son client ne compte qu’une fois (copies de la base)', async () => {
    const vieux = avant(900 * JOUR);
    const emis = { devisId: U('d-1'), emisLe: iso(vieux), siren: SIREN, clientId: 'cli-1' };
    const signe = {
      devisId: U('d-1'),
      signeLe: iso(vieux),
      montantTotalHtCents: 1000,
      clientId: 'cli-1',
    };
    const recus = [
      lu(T.client_cree, { clientId: 'cli-1', siren: SIREN }, vieux),
      lu(T.devis_emis, emis, vieux),
      lu(T.devis_signe, signe, vieux),
      // la facture du devis, hors fenêtre cliente : 600 sur 1000, le devis signé reste ouvert
      facture(U('f-1'), 600, avant(800 * JOUR), { devisId: U('d-1'), clientId: 'cli-1' }),
    ];
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'devis', connueDepuisAt: vieux }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus,
    });
    // la base rend des COPIES à chaque lecture : l'identité d'objet ne dédoublonne rien.
    const lire = prisma.evenementRecu.findMany.bind(prisma.evenementRecu);
    (prisma.evenementRecu as unknown as { findMany: unknown }).findMany = async (q: never) =>
      (await lire(q)).map((r) => structuredClone(r));
    expect(await rapprocherLesAnteriorites(prisma, MAINTENANT)).toEqual({
      examinees: 1,
      annulees: 1,
    });
    expect(transitionner.transitionnerUneAttribution.mock.calls[0]![1]).toMatchObject({
      critere: 'devis_signe',
    });
  });

  it('REQ-JUR-007 : une autre levée de l’écrivain fait échouer le passage — rien n’est tu', async () => {
    transitionner.transitionnerUneAttribution.mockRejectedValueOnce(new Error('base indisponible'));
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [facture(U('f-1'), 100, avant(30 * JOUR))],
    });
    await expect(rapprocherLesAnteriorites(prisma, MAINTENANT)).rejects.toThrow(
      'base indisponible'
    );
  });
});

/**
 * Le rapprochement est QUOTIDIEN (acceptance de DM-25) : il est inscrit au lanceur sous une clé du
 * registre des tâches, qui porte son exigence, et son passage appelle le job à l'heure du système.
 */
describe('REQ-JUR-007 — le rapprochement des antériorités est inscrit au lanceur', () => {
  it('REQ-JUR-007 : TÉMOIN — la clé `anteriorites_rapprocher` est au registre, avec son exigence', async () => {
    const { TACHES } = await import('../../../src/server/taches/registre');
    expect(TACHES).toHaveProperty('anteriorites_rapprocher');
    expect((TACHES as Record<string, { req: string }>).anteriorites_rapprocher!.req).toBe(
      'REQ-JUR-007'
    );
  });

  it('REQ-JUR-007 : TÉMOIN STATIQUE — son inscription appelle rapprocherLesAnteriorites sur le client, à l’heure du système', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/server/taches/inscriptions.ts', 'utf8');
    expect(source).toMatch(
      /anteriorites_rapprocher: \(\) =>\s*rapprocherLesAnteriorites\(prisma, new Date\(horlogeSysteme\.maintenant\(\)\)\)/
    );
  });
});

describe('REQ-JUR-007 — un identifiant d’axion-ia hors forme arrête le passage, nommé', () => {
  it('REQ-JUR-007 : TÉMOIN — une facture fondatrice dont l’id n’est pas un UUID : reference_du_fait_invalide, et rien n’est écrit', async () => {
    transitionner.transitionnerUneAttribution.mockReset();
    const prisma = base({
      connues: [{ siren: SIREN, origine: 'client', connueDepuisAt: avant(30 * JOUR) }],
      attributions: [{ id: 'a-1', siren: SIREN, statut: 'active', deposeeAt: DEPOT }],
      recus: [facture('FAC-2026-0001', 100, avant(30 * JOUR))],
    });
    await expect(rapprocherLesAnteriorites(prisma, MAINTENANT)).rejects.toThrow(
      /^reference_du_fait_invalide/
    );
    expect(transitionner.transitionnerUneAttribution).not.toHaveBeenCalled();
  });
});
