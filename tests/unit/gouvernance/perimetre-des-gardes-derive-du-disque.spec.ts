// @req REQ-GOV-012
// @req REQ-GOV-010
/**
 * GOV-044 — une garde absente du registre s'exempte elle-même de la garde qui vérifie qu'on
 * l'appelle.
 *
 * LE DÉFAUT, ET SA FORME. La famille `garde_ecrite_jamais_appelee` de `gov:conventions` tirait sa
 * population du REGISTRE (`docs/gates.json`). Un script de garde absent du registre n'était donc
 * jamais confronté à la question de savoir si quelqu'un l'appelle : le trou s'exemptait lui-même,
 * en silence, et la garde sortait en zéro. C'est la forme exacte du défaut que le lot L-1-05
 * venait de renverser ailleurs (`GARDES_QUI_BALAIENT`) — *une population dérivée de la présence du
 * correctif ne verra jamais celui qui le PERD.*
 *
 * CE QUE CE FICHIER GARDE. Le périmètre part du DISQUE — les fichiers `scripts/gates/*.ts` SUIVIS
 * PAR GIT — et le registre devient ce qu'on lui confronte. Les deux populations sont comptées et
 * RENDUES ; une garde écrite que le registre ne nomme pas est un refus NOMMÉ ; l'inverse — une
 * entrée de registre sans script — reste chez son propriétaire, `gates:prouvees`.
 *
 * ⚠️ CE FICHIER N'ASSERTE AUCUNE ORTHOGRAPHE. Une garde qui connaît un mot ne connaît pas un
 * comportement : chaque témoin ci-dessous EXÉCUTE `controler()`, `confronterDisqueEtRegistre()`,
 * `perimetresDe()` ou le script entier, et lit ce qu'ils PRODUISENT. Les trois appelants du
 * périmètre dérivé sont exercés séparément, parce qu'une règle déplacée se contourne d'autant de
 * crans qu'on l'a déplacée.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  controler,
  confronterDisqueEtRegistre,
  perimetresDe,
  lireVue,
  DOSSIER_DES_GARDES,
  EXTENSION_DES_GARDES,
  MOTIF_MINIMAL,
  VUE_CONFORME,
  CI_CONFORME,
  type GateVue,
  type Vue,
} from '../../../scripts/gates/gov-conventions';
import {
  VERBES_HORS_DEPOT,
  cheminsReserves,
  outilHorsDepot,
} from '../../../scripts/lot/chemins-de-tache';
import { readFileSync as lireFichier } from 'node:fs';

const SCRIPT = 'scripts/gates/gov-conventions.ts';

function lancer(chemin: string, ...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', chemin, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** Les messages rougis par une vue, pour vérifier que le refus NOMME ce qu'il refuse. */
function messages(vue: Vue): string[] {
  return controler(vue).map((f) => f.message);
}

/**
 * Le nombre qu'une ligne « • » du rendu porte derrière SON libellé, ou `null` si la ligne manque.
 * Lié au libellé, pas cherché n'importe où : un compte ne se prouve que là où il est annoncé.
 */
function compteRendu(sortie: string, libelle: string): number | null {
  const ligne = sortie
    .split(/\r?\n/)
    .find((l) => l.trimStart().startsWith('•') && l.includes(libelle));
  if (!ligne) return null;
  const m = /\s:\s(\d+)(?:\s—|\s*$)/.exec(ligne.slice(ligne.indexOf(libelle)));
  return m ? Number(m[1]) : null;
}

/** Une vue conforme dont on ne change QUE ce que le témoin fait varier (RM-11). */
function variante(patch: Partial<Vue>): Vue {
  return { ...VUE_CONFORME, ...patch };
}

/**
 * Trois gardes écrites de plus, et un workflow qui les lance toutes les trois. La substitution est
 * UNIQUE : on ajoute trois étapes à `CI_CONFORME` sans toucher à celle qui lance `gov:conventions`
 * — un témoin qui remplace tout le workflow ferait disparaître cet appel et rougirait AUSSI sur
 * `garde_ecrite_jamais_appelee`, donc ne prouverait plus rien (RM-11).
 */
const TROIS_GARDES = ['gov:alpha', 'gov:beta', 'gov:gamma'] as const;
const CHEMIN = (nom: string) => `scripts/gates/${nom.replace(':', '-')}.ts`;
const CI_TROIS = CI_CONFORME.replace(
  '      - name: Conventions transposees\n',
  TROIS_GARDES.map((n) => `      - name: ${n}\n        run: pnpm ${n}\n`).join('') +
    '      - name: Conventions transposees\n'
);
/** Les trois gardes écrites sur le disque, toutes suivies. */
const SUIVIS_TROIS = [...VUE_CONFORME.fichiersSuivis, ...TROIS_GARDES.map(CHEMIN)];
/** Les entrées de registre des trois — la base à laquelle chaque témoin retire une ligne. */
const GATES_TROIS = [
  ...VUE_CONFORME.gates,
  ...TROIS_GARDES.map((id) => ({ id, phase: -1, script: CHEMIN(id) })),
];

describe('REQ-GOV-012 — le périmètre des gardes se dérive du DISQUE, le registre s’y confronte', () => {
  it('la population de départ est celle des fichiers suivis, recomptée hors de sa fonction', () => {
    // Recompte INDÉPENDANT : `git ls-files` lu ici, pas la fonction qu'on juge. Une dérivation
    // qui rend le mauvais ensemble passerait une égalité qu'elle calculerait elle-même.
    const r = spawnSync('git', ['ls-files', 'scripts/gates/'], { encoding: 'utf8' });
    const sous = (r.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
    const attendu = sous.filter((f) => f.endsWith('.ts')).sort();

    const c = confronterDisqueEtRegistre(lireVue());

    // PLANCHER. Dériver un nombre ne le garde pas : une dérivation qui rend le vide sortirait en
    // zéro et se lirait comme « aucune garde en faute ». C'est la quatrième fois que ce dépôt
    // rencontre cette forme.
    expect(attendu.length).toBeGreaterThan(0);
    expect([...c.surLeDisque].sort()).toEqual(attendu);
  });

  it('une garde écrite et suivie que le registre ne nomme pas est un refus NOMMÉ', () => {
    // La garde manquante est au MILIEU des trois, jamais la dernière : un témoin construit contre
    // le dernier élément d'une liste ne distingue pas « toutes » de « la dernière ».
    const vue = variante({
      workflows: [{ chemin: '.github/workflows/ci.yml', source: CI_TROIS }],
      fichiersSuivis: SUIVIS_TROIS,
      gates: GATES_TROIS.filter((g) => g.id !== 'gov:beta'),
    });
    expect(familles(vue)).toEqual(['garde_hors_registre']);
    expect(messages(vue).join('\n')).toContain(CHEMIN('gov:beta'));
    // Et les deux voisines, elles, ne sont pas nommées : le refus désigne la faute, pas la liste.
    expect(messages(vue).join('\n')).not.toContain(CHEMIN('gov:alpha'));
  });

  it('le refus propose le verbe qui CRÉE une entrée, jamais un verbe qui refuse une entrée absente', () => {
    // Mesuré le 2026-09-18 : le refus conseillait `reecrire-champ.mjs`, qui répond « aucune entrée
    // … dans docs/gates.json » sur exactement le cas que ce refus décrit. Un message qui propose le
    // mauvais geste est un piège poli : on le suit, il refuse, et le trou reste ouvert.
    const vue = variante({
      workflows: [{ chemin: '.github/workflows/ci.yml', source: CI_TROIS }],
      fichiersSuivis: SUIVIS_TROIS,
      gates: GATES_TROIS.filter((g) => g.id !== 'gov:beta'),
    });
    const refus = messages(vue).join('\n');
    // ⚠️ CE TÉMOIN ÉPINGLAIT LA FORME FAUSSE — GOV-090, 2026-09-22. Il assertait
    // le verbe d'ajout préfixé d'un dossier que ce dépôt n'a pas : un chemin qui ne résout
    // depuis AUCUN arbre. (La forme fautive n'est pas recopiée ici : `citation-d-outil-hors-depot`
    // balaie les fichiers suivis, ce commentaire compris, et il n'a aucune exception.) Il
    // garantissait donc que le refus continue de nommer l'outil là où il n'est pas, et il serait
    // resté VERT pendant que quatre messages rouges envoyaient leurs lecteurs dans le vide. Un
    // témoin écrit pour PASSER, pas pour mesurer — alors que l'en-tête de ce fichier dit
    // « CE FICHIER N'ASSERTE AUCUNE ORTHOGRAPHE ».
    //
    // CE QU'IL MESURE MAINTENANT — le discriminant est STRUCTUREL au lieu d'être orthographique :
    // le verbe PRESCRIT est rendu par `outilHorsDepot()`, donc QUALIFIÉ et résolvable ; les deux
    // verbes seulement NOMMÉS — ceux qui refusent une entrée absente — restent en nom nu. La
    // différence de FORME porte la différence de SENS, et c'est elle qu'on lit.
    expect(refus).toContain(outilHorsDepot('ajouter-entree.mjs'));
    expect(refus).not.toContain(outilHorsDepot('reecrire-champ.mjs'));
    expect(refus).not.toContain(outilHorsDepot('poser-champ.mjs'));
    // Et le refus ne repart jamais en chemin relatif au dépôt, quel que soit le verbe.
    for (const verbe of VERBES_HORS_DEPOT) expect(refus).not.toContain('out' + 'ils/' + verbe);
  });

  it('les trois gardes inscrites et câblées laissent le contrôle vert — contre-témoin', () => {
    // Sans lui, le témoin précédent ne prouverait rien : une règle qui rougit sur toute garde
    // écrite serait désarmée le jour même (RM-02).
    const vue = variante({
      workflows: [{ chemin: '.github/workflows/ci.yml', source: CI_TROIS }],
      fichiersSuivis: SUIVIS_TROIS,
      gates: GATES_TROIS,
    });
    expect(familles(vue)).toEqual([]);
    expect(confronterDisqueEtRegistre(vue).horsRegistre).toEqual([]);
  });

  it('sur l’arbre RÉEL, toute garde écrite hors registre est NOMMÉE, et les deux comptes tiennent', () => {
    // ⚠️ L'INVARIANT, PAS LE COMPTE DU JOUR. Au 2026-09-17, `horsRegistre` vaut DEUX sur ce dépôt —
    // `gov-attestation.ts` et `gov-attributions.ts`, tous deux écrits, suivis, absents de
    // `docs/gates.json`, pendant que `gov:conventions` sortait en ZÉRO. Le second est apparu PENDANT
    // qu'on décrivait le premier (PR 45, 2026-09-16) : un registre tenu à la main se périme en
    // s'écrivant, et c'est la thèse de GOV-044. Ce compte est DATÉ, il vit dans le corps de la PR et
    // dans le journal — l'écrire ici ferait rougir la suite le jour où les deux entrées seront
    // versées, c'est-à-dire pour la bonne nouvelle.
    // Ce qui est gardé ici est ce qui reste vrai des deux côtés : ce que la confrontation trouve,
    // le contrôle le NOMME, sans en perdre ni en inventer.
    const vue = lireVue();
    const c = confronterDisqueEtRegistre(vue);
    const nommees = controler(vue)
      .filter((f) => f.famille === 'garde_hors_registre')
      .map((f) => f.message.split(' ')[0]);
    expect(nommees.sort()).toEqual([...c.horsRegistre].sort());
    expect(c.surLeDisque.length).toBeGreaterThan(0);
    expect(c.jugees.length).toBeGreaterThan(0);
  });

  it('le décompte des deux populations est RENDU par le script, pas seulement calculé', () => {
    // Le troisième appelant. Un compte qu'on calcule sans l'imprimer ne se relit pas : c'est
    // l'absence de rendu qui a laissé `qualiopi:isolation-check` cumuler 88 violations en silence.
    const vue = lireVue();
    const c = confronterDisqueEtRegistre(vue);
    const { code, sortie } = lancer(SCRIPT);
    // Le verdict SUIT les fautes : un rendu qui imprime ses comptes et sort en zéro quand même
    // serait le défaut d'origine déplacé d'un cran.
    expect(code === 0).toBe(controler(vue).length === 0);
    expect(sortie).toContain('DISQUE');
    // Chaque nombre est lu SUR SA LIGNE, derrière SON libellé. Cherché comme sous-chaîne n'importe
    // où, « 26 » était satisfait par « 260 tâche(s) », et un compte à zéro ne se vérifiait pas du
    // tout (dette 2 de la revue A10 5248720022).
    expect(compteRendu(sortie, 'suivies par git')).toBe(c.surLeDisque.length);
    expect(compteRendu(sortie, 'JUGÉES sur leur câblage')).toBe(c.jugees.length);
    expect(compteRendu(sortie, 'registre ne nomme PAS')).toBe(c.horsRegistre.length);
    expect(compteRendu(sortie, 'HORS périmètre')).toBe(c.entreesSansScript.length);
    expect(compteRendu(sortie, "l'extension exclut de la population de départ")).toBe(
      c.horsExtension.length
    );
    for (const f of c.horsRegistre) expect(sortie).toContain(f);
  });

  it('le périmètre compté est celui du disque, et il est exposé par `perimetresDe`', () => {
    // Le deuxième appelant. Le compte du périmètre et celui de la confrontation sont la MÊME
    // dérivation : s'ils divergent, l'un des deux ment sans qu'on sache lequel.
    const vue = lireVue();
    const p = perimetresDe(vue).find((x) => x.cle === 'gardes-du-disque');
    expect(p).toBeDefined();
    expect(p!.compte).toBe(confronterDisqueEtRegistre(vue).surLeDisque.length);
    expect(p!.compte).toBeGreaterThan(0);
  });
});

/**
 * LA FORME DU VRAI REGISTRE — refus A10 mutation, revue 5248720022 (PR 54, 2026-09-18).
 *
 * Tous les témoins ci-dessus tournent sur des registres injectés dont chaque entrée est
 * `{ id, phase, script }`, sans `alias` ni `horsCi`. Le vrai `docs/gates.json` porte des entrées À
 * ALIAS sous `scripts/gates/`. Deux mutants l'ont exploité, spec, `--prove` et suite verts :
 *   M4b — `horsRegistre` absout tout script dès qu'UNE entrée du registre porte un alias ;
 *   M4c — le jugement du câblage absout toute entrée qui porte un alias.
 * Sous l'un comme sous l'autre, une vraie faute (entrée retirée, garde neuve sans entrée, garde à
 * alias décâblée de `ci.yml`) sortait en ZÉRO. Et le seul témoin sur l'arbre réel comparait
 * `controler()` à `confronterDisqueEtRegistre()` — la fonction à elle-même.
 *
 * Ces témoins partent donc du registre RÉEL (`lireVue()`, alias et `horsCi` compris), et chacun
 * n'y change qu'une chose. Ils jugent la DIFFÉRENCE avec l'état du dépôt, pas l'état lui-même :
 * une faute du jour déjà présente ne doit ni les faire rougir ni les rendre aveugles.
 */
describe('REQ-GOV-012 — sur la FORME du vrai registre, alias et `horsCi` compris, la faute est vue', () => {
  const clef = (f: { famille: string; message: string }) => `${f.famille}|${f.message}`;
  const nomsDe = (g: GateVue): string[] => [g.id, g.script, ...(g.alias ?? [])];
  /** Retire toute ligne qui NOMME la garde : elle n'est plus appelée nulle part, rien d'autre ne bouge. */
  const decabler = (texte: string, noms: readonly string[]): string =>
    texte
      .split('\n')
      .filter((l) => !noms.some((n) => l.includes(n)))
      .join('\n');

  const reel = lireVue();
  const c = confronterDisqueEtRegistre(reel);
  const deBase = new Set(controler(reel).map(clef));
  /** Les fautes qu'une variante AJOUTE à celles de l'état du dépôt. */
  const ajoutees = (v: Vue) => controler(v).filter((f) => !deBase.has(clef(f)));
  /** Les gardes écrites que le registre nomme — celles dont on peut retirer l'entrée. */
  const inscrites = c.surLeDisque.filter((s) => reel.gates.some((g) => g.script === s));
  /** Les entrées JUGÉES qui portent un alias et aucune déclaration `horsCi`. */
  const aAlias = c.jugees.filter((g) => (g.alias ?? []).length > 0 && !(g.horsCi ?? '').trim());

  it('PLANCHER : le registre réel porte des entrées à alias sous le dossier des gardes', () => {
    // Sans elles, les témoins suivants ne diraient rien de la forme qu'ils prétendent couvrir.
    expect(
      reel.gates.filter(
        (g) => g.script.startsWith(DOSSIER_DES_GARDES) && (g.alias ?? []).length > 0
      ).length
    ).toBeGreaterThan(0);
    expect(inscrites.length).toBeGreaterThan(2);
    expect(aAlias.length).toBeGreaterThan(0);
  });

  it('retirer l’entrée de CHAQUE garde inscrite la fait NOMMER, elle et elle seule', () => {
    // Toutes, pas seulement le milieu : un témoin qui n'en retire qu'une ne distingue pas « la
    // garde confronte chaque script » de « la garde confronte ceux que ce témoin a choisis ».
    for (const script of inscrites) {
      const v: Vue = { ...reel, gates: reel.gates.filter((g) => g.script !== script) };
      const n = ajoutees(v);
      expect(
        n.map((f) => f.famille),
        script
      ).toEqual(['garde_hors_registre']);
      expect(n[0]!.message.startsWith(`${script} `), script).toBe(true);
    }
  });

  it('une garde NEUVE, suivie, sans entrée au registre réel, est nommée', () => {
    const neuve = `${DOSSIER_DES_GARDES}gov-temoin-neuve${EXTENSION_DES_GARDES}`;
    const n = ajoutees({ ...reel, fichiersSuivis: [...reel.fichiersSuivis, neuve] });
    expect(n.map((f) => f.famille)).toEqual(['garde_hors_registre']);
    expect(n[0]!.message.startsWith(`${neuve} `)).toBe(true);
  });

  it('décâbler une garde PORTEUSE d’alias la fait rougir en `garde_ecrite_jamais_appelee`', () => {
    // Chacune des gardes à alias : l'alias est un moyen d'être APPELÉE, jamais une absolution.
    for (const g of aAlias) {
      const noms = nomsDe(g);
      const v: Vue = {
        ...reel,
        workflows: reel.workflows.map((w) => ({ ...w, source: decabler(w.source, noms) })),
        hooks: decabler(reel.hooks, noms),
      };
      const siennes = ajoutees(v).filter(
        (f) => f.famille === 'garde_ecrite_jamais_appelee' && f.message.startsWith(`\`${g.id}\``)
      );
      expect(siennes.length, g.id).toBe(1);
    }
  });
});

/**
 * LE MÊME REGISTRE RÉEL, JUGÉ PAR L'ACTE : le script lancé dans un arbre jetable qui est un VRAI
 * dépôt git (copie des fichiers suivis, index posé), et son CODE DE SORTIE lu. Un refus qui imprime
 * sans sortir en 1 ne bloque rien en Gate A (dette 3 de la même revue).
 */
describe('REQ-GOV-012 — dans un dépôt jetable au registre réel, la faute sort en 1', () => {
  function bac(): string {
    const racine = realpathSync.native(mkdtempSync(join(tmpdir(), 'g44-')));
    const suivis = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    for (const f of suivis) {
      mkdirSync(dirname(join(racine, f)), { recursive: true });
      writeFileSync(join(racine, f), readFileSync(f));
    }
    execFileSync('git', ['init', '-q'], { cwd: racine });
    execFileSync('git', ['add', '-A'], { cwd: racine });
    symlinkSync(realpathSync('node_modules'), join(racine, 'node_modules'), 'junction');
    return racine;
  }
  function lancerDans(racine: string): { code: number; sortie: string } {
    const r = spawnSync('npx', ['tsx', SCRIPT], { cwd: racine, encoding: 'utf8', shell: true });
    return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
  }
  const famillesRendues = (sortie: string) =>
    [...new Set([...sortie.matchAll(/^\s+\[([a-z_]+)\] /gm)].map((m) => m[1]))].sort();

  it('REQ-GOV-012 — sain → 0 ; entrée du MILIEU retirée, garde neuve, garde à alias décâblée → 1, en la nommant', () => {
    const reel = lireVue();
    const c = confronterDisqueEtRegistre(reel);
    const inscrites = c.surLeDisque.filter((s) => reel.gates.some((g) => g.script === s));
    const milieu = inscrites[Math.floor(inscrites.length / 2)]!;
    const aAlias = c.jugees.filter((g) => (g.alias ?? []).length > 0 && !(g.horsCi ?? '').trim());
    // La promesse de cette PR est « phase 0 non câblée → rouge » : on prend d'abord une garde de
    // phase 0 ou plus, sinon la première à alias.
    const decablee = aAlias.find((g) => g.phase >= 0) ?? aAlias[0]!;
    expect(decablee).toBeDefined();

    const racine = bac();
    const a = (f: string) => join(racine, f);
    try {
      // Contre-témoin : sans lui, aucun des trois rouges ne prouverait quoi que ce soit.
      const sain = lancerDans(racine);
      expect(sain.code, sain.sortie).toBe(0);

      // F1 — l'entrée (ou les entrées) du script du MILIEU retirée(s) du vrai registre.
      const registre = readFileSync(a('docs/gates.json'), 'utf8');
      const doc = JSON.parse(registre) as { gates: GateVue[] };
      writeFileSync(
        a('docs/gates.json'),
        JSON.stringify({ ...doc, gates: doc.gates.filter((g) => g.script !== milieu) }, null, 2)
      );
      const f1 = lancerDans(racine);
      expect(f1.code, f1.sortie).toBe(1);
      expect(famillesRendues(f1.sortie)).toEqual(['garde_hors_registre']);
      expect(f1.sortie).toContain(`[garde_hors_registre] ${milieu} `);
      expect(compteRendu(f1.sortie, 'registre ne nomme PAS')).toBe(1);
      writeFileSync(a('docs/gates.json'), registre);

      // F2 — une garde neuve, mise à l'index, que le registre ne nomme pas.
      const neuve = `${DOSSIER_DES_GARDES}gov-temoin-neuve${EXTENSION_DES_GARDES}`;
      writeFileSync(a(neuve), 'export {};\n');
      execFileSync('git', ['add', neuve], { cwd: racine });
      const f2 = lancerDans(racine);
      expect(f2.code, f2.sortie).toBe(1);
      expect(famillesRendues(f2.sortie)).toEqual(['garde_hors_registre']);
      expect(f2.sortie).toContain(`[garde_hors_registre] ${neuve} `);
      execFileSync('git', ['rm', '-q', '--cached', neuve], { cwd: racine });
      unlinkSync(a(neuve));

      // F4 — la garde à alias retirée de chaque workflow qui l'appelait.
      const noms = [decablee.id, decablee.script, ...(decablee.alias ?? [])];
      for (const w of reel.workflows) {
        const texte = readFileSync(a(w.chemin), 'utf8');
        writeFileSync(
          a(w.chemin),
          texte
            .split('\n')
            .filter((l) => !noms.some((n) => l.includes(n)))
            .join('\n')
        );
      }
      const f4 = lancerDans(racine);
      expect(f4.code, f4.sortie).toBe(1);
      expect(f4.sortie).toContain(`[garde_ecrite_jamais_appelee] \`${decablee.id}\``);
    } finally {
      // Le lien d'abord, seul : effacer l'arbre ne doit jamais descendre dans le `node_modules` réel.
      unlinkSync(join(racine, 'node_modules'));
      rmSync(racine, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('REQ-GOV-012 — la décision sur le filtre de phase, écrite et GARDÉE', () => {
  /**
   * Le filtre `g.phase <= -1` était un PROXY de « cette garde est déjà écrite », le seul dont on
   * disposait quand la population venait du registre. La population vient du disque : le proxy est
   * remplacé par le fait. Ces trois témoins gardent CE choix — sans eux, on ne saurait pas si le
   * filtre a été décidé ou simplement perdu.
   */
  const gateDePhaseZero = { id: 'gov:zero', phase: 0, script: CHEMIN('gov:zero') };

  it('une garde de phase 0, écrite et suivie, que rien n’appelle ROUGIT — le filtre est bien levé', () => {
    const vue = variante({
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, CHEMIN('gov:zero')],
      gates: [...VUE_CONFORME.gates, gateDePhaseZero],
    });
    expect(familles(vue)).toEqual(['garde_ecrite_jamais_appelee']);
    expect(messages(vue).join('\n')).toContain('gov:zero');
  });

  it('la même garde de phase 0, CÂBLÉE, reste verte — la levée ne fabrique aucun faux rouge', () => {
    const vue = variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            '      - name: Conventions transposees\n',
            '      - name: Zero\n        run: pnpm gov:zero\n      - name: Conventions transposees\n'
          ),
        },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, CHEMIN('gov:zero')],
      gates: [...VUE_CONFORME.gates, gateDePhaseZero],
    });
    expect(familles(vue)).toEqual([]);
  });

  it('une garde promise à une phase FUTURE et pas encore écrite reste hors périmètre, en silence', () => {
    // CE QUE LE FILTRE PROTÉGEAIT RESTE PROTÉGÉ, et par une meilleure clause : « pas encore
    // écrite » ne se lit plus dans un numéro de phase, il se lit sur le disque.
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'partners:rgpd:export-complet', phase: 3, script: CHEMIN('gov:futur') },
      ],
    });
    expect(familles(vue)).toEqual([]);
    const c = confronterDisqueEtRegistre(vue);
    expect(c.jugees.map((g) => g.id)).not.toContain('partners:rgpd:export-complet');
    // …mais elle n'est pas PERDUE pour autant : elle est comptée dans ce qui est sorti.
    expect(c.entreesSansScript.map((g) => g.id)).toContain('partners:rgpd:export-complet');
  });
});

describe('REQ-GOV-012 — une garde délibérément HORS CI se DÉCLARE, elle ne se tait pas', () => {
  const motifSuffisant =
    'Ce contrôle interroge la forge par `gh` et rend la suite non déterministe : GOV-038 l’a ' +
    'délibérément laissé hors CI, et il se lance à la main avant une fusion.';
  const horsCi = (motif: string) => ({
    id: 'gov:en-ligne',
    phase: -1,
    script: CHEMIN('gov:en-ligne'),
    horsCi: motif,
  });
  const avec = (g: { id: string; phase: number; script: string; horsCi?: string }) =>
    variante({
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, CHEMIN('gov:en-ligne')],
      gates: [...VUE_CONFORME.gates, g],
    });

  it('sans câblage et sans déclaration : ROUGE', () => {
    expect(
      familles(avec({ id: 'gov:en-ligne', phase: -1, script: CHEMIN('gov:en-ligne') }))
    ).toEqual(['garde_ecrite_jamais_appelee']);
  });

  it('sans câblage mais AVEC un motif écrit : vert, et c’est la seule échappatoire', () => {
    expect(familles(avec(horsCi(motifSuffisant)))).toEqual([]);
  });

  it('un motif trop court n’est pas une déclaration : ROUGE, et le refus donne sa longueur', () => {
    // Même discipline que `perimetre_vide_sans_motif` : deux mots ne sont pas un motif. Sans ce
    // témoin, le champ deviendrait un mot de passe — `horsCi: "x"` et la garde se tait.
    const vue = avec(horsCi('hors CI'));
    expect(familles(vue)).toEqual(['garde_ecrite_jamais_appelee']);
    expect(messages(vue).join('\n')).toContain(`${MOTIF_MINIMAL}`);
  });
});

describe('REQ-GOV-012 — l’inverse reste chez son propriétaire, et il n’a pas bougé', () => {
  it('une entrée de registre dont le script n’est pas sur le disque ne rougit PAS ici', () => {
    // Deux gardes qui disent la même chose se contredisent un jour. Le tri des entrées sans
    // script — autre dépôt, phase future, entrée fautive — est porté par GOV-051, pas par ici.
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:derivation', phase: -1, script: 'scripts/gates/gov-derivation.ts' },
      ],
    });
    expect(familles(vue)).toEqual([]);
  });

  it('`gates:prouvees` porte toujours `script_introuvable`, et sa preuve tourne encore', () => {
    // Contre-témoin de NON-RÉGRESSION, exécuté et non épelé : on lance la preuve du propriétaire.
    const { code, sortie } = lancer('scripts/gates/gates-prouvees.ts', '--prove');
    expect(code).toBe(0);
    expect(sortie).toContain('script_introuvable');
  });
});

describe('REQ-GOV-012 — la limite de la dérivation est ÉCRITE, pas supposée', () => {
  it('un fichier de garde jamais mis à l’index est invisible, et le rendu le dit', () => {
    // RM-14. Le périmètre est `git ls-files`, pas `readdir` : une garde écrite et non ajoutée à
    // l'index ne se confronte à rien. On l'écrit plutôt que de la supposer.
    const vue = variante({ fichiersSuivis: VUE_CONFORME.fichiersSuivis });
    const c = confronterDisqueEtRegistre(vue);
    expect(c.surLeDisque).not.toContain(CHEMIN('gov:jamais-indexe'));
    expect(familles(vue)).toEqual([]);
  });

  it('les fichiers suivis sous `scripts/gates/` que l’extension exclut sont NOMMÉS', () => {
    // La population est `*.ts` : trois fichiers `.js` suivis vivent là et en sortent. Les taire
    // serait refaire, une extension plus loin, l'exemption silencieuse que cette tâche ferme.
    const c = confronterDisqueEtRegistre(lireVue());
    expect(c.horsExtension.length).toBeGreaterThan(0);
    const { sortie } = lancer(SCRIPT);
    for (const f of c.horsExtension) expect(sortie).toContain(f);
  });

  it('une garde `.js` NOMMÉE par le registre reste jugée sur son câblage', () => {
    // Elle sort de la population de DÉPART, pas du jugement : `notify-sink-hors-prod` est câblée
    // par `.claude/settings.json`, et la perdre affaiblirait la garde au lieu de l'étendre.
    const jsNonCable = variante({
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/hook-env.js'],
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'notify-sink-hors-prod', phase: -1, script: 'scripts/gates/hook-env.js' },
      ],
    });
    expect(familles(jsNonCable)).toEqual(['garde_ecrite_jamais_appelee']);

    const jsCable = variante({
      ...jsNonCable,
      hooks: '{"hooks":{"PreToolUse":[{"command":"node scripts/gates/hook-env.js"}]}}',
    });
    expect(familles(jsCable)).toEqual([]);
  });
});

/**
 * GOV-090 — LA MÊME FORME DE DÉFAUT, UN ÉTAGE PLUS BAS : une garde qui cesse de garder parce que
 * sa POPULATION se dérive d'une lecture fragile. Ici la population n'est pas un registre, c'est la
 * première colonne du tableau §7 de `docs/CHARTE-AGENTS.md`, que `gov:pr` LIT ligne par ligne.
 *
 * Elle est découpée sur la VIRGULE. Une virgule posée dans une parenthèse explicative coupait la
 * cellule en deux morceaux dont aucun n'était un chemin : la ligne cessait de garder son fichier
 * SANS QUE RIEN NE ROUGISSE. Mesuré le 2026-09-22 en écrivant les deux lignes de
 * `partners/ADR-0018` : `docs/requirements.json` rendait deux faux chemins et ZERO chemin gardé.
 * C'est le même défaut que celui de l'en-tête de ce fichier — le trou s'exemptait lui-même.
 */
describe('REQ-GOV-010 — le tableau des chemins réservés est LU, donc il a une grammaire', () => {
  const charte = () => lireFichier('docs/CHARTE-AGENTS.md', 'utf8');

  it('REQ-GOV-010 — la charte du dépôt rend des chemins qui existent, jamais de la prose', () => {
    const lus = cheminsReserves(charte());
    // PLANCHER : une lecture qui rendrait le vide se lirait comme « aucun chemin réservé », et la
    // famille entière serait inerte en restant verte.
    expect(lus.length).toBeGreaterThan(0);
    const chemins = lus.flatMap((r) => r.chemins);
    expect(chemins.length).toBeGreaterThan(0);
    for (const c of chemins) {
      // Un chemin ne porte ni espace, ni parenthèse résiduelle, ni point-virgule : tout cela est
      // de la prose qui a survécu au découpage, donc un chemin que personne ne gardera jamais.
      expect(c, `« ${c} » n'est pas un chemin`).not.toMatch(/[\s();]/);
    }
    // Les deux SOURCES que `partners/ADR-0018` fait entrer sont bien gardées, et les deux VUES
    // qu'il fait sortir ne le sont plus. C'est la décision, relue dans ce que la garde LIT.
    expect(chemins).toContain('docs/requirements.json');
    expect(chemins).toContain('docs/gates.json');
    expect(chemins).not.toContain('docs/PLAN-STATE.md');
    expect(chemins).not.toContain('docs/REQUIREMENTS.md');
  });

  it('REQ-GOV-010 — une virgule dans une parenthèse ne fait pas perdre le chemin', () => {
    // LE PIÈGE, REJOUÉ SUR UNE CHARTE FABRIQUÉE : même ligne, même label, une parenthèse qui porte
    // une virgule. Avant le correctif, `docs/tasks.json` disparaîssait de la population.
    const piegee = charte().replace(
      '| `docs/tasks.json` |',
      '| `docs/tasks.json` (**source**, sa vue est `docs/TASKS.md`) |'
    );
    expect(piegee, "la ligne visée n'existe plus : ce témoin ne mesure rien").not.toBe(charte());
    const chemins = cheminsReserves(piegee).flatMap((r) => r.chemins);
    expect(chemins).toContain('docs/tasks.json');
    for (const c of chemins) expect(c).not.toMatch(/[\s();]/);
  });
});
