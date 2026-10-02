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
import { readFileSync } from 'node:fs';
import {
  juger,
  empreinteDuCorps,
  blocDExecution,
  RUNBOOKS_EXIGES,
  FAMILLES,
  ENVIRONNEMENTS_ADMIS,
  MISE_EN_SERVICE,
  avantLaMiseEnService,
  issueDuControle,
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
    ).toEqual(['environnement_hors_liste']);
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

/**
 * AMENDEMENT (7)-(8) de QA-T13 (2026-09-30) : pas de serveur d'aperçus (décision de Williams), donc
 * les runbooks s'exercent sur la PRODUCTION avant toute donnée réelle. La garde ne croit pas une
 * étiquette (lentille securite) : `production-avant-donnees` n'est admis que si la date de mise en
 * service est POSÉE et que l'exercice lui est strictement antérieur. Date absente : refus (échec fermé).
 */
describe('REQ-QA-034 — production-avant-donnees, borné par la date de mise en service', () => {
  const avantDonnees = (date: string) =>
    exerce(CORPS, 'production-avant-donnees').replace('2026-09-30', date);
  const juge = (texte: string, miseEnService: string | null) =>
    juger([{ chemin: 'docs/runbooks/essai.md', texte }], miseEnService).map((x) => x.famille);

  it('REQ-QA-034 : exercé avant la date de mise en service, il passe', () => {
    expect(juge(avantDonnees('2026-10-01'), '2026-10-15')).toEqual([]);
  });

  it('REQ-QA-034 : exercé LE JOUR de la mise en service, il est refusé', () => {
    expect(juge(avantDonnees('2026-10-15'), '2026-10-15')).toEqual([
      'exerce_apres_mise_en_service',
    ]);
  });

  it('REQ-QA-034 : exercé APRÈS la mise en service, il est refusé, le runbook nommé', () => {
    const f = juger(
      [{ chemin: 'docs/runbooks/essai.md', texte: avantDonnees('2026-11-02') }],
      '2026-10-15'
    );
    expect(f.map((x) => x.famille)).toEqual(['exerce_apres_mise_en_service']);
    expect(f[0]!.message).toContain('docs/runbooks/essai.md');
  });

  it('REQ-QA-034 : date de mise en service ABSENTE, il est refusé (échec fermé)', () => {
    expect(juge(avantDonnees('2026-10-01'), null)).toEqual(['mise_en_service_non_posee']);
  });

  it('REQ-QA-034 : date de mise en service illisible, il est refusé comme si elle manquait', () => {
    expect(juge(avantDonnees('2026-10-01'), '15/10/2026')).toEqual(['mise_en_service_non_posee']);
  });

  it('REQ-QA-034 : CONTRE-TÉMOIN — preview ne dépend pas de la date de mise en service', () => {
    expect(juge(exerce(CORPS), null)).toEqual([]);
    expect(juge(exerce(CORPS), '2026-01-01')).toEqual([]);
  });

  it('REQ-QA-034 : un environnement hors de la liste fermée est refusé, même avec une date posée', () => {
    expect(juge(exerce(CORPS, 'local'), '2026-12-31')).toEqual(['environnement_hors_liste']);
  });

  it('REQ-QA-034 : la liste des environnements est fermée à deux', () => {
    expect([...ENVIRONNEMENTS_ADMIS]).toEqual(['preview', 'production-avant-donnees']);
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
        'environnement_hors_liste',
        'corps_modifie_depuis_l_exercice',
        'runbook_absent',
        'mise_en_service_non_posee',
        'exerce_apres_mise_en_service',
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

/**
 * QA-T56 (REQ-QA-027) — tant que les runbooks sont une CONDITION de la mise en service, leur absence
 * n'est pas une panne : le nightly ne rougit pas sur ce qui reste à faire avant le lancement. Une
 * seule source dit « sommes-nous en service » : `MISE_EN_SERVICE`. Le nightly FOURNIT `--now` (UTC),
 * la garde ne lit pas l'horloge. `--now` antérieur à la date, ou date non posée : avertissement qui
 * nomme chaque faute, sortie en zéro. À la date ou après, ou `--now` absent ou illisible : verdict
 * complet (échec fermé).
 */
describe('REQ-QA-027 — runbooks:exerces ne rougit pas le nightly avant la mise en service', () => {
  it('REQ-QA-027 : avant la date posée, ou date non posée, on est AVANT la mise en service', () => {
    expect(avantLaMiseEnService('2026-12-30', '2026-12-31')).toBe(true);
    expect(avantLaMiseEnService('2026-10-02', null)).toBe(true);
  });

  it('REQ-QA-027 : le jour même, après, --now absent ou illisible : verdict complet (échec fermé)', () => {
    expect(avantLaMiseEnService('2026-12-31', '2026-12-31')).toBe(false);
    expect(avantLaMiseEnService('2027-01-01', '2026-12-31')).toBe(false);
    expect(avantLaMiseEnService(null, '2026-12-31')).toBe(false);
    expect(avantLaMiseEnService('demain', '2026-12-31')).toBe(false);
    expect(avantLaMiseEnService('2026-10-02', 'bientôt')).toBe(false);
  });

  // Lentille securite (#418) : la BARRIÈRE RÉELLE de la mise en service est l'appel du runbook, SANS
  // `--now`. Elle ne peut jamais retomber en simple avertissement : le runbook ne fournit pas de date,
  // et la garde ne lit pas l'horloge pour en inventer une.
  it('REQ-QA-027 : la barrière du runbook de mise en service appelle la garde SANS --now, et la garde ne lit pas l’horloge', () => {
    const runbook = readFileSync('docs/runbooks/mise-en-service.md', 'utf8');
    const appels = runbook.match(/pnpm runbooks:exerces(?![:\w-])[^`\n]*/g) ?? [];
    expect(appels.length).toBeGreaterThan(0);
    for (const appel of appels) expect(appel).not.toContain('--now');
    const source = readFileSync('scripts/gates/runbooks-exerces.ts', 'utf8');
    expect(source).not.toMatch(/Date\.now\(|new Date\(\s*\)/);
  });

  it('REQ-QA-027 : avant la mise en service, des fautes donnent un avertissement nommé et zéro ; après, un refus', () => {
    const fautes = juger([{ chemin: 'docs/runbooks/essai.md', texte: CORPS }]);
    expect(fautes.length).toBeGreaterThan(0);
    const avant = issueDuControle(fautes, 3, true);
    expect(avant.code).toBe(0);
    expect(avant.lignes.filter((l) => l.startsWith('::notice::'))).toHaveLength(fautes.length);
    expect(avant.lignes.join('\n')).toContain('docs/runbooks/essai.md');
    expect(issueDuControle(fautes, 3, false).code).toBe(1);
    expect(issueDuControle([], 3, true).code).toBe(0);
  });

  it('REQ-QA-027 : le dépôt réel, lancé avec un --now antérieur à MISE_EN_SERVICE, sort en zéro', () => {
    const valeur = MISE_EN_SERVICE.valeur;
    const veille =
      valeur === null
        ? '2026-10-02'
        : new Date(Date.parse(`${valeur}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const r = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/gates/runbooks-exerces.ts', '--now', veille],
      { encoding: 'utf8' }
    );
    expect([r.status, r.stdout + r.stderr]).toEqual([0, expect.stringMatching(/mise en service/)]);
  }, 60_000);
});
