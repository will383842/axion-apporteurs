// @req REQ-SEC-058
// @req REQ-SEC-023
/**
 * SEC-60 — la lecture du journal des accès à la console, en base RÉELLE : « réservée à un rôle nommé,
 * côté serveur, et se journalise elle-même » (condition de la sécurité sur le journal des accès, mot pour mot).
 *
 * Le rôle est nommé dans la matrice (`action:lire_journal_des_acces`, l'admin seul) ; le défaut est le
 * refus. Le lecteur unique relit le rôle du lecteur EN BASE, dans la transaction de la lecture : un rôle
 * non nommé, ou un admin désactivé, est refusé et rien n'est écrit. Une lecture autorisée écrit SA
 * ligne (`lecture_journal_acces`, la cible est l'utilisateur dont on lit les traces) AVANT de lire,
 * et ne rend que des identifiants : ni l'empreinte réseau, ni aucune donnée de personne.
 * Sous `partners_app`, le rôle du serveur.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type ConsoleRole } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import {
  CibleInconnue,
  CurseurDuJournalIllisible,
  LectureDuJournalRefusee,
  lireLeJournalDesAcces,
  type TraceDAcces,
} from '../../src/server/console/journal-des-acces';
import { PARAMETRES } from '../../src/domain/seuils/ssot';
import { ROLES_CONSOLE } from '../../src/server/roles/matrice';
import {
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../src/server/taches/purger-journal-acces-console';
import { clesPii, colonnesPii, empreinteAdresseReseau } from '../../src/server/securite/pii';
import { MODELE_UTILISATEUR_CONSOLE } from '../../prisma/seed/06-console';
import { NOMS_DES_SECRETS } from '../../src/lib/env';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

const ADRESSE = '203.0.113.9';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const cles = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-60-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'f'.repeat(64),
});
const IP_HASH = empreinteAdresseReseau(ADRESSE, cles);

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

/**
 * Quatre yeux : un administrateur semé sans validation est EN ATTENTE. Le premier se
 * valide lui-même (premier administrateur, sans validateur) ; chaque admin suivant est validé par lui.
 */
let fondateur: string | null = null;
async function unUtilisateur(role: ConsoleRole, desactiveAt: Date | null = null): Promise<string> {
  const creeAt = new Date('2026-01-01T00:00:00.000Z');
  if (role !== 'admin')
    return (
      await base.prisma.utilisateurConsole.create({
        data: { ...uneAdresse(), role, creeAt, desactiveAt },
      })
    ).id;
  if (fondateur === null)
    fondateur = (
      await base.prisma.utilisateurConsole.create({
        data: { ...uneAdresse(), role: 'admin', creeAt, valideAt: creeAt, valideParId: null },
      })
    ).id;
  return (
    await base.prisma.utilisateurConsole.create({
      data: {
        ...uneAdresse(),
        role: 'admin',
        creeAt,
        desactiveAt,
        valideAt: creeAt,
        valideParId: fondateur,
      },
    })
  ).id;
}

/** Un administrateur EN ATTENTE : aucune validation posée. */
async function unAdminEnAttente(): Promise<string> {
  return (
    await base.prisma.utilisateurConsole.create({
      data: { ...uneAdresse(), role: 'admin', creeAt: new Date('2026-01-01T00:00:00.000Z') },
    })
  ).id;
}

/**
 * Un compte de console actif porte son adresse (CHECK `utilisateurs_console_adresse_si_actif`) :
 * chiffrée et en empreinte, liées à la ligne, comme le fait `semerUtilisateurConsole`.
 */
function uneAdresse(): { id: string; emailChiffre: Buffer; emailHash: string } {
  const id = randomUUID();
  const { emailChiffre, emailHash } = colonnesPii(
    { modele: MODELE_UTILISATEUR_CONSOLE, id },
    { email: `console-${id}@exemple.invalid`, nom: null },
    cles
  );
  if (!emailChiffre || !emailHash) throw new Error('colonnes de courriel absentes');
  return { id, emailChiffre: Buffer.from(emailChiffre), emailHash };
}

/** Une connexion de l'utilisateur, posée à la date donnée : la trace qu'on viendra lire. */
async function uneConnexion(utilisateurConsoleId: string, survenuAt: Date): Promise<string> {
  const id = randomUUID();
  await base.prisma.journalAccesConsole.create({
    data: { id, utilisateurConsoleId, nature: 'connexion', ipHash: IP_HASH, survenuAt },
  });
  return id;
}

const lignesDe = (utilisateurConsoleId: string) =>
  base.prisma.journalAccesConsole.findMany({ where: { utilisateurConsoleId } });

describe('REQ-SEC-058 — la lecture du journal des accès est réservée à un rôle nommé, côté serveur', () => {
  it('REQ-SEC-058 : TÉMOIN — chaque rôle non nommé est refusé par le serveur, et rien n’est écrit', async () => {
    const cible = await unUtilisateur('lecteur');
    await uneConnexion(cible, new Date('2026-03-01T08:00:00.000Z'));
    for (const role of ROLES_CONSOLE.filter((r) => r !== 'admin')) {
      const lecteur = await unUtilisateur(role);
      await expect(
        lireLeJournalDesAcces(
          app,
          { lecteurId: lecteur, utilisateurConsoleId: cible, adresse: ADRESSE },
          cles
        )
      ).rejects.toBeInstanceOf(LectureDuJournalRefusee);
      expect(await lignesDe(lecteur)).toHaveLength(0);
    }
  });

  it('REQ-SEC-058 : TÉMOIN — un admin désactivé, ou un lecteur inconnu, est refusé, et rien n’est écrit', async () => {
    const cible = await unUtilisateur('comptable');
    const ancien = await unUtilisateur('admin', new Date('2026-02-01T00:00:00.000Z'));
    for (const lecteurId of [ancien, randomUUID()]) {
      await expect(
        lireLeJournalDesAcces(app, { lecteurId, utilisateurConsoleId: cible, adresse: null }, cles)
      ).rejects.toBeInstanceOf(LectureDuJournalRefusee);
    }
    expect(await lignesDe(ancien)).toHaveLength(0);
  });

  it('REQ-SEC-058 : TÉMOIN À DEUX FACES — un administrateur EN ATTENTE est refusé sans qu’aucune ligne soit lue ; validé par un autre, le même appel passe', async () => {
    const cible = await unUtilisateur('lecteur');
    const enAttente = await unAdminEnAttente();
    const lire = () =>
      lireLeJournalDesAcces(
        app,
        { lecteurId: enAttente, utilisateurConsoleId: cible, adresse: null },
        cles
      );
    await expect(lire()).rejects.toBeInstanceOf(LectureDuJournalRefusee);
    expect(await lignesDe(enAttente)).toHaveLength(0);
    const validateur = await unUtilisateur('admin');
    await base.prisma.utilisateurConsole.update({
      where: { id: enAttente },
      data: { valideAt: new Date('2026-01-02T00:00:00.000Z'), valideParId: validateur },
    });
    await expect(lire()).resolves.toEqual({ traces: [], suivant: null });
    expect(await lignesDe(enAttente)).toHaveLength(1);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — le même appel, par l’admin actif, passe', async () => {
    const cible = await unUtilisateur('qualifieur');
    const admin = await unUtilisateur('admin');
    const page = await lireLeJournalDesAcces(
      app,
      { lecteurId: admin, utilisateurConsoleId: cible, adresse: ADRESSE },
      cles
    );
    expect(page).toEqual({ traces: [], suivant: null });
  });
});

describe('REQ-SEC-058 — la lecture du journal se journalise elle-même, par identifiants seuls', () => {
  it('REQ-SEC-058 : TÉMOIN — une lecture autorisée écrit UNE ligne à son nom, la cible étant l’utilisateur lu', async () => {
    const cible = await unUtilisateur('lecteur');
    const admin = await unUtilisateur('admin');
    await lireLeJournalDesAcces(
      app,
      { lecteurId: admin, utilisateurConsoleId: cible, adresse: ADRESSE },
      cles
    );
    const lignes = await lignesDe(admin);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      nature: 'lecture_journal_acces',
      cibleId: cible,
      ipHash: IP_HASH,
      purgeAt: null,
    });
  });

  it('REQ-SEC-058 : TÉMOIN — les traces rendues sont celles de l’utilisateur lu, les plus récentes d’abord, sans empreinte réseau', async () => {
    const cible = await unUtilisateur('comptable');
    const admin = await unUtilisateur('admin');
    const ancienne = await uneConnexion(cible, new Date('2026-03-01T08:00:00.000Z'));
    const recente = await uneConnexion(cible, new Date('2026-03-02T08:00:00.000Z'));
    const { traces } = await lireLeJournalDesAcces(
      app,
      { lecteurId: admin, utilisateurConsoleId: cible, adresse: ADRESSE },
      cles
    );
    expect(traces.map((t) => t.id)).toEqual([recente, ancienne]);
    for (const t of traces) {
      expect(Object.keys(t).sort()).toEqual(['cibleId', 'id', 'nature', 'survenuAt']);
    }
  });

  it('REQ-SEC-058 : TÉMOIN — lire ses propres traces est journalisé, la cible étant le lecteur lui-même', async () => {
    const admin = await unUtilisateur('admin');
    const { traces } = await lireLeJournalDesAcces(
      app,
      { lecteurId: admin, utilisateurConsoleId: admin, adresse: null },
      cles
    );
    // La ligne est écrite AVANT la lecture : le lecteur la voit déjà parmi ses traces.
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ nature: 'lecture_journal_acces', cibleId: admin });
    expect(await lignesDe(admin)).toHaveLength(1);
  });

  it('REQ-SEC-058 : TÉMOIN — une cible inconnue n’écrit rien et ne lit rien', async () => {
    const admin = await unUtilisateur('admin');
    await expect(
      lireLeJournalDesAcces(
        app,
        { lecteurId: admin, utilisateurConsoleId: randomUUID(), adresse: ADRESSE },
        cles
      )
    ).rejects.toBeInstanceOf(CibleInconnue);
    expect(await lignesDe(admin)).toHaveLength(0);
  });
});

describe('REQ-SEC-058 — la lecture est bornée et paginée par curseur, en base réelle (SEC-67)', () => {
  it('REQ-SEC-058 : TÉMOIN — la traversée par curseur rend tout le journal de l’utilisateur lu, une fois, dans l’ordre de la base (survenu_at desc, id desc), malgré les égalités de date ; chaque page est bornée et tracée', async () => {
    const borne = PARAMETRES.JOURNAL_DES_ACCES_PAGE_MAX.valeur;
    const cible = await unUtilisateur('qualifieur');
    const voisin = await unUtilisateur('comptable');
    const admin = await unUtilisateur('admin');
    const debut = new Date('2026-04-01T08:00:00.000Z').getTime();
    for (let k = 0; k < borne * 2 + 3; k += 1) {
      // Trois traces par milliseconde : seul `id` les départage.
      const quand = new Date(debut + Math.floor(k / 3));
      await uneConnexion(cible, quand);
      await uneConnexion(voisin, quand);
    }
    const ordreDeLaBase = (
      await base.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text AS id FROM journal_acces_console
         WHERE utilisateur_console_id = $1::uuid ORDER BY survenu_at DESC, id DESC`,
        cible
      )
    ).map((l) => l.id);
    const vues: TraceDAcces[] = [];
    let curseur: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof lireLeJournalDesAcces>> = await lireLeJournalDesAcces(
        app,
        { lecteurId: admin, utilisateurConsoleId: cible, adresse: null, curseur },
        cles
      );
      expect(page.traces.length).toBeLessThanOrEqual(borne);
      vues.push(...page.traces);
      curseur = page.suivant;
      pages += 1;
    } while (curseur !== null && pages < 10);
    expect(pages).toBe(3);
    expect(vues.map((t) => t.id)).toEqual(ordreDeLaBase);
    expect(ordreDeLaBase).toHaveLength(borne * 2 + 3);
    const lectures = await lignesDe(admin);
    expect(lectures).toHaveLength(pages);
    expect(lectures.every((l) => l.nature === 'lecture_journal_acces' && l.cibleId === cible)).toBe(
      true
    );
  });

  it('REQ-SEC-058 : TÉMOIN — le curseur d’un autre utilisateur est refusé sans rien écrire ni rien lire', async () => {
    const borne = PARAMETRES.JOURNAL_DES_ACCES_PAGE_MAX.valeur;
    const cible = await unUtilisateur('lecteur');
    const autre = await unUtilisateur('lecteur');
    const admin = await unUtilisateur('admin');
    for (let k = 0; k < borne + 1; k += 1)
      await uneConnexion(autre, new Date(Date.UTC(2026, 4, 1, 8, 0, 0, k)));
    const { suivant } = await lireLeJournalDesAcces(
      app,
      { lecteurId: admin, utilisateurConsoleId: autre, adresse: null },
      cles
    );
    expect(suivant).not.toBeNull();
    const avant = (await lignesDe(admin)).length;
    await expect(
      lireLeJournalDesAcces(
        app,
        { lecteurId: admin, utilisateurConsoleId: cible, adresse: null, curseur: suivant },
        cles
      )
    ).rejects.toBeInstanceOf(CurseurDuJournalIllisible);
    expect(await lignesDe(admin)).toHaveLength(avant);
  });
});

describe('REQ-SEC-058 — la valeur `lecture_journal_acces`, sous la forme commune du journal', () => {
  it('REQ-SEC-058 : TÉMOIN — après les migrations, la valeur existe dans l’enum de la base', async () => {
    const valeurs = (
      await base.prisma.$queryRawUnsafe<{ v: string }[]>(
        `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'nature_acces_console' ORDER BY e.enumsortorder`
      )
    ).map((r) => r.v);
    expect(valeurs).toContain('lecture_journal_acces');
  });

  it('REQ-SEC-058 : TÉMOIN — une ligne `lecture_journal_acces` sans cible est refusée sur le nom du CHECK', async () => {
    const admin = await unUtilisateur('admin');
    await expect(
      app.journalAccesConsole.create({
        data: {
          id: randomUUID(),
          utilisateurConsoleId: admin,
          nature: 'lecture_journal_acces',
          ipHash: IP_HASH,
        },
      })
    ).rejects.toThrow(/journal_acces_console_cible/);
  });

  it('REQ-SEC-058 : TÉMOIN — la purge vide la ligne comme les autres, puis la ligne nue reste', async () => {
    const admin = await unUtilisateur('admin');
    const cible = await unUtilisateur('lecteur');
    const maintenant = new Date('2028-06-01T12:00:00.000Z');
    const id = randomUUID();
    await base.prisma.journalAccesConsole.create({
      data: {
        id,
        utilisateurConsoleId: admin,
        nature: 'lecture_journal_acces',
        cibleId: cible,
        ipHash: IP_HASH,
        survenuAt: new Date(limiteDuJournalDesAcces(maintenant).getTime() - 1),
      },
    });
    await purgerLeJournalDesAccesConsole(app, maintenant);
    expect(
      await base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id } })
    ).toMatchObject({
      nature: 'lecture_journal_acces',
      utilisateurConsoleId: null,
      cibleId: null,
      ipHash: null,
      purgeAt: maintenant,
    });
  });
});
