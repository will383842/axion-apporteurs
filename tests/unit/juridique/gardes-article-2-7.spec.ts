// @req REQ-JUR-040
/**
 * JUR-T30 — les gardes de l'art. 2.7 du contrat : l'apporteur organise librement son activité, et le
 * produit ne reconstitue ni ne restitue son rythme. Ce fichier juge les gardes en processus, sur des
 * fichiers INJECTÉS (RM-11) ; leur preuve binaire est `pnpm <garde>:prove`.
 *
 * (b) `jur:date-contact-inerte` — `dateContact` est la seule donnée du contrat d'où un rythme
 * d'activité peut être reconstitué : elle ne se lit que dans une liste FERMÉE de lieux, sans aucun
 * découpage temporel.
 */
import { describe, it, expect } from 'vitest';
import {
  FAMILLES,
  LIEUX_PERMIS,
  estJuge,
  jugerLesLectures,
} from '../../../scripts/gates/jur-date-contact-inerte';

const fichier = (chemin: string, source: string) => ({ chemin, source });
const familles = (chemin: string, source: string) =>
  jugerLesLectures([fichier(chemin, source)]).fautes.map((f) => f.famille);

describe('REQ-JUR-040 — jur:date-contact-inerte : la date du contact ne se lit que dans ses lieux permis', () => {
  it('REQ-JUR-040 : la liste fermée des lieux permis est EXACTEMENT celle-ci, chacun avec sa raison', () => {
    expect(Object.keys(LIEUX_PERMIS).sort()).toEqual([
      'src/server/acces/for-apporteur.ts',
      'src/server/anomalie/sincerite.ts',
      'src/server/depot/deposer.ts',
    ]);
    for (const raison of Object.values(LIEUX_PERMIS)) expect(raison.length).toBeGreaterThan(20);
  });

  it('REQ-JUR-040 : TÉMOIN — un groupBy par tranche sur dateContact, hors de la liste, rougit', () => {
    expect(
      familles(
        'src/server/console/statistiques.ts',
        "export const r = (p: P) => p.attribution.groupBy({ by: ['dateContact'], _count: true });"
      )
    ).toContain('lecture_hors_liste');
  });

  it('REQ-JUR-040 : TÉMOIN — la colonne date_contact nommée dans du SQL, hors de la liste, rougit', () => {
    expect(
      familles(
        'src/server/taches/rythme.ts',
        'export const q = `SELECT date_contact FROM attributions`;'
      )
    ).toContain('lecture_hors_liste');
  });

  it('REQ-JUR-040 : TÉMOIN — même dans un lieu permis, une heure extraite ou une troncature SQL rougit', () => {
    const permis = 'src/server/anomalie/sincerite.ts';
    expect(familles(permis, 'export const h = (a: A) => a.dateContact.getHours();')).toEqual([
      'agregation_temporelle',
    ]);
    expect(
      familles(permis, "export const q = `SELECT date_trunc('hour', date_contact) FROM x`;")
    ).toEqual(['agregation_temporelle']);
  });

  it('REQ-JUR-040 : contre-témoins — la donnée lue telle quelle dans un lieu permis, une autre date groupée ailleurs : vert', () => {
    expect(familles('src/server/depot/deposer.ts', "const champs = ['dateContact'];")).toEqual([]);
    expect(
      familles(
        'src/server/console/x.ts',
        "export const r = (p: P) => p.x.groupBy({ by: ['creeAt'] });"
      )
    ).toEqual([]);
  });

  it('REQ-JUR-040 : un test n’est pas jugé ; un fichier illisible est nommé ; les familles sont fermées', () => {
    expect(estJuge('src/server/depot/deposer.spec.ts')).toBe(false);
    expect(estJuge('src/server/depot/deposer.ts')).toBe(true);
    expect(familles('src/server/x.ts', 'export const a = {')).toEqual(['source_illisible']);
    expect([...FAMILLES]).toEqual([
      'lecture_hors_liste',
      'agregation_temporelle',
      'source_illisible',
    ]);
  });
});
