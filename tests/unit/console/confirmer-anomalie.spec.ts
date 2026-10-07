// @req REQ-UX-047
// @req REQ-SEC-023
// @req REQ-DM-033
/**
 * UX-P1-56 — confirmer une anomalie de sincérité depuis la console, avec ses faits retenus (conditions
 * de la sécurité et de la juriste, relayées par la coordination ; contrat v2, juriste, #474, 6036318718).
 * EN PROCESSUS : le geste sur un faux client (droit relu, anomalie verrouillée, clôture chiffrée en une
 * écriture, événement sans identité ni faits, transition de l'attribution seulement si son état
 * l'admet) ; l'action avec des doubles de Next et du juge des rôles ; l'écran rendu en HTML statique.
 * Aucun gel n'est posé : l'effet relève de SEC-15.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';

const h = vi.hoisted(() => {
  class Redirection extends Error {
    constructor(readonly vers: string) {
      super(`redirection ${vers}`);
    }
  }
  return {
    Redirection,
    D: {
      prisma: { factice: true },
      env: { NODE_ENV: 'test' } as Record<string, string>,
      horloge: { maintenant: () => 1_803_031_200_000 },
    },
    jeton: { valeur: 'JETON' as string | undefined },
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) =>
      nom === 'session_console' && h.jeton.valeur !== undefined
        ? { value: h.jeton.valeur }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((vers: string) => {
    throw new h.Redirection(vers);
  }),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('../../../src/server/roles/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('../../../src/server/auth/lien-magique-production', () => ({
  COOKIE_DE_SESSION_CONSOLE: { nom: 'session_console' },
  dependancesDuProcessus: vi.fn(() => h.D),
  portsDeRoleConsole: vi.fn(() => ({ ports: 'console' })),
}));
vi.mock('../../../src/server/securite/pii', async (original) => ({
  ...(await original<typeof import('../../../src/server/securite/pii')>()),
}));
vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));
vi.mock('../../../src/server/attribution/transitionner', () => ({
  transitionnerUneAttribution: vi.fn(),
}));
vi.mock('../../../src/server/console/anomalies/confirmer', async (original) => ({
  ...(await original<typeof import('../../../src/server/console/anomalies/confirmer')>()),
  confirmerUneAnomalie: vi.fn(),
}));

import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, decryptPii } from '../../../src/server/securite/pii';
import { requireRole, type MotifDeRefusConsole } from '../../../src/server/roles/require-role';
import { MATRICE_DES_ROLES as MATRICE } from '../../../src/server/roles/matrice';
import { ajouterEvenement } from '../../../src/server/evenement/journal';
import { transitionnerUneAttribution } from '../../../src/server/attribution/transitionner';
import { FAITS_ANOMALIE_CARACTERES_MAX } from '../../../src/domain/seuils/ssot';
import { MODELE_DE_LA_JUSTIFICATION } from '../../../src/server/anomalie/justification';
import {
  confirmerUneAnomalie as confirmerDouble,
  ErreurConfirmationAnomalie,
  transitionAdmise,
  type AnomalieAConfirmer,
  type RefusDeConfirmation,
} from '../../../src/server/console/anomalies/confirmer';
import { confirmerLAnomalie } from '../../../src/app/(console)/console/anomalies/_anomalies/actions';
import {
  ConfirmerLAnomalie,
  ListeDesAnomalies,
} from '../../../src/app/(console)/console/anomalies/_anomalies/ecran';
import { ANOMALIES_CONSOLE as T } from '../../../src/content/micro-copy/console/anomalies';

const { confirmerUneAnomalie } = await vi.importActual<
  typeof import('../../../src/server/console/anomalies/confirmer')
>('../../../src/server/console/anomalies/confirmer');

/** Un environnement de test, fabriqué à l'exécution (jamais un secret réel). */
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-ux-p1-56-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
};
const CLES = clesPii(ENV);
h.D.env = ENV;

const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' as const };
const ANOMALIE = '0190f0f0-0000-7000-8000-0000000000b1';
const ATTRIBUTION = '0190f0f0-0000-7000-8000-0000000000c1';
const CLE = '0190f0f0-0000-4000-8000-0000000000d1';
const MAX = FAITS_ANOMALIE_CARACTERES_MAX.valeur;
const FAITS = 'La personne déclarée a indiqué par écrit n’avoir jamais échangé avec l’apporteur.';

type Lu = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

/** Un faux client : l'acteur relu, l'anomalie et l'attribution verrouillées, chaque écriture. */
function univers(
  o: {
    acteur?: Lu;
    anomalie?: { statut: string; type: string; attribution_id: string | null } | null;
    etatAttribution?: string;
  } = {}
) {
  const appels: { quoi: string; args: unknown }[] = [];
  const acteurLu: Lu =
    o.acteur === undefined ? { role: 'admin', desactiveAt: null, valideAt: MAINTENANT } : o.acteur;
  const anomalie =
    o.anomalie === undefined
      ? { statut: 'ouverte', type: 'sincerite', attribution_id: ATTRIBUTION }
      : o.anomalie;
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: unknown) => {
        appels.push({ quoi: 'utilisateurConsole.findUnique', args: a });
        return acteurLu;
      },
    },
    $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      const sql = gabarit.join('?');
      appels.push({
        quoi: sql.includes('FROM anomalies') ? 'lire anomalie' : 'lire attribution',
        args: { sql, valeurs },
      });
      if (sql.includes('FROM anomalies')) return anomalie === null ? [] : [anomalie];
      return [{ statut: o.etatAttribution ?? 'provisoire' }];
    },
    anomalie: {
      update: async (a: unknown) => {
        appels.push({ quoi: 'anomalie.update', args: a });
        return {};
      },
    },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels };
}

const confirmer = (client: PrismaClient, o: { faits?: string; cle?: string } = {}) =>
  confirmerUneAnomalie(
    client,
    {
      acteur: ADMIN,
      anomalieId: ANOMALIE,
      faits: o.faits ?? FAITS,
      cleIdempotence: o.cle ?? CLE,
      maintenant: MAINTENANT,
    },
    CLES
  );

const refus = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e).toBeInstanceOf(ErreurConfirmationAnomalie);
  return (e as ErreurConfirmationAnomalie).motif;
};

beforeEach(() => {
  vi.mocked(ajouterEvenement).mockReset();
  vi.mocked(ajouterEvenement).mockResolvedValue({ id: '7', selfHash: 'h' });
  vi.mocked(transitionnerUneAttribution).mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(confirmerDouble).mockReset();
});

describe('REQ-SEC-023 — confirmer une anomalie : l’admin seul, sous step-up, le droit relu', () => {
  it('REQ-SEC-023 : TÉMOIN — la matrice réserve le geste à l’admin SOUS step-up, et l’écran à l’admin', () => {
    expect(MATRICE['action:confirmer_anomalie']).toEqual({ roles: ['admin'], stepUp: true });
    expect(MATRICE['ecran:anomalies']).toEqual({ roles: ['admin'], stepUp: false });
  });

  it('REQ-SEC-023 : TÉMOIN — un rôle non autorisé est refusé avant toute lecture ; un admin désactivé, non validé ou inconnu, après la relecture', async () => {
    const { client, appels } = univers();
    const e = await confirmerUneAnomalie(
      client,
      {
        acteur: { id: ADMIN.id, role: 'qualifieur' },
        anomalieId: ANOMALIE,
        faits: FAITS,
        cleIdempotence: CLE,
        maintenant: MAINTENANT,
      },
      CLES
    ).then(
      () => null,
      (x: unknown) => x
    );
    expect((e as ErreurConfirmationAnomalie).motif).toBe('droit_absent');
    expect(appels.map((a) => a.quoi)).toEqual(['$transaction']);
    for (const acteur of [
      null,
      { role: 'admin', desactiveAt: MAINTENANT, valideAt: MAINTENANT },
      { role: 'admin', desactiveAt: null, valideAt: null },
      { role: 'qualifieur', desactiveAt: null, valideAt: MAINTENANT },
    ]) {
      const u = univers({ acteur });
      expect(await refus(confirmer(u.client))).toBe('droit_absent');
      expect(u.appels.map((a) => a.quoi)).toEqual([
        '$transaction',
        'utilisateurConsole.findUnique',
      ]);
    }
  });
});

describe('REQ-DM-033 — la confirmation : une transaction, la clôture chiffrée, aucun gel', () => {
  it('REQ-DM-033 : TÉMOIN — 1 001 points de code sont refusés à la saisie, 1 000 sont acceptés ENTIERS', async () => {
    const u = univers();
    expect(await refus(confirmer(u.client, { faits: 'é'.repeat(MAX + 1) }))).toBe(
      'faits_trop_longs'
    );
    expect(u.appels).toEqual([]);
    const v = univers();
    await confirmer(v.client, { faits: 'é'.repeat(MAX) });
    const maj = v.appels.find((a) => a.quoi === 'anomalie.update')!.args as {
      data: { justificationChiffre: Uint8Array };
    };
    expect(
      decryptPii(
        { modele: MODELE_DE_LA_JUSTIFICATION, champ: 'justificationChiffre', id: ANOMALIE },
        maj.data.justificationChiffre,
        CLES
      )
    ).toBe('é'.repeat(MAX));
  });

  it.each([
    ['', 'faits_vides'],
    ['Voir www.exemple.fr pour l’échange', 'faits_avec_lien'],
    ['Une fraude manifeste.', 'faits_avec_mot_refuse'],
  ] as const)(
    'REQ-DM-033 : TÉMOIN — « %s » est refusé à la saisie (%s), sans rien écrire',
    async (faits, motif) => {
      const u = univers();
      expect(await refus(confirmer(u.client, { faits }))).toBe(motif);
      expect(u.appels).toEqual([]);
    }
  );

  it('REQ-DM-033 : TÉMOIN — une clé d’idempotence absente ou forgée est refusée, sans rien écrire', async () => {
    for (const cle of ['', 'pas-une-cle']) {
      const u = univers();
      expect(await refus(confirmer(u.client, { cle }))).toBe('cle_invalide');
      expect(u.appels).toEqual([]);
    }
  });

  it('REQ-DM-033 : TÉMOIN — une attribution provisoire : UNE transaction, l’anomalie verrouillée, la clôture en UNE écriture, l’événement sans identité ni faits, puis la transition', async () => {
    const { client, appels } = univers();
    expect(await confirmer(client)).toEqual({ transition: true });
    expect(appels.map((a) => a.quoi)).toEqual([
      '$transaction',
      'utilisateurConsole.findUnique',
      'lire anomalie',
      'anomalie.update',
      'lire attribution',
    ]);
    const lecture = appels.find((a) => a.quoi === 'lire anomalie')!.args as {
      sql: string;
      valeurs: unknown[];
    };
    expect(lecture.sql).toContain('FOR UPDATE');
    expect(lecture.valeurs).toEqual([ANOMALIE]);
    const maj = appels.find((a) => a.quoi === 'anomalie.update')!.args as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(maj.where).toEqual({ id: ANOMALIE });
    expect(Object.keys(maj.data).sort()).toEqual([
      'justificationChiffre',
      'statut',
      'traiteAt',
      'traiteParId',
    ]);
    expect(maj.data).toMatchObject({
      statut: 'confirmee',
      traiteAt: MAINTENANT,
      traiteParId: ADMIN.id,
    });
    expect(vi.mocked(ajouterEvenement).mock.calls[0]![1]).toEqual({
      type: 'anomalie_statut_modifie',
      agregat: 'anomalie',
      agregatId: ANOMALIE,
      survenuAt: MAINTENANT,
      charge: { de: 'ouverte', vers: 'confirmee', acteur: { par: 'utilisateur_console' } },
    });
    expect(JSON.stringify(vi.mocked(ajouterEvenement).mock.calls)).not.toContain('apporteur');
    expect(vi.mocked(transitionnerUneAttribution).mock.calls[0]![1]).toEqual({
      attributionId: ATTRIBUTION,
      transition: 'anomalie_confirmee',
      acteur: { par: 'utilisateur_console', id: ADMIN.id },
      maintenant: MAINTENANT,
      anomalieId: ANOMALIE,
    });
  });

  it.each(['signee', 'convertie', 'figee_resiliation'])(
    'REQ-DM-033 : TÉMOIN — une attribution %s : la confirmation est ADMISE, sans transition ni notification (contrat v2, juriste 6036318718)',
    async (etat) => {
      const { client, appels } = univers({ etatAttribution: etat });
      expect(await confirmer(client)).toEqual({ transition: false });
      expect(appels.map((a) => a.quoi)).toContain('anomalie.update');
      expect(transitionnerUneAttribution).not.toHaveBeenCalled();
    }
  );

  it('REQ-DM-033 : les états de la machine : la transition est admise depuis provisoire, active, rdv_pris et proposition seulement', () => {
    for (const e of ['provisoire', 'active', 'rdv_pris', 'proposition'] as const)
      expect(transitionAdmise(e)).toBe(true);
    for (const e of ['signee', 'convertie', 'figee_resiliation'] as const)
      expect(transitionAdmise(e)).toBe(false);
  });

  it('REQ-DM-033 : TÉMOIN — une seconde confirmation est refusée (deja_traitee), un autre type aussi (type_non_traite), une inconnue aussi : rien n’est écrit', async () => {
    for (const [anomalie, motif] of [
      [{ statut: 'confirmee', type: 'sincerite', attribution_id: ATTRIBUTION }, 'deja_traitee'],
      [{ statut: 'levee', type: 'sincerite', attribution_id: ATTRIBUTION }, 'deja_traitee'],
      [{ statut: 'ouverte', type: 'auto_parrainage', attribution_id: null }, 'type_non_traite'],
      [null, 'anomalie_inconnue'],
    ] as const) {
      const u = univers({ anomalie });
      expect(await refus(confirmer(u.client))).toBe(motif);
      expect(u.appels.map((a) => a.quoi)).not.toContain('anomalie.update');
      expect(ajouterEvenement).not.toHaveBeenCalled();
    }
  });

  it('REQ-DM-033 : TÉMOIN — une anomalie sans attribution se confirme, sans transition', async () => {
    const { client, appels } = univers({
      anomalie: { statut: 'ouverte', type: 'sincerite', attribution_id: null },
    });
    expect(await confirmer(client)).toEqual({ transition: false });
    expect(appels.map((a) => a.quoi)).not.toContain('lire attribution');
  });

  it('REQ-DM-033 : TÉMOIN — aucune écriture ne pose un gel, ni ne touche un apporteur, une commande ou une commission', async () => {
    const { client, appels } = univers();
    await confirmer(client);
    const ecrites = appels.map((a) => a.quoi.split('.')[0]);
    for (const interdit of ['apporteur', 'commande', 'commission', 'gel'])
      expect(ecrites).not.toContain(interdit);
  });
});

describe('REQ-SEC-023 — l’action de l’écran : le droit d’abord, les refus nommés, les faits jamais dans l’adresse', () => {
  const ECRAN = `/console/anomalies/${ANOMALIE}`;
  function formulaire(o: { anomalieId?: string; faits?: string } = {}): FormData {
    const f = new FormData();
    f.set('anomalieId', o.anomalieId ?? ANOMALIE);
    f.set('faits', o.faits ?? FAITS);
    f.set('cleIdempotence', CLE);
    return f;
  }
  async function destination(f: FormData): Promise<string> {
    try {
      await confirmerLAnomalie(f);
    } catch (e) {
      if (e instanceof h.Redirection) return e.vers;
      throw e;
    }
    throw new Error('aucune redirection');
  }
  const accorde = () => vi.mocked(requireRole).mockResolvedValue({ ok: true, utilisateur: ADMIN });
  const refuse = (motif: MotifDeRefusConsole) =>
    vi.mocked(requireRole).mockResolvedValue({ ok: false, motif });

  it('REQ-SEC-023 : TÉMOIN — le droit est posé AVANT tout travail ; le retour dit si l’attribution a bougé', async () => {
    accorde();
    vi.mocked(confirmerDouble).mockResolvedValue({ transition: true });
    expect(await destination(formulaire())).toBe(`${ECRAN}?fait=transition`);
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe('action:confirmer_anomalie');
    vi.mocked(confirmerDouble).mockResolvedValue({ transition: false });
    expect(await destination(formulaire())).toBe(`${ECRAN}?fait=intacte`);
  });

  it('REQ-SEC-023 : TÉMOIN — une session trop ancienne revient à la connexion ; tout autre refus de rôle, à l’accès refusé ; rien n’est confirmé', async () => {
    refuse('releve_requis');
    expect(await destination(formulaire())).toBe(
      `/console/connexion?suite=${encodeURIComponent(ECRAN)}`
    );
    for (const motif of ['droit_absent', 'role_refuse', 'admin_en_attente'] as const) {
      refuse(motif);
      expect(await destination(formulaire())).toBe('/console/acces-refuse');
    }
    expect(confirmerDouble).not.toHaveBeenCalled();
  });

  it('REQ-SEC-023 : TÉMOIN — un refus revient à l’écran par son CODE seul, jamais avec les faits', async () => {
    accorde();
    const marqueur = 'MARQUEUR-DES-FAITS-56';
    vi.mocked(confirmerDouble).mockRejectedValue(
      new ErreurConfirmationAnomalie('faits_trop_longs')
    );
    const vers = await destination(formulaire({ faits: marqueur }));
    expect(vers).toBe(`${ECRAN}?refus=faits_trop_longs`);
    expect(vers).not.toContain(marqueur);
  });

  it('REQ-SEC-023 : un identifiant hors forme renvoie à la liste, sans poser la question du droit', async () => {
    expect(await destination(formulaire({ anomalieId: '../x' }))).toBe('/console/anomalies');
    expect(requireRole).not.toHaveBeenCalled();
  });
});

describe('REQ-UX-047 — les écrans « Anomalies » : la liste sans score, la confirmation et ses états', () => {
  const date = (d: Date) => d.toISOString().slice(0, 10);
  const texteDe = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const A = {
    id: ANOMALIE,
    ouverteAt: MAINTENANT,
    entreprise: 'Garage de la Démo',
    attributionIntacte: false,
  };
  const confirmerRendu = (
    lecture: AnomalieAConfirmer,
    o: { refus?: RefusDeConfirmation | null; fait?: 'transition' | 'intacte' | null } = {}
  ) =>
    renderToStaticMarkup(
      createElement(ConfirmerLAnomalie, {
        lecture,
        refus: o.refus ?? null,
        fait: o.fait ?? null,
        cleIdempotence: CLE,
        date,
        action: async () => {},
      })
    );

  it('REQ-UX-047 : TÉMOIN — la liste : la nature, l’entreprise, la date et « Examiner », sans score, rang ni seuil ; vide, son état vide', () => {
    const html = renderToStaticMarkup(createElement(ListeDesAnomalies, { anomalies: [A], date }));
    const t = texteDe(html);
    expect(t).toContain(T.liste.nature);
    expect(t).toContain('Garage de la Démo');
    expect(html).toContain(`href="/console/anomalies/${ANOMALIE}"`);
    expect(t).not.toMatch(/score|seuil|rang|\d+ ?%/i);
    const vide = texteDe(
      renderToStaticMarkup(createElement(ListeDesAnomalies, { anomalies: [], date }))
    );
    expect(vide).toContain(T.vide.titre);
  });

  it('REQ-UX-047 : TÉMOIN — le formulaire : les faits, la consigne avec la borne LUE dans la SSOT, la clé tirée au rendu, et l’effet selon l’attribution', () => {
    const html = confirmerRendu({ etat: 'a_confirmer', anomalie: A });
    expect(html).toContain('name="faits"');
    expect(html).toContain(`name="cleIdempotence" value="${CLE}"`);
    expect(texteDe(html)).toContain(T.confirmer.borne(MAX));
    expect(texteDe(html)).toContain(T.confirmer.effet.transition);
    expect(texteDe(html)).toContain(T.confirmer.sansGel);
    const intacte = confirmerRendu({
      etat: 'a_confirmer',
      anomalie: { ...A, attributionIntacte: true },
    });
    expect(texteDe(intacte)).toContain(T.confirmer.effet.intacte);
  });

  it('REQ-UX-047 : TÉMOIN — chaque refus nommé s’affiche en alerte ; le retour du geste prime sur l’état relu', () => {
    for (const r of Object.keys(T.refus) as RefusDeConfirmation[]) {
      const html = confirmerRendu({ etat: 'a_confirmer', anomalie: A }, { refus: r });
      expect(html).toContain('role="alert"');
      expect(texteDe(html)).toContain(T.refus[r]);
    }
    expect(texteDe(confirmerRendu({ etat: 'deja_traitee' }, { fait: 'transition' }))).toContain(
      T.confirmee.transition
    );
    expect(texteDe(confirmerRendu({ etat: 'deja_traitee' }, { fait: 'intacte' }))).toContain(
      T.confirmee.intacte
    );
  });

  it.each(['introuvable', 'deja_traitee', 'type_non_traite'] as const)(
    'REQ-UX-047 : l’état %s : aucun formulaire, sa phrase et le retour à la liste',
    (etat) => {
      const html = confirmerRendu({ etat });
      expect(html).not.toContain('name="faits"');
      expect(texteDe(html)).toContain(T.vides[etat].titre);
    }
  );
});
