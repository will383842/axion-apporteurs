// @req REQ-QA-023
/**
 * QA-T66 — l'exercice de sauvegarde refuse un vidage qui porte plus d'un propriétaire SOURCE
 * (REQ-QA-023 ; suite de la garde des rôles de la restauration, signalée par la lentille securite ; précisions : décision de la
 * coordination du 2026-10-02).
 *
 * Le propriétaire source est le rôle HORS `FORME_DES_ROLES` (`partners_*`) qui porte un
 * `ALTER … OWNER TO` dans le schéma du vidage : celui qui a migré la base. `--no-owner` le remplace
 * par le restaurateur, et ses GRANT sont exemptés. Il ne peut y en avoir qu'UN : un second
 * propriétaire hors forme n'est pas « celui qui a migré », c'est un rôle inconnu dont les GRANT
 * seraient exemptés en silence. Ce fichier juge :
 *   1. deux propriétaires source → `proprietaires_multiples`, AVANT toute restauration, les DEUX
 *      rôles nommés, aucune ligne du vidage dans le message ;
 *   2. un seul, ou aucun → passe (contre-témoins) ;
 *   3. les rôles `partners_*` restent gérés comme avant : ni comptés comme propriétaires
 *      source, ni refusés quand ils ont la forme ancrée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  rolesDuVidage,
  jugerLesRoles,
  proprietairesSourceDuVidage,
} from '../../../scripts/sauvegarde/exercice';

/** Le jugement tel que `exercer` le fait : les rôles du vidage, et ses propriétaires source. */
const juger = (sql: string) => jugerLesRoles(rolesDuVidage(sql), proprietairesSourceDuVidage(sql));

const SCHEMA_UN = [
  'ALTER TABLE public.apporteurs OWNER TO migrateur;',
  'ALTER TABLE public.journal OWNER TO partners_journal;',
  'GRANT SELECT ON TABLE public.journal TO partners_lecteur;',
  'GRANT ALL ON SCHEMA public TO migrateur;',
].join('\n');
const SCHEMA_DEUX = `${SCHEMA_UN}\nALTER TABLE public.secret OWNER TO intrus;\nGRANT ALL ON TABLE public.secret TO intrus;`;

describe('REQ-QA-023 — au plus UN propriétaire source dans le vidage', () => {
  it('REQ-QA-023 : le propriétaire source est lu dans le schéma, hors partners_*', () => {
    expect(proprietairesSourceDuVidage(SCHEMA_UN)).toEqual(['migrateur']);
    expect(proprietairesSourceDuVidage(SCHEMA_DEUX)).toEqual(['intrus', 'migrateur']);
  });

  it('REQ-QA-023 : TÉMOIN — deux propriétaires source échouent sous proprietaires_multiples, les deux nommés, sans ligne du vidage', () => {
    const faute = juger(SCHEMA_DEUX);
    expect(faute).toBe(
      'restauration : [proprietaires_multiples] plus d’un propriétaire source dans le vidage — intrus, migrateur'
    );
    expect(faute).not.toContain('public.secret');
    expect(faute).not.toContain('ALTER');
  });

  it('REQ-QA-023 : CONTRE-TÉMOINS — un seul propriétaire source passe, aucun propriétaire source passe', () => {
    expect(juger(SCHEMA_UN)).toBeNull();
    const sansProprietaire = SCHEMA_UN.split('\n')
      .filter((l) => !l.includes('migrateur'))
      .join('\n');
    expect(proprietairesSourceDuVidage(sansProprietaire)).toEqual([]);
    expect(juger(sansProprietaire)).toBeNull();
  });

  it('REQ-QA-023 : les rôles partners_* restent gérés comme avant — jamais propriétaires source, rejoués quand la forme est ancrée', () => {
    const lu = rolesDuVidage(SCHEMA_UN);
    expect(proprietairesSourceDuVidage(SCHEMA_UN)).not.toContain('partners_journal');
    expect(lu.roles).toEqual(['partners_journal', 'partners_lecteur']);
    expect(lu.proprietes).toEqual(['ALTER TABLE public.journal OWNER TO partners_journal;']);
  });

  it('REQ-QA-023 : les fautes déjà gardées pour les rôles gardent leur message — rôle hors forme, propriété piégée', () => {
    expect(juger(`${SCHEMA_UN}\nGRANT SELECT ON TABLE x TO etranger;`)).toBe(
      'restauration : rôle hors de la forme partners_* — etranger'
    );
    expect(juger(`${SCHEMA_UN}\nALTER TABLE x OWNER TO PARTNERS_journal;`)).toBe(
      "restauration : 1 propriété(s) hors de la forme ancrée, rien n'est rejoué"
    );
  });

  it('REQ-QA-023 : l’exercice juge les rôles AVANT de créer un rôle ou de restaurer quoi que ce soit', () => {
    // QA-T70 : la création des rôles vit dans le plan UNIQUE (`planDeLaPropriete`), partagé avec la
    // porte D. L'ordre se juge donc en deux temps : le plan juge les rôles AVANT de rendre la moindre
    // création, et l'exercice obtient ce plan AVANT de restaurer.
    const source = readFileSync('scripts/sauvegarde/exercice.ts', 'utf8');
    const plan = source.slice(
      source.indexOf('export function planDeLaPropriete('),
      source.indexOf('export function sortieDuPlan(')
    );
    const juge = plan.indexOf('jugerLesRoles(');
    expect(juge).toBeGreaterThan(-1);
    expect(juge).toBeLessThan(plan.indexOf('CREATE ROLE'));
    const corps = source.slice(source.indexOf('export async function exercer('));
    const obtenu = corps.indexOf('planDeLaPropriete(');
    expect(obtenu).toBeGreaterThan(-1);
    expect(obtenu).toBeLessThan(corps.indexOf("'--no-owner'"));
  });
});
