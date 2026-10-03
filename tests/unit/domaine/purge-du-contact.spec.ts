// @req REQ-DM-043
// @req REQ-DM-031
// @req REQ-SEC-030
/**
 * La purge du contact d'une attribution — ce qui se juge sans base (REQ-DM-031, REQ-SEC-030,
 * HYP-RGPD-RETENTION).
 *
 * CE QU'IL PROUVE :
 *   1. LES DURÉES (test HYP) : 90 jours après la libération, 1 095 jours après le dernier contact
 *      d'une convertie ; un changement de l'une ou l'autre fait rougir ce test, et doit passer par
 *      une décision datée au registre ;
 *   2. LE SOUS-MODULE DE LA SSOT : chaque durée de `retention.ts` est dans `SEUILS`, à l'identique,
 *      et AUCUNE n'est définie aussi dans `ssot.ts` ;
 *   3. L'ÉCHÉANCE, statut par statut de la matrice : libérée (annulée comprise) → +90 j ; convertie → +1 095 j ; tout
 *      autre statut, dont tout occupant non converti → aucune purge ;
 *   4. L'ENTREPRISE INDIVIDUELLE, lue sur la nature juridique ;
 *   5. LES COLONNES effacées, exactement, et la tâche inscrite au registre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { EtatAttribution } from '@prisma/client';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { DUREES_DE_RETENTION } from '../../../src/domain/seuils/retention';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import {
  CHAMPS_DU_CONTACT,
  colonnesDuContact,
  ETATS_LIBERES,
  echeanceDePurge,
  coordonneesSEffacent,
  purgerLesContacts,
} from '../../../src/server/taches/purger-contacts';
import { effacementPii } from '../../../src/server/securite/pii';
import { TACHES } from '../../../src/server/taches/registre';
import { inscriptions } from '../../../src/server/taches/inscriptions';
import type { PrismaClient } from '@prisma/client';

// L'écrivain du journal est simulé : ce spec juge ce que la tâche lui DONNE, et sur quel client.
const journal = vi.hoisted(() => ({ ajouterEvenement: vi.fn() }));
vi.mock('../../../src/server/evenement/journal', () => journal);

const REFERENCE = new Date('2026-10-02T08:00:00.000Z');
const plus = (jours: number) => new Date(REFERENCE.getTime() + jours * MS_PAR_JOUR);

describe('REQ-SEC-030 — les durées de conservation du contact (HYP-RGPD-RETENTION)', () => {
  it('REQ-SEC-030 : TEST HYP — 90 jours après la libération, 1 095 après le dernier contact d’une convertie', () => {
    expect(SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur).toBe(90);
    expect(SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS.valeur).toBe(1095);
    for (const s of [
      SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS,
      SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS,
    ]) {
      expect(s.unite).toBe('jours');
      expect(s.source).toContain('HYP-RGPD-RETENTION');
    }
    for (const s of Object.values(DUREES_DE_RETENTION)) {
      expect(s.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('REQ-DM-043 : TEST HYP — le SIREN d’un dépôt refusé s’efface douze mois après le refus (HYP-A02-RETENTION)', () => {
    expect(SEUILS.DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS).toMatchObject({ valeur: 12, unite: 'mois' });
    expect(SEUILS.DEPOT_REFUSE_SIREN_PURGE_APRES_MOIS.source).toContain('HYP-A02-RETENTION');
  });

  it('REQ-SEC-030 : retention.ts est un sous-module de la SSOT — chaque durée dans SEUILS, aucune définie aux deux endroits', () => {
    const cles = Object.keys(DUREES_DE_RETENTION);
    expect(cles.length).toBeGreaterThan(0);
    const texteSsot = readFileSync('src/domain/seuils/ssot.ts', 'utf8');
    for (const cle of cles) {
      expect(SEUILS[cle as keyof typeof SEUILS]).toBe(
        DUREES_DE_RETENTION[cle as keyof typeof DUREES_DE_RETENTION]
      );
      expect(texteSsot).not.toMatch(new RegExp(`^\\s+${cle}\\s*:`, 'm'));
    }
  });
});

describe('REQ-DM-031 — l’échéance de la purge, statut par statut', () => {
  it('REQ-DM-031 : TÉMOIN — les états libérés sont annulee, invalidee, perdue, expiree et perimee (une annulée ne garde pas son contact)', () => {
    expect([...ETATS_LIBERES].sort()).toEqual([
      'annulee',
      'expiree',
      'invalidee',
      'perdue',
      'perimee',
    ]);
  });

  it.each(Object.values(EtatAttribution))(
    'REQ-DM-031 : %s — échéance lue dans la SSOT, ou aucune purge',
    (statut) => {
      const e = echeanceDePurge(statut, REFERENCE);
      if ((ETATS_LIBERES as readonly string[]).includes(statut)) {
        expect(e).toEqual(plus(SEUILS.CONTACT_PURGE_APRES_LIBERATION_JOURS.valeur));
      } else if (statut === 'convertie') {
        expect(e).toEqual(plus(SEUILS.CONTACT_PURGE_CONVERTIE_APRES_DERNIER_CONTACT_JOURS.valeur));
      } else {
        expect(e).toBeNull();
      }
    }
  );

  it('REQ-DM-031 : aucun occupant non converti n’a d’échéance', () => {
    for (const s of ETATS_OCCUPANTS.filter((e) => e !== 'convertie')) {
      expect(echeanceDePurge(s, REFERENCE)).toBeNull();
    }
  });
});

describe('REQ-DM-031 — ce que la purge efface', () => {
  it('REQ-DM-031 : les coordonnées du siège s’effacent, sauf pour une personne morale PROUVÉE (échec fermé)', () => {
    // Entrepreneur individuel : catégorie juridique INSEE de premier rang 1.
    expect(coordonneesSEffacent('1000')).toBe(true);
    // Une forme inconnue peut être une entreprise individuelle : elle est traitée comme telle.
    for (const inconnue of [null, '', ' ', '57', '57100', 'x710', '0000', '2110', '2900']) {
      expect(coordonneesSEffacent(inconnue)).toBe(true);
    }
    // Seule une personne morale prouvée garde ses coordonnées.
    for (const morale of ['5710', '9220', '7210', '3120']) {
      expect(coordonneesSEffacent(morale)).toBe(false);
    }
  });

  it('REQ-DM-031 : les colonnes du contact effacées, exactement, blocs et empreintes ensemble — lienInteretDeclare reste', () => {
    expect([...colonnesDuContact()].sort()).toEqual([
      'contexteChiffre',
      'emailChiffre',
      'emailHash',
      'fonctionContactChiffre',
      'lienInteretPrecisionChiffre',
      'nomContactChiffre',
      'phoneHash',
      'prenomContactChiffre',
      'telephoneChiffre',
    ]);
    expect(colonnesDuContact()).not.toContain('lienInteretDeclare');
    expect(colonnesDuContact()).not.toContain('id');
  });

  it('REQ-DM-031 : la purge est une tâche du registre, inscrite au lanceur', () => {
    expect(TACHES.contacts_purger).toEqual({ req: 'REQ-DM-031' });
    // Aucun appel n'est fait : on ne lit que la composition.
    const client: unknown = {};
    expect(typeof inscriptions(client as PrismaClient).contacts_purger).toBe('function');
  });

  it('REQ-DM-043 : la purge du SIREN des dépôts refusés est une tâche du registre, inscrite au lanceur', () => {
    expect(TACHES.siren_refuses_purger).toEqual({ req: 'REQ-DM-043' });
    const client: unknown = {};
    expect(typeof inscriptions(client as PrismaClient).siren_refuses_purger).toBe('function');
  });
});

/**
 * LA TÂCHE, sur un client SIMULÉ (exigence de la mutation : le témoin en base n'est pas joué par
 * Stryker). Le client enregistre chaque appel, dans l'ordre, et le client de transaction est un
 * objet distinct : on juge que l'effacement et l'événement passent par LE MÊME.
 */
type Ligne = { id: string; natureJuridique: string | null };
function clientSimule(lots: Ligne[][], comptes: Record<string, number> = {}) {
  const ordre: string[] = [];
  const clients: unknown[] = [];
  const lectures: unknown[] = [];
  const effacements: { where: unknown; data: Record<string, unknown> }[] = [];
  const revocations: unknown[] = [];
  const tx = {
    attribution: {
      updateMany: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        ordre.push(`effacer:${args.where.id}`);
        effacements.push(args);
        return { count: comptes[args.where.id] ?? 1 };
      }),
    },
    // DM-40 : les jetons de la demande de confirmation, et les révisions du contact.
    demandeConfirmation: {
      updateMany: vi.fn(async (args: { where: { attributionId: string } }) => {
        ordre.push(`revoquer:${args.where.attributionId}`);
        revocations.push(args);
        return { count: 1 };
      }),
    },
    revisionDemandeConfirmation: {
      updateMany: vi.fn(async (args: { where: { demande: { attributionId: string } } }) => {
        ordre.push(`purger-revisions:${args.where.demande.attributionId}`);
        revocations.push(args);
        return { count: 1 };
      }),
    },
  };
  const client = {
    attribution: {
      findMany: vi.fn(async (args: unknown) => {
        lectures.push(args);
        ordre.push('lire');
        return lots.shift() ?? [];
      }),
    },
    $transaction: vi.fn(async (corps: (t: typeof tx) => Promise<unknown>) => corps(tx)),
  };
  journal.ajouterEvenement.mockImplementation(async (t: unknown, e: { agregatId: string }) => {
    clients.push(t);
    ordre.push(`journal:${e.agregatId}`);
    return { id: '1', selfHash: 'h' };
  });
  return {
    client: client as unknown as PrismaClient,
    client_: client,
    tx,
    ordre,
    lectures,
    effacements,
    revocations,
    clients,
  };
}

const lignes = (n: number, prefixe = 'a'): Ligne[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefixe}${i}`, natureJuridique: '5710' }));

describe('REQ-DM-031 — la tâche de purge, sur un client simulé', () => {
  beforeEach(() => {
    journal.ajouterEvenement.mockReset();
  });

  it('REQ-DM-031 : la SÉLECTION — échéance passée, pas encore purgée, occupants non convertis exclus, par lot de 100 dans l’ordre des échéances', async () => {
    const s = clientSimule([]);
    expect(await purgerLesContacts(s.client, REFERENCE)).toEqual({ purgees: 0 });
    expect(s.lectures).toEqual([
      {
        where: {
          purgeContactAt: { lte: REFERENCE },
          contactPurgeAt: null,
          statut: { notIn: ETATS_OCCUPANTS.filter((e) => e !== 'convertie') },
        },
        select: { id: true, natureJuridique: true },
        orderBy: [{ purgeContactAt: 'asc' }, { id: 'asc' }],
        take: 100,
      },
    ]);
    expect(s.client_.$transaction).not.toHaveBeenCalled();
    expect(journal.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-DM-031 : TÉMOIN — l’EFFACEMENT exact : le contact par effacementPii, la date de purge, et le siège d’une forme non prouvée', async () => {
    const s = clientSimule([
      [
        { id: 'ei', natureJuridique: '1000' },
        { id: 'pm', natureJuridique: '5710' },
      ],
    ]);
    expect(await purgerLesContacts(s.client, REFERENCE)).toEqual({ purgees: 2 });
    const contact = effacementPii(CHAMPS_DU_CONTACT);
    expect(s.effacements).toEqual([
      {
        where: { id: 'ei', contactPurgeAt: null },
        data: {
          ...contact,
          contactPurgeAt: REFERENCE,
          latitudeMicrodeg: null,
          longitudeMicrodeg: null,
        },
      },
      {
        where: { id: 'pm', contactPurgeAt: null },
        data: { ...contact, contactPurgeAt: REFERENCE },
      },
    ]);
  });

  it('REQ-DM-031 : TÉMOIN — la purge révoque les jetons de la demande et purge les révisions, à la valeur près', async () => {
    const s = clientSimule([[{ id: 'x', natureJuridique: null }]]);
    await purgerLesContacts(s.client, REFERENCE);
    expect(s.revocations).toStrictEqual([
      {
        where: { attributionId: 'x', jetonOuiHash: { not: null } },
        data: { jetonOuiHash: null, jetonNonHash: null, jetonsRevoquesAt: REFERENCE },
      },
      {
        where: { demande: { attributionId: 'x' }, purgeeAt: null },
        data: {
          nomContactChiffre: null,
          prenomContactChiffre: null,
          emailChiffre: null,
          emailHash: null,
          telephoneChiffre: null,
          phoneHash: null,
          fonctionContactChiffre: null,
          contexteChiffre: null,
          purgeeAt: REFERENCE,
        },
      },
    ]);
  });

  it('REQ-DM-031 : TÉMOIN — l’ÉVÉNEMENT, sur le client de la transaction, APRÈS l’effacement, une fois par ligne', async () => {
    const s = clientSimule([[{ id: 'x', natureJuridique: null }]]);
    await purgerLesContacts(s.client, REFERENCE);
    expect(s.ordre).toEqual(['lire', 'effacer:x', 'revoquer:x', 'purger-revisions:x', 'journal:x']);
    expect(s.clients).toEqual([s.tx]);
    expect(s.clients[0]).toBe(s.tx);
    expect(journal.ajouterEvenement).toHaveBeenCalledTimes(1);
    expect(journal.ajouterEvenement).toHaveBeenCalledWith(s.tx, {
      type: 'attribution_contact_purge',
      agregat: 'attribution',
      agregatId: 'x',
      survenuAt: REFERENCE,
      charge: { purgeAt: REFERENCE.toISOString(), acteur: { par: 'systeme' } },
    });
  });

  it('REQ-DM-031 : TÉMOIN — une ligne déjà purgée entre la lecture et l’écriture (compte 0) : ni événement, ni compte', async () => {
    const s = clientSimule([[...lignes(2)]], { a0: 0 });
    expect(await purgerLesContacts(s.client, REFERENCE)).toEqual({ purgees: 1 });
    // La ligne à compte 0 n'est ni révoquée ni journalisée : seule a1 l'est.
    expect(s.ordre).toEqual([
      'lire',
      'effacer:a0',
      'effacer:a1',
      'revoquer:a1',
      'purger-revisions:a1',
      'journal:a1',
    ]);
  });

  it('REQ-DM-031 : TÉMOIN — le DISJONCTEUR des lots : un lot plein relit, un lot partiel s’arrête', async () => {
    const plein = clientSimule([lignes(100), lignes(1, 'b')]);
    expect(await purgerLesContacts(plein.client, REFERENCE)).toEqual({ purgees: 101 });
    expect(plein.client_.attribution.findMany).toHaveBeenCalledTimes(2);

    const partiel = clientSimule([lignes(99), lignes(1, 'b')]);
    expect(await purgerLesContacts(partiel.client, REFERENCE)).toEqual({ purgees: 99 });
    expect(partiel.client_.attribution.findMany).toHaveBeenCalledTimes(1);

    const exact = clientSimule([lignes(100)]);
    expect(await purgerLesContacts(exact.client, REFERENCE)).toEqual({ purgees: 100 });
    expect(exact.client_.attribution.findMany).toHaveBeenCalledTimes(2);
  });
});
