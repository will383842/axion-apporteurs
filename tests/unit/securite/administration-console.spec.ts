// @req REQ-SEC-023
// @req REQ-DM-024
/**
 * L'administration des utilisateurs de la console, EN PROCESSUS, sur un faux client : chaque geste,
 * ses refus nommés, son écriture exacte, son événement exact (le journal est un espion), et les
 * courriels qu'il construit (destinataires, sujet, corps). La base réelle (déclencheurs des quatre
 * yeux, version de session, CHECK) est jugée par `tests/integration/utilisateurs-console-administration.spec.ts`.
 * Ce témoin-ci existe pour que la passe de mutation juge ces modules : elle ne charge pas l'intégration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';
import { clesPii, colonnesPii } from '../../../src/server/securite/pii';
import { DUREES_AUTH } from '../../../src/server/auth/durees';
import { MODELE_UTILISATEUR_CONSOLE } from '../../../src/server/auth/lien-magique-depot';
import { ajouterEvenement } from '../../../src/server/evenement/journal';
import { UTILISATEURS_CONSOLE } from '../../../src/content/micro-copy/console/utilisateurs';
import {
  changerLeRole,
  desactiver,
  ErreurAdministrationConsole,
  inviter,
  reactiver,
  relancer,
  revoquerLesSessions,
  validerLAdministrateur,
  type ActeurDeLaConsole,
} from '../../../src/server/console/utilisateurs/administration';
import { courrielDInvitation, identite } from '../../../src/server/console/utilisateurs/courriels';
import {
  dateEtHeureCompletesDeParis,
  jourDeParis,
  jourEtHeureDeParis,
} from '../../../src/server/console/utilisateurs/dates';

vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));

const C = UTILISATEURS_CONSOLE.courriels;
/** Des clés de test, fabriquées à l'exécution (jamais un secret réel). */
const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-admin-console-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'e'.repeat(64),
});

const MAINTENANT = new Date('2026-10-04T08:15:00.000Z'); // 10:15 à Paris (heure d'été)
const ADMIN: ActeurDeLaConsole = { id: '0190f0f0-0000-7000-8000-0000000000a1', role: 'admin' };
const CIBLE = '0190f0f0-0000-7000-8000-0000000000c1';

type Ligne = {
  id: string;
  role: 'admin' | 'qualifieur' | 'comptable' | 'lecteur';
  desactiveAt: Date | null;
  activeeAt: Date | null;
  valideAt: Date | null;
  nomChiffre: Uint8Array | null;
  emailChiffre: Uint8Array | null;
};

/** Une ligne de la console, son courriel et son nom CHIFFRÉS comme en base. */
function ligne(
  id: string,
  role: Ligne['role'],
  o: {
    email?: string | null;
    nom?: string | null;
    desactiveAt?: Date | null;
    valideAt?: Date | null;
  } = {}
): Ligne {
  const email = o.email === undefined ? `${id.slice(-2)}@exemple.test` : o.email;
  const c =
    email === null
      ? { emailChiffre: null, nomChiffre: null }
      : colonnesPii(
          { modele: MODELE_UTILISATEUR_CONSOLE, id },
          { email, nom: o.nom ?? null },
          CLES
        );
  return {
    id,
    role,
    desactiveAt: o.desactiveAt ?? null,
    activeeAt: MAINTENANT,
    valideAt: o.valideAt === undefined ? (role === 'admin' ? MAINTENANT : null) : o.valideAt,
    nomChiffre: (c.nomChiffre as Uint8Array | null | undefined) ?? null,
    emailChiffre: (c.emailChiffre as Uint8Array | null | undefined) ?? null,
  };
}

/** Un faux client : les lignes, et ce qui est écrit. */
function univers(lignes: Ligne[], o: { relances?: number } = {}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const parId = (id: string) => lignes.find((l) => l.id === id) ?? null;
  const tx = {
    utilisateurConsole: {
      findUnique: async (a: { where: { id: string } }) => {
        appels.push({ quoi: 'findUnique', args: a });
        return parId(a.where.id);
      },
      findUniqueOrThrow: async (a: { where: { id: string } }) => {
        const l = parId(a.where.id);
        if (l === null) throw new Error('introuvable');
        return l;
      },
      findMany: async (a: { where: { role: string; desactiveAt: null } }) =>
        lignes.filter((l) => l.role === a.where.role && l.desactiveAt === null),
      update: async (a: unknown) => {
        appels.push({ quoi: 'update', args: a });
        return a;
      },
      updateMany: async (a: unknown) => {
        appels.push({ quoi: 'updateMany', args: a });
        return { count: o.relances ?? 1 };
      },
      create: async (a: { data: Record<string, unknown> }) => {
        appels.push({ quoi: 'create', args: a });
        // Comme la base : la ligne créée existe pour la suite de la transaction.
        lignes.push({
          id: a.data.id as string,
          role: a.data.role as Ligne['role'],
          desactiveAt: null,
          activeeAt: null,
          valideAt: null,
          nomChiffre: null,
          emailChiffre: (a.data.emailChiffre as Uint8Array | undefined) ?? null,
        });
        return a;
      },
    },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  const ecrit = (quoi: string) => appels.filter((a) => a.quoi === quoi).map((a) => a.args);
  return { client, appels, ecrit };
}

const evenement = () => vi.mocked(ajouterEvenement);
const chargeDu = (geste: string, de: string | null = null, vers: string | null = null) => ({
  type: 'utilisateur_console_modifie',
  agregat: 'utilisateur_console',
  agregatId: CIBLE,
  survenuAt: MAINTENANT,
  charge: { geste, de, vers, acteur: { par: 'utilisateur_console', id: ADMIN.id } },
});

async function motif(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErreurAdministrationConsole) return e.motif;
    throw e;
  }
  throw new Error('aucun refus');
}

beforeEach(() => evenement().mockReset());

describe('REQ-SEC-023 — les refus communs, avant toute transaction', () => {
  it('REQ-SEC-023 : TÉMOIN — un rôle autre qu’admin est refusé « droit_absent », sur son propre compte « propre_compte », sans transaction', async () => {
    const u = univers([ligne(CIBLE, 'lecteur')]);
    const gestes = [desactiver, revoquerLesSessions, validerLAdministrateur, relancer];
    for (const g of gestes) {
      expect(
        await motif(
          g(u.client, {
            acteur: { id: ADMIN.id, role: 'comptable' },
            cibleId: CIBLE,
            maintenant: MAINTENANT,
          })
        )
      ).toBe('droit_absent');
      expect(
        await motif(g(u.client, { acteur: ADMIN, cibleId: ADMIN.id, maintenant: MAINTENANT }))
      ).toBe('propre_compte');
    }
    expect(
      await motif(
        reactiver(u.client, {
          acteur: ADMIN,
          cibleId: ADMIN.id,
          maintenant: MAINTENANT,
          cles: CLES,
        })
      )
    ).toBe('propre_compte');
    expect(u.appels).toEqual([]);
    expect(evenement()).not.toHaveBeenCalled();
    const e = new ErreurAdministrationConsole('introuvable');
    expect([e.name, e.message, e.motif]).toEqual([
      'ErreurAdministrationConsole',
      'administration_console : introuvable',
      'introuvable',
    ]);
  });

  it('REQ-SEC-023 : TÉMOIN — une cible introuvable est refusée « introuvable », lue par son seul identifiant', async () => {
    const u = univers([]);
    expect(
      await motif(desactiver(u.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT }))
    ).toBe('introuvable');
    expect(u.ecrit('findUnique')).toEqual([
      {
        where: { id: CIBLE },
        select: { id: true, role: true, desactiveAt: true, activeeAt: true },
      },
    ]);
    expect(u.ecrit('update')).toEqual([]);
  });
});

describe('REQ-SEC-023 — chaque geste écrit exactement, et son événement', () => {
  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — désactiver : déjà désactivé refusé ; actif, la date est posée et l’événement écrit', async () => {
    const deja = univers([ligne(CIBLE, 'lecteur', { desactiveAt: MAINTENANT })]);
    expect(
      await motif(
        desactiver(deja.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT })
      )
    ).toBe('deja_dans_cet_etat');
    expect(deja.ecrit('update')).toEqual([]);
    const u = univers([ligne(CIBLE, 'lecteur')]);
    await desactiver(u.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT });
    expect(u.ecrit('update')).toEqual([
      { where: { id: CIBLE }, data: { desactiveAt: MAINTENANT } },
    ]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([chargeDu('desactiver')]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — réactiver : actif refusé ; un lecteur réactivé ne prévient personne', async () => {
    const actif = univers([ligne(CIBLE, 'lecteur')]);
    expect(
      await motif(
        reactiver(actif.client, {
          acteur: ADMIN,
          cibleId: CIBLE,
          maintenant: MAINTENANT,
          cles: CLES,
        })
      )
    ).toBe('deja_dans_cet_etat');
    const u = univers([
      ligne(CIBLE, 'lecteur', { desactiveAt: MAINTENANT }),
      ligne(ADMIN.id, 'admin'),
    ]);
    const r = await reactiver(u.client, {
      acteur: ADMIN,
      cibleId: CIBLE,
      maintenant: MAINTENANT,
      cles: CLES,
    });
    expect(r).toEqual({ courriels: [] });
    expect(u.ecrit('update')).toEqual([{ where: { id: CIBLE }, data: { desactiveAt: null } }]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([chargeDu('reactiver')]);
  });

  it('REQ-SEC-023 : TÉMOIN — réactiver un ADMINISTRATEUR : admin_reactive à chaque admin actif, le texte exact, sans adresse vide', async () => {
    const u = univers([
      ligne(CIBLE, 'admin', {
        desactiveAt: MAINTENANT,
        nom: 'Camille Reactive',
        email: 're@exemple.test',
      }),
      ligne(ADMIN.id, 'admin', { nom: null, email: 'auteur@exemple.test' }),
      ligne('0190f0f0-0000-7000-8000-0000000000a2', 'admin', { email: 'autre@exemple.test' }),
      // un admin sans adresse lisible ne reçoit rien ; un admin désactivé non plus
      ligne('0190f0f0-0000-7000-8000-0000000000a3', 'admin', { email: null }),
      ligne('0190f0f0-0000-7000-8000-0000000000a4', 'admin', { desactiveAt: MAINTENANT }),
    ]);
    // Le faux client ne réactive pas : la cible est lue désactivée, comme avant l'écriture.
    const { courriels } = await reactiver(u.client, {
      acteur: ADMIN,
      cibleId: CIBLE,
      maintenant: MAINTENANT,
      cles: CLES,
    });
    expect(courriels.map((c) => c.a).sort()).toEqual(['auteur@exemple.test', 'autre@exemple.test']);
    for (const c of courriels) {
      expect(c.gabarit).toBe('admin_reactive');
      expect(c.sujet).toBe(C.adminReactive.sujet);
      expect(c.corps).toBe(
        C.adminReactive.corps({
          identiteReactive: 'Camille Reactive (re@exemple.test)',
          identiteAuteur: 'auteur@exemple.test',
          dateHeure: '4 octobre 2026 à 10:15',
        })
      );
    }
  });

  it('REQ-SEC-023 : TÉMOIN — révoquer les sessions monte la version d’un cran ; valider pose le validateur, l’acteur', async () => {
    const u = univers([ligne(CIBLE, 'admin', { valideAt: null })]);
    await revoquerLesSessions(u.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT });
    await validerLAdministrateur(u.client, {
      acteur: ADMIN,
      cibleId: CIBLE,
      maintenant: MAINTENANT,
    });
    expect(u.ecrit('update')).toEqual([
      { where: { id: CIBLE }, data: { sessionVersion: { increment: 1 } } },
      { where: { id: CIBLE }, data: { valideParId: ADMIN.id, valideAt: MAINTENANT } },
    ]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([
      chargeDu('revoquer_sessions'),
      chargeDu('valider'),
    ]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — relancer une invitation déjà activée est refusé ; non activée, invitee_at est reposé', async () => {
    const activee = univers([ligne(CIBLE, 'lecteur')], { relances: 0 });
    expect(
      await motif(
        relancer(activee.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT })
      )
    ).toBe('deja_active');
    expect(evenement()).not.toHaveBeenCalled();
    const u = univers([ligne(CIBLE, 'lecteur')], { relances: 1 });
    await relancer(u.client, { acteur: ADMIN, cibleId: CIBLE, maintenant: MAINTENANT });
    expect(u.ecrit('updateMany')).toEqual([
      { where: { id: CIBLE, activeeAt: null }, data: { inviteeAt: MAINTENANT } },
    ]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([chargeDu('relancer')]);
  });
});

describe('REQ-SEC-023 — changer un rôle', () => {
  it('REQ-SEC-023 : TÉMOIN — les refus de la règle sont nommés, sans écriture', async () => {
    const u = univers([ligne(CIBLE, 'lecteur'), ligne(ADMIN.id, 'admin')]);
    const changer = (acteur: ActeurDeLaConsole, cibleId: string, vers: Ligne['role']) =>
      changerLeRole(u.client, { acteur, cibleId, vers, maintenant: MAINTENANT, cles: CLES });
    expect(await motif(changer({ id: ADMIN.id, role: 'qualifieur' }, CIBLE, 'comptable'))).toBe(
      'droit_absent'
    );
    expect(await motif(changer(ADMIN, ADMIN.id, 'lecteur'))).toBe('auto_changement');
    expect(await motif(changer(ADMIN, CIBLE, 'lecteur'))).toBe('sans_changement');
    expect(await motif(changer(ADMIN, '0190f0f0-0000-7000-8000-0000000000ff', 'lecteur'))).toBe(
      'introuvable'
    );
    expect(u.ecrit('update')).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — vers un autre rôle : écrit, événement de→vers, aucun courriel ; vers admin : admin_cree à chaque admin actif', async () => {
    const u = univers([
      ligne(CIBLE, 'lecteur', { email: 'cible@exemple.test' }),
      ligne(ADMIN.id, 'admin'),
    ]);
    const r = await changerLeRole(u.client, {
      acteur: ADMIN,
      cibleId: CIBLE,
      vers: 'comptable',
      maintenant: MAINTENANT,
      cles: CLES,
    });
    expect(r).toEqual({ courriels: [] });
    expect(u.ecrit('update')).toEqual([{ where: { id: CIBLE }, data: { role: 'comptable' } }]);
    expect(evenement().mock.calls.map((c) => c[1])).toEqual([
      chargeDu('changer_role', 'lecteur', 'comptable'),
    ]);
    const admin = await changerLeRole(u.client, {
      acteur: ADMIN,
      cibleId: CIBLE,
      vers: 'admin',
      maintenant: MAINTENANT,
      cles: CLES,
    });
    expect(admin.courriels.map((c) => [c.a, c.gabarit])).toEqual([
      ['a1@exemple.test', 'admin_cree'],
    ]);
  });
});

describe('REQ-SEC-023 — inviter', () => {
  const inviterUn = (u: ReturnType<typeof univers>, role: Ligne['role'], acteur = ADMIN) =>
    inviter(u.client, {
      acteur,
      email: 'nouveau@exemple.test',
      role,
      cles: CLES,
      maintenant: MAINTENANT,
      adresseConnexion: 'https://partners.exemple.test/console/connexion',
    });

  it('REQ-SEC-023 : TÉMOIN — un rôle autre qu’admin n’invite pas, sans transaction', async () => {
    const u = univers([]);
    expect(await motif(inviterUn(u, 'lecteur', { id: ADMIN.id, role: 'lecteur' }))).toBe(
      'droit_absent'
    );
    expect(u.appels).toEqual([]);
  });

  it('REQ-SEC-023 : TÉMOIN — la ligne naît INVITÉE, non activée, à l’adresse chiffrée ; l’événement dit le rôle ; l’invitation seule part pour un lecteur', async () => {
    const u = univers([ligne(ADMIN.id, 'admin')]);
    const { id, courriels } = await inviterUn(u, 'lecteur');
    const [creation] = u.ecrit('create') as [{ data: Record<string, unknown> }];
    expect(creation.data).toMatchObject({
      id,
      role: 'lecteur',
      creeAt: MAINTENANT,
      inviteeAt: MAINTENANT,
      activeeAt: null,
    });
    expect(creation.data.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(creation.data.emailChiffre).toBeInstanceOf(Uint8Array);
    expect(evenement().mock.calls[0]![1]).toEqual({
      ...chargeDu('inviter', null, 'lecteur'),
      agregatId: id,
    });
    expect(courriels).toEqual([
      courrielDInvitation({
        a: 'nouveau@exemple.test',
        role: 'lecteur',
        adresseConnexion: 'https://partners.exemple.test/console/connexion',
        inviteeAt: MAINTENANT,
      }),
    ]);
  });

  it('REQ-SEC-023 : TÉMOIN À DEUX FACES — inviter un admin : la phrase des quatre yeux SEULEMENT si un autre admin validé existe', async () => {
    const seul = univers([ligne(ADMIN.id, 'admin', { email: 'auteur@exemple.test' })]);
    const a = await inviterUn(seul, 'admin');
    const creeSeul = a.courriels.filter((c) => c.gabarit === 'admin_cree');
    // L'auteur et la personne créée, tous deux administrateurs actifs.
    expect(creeSeul.map((c) => c.a).sort()).toEqual([
      'auteur@exemple.test',
      'nouveau@exemple.test',
    ]);
    expect(creeSeul[0]!.sujet).toBe(C.adminCree.sujet);
    expect(creeSeul[0]!.corps).not.toContain("tant qu'un autre administrateur");
    const deux = univers([
      ligne(ADMIN.id, 'admin', { email: 'auteur@exemple.test' }),
      ligne('0190f0f0-0000-7000-8000-0000000000a2', 'admin', { email: 'autre@exemple.test' }),
      ligne('0190f0f0-0000-7000-8000-0000000000a5', 'admin', {
        email: 'attente@exemple.test',
        valideAt: null,
      }),
    ]);
    const b = await inviterUn(deux, 'admin');
    const cree = b.courriels.filter((c) => c.gabarit === 'admin_cree');
    expect(cree.map((c) => c.a).sort()).toEqual([
      'attente@exemple.test',
      'auteur@exemple.test',
      'autre@exemple.test',
      'nouveau@exemple.test',
    ]);
    expect(cree[0]!.corps).toContain("tant qu'un autre administrateur");
    // Un second admin EN ATTENTE ne compte pas : seul, l'auteur ne fait pas « quatre yeux ».
    const attente = univers([
      ligne(ADMIN.id, 'admin', { email: 'auteur@exemple.test' }),
      ligne('0190f0f0-0000-7000-8000-0000000000a5', 'admin', { valideAt: null }),
    ]);
    const c = await inviterUn(attente, 'admin');
    expect(c.courriels.find((x) => x.gabarit === 'admin_cree')!.corps).not.toContain(
      "tant qu'un autre administrateur"
    );
  });
});

describe('REQ-SEC-023 — les courriels et leurs dates, à l’heure de Paris', () => {
  it('REQ-SEC-023 : l’identité vaut « Nom (adresse) », ou l’adresse seule', () => {
    expect(identite('Camille', 'c@exemple.test')).toBe('Camille (c@exemple.test)');
    expect(identite(null, 'c@exemple.test')).toBe('c@exemple.test');
    expect(identite('', 'c@exemple.test')).toBe('c@exemple.test');
  });

  it('REQ-SEC-023 : l’invitation dit le rôle, l’adresse de connexion SANS jeton, et l’échéance de la SSOT', () => {
    const c = courrielDInvitation({
      a: 'x@exemple.test',
      role: 'qualifieur',
      adresseConnexion: 'https://p.exemple.test/console/connexion',
      inviteeAt: MAINTENANT,
    });
    const echeance = new Date(MAINTENANT.getTime() + DUREES_AUTH.invitationConsoleMs.valeur);
    expect(c).toEqual({
      a: 'x@exemple.test',
      sujet: C.invitation.sujet,
      corps: C.invitation.corps({
        libelleRole: 'qualifieur',
        adresseConnexion: 'https://p.exemple.test/console/connexion',
        dateExpiration: dateEtHeureCompletesDeParis(echeance),
        adressePolitique: 'https://p.exemple.test/console/vos-donnees',
      }),
      gabarit: 'invitation_console',
    });
    // L'information individuelle préalable (art. L.1222-4) : la phrase de la juriste, mot pour mot.
    expect(c.corps).toContain(
      'La façon dont Axion-IA traite vos données de connexion, dont le journal de vos accès, est décrite dans https://p.exemple.test/console/vos-donnees.'
    );
  });

  it('REQ-SEC-023 : TÉMOIN — les douze mois, l’heure d’été et d’hiver, à deux chiffres', () => {
    const mois = [
      'janvier',
      'février',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'août',
      'septembre',
      'octobre',
      'novembre',
      'décembre',
    ];
    mois.forEach((m, i) => {
      // le 15 de chaque mois, 09:05 UTC
      const d = new Date(Date.UTC(2026, i, 15, 9, 5));
      expect(jourDeParis(d)).toBe(`15 ${m}`);
    });
    // hiver : UTC+1 ; été : UTC+2
    expect(jourEtHeureDeParis(new Date('2026-01-03T08:04:00.000Z'))).toBe('3 janvier, 09:04');
    expect(jourEtHeureDeParis(new Date('2026-07-03T08:04:00.000Z'))).toBe('3 juillet, 10:04');
    expect(dateEtHeureCompletesDeParis(new Date('2026-12-31T22:59:00.000Z'))).toBe(
      '31 décembre 2026 à 23:59'
    );
    expect(dateEtHeureCompletesDeParis(new Date('2026-12-31T23:00:00.000Z'))).toBe(
      '1 janvier 2027 à 00:00'
    );
  });
});
