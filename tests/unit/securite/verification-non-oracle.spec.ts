// @req REQ-UX-007
// @req REQ-SEC-022
// @req REQ-JUR-011
// @req REQ-SEC-021
// @req REQ-EXT-006
/**
 * G-SEC-ORACLE — « Vérifier une entreprise » ne fait pas d'oracle (SEC-16, rattrapages 95 et 96).
 *
 * La réponse a QUATRE états. `non_disponible` regroupe l'antériorité, la liste de la Société et
 * l'entreprise fermée ou non diffusible, sans sous-état ni catégorie ; les deux `suivie_*` valent
 * pour tout occupant. Deux causes d'un même état rendent la MÊME réponse, octet pour octet, après le
 * MÊME travail : chaque fait est lu, quelle que soit la cause. Aucune date, aucun nom, aucun
 * identifiant ne sort.
 *
 * Les limites ne sont pas chiffrées (décision de Williams attendue) : un compteur `verif:` ABSENT du
 * registre REFUSE la vérification — « aucun chiffre » ne devient jamais « pas de limite ».
 */
import { describe, it, expect } from 'vitest';
import {
  ETATS_VERIFICATION,
  etatDeVerification,
  causeDuJournal,
  type FaitsDeVerification,
} from '../../../src/domain/verification/etats';
import {
  SUJETS_COMPTES,
  verifierUneEntreprise,
  type DemandeDeVerification,
  type PortsDeVerification,
} from '../../../src/server/verification/verifier';
import {
  COMPTEURS,
  PREFIXES_DE_FAMILLE,
  sujetDepuisEmpreinte,
} from '../../../src/server/securite/rate-limit';

/** La famille des compteurs de la vérification (REQ-SEC-016), lue au registre, jamais retapée. */
const FAMILLE = PREFIXES_DE_FAMILLE[2];
import {
  entrepriseParLeRegistre,
  etatDepuisLaFiche,
} from '../../../src/server/verification/registre-public';
import {
  compterAvantLaDecision,
  portsDeLaBase,
} from '../../../src/server/verification/ports-prisma';
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';
import { ETATS_ATTRIBUTION, ETATS_TERMINES } from '../../../src/domain/attribution/machine';
import { SIGNAL_DEJA_DECLAREE_ANCIENNETE_JOURS } from '../../../src/domain/seuils/ssot';
import { derniereFinSurLeSiren } from '../../../src/server/evenement/journal';
import type { PrismaClient } from '@prisma/client';
import type {
  DependancesDuMandataire,
  IssueDeFiche,
} from '../../../src/server/integrations/recherche-entreprises/autocompletion';
import { MOTIFS_DE_SAISIE_MANUELLE } from '../../../src/server/integrations/recherche-entreprises/schemas';

const SIREN = '100000001';
/** L'heure du signal : midi à Paris, le 15 octobre 2026. */
const MAINTENANT_DU_SIGNAL = new Date('2026-10-15T10:00:00.000Z');
/** Une fin il y a N jours civils de Paris, à midi. */
const ilYA = (jours: number) => new Date(MAINTENANT_DU_SIGNAL.getTime() - jours * 86_400_000);

const LIBRE: FaitsDeVerification = {
  anteriorite: false,
  surLaListe: false,
  entreprise: 'active',
  occupee: false,
  enFile: 0,
};

// ── le domaine ──────────────────────────────────────────────────────────────────────────────────

describe('REQ-UX-007 — quatre états, et rien d’autre', () => {
  it('REQ-UX-007 : les quatre états, exactement, dans cet ordre', () => {
    expect([...ETATS_VERIFICATION]).toEqual([
      'libre',
      'suivie_place_disponible',
      'suivie_file_complete',
      'non_disponible',
    ]);
  });

  it('REQ-UX-007 : une entreprise active, connue de personne, inoccupée, est libre', () => {
    expect(etatDeVerification(LIBRE)).toBe('libre');
  });

  it.each([
    ['cliente ou par devis (antériorité)', { anteriorite: true }],
    ['inscrite sur la liste de la Société', { surLaListe: true }],
    ['fermée', { entreprise: 'fermee' }],
    ['non diffusible', { entreprise: 'non_diffusible' }],
    ['introuvable', { entreprise: 'introuvable' }],
    ['antériorité ET occupée', { anteriorite: true, occupee: true, enFile: 2 }],
    ['fermée ET occupée', { entreprise: 'fermee', occupee: true, enFile: 1 }],
  ] as const)('REQ-JUR-011 : %s — non_disponible', (_, f) => {
    expect(etatDeVerification({ ...LIBRE, ...f })).toBe('non_disponible');
  });

  it('REQ-UX-007 : occupée, la file a une place — suivie_place_disponible ; deux en file — complète', () => {
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 0 })).toBe(
      'suivie_place_disponible'
    );
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 1 })).toBe(
      'suivie_place_disponible'
    );
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 2 })).toBe('suivie_file_complete');
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 3 })).toBe('suivie_file_complete');
  });

  it('REQ-UX-007 : une file sans occupant (incohérence) n’est jamais lue libre', () => {
    expect(etatDeVerification({ ...LIBRE, enFile: 1 })).toBe('suivie_place_disponible');
    expect(etatDeVerification({ ...LIBRE, enFile: 2 })).toBe('suivie_file_complete');
  });

  it('REQ-SEC-021 : la cause INTERNE, tenue au journal, distingue ce que la réponse tait', () => {
    expect(causeDuJournal(LIBRE)).toBe('libre');
    expect(causeDuJournal({ ...LIBRE, occupee: true })).toBe('suivie');
    expect(causeDuJournal({ ...LIBRE, enFile: 1 })).toBe('suivie');
    expect(causeDuJournal({ ...LIBRE, anteriorite: true })).toBe('cliente');
    expect(causeDuJournal({ ...LIBRE, surLaListe: true })).toBe('liste_noire');
    expect(causeDuJournal({ ...LIBRE, entreprise: 'fermee' })).toBe('fermee');
    expect(causeDuJournal({ ...LIBRE, entreprise: 'non_diffusible' })).toBe('fermee');
    expect(causeDuJournal({ ...LIBRE, entreprise: 'introuvable' })).toBe('fermee');
    // la même préséance que l'état : la liste avant l'antériorité, l'entreprise avant tout.
    expect(causeDuJournal({ ...LIBRE, anteriorite: true, surLaListe: true })).toBe('liste_noire');
    expect(causeDuJournal({ ...LIBRE, entreprise: 'fermee', surLaListe: true })).toBe('fermee');
    expect(causeDuJournal({ ...LIBRE, anteriorite: true, occupee: true })).toBe('cliente');
  });
});

// ── le service ──────────────────────────────────────────────────────────────────────────────────

type Trace = string[];

function ports(
  faits: FaitsDeVerification,
  o: { refuse?: string; derniereFin?: Date | null | 'echec' } = {}
) {
  const trace: Trace = [];
  const journal: unknown[] = [];
  const p: PortsDeVerification = {
    compter: async (nom) => {
      trace.push(`compter:${nom}`);
      return { autorise: nom !== o.refuse };
    },
    anteriorite: async () => (trace.push('anteriorite'), faits.anteriorite),
    surLaListe: async () => (trace.push('liste'), faits.surLaListe),
    entreprise: async () => (trace.push('entreprise'), faits.entreprise),
    occupation: async () => (
      trace.push('occupation'),
      { occupee: faits.occupee, enFile: faits.enFile }
    ),
    derniereFin: async () => {
      trace.push('derniere_fin');
      if (o.derniereFin === 'echec') throw new Error('lecture impossible');
      return o.derniereFin ?? null;
    },
    maintenant: () => MAINTENANT_DU_SIGNAL,
    journaliser: async (l) => {
      trace.push('journal');
      journal.push(l);
    },
  };
  return { p, trace, journal };
}

const DEMANDE: DemandeDeVerification = {
  porteur: { apporteurId: '0190a5c0-0000-7000-8000-00000000000a' },
  siren: SIREN,
  sujetIdentite: sujetDepuisEmpreinte('a'.repeat(64)),
  sujetIp: sujetDepuisEmpreinte('b'.repeat(64)),
  ipHash: 'c'.repeat(16),
};

const LECTURES = ['anteriorite', 'liste', 'entreprise', 'occupation', 'derniere_fin'];

describe('G-SEC-ORACLE — deux causes d’un même état, la même réponse, après le même travail', () => {
  const causesNonDisponible: [string, Partial<FaitsDeVerification>][] = [
    ['antériorité', { anteriorite: true }],
    ['liste de la Société', { surLaListe: true }],
    ['fermée', { entreprise: 'fermee' }],
    ['non diffusible', { entreprise: 'non_diffusible' }],
  ];

  it('REQ-JUR-011 : TÉMOIN — non_disponible : chaque cause rend la même réponse, octet pour octet', async () => {
    const rendus = new Set<string>();
    for (const [, f] of causesNonDisponible) {
      const { p } = ports({ ...LIBRE, ...f });
      rendus.add(JSON.stringify(await verifierUneEntreprise(p, DEMANDE)));
    }
    expect([...rendus]).toEqual([
      JSON.stringify({ ok: true, dto: { etat: 'non_disponible', dejaDeclaree: false } }),
    ]);
  });

  it('REQ-UX-007 : TÉMOIN — suivie : un apporteur ou la Société, au même stade, la même réponse', async () => {
    // Le porteur de l'occupation n'entre pas dans les faits : un conseiller occupe comme un apporteur.
    const parApporteur = ports({ ...LIBRE, occupee: true, enFile: 1 });
    const parConseiller = ports({ ...LIBRE, occupee: true, enFile: 1 });
    const a = JSON.stringify(await verifierUneEntreprise(parApporteur.p, DEMANDE));
    const b = JSON.stringify(
      await verifierUneEntreprise(parConseiller.p, {
        ...DEMANDE,
        porteur: { utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b' },
      })
    );
    expect(a).toBe(b);
    expect(a).toBe(
      JSON.stringify({ ok: true, dto: { etat: 'suivie_place_disponible', dejaDeclaree: false } })
    );
  });

  it('REQ-UX-007 : la réponse ne porte qu’un état et le booléen du signal — ni date, ni nom, ni identifiant', async () => {
    for (const f of [
      LIBRE,
      { ...LIBRE, occupee: true, enFile: 2 },
      { ...LIBRE, surLaListe: true },
    ]) {
      const r = await verifierUneEntreprise(ports(f).p, DEMANDE);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(Object.keys(r.dto)).toEqual(['etat', 'dejaDeclaree']);
      expect(ETATS_VERIFICATION).toContain(r.dto.etat);
      expect(JSON.stringify(r.dto)).toMatch(/^\{"etat":"[a-z_]+","dejaDeclaree":(true|false)\}$/);
    }
  });

  it('REQ-UX-007 : TÉMOIN de forme — un gabarit par état, la même taille pour chaque cause de cet état', async () => {
    const parEtat = new Map<string, Set<string>>();
    for (const f of [
      LIBRE,
      { ...LIBRE, occupee: true },
      { ...LIBRE, enFile: 1 },
      { ...LIBRE, occupee: true, enFile: 2 },
      { ...LIBRE, enFile: 2 },
      { ...LIBRE, anteriorite: true },
      { ...LIBRE, surLaListe: true },
      { ...LIBRE, entreprise: 'fermee' as const },
      { ...LIBRE, entreprise: 'introuvable' as const },
    ]) {
      const r = await verifierUneEntreprise(ports(f).p, DEMANDE);
      if (!r.ok) throw new Error('refus inattendu');
      const rendu = JSON.stringify(r);
      parEtat.set(r.dto.etat, (parEtat.get(r.dto.etat) ?? new Set()).add(rendu));
    }
    expect([...parEtat.keys()].sort()).toEqual([...ETATS_VERIFICATION].sort());
    for (const [etat, rendus] of parEtat) {
      expect([...rendus]).toEqual([`{"ok":true,"dto":{"etat":"${etat}","dejaDeclaree":false}}`]);
    }
  });

  it('REQ-JUR-011 : TÉMOIN — le registre public d’abord, puis chaque fait, quelle que soit la cause : le délai ne trahit rien', async () => {
    for (const f of [
      LIBRE,
      { ...LIBRE, entreprise: 'fermee' as const },
      { ...LIBRE, anteriorite: true },
      { ...LIBRE, occupee: true },
    ]) {
      const { p, trace } = ports(f);
      await verifierUneEntreprise(p, DEMANDE);
      expect(trace.filter((t) => LECTURES.includes(t)).sort()).toEqual([...LECTURES].sort());
      expect(trace.indexOf('entreprise')).toBe(2);
    }
  });
});

describe('REQ-SEC-021 — limitée par identité et par empreinte d’adresse, échec fermé', () => {
  it('REQ-SEC-021 : l’identité, puis l’empreinte d’adresse, sont comptées, dans cet ordre', async () => {
    expect([...SUJETS_COMPTES]).toEqual(['identite', 'ip']);
    const { p, trace } = ports(LIBRE);
    await verifierUneEntreprise(p, DEMANDE);
    expect(trace.slice(0, 2)).toEqual(['compter:identite', 'compter:ip']);
  });

  it('REQ-SEC-021 : TÉMOIN — un compteur qui refuse fait refuser : aucun fait lu, rien au journal', async () => {
    const p = ports(LIBRE);
    p.p.compter = compterAvantLaDecision;
    expect(await verifierUneEntreprise(p.p, DEMANDE)).toEqual({ ok: false, refus: 'limite' });
    expect(p.trace).toEqual([]);
    expect(p.journal).toEqual([]);
  });

  it('REQ-SEC-021 : CLIQUET — aucun compteur de la famille n’est au registre ; le jour où l’un y entre, ce témoin rougit, et le port de production l’appelle par son nom littéral', () => {
    expect(Object.keys(COMPTEURS).filter((n) => n.startsWith(FAMILLE))).toEqual([]);
  });

  it.each(['identite', 'ip'])(
    'REQ-SEC-021 : %s atteint — refusé, aucun fait lu, rien au journal',
    async (nom) => {
      const { p, trace, journal } = ports(LIBRE, { refuse: nom });
      expect(await verifierUneEntreprise(p, DEMANDE)).toEqual({
        ok: false,
        refus: 'limite',
      });
      expect(trace.some((t) => LECTURES.includes(t))).toBe(false);
      expect(journal).toEqual([]);
    }
  );

  it('REQ-SEC-021 : sans empreinte d’adresse, le compteur ne compte rien — refusé', async () => {
    const { p, trace } = ports(LIBRE);
    expect(await verifierUneEntreprise(p, { ...DEMANDE, sujetIp: null })).toEqual({
      ok: false,
      refus: 'limite',
    });
    expect(trace).toEqual(['compter:identite']);
  });

  it.each(['12345678', '1234567890', '12345678A', ' 100000001'])(
    'REQ-SEC-021 : un SIREN mal formé (%j) est refusé avant tout compteur',
    async (siren) => {
      const { p, trace } = ports(LIBRE);
      expect(await verifierUneEntreprise(p, { ...DEMANDE, siren })).toEqual({
        ok: false,
        refus: 'siren_invalide',
      });
      expect(trace).toEqual([]);
    }
  );
});

describe('REQ-JUR-011 — le registre public indisponible : un refus nommé, jamais un état', () => {
  it.each([
    ['libre', LIBRE],
    ['occupée', { ...LIBRE, occupee: true, enFile: 2 }],
    ['sur la liste', { ...LIBRE, surLaListe: true }],
    ['connue par antériorité', { ...LIBRE, anteriorite: true }],
  ])(
    'REQ-JUR-011 : TÉMOIN — %s, registre muet : registre_indisponible, AVANT toute autre lecture, compté au débit, rien au journal',
    async (_, f) => {
      const { p, trace, journal } = ports(f);
      p.entreprise = async () => (trace.push('entreprise'), 'indisponible');
      expect(JSON.stringify(await verifierUneEntreprise(p, DEMANDE))).toBe(
        JSON.stringify({ ok: false, refus: 'registre_indisponible' })
      );
      // les deux compteurs ont compté la tentative ; le registre seul a été lu, rien d'autre.
      expect(trace).toEqual(['compter:identite', 'compter:ip', 'entreprise']);
      expect(journal).toEqual([]);
    }
  );
});

describe('REQ-SEC-021 — chaque vérification admise est journalisée, par identifiants seuls', () => {
  it('REQ-SEC-021 : une ligne — le porteur, le SIREN, la cause interne, l’empreinte tronquée', async () => {
    const { p, journal, trace } = ports({ ...LIBRE, surLaListe: true });
    await verifierUneEntreprise(p, DEMANDE);
    expect(journal).toEqual([
      {
        apporteurId: '0190a5c0-0000-7000-8000-00000000000a',
        utilisateurConsoleId: null,
        siren: SIREN,
        resultat: 'liste_noire',
        ipHash: 'c'.repeat(16),
      },
    ]);
    expect(trace.at(-1)).toBe('journal');
  });

  it('REQ-SEC-021 : un utilisateur de la console est journalisé comme tel', async () => {
    const { p, journal } = ports({ ...LIBRE, occupee: true });
    await verifierUneEntreprise(p, {
      ...DEMANDE,
      porteur: { utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b' },
    });
    expect(journal).toEqual([
      {
        apporteurId: null,
        utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b',
        siren: SIREN,
        resultat: 'suivie',
        ipHash: 'c'.repeat(16),
      },
    ]);
  });

  it('REQ-SEC-021 : une trace qui échoue fait échouer la vérification — aucune réponse sans trace', async () => {
    const { p } = ports(LIBRE);
    p.journaliser = async () => {
      throw new Error('journal refusé');
    };
    await expect(verifierUneEntreprise(p, DEMANDE)).rejects.toThrow('journal refusé');
  });
});

describe('REQ-JUR-011 — la fiche du registre public, lue en échec fermé', () => {
  const fiche = (etat: string) =>
    ({ ok: true, fiche: { etat_administratif: etat } }) as unknown as IssueDeFiche;
  const echec = (motif: string) =>
    ({ ok: false, motif, marque: 'entreprise_a_verifier' }) as unknown as IssueDeFiche;

  it('REQ-JUR-011 : active (A), fermée (C) ; un SIREN que le registre ne connaît pas est introuvable', () => {
    expect(etatDepuisLaFiche(fiche('A'))).toBe('active');
    expect(etatDepuisLaFiche(fiche('C'))).toBe('fermee');
    expect(etatDepuisLaFiche(echec('siren_inconnu'))).toBe('introuvable');
  });

  it.each(['', 'a', 'F', ' A', 'AC'])(
    'REQ-JUR-011 : TÉMOIN — un état administratif illisible (%j) ne rend jamais « libre » : indisponible',
    (etat) => {
      expect(etatDepuisLaFiche(fiche(etat))).toBe('indisponible');
    }
  );

  it('REQ-JUR-011 : TÉMOIN — une fiche sans état administratif : indisponible', () => {
    expect(etatDepuisLaFiche({ ok: true, fiche: {} } as unknown as IssueDeFiche)).toBe(
      'indisponible'
    );
  });

  it.each(MOTIFS_DE_SAISIE_MANUELLE)(
    'REQ-JUR-011 : TÉMOIN — panne du registre (%s) : indisponible',
    (motif) => {
      expect(etatDepuisLaFiche(echec(motif))).toBe('indisponible');
    }
  );
});

describe('REQ-SEC-021 — avant la décision de Williams, le compteur de production refuse', () => {
  it('REQ-SEC-021 : TÉMOIN — aucun chiffre ne devient « pas de limite » : chaque compteur refuse', async () => {
    for (const nom of SUJETS_COMPTES) {
      expect(await compterAvantLaDecision(nom, DEMANDE.sujetIdentite)).toEqual({ autorise: false });
    }
  });
});

describe('REQ-UX-007 — les ports de la base, jugés en processus sur un faux client', () => {
  type Appel = { quoi: string; args: unknown };
  function fauxClient(o: {
    occupants?: number;
    enFile?: number;
    liste?: boolean;
    client?: Date | null;
    devis?: {
      emisAt: Date;
      signeAt: Date | null;
      montantTotalHtCents: number;
      factureHtCents: number;
    }[];
  }) {
    const appels: Appel[] = [];
    const noter = (quoi: string, rendu: (args: unknown) => unknown) => async (args: unknown) => {
      appels.push({ quoi, args });
      return rendu(args);
    };
    const client = {
      attribution: {
        count: noter('attribution.count', (a) =>
          (a as { where: { statut: unknown } }).where.statut === 'en_attente'
            ? (o.enFile ?? 0)
            : (o.occupants ?? 0)
        ),
      },
      sirenListeNoire: {
        findUnique: noter('sirenListeNoire.findUnique', () =>
          o.liste ? { siren: SIREN, motif: 'financeur_public' } : null
        ),
      },
      entrepriseConnue: {
        findUnique: noter('entrepriseConnue.findUnique', () =>
          o.client ? { dernierContactAt: o.client } : null
        ),
      },
      devisConnu: { findMany: noter('devisConnu.findMany', () => o.devis ?? []) },
      verification: { create: noter('verification.create', () => ({})) },
    } as unknown as PrismaClient;
    return { client, appels };
  }

  it('REQ-UX-007 : l’occupation compte les états OCCUPANTS et la file en_attente, sur CE SIREN', async () => {
    const f = fauxClient({ occupants: 1, enFile: 2 });
    expect(await portsDeLaBase(f.client).occupation(SIREN)).toEqual({ occupee: true, enFile: 2 });
    expect(f.appels.map((a) => a.args)).toEqual([
      { where: { siren: SIREN, statut: { in: [...ETATS_OCCUPANTS] } } },
      { where: { siren: SIREN, statut: 'en_attente' } },
    ]);
    expect(await portsDeLaBase(fauxClient({}).client).occupation(SIREN)).toEqual({
      occupee: false,
      enFile: 0,
    });
  });

  it('REQ-UX-007 : la liste de la Société se lit par le SIREN', async () => {
    const f = fauxClient({ liste: true });
    expect(await portsDeLaBase(f.client).surLaListe(SIREN)).toBe(true);
    expect(f.appels[0]!.args).toEqual({ where: { siren: SIREN }, select: { siren: true } });
    expect(await portsDeLaBase(fauxClient({}).client).surLaListe(SIREN)).toBe(false);
  });

  it('REQ-UX-007 : l’antériorité ne compte que client et devis — la liste est une autre cause', async () => {
    const recente = new Date(Date.now() - 24 * 3600 * 1000);
    expect(await portsDeLaBase(fauxClient({ client: recente }).client).anteriorite(SIREN)).toBe(
      true
    );
    expect(
      await portsDeLaBase(
        fauxClient({
          devis: [{ emisAt: recente, signeAt: null, montantTotalHtCents: 0, factureHtCents: 0 }],
        }).client
      ).anteriorite(SIREN)
    ).toBe(true);
    // Sur la liste, l'antériorité dit « financeur » : ce port rend faux, la liste a le sien.
    expect(await portsDeLaBase(fauxClient({ liste: true }).client).anteriorite(SIREN)).toBe(false);
    expect(await portsDeLaBase(fauxClient({}).client).anteriorite(SIREN)).toBe(false);
  });

  it('REQ-SEC-021 : le journal écrit la ligne telle quelle, dans verifications', async () => {
    const f = fauxClient({});
    const ligne = {
      apporteurId: 'a',
      utilisateurConsoleId: null,
      siren: SIREN,
      resultat: 'libre' as const,
      ipHash: null,
    };
    await portsDeLaBase(f.client).journaliser(ligne);
    expect(f.appels).toEqual([{ quoi: 'verification.create', args: { data: ligne } }]);
  });

  it('REQ-SEC-021 : le compteur de production refuse, par la base aussi', async () => {
    expect(
      await portsDeLaBase(fauxClient({}).client).compter('identite', DEMANDE.sujetIdentite)
    ).toEqual({ autorise: false });
  });
});

describe('REQ-JUR-011 — le port du registre public, sur les dépendances du mandataire', () => {
  /** Des dépendances vides : le mandataire lève au premier usage. */
  const DEPS_VIDES: DependancesDuMandataire = Object.create(null);

  it('REQ-JUR-011 : un SIREN mal formé est introuvable, avant tout appel', async () => {
    expect(await entrepriseParLeRegistre(DEPS_VIDES)('12345678')).toBe('introuvable');
  });

  it('REQ-JUR-011 : TÉMOIN — une levée du mandataire est une panne : indisponible, jamais « active »', async () => {
    await expect(entrepriseParLeRegistre(DEPS_VIDES)(SIREN)).resolves.toBe('indisponible');
  });
});

describe('REQ-SEC-022 — la catégorie de la liste ne se dit qu’au refus d’un DÉPÔT, jamais à une vérification', () => {
  const CATEGORIES = [
    'administration',
    'financeur_public',
    'financeur_paritaire',
    'organisme_de_formation_partenaire',
  ] as const;

  it.each(CATEGORIES)(
    'REQ-SEC-022 : TÉMOIN — inscrite comme %s, la réponse ne porte ni la catégorie, ni rien qui la distingue',
    async (motif) => {
      const client = {
        sirenListeNoire: { findUnique: async () => ({ siren: SIREN, motif }) },
      } as unknown as PrismaClient;
      // Le port rend un BOOLÉEN : la catégorie ne franchit pas la base.
      const surLaListe = await portsDeLaBase(client).surLaListe(SIREN);
      expect(surLaListe).toBe(true);
      const { p } = ports({ ...LIBRE, surLaListe });
      const rendu = JSON.stringify(await verifierUneEntreprise(p, DEMANDE));
      expect(rendu).toBe(
        JSON.stringify({ ok: true, dto: { etat: 'non_disponible', dejaDeclaree: false } })
      );
      for (const c of CATEGORIES) expect(rendu).not.toContain(c);
    }
  );
});

/**
 * EXT-T06 (REQ-EXT-006 ; juriste, #474, 6036611999 et #319, 6036622439 ; conditions de la sécurité) — le
 * signal « Déjà déposée par le passé » : un BOOLÉEN seul, toujours présent, à la même place ; vrai
 * seulement pour `libre`, pour un apporteur, et si la DERNIÈRE fin d'une attribution terminée date de
 * PLUS de `SIGNAL_DEJA_DECLAREE_ANCIENNETE_JOURS` jours civils de Paris ; ni stocké, ni journalisé.
 */
describe('REQ-EXT-006 — « Déjà déposée par le passé » : un booléen, de même forme vrai ou faux', () => {
  const dto = async (
    o: Parameters<typeof ports>[1],
    f: FaitsDeVerification = LIBRE,
    d = DEMANDE
  ) => {
    const r = await verifierUneEntreprise(ports(f, o).p, d);
    if (!r.ok) throw new Error('refus inattendu');
    return r.dto;
  };

  it('REQ-EXT-006 : TÉMOIN — J-29 sans signal, J-31 avec ; le seuil est LU dans la SSOT', async () => {
    expect(SIGNAL_DEJA_DECLAREE_ANCIENNETE_JOURS.valeur).toBe(30);
    expect((await dto({ derniereFin: ilYA(29) })).dejaDeclaree).toBe(false);
    expect((await dto({ derniereFin: ilYA(30) })).dejaDeclaree).toBe(false);
    expect((await dto({ derniereFin: ilYA(31) })).dejaDeclaree).toBe(true);
    expect((await dto({ derniereFin: null })).dejaDeclaree).toBe(false);
  });

  it('REQ-EXT-006 : TÉMOIN d’indistinction — vrai ou faux, la MÊME forme et le MÊME ordre de champs ; avant le seuil, l’état « disponible » octet pour octet', async () => {
    const vrai = JSON.stringify(await dto({ derniereFin: ilYA(31) }));
    const faux = JSON.stringify(await dto({ derniereFin: ilYA(29) }));
    const jamais = JSON.stringify(await dto({ derniereFin: null }));
    expect(vrai).toBe('{"etat":"libre","dejaDeclaree":true}');
    expect(faux).toBe(jamais);
    expect(Object.keys(JSON.parse(vrai))).toEqual(Object.keys(JSON.parse(faux)));
  });

  it('REQ-EXT-006 : TÉMOIN — jamais avec un occupant, une file, une antériorité ou un refus : le signal ne vaut que pour une entreprise disponible', async () => {
    for (const f of [
      { ...LIBRE, occupee: true },
      { ...LIBRE, enFile: 1 },
      { ...LIBRE, anteriorite: true },
      { ...LIBRE, surLaListe: true },
      { ...LIBRE, entreprise: 'fermee' as const },
    ])
      expect((await dto({ derniereFin: ilYA(400) }, f)).dejaDeclaree).toBe(false);
  });

  it('REQ-EXT-006 : TÉMOIN — la console ne reçoit jamais le signal', async () => {
    const console = await dto({ derniereFin: ilYA(400) }, LIBRE, {
      ...DEMANDE,
      porteur: { utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b' },
    });
    expect(console.dejaDeclaree).toBe(false);
  });

  it('REQ-EXT-006 : TÉMOIN — une lecture de la dernière fin qui ÉCHOUE rend « jamais déposée », et la vérification se poursuit sans erreur', async () => {
    const echec = await dto({ derniereFin: 'echec' });
    expect(echec).toEqual(await dto({ derniereFin: null }));
  });

  it('REQ-EXT-006 : TÉMOIN — le signal n’est ni journalisé ni stocké : la ligne du journal des vérifications ne le porte pas', async () => {
    const { p, journal } = ports(LIBRE, { derniereFin: ilYA(400) });
    await verifierUneEntreprise(p, DEMANDE);
    expect(JSON.stringify(journal)).not.toMatch(/deja|declaree|fin/i);
  });
});

describe('REQ-EXT-006 — le lecteur RÉSERVÉ de la dernière fin, en échec fermé', () => {
  const SIREN_LU = '552100554';
  type Ev = { survenuAt: Date; charge: unknown } | null;
  function client(
    attributions: { id: string; statut: string }[],
    evenements: Record<string, Ev>,
    o: { panne?: boolean } = {}
  ) {
    const lectures: { sql: string; valeurs: unknown[] }[] = [];
    return {
      lectures,
      c: {
        // UNE requête agrégée : chaque attribution terminée vient avec son DERNIER événement (ou rien).
        $queryRaw: async (sql: TemplateStringsArray, ...valeurs: unknown[]) => {
          lectures.push({ sql: sql.join('?'), valeurs });
          if (o.panne) throw new Error('base indisponible');
          return attributions.map((a) => {
            const e = evenements[a.id] ?? null;
            return {
              statut: a.statut,
              survenu_at: e?.survenuAt ?? null,
              charge: e?.charge ?? null,
            };
          });
        },
      } as unknown as PrismaClient,
    };
  }
  const charge = (vers: string) => ({
    de: 'active',
    vers,
    transition: 'perimee',
    acteur: { par: 'systeme' },
  });

  it('REQ-EXT-006 : TÉMOIN — les attributions se lisent par le SIREN et la liste FERMÉE des états terminés ; seule la DERNIÈRE fin compte', async () => {
    const { c, lectures } = client(
      [
        { id: 'a1', statut: 'perimee' },
        { id: 'a2', statut: 'perimee' },
      ],
      {
        a1: { survenuAt: ilYA(200), charge: charge('perimee') },
        a2: { survenuAt: ilYA(20), charge: charge('perimee') },
      }
    );
    expect(await derniereFinSurLeSiren(c, SIREN_LU)).toEqual(ilYA(20));
    // Une SEULE lecture, par le SIREN et la liste FERMÉE des états terminés, quel que soit leur nombre.
    expect(lectures).toHaveLength(1);
    expect(lectures[0]!.valeurs).toEqual([SIREN_LU, [...ETATS_TERMINES]]);
    expect(lectures[0]!.sql).toMatch(/LEFT JOIN LATERAL/);
    expect(lectures[0]!.sql).toMatch(/agregat_id = a\.id/);
    expect(lectures[0]!.sql).not.toMatch(/charge\s*->/);
  });

  it('REQ-EXT-006 : TÉMOIN — une charge illisible, discordante ou absente, ou une panne, rendent null : aucun signal', async () => {
    const att = [{ id: 'a1', statut: 'expiree' }];
    expect(
      await derniereFinSurLeSiren(
        client(att, { a1: { survenuAt: ilYA(90), charge: { vers: 42 } } }).c,
        SIREN_LU
      )
    ).toBeNull();
    expect(
      await derniereFinSurLeSiren(
        client(att, { a1: { survenuAt: ilYA(90), charge: charge('annulee') } }).c,
        SIREN_LU
      )
    ).toBeNull();
    expect(await derniereFinSurLeSiren(client(att, {}).c, SIREN_LU)).toBeNull();
    expect(await derniereFinSurLeSiren(client(att, {}, { panne: true }).c, SIREN_LU)).toBeNull();
    expect(await derniereFinSurLeSiren(client([], {}).c, SIREN_LU)).toBeNull();
  });

  it('REQ-EXT-006 : TÉMOIN — chaque état d’attribution est d’UNE seule classe : occupant, en file ou terminé ; un état neuf non classé rougit', () => {
    for (const e of ETATS_ATTRIBUTION) {
      const classes = [
        (ETATS_OCCUPANTS as readonly string[]).includes(e),
        e === 'en_attente',
        (ETATS_TERMINES as readonly string[]).includes(e),
      ].filter(Boolean);
      expect(classes, e).toHaveLength(1);
    }
  });
});
