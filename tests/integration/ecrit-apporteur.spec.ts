// @req REQ-DM-043
/**
 * UX-P1-62 — l'écrit de l'apporteur, contre la base RÉELLE et sous le rôle d'exécution `partners_app`
 * (forme d'A02, #319 6038168915) :
 *   — la date de réception est posée par la BASE : une valeur fournie est remplacée ;
 *   — un écrit ne se réécrit pas, ne se supprime pas, ne se tronque pas ; seule la purge du texte, une
 *     fois et avec sa date, est admise ; une purge partielle est refusée ;
 *   — l'écrivain passe par la couche de cloisonnement : l'écrit est celui de la session.
 * Chaque ligne naît dans l'état que son témoin éprouve (condition d de la sécurité).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { forApporteur } from '../../src/server/acces/for-apporteur';
import { recevoirUnEcrit } from '../../src/server/ecrit/recevoir';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';

let base: Base;
let app: PrismaClient;

const MAINTENANT = new Date('2026-10-08T09:00:00.000Z');
const hex = (octets: number) => randomBytes(octets).toString('hex');
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-ux-p1-62-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'b'.repeat(64),
});

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

async function unApporteur(): Promise<string> {
  return (
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
}

/** Un écrit inséré par SQL brut, sous `partners_app`, avec une date FOURNIE (que la base remplace). */
async function unEcritBrut(apporteurId: string, recuAt = new Date('2020-01-01T00:00:00.000Z')) {
  const id = randomUUID();
  await app.$executeRawUnsafe(
    `INSERT INTO ecrits_apporteur (id, apporteur_id, recu_at, texte_chiffre)
     VALUES ($1::uuid, $2::uuid, $3, '\\x01'::bytea)`,
    id,
    apporteurId,
    recuAt
  );
  return id;
}

describe('REQ-DM-043 — l’écrit : la date de la base, en ajout seul', () => {
  it('REQ-DM-043 : TÉMOIN — une date de réception FOURNIE est remplacée par l’heure de la base', async () => {
    const apporteurId = await unApporteur();
    const avant = new Date();
    const id = await unEcritBrut(apporteurId);
    const e = await base.prisma.ecritApporteur.findUniqueOrThrow({ where: { id } });
    expect(e.recuAt.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 5_000);
    expect(e.recuAt.getFullYear()).not.toBe(2020);
  });

  it('REQ-DM-043 : TÉMOIN — un écrit ne se réécrit pas : ni son texte, ni son apporteur, ni sa date', async () => {
    const apporteurId = await unApporteur();
    const autre = await unApporteur();
    const id = await unEcritBrut(apporteurId);
    for (const [sql, valeur] of [
      [`UPDATE ecrits_apporteur SET texte_chiffre = '\\x02'::bytea WHERE id = $1::uuid`, null],
      [`UPDATE ecrits_apporteur SET apporteur_id = $2::uuid WHERE id = $1::uuid`, autre],
      [`UPDATE ecrits_apporteur SET recu_at = $2 WHERE id = $1::uuid`, MAINTENANT],
    ] as const) {
      await expect(
        valeur === null ? app.$executeRawUnsafe(sql, id) : app.$executeRawUnsafe(sql, id, valeur)
      ).rejects.toThrow();
    }
  });

  it('REQ-DM-043 : TÉMOIN — DELETE et TRUNCATE sont refusés', async () => {
    const id = await unEcritBrut(await unApporteur());
    await expect(
      app.$executeRawUnsafe(`DELETE FROM ecrits_apporteur WHERE id = $1::uuid`, id)
    ).rejects.toThrow();
    await expect(base.prisma.$executeRawUnsafe(`TRUNCATE ecrits_apporteur`)).rejects.toThrow();
  });

  it('REQ-DM-043 : TÉMOIN — la purge passe UNE fois, avec sa date ; une purge PARTIELLE est refusée', async () => {
    const partielle = await unEcritBrut(await unApporteur());
    await expect(
      app.$executeRawUnsafe(
        `UPDATE ecrits_apporteur SET texte_chiffre = NULL WHERE id = $1::uuid`,
        partielle
      )
    ).rejects.toThrow(/ecrits_apporteur_texte_ou_purge/);
    const id = await unEcritBrut(await unApporteur());
    await app.$executeRawUnsafe(
      `UPDATE ecrits_apporteur SET texte_chiffre = NULL, texte_purge_at = $2 WHERE id = $1::uuid`,
      id,
      MAINTENANT
    );
    const e = await base.prisma.ecritApporteur.findUniqueOrThrow({ where: { id } });
    expect(e.texteChiffre).toBeNull();
    expect(e.textePurgeAt).toEqual(MAINTENANT);
  });

  it('REQ-DM-043 : TÉMOIN — l’écrivain, par la couche, écrit au nom de l’apporteur de la SESSION et rend la date de la base', async () => {
    const apporteurId = await unApporteur();
    const avant = new Date();
    const { ecritId, recuAt } = await recevoirUnEcrit(
      forApporteur(app, apporteurId),
      { texte: 'Je conteste la suspension.' },
      CLES
    );
    const e = await base.prisma.ecritApporteur.findUniqueOrThrow({ where: { id: ecritId } });
    expect(e.apporteurId).toBe(apporteurId);
    expect(e.recuAt).toEqual(recuAt);
    expect(recuAt.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 5_000);
  });
});
