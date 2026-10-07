// @req REQ-SEC-003
// @req REQ-SEC-004
/**
 * Les sessions révocables en base RÉELLE — SEC-04.
 *
 * CE QUE LA BASE TIENT, CONTRE TOUT APPELANT, PRÉSENT OU FUTUR :
 *   — `apporteurs.session_version` est incrémentée PAR LA BASE à la résiliation et à tout
 *     changement de l'empreinte du courriel, jamais à la suspension, jamais par une colonne
 *     quelconque ; elle ne descend jamais ;
 *   — une session ouverte copie la version de son apporteur, et la requête SUIVANTE d'une session
 *     dont la version est dépassée est refusée ;
 *   — une révocation est définitive ;
 *   — le téléphone n'existe qu'en couple bloc chiffré et empreinte, et l'acceptation de la
 *     politique de confidentialité en couple date et version ;
 *   — un seul changement de courriel en cours par apporteur, jamais confirmé et annulé à la fois ;
 *   — le compte des essais de code d'un lien reste entre 0 et 5 et ne redescend jamais.
 *
 * Le semeur `prisma/seed/05-sessions.ts` ouvre les sessions de ce fichier : il est jugé ici.
 * Secrets et jetons sont tirés à l'exécution ; aucune adresse réelle n'est écrite en base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../src/server/auth/lien-magique-depot';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import {
  depotDeSessions,
  exigerSession,
  exigerSessionRelevee,
  revoquerPourMotifDeSecurite,
  revoquerSession,
  type PortsDeSession,
} from '../../src/server/auth/session';
import { semerSession } from '../../prisma/seed/05-sessions';
import { poserUnGelEnBase } from './gel-en-base';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec04-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

/** Une base de temps proche de l'horloge du serveur. */
const t0 = Date.now();
const MINUTE = 60 * 1000;

function ports(maintenant: Date): PortsDeSession {
  return {
    maintenant: () => maintenant,
    depot: depotDeSessions(base.prisma),
    configuration: CONFIGURATION.session,
  };
}

let sequence = 0;
/** Un code de parrainage neuf à chaque appel, dans la forme du CHECK (`AX` + 6 Crockford). */
function code(): string {
  sequence += 1;
  return `AX4${String(sequence).padStart(5, '0')}`;
}

/** Un apporteur `signe` au courriel posé par la couche des données personnelles (RM-11). */
async function apporteur(courriel: string): Promise<string> {
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
      codeParrainage: code(),
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

/** Ouvre une session par le semeur, lien consommé à `consommeAt` ; rend le jeton de session. */
async function ouvrir(apporteurId: string, consommeAt: Date): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSession(base.prisma, {
    apporteurId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt,
    ipHash: null,
    configuration: CONFIGURATION,
  });
  return jetonSession;
}

async function version(apporteurId: string): Promise<number> {
  const a = await base.prisma.apporteur.findUniqueOrThrow({
    where: { id: apporteurId },
    select: { sessionVersion: true },
  });
  return a.sessionVersion;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

const sql = (texte: string, ...valeurs: unknown[]) =>
  base.prisma.$executeRawUnsafe(texte, ...valeurs);

const verdict = async (jeton: string, maintenant: Date) => {
  const v = await exigerSession(jeton, ports(maintenant));
  return v.ok ? 'acceptee' : v.motif;
};

describe('REQ-SEC-003 — la version de session, tenue par la base', () => {
  it('REQ-SEC-003 : le semeur ouvre une session que la requête suivante accepte, et la dernière vue s’écrit', async () => {
    const id = await apporteur('sem@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const maintenant = new Date(t0 + MINUTE);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
    const s = await base.prisma.sessionEspace.findFirstOrThrow({ where: { apporteurId: id } });
    expect(s.derniereVueAt).toEqual(maintenant);
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — changement d’empreinte de courriel : +1, la requête SUIVANTE est refusée ; un changement d’une autre colonne : +0, elle passe', async () => {
    const id = await apporteur('ancienne@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const maintenant = new Date(t0 + MINUTE);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
    // Face 2 : une colonne quelconque n'incrémente pas.
    await base.prisma.apporteur.update({ where: { id }, data: { isTest: true } });
    expect(await version(id)).toBe(0);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
    // Face 1 : le courriel change, comme la couche des données personnelles l'écrit.
    const { emailChiffre, emailHash } = colonnesPii(
      { modele: MODELE_APPORTEUR, id },
      { email: 'nouvelle@example.org' },
      CLES
    );
    await base.prisma.apporteur.update({
      where: { id },
      data: { emailChiffre: Buffer.from(emailChiffre!), emailHash: emailHash! },
    });
    expect(await version(id)).toBe(1);
    expect(await verdict(jeton, maintenant)).toBe('version_perimee');
  });

  it('REQ-SEC-003 : un écrivain qui incrémente lui-même en changeant le courriel n’obtient qu’UN cran', async () => {
    const id = await apporteur('double@example.org');
    const { emailChiffre, emailHash } = colonnesPii(
      { modele: MODELE_APPORTEUR, id },
      { email: 'double-2@example.org' },
      CLES
    );
    await base.prisma.apporteur.update({
      where: { id },
      data: {
        emailChiffre: Buffer.from(emailChiffre!),
        emailHash: emailHash!,
        sessionVersion: { increment: 1 },
      },
    });
    expect(await version(id)).toBe(1);
  });

  it('REQ-SEC-003 : la RÉSILIATION incrémente et coupe la requête suivante', async () => {
    const id = await apporteur('resilie@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const maintenant = new Date(t0 + MINUTE);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
    await base.prisma.apporteur.update({
      where: { id },
      data: { statut: 'resilie', resiliationMotif: 'ordinaire_apporteur' },
    });
    expect(await version(id)).toBe(1);
    expect(await verdict(jeton, maintenant)).toBe('version_perimee');
  });

  it('REQ-SEC-003 : la SUSPENSION n’incrémente pas et ne révoque rien — la session ouverte franchit encore la requête suivante', async () => {
    const id = await apporteur('suspendu@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const maintenant = new Date(t0 + MINUTE);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
    // SEC-15 : `suspendu` ne s'écrit plus seul ; c'est une VRAIE pose de gel.
    await poserUnGelEnBase(base.prisma, id, maintenant);
    expect(await version(id)).toBe(0);
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
  });

  it('REQ-SEC-003 : la révocation pour motif de sécurité coupe la requête suivante ; une session rouverte ensuite porte la nouvelle version', async () => {
    const id = await apporteur('securite@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const maintenant = new Date(t0 + MINUTE);
    await revoquerPourMotifDeSecurite(id, ports(maintenant));
    expect(await version(id)).toBe(1);
    expect(await verdict(jeton, maintenant)).toBe('version_perimee');
    const neuve = await ouvrir(id, new Date(t0 + 2 * MINUTE));
    const s = await base.prisma.sessionEspace.findMany({
      where: { apporteurId: id },
      orderBy: { creeAt: 'asc' },
      select: { sessionVersion: true },
    });
    expect(s.map((x) => x.sessionVersion)).toEqual([0, 1]);
    expect(await verdict(neuve, new Date(t0 + 3 * MINUTE))).toBe('acceptee');
  });

  it('REQ-SEC-003 : la version ne descend jamais — la base refuse et se nomme', async () => {
    const id = await apporteur('descente@example.org');
    await revoquerPourMotifDeSecurite(id, ports(new Date(t0)));
    const message = await refus(
      sql('UPDATE apporteurs SET session_version = session_version - 1 WHERE id = $1::uuid', id)
    );
    expect(message).toContain('apporteurs_session_version_monotone');
    expect(await version(id)).toBe(1);
  });

  it('REQ-SEC-003 : une version négative est refusée à l’écriture', async () => {
    const message = await refus(
      base.prisma.apporteur.create({
        data: {
          statut: 'signe',
          codeParrainage: code(),
          isTest: false,
          candidatureId: randomUUID(),
          reponsesJson: { version: 1 },
          scoreInitial: 72,
          scorePartsJson: { carnet: 72 },
          scoreBaremeVersion: 'bareme-essai',
          sourceCanal: null,
          parrainCodeCapture: null,
          creeAt: new Date(t0),
          sessionVersion: -1,
        },
      })
    );
    expect(message).toContain('apporteurs_session_version_positive');
  });

  it('REQ-SEC-003 : la version d’une session vient de la BASE, jamais de l’écrivain', async () => {
    const id = await apporteur('copie@example.org');
    await revoquerPourMotifDeSecurite(id, ports(new Date(t0)));
    await revoquerPourMotifDeSecurite(id, ports(new Date(t0)));
    const jeton = await ouvrir(id, new Date(t0));
    const s = await base.prisma.sessionEspace.findFirstOrThrow({ where: { apporteurId: id } });
    expect(s.sessionVersion).toBe(2);
    expect(await verdict(jeton, new Date(t0 + MINUTE))).toBe('acceptee');
  });
});

describe('REQ-SEC-003 — une révocation est définitive', () => {
  it('REQ-SEC-003 : révoquée, la session est refusée à la requête suivante, et la base refuse de l’« annuler »', async () => {
    const id = await apporteur('revoque@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const s = await base.prisma.sessionEspace.findFirstOrThrow({ where: { apporteurId: id } });
    const maintenant = new Date(t0 + MINUTE);
    expect(await revoquerSession(s.id, id, ports(maintenant))).toBe('revoquee');
    expect(await verdict(jeton, maintenant)).toBe('revoquee');
    const message = await refus(
      sql('UPDATE sessions_espace SET revoque_at = NULL WHERE id = $1::uuid', s.id)
    );
    expect(message).toContain('sessions_espace_revocation_definitive');
  });

  it('REQ-SEC-003 : la version d’une session ouverte ne se réécrit pas', async () => {
    const id = await apporteur('reecrit@example.org');
    await ouvrir(id, new Date(t0));
    const message = await refus(
      sql('UPDATE sessions_espace SET session_version = 5 WHERE apporteur_id = $1::uuid', id)
    );
    expect(message).toContain('sessions_espace_revocation_definitive');
  });

  it('REQ-SEC-003 : la session d’un autre apporteur ne se révoque pas', async () => {
    const a = await apporteur('a-autre@example.org');
    const b = await apporteur('b-autre@example.org');
    const jeton = await ouvrir(a, new Date(t0));
    const s = await base.prisma.sessionEspace.findFirstOrThrow({ where: { apporteurId: a } });
    const maintenant = new Date(t0 + MINUTE);
    expect(await revoquerSession(s.id, b, ports(maintenant))).toBe('introuvable');
    expect(await verdict(jeton, maintenant)).toBe('acceptee');
  });
});

describe('REQ-SEC-004 — le relèvement, en base réelle', () => {
  it('REQ-SEC-004 : TÉMOIN À DEUX FACES — lien consommé il y a 11 min : releve_requis ; il y a 9 min : passe', async () => {
    const id = await apporteur('releve@example.org');
    const jeton = await ouvrir(id, new Date(t0));
    const tard = await exigerSessionRelevee(jeton, ports(new Date(t0 + 11 * MINUTE)));
    expect(tard).toEqual({ ok: false, motif: 'releve_requis' });
    const frais = await exigerSessionRelevee(jeton, ports(new Date(t0 + 9 * MINUTE)));
    expect(frais.ok).toBe(true);
    expect(DUREES_AUTH.releveMs.valeur).toBe(10 * MINUTE);
  });
});

describe('REQ-SEC-003 — les colonnes d’apporteurs posées par cette migration', () => {
  it('REQ-SEC-003 : un téléphone chiffré sans empreinte est refusé et nomme la contrainte ; le couple écrit par colonnesPii passe', async () => {
    const id = await apporteur('tel@example.org');
    const message = await refus(
      sql("UPDATE apporteurs SET telephone_chiffre = '\\x00'::bytea WHERE id = $1::uuid", id)
    );
    expect(message).toContain('apporteurs_telephone_complet');
    const { telephoneChiffre, phoneHash, nomChiffre, prenomChiffre } = colonnesPii(
      { modele: MODELE_APPORTEUR, id },
      { telephone: '06 12 34 56 78', nom: 'Martin', prenom: 'Claire' },
      CLES
    );
    await base.prisma.apporteur.update({
      where: { id },
      data: {
        telephoneChiffre: Buffer.from(telephoneChiffre!),
        phoneHash: phoneHash!,
        nomChiffre: Buffer.from(nomChiffre!),
        prenomChiffre: Buffer.from(prenomChiffre!),
      },
    });
    const lu = await base.prisma.apporteur.findUniqueOrThrow({ where: { id } });
    expect(lu.phoneHash).toBe(phoneHash);
  });

  it('REQ-SEC-003 : une empreinte de téléphone hors forme est refusée ; deux apporteurs peuvent partager un numéro', async () => {
    const a = await apporteur('std-a@example.org');
    const b = await apporteur('std-b@example.org');
    const message = await refus(
      sql(
        "UPDATE apporteurs SET telephone_chiffre = '\\x00'::bytea, phone_hash = 'PAS-UNE-EMPREINTE' WHERE id = $1::uuid",
        a
      )
    );
    expect(message).toContain('apporteurs_phone_hash_hex');
    for (const id of [a, b]) {
      const { telephoneChiffre, phoneHash } = colonnesPii(
        { modele: MODELE_APPORTEUR, id },
        { telephone: '01 23 45 67 89' },
        CLES
      );
      await base.prisma.apporteur.update({
        where: { id },
        data: { telephoneChiffre: Buffer.from(telephoneChiffre!), phoneHash: phoneHash! },
      });
    }
    expect(
      await base.prisma.apporteur.count({ where: { id: { in: [a, b] }, phoneHash: { not: null } } })
    ).toBe(2);
  });

  it('REQ-SEC-003 : l’acceptation de la politique de confidentialité s’écrit en couple date et version', async () => {
    const id = await apporteur('confid@example.org');
    const message = await refus(
      sql("UPDATE apporteurs SET confidentialite_version = 'v1' WHERE id = $1::uuid", id)
    );
    expect(message).toContain('apporteurs_confidentialite_complete');
    await base.prisma.apporteur.update({
      where: { id },
      data: { confidentialiteAccepteeAt: new Date(t0), confidentialiteVersion: 'v1' },
    });
  });
});

describe('REQ-SEC-004 — changements de courriel et essais de code', () => {
  async function changement(apporteurId: string, demandeAt: Date) {
    const cid = randomUUID();
    const { emailChiffre, emailHash } = colonnesPii(
      { modele: 'ChangementCourriel', id: cid },
      { email: `nouvelle-${cid.slice(0, 8)}@example.org` },
      CLES
    );
    return base.prisma.changementCourriel.create({
      data: {
        id: cid,
        apporteurId,
        emailChiffre: Buffer.from(emailChiffre!),
        emailHash: emailHash!,
        tokenHash: randomBytes(32).toString('hex'),
        kid: CONFIGURATION.lien.kid,
        demandeAt,
      },
    });
  }

  it('REQ-SEC-004 : un seul changement de courriel EN COURS par apporteur ; une fois annulé, un autre peut naître', async () => {
    const id = await apporteur('chg@example.org');
    const premier = await changement(id, new Date(t0));
    // Prisma ne rend que la clé d'une unicité violée : le bloc relève le NOM de l'index que
    // Postgres a opposé. Les deux valeurs insérées sont tirées ici, jamais saisies.
    const message = await refus(
      sql(
        `DO $$ DECLARE c text; BEGIN
           INSERT INTO changements_courriel (id, apporteur_id, email_chiffre, email_hash, token_hash, kid, demande_at)
           SELECT gen_random_uuid(), apporteur_id, email_chiffre, email_hash,
                  '${randomBytes(32).toString('hex')}', kid, demande_at
           FROM changements_courriel WHERE id = '${premier.id}'::uuid;
         EXCEPTION WHEN unique_violation THEN
           GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
           RAISE EXCEPTION 'unicite violee : %', c;
         END $$`
      )
    );
    expect(message).toContain('changements_courriel_un_en_cours');
    await base.prisma.changementCourriel.update({
      where: { id: premier.id },
      data: { annuleAt: new Date(t0 + MINUTE) },
    });
    await changement(id, new Date(t0 + 2 * MINUTE));
  });

  it('REQ-SEC-004 : jamais confirmé ET annulé à la fois', async () => {
    const id = await apporteur('chg-2@example.org');
    const c = await changement(id, new Date(t0));
    const message = await refus(
      sql(
        'UPDATE changements_courriel SET confirme_at = demande_at, annule_at = demande_at WHERE id = $1::uuid',
        c.id
      )
    );
    expect(message).toContain('changements_courriel_confirme_ou_annule');
  });

  it('REQ-SEC-004 : les essais de code d’un lien restent entre 0 et 5, et ne redescendent jamais', async () => {
    const id = await apporteur('code@example.org');
    await ouvrir(id, new Date(t0));
    const lien = await base.prisma.lienMagique.create({
      data: {
        apporteurId: id,
        tokenHash: randomBytes(32).toString('hex'),
        kid: CONFIGURATION.lien.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0 + DUREES_AUTH.lienMagiqueMs.valeur),
      },
    });
    await sql('UPDATE liens_magiques SET tentatives_code = 5 WHERE id = $1::uuid', lien.id);
    expect(
      await refus(sql('UPDATE liens_magiques SET tentatives_code = 6 WHERE id = $1::uuid', lien.id))
    ).toContain('liens_magiques_tentatives_code_bornees');
    expect(
      await refus(sql('UPDATE liens_magiques SET tentatives_code = 4 WHERE id = $1::uuid', lien.id))
    ).toContain('liens_magiques_code_fige');
  });
});
