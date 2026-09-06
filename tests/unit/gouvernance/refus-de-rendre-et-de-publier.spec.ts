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
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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

/**
 * UN REFUS QUI N'A PAS DE `process.exit(1)` IMPRIME PUIS CONTINUE.
 *
 * 🔴 LA LEÇON DU 11e TOUR, de la lentille `mutation`, et elle porte au-delà de ce fichier :
 * **une garde qui vérifie qu'un refus est ÉCRIT ne vérifie pas qu'il SORT.** Elle a posé le même
 * mutant — « retire le `process.exit(1)`, garde tout le reste » — sur les QUATRE refus que cette
 * PR introduit. Il mourait sur UN seul : celui pour lequel un témoin avait été écrit à la main.
 * Les trois autres survivaient, suite verte et `tsc` à 0 — dont celui de la surface qui AUTORISE.
 *
 * D'où cette aide : le témoin cesse d'être écrit refus par refus, il est APPLIQUÉ à une liste.
 * ⚠️ Sa limite, écrite plutôt que taue : ajouter un refus SANS l'inscrire dans la liste reste
 * possible, et rien ne le dirait.
 */
function exigerQueLeRefusSORTE(nom: string, source: string, ancre: string): void {
  const bloc = blocApres(source, ancre);
  expect(bloc, `${nom} : le refus imprime mais ne SORT pas — le script continue`).toContain(
    'process.exit(1)'
  );
  expect(bloc.includes('process.exit(0)'), `${nom} : le refus sort en SUCCÈS`).toBe(false);
}

const TRACE = readFileSync('scripts/gates/gov-trace.ts', 'utf8');
const TACHES = readFileSync('scripts/gates/gov-tasks.ts', 'utf8');
const EXIGENCES = readFileSync('scripts/gates/gov-requirements.ts', 'utf8');
const COMPOSEUR = readFileSync('scripts/lot/corps-de-pr.ts', 'utf8');
const ENTITE = readFileSync('scripts/gates/gov-entite.ts', 'utf8');
const ENUMS = readFileSync('scripts/gates/schema-enums.ts', 'utf8');
const GATE = readFileSync('scripts/gates/gov-pr.ts', 'utf8');

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

    // 🔴 ET LA VALEUR AUSSI, PAS SEULEMENT LA CONDITION — survivant S2 de la lentille
    // `mutation` au 11e tour : `controler(univers).filter(() => false)` laisse la condition MOT
    // POUR MOT intacte, donc les deux assertions ci-dessus passent toutes les deux. Mesuré par
    // elle sur une faute réellement injectée : le sain refuse et n'écrit rien, le mutant écrit
    // 26 686 octets à exit 0. **Neutraliser ce qu'une condition LIT vaut neutraliser la
    // condition** — et c'est invisible à un témoin qui ne regarde que la condition.
    // 🔴 ET RIEN NE S'INTERCALE ENTRE LA VALEUR ET SON TEST — survivant M8b de la lentille
    // `mutation` au 12e tour. Ma première version exigeait la PRÉSENCE du littéral
    // `const fautesAvantRendu = controler(univers);`. Elle épinglait donc UNE LIGNE, pas une
    // VALEUR : `fautesAvantRendu.splice(0);` inséré JUSTE APRÈS laisse le littéral intact, les
    // deux assertions ci-dessus passent, **561/561 verts** — et le mutant rend la matrice fautive
    // à exit 0 (effet mesuré par la lentille sur une faute `tache_sans_req` réelle).
    //
    // On exige donc l'ADJACENCE : la déclaration et le test doivent se suivre, aux espaces près.
    // Toute instruction glissée entre les deux — c'est la seule façon de neutraliser la valeur
    // sans toucher à la condition — rompt l'appariement.
    expect(
      /const fautesAvantRendu = controler\(univers\);\s*if \(fautesAvantRendu\.length > 0\) \{/.test(bloc),
      'une instruction s’intercale entre `controler(univers)` et son test : la valeur peut être ' +
        'vidée sans que la condition change'
    ).toBe(true);
  });

  it('REQ-GOV-032 — les DEUX générateurs frères portent le même refus, À LA MÊME STRUCTURE', () => {
    // L'asymétrie entre `gov-requirements.ts` (qui refusait déjà) et `gov-trace.ts` (qui écrivait
    // sans contrôle) est ce qui a permis à la matrice de PROPAGER les fautes pendant des mois.
    //
    // 🔴 SA PREMIÈRE VERSION NE VÉRIFIAIT QU'UNE CHAÎNE PRÉSENTE (`toMatch(/Refus de rendre/)`) —
    // c'est-à-dire exactement la faiblesse que le témoin de `tete-de-pr-concorde.spec.ts` déclare
    // fermer, rouverte trois tests plus bas dans le fichier qui la dénonce. Relève de la lentille
    // `schema` au 11e tour. Un message d'erreur qu'on déplace hors de son `if`, ou un
    // `process.exit(1)` qu'on retire, laissent la chaîne intacte : elle ne prouve RIEN.
    //
    // Les frères sont donc tenus à la même structure que `gov-trace.ts` ci-dessus : le contrôle
    // PRÉCÈDE l'écriture, et le refus SORT en échec.
    for (const [nom, source] of [
      ['gov-tasks.ts', TACHES],
      ['gov-requirements.ts', EXIGENCES],
    ] as const) {
      const bloc = blocApres(source, 'if (fautes.length > 0)');
      expect(bloc, `${nom} : le refus ne nomme pas ce qu'il refuse`).toMatch(/Refus de rendre/);
      expect(bloc, `${nom} : le refus imprime mais ne sort pas en échec`).toContain('process.exit(1)');

      const iControle = source.indexOf('const fautes = controler(');
      const iEcriture = source.indexOf('writeFileSync(CHEMIN_VUE');
      expect(iControle, `${nom} : aucun appel à controler`).toBeGreaterThanOrEqual(0);
      expect(iEcriture, `${nom} : la vue n'est jamais écrite`).toBeGreaterThanOrEqual(0);
      expect(iControle, `${nom} : le contrôle vient APRÈS l'écriture — il ne garde rien`).toBeLessThan(
        iEcriture
      );
    }
  });
});

describe('REQ-GOV-032 — TOUS les refus de cette PR SORTENT, pas seulement celui qu’on a testé', () => {
  const REFUS = [
    ['corps-de-pr.ts — `--pr` obligatoire', COMPOSEUR, 'if (prBrut === null'],
    ['corps-de-pr.ts — concordance des têtes', COMPOSEUR, 'if (!verdictTete.concordent)'],
    ['gov-pr.ts — concordance des têtes (LA SURFACE QUI AUTORISE)', GATE, 'if (!verdictTete.concordent)'],
    ['gov-trace.ts — refus de rendre', TRACE, "if (fautesAvantRendu.length > 0)"],
    ['gov-tasks.ts — refus de rendre', TACHES, 'if (fautes.length > 0)'],
    ['gov-requirements.ts — refus de rendre', EXIGENCES, 'if (fautes.length > 0)'],
    // 🔴 LES SORTIES TERMINALES — celles dont le retrait rend la gate ENTIÈRE verte. La lentille
    // `mutation` en a muté trois au 12e tour, **les trois ont survécu**. La pire :
    // `gov-entite.ts` privée de la sienne accepte un IBAN réel dans un dépôt PUBLIC à exit 0,
    // APRÈS avoir imprimé `[secret_commite]` — elle voit la faute et laisse passer.
    //
    // ⚠️ CE QUE CES TROIS TÉMOINS NE PROUVENT PAS, écrit plutôt que tu : ils portent sur la
    // FORME. Un témoin d'effet exigerait de faire tourner la gate sur une faute réelle, donc
    // d'écrire une coordonnée bancaire dans un fichier suivi d'un dépôt public — ce que cette
    // garde existe précisément pour empêcher — ou d'ouvrir une trappe d'injection dans la gate,
    // c'est-à-dire d'élargir la surface qu'on protège. **Aucune des deux ne se défend.** Ce
    // témoin-ci tue la mutation réelle qui a été posée ; il ne ferme pas la famille.
    ['gov-entite.ts — SORTIE TERMINALE (garde d’argent, dépôt PUBLIC)', ENTITE, 'if (fautes.length > 0)'],
    ['schema-enums.ts — SORTIE TERMINALE', ENUMS, 'if (fautes.length > 0)'],
  ] as const;

  for (const [nom, source, ancre] of REFUS) {
    it(`REQ-GOV-032 — TÉMOIN : le refus « ${nom} » SORT en échec`, () => {
      exigerQueLeRefusSORTE(nom, source, ancre);
    });
  }
});

describe('REQ-GOV-032 — le refus du composeur SORT, il ne se contente pas de le dire', () => {
  it('REQ-GOV-032 — TÉMOIN : `process.exit(1)` est DANS le bloc de concordance des têtes', () => {
    // Le mutant de la lentille : retirer cette seule ligne laisse l'appel, les deux messages et
    // toutes les chaînes que le témoin de forme épingle — et le corps est rendu QUAND MÊME,
    // `DOD_REVUES` calculée contre une tête qui n'est pas celle de l'arbre.
    const bloc = blocApres(COMPOSEUR, 'if (!verdictTete.concordent)');
    expect(bloc, 'le refus imprime mais ne sort pas — le corps serait rendu quand même').toContain(
      'process.exit(1)'
    );
    expect(bloc.includes('process.exit(0)'), 'le refus sort en SUCCÈS').toBe(false);

    // ⚠️ ET LES DEUX APPELANTS CONSOMMENT LA MÊME DÉCISION — pas seulement le même prédicat.
    // La lentille `schema` au 11e tour : le module partagé ne portait que l'égalité d'une ligne,
    // si bien que la lecture de la tête, le message et la sortie restaient dupliqués — et le
    // défaut de la gate insatisfiable n'existait QUE D'UN CÔTÉ. C'est la preuve que ça mord.
    for (const [nom, source] of [
      ['corps-de-pr.ts', COMPOSEUR],
      ['gov-pr.ts', GATE],
    ] as const) {
      expect(source, `${nom} : n'appelle pas la décision partagée`).toContain('jugerLesTetes(');
      expect(
        /tetesConcordent\s*\(/.test(source),
        `${nom} : recompare sur place au lieu de consommer le verdict partagé`
      ).toBe(false);
    }
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

    // 🔴 LE JOURNAL EST UNE ENTRÉE CACHÉE, ET ELLE DÉCIDAIT DE LA COULEUR. Relève de la
    // lentille `mutation` au 11e tour : la première version passait `docs/journal/2026-09.md`,
    // un fichier du dépôt dont le `mtime` n'appartient à personne. Le binaire refuse aussi un
    // journal ANTÉRIEUR au dernier commit — donc, selon l'âge du fichier sur la machine, le
    // mutant tombait sur CE refus-là et non sur celui de `--pr`. **Le témoin rougissait, pour
    // la mauvaise raison, et son verdict dépendait d'un `mtime`.**
    //
    // On écrit donc un journal FRAIS hors dépôt : sa date est postérieure à HEAD par
    // construction, et le refus de `--pr` redevient LE SEUL qui reste. C'est la même règle que
    // pour les arguments : *un témoin d'effet doit rendre la voie qu'il vise la seule ouverte* —
    // y compris contre les entrées qu'il n'avait pas remarqué fournir.
    const journalFrais = join(tmpdir(), `journal-temoin-${process.pid}.txt`);
    writeFileSync(
      journalFrais,
      ` Test Files  31 passed (31)
      Tests  553 passed (553)
`
    );
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
          journalFrais,
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

describe('REQ-GOV-032 — AUCUN `process.exit(1)` n’entre dans cette PR sans être DÉCLARÉ', () => {
  /**
   * 🔴 CE QUI A FAIT ÉCRIRE CE BLOC — et c'est le motif le plus coûteux du 12e tour.
   *
   * La liste des six refus ci-dessus est TAPÉE À LA MAIN. J'avais écrit sa limite dans le fichier
   * — « ajouter un refus sans l'inscrire ici reste possible, et rien ne le dirait » — en croyant
   * qu'une dette écrite était une dette tenue. La lentille `mutation` a mesuré ce que cette phrase
   * coûtait déjà :
   *
   *     la PR ajoute 20 `process.exit(1)` dans ses scripts ; la liste en couvre 6.
   *
   * Les quatorze restants incluent les exits **TERMINAUX** — ceux dont le retrait rend la gate
   * entière verte. Trois ont été mutés, **les trois survivent**. Le plus grave : `gov-entite.ts`
   * privé de son exit terminal **accepte un IBAN réel dans un dépôt PUBLIC, à exit 0**, après
   * avoir imprimé `[secret_commite]`.
   *
   * > **Écrire la limite d'une garde ne la referme pas.** Une liste tapée ne devient pas fiable
   * > parce qu'on a noté qu'elle ne l'était pas — elle devient une dette qu'on a cessé de voir.
   *
   * CE QUE CE BLOC FAIT, ET CE QU'IL NE FAIT PAS. Il ne prouve pas que chaque refus SORT — ça,
   * c'est le rôle des témoins ci-dessus, et ils ne couvrent que les six. Il rend l'**omission
   * BRUYANTE** : le nombre d'exits ajoutés par la PR est DÉRIVÉ du diff, et confronté à ce que le
   * fichier déclare. Ajouter un exit sans l'inscrire ici fait rougir en le NOMMANT. C'est le
   * minimum qu'on doive à un défaut qu'on n'a pas le temps de fermer : le rendre impossible à
   * ajouter en silence.
   */
  const declares: Record<string, { total: number; temoins: number; raison: string }> = {
    'scripts/lot/corps-de-pr.ts': {
      total: 4,
      temoins: 2,
      raison: '`--pr` obligatoire et concordance des têtes ont un témoin ; les deux autres sont ' +
        'des refus d’usage (arguments manquants), sans effet de sécurité.',
    },
    'scripts/gates/gov-pr.ts': {
      total: 2,
      temoins: 1,
      raison: 'la concordance des têtes a un témoin ; le second est le `catch` d’appel à la forge.',
    },
    'scripts/gates/gov-trace.ts': { total: 1, temoins: 1, raison: 'le refus de rendre, témoin + adjacence.' },
    'scripts/gates/gov-tasks.ts': { total: 2, temoins: 1, raison: 'le refus de rendre a un témoin ; 1 non couvert.' },
    'scripts/gates/gov-requirements.ts': { total: 3, temoins: 1, raison: 'le refus de rendre a un témoin ; 2 non couverts.' },
    'scripts/gates/schema-enums.ts': {
      total: 4,
      temoins: 1,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE, mesurée par `mutation` au 12e tour.',
    },
    'scripts/gates/lexique-apporteurs.ts': {
      total: 2,
      temoins: 0,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE.',
    },
    'scripts/gates/gov-entite.ts': {
      total: 1,
      temoins: 1,
      raison:
        '⛔ 🔴 L’EXIT TERMINAL DE LA GARDE D’ARGENT, ET IL N’A AUCUN TÉMOIN D’EFFET. Mesuré par ' +
        '`mutation` : sans lui, un IBAN réel dans `config/entite.json` d’un dépôt PUBLIC passe à ' +
        'exit 0 après impression de `[secret_commite]`. C’est la dette la plus chère de cette PR, ' +
        'elle est écrite ici pour qu’elle soit reprise, pas pour qu’elle soit tolérée.',
    },
  };

  it('REQ-GOV-032 — le compte DÉRIVÉ du diff égale le compte DÉCLARÉ, fichier par fichier', () => {
    // 🔴 ON COMPTE SUR LE DISQUE, PAS DANS LE DIFF COMMITÉ. Ma première version lisait
    // `git diff origin/main...HEAD` — le diff **commité**. Mutant posé : un 21e `process.exit(1)`
    // glissé dans l'arbre de travail, **13/13 VERTS**. *Une garde qui lit l'historique ne voit pas
    // l'état qu'elle garde* : elle aurait rougi en CI, où l'arbre EST le commit, et jamais chez
    // celui qui écrit la ligne — c'est-à-dire au seul moment où elle sert.
    //
    // On compare donc le fichier TEL QU'IL EST au même fichier à `origin/main`.
    const compter = (texte: string) => (texte.match(/process\.exit\(1\)/g) ?? []).length;
    const surMain = (f: string) => {
      try {
        return compter(execFileSync('git', ['show', `origin/main:${f}`], { encoding: 'utf8', maxBuffer: 64e6 }));
      } catch {
        return 0; // fichier neuf : tout ce qu'il porte est ajouté par la PR
      }
    };

    const suivis = execFileSync('git', ['ls-files', 'scripts/'], { encoding: 'utf8' })
      .split(String.fromCharCode(10))
      .filter((f) => f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.js'));

    const ajoutesParFichier = new Map<string, number>();
    for (const f of suivis) {
      const n = compter(readFileSync(f, 'utf8')) - surMain(f);
      if (n > 0) ajoutesParFichier.set(f, n);
    }

    // CONTRÔLE POSITIF : sans lui, un diff vide (mauvaise base, `origin/main` absent) rendrait
    // une map vide, et « rien d’omis » se lirait exactement comme « rien à vérifier ».
    expect(
      ajoutesParFichier.size,
      'aucun `process.exit(1)` ajouté détecté : la dérivation ne mesure rien (base absente ?)'
    ).toBeGreaterThan(0);

    for (const [f, n] of [...ajoutesParFichier].sort()) {
      const d = declares[f];
      expect(d, `${f} ajoute ${n} \`process.exit(1)\` et n’est PAS déclaré ici`).toBeDefined();
      expect(d!.total, `${f} : ${n} exits ajoutés, ${d!.total} déclarés`).toBe(n);
    }
    for (const f of Object.keys(declares)) {
      expect(ajoutesParFichier.has(f), `${f} est déclaré ici mais n’ajoute plus aucun exit`).toBe(true);
    }
  });

  it('REQ-GOV-032 — la dette est CHIFFRÉE, pas seulement mentionnée', () => {
    const total = Object.values(declares).reduce((a, d) => a + d.total, 0);
    const couverts = Object.values(declares).reduce((a, d) => a + d.temoins, 0);
    // Le nombre lui-même n'est pas la garde — la garde est le test ci-dessus. Celui-ci existe
    // pour qu'on ne puisse pas faire baisser la dette en retirant des lignes de la déclaration.
    // ⚠️ 19, pas 20. La lentille `mutation` a compté 20 — c'est le nombre de lignes AJOUTÉES au
    // diff ; le compte NET (disque moins `origin/main`) en donne 19, un exit ayant aussi été
    // RETIRÉ de `gov-tasks.ts`. *Un compteur d'ajouts n'est pas un compteur d'existants.*
    expect(total, 'le total déclaré a changé sans que le test ci-dessus rougisse').toBe(19);
    expect(couverts).toBe(8);
    expect(couverts).toBeLessThan(total);
  });
});
