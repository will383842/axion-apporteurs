/**
 * navigateurs-bornes.ts — QA-T59 (REQ-QA-016) : l'installation des navigateurs des passes
 * d'accessibilité, BORNÉE. Au plus `TENTATIVES` essais de `pnpm a11y:navigateurs`, chacun tué au bout
 * de `DELAI_PAR_TENTATIVE_MS` par l'option `timeout` de `spawnSync` (portable : aucun binaire
 * `timeout`) ; toutes échouées, sortie en 1 — une nouvelle tentative, jamais un vert de complaisance.
 *
 * QA-T74 — LE VERROU D'APT DU RUNNER. `playwright install --with-deps` passe par apt ; depuis le
 * 2026-10-07 vers 18 h 25 UTC, la mise à jour automatique du runner tient `/var/lib/dpkg/lock-frontend`
 * et l'installation sort en 100 (« Could not get lock »). Les trois tentatives s'enchaînaient SANS
 * PAUSE et brûlaient en quelques secondes un verrou tenu quelques minutes. Désormais, avant chaque
 * tentative, on attend que le verrou se libère (borné), et entre deux tentatives on marque une PAUSE
 * (`PAUSES_MS`). Échec fermé inchangé : trois échecs sortent en 1, aucun test n'est sauté.
 *
 * USAGE (forge, `.github/workflows/ci.yml`, étape « Navigateurs des passes d accessibilite ») :
 *   pnpm a11y:navigateurs:bornes
 * `pnpm pre-gate` la classe LENTE (`scripts/prevol.ts`, ETAPES_LENTES) : elle ne tourne jamais en local.
 */
import { spawnSync } from 'node:child_process';

export const TENTATIVES = 3;
/**
 * QA-T74 : 180 s par tentative (240 avant) — l attente du verrou et la tentative S ADDITIONNENT, et
 * leur somme, pauses comprises, doit tenir sous les quinze minutes de l étape avec une marge.
 */
export const DELAI_PAR_TENTATIVE_MS = 180_000;
/** QA-T74 : la pause APRÈS l'échec de la tentative i (i = 1, 2). */
export const PAUSES_MS: readonly number[] = [30_000, 60_000];
/** QA-T74 : l'attente bornée du verrou d'apt avant chaque tentative, et son pas d'interrogation. */
export const ATTENTE_VERROU_MS = 75_000;
export const PAS_VERROU_MS = 5_000;

/** Une tentative : `true` si la commande est sortie en 0 dans le délai. */
export type Tentative = (delaiMs: number) => boolean;

/** QA-T74 : ce que la vraie installation injecte ; par défaut, rien (la fonction reste PURE). */
export type Outils = {
  /** Attend `ms` millisecondes. */
  attendre?: (ms: number) => void;
  /** Attend, borné, que le verrou d'apt se libère ; rend `true` s'il est libre. */
  attendreLeVerrou?: () => boolean;
};

/**
 * PURE. Joue au plus `tentatives` fois, s'arrête au premier succès ; rend le code de sortie et le
 * journal de chaque tentative, sans rien imprimer. Les pauses et l'attente du verrou sont injectées.
 */
export function installerBorne(
  tenter: Tentative,
  tentatives = TENTATIVES,
  delaiMs = DELAI_PAR_TENTATIVE_MS,
  outils: Outils = {}
): { code: 0 | 1; lignes: string[] } {
  const lignes: string[] = [];
  for (let i = 1; i <= tentatives; i++) {
    if (outils.attendreLeVerrou && !outils.attendreLeVerrou()) {
      lignes.push(
        `::warning::le verrou d'apt (/var/lib/dpkg/lock-frontend) est encore tenu avant la tentative ${i} : elle est jouée quand même`
      );
    }
    if (tenter(delaiMs)) {
      lignes.push(`✅ navigateurs installés à la tentative ${i} sur ${tentatives}`);
      return { code: 0, lignes };
    }
    lignes.push(
      `::warning::installation des navigateurs, tentative ${i} sur ${tentatives} échouée`
    );
    const pause = PAUSES_MS[i - 1];
    if (i < tentatives && pause !== undefined && outils.attendre) {
      lignes.push(`pause de ${pause / 1000} s avant la tentative ${i + 1}`);
      outils.attendre(pause);
    }
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

/** Une pause SYNCHRONE, sans boucle active. */
const attendrePourDeVrai = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Le verrou d'apt, interrogé par `sudo -n fuser` (sortie 0 : un processus le tient). Hors Linux, ou si
 * `fuser` manque, il est réputé libre : l'attente ne remplace pas les tentatives, elle les espace.
 */
const verrouTenu = (): boolean =>
  process.platform === 'linux' &&
  spawnSync('sudo', ['-n', 'fuser', '/var/lib/dpkg/lock-frontend'], { stdio: 'ignore' }).status ===
    0;

const attendreLeVerrouPourDeVrai = (): boolean => {
  for (let ecoule = 0; ecoule < ATTENTE_VERROU_MS; ecoule += PAS_VERROU_MS) {
    if (!verrouTenu()) return true;
    attendrePourDeVrai(PAS_VERROU_MS);
  }
  return !verrouTenu();
};

const APPELE_DIRECTEMENT = /navigateurs-bornes\.ts$/.test(process.argv[1] ?? '');
if (APPELE_DIRECTEMENT) {
  const r = installerBorne(tenterPourDeVrai, TENTATIVES, DELAI_PAR_TENTATIVE_MS, {
    attendre: attendrePourDeVrai,
    attendreLeVerrou: attendreLeVerrouPourDeVrai,
  });
  for (const l of r.lignes) console.log(l);
  process.exitCode = r.code;
}
