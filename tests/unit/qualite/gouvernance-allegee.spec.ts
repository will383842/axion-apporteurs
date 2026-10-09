// @req REQ-GOV-011
// @req REQ-GOV-012
/**
 * GOV-160 — décision de Williams du 2026-10-09 (#319, commentaire 6077512137) : la garde de PR à
 * trois niveaux, la part de gouvernance, l'avancement dérivé des PR fusionnées, le composeur qui
 * ne compose plus de tâche de gouvernance.
 */
import { describe, expect, it } from 'vitest';
import {
  fautesDOrdre,
  fautesDesRevues,
  fautesDuCorps,
  lentillesExigees,
  niveauDeLaPr,
  niveauDuFichier,
} from '../../../scripts/gates/gov-pr-niveaux';
import { estDeGouvernance, lireLeJournal, part } from '../../../scripts/rapports/part-gouvernance';
import { idsDeLaPr, livreesParLesPr } from '../../../scripts/lot/avancement-par-les-pr';
import { composerLeLot } from '../../../scripts/lot/composer';

const rien = () => null;

describe('gov:pr — trois niveaux', () => {
  it('argent, données personnelles, sécurité et ce qui les garde sont CRITIQUES', () => {
    for (const f of [
      'src/domain/commissions/calcul.ts',
      'src/server/rgpd/export.ts',
      'prisma/schema.prisma',
      'src/app/(espace)/releves/page.tsx',
      '.github/workflows/ci.yml',
      'pnpm-lock.yaml',
      'scripts/gates/journal-sans-pii.ts',
    ]) {
      expect(niveauDuFichier(f, rien), f).toBe('critique');
    }
  });

  it('un écran qui déclare use server est critique ; un écran simple, un texte, un doc sont légers', () => {
    expect(niveauDuFichier('src/app/(espace)/accueil/actions.ts', () => "'use server';")).toBe(
      'critique'
    );
    expect(niveauDuFichier('src/app/(espace)/accueil/page.tsx', rien)).toBe('leger');
    expect(niveauDuFichier('src/content/micro-copy/espace/accueil.ts', rien)).toBe('leger');
    expect(niveauDuFichier('docs/PRIORITES.md', rien)).toBe('leger');
    expect(niveauDuFichier('tests/unit/espace/accueil.spec.ts', rien)).toBe('normal');
  });

  it('le niveau d’une PR est le plus haut de ses fichiers et de sa tâche ; un diff vide est critique', () => {
    expect(niveauDeLaPr({ fichiers: ['docs/a.md', 'src/lib/env.ts'] }).niveau).toBe('critique');
    expect(niveauDeLaPr({ fichiers: ['docs/a.md'] }).niveau).toBe('leger');
    expect(
      niveauDeLaPr({ fichiers: ['docs/a.md'], tache: { id: 'X-1', zone: 'argent', sensible: [] } })
        .niveau
    ).toBe('critique');
    expect(niveauDeLaPr({ fichiers: [] }).niveau).toBe('critique');
  });

  it('critique : deux lentilles ; normal : une ; léger : aucune ; schema seulement si non additive', () => {
    expect(lentillesExigees('critique', false)).toEqual({
      toutes: ['exactitude', 'securite'],
      uneParmi: [],
    });
    expect(lentillesExigees('normal', false).uneParmi).toEqual(['exactitude', 'securite']);
    expect(lentillesExigees('leger', false)).toEqual({ toutes: [], uneParmi: [] });
    expect(lentillesExigees('leger', true).toutes).toEqual(['schema']);
  });

  it('une PR critique sans rouge verbatim rougit ; une PR légère ne doit rien', () => {
    const corps = '<!-- rouge-vert:debut -->\nROUGE : (colle ici)\n<!-- rouge-vert:fin -->';
    expect(fautesDuCorps(corps, 'critique', true).map((f) => f.famille)).toContain(
      'rouge_vert_absent'
    );
    expect(fautesDuCorps('', 'leger', false)).toEqual([]);
  });

  it('le refus de securite sur la tête vaut veto, quel que soit le niveau', () => {
    const tete = 'b'.repeat(40);
    const fautes = fautesDesRevues(
      [
        {
          association: 'OWNER',
          corps: 'A09 · securite\nVerdict: refuse',
          commit: tete,
          soumise: '1',
        },
      ],
      tete,
      lentillesExigees('leger', false),
      new Set(['A09'])
    );
    expect(fautes.map((f) => f.famille)).toEqual(['veto_securite']);
  });

  it('une migration ajoutée est horodatée après la dernière de main, sans réservation', () => {
    expect(fautesDOrdre(['20261003005025_x'], ['20261009101010_y'])).toEqual([]);
    expect(fautesDOrdre(['20261003005025_x'], ['20261003005025_y'])).toHaveLength(1);
  });
});

describe('gov:part-gouvernance', () => {
  it('compte les commits GOV et ceux qui ne touchent que le processus, rouge au-dessus de 15 %', () => {
    const journal = lireLeJournal(
      '\x1ea\x1ffeat(DM-01): le journal\nsrc/domain/x.ts\n' +
        '\x1eb\x1fchore(GOV-012): rattrapage\ndocs/tasks.json\n' +
        '\x1ec\x1fdocs: note\ndocs/LECONS.md\n'
    );
    expect(journal.map(estDeGouvernance)).toEqual([false, true, true]);
    expect(part(journal)).toMatchObject({ total: 3, gouvernance: 2, pourcent: 67, rouge: true });
    expect(part(journal.slice(0, 1)).rouge).toBe(false);
  });
});

describe('avancement dérivé des PR fusionnées', () => {
  it('une PR livre la tâche de son titre et celles de sa ligne Lot:', () => {
    expect(idsDeLaPr({ number: 1, title: 'feat(DM-01): x', body: 'Lot: DM-02, DM-03\n' })).toEqual([
      'DM-01',
      'DM-02',
      'DM-03',
    ]);
    expect(livreesParLesPr([{ number: 9, title: 'fix(SEC-1): y' }]).get('SEC-1')).toBe(9);
  });

  it('le composeur ne compose ni une tâche GOV, ni une tâche livrée par une PR', () => {
    const tache = (id: string) => ({
      id,
      titre: id,
      phase: 1,
      repo: 'partners',
      zone: 'domaine',
      paths: [`src/${id}.ts`],
      schema: false,
      sensible: [],
      deps: [],
      reqs: [],
      hyp: [],
      externe: null,
      estimateDays: 1,
      statut: 'a_faire',
    });
    const options: Parameters<typeof composerLeLot>[1] = {
      phase: 1,
      repo: 'partners',
      max: 5,
      registre: { estBloquante: () => false, estCodable: () => true, canonique: (h: string) => h },
      livrees: new Set(['DM-2']),
    };
    const taches: Parameters<typeof composerLeLot>[0] = [
      tache('GOV-999'),
      tache('DM-1'),
      tache('DM-2'),
    ];
    const { retenues } = composerLeLot(taches, options);
    expect(retenues.map((t) => t.id)).toEqual(['DM-1']);
  });
});
