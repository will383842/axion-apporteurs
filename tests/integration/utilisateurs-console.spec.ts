// @req REQ-SEC-023
/**
 * Les utilisateurs de la console en base RÉELLE (REQ-SEC-023 ; partners/ADR-0022).
 *
 * CE QUE LA BASE TIENT, CONTRE TOUT APPELANT :
 *   — un lien magique et une session appartiennent à UNE population, jamais deux, jamais aucune :
 *     `(apporteur_id IS NULL) <> (utilisateur_console_id IS NULL)` sur les deux tables ;
 *   — la population d'un lien ou d'une session ne change pas après coup ;
 *   — une session de la console s'ouvre sans version d'apporteur à copier ;
 *   — l'empreinte du courriel d'un utilisateur est unique et hexadécimale.
 * Et, par le semeur `prisma/seed/06-console.ts` : le rôle est RELU à chaque requête par
 * `requireRole`, et un utilisateur désactivé ne franchit plus la requête suivante.
 * Secrets et jetons sont tirés à l'exécution ; aucune adresse réelle n'est écrite en base.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii, decryptPii, CHAMPS_PII } from '../../src/server/securite/pii';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessions, exigerSession } from '../../src/server/auth/session';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';
import {
  MODELE_UTILISATEUR_CONSOLE,
  semerSessionConsole,
  semerUtilisateurConsole,
} from '../../prisma/seed/06-console';

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
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec17-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const t0 = Date.now();
const MINUTE = 60 * 1000;
const maintenant = new Date(t0 + MINUTE);

const portsConsole = () => ({
  maintenant: () => maintenant,
  depot: depotDeSessionsConsole(base.prisma),
  configuration: CONFIGURATION.session,
});

let sequence = 0;
/**
 * SEC-30 (quatre yeux) : l'admin de la fixture est VALIDÉ. Le premier administrateur semé se
 * valide lui-même (premier administrateur, sans validateur) ; chaque admin suivant est validé par
 * lui. Un admin non validé n'aurait aucun droit d'administrateur.
 */
let racine: string | null = null;
async function utilisateur(role: 'admin' | 'comptable'): Promise<string> {
  sequence += 1;
  const { id } = await semerUtilisateurConsole(base.prisma, {
    id: randomUUID(),
    role,
    email: `console-${sequence}@example.org`,
    nom: `Témoin ${sequence}`,
    creeAt: new Date(t0),
    cles: CLES,
  });
  if (role === 'admin') {
    await base.prisma.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET valide_par_id = $2::uuid, valide_at = clock_timestamp() WHERE id = $1::uuid',
      id,
      racine
    );
    racine ??= id;
  }
  return id;
}

async function ouvrir(utilisateurConsoleId: string): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSessionConsole(base.prisma, {
    utilisateurConsoleId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt: new Date(t0),
    ipHash: null,
    configuration: CONFIGURATION,
  });
  return jetonSession;
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

const verdict = async (droit: Parameters<typeof requireRole>[0], jeton: string) => {
  const v = await requireRole(droit, jeton, portsConsole());
  return v.ok ? v.utilisateur.role : v.motif;
};

describe('REQ-SEC-023 — requireRole en base réelle', () => {
  it('REQ-SEC-023 : le semeur pose un utilisateur au courriel chiffré, lié à sa ligne, et une session qu’admet requireRole', async () => {
    const id = await utilisateur('admin');
    const u = await base.prisma.utilisateurConsole.findUniqueOrThrow({ where: { id } });
    expect(u.role).toBe('admin');
    expect(u.desactiveAt).toBeNull();
    expect(
      decryptPii(
        { modele: MODELE_UTILISATEUR_CONSOLE, champ: CHAMPS_PII.email.chiffre, id },
        // Actif : son adresse est présente (CHECK `utilisateurs_console_adresse_si_actif`).
        u.emailChiffre!,
        CLES
      )
    ).toMatch(/^console-\d+@example\.org$/);
    const jeton = await ouvrir(id);
    expect(await verdict('action:lever_gel', jeton)).toBe('admin');
    const s = await base.prisma.sessionEspace.findFirstOrThrow({
      where: { utilisateurConsoleId: id },
    });
    expect(s.apporteurId).toBeNull();
    expect(s.sessionVersion).toBe(0);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — le rôle est RELU à chaque requête : `admin` lève un gel, rétrogradé `comptable` la requête suivante est refusée', async () => {
    const id = await utilisateur('admin');
    const jeton = await ouvrir(id);
    expect(await verdict('action:lever_gel', jeton)).toBe('admin');
    await base.prisma.utilisateurConsole.update({ where: { id }, data: { role: 'comptable' } });
    // SEC-30 (REQ-SEC-003) : le changement de rôle fait monter la version de session ; la session
    // ouverte en admin tombe dès la requête suivante, pour tout droit.
    expect(await verdict('action:lever_gel', jeton)).toBe('version_perimee');
    expect(await verdict('action:approuver_lot', jeton)).toBe('version_perimee');
    // Une session neuve lit le rôle relu : refusé sur la levée de gel, admis comme comptable.
    const neuf = await ouvrir(id);
    expect(await verdict('action:lever_gel', neuf)).toBe('role_refuse');
    expect(await verdict('action:approuver_lot', neuf)).toBe('comptable');
  });

  it('REQ-SEC-023 : un utilisateur désactivé ne franchit plus la requête SUIVANTE', async () => {
    const id = await utilisateur('comptable');
    const jeton = await ouvrir(id);
    expect(await verdict('action:approuver_lot', jeton)).toBe('comptable');
    await base.prisma.utilisateurConsole.update({
      where: { id },
      data: { desactiveAt: maintenant },
    });
    expect(await verdict('action:approuver_lot', jeton)).toBe('desactive');
  });

  it('REQ-SEC-023 : une session de la console n’ouvre pas l’espace apporteur', async () => {
    const id = await utilisateur('admin');
    const jeton = await ouvrir(id);
    const v = await exigerSession(jeton, {
      maintenant: () => maintenant,
      depot: depotDeSessions(base.prisma),
      configuration: CONFIGURATION.session,
    });
    expect(v).toEqual({ ok: false, motif: 'inconnue' });
  });
});

describe('REQ-SEC-023 — la population d’un lien et d’une session, tenue par la base', () => {
  const lien = (apporteur: string | null, console: string | null) =>
    sql(
      `INSERT INTO "liens_magiques" ("id","apporteur_id","utilisateur_console_id","token_hash","kid","cree_at","expire_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
      randomUUID(),
      apporteur,
      console,
      randomBytes(32).toString('hex'),
      CONFIGURATION.lien.kid,
      new Date(t0),
      new Date(t0 + 15 * MINUTE)
    );

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un lien sans population est refusé en nommant le CHECK ; avec un utilisateur de console, il passe', async () => {
    expect(await refus(lien(null, null))).toContain('liens_magiques_une_population');
    const id = await utilisateur('admin');
    await expect(lien(null, id)).resolves.toBe(1);
  });

  it('REQ-SEC-023 : un lien des DEUX populations est refusé', async () => {
    const id = await utilisateur('admin');
    // Deux clés étrangères VALIDES : seul le CHECK peut refuser.
    const apporteurId = await apporteurTemoin();
    expect(await refus(lien(apporteurId, id))).toContain('liens_magiques_une_population');
    await expect(lien(apporteurId, null)).resolves.toBe(1);
  });

  it('REQ-SEC-023 : une session sans population, ou des deux, est refusée en nommant le CHECK', async () => {
    const id = await utilisateur('admin');
    const jetonLien = tirerJeton();
    const { lienMagiqueId } = await semerSessionConsole(base.prisma, {
      utilisateurConsoleId: id,
      jetonLien,
      jetonSession: tirerJeton(),
      consommeAt: new Date(t0),
      ipHash: null,
      configuration: CONFIGURATION,
    });
    const session = (console: string | null, lienId: string) =>
      sql(
        `INSERT INTO "sessions_espace" ("id","apporteur_id","utilisateur_console_id","lien_magique_id","token_hash","kid","cree_at","expire_at")
         VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
        randomUUID(),
        console,
        lienId,
        randomBytes(32).toString('hex'),
        CONFIGURATION.session.kid,
        new Date(t0),
        new Date(t0 + MINUTE)
      );
    // Un second lien, pour ne pas buter sur l'unicité d'une session par lien.
    const autre = randomUUID();
    await sql(
      `INSERT INTO "liens_magiques" ("id","utilisateur_console_id","token_hash","kid","cree_at","expire_at")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      autre,
      id,
      randomBytes(32).toString('hex'),
      CONFIGURATION.lien.kid,
      new Date(t0),
      new Date(t0 + 15 * MINUTE)
    );
    expect(await refus(session(null, autre))).toContain('sessions_espace_une_population');
    expect(lienMagiqueId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('REQ-SEC-023 : la population d’un lien actif ne change pas après coup', async () => {
    const a = await utilisateur('admin');
    const b = await utilisateur('admin');
    const id = randomUUID();
    await sql(
      `INSERT INTO "liens_magiques" ("id","utilisateur_console_id","token_hash","kid","cree_at","expire_at")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      id,
      a,
      randomBytes(32).toString('hex'),
      CONFIGURATION.lien.kid,
      new Date(t0),
      new Date(t0 + 15 * MINUTE)
    );
    expect(
      await refus(
        sql(
          `UPDATE "liens_magiques" SET "utilisateur_console_id" = $2::uuid WHERE "id" = $1::uuid`,
          id,
          b
        )
      )
    ).toContain('liens_magiques_population_figee');
  });

  it('REQ-SEC-023 : la population d’une session ne change pas après coup', async () => {
    const a = await utilisateur('admin');
    const b = await utilisateur('admin');
    await ouvrir(a);
    const s = await base.prisma.sessionEspace.findFirstOrThrow({
      where: { utilisateurConsoleId: a },
    });
    expect(
      await refus(
        sql(
          `UPDATE "sessions_espace" SET "utilisateur_console_id" = $2::uuid WHERE "id" = $1::uuid`,
          s.id,
          b
        )
      )
    ).toContain('sessions_espace_population_figee');
  });

  it('REQ-SEC-023 : l’empreinte du courriel d’un utilisateur est unique et hexadécimale', async () => {
    const id = randomUUID();
    const { emailChiffre, emailHash } = colonnesPii(
      { modele: MODELE_UTILISATEUR_CONSOLE, id },
      { email: 'doublon@example.org' },
      CLES
    );
    const ecrire = (ligne: string, empreinte: string) =>
      sql(
        `INSERT INTO "utilisateurs_console" ("id","role","email_chiffre","email_hash","cree_at")
         VALUES ($1::uuid, 'lecteur', $2, $3, $4)`,
        ligne,
        Buffer.from(emailChiffre!),
        empreinte,
        new Date(t0)
      );
    await expect(ecrire(id, emailHash!)).resolves.toBe(1);
    expect(await refus(ecrire(randomUUID(), emailHash!))).toMatch(/email_hash/);
    expect(await refus(ecrire(randomUUID(), 'Z'.repeat(64)))).toContain(
      'utilisateurs_console_email_hash_hex'
    );
  });
});

/** Un apporteur minimal, pour éprouver le CHECK des deux populations sans buter sur la clé étrangère. */
async function apporteurTemoin(): Promise<string> {
  const id = randomUUID();
  await base.prisma.apporteur.create({
    data: {
      id,
      statut: 'signe',
      codeParrainage: 'AX7ZZZZZ',
      isTest: true,
      candidatureId: randomUUID(),
      reponsesJson: { version: 1 },
      scoreInitial: 50,
      scorePartsJson: { carnet: 50 },
      scoreBaremeVersion: 'bareme-essai',
      sourceCanal: null,
      parrainCodeCapture: null,
      creeAt: new Date(t0),
    },
  });
  return id;
}
