// @req REQ-JUR-022
/**
 * DM-50 — les deux vocabulaires de conformité de l'apporteur, en VRAIS enums (partners/ADR-0022 §5 et
 * §16), et leurs colonnes nullables sur `apporteurs`.
 *
 * CE QU'IL FIGE :
 *   — `QualiteExercice`, liste FERMÉE d'A07 : `commercant`, `societe_commerciale`, `artisan`,
 *     `profession_liberale`, dans cet ordre ; aucun « micro-entrepreneur » (un régime, pas une
 *     qualité) ; les deux premières rendent applicable la clause attributive de juridiction (art. 48
 *     CPC), les deux autres renvoient au droit commun ;
 *   — `ProfessionReglementee`, une valeur par code NAF de REQ-JUR-022 sous HYP-JUR-PROF-REGLEMENTEES :
 *     `expertise_comptable` (69.20Z), `auxiliaire_services_financiers` (66.19B),
 *     `intermediaire_assurance` (66.22Z) ; un changement fait rougir ce test, et passe par le registre ;
 *   — les deux colonnes `qualite_exercice` et `profession_reglementee`, nullables (un apporteur
 *     existant n'a pas encore déclaré), portées par leur enum ;
 *   — la ligne du glossaire §4 de chaque enum.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Prisma, ProfessionReglementee, QualiteExercice } from '@prisma/client';

const QUALITES = ['commercant', 'societe_commerciale', 'artisan', 'profession_liberale'];
/** Art. 48 CPC : la clause attributive de juridiction ne vaut qu'entre commerçants. */
const CLAUSE_ATTRIBUTIVE_APPLICABLE = ['commercant', 'societe_commerciale'];
const PROFESSIONS: Record<string, string> = {
  expertise_comptable: '69.20Z',
  auxiliaire_services_financiers: '66.19B',
  intermediaire_assurance: '66.22Z',
};

const apporteur = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Apporteur')!;
const champ = (nom: string) => apporteur.fields.find((f) => f.name === nom);

describe('REQ-JUR-022 — QualiteExercice, la liste fermée d’A07', () => {
  it('REQ-JUR-022 : TEST HYP — exactement quatre qualités, dans cet ordre, sans micro-entrepreneur', () => {
    expect(Object.values(QualiteExercice)).toEqual(QUALITES);
    expect(Object.values(QualiteExercice)).not.toContain('micro_entrepreneur');
  });

  it('REQ-JUR-022 : TÉMOIN — la clause attributive de juridiction ne vaut que pour les deux premières', () => {
    expect(QUALITES.filter((q) => CLAUSE_ATTRIBUTIVE_APPLICABLE.includes(q))).toEqual([
      'commercant',
      'societe_commerciale',
    ]);
    expect(QUALITES.filter((q) => !CLAUSE_ATTRIBUTIVE_APPLICABLE.includes(q))).toEqual([
      'artisan',
      'profession_liberale',
    ]);
  });
});

describe('REQ-JUR-022 — ProfessionReglementee, une valeur par code NAF (HYP-JUR-PROF-REGLEMENTEES)', () => {
  it('REQ-JUR-022 : TEST HYP — exactement trois professions, chacune à son code NAF du registre', () => {
    expect(Object.values(ProfessionReglementee)).toEqual(Object.keys(PROFESSIONS));
    const decision = readFileSync('docs/DECISIONS.md', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('| HYP-JUR-PROF-REGLEMENTEES |'));
    expect(decision, 'HYP-JUR-PROF-REGLEMENTEES absente du registre').toBeDefined();
    for (const naf of Object.values(PROFESSIONS)) expect(decision).toContain(naf);
  });
});

describe('REQ-JUR-022 — les colonnes de l’apporteur', () => {
  it('REQ-JUR-022 : qualiteExercice et professionReglementee sont nullables, portées par leur enum', () => {
    expect(champ('qualiteExercice')).toMatchObject({
      type: 'QualiteExercice',
      kind: 'enum',
      isRequired: false,
      dbName: 'qualite_exercice',
    });
    expect(champ('professionReglementee')).toMatchObject({
      type: 'ProfessionReglementee',
      kind: 'enum',
      isRequired: false,
      dbName: 'profession_reglementee',
    });
  });

  it('REQ-JUR-022 : chaque enum a sa ligne au glossaire §4, valeurs dans l’ordre', () => {
    const glossaire = readFileSync('docs/GLOSSAIRE.md', 'utf8').split('\n');
    for (const [nom, valeurs] of [
      ['QualiteExercice', QUALITES],
      ['ProfessionReglementee', Object.keys(PROFESSIONS)],
    ] as const) {
      const ligne = glossaire.find((l) => l.startsWith(`| \`${nom}\``));
      expect(ligne, nom).toBeDefined();
      expect(ligne).toContain(valeurs.map((v) => `\`${v}\``).join(', '));
    }
  });
});
