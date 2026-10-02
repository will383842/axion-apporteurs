// @req REQ-DM-036
// @req REQ-JUR-029
/**
 * INT-T56 en base RÉELLE — le déclencheur d'immutabilité de `evenements_recus` admet EXACTEMENT deux
 * réécritures de `charge`, et aucune autre (note de conception validée par A02 le 2026-10-02) :
 *   (i)  le traitant : passage à `traite`, hors du marqueur du fond ;
 *   (ii) le fond : statut INCHANGÉ et différent de `traite`, SOUS le marqueur
 *        `partners.minimisation_de_fond` posé par `set_config(…, true)` dans la même transaction.
 * Dans les deux cas : `OLD.charge ? 'reponsesJson'` et `NEW.charge = OLD.charge - 'reponsesJson'`
 * exactement ; `payload_hash` et les autres colonnes restent refusés.
 *
 * Ce fichier tourne en CI (Testcontainers) : le poste de l'auteur n'a pas de Docker. Le ROUGE se constate
 * sur le run de la branche, avant la migration.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, TypeEvenementRecu } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../src/lib/env';
import {
  chargeMinimisee,
  traiterCandidatureRecue,
  type Coordonnees,
} from '../../src/server/integrations/axionia/candidature-recue';
import { minimiserCandidatures } from '../../src/server/taches/minimiser-candidatures';
import { SEUILS } from '../../src/domain/seuils/ssot';
import { clesPii } from '../../src/server/securite/pii';
import fixture from '../fixtures/axionia/candidature-recue.json';
import { demarrerBase, type Base } from './harnais';

let base: Base;
beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);
afterAll(async () => {
  await base?.arreter();
});

const CHARGE = fixture.evenement.payload as Record<string, unknown> & { candidatureId: string };
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-int-t56-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'c'.repeat(64),
});
const COORDONNEES: Coordonnees = {
  nom: 'Jeanne Fictive',
  prenom: null,
  email: 'jeanne@exemple.invalid',
  telephone: null,
};
const MAINTENANT = new Date('2026-10-01T12:00:00.000Z');
const DELAI_JOURS = SEUILS.CANDIDATURE_NON_TRAITEE_MINIMISEE_APRES_JOURS.valeur;
const JOUR = 24 * 3600_000;

let sequence = 0n;
/** Inscrit une candidature reçue, avec sa propre candidatureId, au statut et à la date voulus. */
async function inscrire(statut: 'recu' | 'en_erreur', recuLe: Date = MAINTENANT) {
  sequence += 1n;
  const charge: Record<string, unknown> & { candidatureId: string } = {
    ...CHARGE,
    candidatureId: randomUUID(),
  };
  const corps = JSON.stringify(charge);
  const e = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType: TypeEvenementRecu.candidature_recue,
      schemaVersion: 2,
      sequence: 1000n + sequence,
      sujetRef: `submission:${charge.candidatureId}`,
      charge: charge as object,
      payloadHash: createHash('sha256').update(corps).digest('hex'),
      statut,
      receivedAt: recuLe,
      survenuAt: recuLe,
    },
    select: { id: true, payloadHash: true },
  });
  return { ...e, charge };
}

const lire = (id: string) =>
  base.prisma.evenementRecu.findUniqueOrThrow({
    where: { id },
    select: { charge: true, payloadHash: true, statut: true },
  });

/**
 * Une écriture SQL directe de la charge (et du passage à `traite`, avec sa date, que le CHECK
 * `evenements_recus_traite_si_et_seulement_si_date` exige), hors de tout code de l'application.
 */
type Client = Pick<typeof base.prisma, '$executeRaw'>;
const ecrireAvec = (c: Client, id: string, charge: unknown, traite = false) =>
  traite
    ? c.$executeRaw`UPDATE evenements_recus SET charge = ${JSON.stringify(charge)}::jsonb, statut = 'traite', processed_at = now() WHERE id = ${id}::uuid`
    : c.$executeRaw`UPDATE evenements_recus SET charge = ${JSON.stringify(charge)}::jsonb WHERE id = ${id}::uuid`;
const ecrire = (id: string, charge: unknown, traite = false) =>
  ecrireAvec(base.prisma, id, charge, traite);

/** La même écriture, SOUS le marqueur du fond, dans une transaction interactive. */
const ecrireSousMarqueur = (id: string, charge: unknown, traite = false) =>
  base.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('partners.minimisation_de_fond', 'oui', true)`;
    return ecrireAvec(tx, id, charge, traite);
  });

const CONTRAINTE = /evenements_recus_candidature_traitee_minimisee/;

const REFUS = /evenements_recus_reception_immuable/;

describe('REQ-DM-036 — (i) le traitant : la charge minimisée au passage à traite', () => {
  it('REQ-DM-036 REQ-JUR-029 : une candidature traitée garde une charge SANS reponsesJson et le MÊME payload_hash', async () => {
    const e = await inscrire('recu');
    await traiterCandidatureRecue(
      base.prisma,
      { id: e.id, charge: e.charge },
      {
        tirer: async () => COORDONNEES,
        cles: CLES,
        maintenant: () => MAINTENANT,
        aleatoire: (n) => new Uint8Array(n).fill(3),
      }
    );
    const lu = await lire(e.id);
    expect(lu.statut).toBe('traite');
    expect(lu.charge).toEqual(chargeMinimisee(e.charge));
    expect(lu.charge).not.toHaveProperty('reponsesJson');
    expect(lu.payloadHash).toBe(e.payloadHash);
  });

  it('REQ-DM-036 : TÉMOIN — une seconde réécriture est refusée par le déclencheur', async () => {
    const e = await inscrire('recu');
    await ecrire(e.id, chargeMinimisee(e.charge), true);
    const encorePlusPetite: Record<string, unknown> = { ...e.charge };
    delete encorePlusPetite.reponsesJson;
    delete encorePlusPetite.candidatureId;
    await expect(ecrire(e.id, encorePlusPetite)).rejects.toThrow(REFUS);
  });

  it('REQ-DM-036 : TÉMOIN — retirer reponsesJson ET changer une autre clé est refusé', async () => {
    const e = await inscrire('recu');
    const fausse = { ...chargeMinimisee(e.charge), candidatureId: randomUUID() };
    await expect(ecrire(e.id, fausse, true)).rejects.toThrow(REFUS);
  });

  it('REQ-DM-036 : TÉMOIN — une réécriture de la charge hors des deux cas est refusée', async () => {
    const e = await inscrire('recu');
    await expect(ecrire(e.id, { ...e.charge, ajout: 1 })).rejects.toThrow(REFUS);
    await expect(ecrire(e.id, chargeMinimisee(e.charge))).rejects.toThrow(REFUS);
  });

  it('REQ-DM-036 : un échec de la transaction laisse la charge reçue INTACTE', async () => {
    const e = await inscrire('recu');
    await expect(
      base.prisma.$transaction(async (tx) => {
        await tx.evenementRecu.update({
          where: { id: e.id },
          data: {
            statut: 'traite',
            processedAt: MAINTENANT,
            charge: chargeMinimisee(e.charge) as Prisma.InputJsonValue,
          },
        });
        throw new Error('échec simulé après l’écriture');
      })
    ).rejects.toThrow(/échec simulé/);
    const lu = await lire(e.id);
    expect(lu.charge).toEqual(e.charge);
    expect(lu.statut).toBe('recu');
  });
});

describe('REQ-DM-036 — la base TIENT l’invariant, elle ne fait pas que le permettre', () => {
  it('REQ-DM-036 REQ-JUR-029 : TÉMOIN — un passage à traite SANS réécriture de la charge est refusé par la base', async () => {
    const e = await inscrire('recu');
    await expect(
      base.prisma
        .$executeRaw`UPDATE evenements_recus SET statut = 'traite', processed_at = now() WHERE id = ${e.id}::uuid`
    ).rejects.toThrow(CONTRAINTE);
    expect((await lire(e.id)).statut).toBe('recu');
  });

  it('REQ-DM-036 : TÉMOIN — une ligne héritée fautive fait ÉCHOUER l’ajout de la contrainte (transaction annulée)', async () => {
    const ANNULEE = 'transaction annulée par le témoin';
    await expect(
      base.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`ALTER TABLE "evenements_recus" DROP CONSTRAINT "evenements_recus_candidature_traitee_minimisee"`;
        // L'INSERT n'est pas gardé par le déclencheur (UPDATE/DELETE seulement) : la ligne héritée.
        sequence += 1n;
        const charge = { ...CHARGE, candidatureId: randomUUID() };
        await tx.$executeRaw`INSERT INTO evenements_recus (id, source, event_id, event_type, schema_version, sequence, charge, payload_hash, statut, received_at, survenu_at, processed_at)
          VALUES (${randomUUID()}::uuid, 'axionia', ${randomUUID()}, 'candidature_recue', 2, ${1000n + sequence}, ${JSON.stringify(charge)}::jsonb, ${'d'.repeat(64)}, 'traite', now(), now(), now())`;
        await expect(
          tx.$executeRaw`ALTER TABLE "evenements_recus" ADD CONSTRAINT "evenements_recus_candidature_traitee_minimisee" CHECK (NOT ("event_type" = 'candidature_recue' AND "statut" = 'traite' AND "charge" ? 'reponsesJson'))`
        ).rejects.toThrow(CONTRAINTE);
        throw new Error(ANNULEE);
      })
    ).rejects.toThrow(ANNULEE);
  });
});

describe('REQ-DM-036 — (ii) le fond : les candidatures non traitées au-delà du délai de la SSOT', () => {
  it('REQ-DM-036 REQ-JUR-029 : une candidature en_erreur au-delà du délai perd reponsesJson, statut et payload_hash inchangés, par le VRAI déclencheur', async () => {
    const vieille = await inscrire(
      'en_erreur',
      new Date(MAINTENANT.getTime() - (DELAI_JOURS + 1) * JOUR)
    );
    const recente = await inscrire(
      'en_erreur',
      new Date(MAINTENANT.getTime() - (DELAI_JOURS - 1) * JOUR)
    );
    await minimiserCandidatures(base.prisma, MAINTENANT);
    const v = await lire(vieille.id);
    expect(v.charge).toEqual(chargeMinimisee(vieille.charge));
    expect(v.statut).toBe('en_erreur');
    expect(v.payloadHash).toBe(vieille.payloadHash);
    expect((await lire(recente.id)).charge).toEqual(recente.charge);
  });

  it('REQ-DM-036 : TÉMOIN — sous le marqueur du fond, un passage en_erreur → traite est refusé', async () => {
    const e = await inscrire('en_erreur');
    await expect(ecrireSousMarqueur(e.id, chargeMinimisee(e.charge), true)).rejects.toThrow(REFUS);
  });

  it('REQ-DM-036 : TÉMOIN — la réécriture du fond SANS le marqueur est refusée', async () => {
    const e = await inscrire('en_erreur');
    await expect(ecrire(e.id, chargeMinimisee(e.charge))).rejects.toThrow(REFUS);
    await expect(ecrireSousMarqueur(e.id, chargeMinimisee(e.charge))).resolves.toBe(1);
  });

  it('REQ-DM-036 : le marqueur ne fuit pas : la transaction suivante, sans lui, voit (ii) refusé', async () => {
    const a = await inscrire('en_erreur');
    const b = await inscrire('en_erreur');
    await ecrireSousMarqueur(a.id, chargeMinimisee(a.charge));
    await expect(
      base.prisma.$transaction(
        async (tx) =>
          tx.$executeRaw`UPDATE evenements_recus SET charge = ${JSON.stringify(chargeMinimisee(b.charge))}::jsonb WHERE id = ${b.id}::uuid`
      )
    ).rejects.toThrow(REFUS);
  });
});
