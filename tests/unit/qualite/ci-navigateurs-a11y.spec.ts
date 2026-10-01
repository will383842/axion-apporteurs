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
 *   3. le cache `actions/cache` de `~/.cache/ms-playwright` précède l'étape, et sa clé porte la
 *      version de Playwright LUE dans le paquet installé (RM-01) : aucune version écrite en dur, qui
 *      servirait des navigateurs périmés après une montée de version.
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

/** L'étape de cache qui précède l'étape des navigateurs, la plus proche. */
function cacheAvant(yml: string, nom: string): string | null {
  const iEtape = yml.search(new RegExp(`- name: ${nom}\\s*\\n`));
  if (iEtape < 0) return null;
  const avant = yml.slice(0, iEtape);
  const i = avant.lastIndexOf('uses: actions/cache@');
  if (i < 0) return null;
  const debut = avant.lastIndexOf('\n      - ', i);
  return avant.slice(debut, iEtape);
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
  const c = cacheAvant(yml, NOM);
  if (!c) f.push('cache_absent : aucun actions/cache avant l’étape');
  else {
    if (!/path:\s*~\/\.cache\/ms-playwright/.test(c))
      f.push('cache_mal_place : le chemin n’est pas ~/.cache/ms-playwright');
    const cle = /key:\s*(.+)/.exec(c)?.[1] ?? '';
    if (!/\$\{\{\s*steps\.[\w-]+\.outputs\.[\w-]+\s*\}\}/.test(cle))
      f.push('cle_sans_version_lue : la clé ne porte pas la version lue dans le paquet installé');
    if (/\d+\.\d+\.\d+/.test(cle)) f.push('version_en_dur : la clé écrit une version en dur');
  }
  return f;
}

describe('REQ-QA-016 — les navigateurs des passes d’accessibilité, bornés et en cache', () => {
  const yml = readFileSync(CI, 'utf8');

  it('REQ-QA-016 — timeout borné, tentatives bornées, cache à la version lue', () => {
    expect(fautes(yml)).toEqual([]);
  });

  it('REQ-QA-016 — la version de la clé est lue dans le paquet installé, et package.json garde la commande', () => {
    expect(yml).toMatch(/version=\$\(pnpm exec playwright --version/);
    const paquet = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(paquet.scripts['a11y:navigateurs']).toMatch(/^playwright install/);
  });

  it('REQ-QA-016 — TÉMOIN : sans timeout, sans borne, avec une version en dur, chacun rougit', () => {
    const sansTimeout = yml.replace(
      /(- name: Navigateurs des passes d accessibilite\n(?:.*\n)*?)\s*timeout-minutes: \d+\n/,
      '$1\n'
    );
    expect(fautes(sansTimeout)).toContain('timeout_absent : l’étape n’a pas de timeout-minutes');
    const sansBorne = yml.replace(/for (\w+) in (?:\d+ ?)+; do/, 'for $1 in 1 2 3 4 5 6; do');
    expect(fautes(sansBorne)).toContain(
      `tentatives_non_bornees : 6 tentatives, au plus ${TENTATIVES_MAX}`
    );
    const enDur = yml.replace(
      /key:\s*(.*)\$\{\{\s*steps\.[\w-]+\.outputs\.[\w-]+\s*\}\}/,
      'key: $1 1.63.0'
    );
    expect(fautes(enDur)).toEqual(
      expect.arrayContaining([
        'cle_sans_version_lue : la clé ne porte pas la version lue dans le paquet installé',
        'version_en_dur : la clé écrit une version en dur',
      ])
    );
  });
});
