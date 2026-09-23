/**
 * sonde-distingue-les-deux-depots.spec.ts — GOV-048.
 *
 * @req REQ-GOV-004
 *
 * LA GARDE ÉTAIT TROP LARGE D'UN DÉPÔT. Mesure du 2026-09-12, rendue par la garde elle-même : le
 * versement des tâches GOV-041 à GOV-047 a fait rougir `source_axionia_sans_repere` SEPT fois, sur
 * des chemins qui sont TOUS ceux du dépôt Partners. La garde exigeait pour chacun un repère AFF-nn
 * de `docs/AFFIRMATIONS-AXIONIA.md`, dont l'en-tête déclare pourtant un objet unique : le dépôt
 * axionia, à un commit nommé. Y inscrire du code de Partners aurait rendu cet en-tête FAUX.
 *
 * LE CONTOURNEMENT PRIS CE JOUR-LÀ, et c'est pourquoi cette tâche existe : les sept numéros de
 * ligne ont été RETIRÉS des acceptances plutôt qu'inscrits au mauvais registre. Le fait reste vrai
 * et localisable ; la précision est perdue.
 *
 * VU ROUGIR DANS LES DEUX SENS, et c'est ce que ce fichier tient :
 *
 *   — un chemin d'AXIONIA sans repère reste refusé — contre-témoin sur REQ-JUR-024 / AFF-47, qui ne
 *     doit pas bouger ;
 *   — un chemin de PARTNERS cité avec sa ligne sans preuve datée rougit de son PROPRE refus,
 *     distinct et nommé, qui ne renvoie pas vers un registre qui parle d'un autre dépôt.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  controler,
  depotDuChemin,
  shaDesPreuvesDatees,
  suivisDePartners,
  shaResout,
  type Entrees,
} from '../../../scripts/gates/gov-sonde';

const affirmations = readFileSync('docs/AFFIRMATIONS-AXIONIA.md', 'utf8');
const decisions = readFileSync('docs/DECISIONS.md', 'utf8');

/**
 * Le SHA de la tête de CE dépôt : une valeur qui résout vraiment, jamais une constante inventée.
 *
 * ⚠️ LU PAR `git`, ET NON DANS `.git/HEAD` : dans un ARBRE DE TRAVAIL, `.git` est un FICHIER qui
 * pointe ailleurs, et la lecture directe échoue sur `ENOENT` — mesuré ici au premier jet.
 */
const TETE = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

/**
 * Un univers minimal : le tableau réel, aucune source, aucun arbre voisin. Les sondes ne sont pas
 * rejouées (`racineAxionia: null`), ce qui est le mode CI et le mode de ce test.
 */
function univers(sources: { id: string; texte: string }[], suivis: string[] = []): Entrees {
  return {
    affirmations,
    decisions,
    sources,
    racineAxionia: null,
    suivisDePartners: new Set(suivis),
    shaResout: (sha) => sha === 'abc1234',
  };
}

const familles = (e: Entrees): string[] => controler(e).map((f) => f.famille);

describe('gov:sonde — la garde distingue les deux dépôts (GOV-048)', () => {
  it('REQ-GOV-004 — un chemin de PARTNERS cité avec sa ligne, sans preuve datée, a son PROPRE refus', () => {
    const fautes = controler(
      univers(
        [{ id: 'REQ-TEMOIN-010', texte: 'le refus vit dans scripts/lot/cloture.ts:120' }],
        ['scripts/lot/cloture.ts']
      )
    );
    const f = fautes.find((x) => x.famille === 'source_partners_sans_preuve_datee');
    expect(
      f,
      `familles vues : ${fautes.map((x) => x.famille).join(', ') || 'aucune'}`
    ).toBeDefined();
    // Le refus ne renvoie PAS vers le tableau des affirmations comme s'il fallait y inscrire ce
    // chemin : il dit au contraire que ce registre n'est pas le bon.
    expect(f!.message).toContain('scripts/lot/cloture.ts:120');
    expect(f!.message).toContain("n'est PAS le bon registre");
    // Et il ne se confond pas avec la famille d'axionia.
    expect(fautes.map((x) => x.famille)).not.toContain('source_axionia_sans_repere');
  });

  it('REQ-GOV-004 — le MÊME chemin avec une preuve datée qui résout ICI passe au vert', () => {
    expect(
      familles(
        univers(
          [
            {
              id: 'REQ-TEMOIN-011',
              texte: 'le refus vit dans scripts/lot/cloture.ts:120 (2026-09-12 @ abc1234)',
            },
          ],
          ['scripts/lot/cloture.ts']
        )
      )
    ).toEqual([]);
  });

  it('REQ-GOV-004 — une preuve datée dont le SHA ne RÉSOUT PAS ne prouve rien', () => {
    expect(
      familles(
        univers(
          [
            {
              id: 'REQ-TEMOIN-012',
              texte: 'le refus vit dans scripts/lot/cloture.ts:120 (2026-09-12 @ 9999999)',
            },
          ],
          ['scripts/lot/cloture.ts']
        )
      )
    ).toContain('source_partners_sans_preuve_datee');
  });

  it('REQ-GOV-004 — un chemin d’AXIONIA sans repère reste refusé, et sous son ancien nom', () => {
    const fautes = controler(
      univers([{ id: 'REQ-TEMOIN-013', texte: 'affirmation lue dans src/server/inconnu.ts:42' }])
    );
    expect(fautes.map((x) => x.famille)).toContain('source_axionia_sans_repere');
    expect(fautes.map((x) => x.famille)).not.toContain('source_partners_sans_preuve_datee');
  });

  it('REQ-GOV-004 — une preuve datée de PARTNERS n’absout PAS un chemin d’axionia', () => {
    // Le sens qu'on oublie : la nouvelle sortie ne doit pas devenir une porte pour l'autre dépôt.
    expect(
      familles(
        univers([
          {
            id: 'REQ-TEMOIN-014',
            texte: 'affirmation lue dans src/server/inconnu.ts:42 (2026-09-12 @ abc1234)',
          },
        ])
      )
    ).toContain('source_axionia_sans_repere');
  });

  it('REQ-GOV-004 — le dépôt d’un chemin se DÉRIVE du disque, jamais d’un préfixe tapé', () => {
    const suivis = suivisDePartners();
    expect(
      suivis.size,
      'la population des fichiers suivis est vide : git n’a rien rendu'
    ).toBeGreaterThan(0);
    expect(depotDuChemin('scripts/gates/gov-sonde.ts', suivis)).toBe('partners');
    expect(depotDuChemin('src/server/inconnu.ts', suivis)).toBe('axionia');
    // ⚠️ Un chemin qui COMMENCE comme un chemin d'ici n'est pas d'ici pour autant : c'est le
    // défaut de la comparaison par préfixe, et la dérivation par le disque ne l'a pas.
    expect(depotDuChemin('scripts/gates/inexistant.ts', suivis)).toBe('axionia');
  });

  it('REQ-GOV-004 — la preuve datée se lit, et le SHA de la tête RÉSOUT vraiment', () => {
    expect(
      shaDesPreuvesDatees('mesuré le 2026-09-12 @ ad53f14, puis 2026-09-13 @ deadbee')
    ).toEqual(['ad53f14', 'deadbee']);
    expect(shaDesPreuvesDatees('mesuré le 2026-09-12, sans sha')).toEqual([]);
    // L'oracle est git, appelé ici : `shaResout` n'est pas un prédicat de forme.
    const tete = /^[0-9a-f]{40}$/.test(TETE) ? TETE : null;
    if (tete) expect(shaResout(tete)).toBe(true);
    expect(shaResout('0000000000000000000000000000000000000000')).toBe(false);
  });

  it('REQ-GOV-004 — sur les sources RÉELLES, AFF-47 couvre toujours REQ-JUR-024', () => {
    const exigences = (
      JSON.parse(readFileSync('docs/requirements.json', 'utf8')) as {
        exigences: { id: string; source: string | null }[];
      }
    ).exigences;
    const taches = (
      JSON.parse(readFileSync('docs/tasks.json', 'utf8')) as {
        taches: { id: string; acceptance: string | null }[];
      }
    ).taches;
    const sources = [
      ...exigences.map((x) => ({ id: x.id, texte: x.source ?? '' })),
      ...taches.map((t) => ({ id: t.id, texte: t.acceptance ?? '' })),
    ];
    const fautes = controler({
      affirmations,
      decisions,
      sources,
      racineAxionia: null,
      suivisDePartners: suivisDePartners(),
      shaResout,
    });
    expect(
      fautes.map((f) => `[${f.famille}] ${f.message}`),
      'les sources réelles font rougir la garde'
    ).toEqual([]);
  });
});
