// @req REQ-SEC-058
/**
 * Le journal des accès à la console, par identifiants seuls, jugé sans base : un faux client
 * enregistre chaque appel, dans l'ordre. La base réelle (ajout seul par le gabarit commun, CHECK,
 * purge qui vide les identifiants) est jouée par `tests/integration/journal-des-acces-console.spec.ts`.
 *
 * CE QUE CE FICHIER GARDE : la trace est écrite AVANT la lecture, dans la même transaction, et une
 * trace qui échoue ne laisse rien lire (échec fermé) ; une cible inconnue est refusée sans trace ; une
 * connexion réussie se trace sans cible, avec l'empreinte tronquée de l'adresse réseau ; la purge
 * VIDE l'utilisateur, la cible et l'empreinte de l'échu seul, pose sa date, par lots, et s'arrête sur
 * un lot vide ; aucune lecture de coordonnées ne contourne le lecteur unique ; rien ne supprime.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import {
  CibleInconnue,
  journaliserConnexionConsole,
  lireCoordonneesDeLApporteur,
  lireCoordonneesDuContact,
} from '../../../src/server/console/journal-des-acces';
import {
  LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../../src/server/taches/purger-journal-acces-console';
import { clesPii, empreinteAdresseReseau, encryptPii } from '../../../src/server/securite/pii';
import { MODELE_APPORTEUR } from '../../../src/server/auth/lien-magique-depot';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const UTILISATEUR = '0190a5c0-0000-7000-8000-000000000001';
const APPORTEUR = '0190a5c0-0000-7000-8000-000000000002';
const ATTRIBUTION = '0190a5c0-0000-7000-8000-000000000003';
const ADRESSE = '203.0.113.7';
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-58-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

type Appel = { quoi: string; args: unknown };

/** Un faux client : chaque appel est noté ; `trace` lève si demandé ; les lignes n'ont aucun bloc. */
function fauxClient(o: { cibleExiste?: boolean; traceEchoue?: boolean } = {}) {
  const appels: Appel[] = [];
  const noter = (quoi: string) => async (args: unknown) => {
    appels.push({ quoi, args });
    if (quoi === 'journalAccesConsole.create' && o.traceEchoue) throw new Error('trace refusée');
    if (quoi.endsWith('.findUnique')) {
      const select = (args as { select: Record<string, boolean> }).select;
      if (o.cibleExiste === false) return null;
      return Object.fromEntries(Object.keys(select).map((k) => [k, k === 'id' ? 'x' : null]));
    }
    return {};
  };
  const tx = {
    journalAccesConsole: { create: noter('journalAccesConsole.create') },
    apporteur: { findUnique: noter('apporteur.findUnique') },
    attribution: { findUnique: noter('attribution.findUnique') },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, appels };
}

/** Les champs lus par chaque `findUnique`, dans l'ordre. */
const lectures = (appels: Appel[]) =>
  appels
    .filter((a) => a.quoi.endsWith('.findUnique'))
    .map((a) => Object.keys((a.args as { select: object }).select).sort());

describe('REQ-SEC-058 — la trace d’une lecture de coordonnées précède la lecture', () => {
  it('REQ-SEC-058 : TÉMOIN — apporteur : la cible est vérifiée par son id, la trace est écrite, PUIS les blocs sont lus', async () => {
    const f = fauxClient();
    await lireCoordonneesDeLApporteur(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, adresse: ADRESSE },
      CLES
    );
    expect(f.appels.map((a) => a.quoi)).toEqual([
      'apporteur.findUnique',
      'journalAccesConsole.create',
      'apporteur.findUnique',
    ]);
    expect(lectures(f.appels)[0]).toEqual(['id']);
    expect(f.appels[1]!.args).toEqual({
      data: expect.objectContaining({
        utilisateurConsoleId: UTILISATEUR,
        nature: 'lecture_coordonnees_apporteur',
        cibleId: APPORTEUR,
        ipHash: empreinteAdresseReseau(ADRESSE, CLES),
      }),
    });
  });

  it('REQ-SEC-058 : TÉMOIN — contact : la même suite, sur l’attribution qui le porte', async () => {
    const f = fauxClient();
    await lireCoordonneesDuContact(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, adresse: null },
      CLES
    );
    expect(f.appels.map((a) => a.quoi)).toEqual([
      'attribution.findUnique',
      'journalAccesConsole.create',
      'attribution.findUnique',
    ]);
    expect(f.appels[1]!.args).toEqual({
      data: expect.objectContaining({
        nature: 'lecture_coordonnees_contact',
        cibleId: ATTRIBUTION,
      }),
    });
  });

  it('REQ-SEC-058 : TÉMOIN — ÉCHEC FERMÉ : une trace qui échoue ne laisse lire aucun bloc', async () => {
    const f = fauxClient({ traceEchoue: true });
    await expect(
      lireCoordonneesDeLApporteur(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, adresse: null },
        CLES
      )
    ).rejects.toThrow('trace refusée');
    expect(lectures(f.appels)).toEqual([['id']]);
  });

  it('REQ-SEC-058 : TÉMOIN — une cible inconnue est refusée, nommée, et rien n’est tracé', async () => {
    const f = fauxClient({ cibleExiste: false });
    await expect(
      lireCoordonneesDuContact(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, adresse: null },
        CLES
      )
    ).rejects.toBeInstanceOf(CibleInconnue);
    expect(f.appels.map((a) => a.quoi)).toEqual(['attribution.findUnique']);
  });

  it('REQ-SEC-058 : une connexion réussie se trace sans cible, avec l’empreinte tronquée, et rien d’autre', async () => {
    const f = fauxClient();
    await journaliserConnexionConsole(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, adresse: ADRESSE },
      CLES
    );
    expect(f.appels).toHaveLength(1);
    const { data } = f.appels[0]!.args as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      utilisateurConsoleId: UTILISATEUR,
      nature: 'connexion',
      cibleId: null,
      ipHash: empreinteAdresseReseau(ADRESSE, CLES),
    });
    expect(Object.keys(data).sort()).toEqual([
      'cibleId',
      'id',
      'ipHash',
      'nature',
      'utilisateurConsoleId',
    ]);
  });
});

// ── les blocs lus, déchiffrés sous LEUR ligne ───────────────────────────────────────────────────

/**
 * Un faux client qui rend, à la seconde lecture, des blocs VRAIMENT chiffrés : chacun sous son modèle,
 * son champ et l'identifiant de sa fiche. Un bloc déchiffré sous une autre ligne échoue (AAD), un
 * champ oublié dans la sélection revient `undefined` : la sortie le montre.
 */
function fauxClientChiffre(blocs: Record<string, Uint8Array | null> | null) {
  const appels: Appel[] = [];
  let lecture = 0;
  const lire = (quoi: string) => async (args: unknown) => {
    appels.push({ quoi, args });
    lecture += 1;
    if (lecture === 1) return { id: 'x' };
    if (blocs === null) return null;
    const select = (args as { select: Record<string, boolean> }).select;
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, v]) => v)
        .map(([k]) => [k, blocs[k]])
    );
  };
  const tx = {
    journalAccesConsole: {
      create: async (args: unknown) => {
        appels.push({ quoi: 'journalAccesConsole.create', args });
        return {};
      },
    },
    apporteur: { findUnique: lire('apporteur.findUnique') },
    attribution: { findUnique: lire('attribution.findUnique') },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => f(tx),
  } as unknown as PrismaClient;
  return { client, appels };
}

const chiffre = (modele: string, champ: string, id: string, clair: string) =>
  encryptPii({ modele, champ, id }, clair, CLES);

describe('REQ-SEC-058 — les coordonnées sortent déchiffrées, champ par champ, sous leur ligne', () => {
  it('REQ-SEC-058 : TÉMOIN — apporteur : les quatre blocs, sélectionnés par leur nom, déchiffrés chacun sous le sien', async () => {
    const blocs = {
      nomChiffre: chiffre(MODELE_APPORTEUR, 'nomChiffre', APPORTEUR, 'Fictif'),
      prenomChiffre: chiffre(MODELE_APPORTEUR, 'prenomChiffre', APPORTEUR, 'Alix'),
      emailChiffre: chiffre(MODELE_APPORTEUR, 'emailChiffre', APPORTEUR, 'alix@exemple.test'),
      telephoneChiffre: null,
    };
    const f = fauxClientChiffre(blocs);
    expect(
      await lireCoordonneesDeLApporteur(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, adresse: null },
        CLES
      )
    ).toEqual({ nom: 'Fictif', prenom: 'Alix', email: 'alix@exemple.test', telephone: null });
    expect(f.appels[0]!.args).toEqual({ where: { id: APPORTEUR }, select: { id: true } });
    expect(f.appels[2]!.args).toEqual({
      where: { id: APPORTEUR },
      select: { nomChiffre: true, prenomChiffre: true, emailChiffre: true, telephoneChiffre: true },
    });
  });

  it('REQ-SEC-058 : TÉMOIN — contact : les cinq blocs, sous le modèle de l’attribution qui le porte', async () => {
    const blocs = {
      nomContactChiffre: chiffre('attribution', 'nomContactChiffre', ATTRIBUTION, 'Fictive'),
      prenomContactChiffre: chiffre('attribution', 'prenomContactChiffre', ATTRIBUTION, 'Camille'),
      fonctionContactChiffre: chiffre(
        'attribution',
        'fonctionContactChiffre',
        ATTRIBUTION,
        'Gérante'
      ),
      emailChiffre: chiffre('attribution', 'emailChiffre', ATTRIBUTION, 'camille@exemple.test'),
      telephoneChiffre: chiffre('attribution', 'telephoneChiffre', ATTRIBUTION, '0100000000'),
    };
    const f = fauxClientChiffre(blocs);
    expect(
      await lireCoordonneesDuContact(
        f.client,
        { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, adresse: null },
        CLES
      )
    ).toEqual({
      nom: 'Fictive',
      prenom: 'Camille',
      fonction: 'Gérante',
      email: 'camille@exemple.test',
      telephone: '0100000000',
    });
    expect(f.appels[0]!.args).toEqual({ where: { id: ATTRIBUTION }, select: { id: true } });
    expect(f.appels[2]!.args).toEqual({
      where: { id: ATTRIBUTION },
      select: {
        nomContactChiffre: true,
        prenomContactChiffre: true,
        fonctionContactChiffre: true,
        emailChiffre: true,
        telephoneChiffre: true,
      },
    });
  });

  it('REQ-SEC-058 : une adresse absente laisse l’empreinte nulle', async () => {
    const f = fauxClientChiffre({});
    await journaliserConnexionConsole(
      f.client,
      { utilisateurConsoleId: UTILISATEUR, adresse: null },
      CLES
    );
    expect((f.appels[0]!.args as { data: { ipHash: unknown } }).data.ipHash).toBeNull();
  });

  it.each([
    ['apporteur', 'lecture_coordonnees_apporteur'],
    ['contact', 'lecture_coordonnees_contact'],
  ] as const)(
    'REQ-SEC-058 : %s — une fiche disparue entre la trace et la lecture est refusée, nommée par sa nature',
    async (quoi, nature) => {
      const f = fauxClientChiffre(null);
      const lecture =
        quoi === 'apporteur'
          ? lireCoordonneesDeLApporteur(
              f.client,
              { utilisateurConsoleId: UTILISATEUR, apporteurId: APPORTEUR, adresse: null },
              CLES
            )
          : lireCoordonneesDuContact(
              f.client,
              { utilisateurConsoleId: UTILISATEUR, attributionId: ATTRIBUTION, adresse: null },
              CLES
            );
      const e = await lecture.catch((x: unknown) => x);
      expect(e).toBeInstanceOf(CibleInconnue);
      expect((e as Error).name).toBe('CibleInconnue');
      expect((e as Error).message).toBe(`cible inconnue pour ${nature}`);
      // la trace, elle, est écrite : l'accès a été tenté.
      expect(f.appels.map((a) => a.quoi)).toContain('journalAccesConsole.create');
    }
  );
});

// ── la purge ────────────────────────────────────────────────────────────────────────────────────

const MAINTENANT = new Date('2027-10-03T12:00:00.000Z');

/**
 * Un faux client de la purge. SEC-61 : le lot échu se lit en SQL (`NOT EXISTS` sur les gels ouverts,
 * le critère même du filet de la base) ; les gels épuisés aussi — le faux n'en rend aucun.
 */
function fauxClientDePurge(lots: number[], compte: (n: number) => number = (n) => n) {
  const lectures: { texte: string; valeurs: unknown[] }[] = [];
  const lecturesDesGels: string[] = [];
  const ecritures: { where: unknown; data: unknown }[] = [];
  let rang = 0;
  const client = {
    $queryRaw: async (chaines: TemplateStringsArray, ...parametres: unknown[]) => {
      const requete = Prisma.sql(chaines, ...parametres);
      if (
        /FROM "journal_acces_console_gels" g\s+WHERE g\."leve_at" IS NOT NULL/.test(requete.sql)
      ) {
        lecturesDesGels.push(requete.sql);
        return [];
      }
      lectures.push({ texte: requete.sql, valeurs: requete.values });
      const n = lots[rang] ?? 0;
      rang += 1;
      return Array.from({ length: n }, (_, i) => ({ id: `j-${rang}-${i}` }));
    },
    journalAccesConsole: {
      updateMany: async (a: { where: { id: { in: string[] } }; data: unknown }) => {
        ecritures.push(a);
        return { count: compte(a.where.id.in.length) };
      },
    },
  } as unknown as PrismaClient;
  return { client, lectures, lecturesDesGels, ecritures };
}

describe('REQ-SEC-058 — la purge à l’échéance vide les identifiants, la ligne nue reste', () => {
  it('REQ-SEC-058 : la durée vient de la SSOT des durées : douze mois, décision de Williams', () => {
    expect(SEUILS.JOURNAL_ACCES_CONSOLE_CONSERVATION_MOIS).toMatchObject({
      valeur: 12,
      unite: 'mois',
    });
    expect(limiteDuJournalDesAcces(MAINTENANT)).toEqual(new Date('2026-10-03T12:00:00.000Z'));
  });

  it('REQ-SEC-058 : TÉMOIN — chaque lecture vise l’échu NON purgé et NON gelé, ordonnée, bornée au lot', async () => {
    const f = fauxClientDePurge([1]);
    await purgerLeJournalDesAccesConsole(f.client, MAINTENANT);
    const { texte, valeurs } = f.lectures[0]!;
    expect(texte).toMatch(/j\."survenu_at" < \? AND j\."purge_at" IS NULL/);
    // SEC-61 : le critère du filet — un gel OUVERT, de la même portée, dans sa période (jusqu_a inclus).
    expect(texte).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM "journal_acces_console_gels" g\s+WHERE g\."leve_at" IS NULL\s+AND j\."survenu_at" >= g\."depuis" AND \(g\."jusqu_a" IS NULL OR j\."survenu_at" <= g\."jusqu_a"\)\s+AND \(g\."utilisateur_vise_id" = j\."utilisateur_console_id" OR g\."cible_id" = j\."cible_id"\)\)/
    );
    expect(texte).toMatch(/ORDER BY j\."survenu_at" ASC, j\."id" ASC\s+LIMIT \?/);
    expect(valeurs).toEqual([
      limiteDuJournalDesAcces(MAINTENANT),
      LOT_DE_PURGE_DU_JOURNAL_DES_ACCES,
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — un gel levé s’efface quand ses lignes protégées, couvertes et survenues jusqu’à la levée, sont purgées', async () => {
    const f = fauxClientDePurge([]);
    await purgerLeJournalDesAccesConsole(f.client, MAINTENANT);
    expect(f.lecturesDesGels).toHaveLength(1);
    expect(f.lecturesDesGels[0]).toMatch(
      /WHERE j\."purge_at" IS NULL\s+AND j\."survenu_at" >= g\."depuis" AND \(g\."jusqu_a" IS NULL OR j\."survenu_at" <= g\."jusqu_a"\)\s+AND j\."survenu_at" <= g\."leve_at"\s+AND \(j\."utilisateur_console_id" = g\."utilisateur_vise_id" OR j\."cible_id" = g\."cible_id"\)\)/
    );
  });

  it('REQ-SEC-058 : TÉMOIN — la purge VIDE l’utilisateur, la cible et l’empreinte, et pose sa date, en une écriture par lot', async () => {
    const f = fauxClientDePurge([2]);
    await purgerLeJournalDesAccesConsole(f.client, MAINTENANT);
    expect(f.ecritures).toEqual([
      {
        where: { id: { in: ['j-1-0', 'j-1-1'] }, purgeAt: null },
        data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: MAINTENANT },
      },
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — par lots jusqu’à épuisement, la somme est celle de la base, et un lot qui n’enlève rien arrête', async () => {
    const f = fauxClientDePurge([LOT_DE_PURGE_DU_JOURNAL_DES_ACCES, 3]);
    expect(await purgerLeJournalDesAccesConsole(f.client, MAINTENANT)).toEqual({
      purgees: LOT_DE_PURGE_DU_JOURNAL_DES_ACCES + 3,
      gelsSupprimes: 0,
    });
    const g = fauxClientDePurge([2, 2, 2], () => 0);
    expect(await purgerLeJournalDesAccesConsole(g.client, MAINTENANT)).toEqual({
      purgees: 0,
      gelsSupprimes: 0,
    });
    expect(g.ecritures).toHaveLength(1);
  });
});

// ── les témoins statiques ───────────────────────────────────────────────────────────────────────

function fichiers(racine: string): string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine).flatMap((n) => {
    const p = join(racine, n).replace(/\\/g, '/');
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

const LECTEUR = 'src/server/console/journal-des-acces.ts';

/**
 * Un fichier de l'application est SOUS LA CONSOLE si son chemin, une fois retirés les groupes de
 * routes `(…)`, commence par `console/` : la console vit dans des groupes, comme
 * `src/app/(connexion-console)/console/…`.
 */
function estSousLaConsole(chemin: string): boolean {
  if (chemin.startsWith('src/server/console/')) return true;
  if (!chemin.startsWith('src/app/')) return false;
  const segments = chemin
    .slice('src/app/'.length)
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s));
  return segments[0] === 'console';
}

/**
 * Ce qui déchiffre, ou apporte de quoi déchiffrer : `decryptPii` (appel ou import nommé), ou un
 * import de TOUT le module des PII (`import * as …`). Les clés et les empreintes ne déchiffrent pas :
 * la connexion de la console importe `clesPii` (SEC-29), et elle n'est pas fautive.
 */
const DECHIFFRE = /\bdecryptPii\b|import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*securite\/pii['"]/;

/** Les fichiers du périmètre de la console qui déchiffrent hors du lecteur unique. */
function fautifsSousLaConsole(chemins: readonly string[], lire: (f: string) => string): string[] {
  return chemins
    .filter((f) => estSousLaConsole(f) && f !== LECTEUR)
    .filter((f) => DECHIFFRE.test(lire(f)));
}

describe('REQ-SEC-058 — aucune lecture ne contourne la trace, et rien ne supprime', () => {
  it('REQ-SEC-058 : TÉMOIN — sous la console, groupes de routes compris, seul le lecteur unique déchiffre', () => {
    const perimetre = [...fichiers('src/server/console'), ...fichiers('src/app')].filter(
      estSousLaConsole
    );
    // Jamais vide sans bruit : le lecteur en fait partie, et les routes de la console y entrent
    // d'elles-mêmes, sous n'importe quel groupe.
    expect(perimetre.length).toBeGreaterThan(0);
    expect(perimetre).toContain(LECTEUR);
    expect(fautifsSousLaConsole(perimetre, (f) => readFileSync(f, 'utf8'))).toEqual([]);
    expect(readFileSync(LECTEUR, 'utf8')).toMatch(/\bdecryptPii\b/);
  });

  it('REQ-SEC-058 : CONTRE-TÉMOIN — une page sous un groupe de routes qui déchiffre est NOMMÉE ; hors de la console, elle n’est pas jugée ici', () => {
    const contenus: Record<string, string> = {
      'src/app/(console)/console/x.ts': 'const nom = decryptPii(ligne, bloc, cles);',
      'src/app/(connexion-console)/console/fiche/page.tsx':
        "import { decryptPii } from '../../../../server/securite/pii';",
      'src/app/(espace)/connexion/page.tsx': 'decryptPii(ligne, bloc, cles);',
      'src/app/(console)/console/propre.ts': 'export const rien = 1;',
      // La connexion de la console (SEC-29) importe des CLÉS, pas le déchiffrement : non fautive.
      'src/app/(connexion-console)/console/connexion/actions.ts':
        "import { clesPii } from '../../../../server/securite/pii';",
      'src/app/(console)/console/tout.ts': "import * as pii from '../../../server/securite/pii';",
      [LECTEUR]: 'decryptPii(ligne, bloc, cles);',
    };
    expect(estSousLaConsole('src/app/(a)/(b)/console/y.ts')).toBe(true);
    expect(estSousLaConsole('src/app/consoles/y.ts')).toBe(false);
    expect(fautifsSousLaConsole(Object.keys(contenus), (f) => contenus[f]!)).toEqual([
      'src/app/(console)/console/x.ts',
      'src/app/(connexion-console)/console/fiche/page.tsx',
      'src/app/(console)/console/tout.ts',
    ]);
  });

  it('REQ-SEC-058 : TÉMOIN — aucun code ne supprime une trace : la purge vide, elle n’efface pas', () => {
    const fautifs = fichiers('src').filter((f) =>
      /journalAccesConsole\.(delete|deleteMany)\b|DELETE FROM\s+"?journal_acces_console/.test(
        readFileSync(f, 'utf8')
      )
    );
    expect(fautifs).toEqual([]);
  });
});
