/**
 * sonde-distingue-les-deux-depots.spec.ts — GOV-048.
 *
 * @req REQ-GOV-004
 *
 * LA GARDE ÉTAIT TROP LARGE D'UN DÉPÔT. Mesure du 2026-09-12, rendue par la garde elle-même : le
 * versement de sept tâches de gouvernance a fait rougir `source_axionia_sans_repere` SEPT fois, sur
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
  entreesDuDepot,
  shaDesPreuvesDatees,
  suivisDePartners,
  type Entrees,
} from '../../../scripts/gates/gov-sonde';
import { objetLisible } from '../../../scripts/gates/gov-pr';
import { sansCommentaires } from '../../../scripts/gates/gov-trace';

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
 * rejouées (`racineAxionia: null`). Par défaut, axionia est CONNU et ne porte aucun des chemins
 * cités — c'est ce qui rend un chemin d'ici non ambigu ; le troisième argument le feint autrement.
 */
function univers(
  sources: { id: string; texte: string }[],
  suivis: string[] = [],
  existeDansAxionia: ((chemin: string) => boolean) | null = () => false
): Entrees {
  return {
    affirmations,
    decisions,
    sources,
    racineAxionia: null,
    suivisDePartners: new Set(suivis),
    existeDansAxionia,
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
    const absent = () => false;
    expect(depotDuChemin('scripts/gates/gov-sonde.ts', suivis, absent)).toBe('partners');
    expect(depotDuChemin('src/server/inconnu.ts', suivis, absent)).toBe('axionia');
    // ⚠️ Un chemin qui COMMENCE comme un chemin d'ici n'est pas d'ici pour autant : c'est le
    // défaut de la comparaison par préfixe, et la dérivation par le disque ne l'a pas.
    expect(depotDuChemin('scripts/gates/inexistant.ts', suivis, absent)).toBe('axionia');
    // Un chemin des DEUX côtés — ou dont on ne sait pas s'il est aussi là-bas — est AMBIGU ; la
    // qualification explicite `partners/` est la seule à le trancher du côté d'ici.
    expect(depotDuChemin('prisma/schema.prisma', suivis, () => true)).toBe('ambigu');
    expect(depotDuChemin('prisma/schema.prisma', suivis, null)).toBe('ambigu');
    expect(depotDuChemin('partners/prisma/schema.prisma', suivis, () => true)).toBe('partners');
  });

  it('REQ-GOV-004 — un chemin AMBIGU cité pour axionia ne s’absout PAS par un sha de Partners', () => {
    // 🔴 Motif `securite` sur 9ffb450, rejoué tel quel : 19 chemins sont suivis dans LES DEUX
    // dépôts, dont `prisma/schema.prisma` — le modèle d'argent d'axionia (AFF-01, AFF-02, AFF-05).
    // Classé « partners » parce qu'il est suivi ICI, il rendait `[]` avec n'importe quel sha d'ici,
    // là où il rendait `source_axionia_sans_repere` avant ce lot. Échec OUVERT.
    const texte =
      'chez axionia le champ commissionCents est HT (prisma/schema.prisma:9999), rejoué 2026-09-25 @ abc1234';
    const deuxCotes = (c: string) => c === 'prisma/schema.prisma';
    for (const existe of [deuxCotes, null]) {
      expect(
        familles(univers([{ id: 'REQ-TEMOIN-015', texte }], ['prisma/schema.prisma'], existe)),
        `axionia ${existe === null ? 'hors de portée' : 'porte le même chemin'} : l’exigence a été relâchée`
      ).toContain('source_axionia_sans_repere');
    }
    // CONTRE-TÉMOIN : qualifié `partners/`, avec un sha qui résout ICI, il est d'ici et passe…
    expect(
      familles(
        univers(
          [
            {
              id: 'REQ-TEMOIN-016',
              texte: 'le modèle vit dans partners/prisma/schema.prisma:12 (2026-09-25 @ abc1234)',
            },
          ],
          ['prisma/schema.prisma'],
          deuxCotes
        )
      )
    ).toEqual([]);
    // … et sans preuve qui résout, il rougit de SON refus, pas de celui d'axionia.
    expect(
      familles(
        univers(
          [{ id: 'REQ-TEMOIN-017', texte: 'le modèle vit dans partners/prisma/schema.prisma:12' }],
          ['prisma/schema.prisma'],
          deuxCotes
        )
      )
    ).toEqual(['source_partners_sans_preuve_datee']);
  });

  it('REQ-GOV-004 — DE BOUT EN BOUT : les entrées BRANCHÉES du dépôt refusent un sha qui ne résout pas', () => {
    // Motif `mutation` sur 9ffb450 : `shaResout: () => true` posé dans l'appel RÉEL laissait spec
    // et `--prove` verts — ils branchaient chacun leur prédicat. `entreesDuDepot` est le seul
    // branchement, celui du mode normal ; on le prend tel quel et on ne remplace que les sources.
    const lu = { affirmations, decisions };
    const jeton = 'partners/scripts/gates/gov-sonde.ts:1';
    const avec = (sha: string) =>
      controler(
        entreesDuDepot(
          { ...lu, sources: [{ id: 'T-018', texte: `${jeton} (2026-09-25 @ ${sha})` }] },
          null
        )
      ).map((f) => f.famille);
    expect(avec('0000000'), 'un sha qui ne désigne AUCUN commit d’ici a été accepté').toEqual([
      'source_partners_sans_preuve_datee',
    ]);
    // CONTRE-TÉMOIN : la tête d'ici résout, et le même jeton passe — le prédicat n'est pas `() => false`.
    expect(avec(TETE)).toEqual([]);
  });

  it('REQ-GOV-004 — une seule source pour « ce sha résout-il » et pour la grammaire « date @ sha »', () => {
    // 🔴 Motif `simplicite` sur 9ffb450 : `shaResout` recopiait `objetLisible` de `gov-pr.ts`, et
    // `PREUVE_DATEE` retapait `DATE_ET_SHA`. Durcir l'une laissait l'autre accepter l'ancien.
    const source = sansCommentaires(readFileSync('scripts/gates/gov-sonde.ts', 'utf8'));
    expect(source, 'gov-sonde interroge git lui-même au lieu de `objetLisible`').not.toContain(
      'cat-file'
    );
    expect(source).toMatch(/import\s*\{[^}]*objetLisible[^}]*\}\s*from\s*'\.\/gov-pr'/);
    expect(
      source.split('[0-9a-f]{7,40}').length - 1,
      'la grammaire « AAAA-MM-JJ @ sha » est écrite plus d’une fois dans gov-sonde.ts'
    ).toBe(1);
  });

  it('REQ-GOV-004 — la preuve datée se lit, et le SHA de la tête RÉSOUT vraiment', () => {
    expect(
      shaDesPreuvesDatees('mesuré le 2026-09-12 @ ad53f14, puis 2026-09-13 @ deadbee')
    ).toEqual(['ad53f14', 'deadbee']);
    expect(shaDesPreuvesDatees('mesuré le 2026-09-12, sans sha')).toEqual([]);
    // L'oracle est git, appelé ici : `objetLisible` n'est pas un prédicat de forme.
    const tete = /^[0-9a-f]{40}$/.test(TETE) ? TETE : null;
    if (tete) expect(objetLisible(tete)).toBe(true);
    expect(objetLisible('0000000000000000000000000000000000000000')).toBe(false);
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
      // Le mode CI : axionia hors de portée, donc TOUT chemin d'ici est ambigu — le côté strict.
      existeDansAxionia: null,
      shaResout: objetLisible,
    });
    expect(
      fautes.map((f) => `[${f.famille}] ${f.message}`),
      'les sources réelles font rougir la garde'
    ).toEqual([]);
  });
});
