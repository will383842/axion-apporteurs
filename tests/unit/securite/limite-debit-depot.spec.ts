// @req REQ-DM-009
/**
 * SEC-12 — la limite de débit du dépôt : TECHNIQUE, identique pour tous, sans compte par apporteur
 * (REQ-DM-009, texte de la juriste du rattrapage 84).
 *
 * CE QU'IL PROUVE :
 *   1. DIX DÉPÔTS À LA MAIN, à intervalle humain, passent tous ;
 *   2. AU-DELÀ DU DÉBIT, la réponse demande de réessayer, avec l'heure de reprise, et RIEN n'est écrit :
 *      le client de base n'est même pas touché ;
 *   3. le seul compteur consommé est celui de l'empreinte réseau — jamais un compteur par identité :
 *      aucun dépôt d'un apporteur n'est compté.
 */
import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  COMPTEURS,
  magasinDepuis,
  type ConsommerDuMagasin,
  type MagasinDeCompteurs,
} from '../../../src/server/securite/rate-limit';
import {
  controlerLeDebit,
  deposer,
  type DemandeDeDepot,
  type PortsDuDepot,
} from '../../../src/server/depot/deposer';

const IP = '0123456789abcdef';
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
const MINUTE = 60_000;

function magasinEnMemoire(): { magasin: MagasinDeCompteurs; cles: string[] } {
  const cles: string[] = [];
  const journaux = new Map<string, number[]>();
  const consommer: ConsommerDuMagasin = async (cle, maintenantMs, fenetreMs, limite) => {
    cles.push(cle);
    const vivants = (journaux.get(cle) ?? []).filter((s) => s > maintenantMs - fenetreMs);
    const admis = vivants.length < limite;
    if (admis) vivants.push(maintenantMs);
    journaux.set(cle, vivants);
    return { admis, compte: vivants.length, plusAncienMs: vivants[0] ?? null };
  };
  return { magasin: magasinDepuis(consommer), cles };
}

const LIMITE = (): number => {
  const { limite } = COMPTEURS['depot:ip'];
  if (typeof limite !== 'number') throw new Error('depot:ip : limite hors dépôt');
  return limite;
};

describe('REQ-DM-009 — une limite technique, jamais un compte par apporteur', () => {
  it('REQ-DM-009 : dix dépôts à la main, une minute d’écart, passent tous', async () => {
    const { magasin } = magasinEnMemoire();
    for (let i = 0; i < 10; i += 1) {
      expect(await controlerLeDebit(IP, T0 + i * MINUTE, magasin)).toEqual({
        autorise: true,
        repriseAt: null,
      });
    }
  });

  it('REQ-DM-009 : au-delà du débit, en rafale : « réessayer », avec l’heure de reprise', async () => {
    const { magasin } = magasinEnMemoire();
    for (let i = 0; i < LIMITE(); i += 1) {
      expect((await controlerLeDebit(IP, T0 + i, magasin)).autorise).toBe(true);
    }
    const refuse = await controlerLeDebit(IP, T0 + LIMITE(), magasin);
    expect(refuse.autorise).toBe(false);
    expect(refuse.repriseAt).toBeGreaterThan(T0 + LIMITE());
  });

  it('REQ-DM-009 : le seul compteur consommé est celui de l’empreinte réseau ; aucun compteur par identité', async () => {
    const { magasin, cles } = magasinEnMemoire();
    await controlerLeDebit(IP, T0, magasin);
    expect(cles).toEqual([`depot:ip:${IP}`]);
  });

  it('REQ-DM-009 : face ROUGE — au-delà du débit, le dépôt répond « réessayer » sans toucher la base', async () => {
    const prismaInterdit = new Proxy(
      {},
      {
        get(_c, propriete) {
          throw new Error(`base touchée : ${String(propriete)}`);
        },
      }
    ) as PrismaClient;
    const ports = {
      debit: async () => ({ autorise: false, repriseAt: T0 + MINUTE }),
    } as unknown as PortsDuDepot;
    const demande = { ipHash: IP } as unknown as DemandeDeDepot;
    expect(await deposer(prismaInterdit, demande, ports)).toEqual({
      reessayer: true,
      repriseAt: T0 + MINUTE,
    });
  });
});
