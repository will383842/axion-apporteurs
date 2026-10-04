// @req REQ-SEC-023
/**
 * Les actions de l'écran « Utilisateurs de la console », EN PROCESSUS, avec des doubles de Next
 * (cookies, redirection, `after`), du juge des rôles et des gestes : chaque action demande SON droit
 * avant tout travail, renvoie un relèvement manquant à la connexion avec l'écran en suite et tout
 * autre refus à l'accueil, transmet au geste ses arguments exacts, revient à l'écran avec un motif
 * FERMÉ, et confie les courriels à l'envoi d'après la réponse. Les gestes eux-mêmes sont jugés par
 * `administration-console.spec.ts` et par l'intégration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  class Redirection extends Error {
    constructor(readonly vers: string) {
      super(`redirection ${vers}`);
    }
  }
  class ErreurAdministrationConsole extends Error {
    constructor(readonly motif: string) {
      super(motif);
    }
  }
  const MAINTENANT = 1_759_565_700_000;
  const envoyer = vi.fn(async () => undefined);
  const planifie: (() => Promise<void>)[] = [];
  const D = {
    prisma: { nom: 'prisma' },
    env: { NODE_ENV: 'test' },
    horloge: { maintenant: () => MAINTENANT },
    envoi: { envoyer },
    planifier: (f: () => Promise<void>) => {
      planifie.push(f);
    },
  };
  return {
    Redirection,
    ErreurAdministrationConsole,
    MAINTENANT,
    D,
    envoyer,
    planifie,
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
vi.mock('../../../src/server/securite/pii', () => ({ clesPii: vi.fn(() => ({ cles: 'test' })) }));
vi.mock('../../../src/server/auth/lien-magique-production', () => ({
  COOKIE_DE_SESSION_CONSOLE: { nom: 'session_console' },
  configurationDuLien: () => ({ urlPublique: 'https://partners.exemple.test' }),
  dependancesDuProcessus: vi.fn(() => h.D),
  portsDeRoleConsole: vi.fn(() => ({ ports: 'console' })),
}));
vi.mock('../../../src/server/console/utilisateurs/administration', () => ({
  ErreurAdministrationConsole: h.ErreurAdministrationConsole,
  changerLeRole: vi.fn(),
  desactiver: vi.fn(),
  inviter: vi.fn(),
  reactiver: vi.fn(),
  relancer: vi.fn(),
  validerLAdministrateur: vi.fn(),
}));

import { requireRole, type MotifDeRefusConsole } from '../../../src/server/roles/require-role';
import * as G from '../../../src/server/console/utilisateurs/administration';
import {
  changerLeRoleDe,
  desactiverLeCompte,
  inviterUnePersonne,
  reactiverLeCompte,
  relancerLInvitation,
  validerUnAdministrateur,
} from '../../../src/server/console/utilisateurs/actions';

const ACTEUR = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' as const };
const CIBLE = '0190f0f0-0000-7000-8000-0000000000c1';
const ECRAN = '/console/utilisateurs';
const COURRIEL = { a: 'x@exemple.test', sujet: 's', corps: 'c', gabarit: 'admin_cree' as const };

const formulaire = (champs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
};

/** Où l'action a redirigé ; une action de serveur finit TOUJOURS par une redirection ici. */
async function vers(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof h.Redirection) return e.vers;
    throw e;
  }
  throw new Error('aucune redirection');
}

const admis = () => vi.mocked(requireRole).mockResolvedValue({ ok: true, utilisateur: ACTEUR });
const refuse = (motif: MotifDeRefusConsole) =>
  vi.mocked(requireRole).mockResolvedValue({ ok: false, motif });

/** Les actions à une seule cible, et le geste que chacune appelle. */
const SIMPLES = [
  ['desactiverLeCompte', desactiverLeCompte, () => vi.mocked(G.desactiver)],
  ['relancerLInvitation', relancerLInvitation, () => vi.mocked(G.relancer)],
  ['validerUnAdministrateur', validerUnAdministrateur, () => vi.mocked(G.validerLAdministrateur)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  h.planifie.length = 0;
  h.jeton.valeur = 'JETON';
  vi.mocked(G.changerLeRole).mockResolvedValue({ courriels: [COURRIEL] });
  vi.mocked(G.reactiver).mockResolvedValue({ courriels: [COURRIEL] });
  vi.mocked(G.inviter).mockResolvedValue({ id: CIBLE, courriels: [COURRIEL, COURRIEL] });
});

describe('REQ-SEC-023 — chaque action demande son droit AVANT tout travail', () => {
  const toutes = [
    ...SIMPLES.map(([nom, a]) => [nom, () => a(formulaire({ cibleId: CIBLE }))] as const),
    ['reactiverLeCompte', () => reactiverLeCompte(formulaire({ cibleId: CIBLE }))] as const,
    [
      'changerLeRoleDe',
      () => changerLeRoleDe(formulaire({ cibleId: CIBLE, role: 'comptable' })),
    ] as const,
    [
      'inviterUnePersonne',
      () => inviterUnePersonne(formulaire({ email: 'n@exemple.test', role: 'lecteur' })),
    ] as const,
  ];

  it.each(toutes)(
    'REQ-SEC-023 : TÉMOIN — %s : le relèvement manquant renvoie à la connexion, l’écran en suite ; tout autre refus, à l’accueil ; aucun geste',
    async (_nom, agir) => {
      refuse('releve_requis');
      expect(await vers(agir())).toBe('/console/connexion?suite=%2Fconsole%2Futilisateurs');
      refuse('role_refuse');
      expect(await vers(agir())).toBe('/console');
      expect(requireRole).toHaveBeenCalledWith('action:gerer_utilisateur_console', 'JETON', {
        ports: 'console',
      });
      for (const g of [
        G.desactiver,
        G.relancer,
        G.validerLAdministrateur,
        G.reactiver,
        G.changerLeRole,
        G.inviter,
      ])
        expect(vi.mocked(g)).not.toHaveBeenCalled();
    }
  );

  it('REQ-SEC-023 : sans cookie, le juge reçoit un jeton absent', async () => {
    h.jeton.valeur = undefined;
    refuse('inconnue');
    expect(await vers(desactiverLeCompte(formulaire({ cibleId: CIBLE })))).toBe('/console');
    expect(requireRole).toHaveBeenCalledWith('action:gerer_utilisateur_console', undefined, {
      ports: 'console',
    });
  });
});

describe('REQ-SEC-023 — le geste reçoit ses arguments exacts ; l’écran revient avec un motif fermé', () => {
  it.each(SIMPLES)(
    'REQ-SEC-023 : TÉMOIN À DEUX FACES — %s : admis, le geste part et l’écran revient ; refusé par la règle, le motif nommé',
    async (_nom, agir, geste) => {
      admis();
      expect(await vers(agir(formulaire({ cibleId: CIBLE })))).toBe(ECRAN);
      expect(geste()).toHaveBeenCalledWith(h.D.prisma, {
        acteur: ACTEUR,
        cibleId: CIBLE,
        maintenant: new Date(h.MAINTENANT),
      });
      geste().mockRejectedValueOnce(new h.ErreurAdministrationConsole('propre_compte'));
      expect(await vers(agir(formulaire({ cibleId: CIBLE })))).toBe(`${ECRAN}?refus=propre_compte`);
      // Une autre erreur n'est pas un refus de la règle : elle remonte.
      geste().mockRejectedValueOnce(new Error('panne'));
      await expect(agir(formulaire({ cibleId: CIBLE }))).rejects.toThrow('panne');
      // Un champ absent vaut une chaîne vide, jamais `null`.
      admis();
      await vers(agir(formulaire({})));
      expect(geste()).toHaveBeenLastCalledWith(
        h.D.prisma,
        expect.objectContaining({ cibleId: '' })
      );
    }
  );

  it('REQ-SEC-023 : TÉMOIN — réactiver transmet les clés et confie ses courriels à l’envoi d’après la réponse', async () => {
    admis();
    expect(await vers(reactiverLeCompte(formulaire({ cibleId: CIBLE })))).toBe(ECRAN);
    expect(G.reactiver).toHaveBeenCalledWith(h.D.prisma, {
      acteur: ACTEUR,
      cibleId: CIBLE,
      maintenant: new Date(h.MAINTENANT),
      cles: { cles: 'test' },
    });
    expect(h.envoyer).not.toHaveBeenCalled();
    expect(h.planifie).toHaveLength(1);
    await h.planifie[0]!();
    expect(h.envoyer).toHaveBeenCalledWith(COURRIEL);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — changer un rôle : un rôle hors de l’enum revient « saisie » sans geste ; un rôle de l’enum part, ses courriels après la réponse', async () => {
    admis();
    expect(await vers(changerLeRoleDe(formulaire({ cibleId: CIBLE, role: 'superadmin' })))).toBe(
      `${ECRAN}?refus=saisie`
    );
    expect(await vers(changerLeRoleDe(formulaire({ cibleId: CIBLE })))).toBe(
      `${ECRAN}?refus=saisie`
    );
    expect(G.changerLeRole).not.toHaveBeenCalled();
    expect(await vers(changerLeRoleDe(formulaire({ cibleId: CIBLE, role: 'comptable' })))).toBe(
      ECRAN
    );
    expect(G.changerLeRole).toHaveBeenCalledWith(h.D.prisma, {
      acteur: ACTEUR,
      cibleId: CIBLE,
      vers: 'comptable',
      maintenant: new Date(h.MAINTENANT),
      cles: { cles: 'test' },
    });
    await h.planifie[0]!();
    expect(h.envoyer).toHaveBeenCalledTimes(1);
    vi.mocked(G.changerLeRole).mockRejectedValueOnce(
      new h.ErreurAdministrationConsole('sans_changement')
    );
    expect(await vers(changerLeRoleDe(formulaire({ cibleId: CIBLE, role: 'comptable' })))).toBe(
      `${ECRAN}?refus=sans_changement`
    );
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — inviter : sans adresse ou sans rôle valide, « saisie » ; sinon l’adresse taillée, la connexion SANS jeton, chaque courriel envoyé', async () => {
    admis();
    const saisies: Record<string, string>[] = [
      { email: '   ', role: 'lecteur' },
      { email: 'n@exemple.test', role: 'personne' },
      { role: 'lecteur' },
    ];
    for (const champs of saisies)
      expect(await vers(inviterUnePersonne(formulaire(champs))), JSON.stringify(champs)).toBe(
        `${ECRAN}?refus=saisie`
      );
    expect(G.inviter).not.toHaveBeenCalled();
    expect(
      await vers(inviterUnePersonne(formulaire({ email: '  n@exemple.test  ', role: 'lecteur' })))
    ).toBe(ECRAN);
    expect(G.inviter).toHaveBeenCalledWith(h.D.prisma, {
      acteur: ACTEUR,
      email: 'n@exemple.test',
      role: 'lecteur',
      cles: { cles: 'test' },
      maintenant: new Date(h.MAINTENANT),
      adresseConnexion: 'https://partners.exemple.test/console/connexion',
    });
    expect(h.envoyer).not.toHaveBeenCalled();
    await h.planifie[0]!();
    expect(h.envoyer).toHaveBeenCalledTimes(2);
  });
});
