// @req REQ-SEC-023
// @req REQ-UX-024 → REQ-SEC-023
// @req REQ-SEC-058
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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleRole, type PrismaClient } from '@prisma/client';
import { kidDe } from '../../../src/lib/env';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import {
  invitationOuverte,
  jugerChangementDeRole,
} from '../../../src/server/console/utilisateurs/regles';
import {
  consommerLien,
  empreinteDeSessionConsole,
  empreinteDuJeton,
  type PortsDeConsommation,
  type TransactionDeConsommation,
} from '../../../src/server/auth/lien-magique';
import { jugerSession, type LigneDeSession } from '../../../src/server/auth/session';
import { MATRICE_DES_ROLES, ROLES_CONSOLE, roleAutorise } from '../../../src/server/roles/matrice';
import { ROLES_CONSOLE as ROLES_DU_DOMAINE } from '../../../src/domain/console/roles';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';
import {
  MOTIFS_DE_REFUS_CONSOLE,
  depotDeSessionsConsole,
  jugerAcces,
  requireRole,
  type LigneDeSessionConsole,
  type PortsDeRole,
} from '../../../src/server/roles/require-role';
import {
  FAMILLES,
  MODULE_DE_LA_PORTE,
  jugerLaConsole,
  rendreLeVerdict,
  type FichierDeConsole,
} from '../../../scripts/gates/roles';

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
    for (const [droit, { roles }] of Object.entries(MATRICE_DES_ROLES)) {
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

  it('REQ-DM-034 : TÉMOIN — le rattachement manuel est au qualifieur et à l’admin, jamais au comptable ni au lecteur', () => {
    expect(roleAutorise('action:rattacher_manuellement', 'qualifieur')).toBe(true);
    expect(roleAutorise('action:rattacher_manuellement', 'admin')).toBe(true);
    expect(roleAutorise('action:rattacher_manuellement', 'comptable')).toBe(false);
    expect(roleAutorise('action:rattacher_manuellement', 'lecteur')).toBe(false);
  });

  it('REQ-SEC-058 : TÉMOIN — la lecture du journal des accès est à l’admin seul, refusée à tout rôle non nommé', () => {
    expect(Object.hasOwn(MATRICE_DES_ROLES, 'action:lire_journal_des_acces')).toBe(true);
    expect(roleAutorise('action:lire_journal_des_acces', 'admin')).toBe(true);
    for (const role of ROLES_CONSOLE.filter((r) => r !== 'admin'))
      expect(roleAutorise('action:lire_journal_des_acces', role)).toBe(false);
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
  // SEC-29 : vue à l'instant ; une session jamais vue est refusée comme inactive.
  derniereVueAt: T0,
  // SEC-30 : ouverte à l'instant (le step-up tient) et de la version de son utilisateur.
  creeAt: T0,
  sessionVersion: 0,
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
        if (tokenHash !== empreinteDeSessionConsole(JETON, SECRET)) return null;
        return {
          ...etat.ligne,
          // SEC-30 : l'utilisateur est à la version 0, celle de `valide()`.
          utilisateurConsole:
            etat.utilisateur === null
              ? null
              : {
                  ...etat.utilisateur,
                  sessionVersion: 0,
                  valideAt: etat.utilisateur.role === 'admin' ? T0 : null,
                },
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
      empreinteDeSessionConsole(JETON, SECRET),
      empreinteDeSessionConsole(JETON, SECRET),
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

  // SEC-29 : la session de la console expire par INACTIVITÉ (durées de `durees.ts`).
  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — vue il y a l’inactivité, la session est refusée ; un instant avant, elle passe', async () => {
    const inactivite = DUREES_AUTH.inactiviteConsoleMs.valeur;
    const vieille = univers(admin(), {
      ...valide(),
      derniereVueAt: new Date(T0.getTime() - inactivite),
    });
    expect(await requireRole('action:lever_gel', JETON, vieille.ports)).toEqual({
      ok: false,
      motif: 'inactive',
    });
    const jamais = univers(admin(), { ...valide(), derniereVueAt: null });
    expect((await requireRole('action:lever_gel', JETON, jamais.ports)).ok).toBe(false);
    const recente = univers(admin(), {
      ...valide(),
      derniereVueAt: new Date(T0.getTime() - inactivite + 1),
    });
    expect((await requireRole('action:lever_gel', JETON, recente.ports)).ok).toBe(true);
  });

  it('REQ-SEC-003 : la dernière vue n’est touchée qu’une fois par période, et seulement pour une session admise', async () => {
    const touches: Date[] = [];
    const avec = (derniereVueAt: Date) => {
      const u = univers(admin(), { ...valide(), derniereVueAt });
      u.ports.depot.toucher = async (_h, t) => {
        touches.push(t);
      };
      return u;
    };
    const periode = DUREES_AUTH.toucheVueConsoleMs.valeur;
    await requireRole('action:lever_gel', JETON, avec(new Date(T0.getTime() - periode + 1)).ports);
    expect(touches).toEqual([]);
    await requireRole('action:lever_gel', JETON, avec(new Date(T0.getTime() - periode)).ports);
    expect(touches).toEqual([T0]);
    const refusee = univers(comptable(), {
      ...valide(),
      derniereVueAt: new Date(T0.getTime() - periode),
    });
    refusee.ports.depot.toucher = async (_h, t) => {
      touches.push(t);
    };
    await requireRole('action:lever_gel', JETON, refusee.ports);
    expect(touches).toEqual([T0]);
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
      'inactive',
      'version_perimee',
      'releve_requis',
      'admin_en_attente',
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
          derniereVueAt: true,
          creeAt: true,
          sessionVersion: true,
          utilisateurConsole: {
            select: {
              id: true,
              role: true,
              desactiveAt: true,
              sessionVersion: true,
              valideAt: true,
            },
          },
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

  it('REQ-SEC-023 : l’identifiant d’apporteur ET l’apporteur relu sont exigés, chacun seul suffit à refuser', () => {
    // La base ne produit pas ces deux lignes (CHECK de population, clé étrangère) : le juge ne
    // s'y fie pas pour autant, et refuse chacune des deux moitiés manquantes.
    expect(
      jugerSession(
        ligneEspace({ apporteurId: null, apporteur: { statut: 'signe', sessionVersion: 0 } }),
        T0,
        KID
      )
    ).toEqual({ ok: false, motif: 'inconnue' });
    expect(
      jugerSession(ligneEspace({ apporteurId: 'apporteur-a', apporteur: null }), T0, KID)
    ).toEqual({ ok: false, motif: 'inconnue' });
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

/**
 * L'import de la porte depuis un fichier de `src/app/(console)/console/<x>/` : seul le
 * `requireRole` importé du module des rôles garde un site (5e tour de relecture).
 */
const IMPORT_DE_LA_PORTE = "import { requireRole } from '../../../../server/roles/require-role';\n";

/**
 * Un module d'actions sous le routage de la console vit dans un dossier PRIVÉ de Next (`_gel`) :
 * hors des huit noms de fichier que la garde sait juger, seul un dossier privé est admis (9e tour).
 */
const action = (corps: string) =>
  ({
    chemin: 'src/app/(console)/console/_gel/actions.ts',
    source: `'use server';\n${IMPORT_DE_LA_PORTE}export async function leverLeGel(id: string) {\n${corps}\n}\n`,
  }) satisfies FichierDeConsole;

const page = (corps: string) =>
  ({
    chemin: 'src/app/(console)/console/tableau/page.tsx',
    source: `${IMPORT_DE_LA_PORTE}export default async function Page() {\n${corps}\n  return null;\n}\n`,
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
        IMPORT_DE_LA_PORTE +
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
        'export_non_jugeable',
        'route_sans_requireRole',
        'source_illisible',
      ].sort()
    );
  });

  // ── les formes d'export : TOUTE valeur exportée d'un module 'use server' et TOUTE méthode HTTP
  //    exportée d'un route.ts est un site ; un site dont le corps ne s'établit pas est une faute.

  const serveur = (source: string) =>
    ({
      chemin: 'src/app/(console)/console/_gel/actions.ts',
      source: `'use server';\n${IMPORT_DE_LA_PORTE}${source}`,
    }) satisfies FichierDeConsole;
  const route = (source: string) =>
    ({
      chemin: 'src/app/(console)/console/export/route.ts',
      source: `${IMPORT_DE_LA_PORTE}${source}`,
    }) satisfies FichierDeConsole;
  const GARDE_ACTION = "  await requireRole('action:lever_gel', j, p);";
  const GARDE_ECRAN = "  await requireRole('ecran:tableau', j, p);";

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `export { f }` d’une fonction locale est une action ; sans requireRole elle rougit', () => {
    const rouge = jugerLaConsole(
      [serveur('async function leverLeGel() {\n  return 1;\n}\nexport { leverLeGel };\n')],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['action_sans_requireRole']);
    expect(rouge.fautes[0]!.message).toContain('leverLeGel');
    const vert = jugerLaConsole(
      [serveur(`async function leverLeGel() {\n${GARDE_ACTION}\n}\nexport { leverLeGel };\n`)],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(vert.fautes).toEqual([]);
    expect(vert.actions).toBe(1);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `export { f as g }` est jugée sous son nom exporté', () => {
    const rouge = jugerLaConsole(
      [serveur('const f = async () => 1;\nexport { f as lever };\n')],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['action_sans_requireRole']);
    expect(rouge.fautes[0]!.message).toContain('« lever »');
    expect(
      familles([serveur(`const f = async () => {\n${GARDE_ACTION}\n};\nexport { f as lever };\n`)])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `export { traiter as GET, traiter as POST }` d’un route.ts : chaque méthode est jugée', () => {
    const rouge = jugerLaConsole(
      [
        route(
          'async function traiter() {\n  return 1;\n}\nexport { traiter as GET, traiter as POST };\n'
        ),
      ],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(rouge.fautes.map((f) => f.famille)).toEqual([
      'route_sans_requireRole',
      'route_sans_requireRole',
    ]);
    expect(rouge.fautes.map((f) => f.message).join('\n')).toMatch(/« GET »[\s\S]*« POST »/);
    const vert = jugerLaConsole(
      [
        route(
          `async function traiter() {\n${GARDE_ECRAN}\n}\nexport { traiter as GET, traiter as POST };\n`
        ),
      ],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(vert.fautes).toEqual([]);
    expect(vert.routes).toBe(2);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `export const x = enveloppe(async () => …)` ne se juge pas : faute nommée ; la fléchée gardée passe', () => {
    const rouge = jugerLaConsole(
      [serveur('export const approuverLot = avecJournal(async (lotId: string) => lotId);\n')],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(rouge.fautes.map((f) => f.famille)).toEqual(['export_non_jugeable']);
    expect(rouge.fautes[0]!.message).toContain('approuverLot');
    // Même avec requireRole DANS l'argument : l'enveloppe peut tout faire, le corps ne s'établit pas.
    expect(
      familles([
        serveur(`export const approuverLot = avecJournal(async () => {\n${GARDE_ACTION}\n});\n`),
      ])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([serveur(`export const approuverLot = async () => {\n${GARDE_ACTION}\n};\n`)])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : une constante qui n’est pas une fonction, une classe, un enum, une déstructuration exportés d’un module « use server » : fautes nommées', () => {
    expect(familles([serveur('export const LIMITE = 3;\n')])).toEqual(['export_non_jugeable']);
    expect(familles([serveur('export class Lot {}\n')])).toEqual(['export_non_jugeable']);
    expect(familles([serveur('export enum E {\n  A,\n}\n')])).toEqual(['export_non_jugeable']);
    expect(familles([serveur('const o = { a: 1 };\nexport const { a } = o;\n')])).toEqual([
      'export_non_jugeable',
    ]);
    expect(familles([serveur('const LIMITE = 3;\nexport { LIMITE };\n')])).toEqual([
      'export_non_jugeable',
    ]);
    // Un type s'efface à la compilation : ce n'est pas une valeur exportée.
    expect(
      familles([
        serveur(
          'export type T = string;\nexport interface I {\n  a: 1;\n}\ntype U = 1;\nexport type { U };\n'
        ),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : `export *` et un réexport depuis un autre module ne se jugent pas — fautes nommées, en « use server » comme en route.ts', () => {
    expect(familles([serveur("export * from './autre';\n")])).toEqual(['export_non_jugeable']);
    expect(familles([serveur("export { leverLeGel } from './autre';\n")])).toEqual([
      'export_non_jugeable',
    ]);
    expect(familles([serveur("export * as tout from './autre';\n")])).toEqual([
      'export_non_jugeable',
    ]);
    expect(familles([route("export { GET } from './autre';\n")])).toEqual(['export_non_jugeable']);
    expect(familles([route("export { traiter as POST } from './autre';\n")])).toEqual([
      'export_non_jugeable',
    ]);
    expect(familles([route("export * from './autre';\n")])).toEqual(['export_non_jugeable']);
    // Un réexport qui n'est pas une méthode HTTP, dans un route.ts : hors de la liste blanche, refusé.
    expect(familles([route("export { aide } from './autre';\n")])).toEqual(['export_non_jugeable']);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `export const GET = enveloppe(…)` d’un route.ts est une faute nommée ; `export const GET = traiter` suit la fonction locale', () => {
    expect(familles([route('export const GET = avecJournal(async () => 1);\n')])).toEqual([
      'export_non_jugeable',
    ]);
    // Une constante dont la valeur est un NOM qui n'est pas une fonction locale : importé, il ne se juge pas.
    expect(
      familles([route("import { handler } from './autre';\nexport const GET = handler;\n")])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([serveur("import { handler } from './autre';\nexport const lever = handler;\n")])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([route('async function traiter() {\n  return 1;\n}\nexport const GET = traiter;\n')])
    ).toEqual(['route_sans_requireRole']);
    expect(
      familles([
        route(`async function traiter() {\n${GARDE_ECRAN}\n}\nexport const GET = traiter;\n`),
      ])
    ).toEqual([]);
  });

  // ── la résolution d'un nom local : seules une `const` et une déclaration de fonction, jamais
  //    réassignées, s'établissent ; Next sert la valeur de FIN de module, pas l'initialiseur.

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une liaison réassignée ne s’établit pas : faute nommée ; la `const` gardée passe', () => {
    // route.ts : une liaison `let` gardée à l'initialiseur, réassignée à un import, exportée par alias.
    expect(
      familles([
        route(
          "import { handler } from './h';\n" +
            `let traiter = async () => {\n${GARDE_ECRAN}\n  return 1;\n};\n` +
            'traiter = handler;\nexport { traiter as GET };\n'
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // 'use server' : `export let` gardée à l'initialiseur, réassignée à un import.
    expect(
      familles([
        serveur(
          "import { impl } from './h';\n" +
            `export let voirIban = async () => {\n${GARDE_ACTION}\n};\nvoirIban = impl;\n`
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // une chaîne `const a = b` dont un maillon est une liaison réassignée.
    expect(
      familles([
        route(
          "import { handler } from './h';\n" +
            `let b = async () => {\n${GARDE_ECRAN}\n};\nb = handler;\nconst a = b;\nexport const GET = a;\n`
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // une déclaration de fonction réassignée n'est plus établie non plus.
    expect(
      familles([
        route(
          "import { handler } from './h';\n" +
            `async function traiter() {\n${GARDE_ECRAN}\n}\ntraiter = handler;\nexport { traiter as GET };\n`
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // Le motif est dit : c'est la réassignation, pas une forme quelconque, qui rend le site non jugeable.
    const motif = jugerLaConsole(
      [
        route(
          `let traiter = async () => {\n${GARDE_ECRAN}\n};\nfunction init() {\n  traiter = x;\n}\n` +
            'export { traiter as GET };\n'
        ),
      ],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(motif.fautes.map((f) => f.message).join('\n')).toContain('liaison réassignable');
    // Contre-témoin : la même chaîne en `const`, jamais réassignée, gardée : elle passe.
    expect(
      familles([
        route(
          "import { handler } from './h';\n" +
            `const b = async () => {\n${GARDE_ECRAN}\n};\nconst a = b;\nexport const GET = a;\nexport { b as POST };\n`
        ),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un type homonyme d’un import n’efface pas la valeur exportée ; un `export type` réel reste un type', () => {
    expect(
      familles([route("import { GET } from './h';\ntype GET = never;\nexport { GET };\n")])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([
        route(
          "import { handler } from './h';\ntype handler = never;\nexport { handler as GET };\n"
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([
        serveur("import { impl } from './h';\ninterface impl {\n  a: 1;\n}\nexport { impl };\n"),
      ])
    ).toEqual(['export_non_jugeable']);
    // Contre-témoins : un `export type { … }` explicite, même homonyme d'un import, reste un type ;
    // un type seul, sans valeur homonyme, aussi.
    expect(
      familles([
        route("import { GET } from './h';\ntype GET = never;\nexport type { GET };\n"),
        serveur('type T = string;\nexport { type T };\nexport type { T as U };\n'),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un `var` de portée module hors du premier niveau est une valeur réassignable ; un export non marqué `type` n’est jamais écarté comme type', () => {
    // Un `var` dans un bloc de premier niveau a la portée du module : le type homonyme n'efface pas
    // la méthode que Next servirait.
    expect(
      familles([
        route(
          "import { impl } from './h';\ntype handler = never;\n{\n  var handler = impl;\n}\n" +
            'export { handler as GET };\n'
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // Même classe par `for (var … of …)`.
    expect(
      familles([
        route(
          "import { impl } from './h';\ntype handler = never;\nfor (var handler of [impl]) {\n}\n" +
            'export { handler as DELETE };\n'
        ),
      ])
    ).toEqual(['export_non_jugeable']);
    // Un `var` sous `if`, `try`, `while`, `switch`, étiquette : liaison de VALEUR, réassignable, dite.
    for (const enveloppe of [
      (c: string) => `if (ouvert) {\n${c}\n}\n`,
      (c: string) => `try {\n${c}\n} catch {\n}\n`,
      (c: string) => `while (ouvert) {\n${c}\n}\n`,
      (c: string) => `switch (ouvert) {\n  case 1:\n${c}\n}\n`,
      (c: string) => `etiquette: {\n${c}\n}\n`,
    ]) {
      const j = jugerLaConsole(
        [
          route(
            'type traiter = never;\n' +
              enveloppe(`var traiter = async () => {\n${GARDE_ECRAN}\n};`) +
              'export { traiter as GET };\n'
          ),
        ],
        MATRICE_TEMOIN,
        ROLES_CONSOLE
      );
      expect(j.fautes.map((f) => f.famille)).toEqual(['export_non_jugeable']);
      expect(j.fautes[0]!.message).toContain('liaison réassignable');
    }
    // Un export NON marqué `type` d'un nom sans valeur établie n'est jamais écarté : il s'écrit `export type`.
    const nonMarque = jugerLaConsole(
      [serveur('type T = string;\nexport { T };\n')],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(nonMarque.fautes.map((f) => f.famille)).toEqual(['export_non_jugeable']);
    expect(nonMarque.fautes[0]!.message).toContain('export type');
    // Contre-témoins : un `export type { … }` réel reste un type ; un `var` enfermé dans une fonction
    // n'a pas la portée du module et ne touche pas la `const` gardée homonyme.
    expect(
      familles([
        serveur('type T = string;\nexport type { T };\nexport { type T as U };\n'),
        route(
          `const traiter = async () => {\n${GARDE_ECRAN}\n};\n` +
            'function aide() {\n  {\n    var traiter = 2;\n  }\n  return traiter;\n}\n' +
            'export { traiter as GET };\n'
        ),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : un `let` JAMAIS réassigné ne s’établit pas non plus — la règle let/var a son témoin propre', () => {
    const j = jugerLaConsole(
      [route(`let traiter = async () => {\n${GARDE_ECRAN}\n};\nexport { traiter as GET };\n`)],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(j.fautes.map((f) => f.famille)).toEqual(['export_non_jugeable']);
    expect(j.fautes[0]!.message).toContain('liaison réassignable');
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un export par DÉSTRUCTURATION est un site PAR NOM LIÉ, jamais jugeable', () => {
    const objet = jugerLaConsole(
      [route("import { handlers } from './auth';\nexport const { GET, POST } = handlers;\n")],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(objet.fautes.map((f) => f.famille)).toEqual([
      'export_non_jugeable',
      'export_non_jugeable',
    ]);
    expect(objet.sites.join('\n')).toContain('« GET »');
    expect(objet.sites.join('\n')).toContain('« POST »');
    expect(familles([route("export const [GET] = [async () => new Response('x')];\n")])).toEqual([
      'export_non_jugeable',
    ]);
    // imbriqué, avec défaut et reste : chaque nom lié qui est une méthode est un site.
    expect(
      familles([route('const o = {};\nexport const { a: { GET }, POST = f, ...PUT } = o;\n')])
    ).toEqual(['export_non_jugeable', 'export_non_jugeable', 'export_non_jugeable']);
  });

  it('REQ-SEC-023 : un import-equals exporté (`export import X = …`) est un site non jugeable, en route.ts comme en « use server »', () => {
    expect(
      familles([route('import * as h from "./h";\nexport import GET = h.handler;\n')])
    ).toEqual(['export_non_jugeable']);
    expect(
      familles([serveur('import * as h from "./h";\nexport import lever = h.handler;\n')])
    ).toEqual(['export_non_jugeable']);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — la garde juge par LISTE BLANCHE : toute forme d’export qu’elle ne sait pas juger est une faute nommée, où qu’elle soit dans la console', () => {
    const REPONSE = "async () => new Response('x')";
    const layout = (source: string) =>
      ({ chemin: 'src/app/(console)/console/layout.tsx', source }) satisfies FichierDeConsole;
    // Next compile `export =` en `module.exports` : servi 200 sans requireRole.
    const rouges: FichierDeConsole[] = [
      route(`export = { GET: ${REPONSE} };\n`),
      route("export * from './h';\n"),
      route("export { GET } from './h';\n"),
      route("export { aide } from './h';\n"),
      route(`export default ${REPONSE};\n`),
      route('export default async function traiter() {\n  return 1;\n}\n'),
      route('export enum E {\n  A,\n}\n'),
      route('export namespace N {\n  export const GET = 1;\n}\n'),
      route('export declare const GET: () => Response;\n'),
      route('export as namespace N;\n'),
      layout('export enum E {\n  A,\n}\nexport default function Layout() {\n  return null;\n}\n'),
      serveur(`export = { lever: ${REPONSE} };\n`),
    ];
    for (const f of rouges) {
      const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
      expect(
        r.fautes.map((x) => x.famille),
        f.source
      ).toEqual(['export_non_jugeable']);
      expect(r.fautes[0]!.message, f.source).toContain(
        'forme d’export non admise dans un fichier de la console'
      );
      expect(rendreLeVerdict(r, 2, 4).code, f.source).toBe(1);
    }
    // Contre-témoins : les formes admises, telles que la console les écrit, restent vertes.
    expect(
      familles([
        route(
          "export const dynamic = 'force-dynamic';\n" +
            `export async function GET() {\n${GARDE_ECRAN}\n}\n` +
            `export function POST() {\n${GARDE_ECRAN}\n}\n` +
            'export type T = string;\nexport interface I {\n  a: 1;\n}\n' +
            "export type { U } from './types';\n"
        ),
        layout(
          'export const metadata = { title: "Console" };\n' +
            'export default function Layout() {\n  return null;\n}\n'
        ),
        {
          chemin: 'src/app/(console)/console/error.tsx',
          source: "'use client';\nexport default function Erreur() {\n  return null;\n}\n",
        },
      ])
    ).toEqual([]);
  });

  // ── 9e tour : Next sert comme route, dans N'IMPORTE QUEL segment, les fichiers de métadonnées
  //    (`icon`, `apple-icon`, `opengraph-image`, `twitter-image`, `sitemap`, et à la racine
  //    `robots`, `manifest`) : leur export par défaut devient un GET servi, que la garde ne
  //    voyait pas comme un site. La liste blanche passe au niveau du FICHIER.

  const MOTIF_FICHIER = 'fichier non admis sous le routage de la console : Next peut le servir';
  const FUITE =
    "import { lireFiche } from '../../../../../server/console/fiches';\n" +
    'export default async function Image({ params }: { params: { id: string } }) {\n' +
    '  return new Response(JSON.stringify(await lireFiche(params.id)));\n}\n';

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — sous le routage de la console, seuls les huit noms de fichier que la garde sait juger sont admis ; tout autre fichier de code hors d’un dossier privé est une faute nommée', () => {
    const sous = (nom: string, source = FUITE) =>
      ({
        chemin: `src/app/(console)/console/fiches/[id]/${nom}`,
        source,
      }) satisfies FichierDeConsole;
    const rouges: FichierDeConsole[] = [
      sous('icon.tsx'),
      sous('apple-icon.tsx'),
      sous('opengraph-image.tsx'),
      sous('twitter-image.tsx'),
      sous(
        'sitemap.ts',
        'export default async function sitemap() {\n  return [{ url: String(await lireTout()) }];\n}\n'
      ),
      sous('utils.ts', 'export function formater(x: string) {\n  return x;\n}\n'),
      sous('(onglet)/icon.tsx'),
      {
        chemin: 'src/app/(console)/robots.ts',
        source: 'export default function robots() {\n  return { rules: [] };\n}\n',
      },
    ];
    for (const f of rouges) {
      const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
      expect(
        r.fautes.map((x) => x.famille),
        f.chemin
      ).toEqual(['export_non_jugeable']);
      expect(r.fautes[0]!.message, f.chemin).toContain(MOTIF_FICHIER);
      expect(r.fautes[0]!.message, f.chemin).toContain(f.chemin);
      expect(rendreLeVerdict(r, 2, 4).code, f.chemin).toBe(1);
    }
    // Contre-témoins : un fichier sous un dossier privé de Next (`_prive`), et les huit noms admis.
    const DOSSIER = 'src/app/(console)/console/fiches';
    const composant = (nom: string) =>
      ({
        chemin: `${DOSSIER}/${nom}.tsx`,
        source: 'export default function Composant() {\n  return null;\n}\n',
      }) satisfies FichierDeConsole;
    expect(
      familles([
        { chemin: `${DOSSIER}/_prive/format.ts`, source: FUITE },
        { chemin: `${DOSSIER}/page.tsx`, source: page(GARDE_ECRAN).source },
        {
          chemin: `${DOSSIER}/route.ts`,
          source: `${IMPORT_DE_LA_PORTE}export async function GET() {\n${GARDE_ECRAN}\n}\n`,
        },
        ...['layout', 'template', 'default', 'loading', 'error', 'not-found'].map(composant),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `generateMetadata` et les autres générateurs de Next sont refusés sous le routage de la console ; le `metadata` statique passe', () => {
    const GENERE = "async () => ({ title: String(await lireFiche('x')) })";
    const avec = (chemin: string, source: string) =>
      ({ chemin, source }) satisfies FichierDeConsole;
    const PAGE = 'src/app/(console)/console/tableau/page.tsx';
    const rouges: [string, FichierDeConsole][] = [
      [
        'generateMetadata',
        avec(
          PAGE,
          `${page(GARDE_ECRAN).source}export async function generateMetadata() {\n` +
            "  return { title: String(await lireFiche('x')) };\n}\n"
        ),
      ],
      [
        'generateViewport',
        avec(
          'src/app/(console)/console/layout.tsx',
          `export const generateViewport = ${GENERE};\n` +
            'export default function Layout() {\n  return null;\n}\n'
        ),
      ],
      [
        'generateStaticParams',
        avec(
          'src/app/(console)/console/export/route.ts',
          `${IMPORT_DE_LA_PORTE}export async function GET() {\n${GARDE_ECRAN}\n}\n` +
            `const g = ${GENERE};\nexport { g as generateStaticParams };\n`
        ),
      ],
      [
        'generateImageMetadata',
        avec(PAGE, `${page(GARDE_ECRAN).source}export const generateImageMetadata = ${GENERE};\n`),
      ],
      [
        'generateSitemaps',
        avec(PAGE, `${page(GARDE_ECRAN).source}export const generateSitemaps = ${GENERE};\n`),
      ],
    ];
    for (const [nom, f] of rouges) {
      const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
      expect(
        r.fautes.map((x) => x.famille),
        nom
      ).toEqual(['export_non_jugeable']);
      expect(r.fautes[0]!.message, nom).toContain(`« ${nom} »`);
      expect(rendreLeVerdict(r, 2, 4).code, nom).toBe(1);
    }
    expect(
      familles([
        avec(PAGE, `${page(GARDE_ECRAN).source}export const metadata = { title: 'Tableau' };\n`),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une route, une page ou une action en JavaScript (`route.js`, `page.jsx`, `.mjs`) est lue et jugée', () => {
    const js = (chemin: string, source: string) => ({ chemin, source }) satisfies FichierDeConsole;
    const ROUTE_JS = 'src/app/(console)/console/export/route.js';
    expect(familles([js(ROUTE_JS, 'export async function GET() {\n  return 1;\n}\n')])).toEqual([
      'route_sans_requireRole',
    ]);
    expect(
      familles([
        js(
          'src/app/(console)/console/tableau/page.jsx',
          'export default function Page() {\n  return null;\n}\n'
        ),
      ])
    ).toEqual(['route_sans_requireRole']);
    expect(
      familles([
        js(
          'src/server/console/actions.mjs',
          "'use server';\nexport async function a() {\n  return 1;\n}\n"
        ),
      ])
    ).toEqual(['action_sans_requireRole']);
    expect(
      familles([
        js(ROUTE_JS, `${IMPORT_DE_LA_PORTE}export async function GET() {\n${GARDE_ECRAN}\n}\n`),
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une MÉTHODE d’objet ou de classe qui porte « use server » est une action', () => {
    expect(
      familles([
        {
          chemin: 'src/server/console/aide.ts',
          source:
            "export const o = {\n  async lever() {\n    'use server';\n    return 1;\n  },\n};\n",
        },
      ])
    ).toEqual(['action_sans_requireRole']);
    expect(
      familles([
        {
          chemin: 'src/server/console/aide.ts',
          source:
            "import { requireRole } from '../roles/require-role';\n" +
            `export class C {\n  async lever() {\n    'use server';\n${GARDE_ACTION}\n  }\n}\n`,
        },
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une page dont l’export par défaut ne se reconnaît pas est une faute, même si requireRole traîne ailleurs dans le fichier', () => {
    const chemin = 'src/app/(console)/console/tableau/page.tsx';
    expect(
      familles([
        {
          chemin,
          source:
            `async function garde() {\n${GARDE_ECRAN}\n}\n` +
            'function Page() {\n  return null;\n}\nexport default avecGarde(Page);\n',
        },
      ])
    ).toEqual(['export_non_jugeable']);
    expect(familles([{ chemin, source: `async function garde() {\n${GARDE_ECRAN}\n}\n` }])).toEqual(
      ['export_non_jugeable']
    );
    expect(
      familles([
        {
          chemin,
          source: `${IMPORT_DE_LA_PORTE}async function Page() {\n${GARDE_ECRAN}\n  return null;\n}\nexport { Page as default };\n`,
        },
      ])
    ).toEqual([]);
  });

  it('REQ-SEC-023 : `export default` d’un module « use server » qui n’est pas une fonction locale est une faute nommée', () => {
    expect(familles([serveur('export default avecJournal(async () => 1);\n')])).toEqual([
      'export_non_jugeable',
    ]);
    expect(familles([serveur(`export default async function () {\n${GARDE_ACTION}\n}\n`)])).toEqual(
      []
    );
  });

  // ── 5e tour : un module CommonJS n'a aucun export ES, et la garde ne lui voyait aucun site ;
  //    un `requireRole` homonyme, défini dans le fichier, passait pour la porte.

  /** Un fichier de route SANS l'import de la porte que `route` ajoute. */
  const routeBrute = (source: string, chemin = 'src/app/(console)/console/export/route.ts') =>
    ({ chemin, source }) satisfies FichierDeConsole;

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un fichier de console écrit en CommonJS est une faute nommée, jamais « aucun site » ; la route en exports ES gardée passe', () => {
    const REPONSE = "async () => new Response('x')";
    const formes: FichierDeConsole[] = [
      routeBrute(`exports.GET = ${REPONSE};\n`),
      routeBrute(
        `module.exports = { GET: ${REPONSE} };\n`,
        'src/app/(console)/console/w7/route.js'
      ),
      routeBrute(`Object.defineProperty(exports, 'GET', { value: ${REPONSE} });\n`),
      routeBrute(`exports['POST'] = ${REPONSE};\n`),
      routeBrute(`Object.assign(module.exports, { GET: ${REPONSE} });\n`),
      serveur(`module.exports.leverLeGel = async () => 1;\n`),
      routeBrute(`this.GET = ${REPONSE};\n`),
      routeBrute(`const f = () => { arguments[0].GET = ${REPONSE}; };\nf();\n`),
      routeBrute(`require.cache[__filename].exports.GET = ${REPONSE};\n`),
      routeBrute(`eval('exports.GET = 1');\n`),
      routeBrute(`__webpack_exports__.GET = ${REPONSE};\n`),
    ];
    for (const f of formes) {
      const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
      expect(
        r.fautes.map((x) => x.famille),
        f.source
      ).toContain('export_non_jugeable');
      expect(r.fautes.map((x) => x.message).join('\n'), f.source).toMatch(/module CommonJS/);
      expect(rendreLeVerdict(r, 2, 4).code, f.source).toBe(1);
    }
    // La faute nomme le fichier, le nom et sa ligne.
    const nomme = jugerLaConsole(
      [routeBrute(`// en tête\nexports.GET = ${REPONSE};\n`)],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(nomme.fautes[0]!.message).toContain('src/app/(console)/console/export/route.ts');
    expect(nomme.fautes[0]!.message).toContain('« exports » ligne 2');
    // Échec fermé, sans juger le CommonJS : même lié localement, le nom `exports` est refusé.
    expect(
      familles([
        route(
          `export async function GET() {\n  const exports = 1;\n${GARDE_ECRAN}\n  return exports;\n}\n`
        ),
      ])
    ).toContain('export_non_jugeable');
    // Contre-témoin : la route en exports ES gardée, où `module`, `exports` et `this` ne sont que
    // des noms de propriété ou vivent dans une fonction, passe.
    expect(
      familles([
        route(
          `export async function GET() {\n${GARDE_ECRAN}\n  const o = { module: 1, exports: 2 };\n` +
            '  return o.module + o.exports;\n}\nexport function OPTIONS() {\n  return this;\n}\n'
        ),
      ])
    ).toEqual(['route_sans_requireRole']);
    expect(familles([route(`export async function GET() {\n${GARDE_ECRAN}\n}\n`)])).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — seul le `requireRole` IMPORTÉ du module des rôles garde ; un homonyme local, un paramètre qui le masque ou un objet quelconque ne gardent pas', () => {
    const GET = `export async function GET() {\n${GARDE_ECRAN}\n}\n`;
    // Un homonyme local, sans import de la porte ; puis à côté de l'import, qu'il masque.
    expect(
      familles([routeBrute(`async function requireRole() {\n  return { ok: true };\n}\n${GET}`)])
    ).toEqual(['route_sans_requireRole']);
    expect(
      familles([route(`async function requireRole() {\n  return { ok: true };\n}\n${GET}`)])
    ).toEqual(['route_sans_requireRole']);
    // Un `requireRole` importé d'ailleurs.
    expect(familles([routeBrute(`import { requireRole } from './ailleurs';\n${GET}`)])).toEqual([
      'route_sans_requireRole',
    ]);
    // Un paramètre qui masque la porte importée.
    expect(
      familles([route(`export async function GET(requireRole) {\n${GARDE_ECRAN}\n}\n`)])
    ).toEqual(['route_sans_requireRole']);
    // `x.requireRole(…)` sur un objet quelconque.
    expect(
      familles([
        route(
          'const x = { requireRole: async () => ({ ok: true }) };\n' +
            "export async function GET() {\n  await x.requireRole('ecran:tableau', j, p);\n}\n"
        ),
      ])
    ).toEqual(['route_sans_requireRole']);
    // Le message dit ce qui garde.
    const r = jugerLaConsole([routeBrute(GET)], MATRICE_TEMOIN, ROLES_CONSOLE);
    expect(r.fautes[0]!.message).toContain(`importé de ${MODULE_DE_LA_PORTE}`);
    // La porte importée, nommée, par alias ou par espace de noms, garde ; son module est sur le disque.
    expect(existsSync(`${MODULE_DE_LA_PORTE}.ts`)).toBe(true);
    expect(familles([route(GET)])).toEqual([]);
    expect(
      familles([
        routeBrute(
          "import { requireRole as porte } from '../../../../server/roles/require-role.js';\n" +
            "export async function GET() {\n  await porte('ecran:tableau', j, p);\n}\n"
        ),
        routeBrute(
          "import * as roles from '../../../../server/roles/require-role.ts';\n" +
            "export async function GET() {\n  await roles.requireRole('ecran:tableau', j, p);\n}\n"
        ),
      ])
    ).toEqual([]);
  });

  // ── 6e tour : `this` et `arguments` ne sont liés que par une RÉGION qui les lie — le corps ou
  //    les paramètres d'une fonction non fléchée, l'initialiseur d'une propriété de classe, un
  //    bloc `static {}`. Un nom calculé de membre, un décorateur, une clause `extends` sont
  //    évalués dans la portée englobante : au premier niveau, c'est l'objet des exports.

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — `this` ou `arguments` évalués dans la portée du module (nom calculé, décorateur, `extends`) sont une faute nommée ; `this` dans une région qui le lie passe', () => {
    const REPONSE = "async () => new Response('x')";
    const fuite = `(this.GET = ${REPONSE}, 'm')`;
    const formes: FichierDeConsole[] = [
      routeBrute(`class C {\n  [${fuite}]() {}\n}\n`, 'src/app/(console)/console/w7/route.js'),
      routeBrute(`class C {\n  get [${fuite}]() {\n    return 1;\n  }\n}\n`),
      routeBrute(`class C {\n  set [${fuite}](v) {}\n}\n`),
      routeBrute(`class C {\n  static [${fuite}] = 1;\n}\n`),
      routeBrute(`const o = {\n  [${fuite}]() {},\n};\n`),
      routeBrute(`@((this.GET = ${REPONSE}, (c) => c))\nclass C {}\n`),
      routeBrute(`class C {\n  @((this.GET = ${REPONSE}, (m) => m))\n  m() {}\n}\n`),
      routeBrute(`class C extends (this.GET = ${REPONSE}, Object) {}\n`),
      routeBrute(`class C {\n  [(arguments[0].GET = ${REPONSE}, 'm')]() {}\n}\n`),
    ];
    for (const f of formes) {
      const r = jugerLaConsole([f], MATRICE_TEMOIN, ROLES_CONSOLE);
      expect(
        r.fautes.map((x) => x.famille),
        f.source
      ).toContain('export_non_jugeable');
      expect(r.fautes.map((x) => x.message).join('\n'), f.source).toMatch(/module CommonJS/);
      expect(rendreLeVerdict(r, 2, 4).code, f.source).toBe(1);
    }
    // La faute nomme le nom et sa ligne.
    const nomme = jugerLaConsole(
      [routeBrute(`class C {\n  [${fuite}]() {}\n}\n`)],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(nomme.fautes[0]!.message).toContain('« this » hors d’une fonction ligne 2');
    // Contre-témoins : `this` dans le corps d'une méthode, d'un constructeur, d'un accesseur,
    // dans un bloc `static`, dans un initialiseur de propriété non calculé, dans les paramètres
    // d'une méthode ; un nom calculé dans une fonction hérite de SA liaison.
    const lie =
      'class C {\n  x = this;\n  static y = this;\n  static {\n    this.z = 1;\n  }\n' +
      '  constructor() {\n    this.a = 1;\n  }\n  m(a = this) {\n    return [a, this, arguments];\n  }\n' +
      '  get g() {\n    return this;\n  }\n}\n' +
      'function f() {\n  return class {\n    [this.k]() {}\n  };\n}\n';
    expect(familles([route(`${lie}export async function GET() {\n${GARDE_ECRAN}\n}\n`)])).toEqual(
      []
    );
  });

  it('REQ-SEC-023 : un import de la porte dont le chemin remonte AU-DELÀ de la racine du dépôt n’est pas la porte', () => {
    const GET = `export async function GET() {\n${GARDE_ECRAN}\n}\n`;
    expect(
      familles([
        routeBrute(
          "import { requireRole } from '../../../../../../src/server/roles/require-role';\n" + GET
        ),
      ])
    ).toEqual(['route_sans_requireRole']);
    expect(familles([route(GET)])).toEqual([]);
  });

  it('REQ-SEC-023 : les couples sont confrontés RÔLE PAR RÔLE à la ligne de la matrice — ouverts et fermés comptés', () => {
    const r = jugerLaConsole(
      [page(GARDE_ECRAN), action(GARDE_ACTION)],
      MATRICE_TEMOIN,
      ROLES_CONSOLE
    );
    expect(r.fautes).toEqual([]);
    // `ecran:tableau` : admin et lecteur ouverts, qualifieur et comptable fermés ;
    // `action:lever_gel` : admin seul ouvert.
    expect(r.couplesOuverts).toBe(3);
    expect(r.couplesFermes).toBe(5);
    expect(r.couples).toBe(8);
  });

  it('REQ-SEC-023 : le périmètre vide ne se dit que si AUCUN fichier n’est lu ; sinon les fichiers lus et les sites confrontés sont imprimés', () => {
    const vide = rendreLeVerdict(jugerLaConsole([], MATRICE_TEMOIN, ROLES_CONSOLE), 2, 4);
    expect(vide.code).toBe(0);
    expect(vide.lignes.join('\n')).toMatch(/Périmètre vide/);

    const aide = { chemin: 'src/server/console/aide.ts', source: 'export async function a() {}\n' };
    const sansSite = rendreLeVerdict(jugerLaConsole([aide], MATRICE_TEMOIN, ROLES_CONSOLE), 2, 4);
    const texte = sansSite.lignes.join('\n');
    expect(sansSite.code).toBe(0);
    expect(texte).not.toMatch(/Périmètre vide|aucun fichier suivi/);
    expect(texte).toContain('src/server/console/aide.ts');
    expect(texte).toMatch(/aucun site/i);

    const avecSite = rendreLeVerdict(
      jugerLaConsole([action(GARDE_ACTION)], MATRICE_TEMOIN, ROLES_CONSOLE),
      2,
      4
    );
    expect(avecSite.lignes.join('\n')).toContain('action « leverLeGel »');

    const rouge = rendreLeVerdict(
      jugerLaConsole([action('')], MATRICE_TEMOIN, ROLES_CONSOLE),
      2,
      4
    );
    expect(rouge.code).toBe(1);
    expect(rouge.lignes.join('\n')).toContain('[action_sans_requireRole]');
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

// ── 5. SEC-30 : la version de session de la console, et le refus de l'auto-changement de rôle ─────

describe('REQ-SEC-003 — SEC-30 : un changement de rôle ou une désactivation coupe toutes les sessions', () => {
  const ligne = (versionSession: number, versionUtilisateur: number) => ({
    ...valide(),
    sessionVersion: versionSession,
    utilisateurConsole: {
      id: 'u-admin',
      role: 'admin' as const,
      desactiveAt: null,
      sessionVersion: versionUtilisateur,
      valideAt: T0,
    },
  });

  it('REQ-SEC-003 : TÉMOIN À DEUX FACES — une session d’une version antérieure à celle de son utilisateur est refusée ; la même version passe', () => {
    expect(jugerAcces('action:lever_gel', ligne(0, 1), T0, KID)).toEqual({
      ok: false,
      motif: 'version_perimee',
    });
    expect(jugerAcces('action:lever_gel', ligne(1, 1), T0, KID).ok).toBe(true);
  });

  it('REQ-SEC-003 : le motif de la version périmée entre dans la liste fermée', () => {
    expect(MOTIFS_DE_REFUS_CONSOLE).toContain('version_perimee');
  });
});

describe('REQ-SEC-023 — SEC-30 : personne ne change son propre rôle', () => {
  const admin = { id: 'u-admin', role: 'admin' as const };

  it('REQ-SEC-023 : TÉMOIN — l’auto-changement de rôle est refusé, nommé ; le changement du rôle d’un autre par un admin passe', () => {
    expect(
      jugerChangementDeRole({
        acteur: admin,
        cible: { id: 'u-admin', role: 'admin' },
        vers: 'lecteur',
      })
    ).toEqual({ ok: false, motif: 'auto_changement' });
    expect(
      jugerChangementDeRole({
        acteur: admin,
        cible: { id: 'u-q', role: 'qualifieur' },
        vers: 'admin',
      })
    ).toEqual({ ok: true });
  });

  it('REQ-SEC-023 : TÉMOIN — un non-admin ne change aucun rôle ; un changement vers le même rôle n’est pas un changement', () => {
    expect(
      jugerChangementDeRole({
        acteur: { id: 'u-c', role: 'comptable' },
        cible: { id: 'u-q', role: 'qualifieur' },
        vers: 'lecteur',
      })
    ).toEqual({ ok: false, motif: 'droit_absent' });
    expect(
      jugerChangementDeRole({
        acteur: admin,
        cible: { id: 'u-q', role: 'qualifieur' },
        vers: 'qualifieur',
      })
    ).toEqual({ ok: false, motif: 'sans_changement' });
  });
});

describe('REQ-SEC-023 — SEC-30 : le step-up déclaré dans la matrice (arbitrage de la sécurité)', () => {
  const ligneOuverteIlYA = (ms: number) => ({
    ...valide(),
    creeAt: new Date(T0.getTime() - ms),
    utilisateurConsole: {
      id: 'u-admin',
      role: 'admin' as const,
      desactiveAt: null,
      sessionVersion: 0,
      valideAt: T0,
    },
  });
  const releve = DUREES_AUTH.releveMs.valeur;

  it('REQ-SEC-023 : TÉMOIN — la gestion des utilisateurs est réservée à admin, avec step-up déclaré ; son écran aussi est à admin seul', () => {
    expect(MATRICE_DES_ROLES['action:gerer_utilisateur_console']).toEqual({
      roles: ['admin'],
      stepUp: true,
    });
    expect(MATRICE_DES_ROLES['ecran:utilisateurs_console']).toEqual({
      roles: ['admin'],
      stepUp: false,
    });
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — une session ouverte il y a le délai de relèvement est refusée « releve_requis » sur une action à step-up ; un instant avant, elle passe', () => {
    expect(
      jugerAcces('action:gerer_utilisateur_console', ligneOuverteIlYA(releve), T0, KID)
    ).toEqual({ ok: false, motif: 'releve_requis' });
    expect(
      jugerAcces('action:gerer_utilisateur_console', ligneOuverteIlYA(releve - 1), T0, KID).ok
    ).toBe(true);
  });

  it('REQ-SEC-023 : une action SANS step-up ne regarde pas l’âge de la session ; le motif entre dans la liste fermée', () => {
    expect(jugerAcces('action:approuver_lot', ligneOuverteIlYA(releve * 10), T0, KID).ok).toBe(
      true
    );
    expect(MOTIFS_DE_REFUS_CONSOLE).toContain('releve_requis');
  });

  // Texte de la sécurité (rattrapage 96), point 4 : le step-up est déclaré dès maintenant pour la
  // levée d'un gel, qui existe ; point 5 : chaque entrée porte un stepUp EXPLICITE.
  it('REQ-SEC-023 : TÉMOIN — la levée d’un gel exige le step-up ; chaque entrée de la matrice déclare son stepUp, vrai ou faux', () => {
    expect(MATRICE_DES_ROLES['action:lever_gel'].stepUp).toBe(true);
    for (const [droit, entree] of Object.entries(MATRICE_DES_ROLES))
      expect(typeof (entree as { stepUp?: unknown }).stepUp, droit).toBe('boolean');
  });

  // Condition 4 de la sécurité (rattrapage 96) : un export de données de personnes demande le
  // step-up ; l'IBAN en clair aussi (décision de la coordination).
  it.each([
    'action:exporter_pain001',
    'action:exporter_das2',
    'action:voir_iban_en_clair',
  ] as const)(
    'REQ-SEC-023 : TÉMOIN À DEUX FACES — %s : une session ouverte il y a le délai de relèvement est refusée « releve_requis » ; un instant avant, elle passe',
    (droit) => {
      expect(MATRICE_DES_ROLES[droit].stepUp).toBe(true);
      expect(jugerAcces(droit, ligneOuverteIlYA(releve), T0, KID)).toEqual({
        ok: false,
        motif: 'releve_requis',
      });
      expect(jugerAcces(droit, ligneOuverteIlYA(releve - 1), T0, KID).ok).toBe(true);
    }
  );
});

// Forme d'A02 (rattrapage 96, quatre yeux) : un admin dont `valide_at` est nul est EN ATTENTE ; il
// n'a aucun droit d'administrateur. Il garde ce qui est ouvert aux quatre rôles : arriver, partir.
describe('REQ-SEC-023 — SEC-30 : un administrateur non validé par un autre n’a aucun droit d’administrateur', () => {
  const ligneDAdmin = (valideAt: Date | null) => ({
    ...valide(),
    utilisateurConsole: {
      id: 'u-admin',
      role: 'admin' as const,
      desactiveAt: null,
      sessionVersion: 0,
      valideAt,
    },
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — un admin en attente est refusé « admin_en_attente » sur une action d’admin ; validé, même appel, il passe', () => {
    expect(jugerAcces('action:suspendre_apporteur', ligneDAdmin(null), T0, KID)).toEqual({
      ok: false,
      motif: 'admin_en_attente',
    });
    expect(jugerAcces('action:suspendre_apporteur', ligneDAdmin(T0), T0, KID).ok).toBe(true);
  });

  it('REQ-SEC-023 : TÉMOIN — en attente, il arrive et part (droits ouverts aux quatre rôles) ; le motif entre dans la liste fermée', () => {
    expect(jugerAcces('ecran:accueil', ligneDAdmin(null), T0, KID).ok).toBe(true);
    expect(jugerAcces('action:se_deconnecter', ligneDAdmin(null), T0, KID).ok).toBe(true);
    expect(jugerAcces('action:approuver_lot', ligneDAdmin(null), T0, KID)).toEqual({
      ok: false,
      motif: 'admin_en_attente',
    });
    expect(MOTIFS_DE_REFUS_CONSOLE).toContain('admin_en_attente');
  });
});

describe('REQ-DM-024 — SEC-30 : une invitation expire si le compte n’est pas activé à temps', () => {
  const invite = (ilYA: number, activeeAt: Date | null = null) => ({
    inviteeAt: new Date(T0.getTime() - ilYA),
    activeeAt,
  });
  // Le nom tranché par la coordination (rattrapage 96) : `invitationConsoleMs`, dans `durees.ts`, à
  // côté de `releveMs` ; 72 h exprimées en millisecondes, validées par Williams le 2026-10-03.
  const delai = DUREES_AUTH.invitationConsoleMs.valeur;

  it('REQ-DM-024 : TÉMOIN À DEUX FACES — non activée à l’échéance, l’invitation est expirée ; un instant avant, elle vaut encore ; activée, elle ne vieillit plus', () => {
    expect(invitationOuverte(invite(delai), T0)).toBe(false);
    expect(invitationOuverte(invite(delai - 1), T0)).toBe(true);
    expect(invitationOuverte(invite(delai * 10, new Date(T0.getTime() - delai)), T0)).toBe(true);
  });

  it('REQ-DM-024 : le délai d’invitation vient des durées de l’authentification, 72 h, validées par Williams', () => {
    expect(DUREES_AUTH.invitationConsoleMs.valeur).toBe(72 * 60 * 60 * 1000);
    expect(DUREES_AUTH.invitationConsoleMs.source).toMatch(/SEC-30/);
  });
});

// Forme d'A02 : le domaine porte sa liste des rôles, confrontée à l'enum du schéma ; et l'événement
// de l'administration des utilisateurs ne porte un rôle que là où le geste en touche un.
describe('REQ-SEC-023 — SEC-30 : la liste des rôles du domaine, et l’événement de l’administration', () => {
  it('REQ-SEC-023 : TÉMOIN — la liste du domaine est l’enum ConsoleRole du schéma, en ordre et en contenu', () => {
    expect([...ROLES_DU_DOMAINE]).toEqual(Object.values(ConsoleRole));
  });

  const acteur = {
    par: 'utilisateur_console' as const,
    id: '00000000-0000-4000-8000-000000000001',
  };
  const charge = CHARGES_PAR_TYPE.utilisateur_console_modifie;

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — changer_role exige deux rôles différents ; inviter, un rôle d’arrivée ; tout autre geste, aucun', () => {
    expect(
      charge.safeParse({ geste: 'changer_role', de: 'lecteur', vers: 'comptable', acteur }).success
    ).toBe(true);
    expect(
      charge.safeParse({ geste: 'changer_role', de: 'lecteur', vers: 'lecteur', acteur }).success
    ).toBe(false);
    expect(
      charge.safeParse({ geste: 'changer_role', de: null, vers: 'lecteur', acteur }).success
    ).toBe(false);
    expect(
      charge.safeParse({ geste: 'inviter', de: null, vers: 'qualifieur', acteur }).success
    ).toBe(true);
    expect(
      charge.safeParse({ geste: 'inviter', de: 'admin', vers: 'qualifieur', acteur }).success
    ).toBe(false);
    expect(charge.safeParse({ geste: 'desactiver', de: null, vers: null, acteur }).success).toBe(
      true
    );
    expect(charge.safeParse({ geste: 'valider', de: null, vers: 'admin', acteur }).success).toBe(
      false
    );
  });

  it('REQ-SEC-023 : la charge est fermée : un champ de plus (une adresse) est refusé', () => {
    expect(
      charge.safeParse({
        geste: 'desactiver',
        de: null,
        vers: null,
        acteur,
        email: 'x@example.org',
      }).success
    ).toBe(false);
  });
});

// Remarque de la sécurité : `activee_at` a un défaut (clock_timestamp()) ; l'invitation est le SEUL
// chemin d'un compte non activé, et elle doit l'écrire EXPLICITEMENT, sinon le défaut l'activerait.
describe('REQ-DM-024 — SEC-30 : l’invitation écrit activeeAt: null explicitement', () => {
  it('REQ-DM-024 : TÉMOIN STATIQUE — la création de l’invitation porte inviteeAt et activeeAt: null', () => {
    const source = readFileSync('src/server/console/utilisateurs/administration.ts', 'utf8');
    const creation = source.slice(source.indexOf('tx.utilisateurConsole.create('));
    const bloc = creation.slice(0, creation.indexOf('});'));
    expect(bloc).toContain('inviteeAt: d.maintenant');
    expect(bloc).toContain('activeeAt: null');
  });
});

// Précision de la sécurité (a), rattrapage 96 : le chemin de la console écrit TOUJOURS un
// administrateur en attente ; seul le semeur ou une commande d'exploitation pose un premier
// administrateur sans validateur.
describe('REQ-SEC-023 — SEC-30 : la console ne crée jamais un administrateur validé', () => {
  const sources = (dossier: string): string[] =>
    readdirSync(dossier, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
      .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'));
  const console_ = [...sources('src/server/console'), ...sources('src/app/(console)')];

  it('REQ-SEC-023 : TÉMOIN STATIQUE — aucun code de la console ne pose valide_at à une création, ni sans le validateur qu’est l’acteur', () => {
    const ecritures = console_.flatMap((s) =>
      [...s.matchAll(/valideAt:\s*([^,}\n]+)/g)].map((m) => ({ s, m }))
    );
    for (const { s, m } of ecritures) {
      const autour = s.slice(Math.max(0, (m.index ?? 0) - 120), (m.index ?? 0) + 80);
      // Une lecture (`select`) n'écrit rien ; toute écriture va avec le validateur, l'acteur.
      if (/valideAt:\s*true/.test(m[0])) continue;
      expect(autour).toContain('valideParId: d.acteur.id');
      expect(autour).not.toContain('.create(');
    }
    for (const s of console_) expect(s).not.toMatch(/create\(\{[^}]*valideAt/s);
  });
});

// CPL-T07 : le dossier de conformité. Vérifier une pièce à l'admin et au qualifieur ; ouvrir et
// valider le dossier à l'admin seul ; la validation, qui mène à la signature, sous step-up
// (condition de la sécurité).
describe('REQ-SEC-023 — CPL-T07 : les droits du dossier de conformité', () => {
  const sessionAdmin = (ms: number) => ({
    ...valide(),
    creeAt: new Date(T0.getTime() - ms),
    utilisateurConsole: {
      id: 'u-admin',
      role: 'admin' as const,
      desactiveAt: null,
      sessionVersion: 0,
      valideAt: T0,
    },
  });
  const releve = DUREES_AUTH.releveMs.valeur;

  it('REQ-SEC-023 : TÉMOIN — vérifier une pièce : admin et qualifieur ; ouvrir et valider le dossier : admin seul', () => {
    expect(MATRICE_DES_ROLES['ecran:conformite_apporteur']).toEqual({
      roles: ['admin', 'qualifieur'],
      stepUp: false,
    });
    expect(MATRICE_DES_ROLES['action:verifier_piece']).toEqual({
      roles: ['admin', 'qualifieur'],
      stepUp: false,
    });
    expect(MATRICE_DES_ROLES['action:ouvrir_kyc']).toEqual({ roles: ['admin'], stepUp: false });
    expect(MATRICE_DES_ROLES['action:valider_kyc']).toEqual({ roles: ['admin'], stepUp: true });
    for (const role of ['comptable', 'lecteur'] as const)
      for (const droit of [
        'action:verifier_piece',
        'action:ouvrir_kyc',
        'action:valider_kyc',
        'ecran:conformite_apporteur',
      ])
        expect(roleAutorise(droit, role), `${droit} × ${role}`).toBe(false);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — valider le dossier, session ouverte il y a le délai de relèvement : « releve_requis » ; un instant avant, elle passe', () => {
    expect(jugerAcces('action:valider_kyc', sessionAdmin(releve), T0, KID)).toEqual({
      ok: false,
      motif: 'releve_requis',
    });
    expect(jugerAcces('action:valider_kyc', sessionAdmin(releve - 1), T0, KID).ok).toBe(true);
    // Ouvrir le dossier ne regarde pas l'âge de la session.
    expect(jugerAcces('action:ouvrir_kyc', sessionAdmin(releve * 10), T0, KID).ok).toBe(true);
  });
});
