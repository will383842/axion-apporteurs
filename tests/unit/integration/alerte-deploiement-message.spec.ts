// @req REQ-GOV-014
/**
 * QA-T54 — le MESSAGE de l'alerte close `deploiement_non_atterri`, en processus : c'est ce fichier
 * que la mutation de `src/server/integrations/telegram/alertes.ts` voit (`vitest.mutation.config.ts`
 * ne lance pas `tests/unit/qualite/`, où vit le témoin de bout en bout,
 * `alerte-deploiement-non-atterri.spec.ts`).
 *
 * Le sha servi vient d'un en-tête de réponse et l'environnement d'une variable de la forge : chacun
 * passe une liste blanche au seul endroit où il entre dans un message. Absent, « inconnu » ; mal
 * formé, « illisible ».
 */
import { describe, it, expect } from 'vitest';
import {
  ENVIRONNEMENTS_DE_DEPLOIEMENT,
  messageDAlerte,
  shaLisible,
} from '../../../src/server/integrations/telegram/alertes';

const ID = 'd4c3b2a1-e5f6-4a7b-8c9d-aebfcadbecfd';
const SHA = 'a'.repeat(40);

const message = (attendu: string, servi: string, environnement: string) =>
  messageDAlerte('alerte', {
    categorie: 'deploiement_non_atterri',
    id: ID,
    deploiement: { attendu, servi, environnement },
  });

describe('REQ-GOV-014 — shaLisible : un sha, « inconnu » ou « illisible », rien d’autre', () => {
  it.each([
    ['un sha complet', SHA, SHA],
    ['un sha court de 7', 'abcdef1', 'abcdef1'],
    ['des majuscules, rendues en minuscules', 'ABCDEF1', 'abcdef1'],
    ['absent', undefined, 'inconnu'],
    ['nul', null, 'inconnu'],
    ['vide', '', 'inconnu'],
    ['6 caractères', 'abcdef', 'illisible'],
    ['41 caractères', 'a'.repeat(41), 'illisible'],
    ['un caractère hors hexadécimal', 'abcdefg', 'illisible'],
    ['une URL', 'https://piege.example/x', 'illisible'],
    ['un nombre', 1234567, 'illisible'],
  ])('REQ-GOV-014 : %s', (_nom, v, attendu) => {
    expect(shaLisible(v)).toBe(attendu);
  });
});

describe('REQ-GOV-014 — le message ne porte que les deux sha et l’environnement, en liste blanche', () => {
  it('REQ-GOV-014 : les environnements fermés sont production et preview', () => {
    expect([...ENVIRONNEMENTS_DE_DEPLOIEMENT]).toEqual(['production', 'preview']);
  });

  it.each(ENVIRONNEMENTS_DE_DEPLOIEMENT)('REQ-GOV-014 : « %s » entre tel quel', (env) => {
    expect(message(SHA, SHA, env)).toBe(
      `[deploiement_non_atterri] objet ${ID} · attendu ${SHA} · servi ${SHA} · environnement ${env}`
    );
  });

  it.each([['Production'], ['staging'], [''], ['jeanne.dupont@example.org']])(
    'REQ-GOV-014 : un environnement hors liste (« %s ») entre « illisible »',
    (env) => {
      expect(message(SHA, SHA, env)).toMatch(/ · environnement illisible$/);
    }
  );

  it('REQ-GOV-014 : un environnement qui n’est pas une chaîne entre « illisible »', () => {
    const riche = { attendu: SHA, servi: SHA, environnement: 42 as unknown as string };
    expect(
      messageDAlerte('alerte', { categorie: 'deploiement_non_atterri', id: ID, deploiement: riche })
    ).toMatch(/ · environnement illisible$/);
  });

  it('REQ-GOV-014 : sans `deploiement`, le message reste celui de toute alerte', () => {
    expect(messageDAlerte('alerte', { categorie: 'deploiement_non_atterri', id: ID })).toBe(
      `[deploiement_non_atterri] objet ${ID}`
    );
  });

  it('REQ-GOV-014 : un sha servi piégé n’entre jamais tel quel', () => {
    const m = message(SHA, '<b>https://piege.example/x</b>', 'production');
    expect(m).toContain('servi illisible');
    expect(m).not.toContain('piege.example');
  });
});
