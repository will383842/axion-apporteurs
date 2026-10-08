// @req REQ-QA-016
/**
 * QA-T59 — l'installation des navigateurs des passes d'accessibilité ne bloque plus la porte A.
 *
 * Constat de la coordination : l'étape « Navigateurs des passes d accessibilite » de
 * `.github/workflows/ci.yml` (`pnpm a11y:navigateurs`) est restée bloquée plus de 25 minutes. Trois
 * règles, chacune lue dans le workflow et chacune vue rouge sur un workflow cassé d'un geste :
 *
 *   1. l'étape a un `timeout-minutes` borné : un blocage échoue vite, il n'immobilise plus la file ;
 *   2. l'étape lance le script BORNÉ, `pnpm a11y:navigateurs:bornes`, et rien d'autre : une forme
 *      fermée (REQ-GOV-018) que `pnpm pre-gate` classe lente. Le script de `package.json` mène à
 *      `scripts/ci/navigateurs-bornes.ts`, dont les bornes (trois tentatives, quatre minutes chacune,
 *      échec en 1 quand toutes échouent) sont gardées par `navigateurs-bornes.spec.ts` ;
 *   3. le cache `actions/cache` de `~/.cache/ms-playwright` vient AVANT la première commande du job
 *      (`gov:conventions`, point 5 : une action qui suit une commande peut réécrire l'arbre mesuré),
 *      et sa clé est DÉRIVÉE du verrou `pnpm-lock.yaml`, qui épingle Playwright (RM-01) : aucune
 *      version écrite en dur, aucune commande pour la lire (point 6 : `pnpm exec` n'est pas un
 *      script du dépôt).
 *
 * `a11y:navigateurs` reste la commande d'installation ; le script borné la rejoue.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const CI = '.github/workflows/ci.yml';
const NOM = 'Navigateurs des passes d accessibilite';
const TIMEOUT_MAX_MINUTES = 15;
const COMMANDE = 'pnpm a11y:navigateurs:bornes';
const SCRIPT_BORNE = 'scripts/ci/navigateurs-bornes.ts';

/** Les lignes d'une étape nommée, de son `- name:` à l'étape suivante du même niveau. */
function etape(yml: string, nom: string): string | null {
  const lignes = yml.split('\n');
  const i = lignes.findIndex((l) => new RegExp(`^\\s*- name: ${nom}\\s*$`).test(l));
  if (i < 0) return null;
  const retrait = /^(\s*)-/.exec(lignes[i]!)![1]!.length;
  const fin = lignes.findIndex(
    (l, j) => j > i && /^\s*-\s/.test(l) && /^(\s*)-/.exec(l)![1]!.length === retrait
  );
  return lignes.slice(i, fin < 0 ? undefined : fin).join('\n');
}

/**
 * L'étape de cache du job de l'étape des navigateurs, et si elle précède la première commande
 * (`run:`) de ce job. Le job commence à la dernière ligne `steps:` avant l'étape.
 */
function cacheDuJob(
  yml: string,
  nom: string
): { etape: string; avantLaPremiereCommande: boolean } | null {
  const iEtape = yml.search(new RegExp(`- name: ${nom}\\s*\\n`));
  if (iEtape < 0) return null;
  const job = yml.slice(yml.lastIndexOf('steps:', iEtape), iEtape);
  // GOV-142 : un job peut porter plusieurs caches (les moteurs de Prisma, puis les navigateurs) ;
  // celui des navigateurs est celui dont l'étape porte leur chemin, à défaut le premier.
  const caches: number[] = [];
  for (
    let k = job.indexOf('uses: actions/cache@');
    k >= 0;
    k = job.indexOf('uses: actions/cache@', k + 1)
  )
    caches.push(k);
  if (caches.length === 0) return null;
  const etapeDe = (k: number): string =>
    job.slice(
      job.lastIndexOf('\n      - ', k),
      job.indexOf('\n      - ', k) < 0 ? undefined : job.indexOf('\n      - ', k)
    );
  const i = caches.find((k) => /~\/\.cache\/ms-playwright/.test(etapeDe(k))) ?? caches[0]!;
  const debut = job.lastIndexOf('\n      - ', i);
  const fin = job.indexOf('\n      - ', i);
  const premiereCommande = job.search(/\n\s+(?:- )?run:/);
  return {
    etape: job.slice(debut, fin < 0 ? undefined : fin),
    avantLaPremiereCommande: premiereCommande < 0 || i < premiereCommande,
  };
}

function fautes(yml: string): string[] {
  const f: string[] = [];
  const e = etape(yml, NOM);
  if (!e) return [`étape « ${NOM} » introuvable`];
  const t = /timeout-minutes:\s*(\d+)/.exec(e);
  if (!t) f.push('timeout_absent : l’étape n’a pas de timeout-minutes');
  else if (Number(t[1]) > TIMEOUT_MAX_MINUTES)
    f.push(`timeout_trop_long : ${t[1]} min, au plus ${TIMEOUT_MAX_MINUTES}`);
  // L'étape lance le script borné, et rien d'autre : ni chaîne, ni `timeout`, ni second appel.
  const run = /\brun:\s*(.+)/.exec(e)?.[1]?.trim() ?? '';
  if (run !== COMMANDE)
    f.push(`script_non_borne : l’étape lance « ${run} » au lieu de « ${COMMANDE} »`);
  const c = cacheDuJob(yml, NOM);
  if (!c) f.push('cache_absent : aucun actions/cache dans le job, avant l’étape');
  else {
    if (!/path:\s*~\/\.cache\/ms-playwright/.test(c.etape))
      f.push('cache_mal_place : le chemin n’est pas ~/.cache/ms-playwright');
    if (!c.avantLaPremiereCommande)
      f.push('cache_apres_une_commande : l’action suit une commande du job');
    const cle = /key:\s*(.+)/.exec(c.etape)?.[1] ?? '';
    if (!/hashFiles\(\s*'pnpm-lock\.yaml'\s*\)/.test(cle))
      f.push('cle_non_derivee : la clé ne dérive pas du verrou pnpm-lock.yaml');
    if (/\d+\.\d+\.\d+/.test(cle)) f.push('version_en_dur : la clé écrit une version en dur');
  }
  if (/pnpm exec playwright/.test(yml))
    f.push('commande_integree : pnpm exec n’est pas un script du dépôt');
  return f;
}

describe('REQ-QA-016 — les navigateurs des passes d’accessibilité, bornés et en cache', () => {
  const yml = readFileSync(CI, 'utf8');

  it('REQ-QA-016 — timeout borné, tentatives bornées, cache avant toute commande, clé dérivée du verrou', () => {
    expect(fautes(yml)).toEqual([]);
  });

  it('REQ-QA-016 — le verrou épingle Playwright, et package.json mène le script borné à son fichier', () => {
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toMatch(
      /'@playwright\/test':\s*\n\s+specifier:/
    );
    const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(paquet.scripts['a11y:navigateurs']).toMatch(/^playwright install/);
    expect(paquet.scripts['a11y:navigateurs:bornes']).toBe(`tsx ${SCRIPT_BORNE}`);
    expect(existsSync(SCRIPT_BORNE)).toBe(true);
    // QA-T74 : le script borné ne lance plus `a11y:navigateurs` tel quel (son `--with-deps`, tué à
    // son délai, laissait l'apt-get de sudo orphelin, verrou en main) : il DÉRIVE ses deux commandes
    // de ce script de package.json, sans recopier la liste des navigateurs (RM-01).
    const script = readFileSync(SCRIPT_BORNE, 'utf8');
    expect(script).toMatch(/scripts\['a11y:navigateurs'\]/);
    expect(script).not.toMatch(/'chromium'|'webkit'/);
  });

  it('REQ-QA-016 — TÉMOIN : sans timeout, sans le script borné, version en dur, cache après une commande, chacun rougit', () => {
    const sansTimeout = yml.replace(
      /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?)\s*timeout-minutes: \d+\n/,
      '$1\n'
    );
    expect(fautes(sansTimeout)).toContain('timeout_absent : l’étape n’a pas de timeout-minutes');
    const ligne = (run: string) =>
      yml.replace(
        /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?\s*run:).*\n/,
        `$1 ${run}\n`
      );
    // L'installation nue (sans borne), la chaîne en ligne (refusée par REQ-GOV-018), le masque.
    for (const run of [
      'pnpm a11y:navigateurs',
      'timeout 240 pnpm a11y:navigateurs || timeout 240 pnpm a11y:navigateurs',
      `${COMMANDE} || true`,
    ])
      expect(fautes(ligne(run))).toContain(
        `script_non_borne : l’étape lance « ${run} » au lieu de « ${COMMANDE} »`
      );
    // GOV-142 : la clé du cache des NAVIGATEURS (un job porte aussi celui des moteurs de Prisma).
    const enDur = yml.replace(
      /(key:\s*navigateurs-.*)\$\{\{\s*hashFiles\([^)]*\)\s*\}\}/,
      '$1 1.63.0'
    );
    expect(fautes(enDur)).toEqual(
      expect.arrayContaining([
        'cle_non_derivee : la clé ne dérive pas du verrou pnpm-lock.yaml',
        'version_en_dur : la clé écrit une version en dur',
      ])
    );
    // Le cache déplacé APRÈS l'installation du MÊME job (le premier qui porte l'étape des navigateurs).
    const cache = cacheDuJob(yml, NOM)!.etape;
    const sansCache = yml.replace(cache, '');
    const iNav = sansCache.search(new RegExp(`- name: ${NOM}\\s*\\n`));
    const install = '\n      - run: pnpm install --frozen-lockfile';
    const iInstall = sansCache.lastIndexOf(install, iNav);
    const apresUneCommande =
      sansCache.slice(0, iInstall + install.length) +
      cache +
      sansCache.slice(iInstall + install.length);
    expect(fautes(apresUneCommande)).toContain(
      'cache_apres_une_commande : l’action suit une commande du job'
    );
  });
});
