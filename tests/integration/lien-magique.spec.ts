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
import { demarrerBase, demarrerCache, type Base, type Cache } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { horlogeFigee } from '../../src/domain/temps/horloge';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import {
  COMPTEURS,
  OPTIONS_DU_CLIENT,
  creerMagasinRedis,
  limiter,
  sujetDepuisEmpreinte,
  type MagasinRedis,
} from '../../src/server/securite/rate-limit';
import {
  MODELE_APPORTEUR,
  configurationDuLien,
  portsDeConsommation,
  portsDeDemande,
  type DependancesDuLien,
} from '../../src/server/auth/lien-magique-production';
import {
  consommerLien,
  demanderLien,
  empreinteDuJeton,
  tirerJeton,
  type ConfigurationDuLien,
  type PortsDeDemande,
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

  it('REQ-SEC-001 : face ROUGE — une empreinte non hexadécimale est refusée par la base', async () => {
    const id = await apporteur('AX00SECE');
    const m = await refus(
      ecrituresDeLien(base.prisma).insererLien({
        apporteurId: id,
        tokenHash: 'Z'.repeat(64),
        kid: configuration.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0 + QUINZE_MINUTES),
      })
    );
    expect(m).toContain('liens_magiques_token_hash_hex');
  });

  it('REQ-SEC-001 : face ROUGE — une échéance qui ne suit pas la création est refusée par la base', async () => {
    const id = await apporteur('AX00SECF');
    const m = await refus(
      ecrituresDeLien(base.prisma).insererLien({
        apporteurId: id,
        tokenHash: empreinteDuJeton(tirerJeton(), configuration.secret),
        kid: configuration.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0),
      })
    );
    expect(m).toContain('liens_magiques_expire_apres_creation');
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

// ── le parcours CÂBLÉ : les ports de production, la base et le cache réels ─────────────────────────

/** L'environnement de test, DÉRIVÉ des noms de `src/lib/env.ts` (jamais recopié). */
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const ENV: Record<string, string> = {
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec03-integration-${n.toLowerCase()}-`.padEnd(56, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
};
const CLES = clesPii(ENV);

/** Un apporteur signé dont le courriel est posé comme la couche des données personnelles le pose. */
async function apporteurAvecCourriel(codeParrainage: string, courriel: string): Promise<string> {
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_APPORTEUR, id },
    { email: courriel },
    CLES
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  await base.prisma.apporteur.create({
    data: {
      id,
      emailChiffre: Buffer.from(emailChiffre),
      emailHash,
      statut: 'signe',
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
    },
  });
  return id;
}

describe('REQ-SEC-001 — les colonnes de courriel d’apporteurs', () => {
  it('REQ-SEC-001 : face ROUGE — deux apporteurs de même courriel sont refusés, l’empreinte est unique', async () => {
    await apporteurAvecCourriel('AX00SECG', 'double@example.org');
    const m = await refus(apporteurAvecCourriel('AX00SECH', 'double@example.org'));
    expect(m).toMatch(/Unique constraint|email_hash/);
  });

  it('REQ-SEC-001 : face ROUGE — une empreinte de courriel non hexadécimale, ou sans son bloc, est refusée', async () => {
    const id = await apporteur('AX00SECJ');
    const horsForme = await refus(
      base.prisma.$executeRawUnsafe(
        "UPDATE apporteurs SET email_hash = $2, email_chiffre = '\\x01'::bytea WHERE id = $1::uuid",
        id,
        'Z'.repeat(64)
      )
    );
    expect(horsForme).toContain('apporteurs_email_hash_hex');
    const orpheline = await refus(
      base.prisma.$executeRawUnsafe(
        'UPDATE apporteurs SET email_hash = $2 WHERE id = $1::uuid',
        id,
        'a'.repeat(64)
      )
    );
    expect(orpheline).toContain('apporteurs_courriel_complet');
  });
});

describe('REQ-SEC-001 REQ-SEC-002 — le parcours câblé, base et cache réels', () => {
  let cache: Cache;
  let magasin: MagasinRedis;

  beforeAll(async () => {
    cache = await demarrerCache();
    magasin = creerMagasinRedis(cache.url, OPTIONS_DU_CLIENT);
  }, 180_000);

  afterAll(async () => {
    magasin?.fermer();
    await cache?.arreter();
  });

  function dependances() {
    const planifies: Array<() => Promise<void>> = [];
    const envois: Array<{ a: string; sujet: string; corps: string }> = [];
    const d: DependancesDuLien = {
      env: ENV,
      prisma: base.prisma,
      horloge: horlogeFigee(t0),
      planifier: (travail) => planifies.push(travail),
      envoi: {
        envoyer: async (m) => {
          envois.push(m);
        },
      },
      journal: { warn: () => undefined },
    };
    return { d, planifies, envois };
  }

  /**
   * Les ports de production, dont les deux compteurs appellent `limiter` du registre sur le cache
   * RÉEL de ce fichier : hors des tests, `limiter` refuse tout magasin fourni, et le câblage de
   * production n'en passe aucun (garde `securite:rate-famille`). Seul le magasin change ici.
   */
  const cablee = (d: DependancesDuLien): PortsDeDemande => ({
    ...portsDeDemande(d),
    compterAdresse: (sujet, maintenantMs) =>
      limiter('magic:ip', sujetDepuisEmpreinte(sujet), maintenantMs, magasin),
    compterCourriel: (sujet, maintenantMs) =>
      limiter('magic:courriel', sujetDepuisEmpreinte(sujet), maintenantMs, magasin),
  });

  const demande = (saisie: string, adresse: string) => ({
    saisie,
    piege: false,
    entetes: new Headers({ 'x-forwarded-for': adresse }),
  });

  it('REQ-SEC-001 : compte existant ou absent, même réponse ; seul l’existant reçoit un lien, à son adresse STOCKÉE, qui ouvre UNE session', async () => {
    const id = await apporteurAvecCourriel('AX00SECK', 'claire@example.org');
    const connu = dependances();
    const inconnu = dependances();
    const a = await demanderLien(demande('Claire@Example.org', '198.51.100.21'), cablee(connu.d));
    const b = await demanderLien(
      demande('personne@example.org', '198.51.100.22'),
      cablee(inconnu.d)
    );
    expect([a, b]).toEqual(['envoye', 'envoye']);
    // Plancher : les deux demandes ont bien planifié leur travail, et rien d'autre avant la réponse.
    expect([connu.planifies.length, inconnu.planifies.length]).toEqual([1, 1]);
    for (const t of [...connu.planifies, ...inconnu.planifies]) await t();

    expect(inconnu.envois).toHaveLength(0);
    expect(connu.envois.map((e) => e.a)).toEqual(['claire@example.org']);
    const url = /https:\/\/\S+\/connexion\/([A-Za-z0-9_-]{43})/.exec(connu.envois[0]?.corps ?? '');
    expect(url?.[0].startsWith(configurationDuLien(ENV).urlPublique)).toBe(true);
    const jeton = url?.[1] ?? '';
    const [ligne] = await base.prisma.$queryRawUnsafe<Array<{ token_hash: string; kid: string }>>(
      'SELECT token_hash, kid FROM liens_magiques WHERE apporteur_id = $1::uuid',
      id
    );
    expect(ligne).toEqual({
      token_hash: empreinteDuJeton(jeton, ENV.MAGIC_LINK_SECRET ?? ''),
      kid: kidDe(ENV.MAGIC_LINK_SECRET ?? ''),
    });

    const consommation = portsDeConsommation(connu.d);
    expect((await consommerLien({ jeton, ipHash: null }, consommation)).etat).toBe('ouverte');
    expect(await consommerLien({ jeton, ipHash: null }, consommation)).toEqual({
      etat: 'lien_invalide',
    });
    expect(await sessionsDe(id)).toBe(1);
  });

  it('REQ-SEC-002 : au-delà de la limite par courriel du REGISTRE, la demande est suspendue, compte ou non', async () => {
    const limite = COMPTEURS['magic:courriel'].limite;
    if (typeof limite !== 'number') throw new Error('limite hors dépôt');
    for (const saisie of ['limite@example.org', 'absente@example.org']) {
      const { d } = dependances();
      const etats: string[] = [];
      for (let i = 0; i <= limite; i += 1) {
        etats.push(await demanderLien(demande(saisie, `192.0.2.${i + 1}`), cablee(d)));
      }
      expect(etats.slice(0, limite).every((e) => e === 'envoye')).toBe(true);
      expect(etats[limite]).toBe('suspendu');
    }
  });
});
