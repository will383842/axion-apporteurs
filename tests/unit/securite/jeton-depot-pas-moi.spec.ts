// @req REQ-SEC-005
// @req REQ-SEC-006
/**
 * SEC-11 — le jeton de dépôt privé, EN PROCESSUS : son échéance (aucune colonne, `cree_at` plus la
 * SSOT) et le lien « ce n'est pas moi » de l'accusé de dépôt (décision 15 de `partners/ADR-0013`).
 * La base réelle : `tests/integration/jeton-depot.spec.ts`.
 *
 * CE QU'IL PROUVE :
 *   1. L'ÉCHÉANCE se dérive : `cree_at` plus `JETON_DEPOT_DUREE_MOIS` mois ; un jeton révoqué ou échu
 *      ne sert plus ;
 *   2. LA SIGNATURE est un HMAC-SHA-256 sous `MAGIC_LINK_SECRET`, domaine `partners.pas-moi.v1` : un
 *      vecteur figé, calculé hors du code (openssl), et une signature d'un autre domaine refusée ;
 *   3. OUVRIR le lien ne lit ni n'écrit rien : la page de confirmation est la même pour tout lien ;
 *   4. CONFIRMER révoque le jeton nommé, une fois : le même lien rejoué ne révoque pas deux fois (compte
 *      des révocations), et un lien faux, d'une clé retirée ou d'un jeton étranger au dépôt rend la
 *      MÊME réponse sans rien écrire.
 */
import { describe, it, expect } from 'vitest';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  DOMAINE_PAS_MOI,
  PAGE_DE_CONFIRMATION,
  REPONSE_PAS_MOI,
  confirmerPasMoi,
  echeanceDuJeton,
  jetonUtilisable,
  lienPasMoi,
  ouvrirPasMoi,
  signerPasMoi,
  verifierPasMoi,
  type LienPasMoi,
  type PortsDuPasMoi,
} from '../../../src/server/auth/jeton-depot';

const SECRET = 'secret-de-test-du-lien-magique-000000000000';
const KID = 'a1b2c3d4';
const CLE = { secret: SECRET, kid: KID };
const JETON = '11111111-1111-4111-8111-111111111111';
const DEPOT = '22222222-2222-4222-8222-222222222222';
const T0 = new Date('2026-10-03T08:00:00.000Z');

/** Calculé hors du code : printf 'partners.pas-moi.v1\x1f<jeton>\x1f<dépôt>' | openssl dgst -sha256 -hmac <secret>. */
const VECTEUR_PAS_MOI = '4e7d9cbb9c6fe60c5d7b1ab09c1c733d17fdb6ee3651251524175d8379a1a30a';
/** La même entrée sous le domaine du lien de connexion : une signature d'un AUTRE usage. */
const VECTEUR_AUTRE_DOMAINE = 'f2e535c59f5c44ae70d1a7bf33fc9723bfa45c02dc024314ffacc22b4716ceec';

describe('REQ-SEC-005 — l’échéance du jeton se dérive, aucune colonne ne la porte', () => {
  it('REQ-SEC-005 : la durée est celle de la SSOT, douze mois', () => {
    expect(SEUILS.JETON_DEPOT_DUREE_MOIS.valeur).toBe(12);
    expect(SEUILS.JETON_DEPOT_DUREE_MOIS.unite).toBe('mois');
  });

  it('REQ-SEC-005 : l’échéance est cree_at plus douze mois civils, à la même heure UTC', () => {
    expect(echeanceDuJeton(new Date('2026-10-03T08:00:00.000Z')).toISOString()).toBe(
      '2027-10-03T08:00:00.000Z'
    );
    expect(echeanceDuJeton(new Date('2026-01-15T23:30:00.000Z')).toISOString()).toBe(
      '2027-01-15T23:30:00.000Z'
    );
  });

  it('REQ-SEC-005 : un jeton actif sert jusqu’à son échéance exclue ; révoqué ou échu, il ne sert plus', () => {
    const actif = { creeAt: T0, revoqueAt: null };
    const echeance = echeanceDuJeton(T0);
    expect(jetonUtilisable(actif, T0)).toBe(true);
    expect(jetonUtilisable(actif, new Date(echeance.getTime() - 1))).toBe(true);
    expect(jetonUtilisable(actif, echeance)).toBe(false);
    expect(jetonUtilisable({ creeAt: T0, revoqueAt: T0 }, T0)).toBe(false);
  });
});

describe('REQ-SEC-006 — la signature du lien « ce n’est pas moi »', () => {
  it('REQ-SEC-006 : VECTEUR FIGÉ — HMAC-SHA-256 sous le secret du lien, domaine partners.pas-moi.v1', () => {
    expect(DOMAINE_PAS_MOI).toBe('partners.pas-moi.v1');
    expect(signerPasMoi(JETON, DEPOT, SECRET)).toBe(VECTEUR_PAS_MOI);
  });

  it('REQ-SEC-006 : le lien porte le jeton, le dépôt, le kid et la signature — rien d’autre', () => {
    expect(lienPasMoi(JETON, DEPOT, CLE)).toEqual({
      jetonId: JETON,
      depotId: DEPOT,
      kid: KID,
      signature: VECTEUR_PAS_MOI,
    });
  });

  it('REQ-SEC-006 : la bonne signature passe ; une signature d’un autre domaine, d’un autre jeton ou d’un autre dépôt est refusée', () => {
    const bon = lienPasMoi(JETON, DEPOT, CLE);
    expect(verifierPasMoi(bon, CLE)).toBe(true);
    expect(verifierPasMoi({ ...bon, signature: VECTEUR_AUTRE_DOMAINE }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, jetonId: DEPOT }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, depotId: JETON }, CLE)).toBe(false);
  });

  it('REQ-SEC-006 : une clé retirée (autre kid), une signature mal formée ou d’une autre longueur sont refusées', () => {
    const bon = lienPasMoi(JETON, DEPOT, CLE);
    expect(verifierPasMoi({ ...bon, kid: 'ffffffff' }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, signature: VECTEUR_PAS_MOI.toUpperCase() }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, signature: VECTEUR_PAS_MOI.slice(0, 63) }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, signature: `${VECTEUR_PAS_MOI}0` }, CLE)).toBe(false);
    expect(verifierPasMoi({ ...bon, signature: '' }, CLE)).toBe(false);
    // La même signature, sous un AUTRE secret : refusée.
    expect(verifierPasMoi(bon, { secret: `${SECRET}x`, kid: KID })).toBe(false);
  });
});

// ── la confirmation, sur un dépôt simulé qui compte ses révocations ────────────────────────────

function ports(
  jetons: { id: string; apporteurId: string; revoqueAt: Date | null }[],
  depots: { id: string; apporteurId: string }[]
): PortsDuPasMoi & { revocations: string[]; lectures: number } {
  const etat = { revocations: [] as string[], lectures: 0 };
  return {
    cle: CLE,
    maintenant: () => T0,
    get revocations() {
      return etat.revocations;
    },
    get lectures() {
      return etat.lectures;
    },
    async lireJeton(id) {
      etat.lectures += 1;
      return jetons.find((j) => j.id === id) ?? null;
    },
    async lireDepot(id) {
      etat.lectures += 1;
      return depots.find((d) => d.id === id) ?? null;
    },
    async revoquer(id, at) {
      const j = jetons.find((x) => x.id === id && x.revoqueAt === null);
      if (j === undefined) return 0;
      j.revoqueAt = at;
      etat.revocations.push(id);
      return 1;
    },
  };
}

const APPORTEUR = '33333333-3333-4333-8333-333333333333';
const AUTRE = '44444444-4444-4444-8444-444444444444';

describe('REQ-SEC-006 — ouvrir ne révoque rien, confirmer révoque une fois', () => {
  it('REQ-SEC-006 : OUVRIR le lien rend la page de confirmation, la même pour un lien bon ou faux, sans rien lire', () => {
    const bon = lienPasMoi(JETON, DEPOT, CLE);
    expect(ouvrirPasMoi(bon)).toBe(PAGE_DE_CONFIRMATION);
    expect(ouvrirPasMoi({ ...bon, signature: '0'.repeat(64) })).toBe(PAGE_DE_CONFIRMATION);
    expect(Object.isFrozen(PAGE_DE_CONFIRMATION)).toBe(true);
  });

  it('REQ-SEC-006 : TÉMOIN D’IDEMPOTENCE — confirmer révoque le jeton nommé ; rejoué, le même lien ne révoque pas une seconde fois et rend la même réponse', async () => {
    const p = ports(
      [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: null }],
      [{ id: DEPOT, apporteurId: APPORTEUR }]
    );
    const lien = lienPasMoi(JETON, DEPOT, CLE);
    expect(await confirmerPasMoi(lien, p)).toBe(REPONSE_PAS_MOI);
    expect(await confirmerPasMoi(lien, p)).toBe(REPONSE_PAS_MOI);
    expect(p.revocations).toEqual([JETON]);
  });

  it('REQ-SEC-006 : un jeton déjà révoqué par un autre chemin : même réponse, aucune révocation de plus', async () => {
    const p = ports(
      [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: T0 }],
      [{ id: DEPOT, apporteurId: APPORTEUR }]
    );
    expect(await confirmerPasMoi(lienPasMoi(JETON, DEPOT, CLE), p)).toBe(REPONSE_PAS_MOI);
    expect(p.revocations).toEqual([]);
  });

  it('REQ-SEC-006 : un lien faux ne lit rien et n’écrit rien ; un jeton étranger au dépôt, un jeton ou un dépôt inconnus n’écrivent rien — même réponse', async () => {
    const faux = ports(
      [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: null }],
      [{ id: DEPOT, apporteurId: APPORTEUR }]
    );
    expect(
      await confirmerPasMoi({ ...lienPasMoi(JETON, DEPOT, CLE), signature: '0'.repeat(64) }, faux)
    ).toBe(REPONSE_PAS_MOI);
    expect(faux.lectures).toBe(0);
    expect(faux.revocations).toEqual([]);

    const etranger = ports(
      [{ id: JETON, apporteurId: AUTRE, revoqueAt: null }],
      [{ id: DEPOT, apporteurId: APPORTEUR }]
    );
    expect(await confirmerPasMoi(lienPasMoi(JETON, DEPOT, CLE), etranger)).toBe(REPONSE_PAS_MOI);
    expect(etranger.revocations).toEqual([]);

    for (const [jetons, depots] of [
      [[], [{ id: DEPOT, apporteurId: APPORTEUR }]],
      [[{ id: JETON, apporteurId: APPORTEUR, revoqueAt: null }], []],
    ] as const) {
      const p = ports(
        jetons.map((j) => ({ ...j })),
        depots.map((d) => ({ ...d }))
      );
      expect(await confirmerPasMoi(lienPasMoi(JETON, DEPOT, CLE), p)).toBe(REPONSE_PAS_MOI);
      expect(p.revocations).toEqual([]);
    }
  });

  it('REQ-SEC-006 : la réponse ne dit rien de ce qui a été trouvé', () => {
    expect(Object.isFrozen(REPONSE_PAS_MOI)).toBe(true);
    expect(JSON.stringify(REPONSE_PAS_MOI)).not.toMatch(/revoqu|inconnu|faux|deja/i);
  });

  it('REQ-SEC-006 : le lien est typé : jeton, dépôt, kid, signature', () => {
    const l: LienPasMoi = lienPasMoi(JETON, DEPOT, CLE);
    expect(Object.keys(l).sort()).toEqual(['depotId', 'jetonId', 'kid', 'signature']);
  });
});
