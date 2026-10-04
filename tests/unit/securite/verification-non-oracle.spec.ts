// @req REQ-UX-007 REQ-JUR-011 REQ-SEC-021
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
  COMPTEURS_DE_LA_VERIFICATION,
  verifierUneEntreprise,
  type DemandeDeVerification,
  type PortsDeVerification,
} from '../../../src/server/verification/verifier';
import { COMPTEURS, sujetDepuisEmpreinte } from '../../../src/server/securite/rate-limit';

const SIREN = '100000001';
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
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 0 })).toBe('suivie_place_disponible');
    expect(etatDeVerification({ ...LIBRE, occupee: true, enFile: 1 })).toBe('suivie_place_disponible');
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

const REGISTRE_CHIFFRE = {
  'verif:identite': { prefixe: 'verif:' },
  'verif:ip': { prefixe: 'verif:' },
};

type Trace = string[];

function ports(faits: FaitsDeVerification, o: { refuse?: string } = {}) {
  const trace: Trace = [];
  const journal: unknown[] = [];
  const p: PortsDeVerification = {
    limiter: async (nom) => {
      trace.push(`limiter:${nom}`);
      return { autorise: nom !== o.refuse };
    },
    anteriorite: async () => (trace.push('anteriorite'), faits.anteriorite),
    surLaListe: async () => (trace.push('liste'), faits.surLaListe),
    entreprise: async () => (trace.push('entreprise'), faits.entreprise),
    occupation: async () => (
      trace.push('occupation'),
      { occupee: faits.occupee, enFile: faits.enFile }
    ),
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

const LECTURES = ['anteriorite', 'liste', 'entreprise', 'occupation'];

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
      rendus.add(JSON.stringify(await verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE)));
    }
    expect([...rendus]).toEqual([JSON.stringify({ ok: true, dto: { etat: 'non_disponible' } })]);
  });

  it('REQ-UX-007 : TÉMOIN — suivie : un apporteur ou la Société, au même stade, la même réponse', async () => {
    // Le porteur de l'occupation n'entre pas dans les faits : un conseiller occupe comme un apporteur.
    const parApporteur = ports({ ...LIBRE, occupee: true, enFile: 1 });
    const parConseiller = ports({ ...LIBRE, occupee: true, enFile: 1 });
    const a = JSON.stringify(await verifierUneEntreprise(parApporteur.p, DEMANDE, REGISTRE_CHIFFRE));
    const b = JSON.stringify(
      await verifierUneEntreprise(
        parConseiller.p,
        { ...DEMANDE, porteur: { utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b' } },
        REGISTRE_CHIFFRE
      )
    );
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify({ ok: true, dto: { etat: 'suivie_place_disponible' } }));
  });

  it('REQ-UX-007 : la réponse ne porte qu’un état — ni date, ni nom, ni identifiant', async () => {
    for (const f of [
      LIBRE,
      { ...LIBRE, occupee: true, enFile: 2 },
      { ...LIBRE, surLaListe: true },
    ]) {
      const r = await verifierUneEntreprise(ports(f).p, DEMANDE, REGISTRE_CHIFFRE);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(Object.keys(r.dto)).toEqual(['etat']);
      expect(ETATS_VERIFICATION).toContain(r.dto.etat);
      expect(JSON.stringify(r.dto)).toMatch(/^\{"etat":"[a-z_]+"\}$/);
    }
  });

  it('REQ-JUR-011 : TÉMOIN — chaque fait est lu, quelle que soit la cause : le délai ne trahit rien', async () => {
    for (const f of [
      LIBRE,
      { ...LIBRE, entreprise: 'fermee' as const },
      { ...LIBRE, anteriorite: true },
      { ...LIBRE, occupee: true },
    ]) {
      const { p, trace } = ports(f);
      await verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE);
      expect(trace.filter((t) => LECTURES.includes(t)).sort()).toEqual([...LECTURES].sort());
    }
  });
});

describe('REQ-SEC-021 — limitée par identité et par empreinte d’adresse, échec fermé', () => {
  it('REQ-SEC-021 : les deux compteurs sont de la famille verif:, et sont consultés tous deux', async () => {
    expect([...COMPTEURS_DE_LA_VERIFICATION]).toEqual(['verif:identite', 'verif:ip']);
    const { p, trace } = ports(LIBRE);
    await verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE);
    expect(trace.slice(0, 2)).toEqual(['limiter:verif:identite', 'limiter:verif:ip']);
  });

  it('REQ-SEC-021 : TÉMOIN — un compteur ABSENT du registre REFUSE : aucun fait lu, rien au journal', async () => {
    for (const registre of [{}, { 'verif:identite': { prefixe: 'verif:' } }, { 'verif:ip': { prefixe: 'verif:' } }]) {
      const { p, trace } = ports(LIBRE);
      expect(await verifierUneEntreprise(p, DEMANDE, registre)).toEqual({ ok: false, refus: 'limite' });
      expect(trace).toEqual([]);
    }
  });

  it('REQ-SEC-021 : le registre réel, par défaut, est celui que le service consulte', async () => {
    const chiffres = COMPTEURS_DE_LA_VERIFICATION.every((n) => n in COMPTEURS);
    const { p, trace } = ports(LIBRE);
    const r = await verifierUneEntreprise(p, DEMANDE);
    // Tant que Williams n'a pas chiffré les limites, les deux compteurs sont absents, et tout refuse.
    expect(r.ok).toBe(chiffres);
    expect(trace.includes('anteriorite')).toBe(chiffres);
  });

  it.each(['verif:identite', 'verif:ip'])(
    'REQ-SEC-021 : %s atteint — refusé, aucun fait lu, rien au journal',
    async (nom) => {
      const { p, trace, journal } = ports(LIBRE, { refuse: nom });
      expect(await verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE)).toEqual({
        ok: false,
        refus: 'limite',
      });
      expect(trace.some((t) => LECTURES.includes(t))).toBe(false);
      expect(journal).toEqual([]);
    }
  );

  it('REQ-SEC-021 : sans empreinte d’adresse, le compteur ne compte rien — refusé', async () => {
    const { p, trace } = ports(LIBRE);
    expect(await verifierUneEntreprise(p, { ...DEMANDE, sujetIp: null }, REGISTRE_CHIFFRE)).toEqual({
      ok: false,
      refus: 'limite',
    });
    expect(trace).toEqual(['limiter:verif:identite']);
  });

  it.each(['12345678', '1234567890', '12345678A', ' 100000001'])(
    'REQ-SEC-021 : un SIREN mal formé (%j) est refusé avant tout compteur',
    async (siren) => {
      const { p, trace } = ports(LIBRE);
      expect(await verifierUneEntreprise(p, { ...DEMANDE, siren }, REGISTRE_CHIFFRE)).toEqual({
        ok: false,
        refus: 'siren_invalide',
      });
      expect(trace).toEqual([]);
    }
  );
});

describe('REQ-SEC-021 — chaque vérification admise est journalisée, par identifiants seuls', () => {
  it('REQ-SEC-021 : une ligne — le porteur, le SIREN, la cause interne, l’empreinte tronquée', async () => {
    const { p, journal, trace } = ports({ ...LIBRE, surLaListe: true });
    await verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE);
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
    await verifierUneEntreprise(
      p,
      { ...DEMANDE, porteur: { utilisateurConsoleId: '0190a5c0-0000-7000-8000-00000000000b' } },
      REGISTRE_CHIFFRE
    );
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
    await expect(verifierUneEntreprise(p, DEMANDE, REGISTRE_CHIFFRE)).rejects.toThrow('journal refusé');
  });
});
