// @req REQ-JUR-007
// @req REQ-DM-043
/**
 * DM-71 — le geste SERVEUR de l'annulation après la confirmation (art. 3.3 du v2 ; arbitrage de la
 * coordination, #806 6039852465 ; conditions de la sécurité, rattrapage 119) :
 *   — le droit `action:annuler_apres_confirmation`, administrateur seul, sous step-up ;
 *   — le droit RELU en base dans la transaction : inconnu, désactivé, rôle retiré, admin non validé
 *     sont refusés, sans rien écrire ;
 *   — une attribution NON confirmée est refusée (l'antériorité ou la console y suffisent) ;
 *   — l'idempotence par l'état : la même exception sur une attribution déjà annulée rend l'issue
 *     existante ; une exception différente est refusée et nommée ;
 *   — la transition passe par l'écrivain unique, avec l'acteur HUMAIN.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  annulerApresConfirmation,
  ErreurAnnulationApresConfirmation,
} from '../../../src/server/attribution/annuler-apres-confirmation';
import { MATRICE_DES_ROLES } from '../../../src/server/roles/matrice';

const ADMIN = '0190f0c2-0000-7000-8000-0000000000a1';
const ATTRIBUTION = '0190f0c2-0000-7000-8000-0000000000b1';
const MAINTENANT = new Date('2026-10-08T09:00:00.000Z');
const VALIDE = new Date('2026-09-01T00:00:00.000Z');

type Ligne = { statut: string; confirmee_at: Date | null; annulation_exception: string | null };

function unDouble(o: {
  utilisateur?: { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;
  ligne?: Ligne | null;
}) {
  const appels: string[] = [];
  const tx = {
    utilisateurConsole: {
      findUnique: vi.fn(async () =>
        o.utilisateur === undefined
          ? { role: 'admin', desactiveAt: null, valideAt: VALIDE }
          : o.utilisateur
      ),
    },
    $queryRaw: vi.fn(async () => {
      appels.push('verrou');
      const l =
        o.ligne === undefined
          ? { statut: 'signee', confirmee_at: VALIDE, annulation_exception: null }
          : o.ligne;
      return l === null ? [] : [l];
    }),
  };
  const transitionner = vi.fn(async (_tx: unknown, d: { transition: string }) => {
    appels.push(`transition:${d.transition}`);
    return { de: 'signee' as const, vers: 'annulee' as const };
  });
  return { tx: tx as never, appels, transitionner };
}

const motif = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurAnnulationApresConfirmation) return e.motif;
    throw e;
  }
  return 'aucun refus';
};

const geste = (d: ReturnType<typeof unDouble>, exception: 'erreur_identification' | 'fraude') =>
  annulerApresConfirmation(
    d.tx,
    { attributionId: ATTRIBUTION, exception, acteur: { id: ADMIN }, maintenant: MAINTENANT },
    { transitionner: d.transitionner }
  );

describe('REQ-JUR-007 — le droit du geste (sécurité, condition 2)', () => {
  it('REQ-JUR-007 : TÉMOIN — `action:annuler_apres_confirmation` : l’administrateur seul, sous step-up', () => {
    expect(MATRICE_DES_ROLES['action:annuler_apres_confirmation']).toEqual({
      roles: ['admin'],
      stepUp: true,
    });
  });

  const T = new Date('2026-09-01T00:00:00Z');
  it.each([
    ['inconnu', null],
    ['désactivé', { role: 'admin', desactiveAt: T, valideAt: T }],
    ['rôle retiré', { role: 'qualifieur', desactiveAt: null, valideAt: T }],
    ['administrateur non validé', { role: 'admin', desactiveAt: null, valideAt: null }],
  ] as const)('REQ-JUR-007 : TÉMOIN — un compte %s est refusé, sans verrou ni écriture', async (_c, utilisateur) => {
    const d = unDouble({ utilisateur });
    expect(await motif(geste(d, 'erreur_identification'))).toBe('droit_absent');
    expect(d.appels).toEqual([]);
  });
});

describe('REQ-JUR-007 — le geste, après la confirmation seulement', () => {
  it('REQ-JUR-007 : TÉMOIN — chaque exception écrit SA transition, par l’écrivain unique, avec l’acteur humain', async () => {
    for (const [exception, transition] of [
      ['erreur_identification', 'annulee_erreur_identification'],
      ['fraude', 'fraude_etablie'],
    ] as const) {
      const d = unDouble({});
      expect(await geste(d, exception)).toEqual({ issue: 'annulee' });
      expect(d.appels).toEqual(['verrou', `transition:${transition}`]);
      expect(d.transitionner.mock.calls[0]![1]).toEqual({
        attributionId: ATTRIBUTION,
        transition,
        acteur: { par: 'utilisateur_console', id: ADMIN },
        maintenant: MAINTENANT,
      });
    }
  });

  it('REQ-JUR-007 : TÉMOIN — une attribution NON confirmée est refusée, rien n’est écrit', async () => {
    const d = unDouble({ ligne: { statut: 'provisoire', confirmee_at: null, annulation_exception: null } });
    expect(await motif(geste(d, 'fraude'))).toBe('non_confirmee');
    expect(d.transitionner).not.toHaveBeenCalled();
  });

  it('REQ-JUR-007 : une attribution introuvable est refusée', async () => {
    const d = unDouble({ ligne: null });
    expect(await motif(geste(d, 'fraude'))).toBe('attribution_introuvable');
  });
});

describe('REQ-JUR-007 — l’idempotence, par l’état (A02 : `annulee` est terminal, le marqueur immuable)', () => {
  it('REQ-JUR-007 : TÉMOIN — la MÊME exception sur une attribution déjà annulée rend l’issue existante, sans rien écrire', async () => {
    const d = unDouble({
      ligne: { statut: 'annulee', confirmee_at: VALIDE, annulation_exception: 'fraude' },
    });
    expect(await geste(d, 'fraude')).toEqual({ issue: 'deja_annulee' });
    expect(d.transitionner).not.toHaveBeenCalled();
  });

  it('REQ-JUR-007 : TÉMOIN — une exception DIFFÉRENTE, ou une annulation sans exception, est refusée et nommée', async () => {
    for (const annulation_exception of ['erreur_identification', null]) {
      const d = unDouble({
        ligne: { statut: 'annulee', confirmee_at: VALIDE, annulation_exception },
      });
      expect(await motif(geste(d, 'fraude'))).toBe('deja_annulee_autrement');
      expect(d.transitionner).not.toHaveBeenCalled();
    }
  });
});
