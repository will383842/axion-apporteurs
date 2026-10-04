// @req REQ-SEC-022
// @req REQ-UX-002
// @req REQ-SEC-020
// @req REQ-SEC-032
// @req REQ-JUR-008
// @req REQ-CPL-008
// @req REQ-DM-009
/**
 * SEC-12 — la DÉCISION d'un dépôt d'apporteur, pure : des faits lus sous verrou, une issue.
 *
 * CE QU'IL PROUVE :
 *   1. L'ORDRE des contrôles suit le contrat : gel, puis art. 3.3 bis a (établissement cessé), b (hors
 *      périmètre), art. 3.3 (antériorité), 3.3 bis d (opposition), puis l'occupation et la file (c) ;
 *   2. LE MÊME REFUS QUEL QUE SOIT L'OCCUPANT : un apporteur ou la Société (prise en charge) — la
 *      décision ne reçoit pas le porteur de l'occupant, elle ne peut donc pas les distinguer ;
 *   3. LA FILE : rang 1 puis 2 derrière un occupant, `file_complete` au-delà ; jamais de file sans
 *      occupant ;
 *   4. LES TROIS CRITÈRES DE L'ART. 3.3 (cliente, devis émis, devis signé) rendent à l'apporteur des
 *      octets IDENTIQUES : le motif stocké les distingue, l'écran jamais ;
 *   5. LA TRANSACTION DE DÉPÔT, EN PROCESSUS, sur un client simulé : ce que `deposerDans` lit, dans
 *      quel ordre, et ce qu'elle écrit pour chaque issue ; `deposer` derrière le débit et le défi, la
 *      notification d'un refus après la transaction. La même transaction est jugée en base réelle
 *      (`tests/integration/concurrence.spec.ts`) ; ici, chaque branche est nommée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import {
  ISSUES_DE_REFUS,
  PLACES_EN_ATTENTE,
  deciderDuDepot,
  type FaitsDuDepot,
} from '../../../src/domain/depot/issue-depot';
import { issueRendue } from '../../../src/content/micro-copy/espace/issues-depot';

/** Un dépôt LIBRE : chaque champ écrit, aucun défaut (RM-11). Chaque test en change un. */
const LIBRE: FaitsDuDepot = {
  apporteurGele: false,
  etablissementCesse: false,
  anteriorite: 'aucune',
  oppositionDemarchage: false,
  occupee: false,
  enAttente: 0,
  verificationPrioritaire: false,
};

describe('REQ-UX-002 — un dépôt libre est enregistré, prioritaire s’il le faut', () => {
  it('REQ-UX-002 : libre → enregistree, provisoire, sans rang', () => {
    expect(deciderDuDepot(LIBRE)).toEqual({
      issue: 'enregistree',
      statut: 'provisoire',
      rangAttente: null,
    });
  });

  it('REQ-UX-002 : libre et en vérification prioritaire → prioritaire, provisoire', () => {
    expect(deciderDuDepot({ ...LIBRE, verificationPrioritaire: true })).toEqual({
      issue: 'prioritaire',
      statut: 'provisoire',
      rangAttente: null,
    });
  });
});

describe('REQ-SEC-022 — les refus de catégorie, dans l’ordre du contrat', () => {
  it.each([
    ['etablissementCesse', { etablissementCesse: true }, 'etablissement_cesse'],
    ['financeur', { anteriorite: 'financeur' }, 'entreprise_hors_perimetre'],
    ['client', { anteriorite: 'client' }, 'anteriorite_client'],
    ['devis', { anteriorite: 'devis' }, 'anteriorite_devis'],
    ['opposition', { oppositionDemarchage: true }, 'opposition_demarchage'],
  ] as const)('REQ-SEC-022 : %s → refus %s, rien n’est enregistré', (_quoi, faits, issue) => {
    expect(deciderDuDepot({ ...LIBRE, ...faits })).toEqual({
      issue,
      statut: null,
      rangAttente: null,
    });
  });

  it('REQ-SEC-022 : un apporteur gelé : `gele`, avant tout autre contrôle — rien n’est enregistré', () => {
    expect(
      deciderDuDepot({
        ...LIBRE,
        apporteurGele: true,
        etablissementCesse: true,
        anteriorite: 'client',
      })
    ).toEqual({ issue: 'gele', statut: null, rangAttente: null });
  });

  it('REQ-SEC-022 : l’ordre — cessé avant hors périmètre, hors périmètre avant antériorité, antériorité avant opposition, tout avant la file', () => {
    const tout: FaitsDuDepot = {
      ...LIBRE,
      etablissementCesse: true,
      anteriorite: 'financeur',
      oppositionDemarchage: true,
      occupee: true,
      enAttente: PLACES_EN_ATTENTE,
    };
    expect(deciderDuDepot(tout).issue).toBe('etablissement_cesse');
    expect(deciderDuDepot({ ...tout, etablissementCesse: false }).issue).toBe(
      'entreprise_hors_perimetre'
    );
    expect(deciderDuDepot({ ...tout, etablissementCesse: false, anteriorite: 'devis' }).issue).toBe(
      'anteriorite_devis'
    );
    expect(
      deciderDuDepot({ ...tout, etablissementCesse: false, anteriorite: 'aucune' }).issue
    ).toBe('opposition_demarchage');
    expect(
      deciderDuDepot({
        ...tout,
        etablissementCesse: false,
        anteriorite: 'aucune',
        oppositionDemarchage: false,
      }).issue
    ).toBe('file_complete');
  });

  it('REQ-SEC-022 : chaque issue de refus que la décision rend est un refus de catégorie', () => {
    for (const faits of [
      { etablissementCesse: true },
      { anteriorite: 'financeur' as const },
      { anteriorite: 'client' as const },
      { anteriorite: 'devis' as const },
      { oppositionDemarchage: true },
      { occupee: true, enAttente: PLACES_EN_ATTENTE },
    ]) {
      expect(ISSUES_DE_REFUS).toContain(deciderDuDepot({ ...LIBRE, ...faits }).issue);
    }
  });
});

describe('REQ-SEC-022 — l’occupation et la file (art. 3.3 bis c)', () => {
  it('REQ-SEC-022 : la file compte deux places', () => {
    expect(PLACES_EN_ATTENTE).toBe(2);
  });

  it('REQ-SEC-022 : occupée, file vide → en_attente rang 1 ; une en attente → rang 2 ; deux → file_complete', () => {
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 0 })).toEqual({
      issue: 'en_attente',
      statut: 'en_attente',
      rangAttente: 1,
    });
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 1 })).toEqual({
      issue: 'en_attente',
      statut: 'en_attente',
      rangAttente: 2,
    });
    expect(deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 2 })).toEqual({
      issue: 'file_complete',
      statut: null,
      rangAttente: null,
    });
  });

  it('REQ-SEC-022 : en vérification prioritaire, la file reste la file : en_attente', () => {
    expect(
      deciderDuDepot({ ...LIBRE, occupee: true, enAttente: 0, verificationPrioritaire: true }).issue
    ).toBe('en_attente');
  });

  it('REQ-SEC-022 : une file sans occupant ne retient personne : libre → enregistree', () => {
    expect(deciderDuDepot({ ...LIBRE, occupee: false, enAttente: 1 }).issue).toBe('enregistree');
  });

  it('REQ-SEC-022 : face ROUGE — un compte en attente hors des bornes est refusé, jamais deviné', () => {
    for (const enAttente of [-1, 3, 1.5, Number.NaN]) {
      expect(() => deciderDuDepot({ ...LIBRE, occupee: true, enAttente })).toThrow(RangeError);
    }
  });

  it('REQ-SEC-022 : LE MÊME REFUS QUEL QUE SOIT L’OCCUPANT — la décision ne connaît pas le porteur de l’occupant', () => {
    // Les faits ne portent qu'un booléen d'occupation : un apporteur et une prise en charge par la
    // Société ou ses préposés donnent les MÊMES faits, donc la même issue, octet pour octet.
    expect(Object.keys(LIBRE).sort()).toEqual([
      'anteriorite',
      'apporteurGele',
      'enAttente',
      'etablissementCesse',
      'occupee',
      'oppositionDemarchage',
      'verificationPrioritaire',
    ]);
  });
});

describe('REQ-UX-002 — l’art. 3.3 ne dit jamais lequel de ses critères joue', () => {
  it('REQ-UX-002 : cliente et devis (émis ou signé) rendent à l’apporteur des octets IDENTIQUES', () => {
    const client = issueRendue(deciderDuDepot({ ...LIBRE, anteriorite: 'client' }).issue);
    const devis = issueRendue(deciderDuDepot({ ...LIBRE, anteriorite: 'devis' }).issue);
    expect(JSON.stringify(client)).toBe(JSON.stringify(devis));
    expect(JSON.stringify(client)).not.toMatch(/client|devis|factur|sign/i);
  });
});

describe('REQ-SEC-020 — ni la zone ni le secteur ne refusent un dépôt', () => {
  it('REQ-SEC-020 : la décision ne reçoit ni zone ni secteur ; un dépôt libre est enregistré quels qu’ils soient', () => {
    expect(Object.keys(LIBRE).filter((k) => /zone|secteur/i.test(k))).toEqual([]);
    const horsZone: FaitsDuDepot & { zone: string; secteur: string } = {
      ...LIBRE,
      zone: 'hors zone',
      secteur: 'hors secteur',
    };
    expect(deciderDuDepot(horsZone)).toEqual(deciderDuDepot(LIBRE));
  });
});

// ── 5. la transaction de dépôt, en processus ─────────────────────────────────────────────────────

const doublures = vi.hoisted(() => ({
  anterioriteDe: vi.fn(),
  verrouillerLesSirens: vi.fn(),
  journaliserLaNaissance: vi.fn(),
  creerLaDemande: vi.fn(),
}));
vi.mock('../../../src/server/entreprise-connue/projection', () => ({
  anterioriteDe: doublures.anterioriteDe,
  verrouillerLesSirens: doublures.verrouillerLesSirens,
}));
vi.mock('../../../src/server/attribution/transitionner', () => ({
  journaliserLaNaissance: doublures.journaliserLaNaissance,
}));
vi.mock('../../../src/server/confirmation/demandes', () => ({
  creerLaDemande: doublures.creerLaDemande,
}));

import type { PrismaClient } from '@prisma/client';
import {
  DepotInterdit,
  ErreurSaisieDepot,
  champsRefuses,
  deposer,
  deposerDans,
  empreinteDeSession,
  parametresDuRefus,
  SessionDeDepotAbsente,
  versionDeLInformationDesTiers,
  type DemandeDeDepot,
  type PortsDuDepot,
} from '../../../src/server/depot/deposer';
import { CASE_INFORMATION_TIERS } from '../../../src/content/micro-copy/espace/information-tiers';
import {
  clesPii,
  empreinteAdresseReseau,
  empreinteRecherche,
} from '../../../src/server/securite/pii';
import { NOMS_DES_SECRETS } from '../../../src/lib/env';

const CLES = clesPii({
  NODE_ENV: 'test',
  ...Object.fromEntries(
    NOMS_DES_SECRETS.map((n) => [n, `temoin-sec-12-processus-${n.toLowerCase()}-`.padEnd(48, '0')])
  ),
  PII_ENCRYPTION_KEY: 'a'.repeat(64),
});
const APPORTEUR = '11111111-1111-4111-8111-111111111111';
const JETON = '22222222-2222-4222-8222-222222222222';
const SIREN = '552100554';
const MAINTENANT = new Date('2026-10-04T09:00:00.000Z');
const CAPTURE = new Date('2026-10-04T08:59:00.000Z');

type Appel = readonly [string, ...unknown[]];

/** Une demande COMPLÈTE : chaque champ écrit (RM-11) ; chaque test en change un. */
function demande(modif: Partial<DemandeDeDepot> = {}): DemandeDeDepot {
  return {
    apporteurId: APPORTEUR,
    canal: 'lien_prive',
    jetonDepotId: JETON,
    saisie: {
      siren: SIREN,
      siret: '55210055400013',
      dateContact: '2026-10-01',
      contact: {
        nom: '  Témoin ',
        prenom: ' Camille ',
        fonction: ' Gérante ',
        email: 'camille.temoin@gmail.com',
        telephone: '06 12 34 56 78',
      },
      contexte: 'Rencontrée au salon',
      informationTiersCochee: true,
      lienInteretDeclare: true,
    },
    fiche: { raisonSociale: 'Entreprise Témoin SAS', etatAdministratif: 'actif' },
    adresseReseau: '203.0.113.7',
    session: null,
    reponseCaptcha: null,
    agentUtilisateur: 'Mozilla/5.0 (témoin)',
    clientCapturedAt: CAPTURE,
    ...modif,
  };
}

/** Un client de transaction simulé : il rend les lignes réglées, et note chaque appel, dans l'ordre. */
function transaction(regles: {
  statut?: string | null;
  occupation?: { occupee: boolean; en_attente: number };
  grille?: { id: string } | null;
}) {
  const appels: Appel[] = [];
  const tx = {
    $executeRaw: (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push(['$executeRaw', gabarit.join('?'), ...valeurs]);
      return Promise.resolve(1);
    },
    $queryRaw: (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      appels.push(['$queryRaw', gabarit.join('?'), ...valeurs]);
      const statut = regles.statut === undefined ? 'signe' : regles.statut;
      return Promise.resolve(statut === null ? [] : [{ statut }]);
    },
    depotRefuse: {
      create: (a: unknown) => {
        appels.push(['depotRefuse.create', a]);
        return Promise.resolve({});
      },
    },
    grilleCommission: {
      findFirst: (a: unknown) => {
        appels.push(['grilleCommission.findFirst', a]);
        return Promise.resolve(regles.grille === undefined ? { id: 'grille-1' } : regles.grille);
      },
    },
    attribution: {
      count: (a: { where: { statut: unknown } }) => {
        appels.push(['attribution.count', a]);
        const o = regles.occupation ?? { occupee: false, en_attente: 0 };
        return Promise.resolve(a.where.statut === 'en_attente' ? o.en_attente : o.occupee ? 1 : 0);
      },
      create: (a: unknown) => {
        appels.push(['attribution.create', a]);
        return Promise.resolve({});
      },
    },
  };
  return { tx: tx as never, appels };
}

function ports(modif: Partial<PortsDuDepot> = {}): PortsDuDepot & { oppositions: unknown[][] } {
  const oppositions: unknown[][] = [];
  return {
    cles: CLES,
    secretConfirmation: 's'.repeat(64),
    maintenant: () => MAINTENANT,
    oppositionDemarchage: async (...a: unknown[]) => {
      oppositions.push(a);
      return false;
    },
    adresseDe: async (id: string) => `adresse-de-${id}`,
    notifier: async () => undefined,
    debit: async () => ({ autorise: true, repriseAt: null }),
    captcha: async () => 'non_requis' as const,
    ...modif,
    oppositions,
  };
}

const noms = (appels: readonly Appel[]) => appels.map((a) => a[0]);
const ecrit = (appels: readonly Appel[], nom: string) =>
  appels.find((a) => a[0] === nom)?.[1] as { data: Record<string, unknown> } | undefined;

beforeEach(() => {
  doublures.anterioriteDe.mockReset().mockResolvedValue({ connue: false });
  doublures.verrouillerLesSirens.mockReset().mockResolvedValue(undefined);
  doublures.journaliserLaNaissance.mockReset().mockResolvedValue('provisoire');
  doublures.creerLaDemande.mockReset().mockResolvedValue('demande-1');
});

describe('REQ-JUR-008 — la saisie est jugée au serveur, champ par champ', () => {
  it('REQ-JUR-008 : une saisie complète n’a aucun champ refusé', () => {
    expect(champsRefuses(demande().saisie, CLES)).toEqual([]);
  });

  it('REQ-JUR-008 : chaque champ en cause est nommé, dans l’ordre du formulaire', () => {
    const s = demande().saisie;
    expect(
      champsRefuses(
        {
          ...s,
          contact: {
            nom: ' ',
            prenom: '',
            fonction: '\t',
            email: 'pas-une-adresse',
            telephone: 'abc',
          },
          informationTiersCochee: false,
        },
        CLES
      )
    ).toEqual(['nom', 'prenom', 'fonction', 'email', 'telephone', 'informationTiers']);
  });

  it('REQ-JUR-008 : refusée, la saisie lève `ErreurSaisieDepot` nommée, AVANT toute lecture', async () => {
    const { tx, appels } = transaction({});
    const d = demande();
    const e = await deposerDans(
      tx,
      { ...d, saisie: { ...d.saisie, informationTiersCochee: false } },
      ports()
    ).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurSaisieDepot);
    expect((e as ErreurSaisieDepot).champs).toEqual(['informationTiers']);
    expect((e as Error).message).toBe('saisie_refusee : informationTiers');
    expect((e as Error).name).toBe('ErreurSaisieDepot');
    expect(appels).toEqual([]);
  });

  it('REQ-JUR-008 : la version de la case est dérivée du texte : les 32 premiers caractères du SHA-256', () => {
    expect(versionDeLInformationDesTiers()).toBe(
      createHash('sha256').update(CASE_INFORMATION_TIERS).digest('hex').slice(0, 32)
    );
  });
});

describe('REQ-SEC-032 — le statut relu sous verrou ouvre, ou non, le dépôt', () => {
  it('REQ-SEC-032 : verrou du porteur, puis du SIREN, puis le statut relu FOR UPDATE', async () => {
    const { tx, appels } = transaction({});
    await deposerDans(tx, demande(), ports());
    expect(appels.slice(0, 3)).toEqual([
      [
        '$executeRaw',
        'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
        `verrou-du-depot.porteur.${APPORTEUR}`,
      ],
      [
        '$executeRaw',
        'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
        `verrou-du-depot.siren.${SIREN}`,
      ],
      [
        '$queryRaw',
        `
    SELECT statut::text AS statut
      FROM apporteurs WHERE id = ?::uuid FOR UPDATE`,
        APPORTEUR,
      ],
    ]);
  });

  it.each([[null], ['resilie'], ['candidat']])(
    'REQ-SEC-032 : un apporteur absent ou au statut %s ne dépose pas : `DepotInterdit`, rien n’est écrit',
    async (statut) => {
      const { tx, appels } = transaction({ statut });
      const e = await deposerDans(tx, demande(), ports()).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(DepotInterdit);
      expect((e as Error).name).toBe('DepotInterdit');
      expect((e as Error).message).toMatch(/^depot_interdit : /);
      expect(noms(appels)).toEqual(['$executeRaw', '$executeRaw', '$queryRaw']);
    }
  );

  it('REQ-SEC-032 : suspendu, le dépôt est `gele` : ni refus tracé, ni déclaration', async () => {
    const { tx, appels } = transaction({ statut: 'suspendu' });
    expect(await deposerDans(tx, demande(), ports())).toEqual({
      issue: 'gele',
      attributionId: null,
    });
    expect(noms(appels)).not.toContain('depotRefuse.create');
    expect(noms(appels)).not.toContain('attribution.create');
  });
});

describe('REQ-SEC-022 — les faits lus sous verrou, et le refus tracé', () => {
  it('REQ-SEC-022 : le SIREN est aussi verrouillé dans le domaine de l’entreprise connue, AVANT la lecture de l’antériorité', async () => {
    const { tx } = transaction({});
    await deposerDans(tx, demande(), ports());
    expect(doublures.verrouillerLesSirens).toHaveBeenCalledTimes(1);
    expect(doublures.verrouillerLesSirens).toHaveBeenCalledWith(tx, [SIREN]);
    expect(doublures.verrouillerLesSirens.mock.invocationCallOrder[0]).toBeLessThan(
      doublures.anterioriteDe.mock.invocationCallOrder[0]!
    );
  });

  it('REQ-SEC-022 : l’antériorité est lue sur le SIREN, à l’heure du port ; l’opposition aussi', async () => {
    const { tx } = transaction({});
    const p = ports();
    await deposerDans(tx, demande(), p);
    expect(doublures.anterioriteDe).toHaveBeenCalledWith(tx, SIREN, MAINTENANT);
    expect(p.oppositions).toEqual([[tx, SIREN]]);
  });

  it('REQ-SEC-022 : l’occupation et la file se lisent sur le SIREN, sur les états qui occupent', async () => {
    const { tx, appels } = transaction({});
    await deposerDans(tx, demande(), ports());
    const comptes = appels.filter((a) => a[0] === 'attribution.count').map((a) => a[1]);
    expect(comptes).toEqual([
      { where: { siren: SIREN, statut: { in: [...ETATS_OCCUPANTS] } } },
      { where: { siren: SIREN, statut: 'en_attente' } },
    ]);
  });

  it.each([
    ['client', 'anteriorite_client'],
    ['devis', 'anteriorite_devis'],
    ['financeur', 'entreprise_hors_perimetre'],
  ] as const)(
    'REQ-SEC-022 : antériorité %s → refus %s, tracé (apporteur, SIREN, motif, canal, date), rien d’autre',
    async (origine, motif) => {
      doublures.anterioriteDe.mockResolvedValue({ connue: true, origine });
      const { tx, appels } = transaction({});
      expect(await deposerDans(tx, demande(), ports())).toEqual({
        issue: motif,
        attributionId: null,
      });
      expect(ecrit(appels, 'depotRefuse.create')).toEqual({
        data: {
          apporteurId: APPORTEUR,
          siren: SIREN,
          motif,
          canal: 'lien_prive',
          refuseAt: MAINTENANT,
        },
      });
      expect(noms(appels)).not.toContain('attribution.create');
      expect(doublures.journaliserLaNaissance).not.toHaveBeenCalled();
    }
  );

  it('REQ-SEC-022 : un établissement cessé, et une opposition, sont des refus tracés', async () => {
    const cesse = transaction({});
    expect(
      (
        await deposerDans(
          cesse.tx,
          demande({ fiche: { raisonSociale: 'X', etatAdministratif: 'cesse' } }),
          ports()
        )
      ).issue
    ).toBe('etablissement_cesse');
    const opposee = transaction({});
    expect(
      (await deposerDans(opposee.tx, demande(), ports({ oppositionDemarchage: async () => true })))
        .issue
    ).toBe('opposition_demarchage');
    expect(ecrit(opposee.appels, 'depotRefuse.create')?.data.motif).toBe('opposition_demarchage');
  });

  it('REQ-SEC-022 : occupée, file pleine → `file_complete`, tracé', async () => {
    const { tx, appels } = transaction({ occupation: { occupee: true, en_attente: 2 } });
    expect((await deposerDans(tx, demande(), ports())).issue).toBe('file_complete');
    expect(ecrit(appels, 'depotRefuse.create')?.data.motif).toBe('file_complete');
  });

  it('REQ-SEC-022 : aucune attribution occupante comptée, rien n’occupe : la déclaration est enregistrée', async () => {
    const { tx } = transaction({ occupation: { occupee: false, en_attente: 1 } });
    expect((await deposerDans(tx, demande(), ports())).issue).toBe('enregistree');
  });
});

describe('REQ-CPL-008 — la déclaration enregistrée, et sa demande de confirmation', () => {
  it('REQ-CPL-008 : libre → `provisoire` : chaque colonne écrite, la naissance journalisée, la demande créée', async () => {
    const { tx, appels } = transaction({});
    const r = await deposerDans(tx, demande(), ports());
    expect(r.issue).toBe('enregistree');
    expect(r.attributionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ecrit(appels, 'grilleCommission.findFirst')).toEqual({
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    const { data } = ecrit(appels, 'attribution.create')!;
    expect(data).toMatchObject({
      id: r.attributionId,
      apporteurId: APPORTEUR,
      statut: 'provisoire',
      rangAttente: null,
      siren: SIREN,
      siret: '55210055400013',
      grilleCommissionId: 'grille-1',
      canal: 'lien_prive',
      jetonDepotId: JETON,
      clientCapturedAt: CAPTURE,
      dateContact: new Date('2026-10-01T00:00:00.000Z'),
      informationTiersVersion: versionDeLInformationDesTiers(),
      verificationPrioritaire: false,
      entrepriseAVerifier: false,
      raisonSociale: 'Entreprise Témoin SAS',
      etatAdministratif: 'actif',
      lienInteretDeclare: true,
      ipHash: empreinteAdresseReseau('203.0.113.7', CLES),
      agentHash: empreinteRecherche('agent', 'Mozilla/5.0 (témoin)', CLES),
    });
    // Aucune coordonnée en clair : le contact n'entre que chiffré.
    expect(JSON.stringify(data)).not.toMatch(/Témoin"|Camille|Gérante|camille\.temoin|06 12 34/);
    expect(doublures.journaliserLaNaissance).toHaveBeenCalledWith(tx, {
      attributionId: r.attributionId,
      transition: 'deposee',
      acteur: { par: 'apporteur', id: APPORTEUR },
      maintenant: MAINTENANT,
    });
    expect(doublures.creerLaDemande).toHaveBeenCalledTimes(1);
    const [txDeLaDemande, d] = doublures.creerLaDemande.mock.calls[0]!;
    expect(txDeLaDemande).toBe(tx);
    expect(d).toMatchObject({
      attributionId: r.attributionId,
      acteur: { par: 'apporteur', id: APPORTEUR },
    });
    expect(d.jetonOuiHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.jetonNonHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.jetonOuiHash).not.toBe(d.jetonNonHash);
  });

  it('REQ-CPL-008 : occupée → `en_attente`, rang 1, naissance en file, AUCUNE demande', async () => {
    const { tx, appels } = transaction({ occupation: { occupee: true, en_attente: 0 } });
    const r = await deposerDans(tx, demande(), ports());
    expect(r.issue).toBe('en_attente');
    expect(ecrit(appels, 'attribution.create')?.data).toMatchObject({
      statut: 'en_attente',
      rangAttente: 1,
    });
    expect(doublures.journaliserLaNaissance.mock.calls[0]![1].transition).toBe('deposee_en_file');
    expect(doublures.creerLaDemande).not.toHaveBeenCalled();
  });

  it('REQ-CPL-008 : sans fiche lue, l’entreprise est à vérifier ; sans adresse ni navigateur, aucune empreinte', async () => {
    const { tx, appels } = transaction({});
    await deposerDans(
      tx,
      demande({
        fiche: { raisonSociale: null, etatAdministratif: null },
        adresseReseau: null,
        agentUtilisateur: null,
      }),
      ports()
    );
    expect(ecrit(appels, 'attribution.create')?.data).toMatchObject({
      entrepriseAVerifier: true,
      raisonSociale: null,
      etatAdministratif: null,
      ipHash: null,
      agentHash: null,
    });
  });

  it('REQ-CPL-008 : sans grille publiée, le dépôt échoue nommé, sans rien écrire', async () => {
    const { tx, appels } = transaction({ grille: null });
    await expect(deposerDans(tx, demande(), ports())).rejects.toThrow(/^grille_absente/);
    expect(noms(appels)).not.toContain('attribution.create');
  });
});

describe('REQ-DM-009 — `deposer` : le débit, le défi, la transaction, puis la notification du refus', () => {
  function prisma(regles: Parameters<typeof transaction>[0] = {}) {
    const t = transaction(regles);
    const options: unknown[] = [];
    const p = {
      $transaction: async (f: (tx: never) => Promise<unknown>, o: unknown) => {
        options.push(o);
        return f(t.tx);
      },
    } as unknown as PrismaClient;
    return { p, options, ...t };
  }

  it('REQ-DM-009 : le débit reçoit l’empreinte réseau et celle du jeton ; le défi, l’empreinte réseau et la réponse ; la transaction a 30 s', async () => {
    const recus: unknown[][] = [];
    const { p, options } = prisma();
    const r = await deposer(
      p,
      demande({ reponseCaptcha: 'reponse' }),
      ports({
        debit: async (...a) => {
          recus.push(['debit', ...a]);
          return { autorise: true, repriseAt: null };
        },
        captcha: async (...a) => {
          recus.push(['captcha', ...a]);
          return 'resolu';
        },
      })
    );
    const ip = empreinteAdresseReseau('203.0.113.7', CLES);
    const session = empreinteDeSession(demande(), CLES);
    expect(session).toMatch(/^[0-9a-f]{64}$/);
    expect(recus).toEqual([
      ['debit', { ip, session }],
      ['captcha', ip, 'reponse'],
    ]);
    expect(options).toEqual([{ timeout: 30_000 }]);
    expect(r).toMatchObject({ issue: 'enregistree' });
  });

  it('REQ-DM-009 : sans session ni jeton, le dépôt est refusé : ni débit, ni défi, ni transaction', async () => {
    const recus: unknown[][] = [];
    const { p, options } = prisma();
    await expect(
      deposer(
        p,
        demande({ canal: 'espace', jetonDepotId: null, session: null }),
        ports({
          debit: async () => {
            recus.push(['debit']);
            return { autorise: true, repriseAt: null };
          },
          captcha: async () => {
            recus.push(['captcha']);
            return 'non_requis';
          },
        })
      )
    ).rejects.toBeInstanceOf(SessionDeDepotAbsente);
    expect(recus).toEqual([]);
    expect(options).toEqual([]);
  });

  it('REQ-DM-009 : sans adresse réseau, la session de l’espace est seule comptée', async () => {
    const recus: unknown[][] = [];
    const { p } = prisma();
    const d = demande({
      adresseReseau: null,
      canal: 'espace',
      jetonDepotId: null,
      session: 'cookie-de-session',
    });
    await deposer(
      p,
      d,
      ports({
        debit: async (...a) => {
          recus.push(a);
          return { autorise: true, repriseAt: null };
        },
      })
    );
    expect(recus).toEqual([[{ ip: null, session: empreinteDeSession(d, CLES) }]]);
  });

  it('REQ-DM-009 : un refus de catégorie est notifié UNE fois, après la transaction, à l’adresse de l’apporteur', async () => {
    doublures.anterioriteDe.mockResolvedValue({ connue: true, origine: 'client' });
    const notes: unknown[][] = [];
    const { p } = prisma();
    const r = await deposer(
      p,
      demande(),
      ports({
        notifier: async (...a) => {
          notes.push(a);
          return undefined;
        },
      })
    );
    expect(r).toEqual({ issue: 'anteriorite_client', attributionId: null });
    expect(notes).toEqual([
      [
        APPORTEUR,
        {
          cle: 'refus_declaration',
          a: `adresse-de-${APPORTEUR}`,
          parametres: parametresDuRefus('anteriorite_client', 'Entreprise Témoin SAS'),
          attributionId: null,
        },
      ],
    ]);
  });

  it('REQ-DM-009 : sans raison sociale lue, le refus nomme l’entreprise par son SIREN', async () => {
    doublures.anterioriteDe.mockResolvedValue({ connue: true, origine: 'devis' });
    const notes: unknown[][] = [];
    const { p } = prisma();
    await deposer(
      p,
      demande({ fiche: { raisonSociale: null, etatAdministratif: 'actif' } }),
      ports({
        notifier: async (...a) => {
          notes.push(a);
          return undefined;
        },
      })
    );
    expect((notes[0]![1] as { parametres: { entreprise: string } }).parametres.entreprise).toBe(
      SIREN
    );
  });

  it('REQ-DM-009 : ni un dépôt enregistré, ni `gele`, ne notifient', async () => {
    for (const regles of [{}, { statut: 'suspendu' }]) {
      const notes: unknown[] = [];
      const { p } = prisma(regles);
      await deposer(p, demande(), ports({ notifier: async (...a) => notes.push(a) }));
      expect(notes, JSON.stringify(regles)).toEqual([]);
    }
  });

  it('REQ-DM-009 : les paramètres du refus sont dérivés du texte de l’écran ; une issue qui n’est pas un refus lève', () => {
    const t = issueRendue('anteriorite_client');
    expect(parametresDuRefus('anteriorite_client', 'ACME')).toEqual({
      entreprise: 'ACME',
      categorie: t.titre.slice('Pas enregistré : '.length),
      motif: t.pourquoi.replace(/\.$/, ''),
    });
    expect(parametresDuRefus('anteriorite_client', 'ACME').motif?.endsWith('.')).toBe(false);
    expect(() => parametresDuRefus('enregistree', 'ACME')).toThrow(
      /^refus_sans_categorie : l'issue enregistree n'est pas un refus de l'écran$/
    );
  });
});
