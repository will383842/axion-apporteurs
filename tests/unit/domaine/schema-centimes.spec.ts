// @req REQ-DM-001
// @req REQ-DM-038
/**
 * Le schéma Partners tient ses deux conventions de fond — DM-01.
 *
 * REQ-DM-001 : tout montant est un `Int` en centimes suffixé `Cents` ; aucun `Float` ni `Decimal`,
 * aucune valeur en euros. Le prédicat ci-dessous est PROVISOIRE et assumé : la garde du schéma
 * (`partners:schema:cents`) n'existe pas encore ; quand elle arrivera, ce fichier importera sa
 * fonction au lieu de porter la sienne — le doublon vit une tâche, pas plus.
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
import { segmentsDuNom } from '../../../src/domain/donnees-personnelles/champs';

const SCHEMA = () => readFileSync('prisma/schema.prisma', 'utf8');

/** Les segments de nom qui annoncent un montant. `commission` n'y est pas : `ligneCommissionId`. */
const SEGMENTS_DE_MONTANT = new Set(['montant', 'prix', 'solde', 'remuneration', 'euro', 'euros']);

/** REQ-DM-001, en trois règles. Rend `Modèle.champ — motif` par faute. */
function fautesCentimes(schema: string): string[] {
  const fautes: string[] = [];
  for (const { modele, champ, type } of champsDuSchema(schema)) {
    const ou = `${modele}.${champ}`;
    if (type === 'Float' || type === 'Decimal') fautes.push(`${ou} — ${type} interdit`);
    if (champ.endsWith('Cents') && type !== 'Int') fautes.push(`${ou} — …Cents doit être un Int`);
    const montant = segmentsDuNom(champ).some((s) => SEGMENTS_DE_MONTANT.has(s));
    if (montant && !champ.endsWith('Cents')) fautes.push(`${ou} — montant non suffixé Cents`);
  }
  return fautes;
}

const bac = (champs: string) => `model Bac {\n  id String @id\n${champs}\n}\n`;

describe('REQ-DM-001 — tout montant est un Int en centimes suffixé Cents', () => {
  it('REQ-DM-001 : le schéma du dépôt ne porte aucun Float, aucun Decimal, aucun montant hors Cents', () => {
    expect(champsDuSchema(SCHEMA()).length).toBeGreaterThan(0);
    expect(fautesCentimes(SCHEMA())).toEqual([]);
  });

  it.each([
    ['un montant en euros à virgule', '  montantEuros Float', 'Bac.montantEuros — Float interdit'],
    ['un montant sans suffixe', '  montantHt Int', 'Bac.montantHt — montant non suffixé Cents'],
    ['un Decimal', '  tauxCents Decimal', 'Bac.tauxCents — Decimal interdit'],
    ['des centimes en chaîne', '  primeCents String', 'Bac.primeCents — …Cents doit être un Int'],
  ])('REQ-DM-001 : %s rougit en nommant Modèle.champ', (_quoi, champ, faute) => {
    expect(fautesCentimes(bac(champ))).toContain(faute);
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
