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
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
import { ETATS_OCCUPANTS } from '../../../src/domain/attribution/etats';

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
    anteriorite_etablie: 'annulee',
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
    anteriorite_etablie: 'annulee',
  },
  rdv_pris: {
    devis_envoye: 'proposition',
    devis_signe: 'signee',
    perdue: 'perdue',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    figee: 'figee_resiliation',
    anteriorite_etablie: 'annulee',
  },
  proposition: {
    devis_signe: 'signee',
    perdue: 'perdue',
    expiree: 'expiree',
    anomalie_confirmee: 'invalidee',
    figee: 'figee_resiliation',
    anteriorite_etablie: 'annulee',
  },
  signee: {
    paiement_recu: 'convertie',
    expiree: 'expiree',
    figee: 'figee_resiliation',
    commande_caduque: 'active',
    commande_caduque_hors_fenetre: 'expiree',
    anteriorite_etablie: 'annulee',
  },
  convertie: { expiree: 'expiree', figee: 'figee_resiliation', anteriorite_etablie: 'annulee' },
  figee_resiliation: { expiree: 'expiree', anteriorite_etablie: 'annulee' },
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

describe('REQ-DM-006 — l’antériorité établie après coup annule, depuis chaque état occupant', () => {
  it.each(ETATS_OCCUPANTS)(
    'REQ-DM-006 : TÉMOIN — %s × anteriorite_etablie → annulee, pour un apporteur comme pour un conseiller',
    (de) => {
      for (const porteur of PORTEURS) {
        expect(transitionnerAttribution({ de, transition: 'anteriorite_etablie', porteur })).toBe(
          'annulee'
        );
      }
    }
  );

  it('REQ-DM-006 : un état qui n’occupe plus ne s’annule pas pour antériorité', () => {
    for (const de of ETATS_ATTRIBUTION.filter(
      (e) => !(ETATS_OCCUPANTS as readonly string[]).includes(e)
    )) {
      expect(() =>
        transitionnerAttribution({ de, transition: 'anteriorite_etablie', porteur: 'apporteur' })
      ).toThrow(ErreurTransitionAttribution);
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

/** La référence d'un fait fondateur : l'EMPREINTE de l'identifiant d'axion-ia, et sa date. */
const FACTURE = { nature: 'facture', ref: 'a'.repeat(64), le: '2026-12-01T10:00:00.000Z' } as const;
const DEVIS = { nature: 'devis', ref: 'b'.repeat(64), le: '2026-11-15T10:00:00.000Z' } as const;

describe('REQ-DM-006 — la charge du journal lit la matrice', () => {
  const charge = CHARGES_PAR_TYPE.attribution_etat_modifie;
  const acteur = { par: 'systeme' } as const;

  it('REQ-DM-006 : chaque code de la matrice est admis, un code inconnu refusé', () => {
    for (const transition of EVENEMENTS_ATTRIBUTION) {
      const de = transition in NAISSANCES_ATTRIBUTION ? null : 'active';
      const critere =
        transition === 'anteriorite_etablie'
          ? { critere: 'cliente', fait: FACTURE }
          : transition === 'annulee_par_la_console'
            ? { motifAnnulation: 'declaration_en_double' }
            : {};
      expect(
        charge.safeParse({ de, vers: 'active', transition, acteur, ...critere }).success,
        transition
      ).toBe(true);
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

  it('REQ-DM-006 : TÉMOIN — anteriorite_etablie porte son critère, en enum fermé ; aucune autre transition n’en porte', () => {
    const base = { de: 'signee', vers: 'annulee', transition: 'anteriorite_etablie', acteur };
    expect(charge.safeParse({ ...base, critere: 'cliente', fait: FACTURE }).success).toBe(true);
    for (const critere of ['devis', 'devis_signe']) {
      expect(charge.safeParse({ ...base, critere, fait: DEVIS }).success, critere).toBe(true);
    }
    expect(charge.safeParse(base).success).toBe(false);
    expect(charge.safeParse({ ...base, critere: 'financeur', fait: FACTURE }).success).toBe(false);
    expect(
      charge.safeParse({
        de: 'active',
        vers: 'perdue',
        transition: 'perdue',
        acteur,
        critere: 'cliente',
      }).success
    ).toBe(false);
  });

  it('REQ-DM-006 : TÉMOIN — la RÉFÉRENCE du fait fondateur : nature, référence opaque, date ; exigée, et accordée au critère', () => {
    const base = { de: 'active', vers: 'annulee', transition: 'anteriorite_etablie', acteur };
    // sans fait, ou avec un fait sur une autre transition : refusé
    expect(charge.safeParse({ ...base, critere: 'cliente' }).success).toBe(false);
    expect(
      charge.safeParse({
        de: 'active',
        vers: 'perdue',
        transition: 'perdue',
        acteur,
        fait: FACTURE,
      }).success
    ).toBe(false);
    // le critère dit la nature du fait : cliente ↔ facture, devis et devis_signe ↔ devis
    expect(charge.safeParse({ ...base, critere: 'cliente', fait: DEVIS }).success).toBe(false);
    expect(charge.safeParse({ ...base, critere: 'devis_signe', fait: FACTURE }).success).toBe(
      false
    );
    // aucune donnée de personne : une référence opaque, une date ISO, rien d'autre
    // l'identifiant en clair, un nom, une adresse, une empreinte mal formée : refusés
    for (const ref of ['', 'fac_7Hk2-9', 'Jean Dupont', 'a@b.fr', 'A'.repeat(64), 'a'.repeat(63)]) {
      expect(
        charge.safeParse({ ...base, critere: 'cliente', fait: { ...FACTURE, ref } }).success,
        ref
      ).toBe(false);
    }
    expect(
      charge.safeParse({ ...base, critere: 'cliente', fait: { ...FACTURE, le: 'hier' } }).success
    ).toBe(false);
    expect(
      charge.safeParse({ ...base, critere: 'cliente', fait: { ...FACTURE, siren: '552100554' } })
        .success
    ).toBe(false);
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
  it('REQ-QA-004 : les treize états, les vingt-six transitions et les naissances, dans cet ordre', async () => {
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
      'anteriorite_etablie',
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

/**
 * L'ÉCRIVAIN, en processus. Le test d'intégration juge `transitionner.ts` contre une vraie base, mais
 * l'outil de mutation ne joue que les tests unitaires : ici, un client de transaction SIMULÉ reçoit
 * le verrou, la mise à jour et l'événement, et chaque objet est comparé à sa valeur EXACTE.
 */
const journalSimule = vi.hoisted(() => ({ ajouterEvenement: vi.fn() }));
vi.mock('../../../src/server/evenement/journal', () => journalSimule);

type LigneSimulee = {
  statut: string;
  apporteur_id: string | null;
  lien_interet_declare: boolean;
  premier_contact_at: Date | null;
  peremption_suspendue_at: Date | null;
  confirmee_at: Date | null;
  fenetre_fin_at: Date | null;
  peremption_at: Date | null;
};

const ID = '0190f0a0-0000-7000-8000-0000000000a1';
const APPORTEUR = '0190f0a0-0000-7000-8000-0000000000b2';
const MAINTENANT = new Date('2026-10-02T10:00:00.000Z');
const ACTEUR = { par: 'systeme' } as const;

function ligneDe(champs: Partial<LigneSimulee>): LigneSimulee {
  return {
    statut: 'provisoire',
    apporteur_id: APPORTEUR,
    lien_interet_declare: false,
    premier_contact_at: null,
    peremption_suspendue_at: null,
    confirmee_at: null,
    fenetre_fin_at: null,
    peremption_at: null,
    ...champs,
  };
}

/** La date du dépôt que le banc rend (DM-25) ; un témoin la fixe autour du fait fondateur. */
let deposeeDuBanc = new Date('2027-01-01T00:00:00.000Z');

/** Un client de transaction : `$queryRaw` rend les lignes de la file, une par verrou. */
function txSimule(lignes: LigneSimulee[]) {
  const verrous: { sql: string; valeurs: unknown[] }[] = [];
  const mises: unknown[] = [];
  const file = [...lignes];
  const tx = {
    $queryRaw: async (gabarit: TemplateStringsArray, ...valeurs: unknown[]) => {
      verrous.push({ sql: gabarit.join('$').replace(/\s+/g, ' ').trim(), valeurs });
      const l = file.shift();
      return l ? [l] : [];
    },
    attribution: {
      update: async (arg: unknown) => {
        mises.push(arg);
        return {};
      },
      // DM-55 : la libération de l'occupation lit le SIREN ; sans ligne, aucun rang n'est notifié.
      // DM-25 : l'antériorité lit la date du dépôt, POSTÉRIEURE aux faits du banc par défaut.
      findUnique: async (q: { select?: { deposeeAt?: boolean } }) =>
        q.select?.deposeeAt ? { deposeeAt: deposeeDuBanc } : null,
    },
    // DM-25 : l'antériorité établie écrit sa notification ; le banc partagé l'accepte sans la juger.
    notificationEspace: { create: async () => ({}) },
  };
  return { tx: tx as never, verrous, mises };
}

const SQL_DU_VERROU =
  'SELECT statut::text AS statut, apporteur_id::text AS apporteur_id, lien_interet_declare, ' +
  'premier_contact_at, peremption_suspendue_at, confirmee_at, fenetre_fin_at, peremption_at ' +
  'FROM attributions WHERE id = $::uuid FOR UPDATE';

type EvenementEcrit = {
  charge: { de: unknown; vers: unknown; transition: unknown; lienInteret: unknown };
};
const evenementsEcrits = (): EvenementEcrit[] =>
  journalSimule.ajouterEvenement.mock.calls.map((c) => c[1] as EvenementEcrit);

async function ecrivain() {
  return import('../../../src/server/attribution/transitionner');
}

async function refusDe(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string };
  }
  throw new Error('aucun refus');
}

describe('REQ-DM-006 — l’écrivain des transitions, en processus (client simulé)', () => {
  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
  });

  it('REQ-DM-006 : TÉMOIN — la confirmation verrouille la ligne, écrit l’état et la fenêtre, puis l’événement, à la valeur près', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx, verrous, mises } = txSimule([ligneDe({})]);
    const r = await transitionnerUneAttribution(tx, {
      attributionId: ID,
      transition: 'confirmee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(r).toStrictEqual({ de: 'provisoire', vers: 'active' });
    expect(verrous).toStrictEqual([{ sql: SQL_DU_VERROU, valeurs: [ID] }]);
    expect(mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'active',
          confirmeeAt: MAINTENANT,
          fenetreFinAt: new Date('2027-04-02T10:00:00.000Z'),
          peremptionAt: null,
        },
      },
    ]);
    expect(journalSimule.ajouterEvenement).toHaveBeenCalledTimes(1);
    expect(journalSimule.ajouterEvenement.mock.calls[0]![0]).toBe(tx);
    expect(journalSimule.ajouterEvenement.mock.calls.map((c) => c[1])).toStrictEqual([
      {
        type: 'attribution_etat_modifie',
        agregat: 'attribution',
        agregatId: ID,
        survenuAt: MAINTENANT,
        charge: {
          de: 'provisoire',
          vers: 'active',
          transition: 'confirmee',
          acteur: ACTEUR,
          lienInteret: 'non_declare',
        },
      },
    ]);
  });

  it('REQ-DM-031 : TÉMOIN — sortir de la file libère le rang, et un état LIBÉRÉ pose la purge du contact', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({ statut: 'en_attente', lien_interet_declare: true })]);
    await transitionnerUneAttribution(tx, {
      attributionId: ID,
      transition: 'retiree',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(mises).toStrictEqual([
      {
        where: { id: ID },
        data: {
          statut: 'annulee',
          rangAttente: null,
          confirmeeAt: null,
          fenetreFinAt: null,
          peremptionAt: null,
          purgeContactAt: new Date('2026-12-31T10:00:00.000Z'),
        },
      },
    ]);
    expect(evenementsEcrits()[0]!.charge.lienInteret).toBe('declare');
  });

  it('REQ-DM-006 : TÉMOIN — anteriorite_etablie, par le SYSTÈME : annulee, et l’événement porte le critère et le fait fondateur', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({ statut: 'signee' })]);
    const r = await transitionnerUneAttribution(tx, {
      attributionId: ID,
      transition: 'anteriorite_etablie',
      critere: 'devis_signe',
      fait: DEVIS,
      acteur: { par: 'systeme' },
      maintenant: MAINTENANT,
    });
    expect(r).toStrictEqual({ de: 'signee', vers: 'annulee' });
    expect((mises[0] as { data: { statut: string } }).data.statut).toBe('annulee');
    expect(evenementsEcrits()[0]!.charge).toMatchObject({
      de: 'signee',
      vers: 'annulee',
      transition: 'anteriorite_etablie',
      critere: 'devis_signe',
      fait: DEVIS,
      acteur: { par: 'systeme' },
    });
  });

  it.each([
    [
      'un utilisateur de la console',
      { par: 'utilisateur_console', id: '0190a5c0-0000-7000-8000-0000000000c1' },
    ],
    ['un apporteur', { par: 'apporteur', id: '0190a5c0-0000-7000-8000-0000000000a1' }],
  ] as const)(
    'REQ-DM-006 : TÉMOIN (sécurité) — anteriorite_etablie par %s : refusée, nommée, et RIEN n’est écrit',
    async (_, acteur) => {
      const { transitionnerUneAttribution } = await ecrivain();
      const { tx, mises } = txSimule([ligneDe({ statut: 'active' })]);
      const e = await transitionnerUneAttribution(tx, {
        attributionId: ID,
        transition: 'anteriorite_etablie',
        critere: 'cliente',
        fait: FACTURE,
        acteur,
        maintenant: MAINTENANT,
      }).catch((x: unknown) => x);
      expect((e as Error).name).toBe('ErreurTransitionAttribution');
      expect((e as { code: string }).code).toBe('acteur_refuse');
      expect(mises).toStrictEqual([]);
      expect(evenementsEcrits()).toStrictEqual([]);
    }
  );

  it.each([
    ['sans critère', 'anteriorite_etablie', { fait: FACTURE }],
    ['sans fait fondateur', 'anteriorite_etablie', { critere: 'cliente' }],
    ['un critère sur une autre transition', 'perdue', { critere: 'cliente' }],
    ['un fait sur une autre transition', 'perdue', { fait: FACTURE }],
  ] as const)(
    'REQ-DM-006 : TÉMOIN — %s : refusé avant tout verrou, nommé, et RIEN n’est écrit',
    async (_, transition, extra) => {
      const { transitionnerUneAttribution } = await ecrivain();
      const { tx, mises, verrous } = txSimule([ligneDe({ statut: 'active' })]);
      const demande: Parameters<typeof transitionnerUneAttribution>[1] = {
        attributionId: ID,
        transition,
        ...extra,
        acteur: { par: 'systeme' },
        maintenant: MAINTENANT,
      };
      const e = await transitionnerUneAttribution(tx, demande).catch((x: unknown) => x);
      expect((e as Error).name).toBe('ErreurTransitionAttribution');
      expect((e as { code: string }).code).toBe('critere_incoherent');
      expect(verrous).toStrictEqual([]);
      expect(mises).toStrictEqual([]);
      expect(evenementsEcrits()).toStrictEqual([]);
    }
  );

  it('REQ-DM-007 : les dates de la ligne passent au domaine et en reviennent, à la milliseconde', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const confirmeeAt = new Date('2026-05-01T08:00:00.000Z');
    const fenetreFinAt = new Date('2026-11-01T09:00:00.000Z');
    const { tx, mises } = txSimule([
      ligneDe({
        statut: 'active',
        apporteur_id: null,
        premier_contact_at: new Date('2026-09-30T08:00:00.000Z'),
        peremption_suspendue_at: new Date('2026-10-01T08:00:00.000Z'),
        confirmee_at: confirmeeAt,
        fenetre_fin_at: fenetreFinAt,
        peremption_at: new Date('2026-12-29T08:00:00.000Z'),
      }),
    ]);
    const r = await transitionnerUneAttribution(tx, {
      attributionId: ID,
      transition: 'rdv_pris',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    // Le porteur d'une ligne SANS apporteur est un conseiller : rdv_pris lui est permis.
    expect(r).toStrictEqual({ de: 'active', vers: 'rdv_pris' });
    expect(mises).toStrictEqual([
      {
        where: { id: ID },
        data: { statut: 'rdv_pris', confirmeeAt, fenetreFinAt, peremptionAt: null },
      },
    ]);
  });

  it('REQ-SEC-042 : TÉMOIN — une ligne sans apporteur est jugée au CONSEILLER : un refus nommé, rien d’écrit', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({ apporteur_id: null })]);
    const e = await refusDe(
      transitionnerUneAttribution(tx, {
        attributionId: ID,
        transition: 'figee',
        acteur: ACTEUR,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('refusee_au_porteur');
    expect(e.message).toBe('refusee_au_porteur : provisoire × figee × conseiller');
    expect(mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-DM-006 : TÉMOIN — une attribution introuvable est refusée `etat_inconnu`, rien d’écrit', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([]);
    const e = await refusDe(
      transitionnerUneAttribution(tx, {
        attributionId: ID,
        transition: 'confirmee',
        acteur: ACTEUR,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('etat_inconnu');
    expect(e.message).toBe('etat_inconnu : attribution introuvable');
    expect(mises).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN — la naissance est jugée contre la ligne, et journalisée sans `de`', async () => {
    const { journaliserLaNaissance } = await ecrivain();
    const { tx, verrous, mises } = txSimule([ligneDe({ lien_interet_declare: true })]);
    const vers = await journaliserLaNaissance(tx, {
      attributionId: ID,
      transition: 'deposee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(vers).toBe('provisoire');
    expect(verrous).toStrictEqual([{ sql: SQL_DU_VERROU, valeurs: [ID] }]);
    expect(mises).toStrictEqual([]);
    expect(journalSimule.ajouterEvenement.mock.calls.map((c) => c[1])).toStrictEqual([
      {
        type: 'attribution_etat_modifie',
        agregat: 'attribution',
        agregatId: ID,
        survenuAt: MAINTENANT,
        charge: {
          de: null,
          vers: 'provisoire',
          transition: 'deposee',
          acteur: ACTEUR,
          lienInteret: 'declare',
        },
      },
    ]);
  });

  it('REQ-DM-006 : TÉMOIN — une naissance dont la ligne n’est pas dans l’état d’entrée est refusée et nommée', async () => {
    const { journaliserLaNaissance } = await ecrivain();
    const { tx } = txSimule([ligneDe({ statut: 'en_attente' })]);
    const e = await refusDe(
      journaliserLaNaissance(tx, {
        attributionId: ID,
        transition: 'deposee',
        acteur: ACTEUR,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('naissance_refusee');
    expect(e.message).toBe(
      'naissance_refusee : naissance × deposee : ligne en en_attente, attendu provisoire'
    );
    expect(journalSimule.ajouterEvenement).not.toHaveBeenCalled();
  });

  it('REQ-DM-007 : la confirmation SANS commande rattachée est un seul événement', async () => {
    const { confirmerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({}), ligneDe({ statut: 'active' })]);
    const r = await confirmerUneAttribution(tx, {
      attributionId: ID,
      transition: 'confirmee_tacitement',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
      commandeValableRattachee: false,
    });
    expect(r).toStrictEqual({ vers: 'active' });
    expect(mises).toHaveLength(1);
    expect(evenementsEcrits().map((e) => e.charge.transition)).toStrictEqual([
      'confirmee_tacitement',
    ]);
  });

  it('REQ-DM-007 : TÉMOIN — avec une commande DÉJÀ rattachée, la confirmation est suivie de devis_signe : deux événements, dans cet ordre', async () => {
    const { confirmerUneAttribution } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({}), ligneDe({ statut: 'active' })]);
    const r = await confirmerUneAttribution(tx, {
      attributionId: ID,
      transition: 'confirmee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
      commandeValableRattachee: true,
    });
    expect(r).toStrictEqual({ vers: 'signee' });
    expect(mises).toHaveLength(2);
    expect(
      evenementsEcrits().map((e) => [e.charge.de, e.charge.transition, e.charge.vers])
    ).toStrictEqual([
      ['provisoire', 'confirmee', 'active'],
      ['active', 'devis_signe', 'signee'],
    ]);
  });

  it('REQ-DM-022 : TÉMOIN — une autre commande valable portée : refus nommé, rien d’écrit', async () => {
    const { constaterLaCaducite } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({ statut: 'signee' })]);
    const e = await refusDe(
      constaterLaCaducite(tx, {
        attributionId: ID,
        acteur: ACTEUR,
        maintenant: MAINTENANT,
        autreCommandeValable: true,
      })
    );
    expect(e.code).toBe('autre_commande_valable');
    expect(e.message).toBe(
      'autre_commande_valable : signee × commande_caduque : une autre commande valable est portée'
    );
    expect(mises).toStrictEqual([]);
  });

  it('REQ-DM-022 : TÉMOIN — sans fenêtre, la caducité est refusée et nommée', async () => {
    const { constaterLaCaducite } = await ecrivain();
    const { tx, mises } = txSimule([ligneDe({ statut: 'signee' })]);
    const e = await refusDe(
      constaterLaCaducite(tx, {
        attributionId: ID,
        acteur: ACTEUR,
        maintenant: MAINTENANT,
        autreCommandeValable: false,
      })
    );
    expect(e.code).toBe('transition_refusee');
    expect(e.message).toBe('transition_refusee : signee × commande_caduque');
    expect(mises).toStrictEqual([]);
  });

  it.each([
    ['une milliseconde avant la fin de la fenêtre', 1, 'commande_caduque', 'active'],
    [
      'à la fin de la fenêtre, incluse dans le « hors »',
      0,
      'commande_caduque_hors_fenetre',
      'expiree',
    ],
  ] as const)(
    'REQ-DM-022 : TÉMOIN — %s, le code est choisi par la fenêtre de la LIGNE',
    async (_q, ecartMs, code, vers) => {
      const { constaterLaCaducite } = await ecrivain();
      const fenetre = new Date(MAINTENANT.getTime() + ecartMs);
      const { tx } = txSimule([
        ligneDe({ statut: 'signee', fenetre_fin_at: fenetre }),
        ligneDe({ statut: 'signee', fenetre_fin_at: fenetre }),
      ]);
      const r = await constaterLaCaducite(tx, {
        attributionId: ID,
        acteur: ACTEUR,
        maintenant: MAINTENANT,
        autreCommandeValable: false,
      });
      expect(r).toStrictEqual({ vers });
      expect(evenementsEcrits().map((e) => e.charge.transition)).toStrictEqual([code]);
    }
  );
});

describe('REQ-DM-007 — les confirmations et la charge d’apporteur, rechargées', () => {
  const AVANT = {
    premierContactAt: null,
    peremptionSuspendueAt: null,
    confirmeeAt: null,
    fenetreFinAt: null,
    peremptionAt: null,
  };
  const T = Date.UTC(2026, 9, 2, 10);

  it.each(['confirmee', 'confirmee_par_courriel', 'confirmee_tacitement'] as const)(
    'REQ-DM-007 : TÉMOIN — %s CONFIRME : confirmeeAt à l’instant, fenêtre ouverte de six mois à Paris',
    async (transition) => {
      const m = await machineRechargee();
      const t = m.effetsDeTransition(AVANT, transition, 'active', T);
      expect(t.confirmeeAt).toBe(T);
      expect(t.fenetreFinAt).toBe(Date.UTC(2027, 3, 2, 10));
    }
  );

  it('REQ-DM-007 : une transition qui ne confirme pas laisse la fenêtre fermée', async () => {
    const m = await machineRechargee();
    const t = m.effetsDeTransition(AVANT, 'liberee_sans_confirmation', 'perimee', T);
    expect(t.confirmeeAt).toBeNull();
    expect(t.fenetreFinAt).toBeNull();
  });

  it('REQ-DM-024 : TÉMOIN — la charge rechargée d’un statut d’apporteur admet ses champs (naissance comprise)', async () => {
    const c = await chargesRechargees();
    const s = c.CHARGES_PAR_TYPE.apporteur_statut_modifie;
    expect(
      s.safeParse({ de: null, vers: 'candidat', transition: 'creer', acteur: { par: 'systeme' } })
        .success
    ).toBe(true);
    expect(
      s.safeParse({
        de: null,
        vers: 'candidat',
        transition: 'creer',
        acteur: { par: 'systeme' },
        intrus: 1,
      }).success
    ).toBe(false);
  });
});

describe('REQ-DM-006 — anteriorite_etablie n’est émise que par le passage de l’antériorité', () => {
  /**
   * Les seuls fichiers de src/ qui peuvent écrire le littéral : la machine et la charge qui le
   * déclarent, l'écrivain qui le juge, et le passage quotidien qui l'émet sur les faits projetés.
   * Aucune action libre de la console ne l'émet (lentille sécurité).
   */
  const PERMIS = [
    'src/domain/attribution/machine.ts',
    'src/domain/evenement/charges.ts',
    'src/server/attribution/transitionner.ts',
    'src/server/jobs/anteriorite-retroactive.ts',
  ];
  const sources = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) return sources(chemin);
      return /\.(ts|tsx)$/.test(e.name) ? [chemin] : [];
    });

  it('REQ-DM-006 : TÉMOIN — aucun autre fichier de src/ n’écrit « anteriorite_etablie »', () => {
    const fautifs = sources('src').filter(
      (f) => !PERMIS.includes(f) && /['"`]anteriorite_etablie['"`]/.test(readFileSync(f, 'utf8'))
    );
    expect(fautifs).toEqual([]);
  });

  it('REQ-DM-006 : contre-témoin — le motif lit bien la machine, qui le déclare', () => {
    expect(readFileSync('src/domain/attribution/machine.ts', 'utf8')).toMatch(
      /'anteriorite_etablie'/
    );
  });
});

/**
 * DM-55 (forme d'A02, conditions de la juriste et de la sécurité) : l'écrivain porte le motif d'une
 * annulation par la console et sa catégorie, réserve l'erreur de saisie de la Société à la prise en
 * charge d'un conseiller, vérifie l'anomalie confirmée qui fonde une invalidation, et écrit la
 * notification de la décision DANS la transaction, avec son événement. Le texte part après le commit.
 */
describe('REQ-DM-006 — l’écrivain porte le motif, et écrit la notification de la décision', () => {
  const ANOMALIE = '0190f0a0-0000-7000-8000-0000000000c3';
  const SIREN = '123456789';
  const RANG1 = '0190f0a0-0000-7000-8000-0000000000f6';
  const APPORTEUR_RANG1 = '0190f0a0-0000-7000-8000-0000000000f7';
  const AUTRE = '0190f0a0-0000-7000-8000-0000000000d4';
  const CONSOLE = {
    par: 'utilisateur_console',
    id: '0190f0a0-0000-7000-8000-0000000000e5',
  } as const;

  function txDM55(
    ligne: LigneSimulee,
    anomalie: {
      statut: string;
      attributionId: string | null;
      apporteurId: string | null;
    } | null = null,
    rang1: { id: string; apporteurId: string | null } | null = null
  ) {
    const base = txSimule([ligne]);
    const notifications: unknown[] = [];
    const lues: unknown[] = [];
    const filesLues: unknown[] = [];
    const attribution = (base.tx as { attribution: object }).attribution;
    const tx = Object.assign(base.tx as object, {
      attribution: {
        ...attribution,
        findUnique: async () => ({ siren: SIREN }),
        findFirst: async (arg: unknown) => {
          filesLues.push(arg);
          return rang1;
        },
      },
      notificationEspace: {
        create: async (arg: unknown) => {
          notifications.push(arg);
          return {};
        },
      },
      anomalie: {
        findUnique: async (arg: unknown) => {
          lues.push(arg);
          return anomalie;
        },
      },
    });
    return { ...base, tx: tx as never, notifications, lues, filesLues };
  }

  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '42', selfHash: 'x' });
  });

  it('REQ-DM-006 : TÉMOIN — une annulation par la console sans motif est refusée AVANT le verrou, rien n’est écrit', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({}));
    const e = await refusDe(
      transitionnerUneAttribution(t.tx, {
        attributionId: ID,
        transition: 'annulee_par_la_console',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('motif_incoherent');
    expect(t.verrous).toStrictEqual([]);
    expect(evenementsEcrits()).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN — le motif de l’article 3.3 bis sans sa catégorie est refusé ; un motif sur une autre transition aussi', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const sansCategorie = txDM55(ligneDe({}));
    expect(
      (
        await refusDe(
          transitionnerUneAttribution(sansCategorie.tx, {
            attributionId: ID,
            transition: 'annulee_par_la_console',
            acteur: CONSOLE,
            maintenant: MAINTENANT,
            motifAnnulation: 'entreprise_relevant_de_l_article_3_3_bis',
          })
        )
      ).code
    ).toBe('motif_incoherent');
    const ailleurs = txDM55(ligneDe({}));
    expect(
      (
        await refusDe(
          transitionnerUneAttribution(ailleurs.tx, {
            attributionId: ID,
            transition: 'non_confirmee',
            acteur: ACTEUR,
            maintenant: MAINTENANT,
            motifAnnulation: 'declaration_en_double',
          })
        )
      ).code
    ).toBe('motif_incoherent');
    expect(sansCategorie.verrous).toStrictEqual([]);
    expect(ailleurs.verrous).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN (face apporteur) — l’erreur de saisie de la Société sur le dépôt d’un apporteur est refusée : ni état, ni événement, ni notification', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({ apporteur_id: APPORTEUR }));
    const e = await refusDe(
      transitionnerUneAttribution(t.tx, {
        attributionId: ID,
        transition: 'annulee_par_la_console',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
        motifAnnulation: 'erreur_de_saisie_de_la_societe',
      })
    );
    expect(e.code).toBe('porteur_refuse');
    expect(t.mises).toStrictEqual([]);
    expect(evenementsEcrits()).toStrictEqual([]);
    expect(t.notifications).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN (face conseiller) — l’erreur de saisie sur la prise en charge d’un conseiller passe, sans AUCUNE notification', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({ apporteur_id: null }));
    const r = await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'annulee_par_la_console',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
      motifAnnulation: 'erreur_de_saisie_de_la_societe',
    });
    expect(r).toStrictEqual({ de: 'provisoire', vers: 'annulee' });
    expect(evenementsEcrits()[0]!.charge).toMatchObject({
      transition: 'annulee_par_la_console',
      motifAnnulation: 'erreur_de_saisie_de_la_societe',
    });
    expect(t.notifications).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN — une annulation par la console notifie l’apporteur, avec l’événement qui la fonde ; motif et catégorie sont dans la charge', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({}));
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'annulee_par_la_console',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
      motifAnnulation: 'entreprise_relevant_de_l_article_3_3_bis',
      categorieRelation: 'financeur_public',
    });
    expect(evenementsEcrits()[0]!.charge).toMatchObject({
      motifAnnulation: 'entreprise_relevant_de_l_article_3_3_bis',
      categorieRelation: 'financeur_public',
    });
    expect(t.notifications).toStrictEqual([
      {
        data: {
          apporteurId: APPORTEUR,
          cle: 'decision_attribution',
          attributionId: ID,
          evenementId: BigInt(42),
        },
      },
    ]);
  });

  it('REQ-DM-006 : une non-confirmation notifie, une confirmation ne notifie pas', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const non = txDM55(ligneDe({}));
    await transitionnerUneAttribution(non.tx, {
      attributionId: ID,
      transition: 'non_confirmee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(non.notifications).toHaveLength(1);
    const oui = txDM55(ligneDe({}));
    await transitionnerUneAttribution(oui.tx, {
      attributionId: ID,
      transition: 'confirmee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(oui.notifications).toStrictEqual([]);
  });

  it('REQ-DM-006 : TÉMOIN — une anomalie confirmée EXIGE son anomalie, refus avant le verrou', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({}));
    const e = await refusDe(
      transitionnerUneAttribution(t.tx, {
        attributionId: ID,
        transition: 'anomalie_confirmee',
        acteur: CONSOLE,
        maintenant: MAINTENANT,
      })
    );
    expect(e.code).toBe('anomalie_refusee');
    expect(t.verrous).toStrictEqual([]);
  });

  it.each([
    ['d’un autre apporteur', { statut: 'confirmee', attributionId: ID, apporteurId: AUTRE }],
    [
      'd’une autre attribution',
      { statut: 'confirmee', attributionId: AUTRE, apporteurId: APPORTEUR },
    ],
    ['non confirmée', { statut: 'ouverte', attributionId: ID, apporteurId: APPORTEUR }],
    ['introuvable', null],
  ])(
    'REQ-DM-006 : TÉMOIN (face refusée) — une anomalie %s est refusée : ni état, ni événement, ni notification',
    async (_, anomalie) => {
      const { transitionnerUneAttribution } = await ecrivain();
      const t = txDM55(ligneDe({}), anomalie);
      const e = await refusDe(
        transitionnerUneAttribution(t.tx, {
          attributionId: ID,
          transition: 'anomalie_confirmee',
          acteur: CONSOLE,
          maintenant: MAINTENANT,
          anomalieId: ANOMALIE,
        })
      );
      expect(e.code).toBe('anomalie_refusee');
      expect(t.mises).toStrictEqual([]);
      expect(evenementsEcrits()).toStrictEqual([]);
      expect(t.notifications).toStrictEqual([]);
    }
  );

  it('REQ-DM-006 : TÉMOIN (face admise) — l’anomalie confirmée de CETTE attribution et de CET apporteur : la notification la nomme, la charge du journal ne la porte pas', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({}), {
      statut: 'confirmee',
      attributionId: ID,
      apporteurId: APPORTEUR,
    });
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'anomalie_confirmee',
      acteur: CONSOLE,
      maintenant: MAINTENANT,
      anomalieId: ANOMALIE,
    });
    expect(t.lues).toStrictEqual([
      {
        where: { id: ANOMALIE },
        select: { statut: true, attributionId: true, apporteurId: true },
      },
    ]);
    expect(evenementsEcrits()[0]!.charge).not.toHaveProperty('anomalieId');
    expect(t.notifications).toStrictEqual([
      {
        data: {
          apporteurId: APPORTEUR,
          cle: 'decision_attribution',
          attributionId: ID,
          evenementId: BigInt(42),
          anomalieId: ANOMALIE,
        },
      },
    ]);
  });

  it('REQ-DM-004 : TÉMOIN — l’attribution qui QUITTE l’occupation libère le premier rang : son apporteur est notifié, sur SA ligne, avec l’événement de la libération', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({ statut: 'active' }), null, {
      id: RANG1,
      apporteurId: APPORTEUR_RANG1,
    });
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'perimee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(t.filesLues).toStrictEqual([
      {
        where: { siren: SIREN, statut: 'en_attente', rangAttente: 1 },
        select: { id: true, apporteurId: true },
      },
    ]);
    expect(t.notifications).toStrictEqual([
      {
        data: {
          apporteurId: APPORTEUR_RANG1,
          cle: 'premier_rang_libere',
          attributionId: RANG1,
          evenementId: BigInt(42),
        },
      },
    ]);
  });

  it('REQ-DM-004 : une transition qui RESTE dans l’occupation ne libère rien, et ne lit pas la file', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({ statut: 'active' }), null, {
      id: RANG1,
      apporteurId: APPORTEUR_RANG1,
    });
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'rdv_pris',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(t.filesLues).toStrictEqual([]);
    expect(t.notifications).toStrictEqual([]);
  });

  it('REQ-DM-004 : une libération sans rang 1 en attente ne notifie personne', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({ statut: 'active' }));
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'perimee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(t.notifications).toStrictEqual([]);
  });

  it('REQ-DM-004 : TÉMOIN — une décision qui libère notifie les DEUX : la décision à son apporteur, le premier rang au sien', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txDM55(ligneDe({}), null, { id: RANG1, apporteurId: APPORTEUR_RANG1 });
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'non_confirmee',
      acteur: ACTEUR,
      maintenant: MAINTENANT,
    });
    expect(
      t.notifications.map((n) => (n as { data: { cle: string; apporteurId: string } }).data)
    ).toMatchObject([
      { cle: 'decision_attribution', apporteurId: APPORTEUR },
      { cle: 'premier_rang_libere', apporteurId: APPORTEUR_RANG1 },
    ]);
  });
});

/**
 * DM-25 (juriste) : le fait fondateur de l'antériorité est ANTÉRIEUR au dépôt. Un fait daté du dépôt
 * ou après lui n'annule rien : refus nommé `fait_posterieur_au_depot`, tenu à l'écriture même.
 */
describe('REQ-DM-006 — l’antériorité ne se fonde que sur un fait ANTÉRIEUR au dépôt (DM-25)', () => {
  const DEPOT = new Date('2026-11-15T10:00:00.000Z');
  const ms = (d: Date, delta: number) => new Date(d.getTime() + delta).toISOString();

  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '1', selfHash: 'x' });
    deposeeDuBanc = DEPOT;
  });

  it.each([
    ['daté du dépôt même', 0],
    ['une milliseconde après le dépôt', 1],
  ])(
    'REQ-DM-006 : TÉMOIN — un fait fondateur %s : refus nommé, et RIEN n’est écrit',
    async (_, delta) => {
      const { transitionnerUneAttribution } = await ecrivain();
      const { tx, mises } = txSimule([ligneDe({ statut: 'signee' })]);
      const e = await refusDe(
        transitionnerUneAttribution(tx, {
          attributionId: ID,
          transition: 'anteriorite_etablie',
          critere: 'devis_signe',
          fait: { ...DEVIS, le: ms(DEPOT, delta) },
          acteur: { par: 'systeme' },
          maintenant: MAINTENANT,
        })
      );
      expect(e.code).toBe('fait_posterieur_au_depot');
      expect(mises).toStrictEqual([]);
      expect(evenementsEcrits()).toStrictEqual([]);
    }
  );

  it('REQ-DM-006 : TÉMOIN — un fait une milliseconde AVANT le dépôt fonde l’antériorité', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const { tx } = txSimule([ligneDe({ statut: 'signee' })]);
    const r = await transitionnerUneAttribution(tx, {
      attributionId: ID,
      transition: 'anteriorite_etablie',
      critere: 'devis_signe',
      fait: { ...DEVIS, le: ms(DEPOT, -1) },
      acteur: { par: 'systeme' },
      maintenant: MAINTENANT,
    });
    expect(r).toStrictEqual({ de: 'signee', vers: 'annulee' });
  });
});

/**
 * DM-25 (juriste, critère d) : l'antériorité établie après coup est notifiée à l'APPORTEUR, une fois,
 * avec l'événement qui la fonde ; pour un conseiller, la console seule (aucune notification).
 */
describe('REQ-JUR-007 — l’antériorité établie notifie l’apporteur (DM-25)', () => {
  const DEPOT_APRES = new Date('2027-01-01T00:00:00.000Z');

  function txNotifiant(ligne: LigneSimulee) {
    const base = txSimule([ligne]);
    const notifications: unknown[] = [];
    const attribution = (base.tx as { attribution: object }).attribution;
    const tx = Object.assign(base.tx as object, {
      attribution: {
        ...attribution,
        findUnique: async (q: { select?: { deposeeAt?: boolean } }) =>
          q.select?.deposeeAt ? { deposeeAt: DEPOT_APRES } : null,
      },
      notificationEspace: {
        create: async (arg: unknown) => {
          notifications.push(arg);
          return {};
        },
      },
    });
    return { ...base, tx: tx as never, notifications };
  }

  beforeEach(() => {
    journalSimule.ajouterEvenement.mockReset();
    journalSimule.ajouterEvenement.mockResolvedValue({ id: '77', selfHash: 'x' });
  });

  it('REQ-JUR-007 : TÉMOIN — l’apporteur reçoit attribution_annulee_anteriorite, UNE fois, avec l’événement de l’annulation', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txNotifiant(ligneDe({ statut: 'signee' }));
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'anteriorite_etablie',
      critere: 'devis_signe',
      fait: DEVIS,
      acteur: { par: 'systeme' },
      maintenant: MAINTENANT,
    });
    expect(t.notifications).toStrictEqual([
      {
        data: {
          apporteurId: APPORTEUR,
          cle: 'attribution_annulee_anteriorite',
          attributionId: ID,
          evenementId: BigInt(77),
        },
      },
    ]);
  });

  it('REQ-JUR-007 : TÉMOIN — pour un conseiller, aucune notification : la console seule', async () => {
    const { transitionnerUneAttribution } = await ecrivain();
    const t = txNotifiant(ligneDe({ statut: 'signee', apporteur_id: null }));
    await transitionnerUneAttribution(t.tx, {
      attributionId: ID,
      transition: 'anteriorite_etablie',
      critere: 'devis_signe',
      fait: DEVIS,
      acteur: { par: 'systeme' },
      maintenant: MAINTENANT,
    });
    expect(t.notifications).toStrictEqual([]);
  });
});

/**
 * DM-25 — la RÉFÉRENCE du fait fondateur d'`anteriorite_etablie` (arbitrage de la coordination sur
 * #731, voie (a) d'A02, 5984318182 ; condition de la sécurité) : `ref = sha256_hex("partners.
 * anteriorite.v1|" + nature + "|" + id)`, sur l'identifiant OPAQUE d'axion-ia, à l'octet. Un id qui
 * n'a pas la forme d'un UUID est refusé, nommé : si la règle d'axion-ia change, elle se rouvre.
 */
describe('REQ-JUR-007 — la référence du fait fondateur', () => {
  const ID = '0190f0a0-0000-4000-8000-000000000d01';

  it('REQ-JUR-007 : TÉMOIN — le vecteur FIGÉ, calculé hors du code (printf … | sha256sum)', async () => {
    const { refDuFaitFondateur } = await import('../../../src/server/attribution/transitionner');
    expect(refDuFaitFondateur('devis', ID)).toBe(
      '7708e44da73d14cdf9432be0034469a6bbc10465bd1ba4b06f7a3ced277da029'
    );
    expect(refDuFaitFondateur('facture', ID)).toBe(
      '44f1913396b705256a25e686ae9c3aa691aadce7c7143ea1d06e0a318aa422e5'
    );
  });

  it('REQ-JUR-007 : TÉMOIN — le même fait donne la même ref ; un devis et une facture de même id, deux ref', async () => {
    const { refDuFaitFondateur } = await import('../../../src/server/attribution/transitionner');
    expect(refDuFaitFondateur('devis', ID)).toBe(refDuFaitFondateur('devis', ID));
    expect(refDuFaitFondateur('devis', ID)).not.toBe(refDuFaitFondateur('facture', ID));
    expect(refDuFaitFondateur('devis', ID)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('REQ-JUR-007 : TÉMOIN — un id vide ou hors forme UUID est refusé, nommé (reference_du_fait_invalide)', async () => {
    const { refDuFaitFondateur } = await import('../../../src/server/attribution/transitionner');
    for (const id of ['', 'FAC-2026-0001', '42', ` ${ID}`, `${ID}x`]) {
      expect(() => refDuFaitFondateur('devis', id), JSON.stringify(id)).toThrow(
        /^reference_du_fait_invalide/
      );
    }
  });

  it('REQ-JUR-007 : TÉMOIN STATIQUE — la chaîne ne lit que la nature et l’id : ni numero, ni clientId, ni siren', () => {
    const source = readFileSync('src/server/attribution/transitionner.ts', 'utf8');
    const debut = source.indexOf('export function refDuFaitFondateur');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n}\n', debut));
    expect(corps).not.toMatch(/numero|clientId|siren|nom\b/i);
    expect(corps).toMatch(/`partners\.anteriorite\.v1\|\$\{nature\}\|\$\{id\}`/);
    // Et le job ne lui passe que l'identifiant du fait reçu.
    const job = readFileSync('src/server/jobs/anteriorite-retroactive.ts', 'utf8');
    expect(job).toMatch(/refDuFaitFondateur\(fondement\.fait\.nature, fondement\.fait\.id\)/);
  });
});
