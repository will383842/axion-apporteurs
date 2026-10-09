// @req REQ-UX-027
/**
 * SEC-69 — le PREMIER regard d'un RIB (sa vérification hors bande) a son événement chaîné propre.
 *
 * Avant : `rib_verifie_par_id` et `rib_verifie_at` en écriture unique, sous la garde de la base
 * `pieces_kyc_rib_quatre_yeux` ; seule cette garde protégeait le premier regard, et une réécriture
 * n'aurait laissé aucune trace au journal chaîné. Après : la vérification écrit `piece_kyc_rib_verifie`,
 * dans la même transaction que la ligne, sur l'agrégat `piece_kyc`.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';
import { ErreurRibQuatreYeux, verifierUnRib } from '../../../src/server/conformite/rib';

const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' } as const;
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000b1';
const PIECE = '0190f0f0-0000-7000-8000-0000000000c1';
const MAINTENANT = new Date('2026-10-07T10:00:00.000Z');
const CONSOLE = { par: 'utilisateur_console', id: ADMIN.id } as const;

const charge = CHARGES_PAR_TYPE.piece_kyc_rib_verifie;

/** Un faux client : la pièce à vérifier, aucun ouvreur du dossier ; chaque écriture est notée. */
function fauxClient(o: { compte?: number }) {
  const ordre: string[] = [];
  const tx = {
    pieceKyc: {
      findUnique: async () => ({
        id: PIECE,
        apporteurId: APPORTEUR,
        type: 'rib',
        statut: 'a_verifier',
        ribVerifieParId: null,
        ribVerifieAt: null,
        ribConfirmeAt: null,
        remplaceeAt: null,
      }),
      updateMany: async () => {
        ordre.push('ligne');
        return { count: o.compte ?? 1 };
      },
    },
    evenement: { findMany: async () => [] },
  };
  const client = {
    $transaction: async (f: (t: unknown) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, ordre };
}

describe('REQ-UX-027 — SEC-69 : la charge du premier regard', () => {
  it('REQ-UX-027 : la charge passe avec l’acteur de la console, et rien d’autre', () => {
    expect(charge.safeParse({ type: 'rib', acteur: CONSOLE }).success).toBe(true);
    expect(charge.safeParse({ type: 'rib', acteur: CONSOLE, iban: 'x' }).success).toBe(false);
    expect(charge.safeParse({ type: 'rib', acteur: CONSOLE, empreinte: 'x' }).success).toBe(false);
  });

  it('REQ-UX-027 : la charge refuse le système, l’apporteur, un autre type de pièce et l’absence d’acteur', () => {
    expect(charge.safeParse({ type: 'rib', acteur: { par: 'systeme' } }).success).toBe(false);
    expect(
      charge.safeParse({ type: 'rib', acteur: { par: 'apporteur', id: ADMIN.id } }).success
    ).toBe(false);
    expect(charge.safeParse({ type: 'piece_identite', acteur: CONSOLE }).success).toBe(false);
    expect(charge.safeParse({ type: 'rib' }).success).toBe(false);
  });
});

describe('REQ-UX-027 — SEC-69 : le premier regard écrit son événement chaîné', () => {
  it('REQ-UX-027 : TÉMOIN — la vérification écrit `piece_kyc_rib_verifie` sur la pièce, APRÈS la ligne, sans IBAN', async () => {
    const f = fauxClient({});
    const evenements: unknown[] = [];
    await verifierUnRib(f.client, {
      acteur: ADMIN,
      pieceId: PIECE,
      maintenant: MAINTENANT,
      ecrireUnFait: async (_tx, e) => {
        f.ordre.push('evenement');
        evenements.push(e);
      },
    });
    expect(f.ordre).toEqual(['ligne', 'evenement']);
    expect(evenements).toEqual([
      {
        type: 'piece_kyc_rib_verifie',
        agregat: 'piece_kyc',
        agregatId: PIECE,
        survenuAt: MAINTENANT,
        charge: { type: 'rib', acteur: CONSOLE },
      },
    ]);
    expect(JSON.stringify(evenements)).not.toMatch(/iban|bic|hash|empreinte/i);
  });

  it('REQ-UX-027 : une écriture qui ne touche rien (concurrence) n’écrit AUCUN événement', async () => {
    const f = fauxClient({ compte: 0 });
    const evenements: unknown[] = [];
    await expect(
      verifierUnRib(f.client, {
        acteur: ADMIN,
        pieceId: PIECE,
        maintenant: MAINTENANT,
        ecrireUnFait: async (_tx, e) => void evenements.push(e),
      })
    ).rejects.toBeInstanceOf(ErreurRibQuatreYeux);
    expect(evenements).toEqual([]);
  });
});
