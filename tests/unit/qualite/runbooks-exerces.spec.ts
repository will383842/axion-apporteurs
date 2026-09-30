// @req REQ-QA-034
/**
 * QA-T13 — un runbook s'exerce en preview, pas sur le papier (REQ-QA-034).
 *
 * Chaque runbook exigé porte un bloc « Exécuté le : <date> · environnement : preview · SHA : <sha> ·
 * corps : <empreinte> · résultat : <texte> ». L'EMPREINTE du corps (le runbook sans son bloc) est
 * prise au moment de l'exercice : un corps modifié depuis ne correspond plus, et le runbook doit être
 * ré-exercé. C'est plus strict que de comparer des dates à l'historique, que le fait même de noter
 * l'exercice modifie.
 *
 * TÉMOIN À DEUX FACES (acceptation, point 4) : un bloc vidé, puis un corps modifié sans nouvel
 * exercice, font sortir la garde en non nul en NOMMANT le runbook ; des runbooks exercés la font
 * sortir en zéro, et le vert imprime le compte des runbooks confrontés.
 *
 * RM-11 : chaque runbook est fabriqué explicitement par le cas qui le juge.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  juger,
  empreinteDuCorps,
  blocDExecution,
  RUNBOOKS_EXIGES,
  FAMILLES,
} from '../../../scripts/gates/runbooks-exerces';

const CORPS = '# Runbook — essai\n\n## Geste\n\n1. Faire.\n2. Vérifier.\n';

function exerce(corps: string, env = 'preview'): string {
  return `${corps}\n## Exécuté le\n\n${blocDExecution({
    date: '2026-09-30',
    environnement: env,
    sha: 'abcdef1',
    corps: empreinteDuCorps(corps),
    resultat: 'readyz 200, en-tête au sha cible',
  })}\n`;
}

describe('REQ-QA-034 — le bloc d’exécution fait foi, et il suit le corps', () => {
  it('REQ-QA-034 : un runbook exercé en preview, corps inchangé, passe', () => {
    expect(juger([{ chemin: 'docs/runbooks/essai.md', texte: exerce(CORPS) }])).toEqual([]);
  });

  it('REQ-QA-034 : un bloc vidé est refusé, le runbook nommé', () => {
    const f = juger([
      {
        chemin: 'docs/runbooks/essai.md',
        texte: `${CORPS}\n## Exécuté le\n\nExécuté le : — · environnement : — · SHA : — · résultat : —\n`,
      },
    ]);
    expect(f.map((x) => x.famille)).toEqual(['bloc_vide']);
    expect(f[0]!.message).toContain('docs/runbooks/essai.md');
  });

  it('REQ-QA-034 : un runbook sans bloc est refusé', () => {
    expect(
      juger([{ chemin: 'docs/runbooks/essai.md', texte: CORPS }]).map((x) => x.famille)
    ).toEqual(['bloc_absent']);
  });

  it('REQ-QA-034 : un corps modifié sans nouvel exercice est refusé, le runbook nommé', () => {
    const texte = exerce(CORPS).replace('2. Vérifier.', '2. Vérifier deux fois.');
    const f = juger([{ chemin: 'docs/runbooks/essai.md', texte }]);
    expect(f.map((x) => x.famille)).toEqual(['corps_modifie_depuis_l_exercice']);
    expect(f[0]!.message).toContain('docs/runbooks/essai.md');
  });

  it('REQ-QA-034 : un exercice hors preview est refusé', () => {
    expect(
      juger([{ chemin: 'docs/runbooks/essai.md', texte: exerce(CORPS, 'production') }]).map(
        (x) => x.famille
      )
    ).toEqual(['hors_preview']);
  });

  it('REQ-QA-034 : une date ou un sha illisibles sont refusés', () => {
    const texte = exerce(CORPS).replace('2026-09-30', '30/09/2026');
    expect(juger([{ chemin: 'docs/runbooks/essai.md', texte }]).map((x) => x.famille)).toEqual([
      'bloc_illisible',
    ]);
  });

  it('REQ-QA-034 : l’empreinte ignore le bloc lui-même, pas le reste', () => {
    expect(empreinteDuCorps(exerce(CORPS))).toBe(empreinteDuCorps(CORPS));
    expect(empreinteDuCorps(`${CORPS}x`)).not.toBe(empreinteDuCorps(CORPS));
  });
});

describe('REQ-QA-034 — la liste des runbooks exigés, et la garde elle-même', () => {
  it('REQ-QA-034 : les runbooks du socle sont exigés, chacun avec son chemin', () => {
    expect(RUNBOOKS_EXIGES.length).toBeGreaterThanOrEqual(3);
    for (const r of RUNBOOKS_EXIGES) expect(r.chemin).toMatch(/^docs\/runbooks\/[a-z-]+\.md$/);
  });

  it('REQ-QA-034 : les familles déclarées sont exactement celles que ce fichier exerce', () => {
    expect([...FAMILLES].sort()).toEqual(
      [
        'bloc_absent',
        'bloc_vide',
        'bloc_illisible',
        'hors_preview',
        'corps_modifie_depuis_l_exercice',
        'runbook_absent',
      ].sort()
    );
  });

  it('REQ-QA-034 : --prove fait rougir chaque famille et imprime le compte des runbooks confrontés', () => {
    const r = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/runbooks-exerces.ts', '--prove'],
      { encoding: 'utf8' }
    );
    expect(r.stdout + r.stderr).toMatch(/runbook\(s\) confronté\(s\)/);
    expect(r.status).toBe(0);
  }, 60_000);
});
