// @req REQ-GOV-026
/**
 * GOV-143 — UNE EXCEPTION DE BRANCHE NOMMÉE, FERMÉE ET DATÉE. La tâche livrée par #539 l'a été
 * depuis une branche que le motif de branche (partners/ADR-0007) refuse. La règle ne change pas :
 * une liste d'UN couple (tâche, branche), attesté par sa PR et son sha, l'admet, et lui seul.
 *
 * CE QUE CE FICHIER GARDE : la liste est fermée et datée avant la règle donnée aux auteurs ; le
 * schéma admet ce couple et aucun autre ; `lot:cloture` ne l'admet que sur la PR et le sha attestés ;
 * la même branche sur une autre tâche, ou une branche hors motif neuve, reste refusée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  BRANCHES_HORS_MOTIF_ADMISES,
  ErreurDeCloture,
  REGLE_DES_BRANCHES_DONNEE_LE,
  brancheHorsMotifAdmise,
  cloturerUneTacheSeule,
  motifDeBranche,
  type Livraison,
  type Tache,
} from '../../../scripts/lot/cloture';

const SHA = 'f642921fb6e9c45e43131d899ef00d10b29417fc';
const ATTESTEE: Livraison = { pr: 539, sha: SHA, branch: 'feat/INT-T08-P' };

type Doc = { version: number; taches: (Tache & Record<string, unknown>)[] };
const lireDoc = (): Doc => JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as Doc;
const schema = JSON.parse(readFileSync('scripts/lot/tasks.schema.json', 'utf8')) as object;

/** Les erreurs du schéma qui portent sur une `branch`, pour un document donné. */
function erreursDeBranche(doc: Doc): string[] {
  const ajv = new (
    Ajv2020 as unknown as {
      new (o: object): {
        validate: (s: object, d: unknown) => boolean;
        errors?: { instancePath?: string; message?: string }[];
      };
    }
  )({ allErrors: true, strict: false });
  ajv.validate(schema, doc);
  return (ajv.errors ?? [])
    .filter((e) => (e.instancePath ?? '').endsWith('/branch'))
    .map((e) => `${e.instancePath} ${e.message}`);
}

/** Le document où la tâche `id` porte la branche `branche`, et rien d'autre ne change. */
function avecBranche(id: string, branche: string): Doc {
  const doc = lireDoc();
  const t = doc.taches.find((x) => x.id === id);
  if (!t) throw new Error(`${id} absente du registre`);
  t.branch = branche;
  return doc;
}

/** Les familles de refus de la clôture d'une tâche, sur une livraison donnée. */
function familles(tacheId: string, livraison: Livraison): string[] {
  const doc = lireDoc();
  try {
    cloturerUneTacheSeule({ tacheId, livraison, taches: doc.taches });
  } catch (e) {
    if (e instanceof ErreurDeCloture) return e.refus.map((r) => r.famille);
    throw e;
  }
  return [];
}

/** Une autre tâche de ce dépôt que INT-T08-P, à faire. */
function uneAutreTache(): string {
  const t = lireDoc().taches.find(
    (x) => x.id !== 'INT-T08-P' && x.statut === 'a_faire' && !x.lot && x.repo === 'partners'
  );
  if (!t) throw new Error('aucune autre tâche à faire');
  return t.id;
}

describe('REQ-GOV-026 — GOV-143 : la liste des branches hors motif admises', () => {
  it('REQ-GOV-026 : TÉMOIN — la liste est FERMÉE : un seul couple, INT-T08-P sur feat/INT-T08-P, attesté par #539 et son sha', () => {
    expect(BRANCHES_HORS_MOTIF_ADMISES).toEqual([
      { tache: 'INT-T08-P', branche: 'feat/INT-T08-P', pr: 539, sha: SHA, avant: '2026-10-03' },
    ]);
  });

  it('REQ-GOV-026 : TÉMOIN — chaque exception est datée AU PLUS TARD du jour de la règle donnée aux auteurs (branches t/<id>)', () => {
    expect(REGLE_DES_BRANCHES_DONNEE_LE).toBe('2026-10-03');
    for (const e of BRANCHES_HORS_MOTIF_ADMISES) {
      expect(e.avant <= REGLE_DES_BRANCHES_DONNEE_LE, `${e.tache} datée du ${e.avant}`).toBe(true);
    }
  });

  it('REQ-GOV-026 : le motif lui-même ne change pas — feat/INT-T08-P y reste refusée', () => {
    expect(motifDeBranche().test('feat/INT-T08-P')).toBe(false);
    expect(motifDeBranche().test('t/int-t08-p')).toBe(true);
  });

  it('REQ-GOV-026 : TÉMOIN — le couple n’est admis que sur la PR et le sha attestés', () => {
    expect(brancheHorsMotifAdmise('INT-T08-P', ATTESTEE)).toBe(true);
    expect(brancheHorsMotifAdmise('INT-T08-P', { ...ATTESTEE, pr: 540 })).toBe(false);
    expect(brancheHorsMotifAdmise('INT-T08-P', { ...ATTESTEE, sha: SHA.slice(0, 7) })).toBe(false);
    expect(brancheHorsMotifAdmise('INT-T08-P', { ...ATTESTEE, branch: 'feat/INT-T08-Q' })).toBe(
      false
    );
    expect(brancheHorsMotifAdmise(uneAutreTache(), ATTESTEE)).toBe(false);
  });
});

describe('REQ-GOV-026 — GOV-143 : le schéma admet ce couple et SEULEMENT lui', () => {
  it('REQ-GOV-026 : TÉMOIN — feat/INT-T08-P est admise sur INT-T08-P', () => {
    expect(erreursDeBranche(avecBranche('INT-T08-P', 'feat/INT-T08-P'))).toEqual([]);
  });

  it('REQ-GOV-026 : TÉMOIN — feat/INT-T08-P sur une AUTRE tâche est refusée par le schéma', () => {
    expect(erreursDeBranche(avecBranche(uneAutreTache(), 'feat/INT-T08-P')).length).toBeGreaterThan(
      0
    );
  });

  it('REQ-GOV-026 : TÉMOIN — INT-T08-P n’admet aucune autre branche hors motif', () => {
    expect(erreursDeBranche(avecBranche('INT-T08-P', 'feat/autre')).length).toBeGreaterThan(0);
  });

  it('REQ-GOV-026 : le schéma ne porte aucun anyOf qui admettrait la branche pour n’importe quelle tâche', () => {
    const texte = readFileSync('scripts/lot/tasks.schema.json', 'utf8');
    const occurrences = texte.split('feat/INT-T08-P').length - 1;
    expect(occurrences).toBe(1);
    expect(texte).toContain('"const": "INT-T08-P"');
  });
});

describe('REQ-GOV-026 — GOV-143 : lot:cloture', () => {
  it('REQ-GOV-026 : TÉMOIN — feat/INT-T08-P sur une AUTRE tâche est refusée (branche_hors_motif)', () => {
    expect(familles(uneAutreTache(), ATTESTEE)).toContain('branche_hors_motif');
  });

  it('REQ-GOV-026 : TÉMOIN — feat/XXX sur une nouvelle tâche est refusée (branche_hors_motif)', () => {
    expect(familles(uneAutreTache(), { ...ATTESTEE, branch: 'feat/XXX' })).toContain(
      'branche_hors_motif'
    );
  });

  it('REQ-GOV-026 : TÉMOIN — INT-T08-P, sur la PR et le sha attestés, n’est pas refusée pour sa branche', () => {
    expect(familles('INT-T08-P', ATTESTEE)).not.toContain('branche_hors_motif');
  });

  it('REQ-GOV-026 : TÉMOIN — INT-T08-P sur un autre sha reste refusée pour sa branche', () => {
    expect(familles('INT-T08-P', { ...ATTESTEE, sha: 'a'.repeat(40) })).toContain(
      'branche_hors_motif'
    );
  });
});
