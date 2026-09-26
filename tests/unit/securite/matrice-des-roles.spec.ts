// @req REQ-SEC-023
// @req REQ-UX-024
/**
 * `matrice-des-roles.spec.ts` — les rôles de la console (SEC-17) : la matrice droits × rôles en UN
 * fichier, `requireRole` relu en base à chaque requête, et la garde qui confronte le disque à la
 * matrice. REQ-UX-024 est absorbée par REQ-SEC-023 : le texte en vigueur est celui de REQ-SEC-023.
 *
 * CE QU'IL PROUVE, SANS BASE (les témoins de ce que la BASE tient — le CHECK de population, la
 * clé étrangère, le semeur — vivent dans `tests/integration/utilisateurs-console.spec.ts`).
 *   1. Les rôles sont ceux de l'enum du schéma, jamais une liste retapée.
 *   2. LE DÉFAUT EST LE REFUS : un droit absent de la matrice est refusé, pour tous les rôles,
 *      `admin` compris, et même un nom hérité d'`Object.prototype`.
 *   3. Les opérations les plus sensibles sont nommément restreintes : ni `qualifieur` ni `lecteur`
 *      n'ont un seul des sept droits sensibles ; `comptable` n'a ni la levée de gel, ni la
 *      suspension, ni la résiliation, ni l'export DAS2.
 *   4. TÉMOIN À DEUX FACES sur le refus par défaut : un rôle non admin qui appelle une action
 *      réservée reçoit le refus ; le même appel, par le rôle autorisé, passe.
 *   5. Le rôle est RELU à chaque requête : changé en base entre deux appels, le verdict suit ; un
 *      utilisateur désactivé ne franchit plus la requête SUIVANTE (même session, même horloge).
 *   6. Une session de l'espace apporteur n'ouvre rien dans la console, et un lien ou une session de
 *      la console n'ouvre rien dans l'espace.
 *   7. TÉMOIN À DEUX FACES sur la garde : une action de console ajoutée sans entrée dans la matrice
 *      la fait rougir en NOMMANT l'action ; la console du dépôt la fait sortir en zéro avec le
 *      compte des couples confrontés.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { ConsoleRole, type PrismaClient } from '@prisma/client';
import { kidDe } from '../../../src/lib/env';
import {
  consommerLien,
  empreinteDeSession,
  empreinteDuJeton,
  type PortsDeConsommation,
  type TransactionDeConsommation,
} from '../../../src/server/auth/lien-magique';
import { jugerSession, type LigneDeSession } from '../../../src/server/auth/session';
import { MATRICE_DES_ROLES, ROLES_CONSOLE, roleAutorise } from '../../../src/server/roles/matrice';
import {
  MOTIFS_DE_REFUS_CONSOLE,
  depotDeSessionsConsole,
  jugerAcces,
  requireRole,
  type LigneDeSessionConsole,
  type PortsDeRole,
} from '../../../src/server/roles/require-role';
import { FAMILLES, jugerLaConsole, type FichierDeConsole } from '../../../scripts/gates/roles';

const SECRET = 'temoin-sec17-secret-de-session-'.padEnd(64, '7');
const KID = kidDe(SECRET);
const T0 = new Date(Date.UTC(2026, 8, 27, 8, 0, 0));
const HEURE = 60 * 60 * 1000;
const JETON = 'C'.repeat(43);

/** Les sept droits que REQ-SEC-023 réserve, nommés comme la matrice les nomme. */
const SENSIBLES = [
  'action:voir_iban_en_clair',
  'action:approuver_lot',
  'action:exporter_pain001',
  'action:lever_gel',
  'action:suspendre_apporteur',
  'action:resilier_apporteur',
  'action:exporter_das2',
] as const;

// ── 1. les rôles et la matrice ───────────────────────────────────────────────────────────────────

describe('REQ-SEC-023 — les quatre rôles et la matrice unique', () => {
  it('REQ-SEC-023 : les rôles sont ceux de l’enum `ConsoleRole` du schéma, dans son ordre', () => {
    expect(ROLES_CONSOLE).toEqual(Object.values(ConsoleRole));
    expect(ROLES_CONSOLE).toEqual(['admin', 'qualifieur', 'comptable', 'lecteur']);
  });

  it('REQ-SEC-023 : chaque droit de la matrice ne nomme que des rôles de l’enum, sans doublon', () => {
    for (const [droit, roles] of Object.entries(MATRICE_DES_ROLES)) {
      expect(droit).toMatch(/^(action|ecran):[a-z0-9_]+$/);
      expect(roles.length).toBeGreaterThan(0);
      expect(new Set(roles).size).toBe(roles.length);
      for (const r of roles) expect(ROLES_CONSOLE).toContain(r);
    }
  });

  it('REQ-SEC-023 / REQ-UX-024 : un droit ABSENT de la matrice est refusé à tous les rôles, admin compris', () => {
    for (const droit of ['action:absente', 'ecran:absent', 'constructor', 'toString', '']) {
      for (const role of ROLES_CONSOLE) expect(roleAutorise(droit, role)).toBe(false);
    }
  });

  it('REQ-SEC-023 : aucun des sept droits sensibles n’est ouvert au `qualifieur` ni au `lecteur`', () => {
    for (const droit of SENSIBLES) {
      expect(Object.hasOwn(MATRICE_DES_ROLES, droit)).toBe(true);
      expect(roleAutorise(droit, 'qualifieur')).toBe(false);
      expect(roleAutorise(droit, 'lecteur')).toBe(false);
      expect(roleAutorise(droit, 'admin')).toBe(true);
    }
  });

  it('REQ-SEC-023 : le `comptable` voit l’IBAN, approuve le lot et produit le pain.001 — rien de plus', () => {
    const duComptable = SENSIBLES.filter((d) => roleAutorise(d, 'comptable'));
    expect(duComptable).toEqual([
      'action:voir_iban_en_clair',
      'action:approuver_lot',
      'action:exporter_pain001',
    ]);
  });
});

// ── 2. requireRole, relu en base à chaque requête ────────────────────────────────────────────────

type Utilisateur = { id: string; role: ConsoleRole; desactiveAt: Date | null };

type Session = Omit<LigneDeSessionConsole, 'utilisateurConsole'>;

/** Une session de la console valide À T0 : chaque champ que le juge lit est écrit (RM-11). */
const valide = (): Session => ({
  kid: KID,
  expireAt: new Date(T0.getTime() + HEURE),
  revoqueAt: null,
});

/** Un dépôt en mémoire qui relit son état À CHAQUE appel, et compte ses lectures. */
function univers(utilisateur: Utilisateur | null, ligne: Session) {
  const lectures: string[] = [];
  const etat = { utilisateur, ligne, lectures };
  const ports: PortsDeRole = {
    maintenant: () => T0,
    configuration: { secret: SECRET, kid: KID },
    depot: {
      lire: async (tokenHash) => {
        etat.lectures.push(tokenHash);
        if (tokenHash !== empreinteDeSession(JETON, SECRET)) return null;
        return {
          ...etat.ligne,
          utilisateurConsole: etat.utilisateur === null ? null : { ...etat.utilisateur },
        };
      },
    },
  };
  return { etat, ports };
}

const comptable = (): Utilisateur => ({ id: 'u-comptable', role: 'comptable', desactiveAt: null });
const admin = (): Utilisateur => ({ id: 'u-admin', role: 'admin', desactiveAt: null });

describe('REQ-SEC-023 — requireRole : le défaut est le refus, le rôle est relu à chaque requête', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `comptable` sur la levée de gel est refusé ; `admin`, même appel, passe', async () => {
    const refuse = univers(comptable(), valide());
    expect(await requireRole('action:lever_gel', JETON, refuse.ports)).toEqual({
      ok: false,
      motif: 'role_refuse',
    });
    const autorise = univers(admin(), valide());
    expect(await requireRole('action:lever_gel', JETON, autorise.ports)).toEqual({
      ok: true,
      utilisateur: { id: 'u-admin', role: 'admin' },
    });
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `qualifieur` sur l’IBAN en clair est refusé ; `comptable` passe', async () => {
    const q = univers({ id: 'u-q', role: 'qualifieur', desactiveAt: null }, valide());
    expect(await requireRole('action:voir_iban_en_clair', JETON, q.ports)).toEqual({
      ok: false,
      motif: 'role_refuse',
    });
    const c = univers(comptable(), valide());
    expect((await requireRole('action:voir_iban_en_clair', JETON, c.ports)).ok).toBe(true);
  });

  it('REQ-SEC-023 / REQ-UX-024 : un droit absent de la matrice est refusé même à `admin`, avec son motif', async () => {
    const u = univers(admin(), valide());
    const absent = 'action:inventee' as Parameters<typeof requireRole>[0];
    expect(await requireRole(absent, JETON, u.ports)).toEqual({
      ok: false,
      motif: 'droit_absent',
    });
    const herite = 'constructor' as Parameters<typeof requireRole>[0];
    expect(await requireRole(herite, JETON, u.ports)).toEqual({ ok: false, motif: 'droit_absent' });
  });

  it('REQ-SEC-023 : le rôle est RELU en base à chaque requête — changé entre deux appels, le verdict suit', async () => {
    const u = univers(comptable(), valide());
    expect((await requireRole('action:approuver_lot', JETON, u.ports)).ok).toBe(true);
    u.etat.utilisateur = { ...comptable(), role: 'lecteur' };
    expect(await requireRole('action:approuver_lot', JETON, u.ports)).toEqual({
      ok: false,
      motif: 'role_refuse',
    });
    expect(u.etat.lectures).toEqual([
      empreinteDeSession(JETON, SECRET),
      empreinteDeSession(JETON, SECRET),
    ]);
  });

  it('REQ-SEC-023 : un utilisateur désactivé ne franchit plus la requête SUIVANTE — même session, même horloge', async () => {
    const u = univers(admin(), valide());
    expect((await requireRole('action:exporter_das2', JETON, u.ports)).ok).toBe(true);
    u.etat.utilisateur = { ...admin(), desactiveAt: T0 };
    expect(await requireRole('action:exporter_das2', JETON, u.ports)).toEqual({
      ok: false,
      motif: 'desactive',
    });
  });

  it('REQ-SEC-023 : une désactivation DATÉE DANS LE FUTUR refuse déjà — le refus ne dépend pas de l’horloge', async () => {
    const u = univers({ ...admin(), desactiveAt: new Date(T0.getTime() + 24 * HEURE) }, valide());
    expect(await requireRole('action:lever_gel', JETON, u.ports)).toEqual({
      ok: false,
      motif: 'desactive',
    });
  });

  it('REQ-SEC-023 : chaque motif de refus de session est nommé, et sans jeton la base n’est pas lue', async () => {
    const sans = univers(admin(), valide());
    expect(await requireRole('action:lever_gel', undefined, sans.ports)).toEqual({
      ok: false,
      motif: 'absente',
    });
    expect(await requireRole('action:lever_gel', '', sans.ports)).toEqual({
      ok: false,
      motif: 'absente',
    });
    expect(sans.etat.lectures).toEqual([]);

    const inconnu = univers(admin(), valide());
    expect(await requireRole('action:lever_gel', 'X'.repeat(43), inconnu.ports)).toEqual({
      ok: false,
      motif: 'inconnue',
    });
    const cle = univers(admin(), { ...valide(), kid: '00000000' });
    expect(await requireRole('action:lever_gel', JETON, cle.ports)).toEqual({
      ok: false,
      motif: 'cle_perimee',
    });
    const revoquee = univers(admin(), { ...valide(), revoqueAt: T0 });
    expect(await requireRole('action:lever_gel', JETON, revoquee.ports)).toEqual({
      ok: false,
      motif: 'revoquee',
    });
    const expiree = univers(admin(), { ...valide(), expireAt: T0 });
    expect(await requireRole('action:lever_gel', JETON, expiree.ports)).toEqual({
      ok: false,
      motif: 'expiree',
    });
    const juste = univers(admin(), { ...valide(), expireAt: new Date(T0.getTime() + 1) });
    expect((await requireRole('action:lever_gel', JETON, juste.ports)).ok).toBe(true);
  });

  it('REQ-SEC-023 : une session de l’espace apporteur n’ouvre rien dans la console', async () => {
    const u = univers(null, valide());
    expect(await requireRole('action:lever_gel', JETON, u.ports)).toEqual({
      ok: false,
      motif: 'hors_console',
    });
  });

  it('REQ-SEC-023 : les motifs sont une liste FERMÉE, et le juge n’en rend pas d’autre', () => {
    expect(MOTIFS_DE_REFUS_CONSOLE).toEqual([
      'droit_absent',
      'absente',
      'inconnue',
      'cle_perimee',
      'revoquee',
      'expiree',
      'hors_console',
      'desactive',
      'role_refuse',
    ]);
    expect(jugerAcces('action:lever_gel', null, T0, KID)).toEqual({
      ok: false,
      motif: 'inconnue',
    });
    expect(jugerAcces('action:absente', null, T0, KID)).toEqual({
      ok: false,
      motif: 'droit_absent',
    });
  });
});

// ── 3. l'adaptateur Prisma ───────────────────────────────────────────────────────────────────────

describe('REQ-SEC-023 — l’adaptateur Prisma de requireRole', () => {
  it('REQ-SEC-023 : la lecture cherche la session par empreinte et relit le rôle et la désactivation', async () => {
    const appels: unknown[] = [];
    const rendue = { kid: KID };
    const prisma = {
      sessionEspace: {
        findUnique: async (args: unknown) => {
          appels.push(args);
          return rendue;
        },
      },
    } as unknown as PrismaClient;
    expect(await depotDeSessionsConsole(prisma).lire('h'.repeat(64))).toBe(rendue);
    expect(appels).toEqual([
      {
        where: { tokenHash: 'h'.repeat(64) },
        select: {
          kid: true,
          expireAt: true,
          revoqueAt: true,
          utilisateurConsole: { select: { id: true, role: true, desactiveAt: true } },
        },
      },
    ]);
  });
});

// ── 4. l'espace ne s'ouvre pas à la console ──────────────────────────────────────────────────────

/** Une session valide à T0 ; sa POPULATION, que le test fait varier, est toujours écrite (RM-11). */
const ligneEspace = (
  population: Pick<LigneDeSession, 'apporteurId' | 'apporteur'>
): LigneDeSession => ({
  id: 'session-a',
  kid: KID,
  expireAt: new Date(T0.getTime() + HEURE),
  revoqueAt: null,
  sessionVersion: 0,
  lienMagique: { consommeAt: T0 },
  ...population,
});

describe('REQ-SEC-023 — la population d’une session et d’un lien', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une session de la console est inconnue de l’espace ; celle d’un apporteur passe', () => {
    expect(jugerSession(ligneEspace({ apporteurId: null, apporteur: null }), T0, KID)).toEqual({
      ok: false,
      motif: 'inconnue',
    });
    expect(
      jugerSession(
        ligneEspace({
          apporteurId: 'apporteur-a',
          apporteur: { statut: 'signe', sessionVersion: 0 },
        }),
        T0,
        KID
      ).ok
    ).toBe(true);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un lien de la console ne s’ouvre pas dans l’espace ; celui d’un apporteur, si', async () => {
    const secretLien = 'temoin-sec17-secret-des-liens-'.padEnd(64, '3');
    const jeton = 'L'.repeat(43);
    const ouvertures: unknown[] = [];
    const consommation = (apporteurId: string | null): PortsDeConsommation => {
      const tx: TransactionDeConsommation = {
        consommer: async () => 1,
        lireLien: async (tokenHash) =>
          tokenHash === empreinteDuJeton(jeton, secretLien)
            ? { id: 'lien-a', apporteurId, kid: kidDe(secretLien) }
            : null,
        statutApporteur: async () => 'signe',
        ouvrirSession: async (s) => {
          ouvertures.push(s);
        },
      };
      return {
        maintenant: () => T0,
        transaction: (travail) => travail(tx),
        configuration: {
          secret: secretLien,
          kid: kidDe(secretLien),
          urlPublique: 'https://exemple.invalid',
          session: { secret: SECRET, kid: KID },
        },
      };
    };
    expect(await consommerLien({ jeton, ipHash: null }, consommation(null))).toEqual({
      etat: 'lien_invalide',
    });
    expect(ouvertures).toEqual([]);
    expect((await consommerLien({ jeton, ipHash: null }, consommation('apporteur-a'))).etat).toBe(
      'ouverte'
    );
    expect(ouvertures).toHaveLength(1);
  });
});

// ── 5. la garde : le disque confronté à la matrice ───────────────────────────────────────────────

const MATRICE_TEMOIN = {
  'action:lever_gel': ['admin'],
  'ecran:tableau': ['admin', 'lecteur'],
} as const;

const action = (corps: string, chemin = 'src/app/(console)/console/gel/actions.ts') =>
  ({
    chemin,
    source: `'use server';\nexport async function leverLeGel(id: string) {\n${corps}\n}\n`,
  }) satisfies FichierDeConsole;

const page = (corps: string) =>
  ({
    chemin: 'src/app/(console)/console/tableau/page.tsx',
    source: `export default async function Page() {\n${corps}\n  return null;\n}\n`,
  }) satisfies FichierDeConsole;

const familles = (fichiers: FichierDeConsole[]) =>
  jugerLaConsole(fichiers, MATRICE_TEMOIN, ROLES_CONSOLE).fautes.map((f) => f.famille);

describe('REQ-SEC-023 — la garde `securite:roles` confronte le disque à la matrice', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une action sans entrée dans la matrice rougit en NOMMANT l’action ; déclarée, elle passe', () => {
    const hors = jugerLaConsole(
      [action("  await requireRole('action:geler_tout', jeton, ports);")],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(hors.fautes.map((f) => f.famille)).toEqual(['droit_hors_matrice']);
    expect(hors.fautes[0]!.message).toContain('leverLeGel');
    expect(hors.fautes[0]!.message).toContain('action:geler_tout');

    const dans = jugerLaConsole(
      [action("  await requireRole('action:lever_gel', jeton, ports);")],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(dans.fautes).toEqual([]);
    expect(dans.actions).toBe(1);
    expect(dans.couples).toBe(ROLES_CONSOLE.length);
  });

  it('REQ-SEC-023 : une action de console qui n’appelle pas requireRole rougit', () => {
    expect(familles([action('  return id;')])).toEqual(['action_sans_requireRole']);
  });

  it('REQ-SEC-023 : une action déclarée par une constante fléchée est aussi une action', () => {
    const f = {
      chemin: 'src/server/console/gel.ts',
      source: "'use server';\nexport const leverLeGel = async () => {\n  return 1;\n};\n",
    };
    expect(familles([f])).toEqual(['action_sans_requireRole']);
  });

  it('REQ-SEC-023 : un droit qui n’est pas un littéral ne se confronte pas — il rougit', () => {
    expect(familles([action('  await requireRole(droit, jeton, ports);')])).toEqual([
      'droit_non_litteral',
    ]);
  });

  it('REQ-SEC-023 : une action qui invoque un droit d’ÉCRAN, ou une page un droit d’ACTION, rougit', () => {
    expect(familles([action("  await requireRole('ecran:tableau', jeton, ports);")])).toEqual([
      'droit_de_mauvais_genre',
    ]);
    expect(familles([page("  await requireRole('action:lever_gel', jeton, ports);")])).toEqual([
      'droit_de_mauvais_genre',
    ]);
  });

  it('REQ-SEC-023 / REQ-UX-024 : TÉMOIN À DEUX FACES — une page sans requireRole rougit ; avec son écran, elle passe', () => {
    expect(familles([page('')])).toEqual(['route_sans_requireRole']);
    const r = jugerLaConsole(
      [page("  await requireRole('ecran:tableau', jeton, ports);")],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(r.fautes).toEqual([]);
    expect(r.routes).toBe(1);
    expect(r.couples).toBe(ROLES_CONSOLE.length);
  });

  it('REQ-SEC-023 : une route HTTP de console rougit sans requireRole, par méthode', () => {
    const f = {
      chemin: 'src/app/(console)/console/export/route.ts',
      source:
        "export async function GET() {\n  await requireRole('ecran:tableau', j, p);\n}\n" +
        'export async function POST() {\n  return 1;\n}\n',
    };
    const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
    expect(r.fautes.map((x) => x.famille)).toEqual(['route_sans_requireRole']);
    expect(r.fautes[0]!.message).toContain('POST');
  });

  it('REQ-SEC-023 : un fichier hors console, et un module de console sans « use server », ne sont pas des actions', () => {
    expect(
      familles([
        {
          chemin: 'src/server/auth/session.ts',
          source: "'use server';\nexport async function a() {}\n",
        },
        { chemin: 'src/server/console/aide.ts', source: 'export async function a() {}\n' },
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : un fichier illisible rougit au lieu d’être sauté', () => {
    expect(familles([action('  await requireRole(')])).toContain('source_illisible');
  });

  it('REQ-SEC-023 : les familles de la garde sont une liste fermée', () => {
    expect([...FAMILLES].sort()).toEqual(
      [
        'action_sans_requireRole',
        'droit_de_mauvais_genre',
        'droit_hors_matrice',
        'droit_non_litteral',
        'route_sans_requireRole',
        'source_illisible',
      ].sort()
    );
  });

  it('REQ-SEC-023 : la garde sur la console du dépôt sort en 0 et imprime le compte des couples confrontés', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/gates/roles.ts'], {
      encoding: 'utf8',
      shell: true,
    });
    const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    expect(sortie).toMatch(/couple\(s\) écran-rôle confronté\(s\)/);
    expect(r.status).toBe(0);
  });
});
