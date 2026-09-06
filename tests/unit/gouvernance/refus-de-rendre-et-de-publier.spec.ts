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
import {
  readFileSync,
  existsSync,
  writeFileSync,
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
      // TÉMOINS D’EFFET en fin de fichier — pour les DEUX modes : le verdict ET le rendu.
      // ⚠️ Ma première version n’exerçait que le verdict, et `schema` comme `exactitude` ont
      // mesuré que le mutant du bloc `--render` redevenait VIVANT : rouge au parent, vert ici.
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
      total: 5,
      temoins: 1,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE, mesurée par `mutation` au 12e tour.',
    },
    'scripts/gates/lexique-apporteurs.ts': {
      total: 2,
      temoins: 0,
      raison: '⛔ AUCUN témoin d’effet. Dette DÉCLARÉE.',
    },
    'scripts/gates/gov-entite.ts': {
      total: 6,
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
    expect(total, 'le total déclaré a changé sans que le test ci-dessus rougisse').toBe(25);
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
        { encoding: 'utf8', stdio: 'pipe', shell: true }
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
 * ⚠️ Ce que ces témoins NE couvrent PAS, écrit ici plutôt que promis ailleurs : `gov:pr` — la
 * surface qui AUTORISE, et celle dont la neutralisation laisse passer une PR SANS AUCUNE REVUE.
 * 🔴 **Ma première rédaction de cette déclaration était fausse deux fois**, mesuré par
 * `exactitude` au 21e tour : `.github/workflows/` n'est PAS une entrée de `gov:pr` (il n'y a qu'un
 * test de préfixe sur les noms de fichiers modifiés, `gov-pr.ts:91`), et `.claude/agents/`, qui en
 * est une vraie hors `docs/` (`readdirSync`, `gov-pr.ts:650`), était omis.
 * **Et l'obstacle que j'avais nommé n'était pas le bon** : ce n'est pas un inventaire de fichiers.
 * Sous `--pr`, `gov-pr.ts:667`, `:681` et `:744` appellent `gh` et `git` — **un dépôt jetable de
 * fichiers ne la fait pas tourner**. Son témoin d'effet demande de simuler la forge, pas de copier
 * des fichiers. C'est plus cher que je ne l'avais écrit, et c'est la première tâche du lot suivant.
 * *Déclarer une lacune ne dispense pas de mesurer ce qui la cause — une déclaration fausse est une
 * dette qu'on ne saura pas payer.*
 */
function depotJetableAvec(fichiers: readonly string[]): string {
  const depot = mkdtempSync(join(tmpdir(), 'temoin-effet-'));
  for (const f of fichiers) {
    mkdirSync(join(depot, dirname(f)), { recursive: true });
    copyFileSync(f, join(depot, f));
  }
  return depot;
}

function lancerLaGate(script: string, cwd: string, args: string[] = []): { code: number; sortie: string } {
  try {
    const stdout = execFileSync('npx', ['tsx', resolve(script), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
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
    vue: 'docs/TASKS.md',
    script: 'scripts/gates/gov-tasks.ts',
    fichiers: [
      'docs/tasks.json',
      'docs/TASKS.md',
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
    vue: 'docs/REQUIREMENTS.md',
    script: 'scripts/gates/gov-requirements.ts',
    fichiers: [
      'docs/requirements.json',
      'docs/REQUIREMENTS.md',
      'docs/tasks.json',
      'docs/DECISIONS.md',
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
        famille: 'id',
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
] as const;

describe('REQ-GOV-032 — TÉMOINS D’EFFET : une gate neutralisée ne peut pas rester verte', () => {
  for (const { nom, script, fichiers, fautes } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom}\` SORT en échec sur une faute RÉELLE de famille \`${famille}\`, et 0 sans elle`, () => {
        // CONTRÔLE POSITIF D'ABORD. Sans lui, une gate qui refuserait TOUT rendrait ce témoin vert
        // pour la mauvaise raison — un fichier d'entrée manquant, un chemin qui ne résout plus.
        const sain = depotJetableAvec(fichiers);
        const avant = lancerLaGate(script, sain);
        expect(
          avant.code,
          `${nom} refuse un dépôt SAIN (code ${avant.code}) — le témoin ne mesurerait rien :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);

        const casse = depotJetableAvec(fichiers);
        appliquer(casse);
        const apres = lancerLaGate(script, casse);
        expect(
          apres.code,
          `${nom} n’est PAS sortie en échec sur une faute \`${famille}\` — elle a imprimé :\n${apres.sortie.slice(0, 600)}`
        ).not.toBe(0);
        // Et pour LA bonne raison : un refus d'une AUTRE famille ne prouverait rien de celle-ci.
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
  for (const { nom, script, fichiers, fautes, vue } of GATES_A_TEMOIN_D_EFFET) {
    for (const { famille, appliquer } of fautes) {
      it(`REQ-GOV-032 — \`${nom} --render\` REFUSE et n’écrit PAS \`${vue}\` sur une faute \`${famille}\``, () => {
        // CONTRÔLE POSITIF : sur une source saine, le rendu doit RÉUSSIR.
        const sain = depotJetableAvec(fichiers);
        const avant = lancerLaGate(script, sain, ['--render']);
        expect(
          avant.code,
          `${nom} --render refuse une source SAINE (code ${avant.code}) :\n${avant.sortie.slice(0, 600)}`
        ).toBe(0);

        const casse = depotJetableAvec(fichiers);
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
