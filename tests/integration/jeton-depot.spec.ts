// @req REQ-SEC-005
// @req REQ-SEC-006
// @req REQ-DM-012
/**
 * SEC-11 — le jeton de dépôt privé en base RÉELLE : émission, révocation, régénération, et le lien
 * « ce n'est pas moi » par son adaptateur Prisma. Le cœur pur : `tests/unit/securite/jeton-depot-pas-moi.spec.ts`.
 *
 * CE QU'IL PROUVE :
 *   1. UN SEUL JETON ACTIF par apporteur, tenu par la BASE : l'index unique partiel
 *      `jetons_depot_un_actif_par_apporteur` est lu dans `pg_indexes` et comparé ; un second jeton
 *      actif est refusé même en SQL brut, et le nom de l'index sort ; un jeton révoqué libère la place ;
 *   2. L'ÉMISSION ne stocke que l'empreinte, remet le clair une fois, et n'ouvre qu'aux statuts
 *      d'ouverture pleine (`signe`, `suspendu`) : un apporteur résilié ou candidat n'en reçoit aucun ;
 *   3. LA RÉGÉNÉRATION révoque puis émet DANS UNE SEULE TRANSACTION : une émission qui échoue laisse
 *      l'ancien jeton actif, intact ;
 *   4. LA RÉSILIATION révoque ; LA SUSPENSION ne révoque rien (REQ-SEC-019, REQ-SEC-032) ;
 *   5. UN JETON SE TROUVE par son clair tant qu'il est actif et non échu ; échu, révoqué, inconnu : rien ;
 *   6. CONFIRMER « ce n'est pas moi » révoque le jeton qui a servi au dépôt, une fois, et rien d'autre.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import {
  empreinteJetonDepot,
  sourceAleatoireSysteme,
} from '../../src/domain/apporteur/identifiants';
import {
  ErreurEmissionJeton,
  INDEX_UN_ACTIF_PAR_APPORTEUR,
  REPONSE_PAS_MOI,
  confirmerPasMoi,
  echeanceDuJeton,
  emettreJetonDepot,
  lienPasMoi,
  portsDuPasMoi,
  regenererJetonDepot,
  revoquerJetonsALaResiliation,
  trouverJetonUtilisable,
} from '../../src/server/auth/jeton-depot';
import { poserUnGelEnBase } from './gel-en-base';

let base: Base;
let grilleId: string;
let codes = 0;
let sirens = 400_000_000;

const T0 = new Date('2026-10-03T08:00:00.000Z');
const CLE = { secret: randomBytes(32).toString('hex'), kid: 'c0ffee01' };
const hex = (n: number) => randomBytes(n).toString('hex');

beforeAll(async () => {
  base = await demarrerBase();
  grilleId = (
    await base.prisma.grilleCommission.create({
      data: {
        version: 1,
        hash: hex(32),
        contenuJson: { essai: true },
        publieeAt: T0,
        importeeAt: T0,
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

type Statut = 'signe' | 'suspendu' | 'resilie' | 'candidat';

/** Un apporteur minimal, son STATUT écrit par chaque test (RM-11). */
async function apporteur(statut: Statut): Promise<string> {
  codes += 1;
  // SEC-15 : `suspendu` ne s'écrit plus seul ; l'apporteur naît `signe`, puis reçoit un VRAI gel.
  const a = await base.prisma.apporteur.create({
    data: {
      statut: statut === 'suspendu' ? 'signe' : statut,
      resiliationMotif: statut === 'resilie' ? 'ordinaire_axion' : null,
      codeParrainage: `AX${String(codes).padStart(6, '0')}`,
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: {},
      scoreInitial: 0,
      scorePartsJson: {},
      scoreBaremeVersion: 'v1',
      creeAt: T0,
    },
  });
  if (statut === 'suspendu') await poserUnGelEnBase(base.prisma, a.id, T0);
  return a.id;
}

async function changerStatut(id: string, statut: Statut): Promise<void> {
  if (statut === 'suspendu') return poserUnGelEnBase(base.prisma, id, T0);
  await base.prisma.apporteur.update({
    where: { id },
    data: { statut, resiliationMotif: statut === 'resilie' ? 'ordinaire_axion' : null },
  });
}

async function refus(promesse: Promise<unknown>): Promise<unknown> {
  try {
    await promesse;
  } catch (e) {
    return e;
  }
  throw new Error('aucun refus');
}

const actifs = (apporteurId: string) =>
  base.prisma.jetonDepot.findMany({ where: { apporteurId, revoqueAt: null } });

describe('REQ-SEC-005 — un seul jeton actif par apporteur, tenu par la base', () => {
  it('REQ-SEC-005 : pg_indexes porte l’index unique partiel sur apporteur_id, WHERE revoque_at IS NULL', async () => {
    const lignes = await base.prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = 'jetons_depot'
         AND indexname = ${INDEX_UN_ACTIF_PAR_APPORTEUR}`;
    expect(INDEX_UN_ACTIF_PAR_APPORTEUR).toBe('jetons_depot_un_actif_par_apporteur');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.indexdef).toMatch(
      /^CREATE UNIQUE INDEX jetons_depot_un_actif_par_apporteur /
    );
    expect(lignes[0]?.indexdef).toContain('(apporteur_id) WHERE (revoque_at IS NULL)');
  });

  it('REQ-SEC-005 : face ROUGE — un second jeton actif est refusé en SQL brut, violation d’unicité sur apporteur_id', async () => {
    const id = await apporteur('signe');
    const inserer = () =>
      base.prisma.$executeRawUnsafe(
        'INSERT INTO jetons_depot (id, apporteur_id, token_hash, cree_at) VALUES ($1::uuid, $2::uuid, $3, $4)',
        randomUUID(),
        id,
        empreinteJetonDepot(hex(16)),
        T0
      );
    await inserer();
    // Le moteur rend le code et la clé, pas le nom de l'index : c'est `pg_indexes` qui le nomme.
    const m = String((await refus(inserer())) as Error);
    expect(m).toContain('23505');
    expect(m).toContain(`Key (apporteur_id)=(${id})`);
    expect(await actifs(id)).toHaveLength(1);
  });

  it('REQ-SEC-005 : face VERTE — un jeton révoqué libère la place, et l’historique garde les deux', async () => {
    const id = await apporteur('signe');
    const premier = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    await base.prisma.jetonDepot.update({ where: { id: premier.id }, data: { revoqueAt: T0 } });
    await emettreJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 });
    expect(await base.prisma.jetonDepot.count({ where: { apporteurId: id } })).toBe(2);
    expect(await actifs(id)).toHaveLength(1);
  });
});

describe('REQ-DM-012 — l’émission : l’empreinte seule, le clair une fois', () => {
  it('REQ-DM-012 : le clair remis n’est pas stocké ; la base porte son SHA-256, créé à l’instant passé', async () => {
    const id = await apporteur('signe');
    const { clair, id: jetonId } = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const ligne = await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: jetonId } });
    expect(ligne.tokenHash).toBe(empreinteJetonDepot(clair));
    expect(ligne.tokenHash).not.toBe(clair);
    expect(ligne.creeAt.toISOString()).toBe(T0.toISOString());
    expect(ligne.revoqueAt).toBeNull();
    const brut = await base.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM jetons_depot WHERE row_to_json(jetons_depot)::text LIKE ${`%${clair}%`}`;
    expect(Number(brut[0]?.n)).toBe(0);
  });

  it('REQ-SEC-005 : un second appel d’émission sur un apporteur qui a déjà un jeton actif est refusé par la base', async () => {
    const id = await apporteur('signe');
    await emettreJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 });
    const e = await refus(
      emettreJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 })
    );
    expect(e).toBeInstanceOf(ErreurEmissionJeton);
    expect((e as ErreurEmissionJeton).code).toBe('jeton_actif_existant');
    expect(await actifs(id)).toHaveLength(1);
  });

  it('REQ-SEC-032 : un apporteur résilié ou candidat ne reçoit aucun jeton ; un apporteur suspendu, si', async () => {
    for (const statut of ['resilie', 'candidat'] as const) {
      const id = await apporteur(statut);
      const e = await refus(
        emettreJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 })
      );
      expect((e as ErreurEmissionJeton).code).toBe('statut_sans_jeton');
      expect(await base.prisma.jetonDepot.count({ where: { apporteurId: id } })).toBe(0);
    }
    const suspendu = await apporteur('suspendu');
    await emettreJetonDepot(base.prisma, suspendu, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    expect(await actifs(suspendu)).toHaveLength(1);
  });

  it('REQ-SEC-005 : un apporteur inconnu ne reçoit aucun jeton', async () => {
    const e = await refus(
      emettreJetonDepot(base.prisma, randomUUID(), {
        source: sourceAleatoireSysteme,
        maintenant: T0,
      })
    );
    expect((e as ErreurEmissionJeton).code).toBe('statut_sans_jeton');
  });
});

describe('REQ-SEC-005 — la régénération : révoquer puis émettre, une seule transaction', () => {
  it('REQ-SEC-005 : l’ancien jeton est révoqué à l’instant de la régénération, le nouveau seul est actif', async () => {
    const id = await apporteur('signe');
    const ancien = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const T1 = new Date(T0.getTime() + 60_000);
    const nouveau = await regenererJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T1,
    });
    expect(nouveau.clair).not.toBe(ancien.clair);
    const a = await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: ancien.id } });
    expect(a.revoqueAt?.toISOString()).toBe(T1.toISOString());
    expect((await actifs(id)).map((j) => j.id)).toEqual([nouveau.id]);
    expect(await trouverJetonUtilisable(base.prisma, ancien.clair, T1)).toBeNull();
    expect(await trouverJetonUtilisable(base.prisma, nouveau.clair, T1)).toEqual({
      id: nouveau.id,
      apporteurId: id,
    });
  });

  it('REQ-SEC-005 : face ROUGE — une émission qui échoue après la révocation laisse l’ancien jeton actif', async () => {
    const id = await apporteur('signe');
    const ancien = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const sourceCourte = (n: number) => new Uint8Array(n - 1);
    await refus(regenererJetonDepot(base.prisma, id, { source: sourceCourte, maintenant: T0 }));
    expect((await actifs(id)).map((j) => j.id)).toEqual([ancien.id]);
  });

  it('REQ-SEC-032 : un apporteur résilié ne régénère pas : rien n’est révoqué, rien n’est émis', async () => {
    const id = await apporteur('signe');
    const ancien = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    await changerStatut(id, 'resilie');
    const e = await refus(
      regenererJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 })
    );
    expect((e as ErreurEmissionJeton).code).toBe('statut_sans_jeton');
    expect((await actifs(id)).map((j) => j.id)).toEqual([ancien.id]);
  });

  it('REQ-SEC-005 : régénérer sans jeton actif émet le premier', async () => {
    const id = await apporteur('signe');
    const j = await regenererJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    expect((await actifs(id)).map((x) => x.id)).toEqual([j.id]);
  });
});

describe('REQ-SEC-005 — révoqué à la résiliation, jamais à la suspension', () => {
  it('REQ-SEC-032 : la résiliation révoque le jeton actif, et elle seule', async () => {
    const id = await apporteur('signe');
    const j = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    await changerStatut(id, 'resilie');
    const n = await base.prisma.$transaction((tx) => revoquerJetonsALaResiliation(tx, id, T0));
    expect(n).toBe(1);
    expect(await actifs(id)).toHaveLength(0);
    expect(await trouverJetonUtilisable(base.prisma, j.clair, T0)).toBeNull();
  });

  it('REQ-SEC-019 : face ROUGE — sur un apporteur SUSPENDU, l’appel ne révoque rien et le jeton sert toujours', async () => {
    const id = await apporteur('signe');
    const j = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    await changerStatut(id, 'suspendu');
    const n = await base.prisma.$transaction((tx) => revoquerJetonsALaResiliation(tx, id, T0));
    expect(n).toBe(0);
    expect(await trouverJetonUtilisable(base.prisma, j.clair, T0)).toEqual({
      id: j.id,
      apporteurId: id,
    });
  });

  it('REQ-SEC-032 : rejouée, la révocation de résiliation est idempotente', async () => {
    const id = await apporteur('signe');
    await emettreJetonDepot(base.prisma, id, { source: sourceAleatoireSysteme, maintenant: T0 });
    await changerStatut(id, 'resilie');
    expect(await base.prisma.$transaction((tx) => revoquerJetonsALaResiliation(tx, id, T0))).toBe(
      1
    );
    expect(await base.prisma.$transaction((tx) => revoquerJetonsALaResiliation(tx, id, T0))).toBe(
      0
    );
  });
});

describe('REQ-SEC-005 — trouver un jeton par son clair', () => {
  it('REQ-SEC-005 : actif et avant échéance → trouvé ; à l’échéance → rien ; inconnu → rien', async () => {
    const id = await apporteur('signe');
    const j = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const echeance = echeanceDuJeton(T0);
    expect(
      await trouverJetonUtilisable(base.prisma, j.clair, new Date(echeance.getTime() - 1))
    ).toEqual({
      id: j.id,
      apporteurId: id,
    });
    expect(await trouverJetonUtilisable(base.prisma, j.clair, echeance)).toBeNull();
    expect(await trouverJetonUtilisable(base.prisma, `${j.clair}x`, T0)).toBeNull();
  });
});

describe('REQ-SEC-006 — « ce n’est pas moi » en base', () => {
  /** Un dépôt par lien privé, porté par le jeton nommé. */
  async function depot(apporteurId: string, jetonDepotId: string): Promise<string> {
    const id = randomUUID();
    const bloc = () => randomBytes(40);
    sirens += 1;
    await base.prisma.$executeRawUnsafe(
      `INSERT INTO attributions (id, apporteur_id, statut, siren, canal, jeton_depot_id, grille_commission_id,
         date_contact, verification_prioritaire, entreprise_a_verifier, raison_sociale,
         nom_contact_chiffre, prenom_contact_chiffre, email_chiffre, email_hash, telephone_chiffre,
         phone_hash, fonction_contact_chiffre, contexte_chiffre, lien_interet_declare)
       VALUES ($1::uuid, $2::uuid, 'provisoire'::etat_attribution, $3, 'lien_prive', $4::uuid, $5::uuid,
         '2026-10-01', false, false, 'Entreprise Témoin SAS', $6, $7, $8, $9, $10, $11, $12, $13, false)`,
      id,
      apporteurId,
      String(sirens),
      jetonDepotId,
      grilleId,
      bloc(),
      bloc(),
      bloc(),
      hex(32),
      bloc(),
      hex(32),
      bloc(),
      bloc()
    );
    return id;
  }

  it('REQ-SEC-006 : confirmer révoque le jeton du dépôt ; rejoué, rien de plus ; la réponse est la même', async () => {
    const id = await apporteur('signe');
    const j = await emettreJetonDepot(base.prisma, id, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const d = await depot(id, j.id);
    const ports = portsDuPasMoi(base.prisma, CLE, () => T0);
    const lien = lienPasMoi(j.id, d, CLE);
    expect(await confirmerPasMoi(lien, ports)).toBe(REPONSE_PAS_MOI);
    expect(await confirmerPasMoi(lien, ports)).toBe(REPONSE_PAS_MOI);
    const ligne = await base.prisma.jetonDepot.findUniqueOrThrow({ where: { id: j.id } });
    expect(ligne.revoqueAt?.toISOString()).toBe(T0.toISOString());
  });

  it('REQ-SEC-006 : face ROUGE — un lien qui nomme le jeton d’un autre apporteur ne révoque rien', async () => {
    const a = await apporteur('signe');
    const b = await apporteur('signe');
    const ja = await emettreJetonDepot(base.prisma, a, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const jb = await emettreJetonDepot(base.prisma, b, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const d = await depot(a, ja.id);
    const ports = portsDuPasMoi(base.prisma, CLE, () => T0);
    expect(await confirmerPasMoi(lienPasMoi(jb.id, d, CLE), ports)).toBe(REPONSE_PAS_MOI);
    expect(await actifs(b)).toHaveLength(1);
  });

  it('REQ-SEC-006 : face ROUGE — un lien qui nomme un autre jeton du MÊME apporteur que celui du dépôt ne révoque rien', async () => {
    const a = await apporteur('signe');
    const ancien = await emettreJetonDepot(base.prisma, a, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const d = await depot(a, ancien.id);
    const nouveau = await regenererJetonDepot(base.prisma, a, {
      source: sourceAleatoireSysteme,
      maintenant: T0,
    });
    const ports = portsDuPasMoi(base.prisma, CLE, () => T0);
    expect(await confirmerPasMoi(lienPasMoi(nouveau.id, d, CLE), ports)).toBe(REPONSE_PAS_MOI);
    expect((await actifs(a)).map((j) => j.id)).toEqual([nouveau.id]);
  });
});
