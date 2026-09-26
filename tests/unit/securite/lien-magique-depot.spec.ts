// @req REQ-SEC-001
/**
 * `lien-magique-depot.spec.ts` — l'adaptateur Prisma des ports du lien magique (SEC-03), jugé sur
 * un FAUX CLIENT au niveau de l'API Prisma : il enregistre les arguments de chaque appel et rend
 * ce qu'on lui dit. Aucune base.
 *
 * CE QU'IL FIXE (survivants de la relecture de mutation de la PR 134) :
 *   — l'annulation porte sur les liens de CET apporteur, non consommés ET non annulés :
 *     `where = { apporteurId, consommeAt: null, annuleAt: null }` — sans `apporteurId`, une demande
 *     annulerait les liens de tous les apporteurs ; sans `annuleAt: null`, elle réécrirait une
 *     ligne annulée, que la base refuse (`liens_magiques_usage_unique`) ;
 *   — la condition de consommation passe TELLE QUELLE à `updateMany`, et le nombre de lignes écrites
 *     est rendu tel quel ;
 *   — la lecture du compte passe par l'empreinte de courriel, et l'adresse est déchiffrée sous la
 *     ligne qui la porte.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, colonnesPii } from '../../../src/server/securite/pii';
import { conditionDeConsommation } from '../../../src/server/auth/lien-magique';
import {
  MODELE_APPORTEUR,
  ecrituresDeLien,
  lectureDuCompte,
  transactionDeConsommation,
} from '../../../src/server/auth/lien-magique-depot';

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec03-depot-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);

type Appel = { delegue: string; methode: string; args: unknown };

/** Un faux client : chaque délégué enregistre ses appels et rend la réponse prévue. */
function fauxClient(reponses: Record<string, unknown> = {}) {
  const appels: Appel[] = [];
  const delegue = (nom: string) =>
    new Proxy(
      {},
      {
        get: (_c, methode: string) => async (args: unknown) => {
          appels.push({ delegue: nom, methode, args });
          return reponses[`${nom}.${methode}`];
        },
      }
    );
  const client = {
    lienMagique: delegue('lienMagique'),
    sessionEspace: delegue('sessionEspace'),
    apporteur: delegue('apporteur'),
    $transaction: async (travail: (tx: unknown) => Promise<unknown>) => {
      appels.push({ delegue: '$transaction', methode: 'ouvrir', args: null });
      return travail(client);
    },
  };
  return { prisma: client as unknown as PrismaClient, appels };
}

const T = new Date(Date.UTC(2026, 8, 26, 8, 0, 0));

describe('REQ-SEC-001 — les écritures de l’émission', () => {
  it('REQ-SEC-001 : l’annulation ne touche que les liens ACTIFS de CET apporteur', async () => {
    const { prisma, appels } = fauxClient();
    await ecrituresDeLien(prisma).annulerLiensActifs('apporteur-a', T);
    expect(appels).toEqual([
      {
        delegue: 'lienMagique',
        methode: 'updateMany',
        args: {
          where: { apporteurId: 'apporteur-a', consommeAt: null, annuleAt: null },
          data: { annuleAt: T },
        },
      },
    ]);
  });

  it('REQ-SEC-001 : l’insertion pose la ligne reçue, sans rien y ajouter', async () => {
    const { prisma, appels } = fauxClient();
    const lien = {
      apporteurId: 'apporteur-a',
      tokenHash: 'a'.repeat(64),
      kid: '0123abcd',
      creeAt: T,
      expireAt: new Date(T.getTime() + 1),
    };
    await ecrituresDeLien(prisma).insererLien(lien);
    expect(appels).toEqual([{ delegue: 'lienMagique', methode: 'create', args: { data: lien } }]);
  });
});

describe('REQ-SEC-001 — la consommation dans une transaction', () => {
  it('REQ-SEC-001 : la condition passe telle quelle, et le nombre écrit est rendu tel quel', async () => {
    for (const count of [0, 1, 2]) {
      const { prisma, appels } = fauxClient({ 'lienMagique.updateMany': { count } });
      const condition = conditionDeConsommation('b'.repeat(64), T);
      const rendu = await transactionDeConsommation(prisma)((tx) =>
        tx.consommer(condition, { consommeAt: T })
      );
      expect(rendu).toBe(count);
      expect(appels).toEqual([
        { delegue: '$transaction', methode: 'ouvrir', args: null },
        {
          delegue: 'lienMagique',
          methode: 'updateMany',
          args: { where: condition, data: { consommeAt: T } },
        },
      ]);
    }
  });

  it('REQ-SEC-001 : lecture du lien par empreinte, statut, et session enregistrée telle quelle', async () => {
    const { prisma, appels } = fauxClient({
      'lienMagique.findUnique': { id: 'l', apporteurId: 'a', kid: 'k' },
      'apporteur.findUnique': { statut: 'signe' },
    });
    const session = {
      apporteurId: 'a',
      lienMagiqueId: 'l',
      tokenHash: 'c'.repeat(64),
      kid: '0123abcd',
      ipHash: null,
      creeAt: T,
      expireAt: new Date(T.getTime() + 1),
    };
    const lus = await transactionDeConsommation(prisma)(async (tx) => [
      await tx.lireLien('d'.repeat(64)),
      await tx.statutApporteur('a'),
      await tx.ouvrirSession(session),
    ]);
    expect(lus).toEqual([{ id: 'l', apporteurId: 'a', kid: 'k' }, 'signe', undefined]);
    expect(appels.slice(1)).toEqual([
      {
        delegue: 'lienMagique',
        methode: 'findUnique',
        args: {
          where: { tokenHash: 'd'.repeat(64) },
          select: { id: true, apporteurId: true, kid: true },
        },
      },
      {
        delegue: 'apporteur',
        methode: 'findUnique',
        args: { where: { id: 'a' }, select: { statut: true } },
      },
      { delegue: 'sessionEspace', methode: 'create', args: { data: session } },
    ]);
  });

  it('REQ-SEC-001 : un apporteur absent rend un statut nul', async () => {
    const { prisma } = fauxClient({ 'apporteur.findUnique': null });
    expect(await transactionDeConsommation(prisma)((tx) => tx.statutApporteur('x'))).toBeNull();
  });
});

describe('REQ-SEC-001 — la lecture du compte, par empreinte et bloc stocké', () => {
  it('REQ-SEC-001 : le compte se cherche par l’empreinte du courriel, jamais par un clair', async () => {
    const { prisma, appels } = fauxClient({ 'apporteur.findUnique': { id: 'a', statut: 'signe' } });
    expect(await lectureDuCompte(prisma, CLES).trouverApporteur('e'.repeat(64))).toEqual({
      id: 'a',
      statut: 'signe',
    });
    expect(appels).toEqual([
      {
        delegue: 'apporteur',
        methode: 'findUnique',
        args: { where: { emailHash: 'e'.repeat(64) }, select: { id: true, statut: true } },
      },
    ]);
  });

  it('REQ-SEC-001 : l’adresse est le bloc STOCKÉ, déchiffré sous sa ligne ; un bloc d’une autre ligne ne se lit pas', async () => {
    const id = 'apporteur-de-test';
    const { emailChiffre } = colonnesPii(
      { modele: MODELE_APPORTEUR, id },
      { email: 'kim@example.org' },
      CLES
    );
    const bon = fauxClient({ 'apporteur.findUnique': { emailChiffre } });
    expect(await lectureDuCompte(bon.prisma, CLES).adresseStockee(id)).toBe('kim@example.org');
    expect(bon.appels[0]?.args).toEqual({ where: { id }, select: { emailChiffre: true } });
    // Face 2 : le même bloc présenté pour une autre ligne échoue.
    await expect(lectureDuCompte(bon.prisma, CLES).adresseStockee('autre-ligne')).rejects.toThrow();
    const vide = fauxClient({ 'apporteur.findUnique': { emailChiffre: null } });
    await expect(lectureDuCompte(vide.prisma, CLES).adresseStockee(id)).rejects.toThrow(
      'adresse_absente'
    );
  });
});
