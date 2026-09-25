// @req REQ-DM-011
// @req REQ-DM-010
// @req REQ-CPL-027
/**
 * `apporteur-matrice-et-statuts.spec.ts` — DM-06 : le statut d'apporteur est un ENUM, ses
 * transitions une MATRICE explicite, et `actif` / `dormant` ne sont PAS des statuts.
 *
 * TÉMOIN À DEUX FACES (acceptance, point 7). Face rouge : une transition absente de la matrice est
 * refusée et l'erreur la NOMME (`de -> vers`). Face verte : chaque transition déclarée passe.
 * Le balayage est EXHAUSTIF — les 81 couples (de, vers) —, pour qu'une transition ne soit jamais
 * autorisée par omission.
 *
 * Les vocabulaires sont confrontés à leurs DEUX sources : le texte de REQ-DM-011 (lu dans
 * `docs/requirements.json`) et l'enum du schéma Prisma (lu par le lecteur unique).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireSchemaPrisma, type ModelePrisma } from '../../../scripts/lot/lecteur-prisma';
import { texteDeLaReq } from '../../../scripts/gates/schema-enums';
import {
  MOTIFS_RESILIATION,
  STATUTS_APPORTEUR,
  estStatutApporteur,
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

describe('REQ-DM-011 — la matrice de transitions : ce qui n’y est pas est refusé', () => {
  it('REQ-DM-011 : la matrice a une ligne pour chacun des neuf statuts, et ne nomme que des statuts', () => {
    expect(Object.keys(TRANSITIONS_APPORTEUR).sort()).toEqual([...STATUTS_APPORTEUR].sort());
    for (const cibles of Object.values(TRANSITIONS_APPORTEUR)) {
      for (const c of cibles) expect(estStatutApporteur(c), c).toBe(true);
    }
  });

  it('REQ-DM-011 : face ROUGE — une transition absente est refusée, et l’erreur la NOMME', () => {
    const e = levee(() => transitionner({ de: 'signe', vers: 'candidat', motif: null }));
    expect(e.code).toBe('transition_refusee');
    expect(e.message).toContain('signe -> candidat');
  });

  it('REQ-DM-011 : face VERTE — une transition déclarée passe et rend sa cible', () => {
    expect(transitionner({ de: 'candidat', vers: 'retenu', motif: null })).toEqual({
      statut: 'retenu',
      resiliationMotif: null,
    });
  });

  it('REQ-DM-011 : balayage des 81 couples — passe si et seulement si la matrice le déclare', () => {
    let declarees = 0;
    for (const de of STATUTS_APPORTEUR) {
      for (const vers of STATUTS_APPORTEUR) {
        const permis = (TRANSITIONS_APPORTEUR[de] as readonly StatutApporteur[]).includes(vers);
        const motif = vers === 'resilie' ? 'ordinaire_axion' : null;
        if (permis) {
          declarees += 1;
          expect(transitionner({ de, vers, motif }).statut).toBe(vers);
        } else {
          expect(levee(() => transitionner({ de, vers, motif })).message).toContain(
            `${de} -> ${vers}`
          );
        }
      }
    }
    // Ni vide (tout refusé) ni pleine (tout permis) : les deux seraient une matrice par omission.
    expect(declarees).toBeGreaterThan(0);
    expect(declarees).toBeLessThan(81);
  });

  it('REQ-DM-011 : `resilie` est sans issue, et un statut ne transitionne jamais vers lui-même', () => {
    expect(TRANSITIONS_APPORTEUR.resilie).toEqual([]);
    for (const s of STATUTS_APPORTEUR) {
      expect(TRANSITIONS_APPORTEUR[s] as readonly string[], s).not.toContain(s);
    }
  });

  it('REQ-DM-011 : la résiliation EXIGE un motif, et une autre transition n’en porte aucun', () => {
    expect(levee(() => transitionner({ de: 'signe', vers: 'resilie', motif: null })).code).toBe(
      'motif_requis'
    );
    expect(
      levee(() => transitionner({ de: 'candidat', vers: 'retenu', motif: 'manquement_grave' })).code
    ).toBe('motif_interdit');
    expect(transitionner({ de: 'suspendu', vers: 'resilie', motif: 'manquement_grave' })).toEqual({
      statut: 'resilie',
      resiliationMotif: 'manquement_grave',
    });
  });

  it('REQ-DM-011 : une valeur hors vocabulaire est refusée à l’entrée, jamais comparée', () => {
    const e = levee(() =>
      transitionner({ de: 'actif' as StatutApporteur, vers: 'signe', motif: null })
    );
    expect(e.code).toBe('statut_inconnu');
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
