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
 * CE QUE CE FICHIER NE FAIT PAS. Il ne juge pas `.github/workflows/ci.yml` ni `package.json` :
 * ce sont des fichiers PARTAGÉS, que le développeur n'écrit pas. Les étapes de lint et de format
 * et les dépendances épinglées sont rendues en texte dans la PR. Ce qui est vérifié ici, c'est
 * que la garde SAIT les juger le jour où elles arrivent — sur des vues INJECTÉES (RM-11), donc
 * sans dépendre de l'état du dépôt le jour où le test tourne (LEC-13).
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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
