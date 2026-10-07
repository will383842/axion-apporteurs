// @req REQ-SEC-003
// @req REQ-JUR-069
/**
 * `revocation-acces-apporteur.spec.ts` — SEC-71, la révocation de l'accès d'un apporteur par la console
 * (contrat v2, art. 3.8), EN PROCESSUS, sur un faux client : le motif fermé jugé avant toute écriture,
 * le droit relu en base, le statut verrouillé, et dans UNE transaction la version de session
 * incrémentée, les appareils oubliés, les jetons de dépôt et les liens non consommés révoqués,
 * l'événement journalisé et le renouvellement mis en file. Un résilié est refusé sans rien écrire
 * (juriste, #474, 6034493150). Aucune écriture ne touche une attribution ni une commission. La base
 * réelle est jugée par `tests/integration/revocation-acces-apporteur.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ErreurRevocationAcces,
  revoquerLAccesDUnApporteur,
  type ActeurDeLaRevocation,
} from '../../../src/server/console/acces-apporteur';
import { ajouterEvenement } from '../../../src/server/evenement/journal';
import type { StatutCourriel } from '@prisma/client';
import type { DemandeDEnvoi } from '../../../src/server/integrations/zeptomail/emetteur';
import {
  avisDuRenouvellement,
  renouvelerLesAcces,
  type PortsDuRenouvellement,
} from '../../../src/server/taches/renouveler-acces';
import { CORPS_DU_RENOUVELLEMENT } from '../../../src/content/micro-copy/courriels/notifications';

/** Un marqueur dans le corps du lien : il ne doit apparaître dans aucune sortie capturée. */
const MARQUEUR_DU_JETON = 'jeton-temoin-sec71';

vi.mock('../../../src/server/evenement/journal', () => ({ ajouterEvenement: vi.fn() }));

const MAINTENANT = new Date('2028-06-01T12:00:00.000Z');
const VALIDE = new Date('2026-01-01T00:00:00.000Z');
const ADMIN: ActeurDeLaRevocation = { id: '0190f0f0-0000-7000-8000-00000000000a', role: 'admin' };
const APP = '0190f0f0-0000-7000-8000-0000000000a1';

type Lu = { role: string; desactiveAt: Date | null; valideAt: Date | null } | null;

/** Un faux client : l'acteur relu, le statut verrouillé de l'apporteur, et chaque écriture, dans l'ordre. */
function univers(o: { acteur?: Lu; statut?: string | null } = {}) {
  const appels: { quoi: string; args: unknown }[] = [];
  const acteurLu: Lu =
    o.acteur === undefined ? { role: 'admin', desactiveAt: null, valideAt: VALIDE } : o.acteur;
  const statut = o.statut === undefined ? 'signe' : o.statut;
  const note =
    (quoi: string, rendu: unknown = { count: 1 }) =>
    async (args: unknown) => {
      appels.push({ quoi, args });
      return rendu;
    };
  const tx = {
    utilisateurConsole: {
      findUnique: note('utilisateurConsole.findUnique', acteurLu),
    },
    $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push({ quoi: '$queryRaw', args: { sql: gabarit.join('?'), valeurs } });
      return statut === null ? [] : [{ statut }];
    },
    apporteur: { update: note('apporteur.update') },
    appareilConnu: { deleteMany: note('appareilConnu.deleteMany', { count: 2 }) },
    jetonDepot: { updateMany: note('jetonDepot.updateMany') },
    lienMagique: { updateMany: note('lienMagique.updateMany', { count: 3 }) },
    notificationEspace: { create: note('notificationEspace.create', { id: 'n1' }) },
  };
  const client = {
    $transaction: async (f: (t: typeof tx) => Promise<unknown>) => {
      appels.push({ quoi: '$transaction', args: null });
      return f(tx);
    },
  } as unknown as PrismaClient;
  return { client, appels };
}

const revoquer = (client: PrismaClient, motif: string = 'signalement_apporteur') =>
  revoquerLAccesDUnApporteur(client, {
    acteur: ADMIN,
    apporteurId: APP,
    motif: motif as 'signalement_apporteur',
    maintenant: MAINTENANT,
  });

const refus = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e).toBeInstanceOf(ErreurRevocationAcces);
  return (e as ErreurRevocationAcces).motif;
};

beforeEach(() => {
  vi.mocked(ajouterEvenement).mockReset();
  vi.mocked(ajouterEvenement).mockResolvedValue({ id: '42', selfHash: 'h' });
});

describe('REQ-JUR-069 — la révocation de l’accès d’un apporteur : une transaction, rien d’autre', () => {
  it('REQ-SEC-003 : TÉMOIN — sessions, appareils, jetons et liens révoqués dans UNE transaction, puis le journal et la file', async () => {
    const { client, appels } = univers();
    expect(await revoquer(client)).toEqual({
      appareilsOublies: 2,
      liensAnnules: 3,
      jetonsRevoques: 1,
    });
    expect(appels.map((a) => a.quoi)).toEqual([
      '$transaction',
      'utilisateurConsole.findUnique',
      '$queryRaw',
      'apporteur.update',
      'appareilConnu.deleteMany',
      'jetonDepot.updateMany',
      'lienMagique.updateMany',
      'notificationEspace.create',
    ]);
    const args = (quoi: string) => appels.find((a) => a.quoi === quoi)!.args;
    expect(args('$queryRaw')).toMatchObject({ valeurs: [APP] });
    expect((args('$queryRaw') as { sql: string }).sql).toContain('FOR UPDATE');
    expect(args('apporteur.update')).toEqual({
      where: { id: APP },
      data: { sessionVersion: { increment: 1 } },
    });
    expect(args('appareilConnu.deleteMany')).toEqual({ where: { apporteurId: APP } });
    expect(args('jetonDepot.updateMany')).toEqual({
      where: { apporteurId: APP, revoqueAt: null },
      data: { revoqueAt: MAINTENANT },
    });
    expect(args('lienMagique.updateMany')).toEqual({
      where: { apporteurId: APP, consommeAt: null, annuleAt: null },
      data: { annuleAt: MAINTENANT },
    });
    expect(args('notificationEspace.create')).toEqual({
      data: { apporteurId: APP, cle: 'acces_renouvele', evenementId: 42n },
    });
  });

  it('REQ-JUR-069 : TÉMOIN — l’événement porte le motif fermé et l’acteur de la console, l’instant du GESTE, et rien d’autre', async () => {
    const { client } = univers();
    await revoquer(client, 'securite');
    expect(ajouterEvenement).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ajouterEvenement).mock.calls[0]![1]).toEqual({
      type: 'apporteur_acces_revoque',
      agregat: 'apporteur',
      agregatId: APP,
      survenuAt: MAINTENANT,
      charge: { motif: 'securite', acteur: { par: 'utilisateur_console', id: ADMIN.id } },
    });
  });

  it('REQ-JUR-069 : TÉMOIN — un motif hors des deux est refusé AVANT toute transaction', async () => {
    for (const motif of ['', 'sanction', 'suspension', 'SECURITE']) {
      const { client, appels } = univers();
      expect(await refus(revoquer(client, motif))).toBe('motif_invalide');
      expect(appels).toEqual([]);
    }
  });

  it('REQ-JUR-069 : TÉMOIN — un résilié est refusé (contrat_termine) : rien n’est écrit, ni journal ni file', async () => {
    const { client, appels } = univers({ statut: 'resilie' });
    expect(await refus(revoquer(client))).toBe('contrat_termine');
    expect(appels.map((a) => a.quoi)).toEqual([
      '$transaction',
      'utilisateurConsole.findUnique',
      '$queryRaw',
    ]);
    expect(ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-JUR-069 : TÉMOIN — le geste s’applique à kyc_en_cours, pret_a_signer, signe (préavis compris) et suspendu', async () => {
    for (const statut of ['signe', 'suspendu', 'kyc_en_cours', 'pret_a_signer']) {
      const { client, appels } = univers({ statut });
      await revoquer(client);
      expect(appels.at(-1)!.quoi).toBe('notificationEspace.create');
    }
  });

  it.each(['candidat', 'retenu', 'vivier', 'refuse'])(
    'REQ-JUR-069 : TÉMOIN — %s n’a jamais eu d’accès : refusé, sans_acces, rien d’envoyé ni d’écrit',
    async (statut) => {
      const { client, appels } = univers({ statut });
      expect(await refus(revoquer(client))).toBe('sans_acces');
      expect(appels.map((a) => a.quoi)).toEqual([
        '$transaction',
        'utilisateurConsole.findUnique',
        '$queryRaw',
      ]);
      expect(ajouterEvenement).not.toHaveBeenCalled();
    }
  );

  it('REQ-JUR-069 : TÉMOIN — un apporteur inconnu est refusé sans rien écrire', async () => {
    const { client, appels } = univers({ statut: null });
    expect(await refus(revoquer(client))).toBe('apporteur_inconnu');
    expect(appels.map((a) => a.quoi)).not.toContain('apporteur.update');
  });

  it('REQ-JUR-069 : TÉMOIN — le droit est RELU en base : un admin désactivé, non validé, d’un autre rôle, ou inconnu est refusé', async () => {
    for (const acteur of [
      null,
      { role: 'admin', desactiveAt: VALIDE, valideAt: VALIDE },
      { role: 'admin', desactiveAt: null, valideAt: null },
      { role: 'conseiller', desactiveAt: null, valideAt: VALIDE },
    ]) {
      const { client, appels } = univers({ acteur });
      expect(await refus(revoquer(client))).toBe('droit_absent');
      expect(appels.map((a) => a.quoi)).toEqual(['$transaction', 'utilisateurConsole.findUnique']);
    }
  });

  it('REQ-JUR-069 : TÉMOIN — un acteur jugé hors de la matrice est refusé avant toute lecture', async () => {
    const { client, appels } = univers();
    const e = await revoquerLAccesDUnApporteur(client, {
      acteur: { id: ADMIN.id, role: 'conseiller' },
      apporteurId: APP,
      motif: 'securite',
      maintenant: MAINTENANT,
    }).then(
      () => null,
      (x: unknown) => x
    );
    expect((e as ErreurRevocationAcces).motif).toBe('droit_absent');
    expect(appels.map((a) => a.quoi)).toEqual(['$transaction']);
  });

  it('REQ-JUR-069 : TÉMOIN — aucune écriture ne touche une attribution, une commission, une autofacture ni le statut', async () => {
    const { client, appels } = univers();
    await revoquer(client);
    const ecrites = appels.map((a) => a.quoi.split('.')[0]);
    for (const interdit of ['attribution', 'commission', 'autofacture', 'anomalie', 'depot'])
      expect(ecrites).not.toContain(interdit);
    const maj = appels.find((a) => a.quoi === 'apporteur.update')!.args as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(maj.data)).toEqual(['sessionVersion']);
  });
});

/**
 * LE PASSAGE DU RENOUVELLEMENT (sécurité, #474, 6034536145 ; juriste, 6034554456) : le LIEN d'abord,
 * puis l'AVIS, et aucun avis si le lien n'est pas parti ; seul l'avis porte la notification ; une
 * notification caduque n'envoie rien.
 */
describe('REQ-JUR-069 — le renouvellement : le lien, puis l’avis, et jamais l’avis seul', () => {
  const N = { id: 'n-1', apporteurId: APP, evenementId: '42' };
  const PREPARES = {
    a: 'apporteur@exemple.test',
    lien: { sujet: 'Votre lien', corps: `url ${MARQUEUR_DU_JETON}` },
    avis: { sujet: 'Avis', corps: 'Corps de l’avis' },
  };
  function ports(o: { prepares?: typeof PREPARES | null; statuts?: StatutCourriel[] } = {}) {
    const envois: DemandeDEnvoi[] = [];
    const statuts = [...(o.statuts ?? ['envoye', 'envoye'])];
    const p: PortsDuRenouvellement = {
      lireLot: async () => [N],
      preparer: async () => (o.prepares === undefined ? PREPARES : o.prepares),
      envoyer: async (d) => {
        envois.push(d);
        return statuts.shift() ?? 'envoye';
      },
    };
    return { p, envois };
  }

  it('REQ-JUR-069 : TÉMOIN — l’avis part APRÈS le lien ; seul l’avis porte la notification', async () => {
    const { p, envois } = ports();
    expect(await renouvelerLesAcces(p)).toMatchObject({ lus: 1, renouveles: 1 });
    expect(envois.map((e) => e.gabarit)).toEqual(['lien_magique', 'acces_renouvele']);
    expect(envois[0]!.notificationEspaceId).toBeUndefined();
    expect(envois[1]!.notificationEspaceId).toBe('n-1');
    expect(envois.every((e) => e.a === PREPARES.a && e.apporteurId === APP)).toBe(true);
  });

  it.each(['echec', 'retenu_adresse_supprimee', 'retenu_dmarc_non_verifie'] as const)(
    'REQ-JUR-069 : TÉMOIN — un lien %s ne laisse partir AUCUN avis',
    async (statut) => {
      const { p, envois } = ports({ statuts: [statut] });
      expect(await renouvelerLesAcces(p)).toMatchObject({ liensNonPartis: 1, renouveles: 0 });
      expect(envois.map((e) => e.gabarit)).toEqual(['lien_magique']);
    }
  );

  it('REQ-JUR-069 : TÉMOIN — une notification caduque (supplantée, hors statut, motif illisible) n’envoie rien', async () => {
    const { p, envois } = ports({ prepares: null });
    expect(await renouvelerLesAcces(p)).toMatchObject({ lus: 1, caducs: 1 });
    expect(envois).toEqual([]);
  });

  it('REQ-JUR-069 : TÉMOIN — l’avis du motif, et AVANT la signature la phrase du dossier d’inscription, jamais celle des attributions', () => {
    for (const motif of ['signalement_apporteur', 'securite'] as const) {
      const apres = avisDuRenouvellement(motif, 'signe');
      expect(apres.titre).toBe("Votre accès à l'espace en ligne a été renouvelé");
      expect(apres.appel).toBe('Ouvrir mon espace');
      expect(apres.corps).toBe(CORPS_DU_RENOUVELLEMENT[motif]);
      expect(
        apres.corps.endsWith(
          'Les entreprises que vous avez déposées et vos commissions ne sont pas affectées.'
        )
      ).toBe(true);
      for (const statut of ['kyc_en_cours', 'pret_a_signer']) {
        const avant = avisDuRenouvellement(motif, statut);
        expect(avant.corps.endsWith("Votre dossier d'inscription n'est pas affecté.")).toBe(true);
        expect(avant.corps).not.toContain('Les entreprises que vous avez déposées');
        expect(avant.corps.slice(0, 40)).toBe(apres.corps.slice(0, 40));
      }
    }
    expect(avisDuRenouvellement('signalement_apporteur', 'signe').corps).toContain(
      'À la suite de votre signalement'
    );
    expect(avisDuRenouvellement('securite', 'suspendu').corps).toContain(
      'Pour un motif de sécurité, Axion-IA'
    );
  });
});
