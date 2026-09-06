// @req REQ-GOV-032
/**
 * LES REFUS QUI N'ÉTAIENT GARDÉS PAR RIEN.
 *
 * CE QUI A FAIT ÉCRIRE CE FICHIER. La lentille `mutation` a mesuré au 10e tour de la PR #31 :
 *
 *   — `gov-trace.ts --render` refuse désormais de rendre une matrice dont les sources sont
 *     fautives, et le refus FONCTIONNE (faute injectée → exit 1, rien d'écrit ; contrôle
 *     neutralisé → la matrice fautive est écrite, exit 0). **Mais AUCUN test ne le couvre**, et la
 *     cécité est de famille : aucun test du dépôt n'écrit dans une SOURCE de `docs/`, si bien que
 *     les refus jumeaux de `gov-tasks.ts` et `gov-requirements.ts` sont tout aussi nus.
 *     `vues-derivees.spec.ts` périme la VUE, jamais la SOURCE.
 *
 *   — Retirer la seule ligne `process.exit(1)` du bloc de concordance des têtes laisse l'appel,
 *     les deux `console.error` et **toutes les chaînes que le témoin épingle** : 546/546 verts.
 *     Le binaire muté imprime alors le refus puis **rend le corps quand même**, et `DOD_REVUES`
 *     est calculée contre une tête qui n'est pas celle de l'arbre. *C'est le chemin qui coche la
 *     case.*
 *
 * CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS. Il vise la STRUCTURE du refus — que le
 * contrôle précède l'écriture, et que la sortie soit un échec — et il tue les deux mutants
 * ci-dessus. **Il ne prouve toujours pas l'EFFET** : seul un lancement réel du binaire le ferait,
 * et le bloc `if (process.argv[1]?.endsWith(…))` de `corps-de-pr.ts` n'est lancé par aucun test.
 * Cette dette-là est écrite, elle n'est pas refermée ici.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Le corps d'un bloc `if (…) { … }` repéré par sa première ligne. Naïf mais suffisant : on
 *  compte les accolades, et on refuse plutôt que de rendre un bloc tronqué. */
function blocApres(source: string, ancre: string): string {
  const i = source.indexOf(ancre);
  if (i < 0) throw new Error(`ancre introuvable : ${ancre}`);
  let profondeur = 0;
  let debut = -1;
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') {
      if (debut < 0) debut = j;
      profondeur++;
    } else if (source[j] === '}') {
      profondeur--;
      if (profondeur === 0 && debut >= 0) return source.slice(debut, j + 1);
    }
  }
  throw new Error(`bloc non refermé après : ${ancre}`);
}

const TRACE = readFileSync('scripts/gates/gov-trace.ts', 'utf8');
const TACHES = readFileSync('scripts/gates/gov-tasks.ts', 'utf8');
const EXIGENCES = readFileSync('scripts/gates/gov-requirements.ts', 'utf8');
const COMPOSEUR = readFileSync('scripts/lot/corps-de-pr.ts', 'utf8');

describe('REQ-GOV-032 — un refus de rendre contrôle AVANT d’écrire, et sort en échec', () => {
  it('REQ-GOV-032 — `gov:trace --render` appelle `controler` AVANT `writeFileSync`', () => {
    // C'est le remède du 9e tour : sans lui, le rouge `vue_divergente` prescrivait `--render`,
    // qui écrivait la fausse attribution comme officielle. Le remède ne peut pas être moins
    // gardé que le mal.
    const bloc = blocApres(TRACE, "if (process.argv.includes('--render'))");
    const iControle = bloc.indexOf('controler(');
    const iEcriture = bloc.indexOf('writeFileSync(CHEMIN_VUE');
    expect(iControle, 'le bloc --render n’appelle pas `controler`').toBeGreaterThanOrEqual(0);
    expect(iEcriture, 'le bloc --render n’écrit pas la vue').toBeGreaterThanOrEqual(0);
    expect(iControle, 'le contrôle vient APRÈS l’écriture — il ne garde rien').toBeLessThan(iEcriture);
    expect(bloc, 'le refus ne sort pas en échec').toContain('process.exit(1)');
  });

  it('REQ-GOV-032 — TÉMOIN : un contrôle neutralisé par une constante fausse est refusé', () => {
    // La mutation posée par la lentille était `if (false)`. Une condition qui ne dépend pas des
    // fautes ne garde rien, et se lit pourtant comme une garde.
    const bloc = blocApres(TRACE, "if (process.argv.includes('--render'))");
    expect(/if \(fautesAvantRendu\.length > 0\)/.test(bloc), 'la condition du refus a été altérée').toBe(true);
    expect(/if \((?:false|0|null|undefined)\b/.test(bloc), 'le refus est neutralisé par une constante').toBe(false);
  });

  it('REQ-GOV-032 — les DEUX générateurs frères portent le même refus', () => {
    // L'asymétrie entre `gov-requirements.ts` (qui refusait déjà) et `gov-trace.ts` (qui écrivait
    // sans contrôle) est ce qui a permis à la matrice de PROPAGER les fautes pendant des mois.
    for (const [nom, source] of [
      ['gov-tasks.ts', TACHES],
      ['gov-requirements.ts', EXIGENCES],
    ] as const) {
      expect(source, `${nom} : aucun refus de rendre`).toMatch(/Refus de rendre/);
    }
  });
});

describe('REQ-GOV-032 — le refus du composeur SORT, il ne se contente pas de le dire', () => {
  it('REQ-GOV-032 — TÉMOIN : `process.exit(1)` est DANS le bloc de concordance des têtes', () => {
    // Le mutant de la lentille : retirer cette seule ligne laisse l'appel, les deux messages et
    // toutes les chaînes que le témoin de forme épingle — et le corps est rendu QUAND MÊME,
    // `DOD_REVUES` calculée contre une tête qui n'est pas celle de l'arbre.
    const bloc = blocApres(COMPOSEUR, 'if (!tetesConcordent(teteLocale, tete))');
    expect(bloc, 'le refus imprime mais ne sort pas — le corps serait rendu quand même').toContain(
      'process.exit(1)'
    );
    expect(bloc.includes('process.exit(0)'), 'le refus sort en SUCCÈS').toBe(false);
  });

  it('REQ-GOV-032 — TÉMOIN : `--pr` manquant fait ÉCHOUER le binaire, pour de vrai', () => {
    // ⚠️ CELUI-CI EST UN TÉMOIN D'EFFET, et c'est le seul de ce fichier. Il est possible parce que
    // le contrôle de `--pr` précède tout appel à la forge : le binaire refuse hors ligne, sans
    // jeton et sans réseau. La lentille `mutation` avait signalé au 9e tour que cette garde
    // n'avait aucun témoin ; elle en a un.
    //
    // 🔴 SA PREMIÈRE VERSION NE MESURAIT RIEN, et c'est pour cela qu'il est écrit ainsi.
    // Elle n'appelait que `--gabarit`. Le binaire refusait alors DEUX fois : à `--pr`, puis à
    // `--sortie` manquante. Mutation posée le 2026-09-06 — la clause `prBrut === null` retirée —
    // le binaire tombait sur la SECONDE, dont la ligne d'usage porte le littéral `[--pr <n>]` :
    // `status` valait 1 et le `stderr` contenait `--pr`. **5/5 VERTS avec la garde neutralisée.**
    // Un témoin dont les deux assertions sont satisfaites par un AUTRE refus ne discrimine rien.
    // On passe donc TOUS les autres arguments — il ne reste qu'une raison de refuser — et on
    // asserte le MOTIF, pas un fragment que la ligne d'usage porte aussi.
    const sortieHorsDepot = join(tmpdir(), `corps-temoin-${process.pid}.md`);
    let code = -1;
    let stderr = '';
    try {
      execFileSync(
        'npx',
        [
          'tsx',
          'scripts/lot/corps-de-pr.ts',
          '--gabarit',
          'docs/pr/31.tpl.md',
          '--sortie',
          sortieHorsDepot,
          '--tests',
          'docs/journal/2026-09.md',
        ],
        { encoding: 'utf8', stdio: 'pipe', shell: true }
      );
      code = 0;
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      code = err.status ?? -1;
      stderr = err.stderr ?? '';
    }
    expect(code, 'le binaire a réussi sans `--pr`').toBe(1);
    expect(stderr, 'le refus ne nomme pas `--pr` comme OBLIGATOIRE').toContain(
      '`--pr <numéro>` est OBLIGATOIRE'
    );
    // CONTRE-TÉMOIN : on a échoué pour LA bonne raison, pas parce qu'il manquait autre chose.
    expect(stderr.includes('usage: pnpm pr:corps'), 'refusé par la ligne d’usage, pas par `--pr`').toBe(
      false
    );
    // Et rien n'a été écrit : un refus qui rend quand même est le mutant du 10e tour.
    expect(existsSync(sortieHorsDepot), 'le binaire a refusé ET écrit la sortie').toBe(false);
  }, 60_000);
});
