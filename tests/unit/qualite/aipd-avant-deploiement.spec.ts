// @req REQ-CPL-009
/**
 * QA-T60, point (1) — aucun dépôt réel sans l'AIPD signée, et c'est l'ORDRE du job qui le garantit
 * (note de la lentille securite sur JUR-T35).
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

type Etape = { run?: string };
type Workflow = { jobs?: Record<string, { steps?: Etape[] }> };

const AIPD = 'pnpm aipd:signee';
const DEPLOIEMENT = 'pnpm deploy:coolify';

async function fautes(texte: string): Promise<string[]> {
  const wf = (await lireYaml(texte)) as Workflow;
  const runs = (wf.jobs?.['deployer']?.steps ?? []).map((s) => s.run ?? '');
  const aipd = runs.indexOf(AIPD);
  const deploiement = runs.indexOf(DEPLOIEMENT);
  if (deploiement < 0) return ['deploiement_absent : le job deployer ne lance plus deploy:coolify'];
  if (aipd < 0) return ['aipd_absente : le job deployer ne vérifie plus l’AIPD'];
  if (aipd > deploiement)
    return ['aipd_apres_deploiement : l’AIPD est vérifiée après la plateforme'];
  return [];
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
});
