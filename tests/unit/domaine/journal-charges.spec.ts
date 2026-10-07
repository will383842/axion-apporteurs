// @req REQ-DM-024
// @req REQ-DM-031
// @req REQ-DM-027
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
  JOUR_UTC,
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
      // SEC-19 (A02, #703) : la mise en demeure datée d'un apporteur, par article.
      'apporteur_mis_en_demeure',
      'apporteur_statut_modifie',
      'attribution_contact_purge',
      'attribution_etat_modifie',
      'attribution_peremption_suspendue',
      'attribution_porteur_reaffecte',
      'contestation_modifiee',
      'demande_confirmation_etat_modifie',
      // SEC-59 : le résumé quotidien du journal des accès, sans agrégat.
      'journal_acces_console_resume',
      // SEC-61 : la pose et la levée d'un gel du journal des accès à la console.
      'journal_acces_gel_modifie',
      'journal_ouvert',
      'piece_kyc_statut_modifie',
      'rattachement_manuel_modifie',
      // SEC-30 : tout changement d'un utilisateur de la console, dans la transaction du geste.
      'utilisateur_console_modifie',
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
      for (const [cle, champ] of Object.entries(shape)) {
        // SEC-61 (forme d'A02 et de la sécurité) : une référence n'entre qu'en EMPREINTE, sous une clé
        // suffixée `Empreinte` dont la forme refuse tout ce qui n'est pas 64 hexadécimaux. Jamais en clair.
        if (cle.endsWith('Empreinte')) {
          const z = champ as { safeParse: (v: unknown) => { success: boolean } };
          expect(z.safeParse('INC-0001').success, `${type}.${cle}`).toBe(false);
          expect(z.safeParse('a'.repeat(64)).success, `${type}.${cle}`).toBe(true);
          continue;
        }
        // CPL-T07 : « refus » n'est pas une référence — le motif FERMÉ d'un refus de pièce
        // (`motifRefus`, forme d'A02) passe ; « ref » seul, « reference », « litige » restent refusés.
        expect(cle, type).not.toMatch(/ref(?!us)|litige/i);
      }
    }
  });

  it('REQ-SEC-058 : la pose et la levée d’un gel du journal des accès passent, sans aucun identifiant', () => {
    const charge = CHARGES_PAR_TYPE.journal_acces_gel_modifie;
    for (const geste of ['poser', 'lever'] as const)
      expect(
        charge.safeParse({
          geste,
          motif: 'incident',
          portee: { type: 'utilisateur' },
          referenceEmpreinte: 'b'.repeat(64),
          acteur: { par: 'utilisateur_console' },
        }).success,
        geste
      ).toBe(true);
  });

  it('REQ-SEC-058 : TÉMOIN — la charge du gel refuse toute autre clé : un id d’employé, de cible ou la référence en clair', () => {
    const charge = CHARGES_PAR_TYPE.journal_acces_gel_modifie;
    const juste = {
      geste: 'poser',
      motif: 'litige',
      portee: { type: 'cible' },
      referenceEmpreinte: 'c'.repeat(64),
      acteur: { par: 'utilisateur_console' },
    };
    const id = '0190f0f0-0000-7000-8000-000000000001';
    for (const [nom, variante] of [
      ['poseParId', { ...juste, poseParId: id }],
      ['leveParId', { ...juste, leveParId: id }],
      ['utilisateurViseId', { ...juste, utilisateurViseId: id }],
      ['cibleId', { ...juste, cibleId: id }],
      ['reference', { ...juste, reference: 'LIT-0001' }],
      ['portee.id', { ...juste, portee: { type: 'cible', id } }],
      ['acteur.id', { ...juste, acteur: { par: 'utilisateur_console', id } }],
      ['referenceEmpreinte en clair', { ...juste, referenceEmpreinte: 'LIT-0001' }],
    ] as const)
      expect(charge.safeParse(variante).success, nom).toBe(false);
    expect(Object.keys(charge.shape).sort()).toEqual([
      'acteur',
      'geste',
      'motif',
      'portee',
      'referenceEmpreinte',
    ]);
  });
});

describe('REQ-DM-027 — le refus d’une pièce porte un motif fermé, et lui seul', () => {
  const charge = CHARGES_PAR_TYPE.piece_kyc_statut_modifie;
  const base = {
    de: 'a_verifier',
    type: 'rib',
    acteur: { par: 'utilisateur_console', id: '0190f0f0-0000-7000-8000-000000000001' },
  } as const;

  it('REQ-DM-027 : TÉMOIN À DEUX FACES — un refus SANS motif est refusé ; le même refus avec un motif de la liste passe', () => {
    expect(charge.safeParse({ ...base, vers: 'refusee' }).success).toBe(false);
    expect(charge.safeParse({ ...base, vers: 'refusee', motifRefus: 'illisible' }).success).toBe(
      true
    );
  });

  it('REQ-DM-027 : TÉMOIN — un motif hors refus, un texte libre ou « autre » sont refusés', () => {
    expect(charge.safeParse({ ...base, vers: 'valide', motifRefus: 'illisible' }).success).toBe(
      false
    );
    for (const libre of ['autre', 'La pièce est floue', ''])
      expect(charge.safeParse({ ...base, vers: 'refusee', motifRefus: libre }).success, libre).toBe(
        false
      );
    expect(charge.safeParse({ ...base, vers: 'valide' }).success).toBe(true);
  });
});

// La passe de mutation (PR 667) a montré des refus jugés sans leur CHEMIN ni leur MESSAGE, et des
// charges valides jamais acceptées. Chaque type : une charge juste passe ; chaque incohérence est
// refusée avec son chemin et son message exacts.
describe('REQ-DM-024 — chaque charge : la juste passe, l’incohérente est nommée', () => {
  const ID = '0190f0f0-0000-7000-8000-000000000001';
  const CONSOLE = { par: 'utilisateur_console', id: ID } as const;
  const SANS_ID = { par: 'utilisateur_console' } as const;
  const H = 'a'.repeat(64);
  const QUAND = '2026-10-04T08:00:00.000Z';
  const refus = (type: keyof typeof CHARGES_PAR_TYPE, charge: unknown) => {
    const r = CHARGES_PAR_TYPE[type].safeParse(charge);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  };
  const passe = (type: keyof typeof CHARGES_PAR_TYPE, charge: unknown) =>
    expect(CHARGES_PAR_TYPE[type].safeParse(charge).success, type).toBe(true);

  it('REQ-DM-024 : l’antériorité établie porte son critère et son fait fondateur, de nature accordée', () => {
    const base = {
      de: 'active',
      vers: 'active',
      transition: 'anteriorite_etablie',
      acteur: CONSOLE,
    };
    passe('attribution_etat_modifie', {
      ...base,
      critere: 'cliente',
      fait: { nature: 'facture', ref: H, le: QUAND },
    });
    passe('attribution_etat_modifie', {
      ...base,
      critere: 'devis',
      fait: { nature: 'devis', ref: H, le: QUAND },
    });
    expect(refus('attribution_etat_modifie', base)).toEqual(['critere:critere_incoherent']);
    expect(
      refus('attribution_etat_modifie', {
        ...base,
        critere: 'cliente',
        fait: { nature: 'devis', ref: H, le: QUAND },
      })
    ).toEqual(['fait:fait_incoherent']);
    expect(
      refus('attribution_etat_modifie', {
        ...base,
        critere: 'cliente',
        fait: { nature: 'autre', ref: H, le: QUAND },
      }).length
    ).toBeGreaterThan(0);
  });

  it('REQ-DM-024 : l’ouverture d’une anomalie a `de` nul, et elle seule', () => {
    passe('anomalie_statut_modifie', { de: null, vers: 'ouverte', acteur: SANS_ID });
    passe('anomalie_statut_modifie', { de: 'ouverte', vers: 'levee', acteur: SANS_ID });
    expect(
      refus('anomalie_statut_modifie', { de: 'ouverte', vers: 'ouverte', acteur: SANS_ID })
    ).toEqual(['de:de_nul_a_la_naissance']);
    expect(refus('anomalie_statut_modifie', { de: null, vers: 'levee', acteur: SANS_ID })).toEqual([
      'de:de_nul_a_la_naissance',
    ]);
  });

  it('REQ-DM-024 : l’acteur sans identité n’a QUE sa population, console ou système', () => {
    for (const par of ['utilisateur_console', 'systeme'] as const)
      passe('anomalie_gel_modifie', { vers: 'gel_pose', acteur: { par } });
    expect(
      refus('anomalie_gel_modifie', { vers: 'gel_pose', acteur: { par: 'apporteur' } }).length
    ).toBeGreaterThan(0);
    expect(
      refus('anomalie_gel_modifie', { vers: 'gel_leve', acteur: CONSOLE }).length
    ).toBeGreaterThan(0);
  });

  it('REQ-DM-024 : les autres types acceptent leur charge juste', () => {
    passe('piece_kyc_statut_modifie', {
      de: null,
      vers: 'a_verifier',
      type: 'rib',
      acteur: CONSOLE,
    });
    passe('demande_confirmation_etat_modifie', { de: null, vers: 'planifiee', acteur: CONSOLE });
    passe('contestation_modifiee', {
      contestationId: ID,
      de: null,
      vers: 'recue',
      acteur: CONSOLE,
    });
    passe('contestation_modifiee', {
      contestationId: ID,
      de: 'recue',
      vers: 'gel_pose',
      acteur: CONSOLE,
    });
    passe('rattachement_manuel_modifie', { rattachementId: ID, vers: 'decide', acteur: CONSOLE });
  });

  it('REQ-DM-024 : le changement d’un utilisateur de la console accorde `de` et `vers` à son geste, nommé', () => {
    const u = (geste: string, de: string | null, vers: string | null) =>
      refus('utilisateur_console_modifie', { geste, de, vers, acteur: CONSOLE });
    // changer_role : les deux posés, et différents
    expect(u('changer_role', 'lecteur', 'admin')).toEqual([]);
    expect(u('changer_role', 'lecteur', 'lecteur')).toEqual([
      'vers:roles_incoherents_avec_le_geste',
    ]);
    expect(u('changer_role', null, 'admin')).toEqual(['vers:roles_incoherents_avec_le_geste']);
    expect(u('changer_role', 'lecteur', null)).toEqual(['vers:roles_incoherents_avec_le_geste']);
    // inviter : `de` nul, `vers` posé
    expect(u('inviter', null, 'admin')).toEqual([]);
    expect(u('inviter', null, null)).toEqual(['vers:roles_incoherents_avec_le_geste']);
    expect(u('inviter', 'lecteur', 'admin')).toEqual(['vers:roles_incoherents_avec_le_geste']);
    // tout autre geste : les deux nuls
    for (const geste of [
      'relancer',
      'activer',
      'valider',
      'desactiver',
      'reactiver',
      'revoquer_sessions',
    ])
      expect(u(geste, null, null), geste).toEqual([]);
    expect(u('desactiver', 'lecteur', null)).toEqual(['vers:roles_incoherents_avec_le_geste']);
    expect(u('desactiver', null, 'lecteur')).toEqual(['vers:roles_incoherents_avec_le_geste']);
  });

  it('REQ-JUR-006 : la mise en demeure ne porte que l’article, pris dans la liste FERMÉE de l’art. 11.2, et l’acteur de la console', () => {
    for (const article of ['3.7', '6', '7', '8', '9', '23']) {
      passe('apporteur_mis_en_demeure', { article, acteur: CONSOLE });
    }
    expect(refus('apporteur_mis_en_demeure', { article: '10', acteur: CONSOLE })).toHaveLength(1);
    expect(refus('apporteur_mis_en_demeure', { article: '11.2', acteur: CONSOLE })[0]).toMatch(
      /^article:/
    );
    // NI les faits NI aucun texte libre : la charge est fermée.
    expect(
      refus('apporteur_mis_en_demeure', { article: '6', acteur: CONSOLE, faits: 'x' })
    ).toHaveLength(1);
    // Un utilisateur de la console, jamais le système ni l'apporteur.
    expect(refus('apporteur_mis_en_demeure', { article: '6', acteur: { par: 'systeme' } })).toEqual(
      ['acteur:acteur_console_attendu']
    );
    expect(
      refus('apporteur_mis_en_demeure', { article: '6', acteur: { par: 'apporteur', id: ID } })
    ).toEqual(['acteur:acteur_console_attendu']);
  });

  it('REQ-SEC-058 : SEC-59 — le résumé du jour porte cinq clés, fermées, sans aucune donnée de personne', () => {
    const juste = {
      acteur: { par: 'systeme' },
      jourUtc: '2027-01-10',
      lignesNombre: 3,
      empreinteComplete: H,
      empreinteSurvivante: H,
    };
    passe('journal_acces_console_resume', juste);
    passe('journal_acces_console_resume', { ...juste, lignesNombre: 0 });
    passe('journal_acces_console_resume', { ...juste, lignesNombre: 2147483647 });
    // Un acteur autre que le système, avec ou sans identifiant, est refusé.
    expect(
      refus('journal_acces_console_resume', { ...juste, acteur: { par: 'utilisateur_console' } })
    ).toEqual(['acteur:acteur_systeme_attendu']);
    expect(refus('journal_acces_console_resume', { ...juste, acteur: CONSOLE })).toHaveLength(1);
    // Une clé en trop (un identifiant d'employé, une cible), une clé en moins : refusées.
    expect(
      refus('journal_acces_console_resume', { ...juste, utilisateurConsoleId: ID })
    ).toHaveLength(1);
    const { empreinteSurvivante: _s, ...sans } = juste;
    expect(refus('journal_acces_console_resume', sans)).toHaveLength(1);
    // La clé du jour est `jourUtc` : l'ancien nom `jour` est refusé.
    const { jourUtc, ...sansJour } = juste;
    expect(refus('journal_acces_console_resume', { ...sansJour, jour: jourUtc })).toHaveLength(2);
  });

  it('REQ-SEC-058 : SEC-59 — FORMES.compte() : un entier de 0 à 2 147 483 647, rien d’autre', () => {
    const c = FORMES.compte();
    for (const ok of [0, 1, 2147483647]) expect(c.safeParse(ok).success, String(ok)).toBe(true);
    for (const ko of [-1, 1.5, 2147483648, Number.NaN, '3', null]) {
      expect(c.safeParse(ko).success, String(ko)).toBe(false);
    }
  });

  it('REQ-SEC-058 : SEC-59 — FORMES.jourUtc() : AAAA-MM-JJ, ancré aux deux bouts, sans heure', () => {
    const j = FORMES.jourUtc();
    expect(j.safeParse('2027-01-10').success).toBe(true);
    for (const ko of [
      '2027-1-10',
      '27-01-10',
      '2027-01-10T00:00:00.000Z',
      ' 2027-01-10',
      '2027-01-10\n',
      '',
    ]) {
      expect(j.safeParse(ko).success, ko).toBe(false);
    }
    expect(JOUR_UTC.test('2027-01-10')).toBe(true);
    expect(JOUR_UTC.test('x2027-01-10')).toBe(false);
  });
});
