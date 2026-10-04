// @req REQ-SEC-023
// @req REQ-SEC-003
// @req REQ-DM-024
// @req REQ-UX-047
// @req REQ-UX-048
/**
 * SEC-30 — les QUATRE YEUX sur les administrateurs de la console, et la version de session, en base
 * RÉELLE (forme d'A02, migration 20261003002300).
 *
 * Les écritures jugées passent sous `partners_app`, provisionné comme en production ; les fixtures et
 * les lectures restent sous le propriétaire. Chaque refus est attendu sur son NOM.
 *
 * La session d'APPORTEUR, qui copie la version de son apporteur, n'est pas touchée par la migration :
 * son témoin reste `sessions-revocables.spec.ts` (versions 0 puis 1), inchangé.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { demarrerBase, RACINE, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii } from '../../src/server/securite/pii';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';
import { semerSessionConsole, semerUtilisateurConsole } from '../../prisma/seed/06-console';
import {
  changerLeRole,
  desactiver as desactiverParLeServeur,
  ErreurAdministrationConsole,
  inviter,
} from '../../src/server/console/utilisateurs/administration';
import { ajouterEvenement } from '../../src/server/evenement/journal';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FormulaireDeDesactivation,
  FormulaireDInvitation,
} from '../../src/server/console/utilisateurs/formulaires';
import { UTILISATEURS_CONSOLE } from '../../src/content/micro-copy/console/utilisateurs';

// Le journal réel, épiable : un témoin fait refuser UN événement pour prouver que le geste tombe avec.
vi.mock('../../src/server/evenement/journal', async (original) => {
  const vrai = await original<typeof import('../../src/server/evenement/journal')>();
  return { ...vrai, ajouterEvenement: vi.fn(vrai.ajouterEvenement) };
});

let base: Base;
let app: PrismaClient;
let app2: PrismaClient;

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec30-base-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'd'.repeat(64),
});
const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};
const t0 = Date.now();
const maintenant = new Date(t0 + 60_000);

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  app2 = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await app2?.$disconnect();
  await base?.arreter();
});

let sequence = 0;
async function utilisateur(
  role: 'admin' | 'comptable' | 'qualifieur',
  creeAt = new Date(t0)
): Promise<string> {
  sequence += 1;
  const { id } = await semerUtilisateurConsole(base.prisma, {
    id: randomUUID(),
    role,
    email: `quatre-yeux-${sequence}@example.org`,
    nom: null,
    creeAt,
    cles: CLES,
  });
  return id;
}

async function refus(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('aucun refus');
}

/** Une validation écrite par le SERVEUR, sous `partners_app`. */
const valider = (client: PrismaClient, id: string, par: string | null) =>
  client.$executeRawUnsafe(
    'UPDATE utilisateurs_console SET valide_par_id = $2::uuid, valide_at = clock_timestamp() WHERE id = $1::uuid',
    id,
    par
  );

const tronquer = () => base.prisma.$executeRawUnsafe('TRUNCATE utilisateurs_console CASCADE');

async function verdict(utilisateurConsoleId: string): Promise<string> {
  const jetonSession = tirerJeton();
  await semerSessionConsole(base.prisma, {
    utilisateurConsoleId,
    jetonLien: tirerJeton(),
    jetonSession,
    consommeAt: new Date(t0),
    ipHash: null,
    configuration: CONFIGURATION,
  });
  const v = await requireRole('action:suspendre_apporteur', jetonSession, {
    maintenant: () => maintenant,
    depot: depotDeSessionsConsole(base.prisma),
    configuration: CONFIGURATION.session,
  });
  return v.ok ? v.utilisateur.role : v.motif;
}

describe('REQ-SEC-023 — SEC-30 : un administrateur est validé par un AUTRE administrateur', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un admin non validé est EN ATTENTE et refusé ; validé par un autre admin validé, même appel, il passe', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await verdict(second)).toBe('admin_en_attente');
    await valider(app, second, premier);
    expect(await verdict(second)).toBe('admin');
  });

  it('REQ-SEC-023 : TÉMOIN — une auto-validation est refusée', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await refus(valider(app, second, second))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN — un validateur en attente, désactivé ou non administrateur est refusé', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const enAttente = await utilisateur('admin');
    const cible = await utilisateur('admin');
    expect(await refus(valider(app, cible, enAttente))).toMatch(/utilisateurs_console_quatre_yeux/);

    const comptable = await utilisateur('comptable');
    expect(await refus(valider(app, cible, comptable))).toMatch(/utilisateurs_console_quatre_yeux/);

    const desactive = await utilisateur('admin');
    await valider(app, desactive, premier);
    await base.prisma.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET desactive_at = clock_timestamp(), email_chiffre = NULL, email_hash = NULL WHERE id = $1::uuid',
      desactive
    );
    expect(await refus(valider(app, cible, desactive))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN — une validation posée ne se réécrit pas', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const autre = await utilisateur('admin');
    await valider(app, autre, premier);
    const cible = await utilisateur('admin');
    await valider(app, cible, premier);
    expect(await refus(valider(app, cible, autre))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN — un second « premier administrateur » est refusé dès qu’un admin validé existe', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await refus(valider(app, second, null))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX CONNEXIONS — deux « premiers administrateurs » simultanés : un succès, un refus nommé, jamais deux validés', async () => {
    await tronquer();
    const a = await utilisateur('admin');
    const b = await utilisateur('admin');
    let relacherA: () => void = () => {};
    const aTient = new Promise<void>((r) => (relacherA = r));
    let aValide: () => void = () => {};
    const aAValide = new Promise<void>((r) => (aValide = r));
    const premiere = app.$transaction(async (tx) => {
      await valider(tx as unknown as PrismaClient, a, null);
      aValide();
      await aTient;
    });
    await aAValide;
    // La seconde attend le verrou de la première, puis lit sa validation commitée.
    const seconde = app2.$transaction(async (tx) => {
      await valider(tx as unknown as PrismaClient, b, null);
    });
    setTimeout(() => relacherA(), 200);
    const [ra, rb] = await Promise.allSettled([premiere, seconde]);
    expect(ra.status).toBe('fulfilled');
    expect(rb.status).toBe('rejected');
    expect(String((rb as PromiseRejectedResult).reason)).toMatch(
      /utilisateurs_console_quatre_yeux/
    );
    const valides = await base.prisma.utilisateurConsole.count({
      where: { role: 'admin', valideAt: { not: null } },
    });
    expect(valides).toBe(1);
  });

  it('REQ-SEC-023 : TÉMOIN — un passage vers admin remet en attente ; une validation posée sur un autre rôle est refusée', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const q = await utilisateur('qualifieur');
    expect(await refus(valider(app, q, premier))).toMatch(
      /utilisateurs_console_validation_admin|utilisateurs_console_quatre_yeux/
    );
    await app.$executeRawUnsafe(
      "UPDATE utilisateurs_console SET role = 'admin' WHERE id = $1::uuid",
      q
    );
    expect(await verdict(q)).toBe('admin_en_attente');
  });
});

describe('REQ-SEC-023 — SEC-30 : un administrateur réactivé repart en attente (forme d’A02)', () => {
  const desactiver = (id: string) =>
    app.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET desactive_at = clock_timestamp() WHERE id = $1::uuid',
      id
    );
  const reactiver = (id: string) =>
    app.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET desactive_at = NULL WHERE id = $1::uuid',
      id
    );

  it('REQ-SEC-023 : TÉMOIN — un admin désactivé puis réactivé est EN ATTENTE, refusé jusqu’à sa nouvelle validation', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    await valider(app, second, premier);
    await desactiver(second);
    await reactiver(second);
    expect(await verdict(second)).toBe('admin_en_attente');
    await valider(app, second, premier);
    expect(await verdict(second)).toBe('admin');
  });

  it('REQ-SEC-023 : un autre rôle se réactive sans changement de validation', async () => {
    await tronquer();
    const c = await utilisateur('comptable');
    await desactiver(c);
    await reactiver(c);
    const ligne = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: c },
      select: { desactiveAt: true, valideAt: true },
    });
    expect(ligne).toEqual({ desactiveAt: null, valideAt: null });
  });
});

describe('REQ-DM-024 — SEC-30 : l’invitation en base (forme d’A02)', () => {
  it('REQ-DM-024 : TÉMOIN — un compte créé sans les deux champs est activé au défaut ; un compte invité par le serveur a activee_at NULL', async () => {
    await tronquer();
    const seme = await utilisateur('comptable');
    const ligne = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: seme },
      select: { inviteeAt: true, activeeAt: true },
    });
    expect(ligne.inviteeAt).toBeNull();
    expect(ligne.activeeAt).not.toBeNull();

    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const invite = await inviter(app, {
      acteur: { id: premier, role: 'admin' },
      email: 'invitee-sec30@example.org',
      role: 'lecteur',
      cles: CLES,
      maintenant: new Date(t0),
    });
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: invite },
      select: { inviteeAt: true, activeeAt: true },
    });
    expect(l.activeeAt).toBeNull();
    expect(l.inviteeAt).not.toBeNull();
  });

  it('REQ-DM-024 : TÉMOIN — ni invité ni activé est refusé ; une activation antérieure à l’invitation est refusée', async () => {
    await tronquer();
    const c = await utilisateur('comptable');
    expect(
      await refus(
        app.$executeRawUnsafe(
          'UPDATE utilisateurs_console SET activee_at = NULL, invitee_at = NULL WHERE id = $1::uuid',
          c
        )
      )
    ).toContain('utilisateurs_console_invitee_ou_activee');
    expect(
      await refus(
        app.$executeRawUnsafe(
          "UPDATE utilisateurs_console SET invitee_at = activee_at + interval '1 hour' WHERE id = $1::uuid",
          c
        )
      )
    ).toContain('utilisateurs_console_activee_apres_invitation');
  });
});

describe('REQ-SEC-003 — SEC-30 : la version de session de la console', () => {
  it('REQ-SEC-003 : TÉMOIN — une session de la console COPIE la version de son utilisateur ; un changement de rôle l’incrémente d’un cran et la session ancienne tombe', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const c = await utilisateur('comptable');
    await app.$executeRawUnsafe(
      "UPDATE utilisateurs_console SET role = 'qualifieur' WHERE id = $1::uuid",
      c
    );
    const apres = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: c },
      select: { sessionVersion: true },
    });
    expect(apres.sessionVersion).toBe(1);
    const jetonSession = tirerJeton();
    const { sessionId } = await semerSessionConsole(base.prisma, {
      utilisateurConsoleId: c,
      jetonLien: tirerJeton(),
      jetonSession,
      consommeAt: new Date(t0),
      ipHash: null,
      configuration: CONFIGURATION,
    });
    const s = await base.prisma.sessionEspace.findUniqueOrThrow({
      where: { id: sessionId },
      select: { sessionVersion: true },
    });
    expect(s.sessionVersion).toBe(1);
  });

  it('REQ-SEC-003 : la version de session d’un utilisateur ne descend jamais', async () => {
    await tronquer();
    const c = await utilisateur('comptable');
    await app.$executeRawUnsafe(
      "UPDATE utilisateurs_console SET role = 'lecteur' WHERE id = $1::uuid",
      c
    );
    expect(
      await refus(
        base.prisma.$executeRawUnsafe(
          'UPDATE utilisateurs_console SET session_version = 0 WHERE id = $1::uuid',
          c
        )
      )
    ).toContain('utilisateurs_console_session_version_monotone');
  });
});

describe('REQ-SEC-023 — SEC-30 : la ligne de données de la migration ne valide que le plus ancien admin actif', () => {
  it('REQ-SEC-023 : TÉMOIN — sur une base à deux administrateurs, seul le plus ancien est validé après la ligne de la migration', async () => {
    await tronquer();
    const ancien = await utilisateur('admin', new Date(t0 - 60_000));
    const recent = await utilisateur('admin', new Date(t0));
    const migration = readFileSync(
      join(RACINE, 'prisma/migrations/20261003002300_gestion_utilisateurs_console/migration.sql'),
      'utf8'
    );
    const ligne = migration.slice(migration.lastIndexOf('UPDATE "utilisateurs_console"'));
    await base.prisma.$executeRawUnsafe(ligne);
    const valides = await base.prisma.utilisateurConsole.findMany({
      where: { valideAt: { not: null } },
      select: { id: true },
    });
    expect(valides.map((v) => v.id)).toEqual([ancien]);
    expect(recent).not.toBe(ancien);
  });
});

describe('REQ-SEC-023 — SEC-30 : les gestes du serveur, chacun avec son événement', () => {
  const evenements = (id: string) =>
    base.prisma.evenement.count({
      where: { type: 'utilisateur_console_modifie', agregatId: id },
    });

  it('REQ-SEC-023 : TÉMOIN — un admin change le rôle d’un autre : la version monte d’un cran et l’événement est écrit', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const c = await utilisateur('comptable');
    const avant = await evenements(c);
    await changerLeRole(app, {
      acteur: { id: premier, role: 'admin' },
      cibleId: c,
      vers: 'lecteur',
      maintenant: new Date(t0),
    });
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: c },
      select: { role: true, sessionVersion: true },
    });
    expect(l).toEqual({ role: 'lecteur', sessionVersion: 1 });
    expect(await evenements(c)).toBe(avant + 1);
  });

  it('REQ-SEC-023 : TÉMOIN — l’auto-promotion est refusée, nommée, et rien n’est écrit', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const err = await changerLeRole(app, {
      acteur: { id: premier, role: 'admin' },
      cibleId: premier,
      vers: 'lecteur',
      maintenant: new Date(t0),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErreurAdministrationConsole);
    expect((err as ErreurAdministrationConsole).motif).toBe('auto_changement');
    expect(await evenements(premier)).toBe(0);
  });

  it('REQ-SEC-023 : TÉMOIN — un changement dont l’événement est refusé fait échouer la transaction : la désactivation n’a pas eu lieu', async () => {
    await tronquer();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const c = await utilisateur('comptable');
    vi.mocked(ajouterEvenement).mockRejectedValueOnce(new Error('charge refusée'));
    await expect(
      desactiverParLeServeur(app, {
        acteur: { id: premier, role: 'admin' },
        cibleId: c,
        maintenant: new Date(t0),
      })
    ).rejects.toThrow('charge refusée');
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: c },
      select: { desactiveAt: true, sessionVersion: true },
    });
    expect(l).toEqual({ desactiveAt: null, sessionVersion: 0 });
  });
});

// REQ-UX-047 (acceptance (7) de la tâche) : inviter en quatre interactions au plus, désactiver en
// trois au plus. Compté comme REQ-UX-001 le compte : un champ rempli vaut une interaction, un choix
// dans un groupe en vaut une, un bouton en vaut une ; un champ caché n'en vaut aucune. Le parcours
// E2E réel est une dette de QA-T16 (aucun parcours Playwright n'existe encore).
describe('REQ-UX-047 REQ-UX-048 — SEC-30 : le budget d’interactions de l’écran des utilisateurs', () => {
  const action = async () => {};
  const interactions = (html: string) => {
    const champs = (html.match(/<input(?![^>]*type="(?:hidden|radio)")[^>]*>/g) ?? []).length;
    const groupes = new Set(
      [...html.matchAll(/<input[^>]*type="radio"[^>]*name="([^"]+)"/g)].map((m) => m[1])
    ).size;
    const boutons = (html.match(/<button[^>]*type="submit"/g) ?? []).length;
    return champs + groupes + boutons;
  };

  it('REQ-UX-047 REQ-UX-048 : TÉMOIN — inviter tient en quatre interactions au plus, et chaque rôle s’y explique en une phrase', () => {
    const html = renderToStaticMarkup(createElement(FormulaireDInvitation, { action }));
    expect(interactions(html)).toBeLessThanOrEqual(4);
    for (const phrase of Object.values(UTILISATEURS_CONSOLE.roles))
      expect(html).toContain(phrase.slice(0, 20));
  });

  it('REQ-UX-047 : TÉMOIN — désactiver tient en trois interactions au plus', () => {
    const html = renderToStaticMarkup(
      createElement(FormulaireDeDesactivation, { action, cibleId: randomUUID() })
    );
    expect(interactions(html)).toBeLessThanOrEqual(3);
  });
});
