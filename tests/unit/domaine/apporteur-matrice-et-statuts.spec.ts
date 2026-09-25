// @req REQ-DM-011
// @req REQ-DM-010
// @req REQ-CPL-027
/**
 * `apporteur-matrice-et-statuts.spec.ts` — DM-06 : le statut d'apporteur est un ENUM, ses
 * transitions une MATRICE explicite, et `actif` / `dormant` ne sont PAS des statuts.
 *
 * TÉMOIN À DEUX FACES (acceptance, point 7). Face rouge : un couple (état, événement) absent de la
 * matrice est refusé et l'erreur le NOMME (`de × evenement`). Face verte : chaque couple déclaré
 * passe. Le balayage est EXHAUSTIF — 9 statuts × les événements —, pour qu'une transition ne soit
 * jamais autorisée par omission (CONVENTIONS §2 : matrice `from × événement → to`).
 *
 * Les vocabulaires sont confrontés à leurs DEUX sources : le texte de REQ-DM-011 (lu dans
 * `docs/requirements.json`) et l'enum du schéma Prisma (lu par le lecteur unique).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma, type ModelePrisma } from '../../../scripts/lot/lecteur-prisma';
import { texteDeLaReq } from '../../../scripts/gates/schema-enums';
import {
  EVENEMENTS_APPORTEUR,
  MOTIFS_RESILIATION,
  STATUTS_APPORTEUR,
  estEvenementApporteur,
  estStatutApporteur,
  type EvenementApporteur,
  type MotifResiliation,
  type StatutApporteur,
} from '../../../src/domain/apporteur/statut';
import {
  ErreurTransitionApporteur,
  TRANSITIONS_APPORTEUR,
  transitionner,
} from '../../../src/domain/apporteur/matrice';
import { seuilPrioritaire } from '../../../src/domain/attribution/seuil-prioritaire';

const SCHEMA = lireSchemaPrisma(readFileSync('prisma/schema.prisma', 'utf8'));

function modele(nom: string): ModelePrisma {
  const m = SCHEMA.modeles.find((x) => x.nom === nom);
  if (m === undefined) throw new Error(`modèle ${nom} absent de prisma/schema.prisma`);
  return m;
}

function valeursDeLEnum(nom: string): string[] {
  const e = SCHEMA.enums.find((x) => x.nom === nom);
  if (e === undefined) throw new Error(`enum ${nom} absent de prisma/schema.prisma`);
  return e.valeurs;
}

/** Les valeurs du premier `{…}` qui suit `ancre` dans le texte de l'exigence. */
function accoladeApres(texte: string, ancre: string): string[] {
  const debut = texte.indexOf(ancre);
  expect(debut, `« ${ancre} » introuvable dans l'exigence`).toBeGreaterThanOrEqual(0);
  const m = /\{([^}]*)\}/.exec(texte.slice(debut));
  if (m === null) throw new Error(`aucune accolade après « ${ancre} »`);
  return m[1]!.split(',').map((v) => v.trim());
}

function levee(f: () => unknown): ErreurTransitionApporteur {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurTransitionApporteur) return e;
    throw e;
  }
  throw new Error('aucune levée');
}

describe('REQ-DM-011 — le statut d’apporteur est un enum à neuf valeurs, le motif de résiliation aussi', () => {
  const texte = texteDeLaReq('REQ-DM-011');

  it('REQ-DM-011 : STATUTS_APPORTEUR égale le texte de l’exigence ET l’enum du schéma', () => {
    const attendus = accoladeApres(texte, 'enum');
    expect(attendus).toHaveLength(9);
    expect([...STATUTS_APPORTEUR]).toEqual(attendus);
    expect(valeursDeLEnum('StatutApporteur')).toEqual(attendus);
  });

  it('REQ-DM-011 : MOTIFS_RESILIATION égale l’exigence et le schéma, sans le vocabulaire de la faute', () => {
    const attendus = accoladeApres(texte, '`resiliationMotif` enum');
    expect([...MOTIFS_RESILIATION]).toEqual(attendus);
    expect(valeursDeLEnum('MotifResiliation')).toEqual(attendus);
    for (const m of MOTIFS_RESILIATION) expect(m).not.toMatch(/faute|sanction|strike/i);
  });

  it('REQ-DM-011 : la colonne `statut` d’Apporteur est l’enum, `resiliationMotif` l’enum des motifs', () => {
    const champs = modele('Apporteur').champs;
    expect(champs.find((c) => c.nom === 'statut')).toMatchObject({
      type: 'StatutApporteur',
      optionnel: false,
    });
    expect(champs.find((c) => c.nom === 'resiliationMotif')).toMatchObject({
      type: 'MotifResiliation',
      optionnel: true,
    });
  });
});

describe('REQ-DM-011 — la matrice état × événement : ce qui n’y est pas est refusé', () => {
  // Les flèches attendues, écrites ICI et non relues dans le module jugé : un événement par
  // flèche, et le statut d'arrivée de chacune (CONVENTIONS §2, `from × événement → to`).
  const ATTENDUES: readonly [StatutApporteur, EvenementApporteur, StatutApporteur][] = [
    ['candidat', 'retenir', 'retenu'],
    ['candidat', 'mettre_en_vivier', 'vivier'],
    ['candidat', 'refuser', 'refuse'],
    ['vivier', 'retenir', 'retenu'],
    ['vivier', 'refuser', 'refuse'],
    ['retenu', 'ouvrir_kyc', 'kyc_en_cours'],
    ['kyc_en_cours', 'valider_kyc', 'pret_a_signer'],
    ['pret_a_signer', 'signer', 'signe'],
    ['signe', 'suspendre', 'suspendu'],
    ['signe', 'resilier', 'resilie'],
    ['suspendu', 'lever_suspension', 'signe'],
    ['suspendu', 'resilier', 'resilie'],
  ];
  const motifDe = (e: EvenementApporteur) => (e === 'resilier' ? 'ordinaire_axion' : null);

  it('REQ-DM-011 : les événements forment une liste fermée, un nom par flèche, sans doublon', () => {
    expect([...EVENEMENTS_APPORTEUR].sort()).toEqual(
      [...new Set(ATTENDUES.map((a) => a[1]))].sort()
    );
    expect(new Set(EVENEMENTS_APPORTEUR).size).toBe(EVENEMENTS_APPORTEUR.length);
  });

  it('REQ-DM-011 : la matrice a une ligne par statut, et ne nomme que des événements et des statuts', () => {
    expect(Object.keys(TRANSITIONS_APPORTEUR).sort()).toEqual([...STATUTS_APPORTEUR].sort());
    for (const ligne of Object.values(TRANSITIONS_APPORTEUR)) {
      for (const [evenement, cible] of Object.entries(ligne)) {
        expect(estEvenementApporteur(evenement), evenement).toBe(true);
        expect(estStatutApporteur(cible as string), String(cible)).toBe(true);
      }
    }
  });

  it('REQ-DM-011 : face ROUGE — un couple (état, événement) absent est refusé, et l’erreur le NOMME', () => {
    const e = levee(() =>
      transitionner({ de: 'signe', evenementApporteur: 'retenir', motif: null })
    );
    expect(e.code).toBe('transition_refusee');
    expect(e.message).toContain('signe × retenir');
  });

  it('REQ-DM-011 : face VERTE — un couple déclaré passe et rend son statut d’arrivée', () => {
    expect(transitionner({ de: 'candidat', evenementApporteur: 'retenir', motif: null })).toEqual({
      statut: 'retenu',
      resiliationMotif: null,
    });
  });

  it('REQ-DM-011 : balayage des 9 × |événements| cellules — passe si et seulement si attendue', () => {
    let passees = 0;
    for (const de of STATUTS_APPORTEUR) {
      for (const evenement of EVENEMENTS_APPORTEUR) {
        const attendue = ATTENDUES.find((a) => a[0] === de && a[1] === evenement);
        const demande = { de, evenementApporteur: evenement, motif: motifDe(evenement) } as const;
        if (attendue !== undefined) {
          passees += 1;
          expect(transitionner(demande).statut, `${de} × ${evenement}`).toBe(attendue[2]);
        } else {
          expect(levee(() => transitionner(demande)).message).toContain(`${de} × ${evenement}`);
        }
      }
    }
    expect(passees).toBe(ATTENDUES.length);
  });

  it('REQ-DM-011 : `refuse` et `resilie` sont sans issue', () => {
    expect(TRANSITIONS_APPORTEUR.refuse).toEqual({});
    expect(TRANSITIONS_APPORTEUR.resilie).toEqual({});
  });

  it('REQ-DM-011 : `resilier` EXIGE un motif, et un autre événement n’en porte aucun', () => {
    expect(
      levee(() => transitionner({ de: 'signe', evenementApporteur: 'resilier', motif: null })).code
    ).toBe('motif_requis');
    expect(
      levee(() =>
        transitionner({ de: 'candidat', evenementApporteur: 'retenir', motif: 'manquement_grave' })
      ).code
    ).toBe('motif_interdit');
    expect(
      transitionner({ de: 'suspendu', evenementApporteur: 'resilier', motif: 'manquement_grave' })
    ).toEqual({ statut: 'resilie', resiliationMotif: 'manquement_grave' });
  });

  it('REQ-DM-011 : un motif hors vocabulaire est refusé et NOMMÉ — le mot de la faute ne passe pas', () => {
    const e = levee(() =>
      transitionner({
        de: 'signe',
        evenementApporteur: 'resilier',
        motif: 'faute' as MotifResiliation,
      })
    );
    expect(e.code).toBe('motif_inconnu');
    expect(e.message).toContain('faute');
  });

  it('REQ-DM-011 : un statut ou un événement hors vocabulaire est refusé à l’entrée', () => {
    expect(
      levee(() =>
        transitionner({ de: 'actif' as StatutApporteur, evenementApporteur: 'signer', motif: null })
      ).code
    ).toBe('statut_inconnu');
    expect(
      levee(() =>
        transitionner({
          de: 'signe',
          evenementApporteur: 'reactiver' as EvenementApporteur,
          motif: null,
        })
      ).code
    ).toBe('evenement_inconnu');
  });
});

describe('REQ-CPL-027 — `actif` et `dormant` sont dérivés, jamais stockés', () => {
  it('REQ-CPL-027 : ni `actif` ni `dormant` ne sont des statuts, ni dans le code ni dans le schéma', () => {
    for (const derive of ['actif', 'dormant']) {
      expect(estStatutApporteur(derive)).toBe(false);
      expect(valeursDeLEnum('StatutApporteur')).not.toContain(derive);
    }
  });

  it('REQ-CPL-027 : Apporteur ne porte aucune colonne d’activité (actif, dormant, inactif, isActive)', () => {
    for (const c of modele('Apporteur').champs) {
      expect(`${c.nom} ${c.colonne}`).not.toMatch(/actif|dormant|isactive|is_active|churn/i);
    }
  });
});

describe('REQ-DM-010 — le seuil de vérification prioritaire est une colonne entière', () => {
  it('REQ-DM-010 : `seuilVerificationPrioritaire` est un Int nullable — nul, le défaut dérive du palier', () => {
    const champs = modele('Apporteur').champs;
    expect(champs.find((c) => c.nom === 'seuilVerificationPrioritaire')).toMatchObject({
      type: 'Int',
      optionnel: true,
    });
    // Aucun défaut littéral en base : la valeur par défaut est CALCULÉE depuis le palier (RM-10).
    const seuil = champs.find((c) => c.nom === 'seuilVerificationPrioritaire')!;
    expect(seuil.attributs.join(' ')).not.toContain('@default');
  });

  it('REQ-DM-010 : la surcharge manuelle est TRACÉE par son horodatage, colonne à colonne', () => {
    const trace = modele('Apporteur').champs.find(
      (c) => c.nom === 'seuilVerificationPrioritaireAt'
    );
    expect(trace).toMatchObject({ type: 'DateTime', optionnel: true });
  });

  it('REQ-DM-010 : la colonne nulle laisse le palier décider, une surcharge le remplace', () => {
    // La colonne est l'entrée `surchargeManuelle` de la fonction unique : rien n'est rejugé ici.
    const nulle = { palierConfiance: 5, capaciteRestante: 9, surchargeManuelle: null };
    expect(seuilPrioritaire(nulle)).toBe(5);
    expect(seuilPrioritaire({ ...nulle, surchargeManuelle: 12 })).toBe(12);
  });
});
