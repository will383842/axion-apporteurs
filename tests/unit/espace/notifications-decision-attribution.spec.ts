// @req REQ-UX-016
// @req REQ-UX-047
/**
 * UX-P1-58 — l'espace de l'apporteur affiche `decision_attribution` et son motif. Ce fichier juge
 * d'abord le LECTEUR DÉDIÉ des faits d'une anomalie pour l'espace (sécurité, #726, 5984281779,
 * voie (b)) : un lecteur par usage, avec son propre témoin « seul appelant ».
 *
 * - L'acteur est l'apporteur de la SESSION, jamais un identifiant de la requête : le triplet
 *   anomalie, attribution et apporteur est rejugé ; une anomalie d'un autre apporteur rend
 *   `refusee`, sans rien déchiffrer.
 * - Seules les faits d'une anomalie CONFIRMÉE, liée à SA notification `decision_attribution`, sont
 *   rendus ; purgée ou anonymisée, elle rend `purgee`.
 * - Le lecteur du passage d'envoi garde son témoin, inchangé ; aucun troisième appelant.
 * - Rien du contenu n'est journalisé.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, encryptPii } from '../../../src/server/securite/pii';
import {
  MODELE_DE_LA_JUSTIFICATION,
  lireLesFaitsPourLEspace,
  type ClientDesFaitsDeLEspace,
} from '../../../src/server/anomalie/justification';

const NOTIF = '0190f3a0-0000-7000-8000-0000000000e5';
const ANOMALIE = '0190f3a0-0000-7000-8000-0000000000d4';
const ATT = '0190f3a0-0000-7000-8000-0000000000a1';
const APP = '0190f3a0-0000-7000-8000-0000000000b2';
const AUTRE = '0190f3a0-0000-7000-8000-0000000000c3';
const MARQUEUR = 'MARQUEUR-FAITS-ESPACE-58';

const clesDuBanc = () => {
  const env: Record<string, string> = { NODE_ENV: 'test' };
  for (const nom of NOMS_DES_SECRETS) env[nom] = randomBytes(32).toString('hex');
  return clesPii(env);
};
const CLES = clesDuBanc();

type Notification = {
  apporteurId: string;
  cle: string;
  attributionId: string | null;
  anomalieId: string | null;
};
type Anomalie = {
  statut: string;
  attributionId: string;
  apporteurId: string;
  anonymiseeAt: Date | null;
  justificationChiffre: Uint8Array | null;
};

const notification = (o: Partial<Notification> = {}): Notification => ({
  apporteurId: APP,
  cle: 'decision_attribution',
  attributionId: ATT,
  anomalieId: ANOMALIE,
  ...o,
});
const anomalie = (o: Partial<Anomalie> = {}): Anomalie => ({
  statut: 'confirmee',
  attributionId: ATT,
  apporteurId: APP,
  anonymiseeAt: null,
  justificationChiffre: encryptPii(
    { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: ANOMALIE },
    `deux dépôts le même jour ${MARQUEUR}`,
    CLES
  ),
  ...o,
});

/** Un faux client : la notification et l'anomalie lues, et chaque lecture consignée. */
function client(n: Notification | null, a: Anomalie | null) {
  const lectures: { table: string; args: unknown }[] = [];
  const c = {
    notificationEspace: {
      findUnique: async (args: unknown) => {
        lectures.push({ table: 'notificationEspace', args });
        return n;
      },
    },
    anomalie: {
      findUnique: async (args: unknown) => {
        lectures.push({ table: 'anomalie', args });
        return a;
      },
    },
  } as unknown as ClientDesFaitsDeLEspace;
  return { c, lectures };
}
const lire = (n: Notification | null, a: Anomalie | null, apporteurId = APP) =>
  lireLesFaitsPourLEspace(client(n, a).c, { notificationId: NOTIF, apporteurId }, CLES);

afterEach(() => vi.restoreAllMocks());

describe('REQ-UX-016 — le lecteur dédié de l’espace : les faits de SA décision, et rien d’autre', () => {
  it('REQ-UX-016 : TÉMOIN face admise — l’anomalie confirmée de SA notification rend ses faits', async () => {
    const { c, lectures } = client(notification(), anomalie());
    expect(
      await lireLesFaitsPourLEspace(c, { notificationId: NOTIF, apporteurId: APP }, CLES)
    ).toEqual({ faits: `deux dépôts le même jour ${MARQUEUR}` });
    expect(lectures[0]).toEqual({
      table: 'notificationEspace',
      args: {
        where: { id: NOTIF },
        select: { apporteurId: true, cle: true, attributionId: true, anomalieId: true },
      },
    });
    expect(lectures[1]!.args).toMatchObject({ where: { id: ANOMALIE } });
  });

  it('REQ-UX-016 : TÉMOIN — la notification d’un AUTRE apporteur rend `refusee`, sans lire l’anomalie', async () => {
    const { c, lectures } = client(notification({ apporteurId: AUTRE }), anomalie());
    expect(
      await lireLesFaitsPourLEspace(c, { notificationId: NOTIF, apporteurId: APP }, CLES)
    ).toBe('refusee');
    expect(lectures.map((l) => l.table)).toEqual(['notificationEspace']);
    expect(await lire(null, anomalie())).toBe('refusee');
  });

  it('REQ-UX-016 : une autre clé que `decision_attribution`, ou une notification sans attribution, rend `refusee`', async () => {
    expect(await lire(notification({ cle: 'premier_rang_libere' }), anomalie())).toBe('refusee');
    expect(await lire(notification({ attributionId: null }), anomalie())).toBe('refusee');
  });

  it('REQ-UX-016 : TÉMOIN — une anomalie d’un autre apporteur, d’une autre attribution ou non confirmée rend `refusee`, sans rien déchiffrer', async () => {
    let lu = false;
    const piegee = (o: Partial<Anomalie>): Anomalie => {
      const a = anomalie(o);
      Object.defineProperty(a, 'justificationChiffre', {
        get: () => {
          lu = true;
          return null;
        },
      });
      return a;
    };
    for (const o of [
      { apporteurId: AUTRE },
      { attributionId: AUTRE },
      { statut: 'ouverte' },
      { statut: 'levee' },
    ]) {
      expect(await lire(notification(), piegee(o)), JSON.stringify(o)).toBe('refusee');
    }
    expect(lu).toBe(false);
    expect(await lire(notification(), null)).toBe('refusee');
  });

  it('REQ-UX-016 : TÉMOIN — purgée, anonymisée, ou détachée de la notification, l’anomalie rend `purgee`', async () => {
    expect(await lire(notification(), anomalie({ justificationChiffre: null }))).toBe('purgee');
    expect(await lire(notification(), anomalie({ anonymiseeAt: new Date(0) }))).toBe('purgee');
    expect(await lire(notification({ anomalieId: null }), anomalie())).toBe('purgee');
  });

  it('REQ-UX-016 : un bloc qui ne se déchiffre pas sous la donnée authentifiée de SA ligne rend `refusee`', async () => {
    const ailleurs = encryptPii(
      { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: AUTRE },
      'faits d’une autre ligne',
      CLES
    );
    expect(await lire(notification(), anomalie({ justificationChiffre: ailleurs }))).toBe(
      'refusee'
    );
  });

  it('REQ-UX-016 : TÉMOIN MARQUEUR — le lecteur ne consigne rien du contenu', async () => {
    const sorties: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void sorties.push(a));
    await lire(notification(), anomalie());
    await lire(notification(), anomalie({ apporteurId: AUTRE }));
    expect(JSON.stringify(sorties)).not.toContain(MARQUEUR);
  });
});

const sourcesDe = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) return sourcesDe(chemin);
    return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
  });

describe('REQ-UX-016 — un lecteur, un appelant (sécurité, voie (b))', () => {
  const fichiers = sourcesDe('src').map((f) => [f, readFileSync(f, 'utf8')] as const);

  it('REQ-UX-016 : TÉMOIN — seul le lecteur des notifications de l’espace appelle le lecteur dédié', () => {
    const appelants = fichiers
      .filter(([f]) => f !== 'src/server/anomalie/justification.ts')
      .filter(([, t]) => /\blireLesFaitsPourLEspace\b/.test(t))
      .map(([f]) => f);
    expect(appelants).toEqual(['src/server/notifications/notifications-de-l-espace.ts']);
  });

  it('REQ-UX-016 : aucun module de l’écran de l’espace n’importe la justification directement', () => {
    const fautifs = fichiers
      .filter(([f]) => f.startsWith('src/app/(espace)/'))
      .filter(([, t]) => /anomalie\/justification/.test(t))
      .map(([f]) => f);
    expect(fautifs).toEqual([]);
  });
});
