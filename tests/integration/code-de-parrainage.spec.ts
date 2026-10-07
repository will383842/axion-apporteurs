// @req REQ-SEC-037
/**
 * SEC-21, en base RÉELLE — la résolution silencieuse du code capturé, au traitement de
 * `candidature.recue`, par la vraie table des apporteurs (index unique du code).
 *
 * TÉMOIN : une candidature portant un code INCONNU, ou celui d'un apporteur qui n'est pas actif, est
 * enregistrée EXACTEMENT comme une candidature sans code (`parrainCodeCapture` nul) ; le code d'un
 * parrain SIGNÉ est conservé. La route d'axionia est simulée au niveau du port `tirer`. Les mêmes
 * règles, lecteur simulé : `tests/unit/securite/code-de-parrainage.spec.ts`.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TypeEvenementRecu } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  traiterCandidatureRecue,
  type Coordonnees,
} from '../../src/server/integrations/axionia/candidature-recue';
import { genererCodeParrainage } from '../../src/domain/parrainage/code';
import { sourceAleatoireSysteme } from '../../src/domain/apporteur/identifiants';
import { clesPii } from '../../src/server/securite/pii';
import fixture from '../fixtures/axionia/candidature-recue.json';
import { demarrerBase, type Base } from './harnais';
import { poserUnGelEnBase } from './gel-en-base';

let base: Base;
beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);
afterAll(async () => {
  await base?.arreter();
});

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-21-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});
const MAINTENANT = new Date('2026-10-02T09:00:00.000Z');

let sequence = 0n;

/** Une candidature NEUVE (identifiant et courriel uniques), portant `code` ; rend l'apporteur créé. */
async function candidature(code: string | null) {
  const candidatureId = randomUUID();
  const charge = { ...fixture.evenement.payload, candidatureId, parrainCodeCapture: code };
  sequence += 1n;
  const corps = JSON.stringify(charge);
  const recu = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.candidature_recue,
      schemaVersion: 2,
      sequence,
      sujetRef: `submission:${candidatureId}`,
      charge: charge as object,
      payloadHash: createHash('sha256').update(corps).digest('hex'),
      statut: 'recu',
      receivedAt: MAINTENANT,
      survenuAt: MAINTENANT,
    },
    select: { id: true, charge: true },
  });
  const coordonnees: Coordonnees = {
    nom: 'Camille Durand',
    prenom: null,
    email: `${candidatureId}@example.test`,
    telephone: null,
  };
  expect(
    await traiterCandidatureRecue(base.prisma, recu, {
      tirer: async () => coordonnees,
      cles: CLES,
      maintenant: () => MAINTENANT,
      aleatoire: sourceAleatoireSysteme,
    })
  ).toBe('cree');
  return base.prisma.apporteur.findUniqueOrThrow({
    where: { candidatureId },
    select: { id: true, codeParrainage: true, parrainCodeCapture: true },
  });
}

/** Un parrain au statut voulu : une candidature traitée, puis passée à ce statut. */
async function parrain(statut: 'signe' | 'suspendu' | 'resilie' | 'candidat') {
  const p = await candidature(null);
  // SEC-15 : `suspendu` ne s'écrit plus seul ; c'est une VRAIE pose de gel (CHECK `apporteurs_suspendu_si_gele`).
  if (statut === 'suspendu') {
    await poserUnGelEnBase(base.prisma, p.id, MAINTENANT);
    return p.codeParrainage;
  }
  // Un apporteur résilié porte son motif : la base l'exige (contrainte `apporteurs_motif_si_resilie`).
  await base.prisma.apporteur.update({
    where: { id: p.id },
    data: statut === 'resilie' ? { statut, resiliationMotif: 'ordinaire_apporteur' } : { statut },
  });
  return p.codeParrainage;
}

describe('REQ-SEC-037 — un code inconnu ou inactif ne rattache rien, en base réelle', () => {
  it('REQ-SEC-037 : TÉMOIN — un code INCONNU est enregistré exactement comme sans code', async () => {
    let inconnu = genererCodeParrainage(sourceAleatoireSysteme);
    while ((await base.prisma.apporteur.count({ where: { codeParrainage: inconnu } })) > 0)
      inconnu = genererCodeParrainage(sourceAleatoireSysteme);
    const sans = await candidature(null);
    const avec = await candidature(inconnu);
    expect(avec.parrainCodeCapture).toBeNull();
    expect(avec.parrainCodeCapture).toBe(sans.parrainCodeCapture);
  });

  it.each(['suspendu', 'resilie', 'candidat'] as const)(
    'REQ-SEC-037 : le code d’un apporteur « %s » ne rattache rien',
    async (statut) => {
      const code = await parrain(statut);
      expect((await candidature(code)).parrainCodeCapture).toBeNull();
    }
  );

  it('REQ-SEC-037 : un code mal formé ne rattache rien', async () => {
    expect((await candidature('AX12345O')).parrainCodeCapture).toBeNull();
  });

  it('REQ-SEC-037 : CONTRE-TÉMOIN — le code d’un parrain SIGNÉ est conservé, même saisi en minuscules', async () => {
    const code = await parrain('signe');
    expect((await candidature(code.toLowerCase())).parrainCodeCapture).toBe(code);
  });
});
