// @req REQ-DM-036
// @req REQ-ARG-003
/**
 * INT-T43, en base RÉELLE — un `paiement.recu` reçu avant le branchement de son traitant n'est
 * jamais marqué `traite` : il attend `traitant:paiement_recu`, et le premier passage qui connaît son
 * traitant le lui redonne, une fois et une seule.
 *
 * Le dépôt, la reprise et l'aiguillage sont ceux de la production (`depotDuTravail`,
 * `reprendreLesTraitants`, `aiguiller`) : seule la liste des traitants est celle du test. Les
 * mêmes règles sur un dépôt en mémoire : `tests/unit/integration/type-sans-traitant.spec.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { TypeEvenementRecu } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  aiguiller,
  depotDuTravail,
  passerLeTravail,
  reprendreLesTraitants,
  type Traitants,
} from '../../src/server/queue/workers/evenement-recu';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const MAINTENANT = new Date('2026-10-01T10:00:00.000Z');

async function inscrire(
  eventType: TypeEvenementRecu,
  sujetRef: string,
  charge: Record<string, string>
): Promise<string> {
  const e = await base.prisma.evenementRecu.create({
    data: {
      source: 'axionia',
      eventId: randomUUID(),
      eventType,
      schemaVersion: 2,
      sujetRef,
      charge,
      payloadHash: createHash('sha256').update(JSON.stringify(charge)).digest('hex'),
      statut: 'recu',
      receivedAt: MAINTENANT,
      survenuAt: MAINTENANT,
    },
    select: { id: true },
  });
  return e.id;
}

const passer = (traitants: Traitants) =>
  passerLeTravail({
    depot: depotDuTravail(base.prisma),
    dispatch: aiguiller(traitants),
    reprendre: reprendreLesTraitants(base.prisma, traitants),
    maintenant: () => MAINTENANT,
  });

const etat = async (id: string) =>
  base.prisma.evenementRecu.findUniqueOrThrow({
    where: { id },
    select: { statut: true, dependanceRef: true, processedAt: true },
  });

describe('INT-T43 — un type sans traitant attend son traitant, en base réelle', () => {
  it('un `paiement.recu` reçu avant son traitant lui est redonné une fois branché, et une seule', async () => {
    const facture = randomUUID();
    const f = await inscrire(TypeEvenementRecu.facture_emise, `facture:${facture}`, {
      factureId: facture,
    });
    const p = await inscrire(TypeEvenementRecu.paiement_recu, `paiement:${randomUUID()}`, {
      factureId: facture,
    });
    const effets: string[] = [];
    const avant: Traitants = { [TypeEvenementRecu.facture_emise]: async () => undefined };
    const apres: Traitants = {
      ...avant,
      [TypeEvenementRecu.paiement_recu]: async (e) => {
        effets.push(e.id);
      },
    };

    await passer(avant);
    await passer(avant);
    expect((await etat(f)).statut).toBe('traite');
    expect(await etat(p)).toEqual({
      statut: 'en_attente_dependance',
      dependanceRef: 'traitant:paiement_recu',
      processedAt: null,
    });
    expect(effets).toEqual([]);

    await passer(apres);
    await passer(apres);
    expect(effets).toEqual([p]);
    expect(await etat(p)).toMatchObject({ statut: 'traite', dependanceRef: null });
  });

  it("la reprise ne réveille pas l'attente d'un type qui n'a toujours pas de traitant", async () => {
    const a = await inscrire(TypeEvenementRecu.avoir_emis, `avoir:${randomUUID()}`, {
      factureId: randomUUID(),
    });
    await passer({});
    const repris = await reprendreLesTraitants(base.prisma, {
      [TypeEvenementRecu.client_cree]: async () => undefined,
    })();
    expect(repris).toBe(0);
    expect(await etat(a)).toEqual({
      statut: 'en_attente_dependance',
      dependanceRef: 'traitant:avoir_emis',
      processedAt: null,
    });
  });
});
