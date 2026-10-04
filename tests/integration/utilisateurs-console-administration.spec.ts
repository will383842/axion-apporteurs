// @req REQ-SEC-023
// @req REQ-SEC-003
// @req REQ-DM-024
// @req REQ-UX-047
// @req REQ-UX-048
/**
 * SEC-30 — les QUATRE YEUX sur les administrateurs de la console, et la version de session, en base
 * RÉELLE (forme d'A02, migration 20261003003300).
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
import { DUREES_AUTH } from '../../src/server/auth/durees';
import { empreinteDeSessionConsole, tirerJeton } from '../../src/server/auth/lien-magique';
import { transactionDeConsommationConsole } from '../../src/server/auth/lien-magique-depot';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';
import semerParDefaut, {
  semerSessionConsole,
  semerUtilisateurConsole,
} from '../../prisma/seed/06-console';
import {
  changerLeRole,
  desactiver as desactiverParLeServeur,
  ErreurAdministrationConsole,
  inviter,
  reactiver as reactiverParLeServeur,
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

/**
 * La console vide, SANS TRUNCATE : la cascade atteindrait les tables en ajout seul (`qualifications`,
 * `journal_acces_console`…), que le gabarit commun refuse de vider. Ces témoins ne créent que des
 * sessions et des liens : ils partent d'abord, puis les utilisateurs, un validateur après ceux qu'il a
 * validés (la validation est une clé étrangère RESTRICT). Une ligne qui resterait est une faute.
 */
async function viderLaConsole(): Promise<void> {
  const p = base.prisma;
  await p.$executeRawUnsafe('DELETE FROM sessions_espace WHERE utilisateur_console_id IS NOT NULL');
  await p.$executeRawUnsafe('DELETE FROM liens_magiques WHERE utilisateur_console_id IS NOT NULL');
  for (;;) {
    const n = await p.$executeRawUnsafe(
      `DELETE FROM utilisateurs_console u
       WHERE NOT EXISTS (SELECT 1 FROM utilisateurs_console v WHERE v.valide_par_id = u.id)`
    );
    if (n === 0) break;
  }
  expect(await p.utilisateurConsole.count()).toBe(0);
}

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
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await verdict(second)).toBe('admin_en_attente');
    await valider(app, second, premier);
    expect(await verdict(second)).toBe('admin');
  });

  it('REQ-SEC-023 : TÉMOIN — une auto-validation est refusée', async () => {
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await refus(valider(app, second, second))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN — un validateur en attente, désactivé ou non administrateur est refusé', async () => {
    await viderLaConsole();
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
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const autre = await utilisateur('admin');
    await valider(app, autre, premier);
    const cible = await utilisateur('admin');
    await valider(app, cible, premier);
    expect(await refus(valider(app, cible, autre))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN — un second « premier administrateur » est refusé dès qu’un admin validé existe', async () => {
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    expect(await refus(valider(app, second, null))).toMatch(/utilisateurs_console_quatre_yeux/);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX CONNEXIONS — deux « premiers administrateurs » simultanés : un succès, un refus nommé, jamais deux validés', async () => {
    await viderLaConsole();
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
    await viderLaConsole();
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
    await viderLaConsole();
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
    await viderLaConsole();
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
    await viderLaConsole();
    const seme = await utilisateur('comptable');
    const ligne = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: seme },
      select: { inviteeAt: true, activeeAt: true },
    });
    expect(ligne.inviteeAt).toBeNull();
    expect(ligne.activeeAt).not.toBeNull();

    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const { id: invite, courriels } = await inviter(app, {
      acteur: { id: premier, role: 'admin' },
      email: 'invitee-sec30@example.org',
      role: 'lecteur',
      cles: CLES,
      maintenant: new Date(t0),
      adresseConnexion: 'https://partners.example.org/console/connexion',
    });
    // L'invitation d'un lecteur : UN courriel, à l'invité, sans aucun jeton ni lien de connexion.
    expect(courriels.map((c) => [c.gabarit, c.a])).toEqual([
      ['invitation_console', 'invitee-sec30@example.org'],
    ]);
    expect(courriels[0]!.corps).toContain('https://partners.example.org/console/connexion ');
    expect(courriels[0]!.corps).not.toContain('/console/connexion/');
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: invite },
      select: { inviteeAt: true, activeeAt: true },
    });
    expect(l.activeeAt).toBeNull();
    expect(l.inviteeAt).not.toBeNull();
  });

  it('REQ-DM-024 : TÉMOIN — ni invité ni activé est refusé ; une activation antérieure à l’invitation est refusée', async () => {
    await viderLaConsole();
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
    await viderLaConsole();
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
    await viderLaConsole();
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
    await viderLaConsole();
    const ancien = await utilisateur('admin', new Date(t0 - 60_000));
    const recent = await utilisateur('admin', new Date(t0));
    const migration = readFileSync(
      join(RACINE, 'prisma/migrations/20261003003300_gestion_utilisateurs_console/migration.sql'),
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
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const c = await utilisateur('comptable');
    const avant = await evenements(c);
    await changerLeRole(app, {
      acteur: { id: premier, role: 'admin' },
      cibleId: c,
      vers: 'lecteur',
      maintenant: new Date(t0),
      cles: CLES,
    });
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: c },
      select: { role: true, sessionVersion: true },
    });
    expect(l).toEqual({ role: 'lecteur', sessionVersion: 1 });
    expect(await evenements(c)).toBe(avant + 1);
  });

  it('REQ-SEC-023 : TÉMOIN — l’auto-promotion est refusée, nommée, et rien n’est écrit', async () => {
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const err = await changerLeRole(app, {
      acteur: { id: premier, role: 'admin' },
      cibleId: premier,
      vers: 'lecteur',
      maintenant: new Date(t0),
      cles: CLES,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErreurAdministrationConsole);
    expect((err as ErreurAdministrationConsole).motif).toBe('auto_changement');
    expect(await evenements(premier)).toBe(0);
  });

  it('REQ-SEC-023 : TÉMOIN — un changement dont l’événement est refusé fait échouer la transaction : la désactivation n’a pas eu lieu', async () => {
    await viderLaConsole();
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

// Sécurité, point 2, option (a) : UNE session de console vivante par personne. L'ouverture d'une
// session neuve révoque les autres sessions ouvertes du même utilisateur, dans sa transaction.
describe('REQ-SEC-003 — SEC-30 : une seule session de console vivante par personne', () => {
  const jetonDe = async (utilisateurConsoleId: string) => {
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
  };
  const role = async (jeton: string) => {
    const v = await requireRole('ecran:accueil', jeton, {
      maintenant: () => maintenant,
      depot: depotDeSessionsConsole(base.prisma),
      configuration: CONFIGURATION.session,
    });
    return v.ok ? v.utilisateur.role : v.motif;
  };
  /** Une ouverture par le dépôt, comme la consommation d'un lien la fait. */
  const ouvrir = async (utilisateurConsoleId: string) => {
    const lien = await base.prisma.lienMagique.create({
      data: {
        utilisateurConsoleId,
        tokenHash: randomBytes(32).toString('hex'),
        kid: CONFIGURATION.lien.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0 + 15 * 60_000),
        consommeAt: new Date(t0),
      },
      select: { id: true },
    });
    const jeton = tirerJeton();
    await transactionDeConsommationConsole(app)(async (tx) => {
      if (!(await tx.utilisateurActif(utilisateurConsoleId, new Date(t0)))) return;
      await tx.ouvrirSessionConsole({
        utilisateurConsoleId,
        lienMagiqueId: lien.id,
        tokenHash: empreinteDeSessionConsole(jeton, CONFIGURATION.session.secret),
        kid: CONFIGURATION.session.kid,
        ipHash: null,
        creeAt: new Date(t0 + 1000),
        expireAt: new Date(t0 + 60 * 60_000),
        derniereVueAt: new Date(t0 + 1000),
      });
    });
    return jeton;
  };

  it('REQ-SEC-003 : TÉMOIN — deux sessions, puis une troisième ouverture : les deux premières sont révoquées et refusées à la requête suivante ; celle d’un AUTRE utilisateur reste vivante', async () => {
    await viderLaConsole();
    const c = await utilisateur('comptable');
    const autre = await utilisateur('comptable');
    const [s1, s2, sAutre] = [await jetonDe(c), await jetonDe(c), await jetonDe(autre)];
    expect(await role(s1)).toBe('comptable');
    const s3 = await ouvrir(c);
    expect(await role(s1)).toBe('revoquee');
    expect(await role(s2)).toBe('revoquee');
    expect(await role(s3)).toBe('comptable');
    expect(await role(sAutre)).toBe('comptable');
  });

  it('REQ-SEC-003 : TÉMOIN — une ouverture refusée (utilisateur désactivé, ou invitation échue) ne révoque rien et n’active rien', async () => {
    const sessions = (id: string) =>
      base.prisma.sessionEspace.findMany({
        where: { utilisateurConsoleId: id },
        select: { revoqueAt: true },
      });
    await viderLaConsole();
    const desactive = await utilisateur('comptable');
    await jetonDe(desactive);
    await base.prisma.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET desactive_at = clock_timestamp() WHERE id = $1::uuid',
      desactive
    );
    await ouvrir(desactive);
    expect(await sessions(desactive)).toEqual([{ revoqueAt: null }]);

    // Une invitation échue (non activée, invitée il y a le délai d'invitation) : refusée à
    // utilisateurActif, avant l'activation et avant la révocation.
    const echue = await utilisateur('comptable');
    await jetonDe(echue);
    await base.prisma.$executeRawUnsafe(
      'UPDATE utilisateurs_console SET activee_at = NULL, invitee_at = $2 WHERE id = $1::uuid',
      echue,
      new Date(t0 - DUREES_AUTH.invitationConsoleMs.valeur)
    );
    await ouvrir(echue);
    expect(await sessions(echue)).toEqual([{ revoqueAt: null }]);
    const l = await base.prisma.utilisateurConsole.findUniqueOrThrow({
      where: { id: echue },
      select: { activeeAt: true },
    });
    expect(l.activeeAt).toBeNull();
  });

  it('REQ-SEC-003 : TÉMOIN — une session de l’ESPACE n’est jamais touchée par la rotation de la console', async () => {
    await viderLaConsole();
    const c = await utilisateur('comptable');
    await jetonDe(c);
    // Une session de l'espace, d'un apporteur minimal : elle doit rester ouverte.
    const apporteurId = randomUUID();
    await base.prisma.apporteur.create({
      data: {
        id: apporteurId,
        statut: 'signe',
        codeParrainage: 'AX7SEC30',
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
    const lienEspace = await base.prisma.lienMagique.create({
      data: {
        apporteurId,
        tokenHash: randomBytes(32).toString('hex'),
        kid: CONFIGURATION.lien.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0 + 15 * 60_000),
        consommeAt: new Date(t0),
      },
      select: { id: true },
    });
    const espace = await base.prisma.sessionEspace.create({
      data: {
        apporteurId,
        lienMagiqueId: lienEspace.id,
        tokenHash: randomBytes(32).toString('hex'),
        kid: CONFIGURATION.session.kid,
        creeAt: new Date(t0),
        expireAt: new Date(t0 + 60 * 60_000),
      },
      select: { id: true },
    });
    await ouvrir(c);
    const apres = await base.prisma.sessionEspace.findUniqueOrThrow({
      where: { id: espace.id },
      select: { revoqueAt: true },
    });
    expect(apres.revoqueAt).toBeNull();
  });
});

describe('REQ-SEC-023 — SEC-30 : la création d’un administrateur est notifiée à tous les administrateurs', () => {
  it('REQ-SEC-023 : TÉMOIN — inviter un admin : l’invitation à l’invité, et admin_cree à CHAQUE admin actif, auteur et créé compris ; la phrase des quatre yeux quand un autre admin existe', async () => {
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    await valider(app, second, premier);
    const { courriels } = await inviter(app, {
      acteur: { id: premier, role: 'admin' },
      email: 'nouvel-admin-sec30@example.org',
      role: 'admin',
      cles: CLES,
      maintenant: new Date(t0),
      adresseConnexion: 'https://partners.example.org/console/connexion',
    });
    const parGabarit = (g: string) => courriels.filter((c) => c.gabarit === g);
    expect(parGabarit('invitation_console').map((c) => c.a)).toEqual([
      'nouvel-admin-sec30@example.org',
    ]);
    const creation = parGabarit('admin_cree');
    expect(creation).toHaveLength(3);
    expect(new Set(creation.map((c) => c.a)).size).toBe(3);
    expect(creation[0]!.corps).toContain('nouvel-admin-sec30@example.org a reçu le rôle');
    expect(creation[0]!.corps).toContain("n'a aucun droit d'administrateur");
  });

  it('REQ-SEC-023 : TÉMOIN — réactiver un admin : admin_reactive à CHAQUE admin actif, auteur et réactivé compris ; un autre rôle réactivé ne prévient personne', async () => {
    await viderLaConsole();
    const premier = await utilisateur('admin');
    await valider(app, premier, null);
    const second = await utilisateur('admin');
    await valider(app, second, premier);
    const acteur = { id: premier, role: 'admin' as const };
    await desactiverParLeServeur(app, { acteur, cibleId: second, maintenant: new Date(t0) });
    const { courriels } = await reactiverParLeServeur(app, {
      acteur,
      cibleId: second,
      maintenant: new Date(t0),
      cles: CLES,
    });
    expect(courriels.map((c) => c.gabarit)).toEqual(['admin_reactive', 'admin_reactive']);
    expect(new Set(courriels.map((c) => c.a)).size).toBe(2);
    expect(courriels[0]!.sujet).toBe('Un administrateur de la console a été réactivé');
    expect(courriels[0]!.corps).toMatch(
      /^Le compte d'administrateur de .+@example\.org a été réactivé dans la console d'Axion Partners par .+@example\.org, le /
    );
    expect(courriels[0]!.corps).toContain("Ce compte n'a aucun droit d'administrateur");
    // Un autre rôle réactivé : aucun courriel.
    const comptable = await utilisateur('comptable');
    await desactiverParLeServeur(app, { acteur, cibleId: comptable, maintenant: new Date(t0) });
    const autre = await reactiverParLeServeur(app, {
      acteur,
      cibleId: comptable,
      maintenant: new Date(t0),
      cles: CLES,
    });
    expect(autre.courriels).toEqual([]);
  });
});

describe('REQ-SEC-023 — SEC-30 : l’administrateur de preview semé est VALIDÉ', () => {
  it('REQ-SEC-023 : TÉMOIN — après le semeur, UN administrateur validé, qui en valide un second', async () => {
    await viderLaConsole();
    await semerParDefaut(base.prisma, { maintenant, uuid: () => randomUUID(), cles: CLES });
    const valides = await base.prisma.utilisateurConsole.findMany({
      where: { role: 'admin', valideAt: { not: null } },
      select: { id: true, valideParId: true },
    });
    expect(valides).toHaveLength(1);
    const preview = valides[0]!;
    expect(preview.valideParId).toBeNull();
    expect(await verdict(preview.id)).toBe('admin');
    const second = await utilisateur('admin');
    expect(await verdict(second)).toBe('admin_en_attente');
    await valider(app, second, preview.id);
    expect(await verdict(second)).toBe('admin');
  });
});
