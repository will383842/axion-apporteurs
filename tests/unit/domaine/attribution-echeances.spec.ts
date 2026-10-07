// @req REQ-DM-006
// @req REQ-DM-007
/**
 * DM-13 — les échéances d'une attribution, jugées PURES, sur le contrat v2 (art. 3.4 et 3.5) : la
 * péremption à 90 jours du premier échange, l'expiration au terme de la fenêtre, et la fin du délai
 * de redéclaration du rang 1. Ce module ne CALCULE aucune date : la machine (DM-08) les pose à chaque
 * transition ; il dit seulement quelle transition est due, et à quel instant.
 */
import { describe, it, expect } from 'vitest';
import {
  ETATS_QUI_EXPIRENT,
  executableAujourdHui,
  nouveauContactManquant,
  redepotPermis,
  transitionEchue,
  type EcheancesDUneAttribution,
} from '../../../src/domain/attribution/echeances';
import {
  ETATS_ATTRIBUTION,
  TRANSITIONS_ATTRIBUTION,
} from '../../../src/domain/attribution/machine';
import { SEUILS } from '../../../src/domain/seuils/ssot';
import { ajouterJoursCivilsParis } from '../../../src/domain/temps/sla';

const T = Date.UTC(2027, 5, 1, 8, 0);
const MINUTE = 60_000;
const JOUR = 86_400_000;

const e = (o: Partial<EcheancesDUneAttribution>): EcheancesDUneAttribution => ({
  statut: 'active',
  porteur: 'apporteur',
  deposeeAt: T - 400 * JOUR,
  peremptionSuspendue: false,
  etatDeLaDemande: 'envoyee',
  peremptionAt: null,
  fenetreFinAt: null,
  fenetreRedeclarationFinAt: null,
  ...o,
});

describe('REQ-DM-007 — la péremption (art. 3.4 al. 2)', () => {
  it('REQ-DM-007 : TÉMOIN — à la péremption moins une minute, rien ; à la péremption, `perimee`', () => {
    const a = e({ peremptionAt: T, fenetreFinAt: T + 90 * JOUR });
    expect(transitionEchue(a, T - MINUTE)).toBeNull();
    expect(transitionEchue(a, T)).toBe('perimee');
  });

  it('REQ-DM-007 : TÉMOIN — fait « absence d’échange imputable à la Société » posé ⇒ pas de péremption, seule la durée de 6 mois (juriste, 6037008645)', () => {
    const a = e({ peremptionAt: T, fenetreFinAt: T + 90 * JOUR, peremptionSuspendue: true });
    expect(transitionEchue(a, T + JOUR)).toBeNull();
    expect(transitionEchue(a, T + 90 * JOUR)).toBe('expiree');
  });

  it('REQ-DM-007 : sans premier échange, ou sous le marqueur « imputable à la Société », `peremptionAt` est nulle : jamais de péremption', () => {
    expect(transitionEchue(e({ fenetreFinAt: T + JOUR }), T)).toBeNull();
  });

  it('REQ-DM-007 : seule une attribution `active` se périme (la matrice ne connaît que cette flèche)', () => {
    for (const statut of ETATS_ATTRIBUTION) {
      const due = transitionEchue(e({ statut, peremptionAt: T }), T);
      expect(due === 'perimee', statut).toBe(statut === 'active');
    }
  });
});

describe('REQ-DM-006 — l’expiration au terme de la fenêtre (art. 3.4 al. 1)', () => {
  it('REQ-DM-006 : TÉMOIN — au terme moins une minute, rien ; au terme, `expiree`', () => {
    const a = e({ fenetreFinAt: T });
    expect(transitionEchue(a, T - MINUTE)).toBeNull();
    expect(transitionEchue(a, T)).toBe('expiree');
  });

  it('REQ-DM-006 : les états qui expirent au terme sont exactement ceux-ci, et la matrice leur donne la flèche', () => {
    expect([...ETATS_QUI_EXPIRENT]).toEqual([
      'active',
      'rdv_pris',
      'proposition',
      'signee',
      'convertie',
    ]);
    for (const statut of ETATS_QUI_EXPIRENT) {
      expect(TRANSITIONS_ATTRIBUTION[statut].expiree, statut).toBe('expiree');
      expect(transitionEchue(e({ statut, fenetreFinAt: T }), T), statut).toBe('expiree');
    }
  });

  it('REQ-DM-006 : une attribution provisoire, figée, en attente ou éteinte n’expire pas par ce terme', () => {
    for (const statut of ETATS_ATTRIBUTION.filter(
      (s) => !(ETATS_QUI_EXPIRENT as readonly string[]).includes(s)
    )) {
      expect(transitionEchue(e({ statut, fenetreFinAt: T }), T), statut).not.toBe('expiree');
    }
  });

  it('REQ-DM-007 : les deux échues, la PREMIÈRE l’emporte', () => {
    expect(transitionEchue(e({ peremptionAt: T - JOUR, fenetreFinAt: T }), T)).toBe('perimee');
    expect(transitionEchue(e({ peremptionAt: T, fenetreFinAt: T - JOUR }), T)).toBe('expiree');
    // À égalité, l'expiration : le terme de l'alinéa 1 est atteint, la péremption n'a rien à ajouter.
    expect(transitionEchue(e({ peremptionAt: T, fenetreFinAt: T }), T)).toBe('expiree');
  });
});

describe('REQ-DM-004 — le délai de redéclaration du rang 1 (art. 3.5)', () => {
  it('REQ-DM-004 : TÉMOIN — au terme du délai posé, `file_expiree` ; avant, rien ; sans délai posé, rien avant douze mois', () => {
    const a = e({ statut: 'en_attente', deposeeAt: T - 20 * JOUR, fenetreRedeclarationFinAt: T });
    expect(transitionEchue(a, T - MINUTE)).toBeNull();
    expect(transitionEchue(a, T)).toBe('file_expiree');
    // Sans délai posé, rien avant l'extinction de l'attente (douze mois de l'enregistrement).
    expect(transitionEchue(e({ statut: 'en_attente', deposeeAt: T }), T + 300 * JOUR)).toBeNull();
  });
});

describe('REQ-DM-007 — la prise en charge d’un conseiller (art. 3.5 ; arbitrage #319 6036991499, point 13)', () => {
  const PRISE = T;
  const PEREMPTION = PRISE + SEUILS.PEREMPTION_JOURS.valeur * JOUR;
  const c = (o: Partial<EcheancesDUneAttribution> = {}) =>
    e({ porteur: 'conseiller', deposeeAt: PRISE, fenetreFinAt: PRISE + 400 * JOUR, ...o });

  it('REQ-DM-007 : TÉMOIN — 90 jours depuis la PRISE EN CHARGE, et non depuis le premier échange', () => {
    expect(
      transitionEchue(c({ peremptionAt: PEREMPTION + 30 * JOUR }), PEREMPTION - MINUTE)
    ).toBeNull();
    expect(transitionEchue(c({ peremptionAt: PEREMPTION + 30 * JOUR }), PEREMPTION)).toBe(
      'perimee'
    );
  });

  it('REQ-DM-007 : TÉMOIN — l’exception « imputable à la Société » ne vaut pas pour la prise en charge : sans peremptionAt, elle se périme quand même', () => {
    expect(transitionEchue(c({ peremptionAt: null }), PEREMPTION)).toBe('perimee');
  });

  it('REQ-DM-007 : TÉMOIN à deux faces — le même calendrier pour un apporteur ne se périme pas sans premier échange', () => {
    expect(
      transitionEchue(e({ deposeeAt: PRISE, fenetreFinAt: PRISE + 400 * JOUR }), PEREMPTION)
    ).toBeNull();
  });
});

describe('REQ-DM-004 — une déclaration en attente s’éteint au lendemain du 12e mois (art. 3.5 ; juriste, 6037008645)', () => {
  // Enregistrée le 10 mars 2027 à 15 h à Paris (UTC+1) : le 12e mois s'achève le 10 mars 2028 ;
  // l'extinction prend effet le 11 mars 2028 à 0 h, heure de Paris (UTC+1).
  const ENREGISTREE = Date.UTC(2027, 2, 10, 14, 0);
  const LENDEMAIN = Date.UTC(2028, 2, 10, 23, 0);
  const a = e({ statut: 'en_attente', deposeeAt: ENREGISTREE });

  it('REQ-DM-004 : TÉMOIN — la veille à 23 h 59, rien ; au lendemain à 0 h, `file_expiree`', () => {
    expect(transitionEchue(a, LENDEMAIN - MINUTE)).toBeNull();
    expect(transitionEchue(a, LENDEMAIN)).toBe('file_expiree');
  });

  it('REQ-DM-004 : la durée vient de la SSOT (FILE_EXPIRATION_MOIS, art. 3.5)', () => {
    expect([SEUILS.FILE_EXPIRATION_MOIS.valeur, SEUILS.FILE_EXPIRATION_MOIS.unite]).toEqual([
      12,
      'mois',
    ]);
  });

  it('REQ-DM-004 : un 29 février enregistré s’éteint au lendemain du 28 février suivant', () => {
    const b = e({ statut: 'en_attente', deposeeAt: Date.UTC(2028, 1, 29, 9, 0) });
    expect(transitionEchue(b, Date.UTC(2029, 1, 28, 22, 59))).toBeNull();
    expect(transitionEchue(b, Date.UTC(2029, 1, 28, 23, 0))).toBe('file_expiree');
  });
});

describe('REQ-DM-007 — les échecs fermés, en faveur de l’apporteur (juriste, 6037008645 ; coordination)', () => {
  it('REQ-DM-006 : TÉMOIN — l’expiration à 6 mois, due, ne s’exécute pas tant que la prolongation (art. 3.4 al. 3) n’est pas jugée', () => {
    expect(executableAujourdHui('expiree', 'apporteur')).toBe(false);
    expect(executableAujourdHui('expiree', 'conseiller')).toBe(false);
  });

  it('REQ-DM-007 : TÉMOIN — la péremption d’un apporteur, due, ne s’exécute pas tant que le fait « imputable à la Société » ne peut pas se poser', () => {
    expect(executableAujourdHui('perimee', 'apporteur')).toBe(false);
  });

  it('REQ-DM-007 : TÉMOIN à deux faces — la péremption d’une prise en charge, sans exception imputable, s’exécute ; la file aussi', () => {
    expect(executableAujourdHui('perimee', 'conseiller')).toBe(true);
    expect(executableAujourdHui('file_expiree', 'apporteur')).toBe(true);
  });
});

describe('REQ-DM-006 — la fin faute d’adresse valide, 45 jours après la DÉCLARATION (v2, art. 3.2 ; arbitrage 6036991499)', () => {
  const DEPOT = Date.UTC(2027, 1, 1, 9, 0);
  const FIN = ajouterJoursCivilsParis(DEPOT, SEUILS.LIBERATION_SIGNALEE_JOURS.valeur);
  const p = (o: Partial<EcheancesDUneAttribution> = {}) =>
    e({ statut: 'provisoire', deposeeAt: DEPOT, etatDeLaDemande: 'rebond', ...o });

  it('REQ-DM-006 : TÉMOIN — message en erreur sans adresse corrigée : à J+45 moins une minute, rien ; à J+45, `fin_sans_adresse_valide`', () => {
    expect(transitionEchue(p(), FIN - MINUTE)).toBeNull();
    expect(transitionEchue(p(), FIN)).toBe('fin_sans_adresse_valide');
  });

  it('REQ-DM-006 : TÉMOIN — une adresse corrigée est une adresse valide : aucune fin, à J+45 ni après', () => {
    expect(transitionEchue(p({ etatDeLaDemande: 'envoyee' }), FIN + 90 * JOUR)).toBeNull();
  });

  it('REQ-DM-006 : le silence n’éteint jamais : sans erreur, sans demande, ou pour un conseiller, aucune fin', () => {
    expect(transitionEchue(p({ etatDeLaDemande: null }), FIN)).toBeNull();
    expect(transitionEchue(p({ etatDeLaDemande: 'planifiee' }), FIN)).toBeNull();
    expect(transitionEchue(p({ porteur: 'conseiller', etatDeLaDemande: null }), FIN)).toBeNull();
  });

  it('REQ-DM-006 : seule une attribution provisoire prend fin ainsi', () => {
    expect(
      transitionEchue(p({ statut: 'active', fenetreFinAt: FIN + 400 * JOUR }), FIN)
    ).toBeNull();
  });

  it('REQ-DM-006 : la fin s’exécute normalement (aucun échec fermé)', () => {
    expect(executableAujourdHui('fin_sans_adresse_valide', 'apporteur')).toBe(true);
  });
});

describe('REQ-DM-004 — la carence UNIQUE après une fin faute d’adresse valide (v2, art. 3.2 ; arbitrage 6036991499)', () => {
  const FIN = Date.UTC(2027, 3, 1, 8, 0);
  const PERMIS = ajouterJoursCivilsParis(FIN, SEUILS.CARENCE_REDEPOT_APRES_LIBERATION_JOURS.valeur);

  it('REQ-DM-004 : TÉMOIN — à J+30 moins une minute, refusé ; à J+30, permis', () => {
    expect(redepotPermis(FIN, PERMIS - MINUTE)).toBe(false);
    expect(redepotPermis(FIN, PERMIS)).toBe(true);
  });

  it('REQ-DM-004 : sans fin faute d’adresse valide, rien ne retient le dépôt', () => {
    expect(redepotPermis(null, FIN)).toBe(true);
  });

  it('REQ-DM-004 : la carence est UNIQUE : 30 jours, jamais davantage (aucune carence graduée)', () => {
    expect(SEUILS.CARENCE_REDEPOT_APRES_LIBERATION_JOURS.valeur).toBe(30);
    expect(redepotPermis(FIN, PERMIS + MINUTE)).toBe(true);
  });
});

describe('REQ-DM-004 — le nouveau contact après une fin de durée (art. 3.4 bis ; juriste, 6037169174)', () => {
  // Le terme : le 30 juin 2027, 18 h à Paris (UTC+2).
  const TERME = Date.UTC(2027, 5, 30, 16, 0);

  it('REQ-DM-004 : TÉMOIN — après une fin de durée, un dépôt sans date du contact est refusé', () => {
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: TERME }, null)).toBe(true);
  });

  it('REQ-DM-004 : TÉMOIN — une date égale au jour du terme est refusée ; le lendemain est admis', () => {
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: TERME }, '2027-06-30')).toBe(true);
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: TERME }, '2027-07-01')).toBe(false);
  });

  it('REQ-DM-004 : le jour du terme est celui de PARIS : un terme à 23 h 30 à Paris est encore ce jour-là', () => {
    const tard = Date.UTC(2027, 5, 30, 21, 30); // 23 h 30 à Paris, déjà le 30 juin à 21 h 30 UTC
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: tard }, '2027-06-30')).toBe(true);
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: tard }, '2027-07-01')).toBe(false);
  });

  it('REQ-DM-004 : TÉMOIN — la prolongation déplace le terme : la date doit suivre le terme PROLONGÉ', () => {
    const prolonge = Date.UTC(2027, 8, 30, 16, 0);
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: prolonge }, '2027-07-01')).toBe(
      true
    );
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: prolonge }, '2027-10-01')).toBe(
      false
    );
  });

  it('REQ-DM-004 : TÉMOIN — après une autre fin (péremption, fin sans adresse valide…), aucune date n’est exigée', () => {
    expect(nouveauContactManquant({ finDeDuree: false, termeAt: TERME }, null)).toBe(false);
  });

  it('REQ-DM-004 : une fin de durée sans terme lisible : refusée (échec fermé)', () => {
    expect(nouveauContactManquant({ finDeDuree: true, termeAt: null }, '2027-07-01')).toBe(true);
  });
});
