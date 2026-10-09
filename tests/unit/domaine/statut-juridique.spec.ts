// @req REQ-DM-065
/**
 * DM-56 — le statut juridique de l'apporteur, une liste FERMÉE rangée dans sa qualité d'exercice.
 *
 * CE QU'IL FIGE :
 *   — `StatutJuridique`, un VRAI enum (partners/ADR-0022 §5) de huit valeurs, dans cet ordre :
 *     `micro_entrepreneur`, `entrepreneur_individuel`, `sarl`, `eurl`, `sas`, `sasu`, `sa`, `snc` ; le
 *     portage salarial et l'entrepreneur-salarié de coopérative n'en sont pas (phase 2 : ils changent
 *     qui signe et qui facture) ;
 *   — la correspondance vers `QualiteExercice`, fonction pure : les six sociétés donnent
 *     `societe_commerciale`, les deux formes individuelles la qualité de l'activité déclarée ;
 *     `QualiteExercice` reste à quatre valeurs ;
 *   — l'accord de la fonction et du CHECK `apporteurs_qualite_suit_le_statut` : ce que la fonction
 *     écrit, la base l'accepte toujours (le CHECK lui-même est jugé en base réelle par
 *     `tests/integration/statut-juridique-check.spec.ts`) ;
 *   — la colonne `apporteurs.statut_juridique`, NULLABLE et sans défaut ;
 *   — la ligne du glossaire §4 : les huit valeurs ET leur libellé, que lit `{{APPORTEUR_STATUT}}` —
 *     jamais une chaîne libre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Prisma, QualiteExercice, StatutJuridique } from '@prisma/client';
import {
  LIBELLES_STATUT_JURIDIQUE,
  QUALITES_EXERCICE,
  QUALITES_INDIVIDUELLES,
  STATUTS_JURIDIQUES,
  STATUTS_SOCIETE,
  estStatutJuridique,
  libelleDuStatut,
  qualiteDuStatut,
} from '../../../src/domain/kyc/statut-juridique';
import { VARIABLES } from '../../../src/domain/contrat/variables';

const STATUTS = [
  'micro_entrepreneur',
  'entrepreneur_individuel',
  'sarl',
  'eurl',
  'sas',
  'sasu',
  'sa',
  'snc',
];
const SOCIETES = ['sarl', 'eurl', 'sas', 'sasu', 'sa', 'snc'];
const INDIVIDUELLES = ['commercant', 'artisan', 'profession_liberale'];

/** Le prédicat du CHECK `apporteurs_qualite_suit_le_statut`, recopié de la précision (b) d'A02. */
function checkAccepte(statut: string | null, qualite: string | null): boolean {
  return (
    statut === null ||
    qualite === null ||
    SOCIETES.includes(statut) === (qualite === 'societe_commerciale')
  );
}

const apporteur = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Apporteur')!;

/** La ligne `StatutJuridique` du glossaire §4. */
function ligneDuGlossaire(): string {
  const ligne = readFileSync('docs/GLOSSAIRE.md', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('| `StatutJuridique`'));
  if (!ligne) throw new Error('StatutJuridique absent du glossaire §4');
  return ligne;
}

describe('REQ-DM-065 — StatutJuridique, la liste fermée', () => {
  it('REQ-DM-065 : TEST HYP — exactement huit statuts, dans cet ordre, au domaine et au schéma', () => {
    expect([...STATUTS_JURIDIQUES]).toEqual(STATUTS);
    expect(Object.values(StatutJuridique)).toEqual(STATUTS);
  });

  it('REQ-DM-065 : TÉMOIN — ni le portage salarial ni l’entrepreneur-salarié de coopérative ne sont des valeurs (phase 2)', () => {
    for (const absent of [
      'portage_salarial',
      'salarie_porte',
      'entrepreneur_salarie',
      'entrepreneur_salarie_cooperative',
      'cae',
      'scop',
    ]) {
      expect(STATUTS_JURIDIQUES as readonly string[]).not.toContain(absent);
      expect(Object.values(StatutJuridique) as string[]).not.toContain(absent);
      expect(estStatutJuridique(absent)).toBe(false);
    }
  });

  it('REQ-DM-065 : TÉMOIN — seule une valeur de la liste, exactement écrite, est un statut juridique', () => {
    for (const s of STATUTS) expect(estStatutJuridique(s)).toBe(true);
    for (const v of [
      'SAS',
      'Sarl',
      ' sas',
      'sas ',
      '',
      'societe',
      'auto_entrepreneur',
      null,
      3,
      {},
      ['sas'],
    ]) {
      expect(estStatutJuridique(v)).toBe(false);
    }
  });

  it('REQ-DM-065 : TÉMOIN — les six sociétés, et elles seules', () => {
    expect([...STATUTS_SOCIETE]).toEqual(SOCIETES);
  });
});

describe('REQ-DM-065 — la correspondance vers QualiteExercice', () => {
  it('REQ-DM-065 : TEST HYP — QualiteExercice reste à quatre valeurs (DM-50), au domaine et au schéma', () => {
    const quatre = ['commercant', 'societe_commerciale', 'artisan', 'profession_liberale'];
    expect([...QUALITES_EXERCICE]).toEqual(quatre);
    expect(Object.values(QualiteExercice)).toEqual(quatre);
    expect([...QUALITES_INDIVIDUELLES]).toEqual(INDIVIDUELLES);
  });

  it('REQ-DM-065 : TÉMOIN — chacune des six sociétés donne `societe_commerciale`, quelle que soit l’activité', () => {
    for (const s of SOCIETES) {
      expect(qualiteDuStatut(s as never)).toBe('societe_commerciale');
      for (const a of INDIVIDUELLES)
        expect(qualiteDuStatut(s as never, a as never)).toBe('societe_commerciale');
    }
  });

  it('REQ-DM-065 : TÉMOIN — micro-entrepreneur et entrepreneur individuel donnent la qualité de l’activité déclarée', () => {
    for (const s of ['micro_entrepreneur', 'entrepreneur_individuel']) {
      expect(qualiteDuStatut(s as never, 'commercant')).toBe('commercant');
      expect(qualiteDuStatut(s as never, 'artisan')).toBe('artisan');
      expect(qualiteDuStatut(s as never, 'profession_liberale')).toBe('profession_liberale');
    }
  });

  it('REQ-DM-065 : TÉMOIN — une forme individuelle sans activité déclarée, ou avec une activité hors liste, n’a pas de qualité', () => {
    for (const s of ['micro_entrepreneur', 'entrepreneur_individuel']) {
      expect(qualiteDuStatut(s as never)).toBeNull();
      expect(qualiteDuStatut(s as never, 'societe_commerciale' as never)).toBeNull();
      expect(qualiteDuStatut(s as never, 'liberal' as never)).toBeNull();
    }
  });

  it('REQ-DM-065 : TÉMOIN — ce que la fonction écrit, le CHECK `apporteurs_qualite_suit_le_statut` l’accepte toujours', () => {
    for (const s of STATUTS) {
      for (const a of [undefined, ...INDIVIDUELLES]) {
        const q = qualiteDuStatut(s as never, a as never);
        expect(checkAccepte(s, q), `${s} / ${String(a)} → ${String(q)}`).toBe(true);
      }
    }
  });
});

describe('REQ-DM-065 — la colonne et son libellé', () => {
  it('REQ-DM-065 : TÉMOIN — `apporteurs.statut_juridique` porte l’enum, NULLABLE et sans défaut', () => {
    const champ = apporteur.fields.find((f) => f.name === 'statutJuridique');
    expect(champ, 'statutJuridique absent du modèle Apporteur').toBeDefined();
    expect(champ!.type).toBe('StatutJuridique');
    expect(champ!.kind).toBe('enum');
    expect(champ!.isRequired).toBe(false);
    expect(champ!.hasDefaultValue).toBe(false);
  });

  it('REQ-DM-065 : TÉMOIN — `{{APPORTEUR_STATUT}}` lit le statut recueilli au KYC, jamais une saisie', () => {
    expect(VARIABLES['APPORTEUR_STATUT']).toMatchObject({ genre: 'kyc', champ: 'statutJuridique' });
    expect(apporteur.fields.map((f) => f.name)).toContain('statutJuridique');
  });

  it('REQ-DM-065 : TÉMOIN — le glossaire §4 énumère les huit valeurs, dans l’ordre, sous REQ-DM-065', () => {
    const cellules = ligneDuGlossaire()
      .split('|')
      .map((c) => c.trim());
    const valeurs = [...cellules[2]!.split(/ — | ; | \(/)[0]!.matchAll(/`([a-z][a-z0-9_]*)`/g)].map(
      (m) => m[1]
    );
    expect(valeurs).toEqual(STATUTS);
    expect(cellules[3]).toContain('REQ-DM-065');
  });

  it('REQ-DM-065 : TÉMOIN — chaque libellé du domaine est celui du glossaire, dans l’ordre des valeurs', () => {
    const libelles = [...ligneDuGlossaire().matchAll(/«\s*([^»]+?)\s*»/g)].map((m) => m[1]);
    expect(libelles).toEqual(STATUTS.map((s) => libelleDuStatut(s as never)));
    expect(Object.keys(LIBELLES_STATUT_JURIDIQUE)).toEqual(STATUTS);
  });

  it('REQ-DM-065 : TÉMOIN — aucun libellé vide, aucun libellé partagé par deux statuts', () => {
    const libelles = STATUTS.map((s) => libelleDuStatut(s as never));
    for (const l of libelles) expect(l.trim().length).toBeGreaterThan(0);
    expect(new Set(libelles).size).toBe(STATUTS.length);
  });
});
