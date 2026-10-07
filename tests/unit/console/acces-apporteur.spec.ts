// @req REQ-UX-047
// @req REQ-JUR-069
/**
 * SEC-71 — l'écran « Accès de l'apporteur » et son geste, dans la console (contrat v2, art. 3.8).
 * EN PROCESSUS : l'action avec des doubles de Next, du juge des rôles et du geste de révocation ;
 * l'écran rendu en HTML statique. Le geste lui-même (une transaction, l'événement, la file) est jugé
 * par `tests/unit/securite/revocation-acces-apporteur.spec.ts` : ici, ce que l'écran y ajoute — le
 * droit réservé à l'admin sous step-up, posé AVANT tout travail ; le motif de la liste fermée ; les
 * refus nommés renvoyés à l'écran, sans autre donnée ; les états vides de la maquette.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
      env: { NODE_ENV: 'test' },
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
vi.mock('../../../src/server/console/acces-apporteur', async (original) => ({
  ...(await original<typeof import('../../../src/server/console/acces-apporteur')>()),
  revoquerLAccesDUnApporteur: vi.fn(),
}));

import { requireRole, type MotifDeRefusConsole } from '../../../src/server/roles/require-role';
import { MATRICE_DES_ROLES as MATRICE } from '../../../src/server/roles/matrice';
import {
  ErreurRevocationAcces,
  etatDuStatut,
  revoquerLAccesDUnApporteur,
  type EtatDeLAcces,
  type RefusDeRevocation,
} from '../../../src/server/console/acces-apporteur';
import { revoquerLAcces } from '../../../src/app/(console)/console/apporteurs/[id]/acces/_acces/actions';
import {
  ChargementAccesApporteur,
  EcranAccesApporteur,
  ErreurAccesApporteur,
} from '../../../src/app/(console)/console/apporteurs/[id]/acces/_acces/ecran';
import { ACCES_APPORTEUR as T } from '../../../src/content/micro-copy/console/acces-apporteur';

const ADMIN = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' as const };
const APPORTEUR = '0190f0f0-0000-7000-8000-0000000000e1';
const ECRAN = `/console/apporteurs/${APPORTEUR}/acces`;

function formulaire(o: { apporteurId?: string; motif?: string } = {}): FormData {
  const f = new FormData();
  f.set('apporteurId', o.apporteurId ?? APPORTEUR);
  f.set('motif', o.motif ?? 'signalement_apporteur');
  return f;
}

/** L'adresse où l'action renvoie : elle ne revient jamais autrement (redirection). */
async function destination(f: FormData): Promise<string> {
  try {
    await revoquerLAcces(f);
  } catch (e) {
    if (e instanceof h.Redirection) return e.vers;
    throw e;
  }
  throw new Error('aucune redirection');
}

const accorde = () => vi.mocked(requireRole).mockResolvedValue({ ok: true, utilisateur: ADMIN });
const refuse = (motif: MotifDeRefusConsole) =>
  vi.mocked(requireRole).mockResolvedValue({ ok: false, motif });

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(revoquerLAccesDUnApporteur).mockReset();
  vi.mocked(revoquerLAccesDUnApporteur).mockResolvedValue({
    appareilsOublies: 1,
    liensAnnules: 1,
    jetonsRevoques: 1,
  });
});

describe('REQ-JUR-069 — le geste de la console : admin seul, step-up, motif fermé', () => {
  it('REQ-JUR-069 : TÉMOIN — la matrice réserve le geste à l’admin SOUS step-up, et l’écran à l’admin', () => {
    expect(MATRICE['action:revoquer_acces_apporteur']).toEqual({ roles: ['admin'], stepUp: true });
    expect(MATRICE['ecran:acces_apporteur']).toEqual({ roles: ['admin'], stepUp: false });
  });

  it('REQ-JUR-069 : TÉMOIN — le droit est posé AVANT tout travail, avec la question de l’action', async () => {
    accorde();
    expect(await destination(formulaire())).toBe(`${ECRAN}?fait=revoque`);
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe('action:revoquer_acces_apporteur');
    expect(vi.mocked(revoquerLAccesDUnApporteur).mock.calls[0]![1]).toEqual({
      acteur: ADMIN,
      apporteurId: APPORTEUR,
      motif: 'signalement_apporteur',
      maintenant: new Date(1_803_031_200_000),
    });
  });

  it('REQ-JUR-069 : TÉMOIN — une session trop ancienne revient à la connexion, l’écran en suite ; tout autre refus de rôle, à l’accès refusé ; rien n’est révoqué', async () => {
    refuse('releve_requis');
    expect(await destination(formulaire())).toBe(
      `/console/connexion?suite=${encodeURIComponent(ECRAN)}`
    );
    for (const motif of ['droit_absent', 'role_refuse', 'admin_en_attente'] as const) {
      refuse(motif);
      expect(await destination(formulaire())).toBe('/console/acces-refuse');
    }
    expect(revoquerLAccesDUnApporteur).not.toHaveBeenCalled();
  });

  it('REQ-JUR-069 : TÉMOIN — un motif hors des deux revient à l’écran, refus nommé, sans rien révoquer', async () => {
    accorde();
    for (const motif of ['', 'sanction', 'SECURITE'])
      expect(await destination(formulaire({ motif }))).toBe(`${ECRAN}?refus=motif_invalide`);
    expect(revoquerLAccesDUnApporteur).not.toHaveBeenCalled();
  });

  it('REQ-JUR-069 : TÉMOIN — un identifiant hors forme n’atteint pas le geste', async () => {
    accorde();
    expect(await destination(formulaire({ apporteurId: '../x' }))).toBe('/console/acces-refuse');
    expect(revoquerLAccesDUnApporteur).not.toHaveBeenCalled();
  });

  it.each(['contrat_termine', 'sans_acces', 'apporteur_inconnu', 'droit_absent'] as const)(
    'REQ-JUR-069 : TÉMOIN — le refus %s du geste revient à l’écran, son motif en paramètre FERMÉ',
    async (motif) => {
      accorde();
      vi.mocked(revoquerLAccesDUnApporteur).mockRejectedValue(new ErreurRevocationAcces(motif));
      expect(await destination(formulaire())).toBe(`${ECRAN}?refus=${motif}`);
    }
  );
});

describe('REQ-UX-047 — l’écran « Accès de l’apporteur » : les états de la maquette', () => {
  const texteDe = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const rendre = (
    etat: EtatDeLAcces,
    o: { refus?: RefusDeRevocation | null; revoque?: boolean } = {}
  ) =>
    renderToStaticMarkup(
      createElement(EcranAccesApporteur, {
        apporteurId: APPORTEUR,
        etat,
        refus: o.refus ?? null,
        revoque: o.revoque ?? false,
        revoquer: async () => {},
      })
    );

  it('REQ-UX-047 : TÉMOIN — le formulaire : les deux motifs fermés, un bouton, l’apporteur porté en champ caché', () => {
    const html = rendre('sous_contrat');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('value="signalement_apporteur"');
    expect(html).toContain('value="securite"');
    expect(html).toContain(`name="apporteurId" value="${APPORTEUR}"`);
    expect(texteDe(html)).toContain(T.revoquer);
    expect(texteDe(html)).toContain(T.statuts.sous_contrat);
    expect(texteDe(html)).not.toMatch(/sanction appliquée|suspendu/i);
  });

  it('REQ-UX-047 : avant la signature, le statut dit le dossier d’inscription', () => {
    expect(texteDe(rendre('avant_signature'))).toContain(T.statuts.avant_signature);
  });

  it('REQ-UX-047 : TÉMOIN — le retour du geste, et chaque refus nommé, sans rien de l’accès', () => {
    expect(texteDe(rendre('sous_contrat', { revoque: true }))).toContain(T.revoque);
    for (const refus of Object.keys(T.refus) as RefusDeRevocation[]) {
      const html = rendre('sous_contrat', { refus });
      expect(html).toContain('role="alert"');
      expect(texteDe(html)).toContain(T.refus[refus]);
    }
  });

  it.each(['contrat_termine', 'sans_acces', 'introuvable'] as const)(
    'REQ-UX-047 : TÉMOIN — l’état vide %s : aucun formulaire, sa phrase et son geste suivant',
    (etat) => {
      const html = rendre(etat);
      expect(html).not.toContain('type="radio"');
      expect(texteDe(html)).toContain(T.vides[etat].titre);
      expect(texteDe(html)).toContain(T.vides[etat].phrase);
    }
  );

  it('REQ-UX-047 : le chargement est annoncé, l’erreur dit que rien n’est parti et propose de réessayer', () => {
    expect(renderToStaticMarkup(createElement(ChargementAccesApporteur))).toContain(
      'role="status"'
    );
    const erreur = renderToStaticMarkup(
      createElement(ErreurAccesApporteur, { reessayer: () => {} })
    );
    expect(texteDe(erreur)).toContain(T.erreur.phrase);
    expect(erreur).toContain('role="alert"');
  });

  it('REQ-JUR-069 : TÉMOIN — l’état de l’écran suit la MÊME règle que le geste, statut par statut', () => {
    expect(etatDuStatut(null)).toBe('introuvable');
    expect(etatDuStatut('resilie')).toBe('contrat_termine');
    for (const s of ['candidat', 'retenu', 'vivier', 'refuse'])
      expect(etatDuStatut(s)).toBe('sans_acces');
    for (const s of ['kyc_en_cours', 'pret_a_signer'])
      expect(etatDuStatut(s)).toBe('avant_signature');
    for (const s of ['signe', 'suspendu']) expect(etatDuStatut(s)).toBe('sous_contrat');
  });
});
