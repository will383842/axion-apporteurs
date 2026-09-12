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
import { afterAll, describe, it, expect } from 'vitest';
import {
  readFileSync,
  existsSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
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

/**
 * L'énumération du DISQUE, partagée par les deux gardes de ce fichier.
 *
 * Elle était locale à la garde de conservation ; la garde d'adjacence en avait besoin aussi et
 * s'en est passée, avec une liste de fichiers TAPÉE — motif de la lentille `schema` au 19e tour :
 * *l'énumérateur du disque existait déjà dans le même fichier, 270 lignes plus bas.*
 */
function enumererFichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : enumererFichiers(chemin);
    return /\.(ts|mjs|js)$/.test(e.name) ? [chemin] : [];
  });
}



const TRACE = readFileSync('scripts/gates/gov-trace.ts', 'utf8');
const TACHES = readFileSync('scripts/gates/gov-tasks.ts', 'utf8');
const EXIGENCES = readFileSync('scripts/gates/gov-requirements.ts', 'utf8');
const COMPOSEUR = readFileSync('scripts/lot/corps-de-pr.ts', 'utf8');
const ENTITE = readFileSync('scripts/gates/gov-entite.ts', 'utf8');
const ENUMS = readFileSync('scripts/gates/schema-enums.ts', 'utf8');
const LEXIQUE = readFileSync('scripts/gates/lexique-apporteurs.ts', 'utf8');
const GATE = readFileSync('scripts/gates/gov-pr.ts', 'utf8');

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

/**
 * 🔴 UNE SORTIE PEUT ÊTRE PRÉSENTE ET INATTEIGNABLE. Lentille `mutation`, 13e tour : le mutant
 * ne touche pas au refus — il élargit la branche qui le PRÉCÈDE,
 * `if (rapport.fautes.length === 0)` → `if (true)`. Le vert du succès avale tout, la sortie
 * terminale devient inatteignable, **et son texte reste intact** : 573 verts, `tsc` 0.
 *
 * > Un témoin qui cherche une sortie ne dit rien de sa PORTÉE.
 *
 * ⚠️ Ce qu'il ne prouve PAS : il épingle une condition nommée, pas l'atteignabilité en général.
 * Une branche insérée ailleurs passerait. La famille se ferme par un témoin d'EFFET par gate —
 * le dépôt jetable de `gov-entite` en donne le patron, et il reste à le porter aux autres.
 */
const BRANCHES_QUI_COMMANDENT = [
  ['lexique-apporteurs.ts', LEXIQUE, /if \(rapport\.fautes\.length === 0\) \{/],
  // 🔴 LA MÊME FORME, SUR LE MODE `--corps-publie` DE LA GARDE D'ARGENT. Survivante mesurée par
  // `mutation` au 14e tour : `if (verdict.code === 0)` → `if (true)` fait passer
  // `gov:entite --corps-publie` de **2 à 0 en imprimant le ✅**, suite 31/31 verte et `tsc` à 0.
  // C'est le mode qui garde le corps **déjà publié** d'une PR d'un dépôt public.
  //
  // ⚠️ La lentille l'a rendue en TÂCHE, pas en motif — à raison : le gel du périmètre lui interdit
  // d'exiger une garde neuve. Mais **le gel contraint ce qu'une lentille DEMANDE, pas ce qu'on
  // CORRIGE** : ceci n'est pas un mécanisme neuf, c'est l'entrée manquante d'une liste déjà
  // livrée, et elle ferme un trou mesuré dans une garde d'argent.
  ['gov-entite.ts — mode --corps-publie', ENTITE, /if \(verdict\.code === 0\) \{/],
] as const;

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

      // 🔴 ET L'ADJACENCE, QUE CES DEUX-LÀ N'AVAIENT JAMAIS REÇUE. Motif BLOQUANT de la lentille
      // `mutation` au tour de clôture : l'assertion qui ferme cette famille existait pour
      // `gov-trace.ts` depuis le 13e tour, et **les deux frères ne l'ont jamais eue**. Le mutant
      // `fautes.splice(0);` glissé entre la valeur et son test survivait donc ici — 577/577 verts,
      // `tsc` 0, `--prove` 0 — et sur une faute RÉELLE : le sain sort en 1 sans rien écrire, le
      // muté sort en **0** en RÉÉCRIVANT `docs/TASKS.md` / `docs/REQUIREMENTS.md`.
      //
      // > **Une garde écrite pour une famille ne couvre que le membre où on l'a posée.** Ce
      // > témoin s'appelle « les DEUX générateurs frères À LA MÊME STRUCTURE » et il ne vérifiait
      // > pas la même structure : *le nom d'un témoin n'est pas son périmètre.*
      // ➡️ L’adjacence n’est plus jugée par du TEXTE : quatre tours l’ont montrée contournable
      // (la ligne, puis le point-virgule que JavaScript insère seul, puis le ternaire). Elle est
      // remplacée par les TÉMOINS D’EFFET en fin de fichier, pour les DEUX modes — le verdict ET
      // le rendu. ⚠️ Ma première version n’exerçait que le verdict : `schema` et `exactitude` ont
      // mesuré que le mutant du bloc `--render` y redevenait VIVANT. **Il est mort depuis** —
      // l’état « rouge au parent, vert ici » a été périmé par le commit qui le corrigeait, et
      // cette phrase-ci l’a été à son tour. *Une prose qui décrit un état se périme avec lui ;
      // seule celle qui décrit une RÈGLE survit à sa correction.*
    }
  });




});

describe('REQ-GOV-032 — TOUS les refus de cette PR SORTENT, pas seulement celui qu’on a testé', () => {

  for (const [nom, source, ancre] of REFUS) {
    it(`REQ-GOV-032 — TÉMOIN : le refus « ${nom} » SORT en échec`, () => {
      exigerQueLeRefusSORTE(nom, source, ancre);
    });
  }

  for (const [nom, source, condition] of BRANCHES_QUI_COMMANDENT) {
    it(`REQ-GOV-032 — TÉMOIN : la sortie terminale de « ${nom} » reste ATTEIGNABLE`, () => {
      expect(
        condition.test(source),
        `${nom} : la branche de succès a été élargie — la sortie en échec devient inatteignable`
      ).toBe(true);
      expect(/if \(true\)/.test(source), `${nom} : une branche constante avale le chemin d'échec`).toBe(
        false
      );
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
        // 🔑 IL Y A **QUATRE** LANCEURS DANS CE FICHIER, PAS DEUX NI TROIS.
        // Mon commit du 24e tour affirmait « les deux sont couverts ». `mutation` en a compté
        // trois au 25e. En posant le correctif j'ai apparié la PREMIÈRE occurrence d'une chaîne
        // NON UNIQUE, et il a atterri ici — sur le lanceur de `pr:corps` — au lieu du témoin de
        // `--corps-publie` que je visais. **C'est cette erreur qui a révélé le quatrième.**
        // 🔴 *Compter les points d'appel qu'on a corrigés ne dit pas combien il y en a, et
        // apparier une chaîne qui n'est pas unique corrige un endroit qu'on n'a pas choisi.*
        { encoding: 'utf8', stdio: 'pipe', shell: true, env: environnementDeProduction() }
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
   *     la PR ajoutait 20 `process.exit(1)` dans ses scripts ; la liste en couvrait 6.
   *
   * ⚠️ CES DEUX NOMBRES SONT CEUX DU 12e TOUR et ne décrivent plus cette tête — `exactitude` a dû
   * me le dire au 14e. Ils sont conservés **au passé**, parce qu'ils datent le constat ; les valeurs
   * COURANTES ne se tapent nulle part ici, elles se dérivent plus bas (`declares` pour les sorties,
   * `REFUS` pour les témoins). *Un nombre qui date un constat s'écrit au passé ; au présent il
   * devient une affirmation sur l'état courant, et elle périme au commit suivant.*
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
   * c'est le rôle des témoins ci-dessus, et ils n'en couvrent qu'une partie. Il rend l'**omission
   * BRUYANTE** : le nombre d'exits ajoutés par la PR est DÉRIVÉ du diff, et confronté à ce que le
   * fichier déclare. Ajouter un exit sans l'inscrire ici fait rougir en le NOMMANT. C'est le
   * minimum qu'on doive à un défaut qu'on n'a pas le temps de fermer : le rendre impossible à
   * ajouter en silence.
   */
  const declares: Record<string, { total: number; porte: number; temoins: number; raison: string }> = {
    'scripts/gates/gov-check.ts': {
      total: 4,
      porte: 4,
      // ZÉRO, et c'est exact : le compteur `temoins` de ce registre est confronté au tableau
      // `REFUS` de CE fichier. Les témoins de ces quatre refus vivent ailleurs — les compter ici
      // gonflerait une somme qui doit rester égale à sa source. *Un zéro assumé vaut mieux qu'un
      // compteur qu'on gonfle pour se donner raison.*
      temoins: 0,
      raison:
        'GOV-030 — la garde des termes interdits, que six documents invoquaient sans qu’elle ' +
        'existe. Quatre refus : (1) un témoin de `--prove` qui ne rougit plus, (2) un ' +
        'contre-témoin devenu faux positif, (3) une famille déclarée sans témoin, (4) le verdict ' +
        'sur le dépôt. Les trois premiers sont éprouvés par MUTATION dans ' +
        '`termes-interdits.spec.ts` — seuil de la liste d’états porté de 2 à 3, exemption de ' +
        'citation désarmée, périmètre tapé au lieu d’être lu : chacune fait tomber le test qui ' +
        'la nomme (`termes-interdits.spec.ts`). Le quatrième est le refus de la gate elle-même, tenu '+
        'par le contrôle qui la ' +
        'lance sur le dépôt réel. Le REFUS DE PÉRIMÈTRE, lui, n’est pas compté ici : il vient de ' +
        '`fichiersSuivisOuRefus`, et `GARDES_QUI_BALAIENT` le déclare plus bas.',
    },
    // ── RÉCONCILIATION `gov-038` : QUATRE fichiers apportent DIX sorties non nulles ──────────
    // Le cliquet a rougi en NOMMANT le premier (`gov-attestation.ts ajoute 3 … et n'est PAS
    // déclaré ici`) : c'est exactement son office. Les trois gestes sont faits pour chacun —
    // déclarer le refus, dire pourquoi, assumer le total. Les témoins sont déclarés à ZÉRO :
    // c'est une DETTE ÉCRITE, pas une preuve. *Un compteur de témoins qu'on gonfle pour se donner
    // raison vaut moins qu'un zéro assumé.*
    'scripts/gates/gov-attestation.ts': {
      total: 3,
      porte: 3,
      temoins: 0,
      raison:
        'GOV-038 — atteste une livraison faite dans un AUTRE dépôt. Les trois sorties sont des ' +
        "refus d'usage : `--en-ligne` absent, appel `gh` en échec, PR non résolue. Aucune ne " +
        "garde un invariant de sécurité de CE dépôt ; leur témoin viendra avec la tâche qui " +
        'câblera la gate en CI.',
    },
    'scripts/gates/perf-budgets.ts': {
      total: 4,
      porte: 4,
      temoins: 0,
      raison:
        'GOV-019 — budgets de performance. Quatre refus : registre illisible, budget dépassé, ' +
        'mode inconnu, vue divergente. ⚠️ `fichiersDeSrc()` y rend `[]` si `src/` manque — la ' +
        "variante affaiblie du patron que ce lot ferme ailleurs — invisible à la réciproque, au " +
        "témoin `ls-files` et aux trois `describe`, car elle ne balaie pas `git ls-files`. " +
        '⚠️ AUCUNE tâche du backlog ne porte cette dette : `GOV-019` LIVRE `perf-budgets`, elle ne ' +
        "corrige pas son `if (!existsSync(racine)) return []`. Relevé par `mutation` — une dette " +
        'déclarée en prose sans porteur est une dette que personne ne reprendra.',
    },
    'scripts/gates/gov-conventions.ts': {
      total: 2,
      porte: 2,
      temoins: 0,
      raison:
        'GOV-014 — conventions et sélection des gardes. Ce fichier est arrivé de `gov-038` avec ' +
        'le `try/catch { return [] }` que la PR #31 avait fermé pour les cinq autres gardes, ' +
        "SANS entrer en conflit. Converti à `fichiersSuivisOuRefus`. Ses deux sorties sont " +
        'désormais couvertes par les trois témoins de `REQ-CPL-018`, qui le voient parce que ' +
        '`GARDES_QUI_BALAIENT` le DÉCLARE — et une réciproque attrape la garde qu’on oublierait d’y inscrire.',
    },
    'scripts/lot/fichiers-suivis.ts': {
      total: 2,
      porte: 2,
      temoins: 2,
      raison:
        'LE refus qui manquait : `perimetre_illisible`. Il remplace un `try/catch { return [] }` recopié ' +
        'à l’identique dans CINQ gardes, qui rendait `gov:entite` VERTE sur ZÉRO fichier dans un ' +
        'dépôt sans `.git` — avec un IBAN à clé valide en clair dans les sources, dépôt PUBLIC. ' +
        'Témoin : `le périmètre INCONNU fait REFUSER, et le dépôt réel reste vert`. ' +
        '🔧 SECOND refus ajouté au 26e tour, motif de `securite` : `perimetre_entame`. Un fichier ' +
        'SUIVI par git mais absent du disque était sauté par le même `continue` que « hors ' +
        'périmètre par décision » — et la bannière imprimait le MÊME compte avec 171 et 172 ' +
        'fichiers suivis. Témoin : `une garde REFUSE si un fichier SUIVI est introuvable`.',
    },
    'scripts/lot/corps-de-pr.ts': {
      total: 4,
      porte: 4,
      temoins: 2,
      raison: '`--pr` obligatoire et concordance des têtes ont un témoin ; les deux autres sont ' +
        'des refus d’usage (arguments manquants), sans effet de sécurité.',
    },
    'scripts/gates/gov-pr.ts': {
      total: 2,
      porte: 14,
      temoins: 1,
      raison: 'la concordance des têtes a un témoin ; le second est le `catch` d’appel à la forge.',
    },
    'scripts/gates/gov-trace.ts': { total: 1,
      porte: 10, temoins: 1, raison: 'le refus de rendre, témoin + adjacence.' },
    'scripts/gates/gov-tasks.ts': {
      total: 1,
      porte: 11,
      temoins: 1,
      raison:
        'le refus de rendre a un témoin. 🔧 2 → 1 à la réconciliation : le delta se mesure contre '
        + '`origin/main`, et `main` a absorbé une des deux sorties en fusionnant la PR #31. '
        + '*Un delta n’est pas une propriété du fichier : c’est une propriété de la DISTANCE '
        + 'entre lui et sa base, et la base bouge.* GOV-038 y ajoute `pr_nu_hors_depot`.',
    },
    'scripts/gates/gov-requirements.ts': { total: 3,
      porte: 8, temoins: 1, raison: 'le refus de rendre a un témoin ; 2 non couverts.' },
    'scripts/gates/schema-enums.ts': {
      total: 5,
      porte: 5,
      temoins: 1,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE, mesurée par `mutation` au 12e tour.',
    },
    'scripts/gates/lexique-apporteurs.ts': {
      total: 2,
      porte: 2,
      temoins: 0,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE.',
    },
    'scripts/gates/gov-entite.ts': {
      total: 6,
      porte: 6,
      temoins: 3,
      // 🔴 CETTE `raison` A AFFIRMÉ AU PRÉSENT UN CONSTAT DEVENU FAUX — lentille `exactitude`,
      // 15e tour, et elle me retourne ma propre règle. J'écrivais cinquante lignes plus haut que
      // « un nombre qui date un constat s'écrit au passé », et j'ai appliqué la règle aux NOMBRES
      // et pas aux CONSTATS. Elle disait « l'exit terminal n'a AUCUN témoin d'effet » alors que
      // `TEMOINS_D_EFFET` l'énumère, que `temoins: 2` le compte, et que la réconciliation ne
      // boucle QUE grâce à lui.
      //
      // ⚠️ Et la conséquence était pire que l'inexactitude : le registre des dettes nommait
      // comme dette n°1 le chemin **FERMÉ**, et restait MUET sur celui qui reste **OUVERT**.
      // *Une dette déclarée sur le mauvais chemin ne protège rien et rassure sur les deux.*
      raison:
        'Les DEUX chemins de sortie sont FERMÉS, chacun par un témoin d’EFFET. ✅ `gov-entite.ts:2569`, ' +
        'sortie terminale du mode à plat : dépôt jetable dans `tmpdir()`. ✅ `gov-entite.ts:2549`, ' +
        '`process.exit(verdict.code)`, sortie terminale de `--corps-publie` — le mode qui garde le ' +
        'corps DÉJÀ PUBLIÉ d’une PR d’un dépôt PUBLIC : PR inexistante, `exit 2` exigé. Les deux ' +
        'mutations ont été reposées et rougissent. ⚠️ Ce champ a porté un ⛔ OUVERT sur le second ' +
        'APRÈS sa fermeture, démenti trois propositions plus loin par un ✅ : dans ce fichier le ⛔ ' +
        'est le marqueur qui distingue une dette d’un constat, et un ⛔ qu’on découvre faux apprend ' +
        'au lecteur qu’il ne veut rien dire. Relevé par `exactitude` au tour de clôture — c’est la ' +
        'règle écrite cinquante lignes plus haut, appliquée au verdict et pas à sa JUSTIFICATION. ' +
        '🖪 Le coût de ces deux témoins n’est pas le même : l’atteignabilité rougit vite et HORS ' +
        'LIGNE, l’effet appelle la forge. Ce n’est pas un argument de couverture — voir plus bas. ' +
        '⚠️ Il a fallu deux gardes, parce que l’atteignabilité ne ' +
        'suffit pas : la lentille `mutation` a mesuré au 15e tour qu’on neutralise la VALEUR sans ' +
        'toucher à la condition — `(verdict as {code:number}).code = 0` inséré, aucun `if (true)`, ' +
        '577/577 verts — et `--corps-publie` d’une PR INEXISTANTE passe alors de `exit 2 ' +
        '[lecture_impossible]` à `exit 0 ✅ aucune coordonnée` : UN CORPS JAMAIS LU DÉCLARÉ PROPRE, ' +
        'dans un dépôt public. ✅ REMÈDE DÉJÀ CONNU, et il ne coûte NI IBAN NI RÉSEAU : un numéro de ' +
        'PR inexistant donne `lecture.lu === false` → code 2, qui traverse le même `if` et tue les ' +
        'trois variantes d’un coup. ✅ C’est fait : le témoin lance le binaire, exige `exit 2` ET ' +
        '`lecture_impossible`, et interdit la phrase « aucune coordonnée bancaire ». Mutant reposé : ' +
        'ROUGE. 🔴 ET LA MAXIME QUE J’AVAIS TIRÉE DE LÀ ÉTAIT FAUSSE : j’écrivais « une sortie ' +
        'terminale se garde par sa PORTÉE et par son EFFET, l’une sans l’autre laisse une moitié ' +
        'ouverte ». `schema` et `exactitude` l’ont réfutée SÉPARÉMENT au tour de clôture : sous ' +
        '`if (true)`, le ✅ s’imprime puis `process.exit(0)`, et le témoin d’EFFET tombe AUSSI — il ' +
        'tue les DEUX mutants. **L’effet subsume l’atteignabilité ; il n’y a pas de moitié ouverte.** ' +
        'Ce qui reste vrai est un argument de COÛT (l’un rougit hors ligne, l’autre appelle la ' +
        'forge), pas de couverture. *Redondance ≠ trou — et une maxime fausse devient une doctrine, ' +
        'qu’on ne remesure jamais.*',
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
    // 🔴 ET ON COMPTE TOUTES LES SORTIES NON NULLES, PAS UNE ORTHOGRAPHE. Motif BLOQUANT de
    // la lentille `schema` au 13e tour : la version précédente ne cherchait que le littéral
    // `process.exit(1)` et manquait **six** sorties, dont la plus chère —
    // `gov-entite.ts` : `process.exit(verdict.code)`, sortie TERMINALE de
    // `gov:entite --corps-publie`, déclarée BLOQUANTE en Gate A. Mutée en `exit(0)`, la gate
    // imprime `[coordonnee_en_clair]` sur un IBAN d'un corps publié en dépôt PUBLIC **et sort 0**,
    // sans qu'aucun compteur ne bouge. *Un compteur qui cherche une orthographe ne compte pas une
    // famille* — et c'est la deuxième fois que l'EXTENSION de cette garde est trop étroite.
    const SORTIE_NON_NULLE = /process\.exit\(\s*(?!0\s*\))/g;
    const compter = (texte: string) => (texte.match(SORTIE_NON_NULLE) ?? []).length;
    const surMain = (f: string) => {
      try {
        return compter(execFileSync('git', ['show', `origin/main:${f}`], { encoding: 'utf8', maxBuffer: 64e6 }));
      } catch {
        return 0; // fichier neuf : tout ce qu'il porte est ajouté par la PR
      }
    };

    // 🔴 ON ÉNUMÈRE LE DISQUE, PAS L'INDEX. Lentille `mutation`, 13e tour : la version
    // précédente listait par `git ls-files`, **qui lit l'INDEX**. Un script NEUF et NON SUIVI
    // portant un `process.exit(1)` était donc invisible — 15/15 verts. *C'est mon propre motif
    // « une garde qui lit l'historique ne voit pas l'état qu'elle garde », d'un cran : j'avais
    // corrigé la LECTURE des fichiers et laissé leur ÉNUMÉRATION dans l'index.* Et le dépôt le
    // disait déjà, dans le fichier même que la mutation neutralisait : « Seuls les fichiers
    // SUIVIS par git sont lus. »
    const enumerer = enumererFichiers;
    const suivis = enumerer('scripts');

    const ajoutesParFichier = new Map<string, number>();
    for (const f of suivis) {
      const n = compter(readFileSync(f, 'utf8')) - surMain(f);
      if (n > 0) ajoutesParFichier.set(f, n);
    }

    // 🔴 APRÈS LA FUSION, CETTE PROPRIÉTÉ CHANGE DE NATURE — trouvé par la revue de complétude
    // au 27e tour, et MESURÉ. Ce test compare le DISQUE à `origin/main`. Le jour où ce lot
    // atterrit, les deux deviennent ÉGAUX : tous les deltas valent 0, la map est vide, et le
    // contrôle positif ci-dessous — écrit pour détecter une base ABSENTE — se déclencherait sur
    // une fusion RÉUSSIE :
    //
    //     origin/main = 794245c, HEAD = 4304add  ->  ajoutesParFichier.size = 9   (vert)
    //     origin/main = HEAD                     ->  size = 0, « expected 0 to be greater than 0 »
    //
    // `ci.yml` déclenche Gate A sur `push: {branches:[main]}` avec `fetch-depth: 0` : `origin/main`
    // EST disponible en CI, donc `pnpm test` serait ROUGE dès le push de fusion, et le resterait
    // pour toutes les PR suivantes. Le fichier est neuf : la régression serait de CE lot.
    //
    // 🔑 *Le dépôt connaissait déjà ce piège — « après fusion, la propriété est une ANCESTRALITÉ ».
    // Une garde qui compare au diff doit dire ce qu'elle devient quand le diff est vide, sinon
    // c'est son propre succès qui la fait rougir.*
    // 🔑 LA QUESTION QUE LE CONTRÔLE POSITIF VOULAIT POSER EST « LA BASE EST-ELLE LISIBLE ? »,
    // pas « le diff est-il non vide ». Les deux coïncidaient tant que le lot n'avait pas atterri.
    //
    // Première tentative (27e tour) : une garde d'ancestralité `HEAD ⊆ origin/main`. `mutation`
    // l'a mise en défaut au 28e — elle n'est vraie que sur `main` LUI-MÊME. Sur la branche
    // SUIVANTE (`origin/main` = ce lot fusionné, `HEAD` = un commit fille), le diff est vide
    // aussi et la condition vaut FAUX : le rouge revenait mot pour mot, sur toutes les PR d'après
    // qui n'ajoutent aucune sortie non nulle — c'est-à-dire la quasi-totalité.
    // *La maxime était juste et je ne l'avais appliquée qu'à UNE des deux façons de se vider.*
    const baseLisible = (() => {
      try {
        execFileSync('git', ['rev-parse', '--verify', 'origin/main'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();

    // LE contrôle positif, dans sa forme exacte : sans base, la dérivation ne mesure rien, et
    // « rien d'omis » se lirait comme « rien à vérifier ».
    expect(
      baseLisible,
      '`origin/main` est introuvable : la dérivation ne mesure RIEN, et son silence ne prouve rien'
    ).toBe(true);


    // La cardinalité vaut dans LES DEUX régimes — diff plein ou diff vide — donc elle est hissée
    // hors de toute branche. `simplicite` a relevé qu'une première rédaction la portait dans un
    // `if (size === 0)` dont la boucle était le DOUBLON VERBATIM de celle qui suit.
    // *Deux copies d'une assertion ne la rendent pas plus vraie : elles rendent l'une des deux
    // invérifiable.*
    expect(
      Object.keys(declares).length,
      'le registre `declares` est VIDE : on ne peut pas faire baisser la dette en la supprimant'
    ).toBeGreaterThan(0);

    for (const [f, n] of [...ajoutesParFichier].sort()) {
      const d = declares[f];
      expect(d, `${f} ajoute ${n} \`process.exit(1)\` et n’est PAS déclaré ici`).toBeDefined();
      expect(d!.total, `${f} : ${n} exits ajoutés, ${d!.total} déclarés`).toBe(n);
    }
    // 🔴 UN FICHIER DÉCLARÉ QUI N'AJOUTE PLUS RIEN A ATTERRI — ce n'est pas une omission.
    // Mesuré à la réconciliation de `gov-038` : `main` ayant absorbé les PR #31 et #32, les NEUF
    // entrées qu'elles avaient déclarées sont passées à un delta de ZÉRO d'un coup. Les faire
    // rougir obligerait à VIDER le registre à chaque atterrissage — c'est-à-dire à détruire, tous
    // les deux lots, le dispositif que vingt-six tours de revue ont construit.
    // *Le registre des refus n'est pas un journal du diff courant : c'est la dette du dépôt.*
    // Ce qui reste vrai, et qu'on assert : le fichier EXISTE encore, et il porte AU MOINS ce
    // qu'il déclare. Un refus retiré en douce, ou un fichier supprimé, rougit toujours ici.
    for (const f of Object.keys(declares)) {
      if (ajoutesParFichier.has(f)) continue; // déjà confronté au diff, ci-dessus
      expect(existsSync(f), `${f} est déclaré au registre des refus mais n’existe plus`).toBe(true);
      // Le plancher est le compte ABSOLU déclaré (`porte`). Ni un delta — il ne garde rien une fois
      // la PR atterrie — ni la base : elle rend ZÉRO pour un fichier neuf, et trois des quatre
      // fichiers de ce lot le sont. Mesuré : les dix sorties que la PR déclare ajouter,
      // neutralisées, laissaient les deux tests VERTS.
      // 🔑 *Un plancher calé sur la base ne peut pas, par construction, garder ce que la PR ajoute.*
      expect(
        compter(readFileSync(f, 'utf8')),
        `${f} porte moins de ${declares[f]!.porte} sortie(s) non nulle(s) : un refus a été retiré`
      ).toBeGreaterThanOrEqual(declares[f]!.porte);
    }
  });

  it('REQ-GOV-032 — la dette est CHIFFRÉE, pas seulement mentionnée', () => {
    const total = Object.values(declares).reduce((a, d) => a + d.total, 0);
    // 🔴 DÉRIVÉ DE `REFUS`, PAS TAPÉ — lentille `schema`, 13e tour : la version précédente
    // sommait des `temoins` tapés et les confrontait à un littéral, jamais au tableau `REFUS` qui
    // est l'AUTRE source du même fait. Retirer une entrée de `REFUS` faisait disparaître un `it()`
    // **en silence** et laissait la dette annoncée inchangée. *Deux sources du même fait qu'aucune
    // garde ne confronte finissent par diverger.*
    // ⚠️ Le « + 1 » précédent était un LITTÉRAL, sous un commentaire qui affirmait « aucun
    // littéral ici ». Relevé par `schema` au 14e tour. *Un commentaire qui dément la ligne qu'il
    // surmonte est pire qu'aucun commentaire : il fait lire ce qui n'est pas écrit.*
    // Le témoin d'EFFET de la garde d'argent (dépôt jetable) ne vit pas dans `REFUS` — il est
    // d'une autre nature. Il est donc ÉNUMÉRÉ, pas compté à la main.
    const TEMOINS_D_EFFET = [
      'gov-entite.ts — SORTIE TERMINALE du mode à plat, par dépôt jetable',
      'gov-entite.ts — SORTIE TERMINALE de --corps-publie, par PR inexistante',
      'fichiers-suivis.ts — REFUS perimetre_illisible : le périmètre INCONNU fait sortir en échec, et le dépôt réel reste vert (contre-témoin)',
      'fichiers-suivis.ts — REFUS perimetre_entame : un fichier SUIVI introuvable sur le disque fait sortir en échec, et le dépôt réel reste vert (contre-témoin)',
    ] as const;
    const couverts = REFUS.length + TEMOINS_D_EFFET.length;
    const temoinsDeclares = Object.values(declares).reduce((a, d) => a + d.temoins, 0);
    expect(temoinsDeclares, 'la somme des `temoins` déclarés a divergé du tableau `REFUS`').toBe(
      couverts
    );
    // Le nombre lui-même n'est pas la garde — la garde est le test ci-dessus. Celui-ci existe
    // pour qu'on ne puisse pas faire baisser la dette en retirant des lignes de la déclaration.
    // ⚠️ CE NOMBRE EST UNE SOMME DE DELTAS POSITIFS, PAS UN NET — et c'est la lentille
    // `exactitude` qui a dû me le dire au 13e tour, après que je l'ai appelé « NET » deux fois.
    // La boucle ci-dessus filtre `n > 0` : elle ne voit que les fichiers qui en GAGNENT. Sur les
    // sorties non nulles : deltas positifs **25**, deltas négatifs **−2** (`gov-identifiants.ts`),
    // donc net réel **23**. Les trois nombres disent des choses différentes, et c'est bien 25 qu'il
    // faut ici — ce qu'on déclare, ce sont les sorties AJOUTÉES qu'il faut couvrir, pas un solde.
    // *Nommer un compteur par ce qu'il n'est pas coûte plus cher qu'un compteur faux : celui-ci
    // était juste, et son NOM le rendait invérifiable.*
    // 🔧 25 → 26 au 24e tour, ARBITRÉ et non subi : `scripts/lot/fichiers-suivis.ts` ajoute LE
    // refus qui manquait (`perimetre_illisible`). Ce cliquet a rougi pour ça — c'est exactement son
    // office : le total ne bouge pas sans qu'on l'écrive. La sortie ajoutée est couverte par un
    // témoin d'effet à DEUX faces (périmètre inconnu → refus ; dépôt réel → vert).
    // 🔧 26 → 27 au 26e tour, ARBITRÉ et non subi : `fichiers-suivis.ts` ajoute le SECOND refus
    // qui manquait (`perimetre_entame`). Ce cliquet a rougi pour ça, en NOMMANT le fichier et
    // l'écart (« 2 exits ajoutés, 1 déclarés ») — c'est exactement son office. La sortie ajoutée
    // est couverte par un témoin d'effet à deux faces (fichier suivi manquant → refus ; dépôt
    // réel → vert).
    // 🔧 27 → 35 à la RÉCONCILIATION de `gov-038`, ARBITRÉ et non subi. Dix sorties entrent avec
    // quatre fichiers (`gov-attestation` +3, `perf-budgets` +4, `gov-conventions` +2,
    // `gov-tasks` +1). Le cliquet a rougi en nommant le premier — il n'a pas été contourné, il a
    // été LU. ⚠️ Le seuil est GLOBAL : il somme tout ce qui atterrit, jamais le sommet d'une
    // branche. Mesuré sur l'arbre réconcilié : 179 sorties non nulles sous `scripts/`.
    // 🔧 35 → 39 par GOV-030, ARBITRÉ et non subi. `scripts/gates/gov-check.ts` naît avec quatre
    // sorties — la garde des termes interdits que `docs/gates.json` déclarait depuis GOV-000 sans
    // qu'aucun script n'existe. Le cliquet a rougi en la nommant (« ajoute 4 `process.exit(1)` et
    // n'est PAS déclaré ici »), puis une seconde fois sur le compte des témoins : les deux fois il
    // a été LU, pas contourné. Trois de ces refus sont éprouvés par MUTATION dans
    // `termes-interdits.spec.ts` ; le quatrième — le verdict sur le dépôt — par le contrôle qui
    // lance la gate sur l'arbre réel.
    expect(total, 'le total déclaré a changé sans que le test ci-dessus rougisse').toBe(39);
    // ⚠️ AUCUN LITTÉRAL ICI : `couverts` est DÉRIVÉ de `REFUS`, et le confronter à un nombre
    // tapé remettrait exactement la faute que ce bloc vient de fermer. La seule confrontation
    // qui vaut est celle du DÉCLARÉ au DÉRIVÉ, faite juste au-dessus.
    expect(couverts).toBeLessThan(total);
  });
});

describe('REQ-CPL-018 — la garde d’ARGENT sort en échec : témoin d’EFFET, dépôt jetable', () => {
  /**
   * 🔴 CE QUI A FAIT ÉCRIRE CE BLOC, ET LA CORRECTION D'UNE AFFIRMATION DE MOI.
   *
   * La lentille `mutation` a mesuré au 12e tour que la sortie TERMINALE de `gov-entite.ts` n'avait
   * aucun témoin : retirée, la garde imprime `[secret_commite]` sur un IBAN réel dans un dépôt
   * **PUBLIC** et sort **0**. J'ai répondu par un témoin de FORME, en écrivant qu'un témoin d'effet
   * ne se défendait pas — il aurait fallu, disais-je, soit écrire une coordonnée réelle dans un
   * fichier suivi de ce dépôt public, soit ouvrir une trappe d'injection dans la gate.
   *
   * **C'était faux, et c'est la lentille `securite` qui a donné la troisième voie** (13e tour) :
   * un **dépôt JETABLE** dans `tmpdir()`. Ni coordonnée réelle, ni trappe. La gate lit
   * `config/entite.json` par un chemin RELATIF et énumère les fichiers par `git ls-files` : il
   * suffit de la lancer avec un autre `cwd`.
   *
   * > *J'avais déclaré une dette infermable au lieu de chercher une troisième voie. « Aucune des
   * > deux ne se défend » était vrai des deux voies que j'avais vues, et je l'ai écrit comme s'il
   * > était vrai de toutes.*
   *
   * ⚠️ AUCUN IBAN LITTÉRAL DANS CE FICHIER. La valeur est CONSTRUITE à l'exécution, clé mod-97
   * calculée : un littéral à clé valide ferait rougir `gov:entite` sur ce dépôt-ci — la garde
   * attraperait son propre témoin, ce qui est déjà arrivé au 7e tour.
   */

  /** Clé mod-97 (ISO 13616) d'un BBAN français fabriqué. Aucun compte n'existe derrière. */
  const ibanFabrique = (bban: string): string => {
    const corps = `${bban}FR00`;
    const numerique = [...corps]
      .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)))
      .join('');
    let reste = 0;
    for (const chiffre of numerique) reste = (reste * 10 + Number(chiffre)) % 97;
    const cle = String(98 - reste).padStart(2, '0');
    return `FR${cle}${bban}`;
  };

  const lancerLaGarde = (cwd: string) => {
    try {
      const stdout = execFileSync('npx', ['tsx', resolve('scripts/gates/gov-entite.ts')], {
        cwd,
        encoding: 'utf8',
        env: environnementDeProduction(),
        stdio: 'pipe',
        shell: true,
      });
      return { code: 0, sortie: stdout };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };

  it('REQ-CPL-018 — la garde SORT en échec sur une coordonnée, et 0 sans elle', () => {
    const depot = mkdtempSync(join(tmpdir(), 'temoin-entite-'));
    execFileSync('git', ['init', '-q'], { cwd: depot });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: depot });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: depot });

    // Le registre RÉEL de ce dépôt : il ne porte que la sentinelle, la garde y est verte.
    // Les trois sources que la garde lit par chemin RELATIF. Elles ne portent que la sentinelle :
    // la garde est verte dessus ici, elle doit l'être là-bas. ⚠️ La liste a été trouvée par le
    // CONTRÔLE POSITIF, qui a rougi sur `docs/DECISIONS.md` manquant — c'est exactement ce pour
    // quoi il existe : sans lui j'aurais lu un non-zéro dû à un fichier absent comme « la garde a
    // vu la coordonnée ».
    for (const f of ['config/entite.json', 'docs/DECISIONS.md', 'docs/REQUIREMENTS.md']) {
      mkdirSync(join(depot, dirname(f)), { recursive: true });
      writeFileSync(join(depot, f), readFileSync(f, 'utf8'));
    }
    execFileSync('git', ['add', '-A'], { cwd: depot });

    // ── CONTRÔLE POSITIF, ET IL EST INDISPENSABLE ────────────────────────────────────────────
    // Sans lui, un harnais qui échoue pour n'importe quelle raison (chemin, `tsx` absent, registre
    // incomplet) rendrait un non-zéro que je lirais comme « la garde a vu la coordonnée ».
    const propre = lancerLaGarde(depot);
    expect(propre.code, `le dépôt jetable SANS coordonnée ne rend pas 0 :\n${propre.sortie}`).toBe(0);

    // ── LE TÉMOIN ────────────────────────────────────────────────────────────────────────────
    const iban = ibanFabrique('30006000011234567890189');
    writeFileSync(join(depot, 'preuve.md'), `Coordonnée fabriquée pour ce témoin : ${iban}\n`);
    execFileSync('git', ['add', '-A'], { cwd: depot });

    const fautif = lancerLaGarde(depot);
    expect(
      fautif.code,
      `la garde d’ARGENT a vu la coordonnée et n’est PAS sortie en échec — dépôt PUBLIC :\n${fautif.sortie}`
    ).not.toBe(0);
    // Et elle sort pour LA bonne raison : un non-zéro d'une autre famille ne prouverait rien.
    expect(fautif.sortie).toMatch(/coordonnee_en_clair|secret_commite/);

    rmSync(depot, { recursive: true, force: true }); // on ne supprime que ce qu'on a créé
  }, 180_000);
});

describe('REQ-CPL-018 — `--corps-publie` : le verdict SORT, il ne se contente pas d’être calculé', () => {
  /**
   * 🔴 CE QUI A FAIT ÉCRIRE CE TÉMOIN, ET LA DÉCISION QUI L'A EMPORTÉ.
   *
   * La lentille `mutation` a mesuré au 15e tour la variante que l'épinglage d'atteignabilité ne
   * voit pas : on neutralise la **VALEUR**, sans toucher à la condition ni écrire un `if (true)` —
   *
   *     (verdict as { code: number }).code = 0;   // inséré ; 577/577 verts, `tsc` 0
   *
   * — et `gov:entite --corps-publie <PR inexistante>` passe de `exit 2 [lecture_impossible]` à
   * `exit 0 ✅ aucune coordonnée bancaire`. **Un corps JAMAIS LU, déclaré propre, dans un dépôt
   * PUBLIC.** C'est le mode qui garde le corps *déjà publié* d'une PR.
   *
   * ⚖️ LA DÉCISION, ET LES DEUX AVIS QUI LA CADRENT. La lentille `securite` a jugé au 16e tour que
   * c'était une **dette** et non un trou de substance, et son argument tient : `lu: false → 2` est
   * épinglé de façon exhaustive côté décision pure, et *la couverture de mutation borne le coût
   * d'une régression accidentelle future — elle ne fait pas partie de la frontière de confiance
   * face à un adversaire déjà à l'intérieur*. Mais elle ajoute que le laisser ouvert deux lots de
   * plus en ferait un défaut à part entière, et que le remède est **priorité 1**.
   * Will a tranché de son côté : **on ferme avant de fusionner**, parce que le gel visait les
   * imprécisions de rédaction, pas une garde qui **affirme le contraire de la vérité quand elle
   * échoue**. Les deux convergent, on ferme une fois.
   *
   * 🔑 ET POURQUOI C'EST UN TÉMOIN D'EFFET ET PAS UN ÉPINGLAGE DE PLUS. Mon propre argument
   * m'a été retourné : *l'ajouter sans témoin d'effet refabriquerait exactement le défaut qu'il
   * prétend fermer.* Celui-ci lance le binaire pour de vrai. Il ne coûte **ni IBAN ni dépôt
   * jetable** : un numéro de PR inexistant suffit à rendre `lecture.lu === false`.
   *
   * ⚠️ J'AI FAILLI L'ÉCRIRE SUR UNE FAUSSE PRÉMISSE. J'avais lu que `--corps-publie 999999`
   * sortait en 2 **avant** d'atteindre ce bloc — donc que le témoin n'exercerait rien. Faux : le
   * refus précoce ne vise qu'un argument MALFORMÉ ; un numéro bien formé mais inexistant traverse
   * la lecture, échoue, et atteint la sortie visée. *Lire le flux plutôt que de déduire d'un
   * numéro de ligne* — sans quoi ce témoin aurait été vert pour la mauvaise raison, ce que ce
   * fichier passe sa vie à dénoncer.
   */
  it('REQ-CPL-018 — TÉMOIN D’EFFET : un corps NON LU sort en 2, il n’est jamais déclaré propre', () => {
    const PR_INEXISTANTE = 999999;
    let code = -1;
    let sortie = '';
    try {
      execFileSync(
        'npx',
        ['tsx', 'scripts/gates/gov-entite.ts', '--corps-publie', String(PR_INEXISTANTE)],
        // 🔴 LE LANCEUR DE `--corps-publie` — mode déclaré BLOQUANT en CI, fermé sur décision de
        // Will avant fusion. Il n'avait AUCUNE option `env`. Mutant de `mutation` au 25e tour :
        // `if (!process.env.VITEST) verdict.code = 0` -> **606/606 VERTS**, et
        // `pnpm gov:entite --corps-publie 999999` imprime « ✅ … aucune coordonnée bancaire »,
        // **exit 0, sur un corps JAMAIS LU, dépôt PUBLIC**.
        { encoding: 'utf8', stdio: 'pipe', shell: true, env: environnementDeProduction() }
      );
      code = 0;
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? -1;
      sortie = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    // Le verdict CALCULÉ doit devenir un code de SORTIE. C'est la couture, et c'est elle qu'un
    // `(verdict).code = 0` neutralise sans toucher à une seule condition.
    expect(code, 'un corps NON LU est sorti autrement qu’en 2 — le verdict ne sort pas').toBe(2);

    // Et il sort pour LA bonne raison : un 2 d'une autre famille ne prouverait rien.
    expect(sortie).toContain('lecture_impossible');

    // CONTRE-TÉMOIN : la garde ne doit surtout PAS déclarer propre ce qu'elle n'a pas lu.
    expect(
      sortie.includes('aucune coordonnée bancaire'),
      'un corps JAMAIS LU est déclaré propre — dépôt PUBLIC'
    ).toBe(false);
  }, 120_000);
});


/**
 * 🔴 LA FAMILLE NE SE FERME PAS PAR DU TEXTE. On lance le programme.
 *
 * ## Quatre tours, quatre fois le même défaut d'un cran plus bas
 *
 * ```
 * 18e  « le test suit-il la LIGNE du calcul ? »          battu par : tout sur UNE ligne
 * 19e  « l'INSTRUCTION precedente est-elle le calcul ? »  battu par : pas de point-virgule (ASI)
 * 20e  « l'INTERVALLE est-il vide ? »                     aurait ete battu par : le ternaire,
 *                                                         le recrutement par NOM, la forme
 *                                                         inline, la branche composition
 * ```
 *
 * À chaque tour j'ai fermé le trou nommé, et le tour suivant a trouvé le même trou une couche
 * plus bas. Ce n'est pas une convergence : **j'essayais de prouver une propriété SÉMANTIQUE —
 * « la valeur ne peut pas être vidée entre son calcul et son test » — par un appariement de
 * TEXTE.** Toute approximation syntaxique a une porte de sortie, et les lentilles trouvaient
 * chaque fois la suivante.
 *
 * > **La seule surface où AUCUN mutant n'a survécu, sur les quatre tours, est la garde d'argent
 * > — et c'est la seule qui LANCE LE BINAIRE.** Un témoin d'effet ne reconnaît pas la mutation :
 * > il constate que la gate ne refuse plus. Il est donc indifférent à la façon dont on l'écrit.
 *
 * Will a tranché : on bascule sur des témoins d'effet, et on cesse de raffiner le motif.
 *
 * ## La forme, et pourquoi elle porte un CONTRÔLE POSITIF
 *
 * Chaque témoin fait DEUX mesures dans deux dépôts jetables : le dépôt sain doit sortir en **0**,
 * le dépôt fauté doit sortir **non nul** ET nommer sa faute. Sans la première, un témoin resterait
 * vert alors que la gate refuse TOUT — un fichier d'entrée manquant, un `tsx` cassé, un chemin
 * relatif qui ne résout plus : le rouge serait obtenu pour la mauvaise raison, et c'est
 * exactement le défaut que ce fichier a déjà commis deux fois.
 *
 * ⚠️ CE QUE CES TÉMOINS NE COUVRENT PAS — mesuré, et non plus supposé.
 *
 * 🔴 Ma première rédaction de cette déclaration était **fausse deux fois**, et `exactitude` puis
 * `schema` l'ont mesuré : `.github/workflows/` n'est PAS une entrée de `gov:pr` (simple test de
 * préfixe, `gov-pr.ts:91`), `.claude/agents/` en est une et je l'omettais — **et l'obstacle que
 * j'avais nommé n'était pas le bon.** J'avais aussi déclaré UNE lacune là où il y en avait DEUX.
 * 🔑 *Déclarer une lacune ne dispense pas de mesurer ce qui la cause : une déclaration fausse est
 * une dette qu'on ne saura pas payer, et une déclaration incomplète protège moins qu'elle ne
 * rassure.*
 *
 * **`gov:pr`** — la surface qui AUTORISE, celle dont la neutralisation laisse passer une PR SANS
 * AUCUNE REVUE. Cause réelle : sous `--pr`, `gov-pr.ts:667`, `:681` et `:744` appellent **`gh` et
 * `git`**. Un dépôt jetable de fichiers ne la fait pas tourner ; son témoin demande de simuler la
 * forge.
 *
 * **`gov:trace`** — tentée au 22e tour sur motif de `schema`, qui avait raison de dire que
 * l'obstacle de `gov:pr` ne s'y applique pas (`--render` passe `avecPr=false`). Mesurée en trois
 * passes, entrées ajoutées une par une :
 * ```
 * docs/{requirements,tasks}.json + vitest.config.ts   -> ENOENT scripts/lot/tasks.schema.json
 * + scripts/lot/tasks.schema.json                     -> 96 ruptures (req_sans_test x31)
 * + l'arbre tests/ entier (39 fichiers)               -> 27 ruptures (titres_non_resolus)
 * ```
 * **Elle doit RÉSOUDRE les titres des tests**, ce qui demande le lanceur dans le dépôt cible : à
 * ce point, le « dépôt jetable » est un clone complet, et ce n'en est plus un.
 * ⚠️ C'est le **contrôle positif** qui l'a dit — il a refusé un dépôt sain (`code 1`) et m'a évité
 * de publier quatre témoins qui n'auraient rien mesuré. *Un contrôle positif ne sert pas à
 * confirmer : il sert à refuser un montage qui ne peut rien établir.*
 *
 * **Les familles NON injectées** restent sans témoin d'effet. Elles sont NOMMÉES dans les titres
 * des tests — pas comptées : `exactitude` a mesuré au 22e tour qu'aucun titre ne portait de
 * nombre, alors que j'écrivais ici le contraire. L'assertion d'appartenance
 * (`famillesDeclarees`) interdit d'en inventer une, mais elle ne dit rien de celles qui manquent.
 * *Déclarer une lacune ne dispense pas de mesurer ce qui la cause — une déclaration fausse est une
 * dette qu'on ne saura pas payer.*
 */
/**
 * ⚠️ LES DÉPÔTS JETABLES SONT TRACÉS ET NETTOYÉS, MÊME QUAND UN TÉMOIN ÉCHOUE.
 * `securite` a mesuré au 22e tour **399 dossiers laissés, 222 Mo**, dont **11 portant encore
 * `preuve.md` et sa coordonnée fabriquée** : le `rmSync` de la garde d’argent n’est pas dans un
 * `finally`, donc il ne tournait **que quand la garde passait**.
 * 🔑 *Un nettoyage qui ne s’exécute qu’en cas de SUCCÈS garde les traces précisément quand on
 * voudrait qu’il les efface.* `afterAll` tourne dans les deux cas.
 */
const DEPOTS_JETABLES: string[] = [];
afterAll(() => {
  for (const d of DEPOTS_JETABLES) rmSync(d, { recursive: true, force: true });
});

/**
 * Un dépôt jetable est un VRAI dépôt git : `git ls-files` doit y répondre.
 * 🔴 Sans ça, les gardes qui balaient le dépôt ne mesurent RIEN — et c’est exactement le défaut
 * que `schema` a trouvé au 23e tour : `gov:entite` rendait « ✅ aucune coordonnée en clair » après
 * avoir balayé ZÉRO fichier, avec un IBAN valide en clair dans les sources. L’absence de `.git`
 * est l’un des quatre discriminants par lesquels l’enfant reconnaît le banc d’essai.
 */
function faireDeCeDossierUnDepot(depot: string): void {
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 't@t'],
    ['config', 'user.name', 't'],
    ['add', '-A'],
  ]) {
    execFileSync('git', args, { cwd: depot, stdio: 'ignore' });
  }
}

function depotJetableAvec(fichiers: readonly string[]): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-effet-'));
  for (const f of fichiers) {
    mkdirSync(join(depot, dirname(f)), { recursive: true });
    copyFileSync(f, join(depot, f));
  }
  DEPOTS_JETABLES.push(depot);
  faireDeCeDossierUnDepot(depot);
  return depot;
}

/**
 * 🔴 UN DÉPÔT JETABLE **COMPLET**, pour les gates dont les entrées sont le dépôt lui-même.
 *
 * Motif BLOQUANT de `mutation` au 22e tour : `gov-trace.ts:383`,
 * `return process.argv.includes('--prove') ? fautes : [];` — **586/586 verts, `tsc` 0,
 * `gov:trace` 0, `--prove` ✅ « les 10 familles rougissent », `--verifier` ✅** — et la vue est
 * ÉCRITE depuis une source fautive à exit 0. Le refus qu'elle neutralise est **introduit par
 * cette PR**, et `gov:trace` était le seul des trois générateurs gardé **par du TEXTE seul**.
 *
 * ⚠️ **ET J'AVAIS DÉCLARÉ CETTE LACUNE IRRÉDUCTIBLE — À TORT.** J'avais mesuré trois passes
 * (ENOENT → 96 ruptures → 27 `titres_non_resolus`) et conclu qu'il faudrait « un clone complet,
 * et ce n'en est plus un ». **C'est un clone complet, et il coûte 0 seconde pour 170 fichiers.**
 * `git archive HEAD | tar -x` plus une jonction vers `node_modules` : la gate sort en 0.
 * 🔑 *Ma déclaration était fausse une fois par excès de confiance, puis une fois par excès de
 * prudence. Une lacune se mesure jusqu'au bout — s'arrêter à la troisième passe m'a fait déclarer
 * irréductible ce qui tenait en dix lignes.*
 *
 * `titresResolus` (`gov-trace.ts:632`) lance `npx vitest list` : il lui faut les specs ET les
 * sources qu'elles importent ET le lanceur. C'est pour ça que les copies partielles échouaient —
 * elles ne rendaient pas la gate fautive, elles la rendaient AVEUGLE.
 */
function depotCompletJetable({ avecGit = true }: { avecGit?: boolean } = {}): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-complet-'));
  DEPOTS_JETABLES.push(depot);
  const tar = execFileSync('git', ['archive', 'HEAD'], { maxBuffer: 512e6, encoding: 'buffer' });
  const chemin = join(depot, 'depot.tar');
  writeFileSync(chemin, tar);
  execFileSync('tar', ['-x', '-f', 'depot.tar'], { cwd: depot });
  rmSync(chemin, { force: true });
  symlinkSync(resolve('node_modules'), join(depot, 'node_modules'), 'junction');
  if (avecGit) faireDeCeDossierUnDepot(depot);
  return depot;
}

/**
 * Les familles que la gate DÉCLARE, lues dans SA source. Rend `null` si la gate n'en déclare
 * AUCUNE — et ce `null` est **prouvé**, pas supposé.
 *
 * 🔴 UN EXTRACTEUR QUI PERD EST SÛR SOUS UNE ASSERTION POSITIVE ET DANGEREUX SOUS UNE NÉGATIVE.
 * Motif de `schema` au 25e tour, et c'est la distinction que je n'avais pas vue :
 *
 * ```
 * sous `toContain(famille)`      une perte -> FAUX ROUGE, visible, on le corrige
 * sous `not.toContain(famille)`  une perte -> FAUX VERT,  invisible, il rassure
 * ```
 *
 * Mon témoin de distinction, ajouté au tour d'avant pour interdire un cas, était **VERT sur ce cas
 * même** (`5 passed | 42 skipped`) : son `catch { return }` avalait l'échec d'extraction.
 * *Un `catch` qui rend « rien » transforme « je n'ai pas su lire » en « il n'y a rien à
 * signaler » — le même défaut que le `try/catch { return [] }` de `fichiersSuivis`, dans le
 * fichier qui le ferme.*
 *
 * ⚠️ ET LA PREMIÈRE RÉÉCRITURE ÉTAIT ENCORE TROP ÉTROITE : elle exigeait un `\n]` final, donc elle
 * ne lisait pas `const FAMILLES = ['doctrine', ...CHIFFRES.map(…)]` (une seule ligne, avec spread).
 * L'appariement se fait maintenant par **équilibrage de crochets**, jamais par une forme de
 * mise en page.
 */
function famillesDeclarees(script: string): { noms: string[]; calculee: boolean } | null {
  const src = readFileSync(script, 'utf8');
  const noms = new Set<string>();
  let listes = 0;
  let calculee = false;

  const MARQUE = /const FAMILLES[A-Z_]*(?::[^=]+)? = \[/g;
  for (const m of [...src.matchAll(MARQUE)]) {
    listes++;
    let profondeur = 0;
    let fin = -1;
    for (let i = m.index! + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '[') profondeur++;
      else if (src[i] === ']') {
        profondeur--;
        if (profondeur === 0) { fin = i; break; }
      }
    }
    if (fin < 0) throw new Error(`${script} : liste \`FAMILLES\` non refermée — l’extracteur ne peut pas la lire.`);
    const corps = src.slice(m.index! + m[0].length, fin);
    for (const x of corps.matchAll(/nom: '([a-z_]+)'/g)) noms.add(x[1]!);
    for (const x of corps.matchAll(/'([a-z_]+)'/g)) noms.add(x[1]!);
    if (corps.includes('...')) calculee = true;
  }

  // Aucune liste : ce n'est pas un échec de lecture, c'est une ABSENCE — mais on la PROUVE.
  if (listes === 0) {
    if (/FAMILLES/.test(src)) {
      throw new Error(
        `${script} : le mot \`FAMILLES\` apparaît mais aucune DÉCLARATION n’a été reconnue. ` +
          'La garde REFUSE plutôt que de conclure à une absence qu’elle n’a pas établie.'
      );
    }
    return null;
  }
  if (noms.size === 0) throw new Error(`${script} : liste \`FAMILLES\` trouvée mais AUCUN nom extrait.`);
  return { noms: [...noms], calculee };
}

/**
 * 🔴 CETTE LISTE **RÉDUIT** L'ENVIRONNEMENT. ELLE NE LE CONSTRUIT PAS À PARTIR DE RIEN.
 *
 * C'est ce que j'avais écrit, et **c'est faux** — mesuré par `mutation` au 25e tour :
 * `env: {}` **strictement vide** rend quand même onze variables, réinjectées par libuv et
 * **ineffaçables sous Windows** (`HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`,
 * `SYSTEMROOT`, `TEMP`, `USERDOMAIN`, `USERNAME`, `USERPROFILE`, `WINDIR`), et `npx` en ajoute
 * ~22. **L'enfant en reçoit 53, pas 20.** La liste s'applique EN AMONT de ce qui repollue.
 * 🔑 *Un mutant a d'ailleurs été tué par `process.env.USERNAME` — non pas parce que la liste
 * l'avait prévu, mais parce que libuv le réinjecte. Une garde qui mord pour une raison qu'on
 * n'a pas choisie n'est pas la garde qu'on croit tenir.*
 *
 * ⚠️ ET DIX DES VINGT ENTRÉES N'ONT AUCUNE PROMESSE VIVANTE — recompté à l'exécution au 26e
 * tour, sur le motif d'`exactitude` : j'avais écrit « sept », la mesure en rend **neuf**
 * redondantes (`PATH`, `Path`, `SystemRoot`, `SystemDrive`, `windir`, `TEMP`, `USERPROFILE`,
 * `HOMEDRIVE`, `HOMEPATH` — toutes réinjectées par libuv, donc non retirables), plus `LC_ALL`
 * **absente du parent**, donc jamais transmise. Pour ces dix, la promesse « ça casse bruyamment
 * si ça manque » est **vide** : on ne peut pas les faire manquer.
 * 🔑 *Un chiffre écrit sous un titre « mesuré, pas supposé » se recompte à chaque tour, sinon
 * c'est le titre qui devient faux avant le chiffre.*
 *
 * ## Ce que cette liste ferme, et ce qu'elle NE ferme PAS — mesuré, pas supposé
 *
 * ```
 * FERMÉ    process.env.VITEST / TEST / NODE_ENV / CI       (les noms du lanceur de tests)
 * OUVERT   npm_config_user_agent : `npm/…` au banc, `pnpm/…` en CI (ci.yml lance `pnpm gov:*`)
 * OUVERT   la TOPOLOGIE git : le jetable n'a pas de remote, le dépôt réel et actions/checkout si
 * OUVERT   `process.cwd().startsWith(process.env.TEMP)` — INFERMABLE par une liste
 *          d'environnement, quelle qu'elle soit. Il faut monter le jetable AILLEURS.
 * ```
 *
 * > **La bonne propriété n'est pas « assainir l'environnement », c'est LANCER CE QU'ON LIVRE, DE
 * > LA FAÇON DONT ON LE LIVRE** — `pnpm <script>`, depuis le cwd de production, sur la copie
 * > qu'on juge. C'est la formulation de `mutation`, et elle vaut mieux que la mienne : elle
 * > explique pourquoi « un témoin d'effet par garde » n'aurait tué **aucun** des trois survivants.
 * > `gov:entite` A son témoin d'effet, il est VERT, et la garde est aveugle en production.
 */
const VARIABLES_DE_PRODUCTION = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'COMSPEC',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'LANG',
  'LC_ALL',
] as const;

/**
 * L'environnement d'un enfant qui ne doit PAS savoir qu'il est sous test.
 *
 * ⚠️ Il **RÉDUIT** l'environnement du parent — il ne le construit pas à partir de rien. Le corps
 * ci-dessous fait `env[v] = process.env[v]` : c'est une COPIE filtrée. La formule « construit à
 * partir de RIEN, jamais copié depuis le parent » a figuré ici et elle est **fausse deux fois** :
 * par ce corps, et parce que libuv réinjecte onze variables dans tout enfant même sous `env: {}`.
 * 🔑 *Elle avait été rectifiée dans le docstring du haut et laissée intacte ici — la même erreur
 * qu'un `findIndex` sur une chaîne non unique, rejouée sur la prose : une chose à deux endroits,
 * un seul apparié.*
 */
function environnementDeProduction(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const v of VARIABLES_DE_PRODUCTION) {
    const val = process.env[v];
    if (val !== undefined) env[v] = val;
  }
  return env;
}

function lancerLaGate(script: string, cwd: string, args: string[] = []): { code: number; sortie: string } {
  try {
    const stdout = execFileSync('npx', ['tsx', resolve(script), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: environnementDeProduction(),
      shell: true,
    });
    return { code: 0, sortie: stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * 🔴 UNE FAUTE PAR GATE MESURE UNE GATE, PAS UN CONTRÔLE.
 *
 * Motif de `mutation` au 21e tour, et c'est la faiblesse que j'avais moi-même nommée en lançant
 * le tour — elle l'a confirmée par la mesure :
 *
 * ```
 * return fautes
 *   -> !argv.includes('--prove') ? fautes.filter(f => f.famille === 'dep_inconnue') : fautes
 *      spec 21/21 VERTS · gov:tasks 0 · --prove 0 · --verifie-rendu 0
 *      un backlog SANS `statut` et a 999 jours passe a exit 0
 * ```
 *
 * La gate déclare **douze** familles ; mon témoin en exerçait **une**. Toute neutralisation qui
 * préserve la famille injectée et jette les autres reste verte, et le filet `--prove` ne rattrape
 * rien : il se discrimine trivialement par `process.argv` **dans le même processus**.
 *
 * > **Un témoin d'effet prouve la famille qu'il injecte, jamais la gate.** Il n'y a pas de
 * > généralisation gratuite : ce qu'on n'a pas fait rougir, on ne l'a pas gardé.
 *
 * Chaque gate porte donc **plusieurs** fautes, de familles DIFFÉRENTES, et le nom du test les
 * énumère. Ce n'est pas l'exhaustivité — c'est la fin de l'ambiguïté sur ce qui est couvert.
 * ⚠️ Ce que ça ne donne toujours pas : les familles NON listées ici restent sans témoin d'effet.
 * Les nommer une par une est le travail du lot suivant, et le nombre déclaré dans le titre du
 * test est là pour que leur absence se voie.
 */
/**
 * Les gates dont la neutralisation a été MESURÉE au 19e et au 20e tour : sain elles refusent,
 * mutées elles sortent en 0 **en imprimant leur bannière de succès**. C'est ce couple-là que le
 * témoin d'effet rend impossible à obtenir silencieusement.
 */
const GATES_A_TEMOIN_D_EFFET = [
  {
    nom: 'gov:tasks',
    depot: 'partiel' as const,
    vue: 'docs/TASKS.md',
    script: 'scripts/gates/gov-tasks.ts',
    fichiers: [
      'docs/tasks.json',
      'docs/DECISIONS.md',
      'scripts/lot/tasks.schema.json',
    ],
    // Une dépendance vers une tâche qui n'existe pas : faute RÉELLE, contrôlée par la gate.
    fautes: [
      {
        famille: 'dep_inconnue',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { taches: { deps?: string[] }[] };
          doc.taches[0]!.deps = [...(doc.taches[0]!.deps ?? []), 'XXX-999'];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}
`, 'utf8');
        },
      },
      {
        // Famille DIFFÉRENTE : le mutant qui ne garde que `dep_inconnue` meurt ici.
        famille: 'schema',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { taches: Record<string, unknown>[] };
          delete doc.taches[0]!.statut;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}
`, 'utf8');
        },
      },
    ],
  },
  {
    nom: 'gov:requirements',
    depot: 'partiel' as const,
    vue: 'docs/REQUIREMENTS.md',
    script: 'scripts/gates/gov-requirements.ts',
    fichiers: [
      'docs/requirements.json',
      'docs/tasks.json',
      'scripts/lot/requirements.schema.json',
    ],
    // Un champ obligatoire retiré : le schéma doit le refuser.
    fautes: [
      {
        famille: 'schema',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/requirements.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { exigences: Record<string, unknown>[] };
          delete doc.exigences[0]!.statut;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}
`, 'utf8');
        },
      },
      {
        // Famille DIFFÉRENTE : un identifiant dupliqué, que le schéma seul ne voit pas.
        famille: 'id_double',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/requirements.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { exigences: { id: string }[] };
          doc.exigences[1]!.id = doc.exigences[0]!.id;
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}
`, 'utf8');
        },
      },
    ],
  },
  {
    // 🔴 AJOUTÉE au 22e tour, sur motif BLOQUANT de `mutation`. Elle est la seule des trois
    // générateurs qui était gardée par du TEXTE seul, et le refus que son mutant neutralise est
    // INTRODUIT par cette PR. Ses entrées sont le dépôt lui-même : `titresResolus` lance
    // `npx vitest list`, donc il lui faut les specs, leurs sources, et le lanceur.
    nom: 'gov:trace',
    script: 'scripts/gates/gov-trace.ts',
    vue: 'docs/TRACABILITE.md',
    depot: 'complet' as const,
    fichiers: [] as readonly string[],
    fautes: [
      {
        famille: 'tache_sans_req',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as { taches: { statut: string; reqs: string[] }[] };
          const livree = doc.taches.find((t) => t.statut === 'fusionnee' && t.reqs.length > 0)!;
          livree.reqs = [];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        },
      },
      {
        // Famille DIFFÉRENTE : une tâche livrée promet un test qui n'existe pas.
        famille: 'test_promis_absent',
        appliquer: (depot: string) => {
          const p = join(depot, 'docs/tasks.json');
          const doc = JSON.parse(readFileSync(p, 'utf8')) as {
            taches: { statut: string; reqs: string[]; tests?: Record<string, string[]> }[];
          };
          const livree = doc.taches.find((t) => t.statut === 'fusionnee' && t.tests && Object.keys(t.tests).length > 0)!;
          const req = Object.keys(livree.tests!)[0]!;
          livree.tests![req] = ['tests/unit/gouvernance/ce-fichier-n-existe-pas.spec.ts'];
          writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        },
      },
    ],
  },
] as const;

describe('REQ-GOV-032 — TÉMOINS D’EFFET : une gate neutralisée ne peut pas rester verte', () => {
  for (const { nom, script, fichiers, fautes, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom}\` SORT en échec sur une faute RÉELLE de famille \`${famille}\`, et 0 sans elle`, () => {
        // CONTRÔLE POSITIF D'ABORD. Sans lui, une gate qui refuserait TOUT rendrait ce témoin vert
        // pour la mauvaise raison — un fichier d'entrée manquant, un chemin qui ne résout plus.
        const sain = depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        const avant = lancerLaGate(script, sain);
        expect(
          avant.code,
          `${nom} refuse un dépôt SAIN (code ${avant.code}) — le témoin ne mesurerait rien :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);

        const casse = depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        appliquer(casse);
        const apres = lancerLaGate(script, casse);
        expect(
          apres.code,
          `${nom} n’est PAS sortie en échec sur une faute \`${famille}\` — elle a imprimé :\n${apres.sortie.slice(0, 600)}`
        ).not.toBe(0);
        // Et pour LA bonne raison : un refus d'une AUTRE famille ne prouverait rien de celle-ci.
        // 🔑 LA FAMILLE DOIT EXISTER DANS LA GATE. Sans ça, `toContain` porte sur un nom
        // inventé : `'id'` faisait deux caractères et « inval**id**e » le satisfaisait.
        expect(
          famillesDeclarees(script)?.noms ?? [],
          `${nom} : la famille ${famille} du témoin n’existe pas dans les FAMILLES de la gate`
        ).toContain(famille);
        expect(
          apres.sortie,
          `${nom} refuse, mais pas pour la famille \`${famille}\` injectée`
        ).toContain(famille);
      }, 180_000);
    }
  }
});


/**
 * 🔴 LE MODE `--render` EST CELUI QUE CE FICHIER EXISTE POUR GARDER, ET MON TÉMOIN NE L'APPELAIT
 * PAS.
 *
 * Motif de `schema` au 21e tour, et c'est la **deuxième fois de la journée que je RETIRE de la
 * couverture en croyant l'étendre** :
 *
 * ```
 * mutant `controler(…).filter(() => false)` sur gov-tasks.ts:344 (bloc --render)
 *   7a9bd27 (le temoin de TEXTE que j'ai supprime)  ->  ROUGE
 *   30ef53e (mes deux temoins d'EFFET)              ->  VERT
 * effet reel : `gov:tasks --render` REECRIT docs/TASKS.md depuis un backlog a
 *              `dep_inconnue` reel, exit 0, banniere ✅, 140137 -> 140139 octets
 * ```
 *
 * `gov-tasks.ts` porte **deux** `const fautes = controler(…)` : le mode normal (l. 489) et le bloc
 * `--render` (l. 343), celui qui garde `writeFileSync(CHEMIN_VUE)`. Mon témoin lançait la gate
 * **sans argument** : il n'exerçait que le premier. Or REQ-GOV-032 s'intitule « un refus de
 * **RENDRE** ».
 *
 * 🔑 **ET VOICI CE QUI ME L'A CACHÉ.** Mon tableau de mutants annonçait « ASI … MORT » **sans
 * nommer lequel des deux sites** portait la mutation. J'avais muté le site du verdict, jamais
 * celui du rendu, et le tableau ne pouvait pas le dire.
 * > **Un compte de mutants qui nomme le FICHIER et pas le SITE laisse passer exactement la
 * > régression qu'il prétend exclure.** C'est la même faute que « les DEUX frères à la même
 * > structure » au 17e tour : le nom d'une mesure n'est pas son périmètre.
 *
 * ## Ce que le témoin du mode `--render` asserte, et qui est le VRAI dommage
 *
 * Sortir en échec ne suffit pas : ce qui blesse, c'est **la vue réécrite depuis une source
 * fautive**. Le témoin compare donc le fichier de vue **avant et après**, et exige qu'il n'ait
 * pas bougé. Une gate qui refuserait en sortant 1 *après* avoir écrit resterait un défaut, et
 * aucune assertion sur le code de sortie ne le verrait.
 */
describe('REQ-GOV-032 — TÉMOIN D’EFFET du mode `--render` : une vue n’est PAS rendue depuis une source fautive', () => {
  for (const { nom, script, fichiers, fautes, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom} --render\` REFUSE et n’écrit PAS \`${vue}\` sur une faute \`${famille}\``, () => {
        // 🔑 CONTRÔLE POSITIF, ET IL DOIT PROUVER QUE LE RENDU **ÉCRIT**. Trouvé par moi avant
        // le tour : ma première version n'exigeait qu'un `exit 0`. J'assertais donc qu'une vue ne
        // bouge PAS sur une source fautive **sans avoir jamais prouvé qu'elle bouge sur une source
        // saine** — une gate qui n'écrirait plus rien du tout aurait passé les deux assertions.
        // On vide la vue, on rend, elle doit être RÉÉCRITE.
        const sain = depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        const cheminSain = join(sain, vue);
        const TEMOIN_DE_VIDE = 'VIDÉE PAR LE TÉMOIN — le rendu doit la réécrire\n';
        writeFileSync(cheminSain, TEMOIN_DE_VIDE, 'utf8');
        const avant = lancerLaGate(script, sain, ['--render']);
        expect(
          avant.code,
          `${nom} --render refuse une source SAINE (code ${avant.code}) :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);
        expect(
          readFileSync(cheminSain, 'utf8'),
          `${nom} --render sort en 0 mais n’ÉCRIT PAS ${vue} — le témoin de non-écriture ne prouverait rien`
        ).not.toBe(TEMOIN_DE_VIDE);

        const casse = depot === 'complet' ? depotCompletJetable() : depotJetableAvec([...fichiers, vue]);
        appliquer(casse);
        const cheminVue = join(casse, vue);
        const vueAvant = readFileSync(cheminVue, 'utf8');
        const apres = lancerLaGate(script, casse, ['--render']);

        expect(
          apres.code,
          `${nom} --render n’est PAS sortie en échec sur une faute \`${famille}\` :\n${apres.sortie.slice(0, 600)}`
        ).not.toBe(0);
        expect(apres.sortie, `${nom} --render refuse, mais pas pour avoir REFUSÉ DE RENDRE`).toContain(
          'Refus de rendre'
        );
        // 🔑 LE DOMMAGE RÉEL. Un refus qui sort en 1 APRÈS avoir écrit reste un défaut, et aucune
        // assertion sur le code de sortie ne le verrait.
        expect(
          readFileSync(cheminVue, 'utf8'),
          `${nom} --render a RÉÉCRIT ${vue} depuis une source \`${famille}\` fautive`
        ).toBe(vueAvant);
      }, 180_000);
    }
  }
});


/**
 * 🔴 CHAQUE ENTRÉE DÉCLARÉE DOIT ÊTRE NÉCESSAIRE.
 *
 * Motif de `schema` au 22e tour : `docs/DECISIONS.md` figurait dans les entrées de
 * `gov:requirements`, qui ne la lit **jamais** — mesuré, dépôt jetable avec les quatre autres
 * fichiers seulement : « ✅ gov:requirements — 355 exigences », exit 0.
 *
 * > **Mon contrôle positif ne rougissait que sur une entrée MANQUANTE, jamais sur une entrée
 * > SUPERFLUE.** Une liste d'entrées qui contient du mort déclare une couverture qui n'existe pas,
 * > et rien ne le dit.
 *
 * Ce témoin retire les entrées **une par une** et exige qu'au moins un des deux modes tombe.
 * ⚠️ Il porte sur l'UNION des modes : une entrée que seul `--render` lit paraîtrait superflue au
 * mode normal, et la retirer serait une régression silencieuse.
 */
describe('REQ-GOV-032 — les entrées déclarées des témoins d’effet sont toutes NÉCESSAIRES', () => {
  for (const { nom, script, fichiers, vue, depot } of GATES_A_TEMOIN_D_EFFET) {
    if (depot === 'complet') continue; // ses entrées sont le dépôt : rien à minimiser
    for (const absente of fichiers) {
      it(`REQ-GOV-032 — \`${nom}\` a besoin de \`${absente}\``, () => {
        const ampute = depotJetableAvec([...fichiers.filter((f) => f !== absente), vue]);
        const normal = lancerLaGate(script, ampute);
        const rendu = lancerLaGate(script, ampute, ['--render']);
        expect(
          normal.code !== 0 || rendu.code !== 0,
          `${nom} : \`${absente}\` est déclarée en entrée et ne sert à RIEN — les DEUX modes ` +
            `sortent en 0 sans elle (normal ${normal.code}, --render ${rendu.code})`
        ).toBe(true);
      }, 180_000);
    }
  }
});


/**
 * 🔴 TÉMOIN D'EFFET DU REFUS `perimetre_illisible` — le défaut le plus grave trouvé de la session.
 *
 * `fichiersSuivis()` portait un `try/catch { return [] }`, **recopié à l'identique dans CINQ
 * gardes**. Dans un dépôt sans `.git` — c'est-à-dire le montage que ce fichier lui-même fabrique —
 * `gov:entite` imprimait :
 *
 * ```
 * ✅ gov:entite — … 0 fichier(s) suivi(s) balayé(s) : aucune coordonnée en clair, …   CODE=0
 * ```
 *
 * **avec un IBAN à clé mod-97 valide posé en clair dans les sources**, dans un dépôt **PUBLIC**.
 * Mesuré par `schema` au 23e tour, reproduit avant correction.
 *
 * > **« Je n'ai rien trouvé » et « je n'ai rien regardé » sont deux phrases différentes, et une
 * > seule des deux autorise à publier.**
 *
 * Ce témoin exige les DEUX faces : le périmètre inconnu fait REFUSER, et le dépôt réel reste VERT.
 * Sans la seconde, j'aurais pu remplacer un faux vert par un faux rouge sans le voir.
 */
/**
 * 🔴 QUATRIÈME ÉTAT MUET, et un refus SANS TÉMOIN — motifs de `securite` au 26e tour.
 *
 * 1. `fichiers-suivis.ts` appelait `git ls-files` sans `-z` ni `core.quotepath=false`. Tout chemin
 *    non-ASCII revient alors CITÉ et échappé en octal (`"docs/tÃ©moin.md"`), et les cinq
 *    appelants le jettent par leur `if (!existsSync(...)) continue`. Même appât : nom ASCII →
 *    la garde MORD ; nom accentué → **`✅` et exit 0**. Sur un dépôt PUBLIC et FRANCOPHONE.
 *    🔑 *Mesuré : 0 fichier non-ASCII suivi à ce jour. Le défaut ne cachait donc RIEN encore —
 *    il attendait le premier fichier accentué. Un défaut latent se ferme au moment où on le
 *    voit, pas au moment où il mord.*
 *
 * 2. Le refus hors racine ajouté par `21765ad` n'avait **aucun témoin d'effet** : la mutation
 *    `if (false && ici !== haut)` rouvrait entièrement le faux vert et la spec restait verte.
 *    *Une garde sans témoin n'est pas une garde : c'est une intention (RM-02).*
 */
describe('REQ-CPL-018 — le périmètre couvre les noms NON-ASCII, et se refuse hors de la racine', () => {
  // `MOTIF_NU` de `gov-identifiants.ts:79` : une étiquette nue `[ABCDR]\d{1,2}`.
  // ⚠️ PAS `A04` : `estCodeDePoste` (`/^A\d{2}$/`) exempte les codes de poste, et mon premier
  // appât était donc INVISIBLE — le contrôle positif ASCII a rougi et me l'a dit.
  // *Un témoin dont le contrôle positif échoue ne mesure rien : il ne condamne pas, il ignore.*
  const APPAT = 'Renvoi D7 : la suite est au registre.';

  for (const { etiquette, nom } of [
    { etiquette: 'ASCII', nom: 'temoin-perimetre-ascii.md' },
    { etiquette: 'accentué', nom: 'témoin-périmètre-accentué.md' },
  ]) {
    it(`REQ-CPL-018 — la faute est VUE dans un fichier suivi au nom ${etiquette}`, () => {
      const depot = depotCompletJetable();
      writeFileSync(join(depot, 'docs', nom), APPAT, 'utf8');
      execFileSync('git', ['add', '-A'], { cwd: depot, stdio: 'ignore' });

      const r = lancerLaGate('scripts/gates/gov-identifiants.ts', depot);
      // 🔴 NI `not.toBe(0)`, NI `toContain(<nom>)` — DEUX motifs successifs, 27e et 28e tours.
      //
      //   `not.toBe(0)`      : `perimetre_entame`, ajouté par le commit SUIVANT, refusait à la
      //                        place du `-z`. Rouge pour une raison que le témoin n'a pas choisie.
      //   `toContain(<nom>)` : pire. Sans `-z`, `split(NUL)` rend UN SEUL élément — le blob entier
      //                        de `git ls-files` — qui n'existe pas comme fichier, donc part dans
      //                        le message de `PerimetreEntame` (`introuvables.slice(0,5)` tronque
      //                        le TABLEAU, jamais la chaîne). Le nom du fichier s'y trouve : le
      //                        témoin était satisfait par un ÉCHO DE L'ÉNUMÉRATION.
      //                        Mesuré par `securite` au 28e tour, reproduit ici : `2 passed`.
      //
      // 🔑 *Et ma mesure « `-z` retiré → ROUGE » était fausse : ma mutation changeait DEUX choses
      // (le `-z` ET `core.quotepath=false`). Un témoin qui bouge pour deux raisons ne discrimine
      // rien — y compris quand c'est le témoin d'un témoin.*
      //
      // ⚠️ ET LA MAXIME « une garde ne peut nommer que ce qu'elle a lu » EST FAUSSE — réfutée par
      // le fichier que ce lot vient d'écrire : `fichiers-suivis.ts` fait énumérer à
      // `perimetre_entame` précisément les chemins qu'il n'a PAS pu lire. Relevé par `schema` au
      // 28e tour. *Le contre-exemple d'une règle qu'on pose se trouve parfois dans le fichier
      // qu'on vient d'écrire pour la tenir.*
      //
      // Ce que seule une LECTURE DU CONTENU peut produire : le message de faute, SUR LA LIGNE du
      // fichier. Le nom seul s'écho ; « identifiant nu » ne s'invente pas sans avoir lu l'appât.
      // Et on exige en plus que le refus ne soit PAS de nature `perimetre_entame` : un refus de
      // périmètre est correct, mais il ne prouve rien de la LECTURE, qui est l'objet de ce témoin.
      const ligneFautive = r.sortie
        .split(/\r?\n/)
        .find((l) => l.includes(nom) && l.includes('identifiant nu'));
      expect(
        ligneFautive,
        `gov:identifiants n'a pas rendu de LIGNE DE FAUTE pour « docs/${nom} » (nom ${etiquette}) : ` +
          `elle n'a pas lu son contenu. Code ${r.code}, sortie :\n${r.sortie.slice(0, 600)}`
      ).toBeDefined();
      expect(
        r.sortie,
        `gov:identifiants a refusé sur le PÉRIMÈTRE, pas sur la faute : elle n'a pas lu « docs/${nom} »`
      ).not.toContain('perimetre_entame');
      expect(r.code, `gov:identifiants a rendu la faute mais sort 0`).not.toBe(0);
    });
  }

  // 🔴 TROISIÈME MOTIF DE `securite` AU 26e TOUR — la bannière compte les fichiers LUS.
  //
  //     « 168 fichier(s) suivi(s) balayé(s) : aucune coordonnée en clair » — imprimé À L'IDENTIQUE
  //     avec 171 et avec 172 fichiers suivis. Le témoin positif est SOUSTRAIT par la chute même
  //     qu'il devrait signaler.
  //
  // Cause : `if (!estBalaye(chemin) || !existsSync(chemin)) continue;` confond DEUX raisons de
  // sauter — « hors périmètre par décision » (légitime, l'extension n'est pas balayée) et
  // « fichier SUIVI introuvable sur le disque » (anormal). La seconde est muette.
  // *Un compteur qui diminue quand le périmètre s'entame ne peut pas signaler qu'il s'entame.*
  it('REQ-CPL-018 — une garde REFUSE si un fichier SUIVI est introuvable sur le disque', () => {
    const depot = depotCompletJetable();
    // Suivi par `git ls-files` (l'index le porte), absent du disque : le périmètre est ENTAMÉ.
    rmSync(join(depot, 'docs/CONVENTIONS.md'), { force: true });

    const r = lancerLaGate('scripts/gates/gov-identifiants.ts', depot);
    expect(
      r.code,
      `gov:identifiants a rendu un verdict alors qu'un fichier suivi manquait — elle a imprimé :` +
        `\n${r.sortie.slice(0, 600)}`
    ).not.toBe(0);
    expect(r.sortie, 'le refus ne nomme pas `perimetre_entame`').toContain('perimetre_entame');
  });

  // 🔑 CE QUE CE TÉMOIN PROUVE, ET SUR COMBIEN — mesuré par la mutation `if (false && ici !== haut)`
  // qui neutralise la garde de racine :
  //
  //     gov-identifiants, gov-publication   -> ROUGISSENT   (2/5 : ils PROUVENT la garde)
  //     gov-entite, gov-preseance, lexique  -> restent VERTS (3/5)
  //
  // Les trois derniers lisent une entrée par chemin RELATIF et refusent AVANT d'atteindre la garde
  // de périmètre : leur vert ne vient donc pas d'elle. *Un témoin vert pour une raison qu'on n'a
  // pas choisie ne prouve pas ce qu'il annonce.* On les garde — ils tiennent la propriété de
  // sécurité (aucune bannière de succès sur un BOUT du dépôt) — mais la preuve de la garde de
  // racine repose sur DEUX d'entre eux, et c'est écrit ici pour que personne ne lise cinq preuves.
  for (const script of GARDES_QUI_BALAIENT) {
    it(`REQ-CPL-018 — \`${script}\` REFUSE lancée hors de la racine du dépôt`, () => {
      const depot = depotCompletJetable();
      const r = lancerLaGate(script, join(depot, 'packages'));
      expect(
        r.code,
        `${script} a rendu un verdict depuis \`packages/\` — elle n'y voit qu'un BOUT du dépôt :
${r.sortie.slice(0, 600)}`
      ).not.toBe(0);
      // ⚠️ On n'exige PAS `perimetre_illisible` ici, et c'est mesuré : `gov-preseance` lit
      // `docs/PRESEANCE.md` par chemin RELATIF et refuse AVANT d'atteindre la garde de périmètre.
      // Son refus est correct, il ne porte simplement pas ce nom-là. La propriété de sécurité
      // qui compte est la même pour les cinq : **aucune bannière de succès sur un BOUT du dépôt**.
      // ⚠️ ET PAS `not.toContain('✅')` : le message de refus CITE le caractère pour expliquer
      // ce qu'il empêche (« la garde balaierait UN BOUT du dépôt et rendrait « ✅ » dessus »).
      // Une garde lexicale trop large condamne le texte qui décrit la protection — mesuré : les
      // cinq rougissaient sur leur propre message de refus. On vise la BANNIÈRE, en tête de ligne.
      const bannieres = r.sortie.split(/\r?\n/).filter((l) => l.trimStart().startsWith('✅'));
      expect(
        bannieres,
        `${script} a imprimé une bannière de SUCCÈS depuis \`packages/\` :
${r.sortie.slice(0, 600)}`
      ).toEqual([]);
    });
  }
});

/**
 * 🔴 DÉCLARÉE, ET NON DÉRIVÉE — et c'est le RENVERSEMENT de ma première rédaction.
 *
 * J'avais dérivé cette liste du disque : les gardes de `scripts/gates/` qui importent
 * `fichiersSuivisOuRefus`. `mutation` l'a mise en défaut DEUX FOIS, et la seconde est décisive :
 * en remplaçant la primitive par une marche `readdirSync` avec `catch { return [] }` — sans jamais
 * réintroduire `'ls-files'` — la garde **s'évapore des trois `describe`**, 21/21 verts, le total
 * collecté passant de 59 à 56 sans un bruit.
 *
 * 🔑 **Une population DÉRIVÉE DE LA PRÉSENCE DU CORRECTIF ne verra jamais celui qui le PERD.**
 * C'est exactement la garde qu'on veut : éprouver des fichiers qui POURRAIENT perdre le correctif.
 * Les y chercher par le correctif rend l'épreuve vide au moment précis où elle compterait.
 *
 * La liste est donc TAPÉE — une déclaration, que seul un humain retire — et la réciproque
 * ci-dessous attrape l'oubli inverse : toute garde qui importe la primitive doit y figurer.
 */
const GARDES_QUI_BALAIENT = [
  // GOV-030 — `gov-check` établit son périmètre AVANT de lire ses sources, précisément pour que
  // son refus depuis `packages/` porte le nom `perimetre_illisible` au lieu d'un `ENOENT` muet.
  'scripts/gates/gov-check.ts',
  'scripts/gates/gov-conventions.ts',
  'scripts/gates/gov-entite.ts',
  'scripts/gates/gov-identifiants.ts',
  'scripts/gates/gov-preseance.ts',
  'scripts/gates/gov-publication.ts',
  'scripts/gates/lexique-apporteurs.ts',
] as const;

it('REQ-CPL-018 — toute garde qui importe la primitive de périmètre est DÉCLARÉE ci-dessus', () => {
  // La réciproque de la déclaration : elle attrape la garde AJOUTÉE qu'on aurait oublié d'inscrire.
  // L'autre sens — la garde qui PERD le correctif — est tenu par la déclaration elle-même : elle
  // reste dans la liste, donc dans les témoins, donc elle rougit.
  const importent = enumererFichiers('scripts/gates').filter((f) =>
    readFileSync(f, 'utf8').includes('fichiersSuivisOuRefus')
  );
  expect(
    importent.filter((f) => !GARDES_QUI_BALAIENT.includes(f as (typeof GARDES_QUI_BALAIENT)[number])),
    'ces gardes importent `fichiersSuivisOuRefus` sans être déclarées dans GARDES_QUI_BALAIENT'
  ).toEqual([]);
});

/**
 * 🔴 LE CONTRÔLE QUI NE DÉPEND PAS DE LA LISTE — motif de `mutation` sur la PR #33.
 *
 * `GARDES_QUI_BALAIENT` est DÉCLARÉE. Une rédaction antérieure la dérivait du disque : retirer les
 * DEUX en même temps — l'import devient inutile, aucun lint ne proteste — fait sortir une garde du
 * périmètre **sans un bruit** : les deux compteurs baissent ensemble, l'égalité tient, et la garde
 * rend `✅ … exit 0` sur un dossier sans `.git` en balayant zéro fichier, dans la chaîne bloquante
 * de `gov:check`. Mesuré par `mutation` : **111/111 verts** sur ce mutant.
 *
 * 🔑 *Un contrôle qui compte les membres d'un ensemble ne voit pas celui qui en sort : il faut
 * chercher ce que la sortie PRODUIT.* Ce que produit une garde qui quitte la primitive, c'est un
 * `ls-files` qui réapparaît quelque part. On le cherche là, à la source, sans liste d'aucune sorte.
 */
it('REQ-CPL-018 — `git ls-files` n’est appelé QUE par la source unique du périmètre', () => {
  const enFaute = enumererFichiers('scripts')
    .filter((f) => f !== 'scripts/lot/fichiers-suivis.ts')
    // ⚠️ `ls-files` NU, pas `'ls-files'` : `securite` a mesuré que la forme shell
    // `execSync('git ls-files', …)` échappait au jeton entre quotes — 779/779 verts, trois témoins
    // DISPARUS, et la gate à `exit 0` sur zéro garde. *Une garde qui cherche une orthographe ne
    // couvre pas une famille.* La forme historique du défaut dans ce dépôt est `execFileSync`,
    // mais l'étroitesse se ferme pour rien ici.
    // 🔑 On vise l'APPEL, pas la MENTION. Élargi au jeton nu, ce témoin condamnait deux fichiers
    // qui ne font que PARLER de `git ls-files` en commentaire — dont celui qui décrit la
    // protection elle-même. *Une garde lexicale trop large condamne le texte qui la documente.*
    // Une LIGNE qui porte `exec…` ET `ls-files` est un appel ; les deux formes (`execFileSync`
    // avec un tableau, `execSync` en shell — le contournement mesuré par `securite`) y passent.
    .filter((f) =>
      readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .some((ligne) => /exec\w*Sync/.test(ligne) && ligne.includes('ls-files'))
    );
  expect(
    enFaute,
    `ces fichiers appellent \`git ls-files\` hors de la source unique : une garde qui quitte ` +
      `\`fichiersSuivisOuRefus\` retrouve le \`try/catch { return [] }\` que ce lot ferme`
  ).toEqual([]);
});

describe('REQ-CPL-018 — une garde qui ne peut pas établir son PÉRIMÈTRE refuse', () => {

  for (const script of GARDES_QUI_BALAIENT) {
    it(`REQ-CPL-018 — \`${script}\` REFUSE quand \`git ls-files\` ne répond pas`, () => {
      // Un dossier SANS `.git` : `faireDeCeDossierUnDepot` n'est PAS appelé ici, c'est le sujet.
      // 🔑 AUCUNE RECOPIE : le montage est celui de `depotCompletJetable`, paramétré. Motif de
      // `schema` au 24e tour — j’avais recopié son corps à la main **dans le commit même qui
      // ferme un patron recopié cinq fois**, en y perdant au passage le `rmSync` du `.tar` et
      // en y laissant un `git archive` dont le résultat était jeté.
      const sansGit = depotCompletJetable({ avecGit: false });

      const aveugle = lancerLaGate(script, sansGit);
      expect(
        aveugle.code,
        `${script} rend un verdict sur un périmètre INCONNU — elle a imprimé :\n${aveugle.sortie.slice(0, 500)}`
      ).not.toBe(0);
      expect(aveugle.sortie, `${script} refuse, mais pas pour \`perimetre_illisible\``).toContain('perimetre_illisible');

      // CONTRE-TÉMOIN : sur le dépôt RÉEL elle reste verte. Sans lui, un faux rouge passerait
      // pour une correction.
      const reel = lancerLaGate(script, resolve('.'));
      expect(
        reel.code,
        `${script} refuse le dépôt RÉEL — j’aurais remplacé un faux vert par un faux rouge :\n${reel.sortie.slice(0, 500)}`
      ).toBe(0);
    }, 180_000);
  }
});


/**
 * 🔑 `perimetre_illisible` N'EST PAS UNE FAMILLE DE FAUTE — c'est un REFUS DE PRÉCONDITION.
 *
 * Motif de `schema` au 24e tour : quatre gardes IMPRIMENT ce mot sans le DÉCLARER dans leurs
 * `FAMILLES`, et leur `--prove` affirme « les N familles rougissent chacune sur son témoin » alors
 * que la gate peut en émettre N+1. Elle avait raison de le relever ; **la correction que j'ai
 * essayée d'abord était fausse** — ajouter le mot à `FAMILLES` fait rougir `--prove` :
 *
 * ```
 * ❌ 1 famille(s) sans témoin qui rougit : perimetre_illisible.
 * ```
 *
 * Et `--prove` a raison à son tour : une famille de faute est **produite par `controler()`** et
 * rendue dans une liste ; celle-ci **sort du processus avant toute analyse**. Les deux ne se
 * prouvent pas de la même manière, et les mélanger rendait la preuve impossible.
 *
 * > **Une précondition et une faute ne se déclarent pas ensemble : l'une dit que le contrôle NE
 * > PEUT PAS avoir lieu, l'autre dit ce qu'il a trouvé.** Le `--prove` d'une gate prouve les
 * > secondes ; la première se prouve en LANÇANT la gate hors de ses préconditions.
 *
 * Ce témoin garde donc la DISTINCTION elle-même : si quelqu'un range un jour `perimetre_illisible`
 * parmi les familles de faute, il rougit et force l'arbitrage — au lieu de casser `--prove`
 * silencieusement, comme je viens de le faire.
 */
describe('REQ-CPL-018 — `perimetre_illisible` est une PRÉCONDITION, pas une famille de faute', () => {
  for (const script of GARDES_QUI_BALAIENT) {
    it(`REQ-CPL-018 — \`${script}\` ne range pas \`perimetre_illisible\` parmi ses familles de faute`, () => {
      // 🔑 AUCUN `catch` ICI. Ma version précédente avalait l'échec d'extraction et rendait VERT —
      // sur le cas même qu'elle interdit (`schema`, 25e tour : `5 passed | 42 skipped`).
      // *Sous une assertion NÉGATIVE, « je n'ai pas su lire » devient « rien à signaler ».*
      // Si l'extracteur ne sait pas lire cette gate, il LÈVE et le test tombe : c'est le bon sens
      // de l'échec, et ça force à étendre l'extracteur plutôt qu'à le laisser perdre en silence.
      const declaration = famillesDeclarees(script);
      // `null` = aucune famille déclarée, établi par l’extracteur (il LÈVE si le mot `FAMILLES`
      // apparaît sans déclaration reconnue). Rien à confondre.

      // ⚠️ UNE LISTE CALCULÉE NE SE LIT PAS DANS LA SOURCE. `gov-publication.ts:118` fait
      // `['doctrine', ...CHIFFRES.map(…)]` : l’extracteur en voit UNE sur sept. Asserter
      // `not.toContain` sur un septième serait un vert obtenu sur presque rien.
      // On assert alors ce qui reste VRAI et vérifiable : le jeton n’apparaît nulle part dans
      // le fichier — donc il ne peut pas non plus sortir du calcul. C’est plus faible, et c’est
      // DIT. *Une garde qui ne peut pas tout prouver dit ce qu’elle prouve.*
      // 🔑 `null` (aucune liste de familles) et « liste calculée » sont le MÊME cas pour une
      // assertion NÉGATIVE : dans les deux, l'absence dans la liste ne prouve rien. Rendre la
      // main ici — ce que faisait `if (declaration === null) return;` — c'était le défaut du
      // 25e tour DÉPLACÉ, pas fermé : le test affichait `✓` sous le nom de la garde sans rien
      // asserter (`schema`, 26e tour : mutation additive `famille: 'perimetre_illisible'` dans
      // `gov-identifiants.ts` → `5 passed`, identique au banc sain). On retombe donc sur le
      // balayage de la SOURCE ENTIÈRE : plus faible, et DIT.
      if (declaration === null || declaration.calculee) {
        expect(
          readFileSync(script, 'utf8'),
          `${script} : aucune liste de familles lisible (null ou calculée), et le jeton ` +
            `perimetre_illisible apparaît quand même dans la source`
        ).not.toContain('perimetre_illisible');
        return;
      }

      // CONTRÔLE POSITIF : une liste d’un seul nom satisferait le `not.toContain` sans rien lire.
      expect(
        declaration.noms.length,
        `${script} : ${declaration.noms.length} famille(s) extraite(s) — trop peu pour que l’absence prouve quoi que ce soit`
      ).toBeGreaterThanOrEqual(2);

      expect(
        declaration.noms,
        `${script} déclare perimetre_illisible comme famille de FAUTE. C’est un refus de PRÉCONDITION : ` +
          'il sort avant toute analyse, donc `--prove` ne pourra jamais lui trouver de témoin.'
      ).not.toContain('perimetre_illisible');
    });
  }
});
