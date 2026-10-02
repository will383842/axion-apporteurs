// @req REQ-CPL-009
// @no-red-first: garde-fou de non-régression, l'ordre aipd:signee puis deploy:coolify est déjà juste sur main ; ses deux copies cassées (étape déplacée, étape retirée) rougissent, nommées
/**
 * QA-T60, point (1) — aucun dépôt réel sans l'AIPD signée, et c'est l'ORDRE du job qui le garantit
 * (note de la lentille securite sur la vérification de l’AIPD avant déploiement).
 *
 * Dans le job `deployer` de `.github/workflows/deploy.yml`, l'étape qui lance `pnpm aipd:signee`
 * précède celle qui lance `pnpm deploy:coolify` : la plateforme ne reçoit jamais l'ordre de tirer une
 * image tant que l'AIPD n'est pas vérifiée. Retirer l'étape, ou la déplacer après le déploiement,
 * rougit. Jugé sur le workflow réel ET sur une copie cassée d'un geste (RM-02), sur le patron
 * d'`alerter_mal_garde` (`pipeline-image.spec.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireYaml } from '../../../scripts/lib/lire-yaml';

type Etape = { run?: string; if?: unknown; ['continue-on-error']?: unknown };
type Workflow = { jobs?: Record<string, { steps?: Etape[] }> };

const AIPD = 'pnpm aipd:signee';
const DEPLOIEMENT = 'pnpm deploy:coolify';

/**
 * L'ORDRE ne suffit pas, il faut le BLOCAGE (relevé de la lentille securite sur #460) : une étape
 * `aipd:signee` tolérée (`continue-on-error`) ou conditionnée (`if:`) laisserait la plateforme
 * déployer une AIPD non signée tout en restant « avant ». L'étape est donc inconditionnelle et
 * bloquante, ou elle rougit.
 */
async function fautes(texte: string): Promise<string[]> {
  const wf = (await lireYaml(texte)) as Workflow;
  const etapes = wf.jobs?.['deployer']?.steps ?? [];
  const runs = etapes.map((s) => s.run ?? '');
  const aipd = runs.indexOf(AIPD);
  const deploiement = runs.indexOf(DEPLOIEMENT);
  if (deploiement < 0) return ['deploiement_absent : le job deployer ne lance plus deploy:coolify'];
  if (aipd < 0) return ['aipd_absente : le job deployer ne vérifie plus l’AIPD'];
  const f: string[] = [];
  if (aipd > deploiement)
    f.push('aipd_apres_deploiement : l’AIPD est vérifiée après la plateforme');
  const etape = etapes[aipd]!;
  if (etape['continue-on-error'] !== undefined)
    f.push('aipd_toleree : l’étape de l’AIPD porte continue-on-error, son échec ne bloque plus');
  if (etape.if !== undefined)
    f.push('aipd_conditionnelle : l’étape de l’AIPD porte un if:, elle peut être sautée');
  // Le trou voisin (lentille securite) : un `if: always()`, `!cancelled()` ou `failure()` sur
  // l'étape du déploiement la ferait tourner APRÈS l'échec de l'AIPD. Elle ne porte aucun `if:`.
  if (etapes[deploiement]!.if !== undefined)
    f.push(
      'deploiement_conditionnel : l’étape deploy:coolify porte un if:, elle peut tourner après l’échec de l’AIPD'
    );
  return f;
}

const REEL = readFileSync('.github/workflows/deploy.yml', 'utf8');

/** La copie du workflow où les deux étapes `run` échangent leurs commandes. */
const inverse = (t: string) =>
  t
    .replace(`run: ${AIPD}`, 'run: §')
    .replace(`run: ${DEPLOIEMENT}`, `run: ${AIPD}`)
    .replace('run: §', `run: ${DEPLOIEMENT}`);

describe('REQ-CPL-009 — l’AIPD est vérifiée avant que la plateforme ne déploie', () => {
  it('REQ-CPL-009 : dans le job deployer réel, aipd:signee précède deploy:coolify', async () => {
    expect(await fautes(REEL)).toEqual([]);
  });

  it('REQ-CPL-009 : TÉMOINS — l’étape déplacée après le déploiement, ou retirée, rougit en se nommant', async () => {
    expect(await fautes(inverse(REEL))).toEqual([
      'aipd_apres_deploiement : l’AIPD est vérifiée après la plateforme',
    ]);
    expect(
      await fautes(REEL.replace(`run: ${AIPD}`, 'run: pnpm install --frozen-lockfile'))
    ).toEqual(['aipd_absente : le job deployer ne vérifie plus l’AIPD']);
  });

  it('REQ-CPL-009 : TÉMOINS — l’étape tolérée (continue-on-error) ou conditionnée (if:) rougit en se nommant, même à sa place', async () => {
    const avant = (cle: string) =>
      REEL.replace(`        run: ${AIPD}`, `        ${cle}\n        run: ${AIPD}`);
    expect(REEL).toContain(`        run: ${AIPD}`);
    expect(await fautes(avant('continue-on-error: true'))).toEqual([
      'aipd_toleree : l’étape de l’AIPD porte continue-on-error, son échec ne bloque plus',
    ]);
    expect(await fautes(avant('if: ${{ false }}'))).toEqual([
      'aipd_conditionnelle : l’étape de l’AIPD porte un if:, elle peut être sautée',
    ]);
  });

  it('REQ-CPL-009 : TÉMOIN — deploy:coolify avec if: always() rougit en se nommant : il tournerait après l’échec de l’AIPD', async () => {
    const ligne = `        run: ${DEPLOIEMENT}`;
    expect(REEL).toContain(ligne);
    for (const condition of ['always()', '!cancelled()', 'failure()'])
      expect(
        await fautes(REEL.replace(ligne, `        if: \${{ ${condition} }}\n${ligne}`))
      ).toEqual([
        'deploiement_conditionnel : l’étape deploy:coolify porte un if:, elle peut tourner après l’échec de l’AIPD',
      ]);
  });
});
