// @req REQ-GOV-018
// @req REQ-GOV-029
/**
 * GOV-014 — les conventions, et le sort de chaque garde d'axionia.
 *
 * POURQUOI CE FICHIER EXISTE. `docs/tasks.json` promet ce nom de fichier pour les deux exigences
 * de GOV-014. Il porte donc DEUX choses qui n'ont pas la même nature :
 *
 *   — REQ-GOV-018 : `docs/CONVENTIONS.md` FIXE une liste de points. Un document ne s'exécute pas ;
 *     ce qui s'exécute, c'est la vérification qu'il porte chacun des points, et surtout que les
 *     termes qu'il fixe sont ceux que l'acceptation de la tâche nomme — DÉRIVÉS d'elle, jamais
 *     retapés ici (RM-01). Si l'acceptation change, ce test change avec elle, tout seul.
 *   — REQ-GOV-029 : chaque garde candidate a une DÉCISION motivée, et toute garde retenue a été
 *     vue rougir. La liste des gardes candidates est extraite du texte de REQ-GOV-029 dans
 *     `docs/REQUIREMENTS.md` : recopier les sept noms ici aurait fait exactement la faute que
 *     RM-01 interdit, et aurait laissé le registre se désaligner de son exigence en silence.
 *
 * GOV-031 y ajoute trois blocs, en fin de fichier : la configuration ESLint exécutée, l'outillage
 * épinglé et les étapes de Gate A jugés sur le disque, et ce que la configuration FAIT à chaque
 * fichier suivi. La COHÉRENCE (bloquantes, épinglées) se prouve sur des vues INJECTÉES (RM-11) ; la
 * PRÉSENCE et l'ACTE se jugent sur les fichiers réels.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ESLint, type Linter } from 'eslint';
import { getFileInfo, resolveConfig } from 'prettier';
import { parsers as analyseursYaml } from 'prettier/plugins/yaml';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierEslint from 'eslint-config-prettier';
import {
  controler,
  perimetresDe,
  FAMILLES,
  VUE_CONFORME,
  CI_CONFORME,
  DECISIONS_RECEVABLES,
  type Vue,
  type Perimetre,
} from '../../../scripts/gates/gov-conventions';

const SCRIPT = 'scripts/gates/gov-conventions.ts';
const CONVENTIONS = 'docs/CONVENTIONS.md';
const REGISTRE = 'docs/GARDES-AXIONIA.md';
const REQUIREMENTS = 'docs/REQUIREMENTS.md';
const TACHES = 'docs/tasks.json';
const MOI = 'tests/unit/gouvernance/gardes-transposees.spec.ts';

function lancer(...args: string[]): { code: number; sortie: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', shell: true });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Les familles rougies par une vue — l'unité de mesure de tout ce fichier. */
function familles(vue: Vue): string[] {
  return [...new Set(controler(vue).map((f) => f.famille))].sort();
}

/** Une vue conforme dont on ne change QUE ce que le témoin fait varier (RM-11). */
function variante(patch: Partial<Vue>): Vue {
  return { ...VUE_CONFORME, ...patch };
}

// ── les sources, lues une fois ───────────────────────────────────────────────

const texteConventions = readFileSync(CONVENTIONS, 'utf8');
const texteRegistre = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';
const taches = (JSON.parse(readFileSync(TACHES, 'utf8')) as { taches: { id: string }[] }).taches;
const idsDeTaches = new Set(taches.map((t) => t.id));

/** Une ligne du registre de décision : `| garde | fichier axionia | décision | reprise | motif |`. */
interface LigneDeDecision {
  readonly garde: string;
  readonly axionia: string;
  readonly decision: string;
  readonly reprise: string;
  readonly motif: string;
}

function lignesDuRegistre(): LigneDeDecision[] {
  return texteRegistre
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.trim())
    )
    .filter((c) => c.length === 5 && !/^-+$/.test(c[0] ?? '') && !/^Garde/i.test(c[0] ?? ''))
    .map((c) => ({
      garde: c[0] ?? '',
      axionia: c[1] ?? '',
      decision: c[2] ?? '',
      reprise: c[3] ?? '',
      motif: c[4] ?? '',
    }));
}

describe('REQ-GOV-029 — la liste des gardes candidates est DÉRIVÉE du texte de l’exigence', () => {
  /**
   * REQ-GOV-029 énumère ses candidates entre parenthèses. On les lit là, dans le registre
   * d'exigences, et pas dans ce fichier : c'est la seule façon qu'une candidate ajoutée à
   * l'exigence demain fasse rougir ce test au lieu de passer inaperçue.
   */
  function gardesNommeesParLExigence(): string[] {
    const texte = readFileSync(REQUIREMENTS, 'utf8');
    const ligne = texte.split('\n').find((l) => l.includes('**REQ-GOV-029**'));
    const parenthese = /\(([^)]+)\)/.exec(ligne ?? '');
    return (parenthese?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  it('l’exigence nomme sept gardes, et le registre en porte une ligne chacune', () => {
    const candidates = gardesNommeesParLExigence();
    expect(candidates).toHaveLength(7);

    const registre = lignesDuRegistre();
    const sansLigne = candidates.filter(
      (c) => !registre.some((l) => l.garde.toLowerCase().includes(c.toLowerCase()))
    );
    expect(
      sansLigne,
      `Ces gardes n'ont aucune ligne dans ${REGISTRE} : une garde sans décision reste une ` +
        `intention. Ajoutez-leur une ligne « transposer / adapter / écarter / différer » motivée.`
    ).toEqual([]);
  });

  it('chaque décision est prise dans un vocabulaire fermé', () => {
    const recevables: readonly string[] = DECISIONS_RECEVABLES;
    const hors = lignesDuRegistre().filter((l) => !recevables.includes(l.decision));
    expect(hors.map((l) => `${l.garde} → « ${l.decision} »`)).toEqual([]);
  });

  it('un motif de deux mots n’est pas un motif : 80 caractères au moins', () => {
    // 28 caractères — « parce que c'est documentaire » — est la longueur exacte de la formule que
    // ce dépôt a mesurée et refusée. Le seuil est celui que `gov:adr` applique déjà aux ADR
    // hors-code, doublé : une décision de transposition engage un chantier, pas une ligne.
    const courts = lignesDuRegistre().filter((l) => l.motif.length < 80);
    expect(courts.map((l) => `${l.garde} — ${l.motif.length} caractères`)).toEqual([]);
  });

  it('une garde `transposer` ou `adapter` nomme un fichier de CE dépôt, et il existe', () => {
    const retenues = lignesDuRegistre().filter(
      (l) => l.decision === 'transposer' || l.decision === 'adapter'
    );
    expect(retenues.length, 'aucune garde retenue : le registre ne décide rien').toBeGreaterThan(0);

    const introuvables: string[] = [];
    for (const l of retenues) {
      const chemins = [...l.reprise.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1] ?? '')
        .filter((c) => /\.(ts|tsx|json|mjs|md)$/.test(c));
      if (chemins.length === 0) introuvables.push(`${l.garde} — aucun fichier nommé en reprise`);
      for (const c of chemins) if (!existsSync(c)) introuvables.push(`${l.garde} → ${c}`);
    }
    expect(introuvables).toEqual([]);
  });

  it('une garde `différer` nomme la tâche qui la reprendra, et cette tâche existe au backlog', () => {
    // « Différée » est une décision recevable — mais seulement si quelqu'un la reprend. Une
    // garde différée sans tâche successeur est un oubli qui se déguise en décision.
    const differees = lignesDuRegistre().filter((l) => l.decision === 'différer');
    expect(differees.length, 'aucune garde différée : ce test ne juge rien').toBeGreaterThan(0);

    const orphelines: string[] = [];
    for (const l of differees) {
      const citees = [...l.reprise.matchAll(/`([A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+)`/g)].map(
        (m) => m[1] ?? ''
      );
      if (!citees.some((id) => idsDeTaches.has(id))) {
        orphelines.push(`${l.garde} — reprise « ${l.reprise} »`);
      }
    }
    expect(
      orphelines,
      `Une garde différée nomme la tâche qui la reprendra, et cette tâche est au backlog.`
    ).toEqual([]);
  });

  it('toute gate attribuée à GOV-014 dont le script est absent figure au registre, motivée', () => {
    // `docs/gates.json` attribue `gov:derivation` à GOV-014 : script absent, `preuveRouge` nulle.
    // Une gate qu'une tâche porte sans l'armer doit AU MOINS être décidée par écrit, sinon la
    // tâche se ferme en laissant derrière elle une entrée que plus personne ne relit.
    const gates = (
      JSON.parse(readFileSync('docs/gates.json', 'utf8')) as {
        gates: { id: string; tache: string; script: string }[];
      }
    ).gates;
    const aNous = gates.filter((g) => g.tache === 'GOV-014' && !existsSync(g.script));
    expect(aNous.length, 'aucune gate GOV-014 sans script : ce test ne juge rien').toBeGreaterThan(
      0
    );

    const registre = lignesDuRegistre();
    const sansDecision = aNous.filter(
      (g) => !registre.some((l) => l.garde.includes(g.id) || l.reprise.includes(g.id))
    );
    expect(sansDecision.map((g) => g.id)).toEqual([]);
  });
});

describe('REQ-GOV-018 — `docs/CONVENTIONS.md` fixe ce que l’acceptation de GOV-014 énumère', () => {
  it('chaque terme entre accents graves de l’acceptation figure dans le document', () => {
    // DÉRIVATION (RM-01) : la liste des termes n'est pas tapée ici, elle est LUE dans
    // l'acceptation de la tâche. Un terme ajouté à l'acceptation fait rougir ce test.
    const acceptation =
      (
        JSON.parse(readFileSync(TACHES, 'utf8')) as {
          taches: { id: string; acceptance: string }[];
        }
      ).taches.find((t) => t.id === 'GOV-014')?.acceptance ?? '';
    const termes = [...acceptation.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
    expect(termes.length, "l'acceptation de GOV-014 ne cite aucun terme").toBeGreaterThan(8);

    const absents = termes.filter((t) => !texteConventions.includes(t));
    expect(absents, `Termes de l'acceptation absents de ${CONVENTIONS}`).toEqual([]);
  });

  it('« les hooks locaux ne font pas foi » y est écrit', () => {
    expect(texteConventions.toLowerCase()).toContain('les hooks locaux ne font pas foi');
  });

  const POINTS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['français pour docs, commentaires, messages et ADR', ['docs, commentaires', 'ADR']],
    ['identifiants de code en français', ['camelCase']],
    ['anglais réservé aux API tierces', ["L'anglais est réservé"]],
    ['montants en Int centimes', ['centimes entiers']],
    ['dates en UTC', ['UTC']],
    ['Server Actions par défaut', ['Server Action', 'par défaut']],
    ['API HTTP uniquement pour la frontière axionia', ['API HTTP', 'frontière']],
    ['Zod à toute entrée', ['Zod']],
    ['use-client justifié', ['// use-client:']],
    ['Prettier et ESLint versionnés', ['Prettier', 'ESLint']],
    ['lint et format bloquants en CI dès le socle', ['bloquant']],
  ];

  it.each(POINTS)('REQ-GOV-018 fixe « %s »', (_point, marqueurs) => {
    for (const m of marqueurs) expect(texteConventions).toContain(m);
  });

  it('le registre de décision des gardes est ATTEINT depuis les conventions', () => {
    // Un registre que le document normatif ne cite pas ne sera jamais relu.
    expect(texteConventions).toContain('GARDES-AXIONIA.md');
  });
});

describe('REQ-GOV-029 — la garde retenue rougit sur un témoin, famille par famille', () => {
  it('la vue conforme est VERTE : sans ce contre-témoin, aucun rouge ne prouve rien', () => {
    expect(controler(VUE_CONFORME)).toEqual([]);
  });

  it('use_server_export_interdit — une constante exportée d’un module « use server »', () => {
    // Le défaut qu'aucun autre instrument ne voit : `tsc` vert, ESLint vert, tests unitaires
    // verts, et le build casse AU RENDU sous un message qui désigne une faute d'import.
    const vue = variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/espace/depot/champs.ts',
          source: '"use server";\n\nexport const CHAMP_LOCALE = "locale";\n',
        },
      ],
    });
    expect(familles(vue)).toEqual(['use_server_export_interdit']);
  });

  it('use_server_export_interdit — une fonction NON asynchrone y est refusée aussi', () => {
    const vue = variante({
      sources: [
        {
          chemin: 'src/app/formatage.ts',
          source: '"use server";\n\nexport function formater(m: number) { return m; }\n',
        },
        ...VUE_CONFORME.sources,
      ],
    });
    expect(familles(vue)).toEqual(['use_server_export_interdit']);
  });

  it('use_server_reexport — un `export { … }` ouvre un point d’entrée HTTP public', () => {
    const vue = variante({
      sources: [
        ...VUE_CONFORME.sources,
        {
          chemin: 'src/app/espace/reexport.ts',
          source: '"use server";\n\nexport { listerLesLignes } from "./lecture";\n',
        },
      ],
    });
    expect(familles(vue)).toEqual(['use_server_reexport']);
  });

  it('use_client_sans_motif — une directive « use client » sans justification collée', () => {
    const vue = variante({
      sources: [
        ...VUE_CONFORME.sources,
        { chemin: 'src/app/Carte.tsx', source: '"use client";\n\nexport function Carte() {}\n' },
      ],
    });
    expect(familles(vue)).toEqual(['use_client_sans_motif']);
  });

  it('lint_non_bloquant — une étape qui lance le lint et porte `continue-on-error`', () => {
    // LE point de cette exigence. Côté axionia, les gates de budget portent toutes
    // `continue-on-error: true` : aucune PR qui alourdit le bundle n'y rougit, et la
    // documentation a affirmé le contraire pendant des mois. Une garde non bloquante est une
    // décoration ; REQ-GOV-018 dit « bloquants », et c'est cette famille qui le tient.
    //
    // ⚠️ Le témoin DÉRIVE du workflow conforme par une seule substitution. Le premier jet
    // réécrivait le workflow entier : il faisait disparaître l'appel à `pnpm gov:conventions`,
    // donc rougissait AUSSI sur `garde_ecrite_jamais_appelee`, et ne prouvait plus ni l'une ni
    // l'autre des deux familles. Un témoin qui change deux choses à la fois ne prouve rien (RM-11).
    const vue = variante({
      workflows: [
        {
          chemin: '.github/workflows/ci.yml',
          source: CI_CONFORME.replace(
            '        run: pnpm lint\n',
            '        run: pnpm lint\n        continue-on-error: true\n'
          ),
        },
      ],
    });
    expect(familles(vue)).toEqual(['lint_non_bloquant']);
  });

  it('outillage_non_epingle — la CI lance le lint sans que l’outil soit épinglé', () => {
    const vue = variante({
      packageJson: JSON.stringify({
        scripts: { lint: 'eslint .', 'format:check': 'prettier --check .' },
        devDependencies: { tsx: '^4.19.2' },
      }),
    });
    expect(familles(vue)).toEqual(['outillage_non_epingle']);
  });

  it('isolation_depot — une tâche `repo: partners` revendique un chemin sous `axionia/`', () => {
    // La moitié RÉCIPROQUE de ce que `paths-derives.spec.ts` garde déjà : ce test-là refuse
    // qu'une tâche `axionia` écrive dans ce dépôt ; personne ne refusait l'inverse.
    const vue = variante({
      taches: [
        ...VUE_CONFORME.taches,
        { id: 'UX-P9-99', repo: 'partners', paths: ['axionia/src/content/tarifs.ts'] },
      ],
    });
    expect(familles(vue)).toEqual(['isolation_depot']);
  });

  it('isolation_depot — `tests/fixtures/axionia/` reste VERT : le préfixe seul décide', () => {
    // Contre-témoin RÉEL, pris du backlog : INT-T01a (repo partners) porte
    // `tests/fixtures/axionia/`. Une règle écrite « contient axionia » l'aurait rougi.
    const vue = variante({
      taches: [
        ...VUE_CONFORME.taches,
        { id: 'INT-T01a', repo: 'partners', paths: ['tests/fixtures/axionia/'] },
      ],
    });
    expect(familles(vue)).toEqual([]);
  });

  it('garde_ecrite_jamais_appelee — un script de garde que nul workflow n’appelle', () => {
    // La leçon d'axionia : `qualiopi:isolation-check` existait depuis des mois, n'était câblé
    // nulle part, et cumulait 88 violations pendant que la seule garde câblée affichait zéro.
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:fantome', phase: -1, script: 'scripts/gates/gov-fantome.ts' },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-fantome.ts'],
    });
    expect(familles(vue)).toEqual(['garde_ecrite_jamais_appelee']);
  });

  it('garde_ecrite_jamais_appelee — une garde câblée par un HOOK reste verte', () => {
    // Contre-témoin : `notify-sink-hors-prod` n'est appelée par aucun workflow — elle est
    // câblée dans `.claude/settings.json`. Une règle qui ne regarderait que les workflows la
    // rougirait à tort, et on apprendrait à ignorer la famille.
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'notify-sink-hors-prod', phase: -1, script: 'scripts/gates/hook-env.js' },
      ],
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/hook-env.js'],
      hooks: '{"hooks":{"PreToolUse":[{"command":"node scripts/gates/hook-env.js"}]}}',
    });
    expect(familles(vue)).toEqual([]);
  });

  it('garde_ecrite_jamais_appelee — une gate dont le script n’existe PAS ne rougit pas ici', () => {
    // Elle rougit ailleurs, et c'est délibéré : `gates:prouvees --phase -1` la nomme
    // (`script_introuvable`). Deux gardes qui disent la même chose se contredisent un jour.
    const vue = variante({
      gates: [
        ...VUE_CONFORME.gates,
        { id: 'gov:derivation', phase: -1, script: 'scripts/gates/gov-derivation.ts' },
      ],
    });
    expect(familles(vue)).toEqual([]);
  });

  it('garde_hors_registre — une garde ÉCRITE que `docs/gates.json` ne nomme pas', () => {
    // GOV-044. La famille précédente tirait sa population du REGISTRE : un script absent du
    // registre n'était jamais confronté à la question de savoir si on l'appelle, et le trou
    // s'exemptait lui-même. La population part maintenant du DISQUE. Le corps de la preuve vit
    // dans `tests/unit/gouvernance/perimetre-des-gardes-derive-du-disque.spec.ts` ; ce témoin-ci
    // est celui que la règle « chaque famille déclarée a été exercée ici » exige, et il exécute
    // le contrôle comme les autres.
    const vue = variante({
      fichiersSuivis: [...VUE_CONFORME.fichiersSuivis, 'scripts/gates/gov-orpheline.ts'],
    });
    expect(familles(vue)).toEqual(['garde_hors_registre']);
  });

  it('perimetre_vide_sans_motif — un périmètre à zéro élément sans motif écrit', () => {
    const perimetres: Perimetre[] = [
      {
        cle: 'modules-serveur',
        libelle: 'modules « use server »',
        motifSiVide: 'pas encore',
        tacheSuccesseur: 'UX-P1-02',
      },
    ];
    expect(familles(variante({ sources: [], perimetres }))).toEqual(['perimetre_vide_sans_motif']);
  });

  it('perimetre_vide_sans_motif — un motif suffisant mais une tâche successeur INCONNUE', () => {
    const perimetres: Perimetre[] = [
      {
        cle: 'modules-serveur',
        libelle: 'modules « use server »',
        motifSiVide:
          'Partners n’a pas encore de dossier `src/` : aucune Server Action n’est écrite, et la ' +
          'garde balaie donc zéro fichier. Elle s’arme au premier module livré.',
        tacheSuccesseur: 'ZZ-T99',
      },
    ];
    expect(familles(variante({ sources: [], perimetres }))).toEqual(['perimetre_vide_sans_motif']);
  });

  it('perimetre_vide_sans_motif — un périmètre vide MOTIVÉ et repris reste vert', () => {
    // Sans ce contre-témoin, la famille précédente ne prouverait rien : une garde qui rougit
    // sur tout périmètre vide serait désarmée dès le premier jour (RM-02, LEC-13).
    const perimetres: Perimetre[] = [
      {
        cle: 'modules-serveur',
        libelle: 'modules « use server »',
        motifSiVide:
          'Partners n’a pas encore de dossier `src/` : aucune Server Action n’est écrite, et la ' +
          'garde balaie donc zéro fichier. Elle s’arme au premier module livré.',
        tacheSuccesseur: 'UX-P1-02',
      },
    ];
    expect(familles(variante({ sources: [], perimetres }))).toEqual([]);
  });

  it('chaque famille déclarée a été exercée par au moins un témoin de ce fichier', () => {
    // Une famille ajoutée sans témoin est une règle qu'on croit gardée. `--prove` le refuse
    // aussi, côté script ; ici on le refuse côté suite, parce que c'est elle qu'on lit.
    const moi = readFileSync(MOI, 'utf8');
    const exercees = FAMILLES.filter((f) => moi.includes(`['${f}']`));
    expect([...FAMILLES].filter((f) => !exercees.includes(f))).toEqual([]);
  });
});

describe('REQ-GOV-029 — le périmètre est DIT, jamais tu', () => {
  it('la garde énumère ce qu’elle a balayé, avec un compte par périmètre', () => {
    // Le piège que ce dépôt refuse de reproduire : `axionia/scripts/check-zod.ts` sort en 0 avec
    // un avertissement quand son répertoire n'existe pas. Une garde à périmètre vide qui rend
    // « ✅ » ne garde rien — et personne ne le sait, parce qu'elle a l'air verte.
    const vus = perimetresDe(VUE_CONFORME);
    expect(vus.length).toBeGreaterThanOrEqual(3);
    for (const p of vus) expect(p.compte).toBeGreaterThanOrEqual(0);
  });

  it('sur l’arbre réel, la sortie NOMME chaque périmètre vide et la tâche qui l’ouvrira', () => {
    const { code, sortie } = lancer();
    expect(code).toBe(0);
    expect(sortie).toContain('PÉRIMÈTRE');
    // La tâche successeur est écrite dans la sortie, pas seulement dans le code : c'est elle
    // qu'un relecteur cherche quand il se demande qui reprend une garde différée.
    expect(sortie).toMatch(/reprise par [A-Z]/);
  });

  it('est verte sur l’état du dépôt', () => {
    const { code, sortie } = lancer();
    expect(sortie).toContain('✅');
    expect(code).toBe(0);
  });

  it(`sait rougir : ses ${FAMILLES.length} familles ont chacune un témoin`, () => {
    const { code, sortie } = lancer('--prove');
    expect(code).toBe(0);
    expect(sortie).toContain(`Les ${FAMILLES.length} familles rougissent`);
    const puces = sortie.split('\n').filter((l) => l.trim().startsWith('•'));
    expect(puces.length).toBe(FAMILLES.length);
  });
});

// ── GOV-031 · REQ-GOV-018 — la configuration ESLint a-t-elle jamais tourné ? ──────────────────
//
// GOV-014 a livré `eslint.config.mjs` avec, en tête et en majuscules, « CE FICHIER N'A JAMAIS ÉTÉ
// EXÉCUTÉ ». Une configuration qui n'a jamais tourné est une DÉCLARATION D'INTENTION, pas une
// garde : elle a l'air d'un contrôle et ne mesure rien. GOV-031 la fait tourner, et ce bloc tient
// ce que l'exécution a appris.
//
// CE QUE CE BLOC PROUVE. Il lit le TEXTE de la configuration : plus aucune affirmation périmée en
// tête, aucune règle éteinte hors d'un périmètre nommé, et chaque dérogation motivée. Ce que la
// configuration FAIT, fichier par fichier, est jugé par le dernier bloc de ce fichier, qui charge
// ESLint.
//
// ET IL PORTE SON PROPRE CONTRE-TÉMOIN. « Zéro dérogation non motivée » veut dire « la
// configuration est propre » OU « le détecteur ne regarde rien ». Les deux rendent le même vert.
// `derogationsDe` est donc exercée sur des textes FABRIQUÉS, et le compte réel est exigé NON NUL.

const ESLINT = 'eslint.config.mjs';
const PRETTIER = '.prettierrc.json';

/** Une règle éteinte ou rétrogradée dans une configuration ESLint plate. */
interface Derogation {
  readonly ligne: number;
  readonly regle: string;
  readonly niveau: 'off' | 'warn';
  /** Le bloc de commentaire COLLÉ au-dessus de l'entrée est un motif (voir `estUnMotif`). */
  readonly motive: boolean;
  /** Le bloc qui la porte déclare un `files:` — donc un périmètre nommé, pas tout le dépôt. */
  readonly perimetreNomme: boolean;
}

/** Un motif se compte en LETTRES : une ligne de tirets a une longueur, pas une phrase. */
const LETTRES_D_UN_MOTIF = 60;

function estUnMotif(bloc: readonly string[]): boolean {
  return (bloc.join(' ').match(/\p{L}/gu) ?? []).length >= LETTRES_D_UN_MOTIF;
}

/**
 * Le bloc de commentaire COLLÉ au-dessus de la ligne `i` : il s'arrête à la première ligne qui n'en
 * est pas un. Un commentaire posé au-dessus d'un bloc ne motive donc pas une entrée de ce bloc — ni
 * une exclusion voisine, ni l'extinction d'une règle que ce commentaire justifie d'ARMER.
 */
function blocColle(lignes: readonly string[], i: number, marque: string): string[] {
  const bloc: string[] = [];
  for (let j = i - 1; j >= 0 && (lignes[j] ?? '').trim().startsWith(marque); j -= 1) {
    bloc.push((lignes[j] ?? '').trim().slice(marque.length));
  }
  return bloc;
}

/**
 * Fonction PURE d'un texte injecté (RM-11) : elle ne lit pas le disque, donc ses témoins ne
 * dépendent pas de l'état du dépôt le jour où ils tournent. Elle lit le texte ENTIER, et non ligne à
 * ligne : une sévérité écrite à la ligne qui suit son crochet reste une sévérité.
 */
function derogationsDe(source: string): Derogation[] {
  const lignes = source.split('\n');
  const out: Derogation[] = [];
  // Les QUATRE écritures d'une sévérité rétrogradée, et pas seulement la chaîne : `0` et `1` valent
  // `'off'` et `'warn'` pour ESLint.
  const retrogradee = /['"]([a-z@][^'"]*)['"]\s*:\s*\[?\s*(?:['"](off|warn)['"]|([01])\b)/g;
  for (const m of source.matchAll(retrogradee)) {
    const i = source.slice(0, m.index).split('\n').length - 1;
    const ligne = (lignes[i] ?? '').trim();
    if (ligne.startsWith('//') || ligne.startsWith('*')) continue;
    let perimetreNomme = false;
    // Remonte jusqu'à l'ouverture du bloc de premier niveau (deux espaces d'indentation).
    for (let j = i; j >= 0; j -= 1) {
      const p = lignes[j] ?? '';
      if (/^\s*files:\s*\[/.test(p)) perimetreNomme = true;
      if (/^ {2}\{\s*$/.test(p)) break;
    }
    out.push({
      ligne: i + 1,
      regle: m[1] ?? '?',
      niveau: m[2] === 'warn' || m[3] === '1' ? 'warn' : 'off',
      motive: estUnMotif(blocColle(lignes, i, '//')),
      perimetreNomme,
    });
  }
  return out;
}

describe('REQ-GOV-018 — `eslint.config.mjs` a été exécutée, et son en-tête ne dit plus le contraire', () => {
  const config = readFileSync(ESLINT, 'utf8');

  it('l’en-tête n’affirme plus « CE FICHIER N’A JAMAIS ÉTÉ EXÉCUTÉ »', () => {
    // Un commentaire qui survit à son code désinforme, et celui-ci le faisait EN MAJUSCULES :
    // il disait à chaque lecteur que la garde était une intention. Elle a tourné le 2026-09-12.
    expect(config).not.toContain("N'A JAMAIS ÉTÉ EXÉCUTÉ");
    expect(config).not.toContain('N’A JAMAIS ÉTÉ EXÉCUTÉ');
  });

  it('l’en-tête porte la DATE et le RÉSULTAT de l’exécution, pas une promesse', () => {
    // Ce qui remplace l'avertissement n'est pas « elle tourne maintenant » : c'est une mesure
    // datée, refaisable. Sans le nombre, la ligne suivante serait encore une déclaration.
    expect(config).toMatch(/2026-09-12/);
    expect(config).toMatch(/`eslint \.`/);
  });

  it('les globales de Node sont DÉRIVÉES du paquet `globals`, jamais retapées (RM-01)', () => {
    // 28 des 60 erreurs du premier passage étaient des `no-undef` sur `process`, `module` et
    // `require` dans les quatre scripts `.js` : la cause est dans la CONFIGURATION, qui ne
    // déclarait aucun environnement. Recopier la liste des globales de Node ici la ferait
    // diverger de Node à la première version ; on importe la liste, on ne la retape pas.
    expect(config).toMatch(/languageOptions/);
    expect(config).toMatch(/globals\.node/);
    expect(config).not.toMatch(/\bprocess:\s*'(readonly|writable)'/);
  });

  it('chaque fichier déclaré ignoré a son motif COLLÉ à son entrée d’`ignores`', () => {
    // Même règle que pour une règle éteinte : le motif est le bloc de commentaire collé au-dessus de
    // l'entrée. Que l'entrée IGNORE bien le fichier, c'est ESLint qui le dit, au dernier bloc.
    const lignes = config.split('\n');
    for (const f of IGNORES_DECLARES) {
      const i = lignes.findIndex((l) => l.trim() === `'${f}',`);
      expect(estUnMotif(blocColle(lignes, i, '//')), `${f} (ligne ${i + 1})`).toBe(true);
    }
  });

  it('aucune règle n’est éteinte EN BLOC : chaque dérogation vit dans un périmètre nommé', () => {
    // « Une CI qu'on rend verte en éteignant la règle mesure la règle éteinte » (acceptation de
    // GOV-031). Une dérogation hors de tout `files:` s'applique au dépôt entier : c'est
    // exactement l'extinction en bloc que l'acceptation refuse.
    const sansPerimetre = derogationsDe(config).filter((d) => !d.perimetreNomme);
    expect(sansPerimetre.map((d) => `${d.regle} (ligne ${d.ligne})`)).toEqual([]);
  });

  it('chaque dérogation porte son motif — et il y en a au moins une (témoin positif non nul)', () => {
    // Le compte NON NUL est la moitié qui manque d'habitude : « zéro dérogation non motivée »
    // se dit aussi bien d'une configuration propre que d'un détecteur qui ne lit rien.
    const vues = derogationsDe(config);
    expect(vues.length).toBeGreaterThan(0);
    expect(vues.filter((d) => !d.motive).map((d) => `${d.regle} (ligne ${d.ligne})`)).toEqual([]);
  });

  it('`derogationsDe` SAIT rougir : une règle éteinte sans motif COLLÉ est vue', () => {
    // RM-02. Sans ce témoin fabriqué, les deux `it` ci-dessus seraient verts sur une fonction
    // qui ne trouve jamais rien.
    const ENTREE = "      'no-console': 'off',";
    const nu = [
      'export default [',
      '  {',
      "    files: ['tests/**'],",
      '    rules: {',
      ENTREE,
      '    },',
      '  },',
      '];',
    ].join('\n');
    const vues = derogationsDe(nu);
    expect(vues.length).toBe(1);
    expect(vues[0]!.regle).toBe('no-console');
    expect(vues[0]!.niveau).toBe('off');
    expect(vues[0]!.motive).toBe(false);
    expect(vues[0]!.perimetreNomme).toBe(true);

    // Le même texte avec un motif COLLÉ à l'entrée : la fonction discrimine, elle ne dit pas
    // « non motivé » à tout le monde.
    const PHRASE =
      "// Les tests IMPRIMENT leur verdict : c'est leur interface, et une suite muette ne\n" +
      "      // rapporte rien de ce qu'elle a balayé.\n";
    expect(derogationsDe(nu.replace(ENTREE, `      ${PHRASE}${ENTREE}`))[0]!.motive).toBe(true);
    // Le même motif posé au-dessus de `rules:` motive le BLOC, pas l'extinction d'une de ses
    // entrées : le commentaire qui justifie d'armer une règle ne sert pas de motif pour l'éteindre.
    expect(derogationsDe(nu.replace('    rules: {', `    ${PHRASE}    rules: {`))[0]!.motive).toBe(
      false
    );
    // Une longueur n'est pas une phrase.
    const tirets = `      // ${'─'.repeat(70)}\n`;
    expect(derogationsDe(nu.replace(ENTREE, `${tirets}${ENTREE}`))[0]!.motive).toBe(false);

    // Et une dérogation POSÉE HORS de tout `files:` est vue comme telle : c'est l'extinction en
    // bloc. Sans ce troisième cas, `perimetreNomme` serait vrai partout et ne mesurerait rien.
    const enBloc = [
      'export default [',
      '  {',
      '    rules: {',
      "      'no-console': 'off',",
      '    },',
      '  },',
      '];',
    ].join('\n');
    expect(derogationsDe(enBloc)[0]!.perimetreNomme).toBe(false);

    // Et les écritures NUMÉRIQUES, et celles dont la sévérité passe à la ligne, sont des
    // dérogations comme les autres.
    for (const ecriture of ['0', '[0]', '1', '[1, {}]', '"off"', '["warn"]', "[\n        'off',"]) {
      const vue = derogationsDe(enBloc.replace("'off'", ecriture));
      expect(
        vue.map((d) => d.regle),
        `écriture ${ecriture}`
      ).toEqual(['no-console']);
      expect(vue[0]!.niveau).toBe(
        ecriture.includes('1') || ecriture.includes('warn') ? 'warn' : 'off'
      );
    }
    // Contre-témoin : une règle en `error` (ou `2`) n'est pas une dérogation.
    expect(derogationsDe(enBloc.replace("'off'", '2'))).toEqual([]);
    expect(derogationsDe(enBloc.replace("'off'", "'error'"))).toEqual([]);
  });

  it('`.prettierrc.json` reste un JSON valide et fixe la fin de ligne', () => {
    // `core.autocrlf` a déjà fait rougir ce dépôt pour la mauvaise cause : `endOfLine` n'est pas
    // un détail de goût, c'est ce qui empêche `format:check` de dépendre du poste qui l'exécute.
    const p = JSON.parse(readFileSync(PRETTIER, 'utf8')) as Record<string, unknown>;
    expect(p.endOfLine).toBe('lf');
    expect(typeof p.printWidth).toBe('number');
  });
});

// ── GOV-031 · REQ-GOV-018 — l'outillage ÉPINGLÉ, ses scripts, et les deux étapes de Gate A ────
//
// La famille `outillage_non_epingle` ne s'arme QUE si une étape de CI lance l'outil — « sans étape,
// rien ne ment », dit l'acceptation de GOV-031. Rien ne ment, et rien ne garde : c'est donc ici que
// la PRÉSENCE est exigée, et que l'étape, son job, ses scripts et les installations sont jugés sur
// ce qu'ils FONT.
//
// ⚖️ L'ARBITRAGE, ÉCRIT PLUTÔT QUE TU. L'acceptation dit « les 5 devDependencies » SANS LES NOMMER.
// La liste n'est pas tranchée par un chiffre écrit à la main : elle se DÉRIVE de ses deux sources
// (RM-01) — les `import` de `eslint.config.mjs` et le binaire que lance chaque script —, si bien
// qu'ajouter un plugin à la configuration ajoute son exigence tout seul.

const PACKAGE = 'package.json';
const CI = '.github/workflows/ci.yml';
const IGNORE_PRETTIER = '.prettierignore';

interface Pkg {
  readonly scripts?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

/**
 * Les scripts exigés — LUS dans l'acceptation de GOV-031, jamais retapés ici (RM-01) : si
 * l'acceptation en nomme un quatrième, ce test l'exige sans qu'on ait à y toucher.
 */
function scriptsExigesParGov031(acceptance: string): string[] {
  const m = /les scripts ((?:`[a-z:]+`(?:, | et )?)+)/.exec(acceptance);
  return [...(m?.[1] ?? '').matchAll(/`([a-z:]+)`/g)].map((x) => x[1] ?? '');
}

/**
 * Les paquets que ce dépôt doit épingler, DÉRIVÉS de leurs deux sources : les `import … from`
 * de la configuration ESLint, et le premier mot de chaque script d'outillage — le binaire qu'il
 * lance. Fonction PURE de textes injectés (RM-11).
 */
function paquetsRequis(
  configEslint: string,
  scripts: Record<string, string>,
  nomsDeScripts: readonly string[]
): string[] {
  const imports = [...configEslint.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gm)].map(
    (m) => m[1] ?? ''
  );
  const binaires = nomsDeScripts
    .map((n) => (scripts[n] ?? '').trim().split(/\s+/)[0] ?? '')
    .filter((b) => b !== '' && !b.startsWith('pnpm'));
  return [...new Set([...imports, ...binaires])].filter((p) => p !== '').sort();
}

/** Une entrée de `.prettierignore`, et le motif qui la porte — ou son absence. */
interface Exclusion {
  readonly ligne: number;
  readonly motif: string;
  /** Le bloc `#` COLLÉ au-dessus de l'entrée est un motif (voir `estUnMotif`). */
  readonly motive: boolean;
}

/** Fonction PURE d'un texte injecté (RM-11). */
function exclusionsDe(source: string): Exclusion[] {
  const lignes = source.split('\n');
  const out: Exclusion[] = [];
  lignes.forEach((brute, i) => {
    const entree = brute.trim();
    if (entree === '' || entree.startsWith('#')) return;
    out.push({ ligne: i + 1, motif: entree, motive: estUnMotif(blocColle(lignes, i, '#')) });
  });
  return out;
}

/** Un nœud de l'arbre que rend l'analyseur YAML embarqué par Prettier. */
interface NoeudYaml {
  readonly type: string;
  readonly value?: string;
  readonly anchor?: unknown;
  readonly tag?: unknown;
  readonly children?: readonly (NoeudYaml | null)[];
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Un workflow se lit comme la forge le lit : un OBJET, produit par un vrai analyseur YAML — celui que
 * Prettier embarque, déjà épinglé —, et non un texte dont on devine la structure à l'indentation.
 * YAML n'ordonne pas les clés : une clé posée après `steps:`, ou dans un mapping entre accolades,
 * est une clé comme une autre. Les scalaires restent des chaînes. Les ancres, alias, étiquettes et
 * clés de fusion sont REFUSÉS : ils font dire à une clé ce qu'un autre endroit du fichier écrit.
 */
async function lireYaml(texte: string): Promise<unknown> {
  const options = { originalText: texte };
  return valeurYaml((await analyseursYaml.yaml.parse(texte, options as never)) as NoeudYaml);
}

function valeurYaml(n: NoeudYaml | null | undefined): unknown {
  if (n === null || n === undefined) return null;
  if ((n.anchor ?? null) !== null || (n.tag ?? null) !== null) {
    throw new Error(`YAML : ancre ou étiquette refusée (${n.type})`);
  }
  const enfants = n.children ?? [];
  switch (n.type) {
    case 'root':
      if (enfants.length !== 1) throw new Error('YAML : un fichier porte un seul document');
      return valeurYaml(enfants[0]);
    case 'document':
      return valeurYaml(enfants[1]);
    case 'documentBody':
    case 'mappingValue':
    case 'sequenceItem':
    case 'flowSequenceItem':
      return valeurYaml(enfants[0]);
    case 'sequence':
    case 'flowSequence':
      return enfants.map(valeurYaml);
    case 'mapping':
    case 'flowMapping': {
      const objet: Record<string, unknown> = {};
      for (const item of enfants) {
        const [cle, valeur] = item?.children ?? [];
        const nom = valeurYaml(cle?.children?.[0]);
        if (typeof nom !== 'string' || nom === '<<' || Object.hasOwn(objet, nom)) {
          throw new Error(`YAML : clé refusée (${String(nom)})`);
        }
        objet[nom] = valeurYaml(valeur);
      }
      return objet;
    }
    case 'plain':
    case 'quoteDouble':
    case 'quoteSingle':
    case 'blockLiteral':
    case 'blockFolded':
      return n.value ?? '';
    default:
      throw new Error(`YAML : nœud « ${n.type} » refusé`);
  }
}

/**
 * Les deux scripts, À LA LETTRE. Un drapeau change la configuration (`--rule`), la portée
 * (`--ignore-pattern`, `"!src/**"`) ou le code de sortie (`|| true`) sans toucher l'étape : la forme
 * exacte est ce qui rend la configuration jugée plus bas égale à celle que la CI applique.
 */
const SCRIPTS_EXACTS: Readonly<Record<string, string>> = {
  // `--max-warnings 0` (QA-T01) : un avertissement fait échouer l'étape, il n'est jamais toléré.
  lint: 'eslint . --max-warnings 0',
  'format:check': 'prettier --check .',
};

/**
 * Les clés du workflow de Gate A et de son job, EXACTEMENT. Toute autre — `if`, `continue-on-error`,
 * `defaults`, `env`, `container`… — peut changer ce que font les étapes sans toucher leur texte :
 * elle est refusée où qu'elle soit écrite. Et une clé déclarée ici doit être PRÉSENTE : élargir la
 * liste sans écrire la clé dans le workflow rougit aussi. Liste tapée EXPRÈS : sa divergence est le
 * signal, dans les deux sens.
 */
const CLES_DU_WORKFLOW = ['name', 'on', 'jobs'];
const CLES_DE_GATE_A = ['runs-on', 'permissions', 'steps'];

/**
 * Ce que FAIT Gate A, lue comme un objet. Les étapes de lint et de format ont la forme EXACTE
 * `{ name, run: pnpm lint }` / `{ name, run: pnpm format:check }`, une fois chacune ; aucune étape
 * du job ne change son shell ni ne tolère son échec. Le prédicat de `gov-conventions.ts` n'est pas
 * recopié : il est dépassé.
 */
function fautesDActe(ci: unknown): string[] {
  if (!estObjet(ci)) return ['workflow illisible'];
  const fautes: string[] = [];
  const clesExactes = (lieu: string, objet: Record<string, unknown>, cles: readonly string[]) => {
    for (const cle of Object.keys(objet)) if (!cles.includes(cle)) fautes.push(`${lieu} ⏎ ${cle}`);
    for (const cle of cles) if (!Object.hasOwn(objet, cle)) fautes.push(`${lieu} ⏎ ${cle} absente`);
  };
  clesExactes('workflow', ci, CLES_DU_WORKFLOW);
  const job = estObjet(ci.jobs) ? ci.jobs['gate-a'] : undefined;
  if (!estObjet(job) || !Array.isArray(job.steps)) return [...fautes, 'job `gate-a` introuvable'];
  clesExactes('gate-a', job, CLES_DE_GATE_A);
  const lances = new Map<string, number>();
  for (const etape of job.steps) {
    if (!estObjet(etape)) {
      fautes.push(`gate-a ⏎ étape illisible : ${JSON.stringify(etape)}`);
      continue;
    }
    const run = etape.run;
    if (typeof run === 'string' && /\b(?:lint|format|eslint|prettier)\b/.test(run)) {
      const script = Object.keys(SCRIPTS_EXACTS).find((s) =>
        new RegExp(`\\bpnpm\\s+${s}(?![\\w:-])`).test(run)
      );
      if (script !== undefined) lances.set(script, (lances.get(script) ?? 0) + 1);
      const exacte =
        run === `pnpm ${script}` &&
        typeof etape.name === 'string' &&
        Object.keys(etape).sort().join(',') === 'name,run';
      if (!exacte) fautes.push(`gate-a ⏎ ${JSON.stringify(etape)}`);
      continue;
    }
    for (const cle of ['shell', 'continue-on-error']) {
      if (cle in etape) fautes.push(`gate-a ⏎ ${JSON.stringify(etape)}`);
    }
  }
  for (const s of Object.keys(SCRIPTS_EXACTS)) {
    if (lances.get(s) !== 1) fautes.push(`gate-a ⏎ \`pnpm ${s}\` lancé ${lances.get(s) ?? 0} fois`);
  }
  return fautes;
}

const INSTALLATION_FIGEE = 'pnpm install --frozen-lockfile';

/**
 * Les seules valeurs CALCULÉES qu'une commande admet, À LA LETTRE, chacune précédée d'une espace.
 * Toute autre substitution — de commande, de processus, une expression de la forge, qui s'évalue
 * AVANT le shell — est refusée où qu'elle soit. Liste tapée EXPRÈS : une entrée que plus aucun
 * workflow n'écrit rougit, et une substitution neuve demande deux écritures, dont celle-ci.
 */
const ARGUMENTS_CALCULES = [
  '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
  '$(date -u +%F)',
  "${{ inputs.phase || '-1' }}",
];

/**
 * UNE ligne : `pnpm <script>`, puis des mots faits de caractères sans effet pour le shell. Aucun
 * opérateur, aucune redirection, aucun guillemet, aucun saut de ligne : ce qui n'est pas dans la
 * classe est refusé sans avoir à être nommé.
 */
const COMMANDE_ADMISE = /^pnpm ([a-z][\w:-]*)((?: [\w.:=@/+%-]+)*)$/;

/**
 * Chaque commande de chaque YAML suivi sous `.github/` — workflows ET actions composites — est
 * l'installation FIGÉE ou un script du `package.json`, sous une forme FERMÉE : ni `pnpm update`, ni
 * une installation sans verrou, ni un autre gestionnaire, ni une commande logée dans une commande
 * admise. Les scripts sont LUS dans `package.json` (RM-01). Une action locale n'est admise que si son
 * YAML est parmi les YAML lus (`lus`) — un dossier qui ne porte qu'un `Dockerfile` n'en a pas —, et
 * toute action lue est `composite` : ses étapes sont des commandes jugées ici, alors qu'une action
 * JavaScript ou Docker exécuterait un code que rien ne lit. Un `shell` n'est jamais autre chose que
 * `bash`. Ce que ce jugement ne voit pas : le code d'une action TIERCE, et ce qu'exécute un script
 * admis. Fonction PURE (RM-11).
 */
function fautesDeCommandes(
  yamls: readonly unknown[],
  scripts: Readonly<Record<string, string>>,
  lus: readonly string[]
): { installations: number; fautes: string[] } {
  const fautes: string[] = [];
  const ecrits = new Set<string>();
  let installations = 0;
  const visiter = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visiter);
    if (!estObjet(v)) return;
    for (const [cle, valeur] of Object.entries(v)) {
      // `run_install` fait installer `pnpm/action-setup` hors de toute commande.
      const horsForme =
        cle === 'run_install' ||
        (cle === 'shell' && valeur !== 'bash') ||
        (cle === 'runs' && (!estObjet(valeur) || valeur.using !== 'composite')) ||
        (cle === 'uses' &&
          typeof valeur === 'string' &&
          valeur.startsWith('.') &&
          !['', '/action.yml', '/action.yaml'].some((s) =>
            lus.includes(`${posix.normalize(valeur).replace(/\/$/, '')}${s}`)
          ));
      if (horsForme) {
        fautes.push(`${cle} : ${JSON.stringify(valeur)}`);
        continue;
      }
      if (cle !== 'run' || typeof valeur !== 'string') {
        visiter(valeur);
        continue;
      }
      let c = valeur.trim();
      for (const a of ARGUMENTS_CALCULES) {
        if (c.includes(` ${a}`)) ecrits.add(a);
        c = c.split(` ${a}`).join(' X');
      }
      if (c === INSTALLATION_FIGEE) {
        installations += 1;
        continue;
      }
      const script = COMMANDE_ADMISE.exec(c)?.[1];
      if (script === undefined || script === 'install' || !Object.hasOwn(scripts, script)) {
        fautes.push(`run : ${valeur.trim()}`);
      }
    }
  };
  yamls.forEach(visiter);
  for (const a of ARGUMENTS_CALCULES) {
    if (!ecrits.has(a)) fautes.push(`argument calculé déclaré, écrit nulle part : ${a}`);
  }
  return { installations, fautes };
}

/**
 * « Épinglé » : une version, et une seule. `^3.9.6` en est une ; `3 || *`, `*`, `latest` et
 * `>=3` n'en sont pas. Le verrou lu avec `--frozen-lockfile` fige la version installée ET tout
 * correctif que le gestionnaire de paquets lui applique : il ne dit rien de ce que le binaire FAIT.
 * Ce que l'acte de Gate A fait d'une faute est mesuré plus bas, en le lançant sur un arbre fautif.
 */
const VERSION_EPINGLEE = /^[\^~]?\d+\.\d+\.\d+$/;

/**
 * Les dérogations de format DÉCLARÉES. Liste tapée ici EXPRÈS : c'est sa DIVERGENCE avec ce que
 * `prettier --check .` lit réellement qui est le signal. Une entrée de `.prettierignore` qui déborde
 * de sa mesure — `src/`, `*.ts`, `**\/*`, un `packages/` élargi — fait sauter un fichier suivi que
 * cette liste ne couvre pas ; une entrée retirée fait lire un fichier qu'elle couvre. Les deux
 * rougissent. Ce qu'une déclaration couvre n'est PAS formaté, et rien ne rougit dessus : un fichier
 * de code neuf posé sous `packages/contracts/` est dérogé comme le reste du dossier. Ajouter une
 * dérogation demande donc DEUX écritures, dont celle-ci, relue comme un test.
 */
const HORS_FORMAT_DECLARE: readonly (readonly [string, (f: string) => boolean])[] = [
  ['pnpm-lock.yaml', (f) => f === 'pnpm-lock.yaml'],
  ['*.md', (f) => f.endsWith('.md')],
  ['docs/*.json', (f) => /^docs\/[^/]+\.json$/.test(f)],
  ['packages/contracts/', (f) => f.startsWith('packages/contracts/')],
];

/** Les fichiers suivis par git — la seule source du « dépôt » que la CI voit. */
function fichiersSuivis(...racines: string[]): string[] {
  const r = spawnSync('git', ['ls-files', '-z', '--', ...racines], { encoding: 'utf8' });
  return (r.stdout ?? '').split('\0').filter((f) => f !== '');
}

/** Le binaire qu'un script lance, et ses arguments : le script À LA LETTRE, découpé. */
function binaireDuScript(script: string): [string, string[]] {
  const [nom = '', ...args] = (SCRIPTS_EXACTS[script] ?? '').split(' ');
  return [nom, args];
}

/**
 * Lance le binaire INSTALLÉ d'un outil — le fichier que nomme le champ `bin` de son paquet sous
 * `node_modules` —, sans lui transmettre l'environnement du test, et rend sa sortie. Sert à RELEVER
 * ce qu'il lit ; ce que l'acte de Gate A fait d'une faute est mesuré par `lancerActe`.
 */
function lancerBinaire(nom: string, args: readonly string[]): string {
  const paquet = join('node_modules', nom);
  const { bin } = JSON.parse(readFileSync(join(paquet, PACKAGE), 'utf8')) as {
    bin: string | Record<string, string>;
  };
  const chemin = join(paquet, typeof bin === 'string' ? bin : (bin[nom] ?? ''));
  const r = spawnSync(process.execPath, [chemin, ...args], { encoding: 'utf8', env: {} });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/** Ce que Prettier fait d'un fichier suivi : tout ce que le jugement lit, et rien d'autre. */
interface MesurePrettier {
  readonly fichier: string;
  /** Prettier a un analyseur pour ce fichier — sans lire aucun fichier d'ignore, ni aucun défaut. */
  readonly sait: boolean;
  /** `prettier --check .` l'a LU : le binaire installé l'a nommé dans sa sortie. */
  readonly lu: boolean;
  /** Les options qu'il reçoit, et celles que `.prettierrc.json` SEUL lui donnerait. */
  readonly options: unknown;
  readonly optionsRacine: unknown;
}

/**
 * UN lancement du binaire installé : le script à la lettre, plus `--end-of-line cr`. Sous cette
 * option, tout fichier non vide qu'il lit diffère de sa sortie : la liste de ce qu'il signale EST la
 * liste de ce qu'il lit — exclusions par défaut de l'outil, `.gitignore`, `.prettierignore` et pragma
 * exigé compris. C'est un RELEVÉ : son code de sortie n'est pas lu.
 */
async function mesurerPrettier(suivis: readonly string[]): Promise<MesurePrettier[]> {
  const [nom, args] = binaireDuScript('format:check');
  const sortie = lancerBinaire(nom, [...args, '--no-color', '--end-of-line', 'cr']);
  const lus = new Set(sortie.split('\n').map((l) => /^\[warn\] (.+)$/.exec(l.trim())?.[1]));
  const mesures: MesurePrettier[] = [];
  for (const fichier of suivis) {
    const info = await getFileInfo(fichier, { withNodeModules: true, ignorePath: [] });
    mesures.push({
      fichier,
      sait: info.inferredParser !== null,
      lu: lus.has(fichier),
      options: await resolveConfig(fichier, { editorconfig: true }),
      optionsRacine: await resolveConfig(fichier, { editorconfig: true, config: PRETTIER }),
    });
  }
  return mesures;
}

/** Le jugement, séparé de la mesure : fonction PURE (RM-11), pour que ses témoins soient fabriqués. */
function fautesPrettier(mesures: readonly MesurePrettier[], suivis: readonly string[]): string[] {
  const fautes: string[] = [];
  const mesures_ = new Set(mesures.map((m) => m.fichier));
  for (const f of suivis) if (!mesures_.has(f)) fautes.push(`${f} : non mesuré`);
  for (const m of mesures) {
    const declare = HORS_FORMAT_DECLARE.some(([, couvre]) => couvre(m.fichier));
    if (m.sait && !declare && !m.lu)
      fautes.push(`${m.fichier} : \`prettier --check .\` ne le lit pas`);
    if (m.lu && declare) fautes.push(`${m.fichier} : déclaré hors format, et lu`);
    if (m.sait && !isDeepStrictEqual(m.options, m.optionsRacine)) {
      fautes.push(`${m.fichier} : options autres que celles de ${PRETTIER}`);
    }
  }
  for (const [nom, couvre] of HORS_FORMAT_DECLARE) {
    if (!mesures.some((m) => m.sait && couvre(m.fichier))) {
      fautes.push(`${nom} : dérogation qui ne couvre aucun fichier suivi`);
    }
  }
  return fautes;
}

/**
 * La faute plantée : une fuite de `console` (REQ-DM-041) mal formatée, dans le code de produit. Elle
 * doit faire échouer l'une ET l'autre étape.
 */
const FAUTE_PLANTEE = { fichier: 'src/faute-plantee.ts', texte: "console.log( 'courriel' )\n" };

/**
 * Un arbre JETABLE hors du dépôt : chaque fichier suivi copié, puis les fichiers `plantes`, et, si
 * `installe`, un lien vers le `node_modules` que l'installation figée a posé. C'est la seule façon de
 * lancer l'acte de Gate A sur une faute sans écrire dans le dépôt.
 */
function arbreJetable(
  suivis: readonly string[],
  plantes: Readonly<Record<string, string>>,
  installe: boolean
): string {
  const racine = mkdtempSync(join(tmpdir(), 'g31-'));
  const ecrire = (f: string, contenu: string | Buffer) => {
    mkdirSync(dirname(join(racine, f)), { recursive: true });
    writeFileSync(join(racine, f), contenu, { mode: 0o755 });
  };
  for (const f of suivis) ecrire(f, readFileSync(f));
  for (const [f, contenu] of Object.entries(plantes)) ecrire(f, contenu);
  if (installe) symlinkSync(realpathSync('node_modules'), join(racine, 'node_modules'), 'junction');
  return racine;
}

/**
 * L'ACTE d'une étape de Gate A, À LA LETTRE : `pnpm <script>` — la commande que `fautesDActe` exige
 * de `ci.yml` —, lancée par un shell dans `racine`, sous l'environnement du test. C'est `pnpm` qui
 * trouve le binaire et lui passe les arguments du `package.json`, comme en CI.
 */
function lancerActe(racine: string, script: string): { code: number | null; sortie: string } {
  const r = spawnSync(`pnpm ${script}`, { cwd: racine, shell: true, encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\\').join('/') };
}

/** Le jugement de l'acte : sortir en 1 en NOMMANT la faute. Fonction PURE (RM-11). */
function fautesDeLActe(script: string, code: number | null, sortie: string): string[] {
  const { fichier } = FAUTE_PLANTEE;
  if (code === 1 && sortie.includes(fichier)) return [];
  const nommee = sortie.includes(fichier) ? '' : ' sans la nommer';
  return [`\`pnpm ${script}\` sort en ${code} sur ${fichier}${nommee}`];
}

describe('REQ-GOV-018 — lint et format sont ÉPINGLÉS, SCRIPTÉS, et BLOQUANTS en Gate A', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8')) as Pkg;
  const config = readFileSync(ESLINT, 'utf8');
  const ci = readFileSync(CI, 'utf8');
  const acceptance =
    (
      JSON.parse(readFileSync(TACHES, 'utf8')) as {
        taches: { id: string; acceptance: string }[];
      }
    ).taches.find((t) => t.id === 'GOV-031')?.acceptance ?? '';

  it('les scripts que l’acceptation de GOV-031 nomme existent dans `package.json`', () => {
    // Le témoin POSITIF d'abord : si l'extraction ne trouvait rien, « aucun script manquant » se
    // dirait aussi bien d'un package.json complet que d'une regex qui ne lit plus l'acceptation.
    const exiges = scriptsExigesParGov031(acceptance);
    expect(exiges.length).toBeGreaterThanOrEqual(3);
    expect(exiges.filter((s) => !pkg.scripts?.[s])).toEqual([]);
  });

  it('`lint` et `format:check` sont EXACTEMENT `eslint . --max-warnings 0` et `prettier --check .`', () => {
    // Ni drapeau, ni portée, ni `||` : c'est l'égalité qui fait de la configuration jugée plus bas
    // celle que `pnpm lint` et `pnpm format:check` appliquent réellement.
    const vus = Object.fromEntries(Object.keys(SCRIPTS_EXACTS).map((s) => [s, pkg.scripts?.[s]]));
    expect(vus).toEqual(SCRIPTS_EXACTS);
  });

  it('chaque paquet DÉRIVÉ de la configuration et des scripts est épinglé en devDependencies', () => {
    // Les deux binaires sont exigés NOMMÉMENT en plus de la dérivation, parce qu'une dérivation qui
    // perdrait la moitié de sa source rendrait exactement le même vert qu'une dérivation complète.
    const exiges = scriptsExigesParGov031(acceptance);
    const requis = paquetsRequis(config, pkg.scripts ?? {}, exiges);
    expect(requis).toContain('eslint');
    expect(requis).toContain('prettier');
    expect(requis.filter((p) => !pkg.devDependencies?.[p])).toEqual([]);
    // Épinglé veut dire une version, pas `*` ni `latest` : « un outil non épinglé rend un
    // verdict différent selon le poste » (docs/CONVENTIONS.md §10).
    expect(requis.filter((p) => !VERSION_EPINGLEE.test(pkg.devDependencies?.[p] ?? ''))).toEqual(
      []
    );
    // RM-02 : les plages que l'ancienne expression laissait passer sont refusées.
    expect(['3 || *', '*', 'latest', '>=3', '10'].filter((v) => VERSION_EPINGLEE.test(v))).toEqual(
      []
    );
  });

  it('`paquetsRequis` SAIT rougir : un plugin importé et non épinglé est vu', () => {
    // RM-02. Sans ce témoin fabriqué, le `it` ci-dessus serait vert sur une fonction qui ne
    // dérive rien : « aucun paquet manquant » est le verdict d'une liste vide.
    const faux = ["import x from '@eslint/js';", "import y from 'eslint-plugin-inconnu';"].join(
      '\n'
    );
    const requis = paquetsRequis(faux, { ...SCRIPTS_EXACTS }, ['lint', 'format:check']);
    expect(requis).toEqual(['@eslint/js', 'eslint', 'eslint-plugin-inconnu', 'prettier']);
    // Et le binaire se dérive bien du SCRIPT : sans script, aucun binaire n'est exigé.
    expect(paquetsRequis(faux, {}, ['lint'])).toEqual(['@eslint/js', 'eslint-plugin-inconnu']);
  });

  it('toute commande des YAML suivis sous `.github/` est un script du dépôt ou l’installation FIGÉE, sous une forme fermée', async () => {
    // Le verrou fige ce qui s'installe. Une commande qui réécrit `node_modules` APRÈS l'installation
    // défait ce qu'il a figé, et une commande logée DANS une commande admise s'exécute tout autant.
    const chemins = fichiersSuivis('.github').filter((f) => /\.ya?ml$/.test(f));
    const yamls = await Promise.all(chemins.map((f) => lireYaml(readFileSync(f, 'utf8'))));
    const scripts = pkg.scripts ?? {};
    const { installations, fautes } = fautesDeCommandes(yamls, scripts, chemins);
    expect(installations).toBeGreaterThan(0);
    expect(fautes).toEqual([]);
    // RM-02 : chaque forme dérivée de `ci.yml` RÉEL par UNE substitution (RM-11), jugée avec les
    // autres YAML réels, rend UNE faute.
    const avecCi = (texte: string) =>
      Promise.all(chemins.map((f, i) => (f === CI ? lireYaml(texte) : yamls[i])));
    const INSTALL = `      - run: ${INSTALLATION_FIGEE}\n`;
    const apres = (etape: string) => ci.replace(INSTALL, `${INSTALL}      - ${etape}\n`);
    expect(ci).toContain(INSTALL);
    const variantes = [
      ci.replace(INSTALL, '      - run: pnpm install\n'),
      ci.replace(INSTALL, `      - run: ${INSTALLATION_FIGEE}=false\n`),
      apres('run: pnpm update --latest'),
      apres('run: pnpm lint $(npm install eslint)'),
      apres('run: npm install'),
      // Une commande admise qui en porte une autre : arrière-plan, substitution de processus, seconde
      // ligne dans la substitution datée admise, expression de la forge.
      apres('run: pnpm lint & pnpm update'),
      apres('run: pnpm lint <(pnpm update)'),
      apres(
        'run: |\n          pnpm gov:etat --now "$(date -u +%Y-%m-%dT%H:%M:%SZ\n          pnpm update)"'
      ),
      apres('run: pnpm lint ${{ github.head_ref }}'),
      ci.replace(
        '      - uses: pnpm/action-setup@v4\n',
        '      - uses: pnpm/action-setup@v4\n        with: { run_install: true }\n'
      ),
      // Une action locale hors de `.github/`, dont aucun YAML n'est lu ; un shell qui n'est pas `bash`.
      apres('uses: ./outils/action'),
      `${ci}defaults:\n  run:\n    shell: sh\n`,
    ];
    for (const texte of variantes) {
      expect(texte).not.toBe(ci);
      expect(fautesDeCommandes(await avecCi(texte), scripts, chemins).fautes, texte).toHaveLength(
        1
      );
    }
    // Une action composite fabriquée sous `.github/` est lue comme un workflow.
    const composite =
      'runs:\n  using: composite\n  steps:\n    - run: pnpm install\n      shell: bash\n';
    expect(
      fautesDeCommandes([...yamls, await lireYaml(composite)], scripts, chemins).fautes
    ).toHaveLength(1);
    // Une action locale appelée depuis `gate-a` avant `Lint` exécute avant lui ce que dit son YAML.
    // Sans YAML lu — un `Dockerfile` seul —, ou avec un `runs` qui n'est pas une suite de commandes
    // — JavaScript, Docker —, rien de ce qu'elle lance n'est jugé : elle est refusée NOMMÉMENT.
    const action = '.github/actions/maj';
    const appel = await avecCi(apres(`uses: ./${action}`));
    expect(fautesDeCommandes(appel, scripts, chemins).fautes).toEqual([`uses : "./${action}"`]);
    const lus = [...chemins, `${action}/action.yml`];
    const admise = await lireYaml(composite.replace('pnpm install', 'pnpm lint'));
    expect(fautesDeCommandes([...appel, admise], scripts, lus).fautes).toEqual([]);
    for (const runs of [
      '{ using: node20, main: index.mjs }',
      '{ using: docker, image: Dockerfile }',
    ]) {
      const lue = await lireYaml(`runs: ${runs}\n`);
      expect(fautesDeCommandes([...appel, lue], scripts, lus).fautes).toEqual([
        `runs : ${JSON.stringify((lue as { runs: unknown }).runs)}`,
      ]);
    }
    // Un script nommé `install` ne rend pas légitime une installation qui ne fige pas le verrou.
    const sansVerrou = await avecCi(ci.replace(INSTALL, '      - run: pnpm install\n'));
    expect(
      fautesDeCommandes(sansVerrou, { ...scripts, install: 'true' }, chemins).fautes
    ).toHaveLength(1);
    // Et un argument calculé déclaré qu'aucun workflow n'écrit plus est une déclaration morte.
    const ciSeul = fautesDeCommandes([await lireYaml(ci)], scripts, [CI]).fautes;
    expect(ciSeul).toEqual(
      ARGUMENTS_CALCULES.filter((a) => !ci.includes(` ${a}`)).map(
        (a) => `argument calculé déclaré, écrit nulle part : ${a}`
      )
    );
    expect(ciSeul.length).toBeGreaterThan(0);
  });

  it('l’ACTE des deux étapes est exact — ni `if:`, ni `||`, ni shell, ni clé de job qui les désarme', async () => {
    // LE point de REQ-GOV-018 : une gate qui ne bloque rien ne garde rien. Chercher le mot
    // `continue-on-error` ne suffit pas : une étape se désarme par sa commande, par une condition,
    // par son shell, et par une clé de son job écrite n'importe où dans le job.
    expect(fautesDActe(await lireYaml(ci))).toEqual([]);
    // RM-02 : chacun de ces désarmements, dérivé de l'arbre RÉEL par UNE substitution (RM-11).
    const LINT = '      - name: Lint\n        run: pnpm lint\n';
    expect(ci).toContain(LINT);
    expect(ci.endsWith('\n')).toBe(true);
    const desarmes = [
      ci.replace(LINT, LINT.replace('pnpm lint', 'pnpm lint || true')),
      ci.replace(LINT, `${LINT}        if: false\n`),
      ci.replace(LINT, `${LINT}        continue-on-error: \${{ true }}\n`),
      ci.replace(LINT, '      - { name: Lint, run: pnpm lint, if: false }\n'),
      ci.replace(LINT, `${LINT}      - name: Lint encore\n        run: pnpm lint\n`),
      ci.replace('  gate-a:\n', '  gate-a:\n    if: false\n'),
      // Une clé de job posée APRÈS la liste des étapes est une clé du job.
      `${ci}    if: false\n`,
      ci.replace(
        '    steps:\n',
        '    defaults:\n      run:\n        shell: true {0}\n    steps:\n'
      ),
      ci.replace(
        '        run: pnpm gov:conventions\n',
        '        run: pnpm gov:conventions\n        shell: true {0}\n'
      ),
      `${ci}defaults:\n  run:\n    shell: true {0}\n`,
      // Une clé déclarée qui manque au job : la liste et le workflow divergent.
      ci.replace('    permissions:\n      contents: read\n      pull-requests: read\n', ''),
    ];
    for (const d of desarmes) {
      expect(d).not.toBe(ci);
      expect(fautesDActe(await lireYaml(d)), d.slice(-200)).toHaveLength(1);
    }
    // Et ce que l'analyseur refuse de lire ne passe pas pour une Gate A saine.
    await expect(lireYaml(`${ci}jobs: {}\n`)).rejects.toThrow();
    await expect(lireYaml(ci.replace('    steps:\n', '    steps: &e\n'))).rejects.toThrow();
  });

  it('sur l’arbre RÉEL, ni `outillage_non_epingle` ni `lint_non_bloquant` ne rougissent', () => {
    // Les deux familles jugées sur les fichiers du disque, et pas seulement sur la vue de
    // référence : c'est la seule forme qui aurait attrapé l'état d'hier — des étapes absentes et
    // des paquets absents s'accordaient parfaitement, et cet accord-là EST le faux vert.
    const vue = variante({
      workflows: [{ chemin: CI, source: ci }],
      packageJson: readFileSync(PACKAGE, 'utf8'),
    });
    expect(familles(vue)).toEqual([]);
  });

  it('chaque exclusion de `.prettierignore` porte un motif — et il y en a au moins une', () => {
    // « Tout écart restant porte une dérogation NOMMÉE et motivée — jamais une règle désactivée
    // en bloc » (acceptation de GOV-031). Une ligne d'ignore sans phrase au-dessus est une règle
    // éteinte dont plus personne ne saura pourquoi.
    const vues = exclusionsDe(readFileSync(IGNORE_PRETTIER, 'utf8'));
    expect(vues.length).toBeGreaterThan(0);
    expect(vues.filter((e) => !e.motive).map((e) => `${e.motif} (ligne ${e.ligne})`)).toEqual([]);
  });

  it('`exclusionsDe` SAIT rougir : une exclusion nue, qui emprunte un motif, ou motivée par des tirets', () => {
    const nu = ['# court', 'docs/'].join('\n');
    expect(exclusionsDe(nu)).toEqual([{ ligne: 2, motif: 'docs/', motive: false }]);
    const motive = [
      '# Les vues dérivées ne se reformatent pas : une garde compare le disque au texte que leur',
      '# script produit, et Prettier ferait rougir la comparaison sans qu’aucun humain n’ait agi.',
      'docs/',
    ].join('\n');
    expect(exclusionsDe(motive)[0]?.motive).toBe(true);
    // Deux entrées, un seul motif : la seconde n'en a pas.
    expect(exclusionsDe(`${motive}\n**/*`).map((e) => e.motive)).toEqual([true, false]);
    // Une ligne vide détache le motif de son entrée.
    expect(exclusionsDe(motive.replace('\ndocs/', '\n\ndocs/'))[0]?.motive).toBe(false);
    // Une longueur n'est pas une phrase.
    expect(exclusionsDe(`# ${'─'.repeat(70)}\n# ${'─'.repeat(70)}\ndocs/`)[0]?.motive).toBe(false);
  });

  it('`prettier --check .` lit EXACTEMENT les fichiers suivis hors dérogations, avec les options racine', async () => {
    // La forme d'une exclusion ne dit pas sa LARGEUR : `**/*` sous un motif valable éteint le format
    // du dépôt entier, et l'outil saute aussi des dossiers PAR DÉFAUT. On demande donc au binaire
    // installé ce qu'il lit, et on le confronte aux fichiers suivis et à la liste déclarée. Une
    // configuration posée dans un sous-dossier change les options d'un fichier sans toucher la racine.
    const suivis = fichiersSuivis();
    const mesures = await mesurerPrettier(suivis);
    expect(fautesPrettier(mesures, suivis)).toEqual([]);
    // RM-02 : chaque désarmement, dérivé des mesures RÉELLES par une variation (RM-11).
    const lu = mesures.find((m) => m.lu)!;
    const deroge = mesures.find((m) => m.sait && !m.lu)!;
    const avec = (cible: MesurePrettier, variation: Partial<MesurePrettier>) =>
      mesures.map((m) => (m === cible ? { ...m, ...variation } : m));
    const temoins: [MesurePrettier[], string][] = [
      [avec(lu, { lu: false }), `${lu.fichier} : \`prettier --check .\` ne le lit pas`],
      [avec(deroge, { lu: true }), `${deroge.fichier} : déclaré hors format, et lu`],
      [
        avec(lu, { options: { requirePragma: true } }),
        `${lu.fichier} : options autres que celles de ${PRETTIER}`,
      ],
      [mesures.slice(1), `${suivis[0]} : non mesuré`],
      [
        mesures.map((m) =>
          m.fichier.startsWith('packages/contracts/') ? { ...m, sait: false } : m
        ),
        'packages/contracts/ : dérogation qui ne couvre aucun fichier suivi',
      ],
    ];
    for (const [variante, attendue] of temoins) {
      expect(fautesPrettier(variante, suivis)).toEqual([attendue]);
    }
  }, 600_000);

  it('l’ACTE de Gate A, lancé sur un arbre porteur d’une faute, sort en 1 en la nommant — et sa mesure SAIT rendre 0', () => {
    // Le verrou fige un binaire ET ses correctifs ; il ne dit pas ce que l'étape FAIT d'une faute. On
    // lance donc `pnpm lint` et `pnpm format:check` eux-mêmes, sur les fichiers suivis plus une faute.
    const suivis = fichiersSuivis();
    const scripts = Object.keys(SCRIPTS_EXACTS);
    const mesurer = (plantes: Readonly<Record<string, string>>, installe: boolean) => {
      const racine = arbreJetable(
        suivis,
        { [FAUTE_PLANTEE.fichier]: FAUTE_PLANTEE.texte, ...plantes },
        installe
      );
      try {
        return scripts.flatMap((s) => {
          const { code, sortie } = lancerActe(racine, s);
          return fautesDeLActe(s, code, sortie);
        });
      } finally {
        // Le lien d'abord, seul : effacer l'arbre ne doit jamais descendre dans le `node_modules` réel.
        if (installe) unlinkSync(join(racine, 'node_modules'));
        rmSync(racine, { recursive: true, force: true });
      }
    };
    expect(mesurer({}, true)).toEqual([]);
    // RM-02 sur la MESURE : les binaires que `pnpm` trouve sont remplacés par des factices qui sortent
    // en 0 — la mesure doit le rendre, pour chacune des deux étapes.
    const factices = Object.fromEntries(
      scripts.flatMap((s) => {
        const [nom] = binaireDuScript(s);
        return [
          [`node_modules/.bin/${nom}`, '#!/bin/sh\nexit 0\n'],
          [`node_modules/.bin/${nom}.cmd`, '@exit /b 0\r\n'],
        ];
      })
    );
    expect(mesurer(factices, false)).toEqual(
      scripts.map((s) => `\`pnpm ${s}\` sort en 0 sur ${FAUTE_PLANTEE.fichier} sans la nommer`)
    );
    // Et le jugement refuse un échec qui ne nomme pas la faute.
    expect(fautesDeLActe('lint', 1, '')).toEqual([
      `\`pnpm lint\` sort en 1 sur ${FAUTE_PLANTEE.fichier} sans la nommer`,
    ]);
  }, 600_000);
});

// ── GOV-031 · REQ-GOV-018 — ce que la configuration ESLint FAIT, sur chaque fichier suivi ────────
//
// Le texte d'une configuration ne dit pas ce qu'elle fait : `'no-console': 0` vaut `'off'`, un bloc
// sans `files:` s'applique partout, ESLint lit une configuration posée dans un sous-dossier pour les
// fichiers de ce dossier, une entrée d'`ignores` — ou une exclusion PAR DÉFAUT de l'outil — retire un
// dossier, et `linterOptions` se rouvre par bloc. On demande donc à ESLint ce qu'il applique à CHAQUE
// fichier suivi — UN calcul, sans échantillon —, et on le juge : tout fichier de code est lu, avec la
// configuration racine seule, le socle importé des mêmes paquets que `eslint.config.mjs` (RM-01) et
// `noInlineConfig` ; les interdits du produit ROUGISSENT sur une faute posée au chemin même du fichier
// là où ils s'appliquent, et nulle part ailleurs. Ce que `pnpm lint` fait de ces erreurs est jugé par
// le témoin d'acte du bloc précédent.

type ConfigEffective = {
  rules?: Record<string, unknown>;
  linterOptions?: { noInlineConfig?: boolean };
};

const GRAVITES: Record<string, number> = { off: 0, warn: 1, error: 2 };

/** La gravité numérique d'une entrée de règle, quelle que soit son écriture. */
function gravite(entree: unknown): number {
  const g: unknown = Array.isArray(entree) ? entree[0] : entree;
  return typeof g === 'number' ? g : (GRAVITES[String(g)] ?? 0);
}

/**
 * Les fichiers de CODE de ce dépôt : la famille JavaScript et TypeScript. Tapée EXPRÈS, et confrontée
 * dans les deux sens à ce que le socle ESLint lit : un fichier de code qu'il ne lit pas — posé sous une
 * exclusion par défaut de l'outil, ou d'une extension qu'il ne connaît pas — rougit, et un fichier lu
 * hors de cette famille aussi.
 */
const FICHIER_DE_CODE = /\.[cm]?[jt]sx?$/;

/** Chaque méthode de `console`, DÉRIVÉE du runtime : la méthode employée est indifférente à la fuite. */
const METHODES_DE_CONSOLE = Object.entries(console)
  .filter(([, v]) => typeof v === 'function')
  .map(([k]) => k);

/**
 * Les interdits qui protègent le produit, et où ils s'appliquent. Oracle tapé de la politique qu'écrit
 * `eslint.config.mjs`, jugé par l'EFFET dans les deux sens : là où l'interdit s'applique, CHAQUE ligne
 * de sa faute, posée au chemin du fichier, rend une ERREUR de sa règle ; ailleurs, aucune ne rend de
 * message. Une sévérité rétrogradée, une option qui l'élargit ou un sélecteur vidé rendent tous le même
 * silence ; un périmètre décrit ici plus étroit ou plus large que l'effet rougit.
 */
const INTERDITS: readonly {
  readonly regle: string;
  readonly lignes: readonly string[];
  readonly couvre: (f: string) => boolean;
}[] = [
  // REQ-DM-041 : un `console.*` oublié dans du code de produit est une fuite de données personnelles.
  // `scripts/` et `tests/` IMPRIMENT leur verdict : dérogation de `eslint.config.mjs`.
  {
    regle: 'no-console',
    lignes: METHODES_DE_CONSOLE.map((k) => `console.${k}('courriel');`),
    couvre: (f) => !/^(?:scripts|tests)\//.test(f),
  },
  // `docs/gates.json` : « imports interdits sous src/domain, new Date() interdit dans le domaine ».
  {
    regle: 'no-restricted-syntax',
    lignes: ['export const maintenant = new Date();'],
    couvre: (f) => f.startsWith('src/domain/'),
  },
  {
    regle: 'no-restricted-imports',
    lignes: ["import 'node:fs';"],
    couvre: (f) => f.startsWith('src/domain/'),
  },
];

/**
 * Les règles du socle ÉTEINTES, et où ; les fichiers suivis qu'ESLint ignore. Listes tapées EXPRÈS :
 * leur divergence avec l'effet de `eslint.config.mjs` est le signal, dans les deux sens — une extinction
 * hors de son chemin déclaré rougit, une règle armée sur son chemin déclaré aussi.
 */
const SOCLE_ETEINT_DECLARE: readonly (readonly [string, (f: string) => boolean])[] = [
  ['@typescript-eslint/no-require-imports', (f) => /^scripts\/.*\.js$/.test(f)],
  [
    'no-control-regex',
    (f) =>
      f === 'scripts/lot/corps-de-pr.ts' ||
      f === 'tests/unit/gouvernance/tete-de-pr-concorde.spec.ts',
  ],
];
const IGNORES_DECLARES = ['scripts/lot/lot.workflow.js'];

/** Ce qu'ESLint fait d'un fichier suivi : tout ce que le jugement lit, et rien d'autre. */
interface MesureEslint {
  readonly fichier: string;
  /** Le socle recommandé, importé des paquets de la configuration ; `undefined` s'il ne lit pas ce fichier. */
  readonly socle: ConfigEffective | undefined;
  /** Ce que `eslint .` applique ; `undefined` si le fichier est ignoré. */
  readonly config: ConfigEffective | undefined;
  /** Ce que la configuration racine SEULE appliquerait : un écart est une configuration imbriquée. */
  readonly racine: ConfigEffective | undefined;
  /** Les règles qui rendent un message sur le fichier tel qu'il est. */
  readonly rendues: readonly string[];
  /** Pour chaque interdit, la gravité que rend chaque ligne de sa faute posée à ce chemin (0 : aucune). */
  readonly gravites: Readonly<Record<string, readonly number[]>>;
}

async function mesurerEslint(suivis: readonly string[]): Promise<MesureEslint[]> {
  const eslint = new ESLint();
  const racine = new ESLint({ overrideConfigFile: ESLINT });
  const socle = new ESLint({
    overrideConfigFile: true,
    overrideConfig: tseslint.config(
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettierEslint
    ) as Linter.Config[],
  });
  // Une configuration calculée se sérialise par son propre `toJSON` (greffons et analyseurs par leur
  // nom) : c'est cette forme plate qui est mesurée, comparée, et variée par les témoins.
  const plate = async (e: ESLint, f: string): Promise<ConfigEffective | undefined> => {
    const c: unknown = await e.calculateConfigForFile(f);
    return c === undefined ? undefined : (JSON.parse(JSON.stringify(c)) as ConfigEffective);
  };
  const mesures: MesureEslint[] = [];
  for (const fichier of suivis) {
    const reference = await plate(socle, fichier);
    const config = reference === undefined ? undefined : await plate(eslint, fichier);
    const enWarn = Object.values(config?.rules ?? {}).some((v) => gravite(v) === 1);
    const rendues = enWarn
      ? ((await eslint.lintFiles([fichier]))[0]?.messages ?? []).map((m) => m.ruleId ?? '')
      : [];
    mesures.push({
      fichier,
      socle: reference,
      config,
      racine: reference === undefined ? undefined : await plate(racine, fichier),
      rendues,
      gravites: config === undefined ? {} : await gravitesDe(eslint, fichier),
    });
  }
  return mesures;
}

/** Pour chaque interdit, la gravité que rend chaque ligne de sa faute, posée au chemin du fichier. */
async function gravitesDe(eslint: ESLint, fichier: string): Promise<Record<string, number[]>> {
  const gravites: Record<string, number[]> = {};
  for (const { regle, lignes } of INTERDITS) {
    const [r] = await eslint.lintText(`${lignes.join('\n')}\n`, { filePath: fichier });
    const messages = (r?.messages ?? []).filter((m) => m.ruleId === regle);
    gravites[regle] = lignes.map((_, n) =>
      Math.max(0, ...messages.filter((m) => m.line === n + 1).map((m) => m.severity))
    );
  }
  return gravites;
}

/** Le jugement, séparé de la mesure : fonction PURE (RM-11), pour que ses témoins soient fabriqués. */
function fautesEslint(mesures: readonly MesureEslint[], suivis: readonly string[]): string[] {
  const fautes: string[] = [];
  const mesures_ = new Set(mesures.map((m) => m.fichier));
  for (const f of suivis) if (!mesures_.has(f)) fautes.push(`${f} : non mesuré`);
  for (const m of mesures) {
    const f = m.fichier;
    if (FICHIER_DE_CODE.test(f) !== (m.socle !== undefined)) {
      const cause =
        m.socle === undefined ? 'code que le socle ESLint ne lit pas' : 'lu hors du code';
      fautes.push(`${f} : ${cause}`);
    }
    if (m.socle === undefined) continue;
    if ((m.config === undefined) !== IGNORES_DECLARES.includes(f)) {
      fautes.push(`${f} : ${m.config === undefined ? 'ignoré' : 'déclaré ignoré, et lu'}`);
    }
    if (m.config === undefined) continue;
    if (JSON.stringify(m.config) !== JSON.stringify(m.racine)) {
      fautes.push(`${f} : configuration imbriquée`);
    }
    if (m.config.linterOptions?.noInlineConfig !== true) fautes.push(`${f} : noInlineConfig`);
    // Une règle tolérée en `warn` ne l'est que là où elle rend ENCORE un avertissement : la dette
    // nommée fichier par fichier ne peut que rétrécir.
    for (const [regle, valeur] of Object.entries(m.config.rules ?? {})) {
      if (gravite(valeur) === 1 && !m.rendues.includes(regle)) {
        fautes.push(`${f} : ${regle} tolérée en warn sans avertissement`);
      }
    }
    for (const [regle, valeur] of Object.entries(m.socle.rules ?? {})) {
      if (gravite(valeur) === 0 || gravite(m.config.rules?.[regle]) > 0) continue;
      if (!SOCLE_ETEINT_DECLARE.some(([r, couvre]) => r === regle && couvre(f))) {
        fautes.push(`${f} : ${regle} éteinte`);
      }
    }
    for (const [regle, couvre] of SOCLE_ETEINT_DECLARE) {
      if (couvre(f) && gravite(m.config.rules?.[regle]) > 0) {
        fautes.push(`${f} : ${regle} déclarée éteinte, et armée`);
      }
    }
    for (const { regle, lignes, couvre } of INTERDITS) {
      const attendue = couvre(f) ? 2 : 0;
      if (lignes.some((_, n) => (m.gravites[regle]?.[n] ?? -1) !== attendue)) {
        const ecart =
          attendue === 2 ? 'ne rougit pas sur toute sa faute' : 'rougit hors de son périmètre';
        fautes.push(`${f} : ${regle} ${ecart}`);
      }
    }
  }
  // Chaque déclaration désigne ce qu'elle déclare, et chaque interdit s'applique quelque part.
  const lus = mesures.filter((m) => m.config !== undefined);
  for (const d of IGNORES_DECLARES) {
    if (!mesures.some((m) => m.fichier === d && m.socle !== undefined)) {
      fautes.push(`${d} : ignore déclaré qui ne désigne aucun fichier lisible`);
    }
  }
  for (const [regle, couvre] of SOCLE_ETEINT_DECLARE) {
    if (!lus.some((m) => couvre(m.fichier)))
      fautes.push(`${regle} : extinction qui ne couvre rien`);
  }
  for (const { regle, couvre } of INTERDITS) {
    if (!lus.some((m) => couvre(m.fichier)))
      fautes.push(`${regle} : ne s'applique à aucun fichier`);
  }
  return fautes;
}

describe('REQ-GOV-018 — ce que la configuration ESLint FAIT, sur chaque fichier suivi', () => {
  type Releve = { suivis: string[]; mesures: MesureEslint[] };
  let releve: Promise<Releve> | undefined;
  const mesurer = (): Promise<Releve> =>
    (releve ??= (async () => {
      const suivis = fichiersSuivis();
      return { suivis, mesures: await mesurerEslint(suivis) };
    })());

  it('tout fichier de code suivi est lu avec la configuration racine seule, le socle et `noInlineConfig`, ses interdits ROUGISSENT là et seulement là', async () => {
    const { suivis, mesures } = await mesurer();
    expect(mesures.filter((m) => m.config !== undefined).length).toBeGreaterThan(0);
    expect(fautesEslint(mesures, suivis)).toEqual([]);
  }, 600_000);

  it('`fautesEslint` SAIT rougir : chaque désarmement, dérivé des mesures RÉELLES par une variation', async () => {
    // RM-02, sur les mesures du dépôt et non sur une vue inventée (RM-11) : une mesure change, et le
    // jugement doit nommer exactement la faute qu'elle porte.
    const { suivis, mesures } = await mesurer();
    const cible = mesures.find(
      (m) => m.config !== undefined && m.fichier.startsWith('src/domain/')
    );
    const voisin = mesures.find(
      (m) => m.config !== undefined && /^scripts\/.*\.js$/.test(m.fichier)
    );
    const ignore = mesures.find((m) => m.fichier === IGNORES_DECLARES[0]);
    expect([cible, voisin, ignore].includes(undefined), 'mesure de référence absente').toBe(false);
    const c = cible!.config!;
    const f = cible!.fichier;
    const regleDuSocle = Object.keys(cible!.socle?.rules ?? {}).find(
      (r) => gravite(cible!.socle?.rules?.[r]) > 0
    )!;
    type Temoin = [MesureEslint[], string[], string[]];
    const avec = (m0: MesureEslint, variation: Partial<MesureEslint>): Temoin => [
      mesures.map((m) => (m === m0 ? { ...m, ...variation } : m)),
      suivis,
      [],
    ];
    const regles = (m0: MesureEslint, rules: Record<string, unknown>) => {
      const config = { ...m0.config, rules: { ...m0.config?.rules, ...rules } };
      return avec(m0, { config, racine: config });
    };
    const sans = (garde: (x: string) => boolean): Temoin => [
      mesures.filter((m) => garde(m.fichier)),
      suivis.filter(garde),
      [],
    ];
    const attendre = ([m, s]: Temoin, ...attendues: string[]): Temoin => [m, s, attendues];
    // La MESURE aussi est éprouvée : `no-console` rétrogradé en `warn`, ou élargi à une méthode de
    // `console`, est mesuré par ESLint lui-même au chemin du fichier réel, puis jugé.
    const surcharge = (entree: Linter.RuleEntry) =>
      gravitesDe(new ESLint({ overrideConfig: { rules: { 'no-console': entree } } }), f);
    const fuiteNonRougie = `${f} : no-console ne rougit pas sur toute sa faute`;
    const temoins: Temoin[] = [
      attendre(avec(cible!, { gravites: await surcharge('warn') }), fuiteNonRougie),
      attendre(
        avec(cible!, { gravites: await surcharge(['error', { allow: ['error'] }]) }),
        fuiteNonRougie
      ),
      attendre(avec(cible!, { config: undefined }), `${f} : ignoré`),
      attendre(
        avec(cible!, { socle: undefined, config: undefined }),
        `${f} : code que le socle ESLint ne lit pas`
      ),
      attendre([mesures.filter((m) => m !== cible), suivis, []], `${f} : non mesuré`),
      attendre(avec(cible!, { racine: { ...c, rules: {} } }), `${f} : configuration imbriquée`),
      attendre(
        avec(cible!, { config: { ...c, linterOptions: {} }, racine: { ...c, linterOptions: {} } }),
        `${f} : noInlineConfig`
      ),
      attendre(regles(cible!, { [regleDuSocle]: 'off' }), `${f} : ${regleDuSocle} éteinte`),
      attendre(
        regles(cible!, { [regleDuSocle]: 'warn' }),
        `${f} : ${regleDuSocle} tolérée en warn sans avertissement`
      ),
      attendre(
        avec(voisin!, { gravites: { ...voisin!.gravites, 'no-restricted-syntax': [2] } }),
        `${voisin!.fichier} : no-restricted-syntax rougit hors de son périmètre`
      ),
      attendre(
        avec(ignore!, {
          config: voisin!.config,
          racine: voisin!.racine,
          rendues: voisin!.rendues,
          gravites: voisin!.gravites,
        }),
        `${ignore!.fichier} : déclaré ignoré, et lu`
      ),
      attendre(
        sans((x) => x !== ignore!.fichier),
        `${ignore!.fichier} : ignore déclaré qui ne désigne aucun fichier lisible`
      ),
      attendre(
        sans((x) => !x.startsWith('src/domain/')),
        "no-restricted-syntax : ne s'applique à aucun fichier",
        "no-restricted-imports : ne s'applique à aucun fichier"
      ),
    ];
    for (const [regle, couvre] of SOCLE_ETEINT_DECLARE) {
      // Éteinte hors de son chemin déclaré ; armée sur son chemin déclaré.
      temoins.push(attendre(regles(cible!, { [regle]: 'off' }), `${f} : ${regle} éteinte`));
      const couvert = mesures.find((m) => m.config !== undefined && couvre(m.fichier))!;
      temoins.push(
        attendre(
          regles(couvert, { [regle]: 'error' }),
          `${couvert.fichier} : ${regle} déclarée éteinte, et armée`
        )
      );
    }
    // Une extinction qui ne couvre plus aucun fichier lu (choisie hors des fichiers ignorés).
    const [morte, couvreMorte] = SOCLE_ETEINT_DECLARE.find(([, p]) => !IGNORES_DECLARES.some(p))!;
    temoins.push(
      attendre(
        sans((x) => !couvreMorte(x)),
        `${morte} : extinction qui ne couvre rien`
      )
    );
    // Le jugement doit AJOUTER exactement les fautes de la variation : le témoin ne dépend pas de ce
    // que l'arbre porte déjà, et c'est le test précédent qui dit si l'arbre est sain.
    const deja = new Set(fautesEslint(mesures, suivis));
    for (const [variante, suivisVariante, attendues] of temoins) {
      const neuves = fautesEslint(variante, suivisVariante).filter((x) => !deja.has(x));
      expect(neuves).toEqual(attendues);
    }
  }, 600_000);
});
