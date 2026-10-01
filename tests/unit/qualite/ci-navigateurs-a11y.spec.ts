// @req REQ-QA-016
/**
 * QA-T59 — l'installation des navigateurs des passes d'accessibilité ne bloque plus la porte A.
 *
 * Constat de la coordination : l'étape « Navigateurs des passes d accessibilite » de
 * `.github/workflows/ci.yml` (`pnpm a11y:navigateurs`) est restée bloquée plus de 25 minutes. Trois
 * règles, chacune lue dans le workflow et chacune vue rouge sur un workflow cassé d'un geste :
 *
 *   1. l'étape a un `timeout-minutes` borné : un blocage échoue vite, il n'immobilise plus la file ;
 *   2. la commande est rejouée par une boucle BORNÉE (au plus trois tentatives, chacune sous
 *      `timeout`), et l'étape échoue si toutes échouent : une nouvelle tentative, jamais un vert de
 *      complaisance ;
 *   3. le cache `actions/cache` de `~/.cache/ms-playwright` vient AVANT la première commande du job
 *      (`gov:conventions`, point 5 : une action qui suit une commande peut réécrire l'arbre mesuré),
 *      et sa clé est DÉRIVÉE du verrou `pnpm-lock.yaml`, qui épingle Playwright (RM-01) : aucune
 *      version écrite en dur, aucune commande pour la lire (point 6 : `pnpm exec` n'est pas un
 *      script du dépôt).
 *
 * `package.json` n'est pas touché : la commande reste `pnpm a11y:navigateurs`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CI = '.github/workflows/ci.yml';
const NOM = 'Navigateurs des passes d accessibilite';
const TIMEOUT_MAX_MINUTES = 15;
const TENTATIVES_MAX = 3;

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
  const i = job.indexOf('uses: actions/cache@');
  if (i < 0) return null;
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
  const boucle = /for \w+ in ((?:\d+ ?)+); do/.exec(e);
  if (!boucle || !/pnpm a11y:navigateurs/.test(e))
    f.push('tentatives_absentes : aucune boucle de tentatives autour de pnpm a11y:navigateurs');
  else {
    const n = boucle[1]!.trim().split(/\s+/).length;
    if (n > TENTATIVES_MAX)
      f.push(`tentatives_non_bornees : ${n} tentatives, au plus ${TENTATIVES_MAX}`);
    if (!/timeout \d+/.test(e))
      f.push('tentative_sans_timeout : chaque tentative doit être sous timeout');
    if (!/exit 1/.test(e))
      f.push('echec_masque : l’étape ne sort pas en erreur quand toutes les tentatives échouent');
  }
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

  it('REQ-QA-016 — le verrou épingle Playwright, et package.json garde la commande', () => {
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toMatch(
      /'@playwright\/test':\s*\n\s+specifier:/
    );
    const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(paquet.scripts['a11y:navigateurs']).toMatch(/^playwright install/);
  });

  it('REQ-QA-016 — TÉMOIN : sans timeout, sans borne, version en dur, cache après une commande, chacun rougit', () => {
    const sansTimeout = yml.replace(
      /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?)\s*timeout-minutes: \d+\n/,
      '$1\n'
    );
    expect(fautes(sansTimeout)).toContain('timeout_absent : l’étape n’a pas de timeout-minutes');
    const sansBorne = yml.replace(/for (\w+) in (?:\d+ ?)+; do/, 'for $1 in 1 2 3 4 5 6; do');
    expect(fautes(sansBorne)).toContain(
      `tentatives_non_bornees : 6 tentatives, au plus ${TENTATIVES_MAX}`
    );
    const enDur = yml.replace(/(key:\s*.*)\$\{\{\s*hashFiles\([^)]*\)\s*\}\}/, '$1 1.63.0');
    expect(fautes(enDur)).toEqual(
      expect.arrayContaining([
        'cle_non_derivee : la clé ne dérive pas du verrou pnpm-lock.yaml',
        'version_en_dur : la clé écrit une version en dur',
      ])
    );
    const cache = cacheDuJob(yml, NOM)!.etape;
    const apresUneCommande = yml
      .replace(cache, '')
      .replace(/(\n\s+- run: pnpm install --frozen-lockfile)/, `$1${cache}`);
    expect(fautes(apresUneCommande)).toContain(
      'cache_apres_une_commande : l’action suit une commande du job'
    );
  });
});
