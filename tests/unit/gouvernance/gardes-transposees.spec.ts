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
 * ⚠️ CE PARAGRAPHE A ÉTÉ RETIRÉ LE 2026-09-14, PAR GOV-031. Il disait : « ce fichier ne juge pas
 * `.github/workflows/ci.yml` ni `package.json` : ce sont des fichiers PARTAGÉS, que le
 * développeur n'écrit pas ; les étapes de lint et de format et les dépendances épinglées sont
 * rendues en texte dans la PR ». La prudence était juste tant que rien ne les touchait — et elle
 * est devenue le mécanisme par lequel GOV-031 restait VERTE en ne livrant qu'un item sur quatre.
 * Les étapes et les dépendances ne sont plus « rendues en texte » : elles sont ÉCRITES, et le
 * dernier bloc de ce fichier les juge sur le disque. Ce qui reste vrai de la phrase d'origine,
 * c'est que la COHÉRENCE (bloquantes, épinglées) se prouve sur des vues INJECTÉES (RM-11) ; ce
 * qui était faux, c'est que la PRÉSENCE pouvait attendre indéfiniment sans que rien ne le dise.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, delimiter, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { ESLint, type Linter } from 'eslint';
import { getFileInfo } from 'prettier';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierEslint from 'eslint-config-prettier';
import {
  controler,
  perimetresDe,
  etapesDeLint,
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
// configuration FAIT — la sévérité effective d'une règle sur un fichier, et l'échec réel de
// `pnpm lint` sur une faute — est jugé par le dernier bloc de ce fichier, qui charge ESLint.
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
  /** Un commentaire `//` d'au moins 60 caractères dans les 12 lignes qui précèdent. */
  readonly motive: boolean;
  /** Le bloc qui la porte déclare un `files:` — donc un périmètre nommé, pas tout le dépôt. */
  readonly perimetreNomme: boolean;
}

const MOTIF_MINIMAL_ESLINT = 60;
const FENETRE_MOTIF = 12;

/**
 * Fonction PURE d'un texte injecté (RM-11) : elle ne lit pas le disque, donc ses témoins ne
 * dépendent pas de l'état du dépôt le jour où ils tournent.
 */
function derogationsDe(source: string): Derogation[] {
  const lignes = source.split('\n');
  const out: Derogation[] = [];
  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i] ?? '';
    if (ligne.trim().startsWith('//') || ligne.trim().startsWith('*')) continue;
    // Les QUATRE écritures d'une sévérité rétrogradée, et pas seulement la chaîne : `0` et `1`
    // valent `'off'` et `'warn'` pour ESLint. Ne lire que `'off'` laissait `'no-console': 0`
    // passer au vert (survivante S4 de la revue de mutation du 2026-09-14).
    const retrogradee = /['"]([a-z@][^'"]*)['"]\s*:\s*\[?\s*(?:['"](off|warn)['"]|([01])\b)/g;
    for (const m of ligne.matchAll(retrogradee)) {
      let motive = false;
      let perimetreNomme = false;
      for (let j = i - 1; j >= 0 && i - j <= FENETRE_MOTIF; j -= 1) {
        const p = (lignes[j] ?? '').trim();
        if (p.startsWith('//') && p.length >= MOTIF_MINIMAL_ESLINT) motive = true;
      }
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
        motive,
        perimetreNomme,
      });
    }
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

  it('`scripts/lot/lot.workflow.js` est IGNORÉ, et le fichier dit pourquoi', () => {
    // Ce n'est pas du JavaScript à corriger : c'est un langage dédié dont `args`, `agent`,
    // `phase`, `log`, `pipeline` et `parallel` sont injectés par le moteur qui l'exécute.
    // 15 `no-undef` qu'aucun correctif de code ne peut faire disparaître : c'est un `ignores`.
    const lignes = config.split('\n');
    const i = lignes.findIndex((l) => /^\s*'scripts\/lot\/lot\.workflow\.js',\s*$/.test(l));
    expect(i, "`scripts/lot/lot.workflow.js` n'est pas une entrée de `ignores`").toBeGreaterThan(0);
    // Le motif se lit AU-DESSUS de l'entrée, pas ailleurs dans le fichier : un `ignores` dont
    // la justification vit trois écrans plus haut est un `ignores` sans justification.
    expect(lignes.slice(Math.max(0, i - 8), i).join('\n')).toMatch(/langage dédié|symboles/i);
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
    expect(vues.length).toBeGreaterThanOrEqual(4);
    expect(vues.filter((d) => !d.motive).map((d) => `${d.regle} (ligne ${d.ligne})`)).toEqual([]);
  });

  it('`derogationsDe` SAIT rougir : une règle éteinte sans motif est vue', () => {
    // RM-02. Sans ce témoin fabriqué, les deux `it` ci-dessus seraient verts sur une fonction
    // qui ne trouve jamais rien.
    const nu = [
      'export default [',
      '  {',
      "    files: ['tests/**'],",
      '    rules: {',
      "      'no-console': 'off',",
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

    // Le même texte avec un motif collé au-dessus : la fonction discrimine, elle ne dit pas
    // « non motivé » à tout le monde.
    const motive = nu.replace(
      '    rules: {',
      "    // Les tests IMPRIMENT leur verdict : c'est leur interface, et une suite muette ne\n    // rapporte rien de ce qu'elle a balayé.\n    rules: {"
    );
    expect(derogationsDe(motive)[0]!.motive).toBe(true);

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

    // Et les écritures NUMÉRIQUES sont des dérogations comme les autres : `0`, `[1]`, `"off"`.
    for (const ecriture of ['0', '[0]', '1', '[1, {}]', '"off"', '["warn"]']) {
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
// CE BLOC CONTREDIT L'EN-TÊTE QUE CE FICHIER PORTAIT, ET C'EST LE POINT. GOV-014 y a écrit :
// « il ne juge pas `.github/workflows/ci.yml` ni `package.json` : ce sont des fichiers PARTAGÉS,
// que le développeur n'écrit pas ». La prudence était juste tant que rien ne les touchait. Elle
// est devenue le mécanisme par lequel GOV-031 restait VERTE en ne livrant qu'un item sur quatre :
// la famille `outillage_non_epingle` ne s'arme QUE si une étape de CI lance l'outil, et
// l'acceptation le dit elle-même — « sans étape, rien ne ment ». Rien ne ment, et rien ne garde.
// Une branche qui n'ajoute rien qui puisse rougir n'est pas verte, elle est vide.
//
// ⚖️ L'ARBITRAGE, ÉCRIT PLUTÔT QUE TU. L'acceptation de GOV-031 dit « les 5 devDependencies »
// SANS LES NOMMER. Il en faut SIX, et ce n'est pas un avis : `eslint.config.mjs` importe
// `@eslint/js`, `globals`, `typescript-eslint` et `eslint-config-prettier` — quatre — et les
// scripts `lint` et `format:check` lancent deux BINAIRES de plus, `eslint` et `prettier`, dont
// aucun n'est la dépendance directe des quatre premiers. Le « 5 » est un flou de l'acceptation.
// Ce test ne le tranche pas par un chiffre écrit à la main : il DÉRIVE la liste de ses deux
// sources (RM-01), si bien qu'ajouter un plugin à la configuration ajoute son exigence tout seul.

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
  /** Le bloc `#` COLLÉ au-dessus de l'entrée porte au moins 60 caractères de texte. */
  readonly motive: boolean;
}

/**
 * Le motif d'une entrée est le bloc de commentaire COLLÉ au-dessus d'elle : il s'arrête à la
 * première ligne vide et à la première autre entrée. La version précédente acceptait tout
 * commentaire long dans les douze lignes au-dessus — un seul paragraphe « motivait » alors
 * plusieurs entrées, y compris une entrée nue posée dessous (survivante S2 de la revue de
 * mutation du 2026-09-14). Fonction PURE d'un texte injecté (RM-11).
 */
function exclusionsDe(source: string): Exclusion[] {
  const lignes = source.split('\n');
  const out: Exclusion[] = [];
  lignes.forEach((brute, i) => {
    const entree = brute.trim();
    if (entree === '' || entree.startsWith('#')) return;
    const bloc: string[] = [];
    for (let j = i - 1; j >= 0 && (lignes[j] ?? '').trim().startsWith('#'); j -= 1) {
      bloc.push((lignes[j] ?? '').trim().replace(/^#+\s*/, ''));
    }
    const motive = bloc.join(' ').trim().length >= MOTIF_MINIMAL_ESLINT;
    out.push({ ligne: i + 1, motif: entree, motive });
  });
  return out;
}

/**
 * Ce que FAIT chaque étape de lint, et pas l'absence d'un mot. Une étape se désarme sans écrire
 * `continue-on-error: true` : `run: pnpm lint || true`, un `if: false`, un
 * `continue-on-error: ${{ true }}` (survivante S1 de la revue de mutation du 2026-09-14). La seule
 * forme admise est donc la forme EXACTE — `- name: …`, puis `run: pnpm lint` ou
 * `run: pnpm format:check`, et rien d'autre —, dans un job `gate-a` sans `if:` ni
 * `continue-on-error:`. Le prédicat de `gov-conventions.ts` n'est pas recopié : il est dépassé.
 */
function fautesDActe(ci: string): string[] {
  const fautes: string[] = [];
  for (const e of etapesDeLint({ ...VUE_CONFORME, workflows: [{ chemin: CI, source: ci }] })) {
    const lignes = e.bloc
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    const [nom, run, ...reste] = lignes;
    const exacte =
      /^- name: \S/.test(nom ?? '') &&
      (run === 'run: pnpm lint' || run === 'run: pnpm format:check') &&
      reste.length === 0;
    if (!exacte) fautes.push(lignes.join(' ⏎ '));
  }
  const entete = /^ {2}gate-a:\n([\s\S]*?)^ {4}steps:/m.exec(ci);
  if (entete === null) fautes.push('job `gate-a` introuvable');
  for (const l of (entete?.[1] ?? '').split('\n')) {
    if (/^ {4}(?:if|continue-on-error)\s*:/.test(l)) fautes.push(`gate-a ⏎ ${l.trim()}`);
  }
  return fautes;
}

/** Les lignes de workflow qui INSTALLENT sans figer le verrou. Fonction PURE (RM-11). */
function installationsNonFigees(textes: readonly string[]): {
  installations: number;
  fautives: string[];
} {
  const lignes = textes
    .flatMap((t) => t.split('\n'))
    .filter((l) => !l.trim().startsWith('#') && /\bpnpm\s+(?:install|i|add)\b/.test(l));
  return {
    installations: lignes.length,
    fautives: lignes.filter((l) => !/\s--frozen-lockfile\b/.test(l)).map((l) => l.trim()),
  };
}

/**
 * « Épinglé » : une version, et une seule. `^3.9.6` en est une ; `3 || *`, `*`, `latest` et
 * `>=3` n'en sont pas (survivante S5). Ce qui fige RÉELLEMENT la version installée reste le
 * verrou lu avec `--frozen-lockfile`, et c'est pourquoi les deux sont exigés.
 */
const VERSION_EPINGLEE = /^[\^~]?\d+\.\d+\.\d+$/;

/**
 * Les dérogations de format DÉCLARÉES. Liste tapée ici EXPRÈS : c'est sa DIVERGENCE avec
 * `.prettierignore` qui est le signal. Une entrée qui déborde de sa mesure — `src/`, `*.ts`,
 * `**\/*`, un `packages/` élargi, un fichier de code posé sous une racine dérogée — fait ignorer
 * un fichier que cette liste ne couvre pas ; une entrée retirée fait formater un fichier qu'elle
 * couvre. Les deux rougissent (survivantes S2 et S6 de la revue de mutation du 2026-09-14). Ajouter
 * une dérogation demande donc DEUX écritures, dont celle-ci, relue comme un test.
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

/** L'environnement que `pnpm run` donne à un script : les binaires du dépôt en tête du PATH. */
function envAvecLesBinairesDuDepot(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const cle = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  env[cle] = join(process.cwd(), 'node_modules', '.bin') + delimiter + (env[cle] ?? '');
  return env;
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

  it('chaque paquet DÉRIVÉ de la configuration et des scripts est épinglé en devDependencies', () => {
    // Six, pas cinq — et le compte n'est pas écrit ici : il tombe de la dérivation. Les deux
    // binaires sont exigés NOMMÉMENT en plus, parce qu'une dérivation qui perdrait la moitié de
    // sa source rendrait exactement le même vert qu'une dérivation complète.
    const exiges = scriptsExigesParGov031(acceptance);
    const requis = paquetsRequis(config, pkg.scripts ?? {}, exiges);
    expect(requis).toContain('eslint');
    expect(requis).toContain('prettier');
    expect(requis.length).toBeGreaterThanOrEqual(6);
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

  it('chaque `pnpm install` des workflows fige le verrou (`--frozen-lockfile`)', () => {
    // C'est le verrou, lu sans droit de le réécrire, qui fige la version installée : sans le
    // drapeau, `^3.9.6` redevient « la dernière 3.x du jour » (survivante S5). Tous les workflows,
    // pas seulement Gate A : la nightly installe aussi.
    const dossier = '.github/workflows';
    const textes = readdirSync(dossier)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readFileSync(join(dossier, f), 'utf8'));
    const { installations, fautives } = installationsNonFigees(textes);
    expect(installations).toBeGreaterThan(0);
    expect(fautives).toEqual([]);
    // RM-02, sur une ligne fabriquée et sur son contre-témoin.
    expect(installationsNonFigees(['      - run: pnpm install\n']).fautives.length).toBe(1);
    expect(installationsNonFigees(['# pnpm install, en prose\n']).installations).toBe(0);
    expect(
      installationsNonFigees(['      - run: pnpm install --frozen-lockfile\n']).fautives
    ).toEqual([]);
  });

  it('`paquetsRequis` SAIT rougir : un plugin importé et non épinglé est vu', () => {
    // RM-02. Sans ce témoin fabriqué, les deux `it` ci-dessus seraient verts sur une fonction
    // qui ne dérive rien : « aucun paquet manquant » est le verdict d'une liste vide.
    const faux = ["import x from '@eslint/js';", "import y from 'eslint-plugin-inconnu';"].join(
      '\n'
    );
    const requis = paquetsRequis(faux, { lint: 'eslint .', 'format:check': 'prettier --check .' }, [
      'lint',
      'format:check',
    ]);
    expect(requis).toEqual(['@eslint/js', 'eslint', 'eslint-plugin-inconnu', 'prettier']);
    // Et le binaire se dérive bien du SCRIPT : sans script, aucun binaire n'est exigé.
    expect(paquetsRequis(faux, {}, ['lint'])).toEqual(['@eslint/js', 'eslint-plugin-inconnu']);
  });

  it('Gate A lance `pnpm lint` ET `pnpm format:check`', () => {
    // La cohérence que `gov:conventions` vérifie ne s'arme qu'en PRÉSENCE de l'étape. C'est ici,
    // et nulle part ailleurs, que la présence est exigée — sinon la garde reste une intention.
    const etapes = etapesDeLint({ ...VUE_CONFORME, workflows: [{ chemin: CI, source: ci }] });
    expect([...new Set(etapes.map((e) => e.outil))].sort()).toEqual(['eslint', 'prettier']);
  });

  it('l’ACTE des deux étapes est exact — ni `if:`, ni `||`, ni drapeau, ni job qui les désarme', () => {
    // LE point de REQ-GOV-018 : une gate qui ne bloque rien ne garde rien. Chercher le mot
    // `continue-on-error` ne suffisait pas — la revue de mutation a désarmé les deux étapes
    // de quatre façons sans l'écrire.
    expect(fautesDActe(ci)).toEqual([]);
    // RM-02 : chacun de ces désarmements, dérivé de l'arbre RÉEL par UNE substitution (RM-11).
    const LINT = '        run: pnpm lint\n';
    expect(ci).toContain(LINT);
    const desarmes = [
      ci.replace(LINT, '        run: pnpm lint || true\n'),
      ci.replace(LINT, '        if: false\n' + LINT),
      ci.replace(LINT, LINT + '        continue-on-error: ${{ true }}\n'),
      ci.replace('  gate-a:\n', '  gate-a:\n    if: false\n'),
    ];
    for (const d of desarmes) {
      expect(d).not.toBe(ci);
      expect(fautesDActe(d).length).toBe(1);
    }
  });

  it('`pnpm lint` et `pnpm format:check` ÉCHOUENT sur une faute : l’effet du script, pas son texte', () => {
    // `"lint": "eslint . || exit 0"` laisse l'étape exacte et le binaire dérivable, et ne
    // bloque plus rien (survivante S1). Seul un témoin d'EFFET le voit : le script du
    // `package.json` RÉEL est lancé par `pnpm run` dans un banc jetable, propre puis fautif.
    // Le banc porte sa propre configuration minimale : ce qui est jugé, c'est que le script
    // PROPAGE l'échec de l'outil — la configuration du dépôt est jugée plus bas.
    const bancs = [
      {
        script: 'lint',
        decor: { 'eslint.config.mjs': "export default [{ rules: { 'no-debugger': 'error' } }];\n" },
        propre: ['propre.js', 'export const x = 1;\n'],
        faute: ['faute.js', 'debugger;\n'],
      },
      {
        script: 'format:check',
        decor: { '.prettierrc.json': '{}\n', '.editorconfig': 'root = true\n' },
        propre: ['propre.ts', 'export const x = 1;\n'],
        faute: ['faute.ts', 'export   const x =1\n'],
      },
    ] as const;
    for (const b of bancs) {
      const dossier = mkdtempSync(join(tmpdir(), 'gov031-effet-'));
      try {
        const commande = pkg.scripts?.[b.script] ?? '';
        expect(commande, `script « ${b.script} » absent`).not.toBe('');
        const banc = { name: 'banc', private: true, scripts: { [b.script]: commande } };
        writeFileSync(join(dossier, 'package.json'), JSON.stringify(banc, null, 2) + '\n');
        for (const [nom, texte] of Object.entries(b.decor)) {
          writeFileSync(join(dossier, nom), texte);
        }
        writeFileSync(join(dossier, b.propre[0]), b.propre[1]);
        const lancerLeScript = () =>
          spawnSync(`pnpm run ${b.script}`, {
            cwd: dossier,
            shell: true,
            encoding: 'utf8',
            env: envAvecLesBinairesDuDepot(),
          });
        // Contre-témoin d'abord : sans lui, un script qui échoue TOUJOURS passerait ce test.
        const propre = lancerLeScript();
        expect(
          propre.status,
          `${b.script} sur un banc propre :\n${propre.stdout}${propre.stderr}`
        ).toBe(0);
        writeFileSync(join(dossier, b.faute[0]), b.faute[1]);
        const fautif = lancerLeScript();
        expect(
          fautif.status,
          `${b.script} sur une faute :\n${fautif.stdout}${fautif.stderr}`
        ).not.toBe(0);
      } finally {
        rmSync(dossier, { recursive: true, force: true });
      }
    }
  }, 600_000);

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

  it('`exclusionsDe` SAIT rougir : une exclusion nue, ou qui emprunte le motif d’une autre', () => {
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
  });

  it('Prettier ignore EXACTEMENT ce que les dérogations déclarées couvrent — ni plus, ni moins', async () => {
    // La forme d'une exclusion ne dit pas sa LARGEUR : `**/*` sous un motif valable éteint le
    // format du dépôt entier. On demande donc à Prettier lui-même ce qu'il ignore, avec les
    // deux fichiers d'ignore que sa CLI lit par défaut, et on le confronte à la liste déclarée.
    const ignores: string[] = [];
    const attendus: string[] = [];
    for (const f of fichiersSuivis()) {
      // Un fichier que Prettier ne sait pas formater n'est ni dérogé ni formaté.
      if ((await getFileInfo(f)).inferredParser === null) continue;
      const vu = await getFileInfo(f, { ignorePath: ['.gitignore', IGNORE_PRETTIER] });
      if (vu.ignored) ignores.push(f);
      if (HORS_FORMAT_DECLARE.some(([, couvre]) => couvre(f))) attendus.push(f);
    }
    // Témoin non nul : une liste vide des deux côtés serait un accord parfait sur rien.
    expect(attendus.length).toBeGreaterThan(0);
    expect(ignores).toEqual(attendus);
  }, 600_000);
});

// ── GOV-031 · REQ-GOV-018 — ce que la configuration ESLint FAIT, fichier par fichier ────────────
//
// Le texte d'une configuration ne dit pas sa sévérité : `'no-console': 0` vaut `'off'`, un bloc
// sans `files:` s'applique partout, et un `// eslint-disable-next-line` désarme une ligne sans
// toucher la configuration (survivante S4 de la revue de mutation du 2026-09-14). On demande donc à
// ESLint la configuration EFFECTIVE qu'il applique, et on la compare au socle recommandé que
// `eslint.config.mjs` importe — les mêmes paquets, pas une liste de règles retapée (RM-01).

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

describe('REQ-GOV-018 — la sévérité EFFECTIVE, lue dans ESLint et non dans le texte', () => {
  const eslint = new ESLint();
  const socle = new ESLint({
    overrideConfigFile: true,
    overrideConfig: tseslint.config(
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettierEslint
    ) as Linter.Config[],
  });

  it('un fichier NEUF, dans chaque racine de code, reçoit tout le socle, et aucun commentaire ne le désarme', async () => {
    // Un fichier qui n'existe pas encore : c'est lui qu'une dérogation élargie attrape — un
    // `warn` étendu à `scripts/**`, une sévérité `0` posée hors de tout `files:`.
    const neufs = [
      'src/zz-temoin-neuf.ts',
      'packages/zz-temoin-neuf/index.ts',
      'scripts/gates/zz-temoin-neuf.ts',
      'tests/unit/zz-temoin-neuf.spec.ts',
    ];
    const fautes: string[] = [];
    let reglesDuSocle = 0;
    for (const f of neufs) {
      const reel = (await eslint.calculateConfigForFile(f)) as ConfigEffective;
      const ref = (await socle.calculateConfigForFile(f)) as ConfigEffective;
      for (const [regle, valeur] of Object.entries(ref.rules ?? {})) {
        if (gravite(valeur) === 0) continue;
        reglesDuSocle += 1;
        const g = gravite(reel.rules?.[regle]);
        if (g < gravite(valeur)) fautes.push(`${f} : ${regle} ${g} < ${gravite(valeur)}`);
      }
      if (reel.linterOptions?.noInlineConfig !== true) fautes.push(`${f} : noInlineConfig`);
      // `no-console` n'est pas dans le socle : c'est la règle qui porte le motif PII
      // (REQ-DM-041), exigée nommément sur le code du produit.
      if (/^(?:src|packages)\//.test(f) && gravite(reel.rules?.['no-console']) !== 2) {
        fautes.push(`${f} : no-console ${gravite(reel.rules?.['no-console'])} ≠ 2`);
      }
    }
    expect(reglesDuSocle).toBeGreaterThan(0);
    expect(fautes).toEqual([]);
  }, 600_000);

  it('une règle tolérée en `warn` ne l’est que dans un fichier où elle rend ENCORE un avertissement', async () => {
    // La dette nommée fichier par fichier ne peut que rétrécir : un fichier corrigé qui reste
    // dans la liste est une dérogation plus large que sa mesure, et elle rougit ici.
    const tolerees = new Map<string, string[]>();
    for (const f of fichiersSuivis('scripts', 'tests', 'src', 'packages')) {
      if (!/\.(?:ts|js|mjs|cjs)$/.test(f)) continue;
      const c = (await eslint.calculateConfigForFile(f)) as ConfigEffective | undefined;
      const enWarn = Object.entries(c?.rules ?? {})
        .filter(([, v]) => gravite(v) === 1)
        .map(([r]) => r);
      if (enWarn.length > 0) tolerees.set(f, enWarn);
    }
    expect(tolerees.size).toBeGreaterThan(0);
    const muettes: string[] = [];
    for (const r of await eslint.lintFiles([...tolerees.keys()])) {
      const f = relative(process.cwd(), r.filePath).split(sep).join('/');
      const regles = tolerees.get(f) ?? [];
      if (!r.messages.some((m) => m.ruleId !== null && regles.includes(m.ruleId))) {
        muettes.push(`${f} : ${regles.join(', ')}`);
      }
    }
    expect(muettes).toEqual([]);
  }, 600_000);
});
