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
import { tetesConcordent } from '../../../scripts/lot/revues';

/** LES DEUX consommateurs, pas un seul : le composeur DÉCRIT, la garde AUTORISE. */
const COMPOSEUR = readFileSync('scripts/lot/corps-de-pr.ts', 'utf8');
const GARDE = readFileSync('scripts/gates/gov-pr.ts', 'utf8');
const PARTAGE = readFileSync('scripts/lot/revues.ts', 'utf8');

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

  it('REQ-GOV-032 — la fonction vit dans le module PARTAGÉ, pas chez un appelant', () => {
    // Le veto du 10e tour : la garde avait été posée sur le composeur — qui DÉCRIT — et pas sur la
    // gate — qui AUTORISE. Une fonction qui vit chez l'un des deux appelants finit par n'être
    // consommée que par lui.
    expect(PARTAGE).toContain('export function tetesConcordent');
    expect(COMPOSEUR.includes('export function tetesConcordent')).toBe(false);
    expect(GARDE.includes('export function tetesConcordent')).toBe(false);
  });

  it('REQ-GOV-032 — LES DEUX consommateurs la consomment, et aucun ne recompare sur place', () => {
    // ⚠️ C'est CE cas qui garde le veto. Sans lui, la gate pouvait redevenir aveugle pendant que
    // le composeur, lui, restait correct — exactement l'asymétrie mesurée le 2026-09-05.
    // ⚠️ LA CONDITION ENTIÈRE, pas seulement l'appel. Un premier jet cherchait la présence de
    // `tetesConcordent(teteLocaleGate,` : la mutation `if (false && !tetesConcordent(…))` la laisse
    // intacte et le témoin restait VERT. Un témoin de source qui cherche un TEXTE ne prouve pas
    // qu'une garde AGIT — c'est la faiblesse que cette PR passe sa journée à fermer, commise ici.
    const CONDITION_GARDE = /if \(!tetesConcordent\(teteLocaleGate, meta\.headRefOid \?\? ''\)\) \{/;
    const CONDITION_COMPOSEUR = /if \(!tetesConcordent\(teteLocale, tete\)\) \{/;
    expect(CONDITION_GARDE.test(GARDE), 'la condition de la GARDE a été altérée').toBe(true);
    expect(CONDITION_COMPOSEUR.test(COMPOSEUR), 'la condition du COMPOSEUR a été altérée').toBe(true);
    expect(COMPOSEUR.includes('teteLocale !== tete')).toBe(false);
    expect(GARDE.includes('teteLocaleGate !== ')).toBe(false);

    // ⚠️ CE QU'AUCUN TÉMOIN DE SOURCE NE PEUT PROUVER : que l'appel a un EFFET. Une neutralisation
    // plus subtile qu'un `false &&` — un `return` posé avant, une exception avalée — passerait
    // encore. Le seul contrôle qui le verrait est un lancement réel de la garde, et le bloc de
    // script n'est lancé par aucun test (mesuré par la lentille `mutation` au 8e tour). C'est une
    // dette, elle est écrite ici, et elle appartient à la tâche qui couvrira ce bloc.
  });

  it('REQ-GOV-032 — LA GATE lit vraiment la tête locale, elle ne fait pas que la comparer', () => {
    // Mesuré au 10e tour : `gov-pr.ts` ne contenait AUCUN `rev-parse`. Le compter ici empêche que
    // la comparaison survive à la disparition de ce qu'elle compare.
    expect(GARDE).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
  });

  it('REQ-GOV-032 — les deux refus NOMMENT les deux têtes', () => {
    // Un refus qui ne dit pas lequel des deux côtés est en retard se fait contourner au jugé.
    expect(COMPOSEUR).toContain('la forge rapporte la tête');
    expect(GARDE).toContain('la forge rapporte la tête');
    expect(COMPOSEUR).toContain('la forge est simplement en retard');
    expect(GARDE).toContain('la forge est en retard');
  });
});
