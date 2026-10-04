// @req REQ-SEC-058
/**
 * SEC-61 — le gel des traces du journal des accès à la console, en base RÉELLE (forme d'A02 accordée
 * avec la sécurité). Décision de Williams du 2026-10-03 sur la conservation, avec l'exception de la
 * juriste : une trace liée à un incident ou à un litige est gardée jusqu'à sa clôture.
 *
 * TÉMOIN DE LA SÉCURITÉ, MOT POUR MOT : « la purge du journal des accès épargne une ligne gelée, et la
 * purge à la levée du gel ». Un gel OUVERT protège les lignes de SA portée (un utilisateur OU une
 * cible) survenues depuis `depuis` et jusqu'à `jusqu_a` INCLUS, futures comprises si `jusqu_a` est nul
 * (règle de la juriste, conditions de la sécurité) ; après la levée, la purge les vide, puis supprime le
 * gel épuisé, même si la portée écrit des lignes neuves après la levée (correction d'A02). Le filet de la base refuse une purge forcée ; la garde
 * dédiée refuse toute réécriture, une seconde levée, l'effacement d'un gel vivant et TRUNCATE.
 * L'événement chaîné ne porte AUCUN identifiant d'employé ni de cible, ni la référence en clair.
 * Sous `partners_app`, le rôle du serveur ; les admins sont VALIDÉS (quatre yeux).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { demarrerBase, type Base } from './harnais';
import {
  ROLE_D_EXECUTION,
  provisionnerRoleDExecution,
} from '../../src/server/deploiement/role-d-execution';
import { NOMS_DES_SECRETS, kidDe } from '../../src/lib/env';
import { clesPii, empreinteRecherche } from '../../src/server/securite/pii';
import { DUREES_AUTH } from '../../src/server/auth/durees';
import { tirerJeton } from '../../src/server/auth/lien-magique';
import { depotDeSessionsConsole, requireRole } from '../../src/server/roles/require-role';
import { semerSessionConsole, semerUtilisateurConsole } from '../../prisma/seed/06-console';
import {
  limiteDuJournalDesAcces,
  purgerLeJournalDesAccesConsole,
} from '../../src/server/taches/purger-journal-acces-console';
import {
  ErreurGelJournal,
  leverUnGel,
  poserUnGel,
  type ActeurDuGel,
  type PorteeDuGel,
} from '../../src/server/console/gels-journal-acces';

let base: Base;
/** Le client du SERVEUR : la base sous `partners_app`, provisionné comme en production. */
let app: PrismaClient;

/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-61-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'a'.repeat(64),
});
const secretLien = randomBytes(32).toString('hex');
const secretSession = randomBytes(32).toString('hex');
const CONFIGURATION = {
  lien: { secret: secretLien, kid: kidDe(secretLien) },
  session: { secret: secretSession, kid: kidDe(secretSession) },
};

/** L'horloge de la purge : loin après les traces semées, qui sont échues. */
const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const PLUS_TARD = new Date('2028-06-02T12:00:00.000Z');
const DEPUIS = new Date('2026-01-01T00:00:00.000Z');
/** La fin d'une période en cause, et la milliseconde d'après : la borne est INCLUSIVE. */
const JUSQU_A = new Date('2027-01-01T00:00:00.000Z');
const JUSQU_A_PLUS_1MS = new Date(JUSQU_A.getTime() + 1);
/** Une purge assez tardive pour que toutes les traces semées soient échues. */
const BIEN_PLUS_TARD = new Date('2030-01-01T00:00:00.000Z');
const IP_HASH = '0123456789abcdef';

beforeAll(async () => {
  base = await demarrerBase();
  const u = new URL(base.url);
  u.username = ROLE_D_EXECUTION;
  u.password = randomBytes(24).toString('hex');
  await provisionnerRoleDExecution({ urlMigration: base.url, urlExecution: u.toString() });
  app = new PrismaClient({ datasourceUrl: u.toString() });
  // Le premier administrateur, VALIDÉ sans validateur ; chaque admin suivant est validé par lui.
  fondateur = await semer('admin');
  await app.$executeRawUnsafe(
    'UPDATE utilisateurs_console SET valide_at = clock_timestamp() WHERE id = $1::uuid',
    fondateur
  );
}, 180_000);

afterAll(async () => {
  await app?.$disconnect();
  await base?.arreter();
});

let fondateur = '';
let sequence = 0;
async function semer(role: 'admin' | 'comptable' | 'lecteur'): Promise<string> {
  sequence += 1;
  return (
    await semerUtilisateurConsole(base.prisma, {
      id: randomUUID(),
      role,
      email: `gel-${sequence}@example.org`,
      nom: null,
      creeAt: new Date('2026-01-01T00:00:00.000Z'),
      cles: CLES,
    })
  ).id;
}

/** Un administrateur VALIDÉ par le fondateur. */
async function unAdmin(): Promise<ActeurDuGel> {
  const id = await semer('admin');
  await app.$executeRawUnsafe(
    'UPDATE utilisateurs_console SET valide_par_id = $2::uuid, valide_at = clock_timestamp() WHERE id = $1::uuid',
    id,
    fondateur
  );
  return { id, role: 'admin' };
}

/** Une trace ÉCHUE à `MAINTENANT` : sans gel, la purge la vide. */
async function uneTrace(
  t: { utilisateurConsoleId: string; cibleId?: string },
  survenuAt = new Date(limiteDuJournalDesAcces(MAINTENANT).getTime() - 1)
): Promise<string> {
  const id = randomUUID();
  await base.prisma.journalAccesConsole.create({
    data: {
      id,
      utilisateurConsoleId: t.utilisateurConsoleId,
      nature: t.cibleId === undefined ? 'connexion' : 'lecture_coordonnees_apporteur',
      cibleId: t.cibleId ?? null,
      ipHash: IP_HASH,
      survenuAt,
    },
  });
  return id;
}

const ligne = (id: string) => base.prisma.journalAccesConsole.findUniqueOrThrow({ where: { id } });

function poser(
  acteur: ActeurDuGel,
  portee: PorteeDuGel,
  extra: { reference?: string; jusquA?: Date | null; depuis?: Date } = {}
) {
  return poserUnGel(
    app,
    {
      acteur,
      portee,
      motif: 'incident',
      reference: extra.reference ?? `INC-${randomBytes(3).toString('hex').toUpperCase()}`,
      depuis: extra.depuis ?? DEPUIS,
      jusquA: extra.jusquA ?? null,
      maintenant: MAINTENANT,
    },
    CLES
  );
}

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof ErreurGelJournal ? e.motif : String((e as Error).message);
  }
  throw new Error('aucun refus');
}

describe('REQ-SEC-058 — la purge épargne une ligne gelée, et la purge à la levée du gel', () => {
  it('REQ-SEC-058 : TÉMOIN — la purge du journal des accès épargne une ligne gelée, et la purge à la levée du gel', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    const vise = await semer('lecteur');
    const gelee = await uneTrace({ utilisateurConsoleId: vise });
    const libre = await uneTrace({ utilisateurConsoleId: poseur.id });
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise });

    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect(await ligne(gelee)).toMatchObject({ utilisateurConsoleId: vise, purgeAt: null });
    expect(await ligne(libre)).toMatchObject({ utilisateurConsoleId: null, purgeAt: MAINTENANT });

    await leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES);
    const r = await purgerLeJournalDesAccesConsole(app, PLUS_TARD);
    expect(await ligne(gelee)).toMatchObject({
      utilisateurConsoleId: null,
      cibleId: null,
      ipHash: null,
      purgeAt: PLUS_TARD,
    });
    // Le gel levé, ses lignes purgées, est supprimé : il portait des identifiants d'employés.
    expect(r.gelsSupprimes).toBeGreaterThanOrEqual(1);
    expect(
      await base.prisma.journalAccesConsoleGel.findUnique({ where: { id: gel.id } })
    ).toBeNull();
  });

  it('REQ-SEC-058 : TÉMOIN — un gel sur une CIBLE épargne les lectures de cette fiche, par qui que ce soit', async () => {
    const poseur = await unAdmin();
    const lecteur = await semer('comptable');
    const cible = randomUUID();
    const lue = await uneTrace({ utilisateurConsoleId: lecteur, cibleId: cible });
    const autre = await uneTrace({ utilisateurConsoleId: lecteur, cibleId: randomUUID() });
    await poser(poseur, { type: 'cible', cibleId: cible });
    await purgerLeJournalDesAccesConsole(app, MAINTENANT);
    expect((await ligne(lue)).purgeAt).toBeNull();
    expect((await ligne(autre)).purgeAt).toEqual(MAINTENANT);
  });

  it('REQ-SEC-058 : TÉMOIN — sans jusqu_a, l’incident est en cours : une ligne écrite APRÈS la pose est protégée, une ligne avant depuis est purgée', async () => {
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    await poser(poseur, { type: 'utilisateur', utilisateurId: vise });
    const apres = await uneTrace({ utilisateurConsoleId: vise }, PLUS_TARD);
    const avant = await uneTrace({ utilisateurConsoleId: vise }, new Date(DEPUIS.getTime() - 1));
    await purgerLeJournalDesAccesConsole(app, BIEN_PLUS_TARD);
    expect((await ligne(apres)).purgeAt).toBeNull();
    expect((await ligne(avant)).purgeAt).toEqual(BIEN_PLUS_TARD);
  });

  it('REQ-SEC-058 : TÉMOIN — jusqu_a borne le gel ouvert, inclus à la milliseconde : la purge épargne la ligne à jusqu_a et vide celle de jusqu_a + 1 ms', async () => {
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    await poser(poseur, { type: 'utilisateur', utilisateurId: vise }, { jusquA: JUSQU_A });
    const aLaBorne = await uneTrace({ utilisateurConsoleId: vise }, JUSQU_A);
    const apresLaBorne = await uneTrace({ utilisateurConsoleId: vise }, JUSQU_A_PLUS_1MS);
    await purgerLeJournalDesAccesConsole(app, BIEN_PLUS_TARD);
    expect(await ligne(aLaBorne)).toMatchObject({ utilisateurConsoleId: vise, purgeAt: null });
    expect(await ligne(apresLaBorne)).toMatchObject({
      utilisateurConsoleId: null,
      purgeAt: BIEN_PLUS_TARD,
    });
  });

  it('REQ-SEC-058 : TÉMOIN — le filet, à deux faces : la purge forcée de la ligne à jusqu_a est refusée, celle de jusqu_a + 1 ms est admise', async () => {
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    await poser(poseur, { type: 'utilisateur', utilisateurId: vise }, { jusquA: JUSQU_A });
    const aLaBorne = await uneTrace({ utilisateurConsoleId: vise }, JUSQU_A);
    const apresLaBorne = await uneTrace({ utilisateurConsoleId: vise }, JUSQU_A_PLUS_1MS);
    const purgeForcee = (id: string) =>
      app.journalAccesConsole.update({
        where: { id },
        data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: MAINTENANT },
      });
    await expect(purgeForcee(aLaBorne)).rejects.toThrow(/journal_acces_console_gel_respecte/);
    await purgeForcee(apresLaBorne);
    expect((await ligne(apresLaBorne)).purgeAt).toEqual(MAINTENANT);
  });

  it('REQ-SEC-058 : TÉMOIN — un gel levé, ses lignes protégées purgées, est supprimé même si la portée écrit une ligne neuve APRÈS la levée ; une ligne protégée non purgée le retient', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    const viseEpuise = await semer('lecteur');
    const viseRetenu = await semer('lecteur');
    await uneTrace({ utilisateurConsoleId: viseEpuise });
    await uneTrace({ utilisateurConsoleId: viseRetenu });
    const epuise = await poser(poseur, { type: 'utilisateur', utilisateurId: viseEpuise });
    const retenu = await poser(poseur, { type: 'utilisateur', utilisateurId: viseRetenu });
    for (const g of [epuise, retenu])
      await leverUnGel(app, { acteur: leveur, gelId: g.id, maintenant: PLUS_TARD }, CLES);
    // Une ligne neuve, après la levée : non échue, non purgée, hors de ce que le gel a protégé.
    const neuve = await uneTrace(
      { utilisateurConsoleId: viseEpuise },
      new Date(PLUS_TARD.getTime() + 1)
    );
    // Une ligne protégée (avant la levée) mais pas encore échue : non purgée, elle retient le gel.
    await uneTrace({ utilisateurConsoleId: viseRetenu }, MAINTENANT);
    await purgerLeJournalDesAccesConsole(app, PLUS_TARD);
    expect((await ligne(neuve)).purgeAt).toBeNull();
    expect(
      await base.prisma.journalAccesConsoleGel.findUnique({ where: { id: epuise.id } })
    ).toBeNull();
    expect(
      await base.prisma.journalAccesConsoleGel.findUnique({ where: { id: retenu.id } })
    ).not.toBeNull();
  });

  it('REQ-SEC-058 : TÉMOIN — le filet : une purge forcée d’une ligne couverte est refusée par la base', async () => {
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    const gelee = await uneTrace({ utilisateurConsoleId: vise });
    await poser(poseur, { type: 'utilisateur', utilisateurId: vise });
    await expect(
      app.journalAccesConsole.update({
        where: { id: gelee },
        data: { utilisateurConsoleId: null, cibleId: null, ipHash: null, purgeAt: MAINTENANT },
      })
    ).rejects.toThrow(/journal_acces_console_gel_respecte/);
  });
});

describe('REQ-SEC-058 — la forme du gel, tenue par la base', () => {
  const insere = (
    data: Partial<Prisma.JournalAccesConsoleGelUncheckedCreateInput> & { poseParId: string }
  ) =>
    app.journalAccesConsoleGel.create({
      data: { id: randomUUID(), motif: 'litige', reference: 'LIT-0001', depuis: DEPUIS, ...data },
    });

  it('REQ-SEC-058 : TÉMOIN — deux portées ou aucune, une période inversée, une référence hors forme, un gel sur soi sont refusés, nommés', async () => {
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    expect(
      await motif(insere({ poseParId: poseur.id, utilisateurViseId: vise, cibleId: randomUUID() }))
    ).toMatch(/journal_acces_console_gels_une_portee/);
    expect(await motif(insere({ poseParId: poseur.id }))).toMatch(
      /journal_acces_console_gels_une_portee/
    );
    expect(
      await motif(
        insere({
          poseParId: poseur.id,
          utilisateurViseId: vise,
          jusquA: new Date(DEPUIS.getTime() - 1),
        })
      )
    ).toMatch(/journal_acces_console_gels_periode/);
    expect(
      await motif(
        insere({ poseParId: poseur.id, utilisateurViseId: vise, reference: 'nom prénom' })
      )
    ).toMatch(/journal_acces_console_gels_reference_forme/);
    expect(await motif(insere({ poseParId: poseur.id, utilisateurViseId: poseur.id }))).toMatch(
      /journal_acces_console_gels_pas_sur_soi/
    );
    // Par le module : une référence hors forme est refusée AVANT toute écriture.
    expect(
      await motif(poser(poseur, { type: 'utilisateur', utilisateurId: vise }, { reference: '?' }))
    ).toMatch(/reference_gel_invalide/);
  });

  it('REQ-SEC-058 : TÉMOIN — la levée par l’auteur, ou par la personne visée, est refusée', async () => {
    const poseur = await unAdmin();
    const viseAdmin = await unAdmin();
    await unAdmin(); // un tiers existe : le refus est « leveur_interdit », pas l'échec fermé
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: viseAdmin.id });
    expect(
      await motif(leverUnGel(app, { acteur: poseur, gelId: gel.id, maintenant: PLUS_TARD }, CLES))
    ).toBe('leveur_interdit');
    expect(
      await motif(
        leverUnGel(app, { acteur: viseAdmin, gelId: gel.id, maintenant: PLUS_TARD }, CLES)
      )
    ).toBe('leveur_interdit');
    // Et la base le tient seule, sans le module.
    expect(
      await motif(
        app.journalAccesConsoleGel.update({
          where: { id: gel.id },
          data: { leveParId: poseur.id, leveAt: PLUS_TARD },
        })
      )
    ).toMatch(/journal_acces_console_gels_levee_quatre_yeux/);
  });

  it('REQ-SEC-058 : TÉMOIN — une réécriture du gel, ou une seconde levée, est refusée par la garde', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    const vise = await semer('lecteur');
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise });
    expect(
      await motif(
        app.journalAccesConsoleGel.update({ where: { id: gel.id }, data: { reference: 'AUTRE-1' } })
      )
    ).toMatch(/journal_acces_console_gels_garde/);
    // `jusqu_a` ne se modifie pas : ni prolongation, ni raccourcissement silencieux.
    expect(
      await motif(
        app.journalAccesConsoleGel.update({ where: { id: gel.id }, data: { jusquA: JUSQU_A } })
      )
    ).toMatch(/journal_acces_console_gels_garde/);
    await leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES);
    expect(
      await motif(leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES))
    ).toBe('deja_leve');
    expect(
      await motif(
        app.journalAccesConsoleGel.update({
          where: { id: gel.id },
          data: { leveAt: new Date(PLUS_TARD.getTime() + 1) },
        })
      )
    ).toMatch(/journal_acces_console_gels_garde/);
  });

  it('REQ-SEC-058 : TÉMOIN — l’effacement d’un gel ouvert, ou levé avec des lignes à purger, est refusé ; TRUNCATE aussi', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    const vise = await semer('lecteur');
    await uneTrace({ utilisateurConsoleId: vise });
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise });
    const effacer = () =>
      app.$executeRawUnsafe(
        `DELETE FROM "journal_acces_console_gels" WHERE "id" = $1::uuid`,
        gel.id
      );
    expect(await motif(effacer())).toMatch(/journal_acces_console_gels_garde/);
    await leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES);
    expect(await motif(effacer())).toMatch(/journal_acces_console_gels_garde/);
    expect(
      await motif(base.prisma.$executeRawUnsafe('TRUNCATE "journal_acces_console_gels"'))
    ).toMatch(/journal_acces_console_gels_garde/);
  });

  it('REQ-SEC-058 : TÉMOIN — la garde de suppression, à deux faces, lit [depuis, LEAST(jusqu_a, leve_at)] inclus à la milliseconde', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    /** Un gel levé à `PLUS_TARD` dont la seule ligne non purgée survient à `survenuAt`. */
    const gelLeveAvecUneLigne = async (jusquA: Date | null, survenuAt: Date) => {
      const vise = await semer('lecteur');
      await uneTrace({ utilisateurConsoleId: vise }, survenuAt);
      const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise }, { jusquA });
      await leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES);
      return () =>
        app.$executeRawUnsafe(
          `DELETE FROM "journal_acces_console_gels" WHERE "id" = $1::uuid`,
          gel.id
        );
    };
    // Borne `jusqu_a` : la ligne à la borne retient le gel, celle d'après ne le retient pas.
    expect(await motif((await gelLeveAvecUneLigne(JUSQU_A, JUSQU_A))())).toMatch(
      /journal_acces_console_gels_garde/
    );
    expect(await (await gelLeveAvecUneLigne(JUSQU_A, JUSQU_A_PLUS_1MS))()).toBe(1);
    // Sans `jusqu_a`, borne de la levée : même règle, à la milliseconde.
    expect(await motif((await gelLeveAvecUneLigne(null, PLUS_TARD))())).toMatch(
      /journal_acces_console_gels_garde/
    );
    expect(await (await gelLeveAvecUneLigne(null, new Date(PLUS_TARD.getTime() + 1)))()).toBe(1);
  });
});

describe('REQ-SEC-058 — qui pose et qui lève, et ce que le journal chaîné en dit', () => {
  it('REQ-SEC-058 : TÉMOIN — la charge SÉRIALISÉE de pose et de levée ne contient aucun identifiant, ni la référence en clair', async () => {
    const poseur = await unAdmin();
    const leveur = await unAdmin();
    const vise = await semer('lecteur');
    const reference = 'INC-SERIALISEE';
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise }, { reference });
    await leverUnGel(app, { acteur: leveur, gelId: gel.id, maintenant: PLUS_TARD }, CLES);
    const evenements = await base.prisma.evenement.findMany({
      where: { type: 'journal_acces_gel_modifie', agregatId: gel.id },
      orderBy: { survenuAt: 'asc' },
    });
    expect(evenements.map((e) => (e.charge as { geste: string }).geste)).toEqual([
      'poser',
      'lever',
    ]);
    for (const e of evenements) {
      const texte = JSON.stringify(e.charge);
      for (const interdit of [
        poseur.id,
        leveur.id,
        vise,
        reference,
        'utilisateurViseId',
        'cibleId',
      ])
        expect(texte).not.toContain(interdit);
      expect(Object.keys(e.charge as object).sort()).toEqual([
        'acteur',
        'geste',
        'motif',
        'portee',
        'referenceEmpreinte',
      ]);
      expect(e.charge).toMatchObject({
        motif: 'incident',
        portee: { type: 'utilisateur' },
        referenceEmpreinte: empreinteRecherche('reference_gel', reference, CLES),
        acteur: { par: 'utilisateur_console' },
      });
    }
  });

  it('REQ-SEC-058 : TÉMOIN — un rôle non autorisé, un administrateur en attente et l’absence de step-up sont refusés', async () => {
    const t0 = Date.now();
    const maintenant = new Date(t0 + 60_000);
    const verdict = async (
      droit: 'action:poser_gel_journal_acces' | 'action:lever_gel_journal_acces',
      id: string,
      ouverture: Date
    ) => {
      const jetonSession = tirerJeton();
      await semerSessionConsole(base.prisma, {
        utilisateurConsoleId: id,
        jetonLien: tirerJeton(),
        jetonSession,
        consommeAt: ouverture,
        ipHash: null,
        configuration: CONFIGURATION,
      });
      const v = await requireRole(droit, jetonSession, {
        maintenant: () => maintenant,
        depot: depotDeSessionsConsole(base.prisma),
        configuration: CONFIGURATION.session,
      });
      return v.ok ? v.utilisateur.role : v.motif;
    };
    const recente = new Date(t0);
    const ancienne = new Date(t0 - DUREES_AUTH.releveMs.valeur);
    const comptable = await semer('comptable');
    const enAttente = await semer('admin');
    const valide = await unAdmin();
    for (const droit of [
      'action:poser_gel_journal_acces',
      'action:lever_gel_journal_acces',
    ] as const) {
      expect(await verdict(droit, comptable, recente), droit).toBe('role_refuse');
      expect(await verdict(droit, enAttente, recente), droit).toBe('admin_en_attente');
      expect(await verdict(droit, valide.id, ancienne), droit).toBe('releve_requis');
      expect(await verdict(droit, valide.id, recente), droit).toBe('admin');
    }
    // Et le module relit le droit en base : un comptable, un admin en attente sont refusés.
    const vise = await semer('lecteur');
    for (const acteur of [
      { id: comptable, role: 'comptable' as const },
      { id: enAttente, role: 'admin' as const },
    ])
      expect(await motif(poser(acteur, { type: 'utilisateur', utilisateurId: vise }))).toBe(
        'droit_absent'
      );
  });

  it('REQ-SEC-058 : TÉMOIN — avec un seul administrateur validé hors de l’auteur et du visé, aucun : la levée est refusée, échec fermé', async () => {
    // Une base où le seul autre admin validé est désactivé : personne ne peut lever.
    const poseur = await unAdmin();
    const vise = await semer('lecteur');
    const gel = await poser(poseur, { type: 'utilisateur', utilisateurId: vise });
    const autres = await base.prisma.utilisateurConsole.findMany({
      where: { role: 'admin', desactiveAt: null, id: { not: poseur.id } },
      select: { id: true },
    });
    await base.prisma.utilisateurConsole.updateMany({
      where: { id: { in: autres.map((a) => a.id) } },
      data: { desactiveAt: PLUS_TARD },
    });
    expect(
      await motif(leverUnGel(app, { acteur: poseur, gelId: gel.id, maintenant: PLUS_TARD }, CLES))
    ).toBe('aucun_autre_administrateur');
    expect(
      (await base.prisma.journalAccesConsoleGel.findUniqueOrThrow({ where: { id: gel.id } })).leveAt
    ).toBeNull();
  });
});
