// @req REQ-DM-001
// @req REQ-DM-038
/**
 * Le schéma Partners tient ses deux conventions de fond — DM-01.
 *
 * REQ-DM-001 : tout montant est un `Int` en centimes suffixé `Cents` ; aucun `Float` ni `Decimal`,
 * aucune valeur en euros. La règle est celle de `partners:schema:cents`
 * (`scripts/gates/schema-cents.ts`) : ce fichier l'IMPORTE — le prédicat provisoire qu'il portait
 * est mort avec DM-02 (RM-01), et ses trois mots de montant sont passés dans la garde.
 *
 * REQ-DM-038 : toute colonne de vocabulaire est un enum. La règle est déjà celle de
 * `partners:schema:enums` (`scripts/gates/schema-enums.ts`) : ce fichier l'EXÉCUTE sur le schéma que
 * DM-01 écrit, sans la réécrire.
 *
 * Les témoins sont des schémas de bac : ils prouvent que chaque prédicat SAIT rougir, en nommant
 * `Modèle.champ`, sur le défaut exact que l'exigence interdit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  champsDuSchema,
  controler,
  enumsDuSchema,
  vueDuDepot,
} from '../../../scripts/gates/schema-enums';
import { controler as controlerCents } from '../../../scripts/gates/schema-cents';

const SCHEMA = () => readFileSync('prisma/schema.prisma', 'utf8');

/** REQ-DM-001, par la garde elle-même. Rend `famille — message` par faute. */
function fautesCentimes(schema: string): string[] {
  return controlerCents(schema).map((f) => `${f.famille} — ${f.message}`);
}

const bac = (champs: string) => `model Bac {\n  id String @id\n${champs}\n}\n`;

describe('REQ-DM-001 — tout montant est un Int en centimes suffixé Cents', () => {
  it('REQ-DM-001 : le schéma du dépôt ne porte aucun Float, aucun Decimal, aucun montant hors Cents', () => {
    expect(champsDuSchema(SCHEMA()).length).toBeGreaterThan(0);
    expect(fautesCentimes(SCHEMA())).toEqual([]);
  });

  it.each([
    [
      'un montant en euros à virgule',
      '  montantEuros Float',
      'virgule_flottante',
      'Bac.montantEuros',
    ],
    ['un montant sans suffixe', '  montantHt Int', 'montant_sans_suffixe', 'Bac.montantHt'],
    ['un Decimal', '  tauxCents Decimal', 'virgule_flottante', 'Bac.tauxCents'],
    ['des centimes en chaîne', '  primeCents String', 'centimes_non_entiers', 'Bac.primeCents'],
    [
      'une rémunération sans suffixe',
      '  remunerationHt Int',
      'montant_sans_suffixe',
      'Bac.remunerationHt',
    ],
    ['des euros entiers', '  totalEuros Int', 'montant_sans_suffixe', 'Bac.totalEuros'],
  ])('REQ-DM-001 : %s rougit en nommant Modèle.champ', (_quoi, champ, famille, nomme) => {
    const fautes = fautesCentimes(bac(champ));
    const nommee = fautes.some((f) => f.startsWith(`${famille} — `) && f.includes(nomme));
    expect(nommee, fautes.join(' | ')).toBe(true);
  });

  it('REQ-DM-001 : contre-témoin — un montant HT en centimes entiers, signé, passe', () => {
    expect(fautesCentimes(bac('  montantHtCents Int\n  ligneCommissionId String'))).toEqual([]);
  });
});

describe('REQ-DM-038 — toute colonne de vocabulaire est un enum', () => {
  it('REQ-DM-038 : `partners:schema:enums` sort sans faute sur le dépôt', () => {
    expect(controler(vueDuDepot()).map((f) => `[${f.famille}] ${f.message}`)).toEqual([]);
  });

  it('REQ-DM-038 : Evenement.type est confronté, et c’est un enum du schéma', () => {
    const type = champsDuSchema(SCHEMA()).find(
      (c) => c.modele === 'Evenement' && c.champ === 'type'
    );
    expect(type?.type).toBe('TypeEvenementJournal');
    expect(enumsDuSchema(SCHEMA()).get('TypeEvenementJournal')?.length).toBeGreaterThan(0);
  });

  it('REQ-DM-038 : témoin — Evenement.type déclaré en String rougit, nommé', () => {
    const schema = SCHEMA().replace(/^(\s+type\s+)TypeEvenementJournal/m, '$1String');
    expect(schema).not.toBe(SCHEMA());
    const fautes = controler({ ...vueDuDepot(), schema }).filter(
      (f) => f.famille === 'colonne_vocabulaire_en_chaine'
    );
    expect(fautes.map((f) => f.message).join('\n')).toContain('Evenement.type est un String');
  });
});
