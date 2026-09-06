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
import { execFileSync } from 'node:child_process';

/**
 * UNE PR FUSIONNÉE DÉRIVÉE, ET SURTOUT PAS LA DERNIÈRE.
 *
 * 🔴 La version précédente écrivait `= 30`, et la lentille `schema` (12e tour) a mesuré que
 * c'était **la seule PR pour laquelle le proxy tenait** : `origin/main` ÉTAIT son `mergeCommit`.
 * Le témoin **expirait à la fusion de cette PR-ci**, et rien ne l'aurait dit — sur la sortie
 * réelle de `--apres-fusion 29`, ses trois assertions restaient VERTES sur un refus. Il mesurait
 * « les deux modes émettent des textes différents », pas « le pas 8 est satisfiable ».
 *
 * On dérive donc une PR fusionnée dont le `mergeCommit` est **ancêtre de `origin/main` SANS lui
 * être égal** : c'est exactement le cas que l'égalité déclarait à tort non atterri, et il ne
 * cesse jamais d'exister — chaque fusion en fabrique un de plus.
 */
function prFusionneeQuiNEstPasLaTete(): number {
  const tete = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  const brut = execFileSync(
    'gh',
    ['pr', 'list', '--state', 'merged', '--limit', '30', '--json', 'number,mergeCommit'],
    { encoding: 'utf8', maxBuffer: 32e6 }
  );
  const prs = JSON.parse(brut) as { number: number; mergeCommit: { oid: string } | null }[];
  const candidate = prs.find(
    (p) => p.mergeCommit && p.mergeCommit.oid !== tete && estAncetreDe(p.mergeCommit.oid, 'origin/main')
  );
  if (!candidate) throw new Error('aucune PR fusionnée ANTÉRIEURE à la tête : le témoin ne mesurerait rien');
  return candidate.number;
}
import { tetesConcordent, jugerLesTetes, estAncetreDe } from '../../../scripts/lot/revues';

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
    // 🔴 11e TOUR — la lentille `schema` a démontré que PARTAGER LE SEUL PRÉDICAT NE SUFFIT PAS.
    // Le module ne portait que l'égalité d'une ligne ; la lecture de la tête, le choix de ce à quoi
    // on la compare, le message et la sortie restaient DUPLIQUÉS. Preuve que ça mord : la gate
    // insatisfiable de `--apres-fusion` n'existait QUE D'UN CÔTÉ. C'est donc la DÉCISION entière
    // (`jugerLesTetes`) qui est partagée, et ce témoin l'exige des deux côtés.
    const CONDITION_GARDE = /if \(!verdictTete\.concordent\) \{/;
    const CONDITION_COMPOSEUR = /if \(!verdictTete\.concordent\) \{/;
    expect(CONDITION_GARDE.test(GARDE), 'la condition de la GARDE a été altérée').toBe(true);
    expect(CONDITION_COMPOSEUR.test(COMPOSEUR), 'la condition du COMPOSEUR a été altérée').toBe(true);
    expect(GARDE, 'la GARDE ne consomme pas la décision partagée').toContain('jugerLesTetes(');
    expect(COMPOSEUR, 'le COMPOSEUR ne consomme pas la décision partagée').toContain('jugerLesTetes(');
    // Aucun des deux ne recompare sur place : ni par l'opérateur, ni en ré-appelant le prédicat.
    expect(COMPOSEUR.includes('teteLocale !== tete')).toBe(false);
    expect(GARDE.includes('teteLocaleGate !== ')).toBe(false);
    expect(/tetesConcordent\s*\(/.test(COMPOSEUR), 'le COMPOSEUR recompare sur place').toBe(false);
    expect(/tetesConcordent\s*\(/.test(GARDE), 'la GARDE recompare sur place').toBe(false);

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

  it('REQ-GOV-032 — le câblage de l’ancestralité : `estAncetre` est MESURÉ, jamais affirmé', () => {
    // 🔴 Lentille `schema`, 13e tour : `estAncetre: true` reste EXPRIMABLE dans l'appelant, et
    // **aucun témoin d'effet ne peut le tuer** — les cas purs fournissent eux-mêmes le booléen, et
    // le seul lancement réel vise une PR qui A atterri, donc `true` y serait juste par accident.
    // Or ce booléen est **la seule attestation mécanique de l'atterrissage** : la 8e case de DoD
    // ne contrôle que la PRÉSENCE de la coche.
    //
    // ⚠️ CE TÉMOIN PORTE DONC SUR LA SOURCE, ET JE L'ÉCRIS PLUTÔT QUE DE LE TAIRE : il tue
    // l'affirmation en dur, pas une neutralisation plus subtile de `estAncetreDe`. Celle-là est
    // couverte ailleurs — la fonction a ses propres témoins, dont un contrôle positif.
    expect(
      /estAncetre:\s*estAncetreDe\(/.test(GARDE),
      'l’ancestralité est AFFIRMÉE au lieu d’être mesurée : l’atterrissage n’est plus attesté'
    ).toBe(true);
    expect(
      /estAncetre:\s*(true|false)/.test(GARDE),
      'un booléen en dur remplace la mesure d’ancestralité'
    ).toBe(false);
    // Et les opérandes ne sont nommés qu'UNE fois (RM-01) : deux écritures divergent.
    expect((GARDE.match(/meta\.mergeCommit\?\.oid/g) ?? []).length, 'le sha de fusion est retapé').toBe(1);
  });

  it('REQ-GOV-032 — la CI ne câble PAS `--pr` : sinon la garde de tête serait insatisfiable', () => {
    // 🔴 Motif de la lentille `schema` au 11e tour. Le commentaire de `gov-pr.ts` affirme que la
    // garde ne peut pas rougir en CI « parce que le workflow lance `pnpm gov:pr` sans argument ».
    // C'était VRAI et GARDÉ PAR RIEN : `tout-check-est-cable.spec.ts` cherche `pnpm gov:pr --pr`
    // dans `docs/PROTOCOLE-FUSION.md`, jamais dans `ci.yml`. Câbler `--pr` demain rendrait Gate A
    // rouge À VIE — en CI l'arbre est sur `refs/pull/N/merge`, dont le sha ne peut pas coïncider
    // avec `headRefOid` — sans qu'aucun témoin ne le dise. Une propriété dont dépend un
    // commentaire de sécurité doit être gardée, pas seulement vraie.
    const CI = readFileSync('.github/workflows/ci.yml', 'utf8');

    // ⚠️ CONTRÔLE POSITIF D'ABORD : sans lui, ce témoin serait vert le jour où `gov:pr`
    // disparaîtrait de la CI — « aucun `--pr` » et « aucune gate » sont indiscernables.
    expect(CI, '`gov:pr` n’est plus lancé en CI : le témoin ci-dessous ne mesurerait plus rien')
      .toMatch(/run:\s*pnpm gov:pr\s*$/m);

    expect(/pnpm gov:pr\s+--pr/.test(CI), 'la CI câble `--pr` : la garde de tête devient insatisfiable')
      .toBe(false);
    expect(
      /pnpm gov:pr\s+--apres-fusion/.test(CI),
      'la CI câble `--apres-fusion` : elle jugerait un atterrissage qui n’a pas eu lieu'
    ).toBe(false);
  });

  it("REQ-GOV-032 — TÉMOIN D'EFFET : `--apres-fusion` ne compare PLUS la tête de branche", () => {
    // 🔴 LA GATE INSATISFIABLE, mesurée par `schema` au 11e tour et atteinte indépendamment par
    // `securite`. La confrontation vivait dans `prParGh()`, donc elle s'appliquait AUSSI à
    // `--apres-fusion`. Or après `gh pr merge --squash --delete-branch` :
    //     headRefOid  = edc13b8a…  (branche supprimée EN LOCAL ET SUR LA FORGE)
    //     mergeCommit = 794245c5…  (= origin/main)
    // Les deux diffèrent PAR CONSTRUCTION, POUR TOUJOURS. Le pas 8 du protocole était devenu
    // impossible à satisfaire, et son message prescrivait « pousse d'abord » sur une branche qui
    // n'existe plus nulle part. UNE GATE INSATISFIABLE SE FAIT SAUTER.
    //
    // ⚠️ LE COUPLE EST LE TÉMOIN, PAS L'UNE DES DEUX MOITIÉS. Une assertion d'ABSENCE seule ne
    // distingue pas « exempté après fusion » de « garde purement supprimée ». Le contre-témoin
    // ci-dessous lance LE MÊME binaire sur LA MÊME PR, et ne change QUE le drapeau.
    const lancer = (drapeau: string, PR_FUSIONNEE: number) => {
      try {
        execFileSync('npx', ['tsx', 'scripts/gates/gov-pr.ts', drapeau, String(PR_FUSIONNEE)], {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: true,
        });
        return '';
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
    };

    const PR_FUSIONNEE = prFusionneeQuiNEstPasLaTete();
    const apres = lancer('--apres-fusion', PR_FUSIONNEE);
    const avant = lancer('--pr', PR_FUSIONNEE);

    // TÉMOIN : après fusion, la tête de branche n'est plus l'étalon — le pas 8 est satisfiable.
    expect(apres, "`--apres-fusion` compare encore la tête de branche : le pas 8 est insatisfiable")
      .not.toContain('la forge rapporte la tête');
    // CONTRE-TÉMOIN : avant fusion, elle l'est toujours — la garde n'a pas été retirée.
    expect(avant, 'la garde de tête ne tire plus AVANT fusion : elle a été supprimée, pas cadrée')
      .toContain('la forge rapporte la tête');
    // Et les deux sorties diffèrent : sans cela, on ne mesurerait qu'un binaire muet.
    expect(apres === avant, 'les deux modes rendent la MÊME sortie : le drapeau n’a aucun effet')
      .toBe(false);
  }, 120_000);

  it('REQ-GOV-032 — les deux refus NOMMENT les deux têtes', () => {
    // Un refus qui ne dit pas lequel des deux côtés est en retard se fait contourner au jugé.
    // Les deux messages vivent désormais dans `jugerLesTetes()` — c'est le point du partage : un
    // seul texte, donc pas de dérive entre les deux surfaces. On l'exige donc LÀ.
    expect(PARTAGE).toContain('la forge rapporte la tête');
    expect(PARTAGE).toContain('la forge est simplement en retard');
    // Et chaque appelant se NOMME dans le refus, sans quoi on ne sait pas qui a refusé.
    expect(COMPOSEUR).toContain('pr:corps');
    expect(GARDE).toContain('gov:pr');
  });
});

describe('REQ-GOV-032 — après fusion, la propriété est une ANCESTRALITÉ, pas une égalité', () => {
  /**
   * 🔴 CE QUI A FAIT ÉCRIRE CE BLOC. La lentille `schema` au 12e tour : la version précédente
   * jugeait les DEUX moments par une égalité de chaînes. Avant fusion c'est juste. Après fusion,
   * la propriété que le pas 8 atteste est « la fusion a ATTEINT la base » — une ancestralité, dont
   * l'égalité n'est que le cas particulier où rien n'a été fusionné depuis. Mesuré :
   *
   *     PR #29, mergeCommit ab5caf5 : `git merge-base --is-ancestor ab5caf5 origin/main` -> 0
   *     la même PR, par la gate     : « l'atterrissage n'est pas attesté »                -> 1
   *
   * **La PR #29 avait bel et bien atterri, et la gate disait le contraire.** J'avais rendu le
   * pas 8 satisfiable pour la SEULE PR la plus récente, et faux pour toutes les autres à jamais :
   * *la gate insatisfiable n'avait pas disparu, elle avait changé de famille.*
   *
   * 🔴 ET LA BRANCHE D'APRÈS-FUSION N'ÉTAIT EXÉCUTÉE PAR AUCUN TEST — même lentille, même tour :
   * `jugerLesTetes` n'était importée par aucun spec, et le lancement réel passait toujours par la
   * branche concordante. **Le refus n'avait jamais été vu rougir** (RM-02). C'est pour cela que
   * la décision est PURE et que l'ancestralité lui est PASSÉE : les deux branches s'exercent ici
   * sans lancer `git`.
   */

  it('REQ-GOV-032 — TÉMOIN : une base qui a AVANCÉ depuis la fusion CONCORDE quand même', () => {
    // C'EST LE CAS QUI ÉTAIT FAUX. Les deux sha diffèrent — sous l'ancienne égalité, refus.
    const v = jugerLesTetes({
      moment: 'apres-fusion',
      mergeCommit: 'ab5caf54150eaf4a731f5be1e2d23378b72b3f44',
      base: 'origin/main',
      estAncetre: true,
    });
    expect(v.concordent, 'une fusion atterrie est refusée dès que la base a avancé').toBe(true);
    expect(v.message).toEqual([]);
  });

  it('REQ-GOV-032 — CONTRE-TÉMOIN : une fusion qui n’a PAS atteint la base refuse', () => {
    // Sans lui, « concorde toujours » passerait le témoin ci-dessus.
    const v = jugerLesTetes({
      moment: 'apres-fusion',
      mergeCommit: 'ab5caf54150eaf4a731f5be1e2d23378b72b3f44',
      base: 'origin/main',
      estAncetre: false,
    });
    expect(v.concordent).toBe(false);
    expect(v.message.join('\n')).toContain("n'est pas dans");
    // Le message ne doit PAS prescrire un geste impossible : la base peut avoir avancé.
    expect(v.message.join(String.fromCharCode(10))).toContain("seulement qu'elle le CONTIENNE");
  });

  it('REQ-GOV-032 — le sens de défaillance est FERMÉ : aucune fusion rapportée ⇒ refus', () => {
    const v = jugerLesTetes({ moment: 'apres-fusion', mergeCommit: '', base: 'origin/main', estAncetre: true });
    expect(v.concordent, 'une PR sans commit de fusion est déclarée atterrie').toBe(false);
    expect(v.message.join('\n')).toContain('AUCUN commit de fusion');
  });

  it('REQ-GOV-032 — la branche AVANT fusion reste une ÉGALITÉ, elle n’a pas été relâchée', () => {
    const memes = 'a'.repeat(40);
    expect(jugerLesTetes({ moment: 'avant-fusion', teteLocale: memes, teteForge: memes }).concordent).toBe(true);
    const v = jugerLesTetes({ moment: 'avant-fusion', teteLocale: memes, teteForge: 'b'.repeat(40) });
    expect(v.concordent, 'l’égalité d’avant-fusion a été remplacée par autre chose').toBe(false);
    expect(v.message.join('\n')).toContain('la forge rapporte la tête');
  });

  it('REQ-GOV-032 — `estAncetreDe` échoue FERMÉ sur une entrée qui n’est pas un sha', () => {
    // Une mesure qui rend `true` par erreur déclarerait un atterrissage qui n'a pas eu lieu.
    expect(estAncetreDe('', 'origin/main')).toBe(false);
    expect(estAncetreDe('pas-un-sha', 'origin/main')).toBe(false);
    expect(estAncetreDe('f'.repeat(40), 'origin/main'), 'un sha inconnu est déclaré ancêtre').toBe(false);
    // CONTRÔLE POSITIF : sans lui, une fonction qui rend TOUJOURS `false` passerait les trois.
    const tete = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
    expect(estAncetreDe(tete, 'origin/main'), 'la mesure ne sait rendre que `false`').toBe(true);
  });
});
