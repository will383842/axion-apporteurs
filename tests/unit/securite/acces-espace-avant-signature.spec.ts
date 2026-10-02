// @req REQ-SEC-032
// @req REQ-UX-006
/**
 * SEC-43 — l'espace s'ouvre aux statuts `kyc_en_cours` et `pret_a_signer`, LIMITÉ à « Ma conformité »
 * (`/conformite`) et « Mon contrat » (`/mon-contrat`). Décision D1 de Williams du 2026-10-01.
 *
 * CE QU'IL PROUVE :
 *   1. UN SEUL VERDICT : `niveauDAcces` rend `plein` (signe, suspendu), `limite` (kyc_en_cours,
 *      pret_a_signer) ou `ferme` — tout autre statut du domaine, inconnu, vide ou d'une autre casse,
 *      est fermé (liste blanche) ;
 *   2. LA LISTE BLANCHE DES ROUTES : en ouverture limitée, seules `conformite` et `mon-contrat`
 *      répondent ; toute autre route — clients, attributions, commissions, relevés, dépôt, et toute
 *      route qui n'existe pas encore — est refusée sans modification ;
 *   3. LE REFUS CÔTÉ SERVEUR : la session d'un apporteur `kyc_en_cours` porte son niveau, et
 *      `exigerSessionPour` la refuse sur toute autre route avec le motif nommé
 *      `hors_ouverture_limitee` ; TÉMOIN D'ACTION : l'action de dépôt appelée directement est
 *      refusée AVANT toute écriture ;
 *   4. un `signe` garde l'accès plein ; un `candidat` ou un `refuse` est refusé partout.
 */
import { describe, it, expect } from 'vitest';
import {
  niveauDAcces,
  peutOuvrirLEspace,
  routeOuverte,
} from '../../../src/domain/apporteur/acces-espace';
import { STATUTS_APPORTEUR } from '../../../src/domain/apporteur/statut';
import {
  MOTIFS_DE_REFUS,
  exigerSessionPour,
  jugerSession,
  type LigneDeSession,
  type PortsDeSession,
} from '../../../src/server/auth/session';
import { empreinteDeSession } from '../../../src/server/auth/lien-magique';

const KID = 'a1b2c3d4';
const SECRET = 'secret-de-test-des-sessions-0000000000000';
const JETON = 'jeton-de-session-de-test';
const T0 = new Date('2026-10-02T08:00:00.000Z');

/** Les routes de l'espace qui ne sont ni « Ma conformité » ni « Mon contrat » (ESPACE-ROUTES.md). */
const AUTRES_ROUTES = [
  '',
  'mes-entreprises',
  'mes-commissions',
  'plus',
  'entreprise',
  'deposer',
  'documents',
  'filleuls',
  'profil',
  'notifications',
  'activite',
  'ressources',
  'aide',
  'une-route-qui-n-existe-pas-encore',
];

function ligne(statut: string): LigneDeSession {
  return {
    id: 'session-1',
    apporteurId: 'apporteur-1',
    kid: KID,
    expireAt: new Date(T0.getTime() + 3_600_000),
    revoqueAt: null,
    sessionVersion: 0,
    apporteur: { statut, sessionVersion: 0 },
    lienMagique: { consommeAt: T0 },
  };
}

function ports(statut: string): PortsDeSession {
  const empreinte = empreinteDeSession(JETON, SECRET);
  return {
    maintenant: () => T0,
    configuration: { secret: SECRET, kid: KID },
    depot: {
      lire: async (h) => (h === empreinte ? ligne(statut) : null),
      marquerVue: async () => undefined,
      lister: async () => [],
      revoquer: async () => 0,
      incrementerVersion: async () => undefined,
    },
  };
}

describe('REQ-SEC-032 — un seul verdict à trois niveaux, défaut fermé', () => {
  it('REQ-SEC-032 : plein pour signe et suspendu, limité pour kyc_en_cours et pret_a_signer, fermé pour tout autre statut du domaine', () => {
    const par = (n: string) => STATUTS_APPORTEUR.filter((s) => niveauDAcces(s) === n);
    expect(par('plein')).toEqual(['signe', 'suspendu']);
    expect(par('limite')).toEqual(['kyc_en_cours', 'pret_a_signer']);
    expect(par('ferme')).toEqual(
      STATUTS_APPORTEUR.filter(
        (s) => !['signe', 'suspendu', 'kyc_en_cours', 'pret_a_signer'].includes(s)
      )
    );
  });

  it('REQ-SEC-032 : un statut absent, inconnu, vide ou d’une autre casse est fermé', () => {
    for (const s of [null, 'inconnu', '', 'KYC_EN_COURS', ' signe']) {
      expect(niveauDAcces(s)).toBe('ferme');
      expect(peutOuvrirLEspace(s)).toBe(false);
    }
  });

  it('REQ-SEC-032 : l’ouverture limitée OUVRE l’espace — le lien de connexion et la session ne la refusent plus', () => {
    expect(peutOuvrirLEspace('kyc_en_cours')).toBe(true);
    expect(peutOuvrirLEspace('pret_a_signer')).toBe(true);
  });
});

describe('REQ-UX-006 — la liste blanche des routes en ouverture limitée', () => {
  it('REQ-UX-006 : en ouverture limitée, conformite et mon-contrat répondent, et elles seules', () => {
    expect(routeOuverte('limite', 'conformite')).toBe(true);
    expect(routeOuverte('limite', 'mon-contrat')).toBe(true);
    for (const r of AUTRES_ROUTES) expect(routeOuverte('limite', r), r).toBe(false);
  });

  it('REQ-UX-006 : en ouverture pleine, toute route répond ; fermé, aucune', () => {
    for (const r of [...AUTRES_ROUTES, 'conformite', 'mon-contrat']) {
      expect(routeOuverte('plein', r), r).toBe(true);
      expect(routeOuverte('ferme', r), r).toBe(false);
    }
  });
});

describe('REQ-SEC-032 — le refus est appliqué côté serveur, avec un motif nommé', () => {
  it('REQ-SEC-032 : la session acceptée porte son niveau', () => {
    const v = jugerSession(ligne('kyc_en_cours'), T0, KID);
    expect(v).toMatchObject({ ok: true, session: { niveau: 'limite' } });
    expect(jugerSession(ligne('signe'), T0, KID)).toMatchObject({
      ok: true,
      session: { niveau: 'plein' },
    });
  });

  it('REQ-SEC-032 : `hors_ouverture_limitee` est un motif de la liste fermée', () => {
    expect(MOTIFS_DE_REFUS).toContain('hors_ouverture_limitee');
  });

  it('REQ-SEC-032 : un kyc_en_cours atteint conformite et mon-contrat, et il est refusé sur chaque autre route, motif nommé', async () => {
    for (const r of ['conformite', 'mon-contrat']) {
      expect(await exigerSessionPour(r, JETON, ports('kyc_en_cours'))).toMatchObject({ ok: true });
    }
    for (const r of AUTRES_ROUTES) {
      expect(await exigerSessionPour(r, JETON, ports('pret_a_signer')), r).toEqual({
        ok: false,
        motif: 'hors_ouverture_limitee',
      });
    }
  });

  it('REQ-SEC-032 : un signe garde l’accès plein ; un candidat ou un refuse est refusé partout', async () => {
    for (const r of [...AUTRES_ROUTES, 'conformite', 'mon-contrat']) {
      expect(await exigerSessionPour(r, JETON, ports('signe')), r).toMatchObject({ ok: true });
      for (const s of ['candidat', 'refuse']) {
        expect(await exigerSessionPour(r, JETON, ports(s)), `${s} ${r}`).toEqual({
          ok: false,
          motif: 'statut_ferme',
        });
      }
    }
  });

  it('REQ-SEC-032 : TÉMOIN D’ACTION — un kyc_en_cours qui appelle directement l’action de dépôt est refusé, et rien n’est écrit', async () => {
    const ecrites: unknown[] = [];
    /** Une action de dépôt telle que l'espace doit l'écrire : la session D'ABORD, l'écriture ensuite. */
    const deposer = async (jeton: string, p: PortsDeSession, donnees: unknown) => {
      const v = await exigerSessionPour('deposer', jeton, p);
      if (!v.ok) return v;
      ecrites.push(donnees);
      return v;
    };
    expect(await deposer(JETON, ports('kyc_en_cours'), { siren: '552100554' })).toEqual({
      ok: false,
      motif: 'hors_ouverture_limitee',
    });
    expect(ecrites).toEqual([]);
    // Contre-témoin : le même appel d'un apporteur signé écrit.
    await deposer(JETON, ports('signe'), { siren: '552100554' });
    expect(ecrites).toHaveLength(1);
  });
});
