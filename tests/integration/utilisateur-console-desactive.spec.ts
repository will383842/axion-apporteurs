// @req REQ-SEC-023
/**
 * L'adresse d'un utilisateur de la console DÉSACTIVÉ peut être effacée (REQ-SEC-023,
 * HYP-A02-RETENTION ; écart B-04 de la vérification V2).
 *
 * CE QUE LA BASE TIENT, CONTRE TOUT APPELANT :
 *   — un utilisateur ACTIF a toujours son adresse, chiffrée ET empreinte : sans elle, le lien de
 *     connexion n'aurait plus de destinataire ;
 *   — un utilisateur DÉSACTIVÉ peut ne plus en avoir : l'effacement est admis ;
 *   — le bloc chiffré et l'empreinte vont ENSEMBLE : jamais l'un sans l'autre ;
 *   — l'unicité de l'empreinte ne vaut que sur les valeurs non nulles : deux effacés ne se gênent pas ;
 *   — réactiver un utilisateur sans adresse est refusé.
 * Aucune adresse réelle : le domaine est réservé (`.invalid`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { demarrerBase, type Base } from './harnais';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, colonnesPii } from '../../src/server/securite/pii';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';
import { MODELE_UTILISATEUR_CONSOLE, semerSessionConsole } from '../../prisma/seed/06-console';

let base: Base;

beforeAll(async () => {
  base = await demarrerBase();
}, 180_000);

afterAll(async () => {
  await base?.arreter();
});

const CLE_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-desactive-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: CLE_HEX,
});

const CREE = new Date('2026-10-01T08:00:00.000Z');
const DESACTIVE = new Date('2026-10-02T08:00:00.000Z');
const CONTRAINTE = 'utilisateurs_console_adresse_si_actif';

let sequence = 0;
/** L'adresse chiffrée et son empreinte, liées à la ligne `id`. */
function adresse(id: string): { chiffre: Buffer; empreinte: string } {
  sequence += 1;
  const c = colonnesPii(
    { modele: MODELE_UTILISATEUR_CONSOLE, id },
    { email: `desactive-${sequence}@exemple.invalid` },
    CLES
  );
  return { chiffre: Buffer.from(c.emailChiffre!), empreinte: c.emailHash! };
}

const inserer = (
  id: string,
  chiffre: Buffer | null,
  empreinte: string | null,
  desactiveAt: Date | null
) =>
  base.prisma.$executeRawUnsafe(
    `INSERT INTO "utilisateurs_console" ("id","role","email_chiffre","email_hash","cree_at","desactive_at")
     VALUES ($1::uuid, 'lecteur', $2, $3, $4, $5)`,
    id,
    chiffre,
    empreinte,
    CREE,
    desactiveAt
  );

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-SEC-023 — l’adresse d’un utilisateur de la console, et sa désactivation', () => {
  it('REQ-SEC-023 : TÉMOIN — un utilisateur ACTIF sans adresse est refusé par la base', async () => {
    expect(await refus(inserer(randomUUID(), null, null, null))).toContain(CONTRAINTE);
  });

  it('REQ-SEC-023 : TÉMOIN — un utilisateur DÉSACTIVÉ sans adresse est admis', async () => {
    await expect(inserer(randomUUID(), null, null, DESACTIVE)).resolves.toBe(1);
  });

  it('REQ-SEC-023 : le bloc chiffré et l’empreinte vont ensemble, même désactivé', async () => {
    const id = randomUUID();
    const a = adresse(id);
    expect(await refus(inserer(id, a.chiffre, null, DESACTIVE))).toContain(CONTRAINTE);
    expect(await refus(inserer(randomUUID(), null, a.empreinte, DESACTIVE))).toContain(CONTRAINTE);
  });

  it('REQ-SEC-023 : l’adresse d’un utilisateur désactivé s’efface ; le réactiver sans adresse est refusé', async () => {
    const id = randomUUID();
    const a = adresse(id);
    await inserer(id, a.chiffre, a.empreinte, null);
    // Actif : l'effacement est refusé.
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE "utilisateurs_console" SET "email_chiffre" = NULL, "email_hash" = NULL WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toContain(CONTRAINTE);
    // Désactivé, puis effacé.
    await base.prisma.$executeRawUnsafe(
      `UPDATE "utilisateurs_console" SET "desactive_at" = $2 WHERE "id" = $1::uuid`,
      id,
      DESACTIVE
    );
    await expect(
      base.prisma.$executeRawUnsafe(
        `UPDATE "utilisateurs_console" SET "email_chiffre" = NULL, "email_hash" = NULL WHERE "id" = $1::uuid`,
        id
      )
    ).resolves.toBe(1);
    const u = await base.prisma.utilisateurConsole.findUniqueOrThrow({ where: { id } });
    expect(u.emailChiffre).toBeNull();
    expect(u.emailHash).toBeNull();
    // Réactivé sans adresse : refusé.
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          `UPDATE "utilisateurs_console" SET "desactive_at" = NULL WHERE "id" = $1::uuid`,
          id
        )
      )
    ).toContain(CONTRAINTE);
  });

  it('REQ-SEC-023 : un utilisateur désactivé SANS adresse ne se connecte pas — sa session est refusée', async () => {
    const id = randomUUID();
    await inserer(id, null, null, DESACTIVE);
    const secretLien = randomBytes(32).toString('hex');
    const secretSession = randomBytes(32).toString('hex');
    const configuration = {
      lien: { secret: secretLien, kid: kidDe(secretLien) },
      session: { secret: secretSession, kid: kidDe(secretSession) },
    };
    const jetonSession = tirerJeton();
    await semerSessionConsole(base.prisma, {
      utilisateurConsoleId: id,
      jetonLien: tirerJeton(),
      jetonSession,
      consommeAt: CREE,
      ipHash: null,
      configuration,
    });
    const v = await requireRole('action:lever_gel', jetonSession, {
      maintenant: () => new Date(CREE.getTime() + 60_000),
      depot: depotDeSessionsConsole(base.prisma),
      configuration: configuration.session,
    });
    expect(v).toEqual({ ok: false, motif: 'desactive' });
  });

  it('REQ-SEC-023 : l’unicité de l’empreinte ne vaut que sur les valeurs non nulles', async () => {
    await expect(inserer(randomUUID(), null, null, DESACTIVE)).resolves.toBe(1);
    await expect(inserer(randomUUID(), null, null, DESACTIVE)).resolves.toBe(1);
    const id = randomUUID();
    const a = adresse(id);
    await expect(inserer(id, a.chiffre, a.empreinte, null)).resolves.toBe(1);
    expect(await refus(inserer(randomUUID(), a.chiffre, a.empreinte, DESACTIVE))).toMatch(
      /email_hash/
    );
  });
});
