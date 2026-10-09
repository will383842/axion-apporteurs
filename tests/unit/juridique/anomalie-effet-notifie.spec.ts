// @req REQ-JUR-031
/**
 * JUR-T58 (REQ-JUR-031) — l'effet d'une anomalie confirmée sur l'apporteur, décidé par une personne de
 * la console, écrit dans SA transaction, notifié avec son motif et la voie de contestation (juriste,
 * #474, 6037559862, 6037701905 et 6038112933 ; arbitrages, #319, 6037567525 et 6037664957 ; #806,
 * 6039852465). EN PROCESSUS : le point d'entrée sur un faux client, l'annulation de DM-71 et la pose de
 * la suspension de SEC-15 en doubles ; les textes, réels.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../src/server/attribution/annuler-apres-confirmation', async (reel) => ({
  ...(await reel<typeof import('../../../src/server/attribution/annuler-apres-confirmation')>()),
  annulerApresConfirmation: vi.fn(),
}));
vi.mock('../../../src/server/apporteur/suspension', async (reel) => ({
  ...(await reel<typeof import('../../../src/server/apporteur/suspension')>()),
  poserUneSuspension: vi.fn(),
}));

import { annulerApresConfirmation } from '../../../src/server/attribution/annuler-apres-confirmation';
import { poserUneSuspension } from '../../../src/server/apporteur/suspension';
import {
  appliquerLEffetDUneAnomalie,
  EFFETS_D_UNE_ANOMALIE,
  ErreurEffetDUneAnomalie,
  type DecisionDEffet,
} from '../../../src/server/anomalie/effets';
import {
  motifDeLaDecision,
  texteDeLaDecisionDansLEspace,
} from '../../../src/server/attribution/notifications';
import {
  MOTIFS_DES_DECISIONS,
  TEXTES_DES_NOTIFICATIONS,
} from '../../../src/content/micro-copy/courriels/notifications';
import { GABARITS } from '../../../src/server/notifications/table-ssot';
import { clesPii } from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const ANOMALIE = '0190a5c0-0000-7000-8000-00000000a001';
const ATTRIBUTION = '0190a5c0-0000-7000-8000-00000000b001';
const APPORTEUR = '0190a5c0-0000-7000-8000-00000000c001';
const ADMIN = { par: 'utilisateur_console', id: '0190a5c0-0000-7000-8000-00000000d001' } as const;
const CLE = '0190a5c0-0000-7000-8000-00000000e001';
const MAINTENANT = new Date('2026-10-08T09:00:00.000Z');
const FAITS = "Le gérant dit n'avoir jamais rencontré ni été joint par l'apporteur";
/** Des clés factices, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-jur-t58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});

type Ligne = {
  type: string;
  statut: string;
  apporteur_id: string | null;
  attribution_id: string | null;
};
const SINCERITE_CONFIRMEE: Ligne = {
  type: 'sincerite',
  statut: 'confirmee',
  apporteur_id: APPORTEUR,
  attribution_id: ATTRIBUTION,
};

/** Un faux client : chaque transaction est comptée, la lecture de l'anomalie rend `ligne`. */
function univers(ligne: Ligne | null = SINCERITE_CONFIRMEE) {
  const transactions: unknown[] = [];
  const tx = { $queryRaw: async () => (ligne === null ? [] : [ligne]) };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      transactions.push(tx);
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, transactions, tx };
}

const ANNULATION: DecisionDEffet = {
  effet: 'annulation_pour_fabrication',
  anomalieId: ANOMALIE,
  acteur: ADMIN,
  maintenant: MAINTENANT,
};
const SUSPENSION: DecisionDEffet = {
  effet: 'suspension',
  anomalieId: ANOMALIE,
  acteur: ADMIN,
  maintenant: MAINTENANT,
  faitsTexte: FAITS,
  cleIdempotence: CLE,
};

const refus = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurEffetDUneAnomalie) return e.motif;
    throw e;
  }
  return 'aucun';
};

beforeEach(() => {
  vi.mocked(annulerApresConfirmation).mockReset();
  vi.mocked(poserUneSuspension).mockReset();
});

describe('REQ-JUR-031 — deux effets admis, décidés par une personne, chacun dans SA transaction', () => {
  it('REQ-JUR-031 : les effets sont FERMÉS : l’annulation pour fabrication et la suspension, aucune retenue', () => {
    expect([...EFFETS_D_UNE_ANOMALIE]).toEqual(['annulation_pour_fabrication', 'suspension']);
  });

  it('REQ-JUR-031 : TÉMOIN — l’annulation : UNE transaction, déléguée à l’annulation pour fraude de DM-71, avec l’anomalie et son auteur', async () => {
    const u = univers();
    await appliquerLEffetDUneAnomalie(u.client, ANNULATION, CLES);
    expect(u.transactions).toHaveLength(1);
    expect(vi.mocked(annulerApresConfirmation)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(annulerApresConfirmation).mock.calls[0]![0]).toBe(u.tx);
    expect(vi.mocked(annulerApresConfirmation).mock.calls[0]![1]).toEqual({
      attributionId: ATTRIBUTION,
      exception: 'fraude',
      anomalieId: ANOMALIE,
      acteur: { id: ADMIN.id },
      maintenant: MAINTENANT,
    });
    expect(vi.mocked(poserUneSuspension)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-031 : TÉMOIN — la suspension : UNE transaction, déléguée à la pose, motif `gele_fraude` sur l’anomalie confirmée, avec les faits saisis', async () => {
    const u = univers();
    await appliquerLEffetDUneAnomalie(u.client, SUSPENSION, CLES);
    expect(u.transactions).toHaveLength(1);
    expect(vi.mocked(poserUneSuspension)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(poserUneSuspension).mock.calls[0]![0]).toBe(u.tx);
    expect(vi.mocked(poserUneSuspension).mock.calls[0]![1]).toEqual({
      apporteurId: APPORTEUR,
      faits: { motif: 'gele_fraude', anomalie: { id: ANOMALIE, confirmeeParUnHumain: true } },
      acteur: { id: ADMIN.id },
      maintenant: MAINTENANT,
      faitsTexte: FAITS,
      cleIdempotence: CLE,
      cles: CLES,
    });
    expect(vi.mocked(annulerApresConfirmation)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-031 : TÉMOIN — un effet sans décideur humain est REFUSÉ avant toute transaction', async () => {
    for (const acteur of [
      { par: 'systeme' },
      { par: 'utilisateur_console', id: '' },
      { par: 'utilisateur_console', id: 'pas-un-uuid' },
    ]) {
      const u = univers();
      const d = { ...ANNULATION, acteur } as unknown as DecisionDEffet;
      expect(await refus(appliquerLEffetDUneAnomalie(u.client, d, CLES))).toBe(
        'decideur_humain_absent'
      );
      expect(u.transactions).toHaveLength(0);
    }
  });

  it('REQ-JUR-031 : TÉMOIN — une anomalie inconnue, hors sincérité ou non confirmée ne fonde aucun effet', async () => {
    const cas: [Ligne | null, string][] = [
      [null, 'anomalie_inconnue'],
      [{ ...SINCERITE_CONFIRMEE, apporteur_id: null }, 'anomalie_inconnue'],
      [{ ...SINCERITE_CONFIRMEE, type: 'auto_parrainage' }, 'anomalie_hors_motif'],
      [{ ...SINCERITE_CONFIRMEE, statut: 'ouverte' }, 'anomalie_non_confirmee'],
      [{ ...SINCERITE_CONFIRMEE, attribution_id: null }, 'sans_attribution'],
    ];
    for (const [ligne, motif] of cas) {
      const u = univers(ligne);
      expect(await refus(appliquerLEffetDUneAnomalie(u.client, ANNULATION, CLES))).toBe(motif);
    }
    expect(vi.mocked(annulerApresConfirmation)).not.toHaveBeenCalled();
    expect(vi.mocked(poserUneSuspension)).not.toHaveBeenCalled();
  });

  it('REQ-JUR-031 : TÉMOIN statique — l’effet n’est jamais écrit dans la transaction de la clôture : `effets.ts` ne clôt aucune anomalie', () => {
    const source = readFileSync('src/server/anomalie/effets.ts', 'utf8');
    expect(source).not.toMatch(/UPDATE\s+anomalies/i);
    expect(source).not.toMatch(/anomalie\.(update|upsert)/);
    expect(source).not.toMatch(/anomalie_statut_modifie/);
  });
});

describe('REQ-JUR-031 — la notification : le motif, les faits retenus, la voie de contestation', () => {
  it('REQ-JUR-031 : TÉMOIN — l’annulation : le motif `fraude_etablie` de la juriste, suivi de la phrase de contestation existante, sans identifiant d’anomalie', () => {
    expect(motifDeLaDecision({ transition: 'fraude_etablie', faits: FAITS })).toBe(
      MOTIFS_DES_DECISIONS.fraude_etablie.replace('{faits}', FAITS)
    );
    const texte = texteDeLaDecisionDansLEspace(
      'Garage de la Démo',
      {
        de: 'signee',
        vers: 'annulee',
        transition: 'fraude_etablie',
        exception: 'fraude',
        acteur: ADMIN,
      },
      { faits: FAITS }
    );
    const rendu = JSON.stringify(texte);
    expect(rendu).toContain('restent dues');
    expect(rendu).toContain('Vous pouvez contester cette décision par écrit');
    expect(rendu).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('REQ-JUR-031 : TÉMOIN — un lien dans les faits est refusé à la saisie', () => {
    expect(() =>
      motifDeLaDecision({ transition: 'fraude_etablie', faits: 'voir https://exemple.invalid/x' })
    ).toThrow();
  });

  it('REQ-JUR-031 : TÉMOIN — la suspension : la phrase et l’action de contestation de la juriste, vers la voie écrite existante', () => {
    const t = TEXTES_DES_NOTIFICATIONS.suspension_declarations;
    expect(
      t.corps.endsWith(
        'Vous pouvez contester cette suspension par écrit, en écrivant à Axion-IA depuis votre espace.'
      )
    ).toBe(true);
    expect(t.appel).toBe('Contester cette suspension par écrit');
    expect(GABARITS.suspension_declarations.route).toBe('/aide');
    expect(GABARITS.suspension_declarations.actions.map((a) => a.libelle)).toEqual([
      'Contester cette suspension par écrit',
    ]);
  });

  it('REQ-JUR-031 : TÉMOIN statique — la page des notifications lit la fin d’une suspension au journal (sans elle, une suspension aux faits purgés ne s’affiche pas)', () => {
    const page = readFileSync('src/app/(espace)/notifications/page.tsx', 'utf8');
    expect(page).toMatch(/finDUneSuspension:\s/);
  });
});
