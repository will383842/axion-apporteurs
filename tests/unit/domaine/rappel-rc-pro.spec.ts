// @req REQ-DM-027
/**
 * DM-51 — le passage du rappel `rc_pro`, sur un client FACTICE : les requêtes qu'il pose (la fenêtre
 * lue dans la SSOT, la trace d'envoi qui le rend idempotent), et ce qu'il fait de chaque pièce.
 * La preuve en base réelle est `tests/integration/rappel-rc-pro.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, StatutCourriel } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, colonnesPii } from '../../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../../src/server/auth/lien-magique-depot';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import { dateEnClair } from '../../../src/server/attribution/notifications';
import type { DemandeDEnvoi } from '../../../src/server/integrations/zeptomail/emetteur';
import { rappelerLesAttestationsRcPro } from '../../../src/server/taches/rappeler-rc-pro';

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-dm51-u-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join(
    ''
  ),
});
const MAINTENANT = new Date('2026-10-09T08:00:00.000Z');
const DELAI_MS = SEUILS.RC_PRO_RAPPEL_AVANT_ECHEANCE_JOURS.valeur * MS_PAR_JOUR;
const ECHEANCE = new Date(MAINTENANT.getTime() + 10 * MS_PAR_JOUR);

type Piece = { apporteurId: string; expireAt: Date | null };

function monde(o: {
  pieces: Piece[];
  courriels?: number;
  notifications?: number;
  sansAdresse?: string[];
}) {
  const appels = {
    findMany: [] as unknown[],
    courriels: [] as unknown[],
    notifications: [] as unknown[],
    creees: [] as unknown[],
    envois: [] as DemandeDEnvoi[],
  };
  const adresses = new Map<string, Uint8Array>();
  const adresseDe = (id: string) => {
    if (o.sansAdresse?.includes(id)) return null;
    let chiffre = adresses.get(id);
    if (chiffre === undefined) {
      chiffre = colonnesPii({ modele: MODELE_APPORTEUR, id }, { email: `${id}@example.org` }, CLES)
        .emailChiffre as Uint8Array;
      adresses.set(id, chiffre);
    }
    return Buffer.from(chiffre);
  };
  const prisma = {
    pieceKyc: {
      findMany: async (args: unknown) => {
        appels.findMany.push(args);
        return o.pieces;
      },
    },
    courrielEnvoye: {
      count: async (args: unknown) => {
        appels.courriels.push(args);
        return o.courriels ?? 0;
      },
    },
    notificationEspace: {
      count: async (args: unknown) => {
        appels.notifications.push(args);
        return o.notifications ?? 0;
      },
      create: async (args: unknown) => {
        appels.creees.push(args);
        return { id: randomUUID() };
      },
    },
    preferenceNotification: { findMany: async () => [] },
    apporteur: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const emailChiffre = adresseDe(where.id);
        return emailChiffre === null ? null : { emailChiffre };
      },
    },
  } as unknown as PrismaClient;
  const passage = () =>
    rappelerLesAttestationsRcPro(prisma, {
      maintenant: () => MAINTENANT,
      cles: CLES,
      urlDeLEspace: new URL('https://espace.example.org'),
      envoyerCourriel: async (demande): Promise<StatutCourriel> => {
        appels.envois.push(demande);
        return 'envoye';
      },
    });
  return { appels, passage };
}

describe('DM-51 — le passage du rappel rc_pro, requête par requête', () => {
  it('ne lit que les pièces rc_pro courantes et valides dont l’échéance tombe dans le délai de la SSOT', async () => {
    const m = monde({ pieces: [] });
    expect(await m.passage()).toEqual({ rappeles: 0, dejaRappeles: 0, echecs: 0 });
    expect(m.appels.findMany).toEqual([
      {
        where: {
          type: 'rc_pro',
          statut: 'valide',
          remplaceeAt: null,
          expireAt: { gt: MAINTENANT, lte: new Date(MAINTENANT.getTime() + DELAI_MS) },
        },
        orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
        select: { apporteurId: true, expireAt: true },
      },
    ]);
  });

  it('sans trace dans la fenêtre : la notification rappel_rc_pro part, une fois, à l’adresse de l’apporteur', async () => {
    const apporteurId = randomUUID();
    const m = monde({ pieces: [{ apporteurId, expireAt: ECHEANCE }] });
    expect(await m.passage()).toEqual({ rappeles: 1, dejaRappeles: 0, echecs: 0 });
    const depuis = new Date(ECHEANCE.getTime() - DELAI_MS);
    expect(m.appels.courriels).toEqual([
      { where: { gabarit: 'rappel_rc_pro', apporteurId, demandeAt: { gte: depuis } } },
    ]);
    expect(m.appels.notifications).toEqual([
      { where: { cle: 'rappel_rc_pro', apporteurId, creeAt: { gte: depuis } } },
    ]);
    expect(m.appels.envois).toHaveLength(1);
    expect(m.appels.envois[0]).toMatchObject({
      gabarit: 'rappel_rc_pro',
      a: `${apporteurId}@example.org`,
      apporteurId,
    });
    expect(m.appels.envois[0]!.sujet).toContain(dateEnClair(ECHEANCE));
    expect(m.appels.creees).toHaveLength(1);
  });

  it('un courriel OU une notification déjà dans la fenêtre : rien ne part', async () => {
    for (const traces of [{ courriels: 1 }, { notifications: 1 }]) {
      const m = monde({ pieces: [{ apporteurId: randomUUID(), expireAt: ECHEANCE }], ...traces });
      expect(await m.passage()).toEqual({ rappeles: 0, dejaRappeles: 1, echecs: 0 });
      expect(m.appels.envois).toHaveLength(0);
      expect(m.appels.creees).toHaveLength(0);
    }
  });

  it('une pièce sans échéance est ignorée ; un apporteur sans adresse est compté et ne retient pas le suivant', async () => {
    const sansAdresse = randomUUID();
    const suivant = randomUUID();
    const m = monde({
      pieces: [
        { apporteurId: randomUUID(), expireAt: null },
        { apporteurId: sansAdresse, expireAt: ECHEANCE },
        { apporteurId: suivant, expireAt: ECHEANCE },
      ],
      sansAdresse: [sansAdresse],
    });
    expect(await m.passage()).toEqual({ rappeles: 1, dejaRappeles: 0, echecs: 1 });
    expect(m.appels.courriels).toHaveLength(2);
    expect(m.appels.envois.map((e) => e.apporteurId)).toEqual([suivant]);
  });
});
