// @req REQ-SEC-001
/**
 * Le lien magique en base RÉELLE — SEC-03.
 *
 * CE QUE LA BASE TIENT, CONTRE UN CLIENT QUI PASSERAIT PAR DU SQL BRUT :
 *   — un lien consommé ne redevient pas consommable : remettre `consomme_at` à NULL est refusé par
 *     `liens_magiques_usage_unique`, qui se nomme ;
 *   — une échéance ne se prolonge pas : repousser `expire_at` est refusé ;
 *   — une session par lien au plus : `sessions_espace.lien_magique_id` est unique.
 *
 * TÉMOIN À DEUX FACES (acceptance 5). Le témoin COMPTE LES LIGNES de `sessions_espace`, jamais les
 * codes de réponse : un lien consommé deux fois en laisse exactement UNE ; un lien de plus de
 * 15 minutes n'en laisse AUCUNE ; un lien frais et unique en laisse une. Contre-témoins SQL : la
 * consommation d'un lien actif passe, l'annulation d'un lien actif passe.
 *
 * TÉMOIN HMAC. Une ligne insérée avec un SHA-256 SANS clé du jeton se consomme en `lien_invalide`
 * et n'ouvre aucune session : seul le HMAC sous le secret des liens fait foi.
 *
 * Secrets et jetons sont tirés à l'exécution ; aucune adresse de courriel n'est écrite en base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { kidDe } from '../../src/lib/env';
import {
  consommerLien,
  empreinteDuJeton,
  tirerJeton,
  type ConfigurationDuLien,
  type PortsDeConsommation,
} from '../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import {
  ecrituresDeLien,
  transactionDeConsommation,
} from '../../src/server/auth/lien-magique-depot';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const configuration: ConfigurationDuLien = {
  secret: secretLien,
  kid: kidDe(secretLien),
  urlPublique: 'https://partners.example.org',
  session: { secret: secretSession, kid: kidDe(secretSession) },
};

const QUINZE_MINUTES = DUREES_AUTH.lienMagiqueMs.valeur;
/** Une base de temps proche de l'horloge du serveur : un déclencheur qui lirait `now()` s'y accorde. */
const t0 = Date.now();

function ports(maintenant: Date): PortsDeConsommation {
  return {
    maintenant: () => maintenant,
    transaction: transactionDeConsommation(base.prisma),
    configuration,
  };
}

/** Un apporteur minimal : chaque champ obligatoire est ÉCRIT (RM-11). */
async function apporteur(codeParrainage: string, statut: 'signe' | 'resilie' = 'signe') {
  const a = await base.prisma.apporteur.create({
    data: {
      statut,
      codeParrainage,
      isTest: false,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 72,
      scorePartsJson: { carnet: 72 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: '/connexion',
      parrainCodeCapture: null,
      creeAt: new Date(t0),
      ...(statut === 'resilie' ? { resiliationMotif: 'ordinaire_apporteur' as const } : {}),
    },
  });
  return a.id;
}

/** Pose un lien par l'adaptateur, comme l'émission le fait, et rend le jeton en clair. */
async function poserLien(apporteurId: string, creeAt: Date): Promise<string> {
  const jeton = tirerJeton();
  await ecrituresDeLien(base.prisma).insererLien({
    apporteurId,
    tokenHash: empreinteDuJeton(jeton, configuration.secret),
    kid: configuration.kid,
    creeAt,
    expireAt: new Date(creeAt.getTime() + QUINZE_MINUTES),
  });
  return jeton;
}

async function sessionsDe(apporteurId: string): Promise<number> {
  const [ligne] = await base.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    'SELECT count(*) AS n FROM sessions_espace WHERE apporteur_id = $1::uuid',
    apporteurId
  );
  return Number(ligne?.n ?? -1);
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-SEC-001 — usage unique et durée de vie, comptés en lignes de sessions_espace', () => {
  it('REQ-SEC-001 : un lien frais et unique ouvre UNE session', async () => {
    const id = await apporteur('AX00SEC1');
    const jeton = await poserLien(id, new Date(t0));
    const r = await consommerLien(
      { jeton, ipHash: 'a1b2c3d4e5f60718' },
      ports(new Date(t0 + 1000))
    );
    expect(r.etat).toBe('ouverte');
    expect(await sessionsDe(id)).toBe(1);
  });

  it('REQ-SEC-001 : consommé deux fois, exactement 1 ligne de sessions_espace', async () => {
    const id = await apporteur('AX00SEC2');
    const jeton = await poserLien(id, new Date(t0));
    await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)));
    const seconde = await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 2000)));
    expect(seconde).toEqual({ etat: 'lien_invalide' });
    expect(await sessionsDe(id)).toBe(1);
  });

  it('REQ-SEC-001 : dix consommations concurrentes, exactement 1 ligne de sessions_espace', async () => {
    const id = await apporteur('AX00SEC3');
    const jeton = await poserLien(id, new Date(t0));
    const r = await Promise.all(
      Array.from({ length: 10 }, () =>
        consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)))
      )
    );
    expect(r.filter((x) => x.etat === 'ouverte')).toHaveLength(1);
    expect(await sessionsDe(id)).toBe(1);
  });

  it('REQ-SEC-001 : un lien de plus de 15 minutes ne laisse AUCUNE ligne', async () => {
    const id = await apporteur('AX00SEC4');
    const creeAt = new Date(t0 - QUINZE_MINUTES - 60_000);
    const jeton = await poserLien(id, creeAt);
    const r = await consommerLien({ jeton, ipHash: null }, ports(new Date(t0)));
    expect(r).toEqual({ etat: 'lien_invalide' });
    expect(await sessionsDe(id)).toBe(0);
  });

  it('REQ-SEC-001 : un apporteur résilié ne laisse AUCUNE ligne', async () => {
    const id = await apporteur('AX00SEC5', 'resilie');
    const jeton = await poserLien(id, new Date(t0));
    const r = await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)));
    expect(r).toEqual({ etat: 'lien_invalide' });
    expect(await sessionsDe(id)).toBe(0);
  });

  it('REQ-SEC-001 : émettre un nouveau lien annule l’ancien, qui ne s’ouvre plus', async () => {
    const id = await apporteur('AX00SEC6');
    const ancien = await poserLien(id, new Date(t0));
    await ecrituresDeLien(base.prisma).annulerLiensActifs(id, new Date(t0 + 500));
    const recent = await poserLien(id, new Date(t0 + 500));
    expect(
      await consommerLien({ jeton: ancien, ipHash: null }, ports(new Date(t0 + 1000)))
    ).toEqual({
      etat: 'lien_invalide',
    });
    expect(
      (await consommerLien({ jeton: recent, ipHash: null }, ports(new Date(t0 + 1000)))).etat
    ).toBe('ouverte');
    expect(await sessionsDe(id)).toBe(1);
  });
});

/**
 * Le VECTEUR FIGÉ de la décision 14 de partners/ADR-0013 : une clé de test publique (ce n'est pas
 * un secret, elle ne sert qu'ici), le jeton de 32 octets nuls, et l'empreinte attendue ÉCRITE EN
 * DUR. Un changement de domaine, de séparateur, d'algorithme ou d'encodage la fait rougir.
 */
const VECTEUR_LIEN = {
  cle: 'partners-vecteur-fige-du-lien-magique-v1-aucun-secret-reel',
  jeton: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  empreinte: '1a39916cb2e5c2440314c66bbe84b98eb54d2d07441b6035ba2c849020cddf36',
} as const;

describe('REQ-SEC-001 — seule l’empreinte HMAC est stockée, et seule elle fait foi', () => {
  it('REQ-SEC-001 : le vecteur figé de la décision 14 est ce que la base reçoit, octet pour octet', async () => {
    const id = await apporteur('AX00SECD');
    await ecrituresDeLien(base.prisma).insererLien({
      apporteurId: id,
      tokenHash: empreinteDuJeton(VECTEUR_LIEN.jeton, VECTEUR_LIEN.cle),
      kid: kidDe(VECTEUR_LIEN.cle),
      creeAt: new Date(t0),
      expireAt: new Date(t0 + QUINZE_MINUTES),
    });
    const [ligne] = await base.prisma.$queryRawUnsafe<Array<{ token_hash: string }>>(
      'SELECT token_hash FROM liens_magiques WHERE apporteur_id = $1::uuid',
      id
    );
    expect(ligne?.token_hash).toBe(VECTEUR_LIEN.empreinte);
  });

  it('REQ-SEC-001 : ni le jeton de lien ni le jeton de session n’apparaissent en base', async () => {
    const id = await apporteur('AX00SEC7');
    const jeton = await poserLien(id, new Date(t0));
    const r = await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)));
    if (r.etat !== 'ouverte') throw new Error(`attendu ouverte, reçu ${r.etat}`);
    const lignes = JSON.stringify([
      await base.prisma.$queryRawUnsafe(
        'SELECT * FROM liens_magiques WHERE apporteur_id = $1::uuid',
        id
      ),
      await base.prisma.$queryRawUnsafe(
        'SELECT * FROM sessions_espace WHERE apporteur_id = $1::uuid',
        id
      ),
    ]);
    // Plancher : les lignes existent, et portent les `kid` des deux secrets.
    expect(lignes).toContain(configuration.kid);
    expect(lignes).toContain(configuration.session.kid);
    expect(lignes).not.toContain(jeton);
    expect(lignes).not.toContain(r.jetonSession);
  });

  it('REQ-SEC-001 : une ligne en SHA-256 SANS clé se consomme en `lien_invalide`, aucune session', async () => {
    const id = await apporteur('AX00SEC8');
    const jeton = tirerJeton();
    await ecrituresDeLien(base.prisma).insererLien({
      apporteurId: id,
      tokenHash: createHash('sha256').update(jeton, 'utf8').digest('hex'),
      kid: configuration.kid,
      creeAt: new Date(t0),
      expireAt: new Date(t0 + QUINZE_MINUTES),
    });
    const r = await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)));
    expect(r).toEqual({ etat: 'lien_invalide' });
    expect(await sessionsDe(id)).toBe(0);
  });
});

describe('REQ-SEC-001 — la base refuse ce que le code ne ferait pas', () => {
  it('REQ-SEC-001 : face VERTE — consommer puis annuler un lien actif en SQL passent', async () => {
    const id = await apporteur('AX00SEC9');
    await poserLien(id, new Date(t0));
    await poserLien(id, new Date(t0 + 1));
    const [premier, second] = await base.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id::text FROM liens_magiques WHERE apporteur_id = $1::uuid ORDER BY cree_at',
      id
    );
    const consommes = await base.prisma.$executeRawUnsafe(
      'UPDATE liens_magiques SET consomme_at = $2 WHERE id = $1::uuid AND consomme_at IS NULL',
      premier?.id,
      new Date(t0 + 1000)
    );
    const annules = await base.prisma.$executeRawUnsafe(
      'UPDATE liens_magiques SET annule_at = $2 WHERE id = $1::uuid AND annule_at IS NULL',
      second?.id,
      new Date(t0 + 1000)
    );
    expect([consommes, annules]).toEqual([1, 1]);
  });

  it('REQ-SEC-001 : face ROUGE — remettre `consomme_at` à NULL est refusé, et le refus se nomme', async () => {
    const id = await apporteur('AX00SECA');
    const jeton = await poserLien(id, new Date(t0));
    expect((await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)))).etat).toBe(
      'ouverte'
    );
    const m = await refus(
      base.prisma.$executeRawUnsafe(
        'UPDATE liens_magiques SET consomme_at = NULL WHERE apporteur_id = $1::uuid',
        id
      )
    );
    expect(m).toContain(
      'liens_magiques_usage_unique : un lien consommé ou annulé est gelé (REQ-SEC-001)'
    );
  });

  it('REQ-SEC-001 : face ROUGE — prolonger `expire_at` est refusé', async () => {
    const id = await apporteur('AX00SECB');
    await poserLien(id, new Date(t0));
    const m = await refus(
      base.prisma.$executeRawUnsafe(
        "UPDATE liens_magiques SET expire_at = expire_at + interval '1 day' WHERE apporteur_id = $1::uuid",
        id
      )
    );
    expect(m).toContain(
      "liens_magiques_usage_unique : seules consomme_at et annule_at s'écrivent (REQ-SEC-001)"
    );
  });

  it('REQ-SEC-001 : face ROUGE — une seconde session pour le même lien est refusée par la base', async () => {
    const id = await apporteur('AX00SECC');
    const jeton = await poserLien(id, new Date(t0));
    expect((await consommerLien({ jeton, ipHash: null }, ports(new Date(t0 + 1000)))).etat).toBe(
      'ouverte'
    );
    const m = await refus(
      base.prisma.$executeRawUnsafe(
        `INSERT INTO sessions_espace (id, apporteur_id, lien_magique_id, token_hash, kid, cree_at, expire_at)
         SELECT gen_random_uuid(), apporteur_id, lien_magique_id, $2, kid, cree_at, expire_at
         FROM sessions_espace WHERE apporteur_id = $1::uuid`,
        id,
        'e'.repeat(64)
      )
    );
    expect(m).toContain('sessions_espace_lien_magique_id_key');
  });
});
