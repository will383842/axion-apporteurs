// @req REQ-DM-028
/**
 * DM-65 — la liste tenue par la Société, jugée EN PROCESSUS sur un faux client fidèle aux requêtes
 * qu'elle émet : l'auteur est relu dans la transaction (rôle, désactivation, validation), l'ajout est
 * l'INSERT que la base trace, le retrait ferme la période puis supprime la ligne, sous verrou. Les
 * témoins en base réelle (la trace, les déclencheurs) vivent dans `tests/integration/liste-noire-trace.spec.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  DROIT_DE_TENIR_LA_LISTE,
  ErreurListeNoire,
  ajouterALaListe,
  retirerDeLaListe,
} from '../../../src/server/entreprise-connue/liste-noire';

const SIREN = '123456789';
const AUTEUR = '11111111-1111-4111-8111-111111111111';
const MAINTENANT = new Date('2026-10-07T12:00:00.000Z');
const T0 = new Date('2026-01-01T00:00:00.000Z');

type Auteur = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

/** Un faux client : la transaction rend l'auteur et la ligne demandés, et note chaque écriture. */
function faux(auteur: Auteur, inscrite = true, erreurDeCreation?: unknown) {
  const ecrits: string[] = [];
  const tx = {
    utilisateurConsole: {
      findUnique: vi.fn(async (q: unknown) => {
        expect(q).toEqual({
          where: { id: AUTEUR },
          select: { role: true, desactiveAt: true, valideAt: true },
        });
        return auteur;
      }),
    },
    sirenListeNoire: {
      create: vi.fn(async (q: unknown) => {
        if (erreurDeCreation !== undefined) throw erreurDeCreation;
        ecrits.push('create');
        return q;
      }),
      delete: vi.fn(async (q: unknown) => {
        ecrits.push('delete');
        return q;
      }),
    },
    sirenListeNoireTrace: {
      updateMany: vi.fn(async (q: unknown) => {
        ecrits.push('fermer');
        return q;
      }),
    },
    $queryRaw: vi.fn(async () => {
      ecrits.push('verrou');
      return inscrite ? [{ siren: SIREN }] : [];
    }),
  };
  const prisma = { $transaction: async (f: (t: typeof tx) => unknown) => f(tx) };
  return { prisma: prisma as unknown as PrismaClient, tx, ecrits };
}

const ADMIN_VALIDE = { role: 'admin', desactiveAt: null, valideAt: T0 };
const refus = async (p: Promise<unknown>) =>
  (await p.then(
    () => null,
    (e: unknown) => e
  )) as Error;

describe('REQ-DM-028 — l’erreur nommée et le droit', () => {
  it('REQ-DM-028 : le droit de la matrice est celui de l’action, et le refus porte son code', () => {
    expect(DROIT_DE_TENIR_LA_LISTE).toBe('action:tenir_liste_noire');
    const e = new ErreurListeNoire('role_refuse');
    expect(e.name).toBe('ErreurListeNoire');
    expect(e.code).toBe('role_refuse');
    expect(e.message).toBe('liste de la Société : role_refuse');
  });
});

describe('REQ-DM-028 — l’auteur est relu dans la transaction', () => {
  const AUTEURS_REFUSES: [string, Auteur][] = [
    ['un auteur inconnu', null],
    ['un administrateur désactivé', { role: 'admin', desactiveAt: T0, valideAt: T0 }],
    ['un administrateur non validé', { role: 'admin', desactiveAt: null, valideAt: null }],
    ['un qualifieur', { role: 'qualifieur', desactiveAt: null, valideAt: null }],
    ['un comptable', { role: 'comptable', desactiveAt: null, valideAt: null }],
    ['un lecteur', { role: 'lecteur', desactiveAt: null, valideAt: null }],
  ];

  for (const [qui, auteur] of AUTEURS_REFUSES) {
    it(`REQ-DM-028 : TÉMOIN — ${qui} est refusé à l’ajout comme au retrait, sans rien écrire`, async () => {
      const a = faux(auteur);
      const ea = await refus(
        ajouterALaListe(a.prisma, { siren: SIREN, motif: 'administration', auteurId: AUTEUR })
      );
      expect(ea).toBeInstanceOf(ErreurListeNoire);
      expect((ea as ErreurListeNoire).code).toBe('role_refuse');
      const r = faux(auteur);
      const er = await refus(
        retirerDeLaListe(r.prisma, { siren: SIREN, auteurId: AUTEUR, maintenant: MAINTENANT })
      );
      expect((er as ErreurListeNoire).code).toBe('role_refuse');
      expect(a.ecrits).toEqual([]);
      expect(r.ecrits).toEqual([]);
    });
  }
});

describe('REQ-DM-028 — l’ajout', () => {
  it('REQ-DM-028 : un administrateur validé inscrit le SIREN sous sa catégorie, avec son identité', async () => {
    const f = faux(ADMIN_VALIDE);
    await ajouterALaListe(f.prisma, {
      siren: SIREN,
      motif: 'financeur_public',
      auteurId: AUTEUR,
    });
    expect(f.tx.sirenListeNoire.create).toHaveBeenCalledTimes(1);
    expect(f.tx.sirenListeNoire.create).toHaveBeenCalledWith({
      data: { siren: SIREN, motif: 'financeur_public', ajouteParId: AUTEUR },
    });
    expect(f.ecrits).toEqual(['create']);
  });

  it('REQ-DM-028 : TÉMOIN — un SIREN déjà inscrit (violation d’unicité) est refusé sous son code nommé', async () => {
    const doublon = new Prisma.PrismaClientKnownRequestError('doublon', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const e = await refus(
      ajouterALaListe(faux(ADMIN_VALIDE, true, doublon).prisma, {
        siren: SIREN,
        motif: 'administration',
        auteurId: AUTEUR,
      })
    );
    expect(e).toBeInstanceOf(ErreurListeNoire);
    expect((e as ErreurListeNoire).code).toBe('deja_inscrit');
  });

  it('REQ-DM-028 : toute autre erreur de la base remonte telle quelle, jamais déguisée en doublon', async () => {
    const autre = new Prisma.PrismaClientKnownRequestError('autre', {
      code: 'P2003',
      clientVersion: '5.22.0',
    });
    const inconnue = new Error('base injoignable');
    for (const erreur of [autre, inconnue]) {
      const e = await refus(
        ajouterALaListe(faux(ADMIN_VALIDE, true, erreur).prisma, {
          siren: SIREN,
          motif: 'administration',
          auteurId: AUTEUR,
        })
      );
      expect(e).toBe(erreur);
    }
  });
});

describe('REQ-DM-028 — le retrait', () => {
  it('REQ-DM-028 : TÉMOIN — la ligne est verrouillée, la période fermée (auteur, date), PUIS la ligne supprimée', async () => {
    const f = faux(ADMIN_VALIDE);
    await retirerDeLaListe(f.prisma, { siren: SIREN, auteurId: AUTEUR, maintenant: MAINTENANT });
    expect(f.ecrits).toEqual(['verrou', 'fermer', 'delete']);
    expect(f.tx.sirenListeNoireTrace.updateMany).toHaveBeenCalledWith({
      where: { siren: SIREN, retireAt: null },
      data: { retireParId: AUTEUR, retireAt: MAINTENANT },
    });
    expect(f.tx.sirenListeNoire.delete).toHaveBeenCalledWith({ where: { siren: SIREN } });
  });

  it('REQ-DM-028 : TÉMOIN — un SIREN absent de la liste ne se retire pas : refus nommé, rien n’est fermé ni supprimé', async () => {
    const f = faux(ADMIN_VALIDE, false);
    const e = await refus(
      retirerDeLaListe(f.prisma, { siren: SIREN, auteurId: AUTEUR, maintenant: MAINTENANT })
    );
    expect(e).toBeInstanceOf(ErreurListeNoire);
    expect((e as ErreurListeNoire).code).toBe('absent');
    expect(f.ecrits).toEqual(['verrou']);
  });
});
