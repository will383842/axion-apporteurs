/**
 * formes-voisines-des-interdits.spec.ts — GOV-076.
 *
 * @req REQ-QA-001
 * @req REQ-QA-013
 * @req REQ-GOV-029
 *
 * CHAQUE INTERDIT NE JUGEAIT QU'UNE SEULE FORME. Les formes voisines traversaient : un import de
 * module écrit sans son préfixe, un import dynamique, une horloge système atteinte autrement que
 * par son nom usuel, une écriture sur la console atteinte par un autre chemin.
 *
 * CE N'EST PAS UNE DETTE DE STYLE. REQ-QA-001 fait de la PURETÉ de `src/domain/**` la condition du
 * calcul de commission et de l'horloge injectable. Un domaine qui lit l'heure de la machine rend un
 * résultat différent selon le jour où on le rejoue, et c'est un registre d'argent qu'on ne peut
 * plus reconstituer.
 *
 * TÉMOIN À DEUX FACES, ET LES DEUX SE JOUENT :
 *
 *   — un bac d'essai sous `src/domain/` qui atteint l'horloge, le réseau et la console par CHACUNE
 *     des formes voisines fait sortir le linter en code non nul, UNE FOIS PAR FORME, en nommant la
 *     ligne ;
 *   — le code du dépôt le fait sortir en zéro, et le compte des formes RÉELLEMENT exercées est
 *     imprimé — jamais la longueur d'une liste qu'on aurait supposée couverte.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { ESLint } from 'eslint';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FORMES_VOISINES as FORMES_LUES,
  MODULES_INTERDITS_DU_DOMAINE,
  // @ts-expect-error — `eslint.config.mjs` est un module JavaScript sans déclaration de types, et
  // c'est bien LUI qu'il faut lire : retaper la liste des formes ici en ferait une SECONDE source,
  // qui divergerait au premier ajout et laisserait le test vert sur une forme que le linter
  // n'applique plus (RM-01). La forme du module est déclarée ci-dessous, et confrontée.
} from '../../../eslint.config.mjs';
// @ts-expect-error — même raison : le module est lu tel que le linter le lit.
import * as configurationLue from '../../../eslint.config.mjs';

/** Une forme voisine, telle que la configuration la déclare. */
type FormeVoisine = { nom: string; exemple: string; selector: string; message: string };

const FORMES_VOISINES = FORMES_LUES as FormeVoisine[];

/** Le module entier, lu pour ses listes de BASE et la fonction qui en dérive les formes voisines. */
const configuration = configurationLue as {
  formesVoisines: (bases: { reseau: string[]; horloges: string[][] }) => unknown[];
  GLOBAUX_RESEAU_INTERDITS: string[];
  HORLOGES_INTERDITES: string[][];
};

/**
 * Le chemin sous lequel le bac d'essai est JUGÉ. `lintText` applique la configuration du CHEMIN
 * sans écrire un octet : c'est ce qui permet d'éprouver `src/domain/**` sans déposer de fichier
 * fautif dans un arbre qu'une autre session lit.
 */
const SOUS_LE_DOMAINE = 'src/domain/__bac-d-essai-gov-076.ts';

/** Un chemin HORS du domaine : la même ligne doit y rester licite. Le contre-témoin de portée. */
const HORS_DU_DOMAINE = 'src/server/__bac-d-essai-gov-076.ts';

const eslint = new ESLint();

/** Les identifiants de règle qui ont rougi sur ce texte, à ce chemin, avec leur ligne. */
async function regles(
  texte: string,
  chemin: string
): Promise<{ regle: string; ligne: number; message: string }[]> {
  const [r] = await eslint.lintText(`${texte}\n`, { filePath: chemin });
  return (r?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => ({ regle: m.ruleId ?? '(interne)', ligne: m.line, message: m.message }));
}

/** Le dossier du bac d'essai RÉEL, pour la face qui lance le linter en processus. */
const BAC = join('src', 'domain', '__bac-gov-076');

afterAll(() => {
  rmSync(BAC, { recursive: true, force: true });
});

describe('src/domain — chaque interdit juge ses formes voisines (GOV-076)', () => {
  it('REQ-QA-001 — la liste des formes couvertes est IMPRIMÉE, jamais supposée', () => {
    // Elle n'est pas comptée par un total tapé : elle se lit, une ligne par forme.
    for (const f of FORMES_VOISINES) {
      console.log(`   forme couverte — ${f.nom} : ${f.exemple}`);
      expect(f.selector.length, `${f.nom} n’a pas de sélecteur`).toBeGreaterThan(0);
      expect(f.message, `${f.nom} n’a pas de motif`).toContain('src/domain/**');
    }
    // Deux formes ne peuvent pas porter le même nom : la liste serait alors un ensemble plus petit
    // qu'elle n'en a l'air, et le compte des formes exercées mentirait.
    expect(new Set(FORMES_VOISINES.map((f) => f.nom)).size).toBe(FORMES_VOISINES.length);
  });

  it('REQ-QA-013 — CHAQUE forme voisine fait rougir, une fois, en nommant sa ligne', async () => {
    const exercees: string[] = [];
    for (const forme of FORMES_VOISINES) {
      const fautes = await regles(forme.exemple, SOUS_LE_DOMAINE);
      expect(
        fautes.length,
        `la forme « ${forme.nom} » (${forme.exemple}) n’a fait rougir AUCUNE règle sous ` +
          `${SOUS_LE_DOMAINE} : elle traverse`
      ).toBeGreaterThan(0);
      // La ligne est NOMMÉE : un refus qui ne dit pas où ne se corrige pas.
      expect(fautes.every((f) => f.ligne === 1)).toBe(true);
      // ET C'EST LA FORME ELLE-MÊME QUI REFUSE, par son motif. Motif `mutation` (E4) sur 9ffb450 :
      // le sélecteur de `horloge-par-acces-calcule` rendu inerte laissait ce test vert, parce que
      // `no-restricted-properties` rougissait sur le même exemple — « au moins une règle » ne
      // disait pas LAQUELLE. Une forme couverte par une autre n'est pas une forme exercée.
      expect(
        fautes.map((f) => f.message),
        `la forme « ${forme.nom} » (${forme.exemple}) n’a pas été refusée par SON sélecteur`
      ).toContain(forme.message);
      exercees.push(forme.nom);
    }
    // LE COMPTE DES FORMES RÉELLEMENT EXERCÉES, et non la longueur d'une liste déclarée.
    console.log(
      `   ${exercees.length} forme(s) voisine(s) réellement exercée(s) : ${exercees.join(', ')}`
    );
    expect(exercees).toEqual(FORMES_VOISINES.map((f) => f.nom));
  });

  it('REQ-QA-001 — une forme voisine SUIT sa liste de base : un nom ajouté à l’interdit est couvert par son porteur', async () => {
    // 🔴 Motif `simplicite` sur 9ffb450 : les sélecteurs voisins RETAPAIENT `fetch|XMLHttpRequest|
    // WebSocket` et `Date|performance`. Un global ajouté à `no-restricted-globals` (EventSource)
    // aurait été refusé par son nom nu et aurait TRAVERSÉ par `globalThis.EventSource`. Le témoin
    // ajoute un nom à chaque liste de base, dérive les formes, et exige que le porteur rougisse.
    const derive = configuration.formesVoisines;
    expect(typeof derive, 'les formes voisines ne se dérivent pas de leurs listes de base').toBe(
      'function'
    );
    const reseau = [...configuration.GLOBAUX_RESEAU_INTERDITS, 'EventSource'];
    const horloges = [...configuration.HORLOGES_INTERDITES, ['Temporal', 'Now']];
    const formes = derive({ reseau, horloges }) as FormeVoisine[];
    const juge = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        rules: {
          'no-restricted-syntax': [
            'error',
            ...formes.map(({ selector, message }) => ({ selector, message })),
          ],
        },
      },
    });
    for (const ligne of [
      "export const e = new globalThis.EventSource('/flux');",
      'export const t = globalThis.Temporal.Now;',
      "export const t = Temporal['Now'];",
    ]) {
      const [r] = await juge.lintText(`${ligne}\n`, { filePath: 'bac.js' });
      expect(
        (r?.messages ?? []).filter((m) => m.severity === 2).length,
        `« ${ligne} » traverse alors que son nom est dans la liste de base`
      ).toBeGreaterThan(0);
    }
  });

  it('REQ-QA-001 — chaque nom interdit par la configuration RÉELLE est refusé par son porteur', async () => {
    // L'autre sens : pas sur une liste fabriquée, sur ce que le linter applique au domaine.
    const regleDe = (await eslint.calculateConfigForFile(SOUS_LE_DOMAINE)).rules ?? {};
    const globaux = (regleDe['no-restricted-globals'] as { name: string }[]).slice(1);
    const objets = new Set(
      (regleDe['no-restricted-properties'] as { object: string }[]).slice(1).map((p) => p.object)
    );
    expect(globaux.length, 'aucun global réseau interdit : le témoin serait vide').toBeGreaterThan(
      0
    );
    expect(objets.size, 'aucune horloge interdite : le témoin serait vide').toBeGreaterThan(0);
    for (const ligne of [
      ...globaux.map(({ name }) => `export const x = globalThis.${name};`),
      ...[...objets].map((o) => `export const x = globalThis.${o};`),
      ...[...objets].map((o) => `export const x = ${o}['now'];`),
    ]) {
      expect(
        (await regles(ligne, SOUS_LE_DOMAINE)).map((f) => f.regle),
        `« ${ligne} » traverse sous ${SOUS_LE_DOMAINE}`
      ).toContain('no-restricted-syntax');
    }
  });

  it('REQ-QA-001 — une horloge atteinte par une clé VARIABLE est refusée, nommément', async () => {
    // `Date[k]()` : aucune règle de nom n'y voit « now ». Seule la forme par accès calculé la juge.
    const calcule = FORMES_VOISINES.find((f) => f.nom === 'horloge-par-acces-calcule')!;
    const fautes = await regles("const k = 'now';\nexport const t = Date[k]();", SOUS_LE_DOMAINE);
    expect(
      fautes.filter((f) => f.ligne === 2).map((f) => f.message),
      '`Date[k]()` traverse sous le domaine'
    ).toContain(calcule.message);
  });

  it('REQ-QA-001 — un module du cœur importé SANS son préfixe est refusé comme avec', async () => {
    for (const ligne of ["import 'node:fs';", "import 'fs';", "import 'fs/promises';"]) {
      const fautes = await regles(ligne, SOUS_LE_DOMAINE);
      expect(
        fautes.map((f) => f.regle),
        `« ${ligne} » traverse sous ${SOUS_LE_DOMAINE}`
      ).toContain('no-restricted-imports');
    }
    // Les deux écritures sont bien DANS la liste, et la liste ne s'est pas mise à contenir
    // n'importe quoi : elle porte les deux formes de chaque module du cœur.
    expect(MODULES_INTERDITS_DU_DOMAINE).toContain('fs');
    expect(MODULES_INTERDITS_DU_DOMAINE).toContain('node:fs');
  });

  it('REQ-GOV-029 — la portée s’arrête au domaine : les mêmes lignes restent licites ailleurs', async () => {
    // Une garde transposée se juge aussi sur ce qu'elle NE fait PAS. `src/server/**` lit l'heure,
    // le réseau et la base : y refuser ces formes rendrait le dépôt inconstructible.
    const licites = FORMES_VOISINES.filter((f) => !f.nom.startsWith('console'));
    for (const forme of licites) {
      const fautes = await regles(forme.exemple, HORS_DU_DOMAINE);
      expect(
        fautes.map((f) => f.regle),
        `« ${forme.exemple} » est refusée hors du domaine (${HORS_DU_DOMAINE})`
      ).not.toContain('no-restricted-syntax');
    }
  });

  it('REQ-QA-013 — le LINTER lancé en processus sort en code non nul sur le bac d’essai', () => {
    mkdirSync(BAC, { recursive: true });
    const chemin = join(BAC, 'toutes-les-formes.ts');
    writeFileSync(chemin, FORMES_VOISINES.map((f) => f.exemple).join('\n') + '\n', 'utf8');
    const r = spawnSync('npx', ['eslint', chemin.split('\\').join('/')], {
      encoding: 'utf8',
      shell: true,
      timeout: 300_000,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status, `le linter a ACCEPTÉ le bac d’essai :\n${sortie.slice(0, 1200)}`).not.toBe(0);
    // Il nomme des lignes : autant de lignes distinctes que de formes.
    const lignes = new Set([...sortie.matchAll(/^\s*(\d+):\d+\s+error/gm)].map((m) => m[1]));
    expect(
      lignes.size,
      `le linter n’a nommé que ${lignes.size} ligne(s) pour ${FORMES_VOISINES.length} formes :\n` +
        sortie.slice(0, 1200)
    ).toBe(FORMES_VOISINES.length);
    rmSync(BAC, { recursive: true, force: true });
  });

  it('REQ-QA-013 — la SECONDE face : le code du dépôt fait sortir `pnpm lint` en zéro', () => {
    const r = spawnSync('npx', ['eslint', '.', '--max-warnings', '0'], {
      encoding: 'utf8',
      shell: true,
      timeout: 600_000,
    });
    const sortie = (r.stdout ?? '') + (r.stderr ?? '');
    expect(r.status, `le dépôt ne passe pas le linter :\n${sortie.slice(0, 2000)}`).toBe(0);
  });
});
