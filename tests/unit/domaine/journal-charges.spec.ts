// @req REQ-DM-024
// @req REQ-DM-031
// @req REQ-SEC-058
/**
 * `journal-charges.spec.ts` — les charges FERMÉES du journal (`src/domain/evenement/charges.ts`),
 * jugées valeur par valeur : la forme d'une empreinte, les constructeurs de formes, la charge de
 * chaque type, et la purge du contact d'une attribution, réservée au système.
 */
import { describe, it, expect } from 'vitest';
import {
  CHARGES_PAR_TYPE,
  FORMES,
  HASH_HEX_64,
  naissanceDApporteur,
} from '../../../src/domain/evenement/charges';
import { ALGORITHME } from '../../../src/domain/evenement/journal';

const HEX = 'a'.repeat(64);
const INSTANT = '2026-10-02T08:00:00.000Z';
const ID = '01928f6e-0000-7000-8000-000000000001';

describe('REQ-DM-024 — les formes admises dans une charge', () => {
  it('REQ-DM-024 : une empreinte est EXACTEMENT 64 hexadécimaux minuscules, ancrés aux deux bouts', () => {
    expect(HASH_HEX_64.test(HEX)).toBe(true);
    expect(HASH_HEX_64.test(`x${HEX}`)).toBe(false);
    expect(HASH_HEX_64.test(`${HEX}x`)).toBe(false);
    expect(HASH_HEX_64.test('A'.repeat(64))).toBe(false);
    expect(HASH_HEX_64.test('a'.repeat(63))).toBe(false);
  });

  it('REQ-DM-024 : chaque constructeur rend un schéma qui juge sa forme', () => {
    expect(FORMES.empreinte().safeParse(HEX).success).toBe(true);
    expect(FORMES.empreinte().safeParse(`${HEX}0`).success).toBe(false);
    expect(FORMES.montantCents().safeParse(1250).success).toBe(true);
    expect(FORMES.montantCents().safeParse(12.5).success).toBe(false);
    expect(FORMES.horodatage().safeParse(INSTANT).success).toBe(true);
    expect(FORMES.horodatage().safeParse('2 octobre').success).toBe(false);
    expect(FORMES.identifiant().safeParse(ID).success).toBe(true);
  });
});

describe('REQ-DM-024 — une charge par type, fermée', () => {
  it('REQ-DM-024 : les types du journal sont exactement ceux-ci', () => {
    expect(Object.keys(CHARGES_PAR_TYPE).sort()).toEqual([
      'anomalie_gel_modifie',
      'anomalie_statut_modifie',
      'apporteur_statut_modifie',
      'attribution_contact_purge',
      'attribution_etat_modifie',
      'attribution_peremption_suspendue',
      'attribution_porteur_reaffecte',
      'contestation_modifiee',
      'demande_confirmation_etat_modifie',
      'journal_acces_console_resume',
      'journal_ouvert',
      'piece_kyc_statut_modifie',
      'rattachement_manuel_modifie',
    ]);
  });

  it('REQ-DM-024 : la genèse porte l’algorithme, et lui seul', () => {
    const g = CHARGES_PAR_TYPE.journal_ouvert;
    expect(g.safeParse({ algorithme: ALGORITHME }).success).toBe(true);
    expect(g.safeParse({}).success).toBe(false);
    expect(g.safeParse({ algorithme: ALGORITHME, autre: 1 }).success).toBe(false);
  });

  it('REQ-DM-024 : la naissance d’un apporteur passe, et une charge sans acteur ne passe pas', () => {
    const s = CHARGES_PAR_TYPE.apporteur_statut_modifie;
    expect(s.safeParse(naissanceDApporteur({ par: 'systeme' })).success).toBe(true);
    expect(s.safeParse({ de: null, vers: 'candidat', transition: 'creer' }).success).toBe(false);
  });
});

describe('REQ-DM-031 — la purge du contact : l’instant, et le système pour seul acteur', () => {
  const purge = CHARGES_PAR_TYPE.attribution_contact_purge;

  it('REQ-DM-031 : la purge du cron passe', () => {
    expect(purge.safeParse({ purgeAt: INSTANT, acteur: { par: 'systeme' } }).success).toBe(true);
  });

  it('REQ-DM-031 : sans instant, ou avec un instant hors forme, elle est refusée', () => {
    expect(purge.safeParse({ acteur: { par: 'systeme' } }).success).toBe(false);
    expect(purge.safeParse({ purgeAt: 'hier', acteur: { par: 'systeme' } }).success).toBe(false);
  });

  it('REQ-DM-031 : un acteur autre que le système est refusé, motif acteur_systeme_attendu', () => {
    for (const par of ['apporteur', 'utilisateur_console'] as const) {
      const r = purge.safeParse({ purgeAt: INSTANT, acteur: { par, id: ID } });
      expect(r.success).toBe(false);
      expect(r.error?.issues.map((i) => i.message)).toEqual(['acteur_systeme_attendu']);
    }
  });

  it('REQ-DM-031 : la charge est fermée — aucune donnée du contact n’y entre', () => {
    expect(
      purge.safeParse({ purgeAt: INSTANT, acteur: { par: 'systeme' }, nomContact: 'Martin' })
        .success
    ).toBe(false);
  });
});

describe('REQ-DM-033 — DM-12, décision (d) de la juriste : la charge d’une anomalie ne relie à personne', () => {
  const charge = CHARGES_PAR_TYPE.anomalie_statut_modifie;
  const naissance = { de: null, vers: 'ouverte', acteur: { par: 'systeme' } };

  it('REQ-DM-033 : la naissance et la clôture passent, acteur sans identifiant', () => {
    expect(charge.safeParse(naissance).success).toBe(true);
    expect(
      charge.safeParse({ de: 'ouverte', vers: 'levee', acteur: { par: 'utilisateur_console' } })
        .success
    ).toBe(true);
  });

  it.each(['apporteurId', 'attributionId', 'anomalieId', 'justification', 'score'])(
    'REQ-DM-033 : TÉMOIN — une charge qui porte « %s » est refusée',
    (cle) => {
      expect(charge.safeParse({ ...naissance, [cle]: 'x' }).success).toBe(false);
    }
  );

  it('REQ-DM-033 : TÉMOIN — un acteur avec un identifiant est refusé (exception nommée à HYP-A02-ACTEUR-JOURNAL)', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(
      charge.safeParse({ ...naissance, acteur: { par: 'utilisateur_console', id } }).success
    ).toBe(false);
    expect(charge.safeParse({ ...naissance, acteur: { par: 'apporteur' } }).success).toBe(false);
  });

  it('REQ-DM-033 : `de` est nul à la naissance seulement', () => {
    expect(charge.safeParse({ ...naissance, vers: 'levee' }).success).toBe(false);
    expect(
      charge.safeParse({ de: 'ouverte', vers: 'ouverte', acteur: { par: 'systeme' } }).success
    ).toBe(false);
  });

  it('REQ-DM-033 : TÉMOIN — aucune charge du journal ne porte la clé anomalieId : l’EFFET part sans id d’anomalie', () => {
    for (const [type, schema] of Object.entries(CHARGES_PAR_TYPE)) {
      const forme = (schema as { _def: { schema?: { shape?: object } } })._def;
      const shape = (schema as unknown as { shape?: object }).shape ?? forme.schema?.shape ?? {};
      expect(Object.keys(shape).length, `${type} : forme lue`).toBeGreaterThan(0);
      expect(Object.keys(shape), type).not.toContain('anomalieId');
    }
  });
});

describe('REQ-DM-033 REQ-DM-043 — le gel pour litige au journal : le geste, jamais sa référence', () => {
  it('REQ-DM-033 : le gel d’une anomalie, posé ou levé, passe avec un acteur sans identifiant', () => {
    const charge = CHARGES_PAR_TYPE.anomalie_gel_modifie;
    for (const vers of ['gel_pose', 'gel_leve']) {
      expect(charge.safeParse({ vers, acteur: { par: 'utilisateur_console' } }).success).toBe(true);
    }
    expect(charge.safeParse({ vers: 'gele', acteur: { par: 'systeme' } }).success).toBe(false);
    expect(
      charge.safeParse({
        vers: 'gel_pose',
        acteur: { par: 'utilisateur_console', id: '00000000-0000-4000-8000-000000000000' },
      }).success
    ).toBe(false);
  });

  it('REQ-DM-043 : contestation_modifiee admet le gel posé et levé', () => {
    const charge = CHARGES_PAR_TYPE.contestation_modifiee;
    for (const vers of ['gel_pose', 'gel_leve']) {
      expect(
        charge.safeParse({
          contestationId: '00000000-0000-4000-8000-000000000000',
          de: 'recue',
          vers,
          acteur: { par: 'systeme' },
        }).success
      ).toBe(true);
    }
  });

  it.each(['gelLitigeRef', 'ref', 'reference'])(
    'REQ-DM-033 : TÉMOIN — une charge du gel qui porte « %s » est refusée',
    (cle) => {
      expect(
        CHARGES_PAR_TYPE.anomalie_gel_modifie.safeParse({
          vers: 'gel_pose',
          acteur: { par: 'systeme' },
          [cle]: 'RG-24/01234',
        }).success
      ).toBe(false);
      expect(
        CHARGES_PAR_TYPE.contestation_modifiee.safeParse({
          contestationId: '00000000-0000-4000-8000-000000000000',
          de: 'recue',
          vers: 'gel_pose',
          acteur: { par: 'systeme' },
          [cle]: 'RG-24/01234',
        }).success
      ).toBe(false);
    }
  );

  it('REQ-DM-033 : TÉMOIN — aucune charge du journal ne déclare une clé de référence ou de litige', () => {
    for (const [type, schema] of Object.entries(CHARGES_PAR_TYPE)) {
      const forme = (schema as { _def: { schema?: { shape?: object } } })._def;
      const shape = (schema as unknown as { shape?: object }).shape ?? forme.schema?.shape ?? {};
      expect(Object.keys(shape).length, `${type} : forme lue`).toBeGreaterThan(0);
      for (const cle of Object.keys(shape)) {
        expect(cle, type).not.toMatch(/ref|litige/i);
      }
    }
  });
});

describe('REQ-SEC-058 — SEC-59 : le résumé du journal des accès à la console, des comptes et des empreintes seulement', () => {
  const r = CHARGES_PAR_TYPE.journal_acces_console_resume;
  const resume = {
    acteur: { par: 'systeme' },
    jour: '2027-01-10T00:00:00.000Z',
    lignesNombre: 2,
    empreinteComplete: HEX,
    empreinteSurvivante: 'b'.repeat(64),
  };

  it('REQ-SEC-058 : le résumé de la tâche passe', () => {
    expect(r.safeParse(resume).success).toBe(true);
    expect(r.safeParse({ ...resume, lignesNombre: 0 }).success).toBe(true);
  });

  it('REQ-SEC-058 : TÉMOIN — un acteur autre que le système, ou portant un identifiant, est refusé', () => {
    expect(r.safeParse({ ...resume, acteur: { par: 'utilisateur_console', id: ID } }).success).toBe(
      false
    );
    expect(r.safeParse({ ...resume, acteur: { par: 'systeme', id: ID } }).success).toBe(false);
  });

  it('REQ-SEC-058 : TÉMOIN — la charge est fermée : aucun identifiant d’employé, de cible ni d’adresse n’y entre', () => {
    for (const cle of ['utilisateurConsoleId', 'cibleId', 'ipHash', 'utilisateurs']) {
      expect(r.safeParse({ ...resume, [cle]: ID }).success).toBe(false);
    }
  });

  it('REQ-SEC-058 : TÉMOIN — le nombre de lignes est un entier positif ou nul, et chaque champ est exigé', () => {
    expect(r.safeParse({ ...resume, lignesNombre: 1.5 }).success).toBe(false);
    expect(r.safeParse({ ...resume, lignesNombre: -1 }).success).toBe(false);
    for (const cle of Object.keys(resume)) {
      const sans: Record<string, unknown> = { ...resume };
      delete sans[cle];
      expect(r.safeParse(sans).success).toBe(false);
    }
  });

  it('REQ-SEC-058 : la forme compte juge un entier positif ou nul', () => {
    expect(FORMES.compte().safeParse(0).success).toBe(true);
    expect(FORMES.compte().safeParse(12).success).toBe(true);
    expect(FORMES.compte().safeParse(-1).success).toBe(false);
    expect(FORMES.compte().safeParse(2.5).success).toBe(false);
  });
});
