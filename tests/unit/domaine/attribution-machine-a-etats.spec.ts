// @req REQ-DM-004
// @req REQ-DM-006
// @req REQ-DM-007
// @req REQ-QA-004
// @req REQ-SEC-042
/**
 * DM-08 — la machine à états d'attribution, jugée sans base (REQ-DM-006, REQ-QA-004, REQ-DM-007).
 *
 * CE QU'IL PROUVE :
 *   1. L'EXHAUSTIVITÉ (garde `partners:transitions:exhaustive`) : CHAQUE triplet (état ou naissance,
 *      transition, type de porteur) est jugé contre une table ATTENDUE écrite ici, indépendamment de
 *      la matrice ; retirer ou ajouter une cellule de la matrice fait rougir ;
 *   2. un couple absent lève une erreur typée qui le NOMME ; une valeur inconnue aussi ;
 *   3. W19 : un témoin PAR refus au conseiller, et la naissance propre à chaque porteur ;
 *   4. LES EFFETS recalculés (REQ-DM-007) : fenêtre ouverte à la confirmation, péremption depuis le
 *      premier contact seulement, suspendue par le marqueur, nulle dès qu'une suite existe, et la
 *      caducité d'une commande qui ne recalcule rien ;
 *   5. la charge du journal `attribution_etat_modifie` lit `EVENEMENTS_ATTRIBUTION`.
 */
import { describe, it, expect, vi } from 'vitest';
import { EtatAttribution } from '@prisma/client';
import {
  ETATS_ATTRIBUTION,
  EVENEMENTS_ATTRIBUTION,
  ErreurTransitionAttribution,
  NAISSANCES_ATTRIBUTION,
  REFUSEES_AU_CONSEILLER,
  TRANSITIONS_ATTRIBUTION,
  codeDeCaducite,
  ajouterMoisParis,
  effetsDeTransition,
  transitionnerAttribution,
  type TransitionAttribution,
  type TypePorteur,
} from '../../../src/domain/attribution/machine';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { MS_PAR_JOUR } from '../../../src/domain/temps/calendrier-civil';
import { CHARGES_PAR_TYPE } from '../../../src/domain/evenement/charges';

/** LA TABLE ATTENDUE — validée par l'architecte le 2026-10-02 ; tout ce qui n'y est pas est refusé. */
const NAISSANCES: Record<string, string> = {
  deposee: 'provisoire',
  deposee_en_file: 'en_attente',
  prise_en_charge: 'provisoire',
};
const ATTENDUE: Record<string, Record<string, string>> = {
  en_attente: { retiree: 'annulee', file_expiree: 'expiree', redeclaree: 'expiree' },
  provisoire: {
    confirmee: 'active',
    confirmee_par_courriel: 'active',
    confirmee_tacitement: 'active',
    non_confirmee: 'invalidee',
    non_confirmee_par_courriel: 'invalidee',
    anomalie_confirmee: 'invalidee',
    annulee_par_apporteur: 'annulee',
    annulee_par_la_console: 'annulee',
    liberee_sans_confirmation: 'perimee',
    figee: 'figee_resiliation',
  },
  active: {
    rdv_pris: 'rdv_pris',
    devis_envoye: 'proposition',
    devis_signe: 'signee',
    perdue: 'perdue',
    perimee: 'perimee',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    figee: 'figee_resiliation',
  },
  rdv_pris: {
    devis_envoye: 'proposition',
    devis_signe: 'signee',
    perdue: 'perdue',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    figee: 'figee_resiliation',
  },
  proposition: {
    devis_signe: 'signee',
    perdue: 'perdue',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    figee: 'figee_resiliation',
  },
  signee: {
    paiement_recu: 'convertie',
    expiree: 'expiree',
    figee: 'figee_resiliation',
    commande_caduque: 'active',
    commande_caduque_hors_fenetre: 'expiree',
  },
  convertie: { expiree: 'expiree', figee: 'figee_resiliation' },
  figee_resiliation: { expiree: 'expiree' },
  invalidee: {},
  perdue: {},
  perimee: {},
  expiree: {},
  annulee: {},
};
/** W19 (3) : ce qu'un conseiller ne peut pas, en plus de la file réservée aux apporteurs. */
const REFUS_CONSEILLER = [
  'deposee',
  'deposee_en_file',
  'confirmee_tacitement',
  'non_confirmee',
  'non_confirmee_par_courriel',
  'anomalie_confirmee',
  'figee',
  'retiree',
  'file_expiree',
  'redeclaree',
];
const REFUS_APPORTEUR = ['prise_en_charge'];

const PORTEURS: TypePorteur[] = ['apporteur', 'conseiller'];

function juger(de: string | null, transition: string, porteur: TypePorteur): string {
  try {
    return transitionnerAttribution({
      de: de as EtatAttribution | null,
      transition: transition as TransitionAttribution,
      porteur,
    });
  } catch (e) {
    if (e instanceof ErreurTransitionAttribution) return `refus:${e.code}`;
    throw e;
  }
}

function attendu(de: string | null, transition: string, porteur: TypePorteur): string {
  if (porteur === 'conseiller' && REFUS_CONSEILLER.includes(transition)) {
    const existe =
      de === null ? transition in NAISSANCES : ATTENDUE[de]?.[transition] !== undefined;
    if (existe) return 'refus:refusee_au_porteur';
  }
  if (porteur === 'apporteur' && REFUS_APPORTEUR.includes(transition) && de === null) {
    return 'refus:refusee_au_porteur';
  }
  if (de === null) return NAISSANCES[transition] ?? 'refus:naissance_refusee';
  return ATTENDUE[de]?.[transition] ?? 'refus:transition_refusee';
}

describe('REQ-QA-004 — l’exhaustivité de la matrice (partners:transitions:exhaustive)', () => {
  it('REQ-DM-006 : les treize états de l’enum, ni plus ni moins, et la table attendue les couvre', () => {
    expect([...ETATS_ATTRIBUTION].sort()).toEqual(Object.values(EtatAttribution).sort());
    expect(Object.keys(ATTENDUE).sort()).toEqual([...ETATS_ATTRIBUTION].sort());
    expect(Object.keys(TRANSITIONS_ATTRIBUTION).sort()).toEqual([...ETATS_ATTRIBUTION].sort());
  });

  it('REQ-DM-006 : EVENEMENTS_ATTRIBUTION est exactement l’union des naissances et des flèches', () => {
    const fleches = new Set<string>(Object.keys(NAISSANCES_ATTRIBUTION));
    for (const e of ETATS_ATTRIBUTION) {
      for (const t of Object.keys(TRANSITIONS_ATTRIBUTION[e])) fleches.add(t);
    }
    expect([...EVENEMENTS_ATTRIBUTION].sort()).toEqual([...fleches].sort());
    expect(new Set(EVENEMENTS_ATTRIBUTION).size).toBe(EVENEMENTS_ATTRIBUTION.length);
    const attendus = new Set([
      ...Object.keys(NAISSANCES),
      ...Object.values(ATTENDUE).flatMap((t) => Object.keys(t)),
    ]);
    expect([...EVENEMENTS_ATTRIBUTION].sort()).toEqual([...attendus].sort());
  });

  it('REQ-QA-004 : CHAQUE triplet (état ou naissance, transition, porteur) rend l’état attendu ou le refus nommé', () => {
    let cellules = 0;
    for (const de of [null, ...ETATS_ATTRIBUTION]) {
      for (const t of EVENEMENTS_ATTRIBUTION) {
        for (const p of PORTEURS) {
          expect(juger(de, t, p), `${String(de)} × ${t} × ${p}`).toBe(attendu(de, t, p));
          cellules += 1;
        }
      }
    }
    expect(cellules).toBe((ETATS_ATTRIBUTION.length + 1) * EVENEMENTS_ATTRIBUTION.length * 2);
  });
});

describe('REQ-DM-006 — un couple absent lève une erreur typée qui le nomme, et rien n’est rendu', () => {
  it('REQ-DM-006 : TÉMOIN — perdue × confirmee est refusé, et l’erreur nomme le couple', () => {
    expect(() =>
      transitionnerAttribution({ de: 'perdue', transition: 'confirmee', porteur: 'apporteur' })
    ).toThrow(/transition_refusee : perdue × confirmee/);
  });

  it('REQ-DM-006 : TÉMOIN — un devis signé pendant provisoire n’a PAS de flèche', () => {
    expect(juger('provisoire', 'devis_signe', 'apporteur')).toBe('refus:transition_refusee');
  });

  it('REQ-DM-006 : une valeur inconnue est refusée, et nommée bornée', () => {
    expect(juger('inconnu', 'confirmee', 'apporteur')).toBe('refus:etat_inconnu');
    expect(juger('active', 'x'.repeat(500), 'apporteur')).toBe('refus:transition_inconnue');
    expect(juger('active', 'rdv_pris', 'autre' as TypePorteur)).toBe('refus:porteur_inconnu');
    try {
      transitionnerAttribution({
        de: 'active',
        transition: 'x'.repeat(500) as TransitionAttribution,
        porteur: 'apporteur',
      });
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(120);
    }
  });

  it('REQ-DM-004 : TÉMOIN — la file ne promeut rien : aucune flèche en_attente → un état occupant', () => {
    for (const vers of Object.values(TRANSITIONS_ATTRIBUTION.en_attente)) {
      expect(['annulee', 'expiree']).toContain(vers);
    }
  });
});

describe('REQ-SEC-042 — W19 : le conseiller, un témoin par refus', () => {
  it.each(REFUS_CONSEILLER)('REQ-SEC-042 : TÉMOIN — %s est refusé au conseiller', (t) => {
    const de = t in NAISSANCES ? null : Object.keys(ATTENDUE).find((e) => ATTENDUE[e]![t]);
    expect(de).not.toBeUndefined();
    expect(juger(de ?? null, t, 'conseiller')).toBe('refus:refusee_au_porteur');
    expect(juger(de ?? null, t, 'apporteur')).not.toMatch(/^refus/);
  });

  it('REQ-SEC-042 : la prise en charge naît provisoire, comme un dépôt — et elle est refusée à un apporteur', () => {
    expect(juger(null, 'prise_en_charge', 'conseiller')).toBe('provisoire');
    expect(juger(null, 'deposee', 'apporteur')).toBe('provisoire');
    expect(juger(null, 'prise_en_charge', 'apporteur')).toBe('refus:refusee_au_porteur');
  });

  it('REQ-SEC-042 : la liste exportée des refus au conseiller est celle de W19', () => {
    expect([...REFUSEES_AU_CONSEILLER].sort()).toEqual([...REFUS_CONSEILLER].sort());
  });
});

/** Le domaine compte en instants (ms) : on les écrit depuis des dates ISO lisibles. */
const iso = (t: string) => Date.parse(t);
const T0 = iso('2026-10-02T10:00:00.000Z');
const plus = (d: number, jours: number) => d + jours * MS_PAR_JOUR;
const AVANT = {
  premierContactAt: null,
  peremptionSuspendueAt: null,
  confirmeeAt: null,
  fenetreFinAt: null,
  peremptionAt: null,
} as const;

describe('REQ-DM-007 — les effets recalculés à chaque transition', () => {
  it('REQ-DM-007 : à la confirmation, confirmeeAt et fenetreFinAt = + FENETRE_MOIS mois, en heure de Paris', () => {
    const e = effetsDeTransition(AVANT, 'confirmee', 'active', T0);
    expect(e.confirmeeAt).toEqual(T0);
    expect(SEUILS.FENETRE_MOIS.valeur).toBe(6);
    expect(e.fenetreFinAt).toEqual(iso('2027-04-02T10:00:00.000Z'));
  });

  it('REQ-DM-007 : le dernier jour d’un mois plus court est pris quand le jour n’existe pas', () => {
    const e = effetsDeTransition(AVANT, 'confirmee', 'active', iso('2026-08-31T10:00:00.000Z'));
    expect(e.fenetreFinAt).toEqual(iso('2027-02-28T11:00:00.000Z'));
  });

  it('REQ-DM-007 : TÉMOIN — un mois d’arrivée en DÉCEMBRE : sa longueur se lit sur janvier de l’année suivante', () => {
    // Juin 30 (heure d'été) + 6 mois = 30 décembre (heure d'hiver) : 12 h à Paris, 11 h UTC.
    const e = effetsDeTransition(AVANT, 'confirmee', 'active', iso('2026-06-30T10:00:00.000Z'));
    expect(e.fenetreFinAt).toEqual(iso('2026-12-30T11:00:00.000Z'));
    // Le 31 décembre existe : il est gardé, jamais ramené au 30.
    expect(ajouterMoisParis(iso('2025-12-31T11:00:00.000Z'), 12)).toBe(
      iso('2026-12-31T11:00:00.000Z')
    );
  });

  it('REQ-DM-007 : un mois d’arrivée hors décembre lit sa longueur sur le mois suivant de la même année', () => {
    // Novembre a 30 jours : le 31 mai + 6 mois devient le 30 novembre.
    expect(ajouterMoisParis(iso('2026-05-31T10:00:00.000Z'), 6)).toBe(
      iso('2026-11-30T11:00:00.000Z')
    );
  });

  it('REQ-DM-007 : TÉMOIN — confirmée sans premier contact à J+200 → peremptionAt nul', () => {
    const e = effetsDeTransition(AVANT, 'confirmee_tacitement', 'active', plus(T0, 200));
    expect(e.peremptionAt).toBeNull();
  });

  it('REQ-DM-007 : TÉMOIN — premier contact posé à J+200 → péremption à J+290', () => {
    const contact = plus(T0, 200);
    const e = effetsDeTransition(
      { ...AVANT, premierContactAt: contact },
      'confirmee',
      'active',
      contact
    );
    expect(e.peremptionAt).toEqual(plus(T0, 200 + SEUILS.PEREMPTION_JOURS.valeur));
  });

  it('REQ-DM-007 : TÉMOIN — le marqueur posé neutralise le chrono', () => {
    const e = effetsDeTransition(
      { ...AVANT, premierContactAt: T0, peremptionSuspendueAt: T0 },
      'confirmee',
      'active',
      T0
    );
    expect(e.peremptionAt).toBeNull();
  });

  it('REQ-DM-007 : dès qu’une suite existe (rdv_pris et après), peremptionAt est nul', () => {
    const avant = { ...AVANT, premierContactAt: T0, peremptionAt: plus(T0, 90) };
    for (const [t, vers] of [
      ['rdv_pris', 'rdv_pris'],
      ['devis_envoye', 'proposition'],
      ['devis_signe', 'signee'],
    ] as const) {
      expect(effetsDeTransition(avant, t, vers, T0).peremptionAt).toBeNull();
    }
  });

  it('REQ-DM-022 : TÉMOIN — la caducité d’une commande ne recalcule rien : fenêtre et confirmation gardées, péremption nulle', () => {
    const avant = {
      ...AVANT,
      premierContactAt: T0,
      confirmeeAt: T0,
      fenetreFinAt: plus(T0, 180),
      peremptionAt: null,
    };
    const e = effetsDeTransition(avant, 'commande_caduque', 'active', plus(T0, 30));
    expect(e).toEqual({ confirmeeAt: T0, fenetreFinAt: plus(T0, 180), peremptionAt: null });
  });

  it('REQ-DM-022 : la caducité choisit son code selon la fenêtre — jamais l’appelant', () => {
    const fin = plus(T0, 180);
    expect(codeDeCaducite(fin, plus(T0, 179))).toBe('commande_caduque');
    expect(codeDeCaducite(fin, fin)).toBe('commande_caduque_hors_fenetre');
    expect(codeDeCaducite(fin, plus(T0, 181))).toBe('commande_caduque_hors_fenetre');
  });
});

describe('REQ-DM-006 — la charge du journal lit la matrice', () => {
  const charge = CHARGES_PAR_TYPE.attribution_etat_modifie;
  const acteur = { par: 'systeme' } as const;

  it('REQ-DM-006 : chaque code de la matrice est admis, un code inconnu refusé', () => {
    for (const transition of EVENEMENTS_ATTRIBUTION) {
      const de = transition in NAISSANCES_ATTRIBUTION ? null : 'active';
      expect(charge.safeParse({ de, vers: 'active', transition, acteur }).success, transition).toBe(
        true
      );
    }
    expect(
      charge.safeParse({ de: 'active', vers: 'perdue', transition: 'inventee', acteur }).success
    ).toBe(false);
  });

  it('REQ-DM-006 : la charge est fermée, et le lien d’intérêt s’écrit declare ou non_declare', () => {
    const base = { de: null, vers: 'provisoire', transition: 'deposee', acteur };
    expect(charge.safeParse({ ...base, lienInteret: 'declare' }).success).toBe(true);
    expect(charge.safeParse({ ...base, lienInteret: true }).success).toBe(false);
    expect(charge.safeParse({ ...base, siren: '552100554' }).success).toBe(false);
  });

  it('REQ-DM-006 : de est nul si et seulement si la transition est une naissance', () => {
    expect(
      charge.safeParse({ de: 'active', vers: 'provisoire', transition: 'deposee', acteur }).success
    ).toBe(false);
    expect(
      charge.safeParse({ de: null, vers: 'active', transition: 'confirmee', acteur }).success
    ).toBe(false);
  });

  it('REQ-SEC-042 : attribution_porteur_reaffecte — de conseiller à conseiller, de ≠ vers, aucune donnée de personne', () => {
    const p = CHARGES_PAR_TYPE.attribution_porteur_reaffecte;
    const a = { type: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-000000000001' } as const;
    const b = { type: 'utilisateur_console', id: '0190f0a0-0000-7000-8000-000000000002' } as const;
    const acteurConsole = { par: 'utilisateur_console', id: a.id } as const;
    expect(p.safeParse({ de: a, vers: b, acteur: acteurConsole }).success).toBe(true);
    expect(p.safeParse({ de: a, vers: a, acteur: acteurConsole }).success).toBe(false);
    expect(p.safeParse({ de: a, vers: b, acteur: acteurConsole, motif: 'x' }).success).toBe(false);
  });

  it.each([
    ['un apporteur en de', 'de'],
    ['un apporteur en vers', 'vers'],
  ] as const)(
    'REQ-SEC-042 : TÉMOIN — attribution_porteur_reaffecte refuse %s (porteur_non_conseiller)',
    (_quoi, cote) => {
      const p = CHARGES_PAR_TYPE.attribution_porteur_reaffecte;
      const conseiller = {
        type: 'utilisateur_console',
        id: '0190f0a0-0000-7000-8000-000000000001',
      } as const;
      const apporteur = { type: 'apporteur', id: '0190f0a0-0000-7000-8000-000000000003' } as const;
      const charge = {
        de: cote === 'de' ? apporteur : conseiller,
        vers: cote === 'vers' ? apporteur : conseiller,
        acteur: { par: 'utilisateur_console', id: conseiller.id },
      };
      const r = p.safeParse(charge);
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toContainEqual([
        cote,
        'porteur_non_conseiller',
      ]);
    }
  );
});

/**
 * LES MODULES RECHARGÉS. La matrice, ses listes et les charges du journal sont évalués AU
 * CHARGEMENT : importés une fois en tête de fichier, ils seraient lus avant que l'outil de mutation
 * n'active son mutant (le patron des témoins du relais de courriel). Ces témoins vident le cache
 * des modules, réimportent la source, et jugent chaque valeur à sa forme LITTÉRALE exacte.
 */
type ModuleMachine = typeof import('../../../src/domain/attribution/machine');
type ModuleCharges = typeof import('../../../src/domain/evenement/charges');
async function machineRechargee(): Promise<ModuleMachine> {
  vi.resetModules();
  return import('../../../src/domain/attribution/machine');
}
async function chargesRechargees(): Promise<ModuleCharges> {
  vi.resetModules();
  return import('../../../src/domain/evenement/charges');
}

describe('REQ-QA-004 — la matrice rechargée, à la valeur près', () => {
  it('REQ-QA-004 : les treize états, les vingt-cinq transitions et les naissances, dans cet ordre', async () => {
    const m = await machineRechargee();
    expect(m.ETATS_ATTRIBUTION).toEqual([
      'en_attente',
      'provisoire',
      'active',
      'rdv_pris',
      'proposition',
      'signee',
      'convertie',
      'figee_resiliation',
      'invalidee',
      'perdue',
      'perimee',
      'expiree',
      'annulee',
    ]);
    expect(m.EVENEMENTS_ATTRIBUTION).toEqual([
      'deposee',
      'deposee_en_file',
      'prise_en_charge',
      'retiree',
      'file_expiree',
      'redeclaree',
      'confirmee',
      'confirmee_par_courriel',
      'confirmee_tacitement',
      'non_confirmee',
      'non_confirmee_par_courriel',
      'anomalie_confirmee',
      'annulee_par_apporteur',
      'annulee_par_la_console',
      'liberee_sans_confirmation',
      'figee',
      'rdv_pris',
      'devis_envoye',
      'devis_signe',
      'perdue',
      'perimee',
      'expiree',
      'paiement_recu',
      'commande_caduque',
      'commande_caduque_hors_fenetre',
    ]);
    expect(m.NAISSANCES_ATTRIBUTION).toEqual(NAISSANCES);
  });

  it('REQ-QA-004 : TÉMOIN — la matrice rechargée égale la table attendue, cellule par cellule', async () => {
    const m = await machineRechargee();
    expect(m.TRANSITIONS_ATTRIBUTION).toEqual(ATTENDUE);
  });

  it('REQ-SEC-042 : les refus au conseiller, rechargés, à la valeur près', async () => {
    const m = await machineRechargee();
    expect(m.REFUSEES_AU_CONSEILLER).toEqual([
      'deposee',
      'deposee_en_file',
      'retiree',
      'file_expiree',
      'redeclaree',
      'confirmee_tacitement',
      'non_confirmee',
      'non_confirmee_par_courriel',
      'anomalie_confirmee',
      'figee',
    ]);
  });

  it('REQ-DM-006 : TÉMOIN — les erreurs rechargées : nom, code et détail exacts', async () => {
    const m = await machineRechargee();
    const erreur = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return e as InstanceType<ModuleMachine['ErreurTransitionAttribution']>;
      }
      throw new Error('aucune erreur');
    };
    const refusApporteur = erreur(() =>
      m.transitionnerAttribution({ de: null, transition: 'prise_en_charge', porteur: 'apporteur' })
    );
    expect(refusApporteur.name).toBe('ErreurTransitionAttribution');
    expect(refusApporteur.code).toBe('refusee_au_porteur');
    expect(refusApporteur.message).toBe(
      'refusee_au_porteur : naissance × prise_en_charge × apporteur'
    );
    expect(
      erreur(() =>
        m.transitionnerAttribution({ de: 'active', transition: 'figee', porteur: 'conseiller' })
      ).message
    ).toBe('refusee_au_porteur : active × figee × conseiller');
    expect(
      erreur(() =>
        m.transitionnerAttribution({ de: null, transition: 'retiree', porteur: 'apporteur' })
      ).message
    ).toBe('naissance_refusee : naissance × retiree');
    expect(
      erreur(() =>
        m.transitionnerAttribution({
          de: 'x'.repeat(80) as never,
          transition: 'figee',
          porteur: 'apporteur',
        })
      ).message
    ).toBe(`etat_inconnu : ${'x'.repeat(64)}`);
    expect(
      erreur(() =>
        m.transitionnerAttribution({ de: 'active', transition: 'z' as never, porteur: 'apporteur' })
      ).message
    ).toBe('transition_inconnue : z');
    expect(
      erreur(() =>
        m.transitionnerAttribution({ de: 'active', transition: 'figee', porteur: 'autre' as never })
      ).message
    ).toBe('porteur_inconnu : autre');
    // Les deux porteurs connus passent.
    expect(
      m.transitionnerAttribution({ de: null, transition: 'deposee', porteur: 'apporteur' })
    ).toBe('provisoire');
    expect(
      m.transitionnerAttribution({ de: null, transition: 'prise_en_charge', porteur: 'conseiller' })
    ).toBe('provisoire');
  });
});

describe('REQ-DM-006 — les charges rechargées, à la valeur près', () => {
  const acteur = { par: 'systeme' } as const;
  const conseillerA = {
    type: 'utilisateur_console',
    id: '0190f0a0-0000-7000-8000-000000000001',
  } as const;
  const conseillerB = {
    type: 'utilisateur_console',
    id: '0190f0a0-0000-7000-8000-000000000002',
  } as const;
  const issues = (r: {
    success: boolean;
    error?: { issues: { path: (string | number)[]; message: string }[] };
  }) => (r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]);

  it('REQ-DM-041 : les formes rechargées — empreinte ancrée aux deux bouts, montant entier, horodatage', async () => {
    const c = await chargesRechargees();
    expect(c.HASH_HEX_64.source).toBe('^[0-9a-f]{64}$');
    expect(c.FORMES.empreinte().safeParse('a'.repeat(64)).success).toBe(true);
    expect(c.FORMES.empreinte().safeParse('a'.repeat(65)).success).toBe(false);
    expect(c.FORMES.empreinte().safeParse(`x${'a'.repeat(64)}`).success).toBe(false);
    expect(c.FORMES.montantCents().safeParse(12).success).toBe(true);
    expect(c.FORMES.montantCents().safeParse(1.5).success).toBe(false);
    expect(c.FORMES.horodatage().safeParse('2026-10-02T12:00:00.000Z').success).toBe(true);
    expect(c.FORMES.horodatage().safeParse('hier').success).toBe(false);
  });

  it('REQ-DM-024 : la genèse et la purge rechargées — l’algorithme exigé, l’acteur système nommé', async () => {
    const c = await chargesRechargees();
    expect(
      c.CHARGES_PAR_TYPE.journal_ouvert.safeParse({ algorithme: 'sha256-jcs-v1' }).success
    ).toBe(true);
    expect(c.CHARGES_PAR_TYPE.journal_ouvert.safeParse({}).success).toBe(false);
    const purge = c.CHARGES_PAR_TYPE.attribution_contact_purge;
    expect(purge.safeParse({ purgeAt: '2026-10-02T12:00:00.000Z', acteur }).success).toBe(true);
    expect(
      issues(
        purge.safeParse({
          purgeAt: '2026-10-02T12:00:00.000Z',
          acteur: { par: 'apporteur', id: conseillerA.id },
        })
      )
    ).toEqual([['acteur', 'acteur_systeme_attendu']]);
  });

  it('REQ-DM-006 : TÉMOIN — la transition rechargée : le lien d’intérêt aux deux valeurs, la naissance nommée', async () => {
    const c = await chargesRechargees();
    const etat = c.CHARGES_PAR_TYPE.attribution_etat_modifie;
    const base = { de: null, vers: 'provisoire', transition: 'deposee', acteur };
    expect(etat.safeParse({ ...base, lienInteret: 'declare' }).success).toBe(true);
    expect(etat.safeParse({ ...base, lienInteret: 'non_declare' }).success).toBe(true);
    expect(etat.safeParse({ ...base, lienInteret: 'peut_etre' }).success).toBe(false);
    expect(issues(etat.safeParse({ ...base, de: 'active' }))).toEqual([
      ['de', 'naissance_incoherente'],
    ]);
    const susp = c.CHARGES_PAR_TYPE.attribution_peremption_suspendue;
    expect(susp.safeParse({ acteur, suspendueAt: '2026-10-02T12:00:00.000Z' }).success).toBe(true);
    expect(susp.safeParse({ acteur }).success).toBe(false);
  });

  it('REQ-SEC-042 : TÉMOIN — la réaffectation rechargée : chaque refus nommé à son chemin', async () => {
    const c = await chargesRechargees();
    const p = c.CHARGES_PAR_TYPE.attribution_porteur_reaffecte;
    const acteurConsole = { par: 'utilisateur_console', id: conseillerA.id } as const;
    expect(p.safeParse({ de: conseillerA, vers: conseillerB, acteur: acteurConsole }).success).toBe(
      true
    );
    expect(
      issues(p.safeParse({ de: conseillerA, vers: conseillerA, acteur: acteurConsole }))
    ).toEqual([['vers', 'meme_porteur']]);
    // Un apporteur est une forme ADMISE du porteur, refusée par le raffinement — pas par l'enum.
    const apporteur = { type: 'apporteur', id: conseillerA.id } as const;
    expect(
      issues(p.safeParse({ de: apporteur, vers: conseillerB, acteur: acteurConsole }))
    ).toEqual([['de', 'porteur_non_conseiller']]);
    // Même identifiant, types différents : ce n'est pas le même porteur.
    expect(
      issues(p.safeParse({ de: conseillerA, vers: apporteur, acteur: acteurConsole }))
    ).toEqual([['vers', 'porteur_non_conseiller']]);
  });
});
