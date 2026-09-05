// @req REQ-GOV-032
/**
 * LA TÊTE QUE LA FORGE RAPPORTE PEUT ÊTRE PÉRIMÉE, ET L'ERREUR EST PERMISSIVE.
 *
 * CE QUI A FAIT ÉCRIRE CE FICHIER. Le 2026-09-05, `pnpm pr:corps` a été lancé quelques secondes
 * après un `git push`. La forge rapportait encore la tête PRÉCÉDENTE. Trois verdicts de revue
 * rendus sur elle ont donc été comptés comme COURANTS, et le corps publié annonçait UNE lentille
 * à rejuger quand il y en avait QUATRE.
 *
 * La case ne s'est pas cochée à tort ce jour-là — mais seulement parce qu'une quatrième lentille
 * refusait. Avec quatre accords sur la tête précédente, `caseRevues()` aurait publié
 * « les 4 lentilles ont accepté sur <sha> » en désignant un diff qui n'était plus celui qu'on
 * s'apprêtait à fusionner. C'est le pas 5 du protocole de fusion, contourné par une latence.
 *
 * POURQUOI CE FICHIER EXISTE SÉPARÉMENT. La lentille `mutation` a mesuré au 8e tour que le bloc
 * `if (process.argv[1]?.endsWith('corps-de-pr.ts'))` n'est lancé par AUCUN test : neutraliser une
 * garde qui n'y vit que comme effet laisse la suite entièrement verte. La décision est donc
 * extraite en `tetesConcordent()`, pure et exportée — et le second bloc de ce fichier vérifie sur
 * la SOURCE que le script la consomme réellement, parce que « la couverture du pur ne dit rien de
 * l'impur qui l'alimente » (même lentille, même tour).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tetesConcordent } from '../../../scripts/lot/corps-de-pr';

const SOURCE = readFileSync('scripts/lot/corps-de-pr.ts', 'utf8');

const LOCALE = '7f7806a1b2c3d4e5f60718293a4b5c6d7e8f9012';
const FORGE_PERIMEE = 'e4a56ab0000000000000000000000000000000ff';

describe('REQ-GOV-032 — la tête rapportée par la forge est confrontée à la tête locale', () => {
  it('REQ-GOV-032 — TÉMOIN : deux têtes différentes ne concordent pas', () => {
    // C'est la panne réelle du 2026-09-05, avec ses deux sha.
    expect(tetesConcordent(LOCALE, FORGE_PERIMEE)).toBe(false);
  });

  it('REQ-GOV-032 — CONTRE-TÉMOIN : la même tête concorde', () => {
    expect(tetesConcordent(LOCALE, LOCALE)).toBe(true);
  });

  it('REQ-GOV-032 — CONTRE-TÉMOIN : les espaces de bord ne font pas diverger', () => {
    // `git rev-parse` rend un saut de ligne ; la forge n'en rend pas. Sans le `trim()`, la garde
    // rougirait TOUJOURS — une garde insatisfiable, qu'on retire dans la semaine.
    expect(tetesConcordent(`${LOCALE}\n`, LOCALE)).toBe(true);
  });

  it('REQ-GOV-032 — TÉMOIN : une tête locale VIDE ne concorde avec rien', () => {
    // `execFileSync` peut rendre une chaîne vide si `git` échoue sans lever. Deux chaînes vides
    // sont ÉGALES : sans la clause de longueur, la garde bénirait le cas où l'on ne sait rien.
    expect(tetesConcordent('', '')).toBe(false);
    expect(tetesConcordent('', LOCALE)).toBe(false);
  });

  it('REQ-GOV-032 — le bloc de script CONSOMME la fonction, il ne recompare pas sur place', () => {
    // La couverture du pur ne dit rien de l'impur qui l'alimente : sans cette assertion, on aurait
    // testé une décision que personne ne prend.
    expect(SOURCE).toContain('tetesConcordent(teteLocale, tete)');
    // Et il ne reste pas de comparaison directe qui court-circuiterait la fonction.
    expect(SOURCE.includes('teteLocale !== tete')).toBe(false);
  });

  it('REQ-GOV-032 — le refus NOMME les deux têtes et dit quoi faire', () => {
    // Un refus qui ne dit pas lequel des deux côtés est en retard se fait contourner au jugé.
    expect(SOURCE).toContain("la forge rapporte la tête ${tete.slice(0, 7)}");
    expect(SOURCE).toContain("l'arbre local est ` +");
    expect(SOURCE).toContain('la forge est simplement en retard');
  });
});
