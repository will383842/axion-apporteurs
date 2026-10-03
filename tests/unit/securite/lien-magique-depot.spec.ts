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
import { ESSAIS_DU_CODE_MAX, conditionDeConsommation } from '../../../src/server/auth/lien-magique';
import {
  MODELE_APPORTEUR,
  ecrituresDeLien,
  lectureDuCompte,
  transactionDeConsommation,
  transactionDuCode,
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
    // SEC-54 : l'essai de code est UNE instruction brute ; le faux client garde son texte et ses valeurs.
    $queryRaw: async (morceaux: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({
        delegue: '$queryRaw',
        methode: 'sql',
        args: { sql: morceaux.join('?').replace(/\s+/g, ' ').trim(), valeurs },
      });
      return reponses['$queryRaw'];
    },
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
      codeHash: 'c'.repeat(64),
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
    // Une ligne ABSENTE, et non seulement vide, rend la même erreur nommée, jamais une erreur de type.
    const absente = fauxClient({ 'apporteur.findUnique': null });
    await expect(lectureDuCompte(absente.prisma, CLES).adresseStockee(id)).rejects.toThrow(
      'adresse_absente : aucun courriel stocké'
    );
  });
});

/**
 * SEC-54 — l'adaptateur de la vérification du code, sur le même faux client (survivants de la passe
 * de mutation de la PR 578 : chaque condition `where` est fixée en entier, une condition retirée
 * élargirait l'écriture à d'autres liens).
 */
describe('REQ-SEC-003 — le code, dans une transaction', () => {
  const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

  it('REQ-SEC-003 : un lien déjà consommé se lit sous la clé courante, pour un lien de l’espace, et vaut seulement pour UNE ligne', async () => {
    for (const [n, attendu] of [
      [0, false],
      [1, true],
      [2, false],
    ] as const) {
      const { prisma, appels } = fauxClient({ 'lienMagique.count': n });
      const rendu = await transactionDeConsommation(prisma)((tx) =>
        tx.dejaConsomme!('d'.repeat(64), 'kid-a')
      );
      expect(rendu).toBe(attendu);
      expect(appels.slice(1)).toEqual([
        {
          delegue: 'lienMagique',
          methode: 'count',
          args: {
            where: {
              tokenHash: 'd'.repeat(64),
              kid: 'kid-a',
              apporteurId: { not: null },
              consommeAt: { not: null },
            },
          },
        },
      ]);
    }
  });

  it('REQ-SEC-003 : le lien actif d’une adresse est le plus récent, non consommé, non annulé, non expiré, et porteur d’un code', async () => {
    const { prisma, appels } = fauxClient({
      'lienMagique.findFirst': { id: ID, apporteurId: 'a', kid: 'k' },
    });
    const lu = await transactionDuCode(prisma)((tx) => tx.lienActifDe('e'.repeat(64), T));
    expect(lu).toEqual({ id: ID, apporteurId: 'a', kid: 'k' });
    expect(appels).toEqual([
      { delegue: '$transaction', methode: 'ouvrir', args: null },
      {
        delegue: 'lienMagique',
        methode: 'findFirst',
        args: {
          where: {
            apporteur: { emailHash: 'e'.repeat(64) },
            consommeAt: null,
            annuleAt: null,
            expireAt: { gt: T },
            codeHash: { not: null },
          },
          orderBy: [{ creeAt: 'desc' }, { id: 'desc' }],
          select: { id: true, apporteurId: true, kid: true },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : sans lien, ou pour un lien sans apporteur, aucun lien actif n’est rendu', async () => {
    for (const reponse of [null, { id: ID, apporteurId: null, kid: 'k' }]) {
      const { prisma } = fauxClient({ 'lienMagique.findFirst': reponse });
      expect(await transactionDuCode(prisma)((tx) => tx.lienActifDe('e'.repeat(64), T))).toBeNull();
    }
  });

  it('REQ-SEC-003 : l’essai est compté par UNE instruction conditionnelle, bornée à cinq essais, et son retour est lu tel quel', async () => {
    const { prisma, appels } = fauxClient({
      $queryRaw: [{ code_hash: 'c'.repeat(64), tentatives_code: 3 }],
    });
    const essai = await transactionDuCode(prisma)((tx) => tx.compterEssai(ID, T));
    expect(essai).toEqual({ codeHash: 'c'.repeat(64), tentatives: 3 });
    expect(appels.slice(1)).toEqual([
      {
        delegue: '$queryRaw',
        methode: 'sql',
        args: {
          sql: 'UPDATE "liens_magiques" SET "tentatives_code" = "tentatives_code" + 1 WHERE "id" = ?::uuid AND "tentatives_code" < ? AND "consomme_at" IS NULL AND "annule_at" IS NULL AND "expire_at" > ? RETURNING "code_hash", "tentatives_code"',
          valeurs: [ID, ESSAIS_DU_CODE_MAX, T],
        },
      },
    ]);
    // Aucune ligne rendue (lien épuisé, consommé, annulé ou expiré) : aucun essai.
    const vide = fauxClient({ $queryRaw: [] });
    expect(await transactionDuCode(vide.prisma)((tx) => tx.compterEssai(ID, T))).toBeNull();
  });

  it('REQ-SEC-003 : l’annulation et la consommation par identifiant ne touchent que CE lien, encore actif', async () => {
    const { prisma, appels } = fauxClient({ 'lienMagique.updateMany': { count: 1 } });
    const rendu = await transactionDuCode(prisma)(async (tx) => {
      await tx.annulerLien(ID, T);
      return tx.consommerParId(ID, T);
    });
    expect(rendu).toBe(1);
    expect(appels.slice(1)).toEqual([
      {
        delegue: 'lienMagique',
        methode: 'updateMany',
        args: { where: { id: ID, consommeAt: null, annuleAt: null }, data: { annuleAt: T } },
      },
      {
        delegue: 'lienMagique',
        methode: 'updateMany',
        args: {
          where: { id: ID, consommeAt: null, annuleAt: null, expireAt: { gt: T } },
          data: { consommeAt: T },
        },
      },
    ]);
  });

  it('REQ-SEC-003 : le statut et la session de la vérification sont ceux de la consommation', async () => {
    const { prisma, appels } = fauxClient({ 'apporteur.findUnique': { statut: 'signe' } });
    const session = {
      apporteurId: 'a',
      lienMagiqueId: ID,
      tokenHash: 'c'.repeat(64),
      kid: '0123abcd',
      ipHash: null,
      creeAt: T,
      expireAt: new Date(T.getTime() + 1),
    };
    const lus = await transactionDuCode(prisma)(async (tx) => [
      await tx.statutApporteur('a'),
      await tx.ouvrirSession(session),
    ]);
    expect(lus).toEqual(['signe', undefined]);
    expect(appels.slice(1)).toEqual([
      {
        delegue: 'apporteur',
        methode: 'findUnique',
        args: { where: { id: 'a' }, select: { statut: true } },
      },
      { delegue: 'sessionEspace', methode: 'create', args: { data: session } },
    ]);
  });
});
