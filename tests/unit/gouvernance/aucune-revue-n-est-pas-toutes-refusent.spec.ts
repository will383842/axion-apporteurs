// @req REQ-GOV-011
// @req REQ-GOV-013
/**
 * aucune-revue-n-est-pas-toutes-refusent.spec.ts — la garde des revues d'une PR distingue
 * l'ABSENCE de relecteur du REFUS des relecteurs (GOV-077, REQ-GOV-011, REQ-GOV-013).
 *
 * TROIS FAITS, MESURÉS À `809a746` :
 *
 *   (1) `gov:pr --pr <n>` imprimait « Vues : (aucune) » DANS LES DEUX CAS — quand aucune revue
 *       n'avait été lue, et quand toutes les revues lues REFUSAIENT. Deux états opposés rendus
 *       identiques : le second devenait invisible derrière le premier.
 *   (2) Un avis posé au MAUVAIS ENDROIT — en commentaire d'issue plutôt qu'en revue — n'était
 *       signalé nulle part. La PR 41 en portait trois le 2026-09-14, et zéro revue : ils comptaient
 *       pour rien, et rien ne le disait. Fixture : `tests/fixtures/github/commentaires-pr-41.json`.
 *   (3) La phrase « un refus de la lentille securite vaut veto » citait REQ-GOV-011, qui ne parle
 *       pas de veto. La machine et la charte (§6) doivent dire la même chose.
 *
 * Ces témoins exercent les fonctions PURES du lecteur unique (`scripts/lot/revues.ts`), celles que
 * `scripts/gates/gov-pr.ts` appelle ; `pnpm gov:pr:prove` exerce l'appelant lui-même.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import * as LECTEUR from '../../../scripts/lot/revues';

const TETE = '41bc8140b9ea436be809676538dd65cb2263a5bc';
const ELEVE = { niveau: 'eleve' as const, schema: false, raisons: ['cas de test'] };
const LENTILLES = ['exactitude', 'securite', 'simplicite'];

const avis = (poste: string, lentille: string, verdict: 'accepte' | 'refuse') => ({
  user: { login: 'will383842' },
  author_association: 'OWNER',
  state: 'COMMENTED',
  commit_id: TETE,
  body: `${poste} · ${lentille}\nVerdict: ${verdict}`,
});

function fautes(revues: ReturnType<typeof avis>[], tacheSensible = false) {
  const lecture = LECTEUR.lireRevues({ revues, risque: ELEVE, tete: TETE, auteurPoste: 'A05' });
  return LECTEUR.fautesDesRevues(lecture, { tacheSensible });
}

const QUATRE = (verdict: 'accepte' | 'refuse') => [
  ...LENTILLES.map((l) => avis('A09', l, verdict)),
  avis('A10', 'mutation', verdict),
];

describe('REQ-GOV-011 — aucune revue n’est pas « toutes les revues refusent »', () => {
  it('REQ-GOV-011 · une PR sans aucune revue rougit la famille `aucune_revue`, et elle seule', () => {
    const f = fautes([]);
    expect([...new Set(f.map((x) => x.famille))]).toEqual(['aucune_revue']);
  });

  it('REQ-GOV-011 · une PR dont les quatre revues refusent rougit `lentille_en_refus`, et NOMME chaque refus', () => {
    const f = fautes(QUATRE('refuse'));
    const familles = new Set(f.map((x) => x.famille));
    expect(familles.has('lentille_en_refus')).toBe(true);
    expect(familles.has('aucune_revue')).toBe(false);
    expect(f.filter((x) => x.famille === 'lentille_en_refus').length).toBe(4);
    const texte = f.map((x) => x.message).join('\n');
    for (const l of [...LENTILLES, 'mutation']) expect(texte).toContain(l);
    expect(texte).not.toContain('(aucune)');
  });

  it('REQ-GOV-011 · les deux sorties diffèrent, et leurs familles aussi', () => {
    const sans = fautes([]);
    const refus = fautes(QUATRE('refuse'));
    expect(sans.length).toBeGreaterThan(0);
    expect(refus.length).toBeGreaterThan(0);
    const texte = (x: { message: string }[]) => x.map((y) => y.message).join('\n');
    expect(texte(sans)).not.toBe(texte(refus));
    const familles = (x: { famille: string }[]) => [...new Set(x.map((y) => y.famille))].sort();
    expect(familles(sans)).not.toEqual(familles(refus));
  });

  it('REQ-GOV-011 · des revues MIXTES nomment les accords ET les refus', () => {
    const f = fautes([
      avis('A09', 'exactitude', 'accepte'),
      avis('A09', 'securite', 'refuse'),
      avis('A09', 'simplicite', 'accepte'),
    ]);
    const manquantes = f.filter((x) => x.famille === 'lentilles_manquantes').map((x) => x.message);
    const texte = manquantes.join('\n');
    expect(texte).toContain('A09 exactitude');
    expect(texte).toContain('A09 securite');
  });

  it('REQ-GOV-011 · trois revues acceptées sans l’avis de mutation, sur une PR élevée : l’absence de la revue de mutation est NOMMÉE', () => {
    const f = fautes(LENTILLES.map((l) => avis('A09', l, 'accepte')));
    expect(f.map((x) => x.famille)).toEqual(['lentilles_manquantes']);
    expect(f[0]!.message).toContain('aucun avis « mutation »');
  });

  it('REQ-GOV-013 · CONTRE-TÉMOIN : quatre revues acceptées sur la tête ne laissent aucune faute', () => {
    expect(fautes(QUATRE('accepte'))).toEqual([]);
  });
});

describe('REQ-GOV-011 — le refus de la lentille securite : ce que la charte §6 écrit, la garde le dit', () => {
  it('REQ-GOV-011 · sur toute PR, le refus de securite « bloque à lui seul » et cite la charte §6', () => {
    const f = fautes([avis('A09', 'securite', 'refuse')]);
    const veto = f.find((x) => x.famille === 'lentille_en_refus' && x.message.includes('securite'));
    expect(veto).toBeDefined();
    expect(veto!.message).toContain('bloque à lui seul');
    expect(veto!.message).toContain('charte §6');
    expect(veto!.message).toContain('2026-09-18');
    // Sur une tâche non sensible, aucune section Attaque n'est promise.
    expect(veto!.message).not.toContain('REQ-GOV-011');
  });

  it('REQ-GOV-011 · sur une tâche sensible seulement, le scénario d’attaque est exigé (REQ-GOV-011)', () => {
    const f = fautes([avis('A09', 'securite', 'refuse')], true);
    const veto = f.find((x) => x.famille === 'lentille_en_refus' && x.message.includes('securite'));
    expect(veto!.message).toContain('scénario d’attaque exigé (REQ-GOV-011)');
  });
});

describe('REQ-GOV-013 — un avis posté en commentaire d’issue est SIGNALÉ, jamais compté', () => {
  const CAPTURE = JSON.parse(
    readFileSync('tests/fixtures/github/commentaires-pr-41.json', 'utf8')
  ) as { Source: string; commentaires: { body?: string | null; user?: { login?: string } }[] };

  it('REQ-GOV-013 · la capture de la PR 41 porte sa provenance, et des avis en forme de revue', () => {
    expect(CAPTURE.Source).toContain('repos/will383842/axion-apporteurs/issues/41/comments');
    expect(CAPTURE.commentaires.length).toBeGreaterThan(0);
  });

  it('REQ-GOV-013 · chaque avis « A<nn> · <lentille> » posé en commentaire d’issue est NOMMÉ', () => {
    const enForme = CAPTURE.commentaires.filter((c) =>
      /^A\d{2} · [a-z]+/.test((c.body ?? '').split('\n')[0] ?? '')
    );
    expect(
      enForme.length,
      'la capture ne porte plus aucun avis : le témoin ne mesure rien'
    ).toBeGreaterThan(0);
    const dits = LECTEUR.avisHorsCanal(CAPTURE.commentaires);
    expect(dits.length).toBe(enForme.length);
    for (const c of enForme) {
      const entete = (c.body ?? '').split('\n')[0]!;
      expect(
        dits.some((d) => d.includes(entete)),
        `« ${entete} » n’est pas nommé`
      ).toBe(true);
    }
    for (const d of dits) {
      expect(d).toContain('commentaire d’issue');
      expect(d).toContain('gh pr review --comment');
    }
  });

  it('REQ-GOV-013 · CONTRE-TÉMOIN : un commentaire ordinaire n’est pas pris pour un avis', () => {
    expect(LECTEUR.avisHorsCanal([{ body: 'merci, je relance la CI' }, { body: null }])).toEqual(
      []
    );
    expect(LECTEUR.avisHorsCanal(null)).toEqual([]);
  });

  it('REQ-GOV-013 · un avis hors canal ne fournit AUCUN accord : la case des revues reste vide', () => {
    // Les avis de la capture, rejoués comme s'ils étaient des revues ACCEPTÉES, cocheraient ; posés
    // en commentaires, le lecteur des revues ne les voit pas — et c'est `aucune_revue` qui parle.
    const f = fautes([]);
    expect(f.map((x) => x.famille)).toEqual(['aucune_revue']);
  });
});
