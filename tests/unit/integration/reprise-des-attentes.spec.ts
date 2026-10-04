// @req REQ-QA-027
/**
 * INT-T49, en mémoire — la reprise des attentes de coordonnées est BORNÉE par l'âge (SSOT), elle
 * tourne par le lanceur seul, et l'alerte des attentes au-delà de leur seuil suit la règle du canal
 * (arbitrage (d) de la coordination) : aucune exigence au démarrage ; une alerte DUE sans canal fait
 * échouer le passage en le nommant, un envoi en échec aussi, et la fenêtre est rejouée.
 * La même chose en base réelle : `tests/integration/reprise-des-attentes.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TypeEvenementRecu, type PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import {
  reprendreLesAttentes,
  seuilDAttenteMs,
  type AttenteEnCours,
} from '../../../src/server/queue/workers/evenement-recu';
import {
  alerterLesFranchissements,
  canalDAlerte,
  type AlertesDAttente,
} from '../../../src/server/taches/inscriptions';

const MAINTENANT = new Date('2026-10-10T08:00:00.000Z');
const SEUIL = SEUILS.ATTENTE_DES_COORDONNEES_JOURS.valeur * MS_PAR_JOUR;

const coordonnees = (ilYaMs: number): AttenteEnCours => ({
  eventType: TypeEvenementRecu.candidature_recue,
  dependanceRef: 'coordonnees:33333333-3333-4333-8333-333333333333',
  receivedAt: new Date(MAINTENANT.getTime() - ilYaMs),
});

/** Un jeu d'alertes : les attentes données, aucun succès antérieur, un canal qui compte (ou aucun). */
function alertes(attentes: AttenteEnCours[], canal: 'present' | 'absent' | 'en_echec') {
  const envoyees: unknown[] = [];
  const a: AlertesDAttente = {
    lireLesAttentes: async () => attentes,
    dernierSucces: async () => null,
    alerteur:
      canal === 'absent'
        ? null
        : {
            alerter: async (o) => {
              if (canal === 'en_echec') throw new Error('telegram_refuse : HTTP 502');
              envoyees.push(o);
              return 'envoyee';
            },
          },
  };
  return { a, envoyees };
}

describe('REQ-QA-027 — la reprise des coordonnées est bornée par l’âge', () => {
  it('REQ-QA-027 : la borne est celle de la SSOT (7 jours), sous les 30 jours de minimisation d’INT-T56', () => {
    expect(seuilDAttenteMs('coordonnees')).toBe(SEUIL);
    expect(SEUILS.ATTENTE_DES_COORDONNEES_JOURS.valeur).toBeLessThan(30);
  });

  it('REQ-QA-027 : TÉMOIN — seules les attentes reçues DEPUIS la borne sont reprises', async () => {
    const appels: unknown[] = [];
    const prisma = {
      evenementRecu: {
        updateMany: async (args: unknown) => {
          appels.push(args);
          return { count: 2 };
        },
      },
    } as unknown as PrismaClient;
    expect(await reprendreLesAttentes(prisma, 'coordonnees:', () => MAINTENANT)()).toBe(2);
    expect(appels).toEqual([
      {
        where: {
          statut: 'en_attente_dependance',
          dependanceRef: { startsWith: 'coordonnees:' },
          receivedAt: { gte: new Date(MAINTENANT.getTime() - SEUIL) },
        },
        data: { statut: 'recu', dependanceRef: null },
      },
    ]);
  });
});

describe('REQ-QA-027 — l’alerte des attentes au-delà, et le canal (arbitrage (d))', () => {
  it('REQ-QA-027 : (i) aucune alerte due, canal absent — le passage réussit, rien n’est exigé', async () => {
    const { a } = alertes([coordonnees(SEUIL - 1)], 'absent');
    await expect(alerterLesFranchissements(a, MAINTENANT)).resolves.toBeUndefined();
  });

  it('REQ-QA-027 : (ii) alerte due, canal absent — le passage ÉCHOUE en le nommant, et la fenêtre sera rejouée', async () => {
    const { a } = alertes([coordonnees(SEUIL + 1)], 'absent');
    await expect(alerterLesFranchissements(a, MAINTENANT)).rejects.toThrow('canal_alerte_absent');
  });

  it('REQ-QA-027 : (iii) alerte due, canal présent — UN envoi, catégorie `attente_depassee`, forme coordonnees', async () => {
    const { a, envoyees } = alertes([coordonnees(SEUIL + 1), coordonnees(SEUIL + 2)], 'present');
    await alerterLesFranchissements(a, MAINTENANT);
    expect(envoyees).toHaveLength(1);
    expect(envoyees[0]).toMatchObject({
      categorie: 'attente_depassee',
      attente: { forme: 'coordonnees', type: TypeEvenementRecu.candidature_recue, nombre: 2 },
    });
  });

  it('REQ-QA-027 : un ENVOI en échec fait échouer le passage — aucune alerte perdue en silence', async () => {
    const { a } = alertes([coordonnees(SEUIL + 1)], 'en_echec');
    await expect(alerterLesFranchissements(a, MAINTENANT)).rejects.toThrow('telegram_refuse');
  });

  it('REQ-QA-027 : le canal du serveur n’existe que si son jeton ET son salon sont posés', () => {
    expect(canalDAlerte({})).toBeNull();
    expect(canalDAlerte({ TELEGRAM_BOT_TOKEN: 'x'.repeat(40) })).toBeNull();
    expect(canalDAlerte({ TELEGRAM_CHAT_ID: '-100' })).toBeNull();
    // SEC-64 : jeton ET salon construisent le canal RÉEL, qui exige la décision consignée sur le
    // transfert hors de l'Union européenne ; avec elle, le canal existe ; sans elle, refus nommé.
    const decision = { pays: 'p', encadrement: 'e', decideLe: '2026-10-04', source: 's' };
    expect(
      canalDAlerte({ TELEGRAM_BOT_TOKEN: 'x'.repeat(40), TELEGRAM_CHAT_ID: '-100' }, decision)
    ).not.toBeNull();
    expect(() =>
      canalDAlerte({ TELEGRAM_BOT_TOKEN: 'x'.repeat(40), TELEGRAM_CHAT_ID: '-100' })
    ).toThrow(/^transfert_telegram_non_consigne/);
  });
});

describe('REQ-QA-027 — le passage tourne par le lanceur seul', () => {
  it('REQ-QA-027 : la route ne joue aucun passage, ni dans `after()`, ni autrement', () => {
    const route = readFileSync('src/app/api/webhooks/axionia/route.ts', 'utf8');
    expect(route).not.toMatch(/passageDesEvenementsRecus|passerLeTravail|reprendreLesAttentes/);
    expect(route).not.toMatch(/\bafter\s*\(/);
    expect(route).toMatch(/declencher:\s*\(\)\s*=>\s*undefined/);
  });
});
