/**
 * navigateurs-bornes.ts — QA-T59 (REQ-QA-016) : l'installation des navigateurs des passes
 * d'accessibilité, BORNÉE ; toutes les tentatives échouées, sortie en 1 — une nouvelle tentative,
 * jamais un vert de complaisance.
 *
 * QA-T74 — LE VERROU D'APT, EN DEUX TEMPS. `playwright install --with-deps` faisait tout d'un bloc :
 * apt (les dépendances système, sous sudo) PUIS le téléchargement des navigateurs. Tuer une tentative
 * lente tuait pnpm et playwright, mais PAS l'apt-get lancé sous sudo : l'orphelin gardait
 * `/var/lib/dpkg/lock-frontend`, et les tentatives suivantes échouaient en une seconde sur NOTRE PROPRE
 * verrou (run 37687549026 de #842, processus 4378). D'où deux temps :
 *   1. LES DÉPENDANCES (`playwright install-deps`, le seul à prendre le verrou) : jamais tuées. Une
 *      tentative ne se rejoue qu'après être SORTIE d'elle-même (un échec d'apt rend le verrou) ; le
 *      verrou du runner est attendu avant chacune. Seul le `timeout-minutes` de l'étape les borne :
 *      s'il frappe, l'étape échoue, et aucune tentative ne suit l'orphelin.
 *   2. LES NAVIGATEURS (`playwright install`, sans apt) : `TENTATIVES` essais tués à
 *      `DELAI_PAR_TENTATIVE_MS`, séparés par `PAUSES_MS` — tuer un téléchargement ne laisse aucun verrou.
 *
 * USAGE (forge, `.github/workflows/ci.yml`, étape « Navigateurs des passes d accessibilite ») :
 *   pnpm a11y:navigateurs:bornes
 * `pnpm pre-gate` la classe LENTE (`scripts/prevol.ts`, ETAPES_LENTES) : elle ne tourne jamais en local.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

/** Les navigateurs des passes d'accessibilité. */
export const NAVIGATEURS: readonly string[] = ['chromium', 'webkit'];

/** Temps 1 : au plus deux tentatives des dépendances, chacune SORTIE d'elle-même avant la suivante. */
export const TENTATIVES_DEPENDANCES = 2;
/** Temps 2 : trois tentatives du téléchargement des navigateurs, deux minutes chacune. */
export const TENTATIVES = 3;
export const DELAI_PAR_TENTATIVE_MS = 120_000;
/** La pause APRÈS l'échec de la tentative i (i = 1, 2), dans chacun des deux temps. */
export const PAUSES_MS: readonly number[] = [30_000, 60_000];
/** L'attente bornée du verrou d'apt avant chaque tentative des dépendances, et son pas. */
export const ATTENTE_VERROU_MS = 75_000;
export const PAS_VERROU_MS = 5_000;
/** La durée de l'étape (`timeout-minutes: 15` dans ci.yml). */
export const DUREE_ETAPE_MS = 15 * 60_000;

/** Une tentative bornée : `true` si la commande est sortie en 0 dans le délai. */
export type Tentative = (delaiMs: number) => boolean;
/** Une tentative SANS délai : `true` si la commande est sortie en 0. */
export type TentativeLibre = () => boolean;

/** Ce que la vraie installation injecte ; par défaut, rien (les fonctions restent PURES). */
export type Outils = {
  /** Attend `ms` millisecondes. */
  attendre?: (ms: number) => void;
  /** Attend, borné, que le verrou d'apt se libère ; rend `true` s'il est libre. */
  attendreLeVerrou?: () => boolean;
};

type Resultat = { code: 0 | 1; lignes: string[] };

/** PURE. Temps 1 : les dépendances, jamais tuées ; le verrou attendu avant chaque tentative. */
export function installerLesDependances(
  tenter: TentativeLibre,
  tentatives = TENTATIVES_DEPENDANCES,
  outils: Outils = {}
): Resultat {
  const lignes: string[] = [];
  for (let i = 1; i <= tentatives; i++) {
    if (outils.attendreLeVerrou && !outils.attendreLeVerrou()) {
      lignes.push(
        `::warning::le verrou d'apt (/var/lib/dpkg/lock-frontend) est encore tenu avant la tentative ${i} des dépendances : elle est jouée quand même`
      );
    }
    if (tenter()) {
      lignes.push(`✅ dépendances système installées à la tentative ${i} sur ${tentatives}`);
      return { code: 0, lignes };
    }
    lignes.push(`::warning::dépendances système, tentative ${i} sur ${tentatives} échouée`);
    const pause = PAUSES_MS[i - 1];
    if (i < tentatives && pause !== undefined && outils.attendre) {
      lignes.push(`pause de ${pause / 1000} s avant la tentative ${i + 1} des dépendances`);
      outils.attendre(pause);
    }
  }
  lignes.push(`::error::dépendances système, ${tentatives} tentatives échouées`);
  return { code: 1, lignes };
}

/**
 * PURE. Temps 2 : au plus `tentatives` téléchargements, s'arrête au premier succès ; rend le code de
 * sortie et le journal de chaque tentative, sans rien imprimer.
 */
export function installerBorne(
  tenter: Tentative,
  tentatives = TENTATIVES,
  delaiMs = DELAI_PAR_TENTATIVE_MS,
  outils: Outils = {}
): Resultat {
  const lignes: string[] = [];
  for (let i = 1; i <= tentatives; i++) {
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

/** PURE. Les deux temps, dans l'ordre ; le second ne commence que si le premier a réussi. */
export function installerEnDeuxTemps(
  dependances: TentativeLibre,
  navigateurs: Tentative,
  outils: Outils = {}
): Resultat {
  const d = installerLesDependances(dependances, TENTATIVES_DEPENDANCES, outils);
  if (d.code !== 0) return d;
  const n = installerBorne(navigateurs, TENTATIVES, DELAI_PAR_TENTATIVE_MS, outils);
  return { code: n.code, lignes: [...d.lignes, ...n.lignes] };
}

const shell = process.platform === 'win32';

/** Temps 1 : les options du lancement des dépendances. AUCUN `timeout` : apt n'est jamais tué. */
export const OPTIONS_DEPENDANCES: SpawnSyncOptions = { stdio: 'inherit', shell };

const tenterLesDependances: TentativeLibre = () =>
  spawnSync('pnpm', ['exec', 'playwright', 'install-deps', ...NAVIGATEURS], OPTIONS_DEPENDANCES)
    .status === 0;

/** Temps 2 : le téléchargement, tué au délai. */
const tenterLesNavigateurs: Tentative = (delaiMs) =>
  spawnSync('pnpm', ['exec', 'playwright', 'install', ...NAVIGATEURS], {
    stdio: 'inherit',
    timeout: delaiMs,
    killSignal: 'SIGKILL',
    shell,
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
  const r = installerEnDeuxTemps(tenterLesDependances, tenterLesNavigateurs, {
    attendre: attendrePourDeVrai,
    attendreLeVerrou: attendreLeVerrouPourDeVrai,
  });
  for (const l of r.lignes) console.log(l);
  process.exitCode = r.code;
}
