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
 *   2. LES NAVIGATEURS (`playwright install`, SANS `--with-deps`, donc sans apt) : `TENTATIVES` essais tués à
 *      `DELAI_PAR_TENTATIVE_MS`, séparés par `PAUSES_MS` — tuer un téléchargement ne laisse aucun verrou.
 *
 * USAGE (forge, `.github/workflows/ci.yml`, étape « Navigateurs des passes d accessibilite ») :
 *   pnpm a11y:navigateurs:bornes
 * `pnpm pre-gate` la classe LENTE (`scripts/prevol.ts`, ETAPES_LENTES) : elle ne tourne jamais en local.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

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
/**
 * Le dossier, sous `$HOME`, où apt garde les paquets .deb des navigateurs ; ci.yml le met en cache
 * (`~/` + ce chemin, gardé par `ci-navigateurs-a11y.spec.ts`). Runs 37761685272 et 37763717776 : les
 * 126 Mo venus du miroir à quelques dizaines de ko/s ont dépassé les 15 min de l'étape.
 */
export const DOSSIER_PAQUETS = '.cache/apt-navigateurs';

/** PURE. La configuration d'apt qui range ET garde les archives dans `dossier` (absolu). */
export function configurationApt(dossier: string): string {
  if (!dossier.startsWith('/') || /["\n;]/.test(dossier))
    throw new Error(
      `le dossier des paquets d'apt doit être absolu et sans guillemet : « ${dossier} »`
    );
  return [
    `Dir::Cache::Archives "${dossier.replace(/\/$/, '')}/";`,
    'APT::Keep-Downloaded-Packages "true";',
    'Binary::apt::APT::Keep-Downloaded-Packages "true";',
    '',
  ].join('\n');
}

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

/**
 * PURE. Les deux commandes, DÉRIVÉES du script `a11y:navigateurs` de package.json (RM-01 : la liste
 * des navigateurs n'est écrite que là) : `install-deps` pour apt, et `install` SANS `--with-deps` pour
 * le téléchargement — tué à son délai, il ne laisse aucun apt orphelin. Une autre forme est refusée.
 */
export function commandesDerivees(script: string): {
  dependances: string[];
  navigateurs: string[];
} {
  const m = /^playwright install((?:\s+--with-deps)?)((?:\s+[a-z-]+)+)\s*$/.exec(script.trim());
  const liste = (m?.[2] ?? '')
    .trim()
    .split(/\s+/)
    .filter((n) => n && !n.startsWith('-'));
  if (!m || liste.length === 0)
    throw new Error(
      `le script \`a11y:navigateurs\` (« ${script} ») n'est pas « playwright install [--with-deps] <navigateurs> »`
    );
  return {
    dependances: ['exec', 'playwright', 'install-deps', ...liste],
    navigateurs: ['exec', 'playwright', 'install', ...liste],
  };
}

const commandes = (): ReturnType<typeof commandesDerivees> => {
  const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  return commandesDerivees(paquet.scripts['a11y:navigateurs'] ?? '');
};

/**
 * Sous Linux, apt range ses archives dans le dossier mis en cache (restauré par ci.yml avant cette
 * étape) ; après coup, le dossier est rendu à l'utilisateur du job, pour que l'action de cache le
 * lise. Un échec ici n'est qu'un cache perdu : il est NOMMÉ, et l'installation continue.
 */
const brancherLeCacheDesPaquets = (): void => {
  if (process.platform !== 'linux') return;
  const dossier = join(homedir(), DOSSIER_PAQUETS);
  mkdirSync(join(dossier, 'partial'), { recursive: true });
  const ecrit = spawnSync('sudo', ['-n', 'tee', '/etc/apt/apt.conf.d/99-navigateurs-cache'], {
    input: configurationApt(dossier),
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (ecrit.status !== 0)
    console.log(`::warning::le cache des paquets d'apt n'est pas branché (sortie ${ecrit.status})`);
};

const rendreLeCacheDesPaquets = (): void => {
  if (process.platform !== 'linux') return;
  const { uid, gid } = userInfo();
  spawnSync('sudo', ['-n', 'chown', '-R', `${uid}:${gid}`, join(homedir(), DOSSIER_PAQUETS)], {
    stdio: 'inherit',
  });
};

const tenterLesDependances: TentativeLibre = () => {
  brancherLeCacheDesPaquets();
  try {
    return spawnSync('pnpm', commandes().dependances, OPTIONS_DEPENDANCES).status === 0;
  } finally {
    rendreLeCacheDesPaquets();
  }
};

/** Temps 2 : le téléchargement, tué au délai. */
const tenterLesNavigateurs: Tentative = (delaiMs) =>
  spawnSync('pnpm', commandes().navigateurs, {
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
