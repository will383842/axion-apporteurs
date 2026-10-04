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
 *      des révocations), et un lien faux, d'une clé retirée, d'un jeton étranger au dépôt ou d'un jeton
 *      qui n'a pas porté ce dépôt rend la MÊME réponse sans rien écrire ;
 *   5. LES FONCTIONS DE BASE, sur un client simulé qui rejoue la transaction (Stryker ne lance pas
 *      la base réelle) : statut relu SOUS VERROU, émission réservée à l'ouverture pleine, refus
 *      d'unicité traduit, régénération annulée en bloc, résiliation seule révoque, recherche par
 *      empreinte. Les mêmes promesses, en base réelle : `tests/integration/jeton-depot.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { empreinteJetonDepot } from '../../../src/domain/apporteur/identifiants';
import {
  DOMAINE_PAS_MOI,
  ErreurEmissionJeton,
  INDEX_UN_ACTIF_PAR_APPORTEUR,
  emettreJetonDepot,
  portsDuPasMoi,
  regenererJetonDepot,
  revoquerJetonsALaResiliation,
  trouverJetonUtilisable,
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
  depots: { id: string; apporteurId: string; jetonDepotId: string | null }[]
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
const AUTRE_JETON = '55555555-5555-4555-8555-555555555555';

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
      [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId: JETON }]
    );
    const lien = lienPasMoi(JETON, DEPOT, CLE);
    expect(await confirmerPasMoi(lien, p)).toBe(REPONSE_PAS_MOI);
    expect(await confirmerPasMoi(lien, p)).toBe(REPONSE_PAS_MOI);
    expect(p.revocations).toEqual([JETON]);
  });

  it('REQ-SEC-006 : un jeton déjà révoqué par un autre chemin : même réponse, aucune révocation de plus', async () => {
    const p = ports(
      [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: T0 }],
      [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId: JETON }]
    );
    expect(await confirmerPasMoi(lienPasMoi(JETON, DEPOT, CLE), p)).toBe(REPONSE_PAS_MOI);
    expect(p.revocations).toEqual([]);
  });

  it('REQ-SEC-006 : un lien faux ne lit rien et n’écrit rien ; un jeton étranger au dépôt, un jeton ou un dépôt inconnus n’écrivent rien — même réponse', async () => {
    const faux = ports(
      [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: null }],
      [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId: JETON }]
    );
    expect(
      await confirmerPasMoi({ ...lienPasMoi(JETON, DEPOT, CLE), signature: '0'.repeat(64) }, faux)
    ).toBe(REPONSE_PAS_MOI);
    expect(faux.lectures).toBe(0);
    expect(faux.revocations).toEqual([]);

    const etranger = ports(
      [{ id: JETON, apporteurId: AUTRE, revoqueAt: null }],
      [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId: JETON }]
    );
    expect(await confirmerPasMoi(lienPasMoi(JETON, DEPOT, CLE), etranger)).toBe(REPONSE_PAS_MOI);
    expect(etranger.revocations).toEqual([]);

    for (const [jetons, depots] of [
      [[], [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId: JETON }]],
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

  it('REQ-SEC-006 : face ROUGE — un dépôt porté par un AUTRE jeton du même apporteur, ou par aucun : rien n’est révoqué', async () => {
    for (const jetonDepotId of [AUTRE_JETON, null]) {
      const p = ports(
        [{ id: JETON, apporteurId: APPORTEUR, revoqueAt: null }],
        [{ id: DEPOT, apporteurId: APPORTEUR, jetonDepotId }]
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

// ── les fonctions de base, sur un client simulé ─────────────────────────────────────────────────

interface LigneJeton {
  id: string;
  apporteurId: string;
  tokenHash: string;
  creeAt: Date;
  revoqueAt: Date | null;
}

/**
 * Un client simulé, assez fidèle pour juger les fonctions : `$transaction` rejoue le corps sur une
 * COPIE de l'état et ne la valide qu'au succès ; `create` refuse un second jeton actif comme
 * l'index partiel (P2002, cible `apporteur_id`) et une empreinte en double (cible `token_hash`).
 */
function client(statuts: Record<string, string>, initiaux: LigneJeton[] = []) {
  const etat = { jetons: initiaux.map((j) => ({ ...j })), requetes: [] as string[], suivant: 0 };
  const refusUnicite = (cible: string) =>
    new Prisma.PrismaClientKnownRequestError('refus', {
      code: 'P2002',
      clientVersion: 'témoin',
      meta: { target: [cible] },
    });
  const tx = (jetons: LigneJeton[]) => ({
    async $queryRaw(gabarit: TemplateStringsArray, ...valeurs: unknown[]) {
      etat.requetes.push(gabarit.join('?'));
      const statut = statuts[String(valeurs[0])];
      return statut === undefined ? [] : [{ statut }];
    },
    jetonDepot: {
      async create({ data }: { data: { apporteurId: string; tokenHash: string; creeAt: Date } }) {
        if (jetons.some((j) => j.tokenHash === data.tokenHash)) throw refusUnicite('token_hash');
        if (jetons.some((j) => j.apporteurId === data.apporteurId && j.revoqueAt === null)) {
          throw refusUnicite('apporteur_id');
        }
        etat.suivant += 1;
        const ligne = { id: `jeton-${etat.suivant}`, revoqueAt: null, ...data };
        jetons.push(ligne);
        return { id: ligne.id };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id?: string; apporteurId?: string; revoqueAt: null };
        data: { revoqueAt: Date };
      }) {
        const cibles = jetons.filter(
          (j) =>
            j.revoqueAt === null &&
            (where.id === undefined || j.id === where.id) &&
            (where.apporteurId === undefined || j.apporteurId === where.apporteurId)
        );
        for (const j of cibles) j.revoqueAt = data.revoqueAt;
        return { count: cibles.length };
      },
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; tokenHash?: string };
        select: Record<string, boolean>;
      }) {
        const j = jetons.find((x) => x.id === where.id || x.tokenHash === where.tokenHash);
        if (j === undefined) return null;
        return Object.fromEntries(Object.keys(select).map((k) => [k, j[k as keyof LigneJeton]]));
      },
    },
    attribution: {
      async findUnique({ where }: { where: { id: string } }) {
        return where.id === DEPOT ? { apporteurId: APPORTEUR, jetonDepotId: 'jeton-1' } : null;
      },
    },
  });
  const racine = {
    ...tx(etat.jetons),
    async $transaction<T>(corps: (t: ReturnType<typeof tx>) => Promise<T>): Promise<T> {
      const copie = etat.jetons.map((j) => ({ ...j }));
      const r = await corps(tx(copie));
      etat.jetons.splice(0, etat.jetons.length, ...copie);
      return r;
    },
  };
  return { prisma: racine as unknown as PrismaClient, etat, tx: () => tx(etat.jetons) };
}

/** 32 octets écrits : le clair attendu se recalcule hors du code. */
const OCTETS = (n: number) => new Uint8Array(n).fill(7);
const CLAIR_ECRIT = Buffer.from(new Uint8Array(32).fill(7)).toString('base64url');
const ctx = (maintenant: Date) => ({ source: OCTETS, maintenant });
const T1 = new Date('2026-11-03T08:00:00.000Z');

async function codeDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e instanceof ErreurEmissionJeton ? e.code : e;
  }
  return 'aucun refus';
}

describe('REQ-SEC-005 — émettre : l’empreinte seule, réservée à l’ouverture pleine', () => {
  it('REQ-SEC-005 : l’index nommé est celui de la migration', () => {
    expect(INDEX_UN_ACTIF_PAR_APPORTEUR).toBe('jetons_depot_un_actif_par_apporteur');
  });

  it('REQ-SEC-005 : un apporteur signé reçoit un jeton : le clair une fois, l’empreinte en base, créé à l’instant passé', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' });
    const j = await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    expect(j).toEqual({ id: 'jeton-1', clair: CLAIR_ECRIT });
    expect(etat.jetons).toEqual([
      {
        id: 'jeton-1',
        apporteurId: APPORTEUR,
        tokenHash: empreinteJetonDepot(CLAIR_ECRIT),
        creeAt: T0,
        revoqueAt: null,
      },
    ]);
  });

  it('REQ-SEC-005 : le statut se relit SOUS VERROU de la ligne de l’apporteur, dans la transaction', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' });
    await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    expect(etat.requetes).toHaveLength(1);
    expect(etat.requetes[0]).toMatch(
      /SELECT statut::text AS statut FROM apporteurs WHERE id = \?::uuid FOR UPDATE/
    );
  });

  it('REQ-SEC-005 : un apporteur suspendu reçoit un jeton (la suspension ne coupe rien)', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'suspendu' });
    await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    expect(etat.jetons).toHaveLength(1);
  });

  it.each(['resilie', 'candidat', 'retenu', 'vivier', 'refuse', 'kyc_en_cours', 'pret_a_signer'])(
    'REQ-SEC-005 : face ROUGE — un apporteur au statut %s ne reçoit aucun jeton',
    async (statut) => {
      const { prisma, etat } = client({ [APPORTEUR]: statut });
      expect(await codeDe(emettreJetonDepot(prisma, APPORTEUR, ctx(T0)))).toBe('statut_sans_jeton');
      expect(etat.jetons).toEqual([]);
    }
  );

  it('REQ-SEC-005 : face ROUGE — un apporteur inconnu ne reçoit aucun jeton', async () => {
    const { prisma, etat } = client({});
    expect(await codeDe(emettreJetonDepot(prisma, APPORTEUR, ctx(T0)))).toBe('statut_sans_jeton');
    expect(etat.jetons).toEqual([]);
  });

  it('REQ-SEC-005 : un second jeton actif : le refus de la base devient « jeton_actif_existant »', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' });
    await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    const e = await codeDe(
      emettreJetonDepot(prisma, APPORTEUR, {
        source: (n) => new Uint8Array(n).fill(9),
        maintenant: T0,
      })
    );
    expect(e).toBe('jeton_actif_existant');
    expect(etat.jetons).toHaveLength(1);
    const err = new ErreurEmissionJeton('jeton_actif_existant');
    expect(err.name).toBe('ErreurEmissionJeton');
    expect(err.message).toBe('jeton_actif_existant : aucun jeton de dépôt émis');
  });

  it('REQ-SEC-005 : un autre refus d’unicité (empreinte) n’est PAS traduit : il remonte tel quel', async () => {
    const { prisma } = client({ [APPORTEUR]: 'signe', [AUTRE]: 'signe' });
    await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    const e = await codeDe(emettreJetonDepot(prisma, AUTRE, ctx(T0)));
    expect(e).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((e as Prisma.PrismaClientKnownRequestError).meta).toEqual({ target: ['token_hash'] });
  });

  /** Un client dont l'insertion REJETTE l'erreur donnée : le reste du client est celui du témoin. */
  function insertionQuiRejette(erreur: unknown): PrismaClient {
    const brut = client({ [APPORTEUR]: 'signe' });
    const t = brut.tx();
    return {
      $transaction: <T>(corps: (x: unknown) => Promise<T>) =>
        corps({ ...t, jetonDepot: { ...t.jetonDepot, create: () => Promise.reject(erreur) } }),
    } as unknown as PrismaClient;
  }

  it('REQ-SEC-005 : une erreur qui n’est pas un refus d’unicité sur l’apporteur remonte telle quelle', async () => {
    const autreCode = new Prisma.PrismaClientKnownRequestError('panne', {
      code: 'P2034',
      clientVersion: 'témoin',
      meta: { target: ['apporteur_id'] },
    });
    const sansCible = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: 'témoin',
    });
    const horsPrisma = new Error('apporteur_id');
    for (const erreur of [autreCode, sansCible, horsPrisma]) {
      expect(await codeDe(emettreJetonDepot(insertionQuiRejette(erreur), APPORTEUR, ctx(T0)))).toBe(
        erreur
      );
    }
  });

  it('REQ-SEC-005 : le refus nommé par l’index lui-même est traduit aussi', async () => {
    const parIndex = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: 'témoin',
      meta: { target: 'jetons_depot_un_actif_par_apporteur' },
    });
    expect(await codeDe(emettreJetonDepot(insertionQuiRejette(parIndex), APPORTEUR, ctx(T0)))).toBe(
      'jeton_actif_existant'
    );
  });
});

describe('REQ-SEC-005 — régénérer : révoquer puis émettre, en bloc', () => {
  const ancien = (apporteurId: string): LigneJeton => ({
    id: `ancien-${apporteurId}`,
    apporteurId,
    tokenHash: empreinteJetonDepot(`clair-${apporteurId}`),
    creeAt: T0,
    revoqueAt: null,
  });

  it('REQ-SEC-005 : l’ancien est révoqué à l’instant passé, le nouveau seul est actif ; l’autre apporteur n’est pas touché', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' }, [ancien(APPORTEUR), ancien(AUTRE)]);
    const j = await regenererJetonDepot(prisma, APPORTEUR, ctx(T1));
    expect(j.clair).toBe(CLAIR_ECRIT);
    expect(etat.jetons.map((x) => [x.id, x.revoqueAt])).toEqual([
      [`ancien-${APPORTEUR}`, T1],
      [`ancien-${AUTRE}`, null],
      ['jeton-1', null],
    ]);
    expect(etat.requetes[0]).toMatch(/FOR UPDATE/);
  });

  it('REQ-SEC-005 : face ROUGE — une émission qui échoue annule la révocation : l’ancien reste actif', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' }, [ancien(APPORTEUR)]);
    const e = await codeDe(
      regenererJetonDepot(prisma, APPORTEUR, {
        source: (n) => new Uint8Array(n - 1),
        maintenant: T1,
      })
    );
    expect(e).toBeInstanceOf(RangeError);
    expect(etat.jetons.map((x) => x.revoqueAt)).toEqual([null]);
  });

  it('REQ-SEC-005 : face ROUGE — un apporteur résilié ne régénère pas, rien ne bouge', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'resilie' }, [ancien(APPORTEUR)]);
    expect(await codeDe(regenererJetonDepot(prisma, APPORTEUR, ctx(T1)))).toBe('statut_sans_jeton');
    expect(etat.jetons).toHaveLength(1);
    expect(etat.jetons[0]?.revoqueAt).toBeNull();
  });
});

describe('REQ-SEC-005 — la résiliation révoque, la suspension jamais', () => {
  const actif = (apporteurId: string): LigneJeton => ({
    id: `actif-${apporteurId}`,
    apporteurId,
    tokenHash: empreinteJetonDepot(apporteurId),
    creeAt: T0,
    revoqueAt: null,
  });

  it('REQ-SEC-005 : résilié → le jeton actif est révoqué à l’instant passé, celui d’un autre apporteur non ; rejoué → 0', async () => {
    const { etat, tx } = client({ [APPORTEUR]: 'resilie' }, [actif(APPORTEUR), actif(AUTRE)]);
    const t = tx() as unknown as Prisma.TransactionClient;
    expect(await revoquerJetonsALaResiliation(t, APPORTEUR, T1)).toBe(1);
    expect(etat.jetons.map((x) => x.revoqueAt)).toEqual([T1, null]);
    expect(etat.requetes[0]).toMatch(/FOR UPDATE/);
    expect(await revoquerJetonsALaResiliation(t, APPORTEUR, T1)).toBe(0);
  });

  it.each(['suspendu', 'signe'])(
    'REQ-SEC-005 : face ROUGE — statut %s → rien n’est révoqué',
    async (statut) => {
      const { etat, tx } = client({ [APPORTEUR]: statut }, [actif(APPORTEUR)]);
      const t = tx() as unknown as Prisma.TransactionClient;
      expect(await revoquerJetonsALaResiliation(t, APPORTEUR, T1)).toBe(0);
      expect(etat.jetons[0]?.revoqueAt).toBeNull();
    }
  );

  it('REQ-SEC-005 : apporteur inconnu → 0', async () => {
    const { tx } = client({}, []);
    expect(
      await revoquerJetonsALaResiliation(tx() as unknown as Prisma.TransactionClient, APPORTEUR, T1)
    ).toBe(0);
  });
});

describe('REQ-SEC-005 — trouver un jeton par son clair', () => {
  it('REQ-SEC-005 : par l’empreinte du clair ; rend l’identifiant et l’apporteur, rien d’autre', async () => {
    const { prisma } = client({ [APPORTEUR]: 'signe' });
    const { clair, id } = await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    expect(await trouverJetonUtilisable(prisma, clair, T0)).toEqual({ id, apporteurId: APPORTEUR });
    expect(await trouverJetonUtilisable(prisma, `${clair}x`, T0)).toBeNull();
    expect(await trouverJetonUtilisable(prisma, clair, echeanceDuJeton(T0))).toBeNull();
  });

  it('REQ-SEC-005 : un jeton révoqué ne se trouve plus', async () => {
    const { prisma } = client({ [APPORTEUR]: 'signe' });
    const { clair } = await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    await regenererJetonDepot(prisma, APPORTEUR, {
      source: (n) => new Uint8Array(n).fill(3),
      maintenant: T0,
    });
    expect(await trouverJetonUtilisable(prisma, clair, T0)).toBeNull();
  });
});

describe('REQ-SEC-006 — l’adaptateur du lien « ce n’est pas moi »', () => {
  it('REQ-SEC-006 : lit le jeton et le dépôt, révoque conditionnellement, rend le compte', async () => {
    const { prisma, etat } = client({ [APPORTEUR]: 'signe' });
    await emettreJetonDepot(prisma, APPORTEUR, ctx(T0));
    const p = portsDuPasMoi(prisma, CLE, () => T1);
    expect(p.cle).toBe(CLE);
    expect(p.maintenant()).toBe(T1);
    expect(await p.lireJeton('jeton-1')).toEqual({ id: 'jeton-1', apporteurId: APPORTEUR });
    expect(await p.lireDepot(DEPOT)).toEqual({ apporteurId: APPORTEUR, jetonDepotId: 'jeton-1' });
    expect(await p.revoquer('jeton-1', T1)).toBe(1);
    expect(await p.revoquer('jeton-1', T1)).toBe(0);
    expect(etat.jetons[0]?.revoqueAt).toBe(T1);
    expect(await confirmerPasMoi(lienPasMoi('jeton-1', DEPOT, CLE), p)).toBe(REPONSE_PAS_MOI);
  });
});
