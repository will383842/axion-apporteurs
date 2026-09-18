// @req REQ-GOV-012
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
import { spawnSync } from 'node:child_process';
import {
  controler,
  confronterDisqueEtRegistre,
  perimetresDe,
  lireVue,
  MOTIF_MINIMAL,
  VUE_CONFORME,
  CI_CONFORME,
  type Vue,
} from '../../../scripts/gates/gov-conventions';

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
    expect(refus).toContain('outils/ajouter-entree.mjs');
    expect(refus).not.toContain('outils/reecrire-champ.mjs');
    expect(refus).not.toContain('outils/poser-champ.mjs');
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
    expect(sortie).toContain(`${c.surLeDisque.length}`);
    expect(sortie).toContain(`${c.jugees.length}`);
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
