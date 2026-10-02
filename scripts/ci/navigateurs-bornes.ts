/**
 * navigateurs-bornes.ts — QA-T59 (REQ-QA-016) : l'installation des navigateurs des passes
 * d'accessibilité, BORNÉE. Au plus `TENTATIVES` essais de `pnpm a11y:navigateurs`, chacun tué au bout
 * de `DELAI_PAR_TENTATIVE_MS` par l'option `timeout` de `spawnSync` (portable : aucun binaire
 * `timeout`) ; toutes échouées, sortie en 1 — une nouvelle tentative, jamais un vert de complaisance.
 *
 * USAGE (forge, `.github/workflows/ci.yml`, étape « Navigateurs des passes d accessibilite ») :
 *   pnpm a11y:navigateurs:bornes
 * `pnpm pre-gate` la classe LENTE (`scripts/prevol.ts`, ETAPES_LENTES) : elle ne tourne jamais en local.
 */
import { spawnSync } from 'node:child_process';

export const TENTATIVES = 3;
export const DELAI_PAR_TENTATIVE_MS = 240_000;

/** Une tentative : `true` si la commande est sortie en 0 dans le délai. */
export type Tentative = (delaiMs: number) => boolean;

/**
 * PURE. Joue au plus `tentatives` fois, s'arrête au premier succès ; rend le code de sortie et le
 * journal de chaque tentative, sans rien imprimer.
 */
export function installerBorne(
  tenter: Tentative,
  tentatives = TENTATIVES,
  delaiMs = DELAI_PAR_TENTATIVE_MS
): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  for (let i = 1; i <= tentatives; i++) {
    if (tenter(delaiMs)) {
      lignes.push(`✅ navigateurs installés à la tentative ${i} sur ${tentatives}`);
      return { code: 0, lignes };
    }
    lignes.push(
      `::warning::installation des navigateurs, tentative ${i} sur ${tentatives} échouée`
    );
  }
  lignes.push(`::error::installation des navigateurs, ${tentatives} tentatives échouées`);
  return { code: 1, lignes };
}

/** La vraie tentative : `pnpm a11y:navigateurs`, tuée au délai. */
const tenterPourDeVrai: Tentative = (delaiMs) =>
  spawnSync('pnpm', ['a11y:navigateurs'], {
    stdio: 'inherit',
    timeout: delaiMs,
    killSignal: 'SIGKILL',
    shell: process.platform === 'win32',
  }).status === 0;

const APPELE_DIRECTEMENT = /navigateurs-bornes\.ts$/.test(process.argv[1] ?? '');
if (APPELE_DIRECTEMENT) {
  const r = installerBorne(tenterPourDeVrai);
  for (const l of r.lignes) console.log(l);
  process.exitCode = r.code;
}
